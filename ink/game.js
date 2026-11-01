// Ink Brawl — stick-figure duels on a notebook page. Your rival learns how you fight.
// Vanilla JS + Canvas, no build step, no assets: every line is drawn in code.
(() => {
'use strict';

const cv = document.getElementById('game');
const ctx = cv.getContext('2d');
const bg = document.createElement('canvas');
const bctx = bg.getContext('2d');

// ---------- constants ----------
const DT = 1 / 60;
const STAGE = 210;          // half-width of the paper strip (world units)
const GRAV = 1650;
const ROUND_TIME = 60;
const D2R = Math.PI / 180;
const INK = '#18181d';
const PAPER = '#f4ecd8';
const SKEY = 'inkbrawl.v1';

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const rnd = (a, b) => a + Math.random() * (b - a);
const sign = v => v < 0 ? -1 : 1;
const ease = t => 1 - (1 - t) * (1 - t);

let W = 0, H = 0, DPR = 1, K = 1, CX = 0, GY = 0, blastX = 400, blastY = 300;

// ---------- save ----------
let save = { rival: 0, cleared: false, muted: false, tut: false, name: '', xp: 0 };
let paused = false;
try { Object.assign(save, JSON.parse(localStorage.getItem(SKEY) || '{}')); } catch (e) {}
// ---------- player name + rank ----------
const RANKS = [
  [0, 'Doodler'], [150, 'Scribbler'], [400, 'Sketcher'], [800, 'Inker'],
  [1400, 'Penman'], [2200, 'Illustrator'], [3300, 'Master Inker'], [5000, 'Legend of the Page']
];
function rankIdx(xp) { let i = 0; while (i < RANKS.length - 1 && xp >= RANKS[i + 1][0]) i++; return i; }
function rankName(xp) { return RANKS[rankIdx(xp == null ? save.xp : xp)][1]; }
function rankProg() {
  const i = rankIdx(save.xp);
  if (i >= RANKS.length - 1) return { f: 1, cur: save.xp, need: 0 };
  const a = RANKS[i][0], b = RANKS[i + 1][0];
  return { f: (save.xp - a) / (b - a), cur: save.xp - a, need: b - a };
}
function pname() { return (save.name || 'YOU').toUpperCase(); }
let nameCard = null;
let matchXp = 0, rankAtStart = 0, nameOpen = false, nameThenFight = false;
function addXp(n) { n = Math.round(n); if (n <= 0) return; save.xp = (save.xp || 0) + n; matchXp += n; }
function openName(thenFight) {
  const box = document.getElementById('namebox'), inp = document.getElementById('nm');
  if (!box || !inp) { if (!save.name) save.name = 'PLAYER'; if (thenFight) startMatch(save.rival); return; }
  nameOpen = true; nameThenFight = !!thenFight;
  inp.value = save.name || ''; box.style.display = 'flex';
  setTimeout(() => { try { inp.focus(); } catch (e) {} }, 50);
}
function closeName() {
  const box = document.getElementById('namebox'), inp = document.getElementById('nm');
  let v = (inp.value || '').replace(/[^\p{L}\p{N} _.\-]/gu, '').trim().slice(0, 12);
  if (!v) v = save.name || 'PLAYER';
  save.name = v; persist();
  try { inp.blur(); } catch (e) {}
  box.style.display = 'none'; nameOpen = false;
  tL = tR = null;
  if (nameThenFight) { nameThenFight = false; startMatch(save.rival); }
}
function persist() { try { localStorage.setItem(SKEY, JSON.stringify(save)); } catch (e) {} }

// ---------- rivals ----------
const RIVALS = [
  { name: 'Doodle',     col: '#2b5cff', trait: 'Learns slowly',              learn: 0.35, react: 0.34, think: 0.42, aggr: 0.45 },
  { name: 'Scribble',   col: '#e8325f', trait: 'Fast feet',                  learn: 0.45, react: 0.30, think: 0.34, aggr: 0.6, speed: 1.3 },
  { name: 'Blot',       col: '#7a3cff', trait: 'Heavy, hard to launch',      learn: 0.5,  react: 0.30, think: 0.38, aggr: 0.5, weight: 1.45, speed: 0.82 },
  { name: 'Smudge',     col: '#0b9a73', trait: 'Blinks behind you',          learn: 0.55, react: 0.26, think: 0.32, aggr: 0.55, teleport: true },
  { name: 'Quill',      col: '#d98300', trait: 'Parries what it reads',      learn: 0.6,  react: 0.24, think: 0.30, aggr: 0.45, parry: true },
  { name: 'Sketch',     col: '#cf2328', trait: 'Relentless',                 learn: 0.48, react: 0.26, think: 0.27, aggr: 0.75 },
  { name: 'Stencil',    col: '#0f8fbf', trait: 'Copies your favourite move', learn: 0.7,  react: 0.22, think: 0.26, aggr: 0.6, mirror: true },
  { name: 'The Editor', col: '#b5179e', trait: 'Reads everything',           learn: 0.95, react: 0.17, think: 0.22, aggr: 0.65, parry: true, teleport: true, weight: 1.15 }
];

// ---------- moves ----------
// su = startup, ac = active, re = recovery (seconds). base/grow = knockback, ang = launch angle.
const MOVES = {
  jab:   { su: 0.07, ac: 0.07, re: 0.13, dmg: 4,  base: 120, grow: 1.2, ang: 18, limb: 'fh', lunge: 40,  w: 'jabW', s: 'jab',   label: 'JAB' },
  heavy: { su: 0.24, ac: 0.09, re: 0.30, dmg: 11, base: 240, grow: 3.0, ang: 26, limb: 'ff', lunge: 170, w: 'heavyW', s: 'heavy', label: 'KICK' },
  upper: { su: 0.13, ac: 0.10, re: 0.30, dmg: 8,  base: 330, grow: 2.5, ang: 80, limb: 'fh', lunge: 40,  w: 'upW', s: 'up',     label: 'UPPERCUT' },
  sweep: { su: 0.15, ac: 0.10, re: 0.26, dmg: 6,  base: 160, grow: 1.6, ang: 38, limb: 'ff', lunge: 70,  w: 'swW', s: 'sw',     label: 'SWEEP', low: true }
};
const HABIT_LABEL = { jab: 'JAB', heavy: 'KICK', upper: 'UPPERCUT', sweep: 'SWEEP', block: 'BLOCK', jump: 'JUMP', blot: 'INK BLOT' };
// ink special: a thrown blot. Charges by landing hits (and a little by taking them).
const BLOT = { su: 0.2, re: 0.28, speed: 470, y: -66, r: 10, dmg: 13, base: 250, grow: 2.4, ang: 24 };
const INK_FULL = 100;

// ---------- poses (degrees; limbs measured from straight down, + = forward) ----------
const P_ = {
  idle:   { lean: 6,   fa1: 35,  fa2: 105, ba1: 15,  ba2: 125, fl1: 16, fl2: -6,  bl1: -16, bl2: 10 },
  air:    { lean: 4,   fa1: 60,  fa2: 80,  ba1: -20, ba2: 90,  fl1: 55, fl2: -80, bl1: 10,  bl2: -50 },
  jabW:   { lean: 2,   fa1: 20,  fa2: 130, ba1: 15,  ba2: 125, fl1: 18, fl2: -6,  bl1: -18, bl2: 10 },
  jab:    { lean: 16,  fa1: 88,  fa2: 0,   ba1: 10,  ba2: 130, fl1: 24, fl2: -4,  bl1: -22, bl2: 6 },
  heavyW: { lean: -8,  fa1: -10, fa2: 100, ba1: 30,  ba2: 100, fl1: 70, fl2: -110, bl1: -12, bl2: 8 },
  heavy:  { lean: -24, fa1: -30, fa2: 80,  ba1: 40,  ba2: 90,  fl1: 98, fl2: 0,   bl1: -14, bl2: 4 },
  upW:    { lean: 18,  fa1: 10,  fa2: 140, ba1: 20,  ba2: 120, fl1: 34, fl2: -56, bl1: -30, bl2: 34 },
  up:     { lean: -4,  fa1: 178, fa2: 0,   ba1: 30,  ba2: 110, fl1: 10, fl2: 0,   bl1: -14, bl2: 0 },
  swW:    { lean: 30,  fa1: 50,  fa2: 60,  ba1: 30,  ba2: 90,  fl1: 30, fl2: -60, bl1: -50, bl2: 100 },
  sw:     { lean: 42,  fa1: 70,  fa2: 30,  ba1: 20,  ba2: 80,  fl1: 86, fl2: 0,   bl1: -62, bl2: 124 },
  block:  { lean: -6,  fa1: 55,  fa2: 115, ba1: 45,  ba2: 125, fl1: 20, fl2: -8,  bl1: -20, bl2: 12 },
  hurt:   { lean: -28, fa1: -40, fa2: 30,  ba1: -60, ba2: 30,  fl1: 14, fl2: 0,   bl1: -18, bl2: 6 },
  dizzy:  { lean: 22,  fa1: 5,   fa2: 10,  ba1: -5,  ba2: 10,  fl1: 12, fl2: 4,   bl1: -12, bl2: 4 }
};
const PKEYS = Object.keys(P_.idle);
function lerpP(a, b, t) { const o = {}; for (const k of PKEYS) o[k] = a[k] + (b[k] - a[k]) * t; return o; }

const LEN = { ua: 17, fa: 16, th: 19, sh: 18, torso: 30, head: 10 };
function joints(p) {
  const ext = (a1, a2) => LEN.th * Math.cos(a1 * D2R) + LEN.sh * Math.cos((a1 + a2) * D2R);
  const hipH = Math.max(ext(p.fl1, p.fl2), ext(p.bl1, p.bl2), 8);
  const hip = { x: 0, y: -hipH };
  const L = p.lean * D2R, sl = Math.sin(L), cl = Math.cos(L);
  const neck = { x: hip.x + sl * LEN.torso, y: hip.y - cl * LEN.torso };
  const head = { x: neck.x + sl * (LEN.head + 2), y: neck.y - cl * (LEN.head + 2) };
  const sh = { x: neck.x - sl * 3, y: neck.y + cl * 3 };
  const limb = (o, a1, a2, l1, l2) => {
    const e = { x: o.x + Math.sin(a1 * D2R) * l1, y: o.y + Math.cos(a1 * D2R) * l1 };
    return [e, { x: e.x + Math.sin((a1 + a2) * D2R) * l2, y: e.y + Math.cos((a1 + a2) * D2R) * l2 }];
  };
  const [fe, fh] = limb(sh, p.fa1 + p.lean, p.fa2, LEN.ua, LEN.fa);
  const [be, bh] = limb(sh, p.ba1 + p.lean, p.ba2, LEN.ua, LEN.fa);
  const [fk, ff] = limb(hip, p.fl1, p.fl2, LEN.th, LEN.sh);
  const [bk, bf] = limb(hip, p.bl1, p.bl2, LEN.th, LEN.sh);
  return { hip, neck, head, sh, fe, fh, be, bh, fk, ff, bk, bf };
}

// ---------- audio ----------
let AC = null, master = null, noiseBuf = null;
function audioInit() {
  if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
  const A = window.AudioContext || window.webkitAudioContext;
  if (!A) return;
  try {
    AC = new A(); master = AC.createGain(); master.gain.value = save.muted ? 0 : 0.6; master.connect(AC.destination);
    noiseBuf = AC.createBuffer(1, AC.sampleRate * 0.5, AC.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch (e) { AC = null; }
}
function tone(f0, f1, dur, type, vol, delay) {
  if (!AC || save.muted) return;
  const t0 = AC.currentTime + (delay || 0), o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
  g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + dur + 0.02);
}
function noise(dur, freq, q, vol, delay, sweepTo) {
  if (!AC || save.muted || !noiseBuf) return;
  const t0 = AC.currentTime + (delay || 0), s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
  s.buffer = noiseBuf; f.type = 'bandpass'; f.frequency.setValueAtTime(freq, t0); f.Q.value = q;
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur);
  g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t0); s.stop(t0 + dur + 0.02);
}
const sfx = {
  whoosh(big) { noise(big ? 0.22 : 0.12, big ? 500 : 900, 1.2, big ? 0.25 : 0.14, 0, big ? 1600 : 2200); },
  hit(d) { tone(170 - d * 4, 50, 0.14 + d * 0.01, 'sine', 0.35); noise(0.09 + d * 0.006, 1200, 0.8, 0.3); },
  block() { tone(1400, 900, 0.06, 'square', 0.08); noise(0.05, 3000, 2, 0.12); },
  parry() { tone(1800, 1800, 0.25, 'triangle', 0.16); tone(2700, 2700, 0.3, 'sine', 0.09, 0.03); },
  jump() { tone(300, 520, 0.1, 'triangle', 0.07); },
  ko() { noise(0.6, 700, 0.7, 0.35, 0, 150); tone(400, 60, 0.7, 'sawtooth', 0.14); },
  tick() { tone(880, 880, 0.08, 'square', 0.06); },
  go() { tone(523, 523, 0.1, 'triangle', 0.12); tone(784, 784, 0.25, 'triangle', 0.12, 0.08); },
  win() { [523, 659, 784, 1046].forEach((f, i) => tone(f, f, 0.2, 'triangle', 0.11, i * 0.1)); },
  lose() { [392, 330, 262].forEach((f, i) => tone(f, f * 0.97, 0.3, 'triangle', 0.1, i * 0.15)); },
  read() { tone(660, 990, 0.12, 'sine', 0.07); },
  charge() { tone(200, 700, 0.18, 'sawtooth', 0.06); },
  throwInk() { noise(0.25, 400, 1, 0.3, 0, 120); tone(140, 60, 0.25, 'sine', 0.3); }
};
// ---------- music: a looping beat built from oscillators, no files ----------
// 4 bars of A minor (Am F C G), 16 steps a bar. Drums join in fights; hats double up when it gets tense.
const MUS = { bpm: 128, step: 0, next: 0, gain: null };
const BASS = [45, 41, 48, 43];                // midi roots per bar
const ARP = [0, 7, 12, 15, 12, 7, 3, 7];      // minor arpeggio offsets
const mf = n => 440 * Math.pow(2, (n - 69) / 12);
function mnote(freq, t, dur, type, vol, cut) {
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  if (cut) { const f = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cut; o.connect(f); f.connect(g); } else o.connect(g);
  g.connect(MUS.gain); o.start(t); o.stop(t + dur + 0.03);
}
function mkick(t) {
  const o = AC.createOscillator(), g = AC.createGain();
  o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
  g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
  o.connect(g); g.connect(MUS.gain); o.start(t); o.stop(t + 0.25);
}
function mnoise(t, dur, freq, vol, type) {
  const s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
  s.buffer = noiseBuf; f.type = type || 'highpass'; f.frequency.value = freq;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(MUS.gain); s.start(t, Math.random() * 0.3); s.stop(t + dur + 0.02);
}
function musicTick() {
  if (!AC || !noiseBuf || AC.state !== 'running') return;
  if (!MUS.gain) { MUS.gain = AC.createGain(); MUS.gain.gain.value = 0.32; MUS.gain.connect(master); }
  const spb = 60 / MUS.bpm / 4, now = AC.currentTime;
  if (MUS.next < now - 0.1) MUS.next = now + 0.05;
  const fight = mode === 'fight' || mode === 'ready' || mode === 'roundEnd' || mode === 'vs';
  const tense = mode === 'fight' && (timer < 10 || (P && A && (P.dmg > 100 || A.dmg > 100)));
  const target = save.muted ? 0 : (fight ? 0.32 : 0.18);
  MUS.gain.gain.setTargetAtTime(target, now, 0.3);
  while (MUS.next < now + 0.15) {
    const t = MUS.next, st = MUS.step % 16, bar = (MUS.step >> 4) % 4, root = BASS[bar];
    if (!save.muted) {
      // bass: driving eighths, octave bounce
      if (st % 2 === 0) mnote(mf(root + (st % 4 === 2 ? 12 : 0)), t, spb * 1.6, 'sawtooth', 0.16, 700);
      // ink-pluck arpeggio
      if (st % 2 === 0 || fight) mnote(mf(root + 24 + ARP[(st >> (fight ? 0 : 1)) % 8] + (st >= 8 && bar === 3 ? 2 : 0)), t, spb * 1.2, 'triangle', fight ? 0.06 : 0.08);
      if (fight) {
        if (st % 4 === 0) mkick(t);
        if (st === 4 || st === 12) mnoise(t, 0.14, 1800, 0.35, 'bandpass');
        if (st % 2 === 1 || tense) mnoise(t, 0.04, 7000, tense ? 0.14 : 0.1);
      }
    }
    MUS.next += spb; MUS.step++;
  }
}
function setMuted(m) {
  save.muted = m; persist();
  if (master) master.gain.value = m ? 0 : 0.6;
  const b = document.getElementById('mute'); if (b) b.textContent = m ? '🔇' : '🔊';
}

// ---------- layout ----------
let stageEdge = [];
function makeStage() {
  stageEdge = [];
  // torn ends: jagged x offsets down each end of the strip
  for (const side of [-1, 1]) {
    const pts = [];
    for (let y = 0; y <= 26; y += 3.25) pts.push({ x: side * STAGE + side * rnd(-6, 6), y });
    stageEdge.push(pts);
  }
}
function resize() {
  W = window.innerWidth; H = window.innerHeight;
  DPR = Math.min(2, window.devicePixelRatio || 1);
  cv.width = W * DPR | 0; cv.height = H * DPR | 0; cv.style.width = W + 'px'; cv.style.height = H + 'px';
  K = Math.min(W / 570, H / 400);   // leave a margin so both torn edges always show
  CX = W / 2; GY = H * 0.6;
  blastX = W / 2 / K + 70; blastY = (H - GY) / K + 70;
  bg.width = cv.width; bg.height = cv.height;
  drawPage();
}
function drawPage() {
  const b = bctx; b.setTransform(DPR, 0, 0, DPR, 0, 0);
  b.fillStyle = PAPER; b.fillRect(0, 0, W, H);
  b.strokeStyle = '#c7d5ea'; b.lineWidth = 1;
  for (let y = 60; y < H; y += 28) { b.beginPath(); b.moveTo(0, y); b.lineTo(W, y); b.stroke(); }
  const mx = Math.max(34, W * 0.07);
  b.strokeStyle = '#e8a3a3'; b.lineWidth = 1.5; b.beginPath(); b.moveTo(mx, 0); b.lineTo(mx, H); b.stroke();
  b.fillStyle = '#e2d8c1';
  for (const fy of [0.2, 0.5, 0.8]) { b.beginPath(); b.arc(mx * 0.45, H * fy, 7, 0, Math.PI * 2); b.fill(); }
}
const sx = x => CX + x * K, sy = y => GY + y * K;

// ---------- state ----------
let mode = 'title';   // title | vs | ready | fight | roundEnd | matchEnd | champ
let modeT = 0, clock = 0, ts = 1, slowT = 0, hitstop = 0, shake = 0, whiteT = 0;
let rivalIdx = 0, R = RIVALS[0], P, A, wins = [0, 0], roundNo = 1, timer = ROUND_TIME;
let parts = [], blots = [], pops = [], impacts = [], bubble = null, shots = [];
let lastResult = '', matchWon = false, isTouch = false, firstFight = true;

function makeFighter(isP) {
  return {
    isP, x: isP ? -95 : 95, y: 0, vx: 0, vy: 0, face: isP ? 1 : -1, dmg: 0, st: 'idle', mv: null, mt: 0,
    hitDone: false, lunged: false, stun: 0, jumps: 1, ground: true, blockStart: 0, walkPh: 0, spin: 0,
    col: isP ? INK : R.col, weight: isP ? 1 : (R.weight || 1), speed: isP ? 1 : (R.speed || 1),
    power: isP ? 1 : 1 + 0.04 * rivalIdx, flash: 0, out: false, pose: P_.idle,
    in: { mx: 0, jump: false, atk: null, block: false, dash: false, special: false }, fresh: 0, ink: 0
  };
}

function startMatch(idx) {
  audioInit();
  rivalIdx = idx; R = RIVALS[idx];
  wins = [0, 0]; roundNo = 1;
  resetAI();
  blots = [];
  makeStage();
  resetRound();
  matchXp = 0; rankAtStart = rankIdx(save.xp || 0);
  setMode('vs');
  if (!save.tut) { save.tut = true; persist(); setPaused(true); }
}
function resetRound() {
  P = makeFighter(true); A = makeFighter(false);
  timer = ROUND_TIME; parts = []; pops = []; impacts = []; bubble = null; shots = [];
  ai.think = 0.6; ai.sched = null; ai.blockHold = 0; ai.walkT = 0;
}
function setMode(m) { mode = m; modeT = 0; }
function canPause() { return mode === 'vs' || mode === 'ready' || mode === 'fight' || mode === 'roundEnd'; }
function setPaused(v) {
  if (v && !canPause()) return;
  paused = v; tL = tR = null; buf.atkT = buf.jump = buf.dash = buf.sp = 0;
  for (const k in keys) keys[k] = false;
  if (!v && mode === 'fight') { buf.atkT = 0; }
  const b = document.getElementById('pause'); if (b) b.textContent = v ? '▶' : '⏸';
}

// ---------- input ----------
const keys = {};
let buf = { atk: null, atkT: 0, jump: 0, dash: 0, sp: 0 };
let tL = null, tR = null;
function queueAtk(m) { buf.atk = m; buf.atkT = 0.16; }
function menuTap() {
  audioInit();
  if (nameOpen) return;
  if (mode === 'title') { if (!save.name) openName(true); else startMatch(save.rival); return; }
  if (mode === 'matchEnd' && modeT > 0.9) {
    if (matchWon) {
      if (rivalIdx >= RIVALS.length - 1) { setMode('champ'); return; }
      startMatch(rivalIdx + 1);
    } else startMatch(rivalIdx);
    return;
  }
  if (mode === 'champ' && modeT > 1.2) { setMode('title'); }
}
window.addEventListener('keydown', e => {
  if (nameOpen || (e.target && e.target.tagName === 'INPUT')) { if (e.key === 'Enter') closeName(); return; }
  const k = e.key.toLowerCase();
  if (keys[k]) return;
  keys[k] = true;
  if (k === 'm') setMuted(!save.muted);
  if (k === 'p' || k === 'escape') { setPaused(!paused); return; }
  if (paused) { if (k === ' ' || k === 'enter') setPaused(false); return; }
  if (mode !== 'fight') { if (k === ' ' || k === 'enter' || k === 'j') menuTap(); return; }
  if (k === 'j') queueAtk('jab');
  if (k === 'k') queueAtk('heavy');
  if (k === 'i') queueAtk('upper');
  if (k === 'l') queueAtk('sweep');
  if (k === 'w' || k === 'arrowup' || k === ' ') buf.jump = 0.16;
  if (k === 'shift') buf.dash = 0.16;
  if (k === 'u' || k === 'e') buf.sp = 0.2;
});
window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

cv.addEventListener('pointerdown', e => {
  e.preventDefault && e.preventDefault();
  if (e.pointerType === 'touch') isTouch = true;
  audioInit();
  if (paused) { setPaused(false); return; }
  if (mode === 'title' && nameCard && e.clientY > nameCard.y0 && e.clientY < nameCard.y1 && Math.abs(e.clientX - CX) < nameCard.w) { openName(false); return; }
  if (mode !== 'fight' && mode !== 'ready') { menuTap(); return; }
  const x = e.clientX, y = e.clientY;
  const ib = inkBtn();
  if (P && P.ink >= INK_FULL && Math.hypot(x - ib.x, y - ib.y) < ib.r + 10) { buf.sp = 0.2; return; }
  if (x < W * 0.42) tL = { id: e.pointerId, x0: x, y0: y, x, y, jumped: false };
  else tR = { id: e.pointerId, x0: x, y0: y, x, y, t0: performance.now(), swiped: false, blocking: false };
});
window.addEventListener('pointermove', e => {
  const x = e.clientX, y = e.clientY;
  if (tL && e.pointerId === tL.id) {
    tL.x = x; tL.y = y;
    if (!tL.jumped && tL.y0 - y > 36) { buf.jump = 0.16; tL.jumped = true; }
    if (tL.jumped && tL.y0 - y < 14) tL.jumped = false;
    const dx = x - tL.x0; if (Math.abs(dx) > 60) tL.x0 = x - sign(dx) * 60;
    if (tL.y0 - y > 70) tL.y0 = y + 70;
  }
  if (tR && e.pointerId === tR.id) {
    tR.x = x; tR.y = y;
    const dx = x - tR.x0, dy = y - tR.y0;
    if (!tR.swiped && !tR.blocking && Math.hypot(dx, dy) > 26) {
      tR.swiped = true;
      if (Math.abs(dy) > Math.abs(dx)) queueAtk(dy < 0 ? 'upper' : 'sweep');
      else if (sign(dx) === (P ? P.face : 1)) queueAtk('heavy');
      else buf.dash = 0.16;
    }
  }
});
function endPointer(e) {
  if (tL && e.pointerId === tL.id) tL = null;
  if (tR && e.pointerId === tR.id) { if (!tR.swiped && !tR.blocking && mode === 'fight') queueAtk('jab'); tR = null; }
}
window.addEventListener('pointerup', endPointer);
window.addEventListener('pointercancel', endPointer);

function playerIntent(dt) {
  const I = P.in;
  let mx = 0;
  if (keys['a'] || keys['arrowleft']) mx -= 1;
  if (keys['d'] || keys['arrowright']) mx += 1;
  if (tL) { const dx = tL.x - tL.x0; if (Math.abs(dx) > 12) mx += sign(dx); }
  I.mx = clamp(mx, -1, 1);
  if (tR && !tR.swiped && performance.now() - tR.t0 > 170) tR.blocking = true;
  I.block = !!(keys['s'] || keys['arrowdown'] || (tR && tR.blocking));
  buf.atkT -= dt; buf.jump -= dt; buf.dash -= dt; buf.sp -= dt;
  I.special = buf.sp > 0;
  I.atk = buf.atkT > 0 ? buf.atk : null;
  I.jump = buf.jump > 0; I.dash = buf.dash > 0;
}

// ---------- AI: learns your habits during the match ----------
const ai = { hab: {}, tot: 0, think: 0, sched: null, blockHold: 0, walk: 0, walkT: 0, lastBubble: -9, blinkCd: 0 };
function resetAI() { ai.hab = { jab: 0, heavy: 0, upper: 0, sweep: 0, block: 0, jump: 0, blot: 0 }; ai.tot = 0; ai.lastBubble = -9; ai.blinkCd = 0; }
function share(k) { let s = 0; for (const h in ai.hab) s += ai.hab[h]; return s ? ai.hab[k] / s : 0; }
function know() { return R.learn * Math.min(1, ai.tot / 6); }
function topHabit() { let best = 'jab', b = -1; for (const h in ai.hab) if (ai.hab[h] > b) { b = ai.hab[h]; best = h; } return best; }
const TAUNTS = {
  jab: ['Jab again?', 'Same jab.', 'I know that jab.'],
  heavy: ['Saw that kick.', 'Telegraphed.', 'Kick? Again?'],
  upper: ['Uppercut again?', 'Read it.', 'Predictable.'],
  sweep: ['Hop.', 'Not my ankles.', 'Sweep again?'],
  jump: ['Up you go.', 'The air is mine.', 'Jumping again?'],
  blot: ['Saw the ink coming.', 'Missed me.', 'Messy, and slow.']
};
function say(text) { bubble = { text, t: 1.6 }; ai.lastBubble = clock; sfx.read(); }

function observe(kind) {
  for (const h in ai.hab) ai.hab[h] *= 0.96;
  ai.hab[kind] += 1; ai.tot++;
  if (mode !== 'fight' || A.out || A.st !== 'idle' && A.st !== 'block') return;
  const dist = Math.abs(P.x - A.x);
  const read = know() * share(kind);
  const pred = Math.random() < Math.min(0.9, read * 1.7);
  let delay = pred ? R.react * 0.3 : R.react * (0.85 + Math.random() * 0.5);
  let action = null;
  if (kind === 'blot') {
    const arrive = BLOT.su + Math.max(0, dist - 20) / BLOT.speed;
    if (pred && R.parry && Math.random() < 0.6) { action = 'block'; delay = Math.max(0, arrive - 0.07); }
    else if (pred) { action = 'jump'; delay = Math.max(0, arrive - 0.2); }
    else action = 'block';
  } else if (MOVES[kind] && kind !== 'sweep' && dist < 115) {
    action = 'block';
    if (R.parry && pred && kind !== 'jab') delay = Math.max(0, MOVES[kind].su - 0.07);
    if (R.teleport && pred && ai.blinkCd <= 0 && Math.random() < 0.6) action = 'blink';
  } else if (kind === 'sweep' && dist < 115) action = 'jump';
  else if (kind === 'jump' && dist < 130) { action = 'upper'; delay = Math.max(delay, 0.14); }
  if (action) ai.sched = { t: delay, action, pred, kind };
  if (pred && TAUNTS[kind] && read > 0.22 && clock - ai.lastBubble > 2.4) {
    const list = TAUNTS[kind]; say(list[Math.random() * list.length | 0]);
  }
}

function aiIntent(dt) {
  const I = A.in;
  I.atk = null; I.jump = false; I.dash = false; I.special = false;
  ai.blinkCd -= dt;
  ai.blockHold -= dt; I.block = ai.blockHold > 0 && A.ground;
  ai.walkT -= dt; I.mx = ai.walkT > 0 ? ai.walk : 0;
  if (A.out) return;
  const dx = P.x - A.x, dist = Math.abs(dx), dir = sign(dx);

  // recover from off the page
  if (Math.abs(A.x) > STAGE - 4 && (!A.ground || A.y > 0)) {
    I.mx = -sign(A.x); I.block = false;
    if (!A.ground && A.vy > 0 && A.y > -30 && A.jumps > 0 && A.st !== 'hit') I.jump = true;
    return;
  }
  if (ai.sched) {
    ai.sched.t -= dt;
    if (ai.sched.t <= 0) {
      const s = ai.sched; ai.sched = null;
      if (A.st === 'idle' || A.st === 'block') {
        if (s.action === 'block') { ai.blockHold = s.kind === 'blot' ? 0.5 : 0.38; I.block = true; }
        else if (s.action === 'jump') I.jump = true;
        else if (s.action === 'upper') I.atk = 'upper';
        else if (s.action === 'atk') I.atk = s.atk;
        else if (s.action === 'blink') blink();
      }
    }
    return;
  }
  if (A.st !== 'idle') return;
  ai.think -= dt;
  if (ai.think > 0) return;
  ai.think = R.think * (0.6 + Math.random() * 0.8);
  if (P.out) return;

  // throw ink when charged: from range, or into a dizzy/recovering player
  if (A.ink >= INK_FULL && A.ground && (dist > 110 || P.st === 'dizzy') && Math.random() < 0.35 + 0.4 * R.aggr) {
    const dodgy = know() * (share('jump') + share('block'));   // a player who jumps/blocks a lot gets it later, up close
    if (dist > 110 && Math.random() < dodgy) { ai.walk = dir; ai.walkT = 0.3; return; }
    I.special = true; return;
  }

  // punish
  if ((P.st === 'dizzy' || (P.st === 'hit' && P.ground) || (P.st === 'atk' && P.mt > MOVES[P.mv].su + MOVES[P.mv].ac)) && dist < 78) {
    I.atk = Math.random() < 0.55 ? 'heavy' : 'upper'; return;
  }
  if (dist > 62) {
    if (Math.random() < R.aggr + 0.25) { ai.walk = dir; ai.walkT = 0.25 + Math.random() * 0.2; }
    else if (Math.abs(A.x) < STAGE - 50) { ai.walk = -dir; ai.walkT = 0.15; }
    if (Math.random() < 0.05 * R.aggr) { I.jump = true; ai.walk = dir; ai.walkT = 0.4; }
    return;
  }
  const k = know();
  const w = { jab: 3, heavy: 1.4, upper: 1, sweep: 1.2, block: (1 - R.aggr) * 2.5, back: 0.6 };
  w.sweep += 8 * k * share('block');
  w.upper += 6 * k * share('jump');
  w.block += 4 * k * (share('jab') + share('heavy'));
  if (R.mirror) for (const m in MOVES) w[m] += 5 * share(m);
  if (Math.abs(P.x) > 140 && sign(P.x) === dir) w.heavy += 3;           // rival near its edge: go for the ring-out
  if (Math.abs(A.x) > 150 && sign(A.x) === -dir) { w.back = 0; w.heavy += 1; }
  let sum = 0; for (const m in w) sum += w[m];
  let r = Math.random() * sum, pick = 'jab';
  for (const m in w) { r -= w[m]; if (r <= 0) { pick = m; break; } }
  if (pick === 'block') { ai.blockHold = 0.35; I.block = true; }
  else if (pick === 'back') { ai.walk = -dir; ai.walkT = 0.22; }
  else I.atk = pick;
}
function blink() {
  ai.blinkCd = 4;
  puff(A.x, -40, A.col, 18);
  A.x = clamp(P.x - P.face * 42, -STAGE + 12, STAGE - 12); A.y = 0; A.vx = A.vy = 0; A.ground = true;
  A.face = sign(P.x - A.x);
  puff(A.x, -40, A.col, 18);
  ai.sched = { t: 0.08, action: 'atk', atk: 'jab' };
  sfx.whoosh(true);
}

// ---------- fighters ----------
function startMove(f, m) {
  f.st = 'atk'; f.mv = m; f.mt = 0; f.hitDone = false; f.lunged = false;
  if (f.isP) observe(m);
}
function updateFighter(f, o, dt) {
  f.flash -= dt;
  if (f.out) { f.vy += GRAV * dt; f.x += f.vx * dt; f.y += f.vy * dt; return; }
  const I = f.in;
  if (f.st === 'atk') {
    const m = MOVES[f.mv];
    f.mt += dt;
    if (!f.lunged && f.mt >= m.su) { f.lunged = true; f.vx += f.face * m.lunge * (f.ground ? 1 : 0.4); sfx.whoosh(f.mv === 'heavy'); }
    if (f.mt >= m.su && f.mt < m.su + m.ac && !f.hitDone) tryHit(f, o, m);
    if (f.mt >= m.su + m.ac + m.re) { f.st = 'idle'; f.mv = null; }
  } else if (f.st === 'throw') {
    f.mt += dt;
    if (!f.lunged && f.mt >= BLOT.su) { f.lunged = true; fireBlot(f); }
    if (f.mt >= BLOT.su + BLOT.re) { f.st = 'idle'; }
  } else if (f.st === 'hit' || f.st === 'blockstun' || f.st === 'dizzy') {
    f.stun -= dt; if (f.stun <= 0) f.st = 'idle';
  } else if (f.st === 'block') {
    if (!I.block || !f.ground) f.st = 'idle';
  }
  if (f.st === 'idle') {
    if (f.ground) f.face = o.x === f.x ? f.face : sign(o.x - f.x);
    if (I.block && f.ground) {
      f.st = 'block'; f.blockStart = clock; if (f.isP) observe('block');
    } else if (I.special && f.ink >= INK_FULL && f.ground) {
      f.st = 'throw'; f.mt = 0; f.lunged = false; f.ink = 0; f.vx *= 0.3;
      sfx.charge();
      if (f.isP) { buf.sp = 0; observe('blot'); }
    } else if (I.atk && !(I.atk === 'sweep' && !f.ground)) {
      startMove(f, I.atk); if (f.isP) buf.atkT = 0;
    } else {
      const target = I.mx * 175 * f.speed;
      f.vx += (target - f.vx) * Math.min(1, dt * (f.ground ? 16 : 4));
      if (I.dash && f.ground) { f.vx = -f.face * 380; puff(f.x, -6, f.col, 6); if (f.isP) buf.dash = 0; }
    }
    if (I.jump && (f.ground || f.jumps > 0) && f.st !== 'atk') {
      if (f.ground) { f.vy = -640; f.ground = false; } else { f.vy = -580; f.jumps--; }
      puff(f.x, 0, f.col, 6); sfx.jump();
      if (f.isP) { buf.jump = 0; observe('jump'); }
    }
  }
  if (f.ground && (f.st === 'atk' || f.st === 'throw' || f.st === 'block' || f.st === 'blockstun' || f.st === 'dizzy')) f.vx *= Math.exp(-dt * 8);
  if (f.st === 'hit' && f.ground) f.vx *= Math.exp(-dt * 2.4);

  const prevY = f.y;
  if (!f.ground) f.vy += GRAV * dt;
  f.x += f.vx * dt; f.y += f.vy * dt;
  const onPaper = Math.abs(f.x) <= STAGE + 4;
  if (!f.ground && f.y >= 0 && prevY <= 0.5 && onPaper && f.vy >= 0) {
    f.y = 0; f.vy = 0; f.ground = true; f.jumps = 1; f.spin = 0;
    if (f.st === 'hit') puff(f.x, 0, f.col, 5);
  }
  if (f.ground && !onPaper) { f.ground = false; }
  if (f.ground) { f.y = 0; if (f.vy > 0 || f.vy < 0) f.vy = 0; }
  if (!f.ground && f.st === 'hit' && Math.hypot(f.vx, f.vy) > 380) f.spin += dt * 11 * -sign(f.vx) * f.face;
  if (f.ground) f.spin = 0;
  f.walkPh += Math.abs(f.vx) * dt * 0.07;
  if (Math.abs(f.x) > blastX || f.y > blastY) ringOut(f, o);
}

function limbWorld(f, limb) {
  const j = joints(f.pose), p = j[limb];
  return { x: f.x + f.face * p.x, y: f.y + p.y };
}
function tryHit(a, d, m) {
  if (d.out) return;
  a.pose = MOVES[a.mv] ? P_[m.s] : a.pose;
  const pt = limbWorld(a, m.limb);
  const top = d.st === 'atk' && d.mv === 'sweep' ? -52 : -86;
  const cx = clamp(pt.x, d.x - 15, d.x + 15), cy = clamp(pt.y, d.y + top, d.y);
  if ((cx - pt.x) ** 2 + (cy - pt.y) ** 2 > 14 * 14) return;
  a.hitDone = true;
  const facing = sign(a.x - d.x) === d.face;
  if (d.st === 'block' && facing && !m.low) {
    // only the player and the parry rivals (Quill, The Editor) can parry; they still can't parry a jab they didn't really read
    const canParry = d.isP || (R.parry && (m !== MOVES.jab || know() > 0.6 && Math.random() < 0.35));
    if (canParry && clock - d.blockStart <= 0.13) parry(d, a, pt); else blocked(d, a, pt);
  } else hitLand(d, a, m, pt);
}
function hitLand(d, a, m, pt) {
  const dmg = Math.round(m.dmg * a.power);
  d.dmg += dmg;
  if (!a.shot) a.ink = Math.min(INK_FULL, a.ink + dmg * 4);
  if (a.isP && mode === 'fight') addXp(dmg);
  d.ink = Math.min(INK_FULL, d.ink + dmg * 1.5);
  const kb = (m.base + m.grow * d.dmg) / d.weight;
  const ang = m.ang * D2R;
  d.vx = Math.cos(ang) * kb * a.face; d.vy = -Math.sin(ang) * kb;
  if (d.vy < -40) d.ground = false; else if (d.ground) d.vy = 0;   // small hits slide along the paper instead of floating
  d.st = 'hit'; d.stun = 0.18 + kb * 0.0007; d.mv = null; d.flash = 0.1;
  if (d.isP && buf) buf.atkT = 0;
  a.vx *= 0.3;
  hitstop = 0.045 + m.dmg * 0.006 + (kb > 420 ? 0.05 : 0);
  shake = Math.max(shake, 3 + m.dmg * 0.8 + (kb > 420 ? 6 : 0));
  splat(pt.x, pt.y, d.col, 6 + m.dmg, a.face, kb);
  if (kb > 400) { impacts.push({ x: pt.x, y: pt.y, t: 0.14 }); whiteT = 0.05; }
  pop(pt.x, pt.y - 20, '+' + dmg + '%', d.col, 16 + m.dmg);
  sfx.hit(m.dmg);
  if (!d.isP) { const hk = a.shot ? 'blot' : (a.mv || 'jab'); ai.hab[hk] = (ai.hab[hk] || 0) + 0.5; ai.sched = null; ai.blockHold = 0; }
  if (navigator.vibrate && d.isP) try { navigator.vibrate(30 + m.dmg * 3); } catch (e) {}
}
function blocked(d, a, pt) {
  d.dmg += 1; d.vx = a.face * 150; d.st = 'blockstun'; d.stun = 0.1;
  // a blocked strike leaves the attacker briefly open, so blocking then hitting back works
  if (a.st === 'atk') { const m = MOVES[a.mv]; a.st = 'blockstun'; a.mv = null; a.stun = m.re + 0.12; }
  d.ink = Math.min(INK_FULL, d.ink + 5);
  a.vx *= 0.2;
  hitstop = 0.03; shake = Math.max(shake, 2);
  for (let i = 0; i < 8; i++) parts.push({ x: pt.x, y: pt.y, vx: rnd(-160, 160), vy: rnd(-220, 20), life: 0.3, max: 0.3, col: '#ffffff', r: 2, g: 0.4 });
  sfx.block();
  if (!d.isP) {
    ai.think = 0.05;
    if (Math.random() < 0.35 + 0.6 * know()) ai.sched = { t: 0.1 + R.react * 0.3, action: 'atk', atk: Math.random() < 0.7 ? 'jab' : 'sweep' };
  }
}
function parry(d, a, pt) {
  if (a.shot) return;
  a.st = 'dizzy'; a.stun = 0.6; a.mv = null; a.vx = -a.face * 130;
  d.st = 'idle';
  hitstop = 0.1; shake = Math.max(shake, 7); whiteT = 0.08;
  impacts.push({ x: pt.x, y: pt.y, t: 0.12 });
  pop(d.x, -110, 'PARRY!', d.col, 26);
  sfx.parry();
  if (!d.isP) { ai.think = 0; ai.sched = { t: 0.05, action: 'atk', atk: Math.random() < 0.6 ? 'heavy' : 'upper' }; }
}

function ringOut(f, o) {
  if (f.out || mode !== 'fight') return;
  f.out = true; f.vx *= 0.3;
  slowT = 0.9; shake = 18; whiteT = 0.1;
  sfx.ko();
  const ex = clamp(f.x, -W / 2 / K + 20, W / 2 / K - 20), ey = Math.min(f.y, blastY - 90);
  splat(ex, ey, f.col, 40, sign(f.x), 600);
  wins[f.isP ? 1 : 0]++;
  if (!f.isP) addXp(40);
  lastResult = 'RING OUT!';
  setMode('roundEnd');
}
function timeUp() {
  lastResult = 'TIME!';
  if (P.dmg < A.dmg) wins[0]++; else if (A.dmg < P.dmg) wins[1]++;
  else lastResult = 'DRAW';
  setMode('roundEnd');
}

// ---------- ink blot projectiles ----------
function fireBlot(f) {
  shots.push({ x: f.x + f.face * 26, y: f.y + BLOT.y, vx: f.face * BLOT.speed, owner: f, col: f.col, t: 1.5, tr: [] });
  puff(f.x + f.face * 26, f.y + BLOT.y, f.col, 10);
  sfx.throwInk();
  shake = Math.max(shake, 3);
}
function updateShots(dt) {
  for (const s of shots) {
    s.t -= dt; s.x += s.vx * dt;
    s.tr.push({ x: s.x, y: s.y }); if (s.tr.length > 7) s.tr.shift();
    if (Math.random() < dt * 14) parts.push({ x: s.x, y: s.y + 4, vx: -s.vx * 0.05 + rnd(-20, 20), vy: rnd(-20, 30), life: 0.5, max: 0.5, col: s.col, r: rnd(1.5, 3), g: 1, blot: Math.random() < 0.4 });
    const d = s.owner === P ? A : P;
    if (s.t <= 0 || d.out) continue;
    if (Math.abs(s.x - d.x) > 15 + BLOT.r) continue;
    const top = d.st === 'atk' && d.mv === 'sweep' ? -52 : -86;
    if (s.y < d.y + top - BLOT.r * 0.6 || s.y > d.y + BLOT.r) continue;
    const pt = { x: s.x, y: s.y }, dirv = sign(s.vx);
    const facing = d.face === -dirv;
    if (d.st === 'block' && facing) {
      if (clock - d.blockStart <= 0.13) {          // parried: bounce it back
        s.vx = -s.vx * 1.15; s.owner = d; s.col = d.col; s.t = 1.5;
        hitstop = 0.08; whiteT = 0.06; shake = Math.max(shake, 6);
        impacts.push({ x: pt.x, y: pt.y, t: 0.12 });
        pop(d.x, -110, 'RETURNED!', d.col, 24); sfx.parry();
        continue;
      }
      blocked(d, { face: dirv, vx: 0 }, pt);
      splat(pt.x, pt.y, s.col, 10, -dirv, 100);
      s.t = 0; continue;
    }
    hitLand(d, { face: dirv, vx: 0, power: s.owner.power, shot: true }, BLOT, pt);
    addBlot(pt.x + dirv * 30, pt.y, s.col, 16);
    pop(pt.x, pt.y - 44, 'SPLAT!', s.col, 26);
    s.t = 0;
  }
  // two blots meet: both burst
  for (let i = 0; i < shots.length; i++) for (let j = i + 1; j < shots.length; j++) {
    const a = shots[i], b = shots[j];
    if (a.t > 0 && b.t > 0 && sign(a.vx) !== sign(b.vx) && Math.abs(a.x - b.x) < 2 * BLOT.r && Math.abs(a.y - b.y) < 2 * BLOT.r) {
      a.t = b.t = 0; splat(a.x, a.y, a.col, 14, 1, 150); splat(b.x, b.y, b.col, 14, -1, 150);
      shake = Math.max(shake, 5); sfx.hit(6);
    }
  }
  shots = shots.filter(s => s.t > 0 && Math.abs(s.x) < blastX + 40);
}

// ---------- fx ----------
function puff(x, y, col, n) {
  for (let i = 0; i < n; i++) parts.push({ x, y, vx: rnd(-90, 90), vy: rnd(-90, 10), life: rnd(0.25, 0.45), max: 0.45, col, r: rnd(1.5, 3), g: 0.2 });
}
function splat(x, y, col, n, dir, kb) {
  for (let i = 0; i < n; i++) {
    const a = rnd(-1.2, 1.2) + (dir > 0 ? 0 : Math.PI), v = rnd(80, 260 + kb * 0.4);
    parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 90, life: rnd(0.35, 0.8), max: 0.8, col, r: rnd(1.5, 4.5), g: 1, blot: Math.random() < 0.35 });
  }
  addBlot(x + dir * rnd(10, 40), y + rnd(-20, 20), col, rnd(5, 9) + n * 0.25);
}
function addBlot(x, y, col, r) {
  const drops = [];
  const n = 3 + (Math.random() * 5 | 0);
  for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, d = r * rnd(1.1, 2.4); drops.push([Math.cos(a) * d, Math.sin(a) * d, r * rnd(0.12, 0.35)]); }
  blots.push({ x, y, col, r, drops, a: rnd(0.16, 0.3) });
  if (blots.length > 140) blots.shift();
}
function pop(x, y, s, col, size) { pops.push({ x, y, s, col, size, t: 0.9 }); }

