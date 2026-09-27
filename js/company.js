// Логика «Компании»: анкета, объявления о походах, заявки, ответы, чат и обмен контактами
import { state, save, log } from './store.js';
import { app, age, routeById } from './core.js';
import { createIdentity, inboxOf, sendTo, publish, subscribe, openSealed, cleanPost, newId, BOARD } from './p2p.js';
import { PEOPLE, GROUPS } from './data/people.js';
import { toast, vibrate } from './ui.js';

export const co = () => (state.company ||= { profile: null, posts: [], board: {}, threads: {}, blocked: [], reports: [], seen: [], tab: 'find' });
export const group = (a) => (a < 14 ? 'child' : a < 18 ? 'teen' : 'adult');
export const CONTACT_KINDS = { tg: 'Telegram', wa: 'WhatsApp', phone: 'Телефон' };

export function contactHref(c) {
  if (!c?.value) return null;
  const digits = c.value.replace(/\D/g, '');
  if (c.kind === 'tg') return `https://t.me/${c.value.replace(/^@/, '')}`;
  if (c.kind === 'wa') return `https://wa.me/${digits}`;
  return `tel:+${digits}`;
}

export async function identity() {
  if (!state.me) {
    state.me = await createIdentity();
    save();
  }
  return state.me;
}

export function myCard() {
  const p = state.profile;
  const [first, last] = p.name.split(' ');
  const c = co();
  return {
    uid: state.me?.uid, pub: state.me?.pub, name: `${first}${last ? ' ' + last[0] + '.' : ''}`, age: age(), g: p.gender,
    level: p.experience, verified: !!p.verified, hikes: state.stats?.hikes || 0,
    about: c.profile?.about || '', tags: c.profile?.tags || [], only: c.profile?.only || 'all',
  };
}

async function safePublish(obj) {
  try {
    await publish(obj);
    return true;
  } catch {
    toast('Нет сети: объявление опубликуется, когда появится интернет');
    co().pending = true;
    save();
    return false;
  }
}

export async function saveProfile(profile) {
  await identity();
  co().profile = { ...co().profile, ...profile, t: Date.now() };
  save();
  await publishPerson();
}

export async function publishPerson() {
  const c = co();
  if (!c.profile || !state.me) return;
  const id = 'person-' + state.me.uid;
  if (c.profile.visible) await safePublish({ v: 1, kind: 'person', id, ...myCard(), prefs: c.profile.prefs || '', t: Date.now() });
  else await safePublish({ v: 1, kind: 'close', id, uid: state.me.uid });
  c.profile.published = Date.now();
  save();
}

export async function createHike(h) {
  await identity();
  const post = { v: 1, kind: 'hike', id: newId(), ...myCard(), ...h, t: Date.now() };
  co().posts.unshift(post);
  save();
  await safePublish(post);
  log(`Опубликован поход: ${h.routeTitle}, ${h.day} ${h.time}`);
  if (age() < 18) app.relay?.send('company', { with: 'объявление о походе', route: h.routeTitle });
  // В демо на ваш поход через несколько секунд приходит заявка, чтобы показать сторону автора
  if (state.profile.demo) setTimeout(() => demoIncoming(post), 7000);
  return post;
}

export async function closeHike(id) {
  const c = co();
  c.posts = c.posts.filter((p) => p.id !== id);
  save();
  await safePublish({ v: 1, kind: 'close', id, uid: state.me.uid });
}

// Раз в 6 часов объявления переопубликуются: посредник хранит сообщения 12 часов
export async function republish() {
  const c = co();
  if (!state.me || !navigator.onLine) return;
  const today = new Date().toISOString().slice(0, 10);
  c.posts = c.posts.filter((p) => p.day >= today);
  for (const p of c.posts) {
    if (c.pending || Date.now() - p.t > 6 * 3600e3) {
      p.t = Date.now();
      await safePublish(p);
    }
  }
  if (c.profile && (c.pending || Date.now() - (c.profile.published || 0) > 6 * 3600e3)) await publishPerson();
  c.pending = false;
  save();
}

// ---- Разговоры ----

function thread(peer) {
  const c = co();
  const th = (c.threads[peer.uid] ||= { peer, status: 'new', messages: [], unread: 0, contact: null, shared: false, t: Date.now() });
  th.peer = { ...th.peer, ...peer };
  return th;
}

function push(th, msg) {
  th.messages.push({ id: newId(), t: Date.now(), ...msg });
  th.t = Date.now();
  if (!msg.me && !msg.sys) th.unread++;
}

export const unread = () => Object.values(co().threads).reduce((s, t) => s + (t.unread || 0), 0);

function changed(notice, uid) {
  save();
  const open = uid && app.screen.name === 'company' && app.screen.id === 'chat:' + uid;
  if (open) co().threads[uid] && (co().threads[uid].unread = 0);
  if (notice && !open) {
    toast(notice);
    vibrate([120, 60, 120]);
  }
  app.refresh?.();
  app.badge?.();
}

