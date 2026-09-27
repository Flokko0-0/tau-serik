// Посредник между сайтом и Claude: ключ хранится в секретах Supabase и не попадает в браузер.
// Деплой: supabase functions deploy tau-ai --no-verify-jwt; ключ: supabase secrets set ANTHROPIC_API_KEY=...
import Anthropic from "npm:@anthropic-ai/sdk@0.128.0";

const MODEL = "claude-opus-5";
const ALLOWED = ["https://flokko0-0.github.io", "http://localhost:5180"];
const client = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });

// Держите в синхронизации с PERSONA в js/ai.js
const PERSONA = `Ты - Тау Серік, помощник в приложении безопасности для гор Заилийского Алатау (Алматы, Казахстан).
Говори как заботливый друг с опытом походов: тепло, просто и коротко - обычно 2-5 предложений. Подстраивайся под тон собеседника: пишут на «ты» и неформально - отвечай так же. Отвечай на языке вопроса (русский или казахский).
Опирайся только на данные приложения ниже: прогноз по часам, маршрут, оценку риска, список вещей, точки рядом. Не выдумывай погоду, цифры и факты. Если данных на нужную дату нет, так и скажи и подскажи, что можно сделать.
Безопасность важнее всего. Если в данных есть гроза, сильный ветер, мороз, возвращение после заката, возрастное ограничение или маршрут сложнее опыта - скажи об этом прямо, но по-доброму, и предложи вариант: выйти раньше, выбрать маршрут проще, найти компанию.
Если человек описывает травму, плохое самочувствие или опасность - сначала скажи нажать SOS или позвонить 112, затем 2-3 главных шага первой помощи. Не ставь диагнозов.
Пиши обычным текстом без заголовков и без markdown, не используй длинное тире (только дефис). Для списка вещей можно короткий список через дефис. Время - по Алматы (UTC+5).`;

// Мягкий лимит от злоупотреблений: 20 вопросов за 10 минут с одного адреса
const hits = new Map<string, number[]>();
function limited(ip: string): boolean {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < 600_000);
  list.push(now);
  hits.set(ip, list);
  return list.length > 20;
}

type Msg = { role: "user" | "assistant"; content: string };

function clean(body: unknown): { context: string; messages: Anthropic.Beta.BetaMessageParam[] } | null {
  const b = body as { context?: unknown; messages?: unknown };
  if (typeof b?.context !== "string" || !Array.isArray(b.messages)) return null;
  const messages = (b.messages as Msg[])
    .filter((m) => (m?.role === "user" || m?.role === "assistant") && typeof m.content === "string")
    .slice(-12)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 1500) }));
  while (messages.length && messages[0].role !== "user") messages.shift();
  if (!messages.length || messages[messages.length - 1].role !== "user") return null;
  return { context: b.context.slice(0, 8000), messages };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";
  const cors = {
    "Access-Control-Allow-Origin": ALLOWED.includes(origin) ? origin : ALLOWED[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    Vary: "Origin",
  };
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST" || !ALLOWED.includes(origin)) return new Response("forbidden", { status: 403, headers: cors });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  if (limited(ip)) return new Response("too many requests", { status: 429, headers: cors });

  const input = clean(await req.json().catch(() => null));
  if (!input) return new Response("bad request", { status: 400, headers: cors });

  const enc = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      try {
        const stream = client.beta.messages.stream({
          model: MODEL,
          max_tokens: 4096,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          output_config: { effort: "low" },
          system: `${PERSONA}\n\nДанные приложения:\n${input.context}`,
          messages: input.messages,
        });
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            controller.enqueue(enc.encode(event.delta.text));
          }
        }
        const final = await stream.finalMessage();
        if (final.stop_reason === "refusal") controller.enqueue(enc.encode("\u001erefusal"));
      } catch (e) {
        if (e instanceof Anthropic.RateLimitError) console.error("rate limit");
        else if (e instanceof Anthropic.AuthenticationError) console.error("bad ANTHROPIC_API_KEY");
        else if (e instanceof Anthropic.APIError) console.error(`api error ${e.status}`);
        else console.error(e);
        controller.enqueue(enc.encode("\u001erefusal"));
      } finally {
        controller.close();
      }
    },
  });
  return new Response(body, { headers: { ...cors, "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
});
