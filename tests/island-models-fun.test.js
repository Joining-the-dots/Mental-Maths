'use strict';
/* My Island 3D — fun item models (world/island3d/models-fun.js).
   THREE is not available in Node, so the builders run against a mock of the
   K.G kit: every primitive returns surface sample points (with normals) and
   the triangle count three r170 gives after the kit's non-indexed conversion.
   That is enough to check pivots, anchors, materials, colour tokens, budgets
   and the cell margin. Acts and idles run against a mock animation handle. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const FUN = require('../world/island3d/models-fun.js');
const M = require('../world/island3d/motion.js');
const L = require('../world/world-look.js');
const C = require('../world/world-core.js');

/* the garden-fun ids: the city buildings (kind 'fun', cat 'city') live in models-city / models-stage */
const IDS = C.CATALOG.filter((i) => i.kind === 'fun' && i.cat !== 'city').map((i) => i.id).sort();
const TIERS = ['LOW', 'MID', 'HIGH'];
const MARGIN = 0.43;                       /* 0.86 × 0.86 inside the cell */
const D2R = Math.PI / 180;

/* ---------------- mock K.G ---------------- */
const ANG = Array.from({ length: 8 }, (_, i) => i * Math.PI / 4);
/* three's radial vertex angles (x = r·sin θ, z = r·cos θ), so low-sided shapes keep their true corners */
const RAD = (n) => Array.from({ length: n }, (_, i) => i * 2 * Math.PI / n);
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
    const cap = low ? 2 : 3, radial = low ? 8 : 10;
    return mk(pts, (4 * cap + 1) * radial * 2);          /* Lathe of 4·cap + 2 path points */
  };
  G.slab = (w, h, d, radius) => {
    const pts = [];
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) pts.push({ p: [x * w / 2, y * h / 2, z * d / 2], n: unit([x, y, z]) });
    for (let ax = 0; ax < 3; ax++) for (const s of [-1, 1]) { const p = [0, 0, 0], n = [0, 0, 0]; p[ax] = s * [w, h, d][ax] / 2; n[ax] = s; pts.push({ p, n }); }
    const seg = (low ? 1 : 2) * 2 + 1;                    /* RoundedBox: a box of (2·segments + 1)³; radius 0 = a plain box */
    return mk(pts, radius === 0 ? 12 : 12 * seg * seg);
  };
  G.tube = (rTop, rBot, h, o) => {
    if (h === undefined || (h !== null && typeof h === 'object')) { o = h; h = rBot; rBot = rTop; }
    o = o || {};
    const R = o.radial || (low ? 8 : 12), slope = (rBot - rTop) / h, pts = [];
    for (const a of RAD(R)) {
      const n = unit([Math.sin(a), slope, Math.cos(a)]);
      pts.push({ p: [Math.sin(a) * rTop, h / 2, Math.cos(a) * rTop], n }, { p: [Math.sin(a) * rBot, -h / 2, Math.cos(a) * rBot], n });
    }
    if (!o.open) {
      if (rTop > 0) pts.push({ p: [0, h / 2, 0], n: [0, 1, 0] });
      if (rBot > 0) pts.push({ p: [0, -h / 2, 0], n: [0, -1, 0] });
    }
    /* r170 skips the degenerate side triangles at a pointed end, and a cap needs a radius */
    const side = (rTop > 0 ? R : 0) + (rBot > 0 ? R : 0);
    return mk(pts, side + (o.open ? 0 : (rTop > 0 ? R : 0) + (rBot > 0 ? R : 0)));
  };
  G.cone = (r, h, radial) => {
    const R = radial || (low ? 8 : 12), pts = [{ p: [0, h / 2, 0], n: [0, 1, 0] }];
    for (const a of RAD(R)) pts.push({ p: [Math.sin(a) * r, -h / 2, Math.cos(a) * r], n: unit([Math.sin(a), r / h, Math.cos(a)]) });
    return mk(pts, 2 * R);
  };
  G.drop = (r, h, profile) => {
    const prof = Array.isArray(profile) && profile.length >= 2 ? profile : DROP_PROFILE, pts = [];
    prof.forEach((q, j) => {
      const nx = prof[Math.min(j + 1, prof.length - 1)], pv = prof[Math.max(j - 1, 0)];
      const dx = (nx[0] - pv[0]) * r, dy = (nx[1] - pv[1]) * h;   /* three's lathe normal is (dy, -dx) */
      for (const a of ANG) pts.push({ p: [Math.cos(a) * q[0] * r, q[1] * h, Math.sin(a) * q[0] * r], n: unit([Math.cos(a) * dy, -dx, Math.sin(a) * dy]) });
    });
    return mk(pts, (prof.length - 1) * (low ? 7 : 10) * 2);
  };
  G.ring = (R, r) => {                                  /* torus in the XY plane */
    const pts = [];
    for (const a of ANG) {
      const d = [Math.cos(a), Math.sin(a), 0], c = [d[0] * R, d[1] * R, 0];
      pts.push({ p: [c[0] + d[0] * r, c[1] + d[1] * r, 0], n: d }, { p: [c[0] - d[0] * r, c[1] - d[1] * r, 0], n: [-d[0], -d[1], 0] },
        { p: [c[0], c[1], r], n: [0, 0, 1] }, { p: [c[0], c[1], -r], n: [0, 0, -1] });
    }
    return mk(pts, (low ? 5 : 6) * (low ? 12 : 16) * 2);
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
  G.mirror = (geo, axis) => G.t(geo, { s: axis === 'y' ? [1, -1, 1] : axis === 'z' ? [1, 1, -1] : [-1, 1, 1] });
  G.paint = (geo, token, tone) => { geo.tokens.push({ token, tone: tone || 'base' }); return geo; };
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
/* three's detail-0 icosahedron (12 vertices, 20 faces), the kit's ctx.K.THREE source */
function IcosahedronGeometry(r) {
  const t = (1 + Math.sqrt(5)) / 2, v = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]];
  this.pts = v.map((q) => { const n = unit(q); return { p: n.map((c) => c * r), n }; });
  this.tris = 20; this.tokens = [];
}
function mockK(tier) {
  const K = { tier, G: mockG(tier), THREE: { IcosahedronGeometry }, col: rgbOf, hex: (t) => L.hex(t), has: (t) => L.isToken(t) };
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
          name: p.name, mat: p.mat, pivot: p.o.pivot || null, perCopy: !!p.o.perCopy, castShadow: !!p.o.castShadow,
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
function build(id, tier) {
  const K = mockK(tier), models = FUN.factory(K);
  return models[id].build({ id, look: L.LOOK[id], st: {}, stateKey: L.stateKey(id, {}), tier, G: K.G, col: K.col, fp: [1, 1], K });
}
function extents(pts) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const { p } of pts) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], p[i]); hi[i] = Math.max(hi[i], p[i]); }
  return { lo, hi };
}

