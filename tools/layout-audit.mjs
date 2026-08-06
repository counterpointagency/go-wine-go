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
  { file: 'for-wineries.html',   reserves: '.winery-hero',  prop: 'padding-top', hero: true },
  { file: 'wine.html',           reserves: '.page--inner',  prop: 'padding-top' },
  { file: 'go-deals.html',       reserves: '.page--inner',  prop: 'padding-top' },
  { file: 'tenders.html',        reserves: '.page--inner',  prop: 'padding-top' },
  { file: 'how-it-works.html',   reserves: '.page--inner',  prop: 'padding-top' },
  { file: 'account.html',        reserves: '.page--inner',  prop: 'padding-top' },
  { file: 'supplier.html',       reserves: '.page--inner',  prop: 'padding-top' },
  { file: 'legal/terms.html',               reserves: '.page--inner', prop: 'padding-top' },
  { file: 'legal/privacy.html',             reserves: '.page--inner', prop: 'padding-top' },
  { file: 'legal/delivery.html',            reserves: '.page--inner', prop: 'padding-top' },
  { file: 'legal/responsible-service.html', reserves: '.page--inner', prop: 'padding-top' },
  // The error document. Reachable by mistyping a URL, never by a link, so
  // it is excluded from the menu-coverage assertion below.
  { file: '404.html', reserves: '.page--inner', prop: 'padding-top', notInMenu: true },
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
  { sel: '.winery-hero__plate', page: 'for-wineries.html', capVW: 34, capNarrowVW: 34 },
];

/* Below 760 the header nav and the account link are hidden, so a
   navigation control has to exist in their place or the site has no
   route on a phone at all. This is the check that would have caught
   Rounds 3A and 3B shipping with no mobile menu. */
const MOBILE_NAV_WIDTHS = [390, 760, 900];


/* A BOUNDED value — a postcode, a vintage, a CVC, an expiry — has a known
   maximum length and the field must render it outright. FREE TEXT cannot be
   sized for: a wine name has no maximum, and a text input scrolling its own
   content is correct behaviour, not a defect. Free-text fields are measured
   and reported, but only bounded ones fail. */
/* ── LONGEST EXPECTED VALUES ─────────────────────────────────────────
   Round 4C: the placeholder checks measured PLACEHOLDERS against inputs and
   never the VALUES those inputs hold. The market postcode was sized for a
   placeholder it could not render either — `width: 7ch` with border-box
   left a 3.63ch content box for a four-character postcode.

   These come from data/*.json wherever the data exists, so a longer price
   or a longer winery name added later fails here rather than on the page. */
const DATA = (() => {
  const j = (f) => JSON.parse(readFileSync(resolve(ROOT, 'data', f + '.json'), 'utf8'));
  const wines = j('wines').wines;
  const wineries = j('wineries').wineries;
  const tenders = j('tenders').tenders;
  const account = j('account').customer;
  const longest = (arr) => arr.map(String).reduce((a, b) => (b.length > a.length ? b : a), '');
  return {
    postcode:   longest(account.addresses.map((a) => a.postcode)),
    price:      longest(wines.map((w) => w.list_price_per_case)),
    cases:      longest(wines.map((w) => w.cases_available)),
    vintage:    longest(wines.map((w) => w.vintage)),
    wineName:   longest(wines.map((w) => w.name)),
    subregion:  longest(wines.map((w) => `${w.subregion}, ${w.gi}`)),
    tenderQty:  longest(tenders.map((t) => t.quantity_cases)),
    tenderMax:  longest(tenders.map((t) => t.max_price_per_case)),
    licence:    longest(wineries.map((w) => w.licence_number)),
    cardName:   account.name,
    cardNumber: '4242 4242 4242 4242',
    expiry:     '12 / 29',
    cvc:        '123',
    day: '31', month: '12', year: '2008',
  };
})();

/* Inputs whose width is DECLARED rather than taken from a container. The
   postcode was the only one, and it was the one that clipped. */
const FIXED_INPUTS = [
  { name: 'market postcode', sel: '.market__postcode-input', page: 'index.html',
    value: () => DATA.postcode, fs: '--fs-body' },
];

/* Where the full bar renders it must clear its content by this much. A bar
   that merely fits is one word of copy from overflowing. */
const HEADER_SLACK_TARGET = 100;


/* ── FORM CONTEXTS ──────────────────────────────────────────────────
   Every input on the site that is NOT inside an overlay. Round 2 shipped
   a search placeholder that clipped to "subregior"; that was fixed for one
   input, and then two more forms were added in 3B and 3C that nothing
   measured. `chain` is resolved from the stylesheet: start at the page
   container's max-width, subtract each nested horizontal padding.        */
