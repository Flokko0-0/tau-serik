// Экран близкого: получает зашифрованные события по семейному коду
import { listen, postFamily, pushTopicFor } from './relay.js';
import { esc, icon, toast, vibrate, copy } from './ui.js';
import { toDD, toDMS } from './geo.js';
import { fmtTime, fmtDay, ago } from './time.js';
import { ROUTES } from './data/routes.js';
import { createMap, routeLayer, meMarker } from './mapview.js';
import { paintAll } from './topo.js';
import * as alarm from './alarm.js';

const $app = document.getElementById('app');
// Код из ссылки запоминается: в следующий раз страницу можно открыть без него
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};
const code = location.hash.replace(/\D/g, '') || store.get('ts-guardian-code') || '';
if (code.length === 8) store.set('ts-guardian-code', code);
let who = store.get('ts-guardian-name') || '';
let asked = null;
let askWarned = false;
let pushTopic = '';
if (code.length === 8) pushTopicFor(code).then((t) => (pushTopic = t));
const GRACE = 15 * 60e3;
const S = { connected: false, name: '', g: 'm', status: 'none', trip: null, pos: null, sos: null, check: null, events: [], track: [] };
let sound = false;
let map = null;
let layers = null;
let opened = Date.now();

const gw = (m, f) => (S.g === 'f' ? f : m);
const TEXT = {
  trip: (e) => `Начат поход: ${e.route}. Контрольное время ${fmtTime(e.returnBy)}`,
  pos: () => 'Обновлена точка на маршруте',
  check: (e) => `Датчик: ${e.reason}. Ждём ответа`,
  ok: (e) => e.text || 'Всё в порядке',
  sos: (e) => `SOS: ${e.reason}`,
  overdue: (e) => `${gw('Не вернулся', 'Не вернулась')} к контрольному времени ${fmtTime(e.returnBy)}`,
  extend: (e) => `Контрольное время перенесено на ${fmtTime(e.returnBy)}`,
  home: (e) => `${gw('Вернулся', 'Вернулась')}: ${e.route || 'поход завершён'}`,
  battery: (e) => `Заряд ${e.level}%: пришла последняя точка`,
  company: (e) => `Компания: ${e.with}, ${e.route}`,
  warn: (e) => `Предупреждение: ${e.title}`,
  ask: (e) => `${e.who || 'Близкий'} спросил(а): всё в порядке?`,
};

function apply(e, live) {
  S.name = e.name || S.name;
  S.g = e.g || S.g;
  if (e.pos) {
    S.pos = e.pos;
    S.track.push([e.pos.lat, e.pos.lon]);
  }
  if (e.type !== 'pos') S.events.unshift(e);
  switch (e.type) {
    case 'trip': S.trip = e; S.status = 'trip'; S.sos = null; S.warns = []; S.localOverdue = false; S.track = e.pos ? [[e.pos.lat, e.pos.lon]] : []; break;
    case 'extend': if (S.trip) S.trip.returnBy = e.returnBy; if (S.status === 'overdue') S.status = 'trip'; S.localOverdue = false; break;
    case 'check': S.check = e; if (S.status !== 'sos') S.status = 'check'; break;
    case 'ok': S.sos = null; S.check = null; S.status = S.trip ? 'trip' : 'none'; asked = null; break;
    case 'warn': (S.warns ||= []).unshift(e); break;
    case 'sos': S.sos = e; S.status = 'sos'; break;
    case 'overdue': if (S.status !== 'sos') S.status = 'overdue'; break;
    case 'home': S.trip = null; S.sos = null; S.status = 'home'; break;
    default: break;
  }
  if (live && ['sos', 'overdue', 'check'].includes(e.type)) raise(e);
  if (live && e.type === 'warn') vibrate([200, 100, 200]);
  if (live && ['ok', 'home'].includes(e.type)) calm();
}

function raise(e) {
  vibrate([800, 200, 800, 200, 800]);
  if (sound) (e.type === 'check' ? alarm.beeps : alarm.siren)();
  let n = 0;
  clearInterval(raise.t);
  raise.t = setInterval(() => {
    document.title = n++ % 2 ? `${e.type === 'sos' ? 'SOS' : 'Внимание'}: ${S.name}` : 'Экран близкого';
    if (n > 60) clearInterval(raise.t);
  }, 800);
}

