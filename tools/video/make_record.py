# Шаг 2. Готовит out/record.js для записи экрана: подставляет длительности озвучки, адрес сайта и путь к видео
# Запуск: python tools/video/make_record.py [адрес сайта]
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out')
base = sys.argv[1] if len(sys.argv) > 1 else 'https://flokko0-0.github.io/tau-serik/'
durs = json.load(open(os.path.join(OUT, 'durations.json')))
s = open(os.path.join(HERE, 'record.template.js'), encoding='utf-8').read()
s = s.replace('__DURATIONS__', json.dumps(durs)).replace('__BASE__', base)
s = s.replace('__OUT__', os.path.join(OUT, 'raw.webm').replace('\\', '/'))
open(os.path.join(OUT, 'record.js'), 'w', encoding='utf-8').write(s)
print('Готово: out/record.js. Дальше:')
print('  playwright-cli -s=rec open --browser=msedge', base)
print('  playwright-cli -s=rec run-code --filename=' + os.path.join(OUT, 'record.js').replace('\\', '/'))
print('Скопируйте напечатанный JSON с метками в out/marks.json')
