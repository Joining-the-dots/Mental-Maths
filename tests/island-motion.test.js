'use strict';
/* My Island 3D — motion timelines (world/island3d/motion.js) */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const M = require('../world/island3d/motion.js');
const FX = require('../world/games/fx.js');
const C = require('../world/world-core.js');

const NAMES = Object.keys(M.ACTS);
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const LEAD = { lead: 1.2 };
/* keys that must carry straight across an interruption (the rest restart by design:
   a re-drop falls from 1.2, a flip/launch/debut starts over, a lamp steps up again) */
const CONT = {
  squish: ['sy', 'sxz'], dropIn: ['sy', 'sxz', 'a'], store: ['s'], glowOn: [], glowOff: ['level'], flag: ['amp', 'hz'],
  bunting: ['amp'], spin: ['rps', 'extraDeg'], swing: ['deg', 'idleMix'], splash: ['c', 'l', 'r'], bounce: ['matDip', 'petY'],
  bubbles: ['wobble'], launch: [], kartRev: [], home: ['deg'], homeClose: ['deg'], debut: [], hop: ['dy', 'sy']
};
const SFX = ['pop', 'chip', 'whoosh', 'star', 'boost', 'combo', 'boing', 'unlock'];
function sameMod(a, b, m) { if (!m) return near(a, b, 1e-6); const d = ((a - b) % m + m) % m; return d < 1e-6 || m - d < 1e-6; }
function atEnd(name, s, reduced) {
  const spec = M.ACTS[name], end = (reduced && spec.endReduced) || spec.end, mod = spec.mod || {};
  for (const k of Object.keys(end)) assert.ok(sameMod(s[k], end[k], mod[k]), `${name}${reduced ? ' (reduced)' : ''} ends with ${k} = ${s[k]}, want ${end[k]}`);
}
function peaksPerSec(fn, T = 20, dt = 1 / 480) {
  let peaks = 0, a = fn(0), b = fn(dt);
  for (let t = 2 * dt; t < T; t += dt) { const c = fn(t); if (b > a && b >= c && b - Math.min(a, c) > 1e-6) peaks++; a = b; b = c; }
  return peaks / T;
}

/* ---------------- acts ---------------- */
test('motion: every act lasts at most 3 s (the swing decay excepted) and ends at rest', () => {
  assert.deepEqual(NAMES.slice().sort(), Object.keys(CONT).sort(), 'every act has a continuity rule in this test');
  for (const name of NAMES) {
    const o = name === 'bounce' ? LEAD : {}, dur = M.durOf(name, o);
    assert.ok(dur > 0 && dur <= (name === 'swing' ? 4 : 3), name + ' lasts ' + dur);
    for (let t = 0; t <= dur + 0.5; t += 0.01) {
      const s = M.sample(name, t, {}, o);
      for (const k of M.ACTS[name].keys) assert.ok(Number.isFinite(s[k]), `${name} ${k} at ${t}`);
    }
    atEnd(name, M.sample(name, dur, {}, o));
    atEnd(name, M.sample(name, dur + 2, {}, o));
  }
  assert.equal(M.durOf('swing'), 4);
  assert.ok(M.durOf('bounce', { lead: 99 }) <= 3, 'the run-over is capped so the trampoline act stays ≤ 3 s');
});

test('motion: interrupted acts restart cleanly from the pose they were in', () => {
  for (const name of NAMES) {
    const o = name === 'bounce' ? { lead: 0.4 } : {}, dur = M.durOf(name, o), spec = M.ACTS[name];
    for (const f of [0.05, 0.2, 0.37, 0.5, 0.73, 0.95]) {
      const s1 = M.sample(name, f * dur, {}, o), from = M.carry(name, s1);
      const o2 = Object.assign({}, o, { from }), s0 = M.sample(name, 0, {}, o2);
      for (const k of CONT[name]) assert.ok(sameMod(s0[k], s1[k], (spec.mod || {})[k]), `${name} restart at ${(f * dur).toFixed(2)}s: ${k} ${s1[k]} → ${s0[k]}`);
      const d2 = M.durOf(name, o2);
      for (let t = 0; t <= d2; t += 0.02) for (const k of spec.keys) assert.ok(Number.isFinite(M.sample(name, t, {}, o2)[k]), name + ' ' + k);
      atEnd(name, M.sample(name, d2, {}, o2));
    }
  }
});

