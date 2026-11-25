import { RANGES, JUMPS, LIMITS, DEFAULTS, computeTN, rollAttack, hitChance, rollD6, critResult, CRIT_TABLES } from './dice.js';
import * as sfx from './audio.js';

// ---------- Themes ----------
const BODY_THEMES = [
  { id: 'olive', name: 'OLIVE DRAB', color: '#5a5f32' },
  { id: 'navy', name: 'NAVY', color: '#22314f' },
  { id: 'tan', name: 'DESERT TAN', color: '#b89d6b' },
  { id: 'gray', name: 'GUNMETAL', color: '#6a6e70' },
  { id: 'black', name: 'BLACK', color: '#1e1f20' },
];
const LCD_THEMES = [
  { id: 'wht-red', name: 'WHT/RED', fg: '#fff1ea', bg: '#b0221c' },
  { id: 'blk-org', name: 'BLK/ORG', fg: '#1a0d04', bg: '#ff8a1e' },
  { id: 'wht-org', name: 'WHT/ORG', fg: '#fff7ea', bg: '#d9661a' },
  { id: 'amb-blk', name: 'AMB/BLK', fg: '#ffb000', bg: '#140c04' },
  { id: 'grn-blk', name: 'GRN/BLK', fg: '#62ff7e', bg: '#08120a' },
  { id: 'blk-grn', name: 'BLK/GRN', fg: '#1d2913', bg: '#9db278' },
  { id: 'cyn-blu', name: 'CYN/BLU', fg: '#a8ecff', bg: '#0b2a6a' },
];

// ---------- Controls ----------
const signed = (v) => (v > 0 ? `+${v}` : v < 0 ? `−${-v}` : '0');
const CONTROLS = [
  { key: 'skill', label: 'SKILL', fmt: (v) => String(v), repeat: true },
  { key: 'range', label: 'RNG', fmt: (v) => RANGES[v].id },
  { key: 'tmm', label: 'TMM', fmt: (v) => String(v), repeat: true },
  {
    key: 'jump',
    label: 'JUMP?',
    wrap: true,
    fmt: (v) => {
      const j = JUMPS[v];
      return `<span class="jump"><span>YOU:${j.you ? 'Y' : 'N'}</span><span>TGT:${j.tgt ? 'Y' : 'N'}</span></span>`;
    },
  },
  { key: 'cover', label: 'COVER', fmt: (v) => `+${v}`, repeat: true },
  { key: 'other', label: 'OTHER', fmt: signed, repeat: true },
  { key: 'dice', label: 'DICE', fmt: (v) => String(v), repeat: true },
];

// ---------- State ----------
let state = { ...DEFAULTS };
let rollId = 0;
let rolling = false;
let skipAnim = false;
let lastDiceCount = 0;
let critPending = false; // natural 12 rolled: next FIRE rolls on the crit table
let critTable = 'mech';
let critSumValue = null;

