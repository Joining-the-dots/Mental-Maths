'use strict';
/* My Island 3D — city buildings II (world/island3d/models-stage.js): the Dance
   Studio, the Rooftop Hangout and the Concert Stage.
   THREE is not available in Node, so the builders run against a mock of the K.G
   kit: every primitive returns surface sample points (with normals) and the
   triangle count three r170 gives after the kit's non-indexed conversion (a
   radius-0 slab is a plain 12-triangle box, as in kit.js). That is enough to
   check pivots, anchors, materials, colour tokens, budgets, trims and the cell
   margin. Acts, idles and shows run against a mock animation handle whose
   per-copy parts own real typed arrays, so colours, uv and head poses can be
   read back. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ST = require('../world/island3d/models-stage.js');
const M = require('../world/island3d/motion.js');
const L = require('../world/world-look.js');
const C = require('../world/world-core.js');
const KIT = require('../world/island3d/kit.js');

const SRC = fs.readFileSync(path.join(__dirname, '../world/island3d/models-stage.js'), 'utf8');
const IDS = ['bld_dance', 'bld_rooftop', 'bld_stage'];
const TIERS = ['LOW', 'MID', 'HIGH'];
const D2R = Math.PI / 180;
const ACT = { bld_dance: 'dance', bld_rooftop: 'hangout', bld_stage: 'encore' };
const PERFORM = { bld_dance: 'studio', bld_rooftop: 'roof', bld_stage: 'stage' };
const PARTS = { bld_dance: 5, bld_rooftop: 4, bld_stage: 5 };
const BPM = 118;

/* ---------------- mock K.G ---------------- */
const ANG = Array.from({ length: 8 }, (_, i) => i * Math.PI / 4);
const DROP_PROFILE = [[0, 0], [0.55, 0.02], [0.9, 0.12], [1, 0.3], [0.93, 0.5], [0.72, 0.7], [0.4, 0.88], [0, 1]];
function unit(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
function mockG(tier) {
  const low = tier === 'LOW';
  const mk = (pts, tris) => ({ pts, tris, tokens: [] });
  const G = { tier };
  G.puff = (r, o) => {
    const pts = [];
    for (const x of [-1, 0, 1]) for (const y of [-1, 0, 1]) for (const z of [-1, 0, 1]) {
      if (!x && !y && !z) continue;
      const d = unit([x, y, z]);
      pts.push({ p: d.map((c) => c * r), n: d });
    }
    return mk(pts, o && o.sphere ? 2 * (low ? 10 : 12) * ((low ? 6 : 8) - 1) : 80);
  };
  G.bean = (r, len) => {
    const pts = [{ p: [0, len / 2 + r, 0], n: [0, 1, 0] }, { p: [0, -len / 2 - r, 0], n: [0, -1, 0] }];
    for (const a of ANG) for (const y of [-len / 2, len / 2]) pts.push({ p: [Math.cos(a) * r, y, Math.sin(a) * r], n: [Math.cos(a), 0, Math.sin(a)] });
    return mk(pts, (4 * (low ? 2 : 3) + 1) * (low ? 8 : 10) * 2);
  };
  /* RoundedBox (2·segments + 1)³ unless the radius is 0: then a plain box, as kit.js */
  G.slab = (w, h, d, radius) => {
    const pts = [];
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) pts.push({ p: [x * w / 2, y * h / 2, z * d / 2], n: unit([x, y, z]) });
    for (let ax = 0; ax < 3; ax++) for (const s of [-1, 1]) { const p = [0, 0, 0], n = [0, 0, 0]; p[ax] = s * [w, h, d][ax] / 2; n[ax] = s; pts.push({ p, n }); }
    const seg = (low ? 1 : 2) * 2 + 1;
    return mk(pts, radius === 0 ? 12 : 12 * seg * seg);
  };
  G.tube = (rTop, rBot, h, o) => {
    if (h === undefined || (h !== null && typeof h === 'object')) { o = h; h = rBot; rBot = rTop; }
    o = o || {};
    const R = o.radial || (low ? 8 : 12), slope = (rBot - rTop) / h, pts = [];
    for (const a of ANG) {
      const n = unit([Math.cos(a), slope, Math.sin(a)]);
      pts.push({ p: [Math.cos(a) * rTop, h / 2, Math.sin(a) * rTop], n }, { p: [Math.cos(a) * rBot, -h / 2, Math.sin(a) * rBot], n });
    }
    if (!o.open) {
      if (rTop > 0) pts.push({ p: [0, h / 2, 0], n: [0, 1, 0] });
      if (rBot > 0) pts.push({ p: [0, -h / 2, 0], n: [0, -1, 0] });
    }
    const side = (rTop > 0 ? R : 0) + (rBot > 0 ? R : 0);
    return mk(pts, side + (o.open ? 0 : (rTop > 0 ? R : 0) + (rBot > 0 ? R : 0)));
  };
  G.cone = (r, h, radial) => {
    const R = radial || (low ? 8 : 12), pts = [{ p: [0, h / 2, 0], n: [0, 1, 0] }];
    for (const a of ANG) pts.push({ p: [Math.cos(a) * r, -h / 2, Math.sin(a) * r], n: unit([Math.cos(a), r / h, Math.sin(a)]) });
    return mk(pts, 2 * R);
  };
  G.drop = (r, h, profile) => {
    const prof = Array.isArray(profile) && profile.length >= 2 ? profile : DROP_PROFILE, pts = [];
    prof.forEach((q) => { for (const a of ANG) pts.push({ p: [Math.cos(a) * q[0] * r, q[1] * h, Math.sin(a) * q[0] * r], n: [Math.cos(a), 0, Math.sin(a)] }); });
    return mk(pts, (prof.length - 1) * (low ? 7 : 10) * 2);
  };
  G.ring = (R, r) => {
    const pts = [];
    for (const a of ANG) {
      const d = [Math.cos(a), Math.sin(a), 0], c = [d[0] * R, d[1] * R, 0];
      pts.push({ p: [c[0] + d[0] * r, c[1] + d[1] * r, 0], n: d }, { p: [c[0], c[1], r], n: [0, 0, 1] }, { p: [c[0], c[1], -r], n: [0, 0, -1] });
    }
    return mk(pts, (low ? 5 : 6) * (low ? 12 : 16) * 2);
  };
  /* TubeGeometry(curve, segments, r, 4 radial) */
  G.ribbon = (points, r, o) => {
    const seg = (o && o.segments) || Math.max(6, Math.round(points.length * (low ? 4 : 6)));
    return mk(points.map((q) => ({ p: q.slice(), n: [0, 1, 0] })), 2 * seg * 4);
  };
  /* two-sided plane, pole edge at x = 0 */
  G.flag = (w, h, sx, sy) => {
    sx = sx || 8; sy = sy || 1;
    const pts = [];
    for (const x of [0, w]) for (const y of [-h / 2, h / 2]) pts.push({ p: [x, y, 0], n: [0, 0, 1] }, { p: [x, y, 0], n: [0, 0, -1] });
    return mk(pts, 2 * 2 * sx * sy);
  };
  G.t = (geo, o) => {
    if (!o) return geo;
    const s = o.s == null ? [1, 1, 1] : typeof o.s === 'number' ? [o.s, o.s, o.s] : o.s;
    const r = (o.r || [0, 0, 0]).map((x) => (x || 0) * D2R), p = o.p || [0, 0, 0];
    const rot = (v) => {                                /* Euler XYZ: Rz first, then Ry, then Rx */
      let [x, y, z] = v, c = Math.cos(r[2]), sn = Math.sin(r[2]);
      [x, y] = [x * c - y * sn, x * sn + y * c];
      c = Math.cos(r[1]); sn = Math.sin(r[1]);
      [x, z] = [x * c + z * sn, -x * sn + z * c];
      c = Math.cos(r[0]); sn = Math.sin(r[0]);
      [y, z] = [y * c - z * sn, y * sn + z * c];
      return [x, y, z];
    };
    geo.pts = geo.pts.map(({ p: q, n }) => ({
      p: rot([q[0] * s[0], q[1] * s[1], q[2] * s[2]]).map((c, i) => c + (p[i] || 0)),
      n: unit(rot([n[0] / s[0], n[1] / s[1], n[2] / s[2]]))
    }));
    return geo;
  };
  G.paint = (geo, token, tone) => { geo.tokens.push({ token, tone: tone == null ? 'base' : tone }); return geo; };
  G.paintBy = (geo, fn) => {
    geo.pts.forEach(({ p, n }, i) => {
      const r = fn({ x: p[0], y: p[1], z: p[2], nx: n[0], ny: n[1], nz: n[2], i, face: (i / 3) | 0 });
      if (r == null) return;
      geo.tokens.push(Array.isArray(r) ? { token: r[0], tone: r[1] } : { token: r, tone: 'base' });
    });
    return geo;
  };
  G.merge = (list) => {
    const geos = [list].flat(Infinity);
    return { pts: geos.flatMap((g) => g.pts), tris: geos.reduce((a, g) => a + g.tris, 0), tokens: geos.flatMap((g) => g.tokens) };
  };
  G.facet = (g) => g; G.normalise = (g) => g;
  G.clone = (g) => ({ pts: g.pts.map((q) => ({ p: q.p.slice(), n: q.n.slice() })), tris: g.tris, tokens: g.tokens.slice() });
  return G;
}
function rgbOf(token) {
  const h = L.hex(token) || '#CFC8DC', n = parseInt(h.slice(1), 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}
function hexRgb(h) { const n = parseInt(String(h).replace('#', ''), 16); return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 }; }
function mockK(tier) {
  const K = { tier, G: mockG(tier), col: rgbOf, rgb: hexRgb, hex: (t) => L.hex(t), has: (t) => L.isToken(t), THREE: { AdditiveBlending: 2 }, users: [], variants: [] };
  K.variant = (key, name, patch) => { const v = { key, name, ...patch }; K.variants.push(v); return v; };
  K.ledAtlas = () => ({ setUser: (u) => { K.users.push(u); } });
  K.template = (ctx) => {
    const parts = [], pivots = {}, anchors = {};
    const b = {
      part(name, geos, mat, o) {
        const list = [geos].flat(Infinity), ex = parts.find((p) => p.name === name);
        if (ex && ex.mat === (mat || 'toon')) { ex.geos.push(...list); return b; }
        parts.push({ name, geos: list, mat: mat || 'toon', o: o || {} });
        return b;
      },
      pivot(name, origin, parent) { pivots[name] = { origin: origin.slice(), parent: parent || null }; return b; },
      anchor(name, pos) { anchors[name] = pos.slice(); return b; },
      hit() { return b; },
      done() {
        const ps = parts.map((p) => ({
          name: p.name, mat: p.mat, pivot: p.o.pivot || null, perCopy: !!p.o.perCopy, castShadow: !!p.o.castShadow && !p.o.pivot && !p.o.perCopy,
          outline: p.o.outline, stateColor: p.o.stateColor || null,
          tris: p.geos.reduce((a, g) => a + g.tris, 0), pts: p.geos.flatMap((g) => g.pts), tokens: p.geos.flatMap((g) => g.tokens), geos: p.geos
        }));
        return { __template: true, id: ctx.id, tier: ctx.tier, parts: ps, pivots, anchors, tris: ps.reduce((a, p) => a + p.tris, 0) };
      }
    };
    return b;
  };
  return K;
}
function ctxOf(id, tier, variant, K) {
  const st = { variant: variant || 0 };
  return { id, look: L.LOOK[id], st, stateKey: L.stateKey(id, st), tier, G: K.G, col: K.col, fp: C.item(id).fp, K };
}
function build(id, tier, variant, K) {
  K = K || mockK(tier || 'MID');
  return ST.factory(K)[id].build(ctxOf(id, tier || 'MID', variant, K));
}
function extents(pts) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const { p } of pts) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], p[i]); hi[i] = Math.max(hi[i], p[i]); }
  return { lo, hi };
}
const partOf = (tpl, name) => tpl.parts.find((p) => p.name === name);

