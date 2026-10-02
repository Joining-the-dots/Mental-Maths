/* node --test tests/   (Node 22+)
   My Island 3D QA lab (island architecture chunk 16): the pure helpers in
   island3d_lab_core.js (URL state, showcase plan + layout, acts, fixture worlds,
   view model, budgets, look checks) and static checks on island3d_lab.html
   (same import map + loader as index.html, script order, dev-only). */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const C = require('../world/world-core.js');
const L = require('../world/world-look.js');
const M = require('../world/island3d/motion.js');
const S = require('../world/island3d/stage.js');
const T = require('../world/island3d/tier.js');
const LAB = require('../island3d_lab_core.js');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n');   /* autocrlf checkouts */
const NONE = { model: () => false, rig: false, env: false };
const ALL = { model: () => true, rig: true, env: true };

/* ---------------- URL state ---------------- */
test('parseParams: defaults, ?item implies item mode, junk is rejected', () => {
  const d = LAB.parseParams('');
  assert.equal(d.mode, 'showcase'); assert.equal(d.item, null); assert.equal(d.tier, null);
  assert.equal(d.show, 0); assert.equal(d.reduced, null); assert.equal(d.idle, true); assert.equal(d.spin, true);
  assert.equal(d.sound, false); assert.equal(d.fixture, 'starter'); assert.equal(d.clip, 'idle'); assert.deepEqual(d.acc, {});
  const i = LAB.parseParams('?item=tree_oak&tier=low&show=2&reduced=0&wire=1');
  assert.equal(i.mode, 'item'); assert.equal(i.item, 'tree_oak'); assert.equal(i.tier, 'LOW');
  assert.equal(i.show, 1, 'show is clamped to 0..1'); assert.equal(i.reduced, false); assert.equal(i.wire, true);
  const bad = LAB.parseParams('?mode=nope&item=<script>&tier=ULTRA&fixture=huge&clip=moonwalk&acc=hat:crown,neck:acc_bow&st={bad');
  assert.equal(bad.mode, 'showcase'); assert.equal(bad.item, null); assert.equal(bad.tier, null);
  assert.equal(bad.fixture, 'starter'); assert.equal(bad.clip, 'idle'); assert.deepEqual(bad.acc, { neck: 'acc_bow' }); assert.equal(bad.st, null);
  assert.equal(LAB.parseParams('?mode=pets&item=tree_oak').mode, 'pets', 'an explicit mode wins');
});

test('toQuery round-trips through parseParams and omits defaults', () => {
  assert.equal(LAB.toQuery(LAB.parseParams('')), '');
  const states = [
    '?item=house_cottage&st=' + encodeURIComponent(JSON.stringify({ roof: 'roof_castle', details: { detail_flag: true } })) + '&tier=MID&show=0.5',
    '?mode=pets&clip=dance&acc=hat:acc_crown,back:acc_cape&reduced=1',
    '?mode=island&fixture=max&engine=preview&outlines=0&shadows=1&idle=0&spin=0&sound=1&wire=1',
    '?mode=karts&sim=no3d&fresh=1'
  ];
  states.forEach((q) => {
    const s = LAB.parseParams(q);
    assert.deepEqual(LAB.parseParams(LAB.toQuery(s)), s, q);
  });
});

/* ---------------- styles: the lab's st is exactly what SL3D.make hands build() ---------------- */
test('styleFor mirrors stage.js resolveSt for every CATALOG id', () => {
  const sts = [{}, { wall: 'wall_pink', roof: 'roof_castle', door: 'door_gold', details: { detail_lights: true } },
    { course: 'course_snow', ball: 'ball_gold', stadium: 'stadium_night', kart: 'kart_blue' }, { acc: { hat: 'acc_crown' } }];
  C.CATALOG.forEach((it) => sts.forEach((st) => {
    assert.deepEqual(LAB.styleFor(it.id, st, C.DEFAULTS), S.resolveSt(it.id, st, C.DEFAULTS), it.id);
  }));
});

