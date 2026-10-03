'use strict';
/* Encore City v2 — the 2D fallback art and icon set (world/world-art.js, chunk B13).
   Every new catalogue id must draw well-formed SVG; v1 art must stay byte-identical. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ART = require('../world/world-art.js').SLWorldArt;
const C = require('../world/world-core.js');
const L = require('../world/world-look.js');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'world', 'world-art.js'), 'utf8');

/* the 23 ids of plan-v2 catalogAdditions (coded against the plan so this suite runs before and after A1 lands) */
const SHAPES = ['shape_cottage', 'shape_loft', 'shape_villa', 'shape_tower', 'shape_dome'];
const WALLS_V2 = { wall_concrete: '#a9a5b3', wall_gallery: '#eceaf2', wall_graphite: '#34303f', wall_midnight: '#232a57' };
const BUILDINGS = { bld_photobooth: [1, 1], bld_boba: [2, 1], bld_ledtower: [1, 1], bld_recording: [2, 1], bld_dance: [2, 2], bld_rooftop: [2, 2], bld_stage: [3, 2] };
const SIZE_BY_FP = { '1x1': [100, 170], '2x1': [200, 170], '2x2': [200, 250], '3x2': [300, 230] };
const ACCS = { acc_beanie: 'hat', acc_cap: 'hat', acc_headphones: 'neck', acc_visor: 'face', acc_hoodie: 'back' };
const NEW_IDS = SHAPES.concat(Object.keys(WALLS_V2), ['door_glass', 'detail_neon'], Object.keys(BUILDINGS), Object.keys(ACCS));
const ROOFS = ['roof_red', 'roof_blue', 'roof_thatch', 'roof_candy', 'roof_castle'];
const DOORS = ['door_blue', 'door_red', 'door_green', 'door_gold', 'door_glass'];
const WALLS = ['wall_cream', 'wall_pink', 'wall_mint', 'wall_sky', 'wall_lilac'].concat(Object.keys(WALLS_V2));
const DETAILS = ['detail_windowbox', 'detail_chimney', 'detail_lights', 'detail_flag', 'detail_neon'];
const SIGN_WORDS = L.SIGN_WORDS || ['ENCORE', 'SHOWTIME', 'ON AIR', 'PHOTO', 'DANCE', 'PET COURSE', 'ISLAND'];
const UI_NAMES = ['shop', 'crew', 'games', 'edit', 'home', 'goal', 'storage', 'city', 'showtime', 'golden', 'music', 'close', 'rotL', 'rotR', 'zoomIn', 'zoomOut', 'reset'];