const $ = (id) => document.getElementById(id);
const els = {
  lcdSetup: $('lcdSetup'),
  lcdFire: $('lcdFire'),
  lcdMsg: $('lcdMsg'),
  lcdCrit: $('lcdCrit'),
  critStatus: $('critStatus'),
  critDice: $('critDice'),
  critSum: $('critSum'),
  critBig: $('critBig'),
  critFull: $('critFull'),
  critTbl: $('critTbl'),
  btnVic: $('btnVic'),
  btnFire: $('btnFire'),
  lcdRow: $('lcdRow'),
  lcdStatus: $('lcdStatus'),
  fireStatus: $('fireStatus'),
  diceGrid: $('diceGrid'),
  hitNum: $('hitNum'),
  hitOf: $('hitOf'),
  critTag: $('critTag'),
  controls: $('controls'),
  led: $('led'),
  cfg: $('cfg'),
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Prefs ----------
const PREF_KEY = 'targeting-solution-prefs';
function loadPrefs() {
  try {
    return JSON.parse(localStorage.getItem(PREF_KEY)) || {};
  } catch {
    return {};
  }
}
function savePrefs() {
  try {
    localStorage.setItem(
      PREF_KEY,
      JSON.stringify({ body: document.body.dataset.body, lcd: document.body.dataset.lcd, sound: sfx.isSoundEnabled() })
    );
  } catch {
    /* storage unavailable */
  }
}

// ---------- Build UI ----------
const valueCells = {};
function buildControls() {
  for (const c of CONTROLS) {
    const cell = document.createElement('div');
    cell.className = 'lcd-cell';
    els.lcdRow.appendChild(cell);
    valueCells[c.key] = cell;

    const col = document.createElement('div');
    col.className = 'ctl';
    col.innerHTML = `
      <div class="ctl-label">${c.label}</div>
      <div class="ctl-well">
        <button class="arrow up" type="button" aria-label="${c.label} up"><svg viewBox="0 0 14 8" shape-rendering="crispEdges"><path d="M6 0h2v1h1v1h1v1h1v1h1v1h1v1h1v2H0V6h1V5h1V4h1V3h1V2h1V1h1z"/></svg></button>
        <button class="arrow down" type="button" aria-label="${c.label} down"><svg viewBox="0 0 14 8" shape-rendering="crispEdges"><path d="M0 0h14v2h-1v1h-1v1h-1v1h-1v1H9v1H8v1H6V7H5V6H4V5H3V4H2V3H1V2H0z"/></svg></button>
      </div>`;
    els.controls.appendChild(col);
    bindArrow(col.querySelector('.up'), c, +1);
    bindArrow(col.querySelector('.down'), c, -1);
  }
}

function bindArrow(btn, ctl, dir) {
  let delayT = null;
  let repT = null;
  const stop = () => {
    clearTimeout(delayT);
    clearInterval(repT);
    btn.classList.remove('pressed');
  };
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    sfx.unlockAudio();
    btn.classList.add('pressed');
    step(ctl, dir);
    if (ctl.repeat) {
      delayT = setTimeout(() => {
        repT = setInterval(() => step(ctl, dir), 110);
      }, 420);
    }
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => btn.addEventListener(ev, stop));
}

function step(ctl, dir) {
  const { min, max } = LIMITS[ctl.key];
  let v = state[ctl.key] + dir;
  if (ctl.wrap) v = v > max ? min : v < min ? max : v;
  else v = Math.max(min, Math.min(max, v));
  const changed = v !== state[ctl.key];
  state[ctl.key] = v;
  sfx.sfxKey(changed ? (dir > 0 ? 1.12 : 0.9) : 0.6);
  cancelRoll(); // also clears a pending crit check
  showSetup();
  renderSetup();
  if (changed) blink(valueCells[ctl.key]);
}

function blink(el) {
  el.classList.remove('blink');
  void el.offsetWidth;
  el.classList.add('blink');
}

// ---------- Setup view ----------
function renderSetup() {
  for (const c of CONTROLS) valueCells[c.key].innerHTML = c.fmt(state[c.key]);
  const tn = computeTN(state);
  const p = hitChance(tn);
  const tnText = tn > 12 ? `<span class="warn">TN ${tn} NO SHOT</span>` : `TN ${Math.max(tn, 2)}`;
  const exp = (p * state.dice).toFixed(1);
  els.lcdStatus.innerHTML = `<span>${tnText}</span><span>P/SHOT ${Math.round(p * 100)}%</span><span>EXP ${exp} HIT</span><span class="ready">${tn > 12 ? '' : 'READY'}</span>`;
}

function showSetup() {
  els.lcdSetup.hidden = false;
  els.lcdFire.hidden = true;
  els.lcdMsg.hidden = true;
  els.lcdCrit.hidden = true;
}

function setCritPending(on) {
  critPending = on;
  els.btnFire.classList.toggle('strobe', on);
}

// ---------- Fire view ----------
const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

