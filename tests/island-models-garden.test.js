/* node --test tests/   (Node 22+)
   My Island 3D garden models (world/island3d/models-garden.js): catalogue
   coverage, browser registration, layout margins, the pure animation helpers
   and the idle/act/show handlers driven through a fake animation handle.
   THREE is not available in Node: builders are not run here (they need K);
   everything else in the module is pure. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const C = require('../world/world-core.js');
const L = require('../world/world-look.js');
const M = require('../world/island3d/motion.js');
const GARDEN = require('../world/island3d/models-garden.js');

const SRC_PATH = path.join(__dirname, '..', 'world', 'island3d', 'models-garden.js');
const SRC = fs.readFileSync(SRC_PATH, 'utf8');
const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= (eps || 1e-9), (msg || '') + ' ' + a + ' vs ' + b);

/* the models, built once with the look table visible (no K needed: builders are not called) */
globalThis.SLIslandLook = L;
const MODELS = GARDEN.factory({});

/* a fake animation handle that records every call */
function handle(o) {
  const log = { pivots: {}, states: {}, halo: [], decal: [], sfx: [], emit: [] };
  const a = Object.assign({
    uid: 'u-' + Math.random(), t: 10, dt: 1 / 60, phase: 0.3, reduced: false, beat: 0, show: 0, music: true,
    pivot: (name) => ({ set: (r, p, s) => { log.pivots[name] = { r: r.slice(), p: p.slice(), s: s.slice() }; } }),
    state: (k, v) => { log.states[k] = v; },
    halo: (...x) => log.halo.push(x), decal: (...x) => log.decal.push(x),
    sfx: (...x) => log.sfx.push(x), emit: (...x) => log.emit.push(x)
  }, o || {});
  a.log = log;
  return a;
}
function runToEnd(act, a, step) {
  let t = 0, alive = true;
  while (alive && t < 10) { a.t = 100 + t; alive = act.update(a, t); t += step || 1 / 60; }
  return t;
}

/* ---------------- coverage and registration ---------------- */
test('covers exactly the garden / lights / flags / paths catalogue ids', () => {
  const want = C.CATALOG.filter((it) => it.kind === 'decor' || it.kind === 'path').map((it) => it.id).sort();
  assert.deepEqual(GARDEN.IDS.slice().sort(), want);
  assert.equal(GARDEN.IDS.length, 23);
  assert.deepEqual(Object.keys(MODELS).sort(), want);
  GARDEN.IDS.forEach((id) => {
    assert.ok(L.LOOK[id], 'LOOK entry for ' + id);
    ['build', 'idle', 'act', 'show'].forEach((k) => assert.equal(typeof MODELS[id][k], 'function', id + '.' + k));
  });
});

test('registers itself with SL3D.defineModels("garden") in a browser-like context', () => {
  const calls = [];
  const self = { SL3D: { defineModels: (cat, f) => calls.push([cat, f]) } };
  vm.runInNewContext(SRC, { self: self });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'garden');
  assert.equal(typeof calls[0][1], 'function');
  assert.equal(typeof self.SLModelsGarden.factory, 'function');
  /* and stays quiet when the stage is not there */
  assert.doesNotThrow(() => vm.runInNewContext(SRC, { self: {} }));
});

