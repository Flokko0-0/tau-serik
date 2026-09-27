// Детекторы без привязки к браузеру: на вход идут отсчёты, на выход события

const FALL = {
  low: { freeG: 0.4, freeMs: 100, impactG: 2.6, hardG: 3.6 },
  normal: { freeG: 0.5, freeMs: 70, impactG: 2.2, hardG: 3.2 },
  high: { freeG: 0.6, freeMs: 50, impactG: 1.8, hardG: 2.8 },
};

// Падение = свободное падение (|a| около 0) -> удар -> телефон почти неподвижен
export class FallDetector {
  constructor({ onFall, sensitivity = 'normal' } = {}) {
    this.onFall = onFall;
    this.setSensitivity(sensitivity);
    this.reset();
  }

  setSensitivity(s) {
    this.th = FALL[s] || FALL.normal;
  }

  reset() {
    this.freeStart = null;
    this.freeDur = 0;
    this.lastFreeEnd = -1e9;
    this.pending = null;
    this.samples = [];
    this.cooldownUntil = 0;
    this.last = 1;
  }

  feed(g, t) {
    this.last = g;
    this.samples.push([t, g]);
    while (this.samples.length && t - this.samples[0][0] > 2500) this.samples.shift();
    if (t < this.cooldownUntil) return;

    if (this.pending) {
      if (t - this.pending.t >= 1500) {
        const win = this.samples.filter(([ts]) => ts > this.pending.t + 500).map(([, v]) => v);
        const mean = win.reduce((a, b) => a + b, 0) / (win.length || 1);
        const sd = Math.sqrt(win.reduce((a, b) => a + (b - mean) ** 2, 0) / (win.length || 1));
        const p = this.pending;
        this.pending = null;
        if (sd < 0.3 || p.g >= this.th.hardG) this.fire({ ...p, still: sd < 0.3, sd });
      }
      return;
    }

    if (g < this.th.freeG) {
      if (this.freeStart == null) this.freeStart = t;
      this.freeDur = t - this.freeStart;
    } else if (this.freeStart != null) {
      if (this.freeDur >= this.th.freeMs) this.lastFreeEnd = t;
      this.freeStart = null;
    }

    const afterFree = t - this.lastFreeEnd < 1000;
    if ((afterFree && g >= this.th.impactG) || g >= this.th.hardG) {
      this.pending = { t, g, freeMs: afterFree ? Math.round(this.freeDur) : 0, kind: afterFree ? 'fall' : 'impact' };
      this.lastFreeEnd = -1e9;
    }
  }

  fire(e) {
    this.cooldownUntil = e.t + 8000;
    this.onFall?.(e);
  }
}

// Крик = громко, энергия в голосовой полосе, дольше 0,7 с; удар = резкий скачок громкости
export class SoundDetector {
  constructor({ onScream, onImpact, minDb = -26, screamMs = 700 } = {}) {
    Object.assign(this, { onScream, onImpact, minDb, screamMs });
    this.floor = -60;
    this.prev = -90;
    this.runStart = null;
    this.lastLoud = -1e9;
    this.cooldownUntil = 0;
    this.level = -90;
  }

  feed({ db, voiced, t }) {
    this.level = db;
    const loudLine = Math.max(this.minDb, this.floor + 18);
    const loud = db > loudLine;
    if (!loud) this.floor += (db - this.floor) * 0.02;
    if (t >= this.cooldownUntil) {
      if (db - this.prev > 25 && db > loudLine) this.onImpact?.({ t, db });
      if (loud && voiced > 0.55) {
        if (this.runStart == null || t - this.lastLoud > 200) this.runStart = t;
        this.lastLoud = t;
        if (t - this.runStart >= this.screamMs) {
          this.cooldownUntil = t + 8000;
          this.runStart = null;
          this.onScream?.({ t, db, ms: this.screamMs });
        }
      } else if (t - this.lastLoud > 200) {
        this.runStart = null;
      }
    }
    this.prev = db;
  }
}

// Кодовое слово в распознанной речи: без регистра, «ё» = «е», можно частью фразы
export function matchCodeWord(transcript, words) {
  const norm = (s) => s.toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-яәғқңөұүһі0-9 ]/gi, ' ').replace(/\s+/g, ' ').trim();
  const t = ' ' + norm(transcript) + ' ';
  return words.map(norm).filter(Boolean).find((w) => t.includes(' ' + w + ' ') || t.includes(' ' + w)) || null;
}
