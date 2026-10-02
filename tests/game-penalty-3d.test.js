'use strict';
/* Encore Shootout 3D — the pure director (world/games/penalty-3d-core.js) and static
   checks on the ES-module view (penalty-3d.js + its helpers, which need a browser and
   three, so they are only syntax/lint-checked here).
   Spec: docs/island3d/spec-penalty.json → threeDScene / juiceAndAudio; CONTRACTS.md §2 §6. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../world/games/penalty-3d-core.js');
const Pen = require('../world/games/penalty.js');

const DEG = Math.PI / 180;
const STEP = 1 / 120;
const DIVES = ['left', 'stay', 'right'];
const RIVALS = Pen.RIVALS.map(r => r.id);
const BANNED = /\b(fail\w*|lose|loser|losing|lost|bad|wrong)\b/i;
const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= (eps || 1e-9), (msg || '') + ' expected ' + b + ' got ' + a);
const finite = (o, msg) => { for (const k of Object.keys(o)) if (typeof o[k] === 'number') assert.ok(Number.isFinite(o[k]), (msg || '') + ' ' + k + ' = ' + o[k]); };
function lcg(seed) { let x = (seed >>> 0) || 1; return () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296; }; }
function kinput(o) {
  return Object.assign({ lp: 'aimX', tellType: 'lean', tell: null, dive: 'stay', clock: 0, phaseT: 0, keeperT: 0, resT: 0, res: null,
    ex: NaN, ey: NaN, flight: 0, worried: false, reduced: false, bop: false, intro: false, shot: 0, hasPrev: false }, o);
}
/* the view's per-step snapshot of a round, built exactly as penalty-3d.js builds it */
function snapshot(st, extra) {
  const lp = st.phase, pend = st.pending;
  const res = lp === 'result' ? st.result : pend ? pend.res : null, kind = lp === 'result' ? st.kind : pend ? pend.kind : null;
  const ex = st.lockX != null ? Pen.MAP.lx2u(st.lockX) : 0, ey = st.lockY != null ? Pen.MAP.ly2u(st.lockY) : 0;
  const prev = st.shot > 0 ? st.log[st.log.length - 1] : null;
  return Object.assign({ lp, res, kind, ex, ey, prev, top: !!(pend && pend.top) }, extra || {});
}

