import { state } from '../store.js';
import { on, online, age, gw } from '../core.js';
import { esc, icon, copy, qrSvg, toast, plural } from '../ui.js';
import { toDD, toDMS } from '../geo.js';
import { fmtTime } from '../time.js';
import * as alarm from '../alarm.js';
import { imOk, sendSOS, endTrip, extendTrip } from '../safety.js';

const RING = 2 * Math.PI * 54;
const clock = (s) => (s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : String(s));

export function sosText() {
  const p = state.profile;
  const pos = state.pos;
  const m = p?.medical || {};
  const lines = [`SOS! ${p?.name ?? ''} нужна помощь в горах.`];
  if (state.alert.reason) lines.push(state.alert.reason + '.');
  if (pos) {
    lines.push(`Координаты: ${toDD(pos.lat, pos.lon)} (±${pos.acc} м)${pos.alt ? `, высота ${pos.alt} м` : ''}.`);
    lines.push(`Карта: https://maps.google.com/?q=${pos.lat.toFixed(5)},${pos.lon.toFixed(5)}`);
  } else {
    lines.push('Координаты неизвестны.');
  }
  if (m.blood) lines.push(`Кровь: ${m.blood}.`);
  if (m.allergies?.length) lines.push(`Аллергия: ${m.allergies.join(', ')}.`);
  if (m.chronic?.length) lines.push(`Хронические: ${m.chronic.join(', ')}.`);
  return lines.join(' ');
}

export function medText() {
  const p = state.profile;
  const m = p.medical || {};
  const c = p.contacts?.[0];
  return [
    'МЕДКАРТА',
    `${p.name}, ${age()} ${plural(age(), 'год', 'года', 'лет')}`,
    `Группа крови: ${m.blood || 'не указана'}`,
    `Аллергии: ${m.allergies?.join(', ') || 'нет'}`,
    `Хронические: ${m.chronic?.join(', ') || 'нет'}`,
    m.meds ? `Лекарства: ${m.meds}` : '',
    m.notes ? `Важно: ${m.notes}` : '',
    c ? `Контакт: ${c.name} ${c.phone}` : '',
  ].filter(Boolean).join('\n');
}

const smsHref = (phone, text) => `sms:${phone.replace(/[^\d+]/g, '')}?&body=${encodeURIComponent(text)}`;

