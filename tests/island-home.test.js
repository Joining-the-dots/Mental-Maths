'use strict';
/* My Island 3D — home models (world/island3d/models-home.js), the pure layer:
   style resolution and keys (shapes × trims; cottage keys byte-identical to v1), per-shape
   layouts inside the footprint, heights, budgets and the idle/act timelines. The THREE
   builders run only in the browser (checked in the lab). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const H = require('../world/island3d/models-home.js');
const L = require('../world/world-look.js');
const C = require('../world/world-core.js');

const SRC_PATH = path.join(__dirname, '..', 'world', 'island3d', 'models-home.js');
const SRC = fs.readFileSync(SRC_PATH, 'utf8');
const MARGIN = 0.935;   /* 2×2 footprint half-size 1 minus the 0.07 margin (+ rounding) */
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
function peaksPerSec(fn, T = 20, dt = 1 / 480) {
  let peaks = 0, a = fn(0), b = fn(dt);
  for (let t = 2 * dt; t < T; t += dt) { const c = fn(t); if (b > a && b >= c && b - Math.min(a, c) > 1e-6) peaks++; a = b; b = c; }
  return peaks / T;
}
/* load the file the way the browser does: a classic script with no module/require */
function browserLoad(extra) {
  const calls = [];
  const ctx = Object.assign({ SL3D: { defineModels: (cat, f) => calls.push({ cat, f }) } }, extra || {});
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx, { filename: 'models-home.js' });
  return { ctx, calls };
}
const styleIds = C.CATALOG.filter((it) => it.kind === 'style').map((it) => it.id);
const SHAPES = C.CATALOG.filter((it) => it.slot === 'shape').map((it) => it.id);
const MODERN = SHAPES.filter((s) => s !== 'shape_cottage');
const subsets = [];
for (let m = 0; m < 1 << H.DETAILS.length; m++) subsets.push(H.DETAILS.filter((d, i) => m & (1 << i)));
const combos = [];
for (const wall of H.WALLS) for (const roof of H.ROOFS) for (const door of H.DOORS) for (const details of subsets) combos.push({ wall, roof, door, details });
function inFootprint(p, label, pad = 0) {
  assert.ok(Math.abs(p[0]) + pad <= MARGIN && Math.abs(p[2]) + pad <= MARGIN && p[1] >= -1e-9, label + ' ' + p.map((v) => v.toFixed(3)).join(','));
}
function boxIn(b, label) {
  inFootprint([b.x0, b.y0 == null ? 0 : b.y0, b.z0], label); inFootprint([b.x1, b.y1 == null ? 0 : b.y1, b.z1], label);
}
const PLAIN = (st) => ({ wall: st.wall, roof: st.roof, door: st.door, details: st.details, shape: st.shape, variant: st.variant });

/* ---------------- registration ---------------- */
test('home: registers house_cottage and every CATALOG home style (shapes too) through SL3D.defineModels', () => {
  const { ctx, calls } = browserLoad({ SLWorldCore: C });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].cat, 'home');
  assert.equal(typeof calls[0].f, 'function');
  assert.equal(typeof ctx.SLHome3D, 'object', 'window.SLHome3D for the lab');
  const ids = H.homeIds();
  assert.ok(ids.includes('house_cottage'));
  for (const id of styleIds) assert.ok(ids.includes(id), id + ' registered');
  assert.equal(ids.length, styleIds.length + 1);
  assert.deepEqual(H.STYLE_IDS.slice().sort(), styleIds.slice().sort(), 'the file knows every style id by name');
  assert.deepEqual(H.SHAPES, L.HOUSE_SHAPES, 'the five shapes, in the look order');
  assert.deepEqual(H.SHAPES.slice().sort(), SHAPES.slice().sort());
  for (const w of ['wall_concrete', 'wall_gallery', 'wall_graphite', 'wall_midnight']) assert.ok(H.WALLS.includes(w), w);
  assert.ok(H.DOORS.includes('door_glass') && H.DETAILS.includes('detail_neon'));
  /* without THREE the factory registers nothing rather than throwing */
  assert.equal(Object.keys(calls[0].f({}, {})).length, 0);
});

test('home: the module stays a classic script (no import/export, never window.THREE)', () => {
  assert.ok(!/^\s*(import|export)\s/m.test(SRC));
  assert.ok(!/window\.THREE|root\.THREE|globalThis\.THREE/.test(SRC));
  assert.ok(!/(^|[^.\w])THREE\./.test(SRC.slice(0, SRC.indexOf('function factory('))), 'no THREE use in the pure layer');
});

/* ---------------- style state and keys ---------------- */
test('home: homeState matches SLIslandLook.resolveStyle (shape and trim too) for the house and every style id', () => {
  const samples = [{}, { wall: 'wall_lilac', roof: 'roof_castle', door: 'door_gold', details: { detail_flag: true, detail_lights: true } },
    { roof: 'roof_thatch', details: ['detail_chimney', 'detail_windowbox', 'nope'] }, { shape: 'shape_cottage', variant: 1 },
    { shape: 'shape_dome', variant: 1, door: 'door_glass', details: ['detail_neon'] }, { shape: 'shape_tower', variant: '1', wall: 'wall_midnight' },
    { shape: 'shape_villa', variant: 7 }, { shape: 'shape_nope', variant: -2 }].concat(combos.filter((c, i) => i % 211 === 0).map((c, i) => ({ ...c, shape: SHAPES[i % 5], variant: i % 2 })));
  for (const id of ['house_cottage'].concat(styleIds)) {
    for (const st of samples) {
      const want = L.resolveStyle(id, st);
      assert.deepEqual(H.homeState(id, st), PLAIN(want), id + ' ' + JSON.stringify(st));
    }
  }
  /* ids from a newer save fall back to the defaults (the loft is the default shape), so a build never throws */
  assert.deepEqual(H.homeState('house_cottage', { wall: 'wall_x', roof: 'roof_y', door: 'door_z', shape: 'shape_w' }),
    { wall: 'wall_cream', roof: 'roof_red', door: 'door_blue', details: [], shape: 'shape_loft', variant: 0 });
  assert.equal(H.DEFAULTS.shape, L.SLOT_DEFAULTS.shape);
  assert.equal(H.DEFAULTS.shape, C.DEFAULTS.shape);
});

