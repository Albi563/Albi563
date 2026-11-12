// Calcolo delle parentele. Nel database esistono solo due legami:
// genitore→figlio (person.parents) e coppia (person.partnerId).
// Tutto il resto (nonni, zii, cugini, cognati…) si deduce da qui.
import { getLang } from './i18n.js';

export function fullName(p) {
  if (!p) return '';
  return `${p.firstName || ''} ${p.lastName || ''}`.trim();
}

export function childrenOf(people, id) {
  const out = [];
  for (const p of people.values()) if ((p.parents || []).includes(id)) out.push(p);
  return out.sort(byBirth);
}

export function siblingsOf(people, id) {
  const me = people.get(id);
  if (!me || !me.parents?.length) return [];
  const out = [];
  for (const p of people.values()) {
    if (p.id === id) continue;
    if ((p.parents || []).some((x) => me.parents.includes(x))) out.push(p);
  }
  return out.sort(byBirth);
}

export function byBirth(a, b) {
  return (a.birth?.y || 9999) - (b.birth?.y || 9999)
    || (a.birth?.m || 0) - (b.birth?.m || 0)
    || (a.birth?.d || 0) - (b.birth?.d || 0);
}

/** Mappa id → numero di generazioni verso l'alto (sé stesso = 0). */
function ancestorDistances(people, id) {
  const dist = new Map([[id, 0]]);
  const queue = [id];
  while (queue.length) {
    const cur = queue.shift();
    for (const par of people.get(cur)?.parents || []) {
      if (people.has(par) && !dist.has(par)) {
        dist.set(par, dist.get(cur) + 1);
        queue.push(par);
      }
    }
  }
  return dist;
}

/** Parentela di sangue: {u: generazioni da A all'antenato comune, d: dall'antenato a B}. */
function bloodLink(people, a, b) {
  const da = ancestorDistances(people, a);
  const db = ancestorDistances(people, b);
  let best = null;
  for (const [id, u] of da) {
    if (!db.has(id)) continue;
    const d = db.get(id);
    if (!best || u + d < best.u + best.d) best = { u, d };
  }
  return best;
}

