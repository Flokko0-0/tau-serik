import { state, save } from '../store.js';
import { app, on, activeRoute } from '../core.js';
import { esc, icon, toast } from '../ui.js';
import { PLACES } from '../data/places.js';
import { createMap, routeLayer, placeMarker, meMarker, personMarker, KIND } from '../mapview.js';
import { nearest, fmtDist, compass, dist, bearing } from '../geo.js';
import { locateOnce } from '../sensors.js';
import { nearbyPeople, onPos } from '../safety.js';
import { t } from '../i18n.js';

const LAYERS = ['rescue', 'hut', 'water', 'toilet', 'shelter', 'camp', 'people'];
let ctx = null;
let groups = {};
let me = null;
let listOpen = true;

const layerOn = (k) => (state.cache.mapLayers || ['rescue', 'hut', 'water', 'toilet', 'people']).includes(k);

function drawLayers() {
  if (!ctx) return;
  const L = window.L;
  Object.values(groups).forEach((g) => g.remove());
  groups = {};
  for (const k of LAYERS) {
    if (!layerOn(k)) continue;
    const g = L.layerGroup();
    if (k === 'people') nearbyPeople().forEach((p) => personMarker(p).addTo(g));
    else PLACES.filter((p) => p.kind === k).forEach((p) => placeMarker(p).addTo(g));
    groups[k] = g.addTo(ctx.map);
  }
  me?.remove();
  me = state.pos ? meMarker(state.pos).addTo(ctx.map) : null;
}

function listPart() {
  if (!state.pos) {
    return `<div class="map-empty">
      <p>${t('Определите, где вы, чтобы увидеть ближайшие укрытия, воду и спасателей.')}</p>
      <button class="btn btn-primary" data-act="locate">${icon('current-location')}${t('Где я?')}</button>
    </div>`;
  }
  const from = [state.pos.lat, state.pos.lon];
  const kinds = LAYERS.filter((k) => k !== 'people' && layerOn(k));
  const places = nearest(from, PLACES, kinds, 8);
  const people = layerOn('people') ? nearbyPeople().map((p) => ({ ...p, kind: 'people', d: dist(from, [p.lat, p.lon]), brg: bearing(from, [p.lat, p.lon]) })) : [];
  const items = [...places, ...people].sort((a, b) => a.d - b.d).slice(0, 10);
  return `<ul class="list">
    ${items.map((p) => `<li><button class="row" data-act="flyTo" data-arg="${p.lat},${p.lon}">
      <span class="row-ic k-${p.kind}">${icon(p.kind === 'people' ? 'user' : KIND[p.kind].icon)}</span>
      <span class="row-t"><b>${esc(t(p.name))}</b><span class="small muted">${p.kind === 'people' ? `${esc(t(p.note))} · ${t('показывает себя на маршруте')}` : `${t(KIND[p.kind].name)}${p.ele ? ` · ${t('{m} м', { m: p.ele })}` : ''}`}</span></span>
      <span class="row-end"><span class="dir" style="--brg:${Math.round(p.brg)}deg">${icon('arrow-up')}</span><span class="nowrap"><b>${fmtDist(p.d)}</b> ${compass(p.brg)}</span></span>
    </button></li>`).join('')}
  </ul>`;
}

function sheet() {
  return `<div class="map-sheet ${listOpen ? 'open' : ''}">
    <button class="map-sheet-h" data-act="toggleList" aria-expanded="${listOpen}">
      <b>${t('Рядом с вами')}</b><span class="small muted">${state.pos ? (state.pos.src === 'demo' ? t('демо-точка на маршруте') : `GPS ±${t('{m} м', { m: state.pos.acc })}`) : t('место неизвестно')}</span>${icon(listOpen ? 'chevron-down' : 'arrow-up')}
    </button>
    <div class="map-sheet-b">
      ${listPart()}
      <div class="field inline"><label for="share">${t('Меня видят')}</label>
        <select id="share" class="input" data-setting="share">
          <option value="none" ${state.settings.share === 'none' ? 'selected' : ''}>${t('Никто')}</option>
          <option value="contacts" ${state.settings.share === 'contacts' ? 'selected' : ''}>${t('Только близкие')}</option>
          <option value="nearby" ${state.settings.share === 'nearby' ? 'selected' : ''}>${t('Близкие и туристы рядом')}</option>
        </select></div>
      <p class="small muted">${t('Точки: © участники OpenStreetMap. Людей рядом видно, только если они сами это разрешили. В демо они условные.')}</p>
    </div>
  </div>`;
}

