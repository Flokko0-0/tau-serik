// Датчики браузера для режима «В горах»: акселерометр, микрофон, распознавание речи, GPS, батарея
import { FallDetector, SoundDetector, matchCodeWord } from './detect.js';

export const status = {
  fall: 'off', sound: 'off', speech: 'off', gps: 'off', wake: 'off',
  g: 1, db: -90, heard: '', battery: null, charging: false,
};

let fall = null;
let sound = null;
let audio = null;
let rec = null;
let recWanted = false;
let watchId = null;
let wakeLock = null;
let h = {};
let active = false;

function onMotion(e) {
  const a = e.accelerationIncludingGravity;
  if (!a || a.x == null) return;
  const g = Math.hypot(a.x, a.y, a.z) / 9.81;
  status.g = g;
  fall?.feed(g, e.timeStamp || performance.now());
}

async function startFall(sensitivity) {
  if (!('DeviceMotionEvent' in window)) return (status.fall = 'unsupported');
  try {
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
      const r = await DeviceMotionEvent.requestPermission();
      if (r !== 'granted') return (status.fall = 'denied');
    }
  } catch {
    return (status.fall = 'denied');
  }
  fall = new FallDetector({ sensitivity, onFall: (e) => h.onFall?.(e) });
  window.addEventListener('devicemotion', onMotion);
  status.fall = 'on';
  // На ноутбуке событие есть, но данных нет: через 3 секунды проверим
  setTimeout(() => {
    if (status.fall === 'on' && status.g === 1) status.fall = 'nodata';
  }, 3000);
}

async function startSound() {
  if (!navigator.mediaDevices?.getUserMedia) return (status.sound = 'unsupported');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const src = ctx.createMediaStreamSource(stream);
    const an = ctx.createAnalyser();
    an.fftSize = 2048;
    an.smoothingTimeConstant = 0.2;
    src.connect(an);
    const time = new Float32Array(an.fftSize);
    const freq = new Float32Array(an.frequencyBinCount);
    const hz = ctx.sampleRate / an.fftSize;
    sound = new SoundDetector({ onScream: (e) => h.onScream?.(e), onImpact: (e) => h.onImpact?.(e) });
    const id = setInterval(() => {
      an.getFloatTimeDomainData(time);
      let sum = 0;
      for (const v of time) sum += v * v;
      const db = 10 * Math.log10(sum / time.length + 1e-12);
      an.getFloatFrequencyData(freq);
      let band = 0;
      let all = 0;
      for (let i = 1; i < freq.length; i++) {
        const f = i * hz;
        if (f < 80 || f > 8000) continue;
        const p = 10 ** (freq[i] / 10);
        all += p;
        if (f >= 300 && f <= 3500) band += p;
      }
      status.db = db;
      sound.feed({ db, voiced: all ? band / all : 0, t: performance.now() });
    }, 50);
    audio = { stream, ctx, id };
    status.sound = 'on';
  } catch {
    status.sound = 'denied';
  }
}

function startSpeech(words) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return (status.speech = 'unsupported');
  rec = new SR();
  rec.lang = 'ru-RU';
  rec.continuous = true;
  rec.interimResults = true;
  recWanted = true;
  rec.onresult = (e) => {
    const text = [...e.results].slice(e.resultIndex).map((r) => r[0].transcript).join(' ');
    status.heard = text.trim().slice(-60);
    const hit = matchCodeWord(text, words);
    if (hit) h.onCodeWord?.(hit, text);
  };
  rec.onerror = (e) => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      recWanted = false;
      status.speech = 'denied';
    }
  };
  rec.onend = () => {
    if (recWanted) setTimeout(() => { try { rec.start(); } catch {} }, 300);
  };
  try {
    rec.start();
    status.speech = 'on';
  } catch {
    status.speech = 'denied';
  }
}

function startGps() {
  if (!navigator.geolocation) return (status.gps = 'unsupported');
  status.gps = 'search';
  watchId = navigator.geolocation.watchPosition(
    (p) => {
      status.gps = 'on';
      h.onPos?.({ lat: p.coords.latitude, lon: p.coords.longitude, acc: Math.round(p.coords.accuracy), alt: p.coords.altitude != null ? Math.round(p.coords.altitude) : null, t: Date.now(), src: 'gps' });
    },
    (err) => {
      status.gps = err.code === 1 ? 'denied' : 'search';
    },
    { enableHighAccuracy: true, maximumAge: 15000, timeout: 30000 },
  );
}

async function startBattery() {
  try {
    const b = await navigator.getBattery?.();
    if (!b) return;
    const upd = () => {
      status.battery = Math.round(b.level * 100);
      status.charging = b.charging;
      h.onBattery?.(status.battery, b.charging);
    };
    b.addEventListener('levelchange', upd);
    b.addEventListener('chargingchange', upd);
    upd();
  } catch {}
}

async function keepAwake() {
  try {
    wakeLock = await navigator.wakeLock?.request('screen');
    if (wakeLock) {
      status.wake = 'on';
      wakeLock.addEventListener('release', () => (status.wake = 'off'));
    }
  } catch {
    status.wake = 'off';
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && active && h.wakeWanted && status.wake !== 'on') keepAwake();
});

// Вызывать из обработчика нажатия: браузеры спрашивают разрешения только по жесту пользователя
export async function startMountain(settings, handlers) {
  h = { ...handlers, wakeWanted: settings.wakeLock };
  active = true;
  const jobs = [];
  if (settings.fall) jobs.push(startFall(settings.sensitivity));
  if (settings.scream) jobs.push(startSound());
  jobs.push(Promise.resolve(startGps()));
  jobs.push(startBattery());
  if (settings.wakeLock) jobs.push(keepAwake());
  await Promise.all(jobs);
  if (settings.codeword) startSpeech(settings.codeWords);
  return status;
}

export function stopMountain() {
  active = false;
  window.removeEventListener('devicemotion', onMotion);
  fall = null;
  if (audio) {
    clearInterval(audio.id);
    audio.stream.getTracks().forEach((t) => t.stop());
    audio.ctx.close();
    audio = null;
  }
  sound = null;
  recWanted = false;
  try { rec?.stop(); } catch {}
  rec = null;
  if (watchId != null) navigator.geolocation.clearWatch(watchId);
  watchId = null;
  try { wakeLock?.release(); } catch {}
  wakeLock = null;
  h.wakeWanted = false;
  Object.assign(status, { fall: 'off', sound: 'off', speech: 'off', gps: 'off', wake: 'off', g: 1, db: -90, heard: '' });
}

export function locateOnce() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude, acc: Math.round(p.coords.accuracy), alt: p.coords.altitude != null ? Math.round(p.coords.altitude) : null, t: Date.now(), src: 'gps' }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  });
}