test('colours come only from tokens; no raw hex, no THREE global', () => {
  assert.equal(/#[0-9a-f]{6}\b/i.test(SRC), false, 'no raw hex colours');
  const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.equal(/\bTHREE\b/.test(code), false, 'THREE only arrives through K');
  assert.equal(/window\./.test(code), false, 'never touches window');
  GARDEN.EXTRA_TOKENS.forEach((t) => assert.ok(L.isToken(t), 'token ' + t));
});

/* ---------------- layout: heights, margins, overhang rule ---------------- */
test('flower patches, mushrooms and decor stay inside the 0.86 cell fit', () => {
  const F = GARDEN.FIT;
  near(F, 0.43, 1e-12);
  GARDEN.TULIPS.forEach((f) => assert.ok(Math.abs(f.x) + 0.06 <= F && Math.abs(f.z) + 0.06 <= F));
  GARDEN.DAISIES.forEach((d) => assert.ok(Math.abs(d.x) + 0.065 <= F && Math.abs(d.z) + 0.065 <= F));
  GARDEN.SUNFLOWERS.forEach((s) => assert.ok(Math.abs(s.x) + 0.15 <= F));
  GARDEN.SHROOMS.forEach((m) => assert.ok(Math.abs(m.x) + m.r <= F && Math.abs(m.z) + m.r <= F));
  assert.ok(GARDEN.FLAG.x0 + GARDEN.FLAG.w <= F + 1e-9, 'the flag cloth ends inside the cell');
  assert.ok(Math.abs(GARDEN.FLAG.poleX) + GARDEN.FLAG.poleR <= F);
  assert.ok(GARDEN.FLAG.top - GARDEN.FLAG.h >= 1.0, 'the cloth flies above the 1.0 u overhang line');
  assert.ok(GARDEN.BUNT.postX + 0.045 <= F);
});

test('tree canopies only overhang above y 1.0 and stay within 1.1 u', () => {
  const C2 = GARDEN.CANOPY;
  near(C2.top.c[1] + C2.top.r, 1.6, 1e-9, 'oak / blossom top');
  [C2.top].concat(C2.low).forEach((p) => assert.ok(Math.abs(p.c[0]) + p.r <= 0.55 + 1e-9));
  GARDEN.applePositions().forEach((p) => { assert.ok(Math.abs(p[0]) <= 0.55 && p[1] > 0.6 && p[2] > 0, 'apples on the front of the canopy'); });
  GARDEN.rosePositions().forEach((p) => { assert.ok(Math.abs(p[0]) <= 0.43 && p[1] <= 0.6 + 1e-9); });
  const tiers = GARDEN.PINE.tiers;
  near(tiers[2].y + tiers[2].h, 1.8, 1e-9, 'pine top');
  tiers.forEach((t) => assert.ok(t.r <= 0.43, 'pine tiers fit the cell'));
  const segs = GARDEN.palmTrunk();
  assert.equal(segs.length, 6);
  segs.forEach((s, i) => { if (i) assert.ok(s.c[1] > segs[i - 1].c[1], 'the trunk rises'); assert.ok(s.rBot > s.rTop, 'each ring steps in'); });
  GARDEN.PALM.fronds.forEach((f) => {
    const tip = GARDEN.frondTip(f);
    assert.ok(tip[1] > 1.0, 'frond tips above 1.0');
    assert.ok(Math.hypot(tip[0], tip[2]) <= 0.62, 'frond reach');
  });
  const up = Math.max.apply(null, GARDEN.PALM.fronds.map((f) => GARDEN.frondTip(f)[1]));
  near(up, 1.9, 0.03, 'palm height');
});

test('windmill sails and lighthouse beams respect the bounds', () => {
  const W = GARDEN.MILL, reach = Math.hypot(W.arm, 0.02 + W.width);
  assert.ok(W.hub[1] - reach >= 1.0, 'the lowest sail tip clears the 1.0 u line');
  near(W.hub[1] + reach, 2.2, 0.02, 'windmill height');
  const H = GARDEN.LH;
  assert.ok(H.beamLen / H.beamScale < 0.17, 'the authored beam hides inside the lamp room');
  near(H.beamLen, 6, 1e-9); near(H.beamR, 0.6, 1e-9);
});

test('bunting pennants hang in order under the sagging line without overlapping', () => {
  const lay = GARDEN.pennantLayout();
  assert.equal(lay.length, 5);
  for (let i = 1; i < lay.length; i++) assert.ok(lay[i].x0 > lay[i - 1].x1, 'pennant ' + i + ' clear of its neighbour');
  lay.forEach((p) => near(p.cy, GARDEN.buntLineY(p.x) - 0.006, 1e-9));
  assert.ok(GARDEN.buntLineY(0) < GARDEN.buntLineY(0.3), 'the line sags in the middle');
});

/* ---------------- pure animation helpers ---------------- */
test('flagWave: pinned at the hoist, ≤ amp at the free edge, still when reduced', () => {
  const F = GARDEN.FLAG, base = [], n = 9;
  for (let i = 0; i < n; i++) base.push(F.x0 + F.w * i / (n - 1), F.cy, 0);
  const b = new Float32Array(base), out = new Float32Array(b.length);
  for (let t = 0; t < 2; t += 0.05) {
    GARDEN.flagWave(b, out, t, 0.12, 2, 0.3, false, F.x0, F.w, M.flutter);
    near(out[2], 0, 1e-7, 'hoist z');
    for (let i = 0; i < out.length; i += 3) assert.ok(Math.abs(out[i + 2]) <= 0.12 + 1e-6);
  }
  GARDEN.flagWave(b, out, 0.37, 0.12, 2, 0.3, true, F.x0, F.w, M.flutter);
  for (let i = 0; i < out.length; i++) near(out[i], b[i], 1e-7, 'reduced = rest');
});

test('faceNormals: unit, perpendicular, and flipped by the winding', () => {
  const tri = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0]);
  const n = GARDEN.faceNormals(tri, new Float32Array(18));
  near(n[2], 1, 1e-7); near(n[11], -1, 1e-7);
  for (let i = 0; i < 18; i += 3) near(Math.hypot(n[i], n[i + 1], n[i + 2]), 1, 1e-6);
});

