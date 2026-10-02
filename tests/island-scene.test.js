'use strict';
/* My Island 3D — the scene controller's pure layer (world/island3d/island3d.js) */
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../world/island3d/island3d.js');
const C = require('../world/world-core.js');
const L = require('../world/world-look.js');
const G = require('../world/island3d/grid3d.js');
const Kit = require('../world/island3d/kit.js');

test('scene: loads in Node as a pure module (no mount without a DOM)', () => {
  assert.equal(typeof S.diffPlaced, 'function');
  assert.equal(S.VERSION, 1);
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
  assert.equal(S.petLabel(C, { id: 'pet_puppy', name: 'Biscuit', active: true }), 'Biscuit the puppy (runs your obstacle course)');
  assert.equal(S.petLabel(C, { id: 'pet_kitten', name: 'Mittens' }), 'Mittens the kitten');
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
