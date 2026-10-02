'use strict';
/* My Island 3D — environment pure helpers (world/island3d/env.js). No THREE / WebGL in Node:
   create() is exercised in the browser lab; everything it computes from data is tested here. */
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../world/island3d/env.js');
const C = require('../world/world-core.js');
const L = require('../world/world-look.js');
const G = require('../world/island3d/grid3d.js');
const M = require('../world/island3d/motion.js');
const Tier = require('../world/island3d/tier.js');

const COMBOS = [['home'], ['home', 'cove'], ['home', 'meadow'], ['home', 'cove', 'meadow']];
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
function starterWorld() {
  const u = { points: 0 };
  C.grantStarter(u, Date.UTC(2026, 0, 1));
  return u.world;
}
function worldWith(regions) {
  const w = C.emptyWorld();
  for (const r of regions) if (r !== 'home') w.owned[C.REGIONS[r].unlock] = 1;
  return w;
}
function hexOf(rgb) { return '#' + rgb.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('').toUpperCase(); }
function chanDiff(a, b) {
  let d = 0;
  for (let i = 1; i < 7; i += 2) d = Math.max(d, Math.abs(parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16)));
  return d;
}

/* ---------------- module shape ---------------- */
test('env: loads in Node without THREE, exposes create() and refuses to run without the kit', () => {
  assert.equal(typeof E.create, 'function');
  assert.equal(E.VERSION, 1);
  assert.throws(() => E.create(null, null, {}), /kit/);
  assert.throws(() => E.create({}, null, {}), /kit/);
});

test('env: landOf accepts region lists, worlds and land sets, and always keeps Home Island', () => {
  for (const combo of COMBOS) {
    const w = worldWith(combo), want = C.landSet(w);
    assert.deepEqual(E.landOf(combo), want, combo.join('+') + ' from regions');
    assert.deepEqual(E.landOf(w), want, combo.join('+') + ' from a world');
    assert.deepEqual(E.landOf(want), want, combo.join('+') + ' from a land set');
    assert.deepEqual(E.regionsOf(want), C.unlockedRegions(w).slice().sort((a, b) => (a === 'home' ? -1 : b === 'home' ? 1 : a < b ? -1 : 1)));
  }
  assert.deepEqual(E.landOf(['cove']), C.landSet(worldWith(['home', 'cove'])), 'home is implied');
  assert.equal(E.landSig(E.landOf(['home', 'cove'])), E.landSig(E.landOf(['cove', 'home'])), 'signature ignores order');
  assert.notEqual(E.landSig(E.landOf(['home'])), E.landSig(E.landOf(['home', 'cove'])));
});

/* ---------------- ground ---------------- */
test('env: one land tile per unlocked cell, on its terrace, with the exact surface tokens and a faint checker', () => {
  const S = E.surfaces();
  assert.equal(S.meadow.top, L.LOOK.land_meadow.colors.top);
  assert.equal(S.meadow.side, L.LOOK.land_meadow.colors.side);
  assert.equal(S.cove.top, L.LOOK.land_cove.colors.top);
  assert.equal(S.cove.side, L.LOOK.land_cove.colors.side);
  assert.equal(S.home.top, 'Grass Top'); assert.equal(S.home.alt, 'Grass Alt'); assert.equal(S.home.side, 'Grass Side');
  for (const combo of COMBOS) {
    const land = C.landSet(worldWith(combo)), tiles = E.landTiles(combo);
    assert.equal(tiles.length, Object.keys(land).length, combo.join('+'));
    const seen = new Set();
    for (const t of tiles) {
      assert.ok(land[t.key] && !seen.has(t.key), 'one tile per land cell ' + t.key);
      seen.add(t.key);
      const alt = ((t.c + t.r) & 1) === 1;
      assert.equal(t.alt, alt);
      assert.ok(near(t.y, G.surfaceY(t.c, t.r) + (alt ? E.ALT_DY : 0)), 'tile top on the terrace ' + t.key);
      assert.ok(near(t.x, t.c - 7.5) && near(t.z, t.r - 4.5) && t.w === 1 && t.d === 1);
      assert.ok(L.isToken(t.top) && L.isToken(t.side), 'tokens resolve ' + t.top + ' / ' + t.side);
      assert.ok(t.tone <= 0 && t.tone >= -0.05, 'checker is faint');
      const s = S[G.regionOf(t.c, t.r)];
      assert.equal(t.top, alt ? s.alt : s.top);
      assert.equal(t.side, s.side);
      if (G.regionOf(t.c, t.r) === 'home') assert.equal(t.tone, 0, 'home uses Grass Top / Grass Alt as they are');
    }
  }
});

