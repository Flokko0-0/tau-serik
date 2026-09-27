// Список «что надеть и взять» по прогнозу на высоте, длине маршрута и медкарте
import { inWindow } from './weather.js';
import { month as monthOf } from './time.js';
import { t, num } from './i18n.js';

const item = (id, text, why, must = false, vars) => ({ id, text: t(text, vars), why: t(why, vars), must });

export function gearList({ route, fc, startMs, medical = {}, now = Date.now() }) {
  const hs = fc ? inWindow(fc, startMs, startMs + route.hours * 3600e3) : [];
  const has = hs.length > 0;
  const feels = has ? Math.min(...hs.map((h) => h.feels)) : route.maxEle >= 3000 ? -2 : 6;
  const heat = has ? Math.max(...hs.map((h) => h.tempStart)) : 22;
  const pop = has ? Math.max(...hs.map((h) => h.pop)) : 40;
  const gust = has ? Math.max(...hs.map((h) => h.gust)) : 30;
  const uv = has ? Math.max(...hs.map((h) => h.uv)) : 6;
  const snow = has && hs.some((h) => h.snow > 0 || (h.freeze != null && h.freeze < route.maxEle));
  const m = monthOf(startMs || now);
  const lvl = ['easy', 'medium', 'hard', 'expert'].indexOf(route.level);
  const hard = lvl >= 1;
  const water = Math.max(1, Math.ceil(route.hours * 0.5 * 2) / 2);
  const v = { c: Math.round(feels), p: pop, g: Math.round(gust), uv: Math.round(uv), heat: Math.round(heat), l: num(water, water % 1 ? 1 : 0), h: num(route.hours, route.hours % 1 ? 1 : 0), up: route.up };

  const wear = [
    item('base', 'Синтетическая или шерстяная футболка', 'Хлопок промокает от пота и охлаждает на ветру.'),
    item('pants', 'Треккинговые штаны, не джинсы', 'Мокрые джинсы тяжелеют и холодят.'),
  ];
  if (feels < 12) wear.push(item('fleece', 'Флиска или тёплая кофта', 'Наверху ощущается как {c} °C.', false, v));
  if (feels < 2) wear.push(item('down', 'Пуховка или утеплённая куртка', 'На привале без движения быстро замерзаете.'));
  if (pop >= 30 || gust >= 25 || route.maxEle >= 2500) {
    wear.push(item('shell', 'Мембранная куртка от ветра и дождя', pop >= 30 ? 'Вероятность осадков до {p}%.' : 'На высоте ветер и погода меняются быстро.', false, v));
  }
  if (feels < 6) wear.push(item('hat', 'Шапка и перчатки', 'Через голову и кисти уходит много тепла.'));
  if (gust >= 25) wear.push(item('buff', 'Бафф на шею и лицо', 'Порывы до {g} км/ч.', false, v));
  wear.push(hard
    ? item('boots', 'Треккинговые ботинки, фиксирующие голеностоп', 'Крутые и каменистые участки: риск подвернуть ногу.')
    : item('shoes', 'Кроссовки с глубоким протектором', 'На гладкой подошве скользко на камнях и траве.'));
  if (snow) wear.push(item('gaiters', 'Гамаши, при льде ледоступы', 'Выше нулевой изотермы возможны снег и лёд.'));

  const sun = [];
  if (uv >= 3 || route.maxEle >= 2000) sun.push(item('spf', 'Крем SPF 50 и гигиеническая помада', 'УФ-индекс до {uv}. На каждые 1000 м высоты ультрафиолет сильнее примерно на 10%.', false, v));
  if (uv >= 6 || route.maxEle >= 2500) sun.push(item('glasses', 'Солнцезащитные очки, категория 3-4', 'Снег и вода отражают свет, можно обжечь глаза.'));
  sun.push(item('cap', 'Кепка или панама', heat >= 28 ? 'Внизу до {heat} °C.' : 'Защита от солнца на открытых участках.', false, v));

  const pack = [
    item('water', 'Вода: {l} л на человека', 'Примерно 0,5 л на час пути, маршрут {h} ч.', true, v),
    item('food', route.hours > 5 ? 'Перекус и обед: орехи, сухофрукты, бутерброды' : 'Перекус: орехи, сухофрукты, шоколад', 'Быстрые углеводы нужны, чтобы не замёрзнуть и не устать.'),
    item('power', 'Заряженный телефон и пауэрбанк', 'Телефон - ваш канал SOS. На холоде батарея садится быстрее.', true),
    item('whistle', 'Свисток', 'Слышно дальше голоса. Сигнал бедствия: 6 свистков в минуту.', true),
    item('kit', 'Аптечка: бинт, пластыри, антисептик, эластичный бинт, обезболивающее', 'Первая помощь до прихода спасателей.', true),
  ];
  if (route.hours > 4 || hard) pack.push(item('lamp', 'Налобный фонарь и запасные батарейки', 'Если задержитесь, спускаться в темноте без света опасно.', hard));
  if (hard) pack.push(item('blanket', 'Спасательное одеяло (фольга)', 'Весит 60 г и сохраняет тепло пострадавшего.'));
  if (route.up >= 600) pack.push(item('poles', 'Треккинговые палки', 'Набор {up} м: палки снимают нагрузку с коленей на спуске.', false, v));
  if (m >= 4 && m <= 7 && route.minEle < 2400) pack.push(item('tick', 'Репеллент от клещей, заправьте штаны в носки', 'Сезон клещевого энцефалита.'));

  // Медкарта может быть заполнена на любом из трёх языков
  const personal = [];
  const allergies = (medical.allergies || []).join(' ').toLowerCase();
  const chronic = (medical.chronic || []).join(' ').toLowerCase();
  if (allergies) {
    const bees = /пчел|пчёл|ос[аы]|укус|ара |аралар|bee|wasp|sting/.test(allergies + ' ');
    personal.push(item('antihist', bees ? 'Ваши антигистаминные и автоинъектор адреналина' : 'Ваши антигистаминные', 'В медкарте: аллергия ({list}).', true, { list: medical.allergies.map((a) => t(a)).join(', ') }));
  }
  if (/астм|демік|asthma/.test(chronic)) personal.push(item('inhaler', 'Ингалятор в доступном кармане', 'Холодный воздух и нагрузка провоцируют приступ.', true));
  if (/диабет|diabet/.test(chronic)) personal.push(item('glucose', 'Глюкометр, инсулин в термочехле, быстрый сахар', 'На подъёме сахар падает быстрее обычного.', true));
  if (/сердц|гиперт|давлен|жүрек|қысым|heart|hypert/.test(chronic)) personal.push(item('cardio', 'Ваши лекарства от давления или сердца', 'Высота повышает нагрузку на сердце.', true));
  if (/эпилеп|қояншық|epilep/.test(chronic)) personal.push(item('epi', 'Противосудорожные и напарник, который знает, что делать', 'Не ходите в горы в одиночку.', true));
  if (medical.meds) personal.push({ id: 'meds', text: t('Лекарства: {meds}', { meds: medical.meds }), why: t('Из вашей медкарты.'), must: true });

  return [
    { id: 'wear', title: t('Одежда и обувь'), items: wear },
    { id: 'sun', title: t('Солнце'), items: sun },
    { id: 'pack', title: t('В рюкзак'), items: pack },
    ...(personal.length ? [{ id: 'personal', title: t('Лично вам'), items: personal }] : []),
  ];
}