async function deliver(th, obj) {
  if (th.peer.demo) return true;
  try {
    await sendTo(th.peer.pub, { v: 1, id: newId(), from: myCard(), t: Date.now(), ...obj });
    return true;
  } catch {
    push(th, { sys: true, text: 'Не отправилось: нет сети. Попробуйте ещё раз, когда появится связь.' });
    return false;
  }
}

export async function apply(post, text) {
  await identity();
  const peer = post.demo
    ? { uid: post.id, name: post.name, age: post.age, g: post.g, level: post.level, verified: true, demo: true, guide: !!post.guide }
    : { uid: post.uid, pub: post.pub, name: post.name, age: post.age, g: post.g, level: post.level, verified: post.verified };
  const th = thread(peer);
  th.status = 'sent';
  th.postId = post.id;
  th.postTitle = post.routeTitle || routeById(post.route)?.title || 'Поход вместе';
  push(th, { me: true, text });
  push(th, { sys: true, text: 'Заявка ушла автору. Он увидит вашу анкету и сообщение. Телефон и контакты не передаются.' });
  save();
  await deliver(th, { type: 'request', postId: post.id, postTitle: th.postTitle, text });
  if (age() < 18) app.relay?.send('company', { with: peer.name, route: th.postTitle });
  log(`Заявка: ${peer.name}, ${th.postTitle}`);
  if (peer.demo) setTimeout(() => demoAnswer(th, post), 2500);
  changed();
  return th;
}

export async function answer(uid, accepted) {
  const th = co().threads[uid];
  th.status = accepted ? 'accepted' : 'declined';
  push(th, { sys: true, text: accepted ? 'Вы приняли заявку. Теперь можно переписываться и обменяться контактами.' : 'Вы отклонили заявку.' });
  save();
  await deliver(th, { type: 'answer', accepted, postId: th.postId });
  if (accepted && age() < 18) app.relay?.send('company', { with: th.peer.name, route: th.postTitle });
  if (accepted && th.peer.demo) setTimeout(() => demoSay(th, 'Спасибо! Тогда до встречи. Напишу, если что-то изменится.'), 2000);
  changed();
}

export async function sendChat(uid, text) {
  const th = co().threads[uid];
  push(th, { me: true, text });
  save();
  app.refresh?.();
  await deliver(th, { type: 'chat', text });
  if (th.peer.demo) setTimeout(() => demoSay(th, DEMO_REPLIES[th.messages.length % DEMO_REPLIES.length]), 1800);
  changed();
}

export async function shareContact(uid) {
  const th = co().threads[uid];
  const c = co().profile;
  if (!c?.contact) return toast('Укажите контакт в своей анкете');
  th.shared = true;
  push(th, { sys: true, text: `Вы поделились контактом: ${CONTACT_KINDS[c.contactKind]} ${c.contact}` });
  save();
  await deliver(th, { type: 'contact', contact: { kind: c.contactKind, value: c.contact } });
  if (th.peer.demo && !th.contact) setTimeout(() => demoContact(th), 1500);
  changed();
}

export function block(uid) {
  const c = co();
  if (!c.blocked.includes(uid)) c.blocked.push(uid);
  delete c.threads[uid];
  for (const [id, p] of Object.entries(c.board)) if (p.uid === uid) delete c.board[id];
  log('Пользователь заблокирован');
  changed('Заблокирован: вы больше не увидите его объявления и сообщения');
}

export function report(uid, reason) {
  const c = co();
  c.reports.push({ uid, reason, t: Date.now() });
  log(`Жалоба: ${reason}`);
  block(uid);
}

export async function handleInbox(m) {
  const c = co();
  if (!m?.from?.uid || !m.id || c.seen.includes(m.id) || c.blocked.includes(m.from.uid)) return;
  c.seen.push(m.id);
  if (c.seen.length > 400) c.seen.splice(0, 100);
  // Подростки и взрослые не могут писать друг другу
  if (group(Number(m.from.age)) !== group(age())) return;
  const f = m.from;
  const th = thread({ uid: f.uid, pub: f.pub, name: String(f.name).slice(0, 40), age: f.age, g: f.g, level: f.level, verified: !!f.verified, about: f.about, hikes: f.hikes });
  if (m.type === 'request') {
    th.status = 'incoming';
    th.postId = m.postId;
    th.postTitle = m.postTitle;
    push(th, { text: String(m.text).slice(0, 600) });
    if (age() < 18) app.relay?.send('company', { with: th.peer.name, route: th.postTitle });
    return changed(`Новая заявка от ${th.peer.name}`, f.uid);
  }
  if (m.type === 'answer') {
    th.status = m.accepted ? 'accepted' : 'declined';
    push(th, { sys: true, text: m.accepted ? `${th.peer.name} принял(а) заявку. Можно переписываться.` : `${th.peer.name} отклонил(а) заявку.` });
    return changed(m.accepted ? `${th.peer.name} принял(а) вашу заявку` : `${th.peer.name} отклонил(а) заявку`, f.uid);
  }
  if (m.type === 'chat' && th.status === 'accepted') {
    push(th, { text: String(m.text).slice(0, 600) });
    return changed(`${th.peer.name}: ${String(m.text).slice(0, 40)}`, f.uid);
  }
  if (m.type === 'contact' && th.status === 'accepted') {
    th.contact = { kind: m.contact?.kind, value: String(m.contact?.value || '').slice(0, 60) };
    push(th, { sys: true, text: `${th.peer.name} поделился(ась) контактом` });
    return changed(`${th.peer.name} поделился(ась) контактом`, f.uid);
  }
}

