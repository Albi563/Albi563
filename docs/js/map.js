// Mappa geopolitica del mondo, disegnata dall'app stessa con i confini
// degli Stati (Natural Earth): non dipende da servizi esterni, quindi
// funziona sempre, anche offline. Sopra ci sono i familiari, raggruppati
// in un numero quando ci si allontana e separati quando si ingrandisce.
// Facoltativo: il livello "Strade" aggiunge le mappe dettagliate online.
import { t, getLang } from './i18n.js';
import { fullName, describeRelation } from './relations.js';
import { escapeHtml, avatarHtml, yearsLabel } from './ui.js';

const LEAFLET = 'vendor/leaflet';
const WORLD = 'vendor/world';
let libsPromise;

// Colori tenui da carta politica; Stati confinanti hanno colori diversi.
const PALETTE = ['#f1e2b3', '#d4e6c3', '#f2cfc4', '#d3dcf1', '#e6d3e8', '#f6dcbf', '#cfe7e3'];

function loadCss(href) {
  const l = document.createElement('link');
  l.rel = 'stylesheet'; l.href = href;
  document.head.appendChild(l);
}
function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = () => rej(new Error(`load ${src}`));
    document.head.appendChild(s);
  });
}
function loadLibs() {
  if (!libsPromise) {
    loadCss(`${LEAFLET}/leaflet.css`);
    loadCss(`${LEAFLET}/MarkerCluster.css`);
    libsPromise = loadScript(`${LEAFLET}/leaflet.js`)
      .then(() => Promise.all([
        loadScript(`${LEAFLET}/leaflet.markercluster.js`),
        loadScript(`${WORLD}/topojson-client.min.js`),
      ]));
  }
  return libsPromise;
}
async function loadJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}

// ---------- geometria per le etichette ----------
function ringArea(ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  return Math.abs(a / 2);
}
function ringCentroid(ring) {
  let x = 0; let y = 0; let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const f = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    x += (ring[j][0] + ring[i][0]) * f; y += (ring[j][1] + ring[i][1]) * f; a += f * 3;
  }
  return a ? [x / a, y / a] : ring[0];
}
function largestRing(geom) {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
  let best = null; let bestA = 0;
  for (const p of polys) { const a = ringArea(p[0]); if (a > bestA) { bestA = a; best = p[0]; } }
  return best;
}

/** Evita le strisce orizzontali: i poligoni che attraversano la linea del
 *  cambio di data (Russia, Figi…) vengono resi continui oltre ±180°. */
function unwrapGeometry(geom) {
  const fixRing = (ring) => {
    const out = [ring[0].slice()];
    let shift = 0;
    for (let i = 1; i < ring.length; i++) {
      const prev = ring[i - 1][0]; const cur = ring[i][0];
      if (cur - prev > 180) shift -= 360; else if (prev - cur > 180) shift += 360;
      out.push([cur + shift, ring[i][1]]);
    }
    return out;
  };
  const fixPoly = (poly) => {
    const rings = poly.map(fixRing);
    // se tutto il poligono è finito oltre il bordo, riportalo indietro
    const mean = rings[0].reduce((s, p) => s + p[0], 0) / rings[0].length;
    const k = mean > 180 ? -360 : mean < -180 ? 360 : 0;
    return k ? rings.map((r) => r.map(([x, y]) => [x + k, y])) : rings;
  };
  if (geom.type === 'Polygon') return { ...geom, coordinates: fixPoly(geom.coordinates) };
  if (geom.type === 'MultiPolygon') return { ...geom, coordinates: geom.coordinates.map(fixPoly) };
  return geom;
}

function toFeatures(topo) {
  const geo = window.topojson.feature(topo, topo.objects.countries);
  geo.features = geo.features
    .filter((f) => f.id !== '010') // Antartide
    .map((f) => ({ ...f, geometry: unwrapGeometry(f.geometry) }));
  return geo;
}

