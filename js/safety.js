// Сценарии безопасности: режим «В горах», «Вы в порядке?», SOS, контрольное время, трек
import { state, save, log, cache } from './store.js';
import { app, online, routeById, age, activeRoute, gw } from './core.js';
import * as alarm from './alarm.js';
import { startMountain, stopMountain, saveBattery, status } from './sensors.js';
import { vibrate, toast } from './ui.js';
import { t, t as i18n, pl, num } from './i18n.js';
import { dist, nearestOnLine, cumulative, pointAt, offset, eleAt, fmtDist, compass, bearing, toDD } from './geo.js';
import { fmtTime, fmtDay, dayKey, fromLocal } from './time.js';
import { loadForecast, dayOf } from './weather.js';
import { NEARBY } from './data/people.js';

const renderAlert = () => app.renderAlert?.();

export const posPayload = () => (state.pos ? { lat: state.pos.lat, lon: state.pos.lon, acc: state.pos.acc, alt: state.pos.alt, t: state.pos.t } : null);

export function nearbyPeople() {
  if (!state.pos || state.settings.share === 'none') return [];
  return NEARBY.map((n) => {
    const [lat, lon] = offset([state.pos.lat, state.pos.lon], n.brg, n.m);
    return { ...n, lat, lon };
  });
}

// ---- «Вы в порядке?» и SOS ----

export function triggerCheck(reason, { detail = '', sec = state.settings.countdown, manual = false } = {}) {
  if (state.alert.stage !== 'idle') return;
  reason = t(reason);
  detail = t(detail);
  state.alert = { stage: 'check', reason, detail, manual, since: Date.now(), deadline: Date.now() + sec * 1000 };
  save();
  if (!manual) {
    log(t('{reason}. Ждём ответа', { reason: `${reason}${detail ? ` (${detail})` : ''}` }), 'warn');
    app.relay?.send('check', { reason, pos: posPayload() });
  }
  alarm.beeps();
  vibrate([400, 200, 400, 200, 400]);
  renderAlert();
}

export function sendSOS(reason = 'Нажата кнопка SOS', source = 'manual') {
  reason = t(reason);
  const nearby = nearbyPeople().filter((n) => n.m <= 2000).length;
  state.alert = { stage: 'sos', reason, source, since: Date.now(), rescue: online() ? 'sending' : 'offline', nearby };
  save();
  log(`SOS: ${reason}`, 'crit');
  if (state.settings.siren) alarm.siren();
  else alarm.stop();
  vibrate([1000, 300, 1000, 300, 1000]);
  const p = state.profile;
  app.relay?.send('sos', {
    reason, pos: posPayload(), medical: p?.medical, phone: p?.phone, fullName: p?.name, age: age(),
    route: activeRoute()?.title ?? null, routeId: activeRoute()?.id ?? null, battery: status.battery, companions: state.trip?.companions || [],
  });
  setTimeout(() => {
    if (state.alert.stage === 'sos' && state.alert.rescue === 'sending') {
      state.alert.rescue = 'done';
      save();
      renderAlert();
    }
  }, 1800);
  renderAlert();
}

export function imOk() {
  const was = state.alert.stage;
  const manual = state.alert.manual;
  alarm.stop();
  vibrate(0);
  state.alert = { stage: 'idle' };
  if (was === 'overdue' && state.trip) state.trip.status = 'active';
  save();
  log(t(was === 'sos' ? 'Тревога отменена: всё в порядке' : 'Ответ «Я в порядке»'), 'ok');
  if (was === 'sos' || (was === 'check' && !manual)) app.relay?.send('ok', { text: t(was === 'sos' ? 'Отбой тревоги, всё в порядке' : gw('Ответил: всё в порядке', 'Ответила: всё в порядке')), pos: posPayload() });
  renderAlert();
  app.refresh?.();
}

export function tick(now) {
  const a = state.alert;
  if (a.stage === 'check' && now >= a.deadline) {
    sendSOS(a.manual ? a.reason : t('{reason}. Нет ответа {s} с', { reason: a.reason, s: Math.round((a.deadline - a.since) / 1000) }), a.manual ? 'manual' : 'auto');
  } else if (a.stage === 'overdue' && now >= a.deadline) {
    escalateOverdue();
  }
  const trip = state.trip;
  if (trip && trip.status === 'active' && a.stage === 'idle' && now > trip.returnBy) {
    trip.status = 'overdue';
    const grace = state.profile?.demo ? 30 : 15 * 60;
    state.alert = { stage: 'overdue', since: now, deadline: now + grace * 1000 };
    save();
    log(t('Контрольное время прошло'), 'warn');
    alarm.beeps();
    vibrate([300, 200, 300]);
    renderAlert();
  }
}

