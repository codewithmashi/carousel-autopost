#!/usr/bin/env node
/**
 * Publish the next queued carousel to Instagram. Runs in GitHub Actions.
 *
 * Reads QUEUE (one slug per line, top first), publishes it, moves it to
 * PUBLISHED.log. Images are already hosted on Netlify — this job renders nothing.
 *
 *   --dry-run      preflight only, stop before any Instagram call
 *   --force        post even if something already went out today
 *
 * Env: IG_ACCESS_TOKEN, IG_USER_ID.
 *
 * ── on scheduling ──
 * GitHub's scheduled runs are best-effort and get delayed under load; ours have
 * landed anywhere from 40 minutes to 6 hours after the cron, so "19:12 IST" was
 * never really 19:12. The fix is not a better cron — it is to attempt several
 * times across a window and make repeat attempts harmless. Hence the
 * already-posted-today guard below: the first attempt that actually runs wins,
 * every later one in that window exits quietly.
 *
 * That guard is what keeps two queued decks from going out on the same day, so
 * it has to see the CURRENT main. The workflow checks out `ref: main` rather
 * than the SHA that triggered the schedule for exactly this reason.
 */
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';

const BASE = 'https://mashi-carousels.netlify.app';
const API  = 'https://graph.instagram.com/v23.0';
const dry   = process.argv.includes('--dry-run');
const force = process.argv.includes('--force');
const TOKEN = process.env.IG_ACCESS_TOKEN;
const USER  = process.env.IG_USER_ID;

const notes = [];
const say = (l) => { console.log(l); notes.push(l); };
function summarise(heading) {
  const out = process.env.GITHUB_STEP_SUMMARY;
  if (!out) return;
  try { appendFileSync(out, `## ${heading}\n\n${notes.join('\n')}\n`); } catch {}
}
/** Fail in a way a human actually hears about: an annotation plus a non-zero exit. */
function stop(code, heading, ...lines) {
  lines.forEach(say);
  if (code) console.log(`::error::${lines[0]}`);
  summarise(heading);
  process.exit(code);
}

const published = existsSync('PUBLISHED.log')
  ? readFileSync('PUBLISHED.log', 'utf8').split('\n').map(l => l.trim()).filter(Boolean)
  : [];

// ── have we already posted today? ──
const today = new Date().toISOString().slice(0, 10);
const postedToday = published.find(l => (l.split('\t')[1] ?? '').slice(0, 10) === today);
if (postedToday && !force) {
  say(`Already posted today: ${postedToday.split('\t')[0]}`);
  say('This is one of several attempts across the posting window — nothing to do.');
  summarise('Nothing to publish');
  process.exit(0);
}

const queue = existsSync('QUEUE')
  ? readFileSync('QUEUE', 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))
  : [];

// An empty queue is not a quiet no-op. It means the pipeline has run out of
// content and no one will notice until someone checks the grid, so make it a
// failure — a failed scheduled run is the one thing that reliably sends mail.
if (!queue.length) {
  const unchecked = existsSync('TOPICS.md')
    ? (readFileSync('TOPICS.md', 'utf8').match(/^- \[ \]/gm) ?? []).length
    : 0;
  stop(dry ? 0 : 1, 'Queue is empty',
    'QUEUE is empty — there is nothing to publish and the account will go quiet.',
    `TOPICS.md still has ${unchecked} unchecked topic(s) for the builder to work from.`,
    unchecked === 0
      ? 'Add topics to TOPICS.md, or the 08:07 builder will produce nothing either.'
      : 'The builder should refill the queue on its next run.');
}

const slug = queue[0];
say(`Next in queue: ${slug}`);

if (published.some(l => l.split('\t')[0] === slug)) {
  say(`'${slug}' is already in PUBLISHED.log — dropping it from QUEUE rather than reposting.`);
  writeFileSync('QUEUE', queue.slice(1).join('\n') + '\n');
  summarise('Duplicate skipped');
  process.exit(0);
}

const capPath = `decks/${slug}/caption.md`;
if (!existsSync(capPath)) {
  stop(1, 'No caption', `Missing ${capPath} — the post would go out with no words.`);
}
const caption = readFileSync(capPath, 'utf8').trim();