export class MapView {
  constructor(container, { onOpen }) {
    this.el = container;
    this.onOpen = onOpen;
    this.mode = 'born';
    this.el.innerHTML = `
      <div class="map-canvas"></div>
      <div class="map-toggle segmented">
        <button data-m="born" class="on"></button>
        <button data-m="lives"></button>
      </div>
      <div class="map-tools">
        <button class="round" data-z="in" aria-label="Zoom +">＋</button>
        <button class="round" data-z="out" aria-label="Zoom −">－</button>
        <button class="round" data-z="fit" aria-label="Tutti">⤢</button>
      </div>
      <button class="map-base"></button>
      <div class="map-empty hidden"></div>
      <div class="map-loading">${escapeHtml(t('loading'))}</div>`;
    this.canvas = this.el.querySelector('.map-canvas');
    this.empty = this.el.querySelector('.map-empty');
    for (const b of this.el.querySelectorAll('[data-m]')) {
      b.onclick = () => {
        this.mode = b.dataset.m;
        for (const x of this.el.querySelectorAll('[data-m]')) x.classList.toggle('on', x === b);
        this.draw(true);
      };
    }
    this.el.querySelector('[data-z=in]').onclick = () => this.map?.zoomIn();
    this.el.querySelector('[data-z=out]').onclick = () => this.map?.zoomOut();
    this.el.querySelector('[data-z=fit]').onclick = () => this.fitAll();
    this.el.querySelector('.map-base').onclick = () => this.setStreets(!this.streetsOn);
    this.el.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-open]');
      if (btn) this.onOpen(btn.dataset.open);
    });
  }

  async show(people, meId) {
    this.people = people;
    this.meId = meId;
    this.el.querySelector('[data-m=born]').textContent = t('mapBorn');
    this.el.querySelector('[data-m=lives]').textContent = t('mapLives');
    await loadLibs();
    if (!this.map) await this.createMap();
    setTimeout(() => this.map.invalidateSize(), 50);
    if (this.lang !== getLang()) this.buildLabels();
    this.setStreets(this.streetsOn);
    this.draw(this.firstFit);
    this.firstFit = false;
  }

  async createMap() {
    const L = window.L;
    this.map = L.map(this.canvas, {
      zoomControl: false,
      minZoom: 2, maxZoom: 11, zoomSnap: 0.5,
      worldCopyJump: false,
      maxBounds: [[-75, -220], [86, 220]], maxBoundsViscosity: 0.9,
      attributionControl: true,
    }).setView([42, 12], 3);
    this.map.attributionControl.setPrefix(false);
    this.map.attributionControl.addAttribution('Natural Earth · GeoNames');
    this.renderer = L.canvas({ padding: 0.4 });
    this.map.createPane('labels');
    this.map.getPane('labels').style.zIndex = 450;
    this.map.getPane('labels').style.pointerEvents = 'none';

    // Reticolo di meridiani e paralleli (effetto mappamondo)
    const grid = [];
    for (let lat = -60; lat <= 80; lat += 20) grid.push([[lat, -180], [lat, 180]]);
    for (let lng = -180; lng <= 180; lng += 20) grid.push([[-85, lng], [85, lng]]);
    L.polyline(grid, { color: '#ffffff', weight: 0.8, opacity: 0.45, interactive: false, renderer: this.renderer }).addTo(this.map);

    const [topo, iso, cities] = await Promise.all([
      loadJson(`${WORLD}/countries-50m.json`),
      loadJson(`${WORLD}/iso-numeric.json`),
      loadJson(`${WORLD}/cities.json`).catch(() => []),
    ]);
    this.cities = cities;
    this.cityLayer = L.layerGroup().addTo(this.map);
    this.iso = { ...iso, Kosovo: 'XK' };
    this.colors = this.colorCountries(topo);
    this.countries = this.countryLayer(topo).addTo(this.map);
    this.buildLabels(topo);
    this.el.querySelector('.map-loading').remove();

    // Confini più dettagliati quando si ingrandisce
    this.map.on('zoomend', () => {
      if (this.map.getZoom() >= 5 && !this.detailRequested) {
        this.detailRequested = true;
        loadJson(`${WORLD}/countries-10m.json`).then((t10) => {
          const layer = this.countryLayer(t10).addTo(this.map);
          this.map.removeLayer(this.countries);
          this.countries = layer;
        }).catch((e) => console.warn(e));
      }
    });
    this.map.on('zoomend moveend', () => this.placeLabels());

    this.cluster = L.markerClusterGroup({
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      maxClusterRadius: 50,
      iconCreateFunction: (c) => L.divIcon({
        html: `<div class="cluster-bubble">${c.getChildCount()}</div>`,
        className: 'cluster-icon', iconSize: [44, 44],
      }),
    });
    this.map.addLayer(this.cluster);

    // Livello facoltativo con strade e città (servizio online gratuito)
    this.streets = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 20, subdomains: 'abcd',
      attribution: '&copy; OpenStreetMap &copy; CARTO',
    });
    try { this.streetsOn = localStorage.getItem('mapStreets') === '1'; } catch { this.streetsOn = false; }
    this.firstFit = true;
  }

  countryKey(f) { return f.id || f.properties?.name; }

  colorCountries(topo) {
    const geoms = topo.objects.countries.geometries;
    const nb = window.topojson.neighbors(geoms);
    const colors = new Map();
    const idx = new Array(geoms.length).fill(-1);
    // Stati con più vicini per primi: colorazione "greedy"
    const order = geoms.map((_, i) => i).sort((a, b) => nb[b].length - nb[a].length);
    for (const i of order) {
      const used = new Set(nb[i].map((j) => idx[j]));
      let c = 0;
      while (used.has(c)) c++;
      idx[i] = c % PALETTE.length;
      colors.set(this.countryKey({ id: geoms[i].id, properties: geoms[i].properties }), PALETTE[idx[i]]);
    }
    return colors;
  }

  countryLayer(topo) {
    const L = window.L;
    const geo = toFeatures(topo);
    return L.geoJSON(geo, {
      renderer: this.renderer,
      interactive: false,
      smoothFactor: 1.2,
      style: (f) => ({
        fillColor: this.colors.get(this.countryKey(f)) || PALETTE[0],
        fillOpacity: 1,
        color: '#8f8a7e',
        weight: 0.7,
        opacity: 0.9,
      }),
    });
  }

  buildLabels(topo) {
    const L = window.L;
    if (topo) this.topoForLabels = topo;
    if (!this.topoForLabels) return;
    this.lang = getLang();
    if (this.labelLayer) this.map.removeLayer(this.labelLayer);
    let names = null;
    try { names = new Intl.DisplayNames([this.lang], { type: 'region' }); } catch { /* vecchi browser */ }
    const geo = toFeatures(this.topoForLabels);
    this.labels = [];
    for (const f of geo.features) {
      const ring = largestRing(f.geometry);
      if (!ring) continue;
      const code = this.iso[f.id] || this.iso[f.properties.name];
      let name = f.properties.name;
      try { if (names && code) name = names.of(code) || name; } catch { /* ignore */ }
      const [lng, lat] = ringCentroid(ring);
      let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
      for (const [x, y] of ring) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
      const marker = L.marker([lat, lng], {
        pane: 'labels', interactive: false, keyboard: false,
        icon: L.divIcon({ className: 'country-label', html: `<span>${escapeHtml(name)}</span>`, iconSize: null }),
      });
      this.labels.push({ marker, name, area: ringArea(ring), bounds: [[minY, minX], [maxY, maxX]] });
    }
    this.labels.sort((a, b) => b.area - a.area);
    this.labelLayer = L.layerGroup(this.labels.map((l) => l.marker)).addTo(this.map);
    this.placeLabels();
  }

  /** Mostra solo le etichette che ci stanno, senza sovrapposizioni. */
  placeLabels() {
    if (!this.labels || !this.map) return;
    const z = this.map.getZoom();
    const size = Math.round(Math.min(16, 9 + (z - 2) * 1.6));
    const view = this.map.getPixelBounds();
    const placed = [];
    for (const l of this.labels) {
      const el = l.marker.getElement();
      if (!el) continue;
      const nw = this.map.project(l.bounds[1]);
      const se = this.map.project(l.bounds[0]);
      const wPx = Math.abs(se.x - nw.x);
      const w = l.name.length * size * 0.62 + 6;
      const h = size + 4;
      const c = this.map.project(l.marker.getLatLng());
      const box = { x1: c.x - w / 2, x2: c.x + w / 2, y1: c.y - h / 2, y2: c.y + h / 2 };
      const inView = c.x > view.min.x - 50 && c.x < view.max.x + 50 && c.y > view.min.y - 50 && c.y < view.max.y + 50;
      const fits = wPx > w * 0.9;
      const free = !placed.some((b) => box.x1 < b.x2 && box.x2 > b.x1 && box.y1 < b.y2 && box.y2 > b.y1);
      const show = inView && fits && free;
      el.style.display = show ? '' : 'none';
      el.style.fontSize = `${size}px`;
      if (show) placed.push(box);
    }
    this.placeCities(placed, view, z);
  }

  /** Città del mondo: più si ingrandisce, più città compaiono. */
  placeCities(placed, view, z) {
    const L = window.L;
    if (!this.cityLayer || !this.cities?.length) return;
    this.cityLayer.clearLayers();
    if (this.streetsOn) return;
    const minPop = z < 3.5 ? Infinity : z < 4.5 ? 3e6 : z < 5.5 ? 1e6 : z < 6.5 ? 3e5 : z < 7.5 ? 1e5 : 0;
    const size = z < 6 ? 11 : 12.5;
    let count = 0;
    for (const [name, lat, lng, pop, , capital] of this.cities) {
      if (pop < minPop && !(capital && z >= 3.5)) continue;
      const c = this.map.project([lat, lng]);
      if (c.x < view.min.x || c.x > view.max.x || c.y < view.min.y || c.y > view.max.y) continue;
      const w = name.length * size * 0.58 + 14;
      const box = { x1: c.x - 5, x2: c.x + w, y1: c.y - size / 2 - 3, y2: c.y + size / 2 + 3 };
      if (placed.some((b) => box.x1 < b.x2 && box.x2 > b.x1 && box.y1 < b.y2 && box.y2 > b.y1)) continue;
      placed.push(box);
      this.cityLayer.addLayer(L.marker([lat, lng], {
        pane: 'labels', interactive: false, keyboard: false,
        icon: L.divIcon({
          className: `city-label${capital ? ' capital' : ''}`, iconSize: null,
          html: `<i></i><span style="font-size:${size}px">${escapeHtml(name)}</span>`,
        }),
      }));
      if (++count > 250) break;
    }
  }

  setStreets(on) {
    this.streetsOn = !!on;
    if (!this.map) return;
    if (this.streetsOn) this.streets.addTo(this.map); else this.map.removeLayer(this.streets);
    this.map.setMaxZoom(this.streetsOn ? 18 : 11);
    this.el.classList.toggle('streets-on', this.streetsOn);
    try { localStorage.setItem('mapStreets', this.streetsOn ? '1' : '0'); } catch { /* ignore */ }
    this.el.querySelector('.map-base').textContent = this.streetsOn ? t('mapPolitical') : t('mapStreets');
  }

  fitAll() {
    const L = window.L;
    if (this.markers?.length) {
      this.map.fitBounds(L.featureGroup(this.markers).getBounds().pad(0.3), { maxZoom: 7 });
    } else {
      this.map.setView([30, 10], 2);
    }
  }

  draw(fit) {
    const L = window.L;
    if (!this.map) return;
    this.cluster.clearLayers();
    const markers = [];
    for (const p of this.people.values()) {
      const place = this.mode === 'born' ? p.birthPlace : p.residence;
      if (!place || typeof place.lat !== 'number') continue;
      const icon = L.divIcon({
        className: 'person-pin',
        html: `<div class="pin ${p.sex === 'F' ? 'f' : 'm'}">${avatarHtml(p, 34)}</div><div class="pin-label">${escapeHtml(p.firstName)}</div>`,
        iconSize: [40, 54], iconAnchor: [20, 50], popupAnchor: [0, -46],
      });
      const rel = describeRelation(this.people, this.meId, p.id);
      const m = L.marker([place.lat, place.lng], { icon });
      m.bindPopup(`<div class="pop">
          ${avatarHtml(p, 52)}
          <div class="pop-body">
            <b>${escapeHtml(fullName(p))}</b>
            ${rel ? `<div class="pop-rel">${escapeHtml(rel)}</div>` : ''}
            <div class="pop-sub">${escapeHtml(yearsLabel(p))} · ${escapeHtml(place.name)}</div>
            <button class="btn primary small" data-open="${p.id}">${escapeHtml(t('openProfile'))}</button>
          </div></div>`, { closeButton: false });
      markers.push(m);
    }
    this.markers = markers;
    this.cluster.addLayers(markers);
    this.empty.textContent = t('mapEmpty');
    this.empty.classList.toggle('hidden', markers.length > 0);
    if (fit) this.fitAll();
  }
}
