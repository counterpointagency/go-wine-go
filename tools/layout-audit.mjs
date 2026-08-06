#!/usr/bin/env node
/**
 * layout-audit.mjs — Go Wine Go
 *
 * The contrast audit passed on a page that had text sitting on top of text.
 * It measures colour, not geometry. This measures geometry.
 *
 * It parses the served CSS out of assets/css/main.css, resolves the value
 * expressions (clamp/min/max/calc/rem/vw/vh) at four viewports, lays the
 * hero copy out using REAL glyph advances from tools/font-metrics.json, and
 * asserts, at 390, 834, 1280 and 1600:
 *
 *   1. header height vs. hero content top offset — clearance must not be negative
 *   2. plate width and height against their caps (34vw / 60vh; full width below 760)
 *   3. every fixed or sticky element vs. the top offset of what follows it,
 *      on EVERY page, not just the one that happens to have a hero
 *   4. search input width vs. its own placeholder
 *
 * Font metrics were extracted with tools/extract-font-metrics.py from the
 * exact Google Fonts woff2 the pages request, with Fraunces instanced at
 * opsz 100 — Google leaves that axis live at a default of 9, so measuring
 * the served default would report a text cut, not the display cut that
 * actually renders. The metrics file is committed, so this runs offline
 * and deterministically. If you change a font, weight or axis, regenerate it.
 *
 * Exit 0 = all clearances non-negative and all caps respected. 1 = failure.
 *
 * Usage: node tools/layout-audit.mjs [--verbose]
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CSS = readFileSync(resolve(ROOT, 'assets/css/main.css'), 'utf8');
const FONTS = JSON.parse(readFileSync(resolve(ROOT, 'tools/font-metrics.json'), 'utf8'));

const DISPLAY_FACE = 'fraunces-600';

/* Each page, and the first in-flow element that has to clear the fixed
   header. The two pages with a hero photograph reserve it with the hero's
   own padding-top; every inner page reserves it with .page--inner. */
const PAGES = [
  { file: 'index.html',          reserves: '.hero',         prop: 'padding-top', hero: true },
  { file: 'winery.html',         reserves: '.winery-hero',  prop: 'padding-top', hero: true },
  { file: 'wine.html',           reserves: '.page--inner',  prop: 'padding-top' },
  { file: 'go-deals.html',       reserves: '.page--inner',  prop: 'padding-top' },
  { file: 'tenders.html',        reserves: '.page--inner',  prop: 'padding-top' },
  { file: 'how-it-works.html',   reserves: '.page--inner',  prop: 'padding-top' },
  { file: 'account.html',        reserves: '.page--inner',  prop: 'padding-top' },
  { file: 'supplier.html',       reserves: '.page--inner',  prop: 'padding-top' },
];

/* Every plate that sits OVER a photograph, with its width cap and the
   page it appears on. Below 760 each is specified full width, because
   the photograph moves into flow and the plate sits under it. */
const PLATES = [
  { sel: '.hero__plate',        page: 'index.html',  capVW: 34, capNarrowVW: 34 },
  // The closing plate widens deliberately below 900, where the column is
  // narrower and 40vw would leave an unreadable measure. Both caps are
  // declared so an accidental 90vw still fails.
  { sel: '.closing__plate',     page: 'index.html',  capVW: 40, capNarrowVW: 60 },
  { sel: '.winery-hero__plate', page: 'winery.html', capVW: 34, capNarrowVW: 34 },
];

/* Sticky elements are allowed to sit under the fixed header ONLY when
   they scroll inside their own container rather than the page. Each
   exemption has to name that container, so "it is fine" is never the
   whole argument. */
const STICKY_EXEMPT = {
  '.modal__head': 'scrolls inside .modal (overflow-y:auto), not the page',
};
for (const p of PAGES) p.html = readFileSync(resolve(ROOT, p.file), 'utf8');
const HTML = PAGES[0].html;

