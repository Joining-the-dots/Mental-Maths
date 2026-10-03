'use strict';
/* My Island 3D — the kit's v2 runtime contracts (world/island3d/kit.js), pure layer:
   toon ramp, architecture bevel, LED and sign atlas layouts (SIGN_WORDS enforced),
   placement-variety maths, outline policy constants and shader-program families.
   The THREE paths run in the browser (and the lab); everything here needs no WebGL. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const KIT = require('../world/island3d/kit.js');
const L = require('../world/world-look.js');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'world', 'island3d', 'kit.js'), 'utf8');
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const lower = (o) => JSON.parse(JSON.stringify(o).toLowerCase());

/* ---------------- materials ---------------- */
test('kit: the toon ramp comes from MATERIAL.toonRamp (v2 [64, 128, 200, 255]); one shared toon program', () => {
  assert.deepEqual(KIT.rampFrom(L), [64, 128, 200, 255]);
  assert.deepEqual(KIT.rampFrom(L), [...L.MATERIAL.toonRamp]);
  assert.deepEqual(KIT.rampFrom(null), KIT.RAMP, 'no look module: the v2 ramp');
  for (const bad of [[1, 2, 3], [300, 1, 2, 3], [200, 100, 50, 0], ['a', 1, 2, 3]]) assert.deepEqual(KIT.rampFrom({ MATERIAL: { toonRamp: bad } }), KIT.RAMP, JSON.stringify(bad));
  assert.match(SRC, /function toonKey\(\) \{ return 'encore-toon'; \}/, 'the toon program cache key is unchanged');
  assert.match(SRC, /new Uint8Array\(rampFrom\(lookNow\(\)\)\)/, 'the ramp texture reads the look');
});

test('kit: the architecture bevel is min(0.05 × the smallest side, 0.06); organic pieces keep 0.18', () => {
  assert.deepEqual({ ...KIT.BEVEL }, { ...L.MATERIAL.bevel });
  assert.ok(near(KIT.archRadius(1, 1, 1), 0.05));
  assert.ok(near(KIT.archRadius(0.4, 2, 3), 0.02));
  assert.ok(near(KIT.archRadius(2, 3, 1.5), 0.06), 'capped');
  assert.ok(near(KIT.archRadius(1, 1, 1, { arch: 0.1, archMax: 1 }), 0.1));
  assert.equal(KIT.bevelFrom(L), L.MATERIAL.bevel);
  assert.equal(KIT.bevelFrom({}), KIT.BEVEL);
  assert.match(SRC, /radius\.arch \? archRadius\(w, h, d, bevelFrom\(lookNow\(\)\)\)/, 'G.slab(w, h, d, {arch: true})');
});

test('kit: smoked, gunmetal and foil matcaps follow MATCAPS; led and sign join the emoji face program', () => {
  for (const name of ['smoked', 'gunmetal', 'foil']) {
    assert.deepEqual(KIT.MATCAP_FALLBACK[name], L.MATCAPS[name].map((t) => L.hex(t)), name + ' fallback hexes = the bible stops');
    assert.equal(KIT.programFamily(name), KIT.programFamily('gold'), name + ' shares the matcap program');
    assert.ok(SRC.includes("case '" + name + "'"), name + ' handled by K.mat');
  }
  for (const name of ['led', 'sign']) {
    assert.equal(KIT.programFamily(name), KIT.programFamily('emoji'), name + ' shares the emoji face program');
    assert.ok(SRC.includes("case '" + name + "'"), name + ' handled by K.mat');
  }
  /* every K.mat base key has a family and is handled; the families stay well inside 12 programs */
  for (const key of Object.keys(KIT.PROGRAM_FAMILY).filter((k) => k !== 'emoji')) assert.ok(SRC.includes("case '" + key + "'"), key);
  assert.ok(new Set(Object.values(KIT.PROGRAM_FAMILY)).size <= 10, 'material program families');
  assert.equal(KIT.programFamily('neon:LED Cyan'), 'basic');
  assert.equal(KIT.programFamily('outline:0.009'), 'outline');
  assert.equal(KIT.programFamily('nope'), null);
});

