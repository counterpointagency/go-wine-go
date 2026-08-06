# Go Wine Go — Project Rules

Static prototype for an Australian direct-from-winery wine marketplace.
Autodeploy is ON. The live URL has been shared with the client.

**Model A: the winery is the seller, Go Wine Go is the market.** Go Wine Go
never holds money. Nothing says escrow, auction or bid. The full specification
is `docs/site-spec.md`.

As of Round 4C the build is fourteen pages — `index.html` (home and market),
`wine.html`, `winery.html`, `go-deals.html`, `tenders.html`,
`how-it-works.html`, `account.html`, `for-wineries.html`, `supplier.html`,
`404.html`, and four drafts under `legal/` — over one shared
`assets/css/main.css`, a per-page ES module graph under `assets/js/`, and
hand-authored content in `data/*.json`.

**All paths are root-relative** (`/assets/...`, `/data/...`, `/index.html`).
They have to be: the header, footer, sprite and age gate are byte identical
across every page, and a relative path cannot be byte identical in both the
repo root and `legal/`. This also means the site must be SERVED, never opened
from the file system.

`wine.html` and `winery.html` are slug driven: `wine.html?slug=<wine>`,
`winery.html?slug=<winery>`. That is what becomes `single-wine.php` and
`single-winery.php`. Both fall back to the first record rather than erroring
when the parameter is missing.

---

# CURRENT STATE

*Read this first. It is the orientation for a new session.*

## 1. Where the build is

**Live:** https://winescape-dou7g.ondigitalocean.app
**App:** `winescape`, id `934123b6-db7b-4c6e-a53e-34ccac8ceab8`, region syd

| | Commit | Status |
|---|---|---|
| Serving on the live URL | `e3aee2d` (Round 4B) | ACTIVE |
| Head of `main` | `446135f` (Round 4C) | pushed, **not deployed** |

> **Round 4C is pushed but not live.** DigitalOcean's webhook did not fire
> across 30 minutes of polling, and the `doctl` token is READ ONLY for apps —
> `doctl apps create-deployment` returns 403. Until a write-scope token is
> issued, a missed webhook needs a manual **Force Rebuild** from the
> DigitalOcean console (Apps → winescape → Deploy). Nothing else is needed;
> the commit is already the head of `main`. **The market postcode still clips
> its own value on the live site until that happens.**

Rounds completed, and what shipped in each:

| Round | Shipped |
|---|---|
| 1 | Design system, header and hero, cascade across all sections. Grid, offer modal and supplier dashboard restyled, not restructured |
| 2 | Contrast rebuild. Round 1 measured only 1.4.3 and never 1.4.11, so every border failed AA. `--stone`, `--eucalypt`, `--clay`; hero wash removed; two-colour focus rings; `contrast-audit.mjs` |
| 3 | Layout fix. Header transparency keyed to the hero's bottom edge collided the plate with the header at −110px. `layout-audit.mjs` |
| 3A | Split the 1,487-line single file into three pages over one stylesheet and one script. Content to `data/*.json`. Bodoni retired for Fraunces. Every scrim deleted |
| 3B | Customer side: wine detail, winery profile, Go Deals, tenders, how it works, account. `policy.json` as the single compliance source |
| 3C | Supply side and compliance: for-wineries, supplier dashboard to spec 4.8, four legal drafts, age gate, BDR notice, mobile menu, root-relative paths |
| 3D | Legibility and overflow. Age gate Year field was unreachable. Body copy floor raised to 16px, touch targets to 44px |
| 4A | Every flow completed on fake data: search into the header, territory enforced, `localStorage` persistence, dead ends closed, 404, robots, noindex |
| 4B | Performance and accessibility. Header breakpoint to 900. JS split into a module graph, −52% across a crawl. AVIF/WebP/JPEG srcset. Fonts self-hosted |
| 4C | Market postcode clipped its own value: `width: 7ch` under border-box left a 3.63ch content box. `--control-h` unified the control group |

## 2. What is verified, and what is not

**Every measurement in this project is static analysis.** The audits parse
CSS, resolve values at four viewports, and lay text out using real glyph
advances extracted from the actual woff2 files. That is genuinely more than
eyeballing — it caught a −110px collision, an unreachable form field and a
clipped postcode — but it is not rendering.

**No browser has ever been used to verify this site. No screen reader has
ever opened it.** Kalani's visual sign-off is the only thing that has looked
at rendered output, and it is separate from anything the audits claim.

**Verified** — measured, and every check proven by breaking it first:

- Colour: 74 rendered pairings against 4.5 / 7.0 / 3.0
- Geometry: header clearance, plate caps, sticky offsets, overlay fit, grid
  track minimums, form placeholders and values, control group heights
- Structure: 30 guards across 14 pages — no hex outside `:root`, no inline
  handlers, no emoji, no banned vocabulary, shared blocks byte identical,
  sprite references resolve both ways, one entry module per page, noindex and
  robots present, no Go Deal floor in buyer-facing data
