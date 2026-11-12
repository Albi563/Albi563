// Mappa del mondo (OpenStreetMap + Leaflet) con i familiari raggruppati.
// Allontanandosi i segnaposto si uniscono in un numero; avvicinandosi si
// separano fino alla singola persona.
import { t } from './i18n.js';
import { fullName, describeRelation } from './relations.js';
import { escapeHtml, avatarHtml, yearsLabel } from './ui.js';

const VENDOR = 'vendor/leaflet';
let leafletPromise;

function loadCss(href) {
  const l = document.createElement('link');
  l.rel = 'stylesheet'; l.href = href;
  document.head.appendChild(l);
}
function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
}
function loadLeaflet() {
  if (!leafletPromise) {
    loadCss(`${VENDOR}/leaflet.css`);
    loadCss(`${VENDOR}/MarkerCluster.css`);
    leafletPromise = loadScript(`${VENDOR}/leaflet.js`)
      .then(() => loadScript(`${VENDOR}/leaflet.markercluster.js`));
  }
  return leafletPromise;
}

export class MapView {
  constructor(container, { onOpen }) {
    this.el = container;
    this.onOpen = onOpen;
    this.mode = 'born';
    this.el.innerHTML = `
      <div class="map-toggle segmented">
        <button data-m="born" class="on"></button>
        <button data-m="lives"></button>
      </div>
      <div class="map-canvas"></div>
      <button class="map-base"></button>
      <div class="map-empty hidden"></div>`;
    this.canvas = this.el.querySelector('.map-canvas');
    this.empty = this.el.querySelector('.map-empty');
    for (const b of this.el.querySelectorAll('[data-m]')) {
      b.onclick = () => {
        this.mode = b.dataset.m;
        for (const x of this.el.querySelectorAll('[data-m]')) x.classList.toggle('on', x === b);
        this.draw(true);
      };
    }
    this.el.querySelector('.map-base').onclick = () => this.setBase(this.base === 'street' ? 'satellite' : 'street');
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
    await loadLeaflet();
    if (this.layers) this.setBase(this.base);
    const L = window.L;
    if (!this.map) {
      this.map = L.map(this.canvas, { worldCopyJump: true, zoomControl: true }).setView([45, 15], 4);
      const osm = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
      // Mappa stradale in stile "Google Maps" (CARTO Voyager, gratuita, nessuna chiave)
      const street = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        maxZoom: 20, subdomains: 'abcd',
        attribution: `${osm} &copy; <a href="https://carto.com/attributions">CARTO</a>`,
      });
      // Vista satellite (Esri World Imagery) + confini e nomi delle città
      const satellite = L.layerGroup([
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
          maxZoom: 19, attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics',
        }),
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
          maxZoom: 19,
        }),
      ]);
      this.layers = { street, satellite };
      let base = 'street';
      try { base = localStorage.getItem('mapBase') === 'satellite' ? 'satellite' : 'street'; } catch { /* ignore */ }
      this.setBase(base);
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
      this.firstFit = true;
    }
    setTimeout(() => this.map.invalidateSize(), 50);
    this.draw(this.firstFit);
    this.firstFit = false;
  }

  setBase(name) {
    for (const [k, layer] of Object.entries(this.layers)) {
      if (k === name) layer.addTo(this.map); else this.map.removeLayer(layer);
    }
    this.base = name;
    try { localStorage.setItem('mapBase', name); } catch { /* ignore */ }
    const btn = this.el.querySelector('.map-base');
    btn.textContent = name === 'street' ? t('mapSatellite') : t('mapStreet');
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
    this.cluster.addLayers(markers);
    this.empty.textContent = t('mapEmpty');
    this.empty.classList.toggle('hidden', markers.length > 0);
    if (fit && markers.length) {
      const b = L.featureGroup(markers).getBounds();
      this.map.fitBounds(b.pad(0.3), { maxZoom: 8 });
    }
  }
}
