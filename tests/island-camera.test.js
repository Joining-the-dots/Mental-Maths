'use strict';
/* My Island 3D — the camera rig and gesture recognizer (world/island3d/camera.js) */
const test = require('node:test');
const assert = require('node:assert/strict');
const Cam = require('../world/island3d/camera.js');
const G = require('../world/island3d/grid3d.js');
const M = require('../world/island3d/motion.js');

const LANDS = [['home'], ['home', 'cove'], ['home', 'meadow'], ['home', 'cove', 'meadow']];
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
function settle(rig, sec = 3, dt = 1 / 60) { for (let t = 0; t < sec; t += dt) rig.update(dt); return rig; }
function rigWith(o = {}) {
  const r = new Cam.Rig(Object.assign({ aspect: 16 / 9, land: ['home'] }, o));
  if (o.w) r.resize(o.w, o.h);
  r.update(0);
  return r;
}
function corners(land) {
  const b = Cam.boundsOf(land), out = [];
  for (const x of [b.minX, b.maxX]) for (const y of [b.bottom, b.top]) for (const z of [b.minZ, b.maxZ]) out.push({ x, y, z });
  return out;
}

/* ---------------- framing ---------------- */
test('camera: fitDist is the allocation-free twin of SLGrid3D.fitCamera', () => {
  for (const land of LANDS) for (const aspect of [0.5, 0.8, 1, 16 / 9, 2.4]) for (const yaw of [-35, -10, 0, 20, 35]) for (const elev of [40, 52, 62, 67]) {
    const want = G.fitCamera({ land, aspect, yaw, elev }).dist;
    const got = Cam.fitDist(Cam.boundsOf(land), yaw, elev, aspect);
    assert.ok(near(want, got, 1e-9), `${land} ${aspect} ${yaw} ${elev}: ${want} vs ${got}`);
  }
});

test('camera: the default view frames every unlocked-land corner inside NDC ±0.94', () => {
  for (const land of LANDS) for (const aspect of [0.5, 0.8, 1.333, 16 / 9, 2.4]) {
    const r = new Cam.Rig({ aspect, land });
    r.update(0);
    const p = r.pose;
    assert.equal(p.yaw, 0); assert.equal(p.elev, 52); assert.equal(p.zoom, 1);
    const fit = G.fitCamera({ land, aspect, yaw: 0, elev: 52 });
    assert.ok(near(p.tx, fit.target.x) && near(p.tz, fit.target.z), 'target = land centre');
    assert.ok(near(p.dist, fit.dist, 1e-9));
    for (const c of corners(land)) {
      const n = Cam.projectPose(c, p);
      assert.ok(n.depth > 0, 'in front');
      assert.ok(Math.abs(n.x) <= 0.94 + 1e-9 && Math.abs(n.y) <= 0.94 + 1e-9, `${land} ${aspect}: ${n.x}, ${n.y}`);
    }
  }
});

test('camera: projectPose agrees with SLGrid3D.project and groundAt inverts it', () => {
  const r = rigWith({ w: 800, h: 450 });
  r.orbitBy(20, 8); r.zoomBy(1.3); settle(r);
  const p = r.pose, cam = { position: { x: p.px, y: p.py, z: p.pz }, target: { x: p.tx, y: p.ty, z: p.tz }, fov: p.fov, aspect: p.aspect };
  for (const q of [{ x: 0, y: 0, z: 0 }, { x: -3.5, y: 0.45, z: 1.5 }, { x: 4, y: 2, z: -2 }]) {
    const a = Cam.projectPose(q, p), b = G.project(q, cam);
    assert.ok(near(a.x, b.x, 1e-9) && near(a.y, b.y, 1e-9) && near(a.depth, b.depth, 1e-9));
    const g = r.groundAt(a.x, a.y, q.y);
    assert.ok(g && near(g.x, q.x, 1e-6) && near(g.z, q.z, 1e-6), 'round trip');
  }
  assert.equal(r.groundAt(0, 8, 0), null, 'above the horizon');
});