test('motion: drop-in key values (fall 1.2 u in 0.22 s, squash 0.8 / 1.12 for 0.08 s, outBack rebound)', () => {
  const s = (t) => M.sample('dropIn', t, {});
  assert.deepEqual({ ...s(0) }, { dy: 1.2, sy: 1, sxz: 1, a: 1 });
  assert.ok(near(s(0.11).dy, 0.9), 'inQuad fall');
  for (const t of [0.22, 0.26, 0.299]) { assert.equal(s(t).dy, 0); assert.equal(s(t).sy, 0.8); assert.equal(s(t).sxz, 1.12); }
  let peak = 0;
  for (let t = 0.3; t < 0.55; t += 0.005) peak = Math.max(peak, s(t).sy);
  assert.ok(peak > 1 && peak < 1.05, 'outBack rebound overshoots a little: ' + peak);
  assert.deepEqual({ ...s(0.55) }, { dy: 0, sy: 1, sxz: 1, a: 1 });
  const cues = M.cues('dropIn');
  assert.ok(cues.every((c) => c.t === 0.22));
  assert.deepEqual(cues.map((c) => c.sfx || c.emit), ['chip', 'pop', 'dust']);
  assert.equal(cues.find((c) => c.emit).n, 6);
  /* reduced motion: no fall, a short fade-in */
  for (let t = 0; t <= 0.2; t += 0.01) assert.equal(M.sample('dropIn', t, {}, { reduced: true }).dy, 0);
  assert.equal(M.sample('dropIn', 0, {}, { reduced: true }).a, 0);
});

test('motion: the universal squish goes 1 → 0.92 → 1.06 → 1 in 0.25 s', () => {
  const sy = (t) => M.sample('squish', t, {}).sy;
  assert.equal(sy(0), 1);
  assert.ok(near(sy(0.07), 0.92)); assert.ok(near(sy(0.16), 1.06)); assert.equal(sy(0.25), 1);
  let lo = 1, hi = 1;
  for (let t = 0; t <= 0.25; t += 0.002) { lo = Math.min(lo, sy(t)); hi = Math.max(hi, sy(t)); }
  assert.ok(near(lo, 0.92) && near(hi, 1.06));
  assert.deepEqual(M.cues('squish'), [{ t: 0, sfx: 'pop' }]);
});

test('motion: swing period 1.6 s, ±38°, decaying to rest by 4 s with whooshes at the first 3 high points', () => {
  const deg = (t) => M.sample('swing', t, {}).deg;
  assert.ok(near(deg(0.4), 38));
  for (const k of [1, 2, 3, 4]) assert.ok(Math.abs(deg(0.8 * k)) < 1e-6, 'zero crossing at ' + 0.8 * k);
  assert.ok(deg(1.2) < 0 && deg(2.0) > 0 && deg(2.8) < 0, 'alternates');
  const highs = [0.4, 1.2, 2.0, 2.8, 3.6].map((t) => Math.abs(deg(t)));
  for (let i = 1; i < highs.length; i++) assert.ok(highs[i] < highs[i - 1], 'decays ' + highs);
  let crossings = 0, prev = deg(0.01);
  for (let t = 0.02; t < 4; t += 0.01) { const d = deg(t); if ((d < 0) !== (prev < 0)) crossings++; prev = d; }
  assert.equal(crossings, 4, 'half-period 0.8 s');
  assert.equal(deg(4), 0);
  assert.deepEqual(M.cues('swing').map((c) => +c.t.toFixed(6)), [0.4, 1.2, 2.0]);
  assert.ok(M.cues('swing').every((c) => c.sfx === 'whoosh'));
  /* a tap at a (decayed) high point refills the swing from where the seat is: the next
     high point comes within half a period and reaches the full 38° again */
  const at = M.sample('swing', 1.2, {}), from = M.carry('swing', at);
  const again = M.sample('swing', 0, {}, { from });
  assert.ok(near(again.deg, at.deg));
  const t1 = M.cues('swing', { from })[0].t;
  assert.ok(t1 > 0 && t1 <= 0.8, 'first high point ' + t1);
  assert.ok(near(Math.abs(M.sample('swing', t1, {}, { from }).deg), 38));
  const mid = M.sample('swing', 1.0, {}), from2 = M.carry('swing', mid);
  assert.equal(Math.sign(M.sample('swing', 0.02, {}, { from: from2 }).deg - mid.deg), Math.sign(M.sample('swing', 1.02, {}).deg - mid.deg), 'same direction');
  /* the ±4° idle is muted under the big swing and fades back as it decays */
  assert.equal(M.sample('swing', 0.2, {}).idleMix, 0);
  let mixPrev = 0;
  for (let t = 0.4; t <= 4; t += 0.05) { const m = M.sample('swing', t, {}).idleMix; assert.ok(m >= mixPrev - 1e-12); mixPrev = m; }
  assert.equal(M.sample('swing', 4, {}).idleMix, 1);
});

