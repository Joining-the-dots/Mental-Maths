'use strict';
/* My Island 3D — the pets' brain (world/island3d/pets-brain.js, pure) and the actors driver
   (world/island3d/actors.js, run here against a fake kit: THREE is not available in Node). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../world/world-core.js');
const M = require('../world/island3d/motion.js');
const CH = require('../world/island3d/models-characters.js');
const B = require('../world/island3d/pets-brain.js');
const A = require('../world/island3d/actors.js');

const DT = 1 / 20;
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

/* ---------------- fixtures ---------------- */
function starter() { const u = { points: 0 }; C.grantStarter(u, 0); return u; }
function buyer(u, tag) { let n = 0; return (id) => C.purchase(u, id, { tx: 'tx' + tag + '_' + (n++) + 'abcdef', trial: true }); }
function petsOf(w) { return w.pets.filter((p) => C.owns(w, p.id)).map((p) => ({ id: p.id, active: p.id === w.activePet })); }
/* a seeded random LEGAL layout: trial purchases + C.place only (every rule stays in SLWorldCore) */
function randomLayout(seed) {
  const R = B.makeRng(seed * 7919 + 13);
  const u = starter(), w = u.world, buy = buyer(u, 's' + seed);
  if (R() < 0.5) buy('land_cove');
  if (R() < 0.5) buy('land_meadow');
  for (const id of ['pet_kitten', 'pet_bunny', 'pet_dragon']) if (R() < 0.55) buy(id);
  if (R() < 0.25) buy('att_pitch');
  if (R() < 0.25) buy('att_kart');
  const ids = C.CATALOG.filter((it) => it.kind === 'decor' || it.kind === 'path' || it.kind === 'fun').map((it) => it.id);
  const n = Math.floor(R() * 45);
  for (let i = 0; i < n; i++) {
    const id = ids[Math.floor(R() * ids.length)];
    if (!buy(id).ok) continue;
    for (let k = 0; k < 10; k++) if (C.place(u, id, Math.floor(R() * 16), Math.floor(R() * 10)).ok) break;
  }
  if (R() < 0.3) {
    /* sometimes move the house's neighbours around: random moves of placed decor */
    for (const p of w.placed.slice()) if (C.item(p.id).kind === 'decor' && R() < 0.3) C.place(u, p.id, Math.floor(R() * 16), Math.floor(R() * 10), p.uid);
  }
  return { u, w };
}
function onSeat(p) { return p.state === 'perform' && (p.onSeat || p.perfPhase === 'hopOn' || p.perfPhase === 'hopOff'); }
function checkInvariants(brain, msg) {
  const g = brain.graph, res = brain.reservations(), seen = new Map();
  for (let i = 0; i < res.length; i++) if (res[i] >= 0) {
    assert.ok(!seen.has(res[i]), msg + ': pet ' + res[i] + ' holds two cells');
    seen.set(res[i], i);
    assert.equal(g.walk[i], 1, msg + ': a reservation sits on a blocked cell');
  }
  const targets = new Set();
  for (const p of brain.pets) {
    if (p.res >= 0) assert.equal(res[p.res], p.index, msg + ': ' + p.id + ' reservation bookkeeping');
    if (p.state === 'walk' && p.path) {
      assert.ok(!targets.has(p.path.target), msg + ': two pets share a target cell');
      targets.add(p.path.target);
    }
    if (onSeat(p)) continue;
    const c = B.cellOf(p.x, p.z);
    assert.ok(c >= 0 && g.walk[c] === 1, msg + ': ' + p.id + ' on a blocked / off-land cell ' + B.keyOf(Math.max(0, c)) + ' (' + p.state + ':' + p.action + ':' + p.perfPhase + ')');
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z) && Number.isFinite(p.yaw), msg + ': finite');
  }
}

/* ---------------- the graph and A* ---------------- */
test('pets: free cells are unlocked land minus object occupancy and the avatar; paths are walkable', () => {
  const u = starter(), w = u.world;
  const g = B.buildGraph(w, { avatar: undefined });
  const land = C.landSet(w), occ = C.occupancy(w).occ;
  for (let i = 0; i < 160; i++) {
    const k = B.keyOf(i), o = occ[k];
    const want = !!land[k] && (!o || o.layer === 'ground') && i !== g.avatar;
    assert.equal(g.walk[i] === 1, want, k);
  }
  /* the avatar stands on the house's left entrance cell */
  const house = w.placed.find((p) => p.id === 'house_cottage');
  assert.equal(g.avatar, B.cellIndex(house.x, house.y + 2));
  /* a starter path cell is walkable */
  const path = w.placed.find((p) => p.id === 'path_stone');
  assert.equal(g.walk[B.cellIndex(path.x, path.y)], 1);
  /* no avatar → its cell is free again */
  assert.equal(B.buildGraph(w, { avatar: null }).walk[g.avatar], 1);
});

test('pets: A* uses 8 neighbours but never cuts a corner', () => {
  /* a 3×3 open square with the two orthogonal cells of one diagonal blocked */
  const land = {}, occ = {};
  for (let c = 4; c <= 6; c++) for (let r = 4; r <= 6; r++) land[c + ',' + r] = 1;
  occ['5,4'] = { uid: 'a', id: 'rock_mossy', layer: 'object' };
  occ['4,5'] = { uid: 'b', id: 'rock_mossy', layer: 'object' };
  const g = B.buildGraph({ land, occ, placed: [] }, { avatar: null });
  const from = B.cellIndex(4, 4), to = B.cellIndex(5, 5);
  assert.equal(B.astar(g, from, to), null, '(4,4) is sealed in: its only diagonal would cut two corners');
  delete occ['4,5'];
  const g2 = B.buildGraph({ land, occ, placed: [] }, { avatar: null });
  const p = B.astar(g2, from, to);
  assert.deepEqual(p.map(B.keyOf), ['4,4', '4,5', '5,5'], 'it walks round the corner');
  /* open field: a straight diagonal is used */
  const g3 = B.buildGraph({ land, occ: {}, placed: [] }, { avatar: null });
  assert.deepEqual(B.astar(g3, B.cellIndex(4, 4), B.cellIndex(6, 6)).map(B.keyOf), ['4,4', '5,5', '6,6']);
  /* blocked target / unreachable → null */
  assert.equal(B.astar(g3, B.cellIndex(4, 4), B.cellIndex(10, 9)), null);
});