const FORM_CONTEXTS = [
  {
    name: 'supplier, list a wine', page: 'supplier.html',
    chain: ['.supplier', '.supplier__form'],
    grid: '.supplier__form-grid', gap: '--sp-4', cols: 2,
    fields: [
      { ph: 'e.g. Wilyabrup, Margaret River', value: DATA.subregion, freeText: true, fs: '--fs-body', padX: '--sp-4' },
      { ph: 'e.g. Ridge Block Cabernet',      value: DATA.wineName,  freeText: true, fs: '--fs-body', padX: '--sp-4' },
    ],
  },
  {
    name: 'tenders, post a tender', page: 'tenders.html',
    chain: ['.tenders', '.tenders__form-wrap'],
    // The form sits in the 5fr column of .tenders__layout above 900.
    columnOf: { grid: '.tenders__layout', gap: '--sp-8', ratios: [5, 7], index: 0, collapseAt: 900 },
    grid: '.tenders__row', gap: '--sp-4', cols: 2,
    fields: [
      { ph: '2021', value: DATA.vintage,   fs: '--fs-body', padX: '--sp-4' },
      { ph: '300',  value: DATA.tenderMax, fs: '--fs-body', padX: '--sp-4' },
    ],
  },
  {
    name: 'for wineries, register', page: 'for-wineries.html',
    chain: ['.fw-register', '.fw-register__wrap'],
    grid: '.fw-register__row', gap: '--sp-4', cols: 2,
    fields: [{ ph: 'Producer licence number', value: DATA.licence, freeText: true, fs: '--fs-body', padX: '--sp-4' }],
  },
];

/* ── OVERLAYS ───────────────────────────────────────────────────────
   Everything positioned outside normal page flow. Round 3D found the age
   gate's Year field unreachable: its grid used bare `1fr` tracks, which are
   minmax(AUTO, 1fr), and that auto minimum is the <input>'s intrinsic
   size=20 width of ~236px. Three of them demanded 708px inside 400px of
   plate. None of these overlays had ever been measured, because every
   earlier check walked page flow and none of these are in it.

   Every width below is READ FROM THE STYLESHEET, never hardcoded here. An
   audit that carries its own copy of the numbers cannot fail when the CSS
   changes underneath it, which is worse than no audit at all.             */
