'use strict';
/* My Island 3D — the look table (world/world-look.js) */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const L = require('../world/world-look.js');
const C = require('../world/world-core.js');
const ART = require('../world/world-art.js').SLWorldArt;
const Kart = require('../world/games/kart.js');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const BIBLE = JSON.parse(read('docs/island3d/art-bible.json'));
const BIBLE2 = JSON.parse(read('docs/island3d/art-bible.v2.json'));
const ART_SRC = read('world/world-art.js');
const COURSE_SRC = read('world/games/pet-course.js');
const lower = (o) => JSON.parse(JSON.stringify(o).toLowerCase());
const evalLiteral = (src) => vm.runInNewContext('(' + src + ')', {});
const HEX = /^#[0-9A-F]{6}$/;
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const ROOFS = C.CATALOG.filter((x) => x.slot === 'roof').map((x) => x.id);
const SHAPES = C.CATALOG.filter((x) => x.slot === 'shape').map((x) => x.id);
const BUILDINGS = C.CATALOG.filter((x) => x.cat === 'city').map((x) => x.id);
const DETAILS = C.CATALOG.filter((x) => x.slot === 'detail').map((x) => x.id);

/* ---------------- coverage and schema ---------------- */
test('look: every CATALOG id has a LOOK entry and every LOOK id is in CATALOG', () => {
  const ids = C.CATALOG.map((it) => it.id).sort();
  assert.deepEqual(Object.keys(L.LOOK).sort(), ids);
  assert.equal(ids.length, 104);
  assert.equal(L.LOOK_VERSION, 2, 'Encore City busts the photocard cache');
});

test('look: every entry has the full schema with sane types', () => {
  for (const [id, e] of Object.entries(L.LOOK)) {
    assert.ok(L.KINDS.includes(e.kind), id + ' kind ' + e.kind);
    assert.ok(typeof e.h === 'number' && e.h >= 0 && e.h <= 2.9, id + ' h');
    assert.ok(e.colors && Object.keys(e.colors).length > 0, id + ' colors');
    assert.equal(typeof e.mats, 'object');
    assert.ok(Array.isArray(e.pivots) && Array.isArray(e.anchors) && Array.isArray(e.loops) && Array.isArray(e.perCopy), id + ' arrays');
    assert.ok(e.actPivot === null || typeof e.actPivot === 'string', id + ' actPivot');
    assert.ok(e.idle === null || typeof e.idle.type === 'string', id + ' idle');
    for (const k of ['neon', 'halo', 'led', 'chase']) assert.ok(k in e.show, id + ' show.' + k);
    assert.ok(Array.isArray(e.show.neon));
    assert.equal(typeof e.organic, 'boolean');
    assert.equal(typeof e.outline, 'boolean');
    assert.ok(['batch', 'rig', 'socket', 'part', 'scene', 'env'].includes(e.instancing), id + ' instancing');
    assert.ok(e.hit === null || (Array.isArray(e.hit) && e.hit.length === 3), id + ' hit');
    assert.ok(Number.isInteger(e.tris) && e.tris >= 0, id + ' tris');
    for (const p of e.perCopy) assert.ok(typeof p === 'string');
  }
});

test('look: placed items batch; pets rig; accessories socket on their CATALOG slot', () => {
  for (const it of C.CATALOG) {
    const e = L.LOOK[it.id];
    if (C.isPlaceable(it)) {
      assert.equal(e.instancing, 'batch', it.id);
      assert.ok(e.anchors.includes('top'), it.id + ' has a top anchor for labels');
    }
    if (it.kind === 'pet') { assert.equal(e.instancing, 'rig'); assert.deepEqual([...e.pivots].sort(), [...L.PET_SOCKETS].sort()); }
    if (it.kind === 'acc') { assert.equal(e.instancing, 'socket'); assert.equal(e.socket, it.slot, it.id); }
    if (it.kind === 'style') { assert.equal(e.slot, it.slot, it.id); assert.equal(e.base, 'house_cottage'); }
  }
});

test('look: the tables are frozen (shared contract objects)', () => {
  assert.ok(Object.isFrozen(L.LOOK));
  assert.ok(Object.isFrozen(L.LOOK.tree_oak.colors));
  assert.ok(Object.isFrozen(L.LOOK.flower_daisy.idle));
  assert.ok(Object.isFrozen(L.LOCKED.THEMES.course_snow.obs.low));
  assert.throws(() => { 'use strict'; L.LOOK.tree_oak.h = 9; });
});

/* ---------------- colour tokens ---------------- */
test('look: palette is exactly the art bible palette', () => {
  const bible = {};
  for (const p of BIBLE.palette) bible[p.name] = p.hex.toUpperCase();
  assert.deepEqual(L.PALETTE, bible);
});

test('look: PALETTE_V2 is exactly the v2 art bible palette, and every v2 hex appears in art-bible.v2.json', () => {
  const bible = {};
  for (const p of BIBLE2.palette) { bible[p.name] = p.hex.toUpperCase(); assert.ok(p.group && p.use, p.name + ' has a group and a use'); }
  assert.deepEqual(L.PALETTE_V2, bible);
  assert.equal(Object.keys(L.PALETTE_V2).length, 76);
  const doc = JSON.stringify(BIBLE2).toLowerCase();
  for (const [name, hex] of Object.entries(L.PALETTE_V2)) assert.ok(doc.includes(hex.toLowerCase()), name + ' ' + hex);
  /* the v1 tokens all stay defined, unchanged, and the kept ones keep their meaning */
  assert.equal(L.hex('Star Gold'), '#FFD23F'); assert.equal(L.hex('Success'), '#2ECC71');
  assert.equal(BIBLE2.kept['Star Gold'], '#FFD23F');
  /* the bible's v2 sets and words are the ones the code uses */
  assert.deepEqual([...L.NEON3], BIBLE2.neonSets.NEON3); assert.deepEqual([...L.NEON4], BIBLE2.neonSets.NEON4);
  assert.deepEqual([...L.SIGN_WORDS], BIBLE2.signWords.whitelist);
  assert.deepEqual([...L.MATERIAL.toonRamp], BIBLE2.materials.toon.ramp);
  for (const fam of ['WALL', 'DOOR']) for (const [id, hex] of Object.entries(BIBLE2.lockedAdditions[fam])) assert.equal(L.LOCKED[fam][id], hex, id);
});

test('look: token names are unique across PALETTE, PALETTE_V2, ART2D and EXTRA, and every value is a hex', () => {
  const seen = new Set();
  for (const table of [L.PALETTE, L.PALETTE_V2, L.ART2D, L.EXTRA]) {
    for (const [name, hex] of Object.entries(table)) {
      assert.ok(!seen.has(name), 'duplicate token name ' + name);
      assert.ok(!name.includes('.') && !name.startsWith('@') && !name.startsWith('$'), 'reserved character in ' + name);
      assert.match(hex, HEX, name);
      seen.add(name);
    }
  }
});

