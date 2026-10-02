'use strict';
/* Neon Grand Prix — race logic (world/games/kart-logic.js) and the kart.js wrapper.
   The legacy kart tests in games-logic.test.js run unmodified through kart.js. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const KL = require('../world/games/kart-logic.js');
const Kart = require('../world/games/kart.js');
const C = require('../world/world-core.js');

const STEP = KL.STEP, PHYS = KL.PHYS, IDS = Object.keys(KL.TRACKS);
const api = { sound() {}, reduced: true };
const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, (msg || '') + ` ${a} vs ${b} (±${eps})`);
const wrapAng = a => Math.atan2(Math.sin(a), Math.cos(a));

/* ---------- helpers ---------- */
/* mirrors KL.simulate (3 s countdown, then a driver) but logs every event with its step */
function runLogged(id, opts, style, onStep) {
  const race = KL.newRace(id, opts);
  race.wantEvents = true;
  const log = [];
  let c = 3;
  while (c > 0) { c -= STEP; const ct = Math.max(0, c); race.countdown(ct, race.driveCountdown(ct, style), true); }
  let n = 0;
  while (!race.s.done && n < 120 * 300) {
    const lap = race.pr.lap;
    race.step(STEP, style ? race.driveStyle() : race.drivePlain());
    n++;
    for (const e of race.s.events) log.push(Object.assign({ step: n, lap }, e));
    race.s.events.length = 0;
    if (onStep) onStep(race, n);
  }
  return { race, log, steps: n };
}
const memo = {};
const plainRun = id => memo['p' + id] || (memo['p' + id] = runLogged(id, { rivals: false }, false));
const styleRun = id => memo['s' + id] || (memo['s' + id] = runLogged(id, { rivals: false }, true));