const VIEWPORTS = [
  { w: 390,  h: 844,  label: 'iPhone 390x844' },
  { w: 834,  h: 1194, label: 'iPad 834x1194' },
  { w: 1280, h: 800,  label: 'Laptop 1280x800' },
  { w: 1600, h: 1000, label: 'Desktop 1600x1000' },
];

/* ── strip comments, then split into (media, selector, decls) ───── */
const clean = CSS.replace(/\/\*[\s\S]*?\*\//g, '');

function rulesFor(maxWidth) {
  // Base rules, then any @media (max-width: N) where N >= viewport width,
  // applied in source order so later declarations win — same as the cascade.
  const out = [];
  const mediaRe = /@media\s*\(([^)]*)\)\s*\{/g;
  const blocks = [];
  let m;
  while ((m = mediaRe.exec(clean))) {
    const start = m.index;
    let depth = 1, i = mediaRe.lastIndex;
    while (i < clean.length && depth > 0) {
      if (clean[i] === '{') depth++;
      else if (clean[i] === '}') depth--;
      i++;
    }
    blocks.push({ cond: m[1], start, end: i, body: clean.slice(mediaRe.lastIndex, i - 1) });
    mediaRe.lastIndex = i;
  }
  let base = clean;
  for (const b of blocks.slice().reverse()) base = base.slice(0, b.start) + base.slice(b.end);
  out.push(base);
  for (const b of blocks) {
    if (/prefers-reduced-motion|prefers-color-scheme/.test(b.cond)) continue;
    const mw = /max-width:\s*(\d+)px/.exec(b.cond);
    if (mw && maxWidth <= Number(mw[1])) out.push(b.body);
  }
  return out.join('\n');
}

function declMap(css) {
  const map = new Map();
  for (const [, sel, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    for (const s of sel.split(',')) {
      const key = s.trim().replace(/\s+/g, ' ');
      if (!key) continue;
      const props = map.get(key) || {};
      for (const [, p, v] of body.matchAll(/([-\w]+)\s*:\s*([^;]+);/g)) props[p.trim()] = v.trim();
      map.set(key, props);
    }
  }
  return map;
}

/* ── value resolver ─────────────────────────────────────────────────
   Tokens are resolved PER VIEWPORT, because :root is itself overridden
   inside a media query — --header-h drops from 76px to 64px below 760.
   Reading only the base block would have measured a 76px header against
   a 64px reality on mobile. */
const tokenCache = new Map();
function tokensFor(width) {
  if (tokenCache.has(width)) return tokenCache.get(width);
  const t = {};
  for (const [, body] of rulesFor(width).matchAll(/:root\s*\{([^{}]*)\}/g)) {
    for (const [, k, v] of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) t[k] = v.trim();
  }
  tokenCache.set(width, t);
  return t;
}
/** Base tokens, for the few values that are viewport independent. */
const TOKENS = tokensFor(99999);

function resolve1(expr, vp, depth = 0) {
  if (expr == null) return NaN;
  let s = String(expr).trim();
  if (depth > 12) return NaN;
  const tokens = tokensFor(vp.w);
  // var(--x) / var(--x, fallback)
  s = s.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)/g, (_, name, fb) =>
    tokens[name] !== undefined ? `(${tokens[name]})` : (fb !== undefined ? `(${fb})` : 'NaN'));
  /* Resolve inside out, alternating between function calls and plain
     grouping parens. Substituting var() wraps each value in parens, so
     calc(var(--header-h) + var(--sp-5)) becomes calc((76px) + (1.5rem)) —
     and a function regex that refuses nested parens silently returns NaN
     for it. That is how wine.html's sticky offset first measured as NaN. */
  const fn = /(clamp|min|max|calc)\(([^()]*)\)/;
  const group = /(^|[^\w-])\(([^()]*)\)/;
  for (let guard = 0; guard < 50; guard++) {
    const g = fn.exec(s);
    if (g) {
      const name = g[1];
      const args = g[2].split(',').map((a) => a.trim());
      let val;
      if (name === 'calc') {
        val = evalArith(args[0], vp);
      } else {
        const nums = args.map((a) => evalArith(a, vp));
        if (name === 'min') val = Math.min(...nums);
        else if (name === 'max') val = Math.max(...nums);
        else val = Math.min(Math.max(nums[0], nums[1]), nums[2]); // clamp(min, pref, max)
      }
      s = s.slice(0, g.index) + val + s.slice(g.index + g[0].length);
      continue;
    }
    const p = group.exec(s);
    if (p) {
      const val = evalArith(p[2], vp);
      s = s.slice(0, p.index) + p[1] + val + s.slice(p.index + p[0].length);
      continue;
    }
    break;
  }
  return evalArith(s, vp);
}

