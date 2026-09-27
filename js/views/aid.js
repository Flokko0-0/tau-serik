import { state, save, log } from '../store.js';
import { app, on } from '../core.js';
import { esc, icon } from '../ui.js';
import { AID, AID_GROUPS } from '../data/firstaid.js';
import * as alarm from '../alarm.js';
import { fmtTime, fmtLeft } from '../time.js';
import { t } from '../i18n.js';

const tx = (s) => esc(t(s));

let cpr = null;

function list() {
  return `<div class="pad stack">
    <header class="page-h">
      <h1 class="h1">${t('Первая помощь')}</h1>
      <p class="muted">${icon('wifi-off', 'inline')}${t('Работает без интернета. Это памятка, а не замена курсам первой помощи.')}</p>
    </header>
    <div class="aid-urgent">
      ${AID.filter((a) => a.group === 'urgent').map((a) => `<button class="aid-big" data-go="aid" data-id="${a.id}">${icon(a.icon)}<b>${tx(a.title)}</b><span>${tx(a.summary)}</span></button>`).join('')}
    </div>
    ${AID_GROUPS.filter((g) => g.id !== 'urgent').map((g) => `<section class="sec">
      <h2 class="h2">${tx(g.title)}</h2>
      <ul class="aid-list">
        ${AID.filter((a) => a.group === g.id).map((a) => `<li><button class="row" data-go="aid" data-id="${a.id}">
          <span class="row-ic">${icon(a.icon)}</span><span class="row-t"><b>${tx(a.title)}</b></span>${icon('chevron-right', 'row-go')}
        </button></li>`).join('')}
      </ul>
    </section>`).join('')}
    <a class="btn btn-block" href="tel:112">${icon('phone-call')}${t('Позвонить 112')}</a>
  </div>`;
}

function tool(a) {
  if (a.tool === 'cpr') {
    return `<section class="card tool">
      <h2 class="h3">${t('Метроном для надавливаний')}</h2>
      <p class="small muted">${t('110 ударов в минуту. Давите на каждый щелчок.')}</p>
      <div class="cpr ${cpr ? 'on' : ''}"><span class="cpr-dot" aria-hidden="true"></span><b data-cpr>${cpr ? cpr.n : 0}</b><span class="small muted">${t('надавливаний')}</span></div>
      <button class="btn ${cpr ? '' : 'btn-primary'} btn-block btn-lg" data-act="cpr">${icon(cpr ? 'player-pause' : 'player-play')}${t(cpr ? 'Остановить' : 'Запустить метроном')}</button>
    </section>`;
  }
  if (a.tool === 'tourniquet') {
    const at = state.aid.tourniquet;
    return `<section class="card tool">
      <h2 class="h3">${t('Время наложения жгута')}</h2>
      ${at ? `<p class="tq">${t('Жгут наложен в <b>{time}</b>, прошло', { time: fmtTime(at) })} <b data-since="${at}">${fmtLeft(Date.now() - at)}</b></p>
        <p class="small muted">${t('Сообщите это время врачам. Время также записано в журнал.')}</p>
        <button class="btn btn-block" data-act="tqReset">${t('Сбросить')}</button>`
        : `<button class="btn btn-primary btn-block btn-lg" data-act="tq">${icon('clock')}${t('Жгут наложен')}</button>`}
    </section>`;
  }
  return '';
}

function guide(a) {
  return `<div class="pad stack guide">
    <header class="page-h">
      <span class="guide-ic">${icon(a.icon)}</span>
      <h1 class="h1">${tx(a.title)}</h1>
      <p>${tx(a.summary)}</p>
    </header>
    <p class="callout crit">${icon('phone-call')}<span>${tx(a.call)} <a href="tel:112" class="link">${t('Позвонить 112')}</a></span></p>
    ${a.tool ? tool(a) : ''}
    <ol class="steps">
      ${a.steps.map(([s, d]) => `<li><b>${tx(s)}</b><span>${tx(d)}</span></li>`).join('')}
    </ol>
    <section class="card dont">
      <h2 class="h3">${icon('hand-stop')}${t('Нельзя')}</h2>
      <ul>${a.dont.map((d) => `<li>${tx(d)}</li>`).join('')}</ul>
    </section>
    <button class="btn btn-block" data-act="medcardFromAid">${icon('heartbeat')}${t('Показать мою медкарту')}</button>
  </div>`;
}

export default {
  tab: 'aid',
  title: 'Первая помощь',
  render(id) {
    const a = AID.find((x) => x.id === id);
    return a ? guide(a) : list();
  },
  unmount() {
    if (cpr) {
      clearInterval(cpr.id);
      cpr = null;
      if (alarm.playing() === 'metronome') alarm.stop();
    }
  },
};

on({
  cpr: () => {
    if (cpr) {
      clearInterval(cpr.id);
      cpr = null;
      alarm.stop();
    } else {
      alarm.metronome(110);
      cpr = { n: 0, id: setInterval(() => {
        cpr.n++;
        const el = document.querySelector('[data-cpr]');
        if (el) el.textContent = cpr.n;
      }, 60000 / 110) };
    }
    app.refresh();
  },
  tq: () => {
    state.aid.tourniquet = Date.now();
    log(t('Жгут наложен в {time}', { time: fmtTime(state.aid.tourniquet) }), 'warn');
    save();
    app.refresh();
  },
  tqReset: () => {
    delete state.aid.tourniquet;
    save();
    app.refresh();
  },
  medcardFromAid: () => app.go('profile', 'medical'),
});
