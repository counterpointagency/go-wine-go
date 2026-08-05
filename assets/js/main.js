/* ═══════════════════════════════════════════════════════════════════
   GO WINE GO — SHARED BEHAVIOUR
   Vanilla, no framework, no build step, no CDN. One file serves
   index.html, account.html and supplier.html.

   Every block below is SECTION SCOPED: it returns immediately unless
   its own root element is on the page, so a page that lacks a section
   never runs that section's code and no block can depend on another.
   In WordPress each block moves next to the template part it drives.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

/* ── SHARED: small helpers ───────────────────────────────────────── */
const $  = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

const money = (n) => '$' + Number(n).toFixed(2);
const round = (n) => '$' + Math.round(Number(n));

/** Australian long date, from a plain YYYY-MM-DD with no timezone drift. */
function auDate(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** Build an element and set text via textContent, never innerHTML, so
    authored content can never become markup. */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

function icon(id, small) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'icon' + (small ? ' icon--sm' : ''));
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', '#' + id);
  svg.appendChild(use);
  return svg;
}

/** Fetch a JSON file from /data. Returns null on failure; every caller
    renders a stated error rather than an empty section. */
async function loadJSON(name) {
  try {
    const res = await fetch('data/' + name + '.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
    return await res.json();
  } catch (err) {
    console.error('Could not load data/' + name + '.json —', err.message);
    return null;
  }
}

function dataError(mount, what) {
  mount.replaceChildren(el('p', 'data-error',
    'Could not load ' + what + '. This page reads its content from /data over ' +
    'HTTP, so it needs to be served rather than opened from the file system.'));
}

/* Wines are needed by the market grid, the Go Deals strip and both
   modals, so they are loaded once and shared by slug and by id. */
let WINES = [];
let WINERIES = {};
const wineBySlug = (slug) => WINES.find((w) => w.slug === slug);

/* ═══════════════════════════════════════════════════════════════
   SECTION: SITE HEADER
   Transparent ONLY at scroll position zero, and only on a page that
   has a hero photograph behind it (body[data-hero]). Any scroll at
   all goes solid maroon.

   There is deliberately NO geometry trigger keyed to the hero's
   edges. That is exactly what let the bone plate slide under a still
   transparent header and put the maroon wordmark on the maroon
   headline. Do not reintroduce one.
   ═══════════════════════════════════════════════════════════════ */
(function siteHeader() {
  const header = $('#siteHeader');
  if (!header) return;

  const hasHero = document.body.hasAttribute('data-hero');
  const sync = () => header.classList.toggle(
    'site-header--transparent', hasHero && window.scrollY === 0);

  window.addEventListener('scroll', sync, { passive: true });
  window.addEventListener('resize', sync);
  sync();

  // The header and footer markup are byte identical across all three
  // pages so they map onto get_header() / get_footer(). That means the
  // current page cannot be marked up statically — it is resolved here.
  const page = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  $$('[data-page]', header).forEach((link) => {
    if (link.dataset.page === page) link.setAttribute('aria-current', 'page');
  });
  $$('[data-role-for]', header).forEach((link) => {
    if (link.dataset.roleFor.split(' ').includes(page)) {
      link.setAttribute('aria-current', 'true');
    }
  });
})();

/* ═══════════════════════════════════════════════════════════════
   COMPONENT: TOAST
   ═══════════════════════════════════════════════════════════════ */
let toastTimer = null;
function toast(msg, iconId) {
  const node = $('#toast');
  if (!node) return;
  node.replaceChildren(icon(iconId || 'i-check', true), el('span', null, msg));
  node.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('is-visible'), 4500);
}

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
    showStep('buyStep2', 'buyStep1');
    toast('Order placed. Track it in your account.', 'i-check-circle');
  }, 1400);
}

function formatCard(input) {
  const v = input.value.replace(/\D/g, '').slice(0, 16);
  input.value = v.replace(/(.{4})/g, '$1 ').trim();
}

function wineryName(w) {
  const winery = WINERIES[w.winery_slug];
  return winery ? winery.name : w.winery_slug;
}

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

