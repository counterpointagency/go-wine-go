/* ═══════════════════════════════════════════════════════════════════
   GO WINE GO — RENDERER — tender card
   Shared by the tenders page and the account. Never called an auction,
   and a submission is never called a bid.

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

/* ═══════════════════════════════════════════════════════════════
   SHARED: TENDER CARD
   One pattern for tenders.html and for "Tenders I have posted" on
   account.html, so it maps to a single PHP loop. A submission is
   never called a bid and this is never called an auction.
   ═══════════════════════════════════════════════════════════════ */
function tenderCard(t, mine) {
  const card = el('article', 'tender-card');

  const top = el('div', 'tender-card__top');
  const left = el('div');
  left.appendChild(el('p', 'tender-card__id', t.id));
  left.appendChild(el('h3', 'tender-card__name',
    `${t.variety}, ${t.vintage_from} to ${t.vintage_to}`));
  left.appendChild(el('p', 'tender-card__meta',
    `${t.gi} · ${t.quantity_cases} cases · Closes ${auDate(t.closes_at)}`));
  top.appendChild(left);

  const max = el('div', 'tender-card__max');
  max.appendChild(el('span', 'tender-card__max-val', round(t.max_price_per_case)));
  max.appendChild(el('span', 'tender-card__max-lbl', 'Maximum per case'));
  top.appendChild(max);
  card.appendChild(top);

  const foot = el('div', 'tender-card__foot');
  const subs = el('p', 'tender-card__subs');
  subs.appendChild(el('b', null, String(t.submission_count)));
  subs.appendChild(document.createTextNode(
    t.submission_count === 1 ? ' winery has submitted' : ' wineries have submitted'));
  foot.appendChild(subs);

  const action = el('button', 'btn ' + (mine ? 'btn--solid' : 'btn--ghost') + ' btn--sm',
    mine ? 'Review submissions' : 'View tender');
  action.addEventListener('click', () => {
    toast(mine
      ? `${t.submission_count} submissions on ${t.id}. You can accept one, or none.`
      : `Tender ${t.id} closes ${auDate(t.closes_at)}.`, 'i-doc');
  });
  foot.appendChild(action);
  card.appendChild(foot);
  return card;
}

export {
  tenderCard,
};
