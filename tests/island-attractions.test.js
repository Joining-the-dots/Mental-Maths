'use strict';
/* My Island 3D — attractions and cosmetics (world/island3d/models-attractions.js).
   THREE is not available in Node: the pure helpers are tested directly, and every
   builder is run against a small mock kit (sample-point geometry) to check the
   structure (parts, pivots, anchors, materials), the colour tokens and the footprints
   for every id, style and tier. */
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../world/world-look.js');
const C = require('../world/world-core.js');
const Motion = require('../world/island3d/motion.js');
const Tier = require('../world/island3d/tier.js');

/* the module reads SLIslandLook / SLMotion / SLTier from the global root when present */
globalThis.SLIslandLook = L;
globalThis.SLMotion = Motion;
globalThis.SLTier = Tier;
const A = require('../world/island3d/models-attractions.js');

const close = (a, b, eps) => Math.abs(a - b) <= (eps || 1e-9);
const isToken = (t) => typeof t === 'string' && L.hex(t) !== null;

/* ---------------- ids, tables and tokens ---------------- */
test('attractions: loads in Node without THREE and registers nothing', () => {
  assert.equal(typeof A.models, 'function');
  assert.equal(typeof A.makeBallApi, 'function');
  assert.equal(globalThis.SL3D, undefined);
});

test('attractions: owns exactly the attraction, course, ball, stadium, kart and track ids', () => {
  const want = Object.keys(L.LOOK).filter((id) => {
    const e = L.LOOK[id];
    return e.kind === 'attraction' || ['course', 'ball', 'stadium', 'kart', 'track'].includes(e.slot);
  }).sort();
  assert.deepEqual([...A.ALL_IDS].sort(), want);
  assert.equal(A.ALL_IDS.length, 23);
  for (const id of A.ALL_IDS) assert.ok(C.item(id), id + ' is a CATALOG item');
});

test('attractions: colour tables mirror the LOOK table exactly', () => {
  for (const id of A.ALL_IDS) assert.deepEqual(A.COLORS[id], { ...L.LOOK[id].colors }, id);
});

test('attractions: slot tokens resolve to the selected style, unknown styles to the default', () => {
  assert.equal(A.tok('att_course', 'banner', { course: 'course_snow' }), 'THEME.course_snow.1');
  assert.equal(A.tok('att_course', 'banner', { course: 'course_nope' }), 'THEME.course_meadow.1');
  assert.equal(A.tok('att_pitch', 'grass', { stadium: 'stadium_night' }), 'STADIA.stadium_night.1');
  assert.equal(A.tok('att_pitch', 'ball', {}), 'BALLS.ball_classic.0');
  assert.equal(A.tok('att_kart', 'kart', { kart: 'kart_gold' }), 'KARTS.kart_gold');
  assert.equal(A.slotToken('Ink', {}), 'Ink');
  for (const slot of Object.keys(A.SLOT_DEFAULTS)) {
    assert.ok(A.IDS[slot + 's'].includes(A.SLOT_DEFAULTS[slot]), slot + ' default is one of its ids');
    assert.equal(A.SLOT_DEFAULTS[slot], C.DEFAULTS[slot], slot + ' default matches SLWorldCore.DEFAULTS');
  }
  /* every part token of every id resolves for every style */
  const styles = {
    att_course: A.IDS.courses.map((course) => ({ course })),
    att_pitch: A.IDS.balls.flatMap((ball) => A.IDS.stadiums.map((stadium) => ({ ball, stadium }))),
    att_kart: A.IDS.karts.map((kart) => ({ kart }))
  };
  for (const id of A.ALL_IDS) {
    for (const st of styles[id] || [{}]) {
      for (const part of Object.keys(A.COLORS[id])) assert.ok(isToken(A.tok(id, part, st)), id + '.' + part + ' ' + A.tok(id, part, st));
    }
  }
});

test('attractions: every extra token resolves (palette, ART2D or EXTRA only)', () => {
  const walk = (v) => (typeof v === 'string' ? [v] : Array.isArray(v) ? v.flatMap(walk) : Object.values(v).flatMap(walk));
  for (const t of walk(A.X)) assert.ok(isToken(t), t);
  for (const t of Object.values(A.X.bulbs)) assert.ok(isToken(t), t);
});

/* ---------------- the gate's arch, bulbs and chase ---------------- */
test('arch: the band ends sink into the pillars and the arch stays under the stars', () => {
  const R = A.ARCH, end = R.half * R.rMid;
  for (const s of [-end, end]) {
    for (const v of [0, R.h / 2, R.h]) {
      const p = A.arcMap(s, v);
      assert.ok(Math.abs(Math.abs(p.x) - R.pillarX) < R.pillarR, 'end inside pillar at v=' + v);
      assert.ok(p.y < R.pillarTop, 'end below the pillar top');
    }
  }
  const apex = A.arcMap(0, R.h);
  assert.ok(close(apex.x, 0) && apex.y > R.pillarTop && apex.y < R.starY + R.starR, 'apex between pillar tops and star tops');
  assert.ok(A.arcMap(0, 0).y - 0.07 > 1.2, 'the arch clears pets (≥ 1.2 u under it)');
  assert.ok(R.starY + R.starR <= 1.95, 'gate height ≈ LOOK h 1.9');
  assert.ok(R.textHalf < R.half, 'the text stays on the visible band');
});

