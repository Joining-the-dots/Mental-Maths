'use strict';
/* My Island 3D — the scene controller (world/island3d/island3d.js): its pure layer, the edit
   overlay's v2 look (world/island3d/edit3d.js) and a headless mount() for the Encore City wiring
   (per-copy styles and jitter, the stage encore, env / city / life layers, anchors, the QA grid) */
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../world/island3d/island3d.js');
const C = require('../world/world-core.js');
const L = require('../world/world-look.js');
const G = require('../world/island3d/grid3d.js');
const M = require('../world/island3d/motion.js');
const E = require('../world/island3d/edit3d.js');
const Cam = require('../world/island3d/camera.js');
const Kit = require('../world/island3d/kit.js');
const Copy = require('../world/world-copy.js');

test('scene: loads in Node as a pure module (no mount without a DOM)', () => {
  assert.equal(typeof S.diffPlaced, 'function');
  assert.equal(S.VERSION, 2);
  assert.equal(typeof globalThis.SLIsland3D, 'undefined', 'nothing installed in Node');
});

test('scene: diffPlaced finds adds, moves, restyles, removals and unchanged copies', () => {
  const prev = new Map([
    ['p1', { id: 'house_cottage', x: 6, y: 3, sk: 'a' }],
    ['p2', { id: 'tree_oak', x: 4, y: 6, sk: 'base' }],
    ['p3', { id: 'lantern', x: 5, y: 6, sk: 'base' }],
    ['p4', { id: 'path_stone', x: 7, y: 7, sk: 'base' }]
  ]);
  const next = [
    { uid: 'p1', id: 'house_cottage', x: 6, y: 3, sk: 'b' },        /* restyled */
    { uid: 'p2', id: 'tree_oak', x: 5, y: 6, sk: 'base' },           /* moved */
    { uid: 'p4', id: 'path_stone', x: 7, y: 7, sk: 'base' },         /* same */
    { uid: 'p9', id: 'windmill', x: 10, y: 4, sk: 'base' },          /* added */
    { uid: 'p9', id: 'windmill', x: 11, y: 4, sk: 'base' }           /* duplicate uid: ignored */
  ];
  const d = S.diffPlaced(prev, next);
  assert.deepEqual(d.add.map((n) => n.uid), ['p9']);
  assert.equal(d.add[0].x, 10, 'the first copy of a uid wins');
  assert.deepEqual(d.move.map((n) => n.uid), ['p2']);
  assert.deepEqual(d.restyle.map((n) => n.uid), ['p1']);
  assert.deepEqual(d.remove, ['p3']);
  assert.deepEqual(d.same, ['p4']);
  const viaObj = S.diffPlaced({ p3: { id: 'lantern', x: 5, y: 6, sk: 'base' } }, []);
  assert.deepEqual(viaObj.remove, ['p3'], 'a plain object works too');
  assert.deepEqual(S.diffPlaced(new Map(), []), { add: [], move: [], restyle: [], remove: [], same: [] });
  const idSwap = S.diffPlaced(new Map([['p5', { id: 'tree_oak', x: 1, y: 1, sk: 'base' }]]), [{ uid: 'p5', id: 'tree_pine', x: 1, y: 1, sk: 'base' }]);
  assert.deepEqual(idSwap.restyle.map((n) => n.uid), ['p5'], 'a changed id rebuilds the copy');
});

test('scene: diffPlaced over a real starter island and a placement', () => {
  const u = { points: 0 };
  C.grantStarter(u, Date.UTC(2026, 0, 1));
  const w = u.world;
  const view = () => w.placed.map((p) => ({ uid: p.uid, id: p.id, x: p.x, y: p.y, sk: L.stateKey(p.id, { wall: C.selected(w, 'wall'), roof: C.selected(w, 'roof'), door: C.selected(w, 'door'), details: w.details }) }));
  const recs = new Map();
  let d = S.diffPlaced(recs, view());
  assert.equal(d.add.length, w.placed.length);
  d.add.forEach((n) => recs.set(n.uid, n));
  assert.equal(S.diffPlaced(recs, view()).same.length, w.placed.length, 'idempotent');
  w.owned.roof_castle = 1; C.select(u, 'roof_castle');
  d = S.diffPlaced(recs, view());
  assert.deepEqual(d.restyle.map((n) => n.id), ['house_cottage'], 'a house restyle swaps its batch');
});

test('scene: lit memory changes', () => {
  assert.deepEqual(S.litChanges({ a: 1 }, { a: true, b: true }, ['a', 'b', 'c']), [{ uid: 'b', on: true }]);
  assert.deepEqual(S.litChanges({ a: 1, c: 1 }, {}, ['a', 'b', 'c']), [{ uid: 'a', on: false }, { uid: 'c', on: false }]);
  assert.deepEqual(S.litChanges(null, null, ['x']), []);
});

test('scene: rayBox slab test', () => {
  const min = [-1, 0, -1], max = [1, 2, 1];
  assert.equal(S.rayBox({ x: 0, y: 10, z: 0 }, { x: 0, y: -1, z: 0 }, min, max), 8);
  assert.equal(S.rayBox({ x: 5, y: 10, z: 0 }, { x: 0, y: -1, z: 0 }, min, max), -1, 'misses beside');
  assert.equal(S.rayBox({ x: 0, y: 1, z: 0 }, { x: 1, y: 0, z: 0 }, min, max), 0, 'starting inside');
  assert.equal(S.rayBox({ x: 0, y: 10, z: 0 }, { x: 0, y: 1, z: 0 }, min, max), -1, 'pointing away');
  const d = { x: 0, y: -Math.SQRT1_2, z: -Math.SQRT1_2 };
  const t = S.rayBox({ x: 0, y: 5, z: 5 }, d, min, max);
  assert.ok(Math.abs(t - 4 * Math.SQRT2) < 1e-9, 'enters through the front face');
  /* a real camera ray hits the house hit box from above */
  const hb = G.hitBox('house_cottage', 6, 3), p = G.pivot('house_cottage', 6, 3);
  const cam = G.fitCamera({ land: ['home'], aspect: 16 / 9 });
  const o = cam.position, dir = { x: p.x - o.x, y: p.y + 1 - o.y, z: p.z - o.z }, l = Math.hypot(dir.x, dir.y, dir.z);
  assert.ok(S.rayBox(o, { x: dir.x / l, y: dir.y / l, z: dir.z / l }, hb.min, hb.max) > 0);
});

test('scene: pick priority — pets/avatar > items > land cells > locked hologram > sea', () => {
  const actor = { t: 10, target: 'pet:pet_puppy' }, item = { t: 9.8, uid: 'p1' };
  const cellLand = { c: 5, r: 5, land: true }, cellSea = { c: 0, r: 0, land: false };
  assert.deepEqual(S.choosePick('play', { actor, item, cell: cellLand }), { kind: 'actor', target: 'pet:pet_puppy' });
  assert.deepEqual(S.choosePick('play', { actor: { t: 12, target: 'me' }, item: { t: 9, uid: 'p1' } }), { kind: 'item', uid: 'p1' }, 'an item clearly in front still wins');
  assert.deepEqual(S.choosePick('edit', { actor, item }), { kind: 'item', uid: 'p1' }, 'pets cannot be picked in edit mode');
  assert.deepEqual(S.choosePick('play', { cell: cellLand, land: 'cove' }), { kind: 'cell', c: 5, r: 5 }, 'real land in front of the hologram');
  assert.deepEqual(S.choosePick('play', { cell: cellSea, land: 'cove', sea: {} }), { kind: 'land', region: 'cove' });
  assert.deepEqual(S.choosePick('play', { cell: cellSea, sea: {} }), { kind: 'cell', c: 0, r: 0 });
  assert.deepEqual(S.choosePick('play', { sea: {} }), { kind: 'sea' });
  assert.deepEqual(S.choosePick('play', {}), { kind: 'none' });
  assert.deepEqual(S.choosePick('place', { ghost: 3, item, actor, cell: cellLand }), { kind: 'ghost' });
  assert.deepEqual(S.choosePick('place', { ghost: -1, item, cell: cellLand, land: 'cove' }), { kind: 'cell', c: 5, r: 5 }, 'place mode: cells only');
  assert.deepEqual(S.choosePick('bogus', { item }), { kind: 'item', uid: 'p1' }, 'unknown modes act as play');
});

