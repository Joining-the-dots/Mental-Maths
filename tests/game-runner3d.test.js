'use strict';
/* Debut Run 3D view — the pure maths in world/games/course-3d-math.js (window.SLCourse3DMath).
   The Three.js view itself (pet-course-3d.js / course-3d-scene.js) needs WebGL; here we test
   everything it decides: mapping, the look table, light mixing, the camera rig, the juice state
   machine driven by REAL logic events, the pet's clip choice, props, LEDs, fans, particles and
   the photosensitivity limits (nothing changes faster than 2 Hz). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const M = require('../world/games/course-3d-math.js');
const Course = require('../world/games/pet-course.js');
const Chars = require('../world/island3d/models-characters.js');

const STEP = 1 / 120;
const VARIANTS = ['course_meadow', 'course_beach', 'course_snow', 'course_candy'];
const HEX = /^#[0-9a-f]{6}$/i;
const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= (eps || 1e-9), (msg || '') + ' ' + a + ' ≉ ' + b);

/* ---------------- mapping ---------------- */
test('mapping: 100 logic px = 1 u, ground y = 0, the pet at its hitbox centre', () => {
  assert.equal(M.PX, 100);
  near(M.petX(0), 2.35); near(M.petX(1000), 12.35);
  near(M.worldY(452), 0); near(M.worldY(452 - 116), 1.16);
  assert.equal(M.feetH(0), 0); near(M.feetH(-169), 1.69); assert.equal(M.feetH(3), 0);
  near(M.obsCentreX({ x: 1000, w: 30 }), 10.15);
  /* the logic's own constants agree with the view's mirror */
  assert.equal(M.GROUND, Course.TUNING.GROUND);
  assert.equal(M.PET_CX, Course.TUNING.PET_X + Course.TUNING.HB_X + Course.TUNING.PET_W / 2);
  near(M.BEAT, Course.BEAT);
});

test('obstacles are modelled at the exact logic sizes (/100)', () => {
  const sz = M.kindSizes(Course.KINDS);
  near(sz.low.w, 0.30); near(sz.low.h, 0.58);
  near(sz.log.w, 0.88); near(sz.log.h, 0.44); near(sz.log.r * 4, 0.88);         /* two logs of r 0.22 side by side */
  near(sz.hedge.w, 0.68); near(sz.hedge.h, 0.78);
  near(sz.stack.w, 0.56); near(sz.stack.h, 1.16); near(sz.stack.cushion, 1.16);
  near(sz.puddle.w, 1.08);
  near(sz.bar.w, 0.52); near(sz.bar.under, 0.40); near(sz.bar.board, 0.60); near(sz.bar.post, 2.2);
  /* defaults equal the logic when KINDS is missing */
  assert.deepEqual(M.kindSizes(null), sz);
});

/* ---------------- look table ---------------- */
test('look table: every course, locked THEMES identical to the logic, palette hexes only', () => {
  assert.deepEqual(M.THEMES_LOCKED, Course.THEMES, 'the view copy of the locked course colours matches pet-course.js');
  const atlas = ['sparkle', 'heart', 'note', 'star', 'dot', 'ring', 'rect', 'petal', 'snow', 'bubble', 'puff', 'circle', 'curl', 'diamond', 'plus', 'tri'];
  for (const v of VARIANTS) {
    const lk = M.look3d(v, Course.THEMES);
    assert.equal(lk.variant, v);
    assert.deepEqual(lk.obs, Course.THEMES[v].obs);
    for (const k of ['ground', 'soil', 'hill', 'hill2', 'apron', 'water', 'waterDeep', 'treatColor']) assert.match(lk[k], HEX, v + '.' + k);
    for (const k of ['sky', 'arch', 'deck']) { assert.equal(lk[k].length, 2); lk[k].forEach(h => assert.match(h, HEX, v + '.' + k)); }
    assert.equal(lk.props.length, 2);
    assert.ok(['leafy', 'castle', 'bank', 'frosting'].includes(lk.hedge));
    assert.ok(['hay', 'rings', 'snowblock', 'cupcake'].includes(lk.stack));
    assert.ok(['frog', 'dolphin', 'icicles', 'gumdrops'].includes(lk.friend));
    assert.ok(lk.fever.cells.every(c => atlas.includes(c)), 'fever cells exist in the sparkle atlas');
    lk.fever.colors.forEach(h => assert.match(h, HEX));
    assert.ok(['bone', 'fish', 'sweet'].includes(lk.treat));
  }
  assert.equal(M.look3d('nope').variant, 'course_meadow');
  assert.equal(M.look3d('course_candy').water, '#a0522d', 'the candy chocolate river');
  /* the arch pairs are world-art's locked THEME pairs */
  const look = require('../world/world-look.js');
  for (const v of VARIANTS) assert.deepEqual(M.look3d(v).arch, look.LOCKED.THEME[v]);
});