function wineCard(w) {
  const card = el('article', 'wine-card');
  card.appendChild(el('div', 'wine-card__tone wine-card__tone--t' + w.tone));
  if (w.accolade) card.appendChild(el('p', 'wine-card__badge', w.accolade));

  const body = el('div', 'wine-card__body');
  body.appendChild(el('p', 'label wine-card__producer', wineryName(w)));
  body.appendChild(el('h3', 'wine-card__name', w.name));

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
  foot.appendChild(el('p', 'wine-card__tax', 'Includes GST and Wine Equalisation Tax'));

  const actions = el('div', 'wine-card__actions');
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

(async function marketSection() {
  const grid = $('#wineGrid');
  if (!grid) return;

  const [wineData, wineryData] = await Promise.all([loadJSON('wines'), loadJSON('wineries')]);
  if (!wineData || !wineryData) { dataError(grid, 'the sample listings'); return; }

  WINES = wineData.wines;
  wineryData.wineries.forEach((wy) => { WINERIES[wy.slug] = wy; });

  const featured = WINES.filter((w) => w.featured);
  const note = $('#marketNote');

  function render(filter) {
    const shown = featured.filter((w) =>
      filter === 'all' ||
      (filter === 'red' || filter === 'white' ? w.colour === filter : w.state === filter));

    if (!shown.length) {
      grid.replaceChildren(el('p', 'market__empty', 'No sample listings match that filter.'));
    } else {
      grid.replaceChildren(...shown.map(wineCard));
    }
    if (note) {
      note.textContent = shown.length + ' of ' + featured.length +
        ' sample listings · Margaret River · Make an offer or buy at the listed price';
    }
  }

  $$('.market__filter').forEach((chip) => {
    chip.addEventListener('click', () => {
      $$('.market__filter').forEach((c) => c.classList.remove('is-active'));
      chip.classList.add('is-active');
      render(chip.dataset.filter);
    });
  });

  render('all');
})();

/* ═══════════════════════════════════════════════════════════════
   SECTION: GO DEALS STRIP  (home page only)
   The winery sets a list price and a hidden floor. As more cases are
   committed the price falls for everyone, and when the deal closes
   everyone pays the final price.

   THE FLOOR IS NEVER SHOWN and is not in data/go-deals.json at all.
   Progress runs toward the next PUBLISHED tier, so the bar can never
   imply how far the price still has to fall.
   ═══════════════════════════════════════════════════════════════ */
function goDealCard(deal, w) {
  const reached = deal.tiers.filter((t) => t.cases <= deal.committed_cases).pop() || deal.tiers[0];
  const next    = deal.tiers.find((t) => t.cases > deal.committed_cases) || null;
  const span    = next ? next.cases - reached.cases : 0;
  const pct     = next ? Math.round(((deal.committed_cases - reached.cases) / span) * 100) : 100;

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
  const committed = el('span');
  committed.appendChild(el('b', null, String(deal.committed_cases)));
  committed.appendChild(document.createTextNode(' cases committed'));
  stats.appendChild(committed);
  stats.appendChild(el('span', null, pct + '% to the next price'));
  card.appendChild(stats);

  const nextLine = el('p', 'godeal__next');
  if (next) {
    nextLine.appendChild(document.createTextNode(
      (next.cases - deal.committed_cases) + ' more cases and the price drops to '));
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
  join.addEventListener('click', () => openBuyModal(w.slug));
  foot.appendChild(join);
  foot.appendChild(el('span', 'godeal__closes', 'Closes ' + auDate(deal.closes_at)));
  card.appendChild(foot);

  return card;
}

(async function goDealsSection() {
  const grid = $('#goDealGrid');
  if (!grid) return;

  const dealData = await loadJSON('go-deals');
  if (!dealData) { dataError(grid, 'the live Go Deals'); return; }

  // The market section owns the wine and winery fetch. Wait for it rather
  // than fetching twice; if this page has no market grid, load them here.
  if (!WINES.length) {
    const [wineData, wineryData] = await Promise.all([loadJSON('wines'), loadJSON('wineries')]);
    if (!wineData || !wineryData) { dataError(grid, 'the live Go Deals'); return; }
    WINES = wineData.wines;
    wineryData.wineries.forEach((wy) => { WINERIES[wy.slug] = wy; });
  }

  const cards = dealData.go_deals
    .map((deal) => { const w = wineBySlug(deal.wine_slug); return w ? goDealCard(deal, w) : null; })
    .filter(Boolean);

  grid.replaceChildren(...cards);
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
    tile.href = 'index.html#market';

    const picture = document.createElement('picture');
    const source = document.createElement('source');
    source.srcset = r.image + '.webp';
    source.type = 'image/webp';
    picture.appendChild(source);

    const img = document.createElement('img');
    img.src = r.image + '.jpg';
    img.alt = r.alt;                 // the scene, never the estate
    img.width = 900;
    img.height = 900;
    img.loading = 'lazy';
    img.decoding = 'async';
    picture.appendChild(img);
    tile.appendChild(picture);

    const body = el('div', 'region-tile__body');
    body.appendChild(el('p', 'region-tile__name', r.name));
    body.appendChild(el('p', 'region-tile__gi', r.gi));
    body.appendChild(el('p', 'region-tile__blurb', r.blurb));
    tile.appendChild(body);
    return tile;
  }));
})();