/* park the kart at sample i (lateral offset lat, +right), facing along the track at speed v */
function parkAt(race, i, v, lat) {
  const tr = race.track, p = tr.pts[i], t = tr.tang[i];
  lat = lat || 0;
  race.k.x = p[0] - t[1] * lat; race.k.y = p[1] + t[0] * lat;
  race.k.h = Math.atan2(t[1], t[0]); race.k.v = v;
  race.pr.idx = i; race.pr.s = tr.cum[i];
}
/* hold a drift in place: re-park every step so the timers are all that change */
function heldDrift(race, i, steps, inp, lat, events) {
  for (let n = 0; n < steps; n++) {
    parkAt(race, i, 200, lat);
    race.step(STEP, inp);
    if (events) for (const e of race.s.events) events.push(Object.assign({ n }, e));
    race.s.events.length = 0;
  }
}
/* drive the kart at the wall from just inside it: angle 0 = along the track, PI/2 = head-on */
function aimAtWall(race, i, side, ang, v) {
  parkAt(race, i, v, side * (KL.WALL - 1));
  const t = race.track.tang[i];
  race.k.h = Math.atan2(t[1], t[0]) + side * ang;
}
function xorshift(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
/* test-only 'sloppy child': the plain driver with ±0.12 rad look jitter, 0.25 s input delay
   and throttle lifts on 15% of 1 s windows */
function sloppyRun(id, opts, seed, onStep) {
  const race = KL.newRace(id, opts);
  race.wantEvents = true;
  const R = xorshift(seed), queue = [];
  let lift = false, jit = 0, n = 0;
  while (!race.s.done && n < 120 * 300) {
    if (n % 120 === 0) lift = R() < 0.15;
    if (n % 12 === 0) jit = (R() * 2 - 1) * 0.12;
    const inp = race.drivePlain({ jitter: jit });
    if (lift) inp.up = false;
    queue.push(inp);
    race.step(STEP, queue.length > 30 ? queue.shift() : {});
    n++;
    if (onStep) onStep(race);
    race.s.events.length = 0;
  }
  return race;
}
const BEAT2 = KL.BEAT2;

/* ---------------- refactor guard + drivers ---------------- */
test('kart-logic: features off reproduces the legacy autopilot times exactly (refactor guard)', () => {
  const want = { track_loop: 52683, track_volcano: 61158, track_beach: 72525 };
  for (const id of IDS) {
    const race = KL.newRace(id, { features: false, rivals: false });
    let n = 0;
    while (!race.s.done && n < 120 * 300) { race.step(STEP, race.drivePlain()); n++; }
    assert.deepEqual(race.result(), { finished: true, ms: want[id] }, id);
    assert.equal(race.s.wall, 0);
  }
});

test('kart-logic: time floor — VCAP keeps every track ≥ 40 s, and forced boost never breaks it', () => {
  for (const id of IDS) {
    const tr = KL.buildTrack(id);
    assert.ok(tr.len * tr.laps / PHYS.VCAP >= 40, `${id} floor ${(tr.len * tr.laps / PHYS.VCAP).toFixed(1)} s`);
    const race = KL.newRace(id, { rivals: false, forceBoost: true });
    let n = 0, maxV = 0;
    while (!race.s.done && n < 120 * 300) { race.step(STEP, race.drivePlain()); maxV = Math.max(maxV, Math.abs(race.k.v)); n++; }
    assert.ok(maxV <= PHYS.VCAP, `${id} max speed ${maxV}`);
    const res = race.result();
    assert.ok(res && res.ms >= C.GAME_RULES.kart.minMs, `${id} boosted finish ${res && res.ms}`);
    assert.ok(res.ms >= tr.len * tr.laps / PHYS.VCAP * 1000 - 1, 'never under the VCAP floor');
  }
});

test('kart-logic: the plain driver is wall-free, earns Silver but never Gold', () => {
  for (const id of IDS) {
    const { race } = plainRun(id);
    const res = race.result(), par = KL.PAR[id];
    assert.equal(race.s.wall, 0, id + ' walls');
    assert.ok(C.validResult('kart', res), 'valid result');
    assert.ok(res.ms <= par.silver && res.ms > par.gold, `${id} plain ${res.ms} vs silver ${par.silver} gold ${par.gold}`);
    assert.equal(KL.medalFor(id, res.ms), 2);
  }
});

test('kart-logic: the style driver is wall-free, beats Holo par and the plain driver by ≥ 1.5 s', () => {
  for (const id of IDS) {
    const { race } = styleRun(id), plain = plainRun(id).race.result().ms;
    const res = race.result();
    assert.equal(race.s.wall, 0, id + ' walls');
    assert.ok(C.validResult('kart', res));
    assert.ok(res.ms < KL.PAR[id].holo, `${id} style ${res.ms} vs holo ${KL.PAR[id].holo}`);
    assert.ok(plain - res.ms >= 1500, `${id} style gain ${plain - res.ms} ms`);
    assert.ok(race.s.sparks.reduce((a, b) => a + b, 0) > 0 && race.s.tricks > 0 && race.s.rocket, 'it drifts, tricks and rocket-starts');
  }
});

test('kart-logic: PAR table is ordered, above the floor, and pinned within ±0.5 s of its formulas', () => {
  const ceilTo = (v, q) => Math.ceil(v / q - 1e-9) * q, roundTo = (v, q) => Math.round(v / q) * q;
  for (const id of IDS) {
    const p = KL.PAR[id], tr = KL.buildTrack(id), floor = tr.len * tr.laps / PHYS.VCAP * 1000;
    assert.ok(p.bronze > p.silver && p.silver > p.gold && p.gold > p.holo && p.holo > floor, id + ' ordering');
    assert.equal(tr.par, p);
    const plain = plainRun(id).race.result().ms / 1000, style = styleRun(id).race.result().ms / 1000;
    near(p.bronze / 1000, ceilTo(plain * 1.6, 0.5), 0.5, id + ' bronze');
    near(p.silver / 1000, ceilTo(plain * 1.12, 0.5), 0.5, id + ' silver');
    near(p.gold / 1000, roundTo((plain + style) / 2, 0.5), 0.5, id + ' gold');
    near(p.holo / 1000, ceilTo(style * 1.005, 0.1), 0.5, id + ' holo');
  }
});

test('kart-logic: medalFor / nextMedal / classUnlocked at the exact boundaries', () => {
  const id = 'track_volcano', p = KL.PAR[id];
  assert.equal(KL.medalFor(id, null), 0);
  assert.equal(KL.medalFor(id, p.bronze + 1), 0);
  assert.equal(KL.medalFor(id, p.bronze), 1);
  assert.equal(KL.medalFor(id, p.silver), 2);
  assert.equal(KL.medalFor(id, p.gold + 1), 2);
  assert.equal(KL.medalFor(id, p.gold), 3);
  assert.equal(KL.medalFor(id, p.holo), 4);
  assert.equal(KL.medalFor('track_nope', 1000), 0);
  assert.deepEqual(KL.nextMedal(id, null), { medal: 1, id: 'bronze', name: 'Bronze', icon: '🥉', ms: p.bronze, gap: null });
  assert.equal(KL.nextMedal(id, p.silver).id, 'gold');
  assert.equal(KL.nextMedal(id, p.silver).gap, p.silver - p.gold);
  assert.equal(KL.nextMedal(id, p.gold).id, 'holo');
  assert.equal(KL.nextMedal(id, p.holo), null);
  assert.equal(KL.classUnlocked(id, null, 0), true);
  assert.equal(KL.classUnlocked(id, null, 1), false);
  assert.equal(KL.classUnlocked(id, p.bronze, 1), true);
  assert.equal(KL.classUnlocked(id, p.bronze + 1, 1), false);
  assert.equal(KL.classUnlocked(id, p.bronze, 2), false);
  assert.equal(KL.classUnlocked(id, p.silver, 2), true);
  assert.equal(KL.classUnlocked(id, p.silver + 1, 2), false);
  assert.equal(KL.fmt(52410), '0:52.41');
  assert.equal(KL.fmt(82500, 1), '1:22.5');
});

/* ---------------- determinism ---------------- */
test('kart-logic: deterministic — same inputs give deep-equal results and event logs', () => {
  for (const id of ['track_loop', 'track_beach']) {
    const a = runLogged(id, { mode: 'race', cls: 0 }, true), b = runLogged(id, { mode: 'race', cls: 0 }, true);
    assert.deepEqual(a.race.result(), b.race.result());
    assert.deepEqual(a.log, b.log);
    assert.ok(a.log.length > 50);
  }
});

test('kart: frame-rate independent — 30 and 144 fps through the fixed step give identical times', () => {
  function runAt(fps) {
    const r = Kart.newRound(api, 'track_volcano', {});
    let acc = 0, t = 0;
    while (!r.done && t < 200) {
      const dt = 1 / fps; t += dt; acc += dt;
      while (acc >= STEP) { r.autopilot(); r.step(STEP, r.autoHeld); acc -= STEP; if (r.done) break; }
    }
    return r.result().ms;
  }
  assert.equal(runAt(30), runAt(144));
});

test('kart-logic: the logic source never uses Math.random or Date', () => {
  const src = fs.readFileSync(path.join(__dirname, '../world/games/kart-logic.js'), 'utf8');
  assert.equal(/Math\.random/.test(src), false);
  assert.equal(/\bDate\b/.test(src), false);
});

/* ---------------- rivals and pacers ---------------- */
test('kart-logic: rivals are one-way — pose, time and Hype identical in every mode and class', () => {
  for (const id of IDS) {
    const cfgs = [{ rivals: false }, { mode: 'race', cls: 0 }, { mode: 'race', cls: 1 }, { mode: 'race', cls: 2 }, { mode: 'solo', pbMs: KL.PAR[id].silver + 4000 }];
    const runs = cfgs.map(o => {
      const poses = [];
      const r = runLogged(id, o, true, race => { poses.push(race.k.x, race.k.y, race.k.h, race.k.v, race.s.wand); });
      return { ms: r.race.result().ms, poses };
    });
    for (let i = 1; i < runs.length; i++) {
      assert.equal(runs[i].ms, runs[0].ms, `${id} config ${i} time`);
      assert.deepEqual(runs[i].poses, runs[0].poses, `${id} config ${i} pose/wand log`);
    }
  }
});

test('kart-logic: the player always starts P6 behind the Glow Crew, on a stable grid', () => {
  const race = KL.newRace('track_loop', { mode: 'race', cls: 0 });
  assert.equal(race.rivals.length, 5);
  assert.deepEqual(race.rivals.map(r => r.name), ['Gumdrop', 'Fizz', 'Sprout', 'Plum', 'Noodle']);
  assert.equal(race.s.place, 6);
  const pc = race.Pc();
  for (const r of race.rivals) {
    assert.ok(r.P > pc + 50, r.name + ' starts ahead');
    assert.ok(Math.abs(r.lat) <= 0.85 * KL.HW + 1e-9);
    assert.ok(Number.isFinite(r.h) && Number.isFinite(r.x));
  }
  for (let i = 0; i < 360; i++) race.step(STEP, {});      /* rivals drive off; the parked player never moves */
  assert.equal(race.k.v, 0);
  assert.ok(race.rivals.every(r => r.P > pc + 100 && Math.abs(r.lat) <= 0.85 * KL.HW + 1e-9));
});

test('kart-logic: Headliner leader crosses at Gold par (±0.05 s) whatever the player does', () => {
  for (const id of IDS) {
    const gold = KL.PAR[id].gold / 1000;
    const still = KL.newRace(id, { mode: 'race', cls: 2 });
    while (still.s.t < gold + 1) still.step(STEP, {});
    near(still.rivals[4].finishT, gold, 0.05, id + ' parked player');
    const vsPlain = plainRunWithRivals(id, 2);
    near(vsPlain.rivals[4].finishT, gold, 0.05, id + ' plain player');
    const order = still.rivals.map(r => r.finishT).filter(Boolean);
    assert.ok(order.every((t, i) => i === 0 || t <= order[i - 1]), 'spread from Silver-ish down to Gold');
  }
});
function plainRunWithRivals(id, cls) { return KL.simulate(id, { mode: 'race', cls }, false); }

test('kart-logic: Debut leader never finishes faster than Silver (mercy band only slows rivals ahead)', () => {
  for (const id of IDS) {
    const silver = KL.PAR[id].silver / 1000;
    const still = KL.newRace(id, { mode: 'race', cls: 1 });
    while (still.s.t < silver * 1.25) still.step(STEP, {});
    assert.ok(still.rivals[4].finished && still.rivals[4].finishT >= silver - 1e-6, `${id} leader ${still.rivals[4].finishT}`);
    const kid = sloppyRun(id, { mode: 'race', cls: 1 }, 5);
    for (const r of kid.rivals) if (r.finished) assert.ok(r.finishT >= silver - 1e-6, `${id} ${r.name} ${r.finishT}`);
  }
});

test('kart-logic: Trainee keeps the pack close for a sloppy child (≥ 85% within 300 px, ≥ 3 passes)', () => {
  for (const id of IDS) {
    let close = 0, total = 0, passes = 0;
    const race = sloppyRun(id, { mode: 'race', cls: 0 }, 7, r => {
      for (const e of r.s.events) if (e.type === 'pass') passes++;
      if (r.s.phase !== 'race') return;
      total++;
      const pc = r.Pc();
      if (r.rivals.some(x => Math.abs(x.P - pc) <= 300)) close++;
    });
    assert.ok(race.result(), id + ' the sloppy child finishes');
    assert.ok(close / total >= 0.85, `${id} close ${(close / total).toFixed(3)}`);
    assert.ok(passes >= 3, `${id} passes ${passes}`);
    assert.equal(race.s.passes, passes);
  }
});

test('kart-logic: places — passes need 1 s to stick, and the place freezes at the line', () => {
  const { race, log } = runLogged('track_loop', { mode: 'race', cls: 0 }, false);
  const passes = log.filter(e => e.type === 'pass');
  assert.equal(passes.length, 5, 'the plain driver passes the whole Trainee crew');
  assert.equal(race.s.finishPlace, 1);
  const fin = log.find(e => e.type === 'finish');
  assert.deepEqual(fin, Object.assign({}, fin, { type: 'finish', place: 1, ms: race.result().ms }));
  assert.ok(log.filter(e => e.type === 'pass' && e.step > fin.step).length === 0, 'no passes after the line');
});

test('kart-logic: Solo pacers replay "Your best" and "Next medal" and report gate splits', () => {
  const id = 'track_loop', pb = 60000;
  const { race, log } = runLogged(id, { mode: 'solo', pbMs: pb }, false);
  assert.equal(race.rivals.length, 0);
  assert.deepEqual(race.pacers.map(p => p.kind), ['best', 'next']);
  assert.equal(race.pacers[1].T, KL.PAR[id].silver, 'next medal above a 60 s best is Silver');
  const gaps = log.filter(e => e.type === 'pacerGap');
  assert.equal(gaps.length, 2 * 4 * 3, 'both pacers at 3 gates + the line, every lap');
  /* the plain driver is ~9.4 s quicker than a 60 s best: by the finish it is well ahead */
  const lastBest = gaps.filter(g => g.kind === 'best').pop();
  near(lastBest.dt, race.result().ms / 1000 - pb / 1000, 0.2, 'final split = time difference');
  for (const p of race.pacers) assert.ok(Math.abs(p.lat) <= 0.85 * KL.HW + 1e-9);
  assert.equal(KL.newRace(id, { mode: 'solo' }).pacers.length, 1, 'no best yet: only the Bronze pacer');
});

/* ---------------- rocket start ---------------- */
function countdownWith(race, inpFn, isStart) {
  let c = 3;
  while (c > 0) { c -= STEP; const ct = Math.max(0, c); race.countdown(ct, inpFn(ct), isStart); }
}
function rocketsIn(race, steps, inpFn) {
  race.wantEvents = true;
  const ev = [];
  for (let n = 0; n < steps; n++) { race.step(STEP, inpFn(race.s.t, n)); ev.push(...race.s.events); race.s.events.length = 0; }
  return ev;
}
test('kart-logic: rocket start — a fresh press at countT 0.2 fires exactly one 1.0 s boost', () => {
  const race = KL.newRace('track_loop', { rivals: false });
  race.wantEvents = true;
  countdownWith(race, ct => ({ up: ct <= 0.2 }), true);
  const ev = rocketsIn(race, 360, () => ({ up: true }));
  assert.equal(ev.filter(e => e.type === 'rocket').length, 1);
  assert.deepEqual(ev.find(e => e.type === 'boost'), { type: 'boost', src: 'rocket', dur: 1 });
  assert.equal(race.s.rocket, true);
});
test('kart-logic: rocket start — a fresh press at s.t 0.1 fires; held through GO or on resume never does', () => {
  const late = KL.newRace('track_loop', { rivals: false });
  countdownWith(late, () => ({}), true);
  assert.equal(rocketsIn(late, 120, t => ({ up: t >= 0.1 })).filter(e => e.type === 'rocket').length, 1);
  const tooLate = KL.newRace('track_loop', { rivals: false });
  countdownWith(tooLate, () => ({}), true);
  assert.equal(rocketsIn(tooLate, 120, t => ({ up: t >= 0.16 })).filter(e => e.type === 'rocket').length, 0);
  const held = KL.newRace('track_loop', { rivals: false });
  countdownWith(held, ct => ({ up: ct <= 0.4 }), true);
  assert.equal(rocketsIn(held, 120, () => ({ up: true })).filter(e => e.type === 'rocket').length, 0, 'held from countT 0.4');
  const resumed = KL.newRace('track_loop', { rivals: false });
  countdownWith(resumed, () => ({ up: true }), true);
  rocketsIn(resumed, 120, () => ({ up: true }));
  resumed.pauseReset();
  countdownWith(resumed, ct => ({ up: ct <= 0.2 }), false);
  assert.equal(rocketsIn(resumed, 60, () => ({ up: true })).filter(e => e.type === 'rocket').length, 0, 'resume countdown');
  const once = KL.newRace('track_loop', { rivals: false });
  countdownWith(once, ct => ({ up: ct <= 0.2 }), true);
  assert.equal(rocketsIn(once, 120, (t, n) => ({ up: n < 3 || n > 6 })).filter(e => e.type === 'rocket').length, 1, 'at most one per race');
});
test('kart-logic: rocket start in Easy Drive is a fresh ✨ press (the gas is always on)', () => {
  const race = KL.newRace('track_loop', { rivals: false, easy: true });
  countdownWith(race, ct => ({ drift: ct <= 0.2 }), true);
  assert.ok(race.rocketWindow() === false || race.s.inCount);
  const ev = rocketsIn(race, 60, () => ({}));
  assert.equal(ev.filter(e => e.type === 'rocket').length, 1);
  assert.ok(race.k.v > 0, 'Easy Drive holds the gas');
});

/* ---------------- drift + sparks ---------------- */
test('kart-logic: drift entry needs ✨ + one steer, ≥ 150 px/s, tarmac, on the ground', () => {
  const id = 'track_beach', i = 160;
  const tryDrift = (setup, inp) => { const r = KL.newRace(id, { rivals: false }); parkAt(r, i, 200); setup(r); r.step(STEP, inp); return r.k.drift.on; };
  assert.equal(tryDrift(() => {}, { up: true, drift: true, right: true }), true, 'the normal case');
  assert.equal(tryDrift(r => { r.k.v = 140; }, { drift: true, right: true }), false, 'too slow');
  assert.equal(tryDrift(r => parkAt(r, i, 200, KL.HW + KL.KERB + 12), { drift: true, right: true }), false, 'on the grass');
  assert.equal(tryDrift(r => { r.k.air.on = true; r.k.air.dur = 0.6; r.k.air.peak = 20; }, { drift: true, right: true }), false, 'airborne');
  assert.equal(tryDrift(() => {}, { drift: true }), false, 'no steering');
  assert.equal(tryDrift(() => {}, { drift: true, left: true, right: true }), false, 'both ways');
});

test('kart-logic: spark tiers flip at 0.55 / 1.1 / 1.8 s; release boosts 0.5 / 0.9 / 1.3 s', () => {
  const race = KL.newRace('track_beach', { rivals: false });
  race.wantEvents = true;
  const ev = [];
  heldDrift(race, 160, 240, { up: true, drift: true, right: true }, 0, ev);
  const at = tier => ev.find(e => e.type === 'driftTier' && e.tier === tier).n + 1;
  assert.deepEqual(ev.find(e => e.type === 'driftStart'), { n: 0, type: 'driftStart', dir: 1 });
  near(at(1) * STEP, 0.55, STEP + 1e-9, 'cyan'); near(at(2) * STEP, 1.1, STEP + 1e-9, 'pink'); near(at(3) * STEP, 1.8, STEP + 1e-9, 'gold');
  for (const [tier, steps] of [[1, 70], [2, 140], [3, 220]]) {
    const r = KL.newRace('track_beach', { rivals: false });
    r.wantEvents = true;
    heldDrift(r, 160, steps, { up: true, drift: true, right: true });
    const w0 = r.s.wand;
    parkAt(r, 160, 200);
    r.step(STEP, { up: true });
    const e = r.s.events;
    assert.deepEqual(e.find(x => x.type === 'driftRelease'), { type: 'driftRelease', tier });
    assert.deepEqual(e.find(x => x.type === 'boost'), { type: 'boost', src: 'drift', dur: PHYS.TIER_BOOST[tier - 1] });
    assert.equal(r.s.wand - w0, PHYS.TIER_HYPE[tier - 1]);
    assert.equal(r.s.sparks[tier - 1], 1);
  }
});

test('kart-logic: drift charge drains 2/s on grass (never below 0); releasing early costs nothing', () => {
  const race = KL.newRace('track_beach', { rivals: false });
  heldDrift(race, 160, 120, { up: true, drift: true, right: true });
  const c0 = race.k.drift.charge;
  near(c0, 1.0, 1e-6);
  heldDrift(race, 160, 30, { up: true, drift: true, right: true }, KL.HW + KL.KERB + 12);
  assert.equal(race.k.drift.on, true, 'still drifting on the verge');
  near(race.k.drift.charge, c0 - 0.5, 1e-6, 'drained 0.5 in 0.25 s');
  heldDrift(race, 160, 120, { up: true, drift: true, right: true }, KL.HW + KL.KERB + 12);
  assert.equal(race.k.drift.charge, 0);
  /* let go before cyan: no boost, no Hype either way */
  const early = KL.newRace('track_beach', { rivals: false });
  early.wantEvents = true;
  heldDrift(early, 160, 36, { up: true, drift: true, right: true });
  parkAt(early, 160, 200);
  early.step(STEP, { up: true });
  assert.deepEqual(early.s.events.find(e => e.type === 'driftRelease'), { type: 'driftRelease', tier: 0 });
  assert.equal(early.k.boostT, 0);
  assert.equal(early.s.wand, 0);
});

test('kart-logic: a wall fizzles a drift; pauseReset cancels one — neither gives a boost', () => {
  const race = KL.newRace('track_beach', { rivals: false });
  race.wantEvents = true;
  heldDrift(race, 160, 100, { up: true, drift: true, right: true });
  assert.equal(race.k.drift.tier, 1);
  aimAtWall(race, 160, 1, Math.PI / 2, 160);                /* fast enough to keep the drift until it hits */
  race.s.events.length = 0;
  for (let n = 0; n < 5 && !race.s.events.some(e => e.type === 'fizzle'); n++) race.step(STEP, { drift: true, right: true });
  assert.ok(race.s.events.some(e => e.type === 'fizzle'), 'fizzle event');
  assert.equal(race.k.drift.on, false);
  assert.equal(race.k.boostT, 0);
  assert.ok(!race.s.events.some(e => e.type === 'driftRelease'));
  const paused = KL.newRace('track_beach', { rivals: false });
  paused.wantEvents = true;
  heldDrift(paused, 160, 140, { up: true, drift: true, right: true });
  assert.equal(paused.k.drift.tier, 2);
  paused.pauseReset();
  assert.equal(paused.k.drift.on, false);
  paused.s.events.length = 0;
  parkAt(paused, 160, 200);
  paused.step(STEP, { up: true });
  assert.equal(paused.k.boostT, 0);
  assert.ok(!paused.s.events.some(e => e.type === 'driftRelease'));
});

/* ---------------- Beat Strips ---------------- */
test('kart-logic: Beat Strip placement is deterministic, ≤ 4 a lap, clear of hard bends and the jump', () => {
  for (const id of IDS) {
    const tr = KL.buildTrack(id), F = tr.feat;
    assert.equal(JSON.stringify(KL.buildFeatures(tr)), JSON.stringify(F), id + ' recomputes identically');
    assert.ok(F.pads.length >= 3 && F.pads.length <= 4, `${id} strips ${F.pads.length}`);
    for (const p of F.pads) {
      for (let q = 0; q <= Math.round(250 / tr.spacing); q++) assert.ok(KL.bendAt(tr, p.i + q, 170) <= 1.0, `${id} strip ${p.i} runs into a hard bend`);
      assert.ok(KL.sDist(tr, p.s, F.jump.s) >= 200, `${id} strip ${p.i} too near the jump`);
      assert.ok([0, ...KL.CHECKS].every(f => KL.sDist(tr, p.s, f * tr.len) >= 60), 'clear of the gates');
      assert.ok(p.off === 0 || Math.abs(Math.abs(p.off) - 0.45 * KL.HW) < 1e-9);
    }
    assert.ok(F.pads.some(p => p.off !== 0) && F.pads.some(p => p.off === 0), 'centre and outside strips alternate');
  }
  assert.deepEqual(['track_loop', 'track_volcano', 'track_beach'].map(id => KL.buildTrack(id).feat.jump.i), [46, 83, 61], 'jump at 60% of the longest straight');
});

function padRace(litOffset) {
  const race = KL.newRace('track_beach', { rivals: false });
  race.wantEvents = true;
  const pad = race.track.feat.pads.find(p => p.off === 0);
  parkAt(race, pad.i - 3, 200);
  race.s.t = 10 * BEAT2 + litOffset;
  return { race, pad };
}
test('kart-logic: Beat Strips boost 1.1 s on the beat and 0.7 s off it, judged by s.t alone', () => {
  for (const [off, onBeat, dur, hype] of [[0.02, true, 1.1, 5], [BEAT2 / 2 + 0.02, false, 0.7, 3]]) {
    const { race } = padRace(off);
    const ev = [];
    for (let n = 0; n < 30; n++) { race.step(STEP, { up: true }); ev.push(...race.s.events); race.s.events.length = 0; }
    const pe = ev.find(e => e.type === 'pad');
    assert.ok(pe, 'triggered');
    assert.equal(pe.onBeat, onBeat);
    assert.deepEqual(ev.find(e => e.type === 'boost'), { type: 'boost', src: 'pad', dur });
    assert.equal(race.s.wand, hype);
  }
  assert.equal(KL.beatLit(0), true); assert.equal(KL.beatLit(BEAT2 * 0.49), true); assert.equal(KL.beatLit(BEAT2 * 0.51), false);
});
test('kart-logic: a Beat Strip never re-triggers within 1.2 s, nor when reversing over it', () => {
  const { race, pad } = padRace(0.02);
  let count = 0;
  const drive = (steps, inp) => { for (let n = 0; n < steps; n++) { race.step(STEP, inp); count += race.s.events.filter(e => e.type === 'pad').length; race.s.events.length = 0; } };
  drive(30, { up: true });
  assert.equal(count, 1);
  parkAt(race, pad.i - 3, 200);                            /* straight back over it */
  drive(30, { up: true });
  assert.equal(count, 1, 'cooldown');
  const rev = KL.newRace('track_beach', { rivals: false });
  rev.wantEvents = true;
  parkAt(rev, pad.i + 3, -100);                            /* reversing across it */
  let rc = 0;
  for (let n = 0; n < 60; n++) { rev.step(STEP, { down: true }); rc += rev.s.events.filter(e => e.type === 'pad').length; rev.s.events.length = 0; }
  assert.equal(rc, 0);
  const back = KL.newRace('track_beach', { rivals: false });
  back.wantEvents = true;
  parkAt(back, pad.i + 3, 200);
  back.k.h += Math.PI;                                     /* driving the wrong way over it */
  let bc = 0;
  for (let n = 0; n < 30; n++) { back.step(STEP, { up: true }); bc += back.s.events.filter(e => e.type === 'pad').length; back.s.events.length = 0; }
  assert.equal(bc, 0);
});

/* ---------------- Glow Notes ---------------- */
test('kart-logic: Glow Notes sit on the tarmac, are collected once a lap, respawn, and a full trail pays once', () => {
  for (const id of IDS) {
    const tr = KL.buildTrack(id);
    for (const q of tr.feat.notes) assert.ok(KL.nearest(tr, q.x, q.y, null).d <= KL.HW, `${id} note ${q.trail}.${q.k}`);
    assert.ok(tr.feat.trails >= 2 && tr.feat.notes.length === tr.feat.trails * 5);
    const { log } = styleRun(id);
    const notes = log.filter(e => e.type === 'note');
    const keys = notes.map(e => e.lap + ':' + e.trail + ':' + e.k);
    assert.equal(new Set(keys).size, keys.length, id + ' a note is collected at most once per lap');
    const byNote = {};
    for (const e of notes) (byNote[e.trail + ':' + e.k] = byNote[e.trail + ':' + e.k] || new Set()).add(e.lap);
    assert.ok(Object.values(byNote).some(l => l.size > 1), id + ' notes respawn on the lap');
    const perTrailLap = {};
    for (const e of notes) { const kk = e.lap + ':' + e.trail; (perTrailLap[kk] = perTrailLap[kk] || []).push(e); }
    for (const list of Object.values(perTrailLap)) {
      const fulls = list.filter(e => e.full);
      assert.equal(fulls.length, list.length === 5 ? 1 : 0);
      if (fulls.length) assert.equal(list.indexOf(fulls[0]), 4, 'the full-trail bonus comes with the 5th note');
    }
  }
});

/* ---------------- Stage Jump ---------------- */
function jumpRace(v, offset, reverse) {
  const race = KL.newRace('track_loop', { rivals: false });
  race.wantEvents = true;
  const J = race.track.feat.jump, i = J.i + (offset || -2);
  parkAt(race, i, v);
  race.pr.P = race.track.cum[i];
  if (reverse) race.k.h += Math.PI;
  return race;
}
function stepUntil(race, pred, max, inp) {
  for (let n = 0; n < (max || 120); n++) { race.step(STEP, typeof inp === 'function' ? inp(race) : (inp || {})); if (pred(race)) return true; }
  return false;
}
test('kart-logic: the Stage Jump launches only forwards at ≥ 160 px/s; airDur = 0.35 + 0.0012·v', () => {
  const slow = jumpRace(150);
  assert.equal(stepUntil(slow, r => r.k.air.on, 60), false, 'too slow');
  const back = jumpRace(230, 2, true);
  assert.equal(stepUntil(back, r => r.k.air.on, 60), false, 'backwards');
  const go = jumpRace(240);
  assert.equal(stepUntil(go, r => r.k.air.on, 60), true);
  near(go.k.air.dur, 0.35 + 0.0012 * go.k.v, 1e-9, 'airDur');
  near(go.k.air.peak, 24 * go.k.v / 270, 1e-9, 'peak');
  assert.ok(go.s.events.some(e => e.type === 'jump'));
  assert.equal(go.s.jumps, 1);
});
test('kart-logic: a trick only counts in the first 70% of the air time, and lands a 0.6 s boost + 5 Hype', () => {
  const late = jumpRace(240);
  stepUntil(late, r => r.k.air.on, 60);
  stepUntil(late, r => r.k.air.t > r.k.air.dur * 0.72, 120);
  late.step(STEP, { drift: true });
  assert.equal(late.k.air.trick, false, 'too late for a trick');
  const ok = jumpRace(240);
  stepUntil(ok, r => r.k.air.on, 60);
  ok.step(STEP, {}); ok.step(STEP, { drift: true });
  assert.equal(ok.k.air.trick, true);
  ok.s.events.length = 0;
  const w0 = ok.s.wand;
  assert.equal(stepUntil(ok, r => !r.k.air.on, 120), true);
  assert.deepEqual(ok.s.events.find(e => e.type === 'land'), { type: 'land', trick: true });
  assert.deepEqual(ok.s.events.find(e => e.type === 'boost'), { type: 'boost', src: 'trick', dur: 0.6 });
  assert.equal(ok.s.wand - w0, 5);
  assert.equal(ok.s.tricks, 1);
});
test('kart-logic: a jump never skips a gate, and any wall contact in the air is a bump', () => {
  for (const id of IDS) {
    const { race } = styleRun(id);
    assert.ok(race.s.jumps >= race.track.laps - 1, id + ' jumped');
    const want = [];
    for (let l = 1; l <= race.track.laps; l++) want.push('cp1', 'cp2', 'cp3', 'lap' + l);
    assert.deepEqual(race.pr.crossedLog, want);
  }
  const air = KL.newRace('track_beach', { rivals: false });
  aimAtWall(air, 160, 1, 0.5, 60);                         /* would only scrape on the ground */
  Object.assign(air.k.air, { on: true, t: 0, dur: 0.6, peak: 20, trick: false });
  stepUntil(air, r => r.s.wall > 0, 60);
  assert.equal(air.s.bumps, 1);
  assert.equal(air.s.scrapes, 0);
});

/* ---------------- graded walls ---------------- */
test('kart-logic: a head-on hit at 300 px/s is a spin-out of exactly 0.8 s that ends facing forward', () => {
  const race = KL.newRace('track_beach', { rivals: false });
  race.wantEvents = true;
  race.s.wand = 30; race.k.spotlightT = 3;
  aimAtWall(race, 160, -1, Math.PI / 2, 300);
  assert.equal(stepUntil(race, r => r.k.spinT > 0, 10), true);
  assert.equal(race.s.spins, 1);
  assert.equal(race.s.wand, 0, 'Hype → 0');
  assert.equal(race.k.spotlightT, 0);
  assert.ok(race.s.events.some(e => e.type === 'spin') && race.s.events.some(e => e.type === 'spotlightEnd' && e.early));
  /* the hit sets spinT at the end of its step; the spin then governs exactly 96 steps */
  let spinning = 0;
  while (race.k.spinT > 0 && spinning < 500) { race.step(STEP, { up: true, left: true }); spinning++; }
  near(spinning * STEP, PHYS.SPIN_T, 1e-9, 'spin length');
  const nb = KL.nearest(race.track, race.k.x, race.k.y, race.pr.idx), t = race.track.tang[nb.i];
  assert.ok(Math.abs(wrapAng(race.k.h - Math.atan2(t[1], t[0]))) <= 0.01, 'mercy: facing forward');
  assert.ok(KL.nearest(race.track, race.k.x, race.k.y, race.pr.idx).d <= KL.WALL);
});
test('kart-logic: a glancing 20° touch at 150 px/s is a scrape; a 120 px/s hit is a bump', () => {
  const race = KL.newRace('track_beach', { rivals: false });
  race.wantEvents = true;
  race.s.wand = 10;
  aimAtWall(race, 160, 1, 20 * Math.PI / 180, 150);
  const v0 = 150;
  stepUntil(race, r => r.s.wall > 0, 60);
  assert.equal(race.s.scrapes, 1); assert.equal(race.s.bumps, 0); assert.equal(race.s.spins, 0);
  assert.equal(race.s.wand, 8, 'scrape −2');
  assert.ok(race.k.v > 0.8 * 135 && race.k.v < v0);
  const bump = KL.newRace('track_beach', { rivals: false });
  bump.wantEvents = true;
  bump.s.wand = 20; bump.k.boostT = 0.5; bump.k.spotlightT = 2;
  aimAtWall(bump, 160, 1, Math.PI / 2, 120);
  stepUntil(bump, r => r.s.wall > 0, 10);
  assert.equal(bump.s.bumps, 1);
  assert.equal(bump.s.wand, 12, 'bump −8');
  assert.equal(bump.k.boostT, 0, 'boost cancelled');
  assert.equal(bump.k.spotlightT, 0, 'Spotlight ends early');
});
test('kart-logic: s.wall counts every grade with the 0.4 s debounce; worse hits still grade inside it', () => {
  const race = KL.newRace('track_beach', { rivals: false });
  aimAtWall(race, 160, 1, 20 * Math.PI / 180, 150);
  stepUntil(race, r => r.s.wall > 0, 60);
  assert.equal(race.s.wall, 1);
  for (let n = 0; n < 12; n++) race.step(STEP, {});      /* 0.1 s later: a real bump */
  aimAtWall(race, 160, 1, Math.PI / 2, 120);
  stepUntil(race, r => r.s.bumps > 0, 10);
  assert.equal(race.s.wall, 1, 'debounced');
  assert.equal(race.s.bumps, 1);
  for (let n = 0; n < 60; n++) race.step(STEP, {});
  aimAtWall(race, 160, 1, 20 * Math.PI / 180, 150);
  stepUntil(race, r => r.s.wall > 1, 60);
  assert.equal(race.s.wall, 2);
  assert.equal(race.s.scrapes, 2);
});

/* ---------------- Hype + Spotlight ---------------- */
test('kart-logic: the Hype Wand follows the table for every source and fires Spotlight at 40', () => {
  for (const id of IDS) {
    const { race, log } = styleRun(id);
    const wands = [];
    runLogged(id, { rivals: false }, true, r => wands.push(r.s.wand));
    const laps = race.track.laps;
    let model = 0, resets = 0, li = 0;
    for (let n = 1; n <= wands.length; n++) {
      while (li < log.length && log[li].step === n) {
        const e = log[li++];
        let d = 0;
        if (e.type === 'note') d = 1 + (e.full ? 2 : 0);
        else if (e.type === 'pad') d = e.onBeat ? 5 : 3;
        else if (e.type === 'driftRelease' && e.tier > 0) d = PHYS.TIER_HYPE[e.tier - 1];
        else if (e.type === 'land' && e.trick) d = 5;
        else if (e.type === 'rocket') d = 5;
        else if ((e.type === 'gate' && e.clean) || (e.type === 'lap' && e.clean && e.n < laps)) d = 2;
        else if (e.type === 'spotlight') { assert.ok(model >= 40, 'Spotlight only on a full wand'); model = 0; resets++; continue; }
        model += d;
      }
      if (model >= 40) assert.fail(`${id} step ${n}: wand reached ${model} without a Spotlight`);
      assert.equal(wands[n - 1], model, `${id} step ${n}`);
    }
    assert.equal(resets, race.s.spotlights);
    assert.ok(resets >= 2, id + ' spotlights ' + resets);
  }
});
test('kart-logic: Spotlight lasts exactly 6.0 s and lifts top speed by 5%', () => {
  const { log } = styleRun('track_loop');
  let checked = 0;
  log.forEach((e, idx) => {
    if (e.type !== 'spotlight') return;
    const next = log.slice(idx + 1).find(x => x.type === 'spotlight' || x.type === 'spotlightEnd');
    if (next && next.type === 'spotlightEnd' && !next.early) { assert.equal((next.step - e.step) * STEP, 6, 'duration'); checked++; }
  });
  assert.ok(checked >= 1);
  const race = KL.newRace('track_beach', { rivals: false });
  parkAt(race, 150, 270);
  race.k.spotlightT = 6;
  let maxV = 0;
  for (let n = 0; n < 360; n++) { race.step(STEP, { up: true }); maxV = Math.max(maxV, race.k.v); }
  near(maxV, PHYS.VMAX * PHYS.SPOT_MUL, 1e-9, 'vmax × 1.05');
});

/* ---------------- finish + coast ---------------- */
test('kart-logic: finish — result is exactly {finished, ms}; a 2.2 s coast follows with progress frozen', () => {
  for (const reduced of [true, false]) {
    const race = KL.newRace('track_loop', { rivals: false, reduced });
    let n = 0;
    while (!race.pr.finished && n < 120 * 200) { race.step(STEP, race.drivePlain()); n++; }
    const fin = { t: race.s.t, P: race.pr.P, lap: race.pr.lap, log: race.pr.crossedLog.length };
    assert.equal(race.s.phase, 'coast');
    assert.deepEqual(Object.keys(race.result()).sort(), ['finished', 'ms']);
    assert.equal(race.result().ms, Math.round(race.s.finishT * 1000));
    let after = 0;
    while (!race.s.done && after < 2000) { race.step(STEP, { up: true, right: true }); after++; }
    assert.equal(race.s.done, true);
    near(race.s.t, fin.t + PHYS.COAST_T, STEP, 'sim clock at done');
    const want = reduced ? PHYS.COAST_T / STEP : (PHYS.SLOWMO_T / PHYS.SLOWMO + PHYS.COAST_T - PHYS.SLOWMO_T) / STEP;
    near(after, want, 2, 'coast steps (slow-mo ' + !reduced + ')');
    assert.deepEqual({ P: race.pr.P, lap: race.pr.lap, log: race.pr.crossedLog.length }, { P: fin.P, lap: fin.lap, log: fin.log });
    assert.equal(race.result().ms, Math.round(fin.t * 1000), 'the coast never adds to the time');
  }
});

/* ---------------- kart.js wrapper ---------------- */
test('kart: forceEnd during the victory coast still returns the finished result', () => {
  const r = Kart.newRound(api, 'track_loop', {});
  let n = 0;
  while (r.state.phase !== 'coast' && n < 120 * 200) { r.autopilot(); r.step(STEP, r.autoHeld); n++; }
  const ms = r.result().ms;
  r.forceEnd();
  assert.equal(r.done, true);
  assert.deepEqual(r.result(), { finished: true, ms });
  assert.ok(C.validResult('kart', r.result()));
});

test('kart: the kept logic sounds still fire through api.sound — check, coin, bump, fanfare', () => {
  const heard = [];
  const rec = { sound: name => heard.push(name), reduced: true };
  const r = Kart.newRound(rec, 'track_volcano', {});
  r.kart.h += Math.PI / 2;
  for (let i = 0; i < 240 && !r.state.bumps; i++) r.step(STEP, { up: true });
  assert.ok(r.state.bumps >= 1, 'set up a bump');
  let n = 0;
  while (!r.done && n < 120 * 200) { r.autopilot(); r.step(STEP, r.autoHeld); n++; }
  assert.equal(r.done, true);
  const count = s => heard.filter(x => x === s).length;
  assert.equal(count('check'), 3 * r.track.laps);
  assert.equal(count('coin'), r.track.laps - 1);
  assert.ok(count('bump') >= 1);
  assert.equal(count('fanfare'), 1);
  assert.ok(r.fx.length <= 64, 'the renderer queue is capped');
});

test('kart: round.events fills only while the shell asks for them', () => {
  const r = Kart.newRound(api, 'track_loop', {});
  for (let i = 0; i < 240; i++) { r.autopilot(); r.step(STEP, r.autoHeld); }
  assert.equal(r.events.length, 0);
  r.wantEvents = true;
  for (let i = 0; i < 120 * 20; i++) { r.autopilot(); r.step(STEP, r.autoHeld); }
  assert.ok(r.events.some(e => e.type === 'gate'));
});

function withStorage(fn) {
  const store = {};
  global.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
  try { return fn(store); } finally { delete global.localStorage; }
}
test('kart: options are saved per profile; Easy Drive defaults on until a kart time exists', () => {
  withStorage(store => {
    const fresh = { profileKey: 'ava', pb: {} };
    assert.deepEqual(Kart.loadOpts(fresh), { mode: 'race', cls: 0, easy: true, cam: 'chase' });
    Kart.setOption(fresh, 'mode', 'solo');
    Kart.setOption(fresh, 'easy', false);
    Kart.setOption(fresh, 'cam', 'map');
    Kart.setOption(fresh, 'cls', 7);                       /* ignored */
    assert.deepEqual(JSON.parse(store['slKart:v1:ava']), { mode: 'solo', cls: 0, easy: false, cam: 'map' });
    assert.deepEqual(fresh.kartOpts, { mode: 'solo', cls: 0, easy: false, cam: 'map' });
    const again = { profileKey: 'ava', pb: {} };
    assert.equal(Kart.loadOpts(again).mode, 'solo', 'remembered');
    const racer = { profileKey: 'ben', pb: { 'kart:track_loop': { ms: 70000 } } };
    assert.equal(Kart.loadOpts(racer).easy, false, 'has a kart time');
    store['slKart:v1:cat'] = '{not json';
    assert.equal(Kart.loadOpts({ profileKey: 'cat', pb: {} }).mode, 'race', 'corrupt storage ignored');
  });
  assert.equal(Kart.loadOpts({}).easy, false, 'no profile (demo/tests): plain defaults');
});

test('kart: Easy Drive hides GO and makes ✨ the wide pad; physics stay identical', () => {
  const easy = Kart.controlsFor({ kartOpts: { mode: 'race', cls: 0, easy: true, cam: 'chase' } });
  assert.deepEqual(easy.map(c => c.id), ['left', 'right', 'down', 'drift']);
  assert.equal(easy[3].label, '✨ DRIFT'); assert.equal(easy[3].wide, true);
  const manual = Kart.controlsFor({ kartOpts: { mode: 'race', cls: 0, easy: false, cam: 'chase' } });
  assert.deepEqual(manual.map(c => c.id + ':' + c.side), ['left:left', 'right:left', 'down:right', 'drift:right', 'up:right']);
  assert.equal(manual.find(c => c.id === 'drift').aria, 'Drift and trick');
  /* Easy Drive is input-only: no input = gas on; ⬇ brakes exactly like manual ⬇ */
  const a = Kart.newRound(api, 'track_loop', { kartOpts: { mode: 'race', cls: 0, easy: true, cam: 'chase' } });
  const b = Kart.newRound(api, 'track_loop', { kartOpts: { mode: 'race', cls: 0, easy: false, cam: 'chase' } });
  for (let i = 0; i < 120; i++) { a.step(STEP, {}); b.step(STEP, { up: true }); }
  assert.equal(a.kart.v, b.kart.v); assert.equal(a.kart.x, b.kart.x);
  for (let i = 0; i < 30; i++) { a.step(STEP, { down: true }); b.step(STEP, { down: true }); }
  assert.equal(a.kart.v, b.kart.v);
});

test('kart: menu options lock Stage classes by the PB medal and hide them in Solo', () => {
  const p = KL.PAR.track_loop;
  const opts = pb => Kart.menuOptions({ variant: 'track_loop', pb: pb == null ? {} : { 'kart:track_loop': { ms: pb } }, kartOpts: { mode: 'race', cls: 2, easy: false, cam: 'chase' } });
  const cls = pb => opts(pb).find(o => o.id === 'cls');
  assert.deepEqual(cls(null).options.map(o => !!o.locked), [false, true, true]);
  assert.equal(cls(null).value, 0, 'a locked choice falls back to Trainee');
  assert.match(cls(null).label, /Trainee: the Glow Crew race at your pace/);
  assert.match(cls(null).options[1].note, /Bronze/);
  assert.deepEqual(cls(p.bronze).options.map(o => !!o.locked), [false, false, true]);
  assert.deepEqual(cls(p.silver).options.map(o => !!o.locked), [false, false, false]);
  assert.equal(cls(p.silver).value, 2);
  assert.deepEqual(opts(null).map(o => o.id), ['mode', 'cls', 'easy'], 'no Camera row without 3D');
  const solo = Kart.menuOptions({ variant: 'track_loop', pb: {}, kartOpts: { mode: 'solo', cls: 0, easy: true, cam: 'chase' } });
  assert.deepEqual(solo.map(o => o.id), ['mode', 'easy']);
  /* the track chips update cfg.variant through the wrapped onSelectVariant */
  const picked = [];
  const cfg = { variant: 'track_loop', pb: {}, kartOpts: { mode: 'race', cls: 0, easy: false, cam: 'chase' }, onSelectVariant: v => picked.push(v) };
  Kart.menuOptions(cfg);
  cfg.onSelectVariant('track_beach');
  assert.equal(cfg.variant, 'track_beach'); assert.deepEqual(picked, ['track_beach']);
});

test('kart: def wiring — title, keys, music, 3D view, PB line', () => {
  const d = Kart.def;
  assert.equal(d.title, 'Neon Grand Prix');
  assert.equal(d.countdown, 3);
  for (const k of [' ', 'Shift', 'x', 'X']) assert.equal(d.keys[k], 'drift');
  assert.equal(d.keys.ArrowUp, 'up');
  assert.deepEqual(d.music, { track: 'kart' });
  assert.equal(d.view3d.src, 'world/games/kart-3d.js');
  assert.equal(d.tutorial.length, 4);
  const p = KL.PAR.track_loop;
  assert.equal(d.pbText({ ms: 52410 }, 'track_loop'), '🏆 Best 0:52.41 · 🥈 Silver · Next: 🥇 Gold ' + KL.fmt(p.gold) + ' (' + ((52410 - p.gold) / 1000).toFixed(1) + ' s to go)');
  assert.match(d.pbText({ ms: p.holo }, 'track_loop'), /🌈 Holo · Top of the podium!/);
  assert.equal(d.pbText(null, 'track_loop'), 'No best yet — set one! 🥉 Bronze is ' + KL.fmt(p.bronze, 1));
});

test('kart: pad glow — rocket window on GO (or ✨ in Easy Drive), spark tiers and grey on the ✨ pad', () => {
  const r = Kart.newRound(api, 'track_beach', { kartOpts: { mode: 'race', cls: 0, easy: false, cam: 'chase' } });
  r.countdown(1.0, {}, true);
  assert.equal(r.padState('up'), '');
  r.countdown(0.2, {}, true);
  assert.equal(r.padState('up'), 'ready');
  r.countdown(0.2, {}, false);
  assert.equal(r.padState('up'), '', 'never on a resume count');
  const e = Kart.newRound(api, 'track_beach', { kartOpts: { mode: 'race', cls: 0, easy: true, cam: 'chase' } });
  e.countdown(0.2, {}, true);
  assert.equal(e.padState('drift'), 'ready'); assert.equal(e.padState('up'), '');
  const race = r.race;
  heldDrift(race, 160, 70, { up: true, drift: true, right: true });
  assert.equal(r.padState('drift'), 's1');
  heldDrift(race, 160, 70, { up: true, drift: true, right: true });
  assert.equal(r.padState('drift'), 's2');
  heldDrift(race, 160, 2, { up: true, drift: true, right: true }, KL.HW + KL.KERB + 12);
  assert.equal(r.padState('drift'), 'grey');
});

test('kart: HUD and results copy — place, laps, medal, nudge, style stats', () => {
  const r = Kart.newRound(api, 'track_loop', { kartOpts: { mode: 'race', cls: 0, easy: false, cam: 'chase' } });
  assert.equal(r.hud(), 'P6 · Lap 1/3 · ⏱ 0:00.00');
  assert.equal(r.summaryTitle(), 'Race stopped');
  assert.equal(r.summaryBig(), 'Not finished');
  assert.equal(r.summaryText(), 'Time’s up — great driving! Finish all 3 laps to set a time.');
  let n = 0;
  while (!r.done && n < 120 * 200) { r.autopilot(); r.step(STEP, r.autoHeld); n++; }
  const ms = r.result().ms;
  assert.equal(r.summaryTitle(), '🎤 1st — centre stage!');
  assert.equal(r.summaryBig(), '1st · ' + KL.fmt(ms));
  const txt = r.summaryText();
  assert.match(txt, /^🥈 Silver time! · 🎤 Debut Stage unlocked on Island Loop!|^🥈 Silver time! · 👑 Headliner Stage unlocked on Island Loop!/);
  assert.match(txt, /Laps \d+\.\d · \d+\.\d · \d+\.\d/);
  assert.match(txt, /Sparks 0 · On-beat \d+\/\d+ · Notes \d+\/\d+ · Tricks 0 · Spotlights \d+ · Passes 5/);
  assert.match(txt, /no wall bumps!$/);
  assert.match(r.hud(), /^P1 · Lap 3\/3 · ⏱ /);
  assert.deepEqual(r.summaryBadges().map(b => b.kind), ['silver', 'ribbon', 'ribbon']);
  const solo = Kart.newRound(api, 'track_loop', { pb: { 'kart:track_loop': { ms: 52000 } }, kartOpts: { mode: 'solo', cls: 0, easy: false, cam: 'chase' } });
  assert.equal(solo.hud(), 'Lap 1/3 · ⏱ 0:00.00');
  n = 0;
  while (!solo.done && n < 120 * 200) { solo.autopilot(); solo.step(STEP, solo.autoHeld); n++; }
  assert.equal(solo.summaryTitle(), '🏁 Race complete!');
  assert.equal(solo.summaryBig(), KL.fmt(ms));
  assert.match(solo.summaryText(), /Next: 🥇 Gold /);
});

test('kart: loads as classic browser scripts — kart-logic.js first, then kart.js registers with the shell', () => {
  const vm = require('node:vm');
  const defined = [];
  const sandbox = { window: { SLGameShell: { define: d => { defined.push(d); return {}; } } } };
  vm.createContext(sandbox);
  for (const f of ['kart-logic.js', 'kart.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../world/games', f), 'utf8'), sandbox, { filename: f });
  assert.equal(typeof sandbox.window.SLKartLogic.newRace, 'function');
  assert.equal(defined.length, 1);
  const d = defined[0];
  assert.equal(d.key, 'kart'); assert.equal(d.title, 'Neon Grand Prix');
  const r = d.newRound({ sound() {}, reduced: true }, 'track_beach', { pb: {} });
  let n = 0;
  while (!r.done && n < 120 * 200) { r.autopilot(); r.step(STEP, r.autoHeld); n++; }
  assert.ok(C.validResult('kart', r.result()));
  assert.equal(r.result().ms, plainRun('track_beach').race.result().ms, 'the same race in the browser build');
  assert.equal(d.newRound({ sound() {}, reduced: true }, 'track_beach', { profileKey: 'x', pb: {} }).opts.easy, true, 'a new profile starts on Easy Drive');
});

