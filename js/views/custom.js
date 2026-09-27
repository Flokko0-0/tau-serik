import { state, save, log } from '../store.js';
import { app, on, online } from '../core.js';
import { esc, icon, toast } from '../ui.js';
import { createMap, pin } from '../mapview.js';
import { dist, fmtDist } from '../geo.js';
import { fmtHours } from '../time.js';
import { LEVELS, LEVEL_NAME } from '../risk.js';
import { locateOnce } from '../sensors.js';

let ctx = null;
let pts = [];
let ele = [null, null];
let layers = [];

// Тропа длиннее прямой: в горах примерно в 1,4 раза
const WIND = 1.4;

function calc(kind) {
  if (pts.length < 2 || ele[0] == null || ele[1] == null) return null;
  const km = (dist(pts[0], pts[1]) * WIND) / 1000;
  const climb = Math.max(0, ele[1] - ele[0]);
  const drop = Math.max(0, ele[0] - ele[1]);
  const walkKm = kind === 'out' ? km * 2 : km;
  const up = kind === 'out' ? climb + drop : climb;
  const down = kind === 'out' ? climb + drop : drop;
  const hours = walkKm / 4 + up / 500 + down / 1000;
  return { km, walkKm, up, down, hours: Math.max(1, Math.round(hours * 2) / 2) };
}

function summary() {
  const kind = document.getElementById('cu-kind')?.value || 'out';
  const c = calc(kind);
  if (pts.length < 2) return `<p class="small muted">${pts.length ? 'Теперь нажмите на цель: вершину, озеро, перевал.' : 'Нажмите на карте точку старта.'}</p>`;
  if (!c) return `<p class="small muted">${online() ? 'Загружаем высоты…' : 'Нет интернета: введите высоты вручную ниже.'}</p>`;
  return `<dl class="stats compact">
    <div><dt>Путь</dt><dd>${c.walkKm.toFixed(1).replace('.', ',')} км</dd><small>по прямой ×1,4</small></div>
    <div><dt>Набор</dt><dd>${c.up} м</dd><small>${ele[0]} → ${ele[1]} м</small></div>
    <div><dt>Время</dt><dd>${fmtHours(c.hours)}</dd><small>обычный темп</small></div>
  </dl>`;
}

function redrawMarkers() {
  if (!ctx) return;
  layers.forEach((l) => l.remove());
  layers = pts.map((p, i) => window.L.marker(p, { icon: pin(i ? 'mountain' : 'flag', i ? 'top' : 'start') }).addTo(ctx.map));
  if (pts.length === 2) layers.push(window.L.polyline(pts, { className: 'route-line custom', weight: 4 }).addTo(ctx.map));
  const s = document.querySelector('[data-part="cu-sum"]');
  if (s) s.innerHTML = summary();
  const e0 = document.getElementById('cu-e0');
  const e1 = document.getElementById('cu-e1');
  if (e0 && ele[0] != null) e0.value = ele[0];
  if (e1 && ele[1] != null) e1.value = ele[1];
}

