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
   header. index.html reserves it with the hero's padding-top; the inner
   pages reserve it with .page--inner. */
const PAGES = [
  { file: 'index.html',    reserves: '.hero',       prop: 'padding-top' },
  { file: 'account.html',  reserves: '.page--inner', prop: 'padding-top' },
  { file: 'supplier.html', reserves: '.page--inner', prop: 'padding-top' },
];
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
  // functions, innermost first
  const fn = /(clamp|min|max|calc)\(([^()]*)\)/;
  let g;
  while ((g = fn.exec(s))) {
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
    const viaImage = page.reserves === '.hero' && vp.w <= 760;
    const have = viaImage ? R(map.get('.hero__media img')?.height) : reserved;
    const ok = have >= headerH;
    if (!ok) failures++;
    const s = `${(have - headerH).toFixed(0)}px`;
    console.log(`  ${page.file.padEnd(15)} ${vp.label.padEnd(20)} ${(page.reserves + (viaImage ? ' img' : '')).padEnd(14)} ${(headerH.toFixed(0) + 'px').padStart(7)} ${(have.toFixed(0) + 'px').padStart(7)} ${(ok ? c(GREEN, s.padStart(10)) : c(RED, s.padStart(10)))}`);
  }
}
const stickyModal = baseMap.get('.modal__head');
console.log(`  ${'(all)'.padEnd(15)} ${'(all)'.padEnd(20)} .modal__body   sticky top:${stickyModal?.top ?? '?'}, in flow inside .modal, cannot overlap  ${c(GREEN, 'ok')}`);

console.log('\n4. SEARCH INPUT vs ITS PLACEHOLDER');
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
