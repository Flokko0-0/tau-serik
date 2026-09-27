// Время Алматы: с 2024 года весь Казахстан живёт по UTC+5, без перехода на летнее время
const OFFSET = 5 * 3600e3;
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const pad = (n) => String(n).padStart(2, '0');

export function parts(ms) {
  const d = new Date(ms + OFFSET);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), hh: d.getUTCHours(), mm: d.getUTCMinutes(), wd: d.getUTCDay() };
}

export function fromLocal(day, hhmm) {
  const [y, m, d] = day.split('-').map(Number);
  const [hh, mm] = hhmm.split(':').map(Number);
  return Date.UTC(y, m - 1, d, hh, mm) - OFFSET;
}

export const dayKey = (ms) => {
  const p = parts(ms);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
};
export const fmtTime = (ms) => {
  const p = parts(ms);
  return `${pad(p.hh)}:${pad(p.mm)}`;
};
export const fmtDay = (ms) => {
  const p = parts(ms);
  return `${WD[p.wd]}, ${p.d} ${MONTHS[p.m - 1]}`;
};
export const month = (ms) => parts(ms).m;

export function fmtLeft(ms) {
  const neg = ms < 0;
  const min = Math.round(Math.abs(ms) / 60000);
  const h = Math.floor(min / 60);
  const txt = h ? `${h} ч ${pad(min % 60)} мин` : `${min} мин`;
  return neg ? `−${txt}` : txt;
}

export function fmtHours(h) {
  const whole = Math.floor(h);
  const half = h - whole >= 0.5;
  return whole ? `${whole}${half ? ',5' : ''} ч` : '30 мин';
}

export function ago(ms, now = Date.now()) {
  const min = Math.round((now - ms) / 60000);
  if (min < 1) return 'только что';
  if (min < 60) return `${min} мин назад`;
  const h = Math.round(min / 60);
  return h < 24 ? `${h} ч назад` : `${Math.round(h / 24)} дн назад`;
}
