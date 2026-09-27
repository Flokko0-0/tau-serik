// Помощник на устройстве: понимает вопрос по ключевым основам слов и отвечает из проверенной базы,
// подставляя прогноз, маршрут и координаты. Работает без интернета.
import { gearList } from './gear.js';
import { inWindow, wmo } from './weather.js';
import { fmtTime, fmtHours } from './time.js';
import { nearest, fmtDist, compass } from './geo.js';
import { LEVEL_NAME, routeAllowed } from './risk.js';

const KB = [
  { id: 'gear', keys: ['надет', 'одеж', 'одеть', 'взять', 'собрат', 'рюкза', 'вещи', 'экипир', 'обувь', 'кросс', 'ботин', 'куртк', 'что брать'] },
  { id: 'weather', keys: ['погод', 'дожд', 'ветер', 'ветр', 'снег', 'прогн', 'холод', 'темпер', 'жарк', 'гроза будет'] },
  { id: 'time', keys: ['сколь идти', 'долго', 'часов', 'успею', 'закат', 'стемне', 'темно', 'время'] },
  { id: 'nearby', keys: ['ближа', 'рядом', 'родни', 'туале', 'хижин', 'укрыт', 'приют', 'спасат', 'пост', 'где вода', 'переночев'] },
  { id: 'route', keys: ['куда пойти', 'посовет', 'маршру', 'новичк', 'первый раз', 'легки', 'лёгки', 'выбрат'] },
  { id: 'water', keys: ['воды', 'пить', 'вода', 'фляг', 'реки'],
    text: 'Берите 0,5 л воды на каждый час пути, в жару больше. Воду из родников на тропе пьют многие, но из рек и ручьёв ниже стоянок и пастбищ лучше кипятить или фильтровать.' },
  { id: 'altitude', keys: ['горна', 'высот', 'голов', 'тошн', 'одышк', 'задых'], aid: 'altitude',
    text: 'Головная боль, тошнота и слабость выше 2500 м - признаки горной болезни. Остановите подъём, пейте воду, отдохните. Не лучше за 1-2 часа - спускайтесь на 300-500 м.' },
  { id: 'lost', keys: ['заблуд', 'потеря', 'не знаю где', 'сбил', 'тропу потер'], aid: 'lost',
    text: 'Остановитесь и успокойтесь. Откройте карту: ваша точка и трек работают без интернета. Если помощь вызвана, оставайтесь на месте и будьте заметны.' },
  { id: 'tick', keys: ['клещ'], aid: 'tick', text: 'Удалите клеща пинцетом ближе к коже, медленно выкручивая. Сохраните его для анализа и обратитесь к врачу как можно скорее.' },
  { id: 'snake', keys: ['змея', 'змей', 'гадюк', 'щитом'], aid: 'snake', text: 'Уложите пострадавшего, обездвижьте конечность, звоните 112. Не надрезайте, не отсасывайте яд, не накладывайте жгут.' },
  { id: 'animals', keys: ['медве', 'собак', 'волк', 'живот'], aid: 'animals', text: 'Не бегите. Стойте, говорите спокойно и громко, медленно отходите лицом к животному.' },
  { id: 'storm', keys: ['гроз', 'молни', 'гром'], aid: 'storm', text: 'Уходите с гребня и вершины, не стойте под одиноким деревом, группа держится на расстоянии 15-20 м.' },
  { id: 'sel', keys: ['сель', 'камнеп', 'лавин', 'обвал'], aid: 'sel', text: 'При гуле в русле уходите вверх по склону в сторону от реки. Не бегите вниз по ущелью.' },
  { id: 'cold', keys: ['замерз', 'замёрз', 'переохл', 'дрож', 'обмор'], aid: 'hypothermia', text: 'Укройтесь от ветра, снимите мокрое, утеплите туловище и шею, пейте тёплое сладкое. Алкоголь нельзя.' },
  { id: 'injury', keys: ['подверн', 'перелом', 'растяж', 'вывих', 'нога', 'колен', 'упал'], aid: 'fracture', text: 'Не двигайте повреждённую конечность, наложите шину из палок, приложите холод. Не можете идти - вызывайте помощь.' },
  { id: 'bleed', keys: ['кров', 'порез', 'рана', 'поранил'], aid: 'bleeding', text: 'Сильно прижмите рану тканью и не отпускайте. Если кровь не останавливается - давящая повязка, затем жгут выше раны.' },
  { id: 'cpr', keys: ['не дыш', 'без сознан', 'сердц', 'реаним', 'потерял сознание'], aid: 'cpr', text: 'Звоните 112. Если человек не дышит - давите на центр груди на 5-6 см, 100-120 раз в минуту, не останавливаясь.' },
  { id: 'battery', keys: ['заряд', 'батар', 'сел телеф', 'разряд', 'пауэрб'],
    text: 'На холоде батарея садится быстрее: держите телефон во внутреннем кармане. Убавьте яркость и закройте лишние приложения. При заряде ниже 15% приложение само отправит близким вашу последнюю точку.' },
  { id: 'signal', keys: ['нет связ', 'нет сет', 'интерн', 'сигнал', 'связь'],
    text: 'SOS без интернета встаёт в очередь и уйдёт, как только появится сеть. Кнопка SMS отправит координаты обычным сообщением. Экстренный вызов 112 может пройти через сеть другого оператора. На гребне и открытых местах связь обычно лучше, чем в ущелье.' },
  { id: 'solo', keys: ['один', 'одна', 'одиноч', 'сам пойд', 'сама пойд'],
    text: 'Одному в горах опаснее: если подвернёте ногу, помочь некому. Найдите компанию во вкладке «Компания». Если всё же идёте один, включите «В горах» и поставьте контрольное время: близкие узнают, если вы не вернётесь.' },
  { id: 'age', keys: ['родит', 'подрост', 'ребен', 'ребён', 'школь', 'возраст', 'лет '],
    text: 'До 18 лет доступны лёгкие и средние маршруты, родитель получает маршрут, контрольное время и SOS. До 14 лет - только вместе со взрослым. Подростки ищут компанию только среди сверстников и в группах с инструктором.' },
  { id: 'night', keys: ['ночь', 'ночёв', 'ночев', 'палат', 'темнот'],
    text: 'Ставьте палатку выше русла реки и подальше от склонов с камнями. Еду храните вне палатки. Ночью в горах холодно даже летом: спальник с комфортом около 0 °C.' },
  { id: 'food', keys: ['еда', 'еду', 'перекус', 'кушат', 'поест', 'есть в'],
    text: 'Перекусывайте каждые 1-1,5 часа: орехи, сухофрукты, шоколад, бутерброды. На холоде и высоте энергии тратится больше, а аппетит бывает хуже.' },
  { id: 'register', keys: ['регистр', 'мчс', 'дчс', 'предупред', 'сообщ'],
    text: 'Перед сложными и многодневными маршрутами зарегистрируйте группу в службе спасения ДЧС. В приложении маршрут и контрольное время уходят вашим близким, когда вы нажимаете «Начать поход».' },
  { id: 'sun', keys: ['солн', 'сгорел', 'очки', 'крем', 'ультраф'],
    text: 'На высоте ультрафиолет сильнее: крем SPF 50 каждые 2 часа, очки категории 3-4, головной убор. Снег и вода отражают свет.' },
  { id: 'sos', keys: ['sos', 'сос', 'как работ', 'падени', 'крик', 'кодов', 'сирен', 'датчик'],
    text: 'В режиме «В горах» телефон слушает датчики: свободное падение и удар, долгий громкий крик, кодовое слово. Появляется экран «Вы в порядке?» с обратным отсчётом. Не ответили - SOS с координатами и медкартой уходит близким, включается сирена.' },
];

