import { state, save, log, demoProfile, newFamilyCode } from '../store.js';
import { app, on, APP_NAME } from '../core.js';
import { esc, icon, toast, plural } from '../ui.js';
import { parseIin, ageRules } from '../iin.js';
import { EXP, EXP_NAME } from '../risk.js';
import { contactsEditor, medicalEditor } from './profile.js';

const STEPS = ['id', 'contacts', 'medical', 'safety'];
let egov = null;
let draft = { name: '', iin: '', phone: '' };

function welcome() {
  return `<div class="welcome">
    <section class="hero hero-welcome">
      <canvas class="topo" aria-hidden="true"></canvas>
      <div class="hero-in">
        <span class="logo">${icon('mountain')}</span>
        <h1 class="display">${APP_NAME}</h1>
        <p class="lead">Спутник в горах: проверит погоду до выхода, заметит падение и позовёт помощь.</p>
      </div>
    </section>
    <div class="pad stack">
      <ul class="promises">
        <li>${icon('cloud-storm')}<div><b>До выхода</b><span>Погода на высоте, оценка риска и список вещей для вашего маршрута</span></div></li>
        <li>${icon('activity')}<div><b>На тропе</b><span>Падение, крик или кодовое слово: телефон спросит, всё ли в порядке, и позовёт помощь</span></div></li>
        <li>${icon('wifi-off')}<div><b>Без сети</b><span>Карта, трек, точки укрытий и первая помощь работают офлайн</span></div></li>
      </ul>
      <button class="btn btn-primary btn-block btn-lg" data-act="obStart">Создать профиль</button>
      <div class="demo-pick">
        <span class="label">Или посмотреть на примере</span>
        <button class="btn btn-block" data-act="obDemo" data-arg="adult">${icon('user')}Айым, 22 года</button>
        <button class="btn btn-block" data-act="obDemo" data-arg="teen">${icon('user')}Дана, 16 лет: подросток с родителями</button>
      </div>
    </div>
  </div>`;
}

function stepHead(step, title, text) {
  const i = STEPS.indexOf(step);
  return `<header class="ob-h">
    <div class="ob-bar" role="progressbar" aria-valuemin="1" aria-valuemax="${STEPS.length}" aria-valuenow="${i + 1}" aria-label="Шаг ${i + 1} из ${STEPS.length}">${STEPS.map((_, k) => `<i class="${k <= i ? 'f' : ''}"></i>`).join('')}</div>
    <span class="label">Шаг ${i + 1} из ${STEPS.length}</span>
    <h1 class="h1">${title}</h1>
    <p class="muted">${text}</p>
  </header>`;
}

function iinInfo() {
  if (draft.iin.replace(/\D/g, '').length < 12) return '<p class="small muted" id="iin-info">12 цифр. Дата рождения и пол определяются из ИИН автоматически.</p>';
  const r = parseIin(draft.iin);
  if (!r.ok) return `<p class="small t-crit" id="iin-info" role="alert">${icon('alert-triangle', 'inline')}${r.error}</p>`;
  const [y, m, d] = r.birth.split('-');
  const rules = ageRules(r.age);
  const note = rules.group === 'child' ? 'До 14 лет: только вместе со взрослым' : rules.group === 'teen' ? 'До 18 лет: лёгкие и средние маршруты, родители получают уведомления' : 'Доступны все маршруты';
  return `<p class="iin-ok" id="iin-info">${icon('circle-check')}<span>${d}.${m}.${y} · ${r.age} ${plural(r.age, 'год', 'года', 'лет')} · ${r.gender === 'f' ? 'женский' : 'мужской'}<small>${note}</small></span></p>`;
}

function stepId() {
  const r = parseIin(draft.iin);
  return `${stepHead('id', 'Кто идёт в горы', 'Возраст влияет на доступные маршруты, а подтверждённая личность - на безопасность поиска компании.')}
    <div class="stack">
      <div class="field"><label for="ob-name">Имя и фамилия</label><input id="ob-name" class="input" data-draft="name" value="${esc(draft.name)}" autocomplete="name" placeholder="Айым Нурланова"></div>
      <div class="field"><label for="ob-iin">ИИН</label><input id="ob-iin" class="input mono" data-draft="iin" value="${esc(draft.iin)}" inputmode="numeric" maxlength="14" autocomplete="off" placeholder="000000000000">${iinInfo()}</div>
      <div class="field"><label for="ob-phone">Телефон</label><input id="ob-phone" class="input" data-draft="phone" value="${esc(draft.phone)}" type="tel" inputmode="tel" autocomplete="tel" placeholder="+7 7__ ___ __ __"></div>
      ${egov?.verified ? `<p class="iin-ok">${icon('shield-check')}<span>Подтверждено через eGov<small>Имя, дата рождения и пол совпадают с данными госбазы</small></span></p>`
        : egov?.sent ? `<div class="card egov-box">
            <p><b>Запрос отправлен в eGov Mobile.</b> Введите код из SMS.</p>
            <div class="field"><label for="ob-code">Код подтверждения</label><input id="ob-code" class="input mono" data-draft="code" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="••••••"></div>
            <p class="small muted">Демо: в прототипе eGov имитируется, ваш код <b class="mono">${egov.code}</b>. ИИН проверяется по настоящему алгоритму контрольной цифры.</p>
            <button class="btn btn-primary btn-block" data-act="obVerify">Подтвердить</button>
          </div>`
        : `<button class="btn btn-block" data-act="obEgov" ${r.ok && draft.name.trim() ? '' : 'disabled'}>${icon('id-badge-2')}Подтвердить через eGov</button>`}
      <button class="btn btn-primary btn-block btn-lg" data-act="obNext" data-arg="contacts" ${egov?.verified ? '' : 'disabled'}>Дальше${icon('chevron-right')}</button>
    </div>`;
}

