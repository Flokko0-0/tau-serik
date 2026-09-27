import { state, save } from './store.js';
import { app, actions, online, appName } from './core.js';
import { icon, esc, toast, initials, qrSvg, langPicker } from './ui.js';
import { createSender, listen } from './relay.js';
import { tick, tripWatch } from './safety.js';
import { startNet, unread } from './company.js';
import { status } from './sensors.js';
import { fmtLeft } from './time.js';
import { paintAll } from './topo.js';
import { renderAlert, tickAlert } from './views/alert.js';
import home, { live } from './views/home.js';
import routes from './views/routes.js';
import route, { onPlanInput, onGearToggle } from './views/route.js';
import map from './views/map.js';
import company, { onCompanyInput, onCompanyForm } from './views/company.js';
import custom, { onCustomForm, onCustomInput } from './views/custom.js';
import aid from './views/aid.js';
import assistant, { ask } from './views/assistant.js';
import profile, { onContactSubmit, onMedAdd, onAiKey } from './views/profile.js';
import onboarding, { onDraftInput } from './views/onboarding.js';
import { demoPanel } from './views/demo.js';
import { t, setLang } from './i18n.js';

const VIEWS = { home, routes, route, custom, map, company, aid, assistant, profile, onboarding };
const TABS = [['home', 'home', 'Главная'], ['routes', 'route', 'Маршруты'], ['map', 'map', 'Карта'], ['company', 'users', 'Компания'], ['aid', 'first-aid-kit', 'Помощь']];
const $app = document.getElementById('app');
const $overlay = document.getElementById('overlay');
const $side = document.getElementById('side');
let mounted = null;

