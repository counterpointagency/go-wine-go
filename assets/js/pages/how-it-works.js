/* ═══════════════════════════════════════════════════════════════════
   GO WINE GO — PAGE — how-it-works.js
   Customer explainer, spec 4.6.

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
