// Все строки интерфейса для перевода: литералы с кириллицей из кода и тексты из данных.
//   node tools/i18n-keys.mjs            - список ключей (JSON)
//   node tools/i18n-keys.mjs --missing  - ключи без перевода на казахский или английский
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CYR = /[А-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі]/;

// Строки, которые не показываются человеку: ключевые слова помощника, данные для модели, бренд
const SKIP_LINE = [
  /^\s*\/\//,
  /^\s*\*/,
  /const (EXP_RU|LVL_RU|LANG_NAME|WMO_RU|MONTHS|WD|HEMI|DIRS)\b/,
  /Язык интерфейса: \$\{/,
  /codeWords: \[/,
  /APP_NAME = /,
  /const WORD = /,
  /^\s*(ru|kk|en): \[/,
  /lines\.push\(/,
  /export const LANGS/,
  /'Қазақша'/,
  /const appName = /,
  /replace\(\/ё\/g/,
];
const SKIP_FILE = [/^js[\\/]i18n[\\/]/, /^js[\\/]data[\\/]/, /^js[\\/]icons\.js$/, /^js[\\/]config\.js$/];

function files(dir) {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? files(join(dir, d.name)) : d.name.endsWith('.js') ? [join(dir, d.name)] : []));
}

const keys = new Map();
const add = (k, from) => {
  if (k && CYR.test(k) && !keys.has(k)) keys.set(k, from);
};

for (const f of files('js')) {
  const rel = relative(ROOT, join(ROOT, f));
  if (SKIP_FILE.some((re) => re.test(rel))) continue;
  // Ключевые слова помощника (keys: [...]) бывают на нескольких строках: вырезаем, сохраняя переносы
  const src = readFileSync(join(ROOT, f), 'utf8').replace(/keys:\s*\[[^\]]*\]/g, (m) => m.replace(/[^\n]/g, ''));
  src.split('\n').forEach((line, i) => {
    if (SKIP_LINE.some((re) => re.test(line))) return;
    for (const m of line.matchAll(/'((?:[^'\\\n]|\\.)*)'/g)) add(m[1].replace(/\\(.)/g, '$1'), `${rel}:${i + 1}`);
  });
}

// Тексты из данных: памятки, маршруты, демо-профили, места (кроме названий вершин)
const { AID, AID_GROUPS } = await import('../js/data/firstaid.js');
const { ROUTES } = await import('../js/data/routes.js');
const { PEOPLE, GROUPS, NEARBY } = await import('../js/data/people.js');
const { PLACES } = await import('../js/data/places.js');
for (const g of AID_GROUPS) add(g.title, 'firstaid');
for (const a of AID) [a.title, a.summary, a.call, ...a.steps.flat(), ...a.dont].forEach((s) => add(s, 'firstaid:' + a.id));
for (const r of ROUTES) [r.title, r.start, r.text, ...r.hazards].forEach((s) => add(s, 'routes:' + r.id));
for (const p of PEOPLE) [p.name, p.meet, p.about, ...(p.tags || [])].forEach((s) => add(s, 'people:' + p.id));
for (const g of GROUPS) [g.name, g.leader, g.meet, g.seats, g.about].forEach((s) => add(s, 'groups:' + g.id));
for (const n of NEARBY) [n.name, n.note].forEach((s) => add(s, 'nearby:' + n.id));
for (const p of PLACES) if (p.kind !== 'peak') add(p.name, 'places');

export const KEYS = [...keys.keys()];

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv.includes('--missing')) {
    const { DICT } = await import('../js/i18n.js');
    const miss = KEYS.filter((k) => !DICT[k] || !DICT[k][0] || !DICT[k][1]);
    console.log(JSON.stringify(miss.map((k) => [k, keys.get(k)]), null, 1));
    console.error(`${miss.length} из ${KEYS.length} без перевода`);
  } else {
    console.log(JSON.stringify([...keys.entries()], null, 1));
    console.error(`${KEYS.length} ключей`);
  }
}
