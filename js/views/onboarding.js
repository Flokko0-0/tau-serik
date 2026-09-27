import { state, save, log, demoProfile, newFamilyCode } from '../store.js';
import { app, on, appName } from '../core.js';
import { esc, icon, toast, langPicker } from '../ui.js';
import { parseIin, ageRules } from '../iin.js';
import { EXP, expName } from '../risk.js';
import { contactsEditor, medicalEditor } from './profile.js';
import { t, pl } from '../i18n.js';

const STEPS = ['id', 'contacts', 'medical', 'safety'];
let egov = null;
let draft = { name: '', iin: '', phone: '', consent: false, parent: false };

const minorDraft = () => {
  const r = parseIin(draft.iin);
  return r.ok && r.age < 18;
};
const canVerify = () => parseIin(draft.iin).ok && draft.name.trim() && draft.consent && (!minorDraft() || draft.parent);

function consentBox() {
  return `<div class="consent" id="consent-box">
    <label class="check"><input type="checkbox" data-draft="consent" ${draft.consent ? 'checked' : ''}><span class="box" aria-hidden="true">${icon('check')}</span>
      <span>${t('Согласен(на) на обработку персональных данных, в том числе медицинских, по Закону РК «О персональных данных и их защите». Данные хранятся на телефоне и передаются близким только вместе с SOS.')}</span></label>
    ${minorDraft() ? `<label class="check"><input type="checkbox" data-draft="parent" ${draft.parent ? 'checked' : ''}><span class="box" aria-hidden="true">${icon('check')}</span>
      <span>${t('До 18 лет: родитель или законный представитель знает о регистрации и согласен. Он получит маршрут и SOS.')}</span></label>` : ''}
  </div>`;
}

function welcome() {
  return `<div class="welcome">
    <section class="hero hero-welcome">
      <canvas class="topo" aria-hidden="true"></canvas>
      ${langPicker('lang-hero')}
      <div class="hero-in">
        <span class="logo">${icon('mountain')}</span>
        <h1 class="display">${appName()}</h1>
        <p class="lead">${t('Спутник в горах: проверит погоду до выхода, заметит падение и позовёт помощь.')}</p>
      </div>
    </section>
    <div class="pad stack">
      <ul class="promises">
        <li>${icon('cloud-storm')}<div><b>${t('До выхода')}</b><span>${t('Погода на высоте, оценка риска и список вещей для вашего маршрута')}</span></div></li>
        <li>${icon('activity')}<div><b>${t('На тропе')}</b><span>${t('Падение, крик или кодовое слово: телефон спросит, всё ли в порядке, и позовёт помощь')}</span></div></li>
        <li>${icon('wifi-off')}<div><b>${t('Без сети')}</b><span>${t('Карта, трек, точки укрытий и первая помощь работают офлайн')}</span></div></li>
      </ul>
      <button class="btn btn-primary btn-block btn-lg" data-act="obStart">${t('Создать профиль')}</button>
      <div class="demo-pick">
        <span class="label">${t('Или посмотреть на примере')}</span>
        <button class="btn btn-block" data-act="obDemo" data-arg="adult">${icon('user')}${t('Айым, 22 года')}</button>
        <button class="btn btn-block" data-act="obDemo" data-arg="teen">${icon('user')}${t('Дана, 16 лет: подросток с родителями')}</button>
      </div>
    </div>
  </div>`;
}

function stepHead(step, title, text) {
  const i = STEPS.indexOf(step);
  return `<header class="ob-h">
    <div class="ob-bar" role="progressbar" aria-valuemin="1" aria-valuemax="${STEPS.length}" aria-valuenow="${i + 1}" aria-label="${t('Шаг {a} из {b}', { a: i + 1, b: STEPS.length })}">${STEPS.map((_, k) => `<i class="${k <= i ? 'f' : ''}"></i>`).join('')}</div>
    <span class="label">${t('Шаг {a} из {b}', { a: i + 1, b: STEPS.length })}</span>
    <h1 class="h1">${t(title)}</h1>
    <p class="muted">${t(text)}</p>
  </header>`;
}

function iinInfo() {
  if (draft.iin.replace(/\D/g, '').length < 12) return `<p class="small muted" id="iin-info">${t('12 цифр. Дата рождения и пол определяются из ИИН автоматически.')}</p>`;
  const r = parseIin(draft.iin);
  if (!r.ok) return `<p class="small t-crit" id="iin-info" role="alert">${icon('alert-triangle', 'inline')}${t(r.error)}</p>`;
  const [y, m, d] = r.birth.split('-');
  const rules = ageRules(r.age);
  const note = rules.group === 'child' ? 'До 14 лет: только вместе со взрослым' : rules.group === 'teen' ? 'До 18 лет: лёгкие и средние маршруты, родители получают уведомления' : 'Доступны все маршруты';
  return `<p class="iin-ok" id="iin-info">${icon('circle-check')}<span>${d}.${m}.${y} · ${r.age} ${pl(r.age, 'год|года|лет')} · ${t(r.gender === 'f' ? 'женский' : 'мужской')}<small>${t(note)}</small></span></p>`;
}

