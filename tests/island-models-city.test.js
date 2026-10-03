'use strict';
/* My Island 3D — city buildings I (world/island3d/models-city.js): the Photo Booth,
   the Boba Café, the LED Screen Tower and the Recording Studio.
   THREE is not available in Node, so the builders run against a mock of the K.G kit
   (surface sample points + the triangle count three r170 gives after the kit's
   non-indexed conversion), mirroring tests/island-models-fun.test.js. Acts, idles,
   lights and the material hook run against mock handles and a mock K. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const CITY = require('../world/island3d/models-city.js');
const M = require('../world/island3d/motion.js');
const L = require('../world/world-look.js');
const C = require('../world/world-core.js');

const IDS = ['bld_photobooth', 'bld_boba', 'bld_ledtower', 'bld_recording'];
const TIERS = ['LOW', 'MID', 'HIGH'];
const VARIANTS = [0, 1, 2];
const D2R = Math.PI / 180;
const ACT = { bld_photobooth: 'snap', bld_boba: 'serve', bld_ledtower: 'screen', bld_recording: 'record' };
const SRC = fs.readFileSync(path.join(__dirname, '../world/island3d/models-city.js'), 'utf8');

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
  /* slab(w, h, d, radius): a radius of 0 is a plain BoxGeometry (12 tris); otherwise a RoundedBox */
  G.slab = (w, h, d, radius) => {
    const pts = [];
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) pts.push({ p: [x * w / 2, y * h / 2, z * d / 2], n: unit([x, y, z]) });
    for (let ax = 0; ax < 3; ax++) for (const s of [-1, 1]) { const p = [0, 0, 0], n = [0, 0, 0]; p[ax] = s * [w, h, d][ax] / 2; n[ax] = s; pts.push({ p, n }); }
    if (radius === 0) return mk(pts, 12);
    const seg = (low ? 1 : 2) * 2 + 1;
    return mk(pts, 12 * seg * seg);
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
    prof.forEach((q, j) => {
      const nx = prof[Math.min(j + 1, prof.length - 1)], pv = prof[Math.max(j - 1, 0)];
      const dx = (nx[0] - pv[0]) * r, dy = (nx[1] - pv[1]) * h;
      for (const a of ANG) pts.push({ p: [Math.cos(a) * q[0] * r, q[1] * h, Math.sin(a) * q[0] * r], n: unit([Math.cos(a) * dy, -dx, Math.sin(a) * dy]) });
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
  /* flag(w, h, sx, sy): front + back planes, pole edge at x = 0 */
  G.flag = (w, h, sx, sy) => {
    const pts = [];
    for (const x of [0, w / 2, w]) for (const y of [-h / 2, 0, h / 2]) pts.push({ p: [x, y, 0], n: [0, 0, 1] }, { p: [x, y, 0], n: [0, 0, -1] });
    return mk(pts, 4 * (sx || 8) * (sy || 1));
  };
  /* ribbon(points, r, {segments}): TubeGeometry with 4 radial segments */
  G.ribbon = (points, r, o) => {
    const pts = [];
    for (const q of points) for (const d of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) pts.push({ p: [q[0] + d[0] * r, q[1] + d[1] * r, q[2] + d[2] * r], n: d });
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
function rgbHex(hex) { const n = parseInt(hex.slice(1), 16); return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 }; }
/* a material stand-in with a colour and a map (what the hook and the LED tiles touch) */
function mockMat(name, patch) {
  const m = { name, color: { v: 1, setScalar(x) { this.v = x; } }, ...patch };
  return m;
}
function mockTex() { return { repeat: { x: 1, y: 1, set(x, y) { this.x = x; this.y = y; } }, offset: { x: 0, y: 0, set(x, y) { this.x = x; this.y = y; } } }; }
function mockK(tier, o = {}) {
  const words = [], programs = [], variants = [];
  const K = { tier, G: mockG(tier), col: rgbOf, rgb: rgbHex, hex: (t) => L.hex(t), has: (t) => L.isToken(t), words, programs, variants };
  if (o.atlases) {
    K.signAtlas = () => ({
      material: (w) => { words.push(w); return mockMat('sign:' + w); },
      view: (w) => { words.push(w); return mockTex(); }
    });
    K.ledAtlas = () => ({
      view: (p) => { programs.push(p); return mockTex(); },
      window: (p, phase, out) => { programs.push(p); out.rx = 0.25; out.ry = 0.25; out.ox = phase * 0.25; out.oy = 0.5; return out; },
      material: (p) => { programs.push(p); return mockMat('led:' + p); }
    });
    K.variant = (key, name, patch) => { variants.push(name); return mockMat(key + '#' + name, patch); };
  }
  K.template = (ctx) => {
    const parts = [], pivots = {}, anchors = {};
    const b = {
      part(name, geos, mat, o2) {
        const list = [geos].flat(Infinity), ex = parts.find((p) => p.name === name);
        if (ex && ex.mat === (mat || 'toon')) { ex.geos.push(...list); return b; }
        parts.push({ name, geos: list, mat: mat || 'toon', o: o2 || {} });
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
        return { __template: true, id: ctx.id, tier: ctx.tier, stateKey: ctx.stateKey, parts: ps, pivots, anchors, tris: ps.reduce((a, p) => a + p.tris, 0) };
      }
    };
    return b;
  };
  return K;
}
function ctxOf(id, tier, v, K) {
  const st = L.resolveStyle(id, { variant: v });
  return { id, look: L.LOOK[id], st, stateKey: L.stateKey(id, st), tier, G: K.G, col: K.col, fp: C.item(id).fp, K };
}
function build(id, tier, v = 0, K = mockK(tier)) {
  const models = CITY.factory(K);
  return models[id].build(ctxOf(id, tier, v, K));
}
function extents(pts) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const { p } of pts) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], p[i]); hi[i] = Math.max(hi[i], p[i]); }
  return { lo, hi };
}
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

