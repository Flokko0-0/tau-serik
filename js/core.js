// Общие ссылки для экранов: навигация, действия, текущий маршрут
import { state } from './store.js';
import { ROUTES } from './data/routes.js';
import { ageOn } from './iin.js';
import { dayKey, fromLocal, parts } from './time.js';

export const APP_NAME = 'Тау Серік';
export const app = { go: null, back: null, refresh: null, relay: null, screen: { name: 'home', id: null } };
export const actions = {};
export const on = (obj) => Object.assign(actions, obj);

export const allRoutes = () => [...(state.customRoutes || []), ...ROUTES];
export const routeById = (id) => allRoutes().find((r) => r.id === id);
export const online = () => navigator.onLine && !state.demo.offline;
export const age = () => (state.profile ? ageOn(state.profile.birth) : null);
export const hasMedical = () => {
  const m = state.profile?.medical;
  return !!(m && (m.blood || m.allergies?.length || m.chronic?.length));
};

// План похода: день, время выхода, размер группы. По умолчанию завтра в 8:00 (сегодня, если ещё утро).
export function plan() {
  const p = state.plan;
  const now = Date.now();
  if (!p.day || fromLocal(p.day, '23:59') < now) {
    const h = parts(now).hh;
    p.day = dayKey(h < 9 ? now : now + 86400e3);
    p.time = h < 9 ? '09:00' : '08:00';
  }
  p.time ||= '08:00';
  p.group ||= 1;
  return p;
}

export const startMs = () => {
  const p = plan();
  return fromLocal(p.day, p.time);
};

// Окончание по полу из ИИН: «вернулся» / «вернулась»
export const gw = (m, f) => (state.profile?.gender === 'f' ? f : m);

export const activeRoute = () => routeById(state.trip?.routeId) || routeById(state.plan.routeId) || null;
