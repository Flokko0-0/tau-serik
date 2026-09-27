import { state, cache, save } from '../store.js';
import { app, on, age, activeRoute, startMs, routeById } from '../core.js';
import { esc, icon } from '../ui.js';
import { answer, classify, SUGGESTIONS } from '../assistant.js';
import { askClaude, aiMode, aiName, parseQuestion, resolveStart, localBrief, AIError } from '../ai.js';
import { ROUTES } from '../data/routes.js';
import { PLACES } from '../data/places.js';
import { AID } from '../data/firstaid.js';
import { fmtDay } from '../time.js';

const chat = [];
let busy = false;

function localContext() {
  const route = activeRoute();
  return {
    route, fc: route ? cache.get('wx:' + route.id) : null, startMs: state.trip ? Date.now() : startMs(),
    profile: state.profile, age: age(), pos: state.pos, places: PLACES, routes: ROUTES, now: Date.now(),
  };
}

const MODE_TEXT = {
  proxy: 'ИИ Claude отвечает по прогнозу, маршруту и вашему опыту.',
  key: 'ИИ Claude отвечает по прогнозу, маршруту и вашему опыту.',
  gemini: 'ИИ Gemini отвечает по прогнозу, маршруту и вашему опыту.',
  offline: 'Нет интернета: отвечаю из встроенной базы, прогноза и треков на телефоне.',
  none: 'Встроенные ответы без интернета. Чтобы говорить с ИИ, подключите его в профиле.',
  off: 'ИИ выключен в профиле: отвечаю из встроенной базы.',
};

function chips(m) {
  const out = [];
  if (m.guide) out.push(`<button class="chip" data-go="aid" data-id="${m.guide.id}">${icon(m.guide.icon)}Памятка: ${esc(m.guide.title)}</button>`);
  if (m.plan) out.push(`<button class="chip" data-act="aiPlan" data-arg="${esc(m.plan.routeId)}|${m.plan.day}|${m.plan.time}">${icon('route')}${esc(m.plan.label)}</button>`);
  if (m.go) out.push(`<button class="chip" data-go="${m.go === 'route' ? 'route' : m.go}" data-id="${m.go === 'route' ? activeRoute()?.id ?? '' : ''}">${esc(m.goLabel || { routes: 'Маршруты', map: 'Карта', route: 'Маршрут' }[m.go])}</button>`);
  return out.length ? `<div class="msg-acts">${out.join('')}</div>` : '';
}

