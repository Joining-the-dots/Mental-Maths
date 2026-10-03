'use strict';
/* My Island 3D — environment pure helpers (world/island3d/env.js). No THREE / WebGL in Node:
   create() is exercised in the browser lab; everything it computes from data is tested here
   (Encore City v2: golden hour ↔ Showtime, the calibrated key, the light cycle, the 'city wakes up'
   ripple, the neon accents, the v1 tile fallback and the sea field layout). */
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../world/island3d/env.js');
const C = require('../world/world-core.js');
const L = require('../world/world-look.js');
const G = require('../world/island3d/grid3d.js');
const M = require('../world/island3d/motion.js');
const Tier = require('../world/island3d/tier.js');
const T3 = require('../world/island3d/terrain3d.js');

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
function hslL(hex) {
  const n = parseInt(hex.slice(1), 16), r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  return (Math.max(r, g, b) + Math.min(r, g, b)) / 2;
}

/* ---------------- module shape ---------------- */
test('env: loads in Node without THREE, exposes create() and refuses to run without the kit', () => {
  assert.equal(typeof E.create, 'function');
  assert.equal(E.VERSION, 2);
  assert.throws(() => E.create(null, null, {}), /kit/);
  assert.throws(() => E.create({}, null, {}), /kit/);
  assert.equal(E.TERRAIN_MS, 60, 'the tile fallback budget');
  assert.deepEqual(E.FIELD, { w: T3.FIELD.w, h: T3.FIELD.h, x0: T3.FIELD.x0, z0: T3.FIELD.z0, texel: T3.FIELD.texel }, 'one sea-field layout for both grounds');
  assert.equal(E.FIELD_PACK.maxShore, T3.FIELD.maxShore); assert.equal(E.FIELD_PACK.maxLocked, T3.FIELD.maxLocked);
  assert.equal(E.FIELD_PACK.maxOther, T3.FIELD.maxOther, 'the A channel (other shores) packs the same way');
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

/* ---------------- the v1 tile fallback ---------------- */
test('env: tile fallback — one tile per land cell on its terrace, v2 land tokens, no checker', () => {
  const S = E.surfaces();
  assert.equal(S.meadow.top, L.LOOK.land_meadow.colors.top);
  assert.equal(S.meadow.side, L.LOOK.land_meadow.colors.side);
  assert.equal(S.cove.top, L.LOOK.land_cove.colors.top);
  assert.equal(S.cove.side, L.LOOK.land_cove.colors.side);
  assert.equal(S.home.top, 'Turf'); assert.equal(S.home.alt, 'Turf'); assert.equal(S.home.side, 'Turf Shade');
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
      const s = S[G.regionOf(t.c, t.r)];
      assert.equal(t.top, s.top, 'no checker: both parities wear the same top');
      assert.equal(t.tone, 0);
      assert.equal(t.side, s.side);
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
        const plinths = tiles.filter((t) => t.kind === 'plinth'), list = E.plinths([{ uid: 'u1', id, x, y }]);
        if (!pl) { assert.equal(plinths.length, 0, `${id} at ${x},${y}`); assert.equal(list.length, 0); continue; }
        straddles++;
        assert.equal(plinths.length, 1, `${id} at ${x},${y} gets a plinth`);
        assert.equal(list.length, 1, 'the terrain riser list agrees');
        const p = plinths[0];
        assert.ok(near(p.y, pl.top + E.PLINTH_DY) && near(p.x, pl.x) && near(p.z, pl.z));
        assert.deepEqual([p.w, p.d], it.fp);
        assert.ok(p.y > G.baseY(id, x, y) && p.y - G.baseY(id, x, y) < 0.01, 'the item stands on the plinth');
        assert.ok(near(list[0].top, pl.top) && near(list[0].bottom, pl.bottom) && list[0].w === pl.w && list[0].d === pl.d);
      }
    }
  }
  assert.ok(straddles > 0, 'some legal spots straddle the meadow terraces');
  const pl = E.landTiles(['home', 'cove', 'meadow'], [{ uid: 'k', id: 'att_kart', x: 3, y: 7 }]).find((t) => t.kind === 'plinth');
  assert.ok(pl && near(pl.y, G.TERRACE[3] + E.PLINTH_DY), 'plinth up to the highest terrace');
  assert.equal(pl.top, E.surfaces().meadow.top, 'the plinth wears the highest cell\'s surface');
  assert.equal(E.placedSig([{ uid: 'a', id: 'tree_oak', x: 1, y: 2 }]), E.placedSig([{ uid: 'a', id: 'tree_oak', x: 1, y: 2 }]));
  assert.notEqual(E.placedSig([{ uid: 'a', id: 'tree_oak', x: 1, y: 2 }]), E.placedSig([{ uid: 'a', id: 'tree_oak', x: 2, y: 2 }]), 'a move changes the layout signature');
  assert.equal(E.landTiles(['home'], starterWorld().placed).filter((t) => t.kind === 'plinth').length, 0, 'flat land: no plinths');
});

