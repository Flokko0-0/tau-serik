# Демо-ролик

Ролик записывается автоматически с опубликованного сайта: слева панель с названием сцены и пояснением, справа живое приложение, в сцене SOS рядом появляется «телефон мамы». Озвучка - Gemini TTS, голос `Kore`.

## Что нужно

- Python 3.10+ и `pip install imageio-ffmpeg`
- Node.js 20+ и `npm i -g @playwright/cli`, браузер Edge или Chrome
- Ключ Gemini (Google AI Studio)

## Только поменять голос или текст (видео не перезаписывается)

Нужны файлы из архива: `out/raw.webm`, `out/marks.json`.

```bash
GEMINI_KEY=... VOICE=Kore python tools/video/tts.py        # все сцены; или только нужные: tts.py intro outro
python tools/video/assemble.py                               # out/tau-serik-demo.mp4 и .srt
```

Голоса Gemini: `Kore` (уверенный), `Sulafat` (тёплый), `Aoede` (лёгкий), `Charon` и `Orus` (мужские). Текст реплик - в `SCENES` в `tts.py`. Если новая реплика длиннее сцены, `assemble.py` предупредит: тогда перезапишите видео.

## Перезаписать видео

```bash
python tools/video/make_record.py                            # out/record.js с длительностями озвучки
playwright-cli -s=rec open --browser=msedge https://flokko0-0.github.io/tau-serik/
playwright-cli -s=rec run-code --filename=tools/video/out/record.js
```

Скрипт печатает JSON с метками сцен: сохраните его в `tools/video/out/marks.json` и запустите `assemble.py`. Запись идёт около двух минут, окно браузера лучше не трогать. Ролик должен быть не длиннее 2 минут: длительность печатает `assemble.py`.

На ноутбуке нет акселерометра и микрофона, поэтому в ролике статусы датчиков выставлены так, как они выглядят на телефоне, а падение запускается как в демо-пульте.