test('bulbs: 14 marquee bulbs on the outer rim between the pillars, two alternating groups', () => {
  const b = A.bulbLayout();
  const R = A.ARCH;
  assert.equal(b.length, 14);
  assert.deepEqual(b.map((x) => x.group), b.map((x, i) => i % 2));
  for (const x of b) {
    assert.ok(close(Math.hypot(x.x, x.y - R.cy), R.rOut, 1e-9), 'on the outer rim');
    assert.ok(Math.abs(x.x) + R.bulbR < R.pillarX - R.pillarR, 'clear of the pillars');
  }
  for (let i = 1; i < b.length; i++) assert.ok(b[i].x > b[i - 1].x, 'left to right');
  const gap = Math.hypot(b[1].x - b[0].x, b[1].y - b[0].y);
  assert.ok(gap > 2 * R.bulbR, 'bulbs do not overlap (gap ' + gap.toFixed(3) + ')');
});

test('chase: day bulbs are lemon, reduced motion is a steady glow, Showtime chases ≤ 2 Hz', () => {
  const s = {};
  assert.deepEqual(A.chaseState(3, 118, 0, false, s), { a: 'day', b: 'day' });
  assert.deepEqual(A.chaseState(3, 118, 1, true, {}), { a: 'pink', b: 'cyan' });
  for (const bpm of [100, 118, 128, 240, 1000]) {
    let last = null, flips = 0, colours = new Set();
    const T = 8, dt = 1 / 240;
    for (let t = 0; t < T; t += dt) {
      A.chaseState(t, bpm, 1, false, s);
      assert.ok(Object.keys(A.X.bulbs).includes(s.a) && Object.keys(A.X.bulbs).includes(s.b));
      assert.ok((s.a === 'dim') !== (s.b === 'dim'), 'exactly one group lit');
      if (s.a !== 'dim') colours.add(s.a);
      const on = s.a !== 'dim';
      if (last !== null && on !== last) flips++;
      last = on;
    }
    /* a full on/off cycle is 2 flips: a full-contrast LED chase, never faster than LED_CHASE_HZ (< MAX_FLASH_HZ) */
    assert.ok(flips / 2 / T <= L.LED_CHASE_HZ + 0.01 && L.LED_CHASE_HZ < Motion.MAX_FLASH_HZ, bpm + ' bpm: ' + (flips / 2 / T).toFixed(2) + ' Hz');
    assert.deepEqual([...colours].sort(), ['cyan', 'pink', 'violet']);
  }
});

/* ---------------- the pitch ---------------- */
test('crowd: 40 fans by default, an even thinning to the LOW cap, all on the stand', () => {
  const full = A.crowdLayout(40), low = A.crowdLayout(Tier.BUDGETS.LOW.crowd);
  assert.equal(full.length, 40);
  assert.equal(low.length, Math.min(40, Tier.BUDGETS.LOW.crowd));
  assert.equal(A.crowdLayout(0).length, 40);
  for (const list of [full, low]) {
    const perRow = [0, 0, 0];
    for (const f of list) {
      perRow[f.row]++;
      assert.ok(Math.abs(f.x) + 0.06 <= A.PITCH.standX, 'on the stand');
      const t = A.PITCH.tiers[f.row];
      assert.ok(f.z > t.z0 && f.z < t.z1, 'on its tier');
      assert.ok(close(f.y, t.y + A.PITCH.tierH));
      assert.ok(f.fan >= 0 && f.fan < 4 && f.wand >= 0 && f.wand < 4 && Math.abs(f.lean) <= 1);
    }
    assert.ok(Math.max(...perRow) - Math.min(...perRow) <= 2, 'rows stay balanced ' + perRow);
  }
});

test('crowd pose: still under reduced motion, a gentle breath by day, a beat bounce at Showtime', () => {
  assert.deepEqual(A.crowdPose(5, 118, 1, true, 0.2, {}), { cy: 0, wx: 0, wy: 0 });
  let maxDay = 0, maxShow = 0, maxSway = 0;
  for (let t = 0; t < 10; t += 0.01) {
    maxDay = Math.max(maxDay, Math.abs(A.crowdPose(t, 118, 0, false, 0.4).cy));
    const p = A.crowdPose(t, 118, 1, false, 0.4);
    maxShow = Math.max(maxShow, p.cy); maxSway = Math.max(maxSway, Math.abs(p.wx));
  }
  assert.ok(maxDay > 0 && maxDay <= 0.005);
  assert.ok(maxShow > 0.01 && maxShow <= 0.015 && maxSway <= 0.025);
});

/* ---------------- garage, kart and balls ---------------- */
test('garage: a 16-quad checker like the 2D banner, the parked kart inside the footprint', () => {
  const q = A.checkerLayout(8, 2);
  assert.equal(q.length, 16);
  assert.equal(q.filter((x) => x.dark).length, 8);
  assert.ok(q.find((x) => x.c === 0 && x.r === 0).dark && !q.find((x) => x.c === 0 && x.r === 1).dark);
  for (const p of [A.KART.seat, A.KART.exhaust, A.KART.nose, [0.29, 0, 0.45], [-0.29, 0, -0.45]]) {
    const w = A.parkedPoint(p);
    assert.ok(Math.abs(w[0]) < 0.93 && Math.abs(w[2]) < 0.93, 'parked kart point ' + w);
  }
  assert.equal(A.BOLT.length, 4);
});