test('motion: windmill spins up to 2.5 rev/s and eases back over 3 s, landing square', () => {
  const s = (t, o) => M.sample('spin', t, {}, o);
  assert.equal(s(0).rps, 0.25);
  assert.ok(near(s(1 / 3).rps, 2.5));
  let peak = 0, prevDeg = -1, prevRps = 0, pastPeak = false;
  for (let t = 0; t <= 3; t += 0.005) {
    const v = s(t);
    peak = Math.max(peak, v.rps);
    assert.ok(v.extraDeg >= prevDeg - 1e-9, 'always turns forward');
    if (t > 1 / 3 + 1e-9) { if (pastPeak) assert.ok(v.rps <= prevRps + 1e-9, 'eases back'); pastPeak = true; }
    prevDeg = v.extraDeg; prevRps = v.rps;
  }
  assert.ok(near(peak, 2.5, 1e-3));
  assert.equal(s(3).rps, 0.25);
  assert.ok(near(s(3).extraDeg % 90, 0), 'a whole number of quarter turns (4 sails)');
  /* restarting mid-spin keeps the speed and still lands square, with a peak close to 2.5 */
  for (const ti of [0.2, 0.9, 2.1]) {
    const from = M.carry('spin', s(ti)), r0 = s(0, { from });
    assert.ok(near(r0.rps, from.rps));
    let p = 0;
    for (let t = 0; t <= 3; t += 0.01) p = Math.max(p, s(t, { from }).rps);
    assert.ok(p > 2.3 && p < 2.7, 'peak ' + p);
    assert.ok(sameMod(s(3, { from }).extraDeg, 0, 90));
  }
});

test('motion: fountain jets go centre, left, right, then all together', () => {
  const s = (t) => M.sample('splash', t, {});
  const first = { c: null, l: null, r: null };
  for (let t = 0; t <= 3; t += 0.005) for (const k of ['c', 'l', 'r']) if (first[k] === null && s(t)[k] > 0.8) first[k] = t;
  assert.ok(first.c < first.l && first.l < first.r, JSON.stringify(first));
  for (const [t, up] of [[0.3, 'c'], [0.9, 'l'], [1.5, 'r']]) {
    for (const k of ['c', 'l', 'r']) assert.equal(s(t)[k] > 0, k === up, `t ${t} jet ${k}`);
  }
  const fin = s(2.1);
  assert.ok(fin.c >= 1.1 && fin.l >= 1.1 && fin.r >= 1.1, 'all together, higher');
  assert.deepEqual({ ...s(3) }, { c: 0, l: 0, r: 0 });
  const cues = M.cues('splash');
  assert.deepEqual(cues.filter((c) => c.sfx === 'combo').map((c) => c.step), [0, 1, 2, 3]);
  assert.equal(cues[0].sfx, 'whoosh'); assert.equal(cues[cues.length - 1].sfx, 'star');
});

