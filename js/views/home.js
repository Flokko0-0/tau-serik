import { state } from '../store.js';
import { app, on, routeById, activeRoute, age, gw } from '../core.js';
import { esc, icon, plural, copy, toast } from '../ui.js';
import { status } from '../sensors.js';
import { enableMountain, disableMountain, endTrip, extendTrip, triggerCheck, activeWarns, routeSheet } from '../safety.js';
import { PLACES } from '../data/places.js';
import { nearest, fmtDist, compass } from '../geo.js';
import { fmtTime, fmtLeft, ago } from '../time.js';

const SENSOR_TEXT = {
  on: 'слежу', demo: 'демо-трек', off: 'выключено', denied: 'нет доступа', unsupported: 'нет в браузере', nodata: 'нет датчика', search: 'поиск…',
};

function sensor(key, ic, label, extra = '') {
  const st = key === 'gps' && state.demo.gps ? 'demo' : state.mountain ? status[key] : 'off';
  const cls = st === 'on' || st === 'demo' ? 'on' : st === 'off' ? '' : 'bad';
  return `<div class="sensor ${cls}" data-sensor="${key}">
    ${icon(ic)}<div><div class="sensor-k">${label}</div><div class="sensor-v">${SENSOR_TEXT[st] ?? st}${extra}</div></div>
  </div>`;
}

export function sensorsBlock() {
  const gps = state.pos ? ` ±${state.pos.acc} м` : '';
  return `<div class="sensors">
    ${sensor('fall', 'activity', 'Падение', state.mountain && status.fall === 'on' ? ` · ${status.g.toFixed(1).replace('.', ',')} g` : '')}
    ${sensor('sound', 'microphone', 'Крик')}
    ${sensor('speech', 'message', 'Кодовое слово', state.mountain && status.heard ? ` · «${esc(status.heard.slice(-18))}»` : '')}
    ${sensor('gps', 'current-location', 'GPS', (state.mountain && status.gps === 'on') || state.demo.gps ? gps : '')}
  </div>`;
}

export function live() {
  const el = document.querySelector('.hero .sensors');
  if (el) el.outerHTML = sensorsBlock();
}

function hero() {
  const p = state.profile;
  const on = state.mountain;
  return `<section class="hero">
    <canvas class="topo" aria-hidden="true"></canvas>
    <div class="hero-in">
      <p class="hero-hi">${esc(p.name.split(' ')[0])}, ${on ? 'датчики работают' : 'перед тропой включите защиту'}</p>
      <button class="mode ${on ? 'on' : ''}" data-act="${on ? 'mountainOff' : 'mountainOn'}" aria-pressed="${on}">
        <span class="mode-t">В горах</span>
        <span class="switch" aria-hidden="true"><span></span></span>
      </button>
      ${app.resumeNeeded && !on ? `<p class="hero-note">${icon('info-circle')}Страница перезагрузилась. Нажмите, чтобы снова включить датчики.</p>` : ''}
      ${sensorsBlock()}
      ${on && status.sound === 'on' ? '<div class="meter" aria-hidden="true"><span data-meter></span></div>' : ''}
      ${!on ? '<p class="hero-sub">Телефон заметит падение, крик или кодовое слово и спросит, всё ли в порядке. Не ответите - SOS уйдёт близким.</p>' : ''}
    </div>
  </section>`;
}

function trip() {
  const t = state.trip;
  if (!t) {
    const r = routeById(state.plan.routeId);
    return `<section class="card trip-empty">
      <div>
        <h2 class="h3">${r ? esc(r.title) : 'Куда идём?'}</h2>
        <p class="muted">${r ? 'Проверьте погоду и риск, затем начните поход.' : 'Выберите маршрут: покажем погоду наверху, риск и что взять.'}</p>
      </div>
      <button class="btn btn-primary" data-go="${r ? 'route' : 'routes'}" data-id="${r?.id ?? ''}">${r ? 'К маршруту' : 'Маршруты'}${icon('chevron-right')}</button>
    </section>`;
  }
  const r = routeById(t.routeId);
  const total = r.walkKm * 1000;
  const done = Math.min(total, t.progress || 0);
  const left = t.returnBy - Date.now();
  const late = t.status !== 'active';
  return `<section class="card trip ${late ? 'late' : ''}">
    <div class="trip-top">
      <span class="label">В походе с ${fmtTime(t.startedAt)}</span>
      <button class="link" data-go="route" data-id="${r.id}">Маршрут</button>
    </div>
    <h2 class="h3">${esc(r.title)}</h2>
    <div class="deadline">
      <div>
        <div class="deadline-k">Контрольное время</div>
        <div class="deadline-v">${fmtTime(t.returnBy)}</div>
      </div>
      <div class="deadline-left ${late ? 'crit' : left < 3600e3 ? 'warn' : ''}">
        <div class="deadline-k">${late ? 'Просрочено' : 'Осталось'}</div>
        <div class="deadline-v" data-left="${t.returnBy}">${fmtLeft(Math.abs(left))}</div>
      </div>
    </div>
    ${t.progress ? `<div class="progress" role="img" aria-label="Пройдено ${(done / 1000).toFixed(1)} из ${r.walkKm} км"><span style="width:${Math.round((done / total) * 100)}%"></span></div>
    <p class="small muted">Пройдено ${(done / 1000).toFixed(1).replace('.', ',')} км по треку${t.off > 150 ? ` · <b class="t-warn">вы в ${fmtDist(t.off)} от тропы</b>` : ''}</p>` : ''}
    ${r.kind === 'out' && t.turnAt ? `<p class="small">${icon('arrow-back-up', 'inline')}Развернуться не позже <b>${fmtTime(t.turnAt)}</b>, если не дошли до цели</p>` : ''}
    ${t.companions?.length ? `<p class="small">${icon('users', 'inline')}Идёте с: ${esc(t.companions.join(', '))}</p>` : ''}
    ${activeWarns().slice(0, 3).map((w) => `<p class="callout ${w.level >= 3 ? 'crit' : 'warn'}">${icon('alert-triangle')}<span><b>${esc(w.title)}</b> ${esc(w.text)}</span></p>`).join('')}
    ${t.status === 'escalated' ? `<p class="callout crit">${icon('bell-ringing')}Близкие получили сигнал, что вы не вернулись. Отметьтесь, если всё хорошо.</p>` : ''}
    <div class="row-btns">
      <button class="btn btn-primary" data-act="home">${icon('home')}Я ${gw('вернулся', 'вернулась')}</button>
      <button class="btn" data-act="extend">${icon('clock')}+1 час</button>
    </div>
    <div class="row-btns two">
      <button class="btn btn-ghost" data-act="sheet">${icon('share')}Маршрутный лист</button>
      ${state.mountain ? `<button class="btn btn-ghost" data-act="pocket">${icon('moon')}Экран в карман</button>` : ''}
    </div>
  </section>`;
}