test('pets: smoothed paths (line of sight + Catmull-Rom) stay on free cells for random pairs on random layouts', () => {
  let checked = 0;
  for (let s = 0; s < 40; s++) {
    const { w } = randomLayout(1000 + s), g = B.buildGraph(w, {});
    const R = B.makeRng(s), free = [];
    for (let i = 0; i < 160; i++) if (g.walk[i]) free.push(i);
    for (let k = 0; k < 25; k++) {
      const a = free[Math.floor(R() * free.length)], b = free[Math.floor(R() * free.length)];
      const cells = B.astar(g, a, b);
      if (!cells) continue;
      const p = B.smoothPath(g, cells, B.centreX(a), B.centreZ(a), null);
      assert.ok(B.pathValid(g, p, 0, null, a), 'valid');
      for (let d = 0; d <= p.total; d += 0.02) {
        const q = B.samplePath(p, d, {});
        assert.equal(g.walk[B.cellOf(q.x, q.z)], 1, 'sample on a free cell');
      }
      const end = B.samplePath(p, p.total, {});
      assert.ok(near(end.x, B.centreX(b), 1e-9) && near(end.z, B.centreZ(b), 1e-9), 'ends at the target centre');
      /* smoothing never makes the walk much longer than the grid path */
      let grid = 0;
      for (let i = 1; i < cells.length; i++) grid += Math.hypot(B.centreX(cells[i]) - B.centreX(cells[i - 1]), B.centreZ(cells[i]) - B.centreZ(cells[i - 1]));
      assert.ok(p.total <= grid * 1.02 + 0.05, 'not much longer than the cell path (corners round off): ' + p.total + ' vs ' + grid);
      checked++;
    }
  }
  assert.ok(checked > 500, 'enough paths checked: ' + checked);
});

test('pets: heights follow the meadow terraces with a small hop at each step', () => {
  const u = starter();
  buyer(u, 'h')('land_meadow');
  const g = B.buildGraph(u.world, {});
  /* (1, 4) is a 0.35 terrace; (2, 4) is home grass at 0 */
  assert.ok(near(B.heightAt(g, B.centreX(B.cellIndex(1, 4)), B.centreZ(B.cellIndex(1, 4))), 0.35));
  assert.ok(near(B.heightAt(g, B.centreX(B.cellIndex(2, 4)), B.centreZ(B.cellIndex(2, 4))), 0));
  const edgeX = 2 - 8;                     /* the boundary between columns 1 and 2 */
  const zc = B.centreZ(B.cellIndex(1, 4));
  const left = B.heightAt(g, edgeX - 1e-6, zc), right = B.heightAt(g, edgeX + 1e-6, zc);
  assert.ok(near(left, right, 1e-3), 'continuous across the step');
  assert.ok(left > 0.35 / 2 + 0.1, 'with a little hop over the edge');
  let prev = B.heightAt(g, edgeX - 0.5, zc);
  for (let x = edgeX - 0.5; x <= edgeX + 0.5; x += 0.01) { const h = B.heightAt(g, x, zc); assert.ok(Math.abs(h - prev) < 0.06, 'no jumps'); prev = h; }
});

/* ---------------- 200 seeded random legal layouts ---------------- */
test('pets: over 200 random legal layouts pets never leave free land and never share a target cell', () => {
  let walks = 0, decisions = 0;
  for (let s = 0; s < 200; s++) {
    const { w } = randomLayout(s);
    const brain = B.create({ seed: s });
    brain.sync({ world: w, pets: petsOf(w) });
    checkInvariants(brain, 'layout ' + s + ' sync');
    for (let i = 0; i < 400; i++) {
      brain.step(DT);
      if (i % 2 === 0) checkInvariants(brain, 'layout ' + s + ' step ' + i);
      for (const p of brain.pets) if (p.state === 'walk') walks++;
    }
    for (const p of brain.pets) decisions += p.starts;
  }
  assert.ok(walks > 5000, 'pets really walked: ' + walks);
  assert.ok(decisions > 400, 'idle actions were scheduled: ' + decisions);
});

test('pets: settled pets keep their distance (no two pets standing on each other)', () => {
  for (let s = 0; s < 40; s++) {
    const { w } = randomLayout(500 + s);
    const brain = B.create({ seed: 'gap' + s });
    brain.sync({ world: w, pets: petsOf(w) });
    for (let i = 0; i < 600; i++) {
      brain.step(DT);
      const still = brain.pets.filter((p) => p.state === 'idle' || p.state === 'act' || p.state === 'sit');
      for (let a = 0; a < still.length; a++) for (let b = a + 1; b < still.length; b++) {
        const d = Math.hypot(still[a].x - still[b].x, still[a].z - still[b].z);
        assert.ok(d >= 0.5, 'layout ' + s + ' step ' + i + ': ' + still[a].id + ' and ' + still[b].id + ' are ' + d.toFixed(2) + ' u apart');
      }
    }
  }
});

/* ---------------- re-planning ---------------- */
test('pets: a walking pet re-plans when an object lands on its path', () => {
  let replanned = 0;
  for (let s = 0; s < 30 && replanned < 5; s++) {
    const u = starter(), w = u.world, buy = buyer(u, 'rp' + s);
    const brain = B.create({ seed: 'replan' + s });
    brain.sync({ world: w, pets: petsOf(w) });
    let p = brain.pets[0];
    for (let i = 0; i < 400 && !(p.state === 'walk' && p.path && p.path.cells.length >= 4 && p.pathS < 0.3); i++) brain.step(DT);
    if (!(p.state === 'walk' && p.path && p.path.cells.length >= 4)) continue;
    /* drop a rock on a cell the pet is about to walk through */
    const target = p.path.target, old = p.path;
    const ahead = B.samplePath(old, Math.min(old.total, p.pathS + 1.2), {}), mid = B.cellOf(ahead.x, ahead.z);
    if (mid === target || mid === B.cellOf(p.x, p.z) || !buy('rock_mossy').ok) continue;
    const r = C.place(u, 'rock_mossy', mid % 16, Math.floor(mid / 16));
    if (!r.ok) continue;
    brain.sync({ world: w, pets: petsOf(w) });
    checkInvariants(brain, 'after the rock');
    assert.ok(p.path !== old || p.state !== 'walk', 'the blocked path was replaced');
    if (p.state === 'walk') {
      assert.ok(B.pathValid(brain.graph, p.path, p.pathS, null, B.cellOf(p.x, p.z)), 'the (new) path is valid');
      for (let d = p.pathS; d <= p.path.total; d += 0.02) {
        const q = B.samplePath(p.path, d, {});
        assert.notEqual(B.cellOf(q.x, q.z), mid, 'and never crosses the rock');
      }
    }
    for (let i = 0; i < 200; i++) { brain.step(DT); checkInvariants(brain, 'walking on'); }
    replanned++;
  }
  assert.ok(replanned >= 3, 're-plans exercised: ' + replanned);
});

