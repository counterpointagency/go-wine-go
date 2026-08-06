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
    const res = await fetch('/data/' + name + '.json', { cache: 'no-cache' });
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

/* ── THE CATALOGUE ────────────────────────────────────────────────
   Wines, wineries and the compliance/payment language are needed by
   almost every page and by both modals. They are fetched ONCE per
   page load and shared: catalogue() memoises the promise, so five
   section blocks awaiting it produce three requests, not fifteen. */
let WINES = [];
let WINERIES = {};
let POLICY = null;
const wineBySlug = (slug) => WINES.find((w) => w.slug === slug);
const winesOf = (winerySlug) => WINES.filter((w) => w.winery_slug === winerySlug);

/* supplierSection owns the proof-of-delivery panel, but supplierData
   renders the buttons that open it, so the wiring is shared. */
let wirePodButtons = null;

let cataloguePromise = null;
function catalogue() {
  if (!cataloguePromise) {
    cataloguePromise = (async () => {
      const [wineData, wineryData, policyData] = await Promise.all([
        loadJSON('wines'), loadJSON('wineries'), loadJSON('policy'),
      ]);
      if (!wineData || !wineryData || !policyData) return false;
      WINES = wineData.wines;
      wineryData.wineries.forEach((wy) => { WINERIES[wy.slug] = wy; });
      POLICY = policyData;
      return true;
    })();
  }
  return cataloguePromise;
}

function wineryName(w) {
  const winery = WINERIES[w.winery_slug];
  return winery ? winery.name : w.winery_slug;
}

/** policy.json templates take {winery} and {licence}. Filling them here
    means the compliance sentence has exactly one source of truth and
    cannot drift between the wine page, the winery page and the modal. */
function fillTemplate(tpl, winery) {
  return String(tpl)
    .replace('{winery}', winery ? winery.name : '')
    .replace('{licence}', winery ? winery.licence_number : '');
}

/** The ?slug= a detail page was opened with, or a stated default. */
function slugParam(fallback) {
  const v = new URLSearchParams(location.search).get('slug');
  return v && v.trim() ? v.trim() : fallback;
}

/** <picture> with a webp source over a jpg fallback, from an
    extensionless base path. Every image on the site goes through this. */
function picture(base, alt, w, h, eager) {
  const pic = document.createElement('picture');
  const source = document.createElement('source');
  source.srcset = base + '.webp';
  source.type = 'image/webp';
  pic.appendChild(source);
  const img = document.createElement('img');
  img.src = base + '.jpg';
  img.alt = alt;                       // the scene, never the estate
  img.width = w;
  img.height = h;
  img.loading = eager ? 'eager' : 'lazy';
  img.decoding = 'async';
  if (eager) img.setAttribute('fetchpriority', 'high');
  pic.appendChild(img);
  return pic;
}

/** Rendered wherever a price appears, per spec 8. */
const wetNote = () => POLICY ? POLICY.wet_note : '';


/* ═══════════════════════════════════════════════════════════════
   SHARED: STORE
   Everything a demo does has to survive a refresh, or a meeting turns
   into a re-enactment. All state lives under one namespace with the
   schema version in the key, so bumping STORE_VERSION orphans the old
   keys instead of trying to read a shape that has changed.

   Base content still comes from data/*.json. This holds only what the
   USER changed on top of it — offers made, orders placed, cases
   committed, tenders posted, wines shortlisted, the delivery postcode
   and the age check. Layering deltas rather than seeding a copy means
   editing the JSON still shows up.

   RESET, for clearing a demo between meetings:
     · open any page with ?reset=1
     · or run GoWineGo.reset() in the console
   Both wipe every gwg.* key and reload.
   ═══════════════════════════════════════════════════════════════ */
const STORE_NS = 'gwg';
const STORE_VERSION = 1;
const storeKey = (name) => `${STORE_NS}.v${STORE_VERSION}.${name}`;

const Store = {
  available() {
    try { localStorage.setItem('__t', '1'); localStorage.removeItem('__t'); return true; }
    catch (e) { return false; }
  },
  get(name, fallback) {
    try {
      const raw = localStorage.getItem(storeKey(name));
      return raw === null ? fallback : JSON.parse(raw);
    } catch (e) { return fallback; }
  },
  set(name, value) {
    try { localStorage.setItem(storeKey(name), JSON.stringify(value)); return true; }
    catch (e) { return false; }        // private mode, or quota
  },
  /** Wipe every key this app owns, at any schema version. */
  reset() {
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith(STORE_NS + '.'))
        .forEach((k) => localStorage.removeItem(k));
    } catch (e) { /* nothing to clear */ }
  },
  /** What is currently held, for eyeballing a demo's state. */
  dump() {
    const out = {};
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith(STORE_NS + '.'))
        .forEach((k) => { out[k] = JSON.parse(localStorage.getItem(k)); });
    } catch (e) { /* ignore */ }
    return out;
  },
};