test('motion: trampoline bounces 0.5, 0.75, 1.0 u with a front flip on the last; the mat dips 0.12 u', () => {
  const o = { lead: 1.2 }, dur = M.durOf('bounce', o);
  assert.ok(dur <= 3);
  let minDip = 0, maxFlip = 0;
  const peaks = [];
  let rising = false, prevY = 0;
  for (let t = 0; t <= dur; t += 0.001) {
    const v = M.sample('bounce', t, {}, o);
    minDip = Math.min(minDip, v.matDip);
    maxFlip = Math.max(maxFlip, v.flip);
    if (v.petY < prevY && rising && prevY > 0.1) peaks.push(prevY);
    rising = v.petY > prevY; prevY = v.petY;
    if (t < 1.2) assert.equal(v.petY, 0, 'still running over');
  }
  assert.equal(peaks.length, 3);
  [0.5, 0.75, 1.0].forEach((h, i) => assert.ok(Math.abs(peaks[i] - h) < 0.01, 'bounce ' + i + ' ' + peaks[i]));
  assert.ok(near(minDip, -0.12, 1e-3));
  assert.ok(maxFlip > 0.99 && maxFlip <= 1);
  const cues = M.cues('bounce', o), boings = cues.filter((c) => c.sfx === 'boing'), combos = cues.filter((c) => c.sfx === 'combo');
  assert.equal(boings.length, 3);
  assert.deepEqual(combos.map((c) => c.step), [0, 2, 4], 'combo steps layered on each boing');
  assert.deepEqual(combos.map((c) => c.t), boings.map((c) => c.t));
  assert.ok(boings[0].t === 1.2 && boings[1].t > boings[0].t && boings[2].t > boings[1].t);
  assert.ok(near(M.durOf('bounce'), M.BOUNCE.length));
});

test('motion: bubbles, launch, garage rev, door and debut timelines', () => {
  const bc = M.cues('bubbles');
  assert.equal(bc.filter((c) => c.emit === 'bubble').reduce((a, c) => a + c.n, 0), 24);
  assert.equal(bc.filter((c) => c.sfx === 'pop').length, 6, 'at most 6 audible pops');
  assert.deepEqual(bc.filter((c) => c.sfx === 'combo').map((c) => c.step), [0, 1, 2, 3, 4, 5], 'combo stepping up');
  let hi = 0;
  for (let i = 0; i < 24; i++) {
    const end = M.bubbleTrack(5, 1000 + i);
    assert.ok(end.popped && end.a === 0);
    for (let age = 0; age < 3; age += 0.05) { const b = M.bubbleTrack(age, 1000 + i); assert.ok(b.r >= 0.04 && b.r <= 0.12); if (!b.popped) hi = Math.max(hi, b.y); }
    assert.deepEqual(M.bubbleTrack(1, 1000 + i), M.bubbleTrack(1, 1000 + i));
  }
  assert.ok(hi > 1.5 && hi <= 3.35, 'bubbles rise 1.5–3 u: ' + hi);
  assert.ok(near(M.sample('launch', 0.35, {}).k, 0.5));
  assert.equal(M.sample('launch', 0.7, {}).spinDeg % 360, 0);
  let wob = 0;
  for (let t = 0; t <= 0.7; t += 0.005) wob = Math.max(wob, Math.abs(M.sample('kartRev', t, {}).wobble));
  assert.ok(wob > 1 && wob <= 3);
  assert.deepEqual(M.cues('kartRev').filter((c) => c.emit === 'exhaust').length, 2);
  /* the door opens 70° in 0.3 s and holds until homeClose */
  assert.equal(M.ACTS.home.hold, true);
  assert.equal(M.sample('home', 0.3, {}).deg, 70);
  assert.ok(M.cues('home').some((c) => c.emit === 'heart' && c.n === 3));
  const closeFromHalf = M.sample('homeClose', 0, {}, { from: { deg: 35 } });
  assert.equal(closeFromHalf.deg, 35);
  assert.equal(M.sample('homeClose', 0.3, {}).deg, 0);
  assert.ok(near(M.sample('debut', 0.6, {}).deg, 180));
  /* CATALOG acts map to timelines */
  for (const it of C.CATALOG.filter((x) => x.act)) {
    const a = M.actFor(it.act, it.id, false);
    assert.ok(M.ACTS[a], it.id + ' → ' + a);
  }
  assert.equal(M.actFor('glow', 'lantern', true), 'glowOff');
  assert.equal(M.actFor('wave', 'bunting'), 'bunting');
  assert.equal(M.actFor('wave', 'flag_pole'), 'flag');
  assert.equal(M.actFor('launch', 'att_kart'), 'kartRev');
  assert.equal(M.actFor('launch', 'att_pitch'), 'launch');
  assert.equal(M.actFor(null, 'tree_oak'), null);
});