const OVERLAYS = [
  {
    name: 'age gate',
    // .age-gate is the padded fixed layer; .age-gate__plate sits inside it.
    outer: '.age-gate', box: '.age-gate__plate',
    rows: [{
      ratios: [1, 1, 1.4], gap: '--sp-3',
      fields: [
        { ph: 'DD',   value: DATA.day,   fs: '--fs-body', padX: '--sp-4' },
        { ph: 'MM',   value: DATA.month, fs: '--fs-body', padX: '--sp-4' },
        { ph: 'YYYY', value: DATA.year,  fs: '--fs-body', padX: '--sp-4' },
      ],
    }],
    buttons: [{ label: 'Enter the market', fs: '--fs-sm', padX: '--sp-5', icon: true }],
  },
  {
    name: 'buy modal',
    outer: '.modal-overlay', box: '.modal', inner: '.modal__body',
    rows: [
      { ratios: [1], gap: '--sp-4',
        fields: [{ ph: '1234 5678 9012 3456', value: DATA.cardNumber, fs: '--fs-body', padX: '--sp-4' }] },
      { ratios: [1, 1], gap: '--sp-4', collapse: '.modal__grid-2',
        fields: [
          { ph: 'MM / YY', value: DATA.expiry, fs: '--fs-body', padX: '--sp-4' },
          { ph: '123',     value: DATA.cvc,    fs: '--fs-body', padX: '--sp-4' },
        ] },
      { ratios: [1], gap: '--sp-4',
        fields: [{ ph: '6285', value: DATA.postcode, fs: '--fs-body', padX: '--sp-4' }] },
    ],
    buttons: [{ label: 'Pay and place order, $340.00', fs: '--fs-sm', padX: '--sp-5', icon: false }],
  },
  {
    name: 'offer modal',
    outer: '.modal-overlay', box: '.modal', inner: '.modal__body',
    rows: [{ ratios: [1], gap: '--sp-4',
             fields: [{ ph: '0', value: DATA.price, fs: '--fs-h3', padX: '--sp-4', prefix: true }] }],
    buttons: [{ label: 'Submit offer', fs: '--fs-sm', padX: '--sp-5', icon: true }],
  },
  {
    name: 'mobile menu',
    box: '.mobile-menu__panel',
    rows: [], buttons: [],
    // Link labels wrap, so only the longest unbreakable WORD has to fit.
    words: ['Responsible', 'dashboard', 'Supplier'], wordFs: '--fs-body',
  },
  {
    name: 'toast',
    box: '.toast', widthProp: 'max-width',
    rows: [], buttons: [],
    words: ['CCF4471902AU', 'counteroffer', 'Equalisation'], wordFs: '--fs-sm',
  },
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
  { w: 901,  h: 1000, label: 'Just over 901x1000' },
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


/** Resolve a length whose percentages are relative to `basis`, not the
    viewport — the case for anything nested inside a padded overlay. */
function resolveIn(expr, vp, basis) {
  if (expr == null) return NaN;
  const substituted = String(expr).replace(/([\d.]+)%/g, (_, n) => `${(Number(n) / 100) * basis}px`);
  return resolve1(substituted, vp);
}

/** Horizontal padding from a shorthand: second value, or the first if single. */
function padXOf(map, sel, vp) {
  const decl = map.get(sel)?.padding;
  if (!decl) return 0;
  const parts = decl.trim().split(/\s+/);
  return resolve1(parts[1] ?? parts[0], vp);
}


/** Resolve a nested container chain from the stylesheet: the outermost
    max-width, then each level's horizontal padding subtracted in turn. */
function chainInner(ctx, map, vp) {
  const first = map.get(ctx.chain[0]);
  if (!first) { ctx._missing = ctx.chain[0]; return NaN; }
  let w = Math.min(vp.w, resolve1(first['max-width'] || '99999px', vp));
  for (const sel of ctx.chain) {
    if (!map.has(sel)) { ctx._missing = sel; return NaN; }
    w -= padXOf(map, sel, vp) * 2;
  }
  if (ctx.columnOf) {
    const co = ctx.columnOf;
    if (!map.has(co.grid)) { ctx._missing = co.grid; return NaN; }
    const collapsed = vp.w <= co.collapseAt;
    if (!collapsed) {
      const sum = co.ratios.reduce((a, b) => a + b, 0);
      // The chain already removed the wrap padding; add it back, split the
      // row, then take it off again for the column we actually sit in.
      const wrapPad = padXOf(map, ctx.chain[1], vp) * 2;
      const row = w + wrapPad - resolve1(tokensFor(vp.w)[co.gap], vp);
      w = row * (co.ratios[co.index] / sum) - wrapPad;
    }
  }
  ctx._missing = null;
  return w;
}

/** The usable content width inside an overlay, read from the stylesheet. */
function overlayInner(o, map, vp) {
  // A selector that no longer exists must FAIL, not silently fall back to
  // the viewport width — that would make every item "fit" inside a
  // container that is not there. Renaming a class is exactly when this
  // check most needs to speak up.
  for (const sel of [o.outer, o.box, o.inner].filter(Boolean)) {
    if (!map.has(sel)) { o._missing = sel; return NaN; }
  }
  o._missing = null;
  let basis = vp.w;
  if (o.outer) basis -= padXOf(map, o.outer, vp) * 2;
  const props = map.get(o.box) || {};
  const declared = props[o.widthProp || 'width'] ?? props['max-width'];
  let w = declared !== undefined ? resolveIn(declared, vp, basis) : basis;
  const cap = props['max-width'];
  if (cap !== undefined && !o.widthProp) w = Math.min(w, resolveIn(cap, vp, basis));
  w = Math.min(w, basis);
  w -= padXOf(map, o.box, vp) * 2;
  if (o.inner) w -= padXOf(map, o.inner, vp) * 2;
  return w;
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
  // Greedy line breaking puts an over-long word on its own line and lets it
  // overflow. Measure the widest single word against the usable plate width
  // so a headline can never break mid-word or spill past the plate edge.
  const widestWord = COPY.title.split(/\s+/)
    .reduce((w, word) => Math.max(w, textWidth(DISPLAY_FACE, word, fsDisp, trackDisp)), 0);
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
              titleLines, subLines, eyebrowLines, avail, searchInPlate, widestWord });
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
  // A word wider than the plate breaks mid-word or spills past the edge.
  if (r.widestWord > r.avail + 0.5) {
    failures++;
    console.log(`  ${''.padEnd(20)} ${c(RED, `widest headline word ${r.widestWord.toFixed(0)}px exceeds ${r.avail.toFixed(0)}px of usable plate`)}`);
  }
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
console.log(`\n6. HEADER CONTENT vs AVAILABLE WIDTH  (full bar needs ${HEADER_SLACK_TARGET}px headroom)`);
let headerChecks = 0;
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
  // The COLLAPSED search control is a real button in the bar and takes real
  // width. Only the expanded panel is absolutely positioned and free.
  const searchBtn = map.get('.site-header__search-btn');
  const menuBtn = map.get('.site-header__menu-btn');
  for (const [sel, node] of [['.site-header__search-btn', searchBtn], ['.site-header__menu-btn', menuBtn]]) {
    if (!node) { failures++; console.log(c(RED, `  ${sel} not found in the stylesheet`)); }
  }
  const searchShown = (searchBtn?.display || 'none') !== 'none';
  const searchW = searchShown ? R(searchBtn.width) + R(TOKENS['--sp-3']) : 0;
  // The menu button is a real flex item too, and was never being counted.
  const menuShown = (menuBtn?.display || 'none') !== 'none';
  const menuW = menuShown ? R(menuBtn.width) + R(TOKENS['--sp-3']) : 0;

  const logo = R(TOKENS['--icon']) + R(TOKENS['--sp-2'])
             + textWidth(DISPLAY_FACE, wordmark, R(TOKENS['--fs-mark']),
                         parseFloat(TOKENS['--tracking-display']) || 0);
  const nav = navHidden ? 0 : navLabels.reduce((sum, label) =>
    sum + textWidth('inter-400', label, R(TOKENS['--fs-sm'])) + R(TOKENS['--sp-3']) * 2, 0)
    + R(TOKENS['--sp-1']) * Math.max(0, navLabels.length - 1);
  const roles = rolesHidden ? 0 : roleLabels.reduce((sum, label) =>
    sum + textWidth('inter-400', label, R(TOKENS['--fs-xs'])) + R(TOKENS['--sp-3']) * 2, 0)
    + 4 + 2;                                            // pill padding + border
  // The account link is hidden below the header breakpoint too. Counting a
  // control that is not rendered inflates the need and hides real slack —
  // the same mistake as not counting one that is.
  const loginEl = map.get('.site-header__login');
  if (!loginEl) { failures++; console.log(c(RED, '  .site-header__login not found in the stylesheet')); }
  const loginShown = (loginEl?.display || 'inline-block') !== 'none';
  const login = loginShown
    ? textWidth('inter-500', loginLabel, R(TOKENS['--fs-sm'])) + R(TOKENS['--sp-4']) * 2 + 2
    : 0;
  const gaps = R(TOKENS['--sp-5']) * (navHidden ? 1 : 2)
             + (rolesHidden ? 0 : R(TOKENS['--sp-3']));

  const need = logo + nav + roles + login + gaps + searchW + menuW;
  const have = Math.min(vp.w, R(TOKENS['--w-max'])) - R(TOKENS['--sp-5']) * 2;
  // Where the FULL bar renders it must have room to breathe, not merely fit.
  // 36px of slack at 834 is what sent the breakpoint to 900 in Round 4B; a
  // headroom target is what stops it eroding back one word at a time.
  const target = navHidden ? 0 : HEADER_SLACK_TARGET;
  const ok = have - need >= target;
  if (!ok) failures++;
  headerChecks++;
  const s = `${(have - need).toFixed(0)}px`;
  const parts = [
    navHidden ? 'nav hidden' : `nav: ${navLabels.join(' / ')}`,
    rolesHidden ? 'roles hidden' : roleLabels.join('/'),
    loginShown ? loginLabel : 'account in drawer',
    searchShown ? 'search' : 'search in drawer',
    menuShown ? 'menu' : null,
  ].filter(Boolean).join(', ');
  console.log(`  ${vp.label.padEnd(20)} ${(need.toFixed(0) + 'px').padStart(8)} ${(have.toFixed(0) + 'px').padStart(8)} ${(ok ? c(GREEN, s.padStart(8)) : c(RED, s.padStart(8)))}  ${parts}`);
}