/* ---------------- clamps ---------------- */
test('camera: yaw ±35°, elevation 40–67°, zoom 0.75–1.6 (2.2 on portrait phones)', () => {
  const r = rigWith();
  r.orbitBy(500, 500);
  assert.equal(r.goal.yaw, 35); assert.equal(r.goal.elev, 67);
  r.orbitBy(-900, -900);
  assert.equal(r.goal.yaw, -35); assert.equal(r.goal.elev, 40);
  r.zoomBy(100); assert.equal(r.goal.zoom, 1.6);
  assert.equal(r.zoomBy(2), false, 'no change at the limit');
  r.zoomBy(0.001); assert.equal(r.goal.zoom, 0.75);
  const phone = rigWith({ touch: true, aspect: 0.8 });
  assert.equal(phone.zoomMax(), 2.2);
  phone.zoomBy(100); assert.equal(phone.goal.zoom, 2.2);
  assert.equal(rigWith({ touch: false, aspect: 0.8 }).zoomMax(), 1.6, 'a narrow desktop window is not a phone');
  assert.equal(rigWith({ touch: true, aspect: 1.5 }).zoomMax(), 1.6, 'a landscape tablet keeps 1.6');
  assert.ok(Cam.isPhone(true, 0.6) && !Cam.isPhone(true, 1.2) && !Cam.isPhone(false, 0.6));
});

test('camera: panning is clamped to the land, tighter when zoomed out', () => {
  const r = rigWith({ w: 800, h: 450 });
  r.panBy(-50000, 50000);
  const b = Cam.boundsOf(['home']);
  const lim1 = Cam.panLimit(b, 1);
  assert.ok(near(Math.abs(r.goal.tx - r.home.tx), lim1.x, 1e-9) && near(Math.abs(r.goal.tz - r.home.tz), lim1.z, 1e-9));
  assert.ok(near(lim1.x, Cam.LIMITS.panSlack) && near(lim1.z, Cam.LIMITS.panSlack), 'only the slack at zoom 1');
  r.zoomBy(1.6); r.panBy(-50000, 50000);
  const lim2 = Cam.panLimit(b, 1.6);
  assert.ok(lim2.x > lim1.x && near(Math.abs(r.goal.tx - r.home.tx), lim2.x, 1e-9));
  r.zoomBy(1 / 1.6);
  assert.ok(Math.abs(r.goal.tx - r.home.tx) <= lim1.x + 1e-9, 'zooming back out pulls the target home');
});

test('camera: a pan moves the content with the finger at the target depth', () => {
  for (const yaw of [-30, 0, 25]) for (const elev of [42, 52, 62]) {
    const r = rigWith({ w: 800, h: 450, reduced: true });
    r.zoomBy(1.6); r.orbitBy(yaw, elev - 52); r.update(0);
    const P = { x: r.pose.tx, y: r.pose.ty, z: r.pose.tz };
    const before = Cam.projectPose(P, r.pose);
    r.panBy(12, -9); r.update(0);
    const after = Cam.projectPose(P, r.pose);
    const dxPx = (after.x - before.x) / 2 * 800, dyPx = -(after.y - before.y) / 2 * 450;
    assert.ok(near(dxPx, 12, 0.35) && near(dyPx, -9, 0.35), `${yaw}/${elev}: ${dxPx}, ${dyPx}`);
  }
});

test('camera: zooming toward a focus point keeps that point fixed on screen', () => {
  const r = rigWith({ w: 800, h: 450, reduced: true });
  r.orbitBy(15, 5); r.update(0);
  const f = r.groundAt(0.3, -0.2, Cam.TARGET_Y);       /* focus points sit at the target height */
  const n0 = Cam.projectPose(f, r.pose);
  assert.ok(r.zoomBy(1.35, f)); r.update(0);
  const n1 = Cam.projectPose(f, r.pose);
  assert.ok(near(n0.x, n1.x, 1e-6) && near(n0.y, n1.y, 1e-6));
});