test('env: tile fallback — the sand skirt is drawn only for boundary cells', () => {
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

test('env: tile fallback — ground dressing is deterministic, region-appropriate and only on free cells', () => {
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
  const pathCell = w.placed.find((p) => p.id === 'path_stone');
  assert.ok(!a.tufts.some((t) => t.cell === pathCell.x + ',' + pathCell.y));
});

test('env: tile fallback — chamfered tiles keep a flat 1×1 top, the bevel outside the cell, the skirt in Dune / Wet Dune', () => {
  const pts = E.ringPoints(0.5, 0, 1);
  assert.equal(pts.length, 8);
  [[0.5, 0.5], [-0.5, 0.5], [-0.5, -0.5], [0.5, -0.5]].forEach((c, k) => {
    for (let j = 0; j < 2; j++) assert.ok(near(pts[k * 2 + j].x, c[0]) && near(pts[k * 2 + j].z, c[1]), 'd = 0 collapses onto the corners');
  });
  for (const tier of ['LOW', 'MID', 'HIGH']) {
    const t = E.TILE[tier];
    assert.equal(t.rings[0].d, 0); assert.equal(t.rings[0].y, 0); assert.equal(t.a, 0.5, 'flat top = the cell');
    assert.ok(t.rings.every((r) => r.d >= 0 && r.d <= 0.06), 'the bevel hangs at most 0.06 u outside the cell');
    const last = t.rings[t.rings.length - 1].y;
    assert.ok(G.TERRACE[0] + last < G.SAND_Y && last < G.SEA_Y);
    const tris = E.tileTris(t, 'top') + E.tileTris(t, 'side');
    assert.ok(tris <= (tier === 'LOW' ? 30 : 46), tier + ' tile tris ' + tris);
    const s = E.SAND[tier];
    assert.ok(near(s.a + Math.max(...s.rings.map((r) => r.d)), 0.5 + G.SAND_REACH), 'sand reaches SAND_REACH beyond the cell');
    assert.ok(G.SAND_Y + s.rings[s.rings.length - 1].y < G.SEA_Y, 'the skirt dips under the sea');
    assert.ok(s.rings.some((r) => r.tok === 'Wet Dune') && s.rings.some((r) => r.tok === 'Dune'), 'v2 sand tokens');
    s.rings.forEach((r) => assert.ok(L.isToken(r.tok)));
  }
  assert.deepEqual(E.stripNormal({ d: 0.05, y: -0.1 }, { d: 0.05, y: -0.8 }), { r: 1, y: 0 });
});

test('env: the v1 field resamples into the shared RGBA layout (R shore, G locked)', () => {
  const data = E.fieldFromGrid(['home']), f = G.bakeField(G.landFrom(['home']));
  assert.equal(data.length, E.FIELD.w * E.FIELD.h * 4);
  for (let k = 0; k < E.FIELD.w * E.FIELD.h; k += 131) {
    const x = E.FIELD.x0 + (k % E.FIELD.w + 0.5) * E.FIELD.texel, z = E.FIELD.z0 + (Math.floor(k / E.FIELD.w) + 0.5) * E.FIELD.texel;
    assert.ok(Math.abs(data[k * 4] / 255 * E.FIELD_PACK.maxShore - Math.min(G.sampleField(f, 'shore', x, z), E.FIELD_PACK.maxShore)) < 0.02);
    assert.equal(data[k * 4 + 3], 255);
  }
});

/* ---------------- the pole ---------------- */
test('env: the third light pole stands behind the house, and steps aside from the bridge abutment', () => {
  const w = starterWorld(), h = w.placed.find((p) => p.id === 'house_cottage');
  const pv = G.pivot('house_cottage', h.x, h.y), pole = E.polePosition(w.placed, ['home']);
  assert.ok(near(pole.x, pv.x + L.CONES.poleBehindHouse[0]) && near(pole.z, pv.z + L.CONES.poleBehindHouse[2]));
  assert.ok(near(pole.y, G.surfaceY(pole.c, pole.r)) && C.landSet(w)[pole.c + ',' + pole.r], 'starter: on land');
  assert.deepEqual(E.polePosition([], ['home']), pole, 'no house: the starter spot');
  const back = E.polePosition([{ uid: 'h', id: 'house_cottage', x: 6, y: 1 }], ['home']);
  assert.equal(back.y, G.SEA_Y, 'behind a back-row house it stands at sea level');
  assert.equal(E.polePosition([{ uid: 'h', id: 'house_cottage', x: 6, y: 1 }], ['home'], () => -0.2).y, -0.2, 'on the terrain when it gives a height');
  /* every house spot: the pole never lands within 0.6 u of the abutment */
  const all = worldWith(['home', 'cove', 'meadow']);
  for (let y = 0; y < C.ROWS; y++) for (let x = 0; x < C.COLS; x++) {
    if (!C.canPlace(all, 'house_cottage', x, y).ok) continue;
    const p = E.polePosition([{ uid: 'h', id: 'house_cottage', x, y }], ['home', 'cove', 'meadow']);
    assert.ok(Math.hypot(p.x - E.ABUTMENT.x, p.z - E.ABUTMENT.z) >= E.ABUTMENT.clear - 1e-9, `house at ${x},${y}`);
  }
});

/* ---------------- presets, calibration and the light cycle ---------------- */
test('env: the golden hour → Showtime mix matches SLIslandLook.presetAt (member rim included) and hits both ends exactly', () => {
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
    assert.equal(out.exposure, L.SHOW.exposure); assert.equal(out.stars, 1); assert.equal(out.glints, 0); assert.equal(out.cones, 1);
    E.mixPreset(0, PT, out);
    assert.equal(out.hemiIntensity, L.DUSK.hemiIntensity); assert.equal(out.fogFar, L.DUSK.fogFar); assert.equal(out.cones, 0);
    assert.equal(out.exposure, L.DUSK.exposure); assert.equal(out.stars, L.DUSK.stars);
  }
  assert.deepEqual(L.DUSK.sunPos, L.SHOW.sunPos, 'one fixed sun direction: the static shadow map never re-renders for light');
});

test('env: lit Turf at golden hour reads #4FA36A ±6% L (only the key is tuned), and Showtime stays readable', () => {
  const target = hslL(L.hex('Turf')), cal = E.keyCalibration();
  assert.ok(cal > 0.5 && cal < 6, 'a sane key multiplier ' + cal);
  for (const member of [null, '#33AAFF', '#E94B4B', '#FFD23F', '#7B4DFF']) {
    const c = E.litColor('Turf', 0, member);
    assert.ok(Math.abs(hslL(c) - target) <= 0.06, `lit Turf ${c} (member ${member}) L ${hslL(c).toFixed(3)} vs ${target.toFixed(3)}`);
    const night = E.litColor('Turf', 1, member);
    assert.ok(hslL(night) >= 0.15 && hslL(night) < hslL(c), `Showtime turf ${night} readable and darker`);
  }
  /* the calibration is only on the key: with it removed the ground reads far darker */
  assert.ok(hslL(E.litColor('Turf', 0, null, 1)) < target - 0.1);
  /* the model: Neutral tone mapping never brightens and maps 0 to 0 */
  assert.deepEqual(E.neutralTone([0, 0, 0]), [0, 0, 0]);
  const hi = E.neutralTone([3, 2, 1]);
  assert.ok(hi.every((v) => v <= 1 + 1e-9));
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
  E.blendTo(b, 1, false); E.blendStep(b, 0.8);
  const k0 = b.k;
  E.blendTo(b, 0, false);
  E.blendStep(b, 1e-4);
  assert.ok(Math.abs(b.k - k0) < 1e-3, 'no jump on retarget');
});

test('env: the light cycle — golden ↔ blue-hour drift, Showtime on top, edit mode eases back to golden hour', () => {
  assert.equal(E.driftK(0, false), 0, 'the island opens at golden hour');
  assert.ok(near(E.driftK(E.DRIFT.period / 2, false), 0.24, 1e-12), 'blue hour at half the 420 s period');
  assert.equal(E.driftK(123, true), 0.12, 'reduced motion holds the middle');
  for (let t = 0; t < 900; t += 7.3) {
    const k = E.driftK(t, false);
    assert.ok(k >= 0 && k <= 0.24 + 1e-12);
    assert.ok(Math.abs(E.driftK(t + 1 / 60, false) - k) < 0.0001, 'a slow drift (no visible step per frame)');
  }
  assert.equal(E.lightMix(0, 0, 0), 0);
  assert.equal(E.lightMix(1, 0.24, 0), 1, 'Showtime is full night whatever the drift');
  assert.ok(near(E.lightMix(0.5, 0.2, 0), 0.6, 1e-12));
  assert.equal(E.lightMix(1, 0.2, 1), 0, 'edit mode: the brightest light');
  for (let s = 0; s <= 1; s += 0.1) for (let a = 0; a <= 0.24; a += 0.06) {
    assert.ok(E.lightMix(s + 0.05, a, 0) >= E.lightMix(s, a, 0) - 1e-12, 'monotonic in the Showtime mix');
  }
  assert.ok(E.EDIT_SEC >= 0.2 && E.EDIT_SEC <= 1.6);
});

test('env: the city wakes up — 40 ms per cell from the home, each light fading over 0.3 s, never a pop', () => {
  assert.equal(E.WAKE.perCell, 0.04); assert.equal(E.WAKE.fade, 0.3);
  const home = { x: -1, z: -2 };
  assert.equal(E.wakeDelay(-1, -2, home), 0);
  assert.ok(near(E.wakeDelay(4, -2, home), 0.2), '5 cells away: 200 ms');
  assert.equal(E.wakeLevel(0.1, 0.2, true, false), 0, 'not before its delay');
  assert.equal(E.wakeLevel(0.5, 0.2, true, false), 1, 'on after delay + 0.3 s');
  assert.ok(near(E.wakeLevel(0.35, 0.2, true, false), 0.5), 'half-way at the middle of its fade');
  assert.equal(E.wakeLevel(0.5, 0.2, false, false), 0, 'switching off ripples the same way');
  assert.equal(E.wakeLevel(0.25, 3, true, true), 1, 'reduced: every light together inside the 0.25 s crossfade');
  /* the per-light step: bounded change per frame, and a reversal mid-ripple carries on smoothly */
  const dt = 1 / 60;
  let w = 0, t = 0, maxStep = 0;
  for (; t < 0.6; t += dt) { const n = E.wakeStep(w, true, t, 0.1, dt, false); maxStep = Math.max(maxStep, Math.abs(n - w)); w = n; }
  const mid = E.wakeStep(0.37, false, 0, 0.1, dt, false);
  assert.equal(mid, 0.37, 'a reversed light holds until its own delay');
  let w2 = 0.37;
  for (let s = 0; s < 0.6; s += dt) { const n = E.wakeStep(w2, false, s, 0.1, dt, false); maxStep = Math.max(maxStep, Math.abs(n - w2)); w2 = n; }
  assert.equal(w, 1); assert.equal(w2, 0);
  assert.ok(maxStep <= dt / E.WAKE.fade + 1e-12, 'no light jumps more than one frame of its 0.3 s fade');
  for (let x = 0; x <= 1; x += 0.05) assert.ok(E.wakeEase(x) >= 0 && E.wakeEase(x) <= 1 && E.wakeEase(x + 0.05) >= E.wakeEase(x) - 1e-12);
});

test('env: neon accents — off by day, Holo Blue at dusk, the member colour at Showtime; every animated light is a slow sine', () => {
  const out = [0, 0, 0], member = '#E94B4B', mrgb = [0xE9 / 255, 0x4B / 255, 0x4B / 255];
  const blue = [0xB3 / 255, 0xE5 / 255, 0xFF / 255].map((v) => v * 0.8);
  E.neonColour('edge', 0, 0, member, 0, 0, 0, false, out);
  assert.ok(Math.max(...out) < 0.25, 'off (dark) at golden hour start');
  E.neonColour('edge', 0.24, 0, member, 0, 0, 0, false, out);
  out.forEach((v, i) => assert.ok(near(v, blue[i], 1e-9)), 'Holo Blue in the blue-hour drift');
  E.neonColour('edge', 1, 1, member, 0, 0, 0, false, out);
  out.forEach((v, i) => assert.ok(near(v, mrgb[i], 1e-9)), 'the member colour at Showtime');
  /* frame-to-frame changes stay small for every role (no flashing, chases or pops) */
  for (const role of ['edge', 'wallCap', 'bollard', 'lamp', 'plaza', 'ring', 'lens']) {
    for (const k of [0, 0.24, 1]) for (const w of [0, 0.5, 1]) {
      let prev = E.neonColour(role, k, w, member, 0, 2, 1, false, [0, 0, 0]);
      for (let t = 1 / 60; t < 8; t += 1 / 60) {
        const c = E.neonColour(role, k, w, member, t, 2, 1, false, [0, 0, 0]);
        c.forEach((v, i) => assert.ok(Math.abs(v - prev[i]) < 0.03, `${role} k ${k} w ${w}: a smooth light`));
        c.forEach((v) => assert.ok(v >= 0 && v <= 1 + 1e-9));
        prev = c;
      }
      const r1 = E.neonColour(role, k, w, member, 0, 2, 1, true, [0, 0, 0]), r2 = E.neonColour(role, k, w, member, 3.7, 2, 1, true, [0, 0, 0]);
      assert.deepEqual(r1, r2, role + ': still under reduced motion');
    }
  }
  /* the plaza tiles mix the NEON4 set and the member colour, never one colour block */
  const tiles = new Set();
  for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) tiles.add(E.neonColour('plaza', 1, 1, member, 0, i, j, true, [0, 0, 0]).map((v) => v.toFixed(3)).join());
  assert.ok(tiles.size >= 4, 'at least 4 hues on the plaza');
  assert.ok(E.FREQS.plazaWave <= 0.5 && E.FREQS.ringBreathe <= 0.5 && E.FREQS.drift < 0.01);
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
    }
    assert.deepEqual(E.coneAxis(i, 0, true, {}), E.coneAxis(i, 3.3, true, {}), 'reduced: static');
  }
  assert.ok(near(M.coneSweep(0, 1, false), M.coneSweep(1 / (3 * L.CONES.hz), 0, false), 1e-9), 'phase offset');
  assert.ok(E.FREQS.coneSweep <= M.MAX_FLASH_HZ);
});

