'use strict';
/* My Island 3D — FX pools and the edit overlay: pure helpers of world/island3d/fx3d.js and
   world/island3d/edit3d.js. No THREE / WebGL in Node: create() is exercised in the browser lab;
   everything the two modules compute from data (emitter table, caps, spawn maths, envelopes,
   plans, cell states, pulses, the ghost pose, screen → NDC) is tested here. */
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../world/island3d/fx3d.js');
const E = require('../world/island3d/edit3d.js');
const Kit = require('../world/island3d/kit.js');
const Tier = require('../world/island3d/tier.js');
const C = require('../world/world-core.js');
const L = require('../world/world-look.js');
const G = require('../world/island3d/grid3d.js');
const M = require('../world/island3d/motion.js');

const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const tokensOf = (spec) => (typeof spec.tokens === 'string' ? F.TOKENS[spec.tokens] : spec.tokens);
function starterWorld() {
  const u = { points: 0 };
  C.grantStarter(u, Date.UTC(2026, 0, 1));
  return u.world;
}
/* the number of rising zero-crossings of f(t) - mean over [0, T): a frequency estimate */
function crossings(f, T, mean, step = 1 / 600) {
  let n = 0, prev = f(0) - mean;
  for (let t = step; t < T; t += step) {
    const v = f(t) - mean;
    if (prev < 0 && v >= 0) n++;
    prev = v;
  }
  return n;
}
function balanced(src) {
  let d = 0;
  for (const ch of src) { if (ch === '{') d++; if (ch === '}') d--; if (d < 0) return false; }
  return d === 0;
}

/* ================================================================ fx3d ================================================================ */
test('fx3d: loads in Node without THREE, exposes create() and refuses to run without the kit', () => {
  assert.equal(typeof F.create, 'function');
  assert.equal(F.VERSION, 1);
  assert.equal(F.MAX_FLASH_HZ, 2);
  assert.throws(() => F.create(null, null, {}), /kit/);
  assert.throws(() => F.create({}, null, {}), /kit/);
});

test('fx3d: the atlas cells match the kit sparkle atlas', () => {
  assert.deepEqual(F.ATLAS, Kit.ATLAS);
});

test('fx3d: every emitter uses atlas cells, palette tokens, sane ranges and nothing faster than 2 Hz', () => {
  for (const [name, s] of Object.entries(F.KINDS)) {
    assert.ok(Array.isArray(s.cells) && s.cells.length, name + ' cells');
    for (const c of s.cells) assert.ok(F.ATLAS[c] != null, name + ': unknown cell ' + c);
    const toks = tokensOf(s);
    assert.ok(Array.isArray(toks) && toks.length, name + ' tokens');
    for (const t of toks) assert.ok(L.isToken(t), name + ': token ' + t + ' is not in the look tables');
    assert.ok(s.life[0] > 0 && s.life[1] >= s.life[0], name + ' life');
    assert.ok(s.size[0] > 0 && s.size[1] >= s.size[0], name + ' size');
    assert.ok(s.alpha > 0 && s.alpha <= 1, name + ' alpha');
    if (s.twinkle) assert.ok(s.twinkle <= F.MAX_FLASH_HZ, name + ' twinkle');
    if (s.flip) assert.ok(s.flip[1] <= F.MAX_FLASH_HZ, name + ' flip');
    if (s.sway) assert.ok(s.sway[1] <= F.MAX_FLASH_HZ, name + ' sway');
    assert.ok(['fade', 'static', 'none'].includes(s.reduced), name + ' reduced');
    if (s.cap) assert.ok(['confetti', 'bubbles', 'petals', 'snow'].includes(s.cap), name + ' cap');
  }
  for (const set of Object.values(F.TOKENS)) for (const t of set) assert.ok(L.isToken(t), t);
  for (const e of Object.values(F.EMOTES)) { assert.ok(F.ATLAS[e.cell] != null); assert.ok(L.isToken(e.token)); }
  /* the bible's kinds are all there */
  for (const k of ['sparkle', 'heart', 'note', 'star', 'confetti', 'streamer', 'dust', 'splash', 'bubble', 'petal', 'snow', 'firework'])
    assert.ok(F.KINDS[k], k);
  assert.equal(F.KINDS.bubble.pearl, 1);
  assert.deepEqual(tokensOf(F.KINDS.bubble), ['Holo Pink', 'Holo Blue', 'Holo Mint', 'Holo Lemon']);
  assert.equal(F.KINDS.confetti.member, L.FX.confettiMemberShare);
});

test('fx3d: kind and emote names resolve through aliases, unknown kinds play a sparkle', () => {
  assert.equal(F.kindOf('sparkles'), 'sparkle');
  assert.equal(F.kindOf('ring'), 'sparkleRing');
  assert.equal(F.kindOf('fireworks'), 'firework');
  assert.equal(F.kindOf('pearl'), 'bubble');
  assert.equal(F.kindOf('no-such-kind'), 'sparkle');
  assert.equal(F.kindOf('shell'), 'sparkle', 'the firework shell is internal');
  for (const k of ['dust', 'exhaust', 'splash', 'dizzy']) assert.equal(F.kindOf(k), k);
  assert.equal(F.emoteOf('love'), 'star', 'hearts belong to the finger-heart');
  assert.equal(F.emoteOf('music'), 'note');
  assert.equal(F.emoteOf('tumble'), 'dizzy');
  assert.equal(F.emoteOf('fingerHeart'), 'fingerHeart');
  assert.equal(F.emoteOf('???'), 'star');
});

test('fx3d: capacity per tier follows the budgets; per-kind limits never exceed the bible', () => {
  for (const t of Tier.TIERS) {
    const c = F.caps(t);
    assert.equal(c.particles, Tier.BUDGETS[t].particles, t + ' pool');
    assert.equal(c.particles, L.FX.particles[t]);
    assert.ok(c.confetti <= 120 && c.confetti > 0);
    assert.ok(c.bubbles <= 24 && c.bubbles > 0);
    assert.ok(c.petals <= 40 && c.petals > 0);
    assert.ok(c.snow <= L.FX.snow[t] && c.snow > 0);
    assert.ok(c.confetti < c.particles, 'room is left for sparkles while confetti flies');
  }
  assert.equal(F.caps('MID').confetti, 120);
  assert.equal(F.caps('HIGH').snow, 150);
  assert.equal(F.caps('LOW').snow, 60);
  const half = F.caps('MID', 0.5);
  assert.equal(half.particles, 128, 'the adaptive particles step halves the pool');
  assert.ok(half.snow <= 50 && half.confetti <= 96);
  assert.deepEqual(F.caps('nonsense'), F.caps('MID'));
});