/* ---------------- showcase ---------------- */
test('showcaseSections: every CATALOG id exactly once, plus the house combos', () => {
  [NONE, ALL].forEach((has) => {
    const secs = LAB.showcaseSections(C, L, has);
    const ids = [], combos = [];
    secs.forEach((s) => s.entries.forEach((e) => (e.combo ? combos : ids).push(e.id)));
    assert.equal(ids.length, C.CATALOG.length);
    assert.deepEqual(ids.slice().sort(), C.CATALOG.map((i) => i.id).sort());
    assert.equal(combos.length, LAB.COMBOS.length);
    assert.ok(!secs.some((s) => s.name === 'Other'), 'no id falls through to "Other"');
    const keys = secs.flatMap((s) => s.entries.map((e) => e.key));
    assert.equal(new Set(keys).size, keys.length, 'entry keys are unique');
  });
  LAB.COMBOS.forEach((c) => {
    const st = L.resolveStyle('house_cottage', c.st);
    ['wall', 'roof', 'door'].forEach((k) => assert.ok(L.LOOK[st[k]], c.key + ' ' + k));
    st.details.forEach((d) => assert.ok(/^detail_/.test(d)));
  });
});

test('plan: styles, course variants and stadia show on their base item; rigs and env when present', () => {
  const p = (id, has) => LAB.plan(id, C, L, has);
  const roof = p('roof_castle', NONE);
  assert.equal(roof.via, 'base'); assert.equal(roof.base, 'house_cottage'); assert.deepEqual(roof.st, { roof: 'roof_castle' }); assert.deepEqual(roof.fp, [2, 2]);
  assert.deepEqual(p('detail_chimney', NONE).st, { details: { detail_chimney: true } });
  assert.equal(p('course_candy', NONE).base, 'att_course');
  assert.equal(p('stadium_snow', NONE).base, 'att_pitch'); assert.deepEqual(p('stadium_snow', NONE).fp, [3, 2]);
  assert.equal(p('roof_castle', ALL).via, 'make', 'a style with its own model is made directly');
  assert.deepEqual(p('roof_castle', ALL).fp, [2, 2], '…still on the house footprint');
  assert.equal(p('pet_dragon', NONE).via, 'make'); assert.equal(p('pet_dragon', ALL).via, 'rig');
  const cape = p('acc_cape', ALL);
  assert.equal(cape.via, 'rig'); assert.equal(cape.base, 'pet_puppy'); assert.deepEqual(cape.st, { acc: { back: 'acc_cape' } });
  assert.equal(p('land_cove', NONE).via, 'land'); assert.equal(p('land_cove', NONE).missing, true); assert.equal(p('land_cove', ALL).missing, false);
  assert.equal(p('tree_oak', NONE).missing, true); assert.equal(p('tree_oak', ALL).missing, false);
  assert.deepEqual(p('att_pitch', NONE).fp, [3, 2]);
});

function overlaps(a, b) {
  return Math.abs(a.x - b.x) * 2 < a.w + b.w - 1e-9 && Math.abs(a.z - b.z) * 2 < a.d + b.d - 1e-9;
}
test('layoutGrid: no footprints overlap, everything inside the bounds, one header per section', () => {
  const secs = LAB.showcaseSections(C, L, NONE);
  [{}, { flow: false }, { maxWidth: 12, gap: 0.5 }].forEach((o) => {
    const lay = LAB.layoutGrid(secs, o);
    assert.equal(lay.items.length, secs.reduce((n, s) => n + s.entries.length, 0));
    assert.equal(lay.headers.length, secs.length);
    for (let i = 0; i < lay.items.length; i++) {
      const a = lay.items[i];
      assert.ok(a.x - a.w / 2 >= lay.bounds.minX - 1e-9 && a.x + a.w / 2 <= lay.bounds.maxX + 1e-9, 'x in bounds');
      assert.ok(a.z - a.d / 2 >= lay.bounds.minZ - 1e-9 && a.z + a.d / 2 <= lay.bounds.maxZ + 1e-9, 'z in bounds');
      for (let j = i + 1; j < lay.items.length; j++) assert.ok(!overlaps(a, lay.items[j]), a.entry.key + ' vs ' + lay.items[j].entry.key);
    }
    assert.ok(Math.abs(lay.bounds.minX + lay.bounds.maxX) < 1e-9 && Math.abs(lay.bounds.minZ + lay.bounds.maxZ) < 1e-9, 'centred on the origin');
    assert.ok(lay.bounds.width <= (o.maxWidth || 20) + 1e-9);
  });
  assert.deepEqual(LAB.layoutGrid([], {}).items, []);
});