test('pennants: ±deg idle, a ripple on tap, rest when reduced; rotation keeps the hang line', () => {
  const out = new Array(5);
  for (let t = 0; t < 3; t += 0.1) {
    GARDEN.pennantAngles(t, 5, 6, 0.8, 0.2, false, 1.3, 0, M.pennant, M.ripple, out);
    out.forEach((d) => assert.ok(Math.abs(d) <= 6 + 1e-9));
  }
  GARDEN.pennantAngles(1, 5, 6, 0.8, 0.2, true, 0.5, 14, M.pennant, M.ripple, out);
  out[2] -= 14; /* the ripple at u = 0.5 under the front */
  assert.ok(out.every((d) => Math.abs(d) < 1e-9 || Math.abs(d) <= 14));
  const lay = GARDEN.pennantLayout(), L0 = lay[1];
  const base = new Float32Array([L0.x, L0.cy - 0.1, L0.cz, 0.9, 0.5, 0.2]);   /* one inside, one outside every pennant */
  const nb = new Float32Array([0, 0, 1, 0, 0, 1]);
  const pos = new Float32Array(6), nrm = new Float32Array(6);
  GARDEN.pennantWave(base, pos, nb, nrm, lay, [0, 30, 0, 0, 0]);
  near(Math.hypot(pos[1] - L0.cy, pos[2] - L0.cz), 0.1, 1e-6, 'distance from the hang line');
  assert.ok(pos[2] < L0.cz, 'a positive angle swings the hanging tip toward -z (right-hand rule about +x)');
  near(nrm[1], -0.5, 1e-6, 'normal rotates too');
  assert.deepEqual(Array.from(pos.slice(3)), Array.from(base.slice(3)), 'vertices off the pennants untouched');
});

test('sunflowers face the sun by day and follow the spotlight at Showtime', () => {
  const o = {};
  for (let t = 0; t < 30; t += 0.5) {
    GARDEN.sunAim(t, 0, 0, 0.1, false, M.coneSweep, o);
    assert.ok(o.yaw >= -42 - 1e-9 && o.yaw <= -34 + 1e-9, 'day yaw near the sun ' + o.yaw);
    GARDEN.sunAim(t, 1, 1, 0.1, false, M.coneSweep, o);
    assert.ok(Math.abs(o.yaw) <= 25 + 1e-9 && o.pitch < -16, 'show yaw follows the ±25° sweep');
  }
  GARDEN.sunAim(5, 0, 0, 0.1, true, M.coneSweep, o);
  near(o.yaw, -38, 1e-9, 'reduced day pose');
});