test('env: plinths appear exactly where a footprint straddles terraces', () => {
  const w = worldWith(['home', 'cove', 'meadow']);
  let straddles = 0;
  for (const id of ['tree_oak', 'house_cottage', 'att_course', 'att_pitch', 'att_kart']) {
    const it = C.item(id);
    for (let y = 0; y < C.ROWS; y++) {
      for (let x = 0; x < C.COLS; x++) {
        if (!C.canPlace(w, id, x, y).ok) continue;
        const pl = G.plinth(id, x, y), tiles = E.landTiles(['home', 'cove', 'meadow'], [{ uid: 'u1', id, x, y }]);
        const plinths = tiles.filter((t) => t.kind === 'plinth');
        if (!pl) { assert.equal(plinths.length, 0, `${id} at ${x},${y}`); continue; }
        straddles++;
        assert.equal(plinths.length, 1, `${id} at ${x},${y} gets a plinth`);
        const p = plinths[0];
        assert.ok(near(p.y, pl.top + E.PLINTH_DY) && near(p.x, pl.x) && near(p.z, pl.z));
        assert.deepEqual([p.w, p.d], it.fp);
        assert.ok(p.y > G.baseY(id, x, y) && p.y - G.baseY(id, x, y) < 0.01, 'the item stands on the plinth');
        assert.ok(L.isToken(p.top) && L.isToken(p.side));
      }
    }
  }
  assert.ok(straddles > 0, 'some legal spots straddle the meadow terraces');
  /* a 2×2 at (3, 7) is centred over a Home cell but lifted to Meadow Hill's col-3 terrace: it wears the meadow */
  const pl = E.landTiles(['home', 'cove', 'meadow'], [{ uid: 'k', id: 'att_kart', x: 3, y: 7 }]).find((t) => t.kind === 'plinth');
  assert.ok(pl && near(pl.y, G.TERRACE[3] + E.PLINTH_DY), 'plinth up to the highest terrace');
  assert.equal(pl.top, E.surfaces().meadow.top, 'the plinth wears the highest cell\'s surface');
  assert.equal(E.placedSig([{ uid: 'a', id: 'tree_oak', x: 1, y: 2 }]), E.placedSig([{ uid: 'a', id: 'tree_oak', x: 1, y: 2 }]));
  assert.notEqual(E.placedSig([{ uid: 'a', id: 'tree_oak', x: 1, y: 2 }]), E.placedSig([{ uid: 'a', id: 'tree_oak', x: 2, y: 2 }]), 'a move changes the layout signature');
  assert.equal(E.landTiles(['home'], starterWorld().placed).filter((t) => t.kind === 'plinth').length, 0, 'flat land: no plinths');
});

test('env: the sand skirt is drawn only for boundary cells (the rest hides under grass)', () => {
  for (const combo of COMBOS) {
    const land = C.landSet(worldWith(combo)), skirt = E.skirtCells(combo), keys = new Set(skirt.map((s) => s.key));
    for (const k of Object.keys(land)) {
      const p = G.parseKey(k);
      let edge = false;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if ((dx || dz) && !land[(p.c + dx) + ',' + (p.r + dz)]) edge = true;
      assert.equal(keys.has(k), edge, `${combo.join('+')} ${k}`);
    }
    skirt.forEach((s) => assert.ok(land[s.key] && near(s.x, s.c - 7.5) && near(s.z, s.r - 4.5)));
    assert.ok(skirt.length < Object.keys(land).length, 'interior cells are skipped');
  }
});

