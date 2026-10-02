'use strict';
/* Encore Shootout (penalty.js) — rules, fairness, timings, events, copy and the 2D fallback.
   Spec: docs/island3d/spec-penalty.json → "tests". */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Pen = require('../world/games/penalty.js');
const C = require('../world/world-core.js');
const FX = require('../world/games/fx.js');

const STEP = 1 / 120;
const T = Pen.TIMING;
const RIVALS = Pen.RIVALS.map(r => r.id);
const DIVES = ['left', 'stay', 'right'];
const STADIA = ['stadium_day', 'stadium_night', 'stadium_beach', 'stadium_snow'];
const BALLS = ['ball_classic', 'ball_rainbow', 'ball_planet', 'ball_gold'];
/* whole words: the spec's own 'SO CLOSE!' contains the letters l-o-s-e */
const BANNED = /\b(fail\w*|lose|loser|losing|lost|bad|wrong)\b/i;

function mkApi(extra) { return Object.assign({ sound() {}, reduced: true }, extra || {}); }
function lcg(seed) { let x = (seed >>> 0) || 1; return () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296; }; }
/* step a round at the fixed 120 Hz tick; ctl(round) runs before every step (like the shell's autopilot hook) */
function run(round, ctl, maxT = 300) {
  let t = 0;
  while (!round.done && t < maxT) { if (ctl) ctl(round); round.step(STEP); t += STEP; }
  return t;
}
function withEvents(round) { round.wantEvents = true; round.events = []; return round; }
const autopilot = r => r.autopilot();
function randomTapper(rng, p) { return r => { if (rng() < p) r.input('kick', true); }; }
/* the hype rule, written independently of the implementation */
function nextHype(h, res, kind) { return res === 'goal' ? Math.min(4, h + 1) : (kind === 'post' || kind === 'bar') ? Math.max(0, h - 1) : 0; }

/* scripted shots: aim at a spot that produces the wanted outcome against this dive */
const AIMS = {
  goal: d => d === 'left' ? [600, 300] : d === 'right' ? [360, 300] : [320, 300],
  top: d => d === 'left' ? [640, 190] : [320, 190],
  save: d => d === 'left' ? [350, 300] : d === 'right' ? [610, 300] : [480, 300],
  post: () => [247, 250], bar: () => [480, 147], wide: () => [229, 250], over: () => [480, 131]
};
const TOL = { goal: [9, 7], top: [9, 7], save: [9, 7], post: [8, 7], bar: [9, 5], wide: [6, 7], over: [9, 4] };
function scripted(kinds) {
  return r => {
    const s = r.state, want = kinds[s.shot];
    if (!want || s.phaseT < T.GUARD) return;
    const [x, y] = AIMS[want](s.dive), [tx, ty] = TOL[want];
    if (s.phase === 'aimX' && Math.abs(s.ax - x) <= tx) r.input('kick', true);
    else if (s.phase === 'aimY' && Math.abs(s.ay - y) <= ty) r.input('kick', true);
  };
}
function kindOf(e) { return e.res === 'goal' ? (e.top ? 'top' : 'goal') : e.kind; }

/* ---------------- tell-reading bots (test-only: they may NOT look at s.dive) ---------------- */
const SAFE = { left: [580, 290], right: [380, 290], stay: [320, 290] };
/* the slow bot fires (late) as the marker crosses the edge of the keeper's reach, heading away from him */
const EDGE = { left: [Pen.REACH.left.x1, 1], right: [Pen.REACH.right.x0, -1], stay: [Pen.REACH.stay.x0, -1] };
function noPeek(s) {
  return new Proxy(s, { get(o, k) { if (k === 'dive' || k === 'pending') throw new Error('bot peeked at s.' + String(k)); return o[k]; } });
}
function tellBot(lag) {
  let pendingAt = -1, px = null, py = null;
  return r => {
    const s = noPeek(r.state);
    if (pendingAt >= 0 && s.clock >= pendingAt - 1e-9) { r.input('kick', true); pendingAt = -1; }
    if (pendingAt < 0 && s.phaseT >= T.GUARD) {
      if (s.phase === 'aimX') {
        const read = s.aimT >= 0.8 ? Pen.readTell(s.rival, s.tell) : null;
        if (read && !lag && Math.abs(s.ax - SAFE[read][0]) < 10) r.input('kick', true);
        else if (read && lag) { const e = EDGE[read]; if (px !== null && Math.sign(s.ax - px) === e[1] && Math.abs(s.ax - e[0]) < 10) pendingAt = s.clock + lag; }
      } else if (s.phase === 'aimY') {
        if (!lag && Math.abs(s.ay - SAFE.left[1]) < 8) r.input('kick', true);
        else if (lag && py !== null && s.ay > py && Math.abs(s.ay - 210) < 8) pendingAt = s.clock + lag;
      }
    }
    px = s.ax; py = s.ay;
  };
}
/* ignores the keeper completely: always the same low shot */
function guesser() {
  return r => {
    const s = r.state;
    if (s.phaseT < T.GUARD) return;
    if (s.phase === 'aimX' && Math.abs(s.ax - 580) < 10) r.input('kick', true);
    else if (s.phase === 'aimY' && Math.abs(s.ay - 290) < 8) r.input('kick', true);
  };
}

/* ---------------- a mock 2D context that records full-canvas white fills ----------------
   Common canvas calls are own properties (fast); anything else falls through to a catch-all
   Proxy on the prototype, so an unexpected canvas API never throws. */
function mockCtx() {
  const NOOP = () => {};
  const stack = [], bad = [];
  const grad = () => ({ addColorStop() {} });
  function whiteAlpha(fs) {
    if (typeof fs !== 'string') return 0;
    const v = fs.replace(/\s+/g, '').toLowerCase();
    if (v === '#fff' || v === '#ffffff' || v === 'white') return 1;
    const m = v.match(/^rgba?\(255,255,255(?:,([\d.]+))?\)$/);
    return m ? (m[1] == null ? 1 : +m[1]) : 0;
  }
  const ctx = Object.create(new Proxy({}, { get: (o, k) => (typeof k === 'string' ? NOOP : undefined) }));
  Object.assign(ctx, {
    fillStyle: '#000000', strokeStyle: '#000000', globalAlpha: 1, lineWidth: 1, font: '',
    save() { stack.push([ctx.fillStyle, ctx.strokeStyle, ctx.globalAlpha]); },
    restore() { const p = stack.pop(); if (p) { ctx.fillStyle = p[0]; ctx.strokeStyle = p[1]; ctx.globalAlpha = p[2]; } },
    fillRect(x, y, w, h) {
      if (x <= 0 && y <= 0 && x + w >= 960 && y + h >= 540 && whiteAlpha(ctx.fillStyle) * ctx.globalAlpha > 0.3) bad.push([x, y, w, h, ctx.fillStyle, ctx.globalAlpha]);
    },
    createLinearGradient: grad, createRadialGradient: grad, createPattern: () => ({}),
    measureText: t => ({ width: String(t).length * 10 }),
    beginPath: NOOP, closePath: NOOP, moveTo: NOOP, lineTo: NOOP, arc: NOOP, ellipse: NOOP, fill: NOOP, stroke: NOOP,
    translate: NOOP, rotate: NOOP, scale: NOOP, setTransform: NOOP, quadraticCurveTo: NOOP, strokeRect: NOOP,
    fillText: NOOP, strokeText: NOOP, setLineDash: NOOP, clip: NOOP, rect: NOOP,
    _bad: bad
  });
  return ctx;
}