/* ---------------- a strict little XML well-formedness check ---------------- */
function wellFormed(s) {
  const tagRe = /<(\/?)([A-Za-z][\w:-]*)((?:\s+[\w:-]+="[^"<]*")*)\s*(\/?)>/y, stack = [];
  let i = 0;
  while (i < s.length) {
    const lt = s.indexOf('<', i), text = s.slice(i, lt < 0 ? s.length : lt);
    if (/>/.test(text) || /&(?!(amp|lt|gt|quot|#39|#\d+);)/.test(text)) return 'unescaped text: ' + text.slice(0, 40);
    if (lt < 0) break;
    tagRe.lastIndex = lt;
    const m = tagRe.exec(s);
    if (!m) return 'bad tag: ' + s.slice(lt, lt + 80);
    const names = [...m[3].matchAll(/([\w:-]+)="/g)].map((x) => x[1]);
    if (new Set(names).size !== names.length) return 'duplicate attribute in <' + m[2] + '>';
    if (m[1]) { if (stack.pop() !== m[2]) return 'mismatched </' + m[2] + '>'; } else if (!m[4]) stack.push(m[2]);
    i = tagRe.lastIndex;
  }
  return stack.length ? 'unclosed <' + stack.join('>, <') + '>' : '';
}
function assertSvg(s, where, w, h) {
  assert.equal(typeof s, 'string', where);
  assert.match(s, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 \d+ \d+"/, where + ' root');
  if (w) assert.ok(s.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + h + '"'), where + ' viewBox ' + w + '×' + h);
  assert.ok(s.endsWith('</svg>'), where + ' closes');
  assert.equal(wellFormed(s), '', where);
  assert.ok(!/undefined|NaN|Infinity|null|\[object/.test(s), where + ' has no junk values');
  for (const hex of s.match(/#[0-9a-fA-F]+\b/g) || []) assert.ok(hex.length === 4 || hex.length === 7, where + ' bad hex ' + hex);
  assert.ok(!/<(animate|set|script|foreignObject|image|use)\b/.test(s), where + ' no SMIL, scripts or external refs');
  assert.ok(!/(href|url)\s*[=(]/.test(s.replace(/url\(#slw\w+\)/g, '')), where + ' no links');
  /* inline styles only stagger CSS-owned animations, set a transform origin, or pin a nested screen's clip */
  for (const m of s.matchAll(/style="([^"]*)"/g)) for (const decl of m[1].split(';').filter(Boolean)) assert.match(decl.trim(), /^(animation-delay:[\d.]+s|transform-box:fill-box|transform-origin:[\d.%\s pxa-z]+|overflow:hidden|width:\d+px|height:\d+px)$/, where + ' style ' + decl);
}
const texts = (s) => [...s.matchAll(/<text\b[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);
const house = (st) => ART.sprite('house_cottage', st).svg;
const FALLBACK = '<rect x="14" y="14" width="72" height="72" rx="18" fill="#eee"/>';

/* the v1 fingerprint: every v1 house combo, icon, sprite and pet × accessory render */
const V1_IDS = ['house_cottage', 'att_course', 'pet_puppy', 'wall_cream', 'roof_red', 'door_blue', 'course_meadow', 'flower_tulip', 'flower_daisy', 'flower_sun', 'bush_rose', 'rock_mossy',
  'tree_oak', 'tree_pine', 'tree_apple', 'tree_blossom', 'tree_palm', 'lantern', 'mushroom_glow', 'flag_pole', 'bunting', 'bench', 'sandcastle', 'umbrella', 'snowman', 'windmill',
  'lighthouse', 'path_stone', 'path_wood', 'path_flower', 'trampoline', 'fountain', 'swing', 'bubbles', 'wall_pink', 'wall_mint', 'wall_sky', 'wall_lilac', 'roof_blue', 'roof_thatch',
  'roof_candy', 'roof_castle', 'door_red', 'door_green', 'door_gold', 'detail_windowbox', 'detail_chimney', 'detail_lights', 'detail_flag', 'pet_kitten', 'pet_bunny', 'pet_dragon',
  'acc_partyhat', 'acc_crown', 'acc_bow', 'acc_scarf', 'acc_shades', 'acc_cape', 'land_cove', 'land_meadow', 'att_pitch', 'att_kart', 'course_beach', 'course_snow', 'course_candy',
  'ball_classic', 'ball_rainbow', 'ball_planet', 'ball_gold', 'stadium_day', 'stadium_night', 'stadium_beach', 'stadium_snow', 'kart_red', 'kart_blue', 'kart_lime', 'kart_unicorn',
  'kart_gold', 'track_loop', 'track_volcano', 'track_beach'];
function fnv(h, s) { for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; }
/* The pet face is the one v1 drawing v2 changes on purpose (review fix ui-4: the 2D crew
   lost the big glossy eye, the U smile and the permanent blush for the v2 lidded eye and
   smirk, all inside <g class="slw-face">). So the fingerprint is taken with the face cut
   out: V1_FACE is how the pin was made from the pre-v2 art (the raw pre-v2 fingerprint was
   130c5e61; with v1's eye + glint and smile + blush removed it is 8ff51ccb), and V2_FACE
   cuts the v2 group out of today's art. Equal pins = every house, icon, sprite, pet body,
   PETCOL colour and accessory anchor is still byte-identical; only the face moved. */
const V1_FACE = (s) => s.replace(/<circle cx="[\d.]+" cy="[\d.]+" r="3\.8" fill="#3b2f4a"\/><circle cx="[\d.]+" cy="[\d.]+" r="1\.3" fill="#fff"\/>/g, '')
  .replace(/<path d="M[\d.]+ [\d.]+ q 4 4 8 0" fill="none" stroke="#3b2f4a" stroke-width="2" stroke-linecap="round"\/><circle cx="[\d.]+" cy="[\d.]+" r="3\.5" fill="#ff9db8" opacity="0\.6"\/>/g, '');
const V2_FACE = (s) => s.replace(/<g class="slw-face">[\s\S]*?<\/g>/g, '');
function v1Fingerprint(A, extra, N) {
  N = N || V2_FACE;
  let h = 2166136261;
  const walls = ['wall_cream', 'wall_pink', 'wall_mint', 'wall_sky', 'wall_lilac'], roofs = ['roof_red', 'roof_blue', 'roof_thatch', 'roof_candy', 'roof_castle'];
  const doors = ['door_blue', 'door_red', 'door_green', 'door_gold'], dets = ['detail_windowbox', 'detail_chimney', 'detail_lights', 'detail_flag'];
  for (const w of walls) for (const r of roofs) for (const d of doors) for (let m = 0; m < 16; m++) {
    const details = {}; dets.forEach((k, i) => { if (m & (1 << i)) details[k] = true; });
    h = fnv(h, N(A.sprite('house_cottage', Object.assign({ wall: w, roof: r, door: d, details }, extra)).svg));
  }
  const st = Object.assign({ wall: 'wall_mint', roof: 'roof_candy', door: 'door_gold', details: { detail_lights: true }, course: 'course_snow', ball: 'ball_planet', stadium: 'stadium_night', kart: 'kart_unicorn' }, extra);
  for (const id of V1_IDS) {
    h = fnv(h, N(A.icon(id))); h = fnv(h, N(A.icon(id, st)));
    const s = A.sprite(id, Object.assign({ lit: true }, st)); h = fnv(h, s ? N(s.svg) + s.w + 'x' + s.h : 'null');
  }
  const hats = [null, 'acc_partyhat', 'acc_crown'], necks = [null, 'acc_bow', 'acc_scarf'], faces = [null, 'acc_shades'], backs = [null, 'acc_cape'];
  for (const p of ['pet_puppy', 'pet_kitten', 'pet_bunny', 'pet_dragon']) for (const hat of hats) for (const neck of necks) for (const face of faces) for (const back of backs) for (const frame of [0, 1]) {
    h = fnv(h, N(A.pet(p, { frame, acc: { hat, neck, face, back } })));
  }
  return (h >>> 0).toString(16);
}

/* ---------------- v1 stays byte-identical (all but the de-babied pet face) ---------------- */
test('art v2: every v1 render is byte-identical to the pre-v2 art, the pet face aside (pinned fingerprint)', () => {
  /* 8ff51ccb = the rewards-world world-art.js before Encore City v2, pet face cut out (see V1_FACE) */
  assert.equal(v1Fingerprint(ART, {}), '8ff51ccb');
  assert.equal(v1Fingerprint(ART, { shape: 'shape_cottage' }), '8ff51ccb', 'shape_cottage draws the v1 cottage');
  assert.equal(v1Fingerprint(ART, { shape: 'shape_split', variant: 1, member: '#12ab9f', name: 'Zoe' }), '8ff51ccb', 'unknown shapes fall back to the cottage; trim/member/name never touch v1 art');
  /* the cut is not vacuous: every pet render has exactly one v2 face, and none of v1's */
  for (const p of ['pet_puppy', 'pet_kitten', 'pet_bunny', 'pet_dragon']) for (const acc of [{}, { hat: 'acc_crown', face: 'acc_shades', back: 'acc_cape' }]) {
    const s = ART.pet(p, { acc });
    assert.equal((s.match(/<g class="slw-face">/g) || []).length, 1, p);
    assert.equal(V1_FACE(s), s, p + ' carries nothing of the v1 face');
  }
});

test('art v2: the house without a shape, with shape_cottage and with an unknown shape are the same drawing', () => {
  for (const roof of ROOFS) {
    const st = { wall: 'wall_sky', roof, door: 'door_green', details: { detail_flag: true, detail_lights: true } };
    const base = house(st);
    assert.equal(house(Object.assign({ shape: 'shape_cottage', variant: 1 }, st)), base, roof);
    assert.equal(house(Object.assign({ shape: 'shape_nope' }, st)), base, roof);
  }
  assert.equal(ART.icon('shape_cottage'), ART.icon('roof_red'), 'the cottage shape icon is the classic house');
});

/* ---------------- every new id draws ---------------- */
test('art v2: icon() draws well-formed SVG for every new id, never the grey fallback', () => {
  assert.equal(NEW_IDS.length, 23);
  for (const id of NEW_IDS) {
    const s = ART.icon(id);
    assertSvg(s, 'icon ' + id);
    assert.ok(!s.includes(FALLBACK), id + ' has real art');
    assertSvg(ART.icon(id, { shape: 'shape_dome', member: '#33cc99', name: 'Zoe', variant: 2 }), 'icon+st ' + id);
  }
});

test('art v2: every catalogue id (v1 and, once A1 lands, v2) has a sprite or an icon', () => {
  const ids = new Set(C.CATALOG.map((it) => it.id).concat(NEW_IDS));
  for (const id of ids) {
    const s = ART.icon(id);
    assertSvg(s, 'icon ' + id);
    assert.ok(!s.includes(FALLBACK), id + ' falls back to the grey swatch');
  }
});

test('art v2: sprite() draws each city building at its footprint size; non-placeable new ids stay null', () => {
  for (const [id, fp] of Object.entries(BUILDINGS)) {
    const it = C.item(id);
    if (it) assert.deepEqual(it.fp, fp, id + ' footprint matches the catalogue');
    const size = SIZE_BY_FP[fp.join('x')];
    for (const variant of [0, 1, 2]) {
      const sp = ART.sprite(id, { variant, name: 'Mia', member: '#ff8800', pet: 'pet_bunny', lit: true });
      assert.ok(sp, id);
      assert.deepEqual([sp.w, sp.h], size, id + ' size');
      assertSvg(sp.svg, id + ' v' + variant, size[0], size[1]);
    }
    assertSvg(ART.sprite(id).svg, id + ' with no state');
  }
  for (const id of NEW_IDS.filter((x) => !BUILDINGS[x])) assert.equal(ART.sprite(id, {}), null, id + ' is not placeable');
  assert.deepEqual(ART.BUILDINGS.slice().sort(), Object.keys(BUILDINGS).sort());
});

test('art v2: the three building trims differ (accent, sign side, stripe) and out-of-range trims clamp', () => {
  for (const id of Object.keys(BUILDINGS)) {
    const v = [0, 1, 2].map((variant) => ART.sprite(id, { variant, member: '#ff8800' }).svg);
    assert.equal(new Set(v).size, 3, id + ' has 3 distinct trims');
    assert.equal(ART.sprite(id, { variant: 9, member: '#ff8800' }).svg, v[2], id + ' clamps high');
    assert.equal(ART.sprite(id, { variant: -4, member: '#ff8800' }).svg, v[0], id + ' clamps low');
    assert.ok(v[0].includes('#ff8800'), id + ' trim 0 carries the member colour');
    assert.ok(v[1].includes('#ff2e9a') && v[2].includes('#22e4ff'), id + ' trims 1/2 use Neon Magenta / LED Cyan');
  }
});

/* ---------------- home shapes ---------------- */
test('art v2: all 5 shapes × 5 roofs × 5 doors × 9 walls draw, with the door at x 86–114 on the y≈206 step', () => {
  for (const shape of SHAPES) for (const roof of ROOFS) for (const door of DOORS) for (const wall of WALLS) {
    const s = house({ shape, roof, door, wall });
    const where = [shape, roof, door, wall].join(' ');
    assertSvg(s, where, 200, 250);
    assert.ok(s.includes('<rect x="80" y="206" width="40" height="6" rx="3"'), where + ' door step');
    assert.match(s, /<rect x="86" y="\d+" width="28"|<path d="M86 208 /, where + ' door at x 86–114');
    assert.ok(s.includes('fill="' + (WALLS_V2[wall] || L.LOCKED.WALL[wall]).toLowerCase() + '"'), where + ' wall colour');
  }
});

test('art v2: every detail combination draws on every shape; trims 0/1 differ on modern shapes only', () => {
  for (const shape of SHAPES) {
    for (let m = 0; m < 32; m++) {
      const details = {};
      DETAILS.forEach((k, i) => { if (m & (1 << i)) details[k] = true; });
      for (const roof of ['roof_red', 'roof_castle']) assertSvg(house({ shape, roof, details, variant: m & 1, member: '#4466ff' }), shape + ' ' + roof + ' details ' + m, 200, 250);
    }
    const a = house({ shape, variant: 0 }), b = house({ shape, variant: 1 });
    if (shape === 'shape_cottage') assert.equal(a, b, 'the cottage has no trims');
    else assert.notEqual(a, b, shape + ' trims differ');
    assert.equal(house({ shape, variant: 7 }), a, shape + ' only trim 1 is the alternate');
  }
  const shapes = SHAPES.map((shape) => house({ shape }));
  assert.equal(new Set(shapes).size, 5, 'five genuinely different drawings');
});

test('art v2: every roof name stays true on every shape (the crown), and the castle drops the flag', () => {
  for (const shape of SHAPES) {
    const det = { details: { detail_flag: true } };
    const red = house(Object.assign({ shape, roof: 'roof_red' }, det)), blue = house(Object.assign({ shape, roof: 'roof_blue' }, det));
    const thatch = house(Object.assign({ shape, roof: 'roof_thatch' }, det)), candy = house(Object.assign({ shape, roof: 'roof_candy' }, det));
    const castle = house(Object.assign({ shape, roof: 'roof_castle' }, det));
    assert.ok(red.includes('#e0574f') && red.includes('#c4433c'), shape + ' red is terracotta');
    assert.ok(blue.includes('#4a6fa5') && blue.includes('#3a5888'), shape + ' blue is slate');
    assert.ok(thatch.includes('#e3b24f') && thatch.includes('#b9842a'), shape + ' thatch reads as straw');
    assert.ok(candy.includes('#ff8fb8') && candy.includes('#ff5c6c') && candy.includes('fill="#fff"'), shape + ' candy: pink, icing and a cherry');
    assert.ok(castle.includes('#6c5ce7') && castle.includes('#b9b4c9'), shape + ' castle: stone and turret cones');
    for (const s of [red, blue, thatch, candy]) assert.ok(s.includes('class="slw-flag"'), shape + ' flag shows');
    assert.ok(!castle.includes('class="slw-flag"'), shape + ' castle hides the flag');
  }
});

test('art v2: walls and the glass door use the LOCKED colours; door_glass gets a steel frame on every shape', () => {
  for (const [id, hex] of Object.entries(WALLS_V2)) {
    assert.ok(SRC.includes(id + ": '" + hex + "'"), id + ' is written in the kit/look test format');
    assert.ok(ART.icon(id).includes('fill="' + hex + '"'), id + ' swatch');
    for (const shape of SHAPES) assert.ok(house({ shape, wall: id }).includes('fill="' + hex + '"'), shape + ' ' + id);
  }
  assert.ok(SRC.includes("door_glass: '#1b2438'"));
  for (const shape of SHAPES) {
    const s = house({ shape, door: 'door_glass' });
    assert.ok(s.includes('fill="#1b2438"') && s.includes('stroke="#5a5f72" stroke-width="2.5"'), shape + ' glass door');
    assert.ok(!house({ shape, door: 'door_red' }).includes('stroke="#5a5f72" stroke-width="2.5"'), shape + ' other doors have no glass frame');
  }
  if (L.LOCKED.WALL.wall_concrete) for (const [id, hex] of Object.entries(WALLS_V2)) assert.equal(L.LOCKED.WALL[id].toLowerCase(), hex);
  if (L.LOCKED.DOOR.door_glass) assert.equal(L.LOCKED.DOOR.door_glass.toLowerCase(), '#1b2438');
});

test('art v2: detail_neon is a member-colour tube along each roofline (Neon Magenta without a member colour)', () => {
  for (const shape of SHAPES) for (const roof of ROOFS) {
    const plain = house({ shape, roof, member: '#12ab9f' });
    const lit = house({ shape, roof, member: '#12ab9f', details: { detail_neon: true } });
    assert.ok(!/<g class="slw-neon" color="#12ab9f"/.test(plain), shape + ' ' + roof + ' no tube without the detail');
    assert.ok(/<g class="slw-neon" color="#12ab9f"/.test(lit), shape + ' ' + roof + ' member tube');
    assert.ok(/<g class="slw-neon" color="#ff2e9a"/.test(house({ shape, roof, details: { detail_neon: true } })), shape + ' fallback colour');
    assert.ok(!/color="javascript/.test(house({ shape, roof, member: 'javascript:x', details: { detail_neon: true } })), 'junk colours are ignored');
  }
});

/* ---------------- words, hooks and flash safety ---------------- */
test('art v2: words come only from SIGN_WORDS plus the child\'s own name; icons carry no name', () => {
  const allowed = (t, name) => SIGN_WORDS.includes(t) || t === name || t === name + ' ✦ ' + name + ' ✦' || t === 'ENCORE ✦ ENCORE ✦';
  for (const id of Object.keys(BUILDINGS)) {
    for (const variant of [0, 1, 2]) for (const t of texts(ART.sprite(id, { variant, name: 'Mia' }).svg)) assert.ok(allowed(t, 'MIA'), id + ' text "' + t + '"');
    const ic = ART.icon(id, { name: 'Mia', member: '#ff8800' });
    assert.ok(!/MIA|Mia/.test(ic), id + ' icon is not personal');
    assert.ok(!ic.includes('#ff8800'), id + ' icon ignores the member colour');
    for (const t of texts(ic)) assert.ok(SIGN_WORDS.includes(t), id + ' icon text "' + t + '"');
  }
  for (const shape of SHAPES) for (const roof of ROOFS) assert.deepEqual(texts(house({ shape, roof, name: 'Mia', details: { detail_neon: true } })), [], shape + ' has no words');
  assert.ok(texts(ART.sprite('bld_ledtower', { name: 'Mia' }).svg).includes('MIA ✦ MIA ✦'), 'the LED marquee shows the name');
  assert.ok(texts(ART.sprite('bld_stage', { name: 'Mia' }).svg).includes('MIA'), 'the stage wall shows the name');
  assert.ok(texts(ART.sprite('bld_stage', {}).svg).includes('ENCORE'), 'and ENCORE without one');
});

test('art v2: a hostile or long name is escaped and trimmed; it never breaks the SVG', () => {
  const name = '<b onload="x">&\'Zoë\'  "quoted"   and a very long tail';
  for (const id of ['bld_ledtower', 'bld_stage']) {
    const s = ART.sprite(id, { name }).svg;
    assertSvg(s, id + ' hostile name');
    assert.ok(!s.includes('<b ') && !s.includes('onload="'), id + ' no injected markup');
    for (const t of texts(s)) assert.ok(t.replace(/&\w+;|&#\d+;/g, '_').replace(/ ✦/g, '').length <= 2 * 12 + 2, id + ' name is capped at 12 characters');
  }
  assert.ok(texts(ART.sprite('bld_stage', { name: '   ' }).svg).includes('ENCORE'), 'a blank name falls back to ENCORE');
});

test('art v2: building sprites carry the CSS hook classes the 2D acts restart', () => {
  const hooks = {
    bld_photobooth: ['slw-strip', 'slw-twinkle'], bld_boba: ['slw-pearls', 'slw-hatch'], bld_ledtower: ['slw-screen', 'slw-marquee', 'slw-eq'],
    bld_recording: ['slw-onair', 'slw-eq', 'slw-win'], bld_dance: ['slw-floor', 'slw-win'], bld_rooftop: ['slw-bean', 'slw-twinkle', 'slw-win'], bld_stage: ['slw-beam', 'slw-eq']
  };
  for (const [id, cls] of Object.entries(hooks)) {
    const s = ART.sprite(id, { name: 'Mia' }).svg;
    /* the rooftop's lights are Edison bulbs, not neon (art bible: neon only on lines, rings, signs, screens) */
    for (const c of id === 'bld_rooftop' ? cls : cls.concat('slw-neon')) assert.ok(new RegExp('class="[^"]*\\b' + c + '\\b').test(s), id + ' .' + c);
  }
  const led = ART.sprite('bld_ledtower', { name: 'Mia' }).svg;
  assert.ok(led.includes('class="slw-screen" data-prog="0"'), 'LED tower screen starts on program 0');
  assert.deepEqual([...led.matchAll(/class="slw-prog p(\d)"( display="none")?/g)].map((m) => m[1] + (m[2] ? 'h' : '')), ['0', '1h', '2h', '3h'], 'programs 1–3 ship hidden');
  assert.ok(!ART.icon('bld_ledtower', { name: 'Mia' }).includes('slw-screen'), 'the icon is the star field only');
  assert.ok(/<g class="slw-beam" opacity="0">/.test(ART.sprite('bld_stage', {}).svg), 'stage beams are hidden until Showtime');
  assert.ok(/<g class="slw-onair" opacity="0\.55">/.test(ART.sprite('bld_recording', {}).svg), 'ON AIR rests dim and steady');
});

test('art v2: the ✦ is always four-pointed and LED colour sets mix ≥ 4 hues with none over 35%', () => {
  const stars = [...ART.sprite('bld_stage', {}).svg.matchAll(/class="slw-neon" color="[^"]+" d="(M[^"]+Z)"/g)].map((m) => m[1]);
  assert.ok(stars.length >= 1);
  for (const d of stars) assert.equal((d.match(/[ML]/g) || []).length, 8, 'a 4-point star has 8 vertices');
  const groups = [];
  for (const id of Object.keys(BUILDINGS)) {
    const s = ART.sprite(id, { name: 'Mia' }).svg;
    for (const m of s.matchAll(/<g class="slw-(?:eq|floor)"[^>]*>([\s\S]*?)<\/g>/g)) groups.push([id, (m[1].match(/fill="(#[0-9a-f]{6})"/g) || []).map((f) => f.slice(6, 13))]);
  }
  assert.ok(groups.length >= 4);
  for (const [id, fills] of groups) {
    const counts = {};
    fills.forEach((f) => { counts[f] = (counts[f] || 0) + 1; });
    assert.ok(Object.keys(counts).length >= 4, id + ' ≥ 4 hues');
    for (const [hex, n] of Object.entries(counts)) assert.ok(n / fills.length <= 0.35 + 1e-9, id + ' ' + hex + ' over 35%');
  }
});

/* ---------------- accessories ---------------- */
test('art v2: the five new accessories draw on every pet, on their own socket, and change the drawing', () => {
  for (const [id, slot] of Object.entries(ACCS)) {
    if (C.item(id)) assert.equal(C.item(id).slot, slot, id + ' socket matches the catalogue');
    for (const p of ['pet_puppy', 'pet_kitten', 'pet_bunny', 'pet_dragon']) for (const frame of [0, 1]) {
      const acc = { [slot]: id }, s = ART.pet(p, { acc, frame });
      assertSvg(s, p + ' ' + id, 120, 100);
      assert.notEqual(s, ART.pet(p, { frame }), p + ' ' + id + ' shows');
    }
    assert.equal(ART.icon(id), ART.pet('pet_puppy', { acc: { [slot]: id } }), id + ' icon is the puppy wearing it');
  }
  const full = ART.pet('pet_bunny', { acc: { hat: 'acc_beanie', neck: 'acc_headphones', face: 'acc_visor', back: 'acc_hoodie' } });
  assertSvg(full, 'bunny in the full v2 outfit', 120, 100);
  const beanieExtra = (p) => ART.pet(p, { acc: { hat: 'acc_beanie' } }).length - ART.pet(p, {}).length;
  assert.ok(beanieExtra('pet_bunny') > beanieExtra('pet_kitten'), 'the bunny\'s beanie gets ear openings');
  assert.ok(ART.petDataUrl('pet_dragon', { acc: { back: 'acc_hoodie' } }).startsWith('data:image/svg+xml;charset=utf-8,'));
});

/* ---------------- UI chrome icons ---------------- */
test('art v2: uiIcon draws the 24-grid line set in currentColor; unknown names return an empty string', () => {
  assert.deepEqual(ART.UI_ICON_NAMES.slice().sort(), UI_NAMES.slice().sort());
  const seen = new Set();
  for (const name of UI_NAMES) {
    const s = ART.uiIcon(name);
    assert.match(s, /^<svg class="slw-ico" xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 24 24"/, name);
    assert.equal(wellFormed(s), '', name);
    for (const a of ['fill="none"', 'stroke="currentColor"', 'stroke-width="2"', 'stroke-linecap="round"', 'stroke-linejoin="round"', 'aria-hidden="true"', 'focusable="false"']) assert.ok(s.includes(a), name + ' ' + a);
    assert.ok(!/#[0-9a-f]{3,6}/i.test(s), name + ' has no hard-coded colour');
    assert.ok(!/(fill|stroke)="(?!none|currentColor)/.test(s.replace(/^<svg[^>]*>/, '')), name + ' children inherit paint');
    for (const n of s.replace(/^<svg[^>]*>/, '').match(/-?\d*\.?\d+/g).map(Number)) assert.ok(n >= -24 && n <= 24, name + ' stays on the 24 grid');
    seen.add(s);
  }
  assert.equal(seen.size, UI_NAMES.length, 'every icon is distinct');
  for (const junk of ['', 'nope', 'toString', '__proto__', null, undefined, 42]) assert.equal(ART.uiIcon(junk), '', String(junk));
});

/* ---------------- tables and exports ---------------- */
test('art v2: exports and the look tables agree (shapes, PALETTE_V2 tokens once A1 lands)', () => {
  assert.deepEqual(ART.SHAPES, SHAPES);
  for (const k of ['CH', 'defs', 'island', 'sprite', 'pet', 'icon', 'petDataUrl', 'KARTS', 'BALLS', 'STADIA', 'THEME', 'PETCOL', 'uiIcon']) assert.ok(k in ART, k + ' exported');
  if (L.PALETTE_V2) {
    for (const name of ['Midnight Ink', 'Graphite', 'Night Asphalt', 'Concrete', 'Concrete Light', 'Bone White', 'Smoked Glass', 'Glass Edge', 'Gunmetal', 'Gunmetal Spec', 'Gunmetal Mid',
      'Gunmetal Deep', 'Teak', 'Teak Light', 'Milk Tea', 'Neon Magenta', 'LED Cyan', 'Electric Violet', 'Laser Lime', 'Sunset Amber', 'Window Warm', 'Leaf Deep', 'Leaf Lit']) {
      assert.ok(SRC.toLowerCase().includes(String(L.PALETTE_V2[name]).toLowerCase()), name + ' is drawn with its v2 hex');
    }
  }
  if (C.DEFAULTS.shape) assert.ok(SHAPES.includes(C.DEFAULTS.shape), 'the default shape has 2D art');
});

/* ---------------- review fixes (fix2/twod) ---------------- */
test('art v2: the 2D island is golden hour by default (Deep Bay, Lagoon shallows, Dune, Turf, no white waves); opts.day is v1', () => {
  const crypto = require('node:crypto');
  const sha = (s) => crypto.createHash('sha1').update(s).digest('hex');
  const all = {};
  Object.keys(C.REGIONS).forEach((k) => { all[k] = 1; });
  /* opts.day is the pre-v2 island byte for byte (sha1 of island() before this change) */
  assert.equal(sha(ART.island(C.COLS, C.ROWS, C.REGION_CELLS, { home: 1 }, { day: true })), 'f49119f6425882672f9b4f1d141b21b810752fea');
  assert.equal(sha(ART.island(C.COLS, C.ROWS, C.REGION_CELLS, all, { day: true })), 'afb8159f568ea1687eb062087b3e6348f1f55ef5');
  for (const un of [{ home: 1 }, all]) {
    const s = ART.island(C.COLS, C.ROWS, C.REGION_CELLS, un);
    assertSvg(s, 'dusk island', C.COLS * 100, C.ROWS * ART.CH);
    assert.ok(s.includes('fill="url(#slwSeaDusk)"') && s.includes('fill="url(#slwTurf)"'), 'the dusk bay and Turf');
    assert.ok(s.includes('<g fill="#e9c9a0">'), 'Dune beaches');
    assert.ok(/<g fill="#3fb8d0" opacity="0\.3">/.test(s), 'Lagoon shallows');
    assert.ok(!/#7fd6ff|#2f8fd8|#93e07c|#5fbf55|#f3dc9a|#f6e7bd|url\(#slwSea\)|url\(#slwGrass\)/i.test(s), 'none of the v1 cartoon palette');
    /* no white strokes: the wave lines are Wave Dusk at 0.6× width */
    for (const m of s.matchAll(/stroke="(#[0-9a-f]{3,6})"/gi)) assert.ok(!/^#(f{3}|f{6}|e8f8ff)$/i.test(m[1]), 'white stroke ' + m[1]);
    const waves = [...s.matchAll(/<path class="slw-wave"[^>]*>/g)].map((m) => m[0]);
    assert.equal(waves.length, 9);
    waves.forEach((w) => assert.ok(w.includes('stroke="#ffc7b0"') && w.includes('stroke-width="2.4"'), w));
  }
  /* the defs: the dusk bay starts at Deep Bay (where the CSS sky's horizon meets it), Turf → Turf Shade;
     the v1 gradients stay for opts.day */
  const defs = ART.defs();
  assert.match(defs, /<linearGradient id="slwSeaDusk"[^>]*><stop offset="0" stop-color="#1e3f86"\/>/);
  assert.match(defs, /<linearGradient id="slwTurf"[^>]*><stop offset="0" stop-color="#4fa36a"\/><stop offset="1" stop-color="#3c8456"\/>/);
  assert.match(defs, /<linearGradient id="slwSea" [^>]*><stop offset="0" stop-color="#7fd6ff"\/>/);
  if (L.PALETTE_V2) for (const n of ['Turf', 'Turf Shade', 'Dune', 'Wet Dune', 'Deep Bay', 'Lagoon', 'Wave Dusk', 'Leaf Deep', 'Text Muted']) assert.ok(SRC.toLowerCase().includes(String(L.PALETTE_V2[n]).toLowerCase()), n + ' is drawn with its v2 hex');
});

test('art v2: the LED tower pixel pet is the active pet (st.pet) in its own shape and locked colours; st.prog keeps the show', () => {
  const PETS = ['pet_puppy', 'pet_kitten', 'pet_bunny', 'pet_dragon'];
  const p1 = (st) => /<g class="slw-prog p1"[^>]*>([\s\S]*?)<\/g>/.exec(ART.sprite('bld_ledtower', st).svg)[1];
  const cells = (s) => [...s.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="5" height="5" fill="(#[0-9a-f]{6})"\/>/g)];
  const shapes = new Set();
  for (const id of PETS) {
    const s = p1({ pet: id, name: 'Mia', variant: 1 }), c = ART.PETCOL[id], px = cells(s);
    assert.ok(px.length >= 36, id + ' draws ' + px.length + ' pixels');
    for (const k of ['body', 'light', 'nose']) assert.ok(s.includes('fill="' + c[k] + '"'), id + ' ' + k + ' ' + c[k]);
    assert.ok(s.includes('fill="#14101f"'), id + ' Midnight Ink eyes');
    px.forEach((m) => assert.ok(+m[1] >= 0 && +m[1] + 5 <= 66 && +m[2] >= 0 && +m[2] + 5 <= 50, id + ' pixel inside the 66×50 screen'));
    shapes.add(px.map((m) => m[1] + ',' + m[2]).join(' '));
  }
  assert.equal(shapes.size, 4, 'four species, four silhouettes (not one face recoloured)');
  /* tall pink-lined ears for the bunny, gold horns for the dragon */
  assert.ok(p1({ pet: 'pet_bunny' }).includes('fill="#f6b7c9"'));
  assert.ok(p1({ pet: 'pet_dragon' }).includes('fill="#ffd23f"'));
  /* no pet, an unknown id or an inherited name: the puppy, never junk */
  const pup = p1({ pet: 'pet_puppy' });
  for (const pet of [undefined, null, 'pet_nope', 'toString', '__proto__', 'constructor', 7]) {
    const s = ART.sprite('bld_ledtower', { pet }).svg;
    assert.equal(p1({ pet }), pup, String(pet));
    assert.ok(!/undefined|NaN|function/.test(s), String(pet) + ' draws no junk');
  }
  /* the shop icon is not personal */
  assert.equal(ART.icon('bld_ledtower', { pet: 'pet_dragon', name: 'Mia' }), ART.icon('bld_ledtower'));
  /* st.prog: the host keeps the child's show across a redraw */
  const progOf = (st) => {
    const s = ART.sprite('bld_ledtower', st).svg;
    return [/class="slw-screen" data-prog="(\d)"/.exec(s)[1], [...s.matchAll(/class="slw-prog p(\d)"( display="none")?/g)].filter((m) => !m[2]).map((m) => m[1]).join('')];
  };
  assert.deepEqual(progOf({}), ['0', '0']);
  for (const n of [0, 1, 2, 3]) assert.deepEqual(progOf({ prog: n, pet: 'pet_kitten' }), [String(n), String(n)], 'program ' + n + ' alone shows');
  assert.deepEqual(progOf({ prog: 9 }), ['3', '3']);
  assert.deepEqual(progOf({ prog: -2 }), ['0', '0']);
  assertSvg(ART.sprite('bld_ledtower', { prog: 2, pet: 'pet_dragon', name: 'Mia' }).svg, 'tower on the EQ show', 100, 170);
});

test('art v2: the 2D crew is de-babied — smaller lidded eye, a side smirk, blush only in cheer', () => {
  for (const p of ['pet_puppy', 'pet_kitten', 'pet_bunny', 'pet_dragon']) for (const frame of [0, 1]) {
    const s = ART.pet(p, { frame }), face = /<g class="slw-face">([\s\S]*?)<\/g>/.exec(s);
    assert.ok(face, p + ' has the v2 face');
    assertSvg(s, p + ' v2 face', 120, 100);
    assert.ok(!/#ff9db8/.test(s), p + ' no permanent blush');
    const eye = /<ellipse cx="([\d.]+)" cy="([\d.]+)" rx="([\d.]+)" ry="([\d.]+)" fill="#14101f" transform="rotate\(8 /.exec(face[1]);
    assert.ok(eye, p + ': a Midnight Ink almond eye, rolled 8° outer-up');
    const [ex, ey, rx, ry] = eye.slice(1).map(Number), area = Math.PI * rx * ry, v1 = Math.PI * 3.8 * 3.8;
    assert.ok(area <= 0.6 * v1, p + ' eye area ' + area.toFixed(1) + ' vs v1 ' + v1.toFixed(1));
    assert.ok(ry < rx, p + ' a lidded almond, wider than tall');
    assert.equal(ex, 92, 'the eye keeps its place (anchors unchanged)');
    const paths = [...face[1].matchAll(/<path d="M([\d.]+) ([\d.]+) Q([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+)" fill="none" stroke="#14101f"/g)].map((m) => m.slice(1).map(Number));
    assert.equal(paths.length, 2, p + ': an upper lid and a mouth');
    const [lid, mouth] = paths;
    assert.ok(lid[0] < ex && lid[4] > ex && Math.max(lid[1], lid[5]) < ey, p + ' the lid spans the top of the eye');
    assert.ok(lid[1] < lid[5], p + ' its outer end sits higher');
    assert.ok(Math.abs(mouth[1] - mouth[5]) >= 1, p + ' a side smirk (one corner up), not v1\'s level U');
    const glint = /<circle cx="[\d.]+" cy="[\d.]+" r="([\d.]+)" fill="#fff"\/>/.exec(face[1]);
    assert.ok(glint && +glint[1] < 1.3, p + ' a smaller glint');
    /* cheer: the blush comes back, softer */
    assert.ok(/<circle [^>]*fill="#ff9db8" opacity="0\.3"\/>/.test(ART.pet(p, { frame, cheer: true })), p + ' cheer blush at 0.3');
  }
  /* the locked colours (PETCOL) are the same object the look table pins */
  assert.deepEqual(Object.keys(ART.PETCOL), ['pet_puppy', 'pet_kitten', 'pet_bunny', 'pet_dragon']);
});

test('2D screens clip with an inline style, so the page\'s descendant svg rules (width:100%, overflow:visible) cannot unclip or stretch them', () => {
  const tower = ART.sprite('bld_ledtower', { name: 'Ava' }).svg, stage = ART.sprite('bld_stage', { name: 'Ava' }).svg;
  for (const s of [tower, stage]) {
    const nested = s.match(/<svg x="[^"]+" y="[^"]+"[^>]*>/g) || [];
    assert.ok(nested.length >= 1, 'has a nested screen');
    nested.forEach((tag) => assert.match(tag, /style="overflow:hidden;width:\d+px;height:\d+px"/, tag));
  }
});
