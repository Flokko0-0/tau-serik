// Горизонтали как на топокарте: изолинии поля из нескольких вершин (marching squares), каждая пятая толще
const PEAKS = [
  [0.82, 0.28, 0.34, 1],
  [0.52, 0.95, 0.26, 0.8],
  [1.05, 0.9, 0.3, 0.9],
  [0.18, -0.1, 0.22, 0.55],
];

function field(x, y, w, h) {
  let v = 0;
  const s = Math.max(w, h);
  for (const [px, py, r, a] of PEAKS) {
    const dx = (x - px * w) / (r * s);
    const dy = (y - py * h) / (r * s);
    v += a * Math.exp(-(dx * dx + dy * dy) / 2);
  }
  return v + 0.03 * Math.sin(x / 37) * Math.cos(y / 29);
}

export function drawTopo(canvas) {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (!w || !h) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (canvas.width === Math.round(w * dpr) && canvas.height === Math.round(h * dpr) && canvas.dataset.drawn) return;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.dataset.drawn = '1';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const color = getComputedStyle(canvas).color;
  const step = 6;
  const cols = Math.ceil(w / step) + 1;
  const rows = Math.ceil(h / step) + 1;
  const g = new Float32Array(cols * rows);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) g[j * cols + i] = field(i * step, j * step, w, h);
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  for (let k = 1; k <= 22; k++) {
    const lv = k * 0.055;
    ctx.lineWidth = k % 5 === 0 ? 1.6 : 0.8;
    ctx.globalAlpha = k % 5 === 0 ? 0.55 : 0.32;
    ctx.beginPath();
    for (let j = 0; j < rows - 1; j++) {
      for (let i = 0; i < cols - 1; i++) {
        const a = g[j * cols + i], b = g[j * cols + i + 1], c = g[(j + 1) * cols + i + 1], d = g[(j + 1) * cols + i];
        const idx = (a > lv ? 8 : 0) | (b > lv ? 4 : 0) | (c > lv ? 2 : 0) | (d > lv ? 1 : 0);
        if (idx === 0 || idx === 15) continue;
        const x = i * step, y = j * step;
        const t = (p, q) => (lv - p) / (q - p || 1e-6);
        const top = [x + step * t(a, b), y];
        const right = [x + step, y + step * t(b, c)];
        const bottom = [x + step * t(d, c), y + step];
        const left = [x, y + step * t(a, d)];
        const segs = {
          1: [[left, bottom]], 2: [[bottom, right]], 3: [[left, right]], 4: [[top, right]], 5: [[left, top], [bottom, right]],
          6: [[top, bottom]], 7: [[left, top]], 8: [[left, top]], 9: [[top, bottom]], 10: [[top, right], [left, bottom]],
          11: [[top, right]], 12: [[left, right]], 13: [[bottom, right]], 14: [[left, bottom]],
        }[idx];
        for (const [p, q] of segs) {
          ctx.moveTo(p[0], p[1]);
          ctx.lineTo(q[0], q[1]);
        }
      }
    }
    ctx.stroke();
  }
}

export function paintAll(root = document) {
  root.querySelectorAll('canvas.topo').forEach(drawTopo);
}