/* ---------------- acts and pickers ---------------- */
test('actsFor: every CATALOG act maps to SLMotion timelines; controller acts exist', () => {
  C.CATALOG.forEach((it) => {
    const a = LAB.actsFor(it.id, C, M);
    a.item.concat(a.controller).forEach((n) => assert.ok(M.ACTS[n], it.id + ' → ' + n));
    if (it.act) assert.ok(a.item.length > 0, it.id + ' has an item act');
  });
  assert.deepEqual(LAB.actsFor('lantern', C, M).item, ['glowOn', 'glowOff']);
  assert.deepEqual(LAB.actsFor('house_cottage', C, M).item, ['home', 'homeClose']);
  assert.deepEqual(LAB.actsFor('att_kart', C, M).item, ['kartRev']);
  assert.deepEqual(LAB.actsFor('bunting', C, M).item, ['bunting']);
  assert.deepEqual(LAB.actsFor('pet_bunny', C, M).item, ['hop']);
  assert.deepEqual(LAB.actsFor('bench', C, M).item, []);
});

test('styleOptions and accBySlot come from the catalogue slots', () => {
  const h = LAB.styleOptions('house_cottage', C);
  assert.deepEqual(h.map((o) => o.slot), ['wall', 'roof', 'door', 'details']);
  assert.ok(h[3].multi); assert.equal(h[3].options.length, 4);
  assert.deepEqual(LAB.styleOptions('roof_blue', C).map((o) => o.slot), ['wall', 'roof', 'door', 'details']);
  assert.deepEqual(LAB.styleOptions('att_pitch', C).map((o) => o.slot), ['ball', 'stadium']);
  assert.deepEqual(LAB.styleOptions('kart_gold', C)[0].options, LAB.KARTS.slice().sort((a, b) => C.CATALOG.findIndex((i) => i.id === a) - C.CATALOG.findIndex((i) => i.id === b)));
  assert.deepEqual(LAB.styleOptions('pet_kitten', C).map((o) => o.slot), ['acc.hat', 'acc.neck', 'acc.face', 'acc.back']);
  assert.deepEqual(LAB.styleOptions('tree_oak', C), []);
  const a = LAB.accBySlot(C);
  assert.deepEqual(a, { hat: ['acc_partyhat', 'acc_crown'], neck: ['acc_bow', 'acc_scarf'], face: ['acc_shades'], back: ['acc_cape'] });
  assert.deepEqual(LAB.PETS.slice().sort(), C.CATALOG.filter((i) => i.kind === 'pet').map((i) => i.id).sort());
  assert.deepEqual(LAB.KARTS.slice().sort(), C.CATALOG.filter((i) => i.slot === 'kart').map((i) => i.id).sort());
});

/* ---------------- fixture worlds ---------------- */
function assertLegal(u) {
  const w = u.world;
  w.placed.forEach((p) => {
    const r = C.canPlace(w, p.id, p.x, p.y, p.uid);
    assert.ok(r.ok, u.name + ': ' + p.id + ' at ' + p.x + ',' + p.y + ' — ' + r.reason);
  });
}
test('starter fixture = the real starter grant', () => {
  const u = LAB.starterWorld(C);
  assert.deepEqual(u.errors, []);
  assert.equal(u.world.placed.length, C.STARTER.placed.length);
  assert.deepEqual(u.world.placed.map((p) => [p.id, p.x, p.y]), C.STARTER.placed.map((p) => [p.id, p.x, p.y]));
  assertLegal(u);
});

