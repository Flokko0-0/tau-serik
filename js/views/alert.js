import { state } from '../store.js';
import { app, on, online, age, gw } from '../core.js';
import { esc, icon, copy, qrSvg, toast } from '../ui.js';
import { toDD, toDMS } from '../geo.js';
import { fmtTime } from '../time.js';
import * as alarm from '../alarm.js';
import { imOk, sendSOS, endTrip, extendTrip, posPayload } from '../safety.js';
import { t, tIn, pl, int, second } from '../i18n.js';

const RING = 2 * Math.PI * 54;
const clock = (s) => (s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : String(s));
// Главная фраза на языке интерфейса и подпись на втором языке: в панике легче узнать родные слова
const two = (src) => `<small lang="${second()}">${tIn(second(), src)}</small>`;
const sub = (src) => `<p class="ov-kz" lang="${second()}">${tIn(second(), src)}</p>`;
const list = (a) => (a?.length ? a.map((x) => t(x)).join(', ') : '');

export function sosText() {
  const p = state.profile;
  const pos = state.pos;
  const m = p?.medical || {};
  const lines = [t('SOS! {name} нужна помощь в горах.', { name: p?.name ?? '' })];
  if (state.alert.reason) lines.push(state.alert.reason + '.');
  if (pos) {
    lines.push(t('Координаты: {pt} (±{acc} м)', { pt: toDD(pos.lat, pos.lon), acc: pos.acc }) + (pos.alt ? t(', высота {m} м', { m: pos.alt }) : '') + '.');
    lines.push(t('Карта: {url}', { url: `https://maps.google.com/?q=${pos.lat.toFixed(5)},${pos.lon.toFixed(5)}` }));
  } else {
    lines.push(t('Координаты неизвестны.'));
  }
  if (m.blood) lines.push(t('Кровь: {v}.', { v: m.blood }));
  if (m.allergies?.length) lines.push(t('Аллергия: {v}.', { v: list(m.allergies) }));
  if (m.chronic?.length) lines.push(t('Хронические: {v}.', { v: list(m.chronic) }));
  return lines.join(' ');
}

export function medText() {
  const p = state.profile;
  const m = p.medical || {};
  const c = p.contacts?.[0];
  return [
    t('МЕДКАРТА'),
    `${p.name}, ${age()} ${pl(age(), 'год|года|лет')}`,
    t('Группа крови: {v}', { v: m.blood || t('не указана') }),
    t('Аллергии: {v}', { v: list(m.allergies) || t('нет') }),
    t('Хронические: {v}', { v: list(m.chronic) || t('нет') }),
    m.meds ? t('Лекарства: {v}', { v: m.meds }) : '',
    m.notes ? t('Важно: {v}', { v: m.notes }) : '',
    c ? t('Контакт: {v}', { v: `${c.name} ${c.phone}` }) : '',
  ].filter(Boolean).join('\n');
}

const smsHref = (phone, text) => `sms:${phone.replace(/[^\d+]/g, '')}?&body=${encodeURIComponent(text)}`;

function check(a) {
  const total = Math.round((a.deadline - a.since) / 1000);
  const left = Math.max(0, Math.ceil((a.deadline - Date.now()) / 1000));
  return `<div class="ov ov-check" role="alertdialog" aria-modal="true" aria-labelledby="ov-t" aria-describedby="ov-d">
    <p class="ov-reason">${icon(a.manual ? 'urgent' : 'alert-triangle')}<b>${esc(a.reason)}</b>${a.detail ? `<span> · ${esc(a.detail)}</span>` : ''}</p>
    <h1 class="ov-title" id="ov-t">${t(a.manual ? 'Отправляю SOS' : 'Вы в порядке?')}</h1>
    ${sub(a.manual ? 'Отправляю SOS' : 'Вы в порядке?')}
    <div class="ring" style="--total:${total}">
      <svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="54" class="ring-bg"/><circle cx="60" cy="60" r="54" class="ring-fg" data-ring stroke-dasharray="${RING}" stroke-dashoffset="${RING * (1 - left / total)}"/></svg>
      <span class="ring-n" data-count="${a.deadline}">${clock(left)}</span>
    </div>
    <p class="ov-d" id="ov-d">${t(a.manual ? 'Через несколько секунд близкие получат ваши координаты и медкарту.' : 'Если не ответите, близкие получат SOS с координатами и медкартой, включится сирена.')}</p>
    <div class="ov-btns">
      <button class="ov-ok" data-act="imOk">${icon(a.manual ? 'x' : 'check')}<span>${t(a.manual ? 'Отмена' : 'Я в порядке')}${two(a.manual ? 'Отмена' : 'Я в порядке')}</span></button>
      <button class="ov-help" data-act="sosNow">${icon('urgent')}<span>${t(a.manual ? 'Отправить сейчас' : 'Нужна помощь')}${two(a.manual ? 'Отправить сейчас' : 'Нужна помощь')}</span></button>
    </div>
  </div>`;
}

