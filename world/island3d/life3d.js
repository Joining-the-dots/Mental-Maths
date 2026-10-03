/* ================================================================
   My Island 3D — ambient life (Encore City v2, chunk B3; classic
   script). window.SLLife3D in the browser; require() in Node returns
   the same object, whose PURE path and curve maths (the water-taxi
   loop, catamaran loops, swift figure-8s, lantern drift, counts) run
   without THREE.

   WHAT LIVES HERE (islandV2 §6; nothing awards points, nothing is pickable)
     WATER TAXIS  a Catmull-Rom loop: NE jetty → west under the Lantern Bridge
                  (mid-span) → round the west media barge → back under the bridge →
                  behind the centre barge → the ferry-terminal berth → home to the
                  jetty. 0.35 u/s with 6 s eased stops at the jetty and the terminal
     CATAMARANS   two small cats with pastel sails on the flank waters, 0.12 u/s,
                  heading slowly round (MID/HIGH)
     SWIFTS       figure-8 loops over the channel at y 2.2–3.4 (lifted to ≥ 3.2
                  whenever over the island); flap 1.6 Hz for 1.5 s, glide 2.5 s;
                  they roost on the bridge pylon, its cables and the quay rail at
                  Showtime (LOW: 4, glide-only, one merged mesh)
     LANTERNS     floating lanterns round Lantern Islet from k 0.5, drifting at
                  0.05 u/s, bobbing 0.25 Hz; 30% wear the member colour; their glow
                  is a billboard in env's ambient halo layer (capacity 48)
   Every loop is instanced, uses preallocated scratch objects (zero per-frame
   allocation) and its count comes from the tier budget × SL3D.quality.lifeScale
   (the ladder's 'life' step halves them and stops the wakes). Reduced motion:
   everything moored, perched and still (update() then returns false, so the
   stage renders on demand). Every rate is in FREQS (all ≤ 2 Hz).

   FOR THE ENVIRONMENT (env.js mounts it when window.SLLife3D exists)
     var life = SLLife3D.create(K, SL3D, {tier, member, reduced, haloLayer, show})
       haloLayer: env's K.billboards({texture: 'halo', capacity: 48}) pool (without one,
       life makes its own small pool inside its group)
     scene.add(life.group)               (env adds it to its own group)
     life.update(dt, k, showK) → animating   k = the light mix (lanterns from 0.5, taxi lamps from
                                         0.35); showK = the Showtime mix (swifts roost from 0.65;
                                         defaults to k)
     life.setEdit(on)                    edit / place mode: the swifts keep to the city side
     life.setReduced(on) · life.setMember(hex) · life.setQuality(q)   (onQuality is subscribed itself)
     life.boats() → Float32Array(16)     uBoat[4] for the sea shader's V wakes, per boat
                                         (x, z, dirX·w, dirZ·w), w = 0..1 wake strength (0 = none;
                                         always 0 on LOW and after the 'life' step). Same array every call
     life.info() → {calls, tris, taxis, cats, birds, lanterns, halos}
     life.dispose()                      frees its meshes and halo slots (K's materials stay)
   ================================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    var city = null;
    try { city = require('./city3d.js'); } catch (e) { city = null; }
    module.exports = factory(root, require('./grid3d.js'), require('../world-look.js'), city);
  } else root.SLLife3D = factory(root, null, null, null);
}(typeof self !== 'undefined' ? self : typeof globalThis !== 'undefined' ? globalThis : this, function (root, G0, L0, CITY0) {
  'use strict';

  var VERSION = 1;
  var SEED = 'sl-life-v1';
  var TAU = Math.PI * 2, DEG = Math.PI / 180;

  function look() { return L0 || root.SLIslandLook || null; }
  function city() { return CITY0 || root.SLCity3D || null; }
  function seaY() { var g = G0 || root.SLGrid3D; return g && typeof g.SEA_Y === 'number' ? g.SEA_Y : -0.32; }

  /* ---------------- constants ---------------- */
  var SEA = seaY();
  var COUNTS = {
    LOW: { boats: 2, birds: 4, lanterns: 8 },
    MID: { boats: 4, birds: 7, lanterns: 16 },
    HIGH: { boats: 5, birds: 10, lanterns: 24 }
  };
  /* the water-taxi loop (x, z), west-bound along the island first; stops at the NE jetty end (0) and
     the ferry-terminal berth (16). Both bridge crossings are in the middle third of the span. */
  var TAXI_LOOP = [
    [4.3, -6.02], [2.0, -5.95], [-1.0, -5.93], [-3.2, -6.0], [-5.0, -5.84], [-6.55, -6.2], [-7.12, -7.08],
    [-6.3, -7.76], [-4.85, -7.8], [-3.9, -7.3], [-3.2, -6.88], [-2.3, -7.2], [-0.6, -7.76], [1.6, -7.78],
    [3.5, -7.76], [4.9, -7.8], [6.0, -7.6], [7.15, -7.45], [7.65, -6.75], [7.35, -5.95], [6.0, -5.78]
  ];
  var TAXI = { speed: 0.35, stopSec: 6, ease: 0.6, stops: [0, 16], len: 0.56, beam: 0.24, lamp: 0.22, hz: 0.3, bob: 0.02 };
  /* catamarans: elliptical loops on the flanks, 0.12 u/s */
  var CATS = [{ cx: -12.7, cz: -2.4, rx: 1.25, rz: 2.0, dir: 1, ph: 0.15 }, { cx: 12.8, cz: -2.0, rx: 1.25, rz: 2.0, dir: -1, ph: 0.62 }];
  var CAT = { speed: 0.12 };
  /* swifts: lemniscate loops over the channel; the island lift keeps them ≥ 3.2 u over land */
  var BIRD = { yMin: 2.2, yMax: 3.4, overIsland: 3.35, flapHz: 1.6, flapSec: 1.5, glideSec: 2.5, flapDeg: 34, glideDeg: 8,
               foldDeg: 78, roostSec: 2.5, roostK: 0.65, editShift: 1.2, editSec: 0.6, span: 0.17 };
  /* the island footprint for flight safety: every region cell (x -8..8, z -4..4) plus the widest coast */
  var OVER = { x: 9.05, z0: -5.05, z1: 5.05 };
  var LANTERN = { islet: { x: -8.0, z: -5.4, r: 0.7 }, from: 0.5, drift: 0.05, bobHz: 0.25, bob: 0.015, fade: 1.2, stagger: 0.12,
                  member: 0.3, glow: 0.42, ringR: [1.2, 1.5, 1.8, 2.1], gap: 0.45, coastClear: 1.6, pathClear: 0.5,
                  tokens: ['Holo Pink', 'Holo Blue', 'Holo Mint', 'Holo Lemon', 'Sunset Amber', 'Window Warm'] };
  var BUOYS = [[-9.5, -6.5], [9.5, -6.5]];
  var LAMP_K = 0.35;
  /* every periodic motion here (Hz) — all ≤ SLMotion.MAX_FLASH_HZ (test-enforced) */
  var FREQS = {
    boatBob: TAXI.hz, birdFlap: BIRD.flapHz, birdBurst: 1 / (BIRD.flapSec + BIRD.glideSec), birdLoop: 1 / 9,
    lanternBob: LANTERN.bobHz, lanternDrift: 0.33 / TAU, lanternFade: 1 / LANTERN.fade, catLap: 0.012, taxiLap: 0.012
  };

  /* ================================================================
     PURE HELPERS
     ================================================================ */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function lerp(a, b, k) { return a + (b - a) * k; }
  function smooth(a, b, x) { var u = clamp01((x - a) / (b - a)); return u * u * (3 - 2 * u); }
  function inOutSine(t) { return -(Math.cos(Math.PI * clamp01(t)) - 1) / 2; }
  function parseTier(t) { var u = typeof t === 'string' ? t.toUpperCase() : ''; return COUNTS[u] ? u : null; }
  function fnv(s) {
    s = String(s);
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
  }
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function wrapAngle(a) { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; }

  /* counts for a tier × the ladder's lifeScale: taxis + cats (no cats on LOW: one boat mesh there) */
  function counts(tier, lifeScale) {
    var c = COUNTS[parseTier(tier) || 'MID'], s = lifeScale > 0 ? Math.min(1, lifeScale) : 1;
    var boats = Math.max(1, Math.round(c.boats * s)), cats = parseTier(tier) === 'LOW' ? 0 : Math.min(CATS.length, Math.floor(boats / 2));
    return { boats: boats, taxis: boats - cats, cats: cats, birds: Math.max(1, Math.round(c.birds * s)), lanterns: Math.max(1, Math.round(c.lanterns * s)) };
  }

  /* ---------------- the taxi loop: closed Catmull-Rom with an arc-length table ---------------- */
  function catmull(p0, p1, p2, p3, t) {
    var t2 = t * t, t3 = t2 * t;
    return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  }
  var LOOP = null;
  function taxiLoop() {
    if (LOOP) return LOOP;
    var P = TAXI_LOOP, n = P.length, per = 48, N = n * per, xs = new Float64Array(N + 1), zs = new Float64Array(N + 1), s = new Float64Array(N + 1);
    for (var i = 0; i < n; i++) {
      var a = P[(i - 1 + n) % n], b = P[i], c = P[(i + 1) % n], d = P[(i + 2) % n];
      for (var k = 0; k < per; k++) {
        var t = k / per, j = i * per + k;
        xs[j] = catmull(a[0], b[0], c[0], d[0], t); zs[j] = catmull(a[1], b[1], c[1], d[1], t);
      }
    }
    xs[N] = xs[0]; zs[N] = zs[0];
    for (var m = 1; m <= N; m++) s[m] = s[m - 1] + Math.hypot(xs[m] - xs[m - 1], zs[m] - zs[m - 1]);
    var stops = TAXI.stops.map(function (ci) { return s[ci * per]; });
    var L = s[N], legs = [stops[1] - stops[0], L - stops[1] + stops[0]];
    var legSec = legs.map(function (D) { return (D + 2 * TAXI.ease) / TAXI.speed; });
    LOOP = { xs: xs, zs: zs, s: s, N: N, per: per, length: L, stops: stops, legs: legs, legSec: legSec,
             lapSec: legSec[0] + legSec[1] + 2 * TAXI.stopSec };
    return LOOP;
  }
  /* the point on the loop at arc length s → out {x, z, hx, hz} */
  function loopAt(s, out) {
    var Lp = taxiLoop(), L = Lp.length;
    s = ((s % L) + L) % L;
    var lo = 0, hi = Lp.N;
    while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (Lp.s[mid] <= s) lo = mid; else hi = mid; }
    var seg = Lp.s[lo + 1] - Lp.s[lo] || 1, f = (s - Lp.s[lo]) / seg;
    var dx = Lp.xs[lo + 1] - Lp.xs[lo], dz = Lp.zs[lo + 1] - Lp.zs[lo], dl = Math.hypot(dx, dz) || 1;
    out.x = Lp.xs[lo] + dx * f; out.z = Lp.zs[lo] + dz * f; out.hx = dx / dl; out.hz = dz / dl;
    return out;
  }
  /* distance covered along one leg after tau seconds: an eased start, cruise, an eased stop */
  function legDistance(D, tau) {
    var v = TAXI.speed, e = TAXI.ease, tr = 2 * e / v, a = v / tr, T = (D + 2 * e) / v;
    if (tau <= 0) return 0;
    if (tau >= T) return D;
    if (tau < tr) return 0.5 * a * tau * tau;
    if (tau > T - tr) { var r = T - tau; return D - 0.5 * a * r * r; }
    return e + v * (tau - tr);
  }
  /* taxi i of n at time t → out {x, z, hx, hz, speed (0..1 of cruise), stopped} */
  function taxiAt(i, n, t, out) {
    var Lp = taxiLoop(), lap = Lp.lapSec, tt = ((t + lap * i / Math.max(1, n)) % lap + lap) % lap, s, speed = 0;
    var d0 = TAXI.stopSec, d1 = d0 + Lp.legSec[0], d2 = d1 + TAXI.stopSec;
    if (tt < d0) s = Lp.stops[0];
    else if (tt < d1) { s = Lp.stops[0] + legDistance(Lp.legs[0], tt - d0); speed = legSpeed(Lp.legs[0], tt - d0); }
    else if (tt < d2) s = Lp.stops[1];
    else { s = Lp.stops[1] + legDistance(Lp.legs[1], tt - d2); speed = legSpeed(Lp.legs[1], tt - d2); }
    loopAt(s, out);
    out.speed = speed; out.stopped = speed === 0;
    return out;
  }
  function legSpeed(D, tau) {
    var v = TAXI.speed, e = TAXI.ease, tr = 2 * e / v, T = (D + 2 * e) / v;
    if (tau <= 0 || tau >= T) return 0;
    if (tau < tr) return tau / tr;
    if (tau > T - tr) return (T - tau) / tr;
    return 1;
  }
  /* where taxi i waits under reduced motion: the jetty, the terminal berth, then along the berth */
  function taxiMoored(i, out) {
    var Lp = taxiLoop(), s = i === 0 ? Lp.stops[0] : Lp.stops[1] - (i - 1) * 0.72;
    loopAt(s, out); out.speed = 0; out.stopped = true;
    return out;
  }

  /* ---------------- catamarans: a wobbly ellipse each, sailed at a constant 0.12 u/s ---------------- */
  var CAT_LOOPS = [];
  function catLoop(i) {
    if (CAT_LOOPS[i]) return CAT_LOOPS[i];
    var c = CATS[i % CATS.length], N = 256, xs = new Float64Array(N + 1), zs = new Float64Array(N + 1), s = new Float64Array(N + 1);
    for (var k = 0; k <= N; k++) {
      var a = c.ph * TAU + c.dir * TAU * k / N, wob = 1 + 0.08 * Math.sin(a * 2 + c.ph * 9);
      xs[k] = c.cx + Math.cos(a) * c.rx * wob; zs[k] = c.cz + Math.sin(a) * c.rz * wob;
      if (k) s[k] = s[k - 1] + Math.hypot(xs[k] - xs[k - 1], zs[k] - zs[k - 1]);
    }
    return (CAT_LOOPS[i] = { xs: xs, zs: zs, s: s, N: N, length: s[N] });
  }
  function catAt(i, t, reduced, out) {
    var Lp = catLoop(i % CATS.length), L = Lp.length, d = reduced ? 0 : ((CAT.speed * t) % L + L) % L;
    var lo = 0, hi = Lp.N;
    while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (Lp.s[mid] <= d) lo = mid; else hi = mid; }
    var f = (d - Lp.s[lo]) / ((Lp.s[lo + 1] - Lp.s[lo]) || 1);
    var dx = Lp.xs[lo + 1] - Lp.xs[lo], dz = Lp.zs[lo + 1] - Lp.zs[lo], dl = Math.hypot(dx, dz) || 1;
    out.x = Lp.xs[lo] + dx * f; out.z = Lp.zs[lo] + dz * f; out.hx = dx / dl; out.hz = dz / dl;
    out.speed = reduced ? 0 : CAT.speed / TAXI.speed; out.stopped = !!reduced;
    return out;
  }

  /* ---------------- swifts ---------------- */
  var BIRDS = null;
  function birdParams(n) {
    if (BIRDS && BIRDS.length >= n) return BIRDS;
    var R = rng(fnv(SEED + ':birds')), out = [];
    for (var i = 0; i < Math.max(n, 12); i++) {
      var wide = i % 4 === 2;                       /* every 4th loop swings over the back of the island */
      out.push({
        cx: lerp(-6, 6, (i * 0.618 + R() * 0.25) % 1), cz: wide ? -5.6 : lerp(-7.1, -6.2, R()),
        ax: lerp(2.4, 4.0, R()), az: wide ? 2.1 : lerp(0.9, 1.45, R()),
        y0: lerp(BIRD.yMin + 0.35, BIRD.yMax - 0.35, R()), dy: 0.35,
        period: lerp(9, 13, R()), ph: R() * TAU, flapPh: R() * (BIRD.flapSec + BIRD.glideSec), dir: R() < 0.5 ? -1 : 1
      });
    }
    return (BIRDS = out);
  }
  /* the island lift: full over the island box (and a margin), none over the channel */
  function liftAt(x, z) {
    return smooth(OVER.z0 - 1.35, OVER.z0 - 0.15, z) * (1 - smooth(OVER.x + 0.05, OVER.x + 0.95, Math.abs(x)));
  }
  /* flight position of swift i at time t (editK 0..1 shifts the loops to the city side) → out {x, y, z} */
  function birdFlight(i, t, editK, out) {
    var b = birdParams(i + 1)[i], th = b.ph + b.dir * TAU * t / b.period;
    var x = b.cx + b.ax * Math.sin(th), z = b.cz - BIRD.editShift * (editK || 0) + b.az * Math.sin(2 * th);
    var y = b.y0 + b.dy * Math.sin(2 * th + b.ph);
    var L = liftAt(x, z);
    out.x = x; out.z = z; out.y = y + (BIRD.overIsland - y) * L;
    return out;
  }
  /* wing angle (degrees about the body's long axis) for the flap / glide cycle */
  function wingAngle(i, t, reduced) {
    if (reduced) return BIRD.glideDeg;
    var b = birdParams(i + 1)[i], cyc = BIRD.flapSec + BIRD.glideSec, c = ((t + b.flapPh) % cyc + cyc) % cyc;
    var env = c < BIRD.flapSec ? smooth(0, 0.18, c) * (1 - smooth(BIRD.flapSec - 0.18, BIRD.flapSec, c)) : 0;
    return BIRD.glideDeg + env * BIRD.flapDeg * Math.sin(TAU * BIRD.flapHz * c);
  }

  /* ---------------- roosts and lanterns ---------------- */
  var ROOST_FALLBACK = [
    { x: -9.5, y: SEA + 0.95, z: -6.5, yaw: 0, at: 'buoy' }, { x: 9.5, y: SEA + 0.95, z: -6.5, yaw: 0, at: 'buoy' }
  ];
  function roosts() {
    var C = city();
    try { if (C && typeof C.roosts === 'function') return C.roosts(); } catch (e) { /* the buoys then */ }
    return ROOST_FALLBACK;
  }
  /* lantern anchors round Lantern Islet: rings of candidates, kept off the coast, the islet rock,
     the buoys and the taxi loop; deterministic */
  var ANCHORS = null;
  function anchorAt(i) { if (!ANCHORS || ANCHORS.length <= i) lanternAnchors(i + 1); return ANCHORS[i % ANCHORS.length]; }
  function lanternAnchors(n) {
    if (ANCHORS && ANCHORS.length >= n) return ANCHORS.slice(0, n);
    var C = city(), I = LANTERN.islet, cand = [], R = rng(fnv(SEED + ':lanterns'));
    var loopPts = [], Lp = taxiLoop();
    for (var q = 0; q < Lp.N; q += 6) loopPts.push([Lp.xs[q], Lp.zs[q]]);
    LANTERN.ringR.forEach(function (r, ri) {
      var m = Math.floor(TAU * r / LANTERN.gap);
      for (var k = 0; k < m; k++) {
        var a = TAU * (k + (ri % 2) * 0.5) / m, x = I.x + Math.cos(a) * r, z = I.z + Math.sin(a) * r;
        if (C && C.cellDistance(x, z) < LANTERN.coastClear) continue;
        var ok = true;
        for (var b = 0; b < BUOYS.length; b++) if (Math.hypot(x - BUOYS[b][0], z - BUOYS[b][1]) < 0.75) ok = false;
        for (var p = 0; p < loopPts.length && ok; p++) if (Math.hypot(x - loopPts[p][0], z - loopPts[p][1]) < LANTERN.pathClear) ok = false;
        if (ok) cand.push({ x: x, z: z, ring: ri, d: r });
      }
    });
    /* spread the picks over the candidates (inner rings first) */
    var want = Math.max(n, 24), out = [];
    for (var i = 0; i < want && cand.length; i++) {
      var c = cand[Math.floor(i * cand.length / want)];
      out.push({ x: c.x, z: c.z, d: c.d, ph1: R() * TAU, ph2: R() * TAU, ph3: R() * TAU, shape: i % 3, spin: (R() - 0.5) * 0.3 });
    }
    ANCHORS = out;
    return out.slice(0, n);
  }
  /* lantern i at time t → out {x, y, z, yaw}: two slow rotations (≈ 0.05 u/s) and a 0.25 Hz bob */
  function lanternAt(i, t, reduced, out) {
    var a = anchorAt(i), T = reduced ? 0 : t;
    var w1 = 0.2, w2 = 0.33, r1 = 0.17, r2 = 0.07;
    out.x = a.x + r1 * Math.sin(w1 * T + a.ph1) + r2 * Math.sin(w2 * T + a.ph2);
    out.z = a.z + r1 * 0.8 * Math.cos(w1 * T + a.ph1) + r2 * Math.cos(w2 * T + a.ph3);
    out.y = SEA + 0.05 + (reduced ? 0 : LANTERN.bob * Math.sin(TAU * LANTERN.bobHz * T + a.ph2));
    out.yaw = a.ph3 + a.spin * T;
    return out;
  }
  /* lantern i's colour: 30% the member colour ('@member'), the rest pastel neons */
  function lanternToken(i) {
    return (i * 7) % 10 < LANTERN.member * 10 ? '@member' : LANTERN.tokens[i % LANTERN.tokens.length];
  }

  /* ================================================================
     create(K, SL3D, opts) → life   (browser; THREE comes from K)
     ================================================================ */
  function create(K, SL3D, opts) {
    if (!K || !K.THREE || !K.G) throw new Error('SLLife3D.create needs the kit K');
    opts = opts || {};
    var T = K.THREE, G = K.G, L = look();
    var tier = parseTier(opts.tier) || K.tier || 'MID', low = tier === 'LOW';
    var q0 = (SL3D && SL3D.quality) || {};
    var state = {
      time: 0, k: 0, showK: 0, reduced: !!opts.reduced, edit: false, editK: 0, disposed: false, lifeScale: q0.lifeScale || 1,
      lanternsOn: false, lanternT: 0, roostTo: 0, motionDirty: true, member: null
    };
    var full = counts(tier, 1);
    var group = new T.Group();
    group.name = 'life';
    group.userData.pickable = false;
    function noPick() {}
    var owned = [];

    /* scratch (nothing below allocates per frame) */
    var _m = new T.Matrix4(), _m2 = new T.Matrix4(), _m3 = new T.Matrix4(), _q = new T.Quaternion(), _q2 = new T.Quaternion();
    var _e = new T.Euler(0, 0, 0, 'YXZ'), _p = new T.Vector3(), _s = new T.Vector3(1, 1, 1), _one = new T.Vector3(1, 1, 1);
    var _zero = new T.Vector3(0, 0, 0), _c = new T.Color();
    var _bt = {}, _bf = {}, _bf2 = {}, _lt = {};
    var memberCol = new T.Color();
    function setMember(hex) {
      var h = L && L.normHex ? L.normHex(hex) : null;
      state.member = h;
      memberCol.set(h || (L ? L.hex(L.MEMBER_FALLBACK || 'Bubblegum') : '#FF8FC8'));
      paintLanterns();
    }

    function newIM(geo, mat, cap, name) {
      var m = new T.InstancedMesh(geo, mat, Math.max(1, cap));
      m.instanceColor = new T.InstancedBufferAttribute(new Float32Array(Math.max(1, cap) * 3).fill(1), 3);
      m.instanceMatrix.setUsage(T.DynamicDrawUsage);
      m.count = cap; m.frustumCulled = false; m.castShadow = false; m.receiveShadow = false; m.raycast = noPick;
      m.name = 'life:' + name;
      group.add(m);
      owned.push(m);
      return m;
    }

    /* ---------------- geometry (cached per tier in K.parts) ---------------- */
    var GEO = K.parts.get('life:geo:v' + VERSION, tier, function (Kt) {
      var g = Kt.G, out = {};
      /* a pointed hull: a 6-sided prism (corners at bow and stern) stretched to len × beam, flared */
      function hullOf(len, beam, h, y) {
        return g.t(g.tube(0.5, 0.42, h, { radial: 6 }), { s: [beam, 1, len], p: [0, y, 0] });
      }
      /* water taxi (forward +z): white topsides over a graphite waterline, a coral sheer line, a smoked
         cabin under a white roof and an amber mast lamp (its glow is a halo) */
      var hull = g.paintBy(hullOf(TAXI.len, TAXI.beam, 0.11, 0.025), function (v) { return v.y < 0.0 ? 'Graphite' : v.y > 0.07 ? 'Coral' : 'Bone White'; });
      var deck = g.paint(g.t(g.slab(0.17, 0.012, 0.3, 0), { p: [0, 0.084, 0.1] }), 'Teak');
      var cabin = g.paint(g.t(g.slab(0.17, 0.09, 0.22, 0), { p: [0, 0.125, -0.06] }), 'Smoked Glass');
      var roof = g.paint(g.t(g.slab(0.19, 0.02, 0.26, 0), { p: [0, 0.18, -0.07] }), 'Bone White');
      var lamp = g.paint(g.t(g.tube(0.012, 0.012, 0.05, { radial: 5 }), { p: [0, 0.215, -0.1] }), 'Sunset Amber');
      out.taxi = g.merge([hull, deck, cabin, roof, lamp]);
      if (Kt.tier !== 'LOW') {
        /* catamaran: twin hulls, a teak trampoline deck, a mast and two pastel sails */
        var h1 = g.paint(g.t(hullOf(0.5, 0.075, 0.07, 0.0), { p: [-0.13, 0, 0] }), 'Bone White');
        var h2 = g.paint(g.t(hullOf(0.5, 0.075, 0.07, 0.0), { p: [0.13, 0, 0] }), 'Bone White');
        var tramp = g.paint(g.t(g.slab(0.32, 0.025, 0.3, 0), { p: [0, 0.045, -0.02] }), 'Teak');
        var mast = g.paint(g.t(g.tube(0.008, 0.01, 0.62, { radial: 4 }), { p: [0, 0.36, 0.02] }), 'Gunmetal Spec');
        out.cat = g.merge([h1, h2, tramp, mast, sail([[0, 0.09, 0.0], [0, 0.64, 0.01], [0, 0.1, -0.27]], 'Holo Pink'),
                           sail([[0, 0.1, 0.05], [0, 0.56, 0.03], [0, 0.08, 0.27]], 'Holo Blue')]);
      }
      /* swift: a faceted dart body with a forked tail; wings separately (or merged gliding on LOW) */
      var head = g.t(g.cone(0.026, 0.07, 5), { r: [90, 0, 0], p: [0, 0, 0.055] });
      var body = g.t(g.cone(0.026, 0.13, 5), { r: [-90, 0, 0], p: [0, 0, -0.045] });
      var tail = flat([[0, 0, -0.1], [-0.045, 0, -0.19], [0, 0, -0.14], [0.045, 0, -0.19]], 'Graphite');
      g.facet(head); g.facet(body);
      g.paintBy(head, function (v) { return v.ny < -0.3 ? 'Concrete Light' : 'Graphite'; });
      g.paintBy(body, function (v) { return v.ny < -0.3 ? 'Concrete Light' : 'Graphite'; });
      out.bird = g.merge([head, body, tail]);
      out.wing = wing();
      if (Kt.tier === 'LOW') {
        var wr = g.t(wing(), { r: [0, 45, BIRD.glideDeg + 2], p: [0.012, 0.008, 0.01] });
        var wl = g.t(wing(), { r: [0, -45, 180 - BIRD.glideDeg - 2], p: [-0.012, 0.008, 0.01] });
        out.birdLow = g.merge([out.bird, wr, wl]);
      } else {
        /* lantern: a hexagonal paper body with a dark cap and foot (state material: the body glows) */
        var bodyL = g.paintBy(g.tube(0.05, 0.045, 0.12, { radial: 6 }), function (v) { return v.y < -0.05 ? 'Graphite' : 'Cloud White'; });
        var cap = g.paint(g.t(g.cone(0.056, 0.035, 6), { p: [0, 0.077, 0] }), 'Graphite');
        out.lantern = g.merge([bodyL, cap]);
      }
      return out;
      /* a two-sided triangle fan in the plane of `pts` (sails, the tail) */
      function sail(pts, token) { return flat([pts[0], pts[1], pts[2]], token); }
      function flat(pts, token) {
        var P3 = [], n = [0, 0, 0];
        var ux = pts[1][0] - pts[0][0], uy = pts[1][1] - pts[0][1], uz = pts[1][2] - pts[0][2];
        var vx = pts[2][0] - pts[0][0], vy = pts[2][1] - pts[0][1], vz = pts[2][2] - pts[0][2];
        n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
        var l = Math.sqrt(n[0] * n[0] + n[1] * n[1] + n[2] * n[2]) || 1;
        n = [n[0] / l, n[1] / l, n[2] / l];
        var N3 = [];
        for (var k = 1; k + 1 < pts.length; k++) {
          [pts[0], pts[k], pts[k + 1]].forEach(function (p) { P3.push(p[0], p[1], p[2]); N3.push(n[0], n[1], n[2]); });
          [pts[0], pts[k + 1], pts[k]].forEach(function (p) { P3.push(p[0], p[1], p[2]); N3.push(-n[0], -n[1], -n[2]); });
        }
        var geo = new T.BufferGeometry();
        geo.setAttribute('position', new T.Float32BufferAttribute(P3, 3));
        geo.setAttribute('normal', new T.Float32BufferAttribute(N3, 3));
        geo.setAttribute('color', new T.Float32BufferAttribute(new Array(P3.length).fill(1), 3));
        return g.paint(geo, token);
      }
      /* a swept, two-sided crescent wing from the shoulder (x 0) to the tip (x span) */
      function wing() {
        var S = BIRD.span;
        return flat([[0, 0, 0.03], [S * 0.45, 0, 0.012], [S, 0, -0.065], [S * 0.98, 0, -0.08], [S * 0.42, 0, -0.04], [0, 0, -0.03]], 'Graphite');
      }
    });

    /* ---------------- meshes ---------------- */
    var toon = K.mat('toon'), glowMat = K.mat('state');
    var taxiM = newIM(GEO.taxi, toon, full.taxis, 'taxis');
    var catM = full.cats ? newIM(GEO.cat, toon, full.cats, 'cats') : null;
    var birdM = low ? newIM(GEO.birdLow, toon, full.birds, 'swifts') : newIM(GEO.bird, toon, full.birds, 'swifts');
    var wingM = low ? null : newIM(GEO.wing, toon, full.birds * 2, 'wings');
    var lanternM = low ? null : newIM(GEO.lantern, glowMat, full.lanterns, 'lanterns');
    if (lanternM) lanternM.renderOrder = 3;

    /* per-instance tints: a few % of variety (never a mirror, never a random pick at runtime) */
    var VR = rng(fnv(SEED + ':tints'));
    function tintAll(m, n, spread) {
      for (var i = 0; i < n; i++) { var v = 1 - spread / 2 + spread * VR(); _c.setRGB(v, v, v); m.setColorAt(i, _c); }
      m.instanceColor.needsUpdate = true;
    }
    tintAll(taxiM, full.taxis, 0.08);
    if (catM) tintAll(catM, full.cats, 0.06);
    tintAll(birdM, full.birds, 0.1);
    if (wingM) tintAll(wingM, full.birds * 2, 0.06);

    /* halos: env's ambient layer (or a small pool of our own) for lantern and taxi-lamp glows */
    var halo = opts.haloLayer && typeof opts.haloLayer.alloc === 'function' ? opts.haloLayer : null, ownHalo = null;
    if (!halo && typeof K.billboards === 'function') {
      ownHalo = K.billboards({ texture: 'halo', capacity: full.lanterns + full.taxis, name: 'life:halos' });
      group.add(ownHalo.mesh);
      halo = ownHalo;
    }
    var lanternSlot = [], lampSlot = [];
    function allocSlots() {
      if (!halo) return;
      var i, k;
      for (i = 0; i < full.lanterns; i++) { k = halo.alloc(); lanternSlot.push(k); }
      for (i = 0; i < full.taxis; i++) { k = halo.alloc(); lampSlot.push(k); }
    }
    allocSlots();

    /* lantern colours (linear Colors; '@member' follows setMember) */
    var lanternCol = [], lanternMember = [];
    for (var li = 0; li < full.lanterns; li++) {
      var tok = lanternToken(li);
      lanternMember.push(tok === '@member');
      lanternCol.push(tok === '@member' ? new T.Color() : K.col(tok));
    }
    var lanternVis = new Float32Array(full.lanterns), lanternShape = [[1, 1, 1], [0.85, 1.25, 0.85], [1.2, 0.82, 1.2]];
    var anchors = lanternAnchors(full.lanterns), roostList = roosts();
    function paintLanterns() {
      for (var i = 0; i < full.lanterns; i++) if (lanternMember[i]) lanternCol[i].copy(memberCol);
      if (lanternM) {
        for (var j = 0; j < full.lanterns; j++) lanternM.setColorAt(j, lanternCol[j]);
        lanternM.instanceColor.needsUpdate = true;
      }
      state.motionDirty = true;
    }
    var lampCol = K.col('Sunset Amber');

    /* ---------------- per-frame writers ---------------- */
    var active = counts(tier, state.lifeScale);
    var boatData = new Float32Array(16);
    var roostK = new Float32Array(full.birds);

    function writeTaxis() {
      var n = active.taxis, red = state.reduced, t = state.time, lampOn = smooth(LAMP_K - 0.1, LAMP_K + 0.1, state.k);
      for (var i = 0; i < n; i++) {
        if (red) taxiMoored(i, _bt); else taxiAt(i, full.taxis, t, _bt);   /* spaced for the full fleet: a quality step never teleports one */
        var ph = i * 1.7, bob = red ? 0 : TAXI.bob * Math.sin(TAU * TAXI.hz * t + ph);
        var roll = red ? 0 : 1.5 * DEG * Math.sin(TAU * TAXI.hz * 0.8 * t + ph * 2);
        _e.set(0, Math.atan2(_bt.hx, _bt.hz), roll, 'YXZ');
        _q.setFromEuler(_e);
        _p.set(_bt.x, SEA + 0.02 + bob, _bt.z);
        taxiM.setMatrixAt(i, _m.compose(_p, _q, _one));
        if (i < 4) { var w = active.wakes ? _bt.speed : 0; boatData[i * 4] = _bt.x; boatData[i * 4 + 1] = _bt.z; boatData[i * 4 + 2] = _bt.hx * w; boatData[i * 4 + 3] = _bt.hz * w; }
        if (halo && lampSlot[i] >= 0) {
          _p.set(0, 0.24, -0.1).applyQuaternion(_q);
          halo.set(lampSlot[i], _bt.x + _p.x, SEA + 0.02 + bob + _p.y, _bt.z + _p.z, TAXI.lamp, lampCol, 0.85 * lampOn, 0, 0);
        }
      }
      taxiM.count = n;
      taxiM.instanceMatrix.needsUpdate = true;
      for (var j = n; j < lampSlot.length; j++) if (halo && lampSlot[j] >= 0) halo.alpha(lampSlot[j], 0);
    }
    function writeCats() {
      if (!catM) return;
      var n = active.cats, t = state.time, red = state.reduced, base = active.taxis;
      for (var i = 0; i < n; i++) {
        catAt(i, t, red, _bt);
        var ph = i * 2.3 + 0.7, bob = red ? 0 : TAXI.bob * Math.sin(TAU * TAXI.hz * t + ph);
        var heel = red ? 0 : 2.5 * DEG * Math.sin(TAU * 0.07 * t + ph);
        _e.set(0, Math.atan2(_bt.hx, _bt.hz), heel, 'YXZ');
        _q.setFromEuler(_e);
        _p.set(_bt.x, SEA + 0.04 + bob, _bt.z);
        catM.setMatrixAt(i, _m.compose(_p, _q, _one));
        var slot = base + i;
        if (slot < 4) { var w = active.wakes ? _bt.speed : 0; boatData[slot * 4] = _bt.x; boatData[slot * 4 + 1] = _bt.z; boatData[slot * 4 + 2] = _bt.hx * w; boatData[slot * 4 + 3] = _bt.hz * w; }
      }
      catM.count = n;
      catM.visible = n > 0;
      catM.instanceMatrix.needsUpdate = true;
    }
    /* swift i's orientation from its flight path (heading, climb, bank into the turn) */
    function birdPose(i, t, out) {
      birdFlight(i, t, state.editK, out);
      birdFlight(i, t + 0.08, state.editK, _bf2);
      var dx = _bf2.x - out.x, dy = _bf2.y - out.y, dz = _bf2.z - out.z, dh = Math.hypot(dx, dz) || 1e-6;
      out.yaw = Math.atan2(dx, dz);
      out.pitch = -Math.atan2(dy, dh) * 0.7;
      birdFlight(i, t + 0.16, state.editK, _lt);
      var yaw2 = Math.atan2(_lt.x - _bf2.x, _lt.z - _bf2.z), turn = wrapAngle(yaw2 - out.yaw) / 0.08;
      out.roll = clamp(-turn * 0.35, -0.65, 0.65);
      return out;
    }
    function writeBirds(dt) {
      var n = active.birds, t = state.time, red = state.reduced;
      for (var i = 0; i < n; i++) {
        /* roosting: an eased hop between the flight path and the perch (perched under reduced motion) */
        var target = red ? 1 : state.roostTo;
        if (red) roostK[i] = 1;
        else if (roostK[i] !== target) {
          var stp = dt / BIRD.roostSec;
          roostK[i] = target > roostK[i] ? Math.min(target, roostK[i] + stp) : Math.max(target, roostK[i] - stp);
        }
        var rk = inOutSine(roostK[i]), perch = roostList[i % roostList.length];
        birdPose(i, t, _bf);
        var x = lerp(_bf.x, perch.x, rk), y = lerp(_bf.y, perch.y, rk) + Math.sin(Math.PI * rk) * 0.45, z = lerp(_bf.z, perch.z, rk);
        var yaw = _bf.yaw + wrapAngle(perch.yaw - _bf.yaw) * rk;
        _e.set(_bf.pitch * (1 - rk), yaw, _bf.roll * (1 - rk), 'YXZ');
        _q.setFromEuler(_e);
        _p.set(x, y, z);
        _m.compose(_p, _q, _one);
        birdM.setMatrixAt(i, _m);
        if (wingM) {
          var perched = roostK[i] >= 0.999;
          var ang = perched ? 0 : (roostK[i] > 0 ? BIRD.flapDeg * 0.8 * Math.sin(TAU * BIRD.flapHz * t + i) + BIRD.glideDeg : wingAngle(i, t, red));
          var fold = perched ? BIRD.foldDeg : 0;
          for (var side = 0; side < 2; side++) {
            var sx = side ? -1 : 1;
            _e.set(0, fold * DEG * sx, (side ? 180 - ang : ang) * DEG, 'YXZ');
            _q2.setFromEuler(_e);
            _p.set(0.012 * sx, 0.008, 0.012);
            _m2.compose(_p, _q2, _one);
            wingM.setMatrixAt(i * 2 + side, _m3.multiplyMatrices(_m, _m2));
          }
        }
      }
      birdM.count = n;
      birdM.instanceMatrix.needsUpdate = true;
      if (wingM) { wingM.count = n * 2; wingM.instanceMatrix.needsUpdate = true; }
    }
    var lanternsShown = false;
    function writeLanterns(dt) {
      var n = active.lanterns, red = state.reduced, t = state.time, any = false;
      if (!state.lanternsOn && !lanternsShown && !state.motionDirty) return false;   /* all dark and still dark: nothing to write */
      for (var i = 0; i < full.lanterns; i++) {
        var on = state.lanternsOn && i < n ? 1 : 0, v = lanternVis[i];
        if (red) v = on;
        else if (v !== on) {
          /* a staggered fade from the islet outward: lantern i waits i × stagger before moving */
          var stp = dt / LANTERN.fade;
          v = on > v ? Math.min(1, v + stp * (state.lanternT >= i * LANTERN.stagger ? 1 : 0)) : Math.max(0, v - stp);
        }
        lanternVis[i] = v;
        if (v > 0) any = true;
        lanternAt(i, t, red, _lt);
        var e = inOutSine(v);
        if (lanternM) {
          var sh = lanternShape[anchors[i] ? anchors[i].shape : 0];
          _e.set(0, _lt.yaw, 0, 'YXZ');
          _q.setFromEuler(_e);
          _p.set(_lt.x, _lt.y - 0.12 * (1 - e), _lt.z);
          _s.set(sh[0] * Math.max(1e-3, e), sh[1] * Math.max(1e-3, e), sh[2] * Math.max(1e-3, e));
          lanternM.setMatrixAt(i, _m.compose(_p, _q, v > 0 ? _s : _zero));
        }
        if (halo && lanternSlot[i] >= 0) halo.set(lanternSlot[i], _lt.x, _lt.y + 0.06, _lt.z, LANTERN.glow * (0.6 + 0.4 * e), lanternCol[i], 0.8 * e, 0, 0);
      }
      if (lanternM) { lanternM.count = full.lanterns; lanternM.visible = any; lanternM.instanceMatrix.needsUpdate = true; }
      lanternsShown = any;
      return any;
    }

    /* ---------------- update ---------------- */
    function update(dt, k, showK) {
      if (state.disposed) return false;
      dt = typeof dt === 'number' && dt > 0 ? Math.min(dt, 0.1) : 0;
      var kk = typeof k === 'number' && isFinite(k) ? clamp01(k) : state.k;
      var sk = typeof showK === 'number' && isFinite(showK) ? clamp01(showK) : kk;
      var busy = false;
      if (kk !== state.k || sk !== state.showK) { state.k = kk; state.showK = sk; state.motionDirty = true; }
      var on = state.k >= LANTERN.from;
      if (on !== state.lanternsOn) { state.lanternsOn = on; state.lanternT = 0; }
      state.lanternT += dt;
      state.roostTo = state.showK >= BIRD.roostK ? 1 : 0;
      var et = state.edit ? 1 : 0;
      if (state.editK !== et) {
        state.editK = state.reduced ? et : (et > state.editK ? Math.min(1, state.editK + dt / BIRD.editSec) : Math.max(0, state.editK - dt / BIRD.editSec));
        busy = true;
      }
      if (!state.reduced) state.time += dt;
      if (!state.reduced || state.motionDirty || busy) {
        for (var z = 0; z < 16; z++) boatData[z] = 0;
        writeTaxis();
        writeCats();
        writeBirds(dt);
        writeLanterns(dt);
        if (halo) halo.commit();
        state.motionDirty = false;
        for (var i = 0; i < full.lanterns && !busy; i++) if (lanternVis[i] > 0 && lanternVis[i] < 1) busy = true;
        for (var j = 0; j < active.birds && !busy; j++) if (roostK[j] > 0 && roostK[j] < 1) busy = true;
      }
      return busy || !state.reduced;
    }

    function setQuality(q) {
      if (!q) return;
      var s = q.lifeScale > 0 ? q.lifeScale : 1;
      if (s === state.lifeScale) return;
      state.lifeScale = s;
      active = counts(tier, s);
      active.wakes = !low && s >= 1;
      state.motionDirty = true;
    }
    active.wakes = !low && state.lifeScale >= 1;
    var unsubQ = SL3D && typeof SL3D.onQuality === 'function' ? SL3D.onQuality(function (q) { setQuality(q); }) : null;

    var life = {
      VERSION: VERSION, group: group, tier: tier,
      update: update,
      setEdit: function (on) { state.edit = !!on; if (state.reduced) state.editK = state.edit ? 1 : 0; state.motionDirty = true; },
      setReduced: function (on) { state.reduced = !!on; state.motionDirty = true; },
      setMember: setMember,
      setQuality: setQuality,
      boats: function () { return boatData; },
      info: function () {
        var calls = 0, tris = 0;
        group.traverse(function (o) {
          if (!o.visible || !o.isMesh) return;
          var n = o.isInstancedMesh ? o.count : 1;
          if (!n) return;
          calls++;
          var g = o.geometry, vc = g.index ? g.index.count : g.getAttribute('position').count;
          tris += (vc / 3) * n;
        });
        return { calls: calls, tris: Math.round(tris), taxis: active.taxis, cats: active.cats, birds: active.birds, lanterns: active.lanterns,
                 halos: lanternSlot.filter(function (k) { return k >= 0; }).length + lampSlot.filter(function (k) { return k >= 0; }).length,
                 lifeScale: state.lifeScale };
      },
      dispose: function () {
        if (state.disposed) return;
        state.disposed = true;
        if (unsubQ) unsubQ();
        if (halo && !ownHalo) {
          lanternSlot.concat(lampSlot).forEach(function (k) { if (k >= 0) halo.free(k); });
          halo.commit();
        }
        if (ownHalo) ownHalo.dispose();
        if (group.parent) group.parent.remove(group);
        owned.forEach(function (m) { m.dispose(); });
        group.clear();
      }
    };
    Object.defineProperty(life, 'reduced', { get: function () { return state.reduced; } });
    setMember(opts.member);
    if (typeof opts.show === 'number' && isFinite(opts.show)) {
      state.k = state.showK = clamp01(opts.show);
      state.lanternsOn = state.k >= LANTERN.from;
      state.roostTo = state.showK >= BIRD.roostK ? 1 : 0;
      for (var b = 0; b < full.birds; b++) roostK[b] = state.roostTo;
      for (var l2 = 0; l2 < full.lanterns; l2++) lanternVis[l2] = state.lanternsOn ? 1 : 0;
    }
    update(0, state.k, state.showK);
    return life;
  }

  return {
    VERSION: VERSION, SEED: SEED, create: create,
    COUNTS: COUNTS, TAXI_LOOP: TAXI_LOOP, TAXI: TAXI, CATS: CATS, CAT: CAT, BIRD: BIRD, OVER: OVER, LANTERN: LANTERN,
    BUOYS: BUOYS, FREQS: FREQS, LAMP_K: LAMP_K,
    counts: counts, taxiLoop: taxiLoop, loopAt: loopAt, legDistance: legDistance, taxiAt: taxiAt, taxiMoored: taxiMoored,
    catAt: catAt, birdParams: birdParams, birdFlight: birdFlight, liftAt: liftAt, wingAngle: wingAngle,
    roosts: roosts, lanternAnchors: lanternAnchors, lanternAt: lanternAt, lanternToken: lanternToken
  };
}));
