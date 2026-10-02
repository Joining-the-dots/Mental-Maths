'use strict';
/* My Island 3D — photocards (world/island3d/photocard.js, island chunk 12): the pure
   layer — [data-pc] parsing, style → render spec and cache keys (styles render the
   house, accessories the pet), the stateKey inverse, the icon / turntable framing
   maths, turntable motion, sparkles, the cone ramp, the LRU — plus the Node no-op
   API, a browser-style classic-script load and static source rules. The WebGL path
   runs only in the browser (island3d_lab.html). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const P = require('../world/island3d/photocard.js');
const L = require('../world/world-look.js');
const C = require('../world/world-core.js');
const M = require('../world/island3d/motion.js');
const G3 = require('../world/island3d/grid3d.js');
const S = require('../world/island3d/stage.js');

const SRC_PATH = path.join(__dirname, '..', 'world', 'island3d', 'photocard.js');
const SRC = fs.readFileSync(SRC_PATH, 'utf8');
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const IDS = C.CATALOG.map((it) => it.id);
const STYLES = C.CATALOG.filter((it) => it.kind === 'style').map((it) => it.id);
const ACCS = C.CATALOG.filter((it) => it.kind === 'acc').map((it) => it.id);
const PETS = C.CATALOG.filter((it) => it.kind === 'pet').map((it) => it.id);
const ST_SAMPLES = [
  {},
  { wall: 'wall_pink', roof: 'roof_castle', door: 'door_gold', details: { detail_flag: true, detail_lights: true } },
  { wall: 'wall_mint', roof: 'roof_candy', door: 'door_green', details: ['detail_chimney', 'detail_windowbox', 'detail_chimney'] },
  { course: 'course_snow', ball: 'ball_gold', stadium: 'stadium_night', kart: 'kart_unicorn' },
  { pet: 'pet_dragon', acc: { hat: 'acc_crown', back: 'acc_cape' } },
  { pet: 'pet_kitten', acc: { neck: 'acc_scarf', face: 'acc_shades' } }
];
/* a seeded RNG for property tests */
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function peaksPerSec(fn, T = 30, dt = 1 / 240) {
  let peaks = 0, a = fn(0), b = fn(dt);
  for (let t = 2 * dt; t < T; t += dt) { const c = fn(t); if (b > a && b >= c && b - Math.min(a, c) > 1e-9) peaks++; a = b; b = c; }
  return peaks / T;
}

/* ---------------- [data-pc] attributes ---------------- */
test('parseSpec: ids, optional style JSON and stateKey; junk is rejected', () => {
  assert.deepEqual(P.parseSpec('tree_oak', null, null), { id: 'tree_oak', st: null, pck: null });
  assert.deepEqual(P.parseSpec(' roof_blue ', '{"wall":"wall_pink"}', ' wall_pink|roof_blue|door_blue|d: '),
    { id: 'roof_blue', st: { wall: 'wall_pink' }, pck: 'wall_pink|roof_blue|door_blue|d:' });
  assert.equal(P.parseSpec('', null, null), null);
  assert.equal(P.parseSpec('<img onerror=x>', null, null), null);
  assert.equal(P.parseSpec('Tree_Oak', null, null), null, 'ids are lower case');
  assert.equal(P.parseSpec(null, null, null), null);
  assert.equal(P.parseSpec('tree_oak', '{bad json', null).st, null, 'bad JSON → no style, still an icon');
  assert.equal(P.parseSpec('tree_oak', '[1,2]', null).st, null, 'arrays are not styles');
  assert.equal(P.parseSpec('tree_oak', '"str"', null).st, null);
  assert.equal(P.parseSpec('tree_oak', '', '').pck, null);
});