test('fx3d: emit counts — defaults, per-unit puffs, clamps, and fewer (or none) under reduced motion', () => {
  assert.equal(F.emitCount('sparkle'), F.KINDS.sparkle.n);
  assert.equal(F.emitCount('exhaust', 1), 3, 'two exhaust cues → pastel puffs in threes');
  assert.equal(F.emitCount('confetti', 500), 120);
  assert.equal(F.emitCount('sparkle', 500), 64);
  assert.equal(F.emitCount('petal', 1, true), 0, 'no falling petals under reduced motion');
  assert.equal(F.emitCount('drop', 4, true), 0);
  assert.equal(F.emitCount('confetti', 120, true), F.KINDS.confetti.reducedMax);
  for (const k of Object.keys(F.KINDS)) {
    if (k === 'shell') continue;
    const full = F.emitCount(k, 24), red = F.emitCount(k, 24, true);
    assert.ok(red <= full && red <= 8, k + ': reduced is fewer');
  }
});

test('fx3d: spawn is deterministic per seed; ring bursts are evenly spaced; disc rings stay in the view plane', () => {
  const a = F.spawn(F.KINDS.confetti, 3, 10, F.rng(42), {});
  const b = F.spawn(F.KINDS.confetti, 3, 10, F.rng(42), {});
  assert.deepEqual(a, b);
  /* dust ring: 6 puffs, headings 60° apart (±9 %) */
  const n = 6, heads = [];
  const r = F.rng(7);
  for (let i = 0; i < n; i++) { const s = F.spawn(F.KINDS.dust, i, n, r, { radius: 1 }); heads.push(Math.atan2(s.vz, s.vx)); assert.ok(s.vy > 0); }
  for (let i = 0; i < n; i++) {
    let d = heads[(i + 1) % n] - heads[i];
    while (d < 0) d += Math.PI * 2;
    assert.ok(Math.abs(d - Math.PI / 3) < Math.PI / 3 * 0.35, 'even ring spacing');
  }
  /* firework disc: velocity ⟂ the plane normal R × U */
  const basis = { rx: 1, ry: 0, rz: 0, ux: 0, uy: 0.6156614753256583, uz: -0.788010753606722 };
  const nx = basis.ry * basis.uz - basis.rz * basis.uy, ny = basis.rz * basis.ux - basis.rx * basis.uz, nz = basis.rx * basis.uy - basis.ry * basis.ux;
  const fr = F.rng(9);
  for (let i = 0; i < 18; i++) {
    const s = F.spawn(F.KINDS.firework, i, 18, fr, { basis });
    assert.ok(Math.abs(s.vx * nx + s.vy * ny + s.vz * nz) < 1e-9, 'in the camera plane');
    assert.ok(Math.hypot(s.vx, s.vy, s.vz) >= F.KINDS.firework.speed[0] - 1e-9);
  }
});

test('fx3d: directed (cannon) spawns stay inside their cone at the requested speed', () => {
  const dir = [0.3, 0.9, -0.2], l = Math.hypot(...dir), d = dir.map((v) => v / l);
  const r = F.rng(11), cone = 0.3;
  for (let i = 0; i < 200; i++) {
    const s = F.spawn(F.KINDS.confetti, i, 200, r, { dir, dirSpeed: [5, 8], cone });
    const sp = Math.hypot(s.vx, s.vy, s.vz);
    assert.ok(sp >= 5 - 1e-6 && sp <= 8 + 1e-6);
    const cos = (s.vx * d[0] + s.vy * d[1] + s.vz * d[2]) / sp;
    assert.ok(cos >= Math.cos(cone) - 1e-9, 'inside the cone');
  }
  /* the pure cone helper on its own */
  const out = F.coneVelocity(0, 1, 0, 2, 0, 0.5, 0.5, {});
  assert.ok(near(out.vx, 0) && near(out.vy, 2) && near(out.vz, 0));
});

test('fx3d: confetti is 40 % member colour when a member colour is known', () => {
  const r = F.rng(3);
  let member = 0, total = 100;
  for (let i = 0; i < total; i++) if (F.spawn(F.KINDS.confetti, i, total, r, { hasMember: true, memberShare: 0.4 }).tok === -1) member++;
  assert.equal(member, 40);
  const r2 = F.rng(3);
  for (let i = 0; i < 20; i++) assert.notEqual(F.spawn(F.KINDS.confetti, i, 20, r2, {}).tok, -1, 'no member colour → the list');
  const r3 = F.rng(3);
  for (let i = 0; i < 20; i++) assert.notEqual(F.spawn(F.KINDS.sparkle, i, 20, r3, { hasMember: true }).tok, -1, 'sparkles keep their own colours');
});

test('fx3d: reduced motion turns any burst into still sparkle fades of about 0.4 s', () => {
  const r = F.rng(5);
  for (const k of ['confetti', 'streamer', 'firework']) {
    for (let i = 0; i < 6; i++) {
      const s = F.spawn(F.KINDS[k], i, 6, r, { reduced: true });
      assert.equal(s.still, 1); assert.equal(s.hump, 1);
      assert.equal(s.vx, 0); assert.equal(s.vy, 0); assert.equal(s.vz, 0); assert.equal(s.spin, 0);
      assert.equal(s.cell, 'sparkle'); assert.equal(s.glow, 1);
      assert.ok(s.life >= 0.4 && s.life <= 0.55, k + ' life ' + s.life);
      assert.equal(s.flipHz, 0); assert.equal(s.swayA, 0); assert.equal(s.twHz, 0);
    }
  }
  const b = F.spawn(F.KINDS.bubble, 0, 1, F.rng(1), { reduced: true });
  assert.equal(b.cell, 'bubble', "'static' kinds keep their own cell");
  assert.equal(b.end, 1, 'and do not grow');
});

test('fx3d: opacity envelopes fade in and out, and every shimmer is clamped to 2 Hz', () => {
  const life = 2;
  assert.equal(F.alphaAt(0, life, 1, 0, 0, 0), 0);
  assert.ok(F.alphaAt(life, life, 1, 0, 0, 0) <= 1e-9);
  assert.ok(near(F.alphaAt(0.5, life, 0.8, 0, 0, 0), 0.8));
  for (let t = 0; t <= life; t += 0.01) assert.ok(F.alphaAt(t, life, 1, 1.6, 0.3, 0) <= 1 + 1e-9);
  /* a requested 10 Hz shimmer is the same as 2 Hz */
  for (let t = 0.1; t < 1.9; t += 0.037) assert.ok(near(F.alphaAt(t, life, 1, 10, 0, 0), F.alphaAt(t, life, 1, 2, 0, 0)));
  const shimmer = (t) => F.alphaAt(0.5 + t, 100, 1, 1.6, 0, 0);
  assert.ok(crossings(shimmer, 4, 0.825) <= 8, 'at most 2 swells a second');
  /* the reduced hump: a single rise and fall */
  assert.equal(F.alphaAt(0, 0.4, 1, 0, 0, 1), 0);
  assert.ok(near(F.alphaAt(0.2, 0.4, 1, 0, 0, 1), 1));
  assert.ok(F.alphaAt(0.4, 0.4, 1, 0, 0, 1) < 1e-9);
  /* paper flips: ≤ 2 Hz and never fully edge-on */
  for (let t = 0; t < 3; t += 0.013) {
    assert.ok(near(F.flipAt(t, 9, 0.5), F.flipAt(t, 2, 0.5)));
    assert.ok(Math.abs(F.flipAt(t, 1.5, 0.5)) >= 0.12);
  }
  assert.equal(F.flipAt(1, 0, 0), 1);
});