/* ── 8. a reachable navigation control on a phone ───────────────────
   New in Round 3C. Rounds 3A and 3B both shipped with the header nav
   hidden below 760 and nothing in its place, so the footer was the
   only route through the site on a phone. Nothing measured that,
   because every individual element was correctly sized — the failure
   was an ABSENCE. This asserts the presence. */
if (!headerChecks) { failures++; console.log(c(RED, '  header check inspected nothing')); }
else console.log(`  ${headerChecks} widths inspected`);

console.log('\n7. NAVIGATION REACHABLE ON A PHONE');
console.log(`  ${'WIDTH'.padStart(6)}  ${'HEADER NAV'.padEnd(12)} ${'MENU BUTTON'.padEnd(12)} RESULT`);
for (const w of MOBILE_NAV_WIDTHS) {
  const map = declMap(rulesFor(w));
  const navShown = (map.get('.site-header__nav')?.display || 'flex') !== 'none';
  const btnShown = (map.get('.site-header__menu-btn')?.display || 'none') !== 'none';
  const ok = navShown || btnShown;
  if (!ok) failures++;
  console.log(`  ${(w + 'px').padStart(6)}  ${(navShown ? 'visible' : 'hidden').padEnd(12)} ${(btnShown ? 'visible' : 'hidden').padEnd(12)} ` +
    (ok ? c(GREEN, 'reachable') : c(RED, 'NO ROUTE THROUGH THE SITE')));
}

// ...and the drawer it opens has to actually reach every page.
const menuHrefs = [...HTML.matchAll(/class="mobile-menu__link"[^>]*href="([^"]+)"/g)].map((m) => m[1]);
const missingFromMenu = PAGES
  .filter((p) => !p.notInMenu)
  .map((p) => '/' + p.file)
  .filter((href) => !menuHrefs.includes(href));