test('scene: dragging keeps the grabbed offset and stays on the grid', () => {
  assert.deepEqual(S.dragTarget({ c: 8, r: 6 }, { c: 1, r: 1 }, [2, 2]), { x: 7, y: 5 });
  assert.deepEqual(S.dragTarget({ c: 0, r: 0 }, { c: 1, r: 1 }, [2, 2]), { x: 0, y: 0 }, 'clamped at the top-left');
  assert.deepEqual(S.dragTarget({ c: 15, r: 9 }, { c: 0, r: 0 }, [3, 2]), { x: 13, y: 8 }, 'the footprint stays inside 16×10');
  assert.deepEqual(S.dragTarget({ c: 5, r: 2 }, { c: 0, r: -1 }, [1, 1]), { x: 5, y: 3 }, 'a canopy grab (cell behind the item)');
});

test('scene: keyboard labels match the 2D island', () => {
  const course = C.item('att_course'), lamp = C.item('lantern'), rose = C.item('bush_rose');
  assert.equal(S.itemLabel(course, 'play'), 'Pet Obstacle Course — tap to play');
  assert.equal(S.itemLabel(lamp, 'play'), 'Lantern post — tap to play with it');
  assert.equal(S.itemLabel(rose, 'play'), rose.name);
  assert.equal(S.itemLabel(lamp, 'edit', true), 'Lantern post (selected) — select to move it');
  assert.equal(S.itemLabel(C.item('bld_stage'), 'play'), 'Concert Stage — tap to play with it');
  /* 'Pets' are the 'Crew' in labels (SLWorldCopy 'label.crew'); ids and names never change */
  assert.equal(S.petLabel(C, { id: 'pet_puppy', name: 'Biscuit', active: true }, Copy), 'Biscuit the puppy (crew, runs your obstacle course)');
  assert.equal(S.petLabel(C, { id: 'pet_kitten', name: 'Mittens' }, Copy), 'Mittens the kitten (crew)');
  assert.equal(S.petLabel(C, { id: 'pet_kitten' }), 'Crew member the kitten (crew)', 'works without the copy table');
  for (const p of [{ id: 'pet_puppy', name: 'Biscuit', active: true }, { id: 'pet_dragon', name: 'Ember' }]) {
    const label = S.petLabel(C, p, Copy);
    assert.deepEqual(Copy.bannedIn(label), [], label);
    assert.ok(!/\bpets?\b/i.test(label), 'never "pet" in a label: ' + label);
  }
});

test('scene: dance breaks every 16 bars while Showtime is on', () => {
  let s = S.nextDance(10, -1);
  assert.deepEqual(s, { due: false, next: 26 }, 'scheduled 16 bars after Showtime starts');
  assert.deepEqual(S.nextDance(25, s.next), { due: false, next: 26 });
  s = S.nextDance(26, s.next);
  assert.deepEqual(s, { due: true, next: 42 });
  const sec = 16 * 4 * 60 / S.DANCE_BPM;
  assert.ok(Math.abs(sec - 32.54) < 0.01, '≈ 32.5 s between dance breaks at 118 BPM');
});

test('scene: acts and screen maths', () => {
  assert.equal(S.modelAct('glow', false), 'glowOn');
  assert.equal(S.modelAct('glow', true), 'glowOff');
  assert.equal(S.modelAct('bounce', true), 'bounce');
  assert.deepEqual(S.toScreen(0, 0, 800, 400), { x: 400, y: 200 });
  assert.deepEqual(S.toScreen(-1, 1, 800, 400), { x: 0, y: 0 });
  assert.deepEqual(S.toScreen(1, -1, 800, 400), { x: 800, y: 400 });
  assert.equal(S.normMode('place'), 'place'); assert.equal(S.normMode(undefined), 'play');
  assert.equal(S.batchKey('house_cottage', 'a|b'), 'house_cottage#a|b');
});

test('scene: the built-in FX presets use only palette tokens and stay kid-safe', () => {
  const ATL = Kit.ATLAS;
  for (const [kind, p] of Object.entries(S.FX_PRESETS)) {
    for (const tok of p.cols) assert.ok(Kit.resolveHex(L, tok), `${kind}: unknown token ${tok}`);
    for (const c of p.cells) assert.ok(ATL[c] != null, `${kind}: no atlas cell ${c}`);
    assert.ok(p.life[0] > 0 && p.life[1] >= p.life[0] && p.life[1] <= 3.5, `${kind}: life`);
    assert.ok(!(p.spin > 8), `${kind}: spins gently`);
  }
  for (const tok of ['Lamp Halo', 'Lamp Warm', 'Star Gold', 'Success', 'Error', 'Neon Cyan', 'Cloud White', 'Bubblegum'])
    assert.ok(Kit.resolveHex(L, tok), tok);
  for (const k of ['sparkle', 'heart', 'note', 'star', 'dust', 'bubble', 'splash', 'sparkleRing', 'firework', 'confetti', 'exhaust', 'petal', 'emote'])
    assert.ok(S.FX_PRESETS[k], `the models and SLMotion cues emit '${k}'`);
  assert.ok(S.FX_PRESETS.confetti.member === L.FX.confettiMemberShare, '40% of confetti in the member colour');
});

/* ================================================================
   Encore City (v2): per-copy styles, variety, auto-tiling, ownership
   ================================================================ */
const starter = () => { const u = { points: 0 }; C.grantStarter(u, Date.UTC(2026, 0, 1)); return u; };
let txn = 0;
function buy(u, id) { const r = C.purchase(u, id, { tx: 'txscene' + (txn++) + 'abcdefgh', trial: true }); assert.ok(r && r.ok, 'buy ' + id + ': ' + (r && r.reason)); }
function placeAt(u, id, x, y) { buy(u, id); const r = C.place(u, id, x, y); assert.ok(r.ok, id + ' at ' + x + ',' + y + ': ' + r.reason); return r.uid; }
function placeAny(u, id) { const s = C.findSpot(u.world, id); assert.ok(s, 'a spot for ' + id); return placeAt(u, id, s.x, s.y); }
const styleOf = (w, extra) => Object.assign({ wall: C.selected(w, 'wall'), roof: C.selected(w, 'roof'), door: C.selected(w, 'door'), details: w.details, shape: C.selected(w, 'shape') }, extra || {});

test('scene v2: the home trim comes from the host, else the profile seed; buildings trim by uid; the cottage key stays v1', () => {
  assert.equal(S.seedVariant(null), 0);
  assert.equal(S.seedVariant(''), 0);
  const seen = new Set();
  for (const k of ['kid-a', 'kid-b', 'kid-c', 'kid-d', 'kid-e', 'kid-f', 12345, 99]) { const v = S.seedVariant(k); assert.ok(v === 0 || v === 1); seen.add(v); assert.equal(S.seedVariant(k), v, 'stable'); }
  assert.equal(seen.size, 2, 'siblings get both trims');
  const style = { wall: 'wall_mint', roof: 'roof_blue', door: 'door_red', details: { detail_flag: 1 }, shape: 'shape_tower' };
  const hs = S.houseStyle(style, 'kid-a');
  assert.equal(hs.variant, S.seedVariant('kid-a'));
  assert.notEqual(hs, style, 'a copy: the view style is never written');
  assert.equal(style.variant, undefined);
  assert.equal(S.houseStyle(Object.assign({ variant: 1 }, style), 'kid-a').variant, 1, 'the host’s variant (hash(profileKey) % 2) wins');
  /* the house key carries shape and trim; the cottage's is byte-identical to v1 */
  const sk = (st) => L.stateKey('house_cottage', L.resolveStyle('house_cottage', st));
  assert.equal(sk(S.copyStyle(L, 'house_cottage', 'p1', style, 'kid-a')), 'wall_mint|roof_blue|door_red|d:detail_flag|s:shape_tower|v:' + S.seedVariant('kid-a'));
  const cottage = S.copyStyle(L, 'house_cottage', 'p1', Object.assign({}, style, { shape: 'shape_cottage' }), 'kid-a');
  assert.equal(sk(cottage), 'wall_mint|roof_blue|door_red|d:detail_flag', 'v1 key');
  /* buildings: their own trim by uid, never the child's style */
  for (const id of ['bld_photobooth', 'bld_boba', 'bld_ledtower', 'bld_recording', 'bld_dance', 'bld_rooftop', 'bld_stage']) {
    const trims = new Set();
    for (let i = 1; i <= 40; i++) {
      const st = S.copyStyle(L, id, 'p' + i, style, 'kid-a');
      assert.deepEqual(st, { variant: L.variantOf('p' + i, id) });
      trims.add(L.stateKey(id, L.resolveStyle(id, st)));
    }
    assert.deepEqual([...trims].sort(), ['v:0', 'v:1', 'v:2'], id + ': the 3 trims differ by uid');
    assert.deepEqual(S.copyStyle(L, id, null, style), { variant: 0 }, 'a ghost before placement shows trim 0');
  }
  assert.equal(S.copyStyle(L, 'att_course', 'p2', style), style, 'everything else shares the view style');
});