/* ---------------- per-copy geometry and the mock animation handle ---------------- */
function attrOf(n, size, fill) {
  return { array: new Float32Array(n * size).fill(fill || 0), needsUpdate: false, uploads: 0, ranges: [], addUpdateRange(s, c) { this.ranges.push([s, c]); } };
}
function geoFor(n) {
  const at = { position: attrOf(n, 3), color: attrOf(n, 3, 0.5), uv: attrOf(n, 2) };
  return { attributes: at, getAttribute: (k) => at[k] || null };
}
/* plausible rest positions for the per-copy parts: the wall as 8 two-sided columns, the
   stage's heads and beams hanging from their truss points, everything else at the origin */
function baseFor(tpl, part, n) {
  const pos = new Float32Array(n * 3);
  const S = ST.LAYOUT.stage, meta = ST.metaOf({ template: tpl }, part);
  if (part === 'wall') {
    const sc = S.screen, W = 2 * sc.x / sc.strips;
    let v = 0;
    for (let side = 0; side < 2; side++) for (let c = 0; c < sc.strips; c++) {
      const x0 = -sc.x + c * W, x1 = x0 + W;
      for (const [x, y] of [[x0, sc.y1], [x0, sc.y0], [x1, sc.y1], [x0, sc.y0], [x1, sc.y0], [x1, sc.y1]]) { pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = sc.z; v++; }
    }
    return pos;
  }
  if (meta) for (const r of meta.subs) {
    for (let k = 0; k < r.vn; k++) {
      const v = r.v0 + k, o = v * 3;
      if (r.kind === 'head' || r.kind === 'lens') {
        const h = ST.headOrigin(r.i), dy = r.kind === 'lens' ? -S.lensDrop : -0.1;
        pos[o] = h[0] + ((k % 3) - 1) * 0.04; pos[o + 1] = h[1] + dy; pos[o + 2] = h[2] + ((k % 2) ? 0.03 : -0.03);
      } else if (r.kind === 'beam') {
        const h = ST.headOrigin(r.i), u = k / Math.max(1, r.vn - 1);
        pos[o] = h[0] + (k % 2 ? 1 : -1) * 0.25 * u; pos[o + 1] = h[1] - S.lensDrop - S.ray.len * u; pos[o + 2] = h[2];
      }
    }
  }
  return pos;
}
function handle(uid, tpl, o = {}) {
  const geos = {}, bases = {};
  for (const p of tpl.parts) if (p.perCopy) { const n = p.tris * 3; geos[p.name] = geoFor(n); bases[p.name] = baseFor(tpl, p.name, n); }
  const h = {
    uid, t: o.t || 0, beatPos: 0, beat: 0, bar: 0, bpm: BPM, reduced: !!o.reduced, show: 0, template: tpl, batch: o.photocard ? null : {},
    pets: o.pets, writes: [], states: [], halos: [], decals: [], emits: [], sounds: [], geos, bases,
    pivot(name) { return { set: (r, p, s) => h.writes.push({ name, t: h.t, r: r.slice(), p: p.slice(), s: s.slice() }) }; },
    state(k, v) { h.states.push([k, v]); },
    halo(name, on, size, token) { h.halos.push({ name, on, size, token }); },
    decal(on, token) { h.decals.push({ on, token }); },
    emit(kind, at, n) { h.emits.push({ kind, at, n, t: h.t }); },
    sfx(name, vol, step) { h.sounds.push({ name, vol, step, t: h.t }); },
    copyGeometry: (part) => geos[part] || null,
    basePositions: (part) => bases[part] || null
  };
  return h;
}
/* advance the handle's clock and music beat */
function tick(h, dt) {
  h.t += dt; h.beatPos += dt * BPM / 60;
  h.beat = h.beatPos - Math.floor(h.beatPos); h.bar = Math.floor(h.beatPos / 4);
}
/* one act on one continuous clock: run(until) advances it to act time `until` → alive */
function driver(act, h) {
  let k = 0, alive = true;
  return function run(until) {
    for (; alive && k / 60 <= until + 1e-9; k++) { if (k) tick(h, 1 / 60); alive = act.update(h, k / 60); }
    return alive;
  };
}
/* drive act.update at 60 fps (the handle's clock and beat move with it) */
function play(act, h, until) {
  const dt = 1 / 60;
  for (let k = 0; k < 2000; k++) {
    const t = k * dt;
    if (until != null && t > until + 1e-9) return { t, alive: true };
    if (k) tick(h, dt);
    if (!act.update(h, t)) return { t, alive: false };
  }
  throw new Error('act never ended');
}
const last = (h, name) => h.writes.filter((w) => w.name === name).pop();
const isRest = (w) => w && w.r.every((x) => Math.abs(x) < 1e-9) && w.p.every((x) => Math.abs(x) < 1e-9) && w.s.every((x) => Math.abs(x - 1) < 1e-9);
function colorAt(geo, v) { const a = geo.getAttribute('color').array; return [a[v * 3], a[v * 3 + 1], a[v * 3 + 2]]; }
const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
/* peaks per second of a sampled signal (rising then falling through a local maximum above floor) */
function peakRate(fn, T, floor) {
  const dt = 1 / 240;
  let peaks = 0, a = fn(0), b = fn(dt);
  for (let t = 2 * dt; t < T; t += dt) { const c = fn(t); if (b > a && b >= c && b > (floor || -Infinity)) peaks++; a = b; b = c; }
  return peaks / T;
}
/* which LED program a uv points into (the atlas is 2 × 4 strips of 256 × 64) */
function progAt(u, v) {
  const col = Math.floor(u * 2), row = Math.floor((1 - v) * 4);
  return KIT.LED_PROGRAMS[row * 2 + col];
}
/* the program triangle t shows, from its uv centroid (its vertices sit on window edges) */
function progTri(uv, t) {
  return progAt((uv[t * 6] + uv[t * 6 + 2] + uv[t * 6 + 4]) / 3, (uv[t * 6 + 1] + uv[t * 6 + 3] + uv[t * 6 + 5]) / 3);
}
function progsOf(uv) { const s = new Set(); for (let t = 0; t < uv.length / 6; t++) s.add(progTri(uv, t)); return s; }

