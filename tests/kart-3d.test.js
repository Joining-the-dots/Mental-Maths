'use strict';
/* Neon Grand Prix 3D view — the pure maths in world/games/kart-3d-core.js and the
   module contract of the kart-3d*.js ES modules (no DOM, no WebGL needed). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const C = require('../world/games/kart-3d-core.js');
const KL = require('../world/games/kart-logic.js');
const L = require('../world/world-look.js');
const ART = require('../world/world-art.js').SLWorldArt;

const IDS = Object.keys(KL.TRACKS);
const T = {};
for (const id of IDS) T[id] = KL.buildTrack(id);
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, (msg || '') + ` ${a} vs ${b} (±${eps})`);
const lower = (o) => JSON.parse(JSON.stringify(o).toLowerCase());

/* ---------------- contracts with the logic and the look ---------------- */
test('kart-3d core: mirrors the logic constants, track maths and locked colours', () => {
  assert.equal(C.HW, KL.HW); assert.equal(C.KERB, KL.KERB); assert.equal(C.WALL, KL.WALL); assert.equal(C.VERGE, KL.VERGE);
  assert.equal(C.WW, KL.WW); assert.equal(C.WH, KL.WH); assert.equal(C.JUMP_LEN, KL.PHYS.JUMP_LEN); assert.equal(C.SPIN_T, KL.PHYS.SPIN_T);
  assert.equal(C.BEAT2, KL.BEAT2); assert.deepEqual(C.CHECKS, KL.CHECKS);
  for (const id of IDS) {
    const t = T[id];
    for (const s of [0, 17.5, t.len / 3, t.len - 1, t.len + 40, -55]) {
      const a = C.pointAt(t, s, {}), b = KL.pointAt(t, s, {});
      near(a.x, b.x, 1e-9); near(a.y, b.y, 1e-9); near(a.tx, b.tx, 1e-9); assert.equal(a.i, b.i);
    }
    for (let k = 0; k < 60; k += 7) assert.equal(C.beatPhase(k * 0.13), KL.beatPhase(k * 0.13));
  }
  assert.deepEqual(lower(C.KARTS), lower(ART.KARTS));
  assert.deepEqual(lower(C.PETCOL), lower(ART.PETCOL));
  for (const id of IDS) assert.equal(C.trackLook(id).ground.toLowerCase(), KL.TRACKS[id].grass.toLowerCase(), id + ' ground = the 2D grass');
  assert.equal(C.kartId('kart_nope'), 'kart_red');
  assert.equal(C.kartHex('kart_unicorn'), '#ff8fd0');
});

test('kart-3d core: the light arc copies world-look DAY / SHOW (SOUNDCHECK warms the sun)', () => {
  for (const key of ['hemiSky', 'hemiGround', 'skyTop', 'skyMid', 'skyHorizon', 'seaShallow', 'seaDeep', 'foam', 'fogColor', 'rimColor']) {
    assert.equal(C.DAY[key], L.hex(L.DAY[key]), 'DAY ' + key);
    assert.equal(C.SHOW[key], L.hex(L.SHOW[key]), 'SHOW ' + key);
  }
  for (const key of ['hemiIntensity', 'exposure', 'haloScale', 'haloOpacity', 'rimStrength']) { assert.equal(C.DAY[key], L.DAY[key]); assert.equal(C.SHOW[key], L.SHOW[key]); }
  /* at Showtime the rim takes 40% of the member colour, exactly like the island's presetAt */
  assert.equal(C.arcPreset(1, 'track_loop', {}, '#00B894').rimColor, L.presetAt(1, '#00B894').rimColor);
  assert.equal(C.arcPreset(0.5, 'track_loop', {}, '#00B894').rimColor, L.presetAt(0.5, '#00B894').rimColor);
  assert.equal(C.DAY.sunColor, '#FFE3C0'); assert.equal(C.DAY.sunIntensity, 2.2);
  assert.equal(C.SHOW.sunColor, L.hex(L.SHOW.sunColor));
  const day = C.arcPreset(0, 'track_loop'), half = C.arcPreset(0.5, 'track_loop'), enc = C.arcPreset(1, 'track_loop');
  assert.equal(day.skyTop, C.DAY.skyTop); assert.equal(enc.skyTop, C.SHOW.skyTop);
  assert.equal(day.encore, 0); assert.equal(half.encore, 0); assert.equal(enc.encore, 1);
  assert.equal(C.arcPreset(0.75, 'track_loop').encore, 0.5);
  assert.deepEqual([C.arcK(0), C.arcK(1), C.arcK(2)], [0, 0.5, 1]);
  /* the Volcano Ring has its sunset sky by day */
  assert.equal(C.arcPreset(0, 'track_volcano').skyHorizon, '#FFB38A');
  assert.equal(C.arcPreset(0, 'track_volcano').skyTop, '#A66BFF');
  /* the arc blends over 1.6 s inOutSine, or a 0.25 s crossfade under reduced motion */
  near(C.arcBlend(0, 1, 0.8, false), 0.5, 1e-9); near(C.arcBlend(0, 1, 1.6, false), 1, 1e-9);
  near(C.arcBlend(0, 1, 0.125, true), 0.5, 1e-9); near(C.arcBlend(0, 1, 0.3, true), 1, 1e-9);
});