/* ---------------- modes ---------------- */
test('camera: edit and place tilt to yaw 0 / 62° (no orbit) and restore the play view', () => {
  const r = rigWith();
  r.orbitBy(20, 6); r.zoomBy(1.2);
  settle(r);
  const before = { yaw: r.goal.yaw, elev: r.goal.elev, zoom: r.goal.zoom };
  r.setMode('edit');
  assert.equal(r.goal.yaw, 0); assert.equal(r.goal.elev, 62);
  assert.equal(r.canOrbit(), false);
  r.orbitBy(30, 0); assert.equal(r.goal.yaw, 0, 'orbit is locked while editing');
  settle(r, 0.4);
  assert.ok(Math.abs(r.cur.elev - 62) < 0.6 && Math.abs(r.cur.yaw) < 0.5, 'eased over ~0.4 s');
  r.setMode('place');
  assert.equal(r.goal.zoom, before.zoom, 'a desktop does not zoom in for place mode');
  r.setMode('play');
  assert.deepEqual({ yaw: r.goal.yaw, elev: r.goal.elev, zoom: r.goal.zoom }, before);
  const phone = rigWith({ touch: true, aspect: 0.75 });
  phone.setMode('place');
  assert.equal(phone.goal.zoom, 1.4, 'place mode on phones zooms to 1.4×');
  const drag = rigWith({ touch: true, aspect: 0.75 });
  drag.setMode('edit'); drag.setMode('place', { keepZoom: true });
  assert.equal(drag.goal.zoom, 1, 'a drag carrying an item into place mode keeps the zoom');
});

test('camera: reset and commands', () => {
  const r = rigWith();
  assert.ok(r.command('right')); assert.equal(r.goal.yaw, 15);
  r.command('left'); r.command('left'); assert.equal(r.goal.yaw, -15);
  r.command('up'); assert.equal(r.goal.elev, 57);
  r.command('in'); assert.ok(near(r.goal.zoom, 1.25));
  r.command('out'); assert.ok(near(r.goal.zoom, 1));
  assert.equal(r.command('nope'), false);
  r.command('reset');
  assert.deepEqual([r.goal.yaw, r.goal.elev, r.goal.zoom, r.goal.tx, r.goal.tz], [0, 52, 1, r.home.tx, r.home.tz]);
});

/* ---------------- motion ---------------- */
test('camera: the view eases toward the goal; reduced motion cuts', () => {
  const r = rigWith();
  r.orbitBy(30, 0);
  r.update(1 / 60);
  assert.ok(r.cur.yaw > 0 && r.cur.yaw < 30, 'eases');
  assert.ok(near(r.cur.yaw, 30 * Cam.damp(1 / 60, 0.12)));
  settle(r);
  assert.equal(r.cur.yaw, 30);
  const red = rigWith({ reduced: true });
  red.orbitBy(30, 0); red.update(1 / 60);
  assert.equal(red.cur.yaw, 30, 'a static cut');
  assert.ok(near(Cam.damp(1 / 30, 0.12), 1 - Math.pow(0.88, 2)), 'frame-rate independent');
});

test('camera: a flick coasts with inertia and stops inside the clamps', () => {
  const r = rigWith();
  r.fling(400, 0, 'orbitX');
  r.update(1 / 60);
  const y1 = r.goal.yaw;
  assert.ok(y1 > 0);
  settle(r, 3);
  assert.ok(r.goal.yaw > y1 && r.goal.yaw <= 35);
  assert.equal(r.vel.yaw, 0, 'the coast ends');
  const red = rigWith({ reduced: true });
  red.fling(400, 0, 'orbitX'); red.update(1 / 60);
  assert.equal(red.goal.yaw, 0, 'no inertia under reduced motion');
  const ed = rigWith(); ed.setMode('edit'); ed.fling(400, 0, 'orbit'); settle(ed, 1);
  assert.equal(ed.goal.yaw, 0, 'no orbit fling while editing');
});

test('camera: version bumps only when the pose changes', () => {
  const r = rigWith();
  settle(r);
  const v = r.version;
  r.update(1 / 60); r.update(1 / 60);
  assert.equal(r.version, v, 'still');
  assert.equal(r.moving, false);
  r.orbitBy(5, 0); r.update(1 / 60);
  assert.ok(r.version > v && r.moving);
});

