'use strict';
/* My Island 3D — photocards (world/island3d/photocard.js, island chunk 12; Encore City
   v2 chunk B11): the pure layer — [data-pc] parsing, style → render spec and cache keys
   (styles render the house on the player's own shape at trim 0, buildings render trim 0,
   accessories the pet), the stateKey inverse (shape-suffixed house keys, building keys),
   the STUDIO preset, the transparent clear, the Gunmetal riser, the per-rim icon key,
   the no-names pass over LED screens and signs, the icon / turntable framing maths,
   turntable motion, sparkles, the cone ramp, the LRU — plus the Node no-op API, a
   browser-style classic-script load and static source rules. The WebGL path runs only
   in the browser (island3d_lab.html). */
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
const KIT = require('../world/island3d/kit.js');

const SRC_PATH = path.join(__dirname, '..', 'world', 'island3d', 'photocard.js');
const SRC = fs.readFileSync(SRC_PATH, 'utf8');
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const IDS = C.CATALOG.map((it) => it.id);
const STYLES = C.CATALOG.filter((it) => it.kind === 'style').map((it) => it.id);
const ACCS = C.CATALOG.filter((it) => it.kind === 'acc').map((it) => it.id);
const PETS = C.CATALOG.filter((it) => it.kind === 'pet').map((it) => it.id);
const SHAPES = STYLES.filter((x) => /^shape_/.test(x));
const BUILDINGS = IDS.filter((x) => L.LOOK[x] && L.LOOK[x].kind === 'building');
const ST_SAMPLES = [
  {},
  { wall: 'wall_pink', roof: 'roof_castle', door: 'door_gold', details: { detail_flag: true, detail_lights: true } },
  { wall: 'wall_mint', roof: 'roof_candy', door: 'door_green', details: ['detail_chimney', 'detail_windowbox', 'detail_chimney'] },
  { wall: 'wall_graphite', roof: 'roof_thatch', door: 'door_glass', shape: 'shape_tower', variant: 1, details: ['detail_neon'] },
  { wall: 'wall_sky', roof: 'roof_blue', door: 'door_red', shape: 'shape_cottage', variant: 1 },
  { shape: 'shape_dome', roof: 'roof_castle', variant: 2, name: 'Mia', member: '#22AAFF' },
  { course: 'course_snow', ball: 'ball_gold', stadium: 'stadium_night', kart: 'kart_unicorn', variant: 2 },
  { pet: 'pet_dragon', acc: { hat: 'acc_crown', back: 'acc_cape' } },
  { pet: 'pet_kitten', acc: { neck: 'acc_scarf', face: 'acc_shades', hat: 'acc_cap' } }
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
  /* v2: the shape slot is kept (validated); the trim variant, the name and the member never are */
  assert.deepEqual(P.cleanSt({ shape: 'shape_villa', variant: 1, name: 'Mia', member: '#22AAFF', seed: 7 }, L), { shape: 'shape_villa' });
  assert.deepEqual(P.cleanSt({ shape: 'wall_pink' }, L), {}, 'a shape must be a shape');
  assert.deepEqual(P.cleanSt({ shape: 'shape_treehouse' }, L), {}, 'an unknown (future) shape is dropped');
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

test('renderSpec: style items render the player\'s own house, on the player\'s own shape, at trim 0', () => {
  ['shape_cottage', 'shape_loft', 'shape_tower', undefined].forEach((shape) => {
    const st = { wall: 'wall_sky', roof: 'roof_thatch', door: 'door_red', details: { detail_windowbox: true }, shape, variant: 1 };
    const own = shape || L.SLOT_DEFAULTS.shape;
    STYLES.forEach((id) => {
      const sp = P.renderSpec(id, st, L);
      assert.equal(sp.id, 'house_cottage', id);
      assert.equal(sp.kind, 'house');
      const slot = L.LOOK[id].slot;
      if (slot === 'detail') assert.ok(sp.st.details.includes(id) || (id === 'detail_flag' && sp.st.roof === 'roof_castle'), id);
      else assert.equal(sp.st[slot], id, id + ' replaces the ' + slot);
      ['wall', 'roof', 'door'].filter((k) => k !== slot).forEach((k) => assert.equal(sp.st[k], st[k], id + ' keeps the player\'s ' + k));
      if (slot !== 'shape') assert.equal(sp.st.shape, own, id + ' previews on the player\'s current shape (' + own + ')');
      assert.equal(sp.st.variant, 0, id + ': trim 0, never the child\'s trim');
      /* the same picture as the house in that state: one cached PNG */
      assert.equal(sp.key, P.renderSpec('house_cottage', sp.st, L).key, id);
      assert.equal(sp.stateKey, L.stateKey('house_cottage', sp.st));
      /* the cottage keeps its exact v1 key; every other shape carries its shape and trim 0 */
      if (sp.st.shape === 'shape_cottage') assert.ok(!/\|s:/.test(sp.stateKey), id + ' cottage key is the v1 key');
      else assert.ok(sp.stateKey.endsWith('|s:' + sp.st.shape + '|v:0'), id + ' ' + sp.stateKey);
    });
  });
  /* the castle drops the rooftop flag, so detail_flag on a castle is the plain castle house */
  const castle = { wall: 'wall_cream', roof: 'roof_castle', door: 'door_blue' };
  assert.equal(P.renderSpec('detail_flag', castle, L).key, P.renderSpec('house_cottage', castle, L).key);
  assert.equal(P.renderSpec('roof_red', {}, L).key, 'house_cottage#wall_cream|roof_red|door_blue|d:|s:shape_loft|v:0', 'defaults: the City loft');
  assert.equal(P.renderSpec('roof_red', { shape: 'shape_cottage' }, L).key, 'house_cottage#wall_cream|roof_red|door_blue|d:', 'the cottage: the v1 key');
  /* a shape item shows that shape wearing the player's walls, roof, door and extras */
  const mine = { wall: 'wall_lilac', roof: 'roof_candy', door: 'door_gold', details: ['detail_lights'], shape: 'shape_cottage' };
  SHAPES.forEach((id) => {
    const sp = P.renderSpec(id, mine, L);
    assert.deepEqual([sp.st.shape, sp.st.wall, sp.st.roof, sp.st.door, sp.st.details], [id, 'wall_lilac', 'roof_candy', 'door_gold', ['detail_lights']], id);
  });
});

test('renderSpec: previews of shapes and city buildings are child-independent (trim 0, no name, no member, no seed)', () => {
  const kids = [{}, { variant: 1, name: 'Mia', member: '#22AAFF', seed: 11 }, { variant: 2, name: 'Zac', member: '#FF2E9A', seed: 99, profileKey: 'zac' }];
  const base = { wall: 'wall_concrete', roof: 'roof_blue', door: 'door_glass', details: ['detail_neon'] };
  SHAPES.concat(BUILDINGS).forEach((id) => {
    const keys = new Set(kids.map((k) => P.renderSpec(id, Object.assign({}, base, k), L).key));
    assert.equal(keys.size, 1, id + ' looks the same for every child with the same style');
  });
  assert.ok(BUILDINGS.length === 7, 'the seven city buildings');
  BUILDINGS.forEach((id) => {
    const sp = P.renderSpec(id, { variant: 2 }, L);
    assert.equal(sp.id, id); assert.equal(sp.kind, 'building');
    assert.deepEqual(sp.st, { variant: 0 }, id + ' always renders trim 0');
    assert.equal(sp.stateKey, 'v:0'); assert.equal(sp.key, id + '#v:0');
    assert.equal(sp.stateKey, L.stateKey(id, { variant: 0 }));
  });
  /* the LED Screen Tower shows the star field in every photocard; the look table says so */
  assert.equal(L.LOOK.bld_ledtower.show.screen.photocard, 'stars');
  assert.equal(P.renderSpec('bld_ledtower', { variant: 1, name: 'Mia' }, L).screen, 'stars');
  ['tree_oak', 'house_cottage', 'roof_red', 'pet_puppy', 'acc_cap'].forEach((id) => assert.equal(P.renderSpec(id, {}, L).screen, null, id));
  /* without world-look a building still falls back to the star field */
  assert.equal(P.renderSpec('bld_ledtower', { variant: 1 }, null).screen, 'stars');
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
  for (let i = 0; i < 80; i++) {
    const acc = {};
    ACCS.forEach((a) => { if (r() < 0.4) acc[L.LOOK[a].socket] = a; });
    samples.push({ wall: pick(walls), roof: pick(roofs), door: pick(doors), details: details.filter(() => r() < 0.5),
      shape: pick(SHAPES), variant: Math.floor(r() * 3),
      course: pick(['course_meadow', 'course_beach', 'course_snow', 'course_candy']), ball: pick(['ball_classic', 'ball_planet']),
      stadium: pick(['stadium_day', 'stadium_snow']), kart: pick(['kart_red', 'kart_lime']), pet: pick(PETS), acc });
  }
  let suffixed = 0, cottages = 0;
  IDS.forEach((id) => samples.forEach((st) => {
    const key = L.stateKey(id, st);
    const back = P.stFromKey(id, key, L);
    assert.equal(L.stateKey(id, back), key, id + ' ' + key);
    assert.equal(P.renderSpec(id, back, L).key, P.renderSpec(id, st, L).key, id + ' renders the same');
    if (/\|s:shape_[a-z]+\|v:\d$/.test(key)) suffixed++; else if (/\|d:[a-z_,]*$/.test(key)) cottages++;
  }));
  assert.ok(suffixed > 100 && cottages > 50, 'both key forms were round-tripped (' + suffixed + ' / ' + cottages + ')');
  /* the shape suffix and the building trim parse back exactly */
  assert.deepEqual(P.stFromKey('house_cottage', 'wall_pink|roof_red|door_glass|d:detail_neon|s:shape_tower|v:1', L),
    { wall: 'wall_pink', roof: 'roof_red', door: 'door_glass', details: ['detail_neon'], shape: 'shape_tower', variant: 1 });
  assert.deepEqual(P.stFromKey('roof_blue', 'wall_cream|roof_blue|door_blue|d:', L),
    { wall: 'wall_cream', roof: 'roof_blue', door: 'door_blue', details: [], shape: 'shape_cottage' }, 'a key without the suffix is the cottage');
  assert.deepEqual(P.stFromKey('bld_dance', 'v:2', L), { variant: 2 });
  assert.deepEqual(P.stFromKey('bld_dance', 'v:x', L), {});
  assert.deepEqual(P.stFromKey('house_cottage', 'garbage', L), {});
  assert.deepEqual(P.stFromKey('house_cottage', 'wall_x|roof_red|door_blue|d:tree_oak', L), { roof: 'roof_red', door: 'door_blue', details: [], shape: 'shape_cottage' });
  assert.deepEqual(P.stFromKey('house_cottage', 'wall_pink|roof_red|door_blue|d:|s:shape_nope|v:1', L),
    { wall: 'wall_pink', roof: 'roof_red', door: 'door_blue', details: [], variant: 1 }, 'an unknown shape falls back to the default');
  assert.deepEqual(P.stFromKey('tree_oak', 'base', L), {});
  assert.deepEqual(P.stFromKey('nope', 'x', L), {});
});

test('data-pck from the island (any shape, any trim) gives the child-independent trim-0 picture', () => {
  ['shape_loft', 'shape_villa', 'shape_tower', 'shape_dome'].forEach((shape) => [0, 1].forEach((variant) => {
    const st = { wall: 'wall_midnight', roof: 'roof_castle', door: 'door_glass', details: ['detail_neon', 'detail_lights'], shape, variant };
    const key = L.stateKey('house_cottage', st);
    assert.ok(key.endsWith('|s:' + shape + '|v:' + variant));
    const sp = P.renderSpec('house_cottage', P.stFromKey('house_cottage', key, L), L);
    assert.equal(sp.stateKey, L.stateKey('house_cottage', Object.assign({}, st, { variant: 0 })), shape + ' v' + variant);
  }));
  BUILDINGS.forEach((id) => [0, 1, 2].forEach((v) => assert.equal(P.renderSpec(id, P.stFromKey(id, 'v:' + v, L), L).key, id + '#v:0')));
});

/* ---------------- Cache Storage naming ---------------- */
test('cache naming: sl-pc-<LOOK_VERSION> (sl-pc-2 for Encore City), same-origin keys, stale sweeps and trims', () => {
  assert.equal(L.LOOK_VERSION, 2, 'Encore City bumped the look version');
  assert.equal(P.cacheName(L.LOOK_VERSION), 'sl-pc-2', 'the v1 icons (sl-pc-1) are swept, never shown');
  assert.equal(P.cacheName(L.LOOK_VERSION), 'sl-pc-' + L.LOOK_VERSION);
  assert.ok(/cacheName\(lookVersion\(\)\)/.test(SRC), 'the Cache Storage name follows SLIslandLook.LOOK_VERSION');
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

test('iconKey: icons are cached per studio rim colour (siblings never share a tint); no member → the bare key', () => {
  const k = P.renderSpec('bld_boba', {}, L).key;
  assert.equal(P.iconKey(k, '#22AAFF'), 'bld_boba#v:0@22aaff');
  assert.equal(P.iconKey(k, '22aaff'), P.iconKey(k, '#22AAFF'), 'case and # never split the cache');
  assert.notEqual(P.iconKey(k, '#22AAFF'), P.iconKey(k, '#FF2E9A'));
  for (const bad of [null, undefined, '', 'red', '#12345', 7, {}]) assert.equal(P.iconKey(k, bad), k);
  assert.ok(!/[A-Z]/.test(P.iconKey(k, '#ABCDEF').split('@')[1]));
  assert.ok(/spec\.key = iconKey\(spec\.key, spec\.member\)/.test(SRC), 'every icon request is keyed by its rim');
  assert.ok(/holdStudio\(R, job\.spec\.member\)/.test(SRC), 'an icon renders with the rim its key names');
});

/* ---------------- the STUDIO preset, the clear and the riser ---------------- */
test('STUDIO preset: Studio Sky / Ground hemi at 1.4, a Studio Key of 2.2 from (−5, 8, 9), the member rim at 0.45', () => {
  assert.deepEqual(Object.assign({}, P.STUDIO, { keyPos: P.STUDIO.keyPos.slice() }), {
    hemiSky: 'Studio Sky', hemiGround: 'Studio Ground', hemiIntensity: 1.4, keyColor: 'Studio Key', keyIntensity: 2.2,
    keyPos: [-5, 8, 9], rim: '@member', rimStrength: 0.45, exposure: 1.0
  });
  assert.ok(Object.isFrozen(P.STUDIO) && Object.isFrozen(P.STUDIO.keyPos), 'a shared constant');
  const s = P.studioLights(L, '#22aaff');
  assert.equal(s.hemiSky, L.PALETTE_V2['Studio Sky']); assert.equal(s.hemiSky, '#B9B0FF');
  assert.equal(s.hemiGround, L.PALETTE_V2['Studio Ground']); assert.equal(s.hemiGround, '#2A2240');
  assert.equal(s.keyColor, L.PALETTE_V2['Studio Key']); assert.equal(s.keyColor, '#FFE2C8');
  assert.deepEqual([s.hemiIntensity, s.keyIntensity, s.rimStrength, s.exposure], [1.4, 2.2, 0.45, 1.0]);
  assert.deepEqual(s.keyPos, [-5, 8, 9]);
  assert.equal(s.rim, '#22AAFF', 'the rim is the child\'s member colour');
  /* the key light comes from the front-right and above: it lights the 3/4 face the icon camera sees */
  const B = P.basis(P.CAM.yaw, P.CAM.elev), kp = s.keyPos, len = Math.hypot(...kp);
  assert.ok((kp[0] * B.D.x + kp[1] * B.D.y + kp[2] * B.D.z) / len > 0.4, 'the key faces the camera side');
  /* no member yet → the look's member fallback (never a name, never a random colour) */
  assert.equal(P.studioLights(L, null).rim, L.hex('@member', {}));
  assert.equal(P.studioLights(L, 'nope').rim, L.PALETTE[L.MEMBER_FALLBACK]);
  /* the art bible's v2 photocard line names exactly these values */
  const bible = JSON.stringify(JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'docs', 'island3d', 'v2', 'plan-v2.json'), 'utf8')).artBibleV2);
  assert.ok(/Photocard STUDIO preset: hemi Studio Sky \/ Studio Ground at 1\.4; key Studio Key 2\.2 from \(-5, 8, 9\); rim = member colour at 0\.45/.test(bible));
  /* the kit's rim and Showtime mix are held at the studio look during a render, then restored */
  assert.ok(/function holdStudio\(R, member\)/.test(SRC) && /K\.setRim\(studioRim\(R, member\), STUDIO\.rimStrength\)/.test(SRC));
  assert.ok(/releaseStudio\(R\)/.test(SRC) && /K\.setShow\(0\)/.test(SRC));
  assert.ok(/new T\.HemisphereLight\(K\.col\(STUDIO\.hemiSky\), K\.col\(STUDIO\.hemiGround\), STUDIO\.hemiIntensity\)/.test(SRC));
  assert.ok(/new T\.DirectionalLight\(K\.col\(STUDIO\.keyColor\), STUDIO\.keyIntensity\)/.test(SRC));
  assert.ok(!/\bDAY\b|dayPreset/.test(SRC.replace(/\/\*[\s\S]*?\*\//g, '')), 'no golden-hour or v1 day light in a photocard');
});

test('transparent clear: the renderer clears to alpha 0 so the PNG and the turntable sit on the dark CSS well', () => {
  assert.deepEqual(Object.assign({}, P.CLEAR), { color: 0x000000, alpha: 0 });
  assert.ok(Object.isFrozen(P.CLEAR));
  assert.ok(/S\.createRenderer\(\{ alpha: true,/.test(SRC), 'an alpha drawing buffer');
  assert.ok(/r\.setClearColor\(CLEAR\.color, CLEAR\.alpha\)/.test(SRC), 'cleared to fully transparent');
  const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/\.background\s*=/.test(code), 'no scene background behind an icon or a turntable');
  assert.ok(/ctx\.clearRect\(0, 0, OUT, OUT\)/.test(code) && /ctx\.clearRect\(0, 0, tt\.w, tt\.h\)/.test(code), 'the 2D copies start transparent too');
  assert.ok(/r\.toneMappingExposure = STUDIO\.exposure/.test(code));
});

test('the riser: a Gunmetal disc r 0.7 (gunmetal matcap) with a Neon Magenta ring and two crossing cones', () => {
  assert.equal(P.TT.riserR, 0.7);
  assert.equal(P.RISER.mat, 'gunmetal');
  assert.ok(L.MATCAPS.gunmetal, 'the look has the gunmetal matcap');
  assert.equal(KIT.programFamily(P.RISER.mat), KIT.programFamily('chrome'), 'it shares the one matcap program');
  ['top', 'side', 'base'].forEach((k) => assert.ok(/^Gunmetal/.test(P.RISER[k]) && L.PALETTE_V2[P.RISER[k]], k));
  assert.equal(P.RISER.ring, 'Neon Magenta'); assert.equal(L.PALETTE_V2['Neon Magenta'], '#FF2E9A');
  assert.deepEqual(P.RISER.cones.slice(), ['Neon Magenta', 'LED Cyan']);
  P.RISER.cones.forEach((t) => assert.ok(L.PALETTE_V2[t], t + ' is a v2 neon token'));
  assert.ok(P.RISER.coneAlpha > 0 && P.RISER.coneAlpha <= 0.22, 'soft beams');
  assert.ok(/K\.mat\(RISER\.mat\)/.test(SRC) && /K\.mat\('neon:' \+ RISER\.ring\)/.test(SRC));
  assert.ok(/RISER\.cones\.map/.test(SRC));
  assert.equal(P.RISER_TOP, undefined, 'the v1 pink riser top is gone');
  const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const t of ['Riser Top', 'Holo Pink', "'Neon Pink'", "'Neon Cyan'", "'Holo Blue'", "'Sea Shallow'", "'Sea Deep'", "'Foam'"]) assert.ok(!code.includes(t), 'no v1 token ' + t);
  assert.ok(/SPARKLE_TOKENS = \['Star Gold', 'Neon Magenta', 'LED Cyan', 'Bone White'\]/.test(code), 'debut sparkles in the v2 neon set');
});

/* ---------------- no names in a photocard ---------------- */
test('atlas cells: ledProgramAt / signCellAt read the kit\'s own windows (every program and phase; the name + initial cell)', () => {
  assert.deepEqual(P.LED_PROGRAMS.slice(), KIT.LED_PROGRAMS);
  ['w', 'h', 'stripW', 'cellH', 'cols'].forEach((k) => assert.equal(P.LED_LAYOUT[k], KIT.LED[k], 'LED ' + k));
  ['w', 'h', 'cellW', 'cellH', 'cols', 'userCell'].forEach((k) => assert.equal(P.SIGN_LAYOUT[k], KIT.SIGN[k], 'SIGN ' + k));
  KIT.LED_PROGRAMS.forEach((p, i) => [0, 0.25, 0.5, 0.999].forEach((ph) => {
    const w = KIT.ledWindow(p, ph);
    assert.equal(P.ledProgramAt(w.ox, w.oy), i, p + ' @' + ph);
    assert.equal(P.ledProgramAt(w.ox, w.oy, KIT.LED), i);
  }));
  KIT.SIGN_WORDS.forEach((word, i) => { const r = KIT.signRect(word); assert.equal(P.signCellAt(r.u0, r.v0), i, word); });
  for (const u of [':name', ':initial']) { const r = KIT.signRect(u); assert.equal(P.signCellAt(r.u0, r.v0), KIT.SIGN.userCell, u); }
  assert.equal(P.ledProgramAt(1.2, 0), -1); assert.equal(P.signCellAt(0, 2), -1);
});

/* a fake kit + copy: just the fields depersonalise() reads */
function fakeKit() {
  const made = [], ledTex = { source: { id: 'led' } }, signTex = { source: { id: 'sign' } };
  const view = (p) => { const w = KIT.ledWindow(p, 0); return { source: ledTex.source, offset: { x: w.ox, y: w.oy, set(x, y) { this.x = x; this.y = y; } }, repeat: { set() {} } }; };
  const variants = new Map();
  const K = {
    ledAtlas: () => ({ texture: ledTex, view, setWindow(t, p, ph) { const w = KIT.ledWindow(p, ph); t.offset.set(w.ox, w.oy); return t; } }),
    signAtlas: () => ({ texture: signTex }),
    variant(key, name, patch) { const vk = key + '#' + name; if (!variants.has(vk)) { const m = Object.assign({ name: vk, visible: true }, patch); variants.set(vk, m); made.push(vk); } return variants.get(vk); }
  };
  const ledMat = (name, prog, ph) => { const w = KIT.ledWindow(prog, ph || 0); return { name, map: { source: ledTex.source, offset: { x: w.ox, y: w.oy } } }; };
  const signMat = (name, word) => { const r = KIT.signRect(word); return { name, map: { source: signTex.source, offset: { x: r.u0, y: r.v0 } } }; };
  const mesh = (material) => ({ isMesh: true, visible: true, material });
  const group = (kids) => ({ traverse(fn) { kids.forEach(fn); } });
  return { K, made, ledMat, signMat, mesh, group };
}
test('depersonalise: the screen tower shows its star field, a name window turns to stars, the name / initial sign cells hide', () => {
  const F = fakeKit();
  const tower = F.mesh(F.ledMat('led#p:name', 'name', 0.4));
  const other = F.mesh(F.ledMat('led#p:eq', 'eq', 0.2));
  const nameScreen = F.mesh(F.ledMat('led', 'name', 0));
  const initial = F.mesh(F.signMat('sign#w::INITIAL', ':initial'));
  const word = F.mesh(F.signMat('sign#w:PHOTO', 'PHOTO'));
  const plain = F.mesh({ name: 'toon' });
  const multi = F.mesh([{ name: 'toon' }, F.signMat('sign', ':name')]);
  /* the LED tower: every screen shows the photocard program, whatever the template drew */
  assert.equal(P.depersonalise(F.group([tower, other]), { screen: 'stars' }, F.K), 2);
  assert.equal(tower.material.name, 'led#pc:stars'); assert.equal(other.material.name, 'led#pc:stars');
  assert.equal(P.ledProgramAt(tower.material.map.offset.x, tower.material.map.offset.y), KIT.LED_PROGRAMS.indexOf('stars'));
  /* any other look: only a name window changes; an EQ screen keeps its program */
  const eq = F.mesh(F.ledMat('led#p:eq', 'eq', 0.2)), eqMat = eq.material;
  assert.equal(P.depersonalise(F.group([eq, nameScreen, initial, word, plain, multi]), { screen: null }, F.K), 3);
  assert.equal(eq.material, eqMat, 'non-personal programs stay as built');
  assert.equal(nameScreen.material.name, 'led#pc:stars', 'a name marquee becomes the star field');
  assert.equal(initial.material.name, 'sign#pc:hidden'); assert.equal(initial.material.visible, false, 'the initial is not drawn');
  assert.equal(word.material.name, 'sign#w:PHOTO', 'whitelisted words stay');
  assert.equal(plain.material.name, 'toon');
  assert.equal(multi.material[0].name, 'toon'); assert.equal(multi.material[1].visible, false, 'only the name group of a multi-material mesh hides');
  /* the swapped-in materials are photocard siblings, made once (never the kit's shared ones) */
  assert.deepEqual(F.made.sort(), ['led#pc:stars', 'sign#pc:hidden']);
  /* an unnamed material is recognised by its atlas source */
  const anon = F.mesh(F.ledMat('', 'name', 0));
  P.depersonalise(F.group([anon]), {}, F.K);
  assert.equal(anon.material.name, 'led#pc:stars');
  /* junk in, nothing thrown */
  assert.equal(P.depersonalise(null, {}, F.K), 0);
  assert.equal(P.depersonalise(F.group([F.mesh(null)]), {}, F.K), 0);
  assert.ok(/settle\(out\);\s*depersonalise\(obj, spec, K\);/.test(SRC), 'every built copy (icons and turntables) goes through it');
  assert.ok(/this\.photocard = true; this\.member = /.test(SRC) && /this\.screen = spec\.screen/.test(SRC), 'models see a.photocard, a.member and a.screen');
});

test('fontsFor: icons wait for the display fonts their textures use (PET COURSE banner, city signs)', () => {
  assert.deepEqual(P.fontsFor('att_course'), ['400 48px "Bagel Fat One"', '800 48px "Unbounded"']);
  assert.deepEqual(P.fontsFor('course_snow'), P.fontsFor('att_course'));
  BUILDINGS.forEach((id) => assert.deepEqual(P.fontsFor(id), ['800 48px "Unbounded"'], id));
  assert.deepEqual(P.fontsFor('tree_oak'), []); assert.deepEqual(P.fontsFor(undefined), []);
  assert.ok(/fontGate\(fontsFor\(spec\.id\)\)/.test(SRC));
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

test('needsFont: the PET COURSE banner items and the city buildings (signs, screens) wait for a display font', () => {
  assert.equal(P.needsFont('att_course'), true);
  assert.equal(P.needsFont('course_snow'), true);
  assert.equal(P.needsFont('bld_recording'), true);
  assert.equal(P.needsFont('tree_oak'), false);
  assert.equal(P.needsFont('house_cottage'), false, 'the neon tower\'s initial never shows in a photocard, so houses need no font');
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
  assert.equal(P.setUser({ color: '#22AAFF' }), P, 'setUser is chainable and harmless in Node');
  P.dispose();
  assert.deepEqual(P.info(), { dom: false });
  assert.equal(P.VERSION, 2);
  assert.equal(P.OUT, 256, '256² PNGs');
  assert.equal(P.IDLE_MS, 30000, 'the renderer is disposed after 30 s idle');
  assert.deepEqual([P.CAM.fov, P.CAM.elev, P.CAM.yaw, P.CAM.fill], [30, 28, 25, 0.8]);
  assert.equal(P.TT.riserR, 0.7);
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
  ['fill', 'turntable', 'prewarm', 'url', 'setUser', 'clear', 'dispose', 'info'].forEach((k) => assert.equal(typeof api[k], 'function', k));
  /* the member colour lights the rim and keys the icons; junk clears it */
  assert.equal(api.info().member, null);
  assert.equal(api.setUser({ color: '#22aaff' }), api);
  assert.equal(api.info().member, '#22AAFF');
  api.setUser({ color: 'pink' });
  assert.equal(api.info().member, null);
  api.setUser(null);
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
  assert.ok(!/#[0-9a-fA-F]{6}\b/.test(SRC.replace(/\/\*[\s\S]*?\*\//g, '')), 'no raw hex colours: every colour is a look token (or the child\'s member colour)');
  assert.ok(!/fillText|strokeText/.test(SRC), 'a photocard draws no words of its own (texture text comes only from the kit atlases)');
});

test('stage.js loads photocard.js as the SLPhotocard global; the architecture names it', () => {
  const f = S.FILES.find((x) => x.path === 'photocard.js');
  assert.ok(f, 'in the stage file list');
  assert.equal(f.global, 'SLPhotocard');
  assert.ok(!f.required, 'optional: a missing photocard file keeps the SVG icons');
  const arch = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'docs', 'island3d', 'island-architecture.json'), 'utf8'));
  assert.ok(JSON.stringify(arch).includes("'sl-pc-<LOOK_VERSION>'"));
});
