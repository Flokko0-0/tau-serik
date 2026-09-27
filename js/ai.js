// ИИ-помощник: отвечает по-человечески, но опирается на данные приложения (прогноз, маршрут, риск, вещи).
// По умолчанию бесплатный Gemini; Claude - через сервер-посредник или ключ, введённый на этом телефоне.
import { state, cache } from './store.js';
import { AI_PROXY, GEMINI_KEY } from './config.js';
import { allRoutes, routeById, activeRoute, age, online } from './core.js';
import { loadForecast, inWindow, dayOf, wmo } from './weather.js';
import { assessRisk, routeAllowed, LEVEL_NAME, expName } from './risk.js';
import { gearList } from './gear.js';
import { fmtTime, fmtDay, fmtHours, dayKey, fromLocal, ago } from './time.js';
import { nearest, fmtDist, compass } from './geo.js';
import { PLACES } from './data/places.js';

const SDK = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.128.0/+esm';
export const MODEL = 'claude-opus-5';
const REFUSAL = '\u001erefusal';

// Держите в синхронизации с tools/ai-proxy/supabase/functions/tau-ai/index.ts
export const PERSONA = `Ты - Тау Серік, помощник в приложении безопасности для гор Заилийского Алатау (Алматы, Казахстан).
Говори как заботливый друг с опытом походов: тепло, просто и коротко - обычно 2-5 предложений. Подстраивайся под тон собеседника: пишут на «ты» и неформально - отвечай так же. Отвечай на языке вопроса (русский или казахский).
Опирайся только на данные приложения ниже: прогноз по часам, маршрут, оценку риска, список вещей, точки рядом. Не выдумывай погоду, цифры и факты. Если данных на нужную дату нет, так и скажи и подскажи, что можно сделать.
Безопасность важнее всего. Если в данных есть гроза, сильный ветер, мороз, возвращение после заката, возрастное ограничение или маршрут сложнее опыта - скажи об этом прямо, но по-доброму, и предложи вариант: выйти раньше, выбрать маршрут проще, найти компанию.
Если человек описывает травму, плохое самочувствие или опасность - сначала скажи нажать SOS или позвонить 112, затем 2-3 главных шага первой помощи. Не ставь диагнозов.
Пиши обычным текстом без заголовков и без markdown, не используй длинное тире (только дефис). Для списка вещей можно короткий список через дефис. Время - по Алматы (UTC+5).`;

const isClaudeKey = (k) => String(k || '').startsWith('sk-ant-');

export function aiMode() {
  if (state.settings.aiOff) return 'off';
  if (!online()) return 'offline';
  if (state.settings.aiProxy || AI_PROXY) return 'proxy';
  if (state.settings.aiKey) return isClaudeKey(state.settings.aiKey) ? 'key' : 'gemini';
  if (GEMINI_KEY) return 'gemini';
  return 'none';
}

export const aiName = () => ({ proxy: 'Claude', key: 'Claude', gemini: 'Gemini' }[aiMode()] || null);

// ---- Разбор вопроса: какой маршрут, какой день, во сколько ----

const ALIASES = [
  ['bao', /бао|больш\S* алматинск|алматинск\S* озер/],
  ['butakovka', /бутаков/],
  ['gorelnik-falls', /водопад/],
  ['gorelnik-lakes', /озер\S* горельник|горельник\S* озер/],
  ['kumbel', /кумбел|кок.?жайля/],
  ['t1', /(^|[^а-яa-z0-9])т-?1([^0-9]|$)|туюксу|гляциолог/],
  ['kosmostation', /космостанц|алматы.?алагир/],
];
const WEEKDAYS = [['воскресенье', 0], ['понедельник', 1], ['вторник', 2], ['среду', 3], ['четверг', 4], ['пятницу', 5], ['субботу', 6]];

