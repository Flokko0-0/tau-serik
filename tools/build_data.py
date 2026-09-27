# Собирает js/data/routes.js и js/data/places.js из OpenStreetMap (Overpass) и высот Copernicus DEM (Open-Meteo).
# Запуск: python tools/build_data.py   (ответы Overpass кэшируются в tools/.cache)
import json, math, os, time, urllib.error, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, 'tools', '.cache')
UA = 'tau-serik-hackathon/0.1'
MIRRORS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter']
BBOX = '42.98,76.80,43.22,77.25'

# id отношения OSM -> описание маршрута
ROUTES = {
    20667845: dict(id='butakovka', title='Бутаковка - Родник - Лесной перевал', level='easy', kind='out', start='Бутаковское ущелье',
                   text='Короткий подъём по лесу к роднику и Лесному перевалу. Хорош для первого выхода и тренировки.',
                   hazards=['Крутой подъём, скользко после дождя', 'Клещи с апреля по июль', 'Собаки у частных домов в начале тропы']),
    17016202: dict(id='gorelnik-falls', title='Водопады Горельника', level='medium', kind='out', start='Дорога на Шымбулак, поворот на Горельник',
                   text='Тропа вдоль реки к каскаду водопадов. Короткая, но крутая: 800 м набора на 3 км.',
                   hazards=['Мокрые камни у воды', 'Броды после дождей', 'Камнепад на крутых участках']),
    17055124: dict(id='bao', title='Большое Алматинское озеро', level='medium', kind='out', start='Большое Алматинское ущелье',
                   text='Подъём к бирюзовому озеру на высоте 2500 м. Озеро - источник питьевой воды города, купаться запрещено.',
                   hazards=['Высота 2500+ м: берегите силы', 'Погода меняется за 20-30 минут', 'Сильное солнце и ветер у воды']),
    17070457: dict(id='gorelnik-lakes', title='Озёра Горельника', level='hard', kind='out', start='Медеу',
                   text='Длинный подъём от Медеу к высокогорным озёрам и хижине Верхний Горельник (3205 м).',
                   hazards=['Горная болезнь выше 3000 м', 'Снежники даже летом', 'Длинный день: 9-11 часов']),
    17016176: dict(id='kumbel', title='Кок-Жайляу - Кумбель - Горельник', level='hard', kind='loop', start='Район Медеу',
                   text='Кольцо через плато Кок-Жайляу и вершину Кумбель (3200 м) со спуском к Горельнику.',
                   hazards=['Ветреный гребень, гроза опасна', 'Мало воды на гребне', 'Нужно выйти рано'],
                   ),
    17168304: dict(id='t1', title='Гляциологическая станция Т1', level='hard', kind='out', start='Шымбулак',
                   text='Подъём по долине Туюксу к леднику и гляциологической станции на высоте 3400 м.',
                   hazards=['Высота 3400 м', 'Лавиноопасно с ноября по апрель', 'Не выходите на ледник без снаряжения']),
    17168388: dict(id='kosmostation', title='Кольцо БАО - Космостанция - перевал Алматы-Алагир', level='expert', kind='loop', start='Большое Алматинское озеро',
                   text='Многодневное кольцо через Космостанцию (3300 м) и перевал Алматы-Алагир. Для опытных групп.',
                   hazards=['Высота до 3650 м', 'Перевал: снег и лёд в любой месяц', 'Ночёвка в горах, нужна подготовка']),
}


def hav(a, b):
    R = 6371000
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


def overpass(name, query):
    path = os.path.join(CACHE, name + '.json')
    if os.path.exists(path):
        return json.load(open(path, encoding='utf-8'))
    for url in MIRRORS:
        try:
            req = urllib.request.Request(url, data=urllib.parse.urlencode({'data': query}).encode(),
                                         headers={'User-Agent': UA, 'Accept': 'application/json'})
            data = json.load(urllib.request.urlopen(req, timeout=180))
            json.dump(data, open(path, 'w', encoding='utf-8'), ensure_ascii=False)
            return data
        except Exception as e:
            print('overpass fail', url, e)
    raise SystemExit('Overpass недоступен')