/* a recording stand-in for CanvasRenderingContext2D: any call is accepted, and every
   numeric argument must be finite (catches NaN poses, sizes or colours maths) */
function fakeCtx(bad) {
  const grad = { addColorStop() {} };
  const t = { measureText: s => ({ width: String(s).length * 8 }), createRadialGradient: (...a) => { check('grad', a); return grad; }, createLinearGradient: () => grad };
  function check(name, args) { for (const a of args) if (typeof a === 'number' && !Number.isFinite(a)) bad.push(name); }
  return new Proxy(t, {
    get(o, k) { if (k in o) return o[k]; return (...a) => check(String(k), a); },
    set(o, k, v) { o[k] = v; return true; }
  });
}
test('kart: the 2D renderer draws every state (rivals, pacers, boosts, jumps, Spotlight, coast) cleanly', () => {
  global.window = { SLGameFX: require('../world/games/fx.js') };
  try {
    for (const [variant, kartOpts] of [['track_volcano', { mode: 'race', cls: 1, easy: true, cam: 'chase' }], ['track_loop', { mode: 'solo', cls: 0, easy: false, cam: 'chase' }]]) {
      const bad = [], ctx = fakeCtx(bad);
      const r = Kart.newRound({ sound() {}, reduced: false }, variant, { autoStyle: true, kartOpts, pb: { ['kart:' + variant]: { ms: 70000 } }, user: { color: '#FF5FA2' } });
      r.wantEvents = true;
      r.render(ctx);
      let n = 0;
      while (!r.done && n < 120 * 200) {
        r.autopilot(); r.step(STEP, r.autoHeld); n++;
        if (n % 3 === 0) { r.render(ctx); r.events.length = 0; }
      }
      r.render(ctx);
      assert.equal(r.done, true);
      assert.deepEqual(bad, [], variant + ' non-finite drawing arguments');
      assert.ok(r.state.spotlights > 0 && r.state.jumps > 0);
    }
    const bad = [];
    Kart.def.idle(fakeCtx(bad), { variant: 'track_beach', pb: {} });
    assert.deepEqual(bad, []);
  } finally { delete global.window; }
});
