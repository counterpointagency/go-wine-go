/* ═══════════════════════════════════════════════════════════════════
   GO WINE GO — PAGE — supplier.js
   Supplier dashboard, spec 4.8.

   Plain ES modules, served as-is. No build step and no manifest at the
   repo root, which is what broke the Round 2 deploy.
   ═══════════════════════════════════════════════════════════════════ */

import {
  $, $$, el, icon, money, round, auDate, toast, loadJSON, dataError,
  Store, userOffers, userOrders, userTenders, offerStates, goDealCommits,
  isShortlisted, toggleShortlist, shortlistSeed, seedShortlist, isPast, isoInDays,
  catalogue, wineBySlug, winesOf, wineryName, fillTemplate, slugParam, picture,
  wetNote, searchQuery, wineMatches, postcode, setPostcode, wineExcluded,
  renderBdr, reveal, WINES, WINERIES, POLICY,
} from '../core.js';

/* Shared between the two supplier blocks on this page, and nowhere else. */
let wirePodButtons = null;

/* ═══════════════════════════════════════════════════════════════
   SECTION: SUPPLIER — offers inbox, Go Deal tiers, payouts
   Spec 4.8. These read from data/supplier.json, which is the ONLY
   file holding a floor price. Nothing here is rendered on a
   buyer-facing page.
   ═══════════════════════════════════════════════════════════════ */