/* A schema bump orphans old keys rather than reading a changed shape. */
(function migrateStore() {
  try {
    const seen = localStorage.getItem(STORE_NS + '.schema');
    if (seen !== String(STORE_VERSION)) {
      Store.reset();
      localStorage.setItem(STORE_NS + '.schema', String(STORE_VERSION));
    }
  } catch (e) { /* storage unavailable; the app still runs, just forgets */ }
})();

/* ?reset=1 on any page clears the demo and reloads to the same page. */
(function resetFromUrl() {
  const params = new URLSearchParams(location.search);
  if (!params.has('reset')) return;
  Store.reset();
  try { localStorage.setItem(STORE_NS + '.schema', String(STORE_VERSION)); } catch (e) { /* ignore */ }
  params.delete('reset');
  location.replace(location.pathname + (params.toString() ? '?' + params : ''));
})();

window.GoWineGo = {
  reset() { Store.reset(); location.reload(); },
  dump: () => Store.dump(),
  version: STORE_VERSION,
};

/* ── the user's layer over the base data ─────────────────────────── */
const userOffers   = () => Store.get('offers', []);
const userOrders   = () => Store.get('orders', []);
const userTenders  = () => Store.get('tenders', []);
const offerStates  = () => Store.get('offerStates', {});   // id -> status override
const goDealCommits = () => Store.get('goDealCommits', {}); // wine_slug -> extra cases

/* The shortlist starts from data/account.json and is then owned by the
   store. Seeded lazily, because only some pages render a shortlist. */
let SHORTLIST_SEED = [];
let shortlistSeeded = null;
function seedShortlist() {
  if (!shortlistSeeded) {
    shortlistSeeded = (async () => {
      const acct = await loadJSON('account');
      SHORTLIST_SEED = acct ? acct.customer.shortlist : [];
      return true;
    })();
  }
  return shortlistSeeded;
}

function shortlist() {
  const stored = Store.get('shortlist', null);
  return stored === null ? null : stored;                  // null = not yet touched
}
function setShortlist(list) { Store.set('shortlist', list); }

function isShortlisted(slug, seed) {
  const s = shortlist();
  return (s === null ? (seed || []) : s).includes(slug);
}
function toggleShortlist(slug, seed) {
  const current = shortlist() === null ? (seed || []).slice() : shortlist().slice();
  const i = current.indexOf(slug);
  if (i === -1) current.push(slug); else current.splice(i, 1);
  setShortlist(current);
  return i === -1;
}

/** An ISO date N days from today, for defaults on a posted tender. */
function isoInDays(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Today at midnight, so an expiry on today's date has not passed yet. */
function today() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
function isPast(iso) {
  if (!iso) return false;
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(y, m - 1, d) < today();
}

/* ═══════════════════════════════════════════════════════════════
   SHARED: DIALOG BEHAVIOUR
   One focus trap, used by the mobile menu and the age gate. Both are
   modal, so both need the same three things and neither should
   reimplement them:
     · focus moves into the dialog on open and back to the opener on close
     · Tab and Shift+Tab cycle inside it and cannot escape
     · the rest of the document is marked inert, so a screen reader
       cannot wander out of a dialog it is supposed to be held in
   ═══════════════════════════════════════════════════════════════ */
const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',');

function focusableIn(root) {
  return $$(FOCUSABLE, root).filter((n) => n.offsetParent !== null || n === document.activeElement);
}

/** Mark everything outside the dialog inert, so assistive technology
    cannot reach the page behind it. Returns an undo function. */
function isolate(dialogRoot) {
  const siblings = $$('body > *').filter((n) => n !== dialogRoot && n.tagName !== 'SCRIPT');
  siblings.forEach((n) => { n.inert = true; n.setAttribute('aria-hidden', 'true'); });
  return () => siblings.forEach((n) => { n.inert = false; n.removeAttribute('aria-hidden'); });
}

