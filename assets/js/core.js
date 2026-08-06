/* ═══════════════════════════════════════════════════════════════════
   GO WINE GO — CORE
   Loaded by all fourteen pages. Helpers, the store, dialog behaviour,
   the header, toast, search, territory, the mobile menu, the age gate
   and the Banned Drinker Register notice. Nothing page-specific.

   Plain ES modules, served as-is. No build step and no manifest at the
   repo root, which is what broke the Round 2 deploy.
   ═══════════════════════════════════════════════════════════════════ */

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

/** The width ladder tools/build-images.mjs emits: halve down to ~400px,
    largest first. The largest keeps the plain file name, so the `src`
    fallback and the width/height attributes never change. */
function widthLadder(intrinsic) {
  const out = [];
  let cur = intrinsic;
  while (cur >= 400) { out.push(cur); cur = Math.round(cur / 2); }
  return out.length ? out : [intrinsic];
}

function srcsetFor(base, ext, intrinsic) {
  const ladder = widthLadder(intrinsic);
  return ladder
    .map((w, i) => `${i === 0 ? base : base + '-' + w}.${ext} ${w}w`)
    .join(', ');
}

/** <picture> with AVIF, then WebP, then a JPEG fallback, each with a width
    ladder. Explicit width and height on the img so the box is reserved
    before the bytes arrive and nothing shifts. Every image on the site goes
    through this. */
function picture(base, alt, w, h, eager, sizes) {
  const pic = document.createElement('picture');
  for (const type of ['avif', 'webp']) {
    const source = document.createElement('source');
    source.srcset = srcsetFor(base, type, w);
    source.type = 'image/' + type;
    if (sizes) source.sizes = sizes;
    pic.appendChild(source);
  }
  const img = document.createElement('img');
  img.srcset = srcsetFor(base, 'jpg', w);
  if (sizes) img.sizes = sizes;
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
const shortlistSeed = () => SHORTLIST_SEED;
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

/* The reduced-motion media query collapses the CSS transition tokens, but
   it cannot reach scrollIntoView({behavior:'smooth'}) — that is a JS
   argument, not a style. Anything that scrolls goes through this. */
function reveal(node, block) {
  const still = window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  node.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: block || 'nearest' });
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

/* WINES, WINERIES and POLICY are module-scope bindings that catalogue()
   reassigns. ES module imports are LIVE bindings, so an importer sees the
   filled value rather than the empty one captured at evaluation time. */

export {
  $,
  $$,
  money,
  round,
  auDate,
  el,
  icon,
  loadJSON,
  dataError,
  Store,
  STORE_VERSION,
  userOffers,
  userOrders,
  userTenders,
  offerStates,
  goDealCommits,
  shortlist,
  setShortlist,
  isShortlisted,
  toggleShortlist,
  shortlistSeed,
  seedShortlist,
  today,
  isPast,
  reveal,
  isoInDays,
  catalogue,
  wineBySlug,
  winesOf,
  wineryName,
  fillTemplate,
  slugParam,
  picture,
  srcsetFor,
  widthLadder,
  wetNote,
  isolate,
  trapFocus,
  toast,
  searchQuery,
  goSearch,
  wineMatches,
  postcode,
  setPostcode,
  excludesPostcode,
  wineExcluded,
  bdrRegionFor,
  renderBdr,
  WINES, WINERIES, POLICY,
};
