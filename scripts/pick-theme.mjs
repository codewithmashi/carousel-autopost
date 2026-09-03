#!/usr/bin/env node
/**
 * Print the theme in rotation for a given month.
 *
 *   node scripts/pick-theme.mjs            → theme for today
 *   node scripts/pick-theme.mjs 2026-11    → theme for November 2026
 *   node scripts/pick-theme.mjs --list     → every active theme, verified
 *
 * Derived from the calendar month rather than a stored pointer: there is no
 * state to advance, two builds in the same month always agree, and a missed
 * run cannot desynchronise the sequence.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const parts = (t) => ({
  tokens: path.join(ROOT, 'design/themes', `${t}.css`),
  layout: path.join(ROOT, 'design/layouts', `${t}.css`),
  template: path.join(ROOT, 'design/templates', `${t}.html`),
});

const active = readFileSync(path.join(ROOT, 'design/ROTATION'), 'utf8')
  .split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));

if (!active.length) { console.error('design/ROTATION lists no active themes'); process.exit(1); }

// a theme in the rotation must be complete, or it silently ships as a recolour
for (const t of active) {
  const p = parts(t);
  for (const [k, f] of Object.entries(p)) {
    if (!existsSync(f)) {
      console.error(`ROTATION lists "${t}" but its ${k} is missing: ${path.relative(ROOT, f)}`);
      process.exit(1);
    }
  }
}

const arg = process.argv[2];
if (arg === '--list') {
  for (const t of active) console.log(t);
  process.exit(0);
}

const now = arg ? new Date(`${arg}-01T00:00:00Z`) : new Date();
if (Number.isNaN(now.getTime())) { console.error(`bad month: ${arg} (expected YYYY-MM)`); process.exit(1); }
const months = now.getUTCFullYear() * 12 + now.getUTCMonth();
console.log(active[months % active.length]);
