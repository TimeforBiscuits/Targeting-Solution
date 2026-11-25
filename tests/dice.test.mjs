import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeTN, DEFAULTS, rollD6, resolveShot, rollAttack, hitChance } from '../js/dice.js';

test('design-doc example: TN 9', () => {
  // SKILL 4, MED (+2), TMM 1, target jumped (+1), cover +1
  assert.equal(computeTN({ ...DEFAULTS, tmm: 1, jump: 2, cover: 1, dice: 4 }), 9);
});

test('defaults: skill 4 + MED 2 + TMM 1 = 7', () => {
  assert.equal(computeTN(DEFAULTS), 7);
});

test('jump permutations', () => {
  assert.equal(computeTN({ ...DEFAULTS, jump: 1 }) - computeTN(DEFAULTS), 2);
  assert.equal(computeTN({ ...DEFAULTS, jump: 3 }) - computeTN(DEFAULTS), 3);
});

test('hit rules', () => {
  assert.equal(resolveShot(4, 4, 9).hit, false);
  assert.equal(resolveShot(5, 4, 9).hit, true);
  assert.equal(resolveShot(6, 6, 13).hit, false); // TN > 12 auto miss
  assert.equal(resolveShot(6, 6, 12).natural12, true);
  assert.equal(resolveShot(1, 1, 0).hit, true);
});

test('MAR: one roll per die, crit flagged once', () => {
  const faces = [6, 6, 6, 6, 1, 1];
  let i = 0;
  const r = rollAttack(8, 3, () => faces[i++]);
  assert.equal(r.shots.length, 3);
  assert.equal(r.hits, 2);
  assert.equal(r.crit, true);
});

test('hitChance matches 2D6 table', () => {
  assert.equal(hitChance(7), 21 / 36);
  assert.equal(hitChance(2), 1);
  assert.equal(hitChance(12), 1 / 36);
  assert.equal(hitChance(13), 0);
});

test('d6 is uniform and 2D6 follows the bell curve', () => {
  const N = 600000;
  const faces = new Array(7).fill(0);
  const sums = new Array(13).fill(0);
  for (let k = 0; k < N; k++) {
    const a = rollD6();
    const b = rollD6();
    faces[a]++;
    sums[a + b]++;
  }
  for (let f = 1; f <= 6; f++) assert.ok(Math.abs(faces[f] / N - 1 / 6) < 0.004, `face ${f}`);
  const ways = [0, 0, 1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1];
  // chi-square, 10 dof; 99.9% critical value ~29.6
  let chi = 0;
  for (let s = 2; s <= 12; s++) {
    const exp = (N * ways[s]) / 36;
    chi += (sums[s] - exp) ** 2 / exp;
  }
  assert.ok(chi < 29.6, `chi-square ${chi.toFixed(2)}`);
});
