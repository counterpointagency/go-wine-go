/* ═══════════════════════════════════════════════════════════════════
   GO WINE GO — PAGE — tenders.js
   Consumer tenders, spec 4.5.

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
import { tenderCard } from '../ui/tender.js';

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