test('balls: icosahedron directions, patch test, rainbow bands and the +y alignment', () => {
  assert.equal(A.ICO_DIRS.length, 12);
  for (const d of A.ICO_DIRS) {
    assert.ok(close(Math.hypot(...d), 1, 1e-12));
    const near = A.ICO_DIRS.filter((e) => e !== d && d[0] * e[0] + d[1] * e[1] + d[2] * e[2] > 0.44).length;
    assert.equal(near, 5, 'each vertex has 5 neighbours');
    assert.ok(A.nearIco(d[0] * 0.11, d[1] * 0.11, d[2] * 0.11));
  }
  /* a face centre of the icosahedron is far from every vertex */
  const f = [0, 1, 2].map((k) => A.ICO_DIRS[0][k] + A.ICO_DIRS[1][k] + A.ICO_DIRS[5][k]);
  assert.ok(!A.nearIco(f[0], f[1], f[2]));
  assert.equal(A.rainbowBand(1, 6), 0);
  assert.equal(A.rainbowBand(-1, 6), 5);
  for (let y = 1; y > -1; y -= 0.05) assert.ok(A.rainbowBand(y - 0.05, 6) >= A.rainbowBand(y, 6));
  /* alignY gives Euler XYZ degrees (three.js order: v' = Rx·Ry·Rz·v) mapping +y onto d */
  const rot = (deg, v) => {
    const [ax, , az] = deg.map((x) => x * Math.PI / 180);
    const z = [-Math.sin(az) * v[1] + Math.cos(az) * v[0], Math.cos(az) * v[1] + Math.sin(az) * v[0], v[2]];
    return [z[0], z[1] * Math.cos(ax) - z[2] * Math.sin(ax), z[1] * Math.sin(ax) + z[2] * Math.cos(ax)];
  };
  const dirs = A.ICO_DIRS.concat([[0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0.3, -0.2, 0.9]]);
  for (const d of dirs) {
    const l = Math.hypot(...d), u = rot(A.alignY(...d), [0, 1, 0]);
    for (let k = 0; k < 3; k++) assert.ok(close(u[k], d[k] / l, 1e-9), 'alignY ' + d);
  }
});

test('tracks: the oval tangent yaw turns +x along the road', () => {
  for (let phi = 0; phi < Math.PI * 2; phi += 0.3) {
    const p = A.ovalPoint(phi), q = A.ovalPoint(phi + 1e-4), y = p.yaw * Math.PI / 180;
    const dir = [Math.cos(y), -Math.sin(y)], t = [q.x - p.x, q.z - p.z], l = Math.hypot(...t);
    assert.ok(close(dir[0] * t[0] / l + dir[1] * t[1] / l, 1, 1e-6));
  }
});