function calm() {
  alarm.stop();
  clearInterval(raise.t);
  document.title = 'Экран близкого · Тау Серік';
}

function codeForm() {
  return `<main class="main">
    <section class="hero"><canvas class="topo" aria-hidden="true"></canvas>
      <div class="hero-in"><span class="logo">${icon('shield-heart')}</span><h1 class="display" style="font-size:52px">Экран близкого</h1>
      <p class="lead">Маршрут, контрольное время и SOS человека, который ушёл в горы.</p></div></section>
    <form class="pad stack" id="code-form">
      <div class="field"><label for="g-code">Семейный код из приложения туриста</label>
        <input id="g-code" class="input mono" inputmode="numeric" maxlength="9" placeholder="0000-0000" autocomplete="off" required></div>
      <button class="btn btn-primary btn-block btn-lg">Подключиться</button>
      <p class="small muted">Код есть в профиле туриста. Сообщения зашифрованы этим кодом: без него их не прочитать.</p>
    </form>
  </main>`;
}

// Свой маршрут туриста приходит линией прямо в событии
function routeOf(t) {
  if (!t) return null;
  return ROUTES.find((x) => x.id === t.routeId) || (t.line ? { id: t.routeId, title: t.route, custom: true, line: t.line, top: t.top || t.line[t.line.length - 1], start: t.start, maxEle: 0 } : null);
}

function statusCard() {
  const n = esc(S.name || 'Турист');
  const r = routeOf(S.trip);
  if (S.status === 'sos') {
    const e = S.sos;
    const p = e.pos;
    const m = e.medical || {};
    return `<section class="g-sos">
      <h2 class="ov-title">SOS</h2>
      <p class="g-sos-t"><b>${n} нужна помощь.</b> ${esc(e.reason)}. ${fmtTime(e.t)}, ${ago(e.t)}.</p>
      ${p ? `<div class="coords"><span class="label">Координаты</span><div class="coords-dd mono">${toDD(p.lat, p.lon)}</div><div class="coords-dms mono">${toDMS(p.lat, p.lon)}</div><div class="coords-m">${p.alt ? `Высота ${p.alt} м · ` : ''}±${p.acc} м${e.route ? ` · ${esc(e.route)}` : ''}</div></div>` : '<p>Координаты неизвестны.</p>'}
      <div class="ov-grid">
        <a class="ov-a" href="tel:112">${icon('phone-call')}<span>Позвонить 112</span></a>
        ${e.phone ? `<a class="ov-a" href="tel:${esc(e.phone.replace(/[^\d+]/g, ''))}">${icon('phone')}<span>Позвонить: ${n}</span></a>` : ''}
        ${p ? `<a class="ov-a" href="https://maps.google.com/?q=${p.lat},${p.lon}" target="_blank" rel="noopener">${icon('map-pin')}<span>Открыть в картах</span></a>` : ''}
        <button class="ov-a" data-g="calm">${icon('volume-off')}<span>Выключить звук</span></button>
      </div>
      <dl class="g-med">
        <div><dt>Кровь</dt><dd>${esc(m.blood || 'не указана')}</dd></div>
        <div><dt>Аллергии</dt><dd>${esc(m.allergies?.join(', ') || 'нет')}</dd></div>
        <div><dt>Хронические</dt><dd>${esc(m.chronic?.join(', ') || 'нет')}</dd></div>
        <div><dt>Лекарства</dt><dd>${esc(m.meds || 'нет')}</dd></div>
      </dl>
      <p class="small">Сообщите спасателям 112 координаты, маршрут и медкарту с этого экрана.</p>
    </section>`;
  }
  const map = {
    none: ['hourglass', '', `Пока тихо. Когда ${n === 'Турист' ? 'турист' : n} начнёт поход, здесь появятся маршрут и точка.`],
    trip: ['walk', 'ok', `${n} в походе${r ? `: ${esc(r.title)}` : ''}. Контрольное время ${fmtTime(S.trip?.returnBy)}.${S.trip?.companions?.length ? ` Идёт с: ${esc(S.trip.companions.join(', ').replace(/\.$/, ''))}.` : ''}`],
    check: ['alert-triangle', 'warn', `Сработал датчик: ${esc(S.check?.reason)}. Телефон ждёт ответа от ${n}.`],
    overdue: ['clock-exclamation', 'high', `${n} ${gw('не отметился', 'не отметилась')} к контрольному времени ${fmtTime(S.trip?.returnBy)}.${S.localOverdue ? ' Сигнала с телефона нет: возможно, сел заряд или нет связи.' : ''} Позвоните. Если не отвечает - звоните 112 и передайте последнюю точку.`],
    home: ['home', 'ok', `${n} ${gw('вернулся', 'вернулась')}. Поход завершён.`],
  }[S.status];
  const warns = S.status === 'trip' ? (S.warns || []).slice(0, 2).map((w) => `<p class="callout warn">${icon('alert-triangle')}<span><b>${esc(w.title)}</b> ${esc(w.text || '')}</span></p>`).join('') : '';
  return `<section class="g-status g-${map[1]}">${icon(map[0] === 'hourglass' ? 'clock' : map[0])}<p>${map[2]}</p></section>${warns}`;
}

