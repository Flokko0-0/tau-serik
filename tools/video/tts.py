# Шаг 1. Озвучка сцен голосом Gemini TTS. Пишет out/voice/<сцена>.wav и out/durations.json
# Запуск: GEMINI_KEY=... python tools/video/tts.py [сцена ...]     Голос: VOICE=Kore (по умолчанию)
import base64, json, os, re, subprocess, sys, time, urllib.error, urllib.request
import imageio_ffmpeg

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out')
FF = imageio_ffmpeg.get_ffmpeg_exe()
VOICE = os.environ.get('VOICE', 'Kore')
MODEL = 'gemini-3.8-flash-tts'
STYLE = ('Warm, confident professional narrator of a short product promo video, speaking Russian at a brisk, '
         'energetic but natural pace. Lively intonation with subtle emotion, clear diction, short natural pauses. Never robotic.')

# Порядок и id сцен совпадают с record.template.js
SCENES = [
    ('intro', 'Горы Алматы в часе от города, но каждый сезон спасатели ищут тех, кто заблудился или сорвался. Тау Серік - горный спутник, который защищает до выхода, на тропе и в беде.'),
    ('reg', 'Регистрация по ИИН. Приложение проверяет контрольную цифру и само определяет возраст и пол, а личность подтверждается через eGov. Подросткам сложные маршруты закрыты, а родитель всегда в курсе.'),
    ('route', 'Семь настоящих троп Заилийского Алатау с профилем высот. Приложение берёт прогноз на высоте вершины, учитывает закат, опыт и сезон и объясняет риск простыми словами. А список вещей собирается под погоду и медкарту.'),
    ('ai', 'А можно просто спросить, как у друга. ИИ-помощник на Gemini смотрит реальный прогноз и честно говорит, стоит ли идти.'),
    ('start', 'Старт похода. Близкие получают маршрут и контрольное время, а телефон следит за падением, криком и кодовым словом.'),
    ('sos', 'Турист сорвался. Телефон спрашивает: вы в порядке? Если ответа нет, сигнал тревоги уходит сам. И в ту же секунду у мамы звучит сирена: координаты, высота, медкарта и точка на карте.'),
    ('offline', 'Пропала связь? Сигнал ждёт в очереди и уйдёт сам, а карта, трек и семнадцать памяток первой помощи работают без интернета.'),
    ('company', 'Одному в горы опасно. В разделе «Компания» попутчики проверены через eGov, заявки зашифрованы, а контакты открываются только по взаимному согласию.'),
    ('outro', 'Тау Серік. Чтобы горы оставались радостью, а не риском.'),
]


def tts(text):
    key = os.environ.get('GEMINI_KEY') or sys.exit('Задайте ключ: GEMINI_KEY=...')
    body = {
        'model': MODEL,
        'input': [{'type': 'user_input', 'content': [{'type': 'text', 'text': text, 'annotations': [{'type': 'speech_metadata', 'style': STYLE}]}]}],
        'response_format': {'type': 'audio'},
        'generation_config': {'speech_config': [{'voice': VOICE}]},
    }
    last = ''
    for attempt in range(10):
        req = urllib.request.Request('https://generativelanguage.googleapis.com/v1beta/interactions', data=json.dumps(body).encode(),
                                     headers={'x-goog-api-key': key, 'Content-Type': 'application/json'})
        try:
            d = json.load(urllib.request.urlopen(req, timeout=120))
            audio = [c for s in d.get('steps', []) if s.get('type') == 'model_output' for c in s.get('content', []) if c.get('type') == 'audio']
            if audio:
                return base64.b64decode(audio[-1]['data'])
            last = 'нет звука в ответе'
        except urllib.error.HTTPError as e:
            last = f'HTTP {e.code}: {e.read()[:200]}'
            if e.code not in (429, 500, 503):
                sys.exit(last)
        print('  повтор', attempt + 1, last[:80], flush=True)
        time.sleep(15 * (attempt + 1))
    sys.exit(last)


def duration(path):
    err = subprocess.run([FF, '-hide_banner', '-i', path], capture_output=True, text=True).stderr
    h, m, s = re.search(r'Duration: (\d+):(\d+):([\d.]+)', err).groups()
    return round(int(h) * 3600 + int(m) * 60 + float(s), 2)


if __name__ == '__main__':
    only = sys.argv[1:]
    os.makedirs(os.path.join(OUT, 'voice'), exist_ok=True)
    durs = {}
    for sid, text in SCENES:
        wav = os.path.join(OUT, 'voice', sid + '.wav')
        if not only or sid in only:
            raw = os.path.join(OUT, 'voice', sid + '.raw.wav')
            open(raw, 'wb').write(tts(text))
            # 48 кГц, тишина по краям обрезается
            subprocess.run([FF, '-hide_banner', '-loglevel', 'error', '-y', '-i', raw, '-af',
                            'silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse',
                            '-ar', '48000', wav], check=True)
        if os.path.exists(wav):
            durs[sid] = duration(wav)
            print(sid, durs[sid], 'с')
    json.dump(durs, open(os.path.join(OUT, 'durations.json'), 'w'), indent=1)
    print('итого', round(sum(durs.values()), 1), 'с')