test('pets: a pet on a newly blocked cell, or fully enclosed, pops to the nearest free cell', () => {
  const land = {};
  for (let c = 2; c <= 12; c++) for (let r = 2; r <= 7; r++) land[c + ',' + r] = 1;
  const brain = B.create({ seed: 'pop' });
  brain.sync({ world: { land, occ: {}, placed: [] }, pets: [{ id: 'pet_puppy' }], avatar: null });
  const p = brain.pets[0];
  /* stand it on (7, 4) */
  p.x = B.centreX(B.cellIndex(7, 4)); p.z = B.centreZ(B.cellIndex(7, 4)); p.cell = B.cellIndex(7, 4);
  brain.sync({ world: { land, occ: {}, placed: [] }, pets: [{ id: 'pet_puppy' }], avatar: null });
  brain.events.length = 0;
  /* ring it in with 8 rocks: enclosed */
  const occ = {};
  for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) if (dc || dr) occ[(7 + dc) + ',' + (4 + dr)] = { uid: 'r' + dc + dr, id: 'rock_mossy', layer: 'object' };
  const out = brain.sync({ world: { land, occ, placed: [] }, pets: [{ id: 'pet_puppy' }], avatar: null });
  assert.deepEqual(out.popped, ['pet_puppy']);
  assert.equal(brain.events[0].type, 'pop');
  const c = B.cellOf(p.x, p.z);
  assert.notEqual(c, B.cellIndex(7, 4), 'it left the pocket');
  assert.equal(brain.graph.comp[c], brain.graph.largest, 'into the big free area');
  assert.ok(Math.hypot(p.x - B.centreX(B.cellIndex(7, 4)), p.z - B.centreZ(B.cellIndex(7, 4))) <= 2.3, 'the nearest free cell');
  /* now block the cell it stands on */
  brain.events.length = 0;
  const occ2 = Object.assign({}, occ); occ2[B.keyOf(c)] = { uid: 'x', id: 'tree_oak', layer: 'object' };
  assert.deepEqual(brain.sync({ world: { land, occ: occ2, placed: [] }, pets: [{ id: 'pet_puppy' }], avatar: null }).popped, ['pet_puppy']);
  assert.equal(brain.graph.walk[B.cellOf(p.x, p.z)], 1);
  checkInvariants(brain, 'after pops');
});

test('pets: new pets spawn near the house with a sparkle; removed pets leave', () => {
  const u = starter(), w = u.world;
  const brain = B.create({ seed: 'spawn' });
  brain.sync({ world: w, pets: petsOf(w) });
  assert.equal(brain.events.length, 0, 'no sparkle for the pets already there');
  buyer(u, 'sp')('pet_bunny');
  const out = brain.sync({ world: w, pets: petsOf(w) });
  assert.deepEqual(out.added, ['pet_bunny']);
  assert.equal(brain.events.filter((e) => e.type === 'spawn').length, 1);
  const b = brain.pet('pet_bunny'), av = brain.graph.avatar;
  assert.ok(Math.hypot(b.x - B.centreX(av), b.z - B.centreZ(av)) < 5, 'near the house');
  const out2 = brain.sync({ world: w, pets: [{ id: 'pet_bunny' }] });
  assert.deepEqual(out2.removed, ['pet_puppy']);
  assert.equal(brain.pets.length, 1);
  assert.equal(brain.activeId(), 'pet_bunny', 'with no active flag the first pet is active');
});

/* ---------------- idle scheduling ---------------- */
test('pets: an idle action every 4–8 s (start to start), sized to fit its gap', () => {
  const u = starter(), w = u.world, buy = buyer(u, 'idle');
  buy('bench'); C.place(u, 'bench', 5, 7);
  buy('fountain'); C.place(u, 'fountain', 10, 7);
  const brain = B.create({ seed: 'idle-gaps' });
  brain.sync({ world: w, pets: petsOf(w) });
  const p = brain.pets[0], starts = [], kinds = new Set();
  let last = p.starts;
  for (let i = 0; i < 20 * 300; i++) {
    brain.step(1 / 20);
    if (p.starts !== last) {
      last = p.starts; starts.push(p.lastStart);
      assert.ok(p.gap >= 4 && p.gap <= 8, 'gap ' + p.gap);
      kinds.add(p.state === 'walk' ? (p.goal ? p.goal.type + ':' + (p.goal.name || '') : 'wander') : p.state + ':' + p.action);
    }
  }
  assert.ok(starts.length > 30, 'actions: ' + starts.length);
  for (let i = 1; i < starts.length; i++) {
    const gap = starts[i] - starts[i - 1];
    assert.ok(gap >= 4 - 1e-9 && gap <= 8 + 1 / 20 + 1e-9, 'start-to-start gap ' + gap.toFixed(3));
  }
  for (const k of ['wander', 'act:sit', 'act:sniff', 'act:look']) assert.ok(kinds.has(k), 'did ' + k + ' (' + [...kinds].join(', ') + ')');
  assert.ok([...kinds].some((k) => k === 'act:chase'), 'the puppy plays (tail chase)');
});

test('pets: every species has its play move, and visits use items (sniff flowers, the bench seat)', () => {
  assert.deepEqual(B.PLAY, { pet_puppy: 'chase', pet_kitten: 'pounce', pet_bunny: 'binky', pet_dragon: 'loop' });
  const u = starter(), w = u.world, buy = buyer(u, 'v');
  for (const id of ['pet_kitten', 'pet_bunny', 'pet_dragon']) buy(id);
  buy('bench'); C.place(u, 'bench', 5, 7);
  const brain = B.create({ seed: 'visits' });
  brain.sync({ world: w, pets: petsOf(w) });
  brain.setShow(1);                                  /* Showtime: benches 4× likelier */
  const seen = new Set();
  for (let i = 0; i < 20 * 400; i++) {
    brain.step(1 / 20);
    for (const p of brain.pets) {
      if (p.state === 'act') seen.add(p.species + ':' + p.action);
      if (p.onSeat === 'bench') {
        seen.add('bench');
        const ob = Object.values(brain.graph.objects).find((o) => o.id === 'bench');
        assert.ok(near(p.y, ob.y + B.SEAT.bench.y, 1e-9) && near(p.z, ob.z + B.SEAT.bench.z, 1e-9), 'on the seat');
      }
    }
  }
  for (const k of ['pet_kitten:pounce', 'pet_bunny:binky', 'pet_dragon:loop', 'bench']) assert.ok(seen.has(k), k + ' (' + [...seen].join(', ') + ')');
  assert.ok([...seen].some((k) => /:sniff$/.test(k)), 'sniffing');
});

/* ---------------- determinism ---------------- */
test('pets: everything is deterministic per seed', () => {
  function run(seed) {
    const { w } = randomLayout(77);
    const brain = B.create({ seed });
    brain.sync({ world: w, pets: petsOf(w) });
    const trace = [];
    for (let i = 0; i < 600; i++) {
      brain.step(DT);
      if (i === 300) { const t = w.placed.find((p) => p.id === 'trampoline'); if (t) brain.perform('trampoline', t.uid); brain.tap(brain.pets[0].id); }
      if (i === 450) brain.dance(true, { beat: 13.37, bpm: 118 });
      if (i % 25 === 0) trace.push(brain.pets.map((p) => [p.id, p.x.toFixed(6), p.z.toFixed(6), p.yaw.toFixed(6), p.state, p.action].join('|')).join(';'));
    }
    return trace.join('\n');
  }
  assert.equal(run('same'), run('same'));
  assert.notEqual(run('same'), run('other'));
});

