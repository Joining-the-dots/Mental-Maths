/* node --test tests/   (Node 22+) */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../world/world-core.js');

function kid(points, extra) {
  const u = Object.assign({ name: 'Mia', points: points, pointsEarned: points + 500 }, extra || {});
  C.ensureWorld(u);
  C.grantStarter(u, Date.parse('2026-10-02T09:00:00Z'));
  return u;
}
let txN = 0;
const tx = () => 'tx_test_' + (++txN) + '_' + Math.random().toString(36).slice(2, 8);

/* a fake persisted storage shared by several "tabs" */
function makeStorage(initialState) {
  let raw = JSON.stringify(initialState);
  return {
    get raw() { return raw; },
    adapterFor(tab) {
      return {
        read: () => JSON.parse(raw),
        write: (st) => { tab.state = st; raw = JSON.stringify(st); }
      };
    },
    breakWrites() { this.adapterFor = (tab) => ({ read: () => JSON.parse(raw), write: () => { throw new Error('quota'); } }); },
    silentlyDropWrites() { this.adapterFor = (tab) => ({ read: () => JSON.parse(raw), write: () => {} }); }
  };
}
/* a promise mutex standing in for navigator.locks */
function makeLock() {
  let chain = Promise.resolve();
  return (fn) => { const run = chain.then(fn); chain = run.catch(() => {}); return run; };
}

test('catalogue: stable unique ids, integer prices, valid references', () => {
  const ids = new Set();
  for (const it of C.CATALOG) {
    assert.ok(!ids.has(it.id), 'duplicate id ' + it.id);
    ids.add(it.id);
    assert.ok(Number.isInteger(it.price) && it.price >= 0, it.id + ' price');
    for (const r of (it.requires || [])) assert.ok(C.item(r), it.id + ' requires unknown ' + r);
    for (const r of (it.includes || [])) assert.ok(C.item(r), it.id + ' includes unknown ' + r);
    if (C.isPlaceable(it)) assert.ok(Array.isArray(it.fp), it.id + ' needs a footprint');
  }
});

test('game unlocks include their first course/arena (no second purchase needed to play)', () => {
  for (const it of C.CATALOG.filter(i => i.kind === 'attraction')) {
    const inc = (it.includes || []).map(C.item);
    const playable = inc.some(i => i.kind === 'variant') || it.game === 'penalty';
    assert.ok(playable, it.id + ' must include a course/track/arena');
    if (it.game === 'penalty') assert.ok(inc.some(i => i.slot === 'stadium') && inc.some(i => i.slot === 'ball'));
  }
});

test('starter: granted exactly once, free, legal layout, balance untouched', () => {
  const u = { name: 'Josh', points: 333, pointsEarned: 999 };
  assert.equal(C.grantStarter(u, 1), true);
  const placedCount = u.world.placed.length;
  assert.equal(placedCount, C.STARTER.placed.length, 'every starter object placed');
  assert.equal(C.grantStarter(u, 2), false);
  assert.equal(u.world.placed.length, placedCount);
  assert.equal(u.points, 333);
  assert.equal(u.pointsEarned, 999);
  assert.equal(C.owns(u.world, 'att_course'), true);
  assert.equal(C.owns(u.world, 'pet_puppy'), true);
  assert.equal(u.world.activePet, 'pet_puppy');
  /* every starter placement is legal against the others */
  for (const p of u.world.placed) assert.ok(C.canPlace(u.world, p.id, p.x, p.y, p.uid).ok, p.id + ' illegal');
});

test('purchase: sufficient points debits exactly, grants ownership, writes ledger', () => {
  const u = kid(500);
  const r = C.purchase(u, 'trampoline', { tx: tx() });
  assert.equal(r.ok, true);
  assert.equal(u.points, 50);
  assert.equal(u.pointsEarned, 1000, 'lifetime points never reduced');
  assert.equal(C.ownedCount(u.world, 'trampoline'), 1);
  const e = u.world.ledger[u.world.ledger.length - 1];
  assert.equal(e.item, 'trampoline'); assert.equal(e.price, 450); assert.equal(e.bal, 50);
  assert.equal(u.world.spent, 450);
});

test('purchase: exact balance works and leaves zero; one point short fails cleanly', () => {
  const u = kid(450);
  assert.equal(C.purchase(u, 'trampoline', { tx: tx() }).ok, true);
  assert.equal(u.points, 0);
  const v = kid(449);
  const r = C.purchase(v, 'trampoline', { tx: tx() });
  assert.equal(r.ok, false); assert.equal(r.code, 'insufficient'); assert.equal(r.need, 1);
  assert.equal(v.points, 449); assert.equal(C.ownedCount(v.world, 'trampoline'), 0);
});

test('purchase: never goes negative even with corrupted balances', () => {
  const u = kid(100);
  u.points = 99.7;            /* corrupted non-integer */
  const r = C.purchase(u, 'flower_tulip', { tx: tx() });
  assert.equal(r.ok, true);
  assert.ok(Number.isInteger(u.points) && u.points >= 0);
  u.points = -5;
  assert.equal(C.purchase(u, 'flower_tulip', { tx: tx() }).code, 'insufficient');
});

test('purchase: repeated clicks / retries with the same tx charge once', () => {
  const u = kid(1000);
  const t = tx();
  const a = C.purchase(u, 'fountain', { tx: t });
  const b = C.purchase(u, 'fountain', { tx: t });
  const c = C.purchase(u, 'fountain', { tx: t });
  assert.equal(a.ok, true); assert.equal(b.ok, true); assert.equal(b.replay, true); assert.equal(c.replay, true);
  assert.equal(u.points, 500);
  assert.equal(u.world.ledger.filter(e => e.item === 'fountain').length, 1);
  /* same tx reused for a different item is refused, not double-spent */
  assert.equal(C.purchase(u, 'swing', { tx: t }).code, 'tx_conflict');
  assert.equal(u.points, 500);
});