function trapFocus(dialogRoot, onEscape) {
  const onKey = (e) => {
    if (e.key === 'Escape' && onEscape) { e.preventDefault(); onEscape(); return; }
    if (e.key !== 'Tab') return;
    const items = focusableIn(dialogRoot);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  document.addEventListener('keydown', onKey, true);
  return () => document.removeEventListener('keydown', onKey, true);
}

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
  const page = (location.pathname.split('/').pop() || '/index.html').toLowerCase();
  // data-page can list several pages, so a detail page marks its parent
  // section: wine.html and winery.html both light up Market.
  $$('[data-page]', header).forEach((link) => {
    if (link.dataset.page.split(' ').includes(page)) {
      link.setAttribute('aria-current', 'page');
    }
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
    const on = isShortlisted(slug, SHORTLIST_SEED);
    btn.classList.toggle('is-on', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.setAttribute('aria-label', on ? 'Remove from shortlist' : 'Add to shortlist');
    btn.replaceChildren(icon(on ? 'i-check' : 'i-plus', true));
  };
  btn.addEventListener('click', () => {
    const added = toggleShortlist(slug, SHORTLIST_SEED);
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
   SHARED: SEARCH
   One control, three surfaces: the header bar above 760, the mobile
   drawer below it, and the market view where results land. Searching
   from anywhere navigates to the market with ?q=, so the result is a
   real URL that can be shared, bookmarked and reloaded.

   Matches across wines and wineries on winery name, wine name,
   variety and subregion.
   ═══════════════════════════════════════════════════════════════ */
const searchQuery = () => (new URLSearchParams(location.search).get('q') || '').trim();

function goSearch(q) {
  const term = String(q || '').trim();
  location.href = '/index.html' + (term ? '?q=' + encodeURIComponent(term) : '') + '#market';
}

/** Does this wine match the term, on any of the four declared fields? */
function wineMatches(w, term) {
  const winery = WINERIES[w.winery_slug];
  const haystack = [
    winery ? winery.name : '',
    winery ? winery.subregion : '',
    w.name, w.variety, w.subregion, String(w.vintage),
  ].join(' ').toLowerCase();
  return term.split(/\s+/).filter(Boolean).every((t) => haystack.includes(t));
}

(function headerSearch() {
  const btn = $('#searchBtn');
  const panel = $('#searchPanel');
  const input = $('#headerSearch');
  const close = $('#searchClose');
  if (!btn || !panel || !input) return;

  const collapse = () => {
    panel.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    btn.focus();
  };
  btn.addEventListener('click', () => {
    panel.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    input.value = searchQuery();
    input.focus();
    input.select();
  });
  if (close) close.addEventListener('click', collapse);
  panel.addEventListener('submit', (e) => { e.preventDefault(); goSearch(input.value); });
  panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); collapse(); } });
  // Collapse on blur, but only once focus has genuinely left the panel.
  panel.addEventListener('focusout', () => {
    setTimeout(() => {
      if (!panel.hidden && !panel.contains(document.activeElement)) {
        panel.hidden = true;
        btn.setAttribute('aria-expanded', 'false');
      }
    }, 0);
  });
})();

(function drawerSearch() {
  const form = $('#menuSearchForm');
  if (!form) return;
  form.addEventListener('submit', (e) => { e.preventDefault(); goSearch($('#menuSearch').value); });
})();

/* ═══════════════════════════════════════════════════════════════
   SHARED: TERRITORY
   For Wineries promises that a winery can exclude postcodes and that
   a customer inside one never sees the listing. This is where that
   promise is kept: excluded wines are removed from the market, not
   greyed out, and the count says how many without naming anyone.
   Exclusions are ranges in data/wineries.json.
   ═══════════════════════════════════════════════════════════════ */
const postcode = () => Store.get('postcode', '');
const setPostcode = (pc) => Store.set('postcode', String(pc || '').trim());

function excludesPostcode(winery, pc) {
  const n = parseInt(String(pc).trim(), 10);
  if (!n || !winery || !winery.territory_exclusions) return false;
  return winery.territory_exclusions.some((range) => {
    const [lo, hi] = String(range).split('-').map(Number);
    return n >= lo && n <= (hi === undefined ? lo : hi);
  });
}

/** True when this wine cannot be delivered to the saved postcode. */
function wineExcluded(w, pc) {
  return excludesPostcode(WINERIES[w.winery_slug], pc || postcode());
}

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

/* ═══════════════════════════════════════════════════════════════
   SHARED: INFO PANEL BUILDER
   The delivery panel and the payment panel are the same box built
   from data/policy.json, so the compliance wording has exactly one
   source and cannot drift between wine.html and how-it-works.html.
   ═══════════════════════════════════════════════════════════════ */
function policyPanel(block, iconId, extraNote) {
  const panel = el('section', 'panel');
  const head = el('div', 'panel__head');
  head.appendChild(icon(iconId));
  head.appendChild(el('h2', 'panel__title', block.heading));
  panel.appendChild(head);

  const list = el('ul', 'panel__list');
  block.lines.forEach((line) => {
    const li = el('li', 'panel__item');
    li.appendChild(icon('i-check', true));
    li.appendChild(el('span', null, line));
    list.appendChild(li);
  });
  panel.appendChild(list);

  const note = extraNote || block.detail;
  if (note) panel.appendChild(el('p', 'panel__note', note));
  return panel;
}

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
    const on = isShortlisted(w.slug, SHORTLIST_SEED);
    save.classList.toggle('is-on', on);
    save.setAttribute('aria-pressed', on ? 'true' : 'false');
    save.replaceChildren(icon(on ? 'i-check' : 'i-plus', true),
      el('span', null, on ? 'On your shortlist' : 'Add to shortlist'));
  };
  save.addEventListener('click', () => {
    const added = toggleShortlist(w.slug, SHORTLIST_SEED);
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
      picture(winery.portrait_image, winery.portrait_alt, 1000, 1250, false));
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

/* ═══════════════════════════════════════════════════════════════
   SECTION: WINERY PROFILE  (winery.html only, spec 4.3)
   The page that makes Model A legible. Untinted hero with the name
   on a bone plate, story, credentials, that winery's listings, and
   the compliance line rendered verbatim from data/policy.json.
   ═══════════════════════════════════════════════════════════════ */
(async function winerySection() {
  const root = $('#wineryRoot');
  if (!root) return;

  if (!(await catalogue())) { dataError(root, 'this winery'); return; }

  const slug = slugParam(Object.keys(WINERIES)[0]);
  const winery = WINERIES[slug];
  if (!winery) {
    root.replaceChildren(el('p', 'data-error',
      'That winery is not in the sample listings.'));
    return;
  }

  document.title = `${winery.name}, ${winery.subregion} — Go Wine Go`;
  const crumb = $('#wineryCrumb');
  if (crumb) crumb.textContent = winery.name;

  /* ── hero: untinted photograph, copy on a bone plate ───────── */
  $('#wineryHeroMedia').replaceChildren(
    picture(winery.hero_image, winery.hero_alt, 1400, 700, true));
  $('#wineryTitle').textContent = winery.name;
  $('#winerySub').textContent = `${winery.subregion}, ${winery.gi}`;

  /* ── story ─────────────────────────────────────────────────── */
  $('#wineryPortrait').replaceChildren(
    picture(winery.portrait_image, winery.portrait_alt, 1000, 1250, false));
  $('#wineryCaption').textContent = winery.portrait_alt;
  $('#wineryStory').replaceChildren(
    ...winery.story.map((p) => el('p', 'winery-story__body', p)));

  /* ── credentials ───────────────────────────────────────────── */
  const listings = winesOf(winery.slug);
  const casesAvailable = listings.reduce((n, w) => n + w.cases_available, 0);
  $('#wineryCreds').replaceChildren(...[
    ['Producer licence', winery.licence_number],
    ['Subregion', `${winery.subregion}, ${winery.gi}`],
    ['Established', String(winery.established)],
    ['Cases available', String(casesAvailable)],
  ].map(([lbl, val]) => {
    const item = el('div', 'credentials__item');
    item.appendChild(el('p', 'credentials__val', val));
    item.appendChild(el('p', 'credentials__lbl', lbl));
    return item;
  }));

  /* ── that winery's listings ────────────────────────────────── */
  $('#wineryWinesTitle').textContent = `Wines from ${winery.name}`;
  $('#wineryWines').replaceChildren(...(listings.length
    ? listings.map(wineCard)
    : [el('p', 'market__empty', 'No listings from this winery right now.')]));

  /* ── compliance line, verbatim from policy.json ────────────── */
  $('#wineryCompliance').replaceChildren(
    icon('i-shield'),
    el('span', null, fillTemplate(POLICY.compliance_line, winery)));
})();

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

/* ═══════════════════════════════════════════════════════════════
   SECTION: TENDERS  (tenders.html only, spec 4.5)
   You post what you want, wineries submit, you pick one or none.
   Never an auction; a submission is never a bid.
   ═══════════════════════════════════════════════════════════════ */
(async function tendersPage() {
  const list = $('#tenderList');
  if (!list) return;

  const [data, content] = await Promise.all([loadJSON('tenders'), loadJSON('how-it-works')]);
  if (!data) { dataError(list, 'the open tenders'); return; }

  // The three-step explainer is the Tender entry from how-it-works.json,
  // so the mechanic is described in one place and read in two.
  const steps = $('#tenderSteps');
  const mechanic = content && content.mechanics.items.find((m) => m.name === 'Tender');
  if (steps && mechanic) {
    steps.replaceChildren(...mechanic.lines.map((line, i) => {
      const step = el('div', 'tenders__step');
      step.appendChild(el('p', 'tenders__step-num', String(i + 1).padStart(2, '0')));
      step.appendChild(el('p', 'tenders__step-name', ['You post it', 'They submit', 'You choose'][i]));
      step.appendChild(el('p', 'tenders__step-text', line));
      return step;
    }));
  }

  // Base tenders plus any this visitor has posted, newest first.
  const paint = () => {
    const all = [...userTenders(), ...data.tenders];
    list.replaceChildren(...(all.length
      ? all.map((t) => tenderCard(t, userTenders().some((u) => u.id === t.id)))
      : [el('p', 'market__empty', 'No tenders are open right now.')]));
    const count = $('#tenderCount');
    if (count) count.textContent = String(all.length);
  };
  paint();

  const form = $('#tenderForm');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const variety = $('#tVariety').value;
      const region = $('#tRegion').value;
      const from = parseInt($('#tFrom').value, 10);
      const to = parseInt($('#tTo').value, 10);
      const qty = parseInt($('#tQuantity').value, 10);
      const max = parseInt($('#tMaxPrice').value, 10);
      const closes = $('#tCloses').value;
      if (!qty || !max) {
        toast('Enter how many cases you want and your maximum price per case.', 'i-x-circle');
        return;
      }
      if (from && to && to < from) {
        toast('The vintage range runs backwards. Check the years.', 'i-x-circle');
        return;
      }
      const mine = userTenders();
      const tender = {
        id: 'T-' + (2000 + mine.length + 1),
        variety,
        gi: region.startsWith('Any') ? 'Margaret River' : region,
        vintage_from: from || 2019,
        vintage_to: to || 2024,
        quantity_cases: qty,
        max_price_per_case: max,
        closes_at: closes || isoInDays(21),
        submission_count: 0,
        posted_by_me: true,
      };
      Store.set('tenders', [tender, ...mine]);
      paint();
      toast(`Tender ${tender.id} posted. It is in your account, and wineries ` +
            'can submit against it.', 'i-check-circle');
      form.reset();
    });
  }
})();