/* ---------------- mapping and maths ---------------- */
test('kart-3d core: logic → world mapping, yaw, shortest-arc angles and smoothing', () => {
  assert.equal(C.wx(1152), 0); assert.equal(C.wz(648), 0); assert.equal(C.wx(1192), 1); assert.equal(C.wz(608), -1);
  /* models face +z: rotation.y = π/2 − h turns +z onto the logic heading */
  for (const h of [0, 0.7, -2.1, Math.PI]) {
    const yaw = C.yawOf(h);
    near(Math.sin(yaw), Math.cos(h), 1e-12); near(Math.cos(yaw), Math.sin(h), 1e-12);
    near(C.wrapAngle(C.yawDir(Math.cos(h), Math.sin(h)) - yaw), 0, 1e-12);
  }
  near(C.lerpAngle(3.1, -3.1, 0.5), Math.PI, 1e-3, 'across ±π the short way');
  near(C.lerpAngle(0.2, 0.6, 0.25), 0.3, 1e-12);
  near(C.damp(8, 0), 0, 1e-12); near(C.damp(8, 1 / 60), 1 - Math.exp(-8 / 60), 1e-12); assert.ok(C.damp(5, 10) > 0.999);
  near(C.outBack(1), 1, 1e-9); near(C.outBack(0), 0, 1e-9); assert.equal(C.arc(0.5), 1);
  /* colours: linear-light conversion for vertex colours */
  near(C.srgbToLinear(1), 1, 1e-12); near(C.srgbToLinear(0.5), 0.214, 1e-3);
  assert.equal(C.mixHex('#000000', '#FFFFFF', 0.5), '#808080');
});

/* ---------------- the ribbon ---------------- */
test('kart-3d core: the ribbon is one closed, upward-facing mesh with alternating 1 u kerbs', () => {
  for (const id of IDS) {
    const t = T[id], rib = C.buildRibbon(t, { verge: C.trackLook(id).verge });
    const P = rib.position, N = rib.normal, Co = rib.color;
    assert.equal(P.length, N.length); assert.equal(P.length, Co.length); assert.equal(P.length % 9, 0);
    assert.ok(rib.tris <= 8000, id + ' ribbon ≤ 8k tris (' + rib.tris + ')');
    for (let i = 0; i < P.length; i++) assert.ok(Number.isFinite(P[i]) && Number.isFinite(Co[i]));
    for (let i = 0; i < P.length; i += 9) {
      const ax = P[i], az = P[i + 2], bx = P[i + 3], bz = P[i + 5], cx = P[i + 6], cz = P[i + 8];
      assert.ok((bz - az) * (cx - ax) - (bx - ax) * (cz - az) >= -1e-9, id + ' every triangle faces up');
    }
    const ys = new Set();
    for (let i = 1; i < P.length; i += 3) ys.add(P[i]);
    for (const y of ys) assert.ok(Object.values(C.RIB_Y).map(Math.fround).includes(y), 'height ' + y);
    assert.equal(rib.kerbBlocks % 2, 0, 'an even number of kerb blocks so colours alternate all the way round');
    near(t.len / rib.kerbBlocks, C.U, C.U * 0.06, id + ' kerb blocks ≈ 1 u');
    /* every vertex sits within the wall line of the centreline */
    const box = C.bbox(t);
    for (let i = 0; i < P.length; i += 3) {
      assert.ok(P[i] >= C.wx(box.x0 - C.WALL) - 0.01 && P[i] <= C.wx(box.x1 + C.WALL) + 0.01);
      assert.ok(P[i + 2] >= C.wz(box.y0 - C.WALL) - 0.01 && P[i + 2] <= C.wz(box.y1 + C.WALL) + 0.01);
    }
  }
  const lin = C.linearRgb('#5B5670');
  assert.ok(lin.every((v) => v > 0 && v < 0.2), 'asphalt in linear light');
});