test('camera: focusOn frames a point; keepInView pulls an off-screen point back in', () => {
  const r = rigWith({ w: 800, h: 450 });
  r.focusOn({ x: 1.2, z: 0.8 }, { zoom: 1.5, instant: true });
  r.update(0);
  const n = Cam.projectPose({ x: 1.2, y: 0.3, z: 0.8 }, r.pose);
  assert.ok(Math.abs(n.x) < 1e-6 && Math.abs(n.y) < 1e-6, 'centred');
  assert.equal(r.goal.zoom, 1.5);
  r.focusOn({ x: 7.9, z: 4.9 }, { zoom: 1.5, instant: true });
  const lim = Cam.panLimit(r.b, 1.5);
  assert.ok(near(r.goal.tx, r.home.tx + lim.x) && near(r.goal.tz, r.home.tz + lim.z), 'framing stays inside the pan clamp');
  const k = rigWith({ w: 800, h: 450, reduced: true });
  k.zoomBy(1.6); k.update(0);
  const far = { x: k.home.tx + 4.5, y: 0, z: k.home.tz + 2.5 };
  assert.ok(Math.abs(Cam.projectPose(far, k.pose).x) > 0.6);
  const t0 = k.goal.tx;
  k.keepInView(far, 0.6);
  assert.ok(k.goal.tx > t0, 'the target moved toward the point');
  const inside = { x: k.pose.tx, y: 0.3, z: k.pose.tz };
  const t1 = k.goal.tx; k.keepInView(inside, 0.6);
  assert.equal(k.goal.tx, t1, 'a centred point needs no pan');
});

test('camera: a land unlock reframes smoothly onto the bigger island', () => {
  const r = rigWith();
  settle(r);
  const tx0 = r.cur.tx;
  r.setLand(['home', 'cove']);
  const fit = G.fitCamera({ land: ['home', 'cove'], aspect: 16 / 9, yaw: 0, elev: 52 });
  assert.ok(near(r.goal.tx, fit.target.x));
  r.update(1 / 60);
  assert.ok(r.cur.tx > tx0 && r.cur.tx < r.goal.tx, 'eases, no cut');
  settle(r);
  assert.ok(near(r.pose.dist, fit.dist, 1e-6), 'the new fit');
});

/* ---------------- stage-cam moves ---------------- */
test('camera: crane 52° → 40° toward the region over 1.4 s, hold 1.5 s, back over 1.0 s', async () => {
  const r = rigWith();
  settle(r);
  let done = false;
  const p = r.crane({ x: 6.5, z: 0 }).then((ok) => { done = ok; });
  const ks = [], t0 = r.t;
  for (let t = 0; t < M.CRANE.dur + 0.2; t += 1 / 60) { r.update(1 / 60); ks.push([r.t - t0, r.move ? r.move.k : 0, r.pose.elev]); }
  const at = (sec) => ks.find((e) => e[0] >= sec);
  assert.ok(at(1.45)[1] > 0.99 && near(at(2)[2], 40, 0.05), 'held low at 40°');
  assert.ok(at(0.7)[1] > 0.3 && at(0.7)[1] < 0.7, 'eases out');
  await p;
  assert.equal(done, true);
  assert.equal(r.move, null);
  assert.ok(near(r.pose.elev, 52, 1e-6), 'back to the user view');
  const red = rigWith({ reduced: true });
  red.crane({ x: 6.5, z: 0 }); red.update(0.01);
  assert.equal(red.move.k, 1, 'reduced motion: a static cut toward the region');
});

test('camera: the launch push-in arrives in 0.7 s, holds, and releases', async () => {
  const r = rigWith();
  settle(r);
  let arrived = false;
  r.pushIn({ x: 3, z: 1 }).then(() => { arrived = true; });
  for (let i = 0; i < 30; i++) r.update(1 / 60);
  await Promise.resolve();
  assert.equal(arrived, false, 'not yet at 0.5 s');
  for (let i = 0; i < 15; i++) r.update(1 / 60);
  await new Promise((res) => setImmediate(res));
  assert.equal(arrived, true);
  settle(r, 2);
  assert.ok(r.move && r.move.k === 1, 'holds until the game takes over');
  assert.ok(r.pose.zoom > 1.7);
  r.releaseMove('push');
  settle(r, 0.6);
  assert.equal(r.move, null);
  assert.ok(near(r.pose.zoom, 1, 1e-9));
});