/* ═══════════════════════════════════════════════════════════════
   SECTION: HOW IT WORKS  (how-it-works.html only, spec 4.6)
   Who am I buying from and who has my money are answered FIRST,
   before the mechanics. Thin-line diagrams, never photography.
   ═══════════════════════════════════════════════════════════════ */
function diagram(id) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'diagram');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', '#' + id);
  svg.appendChild(use);
  return svg;
}

(async function howItWorksPage() {
  const root = $('#hiwRoot');
  if (!root) return;

  const [content, ok] = await Promise.all([loadJSON('how-it-works'), catalogue()]);
  if (!content || !ok) { dataError(root, 'this page'); return; }

  /* ── the two Model A answers, before anything else ─────────── */
  $('#hiwAnswersEyebrow').textContent = content.answers_first.eyebrow;
  $('#hiwAnswers').replaceChildren(...content.answers_first.items.map((it) => {
    const box = el('div', 'hiw-answers__item');
    box.appendChild(diagram(it.diagram));
    box.appendChild(el('h2', 'hiw-answers__q', it.question));
    box.appendChild(el('p', 'hiw-answers__a', it.answer));
    return box;
  }));

  /* ── the four mechanics ────────────────────────────────────── */
  $('#hiwMechEyebrow').textContent = content.mechanics.eyebrow;
  $('#hiwMechTitle').textContent = content.mechanics.title;
  $('#hiwMechanics').replaceChildren(...content.mechanics.items.map((m) => {
    const item = el('div', 'hiw__item');
    item.appendChild(diagram(m.diagram));
    item.appendChild(el('h3', 'hiw__name', m.name));
    const lines = el('ul', 'hiw__lines');
    m.lines.forEach((l) => lines.appendChild(el('li', 'hiw__line', l)));
    item.appendChild(lines);
    return item;
  }));

  /* ── payment and delivery, from the same policy source ─────── */
  $('#hiwPanels').replaceChildren(
    policyPanel(POLICY.payment, 'i-shield'),
    policyPanel(POLICY.delivery, 'i-box', wetNote()));

  /* ── FAQ ───────────────────────────────────────────────────── */
  $('#hiwFaqEyebrow').textContent = content.faq.eyebrow;
  $('#hiwFaqTitle').textContent = content.faq.title;
  $('#hiwFaq').replaceChildren(...content.faq.items.map((f, i) => {
    const item = el('div', 'faq__item' + (i === 0 ? ' is-open' : ''));
    const btn = el('button', 'faq__q');
    btn.type = 'button';
    btn.setAttribute('aria-expanded', i === 0 ? 'true' : 'false');
    btn.appendChild(el('span', null, f.q));
    btn.appendChild(icon('i-plus'));
    const answer = el('p', 'faq__a', f.a);
    btn.addEventListener('click', () => {
      const open = item.classList.toggle('is-open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    item.appendChild(btn);
    item.appendChild(answer);
    return item;
  }));
})();


/* ═══════════════════════════════════════════════════════════════
   COMPONENT: MOBILE MENU
   Below 760 the header nav and the account link are hidden, so this
   is the only route through the site on a phone. Every destination
   is in it, including the legal pages.
   ═══════════════════════════════════════════════════════════════ */
(function mobileMenu() {
  const menu = $('#mobileMenu');
  const btn = $('#menuBtn');
  const close = $('#menuClose');
  if (!menu || !btn || !close) return;

  let release = null;
  let restore = null;

  function open() {
    menu.classList.add('is-open');
    btn.setAttribute('aria-expanded', 'true');
    document.body.style.setProperty('overflow', 'hidden');
    restore = isolate(menu);
    release = trapFocus(menu, shut);
    close.focus();
  }

  function shut() {
    menu.classList.remove('is-open');
    btn.setAttribute('aria-expanded', 'false');
    document.body.style.removeProperty('overflow');
    if (release) { release(); release = null; }
    if (restore) { restore(); restore = null; }
    btn.focus();                       // focus returns to what opened it
  }

  btn.addEventListener('click', open);
  close.addEventListener('click', shut);
  $$('[data-closes-menu]', menu).forEach((n) => n.addEventListener('click', shut));
  // Following a link inside the drawer navigates away; drop the isolation
  // first so a bfcache restore never comes back to an inert document.
  $$('.mobile-menu__link', menu).forEach((a) => a.addEventListener('click', () => {
    if (release) release();
    if (restore) restore();
  }));
})();

/* ═══════════════════════════════════════════════════════════════
   COMPONENT: AGE GATE  (spec 8)
   Date of birth entry, not a yes/no button, held for the session.
   The <head> script has already added .age-gate-open to <html> if
   this session has not been verified, so the gate is covering the
   page before this code runs.
   ═══════════════════════════════════════════════════════════════ */
/* NOTE, and it needs a decision before launch. Spec 8 says the age check is
   "persisted for the session". Round 4A moved it to localStorage so a demo
   survives a browser restart, which is the opposite trade-off. The <head>
   script reads the same key. Flagged in CLAUDE.md; confirm with the liquor
   licensing lawyer which one ships. */
const AGE_KEY = 'gwg.v1.ageVerified';

/** Whole years between a date of birth and today. */
function yearsSince(y, m, d) {
  const today = new Date();
  let age = today.getFullYear() - y;
  const hadBirthday =
    today.getMonth() + 1 > m || (today.getMonth() + 1 === m && today.getDate() >= d);
  if (!hadBirthday) age -= 1;
  return age;
}

(async function ageGate() {
  const gate = $('#ageGate');
  if (!gate) return;

  const html = document.documentElement;
  const isOpen = () => html.classList.contains('age-gate-open');

  // Already verified this session: the head script left the gate shut.
  if (!isOpen()) { gate.remove(); return; }

  const copy = (await loadJSON('policy'))?.age_gate;
  const legal = POLICY ? POLICY.responsible_service : null;

  // Fill the wording from policy.json. If it cannot be fetched the gate
  // still blocks — the markup carries the question and the button.
  if (copy) {
    $('#ageGateEyebrow').textContent = copy.eyebrow;
    $('#ageGateTitle').textContent = copy.title;
    $('#ageGateNote').textContent = copy.note;
    $('#ageGateLegend').textContent = copy.legend;
    $('#ageGateSubmit').replaceChildren(
      document.createTextNode(copy.submit + ' '), icon('i-arrow-right', true));
  }
  const legalLine = legal || (await loadJSON('policy'))?.responsible_service;
  if (legalLine) $('#ageGateLegal').textContent = legalLine;

  const form = $('#ageGateForm');
  const err = $('#ageGateError');
  const restore = isolate(gate);
  const release = trapFocus(gate, null);   // no Escape: the gate cannot be dismissed
  $('#ageDay').focus();

  const fail = (msg) => { err.textContent = msg; err.classList.add('is-shown'); };

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const d = parseInt($('#ageDay').value, 10);
    const m = parseInt($('#ageMonth').value, 10);
    const y = parseInt($('#ageYear').value, 10);
    const c = copy || {};

    if (!d || !m || !y || String($('#ageYear').value).trim().length !== 4) {
      fail(c.error_incomplete || 'Enter your full date of birth, including the year.');
      return;
    }
    // Reject a date that does not exist, rather than letting Date roll it over.
    const probe = new Date(y, m - 1, d);
    if (probe.getFullYear() !== y || probe.getMonth() !== m - 1 || probe.getDate() !== d) {
      fail(c.error_invalid || 'That date does not exist.');
      return;
    }
    if (probe > new Date()) { fail(c.error_future || 'That date is in the future.'); return; }

    if (yearsSince(y, m, d) < 18) {
      fail(c.error_underage || 'You must be 18 or over to enter.');
      $('#ageGateSubmit').disabled = true;
      return;
    }

    Store.set('ageVerified', true);
    release();
    restore();
    html.classList.remove('age-gate-open');
    gate.remove();
  });
})();

/* ═══════════════════════════════════════════════════════════════
   COMPONENT: BANNED DRINKER REGISTER NOTICE  (spec 8)
   Shown wherever a delivery postcode falls inside a BDR region. The
   ranges live in data/policy.json and are flagged there as
   indicative until confirmed against the current determination.
   ═══════════════════════════════════════════════════════════════ */
function bdrRegionFor(postcode) {
  if (!POLICY || !POLICY.banned_drinker_register) return null;
  const pc = parseInt(String(postcode).trim(), 10);
  if (!pc) return null;
  for (const region of POLICY.banned_drinker_register.regions) {
    for (const range of region.postcodes) {
      const [lo, hi] = range.split('-').map(Number);
      if (pc >= lo && pc <= (hi === undefined ? lo : hi)) return region.name;
    }
  }
  return null;
}

/** Fill a .bdr element for a postcode, or hide it. */
function renderBdr(node, postcode) {
  if (!node) return;
  const region = bdrRegionFor(postcode);
  if (!region) { node.classList.remove('is-shown'); node.replaceChildren(); return; }
  const body = el('span');
  body.appendChild(el('b', null, POLICY.banned_drinker_register.heading + '. '));
  body.appendChild(document.createTextNode(POLICY.banned_drinker_register.notice));
  body.appendChild(el('span', 'bdr__region', region + ' region, postcode ' + postcode + '.'));
  node.replaceChildren(icon('i-alert'), body);
  node.classList.add('is-shown');
}

/* ═══════════════════════════════════════════════════════════════
   SECTION: FOR WINERIES  (for-wineries.html only, spec 4.7)
   The commercially important page. Territory protection is the
   objection every winery raises first, so it gets its own section
   and a thin-line diagram.
   ═══════════════════════════════════════════════════════════════ */
(async function forWineriesPage() {
  const root = $('#fwRoot');
  if (!root) return;

  const [c, ok] = await Promise.all([loadJSON('for-wineries'), catalogue()]);
  if (!c || !ok) { dataError(root, 'this page'); return; }

  /* ── hero ─────────────────────────────────────────────────── */
  $('#fwEyebrow').textContent = c.hero.eyebrow;
  $('#fwTitle').textContent = c.hero.title;
  $('#fwLead').textContent = c.hero.lead;

  /* ── the maths, illustrative and labelled as such ─────────── */
  $('#fwMathsEyebrow').textContent = c.maths.eyebrow;
  $('#fwMathsTitle').textContent = c.maths.title;
  $('#fwMathsNote').replaceChildren(icon('i-alert', true), el('span', null, c.maths.note));

  const head = $('#fwMathsHead');
  head.replaceChildren(el('th', null, ''),
    ...c.maths.columns.map((h) => { const th = el('th', null, h); th.scope = 'col'; return th; }));
  $('#fwMathsBody').replaceChildren(...c.maths.rows.map((r) => {
    const tr = el('tr', r.is_total ? 'is-total' : null);
    const th = el('th', null, r.label); th.scope = 'row';
    tr.appendChild(th);
    tr.appendChild(el('td', null, r.trade));
    tr.appendChild(el('td', null, r.direct));
    return tr;
  }));
  $('#fwMathsFoot').textContent = c.maths.footnote;

  /* ── territory protection, the objection killer ───────────── */
  $('#fwTerrEyebrow').textContent = c.territory.eyebrow;
  $('#fwTerrTitle').textContent = c.territory.title;
  $('#fwTerrDiagram').replaceChildren(diagram(c.territory.diagram));
  $('#fwTerrCaption').textContent =
    'Your wine reaches everywhere on the map except the postcodes you exclude.';
  $('#fwTerrLead').textContent = c.territory.lead;
  $('#fwTerrPoints').replaceChildren(...c.territory.points.map((p) => {
    const li = el('li', 'fw-territory__point');
    li.appendChild(icon('i-check', true));
    li.appendChild(el('span', null, p));
    return li;
  }));
  $('#fwTerrExample').textContent = c.territory.example;

  /* ── how you get paid ─────────────────────────────────────── */
  $('#fwPaidEyebrow').textContent = c.paid.eyebrow;
  $('#fwPaidTitle').textContent = c.paid.title;
  $('#fwPaid').replaceChildren(...c.paid.items.map((it) => {
    const box = el('div', 'fw-paid__item');
    box.appendChild(icon(it.icon));
    box.appendChild(el('h3', 'fw-paid__name', it.name));
    box.appendChild(el('p', 'fw-paid__text', it.text));
    return box;
  }));

  /* ── what it costs ────────────────────────────────────────── */
  $('#fwCostEyebrow').textContent = c.cost.eyebrow;
  $('#fwCostTitle').textContent = c.cost.title;
  $('#fwCost').replaceChildren(...c.cost.items.map((it) => {
    const box = el('div', 'fw-cost__item');
    box.appendChild(el('p', 'fw-cost__val', it.value));
    box.appendChild(el('p', 'fw-cost__lbl', it.label));
    return box;
  }));
  $('#fwCostNote').textContent = c.cost.note;

  /* ── already on Winescape ─────────────────────────────────── */
  $('#fwWsEyebrow').textContent = c.winescape.eyebrow;
  $('#fwWsTitle').textContent = c.winescape.title;
  $('#fwWsText').textContent = c.winescape.text;
  $('#fwWsSteps').replaceChildren(
    ...c.winescape.steps.map((s) => el('li', 'fw-winescape__step', s)));

  /* ── requirements ─────────────────────────────────────────── */
  $('#fwReqEyebrow').textContent = c.requirements.eyebrow;
  $('#fwReqTitle').textContent = c.requirements.title;
  $('#fwReq').replaceChildren(...c.requirements.items.map((r) => {
    const li = el('li', 'fw-req__item');
    li.appendChild(icon('i-check', true));
    li.appendChild(el('span', null, r));
    return li;
  }));

  /* ── register interest ────────────────────────────────────── */
  $('#fwRegEyebrow').textContent = c.register.eyebrow;
  $('#fwRegTitle').textContent = c.register.title;
  $('#fwRegNote').textContent = c.register.note;

  const form = $('#fwRegisterForm');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('#fwWinery').value.trim();
    const email = $('#fwEmail').value.trim();
    const licence = $('#fwLicence').value.trim();
    if (!name || !email || !licence) {
      toast('Enter your winery name, an email address and your producer licence number.', 'i-x-circle');
      return;
    }
    toast(c.register.success, 'i-check-circle');
    form.reset();
  });
})();

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
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
   SECTION: LEGAL  (legal/*.html)
   Four documents, one template, all four rendered from
   data/legal.json. They are STRUCTURAL DRAFTS: each section says
   what a published document has to cover and states no term, so a
   lawyer can draft against the structure instead of first unpicking
   invented clauses. The draft notice is the most important thing on
   the page and is rendered before the content, not after it.
   ═══════════════════════════════════════════════════════════════ */
(async function legalPage() {
  const root = $('#legalRoot');
  if (!root) return;

  const key = root.dataset.doc;
  const [legal, ok] = await Promise.all([loadJSON('legal'), catalogue()]);
  if (!legal || !legal.docs[key]) { dataError(root, 'this document'); return; }
  const doc = legal.docs[key];

  document.title = `${doc.title} — Go Wine Go`;
  $('#legalTitle').textContent = doc.title;
  $('#legalLead').textContent = doc.lead;
  $('#legalCrumb').textContent = doc.title;

  const notice = $('#legalDraft');
  notice.replaceChildren(icon('i-alert'), (() => {
    const body = el('span');
    body.appendChild(el('b', null, 'Draft, not a binding agreement. '));
    body.appendChild(document.createTextNode(
      ok && POLICY ? POLICY.legal_draft_notice
        : 'This page is a structural draft pending legal review.'));
    return body;
  })());

  root.replaceChildren(...doc.sections.map((s) => {
    const sec = el('section', 'legal__section');
    sec.appendChild(el('h2', 'legal__h', s.h));
    s.p.forEach((p) => sec.appendChild(el('p', 'legal__body', p)));
    const todo = el('p', 'legal__todo');
    todo.appendChild(icon('i-alert', true));
    todo.appendChild(el('span', null, 'Needs legal drafting'));
    sec.appendChild(todo);
    return sec;
  }));
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

  wirePodButtons = () => $$('[data-pod-order]', root).forEach((btn) => {
    if (btn.dataset.podWired) return;
    btn.dataset.podWired = '1';
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

  // Banned Drinker Register, spec 8: the notice appears as soon as the
  // delivery postcode falls inside a covered region, not after submit.
  const postcode = $('#deliveryPostcode');
  if (postcode) {
    postcode.addEventListener('input', () => renderBdr($('#buyBdr'), postcode.value));
  }
})();