test('purchase: unique item cannot be bought twice; repeatable decorations stack', () => {
  const u = kid(2000);
  assert.equal(C.purchase(u, 'pet_kitten', { tx: tx() }).ok, true);
  assert.equal(C.purchase(u, 'pet_kitten', { tx: tx() }).code, 'already_owned');
  const before = C.ownedCount(u.world, 'flower_tulip');
  C.purchase(u, 'flower_tulip', { tx: tx() }); C.purchase(u, 'flower_tulip', { tx: tx() });
  assert.equal(C.ownedCount(u.world, 'flower_tulip'), before + 2);
  assert.equal(C.storedCount(u.world, 'flower_tulip'), 2, 'new copies land in storage');
});

test('purchase: manipulated item ids, prices and missing tx are rejected', () => {
  const u = kid(5000);
  assert.equal(C.purchase(u, 'att_pitch; points=0', { tx: tx() }).code, 'unknown_item');
  assert.equal(C.purchase(u, '__proto__', { tx: tx() }).code, 'unknown_item');
  assert.equal(C.purchase(u, 'constructor', { tx: tx() }).code, 'unknown_item');
  assert.equal(C.purchase(u, 'att_course', { tx: tx() }).code, 'not_for_sale', 'starter items are not sold');
  assert.equal(C.purchase(u, 'ball_classic', { tx: tx() }).code, 'not_for_sale', 'included items are not sold');
  /* a caller-supplied price is ignored entirely */
  const r = C.purchase(u, 'att_pitch', { tx: tx(), price: 1 });
  assert.equal(r.ok, true); assert.equal(r.price, 1200); assert.equal(u.points, 3800);
  assert.equal(C.purchase(u, 'tree_oak', {}).code, 'bad_tx');
  assert.equal(C.purchase(u, 'tree_oak', { tx: '<script>' }).code, 'bad_tx');
});

test('purchase: prerequisites are enforced and explained', () => {
  const u = kid(5000);
  const r = C.purchase(u, 'ball_gold', { tx: tx() });
  assert.equal(r.code, 'locked'); assert.equal(r.needs, 'att_pitch'); assert.match(r.reason, /Penalty Pitch/);
  assert.equal(C.itemState(u, 'ball_gold').state, 'locked');
  assert.equal(C.purchase(u, 'att_pitch', { tx: tx() }).ok, true);
  assert.equal(C.purchase(u, 'ball_gold', { tx: tx() }).ok, true);
});

test('attraction purchase is immediately usable: includes granted, auto-placed with clear entrance', () => {
  const u = kid(3000);
  const r = C.purchase(u, 'att_kart', { tx: tx() });
  assert.equal(r.ok, true);
  assert.ok(C.owns(u.world, 'track_loop') && C.owns(u.world, 'kart_red'));
  const inst = u.world.placed.find(p => p.id === 'att_kart');
  assert.ok(inst, 'placed on purchase');
  assert.ok(C.canPlace(u.world, 'att_kart', inst.x, inst.y, inst.uid).ok);
  assert.equal(C.selected(u.world, 'kart'), 'kart_red');
});

test('ledger, balance and ownership stay consistent across many purchases', () => {
  const u = kid(4000);
  const start = u.points;
  ['flower_sun', 'flower_sun', 'tree_palm', 'trampoline', 'acc_crown', 'roof_blue', 'path_wood', 'path_wood'].forEach(id => {
    assert.equal(C.purchase(u, id, { tx: tx() }).ok, true, id);
  });
  const paid = u.world.ledger.filter(e => e.tx !== 'starter').reduce((s, e) => s + e.price, 0);
  assert.equal(start - u.points, paid);
  assert.equal(u.world.spent, paid);
  for (const e of u.world.ledger.filter(e => e.tx !== 'starter')) assert.ok(C.owns(u.world, e.item));
});

test('commit protocol: one tab, stale memory is ignored, read-back verified', () => {
  const tabA = { state: null };
  const st = { activeUser: 'Mia', users: { Mia: kid(800) } };
  const storage = makeStorage(st);
  /* a stale in-memory copy thinks Mia has 5000 — storage (truth) says 800 */
  const res = C.transactPurchase(storage.adapterFor(tabA), 'Mia', 'att_pitch', { tx: tx() });
  assert.equal(res.code, 'insufficient');
  const ok = C.transactPurchase(storage.adapterFor(tabA), 'Mia', 'fountain', { tx: tx() });
  assert.equal(ok.ok, true);
  assert.equal(JSON.parse(storage.raw).users.Mia.points, 300);
});

test('commit protocol: profile switched mid-purchase is refused; wrong profile id refused', () => {
  const st = { activeUser: 'Josh', users: { Mia: kid(900), Josh: kid(10) } };
  const storage = makeStorage(st);
  const r = C.transactPurchase(storage.adapterFor({}), 'Mia', 'fountain', { tx: tx() });
  assert.equal(r.code, 'profile_changed');
  assert.equal(JSON.parse(storage.raw).users.Mia.points, 900);
  assert.equal(C.transactPurchase(storage.adapterFor({}), 'Nobody', 'fountain', { tx: tx() }).code, 'no_profile');
});

test('commit protocol: failed or lost writes never announce success', () => {
  const st = { activeUser: 'Mia', users: { Mia: kid(900) } };
  const s1 = makeStorage(st); s1.breakWrites();
  assert.equal(C.transactPurchase(s1.adapterFor({}), 'Mia', 'fountain', { tx: tx() }).code, 'write_failed');
  assert.equal(JSON.parse(s1.raw).users.Mia.points, 900);
  const s2 = makeStorage(st); s2.silentlyDropWrites();
  assert.equal(C.transactPurchase(s2.adapterFor({}), 'Mia', 'fountain', { tx: tx() }).code, 'not_saved');
  assert.equal(JSON.parse(s2.raw).users.Mia.points, 900);
});

test('commit protocol: a committed purchase whose response is lost is recovered by retrying the same tx', () => {
  const st = { activeUser: 'Mia', users: { Mia: kid(900) } };
  const storage = makeStorage(st);
  const t = tx();
  C.transactPurchase(storage.adapterFor({}), 'Mia', 'fountain', { tx: t });   /* response "lost" */
  const retry = C.transactPurchase(storage.adapterFor({}), 'Mia', 'fountain', { tx: t });
  assert.equal(retry.ok, true); assert.equal(retry.replay, true);
  const saved = JSON.parse(storage.raw).users.Mia;
  assert.equal(saved.points, 400);
  assert.equal(saved.world.ledger.filter(e => e.item === 'fountain').length, 1);
});