/* ---------------- light ---------------- */
test('showMix: day → sunset by the end of the Pre-Chorus → Showtime over 1.6 s from the Chorus door', () => {
  const t2 = Course.SECTIONS[2].t0, t3 = Course.SECTIONS[3].t0;
  assert.equal(M.showMix(0, t2, t3, false), 0);
  assert.equal(M.showMix(t2 - 0.01, t2, t3, false), 0);
  near(M.showMix((t2 + t3) / 2, t2, t3, false), 0.25);
  near(M.showMix(t3, t2, t3, false), 0.5);
  near(M.showMix(t3 + 0.8, t2, t3, false), 0.75, 1e-9);
  assert.equal(M.showMix(t3 + 1.6, t2, t3, false), 1);
  assert.equal(M.showMix(t3 + 0.25, t2, t3, true), 1, 'reduced motion: a 0.25 s crossfade');
  let prev = -1;
  for (let t = -1; t < 80; t += 0.05) { const k = M.showMix(t, t2, t3, false); assert.ok(k >= prev - 1e-12 && k >= 0 && k <= 1); prev = k; }
});

test('lightAt: exact Day / Showtime presets at the ends, the theme horizon kept at 40 %', () => {
  const lk = M.look3d('course_beach'), out = {};
  M.lightAt(0, lk, '#00FF00', out);
  near(out.hemiI, 1.9); near(out.sunI, 2.4); near(out.exposure, 1.0); near(out.rimI, 0.28);
  assert.equal(out.skyTop, M.hexInt(lk.sky[0])); assert.equal(out.skyMid, M.hexInt(lk.sky[1]));
  assert.equal(out.stars, 0); assert.equal(out.cones, 0); assert.equal(out.fans, 0); near(out.discA, 1);
  const same = M.lightAt(1, lk, '#00FF00', out);
  assert.equal(same, out, 'writes into the caller\'s object');
  near(out.hemiI, 0.85); near(out.sunI, 0.9); near(out.exposure, 1.08); near(out.rimI, 0.55);
  assert.equal(out.skyTop, 0x1A1240); assert.equal(out.skyMid, 0x3B1E6E);
  assert.equal(out.skyHor, M.mixInt(0xFF7AC8, M.hexInt(lk.sky[1]), 0.4));
  assert.equal(out.rim, M.mixInt(0xFF7AD9, 0x00FF00, 0.4), 'Showtime rim = Rim Showtime mixed 60/40 with the member colour');
  near(out.stars, 1, 1e-9); near(out.cones, 1, 1e-9); near(out.fans, 1, 1e-9); near(out.discA, 0, 1e-9);
  M.lightAt(0.5, lk, '#00FF00', out);
  assert.equal(out.skyMid, M.hexInt(M.SUNSET.skyMid), 'the sunset key at 0.5');
  assert.ok(out.cones === 0 && out.fans === 0, 'no Showtime extras at sunset');
  /* a bad member colour falls back */
  M.lightAt(1, lk, 'not-a-colour', out);
  assert.equal(out.rim, M.mixInt(0xFF7AD9, M.hexInt(M.COL.MEMBER_FALLBACK), 0.4));
});

/* ---------------- camera ---------------- */
test('camera: spec follow rig, yaw/roll 0, aspect-aware FOV (40° at 16:9, ≤ 60°), bounded shake', () => {
  const c = M.followCam(10, 1, {});
  near(c.x, 12.2); near(c.y, 2.05); near(c.z, 7.5); near(c.tx, 12.2); near(c.ty, 1.25); assert.equal(c.tz, 0);
  assert.equal(c.x, c.tx, 'never yawed: jump timing reads exactly as in 2D');
  near(M.fovFor(16 / 9), 40);
  near(M.fovFor(21 / 9), 40, 1e-9);
  const ipad = M.fovFor(4 / 3);
  assert.ok(ipad > 40 && ipad < 60);
  const lane = 2 * 7.5 * Math.tan(ipad * Math.PI / 360) * (4 / 3);
  near(lane, 9.6, 1e-6);                                              /* 9.6 u of lane stay visible */
  assert.equal(M.fovFor(0.46), 60, 'portrait phones cap at 60°');
  for (let s = 0; s < 0.25; s += 0.005) {
    const o = M.shakeAt(s, 0.06, 0.18, {});
    assert.ok(Math.abs(o.x) <= 0.06 && Math.abs(o.y) <= 0.06);
    if (s >= 0.18) assert.ok(o.x === 0 && o.y === 0);
  }
  assert.ok(M.kickAt(0.05, 0.15, 0.28) > 0 && M.kickAt(0.05, 0.15, 0.28) <= 0.15 && M.kickAt(0.3, 0.15, 0.28) === 0);
  assert.equal(M.moveK(0.1, 1.2, true), 1, 'reduced motion: a static cut');
  near(M.moveK(0.6, 1.2, false), 0.5);
  assert.equal(M.menuOrbit(3, true), 0);
  for (let t = 0; t < 20; t += 0.1) assert.ok(Math.abs(M.menuOrbit(t, false)) <= 5 * Math.PI / 180 + 1e-12, '10° orbit');
});