if (!menuHrefs.length) {
  failures++;
  console.log(c(RED, '  no mobile menu links found — this check inspected nothing'));
} else if (missingFromMenu.length) {
  failures++;
  console.log(`  ${c(RED, 'MISSING from the menu:')} ${missingFromMenu.join(', ')}`);
} else {
  console.log(`  ${'(menu)'.padStart(6)}  reaches all ${PAGES.filter((p) => !p.notInMenu).length} linked pages ${c(GREEN, 'ok')}`);
}


/* ── 9. overlays fit their own containers ───────────────────────────── */
console.log('\n9. OVERLAY CONTENT vs ITS OWN CONTAINER');
console.log(`  ${'OVERLAY'.padEnd(13)} ${'VIEWPORT'.padEnd(20)} ${'ITEM'.padEnd(26)} ${'NEEDS'.padStart(7)} ${'HAS'.padStart(7)}  RESULT`);
let overlayChecks = 0;
for (const o of OVERLAYS) {
  for (const vp of VIEWPORTS) {
    const map = declMap(rulesFor(vp.w));
    const T = (t) => resolve1(tokensFor(vp.w)[t] ?? t, vp);
    const inner = overlayInner(o, map, vp);
    if (!Number.isFinite(inner)) {
      failures++;
      console.log(`  ${o.name.padEnd(13)} ${c(RED, `could not resolve ${o._missing || o.box} from the stylesheet`)}`);
      continue;
    }

    for (const row of o.rows) {
      // A grid that collapses to one column at this width is one track.
      const collapsed = row.collapse &&
        (map.get(row.collapse)?.['grid-template-columns'] || '').replace(/minmax\([^)]*\)/g, 'M').trim() === 'M';
      const ratios = collapsed ? [1] : row.ratios;
      const fields = collapsed ? row.fields.slice(0, 1) : row.fields;
      const avail = inner - T(row.gap) * (ratios.length - 1);
      const sum = ratios.reduce((a, b) => a + b, 0);
      fields.forEach((f, i) => {
        const track = avail * (ratios[i] / sum);
        const prefix = f.prefix ? T('--sp-3') * 2 + 12 : 0;
        // The longer of the placeholder and the longest value it will hold.
        const widest = [f.ph, f.value].filter(Boolean)
          .reduce((a, b) => (textWidth('inter-400', b, T(f.fs)) > textWidth('inter-400', a, T(f.fs)) ? b : a));
        const need = textWidth('inter-400', widest, T(f.fs)) + T(f.padX) * 2 + 2 + prefix;
        const ok = track >= need;
        overlayChecks++;
        if (!ok) failures++;
        console.log(`  ${o.name.padEnd(13)} ${vp.label.padEnd(20)} ${('input "' + widest + '"').slice(0, 26).padEnd(26)} ${(need.toFixed(0) + 'px').padStart(7)} ${(track.toFixed(0) + 'px').padStart(7)}  ` + (ok ? c(GREEN, 'fits') : c(RED, 'CLIPPED')));
      });
    }

    for (const b of o.buttons) {
      const need = textWidth('inter-500', b.label, T(b.fs)) + T(b.padX) * 2 + 2
                 + (b.icon ? T('--icon-sm') + T('--sp-2') : 0);
      const ok = inner >= need;
      overlayChecks++;
      if (!ok) failures++;
      console.log(`  ${o.name.padEnd(13)} ${vp.label.padEnd(20)} ${('button "' + b.label + '"').slice(0, 26).padEnd(26)} ${(need.toFixed(0) + 'px').padStart(7)} ${(inner.toFixed(0) + 'px').padStart(7)}  ` + (ok ? c(GREEN, 'fits') : c(RED, 'CLIPPED')));
    }

    for (const w of (o.words || [])) {
      const need = textWidth('inter-400', w, T(o.wordFs));
      const ok = inner >= need;
      overlayChecks++;
      if (!ok) failures++;
      console.log(`  ${o.name.padEnd(13)} ${vp.label.padEnd(20)} ${('word "' + w + '"').slice(0, 26).padEnd(26)} ${(need.toFixed(0) + 'px').padStart(7)} ${(inner.toFixed(0) + 'px').padStart(7)}  ` + (ok ? c(GREEN, 'fits') : c(RED, 'CLIPPED')));
    }
  }
}
if (!overlayChecks) { failures++; console.log(c(RED, '  no overlay items inspected — this check ran on nothing')); }

/* ── 10. no grid track with an implicit auto minimum ─────────────────
   `1fr` is minmax(auto, 1fr). Where the item is a form control that auto
   minimum is the control's intrinsic width, and the track refuses to shrink
   below it — exactly how the age gate lost its Year field. Every flexible
   track must state its own minimum. */