(async function supplierData() {
  const root = $('#supplierRoot');
  if (!root) return;

  const [sup, ok] = await Promise.all([loadJSON('supplier'), catalogue()]);
  if (!sup || !ok) { dataError($('#supStats', root) || root, 'the dashboard'); return; }

  const winery = WINERIES[sup.winery_slug];
  const floorOf = (slug) => (sup.listings.find((l) => l.wine_slug === slug) || {}).floor_price;

  $('#supWelcome', root).replaceChildren(
    document.createTextNode('Welcome back, '),
    el('b', null, winery.name),
    document.createTextNode(' · Licensed producer ' + winery.licence_number));

  /* ── stat cards ───────────────────────────────────────────── */
  $('#supStats', root).replaceChildren(...sup.stats.map((s) => {
    const box = el('div', 'supplier__stat');
    box.appendChild(el('p', 'supplier__stat-num', s.value));
    box.appendChild(el('p', 'supplier__stat-lbl', s.label));
    return box;
  }));

  /* ── my listings, with territory exclusions ───────────────── */
  $('#listingsBody', root).replaceChildren(...sup.listings.map((l) => {
    const w = wineBySlug(l.wine_slug);
    const row = document.createElement('tr');

    const wineCell = el('td');
    wineCell.appendChild(el('b', null, `${w.name} ${w.vintage}`));
    wineCell.appendChild(el('span', 'supplier__table-sub',
      `${w.subregion}, ${w.gi} · ${w.case_size} bottles per case`));
    row.appendChild(wineCell);

    row.appendChild(el('td', null, String(w.cases_available)));
    row.appendChild(el('td', null, round(w.list_price_per_case)));
    row.appendChild(el('td', null, round(l.floor_price)));
    row.appendChild(el('td', null, String(l.open_offers)));

    const stateCell = el('td');
    stateCell.appendChild(el('span', 'pill pill--ok',
      w.state === 'go_deal' ? 'Go Deal live' : 'Active'));
    row.appendChild(stateCell);

    const exclCell = el('td');
    exclCell.appendChild(el('span', 'supplier__excl',
      winery.territory_exclusions.length
        ? winery.territory_exclusions.join(', ')
        : 'None, sells everywhere'));
    row.appendChild(exclCell);

    const actions = el('td');
    const go = el('button', 'btn btn--ghost btn--sm', 'Go Deal');
    go.addEventListener('click', () => {
      const card = $('#goDealCard', root);
      card.hidden = false;
      reveal(card);
    });
    actions.appendChild(go);
    const remove = el('button', 'btn btn--quiet btn--sm', 'Remove');
    remove.addEventListener('click', () => {
      if (confirm('Remove this listing?')) row.remove();
    });
    actions.appendChild(remove);
    row.appendChild(actions);
    return row;
  }));
  $('#listingCount', root).textContent =
    sup.listings.length === 1 ? '1 active listing' : `${sup.listings.length} active listings`;

  /* ── offers inbox: accept, counter, reject, with expiry ────── */
  const awaiting = sup.offers_inbox.filter((o) => o.status === 'awaiting');
  $('#supOfferCount', root).textContent =
    awaiting.length === 1 ? '1 awaiting response' : `${awaiting.length} awaiting response`;

  $('#supOffers', root).replaceChildren(...sup.offers_inbox.map((o) => {
    const w = wineBySlug(o.wine_slug);
    const floor = floorOf(o.wine_slug);
    const wrap = el('div', 'supplier__offer');

    const left = el('div');
    left.appendChild(el('p', 'supplier__offer-name', `${w.name} ${w.vintage}`));
    const meta = el('p', 'supplier__offer-meta');
    meta.appendChild(document.createTextNode(o.customer + ' offered '));
    meta.appendChild(el('b', null, round(o.price_per_case) + ' per case'));
    meta.appendChild(document.createTextNode(
      ` for ${o.quantity} case${o.quantity > 1 ? 's' : ''} · ` +
      (o.status === 'awaiting' ? 'Expires ' : 'Closed ') + auDate(o.expires_at)));
    left.appendChild(meta);

    if (o.status === 'awaiting') {
      const atOrAbove = o.price_per_case >= floor;
      const flag = el('p', 'supplier__offer-flag' + (atOrAbove ? '' : ' supplier__offer-flag--under'));
      flag.appendChild(icon(atOrAbove ? 'i-check-circle' : 'i-alert', true));
      flag.appendChild(el('span', null, atOrAbove
        ? 'At or above your floor. Auto-accept would take this.'
        : 'Below your floor. Needs a decision.'));
      left.appendChild(flag);
    }
    wrap.appendChild(left);

    const actions = el('div', 'supplier__offer-actions');
    if (o.status !== 'awaiting') {
      actions.appendChild(el('span', 'pill pill--ok', 'Accepted'));
      wrap.appendChild(actions);
      return wrap;
    }

    const counterBox = el('div', 'supplier__counter');
    const field = el('div', 'field');
    const label = el('label', 'field__label', 'Counter at ($ per case)');
    const input = document.createElement('input');
    input.className = 'field__input';
    input.type = 'number';
    input.id = 'counter-' + o.id;
    input.value = String(Math.round((o.price_per_case + w.list_price_per_case) / 2));
    label.htmlFor = input.id;
    field.appendChild(label);
    field.appendChild(input);
    counterBox.appendChild(field);
    const send = el('button', 'btn btn--solid btn--sm', 'Send counteroffer');
    send.addEventListener('click', () => {
      actions.replaceChildren(el('span', 'pill pill--wait', 'Countered at ' + round(input.value)));
      counterBox.classList.remove('is-open');
      toast(`Counteroffer sent to ${o.customer} at ${round(input.value)} per case.`, 'i-exchange');
    });
    counterBox.appendChild(send);

    const accept = el('button', 'btn btn--solid btn--sm', 'Accept');
    accept.addEventListener('click', () => {
      actions.replaceChildren(el('span', 'pill pill--ok', 'Accepted'));
      counterBox.classList.remove('is-open');
      toast(`Offer accepted. ${o.customer} will be charged ` +
            `${round(o.price_per_case)} per case.`, 'i-check-circle');
    });
    const counter = el('button', 'btn btn--ghost btn--sm', 'Counter');
    counter.addEventListener('click', () => counterBox.classList.toggle('is-open'));
    const reject = el('button', 'btn btn--quiet btn--sm', 'Reject');
    reject.addEventListener('click', () => {
      if (!confirm('Reject this offer?')) return;
      actions.replaceChildren(el('span', 'pill pill--inactive', 'Rejected'));
      counterBox.classList.remove('is-open');
      toast('Offer rejected.', 'i-x-circle');
    });
    actions.append(accept, counter, reject);
    wrap.appendChild(actions);
    wrap.appendChild(counterBox);
    return wrap;
  }));

  /* ── Go Deal engine: floor, tiers, commitment ─────────────── */
  const deal = sup.go_deal;
  const dealWine = wineBySlug(deal.wine_slug);
  $('#goDealWine', root).textContent = `${dealWine.name} ${dealWine.vintage}`;
  $('#goDealSticker', root).value = String(deal.list_price);
  $('#goDealFloor', root).value = String(deal.floor_price);
  $('#goDealSticker', root).dispatchEvent(new Event('input'));
  $('#goDealCommitted', root).replaceChildren(
    el('b', null, String(deal.committed_cases)),
    document.createTextNode(' cases committed · closes ' + auDate(deal.closes_at)));

  $('#goDealTiers', root).replaceChildren(...deal.tiers.map((t) => {
    const reached = deal.committed_cases >= t.cases;
    const li = el('li', 'supplier__tier' + (reached ? ' is-reached' : ''));
    li.appendChild(el('span', 'supplier__tier-cases',
      t.cases === 0 ? 'From the first case' : `At ${t.cases} cases`));
    li.appendChild(el('span', 'supplier__tier-price', round(t.price) + ' per case'));
    li.appendChild(el('span', 'supplier__tier-state',
      reached ? 'Reached' : `${t.cases - deal.committed_cases} more`));
    return li;
  }));

  /* ── orders and dispatch ──────────────────────────────────── */
  const DISPATCH = {
    dispatched: ['Dispatched', 'pill--ok'],
    awaiting_payment: ['Awaiting payment', 'pill--wait'],
    delivered: ['Delivered', 'pill--ok'],
  };
  $('#supOrders', root).replaceChildren(...sup.orders.map((o) => {
    const w = wineBySlug(o.wine_slug);
    const row = document.createElement('tr');
    row.appendChild(el('td', null, o.id));
    row.appendChild(el('td', null, o.customer));
    row.appendChild(el('td', null, `${w.name} ${w.vintage}`));
    row.appendChild(el('td', null, String(o.quantity)));
    row.appendChild(el('td', null, round(o.sale_price)));
    const state = el('td');
    const [lbl, cls] = DISPATCH[o.dispatch_state];
    state.appendChild(el('span', 'pill ' + cls,
      o.pod_state === 'received' ? 'Paid out' : lbl));
    row.appendChild(state);
    const action = el('td');
    if (o.dispatch_state !== 'awaiting_payment' && o.pod_state !== 'received') {
      const btn = el('button', 'btn btn--ghost btn--sm', 'Upload proof of delivery');
      btn.dataset.podOrder = o.id;
      btn.dataset.podSale = String(o.sale_price);
      action.appendChild(btn);
    } else {
      action.appendChild(el('span', 'supplier__excl',
        o.pod_state === 'received' ? 'Complete' : 'None'));
    }
    row.appendChild(action);
    return row;
  }));

  /* ── payouts: released and pending ────────────────────────── */
  const rate = sup.payouts.commission_rate;
  const net = (gross) => gross * (1 - rate);
  const relCol = $('#supReleased', root);
  relCol.replaceChildren(...sup.payouts.released.map((p) => {
    const row = el('div', 'supplier__payout-row');
    const left = el('span');
    left.appendChild(el('b', null, p.order_id));
    left.appendChild(el('span', 'supplier__payout-sub', 'Released ' + auDate(p.released_at)));
    row.appendChild(left);
    row.appendChild(el('span', null, money(net(p.amount))));
    return row;
  }));
  const relTotal = sup.payouts.released.reduce((n, p) => n + net(p.amount), 0);
  relCol.appendChild((() => {
    const t = el('div', 'supplier__payout-total');
    t.appendChild(el('span', null, 'Released'));
    t.appendChild(el('span', null, money(relTotal)));
    return t;
  })());

  const penCol = $('#supPending', root);
  penCol.replaceChildren(...sup.payouts.pending.map((p) => {
    const row = el('div', 'supplier__payout-row');
    const left = el('span');
    left.appendChild(el('b', null, p.order_id));
    left.appendChild(el('span', 'supplier__payout-sub', p.reason));
    row.appendChild(left);
    row.appendChild(el('span', null, money(net(p.amount))));
    return row;
  }));
  const penTotal = sup.payouts.pending.reduce((n, p) => n + net(p.amount), 0);
  penCol.appendChild((() => {
    const t = el('div', 'supplier__payout-total');
    t.appendChild(el('span', null, 'Pending'));
    t.appendChild(el('span', null, money(penTotal)));
    return t;
  })());

  $('#supPayoutNote', root).textContent =
    `Amounts shown are net of ${Math.round(rate * 100)}% commission. ` +
    'Funds release when proof of delivery is uploaded.';

  // The proof-of-delivery buttons are rendered above, so their handlers
  // are wired after the table exists rather than at first paint.
  if (typeof wirePodButtons === 'function') wirePodButtons();
})();

