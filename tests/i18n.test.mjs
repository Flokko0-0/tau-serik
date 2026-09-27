import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DICT, t, pl, setLang, lang } from '../js/i18n.js';
import { KEYS } from '../tools/i18n-keys.mjs';
import { classify, SUGGESTIONS } from '../js/assistant.js';
import { parseQuestion } from '../js/ai.js';

const holes = (s) => (s.match(/\{\w+\}/g) || []).sort().join(',');
const tags = (s) => (s.match(/<\/?\w+/g) || []).join(',');
const inLang = (l, fn) => {
  setLang(l);
  try {
    return fn();
  } finally {
    setLang('ru');
  }
};

test('переводы: у каждой строки интерфейса есть казахский и английский', () => {
  const miss = KEYS.filter((k) => !DICT[k]?.[0] || !DICT[k]?.[1]);
  assert.deepEqual(miss, []);
});

test('переводы: вставки {…} и теги совпадают с русским', () => {
  for (const [ru, [kk, en]] of Object.entries(DICT)) {
    for (const x of [kk, en]) {
      assert.equal(holes(x), holes(ru), `вставки: ${ru} -> ${x}`);
      assert.equal(tags(x), tags(ru), `теги: ${ru} -> ${x}`);
    }
  }
});

test('переводы: без длинных тире и без латиницы внутри казахских слов', () => {
  for (const [ru, [kk, en]] of Object.entries(DICT)) {
    assert.doesNotMatch(kk + en, /[—–]/, ru);
    assert.doesNotMatch(kk, /[а-яәғқңөұүһі][a-z]|[a-z][а-яәғқңөұүһі]/i, `смесь алфавитов: ${kk}`);
  }
});

test('переводы: формы по числу', () => {
  for (const [ru, [kk, en]] of Object.entries(DICT)) {
    if (!ru.includes('|')) continue;
    assert.equal(kk.split('|').length, 1, ru);
    assert.equal(en.split('|').length, 2, ru);
  }
  assert.equal(pl(3, 'год|года|лет'), 'года');
  assert.equal(inLang('en', () => pl(1, 'год|года|лет')), 'year');
  assert.equal(inLang('en', () => pl(16, 'год|года|лет')), 'years');
  assert.equal(inLang('kk', () => pl(16, 'год|года|лет')), 'жас');
});

test('язык переключается, вставки подставляются', () => {
  assert.equal(lang(), 'ru');
  assert.equal(inLang('en', () => t('Маршруты')), 'Routes');
  assert.equal(inLang('kk', () => t('Маршруты')), 'Маршруттар');
  assert.equal(inLang('en', () => t('Гроза около {time}', { time: '14:00' })), 'Thunderstorm around 14:00');
  assert.equal(t('Строки нет в словаре'), 'Строки нет в словаре');
});

test('помощник понимает подсказки на всех трёх языках', () => {
  for (const q of SUGGESTIONS) {
    const id = classify(q)?.id;
    assert.ok(id, q);
    for (const l of ['kk', 'en']) {
      const tq = inLang(l, () => t(q));
      assert.equal(classify(tq)?.id, id, `${l}: ${tq}`);
    }
  }
  assert.equal(classify('Кене шағып алды, не істеймін?').id, 'tick');
  assert.equal(classify('I think we are lost').id, 'lost');
  assert.equal(classify('Бас ауырып, жүрек айнып тұр').id, 'altitude');
});

test('разбор вопроса: «завтра в 7 на БАО» по-казахски и по-английски', () => {
  const now = Date.UTC(2026, 8, 27, 10, 0);
  for (const q of ['Ертең сағат 7-де ҮАК-қа барғым келеді, ол жақта қалай?', 'I want to go to BAO tomorrow at 7, how is it there?']) {
    assert.deepEqual(parseQuestion(q, now, []), { routeId: 'bao', offset: 1, time: '07:00' }, q);
  }
  assert.equal(parseQuestion('Сенбіде Күмбелге таңертең барамыз', now, []).routeId, 'kumbel');
  assert.equal(parseQuestion('Kumbel on saturday at 6 pm', now, []).time, '18:00');
});