test('fx3d: sizes grow or shrink toward end × size, pop in with outBack and swell for glints', () => {
  assert.ok(near(F.sizeAt(0, 1, 0.2, 2, 0, 0), 0.2));
  assert.ok(near(F.sizeAt(1, 1, 0.2, 2, 0, 0), 0.4));
  assert.ok(near(F.sizeAt(0, 1, 0.2, 1, 1, 0), 0), 'a pop starts from nothing');
  assert.ok(F.sizeAt(0.12, 1, 0.2, 1, 1, 0) > 0.2, 'outBack overshoots');
  assert.ok(near(F.sizeAt(0.5, 1, 0.2, 1, 0, 1), 0.2), 'a glint peaks mid-life');
  assert.ok(F.sizeAt(0, 1, 0.2, 1, 0, 1) < 0.1);
});

test('fx3d: integration — gravity with drag reaches g/drag; without drag it is ballistic', () => {
  const pos = new Float32Array(3), vel = new Float32Array(3);
  for (let i = 0; i < 600; i++) F.integrate(pos, vel, 0, 3.2, 1.5, 1 / 60);
  assert.ok(Math.abs(vel[1] + 3.2 / 1.5) < 0.05, 'terminal fall ≈ g / drag');
  const p2 = new Float32Array(3), v2 = new Float32Array([1, 4, 0]);
  const dt = 1 / 600;
  for (let i = 0; i < 300; i++) F.integrate(p2, v2, 0, 2, 0, dt);
  assert.ok(Math.abs(p2[0] - 0.5) < 1e-3);
  assert.ok(Math.abs(p2[1] - (4 * 0.5 - 0.5 * 2 * 0.25)) < 0.01);
});

test('fx3d: pearl bubbles drift slowly through the 4 holo stops (≤ 2 Hz)', () => {
  assert.ok(F.PEARL_HZ <= F.MAX_FLASH_HZ);
  const seen = new Set();
  for (let t = 0; t < 1 / F.PEARL_HZ; t += 0.05) {
    const h = F.holoAt(t, 0, {});
    assert.ok(h.k >= 0 && h.k < 1);
    assert.equal(h.j, (h.i + 1) % 4);
    seen.add(h.i);
  }
  assert.equal(seen.size, 4);
});

test('fx3d: emote bubbles pop in, rise and fade; reduced is a still fade', () => {
  const o = {};
  assert.equal(F.emoteTrack(0, false, o).scale, 0);
  assert.ok(F.emoteTrack(0.15, false, o).scale > 0.9);
  F.emoteTrack(0.8, false, o);
  assert.equal(o.scale, 1); assert.ok(o.dy > 0.1); assert.equal(o.alpha, 1); assert.equal(o.done, false);
  assert.ok(F.emoteTrack(F.EMOTE_SEC - 0.05, false, o).alpha < 0.25);
  assert.equal(F.emoteTrack(F.EMOTE_SEC, false, o).done, true);
  for (let t = 0; t < F.EMOTE_REDUCED_SEC; t += 0.05) {
    F.emoteTrack(t, true, o);
    assert.equal(o.scale, 1); assert.equal(o.dy, 0);
  }
  assert.equal(F.emoteTrack(F.EMOTE_REDUCED_SEC, true, o).done, true);
});

test('fx3d: camera shake is 0.06 u for 0.18 s by default, decays to rest and never runs under reduced motion', () => {
  assert.equal(L.FX.shake.amp, 0.06);
  assert.equal(L.FX.shake.dur, 0.18);
  const o = {};
  let peak = 0;
  for (let t = 0; t < 0.18; t += 0.001) {
    F.shakeOffset(t, 0.06, 0.18, 1234, false, o);
    const m = Math.hypot(o.x, o.y, o.z);
    assert.ok(m <= 0.06 + 1e-12);
    peak = Math.max(peak, m);
  }
  assert.ok(peak > 0.02, 'it is felt');
  F.shakeOffset(0.18, 0.06, 0.18, 1234, false, o);
  assert.deepEqual([o.x, o.y, o.z], [0, 0, 0]);
  F.shakeOffset(0.05, 0.06, 0.18, 1234, true, o);
  assert.deepEqual([o.x, o.y, o.z], [0, 0, 0]);
  const a = F.shakeOffset(0.07, 0.06, 0.18, 99, false, {}), b = F.shakeOffset(0.07, 0.06, 0.18, 99, false, {});
  assert.deepEqual(a, b);
  /* the envelope decays: late samples are smaller than the amplitude left */
  for (let t = 0.1; t < 0.18; t += 0.01) {
    F.shakeOffset(t, 0.06, 0.18, 7, false, o);
    const e = 1 - t / 0.18;
    assert.ok(Math.hypot(o.x, o.y, o.z) <= 0.06 * e * e + 1e-12);
  }
});

test('fx3d: the firework show — 3 shells 0.4 s apart that climb straight up to bursts in the sky', () => {
  const plan = F.fireworkPlan();
  assert.equal(plan.length, L.FX.fireworkRings);
  plan.forEach((f, k) => {
    assert.ok(near(f.t, k * F.FW.stagger));
    assert.ok(f.by > 3.5, 'bursts high above the island');
    assert.equal(f.sx, f.bx); assert.equal(f.sz, f.bz);
    assert.ok(f.sy < f.by);
    assert.ok(f.col >= 0 && f.col < F.TOKENS.neon.length);
  });
  assert.notEqual(plan[0].col, plan[1].col, 'colours vary');
  const moved = F.fireworkPlan(2, [5, 1, 2]);
  assert.equal(moved.length, 2);
  assert.ok(near(moved[0].bx, 5 + F.FW.offsets[0][0]));
  assert.equal(F.fireworkPlan(99).length, 8, 'capped');
});