/* ---------------- edit mode and reduced motion ---------------- */
test('pets: in edit and place modes pets sit where they are; play mode resumes', () => {
  const u = starter(), w = u.world;
  buyer(u, 'e')('pet_kitten');
  const brain = B.create({ seed: 'edit' });
  brain.sync({ world: w, pets: petsOf(w) });
  for (let i = 0; i < 100; i++) brain.step(DT);
  brain.sync({ world: Object.assign({}, w, { mode: 'edit' }), pets: petsOf(w) });
  const at = brain.pets.map((p) => [p.x, p.z]);
  for (const p of brain.pets) assert.equal(p.state, 'sit');
  for (let i = 0; i < 400; i++) brain.step(DT);
  brain.pets.forEach((p, k) => { assert.equal(p.state, 'sit'); assert.equal(p.x, at[k][0]); assert.equal(p.z, at[k][1]); });
  const t = w.placed.find((p) => p.id === 'house_cottage');
  assert.equal(brain.perform('trampoline', t.uid), -1, 'no acts in edit mode');
  brain.setMode('place');
  assert.equal(brain.pets[0].state, 'sit');
  brain.setMode('play');
  let moved = false;
  for (let i = 0; i < 400; i++) { brain.step(DT); if (brain.pets.some((p, k) => p.x !== at[k][0] || p.z !== at[k][1])) moved = true; }
  assert.ok(moved, 'they wander again');
});

test('pets: reduced motion keeps pets still at their spots — they only turn and emote', () => {
  const u = starter(), w = u.world, buy = buyer(u, 'r');
  buy('pet_dragon'); buy('trampoline'); C.place(u, 'trampoline', 5, 7);
  const brain = B.create({ seed: 'reduced', reduced: true });
  brain.sync({ world: w, pets: petsOf(w) });
  const at = brain.pets.map((p) => [p.x, p.z]), acts = new Set();
  for (let i = 0; i < 20 * 120; i++) {
    brain.step(1 / 20);
    for (const p of brain.pets) { if (p.state === 'act') acts.add(p.action); assert.notEqual(p.state, 'walk'); }
  }
  brain.pets.forEach((p, k) => { assert.equal(p.x, at[k][0]); assert.equal(p.z, at[k][1]); });
  for (const a of acts) assert.ok(['look', 'lookAvatar', 'turn', 'emote'].includes(a), a);
  assert.ok(acts.has('turn') && acts.has('emote'));
  assert.ok(brain.events.some((e) => e.type === 'emote'), 'emotes are announced');
  const tr = w.placed.find((p) => p.id === 'trampoline');
  assert.equal(brain.perform('trampoline', tr.uid), -1, 'the trampoline does its own gentle boing');
  assert.equal(brain.tap(brain.pets[0].id) !== '', true);
  assert.ok(brain.pets[0].pauseUntil < brain.now, 'no hop under reduced motion');
  /* the dance is one group pose, no gathering */
  const dur = brain.dance(true, { beat: 2.2, bpm: 118 });
  assert.equal(dur, B.DANCE.reducedDur);
  brain.pets.forEach((p, k) => { assert.equal(p.state, 'dance'); assert.equal(p.x, at[k][0]); });
  assert.equal(brain.danceInfo({}).move, 'pose');
});

/* ---------------- the trampoline and the bench ---------------- */
test('pets: the bounce maths are SLMotion\'s', () => {
  for (const k of ['g', 'contact', 'dip', 'maxLead']) assert.equal(B.BOUNCE[k], M.BOUNCE[k], k);
  assert.deepEqual(B.BOUNCE.heights, M.BOUNCE.heights);
  assert.ok(near(B.BOUNCE.length, M.BOUNCE.length));
  for (const lead of [0, 0.45, 0.8, 1.2]) for (let t = 0; t < lead + B.BOUNCE.length; t += 0.013) {
    const a = B.bounceAt(t, lead, {}), b = M.sample('bounce', t, {}, { lead });
    assert.ok(near(a.petY, b.petY, 1e-9) && near(a.flip, b.flip, 1e-9) && near(a.matDip, b.matDip, 1e-9), 'lead ' + lead + ' t ' + t.toFixed(3));
  }
});

test('pets: the trampoline act — run over (≤ 1.2 s), land on the mat at the lead, 3 bounces with a flip, hop off', () => {
  for (const spot of [[5, 7], [12, 6], [3, 6], [8, 8]]) {
    const u = starter(), w = u.world, buy = buyer(u, 't' + spot);
    buy('pet_kitten'); buy('trampoline');
    if (!C.place(u, 'trampoline', spot[0], spot[1]).ok) continue;
    const brain = B.create({ seed: 'tramp' + spot });
    brain.sync({ world: w, pets: petsOf(w) });
    for (let i = 0; i < 60; i++) brain.step(DT);
    const tr = w.placed.find((p) => p.id === 'trampoline'), ob = brain.graph.objects[tr.uid];
    const lead = brain.perform('trampoline', tr.uid);
    assert.ok(lead >= B.BOUNCE.minLead - 1e-9 && lead <= B.BOUNCE.maxLead + 1e-9, 'lead ' + lead);
    const p = brain.pet(brain.activeId()), dt = 1 / 120, seatY = ob.y + B.SEAT.trampoline.y;
    assert.equal(p.id, 'pet_puppy', 'the active pet performs');
    let t = 0, flipped = 0, peak = 0;
    while (t < lead - 1e-9) { brain.step(dt); t += dt; }
    assert.ok(Math.abs(p.x - ob.x) < 1e-6 && Math.abs(p.z - ob.z) < 1e-6, 'on the mat at the lead');
    while (t < lead + B.BOUNCE.length - 0.01) {
      brain.step(dt); t += dt;
      const ref = M.sample('bounce', t, {}, { lead });
      assert.ok(Math.abs(p.y - (seatY + ref.petY)) < 0.06, 'bounce height follows the mat act at t ' + t.toFixed(3));
      flipped = Math.max(flipped, p.flip); peak = Math.max(peak, p.y - seatY);
    }
    assert.ok(flipped > 0.9, 'the front flip');
    assert.ok(peak > 0.95 && peak < 1.01, 'the 1.0 u top bounce: ' + peak);
    for (let i = 0; i < 120; i++) { brain.step(dt); }
    assert.equal(p.state, 'idle');
    assert.equal(brain.graph.walk[B.cellOf(p.x, p.z)], 1, 'hopped off onto a free cell');
    assert.ok(brain.graph.objects[tr.uid].adj.includes(B.cellOf(p.x, p.z)), 'next to the trampoline');
    checkInvariants(brain, 'after the trampoline');
  }
});