test('cleanSt keeps only known ids in their own slots; details become a sorted unique list', () => {
  const s = P.cleanSt({
    wall: 'wall_pink', roof: 'wall_mint', door: 'door_nope', course: 'course_candy', ball: 'ball_gold', stadium: 'stadium_snow', kart: 'kart_lime',
    details: { detail_lights: true, detail_flag: false, detail_chimney: 1, tree_oak: true },
    pet: 'pet_bunny', acc: { hat: 'acc_bow', neck: 'acc_bow', face: 'acc_shades', back: 'acc_nope' }, junk: 1
  }, L);
  assert.deepEqual(s, {
    wall: 'wall_pink', course: 'course_candy', ball: 'ball_gold', stadium: 'stadium_snow', kart: 'kart_lime',
    details: ['detail_chimney', 'detail_lights'], pet: 'pet_bunny', acc: { neck: 'acc_bow', face: 'acc_shades' }
  });
  assert.deepEqual(P.cleanSt({ details: ['detail_flag', 'detail_flag', 'detail_chimney'] }, L).details, ['detail_chimney', 'detail_flag']);
  assert.deepEqual(P.cleanSt(null, L), {});
  assert.deepEqual(P.cleanSt({ pet: 'tree_oak', acc: 'acc_crown' }, L), {});
});

/* ---------------- render specs and keys ---------------- */
test('renderSpec: every CATALOG id with every style sample resolves to something the kit can build', () => {
  IDS.forEach((id) => ST_SAMPLES.forEach((st) => {
    const sp = P.renderSpec(id, st, L);
    assert.ok(sp, id);
    assert.ok(L.LOOK[sp.id], id + ' renders a LOOK id');
    assert.equal(sp.src, id);
    assert.equal(sp.kind, L.LOOK[sp.id].kind);
    assert.equal(sp.stateKey, L.stateKey(sp.id, sp.st), id + ': the key is the rendered item\'s stateKey');
    assert.equal(sp.key, sp.id + '#' + sp.stateKey);
  }));
  assert.equal(P.renderSpec('nope_item', {}, L), null);
  assert.equal(P.renderSpec('Bad Id', {}, L), null);
});

test('renderSpec: style items render the player\'s own house wearing that style', () => {
  const st = { wall: 'wall_sky', roof: 'roof_thatch', door: 'door_red', details: { detail_windowbox: true } };
  STYLES.forEach((id) => {
    const sp = P.renderSpec(id, st, L);
    assert.equal(sp.id, 'house_cottage', id);
    const slot = L.LOOK[id].slot;
    if (slot === 'detail') assert.ok(sp.st.details.includes(id) || (id === 'detail_flag' && sp.st.roof === 'roof_castle'), id);
    else assert.equal(sp.st[slot], id, id + ' replaces the ' + slot);
    ['wall', 'roof', 'door'].filter((k) => k !== slot).forEach((k) => assert.equal(sp.st[k], st[k], id + ' keeps the player\'s ' + k));
    /* the same picture as the house in that state: one cached PNG */
    assert.equal(sp.key, P.renderSpec('house_cottage', sp.st, L).key, id);
  });
  /* the castle drops the rooftop flag, so detail_flag on a castle is the plain castle house */
  const castle = { wall: 'wall_cream', roof: 'roof_castle', door: 'door_blue' };
  assert.equal(P.renderSpec('detail_flag', castle, L).key, P.renderSpec('house_cottage', castle, L).key);
  assert.equal(P.renderSpec('roof_red', {}, L).key, 'house_cottage#wall_cream|roof_red|door_blue|d:', 'defaults without a style');
});

test('renderSpec: accessories render on the active pet (puppy by default); pets wear their acc', () => {
  ACCS.forEach((id) => {
    const sp = P.renderSpec(id, { pet: 'pet_kitten', acc: { hat: 'acc_partyhat', neck: 'acc_scarf' } }, L);
    assert.equal(sp.id, 'pet_kitten', id);
    assert.equal(sp.kind, 'pet');
    assert.equal(sp.st.acc[L.LOOK[id].socket], id, id + ' is worn in its socket');
    assert.equal(sp.key, P.renderSpec('pet_kitten', sp.st, L).key, id + ' shares the pet\'s key');
    assert.equal(P.renderSpec(id, {}, L).id, 'pet_puppy');
  });
  PETS.forEach((id) => assert.equal(P.renderSpec(id, { acc: { face: 'acc_shades' } }, L).stateKey, 'a:acc_shades'));
  assert.equal(P.renderSpec('pet_bunny', {}, L).key, 'pet_bunny#a:');
});