function check(a) {
  const total = Math.round((a.deadline - a.since) / 1000);
  const left = Math.max(0, Math.ceil((a.deadline - Date.now()) / 1000));
  return `<div class="ov ov-check" role="alertdialog" aria-modal="true" aria-labelledby="ov-t" aria-describedby="ov-d">
    <p class="ov-reason">${icon(a.manual ? 'urgent' : 'alert-triangle')}<b>${esc(a.reason)}</b>${a.detail ? `<span> · ${esc(a.detail)}</span>` : ''}</p>
    <h1 class="ov-title" id="ov-t">${a.manual ? 'Отправляю SOS' : 'Вы в порядке?'}</h1>
    <div class="ring" style="--total:${total}">
      <svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="54" class="ring-bg"/><circle cx="60" cy="60" r="54" class="ring-fg" data-ring stroke-dasharray="${RING}" stroke-dashoffset="${RING * (1 - left / total)}"/></svg>
      <span class="ring-n" data-count="${a.deadline}">${clock(left)}</span>
    </div>
    <p class="ov-d" id="ov-d">${a.manual ? 'Через несколько секунд близкие получат ваши координаты и медкарту.' : 'Если не ответите, близкие получат SOS с координатами и медкартой, включится сирена.'}</p>
    <div class="ov-btns">
      <button class="ov-ok" data-act="imOk">${icon(a.manual ? 'x' : 'check')}${a.manual ? 'Отмена' : 'Я в порядке'}</button>
      <button class="ov-help" data-act="sosNow">${icon('urgent')}${a.manual ? 'Отправить сейчас' : 'Нужна помощь'}</button>
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
  return `<div class="ov ov-sos" role="alertdialog" aria-modal="true" aria-labelledby="ov-t">
    <div class="ov-sos-head">
      <h1 class="ov-title" id="ov-t">SOS отправлен</h1>
      <p>${fmtTime(a.since)} · ${esc(a.reason)}</p>
    </div>
    <ul class="deliv">
      <li class="${fam[0]}">${icon(fam[0] === 'ok' ? 'circle-check' : 'clock')}<div><b>Близкие${n ? ` (${n})` : ''}${age() < 18 ? ', родители' : ''}</b><span>${fam[1]}</span></div></li>
      <li class="${a.rescue === 'done' ? 'ok' : 'wait'}">${icon(a.rescue === 'done' ? 'circle-check' : a.rescue === 'offline' ? 'phone-call' : 'clock')}<div><b>Служба спасения 112</b><span>${a.rescue === 'done' ? 'Передано: координаты, медкарта, маршрут <em>демо</em>' : a.rescue === 'offline' ? 'Нет интернета: позвоните 112 и продиктуйте координаты. Экстренный вызов может пройти через сеть другого оператора' : 'Передаём… <em>демо</em>'}</span></div></li>
      ${a.nearby ? `<li class="ok">${icon('users')}<div><b>Туристы рядом</b><span>${a.nearby} человека в радиусе 2 км получили сигнал <em>демо</em></span></div></li>` : ''}
    </ul>
    <section class="coords">
      <div class="label">Продиктуйте спасателям</div>
      ${pos ? `<div class="coords-dd mono">${toDD(pos.lat, pos.lon)}</div>
        <div class="coords-dms mono">${toDMS(pos.lat, pos.lon)}</div>
        <div class="coords-m">${pos.alt ? `Высота ${pos.alt.toLocaleString('ru-RU')} м · ` : ''}точность ±${pos.acc} м · ${fmtTime(pos.t)}</div>`
        : '<div class="coords-m">Координаты ещё не определены. Включите GPS или режим «В горах».</div>'}
    </section>
    <div class="ov-grid">
      <a class="ov-a" href="tel:112">${icon('phone-call')}<span>Позвонить 112</span></a>
      ${p.contacts.slice(0, 2).map((c) => `<a class="ov-a" href="${smsHref(c.phone, text)}">${icon('message')}<span>SMS: ${esc(c.relation || c.name)}</span></a>`).join('')}
      <button class="ov-a" data-act="shareSos">${icon('share')}<span>Поделиться</span></button>
      <button class="ov-a" data-act="copySos">${icon('copy')}<span>Копировать текст</span></button>
      <button class="ov-a ${snd === 'siren' ? 'on' : ''}" data-act="siren">${icon(snd === 'siren' ? 'volume' : 'volume-off')}<span>Сирена</span></button>
      <button class="ov-a ${snd === 'distress' ? 'on' : ''}" data-act="distress">${icon('bell')}<span>Сигнал 6/мин</span></button>
      <button class="ov-a" data-act="strobe">${icon('bolt')}<span>Вспышка</span></button>
      <button class="ov-a" data-act="medcard">${icon('heartbeat')}<span>Медкарта</span></button>
    </div>
    <p class="ov-hint">Сигнал 6/мин - международный горный сигнал бедствия, экономит заряд.</p>
    <button class="hold" data-hold="cancelSos"><span class="hold-fill"></span><span class="hold-t">Удерживайте, чтобы отменить тревогу</span></button>
  </div>`;
}

function overdue(a) {
  const left = Math.max(0, Math.ceil((a.deadline - Date.now()) / 1000));
  return `<div class="ov ov-overdue" role="alertdialog" aria-modal="true" aria-labelledby="ov-t">
    <p class="ov-reason">${icon('clock-exclamation')}<b>Контрольное время ${fmtTime(state.trip?.returnBy)} прошло</b></p>
    <h1 class="ov-title" id="ov-t">Вы вернулись?</h1>
    <div class="ring small" style="--total:${Math.round((a.deadline - a.since) / 1000)}">
      <svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="54" class="ring-bg"/><circle cx="60" cy="60" r="54" class="ring-fg" data-ring stroke-dasharray="${RING}" stroke-dashoffset="0"/></svg>
      <span class="ring-n" data-count="${a.deadline}">${clock(left)}</span>
    </div>
    <p class="ov-d">Если не ответите, близкие получат сигнал, что вы не вернулись, и вашу последнюю точку.</p>
    <div class="ov-btns">
      <button class="ov-ok" data-act="home">${icon('home')}Да, я ${gw('вернулся', 'вернулась')}</button>
      <button class="ov-mid" data-act="extend">${icon('clock')}Задерживаюсь, +1 час</button>
      <button class="ov-help" data-act="sosNow">${icon('urgent')}Нужна помощь</button>
    </div>
  </div>`;
}

function medcard() {
  const p = state.profile;
  const m = p.medical || {};
  return `<div class="sheet-wrap" data-act="closeMed">
    <div class="sheet med" role="dialog" aria-modal="true" aria-labelledby="med-t" data-stop>
      <div class="sheet-h"><h2 class="h2" id="med-t">Медкарта</h2><button class="icon-btn" data-act="closeMed" aria-label="Закрыть">${icon('x')}</button></div>
      <dl class="med-dl">
        <div><dt>Имя</dt><dd>${esc(p.name)}, ${age()} ${plural(age(), 'год', 'года', 'лет')}</dd></div>
        <div><dt>Группа крови</dt><dd class="big">${esc(m.blood || 'не указана')}</dd></div>
        <div><dt>Аллергии</dt><dd>${esc(m.allergies?.join(', ') || 'нет')}</dd></div>
        <div><dt>Хронические</dt><dd>${esc(m.chronic?.join(', ') || 'нет')}</dd></div>
        ${m.meds ? `<div><dt>Лекарства</dt><dd>${esc(m.meds)}</dd></div>` : ''}
        ${m.notes ? `<div><dt>Важно</dt><dd>${esc(m.notes)}</dd></div>` : ''}
      </dl>
      <div class="qr">${qrSvg(medText())}</div>
      <p class="small muted">QR читается любой камерой без интернета.</p>
    </div>
  </div>`;
}

export function renderAlert(root) {
  const a = state.alert;
  let html = '';
  if (a.stage === 'check') html = check(a);
  else if (a.stage === 'sos') html = sos(a);
  else if (a.stage === 'overdue') html = overdue(a);
  if (a.stage !== 'idle' && root.dataset.med) html += medcard();
  if (root.dataset.strobe && a.stage === 'sos') html += '<button class="strobe" data-act="strobe" aria-label="Выключить вспышку"></button>';
  root.innerHTML = html;
  document.body.classList.toggle('alerting', a.stage !== 'idle');
}

export function tickAlert(root) {
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
  imOk: () => imOk(),
  sosNow: () => {
    const a = state.alert;
    sendSOS(a.stage === 'overdue' ? `${gw('Не вернулся', 'Не вернулась')} к контрольному времени, нужна помощь` : a.manual ? a.reason : `${a.reason}: нажата «Нужна помощь»`, 'manual');
  },
  cancelSos: () => {
    delete root().dataset.med;
    delete root().dataset.strobe;
    imOk();
    toast('Тревога отменена. Близкие получили «всё в порядке»');
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
