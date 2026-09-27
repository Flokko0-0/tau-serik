import { state, save } from '../store.js';
import { app, on, age, routeById, allRoutes } from '../core.js';
import { esc, icon, initials, toast } from '../ui.js';
import { expName } from '../risk.js';
import { fmtDay, fmtTime, dayKey, fromLocal } from '../time.js';
import {
  co, group, demoPosts, apply, answer, sendChat, shareContact, block, report, saveProfile, createHike, closeHike,
  CONTACT_KINDS, contactKind, contactHref, unread,
} from '../company.js';
import { t, pl } from '../i18n.js';

const TAGS = ['спокойный темп', 'быстрый темп', 'фото', 'первый раз', 'с ночёвкой', 'есть машина', 'с ребёнком', 'трейлраннинг'];
const ONLY = [['all', 'Со всеми'], ['f', 'Только с девушками'], ['m', 'Только с парнями']];
const TIMES = ['05:00', '05:30', '06:00', '06:30', '07:00', '07:30', '08:00', '08:30', '09:00', '09:30', '10:00', '11:00', '12:00'];
const REASONS = ['Оскорбления', 'Подозрительное поведение', 'Чужие фото или фейк', 'Реклама и спам'];
let applyFor = null;
let reportOpen = false;
let hikeFormOpen = false;

const dateOf = (p) => (p.days != null ? fmtDay(Date.now() + p.days * 86400e3) : p.day ? fmtDay(fromLocal(p.day, '12:00')) : '');
const peerKey = (p) => (p.demo ? p.id : p.uid);
// Демо-объявления и названия маршрутов переводятся, чужой текст остаётся как написан
const tx = (s) => esc(t(s));

function visiblePosts() {
  const me = state.profile;
  const g = group(age());
  const f = state.cache.company || { show: 'all', route: 'all' };
  const c = co();
  const all = [...Object.values(c.board), ...demoPosts()];
  return all.filter((p) => {
    if (c.blocked.includes(p.uid)) return false;
    if (p.kind === 'group') return age() >= p.ages[0] && age() <= p.ages[1] && !(p.only === 'f' && me.gender !== 'f') && (f.route === 'all' || p.route === f.route);
    if (group(p.age) !== g) return false;
    if (f.show !== 'all' && p.g !== f.show) return false;
    if (p.only !== 'all' && p.only !== me.gender) return false;
    const rid = p.route || p.routeId;
    if (f.route !== 'all' && rid !== f.route) return false;
    return true;
  }).sort((a, b) => (a.demo === b.demo ? (b.t || 0) - (a.t || 0) : a.demo ? 1 : -1));
}

function actionFor(p) {
  const th = co().threads[peerKey(p)];
  if (!th) return `<button class="btn btn-primary btn-block" data-act="applyOpen" data-arg="${esc(p.id)}">${icon('send')}${t(p.kind === 'group' ? 'Записаться в группу' : 'Подать заявку')}</button>`;
  const label = { sent: 'Заявка отправлена', accepted: 'Открыть чат', declined: 'Заявка отклонена', incoming: 'Ответить на заявку' }[th.status] || 'Открыть';
  return `<button class="btn btn-block" data-go="company" data-id="chat:${esc(peerKey(p))}">${icon(th.status === 'accepted' ? 'message' : 'clock')}${t(label)}</button>`;
}

