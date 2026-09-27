// Язык интерфейса: казахский, русский, английский. Ключ перевода - исходная русская строка,
// в словаре рядом казахский и английский: { 'Маршруты': ['Маршруттар', 'Routes'] }.
// Вставки: t('Осталось {time}', { time }). Язык хранится отдельно от состояния:
// его выбирают и в приложении, и на экране близкого.
import UI from './i18n/ui.js';
import SAFETY from './i18n/safety.js';
import SOCIAL from './i18n/social.js';
import AID from './i18n/aid.js';
import DATA from './i18n/data.js';

export const LANGS = [['kk', 'Қазақша', 'ҚАЗ'], ['ru', 'Русский', 'РУС'], ['en', 'English', 'ENG']];
export const DICT = { ...DATA, ...AID, ...SOCIAL, ...SAFETY, ...UI };
const COL = { kk: 0, en: 1 };
const KEY = 'tau-serik.lang';
const tr = (l, src) => DICT[src]?.[COL[l]];

function detect() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved in COL || saved === 'ru') return saved;
  } catch {
    // хранилище недоступно
  }
  if (typeof navigator === 'undefined') return 'ru';
  const l = (navigator.language || '').toLowerCase();
  return l.startsWith('kk') ? 'kk' : l.startsWith('en') ? 'en' : 'ru';
}

let current = typeof localStorage === 'undefined' ? 'ru' : detect();
if (typeof document !== 'undefined') document.documentElement.lang = current;

export const lang = () => current;

export function setLang(l) {
  current = l in COL ? l : 'ru';
  try {
    localStorage.setItem(KEY, current);
  } catch {
    // выбор действует до перезагрузки
  }
  if (typeof document !== 'undefined') document.documentElement.lang = current;
}

export function t(src, vars) {
  let s = current === 'ru' || src == null ? src : tr(current, src) ?? src;
  if (vars && s) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m));
  return s;
}

// Форма слова по числу. Ключ - русские формы через «|»: 'контакт|контакта|контактов'.
// В казахском слово с числом не меняется, в английском одна форма и множественная.
export function pl(n, key) {
  const forms = (current === 'ru' ? key : tr(current, key) ?? key).split('|');
  if (current === 'en') return Math.abs(n) === 1 ? forms[0] : forms[1] ?? forms[0];
  if (current === 'kk') return forms[0];
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return forms[2] ?? forms[0];
  if (b > 1 && b < 5) return forms[1] ?? forms[0];
  return b === 1 ? forms[0] : forms[2] ?? forms[0];
}

// Дробные числа: запятая в казахском и русском, точка в английском
export function num(x, digits = 1) {
  const s = Number(x).toFixed(digits);
  return current === 'en' ? s : s.replace('.', ',');
}

// Ключи, для которых нет перевода (для проверки словарей)
export const missing = (l, keys) => keys.filter((k) => tr(l, k) == null);

// Целые с разделителем тысяч: 3 150 или 3,150
export const int = (n) => Number(n).toLocaleString(current === 'en' ? 'en-US' : 'ru-RU');

// Перевод на заданный язык, не меняя язык интерфейса (вторая строка на экране тревоги)
export function tIn(l, src, vars) {
  const prev = current;
  current = l;
  try {
    return t(src, vars);
  } finally {
    current = prev;
  }
}

// Второй язык для подписи под главной фразой: под казахской - русская, под остальными - казахская
export const second = () => (current === 'kk' ? 'ru' : 'kk');