test('concurrency: two tabs buying at the same moment never double-spend', async () => {
  const st = { activeUser: 'Mia', users: { Mia: kid(500) } };
  const storage = makeStorage(st);
  const lock = makeLock();
  const tabA = {}, tabB = {};
  /* both tabs can afford the fountain alone (500) but not twice */
  const [a, b] = await Promise.all([
    lock(() => C.transactPurchase(storage.adapterFor(tabA), 'Mia', 'fountain', { tx: tx() })),
    lock(() => C.transactPurchase(storage.adapterFor(tabB), 'Mia', 'trampoline', { tx: tx() }))
  ]);
  assert.equal(a.ok, true);
  assert.equal(b.ok, false); assert.equal(b.code, 'insufficient');
  const saved = JSON.parse(storage.raw).users.Mia;
  assert.equal(saved.points, 0);
  assert.equal(C.ownedCount(saved.world, 'trampoline'), 0);
});

test('concurrency: many interleaved purchases across tabs keep ledger = balance change', async () => {
  const st = { activeUser: 'Mia', users: { Mia: kid(1000) } };
  const storage = makeStorage(st);
  const lock = makeLock();
  const jobs = [];
  for (let i = 0; i < 40; i++) jobs.push(lock(() => C.transactPurchase(storage.adapterFor({}), 'Mia', i % 2 ? 'path_wood' : 'flower_tulip', { tx: tx() })));
  const results = await Promise.all(jobs);
  const saved = JSON.parse(storage.raw).users.Mia;
  const paid = saved.world.ledger.filter(e => e.tx !== 'starter').reduce((s, e) => s + e.price, 0);
  assert.equal(1000 - saved.points, paid);
  assert.ok(saved.points >= 0);
  assert.equal(results.filter(r => r.ok).length, saved.world.ledger.filter(e => e.tx !== 'starter').length);
});

test('placement: boundaries, overlap, entrances, locked land', () => {
  const u = kid(3000);
  const w = u.world;
  assert.equal(C.canPlace(w, 'tree_oak', 0, 0).ok, false, 'sea');
  assert.equal(C.canPlace(w, 'tree_oak', 14, 4).ok, false, 'Beach Cove is locked');
  assert.match(C.canPlace(w, 'tree_oak', 6, 2).reason, /already there/, 'on the house');
  assert.match(C.canPlace(w, 'tree_oak', 6, 4).reason, /doorway/, 'blocking the house door');
  assert.equal(C.canPlace(w, 'path_stone', 6, 4).ok, true, 'paths may go in a doorway');
  assert.equal(C.canPlace(w, 'att_pitch', 10, 7).ok, false, 'off the edge');
  C.purchase(u, 'land_cove', { tx: tx() });
  assert.equal(C.canPlace(w, 'tree_oak', 14, 4).ok, true, 'unlocked land is usable');
});

test('placement: place, move, store, re-place without repurchase; house/attractions cannot be stored', () => {
  const u = kid(500);
  C.purchase(u, 'tree_blossom', { tx: tx() });
  const spot = C.findSpot(u.world, 'tree_blossom');
  const r = C.place(u, 'tree_blossom', spot.x, spot.y);
  assert.equal(r.ok, true);
  assert.equal(C.storedCount(u.world, 'tree_blossom'), 0);
  assert.equal(C.place(u, 'tree_blossom', spot.x, spot.y).ok, false, 'no second copy to place');
  const spot2 = C.findSpot(u.world, 'tree_blossom', 3, 6);
  assert.equal(C.place(u, 'tree_blossom', spot2.x, spot2.y, r.uid).ok, true, 'moved');
  assert.equal(C.store(u, r.uid).ok, true);
  assert.equal(C.storedCount(u.world, 'tree_blossom'), 1, 'kept in storage, not lost');
  assert.equal(C.ownedCount(u.world, 'tree_blossom'), 1);
  const pointsBefore = u.points;
  assert.equal(C.place(u, 'tree_blossom', spot.x, spot.y).ok, true, 're-placed from storage');
  assert.equal(u.points, pointsBefore, 'no repurchase');
  const house = u.world.placed.find(p => p.id === 'house_cottage');
  assert.equal(C.store(u, house.uid).ok, false);
});

test('normalize: repairs impossible states without losing purchases', () => {
  const u = kid(0);
  const w = u.world;
  w.owned.flower_tulip = 2;
  w.placed.push({ uid: 'x1', id: 'flower_tulip', x: 0, y: 0 });            /* in the sea */
  w.placed.push({ uid: 'x2', id: 'flower_tulip', x: 6, y: 2 });            /* on the house */
  w.placed.push({ uid: 'x3', id: 'future_item_v9', x: 5, y: 5 });          /* unknown future item */
  w.owned.trampoline = 7;                                                  /* unique owned 7x */
  w.sel.roof = 'roof_castle';                                              /* not owned */
  w.goal = 'att_course';                                                   /* owned starter */
  C.normalize(u);
  assert.ok(!w.placed.some(p => p.uid === 'x1' || p.uid === 'x2'), 'illegal placements returned to storage');
  assert.equal(C.ownedCount(w, 'flower_tulip'), 2, 'ownership kept');
  assert.ok(w.placed.some(p => p.uid === 'x3'), 'unknown future data is kept, not deleted');
  assert.equal(w.owned.trampoline, 1);
  assert.equal(w.sel.roof, undefined);
  assert.equal(w.goal, null);
  for (const p of w.placed) if (C.item(p.id)) assert.ok(C.canPlace(w, p.id, p.x, p.y, p.uid).ok);
});

test('retired items: leave the shop but owners keep them', () => {
  const u = kid(500);
  C.purchase(u, 'swing', { tx: tx() });
  const it = C.item('swing');
  it.retired = true;
  try {
    assert.equal(C.purchase(kid(500), 'swing', { tx: tx() }).code, 'retired');
    assert.ok(!C.shopItems().some(i => i.id === 'swing'));
    C.normalize(u);
    assert.equal(C.owns(u.world, 'swing'), true);
  } finally { it.retired = false; }
});

