import { state, save, log, reset, newFamilyCode } from '../store.js';
import { app, on, age } from '../core.js';
import { esc, icon, qrSvg, copy, toast, plural } from '../ui.js';
import { EXP, expName } from '../risk.js';
import { medText } from './alert.js';
import { demoPanel } from './demo.js';
import { disableMountain } from '../safety.js';
import { aiMode } from '../ai.js';
import { AI_PROXY } from '../config.js';

export const BLOOD = ['O(I) Rh+', 'O(I) Rh−', 'A(II) Rh+', 'A(II) Rh−', 'B(III) Rh+', 'B(III) Rh−', 'AB(IV) Rh+', 'AB(IV) Rh−'];
export const ALLERGY_HINTS = ['Пенициллин', 'Укусы пчёл', 'Орехи', 'Пыльца', 'Лактоза'];
export const CHRONIC_HINTS = ['Астма', 'Диабет', 'Эпилепсия', 'Гипертония', 'Болезни сердца'];
const RELATIONS = ['Мама', 'Папа', 'Брат', 'Сестра', 'Супруг(а)', 'Друг', 'Другое'];

export const guardianLink = () => new URL('guardian.html#' + state.profile.familyCode, location.href).href;
const fmtCode = (c) => `${c.slice(0, 4)}-${c.slice(4)}`;

export function contactsEditor() {
  const p = state.profile;
  const minor = age() < 18;
  return `<ul class="list">
      ${p.contacts.map((c) => `<li class="row">
        <span class="row-ic">${icon(c.guardian ? 'shield-heart' : 'user')}</span>
        <div class="row-t"><b>${esc(c.name)}</b><span class="small muted">${esc(c.phone)}${c.guardian ? ' · законный представитель' : ''}</span></div>
        ${minor && c.guardian && p.contacts.filter((x) => x.guardian).length === 1
          ? `<span class="icon-btn" title="До 18 лет родителя нельзя удалить: сначала добавьте другого представителя">${icon('lock')}</span>`
          : `<button class="icon-btn" data-act="delContact" data-arg="${c.id}" aria-label="Удалить ${esc(c.name)}">${icon('trash')}</button>`}
      </li>`).join('') || `<li class="empty">${icon('users')}Пока никого. Добавьте хотя бы одного человека.</li>`}
    </ul>
    <form class="form-grid" data-form="contact">
      <div class="field"><label for="ct-name">Имя</label><input id="ct-name" class="input" name="name" required autocomplete="off" placeholder="Мама, Гульмира"></div>
      <div class="field"><label for="ct-phone">Телефон</label><input id="ct-phone" class="input" name="phone" type="tel" required inputmode="tel" placeholder="+7 7__ ___ __ __"></div>
      <div class="field"><label for="ct-rel">Кто это</label><select id="ct-rel" class="input" name="relation">${RELATIONS.map((r) => `<option>${r}</option>`).join('')}</select></div>
      <label class="check"><input type="checkbox" name="guardian" ${minor && !p.contacts.some((c) => c.guardian) ? 'checked' : ''}><span class="box" aria-hidden="true">${icon('check')}</span><span>Родитель или законный представитель</span></label>
      <button class="btn">${icon('plus')}Добавить контакт</button>
    </form>
    ${minor && !p.contacts.some((c) => c.guardian) ? `<p class="callout warn">${icon('shield-heart')}До 18 лет нужен хотя бы один родитель или законный представитель.</p>` : ''}`;
}

function chipsEditor(kind, list, hints) {
  return `<div class="tags edit">
      ${list.map((v, i) => `<button class="tag on" data-act="delMed" data-arg="${kind}:${i}" aria-label="Убрать ${esc(v)}">${esc(v)}${icon('x')}</button>`).join('')}
      ${hints.filter((h) => !list.includes(h)).map((h) => `<button class="tag add" data-act="addMed" data-arg="${kind}:${esc(h)}">${icon('plus')}${esc(h)}</button>`).join('')}
    </div>
    <form class="inline-add" data-form="${kind}">
      <label class="sr" for="add-${kind}">Добавить своё</label>
      <input id="add-${kind}" class="input" name="v" placeholder="Своё" autocomplete="off">
      <button class="icon-btn solid" aria-label="Добавить">${icon('plus')}</button>
    </form>`;
}

