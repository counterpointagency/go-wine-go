# Go Wine Go
## Full site specification, Model A

Version 1, August 2026. This is the reference document Claude Code builds against across Rounds 3A, 3B and 3C. Nothing here connects to a live system. Everything is static, hand-authored, and structured so it maps onto WordPress templates later.

---

## 1. The premise the whole site has to carry

Under Model A, **the winery is the seller and Go Wine Go is the market.** That single fact drives most of what follows.

Consequences for the interface:

- The winery is a first-class entity, not a label on a card. It needs its own page, its own photography, its own licence number on display.
- Nothing says escrow. Go Wine Go never holds money.
- The transaction language is "your payment goes to the winery and is released when your wine is signed for."
- Every wine belongs to a named winery, and that name is the trust signal. On Winescape suppliers stay anonymous until Contract. Here it is the opposite, and the site has to make that feel deliberate rather than accidental.

**Language rules, absolute**

| Never | Always |
|---|---|
| Escrow | Payment released on delivery |
| Auction | Offer, counteroffer, tender |
| Bid | Offer |
| We sell | The winery sells |
| Vendor, merchant | Winery |

Winescape's own agreement disclaims being an auctioneer, and in WA "auction" is a separate prescribed licence purpose from online wine sales. The word costs nothing to avoid and creates a question if used.

---

## 2. Vocabulary, taken from Winescape

Their existing support library names the whole flow. Reuse it so wineries recognise the product immediately:

Pre-trade: Company Set Up, Profile.
Trade: Requesting Samples, Using the Shortlist, Making an Offer, Executing Draft Offers, Dealing with Offers, Dealing with Counteroffers, Making a Counteroffer, Draft Counteroffers, Buying with Tenders, Submitting to Tenders, Listing Bottled Wine.
Post-trade: Archive, Contract Management.

**Shortlist is the one to steal.** It is already the bottled market's term for saved wines. Use it instead of wishlist, favourites or saved.

---

## 3. Site map

Eight built pages plus legal stubs. Each becomes a WordPress template later, noted in brackets.

```
/                        Home and Market            [front-page.php]
/wine.html               Wine detail                [single-wine.php]
/winery.html             Winery profile             [single-winery.php]
/go-deals.html           Active Go Deals            [archive-godeal.php]
/tenders.html            Consumer tenders           [archive-tender.php]
/how-it-works.html       Customer explainer         [page.php]
/for-wineries.html       Supply-side pitch          [page.php]
/supplier.html           Supplier dashboard         [page-supplier.php]
/account.html            Customer account           [page-account.php]
/legal/                  Terms, privacy, delivery, responsible service
```

**Why split from the single file.** The current build is one 1,487 line `index.html` running three views. Building this out inside it produces a file nobody can work on and which blows Claude Code's context every round. Separate files also map one to one onto WordPress templates, so the split is work you would do anyway.

Header and footer markup is duplicated across files and must be byte identical. Mark each with a comment noting it becomes `get_header()` and `get_footer()`. All CSS lives in one shared stylesheet.

---

## 4. Page specifications

### 4.1 Home and Market

**Hero.** Untinted photograph, full bleed. Copy on a solid bone plate carrying eyebrow, headline and subline only. Search sits on the bone below the hero, not on the plate.

Headline: Buy direct from Australian wineries
Eyebrow: Australia's direct-from-winery marketplace
Subline: Name your price by the case. The winery accepts, counters or declines, and no payment moves until you both agree.

**Trust strip.** Immediately under the hero, one line, four items with thin icons: Direct from the winery. Name your price. Released on delivery. Licensed producers only.

**Sample listings grid.** Six wine cards. Each card: winery name, wine name, vintage, variety, subregion, case size, list price per case, and one of three state badges (Buy Now, Open to Offers, Go Deal live). Cards carry no photography, because the library has no bottle shots. They carry a brass hairline and a tonal maroon varietal marker instead.

**Editorial band.** One portrait photograph, one paragraph on why direct matters, link to How It Works.

**Go Deals strip.** Two live Go Deals with progress toward the floor.

**Regions.** Six subregion tiles, each with a landscape photograph, linking to filtered market views. Wilyabrup, Yallingup, Karridale, Cowaramup, Treeton, Boranup.

**Closing band.** Full bleed untinted photograph with copy on a bone plate, not a scrim. Supply-side call to action pointing at For Wineries.

### 4.2 Wine detail