test('env: ground dressing is deterministic, region-appropriate and only on free cells', () => {
  const all = ['home', 'cove', 'meadow'], w = starterWorld(), occ = C.occupancy(w).occ;
  const a = E.dressing(all, w.placed), b = E.dressing(all, w.placed);
  assert.deepEqual(a, b, 'deterministic');
  const land = C.landSet(worldWith(all));
  const check = (list, regions, name) => {
    assert.ok(list.length > 0, name + ' present');
    for (const it of list) {
      const p = G.parseKey(it.cell);
      assert.ok(land[it.cell], name + ' on land');
      assert.ok(!occ[it.cell], name + ' never on an occupied cell ' + it.cell);
      assert.ok(regions.includes(G.regionOf(p.c, p.r)), name + ' region ' + it.cell);
      assert.ok(Math.abs(it.x - (p.c - 7.5)) <= 0.5 && Math.abs(it.z - (p.r - 4.5)) <= 0.5, name + ' inside its cell');
      assert.ok(near(it.y, G.surfaceY(p.c, p.r)), name + ' on the surface');
    }
  };
  check(a.tufts, ['home', 'meadow'], 'tufts');
  check(a.flowers, ['meadow'], 'wildflowers');
  check(a.shells, ['cove'], 'shells');
  check(a.starfish, ['cove'], 'starfish');
  a.flowers.forEach((f) => assert.ok(['w1', 'w2', 'w3'].some((k) => L.LOOK.land_meadow.colors[k] === f.token), 'wildflower token from LOOK'));
  a.shells.forEach((s) => assert.equal(s.token, L.LOOK.land_cove.colors.shell));
  a.starfish.forEach((s) => assert.equal(s.token, L.LOOK.land_cove.colors.starfish));
  /* paths count as occupied (a tuft would poke through the stones) */
  const pathCell = w.placed.find((p) => p.id === 'path_stone');
  assert.ok(!a.tufts.some((t) => t.cell === pathCell.x + ',' + pathCell.y));
  /* an empty island dresses every free home cell with 1–2 tufts */
  const bare = E.dressing(['home'], []);
  const per = {};
  bare.tufts.forEach((t) => { per[t.cell] = (per[t.cell] || 0) + 1; });
  assert.equal(Object.keys(per).length, C.REGION_CELLS.home.length);
  Object.values(per).forEach((n) => assert.ok(n >= 1 && n <= 2));
});

test('env: the third light pole stands behind the house', () => {
  const w = starterWorld(), h = w.placed.find((p) => p.id === 'house_cottage');
  const pv = G.pivot('house_cottage', h.x, h.y), pole = E.polePosition(w.placed, ['home']);
  assert.ok(near(pole.x, pv.x + L.CONES.poleBehindHouse[0]) && near(pole.z, pv.z + L.CONES.poleBehindHouse[2]));
  assert.ok(near(pole.y, G.surfaceY(pole.c, pole.r)) && C.landSet(w)[pole.c + ',' + pole.r], 'starter: on land');
  assert.ok(pole.x % 1 === 0, 'on the line between the two cells behind the house (items keep a 0.07 margin there)');
  assert.deepEqual(E.polePosition([], ['home']), pole, 'no house: the starter spot');
  const back = E.polePosition([{ uid: 'h', id: 'house_cottage', x: 6, y: 1 }], ['home']);
  assert.equal(back.y, G.SEA_Y, 'behind a back-row house it stands at sea level');
});

