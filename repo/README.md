# Daily carousel autopost

Claude generates a slide carousel each morning and commits it to `queue/`.
GitHub Actions picks it up and publishes to Instagram and X through Buffer.

```
Claude task (09:30 IST)          GitHub Actions                Buffer
  generate slides      ──push──►   read raw URLs    ──API──►   Instagram
  + captions                       call Buffer API             X
  commit to queue/
```

**Why the middle step exists:** Claude's sandbox blocks outbound traffic to
Buffer, Meta, X and Cloudinary — only GitHub is reachable. Actions runners have
full internet, so that's where posting happens. It also keeps the API token in
GitHub's encrypted secret store instead of in a task prompt.

**Why Buffer:** it absorbs Meta's app-review requirement and X's API billing
(X ended its free tier in February 2026). Buffer's free plan covers 3 channels
and includes API access — 1 key, 3,000 requests/month. This whole pipeline
costs nothing.

---

## Setup

**1. This repo must be public.** Buffer requires publicly reachable, direct,
stable HTTPS media URLs, and slides are served from
`raw.githubusercontent.com` pinned to the commit SHA. If you'd rather keep it
private, switch to GitHub Pages or Cloudinary and change `RAW` in `publish.py`.

**2. Buffer.** Create a free account, connect your Instagram (Business/Creator)
and X channels, then get an API key at
<https://publish.buffer.com/settings/api>.

**3. Add the secret.** Repo → Settings → Secrets and variables → Actions →
New repository secret:

| Name | Value |
|---|---|
| `BUFFER_TOKEN` | your Buffer API key |

**4. Give Claude a token.** Create a fine-grained PAT scoped to *this repo only*
with `Contents: read and write`. That's the one credential the daily Claude task
needs — it can only touch this repo, nothing else in your account.

**5. Test before trusting it.** Actions tab → *Publish carousel* → Run workflow
→ tick **dry_run**. That validates channels, slide URLs and caption lengths
without posting anything. Then run it again without dry_run.

---

## Queue format

```
queue/YYYY-MM-DD/
  slide_1.png … slide_6.png     1080×1080, max 10, consistent aspect ratio
  caption_instagram.txt          ≤ 2200 chars
  caption_x.txt                  ≤ 280 chars, no links
  .published                     written by the workflow after a successful run
```

Instagram gets the full carousel. X gets the first four slides (its limit) with
the short caption.

**Keep links out of `caption_x.txt`.** If you ever move off Buffer to X's
pay-per-use API, a post with a link costs $0.20 versus $0.015 without — a 13×
difference for one URL.

---

## Running it manually

```bash
export BUFFER_TOKEN=...            # only needed locally
export GITHUB_REPOSITORY=owner/repo
export GITHUB_SHA=$(git rev-parse HEAD)

python3 publish.py --channels                      # list channel IDs
python3 publish.py --dir queue/2026-08-24 --dry-run
python3 publish.py --dir queue/2026-08-24
```

Stdlib only — no dependencies to install.

---

## Notes and gotchas

- **Re-runs are guarded.** The workflow writes `.published` into the folder and
  skips anything already marked. The marker commit uses `[skip ci]` and the
  default `GITHUB_TOKEN`, neither of which retriggers the workflow.
- **Buffer free plan holds 10 queued posts per channel.** Slots free up as posts
  publish, so one per day never accumulates — but a run of failures could fill it.
- **Two things worth verifying on your first real post:** that X is connectable
  on Buffer's free tier, and that a 6-image Instagram carousel goes through. The
  `assets` array is documented as an ordered list, so it should, but confirm it.
- **Instagram allows 25 published posts per 24 hours** per account via the API.
  Not a concern at one a day.
- **Posts go out unreviewed.** If you later want a look-before-it-flies step,
  raise `BUFFER_DELAY_MIN` in the workflow to a few hours — the post sits in
  Buffer's queue where you can edit or kill it from your phone.
