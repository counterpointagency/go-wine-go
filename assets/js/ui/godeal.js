/* ═══════════════════════════════════════════════════════════════════
   GO WINE GO — RENDERER — Go Deal card
   Shared by the home strip and the Go Deals archive. The floor is never
   rendered: progress runs toward the next published tier.

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
import { openOfferModal, openBuyModal } from '../modals.js';

/* ═══════════════════════════════════════════════════════════════
   SECTION: GO DEALS STRIP  (home page only)
   The winery sets a list price and a hidden floor. As more cases are
   committed the price falls for everyone, and when the deal closes
   everyone pays the final price.

   THE FLOOR IS NEVER SHOWN and is not in data/go-deals.json at all.
   Progress runs toward the next PUBLISHED tier, so the bar can never
   imply how far the price still has to fall.
   ═══════════════════════════════════════════════════════════════ */
function goDealCard(deal, w, onCommit) {
  // Cases this visitor has committed sit on top of the base figure and are
  // held in the store, so the bar stays where they left it after a refresh.
  const committed = deal.committed_cases + (goDealCommits()[w.slug] || 0);
  const reached = deal.tiers.filter((t) => t.cases <= committed).pop() || deal.tiers[0];
  const next    = deal.tiers.find((t) => t.cases > committed) || null;
  const span    = next ? next.cases - reached.cases : 0;
  const pct     = next ? Math.round(((committed - reached.cases) / span) * 100) : 100;

  const card = el('article', 'godeal');

  const top = el('div', 'godeal__top');
  const identity = el('div');
  identity.appendChild(el('p', 'label godeal__producer', wineryName(w)));
  identity.appendChild(el('h3', 'godeal__name', w.name + ' ' + w.vintage));
  identity.appendChild(el('p', 'godeal__meta', w.variety + ' · ' + w.subregion + ' · ' + w.case_size + ' bottles per case'));
  top.appendChild(identity);

  const price = el('div', 'godeal__price');
  price.appendChild(el('span', 'godeal__price-val', round(reached.price)));
  if (reached.price < deal.list_price) {
    price.appendChild(el('span', 'godeal__price-was', round(deal.list_price)));
  }
  top.appendChild(price);
  card.appendChild(top);

  const track = el('div', 'godeal__track');
  track.setAttribute('role', 'progressbar');
  track.setAttribute('aria-valuemin', '0');
  track.setAttribute('aria-valuemax', '100');
  track.setAttribute('aria-valuenow', String(pct));
  track.setAttribute('aria-label', next
    ? 'Progress toward the next price tier for ' + w.name
    : 'Final price tier reached for ' + w.name);
  const fill = el('div', 'godeal__fill');
  fill.style.width = pct + '%';
  track.appendChild(fill);
  card.appendChild(track);

  const stats = el('div', 'godeal__stats');
  const committedLine = el('span');
  committedLine.appendChild(el('b', null, String(committed)));
  committedLine.appendChild(document.createTextNode(' cases committed'));
  stats.appendChild(committedLine);
  stats.appendChild(el('span', null, pct + '% to the next price'));
  card.appendChild(stats);

  const nextLine = el('p', 'godeal__next');
  if (next) {
    nextLine.appendChild(document.createTextNode(
      (next.cases - committed) + ' more cases and the price drops to '));
    nextLine.appendChild(el('b', null, round(next.price) + ' per case'));
    nextLine.appendChild(document.createTextNode(' for everyone.'));
  } else {
    nextLine.appendChild(document.createTextNode('The final tier has been reached. Everyone pays '));
    nextLine.appendChild(el('b', null, round(reached.price) + ' per case'));
    nextLine.appendChild(document.createTextNode(' when the deal closes.'));
  }
  card.appendChild(nextLine);

  const foot = el('div', 'godeal__foot');
  const join = el('button', 'btn btn--solid', 'Commit a case');
  join.addEventListener('click', () => {
    const commits = goDealCommits();
    commits[w.slug] = (commits[w.slug] || 0) + 1;
    Store.set('goDealCommits', commits);
    const now = deal.committed_cases + commits[w.slug];
    const tier = deal.tiers.filter((t) => t.cases <= now).pop() || deal.tiers[0];
    toast(`One case committed. ${now} cases in, everyone pays ` +
          `${round(tier.price)} per case if it closes here.`, 'i-check-circle');
    if (onCommit) onCommit();
  });
  foot.appendChild(join);
  foot.appendChild(el('span', 'godeal__closes', 'Closes ' + auDate(deal.closes_at)));
  card.appendChild(foot);

  return card;
}

export {
  goDealCard,
};