export function medicalEditor() {
  const m = state.profile.medical;
  return `<div class="field"><label for="md-blood">Группа крови</label>
      <select id="md-blood" class="input" data-med="blood"><option value="">Не знаю</option>${BLOOD.map((b) => `<option ${m.blood === b ? 'selected' : ''}>${b}</option>`).join('')}</select></div>
    <div class="field"><span class="field-l">Аллергии</span>${chipsEditor('allergies', m.allergies, ALLERGY_HINTS)}</div>
    <div class="field"><span class="field-l">Хронические заболевания</span>${chipsEditor('chronic', m.chronic, CHRONIC_HINTS)}</div>
    <div class="field"><label for="md-meds">Лекарства, которые принимаете</label><input id="md-meds" class="input" data-med="meds" value="${esc(m.meds)}" placeholder="Например: ингалятор сальбутамол"></div>
    <div class="field"><label for="md-notes">Что ещё важно знать врачу</label><textarea id="md-notes" class="input" data-med="notes" rows="2" placeholder="Необязательно">${esc(m.notes)}</textarea></div>
    <p class="small muted">${icon('lock', 'inline')}Медкарта хранится только на этом телефоне. Уходит близким и спасателям только вместе с SOS.</p>`;
}

function aiSettings() {
  const s = state.settings;
  const mode = aiMode();
  const MODE = { proxy: 'подключён через сервер', key: 'подключён по ключу на этом телефоне', none: 'не подключён: работают встроенные ответы', offline: 'нет интернета: встроенные ответы', off: 'выключен' };
  return `<p class="small">Помощник на Claude отвечает по-человечески и опирается на прогноз, маршрут и ваш опыт. Сейчас: <b>${MODE[mode]}</b>.</p>
    ${AI_PROXY ? '' : `<form class="form-grid" data-form="aikey">
      <div class="field"><label for="ai-key">Ключ Anthropic API</label>
        <input id="ai-key" class="input mono" name="key" type="password" autocomplete="off" placeholder="${s.aiKey ? 'Ключ сохранён' : 'sk-ant-...'}"></div>
      <p class="small muted">${icon('lock', 'inline')}Ключ хранится только на этом телефоне и не попадает в код сайта. Для всех пользователей подключите сервер-посредник (инструкция в tools/ai-proxy).</p>
      <div class="row-btns two"><button class="btn btn-primary">${icon('check')}Сохранить ключ</button>${s.aiKey ? `<button type="button" class="btn" data-act="aiKeyDel">${icon('trash')}Удалить ключ</button>` : ''}</div>
    </form>`}
    <label class="toggle"><span><b>Выключить ИИ</b><small>Только встроенные ответы, вопросы никуда не отправляются</small></span>
      <input type="checkbox" data-setting="aiOff" ${s.aiOff ? 'checked' : ''}><span class="switch" aria-hidden="true"><span></span></span></label>`;
}

