/* ═══════════════════════════════════════════════════════════════════
   GO WINE GO — RENDERER — wine card
   One card pattern, repeated. Home, winery profile and the account shortlist.

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
   SECTION: MARKET  (sample listings grid, home page only)
   One card pattern repeated, so it maps to a single PHP loop.
   No photography: the library has no bottle shots and inventing one
   is not an option.
   ═══════════════════════════════════════════════════════════════ */
const STATE_LABEL = {
  buy_now:        ['Buy now',        'pill--ok'],
  open_to_offers: ['Open to offers', 'pill--wait'],
  go_deal:        ['Go Deal live',   'pill--ok'],
};

/* Shortlist is Winescape's term for saved wines. The toggle writes
   straight to the store, so it survives a refresh. */
function shortlistButton(slug) {
  const btn = el('button', 'btn btn--quiet wine-card__save');
  const paint = () => {
    const on = isShortlisted(slug, shortlistSeed());
    btn.classList.toggle('is-on', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.setAttribute('aria-label', on ? 'Remove from shortlist' : 'Add to shortlist');
    btn.replaceChildren(icon(on ? 'i-check' : 'i-plus', true));
  };
  btn.addEventListener('click', () => {
    const added = toggleShortlist(slug, shortlistSeed());
    paint();
    toast(added ? 'Added to your shortlist.' : 'Removed from your shortlist.', added ? 'i-check-circle' : 'i-check');
  });
  paint();
  return btn;
}

function wineCard(w) {
  const card = el('article', 'wine-card');
  card.appendChild(el('div', 'wine-card__tone wine-card__tone--t' + w.tone));
  if (w.accolade) card.appendChild(el('p', 'wine-card__badge', w.accolade));

  const body = el('div', 'wine-card__body');
  // The producer name links through to the winery profile, and the wine
  // name to its detail page. Model A: the winery is the seller, so its
  // name is never dead text on a card.
  const producer = el('p', 'label wine-card__producer');
  const producerLink = el('a', 'wine-card__producer-link', wineryName(w));
  producerLink.href = `/winery.html?slug=${encodeURIComponent(w.winery_slug)}`;
  producer.appendChild(producerLink);
  body.appendChild(producer);

  const name = el('h3', 'wine-card__name');
  const nameLink = el('a', 'wine-card__name-link', w.name);
  nameLink.href = `/wine.html?slug=${encodeURIComponent(w.slug)}`;
  name.appendChild(nameLink);
  body.appendChild(name);

  const meta = el('p', 'wine-card__meta');
  meta.appendChild(el('span', null, String(w.vintage)));
  meta.appendChild(el('span', null, w.subregion + ', ' + w.gi));
  body.appendChild(meta);
  body.appendChild(el('p', 'wine-card__variety', w.variety));

  const [stateText, stateClass] = STATE_LABEL[w.state];
  const state = el('p', 'wine-card__state');
  state.appendChild(el('span', 'pill ' + stateClass, stateText));
  body.appendChild(state);

  const foot = el('div', 'wine-card__foot');
  const price = el('div', 'wine-card__price');
  price.appendChild(el('span', 'label', 'Per case'));
  const val = el('span', 'wine-card__price-val', round(w.list_price_per_case));
  val.appendChild(el('span', 'wine-card__price-unit', w.case_size + ' bottles'));
  price.appendChild(val);
  foot.appendChild(price);
  foot.appendChild(el('p', 'wine-card__tax', wetNote()));

  const actions = el('div', 'wine-card__actions');
  actions.appendChild(shortlistButton(w.slug));
  if (w.state === 'buy_now') {
    const buy = el('button', 'btn btn--solid', 'Buy now');
    buy.addEventListener('click', () => openBuyModal(w.slug));
    actions.appendChild(buy);
  } else {
    const offer = el('button', 'btn btn--solid', 'Make an offer');
    offer.addEventListener('click', () => openOfferModal(w.slug));
    actions.appendChild(offer);
    const buy = el('button', 'btn btn--ghost', 'Buy now');
    buy.addEventListener('click', () => openBuyModal(w.slug));
    actions.appendChild(buy);
  }
  foot.appendChild(actions);

  body.appendChild(foot);
  card.appendChild(body);
  return card;
}

export {
  wineCard,
  shortlistButton,
  STATE_LABEL,
};
