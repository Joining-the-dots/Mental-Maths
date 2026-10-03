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
    assert.equal(p.yaw, 0); assert.equal(p.elev, 48); assert.equal(p.zoom, 1);
    assert.equal(p.ty, Cam.TARGET_Y);
    const fit = G.fitCamera({ land, aspect, yaw: 0, elev: 48 });
    assert.ok(near(r.home.tx, fit.target.x) && near(r.home.tz, fit.target.z), 'home = the land centre');
    /* the play framing (FRAME): the target slides from the land centre toward the city (-z) only */
    const F = Cam.fitFrame(r.fr, 0, 48, aspect, Cam.FRAME.band);
    assert.ok(F.shift > 0, 'the skyline band slides the target toward the city');
    assert.ok(near(p.tx, fit.target.x) && near(p.tz, fit.target.z - F.shift, 1e-9), 'target = land centre + the slide');
    assert.ok(near(p.dist, F.dist, 1e-9));
    /* every unlocked cell's corners, from the beach to the tallest item (the real outline, not its box) */
    const b = Cam.boundsOf(land);
    for (const k of Object.keys(G.landFrom(land))) {
      const q = G.parseKey(k), c = G.cellCenter(q.c, q.r);
      for (const dx of [-0.5, 0.5]) for (const dz of [-0.5, 0.5]) for (const y of [b.bottom, b.top]) {
        const n = Cam.projectPose({ x: c.x + dx, y, z: c.z + dz }, p);
        assert.ok(n.depth > 0, 'in front');
        assert.ok(Math.abs(n.x) <= 0.94 + 1e-9 && n.y >= -0.94 - 1e-9 && n.y <= 0.94 - 2 * Cam.FRAME.band + 1e-9, `${land} ${aspect}: ${n.x}, ${n.y}`);
      }
    }
  }
});

/* the lead's QA (2026-10-03): with all land at 16:9 the old default (a fit of the cell squares + 0.25 u)
   cropped the island's edges and showed only tower bases along the top. The default play view must hold
   the island as it really stands — the baked organic coast and its scenery, the rocks the land reaches —
   AND keep a band of the city across the bay above it, on 16:9 and 4:3 (and 16:10 / 2.4:1 windows) */
