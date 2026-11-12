import { t, setLang, getLang, LANGS, formatDate, formatDateTime } from './i18n.js';
import { createStore, randomId } from './store.js';
import { fullName, describeRelation, childrenOf, siblingsOf, searchPeople } from './relations.js';
import { TreeView } from './tree.js';
import { MapView } from './map.js';
import { resizePhoto } from './photo.js';
import { escapeHtml as h, avatarHtml, yearsLabel, toast, confirmDialog, ICONS } from './ui.js';

const store = createStore();
let people = new Map();
let meId = null;
let tree = null;
let mapView = null;
let currentRoute = null;
let formDirty = false;

const $ = (sel, root = document) => root.querySelector(sel);
const app = $('#app');

// ------------------------------------------------------------------ io
function meKey() { return `me:${store.familyId}`; }
function loadMe() { try { return localStorage.getItem(meKey()); } catch { return null; } }
function saveMe(id) {
  meId = id;
  try { if (id) localStorage.setItem(meKey(), id); else localStorage.removeItem(meKey()); } catch { /* ignore */ }
}
function by() {
  const me = people.get(meId);
  return { id: meId, name: me ? fullName(me) : t('unknown') };
}

// ------------------------------------------------------------------ routing
function parseRoute() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, qs] = raw.split('?');
  const parts = path.split('/').filter(Boolean);
  return { name: parts[0] || 'tree', id: parts[1] ? decodeURIComponent(parts[1]) : null, q: new URLSearchParams(qs || '') };
}
export function go(hash) {
  if (location.hash === hash) render(); else location.hash = hash;
}

function onRoute() {
  formDirty = false;
  render();
}

function render() {
  const route = parseRoute();
  currentRoute = route;
  if (!meId || !people.has(meId)) {
    if (!(route.name === 'new' && route.q.get('self'))) return renderWho();
  }
  const tabs = ['tree', 'map', 'people', 'settings'];
  const isTab = tabs.includes(route.name);
  document.body.classList.toggle('with-tabs', isTab);
  $('#tabbar').classList.toggle('hidden', !isTab);
  for (const b of document.querySelectorAll('#tabbar button')) {
    b.classList.toggle('on', b.dataset.tab === route.name);
    b.querySelector('span').textContent = t(`tab${b.dataset.tab[0].toUpperCase()}${b.dataset.tab.slice(1)}`);
  }
  $('#screen-tree').classList.toggle('hidden', route.name !== 'tree');
  $('#screen-map').classList.toggle('hidden', route.name !== 'map');
  $('#screen-page').classList.toggle('hidden', ['tree', 'map'].includes(route.name));
  $('#screen-page').scrollTop = 0;

  switch (route.name) {
    case 'tree': return renderTree(route.id);
    case 'map': return renderMap();
    case 'people': return renderPeople();
    case 'settings': return renderSettings();
    case 'p': return renderProfile(route.id);
    case 'edit': return renderEdit(route.id, null);
    case 'new': return renderEdit(null, route.q);
    case 'history': return renderHistory(route.id);
    default: return go('#/tree');
  }
}

// ------------------------------------------------------------------ "Chi sei?"
function renderWho() {
  document.body.classList.remove('with-tabs');
  $('#tabbar').classList.add('hidden');
  $('#screen-tree').classList.add('hidden');
  $('#screen-map').classList.add('hidden');
  const page = $('#screen-page');
  page.classList.remove('hidden');
  const empty = people.size === 0;
  page.innerHTML = `
    <div class="who">
      <div class="who-logo">${ICONS.tree}</div>
      <h1>${h(t('whoAreYou'))}</h1>
      ${langPicker()}
      ${empty ? `<p class="muted">${h(t('emptyTreeHint'))}</p>
        <a class="btn primary block" href="#/new?self=1">${h(t('addMyself'))}</a>`
      : `<p class="muted">${h(t('whoAreYouHint'))}</p>
        <input id="who-q" class="input" type="search" autocomplete="off" placeholder="${h(t('typeFullName'))}">
        <div id="who-res" class="list"></div>
        <a class="btn ghost block" href="#/new?self=1">${h(t('notInTree'))}</a>`}
    </div>`;
  bindLangPicker(page, renderWho);
  const q = $('#who-q', page);
  if (!q) return;
  const res = $('#who-res', page);
  q.oninput = () => {
    const found = searchPeople(people, q.value).slice(0, 8);
    res.innerHTML = q.value.trim().length < 2 ? '' : found.length ? found.map((p) => `
      <div class="row">
        ${avatarHtml(p, 44)}
        <div class="row-main"><b>${h(fullName(p))}</b><small>${h(yearsLabel(p))}${p.birthPlace ? ' · ' + h(p.birthPlace.name) : ''}</small></div>
        <button class="btn primary small" data-me="${p.id}">${h(t('thisIsMe'))}</button>
      </div>`).join('') : `<p class="muted center">${h(t('notFound'))}</p>`;
  };
  res.onclick = (e) => {
    const id = e.target.closest('[data-me]')?.dataset.me;
    if (!id) return;
    saveMe(id);
    if (tree) tree.positioned = false;
    go('#/tree');
  };
  q.focus();
}

