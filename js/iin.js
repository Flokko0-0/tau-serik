// ИИН Казахстана: ГГММДД + цифра века и пола + 4 цифры + контрольная цифра.
const W1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const W2 = [3, 4, 5, 6, 7, 8, 9, 10, 11, 1, 2];

export function checkDigit(first11) {
  const d = [...first11].map(Number);
  let k = d.reduce((s, v, i) => s + v * W1[i], 0) % 11;
  if (k === 10) k = d.reduce((s, v, i) => s + v * W2[i], 0) % 11;
  return k === 10 ? null : k;
}

export function parseIin(raw, now = new Date()) {
  const s = String(raw ?? '').replace(/\D/g, '');
  if (s.length !== 12) return { ok: false, error: 'ИИН состоит из 12 цифр' };
  const d = [...s].map(Number);
  const c = d[6];
  if (c < 1 || c > 6) return { ok: false, error: '7-я цифра ИИН должна быть от 1 до 6' };
  const year = [1800, 1800, 1900, 1900, 2000, 2000][c - 1] + d[0] * 10 + d[1];
  const month = d[2] * 10 + d[3];
  const day = d[4] * 10 + d[5];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return { ok: false, error: 'В ИИН неверная дата рождения' };
  if (date > now) return { ok: false, error: 'Дата рождения в будущем' };
  const k = checkDigit(s.slice(0, 11));
  if (k === null || k !== d[11]) return { ok: false, error: 'Контрольная цифра не сходится. Проверьте ИИН' };
  const birth = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return { ok: true, iin: s, birth, gender: c % 2 ? 'm' : 'f', age: ageOn(birth, now) };
}

export function ageOn(birth, now = new Date()) {
  const [y, m, d] = birth.split('-').map(Number);
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age--;
  return age;
}

export function makeIin(birth, gender, serial = '0000') {
  const [y, m, d] = birth.split('-');
  const c = (Number(y) >= 2000 ? 5 : Number(y) >= 1900 ? 3 : 1) + (gender === 'f' ? 1 : 0);
  const base = y.slice(2) + m + d + c + serial;
  const k = checkDigit(base);
  return k === null ? null : base + k;
}

// Возрастные правила безопасности
export function ageRules(age) {
  if (age < 14) return { group: 'child', maxLevel: 'medium', guardian: true, withAdult: true, company: 'family' };
  if (age < 18) return { group: 'teen', maxLevel: 'medium', guardian: true, withAdult: false, company: 'teen' };
  return { group: 'adult', maxLevel: 'expert', guardian: false, withAdult: false, company: 'adult' };
}