async function fetchEle() {
  if (!online() || !pts.length) return;
  try {
    const res = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${pts.map((p) => p[0].toFixed(5)).join(',')}&longitude=${pts.map((p) => p[1].toFixed(5)).join(',')}`);
    const data = await res.json();
    data.elevation.forEach((e, i) => (ele[i] = Math.round(e)));
  } catch {
    toast('Не удалось загрузить высоты: введите вручную');
  }
  redrawMarkers();
}

export default {
  tab: 'routes',
  title: 'Свой маршрут',
  render() {
    return `<div class="route-map tall" data-map aria-label="Карта: нажмите старт и цель"></div>
      <form class="pad stack" data-form="custom">
        <header class="page-h">
          <h1 class="h1">Свой маршрут</h1>
          <p class="muted">Кольсай, Чарын, Тургень или любая тропа. Отметьте старт и цель: приложение посчитает путь, набор высоты и время, загрузит прогноз и оценит риск.</p>
        </header>
        <div class="row-btns two">
          <button type="button" class="btn" data-act="cuHere">${icon('current-location')}Старт - где я</button>
          <button type="button" class="btn" data-act="cuReset">${icon('refresh')}Сбросить точки</button>
        </div>
        <div data-part="cu-sum">${summary()}</div>
        <div class="field"><label for="cu-name">Название</label><input id="cu-name" class="input" name="title" required maxlength="60" placeholder="Кольсай: первое - второе озеро"></div>
        <div class="form-2">
          <div class="field"><label for="cu-level">Сложность</label><select id="cu-level" class="input" name="level">${LEVELS.map((l) => `<option value="${l}" ${l === 'medium' ? 'selected' : ''}>${LEVEL_NAME[l]}</option>`).join('')}</select></div>
          <div class="field"><label for="cu-kind">Как идёте</label><select id="cu-kind" class="input" name="kind" data-cu><option value="out">Туда и обратно</option><option value="loop">В одну сторону или кольцо</option></select></div>
        </div>
        <div class="form-2">
          <div class="field"><label for="cu-e0">Высота старта, м</label><input id="cu-e0" class="input" name="e0" data-cu type="number" inputmode="numeric" min="0" max="7500" required></div>
          <div class="field"><label for="cu-e1">Высота цели, м</label><input id="cu-e1" class="input" name="e1" data-cu type="number" inputmode="numeric" min="0" max="7500" required></div>
        </div>
        <p class="small muted">Линия проведена по прямой: реальная тропа извилистее. Для точного трека выберите маршрут из списка.</p>
        <button class="btn btn-primary btn-block btn-lg">${icon('check')}Сохранить и оценить риск</button>
      </form>`;
  },
  mount(root) {
    pts = [];
    ele = [null, null];
    layers = [];
    const el = root.querySelector('[data-map]');
    if (!window.L || !el) return;
    ctx = createMap(el, { center: state.pos ? [state.pos.lat, state.pos.lon] : [43.1, 77.3], zoom: state.pos ? 12 : 9 });
    ctx.map.on('click', (e) => {
      if (pts.length >= 2) pts = [];
      pts.push([e.latlng.lat, e.latlng.lng]);
      ele = pts.length === 1 ? [null, null] : ele;
      redrawMarkers();
      fetchEle();
    });
  },
  unmount() {
    ctx?.map.remove();
    ctx = null;
  },
};

on({
  cuReset: () => {
    pts = [];
    ele = [null, null];
    redrawMarkers();
  },
  cuHere: async () => {
    let p = state.pos;
    if (!p) {
      toast('Определяем место…');
      p = await locateOnce();
    }
    if (!p) return toast('Не удалось определить место: нажмите старт на карте');
    pts = [[p.lat, p.lon]];
    ele = [p.alt ?? null, null];
    ctx?.map.setView(pts[0], 12);
    redrawMarkers();
    fetchEle();
  },
});

export function onCustomForm(form) {
  const f = new FormData(form);
  if (pts.length < 2) return toast('Отметьте на карте старт и цель');
  ele = [Number(f.get('e0')), Number(f.get('e1'))];
  const kind = f.get('kind');
  const c = calc(kind);
  const id = 'u' + Date.now().toString(36);
  const title = String(f.get('title')).trim();
  const route = {
    id, custom: true, title, level: f.get('level'), kind, start: 'Своя точка старта',
    text: 'Свой маршрут. Линия проведена по прямой, поэтому расстояние и время примерные.',
    hazards: ['Маршрут не проверен: сверьте тропу с картой', 'Расстояние и время примерные'],
    km: Math.round(c.km * 10) / 10, walkKm: Math.round(c.walkKm * 10) / 10, up: c.up, down: c.down,
    minEle: Math.min(...ele), maxEle: Math.max(...ele), hours: c.hours,
    top: ele[1] >= ele[0] ? pts[1] : pts[0], line: pts.map((p) => [Number(p[0].toFixed(5)), Number(p[1].toFixed(5))]),
    profile: [[0, ele[0]], [Math.round(c.km * 100) / 100, ele[1]]],
  };
  state.customRoutes = [route, ...(state.customRoutes || [])].slice(0, 20);
  state.plan.routeId = id;
  save();
  log(`Свой маршрут: ${title}, ${fmtDist(c.walkKm * 1000)}`);
  app.go('route', id);
}

export function onCustomInput() {
  const e0 = document.getElementById('cu-e0')?.value;
  const e1 = document.getElementById('cu-e1')?.value;
  if (e0 !== '' && e0 != null) ele[0] = Number(e0);
  if (e1 !== '' && e1 != null) ele[1] = Number(e1);
  const s = document.querySelector('[data-part="cu-sum"]');
  if (s) s.innerHTML = summary();
}
