/* ================================================================
   My Island 3D — the city across the bay (Encore City v2, chunk B2;
   classic script). window.SLCity3D in the browser; require() in Node
   returns the same object, whose PURE layout layer (layout, geometry
   arrays, hero-board words, reflectors, roosts) runs without THREE.
   Non-interactive scenery: nothing here is pickable, nothing reads as
   buildable land, and no vertex comes within 0.3 u of any island cell
   (locked land included). Only the Lantern Bridge's landing reaches into
   the 16 × 10 grid's empty north row, onto the beach abutment.

   LAYERS (islandV2 §4; the default 16:9 home-only pose sees L0 + L1):
     L0  three media barges at x -5.5 / 0.5 / 6.0, z -6.9, half-turned toward the island
         centre (a navigable lane stays open behind them for the water taxis),
         LED screens 1.5 × 0.65 (y 0.15–0.8) from K.ledAtlas() or the procedural
         ♥ ★ ♪ ✦ marquee, an LED Cyan waterline, a 0.2 Hz bob
     L1  the quay: superellipse |x/17|^4 + |(z + 0.6)/7.6|^4 = 1 (flat back at
         z -8.2), a Quay Stone sea wall with a continuous LED Cyan lip, a rail,
         lamp dots every 0.8 u, kiosks / market halls / glass pavilions, the
         ferry terminal at (6, -8) with its floating dock, the hero board podium
     L2  mid-rises 2–4.5 u behind the quay (1.8–4.5 tall) + the Echo Dome arena
     L3  towers 4.5–9 u behind (heights up to 9): needle, twist (7° per plate),
         ringed cylinder, twin with sky-bridge, stepped. Tallest at the back
         centre, 55% at the flanks; a hero (+30%) about every 3rd building, never
         two adjacent; neighbours differ in height by ≥ 12% and never share an
         archetype; façades are 1 of 5 Night Glass tones ±6%
     LANDMARKS  the Halo Wheel (14.5, -6.2), d 3.2, 0.02 rev/s, a plain ring with
         dot lights (0.05 Hz rim sweep); the Lantern Bridge from the abutment
         (-3.2, -4.45) to the quay (-3.2, -8.2): deck 0.42, arch rise 0.55, one
         leaning 2.1 u pylon, 5 cable pairs, LED edges Holo Blue → member colour;
         the Signal Mast on the tallest tower (0.5 Hz soft-sine beacon)

   BUILD: ONE static merged, indexed BufferGeometry (seed 'sl-city-v1', so
   siblings share one city) with aTint / aWin / aAnim, drawn by ONE 'city'
   ShaderMaterial (+1 program): half-lambert from the DUSK → SHOW hemi / sun,
   procedural windows (floors 0.16 u, bays 0.12 u, lit when hash < mix(0.3, 0.7, k),
   each switching once per ramp with a 1.2 s fade; Window Warm or cool white,
   ≤ 8% neon), LED panels, the hero board ("<NAME>'S ISLAND ✦ SHOWTIME" on a
   256 × 64 canvas drawn once, scrolled by UV offset), the wheel spin and barge
   bob in the vertex shader, and its own haze (35–110; emissive parts fogged at
   50%). Showtime wakes the city with a ripple outward from the island: each
   light fades in, nothing pops, nothing flashes (every rate is in FREQS, all
   ≤ 2 Hz). Reduced motion: the wheel and barges are still, boards hold a
   static gradient and every change is its end state at once.
   LOW fallback (opts.fallback, or LOW with the renderer already at its program
   budget): the shared toon program (InstancedMesh count 1, like env's layers)
   plus 'state' window strips; LED boards become slow solid colour fades.

   FOR THE ENVIRONMENT (env.js mounts it when window.SLCity3D exists)
     var city = SLCity3D.create(K, SL3D, {tier, member, reduced, name, seed, show, fallback, programs})
                                        show: the starting k (no ripple); fallback: true forces / false forbids
                                        the LOW fallback; programs: renderer.info.programs.length when known
       scene.add(city.group)            (env adds it to its own group)
     city.update(dt, k) → animating     once per frame; k = env's light mix (0 golden hour … 1 Showtime).
                                        A rising k past 0.25 starts the wake ripple. false = still
     city.setShow(k)                    apply k now with every fade at its end state (photos, cuts)
     city.setMember(hex)                the child's member colour (Showtime LED edges, accents, marquee)
     city.setUser({name})               redraws the hero board when the first name changes
     city.setReduced(on)                reduced motion (still wheel / barges, static boards, instant fades)
     city.reflections() → [{x, z, w, intensity, color}]   the light-pillar sources for the sea shader:
                                        ≤ SL3D.budget.reflections, [] once quality.reflections is off;
                                        waterline point, streak width, 0..1 intensity (k- and wake-scaled)
                                        and a linear THREE.Color. Same array and objects every call
     city.info() → {calls, tris, vertices, buildings, fallback, tier}
     city.dispose()                     frees the geometry, material and hero texture (K's LED atlas stays)
   Pure: SLCity3D.layout({tier, count, seed}), buildArrays(layout), heroWords(name), quayZ(x),
   inExclusion(x, z, pad), roosts(layout), LED_HUES, ACCENTS, FREQS, BRIDGE, WHEEL, BARGES, TERMINAL.
   ================================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    var kit = null;
    try { kit = require('./kit.js'); } catch (e) { kit = null; }
    module.exports = factory(root, require('../world-core.js'), require('./grid3d.js'), require('../world-look.js'), kit);
  } else root.SLCity3D = factory(root, null, null, null, null);
}(typeof self !== 'undefined' ? self : typeof globalThis !== 'undefined' ? globalThis : this, function (root, C0, G0, L0, KIT0) {
  'use strict';

  var VERSION = 1;
  var SEED = 'sl-city-v1';
  var DEG = Math.PI / 180, TAU = Math.PI * 2;

  /* lazy module lookups, so script order never matters in the browser */
  function core() { var c = C0 || root.SLWorldCore; if (!c) throw new Error('SLCity3D: SLWorldCore is not loaded'); return c; }
  function look() { return L0 || root.SLIslandLook || null; }
  function kitApi() { return KIT0 || root.SLKit || null; }
  function seaY() { var g = G0 || root.SLGrid3D; return g && typeof g.SEA_Y === 'number' ? g.SEA_Y : -0.32; }

  /* ---------------- constants ---------------- */
  var SEA = seaY();
  var GROUND = SEA + 0.42;               /* the quay top / promenade (y 0.10) */
  var QUAY = { a: 17, b: 7.6, cz: -0.6, zEnd: -1.0, wallFoot: SEA - 0.3, lip: [0.012, 0.062], rail: [0.1, 0.125], cap: 0.1,
               promenade: 1.7, far: 16, step: { LOW: 0.9, MID: 0.6, HIGH: 0.5 } };
  var BARGE = { hullW: 1.6, hullD: 0.44, hullTop: 0.1, hullFoot: -0.1, screenW: 1.5, screenH: 0.65, screenY: 0.15,
                facing: 0.5, hz: 0.2, amp: 0.022 };
  /* screens: two atlas programs + the procedural icon marquee; dominant hue for the water pillar */
  var BARGES = [
    { x: -5.5, z: -6.9, prog: 'eq', glow: 'Neon Magenta' },
    { x: 0.5, z: -6.9, prog: 'marquee', glow: 'LED Cyan' },
    { x: 6.0, z: -6.9, prog: 'wave', glow: 'Electric Violet' }
  ];
  var WHEEL = { x: 14.5, z: -6.2, d: 3.2, rps: 0.02, sweepHz: 0.05, clear: 0.25, axleHalf: 0.3,
                seg: { LOW: 20, MID: 28, HIGH: 36 }, dots: { LOW: 12, MID: 20, HIGH: 24 }, spokes: { LOW: 6, MID: 8, HIGH: 8 } };
  var BRIDGE = { x: -3.2, z0: -4.45, z1: -8.2, width: 0.42, rise: 0.55, deck: 0.06, y0: 0.08,
                 pylon: { x: -3.54, z: -4.72, h: 2.1, lean: 12, tilt: 4 }, cables: 5, seg: { LOW: 10, MID: 16, HIGH: 20 } };
  var TERMINAL = { x: 6.0, w: 1.6, berth: { x: 6.0, dz: 0.6 } };
  var PODIUM = { x: 2.4, off: 1.05, w: 3.1, h: 1.05, d: 0.9, board: { w: 2.8, h: 0.42, y: 0.48 } };
  var ARENA = { x: -9.6, off: 3.1, r: 1.1, drum: 0.5, dome: 0.8 };
  var MAST = { h: 1.0, beaconHz: 0.5 };
  var LAMP_EVERY = { LOW: 1.6, MID: 0.8, HIGH: 0.8 };
  var KIOSKS = { LOW: 6, MID: 10, HIGH: 14 };
  var COUNTS = { LOW: 30, MID: 60, HIGH: 90 };
  var PLATE = { LOW: 0.48, MID: 0.36, HIGH: 0.36 };   /* twist plate height (7° turn per plate) */
  var TWIST_DEG = 7;
  var RADIAL = { LOW: 8, MID: 10, HIGH: 12 };
  var WAKE = { k: 0.25, speed: 9, fade: 0.6, from: 5, end: 6 };   /* u/s, s, u before the delay starts, s to finish */
  var LIT = { dusk: 0.3, show: 0.7, band: 0.1, fadeSec: 1.2 };
  var HAZE = { near: 35, far: 110, floorDusk: 0.3, floorShow: 0.15 };
  /* the rows behind the quay: centre offset (u), depth cap, layer */
  var ROWS = {
    LOW: [{ layer: 'L2', off: 2.7, dMax: 1.2 }, { layer: 'L3', off: 6.2, dMax: 1.5 }],
    MID: [{ layer: 'L2', off: 2.7, dMax: 1.2 }, { layer: 'L3', off: 5.4, dMax: 1.4 }, { layer: 'L3', off: 7.7, dMax: 1.5 }],
    HIGH: [{ layer: 'L2', off: 2.4, dMax: 1.05 }, { layer: 'L2', off: 3.9, dMax: 1.05 }, { layer: 'L3', off: 5.4, dMax: 1.4 }, { layer: 'L3', off: 7.7, dMax: 1.5 }]
  };
  var LAYERS = { L2: { lo: 1.8, hi: 4.5, density: 1.0 }, L3: { lo: 4.5, hi: 9.0, density: 0.85 } };
  var HERO_MUL = 1.3, NEIGHBOUR_DIFF = 0.12, FLANK = 0.55, ENV_X = 19;
  var ARCH = { L2: ['slab', 'stepped', 'ringed', 'twin'], L3: ['needle', 'twist', 'ringed', 'twin', 'stepped'] };
  var TONES = ['Night Glass Indigo', 'Night Glass Teal', 'Night Glass Plum', 'Night Glass Graphite', 'Night Glass Smoke'];
  /* accent and LED colour sets: 4 palette neons + the member colour, used round-robin (each 20%) */
  var ACCENTS = ['Neon Magenta', 'LED Cyan', 'Electric Violet', 'Laser Lime', '@member'];
  var NEON4 = ['Neon Magenta', 'LED Cyan', 'Electric Violet', 'Laser Lime'];
  /* LED programs on the city: atlas strips (kit LED_PROGRAMS 0–3) + the procedural marquee / sweep */
  var LED_PROG = { eq: 0, wave: 1, spark: 2, gradient: 3, marquee: 8, sweep: 9 };
  var LED_ROTATION = ['eq', 'sweep', 'spark', 'marquee', 'wave', 'gradient'];
  var LED_HUES = { eq: NEON4, wave: NEON4, spark: NEON4, gradient: NEON4, marquee: ACCENTS, sweep: ACCENTS };
  var LED_SCROLL = 0.08;      /* atlas windows per second (8 bars a period → ≤ 0.64 Hz a pixel) */
  var MARQUEE_SPEED = 0.25;   /* icons per second (≈ 2 light / dark passes per icon at a pixel) */
  var HERO_SCROLL = 1 / 40;   /* hero board loops per second */
  var HERO_STROKES = 32;      /* ≥ the bright / dark stroke pairs one loop of the board's text passes a pixel */
  /* every periodic light / motion in the city (Hz) — all ≤ SLMotion.MAX_FLASH_HZ, and the per-pixel
     rates of the scrolling boards (ledPixel, marquee, heroPixel, wheelDots) ≤ LED_CHASE_HZ (test-enforced) */
  var FREQS = {
    wheel: WHEEL.rps, sweep: WHEEL.sweepHz, beacon: MAST.beaconHz, barge: BARGE.hz,
    ledScroll: LED_SCROLL, ledPixel: LED_SCROLL * 8, marquee: MARQUEE_SPEED * 2, boardSweep: 0.05,
    heroScroll: HERO_SCROLL, heroPixel: HERO_SCROLL * HERO_STROKES, wheelDots: WHEEL.rps * 24, windowFade: 1 / LIT.fadeSec
  };
  var KIND = { solid: 0, led: 1, glass: 2, glow: 3, hero: 4, beacon: 5, dot: 6 };
  var MODE = { none: 0, wheel: 2, barge: 5 };

  /* ================================================================
     PURE HELPERS (no THREE; Node-testable)
     ================================================================ */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function lerp(a, b, k) { return a + (b - a) * k; }
  function smooth(a, b, x) { var u = clamp01((x - a) / (b - a)); return u * u * (3 - 2 * u); }
  function parseTier(t) { var u = typeof t === 'string' ? t.toUpperCase() : ''; return COUNTS[u] ? u : null; }
  /* FNV-1a 32-bit (the same hash as SLMotion / SLGrid3D) and a small seeded stream */
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

  /* ---------------- the quay superellipse ---------------- */
  /* the back of the quay at x (|x| ≤ a): z = cz - b (1 - |x/a|^4)^(1/4) */
  function quayZ(x) { var u = Math.min(1, Math.abs(x) / QUAY.a); return QUAY.cz - QUAY.b * Math.pow(1 - Math.pow(u, 4), 0.25); }
  function polar(psi) {
    var c = Math.cos(psi), s = Math.sin(psi);
    var r = 1 / Math.pow(Math.pow(Math.abs(c) / QUAY.a, 4) + Math.pow(Math.abs(s) / QUAY.b, 4), 0.25);
    return { x: r * c, z: QUAY.cz - r * s };
  }
  /* outward (city-side) unit normal of the superellipse at (x, z) */
  function normalAt(x, z) {
    var gx = x * x * x / Math.pow(QUAY.a, 4), gz = (z - QUAY.cz) * (z - QUAY.cz) * (z - QUAY.cz) / Math.pow(QUAY.b, 4);
    var l = Math.sqrt(gx * gx + gz * gz) || 1;
    return { x: gx / l, z: gz / l };
  }
  /* the polar angle where the quay ends on each flank (z = zEnd) */
  var PSI_END = (function () {
    var lo = 0, hi = Math.PI / 2;
    for (var i = 0; i < 60; i++) { var m = (lo + hi) / 2; if (polar(m).z > QUAY.zEnd) lo = m; else hi = m; }
    return (lo + hi) / 2;
  }());
  /* the quay line offset outward by `off`, resampled every `step` u of arc, west → east:
     [{x, z, nx, nz (outward), tx, tz (eastward), s}] */
  var curveCache = {};
  function quayCurve(off, step) {
    off = off || 0; step = step || 0.5;
    var key = off.toFixed(3) + '|' + step.toFixed(3);
    if (curveCache[key]) return curveCache[key];
    var dense = [], N = 720, i;
    for (i = 0; i <= N; i++) {
      var psi = Math.PI - PSI_END - (Math.PI - 2 * PSI_END) * i / N, p = polar(psi), n = normalAt(p.x, p.z);
      dense.push({ x: p.x + n.x * off, z: p.z + n.z * off, nx: n.x, nz: n.z });
    }
    var acc = [0];
    for (i = 1; i < dense.length; i++) acc.push(acc[i - 1] + Math.hypot(dense[i].x - dense[i - 1].x, dense[i].z - dense[i - 1].z));
    var L = acc[acc.length - 1], count = Math.max(2, Math.round(L / step) + 1), out = [], j = 0;
    for (i = 0; i < count; i++) {
      var s = L * i / (count - 1);
      while (j < acc.length - 2 && acc[j + 1] < s) j++;
      var f = (s - acc[j]) / ((acc[j + 1] - acc[j]) || 1), a = dense[j], b = dense[j + 1];
      var nx = lerp(a.nx, b.nx, f), nz = lerp(a.nz, b.nz, f), nl = Math.sqrt(nx * nx + nz * nz) || 1;
      nx /= nl; nz /= nl;
      out.push({ x: lerp(a.x, b.x, f), z: lerp(a.z, b.z, f), nx: nx, nz: nz, tx: -nz, tz: nx, s: s });
    }
    curveCache[key] = out;
    return out;
  }
  /* a point on a resampled curve at arc length s */
  function curveAt(curve, s) {
    var L = curve[curve.length - 1].s, step = L / (curve.length - 1);
    var f = clamp(s, 0, L) / step, i = Math.min(curve.length - 2, Math.floor(f)), t = f - i, a = curve[i], b = curve[i + 1];
    var nx = lerp(a.nx, b.nx, t), nz = lerp(a.nz, b.nz, t), nl = Math.sqrt(nx * nx + nz * nz) || 1;
    nx /= nl; nz /= nl;
    return { x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t), nx: nx, nz: nz, tx: -nz, tz: nx, s: s };
  }
  /* the arc length on a curve closest to world x (curves run west → east, so x grows with s) */
  function sAtX(curve, x) {
    var best = 0, bd = Infinity;
    for (var i = 0; i < curve.length; i++) { var d = Math.abs(curve[i].x - x) + (curve[i].nz > -0.2 ? 5 : 0); if (d < bd) { bd = d; best = i; } }
    return curve[best].s;
  }
  /* the yaw that turns an item's local +z toward the island (-normal), local +x eastward */
  function yawFacing(nx, nz) { return Math.atan2(-nx, -nz); }

  /* ---------------- the island exclusion zone ---------------- */
  var CELLS = null;
  function cells() {
    if (CELLS) return CELLS;
    var C = core(), out = [];
    Object.keys(C.REGION_CELLS).forEach(function (r) {
      C.REGION_CELLS[r].forEach(function (k) { var p = k.split(','); out.push([+p[0] - 8, +p[1] - 5]); });
    });
    return (CELLS = out);
  }
  /* distance (u) from (x, z) to the union of every region cell square (locked land included) */
  function cellDistance(x, z) {
    var best = Infinity, list = cells();
    for (var i = 0; i < list.length; i++) {
      var x0 = list[i][0], z0 = list[i][1];
      var dx = Math.max(x0 - x, 0, x - x0 - 1), dz = Math.max(z0 - z, 0, z - z0 - 1);
      var d = Math.sqrt(dx * dx + dz * dz);
      if (d < best) best = d;
    }
    return best;
  }
  /* true when (x, z) is inside the island exclusion: every REGION_CELLS cell dilated by pad (0.3) */
  function inExclusion(x, z, pad) { return cellDistance(x, z) < (pad == null ? 0.3 : pad); }

  /* ---------------- the hero board's words ---------------- */
  function signName(name) {
    var K = kitApi();
    if (K && typeof K.signName === 'function') return K.signName(name);
    var first = String(name == null ? '' : name).trim().split(/\s+/)[0] || '';
    return first.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ'\-]/g, '').toUpperCase().slice(0, 12).replace(/['\-]+$/, '');
  }
  /* the words drawn on the hero board, in order (a ✦ follows ISLAND and closes the loop):
     the child's first name + 'S, then ISLAND and SHOWTIME from SIGN_WORDS */
  function heroWords(name) {
    var n = signName(name);
    return n ? [n + "'S", 'ISLAND', 'SHOWTIME'] : ['ISLAND', 'SHOWTIME'];
  }

  /* ---------------- colours (pure) ---------------- */
  var HEX_FALLBACK = {
    'Night Glass Indigo': '#2A2F5E', 'Night Glass Teal': '#1F4A55', 'Night Glass Plum': '#43294F', 'Night Glass Graphite': '#2B2D38',
    'Night Glass Smoke': '#4A4E63', 'Quay Stone': '#3B3747', 'Night Asphalt': '#3A3646', 'Concrete': '#8C8798', 'Concrete Light': '#C9C5D3',
    'Bone White': '#F4F2FA', 'Graphite': '#2E2B3A', 'Gunmetal': '#5A5F72', 'Gunmetal Deep': '#2A2D3A', 'Gunmetal Spec': '#E6E9F2',
    'Teak': '#9A6A4A', 'Teak Light': '#B07E58', 'Coral': '#FF6B6B', 'Midnight Ink': '#14101F', 'Window Warm': '#FFD08A',
    'Sunset Amber': '#FFB23E', 'Holo Blue': '#B3E5FF', 'Neon Magenta': '#FF2E9A', 'LED Cyan': '#22E4FF', 'Electric Violet': '#8A5CFF',
    'Laser Lime': '#C6FF3D', 'Cloud White': '#FFFFFF', 'Smoked Glass': '#1B2438'
  };
  function hexOf(token) {
    var L = look(), h = L && typeof L.hex === 'function' ? L.hex(token) : null;
    return h || HEX_FALLBACK[token] || '#FFFFFF';
  }
  function srgbToLinear(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  var linCache = {};
  /* token → linear [r, g, b] ('@member' → Bone White: the shader swaps in the member colour) */
  function linear(token) {
    if (token === '@member') token = 'Bone White';
    if (linCache[token]) return linCache[token];
    var n = parseInt(hexOf(token).slice(1), 16);
    return (linCache[token] = [srgbToLinear(((n >> 16) & 255) / 255), srgbToLinear(((n >> 8) & 255) / 255), srgbToLinear((n & 255) / 255)]);
  }

  /* ================================================================
     LAYOUT (deterministic for (tier, count, seed); siblings share one city)
     ================================================================ */
  function heightEnvelope(x) { var u = clamp01(Math.abs(x) / ENV_X); return FLANK + (1 - FLANK) * 0.5 * (1 + Math.cos(Math.PI * u)); }
  function counts(tier, n) {
    tier = parseTier(tier) || 'MID';
    return { tier: tier, buildings: Math.max(6, Math.round(n > 0 ? n : COUNTS[tier])) };
  }

  function layout(o) {
    o = o || {};
    var tier = parseTier(o.tier) || 'MID', seed = o.seed || SEED;
    var total = counts(tier, o.count).buildings;
    var R = rng(fnv(seed + ':rows')), RL = rng(fnv(seed + ':led')), RK = rng(fnv(seed + ':kiosk'));
    var rows = ROWS[tier];
    var out = { tier: tier, seed: seed, buildings: [], kiosks: [], lamps: [], barges: [], rows: [], leds: [], accents: [],
                reflectors: [], ground: GROUND, sea: SEA };

    /* specials first: the Echo Dome (L2 band) and the hero board podium (promenade) */
    var arenaCurve = quayCurve(ARENA.off, 0.25), arenaS = sAtX(arenaCurve, ARENA.x), arenaP = curveAt(arenaCurve, arenaS);
    var arena = { kind: 'arena', arch: 'arena', layer: 'L2', row: -1, x: arenaP.x, z: arenaP.z, yaw: yawFacing(arenaP.nx, arenaP.nz),
                  w: ARENA.r * 2, d: ARENA.r * 2, h: ARENA.drum + ARENA.dome, hero: false, tone: 'Night Glass Smoke', toneK: 1,
                  accent: 'Electric Violet', led: { prog: 'sweep' }, seed: R(), warmth: 0.7, litBias: 0 };
    var podCurve = quayCurve(PODIUM.off, 0.25), podP = curveAt(podCurve, sAtX(podCurve, PODIUM.x));
    var podium = { kind: 'podium', arch: 'podium', layer: 'L1', row: -1, x: podP.x, z: podP.z, yaw: yawFacing(podP.nx, podP.nz),
                   w: PODIUM.w, d: PODIUM.d, h: PODIUM.h, hero: false, tone: 'Night Glass Graphite', toneK: 1,
                   accent: 'LED Cyan', led: null, seed: R(), warmth: 0.8, litBias: 0.05 };
    out.arena = arena; out.podium = podium;

    /* distribute the regular buildings over the rows by usable length × density */
    var regular = Math.max(rows.length * 2, total - 2), spans = [], weight = 0;
    rows.forEach(function (row, ri) {
      var curve = quayCurve(row.off, 0.25), L = curve[curve.length - 1].s, margin = 1.2;
      var ranges = [[margin, L - margin]];
      if (row.layer === 'L2') {                      /* the arena owns its stretch of the L2 band */
        var sa = sAtX(curve, arena.x), half = ARENA.r + 0.55;
        ranges = [[margin, sa - half], [sa + half, L - margin]];
      }
      var len = 0;
      ranges.forEach(function (r) { len += Math.max(0, r[1] - r[0]); });
      spans.push({ row: row, ri: ri, curve: curve, ranges: ranges, len: len });
      weight += len * LAYERS[row.layer].density;
    });
    var given = 0;
    spans.forEach(function (sp, i) {
      sp.n = i === spans.length - 1 ? regular - given : Math.max(2, Math.round(regular * sp.len * LAYERS[sp.row.layer].density / weight));
      given += sp.n;
    });

    var accentBase = Math.floor(R() * ACCENTS.length), ledTurn = Math.floor(RL() * LED_ROTATION.length), id = 0;
    spans.forEach(function (sp) {
      var lay = LAYERS[sp.row.layer], seq = [];
      /* slots per range, proportional to its length */
      var left = sp.n;
      sp.ranges.forEach(function (rg, k) {
        var len = Math.max(0, rg[1] - rg[0]);
        var m = k === sp.ranges.length - 1 ? left : Math.round(sp.n * len / (sp.len || 1));
        left -= m;
        var spacing = len / Math.max(1, m);
        for (var i = 0; i < m; i++) seq.push({ s: rg[0] + spacing * (i + 0.5) + (R() - 0.5) * 0.2 * spacing, spacing: spacing });
      });
      var nextHero = 1 + Math.floor(R() * 3), prev = null;
      seq.forEach(function (slot, i) {
        var p = curveAt(sp.curve, slot.s);
        var pool = ARCH[sp.row.layer].filter(function (a) { return !prev || a !== prev.arch; });
        var arch = pool[Math.floor(R() * pool.length)];
        /* footprints never touch: centres are ≥ 0.8 spacing apart and half-widths ≤ 0.375 spacing (a twist's
           turning plates included: its diagonal stays inside that) */
        var w = clamp(slot.spacing * (0.55 + 0.2 * R()), 0.5, arch === 'twin' ? 1.9 : 1.6);
        if (arch === 'needle') w = Math.min(w, 0.6 + 0.3 * R());
        var d = Math.min(sp.row.dMax, (arch === 'ringed' ? w : 0.6 + 0.6 * R()));
        if (arch === 'ringed') { w = Math.min(w, sp.row.dMax); d = w; }
        if (arch === 'twist') { w = Math.min(w, 0.65 * slot.spacing, sp.row.dMax); d = 0.85 * w; }
        var hero = i === nextHero;
        if (hero) nextHero = i + 2 + Math.floor(R() * 3);
        var env = heightEnvelope(p.x);
        var hiBase = lay.hi / HERO_MUL;
        var h = env * lerp(lay.lo, hiBase, 0.25 + 0.75 * R());
        if (hero) h *= HERO_MUL;
        if (prev) h = neighbourHeight(h, prev.h, lay, hero);
        var tones = TONES.filter(function (t) { return !prev || t !== prev.tone; });
        var b = {
          id: id++, kind: 'building', arch: arch, layer: sp.row.layer, row: sp.ri, i: i, s: slot.s,
          x: p.x, z: p.z, yaw: yawFacing(p.nx, p.nz), nx: p.nx, nz: p.nz,
          w: w, d: d, h: h, hero: hero, env: env,
          tone: tones[Math.floor(R() * tones.length)], toneK: 0.94 + 0.12 * R(),
          accent: ACCENTS[(accentBase + id) % ACCENTS.length],
          warmth: 0.55 + 0.4 * R(), litBias: (R() - 0.5) * 0.16, seed: R(), led: null, mast: false
        };
        /* LED façades (never on a twist: its turning plates are the show) */
        if (RL() < (sp.row.layer === 'L2' ? 0.42 : 0.3) && arch !== 'twist') { b.led = { prog: LED_ROTATION[ledTurn % LED_ROTATION.length] }; ledTurn++; }
        seq[i] = b;
        prev = b;
      });
      out.rows.push({ layer: sp.row.layer, off: sp.row.off, buildings: seq.map(function (b) { return b.id; }) });
      Array.prototype.push.apply(out.buildings, seq);
    });
    /* the Signal Mast tops the tallest tower */
    var tallest = null;
    out.buildings.forEach(function (b) { if (!tallest || b.h > tallest.h) tallest = b; });
    out.mast = null;
    if (tallest) {
      tallest.mast = true;
      var ml = mastLocal(tallest), mc = Math.cos(tallest.yaw), ms = Math.sin(tallest.yaw);
      out.mast = { x: tallest.x + ml[0] * mc + ml[2] * ms, y: GROUND + ml[1], z: tallest.z - ml[0] * ms + ml[2] * mc, yaw: tallest.yaw, building: tallest.id };
    }
    out.buildings.push(arena, podium);
    arena.id = id++; podium.id = id++;

    /* LED panels and neon accents (for the hue-mix rule) */
    out.buildings.forEach(function (b) {
      if (b.led) out.leds.push({ building: b.id, prog: b.led.prog, hues: LED_HUES[b.led.prog].slice() });
      out.accents.push(b.accent);
    });
    BARGES.forEach(function (bg) { out.leds.push({ barge: true, prog: bg.prog, hues: LED_HUES[bg.prog].slice() }); });

    /* barges: screens angled toward the island centre (BARGE.facing of the full turn) */
    BARGES.forEach(function (bg, i) {
      out.barges.push({ i: i, x: bg.x, z: bg.z, yaw: Math.atan2(-bg.x, -bg.z) * BARGE.facing, prog: bg.prog, glow: bg.glow });
    });

    /* promenade: lamps every LAMP_EVERY, kiosks between the landmarks */
    var edge = quayCurve(0, 0.1), lampCurve = quayCurve(0.24, 0.1), L0 = lampCurve[lampCurve.length - 1].s;
    var every = LAMP_EVERY[tier];
    for (var s = every / 2; s < L0 - 0.4; s += every) {
      var lp = curveAt(lampCurve, s);
      if (Math.abs(lp.x - BRIDGE.x) < 0.45 || Math.abs(lp.x - WHEEL.x) < 0.9 || (Math.abs(lp.x - TERMINAL.x) < 1.25 && lp.nz < -0.5)) continue;
      out.lamps.push({ x: lp.x, z: lp.z, yaw: yawFacing(lp.nx, lp.nz) });
    }
    /* kiosks, market halls and glass pavilions: evenly along the back of the promenade, nudged
       off the bridge landing, the terminal, the wheel pier and the hero podium */
    var kCurve = quayCurve(0.82, 0.1), KL = kCurve[kCurve.length - 1].s, nK = KIOSKS[tier];
    var types = ['kiosk', 'hall', 'pavilion'];
    var keepOut = [[BRIDGE.x, 1.2], [TERMINAL.x, 1.6], [WHEEL.x, 1.9], [podium.x, PODIUM.w / 2 + 0.85]];
    var kStep = (KL - 4) / nK;
    function kioskOk(kp) {
      if (kp.nz > -0.25) return false;
      for (var q = 0; q < keepOut.length; q++) if (Math.abs(kp.x - keepOut[q][0]) < keepOut[q][1]) return false;
      for (q = 0; q < out.kiosks.length; q++) if (Math.hypot(out.kiosks[q].x - kp.x, out.kiosks[q].z - kp.z) < 1.6) return false;
      return true;
    }
    for (var ki = 0; ki < nK; ki++) {
      var base = 2 + kStep * (ki + 0.5) + (RK() - 0.5) * 0.3 * kStep, kp = null;
      [0, 0.35, -0.35, 0.7, -0.7].some(function (f) { var c = curveAt(kCurve, base + f * kStep); if (kioskOk(c)) { kp = c; return true; } return false; });
      var kr = RK();
      if (!kp) continue;
      var type = types[out.kiosks.length % types.length];
      out.kiosks.push({ type: type, x: kp.x, z: kp.z, yaw: yawFacing(kp.nx, kp.nz), h: type === 'pavilion' ? 0.5 + 0.8 * kr : type === 'hall' ? 0.72 : 0.62,
                        accent: ACCENTS[out.kiosks.length % ACCENTS.length], seed: kr });
    }

    /* the terminal, the wheel, the bridge */
    var termP = curveAt(edge, sAtX(edge, TERMINAL.x));
    out.terminal = { x: termP.x, z: termP.z, yaw: yawFacing(termP.nx, termP.nz), nx: termP.nx, nz: termP.nz,
                     berth: { x: TERMINAL.berth.x, z: termP.z - termP.nz * TERMINAL.berth.dz } };
    var wq = quayZ(WHEEL.x);
    var ax = -WHEEL.x, az = -WHEEL.z, al = Math.sqrt(ax * ax + az * az);
    out.wheel = { x: WHEEL.x, z: WHEEL.z, y: GROUND + WHEEL.clear + WHEEL.d / 2, r: WHEEL.d / 2, axis: [ax / al, 0, az / al], quayZ: wq };
    out.bridge = bridgeSpec();

    /* reflection sources: barges, the wheel, then the brightest LED façades nearest the quay */
    out.barges.forEach(function (bg) {
      out.reflectors.push({ src: 'barge', x: bg.x, z: bg.z + 0.32, w: 0.9, base: 0.85, token: bg.glow });
    });
    out.reflectors.push({ src: 'wheel', x: WHEEL.x, z: WHEEL.z + 0.35, w: 1.2, base: 0.9, token: 'Electric Violet' });
    /* (only façades whose waterline lies behind the island: the sea shader skips pillars at z > -4.4) */
    var lit = out.buildings.filter(function (b) { return b.led && b.kind === 'building' && quayZ(b.x) < -5; }).sort(function (a, b) {
      return (a.layer === b.layer ? 0 : a.layer === 'L2' ? -1 : 1) || Math.abs(a.x) - Math.abs(b.x);
    });
    lit.forEach(function (b) {
      out.reflectors.push({ src: 'tower', building: b.id, x: b.x, z: quayZ(b.x) + 0.08, w: 0.5, base: 0.6,
                            token: LED_HUES[b.led.prog][b.id % LED_HUES[b.led.prog].length] });
    });
    out.reflectors.push({ src: 'arena', x: arena.x, z: quayZ(arena.x) + 0.08, w: 0.7, base: 0.6, token: 'Electric Violet' });
    return out;
  }
  /* where the Signal Mast stands on a building (local: the top of its tallest part) */
  function mastLocal(b) {
    if (b.arch === 'needle') return [0, b.h + 0.26, 0];
    if (b.arch === 'ringed') return [0, b.h + 0.14, 0];
    if (b.arch === 'twin') return [(b.seed < 0.5 ? -1 : 1) * (b.w * 0.4 + b.w * 0.2) / 2, b.h, 0];
    return [0, b.h, 0];
  }
  /* push h away from the neighbour's height until they differ by ≥ 12% (staying inside the layer) */
  function neighbourHeight(h, ph, lay, hero) {
    var lo = lay.lo * FLANK * 0.9, hi = lay.hi;
    function ok(v) { return Math.abs(v - ph) / Math.max(v, ph) >= NEIGHBOUR_DIFF; }
    if (ok(h)) return clamp(h, lo, hi);
    var up = ph * (1 + NEIGHBOUR_DIFF + 0.03), down = ph * (1 - NEIGHBOUR_DIFF - 0.03);
    var first = hero || h >= ph ? up : down, second = first === up ? down : up;
    if (first <= hi && first >= lo && ok(first)) return first;
    if (second <= hi && second >= lo && ok(second)) return second;
    return clamp(first, lo, hi);
  }
  /* the Lantern Bridge: deck profile, pylon and cable anchors */
  function bridgeSpec() {
    var z1 = quayZ(BRIDGE.x), L = BRIDGE.z0 - z1, zm = (BRIDGE.z0 + z1) / 2;
    var P = BRIDGE.pylon, lean = P.lean * DEG, tilt = P.tilt * DEG;
    var dir = [Math.sin(tilt), Math.cos(lean) * Math.cos(tilt), -Math.sin(lean)], dl = Math.sqrt(dir[0] * dir[0] + dir[1] * dir[1] + dir[2] * dir[2]);
    var base = [P.x, SEA - 0.05, P.z], top = [base[0] + dir[0] / dl * P.h, base[1] + dir[1] / dl * P.h, base[2] + dir[2] / dl * P.h];
    var cables = [];
    for (var k = 0; k < BRIDGE.cables; k++) {
      var cz = BRIDGE.z0 - 0.75 - k * 0.6;
      [-1, 1].forEach(function (side) {
        cables.push({ from: [top[0] + 0.01 * side, top[1] - 0.06 - 0.05 * k, top[2]], to: [BRIDGE.x + side * (BRIDGE.width / 2 - 0.015), deckY(cz) + 0.012, cz] });
      });
    }
    return { x: BRIDGE.x, z0: BRIDGE.z0, z1: z1, length: L, mid: zm, width: BRIDGE.width, deck: BRIDGE.deck, pylon: { base: base, top: top }, cables: cables };
  }
  /* the deck's top height at z along the span: a straight ramp between its ends plus the arch */
  function deckY(z) {
    var z1 = quayZ(BRIDGE.x), t = clamp01((BRIDGE.z0 - z) / (BRIDGE.z0 - z1)), s = 2 * t - 1;
    return lerp(BRIDGE.y0, GROUND, t) + BRIDGE.rise * (1 - s * s);
  }
  /* where ambient life may perch: the pylon top, the upper cables and the quay rail, facing the island */
  function roosts(lay) {
    lay = lay || layout({ tier: 'MID' });
    var b = lay.bridge, out = [], t = b.pylon.top;
    out.push({ x: t[0] - 0.05, y: t[1] + 0.03, z: t[2], yaw: 0, at: 'pylon' });
    out.push({ x: t[0] + 0.06, y: t[1] + 0.03, z: t[2] + 0.04, yaw: 0.4, at: 'pylon' });
    for (var k = 0; k < 2; k++) {
      var c = b.cables[k * 2 + 1], f = 0.35 + 0.15 * k;
      out.push({ x: lerp(c.from[0], c.to[0], f), y: lerp(c.from[1], c.to[1], f) + 0.02, z: lerp(c.from[2], c.to[2], f), yaw: 0, at: 'cable' });
    }
    var rail = quayCurve(0.05, 0.1);
    [-6.4, -5.7, -1.6, -0.9, 0.9, 1.7, 4.2, 8.4, 9.1, -8.6].forEach(function (x) {
      var p = curveAt(rail, sAtX(rail, x));
      out.push({ x: p.x, y: GROUND + QUAY.rail[1] + 0.012, z: p.z, yaw: yawFacing(p.nx, p.nz), at: 'rail' });
    });
    return out;
  }

  /* ================================================================
     GEOMETRY (pure typed arrays; create() wraps them in one BufferGeometry)
     ================================================================ */
  /* growable typed buffers: one vertex = position 3, normal 3, uv 2, aTint 3, aWin 4, aAnim 4 */
  function Builder() {
    this.cap = 4096; this.nv = 0; this.ni = 0;
    this.P = new Float32Array(this.cap * 3); this.N = new Float32Array(this.cap * 3); this.U = new Float32Array(this.cap * 2);
    this.T = new Float32Array(this.cap * 3); this.W = new Float32Array(this.cap * 4); this.A = new Float32Array(this.cap * 4);
    this.K = new Uint8Array(this.cap); this.I = new Uint32Array(this.cap * 2);
    this.tint = [1, 1, 1]; this.win = [0, 0, 0, 0]; this.anim = [0, 0, 0, 0];
    this.ox = 0; this.oy = 0; this.oz = 0; this.c = 1; this.s = 0;
    this.tris = 0;
  }
  var BP = Builder.prototype;
  function grown(a, n) { var b = new a.constructor(n); b.set(a); return b; }
  BP.grow = function () {
    var c = this.cap * 2;
    this.P = grown(this.P, c * 3); this.N = grown(this.N, c * 3); this.U = grown(this.U, c * 2);
    this.T = grown(this.T, c * 3); this.W = grown(this.W, c * 4); this.A = grown(this.A, c * 4); this.K = grown(this.K, c);
    this.cap = c;
  };
  BP.idx = function (a, b, c) {
    if (this.ni + 3 > this.I.length) this.I = grown(this.I, this.I.length * 2);
    this.I[this.ni++] = a; this.I[this.ni++] = b; this.I[this.ni++] = c;
  };
  /* local frame: world = R_y(yaw) · local + (x, y, z) */
  BP.frame = function (x, y, z, yaw) { this.ox = x; this.oy = y; this.oz = z; this.c = Math.cos(yaw || 0); this.s = Math.sin(yaw || 0); return this; };
  BP.solid = function (token, k, haze) { var c = linear(token), m = k || 1; this.tint = [c[0] * m, c[1] * m, c[2] * m]; this.win = [this.win[0], haze || 0, 0, KIND.solid]; return this; };
  BP.state = function (tint, win) { this.tint = tint; this.win = win; return this; };
  BP.setAnim = function (a) { this.anim = a || [0, 0, 0, 0]; return this; };
  BP.vert = function (lx, ly, lz, nx, ny, nz, u, v) {
    if (this.nv === this.cap) this.grow();
    var c = this.c, s = this.s, i = this.nv, j3 = i * 3, j4 = i * 4, t = this.tint, w = this.win, a = this.anim;
    this.P[j3] = this.ox + lx * c + lz * s; this.P[j3 + 1] = this.oy + ly; this.P[j3 + 2] = this.oz - lx * s + lz * c;
    this.N[j3] = nx * c + nz * s; this.N[j3 + 1] = ny; this.N[j3 + 2] = -nx * s + nz * c;
    this.U[i * 2] = u; this.U[i * 2 + 1] = v;
    this.T[j3] = t[0]; this.T[j3 + 1] = t[1]; this.T[j3 + 2] = t[2];
    this.W[j4] = w[0]; this.W[j4 + 1] = w[1]; this.W[j4 + 2] = w[2]; this.W[j4 + 3] = w[3];
    this.A[j4] = a[0]; this.A[j4 + 1] = a[1]; this.A[j4 + 2] = a[2]; this.A[j4 + 3] = a[3];
    this.K[i] = w[3];
    this.nv++;
    return i;
  };
  /* rescale the v of the last n vertices (LED bands authored in world units → 0..1) */
  BP.scaleV = function (n, k) { for (var i = this.nv - n; i < this.nv; i++) this.U[i * 2 + 1] *= k; };
  /* a quad a-b-c-d (counter-clockwise seen from the front), flat normal n, uvs [u0, v0, u1, v1] */
  BP.quad = function (a, b, c, d, n, uv) {
    uv = uv || [0, 0, 1, 1];
    var i0 = this.vert(a[0], a[1], a[2], n[0], n[1], n[2], uv[0], uv[1]);
    this.vert(b[0], b[1], b[2], n[0], n[1], n[2], uv[2], uv[1]);
    this.vert(c[0], c[1], c[2], n[0], n[1], n[2], uv[2], uv[3]);
    this.vert(d[0], d[1], d[2], n[0], n[1], n[2], uv[0], uv[3]);
    this.idx(i0, i0 + 1, i0 + 2); this.idx(i0, i0 + 2, i0 + 3);
    this.tris += 2;
  };
  function faceNormal(a, b, c) {
    var ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    return [nx / l, ny / l, nz / l];
  }
  BP.quadN = function (a, b, c, d, uv) { this.quad(a, b, c, d, faceNormal(a, b, c), uv); };
  BP.tri = function (a, b, c) {
    var n = faceNormal(a, b, c), i0 = this.vert(a[0], a[1], a[2], n[0], n[1], n[2], 0, 0);
    this.vert(b[0], b[1], b[2], n[0], n[1], n[2], 1, 0);
    this.vert(c[0], c[1], c[2], n[0], n[1], n[2], 1, 1);
    this.idx(i0, i0 + 1, i0 + 2);
    this.tris++;
  };
  /* one vertex with its own tint / win (ground strips blend tokens and haze per row) */
  BP.vertWith = function (p, n, tint, win) {
    var t = this.tint, w = this.win;
    this.tint = tint; this.win = win;
    var i = this.vert(p[0], p[1], p[2], n[0], n[1], n[2], 0, 0);
    this.tint = t; this.win = w;
    return i;
  };
  /* a box centred on (cx, cz), base y0, height h; o: {yaw (about its own centre), taper (top scale),
     top: false, bottom: true, topState: [tint, win], v0 (window v origin), sides (state for sides)} */
  BP.box = function (cx, y0, cz, w, h, d, o) {
    o = o || {};
    var yaw = o.yaw || 0, cy = Math.cos(yaw), sy = Math.sin(yaw), tp = o.taper || 1;
    function P(x, y, z) { return [cx + x * cy + z * sy, y, cz - x * sy + z * cy]; }
    var hw = w / 2, hd = d / 2, tw = hw * tp, td = hd * tp, y1 = y0 + h, v0 = o.v0 != null ? o.v0 : y0;
    var b = [P(-hw, y0, hd), P(hw, y0, hd), P(hw, y0, -hd), P(-hw, y0, -hd)];
    var t = [P(-tw, y1, td), P(tw, y1, td), P(tw, y1, -td), P(-tw, y1, -td)];
    var vA = y0 - v0, vB = y1 - v0;
    if (o.sides !== false) {
      this.quadN(b[0], b[1], t[1], t[0], [0, vA, w, vB]);            /* front (+z) */
      this.quadN(b[1], b[2], t[2], t[1], [0, vA, d, vB]);            /* east */
      this.quadN(b[2], b[3], t[3], t[2], [0, vA, w, vB]);            /* back */
      this.quadN(b[3], b[0], t[0], t[3], [0, vA, d, vB]);            /* west */
    }
    if (o.top !== false) {
      var keep = [this.tint, this.win];
      if (o.topState) this.state(o.topState[0], o.topState[1]);
      this.quadN(t[0], t[1], t[2], t[3], [-tw, -td, tw, td]);
      this.state(keep[0], keep[1]);
    }
    if (o.bottom) this.quadN(b[3], b[2], b[1], b[0]);
  };
  /* a cylinder (seg sides, smooth normals) on (cx, cz) from y0 to y0 + h; uv u = arc length, v = y - v0;
     o: {top: true, v0, open, r1 (top radius), uvWrap (u as 0..1 around), ny: [bottom, top] normal y (domes)} */
  BP.prism = function (cx, y0, cz, r, h, seg, o) {
    o = o || {};
    var r1 = o.r1 != null ? o.r1 : r, y1 = y0 + h, v0 = o.v0 != null ? o.v0 : y0, circ = TAU * r, i;
    var ny0 = o.ny ? o.ny[0] : 0, ny1 = o.ny ? o.ny[1] : 0, k0 = Math.sqrt(1 - ny0 * ny0), k1 = Math.sqrt(1 - ny1 * ny1);
    for (i = 0; i < seg; i++) {
      var a0 = TAU * i / seg + (o.phase || 0), a1 = TAU * (i + 1) / seg + (o.phase || 0);
      var c0 = Math.sin(a0), s0 = Math.cos(a0), c1 = Math.sin(a1), s1 = Math.cos(a1);
      var u0 = o.uvWrap ? i / seg : circ * i / seg, u1 = o.uvWrap ? (i + 1) / seg : circ * (i + 1) / seg;
      var A = this.vert(cx + c0 * r, y0, cz + s0 * r, c0 * k0, ny0, s0 * k0, u0, y0 - v0);
      this.vert(cx + c1 * r, y0, cz + s1 * r, c1 * k0, ny0, s1 * k0, u1, y0 - v0);
      this.vert(cx + c1 * r1, y1, cz + s1 * r1, c1 * k1, ny1, s1 * k1, u1, y1 - v0);
      this.vert(cx + c0 * r1, y1, cz + s0 * r1, c0 * k1, ny1, s0 * k1, u0, y1 - v0);
      this.idx(A, A + 1, A + 2); this.idx(A, A + 2, A + 3);
      this.tris += 2;
    }
    if (o.top !== false && !o.open) {
      var keep = [this.tint, this.win];
      if (o.topState) this.state(o.topState[0], o.topState[1]);
      var ctr = this.vert(cx, y1, cz, 0, 1, 0, 0, 0);
      for (i = 0; i < seg; i++) {
        var b0 = TAU * i / seg + (o.phase || 0), b1 = TAU * (i + 1) / seg + (o.phase || 0);
        var p0 = this.vert(cx + Math.sin(b0) * r1, y1, cz + Math.cos(b0) * r1, 0, 1, 0, Math.sin(b0) * r1, Math.cos(b0) * r1);
        var p1 = this.vert(cx + Math.sin(b1) * r1, y1, cz + Math.cos(b1) * r1, 0, 1, 0, Math.sin(b1) * r1, Math.cos(b1) * r1);
        this.idx(ctr, p0, p1);
        this.tris++;
      }
      this.state(keep[0], keep[1]);
    }
  };
  /* a thin square-section beam between local points a and b (4 sides, width w) */
  BP.beam = function (a, b, w) {
    var dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    var fx = dx / l, fy = dy / l, fz = dz / l;
    var ux = Math.abs(fy) < 0.9 ? 0 : 1, uy = Math.abs(fy) < 0.9 ? 1 : 0, uz = 0;
    var px = fy * uz - fz * uy, py = fz * ux - fx * uz, pz = fx * uy - fy * ux, pl = Math.sqrt(px * px + py * py + pz * pz) || 1;
    px /= pl; py /= pl; pz /= pl;
    var qx = fy * pz - fz * py, qy = fz * px - fx * pz, qz = fx * py - fy * px, h = w / 2;
    var off = [[px + qx, py + qy, pz + qz], [-px + qx, -py + qy, -pz + qz], [-px - qx, -py - qy, -pz - qz], [px - qx, py - qy, pz - qz]];
    for (var i = 0; i < 4; i++) {
      var o0 = off[i], o1 = off[(i + 1) % 4];
      this.quadN([a[0] + o0[0] * h, a[1] + o0[1] * h, a[2] + o0[2] * h], [a[0] + o1[0] * h, a[1] + o1[1] * h, a[2] + o1[2] * h],
                 [b[0] + o1[0] * h, b[1] + o1[1] * h, b[2] + o1[2] * h], [b[0] + o0[0] * h, b[1] + o0[1] * h, b[2] + o0[2] * h], [0, 0, w, l]);
    }
  };
  /* a camera-facing pair of crossed quads (lamp heads, posts seen from any yaw) */
  BP.cross = function (x, y0, z, w, h) {
    this.quad([x - w / 2, y0, z], [x + w / 2, y0, z], [x + w / 2, y0 + h, z], [x - w / 2, y0 + h, z], [0, 0, 1], [0, 0, 1, 1]);
    this.quad([x, y0, z + w / 2], [x, y0, z - w / 2], [x, y0 + h, z - w / 2], [x, y0 + h, z + w / 2], [1, 0, 0], [0, 0, 1, 1]);
  };
  BP.arrays = function () {
    var nv = this.nv, ni = this.ni;
    return {
      position: this.P.slice(0, nv * 3), normal: this.N.slice(0, nv * 3), uv: this.U.slice(0, nv * 2),
      aTint: this.T.slice(0, nv * 3), aWin: this.W.slice(0, nv * 4), aAnim: this.A.slice(0, nv * 4),
      index: nv > 65535 ? this.I.slice(0, ni) : Uint16Array.from(this.I.subarray(0, ni)),
      kinds: this.K.slice(0, nv), vertices: nv, tris: this.tris
    };
  };

  /* ---------------- per-building state helpers ---------------- */
  function glassState(b) {
    var c = linear(b.tone), k = b.toneK;
    return [[c[0] * k, c[1] * k, c[2] * k], [b.seed, b.litBias, b.warmth, KIND.glass]];
  }
  function roofState(token) { var c = linear(token || 'Graphite'); return [[c[0], c[1], c[2]], [0, 0, 0, KIND.solid]]; }
  function glowState(token, dusk, member, seed) {
    var m = token === '@member' ? 2 : (member || 0);
    return [linear(token).slice(), [seed || 0, dusk == null ? 0.75 : dusk, m, KIND.glow]];
  }
  function ledState(prog, aspect, seed) { return [linear('Midnight Ink').slice(), [seed, LED_PROG[prog], aspect, KIND.led]]; }
  /* a flat emissive / LED panel on the local front plane z, x0..x1, y0..y1 (uv 0..1) */
  function panel(B, x0, x1, y0, y1, z) { B.quad([x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], [0, 0, 1], [0, 0, 1, 1]); }

  /* ---------------- archetypes (local frame: base y 0, front +z) ---------------- */
  function lobby(B, b, w, d) {
    B.state.apply(B, glowState('Window Warm', 0.8, 0, b.seed));
    panel(B, -w * 0.4, w * 0.4, 0.03, 0.2, d / 2 + 0.006);
  }
  function ledFront(B, b, x0, x1, y0, y1, z) {
    B.state.apply(B, ledState(b.led.prog, (x1 - x0) / Math.max(0.05, y1 - y0), b.seed));
    panel(B, x0, x1, y0, y1, z);
  }
  var ARCHETYPES = {
    slab: function (B, b, t) {
      B.state.apply(B, glassState(b));
      B.box(0, 0, 0, b.w, b.h, b.d, { topState: roofState('Graphite') });
      B.solid('Gunmetal');
      B.box(-b.w * 0.12, b.h, -b.d * 0.08, b.w * 0.42, 0.16, b.d * 0.4);
      if (b.led) ledFront(B, b, -b.w * 0.42, b.w * 0.42, b.h - 0.58, b.h - 0.14, b.d / 2 + 0.012);
      else { B.state.apply(B, glowState(b.accent, 0.55, 0, b.seed)); panel(B, -b.w / 2, b.w / 2, b.h - 0.05, b.h - 0.02, b.d / 2 + 0.006); }
      lobby(B, b, b.w, b.d);
    },
    stepped: function (B, b, t) {
      var tiers = [[1, 1, 0.5], [0.78, 0.8, 0.3], [0.56, 0.62, 0.2]], y = 0;
      for (var i = 0; i < 3; i++) {
        var w = b.w * tiers[i][0], d = b.d * tiers[i][1], h = b.h * tiers[i][2];
        B.state.apply(B, glassState(b));
        B.box(0, y, 0, w, h, d, { topState: roofState('Graphite'), v0: 0 });
        y += h;
        if (i < 2) { B.state.apply(B, glowState(b.accent, 0.5, 0, b.seed)); panel(B, -w / 2, w / 2, y - 0.035, y - 0.008, d / 2 + 0.006); }
      }
      if (b.led) ledFront(B, b, -b.w * 0.25, b.w * 0.25, b.h * 0.55, b.h * 0.76, b.d * 0.4 + 0.012);
      lobby(B, b, b.w, b.d);
    },
    ringed: function (B, b, t) {
      var r = b.w / 2, seg = RADIAL[t], rings = b.h > 3.2 ? [0.3, 0.55, 0.8] : [0.4, 0.75];
      B.state.apply(B, glassState(b));
      B.prism(0, 0, 0, r, b.h, seg, { topState: roofState('Graphite'), v0: 0 });
      B.state.apply(B, glowState(b.accent, 0.5, 0, b.seed));
      rings.forEach(function (f) { B.prism(0, b.h * f, 0, r + 0.025, 0.04, seg, { open: true }); });
      if (b.led) {
        B.state.apply(B, ledState(b.led.prog, TAU * r / 0.32, b.seed));
        B.prism(0, b.h - 0.42, 0, r + 0.012, 0.32, seg, { open: true, uvWrap: true, v0: b.h - 0.42 });
        B.scaleV(seg * 4, 1 / 0.32);       /* the LED band's v runs 0 → 0.32: rescale to 0..1 */
      }
      B.solid('Gunmetal');
      B.prism(0, b.h, 0, r * 0.55, 0.14, Math.max(6, seg - 2), {});
      lobby(B, b, b.w * 0.8, b.w * 0.95);
    },
    needle: function (B, b, t) {
      B.state.apply(B, glassState(b));
      B.box(0, 0, 0, b.w, b.h, b.w, { taper: 0.78, topState: roofState('Graphite') });
      B.solid('Gunmetal');
      B.box(0, b.h, 0, b.w * 0.5, 0.26, b.w * 0.5);
      B.solid('Gunmetal Spec');
      if (!b.mast) B.beam([0, b.h + 0.26, 0], [0, b.h + 0.72, 0], 0.035);   /* the spire (the mast replaces it) */
      /* (the tapered face leans back: panels stand just proud of its lowest point) */
      if (b.led) ledFront(B, b, -b.w * 0.2, b.w * 0.2, b.h * 0.56, b.h * 0.86, b.w / 2 * lerp(1, 0.78, 0.56) + 0.012);
      else { B.state.apply(B, glowState(b.accent, 0.5, 0, b.seed)); panel(B, -0.012, 0.012, b.h * 0.5, b.h - 0.08, b.w / 2 * lerp(1, 0.78, 0.5) + 0.01); }
      lobby(B, b, b.w, b.w);
    },
    twin: function (B, b, t) {
      var tw = b.w * 0.4, gap = b.w * 0.2, x = (tw + gap) / 2, tall = b.seed < 0.5 ? -1 : 1;
      B.state.apply(B, glassState(b));
      B.box(-x, 0, 0, tw, tall < 0 ? b.h : b.h * 0.84, b.d, { topState: roofState('Graphite'), v0: 0 });
      B.state.apply(B, glassState(b));
      B.box(x, 0, 0, tw, tall > 0 ? b.h : b.h * 0.84, b.d, { topState: roofState('Graphite'), v0: 0 });
      var yb = b.h * 0.6;
      B.solid('Gunmetal Deep');
      B.box(0, yb, 0, gap + 0.04, 0.24, b.d * 0.5, { topState: roofState('Gunmetal') });
      if (b.led) ledFront(B, b, -gap / 2 - 0.02, gap / 2 + 0.02, yb + 0.03, yb + 0.21, b.d * 0.25 + 0.012);
      else { B.state.apply(B, glowState(b.accent, 0.55, 0, b.seed)); panel(B, -gap / 2, gap / 2, yb + 0.09, yb + 0.13, b.d * 0.25 + 0.012); }
      lobby(B, b, tw, b.d);
      B.state.apply(B, glowState('Window Warm', 0.8, 0, b.seed));
      panel(B, x - tw * 0.4, x + tw * 0.4, 0.03, 0.2, b.d / 2 + 0.006);
      panel(B, -x - tw * 0.4, -x + tw * 0.4, 0.03, 0.2, b.d / 2 + 0.006);
    },
    twist: function (B, b, t) {
      var ph = PLATE[t], m = Math.max(5, Math.round(b.h / ph)), hh = b.h / m;
      B.solid('Graphite');
      B.box(0, 0, 0, b.w * 0.78, b.h, b.d * 0.78, { top: false });
      for (var i = 0; i < m; i++) {
        B.state.apply(B, glassState(b));
        B.box(0, i * hh + 0.02, 0, b.w, hh - 0.04, b.d, { yaw: i * TWIST_DEG * DEG, v0: 0, topState: roofState(i === m - 1 ? 'Graphite' : 'Gunmetal Deep') });
      }
      B.state.apply(B, glowState(b.accent, 0.55, 0, b.seed));
      var yaw = (m - 1) * TWIST_DEG * DEG, cy = Math.cos(yaw), sy = Math.sin(yaw), y1 = b.h - 0.03, zf = b.d / 2 + 0.006;
      B.quadN([-b.w / 2 * cy + zf * sy, y1 - 0.03, b.w / 2 * sy + zf * cy], [b.w / 2 * cy + zf * sy, y1 - 0.03, -b.w / 2 * sy + zf * cy],
              [b.w / 2 * cy + zf * sy, y1, -b.w / 2 * sy + zf * cy], [-b.w / 2 * cy + zf * sy, y1, b.w / 2 * sy + zf * cy]);
      lobby(B, b, b.w, b.d);
    },
    arena: function (B, b, t) {
      var r = ARENA.r, seg = RADIAL[t] + 4, rings = t === 'LOW' ? 3 : 4, j;
      B.solid('Night Glass Smoke');
      B.prism(0, 0, 0, r, ARENA.drum, seg, { top: false });
      B.state.apply(B, ledState('sweep', TAU * r / 0.26, b.seed));
      B.prism(0, 0.12, 0, r + 0.012, 0.26, seg, { open: true, uvWrap: true, v0: 0.12 });
      B.scaleV(seg * 4, 1 / 0.26);
      /* the dome: a squashed hemisphere in rings */
      B.solid('Concrete Light');
      for (j = 0; j < rings; j++) {
        var a0 = (Math.PI / 2) * j / rings, a1 = (Math.PI / 2) * (j + 1) / rings;
        var r0 = r * Math.cos(a0), r1 = r * Math.cos(a1), y0 = ARENA.drum + ARENA.dome * Math.sin(a0), y1 = ARENA.drum + ARENA.dome * Math.sin(a1);
        var nys = [Math.sin(a0), Math.min(0.97, Math.sin(a1))];
        if (j === rings - 1) B.prism(0, y0, 0, r0, y1 - y0, seg, { r1: Math.max(0.05, r1), ny: nys, topState: roofState('Concrete Light') });
        else B.prism(0, y0, 0, r0, y1 - y0, seg, { r1: r1, open: true, ny: nys });
      }
      B.state.apply(B, glowState(b.accent, 0.55, 0, b.seed));
      B.prism(0, ARENA.drum - 0.01, 0, r + 0.02, 0.04, seg, { open: true });
    },
    podium: function (B, b, t) {
      var P = PODIUM, bd = P.board;
      B.state.apply(B, glassState(b));
      B.box(0, 0, 0, P.w, P.h, P.d, { topState: roofState('Graphite') });
      B.solid('Gunmetal Deep');
      B.box(0, bd.y - 0.05, P.d / 2 + 0.02, bd.w + 0.1, bd.h + 0.1, 0.04, { top: true });
      B.state(linear('Midnight Ink').slice(), [b.seed, 0, bd.w / bd.h, KIND.hero]);
      panel(B, -bd.w / 2, bd.w / 2, bd.y, bd.y + bd.h, P.d / 2 + 0.045);
      B.state.apply(B, glowState(b.accent, 0.6, 1, b.seed));
      panel(B, -P.w / 2, P.w / 2, P.h - 0.05, P.h - 0.02, P.d / 2 + 0.006);
      lobby(B, b, P.w * 0.7, P.d);
    }
  };

  /* ---------------- the quay, promenade, lamps, kiosks, terminal ---------------- */
  function buildQuay(B, lay, t) {
    var step = QUAY.step[t], edge = quayCurve(0, step), n = edge.length, i;
    var offs = [0, QUAY.cap, QUAY.promenade, QUAY.far];
    var toks = ['Concrete', 'Quay Stone', 'Night Asphalt', 'Night Asphalt'];
    var hazes = [0, 0, 0, 1];
    B.frame(0, 0, 0, 0).setAnim(null);
    /* promenade + city ground: a strip from the edge to the far haze line (each row its own token
       and haze, so the far edge melts into the fog colour) */
    var UP = [0, 1, 0];
    for (var r = 0; r < offs.length - 1; r++) {
      var c0 = linear(toks[r]), c1 = linear(toks[r + 1]), w0r = [0, hazes[r], 0, KIND.solid], w1r = [0, hazes[r + 1], 0, KIND.solid];
      for (i = 0; i < n - 1; i++) {
        var a = edge[i], b = edge[i + 1];
        var v0 = B.vertWith([a.x + a.nx * offs[r], GROUND, a.z + a.nz * offs[r]], UP, c0, w0r);
        B.vertWith([b.x + b.nx * offs[r], GROUND, b.z + b.nz * offs[r]], UP, c0, w0r);
        B.vertWith([b.x + b.nx * offs[r + 1], GROUND, b.z + b.nz * offs[r + 1]], UP, c1, w1r);
        B.vertWith([a.x + a.nx * offs[r + 1], GROUND, a.z + a.nz * offs[r + 1]], UP, c1, w1r);
        B.idx(v0, v0 + 1, v0 + 2); B.idx(v0, v0 + 2, v0 + 3);     /* (a, b) runs west → east and offsets grow away from the island: +y */
        B.tris += 2;
      }
    }
    /* the sea wall, its LED lip and the rail, facing the island (e0 is on the viewer's left) */
    for (i = 0; i < n - 1; i++) {
      var e0 = edge[i], e1 = edge[i + 1], fn = [-(e0.nx + e1.nx) / 2, 0, -(e0.nz + e1.nz) / 2];
      B.solid('Quay Stone');
      B.quad([e0.x, QUAY.wallFoot, e0.z], [e1.x, QUAY.wallFoot, e1.z], [e1.x, GROUND, e1.z], [e0.x, GROUND, e0.z], fn, [0, 0, step, GROUND - QUAY.wallFoot]);
      B.state.apply(B, glowState('LED Cyan', 0.75, 0, 0));
      var lo = 0.005, ly0 = GROUND - QUAY.lip[1], ly1 = GROUND - QUAY.lip[0];
      B.quad([e0.x - e0.nx * lo, ly0, e0.z - e0.nz * lo], [e1.x - e1.nx * lo, ly0, e1.z - e1.nz * lo],
             [e1.x - e1.nx * lo, ly1, e1.z - e1.nz * lo], [e0.x - e0.nx * lo, ly1, e0.z - e0.nz * lo], fn);
      B.solid('Gunmetal');
      var ro = 0.06, ry0 = GROUND + QUAY.rail[0], ry1 = GROUND + QUAY.rail[1];
      B.quad([e0.x + e0.nx * ro, ry0, e0.z + e0.nz * ro], [e1.x + e1.nx * ro, ry0, e1.z + e1.nz * ro],
             [e1.x + e1.nx * ro, ry1, e1.z + e1.nz * ro], [e0.x + e0.nx * ro, ry1, e0.z + e0.nz * ro], fn);
    }
    /* the two flank ends: a wall face looking toward the open sea (+z), with the lip turning the corner */
    [edge[0], edge[n - 1]].forEach(function (e, k) {
      var sx = k ? 1 : -1, far = QUAY.far;
      var a = [e.x, QUAY.wallFoot, e.z], b = [e.x + e.nx * far, QUAY.wallFoot, e.z + e.nz * far];
      var at = [e.x, GROUND, e.z], bt = [e.x + e.nx * far, GROUND, e.z + e.nz * far];
      B.solid('Quay Stone');
      if (sx > 0) B.quadN(a, b, bt, at); else B.quadN(b, a, at, bt);
      B.state.apply(B, glowState('LED Cyan', 0.75, 0, 0));
      var la = [e.x, GROUND - QUAY.lip[1], e.z + 0.005], lb = [e.x + e.nx * 2.5, GROUND - QUAY.lip[1], e.z + e.nz * 2.5 + 0.005];
      var lat = [la[0], GROUND - QUAY.lip[0], la[2]], lbt = [lb[0], GROUND - QUAY.lip[0], lb[2]];
      if (sx > 0) B.quadN(la, lb, lbt, lat); else B.quadN(lb, la, lat, lbt);
      B.state.apply(B, glowState('Sunset Amber', 0.85, 0, 0));
      B.cross(e.x + e.nx * 0.3, GROUND, e.z + e.nz * 0.3 + 0.2, 0.09, 0.09);
    });
    /* lamp dots: a thin post and a warm head */
    lay.lamps.forEach(function (lp) {
      B.frame(lp.x, GROUND, lp.z, lp.yaw);
      B.solid('Gunmetal');
      B.cross(0, 0, 0, 0.022, 0.3);
      B.state.apply(B, glowState('Window Warm', 0.9, 0, 0));
      B.cross(0, 0.3, 0, 0.07, 0.06);
    });
    B.frame(0, 0, 0, 0);
  }
  function buildKiosk(B, k) {
    B.frame(k.x, GROUND, k.z, k.yaw);
    if (k.type === 'kiosk') {
      B.solid('Concrete Light');
      B.box(0, 0, 0, 0.7, 0.42, 0.45, { topState: roofState('Gunmetal') });
      for (var i = 0; i < 5; i++) {                      /* a striped awning tilting toward the promenade */
        B.solid(i % 2 ? 'Bone White' : 'Coral');
        var x0 = -0.38 + i * 0.152, x1 = x0 + 0.152;
        B.quadN([x0, 0.46, 0.46], [x1, 0.46, 0.46], [x1, 0.6, 0.18], [x0, 0.6, 0.18]);
      }
      B.state.apply(B, glowState('Window Warm', 0.85, 0, k.seed));
      panel(B, -0.24, 0.24, 0.16, 0.36, 0.231);
      B.state.apply(B, glowState(k.accent, 0.6, 0, k.seed));
      panel(B, -0.35, 0.35, 0.62, 0.64, 0.17);
    } else if (k.type === 'hall') {
      var g = glassState({ tone: 'Night Glass Teal', toneK: 1.05, seed: k.seed, litBias: 0.15, warmth: 0.9 });
      B.state(g[0], g[1]);
      B.box(0, 0, 0, 1.4, 0.36, 0.7, { top: false });
      var arc = [];
      for (var j = 0; j <= 6; j++) { var aj = Math.PI * j / 6; arc.push([Math.cos(aj) * 0.35, 0.36 + Math.sin(aj) * 0.35]); }   /* [z, y] */
      for (j = 0; j < 6; j++) {                          /* the barrel vault, its axis along local x */
        B.solid('Teak Light');
        B.quadN([0.72, arc[j][1], arc[j][0]], [0.72, arc[j + 1][1], arc[j + 1][0]], [-0.72, arc[j + 1][1], arc[j + 1][0]], [-0.72, arc[j][1], arc[j][0]]);
        B.solid('Gunmetal Deep');                        /* half-disc gable ends */
        B.tri([-0.72, 0.36, 0], [-0.72, arc[j][1], arc[j][0]], [-0.72, arc[j + 1][1], arc[j + 1][0]]);
        B.tri([0.72, 0.36, 0], [0.72, arc[j + 1][1], arc[j + 1][0]], [0.72, arc[j][1], arc[j][0]]);
      }
      B.state.apply(B, glowState(k.accent, 0.6, 0, k.seed));
      panel(B, -0.7, 0.7, 0.34, 0.37, 0.356);
    } else {
      var gp = glassState({ tone: 'Night Glass Indigo', toneK: 1.1, seed: k.seed, litBias: 0.2, warmth: 0.75 });
      B.state(gp[0], gp[1]);
      B.box(0, 0, 0, 0.9, k.h - 0.06, 0.6, { top: false });
      B.solid('Bone White');
      B.box(0, k.h - 0.06, 0, 1.12, 0.05, 0.78, {});
      B.state.apply(B, glowState(k.accent, 0.6, 1, k.seed));
      panel(B, -0.56, 0.56, k.h - 0.06, k.h - 0.035, 0.392);
    }
    B.frame(0, 0, 0, 0);
  }
  function buildTerminal(B, lay) {
    var T = lay.terminal;
    B.frame(T.x, GROUND, T.z, T.yaw);
    /* local +z faces the island; the quay edge is z = 0, the city side is -z */
    var g = glassState({ tone: 'Night Glass Teal', toneK: 1.1, seed: 0.37, litBias: 0.25, warmth: 0.85 });
    B.state(g[0], g[1]);
    B.box(0, 0, -0.8, TERMINAL.w, 0.46, 0.7, { topState: roofState('Gunmetal') });
    B.solid('Bone White');
    B.box(0, 0.6, -0.5, 2.3, 0.06, 1.5, {});                      /* the cantilever roof, reaching 0.25 over the water */
    B.solid('Gunmetal');
    B.beam([-0.9, 0, -0.1], [-0.9, 0.6, -0.1], 0.04);
    B.beam([0.9, 0, -0.1], [0.9, 0.6, -0.1], 0.04);
    B.state.apply(B, glowState('@member', 0.6, 0, 0.5));
    panel(B, -1.15, 1.15, 0.6, 0.66, 0.253);
    /* the floating dock and its gangway (the water-taxi berth) */
    B.solid('Teak');
    B.box(0, SEA - GROUND - 0.02, TERMINAL.berth.dz - 0.24, 1.5, 0.1, 0.3, {});
    B.solid('Gunmetal');
    B.quadN([-0.12, SEA - GROUND + 0.08, TERMINAL.berth.dz - 0.38], [0.12, SEA - GROUND + 0.08, TERMINAL.berth.dz - 0.38], [0.12, 0, 0.02], [-0.12, 0, 0.02]);
    B.state.apply(B, glowState('Sunset Amber', 0.85, 0, 0.2));
    B.cross(-0.68, SEA - GROUND + 0.08, TERMINAL.berth.dz - 0.24, 0.06, 0.06);
    B.cross(0.68, SEA - GROUND + 0.08, TERMINAL.berth.dz - 0.24, 0.06, 0.06);
    B.frame(0, 0, 0, 0);
  }
  /* ---------------- L0 media barges ---------------- */
  function buildBarges(B, lay) {
    lay.barges.forEach(function (bg) {
      B.frame(bg.x, SEA, bg.z, bg.yaw).setAnim([bg.x, SEA, bg.z, MODE.barge]);
      var hw = BARGE.hullW, hd = BARGE.hullD;
      B.solid('Graphite');
      B.box(0, BARGE.hullFoot, 0, hw, BARGE.hullTop - BARGE.hullFoot, hd, { topState: roofState('Night Asphalt') });
      B.state.apply(B, glowState('LED Cyan', 0.8, 0, 0));
      var y0 = 0.02, y1 = 0.045, o = 0.006;
      B.quadN([-hw / 2, y0, hd / 2 + o], [hw / 2, y0, hd / 2 + o], [hw / 2, y1, hd / 2 + o], [-hw / 2, y1, hd / 2 + o]);
      B.quadN([hw / 2, y0, -hd / 2 - o], [-hw / 2, y0, -hd / 2 - o], [-hw / 2, y1, -hd / 2 - o], [hw / 2, y1, -hd / 2 - o]);
      B.quadN([hw / 2 + o, y0, hd / 2], [hw / 2 + o, y0, -hd / 2], [hw / 2 + o, y1, -hd / 2], [hw / 2 + o, y1, hd / 2]);
      B.quadN([-hw / 2 - o, y0, -hd / 2], [-hw / 2 - o, y0, hd / 2], [-hw / 2 - o, y1, hd / 2], [-hw / 2 - o, y1, -hd / 2]);
      var sy0 = BARGE.screenY - SEA, sy1 = sy0 + BARGE.screenH, sw = BARGE.screenW;
      B.solid('Gunmetal');
      B.beam([-0.55, BARGE.hullTop, -0.06], [-0.55, sy0, -0.06], 0.05);
      B.beam([0.55, BARGE.hullTop, -0.06], [0.55, sy0, -0.06], 0.05);
      B.solid('Gunmetal Deep');
      B.box(0, sy0 - 0.05, -0.06, sw + 0.1, BARGE.screenH + 0.1, 0.06, {});
      B.state.apply(B, ledState(bg.prog, sw / BARGE.screenH, bg.i * 0.31 + 0.1));
      panel(B, -sw / 2, sw / 2, sy0, sy1, -0.026);
      B.state.apply(B, glowState(ACCENTS[(bg.i + 2) % ACCENTS.length], 0.6, 0, 0));
      panel(B, -sw / 2, sw / 2, sy1 + 0.015, sy1 + 0.04, -0.026);
      B.setAnim(null);
    });
    B.frame(0, 0, 0, 0);
  }
  /* ---------------- the Halo Wheel ---------------- */
  function buildWheel(B, lay, t) {
    var W = lay.wheel, ax = W.axis, hub = [W.x, W.y, W.z];
    var tx = -ax[2], tz = ax[0];                         /* in the ring plane, horizontal */
    var seg = WHEEL.seg[t], R = W.r, i;
    B.frame(0, 0, 0, 0).setAnim(null);
    /* the pier platform from the quay out under the wheel (local +z faces the island) */
    var depth = Math.abs(W.quayZ - W.z) + 0.75, pw = 1.9;
    B.frame(W.x, GROUND, W.z, Math.atan2(ax[0], ax[2]));
    B.solid('Quay Stone');
    B.box(0, QUAY.wallFoot - GROUND, -0.15, pw, GROUND - QUAY.wallFoot, depth, { topState: roofState('Concrete') });
    B.state.apply(B, glowState('LED Cyan', 0.75, 0, 0));
    panel(B, -pw / 2, pw / 2, -QUAY.lip[1], -QUAY.lip[0], depth / 2 - 0.15 + 0.005);
    B.frame(0, 0, 0, 0);
    /* two A-frames either side of the ring and the axle */
    B.solid('Gunmetal Spec');
    [-1, 1].forEach(function (side) {
      var ox = ax[0] * WHEEL.axleHalf * side, oz = ax[2] * WHEEL.axleHalf * side;
      B.beam([W.x + ox + tx * 0.85, GROUND, W.z + oz + tz * 0.85], [W.x + ox * 0.6, W.y, W.z + oz * 0.6], 0.06);
      B.beam([W.x + ox - tx * 0.85, GROUND, W.z + oz - tz * 0.85], [W.x + ox * 0.6, W.y, W.z + oz * 0.6], 0.06);
    });
    B.solid('Gunmetal');
    B.beam([W.x - ax[0] * WHEEL.axleHalf, W.y, W.z - ax[2] * WHEEL.axleHalf], [W.x + ax[0] * WHEEL.axleHalf, W.y, W.z + ax[2] * WHEEL.axleHalf], 0.09);
    /* the spinning parts: ring, spokes and dot lights, pivoting on the hub */
    B.setAnim([hub[0], hub[1], hub[2], MODE.wheel]);
    function P(a, rad, w) {   /* a point at angle a, radius rad, w along the axis */
      var c = Math.cos(a), s = Math.sin(a);
      return [hub[0] + tx * c * rad + ax[0] * w, hub[1] + s * rad, hub[2] + tz * c * rad + ax[2] * w];
    }
    var rw = 0.05, rt = 0.06;
    B.solid('Bone White');
    /* (the ring plane's t × up = -axis, so each face is wound to put its normal outward) */
    for (i = 0; i < seg; i++) {
      var a0 = TAU * i / seg, a1 = TAU * (i + 1) / seg, Ro = R + rt / 2, Ri = R - rt / 2;
      B.quadN(P(a1, Ro, -rw), P(a0, Ro, -rw), P(a0, Ro, rw), P(a1, Ro, rw));      /* outer rim */
      B.quadN(P(a0, Ri, -rw), P(a1, Ri, -rw), P(a1, Ri, rw), P(a0, Ri, rw));      /* inner rim */
      B.quadN(P(a1, Ri, rw), P(a1, Ro, rw), P(a0, Ro, rw), P(a0, Ri, rw));        /* island face (+axis) */
      B.quadN(P(a0, Ri, -rw), P(a0, Ro, -rw), P(a1, Ro, -rw), P(a1, Ri, -rw));    /* city face (-axis) */
    }
    B.solid('Gunmetal Spec');
    var ns = WHEEL.spokes[t];
    for (i = 0; i < ns; i++) { var as = TAU * (i + 0.5) / ns; B.beam(P(as, 0.08, 0), P(as, R - rt / 2, 0), 0.025); }
    var nd = WHEEL.dots[t];
    for (i = 0; i < nd; i++) {
      var ad = TAU * i / nd, acc = ACCENTS[i % ACCENTS.length], ds = 0.045;
      B.state(linear(acc).slice(), [i / nd, 0.45, acc === '@member' ? 2 : 0, KIND.dot]);
      [1, -1].forEach(function (f) {
        var w = (rw + 0.006) * f, c = P(ad, R, w), up = [-Math.sin(ad), Math.cos(ad)];
        var e1 = [tx * up[0] * ds, up[1] * ds, tz * up[0] * ds], e2 = [tx * Math.cos(ad) * ds, Math.sin(ad) * ds, tz * Math.cos(ad) * ds];
        var q = [[c[0] - e1[0] - e2[0], c[1] - e1[1] - e2[1], c[2] - e1[2] - e2[2]], [c[0] + e1[0] - e2[0], c[1] + e1[1] - e2[1], c[2] + e1[2] - e2[2]],
                 [c[0] + e1[0] + e2[0], c[1] + e1[1] + e2[1], c[2] + e1[2] + e2[2]], [c[0] - e1[0] + e2[0], c[1] - e1[1] + e2[1], c[2] - e1[2] + e2[2]]];
        var n = [ax[0] * f, 0, ax[2] * f];
        if (f > 0) B.quad(q[0], q[1], q[2], q[3], n); else B.quad(q[3], q[2], q[1], q[0], n);
      });
    }
    B.solid('Gunmetal');
    B.beam(P(0, 0, -0.1), P(0, 0, 0.1), 0.16);
    B.setAnim(null);
  }
  /* ---------------- the Lantern Bridge ---------------- */
  function buildBridge(B, lay, t) {
    var br = lay.bridge, seg = BRIDGE.seg[t], hw = BRIDGE.width / 2, th = BRIDGE.deck, i;
    B.frame(0, 0, 0, 0).setAnim(null);
    /* the island landing block (on the abutment, outside every cell) */
    B.solid('Concrete');
    B.box(br.x, SEA - 0.2, br.z0 - 0.17, 0.62, BRIDGE.y0 - SEA + 0.2 - th, 0.3, { topState: roofState('Concrete') });
    for (i = 0; i < seg; i++) {
      var za = br.z0 - br.length * i / seg, zb = br.z0 - br.length * (i + 1) / seg, ya = deckY(za), yb = deckY(zb);
      B.solid('Teak Light');
      B.quadN([br.x - hw, ya, za], [br.x + hw, ya, za], [br.x + hw, yb, zb], [br.x - hw, yb, zb]);
      B.solid('Gunmetal Deep');
      B.quadN([br.x - hw, yb - th, zb], [br.x + hw, yb - th, zb], [br.x + hw, ya - th, za], [br.x - hw, ya - th, za]);
      B.solid('Gunmetal');
      B.quadN([br.x + hw, ya - th, za], [br.x + hw, yb - th, zb], [br.x + hw, yb, zb], [br.x + hw, ya, za]);
      B.quadN([br.x - hw, yb - th, zb], [br.x - hw, ya - th, za], [br.x - hw, ya, za], [br.x - hw, yb, zb]);
      /* LED edges: Holo Blue at golden hour, the member colour at Showtime */
      B.state.apply(B, glowState('Holo Blue', 0.6, 1, i / seg));
      var o = 0.004;
      B.quadN([br.x + hw + o, ya - 0.025, za], [br.x + hw + o, yb - 0.025, zb], [br.x + hw + o, yb - 0.005, zb], [br.x + hw + o, ya - 0.005, za]);
      B.quadN([br.x - hw - o, yb - 0.025, zb], [br.x - hw - o, ya - 0.025, za], [br.x - hw - o, ya - 0.005, za], [br.x - hw - o, yb - 0.005, zb]);
      /* hand rails */
      B.solid('Gunmetal Spec');
      B.quadN([br.x + hw - 0.01, ya + 0.12, za], [br.x + hw - 0.01, yb + 0.12, zb], [br.x + hw - 0.01, yb + 0.135, zb], [br.x + hw - 0.01, ya + 0.135, za]);
      B.quadN([br.x - hw + 0.01, yb + 0.12, zb], [br.x - hw + 0.01, ya + 0.12, za], [br.x - hw + 0.01, ya + 0.135, za], [br.x - hw + 0.01, yb + 0.135, zb]);
    }
    /* the pylon on its footing, leaning over the span toward the city */
    var pb = br.pylon.base, pt = br.pylon.top;
    B.solid('Concrete');
    B.box(pb[0], SEA - 0.2, pb[2], 0.26, 0.32, 0.26, { topState: roofState('Concrete') });
    B.solid('Bone White');
    B.beam([pb[0], pb[1], pb[2]], [lerp(pb[0], pt[0], 0.5), lerp(pb[1], pt[1], 0.5), lerp(pb[2], pt[2], 0.5)], 0.13);
    B.beam([lerp(pb[0], pt[0], 0.5), lerp(pb[1], pt[1], 0.5), lerp(pb[2], pt[2], 0.5)], [pt[0], pt[1], pt[2]], 0.095);
    B.state.apply(B, glowState('@member', 0.55, 0, 0.3));
    B.cross(pt[0], pt[1] - 0.02, pt[2], 0.06, 0.06);
    B.solid('Gunmetal Spec');
    br.cables.forEach(function (c) { B.beam(c.from, c.to, 0.024); });
  }
  /* ---------------- the Signal Mast ---------------- */
  function buildMast(B, lay) {
    if (!lay.mast) return;
    var m = lay.mast;
    B.frame(m.x, m.y, m.z, m.yaw).setAnim(null);
    B.solid('Gunmetal Spec');
    B.beam([0, 0, 0], [0, MAST.h, 0], 0.05);
    B.solid('Gunmetal');
    B.box(0, MAST.h * 0.45, 0, 0.14, 0.04, 0.14, {});
    B.state(linear('Neon Magenta').slice(), [0, 0, 0, KIND.beacon]);
    B.box(0, MAST.h, 0, 0.1, 0.1, 0.1, {});
    B.frame(0, 0, 0, 0);
  }
  /* every vertex of the city as typed arrays (+ tris / vertex counts) */
  function buildArrays(lay) {
    lay = lay || layout({});
    var B = new Builder(), t = lay.tier;
    buildQuay(B, lay, t);
    lay.kiosks.forEach(function (k) { buildKiosk(B, k); });
    buildTerminal(B, lay);
    lay.buildings.forEach(function (b) {
      B.frame(b.x, GROUND, b.z, b.yaw).setAnim(null);
      ARCHETYPES[b.arch](B, b, t);
    });
    buildMast(B, lay);
    buildBarges(B, lay);
    buildWheel(B, lay, t);
    buildBridge(B, lay, t);
    return B.arrays();
  }

  /* ---------------- fallback window strips (pure) ----------------
     the LOW toon fallback draws lit windows as 'state' quads: a few floor bands per façade
     facing the island, each switched by its own threshold (hash < lit fraction) */
  function windowStrips(lay) {
    var out = [];
    lay.buildings.forEach(function (b) {
      if (b.kind !== 'building') return;
      var R = rng(fnv(lay.seed + ':win:' + b.id)), floors = Math.max(2, Math.floor(b.h / 0.48));
      for (var f = 1; f < floors; f++) {
        if (R() > 0.55) continue;
        var y = f * 0.48 + 0.08, w = b.w * (0.35 + 0.45 * R());
        out.push({ building: b.id, x: b.x, z: b.z, yaw: b.yaw, y: GROUND + y, w: w, h: 0.07, front: (b.arch === 'ringed' ? b.w / 2 : b.d / 2) + 0.008,
                   ox: (R() - 0.5) * (b.w - w) * 0.8, at: R(), warm: R() < b.warmth });
      }
    });
    return out;
  }

  /* ================================================================
     create(K, SL3D, opts) → city   (browser; THREE comes from K)
     ================================================================ */
  function create(K, SL3D, opts) {
    if (!K || !K.THREE) throw new Error('SLCity3D.create needs the kit K');
    opts = opts || {};
    var T = K.THREE, L = look();
    var tier = parseTier(opts.tier) || K.tier || 'MID';
    var budget = (SL3D && SL3D.budget) || (root.SLTier && root.SLTier.budget ? root.SLTier.budget(tier, 1) : null) || {};
    var quality = function () { return (SL3D && SL3D.quality) || { reflections: true }; };
    var lay = layout({ tier: tier, count: budget.cityBuildings || COUNTS[tier], seed: opts.seed || SEED });
    var arr = buildArrays(lay);

    var state = {
      k: 0, time: 0, lit: LIT.dusk, wake: WAKE.end, wakeFrom: 0, reduced: !!opts.reduced, disposed: false,
      member: L && L.normHex ? L.normHex(opts.member) : null, name: null, fallbackDue: 0
    };
    var group = new T.Group();
    group.name = 'city';
    group.userData.pickable = false;
    function noPick() {}

    /* ---------------- presets: DUSK → SHOW colours (linear) ---------------- */
    function col(token, dflt) { var h = L && L.hex ? L.hex(token) : null; return new T.Color(h || dflt || '#FFFFFF'); }
    var PRE = {
      hemiSky: [col(L ? L.DUSK.hemiSky : '', '#9C8CFF'), col(L ? L.SHOW.hemiSky : '', '#5A4BD1')],
      hemiGround: [col(L ? L.DUSK.hemiGround : '', '#3A2550'), col(L ? L.SHOW.hemiGround : '', '#1A1030')],
      sun: [col(L ? L.DUSK.sunColor : '', '#FFB48A'), col(L ? L.SHOW.sunColor : '', '#A9B8FF')],
      fog: [col(L ? L.DUSK.fogColor : '', '#7E4E8E'), col(L ? L.SHOW.fogColor : '', '#1E1450')],
      hemiI: [L ? L.DUSK.hemiIntensity : 1.35, L ? L.SHOW.hemiIntensity : 0.75],
      sunI: [L ? L.DUSK.sunIntensity : 2.2, L ? L.SHOW.sunIntensity : 0.8]
    };
    var sunPos = (L && L.DUSK && L.DUSK.sunPos) || [-9, 7.5, 8];
    var memberCol = new T.Color(state.member || hexOf(L ? (L.MEMBER_FALLBACK || 'Bubblegum') : 'Bubblegum'));

    /* ---------------- the hero board (256 × 64 canvas, drawn once per name) ---------------- */
    var heroCanvas = null, heroCtx = null, heroTex;
    if (typeof document !== 'undefined' && document.createElement) {
      heroCanvas = document.createElement('canvas');
      heroCanvas.width = 256; heroCanvas.height = 64;
      heroCtx = heroCanvas.getContext('2d');
    }
    if (heroCtx) {
      heroTex = new T.CanvasTexture(heroCanvas);
      heroTex.colorSpace = T.NoColorSpace;
    } else {
      heroTex = new T.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, T.RGBAFormat);
    }
    heroTex.wrapS = T.RepeatWrapping; heroTex.wrapT = T.ClampToEdgeWrapping;
    heroTex.minFilter = T.LinearFilter; heroTex.magFilter = T.LinearFilter; heroTex.generateMipmaps = false;
    heroTex.needsUpdate = true;
    function spark(ctx, x, y, r) {            /* ✦: the four-point spark (never the five-point reward star) */
      ctx.beginPath(); ctx.moveTo(x, y - r);
      ctx.quadraticCurveTo(x + r * 0.14, y - r * 0.14, x + r, y); ctx.quadraticCurveTo(x + r * 0.14, y + r * 0.14, x, y + r);
      ctx.quadraticCurveTo(x - r * 0.14, y + r * 0.14, x - r, y); ctx.quadraticCurveTo(x - r * 0.14, y - r * 0.14, x, y - r);
      ctx.fill();
    }
    function drawHero(name) {
      if (!heroCtx) return;
      var words = heroWords(name), ctx = heroCtx, W = 256, H = 64;
      var stretch = (PODIUM.board.w / PODIUM.board.h) / (W / H), lw = W * stretch;   /* logical px across the board */
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, W, H);
      ctx.scale(1 / stretch, 1);
      ctx.fillStyle = '#FFFFFF'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      var gap = 34, px = 34, total;
      function font(p) { return '800 ' + p + 'px "Unbounded", "Outfit", system-ui, -apple-system, "Segoe UI", sans-serif'; }
      do {
        ctx.font = font(px);
        total = 0;
        words.forEach(function (w) { total += ctx.measureText(w).width; });
        total += gap * (words.length + 1);
        px -= 1;
      } while (px > 12 && total > lw - 8);
      var x = (lw - total) / 2 + gap / 2, y = H / 2 + 1, sr = px * 0.36;
      words.forEach(function (w, i) {
        ctx.fillText(w, x, y);
        x += ctx.measureText(w).width;
        if (w === 'ISLAND' || i === words.length - 1) spark(ctx, x + gap / 2, y - 1, sr);
        x += gap;
      });
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      heroTex.needsUpdate = true;
    }
    function setUser(u) {
      var nm = u && typeof u.name === 'string' ? u.name : '';
      if (nm === state.name) return;
      state.name = nm;
      drawHero(nm);
    }
    setUser({ name: opts.name || '' });
    if (heroCtx && K.tex && typeof K.tex.fontReady === 'function') {
      K.tex.fontReady('800 32px "Unbounded"', 60000).then(function (ok) { if (ok && !state.disposed) drawHero(state.name); }, function () {});
    }

    /* ---------------- uniforms + the 'city' material ---------------- */
    var led = K.ledAtlas ? K.ledAtlas() : null;
    var U = {
      uTime: { value: 0 }, uMotion: { value: state.reduced ? 0 : 1 }, uReduced: { value: state.reduced ? 1 : 0 },
      uK: { value: 0 }, uLit: { value: LIT.dusk }, uWakeT: { value: WAKE.end }, uWakeFrom: { value: 0 }, uWakeO: { value: new T.Vector2(-0.5, 0) },
      uWheelA: { value: 0 }, uWheelAxis: { value: new T.Vector3(lay.wheel.axis[0], 0, lay.wheel.axis[2]) },
      uHemiSky: { value: new T.Color() }, uHemiGround: { value: new T.Color() }, uHemiI: { value: 1 },
      uSunCol: { value: new T.Color() }, uSunI: { value: 1 }, uSunDir: { value: new T.Vector3(sunPos[0], sunPos[1], sunPos[2]).normalize() },
      uFogCol: { value: new T.Color() }, uHaze: { value: new T.Vector3(HAZE.near, HAZE.far, HAZE.floorDusk) },
      uWarm: { value: col('Window Warm', '#FFD08A') }, uCool: { value: col('Bone White', '#F4F2FA') }, uInk: { value: col('Midnight Ink', '#14101F') },
      uN0: { value: col('Neon Magenta', '#FF2E9A') }, uN1: { value: col('LED Cyan', '#22E4FF') }, uN2: { value: col('Electric Violet', '#8A5CFF') },
      uN3: { value: col('Laser Lime', '#C6FF3D') }, uMember: { value: memberCol },
      uLed: { value: led ? led.texture : null }, uHero: { value: heroTex }
    };
    var programsNow = typeof opts.programs === 'number' ? opts.programs : (function () {
      try { var inf = SL3D && SL3D.info ? SL3D.info() : null; return inf && inf.lease ? inf.lease.programs : 0; } catch (e) { return 0; }
    }());
    var useFallback = opts.fallback === true || (opts.fallback !== false && tier === 'LOW' && budget.programs > 0 && programsNow >= budget.programs);
    if (!U.uLed.value) useFallback = true;

    var owned = { geos: [], mats: [], meshes: [] };
    var main = null, fb = null;
    if (!useFallback) {
      var geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.BufferAttribute(arr.position, 3));
      geo.setAttribute('normal', new T.BufferAttribute(arr.normal, 3));
      geo.setAttribute('uv', new T.BufferAttribute(arr.uv, 2));
      geo.setAttribute('aTint', new T.BufferAttribute(arr.aTint, 3));
      geo.setAttribute('aWin', new T.BufferAttribute(arr.aWin, 4));
      geo.setAttribute('aAnim', new T.BufferAttribute(arr.aAnim, 4));
      geo.setIndex(new T.BufferAttribute(arr.index, 1));
      geo.computeBoundingSphere();
      geo.boundingSphere.radius += 0.5;                 /* the wheel spin and barge bob stay inside */
      var mat = new T.ShaderMaterial({
        name: 'city', uniforms: U, vertexShader: CITY_VERT, fragmentShader: CITY_FRAG, fog: false,
        defines: tier === 'LOW' ? { CITY_LOW: 1 } : {}
      });
      main = new T.Mesh(geo, mat);
      main.name = 'city:skyline'; main.castShadow = false; main.receiveShadow = false; main.raycast = noPick;
      main.matrixAutoUpdate = false; main.updateMatrix();
      group.add(main);
      owned.geos.push(geo); owned.mats.push(mat); owned.meshes.push(main);
    } else fb = buildFallback();

    /* ---------------- LOW fallback: shared toon + 'state' window strips ---------------- */
    function buildFallback() {
      var nv = arr.vertices, kinds = arr.kinds, i;
      var toonIdx = [], glowIdx = [], tcol = new Float32Array(nv * 3);
      for (i = 0; i < arr.index.length; i += 3) {
        var k = kinds[arr.index[i]];
        (k === KIND.solid || k === KIND.glass ? toonIdx : glowIdx).push(arr.index[i], arr.index[i + 1], arr.index[i + 2]);
      }
      for (i = 0; i < nv; i++) { tcol[i * 3] = arr.aTint[i * 3]; tcol[i * 3 + 1] = arr.aTint[i * 3 + 1]; tcol[i * 3 + 2] = arr.aTint[i * 3 + 2]; }
      function geoWith(idx, colour) {
        var g = new T.BufferGeometry();
        g.setAttribute('position', new T.BufferAttribute(arr.position, 3));
        g.setAttribute('normal', new T.BufferAttribute(arr.normal, 3));
        g.setAttribute('color', new T.BufferAttribute(colour, 3));
        g.setIndex(idx);
        g.computeBoundingSphere();
        owned.geos.push(g);
        return g;
      }
      function im(g, m, name) {
        var mesh = new T.InstancedMesh(g, m, 1);
        mesh.instanceColor = new T.InstancedBufferAttribute(new Float32Array([1, 1, 1]), 3);
        mesh.setMatrixAt(0, new T.Matrix4());
        mesh.name = name; mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = false; mesh.raycast = noPick;
        group.add(mesh); owned.meshes.push(mesh);
        return mesh;
      }
      var toon = im(geoWith(toonIdx, tcol), K.mat('toon'), 'city:toon');
      /* window strips as extra quads in the glow geometry */
      var strips = windowStrips(lay), P = Array.prototype.slice.call(arr.position), N = Array.prototype.slice.call(arr.normal), base = nv;
      var gidx = glowIdx.slice(), stripCol = [];
      strips.forEach(function (s) {
        var c = Math.cos(s.yaw), sn = Math.sin(s.yaw);
        [[s.ox - s.w / 2, s.y], [s.ox + s.w / 2, s.y], [s.ox + s.w / 2, s.y + s.h], [s.ox - s.w / 2, s.y + s.h]].forEach(function (q) {
          P.push(s.x + q[0] * c + s.front * sn, q[1], s.z - q[0] * sn + s.front * c);
          N.push(sn, 0, c);
        });
        gidx.push(base, base + 1, base + 2, base, base + 2, base + 3);
        stripCol.push(s);
        base += 4;
      });
      var gpos = new Float32Array(P), gnrm = new Float32Array(N), gc = new Float32Array(base * 3);
      var g = new T.BufferGeometry();
      g.setAttribute('position', new T.BufferAttribute(gpos, 3));
      g.setAttribute('normal', new T.BufferAttribute(gnrm, 3));
      g.setAttribute('color', new T.BufferAttribute(gc, 3));
      g.setIndex(gidx);
      g.computeBoundingSphere();
      owned.geos.push(g);
      var glow = im(g, K.mat('state'), 'city:lights');
      return { toon: toon, glow: glow, colors: gc, strips: stripCol, nv: nv, last: -1 };
    }
    var _c = new T.Color(), _c2 = new T.Color(), _hz = [0, 0, 0];
    var NEONS = [U.uN0.value, U.uN1.value, U.uN2.value, U.uN3.value, memberCol];
    /* the fallback's emissive colours at the current k (slow solid fades; ≤ 10 rewrites a second) */
    function paintFallback() {
      if (!fb) return;
      var a = fb.colors, nv = fb.nv, k = state.k, i, j;
      for (i = 0; i < nv; i++) {
        var kind = arr.kinds[i];
        if (kind === KIND.solid || kind === KIND.glass) continue;
        var w = i * 4, level, mm;
        _c.setRGB(arr.aTint[i * 3], arr.aTint[i * 3 + 1], arr.aTint[i * 3 + 2]);
        if (kind === KIND.led || kind === KIND.hero) {
          var ph = (arr.aWin[w] + (state.reduced ? 0 : state.time * 0.02)) * 5;
          var c0 = NEONS[Math.floor(ph) % 5], c1 = NEONS[(Math.floor(ph) + 1) % 5];
          _c.copy(c0).lerp(c1, ph - Math.floor(ph));
          level = lerp(0.7, 1, k) * 0.8;
        } else {
          mm = arr.aWin[w + 2] > 1.5 ? 1 : arr.aWin[w + 2] * k;
          _c.lerp(memberCol, mm);
          level = kind === KIND.beacon ? 0.85 : lerp(arr.aWin[w + 1], 1, k);
        }
        a[i * 3] = _c.r * level; a[i * 3 + 1] = _c.g * level; a[i * 3 + 2] = _c.b * level;
      }
      for (j = 0; j < fb.strips.length; j++) {
        var s = fb.strips[j], on = smooth(s.at - LIT.band / 2, s.at + LIT.band / 2, state.lit);
        _c2.copy(s.warm ? U.uWarm.value : U.uCool.value).multiplyScalar(on);
        for (var q = 0; q < 4; q++) { var o = (nv + j * 4 + q) * 3; a[o] = _c2.r; a[o + 1] = _c2.g; a[o + 2] = _c2.b; }
      }
      fb.glow.geometry.getAttribute('color').needsUpdate = true;
    }

    /* ---------------- light state ---------------- */
    function applyLights() {
      var k = state.k;
      U.uHemiSky.value.copy(PRE.hemiSky[0]).lerp(PRE.hemiSky[1], k);
      U.uHemiGround.value.copy(PRE.hemiGround[0]).lerp(PRE.hemiGround[1], k);
      U.uSunCol.value.copy(PRE.sun[0]).lerp(PRE.sun[1], k);
      U.uFogCol.value.copy(PRE.fog[0]).lerp(PRE.fog[1], k);
      U.uHemiI.value = lerp(PRE.hemiI[0], PRE.hemiI[1], k);
      U.uSunI.value = lerp(PRE.sunI[0], PRE.sunI[1], k);
      U.uHaze.value.z = lerp(HAZE.floorDusk, HAZE.floorShow, k);
      U.uK.value = k;
    }
    function litTarget(k) { return lerp(LIT.dusk, LIT.show, clamp01(k)); }
    function settle() {
      state.lit = litTarget(state.k);
      state.wake = WAKE.end;
      U.uLit.value = state.lit; U.uWakeT.value = state.wake;
      applyLights();
      if (fb) paintFallback();
    }

    /* ---------------- per frame ---------------- */
    function update(dt, k) {
      if (state.disposed) return false;
      dt = typeof dt === 'number' && dt > 0 ? Math.min(dt, 0.1) : 0;
      var kk = typeof k === 'number' && isFinite(k) ? clamp01(k) : state.k, busy = false;
      if (kk !== state.k) {
        /* the wake ripple: k rising through WAKE.k starts one (a ripple already running carries on) */
        if (state.k < WAKE.k && kk >= WAKE.k && !state.reduced && state.wake >= WAKE.end) {
          state.wake = 0; state.wakeFrom = state.k;
          U.uWakeFrom.value = state.wakeFrom; U.uWakeT.value = 0;
        }
        state.k = kk;
        applyLights();
        busy = true;
      }
      if (!state.reduced) {
        state.time += dt;
        U.uTime.value = state.time;
        U.uWheelA.value = (state.time * WHEEL.rps * TAU) % TAU;
      }
      /* windows: the lit fraction sweeps toward its target so each window fades over 1.2 s */
      var target = litTarget(state.k);
      if (state.lit !== target) {
        if (state.reduced) state.lit = target;
        else {
          var stp = (LIT.band / LIT.fadeSec) * dt;
          state.lit = state.lit < target ? Math.min(target, state.lit + stp) : Math.max(target, state.lit - stp);
        }
        U.uLit.value = state.lit;
        busy = true;
      }
      if (state.wake < WAKE.end) {
        state.wake = state.reduced ? WAKE.end : Math.min(WAKE.end, state.wake + dt);
        U.uWakeT.value = state.wake;
        busy = true;
      }
      if (fb && (busy || !state.reduced)) {
        state.fallbackDue -= dt;
        if (state.fallbackDue <= 0 || busy) { state.fallbackDue = 0.1; paintFallback(); }
      }
      return busy || !state.reduced;
    }

    /* ---------------- reflections ---------------- */
    var nRef = Math.max(0, Math.min(budget.reflections || 0, lay.reflectors.length));
    var refl = [], reflOut = [];
    for (var ri = 0; ri < nRef; ri++) {
      var src = lay.reflectors[ri];
      refl.push({ src: src, color: col(src.token === '@member' ? 'Bone White' : src.token, '#FFFFFF'),
                  delay: Math.max(Math.hypot(src.x + 0.5, src.z) - WAKE.from, 0) / WAKE.speed });
      reflOut.push({ x: src.x, z: src.z, w: src.w, intensity: 0, color: new T.Color() });
    }
    var EMPTY = [];
    /* a pillar follows its light: the same wake ripple and k mix as the shader's vShow */
    function reflections() {
      if (state.disposed || quality().reflections === false || !nRef) return EMPTY;
      for (var i = 0; i < nRef; i++) {
        var r = refl[i], o = reflOut[i], w = smooth(0, 1, (state.wake - r.delay) / WAKE.fade);
        var show = state.k >= state.wakeFrom ? lerp(state.wakeFrom, state.k, w) : state.k;
        o.intensity = r.src.base * lerp(0.35, 1, show);
        if (r.src.token === '@member') o.color.copy(memberCol); else o.color.copy(r.color);
      }
      return reflOut;
    }

    function setReduced(on) {
      state.reduced = !!on;
      U.uMotion.value = state.reduced ? 0 : 1;
      U.uReduced.value = state.reduced ? 1 : 0;
      if (state.reduced) settle();
    }
    function setMember(hex) {
      var h = L && L.normHex ? L.normHex(hex) : (typeof hex === 'string' ? hex : null);
      state.member = h;
      memberCol.set(h || hexOf(L ? (L.MEMBER_FALLBACK || 'Bubblegum') : 'Bubblegum'));
      if (fb) paintFallback();
    }

    var city = {
      VERSION: VERSION, group: group, tier: tier, layout: lay,
      update: update,
      setShow: function (k) { state.k = clamp01(+k || 0); settle(); },
      setMember: setMember, setUser: setUser, setReduced: setReduced,
      reflections: reflections,
      info: function () {
        return { calls: fb ? 2 : 1, tris: arr.tris + (fb ? fb.strips.length * 2 : 0), vertices: arr.vertices, buildings: lay.buildings.length,
                 fallback: !!fb, tier: tier, k: state.k, lit: state.lit };
      },
      dispose: function () {
        if (state.disposed) return;
        state.disposed = true;
        if (group.parent) group.parent.remove(group);
        owned.meshes.forEach(function (m) { if (m.isInstancedMesh) m.dispose(); });
        owned.geos.forEach(function (g) { g.dispose(); });
        owned.mats.forEach(function (m) { m.dispose(); });
        heroTex.dispose();
        group.clear();
      }
    };
    Object.defineProperty(city, 'show', { get: function () { return state.k; } });
    Object.defineProperty(city, 'reduced', { get: function () { return state.reduced; } });
    if (opts.member) setMember(opts.member);
    if (typeof opts.show === 'number' && isFinite(opts.show)) state.k = clamp01(opts.show);   /* a mount straight into Showtime: no ripple */
    settle();
    return city;
  }

  /* ================================================================
     SHADERS (GLSL ES 1.0 style; three r170 compiles them as WebGL2)
     ================================================================ */
  var CITY_VERT = [
    '#include <common>',
    'attribute vec3 aTint;',
    'attribute vec4 aWin;',
    'attribute vec4 aAnim;',
    'uniform float uTime;',
    'uniform float uMotion;',
    'uniform float uK;',
    'uniform float uWakeT;',
    'uniform float uWakeFrom;',
    'uniform vec2 uWakeO;',
    'uniform float uWheelA;',
    'uniform vec3 uWheelAxis;',
    'varying vec3 vW;',
    'varying vec3 vN;',
    'varying vec2 vUv;',
    'varying vec3 vTint;',
    'varying vec4 vWin;',
    'varying float vShow;',
    'varying float vDist;',
    'vec3 rotAxis(vec3 v, vec3 a, float ang) {',
    '  float c = cos(ang);',
    '  float s = sin(ang);',
    '  return v * c + cross(a, v) * s + a * dot(a, v) * (1.0 - c);',
    '}',
    'void main() {',
    '  vec3 p = position;',
    '  vec3 n = normal;',
    '  float mode = aAnim.w;',
    '  if (mode > 1.5 && mode < 2.5) {',                       /* the Halo Wheel: spin about its axis */
    '    p = aAnim.xyz + rotAxis(p - aAnim.xyz, uWheelAxis, uWheelA);',
    '    n = rotAxis(n, uWheelAxis, uWheelA);',
    '  } else if (mode > 4.5 && mode < 5.5) {',                /* a media barge: a 0.2 Hz bob with a gentle roll */
    '    float w = uTime * 1.2566371 + aAnim.x * 1.7 + aAnim.z * 0.9;',
    '    vec2 d = p.xz - aAnim.xz;',
    '    p.y += (' + BARGE.amp.toFixed(3) + ' * sin(w) + 0.014 * sin(w * 0.8 + 1.3) * d.x + 0.014 * cos(w * 0.7) * d.y) * uMotion;',
    '  }',
    '  vec4 wp = modelMatrix * vec4(p, 1.0);',
    '  vW = wp.xyz;',
    '  vN = normalize(mat3(modelMatrix) * n);',
    '  vUv = uv;',
    '  vTint = aTint;',
    '  vWin = aWin;',
    /* the wake ripple: the Showtime lights rise from the level they had (uWakeFrom) outward from the
       island, each fading in; below that level they simply follow k, so nothing ever pops */
    '  float dist = max(length(wp.xz - uWakeO) - ' + WAKE.from.toFixed(1) + ', 0.0);',
    '  float wake = smoothstep(0.0, 1.0, (uWakeT - dist / ' + WAKE.speed.toFixed(1) + ') / ' + WAKE.fade.toFixed(2) + ');',
    '  vShow = uK >= uWakeFrom ? mix(uWakeFrom, uK, wake) : uK;',
    '  vec4 mv = viewMatrix * wp;',
    '  vDist = length(mv.xyz);',
    '  gl_Position = projectionMatrix * mv;',
    '}'
  ].join('\n');

  var CITY_FRAG = [
    '#include <common>',
    'uniform float uTime;',
    'uniform float uReduced;',
    'uniform float uLit;',
    'uniform vec3 uHemiSky;',
    'uniform vec3 uHemiGround;',
    'uniform float uHemiI;',
    'uniform vec3 uSunCol;',
    'uniform float uSunI;',
    'uniform vec3 uSunDir;',
    'uniform vec3 uFogCol;',
    'uniform vec3 uHaze;',
    'uniform vec3 uWarm;',
    'uniform vec3 uCool;',
    'uniform vec3 uInk;',
    'uniform vec3 uN0;',
    'uniform vec3 uN1;',
    'uniform vec3 uN2;',
    'uniform vec3 uN3;',
    'uniform vec3 uMember;',
    'uniform sampler2D uLed;',
    'uniform sampler2D uHero;',
    'varying vec3 vW;',
    'varying vec3 vN;',
    'varying vec2 vUv;',
    'varying vec3 vTint;',
    'varying vec4 vWin;',
    'varying float vShow;',
    'varying float vDist;',
    'float hash12(vec2 p) {',
    '  vec3 p3 = fract(vec3(p.xyx) * 0.1031);',
    '  p3 += dot(p3, p3.yzx + 33.33);',
    '  return fract((p3.x + p3.y) * p3.z);',
    '}',
    /* the five LED hues: 4 palette neons + the member colour */
    'vec3 neon5(float i) {',
    '  float k = mod(floor(i + 0.5), 5.0);',
    '  if (k < 0.5) return uN0;',
    '  if (k < 1.5) return uN1;',
    '  if (k < 2.5) return uN2;',
    '  if (k < 3.5) return uN3;',
    '  return uMember;',
    '}',
    'vec3 palette5(float s) {',
    '  float x = fract(s) * 5.0;',
    '  float i = floor(x);',
    '  return mix(neon5(i), neon5(i + 1.0), smoothstep(0.0, 1.0, x - i));',
    '}',
    /* icon SDFs for the marquee: heart, five-point star, note, four-point spark */
    'float sdHeart(vec2 p) {',
    '  p.x = abs(p.x);',
    '  p.y += 0.55;',
    '  if (p.y + p.x > 1.0) return sqrt(dot(p - vec2(0.25, 0.75), p - vec2(0.25, 0.75))) - 0.3536;',
    '  vec2 a = p - vec2(0.0, 1.0);',
    '  vec2 b = p - 0.5 * max(p.x + p.y, 0.0);',
    '  return sqrt(min(dot(a, a), dot(b, b))) * sign(p.x - p.y);',
    '}',
    'float sdStar5(vec2 p, float r, float rf) {',
    '  const vec2 k1 = vec2(0.809016994, -0.587785252);',
    '  const vec2 k2 = vec2(-0.809016994, -0.587785252);',
    '  p.x = abs(p.x);',
    '  p -= 2.0 * max(dot(k1, p), 0.0) * k1;',
    '  p -= 2.0 * max(dot(k2, p), 0.0) * k2;',
    '  p.x = abs(p.x);',
    '  p.y -= r;',
    '  vec2 ba = rf * vec2(-k1.y, k1.x) - vec2(0.0, 1.0);',
    '  float h = clamp(dot(p, ba) / dot(ba, ba), 0.0, r);',
    '  return length(p - ba * h) * sign(p.y * ba.x - p.x * ba.y);',
    '}',
    'float sdNote(vec2 p) {',
    '  float head = length((p - vec2(-0.12, -0.28)) * vec2(1.0, 1.35)) - 0.2;',
    '  vec2 q = abs(p - vec2(0.06, 0.08)) - vec2(0.035, 0.38);',
    '  float stem = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);',
    '  vec2 f = p - vec2(0.2, 0.36);',
    '  float flag = length(max(abs(f) - vec2(0.14, 0.06), 0.0)) - 0.02;',
    '  return min(min(head, stem), flag);',
    '}',
    'float sdSpark(vec2 p) {',
    '  p = abs(p);',
    '  return pow(p.x, 0.5) + pow(p.y, 0.5) - 0.78;',
    '}',
    /* LED panels: atlas strips (kit layout: 512 x 256, 2 x 4 strips of 256 x 64, 128-px windows),
       the procedural icon marquee (8) and the diagonal gradient sweep (9) */
    'vec3 ledPanel(vec2 uv, vec2 duv, float prog, float aspect, float seed) {',
    '  float t = uTime;',
    '  if (uReduced > 0.5) { prog = 9.0; t = 0.0; }',
    '  if (prog < 7.5) {',
    '    vec2 cell = vec2(mod(prog, 2.0) * 256.0, floor(prog / 2.0) * 64.0);',
    '    float ph = fract(seed + t * ' + LED_SCROLL.toFixed(3) + ');',
    '    float xp = cell.x + 128.0 * (ph + uv.x);',
    '    float yp = cell.y + (1.0 - uv.y) * 64.0;',
    '    xp = clamp(xp, cell.x + 0.5, cell.x + 255.5);',
    '    yp = clamp(yp, cell.y + 0.5, cell.y + 63.5);',
    '    return texture2D(uLed, vec2(xp / 512.0, 1.0 - yp / 256.0)).rgb;',
    '  }',
    '  if (prog < 8.5) {',
    '    float n = max(1.0, floor(aspect + 0.5));',
    '    float x = uv.x * n + t * ' + MARQUEE_SPEED.toFixed(3) + ' + seed * 7.0;',
    '    float id = floor(x);',
    '    vec2 q = vec2(fract(x) - 0.5, uv.y - 0.5) * vec2(1.0, 1.0) * 2.6;',
    '    float icon = mod(id, 4.0);',
    '    float d = icon < 0.5 ? sdHeart(q * 1.15) : icon < 1.5 ? sdStar5(q, 0.62, 0.45) : icon < 2.5 ? sdNote(q) : sdSpark(q) * 0.5;',
    '    float aa = 2.6 * max(duv.x * n, duv.y) + 0.01;',
    '    float m = 1.0 - smoothstep(-aa, aa, d);',
    '    return mix(uInk * 1.5, neon5(id + seed * 5.0), m);',
    '  }',
    '  float cyc = max(1.0, floor(aspect * 0.16 + 0.5));',
    '  float s = uv.x * cyc + uv.y * 0.16 - t * 0.05 + seed;',
    '  return palette5(s) * (0.82 + 0.18 * smoothstep(0.0, 1.0, uv.y));',
    '}',
    /* glass façades: floors 0.16 u, bays 0.12 u; a window is lit when its hash < uLit + bias */
    'vec3 windows(vec2 uv, vec2 duv, float seed, float bias, float warmth, out float pane) {',
    '  vec2 g = uv / vec2(0.12, 0.16);',
    '  vec2 dg = duv / vec2(0.12, 0.16);',
    '  vec2 id = floor(g);',
    '  vec2 f = fract(g);',
    '  vec2 aa = clamp(dg, vec2(0.001), vec2(0.5));',
    '  float mx = smoothstep(0.16 - aa.x, 0.16 + aa.x, f.x) * (1.0 - smoothstep(0.84 - aa.x, 0.84 + aa.x, f.x));',
    '  float my = smoothstep(0.2 - aa.y, 0.2 + aa.y, f.y) * (1.0 - smoothstep(0.84 - aa.y, 0.84 + aa.y, f.y));',
    '  pane = mx * my * step(1.0, id.y);',
    '  float h = hash12(id + seed * 113.0);',
    '  float on = smoothstep(h - ' + (LIT.band / 2).toFixed(3) + ', h + ' + (LIT.band / 2).toFixed(3) + ', uLit + bias);',
    '  vec3 c = hash12(id * 1.7 + seed * 7.0 + 3.1) < warmth ? uWarm : uCool;',
    '  if (hash12(id + 41.0 + seed * 3.0) < 0.08) c = neon5(floor(hash12(id + 9.0 + seed) * 5.0));',
    '  float dim = 0.55 + 0.45 * hash12(id + 17.0 + seed);',
    /* far away the 0.12 x 0.16 grid shimmers: fade it to its average */
    '  float far = smoothstep(0.35, 0.8, max(dg.x, dg.y));',
    '  vec3 lit = c * on * dim * pane;',
    '  vec3 avg = mix(uWarm, uCool, 0.35) * clamp(uLit + bias, 0.0, 1.0) * 0.3;',
    '  pane = mix(pane, 0.45, far);',
    '  return mix(lit, avg, far);',
    '}',
    'void main() {',
    '  float kind = floor(vWin.w + 0.5);',
    '  vec2 duv = fwidth(vUv);',                                    /* derivatives in uniform control flow */
    '  vec3 N = normalize(vN);',
    '  vec3 V = normalize(cameraPosition - vW);',
    '  float hl = dot(N, uSunDir) * 0.5 + 0.5;',
    '  vec3 light = (uSunCol * uSunI * hl * hl + mix(uHemiGround, uHemiSky, N.y * 0.5 + 0.5) * uHemiI) * RECIPROCAL_PI;',
    '  vec3 surf = vTint * light;',
    '  vec3 emis = vec3(0.0);',
    '  float extraHaze = 0.0;',
    '  if (kind < 0.5) {',
    '    extraHaze = vWin.y;',
    '  } else if (kind < 1.5) {',                                   /* LED panel */
    '    surf = uInk * light * 0.6;',
    '    emis = ledPanel(vUv, duv, vWin.y, vWin.z, vWin.x) * mix(0.7, 1.0, vShow);',
    '  } else if (kind < 2.5) {',                                   /* glass with windows */
    '    float pane = 0.0;',
    '    if (abs(N.y) < 0.5) {',
    '      emis = windows(vUv, duv, vWin.x, vWin.y, vWin.z, pane);',
    '      surf = mix(surf, surf * 1.35 + uHemiSky * 0.04, pane);',
    '#ifndef CITY_LOW',
    '      float fres = pow(1.0 - abs(dot(N, V)), 3.0);',
    /* golden hour: the low sun glints off the smoked glass (a faint moon glint at Showtime) */
    '      float glint = pow(max(dot(reflect(-V, N), uSunDir), 0.0), 12.0) * uSunI * 0.06;',
    '      surf += uHemiSky * fres * 0.05 + uSunCol * glint * (1.0 - pane * 0.5);',
    '#endif',
    '    }',
    '  } else if (kind < 3.5) {',                                   /* emissive strip / lamp */
    '    float mm = vWin.z > 1.5 ? 1.0 : vWin.z * vShow;',
    '    surf = vec3(0.0);',
    '    emis = mix(vTint, uMember, mm) * mix(vWin.y, 1.0, vShow);',
    '  } else if (kind < 4.5) {',                                   /* the hero board */
    '    float sc = uReduced > 0.5 ? 0.0 : uTime * ' + HERO_SCROLL.toFixed(4) + ';',
    '    float a = texture2D(uHero, vec2(fract(vUv.x + sc), vUv.y)).r;',
    '    surf = uInk * light * 0.6;',
    '    emis = mix(uInk * 1.6, palette5(vUv.x * 0.6 - uTime * 0.01 * (1.0 - uReduced)), a) * mix(0.7, 1.0, vShow);',
    '  } else if (kind < 5.5) {',                                   /* the Signal Mast beacon: a 0.5 Hz soft sine */
    '    float b = uReduced > 0.5 ? 0.8 : 0.55 + 0.45 * (0.5 + 0.5 * sin(uTime * ' + (MAST.beaconHz * TAU).toFixed(4) + '));',
    '    surf = vec3(0.0);',
    '    emis = vTint * b;',
    '  } else {',                                                   /* Halo Wheel dots: a 0.05 Hz sweep round the rim */
    '    float sw = uReduced > 0.5 ? 0.6 : 0.5 + 0.5 * cos(6.2831853 * (vWin.x - uTime * ' + WHEEL.sweepHz.toFixed(3) + '));',
    '    float mm = vWin.z > 1.5 ? 1.0 : vWin.z * vShow;',
    '    surf = vec3(0.0);',
    '    emis = mix(vTint, uMember, mm) * mix(vWin.y, 1.0, vShow) * mix(0.45, 1.0, sw);',
    '  }',
    /* own haze: surfaces toward the fog colour (with an aerial-perspective floor), lights at half */
    '  float hz = clamp((vDist - uHaze.x) / (uHaze.y - uHaze.x), 0.0, 1.0);',
    '  float hs = max(mix(uHaze.z, 1.0, hz), extraHaze);',
    '  vec3 col = mix(surf, uFogCol, hs) + emis * (1.0 - 0.5 * hs);',
    '  gl_FragColor = vec4(col, 1.0);',
    '  #include <tonemapping_fragment>',
    '  #include <colorspace_fragment>',
    '}'
  ].join('\n');

  var api = {
    VERSION: VERSION, SEED: SEED, create: create,
    /* constants (read-only use) */
    QUAY: QUAY, GROUND: GROUND, SEA_Y: SEA, BARGE: BARGE, BARGES: BARGES, WHEEL: WHEEL, BRIDGE: BRIDGE, TERMINAL: TERMINAL,
    PODIUM: PODIUM, ARENA: ARENA, MAST: MAST, COUNTS: COUNTS, ROWS: ROWS, LAYERS: LAYERS, ARCH: ARCH, TONES: TONES,
    ACCENTS: ACCENTS, NEON4: NEON4, LED_PROG: LED_PROG, LED_HUES: LED_HUES, FREQS: FREQS, KIND: KIND, MODE: MODE,
    LIT: LIT, WAKE: WAKE, HAZE: HAZE, HERO_MUL: HERO_MUL, NEIGHBOUR_DIFF: NEIGHBOUR_DIFF, FLANK: FLANK, TWIST_DEG: TWIST_DEG,
    /* pure helpers */
    quayZ: quayZ, quayCurve: quayCurve, curveAt: curveAt, heightEnvelope: heightEnvelope, counts: counts,
    layout: layout, buildArrays: buildArrays, windowStrips: windowStrips, deckY: deckY, roosts: roosts,
    heroWords: heroWords, signName: signName, cellDistance: cellDistance, inExclusion: inExclusion, linear: linear, fnv: fnv,
    SHADERS: { CITY_VERT: CITY_VERT, CITY_FRAG: CITY_FRAG }
  };
  return api;
}));