/* ================================================================ */

test('penalty: missKind partitions every miss into exactly one documented band', () => {
  function documented(x, y) {
    if (((x >= 238 && x <= 256) || (x >= 704 && x <= 722)) && y >= 138) return 'post';
    if (x < 238 || x > 722) return 'wide';
    if (y < 138) return 'over';
    if (y >= 138 && y <= 156) return 'bar';
    return 'wide';
  }
  let misses = 0;
  const seen = new Set();
  for (let x = Pen.AIM.x0; x <= Pen.AIM.x1; x += 2) for (let y = Pen.AIM.y0; y <= Pen.AIM.y1; y += 2) {
    const mk = Pen.missKind(x, y);
    for (const d of DIVES) assert.equal(mk === null, Pen.outcome(x, y, d) !== 'miss', `${x},${y} vs ${d}`);
    if (mk === null) continue;
    misses++; seen.add(mk);
    assert.ok(['post', 'bar', 'wide', 'over'].includes(mk));
    assert.equal(mk, documented(x, y), `${x},${y}`);
  }
  assert.ok(misses > 1000);
  assert.deepEqual([...seen].sort(), ['bar', 'over', 'post', 'wide']);
  assert.equal(Pen.missKind(247, 250), 'post');
  assert.equal(Pen.missKind(712, 300), 'post');
  assert.equal(Pen.missKind(480, 147), 'bar');
  assert.equal(Pen.missKind(229, 250), 'wide');
  assert.equal(Pen.missKind(480, 130), 'over');
  assert.equal(Pen.missKind(600, 300), null);
});

test('penalty: shotPoints truth table (100 + 10/hype, 150 for top corners and Star Strikes, never more)', () => {
  assert.deepEqual([0, 1, 2, 3].map(h => Pen.shotPoints('goal', false, h)), [100, 110, 120, 130]);
  assert.equal(Pen.shotPoints('goal', false, 4), 150);
  for (let h = 0; h <= 4; h++) assert.equal(Pen.shotPoints('goal', true, h), 150);
  let max = 0;
  for (const res of ['goal', 'save', 'miss']) for (const top of [false, true]) for (let h = 0; h <= 4; h++) {
    const p = Pen.shotPoints(res, top, h);
    if (res !== 'goal') assert.equal(p, 0);
    max = Math.max(max, p);
  }
  assert.equal(max, 150);
  assert.equal(8 * max, C.GAME_RULES.penalty.maxScore);
});

test('penalty: hype transitions are exact and Encore Mode switches on/off with one event each time', () => {
  /* sequence 1: four goals (Encore on), a post (off), a goal (on), a save (off), a wide */
  const r1 = withEvents(Pen.newRound(mkApi(), 'std', { seed: 11 }));
  run(r1, scripted(['goal', 'goal', 'goal', 'goal', 'post', 'goal', 'save', 'wide']));
  assert.equal(r1.done, true);
  assert.deepEqual(r1.state.log.map(kindOf), ['goal', 'goal', 'goal', 'goal', 'post', 'goal', 'save', 'wide']);
  assert.deepEqual(r1.state.log.map(e => e.hypeBefore), [0, 1, 2, 3, 4, 3, 4, 0]);
  assert.deepEqual(r1.state.log.map(e => e.pts), [100, 110, 120, 130, 0, 130, 0, 0]);
  assert.equal(r1.state.score, 590);
  assert.equal(r1.state.hype, 0);
  assert.deepEqual(r1.events.filter(e => e.t === 'hype').map(e => [e.from, e.to]), [[0, 1], [1, 2], [2, 3], [3, 4], [4, 3], [3, 4], [4, 0]]);
  assert.deepEqual(r1.events.filter(e => e.t === 'encore').map(e => e.on), [true, false, true, false]);
  assert.equal(r1.state.encore, false);
  /* sequence 2: a bar ping at 0 stays at 0 (no event); a 5th goal in a row stays at 4 and is a Star Strike */
  const r2 = withEvents(Pen.newRound(mkApi(), 'rival_bop', { seed: 12 }));
  run(r2, scripted(['bar', 'goal', 'goal', 'goal', 'goal', 'goal', 'over', 'post']));
  assert.deepEqual(r2.state.log.map(kindOf), ['bar', 'goal', 'goal', 'goal', 'goal', 'goal', 'over', 'post']);
  assert.deepEqual(r2.state.log.map(e => e.hypeBefore), [0, 0, 1, 2, 3, 4, 4, 0]);
  assert.deepEqual(r2.state.log.map(e => e.pts), [0, 100, 110, 120, 130, 150, 0, 0]);
  assert.equal(r2.state.log[5].star, true);
  assert.equal(r2.state.starStrikes, 1);
  assert.deepEqual(r2.events.filter(e => e.t === 'encore').map(e => e.on), [true, false]);
  assert.equal(r2.state.posts, 2);
  assert.equal(r2.state.bestStreak, 5);
  /* and over random play: every kick follows the rule, one encore-on per entry to 4 */
  for (let seed = 1; seed <= 60; seed++) {
    const r = withEvents(Pen.newRound(mkApi(), RIVALS[seed % 4], { seed }));
    run(r, randomTapper(lcg(seed * 7), 0.04));
    let h = 0, ons = 0, offs = 0;
    for (const e of r.state.log) {
      assert.equal(e.hypeBefore, h);
      const to = nextHype(h, e.res, e.kind);
      if (to === 4 && h < 4) ons++;
      if (to < 4 && h === 4) offs++;
      h = to;
    }
    assert.equal(r.state.hype, h);
    assert.equal(r.events.filter(e => e.t === 'encore' && e.on).length, ons);
    assert.equal(r.events.filter(e => e.t === 'encore' && !e.on).length, offs);
  }
});

