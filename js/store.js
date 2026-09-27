// Состояние приложения. Всё хранится только на устройстве (localStorage).
import { makeIin } from './iin.js';

const KEY = 'tau-serik.v1';

export function newFamilyCode() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return String(a[0] % 1e8).padStart(8, '0');
}

function defaults() {
  return {
    profile: null,
    settings: { fall: true, scream: true, codeword: true, codeWords: ['помогите', 'спасите', 'көмектесіңдер'], speechLang: 'ru-RU', countdown: 180, siren: true, sensitivity: 'normal', share: 'contacts', wakeLock: true, batterySaver: true },
    mountain: false,
    plan: {},
    trip: null,
    gear: {},
    pos: null,
    track: [],
    outbox: [],
    log: [],
    requests: [],
    alert: { stage: 'idle' },
    demo: { offline: false, gps: false, walk: 0 },
    aid: {},
    cache: {},
    company: { profile: null, posts: [], board: {}, threads: {}, blocked: [], reports: [], seen: [], tab: 'find' },
    me: null,
    stats: { hikes: 0 },
    customRoutes: [],
    asks: [],
  };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      const d = defaults();
      return { ...d, ...s, settings: { ...d.settings, ...s.settings }, demo: { ...d.demo, ...s.demo }, company: { ...d.company, ...s.company }, stats: { ...d.stats, ...s.stats } };
    }
  } catch {
    // хранилище недоступно: работаем в памяти
  }
  return defaults();
}

export const state = load();

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // приватный режим или переполнено
  }
}

export function reset() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
  Object.assign(state, defaults());
}

export const cache = {
  get: (k) => state.cache[k],
  set: (k, v) => {
    state.cache[k] = v;
    save();
  },
};

export function log(text, kind = 'info') {
  state.log.unshift({ t: Date.now(), text, kind });
  state.log.length = Math.min(state.log.length, 40);
  save();
}

export function demoProfile(kind) {
  const teen = kind === 'teen';
  const birth = teen ? '2009-11-02' : '2004-03-12';
  return {
    name: teen ? 'Дана Серикова' : 'Айым Нурланова',
    iin: makeIin(birth, 'f', teen ? '0457' : '0123'),
    birth,
    gender: 'f',
    phone: teen ? '+7 707 000 11 22' : '+7 701 000 33 44',
    verified: true,
    verifiedAt: Date.now(),
    experience: teen ? 'novice' : 'basic',
    contacts: teen
      ? [
          { id: 'c1', name: 'Мама, Гульмира', phone: '+7 701 000 55 66', relation: 'Мама', guardian: true },
          { id: 'c2', name: 'Папа, Серик', phone: '+7 777 000 77 88', relation: 'Папа', guardian: true },
        ]
      : [
          { id: 'c1', name: 'Мама, Сауле', phone: '+7 701 000 55 66', relation: 'Мама', guardian: false },
          { id: 'c2', name: 'Брат, Ержан', phone: '+7 747 000 99 00', relation: 'Брат', guardian: false },
        ],
    medical: teen
      ? { blood: 'A(II) Rh+', allergies: ['Укусы пчёл'], chronic: ['Астма'], meds: 'Сальбутамол (ингалятор)', notes: '' }
      : { blood: 'O(I) Rh−', allergies: ['Пенициллин'], chronic: [], meds: '', notes: 'Ношу контактные линзы' },
    familyCode: newFamilyCode(),
    demo: true,
  };
}