/* ---------------- mock animation handle ---------------- */
function handle(uid, o = {}) {
  const h = {
    uid, t: o.t || 0, dt: 1 / 60, phase: o.phase != null ? o.phase : 0.37, reduced: !!o.reduced, show: o.show || 0,
    beat: 0, bar: 0, bpm: 100, writes: [], sounds: [], emits: [], states: [], pets: o.pets,
    pivot(name) { return { set: (r, p, s) => h.writes.push({ name, t: h.t, r: r.slice(), p: p.slice(), s: s.slice() }) }; },
    state(k, v) { h.states.push([k, v]); },
    emit(kind, at, n, opts) { h.emits.push({ kind, at: Array.isArray(at) ? at.slice() : at, n, opts: opts ? { ...opts } : opts, t: h.t }); },
    sfx(name, vol, step) { h.sounds.push({ name, vol, step, t: h.t }); }
  };
  if (o.geo) h.copyGeometry = (part) => (part === 'drops' ? o.geo : null);
  return h;
}
/* drive act.update at 60 fps from h.t; stops when the act ends (or at `until`) */
function play(act, h, until) {
  const dt = 1 / 60, t0 = h.t;
  for (let k = 0; k < 2000; k++) {
    const t = k * dt;
    if (until != null && t > until + 1e-9) return { t, alive: true };
    h.t = t0 + t;
    if (!act.update(h, t)) return { t, alive: false };
  }
  throw new Error('act never ended');
}
const last = (h, name) => h.writes.filter((w) => w.name === name).pop();
const isRest = (w) => w && w.r.every((x) => Math.abs(x) < 1e-9) && w.p.every((x) => Math.abs(x) < 1e-9) && w.s.every((x) => Math.abs(x - 1) < 1e-9);
const ACT = { trampoline: 'bounce', fountain: 'splash', swing: 'swing', bubbles: 'bubbles' };

/* ================================================================ */
test('fun models: every CATALOG fun id has a real model (build + act, idle where the look has one)', () => {
  assert.deepEqual(FUN.IDS.slice().sort(), IDS);
  const models = FUN.factory(mockK('MID'));
  assert.deepEqual(Object.keys(models).sort(), IDS);
  for (const id of IDS) {
    const m = models[id], look = L.LOOK[id], it = C.item(id);
    assert.equal(look.kind, 'fun', id);
    assert.equal(typeof m.build, 'function', id + ' build');
    assert.equal(typeof m.act, 'function', id + ' act');
    assert.equal(L.ACT_PIVOT[it.act], look.actPivot, id + ' act pivot matches the catalog act');
    assert.equal(M.actFor(it.act, id), ACT[id], id + ' catalog act → motion act');
    if (look.idle) assert.equal(typeof m.idle, 'function', id + ' idle');
  }
});

