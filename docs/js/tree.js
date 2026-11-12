// Vista ad albero: impaginazione a generazioni di TUTTA la famiglia,
// con zoom a pizzico, trascinamento e centratura sulla persona toccata.
import { fullName, describeRelation } from './relations.js';
import { escapeHtml, avatarHtml, yearsLabel } from './ui.js';

const CARD_W = 116;
const CARD_H = 150;
const GAP_X = 18;        // spazio tra persone nella stessa riga
const COUPLE_GAP = 10;   // spazio tra i due partner
const ROW_H = 230;       // distanza verticale tra generazioni

// ---------------------------------------------------------------
// 1) Generazioni
function assignGenerations(people, startId) {
  const gen = new Map();
  const ids = [...people.keys()];
  const order = startId && people.has(startId) ? [startId, ...ids] : ids;
  let componentOffset = 0;
  const components = [];
  for (const seed of order) {
    if (gen.has(seed)) continue;
    const comp = [];
    gen.set(seed, 0);
    const queue = [seed];
    while (queue.length) {
      const id = queue.shift();
      comp.push(id);
      const p = people.get(id);
      const g = gen.get(id);
      const visit = (other, value) => {
        if (other && people.has(other) && !gen.has(other)) { gen.set(other, value); queue.push(other); }
      };
      for (const par of p.parents || []) visit(par, g - 1);
      visit(p.partnerId, g);
      for (const c of people.values()) if ((c.parents || []).includes(id)) visit(c.id, g + 1);
    }
    components.push(comp);
    componentOffset++;
  }
  // Normalizza ogni componente affinché parta da 0
  for (const comp of components) {
    const min = Math.min(...comp.map((id) => gen.get(id)));
    for (const id of comp) gen.set(id, gen.get(id) - min);
  }
  return { gen, components };
}