test('camera: the reveal starts high and wide and settles on the default view', () => {
  const r = rigWith();
  settle(r);
  r.reveal(); r.update(1 / 60);
  assert.ok(r.pose.elev > 64 && r.pose.zoom < 0.85, 'starts high and wide');
  settle(r, 2);
  assert.equal(r.move, null);
  assert.ok(near(r.pose.elev, 52, 1e-9) && near(r.pose.yaw, 0, 1e-9));
  const red = rigWith({ reduced: true });
  red.reveal(); red.update(1 / 60);
  assert.equal(red.move, null, 'no reveal under reduced motion');
});

test('camera: the Showtime orbit sways ±8° on alternate sides, never while editing or reduced', () => {
  const r = rigWith();
  settle(r);
  r.showOrbit(true);
  let max = 0, min = 0;
  for (let t = 0; t < 16; t += 1 / 30) { r.update(1 / 30); max = Math.max(max, r.orbitYaw); min = Math.min(min, r.orbitYaw); }
  assert.ok(near(max, 8, 0.05) && near(min, -8, 0.05), `${min}..${max}`);
  r.setMode('edit');
  settle(r, 3);
  assert.ok(Math.abs(r.pose.yaw) < 0.01, 'edit keeps yaw 0');
  r.setMode('play'); r.showOrbit(false); settle(r, 4);
  assert.ok(Math.abs(r.orbitYaw) < 0.01, 'eases out when Showtime ends');
  const red = rigWith({ reduced: true });
  red.showOrbit(true); settle(red, 4);
  assert.equal(red.orbitYaw, 0);
});

test('camera: the dance push-in returns after the 8 counts; shake decays and is off when reduced', () => {
  const r = rigWith();
  settle(r);
  r.dance({ x: -0.5, z: 0 }, 4.07);
  settle(r, 1);
  assert.ok(r.pose.zoom > 1.1);
  settle(r, 5.5);
  assert.equal(r.move, null);
  r.shake(0.06, 0.18); r.update(1 / 60);
  assert.ok(r.shakeAmp > 0);
  settle(r, 0.3);
  assert.equal(r.shakeAmp, 0);
  const red = rigWith({ reduced: true });
  red.shake(0.06, 0.18);
  assert.equal(red.shakeAmp, 0);
});

test('camera: apply() writes a duck-typed PerspectiveCamera and never rolls', () => {
  const calls = { proj: 0 };
  const cam = {
    fov: 50, aspect: 1, near: 0.1, far: 1000, position: { set(x, y, z) { this.x = x; this.y = y; this.z = z; } },
    up: { set(x, y, z) { this.v = [x, y, z]; } }, lookAt(x, y, z) { this.look = [x, y, z]; },
    updateProjectionMatrix() { calls.proj++; }, updateMatrixWorld() {}
  };
  const r = rigWith({ w: 1000, h: 500 });
  r.apply(cam); r.apply(cam);
  assert.equal(calls.proj, 1, 'the projection only updates on a change');
  assert.equal(cam.fov, 30); assert.equal(cam.aspect, 2); assert.equal(cam.near, 0.5); assert.equal(cam.far, 200);
  assert.deepEqual(cam.up.v, [0, 1, 0]);
  assert.deepEqual(cam.look, [r.pose.tx, 0.3, r.pose.tz]);
});

/* ---------------- gestures ---------------- */
test('gesture: a tap is ≤ 8 px and ≤ 1 s (a slow press still counts); more is not a tap', () => {
  const g = new Cam.Gesture();
  assert.equal(g.down(1, 100, 100, 0, { cam: 'orbit' })[0].type, 'press');
  g.move(1, 105, 103, 50);
  const up = g.up(1, 105, 103, 120);
  assert.equal(up.length, 1); assert.equal(up[0].type, 'tap'); assert.equal(up[0].count, 1); assert.equal(up[0].long, false);
  g.down(1, 100, 100, 1000, { cam: 'orbit' });
  const slow = g.up(1, 100, 100, 1600);
  assert.equal(slow.length, 1, 'a 600 ms press is a (slow) tap'); assert.equal(slow[0].type, 'tap');
  g.down(1, 100, 100, 2000, { cam: 'orbit' });
  assert.deepEqual(g.up(1, 100, 100, 3100), [], 'too slow');
  g.down(1, 100, 100, 5000, { cam: 'none' });
  g.move(1, 112, 100, 5020);
  assert.deepEqual(g.up(1, 112, 100, 5050), [], 'moved beyond the slop');
});