test('penalty: result integrity over 500+ random kicks on all rivals (res and pts are never recomputed)', () => {
  let kicks = 0;
  for (let seed = 1; kicks < 520; seed++) {
    const r = withEvents(Pen.newRound(mkApi({ reduced: seed % 2 === 0 }), RIVALS[seed % 4], { seed: seed * 31 }));
    run(r, randomTapper(lcg(seed), 0.03));
    let h = 0;
    const results = r.events.filter(e => e.t === 'result');
    assert.equal(results.length, r.state.log.length);
    r.state.log.forEach((e, i) => {
      assert.equal(e.res, Pen.outcome(e.x, e.y, e.dive));
      assert.equal(e.kind, e.res === 'miss' ? Pen.missKind(e.x, e.y) : e.res);
      assert.equal(e.top, e.res === 'goal' && Pen.isTopCorner(e.x, e.y));
      assert.equal(e.pts, Pen.shotPoints(e.res, Pen.isTopCorner(e.x, e.y), h));
      const ev = results[i];
      assert.deepEqual([ev.res, ev.kind, ev.pts, ev.x, ev.y, ev.dive], [e.res, e.kind, e.pts, e.x, e.y, e.dive]);
      h = nextHype(h, e.res, e.kind);
      kicks++;
    });
  }
  assert.ok(kicks >= 500);
});

test('penalty: fuzz 300 seeds x 4 rivals — every round ends with 8 kicks and a valid, consistent score', () => {
  for (let seed = 1; seed <= 300; seed++) for (const rv of RIVALS) {
    const r = Pen.newRound(mkApi(), rv, { seed });
    run(r, randomTapper(lcg(seed * 13 + rv.length), 0.025));
    assert.equal(r.done, true, `${rv} seed ${seed} unfinished`);
    assert.equal(r.state.log.length, 8);
    const res = r.result();
    assert.ok(Number.isInteger(res.score) && res.score >= 0 && res.score <= 1200, 'score ' + res.score);
    assert.equal(res.score, r.state.log.reduce((a, e) => a + e.pts, 0));
    assert.equal(res.extra, r.state.log.filter(e => e.res === 'goal').length);
    for (const e of r.state.log) assert.ok(e.pts <= 150);
    assert.ok(C.validResult('penalty', res));
    assert.deepEqual(Object.keys(res).sort(), ['extra', 'score']);
  }
});

test('penalty: a child who never taps still finishes — auto-lock ends every aim phase', () => {
  for (const rv of RIVALS) for (let seed = 1; seed <= 3; seed++) {
    const r = withEvents(Pen.newRound(mkApi(), rv, { seed }));
    const t = run(r, null, 400);
    assert.equal(r.done, true);
    assert.ok(t <= 150, 'round took ' + t.toFixed(1) + ' s');
    assert.equal(r.state.log.length, 8);
    const locks = r.events.filter(e => e.t === 'lockX' || e.t === 'lockY');
    assert.equal(locks.length, 16);
    assert.ok(locks.every(e => e.auto === true));
    assert.equal(r.events.filter(e => e.t === 'nudge').length, 16, 'a nudge before every auto-lock');
    assert.deepEqual(r.events.filter(e => e.t === 'autoLock').map(e => e.axis).join(''), 'xy'.repeat(8));
    /* the nudge comes at 4 s and the lock at 6 s of the same aim phase */
    const first = r.events.findIndex(e => e.t === 'nudge');
    assert.equal(r.events[first + 1].t, 'autoLock');
  }
});

test('penalty: autopilot on every rival x seeds 1-50 scores 7+ goals, Gold or Perfect, in 28-95 s', () => {
  for (const rv of RIVALS) for (let seed = 1; seed <= 50; seed++) {
    const r = Pen.newRound(mkApi(), rv, { seed });
    const t = run(r, autopilot);
    assert.ok(r.state.goals >= 7, `${rv} seed ${seed}: ${r.state.goals} goals`);
    assert.ok(['gold', 'perfect'].includes(Pen.medalFor(r.result().score)));
    assert.ok(t >= 28 && t <= 95, `${rv} seed ${seed}: ${t.toFixed(1)} s`);
    assert.equal(r.state.log.filter(e => e.slow).length >= 1, true);
  }
});

test('penalty: every tell is honest — readTell(tellAt(...)) is the real dive from 0.8 s on', () => {
  for (const rv of RIVALS) for (const dive of DIVES) {
    assert.equal(Pen.readTell(rv, Pen.tellAt(rv, dive, 0, 3.3)), null, 'nothing is given away before aiming starts');
    for (let aimT = 0.8; aimT <= 6.0001; aimT += 0.05) for (let j = 0; j < 32; j++) {
      const clock = 10 + j * (2 * T.BEAT) / 32;
      const tell = Pen.tellAt(rv, dive, aimT, clock);
      assert.equal(Pen.readTell(rv, tell), dive, `${rv} ${dive} aimT ${aimT.toFixed(2)} clock ${clock.toFixed(3)}`);
      if (dive !== 'stay') assert.equal(tell.crouch, 0);
      if (rv !== 'rival_glowy') { assert.equal(tell.gloveL, 0); assert.equal(tell.gloveR, 0); }
      for (const k of ['lean', 'crouch', 'step', 'hop', 'gloveL', 'gloveR']) assert.ok(Math.abs(tell[k]) <= 1);
      assert.equal(tell.mirror, rv === 'rival_flip');
    }
  }
  /* rival flavour: Mochi leans toward his dive, Flip away from it, Glowy never leans, Bop pulses with the beat */
  assert.ok(Pen.tellAt('std', 'right', 2, 0).lean > 0.9);
  assert.ok(Pen.tellAt('rival_flip', 'right', 2, 0).lean < -0.9);
  assert.equal(Pen.tellAt('rival_glowy', 'left', 2, 0).lean, 0);
  assert.equal(Pen.tellAt('rival_glowy', 'left', 2, 0).gloveL, 1);
  const on = Pen.tellAt('rival_bop', 'left', 2, 0.1), off = Pen.tellAt('rival_bop', 'left', 2, T.BEAT + 0.1);
  assert.equal(on.lean, -1); assert.ok(Math.abs(off.lean + 0.3) < 1e-9); assert.equal(on.hop, 1); assert.equal(off.hop, 0);
  assert.ok(Math.abs(on.step + 0.25) < 1e-9);
  /* tellAt reuses an out object when given one */
  const out = {};
  assert.equal(Pen.tellAt('std', 'left', 1, 0, out), out);
});