/* ---------------- mock animation handle ---------------- */
/* a fake per-copy geometry for a perCopy part: positions from the mock points, colours, normals */
function copyGeoOf(part) {
  const n = part.tris * 3, pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), col = new Float32Array(n * 3).fill(0.5);
  for (let i = 0; i < n; i++) {
    const q = part.pts[i % part.pts.length];
    pos.set(q.p, i * 3); nrm.set(q.n, i * 3);
  }
  const attrs = { position: { array: pos, count: n, needsUpdate: false }, normal: { array: nrm, count: n }, color: { array: col, count: n, needsUpdate: false } };
  return { attrs, getAttribute: (k) => attrs[k] || null };
}
function handle(uid, tpl, o = {}) {
  const geos = {};
  if (tpl) for (const p of tpl.parts) if (p.perCopy) geos[p.name] = copyGeoOf(p);
  const h = {
    uid, id: tpl && tpl.id, t: o.t || 0, dt: 1 / 60, phase: o.phase != null ? o.phase : 0.37, reduced: !!o.reduced, show: o.show || 0,
    beat: 0, bar: 0, bpm: 100, music: o.music || null, writes: [], sounds: [], emits: [], states: [], halos: [], decals: [],
    pets: o.pets, member: o.member, user: o.user, template: tpl, stateKey: tpl && tpl.stateKey, batch: o.card ? null : { id: 'batch' },
    object: o.card ? { userData: { meshes: o.meshes || {} } } : null, geos,
    pivot(name) { return { set: (r, p, s) => h.writes.push({ name, t: h.t, r: r.slice(), p: p.slice(), s: s.slice() }) }; },
    state(k, v) { h.states.push([k, v]); },
    halo(name, on, size, token) { h.halos.push({ name, on, size, token, t: h.t }); },
    decal(on, token) { h.decals.push({ on, token }); },
    emit(kind, at, n, opts) { h.emits.push({ kind, at: Array.isArray(at) ? at.slice() : at, n, t: h.t }); },
    sfx(name, vol, step) { h.sounds.push({ name, vol, step, t: h.t }); },
    copyGeometry(part) { return geos[part] || null; }
  };
  if (o.clock) Object.defineProperty(h, 'beatPos', { get() { return h.t * h.bpm / 60; } });
  return h;
}
function tick(h) { const b = h.t * h.bpm / 60; h.beat = b - Math.floor(b); h.bar = Math.floor(b / 4); }
/* drive act.update at 60 fps from h.t; stops when the act ends (or at `until`) */
function play(act, h, until, models, id) {
  const dt = 1 / 60, t0 = h.t;
  for (let k = 0; k < 2000; k++) {
    const t = k * dt;
    if (until != null && t > until + 1e-9) return { t, alive: true };
    h.t = t0 + t; tick(h);
    if (models && id && models[id].idle) models[id].idle(h);
    if (!act.update(h, t)) return { t, alive: false };
  }
  throw new Error('act never ended');
}
const last = (h, name) => h.writes.filter((w) => w.name === name).pop();
const isRest = (w) => w && w.r.every((x) => Math.abs(x) < 1e-9) && w.p.every((x) => Math.abs(x) < 1e-9) && w.s.every((x) => Math.abs(x - 1) < 1e-9);
/* the expected audible cues of an act: no 'pop' in its first 0.05 s, the pet cue as that pet's voice */
function expectedSounds(name, o, petId) {
  return M.cues(name, o).filter((c) => c.sfx && !(c.sfx === 'pop' && c.t < CITY.POP_GUARD))
    .filter((c) => !c.pet || petId).map((c) => c.pet ? ['voice', CITY.voiceStep(petId)] : [c.sfx, c.step]);
}
function colourAt(h, part, vtx) { const a = h.geos[part].attrs.color.array; return [a[vtx * 3], a[vtx * 3 + 1], a[vtx * 3 + 2]]; }
function seg(tpl, role, idx) { return CITY.layoutOf(tpl).segs.find((s) => s.role === role && (idx == null || s.idx === idx)); }
const lin = (tok) => { const c = rgbOf(tok); return [c.r, c.g, c.b]; };
const close3 = (a, b, e = 1e-5) => a.every((x, i) => Math.abs(x - b[i]) <= e);

/* ================================================================ */
test('city models: each of the four buildings is a CATALOG city item with a real model', () => {
  const city = C.CATALOG.filter((i) => i.cat === 'city').map((i) => i.id);
  for (const id of IDS) assert.ok(city.includes(id), id);
  assert.deepEqual(CITY.IDS.slice().sort(), IDS.slice().sort());
  const models = CITY.factory(mockK('MID'));
  assert.deepEqual(Object.keys(models).sort(), IDS.slice().sort());
  for (const id of IDS) {
    const m = models[id], look = L.LOOK[id], it = C.item(id);
    assert.equal(it.kind, 'fun', id); assert.equal(look.kind, 'building', id);
    for (const fn of ['build', 'idle', 'act', 'show', 'forget']) assert.equal(typeof m[fn], 'function', id + ' ' + fn);
    assert.equal(L.ACT_PIVOT[it.act], look.actPivot, id + ' act pivot matches the catalog act');
    assert.equal(M.actFor(it.act, id), ACT[id], id + ' catalog act → motion act');
  }
});

test('city models: the script registers SL3D.defineModels(\'city\') in the browser', () => {
  const reg = [];
  const box = { SLMotion: M, SLIslandLook: L, SL3D: { defineModels: (cat, f) => reg.push([cat, f]) } };
  box.self = box;
  vm.createContext(box);
  vm.runInContext(SRC, box);
  assert.equal(reg.length, 1);
  assert.equal(reg[0][0], 'city');
  const models = reg[0][1](mockK('MID'));
  assert.deepEqual(Object.keys(models).sort(), IDS.slice().sort());
  const tpl = models.bld_boba.build(ctxOf('bld_boba', 'LOW', 1, mockK('LOW')));
  assert.ok(tpl.__template && tpl.pivots.hatch);
});

test('city models: templates carry the LOOK pivots, anchors, materials and tokens on every tier and trim', () => {
  for (const id of IDS) for (const tier of TIERS) for (const v of VARIANTS) {
    const look = L.LOOK[id], tpl = build(id, tier, v), tag = id + ' ' + tier + ' v' + v;
    for (const pv of look.pivots) assert.ok(tpl.pivots[pv], tag + ' has pivot ' + pv);
    assert.ok(tpl.pivots[look.actPivot], tag + ' has its act pivot');
    for (const an of look.anchors) assert.ok(tpl.anchors[an], tag + ' has anchor ' + an);
    assert.ok(near(tpl.anchors.top[1], look.h + 0.15, 1e-9), tag + ' top anchor');
    /* ≤ 6 parts (draw calls), ≤ 4 static meshes, ≤ 4 materials */
    assert.ok(tpl.parts.length <= 6, tag + ' ≤ 6 parts');
    const stat = tpl.parts.filter((p) => !p.pivot && !p.perCopy);
    assert.ok(stat.length <= 4, tag + ' ≤ 4 static meshes');
    assert.ok(new Set(tpl.parts.map((p) => p.mat)).size <= 4, tag + ' ≤ 4 materials');
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
        assert.ok(['base', 'shade', 'hi'].includes(tone) || (typeof tone === 'number' && Math.abs(tone) <= 0.1), tag + ' tone ' + tone);
        assert.ok(allowedTok.has(token), tag + ' ' + p.name + ': ' + token + ' comes from the LOOK entry or the trims');
      }
    }
    /* the main body casts into the static shadow map */
    assert.ok(tpl.parts.find((p) => p.name === 'shell').castShadow, tag + ' shell casts');
    /* every LOOK mat is used by the part that carries that colour */
    const byMat = (m) => tpl.parts.filter((p) => p.mat === m);
    for (const [key, m] of Object.entries(look.mats)) {
      if (m === 'state' || /^neon:/.test(m)) continue;                  /* emissive bits live in the lights mesh */
      assert.ok(byMat(m).length, tag + ' uses ' + m + ' for ' + key);
    }
  }
});