test('motion: cues are sorted, inside their act, and use the shell sound names', () => {
  for (const name of NAMES) for (const reduced of [false, true]) {
    const o = name === 'bounce' ? { lead: 1.2, reduced } : { reduced }, dur = M.durOf(name, o), list = M.cues(name, o);
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      assert.ok(c.t >= 0 && c.t <= dur + 1e-9, `${name} cue at ${c.t} (dur ${dur})`);
      if (i) assert.ok(c.t >= list[i - 1].t);
      assert.ok(!!c.sfx !== !!c.emit, name + ' cue is a sound or an emit');
      if (c.sfx) assert.ok(SFX.includes(c.sfx), c.sfx);
      if (c.emit) assert.ok(c.n >= 1);
    }
  }
});

/* ---------------- scene timelines ---------------- */
test('motion: Showtime mix endpoints and monotonicity', () => {
  assert.equal(M.SHOW_MIX_SEC, 1.6); assert.equal(M.SHOW_MIX_REDUCED_SEC, 0.25);
  for (const [k0, target] of [[0, 1], [1, 0], [0.3, 1], [0.8, 0]]) {
    for (const reduced of [false, true]) {
      assert.equal(M.showMix(0, k0, target, reduced), k0);
      assert.equal(M.showMix(reduced ? 0.25 : 1.6, k0, target, reduced), target);
      assert.equal(M.showMix(99, k0, target, reduced), target);
      let prev = k0;
      for (let t = 0; t <= 2; t += 0.01) {
        const k = M.showMix(t, k0, target, reduced);
        assert.ok(target > k0 ? k >= prev - 1e-12 : k <= prev + 1e-12);
        assert.ok(k >= Math.min(k0, target) - 1e-12 && k <= Math.max(k0, target) + 1e-12);
        prev = k;
      }
    }
  }
  assert.ok(near(M.showMix(0.8, 0, 1), 0.5), 'inOutSine midpoint');
  assert.ok(near(M.showMix(0.125, 0, 1, true), 0.5), 'linear crossfade under reduced motion');
});

test('motion: land rise, camera reveals and the beat clock', () => {
  const r = (t, d) => M.landRise(t, d, false).y01;
  assert.equal(r(0.1, 0.2), 0); assert.equal(r(0.2 + 0.35, 0.2), 1);
  let over = 0;
  for (let t = 0.2; t < 0.55; t += 0.005) over = Math.max(over, r(t, 0.2));
  assert.ok(over > 1, 'outBack pop');
  assert.ok(near(M.riseDur(18), 17 * 0.05 + 0.35));
  assert.equal(M.landRise(0, 0.5, true).y01, 1, 'reduced: the land swaps in');
  const cr = (t) => M.crane(t).elev;
  assert.equal(cr(0), 52); assert.equal(cr(1.4), 40); assert.equal(cr(2.5), 40); assert.ok(near(cr(3.9), 52));
  assert.ok(near(M.CRANE.dur, 3.9));
  assert.equal(M.crane(1, true).k, 1); assert.equal(M.crane(3, true).k, 0);
  assert.equal(M.orbit(0), 0); assert.ok(near(M.orbit(4), 8)); assert.ok(near(M.orbit(8), 0)); assert.equal(M.orbit(4, true), 0);
  assert.ok(near(M.pushIn(0), 0)); assert.equal(M.pushIn(0.7), 1); assert.equal(M.pushIn(0, true), 1);
  const b = M.beatInfo(60 / 118 * 9 + 0.01, 118, 0);
  assert.equal(b.beat, 9); assert.equal(b.count, 2); assert.equal(b.bar, 2); assert.equal(b.beatInBar, 1);
  assert.ok(near(60 / 118 * 8, 4.068, 1e-3), 'the 8-count dance break is ≈ 4.07 s');
});