function langPicker() {
  return `<div class="lang-picker">${LANGS.map((l) => `<button data-lang="${l.code}" class="${l.code === getLang() ? 'on' : ''}" aria-label="${l.label}">${l.flag}</button>`).join('')}</div>`;
}
function bindLangPicker(root, after) {
  for (const b of root.querySelectorAll('[data-lang]')) {
    b.onclick = () => { setLang(b.dataset.lang); after ? after() : render(); };
  }
}

// ------------------------------------------------------------------ Albero
function renderTree(focusId) {
  const scr = $('#screen-tree');
  if (!tree) {
    scr.innerHTML = `
      <header class="topbar">
        <h1 class="title" id="tree-title"></h1>
        <button class="icon-btn" id="tree-me" aria-label="me">${ICONS.me}</button>
      </header>
      <div id="tree-host"></div>
      <div class="hint" id="tree-hint"></div>`;
    tree = new TreeView($('#tree-host', scr), { onOpen: (id) => go(`#/p/${id}`) });
    $('#tree-me', scr).onclick = () => tree.setFocus(meId);
  }
  $('#tree-title', scr).textContent = store.familyName && store.familyName !== 'Demo' ? store.familyName : t('appName');
  $('#tree-me', scr).title = t('centerMe');
  const hint = $('#tree-hint', scr);
  hint.textContent = t('tapHint');
  tree.render(people, meId, focusId);
  if (focusId) requestAnimationFrame(() => tree.setFocus(focusId, false));
  let shown = 0;
  try { shown = +localStorage.getItem('hintShown') || 0; } catch { /* ignore */ }
  hint.classList.toggle('hidden', shown >= 3);
  if (shown < 3) { try { localStorage.setItem('hintShown', shown + 1); } catch { /* ignore */ } }
}

// ------------------------------------------------------------------ Mappa
function renderMap() {
  const scr = $('#screen-map');
  if (!mapView) mapView = new MapView(scr, { onOpen: (id) => go(`#/p/${id}`) });
  mapView.show(people, meId).catch((e) => { console.error(e); toast('Map: ' + e.message); });
}

// ------------------------------------------------------------------ Persone
function renderPeople() {
  const page = $('#screen-page');
  const list = [...people.values()].sort((a, b) =>
    (a.lastName || '').localeCompare(b.lastName || '') || (a.firstName || '').localeCompare(b.firstName || ''));
  page.innerHTML = `
    <header class="topbar"><h1 class="title">${h(t('tabPeople'))}</h1><span class="muted">${h(t('peopleCount', { n: people.size }))}</span></header>
    <div class="pad"><input id="pq" class="input" type="search" placeholder="${h(t('searchPeople'))}"></div>
    <div id="plist" class="list"></div>
    <a class="fab" href="#/new" aria-label="${h(t('addPerson'))}">${ICONS.plus}</a>`;
  const draw = (q) => {
    const rows = q ? searchPeople(people, q) : list;
    $('#plist', page).innerHTML = rows.map((p) => personRow(p)).join('');
  };
  $('#pq', page).oninput = (e) => draw(e.target.value);
  draw('');
}

function personRow(p, extra = '') {
  const rel = describeRelation(people, meId, p.id);
  return `<a class="row" href="#/p/${p.id}">
    ${avatarHtml(p, 44)}
    <div class="row-main"><b>${h(fullName(p))}</b><small>${h(yearsLabel(p))}${rel ? ` · <span class="rel">${h(rel)}</span>` : ''}</small></div>
    ${extra}<span class="chev">›</span></a>`;
}