test('penalty: reading the tell (never s.dive) wins — perfect reader 7+, slow reader 4+ on Mochi', () => {
  const guess = {};
  for (const rv of RIVALS) {
    let goals = 0, g2 = 0;
    for (let seed = 1; seed <= 50; seed++) {
      const r = Pen.newRound(mkApi(), rv, { seed });
      run(r, tellBot(0));
      goals += r.state.goals;
      const q = Pen.newRound(mkApi(), rv, { seed });
      run(q, guesser());
      g2 += q.state.goals;
    }
    guess[rv] = g2 / 50;
    assert.ok(goals / 50 >= 7, `${rv}: tell reader averaged ${(goals / 50).toFixed(2)}`);
    assert.ok(goals / 50 - g2 / 50 >= 1.5, `${rv}: reading the tell must beat guessing (${(goals / 50).toFixed(2)} vs ${(g2 / 50).toFixed(2)})`);
  }
  let slow = 0;
  for (let seed = 1; seed <= 100; seed++) {
    const r = Pen.newRound(mkApi(), 'std', { seed });
    run(r, tellBot(0.25));
    slow += r.state.goals;
  }
  assert.ok(slow / 100 >= 4, 'slow reader on Mochi averaged ' + (slow / 100).toFixed(2));
});

test('penalty: MAP converts logic px to 3D units exactly as the spec lists', () => {
  const near = (a, b, msg) => assert.ok(Math.abs(a - b) <= 0.01, `${msg}: ${a} vs ${b}`);
  const M = Pen.MAP;
  near(M.U, 76.667, 'U');
  const L = M.box(Pen.REACH.left), S = M.box(Pen.REACH.stay), R = M.box(Pen.REACH.right);
  near(L.x0, -2.765, 'left x0'); near(L.x1, -0.522, 'left x1'); near(L.y1, 1.748, 'left y1');
  near(S.x0, -1.148, 'stay x0'); near(S.x1, 1.148, 'stay x1'); near(S.y1, 2.191, 'stay y1');
  near(R.x0, 0.522, 'right x0'); near(R.x1, 2.765, 'right x1'); near(R.y1, 1.748, 'right y1');
  near(M.lx2u(Pen.POST_L), -3, 'left post'); near(M.lx2u(Pen.POST_R), 3, 'right post'); near(M.POST_U, 3, 'POST_U');
  near(M.ly2u(Pen.BAR), 2.478, 'bar'); near(M.BAR_U, 2.478, 'BAR_U');
  near(M.MISS_U.x, 2.922, 'miss x'); near(M.MISS_U.y, 2.4, 'miss y');
  near(M.AIM_U.x0, -3.365, 'aim x0'); near(M.AIM_U.x1, 3.365, 'aim x1'); near(M.AIM_U.y0, 0.104, 'aim y0'); near(M.AIM_U.y1, 2.791, 'aim y1');
  near(M.CORNER_U.xIn, 1.148, 'corner in'); near(M.CORNER_U.xOut, 2.922, 'corner out'); near(M.CORNER_U.y0, 1.748, 'corner y0'); near(M.CORNER_U.y1, 2.4, 'corner y1');
  /* corner zones never overlap any reach box (interiors are disjoint) */
  const boxes = Object.values(M.REACH_U).map(b => ({ x0: b.x0, x1: b.x1, y0: 0, y1: b.y1 }));
  for (const z of [M.CORNER_U.left, M.CORNER_U.right]) for (const b of boxes) {
    const overlap = Math.min(z.x1, b.x1) - Math.max(z.x0, b.x0) > 1e-9 && Math.min(z.y1, b.y1) - Math.max(z.y0, b.y0) > 1e-9;
    assert.equal(overlap, false);
  }
  /* and it agrees with the logic: corner-zone centres are top corners, reach-box centres are not */
  for (const z of [M.CORNER_U.left, M.CORNER_U.right]) assert.ok(Pen.isTopCorner(Pen.MID + (z.x0 + z.x1) / 2 * M.U, Pen.LINE - (z.y0 + z.y1) / 2 * M.U));
  assert.deepEqual(M.POS.keeper, [0, 0, 0.35]);
  assert.deepEqual(M.POS.ball, [0, 0.11, 7.5]);
  const b0 = M.ballAt(0, 640, 190), b1 = M.ballAt(1, 640, 190);
  near(b0.x, 0, 'ball start x'); near(b0.y, 0.11, 'ball start y'); near(b0.z, 7.5, 'ball start z');
  near(b1.x, M.lx2u(640), 'ball end x'); near(b1.y, M.ly2u(190), 'ball end y'); near(b1.z, 0, 'ball end z');
  assert.ok(Object.isFrozen(M) && Object.isFrozen(Pen.TIMING) && Object.isFrozen(Pen.RIVALS[0]));
});

test('penalty: frame-rate independent (30/60/144 fps give identical logs) and reduced motion changes nothing', () => {
  globalThis.window = { SLGameFX: FX };
  try {
    function play(fps, reduced, render) {
      const r = Pen.newRound(mkApi({ reduced }), 'rival_bop', { seed: 77 });
      const rng = lcg(99), taps = new Set();
      for (let k = 0, at = 0; k < 400; k++) { at += 20 + Math.floor(rng() * 80); taps.add(at); }
      const ctx = render ? mockCtx() : null;
      let acc = 0, n = 0, frames = 0;
      while (!r.done && frames < 300 * fps) {
        acc += 1 / fps; frames++;
        while (acc >= STEP && !r.done) { if (taps.has(n)) r.input('kick', true); r.step(STEP); n++; acc -= STEP; }
        if (ctx) r.render(ctx);
      }
      return JSON.stringify({ log: r.state.log, score: r.state.score, n });
    }
    const base = play(60, true, false);
    assert.equal(play(30, true, true), base);
    assert.equal(play(144, true, true), base);
    assert.equal(play(60, false, true), base, 'reduced motion never changes the game');
  } finally { delete globalThis.window; }
});

