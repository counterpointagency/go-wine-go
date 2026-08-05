#!/usr/bin/env node
/**
 * contrast-audit.mjs — Go Wine Go
 *
 * Parses the :root block out of assets/css/main.css, computes the full
 * pairing matrix, and checks every pairing the site ACTUALLY uses against
 * the threshold that pairing is required to meet.
 *
 *   WCAG 1.4.3  body text          4.5:1
 *   WCAG 1.4.6  enhanced text      7.0:1
 *   WCAG 1.4.11 non-text / UI      3.0:1   ← the one Round 1 never ran
 *
 * Round 1 shipped a 1.26:1 border with a clean report because it only
 * ever measured text. USED_PAIRINGS below is the fix: every border,
 * divider, icon, chip, progress bar and focus ring is declared here with
 * the surface it actually sits on, so a regression fails the build.
 *
 * WHEN YOU ADD A COMPONENT, ADD ITS PAIRING TO USED_PAIRINGS. The audit
 * is only as good as that list — that is exactly how Round 1 passed
 * while failing.
 *
 * Exit code 0 = all required pairings pass. 1 = at least one failure.
 *
 * Usage: node tools/contrast-audit.mjs [--matrix]
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/* Round 3A split the single file into three pages plus one shared
   stylesheet. The structural guards run over ALL of them, so a hardcoded
   colour cannot hide in the page that happens not to be checked. */
const CSS_FILE = 'assets/css/main.css';
const JS_FILE = 'assets/js/main.js';
const HTML_FILES = ['index.html', 'account.html', 'supplier.html'];

const CSS = readFileSync(resolve(ROOT, CSS_FILE), 'utf8');
const JS = readFileSync(resolve(ROOT, JS_FILE), 'utf8');
const HTML = Object.fromEntries(
  HTML_FILES.map((f) => [f, readFileSync(resolve(ROOT, f), 'utf8')]),
);

/* ── colour maths ──────────────────────────────────────────────── */
const srgb = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

function luminance(hex) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
  return 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
}