test('scene v2: diffPlaced still sees shape, trim and building-variant restyles', () => {
  const u = starter(), w = u.world;
  const booth = placeAny(u, 'bld_photobooth');
  const view = (style) => w.placed.map((p) => {
    const st = L.resolveStyle(p.id, S.copyStyle(L, p.id, p.uid, style, 'kid-a'));
    return { uid: p.uid, id: p.id, x: p.x, y: p.y, sk: L.stateKey(p.id, st) };
  });
  const recs = new Map();
  S.diffPlaced(recs, view(styleOf(w))).add.forEach((n) => recs.set(n.uid, n));
  assert.equal(S.diffPlaced(recs, view(styleOf(w))).restyle.length, 0, 'stable');
  /* the shape changes: only the house is rebuilt */
  w.owned.shape_dome = 1; C.select(u, 'shape_dome');
  let d = S.diffPlaced(recs, view(styleOf(w)));
  assert.deepEqual(d.restyle.map((n) => n.id), ['house_cottage']);
  d.restyle.forEach((n) => recs.set(n.uid, n));
  /* the other trim of the same shape */
  d = S.diffPlaced(recs, view(styleOf(w, { variant: 1 - S.seedVariant('kid-a') })));
  assert.deepEqual(d.restyle.map((n) => n.id), ['house_cottage'], 'a trim change rebuilds the house');
  /* a building with another uid wears another trim → a different key */
  const vb = L.variantOf(booth, 'bld_photobooth');
  let other = null;
  for (let i = 1; i < 60 && !other; i++) if (L.variantOf('p' + (100 + i), 'bld_photobooth') !== vb) other = 'p' + (100 + i);
  const before = recs.get(booth);
  const swapped = view(styleOf(w)).map((n) => n.uid === booth ? Object.assign({}, n, { sk: L.stateKey('bld_photobooth', { variant: L.variantOf(other, 'bld_photobooth') }) }) : n);
  assert.deepEqual(S.diffPlaced(recs, swapped).restyle.map((n) => n.uid).filter((x) => x === booth), [booth]);
  assert.equal(before.sk, 'v:' + vb);
});

test('scene v2: jitter2 reaches organic and small decor only — never houses, buildings, attractions or paths', () => {
  const ids = Object.keys(L.LOOK).filter((id) => L.LOOK[id].instancing === 'batch');
  let organic = 0;
  for (const id of ids) {
    const kind = L.LOOK[id].kind;
    for (const uid of ['p3', 'p17', 'p42']) {
      const j = S.jitterFor(L, uid, id, ['p1']);
      if (S.NO_JITTER[kind]) { assert.equal(j, null, `${id} (${kind}) never moves off its cell`); continue; }
      if (L.ORGANIC_KINDS[kind]) {
        organic++;
        assert.deepEqual(j, L.jitter2(uid, id, ['p1']), id + ': exactly SLIslandLook.jitter2 with its neighbours');
        assert.ok(j.yaw >= 0 && j.yaw < 360 && j.sx > 0 && j.sy > 0 && j.sz > 0, 'never a mirror');
      } else if (L.JITTER_RULES.smallDecor.indexOf(id) >= 0) {
        assert.ok(j === null || [-20, 20].indexOf(j.yaw) >= 0, id + ': a ±20° step (0 = no jitter at all)');
      } else assert.equal(j, null, id + ': identity → no jitter');
    }
  }
  assert.ok(organic > 30, 'trees, flowers, bushes, rocks and mushrooms are covered');
  for (const kind of ['house', 'building', 'attraction', 'path']) assert.equal(S.NO_JITTER[kind], 1);
  assert.equal(S.jitterFor(null, 'p1', 'tree_oak', []), null, 'no look table: no jitter');
});

test('scene v2: same-id neighbours (4-adjacent, any footprint) drive the jitter2 neighbour rule', () => {
  const list = [
    { uid: 'p1', id: 'tree_oak', x: 3, y: 3 }, { uid: 'p2', id: 'tree_oak', x: 4, y: 3 }, { uid: 'p3', id: 'tree_oak', x: 4, y: 4 },
    { uid: 'p4', id: 'tree_oak', x: 6, y: 5 }, { uid: 'p5', id: 'tree_pine', x: 3, y: 4 }, { uid: 'p6', id: 'house_cottage', x: 5, y: 3 }
  ];
  const fp = (id) => C.item(id).fp;
  const nb = S.idNeighbours(list, fp, (id) => L.LOOK[id].kind === 'tree');
  assert.deepEqual(nb.p1, ['p2']);
  assert.deepEqual(nb.p2, ['p1', 'p3']);
  assert.deepEqual(nb.p3, ['p2'], 'p1 is diagonal');
  assert.deepEqual(nb.p4, [], 'alone');
  assert.deepEqual(nb.p5, [], 'a pine beside an oak is not a same-id neighbour');
  assert.equal(nb.p6, undefined, 'only the asked-for ids');
  /* a 2×2 footprint touches neighbours along every edge cell */
  const big = S.idNeighbours([{ uid: 'a', id: 'house_cottage', x: 2, y: 2 }, { uid: 'b', id: 'house_cottage', x: 4, y: 3 }], fp);
  assert.deepEqual(big.a, ['b']); assert.deepEqual(big.b, ['a']);
  /* the later uid turns away from its earlier twin */
  const j1 = S.jitterFor(L, 'p1', 'tree_oak', nb.p1), j2 = S.jitterFor(L, 'p2', 'tree_oak', nb.p2);
  assert.ok(Math.abs(((j2.yaw - j1.yaw) % 360 + 360) % 360 - 120) < 1e-9, 'never a cloned neighbour');
});

test('scene v2: path auto-tiling masks (N 1 · E 2 · S 4 · W 8) across every path id', () => {
  const u = starter();
  const list = u.world.placed.concat([{ uid: 'q1', id: 'path_wood', x: 8, y: 6 }]);
  const isPath = (id) => C.item(id).kind === 'path';
  const pc = S.pathPieces(list, isPath, L.pathPiece);
  const at = (x, y) => pc[list.find((p) => p.x === x && p.y === y).uid];
  assert.equal(at(7, 4).mask, 4); assert.equal(at(7, 4).piece, 'end');
  assert.equal(at(7, 5).mask, 5); assert.equal(at(7, 5).piece, 'straight');
  assert.equal(at(7, 6).mask, 1 | 2, 'the wood plank east of it connects'); assert.equal(at(7, 6).piece, 'corner');
  assert.equal(at(8, 6).mask, 8 | 4); assert.equal(at(8, 7).mask, 1);
  for (const v of Object.values(pc)) assert.deepEqual({ piece: v.piece, yawDeg: v.yawDeg }, L.pathPiece(v.mask));
  assert.equal(Object.keys(pc).length, 5, 'paths only');
});

test('scene v2: who hosts the city and the ambient life; the ?grid=1 QA switch needs test mode', () => {
  assert.equal(S.layerOwner(null), 'host');
  assert.equal(S.layerOwner({ update() {} }), 'host', 'a v1 env: the controller hosts them');
  assert.equal(S.layerOwner({ setEdit() {} }), 'env', 'a v2 env owns them');
  assert.equal(S.layerOwner({ city: {} }), 'env');
  assert.equal(S.gridFromQuery('?grid=1', true), true);
  assert.equal(S.gridFromQuery('?a=2&grid=1#x', 1), true);
  assert.equal(S.gridFromQuery('?grid=1', false), false, 'never outside SL_WORLD_TRIAL');
  assert.equal(S.gridFromQuery('?grid=10', true), false);
  assert.equal(S.gridFromQuery('', true), false);
  assert.deepEqual(S.normUser({ name: 'Kid', color: '#123456', avatar: '🦊', seed: 'k1' }), { name: 'Kid', color: '#123456', avatar: '🦊', seed: 'k1' });
  assert.equal(S.normUser({ seed: 42 }).seed, 42);
  assert.equal(S.normUser({ seed: {} }).seed, null);
  assert.equal(S.editState('play', {}, ['home'], null, null, null, true).grid, true);
  assert.equal(S.editState('edit', {}, ['home']).grid, false);
});