test('fx3d: confetti cannons sit at the bottom corners of the view and fire up and inward', () => {
  const B = G.basis(0, 52), P = G.cameraPosition({ x: 0, y: 0.3, z: 0 }, 0, 52, 30);
  const cam = { px: P.x, py: P.y, pz: P.z, rx: B.R.x, ry: B.R.y, rz: B.R.z, ux: B.U.x, uy: B.U.y, uz: B.U.z, fx: B.F.x, fy: B.F.y, fz: B.F.z, fov: 30, aspect: 16 / 9 };
  for (const side of [-1, 1]) {
    const p = F.cannonPlan(side, cam, 12);
    const rel = [p.origin[0] - P.x, p.origin[1] - P.y, p.origin[2] - P.z];
    const along = (v, w) => v[0] * w.x + v[1] * w.y + v[2] * w.z;
    assert.ok(Math.sign(along(rel, B.R)) === side, 'on its own side');
    assert.ok(along(rel, B.U) < 0, 'in the lower half');
    assert.ok(Math.abs(along(rel, B.R)) <= p.halfW, 'inside the view');
    assert.ok(near(along(rel, B.F), 12, 1e-6), 'at the requested distance');
    assert.ok(near(Math.hypot(...p.dir), 1, 1e-9));
    assert.ok(along(p.dir, B.U) > 0.6, 'fires upward on screen');
    assert.ok(along(p.dir, B.R) * side < 0, 'and inward');
  }
});