test('look: every colour reference resolves, and there is no raw hex inside LOOK', () => {
  const walk = (o, where) => {
    if (typeof o === 'string') { assert.ok(!/#[0-9a-f]{3,6}/i.test(o), 'raw hex at ' + where + ': ' + o); return; }
    if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) walk(v, where + '.' + k);
  };
  walk(L.LOOK, 'LOOK');
  for (const [id, e] of Object.entries(L.LOOK)) {
    const toks = L.tokensIn(e);
    assert.ok(toks.length >= Object.keys(e.colors).length);
    for (const t of toks) assert.ok(L.isToken(t), id + ' unresolved token ' + t);
    /* style-dependent tokens resolve for every owned option of their slot */
    for (const t of toks.filter((x) => x.includes('$'))) {
      const slot = t.split('.').find((p) => p.startsWith('$')).slice(1);
      const options = C.CATALOG.filter((it) => it.slot === slot).map((it) => it.id);
      assert.ok(options.length > 1, slot);
      for (const opt of options) assert.match(L.hex(t, { [slot]: opt }), HEX, id + ' ' + t + ' with ' + opt);
    }
  }
});

test('look: hex() resolves palette, locked paths, $slots and @member; rejects junk', () => {
  assert.equal(L.hex('Grass Top'), '#8EE07A');
  assert.equal(L.hex('WALL.wall_pink'), '#F9B7CC');
  assert.equal(L.hex('WALL.$wall'), '#F7E6C4');
  assert.equal(L.hex('WALL.$wall', { wall: 'wall_mint' }), '#B8ECD6');
  assert.equal(L.hex('ROOF.$roof.1', { roof: 'roof_blue' }), '#3A5888');
  assert.equal(L.hex('THEMES.course_candy.obs.puddle'), '#A0522D');
  assert.equal(L.hex('PETCOL.pet_dragon.nose'), '#2E6B40');
  assert.equal(L.hex('@member', { member: '#12ab9f' }), '#12AB9F');
  assert.equal(L.hex('@member'), L.PALETTE[L.MEMBER_FALLBACK]);
  for (const junk of ['', 'Nope', 'WALL', 'WALL.wall_gold', 'THEMES.course_meadow.obs', '#FFFFFF', null, 42, 'toString', 'LOCKED.constructor'])
    assert.equal(L.hex(junk), null, String(junk));
  assert.equal(L.colorsFor('house_cottage', { wall: 'wall_lilac', door: 'door_gold' }).wall, '#D6BDF2');
  assert.equal(L.colorsFor('house_cottage', { wall: 'wall_lilac', door: 'door_gold' }).door, '#F0C02F');
  assert.equal(L.colorsFor('att_kart', { kart: 'kart_unicorn' }).kart, '#FF8FD0');
  /* v2 tokens and the new locked colours */
  assert.equal(L.hex('Midnight Ink'), '#14101F'); assert.equal(L.hex('LED Cyan'), '#22E4FF');
  assert.equal(L.hex('WALL.$wall', { wall: 'wall_midnight' }), '#232A57');
  assert.equal(L.hex('DOOR.$door', { door: 'door_glass' }), '#1B2438');
  assert.equal(L.colorsFor('bld_boba', { member: '#11AA55' }).straw, '#11AA55');
});

test('look: every ART2D hex appears in world-art.js; every EXTRA hex comes from the art bible', () => {
  const art = ART_SRC.toLowerCase(), bible = JSON.stringify(BIBLE).toLowerCase();
  for (const [name, hex] of Object.entries(L.ART2D)) assert.ok(art.includes(hex.toLowerCase()), 'ART2D ' + name + ' ' + hex + ' not in world-art.js');
  for (const [name, hex] of Object.entries(L.EXTRA)) assert.ok(bible.includes(hex.toLowerCase()), 'EXTRA ' + name + ' ' + hex + ' not in the art bible');
});

/* ---------------- locked colours: 2D and 3D must agree ---------------- */
test('look: LOCKED equals the live 2D exports (KARTS, BALLS, STADIA, THEME, PETCOL) and kart TRACKS grass', () => {
  assert.deepEqual(lower(L.LOCKED.KARTS), lower(ART.KARTS));
  assert.deepEqual(lower(L.LOCKED.BALLS), lower(ART.BALLS));
  assert.deepEqual(lower(L.LOCKED.STADIA), lower(ART.STADIA));
  assert.deepEqual(lower(L.LOCKED.THEME), lower(ART.THEME));
  assert.deepEqual(lower(L.LOCKED.PETCOL), lower(ART.PETCOL));
  const grass = {};
  for (const [id, t] of Object.entries(Kart.TRACKS)) grass[id] = { grass: t.grass };
  assert.deepEqual(lower(L.LOCKED.TRACKS), lower(grass));
});

test('look: LOCKED WALL, DOOR and roof pairs match the world-art.js source text', () => {
  const wall = /var WALL = (\{[^;]*\});/.exec(ART_SRC), door = /var DOOR = (\{[^;]*\});/.exec(ART_SRC);
  const roof = /var rc = (\{[^}]*\})\[roof\]/.exec(ART_SRC);
  assert.ok(wall && door && roof, 'source patterns found');
  assert.deepEqual(lower(L.LOCKED.WALL), lower(evalLiteral(wall[1])));
  assert.deepEqual(lower(L.LOCKED.DOOR), lower(evalLiteral(door[1])));
  assert.deepEqual(lower(L.LOCKED.ROOF), lower(evalLiteral(roof[1])));
  /* every style item with a locked colour family is covered */
  for (const it of C.CATALOG.filter((x) => x.slot === 'wall')) assert.ok(L.LOCKED.WALL[it.id], it.id);
  for (const it of C.CATALOG.filter((x) => x.slot === 'door')) assert.ok(L.LOCKED.DOOR[it.id], it.id);
});

test('look: LOCKED THEMES match the course THEMES in pet-course.js (colours only)', () => {
  /* the runner exports its THEMES (rewritten game); compare colours only */
  const themes = JSON.parse(JSON.stringify(require('../world/games/pet-course.js').THEMES));
  assert.ok(COURSE_SRC.indexOf('var THEMES = ') > 0, 'pet-course.js still declares THEMES');
  for (const v of Object.values(themes)) delete v.treat;
  assert.deepEqual(lower(L.LOCKED.THEMES), lower(themes));
  assert.deepEqual(Object.keys(L.LOCKED.THEMES).sort(), C.CATALOG.filter((x) => x.slot === 'course').map((x) => x.id).sort());
});

/* ---------------- shape rules ---------------- */
/* reference heights (art bible modellingRules + item notes), ±0.05 u */
const REF_H = {
  path_stone: 0.04, path_wood: 0.04, path_flower: 0.04, bush_rose: 0.6, rock_mossy: 0.45, bench: 0.5, sandcastle: 0.7,
  snowman: 0.95, umbrella: 1.25, tree_oak: 1.6, tree_apple: 1.55, tree_blossom: 1.6, tree_pine: 1.8, tree_palm: 1.9,
  lantern: 1.4, mushroom_glow: 0.55, flag_pole: 1.9, bunting: 1.0, windmill: 2.2, lighthouse: 2.8, trampoline: 0.45,
  fountain: 0.95, swing: 1.4, bubbles: 0.8, house_cottage: 2.3, roof_castle: 2.9, att_course: 1.9, att_kart: 1.4,
  att_pitch: 0.4, flower_sun: 0.75, pet_dragon: 0.65
};
test('look: heights fall within the bible reference bands', () => {
  for (const [id, h] of Object.entries(REF_H)) assert.ok(Math.abs(L.LOOK[id].h - h) <= 0.05 + 1e-9, id + ' h ' + L.LOOK[id].h + ' vs ' + h);
  for (const id of ['flower_tulip', 'flower_daisy']) assert.ok(L.LOOK[id].h >= 0.35 && L.LOOK[id].h <= 0.6, id);
  for (const id of ['pet_puppy', 'pet_kitten', 'pet_bunny']) assert.ok(L.LOOK[id].h >= 0.5 && L.LOOK[id].h <= 0.6, id);
  assert.equal(L.CHARACTERS.avatar.h, 1.0, 'the v2 avatar has legs: h 1.0');
  /* the lighthouse is the tallest decoration */
  for (const it of C.CATALOG.filter((x) => x.kind === 'decor')) assert.ok(L.LOOK[it.id].h <= L.LOOK.lighthouse.h, it.id);
  /* the cottage is as tall as its roof (castle turrets reach 2.9), exactly as in v1 */
  assert.equal(L.heightOf('house_cottage', { shape: 'shape_cottage' }), 2.3);
  assert.equal(L.heightOf('house_cottage', { shape: 'shape_cottage', roof: 'roof_castle' }), 2.9);
  /* city buildings at their catalogue heights */
  const BH = { bld_photobooth: 1.6, bld_boba: 1.95, bld_ledtower: 2.5, bld_recording: 1.85, bld_dance: 2.25, bld_rooftop: 2.3, bld_stage: 2.45 };
  assert.deepEqual(Object.keys(BH).sort(), BUILDINGS.slice().sort());
  for (const [id, h] of Object.entries(BH)) assert.equal(L.LOOK[id].h, h, id);
});