function stepContacts() {
  const minor = state.profile.birth && parseIin(state.profile.iin).age < 18;
  const ok = state.profile.contacts.length && (!minor || state.profile.contacts.some((c) => c.guardian));
  return `${stepHead('contacts', 'Кому писать, если что-то случится', minor ? 'Добавьте родителя: он получит маршрут, контрольное время и SOS. Можно добавить ещё друзей.' : 'Эти люди получат ваш маршрут, контрольное время и SOS с координатами.')}
    <div class="stack">${contactsEditor()}
      <button class="btn btn-primary btn-block btn-lg" data-act="obNext" data-arg="medical" ${ok ? '' : 'disabled'}>Дальше${icon('chevron-right')}</button>
    </div>`;
}

function stepMedical() {
  return `${stepHead('medical', 'Медкарта для спасателей', 'Группа крови, аллергии и хронические болезни помогут врачам, если вы не сможете говорить.')}
    <div class="stack">${medicalEditor()}
      <button class="btn btn-primary btn-block btn-lg" data-act="obNext" data-arg="safety">Дальше${icon('chevron-right')}</button>
      <button class="btn btn-block btn-ghost" data-act="obNext" data-arg="safety">Заполню позже</button>
    </div>`;
}

function stepSafety() {
  const p = state.profile;
  const s = state.settings;
  const CD = [[30, '30 с'], [60, '1 мин'], [180, '3 мин'], [300, '5 мин']];
  return `${stepHead('safety', 'Как вас защищать', 'Датчики включаются только в режиме «В горах». Звук и движение обрабатываются на телефоне и никуда не записываются.')}
    <div class="stack">
      <div class="field"><span class="field-l">Опыт в горах</span>
        <div class="seg" role="group">${EXP.map((e) => `<button class="${p.experience === e ? 'on' : ''}" data-act="exp" data-arg="${e}" aria-pressed="${p.experience === e}">${EXP_NAME[e]}</button>`).join('')}</div></div>
      <div class="field"><span class="field-l">Сколько ждать вашего ответа после падения</span>
        <div class="seg" role="group">${CD.map(([v, t]) => `<button class="${s.countdown === v ? 'on' : ''}" data-act="countdown" data-arg="${v}" aria-pressed="${s.countdown === v}">${t}</button>`).join('')}</div>
        <p class="small muted">За это время можно нажать «Я в порядке». Потом SOS уйдёт сам.</p></div>
      <div class="field"><label for="ob-words">Кодовые слова: сразу SOS</label><input id="ob-words" class="input" data-setting="codeWords" value="${esc(s.codeWords.join(', '))}">
        <p class="small muted">Под стрессом сложно вспомнить сложное слово. Оставьте простые: «помогите», «спасите».</p></div>
      <button class="btn btn-primary btn-block btn-lg" data-act="obDone">${icon('check')}Готово</button>
    </div>`;
}

export default {
  bare: true,
  render(step) {
    if (!state.profile || !step || step === 'welcome') return welcome();
    const body = { id: stepId, contacts: stepContacts, medical: stepMedical, safety: stepSafety }[step]?.() ?? welcome();
    return `<div class="pad ob">
      <button class="icon-btn back" data-act="obBack" aria-label="Назад">${icon('chevron-left')}</button>
      ${body}
    </div>`;
  },
};

export function onDraftInput(el) {
  draft[el.dataset.draft] = el.value;
  if (el.dataset.draft === 'iin') {
    const info = document.getElementById('iin-info');
    if (info) info.outerHTML = iinInfo();
    const btn = document.querySelector('[data-act="obEgov"]');
    if (btn) btn.disabled = !(parseIin(draft.iin).ok && draft.name.trim());
  }
  if (el.dataset.draft === 'name') {
    const btn = document.querySelector('[data-act="obEgov"]');
    if (btn) btn.disabled = !(parseIin(draft.iin).ok && draft.name.trim());
  }
}

on({
  obStart: () => {
    state.profile = { name: '', iin: '', birth: '', gender: '', phone: '', verified: false, experience: 'novice', contacts: [], medical: { blood: '', allergies: [], chronic: [], meds: '', notes: '' }, familyCode: newFamilyCode() };
    egov = null;
    save();
    app.go('onboarding', 'id');
  },
  obDemo: (kind) => {
    state.profile = { ...demoProfile(kind), done: true };
    state.settings.countdown = 30;
    save();
    log(`Демо-профиль: ${state.profile.name}`);
    app.go('home');
  },
  obEgov: () => {
    egov = { sent: true, code: String(Math.floor(100000 + Math.random() * 900000)) };
    app.refresh();
    setTimeout(() => document.getElementById('ob-code')?.focus(), 50);
  },
  obVerify: () => {
    if ((draft.code || '').trim() !== egov.code) return toast('Код не совпадает');
    const r = parseIin(draft.iin);
    Object.assign(state.profile, { name: draft.name.trim(), iin: r.iin, birth: r.birth, gender: r.gender, phone: draft.phone.trim(), verified: true, verifiedAt: Date.now() });
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
    log('Профиль создан');
    app.go('home');
  },
});
