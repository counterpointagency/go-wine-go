# Go Wine Go — Project Rules

Single-page prototype for an Australian direct-to-consumer wine marketplace.
Autodeploy is ON. The live URL has been shared with the client.

---

## STANDING RULES

- **Never delete anything.** Before editing `index.html`, copy it to `archive/index-vN.html`
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

- **Bodoni Moda is a Didone** — its hairline strokes render lighter than their
  colour value implies. Therefore: **display only, 32px and above, weight 500
  minimum, never 400.**
- **Nothing under 32px is Bodoni.** Inter takes every heading below that.
- **No Bodoni in any UI control, label, chip, table header or button.**
- Body and UI: Inter, weights 400 and 500.
- Google Fonts, preloaded, with `serif` and `sans-serif` system fallbacks.

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

## VERIFICATION — RUN THIS BEFORE REPORTING

```bash
npm run audit:contrast          # required — must exit 0
npm run audit:contrast:matrix   # adds the full N×N token matrix
```

`tools/contrast-audit.mjs` parses the `:root` block out of `index.html` and
checks every pairing the site actually renders against the threshold that
pairing must meet (4.5 / 7.0 / 3.0), plus structural guards: no hex outside
`:root`, no `rgba()` literals outside `:root`, no `!important`, no inline
`style=`, no emoji, no Bodoni under 32px or under weight 500.

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
DigitalOcean personal access token. The app spec lives at `.do/app.yaml`; it is
declarative and is **not** auto-applied to the running app, so committing it
cannot disturb the live site.

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
