/* ================================================================
   My Island 3D — fun item models (island chunk 6, Encore City v2 restyle; classic script).
   Registers SL3D.defineModels('fun', factory(K)) for the four garden-fun ids
   (CATALOG kind 'fun' outside cat 'city': the city buildings live in
   models-city.js / models-stage.js). THREE is never touched as a global:
   geometry comes from the K.G primitive kit (ctx.G; the faceted canopy
   clusters take a detail-0 icosahedron from ctx.K.THREE), materials by K key,
   colours from the LOOK table. In Node, module.exports gives the factory and
   the pure helpers (tests).

   Item space (kit.js): pivot at the footprint centre, base y = 0, facing +z,
   everything inside the 0.86 × 0.86 cell margin. Fun items are never jittered.
   Shapes are modern; acts and descriptions stay true:
     trampoline  a Gunmetal frame ring under an LED Cyan rim pad on 3 slim
                 Midnight Ink legs (static). The Graphite mat is a shallow bowl
                 on pivot 'mat' that deepens (y scale) at each contact.
                 Act 'bounce': asks a.pets.perform('trampoline', uid) for the
                 pet's run-over + 3 bounces; with no pet the mat does one boing.
     fountain    a square Concrete plaza basin (four walls, a coping, a square
                 pool, a plinth with a nozzle plate; static); square ripples on
                 'ripple'; 3 bubbler jets ('water' = centre / act pivot, 'jetL',
                 'jetR') that breathe idly and play the 3 s concert; 12 drops on
                 a per-copy geometry placed on the CPU each frame.
                 Showtime: the jets and drops take LED neon tints.
     swing       a low-poly tree (faceted trunk, limb and leaf clusters; static);
                 ropes + Teak seat on 'swing' under the limb: ±4° pendulum
                 idle, the act swings to ±38° and decays over 4 s.
     bubbles     a Graphite speaker-cabinet bubble cannon (woofer + tweeter;
                 static); its post, barrel, FOIL mouth ring and soap film on
                 'emitter' (it sweeps during the act); 2 idle glass bubbles on
                 'bubA'/'bubB'. The act emits PEARL bubbles (a.emit).
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

  var VERSION = 2;                          /* 2 = the Encore City restyle */
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
    trampoline: { frame: 'Gunmetal', mat: 'Graphite', shine: 'LED Cyan', leg: 'Midnight Ink' },
    fountain: { basin: 'Concrete Light', water: 'Water', drop: 'Water' },
    swing: { post: 'Palm Bark', leaves: 'Leaf Deep', rope: 'Pole', seat: 'Teak' },
    bubbles: { body: 'Graphite', face: 'Gunmetal', wand: 'Pole', bubble: 'Holo Pink', rim: 'Bubble Rim' }
  };
  /* default materials for parts the LOOK entry does not list (its mats win): the cannon's FOIL ring */
  var MATS = { trampoline: {}, fountain: {}, swing: {}, bubbles: { rim: 'foil' } };
  var NEON3 = ['Neon Magenta', 'LED Cyan', 'Electric Violet'];   /* = SLIslandLook.NEON3 (v2) */
  var PAINT_WHITE = 'Cloud White';          /* state-coloured parts: the instance colour shows exactly */
  var ICO_TILT = Math.atan2(1, (1 + Math.sqrt(5)) / 2) / DEG;   /* 31.72°: an icosahedron vertex on +y */

  /* ================================================================
     LAYOUT (item-space units; all inside the 0.43 half-cell margin)
     ================================================================ */
  /* trampoline: a slim gunmetal frame ring, the LED Cyan pad (a flattened torus) riding on it */
  var T = {
    y: 0.39, R: 0.385, r: 0.03,                               /* frame tube centre height, torus radii */
    padR: 0.36, padr: 0.042, padS: 0.42, padY: 0.405,         /* the rim pad: torus radii, y squash, centre height */
    matR: 0.33, depth: 0.016,                                 /* mat bowl: rim radius (under the pad), rest depth */
    matProfile: [[1, 1], [0.7, 0.55], [0.38, 0.18], [0, 0]],  /* rim → centre, so the faces look up */
    legs: [90, 210, 330], legR: 0.018, legTop: 0.38, legIn: 0.36, legOut: 0.385, footR: 0.036, footH: 0.02
  };
  /* fountain: a square plaza basin. Four walls (half-size 0.41, 0.05 thick) hold a square pool;
     a square plinth carries the nozzle plate and the centre jet */
  var F = {
    half: 0.41, wall: 0.05, rimH: 0.17, coping: [0.062, 0.022],
    poolHalf: 0.36, poolY: 0.135,
    plinth: 0.055, plinthY0: 0.13, plinthY1: 0.575, capHalf: 0.12, capH: 0.035,
    /* the three bubbler jets: centre (pivot 'water'), left (-x), right (+x); h = rest height */
    jets: [
      { pivot: 'water', part: 'jetC', p: [0, 0.61, 0], r: 0.045, h: 0.13, neon: 1 },
      { pivot: 'jetL', part: 'jetL', p: [-0.24, 0.135, 0], r: 0.034, h: 0.085, neon: 0 },
      { pivot: 'jetR', part: 'jetR', p: [0.24, 0.135, 0], r: 0.034, h: 0.085, neon: 2 }
    ],
    jetProfile: [[1, 0], [0.96, 0.5], [0.82, 0.8], [0.5, 0.95], [0, 1]],
    bob: 0.18, bobPeriod: 1.2,                            /* bubbler breathing: ±18 %, two day beats */
    /* ripple pair: square rings of half-size H and H·k; the pivot scales xz 1 → 1/k each period,
       so square B ends exactly where square A began (seamless), and A ends hidden under the walls */
    ripY: 0.14, ripHalf: 0.192, ripW: 0.022, ripK: 0.5, ripPeriod: 2.4,
    /* drops: SLMotion.drop's 3 streams × 4, re-based from the spout down into the pool */
    drops: 12, streams: 3, period: 0.9, reach: 0.32, arcScale: 0.9, spoutY: 0.74, landY: 0.145,
    dropR: 0.03, dropUp: 0.065, dropDown: 0.035, dropRadial: 4, restT: 0.125
  };
  F.arc = 0.42 * F.arcScale;                               /* SLMotion.drop's 0.42 u arc, scaled */
  /* swing: a low-poly tree — a trunk on the left, a limb across, faceted leaf clusters above; the
     ropes and seat hang from the limb and swing in z */
  var S = {
    trunk: { x: -0.29, z: -0.04, rBot: 0.085, rTop: 0.05, h: 1.24 },
    limb: { from: [-0.29, 1.12, -0.04], to: [0.32, 1.21, -0.02], r0: 0.045, r1: 0.028 },
    leaves: [
      { c: [-0.22, 1.25, -0.02], r: 0.21, tone: 'base' }, { c: [0.02, 1.3, -0.08], r: 0.2, tone: 'hi' },
      { c: [0.24, 1.22, 0], r: 0.18, tone: 'base' }, { c: [-0.05, 1.17, 0.16], r: 0.16, tone: 'shade' },
      { c: [0.14, 1.33, 0.13], r: 0.15, tone: 'base' }, { c: [-0.12, 1.36, 0.06], r: 0.14, tone: 'hi' }
    ],
    seatX: 0.06, ropeX: 0.13, ropeR: 0.01, ropeTop: 1.16, seatY: 0.36, seat: [0.32, 0.045, 0.15],
    pivotY: 1.17
  };
  /* bubble cannon: a speaker cabinet (woofer + tweeter on the front), a post up to a barrel
     aimed up and out at the camera, the FOIL ring at its mouth (the ring centre is the emitter) */
  var B = {
    body: [0.5, 0.32, 0.36],
    faceZ: 0.18, woofer: { x: -0.085, y: 0.16, R: 0.096, r: 0.016, cone: 0.088 }, tweeter: { x: 0.15, y: 0.215, R: 0.036, r: 0.01 },
    armBase: [0.1, 0.32, 0.02], armR: 0.022,
    ring: [0.23, 0.68, 0.02], ringR: 0.075, ringr: 0.016, filmR: 0.064, filmS: [1, 1, 0.14],
    barrel: { r: 0.07, len: 0.17 }, aim: 28,               /* the barrel tips up by aim degrees */
    rest: [{ p: [0.2, 0.8, 0.07], r: 0.045 }, { p: [-0.13, 0.365, 0.03], r: 0.045 }],
    wandGain: 4,                                           /* SLMotion's ±3° shake, ×4 on the wand */
    /* SLMotion.idleBubble starts its track at (0.12, 0.3, 0) with peak alpha 0.45: re-based to the ring */
    trackX0: 0.12, trackY0: 0.3, trackA: 0.45
  };
  (function () {
    var dx = B.ring[0] - B.armBase[0], dy = (B.ring[1] - B.barrel.r) - B.armBase[1];
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
  /* one flat tone per facet (faceted canopies and stone): lit tops, mid sides, shaded undersides */
  function facetShade(G, geo, tok, mid, hi, lo) {
    hi = hi == null ? 0.5 : hi; lo = lo == null ? -0.3 : lo;
    return G.paintBy(geo, function (v) { return v.ny > hi ? [tok, 'hi'] : v.ny < lo ? [tok, 'shade'] : [tok, mid || 'base']; }, { perFace: true });
  }
  function rad(ctx, n) { return ctx.tier === 'LOW' ? Math.max(3, Math.round(n * 0.7)) : n; }
  /* a crisp box: BoxGeometry (12 tris), the architecture look at this scale */
  function box(G, w, h, d, p, r) { return G.t(G.slab(w, h, d, 0), { p: p, r: r }); }
  /* Euler XYZ degrees (three.js order) that turn +y onto (dx, dy, dz) */
  function alignY(dx, dy, dz) {
    var l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    dx /= l; dy /= l; dz /= l;
    var gz = -Math.asin(dx < -1 ? -1 : dx > 1 ? 1 : dx);
    var ax = Math.abs(dx) > 0.99999 ? 0 : Math.atan2(dz, dy);
    return [ax / DEG, 0, gz / DEG];
  }
  /* a tapered tube from a (radius r0) to b (radius r1) */
  function rod(G, a, b, r0, r1, radial) {
    var dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-4;
    return G.t(G.tube(r1, r0, len, { radial: radial }), { r: alignY(dx, dy, dz), p: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2] });
  }
  /* a faceted detail-0 icosahedron (circumradius r, a vertex up): the low-poly leaf cluster. The kit
     has no detail-0 primitive, so it comes from ctx.K.THREE (an 80-face faceted puff without it) */
  function ico(ctx, r) {
    var G = ctx.G, T3 = ctx.K && ctx.K.THREE, g = null;
    if (T3 && typeof T3.IcosahedronGeometry === 'function' && typeof G.normalise === 'function') g = G.normalise(new T3.IcosahedronGeometry(r, 0));
    if (!g) g = G.puff(r);
    return G.facet(G.t(g, { r: [0, 0, ICO_TILT] }));
  }

  function buildTrampoline(ctx) {
    var G = ctx.G, c = colorsOf(ctx, DEF.trampoline), ol = outlineOf(ctx);
    /* the frame: a slim gunmetal ring laid flat; the LED Cyan pad rides on top of it */
    var frame = toyShade(G, G.t(G.ring(T.R, T.r), { r: [90, 0, 0], p: [0, T.y, 0] }), c.frame, 0.5);
    var pad = toyShade(G, G.t(G.ring(T.padR, T.padr), { r: [90, 0, 0], s: [1, 1, T.padS], p: [0, T.padY, 0] }), c.shine, 0.7, -0.2);
    var geos = [frame, pad];
    /* 3 slim ink legs (front, back-left, back-right) splaying a touch outward, on round feet */
    for (var k = 0; k < T.legs.length; k++) {
      var cs = Math.cos(T.legs[k] * DEG), sn = Math.sin(T.legs[k] * DEG);
      geos.push(G.paint(rod(G, [cs * T.legIn, T.legTop, sn * T.legIn], [cs * T.legOut, T.footH, sn * T.legOut], T.legR, T.legR, rad(ctx, 6)), c.leg));
      geos.push(G.paint(G.t(G.tube(T.footR * 0.8, T.footR, T.footH, { radial: rad(ctx, 8) }), { p: [cs * T.legOut, T.footH / 2, sn * T.legOut] }), c.leg, 'hi'));
    }
    /* the Graphite mat: a shallow bowl whose rim tucks under the pad */
    var mat = G.paint(G.t(G.drop(T.matR, T.depth, T.matProfile), { p: [0, T.y - T.depth, 0] }), c.mat);
    return ctx.K.template(ctx)
      .part('frame', geos, 'toon', { castShadow: true, outline: ol })
      .pivot('mat', [0, T.y, 0])
      .part('mat', [mat], 'toon', { pivot: 'mat' })
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
  /* a flat open square frame (a 4-sided sloped tube turned 45°): half-size h, band width w */
  function squareRing(G, h, w, y, tok, tone) {
    var k = Math.SQRT2;
    return G.paint(G.t(G.tube((h - w / 2) * k, (h + w / 2) * k, 0.006, { radial: 4, open: true }), { r: [0, 45, 0], p: [0, y, 0] }), tok, tone);
  }
  function buildFountain(ctx) {
    var G = ctx.G, c = colorsOf(ctx, DEF.fountain), ol = outlineOf(ctx);
    var neon = ctx.look && ctx.look.show && Array.isArray(ctx.look.show.neon) && ctx.look.show.neon.length >= 3 ? ctx.look.show.neon : NEON3;
    var basin = [], H = F.half, W = F.wall, mid = H - W / 2, cp = F.coping;
    /* the square basin: four concrete walls (inner faces in shade) under a lighter coping */
    function wallShade(v) { return v.ny > 0.5 ? [c.basin, 'hi'] : (v.nx * v.x + v.nz * v.z) < 0 ? [c.basin, 'shade'] : c.basin; }
    basin.push(G.paintBy(box(G, 2 * H, F.rimH, W, [0, F.rimH / 2, -mid]), wallShade));
    basin.push(G.paintBy(box(G, 2 * H, F.rimH, W, [0, F.rimH / 2, mid]), wallShade));
    basin.push(G.paintBy(box(G, W, F.rimH, 2 * H - 2 * W, [-mid, F.rimH / 2, 0]), wallShade));
    basin.push(G.paintBy(box(G, W, F.rimH, 2 * H - 2 * W, [mid, F.rimH / 2, 0]), wallShade));
    [[0, -mid, 2 * H, cp[0]], [0, mid, 2 * H, cp[0]], [-mid, 0, cp[0], 2 * H - 2 * W], [mid, 0, cp[0], 2 * H - 2 * W]].forEach(function (q) {
      basin.push(G.paint(box(G, q[2], cp[1], q[3], [q[0], F.rimH + cp[1] / 2, q[1]]), c.basin, 'hi'));
    });
    /* the pool: one flat square of water inside the walls (only the upward side) */
    basin.push(G.paint(G.t(G.tube(0, F.poolHalf * Math.SQRT2, 0.004, { radial: 4, open: true }), { r: [0, 45, 0], p: [0, F.poolY, 0] }), c.water));
    /* the plinth and its nozzle plate */
    basin.push(G.paintBy(box(G, 2 * F.plinth, F.plinthY1 - F.plinthY0, 2 * F.plinth, [0, (F.plinthY0 + F.plinthY1) / 2, 0]), function (v) {
      return v.nx + v.nz > 0.5 ? c.basin : [c.basin, 'shade'];
    }));
    basin.push(G.paintBy(box(G, 2 * F.capHalf, F.capH, 2 * F.capHalf, [0, F.plinthY1 + F.capH / 2, 0]), function (v) { return v.ny > 0.5 ? [c.basin, 'hi'] : c.basin; }));
    /* the ripple pair: thin square rings just above the pool */
    var ripA = squareRing(G, F.ripHalf, F.ripW, F.ripY, c.water, 'hi'), ripB = squareRing(G, F.ripHalf * F.ripK, F.ripW * F.ripK, F.ripY, c.water, 'hi');
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
      .part('basin', basin, 'toon', { castShadow: true, outline: ol })
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
    var G = ctx.G, c = colorsOf(ctx, DEF.swing), ol = outlineOf(ctx), tree = [], tk = S.trunk, lb = S.limb;
    /* the low-poly tree: a faceted hexagonal trunk, a limb across, faceted leaf clusters */
    var trunk = G.facet(G.t(G.tube(tk.rTop, tk.rBot, tk.h, { radial: rad(ctx, 6) }), { p: [tk.x, tk.h / 2, tk.z], r: [0, 15, 0] }));
    tree.push(G.paintBy(trunk, function (v) { return v.y < 0.12 || v.nx + v.nz < -0.6 ? [c.post, 'shade'] : c.post; }, { perFace: true }));
    tree.push(G.paint(G.facet(rod(G, lb.from, lb.to, lb.r0, lb.r1, rad(ctx, 6))), c.post));
    S.leaves.forEach(function (l, i) {
      tree.push(facetShade(G, G.t(ico(ctx, l.r), { r: [0, i * 23, 0], p: l.c }), c.leaves, l.tone));
    });
    /* ropes + the Teak seat hang from the limb on the 'swing' pivot */
    var ropeLen = S.ropeTop - (S.seatY + S.seat[1] / 2), ropeY = S.ropeTop - ropeLen / 2;
    var seatParts = [
      G.paint(G.t(G.tube(S.ropeR, ropeLen, { radial: 4 }), { p: [S.seatX - S.ropeX, ropeY, 0] }), c.rope),
      G.paint(G.t(G.tube(S.ropeR, ropeLen, { radial: 4 }), { p: [S.seatX + S.ropeX, ropeY, 0] }), c.rope),
      G.paintBy(box(G, S.seat[0], S.seat[1], S.seat[2], [S.seatX, S.seatY, 0]), function (v) { return v.ny > 0.5 ? [c.seat, 'hi'] : v.ny < -0.5 ? [c.seat, 'shade'] : c.seat; })
    ];
    return ctx.K.template(ctx)
      .part('frame', tree, 'toon', { castShadow: true, outline: ol })
      .pivot('swing', [S.seatX, S.pivotY, 0])
      .part('swing', seatParts, 'toon', { pivot: 'swing' })
      .anchor('top', [0, topOf(ctx, 1.4), 0])
      .anchor('seat', [S.seatX, S.seatY + S.seat[1] / 2, 0])
      .done();
  }

  function buildBubbles(ctx) {
    var G = ctx.G, c = colorsOf(ctx, DEF.bubbles), ol = outlineOf(ctx), glass = matOf(ctx, 'bubble', 'glass');
    var foil = matOf(ctx, 'rim', MATS.bubbles.rim), Z = B.faceZ, Wf = B.woofer, Tw = B.tweeter;
    /* the speaker cabinet: a crisp graphite box, a woofer (gunmetal surround, dark cone) and a tweeter */
    var body = [toyShade(G, G.t(G.slab(B.body[0], B.body[1], B.body[2], { arch: true }), { p: [0, B.body[1] / 2, 0] }), c.body, 0.6, -0.5)];
    body.push(toyShade(G, G.t(G.ring(Wf.R, Wf.r), { p: [Wf.x, Wf.y, Z] }), c.face, 0.6, -0.6));
    body.push(G.paint(G.t(G.cone(Wf.cone, 0.04, rad(ctx, 12)), { r: [-90, 0, 0], p: [Wf.x, Wf.y, Z - 0.015] }), c.body, 'shade'));
    body.push(G.paint(G.t(G.tube(0.022, 0.022, 0.012, { radial: rad(ctx, 8) }), { r: [90, 0, 0], p: [Wf.x, Wf.y, Z - 0.004] }), c.face));
    body.push(G.paint(G.t(G.tube(Tw.R, Tw.R, 0.012, { radial: rad(ctx, 10) }), { r: [90, 0, 0], p: [Tw.x, Tw.y, Z - 0.002] }), c.face));
    body.push(G.paint(G.t(G.tube(Tw.R * 0.6, Tw.R * 0.6, 0.012, { radial: rad(ctx, 8) }), { r: [90, 0, 0], p: [Tw.x, Tw.y, Z + 0.003] }), c.body, 'hi'));
    /* the cannon: a post up to a barrel aimed up and out at the camera; the FOIL ring at its mouth.
       Barrel, ring and film are built round the ring centre and tipped up by B.aim */
    var aim = { r: [-B.aim, 0, 0], p: B.ring };
    var post = G.paint(G.t(G.tube(B.armR, B.armLen, { radial: rad(ctx, 8) }), { r: [0, 0, -B.armTilt], p: B.armMid }), c.wand);
    var barrel = G.t(G.t(G.tube(B.barrel.r, B.barrel.r * 1.12, B.barrel.len, { radial: rad(ctx, 12) }), { r: [90, 0, 0], p: [0, 0, -B.barrel.len / 2 - 0.004] }), aim);
    barrel = toyShade(G, barrel, c.body, 0.75, -0.5);
    var ring = G.paint(G.t(G.ring(B.ringR, B.ringr), aim), c.rim);
    var film = G.paint(G.t(G.t(G.puff(B.filmR), { s: B.filmS }), aim), c.bubble);
    /* two idle bubbles: rest = one just blown above the ring, one resting on the cabinet */
    var bubA = G.paint(G.t(G.puff(B.rest[0].r), { p: B.rest[0].p }), c.bubble);
    var bubB = G.paint(G.t(G.puff(B.rest[1].r), { p: B.rest[1].p }), c.bubble);
    return ctx.K.template(ctx)
      .part('body', body, 'toon', { castShadow: true, outline: ol })
      .pivot('emitter', B.armBase)
      .part('wand', [post, barrel], 'toon', { pivot: 'emitter' })
      .part('ring', [ring], foil, { pivot: 'emitter' })
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
    DEFAULT_MATS: freezeAll(MATS),
    /* pure helpers */
    pendulum: pendulum, rippleScale: rippleScale, bubblerScale: bubblerScale, arcPoint: arcPoint, dropPose: dropPose,
    matScaleY: matScaleY, wandPoint: wandPoint, bubblePose: bubblePose, leadOf: leadOf, makeBook: makeBook
  };
}));