// ---------------------------------------------------------------
// 2) Unità (coppie o singoli) per riga e ordinamento
function buildLayout(people, focusId) {
  const { gen, components } = assignGenerations(people, focusId);
  const positions = new Map();
  let offsetX = 0;
  let maxRows = 0;

  for (const comp of components) {
    const compSet = new Set(comp);
    const rows = new Map(); // g -> units
    const unitOf = new Map();
    for (const id of comp) {
      if (unitOf.has(id)) continue;
      const p = people.get(id);
      const g = gen.get(id);
      const partner = p.partnerId && compSet.has(p.partnerId) && gen.get(p.partnerId) === g && !unitOf.has(p.partnerId)
        ? p.partnerId : null;
      const unit = { members: partner ? [id, partner] : [id], g, x: 0 };
      for (const m of unit.members) unitOf.set(m, unit);
      if (!rows.has(g)) rows.set(g, []);
      rows.get(g).push(unit);
    }
    const gens = [...rows.keys()].sort((a, b) => a - b);
    maxRows = Math.max(maxRows, gens.length);

    const unitWidth = (u) => u.members.length * CARD_W + (u.members.length - 1) * COUPLE_GAP;
    const memberX = (id) => {
      const u = unitOf.get(id);
      const i = u.members.indexOf(id);
      return u.x - unitWidth(u) / 2 + CARD_W / 2 + i * (CARD_W + COUPLE_GAP);
    };
    const parentsOfUnit = (u) => u.members.flatMap((m) => (people.get(m).parents || []).filter((x) => compSet.has(x)));
    const childrenOfUnit = (u) => comp.filter((c) => (people.get(c).parents || []).some((x) => u.members.includes(x)));

    // Ordine iniziale: visita in profondità dall'alto, così i fratelli restano vicini
    const seen = new Set();
    const orderIdx = new Map();
    let counter = 0;
    const dfs = (u) => {
      if (seen.has(u)) return;
      seen.add(u);
      orderIdx.set(u, counter++);
      const kids = [...new Set(childrenOfUnit(u).map((c) => unitOf.get(c)))];
      kids.sort((a, b) => (people.get(a.members[0]).birth?.y || 0) - (people.get(b.members[0]).birth?.y || 0));
      for (const k of kids) dfs(k);
    };
    for (const g of gens) for (const u of rows.get(g)) dfs(u);
    for (const g of gens) rows.get(g).sort((a, b) => orderIdx.get(a) - orderIdx.get(b));

    const placeRow = (units, desired) => {
      // Regressione isotonica (PAV): posizioni il più vicine possibile a quelle
      // desiderate, rispettando ordine e distanza minima.
      const n = units.length;
      if (!n) return;
      const offs = [0];
      for (let i = 1; i < n; i++) offs[i] = offs[i - 1] + unitWidth(units[i - 1]) / 2 + GAP_X + unitWidth(units[i]) / 2;
      const target = desired.map((d, i) => d - offs[i]);
      const blocks = [];
      for (let i = 0; i < n; i++) {
        blocks.push({ sum: target[i], cnt: 1, start: i });
        while (blocks.length > 1) {
          const b = blocks[blocks.length - 1];
          const a = blocks[blocks.length - 2];
          if (a.sum / a.cnt <= b.sum / b.cnt) break;
          a.sum += b.sum; a.cnt += b.cnt;
          blocks.pop();
        }
      }
      for (const b of blocks) {
        const v = b.sum / b.cnt;
        for (let i = b.start; i < b.start + b.cnt; i++) units[i].x = v + offs[i];
      }
    };

    // Posizione iniziale compatta
    for (const g of gens) {
      const units = rows.get(g);
      placeRow(units, units.map(() => 0));
    }

    const avg = (arr) => arr.reduce((s, v) => s + v, 0) / arr.length;
    for (let iter = 0; iter < 8; iter++) {
      // dall'alto verso il basso: i figli sotto i genitori
      for (const g of gens) {
        const units = rows.get(g);
        const desired = units.map((u) => {
          const ps = parentsOfUnit(u);
          return ps.length ? avg(ps.map(memberX)) : u.x;
        });
        // riordina in base al baricentro desiderato (stabile)
        const idx = units.map((u, i) => [u, desired[i], i]).sort((a, b) => a[1] - b[1] || a[2] - b[2]);
        units.splice(0, units.length, ...idx.map((e) => e[0]));
        placeRow(units, idx.map((e) => e[1]));
      }
      // dal basso verso l'alto: i genitori sopra i figli
      for (const g of [...gens].reverse()) {
        const units = rows.get(g);
        const desired = units.map((u) => {
          const cs = childrenOfUnit(u);
          return cs.length ? avg(cs.map(memberX)) : u.x;
        });
        placeRow(units, desired);
      }
      // ordina i membri di ogni coppia: chi ha i genitori più a sinistra va a sinistra
      for (const g of gens) {
        for (const u of rows.get(g)) {
          if (u.members.length !== 2) continue;
          const px = u.members.map((m) => {
            const ps = (people.get(m).parents || []).filter((x) => compSet.has(x));
            return ps.length ? avg(ps.map(memberX)) : null;
          });
          if (px[0] !== null && px[1] !== null && px[0] > px[1]) u.members.reverse();
          else if (px[0] === null && px[1] !== null && px[1] < u.x) u.members.reverse();
          else if (px[1] === null && px[0] !== null && px[0] > u.x) u.members.reverse();
        }
      }
    }

    // Trasla il componente accanto al precedente
    let minX = Infinity; let maxX = -Infinity;
    for (const id of comp) {
      const x = memberX(id);
      minX = Math.min(minX, x - CARD_W / 2);
      maxX = Math.max(maxX, x + CARD_W / 2);
    }
    for (const id of comp) {
      positions.set(id, { x: memberX(id) - minX + offsetX + CARD_W / 2, y: gen.get(id) * ROW_H + CARD_H / 2 });
    }
    offsetX += maxX - minX + GAP_X * 6;
  }
  return { positions, width: Math.max(offsetX - GAP_X * 6, CARD_W), height: maxRows * ROW_H };
}