/* ================================================================ */
test('stage models: the three city buildings have full models (build, idle, act, show, forget, setUser)', () => {
  assert.deepEqual(ST.IDS, IDS);
  const models = ST.factory(mockK('MID'));
  assert.deepEqual(Object.keys(models).sort(), IDS.slice().sort());
  for (const id of IDS) {
    const m = models[id], look = L.LOOK[id], it = C.item(id);
    assert.equal(look.kind, 'building', id);
    assert.equal(it.kind, 'fun'); assert.equal(it.cat, 'city');
    for (const fn of ['build', 'idle', 'act', 'show', 'forget', 'setUser']) assert.equal(typeof m[fn], 'function', id + ' ' + fn);
    assert.equal(it.act, ACT[id]);
    assert.equal(M.actFor(it.act, id), ACT[id], id + ' catalog act → motion act');
    assert.equal(L.ACT_PIVOT[it.act], look.actPivot, id + ' act pivot');
    assert.equal(ST.PERFORM[id], PERFORM[id]);
  }
  assert.equal(typeof models.bld_stage.material, 'function', 'the stage hands over its beam material');
});

test('stage models: the script registers SL3D.defineModels(\'stage\') in the browser', () => {
  const reg = [];
  const box = { SLMotion: M, SLIslandLook: L, SLKit: KIT, SL3D: { defineModels: (cat, f) => reg.push([cat, f]) } };
  box.self = box;
  vm.createContext(box);
  vm.runInContext(SRC, box);
  assert.equal(reg.length, 1);
  assert.equal(reg[0][0], 'stage');
  const models = reg[0][1](mockK('LOW'), {});
  assert.deepEqual(Object.keys(models).sort(), IDS.slice().sort());
  const tpl = models.bld_stage.build(ctxOf('bld_stage', 'LOW', 0, mockK('LOW')));
  assert.ok(tpl.__template && tpl.pivots.lights && tpl.pivots.crowd);
});

test('stage models: templates carry the LOOK pivots, anchors, materials and colour tokens on every tier and trim', () => {
  for (const id of IDS) for (const tier of TIERS) for (const v of [0, 1, 2]) {
    const look = L.LOOK[id], tpl = build(id, tier, v), tag = `${id} ${tier} v${v}`;
    for (const pv of look.pivots) assert.ok(tpl.pivots[pv], tag + ' has pivot ' + pv);
    assert.ok(tpl.pivots[look.actPivot], tag + ' has its act pivot');
    for (const an of look.anchors) assert.ok(tpl.anchors[an], tag + ' has anchor ' + an);
    assert.ok(Math.abs(tpl.anchors.top[1] - (look.h + 0.15)) < 1e-9, tag + ' top anchor');
    assert.equal(tpl.parts.length, PARTS[id], tag + ' part count (draw calls)');
    const mats = new Set(tpl.parts.map((p) => p.mat));
    assert.ok(mats.size <= 4, tag + ' ≤ 4 materials: ' + [...mats]);
    const allowedMat = new Set(['toon', 'state', ...Object.values(look.mats)]);
    const allowedTok = new Set([...L.tokensIn(look), ...L.BUILDING_TRIMS.accent]);
    for (const p of tpl.parts) {
      assert.ok(p.pts.length && p.tris > 0, tag + ' part ' + p.name + ' has geometry');
      assert.ok(allowedMat.has(p.mat), tag + ' ' + p.name + ' uses an allowed material (' + p.mat + ')');
      if (p.pivot) assert.ok(tpl.pivots[p.pivot], tag + ' ' + p.name + ' pivot exists');
      if (p.pivot || p.perCopy) assert.ok(!p.castShadow, tag + ' moving part ' + p.name + ' casts no static shadow');
      assert.ok(!p.outline, tag + ' architecture has no ink hull');
      assert.ok(p.tokens.length, tag + ' ' + p.name + ' is painted');
      for (const { token, tone } of p.tokens) {
        assert.ok(L.isToken(token), tag + ' ' + p.name + ': ' + token + ' is a palette token');
        assert.ok(allowedTok.has(token), tag + ' ' + p.name + ': ' + token + ' comes from the LOOK entry or the trims');
        assert.ok(['base', 'shade', 'hi'].includes(tone) || (typeof tone === 'number' && Math.abs(tone) <= 0.05), tag + ' tone ' + tone);
      }
      if (p.stateColor) for (const k of ['off', 'on']) assert.ok(allowedTok.has(p.stateColor[k]), tag + ' state colour ' + p.stateColor[k]);
      /* matcap and screen parts are painted only in their LOOK part colour */
      for (const [part, m] of Object.entries(look.mats)) {
        if (p.mat === m && m !== 'state' && !/^neon:/.test(m)) assert.ok(p.tokens.every((t) => t.token === look.colors[part]), tag + ' ' + m + ' parts are the ' + part);
      }
    }
    const shell = partOf(tpl, 'shell');
    assert.ok(shell && shell.castShadow && !shell.pivot && shell.mat === 'toon', tag + ' a static toon shell casts into the static shadow map');
  }
});

