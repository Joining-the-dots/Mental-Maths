'use strict';
/* My Island 3D — the organic terrain (world/island3d/terrain3d.js): pure, no THREE. The invariants that
   keep the rules exact (pads at surfaceY, the coast never inside a cell, scenery clear of every
   region), determinism per child, the tier triangle table and the bake time. */
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../world/island3d/terrain3d.js');
const C = require('../world/world-core.js');
const L = require('../world/world-look.js');
const G = require('../world/island3d/grid3d.js');
const Tier = require('../world/island3d/tier.js');

const COMBOS = [['home'], ['home', 'cove'], ['home', 'meadow'], ['home', 'cove', 'meadow']];
const TIERS = ['LOW', 'MID', 'HIGH'];
const EPS = 1e-9;
const cache = new Map();
function bake(combo, tier, seed = 'kid-ada') {
  const key = combo.join('+') + '|' + tier + '|' + seed;
  if (!cache.has(key)) cache.set(key, T.bake(combo, { tier, seed }));
  return cache.get(key);
}
function landOf(combo) { return G.landFrom(combo); }
function cellsOf(combo) { return Object.keys(landOf(combo)).map((k) => G.parseKey(k)); }
function inSquare(x, z, c, r, shrink = 0) { return x > c - 8 + shrink && x < c - 7 - shrink && z > r - 5 + shrink && z < r - 4 - shrink; }
function onClosed(x, z, c, r) { return x >= c - 8 - EPS && x <= c - 7 + EPS && z >= r - 5 - EPS && z <= r - 4 + EPS; }
function squareDist(x, z, c, r) {
  const dx = Math.max(c - 8 - x, 0, x - (c - 7)), dz = Math.max(r - 5 - z, 0, z - (r - 4));
  return Math.hypot(dx, dz);
}
function vertices(a) {
  const out = [];
  for (let v = 0; v < a.position.length / 3; v++) out.push({ x: a.position[v * 3], y: a.position[v * 3 + 1], z: a.position[v * 3 + 2], nx: a.normal[v * 3], ny: a.normal[v * 3 + 1], nz: a.normal[v * 3 + 2] });
  return out;
}

/* ---------------- shape ---------------- */
test('terrain3d: loads in Node without THREE; the lattice spacing is the tier budget and divides 1', () => {
  assert.equal(typeof T.bake, 'function');
  for (const fn of ['meshArrays', 'sceneryArrays', 'scatter', 'dressingArrays', 'mergeArrays', 'sliceBands', 'heightAt', 'zoneAt', 'coastAt', 'landDist']) assert.equal(typeof T[fn], 'function', fn);
  for (const tier of TIERS) {
    assert.equal(T.SPACING[tier], Tier.budget(tier, 1).terrainSpacing, tier + ' spacing = tier.js terrainSpacing');
    assert.equal(1 / T.SPACING[tier] % 1, 0, 'divides 1: cell edges are lattice lines');
  }
  assert.deepEqual([T.DOMAIN.x0, T.DOMAIN.x1, T.DOMAIN.z0, T.DOMAIN.z1], [-11, 11, -8, 8]);
  assert.ok(T.COAST.sigma >= 0.35 && T.COAST.sigma <= 0.7, 'blur in the plan range 0.35–0.7');
  assert.equal(T.COAST.beach, 0.14);
  assert.equal(T.COAST.min, 0.16); assert.equal(T.COAST.max, 0.85);
  assert.ok(G.FIELD.w === 64 && G.FIELD.h === 40, 'grid3d stays frozen');
});