// ---------- main step ----------
function step(dt) {
  clock += dt; modeT += dt;
  for (const p of parts) {
    p.vy += GRAV * p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
    if (p.blot && p.life <= 0) addBlot(p.x, p.y, p.col, p.r * 1.3);
  }
  parts = parts.filter(p => p.life > 0);
  if (parts.length > 400) parts.splice(0, parts.length - 400);
  for (const p of pops) { p.y -= 40 * dt; p.t -= dt; }
  pops = pops.filter(p => p.t > 0);
  for (const im of impacts) im.t -= dt;
  impacts = impacts.filter(i => i.t > 0);
  if (bubble) { bubble.t -= dt; if (bubble.t <= 0) bubble = null; }
  shake = Math.max(0, shake - dt * 45);
  whiteT -= dt;

  if (mode === 'title' || mode === 'champ') { idleDemo(dt); return; }
  if (mode === 'vs') { if (modeT > 1.7) setMode('ready'); idlePose(); return; }
  if (mode === 'ready') {
    if (modeT === dt || (modeT > 0 && modeT <= dt + 1e-6)) sfx.tick();
    if (modeT > 1.2) { setMode('fight'); sfx.go(); }
    idlePose(); return;
  }
  if (mode === 'matchEnd') { physicsOnly(dt); return; }

  if (hitstop > 0) { hitstop -= dt; return; }

  if (mode === 'fight') {
    timer -= dt;
    playerIntent(dt);
    aiIntent(dt);
    updateFighter(P, A, dt);
    updateFighter(A, P, dt);
    updateShots(dt);
    // fighters can't overlap
    if (!P.out && !A.out && Math.abs(P.y - A.y) < 60) {
      const ov = 26 - Math.abs(P.x - A.x);
      if (ov > 0) { const s = sign(P.x - A.x) || 1; P.x += s * ov / 2; A.x -= s * ov / 2; }
    }
    P.pose = poseOf(P); A.pose = poseOf(A);
    if (mode === 'fight' && timer <= 0) timeUp();
  } else if (mode === 'roundEnd') {
    physicsOnly(dt);
    if (modeT > 2.0) {
      if (wins[0] >= 2 || wins[1] >= 2) {
        matchWon = wins[0] >= 2;
        addXp(wins[0] * 30 + (matchWon ? 100 + 25 * rivalIdx : 20));
        persist();
        if (matchWon) {
          sfx.win();
          if (rivalIdx >= RIVALS.length - 1) save.cleared = true;
          save.rival = Math.min(RIVALS.length - 1, Math.max(save.rival, rivalIdx + 1));
          persist();
        } else sfx.lose();
        if (rankIdx(save.xp) > rankAtStart) setTimeout(() => { sfx.win(); }, 500);
        setMode('matchEnd');
      } else {
        if (lastResult !== 'DRAW') roundNo++;
        resetRound(); setMode('ready');
      }
    }
  }
}
function physicsOnly(dt) {
  for (const f of [P, A]) {
    f.in = { mx: 0, jump: false, atk: null, block: false, dash: false, special: false };
    updateFighter(f, f === P ? A : P, dt);
    f.pose = poseOf(f);
  }
}
function idlePose() { P.pose = poseOf(P); A.pose = poseOf(A); }

