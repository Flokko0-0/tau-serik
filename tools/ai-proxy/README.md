# ИИ-помощник: сервер-посредник

Сайт статический и публичный, поэтому ключ Claude нельзя класть в его код: его сможет скопировать любой. Эта функция Supabase хранит ключ у себя и пересылает вопросы в Claude (`claude-opus-5`).

## Развернуть (5 минут)

```bash
npm i -g supabase
supabase login
cd tools/ai-proxy
supabase link --project-ref <ref вашего проекта Supabase>
supabase secrets set ANTHROPIC_API_KEY=<ваш ключ Anthropic>
supabase functions deploy tau-ai --no-verify-jwt
```

Адрес функции: `https://<ref>.supabase.co/functions/v1/tau-ai`. Впишите его в `js/config.js` (`AI_PROXY`) и опубликуйте сайт: ИИ заработает у всех, включая жюри.

## Защита

- Принимает запросы только с `https://flokko0-0.github.io` и `http://localhost:5180` (список `ALLOWED`).
- Не больше 20 вопросов за 10 минут с одного адреса, до 12 сообщений истории, ответ до 4096 токенов.
- Роль помощника задаётся на сервере: с сайта приходят только данные приложения и вопросы.

## Без сервера

В приложении: Профиль → ИИ-помощник → вставить ключ Anthropic. Ключ сохраняется только на этом телефоне и не попадает в код сайта.