/* ---------------- builders against a mock kit ---------------- */
const ATLAS_RECT = { u0: 0.5, v0: 0.25, u1: 1, v1: 0.5 };
function mockKit(tier, tokensSeen, o) {
  o = o || {};
  const D = Math.PI / 180;
  function geo(P, N, Cc) {
    const attrs = {
      position: { array: P, itemSize: 3 }, normal: { array: N, itemSize: 3 }, color: { array: Cc || new Float32Array(P.length).fill(1), itemSize: 3 }
    };
    return { isBufferGeometry: true, attrs, getAttribute: (k) => attrs[k], setAttribute: (k, a) => { attrs[k] = a; }, dispose() {} };
  }
  function fromPoints(pts) {
    const n = Math.ceil(pts.length / 3) * 3, P = new Float32Array(n * 3), N = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const p = pts[i % pts.length], l = Math.hypot(...p) || 1;
      P.set(p, i * 3); N.set([p[0] / l, p[1] / l, p[2] / l], i * 3);
    }
    return geo(P, N);
  }
  const ring8 = (r, y) => Array.from({ length: 8 }, (_, k) => [r * Math.cos(k * Math.PI / 4), y, r * Math.sin(k * Math.PI / 4)]);
  const sphere = (rx, ry, rz) => {
    const out = [];
    for (const a of [-1, 0, 1]) for (const b of [-1, 0, 1]) for (const c of [-1, 0, 1]) {
      if (!a && !b && !c) continue;
      const l = Math.hypot(a, b, c);
      out.push([rx * a / l, ry * b / l, rz * c / l]);
    }
    return out;
  };
  function record(t) {
    const tokn = Array.isArray(t) ? t[0] : t;
    if (tokn == null) return;
    tokensSeen.add(tokn);
  }
  const G = {
    tier,
    puff: (r) => fromPoints(sphere(r, r, r)),
    bean: (r, len) => fromPoints(sphere(r, r, r).map((p) => [p[0], p[1] + Math.sign(p[1]) * len / 2, p[2]])),
    slab: (w, h, d) => fromPoints([-1, 1].flatMap((a) => [-1, 1].flatMap((b) => [-1, 1].map((c) => [a * w / 2, b * h / 2, c * d / 2])))),
    tube: (rt, rb, h) => fromPoints(ring8(rt, h / 2).concat(ring8(rb, -h / 2))),
    cone: (r, h) => fromPoints(ring8(r, -h / 2).concat([[0, h / 2, 0]])),
    drop: (r, h) => fromPoints(ring8(r, h * 0.3).concat([[0, 0, 0], [0, h, 0]])),
    ring: (R, r) => fromPoints(Array.from({ length: 8 }, (_, k) => [Math.cos(k * Math.PI / 4), Math.sin(k * Math.PI / 4)])
      .flatMap(([c, s]) => [[(R + r) * c, (R + r) * s, 0], [(R - r) * c, (R - r) * s, 0], [R * c, R * s, r], [R * c, R * s, -r]])),
    star: (ro) => fromPoints(Array.from({ length: 10 }, (_, k) => {
      const a = Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? ro / 2 : ro;
      return [rr * Math.cos(a), rr * Math.sin(a), (k % 2 ? 1 : -1) * ro * 0.2];
    })),
    flag: (w, h, sx) => fromPoints(Array.from({ length: (sx || 8) + 1 }, (_, k) => k * w / (sx || 8)).flatMap((x) => [[x, -h / 2, 0], [x, h / 2, 0]])),
    ribbon: (pts, r) => fromPoints(pts.flatMap((p) => [[p[0] + r, p[1], p[2]], [p[0] - r, p[1], p[2]], [p[0], p[1] + r, p[2]], [p[0], p[1] - r, p[2]]])),
    t(g, o) {
      const s = o.s == null ? [1, 1, 1] : typeof o.s === 'number' ? [o.s, o.s, o.s] : o.s, r = (o.r || [0, 0, 0]).map((x) => (x || 0) * D), p = o.p || [0, 0, 0];
      const [cx, sx] = [Math.cos(r[0]), Math.sin(r[0])], [cy, sy] = [Math.cos(r[1]), Math.sin(r[1])], [cz, sz] = [Math.cos(r[2]), Math.sin(r[2])];
      const rot = (v) => {                                        /* Rx · Ry · Rz · v */
        let x = v[0] * cz - v[1] * sz, y = v[0] * sz + v[1] * cz, z = v[2];
        [x, z] = [x * cy + z * sy, -x * sy + z * cy];
        [y, z] = [y * cx - z * sx, y * sx + z * cx];
        return [x, y, z];
      };
      const P = g.attrs.position.array, N = g.attrs.normal.array;
      for (let i = 0; i < P.length; i += 3) {
        const v = rot([P[i] * s[0], P[i + 1] * s[1], P[i + 2] * s[2]]);
        P[i] = v[0] + (p[0] || 0); P[i + 1] = v[1] + (p[1] || 0); P[i + 2] = v[2] + (p[2] || 0);
        const n = rot([N[i], N[i + 1], N[i + 2]]); N[i] = n[0]; N[i + 1] = n[1]; N[i + 2] = n[2];
      }
      return g;
    },
    paint(g, t) { record(t); g.painted = true; return g; },
    paintBy(g, fn) {
      const P = g.attrs.position.array, N = g.attrs.normal.array;
      for (let i = 0; i < P.length; i += 3) record(fn({ x: P[i], y: P[i + 1], z: P[i + 2], nx: N[i], ny: N[i + 1], nz: N[i + 2], i: i / 3, face: (i / 9) | 0 }));
      g.painted = true;
      return g;
    },
    facet: (g) => g,
    clone: (g) => Object.assign(geo(g.attrs.position.array.slice(), g.attrs.normal.array.slice(), g.attrs.color.array.slice()), { painted: g.painted }),
    merge(list) {
      const all = [].concat(...[list]).flat(Infinity).filter(Boolean);
      const cat = (k) => { const out = new Float32Array(all.reduce((n, g) => n + g.attrs[k].array.length, 0)); let o = 0; for (const g of all) { out.set(g.attrs[k].array, o); o += g.attrs[k].array.length; } return out; };
      return Object.assign(geo(cat('position'), cat('normal'), cat('color')), { painted: all.every((g) => g.painted) });
    }
  };
  const THREE = {
    BufferGeometry: function () { const g = geo(new Float32Array(0), new Float32Array(0)); g.painted = true; return g; },
    BufferAttribute: function (array, itemSize) { this.array = array; this.itemSize = itemSize; },
    MeshBasicMaterial: function (o) { Object.assign(this, o); this.isMeshBasicMaterial = true; },
    Vector4: function (x, y, z, w) { Object.assign(this, { x, y, z, w }); },
    CanvasTexture: function (c) { this.image = c; this.isTexture = true; this.version = 0; Object.defineProperty(this, 'needsUpdate', { set(v) { if (v) this.version++; } }); },
    SRGBColorSpace: 'srgb', LinearFilter: 1006
  };
  const parts = new Map(), variants = new Map();
  const color = (hex) => ({ hex, copy(c) { this.hex = c.hex; return this; } });
  const atlas = { texture: { atlas: true }, words: [], rect(w) { atlas.words.push(w); return w === 'PET COURSE' ? ATLAS_RECT : null; } };
  const K = {
    THREE, tier, G,
    col: (t) => color(L.hex(t)), rgb: (h) => color(String(h).toUpperCase()), hex: (t) => L.hex(t),
    /* the kit's K.variant: a sibling of a shared material (here only its key, name and patch matter) */
    variant: o.noVariant ? undefined : (key, name, patch) => {
      const k = key + '#' + name;
      if (!variants.has(k)) variants.set(k, Object.assign({ isMeshBasicMaterial: true, variantOf: key, name: k, color: color('#FFFFFF'), toneMapped: false, transparent: true }, patch));
      return variants.get(k);
    },
    signAtlas: o.noAtlas ? undefined : () => atlas,
    tex: { banner: (text, opts) => ({ text, o: opts }), fontReady: () => Promise.resolve(true) },
    parts: { get: (key, t, fn) => { const k = key + '#' + t; if (!parts.has(k)) parts.set(k, fn(K)); return parts.get(k); } },
    isTemplate: (x) => !!(x && x.__template),
    template(ctx) {
      const b = { ctx, parts: [], pivots: {}, anchors: {} };
      b.part = (name, geos, mat, o) => { b.parts.push({ name, geos: [].concat(geos), mat: mat || 'toon', o: o || {} }); return b; };
      b.pivot = (name, origin, parent) => { b.pivots[name] = { origin, parent: parent || null }; return b; };
      b.anchor = (name, p) => { b.anchors[name] = p; return b; };
      b.done = () => ({ __template: true, id: ctx.id, look: ctx.look, parts: b.parts.filter((p) => p.geos.length).map((p) => ({ ...p, geo: G.merge(p.geos) })), pivots: b.pivots, anchors: b.anchors });
      return b;
    }
  };
  return K;
}
function boundsOf(tpl) {
  const b = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  for (const p of tpl.parts) {
    const P = p.geo.attrs.position.array;
    for (let i = 0; i < P.length; i += 3) for (let k = 0; k < 3; k++) { b.min[k] = Math.min(b.min[k], P[i + k]); b.max[k] = Math.max(b.max[k], P[i + k]); }
  }
  return b;
}
const MATS = /^(toon|state|gold|chrome|(neon|glow):.+)$/;
const STYLES = {
  att_course: A.IDS.courses.map((course) => ({ course })),
  att_pitch: A.IDS.balls.flatMap((ball) => A.IDS.stadiums.map((stadium) => ({ ball, stadium }))),
  att_kart: A.IDS.karts.map((kart) => ({ kart }))
};
const FP = { att_course: [2, 2], att_pitch: [3, 2], att_kart: [2, 2] };