test('path runway: off by day, a ≤ 2 Hz chase at Showtime, steady when reduced', () => {
  near(GARDEN.runwayLevel(3, 2, 0, false, M.chaseWave), 0, 0);
  let peaks = 0, prev = -1, rising = false;
  for (let t = 0; t < 8; t += 0.01) {
    const v = GARDEN.runwayLevel(t, 3, 1, false, M.chaseWave);
    assert.ok(v >= 0.25 - 1e-9 && v <= 1 + 1e-9);
    if (v < prev && rising) peaks++;
    rising = v > prev; prev = v;
  }
  assert.ok(peaks / 8 <= 2, 'pulses per second ' + peaks / 8);
  near(GARDEN.runwayLevel(1, 3, 1, true, M.chaseWave), 0.8, 1e-9);
});

test('LED groups: antiphase twinkle scaled by the Showtime mix', () => {
  const o = [0, 0];
  GARDEN.ledLevels(1, 0.2, 0, false, M.twinkle, o);
  assert.deepEqual(o, [0, 0]);
  for (let t = 0; t < 2; t += 0.05) {
    GARDEN.ledLevels(t, 0.2, 0.5, false, M.twinkle, o);
    assert.ok(o[0] <= 0.5 + 1e-9 && o[1] <= 0.5 + 1e-9 && o[0] >= 0 && o[1] >= 0);
    near(o[0] + o[1], 0.5 * (0.7 + 0.65), 1e-6, 'antiphase pair');
  }
});

/* ---------------- handlers through a fake handle ---------------- */
test('trees sway about the base (root alias), rest under reduced motion', () => {
  const a = handle();
  for (let t = 0; t < 5; t += 0.25) {
    a.t = t; MODELS.tree_oak.idle(a);
    const p = a.log.pivots.sway;
    assert.ok(Math.abs(p.r[2]) <= 1.5 + 1e-9 && p.r[1] === 0 && p.s[0] === 1);
  }
  const r = handle({ reduced: true });
  ['tree_pine', 'tree_palm', 'tree_apple', 'tree_blossom'].forEach((id) => { MODELS[id].idle(r); assert.deepEqual(r.log.pivots.sway.r, [0, 0, 0]); });
  ['tree_oak', 'bench', 'umbrella', 'sandcastle', 'rock_mossy', 'path_wood'].forEach((id) => assert.equal(MODELS[id].act(handle(), 'wave'), null, id + ' has no act'));
});

test('blossom petals are emitted through the fx pool, never under reduced motion', () => {
  const a = handle();
  for (let t = 0; t < 12; t += 1 / 30) { a.t = t; MODELS.tree_blossom.idle(a); }
  assert.ok(a.log.emit.length >= 6 && a.log.emit.length <= 13, 'about one petal every 1–1.6 s: ' + a.log.emit.length);
  assert.equal(a.log.emit[0][0], 'petal');
  const r = handle({ reduced: true });
  for (let t = 0; t < 12; t += 1 / 30) { r.t = t; MODELS.tree_blossom.idle(r); }
  assert.equal(r.log.emit.length, 0);
});

test('flowers bob ±2% and the rock blinks', () => {
  const a = handle();
  for (let t = 0; t < 3; t += 0.1) {
    a.t = t; MODELS.flower_tulip.idle(a);
    assert.ok(Math.abs(a.log.pivots.sway.s[1] - 1) <= 0.02 + 1e-9);
    MODELS.flower_sun.idle(a);
    assert.ok(a.log.pivots.head0 && a.log.pivots.head1);
  }
  let closed = false;
  for (let t = 0; t < 20; t += 1 / 60) { a.t = t; MODELS.rock_mossy.idle(a); if (a.log.pivots.eyes.s[1] < 0.5) closed = true; }
  assert.ok(closed, 'the rock blinked within 20 s');
});

