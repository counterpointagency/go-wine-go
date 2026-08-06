#!/usr/bin/env node
/**
 * build-images.mjs — Go Wine Go
 *
 * Emits width variants of every photograph in AVIF, WebP and JPEG, from the
 * largest JPEG already in assets/img. Each source halves down to about
 * 400px, so a phone fetches roughly a quarter of the pixels a desktop does.
 *
 * The largest variant keeps the file name the page already uses, so the
 * `src` fallback and the width/height attributes stay exactly as they are
 * and nothing shifts on load. Smaller variants get a -<width> suffix and
 * are only ever reached through srcset.
 *
 * Every variant stays under the 300KB ceiling; the quality ladder steps
 * down until it does, and the tool reports any variant that cannot.
 *
 * Deliberately Node calling out to Python's Pillow rather than a JS image
 * library: adding one would mean a package.json, and a package.json at the
 * repo root is what broke the Round 2 deploy.
 *
 * Usage: node tools/build-images.mjs [--check]
 *   --check  report what is missing or oversized, write nothing. Exit 1 on
 *            a problem, so it can gate a deploy.
 */

import { readdirSync, statSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const IMG = join(ROOT, 'assets/img');
const CEILING = 300 * 1024;
const CHECK = process.argv.includes('--check');

const GREEN = '\x1b[32m', RED = '\x1b[31m', DIM = '\x1b[2m', OFF = '\x1b[0m';
const tty = process.stdout.isTTY;
const c = (col, s) => (tty ? col + s + OFF : s);

/** Widths for a source: halve down to ~400, largest first. */
export function widthsFor(w) {
  const out = [];
  let cur = w;
  while (cur >= 400) { out.push(cur); cur = Math.round(cur / 2); }
  return out.length ? out : [w];
}

const PY = `
import json, sys, os
from PIL import Image
plan = json.loads(sys.argv[1])
ceiling = ${CEILING}
out = []
for base, widths in plan.items():
    src = Image.open(base + '.jpg').convert('RGB')
    for w in widths:
        h = round(w * src.height / src.width)
        im = src if w == src.width else src.resize((w, h), Image.LANCZOS)
        stem = base if w == widths[0] else f'{base}-{w}'
        for ext, kw in (('jpg', {'format': 'JPEG', 'optimize': True, 'progressive': True}),
                        ('webp', {'format': 'WEBP', 'method': 6}),
                        ('avif', {'format': 'AVIF'})):
            path = f'{stem}.{ext}'
            for q in (82, 76, 70, 64, 58, 52, 46):
                im.save(path, quality=q, **kw)
                if os.path.getsize(path) <= ceiling:
                    break
            out.append([os.path.relpath(path), w, h, os.path.getsize(path), q])
print(json.dumps(out))
`;

const bases = [...new Set(readdirSync(IMG)
  .filter((f) => f.endsWith('.jpg') && !/-\d+\.jpg$/.test(f))
  .map((f) => join(IMG, f.replace(/\.jpg$/, ''))))].sort();

const plan = {};
for (const b of bases) {
  const [w] = execFileSync('python3', ['-c',
    'from PIL import Image;import sys;print(Image.open(sys.argv[1]).size[0])', b + '.jpg'])
    .toString().trim().split(/\s+/).map(Number);
  plan[b] = widthsFor(w);
}

console.log('\n══ GO WINE GO — IMAGE VARIANTS ══════════════════════════════════════\n');
console.log(`${bases.length} photographs, ${Object.values(plan).reduce((n, v) => n + v.length, 0)} widths, 3 formats each`);
console.log(`ceiling ${CEILING / 1024}KB per variant\n`);

if (CHECK) {
  let missing = 0, over = 0, n = 0;
  for (const [b, widths] of Object.entries(plan)) {
    for (const w of widths) {
      const stem = w === widths[0] ? b : `${b}-${w}`;
      for (const ext of ['jpg', 'webp', 'avif']) {
        n++;
        const p = `${stem}.${ext}`;
        if (!existsSync(p)) { missing++; console.log(c(RED, `  missing  ${p.replace(ROOT + '/', '')}`)); continue; }
        const size = statSync(p).size;
        if (size > CEILING) { over++; console.log(c(RED, `  ${(size / 1024).toFixed(0)}KB  over ceiling  ${p.replace(ROOT + '/', '')}`)); }
      }
    }
  }
  console.log(`\n  ${n} variants inspected`);
  console.log(missing || over
    ? c(RED, `  ${missing} missing, ${over} over the ${CEILING / 1024}KB ceiling`)
    : c(GREEN, `  every variant present and under ${CEILING / 1024}KB`));
  process.exit(missing || over ? 1 : 0);
}

const written = JSON.parse(execFileSync('python3', ['-c', PY, JSON.stringify(plan)],
  { maxBuffer: 64 * 1024 * 1024 }).toString());

let over = 0;
const byBase = {};
for (const [path, w, h, size, q] of written) {
  const key = path.replace(/(-\d+)?\.(jpg|webp|avif)$/, '');
  (byBase[key] ||= []).push({ path, w, h, size, q });
  if (size > CEILING) over++;
}
for (const [key, rows] of Object.entries(byBase)) {
  console.log(`  ${key.replace('assets/img/', '')}`);
  for (const r of rows) {
    const flag = r.size > CEILING ? c(RED, ' OVER') : '';
    console.log(`    ${String(r.w).padStart(5)}px  ${r.path.split('.').pop().padEnd(4)} ` +
      `${(Math.round(r.size / 1024) + 'KB').padStart(7)}  ${c(DIM, 'q' + r.q)}${flag}`);
  }
}
console.log(`\n  ${written.length} variants written`);
console.log(over ? c(RED, `  ${over} over the ceiling`) : c(GREEN, `  all under ${CEILING / 1024}KB`));
process.exit(over ? 1 : 0);