test('fx3d: the sprite shader is one program for paper and glow, fogged, colour-managed and premultiplied', () => {
  const { SPRITE_VERT: V, SPRITE_FRAG: Fs } = F.SHADERS;
  assert.ok(balanced(V) && balanced(Fs));
  assert.match(V, /#include <fog_vertex>/);
  assert.match(V, /attribute vec4 iPos;/);
  assert.match(V, /iData\.w >= 1\.5/, 'flat ground sprites');
  assert.match(Fs, /#include <colorspace_fragment>/);
  assert.match(Fs, /#ifdef FOG_EXP2/);
  assert.match(Fs, /gl_FragColor = vec4\(gl_FragColor\.rgb \* a, a \* \(1\.0 - vGlow\)\)/, 'premultiplied: glow writes alpha 0');
  assert.doesNotMatch(Fs, /tonemapping_fragment/);
});

/* ================================================================ fx3d: Encore City ================================================================ */
/* a minimal THREE + kit, enough for create() in Node (no WebGL) */
class FxColor {
  constructor(r = 1, g = 1, b = 1) { this.r = r; this.g = g; this.b = b; this.isColor = true; }
  copy(c) { this.r = c.r; this.g = c.g; this.b = c.b; return this; }
  clone() { return new FxColor(this.r, this.g, this.b); }
  setRGB(r, g, b) { this.r = r; this.g = g; this.b = b; return this; }
  lerp(c, k) { this.r += (c.r - this.r) * k; this.g += (c.g - this.g) * k; this.b += (c.b - this.b) * k; return this; }
}
class FxV3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; this.isVector3 = true; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(v) { return this.set(v.x, v.y, v.z); }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  equals(v) { return v.x === this.x && v.y === this.y && v.z === this.z; }
}
class FxObj { constructor(g, m) { this.children = []; this.parent = null; this.geometry = g; this.material = m; this.visible = true; }
  add(o) { o.parent = this; this.children.push(o); return this; } remove(o) { this.children = this.children.filter((c) => c !== o); o.parent = null; return this; } }
class FxAttr { constructor(a, n) { this.array = a; this.itemSize = n; this.updateRanges = []; } setUsage() { return this; } }
class FxGeo { constructor() { this.attributes = {}; this.instanceCount = 0; } setIndex() {} setAttribute(n, a) { this.attributes[n] = a; } dispose() {} }
const FxT = {
  Color: FxColor, Vector3: FxV3, Group: FxObj, Mesh: FxObj, InstancedBufferGeometry: FxGeo, BufferAttribute: FxAttr,
  InstancedBufferAttribute: FxAttr, ShaderMaterial: class { constructor(o) { Object.assign(this, o); } dispose() {} },
  UniformsUtils: { merge: (l) => Object.assign({}, ...l) }, UniformsLib: { fog: {} },
  CustomBlending: 5, AddEquation: 100, OneFactor: 201, OneMinusSrcAlphaFactor: 205, DynamicDrawUsage: 35048
};
function fxKit(tier) {
  const pools = [];
  const hexCol = (h) => { const n = parseInt(String(h).slice(1), 16); return new FxColor(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255); };
  return {
    THREE: FxT, tier: tier || 'MID', pools, ATLAS: Kit.ATLAS, ATLAS_CELLS: Kit.ATLAS_CELLS,
    col: (tok) => Object.assign(hexCol(L.hex(tok) || '#CFC8DC'), { tok }), rgb: (h) => Object.assign(hexCol(h), { tok: h }),
    tex: { sparkles: () => ({}) },
    billboards(o) {
      const used = new Set(), sets = new Map();
      const p = { mesh: new FxObj(), sets, alloc() { for (let i = 0; i < o.capacity; i++) if (!used.has(i)) { used.add(i); return i; } return -1; },
        free(i) { used.delete(i); sets.delete(i); }, set(i, ...a) { sets.set(i, a); }, commit() {}, dispose() {}, get live() { return used.size; } };
      pools.push(p);
      return p;
    }
  };
}
function fxMake(o) { const K = fxKit(o && o.tier); return { K, fx: F.create(K, {}, Object.assign({ seed: 5, tier: 'MID' }, o)) }; }
function liveCells(fx) {
  const mesh = fx.group.children.find((m) => m.geometry && m.geometry.attributes.iData && m.geometry.instanceCount !== undefined && m.material.name === 'fx3d:particles');
  const d = mesh.geometry.attributes.iData.array, c = mesh.geometry.attributes.iCol.array, out = [];
  for (let k = 0; k < mesh.geometry.instanceCount; k++) if (c[k * 4 + 3] > 0 || d[k * 4] > 0) out.push(d[k * 4 + 2]);
  return out;
}
const CELL_NAME = Object.fromEntries(Object.entries(Kit.ATLAS).map(([k, v]) => [v, k]));

test('fx3d: confetti is 55 % rectangles, 25 % ✦ and 20 % curly streamers — never hearts or circles', () => {
  assert.deepEqual(F.CONFETTI_MIX, { rect: 0.55, sparkle: 0.25, curl: 0.2 });
  for (const len of [20, 40, 100, 120]) {
    const n = { rect: 0, sparkle: 0, curl: 0 };
    const r = F.rng(len);
    for (let i = 0; i < len; i++) n[F.spawn(F.KINDS.confetti, i, len, r, {}).cell]++;
    assert.deepEqual(n, { rect: Math.round(0.55 * len), sparkle: Math.round(0.25 * len), curl: Math.round(0.2 * len) }, len + ' pieces');
  }
  /* evenly mixed: every 5 consecutive pieces hold at least two rectangles */
  for (let i = 0; i < 20; i++) assert.ok([0, 1, 2, 3, 4].filter((k) => F.confettiCell(i + k) === 'rect').length >= 2);
  for (const c of F.KINDS.confetti.cells.concat(F.KINDS.streamer.cells)) assert.ok(!['heart', 'circle'].includes(c), c);
  /* the streamers in the mix are long curls */
  const curl = F.spawn(F.KINDS.confetti, F.MIX_PATTERN.indexOf('curl'), 20, F.rng(1), {});
  assert.ok(curl.size >= F.KINDS.confetti.size[0] * 2, 'curls are longer: ' + curl.size);
});

test('fx3d: confetti colours are 40 % the member colour, the rest Neon Magenta / LED Cyan / Electric Violet / Bone White', () => {
  assert.deepEqual(F.TOKENS.confetti, ['Neon Magenta', 'LED Cyan', 'Electric Violet', 'Bone White']);
  const { fx } = fxMake({ member: '#4FC3F7' });
  assert.equal(fx.emit('confetti', [0, 0, 0], 100), 100);
  const mesh = fx.group.children.find((m) => m.material.name === 'fx3d:particles'), col = mesh.geometry.attributes.iCol.array;
  const member = [0x4F / 255, 0xC3 / 255, 0xF7 / 255], allowed = F.TOKENS.confetti.map((t) => L.hex(t));
  let m = 0;
  for (let k = 0; k < 100; k++) {
    const c = [col[k * 4], col[k * 4 + 1], col[k * 4 + 2]];
    if (c.every((v, i) => near(v, member[i], 1e-6))) { m++; continue; }
    const hex = '#' + c.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
    assert.ok(allowed.includes(hex), 'confetti colour ' + hex);
  }
  assert.equal(m, 40, '40 % in the member colour');
  assert.ok(liveCells(fx).every((c) => !['heart', 'circle'].includes(CELL_NAME[c])), 'no hearts or circles fly');
});

test('fx3d: fireworks are ✦ ring bursts that leave ✦ trails (MID/HIGH), soft and flash-free', () => {
  assert.deepEqual(F.KINDS.firework.cells, ['sparkle']);
  assert.equal(F.KINDS.firework.spread, 'disc');
  assert.ok(F.KINDS.firework.trail >= 0.05, 'trail sprites at most every 0.05 s');
  assert.deepEqual(F.TOKENS.neon, L.NEON4);
  for (const tier of ['MID', 'LOW']) {
    const { fx } = fxMake({ tier });
    assert.equal(fx.fireworks({}), 3);
    for (let i = 0; i < 90; i++) fx.update(1 / 60);
    const cells = liveCells(fx).map((c) => CELL_NAME[c]);
    assert.ok(cells.every((c) => c === 'sparkle' || c === 'dot'), tier + ': only ✦ (and the soft glow): ' + [...new Set(cells)].join(','));
    /* one ring of 20: on MID it leaves ✦ trails behind it, on LOW the small pool keeps just the ring */
    const { fx: one } = fxMake({ tier });
    one.emit('firework', [0, 5, 0], 20);
    for (let i = 0; i < 18; i++) one.update(1 / 60);
    if (tier === 'MID') assert.ok(one.info().alive > 30, 'the ring and its ✦ trails: ' + one.info().alive);
    else assert.equal(one.info().alive, 20, 'LOW: no trails');
    assert.equal(one.emit('firework', [0, 5, 0], 20, { trail: false }), 20);
  }
  /* reduced motion: a still sparkle fade per burst, nothing launched, no trails */
  const { fx: rfx } = fxMake({ reduced: true });
  rfx.fireworks({});
  assert.equal(rfx.info().queued, 0);
  assert.ok(rfx.info().alive <= 3 * F.KINDS.firework.reducedMax);
});

test('fx3d: dust puffs are a small grey-violet', () => {
  assert.deepEqual(F.KINDS.dust.tokens, ['Concrete Light', 'Text Muted']);
  for (const t of F.KINDS.dust.tokens) {
    const h = L.hex(t), r = parseInt(h.slice(1, 3), 16), g = parseInt(h.slice(3, 5), 16), b = parseInt(h.slice(5, 7), 16);
    assert.ok(b > g && r > g && Math.max(r, g, b) - Math.min(r, g, b) < 50, t + ' is a muted grey-violet');
  }
  assert.ok(F.KINDS.dust.size[1] <= 0.22);
});

test('fx3d: hearts appear only for the finger-heart', () => {
  /* the emitter table: only the finger-heart kind uses the heart cell */
  for (const [name, s] of Object.entries(F.KINDS)) if (name !== 'heart') assert.ok(!s.cells.includes('heart'), name);
  for (const [name, e] of Object.entries(F.EMOTES)) if (name !== 'fingerHeart') assert.notEqual(e.cell, 'heart', name);
  assert.equal(F.heartAllowed({}), false);
  assert.equal(F.heartAllowed({ fingerHeart: true }), true);
  const { fx } = fxMake({});
  fx.emit('heart', [0, 1, 0], 3);
  fx.emit('love', [0, 1, 0], 3);
  fx.emit('hearts', [0, 1, 0], 3, { token: 'Neon Pink' });
  assert.ok(fx.info().alive >= 3, 'something still celebrates');
  assert.ok(liveCells(fx).every((c) => CELL_NAME[c] !== 'heart'), 'but never a heart');
  fx.emit('heart', [0, 1, 0], 1, { fingerHeart: true });
  fx.update(0.1);
  assert.ok(liveCells(fx).some((c) => CELL_NAME[c] === 'heart'), 'the finger-heart is the one heart');
  /* emote bubbles: a 'heart' bubble shows a star; 'fingerHeart' the heart */
  assert.equal(F.emoteOf('heart'), 'star');
  assert.equal(F.emoteOf('fingerHeart'), 'fingerHeart');
});

test('fx3d: the local halo bloom — up 0.25 s, down 0.5 s, at most once per 1.5 s per item, ≤ 1.2 u, never reduced', () => {
  assert.equal(L.FX.bloomGapSec, 1.5);
  assert.equal(F.bloomAt(0), 0);
  assert.ok(near(F.bloomAt(0.25), 1, 1e-9));
  assert.ok(F.bloomAt(0.5) > 0 && F.bloomAt(0.5) < 1);
  assert.equal(F.bloomAt(0.76), -1, 'over after 0.75 s');
  let prev = -1;
  for (let t = 0; t <= 0.25; t += 0.01) { const v = F.bloomAt(t); assert.ok(v >= prev - 1e-12); prev = v; }
  assert.equal(F.bloomAllowed(null, 3), true);
  assert.equal(F.bloomAllowed(3, 4.4), false);
  assert.equal(F.bloomAllowed(3, 4.5), true);
  assert.ok(F.BLOOM_MAX <= 1.2);
  const { K, fx } = fxMake({});
  const halos = K.pools[K.pools.length - 1];
  assert.equal(fx.bloom('booth:p7', [1, 1.5, 0], { size: 9, token: 'Window Warm' }), true);
  assert.equal(fx.bloom('booth:p7', [1, 1.5, 0]), false, 'a quick re-tap never re-blooms');
  assert.equal(fx.bloom('screen:p8', [3, 2, 0]), true, 'another item blooms on its own clock');
  let maxSize = 0, maxA = 0;
  for (let i = 0; i < 60; i++) {
    fx.update(1 / 60);
    for (const a of halos.sets.values()) { maxSize = Math.max(maxSize, a[3]); maxA = Math.max(maxA, a[5]); }
    if (i === 29) assert.equal(fx.bloom('booth:p7', [1, 1.5, 0]), false, 'still within 1.5 s');
  }
  assert.ok(maxSize <= 1.2 + 1e-9 && maxA <= 1 + 1e-9 && maxA > 0.9, 'size ' + maxSize + ' alpha ' + maxA);
  assert.equal(fx.info().blooms, 0, 'both blooms are over');
  assert.equal(halos.live, 0, 'their halo slots are free');
  for (let i = 0; i < 40; i++) fx.update(1 / 60);
  assert.equal(fx.bloom('booth:p7', [1, 1.5, 0]), true, 'after 1.5 s it may bloom again');
  fx.setReduced(true);
  assert.equal(fx.info().blooms, 0, 'reduced motion settles it');
  assert.equal(fx.bloom('other', [0, 0, 0]), false, 'and never blooms');
});

test('fx3d: uplight pools follow the Showtime mix (0.25 golden hour → 0.4 Showtime, r 0.5)', () => {
  assert.deepEqual(L.FX.uplight, { r: 0.5, day: 0.25, show: 0.4 });
  const { fx } = fxMake({});
  assert.equal(fx.uplight('lamp:p3', true, { x: 1, y: 0.02, z: 2 }, 'Window Warm'), true);
  const marks = fx.group.children.find((m) => m.material.name === 'fx3d:marks');
  const alpha = () => marks.geometry.attributes.iCol.array[3], size = () => marks.geometry.attributes.iData.array[0];
  assert.ok(near(alpha(), 0.25, 1e-6) && near(size(), 0.5 * 2 / 0.875, 1e-6));
  fx.update(1 / 60, 12.3, { show: 1 });
  assert.ok(near(alpha(), 0.4, 1e-6), 'Showtime');
  fx.update(1 / 60, 12.4, { show: 0.5 });
  assert.ok(near(alpha(), 0.325, 1e-6), 'mid-blend');
  assert.equal(fx.info().uplights, 1);
  fx.uplight('lamp:p3', false);
  assert.equal(fx.info().uplights, 0);
});

test('fx3d: emote bubbles are dark glass with a neon rim and a glowing icon', () => {
  assert.equal(F.EMOTE_SLOTS, 4);
  const { fx } = fxMake({});
  fx.emote([0, 1, 0], 'note');
  const marks = fx.group.children.find((m) => m.material.name === 'fx3d:marks');
  const base = F.MARK_CAP, d = marks.geometry.attributes.iData.array, c = marks.geometry.attributes.iCol.array;
  const glass = L.hex('Panel Glass'), toHex = (k) => '#' + [0, 1, 2].map((i) => Math.round(c[k * 4 + i] * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
  assert.equal(toHex(base), glass, 'the bubble is dark glass');
  assert.equal(CELL_NAME[d[(base + 1) * 4 + 2]], 'ring', 'a neon rim');
  assert.equal(d[(base + 1) * 4 + 3] % 2, 1, 'the rim glows');
  assert.equal(CELL_NAME[d[(base + 3) * 4 + 2]], 'note');
  assert.equal(toHex(base + 3), L.hex('Electric Violet'));
  for (const e of Object.values(F.EMOTES)) assert.ok(L.isToken(e.token));
});

test('fx3d: flash safety — every rate ≤ 2 Hz, no big white sprite, the LED sets mix 4 hues', () => {
  for (const [name, s] of Object.entries(F.KINDS)) {
    if (s.twinkle) assert.ok(s.twinkle <= 2, name);
    if (s.flip) assert.ok(s.flip[1] <= 2, name);
    if (s.sway) assert.ok(s.sway[1] <= 2, name);
    if (s.glow) assert.ok(s.size[1] * (s.end > 1 ? s.end : 1) <= 1.2, name + ': a glow stays a local sprite');
  }
  assert.ok(F.PEARL_HZ <= 2);
  for (const set of ['neon', 'confetti', 'sparkle']) assert.ok(new Set(F.TOKENS[set]).size >= 4, set + ' mixes 4 hues');
  assert.ok(!Object.values(F.TOKENS).some((l) => l.includes('Cloud White') && l.length === 1), 'no plain white set');
});

/* ================================================================ edit3d ================================================================ */
test('edit3d: loads in Node without THREE, exposes create() and refuses to run without the kit', () => {
  assert.equal(typeof E.create, 'function');
  assert.equal(E.VERSION, 1);
  assert.throws(() => E.create(null, null, {}), /kit/);
  assert.throws(() => E.create({}, null, {}), /kit/);
  assert.deepEqual(E.EDIT_FALLBACK, JSON.parse(JSON.stringify(L.EDIT)), 'the fallback copy matches world-look EDIT');
});

test('edit3d: state names, aliases and the bible look of every state', () => {
  assert.equal(E.normState('edit'), 'grid');
  assert.equal(E.normState('ok'), 'valid');
  assert.equal(E.normState('blocked'), 'invalid');
  assert.equal(E.normState('door'), 'entrance');
  assert.equal(E.normState('selected'), 'select');
  assert.equal(E.normState('none'), null);
  assert.equal(E.normState(false), null);
  assert.equal(E.normState('purple'), undefined);
  const g = E.stateStyle('grid'), v = E.stateStyle('valid'), i = E.stateStyle('invalid'), e = E.stateStyle('entrance'), s = E.stateStyle('select');
  assert.equal(g.edge, 'Cloud White'); assert.equal(g.edgeA, 0.55); assert.equal(g.dashed, 1); assert.equal(g.fillA, 0);
  assert.equal(v.fill, 'Success'); assert.equal(v.fillA, 0.45); assert.equal(v.edge, 'Neon Cyan'); assert.equal(v.pulse, 0);
  assert.equal(i.fill, 'Error'); assert.equal(i.fillA, 0.42); assert.equal(i.pulse, 1); assert.equal(i.hz, 1.5);
  assert.equal(e.fill, 'Star Gold'); assert.equal(e.fillA, 0.25);
  assert.equal(s.edge, 'Star Gold'); assert.equal(s.pulse, 1);
  for (const st of [g, v, i, e, s]) {
    assert.ok(L.isToken(st.edge));
    if (st.fill) assert.ok(L.isToken(st.fill));
    assert.ok(st.width >= 0.02, 'no line thinner than 0.02 u (shimmer)');
    assert.ok(st.hz <= E.MAX_FLASH_HZ);
  }
});

test('edit3d: the land to outline comes from worlds, region names, key lists, cells and maps', () => {
  const w = starterWorld();
  assert.deepEqual(E.landKeys(w), C.landSet(w));
  const home = E.landKeys(['home']);
  assert.equal(Object.keys(home).length, C.REGION_CELLS.home.length);
  assert.deepEqual(Object.keys(E.landKeys(['home', 'cove'])).length, C.REGION_CELLS.home.length + C.REGION_CELLS.cove.length);
  assert.deepEqual(E.landKeys(['3,4', { c: 5, r: 6 }, { x: 1, y: 2 }, 'junk']), { '3,4': 1, '5,6': 1, '1,2': 1 });
  assert.deepEqual(E.landKeys({ '1,1': 1, '2,2': 0, nope: 1 }), { '1,1': 1 });
  assert.equal(E.landKeys(null), null);
});

test('edit3d: edit mode outlines every land cell, white and dashed', () => {
  const w = starterWorld(), land = C.landSet(w);
  const list = E.cellStates(land, null);
  assert.equal(list.length, Object.keys(land).length);
  assert.ok(list.every((q) => q.s === 'grid' && q.land));
  for (let k = 1; k < list.length; k++) assert.ok(list[k - 1].r < list[k].r || (list[k - 1].r === list[k].r && list[k - 1].c < list[k].c), 'sorted');
  assert.equal(E.cellStates(land, 'edit').length, list.length);
  assert.equal(E.cellStates(land, 'none').length, 0);
});

test('edit3d: a valid placement shows its footprint valid and its entrance gold; the rest stays white', () => {
  const w = starterWorld(), land = C.landSet(w);
  let spot = null;
  for (let y = 0; y < 10 && !spot; y++) for (let x = 0; x < 16 && !spot; x++) if (C.canPlace(w, 'house_cottage', x, y).ok) spot = { x, y };
  assert.ok(spot, 'the starter island has room for a second home-sized footprint');
  const placing = Object.assign({ id: 'house_cottage', uid: null }, spot, C.canPlace(w, 'house_cottage', spot.x, spot.y));
  const list = E.cellStates(land, placing), by = Object.fromEntries(list.map((q) => [q.key, q.s]));
  for (const k of placing.cells) assert.equal(by[k], 'valid', k);
  for (const k of placing.entrance) assert.equal(by[k], 'entrance', k);
  assert.equal(list.filter((q) => q.s === 'grid').length, Object.keys(land).length - placing.cells.length - placing.entrance.length);
  /* the same without the computed cells: the footprint comes from the catalogue */
  const bare = E.cellStates(land, { id: 'house_cottage', x: spot.x, y: spot.y, ok: true });
  assert.equal(bare.filter((q) => q.s === 'valid').length, 4);
});

test('edit3d: an invalid placement pulses red, also over the sea; no entrance is shown', () => {
  const w = starterWorld(), land = C.landSet(w);
  const house = w.placed.find((p) => p.id === 'house_cottage');
  const blocked = Object.assign({ id: 'tree_oak', x: house.x, y: house.y }, C.canPlace(w, 'tree_oak', house.x, house.y));
  assert.equal(blocked.ok, false);
  const list = E.cellStates(land, blocked);
  assert.equal(list.find((q) => q.key === house.x + ',' + house.y).s, 'invalid');
  assert.ok(!list.some((q) => q.s === 'entrance' || q.s === 'valid'));
  const sea = Object.assign({ id: 'house_cottage', x: 15, y: 9 }, C.canPlace(w, 'house_cottage', 15, 9));
  const sl = E.cellStates(land, sea).filter((q) => q.s === 'invalid');
  assert.equal(sl.length, 4);
  assert.ok(sl.some((q) => !q.land), 'off-land footprint cells are drawn at sea level');
  assert.ok(sl.some((q) => q.c === 16 || q.r === 10), 'even past the grid edge');
  /* a reason without ok counts as invalid */
  assert.ok(E.cellStates(land, { id: 'tree_oak', x: 1, y: 1, reason: 'Pick a square.' }).some((q) => q.s === 'invalid'));
});

test('edit3d: explicit per-cell states (map and list) override and remove cells', () => {
  const land = { '1,1': 1, '2,1': 1, '3,1': 1 };
  const m = Object.fromEntries(E.cellStates(land, { '2,1': 'invalid', '3,1': 'none', '9,9': 'entrance', bad: 'valid' }).map((q) => [q.key, q.s]));
  assert.deepEqual(m, { '1,1': 'grid', '2,1': 'invalid', '9,9': 'entrance' });
  const l = Object.fromEntries(E.cellStates(land, [{ c: 1, r: 1, s: 'select' }, { key: '3,1', state: 'off' }]).map((q) => [q.key, q.s]));
  assert.deepEqual(l, { '1,1': 'select', '2,1': 'grid' });
  assert.ok(E.cellStates(land, 'valid').every((q) => q.s === 'valid'));
});

test('edit3d: the invalid pulse and the selection pulse run at 1.5 Hz (≤ 2 Hz) and hold still under reduced motion', () => {
  const hz = L.EDIT.invalid.hz;
  assert.equal(hz, 1.5);
  for (let t = 0; t < 2; t += 0.013) {
    const p = E.cellPulse(t, hz, false);
    assert.ok(p >= 0.6 - 1e-12 && p <= 1 + 1e-12);
    assert.ok(near(p, E.cellPulse(t + 1 / hz, hz, false), 1e-9), 'periodic at 1.5 Hz');
    assert.ok(near(E.cellPulse(t, 7, false), E.cellPulse(t, 2, false)), 'clamped to 2 Hz');
    const s = E.selPulse(t, hz, false);
    assert.ok(s >= 0 && s <= 1);
  }
  assert.equal(crossings((t) => E.cellPulse(t, hz, false), 4, 0.8), 6);
  assert.equal(E.cellPulse(0.3, hz, true), 1);
  assert.equal(E.selPulse(0.3, hz, true), 0.5);
  assert.ok(E.rimPulse(0.2, true) > 0 && E.rimPulse(0.2, true) <= 1);
});

test('edit3d: the ghost lifts 0.25 u and wobbles ±4° at 3 Hz; invalid is fainter; reduced motion is still', () => {
  const o = {};
  let peak = 0;
  for (let t = 0; t < 1; t += 0.005) {
    E.ghostPose(t, true, false, o);
    assert.ok(Math.abs(o.rz) <= 4 + 1e-9 && Math.abs(o.rx) <= 4 + 1e-9);
    assert.ok(near(o.rz, E.ghostPose(t + 1 / 3, true, false, {}).rz, 1e-9), '3 Hz');
    peak = Math.max(peak, Math.abs(o.rz));
  }
  assert.ok(peak > 3.9);
  assert.equal(o.lift, 0.25); assert.equal(o.opacity, 0.85); assert.equal(o.grey, 0);
  E.ghostPose(0.4, false, false, o);
  assert.equal(o.opacity, 0.5); assert.equal(o.grey, 1);
  E.ghostPose(0.4, true, true, o);
  assert.deepEqual([o.rx, o.rz, o.dy], [0, 0, 0]);
  assert.equal(o.lift, 0.25);
});

test('edit3d: dashes are centred on the corners (a solid L) and spaced evenly along each side', () => {
  const len = E.CELL.half * 2;
  assert.ok(E.dashOn(0, len) && E.dashOn(len, len), 'solid corners');
  let on = 0, n = 0;
  for (let s = 0; s <= len; s += len / 400) {
    assert.equal(E.dashOn(s, len), E.dashOn(len - s, len), 'symmetric');
    n++; if (E.dashOn(s, len)) on++;
  }
  assert.ok(Math.abs(on / n - E.CELL.duty) < 0.08, 'coverage ≈ the duty');
  /* a 2-cell footprint side gets more dashes, still solid at both corners */
  assert.ok(E.dashOn(0, 1.92) && E.dashOn(1.92, 1.92));
  let flips = 0, prev = E.dashOn(0, 1.92);
  for (let s = 0; s <= 1.92; s += 0.002) { const d = E.dashOn(s, 1.92); if (d !== prev) flips++; prev = d; }
  assert.ok(flips >= 2 * Math.round(1.92 * E.CELL.dashPerU) - 2, 'dash count scales with the side length');
});

test('edit3d: footprint centres match grid3d pivots; the ghost floats over terraces and the sea', () => {
  for (const [id, x, y] of [['house_cottage', 3, 2], ['tree_oak', 0, 5], ['att_pitch', 9, 6]]) {
    const fp = C.item(id).fp, p = G.pivot(id, x, y), c = E.footCenter(fp, x, y, {});
    assert.ok(near(c.x, p.x) && near(c.z, p.z), id);
  }
  const meadow = E.landKeys(['home', 'meadow']);
  assert.equal(E.groundOf([1, 1], 0, 5, meadow), G.surfaceY(0, 5));
  assert.equal(E.groundOf([2, 1], 0, 5, meadow), Math.max(G.surfaceY(0, 5), G.surfaceY(1, 5)), 'the highest terrace under the footprint');
  assert.equal(E.groundOf([1, 1], 15, 9, E.landKeys(['home'])), G.SEA_Y);
});

test('edit3d: the tray target — elements, canvas pixels, client points, NDC and world points', () => {
  const rect = { left: 100, top: 50, width: 800, height: 400 };
  const el = { getBoundingClientRect: () => ({ left: 480, top: 460, width: 40, height: 20 }) };
  let n = E.toNdc(el, rect, {});
  assert.ok(near(n.x, 0) && near(n.y, -1.1), 'an element below the stage');
  n = E.toNdc({ x: 600, y: 100 }, rect, {});
  assert.ok(near(n.x, 0.5) && near(n.y, 0.5));
  n = E.toNdc({ clientX: 100, clientY: 50 }, rect, {});
  assert.ok(near(n.x, -1) && near(n.y, 1));
  n = E.toNdc({ ndcX: 3, ndcY: -0.5 }, null, {});
  assert.ok(near(n.x, 1.4) && near(n.y, -0.5), 'clamped');
  n = E.toNdc([1, 2, 3], rect, {});
  assert.equal(n.world, true); assert.deepEqual([n.wx, n.wy, n.wz], [1, 2, 3]);
  n = E.toNdc(() => ({ ndcX: 0.2, ndcY: 0.1 }), rect, {});
  assert.ok(near(n.x, 0.2) && near(n.y, 0.1));
  n = E.toNdc(null, rect, {});
  assert.ok(near(n.x, 0) && n.y < -1, 'default: just below the bottom centre');
  n = E.toNdc(el, null, {});
  assert.ok(n.y < -1, 'no canvas: the default');
});

test('edit3d: the store flight arcs from the item to the tray', () => {
  const from = [1, 1, 1], to = [3, 5, -1], o = {};
  E.flightPoint(0, from, to, 0.8, o);
  assert.deepEqual([o.x, o.y, o.z], from);
  E.flightPoint(1, from, to, 0.8, o);
  assert.deepEqual([o.x, o.y, o.z], to);
  E.flightPoint(0.5, from, to, 0.8, o);
  assert.ok(o.y > (from[1] + to[1]) / 2, 'raised in the middle');
});

test('edit3d: drop-in and store follow the SLMotion timelines (fall 1.2 u, squash, rebound; shrink then fly)', () => {
  const o = {};
  E.dropPose(0, false, o);
  assert.ok(near(o.dy, 1.2));
  E.dropPose(0.25, false, o);
  assert.ok(near(o.sy, 0.8) && near(o.sxz, 1.12) && near(o.dy, 0));
  E.dropPose(M.durOf('dropIn', {}), false, o);
  assert.ok(near(o.sy, 1, 1e-6) && near(o.sxz, 1, 1e-6) && near(o.dy, 0));
  assert.deepEqual(E.dropPose(0.3, false, {}), M.sample('dropIn', 0.3, {}, {}));
  E.storePose(0.1, false, o);
  assert.ok(o.s > 0 && o.flight === 0);
  E.storePose(M.durOf('store', {}), false, o);
  assert.ok(near(o.s, 0) && near(o.flight, 1) && near(o.a, 0));
  assert.equal(E.dropPose(0.05, true, {}).dy, 0, 'reduced: no fall');
});

test('edit3d: the overlay shader draws rounded, dashed, pulsing cells in one colour-managed pass', () => {
  const { CELL_VERT: V, CELL_FRAG: Fs } = E.SHADERS;
  assert.ok(balanced(V) && balanced(Fs));
  assert.match(Fs, /float sdRound\(vec2 p, vec2 b, float r\)/);
  assert.match(Fs, /fwidth\(d\)/, 'anti-aliased edges at any zoom');
  assert.match(Fs, /uHz \* uTime/);
  assert.match(Fs, /#include <colorspace_fragment>/);
  assert.match(V, /#include <fog_vertex>/);
  assert.ok(E.CAP_CELLS >= 16 * 10 + 8, 'room for the whole grid plus off-land footprints, entrances and the ring');
});