test('camera: the default play view fits the real organic island with a margin and keeps a skyline band on top', () => {
  const T3 = require('../world/island3d/terrain3d.js'), City = require('../world/island3d/city3d.js');
  const S = T3.STRUCT, rocks = [S.islet].concat(S.stacks);
  const lay = City.layout({ tier: 'MID' }), gy = City.GROUND;
  for (const land of [['home'], ['home', 'cove', 'meadow'], ['home', 'cove'], ['home', 'meadow']]) {
    /* the island as baked for two children: terrain above the water + scenery, the rocks apart */
    const isl = [], rockPts = [];
    const lb = G.landBounds(land, 0), RN = 1.8, nearRock = (q) => q.x >= lb.minX - RN && q.x <= lb.maxX + RN &&
      q.z >= lb.minZ - RN && q.z <= lb.maxZ + RN;          /* = FRAME.rockNear */
    for (const seed of ['kid-a', 'mia']) {
      const bk = T3.bake(land, { tier: 'MID', seed });
      for (const arr of [T3.meshArrays(bk).position, T3.sceneryArrays(bk).position]) {
        for (let i = 0; i < arr.length; i += 3) {
          const q = { x: arr[i], y: arr[i + 1], z: arr[i + 2] };
          if (q.y <= G.SEA_Y + 0.02) continue;
          const rk = rocks.find((r) => Math.hypot(q.x - r.x, q.z - r.z) < r.r + 0.4);
          if (!rk) isl.push(q); else if (nearRock(rk)) rockPts.push(q);
        }
      }
    }
    for (const k of Object.keys(G.landFrom(land))) {                   /* the tallest item on every cell */
      const q = G.parseKey(k), c = G.cellCenter(q.c, q.r);
      isl.push({ x: c.x, y: G.surfaceY(q.c, q.r) + G.ITEM_MAX_H, z: c.z });
    }
    for (const aspect of [16 / 9, 4 / 3, 1.6, 2.4]) {
      const r = new Cam.Rig({ aspect, land: G.landFrom(land) });
      r.update(0);
      const p = r.pose, tag = land.join('+') + ' @' + aspect.toFixed(2);
      for (const q of isl) {
        const n = Cam.projectPose(q, p);
        assert.ok(Math.abs(n.x) <= 0.95 && n.y >= -0.95 && n.y <= 0.95, `${tag}: island point (${q.x.toFixed(2)}, ${q.y.toFixed(2)}, ${q.z.toFixed(2)}) at NDC ${n.x.toFixed(3)}, ${n.y.toFixed(3)}`);
      }
      for (const q of rockPts) { const n = Cam.projectPose(q, p); assert.ok(Math.abs(n.x) <= 1 && Math.abs(n.y) <= 1, `${tag}: a rock the land reaches is in frame`); }
      /* the skyline band: the quay's back wall sits in the top part of the frame with ≥ 15% of the frame above it */
      for (let x = -8; x <= 8; x += 1) {
        const n = Cam.projectPose({ x, y: gy, z: City.quayZ(x) }, p);
        assert.ok(n.y <= 0.7 && n.y > 0, `${tag}: the quay at x ${x} sits at NDC y ${n.y.toFixed(3)}`);
      }
      /* the 3 media barges are whole (plan acceptance: 'City visible') */
      for (const bg of lay.barges) for (const lx of [-0.75, 0.75]) for (const y of [0.15, 0.8]) {
        const n = Cam.projectPose({ x: bg.x + lx * Math.cos(bg.yaw), y, z: bg.z - lx * Math.sin(bg.yaw) }, p);
        assert.ok(Math.abs(n.x) <= 1 && Math.abs(n.y) <= 1, tag + ': barge screen corner in frame');
      }
      /* and most of the mid-rise skyline row shows, not just tower bases */
      let vis = 0, cnt = 0;
      for (const b of lay.buildings) {
        if (b.layer !== 'L2') continue;
        const lo = Cam.projectPose({ x: b.x, y: gy, z: b.z }, p), hi = Cam.projectPose({ x: b.x, y: gy + b.h, z: b.z }, p);
        if (Math.abs(lo.x) > 1) continue;
        cnt++; vis += Math.max(0, Math.min(1, hi.y) - Math.max(-1, lo.y)) / (hi.y - lo.y);
      }
      assert.ok(cnt > 5 && vis / cnt >= 0.45, `${tag}: ${(100 * vis / cnt).toFixed(0)}% of the mid-rise heights in view`);
    }
  }
});