// ------------------------------------------------------------------ Profilo
function renderProfile(id) {
  const p = people.get(id);
  const page = $('#screen-page');
  if (!p) { page.innerHTML = `<p class="pad muted">${h(t('notFound'))}</p>`; return; }
  const rel = describeRelation(people, meId, id);
  const parents = (p.parents || []).map((x) => people.get(x)).filter(Boolean);
  const partner = p.partnerId && people.get(p.partnerId);
  const kids = childrenOf(people, id);
  const sibs = siblingsOf(people, id);
  const place = (pl) => (pl ? `${h(pl.name)}${typeof pl.lat === 'number' ? '' : ''}` : '—');
  const group = (label, arr) => `
    <h3 class="sub">${h(label)}</h3>
    ${arr.length ? `<div class="list inset">${arr.map((x) => personRow(x)).join('')}</div>` : `<p class="muted pad-x">${h(t('none'))}</p>`}`;

  page.innerHTML = `
    <header class="topbar">
      <button class="icon-btn" onclick="history.length > 1 ? history.back() : location.hash='#/tree'" aria-label="${h(t('back'))}">${ICONS.back}</button>
      <h1 class="title"></h1>
      <a class="icon-btn" href="#/edit/${id}" aria-label="${h(t('edit'))}">${ICONS.edit}</a>
    </header>
    <div class="profile-head">
      ${avatarHtml(p, 132)}
      <h2>${h(fullName(p))}</h2>
      ${rel && id !== meId ? `<span class="badge">${h(rel)}</span>` : ''}
      ${id === meId ? `<span class="badge">${h(t('you'))}</span>` : ''}
    </div>
    <div class="card-block">
      <dl class="facts">
        <dt>${h(t('sex'))}</dt><dd>${h(p.sex === 'F' ? t('female') : t('male'))}</dd>
        <dt>${h(t('birthDate'))}</dt><dd>${h(formatDate(p.birth)) || '—'}</dd>
        <dt>${h(t('birthPlace'))}</dt><dd>${place(p.birthPlace)}</dd>
        ${p.alive === false
          ? `<dt>${h(t('deathDate'))}</dt><dd>${h(formatDate(p.death)) || '—'}</dd>`
          : `<dt>${h(t('death'))}</dt><dd><span class="alive-dot"></span>${h(t('alive'))}</dd>`}
        <dt>${h(t('residence'))}</dt><dd>${place(p.residence)}</dd>
      </dl>
    </div>
    <h3 class="sub">${h(t('notes'))}</h3>
    <div class="card-block notes">${p.notes ? h(p.notes).replace(/\n/g, '<br>') : `<span class="muted">${h(t('noNotes'))}</span>`}</div>
    ${group(t('parents'), parents)}
    ${group(t('partner'), partner ? [partner] : [])}
    ${group(t('children'), kids)}
    ${group(t('siblings'), sibs)}
    <h3 class="sub">${h(t('addRelative'))}</h3>
    <div class="add-grid">
      <button data-add="parent">${ICONS.plus}${h(t('addParent'))}</button>
      <button data-add="partner">${ICONS.plus}${h(t('addPartner'))}</button>
      <button data-add="child">${ICONS.plus}${h(t('addChild'))}</button>
      <button data-add="sibling">${ICONS.plus}${h(t('addSibling'))}</button>
    </div>
    <div class="pad">
      <a class="btn ghost block" href="#/tree/${id}">${ICONS.tree}${h(t('showInTree'))}</a>
    </div>
    ${store.isOwner() ? `<div class="pad"><button class="btn danger block" id="pdel">${h(t('delete'))}</button></div>` : ''}
    <div class="meta pad">
      ${p.createdBy ? `<div>${h(t('createdBy', { who: p.createdBy.name, when: formatDateTime(p.createdAt) }))}</div>` : ''}
      ${p.updatedBy ? `<div>${h(t('lastEdit', { who: p.updatedBy.name, when: formatDateTime(p.updatedAt) }))}</div>` : ''}
      <a href="#/history/${id}">${ICONS.history}${h(t('history'))}</a>
    </div>`;
  const pdel = $('#pdel', page);
  if (pdel) pdel.onclick = () => deletePersonFlow(p);
  for (const b of page.querySelectorAll('[data-add]')) {
    b.onclick = () => {
      const kind = b.dataset.add;
      if (kind === 'parent' && (p.parents || []).length >= 2) return toast(t('maxParents'));
      if (kind === 'sibling' && !(p.parents || []).length) return toast(t('siblingNeedsParent'), 3500);
      go(`#/new?rel=${kind}&of=${id}`);
    };
  }
}