test('savings goal: set, progress, cleared on purchase; owned uniques refused', () => {
  const u = kid(300);
  assert.equal(C.setGoal(u, 'att_pitch').ok, true);
  const g = C.goalProgress(u);
  assert.equal(g.pct, 25); assert.equal(g.need, 900); assert.equal(g.ready, false);
  assert.equal(C.setGoal(u, 'att_course').ok, false);
  u.points = 1200;
  assert.equal(C.goalProgress(u).ready, true);
  C.purchase(u, 'att_pitch', { tx: tx() });
  assert.equal(u.world.goal, null);
});

test('pet names: friendly validation', () => {
  assert.equal(C.validatePetName('  Sir   Wiggles ').name, 'Sir Wiggles');
  assert.equal(C.validatePetName('Zoë').ok, true);
  assert.equal(C.validatePetName("O'Malley-Jones").ok, true);
  assert.equal(C.validatePetName('').ok, false);
  assert.equal(C.validatePetName('A'.repeat(15)).ok, false);
  assert.equal(C.validatePetName('<b>hi</b>').ok, false);
  assert.equal(C.validatePetName('R2D2').ok, false);
  assert.equal(C.validatePetName('Poo').ok, false);
  assert.equal(C.validatePetName('Mr Fart Face').ok, false);
  assert.equal(C.validatePetName('Hello').ok, true, 'contains "hell" but is a whole different word');
  assert.equal(C.validatePetName('Cassie').ok, true, 'contains "ass" inside a name');
  const u = kid(0);
  assert.equal(C.renamePet(u, 'pet_puppy', 'Rocket').ok, true);
  assert.equal(C.petById(u.world, 'pet_puppy').name, 'Rocket');
  assert.equal(C.renamePet(u, 'pet_dragon', 'Smoky').ok, false, 'not owned');
});

test('accessories and cosmetics: only owned items equip/select', () => {
  const u = kid(1000);
  assert.equal(C.equipAccessory(u, 'pet_puppy', 'acc_crown').ok, false);
  C.purchase(u, 'acc_crown', { tx: tx() });
  assert.equal(C.equipAccessory(u, 'pet_puppy', 'acc_crown').on, true);
  assert.equal(C.equipAccessory(u, 'pet_puppy', 'acc_crown').on, false, 'tap again to take off');
  assert.equal(C.select(u, 'roof_castle').ok, false);
  assert.equal(C.selected(u.world, 'roof'), 'roof_red');
});

test('arcade time: limits, warning, round gate and grace ceiling', () => {
  const cfg = { dailyMinutes: 10 };
  assert.equal(C.arcadeStatus(null, 9999).limited, false);
  assert.equal(C.arcadeStatus({ dailyMinutes: 0 }, 9999).limited, false, '0 = no limit');
  const s1 = C.arcadeStatus(cfg, 300);
  assert.equal(s1.leftSec, 300); assert.equal(s1.exhausted, false); assert.equal(s1.warn, false);
  assert.equal(C.arcadeStatus(cfg, 560).warn, true);
  const gate = C.roundGate(C.arcadeStatus(cfg, 590));
  assert.equal(gate.allowed, true);
  assert.equal(gate.hardStopAtUsed, 600 + C.ARCADE.graceMaxSec, 'finishing overrun is bounded');
  assert.equal(C.roundGate(C.arcadeStatus(cfg, 600)).allowed, false, 'no new round once used up');
  assert.equal(C.roundGate(C.arcadeStatus(cfg, 700)).allowed, false, 'restarting during grace is refused');
});

test('arcade time: day key follows the family timezone, not the device', () => {
  const t = Date.parse('2026-10-02T23:30:00Z');       /* 00:30 BST in London on the 3rd */
  assert.equal(C.dayKey(t, 'Europe/London'), '2026-10-03');
  assert.equal(C.dayKey(t, 'America/New_York'), '2026-10-02');
  const u = kid(0);
  C.arcadeAdd(u, '2026-10-02', 125.4);
  C.arcadeAdd(u, '2026-10-02', 60);
  assert.equal(C.arcadeUsed(u.world, '2026-10-02'), 185);
  for (let d = 1; d <= 20; d++) C.arcadeAdd(u, '2026-09-' + String(d).padStart(2, '0'), 10);
  assert.ok(Object.keys(u.world.arcade.days).length <= C.ARCADE.keepDays, 'old days pruned');
});

test('personal bests: validated, per game+variant, never touch points', () => {
  const u = kid(777);
  const earnedBefore = u.pointsEarned;
  assert.equal(C.recordResult(u, 'course', 'meadow', { score: 1200 }).isPB, true);
  assert.equal(C.recordResult(u, 'course', 'meadow', { score: 900 }).isPB, false);
  assert.equal(C.recordResult(u, 'course', 'beach', { score: 400 }).isPB, true, 'separate per course');
  assert.equal(C.recordResult(u, 'kart', 'track_loop', { finished: true, ms: 61000 }).isPB, true);
  assert.equal(C.recordResult(u, 'kart', 'track_loop', { finished: true, ms: 65000 }).isPB, false, 'lower is better');
  assert.equal(C.recordResult(u, 'kart', 'track_loop', { finished: true, ms: 100 }).ok, false, 'impossible time rejected');
  assert.equal(C.recordResult(u, 'kart', 'track_loop', { finished: false, ms: 50000 }).ok, false, 'DNF not recorded');
  assert.equal(C.recordResult(u, 'penalty', 'std', { score: 99999 }).ok, false, 'impossible score rejected');
  assert.equal(u.points, 777); assert.equal(u.pointsEarned, earnedBefore);
});