let started = false;
export async function startNet() {
  if (started || !state.profile?.done) return;
  started = true;
  subscribe(BOARD, (text) => {
    try {
      const p = cleanPost(JSON.parse(text));
      const c = co();
      if (!p || p.uid === state.me?.uid || c.blocked.includes(p.uid)) return;
      // Снять объявление может только его автор
      if (p.kind === 'close') {
        if (c.board[p.id]?.uid === p.uid) delete c.board[p.id];
      } else if (!c.board[p.id] || c.board[p.id].uid === p.uid) {
        c.board[p.id] = p;
      }
      const cutoff = Date.now() - 3 * 86400e3;
      for (const [id, q] of Object.entries(c.board)) if (q.t < cutoff) delete c.board[id];
      save();
      if (app.screen.name === 'company') app.refresh?.();
    } catch {
      // не JSON
    }
  });
  if (co().profile || co().posts.length || Object.keys(co().threads).length) await identity();
  if (state.me) {
    subscribe(await inboxOf(state.me.pub), async (text) => {
      try {
        await handleInbox(await openSealed(state.me.priv, text));
      } catch {
        // чужое сообщение
      }
    });
  }
  republish();
  window.addEventListener('online', republish);
}

// ---- Демо: ответы демо-профилей, чтобы показать весь путь на одном телефоне ----

const DEMO_REPLIES = ['Договорились! Возьми налобный фонарь на всякий случай.', 'Ок, увидимся. Я включу «В горах» и поставлю контрольное время.', 'Хорошо. Если что-то поменяется, напишу сюда.'];

function demoSay(th, text) {
  if (!co().threads[th.peer.uid]) return;
  push(th, { text });
  changed(`${th.peer.name}: ${text.slice(0, 40)}`, th.peer.uid);
}

function demoAnswer(th, post) {
  if (!co().threads[th.peer.uid]) return;
  const novice = state.profile.experience === 'novice';
  if (post.id === 'p8' && novice) {
    th.status = 'declined';
    push(th, { text: 'Извини, на кольцо с ночёвкой беру только с опытом ночёвок выше 3000 м. Давай сходим куда-нибудь попроще?' });
    return changed(`${th.peer.name} отклонил заявку`, th.peer.uid);
  }
  th.status = 'accepted';
  push(th, { text: post.guide ? `Заявка принята. Сбор в 7:00, ${post.meet || 'точку встречи пришлю в чат'}. Инструктор проверит снаряжение.` : `Привет! Да, пойдём вместе. Встречаемся в 7:30, ${post.meet || 'точку встречи напишу'}.` });
  changed(`${th.peer.name} принял(а) вашу заявку`, th.peer.uid);
}

function demoContact(th) {
  if (!co().threads[th.peer.uid]) return;
  const n = 10 + (th.peer.name.length % 80);
  th.contact = { kind: 'phone', value: `+7 700 000 00 ${n}` };
  push(th, { sys: true, text: `${th.peer.name} поделился(ась) контактом (демо-номер)` });
  changed(`${th.peer.name} поделился(ась) контактом`, th.peer.uid);
}

function demoIncoming(post) {
  const teen = age() < 18;
  const pool = PEOPLE.filter((p) => !!p.teen === teen && (post.only === 'all' || p.g === post.only));
  const p = pool[post.id.charCodeAt(0) % pool.length] || pool[0];
  if (!p || co().threads[p.id]) return;
  const th = thread({ uid: p.id, name: p.name, age: p.age, g: p.g, level: p.level, verified: true, demo: true, about: p.about });
  th.status = 'incoming';
  th.postId = post.id;
  th.postTitle = post.routeTitle;
  push(th, { text: `Привет! Можно с вами на «${post.routeTitle}»? ${p.about}` });
  changed(`Новая заявка от ${p.name}`);
}

export const demoPosts = () => [
  ...PEOPLE.map((p) => ({ ...p, kind: 'hike', demo: true })),
  ...GROUPS.map((g) => ({ ...g, kind: 'group', demo: true, guide: true, g: 'm', age: g.ages[0], level: 'experienced' })),
];