function postCard(p) {
  const r = routeById(p.route || p.routeId);
  const title = r?.title || p.routeTitle;
  const isGroup = p.kind === 'group';
  return `<li class="person ${isGroup ? 'group' : ''}">
    <div class="person-h">
      <span class="ava ${isGroup ? 'ava-g' : p.g === 'f' ? 'ava-a' : 'ava-b'}" aria-hidden="true">${isGroup ? icon('flag') : esc(initials(t(p.name)))}</span>
      <div class="person-t">
        <b>${tx(p.name)}${isGroup ? '' : `, ${p.age}`}</b>
        <span class="small muted">${isGroup ? tx(p.leader) : `${expName(p.level, p.g)}${p.hikes ? ` · ${t('{n} {word} с приложением', { n: p.hikes, word: pl(p.hikes, 'поход|похода|походов') })}` : ''}`}</span>
      </div>
      <span class="egov" title="${t(isGroup ? 'Гид проверен' : 'Личность подтверждена через eGov')}">${icon('shield-check')}${isGroup ? t('Гид') : 'eGov'}</span>
    </div>
    ${p.kind === 'person'
      ? `<p class="person-plan">${icon('binoculars')}<b>${t('Ищет компанию')}</b><span>${p.prefs ? tx(p.prefs) : t('на ближайшие выходные')}</span></p>`
      : `<p class="person-plan">${icon('route')}<b>${tx(title)}</b><span>${dateOf(p)}${p.time ? `, ${p.time}` : ''}${p.seats ? ` · ${t('мест: {n}', { n: t(String(p.seats)) })}` : ''}</span></p>`}
    ${p.meet ? `<p class="person-plan">${icon('map-pin')}<span>${t('Встреча: {place}', { place: tx(p.meet) })}</span></p>` : ''}
    <p>${tx(p.about)}</p>
    <div class="tags">${(p.tags || []).map((tag) => `<span class="tag">${tx(tag)}</span>`).join('')}${p.only === 'f' ? `<span class="tag tag-f">${t('только девушки')}</span>` : p.only === 'm' ? `<span class="tag tag-f">${t('только парни')}</span>` : ''}<span class="tag ${p.demo ? 'tag-demo' : 'tag-live'}">${t(p.demo ? 'демо' : 'онлайн')}</span></div>
    ${actionFor(p)}
  </li>`;
}

function howItWorks() {
  return `<details class="card how">
    <summary>${icon('info-circle')}${t('Как работают заявки')}</summary>
    <ol class="steps small-steps">
      <li><b>${t('Заявка')}</b><span>${t('Вы пишете короткое сообщение. Автор получает его в разделе «Заявки» у себя в приложении, зашифрованным: прочитать может только он.')}</span></li>
      <li><b>${t('Автор решает')}</b><span>${t('Он видит ваше имя, возраст, опыт, отметку eGov и сообщение. Телефон и контакты не передаются.')}</span></li>
      <li><b>${t('Чат и контакты')}</b><span>${t('Если заявку приняли, открывается чат. Контактом (Telegram, WhatsApp, телефон) каждый делится сам, когда захочет.')}</span></li>
    </ol>
  </details>`;
}

function tabFind() {
  const f = state.cache.company || { show: 'all', route: 'all' };
  const list = visiblePosts();
  const a = age();
  return `${howItWorks()}
    ${a < 18 ? `<p class="callout">${icon('shield-heart')}${t('Вам {age}: показываем только сверстников 14-17 лет и группы с инструктором. Родители получают уведомление о каждой заявке.', { age: a })}</p>` : ''}
    <div class="filters">
      <div class="seg" role="group" aria-label="${t('Кого показывать')}">
        ${[['all', 'Всех'], ['f', 'Девушек'], ['m', 'Парней']].map(([id, label]) => `<button class="${f.show === id ? 'on' : ''}" data-act="cShow" data-arg="${id}" aria-pressed="${f.show === id}">${t(label)}</button>`).join('')}
      </div>
      <div class="field"><label for="c-route">${t('Маршрут')}</label>
        <select id="c-route" class="input" data-company="route"><option value="all">${t('Все маршруты')}</option>
          ${allRoutes().map((r) => `<option value="${r.id}" ${f.route === r.id ? 'selected' : ''}>${tx(r.title)}</option>`).join('')}
        </select></div>
    </div>
    ${list.length ? `<ul class="people">${list.map(postCard).join('')}</ul>` : `<p class="empty">${icon('users')}${t('Никого с такими фильтрами. Создайте свой поход во вкладке «Мои».')}</p>`}`;
}

