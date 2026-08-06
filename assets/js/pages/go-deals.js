/* ═══════════════════════════════════════════════════════════════════
   GO WINE GO — PAGE — go-deals.js
   Go Deals archive, spec 4.4.

   Plain ES modules, served as-is. No build step and no manifest at the
   repo root, which is what broke the Round 2 deploy.
   ═══════════════════════════════════════════════════════════════════ */

import {
  $, $$, el, icon, money, round, auDate, toast, loadJSON, dataError,
  Store, userOffers, userOrders, userTenders, offerStates, goDealCommits,
  isShortlisted, toggleShortlist, shortlistSeed, seedShortlist, isPast, isoInDays,
  catalogue, wineBySlug, winesOf, wineryName, fillTemplate, slugParam, picture,
  wetNote, searchQuery, wineMatches, postcode, setPostcode, wineExcluded,
  renderBdr, WINES, WINERIES, POLICY,
} from '../core.js';
import { goDealCard } from '../ui/godeal.js';
import { openOfferModal, openBuyModal } from '../modals.js';

/* ═══════════════════════════════════════════════════════════════
   SECTION: GO DEALS PAGE  (go-deals.html only, spec 4.4)
   Reuses the same card as the home strip. The floor is not in
   data/go-deals.json at all, so it cannot be revealed here.
   ═══════════════════════════════════════════════════════════════ */
(async function goDealsPage() {
  const grid = $('#goDealPageGrid');
  if (!grid) return;

  const [dealData, content, ok] = await Promise.all([
    loadJSON('go-deals'), loadJSON('how-it-works'), catalogue(),
  ]);
  if (!dealData || !ok) { dataError(grid, 'the live Go Deals'); return; }

  // Spec 4.4 wants the mechanic explained first, in three lines. Those
  // three lines already exist as the Go Deal entry in how-it-works.json,
  // so this page renders the same sentences rather than a second copy
  // that can drift away from them.
  const explainer = $('#goDealExplainer');
  const mechanic = content && content.mechanics.items.find((m) => m.name === 'Go Deal');
  if (explainer && mechanic) {
    explainer.replaceChildren(...mechanic.lines.map((l) => el('li', null, l)));
  }

  const paint = () => {
    const cards = dealData.go_deals
      .map((deal) => { const w = wineBySlug(deal.wine_slug); return w ? goDealCard(deal, w, paint) : null; })
      .filter(Boolean);
    grid.replaceChildren(...(cards.length
      ? cards
      : [el('p', 'market__empty', 'No Go Deals are running right now.')]));
    const count = $('#goDealCount');
    if (count) {
      count.textContent = cards.length === 1
        ? 'One Go Deal is running now' : `${cards.length} Go Deals are running now`;
    }
  };
  paint();

})();