function nearby() {
  if (!state.pos) return '';
  const from = [state.pos.lat, state.pos.lon];
  const items = ['rescue', 'hut', 'water', 'toilet'].map((k) => nearest(from, PLACES, [k], 1)[0]).filter(Boolean);
  const KIND = { rescue: ['lifebuoy', 'Спасатели'], hut: ['building-cottage', 'Хижина'], water: ['droplet', 'Вода'], toilet: ['toilet-paper', 'Туалет'] };
  return `<section class="sec">
    <div class="sec-h"><h2 class="h2">Рядом</h2><button class="link" data-go="map">Карта</button></div>
    <ul class="list">
      ${items.map((p) => `<li class="row">
        <span class="row-ic k-${p.kind}">${icon(KIND[p.kind][0])}</span>
        <div class="row-t"><b>${esc(p.name)}</b><span class="muted small">${KIND[p.kind][1]}${p.ele ? ` · ${p.ele} м` : ''}</span></div>
        <div class="row-end"><span class="dir" style="--brg:${Math.round(p.brg)}deg">${icon('arrow-up')}</span><span class="nowrap"><b>${fmtDist(p.d)}</b> ${compass(p.brg)}</span></div>
      </li>`).join('')}
    </ul>
  </section>`;
}

function quick() {
  const n = state.profile.contacts.length;
  return `<section class="quick">
    <button class="q" data-go="assistant">${icon('message-chatbot')}<b>Что взять?</b><span>Помощник по погоде и маршруту</span></button>
    <button class="q" data-go="aid">${icon('first-aid-kit')}<b>Первая помощь</b><span>17 памяток без интернета</span></button>
    <button class="q" data-go="company">${icon('users')}<b>Компания</b><span>Попутчики с проверкой eGov</span></button>
    <button class="q" data-go="profile" data-id="contacts">${icon('shield-heart')}<b>Близкие</b><span>${n} ${plural(n, 'контакт', 'контакта', 'контактов')} получат SOS</span></button>
  </section>`;
}

function journal() {
  if (!state.log.length) return '';
  return `<section class="sec">
    <div class="sec-h"><h2 class="h2">Журнал</h2></div>
    <ol class="journal">
      ${state.log.slice(0, 6).map((e) => `<li class="j-${e.kind}"><time>${fmtTime(e.t)}</time><span>${esc(e.text)}</span></li>`).join('')}
    </ol>
  </section>`;
}

export default {
  tab: 'home',
  render() {
    const a = age();
    const teen = a != null && a < 18;
    return `${hero()}
      <div class="pad stack">
        ${trip()}
        <button class="sos-big" data-act="sosPress">
          <span class="sos-big-t">SOS</span>
          <span class="sos-big-s">Сигнал близким${teen ? ' и родителям' : ''} с координатами и медкартой</span>
        </button>
        ${quick()}
        ${nearby()}
        ${journal()}
      </div>`;
  },
};

on({
  mountainOn: () => enableMountain(),
  mountainOff: () => disableMountain(),
  home: () => endTrip(),
  extend: () => extendTrip(60),
  sheet: async () => {
    const text = routeSheet();
    try {
      await navigator.share({ title: 'Маршрутный лист', text });
    } catch {
      copy(text, 'Маршрутный лист скопирован: отправьте близким или в службу спасения');
    }
  },
  pocket: () => {
    app.pocket = true;
    app.renderAlert();
    toast('Экран затемнён, датчики работают. Удерживайте, чтобы выйти');
  },
  sosPress: () => {
    if (state.alert.stage === 'idle') triggerCheck('Нажата кнопка SOS', { sec: 5, manual: true });
  },
});