test('fun models: the script registers SL3D.defineModels(\'fun\') in the browser', () => {
  const src = fs.readFileSync(path.join(__dirname, '../world/island3d/models-fun.js'), 'utf8');
  const reg = [];
  const box = { SLMotion: M, SLIslandLook: L, SL3D: { defineModels: (cat, f) => reg.push([cat, f]) } };
  box.self = box;
  vm.createContext(box);
  vm.runInContext(src, box);
  assert.equal(reg.length, 1);
  assert.equal(reg[0][0], 'fun');
  const models = reg[0][1](mockK('MID'));
  assert.deepEqual(Object.keys(models).sort(), IDS);
  const tpl = models.swing.build({ id: 'swing', look: L.LOOK.swing, st: {}, stateKey: 'base', tier: 'LOW', G: mockG('LOW'), fp: [1, 1], K: mockK('LOW') });
  assert.ok(tpl.__template && tpl.pivots.swing);
});

test('fun models: templates carry the LOOK pivots, anchors, materials and colour tokens on every tier', () => {
  for (const id of IDS) for (const tier of TIERS) {
    const look = L.LOOK[id], tpl = build(id, tier), tag = id + ' ' + tier;
    for (const pv of look.pivots) assert.ok(tpl.pivots[pv], tag + ' has pivot ' + pv);
    if (look.actPivot) assert.ok(tpl.pivots[look.actPivot], tag + ' has its act pivot');
    for (const an of look.anchors) assert.ok(tpl.anchors[an], tag + ' has anchor ' + an);
    assert.ok(Math.abs(tpl.anchors.top[1] - (look.h + 0.15)) < 1e-9, tag + ' top anchor');
    assert.ok(tpl.parts.length <= 6, tag + ' ≤ 6 parts');
    const staticMats = new Set(tpl.parts.filter((p) => !p.pivot && !p.perCopy).map((p) => p.mat));
    assert.ok(staticMats.size <= 4, tag + ' ≤ 4 static materials');
    /* the model's documented default matcaps (FUN.DEFAULT_MATS) are allowed where the LOOK lists none */
    const dflt = FUN.DEFAULT_MATS[id] || {}, mats = Object.assign({}, dflt, look.mats);
    const allowedTok = new Set(L.tokensIn(look)), allowedMat = new Set(['toon', 'state', ...Object.values(mats)]);
    for (const p of tpl.parts) {
      assert.ok(p.pts.length && p.tris > 0, tag + ' part ' + p.name + ' has geometry');
      assert.ok(allowedMat.has(p.mat), tag + ' ' + p.name + ' uses an allowed material (' + p.mat + ')');
      if (p.pivot) assert.ok(tpl.pivots[p.pivot], tag + ' ' + p.name + ' pivot exists');
      if (p.pivot || p.perCopy) assert.ok(!p.castShadow, tag + ' moving part ' + p.name + ' casts no static shadow');
      assert.equal(!!p.outline, !!look.outline, tag + ' outline follows the look');
      assert.ok(p.tokens.length, tag + ' ' + p.name + ' is painted');
      for (const { token, tone } of p.tokens) {
        assert.ok(L.isToken(token), tag + ' ' + p.name + ': ' + token + ' is a palette token');
        assert.ok(['base', 'shade', 'hi'].includes(tone), tag + ' tone ' + tone);
        if (token === 'Cloud White' && !allowedTok.has(token)) assert.ok(p.mat === 'state' && p.stateColor, tag + ' white paint only under a state colour');
        else assert.ok(allowedTok.has(token), tag + ' ' + p.name + ': ' + token + ' comes from the LOOK entry');
      }
      if (p.stateColor) for (const k of ['off', 'on']) assert.ok(allowedTok.has(p.stateColor[k]), tag + ' state colour ' + p.stateColor[k]);
      for (const [part, m] of Object.entries(mats)) {
        if (p.mat === m) assert.ok(p.tokens.every((t) => t.token === look.colors[part]), tag + ' ' + m + ' parts are the ' + part);
      }
    }
  }
});

test('fun models: the Encore City restyle — LED rim pad, square plaza basin, low-poly tree, FOIL cannon ring', () => {
  for (const tier of TIERS) {
    /* trampoline: the static frame carries the LED Cyan pad on a Gunmetal ring; the mat is Graphite */
    const tr = build('trampoline', tier), frame = tr.parts.find((p) => p.name === 'frame'), mat = tr.parts.find((p) => p.name === 'mat');
    const ft = new Set(frame.tokens.map((t) => t.token));
    assert.ok(ft.has(L.LOOK.trampoline.colors.shine) && ft.has(L.LOOK.trampoline.colors.frame) && ft.has(L.LOOK.trampoline.colors.leg), tier + ' trampoline frame tokens');
    assert.equal(L.hex(L.LOOK.trampoline.colors.shine), L.hex('LED Cyan'));
    assert.ok(mat.tokens.every((t) => t.token === L.LOOK.trampoline.colors.mat));
    /* fountain: a square basin — its corners reach the margin on both diagonals */
    const fo = build('fountain', tier), basin = fo.parts.find((p) => p.name === 'basin').pts.map((q) => q.p);
    const corner = Math.max(...basin.map((p) => Math.min(Math.abs(p[0]), Math.abs(p[2]))));
    assert.ok(corner >= FUN.LAYOUT.fountain.half - 1e-9, tier + ' square basin corners ' + corner.toFixed(3));
    /* swing: faceted 20-face leaf clusters on a trunk, the Teak seat on the 'swing' pivot */
    const sw = build('swing', tier);
    const leafTris = sw.parts.find((p) => p.name === 'frame').geos.filter((g) => g.tris === 20).length;
    assert.equal(leafTris, FUN.LAYOUT.swing.leaves.length, tier + ' low-poly leaf clusters');
    assert.ok(sw.parts.find((p) => p.name === 'swing').tokens.some((t) => t.token === L.LOOK.swing.colors.seat));
    /* bubbles: the ring is the FOIL matcap at the cannon's mouth, on the emitter */
    const bu = build('bubbles', tier), ring = bu.parts.find((p) => p.name === 'ring');
    assert.ok(ring && ring.mat === 'foil' && ring.pivot === 'emitter');
  }
});