/* ---------------- juice ---------------- */
test('juice: the bump felt timeline (hit-stop, shake, LEDs dark, fans ooh, hat pop) and reduced motion', () => {
  const j = M.newJuice();
  M.juiceEvent(j, { type: 'bump', kind: 'hedge', rehearsal: false }, { hasHat: true, fever: true });
  near(j.hold, 0.08); near(j.shakeAmp, 0.06); near(j.ledDark, 0.8); near(j.ooh, 0.6);
  assert.equal(j.sinceBump, 0); assert.equal(j.sinceHat, 0); assert.ok(j.hatOff); assert.ok(j.feverByBump);
  M.juiceStep(j, 0.05); assert.ok(j.hold > 0);
  M.juiceStep(j, 0.05); assert.equal(j.hold, 0, 'the hold is 80 ms');
  const cam = M.juiceCam(j, false, {}); assert.ok(Math.abs(cam.x) <= 0.06);
  for (let i = 0; i < 80; i++) M.juiceStep(j, 0.01);
  assert.equal(j.ledDark, 0); assert.equal(j.ooh, 0); assert.equal(j.hatOff, false, 'the hat is back on');
  /* rehearsal bonk: the flip and hit-stop only — no blackout, no ooh */
  const r = M.newJuice();
  M.juiceEvent(r, { type: 'bump', kind: 'low', rehearsal: true }, { hasHat: false });
  assert.equal(r.ledDark, 0); assert.equal(r.ooh, 0); near(r.hold, 0.08); assert.equal(r.hatOff, false);
  /* reduced motion: no shake, no hat pop, but the 80 ms stillness stays */
  const q = M.newJuice();
  M.juiceEvent(q, { type: 'bump', kind: 'log', rehearsal: false }, { reduced: true, hasHat: true });
  near(q.hold, 0.08); assert.equal(q.shakeAmp, 0); assert.equal(q.hatOff, false);
  const qc = M.juiceCam(q, true, {}); assert.ok(qc.x === 0 && qc.y === 0 && qc.kick === 0);
  /* BOING: a +0.15 u kick and a 50 ms hold */
  const b = M.newJuice();
  M.juiceEvent(b, { type: 'boing' }, {});
  near(b.hold, 0.05); near(b.kickAmp, 0.15); assert.ok(b.excite > 0);
  /* tiers remember where they came from (the LED chase) */
  const t = M.newJuice();
  M.juiceEvent(t, { type: 'tier', mult: 2 }); M.juiceEvent(t, { type: 'tier', mult: 3 });
  assert.equal(t.tierFrom, 2); assert.equal(t.tierTo, 3);
  M.resetJuice(t); assert.equal(t.tierTo, 1); assert.equal(t.sinceTier, 99);
});

