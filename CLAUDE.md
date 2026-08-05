# Go Wine Go — Project Rules

Static prototype for an Australian direct-from-winery wine marketplace.
Autodeploy is ON. The live URL has been shared with the client.

**Model A: the winery is the seller, Go Wine Go is the market.** Go Wine Go
never holds money. Nothing says escrow, auction or bid. The full specification
is `docs/site-spec.md` and it is the reference for Rounds 3A, 3B and 3C.

As of Round 3A the build is three pages — `index.html` (home and market),
`account.html`, `supplier.html` — over one shared `assets/css/main.css`, one
shared `assets/js/main.js`, and hand-authored content in `data/*.json`.

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
3. every fixed or sticky element vs. the top offset of what follows it
4. search input width vs. its own placeholder

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
across **all three pages**: no hex outside `:root`, no `rgba()` literals outside
`:root`, no `!important`, no inline `style=`, no inline `on*=` handlers, no
emoji, no "escrow", no "auction"/"bid" in shipped copy, no display type under
32px or under weight 500, and no display rule that fails to pin `opsz`.

The prose guards run over the **shipped** text with comments stripped, so a
comment explaining why a word is banned does not itself trip the ban.

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
