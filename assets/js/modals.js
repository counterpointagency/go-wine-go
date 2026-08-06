/* ═══════════════════════════════════════════════════════════════════
   GO WINE GO — MODALS
   Offer and buy. Loaded only by the pages that can open one:
   index, wine, winery, go-deals and account.

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
} from './core.js';

/* ═══════════════════════════════════════════════════════════════
   COMPONENT: MODAL UTILITIES  (offer + buy)
   ═══════════════════════════════════════════════════════════════ */
function openModal(id)  { const m = $('#' + id); if (m) m.classList.add('is-open'); }
function closeModal(id) { const m = $('#' + id); if (m) m.classList.remove('is-open'); }
function overlayClose(e, id) { if (e.target.id === id) closeModal(id); }
function showStep(show, hide) {
  const s = $('#' + show), h = $('#' + hide);
  if (s) s.classList.add('is-active');
  if (h) h.classList.remove('is-active');
}
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  closeModal('offerOverlay');
  closeModal('buyOverlay');
});

/* ═══════════════════════════════════════════════════════════════
   COMPONENT: OFFER MODAL
   Language rule: offer, counteroffer, tender. Never bid, never
   auction. No payment moves while an offer is open.
   ═══════════════════════════════════════════════════════════════ */
let currentWineSlug = null;

function openOfferModal(slug) {
  const w = wineBySlug(slug);
  if (!w) return;
  currentWineSlug = slug;
  $('#mWinery').textContent = wineryName(w);
  $('#mWine').textContent   = w.name + ' ' + w.vintage;
  $('#mRegion').textContent = w.subregion + ', ' + w.gi;
  $('#mPrice').textContent  = round(w.list_price_per_case) + ' per case';
  $('#offerAmt').value = '';
  $('#offerQty').value = '1';
  const hint = $('#offerHint');
  hint.replaceChildren(
    document.createTextNode('Listed at '),
    el('b', null, round(w.list_price_per_case)),
    document.createTextNode(' per case of ' + w.case_size + '. Offers within 15% are usually accepted.')
  );
  showStep('offerStep1', 'offerStep2');
  openModal('offerOverlay');
}

function submitOffer() {
  const w = wineBySlug(currentWineSlug);
  if (!w) return;
  const amt = parseFloat($('#offerAmt').value);
  const qty = parseInt($('#offerQty').value, 10) || 1;

  if (!amt || amt <= 0) { toast('Please enter a valid offer price.', 'i-x-circle'); return; }
  if (amt > w.list_price_per_case) {
    toast('That is above the listed price, buy now instead.', 'i-x-circle'); return;
  }

  const winery = wineryName(w);
  $('#confirmWinery').textContent = winery;
  $('#confirmWine').textContent   = w.name + ' ' + w.vintage;
  $('#confirmPrice').textContent  = money(amt) + ' per case';
  $('#confirmQty').textContent    = qty + ' case' + (qty > 1 ? 's' : '');
  $('#confirmTotal').textContent  = money(amt * qty);
  $('#offerConfirmSub').textContent = winery + ' has received your offer.';

  const mine = userOffers();
  Store.set('offers', [{
    id: 'OF-' + (3000 + mine.length + 1),
    wine_slug: w.slug,
    quantity: qty,
    price_per_case: amt,
    counter_price_per_case: null,
    status: 'sent',
    placed_at: isoInDays(0),
    expires_at: isoInDays(7),
  }, ...mine]);

  showStep('offerStep2', 'offerStep1');
  setTimeout(() => simulateResponse(w, amt), 3000);
}

/* Prototype only. A real build routes this to the winery. */
function simulateResponse(w, amt) {
  const winery = wineryName(w);
  const threshold = w.list_price_per_case * 0.85;
  if (amt >= threshold) {
    toast(winery + ' accepted your offer of ' + round(amt) + ' per case.', 'i-check-circle');
  } else if (amt >= threshold * 0.9) {
    toast(winery + ' countered at ' + round(threshold) + ' per case. See Account, under offer.', 'i-exchange');
  } else {
    toast(winery + ' declined your offer. Try a higher price.', 'i-x-circle');
  }
}