def chain(ways, first):
    line, rest, gaps = list(ways[first]), [w for i, w in enumerate(ways) if i != first], []
    while rest:
        best = None
        for i, w in enumerate(rest):
            for ww in (w, w[::-1]):
                for tail in (True, False):
                    dd = hav(line[-1], ww[0]) if tail else hav(ww[-1], line[0])
                    if best is None or dd < best[0]:
                        best = (dd, i, ww, tail)
        dd, i, ww, tail = best
        rest.pop(i)
        if dd > 30:
            gaps.append(dd)
        line = line + ww[1:] if tail else ww[:-1] + line
    return line, gaps


def simplify(pts, eps):
    if len(pts) < 3:
        return pts
    lat0 = math.radians(pts[0][0])
    xy = [(p[1] * 111320 * math.cos(lat0), p[0] * 110540) for p in pts]
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        (ax, ay), (bx, by) = xy[a], xy[b]
        dx, dy = bx - ax, by - ay
        L = math.hypot(dx, dy) or 1e-9
        best, bi = 0, -1
        for i in range(a + 1, b):
            px, py = xy[i]
            d = abs(dy * px - dx * py + bx * ay - by * ax) / L
            if d > best:
                best, bi = d, i
        if best > eps:
            keep[bi] = True
            stack += [(a, bi), (bi, b)]
    return [p for p, k in zip(pts, keep) if k]


def elevations(key, points):
    path = os.path.join(CACHE, 'ele-' + key + '.json')
    if os.path.exists(path):
        return json.load(open(path))
    url = 'https://api.open-meteo.com/v1/elevation?latitude=' + ','.join(f'{p[0]:.5f}' for p in points) + \
          '&longitude=' + ','.join(f'{p[1]:.5f}' for p in points)
    for attempt in range(5):
        try:
            el = json.load(urllib.request.urlopen(url, timeout=30))['elevation']
            json.dump(el, open(path, 'w'))
            return el
        except urllib.error.HTTPError as e:
            if e.code != 429:
                raise
            time.sleep(20 * (attempt + 1))
    raise SystemExit('Open-Meteo недоступен')


def build_routes():
    data = overpass('routes', '[out:json][timeout:100];relation(id:%s);out geom;' % ','.join(map(str, ROUTES)))
    out = []
    for rel in data['elements']:
        meta = ROUTES.get(rel['id'])
        if not meta:
            continue
        ways = [[(p['lat'], p['lon']) for p in m['geometry']] for m in rel['members'] if m['type'] == 'way' and m.get('geometry')]
        line = min((chain(ways, f) for f in range(len(ways))), key=lambda r: sum(r[1]))[0]
        if hav(line[0], line[-1]) < 50:
            m = len(line) // 2
            line = simplify(line[:m + 1], 12)[:-1] + simplify(line[m:], 12)
        else:
            line = simplify(line, 12)
        if meta['id'] == 't1':
            line = line[::-1]  # от Шымбулака вверх
        cum = [0.0]
        for i in range(1, len(line)):
            cum.append(cum[-1] + hav(line[i - 1], line[i]))
        total, n, j, samples = cum[-1], 60, 0, []
        for k in range(n + 1):
            t = total * k / n
            while j < len(cum) - 2 and cum[j + 1] < t:
                j += 1
            f = (t - cum[j]) / ((cum[j + 1] - cum[j]) or 1)
            a, b = line[j], line[j + 1]
            samples.append((a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, t))
        el = elevations(meta['id'], samples)
        up = sum(max(0, el[i] - el[i - 1]) for i in range(1, len(el)))
        down = sum(max(0, el[i - 1] - el[i]) for i in range(1, len(el)))
        km = total / 1000
        if meta['kind'] == 'out':  # туда и обратно
            walk_km, walk_up, walk_down = km * 2, up + down, up + down
        else:
            walk_km, walk_up, walk_down = km, up, down
        # темп смешанной группы: 4 км/ч + 1 ч на 500 м подъёма + 1 ч на 1000 м спуска
        hours = walk_km / 4 + walk_up / 500 + walk_down / 1000
        top = max(range(len(el)), key=lambda i: el[i])
        out.append(dict(meta, osm=rel['id'], km=round(km, 1), walkKm=round(walk_km, 1), up=round(walk_up), down=round(walk_down),
                        minEle=round(min(el)), maxEle=round(max(el)), hours=round(hours * 2) / 2,
                        top=[round(samples[top][0], 5), round(samples[top][1], 5)],
                        line=[[round(a, 5), round(b, 5)] for a, b in line],
                        profile=[[round(s[2] / 1000, 2), round(e)] for s, e in zip(samples, el)]))
        print(meta['id'], out[-1]['km'], 'km', out[-1]['hours'], 'h', out[-1]['maxEle'], 'm')
    order = list(v['id'] for v in ROUTES.values())
    out.sort(key=lambda r: order.index(r['id']))
    return out