test('fun models: triangle budgets (LOOK tris on MID/HIGH, ≥ 20% cheaper on LOW)', () => {
  for (const id of IDS) {
    const budget = L.LOOK[id].tris, t = {};
    for (const tier of TIERS) t[tier] = build(id, tier).tris;
    assert.ok(t.MID <= budget && t.HIGH <= budget, `${id}: ${t.MID} / ${t.HIGH} tris ≤ ${budget}`);
    assert.ok(t.LOW < t.MID && t.LOW <= 0.8 * budget, `${id}: LOW ${t.LOW} tris`);
  }
});

test('fun models: rest pose sits on the ground, inside the cell margin, at the look height', () => {
  for (const id of IDS) for (const tier of TIERS) {
    const look = L.LOOK[id], tpl = build(id, tier), e = extents(tpl.parts.flatMap((p) => p.pts)), tag = id + ' ' + tier;
    assert.ok(e.lo[1] >= -0.025, `${tag}: base y ${e.lo[1].toFixed(3)}`);
    for (const i of [0, 2]) assert.ok(Math.max(-e.lo[i], e.hi[i]) <= MARGIN + 0.002, `${tag}: ${'xyz'[i]} extent ${Math.max(-e.lo[i], e.hi[i]).toFixed(3)}`);
    assert.ok(e.hi[1] >= look.h * 0.9 && e.hi[1] <= look.h * 1.1, `${tag}: height ${e.hi[1].toFixed(3)} vs ${look.h}`);
  }
});

test('fun models: the fountain drops are one per-copy part of 12 equal drops laid on the rest arcs', () => {
  for (const tier of TIERS) {
    const drops = build('fountain', tier).parts.find((p) => p.name === 'drops');
    assert.ok(drops && drops.perCopy && !drops.pivot && drops.mat === 'state');
    assert.equal(drops.geos.length, FUN.LAYOUT.fountain.drops);
    const per = drops.geos[0].tris;
    assert.ok(drops.geos.every((g) => g.tris === per), 'equal vertex blocks (the CPU update relies on it)');
    drops.geos.forEach((g, i) => {
      const e = extents(g.pts), c = [(e.lo[0] + e.hi[0]) / 2, (e.lo[2] + e.hi[2]) / 2], r = FUN.DROP_REST[i];
      assert.ok(Math.abs(c[0] - r.x) < 1e-6 && Math.abs(c[1] - r.z) < 1e-6 && e.lo[1] < r.y && e.hi[1] > r.y, 'drop ' + i + ' sits on its rest point');
    });
  }
});

