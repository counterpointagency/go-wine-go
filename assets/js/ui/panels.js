/* ═══════════════════════════════════════════════════════════════════
   GO WINE GO — RENDERER — policy panel and diagram
   The delivery and payment panels, built from data/policy.json, and the
   thin-line diagrams. Wine detail, how it works, for wineries.

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

export {
  policyPanel,
  diagram,
};