function evalArith(s, vp) {
  const e = String(s)
    .replace(/\bnone\b/g, '999999')
    .replace(/([\d.]+)%/g, (_, n) => (Number(n) / 100) * vp.w)
    .replace(/([\d.]+)rem/g, (_, n) => Number(n) * 16)
    .replace(/([\d.]+)vw/g, (_, n) => (Number(n) / 100) * vp.w)
    .replace(/([\d.]+)vh/g, (_, n) => (Number(n) / 100) * vp.h)
    .replace(/([\d.]+)px/g, '$1')
    .replace(/([\d.]+)em/g, '$1'); // only used where caller multiplies by font size
  if (!/^[\d\s().+\-*/NaN]*$/.test(e)) return NaN;
  try { return Function(`"use strict";return (${e || 'NaN'})`)(); } catch { return NaN; }
}

/* ── text layout with real advances ─────────────────────────────── */
function advance(face, ch) {
  const a = FONTS[face]?.advances;
  return a?.[String(ch.codePointAt(0))] ?? 0.5;
}
function textWidth(face, str, px, trackingEm = 0) {
  let w = 0;
  for (const ch of str) w += advance(face, ch) + trackingEm;
  return w * px;
}
/** Greedy line break; returns number of lines. Honours explicit \n. */
function lineCount(face, str, px, availPx, trackingEm = 0) {
  let lines = 0;
  for (const para of str.split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) { lines += 1; continue; }
    let cur = '';
    let n = 1;
    for (const wd of words) {
      const trial = cur ? cur + ' ' + wd : wd;
      if (textWidth(face, trial, px, trackingEm) <= availPx || !cur) cur = trial;
      else { n++; cur = wd; }
    }
    lines += n;
  }
  return lines;
}

/** Pull the live hero copy out of index.html, so the audit measures the
    text that actually ships rather than a copy of it that can drift. */
function heroCopy() {
  const grab = (re, fallback) => {
    const m = HTML.match(re);
    return m ? m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : fallback;
  };
  return {
    eyebrow: grab(/class="label hero__eyebrow">([\s\S]*?)<\/p>/, "Australia's direct-from-winery marketplace"),
    title:   grab(/class="hero__title"[^>]*>([\s\S]*?)<\/h1>/, 'Buy direct from Australian wineries'),
    sub:     grab(/class="hero__text">([\s\S]*?)<\/p>/, ''),
  };
}

/* ── the audit ──────────────────────────────────────────────────── */
const CAP_W_VW = 34, CAP_H_VH = 60;
let failures = 0;
const GREEN = '\x1b[32m', RED = '\x1b[31m', YEL = '\x1b[33m', OFF = '\x1b[0m';
const tty = process.stdout.isTTY;
const c = (col, s) => (tty ? col + s + OFF : s);

console.log('\n══ GO WINE GO — LAYOUT AUDIT ════════════════════════════════════════');
console.log('Geometry resolved from assets/css/main.css. Hero copy laid out with');
console.log(`real glyph advances (${DISPLAY_FACE}, opsz instanced at 100).\n`);

const COPY = heroCopy();
console.log('HERO COPY READ FROM index.html');
console.log(`  eyebrow  "${COPY.eyebrow}"`);
console.log(`  title    "${COPY.title}"`);
console.log(`  subline  "${COPY.sub.slice(0, 60)}…"\n`);