function makeDie() {
  const d = document.createElement('div');
  d.className = 'die';
  for (let i = 0; i < 9; i++) d.appendChild(document.createElement('i'));
  return d;
}
function setFace(die, face) {
  const on = PIPS[face] || [];
  die.querySelectorAll('i').forEach((p, i) => p.classList.toggle('on', on.includes(i)));
}

function buildGrid(n) {
  const g = els.diceGrid;
  g.innerHTML = '';
  const rows = n <= 8 ? 1 : 2;
  const cols = Math.ceil(n / rows);
  g.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  g.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
  g.classList.toggle('two-row', rows === 2);
  const cells = [];
  for (let i = 0; i < n; i++) {
    const shot = document.createElement('div');
    shot.className = 'shot idle';
    const a = makeDie();
    const b = makeDie();
    const sum = document.createElement('div');
    sum.className = 'sum';
    sum.textContent = '--';
    shot.append(a, b, sum);
    g.appendChild(shot);
    cells.push({ shot, a, b, sum });
  }
  sizeGrid(n);
  lastDiceCount = n;
  return cells;
}

function sizeGrid(n) {
  const g = els.diceGrid;
  if (!n) return;
  const rows = n <= 8 ? 1 : 2;
  const cols = Math.ceil(n / rows);
  const r = g.getBoundingClientRect();
  if (!r.width) return;
  const cellW = r.width / cols;
  const cellH = r.height / rows;
  const labelH = Math.max(12, Math.min(22, cellH * 0.24));
  // one row: dice stacked vertically; two rows: each pair side by side
  const byW = rows === 1 ? cellW * 0.72 : (cellW * 0.86) / 2.15;
  // account for the gaps between the dice and the sum label
  const byH = rows === 1 ? (cellH - labelH - 10) / 2.3 : (cellH - labelH - 6) / 1.12;
  const size = Math.max(10, Math.floor(Math.min(byW, byH, 52)));
  g.style.setProperty('--die', `${size}px`);
  g.style.setProperty('--sum', `${Math.floor(labelH)}px`);
}

async function fire() {
  sfx.unlockAudio();
  sfx.sfxBigKey();
  if (rolling) {
    skipAnim = true; // second press fast-forwards
    return;
  }
  if (critPending) {
    critCheck();
    return;
  }
  const tn = computeTN(state);
  if (tn > 12) {
    noShot(tn);
    return;
  }
  const n = state.dice;
  const result = rollAttack(tn, n);
  const id = ++rollId;
  rolling = true;
  skipAnim = false;

  els.lcdSetup.hidden = true;
  els.lcdMsg.hidden = true;
  els.lcdCrit.hidden = true;
  els.lcdFire.hidden = false;
  els.critTag.classList.remove('crit-on');
  els.fireStatus.innerHTML = `<span>TN=${Math.max(tn, 2)}</span><span>DICE=${n}</span><span class="ready blinkslow">FIRING</span>`;
  els.hitNum.textContent = '0';
  els.hitOf.textContent = `/${n}`;
  const cells = buildGrid(n);
  els.led.className = 'led busy';

  sfx.sfxFire();
  await sleep(180);
  if (id !== rollId) return;

  const spin = Math.max(150, Math.min(420, 2200 / n));
  let hits = 0;
  for (let i = 0; i < n; i++) {
    const c = cells[i];
    const shot = result.shots[i];
    c.shot.classList.remove('idle');
    c.shot.classList.add('rolling');
    let t = 0;
    while (t < spin && !skipAnim) {
      setFace(c.a, 1 + Math.floor(Math.random() * 6));
      setFace(c.b, 1 + Math.floor(Math.random() * 6));
      c.sum.textContent = String(2 + Math.floor(Math.random() * 11)).padStart(2, '0');
      sfx.sfxTick();
      await sleep(42);
      if (id !== rollId) return;
      t += 42;
    }
    setFace(c.a, shot.d1);
    setFace(c.b, shot.d2);
    c.sum.textContent = String(shot.sum);
    c.shot.classList.remove('rolling');
    c.shot.classList.add(shot.hit ? 'hit' : 'miss');
    if (shot.natural12) c.shot.classList.add('nat12');
    if (shot.hit) {
      hits++;
      els.hitNum.textContent = String(hits);
      blink(els.hitNum);
    }
    if (!skipAnim) {
      sfx.sfxLand(shot.hit);
      await sleep(70);
      if (id !== rollId) return;
    }
  }

  rolling = false;
  els.led.className = 'led ' + (hits ? 'good' : 'bad');
  els.fireStatus.innerHTML = `<span>TN=${Math.max(tn, 2)}</span><span>DICE=${n}</span><span class="ready">${hits ? 'ON TARGET' : 'MISSED'}</span>`;
  sfx.sfxDone(hits, n);
  if (result.crit) {
    els.critTag.classList.add('crit-on');
    setCritPending(true);
    sfx.sfxCrit();
  }
}

