// Оценка риска похода до выхода: погода, свет, опыт, возраст, сезон, подготовка
import { ageRules } from './iin.js';
import { inWindow, dayOf } from './weather.js';
import { fmtTime, month as monthOf, fromLocal, dayKey } from './time.js';

export const LEVELS = ['easy', 'medium', 'hard', 'expert'];
export const LEVEL_NAME = { easy: 'Лёгкий', medium: 'Средний', hard: 'Сложный', expert: 'Экспертный' };
export const EXP = ['novice', 'basic', 'experienced'];
export const EXP_NAME = { novice: 'Новичок', basic: 'Был в горах', experienced: 'Опытный' };
const EXP_F = { novice: 'Новичок', basic: 'Была в горах', experienced: 'Опытная' };
export const expName = (level, g) => (g === 'f' ? EXP_F : EXP_NAME)[level] || EXP_NAME.novice;
export const VERDICT = ['Можно идти', 'Идти осторожно', 'Высокий риск', 'Не выходите'];

// Примерный закат в Алматы по месяцам (UTC+5), если прогноза нет
const SUNSET = ['16:50', '17:25', '17:55', '18:25', '18:55', '19:25', '19:25', '19:00', '18:10', '17:20', '16:40', '16:30'];

export function routeAllowed(route, age) {
  if (age == null) return true;
  return LEVELS.indexOf(route.level) <= LEVELS.indexOf(ageRules(age).maxLevel);
}

