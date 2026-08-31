#!/usr/bin/env node
/**
 * Render a Bold Editorial deck to Instagram-ready slides.
 *
 *   node scripts/render-deck.mjs [slug ...]
 *
 * Renders each slug given, plus any deck whose output in public/<slug>/ is
 * missing or incomplete — so a failed or skipped run self-heals next time.
 *
 * Runs in GitHub Actions (playwright + @fontsource installed by the workflow).
 * Nothing here calls an AI service; given the same deck.html it always produces
 * the same bytes.
 *
 * Google Fonts is not reachable from every build environment and a silent
 * fallback to Arial ruins the whole design, so the Archivo faces are inlined
 * as base64 woff2 and asserted before a single screenshot is taken.
 */
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DECKS = path.join(ROOT, 'decks');
const PUBLIC = path.join(ROOT, 'public');
const SLIDES = 8;

// ── locate playwright: a local dependency in CI, sometimes a global elsewhere ──
async function loadChromium() {
  try {
    return (await import('playwright')).chromium;
  } catch {
    for (const base of [
      path.join(ROOT, 'node_modules/'),
      '/home/claude/.npm-global/lib/node_modules/',
      path.join(process.env.HOME || '', '.npm-global/lib/node_modules/'),
    ]) {
      try { return createRequire(base)('playwright').chromium; } catch {}
    }
    throw new Error('playwright not found — npm install playwright first');
  }
}

// ── @font-face block, woff2 base64-inlined ──
function fontFaces() {
  const roots = [
    path.join(ROOT, 'node_modules/@fontsource'),
    '/home/claude/node_modules/@fontsource',
    path.join(process.env.HOME || '', 'node_modules/@fontsource'),
  ];
  const dir = roots.find(existsSync);
  if (!dir) throw new Error('@fontsource packages not found — npm install them first');

  const faces = [
    ['Archivo Black', 400, 'archivo-black/files/archivo-black-latin-400-normal.woff2'],
    ['Archivo', 400, 'archivo/files/archivo-latin-400-normal.woff2'],
    ['Archivo', 500, 'archivo/files/archivo-latin-500-normal.woff2'],
    ['Archivo', 600, 'archivo/files/archivo-latin-600-normal.woff2'],
    ['Archivo', 700, 'archivo/files/archivo-latin-700-normal.woff2'],
    ['Archivo Narrow', 600, 'archivo-narrow/files/archivo-narrow-latin-600-normal.woff2'],
    ['Archivo Narrow', 700, 'archivo-narrow/files/archivo-narrow-latin-700-normal.woff2'],
  ];
  return faces.map(([family, weight, rel]) => {
    const b64 = readFileSync(path.join(dir, rel)).toString('base64');
    return `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};`
         + `font-display:block;src:url(data:font/woff2;base64,${b64}) format('woff2');}`;
  }).join('\n');
}

const complete = (slug) => {
  const out = path.join(PUBLIC, slug);
  for (let i = 1; i <= SLIDES; i++) {
    if (!existsSync(path.join(out, `slide-0${i}.png`))) return false;
  }
  return existsSync(path.join(out, 'deck.pdf'));
};