test('gesture: double taps count 2 within 320 ms and 24 px', () => {
  const g = new Cam.Gesture();
  g.down(1, 50, 50, 0, {}); g.up(1, 50, 50, 60);
  g.down(1, 60, 55, 250, {});
  assert.equal(g.up(1, 60, 55, 300)[0].count, 2);
  g.down(1, 60, 55, 400, {});
  assert.equal(g.up(1, 60, 55, 450)[0].count, 1, 'a third tap starts over');
  g.down(1, 200, 55, 600, {});
  assert.equal(g.up(1, 200, 55, 650)[0].count, 1, 'too far for a double');
});

test('gesture: a 450 ms long-press fires once; released in place it is still a (long) tap; a 1 s hold is not', () => {
  const g = new Cam.Gesture();
  g.down(1, 10, 10, 0, { claim: 'item' });
  assert.deepEqual(g.tick(300), []);
  assert.equal(g.nextTick(300), 150, 'the long-press is due at 450 ms');
  const lp = g.tick(460);
  assert.equal(lp.length, 1); assert.equal(lp[0].type, 'longpress'); assert.equal(lp[0].claim, 'item');
  assert.deepEqual(g.tick(900), [], 'once');
  assert.equal(g.nextTick(900), 100, 'then the hold at 1 s');
  const slow = g.up(1, 10, 10, 700);
  assert.equal(slow.length, 1); assert.equal(slow[0].type, 'tap'); assert.equal(slow[0].long, true, 'a slow tap after the long-press');
  assert.equal(slow[0].count, 1);
  /* a long tap never forms a double tap */
  g.down(1, 10, 10, 800, {});
  assert.equal(g.up(1, 10, 10, 850)[0].count, 1);
  /* held still for 1 s: 'hold' (once) and no tap on release */
  g.down(1, 10, 10, 2000, { claim: 'item' });
  assert.deepEqual(g.tick(2460).map((e) => e.type), ['longpress']);
  assert.deepEqual(g.tick(3010).map((e) => e.type), ['hold']);
  assert.deepEqual(g.tick(3500), [], 'the hold fires once');
  assert.equal(g.nextTick(3500), -1);
  assert.deepEqual(g.up(1, 10, 10, 3050), [], 'no tap after a hold');
  /* a late timer catches both at once */
  g.down(1, 10, 10, 5000, {});
  assert.deepEqual(g.tick(6200).map((e) => e.type), ['longpress', 'hold']);
  g.up(1, 10, 10, 6300);
  g.down(1, 10, 10, 7000, {});
  g.move(1, 30, 10, 7100);
  assert.deepEqual(g.tick(7500), [], 'moved: no long-press');
  assert.equal(g.nextTick(7500), -1);
});

test('gesture: a claimed press becomes an item drag after 10 px', () => {
  const g = new Cam.Gesture();
  g.down(1, 0, 0, 0, { claim: 'item', cam: 'orbit' });
  assert.deepEqual(g.move(1, 9, 0, 10), [], 'within 10 px');
  const ev = g.move(1, 14, 0, 20);
  assert.deepEqual(ev.map((e) => e.type), ['dragstart', 'drag']);
  assert.equal(ev[0].x0, 0); assert.equal(ev[0].claim, 'item');
  assert.deepEqual(g.move(1, 40, 5, 40).map((e) => e.type), ['drag']);
  const end = g.up(1, 40, 5, 60);
  assert.deepEqual(end, [{ type: 'dragend', x: 40, y: 5, cancelled: false }]);
  assert.equal(g.state, 'idle');
});

