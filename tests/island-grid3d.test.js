'use strict';
/* My Island 3D — grid maths (world/island3d/grid3d.js) */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const G = require('../world/island3d/grid3d.js');
const C = require('../world/world-core.js');
const L = require('../world/world-look.js');
const M = require('../world/island3d/motion.js');

const COMBOS = [['home'], ['home', 'cove'], ['home', 'meadow'], ['home', 'cove', 'meadow']];
const PLACEABLE = C.CATALOG.filter((it) => C.isPlaceable(it));
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
function worldWith(regions) {
  const w = C.emptyWorld();
  for (const r of regions) if (r !== 'home') w.owned[C.REGIONS[r].unlock] = 1;
  return w;
}
function starterWorld() {
  const u = { points: 0 };
  C.grantStarter(u, Date.UTC(2026, 0, 1));
  return u.world;
}

/* ---------------- mapping ---------------- */
test('grid: constants agree with SLWorldCore and the art bible', () => {
  assert.equal(G.COLS, C.COLS); assert.equal(G.ROWS, C.ROWS);
  assert.equal(G.SEA_Y, -0.32); assert.equal(G.SAND_Y, -0.12); assert.equal(G.SAND_REACH, 0.25);
  assert.deepEqual(G.TERRACE, [0.45, 0.35, 0.25, 0.15]);
  assert.ok(near(G.FIT, 1 - 2 * G.MARGIN));
  assert.equal(G.FIELD.w, 64); assert.equal(G.FIELD.h, 40);
});

test('grid: cell centres match the bible formula for every cell', () => {
  for (let r = 0; r < 10; r++) for (let c = 0; c < 16; c++) {
    const p = G.cellCenter(c, r);
    assert.equal(p.x, c - 7.5); assert.equal(p.z, r - 4.5);
    assert.equal(p.y, G.surfaceY(c, r));
    assert.deepEqual(G.worldToCell(p.x, p.z), { c, r });
  }
  assert.deepEqual(G.worldToCell(-8, -5), { c: 0, r: 0 });
  assert.deepEqual(G.worldToCell(7.99, 4.99), { c: 15, r: 9 });
  assert.ok(!G.inGrid(16, 0) && !G.inGrid(0, -1) && !G.inGrid(1.5, 2) && G.inGrid(15, 9));
  assert.deepEqual(G.clampCell(-3, 22), { c: 0, r: 9 });
  assert.equal(G.cellCenter(0, 0, ['home']).y, G.SEA_Y, 'sea cells sit at sea level on the pick heightfield');
});

test('grid: pivots match (x + w/2 - 8, baseY, y + h/2 - 5) for every footprint and position', () => {
  for (const it of PLACEABLE) {
    const fp = it.fp || [1, 1];
    for (let y = 0; y + fp[1] <= 10; y++) for (let x = 0; x + fp[0] <= 16; x++) {
      const p = G.pivot(it.id, x, y);
      assert.equal(p.x, x + fp[0] / 2 - 8, it.id);
      assert.equal(p.z, y + fp[1] / 2 - 5, it.id);
      assert.equal(p.y, Math.max(...G.cellsOf(it.id, x, y).map((q) => G.surfaceY(q.c, q.r))), it.id);
      assert.equal(G.cellsOf(it.id, x, y).length, fp[0] * fp[1]);
    }
  }
  assert.deepEqual(G.footprint('att_pitch'), [3, 2]);
  assert.deepEqual(G.pivot('house_cottage', 6, 2), { x: -1, y: 0, z: -2 });
});

