/* node --test tests/   (Node 22+)
   My Island 3D garden models (world/island3d/models-garden.js): catalogue
   coverage, browser registration, layout margins, the pure animation and path
   helpers, every builder against a mock of the K.G kit (Encore City v2: budgets,
   pivots, tokens, materials, margins, heights) and the idle/act/show handlers
   driven through a fake animation handle. THREE is not available in Node: the
   mock kit returns surface sample points (with normals) and the triangle count
   three r170 gives after the kit's non-indexed conversion. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const C = require('../world/world-core.js');
const L = require('../world/world-look.js');
const M = require('../world/island3d/motion.js');
const GARDEN = require('../world/island3d/models-garden.js');

const SRC_PATH = path.join(__dirname, '..', 'world', 'island3d', 'models-garden.js');
const SRC = fs.readFileSync(SRC_PATH, 'utf8');
const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= (eps || 1e-9), (msg || '') + ' ' + a + ' vs ' + b);
const TIERS = ['LOW', 'MID', 'HIGH'];
const PATHS = ['path_stone', 'path_wood', 'path_flower'];
const PIECES = ['p:single', 'p:end', 'p:straight', 'p:corner', 'p:tee', 'p:cross'];

/* the models, built once with the look table visible */
globalThis.SLIslandLook = L;
const MODELS = GARDEN.factory({});

/* a fake animation handle that records every call */
function handle(o) {
  const log = { pivots: {}, states: {}, halo: [], decal: [], sfx: [], emit: [] };
  const a = Object.assign({
    uid: 'u-' + Math.random(), t: 10, dt: 1 / 60, phase: 0.3, reduced: false, beat: 0, show: 0, music: true,
    pivot: (name) => ({ set: (r, p, s) => { log.pivots[name] = { r: r.slice(), p: p.slice(), s: s.slice() }; } }),
    state: (k, v) => { log.states[k] = v; },
    halo: (...x) => log.halo.push(x), decal: (...x) => log.decal.push(x),
    sfx: (...x) => log.sfx.push(x), emit: (...x) => log.emit.push(x)
  }, o || {});
  a.log = log;
  return a;
}
function runToEnd(act, a, step) {
  let t = 0, alive = true;
  while (alive && t < 10) { a.t = 100 + t; alive = act.update(a, t); t += step || 1 / 60; }
  return t;
}

/* ---------------- mock K.G (sample points + r170 triangle counts) ---------------- */
const D2R = Math.PI / 180;
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
  G.slab = (w, h, d, radius) => {
    const pts = [];
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) pts.push({ p: [x * w / 2, y * h / 2, z * d / 2], n: unit([x, y, z]) });
    for (let ax = 0; ax < 3; ax++) for (const s of [-1, 1]) { const p = [0, 0, 0], n = [0, 0, 0]; p[ax] = s * [w, h, d][ax] / 2; n[ax] = s; pts.push({ p, n }); }
    const seg = (low ? 1 : 2) * 2 + 1;                    /* RoundedBox: a box of (2·segments + 1)³ */
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
      const dx = (nx[0] - pv[0]) * r, dy = (nx[1] - pv[1]) * h;
      for (const a of RAD(low ? 7 : 10)) pts.push({ p: [Math.sin(a) * q[0] * r, q[1] * h, Math.cos(a) * q[0] * r], n: unit([Math.sin(a) * dy, -dx, Math.cos(a) * dy]) });
    });
    return mk(pts, (prof.length - 1) * (low ? 7 : 10) * 2);
  };
  G.ring = (R, r) => {
    const pts = [];
    for (const a of ANG) {
      const d = [Math.cos(a), Math.sin(a), 0], c = [d[0] * R, d[1] * R, 0];
      pts.push({ p: [c[0] + d[0] * r, c[1] + d[1] * r, 0], n: d }, { p: [c[0] - d[0] * r, c[1] - d[1] * r, 0], n: [-d[0], -d[1], 0] },
        { p: [c[0], c[1], r], n: [0, 0, 1] }, { p: [c[0], c[1], -r], n: [0, 0, -1] });
    }
    return mk(pts, (low ? 5 : 6) * (low ? 12 : 16) * 2);
  };
  G.flag = (w, h, sx, sy) => {
    const pts = [];
    for (let i = 0; i <= (sx || 8); i++) for (const y of [-h / 2, h / 2]) pts.push({ p: [w * i / (sx || 8), y, 0], n: [0, 0, 1] }, { p: [w * i / (sx || 8), y, 0], n: [0, 0, -1] });
    return mk(pts, 4 * (sx || 8) * (sy || 1));
  };
  G.ribbon = (points, r, o) => {
    const pts = [];
    points.forEach((p) => { for (const a of ANG) pts.push({ p: [p[0], p[1] + Math.cos(a) * r, p[2] + Math.sin(a) * r], n: [0, Math.cos(a), Math.sin(a)] }); });
    const seg = (o && o.segments) || Math.max(6, Math.round(points.length * (low ? 4 : 6)));
    return mk(pts, seg * 4 * 2);
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
  G.paint = (geo, token, tone) => { geo.tokens.push({ token, tone: typeof tone === 'string' ? tone : 'base' }); return geo; };
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
/* three's detail-0 icosahedron (12 vertices, 20 faces), the kit's ctx.K.THREE source */
function IcosahedronGeometry(r) {
  const t = (1 + Math.sqrt(5)) / 2, v = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]];
  this.pts = v.map((q) => { const n = unit(q); return { p: n.map((c) => c * r), n }; });
  this.tris = 20; this.tokens = [];
}
function mockK(tier) {
  const K = { tier, G: mockG(tier), THREE: { IcosahedronGeometry }, col: (t) => t };
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
          stateColor: p.o.stateColor || null, tris: p.geos.reduce((a, g) => a + g.tris, 0), pts: p.geos.flatMap((g) => g.pts),
          tokens: p.geos.flatMap((g) => g.tokens)
        }));
        return { __template: true, id: ctx.id, stateKey: ctx.stateKey, tier: ctx.tier, parts: ps, pivots, anchors, tris: ps.reduce((a, p) => a + p.tris, 0) };
      }
    };
    return b;
  };
  return K;
}
const BUILT = new Map();
function build(id, tier, stateKey) {
  const k = id + '#' + tier + '#' + (stateKey || 'base');
  if (BUILT.has(k)) return BUILT.get(k);
  const K = mockK(tier), models = GARDEN.factory(K);
  const tpl = models[id].build({ id, look: L.LOOK[id], st: {}, stateKey: stateKey || 'base', tier, G: K.G, fp: [1, 1], K });
  BUILT.set(k, tpl);
  return tpl;
}
/* the rest pose: Showtime-only parts collapsed into their pivots stay where they are authored */
function points(tpl) { return tpl.parts.flatMap((p) => p.pts.map((q) => q.p)); }

