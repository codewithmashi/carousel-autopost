#!/usr/bin/env node
/**
 * Publish the next queued carousel to Instagram. Runs in GitHub Actions.
 *
 * Reads QUEUE (one slug per line, top first), publishes it, moves it to
 * PUBLISHED.log. Images are already hosted on Netlify — this job renders nothing.
 *
 * Env: IG_ACCESS_TOKEN, IG_USER_ID.  --dry-run stops before any Instagram call.
 */
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';

const BASE = 'https://mashi-carousels.netlify.app';
const API  = 'https://graph.instagram.com/v23.0';
const dry  = process.argv.includes('--dry-run');
const TOKEN = process.env.IG_ACCESS_TOKEN;
const USER  = process.env.IG_USER_ID;

const queue = existsSync('QUEUE')
  ? readFileSync('QUEUE', 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))
  : [];
if (!queue.length) { console.log('QUEUE is empty — nothing to publish.'); process.exit(0); }

const slug = queue[0];
console.log(`next in queue: ${slug}`);

if (existsSync('PUBLISHED.log') && readFileSync('PUBLISHED.log','utf8').split('\n').some(l => l.split('\t')[0] === slug)) {
  console.log(`'${slug}' already in PUBLISHED.log — removing from QUEUE, not reposting.`);
  writeFileSync('QUEUE', queue.slice(1).join('\n') + '\n');
  process.exit(0);
}

const capPath = `decks/${slug}/caption.md`;
if (!existsSync(capPath)) { console.error(`missing caption: ${capPath}`); process.exit(1); }
const caption = readFileSync(capPath, 'utf8').trim();

// discover slides by probing — the repo may not carry the PNGs
const urls = [];
for (let i = 1; i <= 10; i++) {
  const u = `${BASE}/${slug}/slide-${String(i).padStart(2,'0')}.png`;
  const r = await fetch(u, { method: 'HEAD' });
  if (!r.ok) break;
  if (!(r.headers.get('content-type') || '').startsWith('image/')) {
    console.error(`NOT AN IMAGE: ${u}`); process.exit(3);
  }
  urls.push(u);
}
if (urls.length < 2) { console.error(`found ${urls.length} slides for '${slug}' — need at least 2`); process.exit(3); }
console.log(`preflight: ${urls.length} slides public ✓`);

if (dry) { console.log('--dry-run: stopping before any Instagram call.'); process.exit(0); }
if (!TOKEN || !USER) { console.error('IG_ACCESS_TOKEN / IG_USER_ID not set'); process.exit(2); }

const post = async (path, params) => {
  const r = await fetch(`${API}/${path}`, { method:'POST', body:new URLSearchParams({ ...params, access_token: TOKEN }) });
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

const children = [];
for (const [i, image_url] of urls.entries()) {
  const { id } = await post(`${USER}/media`, { image_url, is_carousel_item: 'true' });
  children.push(id); console.log(`  container ${i+1}/${urls.length}`);
}
const parent = await post(`${USER}/media`, { media_type:'CAROUSEL', children: children.join(','), caption });

// Meta processes containers asynchronously; publishing early fails with 9007.
const deadline = Date.now() + 5*60*1000;
for (;;) {
  const { status_code } = await get(parent.id, { fields: 'status_code' });
  if (status_code === 'FINISHED') break;
  if (['ERROR','EXPIRED'].includes(status_code)) throw new Error(`container ${status_code}`);
  if (Date.now() > deadline) throw new Error('container not ready after 5 minutes');
  await new Promise(r => setTimeout(r, 3000));
}

const { id } = await post(`${USER}/media_publish`, { creation_id: parent.id });
const { permalink } = await get(id, { fields: 'permalink' }).catch(() => ({}));
console.log(`PUBLISHED → ${id}  ${permalink ?? ''}`);

appendFileSync('PUBLISHED.log', `${slug}\t${new Date().toISOString()}\t${id}\t${permalink ?? ''}\n`);
writeFileSync('QUEUE', queue.slice(1).join('\n') + '\n');
console.log('QUEUE advanced.');