test('env: 3 dusk cloud streaks drift at 0.08 u/s, shrink away before they wrap, and never hide the island', () => {
  assert.equal(E.CLOUDS.length, 3);
  assert.ok(E.CLOUD_SHAPE[0] > 1.5 && E.CLOUD_SHAPE[1] < 0.5, 'flattened streaks');
  const o = {};
  for (let i = 0; i < E.CLOUDS.length; i++) {
    const c = E.CLOUDS[i];
    E.cloudAt(i, 0, false, o);
    assert.ok(near(o.x, c.x) && near(o.s, c.s), 'rest position at t = 0');
    E.cloudAt(i, 1234, true, o);
    assert.ok(near(o.x, c.x), 'reduced: still');
    for (let t = 0; t < E.CLOUD_SPAN / 0.08; t += 0.5) {
      E.cloudAt(i, t, false, o);
      if (Math.abs(o.x) > E.CLOUD_SPAN / 2 - 1) assert.ok(o.s < 1e-3, 'shrunk at the wrap');
    }
    /* seen along any island-camera ray (elevation 19–65°: the 34–65° rig ± half the 30° FOV, the
       skyline shot excepted), the streak's nearest, lowest point lands behind the land's back coast */
    const zFront = c.z + E.CLOUD_EXTENT.z * c.s, yLow = c.y - E.CLOUD_EXTENT.y * c.s;
    const backEdge = G.landBounds(['home', 'cove', 'meadow'], 1).minZ;
    for (let el = 19; el <= 67; el += 6) {
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
    }
    assert.equal(sky, Math.round(n * E.STAR.skyShare));
  }
  assert.equal(E.SEA_SIZE, 160, 'the sea plane grows so the skyline shot\'s horizon is fog, not an edge');
});

