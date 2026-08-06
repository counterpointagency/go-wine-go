/* ═══════════════════════════════════════════════════════════════════
   GO WINE GO — PAGE — legal.js
   The four structural drafts under /legal.

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