// title screen: two fighters spar on their own
let demo = null;
function idleDemo(dt) {
  if (!demo) {
    const keep = R; R = RIVALS[Math.min(save.rival, RIVALS.length - 1)];
    demo = { p: makeFighter(true), a: makeFighter(false), t: 0 };
    demo.p.x = -60; demo.a.x = 60; R = keep;
  }
  demo.t += dt;
  for (const f of [demo.p, demo.a]) {
    const o = f === demo.p ? demo.a : demo.p;
    if (f.st === 'atk') { f.mt += dt; const m = MOVES[f.mv]; if (f.mt > m.su + m.ac + m.re) f.st = 'idle'; }
    else if (f.st === 'block') { f.mt += dt; if (f.mt > 0.35) f.st = 'idle'; }
    else if (Math.random() < dt * 1.1) {
      if (Math.random() < 0.7) { const ms = ['jab', 'heavy', 'upper', 'sweep']; f.st = 'atk'; f.mv = ms[Math.random() * 4 | 0]; f.mt = 0; o.st = 'block'; o.mt = 0; }
    }
    f.face = sign(o.x - f.x);
    f.pose = poseOf(f);
  }
}

function poseOf(f) {
  if (f.out || f.st === 'hit') return P_.hurt;
  if (f.st === 'atk' && f.mv) {
    const m = MOVES[f.mv];
    if (f.mt < m.su) return lerpP(P_.idle, P_[m.w], ease(f.mt / m.su));
    if (f.mt < m.su + m.ac) return P_[m.s];
    return lerpP(P_[m.s], P_.idle, Math.min(1, (f.mt - m.su - m.ac) / m.re));
  }
  if (f.st === 'throw') {
    if (f.mt < BLOT.su) return lerpP(P_.idle, P_.heavyW, ease(f.mt / BLOT.su));
    return lerpP(P_.jab, P_.idle, Math.min(1, (f.mt - BLOT.su) / BLOT.re));
  }
  if (f.st === 'block' || f.st === 'blockstun') return P_.block;
  if (f.st === 'dizzy') { const p = Object.assign({}, P_.dizzy); p.lean += Math.sin(clock * 12) * 8; return p; }
  if (!f.ground) return P_.air;
  if (Math.abs(f.vx) > 25) {
    const s = Math.sin(f.walkPh), p = Object.assign({}, P_.idle);
    p.fl1 = 8 + 24 * s; p.fl2 = -10 - 16 * Math.max(0, s);
    p.bl1 = -8 - 24 * s; p.bl2 = -10 - 16 * Math.max(0, -s);
    p.lean = 10;
    return p;
  }
  const p = Object.assign({}, P_.idle);
  p.lean += Math.sin(clock * 3 + (f.isP ? 0 : 1.7)) * 2;
  p.fa2 += Math.sin(clock * 3) * 4;
  return p;
}