/* ---------------- tile maths ---------------- */
test('env: chamfered tiles — a flat 1×1 top, the bevel outside the cell, ~44 tris (30 on LOW)', () => {
  const pts = E.ringPoints(0.5, 0, 1);
  assert.equal(pts.length, 8);
  [[0.5, 0.5], [-0.5, 0.5], [-0.5, -0.5], [0.5, -0.5]].forEach((c, k) => {
    for (let j = 0; j < 2; j++) assert.ok(near(pts[k * 2 + j].x, c[0]) && near(pts[k * 2 + j].z, c[1]), 'd = 0 collapses onto the corners');
  });
  for (const d of [0.05, 0.3]) {
    for (const p of E.ringPoints(0.45, d, 2)) {
      assert.ok(near(Math.hypot(p.nx, p.nz), 1), 'unit normals');
      const dx = Math.max(Math.abs(p.x) - 0.45, 0), dz = Math.max(Math.abs(p.z) - 0.45, 0);
      assert.ok(near(Math.hypot(dx, dz), d, 1e-9), 'every point is d from the square');
    }
  }
  for (const tier of ['LOW', 'MID', 'HIGH']) {
    const t = E.TILE[tier];
    assert.equal(t.rings[0].d, 0); assert.equal(t.rings[0].y, 0); assert.equal(t.a, 0.5, 'flat top = the cell');
    assert.ok(t.rings.every((r) => r.d >= 0 && r.d <= 0.06), 'the bevel hangs at most 0.06 u outside the cell');
    assert.ok(t.rings.every((r, i) => i === 0 || r.y < t.rings[i - 1].y), 'rings step down');
    const last = t.rings[t.rings.length - 1].y;
    assert.ok(G.TERRACE[0] + last < G.SAND_Y, 'the highest terrace still reaches under the sand skirt');
    assert.ok(last < G.SEA_Y, 'home tiles reach under the sea');
    const tris = E.tileTris(t, 'top') + E.tileTris(t, 'side');
    assert.ok(tris <= (tier === 'LOW' ? 30 : 46), tier + ' tile tris ' + tris);
    assert.equal(E.tileTris(t, 'all'), tris);
    const s = E.SAND[tier];
    assert.ok(near(s.a + Math.max(...s.rings.map((r) => r.d)), 0.5 + G.SAND_REACH), 'sand reaches SAND_REACH beyond the cell');
    assert.equal(s.rings[0].y, 0);
    assert.ok(G.SAND_Y + s.rings[s.rings.length - 1].y < G.SEA_Y, 'the skirt dips under the sea');
    assert.ok(s.rings.some((r) => r.tok === 'Wet Sand'), 'wet-sand ring at the waterline');
    s.rings.forEach((r) => assert.ok(L.isToken(r.tok)));
    assert.ok(E.tileTris({ a: s.a, N: s.N, rings: s.rings, topStrips: 0 }, 'all') <= 84);
  }
  assert.deepEqual(E.stripNormal({ d: 0.05, y: -0.1 }, { d: 0.05, y: -0.8 }), { r: 1, y: 0 });
  const bev = E.stripNormal({ d: 0, y: 0 }, { d: 0.05, y: -0.05 });
  assert.ok(near(bev.r, Math.SQRT1_2) && near(bev.y, Math.SQRT1_2), '45° bevel faces out and up');
});

/* ---------------- presets and the Showtime blend ---------------- */
test('env: the DAY → SHOW mix matches SLIslandLook.presetAt (member rim included) and hits both ends exactly', () => {
  for (const member of [null, '#33AAFF', '#E94B4B']) {
    const PT = E.presetTables(member), out = E.presetOut(PT);
    for (const k of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
      E.mixPreset(k, PT, out);
      const ref = L.presetAt(k, member);
      for (const key of L.PRESET_KEYS) {
        if (typeof ref[key] === 'string') assert.ok(chanDiff(hexOf(out[key]), ref[key]) <= 1, `${key} @${k} ${hexOf(out[key])} vs ${ref[key]}`);
        else if (Array.isArray(ref[key])) ref[key].forEach((v, i) => assert.ok(near(out[key][i], v, 1e-9)));
        else assert.ok(near(out[key], ref[key], 1e-9), key);
      }
    }
    E.mixPreset(1, PT, out);
    assert.equal(out.hemiIntensity, L.SHOW.hemiIntensity); assert.equal(out.sunIntensity, L.SHOW.sunIntensity);
    assert.equal(out.exposure, L.SHOW.exposure); assert.equal(out.stars, 1); assert.equal(out.glints, 0);
    E.mixPreset(0, PT, out);
    assert.equal(out.hemiIntensity, L.DAY.hemiIntensity); assert.equal(out.fogFar, L.DAY.fogFar); assert.equal(out.cones, 0);
  }
});

