#!/usr/bin/env python3
"""
extract-font-metrics.py — Go Wine Go

Regenerates tools/font-metrics.json from the EXACT woff2 files Google Fonts
serves for the request assets/css/main.css makes. tools/layout-audit.mjs lays
the hero copy out with these advances, so the audit is only honest while this
file matches the fonts the page actually downloads.

Run it whenever a font, weight or variable axis changes:

    python3 tools/extract-font-metrics.py

Requires fontTools and brotli (`pip install fonttools brotli`). Deliberately
Python and deliberately NOT wired to an npm script: a root package.json flips
DigitalOcean from the static-assets buildpack to Node and breaks the deploy.

Fraunces note. Google serves Fraunces with wght, SOFT and WONK instanced out
but opsz LEFT LIVE, defaulting to 9. The `@100` in the css2 URL only selects
which file is served; it does not pin the axis. main.css therefore declares
`font-variation-settings: 'opsz' 100` explicitly, and this script instances at
opsz=100 to match. Extracting at the default would measure a 9pt text cut and
under-report every display advance.
"""

import json
import os
import re
import sys
import urllib.request

from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'tools', 'font-metrics.json')

# A real browser UA, or Google returns the legacy TTF stylesheet instead of woff2.
UA = ('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/120.0 Safari/537.36')

# key -> (css2 query, @font-face font-weight to match, axis pins to instance at)
FACES = {
    'fraunces-600': ('Fraunces:opsz,wght,SOFT,WONK@100,600,0,0', '600', {'opsz': 100}),
    'inter-400':    ('Inter:wght@400', '400', {}),
    'inter-500':    ('Inter:wght@500', '500', {}),
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


def fetch(url, binary=False):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req) as r:
        data = r.read()
    return data if binary else data.decode('utf-8')


def latin_woff2_url(css, weight):
    """The /* latin */ @font-face block for the requested weight."""
    blocks = re.split(r'/\*\s*([\w-]+)\s*\*/', css)
    # re.split with one group yields [pre, name, body, name, body, ...]
    for i in range(1, len(blocks) - 1, 2):
        name, body = blocks[i], blocks[i + 1]
        if name != 'latin':
            continue
        if not re.search(r'font-weight:\s*' + re.escape(weight) + r'\s*;', body):
            continue
        m = re.search(r'url\((https://[^)]+\.woff2)\)', body)
        if m:
            return m.group(1)
    raise SystemExit(f'No /* latin */ woff2 at weight {weight} in the served CSS')


def main():
    out = {}
    for key, (query, weight, pins) in FACES.items():
        css_url = f'https://fonts.googleapis.com/css2?family={query}&display=swap'
        url = latin_woff2_url(fetch(css_url), weight)

        tmp = os.path.join(ROOT, 'tools', '.tmp-font.woff2')
        with open(tmp, 'wb') as fh:
            fh.write(fetch(url, binary=True))

        try:
            font = TTFont(tmp)
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
                'source': url.rsplit('/', 1)[-1].split('.')[0][:40],
                'unitsPerEm': upem,
                'variable': variable,
                'instancedAt': pins or None,
            }
            print(f'{key:16} {len(advances)} glyphs  upem {upem}  '
                  f'variable={variable}  pinned={pins or "-"}')
        finally:
            os.remove(tmp)

    with open(OUT, 'w') as fh:
        json.dump(out, fh, indent=0, sort_keys=True)
        fh.write('\n')
    print(f'\nwrote {os.path.relpath(OUT, ROOT)}')


if __name__ == '__main__':
    sys.exit(main())