test('scene v2: the edit adapter draws the QA grid in play mode; the actors adapter forwards setAnchorFn', () => {
  const calls = [];
  const raw = { show: (c, s) => calls.push(['show', s]), ghost: (id) => calls.push(['ghost', id]), hide: () => calls.push(['hide']), info: () => ({ ghost: null }), update: () => false };
  const ed = S.adaptSystem('edit', raw, { core: C });
  ed.setState(S.editState('play', { '1,1': 1 }, ['home'], null, null, null, true));
  assert.deepEqual(calls.pop(), ['show', 'grid']);
  ed.setState(S.editState('play', { '1,1': 1 }, ['home'], null, null, null, false));
  assert.deepEqual(calls[calls.length - 1], ['hide']);
  const n = calls.length;
  ed.setState(S.editState('play', { '1,1': 1 }, ['home'], null, null, null, false));
  assert.equal(calls.length, n, 'hidden once');
  /* actors.js takes the anchor function itself, or through its brain */
  const fn = () => null, viaBrain = { sync() {}, hits() { return []; }, anchorOf() { return null; }, brain: { setAnchorFn(f) { viaBrain.got = f; } } };
  S.adaptSystem('actors', viaBrain, {}).setAnchorFn(fn);
  assert.equal(viaBrain.got, fn);
  const direct = { sync() {}, hits() { return []; }, anchorOf() { return null; }, setAnchorFn(f) { direct.got = f; }, brain: { setAnchorFn() { throw new Error('not this one'); } } };
  S.adaptSystem('actors', direct, {}).setAnchorFn(fn);
  assert.equal(direct.got, fn);
  assert.doesNotThrow(() => S.adaptSystem('actors', { sync() {}, hits() {}, anchorOf() {} }, {}).setAnchorFn(fn), 'an older actors.js simply has none');
});

test('edit3d v2: a faint Cloud White 0.07 wash in the grid squares and a 0.2 s fade-in (a cut under reduced motion)', () => {
  assert.deepEqual(E.GRID_WASH, { token: 'Cloud White', opacity: 0.07 });
  assert.ok(L.isToken(E.GRID_WASH.token));
  const g = E.stateStyle('grid');
  assert.equal(g.fillA, 0, 'the square keeps no fill of its own (the shader lays the wash)');
  assert.equal(g.wash, 'Cloud White'); assert.equal(g.washA, 0.07);
  for (const s of ['valid', 'invalid', 'entrance', 'select']) assert.equal(E.stateStyle(s).washA, undefined, s + ' states are unchanged');
  assert.equal(E.FADE_SEC, 0.2);
  assert.equal(E.overlayFade(0, false), 0);
  assert.ok(Math.abs(E.overlayFade(0.1, false) - 0.5) < 1e-12);
  assert.equal(E.overlayFade(0.2, false), 1); assert.equal(E.overlayFade(5, false), 1);
  assert.equal(E.overlayFade(0, true), 1, 'reduced motion: there at once');
  const F = E.SHADERS.CELL_FRAG;
  assert.match(F, /uniform float uWash;/); assert.match(F, /uniform float uFade;/);
  assert.match(F, /vFill\.a > 0\.0 \? vFill\.a : uWash \* dashed/, 'only a dashed square with no fill of its own gets the wash');
  assert.match(F, /gl_FragColor = vec4\(col, a \* uFade\)/);
  /* the squares lie flush on the pads: + 0.012 over SLGrid3D.surfaceY (the terrain pads are exact) */
  assert.equal(E.CELL.lift, 0.012);
  /* the selection hull the overlay pulses is the kit's 0.02 ↔ 0.03 Star Gold at 1.5 Hz */
  assert.deepEqual(Kit.SEL_W, [0.02, 0.03]);
  assert.equal(E.stateStyle('select').edge, 'Star Gold'); assert.equal(E.stateStyle('select').hz, 1.5);
  for (let t = 0; t < 2; t += 0.01) { const p = E.selPulse(t, 1.5, false); assert.ok(p >= 0 && p <= 1); }
});

/* ================================================================
   A headless mount(): fake THREE / DOM / kit / lease / env and recording siblings
   ================================================================ */