/* ---------------- coverage and registration ---------------- */
test('covers exactly the garden / lights / flags / paths catalogue ids', () => {
  const want = C.CATALOG.filter((it) => it.kind === 'decor' || it.kind === 'path').map((it) => it.id).sort();
  assert.deepEqual(GARDEN.IDS.slice().sort(), want);
  assert.equal(GARDEN.IDS.length, 23);
  assert.deepEqual(Object.keys(MODELS).sort(), want);
  GARDEN.IDS.forEach((id) => {
    assert.ok(L.LOOK[id], 'LOOK entry for ' + id);
    ['build', 'idle', 'act', 'show'].forEach((k) => assert.equal(typeof MODELS[id][k], 'function', id + '.' + k));
  });
});

test('registers itself with SL3D.defineModels("garden") in a browser-like context', () => {
  const calls = [];
  const self = { SL3D: { defineModels: (cat, f) => calls.push([cat, f]) } };
  vm.runInNewContext(SRC, { self: self });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'garden');
  assert.equal(typeof calls[0][1], 'function');
  assert.equal(typeof self.SLModelsGarden.factory, 'function');
  assert.equal(typeof self.SLModelsGarden.pathPose, 'function', 'the controller reaches the path helpers through the global');
  /* and stays quiet when the stage is not there */
  assert.doesNotThrow(() => vm.runInNewContext(SRC, { self: {} }));
});