test('look: house heights follow HOUSE_H for every shape and roof (the loft is the default), all ≤ 2.9', () => {
  const want = {
    shape_cottage: [2.3, 2.3, 2.3, 2.3, 2.9], shape_loft: [1.95, 1.95, 2.1, 2.0, 2.75], shape_villa: [1.2, 1.2, 1.2, 1.3, 1.95],
    shape_tower: [2.6, 2.6, 2.75, 2.65, 2.9], shape_dome: [2.25, 2.25, 2.25, 2.25, 2.25]
  };
  assert.deepEqual([...L.HOUSE_SHAPES].sort(), SHAPES.slice().sort());
  assert.deepEqual(ROOFS, ['roof_red', 'roof_blue', 'roof_thatch', 'roof_candy', 'roof_castle']);
  for (const [shape, hs] of Object.entries(want)) {
    ROOFS.forEach((roof, i) => {
      assert.equal(L.HOUSE_H[shape][roof], hs[i], shape + ' ' + roof);
      assert.equal(L.heightOf('house_cottage', { shape, roof }), hs[i], shape + ' ' + roof);
      assert.ok(hs[i] <= 2.9);
    });
    assert.equal(L.LOOK[shape].h, hs[0], shape + ' look height is the red-roof top');
  }
  assert.equal(L.heightOf('house_cottage', {}), 1.95, 'the City loft is the default shape');
  assert.equal(L.heightOf('house_cottage', { shape: 'shape_treehouse', roof: 'roof_castle' }), 2.75, 'an unknown shape falls back to the loft');
  assert.equal(L.heightOf('house_cottage', { shape: 'shape_villa', roof: 'roof_mystery' }), 1.2, 'an unknown roof reads as the red roof');
});

test('look: hit boxes are footprint × max(h, 0.8); pets get a 0.8 u sphere; nothing else is pickable', () => {
  for (const it of C.CATALOG) {
    const e = L.LOOK[it.id];
    if (C.isPlaceable(it)) {
      const fp = it.fp || [1, 1];
      assert.deepEqual(e.hit, [fp[0], Math.max(e.h, 0.8), fp[1]], it.id);
    } else if (it.kind === 'pet') assert.deepEqual(e.hit, [0.8, 0.8, 0.8], it.id);
    else assert.equal(e.hit, null, it.id);
  }
});

test('look: act → pivot map is complete (v1 acts plus serve, snap, screen, record, dance, hangout, encore)', () => {
  assert.deepEqual({ ...L.ACT_PIVOT }, { glow: 'glow', wave: 'flag', spin: 'spin', bounce: 'mat', splash: 'water', swing: 'swing', bubbles: 'emitter', home: 'door', launch: null,
    serve: 'hatch', snap: 'flash', screen: 'screen', record: 'meter', dance: 'floor', hangout: 'deck', encore: 'lights' });
  const acts = new Set();
  for (const it of C.CATALOG) {
    const e = L.LOOK[it.id];
    if (!it.act) { assert.equal(e.actPivot, null, it.id + ' has no act'); continue; }
    acts.add(it.act);
    assert.ok(it.act in L.ACT_PIVOT, 'unmapped act ' + it.act);
    const want = it.act === 'launch' ? L.LAUNCH_PIVOT[it.id] : L.ACT_PIVOT[it.act];
    assert.ok(want, it.id + ' launch pivot');
    assert.equal(e.actPivot, want, it.id);
    assert.ok(e.pivots.includes(want), it.id + ' pivots include ' + want);
  }
  assert.deepEqual([...acts].sort(), Object.keys(L.ACT_PIVOT).sort());
  /* every attraction launches with its own pivot */
  assert.deepEqual(Object.keys(L.LAUNCH_PIVOT).sort(), C.CATALOG.filter((x) => x.act === 'launch').map((x) => x.id).sort());
  /* idle loops drive pivots the template has */
  for (const [id, e] of Object.entries(L.LOOK)) for (const loop of [e.idle, ...e.loops]) {
    if (loop && loop.pivot) assert.ok(e.pivots.includes(loop.pivot), id + ' idle pivot ' + loop.pivot);
  }
});

test('look: organic only on trees, flowers, bushes, rocks and mushrooms', () => {
  const organic = Object.keys(L.LOOK).filter((id) => L.LOOK[id].organic).sort();
  assert.deepEqual(organic, ['bush_rose', 'flower_daisy', 'flower_sun', 'flower_tulip', 'mushroom_glow', 'rock_mossy',
    'tree_apple', 'tree_blossom', 'tree_oak', 'tree_palm', 'tree_pine']);
  for (const e of Object.values(L.LOOK)) assert.equal(e.organic, !!L.ORGANIC_KINDS[e.kind]);
});

test('look: outline only on characters (pets, accessories, avatar); architecture has no hull', () => {
  assert.deepEqual({ ...L.OUTLINE_KINDS }, { pet: 1, acc: 1, avatar: 1 });
  for (const it of C.CATALOG) {
    const want = it.kind === 'pet' || it.kind === 'acc';
    assert.equal(L.LOOK[it.id].outline, want, it.id);
  }
  assert.equal(L.CHARACTERS.avatar.outline, true);
  assert.equal(L.CHARACTERS.wand.outline, false);
  assert.equal(L.CHARACTERS.fanBlob.outline, false);
  const O = L.MATERIAL.outline;
  assert.equal(O.token, 'Midnight Ink'); assert.equal(O.building, 0); assert.equal(O.character, 0.009);
  assert.equal(O.selected, 'Star Gold'); assert.deepEqual([...O.pulse], [0.02, 0.03]); assert.equal(O.hz, 1.5);
});

test('look: every periodic emissive, twinkle and chase frequency is ≤ 2 Hz', () => {
  const found = [];
  const walk = (o, where) => {
    if (!o || typeof o !== 'object') return;
    for (const [k, v] of Object.entries(o)) {
      if (k === 'hz') { assert.equal(typeof v, 'number', where); found.push([where, v]); }
      else walk(v, where + '.' + k);
    }
  };
  for (const [id, e] of Object.entries(L.LOOK)) { walk(e.idle, id + '.idle'); walk(e.loops, id + '.loops'); walk(e.show, id + '.show'); }
  walk(L.CHARACTERS, 'CHARACTERS'); walk(L.MATERIAL, 'MATERIAL'); walk(L.EDIT, 'EDIT'); walk(L.CONES, 'CONES');
  assert.ok(found.length >= 15, 'frequencies found: ' + found.length);
  for (const [where, hz] of found) assert.ok(hz > 0 && hz <= L.MAX_FLASH_HZ, where + ' = ' + hz + ' Hz');
  for (const [id, e] of Object.entries(L.LOOK)) {
    if (e.show.chase && e.show.chase.speed) assert.ok(e.show.chase.speed / e.show.chase.spacing <= 2, id + ' chase wave per cell');
    for (const loop of [e.idle, ...e.loops].filter(Boolean)) {
      if (loop.type === 'glint') assert.ok(loop.period / loop.n >= 0.5, id + ' glints');
      if (loop.type === 'blink') assert.ok(loop.min >= 0.5, id + ' blink gap');
      if (loop.type === 'breathe') assert.ok(loop.hz <= 0.5 && loop.min > 0, id + ' breathes as a sine, never on/off');
      if (loop.type === 'ripple' || loop.type === 'sway' || loop.type === 'bob') assert.ok(loop.period >= 2, id + ' ' + loop.type + ' ≤ 0.5 Hz');
    }
  }
  /* beat-driven lights run at the music beat: 118 BPM is the fastest island tempo */
  assert.ok(L.TEMPO.beatHz(L.TEMPO.show) <= 2 && L.TEMPO.beatHz(L.TEMPO.day) <= 2);
  assert.ok(1 / L.TEMPO.idle.lighthouseCycle <= 2 && L.TEMPO.idle.coneHz <= 2);
});