- Accessibility, statically: landmarks, one `h1`, no skipped heading level,
  accessible name on 463 controls, label on 120 inputs, `aria-live` on 5
  regions, reduced motion honoured in both CSS and JS
- Behaviour: the shipped module graph imported under a DOM shim, every shared
  renderer run against real data, search and territory walked against the
  live deployed script

**Unverified** — asserted in code, never observed:

- Focus trap and `inert` on the age gate, both modals and the drawer
- Tab order matching visual order on any page
- Screen reader announcement quality, or whether the live regions are useful
  rather than chatty
- Whether wrapped text reads well, or where headings break
- Font fallback before Fraunces and Inter load
- That `type="module"` deferral interacts correctly with the age gate's
  synchronous head script
- Any rendering at all: sub-pixel rounding, real input intrinsic widths
  (which vary by browser), actual AVIF support negotiation

## 3. The four failure modes this project has produced

Recognise these. Each cost a round, and each passed a green audit.

**1. Guards that inspect nothing.** The display-face loop destructured
`[sel, decl]` off `matchAll`, which binds `decl` to the selector rather than
the rule body. No rule ever matched. Three guards reported a clean `0` while
checking nothing, for two rounds, and the Bodoni floor they were supposed to
enforce was never enforced. *Every guard now reports the sample size it
inspected and fails on zero.*

**2. Checks that measure phantoms after an element is removed.** When the home
finder band was deleted, the search check did not error — it fell back to a
default selector and a default placeholder and went on reporting a number for
an element that was no longer on the page. Twice: the overlay check initially
hardcoded its container widths, so changing the CSS could not fail it.
*A selector the audit cannot find is now a failure, never a fallback, and
widths are read from the stylesheet rather than carried by the tool.*

**3. Tests that pass on empty sets.** The offer expiry check reported `ok`
while flipping zero offers, because no seed offer happened to be past its
date. It was asserting `true`. *Exercise the logic with constructed inputs,
not only with whatever the data happens to contain.*

**4. Absences that no present-and-correct check can see.** Rounds 3A and 3B
shipped with the header nav hidden below 760 and nothing in its place — the
footer was the only route on a phone. Every element was correctly sized; the
failure was that something was missing. Round 3C then shipped an age gate
whose `<head>` script was absent from all thirteen pages, so `main.js` read
the gate as already-verified and removed it: a liquor marketplace reachable
with no age check, live for eight minutes. *Absences need their own
assertion. Ask what should be present, not only whether what is present is
right.*

## 4. Standing rules, consolidated

- **No manifest at the repo root.** No `package.json`, lockfile,
  `requirements.txt`, `Gemfile`, `go.mod` or `Dockerfile`. A root
  `package.json` flipped DigitalOcean from the static-assets buildpack to Node
  and broke the Round 2 deploy. Tooling lives in `tools/` and runs directly
- **No overlay, scrim, tint or gradient on any photograph.** Copy over an
  image sits on a solid `--bone` plate or moves off the image
- **Header, footer, sprite and age gate byte identical across every page.**
  `index.html` is the source of truth; `tools/sync-shared-blocks.mjs` pushes
  it, and the audit fails on drift whether or not it was run
- **Every grid track declares its minimum.** `1fr` is `minmax(auto, 1fr)`, and
  where the item is a form control that auto minimum is its intrinsic width
- **Every display rule pins `opsz`.** Fraunces ships with the axis live at a
  default of 9; without the pin a 9pt text cut renders at display size
- **noindex and robots.txt stay** until deliberately removed, together, and
  only once the licence numbers are real
- **Every guard reports its sample size and fails on zero**
- Never delete anything: archive before restructuring, never overwrite an
  existing archive
- Alt text describes the scene, never the estate
- The Go Deal floor never enters buyer-facing data

## 5. Outstanding before this can be shown to a winery

1. **Real producer licence numbers.** Every winery profile and wine page
   displays `WA-PRD-SAMPLE-00N`
2. **Lawyer-drafted legal documents.** All four under `legal/` are structural
   drafts that state no terms
3. **Confirmed Banned Drinker Register postcode ranges**, against the current
   determination and the Director of Liquor Licensing's mapped areas. The
   ranges in `policy.json` are flagged indicative
4. **A verified helpline number** for the responsible-service page. It
   deliberately carries none rather than an unverified one
5. **A custom domain.** The live URL is `winescape-dou7g.ondigitalocean.app`,
   which is the wrong product name in front of a supplier

## 6. Next actions, in order

1. **Browser and screen-reader pass.** Everything in section 2 marked
   unverified. This is the largest single gap in the project
2. **OpenAPI spec for the Winescape interface.** What Go Wine Go needs from
   Winescape and what it returns — auth, company profile, licence details,
   the DTC role
3. **WordPress data model mapping.** `data/*.json` to custom post types and
   ACF fields. The templates are already marked; the model is the real work