test('merge of two forks: each island purchase is paid exactly once', () => {
  /* the account bought a fountain (500); the signed-out guest copy bought a kitten (600) */
  const base = kid(2000);
  const n = JSON.parse(JSON.stringify(base));
  const g = JSON.parse(JSON.stringify(base));
  C.purchase(n, 'fountain', { tx: 'tx_account_1' });
  g.points += 300;                                  /* guest also earned 300 */
  C.purchase(g, 'pet_kitten', { tx: 'tx_guest_1' });
  const m = C.mergeWorlds(n, g);
  assert.ok(C.owns(m.world, 'fountain') && C.owns(m.world, 'pet_kitten'));
  assert.equal(m.points, 2000 + 300 - 500 - 600);
  /* merging the same fork twice is idempotent */
  const n2 = { points: m.points, world: m.world };
  const again = C.mergeWorlds(n2, g);
  assert.equal(again.points, m.points);
});

test('merge: only the guest copy has an island — its spending is not refunded by the stale account balance', () => {
  const acct = { points: 1400, pointsEarned: 3000 };               /* stale account, never opened My Island */
  const g = kid(1500);
  C.purchase(g, 'att_pitch', { tx: 'tx_guest_pitch' });            /* 1500 -> 300 */
  const m = C.mergeWorlds(acct, g);
  assert.ok(C.owns(m.world, 'att_pitch'));
  assert.equal(m.points, 1500 - 1200, 'the bigger pre-spend balance minus the spend');
});

test('merge: personal bests and arcade minutes come from both sides, whichever is newer', () => {
  const n = kid(500), g = kid(500);
  C.recordResult(n, 'kart', 'track_loop', { finished: true, ms: 50000 });
  C.recordResult(g, 'kart', 'track_loop', { finished: true, ms: 58000 });
  C.recordResult(g, 'course', 'course_meadow', { score: 900 });
  n.world.arcade.days['2026-10-01'] = 300; g.world.arcade.days['2026-10-01'] = 120; g.world.arcade.days['2026-10-02'] = 60;
  g.world.updatedAt = '2099-01-01T00:00:00.000Z';                  /* guest copy is the base */
  const m = C.mergeWorlds(n, g);
  assert.equal(m.world.pb['kart:track_loop'].ms, 50000, 'faster account time kept');
  assert.equal(m.world.pb['course:course_meadow'].score, 900, 'guest-only PB kept');
  assert.deepEqual(m.world.arcade.days, { '2026-10-01': 300, '2026-10-02': 60 });
});

/* ---- regressions from the independent review (2026-10-02) ---- */
test('save that silently fails: live memory is rolled back, and the retry charges once', () => {
  /* the real app adapter mirrors the write into live memory, then saveState() swallows storage errors */
  const live = { activeUser: 'Mia', users: { Mia: kid(900) } };
  let disk = JSON.stringify(live), diskWorks = false;
  const adapter = () => {
    let prev = null;
    return {
      read: () => JSON.parse(disk),
      write: (st) => { prev = {}; for (const k of Object.keys(st)) { prev[k] = live[k]; live[k] = st[k]; } if (diskWorks) disk = JSON.stringify(live); },
      rollback: () => { if (!prev) return; for (const k of Object.keys(prev)) live[k] = prev[k]; prev = null; }
    };
  };
  const t = tx();
  const r1 = C.transactPurchase(adapter(), 'Mia', 'fountain', { tx: t });
  assert.equal(r1.code, 'not_saved');
  assert.equal(live.users.Mia.points, 900, 'memory not left showing the debit');
  assert.equal(C.owns(live.users.Mia.world, 'fountain'), false, 'memory not left owning the item');
  diskWorks = true;
  const r2 = C.transactPurchase(adapter(), 'Mia', 'fountain', { tx: t });   /* "Try again" reuses the tx */
  assert.equal(r2.ok, true);
  assert.equal(JSON.parse(disk).users.Mia.points, 400);
  assert.equal(live.users.Mia.points, 400);
});

test('merge: a one-off item bought on BOTH forks is kept once and paid for once', () => {
  const base = kid(1000);
  const n = JSON.parse(JSON.stringify(base)), g = JSON.parse(JSON.stringify(base));
  C.purchase(n, 'pet_kitten', { tx: 'tx_fork_n_kitten', ms: Date.parse('2026-10-02T10:00:00Z') });
  C.purchase(g, 'pet_kitten', { tx: 'tx_fork_g_kitten', ms: Date.parse('2026-10-02T11:00:00Z') });
  const m = C.mergeWorlds(n, g);
  assert.equal(m.points, 400);
  assert.equal(m.world.owned.pet_kitten, 1);
  assert.equal(m.world.ledger.filter(e => e.item === 'pet_kitten').length, 1);
  assert.equal(C.mergeWorlds({ points: m.points, world: m.world }, g).points, 400, 'stable on re-merge');
});

test('goals: a locked item can never be the savings goal (points at the prerequisite instead)', () => {
  const u = kid(5000);
  const r = C.setGoal(u, 'track_beach');
  assert.equal(r.ok, false); assert.equal(r.code, 'locked'); assert.equal(r.needs, 'att_kart');
  assert.equal(C.setGoal(u, 'att_kart').ok, true);
  /* an old save that already has a locked goal never claims "you can buy it" */
  u.world.goal = 'track_beach';
  assert.equal(C.goalProgress(u).ready, false);
});

test('pet names: the curly apostrophe tablets type is accepted', () => {
  assert.deepEqual(C.validatePetName('Mia’s pup'), { ok: true, name: "Mia's pup" });
});

test('arcade: the status carries its hard-stop ceiling so a limit that arrives mid-round still ends it', () => {
  const st = C.arcadeStatus({ dailyMinutes: 10, tz: 'Europe/London' }, 0);
  assert.equal(st.hardStopAtUsed, 600 + C.ARCADE.graceMaxSec);
  assert.equal(C.arcadeStatus(null, 0).hardStopAtUsed, Infinity);
});