test('colours come only from tokens; THREE only through K; v2 neon set', () => {
  assert.equal(/#[0-9a-f]{6}\b/i.test(SRC), false, 'no raw hex colours');
  const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.equal(/(^|[^.\w$])THREE\b/.test(code), false, 'never the THREE global (only ctx.K.THREE)');
  assert.equal(/window\./.test(code), false, 'never touches window');
  GARDEN.EXTRA_TOKENS.forEach((t) => assert.ok(L.isToken(t), 'token ' + t));
  L.NEON4.forEach((t) => assert.ok(GARDEN.EXTRA_TOKENS.includes(t), 'v2 neon ' + t));
});

/* ---------------- layout: heights, margins, overhang rule ---------------- */
test('flower patches, mushrooms and decor stay inside the 0.86 cell fit', () => {
  const F = GARDEN.FIT;
  near(F, 0.43, 1e-12);
  GARDEN.TULIPS.forEach((f) => assert.ok(Math.abs(f.x) + 0.06 <= F && Math.abs(f.z) + 0.06 <= F));
  GARDEN.DAISIES.forEach((d) => assert.ok(Math.abs(d.x) + 0.065 <= F && Math.abs(d.z) + 0.065 <= F));
  GARDEN.SUNFLOWERS.forEach((s) => assert.ok(Math.abs(s.x) + 0.15 <= F));
  GARDEN.SHROOMS.forEach((m) => assert.ok(Math.abs(m.x) + m.r <= F && Math.abs(m.z) + m.r <= F));
  assert.ok(GARDEN.FLAG.x0 + GARDEN.FLAG.w <= F + 1e-9, 'the flag cloth ends inside the cell');
  assert.ok(Math.abs(GARDEN.FLAG.poleX) + GARDEN.FLAG.poleR <= F);
  assert.ok(GARDEN.FLAG.top - GARDEN.FLAG.h >= 1.0, 'the cloth flies above the 1.0 u overhang line');
  assert.ok(GARDEN.BUNT.postX + 0.045 <= F);
  /* the slim bollard: a 1.4 u stack, the frosted head between its fins */
  const Ln = GARDEN.LANTERN;
  near(Ln.top, L.LOOK.lantern.h, 1e-9, 'bollard height');
  assert.ok(Ln.post[0] < 0.1 && Ln.head[0] < 0.2, 'slim');
  assert.ok(Ln.base[0] / 2 <= F && Ln.cap[0] / 2 <= F);
  assert.ok(GARDEN.BENCH.len / 2 <= F, 'bench inside the cell');
});

test('trees: faceted clusters crown at the LOOK height and only overhang above y 1.0', () => {
  const CL = GARDEN.CANOPY.clusters, F = GARDEN.FIT;
  assert.ok(CL.length >= 3 && CL.length <= 5, '3–5 clusters');
  near(Math.max(...CL.map((c) => c.c[1] + c.r)), L.LOOK.tree_oak.h, 1e-9, 'oak / blossom top');
  CL.forEach((cl) => {
    assert.ok(GARDEN.clusterReach(cl) <= 0.55 + 1e-9, 'within the 1.1 u canopy overhang');
    if (GARDEN.clusterReach(cl) > F) assert.ok(GARDEN.clusterBelt(cl) >= 1.0, 'a cluster wider than the cell keeps its belt above 1.0');
    assert.ok(cl.c[1] - cl.r > GARDEN.CANOPY.trunk.h - 0.1, 'clusters sit on the trunk top');
  });
  GARDEN.applePositions().forEach((p) => { assert.ok(Math.abs(p[0]) <= 0.55 && p[1] > 0.8 && p[2] > 0, 'apples on the front of the canopy'); });
  GARDEN.rosePositions().forEach((p) => { assert.ok(Math.abs(p[0]) <= 0.43 && p[1] <= 0.6 + 1e-9); });
  const tiers = GARDEN.PINE.tiers;
  near(tiers[2].y + tiers[2].h, 1.8, 1e-9, 'pine top');
  tiers.forEach((t) => assert.ok(t.r <= 0.43, 'pine tiers fit the cell'));
  const segs = GARDEN.palmTrunk();
  assert.equal(segs.length, 6);
  segs.forEach((s, i) => { if (i) assert.ok(s.c[1] > segs[i - 1].c[1], 'the trunk rises'); assert.ok(s.rBot > s.rTop, 'each ring steps in'); });
  GARDEN.PALM.fronds.forEach((f) => {
    const tip = GARDEN.frondTip(f);
    assert.ok(tip[1] > 1.0, 'frond tips above 1.0');
    assert.ok(Math.hypot(tip[0], tip[2]) <= 0.62, 'frond reach');
  });
  const up = Math.max.apply(null, GARDEN.PALM.fronds.map((f) => GARDEN.frondTip(f)[1]));
  near(up, 1.9, 0.03, 'palm height');
});

test('windmill sails and lighthouse beams respect the bounds', () => {
  const W = GARDEN.MILL, reach = Math.hypot(W.arm, 0.02 + W.width);
  assert.ok(W.hub[1] - reach >= 1.0, 'the lowest sail tip clears the 1.0 u line');
  near(W.hub[1] + reach, 2.2, 0.02, 'windmill height');
  assert.ok(W.slats >= 4, 'slim slat sails');
  const H = GARDEN.LH;
  assert.ok(H.beamLen / H.beamScale < 0.17, 'the authored beam hides inside the lamp room');
  near(H.beamLen, 6, 1e-9); near(H.beamR, 0.6, 1e-9);
  assert.ok(H.ledR <= 0.32, 'the LED gallery ring hugs the gallery');
});

test('bunting pennants hang in order under the sagging line without overlapping', () => {
  const lay = GARDEN.pennantLayout();
  assert.equal(lay.length, 5);
  for (let i = 1; i < lay.length; i++) assert.ok(lay[i].x0 > lay[i - 1].x1, 'pennant ' + i + ' clear of its neighbour');
  lay.forEach((p) => near(p.cy, GARDEN.buntLineY(p.x) - 0.006, 1e-9));
  assert.ok(GARDEN.buntLineY(0) < GARDEN.buntLineY(0.3), 'the line sags in the middle');
});

/* ---------------- builders against the mock kit ---------------- */
const OVERHANG = { tree_oak: 1, tree_pine: 1, tree_apple: 1, tree_blossom: 1, tree_palm: 1, umbrella: 1, windmill: 1 };
test('builders: every id on every tier carries the LOOK pivots and anchors, ≤ 6 parts, ≤ 4 static materials', () => {
  for (const id of GARDEN.IDS) for (const tier of TIERS) {
    const look = L.LOOK[id], tpl = build(id, tier), tag = id + ' ' + tier;
    assert.ok(tpl.__template, tag);
    /* 'sway' is the kit's whole-copy root alias, never a template pivot */
    for (const pv of look.pivots) if (pv !== 'sway') assert.ok(tpl.pivots[pv], tag + ' has pivot ' + pv);
    if (look.actPivot) assert.ok(tpl.pivots[look.actPivot], tag + ' has its act pivot');
    for (const an of look.anchors) if (an !== 'top') assert.ok(tpl.anchors[an], tag + ' has anchor ' + an);
    assert.ok(tpl.parts.length <= 6, tag + ' ≤ 6 parts');
    const staticMats = new Set(tpl.parts.filter((p) => !p.pivot && !p.perCopy).map((p) => p.mat));
    assert.ok(staticMats.size <= 4, tag + ' ≤ 4 static materials');
    for (const p of tpl.parts) {
      assert.ok(p.pts.length && p.tris > 0, tag + ' part ' + p.name + ' has geometry');
      if (p.pivot) assert.ok(tpl.pivots[p.pivot], tag + ' ' + p.name + ' pivot exists');
      if (p.pivot || p.perCopy) assert.ok(!p.castShadow, tag + ' moving part ' + p.name + ' casts no static shadow');
    }
  }
  assert.equal(build('rock_mossy', 'MID').pivots.eyes, undefined, 'the rock has no eyes');
});

test('builders: materials and colour tokens come from the LOOK entry (+ the documented light tokens)', () => {
  for (const id of GARDEN.IDS) for (const tier of TIERS) {
    const look = L.LOOK[id], tpl = build(id, tier), tag = id + ' ' + tier;
    const allowedTok = new Set(L.tokensIn(look).concat(GARDEN.EXTRA_TOKENS));
    const allowedMat = new Set(['toon', 'state', ...Object.values(look.mats)]);
    for (const p of tpl.parts) {
      const glow = /^glow:/.test(p.mat);
      assert.ok(allowedMat.has(p.mat) || (glow && allowedTok.has(p.mat.slice(5))), tag + ' ' + p.name + ' material ' + p.mat);
      assert.ok(p.tokens.length, tag + ' ' + p.name + ' is painted');
      for (const { token, tone } of p.tokens) {
        assert.ok(L.isToken(token), tag + ' ' + p.name + ': ' + token);
        assert.ok(['base', 'shade', 'hi'].includes(tone), tag + ' tone ' + tone);
        assert.ok(allowedTok.has(token), tag + ' ' + p.name + ': ' + token + ' comes from the LOOK entry');
      }
      if (p.stateColor) for (const k of ['off', 'on']) assert.ok(allowedTok.has(p.stateColor[k]), tag + ' state colour ' + p.stateColor[k]);
    }
  }
  /* the lamps: lantern head Sunset Amber when lit, mushroom caps Violet → LED Cyan */
  const lan = build('lantern', 'MID').parts.find((p) => p.name === 'glass');
  assert.equal(lan.mat, 'state'); assert.equal(lan.stateColor.on, L.LOOK.lantern.colors.glassOn);
  assert.equal(L.hex(lan.stateColor.on), L.hex('Sunset Amber'));
  const cap = build('mushroom_glow', 'MID').parts.find((p) => p.name === 'cap');
  assert.deepEqual([L.hex(cap.stateColor.off), L.hex(cap.stateColor.on)], [L.hex('Cap Violet'), L.hex('LED Cyan')]);
  /* the lighthouse gallery ring lights LED Cyan with the lamp (same 'lit' key) */
  const ring = build('lighthouse', 'MID').parts.find((p) => p.name === 'ledRing');
  assert.ok(ring && ring.mat === 'state' && ring.stateColor.key === 'lit' && ring.stateColor.on === 'LED Cyan');
  /* the bench in Teak on Gunmetal */
  const bench = new Set(build('bench', 'MID').parts[0].tokens.map((t) => t.token));
  assert.deepEqual([...bench].sort(), ['Gunmetal', 'Teak']);
});

test('builders: triangle budgets (LOOK tris on every tier; every path piece too)', () => {
  for (const id of GARDEN.IDS) for (const tier of TIERS) {
    const tris = build(id, tier).tris;
    assert.ok(tris <= L.LOOK[id].tris, `${id} ${tier}: ${tris} tris ≤ ${L.LOOK[id].tris}`);
  }
  for (const id of PATHS) for (const sk of PIECES.concat(PIECES.map((k) => k + ':2'))) for (const tier of TIERS) {
    const tris = build(id, tier, sk).tris;
    assert.ok(tris <= L.LOOK[id].tris, `${id} ${sk} ${tier}: ${tris} tris`);
  }
  /* trees are genuinely low-poly: a handful of 20-face clusters */
  assert.ok(build('tree_oak', 'MID').tris <= 300, 'oak ' + build('tree_oak', 'MID').tris);
});

test('builders: rest pose on the ground, inside the cell below the 1.0 u overhang line, at the LOOK height', () => {
  const F = GARDEN.FIT + 0.002;
  for (const id of GARDEN.IDS) for (const tier of TIERS) {
    const look = L.LOOK[id], pts = points(build(id, tier)), tag = id + ' ' + tier, path = look.kind === 'path';
    const lo = Math.min(...pts.map((p) => p[1])), hi = Math.max(...pts.map((p) => p[1]));
    assert.ok(lo >= -0.03, `${tag}: base ${lo.toFixed(3)}`);
    for (const p of pts) {
      const r = Math.max(Math.abs(p[0]), Math.abs(p[2]));
      if (OVERHANG[id] && p[1] >= 0.95) assert.ok(r <= 0.62, `${tag}: overhang ${r.toFixed(3)}`);
      else assert.ok(r <= F, `${tag}: ${r.toFixed(3)} at y ${p[1].toFixed(2)}`);
    }
    const k = hi / look.h;
    assert.ok(k >= (path ? 0.8 : 0.9) && k <= 1.1, `${tag}: height ${hi.toFixed(3)} vs ${look.h}`);
  }
});

/* ---------------- paths (P1 auto-tiling) ---------------- */
test('paths: the piece table matches SLIslandLook.pathPiece and keys round-trip', () => {
  for (let m = 0; m < 16; m++) assert.deepEqual(GARDEN.pathPieceOf(m), L.pathPiece(m), 'mask ' + m);
  for (const piece of GARDEN.PATH_PIECES) for (let l = 0; l < GARDEN.PATH.layouts; l++) {
    const k = GARDEN.pathKey(piece, l);
    assert.equal(k, 'p:' + piece + (l ? ':' + l : ''));
    assert.deepEqual(GARDEN.parsePathKey(k), { piece, mask: GARDEN.parsePathKey(k).mask, layout: l });
  }
  for (const k of ['base', '', null, 'p:nope', 'p:tee:x', 'v:1']) assert.equal(GARDEN.parsePathKey(k).piece, 'tile', String(k));
  assert.equal(GARDEN.pathKey('nope', 1), 'base');
  /* pathPose: the mask's piece and yaw, a hashed layout, extra quarter-turns only where the piece allows */
  for (let m = 0; m < 16; m++) for (const uid of ['p1', 'p2', 'p17', 'p300']) {
    const pp = GARDEN.pathPose(m, uid), base = L.pathPiece(m);
    assert.equal(pp.piece, base.piece);
    assert.equal(pp.stateKey, GARDEN.pathKey(pp.piece, pp.layout));
    assert.ok(pp.layout >= 0 && pp.layout < 3 && pp.yawDeg % 90 === 0);
    if (pp.piece === 'straight') assert.ok((pp.yawDeg - base.yawDeg + 360) % 180 === 0, 'straight turns by 180° only');
    else if (pp.piece !== 'single' && pp.piece !== 'cross') assert.equal(pp.yawDeg, base.yawDeg);
    assert.deepEqual(GARDEN.pathPose(m, uid), pp, 'deterministic');
  }
  const layouts = new Set(Array.from({ length: 30 }, (_, i) => GARDEN.pathPose(5, 'p' + i).layout));
  assert.equal(layouts.size, 3, 'all three layouts appear');
  /* one layout per piece on request (fewer batches): the plain 'p:<piece>' keys */
  for (let i = 0; i < 30; i++) {
    const pp = GARDEN.pathPose(i % 16, 'p' + i, {}, 1);
    assert.equal(pp.layout, 0);
    assert.equal(pp.stateKey, 'p:' + pp.piece);
  }
});

test('paths: the walk area — arms to the edge, closed sides in, filleted inner corners', () => {
  const sd = GARDEN.pathSd, hw = GARDEN.PATH.hw;
  assert.ok(sd('single', 0, 0) < 0 && sd('single', 0, -0.45) > 0 && sd('single', 0.45, 0) > 0);
  assert.ok(sd('end', 0, -0.49) < 0 && sd('end', 0, 0.45) > 0, 'end opens north only');
  assert.ok(sd('straight', 0, 0.49) < 0 && sd('straight', 0.45, 0) > 0);
  assert.ok(sd('corner', 0.49, 0) < 0 && sd('corner', -0.45, 0) > 0, 'corner opens north and east');
  assert.ok(sd('tee', -0.49, 0) < 0 && sd('tee', 0, 0.45) > 0, 'tee opens north, east and west');
  ['N', 'E', 'S', 'W'].forEach((_, i) => { const a = i * Math.PI / 2; assert.ok(sd('cross', 0.49 * Math.sin(a), -0.49 * Math.cos(a)) < 0); });
  /* the inner fillet fills the concave corner of a corner piece, never a straight's side */
  const q = hw + 0.025;
  assert.ok(sd('corner', q, -q) < 0.005 && sd('straight', q, -q) > 0.02);
  assert.equal(GARDEN.pathFillets('corner').length, 1); assert.equal(GARDEN.pathFillets('tee').length, 2); assert.equal(GARDEN.pathFillets('cross').length, 4);
  /* closed sides stay on a straight edge (no bulge where the centre meets an arm) */
  assert.ok(Math.abs(sd('straight', hw + 0.07, 0) - 0.07) < 1e-9);
  assert.ok(sd('tile', 0.4, 0.4) < 0.02 && sd('tile', 0, 0.45) > 0);
});

test('paths: flagstones, stepping stones and boards lie on the walk, inside the cell, without overlaps', () => {
  const sd = GARDEN.pathSd, pieces = GARDEN.PATH_PIECES.concat(['tile']);
  for (const piece of pieces) for (let l = 0; l < 3; l++) {
    for (const list of [GARDEN.pathStones(piece, l), GARDEN.stepStones(piece, l)]) {
      assert.ok(list.length > 0, piece + ' has stones');
      list.forEach((s, i) => {
        assert.ok(sd(piece, s.x, s.z) < 0, `${piece}/${l} stone ${i} on the walk`);
        assert.ok(Math.abs(s.x) + s.r * 0.81 <= 0.5 && Math.abs(s.z) + s.r * 0.81 <= 0.5, `${piece}/${l} stone ${i} inside the cell`);
        list.forEach((o, j) => { if (j > i) assert.ok(Math.hypot(s.x - o.x, s.z - o.z) >= 0.81 * (s.r + o.r) - 1e-9, `${piece}/${l} stones ${i}/${j} apart`); });
      });
    }
    GARDEN.pathFlowers(piece, l, 4).forEach((f) => {
      /* on pieces the flowers grow beside the walk; on the stand-alone tile, between its stones */
      if (piece !== 'tile') assert.ok(sd(piece, f.x, f.z) > 0.03, `${piece} flower off the walk`);
      GARDEN.stepStones(piece, l).forEach((s) => assert.ok(Math.hypot(f.x - s.x, f.z - s.z) > s.r, `${piece} flower clear of the stones`));
      assert.ok(Math.abs(f.x) <= 0.4 && Math.abs(f.z) <= 0.4);
    });
  }
  /* flagstone counts follow the walk: 4 per centre, 2 per arm */
  assert.deepEqual(['single', 'end', 'straight', 'corner', 'tee', 'cross'].map((p) => GARDEN.pathStones(p, 0).length), [4, 6, 8, 8, 10, 12]);
  /* the stride carries across cell edges: the arm stones sit 0.125 u from the edge */
  const st = GARDEN.stepStones('straight', 0).map((s) => s.z).sort((a, b) => a - b);
  for (let i = 1; i < st.length; i++) near(st[i] - st[i - 1], 0.25, 1e-9, 'stride');
  near(0.5 + st[0] + 0.5 - st[st.length - 1], 0.25, 1e-9, 'stride across the edge');
  /* boards: open arms reach the cell edge, closed sides stay at the walk's half-width */
  const ext = (piece) => {
    const b = GARDEN.pathPlanks(piece);
    return [Math.min(...b.map((p) => p.x0)), Math.max(...b.map((p) => p.x1)), Math.min(...b.map((p) => p.z - p.w / 2)), Math.max(...b.map((p) => p.z + p.w / 2))];
  };
  const [cx0, cx1, cz0, cz1] = ext('corner');
  assert.ok(cx1 > 0.49 && cz0 < -0.49, 'corner boards reach the north and east edges');
  assert.ok(cx0 >= -GARDEN.PATH.hw - 1e-9 && cz1 <= GARDEN.PATH.hw, 'and stay in on the closed sides');
  const tile = ext('tile');
  assert.ok(tile.every((v) => Math.abs(v) <= GARDEN.PATH.fit + 1e-9), 'the stand-alone tile keeps the v1 margin');
  /* the runway plates: ≤ 2 per piece, inside the cell, covering the walk centre */
  for (const piece of pieces) {
    const pl = GARDEN.pathPlates(piece);
    assert.ok(pl.length >= 1 && pl.length <= 2);
    pl.forEach((r) => assert.ok(r[0] < 0 && r[2] > 0 && r[1] < 0 && r[3] > 0 && r.every((v) => Math.abs(v) <= 0.5)));
  }
});

test('paths: builders read the piece from the stateKey; layouts differ; the tile is the default', () => {
  for (const id of PATHS) {
    const tile = build(id, 'MID'), cross = build(id, 'MID', 'p:cross'), c2 = build(id, 'MID', 'p:corner:2');
    assert.ok(tile.parts.find((p) => p.name === 'glow') && tile.parts.find((p) => p.name === 'tile'));
    const span = (tpl) => { const ps = points(tpl); return Math.max(...ps.map((p) => Math.max(Math.abs(p[0]), Math.abs(p[2])))); };
    assert.ok(span(tile) <= GARDEN.FIT + 0.002, id + ' tile inside the margin');
    assert.ok(span(cross) > 0.45 || id === 'path_flower', id + ' cross arms run to the edge');
    assert.notDeepEqual(points(c2), points(build(id, 'MID', 'p:corner')), id + ' layout 2 differs from layout 0');
    const glow = cross.parts.find((p) => p.name === 'glow');
    assert.ok(/^glow:/.test(glow.mat) && glow.stateColor.key === 'runway' && !glow.castShadow);
  }
});

/* ---------------- pure animation helpers ---------------- */
test('flagWave: pinned at the hoist, ≤ amp at the free edge, still when reduced', () => {
  const F = GARDEN.FLAG, base = [], n = 9;
  for (let i = 0; i < n; i++) base.push(F.x0 + F.w * i / (n - 1), F.cy, 0);
  const b = new Float32Array(base), out = new Float32Array(b.length);
  for (let t = 0; t < 2; t += 0.05) {
    GARDEN.flagWave(b, out, t, 0.12, 2, 0.3, false, F.x0, F.w, M.flutter);
    near(out[2], 0, 1e-7, 'hoist z');
    for (let i = 0; i < out.length; i += 3) assert.ok(Math.abs(out[i + 2]) <= 0.12 + 1e-6);
  }
  GARDEN.flagWave(b, out, 0.37, 0.12, 2, 0.3, true, F.x0, F.w, M.flutter);
  for (let i = 0; i < out.length; i++) near(out[i], b[i], 1e-7, 'reduced = rest');
});

test('faceNormals: unit, perpendicular, and flipped by the winding', () => {
  const tri = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0]);
  const n = GARDEN.faceNormals(tri, new Float32Array(18));
  near(n[2], 1, 1e-7); near(n[11], -1, 1e-7);
  for (let i = 0; i < 18; i += 3) near(Math.hypot(n[i], n[i + 1], n[i + 2]), 1, 1e-6);
});