// ------------------------------------------------------------------ Modifica / nuova persona
function dateFields(prefix, date, requiredYear) {
  const days = ['<option value="">—</option>', ...Array.from({ length: 31 }, (_, i) => `<option ${date?.d === i + 1 ? 'selected' : ''}>${i + 1}</option>`)];
  const months = ['<option value="">—</option>', ...t('months').map((m, i) => `<option value="${i + 1}" ${date?.m === i + 1 ? 'selected' : ''}>${h(m)}</option>`)];
  return `<div class="date-row">
    <label class="f-day"><small>${h(t('day'))}</small><select name="${prefix}d" class="input">${days.join('')}</select></label>
    <label class="f-month"><small>${h(t('month'))}</small><select name="${prefix}m" class="input">${months.join('')}</select></label>
    <label class="f-year"><small>${h(t('year'))}${requiredYear ? ' *' : ''}</small><input name="${prefix}y" class="input" type="number" inputmode="numeric" min="1000" max="${new Date().getFullYear()}" value="${date?.y || ''}"></label>
  </div>`;
}

function placeField(name, label, value) {
  return `<div class="field place" data-place="${name}">
    <label><small>${h(label)}</small></label>
    <div class="place-row">
      <input class="input" type="text" autocomplete="off" placeholder="${h(t('searchPlace'))}" value="${h(value?.name || '')}">
      <button type="button" class="btn ghost small" data-psearch>${ICONS.search}</button>
    </div>
    <div class="place-status ${value && typeof value.lat !== 'number' && value.name ? '' : 'hidden'}">${h(t('placeNoCoords'))}</div>
    <div class="place-results"></div>
  </div>`;
}

function personOptions(selectedId, excludeIds) {
  const list = [...people.values()].filter((p) => !excludeIds.includes(p.id))
    .sort((a, b) => fullName(a).localeCompare(fullName(b)));
  return `<option value="">${h(t('none'))}</option>` + list.map((p) =>
    `<option value="${p.id}" ${p.id === selectedId ? 'selected' : ''}>${h(fullName(p))}${p.birth?.y ? ` (${p.birth.y})` : ''}</option>`).join('');
}