/* ---- free test mode (window.SL_WORLD_TRIAL) ---- */
test('test mode: items cost nothing, ⭐ and lifetime points untouched, each row tagged', () => {
  const u = kid(30);                                       /* far too few ⭐ for anything big */
  const earned = u.pointsEarned;
  const r = C.purchase(u, 'att_kart', { tx: tx(), trial: true });
  assert.equal(r.ok, true); assert.equal(r.price, 0); assert.equal(r.trial, true);
  assert.equal(u.points, 30); assert.equal(u.pointsEarned, earned); assert.equal(u.world.spent, 0);
  assert.ok(C.owns(u.world, 'att_kart') && C.owns(u.world, 'track_loop'), 'attraction + its included track');
  const row = u.world.ledger[u.world.ledger.length - 1];
  assert.equal(row.trial, true); assert.equal(row.price, 0); assert.equal(row.list, 1500);
  assert.equal(C.itemState(u, 'pet_dragon', { trial: true }).state, 'affordable');
  assert.equal(C.itemState(u, 'pet_dragon').state, 'short', 'without test mode the real price applies');
});

test('test mode keeps every other rule: unknown, locked, one-off and starter items are still refused', () => {
  const u = kid(0);
  assert.equal(C.purchase(u, 'not_a_thing', { tx: tx(), trial: true }).code, 'unknown_item');
  assert.equal(C.purchase(u, 'ball_gold', { tx: tx(), trial: true }).code, 'locked');
  assert.equal(C.purchase(u, 'house_cottage', { tx: tx(), trial: true }).code, 'not_for_sale');
  assert.equal(C.purchase(u, 'fountain', { tx: tx(), trial: true }).ok, true);
  assert.equal(C.purchase(u, 'fountain', { tx: tx(), trial: true }).code, 'already_owned');
  assert.equal(u.points, 0);
});

test('test mode caps per-copy items at 20 each; a real purchase is still charged normally', () => {
  const u = kid(100);
  let got = 0;
  for (let i = 0; i < 30; i++) if (C.purchase(u, 'rock_mossy', { tx: tx(), trial: true }).ok) got++;
  assert.equal(C.ensureWorld(u).owned.rock_mossy, 20); assert.equal(got, 20);
  assert.equal(C.itemState(u, 'rock_mossy', { trial: true }).state, 'capped');
  assert.equal(C.purchase(u, 'flower_sun', { tx: tx() }).price, 50);
  assert.equal(u.points, 50);
});

test('test mode merges: free rows never move a balance', () => {
  const base = kid(500);
  const n = JSON.parse(JSON.stringify(base)), g = JSON.parse(JSON.stringify(base));
  C.purchase(n, 'pet_dragon', { tx: 'tx_trial_n_dragon', trial: true });
  C.purchase(g, 'att_pitch', { tx: 'tx_trial_g_pitch', trial: true });
  C.purchase(g, 'fountain', { tx: 'tx_real_g_fountain' });          /* one real spend: 500 → 0 */
  const m = C.mergeWorlds(n, g);
  assert.equal(m.points, 0);
  assert.ok(C.owns(m.world, 'pet_dragon') && C.owns(m.world, 'att_pitch') && C.owns(m.world, 'fountain'));
});

test('merge: a one-off bought for real on one fork and got free on the other keeps the PAID row', () => {
  const base = kid(1000);
  const n = JSON.parse(JSON.stringify(base)), g = JSON.parse(JSON.stringify(base));
  C.purchase(n, 'pet_kitten', { tx: 'tx_trial_first', trial: true, now: Date.parse('2026-10-02T09:00:00Z') });   /* free, earlier */
  C.purchase(g, 'pet_kitten', { tx: 'tx_paid_later', now: Date.parse('2026-10-02T10:00:00Z') });                  /* paid 600 */
  const m = C.mergeWorlds(n, g);
  const rows = m.world.ledger.filter(e => e.item === 'pet_kitten');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].tx, 'tx_paid_later', 'the real payment stays on record');
  assert.equal(m.points, 400);
});

/* ---- Encore City v2: home shapes and city buildings (additive catalogue) ---- */
const NEW_IDS = ['shape_cottage', 'shape_loft', 'wall_concrete', 'wall_gallery', 'wall_graphite', 'wall_midnight', 'door_glass',
  'detail_neon', 'shape_villa', 'shape_tower', 'shape_dome', 'acc_beanie', 'acc_cap', 'acc_headphones', 'acc_visor', 'acc_hoodie',
  'bld_photobooth', 'bld_boba', 'bld_ledtower', 'bld_recording', 'bld_dance', 'bld_rooftop', 'bld_stage'];
const BLD = C.CATALOG.filter(i => i.cat === 'city');
const SHAPES = C.CATALOG.filter(i => i.slot === 'shape');
/* a save made before v2: the same starter grant, without the two included shapes */
function v1Kid(points) {
  const u = kid(points);
  delete u.world.owned.shape_cottage; delete u.world.owned.shape_loft;
  return u;
}

test('v2 catalogue: 23 additive ids with the planned prices; 104 in all; the 21 paid ones total 9,870', () => {
  assert.equal(C.CATALOG.length, 104);
  for (const id of NEW_IDS) assert.ok(C.item(id), id);
  const price = { shape_villa: 650, shape_tower: 950, shape_dome: 1250, bld_photobooth: 250, bld_boba: 350, bld_ledtower: 450,
    bld_recording: 550, bld_dance: 950, bld_rooftop: 1100, bld_stage: 1450, wall_concrete: 120, wall_gallery: 120, wall_graphite: 150,
    wall_midnight: 180, door_glass: 160, detail_neon: 250, acc_beanie: 120, acc_cap: 160, acc_headphones: 180, acc_visor: 220, acc_hoodie: 260 };
  for (const [id, p] of Object.entries(price)) assert.equal(C.item(id).price, p, id);
  const paid = NEW_IDS.map(C.item).filter(i => !i.included);
  assert.equal(paid.length, 21);
  assert.equal(paid.reduce((s, i) => s + i.price, 0), 9870);
  for (const s of SHAPES) { assert.equal(s.kind, 'style'); assert.equal(s.cat, 'home'); }
  assert.deepEqual(SHAPES.map(s => s.id), ['shape_cottage', 'shape_loft', 'shape_villa', 'shape_tower', 'shape_dome']);
  assert.deepEqual(C.item('house_cottage').includes, ['shape_cottage', 'shape_loft'], 'the only edit to an existing entry');
  assert.equal(C.DEFAULTS.shape, 'shape_loft');
  assert.equal(C.STARTER.owned.shape_cottage, 1); assert.equal(C.STARTER.owned.shape_loft, 1);
  const acts = { bld_photobooth: 'snap', bld_boba: 'serve', bld_ledtower: 'screen', bld_recording: 'record', bld_dance: 'dance', bld_rooftop: 'hangout', bld_stage: 'encore' };
  for (const b of BLD) { assert.equal(b.kind, 'fun', b.id); assert.equal(b.act, acts[b.id], b.id); }
  assert.deepEqual(BLD.map(b => b.fp.join('x')), ['1x1', '2x1', '1x1', '2x1', '2x2', '2x2', '3x2']);
});

