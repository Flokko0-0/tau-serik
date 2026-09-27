import { ICONS } from './icons.js';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export const icon = (name, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;

export const RISK_CLASS = ['ok', 'warn', 'high', 'crit'];

export function toast(text, kind = '') {
  const box = document.getElementById('toasts');
  if (!box) return;
  while (box.children.length >= 2) box.firstElementChild.remove();
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.setAttribute('role', 'status');
  el.textContent = text;
  box.append(el);
  setTimeout(() => el.classList.add('out'), 3200);
  setTimeout(() => el.remove(), 3700);
}

export async function copy(text, okMsg = 'Скопировано') {
  try {
    await navigator.clipboard.writeText(text);
    toast(okMsg);
  } catch {
    toast('Не удалось скопировать: выделите текст вручную');
  }
}

export const plural = (n, one, few, many) => {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  return b === 1 ? one : many;
};

export const initials = (name) => name.split(/[\s,]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

export function qrSvg(text) {
  const qr = window.qrcode;
  if (!qr) return '';
  qr.stringToBytes = qr.stringToBytesFuncs['UTF-8'];
  const q = qr(0, 'M');
  q.addData(text, 'Byte');
  q.make();
  return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
}

export function vibrate(pattern) {
  try {
    navigator.vibrate?.(pattern);
  } catch {}
}