class V3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; this.isVector3 = true; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(v) { return this.set(v.x, v.y, v.z); }
  clone() { return new V3(this.x, this.y, this.z); }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  normalize() { const l = Math.hypot(this.x, this.y, this.z) || 1; return this.set(this.x / l, this.y / l, this.z / l); }
  setFromMatrixPosition() { return this; }
  applyMatrix4() { return this; }
  project() { return this.set(0, 0, 0); }
  unproject() { return this; }
}
class M4 { identity() { return this; } copy() { return this; } multiplyMatrices() { return this; } compose() { return this; } }
class Obj3 {
  constructor() { this.position = new V3(); this.up = new V3(0, 1, 0); this.children = []; this.parent = null; this.name = ''; }
  add(...os) { for (const o of os) { if (!o) continue; if (o.parent) o.parent.remove(o); o.parent = this; this.children.push(o); } return this; }
  remove(o) { const i = this.children.indexOf(o); if (i >= 0) { this.children.splice(i, 1); o.parent = null; } return this; }
  clear() { for (const c of this.children.slice()) this.remove(c); return this; }
  updateMatrixWorld() {}
}
class PCam extends Obj3 {
  constructor(fov, aspect, near, far) {
    super(); this.isCamera = true; this.fov = fov; this.aspect = aspect; this.near = near; this.far = far;
    this.matrixWorld = new M4(); this.matrixWorldInverse = new M4(); this.projectionMatrix = new M4(); this.projectionMatrixInverse = new M4();
  }
  updateProjectionMatrix() {} lookAt(x, y, z) { this.look = [x, y, z]; }
}
const T = {
  Vector3: V3, Matrix4: M4, Quaternion: class { setFromEuler() { return this; } }, Euler: class { set() { return this; } },
  Frustum: class { setFromProjectionMatrix() { return this; } intersectsSphere() { return true; } },
  Sphere: class { constructor() { this.center = new V3(); this.radius = 0; } },
  Object3D: Obj3, Group: Obj3, Scene: Obj3, PerspectiveCamera: PCam
};
class FakeEl {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase(); this.children = []; this.parentNode = null; this.attrs = {}; this.listeners = {};
    this.style = {}; this.className = ''; this._text = ''; this.innerHTML = ''; this.nodeType = 1; this.disabled = false;
    const self = this;
    this.classList = {
      add(c) { const s = new Set(self.className.split(/\s+/).filter(Boolean)); s.add(c); self.className = [...s].join(' '); },
      remove(c) { self.className = self.className.split(/\s+/).filter((x) => x && x !== c).join(' '); },
      contains(c) { return self.className.split(/\s+/).includes(c); }
    };
  }
  get firstChild() { return this.children[0] || null; }
  set textContent(v) { this._text = String(v); this.children = []; }
  get textContent() { return this._text; }
  get clientWidth() { return 800; }
  get clientHeight() { return 450; }
  get isConnected() { return true; }
  appendChild(c) { if (c.parentNode) c.parentNode.removeChild(c); this.children.push(c); c.parentNode = this; return c; }
  insertBefore(c) { return this.appendChild(c); }
  removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parentNode = null; return c; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; }
  addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); }
  removeEventListener(t, f) { const a = this.listeners[t] || []; const i = a.indexOf(f); if (i >= 0) a.splice(i, 1); }
  dispatch(t, e) { const ev = Object.assign({ type: t, target: this, preventDefault() {} }, e); (this.listeners[t] || []).slice().forEach((f) => f(ev)); return ev; }
  contains(n) { for (; n; n = n.parentNode) if (n === this) return true; return false; }
  matches(sel) { const m = /^\[([\w-]+)(?:="([^"]*)")?\]$/.exec(sel); return !!m && (m[2] == null ? this.getAttribute(m[1]) != null : this.getAttribute(m[1]) === m[2]); }
  closest(sel) { for (let n = this; n; n = n.parentNode) if (n.matches && n.matches(sel)) return n; return null; }
  querySelector(sel) { for (const c of this.children) { if (c.matches(sel)) return c; const f = c.querySelector(sel); if (f) return f; } return null; }
  querySelectorAll(sel) { const out = []; const walk = (n) => { for (const c of n.children) { if (c.matches(sel)) out.push(c); walk(c); } }; walk(this); return out; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 800, height: 450 }; }
  focus() {} setPointerCapture() {} releasePointerCapture() {} hasPointerCapture() { return true; }
}
/* a batch that records every placement (jitter and yaw included) */
const STAGE_ANCHORS = { top: [0, 2.4, 0], cone0: [-1, 2.6, -0.6], cone1: [0, 2.7, -0.7], cone2: [1, 2.6, -0.6], seat: [0, 0.9, 0.4] };
class FakeBatch {
  constructor(tpl) { this.template = tpl; this.group = new Obj3(); this.copies = new Map(); this.adds = []; this.moves = []; this.disposed = false; this.fp = [1, 1]; }
  add(uid, place, o) { this.adds.push({ uid, place, jitter: o && o.jitter }); this.copies.set(uid, { x: place.x, y: place.y }); this.fp = place.fp || [1, 1]; }
  has(uid) { return this.copies.has(uid); }
  remove(uid) { this.copies.delete(uid); }
  move(uid, x, y, place) { this.moves.push({ uid, x, y, place }); const c = this.copies.get(uid); if (c) { c.x = x; c.y = y; } }
  worldPos(uid, out) { const c = this.copies.get(uid), p = c ? G.pivot(this.template.id, c.x, c.y) : { x: 0, y: 0, z: 0 }; out.x = p.x; out.y = p.y; out.z = p.z; return out; }
  anchorWorld(uid, name, out) { const a = this.template.anchors[name] || this.template.anchors.top; this.worldPos(uid, out); out.x += a[0]; out.y += a[1]; out.z += a[2]; return out; }
  hide() {} show() {} setState() {} setPivot() {} pivot() { return new M4(); } setHighlight() {} copyGeometry() { return null; } basePositions() { return null; }
  commit() {} dispose() { this.disposed = true; }
}
function fakeKit(tier) {
  const K = {
    THREE: T, tier: tier || 'MID', batches: [], atlasUsers: [],
    templates: { get: (id, sk, t, st) => ({ id, sk, st, anchors: id === 'bld_stage' ? STAGE_ANCHORS : { top: [0, 1, 0] }, pivots: {}, parts: [] }) },
    stateKey: (id, st) => L.stateKey(id, st || {}),
    batch(tpl) { const b = new FakeBatch(tpl); K.batches.push(b); return b; },
    setSelPulse() {}, billboards: () => ({ mesh: new Obj3(), dispose() {} }),
    /* the shared atlases (kit.js): only their user cells matter here */
    ledAtlas: () => ({ setUser(u) { K.atlasUsers.push(['led', u]); } }),
    signAtlas: () => ({ setUser(u) { K.atlasUsers.push(['sign', u]); } })
  };
  return K;
}
function fakeEnv(o, rec, cfg) {
  const env = {
    group: new Obj3(), show: 0, opts: o,
    update() { return false; }, setLand() {}, attach() {}, aim() {}, setReduced() {}, setMember(c) { rec.push(['member', c]); },
    setShow(k) { env.show = k; }, showtime(on) { env.show = on ? 1 : 0; rec.push(['showtime', !!on]); },
    invalidateShadows() { rec.push(['shadows']); }, riseRegion() { return null; }, lockedAt() { return null; },
    dispose() { rec.push(['dispose']); if (env.group.parent) env.group.parent.remove(env.group); }, info() { return {}; }
  };
  if (cfg.v2) { env.setEdit = (on) => rec.push(['edit', !!on]); env.setConeMounts = (pts) => rec.push(['cones', pts]); }
  if (cfg.setSeed) env.setSeed = (s) => rec.push(['seed', s]);
  if (cfg.wakeAt) env.wakeAt = cfg.wakeAt;
  return env;
}
/* the browser globals mount() reads; every test puts the originals back (idempotent, any order) */
const GLOBALS = ['performance', 'SLWorldCore', 'SLIslandLook', 'SLGrid3D', 'SLMotion', 'SLIslandCamera', 'SLIslandEnv', 'SL3D', 'document',
  'SLWorldCopy', 'SLWorldArt', 'SLCity3D', 'SLLife3D', 'SLTerrain3D', 'SL_WORLD_TRIAL', 'location'];
const ORIGINAL = {};
GLOBALS.forEach((k) => { ORIGINAL[k] = Object.getOwnPropertyDescriptor(globalThis, k); });
function restoreGlobals() {
  GLOBALS.forEach((k) => { if (ORIGINAL[k]) Object.defineProperty(globalThis, k, ORIGINAL[k]); else delete globalThis[k]; });
  S.debugGrid(false);
}
const timed = new WeakSet();
function harness(t, cfg = {}) {
  const clock = { now: 1000 };
  Object.defineProperty(globalThis, 'performance', { value: { now: () => clock.now }, configurable: true, writable: true });
  t.after(restoreGlobals);
  if (!timed.has(t)) { t.mock.timers.enable({ apis: ['setTimeout'] }); timed.add(t); }
  const K = fakeKit(cfg.tier), envCalls = [], envs = [], calls = [], states = [], actorsLog = [];
  Object.assign(globalThis, { SLWorldCore: C, SLIslandLook: L, SLGrid3D: G, SLMotion: M, SLIslandCamera: Cam, SLWorldCopy: Copy });
  globalThis.SLIslandEnv = { create: (K2, S2, o) => { const e = fakeEnv(o, envCalls, cfg); envs.push(e); return e; } };
  globalThis.document = { createElement: (tag) => new FakeEl(tag), activeElement: null, documentElement: new FakeEl('html') };
  if (cfg.globals) Object.assign(globalThis, cfg.globals);
  const leases = [];
  const SL = {
    ready: true, THREE: T, tier: cfg.tier || 'MID', budget: { particles: 256 }, quality: { particleScale: 1 }, issues: [],
    models: cfg.models || {}, kit: () => K,
    lease(name, h) {
      const canvas = new FakeEl('canvas');
      const l = { name, h, canvas, renderer: { domElement: canvas }, start() {}, stop() {}, invalidate() {}, observe() {}, compile() { return null; },
        resize(w, hh) { if (h.onResize) h.onResize(w, hh); }, setCovered() {}, setHidden() {}, setReduced() {}, input() {}, release() {}, info() { return {}; } };
      leases.push(l);
      return l;
    },
    makeFx: cfg.fx || (() => ({ emit() {}, halo() {}, decal() {}, update: () => false, setMember() {}, setReduced() {}, setQuality() {}, clear() {}, dispose() {} })),
    makeActors: () => {
      const a = { sync() {}, update: () => false, pick: () => null, anchor: () => null, emote() {}, tap: () => false, perform: () => 0, active: () => null,
        dance: () => { actorsLog.push('dance'); return 4; }, setShow() {}, setMode() {}, setReduced() {}, setUser() {}, setQuality() {}, setShowtime() {},
        setAnchorFn(fn) { a.anchorFn = fn; }, info: () => null, dispose() {} };
      actorsLog.actors = a;
      return a;
    },
    makeEdit: () => ({ setState(s) { states.push(s); }, update: () => false, ghostShown: () => false, setReduced() {}, dispose() {} })
  };
  globalThis.SL3D = SL;
  const on = {};
  ['tapItem', 'tapPet', 'tapAvatar', 'tapLand', 'tapCell', 'dragStart', 'dragCell', 'dragEnd', 'ready', 'fail'].forEach((k) => { on[k] = (...a) => calls.push([k, ...a]); });
  const user = Object.assign({ name: 'Kid', color: '#4FC3F7', avatar: '🦊', seed: 'kid-a' }, cfg.user || {});
  const stage = S.mount({ reduced: !!cfg.reduced, user, on, skyline: cfg.skyline });
  const host = new FakeEl('div');
  stage.attach(host);
  const lease = leases[leases.length - 1];
  const H = {
    stage, K, SL, envCalls, envs, calls, states, actorsLog, lease, clock,
    step(n = 1, dt = 1 / 60) { for (let i = 0; i < n; i++) { clock.now += dt * 1000; lease.h.frame(dt, clock.now / 1000); } },
    advance(ms) { clock.now += ms; t.mock.timers.tick(ms); },
    batchOf(uid) { return K.batches.filter((b) => !b.disposed && b.has(uid)).pop() || null; },
    called(k) { return calls.filter((c) => c[0] === k); },
    keyTap(uid) { const list = stage.element.querySelector('[data-k="u:' + uid + '"]'); assert.ok(list, 'the keyboard list has ' + uid); stage.element.children.find((c) => c.tagName === 'UL').dispatch('click', { target: list }); }
  };
  t.after(() => { try { stage.dispose(); } catch (e) { /* gone */ } });
  return H;
}
function viewOf(u, extra) {
  const w = u.world;
  return Object.assign({
    world: w, placed: w.placed.filter((p) => !!C.item(p.id)), style: styleOf(w), unlocked: C.unlockedRegions(w),
    pets: [], avatar: { color: '#4FC3F7', emoji: '🦊', name: 'Kid' }, mode: 'play', selectedUid: null, placing: null, lit: {}, anim: {}
  }, extra || {});
}
function readyUp(H) { H.step(4); assert.equal(H.called('ready').length, 1, 'ready'); }