test('pennants: ±deg idle, a ripple on tap, rest when reduced; rotation keeps the hang line', () => {
  const out = new Array(5);
  for (let t = 0; t < 3; t += 0.1) {
    GARDEN.pennantAngles(t, 5, 6, 0.8, 0.2, false, 1.3, 0, M.pennant, M.ripple, out);
    out.forEach((d) => assert.ok(Math.abs(d) <= 6 + 1e-9));
  }
  GARDEN.pennantAngles(1, 5, 6, 0.8, 0.2, true, 0.5, 14, M.pennant, M.ripple, out);
  out[2] -= 14; /* the ripple at u = 0.5 under the front */
  assert.ok(out.every((d) => Math.abs(d) < 1e-9 || Math.abs(d) <= 14));
  const lay = GARDEN.pennantLayout(), L0 = lay[1];
  const base = new Float32Array([L0.x, L0.cy - 0.1, L0.cz, 0.9, 0.5, 0.2]);   /* one inside, one outside every pennant */
  const nb = new Float32Array([0, 0, 1, 0, 0, 1]);
  const pos = new Float32Array(6), nrm = new Float32Array(6);
  GARDEN.pennantWave(base, pos, nb, nrm, lay, [0, 30, 0, 0, 0]);
  near(Math.hypot(pos[1] - L0.cy, pos[2] - L0.cz), 0.1, 1e-6, 'distance from the hang line');
  assert.ok(pos[2] < L0.cz, 'a positive angle swings the hanging tip toward -z (right-hand rule about +x)');
  near(nrm[1], -0.5, 1e-6, 'normal rotates too');
  assert.deepEqual(Array.from(pos.slice(3)), Array.from(base.slice(3)), 'vertices off the pennants untouched');
});