test('look: every chase lights each bulb at most LED_CHASE_HZ (1.5 Hz); beat pulses stay ≤ ±35%', () => {
  assert.equal(L.LED_CHASE_HZ, 1.5);
  let chases = 0;
  for (const [id, e] of Object.entries(L.LOOK)) {
    const c = e.show.chase;
    if (c) {
      chases++;
      assert.ok(c.hz > 0 && c.hz <= L.MAX_FLASH_HZ, id + ' step rate ' + c.hz);
      if (c.speed) assert.ok(c.speed / Math.max(c.spacing, c.speed / L.MAX_FLASH_HZ) <= L.LED_CHASE_HZ, id + ' runway per cell');
      else assert.ok(c.hz / (c.groups || 1) <= L.LED_CHASE_HZ, id + ' per-light ' + (c.hz / (c.groups || 1)) + ' Hz');
      if (c.on === 'beat') assert.ok((c.groups || 1) >= 2, id + ' a beat chase alternates groups');
    }
    if (e.show.pulse) assert.ok(e.show.pulse.pct <= 35 && e.show.pulse.hz <= L.TEMPO.show / 60 + 1e-9, id + ' beat pulse');
    if (e.show.beams) assert.ok(e.show.beams.alpha <= 0.18, id + ' beam alpha');
  }
  assert.ok(chases >= 6, 'chases found: ' + chases);
  assert.equal(L.FX.bloomGapSec, 1.5);
});

test('look: triangle budgets follow the bible; every shape × roof with every detail stays ≤ 3,500', () => {
  const B = L.BUDGET;
  const cap = { tree: B.tree, flower: B.flower, bush: B.small, rock: B.small, mushroom: B.small, light: B.small, flag: B.small,
                decor: B.small, landmark: B.landmark, path: B.path, fun: B.fun, house: B.house, pet: B.pet, acc: B.acc, attraction: B.attraction,
                building: B.building };
  for (const [id, e] of Object.entries(L.LOOK)) {
    if (!cap[e.kind]) continue;
    /* the stage is the island's headline landmark: the attraction budget plus its crowd */
    const max = id === 'bld_stage' ? B.attraction : cap[e.kind];
    assert.ok(e.tris <= max, id + ' ' + e.tris);
  }
  assert.equal(B.building, 3000);
  assert.ok(L.LOOK.bld_stage.crowdTris <= 600);
  const want = { bld_photobooth: 900, bld_boba: 1300, bld_ledtower: 900, bld_recording: 1600, bld_dance: 2600, bld_rooftop: 2700, bld_stage: 4000 };
  for (const [id, t] of Object.entries(want)) assert.equal(L.LOOK[id].tris, t, id);
  for (const id of ['kart_red', 'kart_blue', 'kart_lime', 'kart_unicorn', 'kart_gold']) assert.ok(L.LOOK[id].tris <= B.kart);
  assert.ok(L.CHARACTERS.avatar.tris <= B.avatar && L.CHARACTERS.avatar.trisLow <= 1050);
  assert.ok(L.CHARACTERS.wand.tris <= 260);
  assert.ok(L.LOOK.att_pitch.crowdTris <= B.crowd);
  for (const id of C.CATALOG.filter((x) => x.kind === 'acc').map((x) => x.id)) assert.ok(L.LOOK[id].tris <= 300, id);
  assert.ok(L.LOOK.detail_neon.tris <= 250);
  /* shape bodies ≤ 1,200 (the cottage keeps its v1 body); modern crowns ≤ 900, castle ≤ 1,050 */
  const H = L.HOUSE_TRIS;
  assert.equal(H.body.shape_cottage, L.LOOK.house_cottage.bodyTris);
  for (const s of SHAPES) { assert.ok(H.body[s] <= 1200, s); assert.equal(L.LOOK[s].tris, H.body[s], s); }
  assert.ok(H.crown <= 900 && H.crownCastle <= 1050 && H.door === 150);
  for (const shape of SHAPES) for (const roof of ROOFS) {
    const st = { shape, roof, details: DETAILS };
    const s = L.resolveStyle('house_cottage', st);
    const crown = shape === 'shape_cottage' ? L.LOOK[roof].tris : roof === 'roof_castle' ? H.crownCastle : H.crown;
    const total = H.body[shape] + crown + Math.max(...C.CATALOG.filter((x) => x.slot === 'door').map((x) => L.LOOK[x.id].tris)) +
      s.details.reduce((a, d) => a + L.LOOK[d].tris, 0);
    assert.equal(L.houseBudget(st), total, shape + ' ' + roof);
    assert.ok(total <= L.LOOK.house_cottage.tris, shape + ' ' + roof + ' house total ' + total);
  }
});

/* ---------------- shine, state keys, presets ---------------- */
test('look: shineLevel is price-only, deterministic and monotonic with the bible bands', () => {
  const cases = [[0, 0], [199, 0], [200, 1], [599, 1], [600, 2], [1199, 2], [1200, 3], [5000, 3]];
  for (const [p, lv] of cases) assert.equal(L.shineLevel(p), lv, 'price ' + p);
  let prev = 0;
  for (let p = 0; p <= 2000; p += 5) { const lv = L.shineLevel(p); assert.ok(lv >= prev); assert.equal(L.shineLevel(p), lv); prev = lv; }
  for (const bad of [-1, NaN, undefined, null, 'x', {}]) assert.equal(L.shineLevel(bad), 0);
  for (const it of C.CATALOG) assert.equal(L.shineLevel(it), L.shineLevel(it.price), it.id);
  assert.equal(L.SHINE_NAMES.length, 4);
  assert.equal(L.shineLevel(C.item('pet_dragon')), 3);
  assert.equal(L.shineLevel(C.item('lighthouse')), 2);
  /* the new items fall in their plan bands: holo-edge 250–550, foil 650–1,100, gold 1,250 / 1,450 */
  const band = (id) => L.SHINE_NAMES[L.shineLevel(C.item(id))];
  for (const id of ['bld_photobooth', 'bld_boba', 'bld_ledtower', 'bld_recording', 'detail_neon', 'acc_hoodie']) assert.equal(band(id), 'holo-edge', id);
  for (const id of ['shape_villa', 'shape_tower', 'bld_dance', 'bld_rooftop']) assert.equal(band(id), 'holo-foil', id);
  for (const id of ['shape_dome', 'bld_stage']) assert.equal(band(id), 'gold-foil', id);
  for (const id of ['acc_beanie', 'acc_cap', 'acc_headphones', 'wall_concrete', 'wall_midnight', 'door_glass']) assert.equal(band(id), 'plain', id);
});

