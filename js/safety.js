// Сценарии безопасности: режим «В горах», «Вы в порядке?», SOS, контрольное время, трек
import { state, save, log } from './store.js';
import { app, online, routeById, age, activeRoute, gw } from './core.js';
import * as alarm from './alarm.js';
import { startMountain, stopMountain, status } from './sensors.js';
import { vibrate, toast } from './ui.js';
import { dist, nearestOnLine, cumulative, pointAt, offset, eleAt } from './geo.js';
import { fmtTime } from './time.js';
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
  state.alert = { stage: 'check', reason, detail, manual, since: Date.now(), deadline: Date.now() + sec * 1000 };
  save();
  if (!manual) {
    log(`${reason}${detail ? ` (${detail})` : ''}. Ждём ответа`, 'warn');
    app.relay?.send('check', { reason, pos: posPayload() });
  }
  alarm.beeps();
  vibrate([400, 200, 400, 200, 400]);
  renderAlert();
}

export function sendSOS(reason = 'Нажата кнопка SOS', source = 'manual') {
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
    route: activeRoute()?.title ?? null, routeId: activeRoute()?.id ?? null, battery: status.battery,
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
  log(was === 'sos' ? 'Тревога отменена: всё в порядке' : 'Ответ «Я в порядке»', 'ok');
  if (was === 'sos' || (was === 'check' && !manual)) app.relay?.send('ok', { text: was === 'sos' ? 'Отбой тревоги, всё в порядке' : `${gw('Ответил', 'Ответила')}: всё в порядке`, pos: posPayload() });
  renderAlert();
  app.refresh?.();
}

export function tick(now) {
  const a = state.alert;
  if (a.stage === 'check' && now >= a.deadline) {
    sendSOS(a.manual ? a.reason : `${a.reason}. Нет ответа ${Math.round((a.deadline - a.since) / 1000)} с`, a.manual ? 'manual' : 'auto');
  } else if (a.stage === 'overdue' && now >= a.deadline) {
    escalateOverdue();
  }
  const t = state.trip;
  if (t && t.status === 'active' && a.stage === 'idle' && now > t.returnBy) {
    t.status = 'overdue';
    const grace = state.profile?.demo ? 30 : 15 * 60;
    state.alert = { stage: 'overdue', since: now, deadline: now + grace * 1000 };
    save();
    log('Контрольное время прошло', 'warn');
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
  log('Близкие получили сигнал: вы не вернулись к контрольному времени', 'crit');
  save();
  renderAlert();
  app.refresh?.();
}

// ---- Поход ----

export function startTrip(routeId, returnBy, group) {
  const r = routeById(routeId);
  state.trip = { routeId, startedAt: Date.now(), returnBy, group, status: 'active', progress: 0 };
  state.track = [];
  save();
  app.relay?.send('trip', { route: r.title, routeId, returnBy, group, start: r.start });
  const n = state.profile?.contacts?.length || 0;
  log(`Поход начат: ${r.title}. Контрольное время ${fmtTime(returnBy)}. Уведомлено близких: ${n}`, 'ok');
}

export function extendTrip(min = 60) {
  const t = state.trip;
  if (!t) return;
  t.returnBy = Math.max(t.returnBy, Date.now()) + min * 60e3;
  t.status = 'active';
  if (state.alert.stage === 'overdue') {
    alarm.stop();
    state.alert = { stage: 'idle' };
  }
  save();
  app.relay?.send('extend', { returnBy: t.returnBy });
  log(`Контрольное время перенесено на ${fmtTime(t.returnBy)}`);
  renderAlert();
  app.refresh?.();
}

export function endTrip() {
  const t = state.trip;
  if (!t) return;
  const r = routeById(t.routeId);
  if (state.alert.stage === 'overdue') {
    alarm.stop();
    state.alert = { stage: 'idle' };
  }
  app.relay?.send('home', { route: r?.title });
  log(`Вернулись: ${r?.title ?? 'поход'} завершён`, 'ok');
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
function onBattery(level, charging) {
  if (level <= 15 && !charging && state.trip && !lowSent) {
    lowSent = true;
    app.relay?.send('battery', { level, pos: posPayload() });
    log(`Заряд ${level}%: близким отправлена последняя точка`, 'warn');
    toast(`Заряд ${level}%. Близкие получили вашу последнюю точку`);
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
    onFall: (e) => triggerCheck(e.kind === 'fall' ? 'Похоже на падение' : 'Сильный удар', { detail: `${e.g.toFixed(1).replace('.', ',')} g${e.freeMs ? `, свободное падение ${e.freeMs} мс` : ''}` }),
    onScream: () => triggerCheck('Громкий крик', { detail: 'дольше 0,7 с' }),
    onImpact: () => {},
    onCodeWord: (w) => {
      if (state.alert.stage !== 'sos') sendSOS(`Кодовое слово «${w}»`, 'voice');
    },
    onPos,
    onBattery,
  });
  log('Режим «В горах» включён');
  app.refresh?.();
}

export function disableMountain(refresh = true) {
  stopMountain();
  state.mountain = false;
  save();
  log('Режим «В горах» выключен');
  if (refresh) app.refresh?.();
}

// ---- Демо ----

export function demoWalk(step = 0.08) {
  const r = activeRoute();
  if (!r) return toast('Сначала выберите маршрут');
  state.demo.gps = true;
  state.demo.walk = Math.min(1, (state.demo.walk || 0) + step);
  const cum = r.cum || (r.cum = cumulative(r.line));
  const [lat, lon] = pointAt(r.line, state.demo.walk, cum);
  onPos({ lat, lon, acc: 8, alt: Math.round(eleAt(r.profile, (cum[cum.length - 1] * state.demo.walk) / 1000)), t: Date.now(), src: 'demo' });
  app.refresh?.();
}