// ---------- Crit check ----------
async function critCheck() {
  setCritPending(false);
  const id = ++rollId;
  rolling = true;
  skipAnim = false;
  critTable = 'mech'; // default table each check
  critSumValue = null;
  renderCritTable();

  els.lcdSetup.hidden = true;
  els.lcdFire.hidden = true;
  els.lcdMsg.hidden = true;
  els.lcdCrit.hidden = false;
  els.critStatus.innerHTML = `<span>CRITICAL HIT</span><span>2D6</span><span class="ready blinkslow">ROLLING</span>`;
  els.critBig.className = 'crit-big';
  els.critBig.textContent = '';
  els.critFull.textContent = '';
  const roll = els.critDice.parentElement;
  roll.classList.add('idle');
  els.critDice.innerHTML = '';
  const a = makeDie();
  const b = makeDie();
  els.critDice.append(a, b);
  els.critDice.classList.add('rolling');
  els.led.className = 'led busy';

  const d1 = rollD6();
  const d2 = rollD6();
  sfx.sfxFire();
  let t = 0;
  while (t < 900 && !skipAnim) {
    setFace(a, 1 + Math.floor(Math.random() * 6));
    setFace(b, 1 + Math.floor(Math.random() * 6));
    els.critSum.textContent = String(2 + Math.floor(Math.random() * 11)).padStart(2, '0');
    sfx.sfxTick();
    await sleep(42);
    if (id !== rollId) return;
    t += 42;
  }
  setFace(a, d1);
  setFace(b, d2);
  els.critDice.classList.remove('rolling');
  roll.classList.remove('idle');
  els.critSum.textContent = String(d1 + d2);
  critSumValue = d1 + d2;
  rolling = false;
  els.critStatus.innerHTML = `<span>CRITICAL HIT</span><span>2D6</span><span class="ready">RESULT</span>`;
  const r = renderCritResult();
  els.led.className = 'led ' + (r.none ? 'good' : 'bad');
  if (r.kill) sfx.sfxError();
  else sfx.sfxLand(!r.none);
}

function renderCritTable() {
  els.btnVic.classList.toggle('on', critTable === 'vehicle');
  els.critTbl.textContent = CRIT_TABLES[critTable].name;
}

function renderCritResult() {
  const r = critResult(critSumValue, critTable);
  els.critBig.textContent = r.label;
  els.critBig.className = 'crit-big' + (r.none ? ' none' : '') + (r.kill ? ' kill' : '');
  els.critFull.textContent = r.full;
  blink(els.critBig);
  return r;
}

function toggleVehicle() {
  critTable = critTable === 'mech' ? 'vehicle' : 'mech';
  sfx.sfxKey(critTable === 'vehicle' ? 1.12 : 0.9);
  renderCritTable();
  if (critSumValue !== null) renderCritResult();
}

function cancelRoll() {
  setCritPending(false);
  rollId++;
  rolling = false;
  els.led.className = 'led';
}