/* ---------------- pet visual ---------------- */
const CLIPS = Chars.CLIP_NAMES;
function vis(s, j, extra) { return M.petVisual(s, j || M.newJuice(), Object.assign({ reduced: false, clock: 1, speed: 3 }, extra), M.newVisual()); }
test('pet visual: run / jump / fall / slide / flips / twirl / slip with spec squash and stretch', () => {
  const base = { phase: 'run', onGround: true, vy: 0, sliding: false, diving: false, eff: null, effT: 0 };
  assert.equal(vis(base).clip, 'run');
  const j = M.newJuice(); M.juiceEvent(j, { type: 'takeoff', grade: 1 });
  let v = vis(Object.assign({}, base, { onGround: false, vy: -800 }), j);
  assert.equal(v.clip, 'jump'); near(v.sy, 0.8); near(v.sx, 1.15); near(v.sz, 1.15);                  /* take-off squash */
  M.juiceStep(j, 0.1); v = vis(Object.assign({}, base, { onGround: false, vy: -500 }), j);
  near(v.sy, 1.2); near(v.sx, 0.9);                                                                    /* then stretch */
  M.juiceStep(j, 0.2); v = vis(Object.assign({}, base, { onGround: false, vy: 300 }), j);
  assert.equal(v.clip, 'fall'); assert.equal(v.sy, 1);
  M.juiceEvent(j, { type: 'dj' }); M.juiceStep(j, 0.17);
  v = vis(Object.assign({}, base, { onGround: false, vy: -300 }), j);
  assert.ok(v.pitch > 0 && v.pitch < 360, 'a 360° front flip over 0.35 s');
  M.juiceEvent(j, { type: 'boing' }); M.juiceStep(j, 0.2);
  v = vis(Object.assign({}, base, { onGround: false, vy: -600 }), j);
  assert.ok(v.yaw > 0 && v.yaw < 360, 'BOING twirl');
  const l = M.newJuice(); M.juiceEvent(l, { type: 'land', hard: false });
  v = vis(base, l); near(v.sy, 0.75); near(v.sx, 1.2);
  M.juiceStep(l, 0.08 + 0.18); v = vis(base, l); near(v.sy, 1, 1e-6);
  assert.equal(vis(Object.assign({}, base, { sliding: true })).clip, 'slide');
  v = vis(Object.assign({}, base, { eff: 'slip', effT: 0.25 }));
  near(v.yaw, 180, 1e-6);
  /* reduced motion: no flips, twirls or squash */
  const jr = M.newJuice(); M.juiceEvent(jr, { type: 'dj' }); M.juiceEvent(jr, { type: 'takeoff', grade: 3 });
  v = M.petVisual(Object.assign({}, base, { onGround: false, vy: -300 }), jr, { reduced: true, clock: 0, speed: 3 }, M.newVisual());
  assert.equal(v.pitch, 0); assert.equal(v.sy, 1);
  /* every clip the view asks for exists in the shared rig */
  for (const c of ['run', 'jump', 'fall', 'slide', 'tumble', 'dizzy', 'dance', 'idle', 'hop']) assert.ok(CLIPS.includes(c), c);
});

test('pet visual: tumble = hit-stop hold, a 0.45 s back-flip, then dizzy ✦ until 1.4 s; reduced = squash + sparkle', () => {
  const j = M.newJuice(); M.juiceEvent(j, { type: 'bump', kind: 'hedge' }, {});
  const s = { phase: 'run', onGround: false, vy: -500, eff: 'tumble', effT: 0.03 };
  let v = vis(s, j);
  assert.ok(v.frozen, 'the 80 ms visual hold'); near(v.sx, 0.7); near(v.sy, 1.15);
  M.juiceStep(j, 0.2);
  v = vis(Object.assign({}, s, { effT: 0.3 }), j);
  assert.equal(v.clip, 'tumble'); near(v.t, (0.3 - 0.08) * 0.6 / 0.45); assert.equal(v.height, 0, 'the logic owns the pop height');
  v = vis(Object.assign({}, s, { effT: 0.7, onGround: true }), j);
  assert.equal(v.clip, 'dizzy'); assert.equal(v.spark, 1);
  v = vis(Object.assign({}, s, { effT: 1.45, onGround: true }), j);
  assert.equal(v.spark, 0);
  v = M.petVisual(Object.assign({}, s, { effT: 0.3 }), j, { reduced: true, clock: 0, speed: 0 }, M.newVisual());
  assert.equal(v.clip, 'tumble'); assert.equal(v.pitch, 0); assert.equal(v.spark, 1);
});

test('pet visual: finish dance faces the camera, curtain call dizzy then bow, time-up idles, menu bounces ≤ 2 Hz', () => {
  const j = M.newJuice();
  let v = vis({ phase: 'finish', endT: 0.3, finished: true }, j);
  assert.equal(v.clip, 'run'); near(v.speed, 3 * 0.5);
  v = vis({ phase: 'finish', endT: 1.2, finished: true }, j);
  assert.equal(v.clip, 'dance'); near(v.faceCam, 1);
  v = vis({ phase: 'done', finished: true }, j); assert.equal(v.clip, 'dance');
  v = vis({ phase: 'curtain', endT: 0.5, curtain: true }, j); assert.equal(v.clip, 'dizzy');
  v = vis({ phase: 'curtain', endT: 1.6, curtain: true }, j); assert.equal(v.clip, 'idle'); near(v.bow, 1);
  v = vis({ phase: 'done', finished: false, curtain: false }, j); assert.equal(v.clip, 'idle');
  /* menu: one hop every second beat (≈ 1.07 Hz) */
  let hops = 0, was = false;
  for (let t = 0; t < 10; t += 1 / 60) {
    const m = M.petVisual(null, j, { reduced: false, clock: t, speed: 0, menu: true }, M.newVisual());
    const on = m.clip === 'hop'; if (on && !was) hops++; was = on;
  }
  assert.ok(hops <= 11, 'menu bounce ≤ 1.1 Hz: ' + hops);
  assert.equal(M.petVisual(null, j, { reduced: true, clock: 0.1, menu: true }, M.newVisual()).clip, 'idle');
});