// ---------------------------------------------------------------
// 3) Linee di collegamento
function buildLines(people, positions) {
  const parts = [];
  // coppie
  const done = new Set();
  for (const p of people.values()) {
    if (!p.partnerId || done.has(p.id) || !positions.has(p.partnerId)) continue;
    done.add(p.id); done.add(p.partnerId);
    const a = positions.get(p.id); const b = positions.get(p.partnerId);
    if (Math.abs(a.y - b.y) < 1) {
      const [l, r] = a.x < b.x ? [a, b] : [b, a];
      parts.push(`<path class="ln-couple" d="M${l.x + CARD_W / 2} ${l.y} H${r.x - CARD_W / 2}"/>`);
    }
  }
  // genitori → figli, raggruppati per coppia di genitori
  const groups = new Map();
  for (const c of people.values()) {
    const ps = (c.parents || []).filter((x) => positions.has(x)).sort();
    if (!ps.length || !positions.has(c.id)) continue;
    const key = ps.join('|');
    if (!groups.has(key)) groups.set(key, { ps, kids: [] });
    groups.get(key).kids.push(c.id);
  }
  // Prepara i gruppi e assegna un "livello" alle linee orizzontali che si
  // sovrapporrebbero nella stessa riga, così restano distinguibili.
  const items = [...groups.values()].map(({ ps, kids }) => {
    const pp = ps.map((x) => positions.get(x));
    const px = pp.reduce((s, p) => s + p.x, 0) / pp.length;
    const py = Math.max(...pp.map((p) => p.y));
    const kp = kids.map((k) => positions.get(k));
    const xs = kp.map((k) => k.x);
    return {
      pp, px, py, kp,
      topY: Math.min(...kp.map((k) => k.y)) - CARD_H / 2,
      minX: Math.min(px, ...xs) - 4, maxX: Math.max(px, ...xs) + 4,
    };
  });
  const rowsLevels = new Map();
  for (const it of [...items].sort((a, b) => a.minX - b.minX)) {
    if (!rowsLevels.has(it.topY)) rowsLevels.set(it.topY, []);
    const ends = rowsLevels.get(it.topY);
    let lvl = ends.findIndex((end) => end < it.minX);
    if (lvl === -1) { lvl = ends.length; ends.push(0); }
    ends[lvl] = it.maxX;
    it.level = lvl;
  }
  for (const { pp, px, py, kp, topY, level } of items) {
    const startY = pp.length === 2 && Math.abs(pp[0].y - pp[1].y) < 1 ? py : py + CARD_H / 2;
    const busY = topY - 18 - level * 14;
    const xs = kp.map((k) => k.x);
    const minX = Math.min(px, ...xs); const maxX = Math.max(px, ...xs);
    let d = `M${px} ${startY} V${busY} M${minX} ${busY} H${maxX}`;
    for (const k of kp) d += ` M${k.x} ${busY} V${k.y - CARD_H / 2}`;
    parts.push(`<path class="ln-child" d="${d}"/>`);
  }
  return parts.join('');
}

// ---------------------------------------------------------------
// 4) Componente interattivo
export class TreeView {
  constructor(container, { onOpen, onLinkTap }) {
    this.el = container;
    this.onOpen = onOpen;
    this.onLinkTap = onLinkTap || (() => {});
    this.scale = 0.8;
    this.tx = 0; this.ty = 0;
    this.focusId = null;
    this.el.innerHTML = `
      <div class="tree-viewport"><div class="tree-world"><svg class="tree-lines"></svg><div class="tree-cards"></div></div></div>
      <div class="tree-zoom">
        <button class="round" data-z="in" aria-label="Zoom +">＋</button>
        <button class="round" data-z="out" aria-label="Zoom −">－</button>
      </div>`;
    this.viewport = this.el.querySelector('.tree-viewport');
    this.world = this.el.querySelector('.tree-world');
    this.svg = this.el.querySelector('.tree-lines');
    this.cards = this.el.querySelector('.tree-cards');
    this.el.querySelector('[data-z=in]').onclick = () => this.zoomBy(1.3);
    this.el.querySelector('[data-z=out]').onclick = () => this.zoomBy(1 / 1.3);
    this.bindGestures();
  }

  render(people, meId, focusId) {
    this.people = people;
    this.meId = meId;
    if (focusId && people.has(focusId)) this.focusId = focusId;
    if (!this.focusId || !people.has(this.focusId)) this.focusId = meId && people.has(meId) ? meId : people.keys().next().value;
    const { positions, width, height } = buildLayout(people, this.meId || this.focusId);
    this.positions = positions;
    this.svg.setAttribute('width', width + 40);
    this.svg.setAttribute('height', height + 40);
    this.svg.innerHTML = buildLines(people, positions);
    let html = '';
    for (const [id, pos] of positions) {
      const p = people.get(id);
      const rel = describeRelation(people, meId, id);
      const cls = ['card', p.sex === 'F' ? 'f' : 'm', id === this.focusId ? 'focus' : '', id === meId ? 'me' : '', p.alive === false ? 'dead' : ''].join(' ');
      html += `<div class="${cls}" data-id="${id}" style="left:${pos.x - CARD_W / 2}px;top:${pos.y - CARD_H / 2}px;width:${CARD_W}px;height:${CARD_H}px">
        ${avatarHtml(p, 56)}
        <div class="card-name">${escapeHtml(p.firstName)}</div>
        <div class="card-surname">${escapeHtml(p.lastName)}</div>
        <div class="card-years">${escapeHtml(yearsLabel(p))}</div>
        ${rel && id !== meId ? `<div class="card-rel">${escapeHtml(rel)}</div>` : ''}
      </div>`;
    }
    this.cards.innerHTML = html;
    if (!this.positioned) { this.center(this.focusId, false); this.positioned = true; }
  }