/* ═══════════════════════════════════════════════════════════════
   SECTION: FINDER  (search, home page only)
   ═══════════════════════════════════════════════════════════════ */
(function finderSection() {
  const form = $('#finderForm');
  if (!form) return;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = $('#finderSearch').value.trim();
    toast(q ? 'Search is not wired up in this prototype: "' + q + '"'
            : 'Enter a winery, wine or subregion to search.', 'i-search');
  });
})();

/* ═══════════════════════════════════════════════════════════════
   SECTION: CLOSING BAND  (home page only)
   The supply-side call to action points at For Wineries, which is a
   Round 3C page. Rather than ship a link that 404s on a URL the
   client already has, the button states plainly that it is not built
   yet. Replace this handler with href="for-wineries.html" in 3C.
   ═══════════════════════════════════════════════════════════════ */
(function closingSection() {
  const btn = $('#supplyInterest');
  if (!btn) return;
  btn.addEventListener('click', () => {
    toast('The For Wineries page and its register-interest form are built in Round 3C.', 'i-vine');
  });
})();

/* ═══════════════════════════════════════════════════════════════
   SECTION: ACCOUNT  (account.html only)
   ═══════════════════════════════════════════════════════════════ */
(async function accountSection() {
  const root = $('#accountRoot');
  if (!root) return;

  // The modals on this page need wine and winery data too.
  const [wineData, wineryData] = await Promise.all([loadJSON('wines'), loadJSON('wineries')]);
  if (wineData && wineryData) {
    WINES = wineData.wines;
    wineryData.wineries.forEach((wy) => { WINERIES[wy.slug] = wy; });
  }

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

  $$('[data-opens-offer]', root).forEach((btn) => {
    btn.addEventListener('click', () => openOfferModal(btn.dataset.opensOffer));
  });
  $$('[data-opens-buy]', root).forEach((btn) => {
    btn.addEventListener('click', () => openBuyModal(btn.dataset.opensBuy));
  });

  const accept = $('#acceptCounter', root);
  if (accept) {
    accept.addEventListener('click', () => {
      const row = $('#counterOffer', root);
      const actions = $('.account__row-actions', row);
      actions.replaceChildren(el('span', 'pill pill--ok', 'Accepted, proceed to payment'));
      const pay = el('button', 'btn btn--brass btn--sm', 'Pay now');
      pay.addEventListener('click', () => openBuyModal('cold-ridge-chardonnay-2023'));
      actions.appendChild(pay);
      toast('Counteroffer accepted at $210 per case. Proceed to payment.', 'i-check-circle');
    });
  }

  const archive = $('#archiveOffer', root);
  if (archive) {
    archive.addEventListener('click', () => {
      if (!confirm('Archive this offer?')) return;
      $('#counterOffer', root).remove();
      toast('Offer archived.', 'i-check');
    });
  }
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
    goDealCardEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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

  $$('[data-pod-order]', root).forEach((btn) => {
    btn.addEventListener('click', () => {
      podSale = Number(btn.dataset.podSale);
      $('#podOrderId', root).textContent = btn.dataset.podOrder;
      $('#podResult', root).hidden = true;
      $('#podUploadArea', root).hidden = false;
      podPanel.hidden = false;
      podPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
})();