// enumerate fixed / sticky elements once
const baseMap = declMap(rulesFor(99999));
const positioned = [];
for (const [sel, props] of baseMap) {
  if (/^(fixed|sticky)$/.test(props.position || '')) positioned.push([sel, props.position]);
}
console.log('FIXED / STICKY ELEMENTS FOUND');
for (const [sel, pos] of positioned) console.log(`  ${pos.padEnd(7)} ${sel}`);
console.log('');

const rows = [];
for (const vp of VIEWPORTS) {
  const map = declMap(rulesFor(vp.w));
  const get = (sel, prop) => map.get(sel)?.[prop];
  const R = (v) => resolve1(v, vp);

  const headerH = R(get('.site-header', 'height'));

  // --- 1. hero content top offset -------------------------------------
  const heroPadTop = (() => {
    const p = get('.hero', 'padding-top');
    if (p) return R(p);
    const sh = get('.hero', 'padding');
    if (sh) return R(sh.split(/\s+/)[0]);
    return 0;
  })();

  // Is the plate positioned out of flow (the Round 2 bug) or in flow?
  const innerPos = get('.hero__inner', 'position') || 'static';
  const heroImgH = R(get('.hero__media img', 'height'));

  // --- 2. plate box ---------------------------------------------------
  const plateW = R(get('.hero__plate', 'width'));
  const platePadDecl = get('.hero__plate', 'padding') || '0';
  const platePadParts = platePadDecl.split(/\s+/).map((x) => R(x));
  const padY = platePadParts[0], padX = platePadParts[1] ?? platePadParts[0];
  const avail = plateW - padX * 2;

  // hero copy, measured
  const fsMicro = R(get('.label', 'font-size') || TOKENS['--fs-micro']);
  const trackLabel = parseFloat(TOKENS['--tracking-label']) || 0;
  const eyebrowLines = lineCount('inter-500', COPY.eyebrow.toUpperCase(), fsMicro, avail, trackLabel);
  const eyebrowH = eyebrowLines * fsMicro * (parseFloat(TOKENS['--lh-body']) || 1.62)
                 + R(get('.hero__eyebrow', 'margin-bottom') || '0');

  const fsDisp = R(get('.hero__title', 'font-size'));
  const trackDisp = parseFloat(TOKENS['--tracking-display']) || 0;
  const titleLines = lineCount(DISPLAY_FACE, COPY.title, fsDisp, avail, trackDisp);
  const titleH = titleLines * fsDisp * (parseFloat(TOKENS['--lh-tight']) || 1.06);

  const fsLead = R(get('.hero__text', 'font-size'));
  const subLines = lineCount('inter-400', COPY.sub, fsLead, avail);
  const subH = subLines * fsLead * (parseFloat(TOKENS['--lh-body']) || 1.62)
             + R(get('.hero__text', 'margin-top') || '0');

  // The search must NOT be on the plate. If it ever returns, count it and
  // flag it, because it is what pushed the plate into the header before.
  const searchInPlate = /<div class="hero__plate">[\s\S]*?<form[^>]*class="[^"]*hero__search/.test(HTML);
  const searchH = searchInPlate ? fsLead * 1.2 + R(TOKENS['--sp-3']) * 2 : 0;

  const contentH = eyebrowH + titleH + subH + searchH;
  const plateH = contentH + padY * 2;

  const capW = (CAP_W_VW / 100) * vp.w;
  const capH = (CAP_H_VH / 100) * vp.h;
  const mobile = vp.w <= 760;

  // --- clearance ------------------------------------------------------
  // Out-of-flow plate anchored to the hero bottom: its top offset is
  // heroHeight - marginBottom - plateH, and NOTHING reserves header space.
  let plateTop, clearance, model;
  if (mobile) {
    plateTop = heroImgH; clearance = plateTop - headerH; model = 'plate below image, in flow';
  } else if (innerPos === 'absolute') {
    const mb = R(get('.hero__plate', 'margin-bottom') || '0');
    plateTop = heroImgH - mb - plateH;
    clearance = plateTop - headerH;
    model = 'absolute, bottom-anchored';
  } else {
    const heroMinH = R(get('.hero', 'min-height') || '0');
    const padBottom = R((get('.hero__inner', 'padding') || '0 0 0').split(/\s+/)[2] ?? '0');
    const heroH = Math.max(heroMinH, heroPadTop + plateH + padBottom);
    plateTop = Math.max(heroPadTop, heroH - padBottom - plateH);
    clearance = plateTop - headerH;
    model = 'in flow, padding-top reserves header';
  }

  rows.push({ vp, headerH, model, plateW, capW, plateH, capH, contentH, clearance,
              titleLines, subLines, eyebrowLines, avail, searchInPlate });
}