test('kart-3d core: tyre walls stand only on their own stretch, ≤ 95 per mesh, alternating', () => {
  for (const id of IDS) {
    const t = T[id], st = C.wallStacks(t);
    const tyres = st.filter((s) => s.kind === 'tyre').length, foams = st.length - tyres;
    assert.ok(tyres <= 95 && foams <= 95, id + ' ' + tyres + '/' + foams);
    assert.ok(st.length > t.n / 4, id + ' walls go all the way round');
    for (const s of st) {
      assert.ok(C.clearance(t, s.x, s.y, s.i, 14) >= C.HW + C.KERB + 24, id + ' stack off another stretch');
      near(Math.hypot(s.x - t.pts[s.i][0], s.y - t.pts[s.i][1]), C.STACK_OFF, 1e-6);
      assert.ok(s.ci >= 0 && s.ci < 3);
    }
    const i0 = C.nearestStack(st, st[3].x + 3, st[3].y - 2);
    assert.equal(i0, 3);
  }
  /* the bump wobble: 1 → 0.9 → 1.05 → 1 over 0.3 s */
  assert.equal(C.wobbleScale(0), 1); near(C.wobbleScale(0.1), 0.9, 1e-9); near(C.wobbleScale(0.2), 1.05, 1e-9); assert.equal(C.wobbleScale(0.3), 1);
});

/* ---------------- layout: gates, stand, podium, scenery, set-pieces ---------------- */
test('kart-3d core: gates match the 2D art; the stand and podium have room', () => {
  for (const id of IDS) {
    const t = T[id], g = C.gateSpots(t);
    assert.equal(g.length, 3);
    g.forEach((s, k) => {
      let idx = 0; while (idx < t.n - 1 && t.cum[idx] < C.CHECKS[k] * t.len) idx++;
      assert.equal(s.i, idx); assert.equal(s.n, k + 1);
    });
    const gs = C.grandstandSpot(t);
    assert.ok(gs && gs.clear, id + ' stand has a clear spot');
    assert.ok(C.clearance(t, gs.x, gs.y, null, 0) >= 4.5 * C.U, id + ' stand keeps off the track');
    const ps = C.podiumSpot(t);
    assert.ok(KL.nearest(t, ps.x, ps.y, null).d < t.spacing, 'the podium stands on the finish straight');
    near(ps.x, KL.pointAt(t, 7 * C.U, {}).x, 1e-9);
    assert.ok(ps.face === 1 || ps.face === -1);
    assert.equal(ps.face, C.infieldSide(t));
  }
  /* the island rectangle contains the whole track with room for the stand */
  for (const id of IDS) {
    const t = T[id], rect = C.islandRect(t);
    for (const p of t.pts) assert.ok(C.islandSdf(rect, C.wx(p[0]), C.wz(p[1])) < -C.WALL / C.U - 3);
  }
});

test('kart-3d core: scenery scatter is the 2D art\'s deterministic positions, clear of the track', () => {
  for (const id of IDS) {
    const t = T[id], rect = C.islandRect(t);
    const a = C.scatter(t, 16, { rect }), b = C.scatter(t, 16, { rect });
    assert.deepEqual(a, b);
    for (const p of a) {
      assert.equal(p.x, (p.i * 619) % C.WW); assert.equal(p.y, (p.i * 373) % C.WH);
      for (let q = 0; q < t.n; q += 4) assert.ok(Math.hypot(t.pts[q][0] - p.x, t.pts[q][1] - p.y) >= C.WALL + 60);
      assert.ok(C.islandSdf(rect, C.wx(p.x), C.wz(p.y)) <= -1.2, 'on the island');
    }
  }
  const t = T.track_loop, res = C.scatter(t, 40, { reserved: [{ x: 1152, y: 648, r: 2000 }] });
  assert.equal(res.length, 0, 'reserved zones are skipped');
});