test('penalty: slow-mo only on saves, pings, the final kick and the first 2 top corners; replays only on the first top corner and a final-kick goal', () => {
  const rounds = [];
  for (let seed = 1; seed <= 40; seed++) {
    const r = withEvents(Pen.newRound(mkApi(), RIVALS[seed % 4], { seed }));
    /* measure how long each result card really lasts */
    const resLen = [];
    let inRes = false, startClock = 0;
    run(r, rr => {
      if (seed % 2) rr.autopilot(); else randomTapper(lcg(seed), 0.03)(rr);
      const s = rr.state;
      if (s.phase === 'result' && !inRes) { inRes = true; startClock = s.clock; }
      if (s.phase !== 'result' && inRes) { inRes = false; resLen.push(s.clock - startClock); }
    });
    rounds.push({ r, resLen, autop: seed % 2 === 1 });
  }
  let slowCount = 0;
  for (const { r, resLen, autop } of rounds) {
    let corners = 0;
    r.state.log.forEach((e, i) => {
      const final = i === 7, topGoal = e.res === 'goal' && e.top;
      const want = e.res === 'save' || e.kind === 'post' || e.kind === 'bar' || final || (topGoal && corners < 2);
      assert.equal(e.slow, want, `kick ${i + 1} slow`);
      assert.equal(e.replay, e.res === 'goal' && ((topGoal && corners === 0) || final), `kick ${i + 1} replay`);
      if (topGoal) corners++;
      if (e.slow) slowCount++;
    });
    const strikes = r.events.filter(e => e.t === 'strike');
    assert.deepEqual(strikes.map(e => [e.slow, e.replay]), r.state.log.map(e => [e.slow, e.replay]));
    if (autop) {
      /* the autopilot never skips, so every card lasts exactly its length */
      resLen.forEach((len, i) => assert.ok(Math.abs(len - (r.state.log[i].replay ? T.RESULT_REPLAY : T.RESULT)) < 0.02, `card ${i + 1}: ${len}`));
      assert.equal(r.state.log.filter(e => e.replay).length, 2, 'first top corner + final kick');
      /* slow-mo adds ~0.405 s to a close kick's flight */
      const slowOn = r.events.filter(e => e.t === 'slow' && e.on).length;
      assert.equal(slowOn, r.state.log.filter(e => e.slow).length);
    }
  }
  assert.ok(slowCount > 50);
  /* a flight timing check: close shots last FLIGHT + ~0.405 s */
  const r = Pen.newRound(mkApi(), 'std', { seed: 5 });
  let fl = 0;
  run(r, rr => { rr.autopilot(); if (rr.state.phase === 'flight' && rr.state.shot === 0) fl += STEP; });
  assert.ok(Math.abs(fl - (T.FLIGHT + 0.405)) < 0.03, 'close flight lasted ' + fl.toFixed(3));
});

test('penalty: guards and skips — early taps are ignored, intro/result skip only after their delay', () => {
  const r = Pen.newRound(mkApi(), 'std', { seed: 4 });
  const s = r.state;
  /* intro: not skippable before 0.6 s */
  while (s.phaseT < T.INTRO_SKIP - 0.05) r.step(STEP);
  r.input('kick', true);
  assert.equal(s.phase, 'ready');
  while (s.phaseT < T.INTRO_SKIP) r.step(STEP);
  r.input('kick', true);
  assert.equal(s.phase, 'aimX', 'intro skipped');
  /* aim X: guard */
  r.input('kick', true);
  assert.equal(s.phase, 'aimX'); assert.equal(s.lockX, null);
  while (s.phaseT < T.GUARD) r.step(STEP);
  r.input('kick', true);
  assert.equal(s.phase, 'aimY'); assert.equal(s.lockX, Math.round(s.lockX));
  /* aim Y: guard */
  r.input('kick', true);
  assert.equal(s.phase, 'aimY'); assert.equal(s.lockY, null);
  while (s.phaseT < T.GUARD) r.step(STEP);
  r.input('kick', true);
  assert.equal(s.phase, 'windup');
  /* windup, strike and flight ignore taps completely */
  for (const ph of ['windup', 'strike', 'flight']) {
    while (s.phase !== ph) r.step(STEP);
    r.step(STEP);
    const before = JSON.stringify(s);
    r.input('kick', true); r.input('kick', false); r.input('jump', true);
    assert.equal(JSON.stringify(s), before, ph + ' ignores taps');
  }
  /* result: not skippable before 0.8 s */
  while (s.phase !== 'result') r.step(STEP);
  while (s.resT < T.SKIP_AFTER - 0.05) r.step(STEP);
  r.input('kick', true);
  assert.equal(s.phase, 'result'); assert.equal(s.shot, 0);
  while (s.resT < T.SKIP_AFTER) r.step(STEP);
  r.input('kick', true);
  assert.equal(s.phase, 'ready'); assert.equal(s.shot, 1);
  /* kick 2's ready card can't be skipped at all */
  for (let i = 0; i < 90; i++) {
    r.step(STEP);
    if (s.phase !== 'ready') break;
    const before = JSON.stringify(s);
    r.input('kick', true);
    assert.equal(JSON.stringify(s), before, 'ready ignores taps');
  }
  assert.equal(s.intro, false);
});

test('penalty: Cheer Boost turns on after exactly 2 non-goals, slows the rails to 0.8x and ends on the next goal', () => {
  const r = withEvents(Pen.newRound(mkApi(), 'rival_glowy', { seed: 21 }));
  const seen = [];
  run(r, rr => {
    scripted(['save', 'wide', 'goal', 'post', 'goal', 'save', 'over', 'save'])(rr);
    const s = rr.state;
    if (s.phase === 'aimX' && seen.length === s.shot) seen.push({ shot: s.shot, boost: s.boost, help: s.help, speed: s.speed, hype: s.hype });
  });
  assert.deepEqual(r.state.log.map(kindOf), ['save', 'wide', 'goal', 'post', 'goal', 'save', 'over', 'save']);
  assert.deepEqual(seen.map(x => x.boost), [false, false, true, false, false, false, false, true]);
  /* help zone: kicks 1-2 while this rival's best < 400, and on every boosted kick */
  assert.deepEqual(seen.map(x => x.help), [true, true, true, false, false, false, false, true]);
  for (const x of seen) {
    assert.equal(x.speed, Pen.sweepSpeed(2, x.shot, x.hype, x.boost));
    if (x.boost) assert.equal(x.speed, Pen.sweepSpeed(2, x.shot, x.hype, false) * 0.8);
  }
  assert.equal(r.events.filter(e => e.t === 'boost').length, 2);
  assert.equal(r.state.boostsUsed, 2);
  assert.equal(r.state.boost, true, 'still boosted after the last two non-goals');
  /* a rival best of 400+ turns the beginner help off */
  const pro = Pen.newRound(mkApi(), 'rival_glowy', { seed: 21, pb: { 'penalty:rival_glowy': { score: 400 } } });
  assert.equal(pro.state.help, false);
  /* sweepSpeed: base + 0.05/kick + 0.03/hype, capped at 1.15 */
  assert.ok(Math.abs(Pen.sweepSpeed(0, 0, 0, false) - 0.55) < 1e-12);
  assert.ok(Math.abs(Pen.sweepSpeed(3, 7, 4, false) - 1.15) < 1e-12);
  assert.ok(Math.abs(Pen.sweepSpeed(3, 7, 4, true) - 0.92) < 1e-12);
  assert.deepEqual(Pen.RIVALS.map(x => x.base), [0.55, 0.60, 0.65, 0.70]);
});