function noShot(tn) {
  sfx.sfxError();
  els.lcdSetup.hidden = true;
  els.lcdFire.hidden = true;
  els.lcdMsg.hidden = false;
  els.lcdMsg.innerHTML = `<div class="msg-big blinkfast">NO SHOT</div><div class="msg-small">TN ${tn} &gt; 12 &middot; AUTOMATIC MISS</div>`;
  els.led.className = 'led bad';
}

function reset() {
  sfx.unlockAudio();
  sfx.sfxBigKey();
  cancelRoll();
  state = { ...DEFAULTS };
  showSetup();
  renderSetup();
  Object.values(valueCells).forEach(blink);
}

// ---------- Options ----------
function buildOptions() {
  const bodyWrap = $('bodySwatches');
  for (const t of BODY_THEMES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch body-swatch';
    b.dataset.id = t.id;
    b.innerHTML = `<span class="chip" style="background:${t.color}"></span><span class="sw-name">${t.name}</span>`;
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      sfx.unlockAudio();
      sfx.sfxKey();
      document.body.dataset.body = t.id;
      markSwatches();
      savePrefs();
    });
    bodyWrap.appendChild(b);
  }
  const lcdWrap = $('lcdSwatches');
  for (const t of LCD_THEMES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch lcd-swatch';
    b.dataset.id = t.id;
    b.innerHTML = `<span class="mini" style="background:${t.bg};color:${t.fg}">88</span><span class="sw-name">${t.name}</span>`;
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      sfx.unlockAudio();
      sfx.sfxKey();
      document.body.dataset.lcd = t.id;
      markSwatches();
      savePrefs();
    });
    lcdWrap.appendChild(b);
  }
  $('btnSound').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    sfx.unlockAudio();
    sfx.setSoundEnabled(!sfx.isSoundEnabled());
    sfx.sfxKey();
    markSwatches();
    savePrefs();
  });
  const openCfg = (e) => {
    e.preventDefault();
    sfx.unlockAudio();
    sfx.sfxKey(0.8);
    markSwatches();
    els.cfg.hidden = false;
  };
  const closeCfg = (e) => {
    e.preventDefault();
    sfx.sfxKey(0.8);
    els.cfg.hidden = true;
  };
  $('btnCfg').addEventListener('pointerdown', openCfg);
  $('btnCfgClose').addEventListener('pointerdown', closeCfg);
  els.cfg.addEventListener('pointerdown', (e) => {
    if (e.target === els.cfg) closeCfg(e);
  });
}

function markSwatches() {
  document.querySelectorAll('.body-swatch').forEach((b) => b.classList.toggle('active', b.dataset.id === document.body.dataset.body));
  document.querySelectorAll('.lcd-swatch').forEach((b) => b.classList.toggle('active', b.dataset.id === document.body.dataset.lcd));
  const s = $('btnSound');
  s.textContent = sfx.isSoundEnabled() ? 'SOUND: ON' : 'SOUND: OFF';
  s.classList.toggle('active', sfx.isSoundEnabled());
}

// ---------- Big keys ----------
function bindBigKey(el, fn) {
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    el.classList.add('pressed');
    fn();
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => el.addEventListener(ev, () => el.classList.remove('pressed')));
}

// ---------- Init ----------
function init() {
  const prefs = loadPrefs();
  if (BODY_THEMES.some((t) => t.id === prefs.body)) document.body.dataset.body = prefs.body;
  if (LCD_THEMES.some((t) => t.id === prefs.lcd)) document.body.dataset.lcd = prefs.lcd;
  if (prefs.sound === false) sfx.setSoundEnabled(false);

  buildControls();
  buildOptions();
  renderSetup();
  bindBigKey($('btnFire'), fire);
  bindBigKey($('btnReset'), reset);
  bindBigKey(els.btnVic, toggleVehicle);

  sfx.installAudioUnlock();
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  window.addEventListener('resize', () => sizeGrid(lastDiceCount));

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

init();