test('grid: every STARTER placement and every legal findSpot result sits on land, inside 16×10', () => {
  const check = (w, id, x, y, why) => {
    const land = C.landSet(w), cells = G.cellsOf(id, x, y);
    for (const q of cells) {
      assert.ok(G.inGrid(q.c, q.r), why + ' inside grid');
      assert.ok(land[G.key(q.c, q.r)], why + ' on land');
    }
    const b = G.landBounds(land, 0), p = G.pivot(id, x, y);
    assert.ok(p.x > b.minX && p.x < b.maxX && p.z > b.minZ && p.z < b.maxZ, why + ' pivot inside the land bounds');
  };
  const w = starterWorld();
  assert.equal(w.placed.length, C.STARTER.placed.length);
  for (const p of w.placed) { check(w, p.id, p.x, p.y, 'starter ' + p.id); assert.equal(G.baseY(p.id, p.x, p.y), 0); }
  for (const combo of COMBOS) {
    for (const it of PLACEABLE) {
      for (const pref of [[7, 5], [0, 4], [15, 4], [1, 8]]) {
        const ww = worldWith(combo), s = C.findSpot(ww, it.id, pref[0], pref[1]);
        assert.ok(s, it.id + ' spot ' + combo);
        check(ww, it.id, s.x, s.y, it.id + ' ' + combo.join('+'));
      }
      const busy = starterWorld();
      for (const r of combo) if (r !== 'home') busy.owned[C.REGIONS[r].unlock] = 1;
      const s2 = C.findSpot(busy, it.id);
      if (s2) check(busy, it.id, s2.x, s2.y, it.id + ' busy ' + combo);
    }
  }
});

test('grid: Meadow Hill terraces, base heights and the plinth rule', () => {
  assert.equal(G.surfaceY(0, 4), 0.45); assert.equal(G.surfaceY(1, 4), 0.35);
  assert.equal(G.surfaceY(2, 2), 0.25); assert.equal(G.surfaceY(3, 8), 0.15);
  assert.equal(G.surfaceY(2, 4), 0, 'column 2, row 4 is Home Island');
  assert.equal(G.surfaceY(14, 4), 0, 'Beach Cove is flat');
  for (const k of C.REGION_CELLS.meadow) { const p = G.parseKey(k); assert.equal(G.surfaceY(p.c, p.r), G.TERRACE[p.c]); }
  for (const k of C.REGION_CELLS.home.concat(C.REGION_CELLS.cove)) { const p = G.parseKey(k); assert.equal(G.surfaceY(p.c, p.r), 0); }
  /* a 1×1 item sits flat on its terrace */
  assert.equal(G.baseY('tree_oak', 1, 4), 0.35);
  assert.equal(G.plinth('tree_oak', 1, 4), null);
  /* a 2×2 across two terraces rests on the higher one and stands on a plinth */
  assert.equal(G.baseY('house_cottage', 0, 3), 0.45);
  assert.deepEqual(G.plinth('house_cottage', 0, 3), { x: -7, z: -1, w: 2, d: 2, top: 0.45, bottom: 0.35 });
  /* a footprint that straddles meadow and home ground also gets one */
  const pl = G.plinth('att_course', 2, 6);
  assert.ok(pl && pl.top === 0.25 && pl.bottom === 0);
  /* flat home ground never does */
  assert.equal(G.plinth('house_cottage', 6, 2), null);
  const pm = G.placement('house_cottage', 0, 3);
  assert.equal(pm.baseY, 0.45); assert.equal(pm.cells.length, 4); assert.equal(pm.hit.min[1], 0.45);
  assert.ok(G.MAX_TOP >= Math.max(...G.TERRACE));
});

test('grid: hit boxes are at least 0.8 u and centred on the pivot', () => {
  for (const it of PLACEABLE) {
    const s = G.hitSize(it.id), fp = it.fp || [1, 1];
    assert.ok(s[1] >= G.MIN_HIT && s[0] >= G.MIN_HIT && s[2] >= G.MIN_HIT, it.id);
    assert.equal(s[0], fp[0]); assert.equal(s[2], fp[1]);
    const b = G.hitBox(it.id, 4, 3), p = G.pivot(it.id, 4, 3);
    assert.ok(near((b.min[0] + b.max[0]) / 2, p.x) && near((b.min[2] + b.max[2]) / 2, p.z));
    assert.ok(near(b.max[1] - b.min[1], Math.max(L.LOOK[it.id].h, 0.8)));
  }
  assert.deepEqual(G.hitSize('pet_kitten'), [0.8, 0.8, 0.8]);
  assert.equal(G.PET_HIT_R * 2, 0.8);
});

