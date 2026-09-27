import { state, save } from '../store.js';
import { app, on, age, allRoutes } from '../core.js';
import { esc, icon } from '../ui.js';
import { LEVELS, levelName, routeAllowed } from '../risk.js';
import { fmtHours } from '../time.js';
import { t, num } from '../i18n.js';

export const levelPips = (level) => {
  const n = LEVELS.indexOf(level) + 1;
  return `<span class="lvl lvl-${level}" title="${levelName(level)}">${[1, 2, 3, 4].map((i) => `<i class="${i <= n ? 'f' : ''}"></i>`).join('')}<b>${levelName(level)}</b></span>`;
};

const FILTERS = [['all', 'Все'], ['easy', 'Лёгкие'], ['medium', 'Средние'], ['hard', 'Сложные']];

export default {
  tab: 'routes',
  title: 'Маршруты',
  render() {
    const f = state.plan.filter || 'all';
    const a = age();
    const list = allRoutes().filter((r) => f === 'all' || r.level === f || (f === 'hard' && r.level === 'expert'));
    return `<div class="pad stack">
      <header class="page-h">
        <h1 class="h1">${t('Маршруты')}</h1>
        <p class="muted">${t('Заилийский Алатау. Треки и высоты из OpenStreetMap и Copernicus DEM.')}</p>
      </header>
      ${a != null && a < 18 ? `<p class="callout">${icon('shield-check')}${t('До 18 лет сложные маршруты закрыты. Родители получат ваш маршрут и контрольное время.')}</p>` : ''}
      <div class="chips" role="group" aria-label="${t('Сложность')}">
        ${FILTERS.map(([id, label]) => `<button class="chip ${f === id ? 'on' : ''}" data-act="filter" data-arg="${id}" aria-pressed="${f === id}">${t(label)}</button>`).join('')}
      </div>
      <button class="route-add" data-go="custom">${icon('plus')}<span><b>${t('Свой маршрут')}</b><small>${t('Кольсай, Чарын, Тургень: отметьте старт и цель на карте')}</small></span>${icon('chevron-right')}</button>
      <ul class="routes">
        ${list.map((r) => {
          const ok = routeAllowed(r, a);
          return `<li><button class="route-row ${ok ? '' : 'locked'}" data-go="route" data-id="${r.id}">
            <div class="route-row-t">
              <b>${esc(t(r.title))}</b>
              ${levelPips(r.level)}
            </div>
            <dl class="route-meta">
              <div><dt>${t('Путь')}</dt><dd>${t('{n} км', { n: num(r.walkKm, r.walkKm % 1 ? 1 : 0) })}</dd></div>
              <div><dt>${t('Набор')}</dt><dd>${t('{n} м', { n: r.up })}</dd></div>
              <div><dt>${t('Макс.')}</dt><dd>${t('{n} м', { n: r.maxEle })}</dd></div>
              <div><dt>${t('Время')}</dt><dd>${fmtHours(r.hours)}</dd></div>
            </dl>
            <span class="route-row-s">${ok ? icon('flag') + esc(t(r.start)) : icon('lock') + t('Доступно с 18 лет')}${r.custom ? `<em class="tag tag-live">${t('свой')}</em>` : ''}</span>
          </button>${r.custom ? `<button class="icon-btn route-del" data-act="delRoute" data-arg="${r.id}" aria-label="${t('Удалить маршрут {name}', { name: esc(r.title) })}">${icon('trash')}</button>` : ''}</li>`;
        }).join('')}
      </ul>
    </div>`;
  },
};

on({
  delRoute: (id) => {
    if (state.trip?.routeId === id) return;
    state.customRoutes = (state.customRoutes || []).filter((r) => r.id !== id);
    if (state.plan.routeId === id) delete state.plan.routeId;
    save();
    app.refresh();
  },
  filter: (id) => {
    state.plan.filter = id;
    save();
    app.refresh();
  },
});