/* ---------------- module shape + parity with the logic ---------------- */
test('penalty3d core: loads in Node (no DOM, no THREE) and exposes the director', () => {
  ['cameraShot', 'portraitFov', 'keeperPose', 'diveEnd', 'keeperDance', 'ballPose', 'flightAt', 'netBulge', 'crowdLayout', 'crowdWave',
    'presetMix', 'tween', 'tweenTo', 'tweenStep', 'coneAim', 'petStage', 'avatarClip', 'ledPips', 'ledText', 'menuTell', 'bannerFor', 'promptFor']
    .forEach(fn => assert.equal(typeof C[fn], 'function', fn));
  const code = fs.readFileSync(path.join(__dirname, '../world/games/penalty-3d-core.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(code, /\bTHREE\b|\bdocument\b|\bwindow\b|require\(\s*['"]three/);
});

test('penalty3d core: timings and geometry match penalty.js (TIMING, MAP)', () => {
  assert.deepEqual(C.T, Object.assign({}, Pen.TIMING));
  for (const d of DIVES) for (const k of ['x0', 'x1', 'y1']) near(C.REACH_U[d][k], Pen.MAP.REACH_U[d][k], 1e-12, d + '.' + k);
  near(C.GEO.POST, Pen.MAP.POST_U, 1e-12, 'post'); near(C.GEO.BAR, Pen.MAP.BAR_U, 1e-12, 'bar');
  near(C.U, Pen.MAP.U, 1e-12, 'U');
  assert.deepEqual(C.GEO.SPOT, Pen.MAP.POS.ball); assert.deepEqual(C.GEO.KICKER, Pen.MAP.POS.kicker);
  assert.deepEqual(C.GEO.RUNUP, Pen.MAP.POS.runup); assert.deepEqual(C.GEO.AVATAR, Pen.MAP.POS.avatar);
  near(C.GEO.KEEPER_Z, Pen.MAP.POS.keeper[2], 1e-12, 'keeper z');
  for (let x = 222; x <= 738; x += 3) near(C.lx2u(x), Pen.MAP.lx2u(x), 1e-12);
  for (let y = 126; y <= 332; y += 3) near(C.ly2u(y), Pen.MAP.ly2u(y), 1e-12);
});

test('penalty3d core: the marker interpolation reproduces the logic sweep exactly', () => {
  const r = Pen.newRound({ sound() {}, reduced: true }, 'std', { seed: 4 }), st = r.state;
  let checked = 0, t = 0;
  while (!r.done && t < 90) {
    if (st.phase === 'aimX') { near(C.markerX(st.sweepX), st.ax, 1e-9, 'ax'); checked++; }
    if (st.phase === 'aimY') { near(C.markerY(st.sweepY), st.ay, 1e-9, 'ay'); checked++; }
    r.autopilot(); r.step(STEP); t += STEP;
  }
  assert.ok(checked > 200, 'sampled ' + checked + ' aim steps');
});

/* ---------------- camera ---------------- */
test('penalty3d camera: portrait FOV keeps both posts (±3.7 u) in frame; 26° at 16:9', () => {
  near(C.portraitFov(16 / 9), 26, 1e-9);
  for (let a = 0.35; a <= 2.6; a += 0.05) {
    const f = C.portraitFov(a);
    assert.ok(f >= 26 - 1e-9);
    const halfW = Math.tan(f / 2 * DEG) * a * 16;
    assert.ok(halfW >= 3.7 - 1e-6, 'aspect ' + a.toFixed(2) + ' half-width ' + halfW);
  }
});

test('penalty3d camera: still kicker cam while aiming; flight follows 40% and dollies 16 → 14.5; ready eases back in 0.6 s', () => {
  const base = { mode: 'play', aspect: 16 / 9, reduced: false, shot: 2, intro: false, close: false, replay: false, ex: 2.2, ey: 2.1, res: 'goal' };
  for (const lp of ['aimX', 'aimY', 'windup', 'strike']) {
    const s = C.cameraShot(Object.assign({}, base, { lp, phaseT: 0.3 }), {});
    assert.deepEqual([s.px, s.py, s.pz, s.lx, s.ly, s.lz, s.fov, s.key], [0, 2.6, 16, 0, 1, 0, 26, 'play'], lp);
  }
  for (let f = 0; f <= 1.0001; f += 0.1) {
    const s = C.cameraShot(Object.assign({}, base, { lp: 'flight', flight: f }), {});
    near(s.px, 0.4 * C.ballX(f, 2.2), 1e-12, 'follow x'); near(s.lx, s.px, 1e-12, 'pan, no roll');
    near(s.pz, 16 - 1.5 * C.inOutSine(f), 1e-12, 'dolly');
  }
  const hold = C.cameraShot(Object.assign({}, base, { lp: 'result', resT: 1.0 }), {});
  near(hold.px, 0.4 * 2.2, 1e-12); near(hold.pz, 14.5, 1e-12);
  const r0 = C.cameraShot(Object.assign({}, base, { lp: 'ready', phaseT: 0, prevEx: 2.2 }), {});
  near(r0.px, hold.px, 1e-12, 'ready starts where RESULT held'); near(r0.pz, 14.5, 1e-12);
  const r1 = C.cameraShot(Object.assign({}, base, { lp: 'ready', phaseT: 0.6, prevEx: 2.2 }), {});
  near(r1.px, 0, 1e-12); near(r1.pz, 16, 1e-12);
});

test('penalty3d camera: intro orbit, slow-mo push-in, goal punch, replay window, results crane, reduced = cuts only', () => {
  const v = { mode: 'play', aspect: 16 / 9, lp: 'ready', intro: true, shot: 0, phaseT: 0 };
  const i0 = C.cameraShot(v, {});
  assert.deepEqual([i0.px, i0.py, i0.pz, i0.lx, i0.ly, i0.lz, i0.key], [1.4, 1.3, 3.4, 0, 1.0, 0.35, 'intro']);
  const i1 = C.cameraShot(Object.assign({}, v, { phaseT: 2.0 }), {});
  near(i1.px, 0, 1e-9); near(i1.pz, 16, 1e-9); near(i1.fov, 26, 1e-9);
  const close = { mode: 'play', aspect: 16 / 9, lp: 'flight', close: true, ex: 1, ey: 1, res: 'save' };
  near(C.cameraShot(Object.assign({}, close, { flight: 0.75 }), {}).fov, 21, 1e-9, 'slow push-in');
  near(C.cameraShot(Object.assign({}, close, { flight: 0.3 }), {}).fov, 26, 1e-9, 'before the slow window');
  near(C.cameraShot(Object.assign({}, close, { lp: 'result', resT: 0.4 }), {}).fov, 26, 1e-9, 'back over 0.4 s');
  const punch = C.cameraShot({ mode: 'play', aspect: 16 / 9, lp: 'result', res: 'goal', resT: 0.075, ex: 1, ey: 1 }, {});
  near(punch.fov, 26 - 1.5, 1e-9, 'goal punch');
  const rv = { mode: 'play', aspect: 16 / 9, lp: 'result', res: 'goal', replay: true, ex: -2.2, ey: 2.1 };
  assert.equal(C.cameraShot(Object.assign({}, rv, { resT: 0.3 }), {}).key, 'play');
  const mid = C.cameraShot(Object.assign({}, rv, { resT: 0.9 }), {});
  assert.equal(mid.key, 'replay'); assert.ok(mid.px < 0, 'beside the post on the ball’s side');
  assert.ok(mid.replayF > 0 && mid.replayF < 1);
  near(C.CAM.REPLAY_DUR, Pen.TIMING.FLIGHT / 0.6, 1e-12, 'flight re-simulated at 0.6×');
  assert.ok(C.CAM.REPLAY_AT + C.CAM.REPLAY_DUR < Pen.TIMING.RESULT_REPLAY, 'the replay fits in the 2.4 s RESULT');
  assert.equal(C.cameraShot(Object.assign({}, rv, { resT: 2.0 }), {}).key, 'play');
  assert.equal(C.cameraShot(Object.assign({}, rv, { res: 'save', resT: 0.9 }), {}).key, 'play', 'no replay for a save');
  /* reduced motion: no replay, no punch, no push-in, no follow */
  for (const extra of [{ resT: 0.9 }, { resT: 0.07 }, { lp: 'flight', flight: 0.8, close: true }]) {
    const s = C.cameraShot(Object.assign({}, rv, extra, { reduced: true }), {});
    assert.deepEqual([s.px, s.pz, s.fov, s.key], [0, 16, 26, 'play']);
  }
  const ri = C.cameraShot(Object.assign({}, v, { reduced: true, phaseT: 1.0 }), {});
  assert.equal(ri.px, 1.4, 'reduced intro is a still shot that cuts');
  const res = C.cameraShot({ mode: 'results', aspect: 16 / 9, offY: 0.27 }, {});
  assert.deepEqual([res.px, res.py, res.pz, res.lx, res.ly, res.lz, res.offY, res.key], [0, 1.9, 9.5, 0, 0.9, 2.5, 0.27, 'results']);
  const m0 = C.cameraShot({ mode: 'menu', aspect: 16 / 9, t: 0, reduced: true }, {}), m1 = C.cameraShot({ mode: 'menu', aspect: 16 / 9, t: 7, reduced: true }, {});
  assert.deepEqual([m0.px, m0.pz], [m1.px, m1.pz], 'a reduced menu camera stays still');
});

/* ---------------- keeper ---------------- */
test('penalty3d keeper: dive end poses are built from REACH (centre ±1.65, tip ±2.77, top 1.75; stay gloves to 2.19)', () => {
  for (const d of ['left', 'right']) {
    const o = C.diveEnd(d, null, NaN, NaN, {}), sg = d === 'left' ? -1 : 1, lead = sg < 0 ? 'L' : 'R';
    near(o.cx, sg * 1.65, 1e-12); near(Math.abs(o.roll) / DEG, 75, 1e-9);
    assert.equal(Math.sign(o.roll), -sg, 'the top leans the way he dives');
    const gx = lead === 'L' ? o.gLx : o.gRx, gy = lead === 'L' ? o.gLy : o.gRy;
    near(Math.abs(gx) + C.KEEPER.GLOVE_R, 2.77, 0.006, 'glove tip'); near(gy + C.KEEPER.GLOVE_R, 1.75, 0.006, 'highest point');
    near(Math.abs(gx) + C.KEEPER.GLOVE_R, -Pen.MAP.REACH_U.left.x0, 0.01, 'tip on the REACH edge');
  }
  const s = C.diveEnd('stay', null, NaN, NaN, {});
  near(s.gLy + C.KEEPER.GLOVE_R, Pen.MAP.REACH_U.stay.y1, 0.02); near(s.gRy, s.gLy, 0);
});

test('penalty3d keeper: on every save the near glove sits exactly on the ball (x, y, 0.35) when it arrives', () => {
  let n = 0;
  for (const d of DIVES) {
    const b = Pen.MAP.REACH_U[d];
    for (let x = b.x0; x <= b.x1 + 1e-9; x += 0.08) for (let y = 0.11; y <= b.y1 + 1e-9; y += 0.08) {
      const lx = Math.round(x * Pen.MAP.U + 480), ly = Math.round(340 - y * Pen.MAP.U);
      if (Pen.outcome(lx, ly, d) !== 'save') continue;
      const ex = Pen.MAP.lx2u(lx), ey = Pen.MAP.ly2u(ly);
      for (const k of [{ lp: 'flight', keeperT: 1, flight: 1 }, { lp: 'result', resT: 0 }, { lp: 'result', resT: 0.08 }]) {
        const o = C.keeperPose(kinput(Object.assign({ dive: d, res: 'save', ex, ey }, k)), {});
        const g = o.lead === 'L' ? [o.gLx, o.gLy, o.gLz] : [o.gRx, o.gRy, o.gRz];
        assert.ok(Math.hypot(g[0] - ex, g[1] - ey, g[2] - 0.35) < 1e-9, d + ' save at ' + lx + ',' + ly + ' ' + JSON.stringify(k));
        finite(o);
        n++;
      }
      const b2 = C.ballPose({ lp: 'flight', flight: 1, res: 'save', ex, ey }, {});
      assert.ok(Math.hypot(b2.x - ex, b2.y - ey, b2.z - 0.35) < 1e-12, 'the ball ends at the glove');
    }
  }
  assert.ok(n > 300, n + ' save cases');
});

test('penalty3d keeper: a goal on his side visibly passes out of reach; the wrong way keeps the plain dive', () => {
  let n = 0;
  for (const d of DIVES) for (let lx = 258; lx <= 702; lx += 6) for (let ly = 158; ly <= 332; ly += 6) {
    if (Pen.outcome(lx, ly, d) !== 'goal') continue;
    const ex = Pen.MAP.lx2u(lx), ey = Pen.MAP.ly2u(ly);
    const o = C.keeperPose(kinput({ lp: 'flight', dive: d, res: 'goal', ex, ey, keeperT: 1, flight: 1 }), {});
    for (const g of [[o.gLx, o.gLy], [o.gRx, o.gRy]]) {
      assert.ok(Math.hypot(g[0] - ex, g[1] - ey) >= C.KEEPER.GAP - 1e-9, d + ' glove touches a goal at ' + lx + ',' + ly);
    }
    finite(o);
    n++;
  }
  assert.ok(n > 500, n + ' goal cases');
  const plain = C.diveEnd('left', null, NaN, NaN, {}), wrong = C.diveEnd('left', 'goal', 2.2, 1.0, {});
  assert.deepEqual([wrong.cx, wrong.gLx, wrong.gLy], [plain.cx, plain.gLx, plain.gLy]);
});

test('penalty3d keeper: tells show as the spec poses (lean, crouch, step, hop, glove lift, Flip chip)', () => {
  /* glove height in the keeper's own frame (undo the lean's roll) */
  const bodyY = (o, gx, gy) => (gx - o.cx) * Math.sin(-o.roll) + (gy - o.cy) * Math.cos(-o.roll);
  const lean = C.keeperPose(kinput({ tell: { lean: 1 } }), {});
  near(lean.roll, -15 * DEG, 1e-12); near(lean.cx, 0.12, 1e-12); assert.equal(lean.eye, 1);
  assert.ok(bodyY(lean, lean.gRx, lean.gRy) > bodyY(lean, lean.gLx, lean.gLy) + 0.35, 'the arm on the lean side is raised');
  assert.ok(lean.gRx - lean.cx > 0.6, 'and held out on that side');
  const leanL = C.keeperPose(kinput({ tell: { lean: -1 } }), {});
  assert.ok(leanL.roll > 0 && leanL.cx < 0 && bodyY(leanL, leanL.gLx, leanL.gLy) > bodyY(leanL, leanL.gRx, leanL.gRy) + 0.35);
  const cr = C.keeperPose(kinput({ tell: { crouch: 1 } }), {});
  near(cr.by, 0.9, 1e-12); near(cr.bx, 1.08, 1e-12); near(cr.cy - 0.73 * cr.by, 0.12, 1e-12, 'feet stay planted');
  assert.ok(cr.gLz > 0.35 + 0.3 && cr.gRz > 0.35 + 0.3, 'both gloves forward');
  const st = C.keeperPose(kinput({ tell: { step: 0.25 } }), {});
  near(st.cx, 0.25, 1e-12);
  const rest = C.keeperPose(kinput({}), {});
  const gl = C.keeperPose(kinput({ tell: { gloveL: 1 } }), {});
  near(gl.gLy - rest.gLy, 0.3, 1e-12); assert.equal(gl.glowL, 1); near(gl.gRy, rest.gRy, 1e-12);
  const hop = C.keeperPose(kinput({ tell: { hop: 1 }, clock: Pen.TIMING.BEAT * 0.5 }), {});
  near(hop.cy - rest.cy, 0.12, 1e-9, 'Bop hops 0.12 u on the beat');
  assert.equal(C.keeperPose(kinput({ tellType: 'mirror' }), {}).chip, true);
  assert.equal(C.keeperPose(kinput({ tellType: 'mirror', lp: 'flight', keeperT: 0.5 }), {}).chip, false);
  assert.equal(C.keeperPose(kinput({ worried: true, lp: 'aimY' }), {}).face, 2, 'worried with a sweat drop');
});

test('penalty3d keeper: belly-flop after side dives, dizzy only after saves, a friendly wave, the ready pop-up', () => {
  const flop = C.keeperPose(kinput({ lp: 'result', dive: 'left', res: 'goal', ex: 2, ey: 1, resT: 2.0 }), {});
  near(Math.abs(flop.roll) / DEG, 90, 1e-9); near(flop.cy, C.KEEPER.R, 1e-9, 'lying on the grass'); assert.equal(flop.landed, true);
  for (let t = 0; t <= 2.4; t += 0.02) {
    const g = C.keeperPose(kinput({ lp: 'result', dive: 'right', res: 'goal', ex: -2, ey: 1, resT: t }), {});
    assert.equal(g.dizzy, 0, 'never dizzy after a goal'); assert.notEqual(g.face, 3);
    const bottom = g.qy * (g.cy - (C.KEEPER.HALF * Math.abs(Math.cos(g.roll)) + C.KEEPER.R));
    assert.ok(bottom >= -0.01, 'he lands on the grass, not under it (t ' + t.toFixed(2) + ': ' + bottom + ')');
  }
  const ex = Pen.MAP.lx2u(320), ey = Pen.MAP.ly2u(300);
  let sawDizzy = false, sawWave = false;
  for (let t = 0; t <= 2.4; t += 0.02) {
    const s = C.keeperPose(kinput({ lp: 'result', dive: 'left', res: 'save', ex, ey, resT: t }), {});
    if (s.dizzy > 0) { sawDizzy = true; assert.ok(t > 0.9 && t < 1.8, 'dizzy at ' + t); }
    if (s.wave > 0.5) sawWave = true;
    finite(s);
  }
  assert.ok(sawDizzy && sawWave);
  const pop0 = C.keeperPose(kinput({ lp: 'ready', shot: 3, phaseT: 0, hasPrev: true, prevDive: 'left', prevRes: 'save', prevEx: ex, prevEy: ey }), {});
  near(Math.abs(pop0.roll) / DEG, 90, 1e-6, 'starts from the landing');
  const pop1 = C.keeperPose(kinput({ lp: 'ready', shot: 3, phaseT: 0.4, hasPrev: true, prevDive: 'left', prevRes: 'save', prevEx: ex, prevEy: ey }), {});
  near(pop1.roll, 0, 1e-12); near(pop1.cy, C.keeperPose(kinput({ lp: 'ready', shot: 3, phaseT: 0.4 }), {}).cy, 1e-12);
  const red = C.keeperPose(kinput({ lp: 'ready', shot: 3, phaseT: 0, hasPrev: true, prevDive: 'left', prevRes: 'save', prevEx: ex, prevEy: ey, reduced: true }), {});
  near(red.roll, 0, 1e-12, 'reduced motion: a cut');
});

test('penalty3d keeper: the dance break (8 counts at 118 BPM) and its reduced group pose', () => {
  const d = C.danceCount(0, 118);
  near(d.beat, 60 / 118, 1e-12);
  assert.equal(C.danceCount(7.5 * 60 / 118, 118).c, 7);
  near(8 * 60 / 118, 4.068, 0.001, '≈ 4.1 s');
  for (let t = 0; t < 8.2; t += 0.05) finite(C.keeperDance(t, false, 1.3, 2.3, {}));
  const a = C.keeperDance(1.0, true, 1.3, 2.3, {}), b = C.keeperDance(3.0, true, 1.3, 2.3, {});
  assert.deepEqual([a.gLy, a.gRy, a.cy], [b.gLy, b.gRy, b.cy], 'reduced: one group pose');
  assert.ok(a.gLy > a.cy + 0.8, 'gloves up for the finale pose');
});

/* ---------------- ball + net ---------------- */
test('penalty3d ball: the flight is solved from the frozen lock (exact endpoints, same path as MAP.ballAt)', () => {
  for (let lx = 222; lx <= 738; lx += 43) for (let ly = 126; ly <= 332; ly += 29) {
    const ex = Pen.MAP.lx2u(lx), ey = Pen.MAP.ly2u(ly);
    for (let f = 0; f <= 1.0001; f += 0.125) {
      const b = C.ballPose({ lp: 'flight', flight: f, res: 'goal', kind: 'goal', ex, ey }, {}), m = Pen.MAP.ballAt(f, lx, ly);
      near(b.x, m.x, 1e-12); near(b.y, m.y, 1e-12); near(b.z, m.z, 1e-12);
    }
  }
  const s0 = C.ballPose({ lp: 'flight', flight: 0, ex: 2, ey: 2 }, {});
  assert.deepEqual([s0.x, s0.y, s0.z], [0, 0.11, 7.5]);
  for (const lp of ['aimX', 'aimY', 'windup', 'strike']) { const b = C.ballPose({ lp }, {}); assert.deepEqual([b.x, b.y, b.z], C.GEO.SPOT); }
  const drop = C.ballPose({ lp: 'ready', phaseT: 0.1 }, {}), set = C.ballPose({ lp: 'ready', phaseT: 0.5 }, {});
  assert.ok(drop.y > 0.11); assert.deepEqual([set.x, set.y, set.z], C.GEO.SPOT);
  const redDrop = C.ballPose({ lp: 'ready', phaseT: 0.1, reduced: true }, {});
  assert.deepEqual([redDrop.x, redDrop.y, redDrop.z], C.GEO.SPOT, 'reduced motion: the ball is simply on the spot');
});

test('penalty3d ball: goal → into the net, never through the ground; post/bar → contact and rebound; wide/over → caught by a fan', () => {
  for (const top of [false, true]) for (let lx = 262; lx <= 698; lx += 31) for (let ly = 162; ly <= 332; ly += 34) {
    const ex = Pen.MAP.lx2u(lx), ey = Pen.MAP.ly2u(ly);
    for (let t = 0; t <= 2.4; t += 0.02) {
      const b = C.ballPose({ lp: 'result', resT: t, res: 'goal', kind: 'goal', top, ex, ey }, {});
      assert.ok(b.y >= Math.min(0.11, ey) - 1e-9, 'above the grass'); assert.ok(b.z <= 1e-9, 'inside the goal');
      if (t > 0.1) assert.ok(b.z < -0.5 && Math.abs(b.x) < 3, 'in the net');
    }
    const end = C.ballPose({ lp: 'result', resT: 2.4, res: 'goal', kind: 'goal', top, ex, ey }, {});
    near(end.y, 0.11, 1e-9, 'rests on the grass');
  }
  for (const [lx, ly, kind] of [[247, 250, 'post'], [713, 200, 'post'], [480, 147, 'bar'], [300, 140, 'bar']]) {
    const ex = Pen.MAP.lx2u(lx), ey = Pen.MAP.ly2u(ly);
    assert.equal(Pen.missKind(lx, ly), kind);
    const c = C.contactPoint(kind, ex, ey, {}), f1 = C.ballPose({ lp: 'flight', flight: 1, res: 'miss', kind, ex, ey }, {});
    near(f1.x, c.x, 1e-12); near(f1.y, c.y, 1e-12);
    if (kind === 'post') near(Math.abs(Math.abs(c.x) - 3), 0.18, 1e-12, 'touches the post surface');
    else near(Math.abs(c.y - C.GEO.BAR), 0.18, 1e-12, 'touches the bar');
    let lastZ = -1;
    for (let t = 0; t <= 2.0; t += 0.05) {
      const b = C.ballPose({ lp: 'result', resT: t, res: 'miss', kind, ex, ey }, {});
      assert.ok(b.y >= 0.11 - 1e-9 && b.z >= lastZ - 1e-9, 'bounces back out onto the pitch'); lastZ = b.z;
    }
  }
  const cx = 6, cy = 1.9, cz = -6.4;
  const caught = C.ballPose({ lp: 'result', resT: 1.0, res: 'miss', kind: 'wide', ex: 3.2, ey: 1, catchX: cx, catchY: cy, catchZ: cz, reduced: true }, {});
  assert.deepEqual([caught.x, caught.y, caught.z], [cx, cy + 0.62, cz]);
  const hug = C.ballPose({ lp: 'result', resT: 1.5, res: 'save', ex: 1, ey: 1, hugX: 1.4, hugY: 0.7, hugZ: 0.8 }, {});
  assert.deepEqual([hug.x, hug.y, hug.z], [1.4, 0.7, 0.8], 'hugged');
});

test('penalty3d net: −0.35 u (−0.5 top corner) at the hit point, a 6 Hz spring at rest by 0.6 s, pinned at the frame', () => {
  near(C.netBulge(0.5, 1.2, 0.58, 0.55, 0.5, 1.2, 0.08, 0.35), -0.35, 1e-9);
  near(C.netBulge(-1.5, 1.6, 0.25, 0.73, -1.5, 1.6, 0.08, 0.5), -0.5, 1e-9);
  for (const t of [0, -0.1, 0.65, 0.9]) near(C.netBulge(0, 1, 0.5, 0.5, 0, 1, t, 0.35), 0, 0, 'at rest');
  for (const uv of [[0, 0.5], [1, 0.5], [0.5, 0], [0.5, 1]]) near(C.netBulge(0, 1, uv[0], uv[1], 0, 1, 0.08, 0.35), 0, 0, 'edges stay on the frame');
  assert.ok(Math.abs(C.netSpring(0.55)) < 0.07, 'decayed by 0.6 s');
  let crossings = 0, prev = C.netSpring(0.08);
  for (let t = 0.09; t < 0.6; t += 0.005) { const v = C.netSpring(t); if (Math.sign(v) !== Math.sign(prev)) crossings++; prev = v; }
  assert.ok(crossings >= 5 && crossings <= 7, '~6 Hz: ' + crossings + ' zero crossings in 0.5 s');
});

/* ---------------- crowd, light, cones ---------------- */
test('penalty3d crowd: 120 / 72 fans in the stands, 40% signature wands, exact lit fractions, uniform halves', () => {
  for (const n of [120, 72]) {
    const L = C.crowdLayout(n, 7), L2 = C.crowdLayout(n, 7);
    assert.equal(L.length, n); assert.deepEqual(L, L2, 'deterministic');
    assert.equal(L.filter(f => f.wand === -1).length, Math.round(0.4 * n));
    for (const f of L) {
      if (f.side === 0) assert.ok(f.z <= -5 && f.z >= -7.8 && Math.abs(f.x) <= 7.5 && f.y >= 0.6 && f.y <= 2.0);
      else assert.ok(Math.abs(f.x) >= 8.5 && Math.abs(f.z) < 4.2);
      assert.ok(f.body >= 0 && f.body < 5 && f.h > 0 && f.h < 1 && f.u >= 0 && f.u <= 1);
    }
    for (const hype of [0, 1, 2, 3, 4]) {
      const frac = C.wandsLit(hype, false);
      assert.equal(L.filter(f => f.h < frac).length, Math.round(frac * n), 'hype ' + hype);
    }
    const half = L.slice(0, n / 2);
    assert.ok(half.some(f => f.side < 0) && half.some(f => f.side > 0) && [0, 1, 2].every(r => half.some(f => f.side === 0 && f.row === r)));
  }
  assert.deepEqual([0, 1, 2, 3, 4].map(h => C.wandsLit(h, false)), [0.25, 0.5, 0.75, 1, 1]);
  assert.ok(C.wandsLit(0, true) >= 0.5, 'Night: at least half the wands');
  assert.deepEqual([0, 1, 2, 3, 4].map(h => C.showLevel(h)), [0, 0.2, 0.4, 0.6, 1.0]);
  assert.deepEqual([0, 1, 2, 3, 4].map(h => C.conesLit(h, 'MID')), [0, 0, 1, 2, 3]);
  assert.ok([0, 1, 2, 3, 4].every(h => C.conesLit(h, 'LOW') <= 2), 'LOW: at most 2 cones');
  let peak = 0;
  for (let t = -0.2; t < 1.5; t += 0.01) { const w = C.crowdWave(0.5, t); assert.ok(w >= 0 && w <= 0.15 + 1e-12); peak = Math.max(peak, w); }
  near(peak, 0.15, 1e-3, 'each blob hops 0.15 u');
  assert.ok(C.crowdWave(0, 0.1) > 0 && C.crowdWave(1, 0.1) === 0, 'the wave runs left to right');
});

test('penalty3d light: day per stadium → Showtime (exposure 1.0 → 1.08, rim 0.28 → 0.55 mixed with the signature colour)', () => {
  const sig = '#4FC3F7';
  for (const id of Object.keys(C.STADIUM_LOOK)) {
    const d = C.presetMix(id, 0, sig), s = C.presetMix(id, 1, sig), look = C.stadiumLook(id);
    assert.equal(C.rgbHex(d.top), look.top.toUpperCase()); assert.equal(C.rgbHex(d.hor), look.hor.toUpperCase());
    assert.equal(C.rgbHex(s.top), '#1A1240'); assert.equal(C.rgbHex(s.mid), '#3B1E6E'); assert.equal(C.rgbHex(s.hor), '#FF7AC8');
    near(s.exposure, 1.08, 1e-12); near(s.rimS, 0.55, 1e-12);
    assert.equal(C.rgbHex(s.rim), C.mixHex('#FF7AD9', sig, 0.4));
    assert.equal(d.stars, look.night ? 1 : 0, id + ' star field');
    assert.equal(s.stars, 1);
    for (const k of ['hemiI', 'sunI', 'fogNear', 'fogFar']) assert.ok(Number.isFinite(d[k]) && Number.isFinite(s[k]));
  }
  const day = C.presetMix('stadium_day', 0, sig);
  near(day.exposure, 1.0, 1e-12); near(day.rimS, 0.28, 1e-12); near(day.hemiI, 1.9, 1e-12); near(day.sunI, 2.4, 1e-12);
  assert.equal(C.rgbHex(day.hemiSky), '#DDF1FF'); assert.equal(C.rgbHex(day.sun), '#FFF3E0');
  /* the stadium sky and grass are the LOCKED 2D colours */
  const Look = require('../world/world-look.js');
  for (const id of Object.keys(C.STADIUM_LOOK)) {
    assert.equal(C.STADIUM_LOOK[id].sky.toUpperCase(), Look.LOCKED.STADIA[id][0].toUpperCase(), id + ' sky');
    assert.equal(C.STADIUM_LOOK[id].grass.toUpperCase(), Look.LOCKED.STADIA[id][1].toUpperCase(), id + ' grass');
  }
  for (const id of Object.keys(C.BALL_LOOK)) assert.ok(Look.LOCKED.BALLS[id], id);
});

test('penalty3d light: the Showtime blend takes 1.6 s up, 0.8 s down (0.25 s reduced), monotonic', () => {
  function timeTo(tw, target, up, down) {
    C.tweenTo(tw, target, up, down);
    let t = 0, last = tw.v;
    while (tw.v !== target && t < 5) { C.tweenStep(tw, 0.01); t += 0.01; assert.ok(target > last ? tw.v >= last - 1e-12 : tw.v <= last + 1e-12); last = tw.v; }
    return t;
  }
  const tw = C.tween(0);
  near(timeTo(tw, 1, 1.6, 0.8), 1.6, 0.011); near(timeTo(tw, 0, 1.6, 0.8), 0.8, 0.011);
  near(timeTo(tw, 0.6, 0.25, 0.25), 0.25, 0.011);
});

test('penalty3d cones: sweeps stay over the crowd and sky (never across the goal mouth); snaps to the goal and the ball', () => {
  for (let i = 0; i < 3; i++) {
    for (let t = 0; t < 20; t += 0.1) {
      const c = C.coneAim(i, 'sweep', t, false, 0, 0, {});
      near(Math.hypot(c.dx, c.dy, c.dz), 1, 1e-9);
      assert.ok(c.dz < 0, 'points away from the goal mouth, over the stands');
      /* the beam never reaches the goal-mouth plane z = 0 in front of the towers */
      assert.ok(c.z + c.dz * c.len < 0 || c.dz < 0);
    }
    const g = C.coneAim(i, 'goal', 0, false, -2.1, 2.0, {});
    const hitT = (0 - g.z) / g.dz;
    near(g.x + g.dx * hitT, -2.1, 1e-9); near(g.y + g.dy * hitT, 2.0, 1e-9);
    const b = C.coneAim(i, 'ball', 0, false, 0, 0, {}), bt = (7.5 - b.z) / b.dz;
    near(b.x + b.dx * bt, 0, 1e-9); near(b.y + b.dy * bt, 0.11, 1e-9);
    assert.ok(b.len >= Math.hypot(b.x, b.y - 0.11, b.z - 7.5), 'reaches the ball');
    const r0 = C.coneAim(i, 'sweep', 0, true, 0, 0, {}), r1 = C.coneAim(i, 'sweep', 6, true, 0, 0, {});
    assert.deepEqual([r0.dx, r0.dy, r0.dz], [r1.dx, r1.dy, r1.dz], 'reduced: still');
  }
  assert.ok(C.RATES.CONE_SWEEP_HZ <= 0.12 + 1e-12);
  for (const k of ['TWINKLE_HZ', 'WAND_PULSE_HZ', 'LED_FLASH_HZ']) assert.ok(C.RATES[k] <= 2, k + ' never flashes faster than 2 Hz');
});

/* ---------------- staging + copy ---------------- */
test('penalty3d staging: the pet steps back on lock X, 2-stride run-up, paw meets the ball at STRIKE, turns to the camera to react', () => {
  const aimY = C.petStage({ lp: 'aimY', phaseT: 0.15 }, {});
  near(aimY.z - C.GEO.KICKER[2], 0.3, 1e-12, 'steps back 0.3 u');
  const w0 = C.petStage({ lp: 'windup', phaseT: 0 }, {}), w1 = C.petStage({ lp: 'windup', phaseT: Pen.TIMING.WINDUP }, {});
  assert.deepEqual([w0.x, w0.z], [C.GEO.STEPBACK[0], C.GEO.STEPBACK[2]]); near(w1.x, C.GEO.RUNUP[0], 1e-12); near(w1.z, C.GEO.RUNUP[2], 1e-12);
  near(w1.ct, 0.32, 1e-12, 'the kick clip strikes as STRIKE begins');
  const sk = C.petStage({ lp: 'strike', phaseT: 0.03 }, {});
  assert.equal(sk.clip, 'kick'); near(sk.ct, 0.32, 1e-12); near(sk.sy, 1.15, 1e-12, 'stretch at contact');
  near(C.petStage({ lp: 'windup', phaseT: Pen.TIMING.WINDUP }, {}).sy, 0.85, 1e-12, 'crouch before contact');
  const goal = C.petStage({ lp: 'result', resT: 0.8, res: 'goal' }, {});
  assert.equal(goal.clip, 'dance'); assert.equal(goal.yaw, 0);
  const beat = 60 / 118;
  assert.ok(goal.ct >= 4 * beat && goal.ct <= 6 * beat, 'counts 5–6: the signature move');
  assert.equal(C.petStage({ lp: 'result', resT: 0.8, res: 'save' }, {}).clip, 'sad');
  assert.equal(C.petStage({ lp: 'aimX', idleT: 4.1 }, {}).tap, 1, 'foot tap after 4 s');
  assert.equal(C.avatarClip('result', 'goal', 0.5, false), 'wave');
  assert.equal(C.avatarClip('result', 'save', 0.6, false), 'clap');
  assert.equal(C.avatarClip('aimX', null, 0, true), 'cheer');
});

test('penalty3d LED + menu: kick pips, messages and an honest attract loop of the selected rival’s tell', () => {
  const log = [{ res: 'goal', top: true }, { res: 'save' }, { res: 'goal' }, { res: 'miss', kind: 'post' }, { res: 'goal', star: true }];
  assert.deepEqual(C.ledPips(log, 5), [3, 4, 2, 4, 3, 1, 0, 0]);
  assert.equal(C.ledText('start', { pet: 'Biscuit' }), 'GO BISCUIT!');
  assert.equal(C.ledText('hype', { hype: 3 }), 'HYPE ×3');
  assert.deepEqual(['encore', 'final', 'show'].map(k => C.ledText(k)), ['ENCORE!', 'FINAL KICK', 'WHAT A SHOW!']);
  const seen = {};
  for (let t = 0; t < 10; t += 0.1) {
    const m = C.menuTell(t, {});
    seen[m.dive] = true;
    if (m.aimT < 0.8) continue;
    for (const rv of RIVALS) assert.equal(Pen.readTell(rv, Pen.tellAt(rv, m.dive, m.aimT, m.clock)), m.dive, rv + ' menu loop reads true');
  }
  assert.deepEqual(Object.keys(seen).sort(), ['left', 'right'], 'alternates fake left / right dives');
});

test('penalty3d copy: banners come from resultLabel, and nothing the view says mocks the player', () => {
  const e = { t: 'result', res: 'save', dive: 'left', x: 330, y: 300, pts: 0 };
  const b = C.bannerFor(e, { res: 'save', dive: 'left', x: 330, y: 300 }, Pen.resultLabel);
  assert.equal(b.title, 'SAVED!'); assert.equal(b.sub, 'He dived LEFT!'); assert.equal(b.slot, 'main');
  assert.equal(C.bannerFor({ t: 'encore', on: true }).title, 'ENCORE MODE!');
  assert.equal(C.bannerFor({ t: 'encore', on: false }), null);
  assert.equal(C.bannerFor({ t: 'boost' }).title, 'The crowd’s got your back!');
  assert.equal(C.bannerFor({ t: 'kick', final: true, shot: 7 }).title, 'FINAL KICK!');
  const texts = Object.values(C.COPY).concat(['aimX', 'aimY'].map(C.promptFor));
  for (const t of texts) assert.doesNotMatch(t, BANNED, t);
  assert.equal(C.promptFor('aimX'), 'Tap to pick the SIDE'); assert.equal(C.promptFor('flight'), '');
});

/* ---------------- whole rounds through the director ---------------- */
test('penalty3d director: real rounds (autopilot + random taps, every rival) give finite, grounded, rule-true poses', () => {
  let saves = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const rival = RIVALS[seed % 4], r = Pen.newRound({ sound() {}, reduced: seed % 3 === 0 }, rival, { seed });
    r.wantEvents = true; r.events = [];
    const st = r.state, rng = lcg(seed), cam = {}, kp = {}, bp = {}, ps = {};
    let t = 0;
    while (!r.done && t < 150) {
      if (seed % 2) r.autopilot(); else if (rng() < 0.012) r.input('kick', true);
      r.step(STEP); t += STEP; r.events.length = 0;
      const v = snapshot(st);
      C.cameraShot({ mode: 'play', aspect: 4 / 3, lp: v.lp, shot: st.shot, intro: st.intro, phaseT: st.phaseT, flight: st.flight, close: st.close,
        resT: st.resT, replay: st.replay, res: v.res, ex: v.ex, ey: v.ey, prevEx: v.prev ? Pen.MAP.lx2u(v.prev.x) : 0, reduced: seed % 3 === 0 }, cam);
      /* the narrowest moment is a slow-mo push-in (21°) meeting the goal punch (−1.5°) */
      finite(cam, 'camera'); assert.ok(cam.fov >= 21 - 1.5 - 1e-9 && cam.fov <= 60, 'fov ' + cam.fov);
      C.keeperPose(kinput({ lp: v.lp, tellType: Pen.rivalById(rival).tell, tell: st.tell, dive: st.dive, clock: st.clock, phaseT: st.phaseT, keeperT: st.keeperT,
        resT: st.resT, res: v.res, ex: st.lockX != null ? v.ex : NaN, ey: st.lockY != null ? v.ey : NaN, flight: st.flight, shot: st.shot,
        hasPrev: !!v.prev, prevDive: v.prev && v.prev.dive, prevRes: v.prev && v.prev.res, prevEx: v.prev ? Pen.MAP.lx2u(v.prev.x) : NaN, prevEy: v.prev ? Pen.MAP.ly2u(v.prev.y) : NaN,
        bop: rival === 'rival_bop', reduced: seed % 3 === 0 }), kp);
      finite(kp, 'keeper');
      C.ballPose({ lp: v.lp, phaseT: st.phaseT, flight: st.flight, resT: st.resT, res: v.res, kind: v.kind, top: v.top, ex: v.ex, ey: v.ey,
        hugX: kp.hugX, hugY: kp.hugY, hugZ: kp.hugZ, catchX: 5, catchY: 1.6, catchZ: -6 }, bp);
      finite(bp, 'ball'); assert.ok(bp.y >= Pen.MAP.AIM_U.y0 - 1e-9, 'ball above the grass (the lowest aim is 0.104)');
      if (v.lp === 'result' && v.res === 'save' && st.resT < 0.1) {
        const g = kp.lead === 'L' ? [kp.gLx, kp.gLy] : [kp.gRx, kp.gRy];
        assert.ok(Math.hypot(g[0] - bp.x, g[1] - bp.y) < 1e-9, 'glove on the ball at the save'); saves++;
      }
      C.petStage({ lp: v.lp, phaseT: st.phaseT, shot: st.shot, flight: st.flight, resT: st.resT, res: v.res, idleT: st.idleT }, ps);
      finite(ps, 'pet');
    }
    assert.equal(st.log.length, 8);
  }
  assert.ok(saves > 0, 'the random tapper produced saves to check (' + saves + ' frames)');
});

/* ---------------- the ES-module view: static checks ---------------- */
const VIEW_FILES = ['penalty-3d.js', 'penalty-3d-models.js', 'penalty-3d-fx.js', 'penalty-3d-hud.js'];
test('penalty3d view: ES modules that read state only, lease the shared renderer, and use no forbidden APIs', () => {
  const STATE_WRITE = /\bs(tate)?\.[a-zA-Z_]+\s*(=|\+=|-=|\+\+|--)(?!=)/;
  for (const f of VIEW_FILES.concat(['penalty-3d-core.js'])) {
    const src = fs.readFileSync(path.join(__dirname, '../world/games', f), 'utf8');
    assert.doesNotMatch(src, STATE_WRITE, f + ' writes round state');
    assert.doesNotMatch(src, /new\s+THREE\.(PointLight|SpotLight|RectAreaLight)\b/, f + ' uses a real point/spot light');
    assert.doesNotMatch(src, /window\.THREE\b/, f + ' must not touch the old global THREE');
    assert.doesNotMatch(src, /\bfx\.flash\b|localStorage\.setItem|sessionStorage\.setItem/, f);
    assert.doesNotMatch(src, /https?:\/\/(?!fonts\.googleapis\.com)/, f + ' loads nothing from the network');
    if (f === 'penalty-3d-core.js') continue;
    for (const m of src.matchAll(/^\s*import\s[^'"]*['"]([^'"]+)['"]/gm)) assert.ok(/^three(\/addons\/.*)?$/.test(m[1]), f + ' imports ' + m[1]);
    for (const m of src.matchAll(/import\(\s*'([^']+)'/g)) assert.ok(/^three\/addons\//.test(m[1]), f + ' dynamic import ' + m[1]);
  }
  const main = fs.readFileSync(path.join(__dirname, '../world/games/penalty-3d.js'), 'utf8');
  assert.match(main, /export\s+async\s+function\s+create\s*\(\s*mid\s*,\s*opts\s*\)/);
  assert.match(main, /import \* as THREE from 'three'/);
  assert.match(main, /SL3D\.lease\('game'/); assert.match(main, /\.release\(\)/);
  assert.doesNotMatch(main, /\bL\.start\(\)/, 'the shell drives frames; the lease loop is never started');
  assert.match(main, /setRound/); assert.match(main, /dispose/);
  for (const f of ['penalty-3d-core.js', 'penalty-3d-models.js', 'penalty-3d-fx.js', 'penalty-3d-hud.js']) assert.match(main, new RegExp("load\\('" + f.replace(/\./g, '\\.') + "'\\)|'" + f.replace(/\./g, '\\.') + "'"));
  assert.deepEqual(Pen.def.view3d, { src: 'world/games/penalty-3d.js' });
});