export default {
  tab: 'map',
  title: 'Карта',
  full: true,
  render() {
    return `<div class="map-wrap">
      <div class="map-full" data-map aria-label="${t('Карта')}"></div>
      <div class="map-chips chips" role="group" aria-label="${t('Слои карты')}">
        ${LAYERS.map((k) => `<button class="chip ${layerOn(k) ? 'on' : ''}" data-act="layer" data-arg="${k}" aria-pressed="${layerOn(k)}">${icon(k === 'people' ? 'users' : KIND[k].icon)}${t(k === 'people' ? 'Люди' : KIND[k].name)}</button>`).join('')}
      </div>
      <div class="map-tools">
        <button class="icon-btn solid" data-act="locate" aria-label="${t('Где я?')}">${icon('current-location')}</button>
        <button class="icon-btn solid" data-act="base" aria-label="${t('Сменить подложку')}">${icon('map')}</button>
      </div>
      <div data-part="sheet">${sheet()}</div>
    </div>`;
  },
  mount(root) {
    const el = root.querySelector('[data-map]');
    if (!window.L || !el) return;
    const r = activeRoute();
    ctx = createMap(el, { center: state.pos ? [state.pos.lat, state.pos.lon] : r ? r.top : [43.1, 77.02], zoom: state.pos ? 14 : 12 });
    if (r) {
      routeLayer(r).addTo(ctx.map);
      if (!state.pos) ctx.map.fitBounds(window.L.polyline(r.line).getBounds(), { padding: [30, 30] });
    }
    if (state.track.length > 1) window.L.polyline(state.track.map((p) => [p[0], p[1]]), { className: 'track-line', weight: 3 }).addTo(ctx.map);
    drawLayers();
  },
  update() {
    drawLayers();
    const part = document.querySelector('[data-part="sheet"]');
    if (part) part.innerHTML = sheet();
  },
  unmount() {
    ctx?.map.remove();
    ctx = null;
    groups = {};
    me = null;
  },
};

on({
  layer: (k) => {
    const cur = new Set(state.cache.mapLayers || ['rescue', 'hut', 'water', 'toilet', 'people']);
    if (cur.has(k)) cur.delete(k);
    else cur.add(k);
    state.cache.mapLayers = [...cur];
    save();
    document.querySelectorAll('.map-chips .chip').forEach((b) => {
      const on = cur.has(b.dataset.arg);
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on);
    });
    app.refresh();
  },
  locate: async () => {
    if (state.demo.gps && state.pos) {
      ctx?.map.setView([state.pos.lat, state.pos.lon], 15);
      return;
    }
    toast(t('Определяем местоположение…'));
    const pos = await locateOnce();
    if (!pos) return toast(t('Не удалось определить место. Разрешите геолокацию'));
    onPos(pos);
    ctx?.map.setView([pos.lat, pos.lon], 14);
    app.refresh();
  },
  base: () => {
    const b = ctx?.toggleBase();
    toast(t(b === 'topo' ? 'Топографическая карта' : 'Схема OpenStreetMap'));
  },
  flyTo: (arg) => {
    const [lat, lon] = arg.split(',').map(Number);
    ctx?.map.flyTo([lat, lon], 15, { duration: 0.6 });
  },
  toggleList: () => {
    listOpen = !listOpen;
    const part = document.querySelector('[data-part="sheet"]');
    if (part) part.innerHTML = sheet();
  },
});
