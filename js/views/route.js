import { state, save, cache } from '../store.js';
import { app, on, routeById, age, plan, startMs, online, hasMedical } from '../core.js';
import { esc, icon, toast, RISK_CLASS } from '../ui.js';
import { loadForecast, inWindow, wmo } from '../weather.js';
import { assessRisk, LEVEL_NAME, EXP_NAME } from '../risk.js';
import { gearList } from '../gear.js';
import { profileSvg, bindProfile } from '../chart.js';
import { createMap, routeLayer, tilesFor, meMarker } from '../mapview.js';
import { levelPips } from './routes.js';
import { fmtTime, fmtHours, fmtDay, dayKey, ago, fromLocal } from '../time.js';
import { startTrip, enableMountain } from '../safety.js';
import { pointAt, cumulative } from '../geo.js';

let fc = null;
let fcState = 'idle';
let current = null;
let mapCtx = null;
let hoverMarker = null;
let confirmOpen = false;
let offline = null;

const TIMES = Array.from({ length: 21 }, (_, i) => `${String(5 + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);

function returnBy(r, from) {
  const buffer = state.plan.buffer ?? 60;
  const raw = from + r.hours * 3600e3 + buffer * 60e3;
  return Math.ceil(raw / 900e3) * 900e3;
}

function days() {
  const now = Date.now();
  return [0, 1, 2, 3].map((i) => {
    const t = now + i * 86400e3;
    return { key: dayKey(t), label: i === 0 ? 'Сегодня' : i === 1 ? 'Завтра' : fmtDay(t) };
  });
}

function forecastPart(r, s) {
  if (fcState === 'loading' && !fc) {
    return `<div class="wx-strip skeleton" aria-label="Загружаем прогноз">${'<div class="wx"></div>'.repeat(6)}</div>`;
  }
  if (!fc) {
    return `<p class="callout">${icon('wifi-off')}Прогноз не загружен. ${online() ? 'Сервис погоды не ответил.' : 'Нет интернета.'} <button class="link" data-act="wxReload">Повторить</button></p>`;
  }
  let hs = inWindow(fc, s, s + r.hours * 3600e3);
  if (!hs.length) return `<p class="callout">${icon('info-circle')}Прогноз есть на 4 дня вперёд. Выберите дату ближе.</p>`;
  if (hs.length > 12) hs = hs.filter((_, i) => i % 2 === 0);
  return `<div class="wx-strip" role="table" aria-label="Почасовой прогноз на высшей точке">
    ${hs.map((h) => {
      const w = wmo(h.code);
      const bad = h.code >= 95 || h.gust >= 60 ? 'crit' : h.gust >= 40 || h.pop >= 70 || h.feels <= -5 ? 'high' : h.pop >= 40 || h.gust >= 25 ? 'warn' : '';
      return `<div class="wx ${bad}" role="row">
        <span class="wx-t" role="cell">${fmtTime(h.t)}</span>
        <span role="cell" title="${w.text}">${icon(w.icon)}</span>
        <b class="wx-temp" role="cell">${Math.round(h.temp)}°</b>
        <span class="wx-s" role="cell">${icon('wind')}${Math.round(h.gust)}</span>
        <span class="wx-s" role="cell">${icon('droplet')}${h.pop}%</span>
      </div>`;
    }).join('')}
  </div>
  <p class="small muted">Высшая точка, ${fc.eleTop} м. Внизу (${fc.eleStart} м) до ${Math.round(Math.max(...hs.map((h) => h.tempStart)))}°. Open-Meteo, обновлено ${ago(fc.fetchedAt)}${fc.stale ? ', сохранённая копия' : ''}. <button class="link" data-act="wxReload">Обновить</button></p>`;
}

function riskPart(risk) {
  const cls = risk.blocked ? 'crit' : RISK_CLASS[risk.level];
  const ICON = ['circle-check', 'alert-triangle', 'alert-triangle', 'alert-octagon'];
  return `<div class="risk risk-${cls}">
    <div class="risk-v">${icon(risk.blocked ? 'lock' : ICON[risk.level])}<div><span class="label">Оценка перед выходом</span><b>${risk.verdict}</b></div></div>
    <ul class="factors">
      ${risk.factors.map((f) => `<li class="f-${RISK_CLASS[f.level]}">${icon(f.icon)}<div><b>${esc(f.title)}</b><span>${esc(f.text)}</span></div></li>`).join('')}
    </ul>
  </div>`;
}

function gearPart(r, s) {
  const groups = gearList({ route: r, fc, startMs: s, medical: state.profile?.medical });
  const checked = new Set(state.gear[r.id] || []);
  const all = groups.flatMap((g) => g.items);
  const done = all.filter((i) => checked.has(i.id)).length;
  return `<div class="sec-h"><h2 class="h2">Что надеть и взять</h2><span class="count">${done} из ${all.length}</span></div>
    ${groups.map((g) => `<fieldset class="gear">
      <legend class="label">${g.title}</legend>
      ${g.items.map((i) => `<label class="gear-i">
        <input type="checkbox" data-gear="${i.id}" ${checked.has(i.id) ? 'checked' : ''}>
        <span class="box" aria-hidden="true">${icon('check')}</span>
        <span><b>${esc(i.text)}</b>${i.must ? '<em>обязательно</em>' : ''}<small>${esc(i.why)}</small></span>
      </label>`).join('')}
    </fieldset>`).join('')}`;
}

function confirmSheet(r) {
  const p = state.profile;
  const now = Date.now();
  const from = Math.max(now, startMs());
  const rb = returnBy(r, now);
  return `<div class="sheet-wrap" data-act="closeStart">
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="st-t" data-stop>
      <div class="sheet-h"><h2 class="h2" id="st-t">Начать поход</h2><button class="icon-btn" data-act="closeStart" aria-label="Закрыть">${icon('x')}</button></div>
      <p><b>${esc(r.title)}</b>. Контрольное время <b>${fmtTime(rb)}</b>${from > now + 3600e3 ? ` (считаем от выхода сейчас, а не в ${fmtTime(from)})` : ''}.</p>
      <p class="muted">Эти люди получат маршрут и контрольное время, а при SOS - ваши координаты и медкарту:</p>
      <ul class="list tight">
        ${p.contacts.map((c) => `<li class="row"><span class="row-ic">${icon(c.guardian ? 'shield-heart' : 'user')}</span><div class="row-t"><b>${esc(c.name)}</b><span class="small muted">${esc(c.phone)}${c.guardian ? ' · законный представитель' : ''}</span></div></li>`).join('')}
      </ul>
      <label class="check"><input type="checkbox" id="st-mm" checked><span class="box" aria-hidden="true">${icon('check')}</span><span>Включить режим «В горах»: датчики падения, крика, кодового слова и GPS</span></label>
      <button class="btn btn-primary btn-block btn-lg" data-act="doStart">${icon('walk')}Выхожу на тропу</button>
    </div>
  </div>`;
}

function body(r) {
  const p = plan();
  const s = startMs();
  const a = age();
  const risk = assessRisk({ route: r, fc, startMs: s, age: a, experience: state.profile?.experience, group: p.group, contacts: state.profile?.contacts?.length, hasMedical: hasMedical() });
  const onTrip = state.trip?.routeId === r.id;
  const rb = returnBy(r, s);
  const tiles = tilesFor(r.line).length;
  const off = state.cache['off:' + r.id];
  return `<header class="page-h">
      <h1 class="h1">${esc(r.title)}</h1>
      <div class="page-h-meta">${levelPips(r.level)}<span class="muted small">${icon('flag')}${esc(r.start)}</span></div>
    </header>
    <dl class="stats">
      <div><dt>Путь</dt><dd>${String(r.walkKm).replace('.', ',')} км</dd><small>${r.kind === 'out' ? 'туда и обратно' : 'кольцо'}</small></div>
      <div><dt>Набор</dt><dd>${r.up.toLocaleString('ru-RU')} м</dd><small>вверх за день</small></div>
      <div><dt>Высшая точка</dt><dd>${r.maxEle.toLocaleString('ru-RU')} м</dd><small>старт ${r.profile[0][1].toLocaleString('ru-RU')} м</small></div>
      <div><dt>Время</dt><dd>${fmtHours(r.hours)}</dd><small>обычный темп</small></div>
    </dl>
    <section class="card chart-card">
      <div class="sec-h"><h2 class="h3">Профиль высот</h2><span class="small muted">${r.kind === 'out' ? 'в одну сторону' : 'всё кольцо'}</span></div>
      <div class="chart-box">${profileSvg(r, { hereKm: onTrip && state.trip.progress ? Math.min(state.trip.progress / 1000, r.km) : null })}<div class="ch-tip" hidden></div></div>
    </section>
    <section class="sec">
      <p>${esc(r.text)}</p>
      <ul class="hazards">${r.hazards.map((h) => `<li>${icon('alert-triangle')}${esc(h)}</li>`).join('')}</ul>
    </section>
    <section class="sec">
      <h2 class="h2">Когда идёте</h2>
      <div class="chips" role="group" aria-label="День">
        ${days().map((d) => `<button class="chip ${p.day === d.key ? 'on' : ''}" data-act="day" data-arg="${d.key}" aria-pressed="${p.day === d.key}">${d.label}</button>`).join('')}
      </div>
      <div class="when">
        <div class="field"><label for="pl-time">Выход</label>
          <select id="pl-time" class="input" data-plan="time">${TIMES.map((t) => `<option ${t === p.time ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
        <div class="field"><span class="field-l" id="pl-g">Людей в группе</span>
          <div class="stepper" role="group" aria-labelledby="pl-g"><button class="icon-btn" data-act="group" data-arg="-1" aria-label="Меньше">${icon('minus')}</button><b>${p.group}</b><button class="icon-btn" data-act="group" data-arg="1" aria-label="Больше">${icon('plus')}</button></div></div>
      </div>
      <p class="small muted">Возвращение около ${fmtTime(s + r.hours * 3600e3)} · опыт: ${EXP_NAME[state.profile?.experience || 'novice'].toLowerCase()}</p>
    </section>
    <section class="sec">
      <div class="sec-h"><h2 class="h2">Погода наверху</h2></div>
      ${forecastPart(r, s)}
    </section>
    <section class="sec">${riskPart(risk)}</section>
    <section class="sec">${gearPart(r, s)}</section>
    <section class="sec">
      <h2 class="h2">Контрольное время</h2>
      <div class="ctrl">
        <button class="icon-btn" data-act="buffer" data-arg="-30" aria-label="Раньше на 30 минут">${icon('minus')}</button>
        <div><b class="ctrl-v">${fmtTime(rb)}</b><span class="small muted">запас ${state.plan.buffer ?? 60} мин после расчётного возвращения</span></div>
        <button class="icon-btn" data-act="buffer" data-arg="30" aria-label="Позже на 30 минут">${icon('plus')}</button>
      </div>
      <p class="small muted">Не отметитесь «Я вернулся» к этому времени - приложение спросит, всё ли в порядке, а затем сообщит близким вашу последнюю точку.</p>
    </section>
    <section class="sec">
      <h2 class="h2">Без интернета</h2>
      <p class="small muted">Трек, точки, памятки и прогноз уже сохранены на телефоне. Подложку карты можно скачать заранее.</p>
      <button class="btn btn-block" data-act="offline" ${offline ? 'disabled' : ''}>${icon('cloud-download')}${offline ? `Скачиваем ${offline.done} из ${offline.total}…` : off ? `Карта сохранена ${ago(off.at)}, обновить` : `Сохранить карту маршрута (${tiles} фрагментов)`}</button>
    </section>
    <div class="cta-bar">
      ${onTrip
        ? `<button class="btn btn-primary btn-block btn-lg" data-go="home">${icon('walk')}Поход идёт · на главную</button>`
        : risk.blocked
          ? `<button class="btn btn-block btn-lg" disabled>${icon('lock')}Недоступно по возрасту</button>`
          : state.trip
            ? `<button class="btn btn-block btn-lg" disabled>Сначала завершите текущий поход</button>`
            : `<button class="btn ${risk.level >= 3 ? 'btn-warn' : 'btn-primary'} btn-block btn-lg" data-act="start">${icon('walk')}${risk.level >= 3 ? 'Начать, несмотря на риск' : 'Начать поход'}</button>`}
    </div>
    ${confirmOpen ? confirmSheet(r) : ''}`;
}

function drawBody() {
  const part = document.querySelector('[data-part="route-body"]');
  if (!part || !current) return;
  const scroll = document.querySelector('.main')?.scrollTop;
  part.innerHTML = body(current);
  bindProfile(part.querySelector('.chart-box'), current, (km) => {
    if (!mapCtx) return;
    if (km == null) {
      hoverMarker?.remove();
      hoverMarker = null;
      return;
    }
    const oneWay = current.line;
    const ll = pointAt(oneWay, km / current.km, current.cum || (current.cum = cumulative(oneWay)));
    if (!hoverMarker) hoverMarker = window.L.circleMarker(ll, { radius: 7, className: 'hover-pt', weight: 3 }).addTo(mapCtx.map);
    else hoverMarker.setLatLng(ll);
  });
  if (scroll != null) document.querySelector('.main').scrollTop = scroll;
}

async function fetchWx(force = false) {
  if (!current) return;
  const r = current;
  fcState = 'loading';
  fc = cache.get('wx:' + r.id) || null;
  drawBody();
  const res = await loadForecast(r, cache, { force, online: online() });
  if (current !== r) return;
  fc = res;
  fcState = 'done';
  drawBody();
}

export default {
  tab: 'routes',
  title: 'Маршрут',
  render(id) {
    const r = routeById(id);
    if (!r) return '<div class="pad"><p>Маршрут не найден.</p></div>';
    return `<div class="route-map" data-map aria-label="Карта маршрута"></div>
      <div class="pad stack" data-part="route-body"></div>`;
  },
  mount(root, id) {
    const r = routeById(id);
    if (!r) return;
    if (current !== r) {
      fc = null;
      confirmOpen = false;
    }
    current = r;
    state.plan.routeId = r.id;
    save();
    hoverMarker = null;
    mapCtx = null;
    const el = root.querySelector('[data-map]');
    if (window.L && el) {
      mapCtx = createMap(el, { center: r.top, zoom: 13 });
      const layer = routeLayer(r).addTo(mapCtx.map);
      mapCtx.map.fitBounds(window.L.polyline(r.line).getBounds(), { padding: [24, 24] });
      if (state.pos) meMarker(state.pos).addTo(mapCtx.map);
      void layer;
    }
    drawBody();
    fetchWx();
  },
  update() {
    drawBody();
  },
  unmount() {
    mapCtx?.map.remove();
    mapCtx = null;
  },
};

on({
  day: (key) => {
    state.plan.day = key;
    save();
    drawBody();
  },
  group: (d) => {
    const p = plan();
    p.group = Math.max(1, Math.min(12, p.group + Number(d)));
    save();
    drawBody();
  },
  buffer: (d) => {
    state.plan.buffer = Math.max(0, Math.min(240, (state.plan.buffer ?? 60) + Number(d)));
    save();
    drawBody();
  },
  wxReload: () => fetchWx(true),
  start: () => {
    confirmOpen = true;
    drawBody();
  },
  closeStart: () => {
    confirmOpen = false;
    drawBody();
  },
  doStart: async () => {
    const r = current;
    const mm = document.getElementById('st-mm')?.checked;
    confirmOpen = false;
    startTrip(r.id, returnBy(r, Date.now()), plan().group);
    toast('Поход начат. Близкие получили маршрут');
    app.go('home');
    if (mm && !state.mountain) await enableMountain();
  },
  offline: async () => {
    const r = current;
    const urls = tilesFor(r.line);
    offline = { done: 0, total: urls.length };
    drawBody();
    let fail = 0;
    const queue = [...urls];
    const worker = async () => {
      while (queue.length) {
        const u = queue.shift();
        try {
          const res = await fetch(u, { mode: 'cors' });
          if (!res.ok) fail++;
        } catch {
          fail++;
        }
        offline.done++;
        if (offline.done % 5 === 0 || offline.done === offline.total) drawBody();
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    offline = null;
    if (fail < urls.length / 2) {
      state.cache['off:' + r.id] = { at: Date.now(), n: urls.length - fail };
      save();
      toast(`Карта сохранена: ${urls.length - fail} фрагментов`);
    } else {
      toast('Не удалось скачать карту. Проверьте интернет');
    }
    drawBody();
  },
});

export function onPlanInput(el) {
  if (el.dataset.plan) {
    state.plan[el.dataset.plan] = el.value;
    save();
    drawBody();
  }
}

export function onGearToggle(el) {
  const id = current?.id;
  if (!id) return;
  const set = new Set(state.gear[id] || []);
  if (el.checked) set.add(el.dataset.gear);
  else set.delete(el.dataset.gear);
  state.gear[id] = [...set];
  save();
  const count = document.querySelector('.count');
  const total = document.querySelectorAll('[data-gear]').length;
  if (count) count.textContent = `${set.size} из ${total}`;
}

export { fromLocal };