console.log('\n10. GRID TRACKS DECLARE THEIR MINIMUM');
const bareFr = [];
let trackDecls = 0;
for (const [, sel, decl] of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
  const m = decl.match(/grid-template-columns:\s*([^;]+);/);
  if (!m) continue;
  trackDecls++;
  const stripped = m[1].replace(/minmax\([^)]*\)/g, 'MINMAX');
  if (/(^|[\s,(])\d*\.?\d+fr/.test(stripped)) {
    bareFr.push(`${sel.trim().split('\n').pop().trim()} → ${m[1].trim()}`);
  }
}
if (bareFr.length) {
  failures += bareFr.length;
  bareFr.forEach((b) => console.log(`  ${c(RED, 'bare fr')} ${b}`));
} else {
  console.log(`  ${c(GREEN, 'every flexible track states an explicit minimum')}  (${trackDecls} declarations inspected)`);
}


/* ── 11. every placeholder outside an overlay fits its input ────────── */
console.log('\n11. FORM PLACEHOLDERS vs THEIR INPUTS');
console.log(`  ${'FORM'.padEnd(24)} ${'VIEWPORT'.padEnd(20)} ${'PLACEHOLDER'.padEnd(32)} ${'NEEDS'.padStart(7)} ${'HAS'.padStart(7)}  RESULT`);
let formChecks = 0;
for (const ctx of FORM_CONTEXTS) {
  for (const vp of VIEWPORTS) {
    const map = declMap(rulesFor(vp.w));
    const T = (t) => resolve1(tokensFor(vp.w)[t] ?? t, vp);
    const inner = chainInner(ctx, map, vp);
    if (!Number.isFinite(inner)) {
      failures++;
      console.log(`  ${ctx.name.padEnd(24)} ${c(RED, `could not resolve ${ctx._missing} from the stylesheet`)}`);
      continue;
    }
    const gridDecl = (map.get(ctx.grid)?.['grid-template-columns'] || '')
      .replace(/minmax\([^)]*\)/g, 'M').trim();
    const cols = gridDecl === 'M' ? 1 : ctx.cols;
    const track = (inner - T(ctx.gap) * (cols - 1)) / cols;
    for (const f of ctx.fields) {
      const widest = [f.ph, f.value].filter(Boolean)
        .reduce((a, b) => (textWidth('inter-400', b, T(f.fs)) > textWidth('inter-400', a, T(f.fs)) ? b : a));
      const need = textWidth('inter-400', widest, T(f.fs)) + T(f.padX) * 2 + 2;
      const ok = track >= need;
      const free = f.freeText && widest === f.value;
      formChecks++;
      if (!ok && !free) failures++;
      const verdict = ok ? c(GREEN, 'fits') : free ? c(YEL, 'scrolls') : c(RED, 'CLIPS');
      console.log(`  ${ctx.name.padEnd(24)} ${vp.label.padEnd(20)} ${('"' + widest + '"').slice(0, 32).padEnd(32)} ${(need.toFixed(0) + 'px').padStart(7)} ${(track.toFixed(0) + 'px').padStart(7)}  ` + verdict);
    }
  }
}
if (!formChecks) { failures++; console.log(c(RED, '  no form fields inspected — this check ran on nothing')); }


/* ── 12. the producer licence number reads as one token ─────────────
   It is the Model A trust signal, rendered at --fs-h3 in an auto-fit grid.
   At a 180px track it broke across two lines at its own hyphens from 834
   up. Measured against the REAL licence numbers in data/wineries.json, so
   a longer one added later fails here rather than on the page. */
console.log('\n12. PRODUCER LICENCE NUMBER vs ITS CREDENTIALS TRACK');
const wineriesData = JSON.parse(readFileSync(resolve(ROOT, 'data/wineries.json'), 'utf8'));
const longestLicence = wineriesData.wineries
  .map((w) => w.licence_number)
  .reduce((a, b) => (b.length > a.length ? b : a), '');