4. **Lawyer brief.** Sections 1 to 4 of the list above, packaged with
   `docs/site-spec.md` section 8

## 7. Open questions for Pete

1. **DTC commission rate.** The site states 8% throughout, on
   `for-wineries.html` and in the supplier payout ledger. It is the one figure
   on that page not labelled illustrative, and it is currently a guess
2. **One WordPress install or two?** Go Wine Go alongside Winescape, or
   separate installs sharing an auth boundary. This decides the data model in
   next action 3
3. **Ten founding wineries.** Who are they, and are any willing to be named in
   the prototype? Six fictional producers and photography of identifiable
   non-participating estates is the biggest credibility risk in front of a
   real supplier

---

## JAVASCRIPT — MODULE GRAPH, NO BUILD STEP

Round 4B split the single `main.js` — 107KB on all fourteen pages, including
the legal stubs that need almost none of it.

```
assets/js/core.js        every page: helpers, store, dialog behaviour,
                         header, toast, search, territory, drawer,
                         age gate, Banned Drinker Register notice
assets/js/modals.js      pages that can open an offer or a checkout
assets/js/ui/cards.js    the wine card
assets/js/ui/godeal.js   the Go Deal card
assets/js/ui/tender.js   the tender card
assets/js/ui/panels.js   policy panels and the thin-line diagrams
assets/js/pages/*.js     one entry module per page
```

**Plain ES modules, served as-is.** No bundler and no manifest at the repo
root, which is what broke the Round 2 deploy. Every page loads exactly one
entry module and the audit fails a page that loads none, two, or one that
does not exist.

`WINES`, `WINERIES` and `POLICY` are exported as **live bindings**:
`catalogue()` reassigns them and importers see the filled value. Do not
convert them to a snapshot import.

Regenerate the graph after editing a section:

```bash
node tools/build-images.mjs           # image variants
node tools/build-images.mjs --check   # gate a deploy
```

## ACCESSIBILITY — WHAT IS CHECKED AND WHAT IS NOT

`tools/contrast-audit.mjs` checks what is true or false in the markup:
landmarks, one `h1` per page, no skipped heading level, an accessible name on
every button and link, a label on every input, `aria-live` on each region that
updates without a page change, and that reduced motion is honoured in **both**
CSS and JS.

**It does not replace a screen reader.** Focus order, focus trap behaviour,
announcement quality and reading order are asserted in code and have never
been observed. That gap is real and is listed in the round report.

---

## NOINDEX — COMES OFF DELIBERATELY

This prototype sits on a public URL carrying **invented Western Australian
producer licence numbers**, fictional wineries and sample listings. Two things
keep it out of search results:

- `robots.txt` at the repo root, `Disallow: /`
- `<meta name="robots" content="noindex, nofollow">` in every page head

`tools/contrast-audit.mjs` asserts **both**, on every page. They come off
together, deliberately, at launch — and only once the licence numbers are real.
Removing one without the other fails the build, and a new page cannot ship
without either.

## DEMO STATE AND RESET

Round 4A put every flow on `localStorage` so a demo survives a refresh.
Everything lives under `gwg.v<N>.*`, with the schema version in the key: bump
`STORE_VERSION` in `assets/js/core.js` and the old keys are orphaned rather
than read at a shape that has changed.

**To clear a demo between meetings**, either:

```
https://<url>/?reset=1        # any page, wipes and reloads
GoWineGo.reset()              # console, same thing
GoWineGo.dump()               # console, shows what is currently held
```

Stored: `shortlist`, `offers`, `orders`, `offerStates`, `goDealCommits`,
`tenders`, `postcode`, `ageVerified`.

> **Open question for the lawyer.** Spec 8 says the age check is "persisted for
> the session". Round 4A moved it to `localStorage` so a demo survives a
> browser restart, which is the opposite trade-off. Confirm which one ships.

---

## STANDING RULES

- **Never delete anything.** Before a round that restructures a page, copy it to
  `archive/<page>-vN.html`. Never overwrite an existing archive — `index-v2.html`
  is Round 2's file and stays that way. Before editing `index.html`, copy it to `archive/index-vN.html`
  and keep it in the repo as a rollback.
- **Dropbox is read only.** Never modify or delete anything there. All optimised copies get
  written into this repo under `assets/img/`.
- **Never invent imagery or content.** If a shot does not exist, say so and shortlist
  alternatives. Do not generate, mock up, or substitute placeholder photography.
- **No headless browser, no screenshots.** Verify by reading the file and computing values.
  Visual sign off belongs to Kalani.
- **Push ONCE at the end of a round, never mid build.** The site must never be publicly
  half finished.
- **Checkpoint before proceeding.** Inventory and design decisions are approved by Kalani
  before code is written.

---

## PORTABILITY RULES

This will be rebuilt as a WordPress theme later. Build accordingly now.

- Every section is a self contained `<section>` with its own class namespace.
  **No cross section CSS dependencies.**
