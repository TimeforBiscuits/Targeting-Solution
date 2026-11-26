// Core rules + dice engine for Targeting Solution.
// Rules source: Alpha Strike Commander's Edition — Weapon Attacks (S.A.T.O.R.)
// and the optional Multiple Attack Rolls rule (p. 175).

export const RANGES = [
  { id: 'SHT', name: 'SHORT', mod: 0 },
  { id: 'MED', name: 'MEDIUM', mod: 2 },
  { id: 'LNG', name: 'LONG', mod: 4 },
];

// Attacker jumped: +2 (attacker movement modifier).
// Target jumped: +1 (added to the target movement modifier).
export const JUMPS = [
  { you: false, tgt: false, mod: 0 },
  { you: true, tgt: false, mod: 2 },
  { you: false, tgt: true, mod: 1 },
  { you: true, tgt: true, mod: 3 },
];

export const LIMITS = {
  skill: { min: 0, max: 5 },
  range: { min: 0, max: RANGES.length - 1 },
  tmm: { min: 0, max: 5 },
  jump: { min: 0, max: JUMPS.length - 1 },
  cover: { min: 0, max: 3 },
  other: { min: -4, max: 6 },
  dice: { min: 1, max: 15 },
  jmps: { min: 0, max: 4 },
  jmpw: { min: 0, max: 4 },
  idf: { min: 0, max: 2 },
};

export const DEFAULTS = Object.freeze({
  skill: 4,
  range: 1, // MED
  tmm: 1,
  jump: 0, // YOU:N TGT:N
  cover: 0,
  other: 0,
  dice: 1,
  jmps: 0, // Strong Jump Jets (JMPS#), 0 = none
  jmpw: 0, // Weak Jump Jets (JMPW#), 0 = none
  idf: 0, // Indirect fire: 0 off, 1 = +1, 2 = +2 (spotter also attacked)
});

// JMPS#/JMPW# add/subtract # from the target's TMM, but only when the target
// used jumping movement (Special Abilities: Jump Jets, Weak or Strong).
export function jumpJetMod(s) {
  return JUMPS[s.jump].tgt ? (s.jmps || 0) - (s.jmpw || 0) : 0;
}

// Indirect fire: +1, or +2 if the spotter made a weapon attack this turn.
export function indirectMod(s) {
  return s.idf || 0;
}

export function computeTN(s) {
  return (
    s.skill + RANGES[s.range].mod + s.tmm + JUMPS[s.jump].mod + s.cover + s.other + jumpJetMod(s) + indirectMod(s)
  );
}

// Uniform integer 1..6 from a cryptographic source. Rejection sampling
// removes modulo bias, so every face has exactly 1/6 probability.
const buf = new Uint8Array(16);
let bufPos = buf.length;
function randomByte() {
  if (bufPos >= buf.length) {
    globalThis.crypto.getRandomValues(buf);
    bufPos = 0;
  }
  return buf[bufPos++];
}
export function rollD6() {
  let x;
  do {
    x = randomByte();
  } while (x >= 252); // 252 = 6 * 42
  return (x % 6) + 1;
}

// A single attack roll: two independent d6 summed — the genuine 2D6 bell curve.
export function resolveShot(d1, d2, tn) {
  const sum = d1 + d2;
  const hit = tn <= 12 && sum >= tn; // TN > 12 always misses; 12 is not an auto-hit
  return { d1, d2, sum, hit, natural12: hit && sum === 12 };
}

export function rollAttack(tn, dice, roll = rollD6) {
  const shots = [];
  for (let i = 0; i < dice; i++) shots.push(resolveShot(roll(), roll(), tn));
  const hits = shots.filter((s) => s.hit).length;
  // MAR: Natural 12 yields at most one critical hit per target.
  const crit = shots.some((s) => s.natural12);
  return { tn, shots, hits, crit };
}

// Exact chance that one 2D6 roll meets the TN.
export function hitChance(tn) {
  if (tn > 12) return 0;
  let ways = 0;
  for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) if (a + b >= tn) ways++;
  return ways / 36;
}

// Determining Critical Hits Table (Alpha Strike CE). [short LCD label, full name]
const NO_CRIT = ['NO CRIT', 'NO CRITICAL HIT'];
export const CRIT_TABLES = {
  mech: {
    name: "'MECH",
    rows: {
      2: ['AMMO', 'AMMO HIT'],
      3: ['ENG', 'ENGINE HIT'],
      4: ['FIRE', 'FIRE CONTROL HIT'],
      5: NO_CRIT,
      6: ['WEPS', 'WEAPON HIT'],
      7: ['MP', 'MP HIT'],
      8: ['WEPS', 'WEAPON HIT'],
      9: NO_CRIT,
      10: ['FIRE', 'FIRE CONTROL HIT'],
      11: ['ENG', 'ENGINE HIT'],
      12: ['KILL', 'UNIT DESTROYED'],
    },
  },
  vehicle: {
    name: 'VEHICLE',
    rows: {
      2: ['AMMO', 'AMMO HIT'],
      3: ['STUN', 'CREW STUNNED'],
      4: ['FIRE', 'FIRE CONTROL HIT'],
      5: ['FIRE', 'FIRE CONTROL HIT'],
      6: NO_CRIT,
      7: NO_CRIT,
      8: NO_CRIT,
      9: ['WEPS', 'WEAPON HIT'],
      10: ['WEPS', 'WEAPON HIT'],
      11: ['CREW KIA', 'CREW KILLED'],
      12: ['ENG', 'ENGINE HIT'],
    },
  },
};

export function critResult(sum, table = 'mech') {
  const [label, full] = CRIT_TABLES[table].rows[sum];
  return { label, full, none: label === NO_CRIT[0], kill: label === 'KILL' || label === 'CREW KIA' };
}
