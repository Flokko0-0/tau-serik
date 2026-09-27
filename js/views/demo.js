import { state, save } from '../store.js';
import { app, on, activeRoute } from '../core.js';
import { icon, toast } from '../ui.js';
import { unlockAudio } from '../alarm.js';
import { triggerCheck, sendSOS, demoWalk } from '../safety.js';
import { guardianLink } from './profile.js';
import { t, num } from '../i18n.js';

export function demoPanel() {
  const off = state.demo.offline;
  return `<div class="demo">
    <p class="small muted">${t('Проверка без гор: кнопки имитируют датчики, GPS и время. На телефоне работают и настоящие датчики.')}</p>
    <div class="demo-grid">
      <button class="demo-b" data-act="dFall">${icon('activity')}${t('Падение')}</button>
      <button class="demo-b" data-act="dScream">${icon('microphone')}${t('Крик')}</button>
      <button class="demo-b" data-act="dWord">${icon('message')}${t('Кодовое слово')}</button>
      <button class="demo-b" data-act="dWalk">${icon('walk')}${t('Шаг по тропе')}</button>
      <button class="demo-b ${off ? 'on' : ''}" data-act="dOffline" aria-pressed="${off}">${icon(off ? 'wifi-off' : 'wifi')}${t(off ? 'Сеть выключена' : 'Выключить сеть')}</button>
      <button class="demo-b" data-act="dLate">${icon('clock-exclamation')}${t('Просрочить время')}</button>
    </div>
    ${state.profile?.familyCode ? `<a class="btn btn-block" href="${guardianLink()}" target="_blank" rel="noopener">${icon('shield-heart')}${t('Открыть экран близкого')}</a>` : ''}
  </div>`;
}

on({
  dFall: () => {
    unlockAudio();
    triggerCheck('Похоже на падение', { detail: t('{g} g, свободное падение {ms} мс', { g: num(3.1), ms: 240 }) });
  },
  dScream: () => {
    unlockAudio();
    triggerCheck('Громкий крик', { detail: 'дольше 0,7 с' });
  },
  dWord: () => {
    unlockAudio();
    sendSOS(t('Кодовое слово «{w}»', { w: t('помогите') }), 'voice');
  },
  dWalk: () => {
    if (!activeRoute()) {
      toast(t('Сначала откройте маршрут'));
      return app.go('routes');
    }
    demoWalk();
  },
  dOffline: () => {
    state.demo.offline = !state.demo.offline;
    save();
    toast(t(state.demo.offline ? 'Сеть выключена: сообщения копятся в очереди' : 'Сеть включена: отправляем очередь'));
    if (!state.demo.offline) app.relay?.flush();
    app.refresh();
  },
  dLate: () => {
    if (!state.trip) return toast(t('Сначала начните поход на экране маршрута'));
    state.trip.returnBy = Date.now() - 1000;
    state.trip.status = 'active';
    save();
  },
});