test('stage models: per-building parts — perCopy CPU parts, the LED wall, the beams and the crowd', () => {
  for (const tier of TIERS) {
    const dance = build('bld_dance', tier), roof = build('bld_rooftop', tier), stage = build('bld_stage', tier);
    const fl = partOf(dance, 'floor');
    assert.ok(fl.perCopy && fl.pivot === 'floor' && fl.mat === 'state');
    assert.equal(partOf(dance, 'speaker').pivot, 'speaker');
    assert.equal(partOf(dance, 'glass').mat, 'smoked'); assert.equal(partOf(dance, 'mirror').mat, 'chrome');
    const fm = ST.metaOf({ template: dance }, 'floor');
    assert.equal(fm.by.tile.length, 6, '3 × 2 deck tiles'); assert.equal(fm.by.fin.length, 5, '5 fins');
    assert.ok(fm.by.sign.length >= 1 && fm.by.down.length === 3 && fm.by.cove.length === 1);
    assert.equal(fm.n, fl.tris * 3, 'the ranges cover the part exactly');
    const li = partOf(roof, 'lights');
    assert.ok(li.perCopy && li.pivot === 'bulbs' && li.mat === 'state');
    for (const [name, pv] of [['deck', 'deck'], ['scope', 'scope']]) assert.equal(partOf(roof, name).pivot, pv);
    const rm = ST.metaOf({ template: roof }, 'lights');
    assert.equal(rm.by.bulb.length, 9, '9 Edison bulbs'); assert.equal(rm.by.win.length, 4, '4 windows');
    assert.equal(rm.n, li.tris * 3);
    const wall = partOf(stage, 'wall');
    assert.ok(wall.perCopy && wall.pivot === 'lights' && wall.mat === 'led' && wall.stateColor && wall.stateColor.key === 'level');
    assert.ok(partOf(stage, 'beams').perCopy && partOf(stage, 'lights').perCopy);
    assert.equal(partOf(stage, 'crowd').pivot, 'crowd');
    const sm = ST.metaOf({ template: stage }, 'lights'), bm = ST.metaOf({ template: stage }, 'beams');
    assert.equal(sm.by.foot.length, 8, '8 footlights'); assert.equal(sm.by.head.length, 4); assert.equal(sm.by.lens.length, 4);
    assert.equal(bm.subs.length, 4, 'one beam per moving head');
    assert.equal(sm.n, partOf(stage, 'lights').tris * 3); assert.equal(bm.n, partOf(stage, 'beams').tris * 3);
    /* the heads and lenses are one contiguous block (one position upload) */
    const hl = sm.subs.filter((s) => s.kind === 'head' || s.kind === 'lens');
    for (let i = 1; i < hl.length; i++) assert.equal(hl[i].v0, hl[i - 1].v0 + hl[i - 1].vn, 'heads + lenses contiguous');
    for (let i = 0; i < 4; i++) assert.ok(stage.pivots['head' + i], 'head pivot ' + i);
    /* the wall is an 8-column plane on the screen rect */
    const e = extents(wall.pts), sc = ST.LAYOUT.stage.screen;
    assert.ok(Math.abs(e.lo[0] + sc.x) < 1e-9 && Math.abs(e.hi[0] - sc.x) < 1e-9 && Math.abs(e.lo[1] - sc.y0) < 1e-9 && Math.abs(e.hi[1] - sc.y1) < 1e-9);
    assert.equal(wall.tris, 2 * 2 * sc.strips);
  }
});

test('stage models: triangle budgets — LOOK tris on MID/HIGH (the stage ≤ 4,000 + 600 crowd), LOW ≥ 20% cheaper', () => {
  for (const id of IDS) for (const v of [0, 1, 2]) {
    const look = L.LOOK[id], t = {};
    for (const tier of TIERS) {
      const tpl = build(id, tier, v), crowd = partOf(tpl, 'crowd');
      t[tier] = tpl.tris;
      if (id === 'bld_stage') {
        assert.ok(tpl.tris - crowd.tris <= 4000, `${id} ${tier}: stage ${tpl.tris - crowd.tris} ≤ 4000`);
        assert.ok(crowd.tris <= look.crowdTris && crowd.tris <= 600, `${id} ${tier}: crowd ${crowd.tris} ≤ 600`);
      } else assert.ok(tpl.tris <= look.tris, `${id} ${tier}: ${tpl.tris} ≤ ${look.tris}`);
    }
    assert.ok(t.MID <= look.tris + (look.crowdTris || 0) && t.HIGH <= look.tris + (look.crowdTris || 0));
    assert.ok(t.LOW <= 0.8 * t.MID, `${id} v${v}: LOW ${t.LOW} vs MID ${t.MID}`);
    assert.ok(t.MID >= 0.55 * look.tris, `${id}: a rich model (${t.MID} of ${look.tris})`);
  }
});

test('stage models: the rest pose sits on the ground inside the footprint margin at the LOOK height', () => {
  for (const id of IDS) for (const tier of TIERS) for (const v of [0, 1, 2]) {
    const look = L.LOOK[id], fp = C.item(id).fp, tpl = build(id, tier, v), tag = `${id} ${tier} v${v}`;
    const pts = tpl.parts.filter((p) => p.name !== 'crowd').flatMap((p) => p.pts), e = extents(pts);
    const mx = fp[0] / 2 - 0.07, mz = fp[1] / 2 - 0.07;
    assert.ok(e.lo[1] >= -0.025, `${tag}: base y ${e.lo[1].toFixed(3)}`);
    assert.ok(Math.max(-e.lo[0], e.hi[0]) <= mx + 0.002, `${tag}: x extent ${Math.max(-e.lo[0], e.hi[0]).toFixed(3)} > ${mx}`);
    assert.ok(Math.max(-e.lo[2], e.hi[2]) <= mz + 0.002, `${tag}: z extent ${Math.max(-e.lo[2], e.hi[2]).toFixed(3)} > ${mz}`);
    assert.ok(e.hi[1] >= look.h - 0.01 && e.hi[1] <= look.h + 0.01, `${tag}: height ${e.hi[1].toFixed(3)} vs ${look.h}`);
    assert.ok(look.h <= 2.9);
  }
});

test('stage models: the stage crowd — 12 faceless silhouettes standing in the 3 pit cells, ≤ 50 triangles each', () => {
  const fans = ST.crowdLayout();
  assert.equal(fans.length, 12);
  for (const tier of TIERS) {
    const crowd = partOf(build('bld_stage', tier), 'crowd'), e = extents(crowd.pts);
    assert.equal(crowd.geos.length, 12);
    for (const g of crowd.geos) assert.ok(g.tris <= 50, tier + ' fan tris ' + g.tris);
    /* the entrance row in front of the 3×2 footprint: z ∈ [1, 2], x ∈ [-1.5, 1.5] */
    assert.ok(e.lo[2] >= 1 + 0.05 && e.hi[2] <= 2 - 0.05, `pit z ${e.lo[2].toFixed(2)}..${e.hi[2].toFixed(2)}`);
    assert.ok(Math.max(-e.lo[0], e.hi[0]) <= 1.43, 'pit x');
    assert.ok(e.lo[1] >= -0.01 && e.hi[1] <= 0.6, 'standing on the ground, waist-high to the stage');
    const toks = new Set(crowd.tokens.map((t) => t.token));
    for (const t of toks) assert.ok(['Graphite', 'Night Asphalt', 'Midnight Ink', '@member', 'Neon Magenta', 'LED Cyan', ...L.NEON4].includes(t), 'crowd token ' + t);
    assert.ok(!toks.has('Bone White'), 'no eyes or faces on the crowd');
  }
  /* sticks: the accent share stays ≤ 35% of the crowd and every neon appears */
  const wands = fans.map((f) => (f.i * 2 + f.row) % 5);
  assert.ok(wands.filter((w) => w === 0).length / 12 <= 0.35);
  for (let k = 0; k < 5; k++) assert.ok(wands.includes(k));
});

test('stage models: the three trims differ (accent, sign side, stripe) and are picked by uid', () => {
  for (const id of IDS) {
    const sigs = [0, 1, 2].map((v) => {
      const tpl = build(id, 'MID', v);
      return JSON.stringify(tpl.parts.map((p) => [p.name, p.tris, p.tokens.map((t) => t.token).join(','), extents(p.pts).lo.map((x) => x.toFixed(3))]));
    });
    assert.equal(new Set(sigs).size, 3, id + ': 3 distinct trims');
    const seen = new Set();
    for (let i = 1; i <= 60; i++) seen.add(L.variantOf('p' + i, id));
    assert.deepEqual([...seen].sort(), [0, 1, 2], id + ' uids spread over the trims');
  }
  /* the accent token per trim lands on the accent-coloured pieces */
  for (const [v, tok] of [[1, 'Neon Magenta'], [2, 'LED Cyan']]) {
    const fm = partOf(build('bld_dance', 'MID', v), 'floor');
    assert.ok(fm.tokens.some((t) => t.token === tok), 'dance fins in ' + tok);
  }
  /* the sign side moves the dance pictogram and the rooftop mural */
  const signX = (v) => build('bld_dance', 'MID', v).anchors.sign[0];
  assert.ok(signX(0) < 0 && signX(1) > 0, 'sign L then R');
  assert.deepEqual(ST.roofSlots(-1).windows.length, 2);
  assert.notEqual(ST.roofSlots(-1).mural, ST.roofSlots(1).mural);
  /* stripe C fins rise toward the sign */
  const fins = ST.finLayout('C', -1);
  assert.ok(fins[0].h > fins[4].h && ST.finLayout('C', 1)[4].h > ST.finLayout('C', 1)[0].h);
  assert.ok(ST.finLayout('B', 1)[1].x - ST.finLayout('B', 1)[0].x < 0.2, 'B groups the fins');
});