test('mount v2: the house wears the seeded trim, buildings their own; jitter2 reaches the batch (organic decor only) and follows its neighbours', (t) => {
  const u = starter();
  const booth = placeAny(u, 'bld_photobooth');
  /* two oaks side by side next to the starter oak at (3, 3) */
  const oakB = placeAt(u, 'tree_oak', 2, 3);
  const bench = placeAny(u, 'bench');
  const H = harness(t);
  H.stage.sync(viewOf(u));
  const house = u.world.placed.find((p) => p.id === 'house_cottage');
  const hb = H.batchOf(house.uid);
  assert.equal(hb.template.sk, L.stateKey('house_cottage', L.resolveStyle('house_cottage', S.houseStyle(styleOf(u.world), 'kid-a'))));
  assert.match(hb.template.sk, new RegExp('\\|s:shape_loft\\|v:' + S.seedVariant('kid-a') + '$'), 'the City loft in the child’s trim');
  assert.equal(H.batchOf(booth).template.sk, 'v:' + L.variantOf(booth, 'bld_photobooth'));
  /* placement jitter: none on architecture or paths; jitter2 (with the neighbour rule) on the oaks */
  const addOf = (uid) => H.batchOf(uid).adds.filter((a) => a.uid === uid).pop();
  for (const p of u.world.placed) {
    const kind = L.LOOK[p.id].kind;
    if (S.NO_JITTER[kind]) assert.equal(addOf(p.uid).jitter, undefined, p.id + ' stays square on its cells');
  }
  const oakA = u.world.placed.find((p) => p.id === 'tree_oak' && p.x === 3 && p.y === 3).uid;
  assert.deepEqual(addOf(oakA).jitter, L.jitter2(oakA, 'tree_oak', [oakB]));
  assert.deepEqual(addOf(oakB).jitter, L.jitter2(oakB, 'tree_oak', [oakA]));
  const bj = L.jitter2(bench, 'bench');
  assert.deepEqual(addOf(bench).jitter, bj.yaw ? bj : undefined, 'small decor: a ±20° step');
  /* the earlier oak goes into storage: the later one loses the neighbour bias (re-jittered in place) */
  assert.ok(C.store(u, oakA).ok);
  H.envCalls.length = 0;
  H.stage.sync(viewOf(u));
  const mv = H.batchOf(oakB).moves.filter((m) => m.uid === oakB).pop();
  assert.ok(mv && mv.place && mv.place.jitter, 're-jittered');
  assert.deepEqual(mv.place.jitter, L.jitter2(oakB, 'tree_oak', null));
  assert.ok(H.envCalls.some((c) => c[0] === 'shadows'), 'the shadow map follows');
  /* the host's own trim wins and rebuilds the house */
  H.stage.sync(viewOf(u, { style: styleOf(u.world, { variant: 1 - S.seedVariant('kid-a') }) }));
  assert.match(H.batchOf(house.uid).template.sk, new RegExp('\\|v:' + (1 - S.seedVariant('kid-a')) + '$'));
});

test('mount v2: the stage encore — 8 s of Showtime, the crew owns the 8-count, re-taps ignored, the child’s setting returns', (t) => {
  const u = starter();
  const stageUid = placeAny(u, 'bld_stage');
  const acts = [];
  const models = { bld_stage: { act(a, name) { acts.push([name, a.pets && typeof a.pets.perform]); return { dur: 3, update(h, tt) { return tt < 3; } }; } } };
  const H = harness(t, { models });
  H.stage.sync(viewOf(u));
  readyUp(H);
  H.step(200);                                          /* the mount shot has finished */
  H.keyTap(stageUid);
  assert.deepEqual(H.called('tapItem'), [['tapItem', stageUid]]);
  H.stage.act(stageUid, 'encore');
  assert.deepEqual(acts, [['encore', 'function']], 'the model act, with the crew to perform');
  assert.deepEqual(H.envCalls.filter((c) => c[0] === 'showtime'), [['showtime', true]], 'Showtime for the encore');
  const info = H.stage.info();
  assert.equal(info.encore, true); assert.equal(info.stageEncore, stageUid);
  assert.equal(info.camera.move, 'skyline', 'the skyline shot over the stage');
  /* the host's own encore call only re-arms it */
  H.stage.showtime(true, { encoreMs: 8000 });
  assert.equal(H.envCalls.filter((c) => c[0] === 'showtime').length, 1);
  /* re-taps while it runs are ignored; a second act call too */
  H.keyTap(stageUid);
  assert.equal(H.called('tapItem').length, 1, 'no squish, no tapItem');
  H.stage.act(stageUid, 'encore');
  assert.equal(acts.length, 1);
  /* no controller dance break: the stage leads the crew */
  H.step(30); H.advance(2500); H.step(30);
  assert.equal(H.stage.info().dancing, false);
  assert.deepEqual(H.actorsLog.filter((x) => x === 'dance'), []);
  H.stage.danceNow();
  assert.equal(H.stage.info().dancing, false, 'not even on request');
  /* 8 s later: back to golden hour, the stage answers taps again */
  H.advance(6000); H.step(5);
  assert.equal(H.stage.info().encore, false);
  assert.deepEqual(H.envCalls.filter((c) => c[0] === 'showtime').pop(), ['showtime', false], 'encores return to DUSK');
  H.keyTap(stageUid);
  assert.equal(H.called('tapItem').length, 2);
});

test('mount v2: an encore over the child’s own Showtime leaves Showtime on; reduced motion has no camera move', (t) => {
  const u = starter();
  const stageUid = placeAny(u, 'bld_stage');
  const models = { bld_stage: { act() { return { dur: 3, update(h, tt) { return tt < 3; } }; } } };
  const H = harness(t, { models, reduced: true });
  H.stage.sync(viewOf(u));
  readyUp(H);
  assert.equal(H.stage.info().camera.move, null, 'reduced motion: no skyline on mount');
  H.stage.showtime(true);
  H.stage.act(stageUid, 'encore');
  assert.equal(H.stage.info().camera.move, null, 'and none at the encore');
  H.advance(9000); H.step(3);
  assert.equal(H.stage.info().showtime, true);
  assert.deepEqual(H.envCalls.filter((c) => c[0] === 'showtime'), [['showtime', true]], 'never switched back to golden hour');
});

test('mount v2: the skyline opens play mode only; edit mode takes the camera back', (t) => {
  const u = starter();
  const H = harness(t);
  H.stage.sync(viewOf(u));
  readyUp(H);
  assert.equal(H.stage.info().camera.move, 'skyline');
  /* a finger on the glass holds the shot still; lifting it hands the camera back */
  const ptr = (type) => H.lease.canvas.dispatch(type, { pointerId: 1, pointerType: 'touch', button: 0, clientX: 400, clientY: 300 });
  ptr('pointerdown');
  assert.equal(H.stage.info().camera.frozen, true);
  H.step(30);
  assert.equal(H.stage.info().camera.move, 'skyline', 'held under the finger');
  ptr('pointerup');
  assert.equal(H.stage.info().camera.frozen, false);
  H.step(40);
  assert.equal(H.stage.info().camera.move, null, 'the tap ended it');
  /* a fresh shot, then edit mode */
  H.stage.dispose();
  const H2 = harness(t);
  H2.stage.sync(viewOf(u));
  readyUp(H2);
  assert.equal(H2.stage.info().camera.move, 'skyline');
  H2.stage.sync(viewOf(u, { mode: 'edit' }));
  H2.step(40);
  assert.equal(H2.stage.info().camera.move, null, 'editing ends the hero shot');
  const e = harness(t);
  e.stage.sync(viewOf(u, { mode: 'edit' }));
  readyUp(e);
  assert.equal(e.stage.info().camera.move, null, 'mounted in edit mode: straight to the edit view');
  const off = harness(t, { skyline: false });
  off.stage.sync(viewOf(u));
  readyUp(off);
  assert.equal(off.stage.info().camera.move, null, 'opts.skyline === false');
});