test('look: cottage stateKeys are byte-identical to v1; every other shape appends its shape and trim', () => {
  const COT = { shape: 'shape_cottage' };
  const base = L.stateKey('house_cottage', COT);
  assert.equal(base, 'wall_cream|roof_red|door_blue|d:');
  const st = { ...COT, wall: 'wall_mint', roof: 'roof_candy', door: 'door_gold', details: { detail_lights: true, detail_chimney: true, detail_flag: false } };
  const k = L.stateKey('house_cottage', st);
  assert.equal(k, 'wall_mint|roof_candy|door_gold|d:detail_chimney,detail_lights');
  assert.equal(L.stateKey('house_cottage', JSON.parse(JSON.stringify(st))), k);
  assert.equal(L.stateKey('house_cottage', { ...st, details: ['detail_lights', 'detail_chimney', 'detail_lights'] }), k);
  assert.equal(L.stateKey('house_cottage', { ...st, variant: 1 }), k, 'the cottage has one trim');
  /* castle hides the rooftop flag on every shape; other roofs keep it */
  for (const shape of SHAPES) {
    assert.equal(L.stateKey('house_cottage', { shape, roof: 'roof_castle', details: { detail_flag: true } }), L.stateKey('house_cottage', { shape, roof: 'roof_castle' }), shape);
    assert.ok(L.stateKey('house_cottage', { shape, roof: 'roof_red', details: { detail_flag: true } }).includes('d:detail_flag'), shape);
  }
  assert.deepEqual(L.resolveStyle('house_cottage', { roof: 'roof_castle', details: ['detail_flag', 'detail_chimney'] }).details, ['detail_chimney']);
  /* unknown details are ignored; a full artState() object (world-core shape) works */
  assert.equal(L.stateKey('house_cottage', { ...COT, details: { detail_disco: true } }), base);
  /* the default shape is the loft: the same v1 key plus the shape and trim */
  assert.equal(L.stateKey('house_cottage', {}), 'wall_cream|roof_red|door_blue|d:|s:shape_loft|v:0');
  assert.equal(L.stateKey('house_cottage', { shape: 'shape_dome', variant: 1, details: { detail_neon: true } }), 'wall_cream|roof_red|door_blue|d:detail_neon|s:shape_dome|v:1');
  assert.equal(L.stateKey('house_cottage', { shape: 'shape_villa', variant: 7 }), 'wall_cream|roof_red|door_blue|d:|s:shape_villa|v:1', 'trim clamped');
  assert.equal(L.stateKey('house_cottage', { shape: 'shape_villa', variant: -3 }), 'wall_cream|roof_red|door_blue|d:|s:shape_villa|v:0');
  assert.equal(L.stateKey('house_cottage', { shape: 'shape_nope' }), L.stateKey('house_cottage', {}), 'an unknown shape is the default');
  /* every shape × wall × roof × door combination (and both trims) gets its own key */
  const keys = new Set();
  const of = (slot) => C.CATALOG.filter((x) => x.slot === slot).map((x) => x.id);
  for (const shape of SHAPES) for (const variant of [0, 1]) for (const wall of of('wall')) for (const roof of ROOFS) for (const door of of('door'))
    keys.add(L.stateKey('house_cottage', { shape, variant, wall, roof, door }));
  assert.equal(of('wall').length, 9); assert.equal(of('door').length, 5);
  assert.equal(keys.size, (1 + 4 * 2) * 9 * 5 * 5);
  /* the v1 key set is unchanged: every cottage key equals the v1 formula */
  for (const wall of of('wall').slice(0, 5)) for (const roof of ROOFS) for (const door of of('door').slice(0, 4))
    assert.equal(L.stateKey('house_cottage', { shape: 'shape_cottage', wall, roof, door }), wall + '|' + roof + '|' + door + '|d:');
});

test('look: houseState carries the shape and trim; shapes preview on the player house', () => {
  assert.deepEqual(L.houseState({}), { wall: 'wall_cream', roof: 'roof_red', door: 'door_blue', details: [], shape: 'shape_loft', variant: 0 });
  assert.deepEqual(L.houseState({ shape: 'shape_tower', variant: 1, roof: 'roof_castle', details: { detail_flag: true, detail_neon: true } }),
    { wall: 'wall_cream', roof: 'roof_castle', door: 'door_blue', details: ['detail_neon'], shape: 'shape_tower', variant: 1 });
  assert.equal(L.houseState({ shape: 'shape_cottage', variant: 1 }).variant, 0);
  assert.equal(L.houseState({ shape: 'shape_dome', variant: '1' }).variant, 1);
  /* a shape preview: the player's colours on the previewed shape */
  assert.deepEqual(L.resolveStyle('shape_villa', { wall: 'wall_pink', shape: 'shape_cottage' }),
    { wall: 'wall_pink', roof: 'roof_red', door: 'door_blue', details: [], shape: 'shape_villa', variant: 0 });
  assert.equal(L.stateKey('shape_cottage', { wall: 'wall_mint' }), 'wall_mint|roof_red|door_blue|d:', 'previewing the cottage gives its v1 key');
  assert.equal(L.stateKey('shape_loft', {}), L.stateKey('house_cottage', {}));
  assert.equal(L.stateKey('roof_blue', { shape: 'shape_dome' }), L.stateKey('house_cottage', { shape: 'shape_dome', roof: 'roof_blue' }));
  assert.deepEqual(L.SLOT_DEFAULTS.shape, 'shape_loft');
});

test('look: style items preview on the player house; attractions, pets and accessories key on their style', () => {
  assert.equal(L.stateKey('roof_blue', { wall: 'wall_pink' }), L.stateKey('house_cottage', { wall: 'wall_pink', roof: 'roof_blue' }));
  assert.equal(L.stateKey('detail_flag', { roof: 'roof_castle' }), L.stateKey('house_cottage', { roof: 'roof_castle' }));
  assert.equal(L.stateKey('detail_chimney', { shape: 'shape_cottage' }), 'wall_cream|roof_red|door_blue|d:detail_chimney');
  assert.deepEqual(L.resolveStyle('door_gold', { door: 'door_red' }), { wall: 'wall_cream', roof: 'roof_red', door: 'door_gold', details: [], shape: 'shape_loft', variant: 0 });
  assert.equal(L.stateKey('att_course', {}), 'course_meadow');
  assert.equal(L.stateKey('att_course', { course: 'course_snow' }), 'course_snow');
  assert.equal(L.stateKey('att_pitch', { ball: 'ball_planet' }), 'ball_planet|stadium_day');
  assert.equal(L.stateKey('att_kart', { kart: 'kart_gold' }), 'kart_gold');
  assert.deepEqual(L.resolveStyle('att_pitch', { stadium: 'stadium_snow' }), { ball: 'ball_classic', stadium: 'stadium_snow' });
  assert.equal(L.stateKey('pet_bunny', { acc: { hat: 'acc_crown', face: 'acc_shades' } }), 'a:acc_crown,acc_shades');
  assert.equal(L.stateKey('pet_bunny', { acc: { hat: 'acc_scarf' } }), 'a:', 'an accessory only fits its own slot');
  assert.equal(L.stateKey('acc_cape', { pet: 'pet_dragon', acc: { hat: 'acc_partyhat' } }), 'pet_dragon|a:acc_cape,acc_partyhat');
  assert.equal(L.stateKey('acc_crown', { acc: { hat: 'acc_partyhat' } }), 'pet_puppy|a:acc_crown', 'the previewed hat replaces the worn one');
  for (const id of ['tree_oak', 'path_wood', 'lantern', 'course_beach', 'ball_gold', 'kart_lime', 'land_cove', 'track_volcano'])
    assert.equal(L.stateKey(id, { wall: 'wall_pink', course: 'course_candy', variant: 2 }), 'base', id);
  for (const it of C.CATALOG) assert.match(L.stateKey(it.id, {}), /^[a-z0-9_|:,]+$/, it.id);
  assert.equal(L.stateKey('no_such_item', {}), 'base');
});

test('look: city buildings key on their trim; variantOf is deterministic, spread and in range', () => {
  for (const id of BUILDINGS) {
    assert.equal(L.VARIANTS[id], 3, id);
    assert.deepEqual(L.resolveStyle(id, {}), { variant: 0 }, id);
    assert.equal(L.stateKey(id, { variant: 2 }), 'v:2');
    assert.equal(L.stateKey(id, { variant: 9 }), 'v:2', 'clamped');
    assert.equal(L.stateKey(id, { variant: -1, wall: 'wall_pink' }), 'v:0');
    const count = [0, 0, 0];
    for (let i = 1; i <= 300; i++) {
      const v = L.variantOf('p' + i, id);
      assert.ok(Number.isInteger(v) && v >= 0 && v < 3);
      assert.equal(L.variantOf('p' + i, id), v, 'deterministic');
      count[v]++;
    }
    assert.ok(count.every((n) => n >= 60), id + ' spread ' + count);
  }
  for (const s of ['shape_loft', 'shape_villa', 'shape_tower', 'shape_dome']) assert.equal(L.VARIANTS[s], 2, s);
  assert.equal(L.VARIANTS.shape_cottage, undefined);
  assert.equal(L.variantOf('p1', 'tree_oak'), 0, 'single-look ids have one trim');
  assert.equal(L.variantOf('p1', 'shape_cottage'), 0);
  /* the three trims differ in every attribute the plan lists */
  const trims = [0, 1, 2].map((v) => L.trimOf('bld_boba', v));
  assert.deepEqual(trims.map((t) => t.accent), ['@member', 'Neon Magenta', 'LED Cyan']);
  assert.deepEqual(trims.map((t) => t.signSide), ['L', 'R', 'L']);
  assert.deepEqual(trims.map((t) => t.stripe), ['A', 'B', 'C']);
  for (const t of trims) assert.ok(L.isToken(t.accent), t.accent);
});

