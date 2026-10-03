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
  /* inline styles only stagger CSS-owned animations or set a transform origin */
  for (const m of s.matchAll(/style="([^"]*)"/g)) for (const decl of m[1].split(';').filter(Boolean)) assert.match(decl.trim(), /^(animation-delay:[\d.]+s|transform-box:fill-box|transform-origin:[\d.%\s pxa-z]+)$/, where + ' style ' + decl);
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
function v1Fingerprint(A, extra) {
  let h = 2166136261;
  const walls = ['wall_cream', 'wall_pink', 'wall_mint', 'wall_sky', 'wall_lilac'], roofs = ['roof_red', 'roof_blue', 'roof_thatch', 'roof_candy', 'roof_castle'];
  const doors = ['door_blue', 'door_red', 'door_green', 'door_gold'], dets = ['detail_windowbox', 'detail_chimney', 'detail_lights', 'detail_flag'];
  for (const w of walls) for (const r of roofs) for (const d of doors) for (let m = 0; m < 16; m++) {
    const details = {}; dets.forEach((k, i) => { if (m & (1 << i)) details[k] = true; });
    h = fnv(h, A.sprite('house_cottage', Object.assign({ wall: w, roof: r, door: d, details }, extra)).svg);
  }
  const st = Object.assign({ wall: 'wall_mint', roof: 'roof_candy', door: 'door_gold', details: { detail_lights: true }, course: 'course_snow', ball: 'ball_planet', stadium: 'stadium_night', kart: 'kart_unicorn' }, extra);
  for (const id of V1_IDS) {
    h = fnv(h, A.icon(id)); h = fnv(h, A.icon(id, st));
    const s = A.sprite(id, Object.assign({ lit: true }, st)); h = fnv(h, s ? s.svg + s.w + 'x' + s.h : 'null');
  }
  const hats = [null, 'acc_partyhat', 'acc_crown'], necks = [null, 'acc_bow', 'acc_scarf'], faces = [null, 'acc_shades'], backs = [null, 'acc_cape'];
  for (const p of ['pet_puppy', 'pet_kitten', 'pet_bunny', 'pet_dragon']) for (const hat of hats) for (const neck of necks) for (const face of faces) for (const back of backs) for (const frame of [0, 1]) {
    h = fnv(h, A.pet(p, { frame, acc: { hat, neck, face, back } }));
  }
  return (h >>> 0).toString(16);
}

/* ---------------- v1 stays byte-identical ---------------- */
test('art v2: every v1 render is byte-identical to the pre-v2 art (pinned fingerprint)', () => {
  /* 130c5e61 = the rewards-world world-art.js before Encore City v2 */
  assert.equal(v1Fingerprint(ART, {}), '130c5e61');
  assert.equal(v1Fingerprint(ART, { shape: 'shape_cottage' }), '130c5e61', 'shape_cottage draws the v1 cottage');
  assert.equal(v1Fingerprint(ART, { shape: 'shape_split', variant: 1, member: '#12ab9f', name: 'Zoe' }), '130c5e61', 'unknown shapes fall back to the cottage; trim/member/name never touch v1 art');
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
