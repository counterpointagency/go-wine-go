/* ═══════════════════════════════════════════════════════════════════
   GO WINE GO — PAGE — account.js
   Signed-in customer view, spec 4.9.

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
import { tenderCard } from '../ui/tender.js';
import { openOfferModal, openBuyModal } from '../modals.js';

/* ═══════════════════════════════════════════════════════════════
   SECTION: ACCOUNT  (account.html only, spec 4.9)
   Shortlist, My Offers with status, Orders with tracking, Tenders I
   have posted, Addresses. Every panel renders from data — the
   customer comes from data/account.json, which is a new entity
   because spec 5 models what is bought and sold but never the buyer.

   "Shortlist" is Winescape's own term for saved wines and is used
   here instead of wishlist, favourites or saved.
   ═══════════════════════════════════════════════════════════════ */
const OFFER_STATE = {
  sent:      ['Awaiting response', 'pill--wait'],
  countered: ['Countered',         'pill--wait'],
  accepted:  ['Accepted',          'pill--ok'],
  declined:  ['Declined',          'pill--inactive'],
  expired:   ['Expired',           'pill--inactive'],
};

/* Three fixed steps. Each is named in text beside the rail, so the
   rail never carries the meaning on its own (WCAG 1.4.1). */
const DISPATCH_STEPS = [
  ['Order placed',   ['awaiting_dispatch', 'in_transit', 'delivered']],
  ['In transit',     ['in_transit', 'delivered']],
  ['Delivered',      ['delivered']],
];

function offerRow(offer) {
  const w = wineBySlug(offer.wine_slug);
  if (!w) return null;
  // An offer past its expires_at is expired regardless of the status it was
  // authored with, and a stored override beats both.
  const override = offerStates()[offer.id];
  let status = override || offer.status;
  if ((status === 'sent' || status === 'countered') && isPast(offer.expires_at)) status = 'expired';
  offer = { ...offer, status };
  const [label, pillClass] = OFFER_STATE[offer.status] || OFFER_STATE.sent;

  const row = el('div', 'account__row');
  const left = el('div');
  left.appendChild(el('p', 'account__row-name', `${w.name} ${w.vintage}, ${wineryName(w)}`));
  left.appendChild(el('p', 'account__row-meta',
    `Your offer ${round(offer.price_per_case)} per case · ${offer.quantity} case` +
    `${offer.quantity > 1 ? 's' : ''} · ${w.subregion}, ${w.gi}`));

  if (offer.status === 'countered' && offer.counter_price_per_case) {
    const counter = el('p', 'account__counter');
    counter.appendChild(icon('i-exchange', true));
    counter.appendChild(document.createTextNode('Winery countered at '));
    counter.appendChild(el('b', null, round(offer.counter_price_per_case) + ' per case'));
    left.appendChild(counter);
  }
  left.appendChild(el('p', 'account__row-meta',
    offer.status === 'expired' || offer.status === 'declined'
      ? `Closed ${auDate(offer.expires_at)}`
      : `Expires ${auDate(offer.expires_at)}`));
  row.appendChild(left);

  const actions = el('div', 'account__row-actions');
  actions.appendChild(el('span', 'pill ' + pillClass, label));

  if (offer.status === 'countered') {
    const accept = el('button', 'btn btn--solid btn--sm',
      'Accept ' + round(offer.counter_price_per_case));
    accept.addEventListener('click', () => {
      actions.replaceChildren(el('span', 'pill pill--ok', 'Accepted, proceed to payment'));
      const pay = el('button', 'btn btn--brass btn--sm', 'Pay now');
      pay.addEventListener('click', () => openBuyModal(w.slug));
      actions.appendChild(pay);
      toast(`Counteroffer accepted at ${round(offer.counter_price_per_case)} per case. ` +
            'Proceed to payment.', 'i-check-circle');
    });
    actions.appendChild(accept);
  }
  if (offer.status === 'sent' || offer.status === 'countered') {
    const revise = el('button', 'btn btn--ghost btn--sm', 'New offer');
    revise.addEventListener('click', () => openOfferModal(w.slug));
    actions.appendChild(revise);
    const archive = el('button', 'btn btn--quiet btn--sm', 'Archive');
    archive.addEventListener('click', () => {
      if (!confirm('Archive this offer?')) return;
      const states = offerStates();
      states[offer.id] = 'expired';
      Store.set('offerStates', states);
      row.remove();
      toast('Offer archived.', 'i-check');
    });
    actions.appendChild(archive);
  }
  if (offer.status === 'declined' || offer.status === 'expired') {
    const again = el('button', 'btn btn--ghost btn--sm', 'Offer again');
    again.addEventListener('click', () => openOfferModal(w.slug));
    actions.appendChild(again);
  }
  row.appendChild(actions);
  return row;
}