test('pets: re-tapping the trampoline restarts the act cleanly; no pet / no item → -1', () => {
  const u = starter(), w = u.world, buy = buyer(u, 'rt');
  buy('trampoline'); C.place(u, 'trampoline', 5, 7);
  const brain = B.create({ seed: 'retap' });
  brain.sync({ world: w, pets: petsOf(w) });
  const tr = w.placed.find((p) => p.id === 'trampoline');
  const lead = brain.perform('trampoline', tr.uid);
  for (let i = 0; i < 4; i++) brain.step(DT);
  const lead2 = brain.perform('trampoline', tr.uid);
  assert.ok(near(lead2, lead - 4 * DT, 1e-6), 'mid-run: the same landing time ' + lead2 + ' vs ' + (lead - 4 * DT));
  for (let i = 0; i < Math.ceil((lead2 + 0.5) / DT); i++) brain.step(DT);
  assert.equal(brain.pets[0].perfPhase, 'bounce');
  assert.equal(brain.perform('trampoline', tr.uid), 0, 'on the mat: bounce again right away');
  assert.equal(brain.perform('fountain', tr.uid), -1);
  const empty = B.create({ seed: 'x' });
  empty.sync({ world: w, pets: [] });
  assert.equal(empty.perform('trampoline', tr.uid), -1, 'no pet');
  const u2 = starter(), b2 = B.create({ seed: 'y' });
  b2.sync({ world: u2.world, pets: petsOf(u2.world) });
  assert.equal(b2.perform('trampoline', 'p999'), -1, 'no trampoline');
});

test('pets: the bench — walk over, hop up, sit on the seat facing out, hop down', () => {
  const u = starter(), w = u.world, buy = buyer(u, 'b');
  buy('bench'); C.place(u, 'bench', 9, 8);
  const brain = B.create({ seed: 'bench' });
  brain.sync({ world: w, pets: petsOf(w) });
  const bench = w.placed.find((p) => p.id === 'bench');
  const lead = brain.perform('bench', bench.uid);
  assert.ok(lead > 0, 'lead ' + lead);
  const p = brain.pets[0], ob = brain.graph.objects[bench.uid];
  let sat = 0;
  for (let i = 0; i < 20 * 14; i++) {
    brain.step(1 / 20);
    if (p.onSeat === 'bench') { sat++; assert.ok(near(p.y, ob.y + B.SEAT.bench.y)); }
  }
  assert.ok(sat > 20 * 3, 'sat for a while: ' + sat);
  assert.ok(Math.abs(B.wrap(p.yaw)) < 0.6 || p.state !== 'perform', 'faced out');
  assert.notEqual(p.state, 'perform', 'and hopped down');
  checkInvariants(brain, 'after the bench');
  /* a bench nobody can reach: -1, and a walking pet keeps walking */
  const land = {};
  for (let c = 2; c <= 12; c++) for (let r = 2; r <= 7; r++) land[c + ',' + r] = 1;
  const occ = { '9,5': { uid: 'b1', id: 'bench', layer: 'object' } };
  for (const k of ['8,5', '10,5', '9,4', '9,6']) occ[k] = { uid: 'r' + k, id: 'rock_mossy', layer: 'object' };
  const placed = [{ uid: 'b1', id: 'bench', x: 9, y: 5 }];
  const b2 = B.create({ seed: 'bench2' });
  b2.sync({ world: { land, occ, placed }, pets: [{ id: 'pet_bunny' }], avatar: null });
  let q = b2.pets[0];
  for (let i = 0; i < 400 && q.state !== 'walk'; i++) b2.step(DT);
  assert.equal(q.state, 'walk');
  assert.equal(b2.perform('bench', 'b1'), -1);
  assert.equal(q.state, 'walk');
  assert.ok(q.path, 'its walk is untouched');
  for (let i = 0; i < 100; i++) b2.step(DT);
});

/* ---------------- the dance break ---------------- */
test('pets: the dance timeline is 8 counts at 118 BPM (≈ 4.07 s) ending in the group pose', () => {
  assert.equal(B.DANCE.bpm, 118);
  assert.ok(near(B.DANCE.dur, 8 * 60 / 118) && near(B.DANCE.dur, 4.0678, 1e-3));
  const beat = 60 / 118, moves = [];
  for (let c = 0; c < 8; c++) {
    const d = B.danceAt((c + 0.5) * beat, false, {});
    assert.equal(d.phase, 'dance'); assert.equal(d.count, c + 1);
    moves.push(d.move);
  }
  assert.deepEqual(moves, ['side', 'side', 'hop', 'hop', 'signature', 'signature', 'face', 'pose']);
  assert.equal(B.danceAt(B.DANCE.dur - 1e-6, false, {}).move, 'pose');
  assert.equal(B.danceAt(B.DANCE.dur + 0.1, false, {}).phase, 'hold');
  assert.equal(B.danceAt(B.DANCE.dur + B.DANCE.hold + 0.01, false, {}).phase, 'done');
  assert.equal(B.danceAt(-0.5, false, {}).phase, 'wait');
  /* the rig clip agrees: the end of the 8-count is the group pose, facing the camera */
  for (const pet of CH.PETS) {
    const end = CH.sampleClip('dance', B.DANCE.dur - 1e-3, null, { species: pet, bpm: 118 });
    assert.equal(end.faceCam, 1, pet);
    assert.ok(near(CH.durOf('dance', { bpm: 118 }), B.DANCE.dur));
  }
  /* reduced: one group pose */
  const r = B.danceAt(0.5, true, {});
  assert.equal(r.move, 'pose'); assert.equal(B.danceAt(B.DANCE.reducedDur + 0.01, true, {}).phase, 'done');
  /* the cue list: the dragon's sparkle puff, the burst with hearts, then 'cheer' */
  assert.deepEqual(B.DANCE.cues.map((c) => c.emit || c.sfx), ['puff', 'burst', 'cheer']);
});