function sos(a) {
  const p = state.profile;
  const pos = state.pos;
  const n = p.contacts.length;
  const queued = state.outbox.length > 0;
  const net = online();
  const fam = !n ? ['bad', 'Нет контактов близких'] : queued ? (net ? ['wait', 'Отправляем…'] : ['wait', 'Нет сети: сообщение в очереди, уйдёт само. Отправьте SMS']) : ['ok', 'Доставлено'];
  const text = sosText();
  const snd = alarm.playing();
  const demo = `<em>${t('демо')}</em>`;
  return `<div class="ov ov-sos" role="alertdialog" aria-modal="true" aria-labelledby="ov-t">
    <div class="ov-sos-head">
      <h1 class="ov-title" id="ov-t">${t('SOS отправлен')}</h1>
      ${sub('SOS отправлен')}
      <p>${fmtTime(a.since)} · ${esc(a.reason)}</p>
    </div>
    <ul class="deliv">
      <li class="${fam[0]}">${icon(fam[0] === 'ok' ? 'circle-check' : 'clock')}<div><b>${t('Близкие')}${n ? ` (${n})` : ''}${age() < 18 ? `, ${t('родители')}` : ''}</b><span>${t(fam[1])}</span></div></li>
      <li class="${a.rescue === 'done' ? 'ok' : 'wait'}">${icon(a.rescue === 'done' ? 'circle-check' : a.rescue === 'offline' ? 'phone-call' : 'clock')}<div><b>${t('Служба спасения 112')}</b><span>${a.rescue === 'done' ? `${t('Передано: координаты, медкарта, маршрут')} ${demo}` : a.rescue === 'offline' ? t('Нет интернета: позвоните 112 и продиктуйте координаты. Экстренный вызов может пройти через сеть другого оператора') : `${t('Передаём…')} ${demo}`}</span></div></li>
      ${a.nearby ? `<li class="ok">${icon('users')}<div><b>${t('Туристы рядом')}</b><span>${t('{n} {people} в радиусе 2 км получили сигнал', { n: a.nearby, people: pl(a.nearby, 'человек|человека|человек') })} ${demo}</span></div></li>` : ''}
    </ul>
    <section class="coords">
      <div class="label">${t('Продиктуйте спасателям')}</div>
      ${pos ? `<div class="coords-dd mono">${toDD(pos.lat, pos.lon)}</div>
        <div class="coords-dms mono">${toDMS(pos.lat, pos.lon)}</div>
        <div class="coords-m">${pos.alt ? `${t('Высота {m} м', { m: int(pos.alt) })} · ` : ''}${t('точность ±{m} м', { m: pos.acc })} · ${fmtTime(pos.t)}</div>`
        : `<div class="coords-m">${t('Координаты ещё не определены. Включите GPS или режим «В горах».')}</div>`}
    </section>
    <div class="ov-grid">
      <a class="ov-a" href="tel:112">${icon('phone-call')}<span>${t('Позвонить 112')}</span></a>
      ${p.contacts.slice(0, 2).map((c) => `<a class="ov-a" href="${smsHref(c.phone, text)}">${icon('message')}<span>SMS: ${esc(t(c.relation) || c.name)}</span></a>`).join('')}
      <button class="ov-a" data-act="shareSos">${icon('share')}<span>${t('Поделиться')}</span></button>
      <button class="ov-a" data-act="copySos">${icon('copy')}<span>${t('Копировать текст')}</span></button>
      <button class="ov-a ${snd === 'siren' ? 'on' : ''}" data-act="siren">${icon(snd === 'siren' ? 'volume' : 'volume-off')}<span>${t('Сирена')}</span></button>
      <button class="ov-a ${snd === 'distress' ? 'on' : ''}" data-act="distress">${icon('bell')}<span>${t('Сигнал 6/мин')}</span></button>
      <button class="ov-a" data-act="strobe">${icon('bolt')}<span>${t('Вспышка')}</span></button>
      <button class="ov-a" data-act="medcard">${icon('heartbeat')}<span>${t('Медкарта')}</span></button>
    </div>
    <p class="ov-hint">${t('Сигнал 6/мин - международный горный сигнал бедствия, экономит заряд.')}</p>
    <button class="hold" data-hold="cancelSos"><span class="hold-fill"></span><span class="hold-t">${t('Удерживайте, чтобы отменить тревогу')}</span></button>
  </div>`;
}