function settings() {
  const s = state.settings;
  const sw = (key, title, text) => `<label class="toggle"><span><b>${title}</b><small>${text}</small></span>
    <input type="checkbox" data-setting="${key}" ${s[key] ? 'checked' : ''}><span class="switch" aria-hidden="true"><span></span></span></label>`;
  const CD = [[30, '30 с'], [60, '1 мин'], [180, '3 мин'], [300, '5 мин']];
  const SENS = [['low', 'Низкая'], ['normal', 'Обычная'], ['high', 'Высокая']];
  return `${sw('fall', 'Падение', 'Акселерометр: свободное падение, удар, неподвижность')}
    ${sw('scream', 'Крик', 'Микрофон: громкий голос дольше 0,7 с. Звук не записывается')}
    ${sw('codeword', 'Кодовое слово', 'Сразу SOS без вопроса. Нужен интернет для распознавания речи')}
    <div class="field"><label for="st-words">Кодовые слова через запятую</label><input id="st-words" class="input" data-setting="codeWords" value="${esc(s.codeWords.join(', '))}"></div>
    <div class="field"><span class="field-l">Сколько ждать ответа «Я в порядке»</span>
      <div class="seg" role="group">${CD.map(([v, t]) => `<button class="${s.countdown === v ? 'on' : ''}" data-act="countdown" data-arg="${v}" aria-pressed="${s.countdown === v}">${t}</button>`).join('')}</div></div>
    <div class="field"><span class="field-l">Чувствительность к падению</span>
      <div class="seg" role="group">${SENS.map(([v, t]) => `<button class="${s.sensitivity === v ? 'on' : ''}" data-act="sens" data-arg="${v}" aria-pressed="${s.sensitivity === v}">${t}</button>`).join('')}</div></div>
    <div class="field"><span class="field-l">Язык кодового слова</span>
      <div class="seg" role="group">${[['ru-RU', 'Русский'], ['kk-KZ', 'Қазақша']].map(([v, t]) => `<button class="${s.speechLang === v ? 'on' : ''}" data-act="speechLang" data-arg="${v}" aria-pressed="${s.speechLang === v}">${t}</button>`).join('')}</div></div>
    ${sw('siren', 'Сирена при SOS', 'Помогает спасателям найти вас по звуку')}
    ${sw('batterySaver', 'Экономия заряда', 'При 20% выключить микрофон и распознавание речи, оставить падение и GPS')}
    ${sw('wakeLock', 'Не гасить экран в горах', 'В браузере датчики работают, пока экран включён')}`;
}

export default {
  tab: 'home',
  title: 'Профиль',
  render() {
    const p = state.profile;
    const a = age();
    const iinMasked = p.iin ? `${p.iin.slice(0, 4)}••••••${p.iin.slice(-2)}` : '';
    return `<div class="pad stack">
      <header class="page-h profile-h">
        <h1 class="h1">${esc(p.name)}</h1>
        <p class="muted">${a} ${plural(a, 'год', 'года', 'лет')} · ${p.gender === 'f' ? 'женский' : 'мужской'} · ИИН ${iinMasked}</p>
        ${p.verified ? `<span class="egov big">${icon('shield-check')}Личность подтверждена через eGov</span>` : `<button class="btn" data-go="onboarding" data-id="id">${icon('id-badge-2')}Подтвердить через eGov</button>`}
      </header>
      <section class="card family" id="family">
        <h2 class="h3">${icon('shield-heart')}Экран для близких</h2>
        <p class="small">Откройте ссылку на телефоне ${a < 18 ? 'родителя' : 'близкого'}: он увидит маршрут, контрольное время, вашу точку и SOS. Сообщения зашифрованы семейным кодом.</p>
        <div class="family-row">
          <div class="qr">${qrSvg(guardianLink())}</div>
          <div>
            <span class="label">Семейный код</span>
            <b class="code mono">${fmtCode(p.familyCode)}</b>
            <button class="btn" data-act="copyLink">${icon('copy')}Скопировать ссылку</button>
            <a class="link small" href="${guardianLink()}" target="_blank" rel="noopener">Открыть экран близкого</a>
          </div>
        </div>
        ${state.outbox.length ? `<p class="small muted">${icon('clock', 'inline')}В очереди ${state.outbox.length} сообщ. Уйдут, когда появится сеть.</p>` : ''}
      </section>
      <section class="sec" id="contacts"><h2 class="h2">Близкие</h2>${contactsEditor()}</section>
      <section class="sec" id="medical"><h2 class="h2">Медкарта</h2>${medicalEditor()}
        <details class="card med-qr"><summary>${icon('qrcode')}QR медкарты для спасателей</summary><div class="qr">${qrSvg(medText())}</div><p class="small muted">Читается любой камерой без интернета. Можно поставить на экран блокировки.</p></details>
      </section>
      <section class="sec"><h2 class="h2">Опыт в горах</h2>
        <div class="seg" role="group">${EXP.map((e) => `<button class="${p.experience === e ? 'on' : ''}" data-act="exp" data-arg="${e}" aria-pressed="${p.experience === e}">${expName(e, p.gender)}</button>`).join('')}</div>
      </section>
      <section class="sec settings"><h2 class="h2">Защита в горах</h2>${settings()}</section>
      <section class="sec" id="ai"><h2 class="h2">ИИ-помощник</h2>${aiSettings()}</section>
      <section class="sec demo-mobile"><h2 class="h2">Демо-пульт</h2>${demoPanel()}</section>
      <section class="sec">
        <button class="btn btn-block" data-act="newCode">${icon('refresh')}Сменить семейный код</button>
        <button class="btn btn-block btn-danger-ghost" data-act="wipe">${icon('trash')}Удалить все данные с телефона</button>
      </section>
    </div>`;
  },
  mount(root, id) {
    if (id) root.querySelector('#' + id)?.scrollIntoView({ block: 'start' });
  },
};