test('penalty: event queue — increasing n, at most 32 kept, one kick + one result per kick, one finale', () => {
  const r = withEvents(Pen.newRound(mkApi(), 'std', { seed: 8 }));
  let lastN = 0, maxLen = 0;
  run(r, rr => {
    rr.autopilot();
    maxLen = Math.max(maxLen, rr.state.ev.length);
    for (const e of rr.events) { assert.ok(e.n > lastN, 'n strictly increases'); lastN = e.n; assert.equal(e.type, e.t); }
    rr.events.length = 0;                                     /* the shell empties it after each draw */
  });
  for (const e of r.events) { assert.ok(e.n > lastN); lastN = e.n; }
  assert.ok(maxLen <= 32);
  assert.equal(r.state.ev.length, 32);
  for (let i = 1; i < r.state.ev.length; i++) assert.ok(r.state.ev[i].n > r.state.ev[i - 1].n);
  /* a fresh round with a full log of every event */
  const q = withEvents(Pen.newRound(mkApi(), 'rival_flip', { seed: 8 }));
  run(q, autopilot);
  const count = t => q.events.filter(e => e.t === t).length;
  assert.equal(count('kick'), 8); assert.equal(count('result'), 8); assert.equal(count('strike'), 8);
  assert.equal(count('aim'), 8); assert.equal(count('lockX'), 8); assert.equal(count('lockY'), 8);
  assert.deepEqual(q.events.filter(e => e.t === 'kick').map(e => [e.shot, e.final, e.rival]), [0, 1, 2, 3, 4, 5, 6, 7].map(i => [i, i === 7, 'rival_flip']));
  q.onFinish(); q.onFinish();
  const fin = q.events.filter(e => e.t === 'finale');
  assert.equal(fin.length, 1);
  assert.equal(fin[0].encoreDance, q.state.goals >= 5);
  assert.equal(fin[0].medal, Pen.medalFor(q.state.score));
  /* a weak round: no encore dance */
  const w = withEvents(Pen.newRound(mkApi(), 'std', { seed: 3 }));
  run(w, scripted(['save', 'save', 'goal', 'save', 'goal', 'wide', 'goal', 'save']));
  w.onFinish();
  assert.equal(w.events.filter(e => e.t === 'finale')[0].encoreDance, false);
  assert.equal(w.stats().encoreDance, false);
  /* without wantEvents (Node tests, demos) nothing accumulates at all */
  const quiet = Pen.newRound(mkApi(), 'std', { seed: 8 });
  run(quiet, autopilot);
  quiet.onFinish();
  assert.equal(quiet.state.ev.length, 0); assert.equal(quiet.state.evN, 0); assert.equal(quiet.events.length, 0);
});

test('penalty: medalFor and rivalUnlocked truth tables (old std bests carry over)', () => {
  const m = [[0, null], [399, null], [400, 'bronze'], [699, 'bronze'], [700, 'silver'], [949, 'silver'], [950, 'gold'], [1199, 'gold'], [1200, 'perfect']];
  for (const [sc, want] of m) assert.equal(Pen.medalFor(sc), want, String(sc));
  const U = Pen.rivalUnlocked;
  assert.equal(U({}, 'std'), true);
  assert.equal(U(null, 'std'), true);
  assert.equal(U(undefined, 'rival_bop'), false);
  assert.equal(U({}, 'rival_bop'), false);
  assert.equal(U({ 'penalty:std': { score: 400 } }, 'rival_bop'), true, 'old std PB unlocks Bop at once');
  assert.equal(U({ 'penalty:std': { score: 399 } }, 'rival_bop'), false);
  assert.equal(U({ 'penalty:std': { score: 1200 } }, 'rival_glowy'), false);
  assert.equal(U({ 'penalty:rival_bop': { score: 400 } }, 'rival_glowy'), true);
  assert.equal(U({ 'penalty:rival_glowy': { score: 699 } }, 'rival_flip'), false, 'Flip needs Silver on Glowy');
  assert.equal(U({ 'penalty:rival_glowy': { score: 700 } }, 'rival_flip'), true);
  assert.equal(U({ 'penalty:rival_bop': { score: 1200 }, 'penalty:std': { score: 1200 } }, 'rival_flip'), false);
  assert.equal(U({ 'penalty:std': { score: 900 } }, 'rival_nope'), false);
  assert.equal(U({ 'penalty:std': { score: '450' } }, 'rival_bop'), true);
});