/* ---------------- pads ---------------- */
test('terrain3d: every terrain vertex inside an unlocked cell sits exactly at surfaceY with an up normal', () => {
  for (const tier of TIERS) for (const combo of COMBOS) {
    const cells = cellsOf(combo), mesh = T.meshArrays(bake(combo, tier));
    let inside = 0;
    for (const v of vertices(mesh)) {
      const holders = cells.filter((p) => onClosed(v.x, v.z, p.c, p.r));
      if (!holders.length) continue;
      const strict = holders.find((p) => inSquare(v.x, v.z, p.c, p.r));
      /* positions are float32 on the GPU: a pad is exactly fround(surfaceY) */
      if (strict) {
        inside++;
        assert.equal(v.y, Math.fround(G.surfaceY(strict.c, strict.r)), `${tier} ${combo} pad (${v.x}, ${v.z}) y ${v.y}`);
        assert.ok(v.nx === 0 && v.ny === 1 && v.nz === 0, `${tier} ${combo} pad normal at (${v.x}, ${v.z})`);
      } else {
        /* a vertex on a cell edge: exactly one of the touching pads (a step keeps both pads exact) */
        const ys = holders.map((p) => Math.fround(G.surfaceY(p.c, p.r)));
        assert.ok(ys.includes(v.y) || v.ny !== 1 || Math.abs(v.nx) + Math.abs(v.nz) > 0, `${tier} ${combo} edge vertex (${v.x}, ${v.z}) y ${v.y} in ${ys}`);
        if (v.ny === 1 && v.nx === 0 && v.nz === 0) assert.ok(ys.includes(v.y), 'a flat edge vertex is on a pad');
      }
    }
    assert.ok(inside > cells.length * (tier === 'LOW' ? 0.9 : 3), `${tier} ${combo}: pads are tessellated (${inside})`);
  }
});

test('terrain3d: the lattice keeps pads exact and never moves a land node', () => {
  for (const tier of TIERS) for (const combo of COMBOS) {
    const bk = bake(combo, tier), Lt = bk.lattice, cells = cellsOf(combo);
    for (let k = 0; k < Lt.X.length; k++) {
      const holders = cells.filter((p) => onClosed(Lt.X[k], Lt.Z[k], p.c, p.r));
      if (!(Lt.flags[k] & 1)) {
        assert.equal(holders.length, 0, `${tier} ${combo}: a node in a cell is a land node`);
        continue;
      }
      assert.ok(holders.length > 0);
      assert.ok(Math.abs(Lt.X[k] - (T.DOMAIN.x0 + (k % Lt.nx) * Lt.sp)) < EPS && Math.abs(Lt.Z[k] - (T.DOMAIN.z0 + Math.floor(k / Lt.nx) * Lt.sp)) < EPS, 'land nodes never slide');
      assert.equal(Lt.H[k], Math.fround(Math.max(...holders.map((p) => G.surfaceY(p.c, p.r)))));
      assert.ok(Lt.S[k] <= -T.COAST.beach + 1e-9, 'land nodes are well inside the coast');
    }
  }
});

/* ---------------- the coast ---------------- */
test('terrain3d: the coast never enters a cell — s ≤ −0.14 at every point of every cell edge', () => {
  for (const combo of COMBOS) {
    const bk = bake(combo, 'MID');
    for (const p of cellsOf(combo)) {
      const x0 = p.c - 8, z0 = p.r - 5;
      for (let u = 0; u <= 1 + EPS; u += 1 / 32) {
        for (const [x, z] of [[x0 + u, z0], [x0 + u, z0 + 1], [x0, z0 + u], [x0 + 1, z0 + u]]) {
          const s = T.coastAt(bk, x, z);
          assert.ok(s <= -T.COAST.beach + 1e-6, `${combo} cell ${p.c},${p.r} edge (${x}, ${z}) s ${s}`);
        }
      }
    }
    /* and every lattice node on a cell edge, every tier */
    for (const tier of TIERS) {
      const Lt = bake(combo, tier).lattice;
      for (let k = 0; k < Lt.X.length; k++) if (Lt.flags[k] & 1) assert.ok(Lt.S[k] <= -0.14 + 1e-9);
    }
  }
});