test('max island: all land, every placeable id, 20 paths, 4 pets wearing every accessory', () => {
  const u = LAB.maxWorld(C), w = u.world;
  assert.deepEqual(u.errors, []);
  assert.deepEqual(C.unlockedRegions(w).sort(), ['cove', 'home', 'meadow']);
  C.CATALOG.filter((i) => C.isPlaceable(i)).forEach((i) => assert.ok(C.placedCount(w, i.id) >= 1, i.id + ' placed'));
  assert.equal(w.placed.filter((p) => C.item(p.id).kind === 'path').length, 20);
  assert.equal(C.inventory(w).length, 0, 'nothing left in storage');
  assert.equal(w.pets.length, 4);
  const worn = new Set();
  w.pets.forEach((p) => { assert.equal(Object.keys(p.acc).length, 4, p.id); Object.values(p.acc).forEach((a) => worn.add(a)); });
  assert.deepEqual([...worn].sort(), C.CATALOG.filter((i) => i.kind === 'acc').map((i) => i.id).sort());
  assert.equal(C.selected(w, 'roof'), 'roof_candy');
  assert.deepEqual(Object.keys(w.details).sort(), ['detail_chimney', 'detail_flag', 'detail_lights', 'detail_windowbox']);
  assert.equal(u.points, 0, 'free test mode: no points were needed or spent');
  assertLegal(u);
});

test('all-81 showcase: every id owned, each placeable placed exactly once', () => {
  const u = LAB.showcaseWorld(C), w = u.world;
  assert.deepEqual(u.errors, []);
  C.CATALOG.forEach((i) => assert.ok(C.owns(w, i.id), i.id + ' owned'));
  C.CATALOG.filter((i) => C.isPlaceable(i)).forEach((i) => assert.equal(C.placedCount(w, i.id), 1, i.id));
  assert.equal(w.placed.length, C.CATALOG.filter((i) => C.isPlaceable(i)).length);
  assert.equal(C.selected(w, 'roof'), 'roof_castle');
  assertLegal(u);
});

test('fixtures are deterministic', () => {
  LAB.FIXTURES.forEach((n) => assert.deepEqual(LAB.fixture(n, C), LAB.fixture(n, C), n));
  assert.equal(LAB.fixture('nope', C).world.placed.length, C.STARTER.placed.length);
});

test('islandView: the view model rewards-world hands SLIsland3D.sync', () => {
  const u = LAB.maxWorld(C), w = u.world;
  const v = LAB.islandView(C, u, { lit: { p5: true }, newUids: ['p9'] });
  assert.equal(v.placed.length, w.placed.length);
  assert.deepEqual(Object.keys(v.placed[0]).sort(), ['id', 'uid', 'x', 'y']);
  assert.deepEqual(v.style, {
    wall: 'wall_pink', roof: 'roof_candy', door: 'door_gold', details: w.details,
    course: C.selected(w, 'course'), ball: C.selected(w, 'ball'), stadium: C.selected(w, 'stadium'), kart: C.selected(w, 'kart')
  });
  assert.deepEqual(v.unlocked.sort(), ['cove', 'home', 'meadow']);
  assert.equal(v.pets.length, 4); assert.equal(v.pets.filter((p) => p.active).length, 1);
  assert.deepEqual(v.lit, { p5: true }); assert.deepEqual(v.newUids, ['p9']); assert.equal(v.mode, 'play');
  v.style.details.detail_flag = false; v.pets[0].acc.hat = 'x';
  assert.equal(w.details.detail_flag, true, 'the view is a copy'); assert.notEqual(w.pets[0].acc.hat, 'x');
});

test('petSpots: free land cells near the door, never the avatar cell', () => {
  ['starter', 'max', 'showcase'].forEach((n) => {
    const u = LAB.fixture(n, C), w = u.world, land = C.landSet(w), occ = C.occupancy(w).occ;
    const house = w.placed.filter((p) => p.id === 'house_cottage')[0];
    const avatar = C.entranceCells(C.item('house_cottage'), house.x, house.y)[0];
    const spots = LAB.petSpots(C, u, 4);
    assert.equal(spots.length, 4);
    const keys = spots.map((s) => s.c + ',' + s.r);
    assert.equal(new Set(keys).size, 4);
    keys.forEach((k) => { assert.ok(land[k], k + ' on land'); assert.ok(!occ[k], k + ' free'); assert.notEqual(k, avatar); });
  });
});