function stepId() {
  const r = parseIin(draft.iin);
  return `${stepHead('id', 'Кто идёт в горы', 'Возраст влияет на доступные маршруты, а подтверждённая личность - на безопасность поиска компании.')}
    <div class="stack">
      <div class="field"><label for="ob-name">${t('Имя и фамилия')}</label><input id="ob-name" class="input" data-draft="name" value="${esc(draft.name)}" autocomplete="name" placeholder="${t('Айым Нурланова')}"></div>
      <div class="field"><label for="ob-iin">${t('ИИН')}</label><input id="ob-iin" class="input mono" data-draft="iin" value="${esc(draft.iin)}" inputmode="numeric" maxlength="14" autocomplete="off" placeholder="000000000000">${iinInfo()}</div>
      ${egov?.verified ? '' : consentBox()}
      <div class="field"><label for="ob-phone">${t('Телефон')}</label><input id="ob-phone" class="input" data-draft="phone" value="${esc(draft.phone)}" type="tel" inputmode="tel" autocomplete="tel" placeholder="+7 7__ ___ __ __"></div>
      ${egov?.verified ? `<p class="iin-ok">${icon('shield-check')}<span>${t('Подтверждено через eGov')}<small>${t('Имя, дата рождения и пол совпадают с данными госбазы')}</small></span></p>`
        : egov?.sent ? `<div class="card egov-box">
            <p><b>${t('Запрос отправлен в eGov Mobile.')}</b> ${t('Введите код из SMS.')}</p>
            <div class="field"><label for="ob-code">${t('Код подтверждения')}</label><input id="ob-code" class="input mono" data-draft="code" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="••••••"></div>
            <p class="small muted">${t('Демо: в прототипе eGov имитируется, ваш код <b class="mono">{code}</b>. ИИН проверяется по настоящему алгоритму контрольной цифры.', { code: egov.code })}</p>
            <button class="btn btn-primary btn-block" data-act="obVerify">${t('Подтвердить')}</button>
          </div>`
        : `<button class="btn btn-block" data-act="obEgov" ${canVerify() ? '' : 'disabled'}>${icon('id-badge-2')}${t('Подтвердить через eGov')}</button>`}
      <button class="btn btn-primary btn-block btn-lg" data-act="obNext" data-arg="contacts" ${egov?.verified ? '' : 'disabled'}>${t('Дальше')}${icon('chevron-right')}</button>
    </div>`;
}

function stepContacts() {
  const minor = state.profile.birth && parseIin(state.profile.iin).age < 18;
  const ok = state.profile.contacts.length && (!minor || state.profile.contacts.some((c) => c.guardian));
  return `${stepHead('contacts', 'Кому писать, если что-то случится', minor ? 'Добавьте родителя: он получит маршрут, контрольное время и SOS. Можно добавить ещё друзей.' : 'Эти люди получат ваш маршрут, контрольное время и SOS с координатами.')}
    <div class="stack">${contactsEditor()}
      <button class="btn btn-primary btn-block btn-lg" data-act="obNext" data-arg="medical" ${ok ? '' : 'disabled'}>${t('Дальше')}${icon('chevron-right')}</button>
    </div>`;
}

function stepMedical() {
  return `${stepHead('medical', 'Медкарта для спасателей', 'Группа крови, аллергии и хронические болезни помогут врачам, если вы не сможете говорить.')}
    <div class="stack">${medicalEditor()}
      <button class="btn btn-primary btn-block btn-lg" data-act="obNext" data-arg="safety">${t('Дальше')}${icon('chevron-right')}</button>
      <button class="btn btn-block btn-ghost" data-act="obNext" data-arg="safety">${t('Заполню позже')}</button>
    </div>`;
}

function stepSafety() {
  const p = state.profile;
  const s = state.settings;
  const CD = [[30, t('{s} с', { s: 30 })], [60, t('{m} мин', { m: 1 })], [180, t('{m} мин', { m: 3 })], [300, t('{m} мин', { m: 5 })]];
  return `${stepHead('safety', 'Как вас защищать', 'Датчики включаются только в режиме «В горах». Звук и движение обрабатываются на телефоне и никуда не записываются.')}
    <div class="stack">
      <div class="field"><span class="field-l">${t('Опыт в горах')}</span>
        <div class="seg" role="group">${EXP.map((e) => `<button class="${p.experience === e ? 'on' : ''}" data-act="exp" data-arg="${e}" aria-pressed="${p.experience === e}">${expName(e, p.gender)}</button>`).join('')}</div></div>
      <div class="field"><span class="field-l">${t('Сколько ждать вашего ответа после падения')}</span>
        <div class="seg" role="group">${CD.map(([v, label]) => `<button class="${s.countdown === v ? 'on' : ''}" data-act="countdown" data-arg="${v}" aria-pressed="${s.countdown === v}">${label}</button>`).join('')}</div>
        <p class="small muted">${t('За это время можно нажать «Я в порядке». Потом SOS уйдёт сам.')}</p></div>
      <div class="field"><label for="ob-words">${t('Кодовые слова: сразу SOS')}</label><input id="ob-words" class="input" data-setting="codeWords" value="${esc(s.codeWords.join(', '))}">
        <p class="small muted">${t('Под стрессом сложно вспомнить сложное слово. Оставьте простые: «помогите», «спасите».')}</p></div>
      <button class="btn btn-primary btn-block btn-lg" data-act="obDone">${icon('check')}${t('Готово')}</button>
    </div>`;
}