/* ---------------- props ---------------- */
test('props: wobble ≤ 12°, flatten to 35 % over 0.3 s, gate boards lift, cushion squashes to 60 % and springs back', () => {
  const a = M.newPropAnim();
  for (let t = 0; t < 2; t += 0.01) {
    M.propAnim({ kind: 'hedge', hit: true, hitT: 0, x: 0 }, t, -99, false, a);
    assert.ok(Math.abs(a.rot) <= 12 * Math.PI / 180 + 1e-12);
    if (t >= 0.3) near(a.sy, 0.35);
  }
  M.propAnim({ kind: 'hedge', hit: true, hitT: 0, x: 0 }, 0.15, -99, false, a); near(a.sy, 1 - 0.65 * 0.5);
  M.propAnim({ kind: 'bar', hit: true, hitT: 0, x: 0 }, 1, -99, false, a); near(a.lift, 0.55); assert.equal(a.sy, 1);
  M.propAnim({ kind: 'stack', bounced: true, bounceT: 5, x: 0 }, 5, -99, false, a); near(a.csy, 0.6, 1e-9);
  M.propAnim({ kind: 'stack', bounced: true, bounceT: 5, x: 0 }, 5.41, -99, false, a); assert.equal(a.csy, 1);
  M.propAnim({ kind: 'low', x: 0 }, 1.1, 1.0, false, a); assert.ok(a.dy > 0 && a.dy <= 0.05, 'a tiny happy hop on a clean clear');
  M.propAnim({ kind: 'low', hit: true, hitT: 0, x: 0 }, 0.1, 0, true, a); assert.equal(a.rot, 0); assert.equal(a.dy, 0); near(a.sy, 0.35);
  /* cushions twinkle once every 1.2 s */
  let on = 0, prev = 0;
  for (let t = 0; t < 12; t += 0.005) { M.propAnim({ kind: 'stack', x: 10 }, t, -99, false, a); if (a.twinkle > 0 && prev === 0) on++; prev = a.twinkle; }
  assert.ok(on >= 9 && on <= 11, 'twinkles: ' + on);
});

test('rehearsal outline: dashes sit on the rectangle around the prop (the gate frames its board)', () => {
  const sz = M.kindSizes(Course.KINDS);
  for (const o of [{ x: 1000, w: 30, h: 58, kind: 'low' }, { x: 1000, w: 52, h: 100, kind: 'bar' }, { x: 1000, w: 108, h: 0, kind: 'puddle' }]) {
    const r = M.rehearsalRect(o, sz, {}), n = M.dashCount(r), d = {};
    assert.ok(n >= 4);
    for (let i = 0; i < n; i++) {
      M.dashAt(r, i, 0.14, d);
      const onX = Math.abs(d.x - r.x0) < 1e-9 || Math.abs(d.x - r.x1) < 1e-9, onY = Math.abs(d.y - r.y0) < 1e-9 || Math.abs(d.y - r.y1) < 1e-9;
      assert.ok(onX || onY, 'dash on an edge');
      assert.ok(d.x >= r.x0 - 1e-9 && d.x <= r.x1 + 1e-9 && d.y >= r.y0 - 1e-9 && d.y <= r.y1 + 1e-9);
    }
    if (o.kind === 'bar') { near(r.y0, 0.34); near(r.y1, 1.06); }
    if (o.kind === 'low') near(r.y1, 0.64);
  }
});

/* ---------------- LEDs, marquee, timelines: never faster than 2 Hz ---------------- */
test('LEDs: x1 unlit, x2 cyan, x3 pink, dark after a bump, FEVER rainbow chase ≤ 2 Hz (steady under reduced motion)', () => {
  const st = { mult: 1, fever: false, prevMult: 1, prevFever: false, sinceTier: 99, sinceClear: 99, dark: 0, t: 0, reduced: false, petX: 0 }, out = {};
  assert.equal(M.ledAt(5, 10, st, out).hex, M.hexInt(M.COL.LED_OFF));
  st.mult = 2; assert.equal(M.ledAt(5, 10, st, out).hex, M.hexInt(M.COL.NEON_CYAN));
  st.mult = 3; assert.equal(M.ledAt(5, 10, st, out).hex, M.hexInt(M.COL.NEON_PINK));
  st.dark = 0.5; assert.equal(M.ledAt(5, 10, st, out).hex, M.hexInt(M.COL.LED_DARK)); assert.equal(out.glow, 0);
  st.dark = 0; st.fever = true;
  for (let idx = 0; idx < 6; idx++) {
    let changes = 0, prev = null;
    for (let t = 0; t < 5; t += 0.01) { st.t = t; const h = M.ledAt(idx * 0.5, idx, st, out).hex; if (prev !== null && h !== prev) changes++; prev = h; }
    assert.ok(changes <= 10, 'bulb ' + idx + ' changes ' + changes + ' times in 5 s');
  }
  st.reduced = true; const a = M.ledAt(1, 2, Object.assign(st, { t: 0 }), {}).hex, b = M.ledAt(1, 2, Object.assign(st, { t: 3.3 }), {}).hex;
  assert.equal(a, b, 'steady rainbow under reduced motion');
  /* tier chase: bulbs ahead of the 0.4 s front still show the old tier */
  const c = { mult: 3, fever: false, prevMult: 2, prevFever: false, sinceTier: 0.1, sinceClear: 99, dark: 0, t: 0, reduced: false, petX: 0 };
  assert.equal(M.ledAt(10, 20, c, {}).hex, M.hexInt(M.COL.NEON_CYAN));
  assert.equal(M.ledAt(-3, 0, c, {}).hex, M.hexInt(M.COL.NEON_PINK));
});

