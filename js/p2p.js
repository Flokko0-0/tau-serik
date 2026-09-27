// Компания: публичная доска объявлений и личные зашифрованные сообщения между людьми.
// Сообщение шифруется открытым ключом получателя (ECDH P-256 + AES-GCM): прочитать его может только он.
const RELAY = 'https://ntfy.sh';
export const BOARD = 'ts-board-v1';
const enc = new TextEncoder();
const dec = new TextDecoder();
const EC = { name: 'ECDH', namedCurve: 'P-256' };

const b64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const hex = (bytes) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');

export const newId = () => hex(crypto.getRandomValues(new Uint8Array(8)));

async function sha256hex(text) {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(text)));
}

export async function createIdentity() {
  const kp = await crypto.subtle.generateKey(EC, true, ['deriveKey']);
  return {
    uid: newId(),
    pub: b64(await crypto.subtle.exportKey('raw', kp.publicKey)),
    priv: await crypto.subtle.exportKey('jwk', kp.privateKey),
  };
}

export const inboxOf = async (pub) => 'ts-in-' + (await sha256hex('tau-serik/inbox/' + pub)).slice(0, 32);

async function sharedKey(privateKey, pubB64) {
  const pub = await crypto.subtle.importKey('raw', unb64(pubB64), EC, false, []);
  return crypto.subtle.deriveKey({ name: 'ECDH', public: pub }, privateKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function sealFor(pubB64, obj) {
  const eph = await crypto.subtle.generateKey(EC, true, ['deriveKey']);
  const key = await sharedKey(eph.privateKey, pubB64);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj)));
  return JSON.stringify({ epk: b64(await crypto.subtle.exportKey('raw', eph.publicKey)), iv: b64(iv), ct: b64(ct) });
}

export async function openSealed(privJwk, text) {
  const { epk, iv, ct } = JSON.parse(text);
  const priv = await crypto.subtle.importKey('jwk', privJwk, EC, false, ['deriveKey']);
  const key = await sharedKey(priv, epk);
  return JSON.parse(dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, key, unb64(ct))));
}

export async function publish(obj) {
  const res = await fetch(`${RELAY}/${BOARD}`, { method: 'POST', body: JSON.stringify(obj) });
  if (!res.ok) throw new Error('HTTP ' + res.status);
}

export async function sendTo(pub, obj) {
  const res = await fetch(`${RELAY}/${await inboxOf(pub)}`, { method: 'POST', body: await sealFor(pub, obj) });
  if (!res.ok) throw new Error('HTTP ' + res.status);
}

export function subscribe(topic, onText) {
  const es = new EventSource(`${RELAY}/${topic}/sse?since=12h`);
  es.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.event === 'message') onText(msg.message, msg.time * 1000);
    } catch {
      // повреждённое сообщение
    }
  };
  return () => es.close();
}

// Проверка объявления с доски: доска публичная, поэтому принимаем только ожидаемые поля
export function cleanPost(o) {
  if (!o || o.v !== 1 || typeof o.id !== 'string' || typeof o.uid !== 'string') return null;
  if (o.kind === 'close') return { v: 1, kind: 'close', id: o.id, uid: o.uid };
  if (o.kind !== 'hike' && o.kind !== 'person') return null;
  const str = (s, n) => String(s ?? '').slice(0, n);
  const age = Number(o.age);
  if (!(age >= 10 && age <= 99) || typeof o.pub !== 'string') return null;
  return {
    v: 1, kind: o.kind, id: str(o.id, 40), uid: str(o.uid, 40), pub: str(o.pub, 200), t: Number(o.t) || 0,
    name: str(o.name, 40), age, g: o.g === 'f' ? 'f' : 'm', level: ['novice', 'basic', 'experienced'].includes(o.level) ? o.level : 'novice',
    verified: !!o.verified, hikes: Math.max(0, Math.min(999, Number(o.hikes) || 0)), about: str(o.about, 400),
    tags: Array.isArray(o.tags) ? o.tags.slice(0, 8).map((t) => str(t, 30)) : [], only: ['f', 'm'].includes(o.only) ? o.only : 'all',
    routeId: str(o.routeId, 40), routeTitle: str(o.routeTitle, 80), day: str(o.day, 10), time: str(o.time, 5),
    seats: Math.max(0, Math.min(20, Number(o.seats) || 0)), meet: str(o.meet, 120), prefs: str(o.prefs, 120),
  };
}