test('env: the Showtime blend is 1.6 s inOutSine (a 0.25 s crossfade under reduced motion) and retargets smoothly', () => {
  const b = E.blendState(0);
  assert.equal(E.blendStep(b, 1 / 60), false, 'idle');
  assert.equal(E.blendTo(b, 1, false), 1.6);
  let t = 0, prev = 0, mid = null;
  while (E.blendStep(b, 1 / 60)) {
    t += 1 / 60;
    assert.ok(b.k >= prev - 1e-12, 'monotonic');
    prev = b.k;
    if (mid === null && t >= 0.8 - 1e-9) mid = b.k;
  }
  assert.equal(b.k, 1, 'lands exactly on the target');
  assert.ok(t >= 1.6 - 1e-6 && t <= 1.6 + 1 / 60 + 1e-6);
  assert.ok(near(mid, M.ease.inOutSine(0.8 / 1.6), 0.03), 'inOutSine midpoint ' + mid);
  assert.equal(E.blendTo(b, 0, true), 0.25);
  E.blendStep(b, 0.125);
  assert.ok(near(b.k, 0.5, 1e-9), 'reduced: linear crossfade');
  E.blendStep(b, 0.2);
  assert.equal(b.k, 0);
  /* retarget half-way: the new blend starts from the current mix */
  E.blendTo(b, 1, false); E.blendStep(b, 0.8);
  const k0 = b.k;
  E.blendTo(b, 0, false);
  E.blendStep(b, 1e-4);
  assert.ok(Math.abs(b.k - k0) < 1e-3, 'no jump on retarget');
});

/* ---------------- cones, clouds, stars, shadows ---------------- */
test('env: spot cones sweep ±25° at 0.12 Hz, 120° apart, and stand still under reduced motion', () => {
  const o = {};
  for (let i = 0; i < 3; i++) {
    const base = E.CONE_BASE[i], bl = Math.hypot(base.h[0], base.h[1]), b0 = Math.atan2(base.h[1] / bl, base.h[0] / bl);
    for (let t = 0; t < 10; t += 0.37) {
      E.coneAxis(i, t, false, o);
      assert.ok(near(Math.hypot(o.x, o.y, o.z), 1), 'unit axis');
      assert.ok(o.y > 0, 'beams point up');
      assert.ok(near(Math.acos(o.y) / (Math.PI / 180), base.tilt, 1e-6), 'tilt kept');
      let dev = Math.atan2(o.hz, o.hx) - b0;
      dev = Math.atan2(Math.sin(dev), Math.cos(dev)) / (Math.PI / 180);
      assert.ok(near(dev, M.coneSweep(t, i, false), 1e-6), 'sweep = SLMotion.coneSweep');
      assert.ok(Math.abs(dev) <= L.CONES.sweepDeg + 1e-9);
      const p = E.coneAxis(i, t + 1 / L.CONES.hz, false, {});
      assert.ok(near(p.x, o.x, 1e-9) && near(p.z, o.z, 1e-9), 'period 1 / 0.12 s');
    }
    const r1 = E.coneAxis(i, 0, true, {}), r2 = E.coneAxis(i, 3.3, true, {});
    assert.deepEqual(r1, r2, 'reduced: static');
  }
  /* 120° apart: cone 1's sweep now is cone 0's sweep one third of a period later */
  assert.ok(near(M.coneSweep(0, 1, false), M.coneSweep(1 / (3 * L.CONES.hz), 0, false), 1e-9), 'phase offset');
  assert.ok(E.FREQS.coneSweep <= M.MAX_FLASH_HZ);
});

test('env: clouds drift at 0.08 u/s, shrink away before they wrap, and never hide the island', () => {
  const o = {};
  for (let i = 0; i < E.CLOUDS.length; i++) {
    const c = E.CLOUDS[i];
    E.cloudAt(i, 0, false, o);
    assert.ok(near(o.x, c.x) && near(o.s, c.s), 'rest position at t = 0');
    E.cloudAt(i, 10, false, o);
    const x10 = o.x;
    if (Math.abs(c.x + 0.8) < E.CLOUD_SPAN / 2 - 7) assert.ok(near(x10 - c.x, L.TEMPO.idle.cloudDrift * 10, 1e-9), 'drift speed');
    E.cloudAt(i, 1234, true, o);
    assert.ok(near(o.x, c.x), 'reduced: still');
    /* scale reaches ~0 at the wrap point, so no cloud ever pops */
    for (let t = 0; t < E.CLOUD_SPAN / 0.08; t += 0.5) {
      E.cloudAt(i, t, false, o);
      if (Math.abs(o.x) > E.CLOUD_SPAN / 2 - 1) assert.ok(o.s < 1e-3, 'shrunk at the wrap');
    }
    /* seen along any island-camera ray (elevation 25–67°: 40–65° rigs ± half the 30° FOV), the cloud's
       nearest, lowest point lands behind the land's back edge */
    const zFront = c.z + E.CLOUD_EXTENT.z * c.s, yLow = c.y - E.CLOUD_EXTENT.y * c.s;
    const backEdge = G.landBounds(['home', 'cove', 'meadow'], G.SAND_REACH).minZ;
    for (let el = 25; el <= 67; el += 6) {
      const zHit = zFront - yLow / Math.tan(el * Math.PI / 180);
      assert.ok(zHit < backEdge - 0.5, `cloud ${i} at ${el}° lands at z ${zHit.toFixed(2)}`);
    }
    assert.ok(c.y + E.CLOUD_EXTENT.y * c.s * 1.2 < E.SKY_R, 'inside the sky dome');
  }
});