/* ---------------- idle loops ---------------- */
test('motion: idle loops are periodic, phase-offset and bounded', () => {
  const sw = (t, ph) => M.sway(t, 1.5, 4.2, ph).z;
  assert.ok(near(sw(1.3, 0.2), sw(1.3 + 4.2, 0.2)));
  assert.notEqual(sw(1.3, 0.2), sw(1.3, 0.7), 'phase from uid');
  for (let t = 0; t < 10; t += 0.1) { const s = M.sway(t, 3, 3.6, 0); assert.ok(Math.abs(s.z) <= 3 && Math.abs(s.x) <= 3); }
  for (let t = 0; t < 5; t += 0.1) { const b = M.bob(t, 2, 2.4, 0.3); assert.ok(b >= 0.98 - 1e-9 && b <= 1.02 + 1e-9); }
  assert.ok(near(M.spin(4, 0.25, 0), 0) || near(M.spin(4, 0.25, 0), 360));
  assert.ok(near(M.spin(1, 0.25, 0), 90));
  assert.ok(near(M.flutter(0.3, 0.04, 2, 0, 0), 0), 'the pole edge stays put');
  let fl = 0;
  for (let t = 0; t < 2; t += 0.01) fl = Math.max(fl, Math.abs(M.flutter(t, 0.04, 2, 1, 0)));
  assert.ok(near(fl, 0.04, 2e-3), 'free edge flutters 0.04 u');
  const sm = M.smoke(0.6, 1, 3, 2.4, 0);
  assert.ok(sm.y >= 0 && sm.y <= 0.6 && sm.s >= 1 && sm.s <= 1.8);
  assert.deepEqual(M.smoke(0.6, 1, 3, 2.4, 0), M.smoke(0.6 + 2.4, 1, 3, 2.4, 0));
  for (let i = 0; i < 12; i++) { const d = M.drop(0.37, i, 12, 3, 0.9, 0); assert.ok(d.a >= 0 && d.a <= 1 && d.y >= 0 && d.y <= 0.42 + 1e-9); }
  for (let t = 0; t < 10; t += 0.05) assert.equal(M.idleBubble(t, 2, 2, 0).a, 0, 'at most 2 idle bubbles alive');
  assert.ok(M.idleBubble(0.5, 0, 2, 0).a > 0);
  for (let i = 0; i < 4; i++) { const p = M.petal(1.7, i, 'p3'); assert.ok(p.y >= 0 && p.y <= 1.3 && p.a >= 0 && p.a <= 1); }
  assert.ok(Math.abs(M.avatarBob(0.5, 0)) <= 0.02 && near(M.avatarBob(0.5, 0), 0.02), 'bobs 0.02 u at 0.5 Hz');
  assert.ok(near(M.beamAngle(1, 0.3, 0), 108));
  const bcol = M.beamColor(9, 4, 3);
  assert.equal(bcol.i, 2); assert.equal(bcol.j, 0);
  assert.ok(Math.abs(M.coneSweep(1, 0)) <= 25);
  for (let t = 0; t < 50; t += 0.5) { const x = M.drift(t, 0.08, 40, 3); assert.ok(x >= -20 && x < 20); }
});