test('camera: the skyline band is a play-mode framing — edit / place and a zoom past 1.3 give it back to the island', () => {
  const r = rigWith({ w: 1600, h: 900, reduced: true });
  const play = { dist: r.pose.dist, tz: r.pose.tz };
  assert.ok(play.tz < r.home.tz - 0.5, 'play: the target slides toward the city');
  r.setMode('edit'); r.update(0);
  const F0 = Cam.fitFrame(r.fr, 0, 62, 16 / 9, 0);
  assert.ok(near(r.pose.tz, r.home.tz) && near(r.pose.dist, F0.dist, 1e-9), 'edit: the centred fit of the real island, no band');
  r.setMode('play'); r.update(0);
  assert.ok(near(r.pose.tz, play.tz, 1e-9), 'back in play: the band again');
  r.zoomBy(1.35); r.update(0);
  assert.ok(near(r.pose.tz, r.goal.tz), 'zoomed in: no slide');
  assert.equal(Cam.bandAt(1), 1); assert.equal(Cam.bandAt(1.3), 0); assert.ok(Cam.bandAt(1.15) > 0 && Cam.bandAt(1.15) < 1);
  /* the band eases with the edit tilt (no cut) */
  const e = rigWith({ w: 1600, h: 900 });
  settle(e);
  const tz0 = e.pose.tz;
  e.setMode('edit'); e.update(1 / 60);
  assert.ok(e.pose.tz > tz0 && e.pose.tz < e.home.tz, 'eases');
  /* portrait phones keep the plain fit and the 1.75 home zoom (cells sized for fingers) */
  const ph = new Cam.Rig({ aspect: 0.667, land: ['home'], touch: true });
  ph.update(0);
  assert.ok(near(ph.pose.dist, Cam.fitDist(ph.b, 0, 48, 0.667) / 1.75, 1e-9) && near(ph.pose.tz, ph.home.tz), 'phone: unchanged');
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
test('camera: yaw ±35°, elevation 34–67° in play (40 while editing), zoom 0.75–1.6 (2.45 on portrait phones)', () => {
  const r = rigWith();
  r.orbitBy(500, 500);
  assert.equal(r.goal.yaw, 35); assert.equal(r.goal.elev, 67);
  r.orbitBy(-900, -900);
  assert.equal(r.goal.yaw, -35); assert.equal(r.goal.elev, 34, 'a deliberate low drag shows more of the city');
  r.zoomBy(100); assert.equal(r.goal.zoom, 1.6);
  assert.equal(r.zoomBy(2), false, 'no change at the limit');
  r.zoomBy(0.001); assert.equal(r.goal.zoom, 0.75);
  /* editing: the floor is 40 (the edit tilt itself is 62) */
  const ed = rigWith();
  ed.setMode('edit'); ed.goal.elev = 10; ed.clampGoal();
  assert.equal(ed.goal.elev, 40);
  assert.equal(Cam.LIMITS.elevDefault, 48); assert.equal(Cam.LIMITS.editElev, 62); assert.equal(Cam.LIMITS.fov, 30, 'FOV unchanged');
  const phone = rigWith({ touch: true, aspect: 0.8 });
  assert.equal(phone.zoomMax(), 2.45);
  phone.zoomBy(100); assert.equal(phone.goal.zoom, 2.45);
  assert.equal(rigWith({ touch: false, aspect: 0.8 }).zoomMax(), 1.6, 'a narrow desktop window is not a phone');
  assert.equal(rigWith({ touch: true, aspect: 1.5 }).zoomMax(), 1.6, 'a landscape tablet keeps 1.6');
  assert.ok(Cam.isPhone(true, 0.6) && !Cam.isPhone(true, 1.2) && !Cam.isPhone(false, 0.6));
});

test('camera: portrait phones start zoomed to 1.75 (finger-sized cells) and every zoom level stays reachable', () => {
  /* the 375 px phone: a ≈359 px wide 2:3 stage, width-limited */
  const W = 359, H = 538.5, cellPx = (r) => {
    const c = G.cellCenter(7, 5), y = G.surfaceY(7, 5);
    const a = Cam.projectPose({ x: c.x - 0.5, y, z: c.z }, r.pose), b = Cam.projectPose({ x: c.x + 0.5, y, z: c.z }, r.pose);
    const d = Cam.projectPose({ x: c.x, y, z: c.z - 0.5 }, r.pose), e = Cam.projectPose({ x: c.x, y, z: c.z + 0.5 }, r.pose);
    return { w: (b.x - a.x) / 2 * W, h: (d.y - e.y) / 2 * H };
  };
  const r = new Cam.Rig({ aspect: W / H, land: G.landFrom(['home']), touch: true });
  r.resize(W, H); r.update(0);
  assert.equal(r.homeZoom(), 1.75); assert.equal(r.home.zoom, 1.75);
  assert.equal(r.pose.zoom, 1.75, 'the very first frame is already the phone view');
  const c1 = cellPx(r);
  assert.ok(c1.w >= 42 && c1.w <= 50 && c1.h >= 30 && c1.h <= 38, `home-only cells ≈ 45 × 33 px (${c1.w.toFixed(1)} × ${c1.h.toFixed(1)})`);
  r.zoomBy(0.5); settle(r);
  r.command('reset'); settle(r);
  assert.ok(near(r.pose.zoom, 1.75, 1e-6), 'reset returns to the phone home zoom');
  /* all land, zoomed all the way in: still finger-sized */
  const all = new Cam.Rig({ aspect: W / H, land: G.landFrom(['home', 'cove', 'meadow']), touch: true, reduced: true });
  all.resize(W, H); all.zoomBy(100); all.update(0);
  assert.equal(all.pose.zoom, 2.45);
  const c2 = cellPx(all);
  assert.ok(c2.w >= 42 && c2.h >= 30, `all land at 2.45: ${c2.w.toFixed(1)} × ${c2.h.toFixed(1)}`);
  /* a desktop or a landscape tablet keeps the v1 framing */
  assert.equal(Cam.homeZoomFor(false, 0.6), 1); assert.equal(Cam.homeZoomFor(true, 1.4), 1); assert.equal(Cam.homeZoomFor(true, 0.66), 1.75);
  /* turning the phone sideways: an untouched view follows the new home zoom; a moved one is kept */
  const t = new Cam.Rig({ aspect: W / H, land: ['home'], touch: true });
  t.resize(W, H); t.update(0);
  t.resize(H, W);
  assert.equal(t.goal.zoom, 1, 'landscape: the v1 fit');
  t.resize(W, H); t.zoomBy(1.2);
  const z = t.goal.zoom;
  t.resize(H, W);
  assert.equal(t.goal.zoom, Math.min(z, 1.6), 'the child’s own zoom is kept (inside the landscape clamp)');
  /* phones still zoom into place mode at ≥ 1.4 (the 1.75 home view already is) */
  const pl = rigWith({ touch: true, aspect: 0.66 });
  pl.zoomBy(1 / 2); pl.setMode('place');
  assert.equal(pl.goal.zoom, 1.4);
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
  assert.ok(Math.abs(r.goal.tz - r.home.tz) <= lim1.z + 1e-9);
});

test('camera: zoomed in past 1.2 the target may glide 2.5 u further toward the city (-z) only', () => {
  assert.equal(Cam.backPanFor(1, 'play'), 0);
  assert.equal(Cam.backPanFor(1.2, 'play'), 0);
  assert.equal(Cam.backPanFor(1.6, 'play'), 2.5);
  assert.equal(Cam.backPanFor(2.45, 'play'), 2.5, 'never more than 2.5 u');
  assert.equal(Cam.backPanFor(1.6, 'edit'), 0, 'editing keeps the land framed');
  assert.equal(Cam.backPanFor(1.6, 'place'), 0);
  let prev = 0;
  for (let z = 1.2; z <= 1.5 + 1e-9; z += 0.01) { const v = Cam.backPanFor(z, 'play'); assert.ok(v >= prev - 1e-12, 'ramps smoothly'); prev = v; }
  const b = Cam.boundsOf(['home']);
  const r = rigWith({ w: 800, h: 450 });
  r.zoomBy(1.6);
  const pl = Cam.panLimit(b, 1.6);
  r.panBy(0, 1e6);                                      /* drag down: the view travels back over the bay */
  assert.ok(near(r.goal.tz, r.home.tz - pl.z - 2.5, 1e-9), 'the city side: + 2.5 u');
  r.panBy(0, -2e6);
  assert.ok(near(r.goal.tz, r.home.tz + pl.z, 1e-9), 'the front is unchanged');
  r.panBy(1e6, 0);
  assert.ok(near(Math.abs(r.goal.tx - r.home.tx), pl.x, 1e-9), 'the sides are unchanged');
  /* zooming back out glides the target home */
  r.panBy(0, 2e6);
  r.zoomBy(1 / 1.6);
  assert.ok(r.goal.tz >= r.home.tz - Cam.panLimit(b, 1).z - 1e-9);
  /* edit mode clamps the target back over the land */
  const e = rigWith({ w: 800, h: 450 });
  e.zoomBy(1.6); e.panBy(0, 1e6); e.setMode('edit');
  assert.ok(near(e.goal.tz, e.home.tz - pl.z, 1e-9));
});

test('camera: a pan moves the content with the finger at the target depth', () => {
  for (const yaw of [-30, 0, 25]) for (const elev of [38, 48, 62]) {
    const r = rigWith({ w: 800, h: 450, reduced: true });
    r.zoomBy(1.6); r.orbitBy(yaw, elev - 48); r.update(0);
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
  phone.zoomBy(1 / 1.75);
  phone.setMode('place');
  assert.equal(phone.goal.zoom, 1.4, 'place mode on phones zooms to 1.4×');
  const drag = rigWith({ touch: true, aspect: 0.75 });
  drag.zoomBy(1 / 1.75);
  drag.setMode('edit'); drag.setMode('place', { keepZoom: true });
  assert.ok(near(drag.goal.zoom, 1), 'a drag carrying an item into place mode keeps the zoom');
});

test('camera: reset and commands', () => {
  const r = rigWith();
  assert.ok(r.command('right')); assert.equal(r.goal.yaw, 15);
  r.command('left'); r.command('left'); assert.equal(r.goal.yaw, -15);
  r.command('up'); assert.equal(r.goal.elev, 53);
  r.command('in'); assert.ok(near(r.goal.zoom, 1.25));
  r.command('out'); assert.ok(near(r.goal.zoom, 1));
  assert.equal(r.command('nope'), false);
  r.command('reset');
  assert.deepEqual([r.goal.yaw, r.goal.elev, r.goal.zoom, r.goal.tx, r.goal.tz], [0, 48, 1, r.home.tx, r.home.tz]);
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
  const fit = G.fitCamera({ land: ['home', 'cove'], aspect: 16 / 9, yaw: 0, elev: 48 });
  assert.ok(near(r.goal.tx, fit.target.x));
  r.update(1 / 60);
  assert.ok(r.cur.tx > tx0 && r.cur.tx < r.goal.tx, 'eases, no cut');
  settle(r);
  assert.ok(near(r.pose.dist, Cam.fitFrame(Cam.frameOf(['home', 'cove']), 0, 48, 16 / 9, Cam.FRAME.band).dist, 1e-6), 'the new fit');
});

/* ---------------- stage-cam moves ---------------- */
test('camera: crane 48° → 40° toward the region over 1.4 s, hold 1.5 s, back over 1.0 s', async () => {
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
  assert.ok(near(r.pose.elev, 48, 1e-6), 'back to the user view');
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

test('camera: the skyline hero shot — elev 14, yaw -16, target raised to 2.0 and 1.5 u toward the city, zoom 0.8', () => {
  const S = Cam.SKYLINE;
  assert.deepEqual([S.elev, S.yaw, S.ty, S.dz, S.zoom, S.hold, S.ease], [14, -16, 2.0, -1.5, 0.8, 0.9, 1.8]);
  assert.ok(S.drift > 0 && S.drift / (S.hold + S.ease) < 1, 'the shot creeps, well under 1°/s');
  for (const aspect of [0.66, 1, 16 / 9, 2.4]) {
    const r = rigWith({ aspect, w: aspect * 600, h: 600 });
    settle(r);
    let done = false;
    r.skyline().then((ok) => { done = ok; });
    r.update(0);
    const p = r.pose, fit = Cam.skylineFit(aspect);
    assert.equal(r.move.kind, 'skyline');
    assert.ok(near(p.elev, 14) && near(p.yaw, -16) && near(p.zoom, fit.zoom) && near(p.ty, fit.ty), 'on mount it starts in the pose');
    if (aspect <= 4 / 3) assert.ok(near(fit.zoom, 0.8) && near(fit.ty, 2.0), 'up to 4:3: exactly the plan pose');
    assert.ok(near(p.tx, r.home.tx) && near(p.tz, r.home.tz - 1.5));
    /* at elev 14 the top ray is above the horizontal: the dusk sky, the towers and the wheel show */
    const top = Cam.topRayDeg(p);
    assert.ok(top >= 0 && near(top, Cam.LIMITS.fov / 2 - 14, 1e-9), `top ray ${top}°`);
    assert.ok(Cam.topRayDeg({ yaw: 0, elev: 48, fov: 30 }) < -30, 'the play view never shows the horizon');
    /* the Lantern Bridge (−3.2, −4.45 → −8.2) and the Halo Wheel rim (14.5, −6.2, d 3.2) are in front of the camera */
    for (const q of [{ x: -3.2, y: 0.5, z: -6.3 }, { x: 0, y: 6, z: -14 }]) assert.ok(Cam.projectPose(q, p).depth > 0);
    void done;
  }
});

test('camera: the skyline keeps every city tower top and the Signal Mast tip in frame, 2:3 to 2.4:1 (seams §9)', () => {
  const City = require('../world/island3d/city3d.js');
  const lays = ['LOW', 'MID', 'HIGH'].map((tier) => City.layout({ tier }));
  const gy = City.GROUND, mastH = City.MAST.h;
  for (const aspect of [2 / 3, 1, 4 / 3, 1.6, 16 / 9, 2.4]) {
    const r = rigWith({ aspect, w: Math.round(aspect * 900), h: 900 });
    settle(r);
    r.skyline(); r.update(0);
    const p = r.pose;
    let top = -Infinity, n = 0;
    for (const lay of lays) {
      const tips = lay.buildings.map((b) => ({ x: b.x, y: gy + b.h, z: b.z }));
      if (lay.mast) tips.push({ x: lay.mast.x, y: lay.mast.y + mastH, z: lay.mast.z });
      for (const q of tips) {
        const s = Cam.projectPose(q, p);
        if (s.depth <= 0 || Math.abs(s.x) > 1) continue;
        n++; top = Math.max(top, s.y);
      }
    }
    assert.ok(n > 40, aspect + ': the skyline is in view (' + n + ' tops)');
    assert.ok(top < 0.99, aspect.toFixed(2) + ': the highest top at NDC y ' + top.toFixed(3) + ' stays inside the frame');
    const home = Cam.projectPose({ x: r.home.tx, y: 0.3, z: r.home.tz }, p);
    assert.ok(home.y > -0.9 && home.y < 0, aspect.toFixed(2) + ': the island holds the lower frame');
  }
  /* the fit only ever opens and lifts the shot, and only past 4:3 */
  const a = Cam.skylineFit(4 / 3), b = Cam.skylineFit(16 / 9), c = Cam.skylineFit(9);
  assert.ok(near(a.zoom, Cam.SKYLINE.zoom) && near(a.ty, Cam.SKYLINE.ty));
  assert.ok(b.zoom < a.zoom && b.ty > a.ty && c.zoom <= b.zoom && c.zoom > 0.5, 'bounded: ' + JSON.stringify(c));
});

test('camera: the skyline holds 0.9 s, eases home over 1.8 s (ty interpolated), and resolves', async () => {
  const r = rigWith();
  settle(r);
  let done = null;
  r.skyline().then((ok) => { done = ok; });
  const log = [];
  for (let t = 0; t < 3; t += 1 / 60) { r.update(1 / 60); log.push([r.t, r.move ? r.move.k : 0, r.pose.ty, r.pose.elev, r.version]); }
  const t0 = log[0][0] - 1 / 60;
  const at = (sec) => log.find((e) => e[0] - t0 >= sec);
  const ty = Cam.skylineFit(r.aspect).ty;               /* 16:9: the shot's lifted target */
  assert.equal(at(0.85)[1], 1, 'held');
  for (let i = 1; i < 50; i++) assert.ok(log[i][4] > log[i - 1][4], 'the held shot still creeps (never a frozen frame)');
  assert.ok(near(at(0.85)[2], ty) && near(at(0.85)[3], 14));
  const mid = at(0.9 + 0.9);
  assert.ok(mid[1] > 0.4 && mid[1] < 0.6, 'half way through the 1.8 s ease');
  assert.ok(near(mid[2], Cam.TARGET_Y + (ty - Cam.TARGET_Y) * mid[1], 1e-9), 'ty = lerp(0.3, ty, k)');
  assert.ok(mid[3] > 14 && mid[3] < 48);
  for (let i = 1; i < log.length; i++) assert.ok(log[i][2] <= log[i - 1][2] + 1e-12, 'ty only descends');
  await Promise.resolve();
  assert.equal(done, true);
  assert.equal(r.move, null);
  assert.ok(near(r.pose.ty, Cam.TARGET_Y) && near(r.pose.elev, 48) && near(r.pose.yaw, 0) && near(r.pose.zoom, 1), 'the user view');
  /* the stage encore eases in first, optionally centred toward the stage */
  const e = rigWith();
  settle(e);
  e.skyline({ easeIn: 1, at: { x: 4, z: 0 } }); e.update(0);
  assert.ok(near(e.move.k, 0), 'no cut at the encore');
  for (let i = 0; i < 30; i++) e.update(1 / 60);
  assert.ok(e.move.k > 0.3 && e.move.k < 0.7);
  for (let i = 0; i < 40; i++) e.update(1 / 60);
  assert.equal(e.move.k, 1);
  assert.ok(near(e.move.tx, (e.home.tx + 4) / 2));
});

test('camera: a drag (or any camera input) hands the skyline back; a held finger freezes it; reduced motion skips it', async () => {
  const r = rigWith({ w: 800, h: 450 });
  settle(r);
  r.skyline(); r.update(1 / 60);
  r.orbitBy(10, 0);                                     /* the child grabs the camera */
  assert.equal(r.move.relT >= 0, true, 'released');
  assert.equal(r.goal.yaw, 10, 'the drag still lands in the user view');
  for (let i = 0; i < 20; i++) r.update(1 / 60);
  assert.ok(r.move && r.move.k < 0.8, 'eases out rather than cutting');
  settle(r, 2);
  assert.equal(r.move, null);
  assert.ok(near(r.pose.yaw, 10, 1e-6));
  for (const input of [(x) => x.panBy(5, 0), (x) => x.zoomBy(1.1), (x) => x.command('reset'), (x) => x.focusOn({ x: 0, z: 0 })]) {
    const q = rigWith({ w: 800, h: 450 });
    settle(q); q.skyline(); q.update(1 / 60);
    input(q);
    settle(q, 1);
    assert.equal(q.move, null, 'every camera input ends it');
  }
  /* other moves are not skippable */
  const c = rigWith(); settle(c); c.crane({ x: 6, z: 0 }); c.update(1 / 60);
  assert.equal(c.interrupt(), false); c.orbitBy(5, 0);
  assert.equal(c.move.kind, 'crane');
  /* a finger down holds the shot still (a tap picks what it saw), the release hands it back */
  const f = rigWith();
  settle(f);
  f.skyline(); f.update(1 / 60);
  for (let i = 0; i < 60; i++) f.update(1 / 60);       /* into the ease */
  f.freeze(true);
  const k0 = f.move.k, v0 = f.version;
  for (let i = 0; i < 30; i++) f.update(1 / 60);
  assert.equal(f.move.k, k0, 'frozen');
  assert.equal(f.version, v0, 'nothing moves under the finger');
  assert.ok(f.interrupt());
  settle(f, 1);
  assert.equal(f.move, null);
  /* a lost pointer never strands it */
  const g = rigWith(); settle(g); g.skyline(); g.freeze(true);
  settle(g, 6);
  assert.equal(g.move, null);
  /* reduced motion: skipped — the user view is simply there */
  const red = rigWith({ reduced: true });
  let ok = null;
  red.skyline().then((v) => { ok = v; }); red.update(1 / 60);
  assert.equal(red.move, null);
  await Promise.resolve();
  assert.equal(ok, true);
  const late = rigWith(); settle(late); late.skyline(); late.update(1 / 60);
  late.setReduced(true);
  assert.equal(late.move, null, 'turning reduced motion on ends it at once');
  assert.equal(typeof late.reveal, 'function', 'reveal() is kept as the hero shot');
});

test('camera: the Showtime orbit sways ±8° on alternate sides and dips the view 6° (floor 40), never while editing or reduced', () => {
  const r = rigWith();
  settle(r);
  r.showOrbit(true);
  let max = 0, min = 0, low = 99;
  for (let t = 0; t < 16; t += 1 / 30) {
    r.update(1 / 30);
    max = Math.max(max, r.orbitYaw); min = Math.min(min, r.orbitYaw); low = Math.min(low, r.pose.elev);
    assert.ok(near(r.pose.elev, 48 - 6 * Math.abs(r.orbitYaw) / 8, 1e-9), 'the dip follows the sway');
  }
  assert.ok(near(max, 8, 0.05) && near(min, -8, 0.05), `${min}..${max}`);
  assert.ok(near(low, 42, 0.05), `dips to ${low}`);
  assert.equal(Cam.orbitDip(8, 48), 6);
  assert.equal(Cam.orbitDip(-8, 43), 3, 'never below 40');
  assert.equal(Cam.orbitDip(8, 36), 0, 'a view already lower keeps its elevation');
  assert.equal(Cam.orbitDip(4, 60), 3);
  assert.equal(Cam.orbitDip(0, 60), 0);
  r.setMode('edit');
  settle(r, 3);
  assert.ok(Math.abs(r.pose.yaw) < 0.01, 'edit keeps yaw 0');
  assert.ok(near(r.pose.elev, 62, 0.01), 'and no dip');
  r.setMode('play'); r.showOrbit(false); settle(r, 4);
  assert.ok(Math.abs(r.orbitYaw) < 0.01, 'eases out when Showtime ends');
  assert.ok(near(r.pose.elev, 48, 0.01));
  const red = rigWith({ reduced: true });
  red.showOrbit(true); settle(red, 4);
  assert.equal(red.orbitYaw, 0);
  assert.equal(red.pose.elev, 48);
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
  assert.equal(Cam.zoomMaxFor(true, 0.7), 2.45);
  assert.equal(Cam.homeZoomFor(true, 0.7), 1.75);
  assert.ok(near(Cam.topRayDeg({ yaw: 30, elev: 20, fov: 30 }), -5, 1e-9), 'yaw never changes the top ray');
});

test('gesture: Controls tells the scene when the last finger lifts or is cancelled', (t) => {
  /* a minimal element: enough for Controls' listeners */
  const L = {}, el = {
    addEventListener: (k, f) => { L[k] = f; }, removeEventListener: () => {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 450 }),
    setPointerCapture() {}, releasePointerCapture() {}, hasPointerCapture: () => true, isConnected: true
  };
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const rig = rigWith({ w: 800, h: 450 }), log = [];
  const ctl = Cam.Controls(el, rig, { input: () => log.push('input'), up: () => log.push('up'), tap: () => log.push('tap') });
  const ev = (id, x, y) => ({ pointerId: id, pointerType: 'touch', button: 0, clientX: x, clientY: y, preventDefault() {} });
  L.pointerdown(ev(1, 100, 100)); L.pointerdown(ev(2, 200, 100));
  L.pointerup(ev(2, 200, 100));
  assert.deepEqual(log, ['input', 'input'], 'one finger is still down');
  L.pointerup(ev(1, 100, 100));
  assert.deepEqual(log, ['input', 'input', 'up']);
  log.length = 0;
  L.pointerdown(ev(3, 100, 100)); L.pointercancel(ev(3, 100, 100));
  assert.deepEqual(log, ['input', 'up']);
  log.length = 0;
  L.pointerdown(ev(4, 100, 100)); ctl.cancel(); ctl.cancel();
  assert.deepEqual(log, ['input', 'up'], 'cancel() lifts once');
  ctl.dispose();
});