export function parseQuestion(q, now = Date.now(), custom = state.customRoutes || []) {
  const s = ' ' + q.toLowerCase().replace(/ё/g, 'е') + ' ';
  let routeId = ALIASES.find(([, re]) => re.test(s))?.[0] ?? null;
  for (const r of custom) if (r.title.length > 3 && s.includes(r.title.toLowerCase().slice(0, 8))) routeId = r.id;
  let offset = null;
  if (/послезавтра/.test(s)) offset = 2;
  else if (/завтра/.test(s)) offset = 1;
  else if (/сегодня|сейчас|щас|прямо/.test(s)) offset = 0;
  else {
    const wd = WEEKDAYS.find(([w]) => new RegExp(`(^|\\s)(в|во|на)\\s+${w}`).test(s));
    if (wd) {
      const today = new Date(now + 5 * 3600e3).getUTCDay();
      offset = (wd[1] - today + 7) % 7;
    }
  }
  let time = null;
  const m = s.match(/(?:^|\s)(?:в|к|около|часов в)\s*(\d{1,2})(?:[:.](\d{2}))?(?!\d)(?!\s*(?:км|метр|лет|чел|°|%|м\s))/) || s.match(/(\d{1,2}):(\d{2})/);
  if (m) {
    let hh = Number(m[1]);
    if (hh < 5 && !/утра|ночи/.test(s)) hh += 12;
    if (hh <= 23) time = `${String(hh).padStart(2, '0')}:${m[2] || '00'}`;
  } else if (/рано утром|рассвет/.test(s)) time = '06:00';
  else if (/утром|с утра/.test(s)) time = '08:00';
  else if (/дн[её]м|в обед/.test(s)) time = '12:00';
  else if (/вечером/.test(s)) time = '17:00';
  return { routeId, offset, time };
}

// День и время выхода: время без дня - сегодня, если ещё не прошло, иначе завтра
export function resolveStart(parsed, now = Date.now(), plan = state.plan) {
  const time = parsed.time || (parsed.offset != null ? '08:00' : plan.time || '08:00');
  let day;
  if (parsed.offset != null) day = dayKey(now + parsed.offset * 86400e3);
  else if (parsed.time) day = fromLocal(dayKey(now), time) > now ? dayKey(now) : dayKey(now + 86400e3);
  else day = plan.day || dayKey(now);
  return { day, time, start: fromLocal(day, time) };
}

// ---- Данные приложения для модели ----

function hourLine(h) {
  return `${fmtTime(h.t)} ${wmo(h.code).text.toLowerCase()}, ${Math.round(h.temp)}°C (ощущается ${Math.round(h.feels)}°C), внизу ${Math.round(h.tempStart)}°C, порывы ${Math.round(h.gust)} км/ч, осадки ${h.pop}%${h.vis != null && h.vis < 2000 ? `, видимость ${Math.round(h.vis)} м` : ''}`;
}

export async function buildContext(parsed, now = Date.now()) {
  const p = state.profile;
  const a = age();
  const lines = [`Сейчас: ${fmtDay(now)}, ${fmtTime(now)} по Алматы.`];
  lines.push(`Пользователь: ${a} лет${a < 18 ? ' (подросток: только лёгкие и средние маршруты, родители получают уведомления)' : ''}, пол ${p.gender === 'f' ? 'женский' : 'мужской'} (обращайся в этом роде), опыт в горах: ${expName(p.experience || 'novice', p.gender).toLowerCase()}.`);
  const t = state.trip;
  if (t) {
    const tr = routeById(t.routeId);
    lines.push(`Сейчас в походе: ${tr?.title}, вышел в ${fmtTime(t.startedAt)}, контрольное время ${fmtTime(t.returnBy)}${t.progress ? `, пройдено ${(t.progress / 1000).toFixed(1)} км` : ''}${t.companions?.length ? `, идёт с: ${t.companions.join(', ')}` : ''}.`);
  }
  const r = routeById(parsed.routeId) || activeRoute();
  if (r) {
    let { start } = resolveStart(parsed, now);
    if (t && t.routeId === r.id && parsed.offset == null && !parsed.time) start = t.startedAt;
    const end = start + r.hours * 3600e3;
    lines.push(`Маршрут: ${r.title} (${LEVEL_NAME[r.level].toLowerCase()}${r.custom ? ', свой маршрут пользователя, линия по прямой' : ''}). Путь ${r.walkKm} км ${r.kind === 'out' ? 'туда и обратно' : 'по кольцу'}, набор ${r.up} м, старт ${r.profile[0][1]} м, высшая точка ${r.maxEle} м, обычное время ${fmtHours(r.hours)}. Старт: ${r.start}. Опасности: ${r.hazards.join('; ')}.`);
    lines.push(`${routeAllowed(r, a) ? '' : 'ВНИМАНИЕ: маршрут закрыт для возраста пользователя. '}Разбираем выход: ${fmtDay(start)} в ${fmtTime(start)}, возвращение около ${fmtTime(end)}.`);
    const fc = await loadForecast(r, cache, { online: online() });
    if (fc) {
      const hs = inWindow(fc, start, end);
      const day0 = dayOf(fc, start);
      if (hs.length) {
        lines.push(`Прогноз Open-Meteo (обновлён ${ago(fc.fetchedAt)}) на высшей точке ${fc.eleTop} м, внизу ${fc.eleStart} м:`);
        hs.slice(0, 14).forEach((h) => lines.push('- ' + hourLine(h)));
        lines.push(`Восход ${fmtTime(day0.sunrise)}, закат ${fmtTime(day0.sunset)}, УФ до ${Math.round(day0.uvMax)}.`);
      } else {
        lines.push('Прогноза на это время нет: он доступен только на 4 дня вперёд.');
      }
    } else {
      lines.push('Прогноз не загружен (нет интернета или сервис не ответил).');
    }
    const risk = assessRisk({ route: r, fc, startMs: start, age: a, experience: p.experience, group: state.plan.group || 1, contacts: p.contacts.length, hasMedical: !!p.medical?.blood });
    lines.push(`Оценка риска приложения: ${risk.verdict}. Факторы: ${risk.factors.map((f) => `${f.title} (${f.text})`).join('; ')}.`);
    const gear = gearList({ route: r, fc, startMs: start, medical: p.medical }).flatMap((g) => g.items.map((i) => i.text));
    lines.push(`Список вещей приложения: ${gear.slice(0, 18).join('; ')}.`);
  } else {
    lines.push('Маршрут пока не выбран.');
  }
  if (state.pos) {
    const from = [state.pos.lat, state.pos.lon];
    const near = ['rescue', 'hut', 'water'].map((k) => nearest(from, PLACES, [k], 1)[0]).filter(Boolean);
    lines.push(`Рядом с пользователем: ${near.map((x) => `${x.name} ${fmtDist(x.d)} на ${compass(x.brg)}`).join('; ')}.`);
  }
  lines.push(`Маршруты в приложении: ${allRoutes().map((x) => `${x.title} - ${LEVEL_NAME[x.level].toLowerCase()}, ${x.walkKm} км, до ${x.maxEle} м, ${fmtHours(x.hours)}${routeAllowed(x, a) ? '' : ', закрыт по возрасту'}`).join('; ')}.`);
  return lines.join('\n');
}