function escalateOverdue() {
  alarm.stop();
  state.alert = { stage: 'idle' };
  if (state.trip) state.trip.status = 'escalated';
  app.relay?.send('overdue', { route: activeRoute()?.title, returnBy: state.trip?.returnBy, pos: posPayload() });
  log(t('Близкие получили сигнал: вы не вернулись к контрольному времени'), 'crit');
  save();
  renderAlert();
  app.refresh?.();
}

// ---- Поход ----

export function startTrip(routeId, returnBy, group, companions = []) {
  const r = routeById(routeId);
  const now = Date.now();
  // Время разворота: к середине доступного времени (без запаса) нужно быть у цели, иначе поворачивать назад
  const turnAt = now + Math.max(0, returnBy - 60 * 60e3 - now) / 2;
  state.trip = { routeId, startedAt: now, returnBy, group, companions, status: 'active', progress: 0, turnAt, warns: {}, wxAt: now };
  state.track = [];
  save();
  app.relay?.send('trip', {
    route: r.title, routeId, returnBy, group, start: r.start, companions,
    ...(r.custom ? { line: r.line, top: r.top } : {}),
  });
  const n = state.profile?.contacts?.length || 0;
  log(t('Поход начат: {route}. Контрольное время {time}. Уведомлено близких: {n}', { route: t(r.title), time: fmtTime(returnBy), n }), 'ok');
}

export function extendTrip(min = 60) {
  const trip = state.trip;
  if (!trip) return;
  trip.returnBy = Math.max(trip.returnBy, Date.now()) + min * 60e3;
  trip.status = 'active';
  if (state.alert.stage === 'overdue') {
    alarm.stop();
    state.alert = { stage: 'idle' };
  }
  save();
  app.relay?.send('extend', { returnBy: trip.returnBy });
  log(t('Контрольное время перенесено на {time}', { time: fmtTime(trip.returnBy) }));
  renderAlert();
  app.refresh?.();
}

export function endTrip() {
  const trip = state.trip;
  if (!trip) return;
  const r = routeById(trip.routeId);
  if (state.alert.stage === 'overdue') {
    alarm.stop();
    state.alert = { stage: 'idle' };
  }
  app.relay?.send('home', { route: r?.title });
  state.stats.hikes = (state.stats.hikes || 0) + 1;
  log(t('Вернулись: {route} завершён', { route: r ? t(r.title) : t('поход') }), 'ok');
  state.trip = null;
  state.demo.gps = false;
  state.demo.walk = 0;
  save();
  if (state.mountain) disableMountain(false);
  renderAlert();
  app.refresh?.();
}

let lastPosSent = 0;
export function onPos(pos) {
  if (pos.src === 'gps' && state.demo.gps) return;
  const prev = state.pos;
  state.pos = pos;
  const last = state.track[state.track.length - 1];
  if (!last || dist([last[0], last[1]], [pos.lat, pos.lon]) > 25 || pos.t - last[2] > 120e3) {
    state.track.push([pos.lat, pos.lon, pos.t]);
    if (state.track.length > 2000) state.track.shift();
  }
  const r = state.trip && routeById(state.trip.routeId);
  if (r) {
    const near = nearestOnLine(r.line, [pos.lat, pos.lon], r.cum || (r.cum = cumulative(r.line)));
    state.trip.progress = near.along;
    state.trip.off = Math.round(near.off);
    if (near.off > 150 && !state.trip.offWarned) {
      state.trip.offWarned = true;
      const n = Object.keys(state.trip.warns || {}).filter((k) => k.startsWith('off')).length;
      warn('off' + n, t('Вы в {dist} от тропы', { dist: fmtDist(near.off) }), t('Тропа на {dir}. Вернитесь по своим следам, не срезайте по склону.', { dir: compass(bearing([pos.lat, pos.lon], near.point)) }), 2);
    } else if (near.off < 80) {
      state.trip.offWarned = false;
    }
    if (pos.alt == null) pos.alt = Math.round(eleAt(r.profile, near.along / 1000));
  }
  save();
  if (state.trip && Date.now() - lastPosSent > 120e3 && state.settings.share !== 'none') {
    lastPosSent = Date.now();
    app.relay?.send('pos', { pos: posPayload(), progress: state.trip.progress });
  }
  if (!prev) app.refresh?.();
}