test('env: the static shadow camera covers every receiver and caster, inside the bible\'s -13..13 × -9..9 box', () => {
  const sunPos = L.DUSK.sunPos, B = E.sunBasis(sunPos);
  assert.ok(near(B.r[0] * B.f[0] + B.r[1] * B.f[1] + B.r[2] * B.f[2], 0) && near(B.u[0] * B.f[0] + B.u[1] * B.f[1] + B.u[2] * B.f[2], 0), 'orthonormal');
  assert.ok(B.u[1] > 0, 'light-space up points up');
  for (const combo of COMBOS) {
    const bk = T3.bake(combo, { tier: 'MID', seed: 'shadow' });
    for (const bounds of [null, bk.bounds]) {
      const fit = E.shadowFit(combo, sunPos, 0.4, bounds), land = C.landSet(worldWith(combo));
      assert.ok(fit.left >= -13 && fit.right <= 13 && fit.bottom >= -9 && fit.top <= 9 && fit.near === 1 && fit.far === 45);
      const pts = [];
      for (const k of Object.keys(land)) {
        const p = G.parseKey(k), s = G.surfaceY(p.c, p.r);
        for (const x of [p.c - 8 - G.SAND_REACH, p.c - 7 + G.SAND_REACH]) for (const z of [p.r - 5 - G.SAND_REACH, p.r - 4 + G.SAND_REACH]) for (const y of [G.SAND_Y, s, s + G.ITEM_MAX_H]) pts.push([x, y, z]);
      }
      if (bounds) for (const x of [bounds.minX, bounds.maxX]) for (const z of [bounds.minZ, bounds.maxZ]) pts.push([x, G.SEA_Y, z]);
      for (const [x, y, z] of pts) {
        const lx = x * B.r[0] + y * B.r[1] + z * B.r[2], ly = x * B.u[0] + y * B.u[1] + z * B.u[2];
        const depth = B.dist + x * B.f[0] + y * B.f[1] + z * B.f[2];
        assert.ok(lx > fit.left && lx < fit.right && ly > fit.bottom && ly < fit.top, `${combo} (${x}, ${y}, ${z}) in the ortho box`);
        assert.ok(depth > fit.near && depth < fit.far, 'inside near/far');
      }
    }
  }
  const home = E.shadowFit(['home'], sunPos), all = E.shadowFit(['home', 'cove', 'meadow'], sunPos);
  assert.ok(home.right - home.left < all.right - all.left, 'a smaller island gets sharper shadows');
});