test('kart-3d core: set-pieces — glow tunnel, crystal chicane + volcano, dolphin pals', () => {
  const loop = T.track_loop, arches = C.tunnelArches(loop, loop.feat.setPiece);
  assert.equal(arches.length, 8);
  const gates = [0].concat(C.CHECKS.map((f) => f * loop.len));
  for (const a of arches) for (const g of gates) { const d = Math.abs(a.s - g) % loop.len; assert.ok(Math.min(d, loop.len - d) >= 2 * C.U - 1e-6); }
  for (let k = 1; k < arches.length; k++) assert.ok(arches[k].s > arches[k - 1].s, 'in order along the straight');
  const vol = T.track_volcano, gems = C.crystalSpots(vol, vol.feat.setPiece);
  assert.equal(gems.length, 8);
  for (const g of gems) assert.ok(C.clearance(vol, g.x, g.y, null, 0) >= C.WALL + 0.5 * C.U);
  const vf = C.volcanoFit(vol);
  assert.ok(vf.r <= C.VOLCANO.r && vf.r >= 1.2);
  assert.ok(C.clearance(vol, vf.x, vf.y, null, 0) >= C.WALL + vf.r * C.U, 'the volcano never reaches a wall');
  const beach = T.track_beach, rect = C.islandRect(beach), pods = C.dolphinSpots(beach, rect);
  assert.equal(pods.length, 3);
  for (const p of pods) assert.ok(C.islandSdf(rect, C.wx(p.x), C.wz(p.y)) > 2, 'dolphins swim in the sea');
  /* one arch lit per beat, in sequence (each arch 0.29 Hz) */
  const lit = [];
  for (let b = 0; b < 16; b++) lit.push([0, 1, 2, 3, 4, 5, 6, 7].filter((k) => C.tunnelLit(k, 8, (b + 0.5) * 60 / 140)));
  assert.ok(lit.every((l) => l.length === 1));
  assert.deepEqual(lit.slice(0, 9).map((l) => l[0]), [0, 1, 2, 3, 4, 5, 6, 7, 0]);
});

/* ---------------- heights ---------------- */
test('kart-3d core: the Stage Jump ramp and flight heights are continuous', () => {
  for (const id of IDS) {
    const J = T[id].feat.jump, c = Math.cos(J.ang), s = Math.sin(J.ang);
    assert.equal(C.rampHeight(J, J.x - c * 70, J.y - s * 70), 0, 'before the ramp');
    near(C.rampHeight(J, J.x - c * 32, J.y - s * 32), C.RAMP_H / 2, 1e-9, 'halfway up');
    near(C.rampHeight(J, J.x - c * 0.001, J.y - s * 0.001), C.RAMP_H, 1e-4, 'the lip');
    assert.equal(C.rampHeight(J, J.x + c * 5, J.y + s * 5), 0, 'past the lip');
    assert.equal(C.rampHeight(J, J.x - c * 30 - s * 80, J.y - s * 30 + c * 80), 0, 'off to the side');
    /* take-off from the lip and landing back at 0 */
    near(C.kartHeight(J, J.x, J.y, { on: true, t: 0, dur: 0.6 }, 0), C.RAMP_H, 1e-9);
    near(C.kartHeight(J, J.x, J.y, { on: true, t: 0.6, dur: 0.6 }, 0), 0, 1e-9);
    assert.ok(C.kartHeight(J, J.x, J.y, { on: true, t: 0.3, dur: 0.6 }, 20) > 0.5);
    /* rivals: up the ramp, then the logic's hop */
    const len = T[id].len;
    near(C.rivalHeight(J.s, len, J.s - 32, 0), C.RAMP_H / 2, 1e-9);
    near(C.rivalHeight(J.s, len, J.s + 0.01, 0), C.RAMP_H, 1e-3);
    assert.equal(C.rivalHeight(J.s, len, J.s + 400, 0), 0);
    assert.equal(C.rivalHeight(null, len, 0, 40), 1);
  }
});

