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

| Token | Value | Role |
|---|---|---|
| `--bone` | `#F7F4EF` | Base background across the ENTIRE page. No section paints its own. |
| `--maroon` | `#5C1B2E` | Header, footer, full bleed panels, primary headings |
| `--maroon-deep` | `#3F1220` | Hover on maroon surfaces |
| `--brass` | `#A8894F` | Hairlines, rules, dividers ONLY. **Never text.** |
| `--brass-text` | `#7D6234` | The only brass permitted for link or label text |
| `--ink` | `#241A1C` | Body copy |
| `--ink-soft` | `#5B4E51` | Secondary copy |

Verified on bone: **maroon 11.6:1**, **brass-text 5.2:1**.

> **Do not add a colour without giving Kalani its measured contrast ratio.**

### Type

- **Display and headings:** Bodoni Moda, weights 400 and 500. Large sizes only, **never under 24px**.
- **Body and UI:** Inter, weights 400 and 500.
- Google Fonts, preloaded, with `serif` and `sans-serif` system fallbacks.
- If Bodoni reads too fashion-editorial against the photography, **flag it at checkpoint and
  propose EB Garamond. Do not swap it silently.**

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

## ROUND LOG

- **Round 1** — full visual rebuild: design system, header + hero, cascade across all
  sections. Product grid, offer modal and supplier dashboard are **restyled, not
  restructured** — that is Round 2.