test('env: stars — the tier count, sky stars above the horizon, reflections on the sea around (not on) the island', () => {
  for (const tier of ['LOW', 'MID', 'HIGH']) {
    const n = Tier.budget(tier, 1).stars, f = E.starField(n);
    assert.equal(f.n, n); assert.equal(f.pos.length, n * 3);
    assert.equal(n, L.FX.stars[tier], 'tier.js and the look table agree');
    assert.deepEqual(E.starField(n), f, 'deterministic');
    let sky = 0;
    for (let i = 0; i < n; i++) {
      const x = f.pos[i * 3], y = f.pos[i * 3 + 1], z = f.pos[i * 3 + 2];
      if (f.sea[i]) {
        assert.ok(near(y, G.SEA_Y + 0.015, 1e-6), 'on the water');
        assert.ok(!(Math.abs(x) < E.STAR.sea.holeX && Math.abs(z) < E.STAR.sea.holeZ), 'not on the island');
        assert.ok(Math.abs(x) <= E.SEA_SIZE / 2 && Math.abs(z) <= E.SEA_SIZE / 2, 'on the sea plane');
      } else {
        sky++;
        const r = Math.hypot(x, y, z), el = Math.asin(y / r) / (Math.PI / 180);
        assert.ok(near(r, E.STAR.r, 1e-3) && r < E.SKY_R, 'inside the dome');
        assert.ok(el >= E.STAR.elev[0] - 1e-6 && el <= E.STAR.elev[1] + 1e-6, 'above the horizon');
      }
      assert.ok(f.tint[i] < E.STAR_TINTS.length && f.size[i] >= 0 && f.size[i] < 1);
    }
    assert.equal(sky, Math.round(n * E.STAR.skyShare));
  }
  E.STAR_TINTS.forEach((t) => assert.ok(L.isToken(t)));
});

test('env: the static shadow camera covers every receiver and caster on the unlocked land', () => {
  const B = E.sunBasis(L.DAY.sunPos);
  assert.ok(near(B.r[0] * B.f[0] + B.r[1] * B.f[1] + B.r[2] * B.f[2], 0) && near(B.u[0] * B.f[0] + B.u[1] * B.f[1] + B.u[2] * B.f[2], 0), 'orthonormal');
  assert.ok(B.u[1] > 0, 'light-space up points up');
  for (const combo of COMBOS) {
    const fit = E.shadowFit(combo, L.DAY.sunPos), land = C.landSet(worldWith(combo));
    for (const k of Object.keys(land)) {
      const p = G.parseKey(k), s = G.surfaceY(p.c, p.r);
      for (const x of [p.c - 8 - G.SAND_REACH, p.c - 7 + G.SAND_REACH]) {
        for (const z of [p.r - 5 - G.SAND_REACH, p.r - 4 + G.SAND_REACH]) {
          for (const y of [G.SAND_Y, s, s + G.ITEM_MAX_H]) {
            const lx = x * B.r[0] + y * B.r[1] + z * B.r[2], ly = x * B.u[0] + y * B.u[1] + z * B.u[2];
            const depth = B.dist + x * B.f[0] + y * B.f[1] + z * B.f[2];
            assert.ok(lx > fit.left && lx < fit.right && ly > fit.bottom && ly < fit.top, `${combo} ${k} in the ortho box`);
            assert.ok(depth > fit.near && depth < fit.far, 'inside near/far');
          }
        }
      }
    }
    assert.ok(fit.right - fit.left <= 20 && fit.top - fit.bottom <= 16, 'no wider than the bible box needs');
  }
  const home = E.shadowFit(['home']), all = E.shadowFit(['home', 'cove', 'meadow']);
  assert.ok(home.right - home.left < all.right - all.left, 'a smaller island gets sharper shadows');
});