/* ---------------- cameras ---------------- */
test('kart-3d core: chase / stage / high / TV rigs, the crane, push-in, orbit and shake', () => {
  assert.deepEqual(C.CAM_ORDER, ['chase', 'stage', 'map', 'tv']);
  let m = 'chase';
  const seen = [];
  for (let i = 0; i < 4; i++) { m = C.nextCam(m); seen.push(m); }
  assert.deepEqual(seen, ['stage', 'map', 'tv', 'chase']);
  assert.equal(C.camMode('nope'), 'chase');
  const o = C.camDesired('chase', 2, 0, 3, 0, 0, 0, {});
  /* yaw 0 faces +z: the camera sits 7.5 u behind (−z), 6.5 u up, looking 4 u ahead */
  near(o.px, 2, 1e-9); near(o.pz, 3 - 7.5, 1e-9); near(o.py, 6.5, 1e-9); near(o.lz, 3 + 4, 1e-9); assert.equal(o.fov, 50);
  const b = C.camDesired('chase', 2, 0, 3, 0, 1, 1, {});
  near(b.pz, 3 - 8.1, 1e-9, 'boost sits 0.6 u further back'); assert.equal(b.fov, 57); near(b.py, 7.3, 1e-9, 'jump lifts 0.8 u');
  const st = C.camDesired('stage', 0, 0, 0, 0, 1, 0, {});
  assert.equal(st.fov, 62); near(st.py, 3.4, 1e-9);
  const mp = C.camDesired('map', 5, 0, 5, 1.3, 1, 1, {});
  near(mp.px, 5, 1e-9); near(mp.pz, 15, 1e-9); near(mp.py, 28, 1e-9); assert.equal(mp.fov, 40, 'High cam is north-up with no kick');
  const cr0 = C.craneAt(0, 0, 0, 0, o, {}), cr1 = C.craneAt(1, 0, 0, 0, o, {});
  assert.ok(cr0.py > 10, 'the crane starts high over the gantry');
  for (const k of ['px', 'py', 'pz', 'lx', 'ly', 'lz', 'fov']) near(cr1[k], o[k], 1e-9, 'the crane lands on the chase spot: ' + k);
  near(C.pushIn(0.3), -4, 1e-9); near(C.pushIn(0.7), 0, 1e-12); near(C.pushIn(0), 0, 1e-12);
  near(C.orbitAngle(2.2), Math.PI / 2, 1e-9); near(C.orbitAngle(0), 0, 1e-12);
  near(C.shakeAmp(0), 0.06, 1e-9); assert.equal(C.shakeAmp(0.2), 0);
  /* the boost FOV eases in over 0.25 s and out over 0.6 s */
  let k = 0; for (let i = 0; i < 15; i++) k = C.boostEase(k, true, 1 / 60); near(k, 1, 1e-9);
  for (let i = 0; i < 18; i++) k = C.boostEase(k, false, 1 / 60); near(k, 0.5, 1e-9);
});

test('kart-3d core: TV posts sit beside the track and the cut always picks the next one ahead', () => {
  for (const id of IDS) {
    const t = T[id], posts = C.tvPosts(t);
    assert.ok(posts.length >= 4);
    for (const p of posts) assert.ok(C.clearance(t, p.x, p.y, null, 0) > C.HW + C.KERB, 'off the asphalt');
    for (const s of [0, t.len * 0.3, t.len * 0.77, t.len - 1]) {
      const p = posts[C.tvPick(posts, s, t.len)], d = ((p.s - s) % t.len + t.len) % t.len;
      assert.ok(d >= 1.5 * C.U - 1e-6 && d <= t.len / posts.length + 1.5 * C.U + 1e-6, id + ' next post ahead');
    }
  }
});

/* ---------------- view-only kart animation ---------------- */
test('kart-3d core: squash, spin-out and roll timelines end at rest', () => {
  for (const kind of ['hop', 'land', 'bump']) {
    const end = C.squashAt(kind, 5, {});
    assert.equal(end.sy, 1); assert.equal(end.sxz, 1);
  }
  near(C.squashAt('hop', 0.08, {}).sy, 0.8, 1e-9); near(C.squashAt('hop', 0.08, {}).sxz, 1.12, 1e-9);
  near(C.squashAt('land', 0.07, {}).sy, 0.75, 1e-9); near(C.squashAt('bump', 0.06, {}).sxz, 0.85, 1e-9);
  const mid = C.spinPose(0.4, {}), end = C.spinPose(1e-9, {}), none = C.spinPose(0, {});
  assert.ok(mid.hop > 0.2 && mid.turn > 0);
  near(end.turn, 4 * Math.PI, 1e-6, '2 visual turns end facing forward (the logic\'s mercy)');
  assert.equal(none.turn, 0); assert.equal(none.hop, 0);
  near(C.bodyRoll(2.9, false), 6 * Math.PI / 180, 1e-12); near(C.bodyRoll(-99, true), -10 * Math.PI / 180, 1e-12);
  assert.equal(C.crowdSway(0.3, 0.1, true), 0);
  near(Math.abs(C.crowdSway(0.25, 0, false)), 15 * Math.PI / 180, 1e-12);
  assert.equal(C.waveLift(0.5, 0.2), 0); near(C.waveLift(0.5, 0.8), 1, 1e-9); assert.equal(C.waveLift(0.5, null), 0);
});

