#!/usr/bin/env node
/**
 * Print every @fontsource package the active themes need, space separated.
 *
 *   npm install $(node scripts/font-packages.mjs)
 *
 * The render workflow used to hard-code three Archivo packages, which was only
 * ever right for Bold Editorial. The moment a themed deck used Anton or
 * Permanent Marker the CI render would abort on a missing face — a failure that
 * would have arrived in October, on a deck nobody was watching get built.
 * Deriving the list from the themes themselves means adding a theme can never
 * silently break the runner.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const dir = path.join(ROOT, 'design/themes');

const pkgs = new Set();
for (const f of readdirSync(dir).filter(f => f.endsWith('.css'))) {
  const m = readFileSync(path.join(dir, f), 'utf8').match(/@fonts ([^*]+)/);
  if (!m) throw new Error(`${f} declares no @fonts`);
  for (const spec of m[1].trim().split(/\s+/)) pkgs.add(spec.split(':')[0]);
}
console.log([...pkgs].sort().map(p => `@fontsource/${p}`).join(' '));