let lowSent = false;
let saving = false;
function onBattery(level, charging) {
  if (level <= 20 && !charging && state.mountain && state.settings.batterySaver && !saving) {
    saving = true;
    saveBattery();
    log(t('Заряд {n}%: микрофон и кодовое слово выключены, падение и GPS работают', { n: level }), 'warn');
    toast(t('Заряд {n}%: включена экономия. Падение и GPS работают', { n: level }));
  }
  if (level <= 15 && !charging && state.trip && !lowSent) {
    lowSent = true;
    app.relay?.send('battery', { level, pos: posPayload() });
    log(t('Заряд {n}%: близким отправлена последняя точка', { n: level }), 'warn');
    toast(t('Заряд {n}%. Близкие получили вашу последнюю точку', { n: level }));
  }
}

// ---- Режим «В горах» ----

export async function enableMountain() {
  alarm.unlockAudio();
  state.mountain = true;
  app.resumeNeeded = false;
  save();
  app.refresh?.();
  await startMountain(state.settings, {
    onFall: (e) => triggerCheck(e.kind === 'fall' ? 'Похоже на падение' : 'Сильный удар', { detail: e.freeMs ? t('{g} g, свободное падение {ms} мс', { g: num(e.g), ms: e.freeMs }) : `${num(e.g)} g` }),
    onScream: () => triggerCheck('Громкий крик', { detail: 'дольше 0,7 с' }),
    onImpact: () => {},
    onCodeWord: (w) => {
      if (state.alert.stage !== 'sos') sendSOS(t('Кодовое слово «{w}»', { w }), 'voice');
    },
    onPos,
    onBattery,
  });
  log(t('Режим «В горах» включён'));
  app.refresh?.();
}

export function disableMountain(refresh = true) {
  stopMountain();
  state.mountain = false;
  save();
  log(t('Режим «В горах» выключен'));
  if (refresh) app.refresh?.();
}

// ---- Демо ----

export function demoWalk(step = 0.08) {
  const r = activeRoute();
  if (!r) return toast(t('Сначала выберите маршрут'));
  state.demo.gps = true;
  state.demo.walk = Math.min(1, (state.demo.walk || 0) + step);
  const cum = r.cum || (r.cum = cumulative(r.line));
  const [lat, lon] = pointAt(r.line, state.demo.walk, cum);
  onPos({ lat, lon, acc: 8, alt: Math.round(eleAt(r.profile, (cum[cum.length - 1] * state.demo.walk) / 1000)), t: Date.now(), src: 'demo' });
  app.refresh?.();
}

// ---- Подсказки в пути: помочь решить до того, как станет опасно ----

const SUNSET = ['16:50', '17:25', '17:55', '18:25', '18:55', '19:25', '19:25', '19:00', '18:10', '17:20', '16:40', '16:30'];

export function warn(key, title, text, level = 2) {
  const trip = state.trip;
  if (!trip) return;
  trip.warns ||= {};
  if (trip.warns[key]) return;
  trip.warns[key] = { title, text, level, t: Date.now() };
  save();
  log(`${title}. ${text}`, level >= 3 ? 'crit' : 'warn');
  toast(title);
  vibrate([300, 150, 300]);
  alarm.chime();
  app.relay?.send('warn', { title, text });
  app.refresh?.();
}

export const activeWarns = () => Object.values(state.trip?.warns || {}).sort((a, b) => b.t - a.t);