function parseHash() {
  const [name, id] = location.hash.replace(/^#\/?/, '').split('/');
  return { name: VIEWS[name] ? name : 'home', id: id ? decodeURIComponent(id) : null };
}

function netButton() {
  const on = online();
  const q = state.outbox.length;
  return `<button class="net ${on ? '' : 'off'}" data-go="profile" data-id="family" title="${t(on ? 'Есть сеть' : 'Нет сети')}${q ? t(', в очереди {n}', { n: q }) : ''}">
    ${icon(on ? 'wifi' : 'wifi-off')}<span>${on ? (q ? t('{n} в очереди', { n: q }) : t('Онлайн')) : q ? t('Офлайн · {n}', { n: q }) : t('Офлайн')}</span></button>`;
}


function header(view, name, id) {
  const top = TABS.some(([k]) => k === name) && !id;
  return `<header class="top">
    ${top
      ? `<button class="brand" data-go="home" aria-label="${t('{app}, на главную', { app: appName() })}"><span class="logo">${icon('mountain')}</span><span>${appName()}</span></button>`
      : `<button class="icon-btn" data-act="back" aria-label="${t('Назад')}">${icon('chevron-left')}</button><span class="top-title">${esc(t(view.title || ''))}</span>`}
    <span class="top-sp"></span>
    ${langPicker()}
    <span data-net>${netButton()}</span>
    <button class="ava ava-me" data-go="profile" aria-label="${t('Профиль')}">${esc(initials(state.profile?.name || '?'))}</button>
    <button class="sos-btn" data-act="sosPress" aria-label="SOS">SOS</button>
  </header>`;
}

function tabs(active) {
  return `<nav class="tabs" aria-label="${t('Разделы')}">
    ${TABS.map(([k, ic, label]) => `<button class="tab ${active === k ? 'on' : ''}" data-go="${k}" ${active === k ? 'aria-current="page"' : ''}>${icon(ic)}<span>${t(label)}</span>${k === 'company' ? '<b class="tab-badge" data-badge hidden></b>' : ''}</button>`).join('')}
  </nav>`;
}

function renderSide() {
  if (!$side || getComputedStyle($side).display === 'none') return;
  const url = location.href.split('#')[0];
  $side.setAttribute('aria-label', t('О проекте и демо-пульт'));
  $side.innerHTML = `<div class="side-in">
    <canvas class="topo" aria-hidden="true"></canvas>
    <div class="side-brand"><span class="logo">${icon('mountain')}</span><b>${appName()}</b></div>
    <h2 class="side-h">${t('Безопасность в горах Заилийского Алатау')}</h2>
    <p class="side-p">${t('Оценка риска до выхода, автоматический SOS при падении или крике, связь с близкими и первая помощь без интернета.')}</p>
    ${state.profile?.done ? `<section class="side-card"><h3 class="h3">${t('Демо-пульт')}</h3>${demoPanel()}</section>` : `<p class="side-p">${t('Выберите демо-профиль справа или создайте свой.')}</p>`}
    <section class="side-card side-qr"><div class="qr">${qrSvg(url)}</div><p>${t('Откройте на телефоне: там работают настоящие датчики падения, микрофон и GPS.')}</p></section>
  </div>`;
  paintAll($side);
}

function updateBadge() {
  const b = $app.querySelector('[data-badge]');
  if (!b) return;
  const n = unread();
  b.hidden = !n;
  b.textContent = n > 9 ? '9+' : String(n);
  b.setAttribute('aria-label', t('непрочитанных: {n}', { n }));
}

function updateHeader() {
  const el = $app.querySelector('[data-net]');
  if (el) el.innerHTML = netButton();
}

function render() {
  const { name, id } = app.screen;
  if (!state.profile?.done && name !== 'onboarding') {
    location.replace('#/onboarding');
    return;
  }
  const view = VIEWS[name];
  mounted?.unmount?.();
  mounted = view;
  $app.className = 'app' + (view.bare ? ' bare' : '') + (view.full ? ' full' : '');
  $app.innerHTML = (view.bare ? '' : header(view, name, id)) + `<main class="main" id="main">${view.render(id)}</main>` + (view.bare ? '' : tabs(view.tab));
  const main = $app.querySelector('.main');
  view.mount?.(main, id);
  if (!view.mount || name !== 'profile' || !id) main.scrollTop = 0;
  paintAll($app);
  renderSide();
  updateBadge();
  startNet();
  startFamily();
  document.title = view.title ? `${t(view.title)} · ${appName()}` : appName();
}

function refresh() {
  const view = VIEWS[app.screen.name];
  if (view.update) {
    view.update();
  } else {
    const main = $app.querySelector('.main');
    if (!main) return render();
    const top = main.scrollTop;
    main.innerHTML = view.render(app.screen.id);
    view.mount?.(main, null);
    main.scrollTop = top;
    paintAll($app);
  }
  updateHeader();
  updateBadge();
  renderSide();
}

// Вопрос близкого «Всё в порядке?» с экрана близкого: слушаем семейный канал, пока есть сеть
let familyCode = null;
let stopFamily = null;
const booted = Date.now();
function startFamily() {
  const code = state.profile?.done && state.profile.familyCode;
  if (!code || code === familyCode) return;
  stopFamily?.();
  familyCode = code;
  listen(code, (ev, at) => {
    if (ev.from !== 'guardian' || ev.type !== 'ask') return;
    const id = ev.id || String(ev.t);
    if (state.asks.includes(id) || at < Math.min(booted, Date.now()) - 15 * 60e3) return;
    state.asks.push(id);
    if (state.asks.length > 50) state.asks.shift();
    app.ask = { id, who: String(ev.who || t('Близкий')).slice(0, 30), t: ev.t };
    save();
    app.renderAlert();
  }).then((stop) => (stopFamily = stop)).catch(() => {});
}

app.go = (name, id = null) => {
  const hash = '#/' + name + (id ? '/' + encodeURIComponent(id) : '');
  if (location.hash === hash) {
    app.screen = parseHash();
    render();
  } else {
    location.hash = hash;
  }
};
app.back = () => (history.length > 1 ? history.back() : app.go('home'));
app.refresh = refresh;
app.badge = updateBadge;
app.renderAlert = () => {
  renderAlert($overlay);
  if (state.alert.stage === 'idle') updateHeader();
};
app.relay = createSender({
  state, save, isOnline: online,
  onChange: () => {
    updateHeader();
    if (state.alert.stage === 'sos') renderAlert($overlay);
  },
});
actions.back = () => app.back();

// ---- События ----

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act], [data-go], [data-stop]');
  if (!el || (el.hasAttribute('data-stop') && !el.dataset.act && el.dataset.go === undefined)) return;
  if (el.dataset.go !== undefined) {
    e.preventDefault();
    app.go(el.dataset.go, el.dataset.id || null);
    return;
  }
  const fn = actions[el.dataset.act];
  if (fn) {
    e.preventDefault();
    fn(el.dataset.arg, el, e);
  }
});

document.addEventListener('input', (e) => {
  const el = e.target;
  if (el.dataset.draft !== undefined) onDraftInput(el);
  if (el.dataset.med && state.profile) {
    state.profile.medical[el.dataset.med] = el.value;
    save();
  }
});