function profileForm() {
  const p = co().profile || { about: '', tags: [], only: 'all', prefs: '', contactKind: 'tg', contact: '', visible: true };
  return `<form class="card stack-sm" data-form="anketa">
    <h2 class="h3">${icon('id-badge-2')}${t('Анкета попутчика')}</h2>
    <p class="small muted">${t('Анкету видят все пользователи приложения вашей возрастной группы. Контакт не публикуется: его увидит только тот, чью заявку вы приняли, и только если вы сами им поделитесь.')}</p>
    <div class="field"><label for="an-about">${t('О себе и как вы ходите')}</label>
      <textarea id="an-about" class="input" name="about" rows="3" maxlength="300" required placeholder="${t('Например: хожу по выходным, спокойный темп, была на БАО и Кок-Жайляу')}">${esc(p.about)}</textarea></div>
    <fieldset class="field bare"><legend class="field-l">${t('Интересы')}</legend>
      <div class="tags edit">${TAGS.map((tag) => `<label class="tag-check"><input type="checkbox" name="tags" value="${tag}" ${p.tags.includes(tag) ? 'checked' : ''}><span>${t(tag)}</span></label>`).join('')}</div></fieldset>
    <fieldset class="field bare"><legend class="field-l">${t('С кем готовы идти')}</legend>
      <div class="seg">${ONLY.map(([v, label]) => `<label class="seg-radio"><input type="radio" name="only" value="${v}" ${p.only === v ? 'checked' : ''}><span>${t(label)}</span></label>`).join('')}</div></fieldset>
    <div class="field"><label for="an-prefs">${t('Когда и куда хотите')}</label><input id="an-prefs" class="input" name="prefs" maxlength="100" value="${esc(p.prefs)}" placeholder="${t('Выходные, лёгкие и средние маршруты')}"></div>
    <div class="field"><span class="field-l">${t('Контакт после согласия')}</span>
      <div class="contact-row">
        <select class="input" name="contactKind" aria-label="${t('Способ связи')}">${Object.keys(CONTACT_KINDS).map((k) => `<option value="${k}" ${p.contactKind === k ? 'selected' : ''}>${contactKind(k)}</option>`).join('')}</select>
        <input class="input" name="contact" maxlength="40" value="${esc(p.contact)}" placeholder="${t('@username или +7 7__ ___ __ __')}" aria-label="${t('Контакт')}" required>
      </div></div>
    <label class="check"><input type="checkbox" name="visible" ${p.visible ? 'checked' : ''}><span class="box" aria-hidden="true">${icon('check')}</span><span>${t('Показывать анкету в поиске: вам смогут написать, даже если у вас нет объявления о походе')}</span></label>
    <button class="btn btn-primary btn-block">${icon('check')}${t(co().profile ? 'Сохранить анкету' : 'Зарегистрироваться в поиске компании')}</button>
  </form>`;
}