/* ---------------- picking ---------------- */
test('grid: rayToCell round-trips every land cell centre from yaw -35/0/35 and elevation 40/52/62', () => {
  for (const combo of [['home'], ['home', 'cove', 'meadow']]) {
    const land = G.landFrom(combo);
    for (const k of Object.keys(land)) {
      const { c, r } = G.parseKey(k), target = G.cellCenter(c, r, land);
      for (const yaw of [-35, 0, 35]) for (const elev of [40, 52, 62]) {
        const cam = G.cameraPosition(target, yaw, elev, 30);
        const dir = { x: target.x - cam.x, y: target.y - cam.y, z: target.z - cam.z };
        const hit = G.rayToCell(cam, dir, land);
        assert.ok(hit, `no hit for ${k} yaw ${yaw} elev ${elev}`);
        assert.equal(hit.key, k, `yaw ${yaw} elev ${elev}`);
        assert.equal(hit.land, true);
        assert.ok(near(hit.y, target.y, 1e-6) && !hit.side);
      }
    }
  }
});

test('grid: rayToCell agrees with project/rayFromCamera on a fitted camera', () => {
  const land = G.landFrom(['home', 'cove', 'meadow']);
  const fit = G.fitCamera({ land, aspect: 1.6 });
  const cam = { position: fit.position, target: fit.target, fov: fit.fov, aspect: fit.aspect };
  for (const k of Object.keys(land)) {
    const { c, r } = G.parseKey(k), p = G.cellCenter(c, r, land), ndc = G.project(p, cam);
    assert.ok(ndc.depth > 0 && Math.abs(ndc.x) < 1 && Math.abs(ndc.y) < 1, k + ' on screen');
    const ray = G.rayFromCamera(cam, ndc.x, ndc.y), hit = G.rayToCell(ray.origin, ray.dir, land);
    assert.equal(hit && hit.key, k);
  }
});

test('grid: rayToCell picks terrace sides, sea cells in the grid, and returns null off the grid', () => {
  const all = G.landFrom(['home', 'cove', 'meadow']), home = G.landFrom(['home']);
  /* a low ray from the east meets the face of column 0 (0.45) below its top, over column 1 (0.35) */
  const side = G.rayToCell({ x: -4, y: 0.7, z: -0.5 }, { x: -3, y: -0.3, z: 0 }, all);
  assert.equal(side.key, '0,4'); assert.equal(side.side, true); assert.ok(near(side.x, -7, 1e-6));
  /* the same shallow ray with the meadow locked passes over the sandbar and leaves the grid */
  assert.equal(G.rayToCell({ x: -4, y: 0.7, z: -0.5 }, { x: -3, y: -0.3, z: 0 }, home), null);
  /* a steeper one clears Home Island's edge and meets the sea inside the grid (a locked cell) */
  const sea = G.rayToCell({ x: -5, y: 0.3, z: -0.5 }, { x: -1, y: -0.25, z: 0 }, home);
  assert.ok(sea && sea.key === '0,4' && sea.land === false && near(sea.y, G.SEA_Y, 1e-6));
  /* …and with the meadow open it hits the cliff of column 1 instead */
  const cliff = G.rayToCell({ x: -5, y: 0.3, z: -0.5 }, { x: -1, y: -0.25, z: 0 }, all);
  assert.equal(cliff.key, '1,4'); assert.equal(cliff.side, true);
  /* off the grid, looking up or flat → null */
  assert.equal(G.rayToCell({ x: 12, y: 10, z: 0 }, { x: 0, y: -1, z: 0 }, all), null);
  assert.equal(G.rayToCell({ x: 0, y: 10, z: 30 }, { x: 0, y: -0.1, z: 1 }, all), null);
  assert.equal(G.rayToCell({ x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 0 }, all), null);
  assert.equal(G.rayToCell({ x: 0, y: 1, z: 0 }, { x: 1, y: 0, z: 0 }, all), null);
  assert.equal(G.rayToCell({ x: 0, y: 30, z: 40 }, { x: 0, y: -1, z: -0.5 }, all), null, 'meets the sea before the grid');
  /* arrays work as vectors */
  assert.equal(G.rayToCell([0.2, 5, 0.2], [0, -1, 0], all).key, '8,5');
  /* ray-plane helper */
  assert.deepEqual(G.rayPlane({ x: 0, y: 2, z: 0 }, { x: 1, y: -1, z: 0 }, 0), { x: 2, y: 0, z: 0, t: 2 });
  assert.equal(G.rayPlane({ x: 0, y: 2, z: 0 }, { x: 1, y: 1, z: 0 }, 0), null);
});