- All design tokens live in **one `:root` block**. Nothing hardcoded anywhere else.
- Semantic HTML with real heading levels. No div soup.
- Anything repeated (wine card, how-it-works step) is built from **one identical pattern**
  so it maps to a PHP loop later.
- JavaScript minimal, vanilla and **section scoped**. No framework, no build step,
  no CDN dependency.

---

## DESIGN SYSTEM

### Colour tokens

All colours are CSS custom properties at `:root`. **No hardcoded colour values anywhere else.**

| Token | Value | On bone | Role |
|---|---|---|---|
| `--bone` | `#F7F4EF` | — | Base background across the ENTIRE page. No section paints its own. |
| `--surface` | `#EDE6DA` | 1.13:1 | Decorative panel fill **only**. Never the sole indicator of a component — a `--stone` border always carries the boundary. |
| `--stone` | `#8A7F72` | 3.57:1 | **THE border token.** All borders, dividers, table rules, card edges, input outlines. |
| `--ink` | `#241A1C` | 15.44:1 | Body copy |
| `--ink-soft` | `#5B4E51` | 7.21:1 | Secondary copy |
| `--maroon` | `#5C1B2E` | 11.59:1 | Primary brand, headings, header, footer |
| `--maroon-deep` | `#3F1220` | 14.52:1 | Hover on maroon |
| `--eucalypt` | `#3D5245` | 7.68:1 | Focus rings, success, active states, icon accents |
| `--clay` | `#8C4A32` | 6.09:1 | Alerts, offer states, varietal ramp |
| `--brass` | `#A8894F` | 3.01:1 | **Decorative only on bone**, and only where a `--stone` line does the structural job. Legitimate as a boundary or focus ring **on maroon** (3.85:1). |
| `--brass-text` | `#7D6234` | 5.22:1 | The only brass permitted as type |

Eucalypt and clay are drawn from the gum treeline and laterite soil in the Ord
photography, so they sit with the imagery rather than against it.

> **Do not add a colour without giving Kalani its measured contrast ratio.**

### Non-text contrast — WCAG 1.4.11

**Round 1 shipped a 1.26:1 border with a clean report because it measured only
1.4.3 text contrast and never 1.4.11.** Every border, divider, table rule, card
edge, chip, tab underline, focus ring and icon must prove **3:1 against its
adjacent colour**.

- Never use a 1px hairline in `--brass` on bone — anti-aliasing renders it
  fainter than spec. Minimum **1px `--stone`**, or **2px `--brass` on maroon only**.
- Never put `opacity` on a border. It silently halves the measured ratio.
- Per W3C boundary guidance, a control with clearly visible text needs no
  boundary at all. **Prefer dropping a border to darkening it.** Fewer, stronger
  lines beat many faint ones.

### Focus indicators — WCAG 2.2

- Author-supplied ring on every interactive element, **2px minimum perimeter**.
- Two-colour indicator per W3C technique **C40**: `--brass` inside, `--eucalypt`
  outside, so it clears 3:1 on both light and maroon surfaces with no branching.
  The boundary *between* the two ring colours is not a 1.4.11 requirement.
- **2.4.11 Focus Not Obscured:** the header is fixed. Interactive elements carry
  `scroll-margin-top: calc(var(--header-h) + var(--sp-4))`.

### Type

**Bodoni Moda is retired as of Round 3A.** It is a Didone: extreme stroke
contrast, hairlines that vanish at display size, and a true italic with enough
swash to fight the reader at ninety pixels.

- **Display face is Fraunces**, variable, from Google Fonts.
  Settings: `opsz` 100, `wght` 600, `SOFT` 0, `WONK` 0. **No italic in the H1.**
- **Google leaves the `opsz` axis LIVE at a default of 9.** The `@100` in the
  css2 URL only picks the file; it does not pin the axis, and
  `font-optical-sizing: auto` would otherwise set opsz from the font-size.
  Every display rule therefore carries
  `font-variation-settings: var(--display-axes)`, and the audit fails the build
  on a display rule that does not. Do not remove it thinking it is redundant.
- **Display only, 32px and above, weight 600.** Inter takes every heading below
  that. No display face in any UI control, label, chip, table header or button.
- Body and UI: Inter, weights 400 and 500.
- Google Fonts, preloaded, with `serif` and `sans-serif` system fallbacks.

Alternate if Fraunces reads too soft against the photography: Newsreader, same
role, more editorial. Flag it rather than swapping silently.

### Photography

- **Photographs render untinted.** No maroon wash, no gradient, no scrim across
  the frame. WCAG exempts photographs of real scenes from non-text contrast.
- Where copy sits **on** an image, that is 1.4.3 text contrast and the exemption
  does not apply — either put the copy on a solid `--bone` plate (contrast true
  by construction) or measure the scrim per-pixel and report the worst case.
- Alt text describes the **scene, not the property**. Never name an estate.

### Icons

- **Zero emoji in the file.** Remove every one.
- Replace with inline SVG: `24x24` viewBox, `stroke-width: 1.25`, `stroke: currentColor`,
  `fill: none`, round caps and joins.