function overdue(a) {
  const left = Math.max(0, Math.ceil((a.deadline - Date.now()) / 1000));
  const back = gw('Да, я вернулся', 'Да, я вернулась');
  return `<div class="ov ov-overdue" role="alertdialog" aria-modal="true" aria-labelledby="ov-t">
    <p class="ov-reason">${icon('clock-exclamation')}<b>${t('Контрольное время {time} прошло', { time: fmtTime(state.trip?.returnBy) })}</b></p>
    <h1 class="ov-title" id="ov-t">${t('Вы вернулись?')}</h1>
    ${sub('Вы вернулись?')}
    <div class="ring small" style="--total:${Math.round((a.deadline - a.since) / 1000)}">
      <svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="54" class="ring-bg"/><circle cx="60" cy="60" r="54" class="ring-fg" data-ring stroke-dasharray="${RING}" stroke-dashoffset="0"/></svg>
      <span class="ring-n" data-count="${a.deadline}">${clock(left)}</span>
    </div>
    <p class="ov-d">${t('Если не ответите, близкие получат сигнал, что вы не вернулись, и вашу последнюю точку.')}</p>
    <div class="ov-btns">
      <button class="ov-ok" data-act="home">${icon('home')}<span>${t(back)}${two(back)}</span></button>
      <button class="ov-mid" data-act="extend">${icon('clock')}<span>${t('Задерживаюсь, +1 час')}${two('Задерживаюсь, +1 час')}</span></button>
      <button class="ov-help" data-act="sosNow">${icon('urgent')}<span>${t('Нужна помощь')}${two('Нужна помощь')}</span></button>
    </div>
  </div>`;
}

function medcard() {
  const p = state.profile;
  const m = p.medical || {};
  return `<div class="sheet-wrap" data-act="closeMed">
    <div class="sheet med" role="dialog" aria-modal="true" aria-labelledby="med-t" data-stop>
      <div class="sheet-h"><h2 class="h2" id="med-t">${t('Медкарта')}</h2><button class="icon-btn" data-act="closeMed" aria-label="${t('Закрыть')}">${icon('x')}</button></div>
      <dl class="med-dl">
        <div><dt>${t('Имя')}</dt><dd>${esc(p.name)}, ${age()} ${pl(age(), 'год|года|лет')}</dd></div>
        <div><dt>${t('Группа крови')}</dt><dd class="big">${esc(m.blood || t('не указана'))}</dd></div>
        <div><dt>${t('Аллергии')}</dt><dd>${esc(list(m.allergies) || t('нет'))}</dd></div>
        <div><dt>${t('Хронические')}</dt><dd>${esc(list(m.chronic) || t('нет'))}</dd></div>
        ${m.meds ? `<div><dt>${t('Лекарства')}</dt><dd>${esc(m.meds)}</dd></div>` : ''}
        ${m.notes ? `<div><dt>${t('Важно')}</dt><dd>${esc(m.notes)}</dd></div>` : ''}
      </dl>
      <div class="qr">${qrSvg(medText())}</div>
      <p class="small muted">${t('QR читается любой камерой без интернета.')}</p>
    </div>
  </div>`;
}