test('terrain3d: coastlines are closed loops on s = 0, outside every cell, and the waterline vertices sit on them', () => {
  for (const combo of COMBOS) {
    const bk = bake(combo, 'MID'), cells = cellsOf(combo), main = bk.coastLines[0];
    assert.ok(main && main.closed && main.pts.length / 2 > 60, combo + ' one big closed coast');
    for (const ln of bk.coastLines) {
      for (let k = 0; k < ln.pts.length; k += 2) {
        const x = ln.pts[k], z = ln.pts[k + 1];
        assert.ok(Math.abs(T.coastAt(bk, x, z)) < 0.02, 'on s = 0');
        assert.ok(cells.every((p) => squareDist(x, z, p.c, p.r) >= T.COAST.beach - 0.02), `${combo} coast point (${x}, ${z}) keeps ≥ 0.14 of beach`);
      }
    }
    /* surface nets: snapped vertices are exactly on the waterline, never inside a cell */
    const Lt = bk.lattice;
    let snapped = 0;
    for (let k = 0; k < Lt.X.length; k++) {
      if (!(Lt.flags[k] & 4)) continue;
      snapped++;
      assert.ok(cells.every((p) => !inSquare(Lt.X[k], Lt.Z[k], p.c, p.r)));
      if (Lt.S[k] === 0) assert.equal(Lt.H[k], Math.fround(G.SEA_Y - T.PROFILE.waterEps), 'a waterline vertex sits at the waterline');
    }
    assert.ok(snapped > 40, combo + ' surface nets move coast nodes');
  }
});

test('terrain3d: heights — pads exact, the ground falls to the sea outside, and stays under it beyond the coast', () => {
  for (const combo of COMBOS) {
    const bk = bake(combo, 'MID'), cells = cellsOf(combo);
    for (const p of cells) assert.equal(T.heightAt(bk, p.c - 7.5, p.r - 4.5), G.surfaceY(p.c, p.r));
    for (let x = -10.9; x < 10.9; x += 0.37) for (let z = -7.9; z < 7.9; z += 0.41) {
      if (cells.some((p) => inSquare(x, z, p.c, p.r))) continue;
      const s = T.coastAt(bk, x, z), h = T.heightAt(bk, x, z);
      assert.ok(h <= G.MAX_TOP + T.PROFILE.rim + 1e-9, 'never above the highest terrace + the bluff rim');
      if (s > 0.02) assert.ok(h < G.SEA_Y, `beyond the coast (${x}, ${z}) stays under the sea: ${h}`);
      if (s < -0.25 && T.landDist(bk, x, z) < 0.05) assert.ok(h > G.SEA_Y, 'the lip next to a pad is dry');
    }
  }
});

/* ---------------- determinism and the per-child coast ---------------- */
test('terrain3d: a bake is deterministic, and a child keeps the same coast on reload', () => {
  for (const tier of TIERS) {
    const a = T.bake(['home', 'cove'], { tier, seed: 'kid-ada' }), b = T.bake(['home', 'cove'], { tier, seed: 'kid-ada' });
    assert.deepEqual(a.field.data, b.field.data);
    assert.deepEqual(T.meshArrays(a).position, T.meshArrays(b).position);
    const sa = T.sceneryArrays(a), sb = T.sceneryArrays(b);
    assert.deepEqual(sa.position, sb.position); assert.deepEqual(sa.color, sb.color);
    assert.deepEqual(T.dressingArrays(a, []).position, T.dressingArrays(b, []).position);
    assert.deepEqual(a.coastLines.map((l) => Array.from(l.pts)), b.coastLines.map((l) => Array.from(l.pts)));
  }
  assert.deepEqual(T.seedOffset('kid-ada'), T.seedOffset('kid-ada'));
  assert.notDeepEqual(T.seedOffset('kid-ada'), T.seedOffset('kid-ben'));
});

test('terrain3d: two profile keys give visibly different coastlines', () => {
  for (const combo of COMBOS) {
    const a = bake(combo, 'MID', 'kid-ada'), b = bake(combo, 'MID', 'kid-ben');
    let moved = 0, n = 0;
    const lnA = a.coastLines[0].pts;
    for (let k = 0; k < lnA.length; k += 2) {
      n++;
      if (Math.abs(T.coastAt(b, lnA[k], lnA[k + 1])) > 0.08) moved++;
    }
    assert.ok(moved / n > 0.3, `${combo}: ${Math.round(100 * moved / n)}% of the coast moved by > 0.08 u`);
    const bouldersA = JSON.stringify(a.structures.boulders.map((q) => [q.x.toFixed(2), q.z.toFixed(2)]));
    assert.notEqual(bouldersA, JSON.stringify(b.structures.boulders.map((q) => [q.x.toFixed(2), q.z.toFixed(2)])), 'boulder runs differ');
  }
});

