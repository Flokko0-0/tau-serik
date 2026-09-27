// Геометрия на сфере: точки как [lat, lon]
import { lang, t, num } from './i18n.js';

const R = 6371000;
const rad = (d) => (d * Math.PI) / 180;

export function dist(a, b) {
  const dLat = rad(b[0] - a[0]);
  const dLon = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function bearing(a, b) {
  const y = Math.sin(rad(b[1] - a[1])) * Math.cos(rad(b[0]));
  const x = Math.cos(rad(a[0])) * Math.sin(rad(b[0])) - Math.sin(rad(a[0])) * Math.cos(rad(b[0])) * Math.cos(rad(b[1] - a[1]));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

const DIRS = {
  ru: ['С', 'СВ', 'В', 'ЮВ', 'Ю', 'ЮЗ', 'З', 'СЗ'],
  kk: ['С', 'СШ', 'Ш', 'ОШ', 'О', 'ОБ', 'Б', 'СБ'],
  en: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'],
};
export const compass = (deg) => DIRS[lang()][Math.round(deg / 45) % 8];

export function fmtDist(m) {
  if (m < 950) return t('{n} м', { n: Math.max(10, Math.round(m / 10) * 10) });
  return t('{n} км', { n: num(m / 1000, m < 9950 ? 1 : 0) });
}

function dms(v, pos, neg) {
  const total = Math.round(Math.abs(v) * 3600);
  const d = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${d}°${String(m).padStart(2, '0')}′${String(s).padStart(2, '0')}″ ${v >= 0 ? pos : neg}`;
}
const HEMI = { ru: ['с. ш.', 'ю. ш.', 'в. д.', 'з. д.'], kk: ['с. е.', 'о. е.', 'ш. б.', 'б. б.'], en: ['N', 'S', 'E', 'W'] };
export const toDMS = (lat, lon) => {
  const h = HEMI[lang()];
  return `${dms(lat, h[0], h[1])}  ${dms(lon, h[2], h[3])}`;
};
export const toDD = (lat, lon) => `${lat.toFixed(5)}, ${lon.toFixed(5)}`;

export function cumulative(line) {
  const c = [0];
  for (let i = 1; i < line.length; i++) c.push(c[i - 1] + dist(line[i - 1], line[i]));
  return c;
}

// Ближайшая точка маршрута: сколько метров пройдено и как далеко от тропы
export function nearestOnLine(line, p, cum = cumulative(line)) {
  const k = Math.cos(rad(p[0]));
  let best = { off: Infinity, along: 0, point: line[0], i: 0 };
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i];
    const b = line[i + 1];
    const ax = (a[1] - p[1]) * k, ay = a[0] - p[0];
    const bx = (b[1] - p[1]) * k, by = b[0] - p[0];
    const dx = bx - ax, dy = by - ay;
    const L2 = dx * dx + dy * dy || 1e-18;
    const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L2));
    const q = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const off = dist(p, q);
    if (off < best.off) best = { off, along: cum[i] + (cum[i + 1] - cum[i]) * t, point: q, i };
  }
  return best;
}

export function pointAt(line, frac, cum = cumulative(line)) {
  const target = cum[cum.length - 1] * Math.max(0, Math.min(1, frac));
  let i = 0;
  while (i < cum.length - 2 && cum[i + 1] < target) i++;
  const t = (target - cum[i]) / (cum[i + 1] - cum[i] || 1);
  const a = line[i];
  const b = line[i + 1];
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

// Высота по профилю [[км, м], ...] на расстоянии km от старта
export function eleAt(profile, km) {
  if (km <= profile[0][0]) return profile[0][1];
  for (let i = 1; i < profile.length; i++) {
    if (profile[i][0] >= km) {
      const [k0, e0] = profile[i - 1];
      const [k1, e1] = profile[i];
      return e0 + ((e1 - e0) * (km - k0)) / (k1 - k0 || 1);
    }
  }
  return profile[profile.length - 1][1];
}

export function nearest(from, items, kinds, limit = 5) {
  return items
    .filter((p) => !kinds || kinds.includes(p.kind))
    .map((p) => ({ ...p, d: dist(from, [p.lat, p.lon]), brg: bearing(from, [p.lat, p.lon]) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, limit);
}

// Точка на расстоянии m метров по азимуту brg
export function offset(p, brg, m) {
  const d = m / R;
  const b = rad(brg);
  const la1 = rad(p[0]);
  const lo1 = rad(p[1]);
  const la2 = Math.asin(Math.sin(la1) * Math.cos(d) + Math.cos(la1) * Math.sin(d) * Math.cos(b));
  const lo2 = lo1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(la1), Math.cos(d) - Math.sin(la1) * Math.sin(la2));
  return [(la2 * 180) / Math.PI, (lo2 * 180) / Math.PI];
}