test('kart-3d core: a rival goes see-through only when it would block the view', () => {
  assert.equal(C.occludes(0, 6, -8, 0, 0.4, 0, 0, 3.0, -4, 0.7), true, 'right between the camera and you');
  assert.equal(C.occludes(0, 6, -8, 0, 0.4, 0, 0.5, 3.2, -4, 0.7), true, 'close to the sight line');
  assert.equal(C.occludes(0, 6, -8, 0, 0.4, 0, 3, 0, -3.5, 0.7), false, 'off to the side');
  assert.equal(C.occludes(0, 6, -8, 0, 0.4, 0, 0, 0.4, 2, 0.7), false, 'ahead of you');
  assert.equal(C.occludes(0, 6, -8, 0, 0.4, 0, 0.3, 0.5, 0.3, 0.7), true, 'within 0.6 u of your kart');
});

/* ---------------- photosensitivity: nothing flashes faster than 2 Hz ---------------- */
test('kart-3d core: every periodic visual stays ≤ 2 Hz (luminance pulses ≤ 1.17 Hz)', () => {
  assert.ok(C.PULSES.length >= 10);
  for (const p of C.PULSES) {
    assert.ok(p.hz > 0 && p.hz <= 2, p.name + ' ' + p.hz);
    if (p.luminance) assert.ok(p.hz <= 140 / 120 + 1e-9, p.name + ' luminance ' + p.hz);
  }
  /* the chevron cross-fade repeats every half-time beat (0.857 s) and peaks pink mid-lit */
  near(C.chevronMix(0.25), 1, 1e-12); near(C.chevronMix(0.75), 0, 1e-12);
  for (let t = 0; t < 3; t += 0.37) near(C.chevronMix(C.beatPhase(t)), C.chevronMix(C.beatPhase(t + C.BEAT2)), 1e-9);
  for (let t = 0; t < 3; t += 0.29) near(C.bulbChase(3, 14, t), C.bulbChase(3, 14, t + C.BEAT2), 1e-9);
});

/* ---------------- HUD strings ---------------- */
test('kart-3d core: HUD strings, the Hype Wand, the LED board and the pop-word limiter', () => {
  assert.equal(C.placeText(3, 6), 'P3/6');
  assert.equal(C.gapText(0.83, 3), '+0.8 s to P2'); assert.equal(C.gapText(0.5, 1), ''); assert.equal(C.gapText(null, 4), '');
  assert.deepEqual(C.splitText('🥇', -0.421), { text: '🥇 −0.42', ahead: true });
  assert.deepEqual(C.splitText('', 0.31), { text: '+0.31', ahead: false });
  assert.equal(C.wandPips(0, 0), 0); assert.equal(C.wandPips(24, 0), 4); assert.equal(C.wandPips(40, 0), 8); assert.equal(C.wandPips(99, 0), 8);
  assert.equal(C.wandPips(10, 6, 6), 8, 'Spotlight: full wand'); assert.equal(C.wandPips(10, 2.9, 6), 4, 'draining over the 6 s'); assert.equal(C.wandPips(10, 0.01, 6), 1);
  assert.equal(C.ledText({ lap: 1, laps: 3, place: 3 }), 'NEON GRAND PRIX · LAP 2/3 · P3');
  assert.equal(C.ledText({ lap: 3, laps: 3, place: 0 }), 'NEON GRAND PRIX · LAP 3/3');
  assert.equal(C.ledText({ override: 'GO!', lap: 0, laps: 3, place: 6 }), 'GO!');
  assert.equal(C.finishLed(2, 52410), 'P2 · 0:52.41'); assert.equal(C.finishLed(0, 61000), 'FINISH · 1:01.00');
  for (const ms of [0, 999, 52410, 59999, 60000, 125432]) assert.equal(C.fmtMs(ms), KL.fmt(ms));
  const lim = new C.WordLimiter(2, 0.9);
  assert.equal(lim.push(0), true); assert.equal(lim.push(0.1), true); assert.equal(lim.push(0.2), false, 'never more than 2 on screen');
  assert.equal(lim.push(0.95), true);
  for (const k of Object.keys(C.WORDS)) assert.ok(C.WORDS[k].text && typeof C.WORDS[k].big === 'boolean');
  for (const id of IDS) {
    const mm = C.minimap(T[id], 150);
    assert.match(mm.d, /^M[\d.]+ [\d.]+(L[\d.]+ [\d.]+)+Z$/);
    assert.equal(mm.w, 150); assert.equal(mm.h, Math.round(C.WH * 150 / C.WW));
  }
});

