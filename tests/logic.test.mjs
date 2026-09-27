import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIin, makeIin, ageRules } from '../js/iin.js';
import { dist, bearing, compass, fmtDist, toDMS, nearestOnLine, pointAt, offset } from '../js/geo.js';
import { fromLocal, fmtTime, dayKey } from '../js/time.js';
import { assessRisk, routeAllowed } from '../js/risk.js';
import { gearList } from '../js/gear.js';
import { normalize, wmo } from '../js/weather.js';
import { classify, answer } from '../js/assistant.js';
import { ROUTES } from '../js/data/routes.js';
import { PLACES } from '../js/data/places.js';
import { AID } from '../js/data/firstaid.js';

const NOW = new Date('2026-09-27T06:00:00Z');
const route = (id) => ROUTES.find((r) => r.id === id);

test('ИИН: контрольная цифра, дата и пол', () => {
  const r = parseIin('040312601239', NOW);
  assert.equal(r.ok, true);
  assert.equal(r.birth, '2004-03-12');
  assert.equal(r.gender, 'f');
  assert.equal(r.age, 22);
  assert.equal(parseIin('040312601238', NOW).ok, false, 'испорченная контрольная цифра');
  assert.equal(parseIin('041312601239', NOW).ok, false, '13-й месяц');
  assert.equal(parseIin('12345', NOW).ok, false);
  assert.equal(parseIin(makeIin('2009-11-02', 'm', '0457'), NOW).gender, 'm');
  assert.equal(parseIin('0403-1260-1239', NOW).ok, true, 'разделители игнорируются');
});

test('возрастные правила', () => {
  assert.equal(ageRules(12).withAdult, true);
  assert.equal(ageRules(16).maxLevel, 'medium');
  assert.equal(ageRules(16).guardian, true);
  assert.equal(ageRules(18).maxLevel, 'expert');
  assert.equal(routeAllowed(route('t1'), 16), false);
  assert.equal(routeAllowed(route('bao'), 16), true);
});

test('геометрия', () => {
  const medeu = [43.1575, 77.0586];
  const bao = [43.0506, 76.985];
  const d = dist(medeu, bao);
  assert.ok(d > 13000 && d < 14000, `Медеу-БАО ${d}`);
  assert.ok(Math.abs(bearing([43, 77], [44, 77])) < 0.01);
  assert.equal(compass(44), 'СВ');
  assert.equal(fmtDist(347), '350 м');
  assert.equal(fmtDist(1250), '1,3 км');
  assert.match(toDMS(43.05, 76.985), /^43°03′00″ с\. ш\.\s+76°59′06″ в\. д\.$/);
  const line = [[43, 77], [43, 77.01], [43.01, 77.01]];
  const n = nearestOnLine(line, [43.0005, 77.005]);
  assert.ok(n.off > 50 && n.off < 60);
  assert.ok(Math.abs(n.along - dist([43, 77], [43, 77.005])) < 1);
  const mid = pointAt(line, 0.5);
  assert.ok(Math.abs(mid[1] - 77.01) < 0.002);
  const o = offset([43, 77], 90, 1000);
  assert.ok(Math.abs(dist([43, 77], o) - 1000) < 1);
});

test('время Алматы UTC+5', () => {
  const t = fromLocal('2026-09-27', '08:30');
  assert.equal(new Date(t).toISOString(), '2026-09-27T03:30:00.000Z');
  assert.equal(fmtTime(t), '08:30');
  assert.equal(dayKey(Date.parse('2026-09-27T20:00:00Z')), '2026-09-28');
});

test('данные: 7 маршрутов OSM с профилем высот и реальные точки', () => {
  assert.equal(ROUTES.length, 7);
  for (const r of ROUTES) {
    assert.ok(r.line.length > 10, r.id);
    assert.equal(r.profile.length, 61, r.id);
    assert.ok(r.maxEle > r.minEle && r.hours > 0, r.id);
  }
  assert.ok(PLACES.filter((p) => p.kind === 'rescue').length >= 2);
  assert.ok(PLACES.filter((p) => p.kind === 'water').length > 50);
  assert.equal(AID.length, 17);
});

function forecast({ temp = 8, feels = 5, pop = 10, gust = 15, code = 1, vis = 20000, freeze = 4000, snow = 0, sunset = '18:40' } = {}) {
  const start = fromLocal('2026-09-28', '00:00');
  const hours = Array.from({ length: 48 }, (_, i) => ({ t: start + i * 3600e3, temp, feels, tempStart: temp + 10, pop, precip: 0, code, wind: gust / 2, gust, freeze, uv: 5, snow, vis }));
  return { fetchedAt: NOW.getTime(), eleStart: 1900, eleTop: 2600, hours, days: [{ t: start, sunrise: fromLocal('2026-09-28', '06:50'), sunset: fromLocal('2026-09-28', sunset), uvMax: 5 }] };
}
const base = { startMs: fromLocal('2026-09-28', '08:00'), age: 22, experience: 'basic', group: 3, contacts: 2, hasMedical: true, now: NOW.getTime() };