console.log('1. HEADER vs HERO CONTENT — clearance must not be negative');
console.log(`  ${'VIEWPORT'.padEnd(20)} ${'HEADER'.padStart(7)} ${'PLATE TOP'.padStart(10)} ${'CLEARANCE'.padStart(10)}  MODEL`);
for (const r of rows) {
  const ok = r.clearance >= 0;
  if (!ok) failures++;
  const cl = `${r.clearance.toFixed(0)}px`;
  console.log(`  ${r.vp.label.padEnd(20)} ${(r.headerH.toFixed(0) + 'px').padStart(7)} ${((r.clearance + r.headerH).toFixed(0) + 'px').padStart(10)} ${(ok ? c(GREEN, cl.padStart(10)) : c(RED, cl.padStart(10)))}  ${r.model}`);
}

console.log('\n2. PLATE vs CAPS — width 34vw, height 60vh');
console.log(`  ${'VIEWPORT'.padEnd(20)} ${'WIDTH'.padStart(8)} ${'CAP'.padStart(8)}  ${'HEIGHT'.padStart(8)} ${'CAP'.padStart(8)}  LINES (eyebrow/title/sub)`);
for (const r of rows) {
  const mobile = r.vp.w <= 760;
  // Below the breakpoint the plate is SPECIFIED as full width (it sits under
  // the photograph, not over it), so the 34vw cap does not apply there.
  const capW = mobile ? r.vp.w : r.capW;
  const wOk = mobile ? Math.abs(r.plateW - r.vp.w) < 1 : r.plateW <= capW + 0.5;
  const hOk = r.plateH <= r.capH + 0.5;
  r.capW = capW;
  if (!wOk || !hOk) failures++;
  // The search living on the plate is what grew it into the header in
  // Round 2. It is a failure in its own right, not a note: the plate can
  // still be under its cap and the arrangement still be the banned one.
  if (r.searchInPlate) failures++;
  const wS = `${r.plateW.toFixed(0)}px`, hS = `${r.plateH.toFixed(0)}px`;
  console.log(`  ${r.vp.label.padEnd(20)} ${(wOk ? c(GREEN, wS.padStart(8)) : c(RED, wS.padStart(8)))} ${(r.capW.toFixed(0) + 'px').padStart(8)}  ${(hOk ? c(GREEN, hS.padStart(8)) : c(RED, hS.padStart(8)))} ${(r.capH.toFixed(0) + 'px').padStart(8)}  ${r.eyebrowLines}/${r.titleLines}/${r.subLines}${r.searchInPlate ? c(YEL, '  [search back on the plate]') : ''}`);
}