test('marquee bulbs, cue rings, spill pulses and fans all stay at or under 2 Hz', () => {
  for (let i = 0; i < 14; i++) {
    let changes = 0, prev = null;
    for (let t = 0; t < 10; t += 0.01) { const on = M.marqueeOn(i, t, false); if (prev !== null && on !== prev) changes++; prev = on; }
    assert.ok(changes <= 20, 'bulb ' + i + ': ' + changes + ' changes in 10 s');
    assert.equal(M.marqueeOn(i, 1.23, true), true);
  }
  /* the cue ring pulses at exactly 1 Hz; landed spills at 1.5 Hz */
  near(M.cueRingScale(0.25, false), 1.1); near(M.cueRingScale(1.25, false), 1.1); assert.equal(M.cueRingScale(0.25, true), 1);
  near(M.spillPulse(true, 0, false), M.spillPulse(true, 1 / 1.5, false), 1e-9); assert.equal(M.spillPulse(false, 0.2, false), 1);
  /* fans bob once every 2 beats (≈ 1.07 Hz) */
  const st = { t: 0, excite: 0, ooh: 0, lastHeart: false, fever: false, reduced: false, x: 0 }, p = {};
  let peaks = 0, prevY = 0, rising = false;
  for (let t = 0; t < 10; t += 0.005) {
    st.t = t; M.fanPose(7, st, p);
    if (p.y > prevY) rising = true; else if (rising && p.y < prevY) { peaks++; rising = false; }
    prevY = p.y;
  }
  assert.ok(peaks <= 11, 'fan bob peaks in 10 s: ' + peaks);
  st.reduced = true; M.fanPose(7, st, p); assert.equal(p.y, 0);
  st.ooh = 0.3; M.fanPose(7, st, p); assert.ok(p.wand > 1, 'wands droop on an ooh'); assert.equal(p.paws, -1);
  st.ooh = 0; st.lastHeart = true; st.reduced = false; M.fanPose(7, st, p); assert.equal(p.paws, 1, 'heart paws at the last heart');
  /* 40 % of wands glow in the child's colour */
  let member = 0; for (let k = 0; k < 2000; k++) if (M.fanLook(k, {}).member) member++;
  assert.ok(member > 700 && member < 900, 'member wands ' + member);
});

/* hearts never come back (3 per show), and the HUD draws hearts as ✦-headed wands in the child's
   colour — so where V4.53 played its heal (a Stage Door, the fans) nothing heart- or ✦-shaped
   may appear in the child's colour, or it reads as a heart coming back */
test('three hearts: a CLEAN STAGE, the last-heart fans and door confetti never look like a heart back', () => {
  const atlas = ['sparkle', 'heart', 'note', 'star', 'dot', 'ring', 'rect', 'petal', 'snow', 'bubble', 'puff', 'circle', 'curl', 'diamond', 'plus', 'tri'];
  const { clean, fans } = M.CHEER;
  for (const c of [clean, fans]) {
    assert.ok(atlas.includes(c.cell), c.cell + ' is in the sparkle atlas');
    assert.ok(c.cell !== 'heart' && c.cell !== 'sparkle', 'not a heart, not the wand head ✦: ' + c.cell);
  }
  /* fixed palette colours — never the member colour (which is the HUD wand colour) */
  assert.equal(clean.color, M.COL.STAR_GOLD, 'CLEAN STAGE is points: Star Gold');
  assert.ok(fans.colors.length > 0);
  fans.colors.forEach((h) => assert.match(h, HEX));
  assert.deepEqual(fans.colors, M.FAN_NEON, "the fans cheer in their own neon");
  /* confetti: still 40 % in the child's colour, hearts still fly — just never a member-coloured heart */
  const o = {};
  let memberN = 0, memberHearts = 0, hearts = 0;
  for (let i = 0; i < 120; i++) {
    M.confettiPiece(i, o);
    assert.ok(atlas.includes(o.cell) && M.CONFETTI_CELLS.includes(o.cell), 'piece ' + i + ': ' + o.cell);
    if (o.member) { memberN++; if (o.cell === 'heart' || o.cell === 'sparkle') memberHearts++; }
    if (o.cell === 'heart') { hearts++; assert.equal(o.member, false, 'piece ' + i + ' is a heart, so it is neon'); }
  }
  assert.equal(memberN, 48, '40 % member colour');
  assert.equal(memberHearts, 0);
  assert.ok(hearts >= 12, 'neon hearts still fly: ' + hearts);
  assert.equal(M.confettiPiece(1).cell, 'rect', 'piece 1 (member colour, once a heart) is a rect');
});