test('риск: спокойная погода на среднем маршруте - можно идти', () => {
  const r = assessRisk({ ...base, route: route('bao'), fc: forecast() });
  assert.equal(r.blocked, false);
  assert.equal(r.level, 0, JSON.stringify(r.factors));
});

test('риск: гроза - не выходить', () => {
  const r = assessRisk({ ...base, route: route('bao'), fc: forecast({ code: 95, pop: 80 }) });
  assert.equal(r.level, 3);
  assert.match(r.factors[0].title, /Гроза/);
});

test('риск: подросток и сложный маршрут - закрыто', () => {
  const r = assessRisk({ ...base, age: 16, route: route('gorelnik-lakes'), fc: forecast() });
  assert.equal(r.blocked, true);
});

test('риск: поздний выход - возвращение после заката', () => {
  const r = assessRisk({ ...base, startMs: fromLocal('2026-09-28', '14:00'), route: route('bao'), fc: forecast() });
  assert.ok(r.factors.some((f) => f.icon === 'sunset' && f.level === 2));
  assert.ok(r.level >= 2);
});

test('риск: новичок один без прогноза', () => {
  const r = assessRisk({ ...base, experience: 'novice', group: 1, route: route('kumbel'), fc: null });
  assert.ok(r.level >= 2);
  assert.ok(r.factors.some((f) => f.title === 'Нет прогноза'));
  assert.ok(r.factors.some((f) => f.title === 'Вы идёте один'));
});

test('вещи: мороз наверху и астма в медкарте', () => {
  const g = gearList({ route: route('t1'), fc: forecast({ feels: -8, gust: 45 }), startMs: base.startMs, medical: { chronic: ['Астма'], allergies: ['Укусы пчёл'] } });
  const ids = g.flatMap((x) => x.items.map((i) => i.id));
  for (const id of ['down', 'hat', 'buff', 'boots', 'inhaler', 'antihist', 'lamp']) assert.ok(ids.includes(id), id);
  const anti = g.flatMap((x) => x.items).find((i) => i.id === 'antihist');
  assert.match(anti.text, /адреналин/);
});

test('погода: разбор ответа Open-Meteo для двух точек', () => {
  const h = (v) => ({ time: [1790449200, 1790452800], temperature_2m: [v, v], apparent_temperature: [v - 3, v - 3], precipitation_probability: [5, 60], precipitation: [0, 1], weather_code: [1, 95], wind_speed_10m: [5, 9], wind_gusts_10m: [20, 50], freezing_level_height: [3500, 3400], uv_index: [0, 3], snowfall: [0, 0], visibility: [20000, 800] });
  const d = { time: [1790449200], sunrise: [1790469864], sunset: [1790512856], uv_index_max: [6] };
  const fc = normalize([{ elevation: 1676, hourly: h(12), daily: d }, { elevation: 3313, hourly: h(-2), daily: d }], 1);
  assert.equal(fc.eleTop, 3313);
  assert.equal(fc.hours[1].temp, -2);
  assert.equal(fc.hours[1].tempStart, 12);
  assert.equal(fc.hours[1].gust, 50);
  assert.equal(wmo(fc.hours[1].code).text, 'Гроза');
});

test('помощник понимает вопросы своими словами', () => {
  assert.equal(classify('Что надеть на БАО?').id, 'gear');
  assert.equal(classify('укусил клещ что делать').id, 'tick');
  assert.equal(classify('кажется, мы заблудились').id, 'lost');
  assert.equal(classify('у меня болит голова и тошнит').id, 'altitude');
  assert.equal(classify('где ближайший родник').id, 'nearby');
  assert.equal(classify('успеем до заката?').id, 'time');
  assert.equal(classify('встретили собак на тропе').id, 'animals');
  const a = answer('где вода?', { pos: { lat: 43.09, lon: 77.05 }, places: PLACES, routes: ROUTES });
  assert.ok(a.items.length === 1 && /м|км/.test(a.items[0]));
  const b = answer('что взять?', { route: route('bao'), fc: forecast(), startMs: base.startMs, profile: { medical: {} }, routes: ROUTES });
  assert.ok(b.items.length >= 5);
});