test('builders: every id builds on every tier and style with documented parts, pivots and anchors', () => {
  for (const tier of Tier.TIERS) {
    const seen = new Set(), K = mockKit(tier, seen);
    const M = A.models(K, { ready: true, tier, models: {}, kit: () => K });
    assert.deepEqual(Object.keys(M).sort(), [...A.ALL_IDS].sort());
    for (const id of A.ALL_IDS) {
      const look = L.LOOK[id];
      for (const st0 of STYLES[id] || [{}]) {
        const st = L.resolveStyle(id, st0), stateKey = L.stateKey(id, st0);
        const tpl = M[id].build({ id, look, st, stateKey, tier, K, G: K.G, fp: FP[id] || null });
        const tag = id + ' ' + stateKey + ' ' + tier;
        assert.ok(tpl && tpl.__template, tag + ' template');
        assert.ok(tpl.parts.length >= 1 && tpl.parts.length <= 6, tag + ' parts ' + tpl.parts.length);
        assert.ok(new Set(tpl.parts.filter((p) => !p.o.pivot).map((p) => p.mat)).size <= 4, tag + ' static materials');
        for (const p of tpl.parts) {
          assert.match(p.mat, MATS, tag + ' material ' + p.mat);
          if (/^(neon|glow):/.test(p.mat)) assert.ok(isToken(p.mat.slice(5)), tag + ' neon token ' + p.mat);
          if (p.o.pivot) assert.ok(tpl.pivots[p.o.pivot], tag + ' part ' + p.name + ' pivot');
          if (p.o.stateColor) for (const t of [p.o.stateColor.off, p.o.stateColor.on, ...Object.values(p.o.stateColor.map || {})]) assert.ok(isToken(t), tag + ' state token ' + t);
          if (p.mat === 'toon') assert.ok(p.geo.painted, tag + ' part ' + p.name + ' is painted');
        }
        for (const pv of look.pivots) assert.ok(tpl.pivots[pv], tag + ' LOOK pivot ' + pv);
        for (const an of look.anchors) if (an !== 'top') assert.ok(tpl.anchors[an], tag + ' LOOK anchor ' + an);
        /* placed attractions keep the 0.07 u margin inside their footprint and sit on y = 0 */
        const b = boundsOf(tpl), fp = FP[id] || (/^course_/.test(id) ? [2, 2] : /^kart_/.test(id) ? [1.2, 1.04] : [1, 1]);
        assert.ok(b.min[1] > -0.004, tag + ' base at y 0 (' + b.min[1].toFixed(3) + ')');
        assert.ok(b.max[0] <= fp[0] / 2 - 0.07 + 1e-3 && b.min[0] >= -fp[0] / 2 + 0.07 - 1e-3, tag + ' x in footprint ' + b.min[0].toFixed(3) + '..' + b.max[0].toFixed(3));
        assert.ok(b.max[2] <= fp[1] / 2 - 0.07 + 1e-3 && b.min[2] >= -fp[1] / 2 + 0.07 - 1e-3, tag + ' z in footprint ' + b.min[2].toFixed(3) + '..' + b.max[2].toFixed(3));
        assert.ok(b.max[1] <= look.h + 0.45, tag + ' height ' + b.max[1].toFixed(2) + ' vs h ' + look.h);
      }
    }
    for (const t of seen) assert.ok(isToken(t), tier + ': painted token "' + t + '" resolves');
    /* the bare ball for games (stateKey 'bare'): a ball only, resting on y = 0 */
    for (const id of A.IDS.balls) {
      const tpl = M[id].build({ id, look: L.LOOK[id], st: {}, stateKey: 'bare', tier, K, G: K.G, fp: null });
      assert.ok(tpl.parts.every((p) => /^ball/.test(p.name)), id + ' bare has only ball parts');
      assert.ok(tpl.pivots.ball && close(tpl.pivots.ball.origin[1], 0.11), id + ' bare ball pivot at the centre');
    }
  }
});

