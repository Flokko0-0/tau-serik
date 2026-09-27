import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createIdentity, sealFor, openSealed, inboxOf, cleanPost } from '../js/p2p.js';
import { parseQuestion, resolveStart } from '../js/ai.js';
import { fromLocal, dayKey } from '../js/time.js';

test('личное сообщение читает только получатель', async () => {
  const alice = await createIdentity();
  const bob = await createIdentity();
  const eve = await createIdentity();
  const box = await sealFor(bob.pub, { type: 'request', text: 'Привет! Можно с вами на БАО?' });
  assert.deepEqual(await openSealed(bob.priv, box), { type: 'request', text: 'Привет! Можно с вами на БАО?' });
  await assert.rejects(openSealed(eve.priv, box));
  assert.notEqual(await inboxOf(alice.pub), await inboxOf(bob.pub));
  assert.match(await inboxOf(bob.pub), /^ts-in-[0-9a-f]{32}$/);
});

test('объявление с доски: лишние поля отбрасываются, мусор не проходит', () => {
  const p = cleanPost({ v: 1, kind: 'hike', id: 'x1', uid: 'u1', pub: 'k', age: 22, g: 'f', level: 'basic', about: 'a'.repeat(900), tags: ['фото'], only: 'f', seats: 99, evil: '<script>' });
  assert.equal(p.about.length, 400);
  assert.equal(p.seats, 20);
  assert.equal(p.evil, undefined);
  assert.equal(cleanPost({ v: 1, kind: 'hike', id: 'x', uid: 'u', pub: 'k', age: 5 }), null);
  assert.equal(cleanPost({ kind: 'spam' }), null);
  assert.deepEqual(cleanPost({ v: 1, kind: 'close', id: 'x', uid: 'u' }), { v: 1, kind: 'close', id: 'x', uid: 'u' });
});

test('помощник понимает «завтра в 7 на БАО»', () => {
  const now = fromLocal('2026-09-27', '18:00');
  const q = parseQuestion('Привеет, я завтра в 7 хочу пойти на БАО, можешь сказать как там щас?', now, []);
  assert.equal(q.routeId, 'bao');
  assert.equal(q.offset, 1);
  assert.equal(q.time, '07:00');
  const r = resolveStart(q, now, {});
  assert.equal(r.day, '2026-09-28');
  assert.equal(r.start, fromLocal('2026-09-28', '07:00'));
});

test('помощник: день недели, время без дня, «в 10 км» - не время', () => {
  const now = fromLocal('2026-09-27', '18:00');
  assert.equal(parseQuestion('в субботу на кумбель', now, []).offset, 6);
  assert.equal(parseQuestion('в субботу на кумбель', now, []).routeId, 'kumbel');
  const late = parseQuestion('пойду на водопады в 9:30', now, []);
  assert.equal(late.time, '09:30');
  assert.equal(resolveStart(late, now, {}).day, dayKey(now + 86400e3));
  assert.equal(parseQuestion('это в 10 км от города?', now, []).time, null);
  assert.equal(parseQuestion('как дойти до т1', now, []).routeId, 't1');
});