test('penalty: def wiring — shell hooks, rival menu, PB text and copy', () => {
  const def = Pen.def;
  assert.equal(def.key, 'penalty');
  assert.equal(def.title, 'Penalty Shootout');
  assert.deepEqual(def.view3d, { src: 'world/games/penalty-3d.js' });
  assert.equal(def.menuVariantsTitle, 'Choose your rival');
  assert.equal(def.menuVariantsLabel, 'rival');
  assert.equal(def.resultsGlass, true);
  assert.deepEqual(def.music, { track: 'penalty' });
  assert.equal(def.countdown, 0);
  assert.equal(def.tapAction, 'kick');
  assert.deepEqual(def.controls, [{ id: 'kick', label: '⚽ KICK', side: 'right', wide: true }]);
  assert.deepEqual(def.keys, { ' ': 'kick', 'Enter': 'kick', 'ArrowUp': 'kick' });
  assert.equal(def.tutorial.length, 4);
  /* rival photocards */
  const mv = def.menuVariants({ pb: { 'penalty:std': { score: 870 }, 'penalty:rival_bop': { score: 120 } } });
  assert.deepEqual(mv.map(v => v.id), ['std', 'rival_bop', 'rival_glowy', 'rival_flip']);
  assert.deepEqual(mv.map(v => v.name), ['Mochi', 'Bop', 'Glowy', 'Flip']);
  assert.deepEqual(mv.map(v => v.locked), [false, false, true, true]);
  assert.deepEqual(mv.map(v => v.medal), ['🥈', '', '', '']);
  assert.deepEqual(mv.map(v => v.best), [870, 120, null, null]);
  assert.match(mv[2].lockText, /Bronze vs Bop/);
  assert.match(mv[3].lockText, /Silver vs Glowy/);
  assert.equal(mv[0].lockText, '');
  for (const v of mv) for (const k of ['id', 'name', 'icon', 'tip', 'locked', 'lockText', 'medal', 'best']) assert.ok(k in v, k);
  assert.equal(def.menuVariants({}).filter(v => !v.locked).length, 1);
  /* best line names the rival */
  assert.equal(def.pbText({ score: 870 }, 'std'), '🏆 Best vs Mochi: score 870 · 🥈 Silver');
  assert.equal(def.pbText({ score: 1200 }, 'rival_flip'), '🏆 Best vs Flip: score 1,200 · 🌟 Perfect');
  assert.equal(def.pbText({ score: 90 }, 'rival_bop'), '🏆 Best vs Bop: score 90');
  /* the round's HUD and summary copy */
  const r = Pen.newRound(mkApi(), 'std', { seed: 2, pb: { 'penalty:std': { score: 300 } } });
  assert.equal(r.hud(), '⚽ 0/0 · ✦ Hype 0 · 0 · kick 1 of 8');
  assert.equal(r.padState('kick'), 'grey');
  run(r, rr => { rr.autopilot(); if (rr.state.shot === 5 && rr.state.phase === 'ready') assert.equal(rr.hud(), '⚽ 5/5 · ✦ ENCORE! · 750 · kick 6 of 8'); if (rr.state.phase === 'aimX') assert.equal(rr.padState('kick'), 's1'); if (rr.state.phase === 'aimY') assert.equal(rr.padState('kick'), 's2'); });
  assert.match(r.hud(), /FINAL KICK$/);
  assert.equal(r.summaryTitle(), 'PERFECT SHOW! 🎤');
  assert.equal(r.summaryBig(), '8 / 8 goals · 1,200');
  assert.match(r.summaryText(), /^Best hype streak 8 · 8 top corners · 4 star strikes\. Bop is unlocked: try him next!$/);
  assert.deepEqual(r.summaryBadges().map(b => b.kind), ['crown', 'ribbon', 'ribbon']);
  assert.deepEqual(r.stats(), { goals: 8, corners: 8, starStrikes: 4, posts: 0, bestStreak: 8, boostsUsed: 0, medal: 'perfect', encoreDance: true });
  /* nearest-target lines, in priority order */
  const few = Pen.newRound(mkApi(), 'std', { seed: 3, pb: { 'penalty:std': { score: 500 } } });
  run(few, scripted(['save', 'goal', 'save', 'goal', 'save', 'wide', 'goal', 'save']));
  assert.equal(few.state.score, 300);
  assert.match(few.summaryText(), /Score 5 goals to earn the ENCORE dance!$/);
  assert.equal(few.summaryTitle(), 'Good practice! Watch the tell!');
  const near = Pen.newRound(mkApi(), 'rival_bop', { seed: 6, pb: { 'penalty:std': { score: 400 }, 'penalty:rival_bop': { score: 640 } } });
  run(near, scripted(['goal', 'goal', 'save', 'goal', 'goal', 'goal', 'save', 'goal']));
  assert.equal(near.state.goals, 6);
  assert.equal(near.state.score, 100 + 110 + 100 + 110 + 120 + 100);
  assert.match(near.summaryText(), /Only 60 more for Silver!$/, 'gap from the rival best (640) to Silver');
  const gold = Pen.newRound(mkApi(), 'std', { seed: 6, pb: { 'penalty:std': { score: 1000 }, 'penalty:rival_bop': { score: 400 } } });
  run(gold, scripted(['goal', 'goal', 'goal', 'goal', 'goal', 'goal', 'save', 'save']));
  assert.match(gold.summaryText(), /Gold! Can you get a Perfect Show \(1,200\)\?$/);
  assert.equal(gold.summaryTitle(), '🥈 SILVER: Brilliant shooting!');
  /* an unknown variant falls back to Mochi */
  assert.equal(Pen.newRound(mkApi(), 'nope', { seed: 1 }).state.rival, 'std');
});

test('penalty: logic-owned sounds and guarded music calls', () => {
  const sounds = [], music = [];
  const mus = {};
  for (const m of ['play', 'layers', 'set', 'lowpass', 'drop', 'sync']) mus[m] = (...a) => music.push([m, ...a]);
  const r = Pen.newRound({ sound: (n, v, st) => sounds.push([n, v, st]), reduced: false, music: mus }, 'std', { seed: 5 });
  run(r, scripted(['goal', 'save', 'post', 'wide', 'goal', 'goal', 'goal', 'top']));
  const names = sounds.map(x => x[0]);
  assert.equal(names.filter(n => n === 'whistle').length, 1, 'whistle on the first aim only');
  assert.equal(names.filter(n => n === 'tick').length, 8);
  assert.equal(names.filter(n => n === 'kick').length, 8);
  assert.equal(names.filter(n => n === 'save').length, 1);
  assert.equal(names.includes('wrong'), false, 'no buzzer for a save');
  assert.equal(names.filter(n => n === 'boing').length, 1);
  assert.equal(names.filter(n => n === 'whoosh').length, 1);
  assert.equal(names.filter(n => n === 'miss').length, 2);
  assert.equal(names.filter(n => n === 'heartbeat').length, 1);
  assert.equal(names.filter(n => n === 'correct').length, 5);
  assert.deepEqual(sounds.filter(x => x[0] === 'combo').map(x => x[2]), [1, 1, 2, 3, 4]);
  assert.ok(names.includes('applause') && names.includes('powerup'));
  assert.ok(names.includes('sting'), 'Encore Mode on');
  assert.deepEqual(music.filter(x => x[0] === 'lowpass'), [['lowpass', 800, 0.3], ['lowpass', 18000, 0.5]]);
  assert.equal(music.filter(x => x[0] === 'drop').length, 1);
  assert.deepEqual(music.filter(x => x[0] === 'layers').map(x => x[1]), [1, 0, 1, 2, 3, 4]);
  assert.deepEqual(music.filter(x => x[0] === 'set' && x[1] === 'hype').map(x => x[2]), [0.25, 0, 0.25, 0.5, 0.75, 1]);
  assert.deepEqual(music[0], ['sync', 0]);
  r.pauseReset(); r.step(STEP);
  assert.equal(music.filter(x => x[0] === 'sync').length, 0 + 1 + (r.done ? 0 : 1));
  r.onFinish();
  assert.deepEqual(music[music.length - 1], ['play', 'island_showtime']);
  /* a music channel without the spec's extras gets CONTRACTS-style set() calls instead; a throwing one is harmless */
  const calls = [];
  const r2 = Pen.newRound({ sound() { throw new Error('x'); }, music: { set: (...a) => calls.push(a), sync() { throw new Error('y'); } } }, 'std', { seed: 5 });
  run(r2, scripted(['goal', 'goal', 'goal', 'goal', 'goal', 'goal', 'goal', 'goal']));
  assert.ok(calls.some(a => a[0] === 'lowpass' && a[1] === 800));
  assert.ok(calls.some(a => a[0] === 'fever' && a[1] === true));
  assert.equal(r2.done, true);
});