function renderEdit(id, q) {
  const page = $('#screen-page');
  const existing = id ? people.get(id) : null;
  if (id && !existing) return go('#/people');
  const isSelf = q?.get('self');
  const rel = q?.get('rel');
  const of = q?.get('of') ? people.get(q.get('of')) : null;

  // Valori iniziali
  const p = existing ? structuredClone(existing) : {
    id: randomId(), firstName: '', lastName: '', sex: '', birth: null, birthPlace: null,
    alive: true, death: null, residence: null, notes: '', photo: null, parents: [], partnerId: null,
  };
  if (!existing && of) {
    if (rel === 'partner') {
      p.partnerId = of.id;
      p.sex = of.sex === 'M' ? 'F' : 'M';
    } else if (rel === 'child') {
      p.parents = [of.id, of.partnerId].filter(Boolean);
      const father = p.parents.map((x) => people.get(x)).find((x) => x?.sex === 'M');
      p.lastName = (father || of).lastName || '';
    } else if (rel === 'sibling') {
      p.parents = [...(of.parents || [])];
      p.lastName = of.lastName || '';
    } else if (rel === 'parent') {
      const other = (of.parents || []).map((x) => people.get(x)).find(Boolean);
      if (other) {
        p.sex = other.sex === 'M' ? 'F' : 'M';
        if (!other.partnerId) p.partnerId = other.id;
      }
    }
  }
  const title = existing ? fullName(existing) : t('newPerson');
  const exclude = [p.id];

  page.innerHTML = `
    <header class="topbar">
      <button class="icon-btn" data-cancel aria-label="${h(t('cancel'))}">${ICONS.back}</button>
      <h1 class="title">${h(title)}</h1>
      <span></span>
    </header>
    <form id="ef" class="form" novalidate>
      <div class="photo-edit">
        <div id="ph-prev">${avatarHtml(p, 112)}</div>
        <div class="photo-btns">
          <label class="btn ghost small">${ICONS.camera}<span>${h(p.photo ? t('changePhoto') : t('addPhoto'))}</span>
            <input type="file" accept="image/*" id="ph-in" hidden></label>
          <button type="button" class="btn ghost small ${p.photo ? '' : 'hidden'}" id="ph-rm">${h(t('removePhoto'))}</button>
        </div>
      </div>

      <div class="field"><label><small>${h(t('firstName'))} *</small><input name="firstName" class="input" value="${h(p.firstName)}" autocomplete="off"></label></div>
      <div class="field"><label><small>${h(t('lastName'))}</small><input name="lastName" class="input" value="${h(p.lastName)}" autocomplete="off"></label></div>

      <div class="field"><small>${h(t('sex'))} *</small>
        <div class="segmented" id="sex">
          <button type="button" data-v="M" class="${p.sex === 'M' ? 'on' : ''}">${h(t('male'))}</button>
          <button type="button" data-v="F" class="${p.sex === 'F' ? 'on' : ''}">${h(t('female'))}</button>
        </div>
      </div>

      <fieldset><legend>${h(t('birth'))}</legend>
        ${dateFields('b', p.birth, true)}
        ${placeField('birthPlace', t('birthPlace'), p.birthPlace)}
      </fieldset>

      <fieldset><legend>${h(t('death'))}</legend>
        <label class="switch"><input type="checkbox" id="alive" ${p.alive !== false ? 'checked' : ''}><span></span>${h(t('alive'))}</label>
        <div id="death-box" class="${p.alive !== false ? 'hidden' : ''}">${dateFields('d', p.death, false)}</div>
      </fieldset>

      ${placeField('residence', t('residence'), p.residence)}

      <fieldset><legend>${h(t('family'))}</legend>
        <div class="field"><label><small>${h(t('parents'))} 1</small><select name="par0" class="input">${personOptions(p.parents[0], exclude)}</select></label></div>
        <div class="field"><label><small>${h(t('parents'))} 2</small><select name="par1" class="input">${personOptions(p.parents[1], exclude)}</select></label></div>
        <div class="field"><label><small>${h(t('partner'))}</small><select name="partnerId" class="input">${personOptions(p.partnerId, exclude)}</select></label></div>
      </fieldset>

      <div class="field"><label><small>${h(t('notes'))}</small><textarea name="notes" class="input" rows="5">${h(p.notes)}</textarea></label></div>

      <div class="form-error hidden" id="ferr"></div>
      ${existing && store.isOwner() ? `<button type="button" class="btn danger block" id="del">${h(t('delete'))}</button>` : ''}
      <div class="save-bar">
        <button type="button" class="btn ghost" data-cancel>${h(t('cancel'))}</button>
        <button type="submit" class="btn primary">${h(t('save'))}</button>
      </div>
    </form>`;

  const form = $('#ef', page);
  const places = { birthPlace: p.birthPlace, residence: p.residence };
  let photo = p.photo;
  let sex = p.sex;

  form.addEventListener('input', () => { formDirty = true; });
  for (const b of page.querySelectorAll('[data-cancel]')) {
    b.onclick = () => { formDirty = false; existing ? go(`#/p/${existing.id}`) : history.back(); };
  }
  for (const b of $('#sex', form).querySelectorAll('button')) {
    b.onclick = () => {
      sex = b.dataset.v; formDirty = true;
      for (const x of $('#sex', form).querySelectorAll('button')) x.classList.toggle('on', x === b);
    };
  }
  $('#alive', form).onchange = (e) => $('#death-box', form).classList.toggle('hidden', e.target.checked);

  // Foto
  $('#ph-in', form).onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      photo = await resizePhoto(file);
      formDirty = true;
      $('#ph-prev', form).innerHTML = avatarHtml({ ...p, photo }, 112);
      $('#ph-rm', form).classList.remove('hidden');
    } catch (err) { toast(String(err)); }
  };
  $('#ph-rm', form).onclick = () => {
    photo = null; formDirty = true;
    $('#ph-prev', form).innerHTML = avatarHtml({ ...p, photo: null, firstName: form.firstName.value, lastName: form.lastName.value }, 112);
    $('#ph-rm', form).classList.add('hidden');
  };

  // Luoghi
  for (const box of form.querySelectorAll('[data-place]')) {
    const key = box.dataset.place;
    const input = $('input', box);
    const status = $('.place-status', box);
    const results = $('.place-results', box);
    input.oninput = () => {
      places[key] = input.value.trim() ? { name: input.value.trim() } : null;
      status.classList.toggle('hidden', !input.value.trim());
      results.innerHTML = '';
    };
    const doSearch = async () => {
      const qv = input.value.trim();
      if (qv.length < 2) return;
      results.innerHTML = `<div class="muted small pad-x">${h(t('loading'))}</div>`;
      try {
        const found = await geocode(qv);
        results.innerHTML = found.length ? found.map((r, i) =>
          `<button type="button" class="place-opt" data-i="${i}">${ICONS.pin}<span>${h(r.name)}<small>${h(r.full)}</small></span></button>`).join('')
          : `<div class="muted small pad-x">${h(t('noPlaceResults'))}</div>`;
        for (const b of results.querySelectorAll('[data-i]')) {
          b.onclick = () => {
            const r = found[+b.dataset.i];
            places[key] = { name: r.name, lat: r.lat, lng: r.lng };
            input.value = r.name;
            status.classList.add('hidden');
            results.innerHTML = '';
            formDirty = true;
          };
        }
      } catch {
        results.innerHTML = `<div class="muted small pad-x">${h(t('placeSearchError'))}</div>`;
      }
    };
    $('[data-psearch]', box).onclick = doSearch;
    input.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); doSearch(); } };
  }

  // Elimina (solo organizzatore)
  const del = $('#del', form);
  if (del) {
    del.onclick = () => { formDirty = false; deletePersonFlow(existing); };
  }

  // Salva
  form.onsubmit = async (e) => {
    e.preventDefault();
    const err = $('#ferr', form);
    const fd = new FormData(form);
    const readDate = (pre) => {
      const y = +fd.get(`${pre}y`) || null;
      const m = +fd.get(`${pre}m`) || null;
      const d = +fd.get(`${pre}d`) || null;
      return y ? { y, m, d: m ? d : null } : null;
    };
    const birth = readDate('b');
    const death = readDate('d');
    const alive = $('#alive', form).checked;
    const fail = (msg) => { err.textContent = msg; err.classList.remove('hidden'); err.scrollIntoView({ behavior: 'smooth', block: 'center' }); };
    const year = new Date().getFullYear();
    if (!fd.get('firstName').trim()) return fail(t('nameRequired'));
    if (!sex) return fail(t('sexRequired'));
    if (!birth) return fail(t('yearRequired'));
    const validDate = (dt) => !dt || (dt.y >= 1000 && dt.y <= year && (!dt.d || new Date(Date.UTC(dt.y, dt.m - 1, dt.d)).getUTCDate() === dt.d));
    if (!validDate(birth) || (!alive && !validDate(death)) || (!alive && death && death.y < birth.y)) return fail(t('invalidDate'));

    const person = {
      ...p,
      firstName: fd.get('firstName'),
      lastName: fd.get('lastName'),
      sex,
      birth,
      birthPlace: places.birthPlace,
      alive,
      death: alive ? null : death,
      residence: places.residence,
      notes: fd.get('notes'),
      photo,
      parents: [fd.get('par0'), fd.get('par1')].filter(Boolean),
      partnerId: fd.get('partnerId') || null,
    };
    const submit = form.querySelector('[type=submit]');
    submit.disabled = true;
    try {
      const author = isSelf ? { id: person.id, name: `${person.firstName} ${person.lastName}`.trim() } : by();
      const saved = await store.savePerson(person, author);
      if (!existing && rel === 'parent' && of) {
        const child = people.get(of.id);
        if (child && (child.parents || []).length < 2 && !(child.parents || []).includes(saved.id)) {
          await store.savePerson({ ...child, parents: [...(child.parents || []), saved.id] }, author);
        }
      }
      if (isSelf) { saveMe(saved.id); if (tree) tree.positioned = false; }
      formDirty = false;
      toast(navigator.onLine ? t('saved') : t('offline'), 3000);
      history.replaceState(null, '', `#/p/${saved.id}`);
      render();
    } catch (e2) {
      console.error(e2);
      fail(t('saveError', { e: e2.message }));
    } finally {
      submit.disabled = false;
    }
  };
}