function orderCard(order) {
  const w = wineBySlug(order.wine_slug);
  if (!w) return null;
  const winery = WINERIES[w.winery_slug];

  const card = el('div', 'account__order');
  const top = el('div', 'account__order-top');
  const left = el('div');
  left.appendChild(el('p', 'account__order-id', order.id));
  left.appendChild(el('p', 'account__order-name', `${w.name} ${w.vintage}`));
  // Seller identification on every order, per spec 8.
  left.appendChild(el('p', 'account__order-meta', fillTemplate(POLICY.seller_line, winery)));
  left.appendChild(el('p', 'account__order-meta',
    `${order.quantity} case${order.quantity > 1 ? 's' : ''} · Ordered ${auDate(order.placed_at)}`));
  top.appendChild(left);

  const right = el('div');
  right.appendChild(el('p', 'account__order-total', money(order.price_paid)));
  right.appendChild(el('p', 'account__order-meta', wetNote()));
  top.appendChild(right);
  card.appendChild(top);

  const rail = el('div', 'account__track');
  const labels = el('div', 'account__track-labels');
  DISPATCH_STEPS.forEach(([name, states]) => {
    const done = states.includes(order.dispatch_state);
    rail.appendChild(el('span', 'account__track-step' + (done ? ' is-done' : '')));
    labels.appendChild(el('span', done ? 'is-done' : null, name));
  });
  card.appendChild(rail);
  card.appendChild(labels);

  const foot = el('div', 'account__order-foot');
  const payment = el('span');
  if (order.payment_state === 'released') {
    payment.appendChild(document.createTextNode('Signed for '));
    payment.appendChild(el('b', null, auDate(order.delivered_at)));
    payment.appendChild(document.createTextNode('. The winery has been paid.'));
  } else {
    payment.appendChild(document.createTextNode('Your payment is held by the payment provider. '));
    payment.appendChild(el('b', null, wineryName(w)));
    payment.appendChild(document.createTextNode(' is paid when your wine is signed for.'));
  }
  foot.appendChild(payment);

  if (order.tracking_reference) {
    const track = el('span');
    track.appendChild(document.createTextNode(order.carrier + ' '));
    track.appendChild(el('b', null, order.tracking_reference));
    foot.appendChild(track);
  } else {
    foot.appendChild(el('span', null, 'Tracking appears here once the winery dispatches.'));
  }
  card.appendChild(foot);
  return card;
}

function addressCard(addr) {
  const card = el('div', 'account__address');
  const label = el('p', 'account__address-label');
  label.appendChild(icon('i-pin', true));
  label.appendChild(document.createTextNode(addr.label));
  if (addr.is_default) label.appendChild(el('span', 'pill pill--ok', 'Default'));
  card.appendChild(label);

  const lines = el('address', 'account__address-lines');
  [addr.recipient, addr.line1, `${addr.suburb} ${addr.state} ${addr.postcode}`]
    .forEach((line, i) => {
      if (i) lines.appendChild(document.createElement('br'));
      lines.appendChild(document.createTextNode(line));
    });
  card.appendChild(lines);
  if (addr.instructions) card.appendChild(el('p', 'account__address-note', addr.instructions));

  // Spec 8: flag a saved address that sits inside a Banned Drinker
  // Register region, so it is known before checkout rather than at it.
  const bdr = el('p', 'bdr');
  card.appendChild(bdr);
  renderBdr(bdr, addr.postcode);
  return card;
}

(async function accountSection() {
  const root = $('#accountRoot');
  if (!root) return;

  $$('.account__tab', root).forEach((tab) => {
    tab.addEventListener('click', () => {
      $$('.account__tab', root).forEach((t) => {
        t.classList.remove('is-active');
        t.setAttribute('aria-selected', 'false');
      });
      $$('.account__panel', root).forEach((p) => p.classList.remove('is-active'));
      tab.classList.add('is-active');
      tab.setAttribute('aria-selected', 'true');
      const panel = $('#ap-' + tab.dataset.tab, root);
      if (panel) panel.classList.add('is-active');
    });
  });

  const [acct, offerData, orderData, tenderData, ok] = await Promise.all([
    loadJSON('account'), loadJSON('offers'), loadJSON('orders'), loadJSON('tenders'), catalogue(),
  ]);
  if (!acct || !offerData || !orderData || !tenderData || !ok) {
    dataError($('#acShortlist', root), 'your account');
    return;
  }

  const c = acct.customer;
  $('#accountName', root).textContent = c.name;

  /* ── Shortlist ─────────────────────────────────────────────── */
  const shortlist = c.shortlist.map(wineBySlug).filter(Boolean);
  const slMount = $('#acShortlist', root);
  slMount.replaceChildren(...(shortlist.length
    ? shortlist.map(wineCard)
    : [el('p', 'account__panel-note', 'Your shortlist is empty.')]));
  const slCount = $('#acShortlistCount', root);
  if (slCount) slCount.textContent = String(shortlist.length);

  /* ── My Offers ─────────────────────────────────────────────── */
  const rows = [...userOffers(), ...offerData.offers].map(offerRow).filter(Boolean);
  $('#acOffers', root).replaceChildren(...(rows.length
    ? rows
    : [el('p', 'account__panel-note', 'You have no offers open.')]));
  const openCount = [...userOffers(), ...offerData.offers]
    .filter((o) => {
      const st = offerStates()[o.id] || o.status;
      if (isPast(o.expires_at)) return false;
      return st === 'sent' || st === 'countered';
    }).length;
  const badge = $('#acOfferBadge', root);
  if (badge) badge.textContent = String(openCount);

  /* ── Orders ────────────────────────────────────────────────── */
  const orders = [...userOrders(), ...orderData.orders].map(orderCard).filter(Boolean);
  $('#acOrders', root).replaceChildren(...(orders.length
    ? orders
    : [el('p', 'account__panel-note', 'You have no orders yet.')]));

  /* ── Tenders I have posted ─────────────────────────────────── */
  const mine = [...userTenders(),
                ...tenderData.tenders.filter((t) => c.my_tenders.includes(t.id))];
  $('#acTenders', root).replaceChildren(...(mine.length
    ? mine.map((t) => tenderCard(t, true))
    : [el('p', 'account__panel-note', 'You have not posted a tender yet.')]));

  /* ── Addresses ─────────────────────────────────────────────── */
  $('#acAddresses', root).replaceChildren(...c.addresses.map(addressCard));
})();