test('city models: triangle budgets (LOOK tris on MID/HIGH within BUDGET.building, ≥ 20% cheaper on LOW)', () => {
  for (const id of IDS) for (const v of VARIANTS) {
    const budget = L.LOOK[id].tris, t = {};
    assert.ok(budget <= L.BUDGET.building, id + ' look budget');
    for (const tier of TIERS) t[tier] = build(id, tier, v).tris;
    assert.ok(t.MID <= budget && t.HIGH <= budget, `${id} v${v}: ${t.MID} / ${t.HIGH} tris ≤ ${budget}`);
    assert.ok(t.LOW < t.MID && t.LOW <= 0.8 * budget, `${id} v${v}: LOW ${t.LOW} tris`);
  }
});

test('city models: rest pose sits on the ground, inside fp/2 − 0.07, at the look height', () => {
  for (const id of IDS) for (const tier of TIERS) for (const v of VARIANTS) {
    const look = L.LOOK[id], fp = C.item(id).fp, tpl = build(id, tier, v), e = extents(tpl.parts.flatMap((p) => p.pts)), tag = id + ' ' + tier + ' v' + v;
    assert.ok(e.lo[1] >= -0.025, `${tag}: base y ${e.lo[1].toFixed(3)}`);
    for (const [i, f] of [[0, fp[0]], [2, fp[1]]]) {
      const m = f / 2 - 0.07;
      assert.ok(Math.max(-e.lo[i], e.hi[i]) <= m + 0.002, `${tag}: ${'xyz'[i]} extent ${Math.max(-e.lo[i], e.hi[i]).toFixed(3)} > ${m}`);
    }
    assert.ok(e.hi[1] >= look.h * 0.9 && e.hi[1] <= look.h * 1.1, `${tag}: height ${e.hi[1].toFixed(3)} vs ${look.h}`);
  }
});

test('city models: the 3 trims differ (accent, mirrored layout, stripe) and come from the stateKey', () => {
  for (const id of IDS) {
    const tpls = VARIANTS.map((v) => build(id, 'MID', v));
    const accents = tpls.map((t) => CITY.layoutOf(t).accent);
    assert.deepEqual(accents, [0, 1, 2].map((v) => L.trimOf(id, v).accent), id + ' accents');
    assert.deepEqual(tpls.map((t) => CITY.layoutOf(t).side), [1, -1, 1], id + ' sign sides');
    const sig = (t) => JSON.stringify(t.parts.map((p) => [p.name, p.tris, extents(p.pts).lo.map((x) => +x.toFixed(3))]));
    assert.equal(new Set(tpls.map(sig)).size, 3, id + ' three distinct shapes');
    /* the stateKey alone picks the trim */
    const K = mockK('MID'), m = CITY.factory(K)[id];
    const t2 = m.build({ ...ctxOf(id, 'MID', 0, K), st: {}, stateKey: 'v:2' });
    assert.equal(CITY.layoutOf(t2).accent, L.trimOf(id, 2).accent);
    assert.equal(CITY.variantOf({ st: { variant: 7 } }), 2);
    assert.equal(CITY.variantOf({ st: {}, stateKey: 'v:1' }), 1);
  }
  /* placed copies spread over the trims deterministically */
  const seen = new Set();
  for (let i = 0; i < 40; i++) seen.add(L.variantOf('p' + i, 'bld_ledtower'));
  assert.equal(seen.size, 3);
});

test('city models: the photo booth curtain is per-copy cloth on MID/HIGH and folded into the shell on LOW', () => {
  for (const tier of TIERS) {
    const tpl = build('bld_photobooth', tier), cloth = tpl.parts.find((p) => p.name === 'cloth');
    if (tier === 'LOW') assert.ok(!cloth, 'LOW: no cloth mesh');
    else assert.ok(cloth && cloth.perCopy && !cloth.pivot && cloth.mat === 'toon', tier + ' cloth');
    const lights = tpl.parts.find((p) => p.name === 'lights');
    assert.ok(lights.perCopy && lights.mat === 'state');
  }
});

/* ---------------- textured faces and the material hook ---------------- */
test('city faces: planar uv maps each textured face corner to corner', () => {
  const f = CITY.frameX([1, 2, 3], 0.6, 0.15, 0);
  const pos = new Float32Array([0.7, 1.925, 3, 1.3, 2.075, 3, 1, 2, 3]);
  const uv = CITY.faceUV(pos, 3, f);
  assert.deepEqual(Array.from(uv).map((x) => +x.toFixed(6) + 0), [0, 0, 1, 1, 0.5, 0.5]);
  /* tilted: a point up the tilted face axis lands at v = 1 */
  const ft = CITY.frameX([0, 1, 0], 0.74, 0.37, -6), a = -6 * D2R;
  const up = new Float32Array([0, 1 + 0.185 * Math.cos(a), 0.185 * Math.sin(a)]);
  assert.ok(near(CITY.faceUV(up, 1, ft)[1], 1, 1e-9));
  /* every face of every building: its own mock points span u, v ∈ [0, 1] */
  for (const id of IDS) for (const v of VARIANTS) {
    const tpl = build(id, 'MID', v), faces = CITY.layoutOf(tpl).faces;
    for (const [name, fr] of Object.entries(faces)) {
      const p = tpl.parts.find((x) => x.name === name);
      assert.ok(p, id + ' face part ' + name);
      const arr = new Float32Array(p.pts.flatMap((q) => q.p)), out = CITY.faceUV(arr, p.pts.length, fr);
      const us = Array.from(out).filter((_, i) => i % 2 === 0), vs = Array.from(out).filter((_, i) => i % 2 === 1);
      assert.ok(near(Math.min(...us), 0, 1e-6) && near(Math.max(...us), 1, 1e-6), id + ' ' + name + ' u');
      assert.ok(near(Math.min(...vs), 0, 1e-6) && near(Math.max(...vs), 1, 1e-6), id + ' ' + name + ' v');
    }
  }
  const want = { bld_photobooth: ['sign', 'strip'], bld_boba: [], bld_ledtower: ['screen', 'screen2'], bld_recording: ['sign'] };
  for (const id of IDS) assert.deepEqual(Object.keys(CITY.layoutOf(build(id, 'MID')).faces).sort(), want[id].slice().sort(), id);
});