/* ═══════════════════════════════════════════════════════════════
   SECTION: SUPPLIER  (supplier.html only)
   Listings, the Go Deal engine, and proof of delivery. Uploading a
   POD is what releases the payment to the winery.
   ═══════════════════════════════════════════════════════════════ */
(function supplierSection() {
  const root = $('#supplierRoot');
  if (!root) return;

  /* ── listings ─────────────────────────────────────────────── */
  const form = $('#listWineForm', root);
  const toggleForm = () => form.classList.toggle('is-open');

  $('#listNewWine', root).addEventListener('click', toggleForm);
  $('#cancelListing', root).addEventListener('click', toggleForm);

  $('#saveListing', root).addEventListener('click', () => {
    const val = (id) => $('#' + id, root).value;
    const name = val('newWineName').trim();
    const vintage = val('newVintage');
    const region = val('newRegion').trim();
    const caseSize = val('newCaseSize');
    const price = val('newPrice');
    const floor = val('newFloor');
    const auto = $('#autoAccept', root).checked;

    if (!name || !vintage || !region || !price) {
      toast('Please fill in all required fields.', 'i-x-circle');
      return;
    }

    const row = document.createElement('tr');
    const wineCell = el('td');
    wineCell.appendChild(el('b', null, name + ' ' + vintage));
    wineCell.appendChild(el('span', 'supplier__table-sub',
      region + ' · ' + caseSize + ' bottles per case'));
    row.appendChild(wineCell);
    row.appendChild(el('td', null, '$' + price + ' per case'));
    row.appendChild(el('td', null, floor ? '$' + floor + ' per case' : 'None'));
    row.appendChild(el('td', null, '0'));
    const stateCell = el('td');
    stateCell.appendChild(el('span', 'pill pill--ok', 'Active'));
    row.appendChild(stateCell);
    const actionCell = el('td');
    const goDeal = el('button', 'btn btn--ghost btn--sm', 'Go Deal');
    goDeal.addEventListener('click', openGoDeal);
    actionCell.appendChild(goDeal);
    const remove = el('button', 'btn btn--quiet btn--sm', 'Remove');
    remove.addEventListener('click', () => {
      if (confirm('Remove this listing?')) row.remove();
    });
    actionCell.appendChild(remove);
    row.appendChild(actionCell);
    $('#listingsBody', root).appendChild(row);

    toggleForm();
    toast('Listing saved' + (auto ? ' with auto-accept enabled' : '') + '.', 'i-check-circle');
  });

  $$('[data-removes-row]', root).forEach((btn) => {
    btn.addEventListener('click', () => {
      if (confirm('Remove this listing?')) btn.closest('tr').remove();
    });
  });

  /* ── Go Deal engine ───────────────────────────────────────── */
  const goDealCardEl = $('#goDealCard', root);
  function openGoDeal() {
    goDealCardEl.hidden = false;
    reveal(goDealCardEl);
  }
  function closeGoDeal() { goDealCardEl.hidden = true; }

  $$('[data-opens-godeal]', root).forEach((b) => b.addEventListener('click', openGoDeal));
  $$('[data-closes-godeal]', root).forEach((b) => b.addEventListener('click', closeGoDeal));

  $('#saveGoDeal', root).addEventListener('click', () => {
    closeGoDeal();
    toast('Go Deal saved. Auto-accept is ' +
      ($('#goDealAuto', root).checked ? 'on' : 'off') + '.', 'i-check-circle');
  });

  const stickerEl = $('#goDealSticker', root);
  const floorEl = $('#goDealFloor', root);
  function refreshMargin() {
    const sticker = parseFloat(stickerEl.value);
    const floor = parseFloat(floorEl.value);
    const out = $('#goDealMargin', root);
    if (!sticker || isNaN(floor)) {
      out.textContent = 'Enter a list price and a floor price.';
      return;
    }
    const pct = ((sticker - floor) / sticker * 100).toFixed(1);
    out.replaceChildren(
      document.createTextNode('Floor is '),
      el('b', null, pct + '%'),
      document.createTextNode(' below the list price. Buyers never see it.')
    );
  }
  stickerEl.addEventListener('input', refreshMargin);
  floorEl.addEventListener('input', refreshMargin);
  refreshMargin();

  /* ── proof of delivery ────────────────────────────────────── */
  let podSale = 0;
  const podPanel = $('#podPanel', root);

  wirePodButtons = () => $$('[data-pod-order]', root).forEach((btn) => {
    if (btn.dataset.podWired) return;
    btn.dataset.podWired = '1';
    btn.addEventListener('click', () => {
      podSale = Number(btn.dataset.podSale);
      $('#podOrderId', root).textContent = btn.dataset.podOrder;
      $('#podResult', root).hidden = true;
      $('#podUploadArea', root).hidden = false;
      podPanel.hidden = false;
      reveal(podPanel);
    });
  });

  $('#closePOD', root).addEventListener('click', () => { podPanel.hidden = true; });

  $('#podFile', root).addEventListener('change', () => {
    const commission = podSale * 0.08;
    const net = podSale - commission;
    $('#podSalePrice', root).textContent  = money(podSale);
    $('#podCommission', root).textContent = '−' + money(commission);
    $('#podNet', root).textContent        = money(net);
    $('#podUploadArea', root).hidden = true;
    $('#podResult', root).hidden = false;
    toast('Proof of delivery uploaded. ' + money(net) + ' is being released to you.', 'i-check-circle');
  });
})();