console.log('\n3. FIXED / STICKY vs WHAT FOLLOWS — every page');
console.log(`  ${'PAGE'.padEnd(15)} ${'VIEWPORT'.padEnd(20)} ${'RESERVES'.padEnd(14)} ${'NEEDS'.padStart(7)} ${'HAS'.padStart(7)} ${'CLEARANCE'.padStart(10)}`);
for (const page of PAGES) {
  // Confirm the page really uses the selector we are about to measure,
  // so a renamed wrapper fails loudly instead of silently passing.
  const cls = page.reserves.replace('.', '');
  if (!page.html.includes(cls)) {
    failures++;
    console.log(`  ${page.file.padEnd(15)} ${c(RED, `does not use ${page.reserves} — nothing reserves the fixed header`)}`);
    continue;
  }
  for (const vp of VIEWPORTS) {
    const map = declMap(rulesFor(vp.w));
    const R = (v) => resolve1(v, vp);
    const headerH = R(map.get('.site-header')?.height);
    const reserved = R(map.get(page.reserves)?.[page.prop] || '0');
    // Below 760 the hero deliberately drops its padding: the photograph
    // moves into flow and the plate sits under it, so the image itself
    // is what clears the header.
    const viaImage = page.hero === true && vp.w <= 760;
    const heroImgSel = page.reserves + '__media img';
    const have = viaImage ? R(map.get(heroImgSel)?.height) : reserved;
    const ok = have >= headerH;
    if (!ok) failures++;
    const s = `${(have - headerH).toFixed(0)}px`;
    console.log(`  ${page.file.padEnd(15)} ${vp.label.padEnd(20)} ${(page.reserves + (viaImage ? ' img' : '')).padEnd(14)} ${(headerH.toFixed(0) + 'px').padStart(7)} ${(have.toFixed(0) + 'px').padStart(7)} ${(ok ? c(GREEN, s.padStart(10)) : c(RED, s.padStart(10)))}`);
  }
}

/* ── 4. sticky offsets ──────────────────────────────────────────────
   New in Round 3B, because wine.html introduced a sticky column. A
   sticky element with top:0 parks itself UNDER the fixed header and
   stays there — the same class of collision as the Round 2 hero plate,
   and just as invisible to a colour audit. */
console.log('\n4. STICKY OFFSET vs FIXED HEADER — sticky top must clear the header');
console.log(`  ${'ELEMENT'.padEnd(22)} ${'VIEWPORT'.padEnd(20)} ${'TOP'.padStart(7)} ${'HEADER'.padStart(7)} ${'CLEARANCE'.padStart(10)}`);
const stickySels = positioned.filter(([, pos]) => pos === 'sticky').map(([sel]) => sel);
if (!stickySels.length) { failures++; console.log(c(RED, '  no sticky elements found — this check inspected nothing')); }
for (const sel of stickySels) {
  if (STICKY_EXEMPT[sel]) {
    console.log(`  ${sel.padEnd(22)} ${'(exempt)'.padEnd(20)} ${'—'.padStart(7)} ${'—'.padStart(7)} ${c(GREEN, 'ok'.padStart(10))}  ${STICKY_EXEMPT[sel]}`);
    continue;
  }
  for (const vp of VIEWPORTS) {
    const map = declMap(rulesFor(vp.w));
    const R = (v) => resolve1(v, vp);
    const props = map.get(sel) || {};
    // A media query can drop it out of sticky entirely, which is a valid
    // answer on a single-column layout.
    if ((props.position || 'sticky') !== 'sticky') {
      console.log(`  ${sel.padEnd(22)} ${vp.label.padEnd(20)} ${'—'.padStart(7)} ${'—'.padStart(7)} ${c(GREEN, 'static'.padStart(10))}  not sticky at this width`);
      continue;
    }
    const headerH = R(map.get('.site-header')?.height);
    const top = R(props.top ?? '0');
    const ok = Number.isFinite(top) && top >= headerH;
    if (!ok) failures++;
    const s = `${(top - headerH).toFixed(0)}px`;
    console.log(`  ${sel.padEnd(22)} ${vp.label.padEnd(20)} ${(top.toFixed(0) + 'px').padStart(7)} ${(headerH.toFixed(0) + 'px').padStart(7)} ${(ok ? c(GREEN, s.padStart(10)) : c(RED, s.padStart(10)))}`);
  }
}