test('pets: the dance break gathers everyone (≤ 2 s) on open cells by the house and starts together on a bar', () => {
  /* beat 10.3 + 1.2 s of gathering (2.36 beats) = beat 12.66 → the next bar line is beat 16 */
  assert.ok(near(B.alignDelay(1.2, 10.3, 118, true), 1.2 + (16 - 12.66) * 60 / 118, 1e-9));
  assert.ok(near((10.3 + B.alignDelay(1.2, 10.3, 118, true) * 118 / 60) % 4, 0, 1e-9), 'count 1 on a bar line');
  assert.ok(near(B.alignDelay(1.2, 10.3, 118, false), 1.2 + (13 - 12.66) * 60 / 118, 1e-9), 'or on a beat');
  assert.ok(near(B.alignDelay(0, 8, 118, true), 0), 'already on a bar line');
  assert.equal(B.alignDelay(0.7, NaN, 118, true), 0.7, 'no clock → as soon as gathered');
  for (let s = 0; s < 25; s++) {
    const { w } = randomLayout(300 + s);
    const brain = B.create({ seed: 'dance' + s });
    brain.sync({ world: w, pets: petsOf(w) });
    for (let i = 0; i < 80; i++) brain.step(DT);
    const total = brain.dance(true, { beat: 5 + s * 0.37, bpm: 118 });
    assert.ok(total > B.DANCE.dur && total <= B.DANCE.gatherMax + 60 / 118 * 4 + B.DANCE.dur + B.DANCE.hold + 1e-6, 'total ' + total);
    const lead = brain.danceT0 - brain.now;
    assert.ok(lead >= 0 && lead <= B.DANCE.gatherMax + 4 * 60 / 118 + 1e-6, 'starts within the gather + one bar: ' + lead);
    const spots = brain.pets.map((p) => p.danceSpot);
    assert.equal(new Set(spots).size, spots.length, 'distinct spots');
    for (const sc of spots) assert.equal(brain.graph.walk[sc], 1, 'open cells');
    while (brain.now < brain.danceT0 - 1e-9) { brain.step(DT); checkInvariants(brain, 'gathering ' + s); }
    for (const p of brain.pets) {
      assert.equal(p.state, 'dance');
      assert.ok(Math.hypot(p.x - B.centreX(p.danceSpot), p.z - B.centreZ(p.danceSpot)) < 1e-6, p.id + ' reached its spot by count 1');
    }
    while (brain.danceOn) brain.step(DT);
    for (let i = 0; i < 5; i++) brain.step(DT);
    for (const p of brain.pets) assert.notEqual(p.state, 'dance', 'back to idle after the 8-count');
  }
});

/* ---------------- the avatar's glance ---------------- */
test('pets: the avatar glances at a pet every 5–7 s for 1.6 s', () => {
  const starts = [];
  let prevK = 0;
  for (let t = 0; t < 300; t += 0.01) {
    const g = B.glanceAt(t, 'me', {});
    assert.ok(g.k >= 0 && g.k <= 1 && g.pick >= 0 && g.pick < 1);
    if (g.k > 0 && prevK === 0) starts.push(t);
    prevK = g.k;
  }
  for (let i = 1; i < starts.length; i++) assert.ok(starts[i] - starts[i - 1] >= 5 - 0.02 && starts[i] - starts[i - 1] <= 7 + 0.02, 'gap ' + (starts[i] - starts[i - 1]));
  assert.ok(starts.length >= 40);
  assert.deepEqual(B.glanceAt(42.5, 'me', {}), B.glanceAt(42.5, 'me', {}));
});

/* ================================================================
   actors.js against a fake kit
   ================================================================ */
class V3 { constructor() { this.x = 0; this.y = 0; this.z = 0; } set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } }
class Obj3 {
  constructor() { this.position = new V3(); this.rotation = new V3(); this.scale = new V3().set(1, 1, 1); this.children = []; this.parent = null; this.visible = true; this.name = ''; }
  add(...os) { for (const o of os) { if (o.parent) o.parent.remove(o); o.parent = this; this.children.push(o); } return this; }
  remove(o) { const i = this.children.indexOf(o); if (i >= 0) { this.children.splice(i, 1); o.parent = null; } return this; }
  clear() { for (const c of this.children.slice()) this.remove(c); return this; }
}
function fakeKit() {
  const pools = [];
  function pool(cap) {
    const used = new Set(), sets = new Map();
    const p = {
      mesh: new Obj3(), capacity: cap, disposed: false, commits: 0, sets,
      alloc() { for (let i = 0; i < cap; i++) if (!used.has(i)) { used.add(i); return i; } return -1; },
      free(i) { used.delete(i); sets.delete(i); },
      set(i, ...args) { sets.set(i, args); },
      commit() { p.commits++; }, clear() { used.clear(); }, dispose() { p.disposed = true; },
      get live() { return used.size; }
    };
    pools.push(p);
    return p;
  }
  return { THREE: { Group: Obj3, Object3D: Obj3, Mesh: Obj3 }, tier: 'MID', blobs: (cap) => pool(cap), billboards: (o) => pool(o.capacity), pools };
}
function fakeSL3D() {
  const made = [];
  function rig(kind, id) {
    const r = { kind, id, root: new Obj3(), poses: 0, last: null, show: 0, wand: false, disposed: false, tris: 1000, meshes: { toon: {} },
      setPose(p) { r.poses++; r.last = Object.assign({}, p); return r; }, setShow(k) { r.show = k; return r; },
      setWand(on) { r.wand = on; return r; }, dispose() { r.disposed = true; if (r.root.parent) r.root.parent.remove(r.root); } };
    made.push(r);
    return r;
  }
  return { tier: 'MID', petPose: CH, made,
    makeRig: (id, acc) => Object.assign(rig('pet', id), { acc }),
    makeAvatar: (o) => Object.assign(rig('avatar', 'me'), { opts: o }) };
}
function fakeSound() {
  const calls = [];
  const s = (name, vol, step, pan) => calls.push(name);
  s.pet = (id) => calls.push('pet:' + id);
  s.calls = calls;
  return s;
}
function stage(extra) {
  const K = fakeKit(), S = fakeSL3D(), scene = new Obj3(), sound = fakeSound();
  const actors = A.create(K, S, Object.assign({ scene, sound, Brain: B, seed: 'actors' }, extra || {}));
  return { K, S, scene, sound, actors };
}
const ME = { color: '#4FC3F7', avatar: '🦊' };