function hikeForm() {
  const days = Array.from({ length: 14 }, (_, i) => dayKey(Date.now() + (i + 1) * 86400e3));
  const p = state.cache.company?.route && state.cache.company.route !== 'all' ? state.cache.company.route : state.plan.routeId;
  return `<form class="card stack-sm" data-form="hike">
    <h2 class="h3">${icon('flag')}${t('Новый поход')}</h2>
    <div class="field"><label for="hk-route">${t('Маршрут')}</label><select id="hk-route" class="input" name="routeId">${allRoutes().map((r) => `<option value="${r.id}" ${r.id === p ? 'selected' : ''}>${tx(r.title)}</option>`).join('')}</select></div>
    <div class="form-2">
      <div class="field"><label for="hk-day">${t('День')}</label><select id="hk-day" class="input" name="day">${days.map((d) => `<option value="${d}">${fmtDay(fromLocal(d, '12:00'))}</option>`).join('')}</select></div>
      <div class="field"><label for="hk-time">${t('Выход')}</label><select id="hk-time" class="input" name="time">${TIMES.map((x) => `<option ${x === '07:30' ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
    </div>
    <div class="form-2">
      <div class="field"><label for="hk-seats">${t('Свободных мест')}</label><select id="hk-seats" class="input" name="seats">${[1, 2, 3, 4, 5, 6, 8].map((n) => `<option ${n === 2 ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
      <div class="field"><label for="hk-only">${t('Кого беру')}</label><select id="hk-only" class="input" name="only">${[['all', 'Всех'], ['f', 'Девушек'], ['m', 'Парней']].map(([v, label]) => `<option value="${v}">${t(label)}</option>`).join('')}</select></div>
    </div>
    <div class="field"><label for="hk-meet">${t('Место встречи')}</label><input id="hk-meet" class="input" name="meet" maxlength="100" required placeholder="${t('Остановка «Медеу», у шлагбаума')}"></div>
    <div class="field"><label for="hk-about">${t('Пару слов о походе')}</label><textarea id="hk-about" class="input" name="about" rows="2" maxlength="300" placeholder="${t('Темп спокойный, остановки для фото, вернёмся до заката')}"></textarea></div>
    <p class="small muted">${t('Первая встреча - только в людном месте. Место встречи видно всем, кто видит объявление.')}</p>
    <button class="btn btn-primary btn-block">${icon('send')}${t('Опубликовать поход')}</button>
  </form>`;
}

function tabMine() {
  const c = co();
  if (!state.profile.verified) return `<p class="callout warn">${icon('id-badge-2')}${t('Сначала подтвердите личность через eGov в профиле: в поиске компании только проверенные люди.')}</p>`;
  if (!c.profile) return `<p class="muted">${t('Зарегистрируйтесь в поиске компании: заполните анкету, и вы сможете подавать заявки и публиковать свои походы.')}</p>${profileForm()}`;
  const p = c.profile;
  return `<section class="card mine">
      <div class="person-h">
        <span class="ava ${state.profile.gender === 'f' ? 'ava-a' : 'ava-b'}" aria-hidden="true">${esc(initials(state.profile.name))}</span>
        <div class="person-t"><b>${t('Ваша анкета')}</b><span class="small muted">${t(p.visible ? 'Видна в поиске' : 'Скрыта из поиска')} · ${t('{kind} после согласия', { kind: contactKind(p.contactKind) })}</span></div>
        <button class="icon-btn" data-act="editAnketa" aria-label="${t('Изменить анкету')}">${icon('settings')}</button>
      </div>
      <p>${tx(p.about)}</p>
    </section>
    ${state.cache.editAnketa ? profileForm() : ''}
    ${hikeFormOpen ? hikeForm() : `<button class="btn btn-primary btn-block btn-lg" data-act="hikeOpen">${icon('plus')}${t('Создать поход и найти компанию')}</button>`}
    <section class="sec">
      <h2 class="h2">${t('Мои походы')}</h2>
      ${c.posts.length ? `<ul class="people">${c.posts.map((h) => {
        const n = Object.values(c.threads).filter((th) => th.postId === h.id).length;
        return `<li class="person"><p class="person-plan">${icon('route')}<b>${tx(h.routeTitle)}</b><span>${fmtDay(fromLocal(h.day, '12:00'))}, ${h.time} · ${t('мест: {n}', { n: h.seats })}</span></p>
          <p class="small muted">${t('Встреча: {place}. Заявок: {n}.', { place: esc(h.meet), n })}</p>
          <button class="btn btn-block" data-act="hikeClose" data-arg="${h.id}">${icon('x')}${t('Снять с поиска')}</button></li>`;
      }).join('')}</ul>` : `<p class="muted">${t('Пока нет. Опубликуйте поход: люди подадут заявки, а вы выберете, с кем идти.')}</p>`}
    </section>`;
}

function tabInbox() {
  const ths = Object.entries(co().threads).sort((a, b) => b[1].t - a[1].t);
  if (!ths.length) return `<p class="empty">${icon('message')}${t('Заявок и чатов пока нет. Подайте заявку в «Поиске» или опубликуйте свой поход.')}</p>`;
  const ST = { sent: ['wait', 'ждёт ответа'], incoming: ['warn', 'новая заявка'], accepted: ['ok', 'принята'], declined: ['off', 'отклонена'] };
  return `<ul class="list">${ths.map(([uid, th]) => {
    const last = th.messages.filter((m) => !m.sys).pop();
    const st = ST[th.status] || ['off', ''];
    return `<li><button class="row" data-go="company" data-id="chat:${esc(uid)}">
      <span class="ava ${th.peer.g === 'f' ? 'ava-a' : 'ava-b'} sm" aria-hidden="true">${esc(initials(t(th.peer.name)))}</span>
      <span class="row-t"><b>${tx(th.peer.name)}${th.peer.demo ? ` <em class="tag tag-demo">${t('демо')}</em>` : ''}</b><span class="small muted">${th.postTitle ? tx(th.postTitle) : ''}${last ? ` · ${esc(last.text.slice(0, 48))}` : ''}</span></span>
      <span class="row-end"><span class="pill pill-${st[0]}">${st[1] ? t(st[1]) : ''}</span>${th.unread ? `<span class="badge">${th.unread}</span>` : ''}</span>
    </button></li>`;
  }).join('')}</ul>`;
}

function mySelf() {
  const f = state.profile.gender === 'f';
  return t({ novice: 'Я новичок, иду в спокойном темпе.', basic: f ? 'Уже ходила в горы.' : 'Уже ходил в горы.', experienced: 'Хожу в горы давно.' }[state.profile.experience] || '');
}

function applySheet() {
  const p = applyFor;
  const r = routeById(p.route || p.routeId);
  const title = t(r?.title || p.routeTitle || 'поход');
  const text = p.kind === 'person'
    ? `${t('Привет! Ищу компанию на выходные.')} ${mySelf()} ${t('Пойдём вместе?')}`
    : `${t('Привет! Хочу пойти с вами на «{route}».', { route: title })} ${mySelf()}`;
  return `<div class="sheet-wrap" data-act="applyClose">
    <form class="sheet" role="dialog" aria-modal="true" aria-labelledby="ap-t" data-stop data-form="apply">
      <div class="sheet-h"><h2 class="h2" id="ap-t">${t('Заявка: {name}', { name: tx(p.name) })}</h2><button type="button" class="icon-btn" data-act="applyClose" aria-label="${t('Закрыть')}">${icon('x')}</button></div>
      <p class="small">${p.kind === 'person' ? t('Предложите пойти вместе.') : `${esc(title)}, ${dateOf(p)}${p.time ? ` ${t('в {time}', { time: p.time })}` : ''}.`}</p>
      <div class="field"><label for="ap-text">${t('Сообщение автору')}</label><textarea id="ap-text" class="input" name="text" rows="4" maxlength="500" required>${esc(text)}</textarea></div>
      <div class="callout">${icon('lock')}<span>${t('Автор увидит ваше имя, возраст, опыт, отметку eGov и это сообщение. Телефон не передаётся. Заявка зашифрована: её прочитает только автор.')}${age() < 18 ? ` ${t('Родители получат уведомление.')}` : ''}</span></div>
      <button class="btn btn-primary btn-block btn-lg">${icon('send')}${t('Отправить заявку')}</button>
    </form>
  </div>`;
}

function chatView(uid) {
  const th = co().threads[uid];
  if (!th) return `<div class="pad"><p class="empty">${icon('message')}${t('Разговор не найден или пользователь заблокирован.')}</p></div>`;
  th.unread = 0;
  save();
  setTimeout(() => app.badge?.(), 0);
  const p = th.peer;
  const contact = th.contact;
  const href = contactHref(contact);
  return `<div class="chat">
    <div class="pad chat-peer">
      <div class="person-h">
        <span class="ava ${p.g === 'f' ? 'ava-a' : 'ava-b'}" aria-hidden="true">${esc(initials(t(p.name)))}</span>
        <div class="person-t"><b>${tx(p.name)}, ${p.age}</b><span class="small muted">${expName(p.level, p.g)}${p.hikes ? ` · ${p.hikes} ${pl(p.hikes, 'поход|похода|походов')}` : ''}${th.postTitle ? ` · ${tx(th.postTitle)}` : ''}</span></div>
        ${p.verified ? `<span class="egov">${icon('shield-check')}eGov</span>` : ''}
      </div>
      ${th.status === 'incoming' ? `<div class="row-btns two"><button class="btn btn-primary" data-act="accept" data-arg="${esc(uid)}">${icon('check')}${t('Принять')}</button><button class="btn" data-act="decline" data-arg="${esc(uid)}">${icon('x')}${t('Отклонить')}</button></div>` : ''}
      ${th.status === 'accepted' ? `<div class="contact-box">
          ${contact ? `<p>${icon('phone')}<span>${contact.kind ? contactKind(contact.kind) : t('Контакт')}: <b>${esc(contact.value)}</b></span>${href ? `<a class="btn" href="${esc(href)}" target="_blank" rel="noopener">${t('Написать')}</a>` : ''}</p>` : `<p class="small muted">${t('{name} ещё не поделился(ась) контактом.', { name: tx(p.name) })}</p>`}
          ${th.shared ? `<p class="small muted">${t('Вы поделились своим контактом.')}</p>` : `<button class="btn btn-block" data-act="shareContact" data-arg="${esc(uid)}">${icon('share')}${t('Поделиться моим контактом')}</button>`}
        </div>` : ''}
    </div>
    <ol class="msgs pad" aria-live="polite">
      ${th.messages.map((m) => m.sys ? `<li class="msg sys"><p>${esc(m.text)}</p></li>` : `<li class="msg ${m.me ? 'me' : 'bot'}"><p>${esc(m.text)}</p><time>${fmtTime(m.t)}</time></li>`).join('')}
    </ol>
    <div class="pad chat-safety">
      <p class="small muted">${icon('shield-check', 'inline')}${t('Первая встреча - в людном месте. Когда пойдёте вместе, отметьте попутчика при старте похода: близкие увидят, с кем вы.')}</p>
      <div class="row-btns two">
        <button class="btn btn-ghost" data-act="reportOpen">${icon('alert-triangle')}${t('Пожаловаться')}</button>
        <button class="btn btn-ghost" data-act="blockPeer" data-arg="${esc(uid)}">${icon('hand-stop')}${t('Заблокировать')}</button>
      </div>
      ${reportOpen ? `<div class="chips wrap" role="group" aria-label="${t('Причина жалобы')}">${REASONS.map((r) => `<button class="chip" data-act="reportPeer" data-arg="${esc(uid)}|${r}">${t(r)}</button>`).join('')}</div>` : ''}
    </div>
    ${th.status === 'accepted' ? `<div class="chat-foot"><form class="ask" data-form="chat" data-uid="${esc(uid)}">
        <label class="sr" for="chat-q">${t('Сообщение')}</label><input id="chat-q" class="input" name="q" autocomplete="off" maxlength="500" placeholder="${t('Сообщение')}">
        <button class="icon-btn solid" aria-label="${t('Отправить')}">${icon('send')}</button></form></div>`
      : `<p class="pad small muted">${th.status === 'sent' ? t('Чат откроется, когда автор примет заявку.') : th.status === 'declined' ? t('Заявка отклонена. Посмотрите другие походы.') : ''}</p>`}
  </div>`;
}

export default {
  tab: 'company',
  title: 'Компания',
  render(id) {
    if (id?.startsWith('chat:')) return chatView(id.slice(5));
    const a = age();
    if (a < 14) {
      return `<div class="pad stack"><header class="page-h"><h1 class="h1">${t('Компания')}</h1></header>
        <p class="callout">${icon('shield-check')}${t('До 14 лет в горы ходят с родителями. Поиск компании откроется в 14 лет, а пока можно записаться в группу через родителя.')}</p></div>`;
    }
    const tab = co().tab || 'find';
    const n = unread();
    return `<div class="pad stack">
      <header class="page-h">
        <h1 class="h1">${t('Компания')}</h1>
        <p class="muted">${t('Попутчики и группы с гидом. Все подтвердили имя, возраст и пол через eGov.')}</p>
      </header>
      <div class="seg tabs-seg" role="tablist">
        ${[['find', t('Поиск')], ['mine', t('Мои')], ['inbox', `${t('Заявки')}${n ? ` · ${n}` : ''}`]].map(([k, l]) => `<button role="tab" class="${tab === k ? 'on' : ''}" aria-selected="${tab === k}" data-act="cTab" data-arg="${k}">${l}</button>`).join('')}
      </div>
      ${tab === 'mine' ? tabMine() : tab === 'inbox' ? tabInbox() : tabFind()}
    </div>
    ${applyFor ? applySheet() : ''}`;
  },
  mount(root, id) {
    if (id?.startsWith('chat:')) root.querySelector('.msgs')?.lastElementChild?.scrollIntoView({ block: 'end' });
  },
  unmount() {
    applyFor = null;
    reportOpen = false;
  },
};

function findPost(id) {
  return [...Object.values(co().board), ...demoPosts()].find((p) => p.id === id);
}

on({
  cTab: (k) => {
    co().tab = k;
    save();
    app.refresh();
  },
  cShow: (id) => {
    state.cache.company = { ...(state.cache.company || { route: 'all' }), show: id };
    save();
    app.refresh();
  },
  applyOpen: (id) => {
    if (!state.profile.verified) return toast(t('Сначала подтвердите личность через eGov'));
    if (!co().profile) {
      co().tab = 'mine';
      toast(t('Сначала заполните анкету попутчика'));
      return app.refresh();
    }
    applyFor = findPost(id);
    app.refresh();
  },
  applyClose: () => {
    applyFor = null;
    app.refresh();
  },
  editAnketa: () => {
    state.cache.editAnketa = !state.cache.editAnketa;
    app.refresh();
  },
  hikeOpen: () => {
    hikeFormOpen = true;
    app.refresh();
  },
  hikeClose: async (id) => {
    await closeHike(id);
    toast(t('Поход снят с поиска'));
    app.refresh();
  },
  accept: (uid) => answer(uid, true),
  decline: (uid) => answer(uid, false),
  shareContact: (uid) => shareContact(uid),
  reportOpen: () => {
    reportOpen = !reportOpen;
    app.refresh();
  },
  reportPeer: (arg) => {
    const [uid, reason] = arg.split('|');
    report(uid, reason);
    reportOpen = false;
    app.go('company');
  },
  blockPeer: (uid) => {
    block(uid);
    app.go('company');
  },
});

export function onCompanyInput(el) {
  state.cache.company = { ...(state.cache.company || { show: 'all' }), [el.dataset.company]: el.value };
  save();
  app.refresh();
}

export async function onCompanyForm(kind, form) {
  const f = new FormData(form);
  if (kind === 'anketa') {
    const about = String(f.get('about')).trim();
    const contact = String(f.get('contact')).trim();
    if (about.length < 10) return toast(t('Расскажите о себе хотя бы в паре слов'));
    if (contact.replace(/[@\s+()-]/g, '').length < 4) return toast(t('Укажите контакт: @username в Telegram или номер'));
    await saveProfile({ about, tags: f.getAll('tags'), only: f.get('only') || 'all', prefs: String(f.get('prefs')).trim(), contactKind: f.get('contactKind'), contact, visible: !!f.get('visible') });
    state.cache.editAnketa = false;
    toast(t('Анкета сохранена. Теперь можно подавать заявки'));
    return app.refresh();
  }
  if (kind === 'hike') {
    const r = routeById(f.get('routeId'));
    await createHike({ routeId: r.id, routeTitle: r.title, day: f.get('day'), time: f.get('time'), seats: Number(f.get('seats')), only: f.get('only'), meet: String(f.get('meet')).trim(), about: String(f.get('about')).trim() || r.text, tags: co().profile?.tags || [] });
    hikeFormOpen = false;
    toast(t('Поход опубликован. Заявки придут во вкладку «Заявки»'));
    return app.refresh();
  }
  if (kind === 'apply') {
    const text = String(f.get('text')).trim();
    if (!text) return;
    const p = applyFor;
    applyFor = null;
    await apply(p, text);
    toast(t('Заявка отправлена'));
    return app.go('company', 'chat:' + peerKey(p));
  }
  if (kind === 'chat') {
    const text = String(f.get('q')).trim();
    if (!text) return;
    await sendChat(form.dataset.uid, text);
    setTimeout(() => document.getElementById('chat-q')?.focus(), 50);
  }
}