/* ---------------- acts ---------------- */
test('stage acts: durations, sounds and emits follow SLMotion; the pet is asked; pivots end at rest', () => {
  for (const reduced of [false, true]) {
    for (const id of IDS) {
      const models = ST.factory(mockK('MID')), tpl = build(id, 'MID'), calls = [];
      const h = handle(id + '#1', tpl, { reduced, pets: { active: () => true, perform: (kind, uid) => { calls.push([kind, uid]); return 1.2; } } });
      models[id].show(h, 0);
      const act = models[id].act(h, C.item(id).act), o = { reduced };
      assert.ok(act && typeof act.update === 'function' && typeof act.cancel === 'function', id);
      assert.equal(act.name, ACT[id]);
      assert.equal(act.dur, M.durOf(ACT[id], o), id + ' dur');
      assert.ok(act.dur <= 3, id + ' building part ≤ 3 s');
      assert.deepEqual(calls, [[PERFORM[id], id + '#1']], id + ' asks the crew to perform');
      const end = play(act, h);
      assert.ok(end.t >= act.dur - 1e-9 && end.t < act.dur + 1 / 60 + 1e-9, id + ' ends on time');
      const cues = M.cues(ACT[id], o);
      assert.deepEqual(h.sounds.map((s) => [s.name, s.step]), cues.filter((c) => c.sfx).map((c) => [c.sfx, c.step]), id + ' sounds');
      assert.deepEqual(h.emits.map((e) => [e.kind, e.n]), cues.filter((c) => c.emit).map((c) => [c.emit, c.n]), id + ' emits');
      for (const e of h.emits) assert.ok(typeof e.at === 'string' && (tpl.anchors[e.at] || tpl.pivots[e.at]), id + ' emits at a real anchor ' + e.at);
      assert.ok(!h.sounds.some((s) => s.name === 'pop' && s.t < 0.05), id + ' never plays pop in its first 0.05 s');
      for (const pv of ['speaker', 'scope', 'deck']) { const w = last(h, pv); if (w) assert.ok(isRest(w), id + ' ' + pv + ' ends at rest'); }
      assert.equal(act.update(h, end.t + 0.1), false, id + ' stays ended');
    }
  }
});

test('stage acts: the dance pumps the speakers on the beat and chases the deck', () => {
  const models = ST.factory(mockK('MID')), tpl = build('bld_dance', 'MID'), h = handle('d1', tpl);
  models.bld_dance.show(h, 0);
  const meta = ST.metaOf(h, 'floor'), geo = h.geos.floor, tiles = meta.by.tile;
  const before = tiles.map((r) => colorAt(geo, r.v0).join());
  const act = models.bld_dance.act(h, 'dance'), run = driver(act, h);
  const seen = tiles.map(() => new Set());
  for (let k = 0; k < 170; k++) { run(k / 60); tiles.forEach((r, i) => seen[i].add(colorAt(geo, r.v0).map((x) => x.toFixed(2)).join())); }
  assert.ok(seen.every((s) => s.size > 3), 'every tile changes during the chase');
  const pumps = h.writes.filter((w) => w.name === 'speaker').map((w) => w.s[1]);
  assert.ok(Math.max(...pumps) > 1.03 && Math.max(...pumps) <= 1 + ST.RULES.pump + 1e-9, 'the speakers pump ≤ 6%');
  assert.equal(run(4), false);
  assert.ok(isRest(last(h, 'speaker')));
  assert.deepEqual(tiles.map((r) => colorAt(geo, r.v0).join()), before, 'the deck settles back to its golden-hour pastel');
});

test('stage acts: the rooftop scope swings 40° to the sky, the beanbags squish, the bulbs wave', () => {
  const models = ST.factory(mockK('MID')), tpl = build('bld_rooftop', 'MID'), h = handle('r1', tpl);
  models.bld_rooftop.show(h, 0);
  const meta = ST.metaOf(h, 'lights'), geo = h.geos.lights;
  const act = models.bld_rooftop.act(h, 'hangout');
  const levels = [];
  for (let k = 0; k <= 180; k++) { if (k) tick(h, 1 / 60); act.update(h, k / 60); levels.push(meta.by.bulb.map((r) => lum(colorAt(geo, r.v0)))); }
  const scope = h.writes.filter((w) => w.name === 'scope').map((w) => w.r[0]);
  assert.ok(Math.abs(Math.max(...scope) - 40) < 1e-6, 'a 40° swing up (rotation about x lifts the -z tube)');
  const deck = h.writes.filter((w) => w.name === 'deck');
  assert.ok(deck.some((w) => w.s[1] < 0.95) && deck.some((w) => w.s[1] > 1.01), 'squish 0.92 → 1.03');
  for (const w of deck) assert.ok(Math.abs(w.s[0] - (1 + (1 - w.s[1]) * 0.5)) < 1e-9, 'volume-ish squish');
  const mid = levels[60], max = Math.max(...mid), min = Math.min(...mid);
  assert.ok(max > min && min >= 0.6 * max - 1e-9, 'a travelling wave within ±35%');
  const day = levels[0];
  assert.ok(Math.max(...levels[60]) > Math.max(...day), 'the bulbs brighten');
  assert.ok(isRest(last(h, 'scope')) && isRest(last(h, 'deck')));
});

test('stage acts: the encore wipes the wall to ENCORE, swings the heads to centre and raises the crowd', () => {
  const models = ST.factory(mockK('MID')), tpl = build('bld_stage', 'MID'), h = handle('s1', tpl);
  models.bld_stage.show(h, 0);
  const uv = h.geos.wall.getAttribute('uv').array;
  const progs = () => progsOf(uv);
  assert.deepEqual([...progs()], ['stars'], 'golden hour: the star drift');
  const act = models.bld_stage.act(h, 'encore'), run = driver(act, h);
  run(0.3);
  assert.deepEqual([...progs()].sort(), ['encore', 'stars'], 'mid-wipe: both programs, strip by strip');
  /* the wipe runs left to right (front triangles 0 and 15: the first and the last column) */
  assert.equal(progTri(uv, 0), 'encore'); assert.equal(progTri(uv, 15), 'stars');
  run(1.2);
  assert.deepEqual([...progs()], ['encore']);
  /* heads at centre stage, beams on, crowd up */
  const lp = h.geos.lights.getAttribute('position').array, meta = ST.metaOf(h, 'lights');
  const lens0 = meta.by.lens[0], base = h.bases.lights;
  assert.ok(Math.hypot(lp[lens0.v0 * 3] - base[lens0.v0 * 3], lp[lens0.v0 * 3 + 2] - base[lens0.v0 * 3 + 2]) > 0.02, 'the heads swing');
  const bc = h.geos.beams.getAttribute('color').array;
  assert.ok(Math.max(...bc) > 0.3, 'the beams light');
  const crowd = last(h, 'crowd');
  assert.ok(crowd && crowd.s[1] === 1 && Math.abs(crowd.p[1]) < 0.05, 'the crowd stands in the pit');
  assert.equal(run(3 + 1 / 60), false, 'the building part ends at 3 s');
  assert.ok(Math.abs(h.t - 3) < 0.02);
  /* after the act: ENCORE and the crowd hold for the encore, then both go back */
  for (let k = 0; k < 60 * 4; k++) { tick(h, 1 / 60); models.bld_stage.idle(h); }
  assert.deepEqual([...progs()], ['encore'], 'ENCORE holds through the encore');
  assert.equal(last(h, 'crowd').s[1], 1);
  for (let k = 0; k < 60 * 3; k++) { tick(h, 1 / 60); models.bld_stage.idle(h); }
  assert.deepEqual([...progs()], ['stars'], 'back to the star drift');
  assert.ok(last(h, 'crowd').s[1] < 0.01, 'the crowd sinks away');
  assert.ok(Math.max(...h.geos.beams.getAttribute('color').array) < 1e-6, 'beams off by day');
});

