/* ═══════════════════════════════════════════════════════════════════
   GO WINE GO — PAGE — wine.js
   Wine detail, spec 4.2.

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
import { policyPanel, diagram } from '../ui/panels.js';
import { openOfferModal, openBuyModal } from '../modals.js';

/* ═══════════════════════════════════════════════════════════════
   SECTION: WINE DETAIL  (wine.html only, spec 4.2)
   Left column is identity, right column is the sticky action rail,
   then the winery strip — the Model A trust anchor, not optional —
   then delivery and payment.
   ═══════════════════════════════════════════════════════════════ */
(async function wineSection() {
  const root = $('#wineRoot');
  if (!root) return;

  if (!(await catalogue())) { dataError(root, 'this wine'); return; }

  const w = wineBySlug(slugParam(WINES[0].slug));
  if (!w) {
    root.replaceChildren(el('p', 'data-error',
      'That wine is not in the sample listings. Browse the market to pick one.'));
    return;
  }
  const winery = WINERIES[w.winery_slug];
  const deal = (await loadJSON('go-deals'))?.go_deals.find((d) => d.wine_slug === w.slug) || null;

  document.title = `${w.name} ${w.vintage}, ${winery.name} — Go Wine Go`;
  const crumb = $('#wineCrumb');
  if (crumb) crumb.textContent = `${w.name} ${w.vintage}`;

  /* ── left column, identity ─────────────────────────────────── */
  const producer = $('#wineProducer', root);
  producer.href = `/winery.html?slug=${encodeURIComponent(winery.slug)}`;
  producer.replaceChildren(icon('i-vine', true), el('span', null, winery.name));

  $('#wineTitle', root).textContent = `${w.name} ${w.vintage}`;
  const meta = $('#wineMeta', root);
  meta.replaceChildren(
    el('span', null, w.variety),
    el('span', null, w.gi),
    el('span', null, w.subregion));

  $('#wineTone', root).className = 'wine__tone wine-card__tone--t' + w.tone;
  $('#wineNote', root).textContent = w.tasting_note;

  const specs = $('#wineSpecs', root);
  specs.replaceChildren(...[
    ['Variety', w.variety],
    ['Vintage', String(w.vintage)],
    ['Geographical indication', w.gi],
    ['Subregion', w.subregion],
    ['Case size', `${w.case_size} bottles`],
    ['Alcohol', `${w.alcohol}% by volume`],
    ['Standard drinks per bottle', String(w.standard_drinks)],
    ['Allergens', w.allergens],
  ].map(([k, v]) => {
    const row = el('div', 'wine__spec');
    row.appendChild(el('dt', null, k));
    row.appendChild(el('dd', null, v));
    return row;
  }));

  /* ── right column, sticky actions ──────────────────────────── */
  const priceVal = el('span', 'wine__price-val', round(w.list_price_per_case));
  priceVal.appendChild(el('span', 'wine__price-unit', `${w.case_size} bottles`));
  const price = $('#winePrice', root);
  price.replaceChildren(el('span', 'label', 'Per case'), priceVal);
  $('#wineTax', root).textContent = wetNote();

  const stock = $('#wineStock', root);
  stock.replaceChildren(
    el('b', null, String(w.cases_available)),
    document.createTextNode(' cases available'));

  const actions = $('#wineActions', root);

  /* Territory. A direct link to an excluded wine must say so plainly — the
     page is not missing, it is undeliverable to the saved postcode. It must
     NOT name the winery as the one excluding, so the copy talks about the
     postcode, and the wine's identity above stays fully readable. */
  const pc = postcode();
  if (wineExcluded(w, pc)) {
    const blocked = el('div', 'wine__blocked');
    blocked.appendChild(icon('i-alert'));
    const body = el('div');
    body.appendChild(el('p', 'wine__blocked-title', 'Not available to ' + pc));
    body.appendChild(el('p', 'wine__blocked-text',
      'This wine cannot be delivered to postcode ' + pc + '. Change the delivery ' +
      'postcode on the market to see what is available to you.'));
    const back = el('a', 'btn btn--ghost', 'Back to the market');
    back.href = '/index.html#market';
    body.appendChild(back);
    blocked.appendChild(body);
    actions.replaceChildren(blocked);
    $('#wineStock', root).textContent = '';
  } else {
  const buy = el('button', 'btn btn--solid btn--block', 'Buy now');
  buy.addEventListener('click', () => openBuyModal(w.slug));
  const offer = el('button', 'btn btn--ghost btn--block', 'Make an offer');
  offer.addEventListener('click', () => openOfferModal(w.slug));
  const save = el('button', 'btn btn--quiet btn--block');
  const paintSave = () => {
    const on = isShortlisted(w.slug, shortlistSeed());
    save.classList.toggle('is-on', on);
    save.setAttribute('aria-pressed', on ? 'true' : 'false');
    save.replaceChildren(icon(on ? 'i-check' : 'i-plus', true),
      el('span', null, on ? 'On your shortlist' : 'Add to shortlist'));
  };
  save.addEventListener('click', () => {
    const added = toggleShortlist(w.slug, shortlistSeed());
    paintSave();
    toast(added ? 'Added to your shortlist.' : 'Removed from your shortlist.',
      added ? 'i-check-circle' : 'i-check');
  });
  await seedShortlist();
  paintSave();
  actions.replaceChildren(buy, offer, save);

  if (deal) {
    const reached = deal.tiers.filter((t) => t.cases <= deal.committed_cases).pop() || deal.tiers[0];
    const go = el('a', 'btn btn--brass btn--block',
      `Go Deal live, ${round(reached.price)} per case`);
    go.href = '/go-deals.html';
    actions.appendChild(go);
  }
  }

  // Seller identification on every wine, per spec 8.
  $('#wineSeller', root).replaceChildren(
    el('b', null, 'Sold by ' + winery.name),
    document.createTextNode('. ' + fillTemplate(POLICY.seller_line, winery)));

  /* ── winery strip, the Model A trust anchor ────────────────── */
  const strip = $('#wineryStrip');
  if (strip) {
    $('.winery-strip__figure', strip).replaceChildren(
      picture(winery.portrait_image, winery.portrait_alt, 1000, 1250, false, '(max-width: 760px) 100vw, 160px'));
    $('#stripName', strip).textContent = winery.name;
    $('#stripText', strip).textContent = winery.story[0];
    $('#stripLicence', strip).replaceChildren(
      icon('i-doc', true),
      document.createTextNode('Licensed producer '),
      el('b', null, winery.licence_number));
    const link = $('#stripLink', strip);
    link.href = `/winery.html?slug=${encodeURIComponent(winery.slug)}`;
    link.replaceChildren(
      el('span', null, `About ${winery.name}`), icon('i-arrow-right', true));
  }

  /* ── delivery and payment panels ───────────────────────────── */
  const panels = $('#winePanels');
  if (panels) {
    const delivery = { ...POLICY.delivery };
    delivery.lines = [`Dispatched within ${w.dispatch_days}.`, ...POLICY.delivery.lines];
    panels.replaceChildren(
      policyPanel(delivery, 'i-box'),
      policyPanel(POLICY.payment, 'i-shield'));
  }
})();