test('mount v2: env gets seed, name and tier; setEdit follows the mode; cones ride the stage truss; a new child reseeds', (t) => {
  const u = starter();
  const stageUid = placeAny(u, 'bld_stage');
  const H = harness(t, { v2: true, setSeed: true });
  const o = H.envs[0].opts;
  assert.equal(o.seed, 'kid-a'); assert.equal(o.name, 'Kid'); assert.equal(o.tier, 'MID'); assert.equal(o.member, '#4FC3F7');
  H.stage.sync(viewOf(u));
  const cones = H.envCalls.filter((c) => c[0] === 'cones').pop();
  assert.equal(cones[1].length, 3, 'the 3 Showtime cones on the truss');
  const sp = u.world.placed.find((q) => q.uid === stageUid), p = G.pivot('bld_stage', sp.x, sp.y);
  assert.ok(Math.abs(cones[1][1].x - (p.x + STAGE_ANCHORS.cone1[0])) < 1e-9 && Math.abs(cones[1][1].y - (p.y + STAGE_ANCHORS.cone1[1])) < 1e-9);
  const nCones = H.envCalls.filter((c) => c[0] === 'cones').length;
  H.stage.sync(viewOf(u));
  assert.equal(H.envCalls.filter((c) => c[0] === 'cones').length, nCones, 'only on change');
  H.stage.sync(viewOf(u, { mode: 'edit' }));
  assert.deepEqual(H.envCalls.filter((c) => c[0] === 'edit').pop(), ['edit', true], 'editing eases the light to k 0');
  H.stage.sync(viewOf(u, { mode: 'play' }));
  assert.deepEqual(H.envCalls.filter((c) => c[0] === 'edit').pop(), ['edit', false]);
  assert.ok(C.store(u, stageUid).ok);
  H.stage.sync(viewOf(u));
  assert.deepEqual(H.envCalls.filter((c) => c[0] === 'cones').pop(), ['cones', null], 'back to the buoys');
  /* a profile switch: the next child's coastline */
  H.stage.setUser({ name: 'Sis', color: '#FF7043', avatar: '🐼', seed: 'kid-b' });
  assert.deepEqual(H.envCalls.filter((c) => c[0] === 'seed').pop(), ['seed', 'kid-b']);
  H.stage.setUser({ name: 'Sis', color: '#FF7043', avatar: '🐼', seed: 'kid-b' });
  assert.equal(H.envCalls.filter((c) => c[0] === 'seed').length, 1, 'the same child: nothing to rebake');
});

test('mount v2: without env.setSeed, a new seed rebuilds the terrain env in place (items stay)', (t) => {
  const u = starter();
  const H = harness(t, { v2: true, globals: { SLTerrain3D: {} } });
  H.stage.sync(viewOf(u));
  const batches = H.K.batches.length;
  H.stage.setUser({ name: 'Sis', color: '#FF7043', seed: 'kid-b' });
  assert.equal(H.envs.length, 2, 'a new env');
  assert.equal(H.envs[1].opts.seed, 'kid-b'); assert.equal(H.envs[1].opts.name, 'Sis');
  assert.ok(H.envCalls.some((c) => c[0] === 'dispose'), 'the old one is disposed');
  assert.equal(H.K.batches.length, batches, 'no item rebuilt');
  assert.equal(H.stage.info().failed, null);
});

test('mount v2: with an older env the controller hosts the city and the ambient life (and drops a broken one)', (t) => {
  const log = [];
  const layer = (kind, extra) => ({
    create(K, SL, o) {
      const g = new Obj3();
      const l = Object.assign({ group: g, opts: o, update(dt, k, s) { log.push([kind, 'update', k, s]); return false; }, setShow() {}, setMember(c) { log.push([kind, 'member', c]); },
        setUser(x) { log.push([kind, 'user', x.name]); }, setReduced(on) { log.push([kind, 'reduced', on]); }, setEdit(on) { log.push([kind, 'edit', on]); },
        info: () => ({ kind }), dispose() { log.push([kind, 'dispose']); } }, extra || {});
      log.push([kind, 'create', o]);
      return l;
    }
  });
  const u = starter();
  const H = harness(t, { globals: { SLCity3D: layer('city'), SLLife3D: layer('life') } });
  const made = log.filter((e) => e[1] === 'create');
  assert.deepEqual(made.map((e) => e[0]), ['city', 'life']);
  assert.equal(made[0][2].seed, 'sl-city-v1', 'every sibling shares one city'); assert.equal(made[0][2].name, 'Kid');
  assert.ok(made[1][2].haloLayer && made[1][2].haloLayer.mesh, 'the lanterns get an ambient halo layer');
  assert.deepEqual(H.stage.info().layers, { owner: 'host', city: true, life: true, terrain: false });
  H.stage.sync(viewOf(u));
  H.step(2);
  assert.ok(log.some((e) => e[0] === 'city' && e[1] === 'update'), 'driven every frame');
  H.stage.sync(viewOf(u, { mode: 'edit' }));
  assert.deepEqual(log.filter((e) => e[0] === 'life' && e[1] === 'edit').pop(), ['life', 'edit', true], 'life keeps going off-island');
  H.stage.setReduced(true);
  assert.ok(log.some((e) => e[0] === 'city' && e[1] === 'reduced' && e[2] === true));
  H.stage.setUser({ name: 'Sis', color: '#FF7043', seed: 'kid-a' });
  assert.ok(log.some((e) => e[0] === 'city' && e[1] === 'user' && e[2] === 'Sis'), 'the hero board learns the new name');
  H.stage.dispose();
  assert.deepEqual(log.filter((e) => e[1] === 'dispose').map((e) => e[0]).sort(), ['city', 'life']);
  /* a v2 env hosts them itself */
  log.length = 0;
  const V = harness(t, { v2: true, globals: { SLCity3D: layer('city'), SLLife3D: layer('life') } });
  assert.equal(log.filter((e) => e[1] === 'create').length, 0);
  assert.deepEqual(V.stage.info().layers, { owner: 'env', city: false, life: false, terrain: false });
  /* a city that throws is dropped; the island goes on */
  log.length = 0;
  const B = harness(t, { globals: { SLCity3D: layer('city', { update() { throw new Error('boom'); } }), SLLife3D: undefined } });
  B.stage.sync(viewOf(u));
  B.step(3);
  assert.equal(B.stage.info().layers.city, false);
  assert.ok(log.some((e) => e[0] === 'city' && e[1] === 'dispose'));
  assert.equal(B.stage.info().failed, null);
});