  setFocus(id, animate = true) {
    if (!this.people?.has(id)) return;
    this.focusId = id;
    for (const c of this.cards.querySelectorAll('.card.focus')) c.classList.remove('focus');
    this.cards.querySelector(`.card[data-id="${CSS.escape(id)}"]`)?.classList.add('focus');
    this.center(id, animate);
  }

  center(id, animate = true) {
    const pos = this.positions?.get(id);
    if (!pos) return;
    const r = this.viewport.getBoundingClientRect();
    this.tx = r.width / 2 - pos.x * this.scale;
    this.ty = r.height / 2 - pos.y * this.scale;
    this.apply(animate);
  }

  apply(animate) {
    this.world.style.transition = animate ? 'transform .35s ease' : 'none';
    this.world.style.transform = `translate(${this.tx}px,${this.ty}px) scale(${this.scale})`;
  }

  zoomAt(factor, cx, cy) {
    const ns = Math.min(2.5, Math.max(0.12, this.scale * factor));
    const f = ns / this.scale;
    this.tx = cx - (cx - this.tx) * f;
    this.ty = cy - (cy - this.ty) * f;
    this.scale = ns;
  }

  zoomBy(factor) {
    const r = this.viewport.getBoundingClientRect();
    this.zoomAt(factor, r.width / 2, r.height / 2);
    this.apply(true);
  }

  bindGestures() {
    const vp = this.viewport;
    const pts = new Map();
    let start = null; // {x,y,time,moved}
    let pinch = null;
    const local = (e) => { const r = vp.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

    vp.addEventListener('pointerdown', (e) => {
      vp.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, local(e));
      if (pts.size === 1) start = { ...local(e), time: Date.now(), moved: 0, target: e.target };
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y) };
        start = null;
      }
    });
    vp.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      const prev = pts.get(e.pointerId);
      const cur = local(e);
      pts.set(e.pointerId, cur);
      if (pts.size === 1) {
        this.tx += cur.x - prev.x; this.ty += cur.y - prev.y;
        if (start) start.moved += Math.abs(cur.x - prev.x) + Math.abs(cur.y - prev.y);
        this.apply(false);
      } else if (pts.size === 2 && pinch) {
        const [a, b] = [...pts.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        if (pinch.mid) { this.tx += mid.x - pinch.mid.x; this.ty += mid.y - pinch.mid.y; }
        this.zoomAt(dist / pinch.dist, mid.x, mid.y);
        pinch = { dist, mid };
        this.apply(false);
      }
    });
    const end = (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (start && pts.size === 0 && start.moved < 8 && Date.now() - start.time < 600) {
        const card = start.target.closest?.('.card');
        if (card) this.handleTap(card.dataset.id);
      }
      if (pts.size === 0) start = null;
    };
    vp.addEventListener('pointerup', end);
    vp.addEventListener('pointercancel', end);
    vp.addEventListener('wheel', (e) => {
      e.preventDefault();
      const p = local(e);
      this.zoomAt(Math.exp(-e.deltaY * 0.0015), p.x, p.y);
      this.apply(false);
    }, { passive: false });
  }

  markLinkFirst(id) {
    for (const c of this.cards.querySelectorAll('.card.link-first')) c.classList.remove('link-first');
    if (id) this.cards.querySelector(`.card[data-id="${CSS.escape(id)}"]`)?.classList.add('link-first');
  }

  handleTap(id) {
    if (this.linkMode) { this.onLinkTap(id); return; }
    if (id === this.focusId) this.onOpen(id);
    else this.setFocus(id);
  }
}

export { fullName };