let licenceChecks = 0;
for (const vp of VIEWPORTS) {
  const map = declMap(rulesFor(vp.w));
  const R = (v) => resolve1(v, vp);
  const grid = map.get('.credentials__grid');
  const outer = map.get('.credentials');
  if (!grid || !outer) { failures++; console.log(c(RED, '  .credentials__grid not found in the stylesheet')); break; }
  const container = Math.min(vp.w, R(TOKENS['--w-max'])) - padXOf(map, '.credentials', vp) * 2;
  const gap = R(grid.gap);
  const min = R((grid['grid-template-columns'].match(/minmax\((\d+px)/) || [, '0'])[1]);
  const fit = Math.max(1, Math.floor((container + gap) / (min + gap)));
  const cols = Math.min(fit, wineriesData.wineries.length ? 4 : 1);   // four credential items
  const track = (container - gap * (cols - 1)) / cols;
  const need = textWidth('inter-500', longestLicence, R(TOKENS['--fs-h3']));
  const ok = track >= need;
  licenceChecks++;
  if (!ok) failures++;
  console.log(`  ${vp.label.padEnd(20)} ${cols} cols  track ${(track.toFixed(0) + 'px').padStart(7)}  "${longestLicence}" needs ${(need.toFixed(0) + 'px').padStart(7)}  ` +
    (ok ? c(GREEN, 'one line') : c(RED, 'BREAKS AT ITS HYPHENS')));
}
if (!licenceChecks) { failures++; console.log(c(RED, '  licence check ran on nothing')); }

/* ── 13. the search field, in both places it now lives ─────────────
   Round 4A removed the home-page finder band and moved search into the
   header (above 760) and the mobile drawer (below it). The old check
   silently fell back to a default selector and a default placeholder when
   the finder disappeared, and went on reporting a number for a thing that
   was not on the page. Every value here is read from the stylesheet and
   the markup, and a missing selector is a failure. */
console.log('\n13. SEARCH FIELD vs ITS PLACEHOLDER');
console.log(`  ${'SURFACE'.padEnd(14)} ${'VIEWPORT'.padEnd(20)} ${'NEEDS'.padStart(7)} ${'HAS'.padStart(7)}  RESULT`);

const headerPh = (HTML.match(/id="headerSearch"[^>]*placeholder="([^"]+)"/s)
               || HTML.match(/placeholder="([^"]+)"[^>]*id="headerSearch"/s) || [])[1];
const drawerPh = (HTML.match(/id="menuSearch"[^>]*placeholder="([^"]+)"/s)
               || HTML.match(/placeholder="([^"]+)"[^>]*id="menuSearch"/s) || [])[1];
if (!headerPh || !drawerPh) {
  failures++;
  console.log(c(RED, '  could not read the search placeholders from index.html'));
}

for (const vp of VIEWPORTS) {
  const map = declMap(rulesFor(vp.w));
  const R = (v) => resolve1(v, vp);
  const T = (t) => R(tokensFor(vp.w)[t] ?? t);

  /* ── header: the panel is absolutely positioned inside
        .site-header__inner, inset by --sp-5 on both sides. It shares its
        row with a submit button and a close button. ── */
  const panel = map.get('.site-header__search-panel');
  const input = map.get('.site-header__search-input');
  const close = map.get('.site-header__search-close');
  const btnShown = (map.get('.site-header__search-btn')?.display || 'none') !== 'none';
  if (!panel || !input || !close) {
    failures++;
    console.log(`  ${'header'.padEnd(14)} ${vp.label.padEnd(20)} ${c(RED, 'search panel selectors not found in the stylesheet')}`);
  } else if (btnShown) {
    const innerW = Math.min(vp.w, R(TOKENS['--w-max']));
    const panelW = innerW - R(panel.left) - R(panel.right);
    const gap = R(panel.gap);
    const submitW = textWidth('inter-500', 'Search', T('--fs-sm'))
                  + T('--sp-3') * 2 + 2;                 // .btn--sm padding
    const closeW = R(close.width);
    const padX = (input.padding || '').split(/\s+/).map((x) => R(x))[1] ?? 0;
    const have = panelW - submitW - closeW - gap * 2;
    const need = textWidth('inter-400', headerPh || '', R(input['font-size'])) + padX * 2 + 2;
    const ok = have >= need;
    if (!ok) failures++;
    console.log(`  ${'header'.padEnd(14)} ${vp.label.padEnd(20)} ${(need.toFixed(0) + 'px').padStart(7)} ${(have.toFixed(0) + 'px').padStart(7)}  ` +
      (ok ? c(GREEN, 'fits') : c(RED, 'CLIPS')) + `   "${headerPh}"`);
  } else {
    console.log(`  ${'header'.padEnd(14)} ${vp.label.padEnd(20)} ${'—'.padStart(7)} ${'—'.padStart(7)}  ${c(GREEN, 'in the drawer')}`);
  }

  /* ── drawer: a full-width field inside .mobile-menu__panel ── */
  const dPanel = map.get('.mobile-menu__panel');
  const dInput = map.get('.mobile-menu__search-input');
  if (!dPanel || !dInput) {
    failures++;
    console.log(`  ${'drawer'.padEnd(14)} ${vp.label.padEnd(20)} ${c(RED, 'drawer search selectors not found in the stylesheet')}`);
  } else {
    const have = R(dPanel.width) - padXOf(map, '.mobile-menu__panel', vp) * 2;
    const padX = (dInput.padding || '').split(/\s+/).map((x) => R(x))[1] ?? 0;
    const need = textWidth('inter-400', drawerPh || '', R(dInput['font-size'])) + padX * 2 + 2;
    const ok = have >= need;
    if (!ok) failures++;
    console.log(`  ${'drawer'.padEnd(14)} ${vp.label.padEnd(20)} ${(need.toFixed(0) + 'px').padStart(7)} ${(have.toFixed(0) + 'px').padStart(7)}  ` +
      (ok ? c(GREEN, 'fits') : c(RED, 'CLIPS')) + `   "${drawerPh}"`);
  }
}