- No icon font, no CDN.

---

## IMAGE PIPELINE

- Source: Dropbox `/Russell Ord Photo/Stock Library (Web Size)/All Images/`
  (originals in `/Russell Ord Photo/Stock Library/` — full res, 20–28MB each).
  Photography credit: **Russell Ord**.
- Copy approved shots into `assets/img/`. Dropbox originals stay untouched.
- WebP with JPEG fallback.
- Max widths: **hero 2400px**, **feature 1600px**, **cards 1200px square**.
- Under 300KB each. Hard ceiling 500KB.
- Every `<img>` gets `width`, `height`, `loading` and a descriptive `alt`.

### Crops

| Use | Ratio | Requirement |
|---|---|---|
| Hero | ~2.4:1 wide | Naturally dark region where overlay copy sits |
| Editorial column | 4:5 portrait | — |
| Card | 1:1 square | Identical rendered size across a row |

---

## FUNCTIONALITY THAT MUST NOT BREAK

The prototype is a three-view SPA (Market / Trading / Supplier) driven by vanilla JS.
Every existing function must still work after any restyle:

- Offer modal: **opens, submits, and closes**
- Buy Now modal: opens, takes payment, confirms
- View + role switching, trading tabs, filter chips
- Supplier: list-wine form, Go Deal engine, POD upload and commission calc
- Toast notifications, Escape-to-close

---

## THE REPO ROOT MUST STAY BUILDABLE-FREE

**This broke the Round 2 deploy.** DigitalOcean serves this app as a Static Site
with an empty build command. It still runs buildpack detection against the repo
root. A `package.json` at the root flipped it from the static-assets buildpack to
the Node.js buildpack, which then tried to build a site that has no build.

Hard rules:

- **Never place `package.json`, `package-lock.json`, `yarn.lock`, `requirements.txt`,
  `Gemfile`, `go.mod`, `Dockerfile` or any other buildpack manifest at the repo root.**
- Tooling lives in `tools/` and runs directly. Use `.mjs` so Node treats it as ESM
  with no manifest required.
- The app spec is documentation only and lives at `docs/do-app-spec.yaml`, **not**
  `.do/app.yaml`. DigitalOcean's GitHub Action auto-applies `.do/app.yaml`; keeping
  it out of that path means nothing can silently reconfigure the app.
- Adding a directory at the root is safe. Adding a *file* at the root is not, until
  you have checked it against the list above.

If tooling ever genuinely needs a manifest, do not put it at the root: move the
served files into `site/` and set the app's `source_dir` to `/site`, so the build
context and the tooling can never overlap again.

## VERIFICATION — RUN THIS BEFORE REPORTING

```bash
node tools/contrast-audit.mjs            # required — must exit 0
node tools/layout-audit.mjs              # required — must exit 0
node tools/contrast-audit.mjs --matrix   # adds the full N×N token matrix
```

If you edited the header, footer or icon sprite, edit it in `index.html` and
push it to the other two pages, then re-run the audits:

```bash
node tools/sync-shared-blocks.mjs        # index.html is the source of truth
node tools/sync-shared-blocks.mjs --check
```

This is not a build step — the site is served exactly as it sits in the repo.
The contrast audit fails on drift whether or not you remember to run it.

**Both must pass before reporting.** No npm script, deliberately: that would
require a root `package.json`, which is what broke the Round 2 deploy.

### Why there are two audits

Round 2 shipped with the hero headline sitting underneath the header wordmark.
The contrast audit passed, because **it measures colour, not geometry**. Text on
top of text is a layout failure, and no colour ratio can detect it.

`tools/layout-audit.mjs` resolves the served CSS (clamp/min/max/calc/rem/vw/vh)
at 390, 834, 1280 and 1600, lays the hero copy out using **real glyph advances**
from `tools/font-metrics.json`, and asserts:

1. header height vs. hero content top offset, clearance must not be negative
2. plate width and height against their caps (34vw / 60vh desktop; full width below 760px)
3. every fixed or sticky element vs. the top offset of what follows it, **on
   every page**, not just the one that happens to have a hero
4. **every sticky element's `top` vs. the header height.** A sticky element
   with `top: 0` parks itself underneath the fixed header and stays there.
   Exemptions must name the scroll container that makes them safe
   (`.modal__head` scrolls inside `.modal`, not the page)
5. **every plate that sits over a photograph vs. its width cap**, at every
   breakpoint, on every page — not just the home hero
6. **header content vs. the width of the bar.** The header is a fixed 76px
   bar that cannot wrap, so it sheds content by media query instead. Measured
   with real glyph advances, so adding a nav item fails loudly
7. **a reachable navigation control at 390 and 760**, and that the drawer it
   opens links to every page. Rounds 3A and 3B both shipped with the header
   nav hidden below 760 and nothing in its place, so the footer was the only
   route on a phone. Nothing measured it, because every element was correctly
   sized — the failure was an ABSENCE, and absences need their own assertion