test('v2 (a): an old save gains both shapes once on normalize — layout, points and ledger untouched', () => {
  const u = v1Kid(900);
  const placed = JSON.stringify(u.world.placed), ledger = JSON.stringify(u.world.ledger), sel = JSON.stringify(u.world.sel);
  assert.equal(C.owns(u.world, 'shape_cottage'), false);
  assert.equal(C.selected(u.world, 'shape'), 'shape_loft', 'the first frame already draws the default shape');
  assert.equal(C.normalize(u), true, 'the one-time grant is a change');
  assert.ok(C.owns(u.world, 'shape_cottage') && C.owns(u.world, 'shape_loft'));
  assert.equal(C.normalize(u), false, 'stable afterwards');
  assert.equal(JSON.stringify(u.world.placed), placed, 'layout untouched');
  assert.equal(JSON.stringify(u.world.ledger), ledger, 'no ledger row for the free shapes');
  assert.equal(JSON.stringify(u.world.sel), sel);
  assert.equal(u.points, 900); assert.equal(u.world.spent, 0);
  /* a fresh profile owns both from the starter grant */
  const fresh = kid(0);
  assert.ok(C.owns(fresh.world, 'shape_cottage') && C.owns(fresh.world, 'shape_loft'));
  assert.equal(C.normalize(fresh), false);
});

test('v2 (b): included shapes are never sold; a paid shape debits, auto-selects and switches back', () => {
  const u = kid(5000);
  for (const id of ['shape_cottage', 'shape_loft']) {
    assert.equal(C.purchase(u, id, { tx: tx() }).code, 'not_for_sale', id);
    assert.ok(!C.shopItems().some(i => i.id === id), id + ' hidden from the shop');
    assert.equal(C.setGoal(u, id).ok, false, id + ' cannot be a goal');
  }
  const r = C.purchase(u, 'shape_dome', { tx: tx() });
  assert.equal(r.ok, true); assert.equal(u.points, 3750);
  assert.equal(C.selected(u.world, 'shape'), 'shape_dome', 'buying selects it');
  assert.equal(C.select(u, 'shape_cottage').ok, true);
  assert.equal(C.selected(u.world, 'shape'), 'shape_cottage', 'one tap back to the cottage');
  assert.equal(C.select(u, 'shape_villa').ok, false, 'an unowned shape cannot be selected');
  C.purchase(u, 'roof_castle', { tx: tx() });
  C.select(u, 'shape_dome');
  assert.equal(C.selected(u.world, 'roof'), 'roof_castle'); assert.equal(C.selected(u.world, 'shape'), 'shape_dome', 'roof and shape are independent');
  const house = u.world.placed.find(p => p.id === 'house_cottage');
  assert.ok(C.canPlace(u.world, 'house_cottage', house.x, house.y, house.uid).ok, 'the 2×2 footprint is unchanged');
});

test('v2 (c): an unowned shape selection (old fork or merge) is dropped and falls back to the default', () => {
  const u = kid(0);
  u.world.sel.shape = 'shape_villa';
  assert.equal(C.normalize(u), true);
  assert.equal(u.world.sel.shape, undefined);
  assert.equal(C.selected(u.world, 'shape'), 'shape_loft');
});

test('v2 (d): mergeWorlds keeps a shape bought on one fork and a building on the other, each paid once', () => {
  const base = kid(3000);
  const a = JSON.parse(JSON.stringify(base)), b = JSON.parse(JSON.stringify(base));
  C.purchase(a, 'shape_villa', { tx: 'tx_fork_villa' });
  C.purchase(b, 'bld_stage', { tx: 'tx_fork_stage' });
  const m = C.mergeWorlds(a, b);
  assert.ok(C.owns(m.world, 'shape_villa') && C.owns(m.world, 'bld_stage'));
  assert.ok(C.owns(m.world, 'shape_cottage') && C.owns(m.world, 'shape_loft'));
  assert.equal(m.points, 3000 - 650 - 1450);
  assert.equal(C.mergeWorlds({ points: m.points, world: m.world }, b).points, m.points, 'stable on re-merge');
});

test('v2 (e): buildings are unique, storable and placeable; each lands in storage', () => {
  const u = kid(9000);
  for (const b of BLD) {
    assert.equal(C.isRepeatable(b), false, b.id); assert.ok(C.isStorable(b) && C.isPlaceable(b), b.id);
    assert.equal(C.purchase(u, b.id, { tx: tx() }).ok, true, b.id);
    assert.equal(C.storedCount(u.world, b.id), 1, b.id + ' waits in storage');
    assert.ok(!u.world.placed.some(p => p.id === b.id), b.id + ' is not auto-placed');
  }
  assert.equal(C.purchase(u, 'bld_stage', { tx: tx() }).code, 'already_owned');
  assert.equal(u.points, 9000 - 5100);
  /* store and re-place without repurchase */
  const spot = C.findSpot(u.world, 'bld_boba');
  const r = C.place(u, 'bld_boba', spot.x, spot.y);
  assert.equal(r.ok, true);
  assert.equal(C.store(u, r.uid).ok, true);
  assert.equal(C.storedCount(u.world, 'bld_boba'), 1);
});