test('home: the fallback resolver (no SLIslandLook) agrees with the look table', () => {
  const { ctx } = browserLoad({});
  const F = ctx.SLHome3D;
  const sts = [{}, combos[77], combos[1203], { wall: 'wall_pink', details: { detail_flag: 1, detail_lights: 0 } },
    { ...combos[2400], shape: 'shape_tower', variant: 1 }, { ...combos[999], shape: 'shape_cottage', variant: 1 }, { shape: 'shape_dome', variant: 3 }];
  for (const id of ['house_cottage'].concat(styleIds)) {
    for (const st of sts) {
      const want = L.resolveStyle(id, st);
      assert.deepEqual(JSON.parse(JSON.stringify(F.homeState(id, st))), PLAIN(want), id);
    }
  }
  assert.equal(F.roofTop('roof_candy', 'shape_villa'), L.HOUSE_H.shape_villa.roof_candy, 'the HOUSE_H fallback table matches');
  for (const shape of SHAPES) for (const roof of H.ROOFS) if (shape !== 'shape_cottage') assert.equal(F.roofTop(roof, shape), L.HOUSE_H[shape][roof]);
});

test('home: the castle hides the rooftop flag on every shape; a flag preview on a castle shows none', () => {
  assert.deepEqual(H.homeState('house_cottage', { roof: 'roof_castle', details: ['detail_flag', 'detail_lights'] }).details, ['detail_lights']);
  assert.deepEqual(H.homeState('detail_flag', { roof: 'roof_castle' }).details, []);
  assert.deepEqual(H.homeState('roof_castle', { details: { detail_flag: true } }).details, []);
  for (const shape of SHAPES) {
    assert.equal(H.flagAt('roof_castle', shape), null, shape);
    assert.deepEqual(H.homeState('house_cottage', { shape, roof: 'roof_castle', details: ['detail_flag'] }).details, [], shape);
    assert.equal(H.partsFor({ shape, wall: 'wall_cream', roof: 'roof_castle', door: 'door_blue', details: ['detail_flag'] }).includes('anim'), false, shape + ': no pennant');
  }
  assert.equal(H.flagAt('roof_castle'), null);
});

test('home: parseKey round-trips SLIslandLook.stateKey for every shape × trim × style combination', () => {
  let n = 0;
  for (const shape of SHAPES) for (const variant of [0, 1]) {
    combos.forEach((c, i) => {
      if (shape !== 'shape_cottage' && i % 3) return;      /* every combo on the cottage, a third on each modern shape */
      const st = { ...c, shape, variant };
      const key = L.stateKey('house_cottage', st);
      const s = H.parseKey(key);
      assert.deepEqual(s, H.homeState('house_cottage', st), key);
      assert.equal(H.stateKeyOf(s), key);
      n++;
    });
  }
  assert.ok(n > 20000);
  /* the cottage keeps the exact v1 key; every other shape appends '|s:<shape>|v:<n>' */
  assert.equal(L.stateKey('house_cottage', { shape: 'shape_cottage' }), 'wall_cream|roof_red|door_blue|d:');
  assert.deepEqual(H.parseKey('wall_mint|roof_blue|door_red|d:detail_flag'),
    { wall: 'wall_mint', roof: 'roof_blue', door: 'door_red', details: ['detail_flag'], shape: 'shape_cottage', variant: 0 }, 'a v1 key is the cottage');
  assert.deepEqual(H.parseKey('wall_cream|roof_red|door_blue|d:detail_neon|s:shape_dome|v:1'),
    { wall: 'wall_cream', roof: 'roof_red', door: 'door_blue', details: ['detail_neon'], shape: 'shape_dome', variant: 1 });
  assert.equal(H.stateKeyOf(H.homeState('house_cottage', {})), 'wall_cream|roof_red|door_blue|d:|s:shape_loft|v:0', 'the loft is the default');
  for (const bad of ['base', 'v:1', 'a|b|c|d:|s:shape_loft', 'a|b|c|d:|s:shape_loft|v:x', 'a|b|c|x:|s:shape_loft|v:0']) assert.equal(H.parseKey(bad), null, bad);
  assert.equal(H.parseKey(null), null);
});

test('home: animated() asks for idle ticks only when something moves', () => {
  assert.equal(H.animated('wall_cream|roof_red|door_blue|d:'), false);
  assert.equal(H.animated('wall_cream|roof_red|door_blue|d:detail_windowbox'), false);
  assert.equal(H.animated('wall_cream|roof_red|door_gold|d:'), true);
  for (const d of ['detail_chimney', 'detail_flag', 'detail_lights', 'detail_neon']) assert.equal(H.animated({ details: [d] }), true, d);
  assert.equal(H.animated({ roof: 'roof_castle', details: ['detail_flag'] }), false, 'the castle drops the flag');
  /* the loft is still; the villa ripple, the tower sign and the dome ring and antenna tick */
  assert.equal(H.animated('wall_cream|roof_red|door_blue|d:|s:shape_loft|v:0'), false);
  for (const s of ['shape_villa', 'shape_tower', 'shape_dome']) assert.equal(H.animated('wall_cream|roof_red|door_blue|d:|s:' + s + '|v:1'), true, s);
  assert.equal(H.animated('nope'), false);
});

test('home: every state builds at most 6 template parts; the cottage keeps its v1 parts', () => {
  for (const shape of SHAPES) for (const roof of H.ROOFS) for (const details of subsets) {
    const st = { shape, roof, details, wall: 'wall_cream', door: 'door_blue' }, parts = H.partsFor(st);
    assert.ok(parts.length <= H.MAX_PARTS && H.MAX_PARTS === 6, shape + ' ' + roof + ' ' + details + ': ' + parts);
    for (const p of parts) assert.ok(H.PARTS.includes(p), p);
    assert.ok(parts.includes('shell') && parts.includes('window') && parts.includes('door'));
    if (shape === 'shape_cottage') assert.ok(parts.includes('trim') && !parts.includes('sign'));
    else assert.ok(parts.includes('bulb') && !parts.includes('trim'), shape + ' lamps, trims folded into the shell');
    assert.equal(parts.includes('sign'), shape === 'shape_tower');
  }
  assert.deepEqual(H.partsFor('wall_cream|roof_red|door_blue|d:'), ['shell', 'trim', 'window', 'door'], 'the v1 cottage');
  assert.deepEqual(H.partsFor('wall_cream|roof_red|door_blue|d:detail_chimney,detail_lights'), ['shell', 'trim', 'window', 'door', 'bulb', 'anim']);
});