8. **every overlay's content against its own container** — the age gate,
   both modals, the mobile menu and the toast. All are positioned outside
   page flow, so every earlier check walked straight past them
9. **every grid track declares its own minimum.** `1fr` is `minmax(auto,
   1fr)`, and where the item is a form control that auto minimum is the
   control's intrinsic width, so the track refuses to shrink. This is a lint,
   not a measurement, and it catches the whole class in one line
10. **every form placeholder against its input**, on every page, not just the
   one that broke in Round 2
11. **the producer licence number against its credentials track**, measured
    from the real data so a longer licence fails here rather than on the page
12. **every input against the VALUE it holds, not only its placeholder.** A
    bounded value — a postcode, a vintage, a CVC — must render outright. Free
    text is measured and reported but does not fail: a wine name has no
    maximum and a text input scrolling its own content is correct behaviour
13. **inputs whose width is DECLARED rather than inherited.** `box-sizing` is
    border-box globally, so a declared width carries the padding and the
    border too. `width: 7ch` on the market postcode left a 3.63ch content box
    for a four-character value
14. **control groups share one height.** Three heights centred against each
    other is three loose parts, not a control
15. search input width vs. its own placeholder

Widths in the overlay and form checks are **read from the stylesheet, never
hardcoded in the tool**. An audit carrying its own copy of the numbers cannot
fail when the CSS changes underneath it, which is worse than no audit. A
selector the audit cannot find is a failure, not a fallback to the viewport.

`tools/font-metrics.json` is extracted with fontTools from the exact Google
Fonts woff2 files the pages request, with variable axes instanced at the values
actually rendered — Fraunces at `opsz` 100, not at Google's served default of 9.
It is committed, so the audit runs offline and deterministically.

**If you change a font, weight or axis, regenerate it:**

```bash
python3 tools/extract-font-metrics.py     # needs fonttools + brotli
```

### Header transparency

Transparent **only** at `window.scrollY === 0`, and only on the view that has the
hero photograph behind it. Any scroll goes solid maroon. Do not reintroduce a
geometry-based trigger keyed to the hero's edges: that is what let the bone plate
slide under a still-transparent header.

`tools/contrast-audit.mjs` parses the `:root` block out of
`assets/css/main.css` and checks every pairing the site actually renders against
the threshold that pairing must meet (4.5 / 7.0 / 3.0), plus structural guards
across **all thirteen pages**: no hex outside `:root`, no `rgba()` literals outside
`:root`, no `!important`, no inline `style=`, no inline `on*=` handlers, no
emoji, no "escrow", no "auction"/"bid" in shipped copy, no display type under
32px or under weight 500, and no display rule that fails to pin `opsz`.

It also asserts the **age gate open-script is present in every page head**.
That script adds `.age-gate-open` before first paint; without it the gate
never opens and `core.js` removes it as already-verified, so the site is
reachable with no age check at all. Round 3C shipped exactly that to
production on all thirteen pages, because the edit that added the script ran
before the paths were made root-relative and its anchor silently never
matched. A missing script is an absence, and absences need their own
assertion.

It also asserts that **no Go Deal floor appears in any buyer-facing data
file**. The floor is the winery's private auto-accept threshold and lives only
in `data/supplier.json`. In the live product that is an authenticated endpoint
scoped to the signed-in winery; a static prototype cannot enforce that, so the
audit enforces the thing that actually matters instead.

It also asserts that the **responsible-service line in every footer matches
`data/policy.json` byte for byte**. That line is static markup on purpose — a
compliance line that only exists once JS has run is a compliance line that can
fail to appear — and the guard is what stops the two copies drifting.

It also checks that every `<use href="#id">` resolves to a symbol in the
sprite, and that no symbol is defined without being used. **Round 3B shipped a
delivery panel pointing at `i-box` after Round 3A had pruned it as unused** —
an icon that renders as nothing at all, which no colour ratio can see. Symbols
are referenced from markup, from `icon()`/`toast()` in JS, and by name from
`data/*.json`, so all three sources are scanned.

The prose guards run over the **shipped** text with comments stripped, so a
comment explaining why a word is banned does not itself trip the ban.

**Every guard reports the sample size it inspected.** A count of zero
violations is indistinguishable from a guard that never ran, which is exactly
how the display-face guards passed for two rounds while checking nothing.

> **Round 3A found the display-face guards had never actually run.** The rule
> loop destructured `[sel, decl]` off `matchAll`, which binds `decl` to the
> selector rather than the rule body, so no rule ever matched and all three
> guards reported a clean 0 while checking nothing. The Bodoni floor that
> Rounds 2 and 3 believed was enforced was not. The audit now reports
> **"Display rules actually inspected"** and fails if that count is zero.
> Any guard that can pass vacuously must report its own sample size.

**When you add a component, add its pairing to `USED_PAIRINGS`.** The audit is
only as good as that list — that is exactly how Round 1 passed while failing.