function askBlock() {
  if (!S.trip || S.status === 'home') return '';
  if (asked) {
    const waited = Date.now() - asked;
    return `<p class="callout ${waited > 10 * 60e3 ? 'warn' : ''}">${icon('clock')}<span>${waited > 10 * 60e3 ? 'Ответа нет больше 10 минут. Позвоните. Возможно, в ущелье нет связи.' : 'Вопрос отправлен. Ждём ответа: он придёт сюда.'}</span></p>`;
  }
  return `<form class="ask-row" id="ask-form">
    <label class="sr" for="g-who">Как вас подписать</label>
    <input id="g-who" class="input" value="${esc(who)}" placeholder="Мама" maxlength="30">
    <button class="btn btn-primary">${icon('message')}Спросить: всё в порядке?</button>
  </form>`;
}

function pushBlock() {
  return `<details class="card how">
    <summary>${icon('bell-ringing')}Уведомления, когда страница закрыта</summary>
    <ol class="steps small-steps">
      <li><b>Установите ntfy</b><span>Бесплатное приложение для Android и iPhone (Google Play, App Store).</span></li>
      <li><b>Подпишитесь на канал</b><span>В ntfy нажмите «+» и вставьте канал: <code class="mono">${esc(pushTopic)}</code> <button class="link" data-g="copyTopic">скопировать</button></span></li>
      <li><b>Готово</b><span>При SOS, падении и невозвращении телефон громко уведомит. Координаты и медкарта только здесь, на этой странице.</span></li>
    </ol>
  </details>`;
}

function page() {
  return `<header class="top">
      <span class="brand"><span class="logo">${icon('shield-heart')}</span><span>Близкий</span></span>
      <span class="top-sp"></span>
      <span class="net ${S.connected ? '' : 'off'}">${icon(S.connected ? 'wifi' : 'wifi-off')}<span>${S.connected ? 'На связи' : 'Подключаемся'}</span></span>
    </header>
    <main class="main">
      ${!sound ? `<button class="g-sound" data-g="sound">${icon('volume')}Включить звук тревоги на этом телефоне</button>` : ''}
      <div class="pad stack">
        ${statusCard()}
        ${askBlock()}
        ${S.trip || S.pos ? `<div class="route-map g-map" data-map aria-label="Карта: маршрут и последняя точка"></div>
          ${S.pos ? `<p class="small muted">Последняя точка ${fmtTime(S.pos.t)}, ${ago(S.pos.t)} · ${toDD(S.pos.lat, S.pos.lon)}</p>` : ''}` : ''}
        <section class="sec">
          <h2 class="h2">События</h2>
          ${S.events.length ? `<ol class="journal">${S.events.slice(0, 30).map((e) => `<li class="j-${e.type === 'sos' || e.type === 'overdue' ? 'crit' : e.type === 'check' ? 'warn' : e.type === 'ok' || e.type === 'home' ? 'ok' : 'info'}"><time>${fmtTime(e.t)}</time><span>${esc((TEXT[e.type] || (() => e.type))(e))}</span></li>`).join('')}</ol>`
            : '<p class="muted">Событий за последние 12 часов нет.</p>'}
        </section>
        ${pushBlock()}
        <p class="small muted">Код ${code.slice(0, 4)}-${code.slice(4)} · ${fmtDay(Date.now())}. Если турист не отметится через 15 минут после контрольного времени, эта страница поднимет тревогу сама, даже если его телефон разрядился.</p>
      </div>
    </main>`;
}