export const SUGGESTIONS = ['Что надеть?', 'Какая погода наверху?', 'Где ближайшая вода?', 'Успею до заката?', 'Куда пойти новичку?', 'Что делать, если заблудился?'];

const norm = (s) => ' ' + s.toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9 ]/g, ' ').replace(/\s+/g, ' ') + ' ';

export function classify(question) {
  const q = norm(question);
  const words = q.trim().split(' ');
  let best = null;
  for (const e of KB) {
    let score = 0;
    for (const k of e.keys) {
      const nk = norm(k).trim();
      if (nk.includes(' ')) { if (q.includes(' ' + nk)) score += 2; }
      else if (words.some((w) => w.startsWith(nk))) score += 1;
    }
    if (score && (!best || score > best.score)) best = { entry: e, score };
  }
  return best?.entry ?? null;
}

// ctx: { route, fc, startMs, profile, age, pos, places, routes, now }
export function answer(question, ctx) {
  const e = classify(question);
  if (!e) return { text: 'Не нашёл точного ответа. Спросите иначе или выберите тему ниже. Срочная ситуация - нажмите SOS или откройте «Помощь».', suggest: true };
  switch (e.id) {
    case 'gear': return gearAnswer(ctx);
    case 'weather': return weatherAnswer(ctx);
    case 'time': return timeAnswer(ctx);
    case 'nearby': return nearbyAnswer(question, ctx);
    case 'route': return routeAnswer(ctx);
    default: return { text: e.text, aid: e.aid };
  }
}

function needRoute(ctx) {
  return ctx.route ? null : { text: 'Сначала выберите маршрут во вкладке «Маршруты»: я посчитаю по его высоте и прогнозу.', go: 'routes' };
}