// ---------------- Vocabolario ----------------
// Ogni voce: [maschile, femminile]
const W = {
  it: {
    self: ['Tu', 'Tu'], partner: ['Partner', 'Partner'],
    parent: ['Padre', 'Madre'], gp: ['Nonno', 'Nonna'], ggp: ['Bisnonno', 'Bisnonna'], gggp: ['Trisnonno', 'Trisnonna'],
    child: ['Figlio', 'Figlia'], gc: ['Nipote', 'Nipote'], ggc: ['Pronipote', 'Pronipote'],
    sib: ['Fratello', 'Sorella'], uncle: ['Zio', 'Zia'], guncle: ['Prozio', 'Prozia'],
    nephew: ['Nipote', 'Nipote'], gnephew: ['Pronipote', 'Pronipote'],
    cousin: ['Cugino', 'Cugina'],
    cousinN: (n) => [`Cugino di ${n}° grado`, `Cugina di ${n}° grado`],
    removed: (r) => ` (${r} gen. di distanza)`,
    ancestor: (n) => [`Antenato (${n} gen.)`, `Antenata (${n} gen.)`],
    descendant: (n) => [`Discendente (${n} gen.)`, `Discendente (${n} gen.)`],
    inlawParent: ['Suocero', 'Suocera'], inlawChild: ['Genero', 'Nuora'], inlawSib: ['Cognato', 'Cognata'],
    step: ['Patrigno', 'Matrigna'], stepChild: ['Figliastro', 'Figliastra'],
    partnerOf: (n) => `Partner di ${n}`,
    relOf: (rel, n) => `${rel} di ${n}`,
    relative: ['Parente', 'Parente'],
  },
  en: {
    self: ['You', 'You'], partner: ['Partner', 'Partner'],
    parent: ['Father', 'Mother'], gp: ['Grandfather', 'Grandmother'], ggp: ['Great-grandfather', 'Great-grandmother'],
    gggp: ['Great-great-grandfather', 'Great-great-grandmother'],
    child: ['Son', 'Daughter'], gc: ['Grandson', 'Granddaughter'], ggc: ['Great-grandson', 'Great-granddaughter'],
    sib: ['Brother', 'Sister'], uncle: ['Uncle', 'Aunt'], guncle: ['Great-uncle', 'Great-aunt'],
    nephew: ['Nephew', 'Niece'], gnephew: ['Grandnephew', 'Grandniece'],
    cousin: ['Cousin', 'Cousin'],
    cousinN: (n) => { const o = ['', 'First', 'Second', 'Third', 'Fourth', 'Fifth'][n] || `${n}th`; return [`${o} cousin`, `${o} cousin`]; },
    removed: (r) => (r === 1 ? ' once removed' : r === 2 ? ' twice removed' : ` ${r}× removed`),
    ancestor: (n) => [`Ancestor (${n} gen.)`, `Ancestor (${n} gen.)`],
    descendant: (n) => [`Descendant (${n} gen.)`, `Descendant (${n} gen.)`],
    inlawParent: ['Father-in-law', 'Mother-in-law'], inlawChild: ['Son-in-law', 'Daughter-in-law'],
    inlawSib: ['Brother-in-law', 'Sister-in-law'],
    step: ['Stepfather', 'Stepmother'], stepChild: ['Stepson', 'Stepdaughter'],
    partnerOf: (n) => `${n}'s partner`,
    relOf: (rel, n) => `${n}'s ${rel.toLowerCase()}`,
    relative: ['Relative', 'Relative'],
  },
  ro: {
    self: ['Tu', 'Tu'], partner: ['Partener', 'Parteneră'],
    parent: ['Tată', 'Mamă'], gp: ['Bunic', 'Bunică'], ggp: ['Străbunic', 'Străbunică'], gggp: ['Răstrăbunic', 'Răstrăbunică'],
    child: ['Fiu', 'Fiică'], gc: ['Nepot', 'Nepoată'], ggc: ['Strănepot', 'Strănepoată'],
    sib: ['Frate', 'Soră'], uncle: ['Unchi', 'Mătușă'], guncle: ['Unchi mare', 'Mătușă mare'],
    nephew: ['Nepot', 'Nepoată'], gnephew: ['Strănepot', 'Strănepoată'],
    cousin: ['Văr', 'Verișoară'],
    cousinN: (n) => [`Văr de gradul ${n}`, `Verișoară de gradul ${n}`],
    removed: (r) => ` (${r} gen. distanță)`,
    ancestor: (n) => [`Strămoș (${n} gen.)`, `Strămoașă (${n} gen.)`],
    descendant: (n) => [`Urmaș (${n} gen.)`, `Urmașă (${n} gen.)`],
    inlawParent: ['Socru', 'Soacră'], inlawChild: ['Ginere', 'Noră'], inlawSib: ['Cumnat', 'Cumnată'],
    step: ['Tată vitreg', 'Mamă vitregă'], stepChild: ['Fiu vitreg', 'Fiică vitregă'],
    partnerOf: (n, female) => `${female ? 'Partenera' : 'Partenerul'} lui ${n}`,
    relOf: (rel, n, female) => `${rel} ${female ? 'a' : 'al'} lui ${n}`,
    relative: ['Rudă', 'Rudă'],
  },
  es: {
    self: ['Tú', 'Tú'], partner: ['Pareja', 'Pareja'],
    parent: ['Padre', 'Madre'], gp: ['Abuelo', 'Abuela'], ggp: ['Bisabuelo', 'Bisabuela'], gggp: ['Tatarabuelo', 'Tatarabuela'],
    child: ['Hijo', 'Hija'], gc: ['Nieto', 'Nieta'], ggc: ['Bisnieto', 'Bisnieta'],
    sib: ['Hermano', 'Hermana'], uncle: ['Tío', 'Tía'], guncle: ['Tío abuelo', 'Tía abuela'],
    nephew: ['Sobrino', 'Sobrina'], gnephew: ['Sobrino nieto', 'Sobrina nieta'],
    cousin: ['Primo', 'Prima'],
    cousinN: (n) => { const o = ['', '', 'segundo', 'tercero', 'cuarto', 'quinto'][n] || `${n}º`; return [`Primo ${o}`, `Prima ${o.replace(/o$/, 'a')}`]; },
    removed: (r) => ` (${r} gen. de distancia)`,
    ancestor: (n) => [`Antepasado (${n} gen.)`, `Antepasada (${n} gen.)`],
    descendant: (n) => [`Descendiente (${n} gen.)`, `Descendiente (${n} gen.)`],
    inlawParent: ['Suegro', 'Suegra'], inlawChild: ['Yerno', 'Nuera'], inlawSib: ['Cuñado', 'Cuñada'],
    step: ['Padrastro', 'Madrastra'], stepChild: ['Hijastro', 'Hijastra'],
    partnerOf: (n) => `Pareja de ${n}`,
    relOf: (rel, n) => `${rel} de ${n}`,
    relative: ['Pariente', 'Pariente'],
  },
};