async function deletePersonFlow(person) {
  if (!await confirmDialog(t('deleteConfirm', { n: fullName(person) }), t('delete'), true)) return;
  try {
    const author = by();
    await store.deletePerson(person.id, author);
    if (person.id === meId) saveMe(null);
    toast(t('deleted', { n: fullName(person) }));
    go('#/people');
  } catch (e) { toast(t('saveError', { e: e.message })); }
}

// Ricerca luoghi gratuita (OpenStreetMap Nominatim). Un utilizzo leggero,
// solo su pressione del tasto "Cerca", rispetta le loro regole d'uso.
async function geocode(q) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&addressdetails=1&accept-language=${getLang()}&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(res.status);
  const data = await res.json();
  return data.map((r) => {
    const a = r.address || {};
    const local = a.city || a.town || a.village || a.hamlet || a.municipality || a.suburb || a.county || a.state || r.name;
    const name = [local, a.country].filter(Boolean).join(', ') || r.display_name;
    return { name, full: r.display_name, lat: +r.lat, lng: +r.lon };
  });
}

// ------------------------------------------------------------------ Cronologia
async function renderHistory(personId) {
  const page = $('#screen-page');
  const target = personId && people.get(personId);
  page.innerHTML = `
    <header class="topbar">
      <button class="icon-btn" onclick="history.back()" aria-label="${h(t('back'))}">${ICONS.back}</button>
      <h1 class="title">${h(personId ? t('history') : t('recentChanges'))}</h1><span></span>
    </header>
    ${target ? `<p class="pad muted">${h(fullName(target))}</p>` : ''}
    <div id="hl" class="list"><p class="pad muted">${h(t('loading'))}</p></div>`;
  let entries = [];
  try { entries = await store.history(personId); } catch (e) {
    $('#hl', page).innerHTML = `<p class="pad muted">${h(e.message)}</p>`; return;
  }
  const act = { create: 'actCreate', update: 'actUpdate', delete: 'actDelete', restore: 'actRestore' };
  $('#hl', page).innerHTML = entries.map((e, i) => {
    const s = e.snapshot || {};
    const canRestore = s.id && (e.action === 'delete' ? !people.has(s.id) : i > 0 || !personId);
    return `<div class="row hist">
      ${avatarHtml(s, 40)}
      <div class="row-main">
        <b>${h(e.by?.name || t('unknown'))}</b> <span>${h(t(act[e.action] || 'actUpdate'))}</span> <b>${h(fullName(s))}</b>
        <small>${h(formatDateTime(e.at))}${s.birth?.y ? ` · ${h(yearsLabel(s))}` : ''}${s.birthPlace ? ` · ${h(s.birthPlace.name)}` : ''}</small>
      </div>
      ${canRestore ? `<button class="btn ghost small" data-r="${i}">${h(t('restore'))}</button>` : ''}
    </div>`;
  }).join('') || `<p class="pad muted">—</p>`;
  for (const b of page.querySelectorAll('[data-r]')) {
    b.onclick = async () => {
      if (!await confirmDialog(t('restoreConfirm'), t('restore'))) return;
      const entry = entries[+b.dataset.r];
      try {
        await store.restore(entry, by());
        toast(t('restored'));
        go(`#/p/${entry.snapshot.id}`);
      } catch (e) { toast(t('saveError', { e: e.message })); }
    };
  }
}