let wxBusy = false;
export function tripWatch(now = Date.now()) {
  const trip = state.trip;
  if (!trip || trip.status !== 'active') return;
  const r = routeById(trip.routeId);
  if (!r) return;
  const cum = r.cum || (r.cum = cumulative(r.line));
  const oneWay = cum[cum.length - 1];
  if (r.kind === 'out' && trip.turnAt && now >= trip.turnAt && !(trip.progress >= oneWay * 0.9)) {
    warn('turn', t('Время разворота {time}', { time: fmtTime(trip.turnAt) }), t('Если вы ещё не у цели, поворачивайте назад: иначе не успеете к контрольному времени {time}.', { time: fmtTime(trip.returnBy) }), 2);
  }
  if (r.kind === 'loop' && trip.progress && now >= trip.startedAt + (trip.returnBy - trip.startedAt) / 2 && trip.progress < oneWay * 0.35) {
    warn('behind', t('Отстаёте от графика'), t('Прошла половина времени, а пройдено {p}% кольца. Вернуться той же дорогой может быть быстрее.', { p: Math.round((trip.progress / oneWay) * 100) }), 2);
  }
  const fc = cache.get('wx:' + r.id);
  const sunset = fc ? dayOf(fc, now).sunset : fromLocal(dayKey(now), SUNSET[new Date(now).getMonth()]);
  if (now >= sunset && now < sunset + 4 * 3600e3) warn('dark', t('Стемнело: закат был в {time}', { time: fmtTime(sunset) }), t('Включите налобный фонарь, идите медленно и держитесь вместе. Не срезайте тропу.'), 2);
  else if (now >= sunset - 60 * 60e3 && now < sunset) warn('sunset', t('До заката час ({time})', { time: fmtTime(sunset) }), t('Достаньте налобный фонарь и начинайте спуск, пока светло.'), 1);
  if (online() && !wxBusy && now - (trip.wxAt || 0) > 30 * 60e3) {
    wxBusy = true;
    trip.wxAt = now;
    loadForecast(r, cache, { force: true, online: true }).then((f) => {
      wxBusy = false;
      if (!f || state.trip !== trip) return;
      checkForecast(f, now);
    }).catch(() => (wxBusy = false));
  }
}

export function checkForecast(f, now = Date.now()) {
  const next = f.hours.filter((h) => h.t >= now - 1800e3 && h.t <= now + 3 * 3600e3);
  const storm = next.find((h) => h.code >= 95);
  if (storm) warn('storm' + dayKey(storm.t) + fmtTime(storm.t), t('Гроза около {time}', { time: fmtTime(storm.t) }), t('Уйдите с гребня и вершины, не стойте под одиноким деревом, держитесь дальше от воды.'), 3);
  const gust = next.find((h) => h.gust >= 60);
  if (gust) warn('gust' + fmtTime(gust.t), t('Порывы до {v} км/ч около {time}', { v: Math.round(gust.gust), time: fmtTime(gust.t) }), t('Спуститесь с открытых участков и гребня.'), 2);
  const rain = next.find((h) => h.pop >= 80);
  if (rain && !storm) warn('rain' + fmtTime(rain.t), t('Сильные осадки около {time}', { time: fmtTime(rain.t) }), t('Тропа станет скользкой. Наденьте мембрану, осторожнее на камнях и бродах.'), 1);
}

// Маршрутный лист: оставить близким или отправить в службу спасения перед сложным выходом
export function routeSheet() {
  const p = state.profile;
  const trip = state.trip;
  const r = activeRoute();
  const m = p.medical || {};
  const start = trip ? trip.startedAt : Date.now();
  const tr = (k, v) => i18n(k, v);
  return [
    tr('МАРШРУТНЫЙ ЛИСТ'),
    tr('Турист: {name}, {age} {years}, тел. {phone}', { name: p.name, age: age(), years: pl(age(), 'год|года|лет'), phone: p.phone || tr('не указан') }),
    tr('Группа: {n} чел.', { n: trip?.group || state.plan.group || 1 }) + (trip?.companions?.length ? ` (${trip.companions.join(', ')})` : ''),
    r ? tr('Маршрут: {route}. Старт: {start}. Высшая точка {ele} м, путь {km} км', { route: tr(r.title), start: tr(r.start), ele: r.maxEle, km: num(r.walkKm) }) : tr('Маршрут: не выбран'),
    r ? tr('Точка старта: {pt}', { pt: toDD(r.line[0][0], r.line[0][1]) }) : '',
    tr('Выход: {day}, {time}', { day: fmtDay(start), time: fmtTime(start) }),
    trip ? tr('Контрольное время: {day}, {time}', { day: fmtDay(trip.returnBy), time: fmtTime(trip.returnBy) }) : '',
    tr('Близкие: {list}', { list: p.contacts.map((c) => `${c.name} ${c.phone}`).join('; ') }),
    tr('Кровь: {blood}. Аллергии: {allergies}. Хронические: {chronic}', {
      blood: m.blood || tr('не указана'), allergies: m.allergies?.map((x) => tr(x)).join(', ') || tr('нет'), chronic: m.chronic?.map((x) => tr(x)).join(', ') || tr('нет'),
    }),
    tr('Если к контрольному времени нет связи - звоните 112.'),
  ].filter(Boolean).join('\n');
}
