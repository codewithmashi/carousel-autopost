#!/usr/bin/env python3
"""
Publish a slide carousel to Instagram + X via Buffer.

Runs inside GitHub Actions. Slides are served straight from the repo over
raw.githubusercontent.com, pinned to the commit SHA so the URL stays valid
forever (Buffer requires public, direct, stable HTTPS URLs).

Expected layout of the queue directory:
    queue/YYYY-MM-DD/slide_1.png ... slide_N.png
    queue/YYYY-MM-DD/caption_instagram.txt
    queue/YYYY-MM-DD/caption_x.txt

Environment
-----------
  BUFFER_TOKEN        Buffer API key                (GitHub Actions secret)
  GITHUB_REPOSITORY   "owner/repo"                  (set by Actions)
  GITHUB_SHA          commit sha                    (set by Actions)
  BUFFER_DELAY_MIN    minutes from now to schedule  (default 5)

Usage
  python3 publish.py --dir queue/2026-08-25
  python3 publish.py --channels          # list channel ids, then exit
  python3 publish.py --dir ... --dry-run # validate everything, post nothing
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib import request, error

BUFFER_API = "https://api.buffer.com"
RAW = "https://raw.githubusercontent.com/{repo}/{sha}/{path}"

# Buffer reports X as "twitter" on some accounts and "x" on others.
INSTAGRAM = {"instagram"}
XCOM = {"twitter", "x"}


# ---------------------------------------------------------------- helpers
def env(name, default=None, required=False):
    v = os.environ.get(name, default)
    if required and not v:
        sys.exit(f"ERROR: missing required environment variable {name}")
    return v


def gql(query):
    token = env("BUFFER_TOKEN", required=True)
    body = json.dumps({"query": query}).encode()
    req = request.Request(BUFFER_API, data=body, method="POST")
    req.add_header("Content-Type", "application/json")
    req.add_header("Authorization", f"Bearer {token}")
    try:
        with request.urlopen(req, timeout=60) as r:
            data = json.loads(r.read().decode())
    except error.HTTPError as e:
        sys.exit(f"ERROR {e.code} from Buffer:\n{e.read().decode()[:2000]}")
    if "errors" in data:
        sys.exit("Buffer GraphQL error:\n" + json.dumps(data["errors"], indent=2)[:2000])
    return data["data"]


def head_ok(url):
    """Buffer fails obscurely on unreachable media, so check first."""
    req = request.Request(url, method="HEAD")
    try:
        with request.urlopen(req, timeout=30) as r:
            return r.status == 200, r.headers.get("Content-Type", "")
    except error.HTTPError as e:
        return False, f"HTTP {e.code}"
    except Exception as e:  # noqa: BLE001
        return False, str(e)


# ---------------------------------------------------------------- steps
def get_channels():
    return gql("query { channels { id name service } }").get("channels", [])


def build_urls(queue_dir):
    repo = env("GITHUB_REPOSITORY", required=True)
    sha = env("GITHUB_SHA", required=True)
    slides = sorted(
        Path(queue_dir).glob("slide_*.png"),
        key=lambda p: int("".join(c for c in p.stem if c.isdigit()) or 0),
    )
    if not slides:
        sys.exit(f"No slide_*.png found in {queue_dir}")
    if len(slides) > 10:
        sys.exit(f"Instagram allows at most 10 carousel items; found {len(slides)}")
    return [RAW.format(repo=repo, sha=sha, path=p.as_posix()) for p in slides]


def read_caption(queue_dir, name, fallback=None):
    p = Path(queue_dir) / name
    if p.exists():
        return p.read_text().strip()
    if fallback is not None:
        return fallback
    sys.exit(f"Missing caption file: {p}")


def create_post(channel_id, text, asset_urls, due_at):
    assets = ", ".join('{ image: { url: "%s" } }' % u for u in asset_urls)
    query = """
    mutation {
      createPost(input: {
        text: %s,
        channelId: "%s",
        schedulingType: automatic,
        mode: customScheduled,
        dueAt: "%s",
        assets: [%s]
      }) {
        ... on PostActionSuccess { post { id } }
        ... on MutationError { message }
      }
    }
    """ % (json.dumps(text), channel_id, due_at, assets)
    return gql(query)["createPost"]


# ---------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", help="queue directory, e.g. queue/2026-08-25")
    ap.add_argument("--channels", action="store_true", help="list channels and exit")
    ap.add_argument("--dry-run", action="store_true", help="validate, post nothing")
    args = ap.parse_args()

    channels = get_channels()
    if args.channels:
        for c in channels:
            print(f"{c['id']}\t{c['service']}\t{c['name']}")
        return
    if not args.dir:
        sys.exit("Need --dir (or --channels)")

    targets = [c for c in channels if c["service"].lower() in INSTAGRAM | XCOM]
    if not targets:
        sys.exit(
            "No Instagram or X channel connected in Buffer. Connected: "
            + (", ".join(c["service"] for c in channels) or "(none)")
        )
    print("Targets: " + ", ".join(f"{c['service']}/{c['name']}" for c in targets))

    urls = build_urls(args.dir)
    print(f"\nValidating {len(urls)} slide URLs...")
    for u in urls:
        ok, info = head_ok(u)
        print(f"  {'OK ' if ok else 'FAIL'} {u}  {info}")
        if not ok:
            sys.exit(
                "Slide URL is not publicly reachable. If the repo is private, "
                "either make it public or switch to GitHub Pages / Cloudinary."
            )

    ig_text = read_caption(args.dir, "caption_instagram.txt")
    x_text = read_caption(args.dir, "caption_x.txt", fallback=ig_text)
    if len(x_text) > 280:
        print(f"\nWARNING: X caption is {len(x_text)} chars (>280) and may be rejected.")

    if args.dry_run:
        print("\n--dry-run: nothing posted.")
        print(f"IG caption: {len(ig_text)} chars\nX caption:  {len(x_text)} chars")
        return

    delay = int(env("BUFFER_DELAY_MIN", "5"))
    due = (datetime.now(timezone.utc) + timedelta(minutes=delay)).strftime(
        "%Y-%m-%dT%H:%M:%S.000Z"
    )

    print(f"\nQueueing for {due} (UTC)...")
    failures = 0
    for c in targets:
        svc = c["service"].lower()
        if svc in INSTAGRAM:
            text, assets = ig_text, urls          # full carousel
        else:
            text, assets = x_text, urls[:4]       # X caps at 4 images
        res = create_post(c["id"], text, assets, due)
        if res.get("message"):
            print(f"  FAILED {svc}: {res['message']}")
            failures += 1
        else:
            print(f"  queued {svc}: post {res['post']['id']}")
        time.sleep(1)

    if failures:
        sys.exit(f"\n{failures} of {len(targets)} posts failed.")
    print("\nDone.")


if __name__ == "__main__":
    main()