test('look: city buildings are LOOK kind building with their pivots, anchors and ≤ 4 materials', () => {
  const want = {
    bld_photobooth: ['snap', 'flash'], bld_boba: ['serve', 'hatch'], bld_ledtower: ['screen', 'screen'], bld_recording: ['record', 'meter'],
    bld_dance: ['dance', 'floor'], bld_rooftop: ['hangout', 'deck'], bld_stage: ['encore', 'lights']
  };
  for (const id of BUILDINGS) {
    const e = L.LOOK[id], it = C.item(id);
    assert.equal(it.kind, 'fun'); assert.equal(it.cat, 'city');
    assert.equal(e.kind, 'building', id); assert.equal(e.instancing, 'batch'); assert.equal(e.outline, false); assert.equal(e.organic, false);
    assert.equal(it.act, want[id][0], id); assert.equal(e.actPivot, want[id][1], id);
    assert.ok(e.anchors.includes('top') && e.anchors.includes('spot'), id + ' anchors');
    const mats = new Set(['toon'].concat(Object.values(e.mats)));
    assert.ok(mats.size <= 4, id + ' materials ' + [...mats]);
    for (const m of Object.values(e.mats)) assert.match(m, /^(state|smoked|gunmetal|foil|chrome|pearl|gold|led|sign|neon:.+)$/, id + ' ' + m);
    assert.ok(Object.keys(e.colors).includes('accent'), id + ' has the trim accent');
  }
  assert.ok(L.LOOK.bld_rooftop.anchors.includes('roof') && L.LOOK.bld_boba.anchors.includes('seat'));
  for (const a of ['cone0', 'cone1', 'cone2']) assert.ok(L.LOOK.bld_stage.anchors.includes(a), 'stage truss ' + a);
  assert.ok(C.item('bld_dance').entrance && C.item('bld_stage').entrance);
});

test('look: SLOT_DEFAULTS equal SLWorldCore.DEFAULTS (the City loft is the default shape)', () => {
  assert.deepEqual({ ...L.SLOT_DEFAULTS }, C.DEFAULTS);
  assert.equal(L.SLOT_DEFAULTS.shape, 'shape_loft');
});

test('look: DUSK (golden hour) and SHOW (Showtime) are complete and match the v2 bible; DAY and SHOW_V1 stay v1', () => {
  for (const P of [L.DUSK, L.SHOW, L.SHOW_V1]) assert.deepEqual(Object.keys(P).sort(), Object.keys(L.DAY).sort());
  assert.deepEqual([...L.PRESET_KEYS].sort(), Object.keys(L.DAY).sort());
  for (const k of ['hemiSky', 'hemiGround', 'hemiIntensity', 'sunColor', 'sunIntensity', 'sunPos', 'fogColor', 'fogNear', 'fogFar',
                   'exposure', 'rimColor', 'rimStrength', 'skyTop', 'skyMid', 'skyHorizon', 'seaShallow', 'seaDeep', 'foam',
                   'neonSleeve', 'haloScale', 'haloOpacity', 'stars', 'cones']) assert.ok(k in L.DAY, k);
  for (const P of [L.DUSK, L.SHOW, L.DAY, L.SHOW_V1]) for (const k of L.PRESET_COLOR_KEYS) assert.ok(L.isToken(P[k]), k);
  const want = { hemiIntensity: [1.35, 0.75], sunIntensity: [2.2, 0.8], exposure: [1.05, 1.1], rimStrength: [0.35, 0.6], rimMember: [0.25, 0.5],
                 fogNear: [28, 22], fogFar: [72, 58], neonSleeve: [0.25, 0.45], haloScale: [1.2, 1.6], haloOpacity: [0.6, 0.9],
                 windowGlow: [0.6, 1], stars: [0.25, 1], cones: [0, 1], glints: [1, 0] };
  for (const [k, [d, s]] of Object.entries(want)) { assert.equal(L.DUSK[k], d, 'DUSK ' + k); assert.equal(L.SHOW[k], s, 'SHOW ' + k); }
  const tok = { hemiSky: ['Hemi Dusk Sky', 'Hemi Night Sky'], hemiGround: ['Hemi Dusk Ground', 'Hemi Night Ground'], sunColor: ['Sun Dusk', 'Moon V2'],
                fogColor: ['Dusk Fog', 'Night Mid'], rimColor: ['Rim Dusk', 'Rim Night'], skyTop: ['Dusk Zenith', 'Night Zenith'],
                skyMid: ['Dusk Mid', 'Night Mid'], skyHorizon: ['Dusk Horizon', 'City Glow'], seaShallow: ['Lagoon', 'Night Lagoon'],
                seaDeep: ['Deep Bay', 'Night Deep'], foam: ['Foam Dusk', 'Foam Night'], waveLine: ['Wave Dusk', 'Holo Blue'] };
  for (const [k, [d, s]] of Object.entries(tok)) { assert.equal(L.DUSK[k], d, 'DUSK ' + k); assert.equal(L.SHOW[k], s, 'SHOW ' + k); }
  /* one fixed sun/moon direction: the static shadow map never re-renders for light changes */
  assert.deepEqual([...L.DUSK.sunPos], [-9, 7.5, 8]); assert.deepEqual([...L.SHOW.sunPos], [-9, 7.5, 8]);
  assert.deepEqual([...L.DUSK.sunPos], BIBLE2.presets.sunPos);
  assert.equal(L.hex(L.SHOW.skyTop), '#0B0A1F', 'the darkest value anywhere');
  /* the v1 pair is kept verbatim for the games' own light arcs */
  const v1 = { hemiIntensity: [1.9, 0.85], sunIntensity: [2.4, 0.9], exposure: [1.0, 1.08], rimStrength: [0.28, 0.55],
               fogNear: [30, 24], fogFar: [70, 60], neonSleeve: [0, 0.45], haloScale: [1, 1.6], haloOpacity: [0.5, 0.9] };
  for (const [k, [d, s]] of Object.entries(v1)) { assert.equal(L.DAY[k], d, 'DAY ' + k); assert.equal(L.SHOW_V1[k], s, 'SHOW_V1 ' + k); }
  assert.equal(L.hex(L.DAY.hemiSky), '#DDF1FF'); assert.equal(L.hex(L.SHOW_V1.hemiGround), '#2A1840');
  assert.equal(L.hex(L.DAY.fogColor), '#FFE3F1'); assert.equal(L.hex(L.SHOW_V1.fogColor), '#3B1E6E');
  assert.equal(L.hex(L.SHOW_V1.sunColor), '#B9C6FF'); assert.equal(L.hex(L.SHOW_V1.seaDeep), '#1B2A6B');
  assert.deepEqual([...L.DAY.sunPos], [-7, 14, 9]);
});

