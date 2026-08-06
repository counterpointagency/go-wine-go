#!/usr/bin/env python3
"""
extract-font-metrics.py — Go Wine Go

Regenerates tools/font-metrics.json from the EXACT woff2 files the site
serves. tools/layout-audit.mjs lays the hero copy out with these advances, so
the audit is only honest while this file matches the fonts the page downloads.

Round 4B self-hosted the fonts into assets/fonts, so this now reads local
files and runs offline. It no longer touches the network.

Run it whenever a font, weight or variable axis changes:

    python3 tools/extract-font-metrics.py

Requires fontTools and brotli (`pip install fonttools brotli`). Deliberately
Python and deliberately NOT wired to an npm script: a root package.json flips
DigitalOcean from the static-assets buildpack to Node and breaks the deploy.

Fraunces note. The file has wght, SOFT and WONK instanced out but opsz LEFT
LIVE, defaulting to 9. main.css therefore declares
`font-variation-settings: 'opsz' 100` explicitly, and this script instances at
opsz=100 to match. Extracting at the default would measure a 9pt text cut and
under-report every display advance.
"""

import json
import os
import sys

from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'tools', 'font-metrics.json')

# Round 4B self-hosted the fonts, so these read from assets/fonts rather
# than fetching from Google. Same files — Google was already serving one
# variable Inter for both weights — and now the extraction runs offline.
# key -> (local woff2, axis pins to instance at)
FACES = {
    'fraunces-600': ('assets/fonts/fraunces.woff2', {'opsz': 100}),
    'inter-400':    ('assets/fonts/inter.woff2',    {'wght': 400}),
    'inter-500':    ('assets/fonts/inter.woff2',    {'wght': 500}),
}

# Latin printable plus the punctuation the page actually sets.
CODEPOINTS = list(range(32, 127)) + [
    0x00B7,  # ·  card meta separator
    0x00E9,  # é
    0x2013,  # –
    0x2014,  # —
    0x2018, 0x2019,  # ‘ ’  the apostrophe in "Australia's"
    0x201C, 0x201D,  # “ ”
    0x2026,  # …
]


def main():
    out = {}
    for key, (rel, pins) in FACES.items():
        path = os.path.join(ROOT, rel)
        font = TTFont(path)
        variable = 'fvar' in font
        if variable and pins:
            axes = {a.axisTag for a in font['fvar'].axes}
            missing = set(pins) - axes
            if missing:
                raise SystemExit(f'{key}: asked to pin {missing}, not in {sorted(axes)}')
            font = instancer.instantiateVariableFont(font, pins, inplace=False)

        upem = font['head'].unitsPerEm
        cmap = font.getBestCmap()
        hmtx = font['hmtx']
        advances = {}
        for cp in CODEPOINTS:
            glyph = cmap.get(cp)
            if glyph is None:
                continue
            advances[str(cp)] = round(hmtx[glyph][0] / upem, 4)

        out[key] = {
            'advances': advances,
            'source': rel,
            'unitsPerEm': upem,
            'variable': variable,
            'instancedAt': pins or None,
        }
        print(f'{key:16} {len(advances)} glyphs  upem {upem}  '
                  f'variable={variable}  pinned={pins or "-"}')

    with open(OUT, 'w') as fh:
        json.dump(out, fh, indent=0, sort_keys=True)
        fh.write('\n')
    print(f'\nwrote {os.path.relpath(OUT, ROOT)}')


if __name__ == '__main__':
    sys.exit(main())
