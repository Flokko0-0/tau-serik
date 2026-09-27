// Список «что надеть и взять» по прогнозу на высоте, длине маршрута и медкарте
import { inWindow } from './weather.js';
import { month as monthOf } from './time.js';

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

  const wear = [
    { id: 'base', text: 'Синтетическая или шерстяная футболка', why: 'Хлопок промокает от пота и охлаждает на ветру.' },
    { id: 'pants', text: 'Треккинговые штаны, не джинсы', why: 'Мокрые джинсы тяжелеют и холодят.' },
  ];
  if (feels < 12) wear.push({ id: 'fleece', text: 'Флиска или тёплая кофта', why: `Наверху ощущается как ${Math.round(feels)} °C.` });
  if (feels < 2) wear.push({ id: 'down', text: 'Пуховка или утеплённая куртка', why: 'На привале без движения быстро замерзаете.' });
  if (pop >= 30 || gust >= 25 || route.maxEle >= 2500) wear.push({ id: 'shell', text: 'Мембранная куртка от ветра и дождя', why: pop >= 30 ? `Вероятность осадков до ${pop}%.` : 'На высоте ветер и погода меняются быстро.' });
  if (feels < 6) wear.push({ id: 'hat', text: 'Шапка и перчатки', why: 'Через голову и кисти уходит много тепла.' });
  if (gust >= 25) wear.push({ id: 'buff', text: 'Бафф на шею и лицо', why: `Порывы до ${Math.round(gust)} км/ч.` });
  wear.push(hard
    ? { id: 'boots', text: 'Треккинговые ботинки, фиксирующие голеностоп', why: 'Крутые и каменистые участки: риск подвернуть ногу.' }
    : { id: 'shoes', text: 'Кроссовки с глубоким протектором', why: 'На гладкой подошве скользко на камнях и траве.' });
  if (snow) wear.push({ id: 'gaiters', text: 'Гамаши, при льде ледоступы', why: 'Выше нулевой изотермы возможны снег и лёд.' });

  const sun = [];
  if (uv >= 3 || route.maxEle >= 2000) sun.push({ id: 'spf', text: 'Крем SPF 50 и гигиеническая помада', why: `УФ-индекс до ${Math.round(uv)}. На каждые 1000 м высоты ультрафиолет сильнее примерно на 10%.` });
  if (uv >= 6 || route.maxEle >= 2500) sun.push({ id: 'glasses', text: 'Солнцезащитные очки, категория 3-4', why: 'Снег и вода отражают свет, можно обжечь глаза.' });
  sun.push({ id: 'cap', text: 'Кепка или панама', why: heat >= 28 ? `Внизу до ${Math.round(heat)} °C.` : 'Защита от солнца на открытых участках.' });

  const pack = [
    { id: 'water', text: `Вода: ${String(water).replace('.', ',')} л на человека`, why: `Примерно 0,5 л на час пути, маршрут ${String(route.hours).replace('.', ',')} ч.`, must: true },
    { id: 'food', text: route.hours > 5 ? 'Перекус и обед: орехи, сухофрукты, бутерброды' : 'Перекус: орехи, сухофрукты, шоколад', why: 'Быстрые углеводы нужны, чтобы не замёрзнуть и не устать.' },
    { id: 'power', text: 'Заряженный телефон и пауэрбанк', why: 'Телефон - ваш канал SOS. На холоде батарея садится быстрее.', must: true },
    { id: 'whistle', text: 'Свисток', why: 'Слышно дальше голоса. Сигнал бедствия: 6 свистков в минуту.', must: true },
    { id: 'kit', text: 'Аптечка: бинт, пластыри, антисептик, эластичный бинт, обезболивающее', why: 'Первая помощь до прихода спасателей.', must: true },
  ];
  if (route.hours > 4 || hard) pack.push({ id: 'lamp', text: 'Налобный фонарь и запасные батарейки', why: 'Если задержитесь, спускаться в темноте без света опасно.', must: hard });
  if (hard) pack.push({ id: 'blanket', text: 'Спасательное одеяло (фольга)', why: 'Весит 60 г и сохраняет тепло пострадавшего.' });
  if (route.up >= 600) pack.push({ id: 'poles', text: 'Треккинговые палки', why: `Набор ${route.up} м: палки снимают нагрузку с коленей на спуске.` });
  if (m >= 4 && m <= 7 && route.minEle < 2400) pack.push({ id: 'tick', text: 'Репеллент от клещей, заправьте штаны в носки', why: 'Сезон клещевого энцефалита.' });

  const personal = [];
  const allergies = (medical.allergies || []).join(' ').toLowerCase();
  const chronic = (medical.chronic || []).join(' ').toLowerCase();
  if (allergies) personal.push({ id: 'antihist', text: 'Ваши антигистаминные' + (/пчел|пчёл|ос[аы]|укус/.test(allergies) ? ' и автоинъектор адреналина' : ''), why: `В медкарте: аллергия (${medical.allergies.join(', ')}).`, must: true });
  if (/астм/.test(chronic)) personal.push({ id: 'inhaler', text: 'Ингалятор в доступном кармане', why: 'Холодный воздух и нагрузка провоцируют приступ.', must: true });
  if (/диабет/.test(chronic)) personal.push({ id: 'glucose', text: 'Глюкометр, инсулин в термочехле, быстрый сахар', why: 'На подъёме сахар падает быстрее обычного.', must: true });
  if (/сердц|гиперт|давлен/.test(chronic)) personal.push({ id: 'cardio', text: 'Ваши лекарства от давления или сердца', why: 'Высота повышает нагрузку на сердце.', must: true });
  if (/эпилеп/.test(chronic)) personal.push({ id: 'epi', text: 'Противосудорожные и напарник, который знает, что делать', why: 'Не ходите в горы в одиночку.', must: true });
  if (medical.meds) personal.push({ id: 'meds', text: `Лекарства: ${medical.meds}`, why: 'Из вашей медкарты.', must: true });

  return [
    { title: 'Одежда и обувь', items: wear },
    { title: 'Солнце', items: sun },
    { title: 'В рюкзак', items: pack },
    ...(personal.length ? [{ title: 'Лично вам', items: personal }] : []),
  ];
}