## DEPLOY VERIFICATION

Autodeploy is on: pushing to `main` triggers a build. Confirm it yourself
rather than handing it back to Kalani.

```bash
doctl apps list                                                     # get the id
doctl apps list-deployments <app-id> --format ID,Phase,Created      # Phase must be ACTIVE
doctl apps logs <app-id> --type build                               # on failure
```

`doctl` is installed via Homebrew. It needs a one-time `doctl auth init` with a
DigitalOcean personal access token.

> **The current token is READ ONLY for apps.** `doctl apps list` and
> `list-deployments` work; `doctl apps create-deployment` returns
> **403 not authorized**. So a deploy cannot be triggered or retried from
> here.
>
> Autodeploy has fired reliably for every round except 4C, where the webhook
> never fired across 30 minutes despite `deploy_on_push: true` still being set
> and the commit confirmed on `refs/heads/main`. **When autodeploy misses, the
> only remedy is a manual Force Rebuild from the DigitalOcean console** (Apps
> → winescape → Deploy), until a write-scope token is issued.
>
> If it keeps happening, raise it with DigitalOcean rather than working around
> it — the config has not changed.

The app spec at `docs/do-app-spec.yaml` is **reference only**. Deliberately not at
`.do/app.yaml` — see the root-hygiene rule above.

**A green push is not a green deploy.** Confirm the deploy phase is ACTIVE and
then fetch the live URL and check the response body actually contains the new
build before reporting. Round 2 was reported as shipped while Round 1 was still
serving.

## ROUND LOG

- **Round 1** — full visual rebuild: design system, header + hero, cascade across all
  sections. Product grid, offer modal and supplier dashboard are **restyled, not
  restructured**. Archived at `archive/index-v1.html`.
- **Round 2** — full contrast rebuild. Root cause: Round 1 measured only WCAG 1.4.3
  and never 1.4.11, so every border on the site failed AA. New palette with
  `--stone`, `--eucalypt` and `--clay`; hero maroon wash removed and copy moved to
  a solid bone plate; two-colour focus rings; Bodoni floor raised to 32px/500;
  `tools/contrast-audit.mjs` committed so this cannot recur silently.
  Archived at `archive/index-v2.html`.
- **Round 3** — layout fix. The header transparency trigger was keyed to the
  hero's bottom edge while the plate was bottom-anchored inside the hero, so the
  plate collided with the header (measured at −110px clearance at 1280 before any
  scroll). Header is now transparent only at scroll zero; the hero reserves header
  height with `padding-top`; the search moved out of the plate into its own
  `finder` section; hero display size dropped to fit the capped plate.
  `tools/layout-audit.mjs` added. Archived at `archive/index-v3.html`.
- **Round 3A** — structure, design system, home page. Built against
  `docs/site-spec.md`. The 1,487-line single file became `index.html`,
  `account.html` and `supplier.html` over one `assets/css/main.css` and one
  `assets/js/main.js`, with the header, footer, icon sprite and modals sliced
  out of `index.html` at build time so they are byte identical by construction.
  Content moved to `data/*.json` — 6 wineries, 12 wines, 2 Go Deals, 3 tenders,
  6 subregions. Bodoni retired for **Fraunces** at `opsz` 100 / `wght` 600.
  Every scrim, tint and gradient deleted, including the closing band's maroon
  wash: its copy now sits on a bone plate like the hero, and there is no
  overlay token left in the stylesheet. "Escrow" removed everywhere and
  replaced with Model A payment language. Nine new photographs pulled from the
  Dropbox library. Home page rebuilt to spec 4.1: hero, trust strip, listings
  grid, editorial band, Go Deals strip, six region tiles, closing band.
  The layout audit now covers all three pages and both audits carry negative
  tests. **The display-face guards were found to have never run** — see the
  note under VERIFICATION. The three-step explainer moved off home; it is due
  on `how-it-works.html` in Round 3B per spec 4.6.
- **Round 3B** — the customer side. Six pages built against spec 4.2 to 4.6
  and 4.9: `wine.html`, `winery.html`, `go-deals.html`, `tenders.html`,
  `how-it-works.html`, and `account.html` extended from the old trading view.
  Content model extended with `offers`, `orders`, `account`, `policy` and
  `how-it-works`; `wineries.story` became an array and gained image alts;
  `wines` gained `dispatch_days`. **`data/policy.json` is the single source
  for all compliance and payment wording** — the delivery panel, the payment
  lines, the WET note, the seller line and the compliance line are authored
  once and read by every surface, so they cannot drift apart. Six winery
  heroes at 2:1 and six 4:5 portraits pulled from the library; every
  photograph still untinted, every plate still bone.

  The layout audit grew from four checks to seven and now covers all eight
  pages. The three additions were driven by real failures it caught on first
  run: `wine.html`'s sticky column measured as `NaN` because the value
  resolver could not handle `calc(var() + var())`; the closing plate exceeded
  its cap at 834; and the header overflowed its own bar by 89px at 834 and
  154px at 390 once the nav grew to four items. The role switcher is now
  hidden below 1100 and the footer carries a complete route through the site,
  because the header nav is hidden below 760 and there is still no mobile menu.
  Archived at `archive/index-v4.html`, `archive/account-v1.html`,
  `archive/supplier-v1.html`.