test('kart-3d core: particle budgets and emission maths', () => {
  assert.deepEqual([C.particleCap('LOW'), C.particleCap('MID'), C.particleCap('HIGH')], [128, 256, 512]);
  assert.equal(C.particleCap('MID', 0.5), 128, 'the adaptive particle step halves the pool');
  assert.equal(C.emitCount(20, true), 8, 'reduced motion cuts particles by 60%'); assert.equal(C.emitCount(20, false), 20); assert.equal(C.emitCount(0, false), 0);
  let carry = 0, total = 0;
  const out = {};
  for (let i = 0; i < 60; i++) { C.due(14, 1 / 60, carry, out); carry = out.carry; total += out.n; }
  assert.ok(total === 13 || total === 14, 'a 14/s rate over 1 s');
  assert.deepEqual(C.SPARK_RATE.slice(1), [8, 14, 20]);
});

/* ---------------- the ES modules ---------------- */
const MODS = ['kart-3d.js', 'kart-3d-kit.js', 'kart-3d-env.js', 'kart-3d-track.js', 'kart-3d-models.js', 'kart-3d-fx.js', 'kart-3d-hud.js'];
test('kart-3d modules: the view contract — create(), THREE only from the import map, no logic writes', () => {
  const view = read('world/games/kart-3d.js');
  assert.match(view, /^import \* as THREE_NS from 'three';$/m, 'THREE comes from the import map');
  assert.match(view, /export async function create\(mid, opts\)/);
  assert.match(view, /export const createKartView = create;/);
  assert.match(view, /SL3D\.lease\('game', handlers\)/, 'renders through the shared renderer lease');
  assert.doesNotMatch(view.replace(/\/\*[\s\S]*?\*\//g, ''), /\bL\.start\(\)/, 'never starts the lease loop (the shell drives frames)');
  assert.match(view, /L\.release\(\)/);
  for (const f of MODS) {
    const src = read('world/games/' + f);
    assert.doesNotMatch(src, /window\.THREE/, f + ' never touches window.THREE');
    assert.doesNotMatch(src, /\b(PointLight|SpotLight|RectAreaLight)\b/, f + ' has no point / spot lights');
    assert.doesNotMatch(src, /Math\.random\(/, f + ' is deterministic');
    assert.doesNotMatch(src, /\b(s|state|rs|race|k|pr|round)\.[a-zA-Z_]+\s*(=|\+=|-=|\+\+|--)(?!=)/, f + ' never assigns to round / race state');
    if (f !== 'kart-3d.js') assert.doesNotMatch(src, /from 'three'|import\('three'\)/, f + ' takes THREE from its caller');
    const imports = [...src.matchAll(/import\('\.\/([^']+?)' \+ Q\)/g)].map((m) => m[1]);
    for (const m of imports) assert.ok(fs.existsSync(path.join(__dirname, '../world/games', m)), 'imports ' + m);
  }
  assert.equal(require('../world/games/kart.js').def.view3d.src, 'world/games/kart-3d.js');
});

test('kart-3d modules: the helper modules import in Node and export their builders', async () => {
  const want = {
    'kart-3d-kit.js': ['makeKit'], 'kart-3d-env.js': ['buildEnv'], 'kart-3d-track.js': ['buildTrack'],
    'kart-3d-models.js': ['makePlayer', 'makeRivals', 'makePacers', 'makeAvatar'], 'kart-3d-fx.js': ['makeFx'], 'kart-3d-hud.js': ['makeHud']
  };
  for (const [f, names] of Object.entries(want)) {
    const m = await import(pathToFileURL(path.join(__dirname, '../world/games', f)).href);
    for (const n of names) assert.equal(typeof m[n], 'function', f + ' exports ' + n);
  }
});
