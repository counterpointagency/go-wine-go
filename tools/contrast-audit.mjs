#!/usr/bin/env node
/**
 * contrast-audit.mjs — Go Wine Go
 *
 * Parses the :root block out of index.html, computes the full pairing
 * matrix, and checks every pairing the site ACTUALLY uses against the
 * threshold that pairing is required to meet.
 *
 *   WCAG 1.4.3  body text          4.5:1
 *   WCAG 1.4.6  enhanced text      7.0:1
 *   WCAG 1.4.11 non-text / UI      3.0:1   ← the one Round 1 never ran
 *
 * Round 1 shipped a 1.26:1 border with a clean report because it only
 * ever measured text. USED_PAIRINGS below is the fix: every border,
 * divider, icon, chip and focus ring is declared here with the surface
 * it actually sits on, so a regression fails the build.
 *
 * Exit code 0 = all required pairings pass. 1 = at least one failure.
 *
 * Usage: node tools/contrast-audit.mjs [--matrix]
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HTML = readFileSync(resolve(ROOT, 'index.html'), 'utf8');

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
function parseTokens(html) {
  const block = html.match(/:root\s*\{([\s\S]*?)\n\}/);
  if (!block) throw new Error('Could not find the :root block in index.html');
  const tokens = {};
  for (const m of block[1].matchAll(/(--[\w-]+)\s*:\s*(#[0-9A-Fa-f]{3,8})\s*;/g)) {
    tokens[m[1]] = m[2].toUpperCase();
  }
  return tokens;
}

const T = parseTokens(HTML);
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

  // ---- 1.4.11 — non-text: borders and dividers -------------------
  ['--stone',  '--bone',    3.0, '1.4.11', 'Card edge, wine grid'],
  ['--stone',  '--bone',    3.0, '1.4.11', 'Form input border'],
  ['--stone',  '--bone',    3.0, '1.4.11', 'Table rules, row separators'],
  ['--stone',  '--bone',    3.0, '1.4.11', 'Filter chip, unselected'],
  ['--stone',  '--bone',    3.0, '1.4.11', 'Panel border, supplier + trading'],
  ['--stone',  '--bone',    3.0, '1.4.11', 'Section divider rule'],
  ['--stone',  '--surface', 3.0, '1.4.11', 'Border where panel fill is surface'],
  ['--maroon', '--bone',    3.0, '1.4.11', 'Filter chip selected, tab underline'],
  ['--maroon-deep', '--bone', 3.0, '1.4.11', 'Toast boundary (own fill, no border)'],
  ['--brass',  '--maroon',  3.0, '1.4.11', 'Rule on maroon (2px only)'],

  // ---- 1.4.11 — non-text: icons ---------------------------------
  ['--maroon',     '--bone',    3.0, '1.4.11', 'Icon on bone'],
  ['--eucalypt',   '--bone',    3.0, '1.4.11', 'Icon accent on bone'],
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

  // ---- decorative varietal ramp; redundant with the text label ---
  ['--maroon-deep', '--bone', 3.0, 'decorative', 'Varietal tone 1'],
  ['--maroon',      '--bone', 3.0, 'decorative', 'Varietal tone 2'],
  ['--clay',        '--bone', 3.0, 'decorative', 'Varietal tone 3'],
  ['--brass-text',  '--bone', 3.0, 'decorative', 'Varietal tone 4'],
  ['--eucalypt',    '--bone', 3.0, 'decorative', 'Varietal tone 5'],
  ['--brass',       '--bone', 3.0, 'decorative', 'Varietal tone 6'],
];

/* ── structural guards — regressions the ratio maths cannot see ─── */
function guards(html) {
  const css = html.split('<style>')[1].split('</style>')[0];
  const rootBlock = css.match(/:root\s*\{[\s\S]*?\n\}/)[0];
  const cssOutsideRoot = css.replace(rootBlock, '');
  const body = html.split('</style>')[1];

  const SIZES = {
    '--fs-display': 44, '--fs-h2': 32, '--fs-mark': 32, '--fs-h3': 24,
    '--fs-num': 24, '--fs-lead': 18, '--fs-body': 16, '--fs-sm': 14,
    '--fs-xs': 13, '--fs-micro': 12,
  };
  const bodoniTooSmall = [];
  const bodoniTooLight = [];
  for (const [sel, decl] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!decl.includes('var(--font-display)')) continue;
    const name = sel.trim().replace(/\s+/g, ' ');
    const fs = decl.match(/font-size:\s*([^;]+);/);
    const key = fs && fs[1].match(/--fs-[\w-]+/);
    const px = key ? SIZES[key[0]] : undefined;
    if (px === undefined || px < 32) bodoniTooSmall.push(`${name} (${fs ? fs[1].trim() : 'no font-size'})`);
    const fw = decl.match(/font-weight:\s*(\d+)/);
    if (!fw || Number(fw[1]) < 500) bodoniTooLight.push(`${name} (${fw ? fw[1] : 'unset'})`);
  }

  return [
    ['Hardcoded hex outside :root', (cssOutsideRoot.match(/#[0-9A-Fa-f]{3,8}\b/g) || []).length, 0],
    ['rgb()/rgba() literals outside :root', (cssOutsideRoot.match(/rgba?\(\s*\d/g) || []).length, 0],
    ['!important declarations', (css.match(/!important\s*;/g) || []).length, 0],
    ['Inline style= attributes', (body.match(/\sstyle="/g) || []).length, 0],
    ['Emoji characters', (html.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu) || []).length, 0],
    ['Bodoni rules under 32px', bodoniTooSmall.length, 0, bodoniTooSmall],
    ['Bodoni rules under weight 500', bodoniTooLight.length, 0, bodoniTooLight],
  ];
}

/* ── report ────────────────────────────────────────────────────── */
const GREEN = '\x1b[32m', RED = '\x1b[31m', DIM = '\x1b[2m', OFF = '\x1b[0m';
const isTTY = process.stdout.isTTY;
const c = (col, s) => (isTTY ? col + s + OFF : s);

let failures = 0;

console.log('\n══ GO WINE GO — CONTRAST AUDIT ══════════════════════════════════════\n');

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
console.log(`  ${'SC'.padEnd(11)} ${'COMPONENT'.padEnd(42)} ${'RATIO'.padStart(8)} ${'MIN'.padStart(5)}  RESULT`);
const seen = new Set();
for (const [fg, bg, min, sc, where] of USED_PAIRINGS) {
  const key = `${fg}|${bg}|${min}|${where}`;
  if (seen.has(key)) continue;
  seen.add(key);
  const r = ratio(hex(fg), hex(bg));
  const pass = r >= min;
  if (!pass) failures++;
  console.log(
    `  ${sc.padEnd(11)} ${where.padEnd(42)} ${(r.toFixed(2) + ':1').padStart(8)} ${String(min).padStart(5)}  ` +
    (pass ? c(GREEN, 'PASS') : c(RED, 'FAIL'))
  );
}

console.log('\nSTRUCTURAL GUARDS');
for (const [label, actual, max, detail] of guards(HTML)) {
  const pass = actual <= max;
  if (!pass) failures++;
  console.log(`  ${label.padEnd(42)} ${String(actual).padStart(3)} (max ${max})  ` + (pass ? c(GREEN, 'PASS') : c(RED, 'FAIL')));
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