/* ---------------- safety and wiring ---------------- */
test('env: nothing flashes or strobes faster than 2 Hz', () => {
  for (const [k, hz] of Object.entries(E.FREQS)) assert.ok(hz > 0 && hz <= M.MAX_FLASH_HZ, k + ' ' + hz);
  assert.ok(1 / 1.6 <= M.MAX_FLASH_HZ, 'slowest glint period 1.6 s');
});

test('env: hologram, cone and buoy colours come from the look table', () => {
  const H = E.hologramTokens();
  assert.equal(H.sandbar, L.LOOK.land_cove.colors.locked);
  assert.equal(H.edge, L.LOOK.land_cove.colors.edge);
  assert.equal(L.LOOK.land_meadow.colors.locked, H.sandbar);
  assert.ok(L.isToken(H.sandbar) && L.isToken(H.edge));
  assert.equal(E.CONE_GEO.r, L.CONES.radius); assert.equal(E.CONE_GEO.h, L.CONES.height);
  L.CONES.buoys.forEach((b) => assert.ok(Math.abs(b[0]) > 8.5 && b[2] < -5.5, 'buoys sit in the sea at the back corners'));
  assert.ok(E.LOCKED_EDGE <= G.SAND_REACH, 'the visible sandbar stays inside the hologram pick pad');
});

test('env: shader sources are well-formed and use only the uniforms they declare', () => {
  const RESERVED = /\b(sample|filter|input|output|active|common|partition|resource|patch|subroutine|noinline|public|static|extern|external|interface|long|short|double|half|fixed|unsigned|superp|cast|namespace|using|goto|inline|class|union|enum|typedef|template|this|packed|asm|volatile)\b/;
  for (const [name, src] of Object.entries(E.SHADERS)) {
    let depth = 0;
    for (const ch of src) { if (ch === '{') depth++; if (ch === '}') depth--; assert.ok(depth >= 0, name + ' braces'); }
    assert.equal(depth, 0, name + ' braces balance');
    const opens = (src.match(/#if(n?def)?\b/g) || []).length, closes = (src.match(/#endif\b/g) || []).length;
    assert.equal(opens, closes, name + ' #if/#endif balance');
    assert.ok(/void main\(\)/.test(src), name + ' has main');
    /* constant smoothstep edges must ascend (reversed edges are undefined in GLSL) */
    for (const m of src.matchAll(/smoothstep\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,/g)) assert.ok(+m[1] < +m[2], `${name}: smoothstep(${m[1]}, ${m[2]})`);
    const declared = new Set([...src.matchAll(/uniform\s+\w+\s+(u\w+)\s*;/g)].map((m) => m[1]));
    for (const m of src.matchAll(/\b(u[A-Z]\w*)\b/g)) assert.ok(declared.has(m[1]), `${name} uses undeclared ${m[1]}`);
    for (const m of src.matchAll(/\b(?:float|vec2|vec3|vec4|mat3|mat4)\s+(\w+)\s*[=;(,]/g)) assert.ok(!RESERVED.test(m[1]), `${name}: reserved word ${m[1]}`);
    if (/FRAG/.test(name)) assert.ok(/#include <colorspace_fragment>/.test(src), name + ' converts to the output colour space');
  }
  assert.ok(/#include <fog_fragment>/.test(E.SHADERS.SEA_FRAG) && /#include <fog_vertex>/.test(E.SHADERS.SEA_VERT), 'the sea fogs like the toon materials');
  assert.ok(/#ifdef USE_INSTANCING/.test(E.SHADERS.CONE_VERT) && /instanceColor/.test(E.SHADERS.CONE_VERT), 'one instanced draw for 3 cones');
});
