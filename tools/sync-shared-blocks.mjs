#!/usr/bin/env node
/**
 * sync-shared-blocks.mjs — Go Wine Go
 *
 * The header, footer and icon sprite must be BYTE IDENTICAL across
 * index.html, account.html and supplier.html, because each becomes
 * get_header(), get_footer() and a sprite include in the WordPress theme.
 *
 * index.html is the source of truth. Edit the block there, then run this to
 * push it into the other two pages.
 *
 * This is NOT a build step. The site is served exactly as it sits in the
 * repo, with no compilation and no manifest at the repo root. This only
 * exists so the three copies cannot drift by hand — and if they ever do,
 * tools/contrast-audit.mjs fails on it whether or not you ran this.
 *
 * Usage:
 *   node tools/sync-shared-blocks.mjs          # write the changes
 *   node tools/sync-shared-blocks.mjs --check  # report only, exit 1 on drift
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = 'index.html';
const TARGETS = [
  'wine.html', 'winery.html', 'go-deals.html', 'tenders.html', 'how-it-works.html',
  'account.html', 'for-wineries.html', 'supplier.html',
  'legal/terms.html', 'legal/privacy.html', 'legal/delivery.html',
  'legal/responsible-service.html',
];
const CHECK = process.argv.includes('--check');

/** label, opening marker, closing marker (inclusive). */
const BLOCKS = [
  ['sprite',  '<!-- ═══ SHARED: ICON SPRITE',   '</svg>\n'],
  ['agegate', '<!-- ═══ SHARED: AGE GATE',      '</div>\n</div>\n'],
  ['header',  '<!-- ═══ SECTION: SITE HEADER',  '</header>\n'],
  ['footer',  '<!-- ═══ SECTION: SITE FOOTER',  '</footer>\n'],
];

const GREEN = '\x1b[32m', RED = '\x1b[31m', DIM = '\x1b[2m', OFF = '\x1b[0m';
const tty = process.stdout.isTTY;
const c = (col, s) => (tty ? col + s + OFF : s);

function extract(text, [label, open, close], file) {
  const i = text.indexOf(open);
  if (i < 0) throw new Error(`${file}: no ${label} block (missing "${open}")`);
  const j = text.indexOf(close, i);
  if (j < 0) throw new Error(`${file}: ${label} block is never closed by "${close.trim()}"`);
  return text.slice(i, j + close.length);
}

const source = readFileSync(resolve(ROOT, SOURCE), 'utf8');
let drift = 0;
let written = 0;

console.log(`\nShared blocks, source of truth: ${SOURCE}\n`);

for (const file of TARGETS) {
  const path = resolve(ROOT, file);
  let text = readFileSync(path, 'utf8');
  let changed = false;

  for (const block of BLOCKS) {
    const [label] = block;
    const want = extract(source, block, SOURCE);
    const have = extract(text, block, file);
    if (want === have) {
      console.log(`  ${c(GREEN, 'same')}  ${file} ${label} ${c(DIM, `(${Buffer.byteLength(want)} bytes)`)}`);
      continue;
    }
    drift++;
    console.log(`  ${c(RED, 'DIFF')}  ${file} ${label} ${c(DIM, `(${Buffer.byteLength(have)} → ${Buffer.byteLength(want)} bytes)`)}`);
    if (!CHECK) { text = text.replace(have, want); changed = true; }
  }

  if (changed) { writeFileSync(path, text, 'utf8'); written++; }
}

console.log('');
if (CHECK) {
  console.log(drift === 0
    ? c(GREEN, 'All shared blocks are byte identical.')
    : c(RED, `${drift} block(s) have drifted. Run without --check to fix.`));
  process.exit(drift === 0 ? 0 : 1);
}
console.log(drift === 0
  ? c(GREEN, 'Nothing to do — all shared blocks were already byte identical.')
  : c(GREEN, `Synced ${drift} block(s) across ${written} file(s).`));
console.log('');
