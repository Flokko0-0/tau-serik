// Звук: сирена, сигнал «вы в порядке?», горный сигнал бедствия, метроном для СЛР
let ctx = null;
let master = null;
let current = null;
let nodes = new Set();

function track(o) {
  nodes.add(o);
  o.onended = () => nodes.delete(o);
}

export function unlockAudio() {
  try {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      const comp = ctx.createDynamicsCompressor();
      master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(comp).connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
  } catch {
    ctx = null;
  }
  return !!ctx;
}

function tone(freq, start, dur, type = 'square', vol = 0.6) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(vol, start + 0.01);
  g.gain.setValueAtTime(vol, start + dur - 0.02);
  g.gain.linearRampToValueAtTime(0, start + dur);
  o.connect(g).connect(master);
  o.start(start);
  o.stop(start + dur + 0.05);
  track(o);
  return o;
}

export function stop() {
  if (current) {
    current.stop();
    current = null;
  }
  nodes.forEach((o) => {
    try {
      o.stop();
    } catch {}
  });
  nodes = new Set();
}

export const playing = () => current?.kind ?? null;

function loop(kind, period, schedule) {
  stop();
  if (!unlockAudio()) return;
  let next = ctx.currentTime + 0.05;
  const tick = () => {
    while (next < ctx.currentTime + 0.6) {
      schedule(next);
      next += period;
    }
  };
  tick();
  const id = setInterval(tick, 200);
  current = { kind, stop: () => clearInterval(id) };
}

// Вопрос «Вы в порядке?»: тройной писк раз в секунду
export const beeps = () => loop('beeps', 1, (t) => [0, 0.16, 0.32].forEach((d) => tone(1760, t + d, 0.1, 'square', 0.5)));

// Сирена: вой вверх-вниз
export function siren() {
  loop('siren', 1.2, (t) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(620, t);
    o.frequency.linearRampToValueAtTime(1450, t + 0.6);
    o.frequency.linearRampToValueAtTime(620, t + 1.2);
    g.gain.setValueAtTime(0.55, t);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + 1.2);
    track(o);
  });
}

// Горный сигнал бедствия: 6 сигналов в минуту, затем минута тишины. Экономит заряд.
export const distress = () => loop('distress', 120, (t) => {
  for (let i = 0; i < 6; i++) tone(3150, t + i * 10, 1.4, 'sine', 0.8);
});

export const metronome = (bpm = 110) => loop('metronome', 60 / bpm, (t) => tone(1000, t, 0.05, 'square', 0.45));