test('sunflowers face the sun by day and follow the spotlight at Showtime', () => {
  const o = {};
  for (let t = 0; t < 30; t += 0.5) {
    GARDEN.sunAim(t, 0, 0, 0.1, false, M.coneSweep, o);
    assert.ok(o.yaw >= -42 - 1e-9 && o.yaw <= -34 + 1e-9, 'day yaw near the sun ' + o.yaw);
    GARDEN.sunAim(t, 1, 1, 0.1, false, M.coneSweep, o);
    assert.ok(Math.abs(o.yaw) <= 25 + 1e-9 && o.pitch < -16, 'show yaw follows the ±25° sweep');
  }
  GARDEN.sunAim(5, 0, 0, 0.1, true, M.coneSweep, o);
  near(o.yaw, -38, 1e-9, 'reduced day pose');
});

test('path runway: off by day, a ≤ 2 Hz chase at Showtime, steady when reduced', () => {
  near(GARDEN.runwayLevel(3, 2, 0, false, M.chaseWave), 0, 0);
  let peaks = 0, prev = -1, rising = false;
  for (let t = 0; t < 8; t += 0.01) {
    const v = GARDEN.runwayLevel(t, 3, 1, false, M.chaseWave);
    assert.ok(v >= 0.25 - 1e-9 && v <= 1 + 1e-9);
    if (v < prev && rising) peaks++;
    rising = v > prev; prev = v;
  }
  assert.ok(peaks / 8 <= 2, 'pulses per second ' + peaks / 8);
  near(GARDEN.runwayLevel(1, 3, 1, true, M.chaseWave), 0.8, 1e-9);
});