test('renderSpec: attractions follow their selections; plain decor is one look; land is kind land', () => {
  const st = { course: 'course_beach', ball: 'ball_rainbow', stadium: 'stadium_beach', kart: 'kart_gold' };
  assert.equal(P.renderSpec('att_course', st, L).key, 'att_course#course_beach');
  assert.equal(P.renderSpec('att_pitch', st, L).key, 'att_pitch#ball_rainbow|stadium_beach');
  assert.equal(P.renderSpec('att_kart', st, L).key, 'att_kart#kart_gold');
  assert.equal(P.renderSpec('tree_oak', st, L).key, 'tree_oak#base');
  assert.equal(P.renderSpec('kart_blue', st, L).key, 'kart_blue#base', 'a kart cosmetic is always its own colour');
  assert.equal(P.renderSpec('land_cove', st, L).kind, 'land');
  assert.equal(P.renderSpec('course_snow', st, L).kind, 'variant');
  /* key order in the style never changes the key */
  const a = P.renderSpec('house_cottage', { wall: 'wall_pink', details: { detail_lights: true, detail_chimney: true } }, L);
  const b = P.renderSpec('house_cottage', { details: { detail_chimney: true, detail_lights: true }, wall: 'wall_pink' }, L);
  assert.equal(a.key, b.key);
});

test('renderSpec without world-look: a stable fallback key from the id and the cleaned style', () => {
  const a = P.renderSpec('roof_blue', { wall: 'wall_pink', roof: 'roof_red' }, null);
  const b = P.renderSpec('roof_blue', { roof: 'roof_red', wall: 'wall_pink' }, null);
  assert.equal(a.key, b.key);
  assert.equal(a.id, 'roof_blue');
  assert.equal(P.renderSpec('pet_puppy', {}, null).kind, 'pet');
  assert.equal(P.renderSpec('land_cove', {}, null).kind, 'land');
  assert.equal(P.renderSpec('tree_oak', {}, null).key, 'tree_oak#base');
  assert.equal(P.stableKey({ b: [1, { d: 2, c: 1 }], a: 'x' }), '{a:x,b:[1,{c:1,d:2}]}');
});

test('stFromKey inverts SLIslandLook.stateKey for every id (data-pck alone gives the same picture)', () => {
  const r = rng(7);
  const pick = (list) => list[Math.floor(r() * list.length)];
  const walls = Object.keys(L.LOCKED.WALL), roofs = STYLES.filter((x) => /^roof_/.test(x)), doors = Object.keys(L.LOCKED.DOOR);
  const details = STYLES.filter((x) => /^detail_/.test(x));
  const samples = ST_SAMPLES.slice();
  for (let i = 0; i < 60; i++) {
    const acc = {};
    ACCS.forEach((a) => { if (r() < 0.4) acc[L.LOOK[a].socket] = a; });
    samples.push({ wall: pick(walls), roof: pick(roofs), door: pick(doors), details: details.filter(() => r() < 0.5),
      course: pick(['course_meadow', 'course_beach', 'course_snow', 'course_candy']), ball: pick(['ball_classic', 'ball_planet']),
      stadium: pick(['stadium_day', 'stadium_snow']), kart: pick(['kart_red', 'kart_lime']), pet: pick(PETS), acc });
  }
  IDS.forEach((id) => samples.forEach((st) => {
    const key = L.stateKey(id, st);
    const back = P.stFromKey(id, key, L);
    assert.equal(L.stateKey(id, back), key, id + ' ' + key);
    assert.equal(P.renderSpec(id, back, L).key, P.renderSpec(id, st, L).key, id + ' renders the same');
  }));
  assert.deepEqual(P.stFromKey('house_cottage', 'garbage', L), {});
  assert.deepEqual(P.stFromKey('house_cottage', 'wall_x|roof_red|door_blue|d:tree_oak', L), { roof: 'roof_red', door: 'door_blue', details: [] });
  assert.deepEqual(P.stFromKey('tree_oak', 'base', L), {});
  assert.deepEqual(P.stFromKey('nope', 'x', L), {});
});