/* ── 14. inputs whose width is DECLARED, not inherited ──────────────
   The market postcode declared `width: 7ch`. box-sizing is border-box
   globally, so that 7ch carried 32px of padding and 2px of border and left
   a 3.63ch content box — for a four-character postcode. It clipped its own
   value AND its own placeholder, and nothing saw it, because every earlier
   check measured a placeholder against a grid TRACK and this input has no
   track: it sets its own width.

   Widths are resolved from the stylesheet, so changing the CSS changes the
   verdict. Values come from data/*.json. */
console.log('\n14. FIXED-WIDTH INPUTS vs THE VALUE THEY HOLD');
console.log(`  ${'INPUT'.padEnd(24)} ${'VIEWPORT'.padEnd(20)} ${'VALUE'.padEnd(10)} ${'NEEDS'.padStart(7)} ${'CONTENT'.padStart(8)}  RESULT`);
let fixedChecks = 0;
for (const fi of FIXED_INPUTS) {
  for (const vp of VIEWPORTS) {
    const map = declMap(rulesFor(vp.w));
    const R = (v) => resolve1(v, vp);
    const rule = map.get(fi.sel);
    if (!rule) {
      failures++;
      console.log(`  ${fi.name.padEnd(24)} ${c(RED, `${fi.sel} not found in the stylesheet`)}`);
      continue;
    }
    const fs = R(rule['font-size'] ?? tokensFor(vp.w)[fi.fs]);
    // `ch` is the advance of "0" in the element's own font.
    const chPx = FONTS['inter-400'].advances['48'] * fs;
    const declared = resolve1(String(rule.width).replace(/([\d.]+)ch/g, (_, n) => `${Number(n) * chPx}px`), vp);
    const padParts = String(rule.padding ?? '0').split(/\s+/).map((x) => R(x));
    const padX = padParts[1] ?? padParts[0];
    const border = R(tokensFor(vp.w)['--bw']) * 2;
    const content = declared - padX * 2 - border;   // border-box
    const value = fi.value();
    const need = textWidth('inter-400', value, fs);
    const ok = content >= need;
    fixedChecks++;
    if (!ok) failures++;
    console.log(`  ${fi.name.padEnd(24)} ${vp.label.padEnd(20)} ${('"' + value + '"').padEnd(10)} ${(need.toFixed(0) + 'px').padStart(7)} ${(content.toFixed(0) + 'px').padStart(8)}  ` +
      (ok ? c(GREEN, `fits, ${(content - need).toFixed(0)}px spare`) : c(RED, `CLIPS by ${(need - content).toFixed(0)}px`)));
  }
}
if (!fixedChecks) { failures++; console.log(c(RED, '  no fixed-width inputs inspected — this check ran on nothing')); }

/* ── 15. a control group shares one height ──────────────────────────
   "Deliver to", the postcode and Clear were 22.7px, 51.9px and 39.1px,
   centred against each other. Three heights centred is three loose parts,
   not a control. */
console.log('\n15. CONTROL GROUPS SHARE A HEIGHT');
const GROUPS = [
  { name: 'market postcode', parts: ['.market__postcode-label', '.market__postcode-input', '.market__postcode .btn'] },
];
let groupChecks = 0;
for (const g of GROUPS) {
  for (const vp of VIEWPORTS) {
    const map = declMap(rulesFor(vp.w));
    const heights = g.parts.map((sel) => {
      const rule = map.get(sel);
      if (!rule) return null;
      return rule.height ? resolve1(rule.height, vp) : null;
    });
    const missing = g.parts.filter((sel, i) => heights[i] === null);
    groupChecks++;
    if (missing.length) {
      failures++;
      console.log(`  ${g.name.padEnd(20)} ${vp.label.padEnd(20)} ${c(RED, 'no shared height on ' + missing.join(', '))}`);
      continue;
    }
    const same = heights.every((h) => Math.abs(h - heights[0]) < 0.5);
    if (!same) failures++;
    console.log(`  ${g.name.padEnd(20)} ${vp.label.padEnd(20)} ${heights.map((h) => h.toFixed(0) + 'px').join(' / ').padEnd(22)} ` +
      (same ? c(GREEN, 'one control') : c(RED, 'MISMATCHED')));
  }
}
if (!groupChecks) { failures++; console.log(c(RED, '  no control groups inspected')); }


console.log('\n─────────────────────────────────────────────────────────────────────');
console.log(failures === 0 ? c(GREEN, 'ALL LAYOUT CHECKS PASS') : c(RED, `${failures} LAYOUT FAILURE(S)`));
console.log('');
process.exit(failures === 0 ? 0 : 1);