/* ---------------- the unlock rise and the tile fallback rule ---------------- */
test('env: the unlock rise slices a region into ≤ 5 bands that follow SLMotion\'s rise order', () => {
  for (const region of ['cove', 'meadow']) {
    for (const n of [1, 3, 5]) {
      const rb = E.riseBands(region, ['home'], n), cells = C.REGION_CELLS[region];
      assert.equal(rb.n, n);
      assert.equal(Object.keys(rb.bandOf).length, cells.length, 'every region cell is in a band');
      assert.equal(rb.delays.length, n);
      for (let b = 1; b < n; b++) assert.ok(rb.delays[b] > rb.delays[b - 1], 'later bands start later');
      rb.order.forEach((p, k) => { if (k) assert.ok(rb.bandOf[p.c + 16 * p.r] >= rb.bandOf[rb.order[k - 1].c + 16 * rb.order[k - 1].r]); });
      assert.equal(rb.delays[0], 0);
      assert.ok(rb.delays[n - 1] + M.RISE.each <= M.riseDur(cells.length) + 1e-9, 'inside the rise duration');
    }
  }
  assert.equal(E.BAND_MAX, 5);
});

test('env: the tile fallback rule — a throw or a slow bake uses the v1 tiles; the first two JIT-cold bakes get 4× slack', () => {
  assert.equal(E.slowBakeRule(10, 60, 0), false);
  assert.equal(E.slowBakeRule(150, 60, 0), false, 'the cold mount bake may run long');
  assert.equal(E.slowBakeRule(150, 60, 1), false, 'so may the first unlock bake');
  assert.equal(E.slowBakeRule(61, 60, 2), true, 'later bakes keep to 60 ms');
  assert.equal(E.slowBakeRule(241, 60, 0), true, 'never more than 4× the budget');
  assert.equal(E.slowBakeRule(59, 60, 9), false);
});

/* ---------------- safety and wiring ---------------- */
test('env: nothing flashes or strobes faster than 2 Hz', () => {
  for (const [k, hz] of Object.entries(E.FREQS)) assert.ok(hz > 0 && hz <= M.MAX_FLASH_HZ, k + ' ' + hz);
  assert.ok(1 / 1.6 <= M.MAX_FLASH_HZ, 'slowest glint period 1.6 s');
  assert.ok(E.FREQS.drift === 1 / 420 && E.FREQS.quayShimmer <= 0.5);
});