test('penalty: 2D fallback renders every rival x stadium x ball without throwing or a white full-screen flash', () => {
  globalThis.window = { SLGameFX: FX };
  try {
    let renders = 0;
    for (const rv of RIVALS) for (let si = 0; si < STADIA.length; si++) for (let bi = 0; bi < BALLS.length; bi++) {
      const cfg = { seed: 100 + si * 4 + bi, stadium: STADIA[si], ball: BALLS[bi], pb: {}, user: { color: ['#FF5FA2', '#3DF2FF', 'bogus', '#abc'][bi] } };
      const reduced = (si + bi) % 2 === 0;
      for (const mode of ['autopilot', 'random']) {
        const r = withEvents(Pen.newRound(mkApi({ reduced }), rv, cfg));
        const ctx = mockCtx(), tap = randomTapper(lcg(si * 17 + bi), 0.03);
        let since = 1;
        while (!r.done) {
          if (mode === 'autopilot') r.autopilot(); else tap(r);
          r.step(STEP); since += STEP;
          if (since >= 1 / 30) {
            since = 0;
            const before = r.state.score + ':' + r.state.phase + ':' + r.state.evN + ':' + r.state.log.length;
            r.render(ctx); renders++;
            assert.equal(r.state.score + ':' + r.state.phase + ':' + r.state.evN + ':' + r.state.log.length, before, 'render never changes the logic');
            r.events.length = 0;
          }
        }
        r.render(ctx);
        assert.deepEqual(ctx._bad, [], `${rv} ${STADIA[si]} ${BALLS[bi]} ${mode}: white full-canvas fill`);
      }
      const ictx = mockCtx();
      Pen.def.idle(ictx, cfg);
      assert.deepEqual(ictx._bad, []);
    }
    assert.ok(renders > 50000);
  } finally { delete globalThis.window; }
  /* and without fx.js loaded at all (it is optional) */
  const r = Pen.newRound(mkApi(), 'rival_flip', { seed: 1 });
  run(r, rr => { rr.autopilot(); if (rr.state.clock % 0.25 < STEP) rr.render(mockCtx()); });
  assert.equal(r.done, true);
});

test('penalty: copy safety — banners and summaries never say fail / lose / bad / wrong', () => {
  for (const res of ['goal', 'save', 'miss']) for (const kind of ['goal', 'save', 'post', 'bar', 'wide', 'over', undefined])
    for (const top of [false, true]) for (const star of [false, true]) for (const dive of DIVES) for (const hb of [0, 2, 4]) {
      const l = Pen.resultLabel({ res, kind, top, star, dive, pts: Pen.shotPoints(res, top, hb), hypeBefore: hb, x: 247, y: 250 });
      for (const k of ['title', 'sub', 'say']) { assert.equal(typeof l[k], 'string'); assert.ok(l[k].length > 0); assert.doesNotMatch(l[k], BANNED, l[k]); }
    }
  assert.deepEqual(Pen.resultLabel({ res: 'save', kind: 'save', dive: 'left' }).sub, 'He dived LEFT!');
  assert.deepEqual(Pen.resultLabel({ res: 'miss', kind: 'post', hypeBefore: 2 }).sub, 'Off the post! · Hype −1');
  assert.deepEqual(Pen.resultLabel({ res: 'goal', kind: 'goal', star: true, pts: 150 }).title, 'STAR STRIKE!');
  for (let seed = 1; seed <= 40; seed++) {
    const r = Pen.newRound(mkApi(), RIVALS[seed % 4], { seed, pb: seed % 3 ? {} : { 'penalty:std': { score: 300 } } });
    run(r, randomTapper(lcg(seed), 0.02 + (seed % 5) * 0.01));
    const texts = [r.summaryTitle(), r.summaryBig(), r.summaryText(), r.hud()].concat(r.summaryBadges().map(b => b.text));
    for (const t of texts) assert.doesNotMatch(t, BANNED, t);
  }
  for (const tut of Pen.def.tutorial) assert.doesNotMatch(tut[1], BANNED);
});

test('penalty: static purity — no 3D library in the logic file; the 3D view never writes round state', () => {
  const src = fs.readFileSync(path.join(__dirname, '../world/games/penalty.js'), 'utf8');
  assert.doesNotMatch(src, /\bTHREE\b/);
  assert.doesNotMatch(src, /from\s+['"]three|import\s*\(\s*['"]three|require\(\s*['"]three/);
  assert.doesNotMatch(src, /\bdocument\.(createElement|body|querySelector)/, 'no DOM building in the logic');
  const view = path.join(__dirname, '../world/games/penalty-3d.js');
  if (!fs.existsSync(view)) return;                       /* the 3D view lands later (wave C) */
  const vsrc = fs.readFileSync(view, 'utf8');
  assert.doesNotMatch(vsrc, /\bs(tate)?\.[a-zA-Z_]+\s*(=|\+=|-=|\+\+|--)(?!=)/, 'penalty-3d.js assigns to round state');
});

test('penalty: world-core is untouched — GAME_RULES.penalty and rival PB keys', () => {
  assert.deepEqual(C.GAME_RULES.penalty, { better: 'higher', shots: 8, maxScore: 1200 });
  const u = { name: 'Mia', points: 500, pointsEarned: 900 };
  C.ensureWorld(u);
  const res = C.recordResult(u, 'penalty', 'rival_bop', { score: 870 });
  assert.equal(res.ok, true);
  assert.equal(res.key, 'penalty:rival_bop');
  assert.equal(u.world.pb['penalty:rival_bop'].score, 870);
  assert.equal(u.points, 500); assert.equal(u.pointsEarned, 900);
  assert.equal(Pen.rivalUnlocked(u.world.pb, 'rival_glowy'), true, 'a recorded Bop best unlocks Glowy');
});