/* ---------------- Cache Storage naming ---------------- */
test('cache naming: sl-pc-<LOOK_VERSION>, same-origin keys, stale sweeps and trims', () => {
  assert.equal(P.cacheName(L.LOOK_VERSION), 'sl-pc-' + L.LOOK_VERSION);
  assert.equal(P.CACHE_PREFIX, 'sl-pc-', 'sw.js keeps every sl-pc-* cache on activate');
  const u = P.cacheUrl('https://x.test/app/index.html', 'house_cottage#wall_pink|roof_red|door_blue|d:');
  assert.ok(u.startsWith('https://x.test/app/__sl-pc/'));
  assert.ok(u.endsWith('.png'));
  assert.ok(!/[#|]/.test(u.slice(8)), 'the key is URL-encoded');
  assert.notEqual(P.cacheUrl('https://x.test/', 'a#b'), P.cacheUrl('https://x.test/', 'a#c'));
  assert.deepEqual(P.staleCaches(['sl-pc-1', 'sl-pc-2', 'sl-v99', 'other', 7], 'sl-pc-2'), ['sl-pc-1']);
  assert.equal(P.trimCount(450, 400), 50);
  assert.equal(P.trimCount(10, 400), 0);
});

/* ---------------- framing ---------------- */
test('basis: the bible\'s 3/4 view — yaw +25 puts the camera on the item\'s front-left, looking down 28°', () => {
  const B = P.basis(25, 28);
  const g = G3.basis(25, 28);
  ['D', 'F', 'R', 'U'].forEach((k) => ['x', 'y', 'z'].forEach((c) => assert.ok(near(B[k][c], g[k][c], 1e-12), k + c + ' matches SLGrid3D')));
  assert.ok(B.D.x > 0 && B.D.z > 0 && B.D.y > 0, 'front (+z), the item\'s left (+x), above');
  assert.ok(near(Math.asin(B.D.y) * 180 / Math.PI, 28, 1e-9));
  const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
  assert.ok(near(dot(B.R, B.U), 0) && near(dot(B.R, B.F), 0) && near(dot(B.U, B.F), 0));
  assert.ok(near(dot(B.R, B.R), 1) && near(dot(B.U, B.U), 1));
  assert.ok(B.U.y > 0, 'never rolls');
  const out = P.camPos(1, 2, 3, 25, 28, 10, {});
  assert.ok(near(out.x, 1 + B.D.x * 10) && near(out.y, 2 + B.D.y * 10) && near(out.z, 3 + B.D.z * 10));
});

test('fitView: random boxes fill 80% of a square icon, centred, every corner inside (checked with SLGrid3D.project)', () => {
  const r = rng(42);
  for (let i = 0; i < 300; i++) {
    const w = 0.1 + r() * 3, h = 0.05 + r() * 3, d = 0.1 + r() * 3, x = (r() - 0.5) * 2, z = (r() - 0.5) * 2, y = r() < 0.3 ? -r() * 0.2 : 0;
    const pts = P.boxPoints([x - w / 2, y, z - d / 2], [x + w / 2, y + h, z + d / 2]);
    assert.equal(pts.length, 24);
    const v = P.fitView(pts, { fov: 30, yaw: 25, elev: 28, aspect: 1, fill: 0.8 });
    const cam = { position: { x: v.px, y: v.py, z: v.pz }, target: { x: v.tx, y: v.ty, z: v.tz }, fov: 30, aspect: 1 };
    let mnx = 9, mxx = -9, mny = 9, mxy = -9, mind = Infinity, maxd = 0;
    for (let k = 0; k < 8; k++) {
      const q = G3.project([pts[k * 3], pts[k * 3 + 1], pts[k * 3 + 2]], cam);
      mnx = Math.min(mnx, q.x); mxx = Math.max(mxx, q.x); mny = Math.min(mny, q.y); mxy = Math.max(mxy, q.y);
      mind = Math.min(mind, q.depth); maxd = Math.max(maxd, q.depth);
    }
    const ext = Math.max(-mnx, mxx, -mny, mxy);
    assert.ok(ext <= 0.8 + 1e-6, 'inside ±0.8 (' + ext + ')');
    assert.ok(ext >= 0.78, 'tight: the item fills 80% (' + ext + ')');
    assert.ok(Math.abs(mnx + mxx) / 2 < 0.01 && Math.abs(mny + mxy) / 2 < 0.01, 'centred');
    assert.ok(v.near > 0 && v.near < mind && v.far > maxd, 'near/far bracket the item');
    assert.ok(near(v.minX, mnx, 1e-6) && near(v.maxY, mxy, 1e-6), 'reported extents');
  }
});

test('fitView: turntable framing at any host aspect keeps the riser and item inside ±fill', () => {
  [0.45, 0.75, 1, 1.4, 2.2].forEach((aspect) => {
    const pts = [];
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; pts.push(Math.cos(a) * 0.75, 0, Math.sin(a) * 0.75, Math.cos(a) * 0.75, 1.6, Math.sin(a) * 0.75); }
    const v = P.fitView(pts, { yaw: 0, elev: 28, aspect, fill: 0.86 });
    const cam = { position: { x: v.px, y: v.py, z: v.pz }, target: { x: v.tx, y: v.ty, z: v.tz }, fov: 30, aspect };
    for (let k = 0; k < pts.length / 3; k++) {
      const q = G3.project([pts[k * 3], pts[k * 3 + 1], pts[k * 3 + 2]], cam);
      assert.ok(Math.abs(q.x) <= 0.86 + 1e-6 && Math.abs(q.y) <= 0.86 + 1e-6, 'aspect ' + aspect);
    }
    assert.ok(Math.max(-v.minX, v.maxX, -v.minY, v.maxY) > 0.84, 'tight at aspect ' + aspect);
  });
  /* an empty point set still gives a usable camera */
  const e = P.fitView([], {});
  assert.ok(e.dist > 0 && isFinite(e.px) && e.near > 0 && e.far > e.near);
});

test('sizeFor / fitScale: the turntable buffer is capped (dpr ≤ 2, ≤ 512 px) and items fit the riser', () => {
  assert.deepEqual(P.sizeFor(200, 150, 1, 512), { w: 200, h: 150 });
  assert.deepEqual(P.sizeFor(200, 150, 3, 512), { w: 400, h: 300 }, 'dpr capped at 2');
  const big = P.sizeFor(400, 300, 2, 512);
  assert.ok(big.w === 512 && Math.abs(big.w / big.h - 4 / 3) < 0.01, 'aspect kept under the cap');
  assert.equal(P.sizeFor(0, 100, 2, 512), null);
  assert.equal(P.sizeFor(100, 0.4, 2, 512), null);
  assert.deepEqual(P.sizeFor(120, 120, 0, 512), { w: 120, h: 120 }, 'a junk dpr counts as 1');
  /* the house (≈2 × 2 plan, 2.9 tall) shrinks; a ball grows; never beyond the clamps */
  const house = P.fitScale(Math.SQRT2, 2.9), ball = P.fitScale(0.15, 0.3);
  assert.ok(house < 1 && house * Math.SQRT2 <= P.TT.itemR + 1e-9 && house * 2.9 <= P.TT.itemH + 1e-9);
  assert.ok(ball > 1 && ball <= 4);
  assert.equal(P.fitScale(0, 0), 4);
  assert.equal(P.fitScale(1e6, 1e6), 0.2);
});

/* ---------------- turntable motion ---------------- */
test('turntableAngle: 0.15 rev/s from the 3/4 pose; still under reduced motion', () => {
  assert.equal(P.turntableAngle(0, {}), -25);
  assert.ok(near(P.turntableAngle(1 / 0.15, {}), -25, 1e-9), 'one full turn in 6.67 s');
  assert.ok(near(P.turntableAngle(1, {}), -25 + 54, 1e-9));
  assert.equal(P.turntableAngle(30, { reduced: true }), -25);
  for (let t = 0; t < 100; t += 0.37) { const a = P.turntableAngle(t, {}); assert.ok(a >= -180 && a < 180); }
  assert.ok(P.TT.rps <= 0.2, 'a slow turn');
});

test('beamSway and the turntable never flash or move faster than 2 Hz; reduced motion holds the beams still', () => {
  const hz = peaksPerSec((t) => P.beamSway(t, 0, false));
  assert.ok(hz > 0 && hz <= 0.2, 'a slow sweep (' + hz + ' Hz)');
  assert.ok(near(P.beamSway(1.3, 0, false), -P.beamSway(1.3, 1, false), 1e-12), 'the two beams cross (opposite phases)');
  for (let t = 0; t < 10; t += 0.5) assert.equal(P.beamSway(t, 1, true), 0);
  assert.ok(Math.abs(P.beamSway(2.7, 0, false)) <= 0.22 + 1e-12);
});

test('sparkleAt: deterministic bursts that fade once (no strobing); reduced = in place, gone in 0.4 s', () => {
  const a = P.sparkleAt(0.3, 3, 16, 1234, false, {}), b = P.sparkleAt(0.3, 3, 16, 1234, false, {});
  assert.deepEqual(a, b);
  for (let i = 0; i < 16; i++) {
    let prevA = 2, peakSeen = false, prevD = -1, lastAlive = 0;
    for (let t = 0; t <= 1.4; t += 0.01) {
      const p = P.sparkleAt(t, i, 16, 99, false, {});
      if (!p.alive) { assert.equal(p.alpha, 0); continue; }
      lastAlive = t;
      assert.ok(p.alpha >= 0 && p.alpha <= 1 && p.size >= 0 && p.size < 0.2);
      assert.ok(p.alpha <= prevA + 1e-12, 'alpha only falls'); prevA = p.alpha;
      const dxy = Math.hypot(p.x, p.z);
      assert.ok(dxy >= prevD - 1e-9 && dxy <= 0.9 + 1e-9, 'flies outward, within reach'); prevD = dxy;
      peakSeen = true;
    }
    assert.ok(peakSeen && lastAlive >= 0.8 && lastAlive <= 1.2, 'lives 0.85–1.2 s');
  }
  const r0 = P.sparkleAt(0, 2, 8, 5, true, {}), r1 = P.sparkleAt(0.3, 2, 8, 5, true, {});
  assert.equal(r0.x, r1.x); assert.equal(r0.y, r1.y); assert.equal(r0.z, r1.z);
  assert.ok(r1.alpha < r0.alpha);
  assert.equal(P.sparkleAt(0.41, 2, 8, 5, true, {}).alive, false);
  const g = P.glintAt(0.3, 0.6, {});
  assert.ok(near(g.alpha, 1, 1e-9) && g.alive);
  assert.equal(P.glintAt(0.7, 0.6, {}).alive, false);
});

test('debutPose matches SLMotion\'s debut timeline (one 360° turn over 1.2 s; reduced = a fade)', () => {
  assert.equal(typeof globalThis.SLMotion, 'undefined', 'the Node path uses the built-in fallback');
  for (let t = 0; t <= 1.5; t += 0.05) {
    [false, true].forEach((red) => {
      const mine = P.debutPose(t, red, {}), ref = M.sample('debut', t, {}, { reduced: red });
      assert.ok(near(mine.deg, ref.deg, 1e-9) && near(mine.s, ref.s, 1e-9) && near(mine.a, ref.a, 1e-9), t + ' ' + red);
    });
  }
  assert.ok(near(P.debutPose(0.6, false, {}).deg, 180, 1e-9));
  assert.equal(P.debutPose(2, false, {}).deg, 0);
  assert.equal(P.debutPose(0.5, true, {}).deg, 0);
});

test('alphaRamp: the spot-cone fade is brightest near the lamp and soft at both ends', () => {
  const r = P.alphaRamp(64);
  assert.equal(r.length, 256);
  for (let i = 0; i < 64; i++) { assert.equal(r[i * 4], 255); assert.ok(r[i * 4 + 3] <= 255); }
  for (let i = 1; i < 60; i++) assert.ok(r[i * 4 + 3] >= r[(i - 1) * 4 + 3], 'rises toward the lamp');
  assert.ok(r[3] > 40 && r[3] < 110, 'a faint beam on the riser');
  assert.ok(r[63 * 4 + 3] < r[60 * 4 + 3], 'the very tip fades');
});

test('lru: recency order, eviction, replacement and clear all hand the old value to onEvict', () => {
  const ev = [];
  const c = P.lru(3, (k, v) => ev.push(k + '=' + v));
  c.set('a', 1).set('b', 2).set('c', 3);
  assert.equal(c.get('a'), 1, 'a is now the most recent');
  c.set('d', 4);
  assert.deepEqual(ev, ['b=2']);
  assert.deepEqual(c.keys(), ['c', 'a', 'd']);
  c.set('c', 30);
  assert.deepEqual(ev, ['b=2', 'c=3']);
  c.set('c', 30);
  assert.equal(ev.length, 2, 'setting the same value is not an eviction');
  assert.equal(c.delete('a'), true); assert.equal(c.delete('zz'), false);
  c.clear();
  assert.equal(c.size, 0);
  assert.deepEqual(ev, ['b=2', 'c=3', 'a=1', 'd=4', 'c=30']);
  assert.equal(c.get('x'), undefined);
});

test('needsFont: only the PET COURSE banner items wait for Bagel Fat One', () => {
  assert.equal(P.needsFont('att_course'), true);
  assert.equal(P.needsFont('course_snow'), true);
  assert.equal(P.needsFont('tree_oak'), false);
  assert.equal(P.needsFont(undefined), false);
});

/* ---------------- the Node no-op API ---------------- */
test('in Node the browser entry points exist and do nothing (the SVG icons stay)', async () => {
  assert.equal(await P.fill({ querySelectorAll: () => [] }), 0);
  assert.equal(await P.prewarm(['tree_oak']), 0);
  assert.equal(await P.url('tree_oak', {}), null);
  await P.clear();
  const stop = P.turntable({}, 'tree_oak', {}, {});
  assert.equal(typeof stop, 'function');
  assert.equal(await stop.ready, false);
  stop(); stop.set('roof_red', {}); stop.debut(); stop.stop();
  P.dispose();
  assert.deepEqual(P.info(), { dom: false });
  assert.equal(P.OUT, 256, '256² PNGs');
  assert.equal(P.IDLE_MS, 30000, 'the renderer is disposed after 30 s idle');
  assert.deepEqual([P.CAM.fov, P.CAM.elev, P.CAM.yaw, P.CAM.fill], [30, 28, 25, 0.8]);
  assert.equal(P.TT.riserR, 0.7);
  assert.equal(P.RISER_TOP, L.EXTRA['Riser Top'], 'the riser top is the look table\'s Riser Top');
});

/* ---------------- browser-style load ---------------- */
function browserLoad() {
  const listeners = [];
  const el = () => ({ style: {}, setAttribute() {}, getAttribute() { return null; }, addEventListener() {}, appendChild() {}, querySelectorAll() { return []; } });
  const ctx = {
    document: { createElement: el, addEventListener: (t) => listeners.push('doc:' + t), hidden: false, baseURI: 'https://x.test/' },
    addEventListener: (t) => listeners.push('win:' + t),
    localStorage: { getItem: () => null },
    performance: { now: () => 0 }, setTimeout, clearTimeout, Promise, Map, Uint8Array, Math, Date, JSON, Object, Array, String, Number, Infinity
  };
  ctx.window = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx, { filename: 'photocard.js' });
  return { ctx, listeners };
}
test('browser load: a classic script that installs window.SLPhotocard once and never needs a mounted island', async () => {
  const { ctx, listeners } = browserLoad();
  const api = ctx.SLPhotocard;
  assert.ok(api && api.__pc, 'window.SLPhotocard');
  ['fill', 'turntable', 'prewarm', 'url', 'clear', 'dispose', 'info'].forEach((k) => assert.equal(typeof api[k], 'function', k));
  assert.ok(listeners.includes('win:pagehide') && listeners.includes('doc:visibilitychange'));
  /* a second copy (stage injection + the app) reuses the first engine */
  vm.runInContext(SRC, ctx, { filename: 'photocard.js' });
  assert.equal(ctx.SLPhotocard, api);
  /* without SLIsland3D nothing renders and nothing throws: the SVG stays */
  const host = { nodeType: 1, style: {}, firstElementChild: null };
  const stop = api.turntable(host, 'tree_oak', {}, {});
  assert.equal(await stop.ready, false);
  assert.equal(api.info().blocked, 'no stage');
  assert.equal(api.info().turntables, 0);
  const span = { getAttribute: (k) => (k === 'data-pc' ? 'tree_oak' : null), matches: () => true, querySelectorAll: () => [], querySelector: () => null };
  assert.equal(await api.fill({ querySelectorAll: () => [span] }), 0);
  /* slNo3D: a parent's kill switch turns photocards off entirely */
  ctx.localStorage.getItem = (k) => (k === 'slNo3D' ? '1' : null);
  assert.equal(await api.fill({ querySelectorAll: () => [span] }), 0);
  assert.equal(api.info().blocked, 'slNo3D');
});