test('grid: fitCamera keeps every unlocked-land corner (with 2.9 u height) inside NDC ±0.94', () => {
  for (const combo of COMBOS) {
    const land = G.landFrom(combo), b = G.landBounds(land, 0), padded = G.landBounds(land, G.SAND_REACH);
    for (const aspect of [0.5, 0.75, 1, 4 / 3, 16 / 9, 2.4]) {
      for (const view of [{}, { yaw: -35, elev: 40 }, { yaw: 35, elev: 65 }]) {
        const fit = G.fitCamera(Object.assign({ land, aspect }, view));
        const cam = { position: fit.position, target: fit.target, fov: 30, aspect };
        let worst = 0;
        for (const x of [b.minX, b.maxX]) for (const z of [b.minZ, b.maxZ]) for (const y of [0, 2.9]) {
          const p = G.project({ x, y, z }, cam);
          assert.ok(p.depth > 0);
          assert.ok(Math.abs(p.x) <= 0.94 + 1e-9 && Math.abs(p.y) <= 0.94 + 1e-9, `${combo} aspect ${aspect}: (${x},${y},${z}) → ${p.x.toFixed(3)},${p.y.toFixed(3)}`);
        }
        /* the fit is tight: the padded island just touches the 6% margin */
        for (const x of [padded.minX, padded.maxX]) for (const z of [padded.minZ, padded.maxZ]) for (const y of [G.SAND_Y, 2.9 + padded.maxY]) {
          const p = G.project({ x, y, z }, cam); worst = Math.max(worst, Math.abs(p.x), Math.abs(p.y));
        }
        assert.ok(near(worst, 0.94, 1e-6), 'tight fit ' + worst);
        assert.equal(fit.target.y, 0.3);
        assert.ok(near(fit.target.x, padded.cx) && near(fit.target.z, padded.cz));
      }
    }
  }
  /* zoom brings the camera in */
  const a = G.fitCamera({ aspect: 1 }), z = G.fitCamera({ aspect: 1, zoom: 2 });
  assert.ok(near(z.dist, a.dist / 2));
  /* the default view is straight on: camera on +z, above */
  assert.ok(a.position.z > a.target.z && a.position.y > 10 && near(a.position.x, a.target.x));
});