test('gesture: unclaimed drags drive the camera from the start point, with a fling', () => {
  const g = new Cam.Gesture();
  g.down(1, 100, 100, 0, { cam: 'orbit' });
  const first = g.move(1, 112, 104, 16);
  assert.deepEqual(first, [{ type: 'orbit', dx: 12, dy: 4 }], 'no jump: the whole delta from the press');
  assert.deepEqual(g.move(1, 120, 104, 32), [{ type: 'orbit', dx: 8, dy: 0 }]);
  const rel = g.up(1, 120, 104, 40);
  assert.equal(rel[0].type, 'release'); assert.ok(rel[0].vx > 0); assert.equal(rel[0].mode, 'orbit');
  const g2 = new Cam.Gesture();
  g2.down(1, 0, 0, 0, { cam: 'orbitX' });
  assert.deepEqual(g2.move(1, 20, 15, 16), [{ type: 'orbitX', dx: 20, dy: 0 }], 'touch orbit is horizontal only');
  const late = (g2.move(1, 30, 15, 32), g2.up(1, 30, 15, 400));
  assert.equal(late[0].vx, 0, 'a held finger does not fling');
  const g3 = new Cam.Gesture();
  g3.down(1, 0, 0, 0, { cam: 'none' });
  assert.deepEqual(g3.move(1, 30, 0, 16), [], 'nothing to drive');
  assert.deepEqual(g3.up(1, 30, 0, 30), []);
});

test('gesture: two fingers pinch and twist; a second finger cancels an item drag and any tap', () => {
  const g = new Cam.Gesture();
  g.down(1, 100, 100, 0, { claim: 'item' });
  g.move(1, 120, 100, 10);
  const two = g.down(2, 200, 100, 20, {});
  assert.deepEqual(two.map((e) => e.type), ['dragend']);
  assert.equal(two[0].cancelled, true);
  const p = g.move(2, 220, 100, 30)[0];
  assert.equal(p.type, 'pinch');
  assert.ok(near(p.scale, 100 / 80, 1e-9) && near(p.rotate, 0, 1e-9));
  assert.ok(near(p.dx, 10, 1e-9) && near(p.dy, 0, 1e-9));
  const tw = g.move(2, 120, 200, 40)[0];
  assert.ok(near(tw.rotate, 90, 1e-9), 'a quarter twist');
  assert.deepEqual(g.up(2, 120, 200, 50), []);
  assert.deepEqual(g.move(1, 130, 100, 60), [], 'the remaining finger is ignored');
  assert.deepEqual(g.up(1, 130, 100, 70), [], 'and is not a tap');
  assert.equal(g.state, 'idle');
});

test('gesture: cancel ends a drag as cancelled and resets', () => {
  const g = new Cam.Gesture();
  g.down(5, 0, 0, 0, { claim: 'ghost' });
  g.move(5, 30, 0, 10);
  assert.deepEqual(g.cancel(5), [{ type: 'dragend', x: 30, y: 0, cancelled: true }]);
  assert.equal(g.state, 'idle'); assert.equal(g.active(), false);
  g.down(6, 0, 0, 100, { claim: 'item' }); g.move(6, 30, 0, 110);
  assert.equal(g.cancelAll()[0].cancelled, true);
});

test('camera: pure helpers', () => {
  assert.equal(Cam.wrapDeg(190), -170); assert.equal(Cam.wrapDeg(-190), 170); assert.equal(Cam.wrapDeg(30), 30);
  assert.equal(Cam.damp(0, 0.12), 0);
  const b = Cam.basisInto(0, 52, {});
  assert.ok(near(b.Dx, 0) && near(b.Dy, Math.sin(52 * Math.PI / 180)) && near(b.Rx, 1) && near(b.Uy, Math.cos(52 * Math.PI / 180)));
  const gb = G.basis(20, 45), cb = Cam.basisInto(20, 45, {});
  assert.ok(near(gb.D.x, cb.Dx) && near(gb.R.z, cb.Rz) && near(gb.U.x, cb.Ux) && near(gb.U.y, cb.Uy));
  const d = Cam.panDelta(10, 0, 500, 20, 30, 0, 52, {});
  assert.ok(d.x < 0 && near(d.z, 0), 'dragging right moves the target left');
  assert.equal(Cam.zoomMaxFor(true, 0.7), 2.2);
});