test('LED groups: antiphase twinkle scaled by the Showtime mix, each ≤ LED_CHASE_HZ', () => {
  const o = [0, 0];
  GARDEN.ledLevels(1, 0.2, 0, false, M.twinkle, o);
  assert.deepEqual(o, [0, 0]);
  let peaks = 0, prev = 0, rising = false;
  for (let t = 0; t < 8; t += 1 / 240) {
    GARDEN.ledLevels(t, 0.2, 0.5, false, M.twinkle, o);
    assert.ok(o[0] <= 0.5 + 1e-9 && o[1] <= 0.5 + 1e-9 && o[0] >= 0 && o[1] >= 0);
    near(o[0] + o[1], 0.5 * (0.7 + 0.65), 1e-6, 'antiphase pair');
    if (o[0] < prev && rising) peaks++;
    rising = o[0] > prev; prev = o[0];
  }
  assert.ok(peaks / 8 <= L.LED_CHASE_HZ + 0.01, 'each LED group ' + peaks / 8 + ' Hz');
});

test('idle amplitude: ×0.8–1.2 per copy, decorrelated from the phase', () => {
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const k = GARDEN.idleAmp(i / 200);
    assert.ok(k >= 0.8 - 1e-9 && k <= 1.2 + 1e-9);
    seen.add(Math.round(k * 10));
  }
  assert.ok(seen.size >= 4, 'the whole range is used');
  near(GARDEN.idleAmp(0.37), GARDEN.idleAmp(0.37), 0, 'deterministic');
});