test('stage acts: reduced motion is the instant end state — no travel, no crowd, a static ENCORE', () => {
  const models = ST.factory(mockK('MID')), tpl = build('bld_stage', 'MID'), h = handle('sr', tpl, { reduced: true });
  models.bld_stage.show(h, 0);
  const act = models.bld_stage.act(h, 'encore');
  assert.equal(act.dur, 0);
  assert.equal(act.update(h, 0), false);
  const uv = h.geos.wall.getAttribute('uv').array;
  assert.deepEqual([...progsOf(uv)], ['encore']);
  assert.ok(h.writes.filter((w) => w.name === 'crowd').every((w) => w.s[1] < 0.01), 'no crowd under reduced motion');
  assert.deepEqual(h.sounds.map((s) => s.name), ['sting', 'tada']);
  assert.deepEqual(h.emits.map((e) => [e.kind, e.n]), [['sparkle', 1]]);
  /* frozen: idle and show write the same uv every time */
  const snap = Array.from(uv);
  tick(h, 1); models.bld_stage.show(h, 0);
  assert.deepEqual(Array.from(uv), snap);
  /* once the hold is over, the next show call puts the star field back */
  h.t += 9; models.bld_stage.show(h, 0);
  assert.deepEqual([...progsOf(uv)], ['stars']);
});

test('stage acts: a re-tap restarts without stacking and carries on from the interrupted pose', () => {
  const PIV = { bld_dance: 'speaker', bld_rooftop: 'scope', bld_stage: 'crowd' };
  for (const id of IDS) {
    const models = ST.factory(mockK('MID')), tpl = build(id, 'MID'), h = handle(id + '#r', tpl);
    models[id].show(h, 0);
    const a1 = models[id].act(h, C.item(id).act);
    play(a1, h, 0.9);
    const before = last(h, PIV[id]), nSounds = h.sounds.length;
    const a2 = models[id].act(h, C.item(id).act);
    assert.equal(a1.update(h, 0.92), false, id + ': the interrupted act is dead');
    assert.equal(h.sounds.length, nSounds, id + ': and it fires nothing more');
    a2.update(h, 0);
    const after = last(h, PIV[id]);
    const gap = Math.max(...[0, 1, 2].map((i) => Math.abs(after.r[i] - before.r[i])), ...[0, 1, 2].map((i) => Math.abs(after.s[i] - before.s[i])), Math.abs(after.p[1] - before.p[1]));
    assert.ok(gap < 0.35, `${id}: restart continues from the pose (gap ${gap.toFixed(3)})`);
    play(a2, h);
  }
  /* the stage: a re-tap while ENCORE is up never wipes backwards */
  const models = ST.factory(mockK('MID')), tpl = build('bld_stage', 'MID'), h = handle('s#r', tpl);
  models.bld_stage.show(h, 0);
  play(models.bld_stage.act(h, 'encore'), h, 1);
  const a2 = models.bld_stage.act(h, 'encore');
  const uv = h.geos.wall.getAttribute('uv').array;
  for (let k = 0; k < 30; k++) { tick(h, 1 / 60); a2.update(h, k / 60); assert.deepEqual([...progsOf(uv)], ['encore']); }
});

test('stage acts: cancel stops the act and rests its pivots; copies are independent', () => {
  const models = ST.factory(mockK('MID'));
  for (const [id, pivs] of [['bld_dance', ['speaker']], ['bld_rooftop', ['scope', 'deck']]]) {
    const h = handle(id + '#c', build(id, 'MID')), act = models[id].act(h, C.item(id).act);
    play(act, h, 0.6);
    act.cancel();
    for (const pv of pivs) assert.ok(isRest(last(h, pv)), id + ' rests ' + pv + ' on cancel');
    assert.equal(act.update(h, 0.7), false);
    act.cancel();
  }
  const ha = handle('A', build('bld_rooftop', 'MID')), hb = handle('B', build('bld_rooftop', 'MID'));
  const aa = models.bld_rooftop.act(ha, 'hangout'), ab = models.bld_rooftop.act(hb, 'hangout');
  play(aa, ha, 0.5);
  assert.equal(ab.update(hb, 0.5), true, 'another copy keeps going');
  /* with no pet (or a pet that throws) the building still runs its act */
  for (const pets of [undefined, { perform: () => -1 }, { perform: () => { throw new Error('busy'); } }]) {
    const h = handle('np', build('bld_dance', 'MID'), { pets }), act = models.bld_dance.act(h, 'dance');
    assert.equal(act.dur, 3);
    assert.equal(play(act, h).alive, false);
  }
});

/* ---------------- shows and idles ---------------- */
test('stage shows: golden hour is calm and static; Showtime lights the neon, halos and beams', () => {
  const models = ST.factory(mockK('MID'));
  /* the dance deck: static pastel by day (idle has nothing to animate), a chase at Showtime */
  let tpl = build('bld_dance', 'MID'), h = handle('d', tpl);
  models.bld_dance.show(h, 0);
  assert.equal(models.bld_dance.idle(h), true, 'first paint');
  tick(h, 0.5);
  assert.equal(models.bld_dance.idle(h), false, 'nothing animates at golden hour');
  assert.ok(h.halos.some((x) => x.name === 'sign' && !x.on));
  models.bld_dance.show(h, 1);
  assert.ok(h.halos.some((x) => x.name === 'sign' && x.on && x.token === 'Neon Magenta' && x.size <= 1.2));
  const meta = ST.metaOf(h, 'floor'), seen = new Set();
  for (let k = 0; k < 240; k++) { tick(h, 1 / 60); assert.equal(models.bld_dance.idle(h), true); seen.add(colorAt(h.geos.floor, meta.by.tile[0].v0).map((x) => x.toFixed(2)).join()); }
  assert.ok(seen.size > 4, 'the deck chases at Showtime');
  const cove = lum(colorAt(h.geos.floor, meta.by.cove[0].v0));
  models.bld_dance.show(h, 0);
  assert.ok(cove > lum(colorAt(h.geos.floor, meta.by.cove[0].v0)), 'the cove glows warmer at night');
  /* the rooftop: windows light up one by one, never flicker; the up-light and festoon halos */
  tpl = build('bld_rooftop', 'MID'); h = handle('r', tpl);
  const rm = ST.metaOf(h, 'lights');
  const lit = (k) => { models.bld_rooftop.show(h, k); return rm.by.win.map((r) => lum(colorAt(h.geos.lights, r.v0))); };
  let prev = lit(0);
  const dark = lum([...Object.values(rgbOf('Smoked Glass'))]);
  assert.ok(prev.some((x) => x > dark + 0.05) && prev.some((x) => x < dark + 0.05), 'golden hour: some windows lit, some dark');
  for (let k = 0.05; k <= 1.0001; k += 0.05) { const cur = lit(k); cur.forEach((x, i) => assert.ok(x >= prev[i] - 1e-6, 'monotonic: no flicker')); prev = cur; }
  assert.ok(prev.every((x) => x > dark + 0.1), 'Showtime: every window lit');
  assert.ok(h.decals.some((d) => d.on && d.token === 'Electric Violet'), 'the violet up-light on the mural');
  assert.ok(['bulbL', 'bulbM', 'bulbR'].every((n) => h.halos.some((x) => x.name === n && x.on)));
  /* the stage: beams hidden by day (collapsed onto the lenses), on at Showtime; level state */
  tpl = build('bld_stage', 'MID'); h = handle('s', tpl);
  models.bld_stage.show(h, 0);
  const bp = h.geos.beams.getAttribute('position').array, bc = h.geos.beams.getAttribute('color').array;
  assert.ok(Math.max(...bc) === 0, 'no beams at golden hour');
  const bm = ST.metaOf(h, 'beams');
  for (const r of bm.subs) { const o = ST.headOrigin(r.i); for (let v = r.v0; v < r.v0 + r.vn; v++) assert.ok(Math.abs(bp[v * 3 + 1] - (o[1] - ST.LAYOUT.stage.lensDrop)) < 1e-6, 'collapsed'); }
  assert.deepEqual(h.states.pop(), ['level', ST.RULES.wallDay]);
  models.bld_stage.show(h, 1);
  assert.ok(Math.max(...bc) > 0.3, 'beams at Showtime');
  assert.deepEqual(h.states.pop(), ['level', 1]);
  assert.ok([0, 1, 2, 3].every((i) => h.halos.some((x) => x.name === 'head' + i && x.on && x.size <= 1.2)), 'pin-spot halos');
});