/* ---------------- budgets and checks ---------------- */
test('budgetRows judges island / game scenes and always judges programs', () => {
  const b = T.budget('MID', 2);
  const rows = (st, scope) => Object.fromEntries(LAB.budgetRows(st, b, scope).map((r) => [r.key, r]));
  const island = rows({ calls: 101, tris: 110000, programs: 9, geometries: 40, textures: 6, fps: 58 }, 'island');
  assert.equal(island.calls.level, 'over'); assert.equal(island.calls.limit, 100);
  assert.equal(island.tris.level, 'warn'); assert.equal(island.programs.level, 'ok'); assert.equal(island.fps.level, 'ok');
  const game = rows({ calls: 95, tris: 20000, programs: 17, fps: 25 }, 'game');
  assert.equal(game.calls.limit, b.gameDrawCalls); assert.equal(game.calls.level, 'over');
  assert.equal(game.programs.level, 'over'); assert.equal(game.fps.level, 'over');
  const info = rows({ calls: 400, tris: 900000, programs: 10, fps: 45 }, 'info');
  assert.equal(info.calls.level, 'info'); assert.equal(info.tris.level, 'info'); assert.equal(info.programs.level, 'ok'); assert.equal(info.fps.level, 'warn');
  assert.equal(rows({}, 'island').fps.level, 'info');
});

test('checkItem flags placeholders, budgets, height, footprint, pivots and anchors', () => {
  const look = L.LOOK;
  const ok = LAB.checkItem({ id: 'tree_oak', look: look.tree_oak, fp: [1, 1], size: { w: 1.0, h: 1.6, d: 1.0 }, low: { w: 0.4, d: 0.4 },
    tris: 800, parts: 3, staticMats: 1, pivots: ['sway'], anchors: ['top'] }, L);
  assert.deepEqual(ok.map((c) => c.level), ['ok']);
  const ph = LAB.checkItem({ id: 'windmill', look: look.windmill, placeholder: true, tris: 300 }, L);
  assert.equal(ph[0].level, 'over'); assert.match(ph[0].msg, /placeholder/);
  const bad = LAB.checkItem({ id: 'windmill', look: look.windmill, fp: [1, 1], size: { w: 1.4, h: 1.2, d: 0.8 }, low: { w: 0.95, d: 0.5 },
    tris: 1500, parts: 7, staticMats: 5, pivots: [], anchors: [] }, L);
  const msgs = bad.map((c) => c.level + ':' + c.msg).join('\n');
  assert.match(msgs, /over:1500 tris > budget 1400/); assert.match(msgs, /warn:7 parts/); assert.match(msgs, /warn:5 static materials/);
  assert.match(msgs, /warn:height 1\.20/); assert.match(msgs, /below 1 u it spans 0\.95/); assert.match(msgs, /overhangs/);
  assert.match(msgs, /over:missing pivot "spin" \(the act drives it\)/); assert.match(msgs, /warn:missing anchor "top"/);
  /* the house only needs a detail's pivot when that detail is on */
  const house = { id: 'house_cottage', look: look.house_cottage, fp: [2, 2], size: { w: 1.7, h: 2.3, d: 1.7 }, low: { w: 1.7, d: 1.7 },
    tris: 2000, parts: 4, staticMats: 2, pivots: ['door'], anchors: ['top', 'door', 'spot'], st: { details: {} } };
  assert.deepEqual(LAB.checkItem(house, L).map((c) => c.level), ['ok']);
  house.st = { details: { detail_chimney: true } };
  assert.match(LAB.checkItem(house, L)[0].msg, /missing pivot "emitter"/);
});

