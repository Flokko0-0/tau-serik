import { state, save } from './store.js';
import { app, actions, online, APP_NAME } from './core.js';
import { icon, esc, toast, initials, qrSvg } from './ui.js';
import { createSender } from './relay.js';
import { tick } from './safety.js';
import { status } from './sensors.js';
import { fmtLeft } from './time.js';
import { paintAll } from './topo.js';
import { renderAlert, tickAlert } from './views/alert.js';
import home, { live } from './views/home.js';
import routes from './views/routes.js';
import route, { onPlanInput, onGearToggle } from './views/route.js';
import map from './views/map.js';
import company, { onCompanyInput } from './views/company.js';
import aid from './views/aid.js';
import assistant, { ask } from './views/assistant.js';
import profile, { onContactSubmit, onMedAdd } from './views/profile.js';
import onboarding, { onDraftInput } from './views/onboarding.js';
import { demoPanel } from './views/demo.js';

const VIEWS = { home, routes, route, map, company, aid, assistant, profile, onboarding };
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
  return `<button class="net ${on ? '' : 'off'}" data-go="profile" data-id="family" title="${on ? 'Есть сеть' : 'Нет сети'}${q ? `, в очереди ${q}` : ''}">
    ${icon(on ? 'wifi' : 'wifi-off')}<span>${on ? (q ? `${q} в очереди` : 'Онлайн') : q ? `Офлайн · ${q}` : 'Офлайн'}</span></button>`;
}

function header(view, name, id) {
  const top = TABS.some(([t]) => t === name) && !id;
  return `<header class="top">
    ${top
      ? `<button class="brand" data-go="home" aria-label="${APP_NAME}, на главную"><span class="logo">${icon('mountain')}</span><span>${APP_NAME}</span></button>`
      : `<button class="icon-btn" data-act="back" aria-label="Назад">${icon('chevron-left')}</button><span class="top-title">${esc(view.title || '')}</span>`}
    <span class="top-sp"></span>
    <span data-net>${netButton()}</span>
    <button class="ava ava-me" data-go="profile" aria-label="Профиль">${esc(initials(state.profile?.name || '?'))}</button>
    <button class="sos-btn" data-act="sosPress" aria-label="SOS">SOS</button>
  </header>`;
}

function tabs(active) {
  return `<nav class="tabs" aria-label="Разделы">
    ${TABS.map(([t, ic, label]) => `<button class="tab ${active === t ? 'on' : ''}" data-go="${t}" ${active === t ? 'aria-current="page"' : ''}>${icon(ic)}<span>${label}</span></button>`).join('')}
  </nav>`;
}

function renderSide() {
  if (!$side || getComputedStyle($side).display === 'none') return;
  const url = location.href.split('#')[0];
  $side.innerHTML = `<div class="side-in">
    <canvas class="topo" aria-hidden="true"></canvas>
    <div class="side-brand"><span class="logo">${icon('mountain')}</span><b>${APP_NAME}</b></div>
    <h2 class="side-h">Безопасность в горах Заилийского Алатау</h2>
    <p class="side-p">Оценка риска до выхода, автоматический SOS при падении или крике, связь с близкими и первая помощь без интернета.</p>
    ${state.profile?.done ? `<section class="side-card"><h3 class="h3">Демо-пульт</h3>${demoPanel()}</section>` : `<p class="side-p">Выберите демо-профиль справа или создайте свой.</p>`}
    <section class="side-card side-qr"><div class="qr">${qrSvg(url)}</div><p>Откройте на телефоне: там работают настоящие датчики падения, микрофон и GPS.</p></section>
  </div>`;
  paintAll($side);
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
  document.title = view.title ? `${view.title} · ${APP_NAME}` : APP_NAME;
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
  renderSide();
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

document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset.plan) onPlanInput(el);
  if (el.dataset.gear) onGearToggle(el);
  if (el.dataset.company) onCompanyInput(el);
  if (el.dataset.setting) {
    const k = el.dataset.setting;
    let v = el.type === 'checkbox' ? el.checked : el.value;
    if (k === 'codeWords') v = v.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    state.settings[k] = v;
    save();
    if (k === 'share') refresh();
    if (state.mountain && ['fall', 'scream', 'codeword', 'codeWords', 'wakeLock'].includes(k)) toast('Изменение заработает после перезапуска режима «В горах»');
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
['pointerup', 'pointercancel'].forEach((t) => document.addEventListener(t, holdEnd));
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