/* ---------------- colours ---------------- */
test('home: every colour token the builders use resolves through the look table; no raw hex', () => {
  const used = [
    ['house_cottage', 'wall', 'WALL.$wall'], ['house_cottage', 'step', 'Step'], ['house_cottage', 'mat', 'Plank'],
    ['house_cottage', 'window', 'Window'], ['house_cottage', 'windowGlow', 'Window Glow'], ['house_cottage', 'muntin', 'Ink'],
    ['roof_thatch', 'straw', 'Straw'], ['roof_candy', 'icing', 'Cloud White'], ['roof_candy', 'cherry', 'Tulip Red'],
    ['roof_castle', 'tower', 'Castle Tower'], ['roof_castle', 'cone', 'Castle Cone'], ['roof_castle', 'slit', 'Lamp Post'],
    ['roof_castle', 'pennantL', 'Coral'], ['roof_castle', 'pennantR', 'Star Gold'],
    ['detail_windowbox', 'box', 'Bark'], ['detail_chimney', 'chimney', 'Chimney'], ['detail_chimney', 'cap', 'Chimney Cap'],
    ['detail_chimney', 'smoke', 'Smoke'], ['detail_chimney', 'flue', 'Gunmetal'], ['detail_lights', 'wire', 'Ink'], ['detail_flag', 'pole', 'Ink'], ['detail_flag', 'pennant', 'Star Gold'],
    ['shape_loft', 'frame', 'Gunmetal'], ['shape_loft', 'soffit', 'Teak'], ['shape_loft', 'parapet', 'Concrete Light'], ['shape_loft', 'downlight', 'Window Warm'],
    ['shape_loft', 'led', 'LED Cyan'], ['shape_villa', 'deck', 'Teak'], ['shape_villa', 'deckAlt', 'Teak Light'], ['shape_villa', 'pool', 'Lagoon'],
    ['shape_villa', 'poolGlow', 'LED Cyan'], ['shape_villa', 'coping', 'Concrete Light'], ['shape_villa', 'cushion', 'Bone White'],
    ['shape_tower', 'plinth', 'Concrete'], ['shape_tower', 'stair', 'Gunmetal'], ['shape_tower', 'signBack', 'Midnight Ink'],
    ['shape_dome', 'ring', 'Gunmetal'], ['shape_dome', 'led', 'LED Cyan'], ['shape_dome', 'antenna', 'Gunmetal'], ['shape_dome', 'tip', 'Sunset Amber'],
    ['door_glass', 'door', 'DOOR.door_glass'], ['door_glass', 'knob', 'Gunmetal Spec']
  ];
  for (const [id, part, fb] of used) {
    const t = H.tokenFor(id, part, fb, { wall: 'wall_sky' });
    assert.ok(L.isToken(t), id + '.' + part + ' → ' + t);
    assert.equal(t, L.LOOK[id].colors[part].replace('$wall', 'wall_sky'), id + '.' + part + ' comes from LOOK');
  }
  for (const id of H.ROOFS.concat(H.DOORS)) for (const part of Object.keys(L.LOOK[id].colors)) assert.ok(L.isToken(H.tokenFor(id, part, 'x')), id + '.' + part);
  for (let i = 1; i <= 5; i++) assert.ok(L.isToken(H.tokenFor('detail_lights', 'b' + i, 'x')));
  /* tokens the modern builders name directly */
  for (const t of ['Night Asphalt', 'Concrete', 'Concrete Light', 'Gunmetal', 'Gunmetal Mid', 'Gunmetal Deep', 'Midnight Ink', 'Graphite',
    'Leaf Deep', 'Bark', 'Teak', 'Cloud White', 'Rose Deep', 'Tulip Pink', 'Window Warm', 'LED Cyan', 'Bone White', L.MEMBER_FALLBACK].concat(L.NEON3)) {
    assert.ok(L.isToken(t), t);
  }
  /* the LOCKED colours reach the builders verbatim, the four new walls and the glass door too */
  assert.equal(L.hex(H.tokenFor('house_cottage', 'wall', 'WALL.$wall', { wall: 'wall_mint' })), '#B8ECD6');
  assert.equal(L.hex(H.tokenFor('house_cottage', 'wall', 'WALL.$wall', { wall: 'wall_midnight' })), '#232A57');
  assert.equal(L.hex(H.tokenFor('door_gold', 'door', '')), '#F0C02F');
  assert.equal(L.hex(H.tokenFor('door_glass', 'door', '')), '#1B2438');
  assert.equal(L.hex(H.tokenFor('roof_red', 'shade', '')), '#C4433C');
  assert.equal(L.LOOK.door_glass.mats.door, 'smoked', 'door_glass renders with the SMOKED matcap');
  /* no raw hex colours in the builders (the member colour is runtime, read from the handle) */
  assert.ok(!/['"]#[0-9a-fA-F]{3,6}['"]/.test(SRC), 'colours are tokens, never raw hex');
  assert.equal(H.hexOf('#abc'), '#AABBCC');
  assert.equal(H.hexOf('ff2e9a'), '#FF2E9A');
  assert.equal(H.hexOf('pink'), null);
  assert.equal(H.hexOf(null), null);
});

/* ---------------- budgets ---------------- */
test('home: budgets mirror the look table and every shape × roof with every detail fits 3,500 tris', () => {
  assert.equal(H.budgetOf('house_cottage', 0), L.BUDGET.house);
  assert.equal(L.LOOK.house_cottage.bodyTris, H.BUDGET.body);
  for (const r of H.ROOFS) assert.equal(H.budgetOf(r, 0), H.BUDGET.roof[r], r);
  for (const d of H.DETAILS) assert.equal(H.budgetOf(d, 0), H.BUDGET.detail[d], d);
  for (const d of H.DOORS) assert.equal(H.budgetOf(d, 0), H.BUDGET.door, d);
  for (const s of SHAPES) { assert.equal(H.budgetOf(s, 0), H.BUDGET.shape[s], s); assert.equal(L.HOUSE_TRIS.body[s], H.BUDGET.shape[s], s); }
  assert.equal(L.HOUSE_TRIS.crown, H.BUDGET.crown);
  assert.equal(L.HOUSE_TRIS.crownCastle, H.BUDGET.crownCastle);
  assert.ok(H.BUDGET.crown <= 900 && H.BUDGET.crownCastle <= 1050);
  for (const s of MODERN) assert.ok(H.BUDGET.shape[s] <= 1200, s);
  assert.ok(H.BUDGET.detail.detail_neon <= 250);
  for (const shape of SHAPES) for (const roof of H.ROOFS) {
    const st = { shape, roof, details: H.DETAILS, door: 'door_gold' };
    const total = H.houseBudget(st);
    assert.equal(total, L.houseBudget(st), shape + ' ' + roof);
    assert.ok(total <= L.BUDGET.house, shape + ' ' + roof + ' worst case ' + total);
  }
  /* the neon roofline: ≤ 24 open 4-sided segments (8 tris each) on every shape and crown */
  for (const shape of SHAPES) for (const roof of H.ROOFS) {
    const n = H.neonSegments(shape, roof).length;
    assert.ok(n >= 6 && n <= H.NEON.segMax && n * 8 <= H.BUDGET.detail.detail_neon, shape + ' ' + roof + ' ' + n);
  }
});

/* ---------------- layouts ---------------- */
test('home: the cottage detail layouts stay as v1, inside the footprint margin', () => {
  for (const roof of H.ROOFS) {
    const sw = H.swag(roof);
    assert.equal(sw.bulbs.length, 11, '11 fairy-light bulbs');
    sw.wire.concat(sw.bulbs).forEach((p) => inFootprint(p, roof + ' lights'));
    for (const b of sw.bulbs) assert.ok(b[1] > H.WIN.y + H.WIN.h / 2, 'bulbs hang above the windows');
    const c = H.chimneyAt(roof);
    inFootprint([c.x + c.w / 2 + 0.04, c.top, c.z + c.w / 2 + 0.04], roof + ' chimney');
    assert.ok(c.x > 0, 'the chimney sits on the right');
    assert.equal(c.kind, 'brick');
    const f = H.flagAt(roof);
    if (f) { inFootprint([f.x + f.w, f.top, f.z], roof + ' flag'); assert.ok(near(f.top, 2.78)); }
  }
  H.tufts(14).forEach((t) => inFootprint([t.p[0] + t.dir[0] * 0.14, t.p[1] + t.dir[1] * 0.14, t.p[2] + t.dir[2] * 0.14], 'tuft tip'));
  assert.equal(H.tufts(14).length, 14);
  assert.ok(H.tufts(14).every((t) => t.dir[1] < 0), 'tufts droop');
  H.sprinkles(24).forEach((s) => inFootprint(s.p, 'sprinkle'));
  const d = H.drips();
  assert.equal(d.length, 12, '12 icing drips');
  d.forEach((x) => { assert.ok(x.h >= 0.05 && x.h <= 0.12); inFootprint(x.p, 'drip'); });
  inFootprint(H.SPOT.map((v, i) => (i === 2 ? 0 : v)), 'spot x');
  /* the v1 dimensions are untouched */
  assert.deepEqual(H.BODY, { w: 1.6, h: 1.1, d: 1.3, z: -0.15, front: 0.5, skirt: 0.2, skirtTone: -0.06 });
  assert.deepEqual(H.DOOR, { w: 0.42, h: 0.62, y0: 0.06, z0: 0.505, t: 0.05, hinge: -0.21, open: 70 });
  assert.deepEqual(H.GABLE, { w: 0.88, eave: 1.04, apex: 2.23, zf: 0.6, zb: -0.9 });
  assert.deepEqual(H.windowBoxesAt('shape_cottage', 0).map((b) => b.cx), [-H.WIN.x, H.WIN.x]);
});

test('home: every shape layout (masses, glazing, door, lights, chimney, flag, neon, window boxes) stays inside the footprint', () => {
  for (const shape of MODERN) {
    const S = H.SHAPE[shape];
    for (const k of ['lower', 'upper', 'main', 'side', 'deck', 'pool', 'lounger', 'plinth', 'body', 'annex', 'pocket']) if (S[k]) boxIn(S[k], shape + ' ' + k);
    for (const k of ['crown', 'pergola']) if (S[k]) boxIn({ x0: S[k].x0, x1: S[k].x1, z0: S[k].z0, z1: S[k].z1 }, shape + ' ' + k);
    (S.hips || []).forEach((h, i) => boxIn({ x0: h.x0 - 0.05, x1: h.x1 + 0.05, z0: h.z0 - 0.05, z1: h.z1, y0: h.y0, y1: h.apex }, shape + ' hip ' + i));
    if (shape === 'shape_dome') {
      inFootprint([0, 0, S.zc - S.R - 0.05], 'dome back');
      inFootprint([S.R + 0.05, 0, S.zc], 'dome side');
      boxIn({ x0: S.portal.x0, x1: S.portal.x1, z0: S.portal.z0, z1: S.portal.z1 + 0.05 }, 'dome portal + door');
    }
    const d = H.doorOf(shape);
    boxIn({ x0: d.x - d.w / 2 - d.slide - 0.04, x1: d.x + d.w / 2 + 0.04, y0: d.y0, y1: d.y0 + d.h, z0: d.z, z1: d.z + d.t + 0.03 }, shape + ' door (open)');
    for (const v of [0, 1]) H.windowBoxesAt(shape, v).forEach((p, i) => {
      const c = Math.abs(Math.cos(p.yaw * Math.PI / 180)), s = Math.abs(Math.sin(p.yaw * Math.PI / 180));
      const ex = c * p.w / 2 + s * p.d / 2, ez = s * p.w / 2 + c * p.d / 2;
      assert.ok(Math.abs(p.cx) + ex <= MARGIN && Math.abs(p.cz) + ez <= MARGIN, shape + ' window box ' + i + ' ' + [p.cx, p.cz]);
      assert.ok(p.top > 0.09, 'planters sit on something');
    });
    for (const roof of H.ROOFS) {
      const sw = H.swag(roof, 10, 11, shape);
      assert.equal(sw.bulbs.length, 11, shape + ' 11 bulbs');
      sw.wire.concat(sw.bulbs).forEach((p) => inFootprint(p, shape + ' ' + roof + ' lights', 0.03));
      const c = H.chimneyAt(roof, shape);
      assert.equal(c.kind, 'flue', 'a steel flue on modern shapes');
      inFootprint([c.x, c.top, c.z], shape + ' chimney', c.w / 2 + 0.02);
      assert.ok(near(c.w, 0.12), 'flue r 0.06');
      const f = H.flagAt(roof, shape);
      if (f) { inFootprint([f.x + f.w, f.top, f.z], shape + ' ' + roof + ' flag'); assert.ok(f.top <= 2.9 && f.top >= H.roofTop(roof, shape) - 0.1, shape + ' flag on the highest point ' + f.top); }
      H.neonSegments(shape, roof).forEach((s) => { inFootprint(s.a, shape + ' neon', 0.031); inFootprint(s.b, shape + ' neon', 0.031); });
    }
  }
  for (const roof of H.ROOFS) H.neonSegments('shape_cottage', roof).forEach((s) => { inFootprint(s.a, 'cottage neon', 0.031); inFootprint(s.b, 'cottage neon', 0.031); });
});

test('home: the avatar spot is the left entrance cell for every shape; doors open onto the entrance row', () => {
  assert.deepEqual(H.SPOT, [-0.5, 0, 1.5]);
  for (const shape of SHAPES) {
    const d = H.doorOf(shape);
    assert.ok(d.anchor[2] > d.z && d.anchor[2] < 1, shape + ' hearts pop just in front of the door');
    assert.ok(Math.abs(d.anchor[0] - d.x) < 1e-9 && d.anchor[1] > d.y0, shape);
    assert.ok(d.x - d.w / 2 < 0.2, shape + ' the door faces the left half of the entrance row');
    if (d.kind === 'swing') assert.ok(near(d.pivot[0], d.x - d.w / 2, 1e-9), shape + ' hinge on the left edge');
  }
  assert.equal(H.doorOf('shape_dome').kind, 'slide');
  for (const s of SHAPES.filter((x) => x !== 'shape_dome')) assert.equal(H.doorOf(s).kind, 'swing', s);
  assert.deepEqual(H.doorOf('shape_cottage').pivot, [H.DOOR.hinge, 0, H.DOOR.z0], 'the v1 hinge');
});

test('home: heights follow HOUSE_H for every shape and roof (all ≤ 2.9); the cottage keeps its v1 tops', () => {
  for (const shape of SHAPES) for (const roof of H.ROOFS) {
    const top = H.roofTop(roof, shape);
    if (shape === 'shape_cottage') {
      if (roof === 'roof_castle') assert.ok(near(top, L.heightOf('house_cottage', { shape, roof })));
      else assert.ok(top >= 2.3 - 1e-9 && top <= 2.45, roof + ' ' + top);
    } else assert.equal(top, L.HOUSE_H[shape][roof], shape + ' ' + roof);
    assert.ok(top <= 2.9, shape + ' ' + roof);
    for (const details of [[], H.DETAILS]) {
      const s = H.homeState('house_cottage', { shape, roof, details });
      assert.ok(H.topOf(s) <= 2.93, shape + ' ' + roof + ' top anchor ' + H.topOf(s));
    }
  }
  assert.equal(H.roofTop('roof_red'), H.roofTop('roof_red', 'shape_cottage'), 'no shape = the v1 cottage');
  assert.ok(near(H.GABLE.apex + 0.07, 2.3, 0.005), 'the cottage ridge (apex + its roll) is at 2.3');
  const flagged = H.homeState('house_cottage', { shape: 'shape_cottage', details: ['detail_flag'] });
  assert.ok(H.topOf(flagged) >= L.LOOK.detail_flag.h, 'the top anchor clears the flag');
  /* the dome is 2.25 under every crown, its antenna the top */
  for (const roof of H.ROOFS) assert.equal(H.roofTop(roof, 'shape_dome'), H.SHAPE.shape_dome.top);
  /* the villa is the only home broader than it is tall */
  const v = H.SHAPE.shape_villa.main;
  assert.ok(v.x1 - v.x0 > H.roofTop('roof_red', 'shape_villa'));
});

test('home: the two trims of every modern shape differ in window rhythm and accent-panel side', () => {
  const S = H.SHAPE;
  assert.notEqual(S.shape_loft.ribbon[0].cols, S.shape_loft.ribbon[1].cols);
  assert.notEqual(Math.sign(S.shape_loft.accent[0].x0), Math.sign(S.shape_loft.accent[1].x0), 'loft accent side');
  assert.notEqual(S.shape_loft.glass[0].cols, S.shape_loft.glass[1].cols);
  assert.notEqual(S.shape_tower.windows[0].length, S.shape_tower.windows[1].length, 'tower: one wide grid vs twin tall windows');
  assert.notEqual(S.shape_tower.accent[0].face, S.shape_tower.accent[1].face, 'tower accent: annex vs tower');
  assert.notEqual(S.shape_villa.sliders[0].cols, S.shape_villa.sliders[1].cols);
  assert.ok(S.shape_villa.porthole[0].x > S.shape_villa.door.x && S.shape_villa.porthole[1].x < S.shape_villa.door.x, 'villa porthole swaps sides');
  assert.ok((S.shape_villa.accent[0].x0 < S.shape_villa.door.x) !== (S.shape_villa.accent[1].x0 < S.shape_villa.door.x), 'and the slats with it');
  assert.notEqual(S.shape_dome.capsule[0], S.shape_dome.capsule[1], 'dome: portholes vs capsule windows');
  assert.ok(Math.cos(S.shape_dome.accent[0] * Math.PI / 180) * Math.cos(S.shape_dome.accent[1] * Math.PI / 180) < 0, 'dome accent fin side');
  /* the trims reach the window boxes where the glazing moves */
  assert.notDeepEqual(H.windowBoxesAt('shape_loft', 0)[1].cx, H.windowBoxesAt('shape_loft', 1)[1].cx);
  assert.notDeepEqual(H.windowBoxesAt('shape_villa', 0)[2].cx, H.windowBoxesAt('shape_villa', 1)[2].cx);
});

test('home: sprinkles are deterministic and lie on the candy roof surfaces', () => {
  const a = H.sprinkles(24), b = H.sprinkles(24);
  assert.deepEqual(a, b);
  assert.equal(new Set(a.map((s) => s.tok)).size, 5, 'all 5 sprinkle colours');
  for (const s of a) {
    const onFront = near(s.p[2], H.GABLE.zf + 0.008, 1e-9);
    if (onFront) {
      assert.ok(s.p[1] > H.GABLE.eave && s.p[1] < H.GABLE.apex);
      assert.ok(Math.abs(s.dir[2]) < 1e-9, 'lies flat on the gable');
    } else {
      const side = Math.sign(s.p[0]), sl = H.slope(side);
      /* distance from the slope plane through the eave line */
      const dist = (s.p[0] - side * H.GABLE.w) * sl.n[0] + (s.p[1] - H.GABLE.eave) * sl.n[1];
      assert.ok(Math.abs(dist - 0.008) < 1e-6, 'on the slope');
      const dot = s.dir[0] * sl.n[0] + s.dir[1] * sl.n[1];
      assert.ok(Math.abs(dot) < 1e-9, 'lies along the slope');
    }
  }
});

test('home: the villa hip ridges run along the long side; the dome arcs hug its surface', () => {
  const [main, side] = H.SHAPE.shape_villa.hips;
  const r = H.hipRidge(main);
  assert.equal(r.along, 'x');
  assert.ok(near(r.r1[0], main.x0 + (main.z1 - main.z0) / 2) && near(r.r1[1], main.apex), 'equal pitches');
  assert.ok(near(H.hipRidge(side).run, (side.x1 - side.x0) / 2));
  const D = H.SHAPE.shape_dome;
  assert.equal(H.domeR(D.drum), D.R);
  assert.equal(H.domeR(D.drum + D.rise), 0);
  for (const roof of H.ROOFS) H.swag(roof, 10, 11, 'shape_dome').bulbs.forEach((p) => {
    const rr = Math.hypot(p[0], p[2] - D.zc);
    assert.ok(rr > H.domeR(p[1]) - 0.03, 'bulbs hang outside the dome');
  });
});

/* ---------------- timelines ---------------- */
test('home: the door act swings 70° and back within 3 s; homeClose closes from anywhere', () => {
  const o = {};
  let max = 0, t = 0;
  for (let i = 0; i <= 400; i++) { t = i / 120; H.doorAt('home', t, 0, false, o); max = Math.max(max, o.deg); if (o.done) break; }
  assert.ok(max >= 70, 'opens to 70°');
  assert.ok(near(o.deg, 0, 1e-9) && o.done, 'ends shut');
  assert.ok(t <= 3.0 + 1e-6, 'within 3 s (' + t + ')');
  assert.ok(near(H.doorAt('home', 1, 0, false, {}).deg, 70), 'holds open');
  assert.equal(H.doorDur('home'), 3);
  assert.ok(H.doorDur('homeSwing') < H.doorDur('home'));
  for (const from of [10, 45, 70]) {
    assert.ok(near(H.doorAt('homeClose', 0, from, false, {}).deg, from), 'starts where it was');
    const end = H.doorAt('homeClose', 0.3, from, false, {});
    assert.ok(near(end.deg, 0, 1e-9) && end.done);
  }
  /* a restart from part-way open never jumps */
  assert.ok(near(H.doorAt('home', 0, 35, false, {}).deg, 35));
});

test('home: every door swings 70° except the dome door, which slides 0.36 u (no turn, no overshoot)', () => {
  for (const shape of SHAPES) {
    const o = {};
    let maxRot = 0, maxSlide = 0, t = 0;
    for (let i = 0; i <= 400; i++) {
      t = i / 120; H.doorPose(shape, 'home', t, 0, false, o);
      maxRot = Math.max(maxRot, o.rot); maxSlide = Math.max(maxSlide, o.slide);
      if (o.done) break;
    }
    assert.ok(t <= 3 + 1e-6 && near(o.rot, 0, 1e-9) && near(o.slide, 0, 1e-9), shape + ' back shut within 3 s');
    if (shape === 'shape_dome') {
      assert.equal(maxRot, 0, 'the dome door never turns');
      assert.ok(near(maxSlide, H.SLIDE) && near(H.SLIDE, 0.36), 'it slides 0.36 u ' + maxSlide);
      assert.ok(near(H.doorPose(shape, 'home', 0.3, 0, false, {}).slide, 0.36), 'open after 0.3 s');
      assert.ok(near(H.doorPose(shape, 'home', 1.2, 0, false, {}).slide, 0.36), 'holds');
      assert.ok(H.doorPose(shape, 'home', 0.1, 0, false, {}).slide < 0.36, 'slides, never pops');
      assert.ok(near(H.doorPose(shape, 'home', 0, 0, true, {}).slide, 0.36), 'reduced: open at once');
      assert.ok(near(H.doorPose(shape, 'homeClose', 0, 70, true, {}).slide, 0), 'reduced: shut at once');
      assert.ok(near(H.doorPose(shape, 'homeClose', 0, 35, false, {}).slide, 0.18), 'a restart from half-open starts there');
    } else {
      assert.ok(maxRot >= 70 && maxSlide === 0, shape + ' swings ' + maxRot);
      assert.ok(near(H.doorPose(shape, 'home', 1, 0, false, {}).rot, 70));
    }
  }
});

test('home: reduced motion snaps the door and keeps every idle and light still', () => {
  assert.ok(near(H.doorAt('home', 0, 0, true, {}).deg, 70), 'opens instantly');
  const shut = H.doorAt('home', H.HOLD.home, 0, true, {});
  assert.ok(near(shut.deg, 0) && shut.done, 'closes instantly after the hold');
  assert.ok(near(H.doorAt('homeClose', 0, 70, true, {}).deg, 0));
  assert.equal(H.doorDur('homeClose', true), 0);
  const s0 = H.smokeAt(0, 1, 3, 0.2, true, {}), s1 = H.smokeAt(7.3, 1, 3, 0.2, true, {});
  assert.deepEqual(s0, s1, 'smoke holds still');
  assert.equal(H.clothAt(3.1, 1, 0.4, true), 0, 'flag hangs still');
  assert.equal(H.bulbLevel(1, 3, 0, 2, 0, true), H.bulbLevel(5, 3, 0, 2, 0, true), 'day lights steady');
  assert.equal(H.bulbLevel(1, 3, 1, 2, 0, true), H.bulbLevel(5, 3, 1, 2, 0, true), 'chase becomes a steady glow');
  assert.equal(H.glintAt(0.001, 1 / 60, 0, true), -1, 'no glints');
  for (const k of [0, 0.5, 1]) {
    for (const i of [0, 5]) {
      assert.equal(H.neonLevel(0.2, i, k, 0.3, true), H.neonLevel(4.7, i, k, 0.3, true), 'neon steady');
      assert.equal(H.dotLevel(0.2, i, k, 0.3, true), H.dotLevel(4.7, i, k, 0.3, true), 'stair dots steady');
    }
    assert.equal(H.signLevel(0.2, k, 0.3, true), H.signLevel(4.7, k, 0.3, true), 'sign steady');
  }
  assert.equal(H.tipLevel(0.2, 0.4, true), H.tipLevel(3.3, 0.4, true), 'antenna tip steady');
  assert.deepEqual(H.ringHue(0.2, 1, 0.1, true, {}), H.ringHue(9.7, 1, 0.1, true, {}), 'the LED band hue stands still');
  assert.deepEqual(H.rippleAt(0.2, 0.1, true, {}), H.rippleAt(5.1, 0.1, true, {}), 'the pool ripple stands still');
});

test('home: fairy lights twinkle and chase no faster than 2 Hz per bulb', () => {
  for (const k of [0, 0.5, 1]) {
    for (const hz of [100 / 60, 118 / 60, 5]) {
      for (let i = 0; i < 11; i++) {
        const f = (t) => H.bulbLevel(t, i, k, hz, 0.3, false);
        assert.ok(peaksPerSec(f) <= H.MAX_HZ + 0.05, `bulb ${i} k ${k} hz ${hz}: ${peaksPerSec(f)}`);
        for (let t = 0; t < 4; t += 0.07) { const v = f(t); assert.ok(v >= 0.3 && v <= 1 + 1e-9, 'level ' + v); }
      }
    }
  }
  /* the Showtime chase: each bulb lights once per 3 beats */
  const per = peaksPerSec((t) => H.bulbLevel(t, 4, 1, 118 / 60, 0, false));
  assert.ok(Math.abs(per - 118 / 60 / 3) < 0.1, 'chase rate ' + per);
});

test('home: the neon roofline is steady at golden hour and chases at 1 Hz at Showtime (≤ LED_CHASE_HZ per segment)', () => {
  for (let i = 0; i < 8; i++) {
    for (let t = 0; t < 6; t += 0.13) assert.equal(H.neonLevel(t, i, 0, 0.2, false), 1, 'steady by day');
    const f = (t) => H.neonLevel(t, i, 1, 0.2, false);
    const per = peaksPerSec(f);
    assert.ok(per <= L.LED_CHASE_HZ && per <= H.MAX_HZ, 'segment ' + i + ' ' + per);
    assert.ok(Math.abs(per - L.LOOK.detail_neon.show.chase.hz / L.LOOK.detail_neon.show.chase.groups) < 0.06, 'lit once per 4 steps ' + per);
    for (let t = 0; t < 6; t += 0.05) { const v = f(t); assert.ok(v >= 0.45 - 1e-9 && v <= 1 + 1e-9, 'never dark ' + v); }
  }
  /* the chase travels: at one moment neighbouring segments differ */
  assert.notEqual(H.neonLevel(1.3, 0, 1, 0, false), H.neonLevel(1.3, 1, 1, 0, false));
});

test('home: the tower sign breathes 70–100% at 0.5 Hz at Showtime only; the dome tip and stair dots stay slow', () => {
  for (let t = 0; t < 8; t += 0.1) assert.ok(near(H.signLevel(t, 0, 0.3, false), H.SIGN.day), 'steady by day');
  const sign = (t) => H.signLevel(t, 1, 0.3, false);
  assert.ok(Math.abs(peaksPerSec(sign) - 0.5) < 0.06, 'breathes at 0.5 Hz ' + peaksPerSec(sign));
  let lo = 2, hi = -1;
  for (let t = 0; t < 4; t += 0.01) { lo = Math.min(lo, sign(t)); hi = Math.max(hi, sign(t)); }
  assert.ok(near(lo, 0.7, 0.01) && near(hi, 1, 0.01), 'between 70% and 100% ' + lo + ' ' + hi);
  const tip = (t) => H.tipLevel(t, 0.1, false);
  assert.ok(peaksPerSec(tip) <= 0.55, 'tip ' + peaksPerSec(tip));
  for (let t = 0; t < 4; t += 0.05) assert.ok(tip(t) >= 0.6 - 1e-9 && tip(t) <= 1 + 1e-9);
  for (let i = 0; i < 6; i++) {
    for (let t = 0; t < 4; t += 0.1) assert.equal(H.dotLevel(t, i, 0, 0, false), 0, 'stair dots off by day');
    const per = peaksPerSec((t) => H.dotLevel(t, i, 1, 0, false));
    assert.ok(per <= L.LED_CHASE_HZ && Math.abs(per - 0.5) < 0.06, 'dot ' + i + ' ' + per);
  }
});

test('home: the dome LED band is a hue travelling at 0.25 Hz; the villa ripple loops every 2.4 s', () => {
  /* a point on the band cycles through NEON3 once every 4 s, smoothly */
  const out = {};
  const cyc = (t) => { H.ringHue(t, 0.7, 0, false, out); return out.i + out.f; };
  let wraps = 0, prev = cyc(0);
  for (let t = 0.01; t < 20; t += 0.01) { const c = cyc(t); if (c > prev + 1.5) wraps++; prev = c; }
  assert.ok(wraps >= 4 && wraps <= 6, 'one cycle every 4 s: ' + wraps + ' in 20 s');
  const a = H.ringHue(1, 0.3, 0, false, {}), b = H.ringHue(1, 0.3 + 2 * Math.PI / 3, 0, false, {});
  assert.notEqual(a.i, b.i, 'all three hues show round the ring at once');
  for (const t of [0, 0.7, 1.9]) { H.ringHue(t, 2, 0, false, out); assert.ok(out.f >= 0 && out.f <= 1 && out.j === (out.i + 1) % 3); }
  /* the ripple grows 0.6 → 1.0 and fades, period 2.4 s */
  const r0 = H.rippleAt(0.3, 0, false, {}), r1 = H.rippleAt(0.3 + 2.4, 0, false, {});
  assert.ok(near(r0.s, r1.s, 1e-9) && near(r0.a, r1.a, 1e-9));
  let smin = 9, smax = 0;
  for (let t = 0; t < 2.4; t += 0.01) { const r = H.rippleAt(t, 0, false, {}); smin = Math.min(smin, r.s); smax = Math.max(smax, r.s); assert.ok(r.a >= -1e-9 && r.a <= 1); }
  assert.ok(near(smin, 0.6, 0.01) && near(smax, 1, 0.01));
  assert.ok(peaksPerSec((t) => H.rippleAt(t, 0, false, {}).a) <= 0.45);
});

test('home: windows glow 0.6 at golden hour (DUSK) and fully at Showtime', () => {
  assert.equal(H.windowLevel(0), L.DUSK.windowGlow);
  assert.equal(H.windowLevel(1), L.SHOW.windowGlow);
  assert.ok(near(H.windowLevel(0.5), (L.DUSK.windowGlow + L.SHOW.windowGlow) / 2));
  assert.equal(H.windowLevel(-3), L.DUSK.windowGlow);
  assert.equal(L.LOOK.house_cottage.colors.window, 'Smoked Glass');
  assert.equal(L.LOOK.house_cottage.colors.windowGlow, 'Window Warm');
});

test('home: the gold door glints twice every 4 s, at every shape\'s own door', () => {
  const dt = 1 / 60, hits = [];
  for (let t = dt; t < 40; t += dt) { const g = H.glintAt(t, dt, 0.37, false); if (g >= 0) hits.push(g); }
  assert.equal(hits.length, 20, '2 per 4 s over 40 s');
  assert.deepEqual(hits.slice(0, 4).sort(), [0, 0, 1, 1]);
  assert.deepEqual(H.glintsOf('shape_cottage'), H.GLINT.pos);
  for (const shape of MODERN) {
    const d = H.doorOf(shape);
    for (const p of H.glintsOf(shape)) {
      assert.ok(Math.abs(p[0] - d.x) <= d.w / 2 && p[1] >= d.y0 && p[1] <= d.y0 + d.h && p[2] > d.z, shape + ' glint on the door');
      inFootprint(p, shape + ' glint');
    }
  }
});

test('home: chimney puffs rise 0.6 u and grow ×1.8 on a 2.4 s loop, appearing from nothing', () => {
  const o = {};
  let maxY = 0, maxS = 0;
  for (let t = 0; t < 2.4; t += 0.01) {
    H.smokeAt(t, 0, 3, 0, false, o);
    maxY = Math.max(maxY, o.y); maxS = Math.max(maxS, o.s);
    assert.ok(o.s >= 0 && o.s <= 1.8 + 1e-9);
  }
  assert.ok(maxY > 0.58 && maxY <= 0.6 + 1e-9, 'rise ' + maxY);
  assert.ok(maxS > 1.4, 'grows ' + maxS);
  assert.ok(H.smokeAt(0, 0, 3, 0, false, {}).s < 0.05, 'a new puff starts tiny');
  const a = H.smokeAt(1.234, 2, 3, 0.1, false, {}), b = H.smokeAt(1.234 + 2.4, 2, 3, 0.1, false, {});
  assert.ok(near(a.y, b.y, 1e-9) && near(a.s, b.s, 1e-9), 'loops every 2.4 s');
  /* the puffs leave every chimney below 2.9 + their rise, on every shape */
  for (const shape of SHAPES) for (const roof of H.ROOFS) assert.ok(H.chimneyAt(roof, shape).emitter[1] <= 2.9, shape + ' ' + roof);
});

test('home: the pennant flutters from a still pole edge, at most 0.04 u', () => {
  for (let t = 0; t < 3; t += 0.05) {
    assert.ok(Math.abs(H.clothAt(t, 0, 0.2, false)) < 1e-12, 'pole edge');
    assert.ok(Math.abs(H.clothAt(t, 1, 0.2, false)) <= H.FLAG.amp + 1e-12);
  }
  assert.ok(peaksPerSec((t) => H.clothAt(t, 1, 0, false)) <= 2.05);
});

test('home: every light rate in the file stays at or under 2 Hz', () => {
  for (const [name, hz] of [['NEON', H.NEON.hz], ['SIGN', H.SIGN.hz], ['TIP', H.TIP.hz], ['RING', H.RING.hz], ['DOTS', H.DOTS.hz], ['FLAG', H.FLAG.hz], ['LIGHTS', H.LIGHTS.dayHz]]) {
    assert.ok(hz > 0 && hz <= H.MAX_HZ, name + ' ' + hz);
  }
  assert.ok(H.NEON.hz / H.NEON.groups <= L.LED_CHASE_HZ && H.DOTS.hz / H.DOTS.groups <= L.LED_CHASE_HZ, 'chases ≤ 1.5 Hz per light');
  assert.ok(1 / H.RIPPLE.period <= 0.5);
  /* and the look table agrees with the file's fallbacks */
  assert.equal(L.LOOK.shape_tower.idle.hz, H.SIGN.hz);
  assert.equal(L.LOOK.shape_tower.idle.min, H.SIGN.min);
  assert.equal(L.LOOK.shape_dome.idle.hz, H.RING.hz);
  assert.equal(L.LOOK.shape_villa.idle.period, H.RIPPLE.period);
  assert.equal(L.LOOK.detail_neon.show.chase.hz, H.NEON.hz);
});
