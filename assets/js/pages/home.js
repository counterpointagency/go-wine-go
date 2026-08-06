/* ═══════════════════════════════════════════════════════════════════
   GO WINE GO — PAGE — home.js
   Market grid, Go Deals strip and region tiles.

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
import { wineCard, shortlistButton, STATE_LABEL } from '../ui/cards.js';
import { goDealCard } from '../ui/godeal.js';
import { openOfferModal, openBuyModal } from '../modals.js';

(async function marketSection() {
  const grid = $('#wineGrid');
  if (!grid) return;

  if (!(await catalogue())) { dataError(grid, 'the sample listings'); return; }
  await seedShortlist();

  const featured = WINES.filter((w) => w.featured);
  const note = $('#marketNote');
  const term = searchQuery().toLowerCase();
  let chip = 'all';

  /* ── the search state, so a filtered view says so and can be undone ── */
  const banner = $('#marketSearch');
  if (banner) {
    if (term) {
      banner.replaceChildren();
      banner.appendChild(icon('i-search', true));
      const label = el('span');
      label.appendChild(document.createTextNode('Showing results for '));
      label.appendChild(el('b', null, '“' + searchQuery() + '”'));
      banner.appendChild(label);
      const clear = el('a', 'btn btn--quiet btn--sm', 'Clear search');
      clear.href = '/index.html#market';
      banner.appendChild(clear);
      banner.hidden = false;
    } else {
      banner.hidden = true;
    }
  }

  /* ── the postcode control, persisted ── */
  const pcInput = $('#marketPostcode');
  if (pcInput) {
    pcInput.value = postcode();
    const apply = () => { setPostcode(pcInput.value); render(); };
    pcInput.addEventListener('change', apply);
    pcInput.addEventListener('blur', apply);
    const clearPc = $('#marketPostcodeClear');
    if (clearPc) clearPc.addEventListener('click', () => {
      pcInput.value = ''; setPostcode(''); render();
    });
  }

  function render() {
    const byChip = featured.filter((w) =>
      chip === 'all' ||
      (chip === 'red' || chip === 'white' ? w.colour === chip : w.state === chip));
    const bySearch = term ? byChip.filter((w) => wineMatches(w, term)) : byChip;

    // Territory: excluded listings are REMOVED, never greyed. A customer in
    // an excluded postcode must not be able to tell which winery excluded it.
    const pc = postcode();
    const blocked = pc ? bySearch.filter((w) => wineExcluded(w, pc)) : [];
    const shown = pc ? bySearch.filter((w) => !wineExcluded(w, pc)) : bySearch;

    if (!shown.length) {
      const empty = el('div', 'market__empty');
      empty.appendChild(icon('i-search'));
      empty.appendChild(el('p', 'market__empty-title',
        term ? 'Nothing matches “' + searchQuery() + '”'
             : 'No sample listings match that filter.'));
      empty.appendChild(el('p', 'market__empty-text',
        blocked.length
          ? 'Every listing that matched is unavailable to postcode ' + pc + '.'
          : 'Try a winery, a variety like cabernet, or a subregion like Wilyabrup.'));
      const back = el('a', 'btn btn--ghost', term ? 'Clear search' : 'Show all listings');
      back.href = '/index.html#market';
      back.addEventListener('click', () => { chip = 'all'; });
      empty.appendChild(back);
      grid.replaceChildren(empty);
    } else {
      grid.replaceChildren(...shown.map(wineCard));
    }

    if (note) {
      note.textContent = shown.length + ' of ' + featured.length +
        ' sample listings · Margaret River · Make an offer or buy at the listed price';
    }
    // States how many are withheld, and never which winery withheld them.
    const excl = $('#marketExcluded');
    if (excl) {
      if (blocked.length) {
        excl.replaceChildren();
        excl.appendChild(icon('i-alert', true));
        const line = el('span');
        line.appendChild(el('b', null, String(blocked.length)));
        line.appendChild(document.createTextNode(
          (blocked.length === 1 ? ' listing is' : ' listings are') +
          ' not available for delivery to ' + pc + '.'));
        excl.appendChild(line);
        excl.hidden = false;
      } else {
        excl.hidden = true;
      }
    }
  }

  $$('.market__filter').forEach((c) => {
    c.addEventListener('click', () => {
      $$('.market__filter').forEach((x) => x.classList.remove('is-active'));
      c.classList.add('is-active');
      chip = c.dataset.filter;
      render();
    });
  });

  render();
})();

(async function goDealsSection() {
  const grid = $('#goDealGrid');
  if (!grid) return;

  const [dealData, ok] = await Promise.all([loadJSON('go-deals'), catalogue()]);
  if (!dealData || !ok) { dataError(grid, 'the live Go Deals'); return; }

  const paint = () => {
    const cards = dealData.go_deals
      .map((deal) => { const w = wineBySlug(deal.wine_slug); return w ? goDealCard(deal, w, paint) : null; })
      .filter(Boolean);
    grid.replaceChildren(...cards);
  };
  paint();
})();

/* ═══════════════════════════════════════════════════════════════
   SECTION: REGIONS  (home page only)
   Copy sits BELOW each photograph on bone, never over it, so this
   section needs no scrim and the photographs render untinted.
   ═══════════════════════════════════════════════════════════════ */
(async function regionsSection() {
  const grid = $('#regionGrid');
  if (!grid) return;

  const data = await loadJSON('regions');
  if (!data) { dataError(grid, 'the subregions'); return; }

  grid.replaceChildren(...data.regions.map((r) => {
    const tile = el('a', 'region-tile');
    tile.href = '/index.html#market';

    tile.appendChild(picture(r.image, r.alt, 900, 900, false,
      '(max-width: 760px) 50vw, (max-width: 1100px) 33vw, 25vw'));

    const body = el('div', 'region-tile__body');
    body.appendChild(el('p', 'region-tile__name', r.name));
    body.appendChild(el('p', 'region-tile__gi', r.gi));
    body.appendChild(el('p', 'region-tile__blurb', r.blurb));
    tile.appendChild(body);
    return tile;
  }));
})();