/* ---------------- the distance field ---------------- */
test('grid: distance field is 0 on land, grows away from it, and changes after an unlock', () => {
  const home = G.bakeField(['home']), withCove = G.bakeField(['home', 'cove']), all = G.bakeField(['home', 'cove', 'meadow']);
  assert.equal(home.shore.length, 64 * 40); assert.equal(home.locked.length, 64 * 40);
  assert.ok(home.shore instanceof Float32Array);
  const land = G.landFrom(['home']);
  let onLand = 0;
  for (let j = 0; j < home.h; j++) for (let i = 0; i < home.w; i++) {
    const x = home.x0 + (i + 0.5) * home.texel, z = home.z0 + (j + 0.5) * home.texel, cell = G.worldToCell(x, z);
    const v = home.shore[j * home.w + i];
    if (land[G.key(cell.c, cell.r)]) { assert.equal(v, 0); onLand++; } else assert.ok(v > 0, `(${x},${z}) off land`);
    assert.ok(near(G.sampleField(home, 'shore', x, z), v, 1e-6));
  }
  assert.equal(onLand, C.REGION_CELLS.home.length * 4);
  /* east of Home Island along row 4 the distance only grows, out to the field edge */
  let prev = 0;
  for (let x = 5.25; x < 16; x += 0.5) { const v = G.sampleField(home, 'shore', x, -0.25); assert.ok(v > prev, 'x ' + x); prev = v; }
  assert.ok(prev > 2.5, 'deep water before the field edge');
  /* unlocking the cove pulls the shore out to it */
  assert.ok(G.sampleField(home, 'shore', 7.25, -0.25) > 2);
  assert.equal(G.sampleField(withCove, 'shore', 7.25, -0.25), 0);
  assert.notDeepEqual(Array.from(home.shore), Array.from(withCove.shore));
  /* locked channel: negative inside locked land, positive outside, gone once all is open */
  assert.ok(G.sampleField(home, 'locked', 7.25, -0.25) < 0, 'inside the locked cove');
  assert.ok(G.sampleField(home, 'locked', -7.25, -0.25) < 0, 'inside the locked meadow');
  assert.ok(G.sampleField(home, 'locked', 0, 0) > 0, 'home is not locked');
  assert.ok(G.sampleField(withCove, 'locked', 7.25, -0.25) > 0, 'cove unlocked');
  assert.ok(G.sampleField(withCove, 'locked', -7.25, -0.25) < 0, 'meadow still locked');
  for (const v of all.locked) assert.equal(v, G.FIELD.far);
  /* RG8 packing decodes back within one step */
  const rg = G.packField(home, { maxShore: 4, maxLocked: 2 });
  assert.equal(rg.length, 64 * 40 * 2);
  for (let i = 0; i < home.w * home.h; i += 37) {
    assert.ok(Math.abs(rg[i * 2] / 255 * 4 - Math.min(4, home.shore[i])) <= 4 / 255 + 1e-6);
    const lv = Math.max(-2, Math.min(2, home.locked[i]));
    assert.ok(Math.abs((rg[i * 2 + 1] / 255 - 0.5) * 4 - lv) <= 4 / 255 + 1e-6);
  }
});

test('grid: lockedRegionAt finds the hologram region under a sea point', () => {
  assert.equal(G.lockedRegionAt(7.5, 0, ['home']), 'cove');
  assert.equal(G.lockedRegionAt(-7.5, 0, ['home']), 'meadow');
  assert.equal(G.lockedRegionAt(8.2, 0, ['home']), 'cove', 'the sandbar reaches 0.25 beyond its cells');
  assert.equal(G.lockedRegionAt(7.5, 0, ['home', 'cove']), null);
  assert.equal(G.lockedRegionAt(0, 0, ['home']), null);
  assert.equal(G.lockedRegionAt(0, 9, ['home']), null);
});

/* ---------------- deterministic charm ---------------- */
test('grid: jitter is deterministic, within ±8° and 0.94–1.06, and zero for non-organic kinds', () => {
  let lo = 0, hi = 0;
  for (let i = 1; i <= 500; i++) {
    const uid = 'p' + i, j = G.jitter(uid, 'tree_oak');
    assert.deepEqual(G.jitter(uid, 'tree_oak'), j);
    assert.ok(Math.abs(j.yawDeg) <= 8 && j.scale >= 0.94 && j.scale <= 1.06);
    assert.ok(near(j.yaw, j.yawDeg * Math.PI / 180));
    lo = Math.min(lo, j.yawDeg); hi = Math.max(hi, j.yawDeg);
  }
  assert.ok(lo < -6 && hi > 6, 'the range is used');
  for (const it of C.CATALOG) {
    const j = G.jitter('p7', it.id);
    if (L.LOOK[it.id].organic) assert.notDeepEqual(j, { yaw: 0, yawDeg: 0, scale: 1 }, it.id);
    else assert.deepEqual(j, { yaw: 0, yawDeg: 0, scale: 1 }, it.id);
  }
  assert.deepEqual(G.jitter('p7', false), { yaw: 0, yawDeg: 0, scale: 1 });
  assert.deepEqual(G.jitter('p7', true), G.jitter('p7', 'rock_mossy'));
});