test('look: presetAt mixes DUSK → SHOW with the member colour in both rims; presetV1At is the v1 mix', () => {
  const d = L.presetAt(0), s = L.presetAt(1);
  for (const k of L.PRESET_KEYS) {
    if (typeof L.DUSK[k] === 'string') { assert.equal(d[k], L.hex(L.DUSK[k]), k); assert.equal(s[k], L.hex(L.SHOW[k]), k); }
    else { assert.deepEqual(d[k], L.DUSK[k], k); assert.deepEqual(s[k], L.SHOW[k], k); }
  }
  assert.equal(L.presetAt(0, '#00FF00').rimColor, L.mixHex(L.PALETTE_V2['Rim Dusk'], '#00FF00', 0.25));
  assert.equal(L.presetAt(1, '#00FF00').rimColor, L.mixHex(L.PALETTE_V2['Rim Night'], '#00FF00', 0.5));
  assert.equal(L.presetAt(-3).exposure, 1.05);
  assert.equal(L.presetAt(7).exposure, 1.1);
  let prev = -Infinity;
  for (let k = 0; k <= 1.0001; k += 0.1) { const v = L.presetAt(k).haloScale; assert.ok(v >= prev); prev = v; }
  /* the v1 mix, unchanged */
  const d1 = L.presetV1At(0), s1 = L.presetV1At(1);
  for (const k of L.PRESET_KEYS) if (typeof L.DAY[k] === 'string') { assert.equal(d1[k], L.hex(L.DAY[k]), k); assert.equal(s1[k], L.hex(L.SHOW_V1[k]), k); }
  assert.equal(L.presetV1At(1, '#00FF00').rimColor, L.mixHex(L.PALETTE['Rim Showtime'], '#00FF00', 0.4));
  assert.equal(L.presetV1At(0, '#00FF00').rimColor, '#FFFFFF', 'v1 day rim ignores the member colour');
  assert.equal(L.presetV1At(-3).exposure, 1.0); assert.equal(L.presetV1At(7).exposure, 1.08);
});

test('look: TEMPO, FX caps and the shared tables are consistent', () => {
  assert.equal(L.TEMPO.day, 100); assert.equal(L.TEMPO.show, 118);
  assert.equal(L.TEMPO.loopSec(16, 100), 38.4);
  assert.ok(Math.abs(L.TEMPO.loopSec(16, 118) - 32.54) < 0.01);
  assert.ok(Math.abs(L.TEMPO.beatSec(118) * 8 - 4.07) < 0.01, 'dance break ≈ 4.07 s');
  assert.equal(L.TEMPO.beatSec(100), 0.6);
  /* idle periods are whole half-beats at 100 BPM where the bible allows */
  for (const k of ['treeSway', 'palmSway', 'flowerBob', 'smoke']) assert.ok(Math.abs(L.TEMPO.idle[k] / 0.3 - Math.round(L.TEMPO.idle[k] / 0.3)) < 1e-9, k);
  assert.deepEqual({ ...L.FX.particles }, { LOW: 128, MID: 256, HIGH: 512 });
  assert.equal(L.FX.confetti, 120); assert.equal(L.FX.bubbles, 24); assert.equal(L.FX.petals, 40);
  for (const list of Object.values(L.MATCAPS)) for (const t of list) assert.ok(L.isToken(t), t);
  for (const t of [L.FX.blob.token, L.MATERIAL.rim.day.token, L.MATERIAL.rim.show.token, L.MATERIAL.outline.token, L.MATERIAL.outline.selected,
                   L.EDIT.grid.token, L.EDIT.valid.token, L.EDIT.valid.edge, L.EDIT.invalid.token, L.EDIT.entrance.token, ...L.CONES.tokens])
    assert.ok(L.isToken(t), t);
  for (const ch of Object.values(L.CHARACTERS)) for (const t of Object.values(ch.colors)) assert.ok(L.hex(t, {}), t);
  assert.ok(Number.isInteger(L.LOOK_VERSION) && L.LOOK_VERSION >= 1);
});

test('look: v2 materials — deeper toon ramp, crisp bevels, smoked/gunmetal/foil matcaps, v2 neon', () => {
  const M = L.MATERIAL;
  assert.deepEqual([...M.toonRamp], [64, 128, 200, 255]);
  assert.deepEqual({ ...M.rim.day }, { token: 'Rim Dusk', strength: 0.35, member: 0.25, exp: 3.0 });
  assert.deepEqual({ ...M.rim.show }, { token: 'Rim Night', strength: 0.6, member: 0.5 });
  assert.deepEqual({ ...M.neonSleeve }, { r: 0.05, core: 0.015, day: 0.25, show: 0.45 });
  assert.deepEqual({ ...M.bevel }, { arch: 0.05, archMax: 0.06, organic: 0.18 });
  assert.deepEqual([...L.MATCAPS.smoked], ['Glass Edge', 'Smoked Mid', 'Smoked Glass', 'Smoked Deep']);
  assert.deepEqual([...L.MATCAPS.gunmetal], ['Gunmetal Spec', 'Gunmetal Mid', 'Gunmetal', 'Gunmetal Deep']);
  assert.deepEqual([...L.MATCAPS.foil], ['Foil Pink', 'Foil Blue', 'Foil Mint', 'Foil Gold']);
  assert.deepEqual([...L.NEON3], ['Neon Magenta', 'LED Cyan', 'Electric Violet']);
  assert.deepEqual([...L.NEON4], ['Neon Magenta', 'LED Cyan', 'Electric Violet', 'Laser Lime']);
  assert.deepEqual([...L.CONES.tokens], [...L.NEON3]);
  assert.deepEqual([...L.LOOK.windmill.show.neon], [...L.NEON4], 'every existing neon set picks up v2');
  assert.deepEqual([...L.SIGN_WORDS], ['ENCORE', 'SHOWTIME', 'ON AIR', 'PHOTO', 'DANCE', 'PET COURSE', 'ISLAND']);
  for (const w of L.SIGN_WORDS) assert.match(w, /^[A-Z ]+$/, 'no brands, logos or Hangul: ' + w);
  assert.ok(L.KINDS.includes('building') && L.PLACED_KINDS.building === 1);
  assert.deepEqual({ ...L.FX.uplight }, { r: 0.5, day: 0.25, show: 0.4 });
});

test('look: v2 colour re-points keep every key (models read LOOK by key)', () => {
  const want = {
    house_cottage: { window: 'Smoked Glass', muntin: 'Gunmetal', step: 'Concrete', mat: 'Teak', windowGlow: 'Window Warm' },
    tree_oak: { canopy: 'Leaf Deep', canopyLow: 'Turf Shade', dab: 'Leaf Lit' }, tree_apple: { canopy: 'Leaf Deep', apple: 'Apple Red' },
    tree_blossom: { canopy: 'Blossom' }, flower_tulip: { mound: 'Turf Shade' }, bush_rose: { mound: 'Turf Shade' },
    rock_mossy: { rock: 'Cliff Rock' }, lantern: { post: 'Gunmetal', cage: 'Gunmetal', cap: 'Gunmetal', glassOn: 'Sunset Amber' },
    mushroom_glow: { capOn: 'LED Cyan' }, bench: { plank: 'Teak', leg: 'Gunmetal' }, lighthouse: { gallery: 'Gunmetal' },
    windmill: { tower: 'Bone White', sail: 'Bone White' }, path_wood: { plankA: 'Teak Light', plankB: 'Teak' },
    trampoline: { frame: 'Gunmetal', mat: 'Graphite', shine: 'LED Cyan', leg: 'Midnight Ink' }, fountain: { basin: 'Concrete Light' },
    swing: { leaves: 'Leaf Deep', seat: 'Teak' }, bubbles: { body: 'Graphite', face: 'Gunmetal' },
    att_course: { pillar: 'Graphite', text: 'Bone White' }, att_kart: { garage: 'Graphite', checkA: 'Midnight Ink', sign: 'Laser Lime' },
    att_pitch: { fanA: 'Crowd Shadow', fanB: 'Crowd Shadow 2', fanC: 'Crowd Shadow 3', fanD: 'Graphite' },
    pet_puppy: { eye: 'Midnight Ink', mouth: 'Midnight Ink' }, pet_dragon: { eye: 'Midnight Ink', mouth: 'Midnight Ink' },
    acc_shades: { lens: 'Midnight Ink', frame: 'Midnight Ink' },
    land_cove: { top: 'Dune', side: 'Wet Dune', tide: 'Wet Dune' }, land_meadow: { top: 'Hill Moss', side: 'Cliff Rock' }
  };
  for (const [id, parts] of Object.entries(want)) for (const [part, tok] of Object.entries(parts)) assert.equal(L.LOOK[id].colors[part], tok, id + '.' + part);
  assert.deepEqual(L.LOOK.acc_shades.show.foil, ['lens']);
  /* the mossy rock lost its eyes and blink */
  assert.deepEqual([...L.LOOK.rock_mossy.pivots], ['sway']); assert.equal(L.LOOK.rock_mossy.idle, null);
  assert.ok(!('eye' in L.LOOK.rock_mossy.colors));
  /* the characters */
  const A = L.CHARACTERS;
  assert.deepEqual({ ...A.avatar.colors }, { hood: '@member', hoodie: 'Graphite', band: '@member', legs: 'Night Asphalt', sneaker: 'Bone White', mic: 'Gunmetal', hand: 'Bone White', string: 'Bone White' });
  assert.deepEqual({ ...A.wand.colors }, { handle: 'Midnight Ink', grip: '@member', collar: 'Gunmetal', head: '@member', core: 'Bone White' });
  assert.equal(A.wand.points, 4, 'the Spark Stick is 4-pointed, never the 5-point ⭐');
  for (const k of ['a', 'b', 'c']) assert.match(A.fanBlob.colors[k], /^Crowd Shadow/);
  assert.equal(A.fanBlob.colors.eye, 'Bone White');
});