/* ---------------- handlers through a fake handle ---------------- */
test('trees sway about the base (root alias) by up to their idle deg ×1.2, rest under reduced motion', () => {
  const a = handle();
  for (let t = 0; t < 5; t += 0.25) {
    a.t = t; MODELS.tree_oak.idle(a);
    const p = a.log.pivots.sway;
    assert.ok(Math.abs(p.r[2]) <= 1.5 * 1.2 + 1e-9 && p.r[1] === 0 && p.s[0] === 1);
  }
  const r = handle({ reduced: true });
  ['tree_pine', 'tree_palm', 'tree_apple', 'tree_blossom'].forEach((id) => { MODELS[id].idle(r); assert.deepEqual(r.log.pivots.sway.r, [0, 0, 0]); });
  ['tree_oak', 'bench', 'umbrella', 'sandcastle', 'rock_mossy', 'path_wood'].forEach((id) => assert.equal(MODELS[id].act(handle(), 'wave'), null, id + ' has no act'));
});

test('blossom petals are emitted through the fx pool, never under reduced motion', () => {
  const a = handle();
  for (let t = 0; t < 12; t += 1 / 30) { a.t = t; MODELS.tree_blossom.idle(a); }
  assert.ok(a.log.emit.length >= 6 && a.log.emit.length <= 13, 'about one petal every 1–1.6 s: ' + a.log.emit.length);
  assert.equal(a.log.emit[0][0], 'petal');
  const r = handle({ reduced: true });
  for (let t = 0; t < 12; t += 1 / 30) { r.t = t; MODELS.tree_blossom.idle(r); }
  assert.equal(r.log.emit.length, 0);
});

test('flowers bob ±2% (×0.8–1.2 per copy); the mossy rock never blinks or moves', () => {
  const a = handle();
  for (let t = 0; t < 3; t += 0.1) {
    a.t = t; MODELS.flower_tulip.idle(a);
    assert.ok(Math.abs(a.log.pivots.sway.s[1] - 1) <= 0.02 * 1.2 + 1e-9);
    MODELS.flower_sun.idle(a);
    assert.ok(a.log.pivots.head0 && a.log.pivots.head1);
  }
  const rock = handle();
  for (let t = 0; t < 20; t += 1 / 30) { rock.t = t; assert.equal(MODELS.rock_mossy.idle(rock), false); }
  assert.deepEqual(rock.log.pivots, {}, 'no eyes, no blink');
});

test('lantern glow act: gentle rising steps, halo + Showtime decal, no sounds (rewards-world plays them)', () => {
  const a = handle({ show: 1 });
  const levels = [];
  const act = MODELS.lantern.act(a, 'glow');
  assert.ok(act && act.dur === 0.25);
  let t = 0, alive = true;
  while (alive) { a.t = 50 + t; alive = act.update(a, t); levels.push(a.log.states.lit); t += 1 / 60; }
  for (let i = 1; i < levels.length; i++) assert.ok(levels[i] >= levels[i - 1] - 1e-9, 'never dips (no strobe)');
  near(levels[levels.length - 1], 1, 1e-9);
  assert.deepEqual(a.log.halo, [['glow', true, 0.9, 'Lamp Halo']]);
  assert.deepEqual(a.log.decal, [[true, 'Lamp Warm']]);
  assert.equal(a.log.sfx.length, 0);
  /* toggling again switches it off */
  const off = MODELS.lantern.act(a, 'glow');
  runToEnd(off, a);
  near(a.log.states.lit, 0, 1e-9);
  assert.deepEqual(a.log.halo[1], ['glow', false, 0.9, 'Lamp Halo']);
  /* reduced: instant */
  const r = handle({ reduced: true });
  const on = MODELS.mushroom_glow.act(r, 'glowOn');
  assert.equal(on.update(r, 0), false);
  near(r.log.states.lit, 1, 1e-9);
  assert.equal(r.log.halo[0][3], 'Cap Halo');
});