test('builders: the documented part names of the island attractions and the karts', () => {
  const seen = new Set(), K = mockKit('MID', seen), M = A.models(K, null);
  const names = (id, st) => M[id].build({ id, look: L.LOOK[id], st: L.resolveStyle(id, st), stateKey: L.stateKey(id, st), tier: 'MID', K, G: K.G }).parts.map((p) => p.name);
  assert.deepEqual(names('att_course', {}), ['body', 'text', 'bulbA', 'bulbB', 'starL', 'starR']);
  assert.deepEqual(names('att_pitch', { stadium: 'stadium_night' }), ['body', 'detail', 'crowd', 'wands', 'ball', 'lamps']);
  assert.deepEqual(names('att_kart', { kart: 'kart_unicorn' }), ['body', 'sign', 'signGlow', 'kart', 'kartGlow', 'kartGold']);
  assert.deepEqual(names('kart_red', {}), ['body', 'wheelF', 'wheelB', 'trim', 'glow']);
  assert.deepEqual(names('kart_gold', {}), ['body', 'wheelF', 'wheelB', 'trim', 'glow', 'gold']);
  const kart = M.kart_blue.build({ id: 'kart_blue', look: L.LOOK.kart_blue, st: {}, stateKey: 'base', tier: 'MID', K, G: K.G });
  assert.equal(kart.pivots.wheelF.parent, 'steer');
  assert.ok(kart.anchors.seat && kart.pivots.seat);
  assert.equal(kart.parts.find((p) => p.name === 'glow').mat, 'neon:Neon Cyan');
  /* the sign hook (fix3): the kit's shared sign program — a K.variant of 'sign', no shader patch, no program
     key of its own — for the text part only, one material for every course */
  const m = M.att_course.material('toon', { name: 'text' });
  assert.ok(m && m.isMeshBasicMaterial && m.variantOf === 'sign', 'a sibling of the kit\'s sign material (its program)');
  assert.ok(!('onBeforeCompile' in m) && !('customProgramCacheKey' in m), 'no shader patch, no program key of its own');
  assert.equal(m.toneMapped, false);
  assert.equal(m.alphaTest, 0.02); assert.equal(m.depthWrite, false);
  assert.equal(M.course_candy.material('toon', { name: 'text' }), m);
  assert.equal(M.att_course.material('toon', { name: 'body' }), null);
});