/* ── 5. every plate that sits over a photograph ─────────────────────
   Round 3A measured the home hero plate only. winery.html adds a second
   plate over a photograph and the closing band a third, so the width cap
   is now checked for all of them at every breakpoint. */
console.log('\n5. EVERY OVER-PHOTO PLATE vs ITS WIDTH CAP');
console.log(`  ${'PLATE'.padEnd(22)} ${'PAGE'.padEnd(14)} ${'VIEWPORT'.padEnd(20)} ${'WIDTH'.padStart(8)} ${'CAP'.padStart(8)}`);
for (const plate of PLATES) {
  const page = PAGES.find((p) => p.file === plate.page);
  if (!page || !page.html.includes(plate.sel.replace('.', ''))) {
    failures++;
    console.log(`  ${plate.sel.padEnd(22)} ${c(RED, `not found in ${plate.page}`)}`);
    continue;
  }
  for (const vp of VIEWPORTS) {
    const map = declMap(rulesFor(vp.w));
    const R = (v) => resolve1(v, vp);
    const w = R(map.get(plate.sel)?.width);
    const mobile = vp.w <= 760;
    const capVW = vp.w <= 900 ? plate.capNarrowVW : plate.capVW;
    const cap = mobile ? vp.w : (capVW / 100) * vp.w;
    // Below the breakpoint the plate is SPECIFIED full width: it sits under
    // the photograph rather than over it, so the vw cap does not apply.
    const ok = mobile ? Math.abs(w - vp.w) < 1 : w <= cap + 0.5;
    if (!ok) failures++;
    const s = `${w.toFixed(0)}px`;
    console.log(`  ${plate.sel.padEnd(22)} ${plate.page.padEnd(14)} ${vp.label.padEnd(20)} ${(ok ? c(GREEN, s.padStart(8)) : c(RED, s.padStart(8)))} ${(cap.toFixed(0) + 'px').padStart(8)}`);
  }
}

/* ── 6. header content vs the bar it has to fit in ──────────────────
   New in Round 3B, because the nav grew from three items to four when
   Go Deals, Tenders and How It Works shipped. The header is a fixed
   76px bar with no wrap, so overflowing it pushes content out of the
   viewport rather than reflowing. Measured with real glyph advances. */