test('env: hologram, cone, buoy and halo colours come from the look table', () => {
  const H = E.hologramTokens();
  assert.equal(H.sandbar, L.LOOK.land_cove.colors.locked);
  assert.equal(H.edge, L.LOOK.land_cove.colors.edge);
  assert.ok(L.isToken(H.sandbar) && L.isToken(H.edge));
  assert.equal(E.CONE_GEO.r, L.CONES.radius); assert.equal(E.CONE_GEO.h, L.CONES.height);
  L.CONES.buoys.forEach((b) => assert.ok(Math.abs(b[0]) > 8.5 && b[2] < -5.5, 'buoys sit in the sea at the back corners'));
  assert.equal(E.BUOY.ringR, 0.4, 'LED ring buoys: torus R 0.4');
  assert.ok(L.isToken(E.SUN_HALO.token) && E.SUN_HALO.yawDeg === -30);
  assert.ok(E.LOCKED_EDGE <= G.SAND_REACH, 'the v1 sandbar stays inside the hologram pick pad');
  assert.equal(E.HALO_CAP, 48);
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
    for (const m of src.matchAll(/smoothstep\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,/g)) assert.ok(+m[1] < +m[2], `${name}: smoothstep(${m[1]}, ${m[2]})`);
    const declared = new Set([...src.matchAll(/uniform\s+\w+\s+(u\w+)\s*(?:\[\s*\w+\s*\])?\s*;/g)].map((m) => m[1]));
    for (const m of src.matchAll(/\b(u[A-Z]\w*)\b/g)) assert.ok(declared.has(m[1]), `${name} uses undeclared ${m[1]}`);
    for (const m of src.matchAll(/\b(?:float|vec2|vec3|vec4|mat3|mat4)\s+(\w+)\s*[=;(,]/g)) assert.ok(!RESERVED.test(m[1]), `${name}: reserved word ${m[1]}`);
    assert.ok(!/pow\(\s*q[e]\.[xy]/.test(src), name + ': no pow of a possibly negative base');
    if (/FRAG/.test(name)) assert.ok(/#include <colorspace_fragment>/.test(src), name + ' converts to the output colour space');
  }
  assert.ok(/#include <fog_fragment>/.test(E.SHADERS.SEA_FRAG) && /#include <fog_vertex>/.test(E.SHADERS.SEA_VERT), 'the sea fogs like the toon materials');
  assert.ok(/uRefl\[REFL_N\]/.test(E.SHADERS.SEA_FRAG) && /i < REFL_N/.test(E.SHADERS.SEA_FRAG), 'reflection pillars sized by the tier define');
  assert.ok(/vXZ\.y < -4\.4/.test(E.SHADERS.SEA_FRAG), 'pillars branch-skipped in front of the island');
  assert.ok(/uHaloDir/.test(E.SHADERS.SKY_FRAG) && /uBand/.test(E.SHADERS.SKY_FRAG), 'the sun halo and the city-glow band');
  assert.ok(/uZenith/.test(E.SHADERS.STAR_VERT), 'zenith-only stars at golden hour');
  assert.ok(/#ifdef USE_INSTANCING/.test(E.SHADERS.CONE_VERT) && /instanceColor/.test(E.SHADERS.CONE_VERT), 'one instanced draw for 3 cones');
});

/* ---------------- review fixes (2026-10-03) ---------------- */
/* a headless env.create: every THREE / kit call lands on one do-anything stub (numbers read as 0), so the
   env's own logic — land, bakes, seeds, the wake ripple — runs for real in Node */
function anyStub() {
  const fn = function () {};
  const p = new Proxy(fn, {
    get(t, k) { if (k === Symbol.toPrimitive) return () => 0; if (k === 'then' || k === Symbol.iterator) return undefined; return p; },
    set() { return true; }, apply() { return p; }, construct() { return p; }, has() { return true; }
  });
  return p;
}
function headlessEnv(opts) {
  const any = anyStub();
  const K = new Proxy({ tier: 'MID', THREE: any, G: any }, { get(t, k) { return k in t ? t[k] : any; } });
  return E.create(K, null, Object.assign({ scene: any, terrainMs: 1e6 }, opts));
}
function countBakes(t) {
  const log = [], orig = T3.bake;
  T3.bake = function (land, o) { log.push({ cells: Object.keys(land).length, seed: o.seed }); return orig.apply(this, arguments); };
  t.after(() => { T3.bake = orig; });
  return log;
}

test('env (runtime-3): a lazy env bakes only the land its first setLand brings; a new child bakes once, on their own land', (t) => {
  const bakes = countBakes(t);
  const all = ['home', 'cove', 'meadow'], allCells = Object.keys(E.landOf(all)).length, homeCells = Object.keys(E.landOf(['home'])).length;
  const env = headlessEnv({ unlocked: ['home'], lazyLand: true, seed: 'rt3-ava', name: 'Ava' });
  assert.equal(bakes.length, 0, 'no placeholder bake at create');
  assert.equal(env.info().land, 0, 'open water until the first setLand');
  env.setLand(all);
  assert.deepEqual(bakes, [{ cells: allCells, seed: 'rt3-ava' }], 'the mount: one bake, the real land');
  env.update(1 / 60, 0);
  /* a profile switch: the new seed waits for the next child's land */
  env.setUser({ name: 'Ben', color: '#33AAFF', seed: 'rt3-ben' });
  assert.equal(bakes.length, 1, 'setUser does not re-bake the previous child\'s land');
  env.update(1 / 60, 0);
  env.setLand(['home']);
  assert.deepEqual(bakes[1], { cells: homeCells, seed: 'rt3-ben' }, 'the switch: one bake, the next child\'s land');
  assert.equal(bakes.length, 2);
  assert.equal(env.bake.seed, 'rt3-ben');
  /* the same land, a new seed: the next setLand re-bakes it even though the land signature is unchanged */
  env.setSeed('rt3-cat');
  env.setLand(['home']);
  assert.deepEqual(bakes[2], { cells: homeCells, seed: 'rt3-cat' });
  /* no setLand at all: the coastline follows after SEED_WAIT of frames, once */
  env.setSeed('rt3-dan');
  for (let i = 0; i < 20; i++) env.update(1 / 60, 0);
  assert.equal(bakes.length, 3, 'waits for a sync');
  for (let i = 0; i < 20; i++) env.update(1 / 60, 0);
  assert.deepEqual(bakes[3], { cells: homeCells, seed: 'rt3-dan' });
  for (let i = 0; i < 40; i++) env.update(1 / 60, 0);
  assert.equal(bakes.length, 4);
  env.dispose();
  /* an env made without lazyLand still bakes its opts.unlocked at once (older controllers) */
  const eager = headlessEnv({ unlocked: ['home'], seed: 'rt3-eve' });
  assert.deepEqual(bakes[4], { cells: homeCells, seed: 'rt3-eve' });
  eager.dispose();
});

test('env (safety-4): wakeAt is reversal-safe — Showtime toggled back mid-ripple never drops an item\'s lights', (t) => {
  /* the pure ripple: any delay, any toggle pattern → no jump at a toggle, the same path as wakeStep */
  const dt = 1 / 60, delays = [0, 0.05, 0.12, 0.2, 0.33, 0.4, 0.55, 0.75];
  for (const pattern of [[0.2], [0.05, 0.1], [0.3, 0.25, 0.4], [0.7, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05], [1.3, 0.1]]) {
    const r = E.rippleNew(false), steps = delays.map(() => 0);
    E.rippleToggle(r, true);
    let on = true, t0 = 0, next = 0, maxDiff = 0;
    for (let f = 0; f < 200; f++) {
      if (next < pattern.length && t0 >= pattern[next]) {
        const before = delays.map((d) => E.rippleLevel(r, d, false));
        on = !on; E.rippleToggle(r, on); t0 = 0; next++;
        delays.forEach((d, i) => assert.ok(Math.abs(E.rippleLevel(r, d, false) - before[i]) < 1e-12, `toggle ${next}: delay ${d} holds its level`));
      }
      E.rippleAdvance(r, dt); t0 += dt;
      delays.forEach((d, i) => {
        steps[i] = E.wakeStep(steps[i], on, r.t, d, dt, false);
        maxDiff = Math.max(maxDiff, Math.abs(E.rippleLevel(r, d, false) - E.wakeEase(steps[i])));
      });
    }
    assert.ok(maxDiff <= 1.5 * dt / E.WAKE.fade + 1e-9, `pattern ${pattern}: within one frame of the per-light step (${maxDiff.toFixed(4)})`);
    delays.forEach((d) => assert.equal(E.rippleLevel(r, d, false), on ? 1 : 0, 'settles'));
  }
  /* the reviewer's case on a real env: Showtime ends, and 0.2 s later it is back on (the encore re-tap):
     an item 10 u from the home was still lit (its OFF delay not reached) and must stay lit */
  const env = headlessEnv({ unlocked: ['home'], show: 1, seed: 'rt3-wake' });
  const far = { x: 9, z: -2 + Math.sqrt(100 - 100) }, home = { x: -1, z: -2 };
  assert.ok(Math.hypot(far.x - home.x, far.z - home.z) >= 9.99);
  assert.equal(env.wakeAt(far.x, far.z), 1, 'Showtime: lit');
  env.showtime(false);
  for (let i = 0; i < 12; i++) env.update(1 / 60, i / 60);
  const before = env.wakeAt(far.x, far.z);
  env.showtime(true);
  const after = env.wakeAt(far.x, far.z);
  assert.equal(before, 1, 'its OFF delay (0.4 s) had not come yet');
  assert.ok(Math.abs(after - before) < 1e-9, `no pop: ${before} → ${after}`);
  let prev = after;
  for (let i = 0; i < 90; i++) {
    env.update(1 / 60, 0.2 + i / 60);
    const w = env.wakeAt(far.x, far.z);
    assert.ok(Math.abs(w - prev) <= 1.5 / 60 / E.WAKE.fade + 1e-9, 'every frame within one step of its 0.3 s fade');
    prev = w;
  }
  assert.equal(prev, 1);
  env.dispose();
});

test('env (perf-8): the per-frame neon pass parses the member colour once, not on every call', (t) => {
  const real = L.normHex;
  let calls = 0;
  L.normHex = function () { calls++; return real.apply(this, arguments); };
  t.after(() => { L.normHex = real; });
  const out = [0, 0, 0], member = '#2E86DE';
  E.neonColour('edge', 1, 1, member, 0, 0, 0, false, out);
  const first = calls;
  for (let i = 0; i < 500; i++) E.neonColour(['edge', 'plaza', 'ring'][i % 3], 1, 1, member, i / 60, i % 4, 1, false, out);
  assert.equal(calls, first, 'no RegExp / string work per frame for an unchanged member');
  E.neonColour('edge', 1, 1, member, 0, 0, 0, false, out);
  assert.deepEqual(out.map((v) => Math.round(v * 255)), [0x2E, 0x86, 0xDE], 'still the member colour');
  E.neonColour('edge', 1, 1, '#E94B4B', 0, 0, 0, false, out);
  assert.equal(calls, first + 1, 'a new member is parsed once');
  assert.deepEqual(out.map((v) => Math.round(v * 255)), [0xE9, 0x4B, 0x4B]);
  E.neonColour('edge', 1, 1, null, 0, 0, 0, false, out);
  E.neonColour('edge', 1, 1, null, 0, 0, 0, false, out);
  assert.equal(calls, first + 2, 'no member: the fallback, parsed once');
});

test('env (runtime-2 / perf-3): the sea\'s wave lines follow the island\'s own coast, stay near it, and calm right down at Showtime', () => {
  const S = E.SEA, src = E.SHADERS.SEA_FRAG;
  /* the art bible: wave lines 0.6× v1's 0.03 wide at every light; the foam band 0.10 + 0.05·sin */
  assert.equal(S.waveW, 0.6 * 0.03);
  assert.deepEqual(S.foamEdge, [0.1, 0.05]);
  for (const k of [0, 0.24, 0.5, 1]) assert.equal(E.seaWave(k).w, S.waveW, 'one width at every k');
  assert.ok(E.seaWave(0).a < 0.35 && E.seaWave(1).a <= 0.12, 'golden hour softer than the bible\'s 0.35, Showtime almost glass');
  for (let k = 0; k < 1; k += 0.05) assert.ok(E.seaWave(k + 0.05).a <= E.seaWave(k).a + 1e-12, 'calmer as the night deepens');
  /* the shader is built from those numbers: the bands clamp to the island's near shore and clear the other shores */
  assert.match(src, /float island = smoothstep\(0\.2, 0\.6, od\);/);
  assert.match(src, /float bands = smoothstep\(0\.3, 0\.6, sd\) \* \(1\.0 - smoothstep\(1\.1, 1\.6, sd\)\) \* island;/);
  assert.match(src, /float edge = 0\.1 \+ 0\.05 \* sin\(/);
  assert.match(src, /float foam = 1\.0 - smoothstep\(edge - aaF, edge \+ aaF, fd\);/, 'the foam hugs every waterline');
  assert.match(src, /foam2 \* uFoam2/);
  assert.ok(!/smoothstep\(2\.4, 3\.3, sd\)/.test(src), 'the old 3.3 u reach is gone');
  /* over the real bake, the bay between the island and the quay is mostly clear water */
  const L2 = (c) => { const n = parseInt((L.hex(c) || c).slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); };
  for (const combo of [['home'], ['home', 'cove', 'meadow']]) {
    const f = T3.bake(combo, { tier: 'MID', seed: 'mia' }).field;
    let n = 0, inBands = 0;
    for (let j = 0; j < f.h; j++) for (let i = 0; i < f.w; i++) {
      const x = f.x0 + (i + 0.5) * f.texel, z = f.z0 + (j + 0.5) * f.texel, k = j * f.w + i;
      if (Math.abs(x) > 12 || z > -4 || z < -8.6 || f.shore[k] <= 0 || f.other[k] <= 0) continue;
      n++;
      const b = E.waveBands(f.shore[k], f.other[k]);
      if (b > 0.5) inBands++;
      if (f.shore[k] > S.bandOut[1]) assert.equal(b, 0, 'no wave line beyond 1.6 u of the island');
    }
    assert.ok(n > 500 && inBands / n < 0.2, `${combo}: ${(100 * inBands / n).toFixed(1)}% of the bay inside the wave bands (was ~65–70%)`);
  }
  /* Showtime: a stroke over the night water is a soft tint (≤ 1.6:1), not near-white on navy (≈ 7:1) */
  const P1 = L.presetAt(1, null), deep = L2(P1.seaDeep), sh = L2(P1.seaShallow), wv = L2(P1.waveLine), sw = E.seaWave(1);
  const mixc = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k), lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const stroke = mixc(deep, mixc(wv, sh, sw.mix), sw.a);
  assert.ok((lum(stroke) + 0.05) / (lum(deep) + 0.05) <= 1.6, 'Showtime stroke contrast ' + ((lum(stroke) + 0.05) / (lum(deep) + 0.05)).toFixed(2));
  /* the open-water field of a lazy env: no shore, no hologram, no lagoon */
  const open = E.openSeaField();
  assert.equal(open.length, E.FIELD.w * E.FIELD.h * 4);
  assert.ok(open.every((v, i) => v === (i % 4 === 2 ? 0 : 255)));
});

test('env seams §9: the sea draws life3d\'s boat wakes (uBoat[4]) on MID / HIGH only, fed from life.boats() every frame', () => {
  const src = E.SHADERS.SEA_FRAG;
  const lowOnly = (s) => s.replace(/#ifndef ENV_LOW[\s\S]*?#endif/g, '');
  assert.match(src, /uniform vec4 uBoat\[4\];/, 'four boats: life3d\'s Float32Array(16)');
  for (let i = 0; i < 4; i++) assert.ok(src.includes('uBoat[' + i + ']'), 'boat ' + i + ' leaves a wake');
  assert.ok(!/uBoat|boatWake/.test(lowOnly(src)), 'LOW has no wakes (and no uBoat uniform)');
  assert.ok(/float boatWake\(vec2 p, vec4 b\)/.test(src) && src.indexOf('float boatWake') < src.indexOf('void main()'), 'declared before main');
  assert.ok(!/uTime[^;]*boat|boat[^;]*uTime/i.test(src), 'a wake moves with its boat only: nothing flickers');
  const env = require('node:fs').readFileSync(require('node:path').join(__dirname, '../world/island3d/env.js'), 'utf8');
  assert.match(env, /function lifeBoats\(l\)[\s\S]*?l\.boats\(\)/, 'env reads life.boats()');
  assert.match(env, /if \(life && !low\) safeCall\('life', lifeBoats\)/, 'on MID / HIGH, every frame');
});
