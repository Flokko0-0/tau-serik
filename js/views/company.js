import { state, save, log } from '../store.js';
import { app, on, age, routeById } from '../core.js';
import { esc, icon, initials, toast } from '../ui.js';
import { PEOPLE, GROUPS } from '../data/people.js';
import { EXP_NAME } from '../risk.js';
import { ROUTES } from '../data/routes.js';
import { fmtDay } from '../time.js';

const SHOW = [['all', 'Всех'], ['f', 'Девушек'], ['m', 'Парней']];

function visible() {
  const a = age();
  const me = state.profile;
  const f = state.cache.company || { show: 'all', route: 'all' };
  const teen = a < 18;
  const people = PEOPLE.filter((p) => {
    if (!!p.teen !== teen) return false;
    if (f.show !== 'all' && p.g !== f.show) return false;
    if (p.only === 'f' && me.gender !== 'f') return false;
    if (f.route !== 'all' && p.route !== f.route) return false;
    return true;
  });
  const groups = GROUPS.filter((g) => a >= g.ages[0] && a <= g.ages[1] && !(g.only === 'f' && me.gender !== 'f') && (f.route === 'all' || g.route === f.route));
  return { people, groups, f, teen };
}

const dateOf = (days) => fmtDay(Date.now() + days * 86400e3);
const HUE = { f: 'a', m: 'b' };

function card(p) {
  const r = routeById(p.route);
  const sent = state.requests.includes(p.id);
  return `<li class="person">
    <div class="person-h">
      <span class="ava ava-${HUE[p.g]}" aria-hidden="true">${esc(initials(p.name))}</span>
      <div class="person-t">
        <b>${esc(p.name)}, ${p.age}</b>
        <span class="small muted">${EXP_NAME[p.level]}</span>
      </div>
      <span class="egov" title="Личность подтверждена через eGov">${icon('shield-check')}eGov</span>
    </div>
    <p class="person-plan">${icon('route')}<b>${esc(r.title)}</b><span>${dateOf(p.days)}</span></p>
    <p>${esc(p.about)}</p>
    <div class="tags">${p.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}${p.only === 'f' ? '<span class="tag tag-f">только девушки</span>' : ''}</div>
    <button class="btn ${sent ? '' : 'btn-primary'} btn-block" data-act="invite" data-arg="${p.id}" ${sent ? 'disabled' : ''}>${icon(sent ? 'check' : 'send')}${sent ? 'Запрос отправлен' : 'Позвать в поход'}</button>
  </li>`;
}

function group(g) {
  const r = routeById(g.route);
  const sent = state.requests.includes(g.id);
  return `<li class="person group">
    <div class="person-h">
      <span class="ava ava-g" aria-hidden="true">${icon('flag')}</span>
      <div class="person-t"><b>${esc(g.name)}</b><span class="small muted">${esc(g.leader)}</span></div>
      <span class="egov" title="Гид проверен">${icon('shield-check')}Гид</span>
    </div>
    <p class="person-plan">${icon('route')}<b>${esc(r.title)}</b><span>${dateOf(g.days)} · ${esc(g.seats)}</span></p>
    <p>${esc(g.about)}</p>
    <button class="btn ${sent ? '' : 'btn-primary'} btn-block" data-act="invite" data-arg="${g.id}" ${sent ? 'disabled' : ''}>${icon(sent ? 'check' : 'users')}${sent ? 'Заявка отправлена' : 'Записаться в группу'}</button>
  </li>`;
}

export default {
  tab: 'company',
  title: 'Компания',
  render() {
    const me = state.profile;
    const { people, groups, f, teen } = visible();
    const a = age();
    if (a < 14) {
      return `<div class="pad stack"><header class="page-h"><h1 class="h1">Компания</h1></header>
        <p class="callout">${icon('shield-check')}До 14 лет в горы ходят с родителями. Поиск компании откроется в 14 лет, а пока можно записаться в семейную группу через родителя.</p></div>`;
    }
    return `<div class="pad stack">
      <header class="page-h">
        <h1 class="h1">Компания</h1>
        <p class="muted">Все люди здесь подтвердили имя, возраст и пол через eGov. Контакты открываются только после взаимного согласия.</p>
      </header>
      ${!me.verified ? `<p class="callout warn">${icon('id-badge-2')}Подтвердите личность через eGov в профиле, чтобы звать людей в поход.</p>` : ''}
      ${teen ? `<p class="callout">${icon('shield-heart')}Вам ${a}: показываем только сверстников 14-17 лет и группы с инструктором. Родители узнают, с кем вы идёте.</p>` : ''}
      <div class="filters">
        <div class="seg" role="group" aria-label="Кого показывать">
          ${SHOW.map(([id, t]) => `<button class="${f.show === id ? 'on' : ''}" data-act="cShow" data-arg="${id}" aria-pressed="${f.show === id}">${t}</button>`).join('')}
        </div>
        <div class="field"><label for="c-route">Маршрут</label>
          <select id="c-route" class="input" data-company="route">
            <option value="all">Все маршруты</option>
            ${ROUTES.map((r) => `<option value="${r.id}" ${f.route === r.id ? 'selected' : ''}>${esc(r.title)}</option>`).join('')}
          </select></div>
      </div>
      ${groups.length ? `<section class="sec"><h2 class="h2">Группы с гидом</h2><ul class="people">${groups.map(group).join('')}</ul></section>` : ''}
      <section class="sec">
        <h2 class="h2">${teen ? 'Сверстники' : 'Попутчики'}</h2>
        ${people.length ? `<ul class="people">${people.map(card).join('')}</ul>` : `<p class="empty">${icon('users')}Никого с такими фильтрами. Попробуйте «Все маршруты».</p>`}
      </section>
      <section class="card rules">
        <h2 class="h3">${icon('shield-check')}Как встретиться безопасно</h2>
        <ul>
          <li>Первая встреча в людном месте: у Медеу, на остановке, у входа в парк.</li>
          <li>Начните поход в приложении: близкие увидят маршрут и имя попутчика.</li>
          <li>Не отдавайте телефон и деньги, не садитесь в машину к незнакомым.</li>
          <li>Если что-то пошло не так, сразу жмите SOS.</li>
        </ul>
        <p class="small muted">Демо-профили для показа. В рабочей версии вход только после проверки через eGov.</p>
      </section>
    </div>`;
  },
};

on({
  cShow: (id) => {
    state.cache.company = { ...(state.cache.company || { route: 'all' }), show: id };
    save();
    app.refresh();
  },
  invite: (id) => {
    if (!state.profile.verified) return toast('Сначала подтвердите личность через eGov');
    state.requests.push(id);
    const p = PEOPLE.find((x) => x.id === id) || GROUPS.find((x) => x.id === id);
    log(`Запрос в компанию: ${p.name}`);
    if (age() < 18) app.relay?.send('company', { with: p.name, route: routeById(p.route)?.title });
    save();
    toast(age() < 18 ? 'Запрос отправлен. Родители получили уведомление' : 'Запрос отправлен. Ответ придёт в уведомлениях');
    app.refresh();
  },
});

export function onCompanyInput(el) {
  state.cache.company = { ...(state.cache.company || { show: 'all' }), [el.dataset.company]: el.value };
  save();
  app.refresh();
}