/* ═══════════════════════════════════════════════════════════════
   COMPONENT: BUY MODAL
   Model A payment language: you pay at checkout, the funds are held
   by the payment provider, and the winery is paid when your wine is
   signed for. Go Wine Go never holds the money.
   ═══════════════════════════════════════════════════════════════ */
function openBuyModal(slug) {
  const w = wineBySlug(slug);
  if (!w) return;
  currentWineSlug = slug;
  // Payment wording and the WET note come from data/policy.json, never
  // from the markup, so every surface says exactly the same thing.
  const lines = $('#buyPaymentLines');
  if (lines && POLICY) lines.textContent = POLICY.payment.lines.join(' ') + ' ' + POLICY.wet_note;
  $('#buyWine').textContent  = w.name + ' ' + w.vintage;
  $('#buySeller').textContent = wineryName(w);
  $('#buyPrice').textContent = round(w.list_price_per_case) + ' per case';
  $('#buyTotal').textContent = money(w.list_price_per_case);
  $('#payBtnAmt').textContent = money(w.list_price_per_case);
  $('#buyConfirmWinery').textContent = wineryName(w);
  $('#cardNum').value = '';
  showStep('buyStep1', 'buyStep2');
  openModal('buyOverlay');
}

function processBuy() {
  const card = $('#cardNum').value.replace(/\s/g, '');
  if (card.length < 12) { toast('Please enter a valid card number.', 'i-x-circle'); return; }
  const btn = $('#payBtn');
  const label = btn.cloneNode(true);
  btn.textContent = 'Processing…';
  btn.disabled = true;
  setTimeout(() => {
    btn.replaceChildren(...label.childNodes);
    btn.disabled = false;
    const w = wineBySlug(currentWineSlug);
    if (w) {
      const mine = userOrders();
      Store.set('orders', [{
        id: 'ORD-' + (2000 + mine.length + 1),
        wine_slug: w.slug,
        quantity: 1,
        price_paid: w.list_price_per_case,
        payment_state: 'held',
        dispatch_state: 'awaiting_dispatch',
        pod_state: 'pending',
        carrier: null,
        tracking_reference: null,
        placed_at: isoInDays(0),
        delivered_at: null,
      }, ...mine]);
    }
    showStep('buyStep2', 'buyStep1');
    toast('Order placed. Track it in your account.', 'i-check-circle');
  }, 1400);
}

function formatCard(input) {
  const v = input.value.replace(/\D/g, '').slice(0, 16);
  input.value = v.replace(/(.{4})/g, '$1 ').trim();
}

/* ═══════════════════════════════════════════════════════════════
   WIRING for markup-declared handlers, so no page needs an inline
   onclick (the contrast audit fails the build on inline style=, and
   inline handlers are the same portability problem for WordPress).
   ═══════════════════════════════════════════════════════════════ */
(function wireDeclarative() {
  $$('[data-closes-modal]').forEach((b) => {
    b.addEventListener('click', () => closeModal(b.dataset.closesModal));
  });
  $$('.modal-overlay').forEach((o) => {
    o.addEventListener('click', (e) => overlayClose(e, o.id));
  });
  const submit = $('#submitOffer');
  if (submit) submit.addEventListener('click', submitOffer);
  const pay = $('#payBtn');
  if (pay) pay.addEventListener('click', processBuy);
  const card = $('#cardNum');
  if (card) card.addEventListener('input', () => formatCard(card));

  // Banned Drinker Register, spec 8: the notice appears as soon as the
  // delivery postcode falls inside a covered region, not after submit.
  const postcode = $('#deliveryPostcode');
  if (postcode) {
    postcode.addEventListener('input', () => renderBdr($('#buyBdr'), postcode.value));
  }
})();

export {
  openOfferModal,
  openBuyModal,
  openModal,
  closeModal,
};