function gearAnswer(ctx) {
  const miss = needRoute(ctx);
  if (miss) return miss;
  const groups = gearList({ route: ctx.route, fc: ctx.fc, startMs: ctx.startMs, medical: ctx.profile?.medical, now: ctx.now });
  const items = groups.flatMap((g) => g.items.filter((i) => g.title !== 'Солнце' || i.id === 'glasses').slice(0, 4).map((i) => i.text));
  const basis = ctx.fc ? `по прогнозу на ${ctx.fc.eleTop} м` : 'без прогноза, по высоте маршрута';
  return { text: `${ctx.route.title}: собрал список ${basis}. Главное:`, items: items.slice(0, 9), go: 'route', goLabel: 'Весь список' };
}

function weatherAnswer(ctx) {
  const miss = needRoute(ctx);
  if (miss) return miss;
  if (!ctx.fc) return { text: 'Прогноз ещё не загружен. Откройте маршрут, пока есть интернет: прогноз сохранится для офлайна.', go: 'route' };
  const hs = inWindow(ctx.fc, ctx.startMs, ctx.startMs + ctx.route.hours * 3600e3);
  if (!hs.length) return { text: 'Для выбранного времени прогноза пока нет: он доступен на 4 дня вперёд.' };
  const tMin = Math.min(...hs.map((h) => h.feels));
  const tMax = Math.max(...hs.map((h) => h.temp));
  const gust = Math.max(...hs.map((h) => h.gust));
  const pop = Math.max(...hs.map((h) => h.pop));
  const storm = hs.find((h) => h.code >= 95);
  const main = wmo(hs[Math.floor(hs.length / 2)].code).text.toLowerCase();
  const items = [
    `Наверху (${ctx.fc.eleTop} м): ${main}, до ${Math.round(tMax)} °C, ощущается от ${Math.round(tMin)} °C`,
    `Ветер в порывах до ${Math.round(gust)} км/ч`,
    `Осадки: до ${pop}%`,
  ];
  if (storm) items.push(`Гроза около ${fmtTime(storm.t)}: перенесите выход`);
  return { text: `Погода на маршруте «${ctx.route.title}» с ${fmtTime(ctx.startMs)}:`, items };
}

function timeAnswer(ctx) {
  const miss = needRoute(ctx);
  if (miss) return miss;
  const end = ctx.startMs + ctx.route.hours * 3600e3;
  const day = ctx.fc?.days.filter((d) => d.t <= ctx.startMs).pop();
  const sunset = day ? fmtTime(day.sunset) : null;
  let text = `${ctx.route.title}: около ${fmtHours(ctx.route.hours)} в темпе обычной группы (${ctx.route.walkKm} км, набор ${ctx.route.up} м). Выход в ${fmtTime(ctx.startMs)}, возвращение около ${fmtTime(end)}.`;
  if (sunset) text += day.sunset < end ? ` Закат в ${sunset}: вы не успеваете, выйдите раньше.` : ` Закат в ${sunset}, запас есть.`;
  return { text };
}

const KIND_WORDS = [['water', /вод|родн|пить/], ['toilet', /туал/], ['hut', /хижин|ночев|ночёв|приют/], ['shelter', /укрыт|навес|дожд/], ['rescue', /спас|пост|мчс|дчс/]];
const KIND_NAME = { water: 'вода', toilet: 'туалет', hut: 'хижина', shelter: 'укрытие', rescue: 'пост спасателей' };

function nearbyAnswer(question, ctx) {
  if (!ctx.pos) return { text: 'Не знаю, где вы. Включите режим «В горах» или откройте карту, чтобы определить место.', go: 'map' };
  const q = question.toLowerCase();
  const found = KIND_WORDS.filter(([, re]) => re.test(q)).map(([k]) => k);
  const kinds = found.length ? found : ['water', 'hut', 'shelter', 'rescue'];
  const items = kinds.map((k) => {
    const [p] = nearest([ctx.pos.lat, ctx.pos.lon], ctx.places, [k], 1);
    return p ? `${KIND_NAME[k][0].toUpperCase() + KIND_NAME[k].slice(1)}: ${p.name}, ${fmtDist(p.d)} на ${compass(p.brg)}` : null;
  }).filter(Boolean);
  return { text: 'Ближайшее от вас (данные OpenStreetMap, работают офлайн):', items, go: 'map', goLabel: 'Показать на карте' };
}

function routeAnswer(ctx) {
  const exp = ctx.profile?.experience || 'novice';
  const fit = ctx.routes.filter((r) => routeAllowed(r, ctx.age) && (exp === 'novice' ? r.level === 'easy' || r.level === 'medium' : exp === 'basic' ? r.level !== 'expert' : true));
  const items = fit.slice(0, 4).map((r) => `${r.title}: ${LEVEL_NAME[r.level].toLowerCase()}, ${r.walkKm} км, до ${r.maxEle} м, ${fmtHours(r.hours)}`);
  return { text: exp === 'novice' ? 'Для начала подойдут короткие маршруты с небольшим набором высоты:' : 'Подходят по вашему опыту и возрасту:', items, go: 'routes', goLabel: 'Открыть маршруты' };
}
