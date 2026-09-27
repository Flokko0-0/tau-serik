// Карта Leaflet: топоподложка OpenTopoMap, маршрут, точки, люди рядом
import { icon, esc, initials } from './ui.js';

const TOPO = 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png';
const OSM = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTR = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>, SRTM, стиль © <a href="https://opentopomap.org" target="_blank" rel="noopener">OpenTopoMap</a>';

export const KIND = {
  rescue: { icon: 'lifebuoy', name: 'Спасатели' },
  hut: { icon: 'building-cottage', name: 'Хижины' },
  shelter: { icon: 'umbrella', name: 'Навесы' },
  water: { icon: 'droplet', name: 'Вода' },
  toilet: { icon: 'toilet-paper', name: 'Туалеты' },
  camp: { icon: 'tent', name: 'Стоянки' },
  peak: { icon: 'mountain', name: 'Вершины' },
};

export function createMap(el, { center = [43.1, 77.02], zoom = 12 } = {}) {
  const L = window.L;
  const map = L.map(el, { zoomControl: false, attributionControl: true, zoomSnap: 0.5, tap: true }).setView(center, zoom);
  map.attributionControl.setPrefix(false);
  const topo = L.tileLayer(TOPO, { subdomains: 'abc', maxZoom: 17, crossOrigin: 'anonymous', attribution: ATTR });
  const osm = L.tileLayer(OSM, { maxZoom: 19, crossOrigin: 'anonymous', attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>' });
  topo.addTo(map);
  L.control.zoom({ position: 'topright', zoomInTitle: 'Приблизить', zoomOutTitle: 'Отдалить' }).addTo(map);
  let base = 'topo';
  return {
    map,
    toggleBase() {
      map.removeLayer(base === 'topo' ? topo : osm);
      base = base === 'topo' ? 'osm' : 'topo';
      (base === 'topo' ? topo : osm).addTo(map);
      return base;
    },
  };
}

export function routeLayer(route, { start = true } = {}) {
  const L = window.L;
  const g = L.layerGroup();
  L.polyline(route.line, { color: '#fff8e6', weight: 8, opacity: 0.9, lineJoin: 'round', className: 'route-casing' }).addTo(g);
  L.polyline(route.line, { color: '#f96015', weight: 4, opacity: 1, lineJoin: 'round', className: 'route-line' + (route.custom ? ' custom' : '') }).addTo(g);
  if (start) {
    g.addLayer(L.marker(route.line[0], { icon: pin('flag', 'start'), title: 'Старт: ' + route.start, keyboard: false }));
    g.addLayer(L.marker(route.top, { icon: pin('mountain', 'top'), title: `Высшая точка, ${route.maxEle} м`, keyboard: false }));
  }
  return g;
}

export function pin(name, cls) {
  return window.L.divIcon({ className: 'pin pin-' + cls, html: `<span>${icon(name)}</span>`, iconSize: [30, 30], iconAnchor: [15, 15] });
}

export function placeMarker(p, onClick) {
  const L = window.L;
  const m = L.marker([p.lat, p.lon], { icon: pin(KIND[p.kind].icon, p.kind), title: p.name, keyboard: false });
  m.bindTooltip(`${esc(p.name)}${p.ele ? `, ${p.ele} м` : ''}`, { direction: 'top', offset: [0, -14] });
  if (onClick) m.on('click', () => onClick(p));
  return m;
}

export function meMarker(pos) {
  const L = window.L;
  const g = L.layerGroup();
  if (pos.acc && pos.acc < 2000) L.circle([pos.lat, pos.lon], { radius: pos.acc, className: 'me-acc', weight: 1 }).addTo(g);
  L.marker([pos.lat, pos.lon], { icon: L.divIcon({ className: 'pin-me', html: '<span></span>', iconSize: [22, 22], iconAnchor: [11, 11] }), zIndexOffset: 1000, title: 'Вы здесь' }).addTo(g);
  return g;
}

export function personMarker(p) {
  const L = window.L;
  return L.marker([p.lat, p.lon], { icon: L.divIcon({ className: 'pin-person', html: `<span>${esc(initials(p.name))}</span>`, iconSize: [30, 30], iconAnchor: [15, 15] }), title: p.name })
    .bindTooltip(`${esc(p.name)}: ${esc(p.note)}`, { direction: 'top', offset: [0, -14] });
}

// Тайлы по рамке маршрута для офлайна (зумы 12-15, до ~200 штук)
export function tilesFor(line, zooms = [12, 13, 14, 15], pad = 0.01) {
  const lats = line.map((p) => p[0]);
  const lons = line.map((p) => p[1]);
  const [s, n, w, e] = [Math.min(...lats) - pad, Math.max(...lats) + pad, Math.min(...lons) - pad, Math.max(...lons) + pad];
  const tx = (lon, z) => Math.floor(((lon + 180) / 360) * 2 ** z);
  const ty = (lat, z) => Math.floor(((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** z);
  const urls = [];
  for (const z of zooms) {
    for (let x = tx(w, z); x <= tx(e, z); x++) {
      for (let y = ty(n, z); y <= ty(s, z); y++) urls.push(`https://${'abc'[(x + y) % 3]}.tile.opentopomap.org/${z}/${x}/${y}.png`);
    }
  }
  return urls.slice(0, 220);
}