on({
  speechLang: (v) => {
    state.settings.speechLang = v;
    save();
    app.refresh();
    if (state.mountain) toast('Язык заработает после перезапуска режима «В горах»');
  },
  aiKeyDel: () => {
    delete state.settings.aiKey;
    save();
    toast('Ключ удалён с телефона');
    app.refresh();
  },
  copyLink: () => copy(guardianLink(), 'Ссылка для близкого скопирована'),
  delContact: (id) => {
    state.profile.contacts = state.profile.contacts.filter((c) => c.id !== id);
    save();
    app.refresh();
  },
  addMed: (arg) => {
    const [kind, v] = arg.split(/:(.*)/s);
    const list = state.profile.medical[kind];
    if (!list.includes(v)) list.push(v);
    save();
    app.refresh();
  },
  delMed: (arg) => {
    const [kind, i] = arg.split(':');
    state.profile.medical[kind].splice(Number(i), 1);
    save();
    app.refresh();
  },
  countdown: (v) => {
    state.settings.countdown = Number(v);
    save();
    app.refresh();
  },
  sens: (v) => {
    state.settings.sensitivity = v;
    save();
    app.refresh();
    if (state.mountain) toast('Новая чувствительность заработает после перезапуска режима «В горах»');
  },
  exp: (v) => {
    state.profile.experience = v;
    save();
    app.refresh();
  },
  newCode: () => {
    state.profile.familyCode = newFamilyCode();
    state.outbox = [];
    save();
    log('Семейный код изменён: старая ссылка больше не работает');
    toast('Новый код. Отправьте близким новую ссылку');
    app.refresh();
  },
  wipe: () => {
    if (!app.confirmWipe) {
      app.confirmWipe = true;
      toast('Нажмите ещё раз, чтобы удалить профиль, медкарту и журнал');
      setTimeout(() => (app.confirmWipe = false), 4000);
      return;
    }
    app.confirmWipe = false;
    if (state.mountain) disableMountain(false);
    reset();
    app.go('onboarding');
  },
});

export function onContactSubmit(form) {
  const f = new FormData(form);
  const name = String(f.get('name')).trim();
  const phone = String(f.get('phone')).trim();
  if (!name || phone.replace(/\D/g, '').length < 10) return toast('Проверьте имя и номер телефона');
  state.profile.contacts.push({ id: 'c' + Date.now(), name, phone, relation: f.get('relation'), guardian: !!f.get('guardian') });
  save();
  app.refresh();
}

export function onMedAdd(kind, form) {
  const v = String(new FormData(form).get('v')).trim();
  if (!v) return;
  const list = state.profile.medical[kind];
  if (!list.includes(v)) list.push(v);
  save();
  app.refresh();
}

export function onAiKey(form) {
  const key = String(new FormData(form).get('key')).trim();
  if (!key.startsWith('sk-ant-')) return toast('Это не похоже на ключ Anthropic: он начинается с sk-ant-');
  state.settings.aiKey = key;
  state.settings.aiOff = false;
  save();
  toast('Ключ сохранён на этом телефоне. Спросите помощника');
  app.refresh();
}