test('stage shows: the trim-0 accent takes the member colour on the island, never on a photocard', () => {
  const K = mockK('MID'), models = ST.factory(K), tpl = build('bld_dance', 'MID', 0, K);
  models.bld_dance.setUser({ name: 'Mia', color: '#11AA55' });
  assert.deepEqual(K.users.pop(), { name: 'Mia', color: '#11AA55' }, 'the LED atlas learns the name too');
  const meta = ST.metaOf({ template: tpl }, 'floor');
  const isl = handle('d', tpl), card = handle('pc:icon', tpl, { photocard: true });
  models.bld_dance.show(isl, 0); models.bld_dance.show(card, 0);
  const fin = (h) => colorAt(h.geos.floor, meta.by.fin[0].v0), mem = hexRgb('#11AA55'), fb = rgbOf('@member');
  assert.ok(Math.abs(fin(isl)[1] / fin(isl)[0] - mem.g / mem.r) < 1e-6, 'island: the member green');
  assert.ok(Math.abs(fin(card)[0] / fin(card)[2] - fb.r / fb.b) < 1e-6, 'photocard: the neutral fallback');
  /* a profile switch repaints at the next idle */
  models.bld_dance.setUser({ name: 'Leo', color: '#3366FF' });
  tick(isl, 0.1); models.bld_dance.idle(isl);
  const blue = hexRgb('#3366FF');
  assert.ok(Math.abs(fin(isl)[2] / fin(isl)[0] - blue.b / blue.r) < 1e-6);
  /* trims 1 and 2 keep their fixed accent */
  const t1 = build('bld_dance', 'MID', 1, K), h1 = handle('d1', t1);
  models.bld_dance.show(h1, 1);
  const m1 = rgbOf('Neon Magenta'), f1 = colorAt(h1.geos.floor, ST.metaOf(h1, 'floor').by.fin[0].v0);
  assert.ok(Math.abs(f1[0] - m1.r) < 1e-6 && Math.abs(f1[2] - m1.b) < 1e-6);
});

test('stage shows: the LED wall rotates its Showtime programs every 8 bars, ≥ 0.5 s apart, and the name never reaches a photocard', () => {
  assert.equal(ST.showProgram(0, true), 'spark');
  assert.equal(ST.showProgram(8, true), 'name');
  assert.equal(ST.showProgram(16, true), 'eq');
  assert.equal(ST.showProgram(24, true), 'gradient');
  for (let bar = 0; bar < 200; bar++) assert.notEqual(ST.showProgram(bar, false), 'name');
  const used = new Set(['stars', 'encore', ...ST.SHOW_PROGRAMS]);
  for (const p of used) assert.ok(KIT.LED_PROGRAMS.includes(p), p + ' is an atlas program (no new words)');
  const models = ST.factory(mockK('MID'));
  models.bld_stage.setUser({ name: 'Mia', color: '#11AA55' });
  for (const photocard of [false, true]) {
    const h = handle(photocard ? 'pc:icon' : 's', build('bld_stage', 'MID'), { photocard });
    models.bld_stage.show(h, 1);
    const uv = h.geos.wall.getAttribute('uv').array, shown = [], changes = [];
    let cur = progTri(uv, 15);
    for (let k = 0; k < 60 * 70; k++) {
      tick(h, 1 / 60); models.bld_stage.idle(h);
      const p = progTri(uv, 15);
      if (p !== cur) { changes.push(h.t); cur = p; }
      shown.push(p);
    }
    const set = new Set(shown);
    assert.ok(set.size >= 3, 'the wall rotates: ' + [...set]);
    assert.equal(set.has('name'), !photocard, photocard ? 'a photocard never shows the name' : 'the island shows the name');
    for (let i = 1; i < changes.length; i++) assert.ok(changes[i] - changes[i - 1] >= ST.RULES.screenGap - 1e-9, 'program changes ≥ 0.5 s apart');
  }
});

test('stage shows: reduced motion holds a still frame; a new copy (restyle, photocard) starts from fresh caches', () => {
  const models = ST.factory(mockK('MID'));
  for (const id of IDS) {
    const h = handle(id + '#red', build(id, 'MID'), { reduced: true });
    models[id].show(h, 1);
    const snap = JSON.stringify(Object.fromEntries(Object.entries(h.geos).map(([k, g]) => [k, [Array.from(g.getAttribute('color').array), Array.from(g.getAttribute('position').array), Array.from(g.getAttribute('uv').array)]])));
    models[id].idle(h);
    for (let k = 0; k < 120; k++) { tick(h, 1 / 60); assert.equal(models[id].idle(h), false, id + ' reduced idle is still'); }
    assert.equal(JSON.stringify(Object.fromEntries(Object.entries(h.geos).map(([k, g]) => [k, [Array.from(g.getAttribute('color').array), Array.from(g.getAttribute('position').array), Array.from(g.getAttribute('uv').array)]]))), snap, id + ' nothing moves');
  }
  /* a restyle (new copy geometry) or a new photocard reusing a uid starts from fresh caches */
  const tpl = build('bld_stage', 'MID'), h1 = handle('pc:icon', tpl, { photocard: true });
  models.bld_stage.show(h1, 0);
  const h2 = handle('pc:icon', tpl, { photocard: true });
  models.bld_stage.show(h2, 0);
  assert.ok(h2.writes.some((w) => w.name === 'crowd' && w.s[1] < 0.01), 'the second card hides its crowd too');
  const lp = h2.geos.lights.getAttribute('position').array, lens = ST.metaOf(h2, 'lights').by.lens[0];
  assert.notEqual(lp[lens.v0 * 3 + 1], 0, 'and parks its heads');
  models.bld_stage.forget('pc:icon');
});

/* ---------------- flash safety ---------------- */
test('stage flash safety: chases ≤ LED_CHASE_HZ, beat pulses ≤ 1.97 Hz, hue steps ≤ 1 Hz, sweeps 0.12 Hz, waves ≤ ±35%', () => {
  const beatAt = (t) => t * BPM / 60;
  const B = (t) => Math.floor(beatAt(t)), F = (t) => beatAt(t) - Math.floor(beatAt(t));
  /* deck tiles at full chase: each lights once per 4 beats */
  for (const T of ST.tileLayout()) {
    const r = peakRate((t) => ST.tileLevel(T.cx, T.cz, B(t), F(t), 1, false), 20, 0.9);
    assert.ok(r > 0 && r <= L.LED_CHASE_HZ, `tile ${T.i}: ${r.toFixed(2)} Hz`);
    let changes = 0, h0 = ST.tileHue(T.i, 0, 1, false);
    for (let t = 0; t < 20; t += 1 / 120) { const hh = ST.tileHue(T.i, B(t), 1, false); if (hh !== h0) { changes++; h0 = hh; } }
    assert.ok(changes / 20 <= 1.0 + 1e-9, 'hue steps ≤ 1 Hz');
    assert.equal(ST.tileLevel(T.cx, T.cz, 7, 0.4, 1, true), ST.tileLevel(T.cx, T.cz, 9, 0.9, 1, true), 'steady under reduced motion');
  }
  /* footlights */
  for (let i = 0; i < 8; i++) {
    const r = peakRate((t) => ST.footLevel(i, B(t), F(t), 1, 0, false), 20, 0.9);
    assert.ok(r > 0 && r <= L.LED_CHASE_HZ, `foot ${i}: ${r.toFixed(2)} Hz`);
    assert.equal(ST.footLevel(i, 7, 0.4, 1, 0.5, true), ST.footLevel(i, 9, 0.9, 1, 0.5, true), 'footlights hold under reduced motion');
  }
  /* festoon wave: 0.8 Hz, never deeper than 35% */
  for (let i = 0; i < 9; i++) {
    let lo = Infinity, hi = -Infinity;
    for (let t = 0; t < 10; t += 0.01) { const v = ST.bulbLevel(i, t, 1, 0, false); lo = Math.min(lo, v); hi = Math.max(hi, v); }
    assert.ok(lo >= 0.65 * hi - 1e-9, 'wave depth ≤ 35%');
    assert.ok(peakRate((t) => ST.bulbLevel(i, t, 1, 0, false), 20) <= ST.RULES.bulbHz + 0.05);
  }
  /* moving heads sweep at 0.12 Hz */
  for (let i = 0; i < 4; i++) assert.ok(peakRate((t) => ST.headPose(i, t, 1, 0, false, {}).pan, 60) <= ST.RULES.sweepHz + 0.02);
  const still = ST.headPose(2, 0, 1, 0, true, {}), later = ST.headPose(2, 33, 1, 0, true, {});
  assert.deepEqual(still, later, 'heads hold under reduced motion');
  /* the crowd bob and the speaker pump follow the beat (≤ 1.97 Hz) */
  assert.ok(peakRate((t) => ST.crowdPose(1, F(t), false, {}).y, 20) <= BPM / 60 + 1e-9);
  assert.equal(ST.crowdPose(1, 0.3, true, {}).y, ST.crowdPose(1, 0.8, true, {}).y);
  assert.ok(BPM / 60 <= L.MAX_FLASH_HZ);
});