test('lit lamps pulse ±12% on the beat while music plays, never when reduced or silent', () => {
  const a = handle({ lit: true, beat: 0 });
  MODELS.lantern.idle(a);
  near(a.log.pivots.glow.s[0], 1.12, 1e-9);
  a.beat = 0.5; MODELS.mushroom_glow.idle(a);
  near(a.log.pivots.glow.s[0], 0.88, 1e-9);
  const q = handle({ lit: true, music: false });
  MODELS.lantern.idle(q); near(q.log.pivots.glow.s[0], 1, 0);
  const r = handle({ lit: true, reduced: true });
  MODELS.lantern.idle(r); near(r.log.pivots.glow.s[0], 1, 0);
  near(r.log.states.lit, 1, 0);
  const off = handle({ lit: false });
  MODELS.lantern.idle(off); near(off.log.pivots.glow.s[0], 1, 0);
});

test('flag and bunting acts: SLMotion durations and their whoosh; LEDs only at Showtime', () => {
  const a = handle();
  const f = MODELS.flag_pole.act(a, 'wave');
  near(runToEnd(f, a), 1.2, 0.05);
  assert.deepEqual(a.log.sfx, [['whoosh', 0.5, undefined]]);
  const b = handle();
  near(runToEnd(MODELS.bunting.act(b, 'wave'), b), 0.8, 0.05);
  const day = handle({ show: 0 });
  MODELS.bunting.idle(day);
  assert.deepEqual(day.log.pivots.leds.s, [0, 0, 0]);
  assert.equal(day.log.states.ledA, undefined);
  const show = handle({ show: 1 });
  MODELS.flag_pole.show(show, 1);
  assert.deepEqual(show.log.pivots.leds.s, [GARDEN.FX_SCALE, GARDEN.FX_SCALE, GARDEN.FX_SCALE], "the 1/FX_SCALE LEDs scale up at Showtime");
  assert.ok(show.log.states.ledA > 0 && show.log.states.ledB > 0);
  assert.equal(MODELS.flag_pole.act(handle({ reduced: true }), 'wave').dur, 0);
});

test('windmill: idle turn, a 3 s spin act that lands seamlessly back on the idle', () => {
  const a = handle({ phase: 0 });
  a.t = 0; MODELS.windmill.idle(a);
  const z0 = a.log.pivots.spin.r[2];
  a.t = 1; MODELS.windmill.idle(a);
  near(((z0 - a.log.pivots.spin.r[2]) % 360 + 360) % 360, 90, 1e-6, 'a quarter turn a second at 0.25 rev/s');
  const act = MODELS.windmill.act(a, 'spin');
  near(runToEnd(act, a), 3, 0.05);
  assert.deepEqual(a.log.sfx.map((s) => s[0]), ['whoosh', 'boost']);
  /* after the act the sail angle differs from the plain idle by whole quarter turns only */
  const after = handle({ uid: a.uid, phase: 0, t: 200 });
  MODELS.windmill.idle(after);
  const idleOnly = -(M.spin(200, 0.25, 0, false) % 360);
  const diff = ((after.log.pivots.spin.r[2] - idleOnly) % 90 + 90) % 90;
  assert.ok(diff < 1e-6 || 90 - diff < 1e-6, 'lands on a quarter turn: ' + diff);
  const r = handle({ reduced: true });
  near(MODELS.windmill.act(r, 'spin').dur, 0.6, 1e-9);
  /* light-painting tips: hidden by day, scaled up (and lit with the mix) at Showtime */
  const day = handle({ show: 0 }); MODELS.windmill.idle(day);
  assert.deepEqual(day.log.pivots.tips.s, [0, 0, 0]);
  const night = handle({ show: 0.8 }); MODELS.windmill.show(night, 0.8);
  assert.deepEqual(night.log.pivots.tips.s, [GARDEN.FX_SCALE, GARDEN.FX_SCALE, GARDEN.FX_SCALE]);
  near(night.log.states.tips, 0.8, 1e-9);
});

test('lighthouse: beam scales up only while lit and cycles neon only at Showtime', () => {
  const a = handle({ lit: false });
  MODELS.lighthouse.idle(a);
  assert.equal(a.log.pivots.beam, undefined, 'never touched while dark');
  const act = MODELS.lighthouse.act(a, 'glowOn');
  runToEnd(act, a);
  near(a.log.pivots.beam.s[0], GARDEN.LH.beamScale, 1e-9);
  assert.deepEqual(a.log.halo[0], ['glow', true, 1, 'Lamp Halo']);
  MODELS.lighthouse.lit(a, false);
  near(a.log.pivots.beam.s[0], 0, 0);
  near(a.log.states.lit, 0, 0);
  assert.equal(typeof MODELS.lighthouse.material, 'function');
});

test('paths: the runway chase drives the glow plate only at Showtime', () => {
  const a = handle({ show: 1, pathD: 2 });
  MODELS.path_stone.idle(a);
  assert.ok(a.log.states.runway >= 0.25 && a.log.states.runway <= 1);
  const d = handle({ uid: a.uid, show: 0 });
  MODELS.path_stone.idle(d);
  near(d.log.states.runway, 1, 0, 'restored to the steady initial level after Showtime');
  const quiet = handle({ show: 0 });
  MODELS.path_flower.show(quiet, 0);
  assert.equal(quiet.log.states.runway, undefined, 'no writes by day');
});

test('handlers tolerate a bare handle (no pivot / state / fx functions)', () => {
  GARDEN.IDS.forEach((id) => {
    const bare = { uid: 'bare-' + id, t: 3, phase: 0.5, show: 1, lit: true };
    assert.doesNotThrow(() => { MODELS[id].idle(bare); MODELS[id].show(bare, 1); }, id);
    const act = MODELS[id].act(bare, id === 'windmill' ? 'spin' : /lantern|mushroom|lighthouse/.test(id) ? 'glow' : 'wave');
    if (act) assert.doesNotThrow(() => runToEnd(act, bare), id);
  });
});