// ---- Сводка без ИИ: тот же разбор вопроса и данные, ответ по шаблону (работает офлайн) ----

const VERDICT_TALK = ['Выглядит хорошо, можно идти.', 'Идти можно, но осторожно.', 'Риск высокий: лучше выйти раньше или выбрать маршрут проще.', 'Не советую выходить: слишком опасно.'];
const KEY_GEAR = ['shell', 'fleece', 'down', 'hat', 'glasses', 'boots', 'water', 'lamp', 'inhaler', 'antihist', 'tick'];

export async function localBrief(question, now = Date.now()) {
  const parsed = parseQuestion(question, now);
  const r = routeById(parsed.routeId) || (parsed.offset != null || parsed.time ? activeRoute() : null);
  if (!r) return null;
  const p = state.profile;
  const { start } = resolveStart(parsed, now);
  const end = start + r.hours * 3600e3;
  const fc = await loadForecast(r, cache, { online: online() });
  const hs = fc ? inWindow(fc, start, end) : [];
  let text = `${r.title}, ${fmtDay(start)} в ${fmtTime(start)}. `;
  if (hs.length) {
    const tMin = Math.round(Math.min(...hs.map((h) => h.feels)));
    const tMax = Math.round(Math.max(...hs.map((h) => h.temp)));
    const gust = Math.round(Math.max(...hs.map((h) => h.gust)));
    const pop = Math.max(...hs.map((h) => h.pop));
    const storm = hs.find((h) => h.code >= 95);
    text += `Наверху (${fc.eleTop} м) ${wmo(hs[Math.floor(hs.length / 2)].code).text.toLowerCase()}, до ${tMax} °C, по ощущениям от ${tMin} °C, ветер в порывах до ${gust} км/ч, ${pop < 20 ? 'осадков почти не будет' : `вероятность осадков до ${pop}%`}${storm ? `, около ${fmtTime(storm.t)} гроза` : ''}. `;
  } else {
    text += fc ? 'Прогноз на это время ещё не вышел: он есть на 4 дня вперёд. ' : 'Прогноз не загружен: сейчас нет интернета. ';
  }
  const risk = assessRisk({ route: r, fc, startMs: start, age: age(), experience: p.experience, group: state.plan.group || 1, contacts: p.contacts.length, hasMedical: !!p.medical?.blood });
  text += risk.blocked ? 'Этот маршрут закрыт для твоего возраста: выбери лёгкий или средний. ' : VERDICT_TALK[risk.level] + ' ';
  const watch = risk.factors.filter((x) => x.level >= 1).slice(0, 2).map((x) => x.title.charAt(0).toLowerCase() + x.title.slice(1));
  if (watch.length) text += `Обрати внимание: ${watch.join('; ')}. `;
  const day = fc && dayOf(fc, start);
  text += `Вернёшься около ${fmtTime(end)}${day ? `, закат в ${fmtTime(day.sunset)}` : ''}.`;
  const items = gearList({ route: r, fc, startMs: start, medical: p.medical }).flatMap((g) => g.items).filter((i) => KEY_GEAR.includes(i.id)).slice(0, 6).map((i) => i.text);
  return { text, items, itemsTitle: 'Главное взять:', routeId: r.id, go: 'route', goLabel: 'Открыть маршрут' };
}