test('mount v2: the crew anchor function, the QA grid, html.sl-low and the camera icons', (t) => {
  const u = starter();
  const booth = placeAny(u, 'bld_photobooth');
  const H = harness(t, { tier: 'LOW', globals: { SLWorldArt: { uiIcon: (n) => '<svg class="slw-ico" data-n="' + n + '"></svg>' } } });
  H.stage.sync(viewOf(u));
  /* the brain's setAnchorFn */
  const fn = H.actorsLog.actors.anchorFn;
  assert.equal(typeof fn, 'function');
  const p = fn(booth, 'top');
  const pv = G.pivot('bld_photobooth', u.world.placed.find((q) => q.uid === booth).x, u.world.placed.find((q) => q.uid === booth).y);
  assert.ok(Math.abs(p.x - pv.x) < 1e-9 && Math.abs(p.y - (pv.y + 1)) < 1e-9);
  const out = { x: 0, y: 0, z: 0 };
  assert.equal(fn(booth, 'top', out), out, 'writes into out when given');
  assert.equal(fn(booth, 'roof'), null, 'an anchor the template lacks is null, never the top');
  assert.equal(fn('p999', 'top'), null);
  /* the QA grid in play mode */
  assert.equal(H.states[H.states.length - 1].grid, false);
  S.debugGrid(true);
  assert.equal(H.states[H.states.length - 1].grid, true);
  assert.equal(H.states[H.states.length - 1].mode, 'play');
  S.debugGrid(false);
  assert.equal(H.states[H.states.length - 1].grid, false);
  /* LOW marks the page; the camera buttons carry the line icons (their labels stay) */
  assert.ok(globalThis.document.documentElement.classList.contains('sl-low'));
  const btns = H.stage.element.querySelectorAll('[data-cam]');
  assert.equal(btns.length, 5);
  assert.deepEqual(btns.map((b) => (/data-n="(\w+)"/.exec(b.innerHTML) || [])[1]), ['rotL', 'rotR', 'zoomIn', 'zoomOut', 'reset']);
  assert.ok(btns.every((b) => /slw-ico/.test(b.innerHTML) && b.getAttribute('aria-label')));
  /* ?grid=1 under test mode turns the grid on at mount */
  const Q = harness(t, { globals: { SL_WORLD_TRIAL: true, location: { search: '?grid=1' }, SLWorldArt: undefined } });
  Q.stage.sync(viewOf(u));
  assert.equal(Q.states[Q.states.length - 1].grid, true);
  assert.ok(!globalThis.document.documentElement.classList.contains('sl-low'), 'MID: no LOW mark');
  assert.equal(Q.stage.element.querySelector('[data-cam="left"]').textContent, '⟲', 'no 2D art: the glyphs');
});

/* ================================================================
   v2 seams (CONTRACTS §9): the child on atlases / models, paths, the wake ripple, LOW pools
   ================================================================ */
test('seams v2: the child\'s first name and colour reach the LED / sign atlases and the stage / course models, on mount and on every setUser', (t) => {
  const log = [];
  const models = { bld_stage: { setUser(x) { log.push(['stage', x]); } }, att_course: { setUser(x) { log.push(['course', x]); } } };
  const H = harness(t, { models, user: { name: 'Ava Rose', color: '#4FC3F7', avatar: '🦊', seed: 'kid-a' } });
  const ava = { name: 'Ava', color: '#4FC3F7' };
  assert.deepEqual(H.K.atlasUsers, [['led', ava], ['sign', ava]], 'the first name only');
  assert.deepEqual(log, [['stage', ava], ['course', { name: 'Ava', color: '#4FC3F7', avatar: '🦊' }]]);
  H.stage.setUser({ name: 'Sis', color: '#FF7043', avatar: '🐼', seed: 'kid-b' });
  const sis = { name: 'Sis', color: '#FF7043' };
  assert.deepEqual(H.K.atlasUsers.slice(2), [['led', sis], ['sign', sis]]);
  assert.deepEqual(log.slice(2), [['stage', sis], ['course', { name: 'Sis', color: '#FF7043', avatar: '🐼' }]]);
  /* a model whose setUser throws is only logged */
  const B = harness(t, { models: { bld_stage: { setUser() { throw new Error('boom'); } } } });
  assert.equal(B.stage.info().failed, null);
  assert.ok(B.stage.info().issues.some((s) => /bld_stage\.setUser/.test(s)));
  assert.deepEqual(S.handleUser({ name: 'Kid', color: '#4FC3F7', avatar: '🦊' }), { name: 'Kid', color: '#4FC3F7', avatar: '🦊' });
  assert.equal(S.firstName('  Mia  Grace '), 'Mia'); assert.equal(S.firstName(null), '');
});

test('seams v2: path models that opt in get their piece, layout and yaw from SLModelsGarden.pathPose (one layout per piece below HIGH)', (t) => {
  const GARDEN = require('../world/island3d/models-garden.js');
  const u = starter();
  const isPath = (id) => C.item(id).kind === 'path';
  const paths = u.world.placed.filter((p) => isPath(p.id));
  assert.ok(paths.length >= 3, 'the starter island has a path');
  const pc = S.pathPieces(u.world.placed, isPath, L.pathPiece);
  for (const tier of ['MID', 'LOW', 'HIGH']) {
    const H = harness(t, { tier, models: { path_stone: { pieces: true }, path_wood: { pieces: true }, path_flower: { pieces: true } }, globals: { SLModelsGarden: GARDEN } });
    H.stage.sync(viewOf(u));
    for (const p of paths) {
      const want = GARDEN.pathPose(pc[p.uid].mask, p.uid, {}, S.PATH_LAYOUTS[tier]);
      const b = H.batchOf(p.uid), add = b.adds.filter((a) => a.uid === p.uid).pop();
      assert.equal(b.template.sk, want.stateKey, tier + ' ' + p.uid);
      assert.deepEqual(b.template.st, { piece: want.piece, layout: want.layout });
      assert.equal(add.place.yaw, want.yawDeg, 'the piece turns on its cell');
      assert.equal(add.jitter, undefined, 'paths never jitter');
      if (tier !== 'HIGH') assert.equal(want.layout, 0, 'one layout per piece on LOW and MID');
    }
  }
  /* without SLModelsGarden: the bare piece and its yaw */
  assert.deepEqual(S.pathCopy({ mask: 5, piece: 'straight', yawDeg: 0 }, 'p1', null, 3), { st: { piece: 'straight' }, sk: 'p:straight', yaw: 0 });
  assert.deepEqual(S.PATH_LAYOUTS, { LOW: 1, MID: 1, HIGH: 3 });
});

test('seams v2: copies light up with the env\'s "city wakes up" ripple (k × env.wakeAt) and re-light for a new child', (t) => {
  const u = starter();
  placeAny(u, 'bld_photobooth');
  const shows = [];
  let wake = 0.25;
  const models = { bld_photobooth: { show(a, k) { shows.push([k, a.show, a.member]); } } };
  const H = harness(t, { models, wakeAt: () => wake });
  H.stage.sync(viewOf(u));
  readyUp(H);
  shows.length = 0;
  H.stage.showtime(true);
  H.step(1);
  assert.deepEqual(shows.pop(), [0.25, 0.25, '#4FC3F7'], 'the wave has not reached the booth yet');
  wake = 1;
  H.step(1);
  assert.deepEqual(shows.pop(), [1, 1, '#4FC3F7'], 'it catches up while the wave travels');
  H.step(60);
  const n = shows.length;
  H.step(10);
  assert.equal(shows.length, n, 'show() rests once the ripple window is over');
  H.stage.setUser({ name: 'Sis', color: '#FF7043', seed: 'kid-a' });
  H.step(1);
  assert.deepEqual(shows.pop(), [1, 1, '#FF7043'], 'every copy re-lights in the new colour');
  assert.equal(S.wakeShow(0.8, 0.5), 0.4); assert.equal(S.wakeShow(0.8, undefined), 0.8); assert.equal(S.wakeShow(1, 3), 1);
});

test('seams v2 (LOW): the selection pool has its own key, so it never takes a building\'s uplight away', (t) => {
  const u = starter();
  const studio = placeAny(u, 'bld_recording');
  const fxLog = [];
  const fx = () => ({
    emit() {}, halo() {}, update: () => false, setMember() {}, setReduced() {}, setQuality() {}, clear() {}, dispose() {},
    decal(k, on, p, tok) { fxLog.push(['decal', k, !!on, tok]); }, uplight(k, on, p, tok) { fxLog.push(['up', k, !!on, tok]); }
  });
  const H = harness(t, { tier: 'LOW', fx, models: { bld_recording: { show(a) { a.decal(true, 'Window Warm'); } } } });
  H.stage.sync(viewOf(u));
  const of = (k) => fxLog.filter((e) => e[1] === k);
  assert.deepEqual(of('u:' + studio).pop(), ['up', 'u:' + studio, true, 'Window Warm'], 'the studio\'s uplight');
  H.stage.sync(viewOf(u, { mode: 'edit', selectedUid: studio }));
  assert.deepEqual(of('sel:' + studio).pop(), ['decal', 'sel:' + studio, true, 'Star Gold'], 'LOW: a gold pool marks the selection');
  H.stage.sync(viewOf(u, { mode: 'edit', selectedUid: null }));
  assert.deepEqual(of('sel:' + studio).pop(), ['decal', 'sel:' + studio, false, undefined]);
  assert.ok(of('u:' + studio).every((e) => e[2]), 'the uplight stayed on throughout');
});
