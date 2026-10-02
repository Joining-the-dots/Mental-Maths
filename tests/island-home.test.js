'use strict';
/* My Island 3D — home models (world/island3d/models-home.js), the pure layer:
   style resolution, layouts inside the footprint, budgets and the idle/act
   timelines. The THREE builders run only in the browser (checked in the lab). */
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
const combos = [];
for (const wall of H.WALLS) for (const roof of H.ROOFS) for (const door of H.DOORS) {
  for (let m = 0; m < 16; m++) combos.push({ wall, roof, door, details: H.DETAILS.filter((d, i) => m & (1 << i)) });
}

/* ---------------- registration ---------------- */
test('home: registers house_cottage and every CATALOG home style through SL3D.defineModels', () => {
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
  /* without THREE the factory registers nothing rather than throwing */
  assert.equal(Object.keys(calls[0].f({}, {})).length, 0);
});

test('home: the module stays a classic script (no import/export, never window.THREE)', () => {
  assert.ok(!/^\s*(import|export)\s/m.test(SRC));
  assert.ok(!/window\.THREE|root\.THREE|globalThis\.THREE/.test(SRC));
  assert.ok(!/(^|[^.\w])THREE\./.test(SRC.slice(0, SRC.indexOf('function factory('))), 'no THREE use in the pure layer');
});

/* ---------------- style state ---------------- */
test('home: homeState matches SLIslandLook.resolveStyle for the house and every style id', () => {
  const samples = [{}, { wall: 'wall_lilac', roof: 'roof_castle', door: 'door_gold', details: { detail_flag: true, detail_lights: true } },
    { roof: 'roof_thatch', details: ['detail_chimney', 'detail_windowbox', 'nope'] }].concat(combos.filter((c, i) => i % 37 === 0));
  for (const id of ['house_cottage'].concat(styleIds)) {
    for (const st of samples) {
      const want = L.resolveStyle(id, st);
      assert.deepEqual(H.homeState(id, st), { wall: want.wall, roof: want.roof, door: want.door, details: want.details }, id + ' ' + JSON.stringify(st));
    }
  }
  /* ids from a newer save fall back to the defaults, so a build never throws */
  assert.deepEqual(H.homeState('house_cottage', { wall: 'wall_x', roof: 'roof_y', door: 'door_z' }),
    { wall: 'wall_cream', roof: 'roof_red', door: 'door_blue', details: [] });
});

test('home: the fallback resolver (no SLIslandLook) agrees with the look table', () => {
  const { ctx } = browserLoad({});
  const F = ctx.SLHome3D;
  for (const id of ['house_cottage'].concat(styleIds)) {
    for (const st of [{}, combos[77], combos[1203], { wall: 'wall_pink', details: { detail_flag: 1, detail_lights: 0 } }]) {
      const want = L.resolveStyle(id, st);
      assert.deepEqual(JSON.parse(JSON.stringify(F.homeState(id, st))), { wall: want.wall, roof: want.roof, door: want.door, details: want.details }, id);
    }
  }
});

test('home: the castle hides the rooftop flag; a flag preview on a castle shows none', () => {
  assert.deepEqual(H.homeState('house_cottage', { roof: 'roof_castle', details: ['detail_flag', 'detail_lights'] }).details, ['detail_lights']);
  assert.deepEqual(H.homeState('detail_flag', { roof: 'roof_castle' }).details, []);
  assert.deepEqual(H.homeState('roof_castle', { details: { detail_flag: true } }).details, []);
  assert.equal(H.flagAt('roof_castle'), null);
});

test('home: parseKey round-trips SLIslandLook.stateKey for every style combination', () => {
  for (const st of combos) {
    const key = L.stateKey('house_cottage', st);
    const s = H.parseKey(key);
    assert.deepEqual(s, H.homeState('house_cottage', st), key);
    assert.equal(H.stateKeyOf(s), key);
  }
  assert.equal(H.parseKey('base'), null);
  assert.equal(H.parseKey(null), null);
});

test('home: animated() asks for idle ticks only when something moves', () => {
  assert.equal(H.animated('wall_cream|roof_red|door_blue|d:'), false);
  assert.equal(H.animated('wall_cream|roof_red|door_blue|d:detail_windowbox'), false);
  assert.equal(H.animated('wall_cream|roof_red|door_gold|d:'), true);
  for (const d of ['detail_chimney', 'detail_flag', 'detail_lights']) assert.equal(H.animated({ details: [d] }), true, d);
  assert.equal(H.animated({ roof: 'roof_castle', details: ['detail_flag'] }), false, 'the castle drops the flag');
});