// ------------------------------------------------------------------ Impostazioni
function renderSettings() {
  const page = $('#screen-page');
  const me = people.get(meId);
  const link = store.shareLink();
  page.innerHTML = `
    <header class="topbar"><h1 class="title">${h(t('tabSettings'))}</h1></header>
    ${store.isDemo ? `<div class="banner"><b>${h(t('demoMode'))}</b> — ${h(t('demoHint'))}</div>` : ''}

    <h3 class="sub">${h(t('language'))}</h3>
    <div class="pad-x">${langPicker()}</div>

    <h3 class="sub">${h(t('you'))}</h3>
    <div class="list inset">${me ? personRow(me) : ''}</div>
    <div class="pad-x"><button class="btn ghost small" id="chg-me">${h(t('changeWho'))}</button></div>

    <h3 class="sub">${h(t('shareLink'))}</h3>
    <div class="card-block">
      <p class="muted small">${h(t('shareHint'))}</p>
      <div class="link-box"><input class="input" readonly value="${h(link)}"><button class="btn primary small" id="copy">${h(t('copy'))}</button></div>
    </div>

    <h3 class="sub">${h(t('recentChanges'))}</h3>
    <div class="pad-x"><a class="btn ghost small" href="#/history">${ICONS.history}${h(t('history'))}</a></div>

    <h3 class="sub">${h(t('backup'))}</h3>
    <div class="card-block">
      <p class="muted small">${h(t('backupHint'))}</p>
      <div class="btn-row">
        <button class="btn primary small" id="exp">${h(t('backup'))}</button>
        ${store.isOwner() ? `<label class="btn ghost small">${h(t('importBackup'))}<input type="file" accept="application/json,.json" id="imp" hidden></label>` : ''}
      </div>
    </div>

    <h3 class="sub">${h(t('organizer'))}</h3>
    <div class="card-block">
      <p class="muted small">${h(t('organizerHint'))}</p>
      ${store.isDemo
        ? `<p>${h(t('youAreOrganizer'))}</p>
           <div class="btn-row">
             <button class="btn danger small" id="clear">${h(t('clearDemo'))}</button>
             <button class="btn ghost small" id="reset">${h(t('resetDemo'))}</button>
           </div>`
        : store.signedInUser?.()
          ? `<p>${h(store.isOwner() ? t('youAreOrganizer') : t('notOrganizer'))}<br><small class="muted">${h(store.signedInUser().email || '')}</small></p>
             <button class="btn ghost small" id="signout">${h(t('signOut'))}</button>`
          : `<button class="btn ghost small" id="signin">${h(t('signIn'))}</button>`}
    </div>
    <p class="center muted small pad">v1.0</p>`;

  bindLangPicker(page);
  $('#chg-me', page).onclick = () => { saveMe(null); render(); };
  $('#copy', page).onclick = async () => {
    try {
      if (navigator.share) await navigator.share({ title: t('appName'), url: link });
      else { await navigator.clipboard.writeText(link); toast(t('copied')); }
    } catch {
      try { await navigator.clipboard.writeText(link); toast(t('copied')); } catch { /* ignore */ }
    }
  };
  $('#exp', page).onclick = () => {
    const data = JSON.stringify({ exportedAt: new Date().toISOString(), familyId: store.familyId, people: [...people.values()] }, null, 2);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    a.download = `albero-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const imp = $('#imp', page);
  if (imp) {
    imp.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const json = JSON.parse(await file.text());
        const list = Array.isArray(json) ? json : json.people;
        if (!Array.isArray(list)) throw new Error('formato non valido');
        if (!await confirmDialog(t('importConfirm'), t('importBackup'))) return;
        await store.importAll(list, by());
        toast(t('imported', { n: list.length }));
      } catch (err) { toast(t('saveError', { e: err.message })); }
    };
  }
  const reset = $('#reset', page);
  if (reset) reset.onclick = async () => { if (await confirmDialog(t('resetDemo') + '?', 'OK', true)) { store.reset(); toast('OK'); } };
  const clear = $('#clear', page);
  if (clear) {
    clear.onclick = async () => {
      if (!await confirmDialog(t('clearDemoConfirm'), t('clearDemo'), true)) return;
      store.clearAll();
      saveMe(null);
      if (tree) tree.positioned = false;
      go('#/tree');
    };
  }
  const si = $('#signin', page);
  if (si) si.onclick = async () => { try { await store.signIn(); } catch (e) { toast(e.message); } renderSettings(); };
  const so = $('#signout', page);
  if (so) so.onclick = async () => { await store.signOut(); renderSettings(); };
}

// ------------------------------------------------------------------ Schermate senza famiglia
function renderNeedFamily() {
  let last = null;
  try { last = localStorage.getItem('lastFamily'); } catch { /* ignore */ }
  if (last) { location.replace(`${location.pathname}?f=${last}`); return; }
  app.innerHTML = `<div class="who">
    <div class="who-logo">${ICONS.tree}</div>
    <h1>${h(t('createFamily'))}</h1>
    ${langPicker()}
    <p class="muted">${h(t('createFamilyHint'))}</p>
    <input id="fname" class="input" placeholder="${h(t('familyName'))}">
    <button class="btn primary block" id="create">${h(t('signIn'))}</button>
  </div>`;
  bindLangPicker(app, renderNeedFamily);
  $('#create').onclick = async () => {
    try {
      const id = await store.createFamily($('#fname').value.trim());
      location.replace(`${location.pathname}?f=${id}`);
    } catch (e) { toast(e.message, 5000); }
  };
}

function renderNoFamily() {
  try { localStorage.removeItem('lastFamily'); } catch { /* ignore */ }
  app.innerHTML = `<div class="who"><div class="who-logo">${ICONS.tree}</div>${langPicker()}<p>${h(t('noFamily'))}</p></div>`;
  bindLangPicker(app, renderNoFamily);
}

// ------------------------------------------------------------------ Avvio
async function boot() {
  setLang(getLang());
  app.innerHTML = `<div class="who"><div class="who-logo spin">${ICONS.tree}</div><p class="muted">${h(t('loading'))}</p></div>`;
  let res;
  try {
    res = await store.init();
  } catch (e) {
    console.error(e);
    app.innerHTML = `<div class="who"><p>${h(e.message)}</p></div>`;
    return;
  }
  if (res.status === 'needFamily') return renderNeedFamily();
  if (res.status === 'noFamily') return renderNoFamily();

  app.innerHTML = `
    <main id="screen-tree" class="screen hidden"></main>
    <main id="screen-map" class="screen hidden"></main>
    <main id="screen-page" class="screen page hidden"></main>
    <nav id="tabbar" class="hidden">
      ${['tree', 'map', 'people', 'settings'].map((tab) => `<button data-tab="${tab}">${ICONS[tab]}<span></span></button>`).join('')}
    </nav>`;
  for (const b of document.querySelectorAll('#tabbar button')) b.onclick = () => go(`#/${b.dataset.tab}`);

  meId = loadMe();
  store.onPeople((map) => {
    people = map;
    if (meId && !people.has(meId) && people.size) { /* la persona "io" è stata eliminata */ saveMe(null); }
    // Non ridisegnare mentre si sta compilando un modulo
    if (currentRoute?.name === 'edit' || currentRoute?.name === 'new') return;
    if (currentRoute) render();
  });
  store.onAuth(() => { if (currentRoute?.name === 'settings') renderSettings(); });
  window.addEventListener('hashchange', onRoute);
  render();
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

boot();