Left column: wine identity. Winery name links to the winery profile. Wine name, vintage, variety, GI, case size, alcohol, standard drinks per bottle, allergen statement, tasting note.

Right column, sticky: list price per case, availability in cases, and the three actions. Buy Now, Make an Offer, and Go Deal if one is live.

Below: the winery strip. Small photograph, one paragraph, producer licence number, link through. This is the Model A trust anchor and it is not optional.

Then: delivery panel. Dispatch time, temperature-controlled freight, delivery between 7am and 7pm, adult signature required, not left unattended.

Then: how payment works, three lines. You pay at checkout. Funds are held by the payment provider. The winery is paid when your wine is signed for.

### 4.3 Winery profile

The page that makes Model A legible.

Hero: untinted landscape photograph of the estate, name and subregion on a bone plate.
Story: two or three paragraphs, editorial, one portrait photograph alongside.
Credentials block: producer licence number, region, established year, cases available.
Wines: grid of that winery's listings.
Compliance line: this wine is sold to you by [winery], licensed producer, licence number [x]. Go Wine Go is the marketplace, not the seller.

### 4.4 Go Deals

Explain the mechanic first, in three lines. The winery sets a list price and a hidden floor. As more cases are committed, the price falls for everyone. When the deal closes, everyone pays the final price.

Each Go Deal card: wine, current price, cases committed, next price tier, cases needed to reach it, closing date, and a progress bar. Never reveal the floor.

### 4.5 Tenders

The most differentiated mechanic on the site, and the one to explain most carefully.

Customer posts what they want: variety, region, vintage range, quantity, maximum price per case, closing date. Wineries submit. Customer picks one, or none.

Page has: an explainer, a create-a-tender form, and a list of open tenders with submission counts.

### 4.6 How It Works

Customer facing. Four mechanics explained in plain language, each with a thin-line diagram rather than a photograph. Then a payment section, a delivery section, and an FAQ covering: who am I buying from, who has my money, what if the wine is faulty, what if nobody is home, do you deliver to my state.

### 4.7 For Wineries

**Commercially the most important page on the site.** Supply is the gate and this is the page that opens it.

Structure:

1. Hero: untinted vineyard photograph, bone plate. Headline addresses the distributor problem directly without naming distributors.
2. The maths: a plain comparison of what a winery keeps per case direct versus through the trade. Use illustrative figures clearly labelled as illustrative.
3. Territory protection: the postcode filter explained. This is the objection-killer and it deserves its own section with a diagram.
4. How you get paid: direct charges, funds released on delivery, you invoice the customer, you remain the licensed seller.
5. What it costs: commission on sale, no listing fee.
6. Already on Winescape: one-click access through your existing login, your Company Administrator grants the DTC role.
7. Requirements: current producer's licence, ability to dispatch in cases, temperature-controlled freight.
8. Register interest form.

### 4.8 Supplier dashboard

Signed-in view. Keep the existing structure, restyled and extended.

Stat cards: cases sold this month, offers awaiting response, Go Deals live, awaiting proof of delivery.
My Listings table: wine, vintage, cases available, list price, floor price, state, territory exclusions.
Offers inbox: the Winescape flow, accept, counter, reject, with expiry.
Go Deal engine: set floor, set tiers, watch commitment.
Orders and dispatch: upload proof of delivery, which triggers payment release.
Payouts: what has been released, what is pending.

### 4.9 Account

Signed-in customer view. Shortlist, My Offers with status, Orders with tracking, Tenders I have posted, Addresses.

---

## 5. Content model

Entities to hand-author as JSON in `/data`, so the pages read from structured data rather than hardcoded markup. This is what makes the WordPress migration mechanical later.

```
winery      slug, name, subregion, established, licence_number, story,
            hero_image, portrait_image, territory_exclusions[]

wine        slug, winery_slug, name, vintage, variety, gi, case_size,
            alcohol, standard_drinks, allergens, tasting_note,
            list_price_per_case, cases_available, state
            state = buy_now | open_to_offers | go_deal

go_deal     wine_slug, list_price, tiers[{cases, price}], committed_cases,
            closes_at
            floor price never exposed to the client

tender      id, variety, gi, vintage_from, vintage_to, quantity_cases,
            max_price_per_case, closes_at, submission_count

offer       id, wine_slug, quantity, price_per_case, status, expires_at
            status = sent | countered | accepted | declined | expired

order       id, wine_slug, quantity, price_paid, payment_state,
            dispatch_state, pod_state
            payment_state = held | released
```