test('actors: loads in Node without THREE, a classic script that reaches THREE only through the kit', () => {
  const SRC = fs.readFileSync(path.join(__dirname, '..', 'world', 'island3d', 'actors.js'), 'utf8');
  assert.ok(!/window\.THREE|root\.THREE|globalThis\.THREE/.test(SRC), 'never a global THREE');
  assert.ok(!/new THREE\./.test(SRC), 'THREE is reached through K.THREE');
  assert.ok(!/^\s*(import|export)\s/m.test(SRC), 'classic script');
  assert.ok(!/PointLight|SpotLight/.test(SRC), 'no point / spot lights');
  const BSRC = fs.readFileSync(path.join(__dirname, '..', 'world', 'island3d', 'pets-brain.js'), 'utf8');
  assert.ok(!/THREE|document\.|window\.|Math\.random/.test(BSRC.replace(/\/\*[\s\S]*?\*\//g, '')), 'the brain is pure and seeded');
  assert.equal(typeof A.create, 'function');
  assert.throws(() => A.create(null, {}, {}), /kit/);
});

test('actors: sync builds one rig per pet plus the avatar, update poses them from the brain', () => {
  const u = starter(), w = u.world;
  buyer(u, 'a')('pet_dragon');
  const { K, S, scene, actors } = stage();
  assert.equal(actors.group.parent, scene);
  const pets = w.pets.map((p) => ({ id: p.id, acc: p.acc, active: p.id === w.activePet }));
  actors.sync(pets, ME, w);
  assert.equal(S.made.filter((r) => r.kind === 'pet').length, 2);
  assert.equal(S.made.filter((r) => r.kind === 'avatar').length, 1);
  for (let i = 0; i < 200; i++) assert.equal(actors.update(1 / 30, i / 30, 0, null), true);
  for (const r of S.made) {
    assert.ok(r.poses >= 200, r.id + ' posed every frame');
    for (const k of (r.kind === 'pet' ? CH.POSE_KEYS : CH.AV_KEYS)) assert.ok(Number.isFinite(r.last[k]), r.id + ' ' + k);
  }
  for (const p of actors.brain.pets) {
    const r = S.made.find((m) => m.id === p.id);
    assert.ok(near(r.root.position.x, p.x) && near(r.root.position.z, p.z), 'the rig root follows the brain');
  }
  /* the avatar on the house's left entrance cell, facing the camera */
  const av = S.made.find((r) => r.kind === 'avatar'), house = w.placed.find((p) => p.id === 'house_cottage');
  assert.ok(near(av.root.position.x, house.x - 7.5) && near(av.root.position.z, house.y + 2 - 4.5));
  assert.deepEqual(av.opts, { color: '#4FC3F7', emoji: '🦊' });
  /* blob shadows: one per actor, set every frame */
  const blobs = K.pools[0];
  assert.equal(blobs.live, 3);
  assert.ok(blobs.commits >= 200);
  /* hits and anchors */
  const hits = actors.hits([]);
  assert.equal(hits.length, 3);
  assert.ok(hits.every((h) => h.r === 0.4 && h.pickable));
  const an = actors.anchorOf('pet:pet_dragon', {});
  assert.ok(an && an.y > 0.5);
  assert.equal(actors.anchorOf('pet:nobody', {}), null);
  assert.equal(actors.info().pets, 2);
});

test('actors: Showtime gives the avatar its wand and every rig the show mix', () => {
  const u = starter(), w = u.world;
  const { S, actors } = stage();
  actors.sync(petsOf(w), ME, w);
  actors.update(1 / 30, 0, 0.8, null);
  const av = S.made.find((r) => r.kind === 'avatar');
  assert.equal(av.wand, true);
  assert.ok(S.made.every((r) => near(r.show, 0.8)));
  actors.setShow(0);
  assert.equal(av.wand, false);
});

test('actors: tapping a pet hops it, plays its voice and shows an emote; tapping the avatar waves then finger-hearts', () => {
  const u = starter(), w = u.world;
  buyer(u, 'tap')('pet_dragon');
  const { K, sound, actors, S } = stage();
  actors.sync(petsOf(w), ME, w);
  actors.update(1 / 30, 0, 0, null);
  const fx = K.pools[1];
  assert.equal(actors.tap('pet:pet_puppy'), true);
  assert.ok(sound.calls.includes('pet:pet_puppy'), 'voice');
  assert.equal(fx.live, 1, 'one emote sprite');
  const p = actors.brain.pet('pet_puppy'), rig = S.made.find((r) => r.id === 'pet_puppy');
  let maxY = 0;
  for (let i = 0; i < 12; i++) { actors.update(1 / 30, 0, 0, null); maxY = Math.max(maxY, rig.last.y); }
  assert.ok(maxY > 0.08, 'the happy hop lifts the pet: ' + maxY);
  assert.ok(p.happyUntil > actors.brain.now);
  /* the dragon puffs rainbow sparkles instead */
  const before = fx.live;
  actors.tap('pet_dragon');
  assert.ok(fx.live - before >= 5, 'sparkles');
  /* the avatar */
  assert.equal(actors.tap('me'), true);
  const av = S.made.find((r) => r.kind === 'avatar');
  for (let i = 0; i < 10; i++) actors.update(1 / 30, 0, 0, null);
  assert.ok(av.last.armR > 100, 'waving');
  const pops = sound.calls.filter((c) => c === 'pop').length;
  for (let i = 0; i < 30; i++) actors.update(1 / 30, 0, 0, null);
  assert.equal(sound.calls.filter((c) => c === 'pop').length, pops + 1, "the finger-heart 'pop'");
  assert.ok(av.last.armL > 100 && av.last.armR > 100, 'both arms up for the finger-heart');
  for (let i = 0; i < 60; i++) actors.update(1 / 30, 0, 0, null);
  assert.equal(fx.live, 0, 'sprites fade and free their slots');
  assert.equal(actors.tap('pet:nobody'), false);
  /* voice off */
  const s2 = stage({ voice: false });
  s2.actors.sync(petsOf(w), ME, w);
  s2.actors.tap('pet_puppy');
  assert.ok(!s2.sound.calls.some((c) => c.startsWith('pet:')));
});

test('actors: perform drives the trampoline bounce on the rig (lead for models-fun, flip on the last bounce)', () => {
  const u = starter(), w = u.world, buy = buyer(u, 'pf');
  buy('trampoline'); C.place(u, 'trampoline', 5, 7);
  const { actors, S } = stage();
  actors.sync(petsOf(w), ME, w);
  actors.update(1 / 30, 0, 0, null);
  assert.equal(actors.active(), 'pet_puppy');
  assert.equal(actors.petsApi.active(), 'pet_puppy');
  const tr = w.placed.find((p) => p.id === 'trampoline');
  const lead = actors.petsApi.perform('trampoline', tr.uid);
  assert.ok(lead > 0 && lead <= 1.2);
  const rig = S.made.find((r) => r.id === 'pet_puppy');
  let maxPitch = 0, maxRootY = 0;
  for (let t = 0; t < lead + B.BOUNCE.length + 0.6; t += 1 / 60) {
    actors.update(1 / 60, t, 0, null);
    maxPitch = Math.max(maxPitch, rig.last.pitch); maxRootY = Math.max(maxRootY, rig.root.position.y);
  }
  assert.ok(maxPitch > 300, 'the front flip turns the body over: ' + maxPitch);
  assert.ok(maxRootY > 1.3, 'up to the 1.0 u bounce above the mat: ' + maxRootY);
  assert.equal(actors.brain.pet('pet_puppy').state, 'idle');
  assert.equal(actors.perform('trampoline', 'nope'), -1);
});

test('actors: the dance break poses every rig in sync, ends with hearts, sparkles and cheer', () => {
  const u = starter(), w = u.world;
  buyer(u, 'd')('pet_kitten');
  const { actors, S, sound, K } = stage();
  actors.sync(petsOf(w), ME, w);
  actors.update(1 / 30, 0, 1, 0);
  const total = actors.dance(true);
  assert.ok(total > B.DANCE.dur);
  const T0 = actors.brain.danceT0;
  let sawDanceY = false, sawFace = 0;
  const fx = K.pools[1];
  let maxFx = 0;
  for (let i = 0; i < Math.ceil((total + 0.5) * 30); i++) {
    actors.update(1 / 30, 0, 1, null);
    maxFx = Math.max(maxFx, fx.live);
    const t = actors.brain.now - T0;
    if (t > 2.2 * B.DANCE.beat && t < 3.8 * B.DANCE.beat) for (const r of S.made) if (r.kind === 'pet' && r.last.y > 0.05) sawDanceY = true;
    if (t > 7.2 * B.DANCE.beat && t < B.DANCE.dur) sawFace = Math.max(sawFace, ...S.made.filter((r) => r.kind === 'pet').map((r) => r.last.faceCam));
  }
  assert.ok(sawDanceY, 'counts 3–4: hops');
  assert.equal(sawFace, 1, 'count 8: the group pose faces the camera');
  assert.ok(maxFx >= 3, 'hearts and sparkles at the group pose');
  assert.ok(sound.calls.includes('cheer'), "'cheer' at the end");
  assert.equal(actors.info().dance, false);
});

test('actors: edit mode sits the pets still; reduced motion freezes the poses; dispose frees everything', () => {
  const u = starter(), w = u.world;
  const { actors, S, scene, K } = stage();
  actors.sync(petsOf(w), ME, Object.assign({}, w, { mode: 'edit' }));
  for (let i = 0; i < 30; i++) actors.update(1 / 30, 0, 0, null);
  const rig = S.made.find((r) => r.kind === 'pet'), snap = JSON.stringify(rig.last);
  for (let i = 0; i < 60; i++) actors.update(1 / 30, 0, 0, null);
  assert.equal(JSON.stringify(rig.last), snap, 'a still sit');
  assert.equal(actors.active(), null, 'no trampoline runs in edit mode');
  assert.ok(actors.hits([]).every((h) => !h.pickable), 'pets and the avatar are not pickable in edit mode');
  /* reduced motion: still poses, nothing to animate once settled */
  actors.sync(petsOf(w), ME, Object.assign({}, w, { mode: 'play' }));
  actors.setReduced(true);
  const at = actors.brain.pets.map((p) => [p.x, p.z]);
  let idleFrames = 0;
  for (let i = 0; i < 30 * 30; i++) if (!actors.update(1 / 30, 0, 0, null)) idleFrames++;
  actors.brain.pets.forEach((p, k) => assert.deepEqual([p.x, p.z], at[k]));
  assert.ok(idleFrames > 300, 'render on demand: many frames with nothing animating (' + idleFrames + ')');
  /* accessory change rebuilds the rig */
  const n = S.made.length;
  actors.sync([{ id: 'pet_puppy', acc: { hat: 'acc_crown' }, active: true }], ME, w);
  assert.equal(S.made.length, n + 1);
  assert.ok(S.made[n - 2].disposed || S.made.filter((r) => r.kind === 'pet' && r.disposed).length === 1);
  actors.dispose();
  assert.equal(actors.group.parent, null);
  assert.ok(S.made.every((r) => r.disposed));
  assert.ok(K.pools.every((p) => p.disposed));
  assert.equal(scene.children.length, 0);
  actors.dispose();
  assert.equal(actors.update(1 / 30, 0, 0, null), false);
});

test('actors: emote() targets pets, the avatar, all; register() adds SL3D.makeActors', () => {
  const u = starter(), w = u.world;
  buyer(u, 'em')('pet_bunny');
  const { actors, K, S } = stage();
  actors.sync(petsOf(w), ME, w);
  actors.update(1 / 30, 0, 0, null);
  const fx = K.pools[1];
  assert.equal(actors.emote('pet:pet_bunny', 'note'), true);
  assert.equal(fx.live, 1);
  assert.equal(actors.emote('pet_bunny', 'rainbow'), true);
  assert.ok(fx.live > 3, 'rainbow sparkles');
  assert.equal(actors.emote('pet:pet_bunny', 'hop'), true);
  assert.ok(actors.brain.pet('pet_bunny').tapT === actors.brain.now, 'a hop without a voice');
  assert.equal(actors.emote('me', 'star'), true);
  assert.equal(actors.emote('me', 'fingerHeart'), true);
  for (let i = 0; i < 6; i++) actors.update(1 / 30, 0, 0, null);      /* a 0.15 s crossfade */
  const av = S.made.find((r) => r.kind === 'avatar');
  assert.ok(av.last.armL > 140 && av.last.armR > 140, 'finger-heart straight away (no wave first)');
  assert.equal(actors.emote('all', 'heart'), true);
  assert.equal(actors.emote('pet:nobody', 'heart'), false);
  assert.ok(actors.anchorOf('me', {}).y > 0.9, 'the avatar label anchor sits above its head');
  /* no avatar → emote('me') is a no-op */
  actors.sync(petsOf(w), null, w);
  assert.equal(S.made.find((r) => r.kind === 'avatar').disposed, true);
  assert.equal(actors.emote('me', 'heart'), false);
  assert.equal(actors.tap('me'), false);
  /* SL3D registration */
  const defs = {};
  const fake = { defineApi: (name, f) => { defs[name] = f; } };
  assert.equal(A.register(fake), true);
  assert.equal(A.register(fake), false, 'once');
  assert.equal(typeof defs.makeActors, 'function');
  const made = defs.makeActors(fakeKit(), fakeSL3D())({ Brain: B });
  assert.equal(typeof made.update, 'function');
  made.dispose();
});

test('actors: without makeRig / makeAvatar (a failed chunk) it still runs on placeholders', () => {
  const u = starter(), w = u.world, K = fakeKit();
  const calls = [];
  K.G = {
    bean: () => ({ dispose() {} }), puff: () => ({ dispose() {} }), t: (g) => g, paint: (g) => g,
    merge: () => ({ dispose() { calls.push('geo.dispose'); } })
  };
  K.mat = () => ({});
  K.rgb = () => ({});
  const actors = A.create(K, { petPose: CH }, { Brain: B, seed: 'ph' });
  actors.sync(petsOf(w), ME, w);
  for (let i = 0; i < 30; i++) actors.update(1 / 30, 0, 0, null);
  assert.equal(actors.info().pets, 1);
  assert.equal(actors.info().avatar, true);
  actors.dispose();
  assert.equal(calls.length, 2, 'placeholder geometries disposed');
});