// ---- Запрос к Claude ----

export class AIError extends Error {}

async function viaProxy(url, context, messages, onText) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ context, messages }) });
  if (!res.ok) throw new AIError(res.status === 429 ? 'слишком много вопросов, подождите минуту' : `сервер ИИ ответил ${res.status}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let full = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = dec.decode(value, { stream: true });
    full += chunk;
    if (!full.includes('\u001e')) onText(chunk);
  }
  if (full.includes(REFUSAL)) throw new AIError('refusal');
}

async function viaKey(key, context, messages, onText) {
  let Anthropic;
  try {
    ({ default: Anthropic } = await import(SDK));
  } catch {
    throw new AIError('не загрузилась библиотека Claude');
  }
  const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 1 });
  try {
    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: 4096,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low' },
      system: `${PERSONA}\n\nДанные приложения:\n${context}`,
      messages,
    });
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') onText(event.delta.text);
    }
    const final = await stream.finalMessage();
    if (final.stop_reason === 'refusal') throw new AIError('refusal');
  } catch (e) {
    if (e instanceof AIError) throw e;
    if (e instanceof Anthropic.AuthenticationError) throw new AIError('ключ не подошёл, проверьте его в профиле');
    if (e instanceof Anthropic.RateLimitError) throw new AIError('слишком много вопросов, подождите минуту');
    if (e instanceof Anthropic.APIConnectionError) throw new AIError('нет связи с сервером ИИ');
    if (e instanceof Anthropic.APIError) throw new AIError(`ошибка ИИ ${e.status}`);
    throw new AIError('не удалось получить ответ');
  }
}

// Gemini: потоковый ответ через REST. Если модель перегружена, пробуем следующую бесплатную.
const GEMINI_MODELS = ['gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-3-flash-preview'];

async function viaGemini(key, context, messages, onText) {
  const body = JSON.stringify({
    system_instruction: { parts: [{ text: `${PERSONA}\n\nДанные приложения:\n${context}` }] },
    contents: messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
    generationConfig: { maxOutputTokens: 2048, thinkingConfig: { thinkingLevel: 'low' } },
  });
  let last = 'все модели заняты, попробуйте через минуту';
  for (const model of GEMINI_MODELS) {
    let res;
    try {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body,
      });
    } catch {
      throw new AIError('нет связи с сервером ИИ');
    }
    if (res.status === 429 || res.status >= 500) {
      last = res.status === 429 ? 'лимит бесплатных вопросов, попробуйте через минуту' : 'модели ИИ сейчас перегружены';
      continue;
    }
    if (res.status === 400 || res.status === 401 || res.status === 403) throw new AIError('ключ Gemini не подошёл');
    if (!res.ok) throw new AIError(`ошибка ИИ ${res.status}`);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    let got = false;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line.startsWith('data:')) continue;
        let data;
        try {
          data = JSON.parse(line.slice(5));
        } catch {
          continue;
        }
        const c = data.candidates?.[0];
        for (const part of c?.content?.parts || []) {
          if (part.text && !part.thought) {
            got = true;
            onText(part.text);
          }
        }
        if (['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII'].includes(c?.finishReason) || data.promptFeedback?.blockReason) throw new AIError('refusal');
      }
    }
    if (got) return;
    last = 'пустой ответ';
  }
  throw new AIError(last);
}

// messages: [{ role: 'user' | 'assistant', content: string }], последний - вопрос пользователя
export async function askClaude(question, history, onText) {
  const context = await buildContext(parseQuestion(question));
  const messages = [...history, { role: 'user', content: question }];
  const mode = aiMode();
  if (mode === 'proxy') return viaProxy(state.settings.aiProxy || AI_PROXY, context, messages, onText);
  if (mode === 'key') return viaKey(state.settings.aiKey, context, messages, onText);
  if (mode === 'gemini') return viaGemini(state.settings.aiKey || GEMINI_KEY, context, messages, onText);
  throw new AIError('ИИ не подключён');
}
