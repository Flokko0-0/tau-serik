// Профиль высот маршрута: одна серия, площадь 12%, линия 2px, подпись высшей точки
import { t, num, int } from './i18n.js';
import { eleAt } from './geo.js';

const W = 340;
const H = 150;
const P = { l: 40, r: 12, t: 16, b: 22 };

function scale(route) {
  const km = route.profile[route.profile.length - 1][0];
  const range = route.maxEle - route.minEle;
  const step = range > 1200 ? 500 : range > 500 ? 250 : 100;
  const y0 = Math.floor(route.minEle / step) * step;
  const y1 = Math.ceil(route.maxEle / step) * step;
  const xStep = km <= 4 ? 1 : km <= 12 ? 2 : 5;
  const x = (v) => P.l + (v / km) * (W - P.l - P.r);
  const y = (v) => H - P.b - ((v - y0) / (y1 - y0 || 1)) * (H - P.t - P.b);
  return { km, step, y0, y1, xStep, x, y };
}

export function profileSvg(route, { hereKm = null } = {}) {
  const s = scale(route);
  const pts = route.profile.map(([k, e]) => `${s.x(k).toFixed(1)},${s.y(e).toFixed(1)}`);
  const area = `M${s.x(0)},${H - P.b} L${pts.join(' L')} L${s.x(s.km)},${H - P.b} Z`;
  let grid = '';
  for (let v = s.y0; v <= s.y1; v += s.step) {
    grid += `<line x1="${P.l}" x2="${W - P.r}" y1="${s.y(v)}" y2="${s.y(v)}" class="ch-grid"/>`;
    grid += `<text x="${P.l - 6}" y="${s.y(v) + 3.5}" class="ch-tick" text-anchor="end">${v.toLocaleString('ru-RU')}</text>`;
  }
  for (let k = 0; k <= s.km + 0.01; k += s.xStep) {
    grid += `<text x="${s.x(k)}" y="${H - 6}" class="ch-tick" text-anchor="middle">${k}${k === 0 ? '' : ''}</text>`;
  }
  grid += `<text x="${W - P.r}" y="${H - 6}" class="ch-tick" text-anchor="end">${t('км')}</text>`;
  const top = route.profile.reduce((a, p) => (p[1] > a[1] ? p : a));
  const tx = s.x(top[0]);
  const anchor = tx > W - 70 ? 'end' : tx < P.l + 40 ? 'start' : 'middle';
  let here = '';
  if (hereKm != null) {
    const hy = s.y(eleAt(route.profile, hereKm));
    here = `<line x1="${s.x(hereKm)}" x2="${s.x(hereKm)}" y1="${P.t}" y2="${H - P.b}" class="ch-here-line"/><circle cx="${s.x(hereKm)}" cy="${hy}" r="5" class="ch-here"/>`;
  }
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="${t('Профиль высот: от {min} до {max} метров на {km} км', { min: route.minEle, max: route.maxEle, km: num(s.km) })}">
    ${grid}
    <path d="${area}" class="ch-area"/>
    <polyline points="${pts.join(' ')}" class="ch-line"/>
    <circle cx="${tx}" cy="${s.y(top[1])}" r="4" class="ch-dot"/>
    <text x="${tx}" y="${s.y(top[1]) - 8}" class="ch-label" text-anchor="${anchor}">${t('{n} м', { n: int(top[1]) })}</text>
    ${here}
    <g class="ch-hover" hidden><line y1="${P.t}" y2="${H - P.b}" class="ch-cross"/><circle r="4" class="ch-dot"/></g>
    <rect x="${P.l}" y="0" width="${W - P.l - P.r}" height="${H}" fill="transparent" class="ch-hit"/>
  </svg>`;
}

// Перекрестие и подсказка при наведении/касании; onHover(km) подсвечивает точку на карте
export function bindProfile(box, route, onHover) {
  const svg = box.querySelector('svg');
  const hit = svg?.querySelector('.ch-hit');
  if (!hit) return;
  const s = scale(route);
  const g = svg.querySelector('.ch-hover');
  const tip = box.querySelector('.ch-tip');
  const move = (ev) => {
    const r = svg.getBoundingClientRect();
    const vx = ((ev.clientX - r.left) / r.width) * W;
    const km = Math.max(0, Math.min(s.km, ((vx - P.l) / (W - P.l - P.r)) * s.km));
    const e = eleAt(route.profile, km);
    g.hidden = false;
    g.querySelector('line').setAttribute('x1', s.x(km));
    g.querySelector('line').setAttribute('x2', s.x(km));
    g.querySelector('circle').setAttribute('cx', s.x(km));
    g.querySelector('circle').setAttribute('cy', s.y(e));
    if (tip) {
      tip.hidden = false;
      tip.textContent = `${t('{n} км', { n: num(km) })} · ${t('{n} м', { n: int(Math.round(e)) })}`;
      tip.style.left = `${(s.x(km) / W) * 100}%`;
    }
    onHover?.(km);
  };
  const leave = () => {
    g.hidden = true;
    if (tip) tip.hidden = true;
    onHover?.(null);
  };
  hit.addEventListener('pointermove', move);
  hit.addEventListener('pointerdown', move);
  hit.addEventListener('pointerleave', leave);
}