test('kit: outlines — characters 0.009 in Midnight Ink, architecture only the 0.02–0.03 selection hull', () => {
  assert.equal(KIT.OUTLINE_CHAR, L.MATERIAL.outline.character);
  assert.deepEqual([...KIT.SEL_W], [...L.MATERIAL.outline.pulse]);
  assert.equal(KIT.OUTLINE_W, L.MATERIAL.outline.pulse[0], 'the selection hull base width');
  assert.match(SRC, /mix\(uOutline, mix\(uSelMin, uSelMax, uSelPulse\), slSel\)/, 'selected copies pulse between the selection widths');
  assert.match(SRC, /this\._selOnly = !this\._charHull/, 'batches of architecture draw the selection hull only');
  assert.match(SRC, /o\.outlines !== false && charHull\(tpl\.id\)/, 'standalone copies keep hulls for characters only');
  assert.deepEqual(Object.keys(L.OUTLINE_KINDS).sort(), ['acc', 'avatar', 'pet']);
});

test('kit: the inline fallback knows the new locked walls and door', () => {
  for (const fam of ['WALL', 'DOOR']) assert.deepEqual(lower(KIT.FALLBACK.LOCKED[fam]), lower(L.LOCKED[fam]), fam);
});

/* ---------------- LED screen atlas ---------------- */
test('kit: the LED atlas is ONE 512×256 texture of 8 non-overlapping 256×64 program strips', () => {
  assert.deepEqual([...KIT.LED_PROGRAMS], ['eq', 'wave', 'spark', 'gradient', 'stars', 'encore', 'showtime', 'name']);
  assert.deepEqual({ ...KIT.LED }, { w: 512, h: 256, stripW: 256, cellW: 128, cellH: 64, cols: 2 });
  const cells = KIT.LED_PROGRAMS.map((p) => KIT.ledCell(p));
  cells.forEach((c, i) => {
    assert.deepEqual(KIT.ledCell(i), c, 'by index or by name');
    assert.ok(c.x >= 0 && c.y >= 0 && c.x + c.w <= 512 && c.y + c.h <= 256, 'inside the texture');
    for (let j = 0; j < i; j++) {
      const d = cells[j], overlap = c.x < d.x + d.w && d.x < c.x + c.w && c.y < d.y + d.h && d.y < c.y + c.h;
      assert.ok(!overlap, KIT.LED_PROGRAMS[i] + ' / ' + KIT.LED_PROGRAMS[j]);
    }
  });
  assert.equal(cells.reduce((a, c) => a + c.w * c.h, 0), 512 * 256, 'the strips tile the whole texture');
  assert.equal(KIT.ledCell('karaoke'), null); assert.equal(KIT.ledCell(8), null); assert.equal(KIT.ledIndex(-1), -1);
});

