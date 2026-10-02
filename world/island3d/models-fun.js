/* ================================================================
   My Island 3D — fun item models (island chunk 6; classic script).
   Registers SL3D.defineModels('fun', factory(K)) for every CATALOG id of
   kind 'fun'. THREE is never touched here: geometry comes from the K.G
   primitive kit (ctx.G), materials by K key, colours from the LOOK table.
   In Node, module.exports gives the factory and the pure helpers (tests).

   Item space (kit.js): pivot at the footprint centre, base y = 0, facing +z,
   everything inside the 0.86 × 0.86 cell margin. Fun items are never jittered.
     trampoline  frame torus + 3 ink bean legs (static). The mat is a shallow
                 bowl on pivot 'mat' that deepens (y scale) at each contact.
                 Act 'bounce': asks a.pets.perform('trampoline', uid) for the
                 pet's run-over + 3 bounces; with no pet the mat does one boing.
     fountain    2-tier lathe basin (torus lip on the lower tier) + water
                 (static); an expanding ripple pair
                 on 'ripple'; 3 bubbler jets ('water' = centre / act pivot,
                 'jetL', 'jetR') that breathe idly and play the 3 s concert;
                 12 drops on a per-copy geometry placed on the CPU each frame.
                 Showtime: the jets and drops take neon tints.
     swing       A-frame + leafy top bar (static); ropes + seat on 'swing':
                 ±4° pendulum idle, the act swings to ±38° and decays over 4 s.
     bubbles     machine body + porthole (static); wand arm + ring and its soap
                 film on 'emitter' (it waves during the act); 2 idle glass
                 bubbles on 'bubA'/'bubB'. The act emits PEARL bubbles (a.emit).
   Acts (SLMotion timelines): ≤ 3 s (the swing decay excepted), interruptible
   (cancel), never stacking (a re-tap supersedes the live act on that uid and
   blends from its pose), sounds and emits from SLMotion.cues via a.sfx/a.emit.
   Reduced motion: the reduced act variants; idles hold the rest pose (the
   same pose the photocard renders).

   HANDLE used (island-architecture → modelFactoryApi): a.uid, a.t, a.phase,
   a.reduced, a.show, a.pivot(name).set(rotDeg[], pos[], scale[]),
   a.state(key, value), a.emit(kind, localPos, n, opts), a.sfx(name, vol, step),
   a.pets.{active(), perform(kind, uid)}. The fountain drops also need the
   copy's own geometry, which the documented handle does not list yet; the
   first of a.copyGeometry(part) | a.geometry(part) |
   a.batch.copyGeometry(a.uid, part) | a.object.userData.meshes[part].geometry
   is used. Without any of them the drops stay as the static rest arcs.
   ================================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    var M = null, L = null;
    try { M = require('./motion.js'); } catch (e) { M = null; }
    try { L = require('../world-look.js'); } catch (e) { L = null; }
    module.exports = factory(root, M, L);
  } else {
    var api = factory(root, null, null);
    var S = root.SL3D;
    if (S && typeof S.defineModels === 'function') S.defineModels('fun', function (K) { return api.factory(K); });
  }
}(typeof self !== 'undefined' ? self : typeof globalThis !== 'undefined' ? globalThis : this, function (root, M0, L0) {
  'use strict';

  var VERSION = 1;
  var IDS = ['trampoline', 'fountain', 'swing', 'bubbles'];
  var PI = Math.PI, TAU = PI * 2, DEG = PI / 180;

  function mo() { return M0 || root.SLMotion || null; }
  function looks() { return L0 || root.SLIslandLook || null; }
  function lookOf(id) { var L = looks(); return (L && L.LOOK && L.LOOK[id]) || null; }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function frac(v) { return v - Math.floor(v); }
  function freezeAll(o) { Object.keys(o).forEach(function (k) { if (o[k] && typeof o[k] === 'object') freezeAll(o[k]); }); return Object.freeze(o); }

  /* ---------------- default colour tokens (= the LOOK entries; the LOOK wins) ---------------- */
  var DEF = {
    trampoline: { frame: 'Tramp Frame', mat: 'Tramp Mat', shine: 'Tramp Shine', leg: 'Ink' },
    fountain: { basin: 'Basin', water: 'Water', drop: 'Water' },
    swing: { post: 'Palm Bark', leaves: 'Leaf', rope: 'Pole', seat: 'Carrot' },
    bubbles: { body: 'Grape', face: 'Cloud White', wand: 'Pole', bubble: 'Holo Pink', rim: 'Bubble Rim' }
  };
  var NEON3 = ['Neon Pink', 'Neon Cyan', 'Neon Violet'];
  var PAINT_WHITE = 'Cloud White';          /* state-coloured parts: the instance colour shows exactly */

  /* ================================================================
     LAYOUT (item-space units; all inside the 0.43 half-cell margin)
     ================================================================ */
  /* trampoline: the bible's torus R 0.42 would poke 0.04 past the margin, so R 0.375 + r 0.05 */
  var T = {
    y: 0.39, R: 0.375, r: 0.05,                       /* frame tube centre height, torus radii */
    matR: 0.345, depth: 0.016,                            /* mat bowl: rim radius (under the frame), rest depth */
    matProfile: [[1, 1], [0.7, 0.55], [0.38, 0.18], [0, 0]], /* rim → centre, so the faces look up */
    shineR: 0.1, shineS: [1, 0.09, 0.55], shineP: [-0.11, 0.38, -0.05],
    legs: [90, 210, 330], legR: 0.028, legLen: 0.315, legMid: 0.36, legY: 0.185, legTilt: 4.6
  };
  /* fountain: lower pool r 0.42 (bible 0.45, clamped to the margin), upper tier r 0.2.
     The lower tier is a lathe bowl under a torus lip: the lip gives the main silhouette a
     16-gon (12 on LOW) outline where the lathe alone would be a 10-gon (7 on LOW) */
  var F = {
    lowR: 0.4, lowH: 0.18, lowProfile: [[0.86, 0], [0.94, 0.1], [0.99, 0.45], [1, 0.95]],
    lipR: 0.385, lipr: 0.035, lipY: 0.172,
    poolR: 0.372, poolY: 0.155,
    pedTop: 0.062, pedBot: 0.085, pedY0: 0.12, pedY1: 0.55,
    upR: 0.2, upH: 0.185, upY: 0.47,
    upProfile: [[0.3, 0], [0.5, 0.18], [0.78, 0.42], [0.96, 0.72], [1, 0.9], [0.94, 1], [0.86, 0.86]],
    upPoolR: 0.176, upPoolY: 0.632,
    /* the three bubbler jets: centre (pivot 'water'), left (-x), right (+x); h = rest height */
    jets: [
      { pivot: 'water', part: 'jetC', p: [0, 0.632, 0], r: 0.045, h: 0.128, neon: 1 },
      { pivot: 'jetL', part: 'jetL', p: [-0.25, 0.155, 0], r: 0.034, h: 0.085, neon: 0 },
      { pivot: 'jetR', part: 'jetR', p: [0.25, 0.155, 0], r: 0.034, h: 0.085, neon: 2 }
    ],
    jetProfile: [[1, 0], [0.96, 0.5], [0.82, 0.8], [0.5, 0.95], [0, 1]],
    bob: 0.18, bobPeriod: 1.2,                            /* bubbler breathing: ±18 %, two day beats */
    /* ripple pair: rings at R and R·k; the pivot scales xz 1 → 1/k each period, so ring B
       ends exactly where ring A began (seamless), and ring A ends hidden under the lip */
    ripY: 0.16, ripR: 0.19, ripW: 0.024, ripK: 0.5, ripPeriod: 2.4,
    /* drops: SLMotion.drop's 3 streams × 4, re-based from the spout down into the pool */
    drops: 12, streams: 3, period: 0.9, reach: 0.32, arcScale: 0.9, spoutY: 0.76, landY: 0.165,
    dropR: 0.03, dropUp: 0.065, dropDown: 0.035, dropRadial: 4, restT: 0.125
  };
  F.arc = 0.42 * F.arcScale;                               /* SLMotion.drop's 0.42 u arc, scaled */
  /* swing: A-frame posts splayed front/back, the bar along x, the seat swings in z */
  var S = {
    halfW: 0.36, footZ: 0.3, apexY: 1.2, postR: [0.03, 0.04],
    barY: 1.2, barR: 0.034, barLen: 0.8,
    leafX: [-0.3, -0.15, 0, 0.15, 0.3], leafZ: [0.02, -0.03, 0.01, -0.02, 0.03], leafR: [0.115, 0.13, 0.135, 0.13, 0.115],
    leafY: 1.285, leafS: [1.1, 0.85, 1],
    ropeX: 0.15, ropeR: 0.012, ropeTop: 1.17, seatY: 0.36, seat: [0.36, 0.05, 0.16],
    pivotY: 1.2
  };
  /* bubble machine: body slab(0.5, 0.32, 0.36) with a white porthole, the wand up-right */
  var B = {
    body: [0.5, 0.32, 0.36],
    faceR: 0.088, faceD: 0.02, faceY: 0.16, faceZ: 0.182, bezelR: 0.094, bezelr: 0.016, bezelZ: 0.19,
    armBase: [0.1, 0.3, 0.02], armR: 0.02,
    ring: [0.23, 0.68, 0.02], ringR: 0.075, ringr: 0.014, filmR: 0.064, filmS: [1, 1, 0.14],
    rest: [{ p: [0.16, 0.77, 0.05], r: 0.045 }, { p: [-0.13, 0.365, 0.03], r: 0.045 }],
    wandGain: 4,                                           /* SLMotion's ±3° shake, ×4 on the wand */
    /* SLMotion.idleBubble starts its track at (0.12, 0.3, 0) with peak alpha 0.45: re-based to the ring */
    trackX0: 0.12, trackY0: 0.3, trackA: 0.45
  };
  (function () {
    var dx = B.ring[0] - B.armBase[0], dy = (B.ring[1] - B.ringR) - B.armBase[1];
    B.armLen = Math.sqrt(dx * dx + dy * dy);
    B.armTilt = Math.atan2(dx, dy) / DEG;
    B.armMid = [B.armBase[0] + dx / 2, B.armBase[1] + dy / 2, B.armBase[2]];
  }());

  /* ================================================================
     PURE HELPERS (no THREE; exported for Node tests)
     ================================================================ */
  /* the swing's idle pendulum in degrees (LOOK idle: ±4° every 2.4 s) */
  function pendulum(t, deg, period, phase, reduced) {
    return reduced ? 0 : deg * Math.sin(TAU * (t / period + (phase || 0)));
  }
  /* the ripple pair's xz scale: 1 → 1/k once per period */
  function rippleScale(t, period, phase, reduced) {
    return reduced ? 1 : 1 + frac(t / period + (phase || 0)) * (1 / F.ripK - 1);
  }
  /* bubbler jet j's height factor (≤ 0.83 Hz, staggered by a third) */
  function bubblerScale(t, j, phase, reduced) {
    return reduced ? 1 : 1 + F.bob * Math.sin(TAU * (t / F.bobPeriod + (phase || 0) + j / 3));
  }
  /* a point p (0..1) along a drop arc in direction ang (rad): from the spout down into the pool */
  function arcPoint(p, ang, out) {
    out = out || {};
    out.x = Math.cos(ang) * F.reach * p;
    out.z = Math.sin(ang) * F.reach * p;
    out.y = F.spoutY + F.arc * 4 * p * (1 - p) - (F.spoutY - F.landY) * p;
    return out;
  }
  /* the rest layout (template + photocard + reduced motion): each stream's 4 drops at
     p = 1/8, 3/8, 5/8, 7/8, streams at 0°, 120°, 240° */
  var DROP_REST = [];
  (function () {
    for (var i = 0; i < F.drops; i++) {
      var k = i % F.streams, per = F.drops / F.streams;
      DROP_REST.push(Object.freeze(arcPoint(frac(F.restT + Math.floor(i / F.streams) / per), TAU * k / F.streams, {})));
    }
    Object.freeze(DROP_REST);
  }());
  /* drop i at time t: item-space centre {x, y, z} and size s (0 = gone). SLMotion.drop gives
     the arc (time-shifted by the uid phase so fountains don't drip in lockstep); the arc is
     re-based so it leaves the spout and lands in the lower pool */
  var _d = { x: 0, y: 0, z: 0, a: 0 };
  function dropPose(t, i, phase, reduced, out) {
    out = out || {};
    if (reduced) { var r = DROP_REST[i]; out.x = r.x; out.y = r.y; out.z = r.z; out.s = 1; return out; }
    var M = mo(), ph = phase || 0, tt = t + ph * F.period, p;
    if (M && typeof M.drop === 'function') {
      M.drop(tt, i, F.drops, F.streams, F.period, ph, false, _d);
      p = Math.sqrt(_d.x * _d.x + _d.z * _d.z) / F.reach;
      out.x = _d.x; out.z = _d.z;
      out.y = F.spoutY + _d.y * F.arcScale - (F.spoutY - F.landY) * p;
      out.s = _d.a;
    } else {                                     /* SLMotion missing: the same arcs, locally */
      var per = Math.max(1, Math.floor(F.drops / F.streams));
      p = frac(tt / F.period + Math.floor(i / F.streams) / per);
      arcPoint(p, TAU * ((i % F.streams) / F.streams + ph), out);
      out.s = p < 0.85 ? 1 : (1 - p) / 0.15;
    }
    return out;
  }
  /* the trampoline mat's y scale for a dip (negative u): the bowl deepens from its rest depth */
  function matScaleY(dip) { return 1 + Math.max(0, -(dip || 0)) / T.depth; }
  /* the wand ring's item-space centre after the wand turns deg about z at its base */
  function wandPoint(deg, out) {
    out = out || [0, 0, 0];
    var a = (deg || 0) * DEG, c = Math.cos(a), s = Math.sin(a);
    var dx = B.ring[0] - B.armBase[0], dy = B.ring[1] - B.armBase[1];
    out[0] = B.armBase[0] + dx * c - dy * s;
    out[1] = B.armBase[1] + dx * s + dy * c;
    out[2] = B.ring[2];
    return out;
  }
  /* idle bubble k: pivot offset from its rest spot {x, y, z} and scale s (SLMotion.idleBubble,
     re-based to the wand ring; the alpha fade becomes a grow-in / shrink-out). Reduced or
     without SLMotion: the rest pose (offset 0, scale 1) */
  var _b = {};
  function bubblePose(t, k, every, phase, reduced, out) {
    out = out || {};
    var M = mo(), rb = B.rest[k];
    if (reduced || !M || typeof M.idleBubble !== 'function') { out.x = out.y = out.z = 0; out.s = 1; return out; }
    M.idleBubble(t, k, every || 2, phase || 0, false, _b);
    if (!(_b.a > 0)) { out.x = out.y = out.z = 0; out.s = 0; return out; }
    out.x = B.ring[0] + (_b.x - B.trackX0) - rb.p[0];
    out.y = B.ring[1] + (_b.y - B.trackY0) - rb.p[1];
    out.z = B.ring[2] + _b.z - rb.p[2];
    out.s = (_b.r / rb.r) * Math.min(1, _b.a / B.trackA);
    return out;
  }
  /* the pet's run-over lead (s) from a.pets.perform's return: a number or {lead}/{dur};
     any other truthy answer means "coming" (the longest run-over); falsy/negative = no pet (-1) */
  function leadOf(ret, max) {
    max = max > 0 ? max : 1.2;
    if (ret == null || ret === false) return -1;
    var v = typeof ret === 'number' ? ret
      : (typeof ret === 'object' && typeof ret.lead === 'number') ? ret.lead
      : (typeof ret === 'object' && typeof ret.dur === 'number') ? ret.dur : max;
    if (v !== v) return max;                      /* NaN: unknown */
    return v < 0 ? -1 : v > max ? max : v;
  }
  function maxLead() { var M = mo(); return M && M.BOUNCE && M.BOUNCE.maxLead > 0 ? M.BOUNCE.maxLead : 1.2; }

  /* ================================================================
     HANDLE HELPERS (allocation-free; they only call what the handle has)
     ================================================================ */
  var R3 = [0, 0, 0], P3 = [0, 0, 0], S3 = [1, 1, 1];
  function pose(a, name, rx, ry, rz, px, py, pz, sx, sy, sz) {
    var pv = a && typeof a.pivot === 'function' ? a.pivot(name) : null;
    if (!pv || typeof pv.set !== 'function') return;
    R3[0] = rx; R3[1] = ry; R3[2] = rz; P3[0] = px; P3[1] = py; P3[2] = pz; S3[0] = sx; S3[1] = sy; S3[2] = sz;
    pv.set(R3, P3, S3);
  }
  function rest(a, name) { pose(a, name, 0, 0, 0, 0, 0, 0, 1, 1, 1); }
  function timeOf(a) { return a && typeof a.t === 'number' && isFinite(a.t) ? a.t : 0; }
  function phaseOf(a) {
    if (a && typeof a.phase === 'number' && isFinite(a.phase)) return a.phase;
    var M = mo();
    return M && a ? M.phaseOf(String(a.uid)) : 0;
  }
  function safe(fn, self, x, y, z) { try { return fn.call(self, x, y, z); } catch (e) { return undefined; } }

  /* the per-copy geometry of a part (see the header) */
  function copyGeo(a, part) {
    if (!a) return null;
    try {
      if (typeof a.copyGeometry === 'function') return a.copyGeometry(part) || null;
      if (typeof a.geometry === 'function') return a.geometry(part) || null;
      if (a.batch && typeof a.batch.copyGeometry === 'function') return a.batch.copyGeometry(a.uid, part) || null;
      var o = a.object || a.group || null, ms = o && o.userData && o.userData.meshes;
      if (ms && ms[part] && ms[part].geometry) return ms[part].geometry;
    } catch (e) {}
    return null;
  }
  function attr(geo, name) {
    if (!geo) return null;
    if (typeof geo.getAttribute === 'function') return geo.getAttribute(name) || null;
    return (geo.attributes && geo.attributes[name]) || null;
  }
  /* per-copy drop state, keyed by the geometry (a clone shares the template's userData,
     so it cannot live there): the rest positions, captured on first touch */
  var dropStates = typeof WeakMap === 'function' ? new WeakMap() : null;
  function dropState(geo) {
    if (!dropStates || !geo) return null;
    var s = dropStates.get(geo);
    if (s) return s;
    var pa = attr(geo, 'position');
    if (!pa || !pa.array) return null;
    var per = pa.array.length / 3 / F.drops;
    if (per < 1 || per !== Math.floor(per)) return null;
    s = { base: new Float32Array(pa.array), per: per, k: 0, still: true };
    dropStates.set(geo, s);
    return s;
  }
  var _dp = { x: 0, y: 0, z: 0, s: 1 };
  function placeDrops(a, t, ph, reduced) {
    var geo = copyGeo(a, 'drops'), s = dropState(geo);
    if (!s || (reduced && s.still)) return;
    var pa = attr(geo, 'position'), arr = pa.array, base = s.base, n3 = s.per * 3, i, v, o, r, sc;
    for (i = 0; i < F.drops; i++) {
      o = i * n3; r = DROP_REST[i];
      if (reduced) { for (v = 0; v < n3; v++) arr[o + v] = base[o + v]; continue; }
      dropPose(t, i, ph, false, _dp);
      sc = _dp.s;
      for (v = 0; v < n3; v += 3) {
        arr[o + v] = _dp.x + (base[o + v] - r.x) * sc;
        arr[o + v + 1] = _dp.y + (base[o + v + 1] - r.y) * sc;
        arr[o + v + 2] = _dp.z + (base[o + v + 2] - r.z) * sc;
      }
    }
    s.still = !!reduced;
    pa.needsUpdate = true;
  }
  /* Showtime: drop i takes mix(drop colour, neon of its stream, k) (vertex colours, linear) */
  function tintDrops(a, k, cols) {
    if (!cols) return;
    var geo = copyGeo(a, 'drops'), s = dropState(geo), ca = attr(geo, 'color');
    if (!s || !ca || !ca.array) return;
    k = clamp01(+k || 0);
    if (Math.abs(k - s.k) < 0.02 && !((k === 0 || k === 1) && s.k !== k)) return;
    var arr = ca.array, n3 = s.per * 3, w = cols.base, i, v, o, c, r, g, b;
    for (i = 0; i < F.drops; i++) {
      c = cols.neon[i % F.streams]; o = i * n3;
      r = w.r + (c.r - w.r) * k; g = w.g + (c.g - w.g) * k; b = w.b + (c.b - w.b) * k;
      for (v = 0; v < n3; v += 3) { arr[o + v] = r; arr[o + v + 1] = g; arr[o + v + 2] = b; }
    }
    s.k = k;
    ca.needsUpdate = true;
  }

  /* ================================================================
     ACT BOOK — one live act per uid, driven by an SLMotion timeline.
     spec: {name, reduced, lead?, apply(a, out, t, rec), rest(a, rec),
            emitAt?(a, rec) → localPos, emitOpts?(a, rec, cue) → opts}
     Act: {name, dur, update(a, tAct) → alive, cancel()}
     ================================================================ */
  var CARRY_WINDOW = 0.25;                   /* a cancel this recent is an interruption: carry the pose */
  function makeBook() {
    var recs = new Map();
    function live(uid) { var r = recs.get(uid); return r && !r.done ? r : null; }
    function fire(rec, h, t) {
      var cues = rec.cues;
      while (rec.ci < cues.length && cues[rec.ci].t <= t + 1e-6) {
        var c = cues[rec.ci++];
        if (c.sfx) { if (typeof h.sfx === 'function') safe(h.sfx, h, c.sfx, c.vol, c.step); }
        else if (c.emit && typeof h.emit === 'function') {
          var at = rec.spec.emitAt ? rec.spec.emitAt(h, rec) : 'top';
          var opts = rec.spec.emitOpts ? rec.spec.emitOpts(h, rec, c) : undefined;
          try { h.emit(c.emit, at, c.n, opts); } catch (e) {}
        }
      }
    }
    function step(rec, h, tAct) {
      if (rec.done) return false;
      if (h) rec.h = h; else h = rec.h;
      var M = mo(), t = +tAct;
      if (!(t >= 0)) t = 0;
      rec.lastT = timeOf(h);
      fire(rec, h, t);
      var tt = t < rec.dur ? t : rec.dur;
      M.sample(rec.name, tt, rec.out, rec.o);
      rec.spec.apply(h, rec.out, tt, rec);
      if (t >= rec.dur) {                      /* the end pose is the rest pose */
        rec.done = true;
        if (recs.get(rec.uid) === rec) recs.delete(rec.uid);
        return false;
      }
      return true;
    }
    function cancel(rec) {
      if (rec.done) return;
      rec.done = true; rec.cancelled = true;
      var h = rec.h;                           /* only rest it through a handle still bound to this uid */
      if (h && h.uid === rec.uid && rec.spec.rest) { try { rec.spec.rest(h, rec); } catch (e) {} }
    }
    function start(a, spec) {
      var M = mo();
      if (!a || !M || !M.ACTS || !M.ACTS[spec.name]) return null;
      var uid = a.uid, prev = recs.get(uid), now = timeOf(a), from = null;
      if (prev && prev.name === spec.name &&
          (!prev.done || (prev.cancelled && Math.abs(now - prev.lastT) <= CARRY_WINDOW))) from = M.carry(spec.name, prev.out);
      if (prev && !prev.done) { prev.done = true; prev.superseded = true; }   /* never two on one uid */
      var o = { reduced: !!spec.reduced, from: from };
      if (spec.lead != null) o.lead = spec.lead;
      var rec = {
        uid: uid, name: spec.name, spec: spec, o: o, out: {}, cues: M.cues(spec.name, o), ci: 0,
        dur: M.durOf(spec.name, o), done: false, cancelled: false, superseded: false, lastT: now, h: a
      };
      recs.set(uid, rec);
      return {
        name: spec.name, dur: rec.dur,
        update: function (h, tAct) { return step(rec, h, tAct); },
        cancel: function () { cancel(rec); }
      };
    }
    return { live: live, start: start, size: function () { return recs.size; } };
  }

  /* ================================================================
     BUILDERS (run only with a real K: ctx.G is the tier's geometry kit)
     ================================================================ */
  function colorsOf(ctx, dflt) {
    var c = (ctx.look && ctx.look.colors) || {}, out = {};
    Object.keys(dflt).forEach(function (k) { out[k] = typeof c[k] === 'string' ? c[k] : dflt[k]; });
    return out;
  }
  function matOf(ctx, part, dflt) { var m = ctx.look && ctx.look.mats; return (m && m[part]) || dflt; }
  function outlineOf(ctx) { return !!(ctx.look && ctx.look.outline); }
  function topOf(ctx, h) { return ((ctx.look && ctx.look.h > 0) ? ctx.look.h : h) + 0.15; }
  /* the toy shading: lit tops in the highlight tone, undersides in the shade tone */
  function toyShade(G, geo, tok, hi, lo) {
    hi = hi == null ? 0.6 : hi; lo = lo == null ? -0.35 : lo;
    return G.paintBy(geo, function (v) { return v.ny > hi ? [tok, 'hi'] : v.ny < lo ? [tok, 'shade'] : tok; });
  }

  function buildTrampoline(ctx) {
    var G = ctx.G, c = colorsOf(ctx, DEF.trampoline), ol = outlineOf(ctx);
    /* the frame: a torus laid flat, lit on top */
    var frame = toyShade(G, G.t(G.ring(T.R, T.r), { r: [90, 0, 0], p: [0, T.y, 0] }), c.frame, 0.5);
    var geos = [frame];
    /* 3 ink bean legs (front, back-left, back-right), tops leaning in */
    for (var k = 0; k < T.legs.length; k++) {
      var A = T.legs[k];
      geos.push(G.paint(G.t(G.bean(T.legR, T.legLen), {
        r: [0, -A, T.legTilt], p: [Math.cos(A * DEG) * T.legMid, T.legY, Math.sin(A * DEG) * T.legMid]
      }), c.leg));
    }
    /* the mat: a shallow bowl whose rim sits under the frame tube; the shine dab sits on it */
    var mat = G.paint(G.t(G.drop(T.matR, T.depth, T.matProfile), { p: [0, T.y - T.depth, 0] }), c.mat);
    var shine = G.paint(G.t(G.puff(T.shineR), { s: T.shineS, p: T.shineP }), c.shine);
    return ctx.K.template(ctx)
      .part('frame', geos, 'toon', { castShadow: true, outline: ol })
      .pivot('mat', [0, T.y, 0])
      .part('mat', [mat, shine], 'toon', { pivot: 'mat' })
      .anchor('top', [0, topOf(ctx, 0.45), 0])
      .anchor('seat', [0, T.y - T.depth, 0])
      .done();
  }

  function dropGeo(G) {
    /* a cartoon drop: two open 4-sided cones, pointy top and short round-ish bottom */
    var top = G.t(G.tube(0, F.dropR, F.dropUp, { radial: F.dropRadial, open: true }), { p: [0, F.dropUp / 2, 0] });
    var bot = G.t(G.tube(F.dropR, 0, F.dropDown, { radial: F.dropRadial, open: true }), { p: [0, -F.dropDown / 2, 0] });
    return G.merge([top, bot]);
  }
  function buildFountain(ctx) {
    var G = ctx.G, c = colorsOf(ctx, DEF.fountain), ol = outlineOf(ctx);
    var neon = ctx.look && ctx.look.show && Array.isArray(ctx.look.show.neon) && ctx.look.show.neon.length >= 3 ? ctx.look.show.neon : NEON3;
    /* basin: lower lathe bowl + torus lip, pedestal, upper lathe bowl (rolled lip), two water discs */
    var lower = toyShade(G, G.drop(F.lowR, F.lowH, F.lowProfile), c.basin);
    var lip = toyShade(G, G.t(G.ring(F.lipR, F.lipr), { r: [90, 0, 0], p: [0, F.lipY, 0] }), c.basin, 0.5);
    var ped = toyShade(G, G.t(G.tube(F.pedTop, F.pedBot, F.pedY1 - F.pedY0, { open: true }), { p: [0, (F.pedY0 + F.pedY1) / 2, 0] }), c.basin);
    var upper = toyShade(G, G.t(G.drop(F.upR, F.upH, F.upProfile), { p: [0, F.upY, 0] }), c.basin);
    /* the water: near-flat open cones (only the upward side; no hidden base cap) */
    function water(r, y) { return G.paint(G.t(G.tube(0, r, 0.004, { open: true }), { p: [0, y, 0] }), c.water); }
    var pool = water(F.poolR, F.poolY), upPool = water(F.upPoolR, F.upPoolY);
    /* the ripple pair: thin sloped rings just above the lower pool */
    function ring(R, w) { return G.paint(G.t(G.tube(R - w / 2, R + w / 2, 0.006, { open: true }), { p: [0, F.ripY, 0] }), c.water, 'hi'); }
    var ripA = ring(F.ripR, F.ripW), ripB = ring(F.ripR * F.ripK, F.ripW * F.ripK);
    /* a jet: a rounded water column; paler at the tip (the instance colour carries Water / neon) */
    function jet(J) {
      var g = G.t(G.drop(J.r, J.h, F.jetProfile), { p: J.p }), y0 = J.p[1] + J.h * 0.35;
      return G.paintBy(g, function (v) { return v.y < y0 ? [PAINT_WHITE, 'shade'] : PAINT_WHITE; });
    }
    var drops = [];
    for (var i = 0; i < F.drops; i++) {
      var r = DROP_REST[i];
      drops.push(G.paint(G.t(dropGeo(G), { p: [r.x, r.y, r.z] }), c.drop));
    }
    var b = ctx.K.template(ctx)
      .part('basin', [lower, lip, pool, ped, upper, upPool], 'toon', { castShadow: true, outline: ol })
      .pivot('ripple', [0, F.ripY, 0])
      .part('ripple', [ripA, ripB], 'toon', { pivot: 'ripple' });
    F.jets.forEach(function (J) {
      b.pivot(J.pivot, J.p).part(J.part, [jet(J)], 'state', { pivot: J.pivot, stateColor: { key: 'show', off: c.water, on: neon[J.neon], initial: 0 } });
    });
    return b.part('drops', drops, 'state', { perCopy: true })
      .anchor('top', [0, topOf(ctx, 0.95), 0])
      .anchor('spout', [0, F.spoutY, 0])
      .done();
  }

  function buildSwing(ctx) {
    var G = ctx.G, c = colorsOf(ctx, DEF.swing), ol = outlineOf(ctx);
    var frame = [];
    /* 2 A-frames at x = ±halfW: posts from feet at z = ±footZ up to the apex at z = 0 */
    var len = Math.sqrt(S.footZ * S.footZ + S.apexY * S.apexY), tilt = Math.atan2(S.footZ, S.apexY) / DEG;
    [-1, 1].forEach(function (sx) {
      [-1, 1].forEach(function (fz) {
        frame.push(G.paint(G.t(G.tube(S.postR[0], S.postR[1], len), { r: [-fz * tilt, 0, 0], p: [sx * S.halfW, S.apexY / 2, fz * S.footZ / 2] }), c.post));
      });
    });
    frame.push(toyShade(G, G.t(G.tube(S.barR, S.barLen), { r: [0, 0, 90], p: [0, S.barY, 0] }), c.post, 0.7, -0.5));
    /* the leafy top bar: 5 puffs, lit tops, shaded undersides */
    for (var i = 0; i < S.leafX.length; i++) {
      frame.push(toyShade(G, G.t(G.puff(S.leafR[i]), { s: S.leafS, p: [S.leafX[i], S.leafY, S.leafZ[i]] }), c.leaves, 0.55, -0.3));
    }
    /* ropes + seat hang from the bar on the 'swing' pivot */
    var ropeLen = S.ropeTop - (S.seatY + S.seat[1] / 2), ropeY = S.ropeTop - ropeLen / 2;
    var seatParts = [
      G.paint(G.t(G.tube(S.ropeR, ropeLen, { radial: 4 }), { p: [-S.ropeX, ropeY, 0] }), c.rope),
      G.paint(G.t(G.tube(S.ropeR, ropeLen, { radial: 4 }), { p: [S.ropeX, ropeY, 0] }), c.rope),
      toyShade(G, G.t(G.slab(S.seat[0], S.seat[1], S.seat[2]), { p: [0, S.seatY, 0] }), c.seat)
    ];
    return ctx.K.template(ctx)
      .part('frame', frame, 'toon', { castShadow: true, outline: ol })
      .pivot('swing', [0, S.pivotY, 0])
      .part('swing', seatParts, 'toon', { pivot: 'swing' })
      .anchor('top', [0, topOf(ctx, 1.4), 0])
      .anchor('seat', [0, S.seatY + S.seat[1] / 2, 0])
      .done();
  }

  function buildBubbles(ctx) {
    var G = ctx.G, c = colorsOf(ctx, DEF.bubbles), ol = outlineOf(ctx), glass = matOf(ctx, 'bubble', 'glass');
    /* the machine: a chunky rounded box with a white porthole in a Bubble Rim bezel */
    var body = toyShade(G, G.t(G.slab(B.body[0], B.body[1], B.body[2]), { p: [0, B.body[1] / 2, 0] }), c.body);
    var face = G.paint(G.t(G.tube(B.faceR, B.faceR, B.faceD), { r: [90, 0, 0], p: [0, B.faceY, B.faceZ] }), c.face);
    var bezel = G.paint(G.t(G.ring(B.bezelR, B.bezelr), { p: [0, B.faceY, B.bezelZ] }), c.rim);
    /* the wand: an arm up to a ring facing the camera, a soap film inside it */
    var arm = G.paint(G.t(G.tube(B.armR, B.armLen), { r: [0, 0, -B.armTilt], p: B.armMid }), c.wand);
    var ring = toyShade(G, G.t(G.ring(B.ringR, B.ringr), { p: B.ring }), c.wand, 0.7, -0.6);
    var film = G.paint(G.t(G.puff(B.filmR), { s: B.filmS, p: B.ring }), c.bubble);
    /* two idle bubbles: rest = one just blown above the ring, one resting on the machine */
    var bubA = G.paint(G.t(G.puff(B.rest[0].r), { p: B.rest[0].p }), c.bubble);
    var bubB = G.paint(G.t(G.puff(B.rest[1].r), { p: B.rest[1].p }), c.bubble);
    return ctx.K.template(ctx)
      .part('body', [body, face, bezel], 'toon', { castShadow: true, outline: ol })
      .pivot('emitter', B.armBase)
      .part('wand', [arm, ring], 'toon', { pivot: 'emitter' })
      .part('film', [film], glass, { pivot: 'emitter', receiveShadow: false })
      .pivot('bubA', B.rest[0].p)
      .part('bubbleA', [bubA], glass, { pivot: 'bubA', receiveShadow: false })
      .pivot('bubB', B.rest[1].p)
      .part('bubbleB', [bubB], glass, { pivot: 'bubB', receiveShadow: false })
      .anchor('top', [0, topOf(ctx, 0.8), 0])
      .anchor('wand', B.ring.slice())
      .done();
  }

  /* ================================================================
     FACTORY — SL3D.defineModels('fun', K → {id: {build, idle, act, show}})
     ================================================================ */
  function factory(K) {
    var dropCols = null;
    function cols() {
      if (dropCols) return dropCols;
      if (!K || typeof K.col !== 'function') return null;
      var lk = lookOf('fountain'), c = (lk && lk.colors) || DEF.fountain;
      var neon = lk && lk.show && Array.isArray(lk.show.neon) && lk.show.neon.length >= 3 ? lk.show.neon : NEON3;
      dropCols = { base: K.col(c.drop || DEF.fountain.drop), neon: [K.col(neon[0]), K.col(neon[1]), K.col(neon[2])] };
      return dropCols;
    }
    function idleOf(id, key, dflt) { var lk = lookOf(id), i = lk && lk.idle; return i && typeof i[key] === 'number' ? i[key] : dflt; }

    /* ---------- trampoline ---------- */
    var tBook = makeBook();
    function trampApply(a, out) { pose(a, 'mat', 0, 0, 0, 0, 0, 0, 1, matScaleY(out.matDip), 1); }
    function trampRest(a) { rest(a, 'mat'); }
    function askPet(a) {
      var p = a.pets;
      if (!p || typeof p.perform !== 'function') return -1;
      try {
        if (typeof p.active === 'function' && !p.active()) return -1;
        return leadOf(p.perform('trampoline', a.uid), maxLead());
      } catch (e) { return -1; }
    }

    /* ---------- fountain ---------- */
    var fBook = makeBook(), fStill = new Map(), fCore = new Map(), fShow = new Map();
    /* the Showtime mix: the jets' state colour (written only when k moves) + the drop tints */
    function fountainShow(a, k) {
      k = clamp01(+k || 0);
      var prev = fShow.get(a.uid);
      if (prev === undefined || Math.abs(k - prev) >= 0.01 || ((k === 0 || k === 1) && prev !== k)) {
        fShow.set(a.uid, k);
        if (typeof a.state === 'function') safe(a.state, a, 'show', k);
      }
      tintDrops(a, k, cols());
    }
    function jetsPose(a, t, ph, reduced, out) {
      for (var j = 0; j < F.jets.length; j++) {
        var J = F.jets[j], v = out ? (j === 0 ? out.c : j === 1 ? out.l : out.r) || 0 : 0;
        var sy = bubblerScale(t, j, ph, reduced) + v / J.h, sx = 1 + 0.18 * clamp01(v / 0.9);
        pose(a, J.pivot, 0, 0, 0, 0, 0, 0, sx, sy, sx);
      }
    }
    /* ripple + drops (+ the Showtime tint); once per uid per clock tick even when both the
       idle and the act tick this frame */
    function fountainCore(a, t, ph, reduced) {
      if (fCore.get(a.uid) === t) return;
      fCore.set(a.uid, t);
      var s = rippleScale(t, F.ripPeriod, ph, reduced);
      pose(a, 'ripple', 0, 0, 0, 0, 0, 0, s, 1, s);
      placeDrops(a, t, ph, reduced);
      if (typeof a.show === 'number') fountainShow(a, a.show);
    }
    function fountainRest(a) { jetsPose(a, 0, 0, true, null); }

    /* ---------- swing ---------- */
    var sBook = makeBook(), sStill = new Map();
    var swingDeg = idleOf('swing', 'deg', 4), swingPeriod = idleOf('swing', 'period', 2.4);
    function swingIdleDeg(a, reduced) { return pendulum(timeOf(a), swingDeg, swingPeriod, phaseOf(a), reduced); }
    function swingApply(a, out, t, rec) {
      pose(a, 'swing', (out.deg || 0) + (out.idleMix == null ? 1 : out.idleMix) * swingIdleDeg(a, rec.o.reduced), 0, 0, 0, 0, 0, 1, 1, 1);
    }

    /* ---------- bubble machine ---------- */
    var bBook = makeBook(), bStill = new Map(), _bp = {}, EP = [0, 0, 0];
    var bubbleEvery = idleOf('bubbles', 'every', 2);
    var EMIT = { pearl: true, seed: 0, reduced: false, idle: false };
    function wandDeg(out) { return -(out && out.wobble || 0) * B.wandGain; }
    function bubblesApply(a, out) { pose(a, 'emitter', 0, 0, wandDeg(out), 0, 0, 0, 1, 1, 1); }
    function bubblesRest(a) { rest(a, 'emitter'); }
    function bubbleOpts(a, rec) {
      var M = mo();
      EMIT.seed = ((M ? M.hash(String(a.uid)) : 0) + rec.ci * 2654435761) >>> 0;
      EMIT.reduced = !!rec.o.reduced;
      return EMIT;
    }

    return {
      trampoline: {
        build: buildTrampoline,
        /* no idle (LOOK idle is null): the mat only moves in its act */
        act: function (a, name) {
          if (!a) return null;
          var reduced = !!a.reduced, lead = reduced ? -1 : askPet(a);
          /* with no pet (or reduced motion) the mat does its one gentle boing */
          return tBook.start(a, lead < 0 ? { name: 'bounce', reduced: true, apply: trampApply, rest: trampRest }
            : { name: 'bounce', reduced: false, lead: lead, apply: trampApply, rest: trampRest });
        }
      },

      fountain: {
        build: buildFountain,
        idle: function (a) {
          var reduced = !!a.reduced, t = timeOf(a), ph = phaseOf(a);
          if (reduced) {
            if (fStill.get(a.uid) || fBook.live(a.uid)) return false;
            fStill.set(a.uid, true);
            rest(a, 'ripple'); fountainRest(a); placeDrops(a, t, ph, true);
            if (typeof a.show === 'number') fountainShow(a, a.show);
            return true;
          }
          fStill.delete(a.uid);
          fountainCore(a, t, ph, false);
          if (!fBook.live(a.uid)) jetsPose(a, t, ph, false, null);
          return true;
        },
        act: function (a, name) {
          if (!a) return null;
          return fBook.start(a, {
            name: 'splash', reduced: !!a.reduced,
            apply: function (h, out, tt, rec) {
              var t = timeOf(h), ph = phaseOf(h);
              fountainCore(h, t, ph, rec.o.reduced);
              jetsPose(h, t, ph, rec.o.reduced, out);
            },
            rest: fountainRest
          });
        },
        show: function (a, k) { if (a) fountainShow(a, k); }
      },

      swing: {
        build: buildSwing,
        idle: function (a) {
          if (sBook.live(a.uid)) return true;                      /* the act owns the seat */
          if (a.reduced) {
            if (sStill.get(a.uid)) return false;
            sStill.set(a.uid, true);
            rest(a, 'swing');
            return true;
          }
          sStill.delete(a.uid);
          pose(a, 'swing', swingIdleDeg(a, false), 0, 0, 0, 0, 0, 1, 1, 1);
          return true;
        },
        act: function (a, name) {
          if (!a) return null;
          return sBook.start(a, { name: 'swing', reduced: !!a.reduced, apply: swingApply, rest: function (h) { rest(h, 'swing'); } });
        }
      },

      bubbles: {
        build: buildBubbles,
        idle: function (a) {
          var reduced = !!a.reduced;
          if (reduced) {
            if (bStill.get(a.uid)) return false;
            bStill.set(a.uid, true);
            rest(a, 'bubA'); rest(a, 'bubB');
            return true;
          }
          bStill.delete(a.uid);
          var t = timeOf(a), ph = phaseOf(a);
          bubblePose(t, 0, bubbleEvery, ph, false, _bp);
          pose(a, 'bubA', 0, 0, 0, _bp.x, _bp.y, _bp.z, _bp.s, _bp.s, _bp.s);
          bubblePose(t, 1, bubbleEvery, ph, false, _bp);
          pose(a, 'bubB', 0, 0, 0, _bp.x, _bp.y, _bp.z, _bp.s, _bp.s, _bp.s);
          return true;
        },
        act: function (a, name) {
          if (!a) return null;
          return bBook.start(a, {
            name: 'bubbles', reduced: !!a.reduced, apply: bubblesApply, rest: bubblesRest,
            emitAt: function (h, rec) { return wandPoint(wandDeg(rec.out), EP); },
            emitOpts: bubbleOpts
          });
        }
      }
    };
  }

  return {
    VERSION: VERSION, IDS: IDS, factory: factory,
    LAYOUT: freezeAll({ trampoline: T, fountain: F, swing: S, bubbles: B }), DROP_REST: DROP_REST, DEFAULT_COLORS: freezeAll(DEF),
    /* pure helpers */
    pendulum: pendulum, rippleScale: rippleScale, bubblerScale: bubblerScale, arcPoint: arcPoint, dropPose: dropPose,
    matScaleY: matScaleY, wandPoint: wandPoint, bubblePose: bubblePose, leadOf: leadOf, makeBook: makeBook
  };
}));