// Смена языка: всё перерисовывается сразу, датчики и поход продолжают работать
const SPEECH = { kk: 'kk-KZ', ru: 'ru-RU', en: 'en-US' };
const WORD = { kk: 'көмектесіңдер', ru: 'помогите', en: 'help' };
function switchLang(l) {
  setLang(l);
  const s = state.settings;
  s.speechLang = SPEECH[l];
  if (!s.codeWords.includes(WORD[l])) s.codeWords = [...s.codeWords, WORD[l]];
  save();
  render();
  renderAlert($overlay);
}
app.switchLang = switchLang;

document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset.lang !== undefined) return switchLang(el.value);
  if (el.dataset.plan) onPlanInput(el);
  if (el.dataset.gear) onGearToggle(el);
  if (el.dataset.company) onCompanyInput(el);
  if (el.dataset.cu !== undefined) onCustomInput();
  if (el.dataset.setting) {
    const k = el.dataset.setting;
    let v = el.type === 'checkbox' ? el.checked : el.value;
    if (k === 'codeWords') v = v.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    state.settings[k] = v;
    save();
    if (k === 'share') refresh();
    if (state.mountain && ['fall', 'scream', 'codeword', 'codeWords', 'wakeLock'].includes(k)) toast(t('Изменение заработает после перезапуска режима «В горах»'));
  }
});

document.addEventListener('submit', (e) => {
  const f = e.target;
  const kind = f.dataset.form;
  if (!kind) return;
  e.preventDefault();
  if (kind === 'contact') onContactSubmit(f);
  else if (kind === 'allergies' || kind === 'chronic') onMedAdd(kind, f);
  else if (kind === 'ask') ask(f.elements.q.value);
  else if (['anketa', 'hike', 'apply', 'chat'].includes(kind)) onCompanyForm(kind, f);
  else if (kind === 'custom') onCustomForm(f);
  else if (kind === 'aikey') onAiKey(f);
});

// Удержание для отмены тревоги
let hold = null;
function holdStart(el) {
  el.classList.add('holding');
  hold = { el, id: setTimeout(() => {
    el.classList.remove('holding');
    hold = null;
    actions[el.dataset.hold]?.();
  }, 2000) };
}
function holdEnd() {
  if (!hold) return;
  clearTimeout(hold.id);
  hold.el.classList.remove('holding');
  hold = null;
}
document.addEventListener('pointerdown', (e) => {
  const el = e.target.closest('[data-hold]');
  if (el) holdStart(el);
});
['pointerup', 'pointercancel'].forEach((type) => document.addEventListener(type, holdEnd));
document.addEventListener('pointerout', (e) => {
  if (hold && e.target === hold.el && !hold.el.contains(e.relatedTarget)) holdEnd();
});
document.addEventListener('keydown', (e) => {
  const el = e.target.closest?.('[data-hold]');
  if (el && (e.key === 'Enter' || e.key === ' ') && !hold) {
    e.preventDefault();
    holdStart(el);
  }
  if (e.key === 'Escape' && $overlay.dataset.med) actions.closeMed?.();
});
document.addEventListener('keyup', (e) => {
  if (e.key === 'Enter' || e.key === ' ') holdEnd();
});
document.addEventListener('contextmenu', (e) => {
  if (e.target.closest('[data-hold]')) e.preventDefault();
});

window.addEventListener('hashchange', () => {
  app.screen = parseHash();
  render();
});
window.addEventListener('online', updateHeader);
window.addEventListener('offline', updateHeader);
let resizeT = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeT);
  resizeT = setTimeout(() => {
    document.querySelectorAll('canvas.topo').forEach((c) => delete c.dataset.drawn);
    paintAll();
    renderSide();
  }, 200);
});

// ---- Часы: обратные отсчёты, контрольное время, живые датчики ----

setInterval(() => {
  const now = Date.now();
  tick(now);
  tripWatch(now);
  tickAlert($overlay);
  document.querySelectorAll('[data-left]').forEach((el) => (el.textContent = fmtLeft(Math.abs(Number(el.dataset.left) - now))));
  document.querySelectorAll('[data-since]').forEach((el) => (el.textContent = fmtLeft(now - Number(el.dataset.since))));
  if (app.screen.name === 'home' && state.mountain) live();
}, 1000);

setInterval(() => {
  const m = document.querySelector('[data-meter]');
  if (m) m.style.transform = `scaleX(${Math.max(0.02, Math.min(1, (status.db + 70) / 60))})`;
}, 100);

// ---- Старт ----

if (state.mountain) {
  // датчики и звук браузер разрешает включить только по нажатию
  state.mountain = false;
  app.resumeNeeded = true;
  save();
}
app.screen = parseHash();
render();
renderAlert($overlay);

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
