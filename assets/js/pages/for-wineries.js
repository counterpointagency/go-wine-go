/* ═══════════════════════════════════════════════════════════════════
   GO WINE GO — PAGE — for-wineries.js
   Supply-side pitch, spec 4.7.

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