test('look: jitter2 gives organic decor deterministic variety and leaves architecture alone', () => {
  const R = L.JITTER_RULES;
  for (const it of C.CATALOG) {
    const e = L.LOOK[it.id], j = L.jitter2('p7', it.id, []);
    assert.deepEqual(L.jitter2('p7', it.id, []), j, it.id + ' deterministic');
    if (L.ORGANIC_KINDS[e.kind]) {
      assert.ok(j.yaw >= 0 && j.yaw < 360, it.id);
      assert.ok(j.sx === j.sz && j.sx >= 0.9 && j.sx <= 1.1, it.id + ' sx');
      assert.ok(j.sy >= 0.88 && j.sy <= 1.12, it.id + ' sy');
      assert.ok(Math.abs(j.lean) <= 3, it.id + ' lean');
      if (e.kind !== 'tree' && e.kind !== 'flower') assert.equal(j.lean, 0, it.id + ' only trees and flowers lean');
      const named = R.namedColour.includes(it.id);
      assert.ok(j.tint && j.tint.l >= (named ? 0.96 : 0.93) && j.tint.l <= (named ? 1.04 : 1.05), it.id + ' lightness');
      assert.ok(Math.abs(j.tint.h) <= 5, it.id + ' hue');
      if (named || (e.kind !== 'tree' && e.kind !== 'bush')) assert.equal(j.tint.h, 0, it.id + ' hue only on foliage');
    } else if (R.smallDecor.includes(it.id)) {
      assert.ok(R.smallDecorYaw.includes(j.yaw), it.id);
      assert.deepEqual([j.sx, j.sy, j.sz, j.lean, j.tint], [1, 1, 1, 0, null], it.id);
    } else {
      assert.deepEqual({ ...j }, { yaw: 0, sx: 1, sy: 1, sz: 1, lean: 0, leanAxis: 0, tint: null }, it.id + ' identity');
    }
  }
  /* houses, buildings, attractions and paths are never jittered */
  for (const id of ['house_cottage', 'att_pitch', 'path_stone', 'trampoline'].concat(BUILDINGS)) assert.equal(L.jitter2('p3', id, ['p1']).yaw, 0, id);
  /* the small decor yaw set is used in full */
  const yaws = new Set();
  for (let i = 1; i < 60; i++) yaws.add(L.jitter2('p' + i, 'bench').yaw);
  assert.deepEqual([...yaws].sort((a, b) => a - b), [-20, 0, 20]);
  /* the organic ids whose CATALOG text names a colour keep their hue */
  const COLOUR = /\b(red|pink|green|blue|yellow|white|purple|lilac|orange|gold|golden|violet|mint|cream)\b/i;
  const named = C.CATALOG.filter((it) => L.ORGANIC_KINDS[L.LOOK[it.id].kind] && COLOUR.test(it.name + ' ' + it.desc)).map((it) => it.id).sort();
  assert.deepEqual([...R.namedColour].sort(), named);
  /* neighbours: a later copy next to an earlier one turns +120° and scales the other way by ≥ 0.06 */
  for (const [a, b] of [['p3', 'p9'], ['p20', 'p21'], ['p1', 'p100']]) {
    const first = L.jitter2(a, 'tree_oak', [b]), later = L.jitter2(b, 'tree_oak', [a]);
    assert.deepEqual(first, L.jitter2(a, 'tree_oak', []), 'the earlier copy keeps its own look');
    assert.ok(near(later.yaw, (first.yaw + 120) % 360), 'yaw ' + later.yaw + ' vs ' + first.yaw);
    assert.ok(Math.abs(later.sx - first.sx) >= 0.06 - 1e-9, 'scale apart');
    assert.ok((first.sx >= 1) === (later.sx < first.sx), 'opposite direction');
    assert.ok(later.sx >= 0.9 && later.sx <= 1.1);
  }
  const out = {};
  assert.equal(L.jitter2('p4', 'tree_pine', null, out), out, 'reuses the out object');
});

test('look: pathPiece auto-tiles every N1 E2 S4 W8 mask with the right piece and turn', () => {
  /* turn a canonical piece's open sides by yaw (three.js: +90° carries N onto W) */
  const CANON = { single: 0, end: 1, straight: 5, corner: 3, tee: 11, cross: 15 };
  const rot = (m) => (m & 1 ? 8 : 0) | (m & 2 ? 1 : 0) | (m & 4 ? 2 : 0) | (m & 8 ? 4 : 0);
  const bits = (m) => [1, 2, 4, 8].filter((b) => m & b).length;
  for (let mask = 0; mask < 16; mask++) {
    const p = L.pathPiece(mask);
    assert.ok([0, 90, 180, 270].includes(p.yawDeg), mask + ' yaw');
    let m = CANON[p.piece];
    for (let k = 0; k < p.yawDeg / 90; k++) m = rot(m);
    assert.equal(m, mask, mask + ' → ' + p.piece + ' @' + p.yawDeg);
    assert.equal(bits(CANON[p.piece]), bits(mask));
  }
  assert.deepEqual(L.pathPiece(5), { piece: 'straight', yawDeg: 0 });
  assert.deepEqual(L.pathPiece(10), { piece: 'straight', yawDeg: 90 });
  assert.deepEqual(L.pathPiece(0), { piece: 'single', yawDeg: 0 });
  assert.deepEqual(L.pathPiece(15), { piece: 'cross', yawDeg: 0 });
  assert.deepEqual(L.pathPiece(31), L.pathPiece(15), 'only the low 4 bits count');
});

test('look: colour helpers', () => {
  assert.equal(L.normHex('#abcdef'), '#ABCDEF');
  assert.equal(L.normHex('nope'), null);
  assert.equal(L.mixHex('#000000', '#FFFFFF', 0), '#000000');
  assert.equal(L.mixHex('#000000', '#FFFFFF', 1), '#FFFFFF');
  assert.equal(L.mixHex('#000000', '#FFFFFF', 0.5), '#808080');
  assert.equal(L.tone('#8EE07A', 0), '#8EE07A');
  const lum = (h) => { const n = parseInt(h.slice(1), 16); return ((n >> 16) & 255) + ((n >> 8) & 255) + (n & 255); };
  assert.ok(lum(L.tone('#8EE07A', 12)) > lum('#8EE07A'));
  assert.ok(lum(L.tone('#8EE07A', -12)) < lum('#8EE07A'));
  assert.ok(lum(L.tone('#F7E6C4', L.MATERIAL.skirting)) < lum('#F7E6C4'), 'skirting is darker');
  assert.equal(L.tone('#FFFFFF', 20), '#FFFFFF');
});

test('look: loads as a browser global (window.SLIslandLook) with no module system', () => {
  const ctx = {};
  ctx.self = ctx;
  vm.runInNewContext(read('world/world-look.js'), ctx);
  assert.ok(ctx.SLIslandLook && ctx.SLIslandLook.LOOK.house_cottage);
  assert.equal(Object.keys(ctx.SLIslandLook.LOOK).length, 104);
});
