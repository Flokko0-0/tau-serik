import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FallDetector, SoundDetector, matchCodeWord } from '../js/detect.js';

// Поток отсчётов акселерометра 50 Гц: [длительность мс, g или функция от времени]
function run(det, parts) {
  let t = 0;
  for (const [ms, g] of parts) {
    for (let k = 0; k < ms; k += 20, t += 20) det.feed(typeof g === 'function' ? g(t) : g, t);
  }
}

test('падение: свободное падение, удар, неподвижность', () => {
  const events = [];
  const det = new FallDetector({ onFall: (e) => events.push(e) });
  run(det, [[1000, 1], [240, 0.15], [60, 3.1], [2000, 1]]);
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, 'fall');
  assert.ok(events[0].still);
  assert.ok(events[0].freeMs >= 200);
});

test('прыжок и ходьба дальше: не тревога', () => {
  const events = [];
  const det = new FallDetector({ onFall: (e) => events.push(e) });
  const walk = (t) => 1 + 0.6 * Math.sin(t / 90);
  run(det, [[1000, walk], [200, 0.3], [40, 2.4], [2500, walk]]);
  assert.equal(events.length, 0);
});

test('сильный удар без свободного падения всё равно проверяется', () => {
  const events = [];
  const det = new FallDetector({ onFall: (e) => events.push(e) });
  const tumble = (t) => 1 + 0.9 * Math.sin(t / 50);
  run(det, [[500, 1], [40, 3.6], [2000, tumble]]);
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, 'impact');
});

test('обычная ходьба и бег: тишина', () => {
  const events = [];
  const det = new FallDetector({ onFall: (e) => events.push(e) });
  run(det, [[10000, (t) => 1 + 0.8 * Math.sin(t / 60)]]);
  assert.equal(events.length, 0);
});

test('крик: громко, голосовая полоса, дольше 0,7 с', () => {
  const screams = [];
  const det = new SoundDetector({ onScream: (e) => screams.push(e) });
  for (let t = 0; t < 3000; t += 50) det.feed({ db: -55, voiced: 0.3, t });
  for (let t = 3000; t < 4000; t += 50) det.feed({ db: -12, voiced: 0.8, t });
  assert.equal(screams.length, 1);
});

test('ветер в микрофон: громко, но не голос', () => {
  const screams = [];
  const det = new SoundDetector({ onScream: (e) => screams.push(e) });
  for (let t = 0; t < 3000; t += 50) det.feed({ db: -50, voiced: 0.2, t });
  for (let t = 3000; t < 6000; t += 50) det.feed({ db: -10, voiced: 0.25, t });
  assert.equal(screams.length, 0);
});

test('короткий возглас не считается криком', () => {
  const screams = [];
  const det = new SoundDetector({ onScream: (e) => screams.push(e) });
  for (let t = 0; t < 2000; t += 50) det.feed({ db: -55, voiced: 0.3, t });
  for (let t = 2000; t < 2400; t += 50) det.feed({ db: -12, voiced: 0.8, t });
  for (let t = 2400; t < 4000; t += 50) det.feed({ db: -55, voiced: 0.3, t });
  assert.equal(screams.length, 0);
});

test('кодовое слово в распознанной речи', () => {
  const words = ['помогите', 'спасите'];
  assert.equal(matchCodeWord('Эй, ПОМОГИТЕ кто-нибудь', words), 'помогите');
  assert.equal(matchCodeWord('спасите', words), 'спасите');
  assert.equal(matchCodeWord('всё хорошо, идём дальше', words), null);
  assert.equal(matchCodeWord('Көмектесіңдер', ['көмектесіңдер']), 'көмектесіңдер');
});
