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
import { tmpdir } from 'node:os';
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

// ── themed decks ──
// A deck built from design/templates/ links base.css, texture.css, its theme
// and its layout by relative path. Those must be inlined for the same reason
// the fonts are: the renderer loads the file over file:// and CI has no
// stylesheet server. Returns '' for a legacy self-contained deck.
function themeCss(html, deckDir) {
  const hrefs = [...html.matchAll(/<link[^>]*href="([^"]+\.css)"/g)].map(m => m[1]);
  if (!hrefs.length) return { css: '', theme: null };
  let css = '', theme = null;
  for (const href of hrefs) {
    // resolve relative to the deck itself first (decks/<slug>/deck.html), then
    // to design/templates/ so a template renders in place during development
    const candidates = [
      path.resolve(deckDir, href),
      path.resolve(ROOT, 'design/templates', href),
      path.join(ROOT, 'design', path.basename(href)),
    ];
    const found = candidates.find(existsSync);
    if (!found) throw new Error(`deck links a stylesheet that does not exist: ${href}`);
    css += readFileSync(found, 'utf8') + '\n';
    const m = found.match(/design\/themes\/([^/]+)\.css$/);
    if (m) theme = m[1];
  }
  return { css, theme };
}

// ── parse a theme's `@fonts pkg:weights ...` declaration into face specs ──
// `400i` means italic. Family name is the package name title-cased, which is
// how @fontsource names them ('barlow-condensed' → 'Barlow Condensed').
function parseFonts(only) {
  const out = [];
  for (const spec of only.trim().split(/\s+/)) {
    const [pkg, weights] = spec.split(':');
    for (const w of weights.split(',')) {
      const italic = w.endsWith('i');
      const weight = italic ? w.slice(0, -1) : w;
      out.push({
        pkg, weight, italic,
        style: italic ? 'italic' : 'normal',
        family: pkg.split('-').map(x => x[0].toUpperCase() + x.slice(1)).join(' '),
      });
    }
  }
  return out;
}