- **Round 3C** — supply side, compliance, and the mobile gap.
  `for-wineries.html` built in full to spec 4.7, with territory protection
  given its own section and a thin-line diagram because it is the objection
  every winery raises first. `supplier.html` extended to spec 4.8: offers
  inbox with accept, counter and reject, the Go Deal tier ladder, territory
  exclusions on the listings table, and payouts split into released and
  pending. Four structural legal drafts under `legal/`, which forced the
  move to root-relative paths.

  Compliance: an **age gate** taking a date of birth rather than a yes or no,
  held for the session, opened by a synchronous `<head>` script so the market
  never flashes behind it; a **Banned Drinker Register** notice driven by
  postcode at checkout and against every saved address; the responsible
  service line in the global footer; the producer licence on every wine page.
  All wording lives in `data/policy.json`.

  A real **mobile menu** with a focus trap, Escape to close, focus returned to
  the opener, and the rest of the document marked `inert` while it is open.
  One `trapFocus` and one `isolate` helper serve both it and the age gate.

  Spec 6 assigns `AmeliaPark_070` to the For Wineries hero, but that file is a
  restaurant sign on a planted wall, not the vineyard photograph spec 4.7
  requires. Shortlisted five candidates and used `LarryCherubino_159`;
  flagged rather than substituted silently.

  Archived at `archive/index-v5.html`, `archive/supplier-v2.html`.
- **Round 4C** — design fixes. The market postcode clipped its own value:
  `width: 7ch` with global `box-sizing: border-box` left a 3.63ch content box
  once 32px of padding and 2px of border came out of it, and "6285" needs
  four. Not the age gate's mechanism — that was a grid track minimum — but
  the same family: a declared width that does not accommodate what it holds.
  Widths are now written as content + padding + border so the intent is
  legible. `--control-h` gives the label, the input and Clear one height.
- **Round 4A** — every flow completed on fake data. Search moved off the home
  page into the header and drawer; territory exclusion enforced by postcode;
  everything persisted under `gwg.v1.*`; tender, offer, Go Deal and order
  flows closed; 404, robots.txt and noindex.
- **Round 4B** — performance, accessibility and the header.

  The header breakpoint moved from 760 to **900**, chosen from the
  measurement rather than the phone size: the full bar had 36px of slack at
  834 and now has **103px at 901 and 305px at desktop**, with a headroom
  target the audit enforces. Two controls were being counted wrong — the menu
  button was never counted at all, and the account link was counted at widths
  where it is hidden.

  `main.js` became a module graph: **-52% JavaScript across a fourteen-page
  crawl**, and -70% on the legal stubs.

  Images: AVIF, WebP and JPEG at every width in a halving ladder, 141
  variants, all under the 300KB ceiling, generated by
  `tools/build-images.mjs`. Fonts self-hosted, removing two preconnects and a
  render-blocking third-party stylesheet; Inter is one variable file for both
  weights, which is what Google was already serving.

  Accessibility found and fixed: a second `h1` on every page from the age gate
  dialog, two links on `wine.html` that were empty until JS filled them, and
  three JS smooth-scrolls that ignored `prefers-reduced-motion` because the
  CSS query cannot reach a JS argument.
- **Round 3D** — legibility and overflow. No new features.

  **The age gate's Year field was unreachable and the form could not be
  completed.** Root cause was not a width but a grid track minimum: `1fr` is
  `minmax(auto, 1fr)`, and the auto minimum resolves to the grid item's
  min-content. The items are `<input>` elements with no `size` attribute, so
  they default to `size=20` — an intrinsic 236px each at 16px Inter. Three
  tracks demanded 708px inside 400px of plate. `.age-gate__plate` also sets
  `overflow-y: auto`, and a non-visible overflow on one axis forces `auto` on
  the other, so the field was scrolled out of reach rather than merely
  spilling. Fixed at the grid with `minmax(0, …)` plus `min-width: 0` on the
  item; the same fix applied to every other grid holding a form control.

  Also fixed: `.age-gate__plate` at `92vw` inside a `--sp-5` padded layer
  overflowed its own container by 17px at 390; three mobile plates used
  `width: 100vw`, which counts the scrollbar and causes horizontal page
  scroll; the producer licence number broke across two lines at its own
  hyphens from 834 up; the supplier tables needed their scroll rail from
  1100 rather than 760 once territory exclusions made eight columns.

  Legibility floor applied: every running-prose and compliance selector is
  now 16px or above, nothing is under 13px, `.btn--sm` and the filter chips
  reach 44px at 390, and three prose blocks that ran the full container width
  gained a max-width.