test('motion: event schedules keep their gaps (rock blinks every 5–9 s)', () => {
  for (const seed of ['p1', 'p2', 'rock_7', 12345]) {
    let last = null;
    const gaps = [];
    for (let t = 0; t < 600; t += 0.05) {
      const e = M.every(t, 5, 9, seed);
      assert.ok(e.t0 <= t + 1e-9 && e.next > t, 'brackets t');
      if (last !== null && e.n !== last.n) { assert.equal(e.n, last.n + 1); gaps.push(e.t0 - last.t0); }
      last = e;
    }
    assert.ok(gaps.length > 60);
    for (const g of gaps) assert.ok(g >= 5 - 1e-9 && g <= 9 + 1e-9, 'gap ' + g);
  }
  let closed = 0, n = 0;
  for (let t = 0; t < 300; t += 0.01, n++) { const o = M.blink(t, 'p9'); assert.ok(o >= 0 && o <= 1); if (o < 1) closed++; }
  assert.ok(closed / n > 0.01 && closed / n < 0.05, 'eyes are open nearly all the time');
});

/* ---------------- safety ---------------- */
test('motion: nothing flashes faster than 2 Hz, whatever it is asked for', () => {
  assert.equal(M.MAX_FLASH_HZ, 2);
  assert.equal(M.safeHz(10), 2); assert.equal(M.safeHz(0.5), 0.5); assert.equal(M.safeHz(-1), 0);
  const checks = {
    twinkle: (t) => M.twinkle(t, 10, 0),
    chase: (t) => M.chase(t, 0, 10, 1),
    chaseGroups: (t) => M.chase(t, 2, 1.97, 3),
    chaseWave: (t) => M.chaseWave(t, 0, 10, 1),
    runway: (t) => M.chaseWave(t, 3, 2, 4),
    pulse118: (t) => M.pulse((t * 118 / 60) % 1, 12),
    glint: (t) => M.glint(t, 4, 2, 0),
    glintCrown: (t) => M.glint(t, 3, 1, 0)
  };
  for (const [name, fn] of Object.entries(checks)) assert.ok(peaksPerSec(fn) <= 2 + 0.06, name + ' ' + peaksPerSec(fn) + ' Hz');
  /* switching a lamp on only ever brightens (3 steps, no strobe) */
  for (const f of [0, 0.3, 0.9]) {
    let prev = f;
    for (let t = 0; t <= 0.3; t += 0.001) { const lv = M.sample('glowOn', t, {}, { from: { level: f } }).level; assert.ok(lv >= prev - 1e-12, 'glowOn rises'); prev = lv; }
  }
  let prev = 1;
  for (let t = 0; t <= 0.2; t += 0.001) { const lv = M.sample('glowOff', t, {}).level; assert.ok(lv <= prev + 1e-12); prev = lv; }
  /* the Showtime lighthouse colour cycle changes every 4 s */
  let changes = 0, ci = M.beamColor(0, 4, 3).i;
  for (let t = 0; t < 40; t += 0.01) { const i = M.beamColor(t, 4, 3).i; if (i !== ci) changes++; ci = i; }
  assert.equal(changes, 9);
});