console.log('\n6. HEADER CONTENT vs AVAILABLE WIDTH');
console.log(`  ${'VIEWPORT'.padEnd(20)} ${'NEEDS'.padStart(8)} ${'HAS'.padStart(8)} ${'SLACK'.padStart(8)}  CONTENT`);
const navLabels = [...HTML.matchAll(/class="site-header__tab"[^>]*>([^<]+)</g)].map((m) => m[1].trim());
const roleLabels = [...HTML.matchAll(/class="site-header__role"[^>]*><span>([^<]+)<\/span>/g)].map((m) => m[1].trim());
const loginLabel = (HTML.match(/class="site-header__login"[^>]*>([^<]+)</) || [, 'Login'])[1].trim();
const wordmark = (HTML.match(/class="site-header__wordmark">([^<]+)</) || [, 'Go Wine Go'])[1].trim();
if (!navLabels.length || !roleLabels.length) {
  failures++;
  console.log(c(RED, '  could not read the header labels — this check inspected nothing'));
}
for (const vp of VIEWPORTS) {
  const map = declMap(rulesFor(vp.w));
  const R = (v) => resolve1(v, vp);
  // The bar sheds content by media query rather than wrapping, so both
  // the nav and the role switcher can be absent at a given width.
  const navHidden = (map.get('.site-header__nav')?.display || 'flex') === 'none';
  const rolesHidden = (map.get('.site-header__roles')?.display || 'flex') === 'none';

  const logo = R(TOKENS['--icon']) + R(TOKENS['--sp-2'])
             + textWidth(DISPLAY_FACE, wordmark, R(TOKENS['--fs-mark']),
                         parseFloat(TOKENS['--tracking-display']) || 0);
  const nav = navHidden ? 0 : navLabels.reduce((sum, label) =>
    sum + textWidth('inter-400', label, R(TOKENS['--fs-sm'])) + R(TOKENS['--sp-3']) * 2, 0)
    + R(TOKENS['--sp-1']) * Math.max(0, navLabels.length - 1);
  const roles = rolesHidden ? 0 : roleLabels.reduce((sum, label) =>
    sum + textWidth('inter-400', label, R(TOKENS['--fs-xs'])) + R(TOKENS['--sp-3']) * 2, 0)
    + 4 + 2;                                            // pill padding + border
  const login = textWidth('inter-500', loginLabel, R(TOKENS['--fs-sm']))
              + R(TOKENS['--sp-4']) * 2 + 2;
  const gaps = R(TOKENS['--sp-5']) * (navHidden ? 1 : 2)
             + (rolesHidden ? 0 : R(TOKENS['--sp-3']));

  const need = logo + nav + roles + login + gaps;
  const have = Math.min(vp.w, R(TOKENS['--w-max'])) - R(TOKENS['--sp-5']) * 2;
  const ok = have >= need;
  if (!ok) failures++;
  const s = `${(have - need).toFixed(0)}px`;
  const parts = [
    navHidden ? 'nav hidden' : `nav: ${navLabels.join(' / ')}`,
    rolesHidden ? 'roles hidden' : roleLabels.join('/'),
    loginLabel,
  ].join(', ');
  console.log(`  ${vp.label.padEnd(20)} ${(need.toFixed(0) + 'px').padStart(8)} ${(have.toFixed(0) + 'px').padStart(8)} ${(ok ? c(GREEN, s.padStart(8)) : c(RED, s.padStart(8)))}  ${parts}`);
}

console.log('\n7. SEARCH INPUT vs ITS PLACEHOLDER');
for (const vp of VIEWPORTS) {
  const map = declMap(rulesFor(vp.w));
  const R = (v) => resolve1(v, vp);
  const sel = '.finder__search input';
  const fs = R(map.get(sel)?.['font-size'] || TOKENS['--fs-sm']);
  const padDecl = (map.get(sel)?.padding || '12px 16px').split(/\s+/).map((x) => R(x));
  const padX = padDecl[1] ?? padDecl[0];
  const ph = HTML.match(/id="finderSearch"[^>]*placeholder="([^"]+)"/);
  const text = ph ? ph[1] : 'Search winery, wine or subregion';
  const need = textWidth('inter-400', text, fs) + padX * 2;

  const containerPad = R(TOKENS['--sp-5']) * 2;
  const maxW = Math.min(vp.w, R(TOKENS['--w-max'] || '1280px'));
  // button width measured, not guessed: label + icon + gap + padding + border
  const btnFs = R(TOKENS['--fs-sm']);
  const btn = textWidth('inter-500', 'Search', btnFs)
            + R(TOKENS['--icon-sm']) + R(TOKENS['--sp-2']) + R(TOKENS['--sp-5']) * 2 + 2;
  const form = map.get('.finder__search');
  const column = (form?.['flex-direction'] || 'row') === 'column';
  const formMax = R(form?.['max-width'] || '99999px');
  const have = Math.min(maxW - containerPad, formMax) - (column ? 0 : btn + R(TOKENS['--sp-2']));
  const ok = have >= need;
  if (!ok) failures++;
  console.log(`  ${vp.label.padEnd(20)} needs ${need.toFixed(0).padStart(4)}px  has ${have.toFixed(0).padStart(4)}px  ${ok ? c(GREEN, 'fits') : c(RED, 'CLIPS')}   "${text}"`);
}

console.log('\n─────────────────────────────────────────────────────────────────────');
console.log(failures === 0 ? c(GREEN, 'ALL LAYOUT CHECKS PASS') : c(RED, `${failures} LAYOUT FAILURE(S)`));
console.log('');
process.exit(failures === 0 ? 0 : 1);