test('stage flash safety: beam alpha ≤ 0.18 and no full-frame flash anywhere in the acts', () => {
  const K = mockK('MID'), models = ST.factory(K);
  assert.ok(ST.RULES.beamAlpha <= 0.18 && ST.RULES.beamAlpha <= L.LOOK.bld_stage.show.beams.alpha);
  const tpl = build('bld_stage', 'MID', 0, K), beams = partOf(tpl, 'beams');
  const mat = models.bld_stage.material('state', beams);
  assert.ok(mat && mat.key === 'state' && mat.opacity <= 0.18 && mat.blending === 2 && mat.depthWrite === false && mat.transparent, 'additive, alpha ≤ 0.18, a state sibling');
  assert.equal(models.bld_stage.material('state', partOf(tpl, 'lights')), null, 'other parts keep the kit materials');
  assert.equal(models.bld_stage.material('led', partOf(tpl, 'wall')), null);
  /* beam vertex colours never exceed the neon (the material alpha is the cap) */
  const h = handle('sf', tpl);
  models.bld_stage.show(h, 1);
  const act = models.bld_stage.act(h, 'encore');
  play(act, h);
  for (const v of h.geos.beams.getAttribute('color').array) assert.ok(v <= 1 + 1e-9);
  /* local effects only: sounds and particle emits, no screen flash or full-screen white */
  for (const id of IDS) for (const reduced of [false, true]) {
    for (const c of M.cues(ACT[id], { reduced })) {
      if (c.emit) assert.ok(['note', 'star', 'confetti', 'sparkle'].includes(c.emit), id + ' emit ' + c.emit);
    }
  }
  assert.ok(!/flash|fullscreen|full-screen white|\bwhite\(/i.test(SRC.replace(/\/\*[\s\S]*?\*\//g, '')), 'no flash calls in code');
  for (const x of h.halos) assert.ok(x.size <= 1.2, 'halos stay local');
});

test('stage words: no texture text — the sign atlas and banners are never used, the LED name only via the atlas', () => {
  const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const bad of ['signAtlas', 'banner(', 'fillText', 'K-pop', 'idol', 'Hangul']) assert.ok(!code.includes(bad), 'models-stage never uses ' + bad);
  assert.ok(!/[ㄱ-ㆎ가-힣]/.test(SRC), 'no Hangul');
  /* the five-point star is the reward: the mural and the crowd sticks are four-point ✦ */
  assert.ok(!/G\.star\(/.test(code), 'no five-point stars');
  const roof = build('bld_rooftop', 'MID');
  assert.ok(partOf(roof, 'shell').tokens.some((t) => t.token === 'Star Gold'), 'the mural is Star Gold');
});

/* ---------------- pure helpers ---------------- */
test('stage helpers: the LED wall uv frames the atlas window strip by strip', () => {
  const sc = ST.LAYOUT.stage.screen, n = 2 * 2 * sc.strips * 3, pos = new Float32Array(n * 3);
  let v = 0;
  for (let side = 0; side < 2; side++) for (let c = 0; c < sc.strips; c++) {
    const x0 = -sc.x + c * 2 * sc.x / sc.strips, x1 = x0 + 2 * sc.x / sc.strips;
    for (const [x, y] of [[x0, sc.y1], [x0, sc.y0], [x1, sc.y1], [x0, sc.y0], [x1, sc.y0], [x1, sc.y1]]) { pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = sc.z; v++; }
  }
  const meta = ST.wallMeta(pos), uv = new Float32Array(meta.n * 2);
  assert.equal(meta.n, n);
  for (let k = 0; k < n; k++) assert.equal(meta.strip[k], Math.floor(k / 6) % sc.strips, 'strip from the triangle');
  ST.wallUvInto(uv, meta, 'encore', 0.25, 'stars', 0, 1);
  const w = KIT.ledWindow('encore', 0.25);
  for (let k = 0; k < n; k++) {
    assert.ok(uv[k * 2] >= w.ox - 1e-6 && uv[k * 2] <= w.ox + w.rx + 1e-6 && uv[k * 2 + 1] >= w.oy - 1e-6 && uv[k * 2 + 1] <= w.oy + w.ry + 1e-6);
  }
  /* half wiped: the left half shows the new program */
  ST.wallUvInto(uv, meta, 'encore', 0, 'stars', 0, 0.5);
  for (let t = 0; t < n / 3; t++) assert.equal(progTri(uv, t), meta.strip[t * 3] < sc.strips / 2 ? 'encore' : 'stars');
  /* the local window maths matches the kit */
  const out = {};
  for (const p of KIT.LED_PROGRAMS) for (const ph of [0, 0.3, 0.99]) assert.deepEqual(ST.ledWin(p, ph, out), KIT.ledWindow(p, ph));
  assert.equal(ST.progPhase('stars', 7, 0, 0, true), 0, 'frozen under reduced motion');
  assert.ok(ST.progPhase('eq', 0, 3, 0.5, false) > ST.progPhase('eq', 0, 3, 0.1, false), 'the EQ steps with the beat');
});

test('stage helpers: head aim, rotation and the crowd timeline', () => {
  /* the act's centre aim points every beam at centre stage */
  const S = ST.LAYOUT.stage;
  ST.CENTRE.forEach((c, i) => {
    const h = ST.headOrigin(i), out = [0, 0, 0];
    const cp = Math.cos(c.pan * D2R), sp = Math.sin(c.pan * D2R), ct = Math.cos(c.tilt * D2R), st = Math.sin(c.tilt * D2R);
    ST.rotAbout(h[0], h[1] - S.lensDrop - 1, h[2], h, cp, sp, ct, st, out, 0);
    const d = [out[0] - h[0], out[1] - h[1], out[2] - h[2]], t = [S.target[0] - h[0], S.target[1] - h[1] + S.lensDrop, S.target[2] - h[2]];
    const cos = (d[0] * t[0] + d[1] * t[1] + d[2] * t[2]) / Math.hypot(...d) / Math.hypot(...t);
    assert.ok(cos > 0.995, 'head ' + i + ' aims at centre stage');
  });
  const p0 = ST.headPose(1, 3, 0, 1, false, {});
  assert.deepEqual([p0.pan, p0.tilt], [ST.CENTRE[1].pan, ST.CENTRE[1].tilt], 'full act envelope = centre');
  const park = ST.headPose(1, 3, 0, 0, false, {});
  assert.deepEqual([park.pan, park.tilt], [0, ST.RULES.parkTilt], 'parked by day');
  assert.ok(ST.beamVis(0, 0) === 0 && ST.beamVis(0.4, 0) === 0.4 && ST.beamVis(0, 1) === 1);
  /* crowd: rises 0.25 → 0.65 s, holds, sinks over 0.5 s after the hold */
  assert.equal(ST.crowdU(0.1, 0.1, 8, 0), 0);
  assert.equal(ST.crowdU(0.7, 0.7, 8, 0), 1);
  assert.equal(ST.crowdU(null, 5, 8, 1), 1);
  assert.ok(Math.abs(ST.crowdU(null, 8.25, 8, 1) - 0.5) < 1e-9);
  assert.equal(ST.crowdU(null, 9, 8, 1), 0);
  assert.equal(ST.crowdPose(0, 0, false, {}).s, 1e-4, 'hidden = collapsed');
  assert.ok(ST.crowdPose(0.5, 0, false, {}).y < 0 && ST.crowdPose(1, 0.5, false, {}).y >= 0, 'rises out of the pit');
  /* windows and festoon */
  for (let i = 0; i < 4; i++) { assert.equal(ST.windowLevel(i, 4, 1), 1); assert.ok(ST.windowLevel(i, 4, 0) <= 1); }
  assert.equal(ST.festoon().length, 9);
  assert.ok(ST.festoon().every((b, i, a) => i === 0 || b.x > a[i - 1].x));
});