Six wineries, twelve wines, two live Go Deals, three open tenders. Enough to look real, small enough to hand-author accurately.

**Naming.** Fictional producers built from real Margaret River subregions and localities: Wilyabrup, Karridale, Yallingup, Boranup, Cowaramup, Treeton. Check each invented name against trading wineries before committing. A discreet "Sample listings" label stays on the market view.

---

## 6. Imagery

All from the Russell Ord library. Web Size at 2048 except the hero, which comes from the full resolution original.

**No maroon overlay anywhere.** No scrim, no tint, no gradient wash on any photograph, including the closing band and the winery heroes. Where copy must sit over an image, it sits on a solid bone plate. Where a plate would be wrong, the copy moves off the image entirely.

Assignments from the verified inventory:

| Surface | File | Crop |
|---|---|---|
| Home hero | LarryCherubino_PhotoOrd-133 full res | 2.2:1 |
| Home editorial | VasseFelix_049, old vine trunk | 4:5 portrait |
| Home closing band | CavesRoad_7, vine rows and gum treeline | 2:1 |
| Region tile, Wilyabrup | Credaro_PhotoOrd054 | 1:1 |
| Region tile, Yallingup | CredaroArvo_PhotoOrd250 | 1:1 |
| Region tile, Karridale | Bettenays_64, vines reflected in dam | 1:1 |
| Region tile, Cowaramup | GlenartyRoad_38, sheep in winter vines | 1:1 |
| Region tile, Treeton | BrownHill_15 | 1:1 |
| Region tile, Boranup | BrownHill_87 | 1:1 |
| How It Works | none, thin-line diagrams only | |
| For Wineries hero | AmeliaPark_070 | 2:1 |
| Winery profile heroes | one each from the estate sets | 2:1 |
| Winery portraits | Peacetree_109, and detail crops | 4:5 |

**Alt text describes the scene, never the estate.** "Aerial view of vineyard rows at dawn", not the property name. The photography is of identifiable named estates and the site must not imply they are participating suppliers.

Footer carries a photography credit to Russell Ord.

---

## 7. Typography

The H1 is illegible at display size. Bodoni Moda is a Didone: extreme stroke contrast, hairlines that disappear, and a true italic with enough swash character to fight the reader at ninety pixels.

**Display face: Fraunces.** Variable, from Google Fonts. It has an optical size axis built for exactly this, its stroke contrast is moderate rather than extreme, and its warmth sits with agricultural photography where Bodoni reads as fashion magazine.

Settings: `opsz` 100, `wght` 600, `SOFT` 0, `WONK` 0. Dial the quirk out, keep the warmth.

**No italic in the H1.** The italic is doing most of the damage. If emphasis is wanted, use weight or a line break.

**Body and UI: Inter**, 400 and 500, unchanged.

Alternate if Fraunces reads too soft against the photography: Newsreader, same role, more editorial, less craft. Flag at checkpoint rather than swapping silently.

Bodoni is retired. A three-face system is not worth the maintenance for one heading.

---

## 8. Compliance surfaces

These are interface requirements, not legal advice, and each needs confirming with a liquor licensing lawyer before launch.

- **Age gate on first visit.** Date of birth entry, not a yes/no button. Persisted for the session.
- **Producer licence number** displayed on every winery profile and in the footer of every wine detail page.
- **Delivery notice** at checkout and on the wine page: dispatched from the licensed premises, delivered between 7am and 7pm, adult signature required, not left unattended.
- **Banned Drinker Register notice** where a delivery postcode falls in the Kimberley, Pilbara, Goldfields Electorate or Carnarvon and Gascoyne Junction.
- **Responsible service line** in the global footer.
- **Seller identification** on every wine and every order: sold by [winery], licensed producer.
- **WET note** where price is shown: prices include GST and Wine Equalisation Tax.

---

## 9. Build order

**Round 3A, structure and system.** Fix the header collision. Split the file. Retire Bodoni for Fraunces. Strip every overlay. Build the shared stylesheet, header and footer. Add the layout audit tool. Home page only.

**Round 3B, customer side.** Wine detail, winery profile, Go Deals, Tenders, How It Works, Account, Shortlist.

**Round 3C, supply side and compliance.** For Wineries, supplier dashboard, age gate, delivery surfaces, legal stubs.

Each round ends with both audits passing, a verified deploy, and a report. No round starts before the previous one is signed off visually.