test('kit: an LED screen scrolls by UV offset only, inside its own strip, wrapping seamlessly', () => {
  for (let p = 0; p < 8; p++) {
    const c = KIT.ledCell(p), w0 = KIT.ledWindow(p, 0);
    assert.ok(near(w0.rx, 0.25) && near(w0.ry, 0.25), 'a 128×64 window');
    assert.ok(near(w0.ox, c.x / 512) && near(w0.oy, 1 - (c.y + 64) / 256), 'flipY offsets');
    for (const ph of [0, 0.25, 0.5, 0.999]) {
      const w = KIT.ledWindow(p, ph);
      assert.ok(w.ox >= c.x / 512 - 1e-12 && w.ox + w.rx <= (c.x + c.w) / 512 + 1e-12, 'stays in the strip at ' + ph);
    }
    assert.deepEqual(KIT.ledWindow(p, 1), w0, 'one period later it is the same picture');
    assert.deepEqual(KIT.ledWindow(p, -0.75), KIT.ledWindow(p, 0.25));
    assert.deepEqual(KIT.ledWindow(p, 2.5), KIT.ledWindow(p, 0.5));
  }
  const out = {};
  assert.equal(KIT.ledWindow('stars', 0.3, out), out, 'reuses the out object');
  assert.deepEqual(KIT.ledWindow('nope', 0), KIT.ledWindow(0, 0), 'an unknown program shows the first');
  assert.match(SRC, /view: function \(p, phase\) \{ var w = ledWindow\(p, phase\); return windowView\(t, w\.rx, w\.ry, w\.ox, w\.oy\); \}/, 'views share the atlas Source');
  assert.match(SRC, /_redrawUser: function \(\) \{ if \(ctx\) \{ drawLedProgram\(ctx, 7, shared\.user\)/, 'setUser redraws only the name cell');
});

/* ---------------- sign atlas ---------------- */
test('kit: the sign atlas holds SIGN_WORDS in cells 0–6 and the child’s name + initial in cell 7', () => {
  assert.deepEqual([...KIT.SIGN_WORDS], [...L.SIGN_WORDS]);
  assert.deepEqual({ ...KIT.SIGN }, { w: 512, h: 256, cellW: 256, cellH: 64, cols: 2, userCell: 7, nameW: 192 });
  const rects = L.SIGN_WORDS.map((w) => KIT.signCell(w, L.SIGN_WORDS)).concat([KIT.signCell(':name'), KIT.signCell(':initial')]);
  rects.forEach((c, i) => {
    assert.ok(c && c.x >= 0 && c.y >= 0 && c.x + c.w <= 512 && c.y + c.h <= 256, 'inside ' + i);
    for (let j = 0; j < i; j++) {
      const d = rects[j], overlap = c.x < d.x + d.w && d.x < c.x + c.w && c.y < d.y + d.h && d.y < c.y + c.h;
      assert.ok(!overlap, i + ' / ' + j);
    }
  });
  assert.deepEqual(L.SIGN_WORDS.map((w) => KIT.signCell(w).cell), [0, 1, 2, 3, 4, 5, 6]);
  assert.equal(KIT.signCell(':name').cell, 7); assert.equal(KIT.signCell(':initial').cell, 7);
  assert.equal(KIT.signCell(':name').w + KIT.signCell(':initial').w, 256);
  assert.deepEqual(KIT.signCell(' photo '), KIT.signCell('PHOTO'), 'case and spacing do not matter');
  const r = KIT.signRect('ON AIR');
  assert.ok(r.u0 >= 0 && r.u1 <= 1 && r.v0 >= 0 && r.v1 <= 1 && r.u1 > r.u0 && r.v1 > r.v0);
  assert.ok(near(r.u1 - r.u0, 0.5) && near(r.v1 - r.v0, 0.25));
});

test('kit: SIGN_WORDS is enforced — nothing else is ever drawn into a texture', () => {
  for (const bad of ['K-POP', 'IDOL', 'BOBA', 'LIMITED', '', null, 42, 'ENCORE!', 'ISLANDS', ':user']) {
    assert.equal(KIT.signCell(bad), null, String(bad));
    assert.equal(KIT.signRect(bad), null, String(bad));
    assert.equal(KIT.checkSignWord(bad, L.SIGN_WORDS, false), false, String(bad));
    assert.throws(() => KIT.checkSignWord(bad, L.SIGN_WORDS, true), /not a sign word/, 'QA mode throws for ' + String(bad));
  }
  for (const ok of L.SIGN_WORDS.concat([':name', ':initial'])) assert.equal(KIT.checkSignWord(ok, L.SIGN_WORDS, true), true, ok);
  /* a word list cannot smuggle an extra word into the user cell */
  assert.equal(KIT.signCell('EXTRA', L.SIGN_WORDS.concat(['EXTRA'])), null);
  /* the child's name: first name only, letters only, upper case, ≤ 12 */
  assert.equal(KIT.signName('mia rose'), 'MIA');
  assert.equal(KIT.signName('  Joshua  '), 'JOSHUA');
  assert.equal(KIT.signName('<b>Ze</b>'), 'BZEB');
  assert.equal(KIT.signName('Bartholomew-Alexander'), 'BARTHOLOMEW', 'no dangling hyphen');
  assert.equal(KIT.signName('Mary-Jane'), 'MARY-JANE');
  assert.equal(KIT.signName(null), '');
  assert.equal(KIT.signInitial('élodie'), 'É');
  assert.equal(KIT.signInitial('42'), '', 'no usable letter: the sign shows just the ✦');
  assert.match(SRC, /function allowed\(word\) \{ return checkSignWord\(word, signWordsNow\(\), qa\); \}/, 'the atlas checks every request (throws in QA mode)');
});

/* ---------------- placement variety ---------------- */
test('kit: jitter2 passes straight into a batch copy; the v1 {yaw, scale} still works', () => {
  const j = L.jitter2('p12', 'tree_oak', []);
  const n = KIT.normJitter(j);
  assert.equal(n.yaw, j.yaw); assert.equal(n.sx, j.sx); assert.equal(n.sy, j.sy); assert.equal(n.sz, j.sz);
  assert.equal(n.lean, j.lean); assert.equal(n.leanAxis, j.leanAxis); assert.equal(n.tl, j.tint.l); assert.equal(n.th, j.tint.h);
  assert.deepEqual({ ...KIT.normJitter({ yaw: 6, scale: 1.04 }) }, { yaw: 6, sx: 1.04, sy: 1.04, sz: 1.04, lean: 0, leanAxis: 0, tl: 1, th: 0 }, 'v1 shape');
  assert.deepEqual({ ...KIT.normJitter(null) }, { yaw: 0, sx: 1, sy: 1, sz: 1, lean: 0, leanAxis: 0, tl: 1, th: 0 });
  assert.deepEqual({ ...KIT.normJitter(L.jitter2('p1', 'house_cottage', [])) }, { yaw: 0, sx: 1, sy: 1, sz: 1, lean: 0, leanAxis: 0, tl: 1, th: 0 });
  const neg = KIT.normJitter({ sx: -1, sy: 0, sz: NaN, scale: -2 });
  assert.deepEqual([neg.sx, neg.sy, neg.sz], [1, 1, 1], 'never a mirror or a collapse');
  const out = {};
  assert.equal(KIT.normJitter(j, out), out);
});

test('kit: jitterQuat is yaw about +y, then the lean about a horizontal axis', () => {
  const rot = (q, v) => {          /* rotate v by unit quaternion q */
    const [x, y, z, w] = q, [vx, vy, vz] = v;
    const ix = w * vx + y * vz - z * vy, iy = w * vy + z * vx - x * vz, iz = w * vz + x * vy - y * vx, iw = -x * vx - y * vy - z * vz;
    return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x];
  };
  for (const [yaw, lean, axis] of [[0, 0, 0], [90, 0, 0], [37, 3, 120], [250, -2.5, 300], [10, 3, 0]]) {
    const q = KIT.jitterQuat(yaw, lean, axis);
    assert.ok(near(Math.hypot(...q), 1, 1e-12), 'unit');
    /* the up vector tilts by exactly the lean, whatever the yaw */
    const up = rot(q, [0, 1, 0]);
    assert.ok(near(Math.acos(Math.max(-1, Math.min(1, up[1]))) * 180 / Math.PI, Math.abs(lean), 1e-9), 'tilt = lean');
    if (lean === 0) {
      /* pure yaw: three.js convention (+90° carries +x onto -z) */
      const x = rot(q, [1, 0, 0]);
      assert.ok(near(x[0], Math.cos(yaw * Math.PI / 180), 1e-12) && near(x[2], -Math.sin(yaw * Math.PI / 180), 1e-12));
    }
  }
  /* the lean axis is horizontal at leanAxis° round +y: a lean about +x tips +y toward +z */
  const tip = rot(KIT.jitterQuat(0, 3, 0), [0, 1, 0]);
  assert.ok(near(tip[0], 0, 1e-12) && tip[2] > 0, 'about +x, +y tips toward +z');
  const out = [0, 0, 0, 0];
  assert.equal(KIT.jitterQuat(1, 1, 1, out), out);
});

test('kit: the jitter tint multiplies lightness and tilts warm or cool', () => {
  assert.deepEqual(KIT.tintMul(1, 0), [1, 1, 1]);
  assert.deepEqual(KIT.tintMul(0.95, 0), [0.95, 0.95, 0.95]);
  const warm = KIT.tintMul(1, 5), cool = KIT.tintMul(1, -5);
  assert.ok(warm[0] > 1 && warm[2] < 1 && warm[1] === 1, 'warm leans red-yellow');
  assert.ok(cool[0] < 1 && cool[2] > 1, 'cool leans blue');
  for (const [l, h] of [[0.93, 5], [1.05, -5], [0.96, 0]]) for (const c of KIT.tintMul(l, h)) assert.ok(c > 0.85 && c < 1.12, 'a gentle tint ' + c);
  assert.deepEqual(KIT.tintMul(0, 0), [1, 1, 1], 'an invalid lightness is ignored');
});

/* ---------------- plumbing ---------------- */
test('kit: K exposes the v2 runtime contract', () => {
  for (const name of ['ledAtlas: ledAtlas', 'signAtlas: signAtlas', 'K.facet = K.G.facet', 'OUTLINE_CHAR: OUTLINE_CHAR', 'LED_PROGRAMS: LED_PROGRAMS'])
    assert.ok(SRC.includes(name), name);
  assert.match(SRC, /var j = normJitter\(jitter, _jit\);/, 'ItemBatch._place takes the jitter2 shape');
  assert.match(SRC, /else baseColorInto\(rec, _c\);/, 'the tint multiplies non-state parts only');
});

test('kit: loads as a browser global (window.SLKit) with the pure helpers', () => {
  const ctx = {};
  ctx.self = ctx;
  vm.runInNewContext(SRC, ctx);
  assert.ok(ctx.SLKit && typeof ctx.SLKit.create === 'function');
  assert.equal(ctx.SLKit.signRect('DANCE').u0, KIT.signRect('DANCE').u0);
  assert.throws(() => ctx.SLKit.create(null), /needs the THREE namespace/);
});