test('recycled strips cover their window exactly once (also left of the origin)', () => {
  for (const base of [-7, -1, 0, 3, 41, 1000]) {
    for (const n of [12, 13, 17, 24]) {
      const seen = new Set();
      for (let i = 0; i < n; i++) seen.add(M.ringSlot(i, n, base));
      assert.equal(seen.size, n);
      for (const k of seen) assert.ok(k >= base && k < base + n);
    }
  }
  assert.equal(M.ringBase(10, 2, 4), 3);
});

test('small timelines: hat flight lands at 0.5 s, zips end at their target, curtains close over 1 s', () => {
  const h = M.hatFlight(0, {}); near(h.x, 0); near(h.y, 0); assert.equal(h.attach, false);
  for (let t = 0; t < 0.5; t += 0.01) assert.ok(M.hatFlight(t, {}).y >= 0);
  assert.ok(M.hatFlight(0.2, {}).y > 0.2, 'it pops up');
  assert.equal(M.hatFlight(0.5, {}).attach, true);
  near(M.hatFlight(0.56, {}).settle, 0.5);
  const z = M.zipAt(1, 0, 0, 0, 4, 3, 2, {}); near(z.x, 4); near(z.y, 3); near(z.z, 2); near(z.s, 0.35);
  const z0 = M.zipAt(0, 1, 1, 1, 4, 3, 2, {}); near(z0.x, 1); near(z0.s, 1);
  near(M.curtainK(0, false), 0); near(M.curtainK(0.5, false), 0.5); near(M.curtainK(1, false), 1);
  assert.equal(M.curtainK(0, true), 1);
  assert.equal(M.STICKERS[M.snackSticker(1)], '+3'); assert.equal(M.STICKERS[M.snackSticker(4)], '+12');
  assert.equal(M.STICKERS[M.snackSticker(9)], '+12');
  /* the sticker atlas speaks the v2 copy voice: the bounce row matches the HUD's BOUNCE! */
  const W = require('../world/world-copy.js');
  assert.equal(M.STICKERS[2], 'BOUNCE!');
  M.STICKERS.forEach((t) => assert.deepEqual(W.bannedIn(t), [], 'sticker ' + t));
});

/* ---------------- particles ---------------- */
test('ParticleSim: fixed pool, oldest overwritten, gravity/floor/fade, zero new arrays', () => {
  const sim = new M.ParticleSim(8, 5), xs = sim.x;
  const p = sim.spec;
  Object.assign(p, { x: 0, y: 1, z: 0, vx: 1, vy: 2, vz: 0, g: 10, drag: 0, life: 1, s0: 0.2, s1: 0, a: 1, floor: 0 });
  for (let i = 0; i < 12; i++) sim.emit();
  assert.equal(sim.alive, 8, 'capacity holds');
  assert.equal(sim.next, 12 % 8, 'oldest overwritten');
  for (let i = 0; i < 30; i++) sim.step(1 / 60);
  for (let i = 0; i < 8; i++) { assert.ok(sim.y[i] >= 0, 'floor'); assert.ok(sim.a[i] <= 1); }
  near(sim.size(0), 0.2 * (1 - 0.5), 1e-6);
  for (let i = 0; i < 60; i++) sim.step(1 / 60);
  assert.equal(sim.alive, 0); for (let i = 0; i < 8; i++) assert.equal(sim.a[i], 0);
  assert.equal(sim.x, xs, 'same typed arrays');
  sim.scale = 0.5; p.life = 1;
  assert.equal(M.burst(sim, 10, Math.PI / 2, 1, 2, 0.2, 0), 5, 'quality step: half the particles');
  sim.clear(); assert.equal(sim.alive, 0);
});