/* ---------------- pure helpers ---------------- */
test('fun helpers: pendulum, ripple, bubbler, mat dip, wand point and lead parsing', () => {
  for (let t = 0; t < 5; t += 0.05) {
    assert.ok(Math.abs(FUN.pendulum(t, 4, 2.4, 0.3, false)) <= 4 + 1e-9);
    const s = FUN.rippleScale(t, 2.4, 0.3, false);
    assert.ok(s >= 1 && s < 1 / FUN.LAYOUT.fountain.ripK + 1e-9);
    const b = FUN.bubblerScale(t, 1, 0.3, false);
    assert.ok(b >= 1 - FUN.LAYOUT.fountain.bob - 1e-9 && b <= 1 + FUN.LAYOUT.fountain.bob + 1e-9);
  }
  assert.ok(Math.abs(FUN.pendulum(0.6, 4, 2.4, 0, false) - 4) < 1e-9, 'peaks a quarter period in');
  assert.equal(FUN.pendulum(1.3, 4, 2.4, 0.2, true), 0);
  assert.equal(FUN.rippleScale(1.3, 2.4, 0.2, true), 1);
  assert.equal(FUN.bubblerScale(1.3, 2, 0.2, true), 1);
  /* square B at the end of a period lands exactly where square A starts: a seamless loop */
  const F = FUN.LAYOUT.fountain;
  assert.ok(Math.abs(F.ripHalf * F.ripK * (1 / F.ripK) - F.ripHalf) < 1e-12);
  assert.ok(F.ripHalf / F.ripK - F.ripW / F.ripK / 2 >= F.poolHalf, 'square A ends hidden under the walls');
  assert.ok(F.ripHalf / F.ripK + F.ripW / F.ripK / 2 <= F.half, '… and never pokes out of the basin');
  assert.ok(Math.abs(F.poolHalf - (F.half - F.wall)) < 1e-9, 'the water meets the walls');
  assert.ok(F.half <= MARGIN, 'the basin stays inside the cell');
  assert.ok(F.plinthY1 + F.capH < F.jets[0].p[1] + 1e-9 && F.jets[0].p[1] + F.jets[0].h <= F.spoutY + 1e-9, 'the centre jet stands on the nozzle plate');
  /* the mat: rest depth at no dip, the full 0.12 dip deepens the bowl to 0.136 */
  assert.equal(FUN.matScaleY(0), 1);
  assert.ok(Math.abs(FUN.matScaleY(-0.12) * FUN.LAYOUT.trampoline.depth - (FUN.LAYOUT.trampoline.depth + 0.12)) < 1e-9);
  /* the wand: 0° is the ring centre; a turn keeps its distance from the arm base */
  const B = FUN.LAYOUT.bubbles, w0 = FUN.wandPoint(0), w9 = FUN.wandPoint(12);
  assert.deepEqual(w0.map((v) => +v.toFixed(9)), B.ring.map((v) => +v.toFixed(9)));
  const d = (p) => Math.hypot(p[0] - B.armBase[0], p[1] - B.armBase[1]);
  assert.ok(Math.abs(d(w0) - d(w9)) < 1e-9 && w9[0] < w0[0], 'turning +12° swings the ring left');
  /* perform's answer → lead */
  assert.equal(FUN.leadOf(undefined), -1);
  assert.equal(FUN.leadOf(false), -1);
  assert.equal(FUN.leadOf(-1), -1);
  assert.equal(FUN.leadOf(0.7), 0.7);
  assert.equal(FUN.leadOf(5), 1.2);
  assert.equal(FUN.leadOf({ lead: 0.4 }), 0.4);
  assert.equal(FUN.leadOf({ dur: 0.9 }), 0.9);
  assert.equal(FUN.leadOf(true), 1.2);
  assert.equal(FUN.leadOf({}), 1.2);
  assert.equal(FUN.leadOf(NaN), 1.2);
});

test('fun helpers: drop arcs leave the spout, stay in the cell and land in the lower pool', () => {
  const F = FUN.LAYOUT.fountain, out = {};
  /* the rest layout is the live arc frozen at t = restT·period with phase 0 */
  for (let i = 0; i < F.drops; i++) {
    FUN.dropPose(F.restT * F.period, i, 0, false, out);
    const r = FUN.DROP_REST[i];
    assert.ok(Math.abs(out.x - r.x) < 1e-9 && Math.abs(out.y - r.y) < 1e-9 && Math.abs(out.z - r.z) < 1e-9, 'rest drop ' + i);
    FUN.dropPose(3.3, i, 0.5, true, out);
    assert.ok(out.x === r.x && out.y === r.y && out.s === 1, 'reduced = rest');
  }
  let peak = 0;
  for (let t = 0; t < 2; t += 0.01) for (let i = 0; i < F.drops; i++) {
    FUN.dropPose(t, i, 0.81, false, out);
    const rr = Math.hypot(out.x, out.z), p = rr / F.reach;
    assert.ok(rr <= F.reach + 1e-9 && rr < F.poolHalf, 'inside the square pool');
    assert.ok(out.s >= 0 && out.s <= 1);
    assert.ok(out.y >= F.landY - 1e-9 && out.y <= F.spoutY + F.arc, 'between the pool and the arc top');
    assert.ok(out.y > F.poolY, 'above the water');
    if (p > 0.5) assert.ok(rr > F.capHalf * Math.SQRT2 + 0.01 || out.y > F.plinthY1 + F.capH, 'clears the nozzle plate');
    peak = Math.max(peak, out.y);
  }
  assert.ok(peak > F.spoutY + 0.1 && peak + F.dropUp <= L.LOOK.fountain.h * 1.05, 'the arc rises above the spout and stays near the look height');
  /* the end of each arc is in the pool, and the start is the spout */
  FUN.arcPoint(1, 0.4, out);
  assert.ok(Math.abs(out.y - F.landY) < 1e-12 && Math.abs(Math.hypot(out.x, out.z) - F.reach) < 1e-12);
  FUN.arcPoint(0, 0.4, out);
  assert.ok(Math.abs(out.y - F.spoutY) < 1e-12 && out.x === 0);
});