function draw() {
  if (!code) {
    $app.innerHTML = codeForm();
    paintAll($app);
    return;
  }
  map?.map.remove();
  map = null;
  $app.innerHTML = page();
  const el = $app.querySelector('[data-map]');
  if (el && window.L) {
    const r = routeOf(S.trip);
    map = createMap(el, { center: S.pos ? [S.pos.lat, S.pos.lon] : r ? r.top : [43.1, 77.02], zoom: 13 });
    layers = window.L.layerGroup().addTo(map.map);
    if (r) routeLayer(r).addTo(layers);
    if (S.track.length > 1) window.L.polyline(S.track, { className: 'track-line', weight: 3 }).addTo(layers);
    if (S.pos) {
      meMarker(S.pos).addTo(layers);
      map.map.setView([S.pos.lat, S.pos.lon], 14);
    } else if (r) {
      map.map.fitBounds(window.L.polyline(r.line).getBounds(), { padding: [20, 20] });
    }
  }
}

let drawT = null;
const redraw = () => {
  clearTimeout(drawT);
  drawT = setTimeout(draw, 120);
};

document.addEventListener('submit', (e) => {
  if (e.target.id !== 'code-form') return;
  e.preventDefault();
  const v = document.getElementById('g-code').value.replace(/\D/g, '');
  if (v.length !== 8) return toast('Код состоит из 8 цифр');
  location.hash = v;
  location.reload();
});

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-g]');
  if (!el) return;
  if (el.dataset.g === 'sound') {
    sound = alarm.unlockAudio();
    toast(sound ? 'Звук включён: при SOS телефон завоет сиреной' : 'Звук недоступен в этом браузере');
    if (S.status === 'sos') alarm.siren();
    draw();
  }
  if (el.dataset.g === 'calm') calm();
  if (el.dataset.g === 'copyTopic') copy(pushTopic, 'Канал скопирован: вставьте его в ntfy');
});

document.addEventListener('submit', async (e) => {
  if (e.target.id !== 'ask-form') return;
  e.preventDefault();
  who = document.getElementById('g-who').value.trim() || 'Близкий';
  store.set('ts-guardian-name', who);
  try {
    await postFamily(code, { v: 1, type: 'ask', from: 'guardian', who, id: String(Date.now()), t: Date.now() });
    asked = Date.now();
    toast('Вопрос отправлен. У туриста появится кнопка «Всё хорошо»');
  } catch {
    toast('Не отправилось: нет сети');
  }
  draw();
});

// Контрольное время проверяется и здесь: тревога поднимется, даже если телефон туриста сел
setInterval(() => {
  if (S.status === 'trip' && S.trip?.returnBy && Date.now() > S.trip.returnBy + GRACE && !S.localOverdue) {
    S.localOverdue = true;
    S.status = 'overdue';
    S.events.unshift({ type: 'overdue', t: Date.now(), returnBy: S.trip.returnBy, local: true });
    raise({ type: 'overdue' });
    draw();
  }
  if (asked && Date.now() - asked > 10 * 60e3 && !askWarned) {
    askWarned = true;
    draw();
  }
}, 20000);

window.addEventListener('hashchange', () => location.reload());

draw();
if (code.length === 8) {
  listen(code, (e, t) => {
    const live = t >= opened - 5000;
    apply(e, live);
    redraw();
  }, (ok) => {
    S.connected = ok;
    const net = $app.querySelector('.net');
    if (net) net.outerHTML = `<span class="net ${ok ? '' : 'off'}">${icon(ok ? 'wifi' : 'wifi-off')}<span>${ok ? 'На связи' : 'Подключаемся'}</span></span>`;
  });
}