/* ---------------- colours ---------------- */
test('home: every colour token the builders use resolves through the look table', () => {
  const used = [
    ['house_cottage', 'wall', 'WALL.$wall'], ['house_cottage', 'step', 'Step'], ['house_cottage', 'mat', 'Plank'],
    ['house_cottage', 'window', 'Window'], ['house_cottage', 'windowGlow', 'Window Glow'], ['house_cottage', 'muntin', 'Ink'],
    ['roof_thatch', 'straw', 'Straw'], ['roof_candy', 'icing', 'Cloud White'], ['roof_candy', 'cherry', 'Tulip Red'],
    ['roof_castle', 'tower', 'Castle Tower'], ['roof_castle', 'cone', 'Castle Cone'], ['roof_castle', 'slit', 'Lamp Post'],
    ['roof_castle', 'pennantL', 'Coral'], ['roof_castle', 'pennantR', 'Star Gold'],
    ['detail_windowbox', 'box', 'Bark'], ['detail_chimney', 'chimney', 'Chimney'], ['detail_chimney', 'cap', 'Chimney Cap'],
    ['detail_chimney', 'smoke', 'Smoke'], ['detail_lights', 'wire', 'Ink'], ['detail_flag', 'pole', 'Ink'], ['detail_flag', 'pennant', 'Star Gold']
  ];
  for (const [id, part, fb] of used) {
    const t = H.tokenFor(id, part, fb, { wall: 'wall_sky' });
    assert.ok(L.isToken(t), id + '.' + part + ' → ' + t);
    assert.equal(t, L.LOOK[id].colors[part].replace('$wall', 'wall_sky'), id + '.' + part + ' comes from LOOK');
  }
  for (const id of H.ROOFS.concat(H.DOORS)) for (const part of Object.keys(L.LOOK[id].colors)) assert.ok(L.isToken(H.tokenFor(id, part, 'x')), id + '.' + part);
  for (let i = 1; i <= 5; i++) assert.ok(L.isToken(H.tokenFor('detail_lights', 'b' + i, 'x')));
  /* the LOCKED colours reach the builders verbatim */
  assert.equal(L.hex(H.tokenFor('house_cottage', 'wall', 'WALL.$wall', { wall: 'wall_mint' })), '#B8ECD6');
  assert.equal(L.hex(H.tokenFor('door_gold', 'door', '')), '#F0C02F');
  assert.equal(L.hex(H.tokenFor('roof_red', 'shade', '')), '#C4433C');
  /* no raw hex colours in the builders */
  assert.ok(!/['"]#[0-9a-fA-F]{3,6}['"]/.test(SRC), 'colours are tokens, never raw hex');
});

/* ---------------- budgets ---------------- */
test('home: budgets mirror the look table and the whole house fits 3,500 tris', () => {
  assert.equal(H.budgetOf('house_cottage', 0), L.BUDGET.house);
  assert.equal(L.LOOK.house_cottage.bodyTris, H.BUDGET.body);
  for (const r of H.ROOFS) assert.equal(H.budgetOf(r, 0), H.BUDGET.roof[r], r);
  for (const d of H.DETAILS) assert.equal(H.budgetOf(d, 0), H.BUDGET.detail[d], d);
  for (const d of H.DOORS) assert.equal(H.budgetOf(d, 0), H.BUDGET.door, d);
  /* worst case by sub-part budgets: the castle cannot carry the flag */
  const det = (exclude) => H.DETAILS.filter((d) => d !== exclude).reduce((n, d) => n + H.BUDGET.detail[d], 0);
  for (const r of H.ROOFS) {
    const total = H.BUDGET.body + H.BUDGET.door + H.BUDGET.roof[r] + det(r === 'roof_castle' ? 'detail_flag' : null);
    assert.ok(total <= L.BUDGET.house, r + ' worst case ' + total);
  }
  assert.ok(H.PARTS.length <= 6, 'at most 6 template parts');
});

/* ---------------- layouts ---------------- */
function inFootprint(p, label) {
  assert.ok(Math.abs(p[0]) <= MARGIN && Math.abs(p[2]) <= MARGIN && p[1] >= 0, label + ' ' + p.map((v) => v.toFixed(3)).join(','));
}
test('home: every detail layout stays inside the footprint margin', () => {
  for (const roof of H.ROOFS) {
    const sw = H.swag(roof);
    assert.equal(sw.bulbs.length, 11, '11 fairy-light bulbs');
    sw.wire.concat(sw.bulbs).forEach((p) => inFootprint(p, roof + ' lights'));
    for (const b of sw.bulbs) assert.ok(b[1] > H.WIN.y + H.WIN.h / 2, 'bulbs hang above the windows');
    const c = H.chimneyAt(roof);
    inFootprint([c.x + c.w / 2 + 0.04, c.top, c.z + c.w / 2 + 0.04], roof + ' chimney');
    assert.ok(c.x > 0, 'the chimney sits on the right');
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

test('home: heights follow the look table (house 2.3, castle turrets 2.9)', () => {
  for (const roof of H.ROOFS) {
    const top = H.roofTop(roof);
    if (roof === 'roof_castle') assert.ok(near(top, L.heightOf('house_cottage', { roof })));
    else assert.ok(top >= 2.3 - 1e-9 && top <= 2.45, roof + ' ' + top);
  }
  assert.ok(near(H.GABLE.apex + 0.07, 2.3, 0.005), 'the ridge (apex + its roll) is at 2.3');
  const flagged = H.homeState('house_cottage', { details: ['detail_flag'] });
  assert.ok(H.topOf(flagged) >= L.LOOK.detail_flag.h, 'the top anchor clears the flag');
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

test('home: reduced motion snaps the door and keeps every idle still', () => {
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

test('home: the gold door glints twice every 4 s', () => {
  const dt = 1 / 60, hits = [];
  for (let t = dt; t < 40; t += dt) { const g = H.glintAt(t, dt, 0.37, false); if (g >= 0) hits.push(g); }
  assert.equal(hits.length, 20, '2 per 4 s over 40 s');
  assert.deepEqual(hits.slice(0, 4).sort(), [0, 0, 1, 1]);
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
});

test('home: the pennant flutters from a still pole edge, at most 0.04 u', () => {
  for (let t = 0; t < 3; t += 0.05) {
    assert.ok(Math.abs(H.clothAt(t, 0, 0.2, false)) < 1e-12, 'pole edge');
    assert.ok(Math.abs(H.clothAt(t, 1, 0.2, false)) <= H.FLAG.amp + 1e-12);
  }
  assert.ok(peaksPerSec((t) => H.clothAt(t, 1, 0, false)) <= 2.05);
});