test('fun helpers: idle bubbles grow from the wand ring, rise and pop; reduced holds the rest bubbles', () => {
  const B = FUN.LAYOUT.bubbles, out = {};
  let seen = 0;
  for (let t = 0; t < 8; t += 0.02) for (const k of [0, 1]) {
    FUN.bubblePose(t, k, 2, 0.25, false, out);
    assert.ok(out.s >= 0 && out.s < 2);
    if (out.s > 0) {
      seen++;
      const y = B.rest[k].p[1] + out.y;
      assert.ok(y >= B.ring[1] - 1e-9 && y <= B.ring[1] + 1.5, 'between the ring and 1.5 u above it');
    }
  }
  assert.ok(seen > 100, 'bubbles are out most of the time');
  FUN.bubblePose(1, 0, 2, 0.25, true, out);
  assert.deepEqual([out.x, out.y, out.z, out.s], [0, 0, 0, 1]);
});

/* ---------------- acts ---------------- */
test('fun acts: durations, sounds and emits follow SLMotion; every act ends at its rest pose', () => {
  for (const reduced of [false, true]) {
    const models = FUN.factory(mockK('MID'));
    for (const id of IDS) {
      const name = ACT[id], h = handle(id + '#1', { reduced }), act = models[id].act(h, C.item(id).act);
      const o = id === 'trampoline' ? { reduced: true } : { reduced };      /* no pet: the solo boing */
      assert.ok(act && typeof act.update === 'function' && typeof act.cancel === 'function', id);
      assert.equal(act.dur, M.durOf(name, o), id + ' dur');
      assert.ok(act.dur <= (id === 'swing' ? 4 : 3), id + ' ≤ 3 s (swing decay 4 s)');
      const end = play(act, h);
      assert.ok(end.t >= act.dur - 1e-9 && end.t < act.dur + 1 / 60 + 1e-9, id + ' ends on time');
      const cues = M.cues(name, o);
      assert.deepEqual(h.sounds.map((s) => [s.name, s.step]), cues.filter((c) => c.sfx).map((c) => [c.sfx, c.step]), id + ' sounds');
      const emits = cues.filter((c) => c.emit);
      assert.deepEqual(h.emits.map((e) => [e.kind, e.n]), emits.map((c) => [c.emit, c.n]), id + ' emits');
      const piv = L.LOOK[id].actPivot, w = last(h, piv);
      assert.ok(w, id + ' drives its act pivot ' + piv);
      if (id === 'swing') assert.ok(Math.abs(w.r[0] - FUN.pendulum(h.t, 4, 2.4, h.phase, reduced)) < 1e-9, 'swing hands back to the idle');
      else if (id === 'fountain') assert.ok(Math.abs(w.s[1] - FUN.bubblerScale(h.t, 0, h.phase, reduced)) < 1e-9, 'jets back to the bubblers');
      else assert.ok(isRest(w), id + ' rest');
      assert.equal(act.update(h, end.t + 0.1), false, id + ' stays ended');
    }
  }
});

test('fun acts: the bubble machine blows 24 PEARL bubbles from the wand ring (6 under reduced motion)', () => {
  for (const reduced of [false, true]) {
    const h = handle('bub', { reduced }), act = FUN.factory(mockK('MID')).bubbles.act(h, 'bubbles');
    play(act, h);
    const total = h.emits.reduce((a, e) => a + e.n, 0);
    assert.equal(total, reduced ? 6 : 24);
    const B = FUN.LAYOUT.bubbles;
    for (const e of h.emits) {
      assert.equal(e.kind, 'bubble');
      assert.ok(e.opts && e.opts.pearl === true && Number.isInteger(e.opts.seed));
      assert.ok(Array.isArray(e.at) && Math.hypot(e.at[0] - B.ring[0], e.at[1] - B.ring[1]) < 0.12, 'from the ring');
    }
    assert.ok(h.sounds.filter((s) => s.name === 'pop').length <= 6, 'at most 6 audible pops');
    if (!reduced) {
      const rots = h.writes.filter((w) => w.name === 'emitter').map((w) => Math.abs(w.r[2]));
      assert.ok(Math.max(...rots) > 5, 'the wand waves');
    }
  }
});

test('fun acts: the trampoline asks the pet, waits for its run-over and dips the mat at each contact', () => {
  const calls = [];
  const pets = { active: () => true, perform: (kind, uid) => { calls.push([kind, uid]); return 0.8; } };
  const h = handle('tr1', { pets }), act = FUN.factory(mockK('MID')).trampoline.act(h, 'bounce');
  assert.deepEqual(calls, [['trampoline', 'tr1']]);
  assert.ok(Math.abs(act.dur - (0.8 + M.BOUNCE.length)) < 1e-9 && act.dur <= 3);
  play(act, h);
  const boings = h.sounds.filter((s) => s.name === 'boing');
  assert.equal(boings.length, 3);
  assert.ok(Math.abs(boings[0].t - 0.8) < 1 / 60 + 1e-9, 'first boing when the pet lands');
  assert.deepEqual(h.sounds.filter((s) => s.name === 'combo').map((s) => s.step), [0, 2, 4]);
  const ys = h.writes.filter((w) => w.name === 'mat').map((w) => w.s[1]);
  assert.ok(Math.max(...ys) > 4, 'the mat dips deep');
  assert.ok(h.writes.filter((w) => w.name === 'mat' && w.t < 0.8 - 1e-6).every(isRest), 'no dip before the pet arrives');
  /* no active pet, a pet that says no, and reduced motion: one solo boing, the pet is not asked */
  for (const [o, asked] of [[{ pets: { active: () => false, perform: () => 1 } }, false], [{ pets: { perform: () => null } }, true], [{ reduced: true, pets }, false], [{}, false]]) {
    calls.length = 0;
    const h2 = handle('tr2', o), a2 = FUN.factory(mockK('MID')).trampoline.act(h2, 'bounce');
    assert.equal(a2.dur, M.durOf('bounce', { reduced: true }));
    play(a2, h2);
    assert.deepEqual(h2.sounds.map((s) => s.name), ['boing']);
    if (!asked) assert.equal(calls.length, 0);
  }
});