test('lantern glow act: gentle rising steps, halo + Showtime decal, no sounds (rewards-world plays them)', () => {
  const a = handle({ show: 1 });
  const levels = [];
  const act = MODELS.lantern.act(a, 'glow');
  assert.ok(act && act.dur === 0.25);
  let t = 0, alive = true;
  while (alive) { a.t = 50 + t; alive = act.update(a, t); levels.push(a.log.states.lit); t += 1 / 60; }
  for (let i = 1; i < levels.length; i++) assert.ok(levels[i] >= levels[i - 1] - 1e-9, 'never dips (no strobe)');
  near(levels[levels.length - 1], 1, 1e-9);
  assert.deepEqual(a.log.halo, [['glow', true, 0.9, 'Lamp Halo']]);
  assert.deepEqual(a.log.decal, [[true, 'Lamp Warm']]);
  assert.equal(a.log.sfx.length, 0);
  /* toggling again switches it off */
  const off = MODELS.lantern.act(a, 'glow');
  runToEnd(off, a);
  near(a.log.states.lit, 0, 1e-9);
  assert.deepEqual(a.log.halo[1], ['glow', false, 0.9, 'Lamp Halo']);
  /* reduced: instant */
  const r = handle({ reduced: true });
  const on = MODELS.mushroom_glow.act(r, 'glowOn');
  assert.equal(on.update(r, 0), false);
  near(r.log.states.lit, 1, 1e-9);
  assert.equal(r.log.halo[0][3], 'Cap Halo');
});

test('lit lamps pulse ±12% on the beat while music plays, never when reduced or silent', () => {
  const a = handle({ lit: true, beat: 0 });
  MODELS.lantern.idle(a);
  near(a.log.pivots.glow.s[0], 1.12, 1e-9);
  a.beat = 0.5; MODELS.mushroom_glow.idle(a);
  near(a.log.pivots.glow.s[0], 0.88, 1e-9);
  const q = handle({ lit: true, music: false });
  MODELS.lantern.idle(q); near(q.log.pivots.glow.s[0], 1, 0);
  const r = handle({ lit: true, reduced: true });
  MODELS.lantern.idle(r); near(r.log.pivots.glow.s[0], 1, 0);
  near(r.log.states.lit, 1, 0);
  const off = handle({ lit: false });
  MODELS.lantern.idle(off); near(off.log.pivots.glow.s[0], 1, 0);
});

test('flag and bunting acts: SLMotion durations and their whoosh; LEDs only at Showtime', () => {
  const a = handle();
  const f = MODELS.flag_pole.act(a, 'wave');
  near(runToEnd(f, a), 1.2, 0.05);
  assert.deepEqual(a.log.sfx, [['whoosh', 0.5, undefined]]);
  const b = handle();
  near(runToEnd(MODELS.bunting.act(b, 'wave'), b), 0.8, 0.05);
  const day = handle({ show: 0 });
  MODELS.bunting.idle(day);
  assert.deepEqual(day.log.pivots.leds.s, [0, 0, 0]);
  assert.equal(day.log.states.ledA, undefined);
  const show = handle({ show: 1 });
  MODELS.flag_pole.show(show, 1);
  assert.deepEqual(show.log.pivots.leds.s, [GARDEN.FX_SCALE, GARDEN.FX_SCALE, GARDEN.FX_SCALE], "the 1/FX_SCALE LEDs scale up at Showtime");
  assert.ok(show.log.states.ledA > 0 && show.log.states.ledB > 0);
  assert.equal(MODELS.flag_pole.act(handle({ reduced: true }), 'wave').dur, 0);
});

