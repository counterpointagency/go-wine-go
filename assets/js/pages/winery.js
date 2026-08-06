/* ═══════════════════════════════════════════════════════════════════
   GO WINE GO — PAGE — winery.js
   Winery profile, spec 4.3.

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
import { openOfferModal, openBuyModal } from '../modals.js';

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
    picture(winery.hero_image, winery.hero_alt, 1400, 700, true, '100vw'));
  $('#wineryTitle').textContent = winery.name;
  $('#winerySub').textContent = `${winery.subregion}, ${winery.gi}`;

  /* ── story ─────────────────────────────────────────────────── */
  $('#wineryPortrait').replaceChildren(
    picture(winery.portrait_image, winery.portrait_alt, 1000, 1250, false, '(max-width: 900px) 100vw, 40vw'));
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
