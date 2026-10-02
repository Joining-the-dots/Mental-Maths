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
const ART_SRC = read('world/world-art.js');
const COURSE_SRC = read('world/games/pet-course.js');
const lower = (o) => JSON.parse(JSON.stringify(o).toLowerCase());
const evalLiteral = (src) => vm.runInNewContext('(' + src + ')', {});
const HEX = /^#[0-9A-F]{6}$/;

/* ---------------- coverage and schema ---------------- */
test('look: every CATALOG id has a LOOK entry and every LOOK id is in CATALOG', () => {
  const ids = C.CATALOG.map((it) => it.id).sort();
  assert.deepEqual(Object.keys(L.LOOK).sort(), ids);
  assert.equal(ids.length, 81);
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

test('look: token names are unique across PALETTE, ART2D and EXTRA, and every value is a hex', () => {
  const seen = new Set();
  for (const table of [L.PALETTE, L.ART2D, L.EXTRA]) {
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
  assert.ok(Math.abs(L.CHARACTERS.avatar.h - 0.95) <= 0.05);
  /* the lighthouse is the tallest decoration */
  for (const it of C.CATALOG.filter((x) => x.kind === 'decor')) assert.ok(L.LOOK[it.id].h <= L.LOOK.lighthouse.h, it.id);
  /* the house is as tall as its roof: castle turrets reach 2.9 */
  assert.equal(L.heightOf('house_cottage', {}), 2.3);
  assert.equal(L.heightOf('house_cottage', { roof: 'roof_castle' }), 2.9);
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

test('look: act → pivot map is complete (glow, wave, spin, bounce, splash, swing, bubbles, home, launch)', () => {
  assert.deepEqual({ ...L.ACT_PIVOT }, { glow: 'glow', wave: 'flag', spin: 'spin', bounce: 'mat', splash: 'water', swing: 'swing', bubbles: 'emitter', home: 'door', launch: null });
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

test('look: outline only on the house, attractions, pets, avatar and accessories', () => {
  for (const it of C.CATALOG) {
    const want = it.kind === 'house' || it.kind === 'attraction' || it.kind === 'pet' || it.kind === 'acc';
    assert.equal(L.LOOK[it.id].outline, want, it.id);
  }
  assert.equal(L.CHARACTERS.avatar.outline, true);
  assert.equal(L.CHARACTERS.wand.outline, false);
  assert.equal(L.CHARACTERS.fanBlob.outline, false);
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
    }
  }
  /* beat-driven lights run at the music beat: 118 BPM is the fastest island tempo */
  assert.ok(L.TEMPO.beatHz(L.TEMPO.show) <= 2 && L.TEMPO.beatHz(L.TEMPO.day) <= 2);
  assert.ok(1 / L.TEMPO.idle.lighthouseCycle <= 2 && L.TEMPO.idle.coneHz <= 2);
});

test('look: triangle budgets follow the bible, and the house with every detail stays under 3,500', () => {
  const B = L.BUDGET;
  const cap = { tree: B.tree, flower: B.flower, bush: B.small, rock: B.small, mushroom: B.small, light: B.small, flag: B.small,
                decor: B.small, landmark: B.landmark, path: B.path, fun: B.fun, house: B.house, pet: B.pet, acc: B.acc, attraction: B.attraction };
  for (const [id, e] of Object.entries(L.LOOK)) if (cap[e.kind]) assert.ok(e.tris <= cap[e.kind], id + ' ' + e.tris);
  for (const id of ['kart_red', 'kart_blue', 'kart_lime', 'kart_unicorn', 'kart_gold']) assert.ok(L.LOOK[id].tris <= B.kart);
  assert.ok(L.CHARACTERS.avatar.tris <= B.avatar);
  assert.ok(L.LOOK.att_pitch.crowdTris <= B.crowd);
  const parts = (slot) => C.CATALOG.filter((x) => x.slot === slot).map((x) => L.LOOK[x.id].tris);
  const details = C.CATALOG.filter((x) => x.slot === 'detail').map((x) => x.id);
  for (const roof of C.CATALOG.filter((x) => x.slot === 'roof').map((x) => x.id)) {
    const st = L.resolveStyle('house_cottage', { roof, details });
    const total = L.LOOK.house_cottage.bodyTris + L.LOOK[roof].tris + Math.max(...parts('door')) + Math.max(...parts('wall')) +
      st.details.reduce((a, d) => a + L.LOOK[d].tris, 0);
    assert.ok(total <= L.LOOK.house_cottage.tris, roof + ' house total ' + total);
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
});

test('look: stateKey is stable and drops detail_flag when roof_castle is chosen', () => {
  const base = L.stateKey('house_cottage', {});
  assert.equal(base, 'wall_cream|roof_red|door_blue|d:');
  const st = { wall: 'wall_mint', roof: 'roof_candy', door: 'door_gold', details: { detail_lights: true, detail_chimney: true, detail_flag: false } };
  const k = L.stateKey('house_cottage', st);
  assert.equal(k, 'wall_mint|roof_candy|door_gold|d:detail_chimney,detail_lights');
  assert.equal(L.stateKey('house_cottage', JSON.parse(JSON.stringify(st))), k);
  assert.equal(L.stateKey('house_cottage', { ...st, details: ['detail_lights', 'detail_chimney', 'detail_lights'] }), k);
  /* castle hides the rooftop flag; other roofs keep it */
  assert.equal(L.stateKey('house_cottage', { roof: 'roof_castle', details: { detail_flag: true } }), L.stateKey('house_cottage', { roof: 'roof_castle' }));
  assert.ok(L.stateKey('house_cottage', { roof: 'roof_red', details: { detail_flag: true } }).endsWith('d:detail_flag'));
  assert.deepEqual(L.resolveStyle('house_cottage', { roof: 'roof_castle', details: ['detail_flag', 'detail_chimney'] }).details, ['detail_chimney']);
  /* unknown details are ignored; a full artState() object (world-core shape) works */
  assert.equal(L.stateKey('house_cottage', { details: { detail_disco: true } }), base);
  /* every wall × roof × door combination gets its own key */
  const keys = new Set();
  for (const w of C.CATALOG.filter((x) => x.slot === 'wall')) for (const r of C.CATALOG.filter((x) => x.slot === 'roof'))
    for (const d of C.CATALOG.filter((x) => x.slot === 'door')) keys.add(L.stateKey('house_cottage', { wall: w.id, roof: r.id, door: d.id }));
  assert.equal(keys.size, 5 * 5 * 4);
});

test('look: style items preview on the player house; attractions, pets and accessories key on their style', () => {
  assert.equal(L.stateKey('roof_blue', { wall: 'wall_pink' }), L.stateKey('house_cottage', { wall: 'wall_pink', roof: 'roof_blue' }));
  assert.equal(L.stateKey('detail_flag', { roof: 'roof_castle' }), L.stateKey('house_cottage', { roof: 'roof_castle' }));
  assert.equal(L.stateKey('detail_chimney', {}), 'wall_cream|roof_red|door_blue|d:detail_chimney');
  assert.deepEqual(L.resolveStyle('door_gold', { door: 'door_red' }), { wall: 'wall_cream', roof: 'roof_red', door: 'door_gold', details: [] });
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
    assert.equal(L.stateKey(id, { wall: 'wall_pink', course: 'course_candy' }), 'base', id);
  for (const it of C.CATALOG) assert.match(L.stateKey(it.id, {}), /^[a-z0-9_|:,]+$/, it.id);
  assert.equal(L.stateKey('no_such_item', {}), 'base');
});

test('look: SLOT_DEFAULTS equal SLWorldCore.DEFAULTS', () => {
  assert.deepEqual({ ...L.SLOT_DEFAULTS }, C.DEFAULTS);
});

test('look: the DAY and SHOW presets are complete and match the bible', () => {
  assert.deepEqual(Object.keys(L.DAY).sort(), Object.keys(L.SHOW).sort());
  assert.deepEqual([...L.PRESET_KEYS].sort(), Object.keys(L.DAY).sort());
  for (const k of ['hemiSky', 'hemiGround', 'hemiIntensity', 'sunColor', 'sunIntensity', 'sunPos', 'fogColor', 'fogNear', 'fogFar',
                   'exposure', 'rimColor', 'rimStrength', 'skyTop', 'skyMid', 'skyHorizon', 'seaShallow', 'seaDeep', 'foam',
                   'neonSleeve', 'haloScale', 'haloOpacity', 'stars', 'cones']) assert.ok(k in L.DAY, k);
  for (const k of L.PRESET_COLOR_KEYS) { assert.ok(L.isToken(L.DAY[k]), 'DAY ' + k); assert.ok(L.isToken(L.SHOW[k]), 'SHOW ' + k); }
  const want = { hemiIntensity: [1.9, 0.85], sunIntensity: [2.4, 0.9], exposure: [1.0, 1.08], rimStrength: [0.28, 0.55],
                 fogNear: [30, 24], fogFar: [70, 60], neonSleeve: [0, 0.45], haloScale: [1, 1.6], haloOpacity: [0.5, 0.9] };
  for (const [k, [d, s]] of Object.entries(want)) { assert.equal(L.DAY[k], d, 'DAY ' + k); assert.equal(L.SHOW[k], s, 'SHOW ' + k); }
  assert.equal(L.hex(L.DAY.hemiSky), '#DDF1FF'); assert.equal(L.hex(L.SHOW.hemiGround), '#2A1840');
  assert.equal(L.hex(L.DAY.fogColor), '#FFE3F1'); assert.equal(L.hex(L.SHOW.fogColor), '#3B1E6E');
  assert.equal(L.hex(L.SHOW.sunColor), '#B9C6FF'); assert.equal(L.hex(L.SHOW.seaDeep), '#1B2A6B');
  assert.deepEqual(L.DAY.sunPos, [-7, 14, 9]);
});

test('look: presetAt mixes DAY → SHOW, with the member colour in the Showtime rim', () => {
  const d = L.presetAt(0), s = L.presetAt(1);
  for (const k of L.PRESET_KEYS) {
    if (typeof L.DAY[k] === 'string') { assert.equal(d[k], L.hex(L.DAY[k]), k); assert.equal(s[k], L.hex(L.SHOW[k]), k); }
    else assert.deepEqual(d[k], L.DAY[k], k);
  }
  assert.equal(L.presetAt(1, '#00FF00').rimColor, L.mixHex(L.PALETTE['Rim Showtime'], '#00FF00', 0.4));
  assert.equal(L.presetAt(-3).exposure, 1.0);
  assert.equal(L.presetAt(7).exposure, 1.08);
  let prev = -Infinity;
  for (let k = 0; k <= 1.0001; k += 0.1) { const v = L.presetAt(k).haloScale; assert.ok(v >= prev); prev = v; }
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
  assert.equal(Object.keys(ctx.SLIslandLook.LOOK).length, 81);
});