/* ---------------- the view's maths over REAL runs ---------------- */
function drive(variant, cfg, pilot) {
  const r = Course.newRound({ sound() {} }, variant, Object.assign({ fan: false }, cfg));
  r.wantEvents = true; r.events = [];
  const j = M.newJuice(), v = M.newVisual(), led = {}, cam = {}, a = M.newPropAnim();
  let frames = 0, maxHold = 0, maxShake = 0, types = new Set(), prevFever = false;
  const st = { mult: 1, fever: false, prevMult: 1, prevFever: false, sinceTier: 99, sinceClear: 99, dark: 0, t: 0, reduced: false, petX: 0 };
  let acc = 0;
  while (!r.done && frames < 60 * 100) {
    acc += 1 / 60;
    while (acc >= STEP) { if (pilot) pilot(r); r.step(STEP, {}); acc -= STEP; if (r.done) break; }
    const s = r.state;
    for (const e of r.events) { M.juiceEvent(j, e, { fever: prevFever, hasHat: true }); types.add(e.type); }
    r.events.length = 0;
    M.juiceStep(j, 1 / 60);
    M.petVisual(s, j, { reduced: false, clock: frames / 60, speed: Course.speedNow(s) / 100 }, v);
    assert.ok(CLIPS.includes(v.clip), 'clip ' + v.clip);
    for (const k of ['t', 'pitch', 'yaw', 'sx', 'sy', 'sz', 'speed']) assert.ok(Number.isFinite(v[k]), k);
    st.mult = Math.min(3, s.mult); st.fever = s.fever; st.dark = j.ledDark; st.t = s.t; st.sinceTier = j.sinceTier; st.sinceClear = j.sinceClear; st.petX = M.petX(s.dist);
    M.ledAt(st.petX + 2, 7, st, led); assert.ok(Number.isInteger(led.hex) && led.glow >= 0 && led.glow <= 1);
    M.juiceCam(j, false, cam); maxShake = Math.max(maxShake, Math.abs(cam.x), Math.abs(cam.y));
    maxHold = Math.max(maxHold, j.hold);
    for (let i = Math.max(0, s.oc - 2); i < Math.min(r.course.obs.length, s.oc + 3); i++) { M.propAnim(r.course.obs[i], s.t, -99, false, a); assert.ok(Number.isFinite(a.sy) && Number.isFinite(a.rot)); }
    prevFever = s.fever;
    frames++;
  }
  return { r, j, types, maxHold, maxShake };
}
test('real runs: every event the logic sends is understood; holds ≤ 80 ms; shake ≤ 0.06 u', () => {
  const show = drive('course_candy', { seed: 7, autoMode: 'showcase' }, r => r.autopilot());
  assert.ok(show.r.state.encoreCleared);
  for (const t of ['takeoff', 'dj', 'land', 'boing', 'clear', 'snack', 'star', 'letter', 'lettersComplete', 'door', 'cleanStage', 'tier', 'fever', 'finish', 'encoreStart', 'encoreEnd'])
    assert.ok(show.types.has(t), 'saw ' + t);
  assert.ok(show.j.events > 300);
  const never = drive('course_snow', { seed: 3 }, null);
  assert.ok(never.r.state.curtain);
  for (const t of ['bump', 'spill', 'curtain']) assert.ok(never.types.has(t), 'saw ' + t);
  assert.ok(never.maxHold <= 0.08 + 1e-9 && never.maxHold > 0);
  assert.ok(never.maxShake <= 0.06 + 1e-9 && never.maxShake > 0);
});

/* ---------------- the ES modules: contract-level static checks ---------------- */
test('the 3D view modules follow CONTRACTS §6 (ES modules on the import-map three, no real lights, no window.THREE)', () => {
  const dir = path.join(__dirname, '..', 'world', 'games');
  const view = fs.readFileSync(path.join(dir, 'pet-course-3d.js'), 'utf8');
  const scene = fs.readFileSync(path.join(dir, 'course-3d-scene.js'), 'utf8');
  const math = fs.readFileSync(path.join(dir, 'course-3d-math.js'), 'utf8');
  assert.match(view, /^import \* as THREE from 'three';$/m);
  assert.match(scene, /^import \* as THREE from 'three';$/m);
  assert.match(view, /export function create\(mid, opts\)/);
  assert.match(view, /SL3D\.lease\('game'/);
  const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/lease\.start\(\)|L\.start\(\)/.test(code(view)), 'the shell drives frames: never lease.start()');
  for (const src of [view, scene, math].map(code)) {
    assert.ok(!/window\.THREE/.test(src), 'never window.THREE');
    assert.ok(!/new THREE\.(PointLight|SpotLight|RectAreaLight)/.test(src), 'no Point/Spot lights');
    assert.ok(!/api\.sound|\.sound\(/.test(src), 'the view plays no sounds (the logic owns them)');
    assert.ok(!/⭐|🌟/.test(src), 'no reward-star glyphs');
  }
  assert.ok(!/document|THREE/.test(math.replace(/\/\*[\s\S]*?\*\//g, '')), 'the maths stays DOM- and THREE-free');
  assert.equal(Course.def.view3d.src, 'world/games/pet-course-3d.js', 'the logic points the shell at this view');
});