test('windmill: idle turn, a 3 s spin act that lands seamlessly back on the idle', () => {
  const a = handle({ phase: 0 });
  a.t = 0; MODELS.windmill.idle(a);
  const z0 = a.log.pivots.spin.r[2];
  a.t = 1; MODELS.windmill.idle(a);
  near(((z0 - a.log.pivots.spin.r[2]) % 360 + 360) % 360, 90, 1e-6, 'a quarter turn a second at 0.25 rev/s');
  const act = MODELS.windmill.act(a, 'spin');
  near(runToEnd(act, a), 3, 0.05);
  assert.deepEqual(a.log.sfx.map((s) => s[0]), ['whoosh', 'boost']);
  /* after the act the sail angle differs from the plain idle by whole quarter turns only */
  const after = handle({ uid: a.uid, phase: 0, t: 200 });
  MODELS.windmill.idle(after);
  const idleOnly = -(M.spin(200, 0.25, 0, false) % 360);
  const diff = ((after.log.pivots.spin.r[2] - idleOnly) % 90 + 90) % 90;
  assert.ok(diff < 1e-6 || 90 - diff < 1e-6, 'lands on a quarter turn: ' + diff);
  const r = handle({ reduced: true });
  near(MODELS.windmill.act(r, 'spin').dur, 0.6, 1e-9);
  /* light-painting tips: hidden by day, scaled up (and lit with the mix) at Showtime */
  const day = handle({ show: 0 }); MODELS.windmill.idle(day);
  assert.deepEqual(day.log.pivots.tips.s, [0, 0, 0]);
  const night = handle({ show: 0.8 }); MODELS.windmill.show(night, 0.8);
  assert.deepEqual(night.log.pivots.tips.s, [GARDEN.FX_SCALE, GARDEN.FX_SCALE, GARDEN.FX_SCALE]);
  near(night.log.states.tips, 0.8, 1e-9);
});

test('lighthouse: beam scales up only while lit and cycles neon only at Showtime', () => {
  const a = handle({ lit: false });
  MODELS.lighthouse.idle(a);
  assert.equal(a.log.pivots.beam, undefined, 'never touched while dark');
  const act = MODELS.lighthouse.act(a, 'glowOn');
  runToEnd(act, a);
  near(a.log.pivots.beam.s[0], GARDEN.LH.beamScale, 1e-9);
  assert.deepEqual(a.log.halo[0], ['glow', true, 1, 'Lamp Halo']);
  MODELS.lighthouse.lit(a, false);
  near(a.log.pivots.beam.s[0], 0, 0);
  near(a.log.states.lit, 0, 0);
  assert.equal(typeof MODELS.lighthouse.material, 'function');
});

test('paths: the runway chase drives the glow plate only at Showtime', () => {
  const a = handle({ show: 1, pathD: 2 });
  MODELS.path_stone.idle(a);
  assert.ok(a.log.states.runway >= 0.25 && a.log.states.runway <= 1);
  const d = handle({ uid: a.uid, show: 0 });
  MODELS.path_stone.idle(d);
  near(d.log.states.runway, 1, 0, 'restored to the steady initial level after Showtime');
  const quiet = handle({ show: 0 });
  MODELS.path_flower.show(quiet, 0);
  assert.equal(quiet.log.states.runway, undefined, 'no writes by day');
});

test('handlers tolerate a bare handle (no pivot / state / fx functions)', () => {
  GARDEN.IDS.forEach((id) => {
    const bare = { uid: 'bare-' + id, t: 3, phase: 0.5, show: 1, lit: true };
    assert.doesNotThrow(() => { MODELS[id].idle(bare); MODELS[id].show(bare, 1); }, id);
    const act = MODELS[id].act(bare, id === 'windmill' ? 'spin' : /lantern|mushroom|lighthouse/.test(id) ? 'glow' : 'wave');
    if (act) assert.doesNotThrow(() => runToEnd(act, bare), id);
  });
});