test('city words: only SIGN_WORDS reach a texture; no text is drawn and no banned wording ships', () => {
  const K = mockK('MID', { atlases: true }), models = CITY.factory(K);
  for (const id of IDS) for (const v of VARIANTS) {
    const tpl = models[id].build(ctxOf(id, 'MID', v, K));
    for (const p of tpl.parts) if (models[id].material) models[id].material(p.mat, p);
  }
  assert.ok(K.words.length >= 2, 'the sign atlas was asked for words');
  for (const w of K.words) assert.ok(L.SIGN_WORDS.includes(w), w + ' is a sign word');
  assert.deepEqual([...new Set(K.words)].sort(), ['ON AIR', 'PHOTO']);
  for (const p of K.programs) assert.ok(['eq', 'wave', 'spark', 'gradient', 'stars', 'encore', 'showtime', 'name'].includes(p), p);
  /* the file itself: no canvas text, no Hangul, no 'K-pop' / 'idol' */
  assert.doesNotMatch(SRC, /fillText|strokeText/, 'no text drawn into canvases');
  assert.doesNotMatch(SRC, /[ᄀ-ᇿ㄰-㆏가-힯]/, 'no Hangul');
  assert.doesNotMatch(SRC, /k-?pop|\bidol/i, 'no K-pop / idol wording');
  /* the pixel pets are 16×16 from the locked PETCOL keys; the ✦ is never a 5-point star */
  for (const [id, rows] of Object.entries(CITY.PET_PIXELS)) {
    assert.ok(L.LOCKED.PETCOL[id], id);
    assert.equal(rows.length, 16);
    for (const r of rows) { assert.equal(r.length, 16, id); assert.match(r, /^[.bdlne]+$/, id); }
  }
  assert.doesNotMatch(SRC, /G\.star\(/, 'the ✦ is built from 4 points, never the 5-point star');
});

test('city material hook: atlas faces, the live LED tiles, the photo strip and the ON AIR sibling', () => {
  const K = mockK('MID', { atlases: true }), models = CITY.factory(K);
  const part = (name, mat) => ({ name, mat });
  assert.equal(models.bld_photobooth.material('sign', part('sign', 'sign')).name, 'sign:PHOTO');
  assert.equal(models.bld_photobooth.material('toon', part('shell', 'toon')), null);
  assert.equal(models.bld_photobooth.material('sign', part('strip', 'sign')), null, 'no canvas in Node: the shared sign material');
  const a = models.bld_ledtower.material('led', part('screen', 'led')), b = models.bld_ledtower.material('led', part('screen2', 'led'));
  assert.ok(a && b && a !== b && a.map && b.map, 'two live tiles with their own atlas view');
  assert.equal(models.bld_ledtower.material('led', part('screen', 'led')), a, 'cached');
  const on = models.bld_recording.material('sign', part('sign', 'sign'));
  assert.ok(on && /city:onair/.test(on.name) && on.map, 'ON AIR has its own dimmable sibling');
  assert.equal(models.bld_boba.material, undefined, 'the café has no textured face');
});

/* ---------------- acts ---------------- */
test('city acts: durations, sounds and emits follow SLMotion; the act pivot ends at rest', () => {
  for (const reduced of [false, true]) {
    for (const id of IDS) {
      const K = mockK('MID'), models = CITY.factory(K), tpl = models[id].build(ctxOf(id, 'MID', 0, K));
      const pets = { active: () => 'pet_kitten', perform: () => 0.6 };
      const h = handle(id + '#1', tpl, { reduced, pets }), name = ACT[id];
      const act = models[id].act(h, C.item(id).act);
      assert.ok(act && typeof act.update === 'function' && typeof act.cancel === 'function', id);
      assert.equal(act.dur, M.durOf(name, { reduced }), id + ' dur');
      assert.ok(act.dur <= (id === 'bld_ledtower' ? 0.5 : 3), id + ' ≤ 3 s (screen 0.5 s)');
      const end = play(act, h);
      assert.ok(end.t >= act.dur - 1e-9 && end.t < act.dur + 1 / 60 + 1e-9, id + ' ends on time');
      assert.deepEqual(h.sounds.map((s) => [s.name, s.step]), expectedSounds(name, { reduced }, 'pet_kitten'), id + ' sounds');
      assert.ok(h.sounds.every((s) => !(s.name === 'pop' && s.t < CITY.POP_GUARD)), id + ' no pop in the first 0.05 s');
      const emits = M.cues(name, { reduced }).filter((c) => c.emit);
      assert.deepEqual(h.emits.map((e) => [e.kind, e.n]), emits.map((c) => [c.emit, c.n]), id + ' emits');
      if (reduced) assert.deepEqual(h.emits.map((e) => e.kind), ['sparkle'], id + ' reduced: one sparkle');
      const w = last(h, L.LOOK[id].actPivot);
      assert.ok(w, id + ' drives its act pivot');
      if (id !== 'bld_photobooth') assert.ok(isRest(w), id + ' act pivot at rest');
      else assert.ok(isRest(w) && isRest(last(h, 'flash')), 'the lens is back at rest');
      assert.equal(act.update(h, end.t + 0.1), false, id + ' stays ended');
    }
  }
});

test('city acts: the record cue is the active pet\'s own voice (none without a pet); pets perform pose and sip', () => {
  for (const [pet, step] of [['pet_puppy', 0], ['pet_kitten', 1], ['pet_bunny', 2], ['pet_dragon', 3]]) {
    const K = mockK('MID'), models = CITY.factory(K), tpl = models.bld_recording.build(ctxOf('bld_recording', 'MID', 0, K));
    const h = handle('rec', tpl, { pets: { active: () => pet, perform: () => 0 } });
    play(models.bld_recording.act(h, 'record'), h);
    const v = h.sounds.filter((s) => s.name === 'voice');
    assert.deepEqual(v.map((s) => s.step), [step], pet);
    assert.ok(Math.abs(v[0].t - 2.4) < 1 / 60 + 1e-9);
  }
  const K = mockK('MID'), models = CITY.factory(K), tpl = models.bld_recording.build(ctxOf('bld_recording', 'MID', 0, K));
  const h0 = handle('rec0', tpl, {});
  play(models.bld_recording.act(h0, 'record'), h0);
  assert.equal(h0.sounds.filter((s) => s.name === 'voice').length, 0, 'no pet, no voice');
  /* perform kinds (never under reduced motion, never without an active pet) */
  for (const [id, kind] of [['bld_photobooth', 'pose'], ['bld_boba', 'sip']]) {
    for (const [o, asked] of [[{}, true], [{ reduced: true }, false], [{ inactive: true }, false]]) {
      const calls = [], t = build(id, 'MID');
      const pets = { active: () => (o.inactive ? null : 'pet_bunny'), perform: (k, uid) => { calls.push([k, uid]); return 0.7; } };
      const h = handle(id + '#p', t, { reduced: !!o.reduced, pets });
      CITY.factory(mockK('MID'))[id].act(h, C.item(id).act);
      assert.deepEqual(calls, asked ? [[kind, id + '#p']] : [], id + ' ' + JSON.stringify(o));
    }
  }
});

test('city acts: the recording studio drops the island music for a bar when it plays', () => {
  const drops = [];
  globalThis.SLMusic = { drop: () => drops.push(1) };
  try {
    const K = mockK('MID'), models = CITY.factory(K), tpl = models.bld_recording.build(ctxOf('bld_recording', 'MID', 0, K));
    models.bld_recording.act(handle('r1', tpl, { music: { playing: true, beat: 3, bpm: 100 } }), 'record');
    models.bld_recording.act(handle('r2', tpl, { music: false }), 'record');
    models.bld_recording.act(handle('r3', tpl, {}), 'record');
    assert.equal(drops.length, 1, 'only while music plays');
  } finally { delete globalThis.SLMusic; }
});

test('city acts: a re-tap restarts without stacking and carries on from the interrupted pose', () => {
  for (const id of IDS) {
    const K = mockK('MID'), models = CITY.factory(K), tpl = models[id].build(ctxOf(id, 'MID', 0, K));
    const piv = L.LOOK[id].actPivot, h = handle(id + '#r', tpl, { pets: { active: () => 'pet_puppy', perform: () => 0.5 } });
    const a1 = models[id].act(h, C.item(id).act), mid = id === 'bld_ledtower' ? 0.15 : 1.2;
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

test('city acts: cancel rests every act pivot; acts on different copies are independent', () => {
  const PIVOTS = { bld_photobooth: ['flash', 'strip'], bld_boba: ['hatch', 'cup', 'pearls'], bld_ledtower: ['screen', 'wipe'], bld_recording: ['meter', 'mic', 'phones'] };
  for (const id of IDS) {
    const K = mockK('MID'), models = CITY.factory(K), tpl = models[id].build(ctxOf(id, 'MID', 0, K));
    const h = handle(id + '#c', tpl), act = models[id].act(h, C.item(id).act);
    play(act, h, id === 'bld_ledtower' ? 0.2 : 1.6);
    act.cancel();
    for (const pv of PIVOTS[id]) {
      const w = last(h, pv);
      if (id === 'bld_boba' && pv === 'pearls') assert.ok(w && Math.abs(w.r[1]) < 1e-9 && w.s[0] === 1, 'the pearls stop swirling');
      else assert.ok(isRest(w), id + ' ' + pv + ' rests on cancel');
    }
    assert.equal(act.update(h, 0.5), false);
    act.cancel();                                  /* a second cancel is harmless */
  }
  const K = mockK('MID'), models = CITY.factory(K), tpl = models.bld_boba.build(ctxOf('bld_boba', 'MID', 0, K));
  const ha = handle('A', tpl), hb = handle('B', tpl), aa = models.bld_boba.act(ha, 'serve'), ab = models.bld_boba.act(hb, 'serve');
  play(aa, ha, 0.5);
  assert.equal(ab.update(hb, 0.5), true, 'another copy keeps serving');
});

test('city acts: reduced motion is the instant end state (strip out, ON AIR lit, next program)', () => {
  const K = mockK('MID', { atlases: true }), models = CITY.factory(K);
  /* booth: the strip is out at once and the bulbs are dark */
  let tpl = models.bld_photobooth.build(ctxOf('bld_photobooth', 'MID', 0, K)), h = handle('b', tpl, { reduced: true });
  let act = models.bld_photobooth.act(h, 'snap');
  assert.equal(act.dur, 0); assert.equal(act.update(h, 0), false);
  const st = last(h, 'strip');
  assert.ok(near(st.p[0], CITY.LAYOUT.bld_photobooth.stripOut, 1e-9), 'strip out');
  assert.equal(h.halos.filter((x) => x.name === 'lens' && x.on).length, 0, 'no bloom under reduced motion');
  /* studio: ON AIR lit in one step */
  tpl = models.bld_recording.build(ctxOf('bld_recording', 'MID', 0, K)); h = handle('r', tpl, { reduced: true });
  models.bld_recording.act(h, 'record').update(h, 0);
  const on = seg(tpl, 'onair');
  assert.ok(close3(colourAt(h, 'lights', on.start), lin('Neon Magenta')), 'ON AIR lit');
  /* tower: the next program at once */
  tpl = models.bld_ledtower.build(ctxOf('bld_ledtower', 'MID', 0, K)); h = handle('t', tpl, { reduced: true });
  models.bld_ledtower.show(h, 0);
  assert.equal(models.bld_ledtower._program('t'), 'name');
  h.t = 1; models.bld_ledtower.act(h, 'screen').update(h, 0);
  assert.equal(models.bld_ledtower._program('t'), 'eq', 'no pet id: the pet program is skipped');
});

/* ---------------- flash safety ---------------- */
test('city flash safety: one lens bloom per 1.5 s, one program change per 0.5 s, chases ≤ 1.5 Hz', () => {
  /* hammer the booth: a tap every 0.4 s for 6 s → blooms ≥ 1.5 s apart */
  let K = mockK('MID'), models = CITY.factory(K), tpl = models.bld_photobooth.build(ctxOf('bld_photobooth', 'MID', 0, K));
  let h = handle('hammer', tpl), act = null;
  for (let f = 0; f <= 600; f++) {
    const t = f / 60;
    h.t = t;
    if (f % 100 === 0) { act = models.bld_photobooth.act(h, 'snap'); act._t0 = t; }      /* a tap every 1.67 s */
    act.update(h, t - act._t0);
    models.bld_photobooth.idle(h);
  }
  const blooms = h.halos.filter((x) => x.name === 'lens' && x.on).map((x) => x.t);
  assert.ok(blooms.length >= 3, 'blooms happen');
  for (let i = 1; i < blooms.length; i++) assert.ok(blooms[i] - blooms[i - 1] >= 1.5 - 1e-9, 'bloom gap ' + (blooms[i] - blooms[i - 1]));
  /* taps every 0.6 s: the bloom (1.5 s into the act) never comes, so nothing flashes at all */
  h = handle('hammer2', tpl);
  for (let f = 0; f <= 600; f++) {
    const t = f / 60;
    h.t = t;
    if (f % 36 === 0) { act = models.bld_photobooth.act(h, 'snap'); act._t0 = t; }
    act.update(h, t - act._t0);
  }
  assert.equal(h.halos.filter((x) => x.name === 'lens' && x.on).length, 0);
  /* a calm sequence: tap every 2 s → a bloom every time */
  h = handle('calm', tpl);
  for (let k = 0; k < 3; k++) { h.t = k * 2; play(models.bld_photobooth.act(h, 'snap'), h); }
  assert.equal(h.halos.filter((x) => x.name === 'lens' && x.on).length, 3);
  /* the screen: taps every 0.25 s (each wipe flips at 0.2 s) change the program at most every 0.5 s;
     taps faster than the wipe's flip restart it before any change */
  K = mockK('MID', { atlases: true }); models = CITY.factory(K); tpl = models.bld_ledtower.build(ctxOf('bld_ledtower', 'MID', 0, K));
  for (const gap of [0.25, 0.1]) {
    h = handle('scr' + gap, tpl, { pets: { active: () => 'pet_dragon', perform: () => 0 } });
    const changes = []; let prev = models.bld_ledtower._program(h.uid);
    act = null;
    for (let f = 0; f <= 240; f++) {
      const t = f / 60;
      h.t = t;
      if (f % Math.round(gap * 60) === 0) { act = models.bld_ledtower.act(h, 'screen'); act._t0 = t; }
      act.update(h, t - act._t0);
      const p = models.bld_ledtower._program(h.uid);
      if (p !== prev) { changes.push(t); prev = p; }
    }
    if (gap > 0.2) assert.ok(changes.length >= 5, 'the program does change');
    else assert.equal(changes.length, 0, 'taps faster than the flip never change it');
    for (let i = 1; i < changes.length; i++) assert.ok(changes[i] - changes[i - 1] >= 0.5 - 1e-6, 'program gap ' + (changes[i] - changes[i - 1]));
  }
  /* per-light rates: the booth marquee and the beacon */
  const ch = L.LOOK.bld_photobooth.show.chase;
  assert.ok(ch.hz / ch.groups <= L.LED_CHASE_HZ && ch.hz <= L.MAX_FLASH_HZ);
  const rate = (fn, T = 12, dt = 1 / 240) => {
    let peaks = 0, a = fn(0), b = fn(dt);
    for (let t = 2 * dt; t < T; t += dt) { const c = fn(t); if (b > a && b >= c) peaks++; a = b; b = c; }
    return peaks / T;
  };
  for (let i = 0; i < 8; i++) assert.ok(rate((t) => CITY.boothChase(t, i, 1, false)) <= L.LED_CHASE_HZ + 0.05, 'bulb ' + i);
  assert.ok(rate((t) => CITY.breathe(t, 0.5, 0.6, 0, false)) <= 0.5 + 0.05, 'the beacon is a 0.5 Hz sine');
  for (let t = 0; t < 4; t += 0.01) { const b = CITY.breathe(t, 0.5, 0.6, 0.2, false); assert.ok(b >= 0.6 - 1e-9 && b <= 1 + 1e-9, 'never on/off'); }
  assert.equal(CITY.breathe(1.3, 0.5, 0.6, 0, true), 0.8);
  /* the pet pixel art flips frames at 1 Hz (two frame changes a second); the EQ glides one bar a beat */
  assert.ok(rate((t) => CITY.programPhase('pet', t, 0, 0, 0, false)) <= 1 + 0.05);
  assert.equal(CITY.programPhase('name', 3.3, 0, 0, 0.2, true), 0, 'reduced: still');
  let worst = 0, pp = CITY.programPhase('eq', 0, 0, 0, 0, false);
  for (let b = 0; b < 8; b++) for (let f = 0; f < 1; f += 0.01) { const p = CITY.programPhase('eq', 0, b, f, 0, false); worst = Math.max(worst, Math.min(Math.abs(p - pp), 1 - Math.abs(p - pp))); pp = p; }
  assert.ok(worst < 0.03, 'the EQ glides (largest step ' + worst + ')');
  /* booth countdown: each bulb lights at most once per tick (1.67 Hz) */
  for (let i = 0; i < 8; i++) {
    let flips = 0, pv = CITY.boothBulb(i, M.sample('snap', 0, {}).bulbs, 0);
    for (let t = 0; t < 1.5; t += 0.001) { const v = CITY.boothBulb(i, M.sample('snap', t, {}).bulbs, t); if (v !== pv) flips++; pv = v; }
    assert.ok(flips <= 1, 'bulb ' + i + ' switches once in the countdown');
  }
});

/* ---------------- lights ---------------- */
test('city lights: the trim accent takes the child\'s member colour live; golden hour dims neon, Showtime lights it', () => {
  const K = mockK('MID'), models = CITY.factory(K);
  for (const id of IDS) {
    const tpl = models[id].build(ctxOf(id, 'MID', 0, K)), lay = CITY.layoutOf(tpl);
    assert.equal(lay.accent, '@member');
    const lights = tpl.parts.find((p) => p.name === 'lights');
    assert.equal(lay.n, lights.tris * 3, id + ' layout covers the lights mesh');
    let n = 0; for (const s of lay.segs) { assert.equal(s.start, n); n += s.count; }
    const h = handle(id + '#L', tpl, { member: '#11AA55' });
    models[id].show(h, 0);
    const acc = seg(tpl, 'accent'), m = rgbHex('#11AA55');
    assert.ok(close3(colourAt(h, 'lights', acc.start), [m.r * CITY.NEON_DAY, m.g * CITY.NEON_DAY, m.b * CITY.NEON_DAY]), id + ' member accent at golden hour');
    models[id].show(h, 1);
    assert.ok(close3(colourAt(h, 'lights', acc.start), [m.r, m.g, m.b]), id + ' full at Showtime');
    /* a fixed-token trim ignores the member colour */
    const t2 = models[id].build(ctxOf(id, 'MID', 2, K)), h2 = handle(id + '#L2', t2, { member: '#11AA55' });
    models[id].show(h2, 1);
    assert.ok(close3(colourAt(h2, 'lights', seg(t2, 'accent').start), lin('LED Cyan')), id + ' LED Cyan trim');
    /* nothing is uploaded again when nothing changed */
    h.geos.lights.attrs.color.needsUpdate = false;
    models[id].show(h, 1);
    if (id !== 'bld_ledtower' && id !== 'bld_photobooth') assert.equal(h.geos.lights.attrs.color.needsUpdate, false, id + ' no redundant upload');
  }
  /* glass glows by the window-glow mix (golden hour 0.6 → Showtime 1) */
  const tpl = models.bld_boba.build(ctxOf('bld_boba', 'MID', 0, K)), h = handle('glass', tpl);
  const win = seg(tpl, 'window'), mix = (k) => lin('Smoked Glass').map((x, i) => x + (lin('Window Warm')[i] - x) * k);
  models.bld_boba.show(h, 0); assert.ok(close3(colourAt(h, 'lights', win.start), mix(L.DUSK.windowGlow)));
  models.bld_boba.show(h, 1); assert.ok(close3(colourAt(h, 'lights', win.start), mix(L.SHOW.windowGlow)));
});

test('city lights: booth countdown and marquee, beacon breathing, VU bars and the ON AIR hold', () => {
  const K = mockK('MID'), models = CITY.factory(K);
  /* booth: the ring lights by thirds on the ticks; a marquee only at Showtime; the strip is
     redrawn once per tap and never by idles or show */
  let tpl = models.bld_photobooth.build(ctxOf('bld_photobooth', 'MID', 0, K)), h = handle('bt', tpl);
  const lit = (i) => close3(colourAt(h, 'lights', seg(tpl, 'bulb', i).start), lin('Window Warm'), 1e-4);
  const draws0 = models.bld_photobooth._strip.draws;
  models.bld_photobooth.show(h, 0);
  const act = models.bld_photobooth.act(h, 'snap');
  assert.equal(models.bld_photobooth._strip.draws, draws0 + 1, 'one strip redraw for the tap');
  for (const [t, n] of [[0.4, 3], [1.0, 6], [1.4, 8]]) { h.t = t; act.update(h, t); assert.equal([0, 1, 2, 3, 4, 5, 6, 7].filter(lit).length, n, n + ' bulbs at ' + t); }
  play(act, h);
  h.t = 20; models.bld_photobooth.idle(h);
  assert.equal([0, 1, 2, 3, 4, 5, 6, 7].filter(lit).length, 0, 'dark at golden hour');
  models.bld_photobooth.show(h, 1);
  const lv = new Set();
  for (let t = 20; t < 26; t += 0.1) { h.t = t; models.bld_photobooth.idle(h); lv.add(colourAt(h, 'lights', seg(tpl, 'bulb', 0).start)[0].toFixed(3)); }
  assert.ok(lv.size > 5, 'the Showtime marquee moves');
  assert.equal(models.bld_photobooth._strip.draws, draws0 + 1, 'idles and show never redraw the strip');
  /* tower: the beacon breathes between 60% and 100% */
  tpl = models.bld_ledtower.build(ctxOf('bld_ledtower', 'MID', 0, K)); h = handle('lt', tpl);
  const bc = seg(tpl, 'beacon'), full = lin('Neon Magenta')[0], seen = [];
  for (let t = 0; t < 4; t += 0.05) { h.t = t; models.bld_ledtower.idle(h); seen.push(colourAt(h, 'lights', bc.start)[0] / full); }
  assert.ok(Math.min(...seen) >= 0.6 - 1e-6 && Math.max(...seen) <= 1 + 1e-6 && Math.max(...seen) - Math.min(...seen) > 0.3);
  /* studio: VU bars rise with the beat during the act; ON AIR stays lit ON_AIR_SEC after the tap */
  tpl = models.bld_recording.build(ctxOf('bld_recording', 'MID', 0, K)); h = handle('st', tpl);
  models.bld_recording.show(h, 0);
  const onSeg = seg(tpl, 'onair'), onCol = () => colourAt(h, 'lights', onSeg.start);
  const ract = models.bld_recording.act(h, 'record');
  let peakLit = 0;
  for (let t = 0; t < 3.05; t += 1 / 60) {
    h.t = t; tick(h); ract.update(h, t);
    let litSegs = 0;
    for (let b = 0; b < 3; b++) for (let j = 0; j < 6; j++) { const c = colourAt(h, 'lights', seg(tpl, 'vu', b * 8 + j).start); if (c.some((x) => x > 0.5 * Math.max(...lin('Laser Lime')))) litSegs++; }
    peakLit = Math.max(peakLit, litSegs);
  }
  assert.ok(peakLit >= 6, 'VU segments light up');
  assert.ok(close3(onCol(), lin('Neon Magenta')), 'ON AIR lit at the end of the act');
  for (const [t, want] of [[3.5, 'Neon Magenta'], [3.95, 'Neon Magenta'], [4.6, 'Gunmetal Mid']]) {
    h.t = t; models.bld_recording.idle(h);
    assert.ok(close3(onCol(), lin(want), 1e-4), 'ON AIR at ' + t + ' is ' + want);
  }
  const needle = last(h, 'meter');
  assert.ok(isRest(needle), 'the peak bar is back down');
});

test('city lights: a photocard (no batch) is non-personal — star field, ON AIR plain and lit, no member colour', () => {
  const K = mockK('MID', { atlases: true }), models = CITY.factory(K);
  /* the tower: its own meshes swap to the shared star-field material */
  let tpl = models.bld_ledtower.build(ctxOf('bld_ledtower', 'MID', 0, K));
  const meshes = { screen: { material: null }, screen2: { material: null } };
  let h = handle('pc:icon', tpl, { card: true, meshes, member: '#11AA55' });
  models.bld_ledtower.show(h, 0); models.bld_ledtower.idle(h);
  assert.equal(meshes.screen.material.name, 'led:stars'); assert.equal(meshes.screen2.material.name, 'led:stars');
  assert.equal(h.halos.length, 0, 'no halos on a card');
  const acc = seg(tpl, 'accent'), fb = lin('@member');
  assert.ok(close3(colourAt(h, 'lights', acc.start), fb.map((x) => x * CITY.NEON_DAY)), 'MEMBER_FALLBACK, not the child');
  /* the studio: the shared ON AIR material, lit */
  tpl = models.bld_recording.build(ctxOf('bld_recording', 'MID', 0, K));
  const ms = { sign: { material: null } };
  h = handle('pc:icon', tpl, { card: true, meshes: ms });
  models.bld_recording.show(h, 0);
  assert.equal(ms.sign.material.name, 'sign:ON AIR');
  assert.ok(close3(colourAt(h, 'lights', seg(tpl, 'onair').start), lin('Neon Magenta')));
  /* the booth: strip in, bulbs dark */
  tpl = models.bld_photobooth.build(ctxOf('bld_photobooth', 'MID', 0, K));
  h = handle('pc:icon', tpl, { card: true, reduced: true });
  models.bld_photobooth.show(h, 0); models.bld_photobooth.idle(h);
  assert.equal(h.writes.filter((w) => w.name === 'strip').length, 0, 'the strip stays in');
  assert.ok(close3(colourAt(h, 'lights', seg(tpl, 'bulb', 0).start), lin('Gunmetal Mid')));
});

test('city show: halos grow in with Showtime, signs glow at golden hour, the uplight decal is set once', () => {
  const K = mockK('MID'), models = CITY.factory(K);
  for (const id of IDS) {
    const tpl = models[id].build(ctxOf(id, 'MID', 0, K)), h = handle(id + '#h', tpl), look = L.LOOK[id];
    const allowedTok = new Set(L.tokensIn(look));
    models[id].show(h, 0);
    for (let k = 0; k <= 1.0001; k += 0.1) models[id].show(h, k);
    for (const x of h.halos) {
      assert.ok(allowedTok.has(x.token), id + ' halo token ' + x.token);
      assert.ok(x.size >= 0 && x.size <= 1.2, id + ' halo size ' + x.size);
      assert.ok(tpl.anchors[x.name] || tpl.pivots[x.name], id + ' halo ' + x.name + ' has an anchor');
    }
    const night = CITY.GLOW[id].halos.filter((g) => !g[3]).map((g) => g[0]);
    for (const n of night) {
      const calls = h.halos.filter((x) => x.name === n);
      assert.equal(calls[0].on, false, id + ' ' + n + ' off at golden hour');
      const ons = calls.filter((x) => x.on).map((x) => x.size);
      assert.ok(ons.length >= 2 && ons[0] < ons[ons.length - 1], id + ' ' + n + ' grows in');
    }
    assert.deepEqual(h.decals, [{ on: true, token: CITY.GLOW[id].decal }], id + ' one uplight decal');
    assert.ok(allowedTok.has(CITY.GLOW[id].decal), id + ' decal token');
  }
});

/* ---------------- idles ---------------- */
test('city idles: curtain sway, strip hold and retract, pearls bob, screen scroll; reduced motion holds still', () => {
  const K = mockK('MID', { atlases: true }), models = CITY.factory(K);
  /* the curtain hem sways, the rod line does not */
  let tpl = models.bld_photobooth.build(ctxOf('bld_photobooth', 'MID', 0, K)), h = handle('cur', tpl);
  const pos = h.geos.cloth.attrs.position.array, base = pos.slice();
  let maxHem = 0, maxTop = 0;
  const top = CITY.LAYOUT.bld_photobooth.curtainTop;
  for (let t = 0; t < 6; t += 0.05) {
    h.t = t; models.bld_photobooth.idle(h);
    for (let i = 0; i < pos.length; i += 3) {
      const d = Math.abs(pos[i + 2] - base[i + 2]);
      if (base[i + 1] > top - 0.01) maxTop = Math.max(maxTop, d); else maxHem = Math.max(maxHem, d);
    }
  }
  assert.ok(maxHem > 0.005 && maxHem <= 0.03, 'the hem sways ' + maxHem);
  assert.ok(maxTop < 1e-6, 'the rod line holds');
  /* the strip: out after the act, held STRIP_SEC, then slides back in */
  h = handle('strip', tpl);
  play(models.bld_photobooth.act(h, 'snap'), h);
  const out = CITY.LAYOUT.bld_photobooth.stripOut, t0 = h.t;
  h.t = t0 + M.STRIP_SEC - 0.1; models.bld_photobooth.idle(h);
  assert.ok(near(last(h, 'strip').p[0], out, 1e-9), 'still out');
  h.t = t0 + M.STRIP_SEC + 0.2; models.bld_photobooth.idle(h);
  const mid = last(h, 'strip').p[0];
  assert.ok(mid > 0 && mid < out, 'sliding back in');
  h.t = t0 + M.STRIP_SEC + 1; models.bld_photobooth.idle(h);
  assert.ok(near(last(h, 'strip').p[0], 0, 1e-9), 'in');
  /* boba: the pearls bob ±2% of the cup when idle */
  tpl = models.bld_boba.build(ctxOf('bld_boba', 'MID', 0, K)); h = handle('bob', tpl);
  const dys = [];
  for (let t = 0; t < 3; t += 0.05) { h.t = t; models.bld_boba.idle(h); dys.push(last(h, 'pearls').p[1]); }
  assert.ok(Math.max(...dys) > 0.005 && Math.max(...dys.map(Math.abs)) <= 0.0087 + 1e-9, 'pearls bob ' + Math.max(...dys));
  /* tower: the tiles scroll, and Showtime advances the program every 8 bars with a wipe */
  tpl = models.bld_ledtower.build(ctxOf('bld_ledtower', 'MID', 0, K)); h = handle('scroll', tpl);
  const mat = models.bld_ledtower.material('led', { name: 'screen' });
  models.bld_ledtower.show(h, 0);
  const offs = new Set();
  for (let t = 0; t < 2; t += 0.1) { h.t = t; models.bld_ledtower.idle(h); offs.add(mat.map.offset.x.toFixed(4)); }
  assert.ok(offs.size > 5, 'the name marquee scrolls');
  assert.ok(mat.color.v >= 0.69 && mat.color.v <= 0.71, 'the screen runs at 70% at golden hour');
  models.bld_ledtower.show(h, 1);
  assert.equal(mat.color.v, 1, 'full at Showtime');
  const progs = [];
  for (let t = 2; t < 2 + 24 * 2.4; t += 1 / 30) { h.t = t; tick(h); models.bld_ledtower.idle(h); const p = models.bld_ledtower._program('scroll'); if (progs[progs.length - 1] !== p) progs.push(p); }
  assert.ok(progs.length >= 3, 'Showtime auto-advance: ' + progs.join(' → '));
  assert.ok(h.writes.some((w) => w.name === 'wipe' && !isRest(w)), 'with the scanline wipe');
  /* reduced motion: one still pose, then nothing more to animate */
  for (const id of IDS) {
    const t2 = models[id].build(ctxOf(id, 'MID', 0, K)), hr = handle(id + '#red', t2, { reduced: true });
    models[id].show(hr, 0);
    models[id].idle(hr);
    const n = hr.writes.length;
    hr.t = 2; hr.beat = 0.5;
    assert.equal(models[id].idle(hr), false, id + ' reduced idle settles');
    assert.equal(hr.writes.filter((w, i) => i >= n && !isRest(w)).length, 0, id + ' no motion under reduced motion');
  }
});

test('city helpers: cup path, pearl helix, program cycle, beat index and strip layout', () => {
  /* the served cup leaves the kiosk, slides along the counter and lands on the table */
  const B = CITY.LAYOUT.bld_boba, p = [0, 0, 0];
  CITY.cupPath(0, 'L', p); assert.deepEqual(p, B.served.rest.slice());
  CITY.cupPath(1, 'L', p); assert.ok(near(p[0], B.table.x) && near(p[1], B.table.topY + B.table.top / 2) && near(p[2], B.table.z));
  CITY.cupPath(1, 'R', p); assert.ok(near(p[0], B.table.x + 0.06));
  for (let u = 0; u <= 1; u += 0.01) { CITY.cupPath(u, 'L', p); assert.ok(p[1] >= B.served.rest[1] - 1e-9 && Math.abs(p[0]) <= 0.93 && p[2] <= 0.43, 'stays on the café'); }
  /* the pearls turn once and rise, scaled out with the cup's taper */
  const o = CITY.pearlPose(1, 0, {});
  assert.ok(near(o.ry, 360) && near(o.dy, B.rise) && o.s > 1);
  assert.deepEqual({ ...CITY.pearlPose(0, 0, {}) }, { ry: 0, dy: 0, s: 1 });
  /* programs: name → pet → EQ → stars, skipping the pet without one */
  assert.deepEqual(CITY.CYCLE, ['name', 'pet', 'eq', 'stars']);
  assert.equal(CITY.CYCLE[CITY.nextProgram(0, true)], 'pet');
  assert.equal(CITY.CYCLE[CITY.nextProgram(0, false)], 'eq');
  assert.equal(CITY.CYCLE[CITY.nextProgram(3, true)], 'name');
  for (const k of Object.keys(CITY.COMPANION)) assert.ok(CITY.CYCLE.includes(k));
  /* beat index: the bar plus the wraps inside it */
  const s = {}, h = { bar: 2, beat: 0.1 };
  assert.equal(CITY.beatIndex(s, h), 8);
  h.beat = 0.9; CITY.beatIndex(s, h); h.beat = 0.05;
  assert.equal(CITY.beatIndex(s, h), 9);
  h.bar = 3; h.beat = 0.2;
  assert.equal(CITY.beatIndex(s, h), 12);
  /* the strip: 4 frames inside 128 × 256, top to bottom, 3 pet poses then the emoji */
  let y = 0;
  for (const f of CITY.STRIP_FRAMES) { assert.ok(f.x >= 0 && f.x + f.w <= 128 && f.y >= y && f.y + f.h <= 256); y = f.y + f.h; }
  assert.equal(CITY.STRIP_POSES.length, 3);
  for (const t of CITY.STRIP_BG) assert.ok(L.isToken(t), t);
  assert.equal(CITY.voiceStep('pet_dragon'), 3); assert.equal(CITY.voiceStep(null), -1);
});

test('city models: per-copy state and acts end with forget()', () => {
  const K = mockK('MID'), models = CITY.factory(K);
  for (const id of IDS) {
    const tpl = models[id].build(ctxOf(id, 'MID', 0, K)), h = handle(id + '#f', tpl);
    models[id].show(h, 0);
    const act = models[id].act(h, C.item(id).act);
    play(act, h, 0.1);
    models[id].forget(h.uid);
    const n = h.sounds.length;
    assert.equal(act.update(h, 2.9), false, id + ' the forgotten copy\'s act is over');
    assert.equal(h.sounds.length, n, id + ' and silent');
    models[id].show(h, 0);
    assert.equal(h.decals.length, 2, id + ' a fresh copy sets its decal again');
  }
});
