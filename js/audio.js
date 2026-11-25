// Synthesized "analogue" sound effects via Web Audio. No sample files.

let ctx = null;
let master = null;
let noiseBuf = null;
let enabled = true;

export function setSoundEnabled(on) {
  enabled = on;
}
export function isSoundEnabled() {
  return enabled;
}

// iOS only unlocks audio from touchend / click (NOT touchstart / pointerdown),
// so listen for those on the whole document, every time, to also recover
// from iOS "interrupted" states (calls, backgrounding, Siri).
let unlocked = false;
export function installAudioUnlock() {
  const kick = () => {
    unlockAudio();
    if (ctx && !unlocked) {
      // Play a silent buffer inside the gesture: this is what actually unlocks iOS.
      const s = ctx.createBufferSource();
      s.buffer = ctx.createBuffer(1, 1, 22050);
      s.connect(ctx.destination);
      s.start(0);
      if (ctx.state === 'running') unlocked = true;
    }
  };
  ['touchend', 'click', 'keydown'].forEach((ev) => document.addEventListener(ev, kick, { capture: true, passive: true }));
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && ctx && ctx.state !== 'running') ctx.resume().catch(() => {});
  });
}

export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.55;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // Play a silent buffer to fully unlock on iOS.
    const s = ctx.createBufferSource();
    s.buffer = ctx.createBuffer(1, 1, 22050);
    s.connect(ctx.destination);
    s.start(0);
  }
  if (ctx.state !== 'running') ctx.resume().catch(() => {});
}

function ready() {
  return enabled && ctx && ctx.state === 'running';
}

function tone({ type = 'square', f0, f1 = f0, t = 0, dur = 0.05, vol = 0.3, attack = 0.002 }) {
  const now = ctx.currentTime + t;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, now);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, now + dur);
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(vol, now + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  o.connect(g).connect(master);
  o.start(now);
  o.stop(now + dur + 0.02);
}

function noise({ t = 0, dur = 0.02, vol = 0.3, freq = 3000, q = 1, type = 'bandpass' }) {
  const now = ctx.currentTime + t;
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, now);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  s.connect(f).connect(g).connect(master);
  s.start(now, Math.random() * 0.4);
  s.stop(now + dur + 0.02);
}

// Crisp chirpy key press.
export function sfxKey(pitch = 1) {
  if (!ready()) return;
  noise({ dur: 0.012, vol: 0.35, freq: 5000, q: 0.7, type: 'highpass' });
  tone({ f0: 2400 * pitch, f1: 1500 * pitch, dur: 0.035, vol: 0.16 });
}

// Heavier clunk for FIRE / RESET.
export function sfxBigKey() {
  if (!ready()) return;
  noise({ dur: 0.03, vol: 0.45, freq: 1800, q: 0.8 });
  tone({ type: 'triangle', f0: 320, f1: 140, dur: 0.07, vol: 0.4 });
  tone({ f0: 1700, f1: 2600, t: 0.02, dur: 0.05, vol: 0.12 });
}

export function sfxFire() {
  if (!ready()) return;
  tone({ type: 'sawtooth', f0: 180, f1: 1400, dur: 0.22, vol: 0.12, attack: 0.01 });
  tone({ f0: 2200, f1: 2200, t: 0.2, dur: 0.04, vol: 0.12 });
}

// One "chitter" tick while a die tumbles.
export function sfxTick() {
  if (!ready()) return;
  const f = 1800 + Math.random() * 2600;
  tone({ f0: f, f1: f * 0.8, dur: 0.012, vol: 0.09 });
  noise({ dur: 0.008, vol: 0.18, freq: 2500 + Math.random() * 3500, q: 4 });
}

export function sfxLand(hit) {
  if (!ready()) return;
  noise({ dur: 0.02, vol: 0.4, freq: 1200, q: 1 });
  if (hit) {
    tone({ f0: 1320, dur: 0.05, vol: 0.16 });
    tone({ f0: 1980, t: 0.05, dur: 0.07, vol: 0.16 });
  } else {
    tone({ f0: 330, f1: 220, dur: 0.08, vol: 0.18 });
  }
}

export function sfxDone(hits, total) {
  if (!ready()) return;
  if (hits === 0) {
    tone({ f0: 196, dur: 0.12, vol: 0.2 });
    tone({ f0: 147, t: 0.13, dur: 0.22, vol: 0.2 });
    return;
  }
  const notes = hits === total ? [1047, 1319, 1568, 2093] : [1047, 1568];
  notes.forEach((f, i) => tone({ f0: f, t: i * 0.07, dur: 0.08, vol: 0.14 }));
}

export function sfxCrit() {
  if (!ready()) return;
  for (let i = 0; i < 6; i++) tone({ f0: i % 2 ? 2600 : 3200, t: 0.35 + i * 0.05, dur: 0.04, vol: 0.1 });
}

export function sfxError() {
  if (!ready()) return;
  tone({ type: 'sawtooth', f0: 110, dur: 0.14, vol: 0.2 });
  tone({ type: 'sawtooth', f0: 110, t: 0.18, dur: 0.22, vol: 0.2 });
}