test('fun acts: a re-tap restarts without stacking and carries on from the interrupted pose', () => {
  const models = FUN.factory(mockK('MID'));
  for (const id of IDS) {
    const piv = L.LOOK[id].actPivot, pets = { perform: () => 0.5 };
    const h = handle(id + '#r', { pets }), a1 = models[id].act(h, C.item(id).act);
    const mid = id === 'trampoline' ? 0.55 : id === 'bubbles' ? 0.3 : 0.9;
    play(a1, h, mid);
    const before = last(h, piv), nSounds = h.sounds.length;
    const a2 = models[id].act(h, C.item(id).act);
    assert.equal(a1.update(h, mid + 0.02), false, id + ': the interrupted act is dead');
    assert.equal(h.sounds.length, nSounds, id + ': and it fires nothing more');
    a2.update(h, 0);
    const after = last(h, piv);
    const gap = Math.max(...[0, 1, 2].map((i) => Math.abs(after.r[i] - before.r[i])), ...[0, 1, 2].map((i) => Math.abs(after.s[i] - before.s[i])));
    assert.ok(gap < 0.35, `${id}: restart continues from the pose (gap ${gap.toFixed(3)})`);
    play(a2, h);
  }
});

test('fun acts: cancel stops the act and rests its pivot; acts on different copies are independent', () => {
  const models = FUN.factory(mockK('MID'));
  for (const id of ['trampoline', 'fountain', 'bubbles', 'swing']) {
    const piv = L.LOOK[id].actPivot, h = handle(id + '#c', { pets: { perform: () => 0 } }), act = models[id].act(h, C.item(id).act);
    play(act, h, 0.4);
    act.cancel();
    assert.ok(isRest(last(h, piv)), id + ' rests on cancel');
    assert.equal(act.update(h, 0.5), false);
    act.cancel();                                  /* a second cancel is harmless */
  }
  const ha = handle('A'), hb = handle('B'), aa = models.swing.act(ha, 'swing'), ab = models.swing.act(hb, 'swing');
  play(aa, ha, 0.5);
  assert.equal(ab.update(hb, 0.5), true, 'another copy keeps swinging');
});

/* ---------------- idles ---------------- */
test('fun idles: swing pendulum, fountain bubblers + ripple, bubble machine bubbles; reduced motion holds the rest pose', () => {
  const models = FUN.factory(mockK('MID'));
  /* swing */
  let h = handle('sw');
  for (let t = 0; t < 3; t += 0.1) { h.t = t; assert.equal(models.swing.idle(h), true); }
  const angles = h.writes.filter((w) => w.name === 'swing').map((w) => w.r[0]);
  assert.ok(Math.max(...angles) > 3 && Math.min(...angles) < -3 && angles.every((a) => Math.abs(a) <= 4 + 1e-9));
  /* the live act owns the seat: the idle writes nothing meanwhile */
  const act = models.swing.act(h, 'swing');
  const n = h.writes.length;
  h.t += 0.1;
  models.swing.idle(h);
  assert.equal(h.writes.length, n);
  play(act, h);
  /* fountain */
  h = handle('fo');
  for (let t = 0; t < 3; t += 0.1) { h.t = t; models.fountain.idle(h); }
  const rip = h.writes.filter((w) => w.name === 'ripple');
  assert.ok(rip.length && rip.every((w) => w.s[0] >= 1 && w.s[0] < 2 && w.s[1] === 1));
  for (const pv of ['water', 'jetL', 'jetR']) {
    const ws = h.writes.filter((w) => w.name === pv);
    assert.ok(ws.length && ws.every((w) => Math.abs(w.s[1] - 1) <= FUN.LAYOUT.fountain.bob + 1e-9), pv + ' breathes');
  }
  /* bubble machine */
  h = handle('bm');
  for (let t = 0; t < 6; t += 0.1) { h.t = t; models.bubbles.idle(h); }
  const bub = h.writes.filter((w) => w.name === 'bubA' || w.name === 'bubB');
  assert.ok(bub.some((w) => w.s[0] > 0.5) && bub.some((w) => w.s[0] === 0), 'bubbles come and go');
  /* reduced motion: one rest write per copy, then nothing to animate */
  for (const id of ['swing', 'fountain', 'bubbles']) {
    const hr = handle(id + '#red', { reduced: true });
    assert.equal(models[id].idle(hr), true);
    const first = hr.writes.length;
    assert.ok(first > 0 && hr.writes.every(isRest), id + ' rest pose');
    hr.t = 2;
    assert.equal(models[id].idle(hr), false);
    assert.equal(hr.writes.length, first, id + ' writes nothing more');
  }
});