// ---------- drawing ----------
function jit(i) {   // boiling-line wobble, re-rolled 10x a second
  const b = Math.floor(clock * 10);
  const s = Math.sin((i * 12.9898 + b * 78.233)) * 43758.5453;
  return (s - Math.floor(s) - 0.5) * 1.4;
}
function drawFighter(f, alpha) {
  const p = f.pose, j = joints(p);
  ctx.save();
  ctx.globalAlpha = alpha == null ? 1 : alpha;
  ctx.translate(sx(f.x), sy(f.y));
  ctx.scale(K * f.face, K);
  if (f.spin) { ctx.translate(j.hip.x, j.hip.y); ctx.rotate(f.spin); ctx.translate(-j.hip.x, -j.hip.y); }
  const col = f.flash > 0 ? '#ff2a2a' : f.col;
  const J = (pt, i) => ({ x: pt.x + jit(i + (f.isP ? 0 : 50)), y: pt.y + jit(i + 25 + (f.isP ? 0 : 50)) });
  const line = (pts, w, i) => {
    ctx.lineWidth = w; ctx.beginPath();
    pts.forEach((pt, k) => { const q = J(pt, i + k); k ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); });
    ctx.stroke();
  };
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = col; ctx.fillStyle = col;

  // motion smear on the striking limb
  if (f.st === 'atk' && f.mv) {
    const m = MOVES[f.mv];
    if (f.mt >= m.su && f.mt < m.su + m.ac + 0.05) {
      const jw = joints(P_[m.w]), a = jw[m.limb], b = j[m.limb];
      ctx.globalAlpha *= 0.22; ctx.lineWidth = 14;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo((a.x + b.x) / 2 + 10, (a.y + b.y) / 2 - 14, b.x, b.y); ctx.stroke();
      ctx.globalAlpha = alpha == null ? 1 : alpha;
    }
  }
  // back limbs (lighter = further away)
  ctx.globalAlpha *= 0.5;
  line([j.sh, j.be, j.bh], 5, 1);
  line([j.hip, j.bk, j.bf], 5.5, 4);
  ctx.globalAlpha = alpha == null ? 1 : alpha;
  // headband tails for the player
  if (f.isP) {
    ctx.strokeStyle = '#d8262c'; ctx.lineWidth = 3;
    const hx = j.head.x - 7, hy = j.head.y - 3, wv = Math.sin(clock * 14) * 4, back = -10 - Math.min(14, Math.abs(f.vx) * 0.05);
    ctx.beginPath(); ctx.moveTo(hx, hy); ctx.quadraticCurveTo(hx + back * 0.6, hy - 4 + wv, hx + back * 1.4, hy + wv); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(hx, hy + 2); ctx.quadraticCurveTo(hx + back * 0.5, hy + 4 - wv, hx + back * 1.2, hy + 8 - wv); ctx.stroke();
    ctx.strokeStyle = col;
  }
  // torso, front limbs
  line([j.hip, j.neck], 6.5, 7);
  line([j.hip, j.fk, j.ff], 5.5, 9);
  line([j.sh, j.fe, j.fh], 5, 12);
  // head
  const hq = J(j.head, 15);
  ctx.beginPath(); ctx.arc(hq.x, hq.y, LEN.head, 0, Math.PI * 2); ctx.fill();
  if (f.isP) { ctx.fillStyle = '#d8262c'; ctx.fillRect(hq.x - LEN.head, hq.y - 4.5, LEN.head * 2, 3.5); }
  // eye
  ctx.fillStyle = PAPER;
  if (f.st === 'hit' || f.out) { ctx.lineWidth = 1.6; ctx.strokeStyle = PAPER; ctx.beginPath(); ctx.moveTo(hq.x + 2, hq.y - 3); ctx.lineTo(hq.x + 7, hq.y + 2); ctx.moveTo(hq.x + 7, hq.y - 3); ctx.lineTo(hq.x + 2, hq.y + 2); ctx.stroke(); }
  else if (f.st === 'dizzy') { ctx.beginPath(); ctx.arc(hq.x + 4, hq.y, 2.5, 0, Math.PI * 2); ctx.fill(); }
  else { ctx.beginPath(); ctx.ellipse(hq.x + 4.5, hq.y + 0.5, 2.4, f.st === 'atk' ? 1.2 : 2.6, 0, 0, Math.PI * 2); ctx.fill(); }
  // The Editor wears a crown
  if (!f.isP && R.name === 'The Editor') {
    ctx.fillStyle = '#f2b705';
    ctx.beginPath(); ctx.moveTo(hq.x - 8, hq.y - 8); ctx.lineTo(hq.x - 8, hq.y - 17); ctx.lineTo(hq.x - 4, hq.y - 12); ctx.lineTo(hq.x, hq.y - 19); ctx.lineTo(hq.x + 4, hq.y - 12); ctx.lineTo(hq.x + 8, hq.y - 17); ctx.lineTo(hq.x + 8, hq.y - 8); ctx.closePath(); ctx.fill();
  }
  if (f.st === 'dizzy') {   // dizzy stars
    for (let i = 0; i < 3; i++) {
      const a = clock * 6 + i * 2.1;
      ctx.fillStyle = '#f2b705'; ctx.beginPath(); ctx.arc(hq.x + Math.cos(a) * 13, hq.y - 16 + Math.sin(a) * 4, 2.4, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
}

function drawStage() {
  ctx.save(); ctx.translate(CX, GY); ctx.scale(K, K);
  const L = stageEdge[0], Rr = stageEdge[1];
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(L[0].x, 0);
    for (let x = -STAGE + 15; x < STAGE; x += 30) ctx.lineTo(x, (x * 7 % 3) * 0.3);
    for (const p of Rr) ctx.lineTo(p.x, p.y);
    for (let x = STAGE - 15; x > -STAGE; x -= 22) ctx.lineTo(x, 26 + ((x * 13) % 5) * 0.4);
    for (let i = L.length - 1; i >= 0; i--) ctx.lineTo(L[i].x, L[i].y);
    ctx.closePath();
  };
  ctx.save(); ctx.translate(4, 7); path(); ctx.fillStyle = 'rgba(60,40,20,.18)'; ctx.fill(); ctx.restore();
  path(); ctx.fillStyle = '#c99c5e'; ctx.fill();
  ctx.strokeStyle = '#a77a40'; ctx.lineWidth = 1.2; ctx.stroke();
  ctx.strokeStyle = 'rgba(255,240,210,.55)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(-STAGE + 4, 1.5); ctx.lineTo(STAGE - 4, 1.5); ctx.stroke();
  ctx.strokeStyle = 'rgba(120,85,40,.25)'; ctx.lineWidth = 1;
  for (let i = 0; i < 9; i++) { const x = -STAGE + 30 + i * 46; ctx.beginPath(); ctx.moveTo(x, 8 + (i % 3) * 4); ctx.lineTo(x + 22, 10 + (i % 2) * 6); ctx.stroke(); }
  ctx.restore();
}

function drawBlots() {
  for (const b of blots) {
    ctx.globalAlpha = b.a; ctx.fillStyle = b.col;
    const x = sx(b.x), y = sy(b.y), r = b.r * K;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    for (const d of b.drops) { ctx.beginPath(); ctx.arc(x + d[0] * K, y + d[1] * K, d[2] * K, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.globalAlpha = 1;
}

function font(size, w) { return (w || '900') + ' italic ' + size + 'px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'; }
function text(s, x, y, size, col, align, w, outline) {
  ctx.font = font(size, w); ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle';
  if (outline) { ctx.lineWidth = outline; ctx.strokeStyle = PAPER; ctx.lineJoin = 'round'; ctx.strokeText(s, x, y); }
  ctx.fillStyle = col; ctx.fillText(s, x, y);
}

function render() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.drawImage(bg, 0, 0, W, H);
  ctx.save();
  if (shake > 0) ctx.translate(rnd(-shake, shake) * 0.6, rnd(-shake, shake) * 0.6);
  drawBlots();
  drawStage();

  const fighters = (mode === 'title' || mode === 'champ') ? (demo ? [demo.p, demo.a] : []) : [P, A];
  for (const f of fighters) {
    if (!f || f.out && f.y > blastY) continue;
    if (Math.abs(f.x) <= STAGE && f.y > -200) {
      const sc = clamp(1 + f.y / 200, 0.3, 1);
      ctx.fillStyle = 'rgba(60,40,20,.2)'; ctx.beginPath(); ctx.ellipse(sx(f.x), sy(0) + 1, 18 * K * sc, 4 * K * sc, 0, 0, Math.PI * 2); ctx.fill();
    }
  }
  // a fighter with a full ink meter drips ink
  if (mode === 'fight') for (const f of [P, A]) if (f && !f.out && f.ink >= INK_FULL) {
    ctx.strokeStyle = f.col; ctx.globalAlpha = 0.25 + 0.15 * Math.sin(clock * 10); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(sx(f.x), sy(f.y - 45), 28 * K, 52 * K, 0, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
    if (Math.random() < 0.25) parts.push({ x: f.x + rnd(-14, 14), y: f.y - rnd(20, 70), vx: 0, vy: 20, life: 0.4, max: 0.4, col: f.col, r: 2, g: 0.6 });
  }
  for (const s of shots) {
    s.tr.forEach((q, i) => { ctx.globalAlpha = (i + 1) / s.tr.length * 0.35; ctx.fillStyle = s.col; ctx.beginPath(); ctx.arc(sx(q.x), sy(q.y), BLOT.r * K * (0.4 + i / s.tr.length * 0.5), 0, Math.PI * 2); ctx.fill(); });
    ctx.globalAlpha = 1; ctx.fillStyle = s.col; ctx.beginPath();
    const wob = clock * 30;
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2, rr = BLOT.r * K * (1 + 0.18 * Math.sin(wob + i * 2.3)); i ? ctx.lineTo(sx(s.x) + Math.cos(a) * rr, sy(s.y) + Math.sin(a) * rr) : ctx.moveTo(sx(s.x) + Math.cos(a) * rr, sy(s.y) + Math.sin(a) * rr); }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.beginPath(); ctx.arc(sx(s.x) - 3 * K, sy(s.y) - 3 * K, 2.5 * K, 0, Math.PI * 2); ctx.fill();
  }
  // attacker drawn on top
  const order = fighters.slice().sort((a, b) => (a.st === 'atk') - (b.st === 'atk'));
  for (const f of order) if (f) drawFighter(f);
  if (P && !P.out && (mode === 'fight' || mode === 'ready' || mode === 'roundEnd')) {
    ctx.globalAlpha = 0.75;
    text(pname(), sx(P.x), sy(P.y - 112), Math.max(10, 12 * K), INK, 'center', '900', 3);
    ctx.globalAlpha = 1;
  }

  for (const p of parts) {
    ctx.globalAlpha = Math.min(1, p.life / p.max * 2); ctx.fillStyle = p.col;
    ctx.beginPath(); ctx.arc(sx(p.x), sy(p.y), p.r * K, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  // speed lines
  for (const im of impacts) {
    const x = sx(im.x), y = sy(im.y), a = im.t / 0.14;
    ctx.strokeStyle = 'rgba(24,24,29,' + (0.7 * a) + ')'; ctx.lineWidth = 2.5;
    for (let i = 0; i < 18; i++) {
      const ang = i / 18 * Math.PI * 2 + i, r0 = 30 * K + (1 - a) * 40, r1 = r0 + 60 * K;
      ctx.beginPath(); ctx.moveTo(x + Math.cos(ang) * r0, y + Math.sin(ang) * r0); ctx.lineTo(x + Math.cos(ang) * r1, y + Math.sin(ang) * r1); ctx.stroke();
    }
  }
  for (const p of pops) { ctx.globalAlpha = Math.min(1, p.t * 2); text(p.s, sx(p.x), sy(p.y), p.size, p.col, 'center', '900', 4); }
  ctx.globalAlpha = 1;
  if (bubble && A && !A.out && mode !== 'title') drawBubble();
  ctx.restore();

  if (whiteT > 0) { ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillRect(0, 0, W, H); }
  drawHUD();
  if (paused) drawHelp();
}

function drawBubble() {
  const x = sx(A.x), y = sy(A.y - 112);
  ctx.font = font(15, '800');
  const w = ctx.measureText(bubble.text).width + 20, h = 28;
  const bx = clamp(x - w / 2, 8, W - w - 8);
  ctx.globalAlpha = Math.min(1, bubble.t * 3);
  ctx.fillStyle = '#ffffff'; ctx.strokeStyle = R.col; ctx.lineWidth = 2;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(bx, y - h, w, h, 10); else ctx.rect(bx, y - h, w, h);
  ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x - 6, y); ctx.lineTo(x, y + 9); ctx.lineTo(x + 6, y); ctx.fillStyle = '#ffffff'; ctx.fill();
  text(bubble.text, bx + w / 2, y - h / 2, 15, R.col, 'center', '800');
  ctx.globalAlpha = 1;
}

function drawHUD() {
  if (mode === 'title') {
    const t = Math.min(52, W * 0.13);
    ctx.save(); ctx.translate(CX, H * 0.16); ctx.rotate(-0.05);
    text('INK BRAWL', 0, 0, t, INK, 'center', '900', 6);
    ctx.restore();
    text('Stick-figure duels. Your rival learns how you fight.', CX, H * 0.16 + t * 0.85, Math.min(15, W * 0.038), '#5a5348', 'center', '600');
    // fighter card: name, rank, progress. Tap it to rename.
    const cy = H * 0.16 + t * 0.85 + 36;
    if (save.name) {
      text('✎ ' + pname(), CX, cy, 20, INK, 'center', '900', 4);
      const rp = rankProg(), bw = 150;
      text('Rank: ' + rankName() + (rp.need ? ' · ' + rp.cur + '/' + rp.need + ' XP' : ' · MAX'), CX, cy + 22, 12, '#5a5348', 'center', '800');
      ctx.fillStyle = 'rgba(0,0,0,.1)'; ctx.fillRect(CX - bw / 2, cy + 32, bw, 5);
      ctx.fillStyle = '#d8262c'; ctx.fillRect(CX - bw / 2, cy + 32, bw * rp.f, 5);
      nameCard = { y0: cy - 22, y1: cy + 44, w: 110 };
    } else {
      text('✎ Tap here to name your fighter', CX, cy, 15, '#d8262c', 'center', '900');
      nameCard = { y0: cy - 20, y1: cy + 16, w: 150 };
    }
    const r = RIVALS[Math.min(save.rival, RIVALS.length - 1)];
    ctx.globalAlpha = 0.6 + 0.4 * Math.sin(clock * 4);
    text('Tap to fight', CX, H * 0.82, 22, INK, 'center', '900');
    ctx.globalAlpha = 1;
    text('Rival ' + (save.rival + 1) + ' of 8: ' + r.name + ' · ' + r.trait, CX, H * 0.82 + 30, 14, r.col, 'center', '800');
    text('Left: drag to move, flick ↑ jump · Right: tap jab, swipe ↑ ↓ →, hold block · INK when full', CX, H - 22, Math.min(11, W * 0.027), '#7a7264', 'center', '600');
    return;
  }
  if (mode === 'champ') {
    text('CHAMPION OF THE PAGE', CX, H * 0.25, Math.min(34, W * 0.075), INK, 'center', '900', 5);
    text('You out-thought all 8 rivals, even The Editor.', CX, H * 0.25 + 36, 15, '#5a5348', 'center', '700');
    if (modeT > 1.2) text('Tap to return', CX, H * 0.82, 18, INK, 'center', '800');
    return;
  }
  const top = 18;
  // player
  text(pname() + ' · ' + rankName().toUpperCase(), 18, top + 4, 11, INK, 'left', '900');
  text(Math.round(P.dmg) + '%', 18, top + 30, 32, dmgCol(P.dmg, INK), 'left', '900', 4);
  pips(18, top + 56, wins[0], INK, 'left');
  // rival
  text(R.name.toUpperCase(), W - 18, top + 4, 13, R.col, 'right', '900');
  text(Math.round(A.dmg) + '%', W - 18, top + 30, 32, dmgCol(A.dmg, R.col), 'right', '900', 4);
  pips(W - 18, top + 56, wins[1], R.col, 'right');
  inkBar(62, top + 56, P.ink, INK, 'left');
  inkBar(W - 62, top + 56, A.ink, R.col, 'right');
  if (mode === 'fight' || mode === 'ready') drawInkBtn();
  // timer
  ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(CX, top + 22, 20, 0, Math.PI * 2); ctx.stroke();
  text(String(Math.max(0, Math.ceil(timer))), CX, top + 23, 18, INK, 'center', '900');
  text('ROUND ' + roundNo, CX, top + 54, 11, '#5a5348', 'center', '800');
  // what the rival has learned
  const kn = know();
  if (kn > 0.08) {
    const h = topHabit(), sh = share(h);
    const y = top + 76;
    text('READING YOU', W - 18, y, 10, R.col, 'right', '900');
    const bw = 70;
    ctx.fillStyle = 'rgba(0,0,0,.08)'; ctx.fillRect(W - 18 - bw, y + 9, bw, 5);
    ctx.fillStyle = R.col; ctx.fillRect(W - 18 - bw, y + 9, bw * (kn / 0.95), 5);
    if (sh > 0.25) text('your ' + HABIT_LABEL[h] + ' ' + Math.round(sh * 100) + '%', W - 18, y + 26, 11, R.col, 'right', '800');
  }
  // touch hints
  if (isTouch && (mode === 'ready' || (mode === 'fight' && firstFight && roundNo === 1 && timer > ROUND_TIME - 6))) {
    ctx.globalAlpha = 0.55;
    ctx.setLineDash([6, 8]); ctx.strokeStyle = '#8a8070'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(W * 0.42, H * 0.72); ctx.lineTo(W * 0.42, H - 10); ctx.stroke(); ctx.setLineDash([]);
    text('drag ◀ ▶', W * 0.21, H * 0.82, 13, '#5a5348', 'center', '800');
    text('flick ↑ to jump', W * 0.21, H * 0.82 + 20, 12, '#5a5348', 'center', '700');
    text('tap: jab · hold: block', W * 0.71, H * 0.82, 13, '#5a5348', 'center', '800');
    const ib = inkBtn(); text('land hits to fill INK ↑', ib.x - 40, ib.y + ib.r + 22, 11, '#5a5348', 'center', '800');
    text('swipe ↑ upper · ↓ sweep · → kick', W * 0.71, H * 0.82 + 20, 12, '#5a5348', 'center', '700');
    ctx.globalAlpha = 1;
  }

  if (mode === 'vs') {
    veil(0.55);
    const a = Math.min(1, modeT * 3);
    ctx.globalAlpha = a;
    text(pname(), CX, H * 0.3, 34, INK, 'center', '900', 5);
    text(rankName(), CX, H * 0.3 - 30, 13, '#5a5348', 'center', '800');
    text('vs', CX, H * 0.3 + 40, 20, '#5a5348', 'center', '800');
    text(R.name.toUpperCase(), CX, H * 0.3 + 82, 38, R.col, 'center', '900', 5);
    text('Rival ' + (rivalIdx + 1) + ' of 8 · ' + R.trait, CX, H * 0.3 + 118, 14, '#5a5348', 'center', '700');
    ctx.globalAlpha = 1;
  }
  if (mode === 'ready') {
    const s = modeT < 0.75 ? 'READY' : 'INK!';
    const sc = 1 + Math.max(0, 0.3 - (modeT % 0.75)) * 1.5;
    text(s, CX, H * 0.36, 48 * sc, s === 'INK!' ? '#d8262c' : INK, 'center', '900', 6);
  }
  if (mode === 'fight' && firstFight && modeT > 6) firstFight = false;
  if (mode === 'roundEnd') {
    const sc = 1 + Math.max(0, 0.25 - modeT) * 2;
    text(lastResult, CX, H * 0.34, 50 * sc, '#d8262c', 'center', '900', 6);
    if (modeT > 0.7) {
      const who = lastResult === 'DRAW' ? 'No point. Go again.' : (wins[0] + wins[1] > 0 ? pname() + ' ' + wins[0] + ' — ' + wins[1] + ' ' + R.name.toUpperCase() : '');
      text(who, CX, H * 0.34 + 44, 18, INK, 'center', '900', 4);
    }
  }
  if (mode === 'matchEnd') {
    veil(0.6);
    if (matchWon) {
      text('YOU BEAT ' + R.name.toUpperCase(), CX, H * 0.32, Math.min(34, W * 0.08), INK, 'center', '900', 5);
      if (rivalIdx < RIVALS.length - 1) {
        const n = RIVALS[rivalIdx + 1];
        text('Next: ' + n.name + ' · ' + n.trait, CX, H * 0.32 + 40, 15, n.col, 'center', '800');
      }
    } else {
      text(R.name.toUpperCase() + ' READ YOU', CX, H * 0.32, Math.min(34, W * 0.08), R.col, 'center', '900', 5);
      const h = topHabit();
      text('It learned your ' + HABIT_LABEL[h] + ' (' + Math.round(share(h) * 100) + '% of what you did). Mix it up.', CX, H * 0.32 + 40, 14, '#5a5348', 'center', '700');
    }
    // xp + rank
    {
      const y = H * 0.32 + 76, rp = rankProg(), bw = 180;
      text('+' + matchXp + ' XP · ' + rankName() + (rp.need ? ' (' + rp.cur + '/' + rp.need + ')' : ''), CX, y, 15, INK, 'center', '900');
      const f = Math.min(1, modeT / 0.8) * rp.f;
      ctx.fillStyle = 'rgba(0,0,0,.1)'; ctx.fillRect(CX - bw / 2, y + 12, bw, 6);
      ctx.fillStyle = '#d8262c'; ctx.fillRect(CX - bw / 2, y + 12, bw * f, 6);
      if (rankIdx(save.xp) > rankAtStart) {
        const sc = 1 + Math.max(0, 0.6 - modeT) * 0.8;
        ctx.save(); ctx.translate(CX, y + 52); ctx.rotate(-0.04);
        text('RANK UP! ' + rankName().toUpperCase(), 0, 0, 26 * sc * Math.min(1, W / 380), '#d8262c', 'center', '900', 5);
        ctx.restore();
      }
    }
    if (modeT > 0.9) { ctx.globalAlpha = 0.6 + 0.4 * Math.sin(clock * 4); text(matchWon ? 'Tap for the next rival' : 'Tap to rematch', CX, H * 0.32 + 170 > H * 0.78 ? H * 0.32 + 170 : H * 0.78, 20, INK, 'center', '900'); ctx.globalAlpha = 1; }
  }
}
function inkBar(x, y, v, col, align) {
  const w = 56, x0 = align === 'left' ? x : x - w, f = v / INK_FULL;
  ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.strokeRect(x0, y - 3, w, 6);
  ctx.fillStyle = col; ctx.globalAlpha = f >= 1 ? 0.7 + 0.3 * Math.sin(clock * 10) : 0.8;
  ctx.fillRect(align === 'left' ? x0 : x0 + w * (1 - f), y - 3, w * f, 6); ctx.globalAlpha = 1;
}
function inkBtn() { return { x: W - 52, y: H - Math.max(150, H * 0.3), r: 30 }; }
function drawInkBtn() {
  const b = inkBtn(), f = P.ink / INK_FULL, full = f >= 1;
  ctx.globalAlpha = full ? 1 : 0.45;
  ctx.fillStyle = full ? INK : 'rgba(244,236,216,.8)'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
  ctx.strokeStyle = '#d8262c'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 5, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2); ctx.stroke();
  const sc = full ? 1 + 0.08 * Math.sin(clock * 8) : 1;
  text('INK', b.x, b.y - 2, 14 * sc, full ? PAPER : INK, 'center', '900');
  if (!isTouch) text('U', b.x, b.y + 13, 9, full ? PAPER : '#5a5348', 'center', '800');
  ctx.globalAlpha = 1;
}
function drawHelp() {
  veil(0.93);
  const s = Math.min(1, W / 400, H / 760), x = CX;
  let y = Math.max(44, H * 0.08);
  text('PAUSED', x, y, 34 * s, INK, 'center', '900', 5); y += 40 * s;
  text('Knock ' + R.name + ' off the paper. Best of 3 rounds.', x, y, 14 * s, '#5a5348', 'center', '700'); y += 22 * s;
  text('The more % damage, the further they fly.', x, y, 14 * s, '#5a5348', 'center', '700'); y += 32 * s;
  const rows = isTouch ? [
    ['LEFT THUMB', 'drag ◀ ▶ to move · flick ↑ to jump (twice in the air)'],
    ['TAP', 'jab: fast and safe'],
    ['SWIPE →', 'kick: slow, sends them flying'],
    ['SWIPE ↑', 'uppercut: launches upward, beats jumpers'],
    ['SWIPE ↓', 'sweep: low, beats blocking'],
    ['SWIPE ←', 'dash back'],
    ['HOLD', 'block · block just as a hit lands = PARRY'],
    ['INK', 'fills as you land hits · tap it to throw a blot']
  ] : [
    ['A / D', 'move · W or Space jump (twice in the air)'],
    ['J', 'jab: fast and safe'],
    ['K', 'kick: slow, sends them flying'],
    ['I', 'uppercut: launches upward, beats jumpers'],
    ['L', 'sweep: low, beats blocking'],
    ['SHIFT', 'dash back'],
    ['S', 'block · block just as a hit lands = PARRY'],
    ['U', 'throw ink blot when the INK meter is full']
  ];
  for (const [k, d] of rows) {
    text(k, x, y, 13 * s, '#d8262c', 'center', '900');
    text(d, x, y + 17 * s, 12.5 * s, INK, 'center', '700');
    y += 42 * s;
  }
  y += 10 * s;
  text('Your rival learns your habits. Mix it up.', x, y, 14 * s, R.col, 'center', '800'); y += 40 * s;
  ctx.globalAlpha = 0.6 + 0.4 * Math.sin(clock * 4 + performance.now() / 250);
  text(isTouch ? 'Tap to continue' : 'Press Space to continue', x, Math.min(H - 40, y), 20 * s, INK, 'center', '900');
  ctx.globalAlpha = 1;
}
function veil(a) { ctx.fillStyle = 'rgba(244,236,216,' + a + ')'; ctx.fillRect(0, 0, W, H); }
function dmgCol(d, base) { return d > 120 ? '#d8262c' : d > 70 ? '#c45a00' : base; }
function pips(x, y, n, col, align) {
  for (let i = 0; i < 2; i++) {
    const px = align === 'left' ? x + 7 + i * 18 : x - 7 - i * 18;
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, y, 6, 0, Math.PI * 2); ctx.stroke();
    if (i < n) { ctx.fillStyle = col; ctx.fill(); }
  }
}

// ---------- loop ----------
let last = 0, acc = 0, running = true;
function frame(now) {
  if (!last) last = now;
  let dt = (now - last) / 1000; last = now;
  if (dt > 0.1) dt = 0.1;
  if (slowT > 0) { slowT -= dt; ts = 0.3; } else ts = 1;
  if (running && !paused) { acc += dt * ts; while (acc >= DT) { step(DT); acc -= DT; } }
  render();
  if (running) musicTick();
  requestAnimationFrame(frame);
}
document.addEventListener('visibilitychange', () => { running = !document.hidden; last = 0; acc = 0; tL = tR = null; if (document.hidden) setPaused(true); });
window.addEventListener('resize', resize);
// stop the browser zooming: block pinch, double-tap and gesture zoom, and snap back if it zoomed anyway
const noZoom = e => { if (e.touches && e.touches.length > 1 || e.type === 'gesturestart' || e.type === 'dblclick') e.preventDefault(); };
['touchstart', 'touchmove', 'gesturestart', 'gesturechange', 'dblclick'].forEach(t => document.addEventListener(t, noZoom, { passive: false }));
let lastTouchEnd = 0;
document.addEventListener('touchend', e => { if (e.target && (e.target.tagName === 'INPUT' || e.target.id === 'nmok')) return; const n = Date.now(); if (n - lastTouchEnd < 350) e.preventDefault(); lastTouchEnd = n; }, { passive: false });
function unzoom() {
  const vv = window.visualViewport;
  if (!vv || vv.scale <= 1.01) return;
  const meta = document.querySelector('meta[name=viewport]');
  if (meta) { const c = meta.content; meta.content = c + ',minimum-scale=1'; setTimeout(() => { meta.content = c; }, 60); }
  window.scrollTo(0, 0);
}
if (window.visualViewport) window.visualViewport.addEventListener('resize', unzoom);
setInterval(unzoom, 1000);
const nmOk = document.getElementById('nmok');
if (nmOk) nmOk.addEventListener('click', e => { e.stopPropagation && e.stopPropagation(); closeName(); });
const pauseBtn = document.getElementById('pause');
if (pauseBtn) pauseBtn.addEventListener('click', e => { e.stopPropagation && e.stopPropagation(); audioInit(); setPaused(!paused); });
const muteBtn = document.getElementById('mute');
if (muteBtn) muteBtn.addEventListener('click', e => { e.stopPropagation && e.stopPropagation(); audioInit(); setMuted(!save.muted); });
setMuted(save.muted);

makeStage();
P = makeFighter(true); A = makeFighter(false);
resize();
requestAnimationFrame(frame);

// hook for the headless test sim
window.__ink = { get mode() { return mode; }, get save() { return save; }, get wins() { return wins; }, get rival() { return rivalIdx; },
  get P() { return P; }, get A() { return A; }, get know() { return know(); }, menuTap, queueAtk, keys, buf, get shots() { return shots; } };
})();