export default {
  bare: true,
  render(step) {
    if (!state.profile || !step || step === 'welcome') return welcome();
    const body = { id: stepId, contacts: stepContacts, medical: stepMedical, safety: stepSafety }[step]?.() ?? welcome();
    return `<div class="pad ob">
      <button class="icon-btn back" data-act="obBack" aria-label="${t('Назад')}">${icon('chevron-left')}</button>
      ${langPicker('lang-ob')}
      ${body}
    </div>`;
  },
};

export function onDraftInput(el) {
  draft[el.dataset.draft] = el.type === 'checkbox' ? el.checked : el.value;
  if (el.dataset.draft === 'iin') {
    const info = document.getElementById('iin-info');
    if (info) info.outerHTML = iinInfo();
    const box = document.getElementById('consent-box');
    if (box) box.outerHTML = consentBox();
  }
  const btn = document.querySelector('[data-act="obEgov"]');
  if (btn) btn.disabled = !canVerify();
}

on({
  obStart: () => {
    state.profile = { name: '', iin: '', birth: '', gender: '', phone: '', verified: false, experience: 'novice', contacts: [], medical: { blood: '', allergies: [], chronic: [], meds: '', notes: '' }, familyCode: newFamilyCode() };
    egov = null;
    save();
    app.go('onboarding', 'id');
  },
  obDemo: (kind) => {
    // Демо-данные сразу на выбранном языке, как если бы человек заполнил их сам
    const d = demoProfile(kind);
    const m = d.medical;
    Object.assign(d, {
      name: t(d.name),
      contacts: d.contacts.map((c) => ({ ...c, name: t(c.name), relation: t(c.relation) })),
      medical: { ...m, allergies: m.allergies.map((x) => t(x)), chronic: m.chronic.map((x) => t(x)), meds: t(m.meds), notes: t(m.notes) },
    });
    state.profile = { ...d, done: true, consent: { at: Date.now(), parent: kind === 'teen' ? true : null } };
    state.company.profile = kind === 'teen'
      ? { about: t('Хожу с подругами по выходным, родители в курсе. Люблю фотографировать горы.'), tags: ['фото', 'спокойный темп'], only: 'f', prefs: t('Выходные, лёгкие маршруты'), contactKind: 'phone', contact: '+7 707 000 11 22', visible: false }
      : { about: t('Хожу по выходным, спокойный темп. Была на БАО и Кок-Жайляу, хочу на Кумбель.'), tags: ['спокойный темп', 'фото'], only: 'all', prefs: t('Выходные, средние маршруты'), contactKind: 'phone', contact: '+7 701 000 33 44', visible: false };
    state.settings.countdown = 30;
    save();
    log(t('Демо-профиль: {name}', { name: state.profile.name }));
    app.go('home');
  },
  obEgov: () => {
    egov = { sent: true, code: String(Math.floor(100000 + Math.random() * 900000)) };
    app.refresh();
    setTimeout(() => document.getElementById('ob-code')?.focus(), 50);
  },
  obVerify: () => {
    if ((draft.code || '').trim() !== egov.code) return toast(t('Код не совпадает'));
    const r = parseIin(draft.iin);
    Object.assign(state.profile, { name: draft.name.trim(), iin: r.iin, birth: r.birth, gender: r.gender, phone: draft.phone.trim(), verified: true, verifiedAt: Date.now(), consent: { at: Date.now(), parent: r.age < 18 ? draft.parent : null } });
    egov.verified = true;
    save();
    app.refresh();
  },
  obNext: (step) => {
    if (app.screen.id === 'id' && draft.phone.trim()) {
      state.profile.phone = draft.phone.trim();
      save();
    }
    app.go('onboarding', step);
  },
  obBack: () => {
    const i = STEPS.indexOf(app.screen.id);
    app.go('onboarding', i > 0 ? STEPS[i - 1] : 'welcome');
  },
  obDone: () => {
    state.profile.done = true;
    save();
    log(t('Профиль создан'));
    app.go('home');
  },
});