test('grid: tufts, shells and wildflowers are deterministic and stay in their cell', () => {
  for (const k of Object.keys(G.landFrom(['home', 'cove', 'meadow']))) {
    const { c, r } = G.parseKey(k), ctr = G.cellCenter(c, r);
    const sets = [[G.tufts(c, r), 1, 2], [G.coveDeco(c, r), 2, 3], [G.wildflowers(c, r), 3, 5]];
    for (const [list, mn, mx] of sets) {
      assert.ok(list.length >= mn && list.length <= mx, k);
      for (const p of list) {
        assert.ok(Math.abs(p.x - ctr.x) <= 0.45 && Math.abs(p.z - ctr.z) <= 0.45, k);
        if (p.token) assert.ok(L.isToken(p.token), p.token);
      }
    }
    assert.deepEqual(G.tufts(c, r), G.tufts(c, r));
    assert.deepEqual(G.coveDeco(c, r), G.coveDeco(c, r));
  }
  assert.ok(G.coveDeco(14, 4).every((p) => p.kind === 'shell' || p.kind === 'starfish'));
});

test('grid: hash matches SLMotion.phaseOf so jitter and idle phases agree', () => {
  for (const uid of ['p1', 'p42', 'p999', 'pet_puppy']) assert.equal(G.hash01(uid), M.phaseOf(uid));
  assert.equal(G.hash('a'), 0xe40c292c, 'FNV-1a');
  const r1 = G.rng(5), r2 = G.rng(5);
  for (let i = 0; i < 10; i++) { const v = r1(); assert.equal(v, r2()); assert.ok(v >= 0 && v < 1); }
});

/* ---------------- networks, unlocks, anchors ---------------- */
test('grid: the path flood fill groups connected paths and orders them by distance', () => {
  const placed = [
    { uid: 'h', id: 'house_cottage', x: 6, y: 2 },
    { uid: 'a', id: 'path_stone', x: 7, y: 4 }, { uid: 'b', id: 'path_stone', x: 7, y: 5 }, { uid: 'c', id: 'path_wood', x: 7, y: 6 },
    { uid: 'd', id: 'path_stone', x: 8, y: 7 },
    { uid: 'e', id: 'path_flower', x: 4, y: 6 }, { uid: 'f', id: 'path_flower', x: 3, y: 6 },
    { uid: 't', id: 'tree_oak', x: 5, y: 6 }
  ];
  const nets = G.pathNetworks(placed);
  assert.equal(nets.length, 3);
  assert.deepEqual(nets.map((n) => n.cells.map((p) => p.uid)), [['a', 'b', 'c'], ['e', 'f'], ['d']]);
  assert.deepEqual(nets[0].cells.map((p) => p.d), [0, 1, 2]);
  assert.equal(nets[0].maxD, 2);
  assert.deepEqual(nets[0].root, { c: 7, r: 4 });
  /* an explicit origin re-roots the wave */
  const fromSouth = G.pathNetworks(placed, { c: 7, r: 9 });
  assert.deepEqual(fromSouth[0].cells.map((p) => p.uid), ['d']);
  assert.deepEqual(fromSouth[1].cells.map((p) => [p.uid, p.d]), [['c', 0], ['b', 1], ['a', 2]]);
  /* a branching network orders by BFS steps */
  const tee = [{ uid: 1, id: 'path_stone', x: 5, y: 5 }, { uid: 2, id: 'path_stone', x: 6, y: 5 }, { uid: 3, id: 'path_stone', x: 7, y: 5 },
               { uid: 4, id: 'path_stone', x: 6, y: 4 }, { uid: 5, id: 'path_stone', x: 6, y: 3 }];
  const n = G.pathNetworks(tee, { c: 5, r: 5 });
  assert.equal(n.length, 1);
  assert.deepEqual(n[0].cells.map((p) => p.d), [0, 1, 2, 2, 3]);
  assert.deepEqual(G.pathNetworks([]), []);
  assert.equal(G.pathNetworks(starterWorld().placed).reduce((a, x) => a + x.cells.length, 0), 4);
});

