#!/usr/bin/env node
/**
 * Fetch photography for a deck from Pexels and stage it for the renderer.
 *
 *   PEXELS_API_KEY=... node scripts/fetch-images.mjs <slug> <theme-file> [count]
 *
 * Queries come from the theme's own spec: each design/themes/NN-*.css carries
 * an "@imagery a;b;c" comment lifted from the Imagery section of its .md.
 * So Vistto Mono asks for plaster busts and CRTs, Sunset Grit asks for palms
 * and skylines — the photography matches the system rather than being generic.
 *
 * Deterministic: the slug seeds which result is taken from each query, so
 * re-rendering the same deck picks the same photographs. Without that, every
 * CI run would silently reshuffle a deck that is already published.
 *
 * Images land in public/<slug>/img/ as plain JPEGs. All the treatment —
 * greyscale, contrast, duotone, halftone — happens in CSS at render time via
 * design/texture.css, so one download serves any theme.
 *
 * Exits 0 and writes nothing when PEXELS_API_KEY is absent, so the pipeline
 * degrades to type-only decks rather than failing the build.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const [slug, themeFile, countArg] = process.argv.slice(2);
const COUNT = Number(countArg) || 4;
const KEY = process.env.PEXELS_API_KEY;

if (!slug || !themeFile) {
  console.error('usage: fetch-images.mjs <slug> <theme-file.css> [count]');
  process.exit(1);
}
if (!KEY) {
  console.log('PEXELS_API_KEY not set — skipping imagery, deck renders type-only.');
  process.exit(0);
}

const themePath = path.join(ROOT, 'design/themes', themeFile);
const theme = readFileSync(themePath, 'utf8');
const m = theme.match(/@imagery ([^*]+)/);
if (!m) { console.log(`${themeFile} declares no @imagery — nothing to fetch.`); process.exit(0); }
const queries = m[1].trim().split(';').map(s => s.trim()).filter(Boolean);

// stable per-slug seed so a published deck never silently changes photographs
let seed = 0;
for (const ch of slug) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
const pick = (n, i) => (seed + i * 7919) % Math.max(n, 1);

const outDir = path.join(ROOT, 'public', slug, 'img');
mkdirSync(outDir, { recursive: true });

const api = async (url) => {
  const r = await fetch(url, { headers: { Authorization: KEY } });
  if (r.status === 429) throw new Error('Pexels rate limit reached (free tier: 200/hour)');
  if (!r.ok) throw new Error(`Pexels ${r.status} ${r.statusText}`);
  return r.json();
};

const credits = [];
let written = 0;

for (let i = 0; i < COUNT; i++) {
  const q = queries[i % queries.length];
  const dest = path.join(outDir, `photo-${String(i + 1).padStart(2, '0')}.jpg`);
  if (existsSync(dest)) { console.log(`  photo-${i + 1}: already present, keeping`); written++; continue; }

  const data = await api(`https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=30&orientation=portrait`);
  const photos = data.photos || [];
  if (!photos.length) { console.log(`  "${q}": no results, skipped`); continue; }

  const photo = photos[pick(photos.length, i)];
  const src = photo.src.large2x || photo.src.large || photo.src.original;
  const img = await fetch(src);
  if (!img.ok) { console.log(`  "${q}": download failed ${img.status}`); continue; }

  writeFileSync(dest, Buffer.from(await img.arrayBuffer()));
  credits.push(`photo-${String(i + 1).padStart(2, '0')}.jpg  ${photo.photographer}  ${photo.url}`);
  console.log(`  photo-${i + 1}: "${q}" → ${photo.photographer}`);
  written++;
}

// Pexels does not require attribution, but keeping the provenance in the repo
// means we can always answer "where did this image come from".
if (credits.length) {
  writeFileSync(path.join(outDir, 'CREDITS.txt'),
    `Photography via Pexels (https://pexels.com) — free to use, attribution not required.\n\n${credits.join('\n')}\n`);
}
console.log(`${written}/${COUNT} images ready in public/${slug}/img/`);