export function assessRisk({ route, fc, startMs, age, experience = 'novice', group = 1, contacts = 0, hasMedical = false, now = Date.now() }) {
  const f = [];
  const add = (level, icon, title, text) => f.push({ level, icon, title, text });
  const endMs = startMs + route.hours * 3600e3;
  const m = monthOf(startMs);

  if (!routeAllowed(route, age)) {
    add(3, 'lock', 'Маршрут закрыт по возрасту', `${LEVEL_NAME[route.level]} маршрут доступен с 18 лет. Выберите лёгкий или средний маршрут.`);
    return { level: 3, blocked: true, verdict: 'Недоступно', factors: f, endMs };
  }
  if (age != null && ageRules(age).withAdult) {
    add(group > 1 ? 1 : 2, 'users', 'Только со взрослым', 'До 14 лет в горы идут только вместе с родителем или взрослым из семьи.');
  }

  // Погода на высшей точке
  let sunset = fromLocal(dayKey(startMs), SUNSET[m - 1]);
  if (!fc) {
    add(1, 'cloud', 'Нет прогноза', 'Загрузите прогноз, пока есть интернет: без него оценка неполная.');
  } else {
    if (now - fc.fetchedAt > 6 * 3600e3) add(1, 'history', 'Прогноз устарел', 'Прогнозу больше 6 часов. Обновите его перед выходом.');
    sunset = dayOf(fc, startMs).sunset;
    const hs = inWindow(fc, startMs, endMs);
    if (hs.length) {
      const top = (key) => hs.reduce((a, h) => (h[key] > a[key] ? h : a));
      const low = (key) => hs.reduce((a, h) => (h[key] < a[key] ? h : a));
      const before = f.length;
      const storm = hs.find((h) => h.code >= 95);
      if (storm) add(3, 'cloud-storm', `Гроза около ${fmtTime(storm.t)}`, 'На гребне и вершине гроза смертельно опасна. Перенесите выход или выберите маршрут ниже.');
      const pop = top('pop');
      if (pop.pop >= 70) add(2, 'cloud-rain', `Осадки ${pop.pop}%`, 'Почти наверняка дождь или снег: тропа станет скользкой, видимость упадёт.');
      else if (pop.pop >= 40) add(1, 'cloud-rain', `Возможны осадки, ${pop.pop}%`, 'Возьмите мембранную куртку и чехол на рюкзак.');
      const snow = hs.reduce((s, h) => s + h.snow, 0);
      if (snow >= 0.5) add(2, 'snowflake', `Снег наверху, ${snow.toFixed(1).replace('.', ',')} см`, 'Тропу может замести. Нужны ботинки, гамаши и навигация офлайн.');
      const gust = top('gust');
      if (gust.gust >= 60) add(3, 'wind', `Порывы до ${Math.round(gust.gust)} км/ч`, 'На гребне такой ветер сбивает с ног. Не выходите на открытые участки.');
      else if (gust.gust >= 40) add(2, 'wind', `Порывы до ${Math.round(gust.gust)} км/ч`, 'Сильный ветер на высоте: держитесь дальше от обрывов, возьмите ветровку и бафф.');
      else if (gust.gust >= 25) add(1, 'wind', `Ветер до ${Math.round(gust.gust)} км/ч`, 'Наверху будет прохладнее, чем кажется. Возьмите ветрозащиту.');
      const cold = low('feels');
      if (cold.feels <= -15) add(3, 'temperature', `Ощущается как ${Math.round(cold.feels)} °C`, 'Высокий риск обморожения и переохлаждения. Нужна зимняя экипировка.');
      else if (cold.feels <= -5) add(2, 'temperature', `Ощущается как ${Math.round(cold.feels)} °C`, `Наверху (${fc.eleTop} м) мороз. Пуховка, шапка, перчатки обязательны.`);
      else if (cold.feels <= 3) add(1, 'temperature', `Наверху около ${Math.round(cold.feels)} °C`, 'Холоднее, чем в городе. Возьмите тёплый слой.');
      const heat = hs.reduce((a, h) => Math.max(a, h.tempStart), -99);
      if (heat >= 32) add(1, 'sun', `Жара внизу, ${Math.round(heat)} °C`, 'Выйдите рано утром и возьмите больше воды.');
      const vis = hs.filter((h) => h.vis != null).reduce((a, h) => Math.min(a, h.vis), 1e9);
      if (vis < 300) add(2, 'cloud-fog', `Видимость до ${Math.round(vis)} м`, 'Облака на тропе: легко потерять направление. Идите по треку офлайн.');
      else if (vis < 1000) add(1, 'cloud-fog', `Видимость до ${Math.round(vis / 100) * 100} м`, 'Местами туман. Держите группу вместе.');
      const uv = hs.reduce((a, h) => Math.max(a, h.uv), 0);
      if (uv >= 8) add(1, 'sun', `Очень сильное солнце, УФ ${Math.round(uv)}`, 'Очки категории 3-4, крем SPF 50 и головной убор.');
      const freeze = hs.filter((h) => h.freeze != null).reduce((a, h) => Math.min(a, h.freeze), 1e9);
      if (freeze < route.maxEle && !snow && cold.feels > -5) add(1, 'snowflake', `Ноль градусов на ${Math.round(freeze / 50) * 50} м`, 'Выше этой высоты возможны лёд и наст на тропе.');
      if (f.length === before) add(0, 'sun', 'Погода без опасных явлений', `Наверху до ${Math.round(top('temp').temp)} °C, ветер до ${Math.round(gust.gust)} км/ч, осадки до ${pop.pop}%.`);
    }
  }

  // Световой день
  if (endMs > sunset) add(2, 'sunset', `Вернётесь после заката (${fmtTime(sunset)})`, 'Спуск в темноте - частая причина травм. Выйдите раньше или выберите маршрут короче.');
  else if (endMs > sunset - 3600e3) add(1, 'sunset', `Впритык к закату (${fmtTime(sunset)})`, 'Запаса почти нет. Возьмите налобный фонарь.');
  else add(0, 'sunrise', `Успеваете до заката (${fmtTime(sunset)})`, `Расчётное возвращение в ${fmtTime(endMs)}.`);

  // Опыт и высота
  const gap = LEVELS.indexOf(route.level) - EXP.indexOf(experience);
  if (gap >= 3) add(3, 'mountain', 'Маршрут не по опыту', `${LEVEL_NAME[route.level]} маршрут, а ваш опыт: ${EXP_NAME[experience].toLowerCase()}. Начните с маршрута проще.`);
  else if (gap === 2) add(2, 'mountain', 'Маршрут сложнее вашего опыта', 'Идите только с опытным человеком или гидом.');
  else if (gap === 1) add(1, 'mountain', 'Маршрут на грани опыта', 'Закладывайте больше времени и разворачивайтесь, если устали.');
  if (route.maxEle >= 3500 && experience === 'novice') add(2, 'lungs', `Высота ${route.maxEle} м`, 'Новичкам высоко: сильный риск горной болезни.');
  else if (route.maxEle >= 3000) add(1, 'lungs', `Высота ${route.maxEle} м`, 'Возможна горная болезнь. Поднимайтесь медленно и пейте воду.');

  // Сезонные опасности Заилийского Алатау
  if ((m >= 11 || m <= 4) && route.maxEle >= 2500) add(2, 'snowflake', 'Лавиноопасный сезон', 'С ноября по апрель на склонах выше 2500 м сходят лавины. Уточните прогноз лавинной опасности.');
  if (m >= 4 && m <= 7 && route.minEle < 2200) add(1, 'bug', 'Сезон клещей', 'Алматинская область - зона клещевого энцефалита. Репеллент и закрытая одежда.');
  if (m >= 5 && m <= 8 && fc && inWindow(fc, startMs, endMs).some((h) => h.pop >= 50)) add(1, 'droplet', 'Сезон селей', 'После ливней по руслам может пройти сель. Не стойте в русле, уходите вверх по склону.');

  // Группа и подготовка
  if (group <= 1) add(age != null && age < 18 ? 2 : 1, 'user', 'Вы идёте один', 'Одному сложнее получить помощь. Найдите компанию или предупредите близких.');
  if (!contacts) add(2, 'phone', 'Нет контактов близких', 'Добавьте хотя бы один номер: ему уйдёт SOS и маршрут.');
  if (!hasMedical) add(1, 'heartbeat', 'Медкарта не заполнена', 'Группа крови и аллергии помогут спасателям и врачам.');

  f.sort((a, b) => b.level - a.level);
  let level = Math.max(0, ...f.map((x) => x.level));
  if (level < 2 && f.filter((x) => x.level >= 1).length >= 4) level = 2;
  return { level, blocked: false, verdict: VERDICT[level], factors: f, endMs };
}