/* a canvas whose 2D context records the text and rectangles drawn (with their fill) */
function signCanvas() {
  const c = { width: 0, height: 0, ops: [] }, st = { fillStyle: '', font: '' };
  const ctx = {
    get fillStyle() { return st.fillStyle; }, set fillStyle(v) { st.fillStyle = v; },
    get font() { return st.font; }, set font(v) { st.font = v; },
    textAlign: '', textBaseline: '', save() {}, restore() {}, clearRect() { c.ops.push({ op: 'clear' }); },
    measureText: (s) => ({ width: String(s).length * 22 }),
    fillText(s, x, y) { c.ops.push({ op: 'text', s, x, y, fill: st.fillStyle, font: st.font }); },
    fillRect(x, y, w, h) { c.ops.push({ op: 'rect', x, y, w, h, fill: st.fillStyle }); }
  };
  c.getContext = () => ctx;
  return c;
}
function withDocument(fn) {
  const prev = globalThis.document, made = [];
  globalThis.document = { createElement: () => { const c = signCanvas(); made.push(c); return c; } };
  try { return fn(made); } finally { if (prev === undefined) delete globalThis.document; else globalThis.document = prev; }
}
test('course sign (fix3): its own atlas-cell canvas — the LOOK text colour over the member-colour underline, uv baked from the arch', () => {
  withDocument((made) => {
    const K = mockKit('MID', new Set()), M = A.models(K, null), m = M.att_course.material('toon', { name: 'text' });
    const c = made[made.length - 1], tex = m.map;
    assert.ok(tex && tex.isTexture && tex.image === c, 'the sign\'s own canvas texture');
    assert.deepEqual([c.width, c.height], [A.SIGN_TEX.w, A.SIGN_TEX.h], 'a sign-atlas cell (256 × 64)');
    assert.deepEqual([c.width, c.height], [256, 64]);
    assert.equal(tex.colorSpace, 'srgb'); assert.equal(tex.generateMipmaps, false);
    /* drawn as K.signAtlas draws a word: centred, Unbounded 800 fitted to the cell less 16 px, in the text colour */
    const txt = c.ops.filter((o) => o.op === 'text').pop();
    assert.equal(txt.s, 'PET COURSE');
    assert.equal(txt.fill, L.hex(L.LOOK.att_course.colors.text), 'the LOOK text colour');
    assert.ok(/^800 \d+px "Unbounded", "Outfit"/.test(txt.font) && 'PET COURSE'.length * 22 <= 256 - 16 + 22, txt.font);
    assert.deepEqual([txt.x, txt.y], [128, 34]);
    /* the underline in the member colour: the look fallback until the controller (or a handle) tells it */
    const under = () => c.ops.filter((o) => o.op === 'rect').pop();
    const R = A.underlineRect(256, 64), U = A.ARCH.under;
    assert.deepEqual([under().x, under().y, under().w, under().h], [R.x, R.y, R.w, R.h]);
    assert.equal(under().fill, L.hex(A.X.member));
    assert.equal(L.hex(A.X.member), L.hex(L.MEMBER_FALLBACK));
    /* the band the old shader tested (v0 < v < v1, |u − ½| < half), in canvas pixels (v up from the bottom) */
    assert.ok(Math.abs(R.y - (1 - U.v1) * 64) < 1e-9 && Math.abs(R.y + R.h - (1 - U.v0) * 64) < 1e-9 && Math.abs(R.x - (0.5 - U.half) * 256) < 1e-9 && Math.abs(R.w - 2 * U.half * 256) < 1e-9);
    assert.ok(U.v0 > 0.1 && U.v1 > U.v0 && U.v1 <= 0.28 && U.half > 0 && U.half < 0.5, 'the underline sits low on the band, under the text baseline');
    const strip = A.ARCH.strip * 1.25 / A.ARCH.h;
    assert.ok(U.v0 > strip && 1 - strip > 0.65, 'clear of the LED strips at the band edges');
    const v0 = tex.version;
    assert.equal(M.att_course.setUser({ color: '#4fc3f7' }), true);
    assert.equal(under().fill, '#4FC3F7'); assert.ok(tex.version > v0, 're-uploaded');
    const v1 = tex.version;
    assert.equal(M.course_snow.setMember('nope'), false, 'not a colour: ignored');
    assert.equal(M.course_snow.setMember('#4FC3F7'), true);
    assert.equal(tex.version, v1, 'the same colour: no redraw');
    M.att_course.show({ uid: 'g', t: 0, show: 0, member: '#ff7043', pivot: () => null, state: () => {} }, 0);
    assert.equal(under().fill, '#FF7043', 'a handle carrying the member colour sets it');
    /* the text part's uv: the mapping the old shader computed per vertex from item-space position */
    const tpl = M.att_course.build({ id: 'att_course', look: L.LOOK.att_course, st: L.resolveStyle('att_course', {}), stateKey: 'course_meadow', tier: 'MID', K, G: K.G });
    const text = tpl.parts.find((p) => p.name === 'text'), P = text.geo.attrs.position.array, UV = text.geo.attrs.uv;
    assert.ok(UV && UV.itemSize === 2 && UV.array.length === P.length / 3 * 2, 'a uv per vertex');
    for (let i = 0, j = 0; i < P.length; i += 3, j += 2) {
      const qx = P[i], qy = P[i + 1] - A.ARCH.cy, cl = (x) => Math.min(1, Math.max(0, x));
      const u = cl(Math.atan2(qx, qy) / (2 * A.ARCH.textHalf) + 0.5), v = cl((Math.hypot(qx, qy) - A.ARCH.rIn) / A.ARCH.h);
      assert.ok(Math.abs(UV.array[j] - u) < 1e-6 && Math.abs(UV.array[j + 1] - v) < 1e-6, 'vertex ' + i / 3);
    }
    assert.ok(tpl.parts.filter((p) => p.name !== 'text').every((p) => !p.geo.attrs.uv), 'only the text part carries uv');
  });
  /* without a DOM canvas: the kit's banner texture in the text colour (no underline to draw) */
  const K2 = mockKit('MID', new Set()), m2 = A.models(K2, null).att_course.material('toon', { name: 'text' });
  assert.ok(m2.map.text === 'PET COURSE' && m2.map.o.font === 'Unbounded' && m2.map.o.weight === 800 && m2.map.o.fill === L.LOOK.att_course.colors.text);
  assert.equal(m2.variantOf, 'sign');
});

