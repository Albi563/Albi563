// "Collega": crea un legame tra due persone già presenti nell'albero
// (genitore/figlio, partner, fratelli), dal profilo o dall'albero.
import { t } from './i18n.js';
import { fullName, searchPeople, siblingsOf } from './relations.js';
import { escapeHtml as h, avatarHtml, yearsLabel } from './ui.js';

function isAncestor(people, ancestorId, id) {
  const seen = new Set();
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop();
    for (const p of people.get(cur)?.parents || []) {
      if (p === ancestorId) return true;
      if (!seen.has(p)) { seen.add(p); stack.push(p); }
    }
  }
  return false;
}

/** Fratelli di `childId` che potrebbero ricevere anche il genitore `parentId`. */
export function siblingCandidates(people, childId, parentId) {
  return siblingsOf(people, childId).filter((s) =>
    s.id !== parentId && !(s.parents || []).includes(parentId) && (s.parents || []).length < 2
    && !isAncestor(people, s.id, parentId));
}

/**
 * Calcola le persone da salvare per il legame richiesto.
 * kind: 'parent' (a è genitore di b) | 'child' (a è figlio di b) | 'partner' | 'sibling'
 * Restituisce { updates: [persona, ...] } oppure { error: 'chiave messaggio' }.
 */
export function planLink(people, aId, bId, kind, alsoIds = []) {
  if (aId === bId) return { error: 'linkSame' };
  const a = people.get(aId); const b = people.get(bId);
  if (!a || !b) return { error: 'notFound' };
  if (kind === 'child') return planLink(people, bId, aId, 'parent', alsoIds);

  if (kind === 'parent') {
    const updates = [];
    for (const cid of [bId, ...alsoIds]) {
      const c = people.get(cid);
      if (!c || (c.parents || []).includes(aId)) continue;
      if ((c.parents || []).length >= 2) return { error: 'linkTooManyParents', name: fullName(c) };
      if (cid === aId || isAncestor(people, cid, aId)) return { error: 'linkCycle' };
      updates.push({ ...c, parents: [...(c.parents || []), aId] });
    }
    return updates.length ? { updates } : { error: 'linkAlready' };
  }

  if (kind === 'partner') {
    if (a.partnerId === bId) return { error: 'linkAlready' };
    return { updates: [{ ...a, partnerId: bId }] };
  }

  if (kind === 'sibling') {
    const union = [...new Set([...(a.parents || []), ...(b.parents || [])])];
    if (!union.length) return { error: 'siblingNeedsParent' };
    if (union.length > 2) return { error: 'linkSiblingsConflict' };
    if (union.includes(aId) || union.includes(bId)) return { error: 'linkCycle' };
    const updates = [];
    for (const p of [a, b]) {
      if ((p.parents || []).length !== union.length) updates.push({ ...p, parents: union });
    }
    return updates.length ? { updates } : { error: 'linkAlready' };
  }
  return { error: 'notFound' };
}

function sheet(html) {
  const wrap = document.createElement('div');
  wrap.className = 'sheet-backdrop';
  wrap.innerHTML = `<div class="sheet" role="dialog">${html}</div>`;
  document.body.appendChild(wrap);
  return wrap;
}

/** Finestra per scegliere una persona (con ricerca). Promise<id|null>. */
export function pickPerson(people, excludeId, title) {
  return new Promise((resolve) => {
    const all = [...people.values()].filter((p) => p.id !== excludeId)
      .sort((x, y) => fullName(x).localeCompare(fullName(y)));
    const wrap = sheet(`
      <div class="sheet-head"><b>${h(title)}</b><button class="btn ghost small" data-x>${h(t('cancel'))}</button></div>
      <input class="input" type="search" placeholder="${h(t('searchPeople'))}" data-q>
      <div class="list sheet-list" data-l></div>`);
    const list = wrap.querySelector('[data-l]');
    const draw = (q) => {
      const rows = q.trim() ? searchPeople(people, q).filter((p) => p.id !== excludeId) : all;
      list.innerHTML = rows.map((p) => `<button class="row" data-id="${p.id}">${avatarHtml(p, 40)}
        <span class="row-main"><b>${h(fullName(p))}</b><small>${h(yearsLabel(p))}</small></span></button>`).join('')
        || `<p class="muted pad">${h(t('notFound'))}</p>`;
    };
    draw('');
    wrap.querySelector('[data-q]').oninput = (e) => draw(e.target.value);
    wrap.addEventListener('click', (e) => {
      const row = e.target.closest('[data-id]');
      if (row) { wrap.remove(); resolve(row.dataset.id); return; }
      if (e.target === wrap || e.target.closest('[data-x]')) { wrap.remove(); resolve(null); }
    });
  });
}

/**
 * Chiede che legame c'è tra A e B, poi lo salva.
 * save(updates) deve salvare le persone. Promise<boolean>.
 */
export function chooseLink(people, aId, bId, save, onError) {
  return new Promise((resolve) => {
    const a = people.get(aId); const b = people.get(bId);
    const A = h(a.firstName); const B = h(b.firstName);
    const sibBox = (childId, parentId) => {
      const c = siblingCandidates(people, childId, parentId);
      if (!c.length) return '';
      return `<div class="also" data-also-for="${childId}">
        <small>${h(t('alsoForSiblings'))}</small>
        ${c.map((s) => `<label class="check"><input type="checkbox" value="${s.id}" checked> ${h(fullName(s))}</label>`).join('')}
      </div>`;
    };
    const wrap = sheet(`
      <div class="sheet-head"><b>${h(t('linkTitle'))}</b><button class="btn ghost small" data-x>${h(t('cancel'))}</button></div>
      <div class="link-pair">${avatarHtml(a, 48)}<span>${A}</span><span class="link-amp">＋</span>${avatarHtml(b, 48)}<span>${B}</span></div>
      <div class="link-opts">
        <button class="link-opt" data-k="parent">${t('relParentOf', { a: A, b: B })}</button>
        ${sibBox(bId, aId)}
        <button class="link-opt" data-k="child">${t('relParentOf', { a: B, b: A })}</button>
        ${sibBox(aId, bId)}
        <button class="link-opt" data-k="partner">${t('relPartners', { a: A, b: B })}</button>
        <button class="link-opt" data-k="sibling">${t('relSiblings', { a: A, b: B })}</button>
      </div>`);
    wrap.addEventListener('click', async (e) => {
      if (e.target === wrap || e.target.closest('[data-x]')) { wrap.remove(); resolve(false); return; }
      const opt = e.target.closest('[data-k]');
      if (!opt) return;
      const kind = opt.dataset.k;
      const childId = kind === 'parent' ? bId : kind === 'child' ? aId : null;
      const also = childId
        ? [...wrap.querySelectorAll(`[data-also-for="${childId}"] input:checked`)].map((i) => i.value) : [];
      const plan = planLink(people, aId, bId, kind, also);
      if (plan.error) { onError(t(plan.error, { n: plan.name || '' })); return; }
      try {
        await save(plan.updates);
        wrap.remove();
        resolve(true);
      } catch (err) { onError(t('saveError', { e: err.message })); }
    });
  });
}
