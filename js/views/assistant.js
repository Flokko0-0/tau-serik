import { state, cache } from '../store.js';
import { app, on, age, activeRoute, startMs } from '../core.js';
import { esc, icon } from '../ui.js';
import { answer, SUGGESTIONS } from '../assistant.js';
import { ROUTES } from '../data/routes.js';
import { PLACES } from '../data/places.js';
import { AID } from '../data/firstaid.js';

const chat = [];

function context() {
  const route = activeRoute();
  return {
    route, fc: route ? cache.get('wx:' + route.id) : null, startMs: state.trip ? Date.now() : startMs(),
    profile: state.profile, age: age(), pos: state.pos, places: PLACES, routes: ROUTES, now: Date.now(),
  };
}

function bubble(m) {
  if (m.me) return `<li class="msg me"><p>${esc(m.text)}</p></li>`;
  const a = m.a;
  const guide = a.aid && AID.find((x) => x.id === a.aid);
  return `<li class="msg bot">
    <p>${esc(a.text)}</p>
    ${a.items?.length ? `<ul>${a.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>` : ''}
    <div class="msg-acts">
      ${guide ? `<button class="chip" data-go="aid" data-id="${guide.id}">${icon(guide.icon)}Памятка: ${esc(guide.title)}</button>` : ''}
      ${a.go ? `<button class="chip" data-go="${a.go === 'route' ? 'route' : a.go}" data-id="${a.go === 'route' ? activeRoute()?.id ?? '' : ''}">${esc(a.goLabel || { routes: 'Маршруты', map: 'Карта', route: 'Маршрут' }[a.go])}</button>` : ''}
    </div>
  </li>`;
}

export default {
  tab: 'home',
  title: 'Помощник',
  render() {
    const r = activeRoute();
    return `<div class="chat">
      <div class="pad chat-head">
        <h1 class="h1">Помощник</h1>
        <p class="muted small">Работает без интернета: отвечает по проверенной базе, прогнозу и треку${r ? ` маршрута «${esc(r.title)}»` : ''}.</p>
      </div>
      <ol class="msgs pad" aria-live="polite">
        <li class="msg bot"><p>Спросите, что надеть, какая погода наверху, где ближайшая вода или что делать при укусе клеща.</p></li>
        ${chat.map(bubble).join('')}
      </ol>
      <div class="chat-foot">
        <div class="chips scroll" role="group" aria-label="Подсказки">
          ${SUGGESTIONS.map((s) => `<button class="chip" data-act="ask" data-arg="${esc(s)}">${esc(s)}</button>`).join('')}
        </div>
        <form class="ask" data-form="ask">
          <label class="sr" for="ask-q">Вопрос</label>
          <input id="ask-q" class="input" name="q" autocomplete="off" placeholder="Например: что взять на БАО?">
          <button class="icon-btn solid" aria-label="Спросить">${icon('send')}</button>
        </form>
      </div>
    </div>`;
  },
  mount(root) {
    const list = root.querySelector('.msgs');
    list?.lastElementChild?.scrollIntoView({ block: 'end' });
  },
};

export function ask(q) {
  const text = q.trim();
  if (!text) return;
  chat.push({ me: true, text });
  chat.push({ a: answer(text, context()) });
  app.refresh();
  setTimeout(() => document.querySelector('.msgs')?.lastElementChild?.scrollIntoView({ block: 'end', behavior: 'smooth' }), 30);
}

on({ ask: (q) => ask(q) });