function bubble(m, i) {
  if (m.me) return `<li class="msg me"><p>${esc(m.text)}</p></li>`;
  if (m.ai) {
    return `<li class="msg bot ai" ${m.pending ? 'data-streaming' : ''} data-i="${i}">
      <p>${m.text ? esc(m.text) : '<span class="typing" aria-label="Печатает"><i></i><i></i><i></i></span>'}</p>
      ${m.pending ? '' : chips(m)}
    </li>`;
  }
  const a = m.a;
  const goId = a.routeId || '';
  return `<li class="msg bot">
    ${m.note ? `<p class="small muted">${esc(m.note)}</p>` : ''}
    <p>${esc(a.text)}</p>
    ${a.items?.length ? `${a.itemsTitle ? `<p><b>${esc(a.itemsTitle)}</b></p>` : ''}<ul>${a.items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    ${a.routeId ? `<div class="msg-acts"><button class="chip" data-go="route" data-id="${esc(goId)}">${icon('route')}${esc(a.goLabel)}</button></div>` : chips({ guide: a.aid && AID.find((x) => x.id === a.aid), go: a.go, goLabel: a.goLabel })}
  </li>`;
}

export default {
  tab: 'home',
  title: 'Помощник',
  render() {
    const mode = aiMode();
    const live = mode === 'proxy' || mode === 'key' || mode === 'gemini';
    return `<div class="chat">
      <div class="pad chat-head">
        <h1 class="h1">Помощник</h1>
        <p class="muted small"><span class="pill pill-${live ? 'ok' : 'off'}">${live ? `${aiName()} онлайн` : 'без ИИ'}</span> ${MODE_TEXT[mode]}</p>
      </div>
      <ol class="msgs pad" aria-live="polite">
        <li class="msg bot"><p>Привет! Спроси как у друга: «завтра в 7 хочу на БАО, как там?», «что надеть на Кумбель?», «где ближайшая вода?». Я посмотрю прогноз наверху, оценку риска и твой опыт.</p></li>
        ${chat.map(bubble).join('')}
      </ol>
      <div class="chat-foot">
        ${live ? '<p class="small muted">ИИ может ошибаться. В опасной ситуации сразу SOS или 112.</p>' : ''}
        <div class="chips scroll" role="group" aria-label="Подсказки">
          ${['Завтра в 7 хочу на БАО, как там?', ...SUGGESTIONS.slice(0, 5)].map((s) => `<button class="chip" data-act="ask" data-arg="${esc(s)}">${esc(s)}</button>`).join('')}
        </div>
        <form class="ask" data-form="ask">
          <label class="sr" for="ask-q">Вопрос</label>
          <input id="ask-q" class="input" name="q" autocomplete="off" maxlength="600" placeholder="Спросите что угодно про поход" ${busy ? 'disabled' : ''}>
          <button class="icon-btn solid" aria-label="Спросить" ${busy ? 'disabled' : ''}>${icon('send')}</button>
        </form>
      </div>
    </div>`;
  },
  mount(root) {
    root.querySelector('.msgs')?.lastElementChild?.scrollIntoView({ block: 'end' });
  },
};

function scrollEnd(smooth = true) {
  document.querySelector('.msgs')?.lastElementChild?.scrollIntoView({ block: 'end', behavior: smooth ? 'smooth' : 'auto' });
}

function planChip(q) {
  const p = parseQuestion(q);
  const r = routeById(p.routeId);
  if (!r || (p.offset == null && !p.time)) return null;
  const { day, time, start } = resolveStart(p);
  return { routeId: r.id, day, time, label: `Запланировать: ${r.title}, ${fmtDay(start)}, ${time}` };
}

function history() {
  const msgs = [];
  for (const m of chat.slice(-13, -2)) {
    if (m.me) msgs.push({ role: 'user', content: m.text });
    else if (m.ai && m.text) msgs.push({ role: 'assistant', content: m.text });
    else if (m.a) msgs.push({ role: 'assistant', content: [m.a.text, ...(m.a.items || [])].join('\n') });
  }
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();
  return msgs;
}

// Без ИИ: памятки первой помощи по ключевым словам, сводка по маршруту, остальное из базы
async function localAnswer(text) {
  const kb = classify(text);
  if (kb?.aid) return answer(text, localContext());
  const brief = await localBrief(text).catch(() => null);
  return brief || answer(text, localContext());
}

export async function ask(q) {
  const text = String(q || '').trim();
  if (!text || busy) return;
  chat.push({ me: true, text });
  const mode = aiMode();
  const local = classify(text);
  const guide = local?.aid && AID.find((x) => x.id === local.aid);
  if (mode !== 'proxy' && mode !== 'key' && mode !== 'gemini') {
    chat.push({ a: await localAnswer(text) });
    app.refresh();
    return setTimeout(scrollEnd, 30);
  }
  const msg = { ai: true, text: '', pending: true, guide, plan: planChip(text) };
  chat.push(msg);
  busy = true;
  app.refresh();
  setTimeout(() => scrollEnd(false), 20);
  const i = chat.length - 1;
  try {
    await askClaude(text, history(), (chunk) => {
      msg.text += chunk.replace(/[\u2014\u2013]/g, '-');
      const el = document.querySelector(`[data-i="${i}"] p`);
      if (el) el.textContent = msg.text;
    });
    msg.pending = false;
    if (!msg.text.trim()) throw new AIError('пустой ответ');
  } catch (e) {
    chat.splice(i, 1);
    const why = e instanceof AIError ? (e.message === 'refusal' ? 'ИИ не стал отвечать на этот вопрос' : `ИИ недоступен: ${e.message}`) : 'ИИ недоступен';
    chat.push({ a: await localAnswer(text), note: `${why}. Ответ без ИИ.` });
  } finally {
    busy = false;
    app.refresh();
    setTimeout(scrollEnd, 30);
  }
}

on({
  ask: (q) => ask(q),
  aiPlan: (arg) => {
    const [routeId, day, time] = arg.split('|');
    Object.assign(state.plan, { routeId, day, time });
    save();
    app.go('route', routeId);
  },
});