async function renderDeck(browser, fontCss, slug) {
  const deckPath = path.join(DECKS, slug, 'deck.html');
  if (!existsSync(deckPath)) throw new Error(`no deck.html for '${slug}'`);
  const outDir = path.join(PUBLIC, slug);
  mkdirSync(outDir, { recursive: true });

  let html = readFileSync(deckPath, 'utf8')
    .replace(/<link[^>]*fonts\.(googleapis|gstatic)\.com[^>]*>\s*/g, '');
  if (/fonts\.(googleapis|gstatic)/.test(html)) throw new Error('Google Fonts reference survived stripping');
  html = html.replace('<style>', `<style>\n${fontCss}\n`);

  const tmp = path.join(ROOT, `.render-${slug}.html`);
  writeFileSync(tmp, html);

  // viewport MUST exceed 1200px or the deck's own @media rule zooms it to 42%
  const page = await browser.newPage({ viewport: { width: 1400, height: 1400 }, deviceScaleFactor: 2 });
  await page.goto('file://' + tmp, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset.fitted === 'true', { timeout: 60000 });

  // fonts.check() needs the weight actually used — Archivo Narrow ships 600/700 only,
  // so a bare 'Archivo Narrow' check tests weight 400 and fails on a correct render.
  const ok = await page.evaluate(() => ({
    black: document.fonts.check("150px 'Archivo Black'"),
    sans: document.fonts.check("400 30px 'Archivo'"),
    narrow: document.fonts.check("700 18px 'Archivo Narrow'"),
  }));
  // fonts.check() returns true for families with no @font-face at all, so also prove
  // Archivo Black measures differently from the Arial fallback.
  const width = await page.evaluate(() => {
    const measure = (family) => {
      const s = document.createElement('span');
      s.textContent = 'REBUILT SAME APP';
      s.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;font-size:150px;font-family:${family}`;
      document.body.appendChild(s);
      const w = s.getBoundingClientRect().width;
      s.remove();
      return w;
    };
    return { black: measure("'Archivo Black'"), arial: measure('Arial') };
  });
  if (!ok.black || !ok.sans || !ok.narrow || Math.abs(width.black - width.arial) < 5) {
    throw new Error(`ABORT ${slug}: Archivo not loaded — would ship an Arial fallback `
                  + `(${JSON.stringify(ok)}, black=${width.black} arial=${width.arial})`);
  }

  const sections = await page.$$('section.slide');
  if (sections.length !== SLIDES) throw new Error(`${slug}: expected ${SLIDES} slides, got ${sections.length}`);

  for (let i = 0; i < sections.length; i++) {
    const box = await sections[i].boundingBox();
    if (Math.round(box.width) !== 1080 || Math.round(box.height) !== 1350) {
      throw new Error(`${slug} slide ${i + 1}: box ${box.width}x${box.height}, expected 1080x1350`);
    }
    await page.screenshot({ path: path.join(outDir, `slide-0${i + 1}.png`), fullPage: true, clip: box });
  }

  // text that escapes its slide is invisible in a PNG diff — fail loudly instead.
  // .echo bleeds past the right edge by design and is clipped, so it is exempt.
  const overflow = await page.evaluate(() => {
    const bad = [];
    document.querySelectorAll('section.slide').forEach((s, i) => {
      const sr = s.getBoundingClientRect();
      s.querySelectorAll('.xl,.l,.m,.figure,.copy,.figure-note,.ledger li,.step-n,.pill').forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.left < sr.left - 1 || r.right > sr.right + 1 || r.top < sr.top - 1 || r.bottom > sr.bottom + 1) {
          bad.push(`slide ${i + 1}: "${el.textContent.trim().slice(0, 30)}" outside the frame`);
        }
      });
    });
    return bad;
  });
  if (overflow.length) throw new Error(`${slug}: content overflows\n  ${overflow.join('\n  ')}`);

  await page.pdf({ path: path.join(outDir, 'deck.pdf'), width: '1080px', height: '1350px',
                   printBackground: true, pageRanges: `1-${SLIDES}` });
  await page.close();
  console.log(`rendered ${slug} → public/${slug}/ (${SLIDES} slides + deck.pdf)`);
}

const asked = process.argv.slice(2).filter(a => a && !a.startsWith('-'));
const all = existsSync(DECKS)
  ? readdirSync(DECKS, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name)
  : [];
const pending = all.filter(s => !complete(s));
const todo = [...new Set([...asked, ...pending])].filter(s => all.includes(s));

const unknown = asked.filter(s => !all.includes(s));
if (unknown.length) throw new Error(`no such deck(s): ${unknown.join(', ')}`);

if (!todo.length) {
  console.log('every deck already has a complete slide set — nothing to render.');
  process.exit(0);
}
console.log(`rendering: ${todo.join(', ')}`);

const chromium = await loadChromium();
const fontCss = fontFaces();
const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
);
try {
  for (const slug of todo) await renderDeck(browser, fontCss, slug);
} finally {
  await browser.close();
}
console.log('done.');