// discover slides by probing — the repo may not carry the PNGs
const urls = [];
for (let i = 1; i <= 10; i++) {
  const u = `${BASE}/${slug}/slide-${String(i).padStart(2, '0')}.png`;
  let r;
  try {
    r = await fetch(u, { method: 'HEAD' });
  } catch (err) {
    // A network failure is not "no more slides" — treat it as fatal rather than
    // silently deciding the deck has fewer slides than it does.
    stop(3, 'Cannot reach the slides', `HEAD ${u} failed: ${err.message}`,
      'Netlify was unreachable, so the slide set could not be verified.');
  }
  if (!r.ok) break;
  if (!(r.headers.get('content-type') || '').startsWith('image/')) {
    stop(3, 'Slides are not images', `NOT AN IMAGE: ${u}`,
      'Netlify is serving something else at that path — usually the SPA fallback,',
      'which means the deploy has not published this deck yet.');
  }
  urls.push(u);
}
if (urls.length < 2) {
  stop(3, 'Slides missing',
    `Found ${urls.length} public slide(s) for '${slug}' — need at least 2.`,
    'Either the render workflow has not run, or Netlify has not finished deploying.');
}
say(`Preflight: ${urls.length} slides public ✓`);

// ── how long has the token got? ──
// Cheap to check here, and this is the job that dies first when it lapses.
if (existsSync('TOKEN-REFRESHED')) {
  const line = readFileSync('TOKEN-REFRESHED', 'utf8').split('\n')
    .map(l => l.trim()).find(l => l && !l.startsWith('#'));
  if (line) {
    const [iso, secs] = line.split('\t');
    const life = Number(secs) > 0 ? Number(secs) * 1000 : 60 * 864e5;
    const left = Math.floor((Date.parse(iso) + life - Date.now()) / 864e5);
    if (Number.isFinite(left) && left <= 14) {
      say(`::warning::Instagram token expires in about ${left} days — renew it or posting stops.`);
    }
  }
}

if (dry) { say('--dry-run: stopping before any Instagram call.'); summarise('Dry run'); process.exit(0); }
if (!TOKEN || !USER) stop(2, 'Not configured', 'IG_ACCESS_TOKEN / IG_USER_ID are not set.');

const post = async (path, params) => {
  const r = await fetch(`${API}/${path}`, { method: 'POST', body: new URLSearchParams({ ...params, access_token: TOKEN }) });
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(JSON.stringify(j.error ?? j));
  return j;
};
const get = async (path, params) => {
  const q = new URLSearchParams({ ...params, access_token: TOKEN });
  const r = await fetch(`${API}/${path}?${q}`); const j = await r.json();
  if (!r.ok || j.error) throw new Error(JSON.stringify(j.error ?? j));
  return j;
};

try {
  const children = [];
  for (const [i, image_url] of urls.entries()) {
    const { id } = await post(`${USER}/media`, { image_url, is_carousel_item: 'true' });
    children.push(id); console.log(`  container ${i + 1}/${urls.length}`);
  }
  const parent = await post(`${USER}/media`, { media_type: 'CAROUSEL', children: children.join(','), caption });

  // Meta processes containers asynchronously; publishing early fails with 9007.
  const deadline = Date.now() + 5 * 60 * 1000;
  for (;;) {
    const { status_code } = await get(parent.id, { fields: 'status_code' });
    if (status_code === 'FINISHED') break;
    if (['ERROR', 'EXPIRED'].includes(status_code)) throw new Error(`container ${status_code}`);
    if (Date.now() > deadline) throw new Error('container not ready after 5 minutes');
    await new Promise(r => setTimeout(r, 3000));
  }

  const { id } = await post(`${USER}/media_publish`, { creation_id: parent.id });
  const { permalink } = await get(id, { fields: 'permalink' }).catch(() => ({}));
  say(`PUBLISHED → ${id}  ${permalink ?? ''}`);

  appendFileSync('PUBLISHED.log', `${slug}\t${new Date().toISOString()}\t${id}\t${permalink ?? ''}\n`);
  writeFileSync('QUEUE', queue.slice(1).join('\n') + '\n');
  say(`QUEUE advanced — ${queue.length - 1} deck(s) still waiting.`);
  if (queue.length - 1 === 0) say('::warning::That was the last deck in the queue.');
  summarise(`Published ${slug}`);
} catch (err) {
  // Leave QUEUE alone: an unadvanced queue is what makes the next attempt a retry.
  stop(4, 'Publish failed',
    `Instagram rejected the post for '${slug}': ${err.message}`,
    'QUEUE was left untouched, so the next scheduled attempt will retry this deck.');
}
