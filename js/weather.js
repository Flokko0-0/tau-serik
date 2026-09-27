// Прогноз Open-Meteo для двух точек маршрута: старт и высшая точка (с поправкой на высоту)
import { t } from './i18n.js';

const API = 'https://api.open-meteo.com/v1/forecast';
const HOURLY = 'temperature_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,freezing_level_height,uv_index,snowfall,visibility';
const TTL = 60 * 60e3;

export function forecastUrl(route) {
  const s = route.line[0];
  const t = route.top;
  const ele = [route.profile[0][1], route.maxEle];
  return `${API}?latitude=${s[0]},${t[0]}&longitude=${s[1]},${t[1]}&elevation=${ele.join(',')}&hourly=${HOURLY}` +
    '&daily=sunrise,sunset,uv_index_max&timezone=Asia%2FAlmaty&timeformat=unixtime&forecast_days=4&wind_speed_unit=kmh';
}

export function normalize(json, fetchedAt = Date.now()) {
  const [start, top] = json;
  const h = top.hourly;
  const hs = start.hourly;
  const hours = h.time.map((t, i) => ({
    t: t * 1000,
    temp: h.temperature_2m[i],
    feels: h.apparent_temperature[i],
    tempStart: hs.temperature_2m[i],
    pop: h.precipitation_probability[i] ?? 0,
    precip: h.precipitation[i] ?? 0,
    code: h.weather_code[i],
    wind: h.wind_speed_10m[i],
    gust: h.wind_gusts_10m[i],
    freeze: h.freezing_level_height?.[i] ?? null,
    uv: h.uv_index?.[i] ?? 0,
    snow: h.snowfall?.[i] ?? 0,
    vis: h.visibility?.[i] ?? null,
  }));
  const d = top.daily;
  const days = d.time.map((t, i) => ({ t: t * 1000, sunrise: d.sunrise[i] * 1000, sunset: d.sunset[i] * 1000, uvMax: d.uv_index_max[i] }));
  return { fetchedAt, eleStart: Math.round(start.elevation), eleTop: Math.round(top.elevation), hours, days };
}

export async function loadForecast(route, cache, { force = false, online = true } = {}) {
  const key = 'wx:' + route.id;
  const cached = cache.get(key);
  if (cached && !force && Date.now() - cached.fetchedAt < TTL) return { ...cached, stale: false };
  if (!online) return cached ? { ...cached, stale: true } : null;
  try {
    const res = await fetch(forecastUrl(route), { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = normalize(await res.json());
    cache.set(key, data);
    return { ...data, stale: false };
  } catch {
    return cached ? { ...cached, stale: true } : null;
  }
}

export const inWindow = (fc, from, to) => fc.hours.filter((h) => h.t >= from - 3600e3 && h.t <= to);
export const dayOf = (fc, ms) => fc.days.filter((d) => d.t <= ms).pop() ?? fc.days[0];

// Коды погоды WMO
export function wmo(code) {
  if (code === 0) return { text: t('Ясно'), icon: 'sun' };
  if (code <= 2) return { text: t('Малооблачно'), icon: 'sun' };
  if (code === 3) return { text: t('Пасмурно'), icon: 'cloud' };
  if (code <= 48) return { text: t('Туман'), icon: 'cloud-fog' };
  if (code <= 57) return { text: t('Морось'), icon: 'cloud-rain' };
  if (code <= 67) return { text: t('Дождь'), icon: 'cloud-rain' };
  if (code <= 77) return { text: t('Снег'), icon: 'snowflake' };
  if (code <= 82) return { text: t('Ливень'), icon: 'cloud-rain' };
  if (code <= 86) return { text: t('Снегопад'), icon: 'snowflake' };
  return { text: t(code >= 96 ? 'Гроза с градом' : 'Гроза'), icon: 'cloud-storm' };
}
