import { state, save } from '../store.js';
import { app, on, age } from '../core.js';
import { esc, icon } from '../ui.js';
import { ROUTES } from '../data/routes.js';
import { LEVELS, LEVEL_NAME, routeAllowed } from '../risk.js';
import { fmtHours } from '../time.js';

export const levelPips = (level) => {
  const n = LEVELS.indexOf(level) + 1;
  return `<span class="lvl lvl-${level}" title="${LEVEL_NAME[level]}">${[1, 2, 3, 4].map((i) => `<i class="${i <= n ? 'f' : ''}"></i>`).join('')}<b>${LEVEL_NAME[level]}</b></span>`;
};

const FILTERS = [['all', 'Все'], ['easy', 'Лёгкие'], ['medium', 'Средние'], ['hard', 'Сложные']];

export default {
  tab: 'routes',
  title: 'Маршруты',
  render() {
    const f = state.plan.filter || 'all';
    const a = age();
    const list = ROUTES.filter((r) => f === 'all' || r.level === f || (f === 'hard' && r.level === 'expert'));
    return `<div class="pad stack">
      <header class="page-h">
        <h1 class="h1">Маршруты</h1>
        <p class="muted">Заилийский Алатау. Треки и высоты из OpenStreetMap и Copernicus DEM.</p>
      </header>
      ${a != null && a < 18 ? `<p class="callout">${icon('shield-check')}До 18 лет сложные маршруты закрыты. Родители получат ваш маршрут и контрольное время.</p>` : ''}
      <div class="chips" role="group" aria-label="Сложность">
        ${FILTERS.map(([id, t]) => `<button class="chip ${f === id ? 'on' : ''}" data-act="filter" data-arg="${id}" aria-pressed="${f === id}">${t}</button>`).join('')}
      </div>
      <ul class="routes">
        ${list.map((r) => {
          const ok = routeAllowed(r, a);
          return `<li><button class="route-row ${ok ? '' : 'locked'}" data-go="route" data-id="${r.id}">
            <div class="route-row-t">
              <b>${esc(r.title)}</b>
              ${levelPips(r.level)}
            </div>
            <dl class="route-meta">
              <div><dt>Путь</dt><dd>${String(r.walkKm).replace('.', ',')} км</dd></div>
              <div><dt>Набор</dt><dd>${r.up} м</dd></div>
              <div><dt>Макс.</dt><dd>${r.maxEle} м</dd></div>
              <div><dt>Время</dt><dd>${fmtHours(r.hours)}</dd></div>
            </dl>
            <span class="route-row-s">${ok ? icon('flag') + esc(r.start) : icon('lock') + 'Доступно с 18 лет'}</span>
          </button></li>`;
        }).join('')}
      </ul>
    </div>`;
  },
};

on({
  filter: (id) => {
    state.plan.filter = id;
    save();
    app.refresh();
  },
});