function pocket() {
  return `<div class="pocket" role="dialog" aria-label="${t('Экран в кармане')}">
    <p class="pocket-t" data-clock>${fmtTime(Date.now())}</p>
    <p class="pocket-s">${t('Датчики работают: падение, крик, GPS')}${state.trip ? `<br>${t('Контрольное время {time}', { time: fmtTime(state.trip.returnBy) })}` : ''}</p>
    <button class="hold pocket-hold" data-hold="pocketOff"><span class="hold-fill"></span><span class="hold-t">${t('Удерживайте, чтобы выйти')}</span></button>
  </div>`;
}

function askCard(q) {
  return `<div class="ask-card" role="alertdialog" aria-labelledby="ask-t">
    <p id="ask-t">${t('<b>{who}</b> спрашивает: всё в порядке?', { who: esc(q.who) })}</p>
    <div class="row-btns two">
      <button class="btn btn-primary" data-act="askOk">${icon('check')}${t('Всё хорошо')}</button>
      <button class="btn btn-warn" data-act="askHelp">${icon('urgent')}${t('Нужна помощь')}</button>
    </div>
  </div>`;
}

export function renderAlert(root) {
  const a = state.alert;
  let html = '';
  if (a.stage === 'check') html = check(a);
  else if (a.stage === 'sos') html = sos(a);
  else if (a.stage === 'overdue') html = overdue(a);
  else if (app.ask) html = askCard(app.ask);
  else if (app.pocket) html = pocket();
  if (a.stage !== 'idle' && root.dataset.med) html += medcard();
  if (root.dataset.strobe && a.stage === 'sos') html += `<button class="strobe" data-act="strobe" aria-label="${t('Выключить вспышку')}"></button>`;
  root.innerHTML = html;
  document.body.classList.toggle('alerting', a.stage !== 'idle' || !!app.pocket);
}

export function tickAlert(root) {
  const face = root.querySelector('[data-clock]');
  if (face) face.textContent = fmtTime(Date.now());
  const el = root.querySelector('[data-count]');
  if (!el) return;
  const a = state.alert;
  const left = Math.max(0, Math.ceil((a.deadline - Date.now()) / 1000));
  el.textContent = clock(left);
  const ring = root.querySelector('[data-ring]');
  const total = (a.deadline - a.since) / 1000;
  if (ring) ring.setAttribute('stroke-dashoffset', String(RING * (1 - left / total)));
}

const root = () => document.getElementById('overlay');
const rerender = () => renderAlert(root());

on({
  pocketOff: () => {
    app.pocket = false;
    rerender();
  },
  askOk: () => {
    app.relay?.send('ok', { text: t('Ответ на вопрос «{who}»: всё хорошо', { who: app.ask.who }), pos: posPayload() });
    app.ask = null;
    toast(t('Отправлено: всё хорошо'));
    rerender();
  },
  askHelp: () => {
    app.ask = null;
    sendSOS('Ответ на вопрос близкого: нужна помощь', 'manual');
  },
  imOk: () => imOk(),
  sosNow: () => {
    const a = state.alert;
    sendSOS(a.stage === 'overdue' ? t(gw('Не вернулся к контрольному времени, нужна помощь', 'Не вернулась к контрольному времени, нужна помощь')) : a.manual ? a.reason : t('{reason}: нажата «Нужна помощь»', { reason: a.reason }), 'manual');
  },
  cancelSos: () => {
    delete root().dataset.med;
    delete root().dataset.strobe;
    imOk();
    toast(t('Тревога отменена. Близкие получили «всё в порядке»'));
  },
  siren: () => {
    if (alarm.playing() === 'siren') alarm.stop();
    else alarm.siren();
    rerender();
  },
  distress: () => {
    if (alarm.playing() === 'distress') alarm.stop();
    else alarm.distress();
    rerender();
  },
  strobe: () => {
    const r = root();
    if (r.dataset.strobe) delete r.dataset.strobe;
    else r.dataset.strobe = '1';
    rerender();
  },
  medcard: () => {
    root().dataset.med = '1';
    rerender();
  },
  closeMed: () => {
    delete root().dataset.med;
    rerender();
  },
  copySos: () => copy(sosText(), 'Текст SOS скопирован'),
  shareSos: async () => {
    try {
      await navigator.share({ title: 'SOS', text: sosText() });
    } catch {
      copy(sosText(), 'Поделиться нельзя, текст SOS скопирован');
    }
  },
});

export { endTrip, extendTrip };