// ── @font-face block, woff2 base64-inlined ──
function fontFaces(only) {
  const roots = [
    path.join(ROOT, 'node_modules/@fontsource'),
    '/home/claude/node_modules/@fontsource',
    path.join(process.env.HOME || '', 'node_modules/@fontsource'),
  ];
  const dir = roots.find(existsSync);
  if (!dir) throw new Error('@fontsource packages not found — npm install them first');

  // a themed deck declares exactly the faces it needs; a legacy deck gets the
  // original Bold Editorial set
  if (only) {
    return parseFonts(only).map(({ pkg, weight, style, family }) => {
      const f = path.join(dir, pkg, 'files', `${pkg}-latin-${weight}-${style}.woff2`);
      if (!existsSync(f)) throw new Error(`theme needs ${pkg} ${weight} ${style}, not installed`);
      return `@font-face{font-family:'${family}';font-style:${style};font-weight:${weight};`
           + `font-display:block;src:url(data:font/woff2;base64,${readFileSync(f).toString('base64')}) format('woff2');}`;
    }).join('\n');
  }

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

  const { css, theme } = themeCss(html, path.dirname(deckPath));
  let faces = null;
  if (theme) {
    // themed deck: inline its stylesheets and only the faces its theme declares
    const themeSrc = readFileSync(path.join(ROOT, 'design/themes', `${theme}.css`), 'utf8');
    const m = themeSrc.match(/@fonts ([^*]+)/);
    if (!m) throw new Error(`${theme}.css declares no @fonts`);
    faces = parseFonts(m[1]);
    html = html
      .replace(/<link rel="stylesheet"[^>]*>\s*/g, '')
      .replace('</head>', `<style>\n${fontFaces(m[1])}\n${css}\n</style></head>`);
    console.log(`  theme: ${theme}`);
  } else {
    html = html.replace('<style>', `<style>\n${fontCss}\n`);
  }

  // scratch goes to the system temp dir, never the repo: these files carry
  // megabytes of base64 fonts and were being committed
  const tmp = path.join(tmpdir(), `render-${slug}-${process.pid}.html`);
  writeFileSync(tmp, html);

  // viewport MUST exceed 1200px or the deck's own @media rule zooms it to 42%
  const page = await browser.newPage({ viewport: { width: 1400, height: 1400 }, deviceScaleFactor: 2 });
  await page.goto('file://' + tmp, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset.fitted === 'true', { timeout: 60000 });

  // ── prove the real typefaces loaded ──
  // This guard used to check a fixed trio of Archivo faces, which is only
  // correct for the Bold Editorial deck: a theme that declares Anton and
  // Barlow Condensed failed on a perfectly good render, and — worse — a theme
  // whose faces were missing entirely would have PASSED, because
  // fonts.check() returns true for a family with no @font-face at all.
  //
  // So: check exactly what the theme declared, and load before checking.
  // `font-display:block` means a declared-but-unused face is never fetched,
  // and check() reports false for it; load() settles that honestly.
  if (faces) {
    const missing = await page.evaluate(async (specs) => {
      await Promise.all(specs.map(f =>
        document.fonts.load(`${f.style} ${f.weight} 40px '${f.family}'`).catch(() => {})));
      return specs.filter(f =>
        !document.fonts.check(`${f.style} ${f.weight} 40px '${f.family}'`))
        .map(f => `${f.family} ${f.weight} ${f.style}`);
    }, faces);
    if (missing.length) {
      throw new Error(`ABORT ${slug}: theme declares faces that did not load: ${missing.join(', ')}`);
    }
  } else {
    const ok = await page.evaluate(() => ({
      black: document.fonts.check("150px 'Archivo Black'"),
      sans: document.fonts.check("400 30px 'Archivo'"),
      narrow: document.fonts.check("700 18px 'Archivo Narrow'"),
    }));
    if (!ok.black || !ok.sans || !ok.narrow) {
      throw new Error(`ABORT ${slug}: Archivo not loaded (${JSON.stringify(ok)})`);
    }
  }

  // check() alone cannot catch the case where the @font-face block was never
  // inlined at all — it returns true for a family that has no @font-face.
  // Comparing against Arial does not work either: Archivo's metrics sit within
  // half a pixel of Arial's at 150px, so a healthy Desk Collage render failed.
  // Compare against a family that certainly does not exist instead: if the
  // real face is missing, both fall back to the same default and match.
  const width = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const family = (root.getPropertyValue('--display-face').split(',')[0] || "'Archivo Black'").trim();
    const weight = root.getPropertyValue('--display-weight').trim() || '400';
    const measure = (f) => {
      const s = document.createElement('span');
      s.textContent = 'REBUILT SAME APP';
      s.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;`
                      + `font-size:150px;font-weight:${weight};font-family:${f}`;
      document.body.appendChild(s);
      const w = s.getBoundingClientRect().width;
      s.remove();
      return w;
    };
    return { family, real: measure(family), absent: measure("'NoSuchFamily-ZzQq'") };
  });
  if (Math.abs(width.real - width.absent) < 5) {
    throw new Error(`ABORT ${slug}: display face ${width.family} measures identically to a `
                  + `non-existent family (${width.real} vs ${width.absent}) — the face never loaded`);
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
  // '_'-prefixed folders are scaffolding (decks/_template), not publishable decks
  ? readdirSync(DECKS, { withFileTypes: true }).filter(d => d.isDirectory() && !d.name.startsWith('_')).map(d => d.name)
  : [];
const pending = all.filter(s => !complete(s));
const todo = [...new Set([...asked, ...pending])].filter(s => all.includes(s));

// CI derives slugs from a git diff, which can name scaffolding such as
// decks/_template. Those are not decks; skip them rather than failing the run.
const scaffold = asked.filter(s => s.startsWith('_'));
if (scaffold.length) console.log(`ignoring scaffolding: ${scaffold.join(', ')}`);
const unknown = asked.filter(s => !s.startsWith('_') && !all.includes(s));
if (unknown.length) throw new Error(`no such deck(s): ${unknown.join(', ')}`);

if (!todo.length) {
  console.log('every deck already has a complete slide set — nothing to render.');
  process.exit(0);
}
console.log(`rendering: ${todo.join(', ')}`);

const chromium = await loadChromium();
const fontCss = (() => { try { return fontFaces(); } catch { return ''; } })();
const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
);
try {
  for (const slug of todo) await renderDeck(browser, fontCss, slug);
} finally {
  await browser.close();
}
console.log('done.');