test('terrain3d: an unlock never re-rolls the coast away from the new region', () => {
  const pairs = [[['home'], ['home', 'cove'], 'cove'], [['home'], ['home', 'meadow'], 'meadow'], [['home', 'cove'], ['home', 'cove', 'meadow'], 'meadow']];
  for (const [before, after, region] of pairs) {
    const a = bake(before, 'MID'), b = bake(after, 'MID'), cells = C.REGION_CELLS[region].map((k) => G.parseKey(k));
    let checked = 0;
    /* the coastal band (|s| < 1): deep inland only the interior distance changes, the coast does not */
    for (let x = -10.5; x <= 10.5; x += 0.125) for (let z = -7.5; z <= 7.5; z += 0.125) {
      if (cells.some((p) => squareDist(x, z, p.c, p.r) < 3.2) || Math.abs(T.coastAt(a, x, z)) > 1) continue;
      checked++;
      assert.ok(Math.abs(T.coastAt(a, x, z) - T.coastAt(b, x, z)) < 1e-4, `${region} unlock moved the coast at (${x}, ${z})`);
    }
    assert.ok(checked > 400, 'enough coast checked: ' + checked);
  }
});

/* ---------------- scenery ---------------- */
test('terrain3d: no scenery inside the exclusion zone (every region cell, locked too, dilated 0.3 u)', () => {
  const Mg = G.MARGIN;
  for (const tier of TIERS) for (const combo of COMBOS) {
    const bk = bake(combo, tier), land = landOf(combo), sc = T.sceneryArrays(bk);
    const locked = [], open = [];
    Object.keys(C.CELL_REGION).forEach((k) => (land[k] ? open : locked).push(G.parseKey(k)));
    const all = locked.concat(open);
    for (let v = 0; v < sc.position.length / 3; v++) {
      const x = sc.position[v * 3], z = sc.position[v * 3 + 2];
      for (const p of locked) assert.ok(squareDist(x, z, p.c, p.r) >= T.EXCLUDE - 1e-6, `${tier} ${combo}: scenery at (${x.toFixed(3)}, ${z.toFixed(3)}) inside locked ${p.c},${p.r}`);
      /* beach-band scenery for the current land may reach the margins, never a pad's buildable interior */
      for (const p of open) assert.ok(!inSquare(x, z, p.c, p.r, Mg), `${tier} ${combo}: scenery inside ${p.c},${p.r}'s interior`);
    }
    /* the fixed off-grid pieces keep the full 0.3 u from every region cell: deck edges (both sides of
       every centre point), the islet and stacks, the lookout's corners */
    const S = bk.structures, fixed = [];
    S.decks.filter((d) => d.name !== 'promenade').forEach((d) => d.pts.forEach((q, k) => {
      const a = d.pts[Math.max(0, k - 1)], b = d.pts[Math.min(d.pts.length - 1, k + 1)], l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      const nx = -(b.z - a.z) / l, nz = (b.x - a.x) / l;
      fixed.push([q.x + nx * d.w / 2, q.z + nz * d.w / 2, 0], [q.x - nx * d.w / 2, q.z - nz * d.w / 2, 0]);
    }));
    fixed.push([S.islet.x, S.islet.z, S.islet.r * 1.08], ...S.stacks.map((q) => [q.x, q.z, q.r * 1.1]));
    if (S.lookout) [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach((q) => fixed.push([S.lookout.x + q[0] * S.lookout.w / 2, S.lookout.z + q[1] * S.lookout.d / 2, 0]));
    for (const [x, z, r] of fixed) for (const p of all) assert.ok(squareDist(x, z, p.c, p.r) >= T.EXCLUDE + r - 1e-6, `${combo}: (${x}, ${z}) r ${r} too close to ${p.c},${p.r}`);
    /* the neon accents follow the same rule */
    for (const n of sc.neon) for (const p of locked) assert.ok(squareDist(n.x, n.z, p.c, p.r) >= T.EXCLUDE - 1e-6, 'neon outside locked land');
  }
});

test('terrain3d: structures — walls only on the meadow drop, the fixed pieces where the plan puts them', () => {
  for (const combo of COMBOS) {
    const S = bake(combo, 'MID').structures, meadow = combo.includes('meadow'), cove = combo.includes('cove');
    assert.equal(S.walls.length > 0, meadow, 'retaining walls exactly when Meadow Hill is unlocked');
    S.walls.forEach((w) => assert.ok(w.yHigh - w.yLow >= 0.145 && Math.abs(w.nx) + Math.abs(w.nz) === 1));
    const names = S.decks.map((d) => d.name);
    assert.ok(names.includes('promenade') && names.includes('jetty'));
    assert.equal(names.includes('pier'), cove, 'the Cove Pier needs the cove');
    assert.equal(!!S.lookout, meadow, 'the Meadow Lookout needs the meadow');
    const prom = S.decks.find((d) => d.name === 'promenade');
    assert.ok(prom.pts[0].x >= -3 - EPS && prom.pts[prom.pts.length - 1].x <= 3 + EPS && prom.pts.every((p) => p.z > 4), 'the South Promenade runs x -3…+3 on the south beach');
    const jetty = S.decks.find((d) => d.name === 'jetty');
    assert.ok(Math.hypot(jetty.pts[0].x - 4.2, jetty.pts[0].z + 5.8) < 1e-9, 'the NE Ferry Jetty reaches (4.2, -5.8)');
    assert.ok(Math.abs(S.abutment.x + 3.2) < EPS && S.abutment.z1 < -4.45 && S.abutment.z0 > -4.45, 'the abutment deck spans (-3.2, -4.45)');
    assert.deepEqual([S.islet.x, S.islet.z, S.islet.r, S.islet.h], [-8, -5.4, 0.7, 0.6]);
    assert.equal(S.stacks.length, 2);
    S.decks.forEach((d) => d.posts.forEach((k) => assert.ok(T.heightAt(bake(combo, 'MID'), d.pts[k].x, d.pts[k].z) < G.SEA_Y + 0.02, 'posts only over water')));
    S.boulders.forEach((b) => assert.ok(b.r >= 0.12 - EPS && b.r <= 0.32 + EPS && b.variant >= 0 && b.variant < 4));
  }
});

test('terrain3d: anchors for the city bridge, boats and life', () => {
  const A = bake(['home', 'cove', 'meadow'], 'MID').anchors;
  assert.ok(Math.abs(A.abutment.x + 3.2) < EPS && A.abutment.y > G.SEA_Y);
  assert.ok(A.jetty.start && A.jetty.end && A.promenade.length > 10 && A.islet && A.stacks.length === 2 && A.buoys.length === 2);
  assert.ok(A.beachLoop.length > 20 && A.beachLoop.every((p) => p.y > G.SEA_Y), 'a dry loop round the land');
  assert.ok(A.pier && A.lookout);
});

/* ---------------- the sea field ---------------- */
test('terrain3d: the sea field — R hugs the organic coast, G previews each locked region\'s future coast, B marks lagoons', () => {
  for (const combo of COMBOS) {
    const bk = bake(combo, 'MID'), f = bk.field, cells = cellsOf(combo);
    assert.equal(f.data.length, 128 * 80 * 4);
    assert.deepEqual([f.w, f.h, f.x0, f.z0, f.texel], [128, 80, -16.125, -10.125, 0.25]);
    const at = (arr, x, z) => arr[Math.round((z - f.z0) / f.texel - 0.5) * f.w + Math.round((x - f.x0) / f.texel - 0.5)];
    for (const p of cells) {
      assert.equal(at(f.shore, p.c - 7.5, p.r - 4.5), 0, 'R = 0 on land');
      assert.ok(at(f.locked, p.c - 7.5, p.r - 4.5) > 0, 'no hologram over the land already there');
    }
    /* a locked cell out in the water shows the hologram; one already under today's beach is hidden by it */
    const lockedCells = Object.keys(C.CELL_REGION).filter((k) => !landOf(combo)[k]).map((k) => G.parseKey(k));
    for (const p of lockedCells) {
      if (T.coastAt(bk, p.c - 7.5, p.r - 4.5) > 0) assert.ok(at(f.locked, p.c - 7.5, p.r - 4.5) < 0, `${combo}: locked ${p.c},${p.r} is inside its future coast`);
    }
    assert.ok(lockedCells.length === 0 || lockedCells.filter((p) => at(f.locked, p.c - 7.5, p.r - 4.5) < 0).length >= lockedCells.length * 0.6);
    if (!lockedCells.length) assert.ok(f.locked.every((g) => g > 0), 'all land: no hologram');
    assert.ok(at(f.shore, 0, -9) < 0.5, 'the quay gets foam');
    assert.ok(at(f.shore, -8, -5.4) === 0 && at(f.shore, -8, -6.4) < 0.4, 'Lantern Islet gets foam');
    assert.ok(at(f.shore, 12, 8) > 2, 'open sea far out');
    assert.ok(f.lagoon.every((v, i) => v >= 0 && v <= 1 && (v === 0 || f.shore[i] > 0)));
    /* R = the distance to the nearest shore: the island's organic coast, Lantern Islet, the stacks or the quay */
    const I = T.STRUCT.islet;
    for (let k = 0; k < f.w * f.h; k += 37) {
      const x = f.x0 + (k % f.w + 0.5) * f.texel, z = f.z0 + (Math.floor(k / f.w) + 0.5) * f.texel;
      const island = Math.max(0, T.coastAt(bk, x, z));
      const others = Math.min(Math.hypot(x - I.x, z - I.z) - I.r - 0.05, ...T.STRUCT.stacks.map((q) => Math.hypot(x - q.x, z - q.z) - q.r - 0.04), T.quayDist(x, z));
      assert.ok(f.shore[k] <= island + 1e-4, 'never farther than the island coast');
      if (others > island + 1e-3) assert.ok(Math.abs(f.shore[k] - island) < 1e-4, `R follows the island coast at (${x}, ${z})`);
      else assert.ok(Math.abs(f.shore[k] - Math.max(0, others)) < 1e-3, `R follows the nearer islet / stack / quay at (${x}, ${z})`);
    }
  }
});

/* ---------------- budgets and time ---------------- */
test('terrain3d: triangle counts per tier stay inside the plan\'s performance table', () => {
  for (const tier of TIERS) for (const combo of COMBOS) {
    const bk = bake(combo, tier), B = T.BUDGET[tier];
    const ter = T.meshArrays(bk), sc = T.sceneryArrays(bk), dr = T.dressingArrays(bk, []);
    assert.ok(ter.tris <= B.terrain, `${tier} ${combo} terrain ${ter.tris} > ${B.terrain}`);
    assert.ok(sc.tris <= B.scenery, `${tier} ${combo} scenery ${sc.tris} > ${B.scenery}`);
    assert.ok(dr.tris <= B.dressing, `${tier} ${combo} dressing ${dr.tris} > ${B.dressing}`);
    assert.ok(ter.verts < 65536 || ter.index instanceof Uint32Array, 'index width fits');
    assert.ok(sc.neon.length < 160, 'neon accents stay one modest instanced draw');
  }
  assert.deepEqual(T.BUDGET.LOW, { terrain: 1400, scenery: 2500, dressing: 1500 });
  assert.deepEqual(T.BUDGET.MID, { terrain: 5500, scenery: 5000, dressing: 3000 });
  assert.deepEqual(T.BUDGET.HIGH, { terrain: 12000, scenery: 6000, dressing: 4500 });
});

test('terrain3d: bake(all land) runs well under 30 ms in Node (every tier and land combo)', () => {
  T.bake(['home', 'cove'], { tier: 'HIGH', seed: 'warm-up' });           /* JIT warm-up */
  T.bake(['home', 'meadow'], { tier: 'LOW', seed: 'warm-up' });
  for (const tier of TIERS) for (const combo of COMBOS) {
    const times = [0, 1, 2].map((i) => T.bake(combo, { tier, seed: 'timing-' + i }).ms).sort((a, b) => a - b);
    assert.ok(times[1] < 30, `${tier} ${combo}: median bake ${times[1].toFixed(1)} ms`);
  }
});

/* ---------------- grid3d is frozen ---------------- */
test('terrain3d: grid3d is untouched — rayToCell, pivot and plinth give the same answers', () => {
  const before = JSON.stringify([G.pivot('house_cottage', 6, 2), G.plinth('att_kart', 3, 7), G.surfaceY(0, 3), G.cellTop(5, 5, G.landFrom(['home']))]);
  T.bake(['home', 'cove', 'meadow'], { tier: 'MID', seed: 'x' });
  assert.equal(JSON.stringify([G.pivot('house_cottage', 6, 2), G.plinth('att_kart', 3, 7), G.surfaceY(0, 3), G.cellTop(5, 5, G.landFrom(['home']))]), before);
  assert.deepEqual(G.pivot('house_cottage', 6, 2), { x: -1, y: 0, z: -2 });
  const ray = G.rayToCell({ x: 0, y: 10, z: 10 }, { x: 0, y: -1, z: -1 }, ['home']);
  assert.deepEqual([ray.c, ray.r, ray.land], [8, 5, true]);
  assert.equal(G.plinth('att_kart', 3, 7).top, G.TERRACE[3]);
});

/* ---------------- colour: never a checker ---------------- */
test('terrain3d: turf is world-noise, never a checker; sand, rock and wet bands come from the v2 land tokens', () => {
  const bk = bake(['home'], 'MID'), mesh = T.meshArrays(bk);
  /* compare cells by parity: the mean green of even and odd cells differ by < 2% */
  const sums = [[0, 0], [0, 0]];
  for (let v = 0; v < mesh.position.length / 3; v++) {
    const x = mesh.position[v * 3], z = mesh.position[v * 3 + 2], c = Math.floor(x + 8), r = Math.floor(z + 5);
    if (!inSquare(x, z, c, r) || !landOf(['home'])[c + ',' + r]) continue;
    const p = (c + r) & 1;
    sums[p][0] += mesh.color[v * 3 + 1]; sums[p][1]++;
  }
  const even = sums[0][0] / sums[0][1], odd = sums[1][0] / sums[1][1];
  assert.ok(Math.abs(even - odd) / even < 0.02, `checker-free: ${even.toFixed(4)} vs ${odd.toFixed(4)}`);
  /* the turf palette leans on Turf: ±5% lightness, ±4° hue round its blend of the four land greens */
  const lin = (h) => [1, 3, 5].map((i) => { const v = parseInt(h.slice(i, i + 2), 16) / 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  const turf = lin(L.hex('Turf')), g = even;
  assert.ok(Math.abs(g - turf[1]) / turf[1] < 0.2, 'average pad green near Turf');
  for (const tok of ['Turf', 'Turf Shade', 'Hill Moss', 'Leaf Lit', 'Dune', 'Wet Dune', 'Cliff Rock']) assert.ok(L.isToken(tok), tok);
  /* every zone a vertex can take is a real zone */
  const zones = new Set(Array.from(bk.lattice.zone));
  zones.forEach((z) => assert.ok(Object.values(T.ZONES).includes(z)));
  assert.ok(zones.has(T.ZONES.pad) && zones.has(T.ZONES.wet) && (zones.has(T.ZONES.sand) || zones.has(T.ZONES.rock)));
});

/* ---------------- dressing ---------------- */
test('terrain3d: dressing is world-space, deterministic, clear of items and paths, and by zone', () => {
  const u = { points: 0 };
  C.grantStarter(u, Date.UTC(2026, 0, 1));
  const placed = u.world.placed, bk = bake(['home', 'cove', 'meadow'], 'MID');
  const a = T.scatter(bk, placed), b = T.scatter(bk, placed);
  assert.deepEqual(a, b, 'deterministic');
  assert.ok(a.pieces.length > 80);
  const kinds = new Set(a.pieces.map((p) => p.kind));
  for (const k of ['tuft', 'flowers', 'shell']) assert.ok(kinds.has(k), k + ' present');
  for (const p of a.pieces) {
    assert.ok(p.yaw >= 0 && p.yaw <= Math.PI * 2 + 1e-9 && p.s >= 0.7 - 1e-9 && p.s <= 1.25 + 1e-9 && Math.abs(p.tint - 1) <= 0.06 + 1e-9);
    for (const it of placed) {
      const item = C.item(it.id), fp = item.fp || [1, 1];
      if (item.kind === 'path') assert.ok(!(p.x >= it.x - 8 && p.x < it.x - 7 && p.z >= it.y - 5 && p.z < it.y - 4), 'never on a path cell');
      else if (p.kind !== 'tuft') assert.ok(!(p.x > it.x - 8 && p.x < it.x + fp[0] - 8 && p.z > it.y - 5 && p.z < it.y + fp[1] - 5), `${p.kind} under ${it.id}`);
      else assert.ok(!(p.x > it.x - 8 + G.MARGIN && p.x < it.x + fp[0] - 8 - G.MARGIN && p.z > it.y - 5 + G.MARGIN && p.z < it.y + fp[1] - 5 - G.MARGIN), 'tufts only in margins');
    }
    const z = T.zoneAt(bk, p.x, p.z);
    if (p.kind === 'shell' || p.kind === 'starfish') {
      assert.ok(z === T.ZONES.sand || z === T.ZONES.sandPad, 'shells and starfish only on sand');
      if (z === T.ZONES.sand) { const d = T.landDist(bk, p.x, p.z); assert.ok(d / (d - T.coastAt(bk, p.x, p.z)) > 0.4 - 1e-6, 'beyond t 0.4'); }
    }
    if (p.kind === 'pebble' || p.kind === 'moss') assert.equal(z, T.ZONES.rock);
    assert.ok(Math.abs(p.y - (T.heightAt(bk, p.x, p.z) - 0.004)) < 1e-9, 'sits on the ground');
  }
  /* world-space blue noise, not per cell: pieces are not bunched on the cell rings of v1 */
  const nearCentre = a.pieces.filter((p) => Math.hypot(p.x - (Math.floor(p.x) + 0.5), p.z - (Math.floor(p.z) + 0.5)) < 0.15).length;
  assert.ok(nearCentre / a.pieces.length < 0.2);
  /* an empty island dresses more; a move re-scatters only the layout, never the points */
  assert.ok(T.scatter(bk, []).pieces.length > a.pieces.length * 0.9);
  assert.equal(bk.points, bake(['home', 'cove', 'meadow'], 'MID').points);
});

/* ---------------- array utilities ---------------- */
test('terrain3d: mergeArrays and sliceBands keep every triangle once, in the right band', () => {
  const bk = bake(['home', 'cove'], 'MID'), ter = T.meshArrays(bk), sc = T.sceneryArrays(bk);
  const m = T.mergeArrays([ter, sc]);
  assert.equal(m.tris, ter.tris + sc.tris);
  assert.equal(m.verts, ter.verts + sc.verts);
  assert.equal(m.cell.length, m.tris);
  const cove = C.REGION_CELLS.cove.map((k) => { const p = G.parseKey(k); return p.c + 16 * p.r; });
  const bandOf = {};
  cove.forEach((id, i) => { bandOf[id] = i % 3; });
  const bands = T.sliceBands(m, bandOf, 3);
  let expect = 0;
  for (let t = 0; t < m.tris; t++) if (bandOf[m.cell[t]] != null) expect++;
  assert.equal(bands.reduce((s, b) => s + b.tris, 0), expect);
  assert.ok(expect > 50, 'the cove has its own triangles to raise');
  bands.forEach((b) => { assert.equal(b.position.length, b.tris * 9); assert.equal(b.index, null); });
});