test('v2 (f): each building has a legal spot on a fresh starter island without moving anything', () => {
  for (const b of BLD) {
    const u = kid(9000);
    const before = JSON.stringify(u.world.placed);
    C.purchase(u, b.id, { tx: tx() });
    const spot = C.findSpot(u.world, b.id);
    assert.ok(spot, b.id + ' fits on the starter island');
    assert.equal(C.place(u, b.id, spot.x, spot.y).ok, true, b.id);
    assert.equal(JSON.stringify(u.world.placed.filter(p => p.id !== b.id)), before, b.id + ' moved nothing');
  }
});

test('v2 (g): the stage crowd pit and the dance floor refuse a tree but accept a path', () => {
  for (const id of ['bld_stage', 'bld_dance']) {
    const u = kid(9000);
    C.purchase(u, id, { tx: tx() });
    const s = C.findSpot(u.world, id);
    assert.equal(C.place(u, id, s.x, s.y).ok, true, id);
    const ent = C.entranceCells(C.item(id), s.x, s.y).map(k => k.split(',').map(Number));
    assert.equal(ent.length, C.item(id).fp[0], id + ' entrance row');
    C.purchase(u, 'tree_oak', { tx: tx() }); C.purchase(u, 'path_wood', { tx: tx() });
    for (const [ex, ey] of ent) {
      if (!C.landSet(u.world)[ex + ',' + ey]) continue;
      const tree = C.canPlace(u.world, 'tree_oak', ex, ey);
      assert.equal(tree.ok, false, id + ' keeps ' + ex + ',' + ey + ' clear');
      if (!C.occupancy(u.world).occ[ex + ',' + ey]) {
        assert.match(tree.reason, /doorway/);
        assert.equal(C.canPlace(u.world, 'path_wood', ex, ey).ok, true, id + ' path at ' + ex + ',' + ey);
      }
    }
  }
});

test('v2 (h): a building saved in an illegal spot goes back to storage, never lost', () => {
  const u = kid(9000);
  C.purchase(u, 'bld_rooftop', { tx: tx() });
  u.world.placed.push({ uid: 'zz1', id: 'bld_rooftop', x: 0, y: 0 });
  assert.equal(C.normalize(u), true);
  assert.ok(!u.world.placed.some(p => p.id === 'bld_rooftop'));
  assert.equal(C.storedCount(u.world, 'bld_rooftop'), 1);
  /* an old client (blind to buildings) could put decor on a building's cells: the next
     normalize sends one of the two back to storage and both stay owned */
  C.purchase(u, 'tree_oak', { tx: tx() });
  const s = C.findSpot(u.world, 'bld_rooftop');
  assert.equal(C.place(u, 'bld_rooftop', s.x, s.y).ok, true);
  u.world.placed.push({ uid: 'zz2', id: 'tree_oak', x: s.x + 1, y: s.y + 1 });
  const ownedBefore = JSON.stringify(u.world.owned);
  assert.equal(C.normalize(u), true);
  assert.equal(JSON.stringify(u.world.owned), ownedBefore, 'nothing is lost');
  const seen = {};
  for (const p of u.world.placed) {
    if (!C.item(p.id)) continue;
    assert.ok(C.canPlace(u.world, p.id, p.x, p.y, p.uid).ok, p.id + ' legal');
    for (const c of C.fpCells(C.item(p.id), p.x, p.y)) { assert.ok(!seen[c], 'one thing per cell ' + c); seen[c] = 1; }
  }
  assert.equal(C.placedCount(u.world, 'bld_rooftop') + C.storedCount(u.world, 'bld_rooftop'), 1);
});

test('v2 (i): test mode makes all 21 paid new items free, rows tagged, ⭐ untouched; included shapes never make rows', () => {
  const u = kid(10);
  const rows = u.world.ledger.length;
  for (const id of NEW_IDS) {
    const it = C.item(id);
    const r = C.purchase(u, id, { tx: tx(), trial: true });
    if (it.included) { assert.equal(r.code, 'not_for_sale', id); continue; }
    assert.equal(r.ok, true, id); assert.equal(r.price, 0, id);
    const row = u.world.ledger[u.world.ledger.length - 1];
    assert.equal(row.trial, true); assert.equal(row.list, it.price);
  }
  assert.equal(u.world.ledger.length, rows + 21);
  assert.equal(u.points, 10); assert.equal(u.world.spent, 0);
});

test('v2 (j): the max island — every placeable id (one each, biggest first) plus 20 paths fits on all land', () => {
  const u = kid(0);
  const w = u.world;
  for (const it of C.CATALOG) {
    if (it.starter || it.included || (C.isRepeatable(it) && C.ownedCount(w, it.id) > 0)) continue;
    C.purchase(u, it.id, { tx: tx(), trial: true });
  }
  assert.equal(Object.keys(C.landSet(w)).length, 111, 'all three regions unlocked');
  const size = (i) => i.fp[0] * i.fp[1] + (i.entrance ? i.fp[0] : 0);
  const todo = C.CATALOG.filter(i => C.isPlaceable(i) && i.kind !== 'path' && C.storedCount(w, i.id) > 0).sort((a, b) => size(b) - size(a));
  const fails = [];
  for (const it of todo) {
    let ok = false;
    for (let y = 0; y < C.ROWS && !ok; y++) for (let x = 0; x < C.COLS && !ok; x++) if (C.canPlace(w, it.id, x, y).ok) ok = C.place(u, it.id, x, y).ok;
    if (!ok) fails.push(it.id);
  }
  assert.deepEqual(fails, []);
  for (const b of BLD) assert.ok(w.placed.some(p => p.id === b.id), b.id + ' placed');
  let paths = w.placed.filter(p => C.item(p.id).kind === 'path').length;
  for (let k = 0; k < 40 && paths < 20; k++) {
    if (!C.storedCount(w, 'path_stone')) C.purchase(u, 'path_stone', { tx: tx(), trial: true });
    const sp = C.findSpot(w, 'path_stone');
    if (sp && C.place(u, 'path_stone', sp.x, sp.y).ok) paths++;
  }
  assert.ok(paths >= 20, 'paths ' + paths);
  for (const p of w.placed) assert.ok(C.canPlace(w, p.id, p.x, p.y, p.uid).ok, p.id + ' legal');
  assert.equal(C.normalize(u), false, 'the full island is already a normal state');
});