function pick(pair, sex) { return pair[sex === 'F' ? 1 : 0]; }

function bloodTerm(w, u, d, sex) {
  if (u === 0 && d === 0) return pick(w.self, sex);
  if (d === 0) {
    if (u === 1) return pick(w.parent, sex);
    if (u === 2) return pick(w.gp, sex);
    if (u === 3) return pick(w.ggp, sex);
    if (u === 4) return pick(w.gggp, sex);
    return pick(w.ancestor(u), sex);
  }
  if (u === 0) {
    if (d === 1) return pick(w.child, sex);
    if (d === 2) return pick(w.gc, sex);
    if (d === 3) return pick(w.ggc, sex);
    return pick(w.descendant(d), sex);
  }
  if (u === 1 && d === 1) return pick(w.sib, sex);
  if (d === 1) {
    if (u === 2) return pick(w.uncle, sex);
    if (u === 3) return pick(w.guncle, sex);
  }
  if (u === 1) {
    if (d === 2) return pick(w.nephew, sex);
    if (d === 3) return pick(w.gnephew, sex);
  }
  if (u >= 2 && d >= 2) {
    const degree = Math.min(u, d) - 1;
    const removed = Math.abs(u - d);
    const base = degree === 1 ? pick(w.cousin, sex) : pick(w.cousinN(degree), sex);
    return removed ? base + w.removed(removed) : base;
  }
  return pick(w.relative, sex);
}

/**
 * Descrive chi è `targetId` rispetto a `meId` (es. "Nonna", "Cugino", "Cognata").
 * Restituisce '' se non c'è alcun legame noto.
 */
export function describeRelation(people, meId, targetId) {
  if (!meId || !targetId || !people.has(meId) || !people.has(targetId)) return '';
  const w = W[getLang()] || W.it;
  const me = people.get(meId);
  const target = people.get(targetId);
  const sex = target.sex;
  if (meId === targetId) return pick(w.self, sex);
  if (me.partnerId === targetId) return pick(w.partner, sex);

  const blood = bloodLink(people, meId, targetId);
  if (blood) return bloodTerm(w, blood.u, blood.d, sex);

  // Il target è il partner di un mio parente di sangue?
  const tp = target.partnerId && people.get(target.partnerId);
  if (tp) {
    const b = bloodLink(people, meId, tp.id);
    if (b) {
      if (b.u === 0 && b.d === 1) return pick(w.inlawChild, sex);
      if (b.u === 1 && b.d === 1) return pick(w.inlawSib, sex);
      if (b.u === 1 && b.d === 0) return pick(w.step, sex);
      if (b.u === 2 && b.d === 1) return pick(w.uncle, sex); // la moglie dello zio è "zia"
      if (b.u === 3 && b.d === 1) return pick(w.guncle, sex);
      return w.partnerOf(fullName(tp), sex === 'F');
    }
  }
  // Il target è un parente di sangue del mio partner?
  const mp = me.partnerId && people.get(me.partnerId);
  if (mp) {
    const b = bloodLink(people, mp.id, targetId);
    if (b) {
      if (b.u === 1 && b.d === 0) return pick(w.inlawParent, sex);
      if (b.u === 1 && b.d === 1) return pick(w.inlawSib, sex);
      if (b.u === 0 && b.d === 1) return pick(w.stepChild, sex);
      return w.relOf(bloodTerm(w, b.u, b.d, sex), fullName(mp), sex === 'F');
    }
  }
  return '';
}

/** Normalizza un testo per la ricerca (minuscole, senza accenti). */
export function normalize(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}

/** Cerca persone per nome: ogni parola digitata deve comparire in nome o cognome. */
export function searchPeople(people, query) {
  const words = normalize(query).split(' ').filter(Boolean);
  if (!words.length) return [];
  const out = [];
  for (const p of people.values()) {
    const hay = normalize(`${p.firstName} ${p.lastName}`);
    if (words.every((w) => hay.includes(w))) out.push(p);
  }
  return out.sort((a, b) => fullName(a).localeCompare(fullName(b)));
}
