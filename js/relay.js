// Канал с близкими через ntfy.sh по семейному коду. Сообщения шифруются AES-256-GCM ключом из кода:
// посредник видит только шифр. Без сети сообщения ждут в очереди и уходят, когда связь появится.
const RELAY = 'https://ntfy.sh';
const enc = new TextEncoder();
const dec = new TextDecoder();

async function sha256hex(text) {
  const h = await crypto.subtle.digest('SHA-256', enc.encode(text));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const topicFor = async (code) => 'ts-' + (await sha256hex('tau-serik/topic/' + code)).slice(0, 32);

// Отдельный канал push-уведомлений для приложения ntfy: только короткий текст без координат и медкарты
export const pushTopicFor = async (code) => 'ts-push-' + (await sha256hex('tau-serik/push/' + code)).slice(0, 24);
const PUSH = {
  sos: [5, 'rotating_light', (e) => `${e.name}: SOS`, 'Нужна помощь. Координаты и медкарта на экране близкого'],
  check: [4, 'warning', (e) => `${e.name}: сработал датчик`, 'Телефон ждёт ответа «Я в порядке»'],
  overdue: [5, 'rotating_light', (e) => `${e.name}: не ${e.g === 'f' ? 'вернулась' : 'вернулся'} к сроку`, 'Контрольное время прошло, а отметки нет'],
  battery: [4, 'battery', (e) => `${e.name}: садится телефон`, 'Пришла последняя точка на карте'],
  warn: [3, 'warning', (e) => `${e.name}: предупреждение`, (e) => e.title || 'Опасность на маршруте'],
  trip: [3, 'mountain', (e) => `${e.name} ${e.g === 'f' ? 'вышла' : 'вышел'} в горы`, (e) => e.route || 'Маршрут на экране близкого'],
  home: [3, 'white_check_mark', (e) => `${e.name} ${e.g === 'f' ? 'вернулась' : 'вернулся'}`, 'Поход завершён'],
  ok: [3, 'white_check_mark', (e) => `${e.name}: всё в порядке`, (e) => e.text || 'Тревога отменена'],
};

async function pushPing(code, ev) {
  const p = PUSH[ev.type];
  if (!p) return;
  const [priority, tags, title, body] = p;
  const click = new URL('guardian.html', location.href).href;
  const q = new URLSearchParams({ title: title(ev), priority, tags, click });
  await fetch(`${RELAY}/${await pushTopicFor(code)}?${q}`, { method: 'POST', body: typeof body === 'function' ? body(ev) : body }).catch(() => {});
}

// Экран близкого пишет туристу в тот же семейный канал (вопрос «всё в порядке?»)
export async function postFamily(code, event) {
  const res = await fetch(`${RELAY}/${await topicFor(code)}`, { method: 'POST', body: await seal(await keyFor(code), event) });
  if (!res.ok) throw new Error('HTTP ' + res.status);
}

const keys = new Map();
export async function keyFor(code) {
  if (!keys.has(code)) {
    const base = await crypto.subtle.importKey('raw', enc.encode(code), 'PBKDF2', false, ['deriveKey']);
    keys.set(code, crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: enc.encode('tau-serik/family'), iterations: 150000, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
    ));
  }
  return keys.get(code);
}

const b64 = (bytes) => btoa(String.fromCharCode(...bytes));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function seal(key, event) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(event))));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv);
  out.set(ct, 12);
  return b64(out);
}

export async function unseal(key, text) {
  const raw = unb64(text);
  return JSON.parse(dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(0, 12) }, key, raw.slice(12))));
}

// Отправитель: очередь в state.outbox, чтобы пережить потерю сети и перезагрузку
export function createSender({ state, save, isOnline, onChange = () => {} }) {
  let busy = false;
  async function flush() {
    const code = state.profile?.familyCode;
    if (busy || !code || !state.outbox.length || !isOnline()) return;
    busy = true;
    try {
      const topic = await topicFor(code);
      const key = await keyFor(code);
      while (state.outbox.length && isOnline()) {
        const ev = state.outbox[0];
        const res = await fetch(`${RELAY}/${topic}`, { method: 'POST', body: await seal(key, ev) });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        pushPing(code, ev);
        state.outbox.shift();
        save();
        onChange({ sent: ev });
      }
    } catch {
      // нет связи или лимит: попробуем позже
    } finally {
      busy = false;
      onChange({});
    }
  }
  setInterval(flush, 15000);
  window.addEventListener('online', flush);
  return {
    send(type, payload = {}) {
      const ev = { v: 1, type, t: Date.now(), name: state.profile?.name?.split(' ')[0] ?? '', g: state.profile?.gender, ...payload };
      if (type === 'pos') state.outbox = state.outbox.filter((e) => e.type !== 'pos');
      state.outbox.push(ev);
      save();
      onChange({});
      flush();
      return ev;
    },
    flush,
    pending: () => state.outbox.length,
  };
}

// Получатель (экран близкого): история за 12 часов + живые события
export async function listen(code, onEvent, onStatus = () => {}) {
  const topic = await topicFor(code);
  const key = await keyFor(code);
  const es = new EventSource(`${RELAY}/${topic}/sse?since=12h`);
  es.onopen = () => onStatus(true);
  es.onerror = () => onStatus(false);
  es.onmessage = async (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.event !== 'message') return;
      onEvent(await unseal(key, msg.message), msg.time * 1000);
    } catch {
      // чужое или повреждённое сообщение
    }
  };
  return () => es.close();
}