test('course gate: four-point ✦ sparks, an LED-strip arch and an LED-dot marquee', () => {
  const K = mockKit('MID', new Set()), M = A.models(K, null);
  const tpl = M.att_course.build({ id: 'att_course', look: L.LOOK.att_course, st: L.resolveStyle('att_course', {}), stateKey: 'course_meadow', tier: 'MID', K, G: K.G });
  const R = A.ARCH;
  ['starL', 'starR'].forEach((name, i) => {
    const P = tpl.parts.find((p) => p.name === name).geo.attrs.position.array, cx = (i ? 1 : -1) * R.pillarX;
    let mx = 0, my = 0;
    for (let k = 0; k < P.length; k += 3) {
      const x = Math.abs(P[k] - cx), y = Math.abs(P[k + 1] - R.starY);
      mx = Math.max(mx, x); my = Math.max(my, y);
      /* every far point lies on an axis: four points, never the five-point ⭐ */
      if (Math.hypot(x, y) > R.starR * 0.5) assert.ok(Math.min(x, y) < R.starR * 0.36, name + ' point off-axis at ' + x.toFixed(3) + ', ' + y.toFixed(3));
    }
    assert.ok(Math.abs(mx - R.starR) < 1e-6 && Math.abs(my - R.starR) < 1e-6, name + ' reaches rOut on both axes');
  });
  /* the LED groups: each carries an arch-long strip plus its marquee dots */
  for (const name of ['bulbA', 'bulbB']) {
    const p = tpl.parts.find((q) => q.name === name), P = p.geo.attrs.position.array;
    let lo = Infinity, hi = -Infinity;
    for (let k = 0; k < P.length; k += 3) { lo = Math.min(lo, P[k]); hi = Math.max(hi, P[k]); }
    assert.ok(hi - lo > 2 * R.pillarX * 0.85, name + ' spans the arch');
    assert.equal(p.mat, 'state');
    assert.deepEqual(Object.keys(p.o.stateColor.map).sort(), ['cyan', 'day', 'dim', 'pink', 'violet']);
  }
  assert.equal(L.hex(A.X.bulbs.pink), L.hex('Neon Magenta'));
  assert.equal(L.hex(A.X.bulbs.cyan), L.hex('LED Cyan'));
  assert.equal(L.hex(A.X.bulbs.violet), L.hex('Electric Violet'));
  /* the spark sticks of the crowd are v2 neon */
  A.X.neon4.forEach((t, i) => assert.equal(L.hex(t), L.hex(L.NEON4[i])));
});

/* ---------------- animation handlers (fake handle, real SLMotion) ---------------- */
function handle(uid, extra) {
  const log = { pivots: {}, states: {}, sfx: [], emit: [] };
  return Object.assign({
    uid, t: 0, phase: 0.25, reduced: false, bpm: 118, show: 0, log,
    pivot: (n) => ({ set: (r, p, s) => { log.pivots[n] = { r: r.slice(), p: p.slice(), s }; } }),
    state: (k, v) => { log.states[k] = v; },
    sfx: (n) => log.sfx.push(n), emit: (k) => log.emit.push(k)
  }, extra);
}
test('handlers: gate stars spin at 0.25 rev/s (static when reduced) and its launch act fires its cues', () => {
  const K = mockKit('MID', new Set()), M = A.models(K, null);
  const a = handle('gate');
  M.att_course.idle(a); const d0 = a.log.pivots.spin.r[1];
  a.t = 1; M.att_course.idle(a);
  assert.ok(close((a.log.pivots.spin.r[1] - d0 + 360) % 360, 90, 1e-6));
  assert.equal(a.log.states.bulbA, 'day');
  const r = handle('gate2', { reduced: true });
  M.att_course.idle(r); const s0 = r.log.pivots.spin.r[1]; r.t = 5; M.att_course.idle(r);
  assert.equal(r.log.pivots.spin.r[1], s0);
  const act = M.att_course.act(handle('gate3'), 'launch');
  const h = handle('gate3');
  let alive = true;
  for (let t = 0; alive && t < 2; t += 1 / 60) alive = act.update(h, t);
  assert.equal(alive, false);
  assert.ok(h.log.sfx.includes('whoosh') && h.log.emit.includes('sparkleRing'));
  const ra = handle('gate4', { reduced: true }), ract = M.att_course.act(ra, 'launch');
  assert.equal(ract.dur, 0);
  assert.equal(ract.update(ra, 0), false);
  assert.ok(ra.log.sfx.includes('whoosh'));
});

test('handlers: the pitch ball hops back to the spot, wands light at Showtime; the garage kart revs', () => {
  const K = mockKit('MID', new Set()), M = A.models(K, null);
  const a = handle('pitch');
  M.att_pitch.idle(a);
  assert.equal(a.log.states.wands, 0);
  M.att_pitch.show(a, 1);
  assert.equal(a.log.states.wands, 1);
  const act = M.att_pitch.act(a, 'launch');
  let top = 0;
  for (let t = 0; t <= act.dur; t += 1 / 60) { act.update(a, t); top = Math.max(top, a.log.pivots.ball.p[1]); }
  act.update(a, act.dur);
  assert.ok(top > 0.05);
  assert.equal(a.log.pivots.ball.p[1], 0);
  const g = handle('garage'), rev = M.att_kart.act(g, 'kartRev');
  let wob = 0;
  for (let t = 0; t <= rev.dur; t += 1 / 60) { rev.update(g, t); wob = Math.max(wob, Math.abs(g.log.pivots.kart.r[2])); }
  rev.update(g, rev.dur);
  assert.ok(wob > 1);
  assert.equal(g.log.pivots.kart.r[2], 0);
  assert.ok(g.log.sfx.includes('boost') && g.log.emit.filter((e) => e === 'exhaust').length === 2);
  const r = handle('garage2', { reduced: true }), rr = M.att_kart.act(r, 'kartRev');
  assert.equal(rr.update(r, 0), false);
  assert.equal(r.log.pivots.kart.r[2], 0);
});