test('fun idles: fountain drops move on the copy geometry and take neon tints at Showtime', () => {
  const F = FUN.LAYOUT.fountain, per = 48, n = F.drops * per;
  /* a copy geometry like the kit's: 12 equal blocks around the rest points */
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3).fill(0.5);
  for (let i = 0; i < F.drops; i++) for (let v = 0; v < per; v++) {
    const o = (i * per + v) * 3, r = FUN.DROP_REST[i];
    pos[o] = r.x + (v % 3 - 1) * 0.01; pos[o + 1] = r.y + (v % 2 ? 0.03 : -0.02); pos[o + 2] = r.z;
  }
  const rest = pos.slice();
  const attrs = { position: { array: pos, needsUpdate: false }, color: { array: col, needsUpdate: false } };
  const geo = { getAttribute: (k) => attrs[k] || null };
  const models = FUN.factory(mockK('MID'));
  const h = handle('fd', { geo, phase: 0.2 });
  h.t = 0.33;
  models.fountain.idle(h);
  assert.ok(attrs.position.needsUpdate, 'positions uploaded');
  const out = {};
  for (let i = 0; i < F.drops; i++) {
    FUN.dropPose(h.t, i, h.phase, false, out);
    const o = i * per * 3, r = FUN.DROP_REST[i];
    assert.ok(Math.abs(pos[o] - (out.x + (rest[o] - r.x) * out.s)) < 1e-5 && Math.abs(pos[o + 1] - (out.y + (rest[o + 1] - r.y) * out.s)) < 1e-5, 'drop ' + i + ' placed');
  }
  /* the same clock tick twice (idle + act in one frame) does the work once */
  attrs.position.needsUpdate = false;
  models.fountain.idle(h);
  assert.equal(attrs.position.needsUpdate, false);
  /* Showtime: the show handler sets the jets' state colour and tints each stream */
  models.fountain.show(h, 1);
  assert.deepEqual(h.states.pop(), ['show', 1]);
  assert.ok(attrs.color.needsUpdate);
  const neon = L.LOOK.fountain.show.neon;
  for (let i = 0; i < F.drops; i++) {
    const c = rgbOf(neon[i % F.streams]), o = i * per * 3;
    assert.ok(Math.abs(col[o] - c.r) < 1e-6 && Math.abs(col[o + 1] - c.g) < 1e-6 && Math.abs(col[o + 2] - c.b) < 1e-6, 'drop ' + i + ' neon');
  }
  models.fountain.show(h, 0);
  const w = rgbOf(L.LOOK.fountain.colors.drop);
  assert.ok(Math.abs(col[0] - w.r) < 1e-6 && Math.abs(col[2] - w.b) < 1e-6, 'back to water by day');
  /* reduced motion puts the drops back on their rest arcs */
  const hr = handle('fd', { geo, reduced: true });
  hr.t = 1;
  models.fountain.idle(hr);
  assert.deepEqual(Array.from(pos), Array.from(rest));
});

test('fun idles: the fountain follows a.show by itself, writing the jets\' state only when the mix moves', () => {
  const models = FUN.factory(mockK('MID')), h = handle('fs');
  for (let i = 0; i < 5; i++) { h.t = i * 0.1; models.fountain.idle(h); }
  assert.deepEqual(h.states, [['show', 0]]);
  for (let i = 0; i <= 10; i++) { h.t = 1 + i * 0.1; h.show = i / 10; models.fountain.idle(h); }
  assert.equal(h.states.length, 11);
  assert.deepEqual(h.states[h.states.length - 1], ['show', 1]);
  h.t = 3; models.fountain.idle(h);
  assert.equal(h.states.length, 11, 'a steady mix writes nothing');
});

test('fun idles: nothing in the fun idles cycles faster than 2 Hz', () => {
  const F = FUN.LAYOUT.fountain;
  const rate = (fn, T = 12, dt = 1 / 240) => {
    let peaks = 0, a = fn(0), b = fn(dt);
    for (let t = 2 * dt; t < T; t += dt) { const c = fn(t); if (b > a && b >= c) peaks++; a = b; b = c; }
    return peaks / T;
  };
  assert.ok(rate((t) => FUN.pendulum(t, 4, 2.4, 0, false)) <= 2);
  assert.ok(rate((t) => FUN.bubblerScale(t, 0, 0, false)) <= 2);
  assert.ok(1 / F.ripPeriod <= 2 && 1 / F.period <= 2);
});