test('grid: land rises outward from the home shore, 0.05 s apart', () => {
  for (const region of ['cove', 'meadow']) {
    const order = G.riseOrder(region, ['home']);
    assert.equal(order.length, C.REGION_CELLS[region].length);
    assert.equal(new Set(order.map((p) => p.key)).size, order.length);
    for (let i = 1; i < order.length; i++) {
      assert.ok(order[i].dist >= order[i - 1].dist, region + ' outward');
      assert.ok(near(order[i].delay - order[i - 1].delay, G.RISE.stagger));
    }
    assert.ok(order[0].dist < 1, 'starts at the shore');
    assert.ok(M.riseDur(order.length) <= 1.3, region + ' rise ' + M.riseDur(order.length));
    assert.deepEqual(G.riseOrder(region, ['home', region]), order, 'the new region itself is not the shore');
  }
});

test('grid: lock signs sit on the outer edge of their region', () => {
  const cove = G.signAnchor('cove'), meadow = G.signAnchor('meadow');
  assert.equal(cove.side, 'east'); assert.equal(cove.x, G.regionBounds('cove').maxX);
  assert.equal(meadow.side, 'west'); assert.equal(meadow.x, G.regionBounds('meadow').minX);
  for (const a of [cove, meadow]) {
    const inside = G.worldToCell(a.x + (a.side === 'east' ? -0.01 : 0.01), a.z);
    assert.equal(G.regionOf(inside.c, inside.r), a.region, a.region + ' sign is against its own cells');
    assert.ok(a.y > G.SEA_Y);
  }
  assert.equal(G.signAnchor('home'), null);
  assert.equal(G.signAnchor('nowhere'), null);
});

test('grid: the avatar stands on the left entrance cell, which the rules keep free', () => {
  const w = starterWorld(), spot = G.avatarSpot(w.placed);
  const house = w.placed.find((p) => p.id === 'house_cottage');
  assert.deepEqual([spot.c, spot.r], [house.x, house.y + 2]);
  assert.equal(spot.x, house.x - 7.5); assert.equal(spot.z, house.y + 2 - 4.5);
  const occ = C.occupancy(w).occ[G.key(spot.c, spot.r)];
  assert.ok(!occ || occ.layer === 'ground', 'no object on the avatar spot');
  assert.equal(G.avatarSpot([]), null);
});

test('grid: landFrom accepts region lists, cell sets and worlds', () => {
  assert.equal(Object.keys(G.landFrom()).length, C.REGION_CELLS.home.length);
  assert.equal(Object.keys(G.landFrom(['home', 'meadow'])).length, C.REGION_CELLS.home.length + C.REGION_CELLS.meadow.length);
  assert.deepEqual(G.landFrom(worldWith(['home', 'cove'])), C.landSet(worldWith(['home', 'cove'])));
  const set = { '1,1': 1 };
  assert.equal(G.landFrom(set), set);
  assert.deepEqual(G.landFrom(['3,4', 'cove']), Object.assign({ '3,4': 1 }, G.landFrom(['cove'])));
});

test('grid: loads as a browser global after world-core and world-look', () => {
  const ctx = {};
  ctx.self = ctx;
  const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
  vm.runInNewContext(read('world/island3d/grid3d.js'), ctx);   /* order does not matter: lookups are lazy */
  vm.runInNewContext(read('world/world-core.js'), ctx);
  vm.runInNewContext(read('world/world-look.js'), ctx);
  assert.ok(ctx.SLGrid3D);
  const plain = (o) => JSON.parse(JSON.stringify(o));      /* objects from another realm */
  assert.deepEqual(plain(ctx.SLGrid3D.pivot('house_cottage', 6, 2)), { x: -1, y: 0, z: -2 });
  assert.deepEqual(plain(ctx.SLGrid3D.hitSize('lighthouse')), [1, 2.8, 1]);
  assert.equal(ctx.SLGrid3D.surfaceY(0, 4), 0.45);
});
