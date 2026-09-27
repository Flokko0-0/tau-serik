// Время Алматы: с 2024 года весь Казахстан живёт по UTC+5, без перехода на летнее время
import { lang, t, num } from './i18n.js';

const OFFSET = 5 * 3600e3;
const MONTHS = {
  ru: ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'],
  kk: ['қаң', 'ақп', 'нау', 'сәу', 'мам', 'мау', 'шіл', 'там', 'қыр', 'қаз', 'қар', 'жел'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};
const WD = {
  ru: ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'],
  kk: ['жс', 'дс', 'сс', 'ср', 'бс', 'жм', 'сб'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
};
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
  const l = lang();
  return l === 'en' ? `${WD.en[p.wd]}, ${MONTHS.en[p.m - 1]} ${p.d}` : `${WD[l][p.wd]}, ${p.d} ${MONTHS[l][p.m - 1]}`;
};
export const month = (ms) => parts(ms).m;

export function fmtLeft(ms) {
  const neg = ms < 0;
  const min = Math.round(Math.abs(ms) / 60000);
  const h = Math.floor(min / 60);
  const txt = h ? t('{h} ч {m} мин', { h, m: pad(min % 60) }) : t('{m} мин', { m: min });
  return neg ? `−${txt}` : txt;
}

export function fmtHours(h) {
  const whole = Math.floor(h);
  if (!whole) return t('{m} мин', { m: 30 });
  return t('{h} ч', { h: h - whole >= 0.5 ? num(whole + 0.5) : whole });
}

export function ago(ms, now = Date.now()) {
  const min = Math.round((now - ms) / 60000);
  if (min < 1) return t('только что');
  if (min < 60) return t('{m} мин назад', { m: min });
  const h = Math.round(min / 60);
  return h < 24 ? t('{h} ч назад', { h }) : t('{d} дн назад', { d: Math.round(h / 24) });
}