test('motion: reduced-motion variants are static or short', () => {
  for (const name of NAMES) {
    const spec = M.ACTS[name], o = { reduced: true, lead: 1.2 }, dur = M.durOf(name, o);
    assert.ok(dur <= 0.6, name + ' reduced lasts ' + dur);
    atEnd(name, M.sample(name, dur, {}, o), true);
    atEnd(name, M.sample(name, dur + 1, {}, o), true);
    assert.ok(spec.reducedCues, name);
  }
  /* big motions are gone entirely */
  for (let t = 0; t <= 1; t += 0.05) {
    assert.equal(M.sample('swing', t, {}, { reduced: true }).deg, 0);
    assert.equal(M.sample('bounce', t, {}, { reduced: true, lead: 1 }).petY, 0);
    assert.equal(M.sample('dropIn', t, {}, { reduced: true }).dy, 0);
    assert.equal(M.sample('flag', t, {}, { reduced: true }).amp, 0);
    assert.equal(M.sample('debut', t, {}, { reduced: true }).deg, 0);
  }
  /* idle loops hold still */
  const R = true;
  for (const t of [0, 1.3, 7.7]) {
    assert.deepEqual({ ...M.sway(t, 3, 3.6, 0.2, R) }, { x: 0, z: 0 });
    assert.equal(M.bob(t, 2, 2.4, 0.1, R), 1);
    assert.equal(M.spin(t, 0.25, 0.4, R), M.spin(0, 0.25, 0.4, R));
    assert.equal(M.flutter(t, 0.04, 2, 1, 0, R), 0);
    assert.equal(M.pennant(t, 2, 6, 0.8, 0, R), 0);
    assert.equal(M.blink(t, 'p1', 5, 9, R), 1);
    assert.equal(M.pulse(t % 1, 12, R), 1);
    assert.equal(M.twinkle(t, 1, 0, R), M.twinkle(0, 1, 0, R));
    assert.equal(M.chase(t, 3, 2, 5, R), M.chase(0, 0, 2, 5, R), 'chase becomes a steady glow');
    assert.equal(M.chaseWave(t, 4, 2, 4, R), M.chaseWave(0, 0, 2, 4, R));
    assert.equal(M.glint(t, 4, 2, 0, R), 0);
    assert.deepEqual(M.smoke(t, 1, 3, 2.4, 0, R), M.smoke(0, 1, 3, 2.4, 0, R));
    assert.equal(M.drop(t, 3, 12, 3, 0.9, 0, R).a, 0);
    assert.equal(M.idleBubble(t, 0, 2, 0, R).a, 0);
    assert.equal(M.petal(t, 1, 'p4', R).a, 0);
    assert.deepEqual(M.snowSparkle(t, 2, 6, 0, R), M.snowSparkle(0, 2, 6, 0, R));
    assert.equal(M.avatarBob(t, 0.3, R), 0);
    assert.equal(M.beamAngle(t, 0.3, 0.2, R), M.beamAngle(0, 0.3, 0.2, R));
    assert.equal(M.coneSweep(t, 1, R), 0);
    assert.equal(M.orbit(t, R), 0);
  }
});

/* ---------------- plumbing ---------------- */
test('motion: easing reuses SLGameFX.ease and adds the extra curves', () => {
  for (const k of Object.keys(FX.ease)) assert.equal(M.ease[k], FX.ease[k], k);
  for (const k of ['inBack', 'outCubic', 'inOutQuad', 'outSine']) {
    assert.equal(typeof M.ease[k], 'function', k);
    assert.ok(near(M.ease[k](0), 0) && near(M.ease[k](1), 1), k);
  }
});

test('motion: samples are pure and reuse the out object', () => {
  const out = {};
  for (const name of NAMES) {
    const a = M.sample(name, 0.17, out, { lead: 0.2 });
    assert.equal(a, out);
    assert.deepEqual({ ...M.sample(name, 0.17, {}, { lead: 0.2 }) }, { ...a });
    for (const k of Object.keys(out)) delete out[k];
  }
  assert.ok(M.sample('squish', 0.1));
  assert.throws(() => M.sample('moonwalk', 0), /unknown act/);
  assert.equal(M.phaseOf('p5'), M.phaseOf('p5'));
  assert.ok(M.phaseOf('p5') >= 0 && M.phaseOf('p5') < 1);
});

test('motion: loads as a browser global (window.SLMotion) and picks up SLGameFX', () => {
  const ctx = {};
  ctx.self = ctx;
  const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
  ctx.window = ctx;
  vm.runInNewContext(read('world/games/fx.js'), ctx);
  vm.runInNewContext(read('world/island3d/motion.js'), ctx);
  assert.ok(ctx.SLMotion && ctx.SLGameFX);
  assert.equal(ctx.SLMotion.ease.outBack, ctx.SLGameFX.ease.outBack);
  /* without fx.js it still works on its own curves */
  const lone = {};
  lone.self = lone;
  vm.runInNewContext(read('world/island3d/motion.js'), lone);
  assert.ok(near(lone.SLMotion.ease.outBack(1), 1));
  assert.ok(near(lone.SLMotion.sample('swing', 0.4, {}).deg, 38));
});