/* ---------------- static rules ---------------- */
test('source rules: classic script, THREE only through SL3D, no point/spot lights, its own small renderer', () => {
  assert.ok(!/^\s*(import|export)\s/m.test(SRC), 'a classic script');
  assert.ok(!/window\.THREE|root\.THREE|globalThis\.THREE/.test(SRC), 'never a global THREE');
  assert.ok(!/new THREE\./.test(SRC), 'THREE comes from SL3D');
  assert.ok(!/PointLight|SpotLight|RectAreaLight/.test(SRC.replace(/\/\*[\s\S]*?\*\//g, '')), 'no point/spot lights (spot cones are faked)');
  assert.ok(/S\.createRenderer\(/.test(SRC) && !/new T\.WebGLRenderer/.test(SRC), 'the renderer comes from SL3D.createRenderer');
  assert.ok(/forceContextLoss\(\)/.test(SRC), 'the context is force-lost when idle');
  assert.ok(/SLIsland3D\.ensure\(\)/.test(SRC), 'works from ensure() without a mounted island');
  assert.ok(/\.makeRig\(/.test(SRC) && /S\.make\(/.test(SRC), 'uses SL3D.make and makeRig');
  assert.ok(!/setInterval\(/.test(SRC), 'no free-running timers');
  assert.ok(!/localStorage\.setItem/.test(SRC), 'reads the kill switch, never writes device state');
  assert.ok(!/#[0-9a-fA-F]{6}'/.test(SRC.replace("RISER_TOP = '#FFF0FA'", '')), 'no raw hex colours besides the riser fallback');
});

test('stage.js loads photocard.js as the SLPhotocard global; the architecture names it', () => {
  const f = S.FILES.find((x) => x.path === 'photocard.js');
  assert.ok(f, 'in the stage file list');
  assert.equal(f.global, 'SLPhotocard');
  assert.ok(!f.required, 'optional: a missing photocard file keeps the SVG icons');
  const arch = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'docs', 'island3d', 'island-architecture.json'), 'utf8'));
  assert.ok(JSON.stringify(arch).includes("'sl-pc-<LOOK_VERSION>'"));
});