test('fpsMeter and memoryVerdict', () => {
  const f = LAB.fpsMeter(4);
  [16, 17, 5000, -1, 16, 17, 33].forEach((ms) => f.push(ms));
  assert.equal(f.count, 4, 'pauses and junk are ignored; window of 4');
  assert.ok(Math.abs(f.avgMs() - (17 + 16 + 17 + 33) / 4) < 1e-9);
  assert.ok(Math.abs(f.fps() - 1000 / f.avgMs()) < 1e-9);
  f.reset(); assert.equal(f.fps(), 0);
  assert.equal(LAB.memoryVerdict({ geometries: 40, textures: 6 }, { geometries: 40, textures: 5 }).ok, true);
  const leak = LAB.memoryVerdict({ geometries: 40, textures: 6 }, { geometries: 52, textures: 6 });
  assert.equal(leak.ok, false); assert.equal(leak.rows[0].delta, 12);
});

/* ---------------- the page ---------------- */
const HTML = read('island3d_lab.html');
const INDEX = read('index.html');
function importMap(html) { return JSON.parse(/<script type="importmap">([\s\S]*?)<\/script>/.exec(html)[1]); }
function loaderBlock(html) {
  const m = /window\.slLoad3D = function \(\) \{[\s\S]*?\n {2}\};/.exec(html);
  return m && m[0];
}
test('lab page: same import map and slLoad3D loader as index.html', () => {
  assert.deepEqual(importMap(HTML), importMap(INDEX));
  assert.match(importMap(HTML).imports.three, /three@0\.170\.0\//);
  assert.ok(loaderBlock(INDEX), 'index.html loader found');
  assert.equal(loaderBlock(HTML), loaderBlock(INDEX), 'verbatim copy of the loader');
});

test('lab page: loads the app scripts in order, then stage.js, and awaits ensure()', () => {
  const order = ['world/world-core.js', 'world/world-art.js', 'world/world-look.js', 'world/games/fx.js', 'world/sound.js'];
  const at = order.map((f) => HTML.indexOf("'" + f + "'"));
  at.forEach((i, k) => assert.ok(i > 0, order[k] + ' listed'));
  for (let k = 1; k < at.length; k++) assert.ok(at[k] > at[k - 1], 'order: ' + order[k]);
  assert.ok(HTML.indexOf("'world/island3d/stage.js'") > at[at.length - 1]);
  assert.match(HTML, /SLIsland3D\.ensure\(/);
  assert.match(HTML, /window\.labShot = labShot/);
  assert.match(HTML, /three\/addons\/controls\/OrbitControls\.js/);
  assert.ok(HTML.indexOf('src="island3d_lab_core.js"') > 0);
});

test('lab page: every inline script compiles, never touches window.THREE, uses only the bible fonts', () => {
  const re = /<script(?![^>]*type="importmap")(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g;
  let m, n = 0;
  while ((m = re.exec(HTML))) { assert.doesNotThrow(() => new vm.Script(m[1], { filename: 'inline' + n })); n++; }
  assert.equal(n, 2);
  assert.ok(!/window\.THREE/.test(HTML), 'THREE only via SL3D.THREE');
  assert.ok(!/\bimport\s+[^('"\n]*\bfrom\s*['"]|\bimport\s+['"]|\bexport\s+(default|function|var|const|\{)/.test(HTML), 'classic scripts: no ES import/export statements');
  const fonts = /fonts\.googleapis\.com\/css2\?([^"]+)"/.exec(HTML)[1];
  fonts.split('&').filter((p) => /^family=/.test(p)).forEach((p) => assert.match(p, /^family=(Fredoka|Baloo\+2|Bagel\+Fat\+One)(:|$)/));
});

test('lab is dev-only: not linked from the app and not precached', () => {
  assert.ok(!/island3d_lab/.test(INDEX), 'index.html never links the lab');
  assert.ok(!/island3d_lab/.test(read('sw.js')), 'sw.js never precaches the lab');
  assert.ok(!/island3d_lab/.test(read('world/rewards-world.js')));
  assert.match(HTML, /<meta name="robots" content="noindex, nofollow"/);
});