function ratio(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

/* ── parse the :root block ─────────────────────────────────────── */
function parseTokens(css) {
  const block = css.match(/:root\s*\{([\s\S]*?)\n\}/);
  if (!block) throw new Error(`Could not find the :root block in ${CSS_FILE}`);
  const tokens = {};
  for (const m of block[1].matchAll(/(--[\w-]+)\s*:\s*(#[0-9A-Fa-f]{3,8})\s*;/g)) {
    tokens[m[1]] = m[2].toUpperCase();
  }
  return tokens;
}

const T = parseTokens(CSS);
const has = (n) => Object.prototype.hasOwnProperty.call(T, n);
const hex = (n) => {
  if (!has(n)) throw new Error(`Token ${n} is referenced by the audit but missing from :root`);
  return T[n];
};

/* ── the pairings the site actually renders ────────────────────────
   fg, bg, minimum ratio, WCAG SC, and where it appears.            */
const USED_PAIRINGS = [
  // ---- 1.4.3 / 1.4.6 — text -------------------------------------
  ['--ink',            '--bone',    4.5, '1.4.3', 'Body copy'],
  ['--ink-soft',       '--bone',    4.5, '1.4.3', 'Secondary copy'],
  ['--maroon',         '--bone',    4.5, '1.4.3', 'Headings, hero plate type'],
  ['--brass-text',     '--bone',    4.5, '1.4.3', 'Eyebrow labels, links'],
  ['--eucalypt',       '--bone',    4.5, '1.4.3', 'Success text'],
  ['--clay',           '--bone',    4.5, '1.4.3', 'Alert / offer state text'],
  ['--ink',            '--surface', 4.5, '1.4.3', 'Body on raised panel'],
  ['--ink-soft',       '--surface', 4.5, '1.4.3', 'Secondary on panel, inactive pill'],
  ['--maroon',         '--surface', 4.5, '1.4.3', 'Panel headings'],
  ['--eucalypt',       '--surface', 4.5, '1.4.3', 'Accepted pill text'],
  ['--clay',           '--surface', 4.5, '1.4.3', 'Pending pill text'],
  ['--bone',           '--maroon',  4.5, '1.4.3', 'Text on maroon panel / header / footer'],
  ['--on-maroon-soft', '--maroon',  4.5, '1.4.3', 'Secondary text on maroon'],
  ['--bone',           '--maroon-deep', 4.5, '1.4.3', 'Toast text'],
  ['--bone',           '--eucalypt',    4.5, '1.4.3', 'Success modal header text'],

  // Round 3A sections
  ['--ink',        '--bone', 4.5, '1.4.3', 'Trust strip copy'],
  ['--maroon',     '--bone', 4.5, '1.4.3', 'Region tile name, Go Deal price'],
  ['--ink-soft',   '--bone', 4.5, '1.4.3', 'Region tile blurb, Go Deal stats'],
  ['--ink',        '--bone', 4.5, '1.4.3', 'Closing band copy on the bone plate'],
  ['--brass-text', '--bone', 4.5, '1.4.3', 'Closing band eyebrow on the bone plate'],
  ['--ink-soft',   '--bone', 4.5, '1.4.3', 'Wine card tax line'],

  // ---- 1.4.11 — non-text: borders and dividers -------------------
  ['--stone',  '--bone',    3.0, '1.4.11', 'Card edge, wine grid'],
  ['--stone',  '--bone',    3.0, '1.4.11', 'Form input border'],
  ['--stone',  '--bone',    3.0, '1.4.11', 'Table rules, row separators'],
  ['--stone',  '--bone',    3.0, '1.4.11', 'Filter chip, unselected'],
  ['--stone',  '--bone',    3.0, '1.4.11', 'Panel border, supplier + account'],
  ['--stone',  '--bone',    3.0, '1.4.11', 'Section divider rule'],
  ['--stone',  '--bone',    3.0, '1.4.11', 'Trust strip bottom rule'],
  ['--stone',  '--bone',    3.0, '1.4.11', 'Region tile edge and image rule'],
  ['--stone',  '--bone',    3.0, '1.4.11', 'Go Deal card edge and next-tier rule'],
  ['--stone',  '--bone',    3.0, '1.4.11', 'Mobile plate bottom rule, hero + closing'],
  ['--stone',  '--surface', 3.0, '1.4.11', 'Border where panel fill is surface'],
  ['--stone',  '--surface', 3.0, '1.4.11', 'Go Deal progress track boundary'],
  ['--maroon', '--bone',    3.0, '1.4.11', 'Filter chip selected, tab underline'],
  ['--maroon-deep', '--bone', 3.0, '1.4.11', 'Toast boundary (own fill, no border)'],
  ['--brass',  '--maroon',  3.0, '1.4.11', 'Rule on maroon (2px only)'],

  // The progress FILL is not the sole indicator — the track carries a
  // --stone boundary and the cases committed are stated in text beside
  // it — but the fill still has to read against the track it sits in.
  ['--maroon', '--surface', 3.0, '1.4.11', 'Go Deal progress fill vs its track'],

  // ---- 1.4.11 — non-text: icons ---------------------------------
  ['--maroon',     '--bone',    3.0, '1.4.11', 'Icon on bone'],
  ['--eucalypt',   '--bone',    3.0, '1.4.11', 'Icon accent on bone'],
  ['--eucalypt',   '--bone',    3.0, '1.4.11', 'Trust strip icons on bone'],
  ['--brass-text', '--bone',    3.0, '1.4.11', 'Icon on bone, brass family'],
  ['--ink-soft',   '--bone',    3.0, '1.4.11', 'Muted icon on bone'],
  ['--eucalypt',   '--surface', 3.0, '1.4.11', 'Icon on raised panel'],
  ['--clay',       '--surface', 3.0, '1.4.11', 'Alert icon on raised panel'],
  ['--bone',       '--maroon',  3.0, '1.4.11', 'Icon on maroon panel'],
  ['--maroon-deep','--bone',    3.0, '1.4.11', 'Header marks over hero sky (see note)'],

  // ---- 1.4.11 / 2.4.13 — two-colour focus ring, technique C40 ----
  // 1.4.11 requires the indicator to contrast against ADJACENT colours —
  // the surface it sits on and the control fill it wraps. The boundary
  // BETWEEN the two ring colours is not itself a success criterion, which
  // is the whole point of C40: only one of the pair has to carry any given
  // surface. eucalypt carries light surfaces, brass carries maroon ones.
  ['--eucalypt', '--bone',        3.0, '1.4.11', 'Focus ring outer vs page'],
  ['--eucalypt', '--surface',     3.0, '1.4.11', 'Focus ring outer vs panel'],
  ['--brass',    '--maroon',      3.0, '1.4.11', 'Focus ring inner vs solid button fill'],
  ['--brass',    '--maroon-deep', 3.0, '1.4.11', 'Focus ring inner vs toast fill'],
  ['--brass',    '--bone',        3.0, '1.4.11', 'Focus ring inner vs light control fill'],

  // ---- decorative; redundant with a --stone line or a text label --
  ['--brass',       '--bone', 3.0, 'decorative', 'Plate inner hairline, hero + closing'],
  ['--maroon-deep', '--bone', 3.0, 'decorative', 'Varietal tone 1'],
  ['--maroon',      '--bone', 3.0, 'decorative', 'Varietal tone 2'],
  ['--clay',        '--bone', 3.0, 'decorative', 'Varietal tone 3'],
  ['--brass-text',  '--bone', 3.0, 'decorative', 'Varietal tone 4'],
  ['--eucalypt',    '--bone', 3.0, 'decorative', 'Varietal tone 5'],
  ['--brass',       '--bone', 3.0, 'decorative', 'Varietal tone 6'],
];

/* ── structural guards — regressions the ratio maths cannot see ───
   The prose guards below run over the SHIPPED text with comments
   stripped. A comment that explains why a word is banned must not be
   the thing that trips the ban — otherwise the only way to keep the
   audit green is to stop documenting the rule. */
const stripHtmlComments = (s) => s.replace(/<!--[\s\S]*?-->/g, '');
const stripBlockComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const stripLineComments = (s) => s.replace(/^\s*\/\/.*$/gm, '');

function guards() {
  const rootBlock = CSS.match(/:root\s*\{[\s\S]*?\n\}/)[0];
  const cssOutsideRoot = CSS.replace(rootBlock, '');
  const bodies = HTML_FILES.map((f) => HTML[f]).join('\n');

  // What the browser and the reader actually get.
  const shippedMarkup = stripHtmlComments(bodies);
  const shippedCss = stripBlockComments(CSS);
  const shippedJs = stripLineComments(stripBlockComments(JS));
  const shippedAll = shippedMarkup + shippedCss + shippedJs;

  const SIZES = {
    '--fs-hero-title': 32, '--fs-h2': 32, '--fs-mark': 32, '--fs-h3': 24,
    '--fs-num': 24, '--fs-lead': 18, '--fs-body': 16, '--fs-sm': 14,
    '--fs-xs': 13, '--fs-micro': 12,
  };

  /* The display face is Fraunces now, but the rule that killed Round 1's
     headline is unchanged and is enforced the same way: display type is
     32px and up, weight 600, and never in a UI control, label, chip,
     table header or button. Inter takes everything below 32px. */
  const displayTooSmall = [];
  const displayTooLight = [];
  const displayNoAxes = [];

  // The weight token, resolved once from :root rather than per rule.
  const DISPLAY_WEIGHT = Number((rootBlock.match(/--display-weight:\s*(\d+)/) || [])[1]) || 0;

  /* NOTE, and this one matters. Until Round 3A this loop destructured
     `[sel, decl]` off matchAll, which binds sel to the WHOLE match and
     decl to the selector — so `decl.includes('var(--font-display)')` was
     never true, every display rule was skipped, and all three guards
     below reported 0 while checking nothing at all. The Bodoni guards
     that were supposed to be protecting Rounds 2 and 3 never ran. The
     leading comma is the fix; displayRulesChecked is reported so a
     vacuous pass is visible instead of silent. */
  let displayRulesChecked = 0;
  for (const [, sel, decl] of CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!decl.includes('var(--font-display)')) continue;
    displayRulesChecked++;
    const name = sel.trim().replace(/\s+/g, ' ').split('\n').pop().trim();

    const fs = decl.match(/font-size:\s*([^;]+);/);
    const key = fs && fs[1].match(/--fs-[\w-]+/);
    const px = key ? SIZES[key[0]] : undefined;
    if (px === undefined || px < 32) displayTooSmall.push(`${name} (${fs ? fs[1].trim() : 'no font-size'})`);

    const fw = decl.match(/font-weight:\s*([^;]+);/);
    const raw = fw ? fw[1].trim() : '';
    const weight = /^\d+$/.test(raw) ? Number(raw)
                 : raw.includes('--display-weight') ? DISPLAY_WEIGHT
                 : 0;
    if (weight < 500) displayTooLight.push(`${name} (${raw || 'unset'})`);

    // Google leaves Fraunces' opsz axis live at a default of 9. Any rule
    // that sets the display face and does not pin opsz would silently
    // render a text cut instead of the 100 the spec calls for.
    if (!decl.includes('font-variation-settings')) displayNoAxes.push(name);
  }

  const opszPinned = /--display-axes:\s*'opsz'\s*100\s*;/.test(rootBlock);

  /* The header, footer and icon sprite must be BYTE IDENTICAL across all
     three pages, because each becomes get_header() / get_footer() / a sprite
     include in the theme. index.html is the source of truth; run
     `node tools/sync-shared-blocks.mjs` to push it to the other two. */
  const sharedDrift = [];
  const BLOCKS = [
    ['header', '<!-- ═══ SECTION: SITE HEADER', '</header>\n'],
    ['footer', '<!-- ═══ SECTION: SITE FOOTER', '</footer>\n'],
    ['sprite', '<!-- ═══ SHARED: ICON SPRITE', '</svg>\n'],
  ];
  for (const [label, open_, close] of BLOCKS) {
    const src = HTML['index.html'];
    const i = src.indexOf(open_);
    if (i < 0) { sharedDrift.push(`${label}: not found in index.html`); continue; }
    const block = src.slice(i, src.indexOf(close, i) + close.length);
    for (const f of HTML_FILES) {
      if (!HTML[f].includes(block)) sharedDrift.push(`${label} block differs in ${f}`);
    }
  }

  return [
    ['Hardcoded hex outside :root', (cssOutsideRoot.match(/#[0-9A-Fa-f]{3,8}\b/g) || []).length, 0],
    ['rgb()/rgba() literals outside :root', (cssOutsideRoot.match(/rgba?\(\s*\d/g) || []).length, 0],
    ['!important declarations', (shippedCss.match(/!important/g) || []).length, 0],
    ['Inline style= attributes', (shippedMarkup.match(/\sstyle="/g) || []).length, 0],
    ['Inline on*= event handlers', (shippedMarkup.match(/\son(?:click|change|input|submit|load)="/g) || []).length, 0],
    ['Emoji characters', (shippedAll.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu) || []).length, 0],
    ['Bodoni Moda still shipped', ((shippedMarkup + shippedCss).match(/Bodoni/gi) || []).length, 0],
    ['"escrow" anywhere in shipped output', (shippedAll.match(/escrow/gi) || []).length, 0],
    ['"auction" / "bid" in shipped copy', (shippedMarkup.match(/\b(auction|bidder|bidding)\b/gi) || []).length, 0],
    // If this ever reads 0 the three guards below are checking nothing.
    ['Display rules actually inspected (must be > 0)', displayRulesChecked > 0 ? 0 : 1, 0,
      [`inspected ${displayRulesChecked} rules using var(--font-display)`]],
    ['Display rules under 32px', displayTooSmall.length, 0, displayTooSmall],
    ['Display rules under weight 500', displayTooLight.length, 0, displayTooLight],
    ['Display rules not pinning opsz', displayNoAxes.length, 0, displayNoAxes],
    ['--display-axes pins opsz 100', opszPinned ? 0 : 1, 0],
    ['Header/footer/sprite byte identical across pages', sharedDrift.length, 0, sharedDrift],
  ];
}

/* ── report ────────────────────────────────────────────────────── */
const GREEN = '\x1b[32m', RED = '\x1b[31m', DIM = '\x1b[2m', OFF = '\x1b[0m';
const isTTY = process.stdout.isTTY;
const c = (col, s) => (isTTY ? col + s + OFF : s);

let failures = 0;

console.log('\n══ GO WINE GO — CONTRAST AUDIT ══════════════════════════════════════\n');
console.log(`Stylesheet  ${CSS_FILE}`);
console.log(`Pages       ${HTML_FILES.join(', ')}\n`);

console.log('TOKENS PARSED FROM :root');
const colourTokens = Object.entries(T);
for (const [n, v] of colourTokens) {
  console.log(`  ${n.padEnd(18)} ${v}   L=${luminance(v).toFixed(4)}   ${ratio(v, hex('--bone')).toFixed(2)}:1 on bone`);
}

if (process.argv.includes('--matrix')) {
  console.log('\nFULL PAIRING MATRIX (every token against every other)');
  const names = colourTokens.map(([n]) => n.replace('--', ''));
  const w = 13;
  console.log('  ' + ''.padEnd(w) + names.map((n) => n.slice(0, 8).padStart(9)).join(''));
  colourTokens.forEach(([n1, v1]) => {
    const row = colourTokens.map(([, v2]) => {
      const r = ratio(v1, v2);
      return (r === 1 ? '—' : r.toFixed(2)).padStart(9);
    }).join('');
    console.log('  ' + n1.replace('--', '').padEnd(w) + row);
  });
}

console.log('\nFULL PAIRING MATRIX — THRESHOLDS CLEARED (3.0 / 4.5 / 7.0)');
console.log(`  ${'PAIR'.padEnd(34)} ${'RATIO'.padStart(8)}   3.0  4.5  7.0`);
for (let i = 0; i < colourTokens.length; i++) {
  for (let j = i + 1; j < colourTokens.length; j++) {
    const [n1, v1] = colourTokens[i];
    const [n2, v2] = colourTokens[j];
    const r = ratio(v1, v2);
    const mark = (t) => (r >= t ? c(GREEN, ' ok ') : c(DIM, '  · '));
    console.log(`  ${(n1.replace('--', '') + ' / ' + n2.replace('--', '')).padEnd(34)} ${(r.toFixed(2) + ':1').padStart(8)}  ${mark(3)} ${mark(4.5)} ${mark(7)}`);
  }
}

console.log('\nPAIRINGS THE SITE ACTUALLY RENDERS — REQUIRED THRESHOLDS');
console.log(`  ${'SC'.padEnd(11)} ${'COMPONENT'.padEnd(46)} ${'RATIO'.padStart(8)} ${'MIN'.padStart(5)}  RESULT`);
const seen = new Set();
for (const [fg, bg, min, sc, where] of USED_PAIRINGS) {
  const key = `${fg}|${bg}|${min}|${where}`;
  if (seen.has(key)) continue;
  seen.add(key);
  const r = ratio(hex(fg), hex(bg));
  const pass = r >= min;
  if (!pass) failures++;
  console.log(
    `  ${sc.padEnd(11)} ${where.padEnd(46)} ${(r.toFixed(2) + ':1').padStart(8)} ${String(min).padStart(5)}  ` +
    (pass ? c(GREEN, 'PASS') : c(RED, 'FAIL'))
  );
}

console.log('\nSTRUCTURAL GUARDS');
for (const [label, actual, max, detail] of guards()) {
  const pass = actual <= max;
  if (!pass) failures++;
  console.log(`  ${label.padEnd(46)} ${String(actual).padStart(3)} (max ${max})  ` + (pass ? c(GREEN, 'PASS') : c(RED, 'FAIL')));
  if (!pass && detail) detail.forEach((d) => console.log(`      → ${d}`));
}

console.log('\n─────────────────────────────────────────────────────────────────────');
if (failures === 0) {
  console.log(c(GREEN, `ALL CHECKS PASS — ${seen.size} rendered pairings + structural guards`));
} else {
  console.log(c(RED, `${failures} FAILURE(S) — see FAIL rows above`));
}
console.log('');

process.exit(failures === 0 ? 0 : 1);