KINDS = {
    'mountain_rescue': 'rescue',
    'wilderness_hut': 'hut', 'alpine_hut': 'hut', 'shelter': 'shelter',
    'spring': 'water', 'drinking_water': 'water', 'toilets': 'toilet', 'camp_site': 'camp', 'peak': 'peak',
}
DEFAULT_NAMES = {'hut': 'Хижина', 'shelter': 'Навес', 'water': 'Родник', 'toilet': 'Туалет', 'camp': 'Место для палатки',
                 'rescue': 'Пост спасателей', 'peak': 'Вершина'}


def build_places():
    q = ('[out:json][timeout:170];(node["amenity"~"^(shelter|toilets|drinking_water)$"]({b});way["amenity"~"^(shelter|toilets)$"]({b});'
         'node["tourism"~"^(alpine_hut|wilderness_hut|camp_site)$"]({b});way["tourism"~"^(alpine_hut|wilderness_hut|camp_site)$"]({b});'
         'node["natural"="spring"]({b});nwr["emergency"~"."]({b});node["natural"="peak"]["name"]({b}););out center tags;').format(b=BBOX)
    data = overpass('pois', q)
    out, seen = [], set()
    for e in data['elements']:
        t = e.get('tags', {})
        key = t.get('emergency') if t.get('emergency') == 'mountain_rescue' else \
            t.get('tourism') if t.get('tourism') in KINDS else \
            t.get('amenity') if t.get('amenity') in KINDS else t.get('natural')
        kind = KINDS.get(key)
        if not kind:
            continue
        lat = e.get('lat') or e.get('center', {}).get('lat')
        lon = e.get('lon') or e.get('center', {}).get('lon')
        name = t.get('name:ru') or t.get('name') or DEFAULT_NAMES[kind]
        if kind == 'water' and key == 'drinking_water' and not t.get('name'):
            name = 'Питьевая вода'
        sig = (kind, round(lat, 4), round(lon, 4))
        if sig in seen:
            continue
        seen.add(sig)
        p = dict(kind=kind, name=name, lat=round(lat, 5), lon=round(lon, 5))
        ele = t.get('ele', '').replace(',', '.').split(' ')[0]
        if ele.replace('.', '').isdigit():
            p['ele'] = round(float(ele))
        if kind == 'peak' and 'ele' not in p:
            continue
        out.append(p)
    return out


def write_js(path, name, value, header):
    with open(path, 'w', encoding='utf-8') as f:
        f.write(f'// {header}\n// Сгенерировано tools/build_data.py, не редактируйте вручную.\n')
        f.write(f'export const {name} = ')
        json.dump(value, f, ensure_ascii=False, separators=(',', ':'))
        f.write(';\n')


if __name__ == '__main__':
    os.makedirs(CACHE, exist_ok=True)
    routes = build_routes()
    write_js(os.path.join(ROOT, 'js', 'data', 'routes.js'), 'ROUTES', routes,
             'Маршруты: © участники OpenStreetMap (ODbL), высоты: Copernicus DEM GLO-90 через Open-Meteo.')
    places = build_places()
    write_js(os.path.join(ROOT, 'js', 'data', 'places.js'), 'PLACES', places, 'Точки: © участники OpenStreetMap (ODbL).')
    from collections import Counter
    print(len(routes), 'routes;', Counter(p['kind'] for p in places))
