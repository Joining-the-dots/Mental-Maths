/* ================================================================
   My Island 3D — city buildings I (Encore City v2, chunk B6; classic script).
   Registers SL3D.defineModels('city', factory(K)) for the Photo Booth, the
   Boba Café, the LED Screen Tower and the Recording Studio (CATALOG kind
   'fun', cat 'city'; LOOK kind 'building'). THREE is never touched directly
   except through K (K.THREE for the uv of textured faces and the two small
   canvases below); colours come from the LOOK table by key. In Node,
   module.exports gives the factory and the pure helpers (tests).

   Item space (kit.js): pivot at the footprint centre, base y = 0, facing +z;
   every rest pose stays inside fp/2 − 0.07 of the footprint. Buildings are
   never jittered and carry no ink hull (the edit selection hull is the kit's).

   TRIMS: 3 per building from the stateKey 'v:<n>' (SLIslandLook.variantOf(uid,
   id) picks n; trimOf(id, n) → {accent: @member | Neon Magenta | LED Cyan,
   signSide: L | R (the facade layout mirrors), stripe: A | B | C (the accent
   line pattern)}).

   PARTS (≤ 6 per building, ≤ 4 static, ≤ 4 materials; one draw call each):
     every building  shell (toon, static, casts the static shadow) · lights
                     (state, perCopy: every emissive bit in one mesh whose
                     vertex colours this file writes only when they change —
                     the trim accent lines, including the child's member colour,
                     neon edges, glowing glass, bulbs, beacons, VU segments)
     bld_photobooth  + sign (PHOTO, sign atlas) · lens (smoked, pivot 'flash')
                     · cloth (perCopy curtain; folded into the shell on LOW)
                     · strip (the photo strip canvas, pivot 'strip')
     bld_boba        + pearl (frosted cup band, lid, sheen) · hatch (pivot
                     'hatch') · pearls (pivot 'pearls') · cup (the served cup,
                     pivot 'cup', hidden in the kiosk at rest)
     bld_ledtower    + screen / screen2 (two stacked 2:1 LED tiles, pivot
                     'screen') · band (the scanline, pivot 'wipe' ⊂ 'screen');
                     the lights sit on the (static) 'beacon' pivot
     bld_recording   + sign (ON AIR) · meter (peak bar, pivot 'meter') · mic
                     (pivot 'mic') · phones (the giant headphones, pivot 'phones')

   MATERIAL HOOK: handler.material(matKey, part) returns the textured material
   for the sign faces (K.signAtlas: PHOTO, ON AIR — SIGN_WORDS only), the photo
   strip and the two LED tiles (K.ledAtlas views, UV offset only). Templates
   drop uv, so after done() this file gives those faces a planar uv from their
   own item-space frame (the shared basic+map program, no new shader).

   ACTS (SLMotion timelines; the building part ≤ 3 s, 'screen' 0.5 s):
     snap    bulbs count down (1.67 Hz), one lens bloom (≤ 1 per 1.5 s per
             booth), the strip slides out and stays STRIP_SEC; the strip canvas
             (the active pet in 3 poses + the child's emoji) is redrawn only on
             a tap · a.pets.perform('pose', uid)
     serve   the hatch flips, a cup slides along the counter to the bar table,
             the sign's pearls swirl up a helix · a.pets.perform('sip', uid)
     screen  a dark scanline wipe; the next program (name marquee → pet pixel
             art → EQ → star field) at most once per 0.5 s; Showtime also
             advances every 8 bars
     record  ON AIR lights (steady, ON_AIR_SEC after the tap), the VU bars
             follow the beat, the mic and phones groove, the active pet's own
             voice (cue pet: true); SLMusic.drop() when the island music plays
   Every act restarts on a re-tap (blending from the interrupted pose), cancel
   rests its pivots, nothing plays 'pop' in its first 0.05 s (the controller's
   tap squish owns it), and reduced motion gives the instant end state with one
   sparkle. No act touches points or chance.

   HANDLE used (CONTRACTS §5): uid t phase reduced show beat bar music batch
   object template pivot(name).set state halo decal emit sfx pets.{active,
   perform} copyGeometry. Optional, read when present: a.member (the child's
   member hex) or a.user {name, color, avatar} — for the member trim and the
   strip's emoji; without them the member trim shows MEMBER_FALLBACK and the
   strip a ✦. a.pets.active() returning a pet id enables the pet voice, the
   strip poses and the pet pixel-art program. a.bloom('lens', size, token) → true
   (island3d → fx3d's rate-limited bloom) replaces the lens halo; without it (or
   false) the booth shows its own halo. A handle without a batch is a
   photocard / turntable: the LED tower shows the star field, ON AIR is lit,
   the strip stays in and no member colour is applied, so icons are not per
   child.
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
    if (S && typeof S.defineModels === 'function') S.defineModels('city', function (K) { return api.factory(K); });
  }
}(typeof self !== 'undefined' ? self : typeof globalThis !== 'undefined' ? globalThis : this, function (root, M0, L0) {
  'use strict';

  var VERSION = 1;
  var IDS = ['bld_photobooth', 'bld_boba', 'bld_ledtower', 'bld_recording'];
  var PI = Math.PI, TAU = PI * 2, DEG = PI / 180;
  var POP_GUARD = 0.05;          /* the controller's tap squish owns 'pop' in an act's first 0.05 s */
  var NEON_DAY = 0.6;            /* neon lines and signs at golden hour (linear ×); full at Showtime */
  var HALO_ON = 0.08;            /* night halos switch on above this Showtime mix and grow with it */
  var CARRY_WINDOW = 0.25;       /* a cancel this recent is an interruption: the restart carries the pose */
  var COUNTDOWN = 1.5;           /* the snap countdown: bulbs light in thirds before it, fade together after */
  var TRIMS_FALLBACK = { accent: ['@member', 'Neon Magenta', 'LED Cyan'], signSide: ['L', 'R'], stripe: ['A', 'B', 'C'] };
  var GLOW_FALLBACK = [0.6, 1];  /* DUSK / SHOW windowGlow */
  var RATE_FALLBACK = { bloom: 1.5, screen: 0.5 };

  function mo() { return M0 || root.SLMotion || null; }
  function looks() { return L0 || root.SLIslandLook || null; }
  function lookOf(id) { var L = looks(); return (L && L.LOOK && L.LOOK[id]) || null; }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function lerp(a, b, k) { return a + (b - a) * k; }
  function frac(v) { return v - Math.floor(v); }
  function smooth(a, b, x) { var u = clamp01((x - a) / (b - a)); return u * u * (3 - 2 * u); }
  function inOut(u) { u = clamp01(u); return 0.5 - 0.5 * Math.cos(PI * u); }
  function freezeAll(o) { Object.keys(o).forEach(function (k) { if (o[k] && typeof o[k] === 'object') freezeAll(o[k]); }); return Object.freeze(o); }
  function rate() { var M = mo(); return (M && M.RATE) || RATE_FALLBACK; }
  function allow(last, t, gap) { var M = mo(); return M && typeof M.allow === 'function' ? M.allow(last, t, gap) : last == null || !(t - last < gap); }
  function onAirSec() { var M = mo(); return M && M.ON_AIR_SEC > 0 ? M.ON_AIR_SEC : 4; }
  function stripSec() { var M = mo(); return M && M.STRIP_SEC > 0 ? M.STRIP_SEC : 6; }
  function glowAt(k) {
    var L = looks(), a = L && L.DUSK ? L.DUSK.windowGlow : GLOW_FALLBACK[0], b = L && L.SHOW ? L.SHOW.windowGlow : GLOW_FALLBACK[1];
    return lerp(a, b, clamp01(k));
  }

  /* ---------------- default colour tokens (= the LOOK entries; the LOOK wins) ---------------- */
  var DEF = {
    bld_photobooth: { body: 'Night Asphalt', panel: 'Graphite', accent: '@member', curtain: 'Primary Pink', rod: 'Gunmetal', bezel: 'Gunmetal',
      lens: 'Smoked Glass', bulb: 'Gunmetal Mid', bulbOn: 'Window Warm', slot: 'Midnight Ink', kick: 'Gunmetal',
      sign: 'Neon Magenta', signText: 'Bone White', star: 'Star Gold', strip: 'Bone White' },
    bld_boba: { body: 'Concrete', band: 'Bone White', accent: '@member', glass: 'Smoked Glass', glassGlow: 'Window Warm', counter: 'Teak',
      cup: 'Bone White', liquid: 'Milk Tea', pearl: 'Midnight Ink', straw: '@member', lid: 'Bone White',
      awning: 'Bone White', awningEdge: 'Neon Magenta', table: 'Teak', stool: 'Gunmetal' },
    bld_ledtower: { plinth: 'Concrete', leg: 'Gunmetal', brace: 'Gunmetal Mid', ladder: 'Gunmetal Mid', bezel: 'Graphite', screen: 'Bone White',
      cap: 'Gunmetal', antenna: 'Gunmetal', beacon: 'Neon Magenta', accent: '@member' },
    bld_recording: { body: 'Graphite', plinth: 'Concrete', accent: '@member', foam: 'Night Asphalt', door: 'Gunmetal', sign: 'Neon Magenta',
      signOff: 'Gunmetal Mid', porthole: 'Gunmetal', glass: 'Smoked Glass', glassGlow: 'Window Warm', mic: 'Gunmetal Spec',
      meterLo: 'Laser Lime', meterHi: 'Neon Magenta', band: 'Gunmetal', cup: 'Graphite', ring: 'Electric Violet' }
  };
  /* the Showtime halos (night ones grow in with the mix) and the uplight decal token */
  var GLOW = {
    bld_photobooth: { halos: [['sign', 'Neon Magenta', 0.45, true], ['bulbs', 'Window Warm', 0.3, false]], decal: 'Window Warm' },
    bld_boba: { halos: [['cup', 'Neon Magenta', 0.7, false]], decal: 'Window Warm' },
    bld_ledtower: { halos: [['glow', 'Electric Violet', 1.1, false], ['beacon', 'Neon Magenta', 0.3, false]], decal: 'Electric Violet' },
    bld_recording: { halos: [['ringL', 'Electric Violet', 0.4, false], ['ringR', 'Electric Violet', 0.4, false]], decal: 'Window Warm' }
  };

  /* ================================================================
     LAYOUT (item-space units)
     ================================================================ */
  /* Photo Booth (1×1, h 1.6): a slim Night Asphalt kiosk, curtain alcove on the sign side's
     left, the camera panel (lens + 8 bulbs) on its right, a PHOTO lightbox header and a ✦ */
  var PB = {
    body: [0.62, 1.28, 0.66], bodyZ: -0.06, front: 0.27,
    header: [0.66, 0.2, 0.13], headerY: 1.38, headerZ: 0.235, headerFront: 0.30,
    lightbox: [0.58, 0.15], text: [0.54, 0.135], starY: 1.545, starR: 0.055, starW: 0.023, starFlat: 0.45,
    alcoveX: -0.155, alcove: [0.26, 1.07], alcoveY: 0.585,
    rodY: 1.1, rodR: 0.011, rodLen: 0.3, rodZ: 0.305,
    curtainTop: 1.09, curtainH: 0.76, curtainW: 0.26, strips: 6, pleatDeg: 25, curtainZ: 0.30,
    stool: { y: 0.29, r: 0.052, h: 0.022, legR: 0.01, z: 0.31 },
    camX: 0.1575, camPanel: [0.265, 0.70], camPanelY: 0.81,
    lensY: 0.87, bezelR: 0.092, bezelD: 0.03, lensR: 0.068, lensH: 0.04,
    bulbs: 8, bulbRing: 0.122, bulbR: 0.016, bulbH: 0.022,
    slotX: 0.313, slotH: 0.28, stripW: 0.1, stripH: 0.26, stripY: 0.49, stripZ: 0.17, stripIn: 0.205, stripOut: 0.112,
    glow: [0.24, 0.045], glowY: 1.0875, kickH: 0.05,
    clothAmp: 0.02, clothHz: 0.25, bloomScale: 0.12, bloomHalo: 0.5, retract: 0.4
  };
  /* Boba Café (2×1, h 1.95): a Concrete kiosk on the left cell crowned by a giant cup sign,
     an awning, a bar table and 2 stools on the right cell */
  var BB = {
    kiosk: [0.82, 1.05, 0.74], kioskX: -0.5, kioskZ: -0.02, front: 0.35,
    band: [0.83, 0.3, 0.75], cap: [0.86, 0.04, 0.78], capY: 1.07,
    counter: [0.62, 0.035, 0.08], counterY: 0.5,
    win: [0.54, 0.3], winY: 0.69, transom: [0.6, 0.085], transomY: 0.945,
    hatch: [0.58, 0.33, 0.022], hingeY: 0.865, handle: [0.18, 0.02, 0.022],
    menu: [0.012, 0.26, 0.22], menuX: -0.084, menuY: 0.72, menuZ: 0.12,
    cupX: 0.08, cupZ: -0.04, mountY: 1.11, cupY0: 1.13,
    liquid: { rTop: 0.188, rBot: 0.15, h: 0.43 }, frost: { rTop: 0.2, rBot: 0.188, h: 0.17 }, lidR: 0.205, lidH: 0.07,
    straw: { r: 0.024, len: 0.36, tilt: 12, y: 1.79, dx: 0.045 },
    pearls: 7, pearlR: 0.034, pearlH: 0.07, pearlYs: [1.17, 1.215], pearlOut: 0.016, rise: 0.28,
    awning: [0.89, 0.035, 0.62], awningX: 0.355, awningY: 1.1, awningZ: 0.03,
    postX: 0.76, postZ: [0.3, -0.24], postR: 0.018,
    table: { x: 0.47, z: 0.0, topR: 0.16, topY: 0.53, top: 0.03, stemR: 0.018, baseR: 0.09 },
    stools: [[0.2, 0.08], [0.74, -0.02]], stoolY: 0.36, stoolR: 0.068, stoolLegR: 0.012,
    /* the served cup rests hidden in the kiosk; its lane runs x −0.5 → −0.15 along the counter at z 0.39 */
    served: { r: 0.042, rb: 0.034, h: 0.1, rest: [-0.5, 0.5175, 0.25] }, cupLane: [-0.5, -0.15, 0.39]
  };
  /* LED Screen Tower (1×1, h 2.5): a lattice mast on a plinth carrying a tilted screen of two
     stacked 2:1 LED tiles, a cap, an antenna and a breathing beacon */
  var LT = {
    plinth: [0.6, 0.12, 0.6], legX: 0.2, legR: 0.025, legY0: 0.12, legY1: 1.24,
    braceY: [0.3, 1.0], braceW: 0.016,
    ladderX: 0.245, rail: 0.07, ladderY: [0.14, 1.2], rungs: 5,
    walk: [0.62, 0.025, 0.5], walkY: 1.11, walkZ: 0.06, railH: 0.12,
    screen: [0, 1.62, 0], box: [0.82, 0.9, 0.16], tilt: -6,
    tile: [0.74, 0.37], tileY: 0.2, faceZ: 0.083,
    band: [0.76, 0.05, 0.008], bandY: 0.41, travel: 0.82, squash: 0.03,
    cap: [0.86, 0.04, 0.2], antenna: { r: 0.011, y0: 2.09, y1: 2.39 }, beaconY: 2.42, beaconR: 0.036, beaconH: 0.09,
    scroll: 0.125, beaconHz: 0.5, beaconMin: 0.6, autoBars: 8, dayLevel: 0.7, petHz: 1
  };
  /* Recording Studio (2×1, h 1.85): a low Graphite block wearing giant headphones; door +
     ON AIR lightbox, a foam panel, a porthole with a mic and a VU meter along the front */
  var RS = {
    block: [1.72, 0.95, 0.76], blockY: 0.535, blockZ: -0.03, front: 0.35,
    plinth: [1.78, 0.06, 0.8],
    doorX: -0.6, door: [0.3, 0.62, 0.02], doorY: 0.37,
    onairY: 0.82, frame: [0.38, 0.14, 0.03], backing: [0.34, 0.105], text: [0.32, 0.08],
    foamX: -0.17, foam: [0.34, 0.46, 0.02], foamY: 0.55, stud: { r: 0.042, h: 0.05 },
    studCols: [-0.1, 0, 0.1], studRows: [0.38, 0.49, 0.6, 0.71],
    portX: 0.3, portY: 0.52, ringR: 0.2, ringr: 0.035, glassR: 0.19,
    mic: { y0: 0.35, stand: 0.16, headR: 0.032, headH: 0.1, z: 0.03, sway: 4 },
    vuX: 0.7, housing: [0.16, 0.56, 0.03], vuY: 0.5, bars: 3, segs: 6, seg: [0.035, 0.06, 0.006], segY0: 0.29, segStep: 0.08, barStep: 0.045,
    needle: [0.15, 0.012, 0.008], needleY: 0.255, needleTravel: 0.47,
    phones: { y: 1.19, x: 0.48, cupR: 0.17, cupW: 0.11, cushR: 0.15, cushW: 0.035, bandY: 1.30, bandR: 0.48, bandr: 0.032, bob: 0.018 },
    fade: 0.3
  };

  /* ================================================================
     PURE HELPERS (no THREE; exported for Node tests)
     ================================================================ */
  /* the trim index of a build: ctx.st.variant, else the stateKey's 'v:<n>' */
  function variantOf(ctx) {
    var st = ctx && ctx.st, v = st && typeof st.variant === 'number' && isFinite(st.variant) ? st.variant : NaN;
    if (!(v >= 0)) { var m = /(?:^|\|)v:(\d+)/.exec(String((ctx && ctx.stateKey) || '')); v = m ? +m[1] : 0; }
    v = v | 0;
    return v < 0 ? 0 : v > 2 ? 2 : v;
  }
  function trimFor(id, v) {
    var L = looks();
    if (L && typeof L.trimOf === 'function') return L.trimOf(id, v);
    var T = TRIMS_FALLBACK;
    return { accent: T.accent[v % 3], signSide: T.signSide[v % 2], stripe: T.stripe[v % 3] };
  }
  /* planar uv across a face frame {c, ex, ey, w, h} (u along ex, v along ey, 0..1 corner to corner) */
  function faceUV(pos, count, f, out) {
    out = out || new Float32Array(count * 2);
    var c = f.c, ex = f.ex, ey = f.ey;
    for (var i = 0; i < count; i++) {
      var dx = pos[i * 3] - c[0], dy = pos[i * 3 + 1] - c[1], dz = pos[i * 3 + 2] - c[2];
      out[i * 2] = (dx * ex[0] + dy * ex[1] + dz * ex[2]) / f.w + 0.5;
      out[i * 2 + 1] = (dx * ey[0] + dy * ey[1] + dz * ey[2]) / f.h + 0.5;
    }
    return out;
  }
  /* a face frame tilted about x by deg around the pivot point */
  function frameX(c, w, h, deg) {
    var a = (deg || 0) * DEG;
    return { c: c, ex: [1, 0, 0], ey: [0, Math.cos(a), Math.sin(a)], w: w, h: h };
  }
  /* booth bulb i during the countdown: the ring lights in thirds on the ticks, then all fade together */
  function boothBulb(i, bulbs, t) {
    if (!(t < COUNTDOWN)) return clamp01(bulbs);
    var group = Math.floor(i * 3 / PB.bulbs);
    return bulbs >= (group + 1) / 3 - 1e-6 ? 1 : 0;
  }
  /* the Showtime marquee on bulb i (SLMotion.chase: hz steps a second, each bulb once per `groups`) */
  function boothChase(t, i, k, reduced) {
    var M = mo(), lk = lookOf('bld_photobooth'), ch = lk && lk.show && lk.show.chase;
    var hz = ch && ch.hz > 0 ? ch.hz : 0.5, groups = ch && ch.groups > 0 ? ch.groups : 2;
    var w = smooth(0.3, 1, k);
    if (!(w > 0)) return 0;
    return w * (M ? M.chase(t, i, hz, groups, reduced) : 0.8);
  }
  /* the beacon / sign breathing: a sine between min and 1, never on/off; reduced holds the middle */
  function breathe(t, hz, min, phase, reduced) {
    if (reduced) return (min + 1) / 2;
    return min + (1 - min) * (0.5 + 0.5 * Math.sin(TAU * (hz * t + (phase || 0))));
  }
  /* the served cup's path (u 0..1): out of the kiosk onto the counter, along it, then a hop onto
     the bar table → item-space base point */
  function cupPath(u, side, out) {
    out = out || [0, 0, 0];
    var T = BB.table, r = BB.served.rest, zc = BB.cupLane[2], x1 = BB.cupLane[0], x2 = BB.cupLane[1];
    var tx = T.x + (side === 'R' ? 0.06 : 0), yT = T.topY + T.top / 2;
    u = clamp01(u);
    if (u < 0.15) { out[0] = r[0]; out[1] = r[1]; out[2] = lerp(r[2], zc, u / 0.15); }
    else if (u < 0.55) { out[0] = lerp(x1, x2, (u - 0.15) / 0.4); out[1] = r[1]; out[2] = zc; }
    else {
      var c = (u - 0.55) / 0.45;
      out[0] = lerp(x2, tx, c); out[2] = lerp(zc, T.z, c);
      out[1] = lerp(r[1], yT, c) + 0.12 * Math.sin(PI * c);
    }
    return out;
  }
  /* the cup sign's liquid radius at height y (it tapers out toward the top) */
  function liquidR(y) { var L = BB.liquid; return L.rBot + (L.rTop - L.rBot) * clamp01((y - BB.cupY0) / L.h); }
  /* the pearls' pose: swirl 0..1 → a full turn up a helix, xz scaled to keep them on the wall */
  function pearlPose(swirl, bobDy, out) {
    out = out || {};
    var dy = BB.rise * clamp01(swirl), y0 = (BB.pearlYs[0] + BB.pearlYs[1]) / 2;
    out.ry = 360 * inOut(swirl); out.dy = dy + (bobDy || 0);
    out.s = (liquidR(y0 + dy) + BB.pearlOut) / (liquidR(y0) + BB.pearlOut);
    return out;
  }
  /* the LED program cycle (plan B6 order) and the bottom tile's companion for each */
  var CYCLE = ['name', 'pet', 'eq', 'stars'];
  var COMPANION = { name: 'eq', pet: 'spark', eq: 'wave', stars: 'spark' };
  function nextProgram(i, hasPet) {
    var j = (i + 1) % CYCLE.length;
    if (CYCLE[j] === 'pet' && !hasPet) j = (j + 1) % CYCLE.length;
    return j;
  }
  /* the scroll phase of a program window (fractions of its 128 px period); the EQ glides one bar
     per beat, the pet art flips between its 2 frames at 1 Hz, the rest drift at `speed` periods/s */
  function programPhase(prog, t, beatN, beatFrac, phase, reduced, speed) {
    if (reduced) return 0;
    if (prog === 'eq') return frac((beatN + smooth(0.1, 0.45, beatFrac)) / 8);
    if (prog === 'pet') return Math.floor(t * 2 * LT.petHz) % 2 ? 0.5 : 0;
    return frac(t * (speed > 0 ? speed : LT.scroll) + (phase || 0));
  }
  /* the integer beat under a handle: the bar from the clock plus the beat wraps counted inside it */
  function beatIndex(s, a) {
    var f = a && typeof a.beat === 'number' && isFinite(a.beat) ? frac(a.beat) : 0, bar = a ? a.bar | 0 : 0;
    if (s.bbar !== bar) { s.bbar = bar; s.bk = 0; }
    else if (f < s.bf - 0.5 && s.bk < 3) s.bk++;
    s.bf = f;
    return bar * 4 + s.bk;
  }
  /* the photo strip: 4 frames on a 128×256 canvas, top to bottom (3 pet poses, then the emoji) */
  var STRIP_FRAMES = [0, 1, 2, 3].map(function (i) { return Object.freeze({ x: 8, y: 8 + i * 61, w: 112, h: 57 }); });
  var STRIP_POSES = [{ frame: 0, flip: false, rot: 0, lift: 0 }, { frame: 1, flip: true, rot: 0, lift: 0 }, { frame: 0, flip: false, rot: -12, lift: 5 }];
  var STRIP_BG = ['Dusk Mid', 'Smoked Mid', 'Night Glass Plum', 'Night Glass Teal'];
  /* 16×16 side-view pixel art for the LED pet program, coloured from LOCKED PETCOL:
     b body · d dark · l light · n nose · e eye (Midnight Ink) · . off */
  var PET_PIXELS = {
    pet_puppy: ['................', '................', '.........dd.....', '........dbbbb...', '.......dbbbbbb..', '.......dbbebbbn.',
      '.......dbbbbbbb.', '........bbblll..', '...d....bbbb....', '..dbbbbbbbbbb...', '..bbbbbbbbbbb...', '...bbllllllbb...',
      '...bbbbbbbbbb...', '...bb.bb..bb.bb.', '...dd.dd..dd.dd.', '................'],
    pet_kitten: ['................', '.........d..d...', '.........bb.bb..', '.........bbbbb..', '........bbbbbbb.', '........bbbebbn.',
      '........bbbbbbb.', '.d.......blllb..', '.d......bbbbb...', '..d.bbbbbbbbb...', '..dbbbbbbbbbb...', '...bbllllllbb...',
      '...bbbbbbbbbb...', '...bb.bb..bb.bb.', '...dd.dd..dd.dd.', '................'],
    pet_bunny: ['.........ll.....', '.........bl.l...', '.........bl.bl..', '.........bb.bl..', '........bbbbbb..', '........bbebbbn.',
      '........bbbbbbb.', '.........bllb...', '........bbbbb...', '...bbbbbbbbbb...', '..lbbbbbbbbbb...', '..lbbllllllbb...',
      '...bbbbbbbbbb...', '...bb.bb..bb.bb.', '...dd.dd..dd.dd.', '................'],
    pet_dragon: ['................', '.........d.d....', '........dbbbb...', '........bbbbbb..', '.......bbbebbbn.', '.......bbbbbbbb.',
      '....l...blllb...', '...lll..bbbb....', '..llll.bbbbb....', 'd.dbdbbbbbbbb...', '.dbbbbbbbbbbb...', '..bbbllllllbb...',
      '...bbbbbbbbbb...', '...bb.bb..bb.bb.', '...dd.dd..dd.dd.', '................']
  };
  /* the pixel ✦ beside the pet: big on frame A, small on frame B (a 1 Hz twinkle, never a flash) */
  var SPARK_PIXELS = [['..x..', '..x..', 'xxxxx', '..x..', '..x..'], ['.....', '..x..', '.xxx.', '..x..', '.....']];
  var VOICE_STEP = { pet_puppy: 0, pet_kitten: 1, pet_bunny: 2, pet_dragon: 3 };
  function voiceStep(petId) { return Object.prototype.hasOwnProperty.call(VOICE_STEP, petId) ? VOICE_STEP[petId] : -1; }

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
  function showOf(a) { return a && typeof a.show === 'number' && isFinite(a.show) ? clamp01(a.show) : 0; }
  function safe(fn, self, x, y, z, w) { try { return fn.call(self, x, y, z, w); } catch (e) { return undefined; } }
  /* a photocard / turntable handle: an instantiated object, no island batch */
  function isCard(a) { return !!(a && !a.batch && a.object); }
  function copyGeo(a, part) {
    if (!a) return null;
    try {
      if (typeof a.copyGeometry === 'function') return a.copyGeometry(part) || null;
      var o = a.object || null, ms = o && o.userData && o.userData.meshes;
      if (ms && ms[part] && ms[part].geometry) return ms[part].geometry;
    } catch (e) {}
    return null;
  }
  function attr(geo, name) {
    if (!geo) return null;
    if (typeof geo.getAttribute === 'function') return geo.getAttribute(name) || null;
    return (geo.attributes && geo.attributes[name]) || null;
  }
  function normHex(h) { var m = typeof h === 'string' ? /^#?([0-9a-f]{6})$/i.exec(h.trim()) : null; return m ? '#' + m[1].toUpperCase() : null; }
  /* the child's member colour on the island (cached per copy: no per-frame parsing); null on cards */
  function memberOf(s, a) {
    if (!a || isCard(a)) return null;
    var raw = a.member || (a.user && a.user.color) || (a.st && a.st.member) || null;
    if (raw !== s.mRaw) { s.mRaw = raw; s.mHex = normHex(raw); }
    return s.mHex;
  }
  function emojiOf(a) {
    var u = a && a.user, e = (u && (u.avatar || u.emoji)) || (a && (a.avatar || a.emoji));
    return typeof e === 'string' && e ? e : null;
  }
  /* the active pet's id when a.pets.active() names one; null otherwise */
  function petOf(a) {
    var p = a && a.pets;
    if (!p || typeof p.active !== 'function') return null;
    var v = safe(p.active, p);
    return typeof v === 'string' && /^pet_/.test(v) ? v : null;
  }
  function petActive(a) {
    var p = a && a.pets;
    if (!p || typeof p.active !== 'function') return !!(p && typeof p.perform === 'function');
    return !!safe(p.active, p);
  }
  function askPet(a, kind) {
    var p = a && a.pets;
    if (!p || typeof p.perform !== 'function' || !petActive(a)) return 0;
    var r = safe(p.perform, p, kind, a.uid);
    return typeof r === 'number' && r > 0 ? r : 0;
  }

  /* ================================================================
     LIGHTS — one perCopy 'state' mesh per building. Each segment {role, tok, tok2, idx,
     shaded, start, count} is a vertex range whose colour this file writes (linear rgb,
     only when it changes). Roles: accent (the trim accent, the member colour live) · neon ·
     window (Smoked Glass → Window Warm by the window glow) · bulb · beacon · onair · liquid ·
     member · roof (the Showtime LED line) · vu (bar·8 + segment)
     ================================================================ */
  function vcount(g) {
    if (g && typeof g.getAttribute === 'function') { var p = g.getAttribute('position'); return p ? p.count : 0; }
    return g && g.tris ? g.tris * 3 : 0;              /* the Node tests' mock geometry */
  }
  function LightsBuilder(G) { this.G = G; this.geos = []; this.segs = []; this.n = 0; }
  LightsBuilder.prototype.add = function (geo, role, tok, o) {
    o = o || {};
    this.G.paint(geo, tok);
    var c = vcount(geo);
    this.segs.push(Object.freeze({ role: role, tok: tok, tok2: o.tok2 || null, idx: o.idx || 0, shaded: !!o.shaded, start: this.n, count: c }));
    this.n += c;
    this.geos.push(geo);
    return this;
  };
  /* template → {segs, n, accent, side, faces} (set after done(); WeakMap so dropped templates go too) */
  var LAYOUTS = typeof WeakMap === 'function' ? new WeakMap() : new Map();
  function layoutOf(tpl) { return tpl && typeof tpl === 'object' ? LAYOUTS.get(tpl) || null : null; }

  /* ================================================================
     ACT BOOK — one live act per uid, driven by an SLMotion timeline.
     spec: {name, reduced, apply(a, out, t, rec), rest(a, rec), emitAt?(a, rec) → localPos}
     Act: {name, dur, update(a, tAct) → alive, cancel()}
     ================================================================ */
  function makeBook() {
    var recs = new Map();
    function live(uid) { var r = recs.get(uid); return r && !r.done ? r : null; }
    function fire(rec, h, t) {
      var cues = rec.cues;
      while (rec.ci < cues.length && cues[rec.ci].t <= t + 1e-6) {
        var c = cues[rec.ci++];
        if (c.sfx) {
          if (typeof h.sfx !== 'function') continue;
          if (c.sfx === 'pop' && c.t < POP_GUARD) continue;          /* the tap squish already popped */
          if (c.pet) { var step = voiceStep(petOf(h)); if (step >= 0) safe(h.sfx, h, 'voice', c.vol, step); }
          else safe(h.sfx, h, c.sfx, c.vol, c.step);
        } else if (c.emit && typeof h.emit === 'function') {
          var at = rec.spec.emitAt ? rec.spec.emitAt(h, rec) : 'top';
          try { h.emit(c.emit, at, c.n); } catch (e) {}
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
      if (t >= rec.dur) {
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
    function forget(uid) { var r = recs.get(uid); if (r) { r.done = true; recs.delete(uid); } }
    return { live: live, start: start, forget: forget, size: function () { return recs.size; } };
  }

  /* ================================================================
     BUILDERS (ctx.G is the tier's geometry kit; real or the Node mock)
     ================================================================ */
  function colorsOf(ctx, dflt) {
    var c = (ctx.look && ctx.look.colors) || {}, out = {};
    Object.keys(dflt).forEach(function (k) { out[k] = typeof c[k] === 'string' ? c[k] : dflt[k]; });
    return out;
  }
  function topOf(ctx, h) { return ((ctx.look && ctx.look.h > 0) ? ctx.look.h : h) + 0.15; }
  /* integer hash of a 0.25 u grid cell (vertex noise) */
  function cellHash(x, y, z) {
    var h = (Math.floor(x / 0.25) * 73856093) ^ (Math.floor(y / 0.25) * 19349663) ^ (Math.floor(z / 0.25) * 83492791);
    return (h >>> 0) % 5;
  }
  var NOISE = [-0.03, -0.015, 0, 0.015, 0.03];
  /* crisp architecture shading as HSL tone shifts the toon ramp builds on: lit tops +4, undersides
     −6, and (concrete, asphalt) ±3% lightness noise on a 0.25 u grid */
  function archPaint(G, geo, tok, noise) {
    return G.paintBy(geo, function (v) {
      var t = v.ny > 0.6 ? 0.04 : v.ny < -0.5 ? -0.06 : 0;
      if (noise) t += NOISE[cellHash(v.x, v.y, v.z)];
      t = Math.round(t * 1000) / 1000;
      return t ? [tok, t] : tok;
    });
  }
  function ops(ctx) {
    var G = ctx.G, low = ctx.tier === 'LOW';
    var o = {
      G: G, low: low,
      /* a plain box (12 tris, crisp faces) */
      box: function (w, h, d, p, tok, r) { return G.paint(G.t(G.slab(w, h, d, 0), { p: p, r: r }), tok); },
      /* the 0.05 architecture bevel (the main volumes only) */
      arch: function (w, h, d, p, tok, noise) { return archPaint(G, G.t(G.slab(w, h, d, { arch: true }), { p: p }), tok, noise); },
      tube: function (r1, r2, h, R, p, r, tok, open) { return G.paint(G.t(G.tube(r1, r2, h, { radial: R, open: !!open }), { p: p, r: r }), tok); },
      /* a flat face facing +z centred on p (front plane + back) */
      face: function (w, h, p, tok) { return G.paint(G.t(G.flag(w, h, 1, 1), { p: [p[0] - w / 2, p[1], p[2]] }), tok); },
      /* a 4-point ✦: two crossed square diamonds, flattened in z (never 5-pointed) */
      star4: function (r, w, flat, p, tok) {
        var parts = [];
        [0, 90].forEach(function (rz) {
          parts.push(G.t(G.cone(w, r, 4), { p: [0, r / 2, 0] }));
          parts.push(G.t(G.cone(w, r, 4), { r: [180, 0, 0], p: [0, -r / 2, 0] }));
          if (rz) { G.t(parts[parts.length - 2], { r: [0, 0, rz] }); G.t(parts[parts.length - 1], { r: [0, 0, rz] }); }
        });
        return G.paint(G.t(G.merge(parts), { s: [1, 1, flat], p: p }), tok);
      },
      /* a bicone (two open cones, base to base): pearls and beacons */
      bicone: function (r, h, R, p, tok) {
        var up = G.t(G.tube(0, r, h / 2, { radial: R, open: true }), { p: [0, h / 4, 0] });
        var dn = G.t(G.tube(r, 0, h / 2, { radial: R, open: true }), { p: [0, -h / 4, 0] });
        return G.paint(G.t(G.merge([up, dn]), { p: p }), tok);
      }
    };
    o.R = function (mid, lowR) { return low ? lowR : mid; };
    return o;
  }
  /* a thin box strut from (x0, y0) to (x1, y1) on the face z = const; alongZ puts the same strut on a
     side face (x = z, the first coordinates running along z) */
  function strut(o, x0, y0, x1, y1, z, w, tok, alongZ) {
    var dx = x1 - x0, dy = y1 - y0, len = Math.sqrt(dx * dx + dy * dy), ang = Math.atan2(dx, dy) / DEG;
    if (alongZ) return o.box(w, len, w, [z, (y0 + y1) / 2, (x0 + x1) / 2], tok, [ang, 0, 0]);
    return o.box(w, len, w, [(x0 + x1) / 2, (y0 + y1) / 2, z], tok, [0, 0, -ang]);
  }
  /* register the lights layout (+ the trim's accent and sign side) and give the textured faces uv */
  function finish(K, tpl, lights, trim, faces) {
    if (tpl && typeof tpl === 'object') {
      LAYOUTS.set(tpl, Object.freeze({ segs: Object.freeze(lights.segs.slice()), n: lights.n, accent: trim.accent,
        side: trim.signSide === 'R' ? -1 : 1, faces: Object.freeze(faces || {}) }));
    }
    /* textured faces: a planar uv in their own frame (templates drop uv; the atlas windows do the rest) */
    var T = K && K.THREE;
    if (T && typeof T.BufferAttribute === 'function' && tpl && tpl.parts) {
      tpl.parts.forEach(function (p) {
        var f = faces && faces[p.name], g = p.geo;
        if (!f || !g || typeof g.getAttribute !== 'function' || typeof g.setAttribute !== 'function') return;
        var pa = g.getAttribute('position');
        g.setAttribute('uv', new T.BufferAttribute(faceUV(pa.array, pa.count, f), 2));
      });
    }
    return tpl;
  }

  /* ---------- Photo Booth ---------- */
  function buildBooth(ctx) {
    var o = ops(ctx), G = o.G, c = colorsOf(ctx, DEF.bld_photobooth), v = variantOf(ctx), trim = trimFor('bld_photobooth', v);
    var s = trim.signSide === 'R' ? -1 : 1, F = PB.front, X = function (x) { return x * s; };
    var shell = [], lb = new LightsBuilder(G), cloth = [];
    /* body + header box + the ✦ */
    shell.push(o.arch(PB.body[0], PB.body[1], PB.body[2], [0, PB.body[1] / 2, PB.bodyZ], c.body, true));
    shell.push(o.box(PB.header[0], PB.header[1], PB.header[2], [0, PB.headerY, PB.headerZ], c.panel));
    shell.push(o.star4(PB.starR, PB.starW, PB.starFlat, [0, PB.starY, PB.headerZ], c.star));
    /* the curtain alcove: dark doorway, rod, stool under the hem */
    shell.push(o.box(PB.alcove[0], PB.alcove[1], 0.006, [X(PB.alcoveX), PB.alcoveY, F + 0.003], c.slot));
    shell.push(o.tube(PB.rodR, PB.rodR, PB.rodLen, 6, [X(PB.alcoveX), PB.rodY, PB.rodZ], [0, 0, 90], c.rod));
    var ST = PB.stool;
    shell.push(o.tube(ST.r, ST.r, ST.h, o.R(10, 8), [X(PB.alcoveX), ST.y, ST.z], null, c.kick));
    shell.push(o.tube(ST.legR, ST.legR, ST.y, 5, [X(PB.alcoveX), ST.y / 2, ST.z], null, c.kick));
    /* the camera panel, the lens bezel and the print slot on the side wall */
    shell.push(o.box(PB.camPanel[0], PB.camPanel[1], 0.012, [X(PB.camX), PB.camPanelY, F + 0.006], c.panel));
    shell.push(o.tube(PB.bezelR, PB.bezelR, PB.bezelD, o.R(16, 12), [X(PB.camX), PB.lensY, F + 0.012 + PB.bezelD / 2], [90, 0, 0], c.bezel));
    shell.push(o.box(0.008, PB.slotH, 0.024, [X(PB.slotX), PB.stripY, PB.stripZ], c.slot));
    shell.push(o.box(PB.body[0], PB.kickH, 0.012, [0, PB.kickH / 2, F + 0.006], c.kick));
    /* the pleated curtain: 6 strips at ±25° (cloth on MID/HIGH, part of the shell on LOW) */
    var sw = PB.curtainW / (PB.strips * Math.cos(PB.pleatDeg * DEG)), x = X(PB.alcoveX) - s * PB.curtainW / 2, z = PB.curtainZ;
    for (var k = 0; k < PB.strips; k++) {
      var th = (k % 2 ? -PB.pleatDeg : PB.pleatDeg), ry = s > 0 ? th : 180 - th;
      var g = G.t(G.flag(sw, PB.curtainH, 1, 3), { r: [0, ry, 0], p: [x, PB.curtainTop - PB.curtainH / 2, z] });
      G.paint(g, c.curtain, k % 2 ? 'shade' : 'base');
      cloth.push(g);
      x += s * sw * Math.cos(th * DEG); z -= sw * Math.sin(th * DEG);
    }
    /* lights: the 8 ring bulbs, the PHOTO lightbox, the glow behind the curtain top, the trim lines */
    for (var i = 0; i < PB.bulbs; i++) {
      var a = (90 - 22.5 - i * 45) * DEG;
      lb.add(G.t(G.cone(PB.bulbR, PB.bulbH, o.R(6, 5)), { r: [90, 0, 0], p: [X(PB.camX) + PB.bulbRing * Math.cos(a), PB.lensY + PB.bulbRing * Math.sin(a), F + 0.012 + PB.bulbH / 2] }),
        'bulb', c.bulb, { tok2: c.bulbOn, idx: i });
    }
    lb.add(o.face(PB.lightbox[0], PB.lightbox[1], [0, PB.headerY, PB.headerFront + 0.002], c.sign), 'neon', c.sign);
    lb.add(o.face(PB.glow[0], PB.glow[1], [X(PB.alcoveX), PB.glowY, F + 0.008], c.lens), 'window', c.lens, { tok2: c.bulbOn });
    var A = trim.accent, lines = [];
    if (trim.stripe === 'A') {
      lines.push(o.box(PB.body[0], 0.014, 0.008, [0, 1.255, F + 0.004], A));
      lines.push(o.box(0.008, 0.014, PB.body[2], [X(0.314), 1.255, PB.bodyZ], A));
    } else if (trim.stripe === 'B') {
      lines.push(o.box(0.012, PB.camPanel[1], 0.008, [X(PB.camX - PB.camPanel[0] / 2 - 0.006), PB.camPanelY, F + 0.008], A));
      lines.push(o.box(0.012, PB.camPanel[1], 0.008, [X(PB.camX + PB.camPanel[0] / 2 + 0.006), PB.camPanelY, F + 0.008], A));
    } else {
      [0.3, 0.22, 0.14].forEach(function (len, j) { lines.push(o.box(0.008, 0.012, len, [X(0.313), 1.05 - j * 0.05, F - len / 2 - 0.03], A)); });
    }
    lines.forEach(function (gl) { lb.add(gl, 'accent', A); });
    /* the lens (pivot 'flash') and the photo strip (pivot 'strip', in the body at rest) */
    var lensP = [X(PB.camX), PB.lensY, F + 0.012 + PB.bezelD];
    var lens = G.paint(G.t(G.drop(PB.lensR, PB.lensH, [[1, 0], [0.82, 0.55], [0.4, 0.92], [0, 1]]), { r: [90, 0, 0], p: lensP }), c.lens);
    var x0 = s > 0 ? PB.stripIn : -PB.stripIn - PB.stripW, stripC = [x0 + PB.stripW / 2, PB.stripY, PB.stripZ];
    var strip = G.paint(G.t(G.flag(PB.stripW, PB.stripH, 1, 1), { p: [x0, PB.stripY, PB.stripZ] }), c.strip);
    var textP = [0, PB.headerY, PB.headerFront + 0.006];
    var b = ctx.K.template(ctx)
      .part('shell', o.low ? shell.concat(cloth) : shell, 'toon', { castShadow: true })
      .part('sign', [o.face(PB.text[0], PB.text[1], textP, c.signText)], 'sign', {})
      .part('lights', lb.geos, 'state', { perCopy: true })
      .pivot('flash', lensP)
      .part('lens', [lens], 'smoked', { pivot: 'flash' })
      .pivot('strip', stripC)
      .part('strip', [strip], 'sign', { pivot: 'strip', receiveShadow: false });
    if (!o.low) b.part('cloth', cloth, 'toon', { perCopy: true });
    var tpl = b
      .anchor('top', [0, topOf(ctx, 1.6), 0])
      .anchor('spot', [X(PB.camX), 0, 0.42])
      .anchor('strip', [stripC[0] + s * PB.stripOut, PB.stripY, PB.stripZ])
      .anchor('sign', [0, PB.headerY, PB.headerFront + 0.06])
      .anchor('lens', [lensP[0], lensP[1], lensP[2] + 0.05])
      .anchor('bulbs', [lensP[0], lensP[1], lensP[2] + 0.02])
      .done();
    return finish(ctx.K, tpl, lb, trim, {
      sign: frameX(textP, PB.text[0], PB.text[1], 0),
      strip: frameX(stripC, PB.stripW, PB.stripH, 0)
    });
  }

  /* ---------- Boba Café ---------- */
  function buildBoba(ctx) {
    var o = ops(ctx), G = o.G, c = colorsOf(ctx, DEF.bld_boba), v = variantOf(ctx), trim = trimFor('bld_boba', v);
    var R = trim.signSide === 'R', F = BB.front, KX = BB.kioskX;
    var cupX = KX + (R ? BB.cupX : -BB.cupX), cz = BB.cupZ, tilt = R ? -BB.straw.tilt : BB.straw.tilt;
    var shell = [], pearl = [], lb = new LightsBuilder(G);
    /* the kiosk: body, white band, roof cap, teak counter, menu board on its right side */
    shell.push(o.arch(BB.kiosk[0], BB.kiosk[1], BB.kiosk[2], [KX, BB.kiosk[1] / 2, BB.kioskZ], c.body, true));
    shell.push(o.box(BB.band[0], BB.band[1], BB.band[2], [KX, BB.band[1] / 2, BB.kioskZ], c.band));
    shell.push(G.paint(G.t(G.slab(BB.cap[0], BB.cap[1], BB.cap[2], 0), { p: [KX, BB.capY, BB.kioskZ] }), c.body, 'shade'));
    shell.push(o.box(BB.counter[0], BB.counter[1], BB.counter[2], [KX, BB.counterY, F + BB.counter[2] / 2], c.counter));
    shell.push(o.box(BB.menu[0], BB.menu[1], BB.menu[2], [BB.menuX, BB.menuY, BB.menuZ], c.counter));
    /* the cup sign's mount */
    shell.push(o.tube(0.16, 0.16, 0.04, o.R(12, 10), [cupX, BB.mountY, cz], null, c.stool));
    /* the right cell: awning on 2 posts, bar table, 2 stools (mirrored by the sign side) */
    var mx = function (x) { return R ? 1 - x : x; };
    shell.push(o.box(BB.awning[0], BB.awning[1], BB.awning[2], [BB.awningX, BB.awningY, BB.awningZ], c.awning));
    BB.postZ.forEach(function (pz) { shell.push(o.tube(BB.postR, BB.postR, BB.awningY, 6, [BB.postX, BB.awningY / 2, pz], null, c.stool)); });
    var T = BB.table, tx = T.x + (R ? 0.06 : 0);
    shell.push(o.tube(T.topR, T.topR, T.top, o.R(12, 10), [tx, T.topY, T.z], null, c.table));
    shell.push(o.tube(T.stemR, T.stemR, T.topY, 6, [tx, T.topY / 2, T.z], null, c.stool));
    shell.push(o.tube(T.baseR, T.baseR, 0.02, o.R(10, 8), [tx, 0.01, T.z], null, c.stool));
    BB.stools.forEach(function (p) {
      shell.push(o.tube(BB.stoolR, BB.stoolR, 0.03, o.R(10, 8), [mx(p[0]), BB.stoolY, p[1]], null, c.stool));
      shell.push(o.tube(BB.stoolLegR, BB.stoolLegR, BB.stoolY, 5, [mx(p[0]), BB.stoolY / 2, p[1]], null, c.stool));
    });
    /* the frosted band above the liquid, the lid and two sheen streaks (pearl matcap) */
    var LQ = BB.liquid, FR = BB.frost, yTop = BB.cupY0 + LQ.h;
    pearl.push(o.tube(FR.rTop, FR.rBot, FR.h, o.R(14, 10), [cupX, yTop + FR.h / 2, cz], null, c.cup, true));
    pearl.push(G.paint(G.t(G.drop(BB.lidR, BB.lidH, [[1, 0], [0.9, 0.45], [0.55, 0.85], [0, 1]]), { p: [cupX, yTop + FR.h, cz] }), c.lid));
    [-30, -14].forEach(function (deg, j) {
      var rr = liquidR(BB.cupY0 + 0.21) + 0.003, a = deg * DEG;
      pearl.push(o.box(j ? 0.008 : 0.014, 0.3, 0.004, [cupX + rr * Math.sin(a), BB.cupY0 + 0.22, cz + rr * Math.cos(a)], c.cup, [0, deg, 0]));
    });
    /* lights: serving window, transom, the lit liquid, the member straw, awning neon, trim, menu icons */
    lb.add(o.face(BB.win[0], BB.win[1], [KX, BB.winY, F + 0.003], c.glass), 'window', c.glass, { tok2: c.glassGlow });
    lb.add(o.face(BB.transom[0], BB.transom[1], [KX, BB.transomY, F + 0.003], c.glass), 'window', c.glass, { tok2: c.glassGlow });
    lb.add(o.tube(LQ.rTop, LQ.rBot, LQ.h, o.R(14, 10), [cupX, BB.cupY0 + LQ.h / 2, cz], null, c.liquid, true), 'liquid', c.liquid, { tok2: c.glassGlow, shaded: true });
    lb.add(G.t(G.tube(BB.straw.r, BB.straw.r, BB.straw.len, { radial: o.R(8, 6) }), { r: [0, 0, -tilt], p: [cupX + (R ? -BB.straw.dx : BB.straw.dx), BB.straw.y, cz] }), 'member', c.straw, { shaded: true });
    lb.add(o.box(BB.awning[0], 0.012, 0.012, [BB.awningX, BB.awningY - 0.015, BB.awningZ + BB.awning[2] / 2 + 0.002], c.awningEdge), 'neon', c.awningEdge);
    lb.add(o.box(0.012, 0.012, BB.awning[2], [BB.awningX + BB.awning[0] / 2 + 0.002, BB.awningY - 0.015, BB.awningZ], c.awningEdge), 'neon', c.awningEdge);
    [c.liquid, c.awningEdge, c.band].forEach(function (tok, j) {
      lb.add(o.box(0.006, 0.05, 0.04, [BB.menuX + 0.009, BB.menuY + 0.08 - j * 0.08, BB.menuZ], tok), 'neon', tok);
    });
    var A = trim.accent, lines = [], kw = BB.kiosk[0];
    if (trim.stripe === 'A') lines.push(o.box(kw, 0.014, 0.008, [KX, BB.band[1] + 0.005, F + 0.009], A));
    else if (trim.stripe === 'B') [-1, 1].forEach(function (sx) { lines.push(o.box(0.012, 0.66, 0.008, [KX + sx * (kw / 2 - 0.014), 0.65, F + 0.009], A)); });
    else {
      lines.push(o.box(kw, 0.012, 0.008, [KX, 1.03, F + 0.009], A));
      lines.push(o.box(0.008, 0.012, BB.kiosk[2], [KX + kw / 2 + 0.004, 1.03, BB.kioskZ], A));
    }
    lines.forEach(function (gl) { lb.add(gl, 'accent', A); });
    /* the white shutter over the serving window (hinged at its top edge, 2 slat grooves, a teak pull),
       the pearls on the liquid wall, the served cup */
    var hinge = [KX, BB.hingeY, F + 0.014], hy = BB.hingeY - BB.hatch[1] / 2;
    var hatch = [o.box(BB.hatch[0], BB.hatch[1], BB.hatch[2], [KX, hy, F + 0.014], c.band),
      o.box(BB.handle[0], BB.handle[1], BB.handle[2], [KX, BB.hingeY - BB.hatch[1] + 0.05, F + 0.035], c.counter)];
    [-0.06, 0.06].forEach(function (dy) { hatch.push(G.paint(G.t(G.slab(BB.hatch[0] - 0.04, 0.008, 0.004, 0), { p: [KX, hy + dy, F + 0.026] }), c.body, 'shade')); });
    var pearls = [], pc = [cupX, BB.cupY0, cz];
    for (var k = 0; k < BB.pearls; k++) {
      var py = BB.pearlYs[k % 2], pa = (k * 360 / BB.pearls + 10) * DEG, pr = liquidR(py) + BB.pearlOut;
      pearls.push(o.bicone(BB.pearlR, BB.pearlH, 6, [cupX + pr * Math.sin(pa), py, cz + pr * Math.cos(pa)], c.pearl));
    }
    var SV = BB.served, sr = SV.rest;
    var served = [
      G.paintBy(G.t(G.tube(SV.r, SV.rb, SV.h, { radial: 8 }), { p: [sr[0], sr[1] + SV.h / 2, sr[2]] }), function (p) { return p.y < sr[1] + SV.h * 0.6 ? c.liquid : c.cup; }),
      o.tube(0, SV.r + 0.003, 0.02, 8, [sr[0], sr[1] + SV.h + 0.01, sr[2]], null, c.lid),
      o.tube(0.007, 0.007, 0.08, 4, [sr[0] + 0.01, sr[1] + SV.h + 0.04, sr[2]], [0, 0, -10], c.pearl)
    ];
    var tpl = ctx.K.template(ctx)
      .part('shell', shell, 'toon', { castShadow: true })
      .part('pearl', pearl, 'pearl', { castShadow: true })
      .part('lights', lb.geos, 'state', { perCopy: true })
      .pivot('hatch', hinge)
      .part('hatch', hatch, 'toon', { pivot: 'hatch' })
      .pivot('pearls', pc)
      .part('pearls', pearls, 'toon', { pivot: 'pearls' })
      .pivot('cup', sr)
      .part('cup', served, 'toon', { pivot: 'cup' })
      .anchor('top', [0, topOf(ctx, 1.95), 0])
      .anchor('spot', [KX, 0, 0.42])
      .anchor('seat', [mx(BB.stools[0][0]), BB.stoolY + 0.015, BB.stools[0][1]])
      .anchor('table', [tx, T.topY + T.top / 2, T.z])
      .anchor('cup', [cupX, BB.cupY0 + 0.3, cz - 0.3])
      .done();
    return finish(ctx.K, tpl, lb, trim, {});
  }

  /* ---------- LED Screen Tower ---------- */
  function buildTower(ctx) {
    var o = ops(ctx), G = o.G, c = colorsOf(ctx, DEF.bld_ledtower), v = variantOf(ctx), trim = trimFor('bld_ledtower', v);
    var s = trim.signSide === 'R' ? -1 : 1, shell = [], lb = new LightsBuilder(G), SC = LT.screen;
    /* in the screen's tilted frame: local (x, y, z) about the screen centre → item space */
    function onScreen(geo, p) { return G.t(G.t(geo, { p: p }), { r: [LT.tilt, 0, 0], p: SC }); }
    shell.push(archPaint(G, o.box(LT.plinth[0], LT.plinth[1], LT.plinth[2], [0, LT.plinth[1] / 2, 0], c.plinth), c.plinth, true));
    var legH = LT.legY1 - LT.legY0;
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (q) {
      shell.push(o.tube(LT.legR, LT.legR, legH, o.R(6, 5), [q[0] * LT.legX, LT.legY0 + legH / 2, q[1] * LT.legX], null, c.leg));
    });
    /* one X of bracing on each side */
    var y0 = LT.braceY[0], y1 = LT.braceY[1], L2 = LT.legX;
    [1, -1].forEach(function (zs) {
      shell.push(strut(o, -L2, y0, L2, y1, zs * L2, LT.braceW, c.brace));
      shell.push(strut(o, L2, y0, -L2, y1, zs * L2, LT.braceW, c.brace));
      shell.push(strut(o, -L2, y0, L2, y1, zs * L2, LT.braceW, c.brace, true));
      shell.push(strut(o, L2, y0, -L2, y1, zs * L2, LT.braceW, c.brace, true));
    });
    /* the service catwalk under the screen: a grating and a front rail on 2 posts */
    var W2 = LT.walk, wz = LT.walkZ + W2[2] / 2 - 0.01;
    shell.push(o.box(W2[0], W2[1], W2[2], [0, LT.walkY, LT.walkZ], c.brace));
    shell.push(o.box(W2[0], 0.014, 0.014, [0, LT.walkY + LT.railH, wz], c.ladder));
    [-1, 1].forEach(function (sx) { shell.push(o.box(0.014, LT.railH, 0.014, [sx * (W2[0] / 2 - 0.01), LT.walkY + LT.railH / 2, wz], c.ladder)); });
    /* the service ladder on the sign side's left face */
    var lx = -s * LT.ladderX, ly = (LT.ladderY[0] + LT.ladderY[1]) / 2, lh = LT.ladderY[1] - LT.ladderY[0];
    [-1, 1].forEach(function (zs) { shell.push(o.box(0.014, lh, 0.014, [lx, ly, zs * LT.rail], c.ladder)); });
    for (var r = 0; r < LT.rungs; r++) shell.push(o.box(0.012, 0.012, 2 * LT.rail, [lx, LT.ladderY[0] + 0.12 + r * 0.22, 0], c.ladder));
    /* the screen box, its cap and the antenna */
    shell.push(onScreen(archPaint(G, G.slab(LT.box[0], LT.box[1], LT.box[2], { arch: true }), c.bezel, false), [0, 0, 0]));
    shell.push(onScreen(o.box(LT.cap[0], LT.cap[1], LT.cap[2], [0, 0, 0], c.cap), [0, LT.box[1] / 2 + LT.cap[1] / 2, -0.01]));
    var A1 = LT.antenna;
    shell.push(o.tube(A1.r, A1.r, A1.y1 - A1.y0, 6, [0, (A1.y0 + A1.y1) / 2, -0.02], null, c.antenna));
    /* lights: the beacon and the trim lines (screen box edges or the front legs) */
    lb.add(o.bicone(LT.beaconR, LT.beaconH, o.R(8, 6), [0, LT.beaconY, -0.02], c.beacon), 'beacon', c.beacon);
    var A = trim.accent, lines = [], hw = LT.box[0] / 2, hh = LT.box[1] / 2, fz = LT.box[2] / 2 + 0.004;
    if (trim.stripe === 'A') lines.push(onScreen(o.box(LT.box[0] - 0.04, 0.014, 0.008, [0, 0, 0], A), [0, -hh + 0.015, fz]));
    else if (trim.stripe === 'B') [-1, 1].forEach(function (sx) { lines.push(onScreen(o.box(0.012, LT.box[1] - 0.06, 0.008, [0, 0, 0], A), [sx * (hw - 0.012), 0, fz])); });
    else [-1, 1].forEach(function (sx) { lines.push(o.box(0.01, legH - 0.1, 0.01, [sx * LT.legX, LT.legY0 + legH / 2, LT.legX + LT.legR + 0.004], A)); });
    lines.forEach(function (gl) { lb.add(gl, 'accent', A); });
    /* the two LED tiles and the scanline band (camouflaged in the bezel at rest) */
    var tz = LT.faceZ, ta = onScreen(o.face(LT.tile[0], LT.tile[1], [0, 0, 0], c.screen), [0, LT.tileY, tz]);
    var tb = onScreen(o.face(LT.tile[0], LT.tile[1], [0, 0, 0], c.screen), [0, -LT.tileY, tz]);
    var band = onScreen(o.box(LT.band[0], LT.band[1], LT.band[2], [0, 0, 0], c.bezel), [0, LT.bandY, tz + 0.006]);
    var tl = LT.tilt * DEG;
    var face = function (y) { return [0, SC[1] + y * Math.cos(tl) - tz * Math.sin(tl), SC[2] + y * Math.sin(tl) + tz * Math.cos(tl)]; };
    var screenC = face(0), bandC = face(LT.bandY);
    var tpl = ctx.K.template(ctx)
      .part('shell', shell, 'toon', { castShadow: true })
      .pivot('beacon', [0, LT.beaconY, -0.02])
      .part('lights', lb.geos, 'state', { perCopy: true, pivot: 'beacon' })
      .pivot('screen', screenC)
      .part('screen', [ta], 'led', { pivot: 'screen', receiveShadow: false })
      .part('screen2', [tb], 'led', { pivot: 'screen', receiveShadow: false })
      .pivot('wipe', bandC, 'screen')
      .part('band', [band], 'toon', { pivot: 'wipe' })
      .anchor('top', [0, topOf(ctx, 2.5), 0])
      .anchor('spot', [0, 0, 0.42])
      .anchor('glow', [0, SC[1], SC[2] - 0.2])
      .anchor('screenFront', [screenC[0], screenC[1], screenC[2] + 0.08])
      .done();
    return finish(ctx.K, tpl, lb, trim, {
      screen: frameX(face(LT.tileY), LT.tile[0], LT.tile[1], LT.tilt),
      screen2: frameX(face(-LT.tileY), LT.tile[0], LT.tile[1], LT.tilt)
    });
  }

  /* ---------- Recording Studio ---------- */
  function buildStudio(ctx) {
    var o = ops(ctx), G = o.G, c = colorsOf(ctx, DEF.bld_recording), v = variantOf(ctx), trim = trimFor('bld_recording', v);
    var s = trim.signSide === 'R' ? -1 : 1, X = function (x) { return x * s; }, F = RS.front;
    var shell = [], lb = new LightsBuilder(G);
    shell.push(o.arch(RS.block[0], RS.block[1], RS.block[2], [0, RS.blockY, RS.blockZ], c.body, false));
    shell.push(archPaint(G, o.box(RS.plinth[0], RS.plinth[1], RS.plinth[2], [0, RS.plinth[1] / 2, RS.blockZ], c.plinth), c.plinth, true));
    /* door + handle, the ON AIR frame */
    shell.push(o.box(RS.door[0], RS.door[1], RS.door[2], [X(RS.doorX), RS.doorY, F + RS.door[2] / 2], c.door));
    shell.push(o.box(0.02, 0.12, 0.02, [X(RS.doorX + 0.11), RS.doorY, F + 0.03], c.porthole));
    shell.push(o.box(RS.frame[0], RS.frame[1], RS.frame[2], [X(RS.doorX), RS.onairY, F + RS.frame[2] / 2], c.door));
    /* the acoustic foam panel: 3 × 4 square pyramids in alternating shade */
    shell.push(o.box(RS.foam[0], RS.foam[1], RS.foam[2], [X(RS.foamX), RS.foamY, F + RS.foam[2] / 2], c.foam));
    RS.studRows.forEach(function (y, ri) {
      RS.studCols.forEach(function (dx, ci) {
        var g = G.t(G.t(G.cone(RS.stud.r, RS.stud.h, 4), { r: [90, 0, 0] }), { r: [0, 0, 45], p: [X(RS.foamX + dx), y, F + RS.foam[2] + RS.stud.h / 2] });
        shell.push(G.paint(g, c.foam, (ri + ci) % 2 ? 'shade' : 'hi'));
      });
    });
    /* the porthole ring and the VU housing */
    shell.push(G.paint(G.t(G.ring(RS.ringR, RS.ringr), { p: [X(RS.portX), RS.portY, F + 0.012] }), c.porthole));
    shell.push(o.box(RS.housing[0], RS.housing[1], RS.housing[2], [X(RS.vuX), RS.vuY, F + RS.housing[2] / 2], c.door));
    /* lights: ON AIR box, the porthole's lit back wall, VU segments, the roof LED line, trim */
    lb.add(o.face(RS.backing[0], RS.backing[1], [X(RS.doorX), RS.onairY, F + RS.frame[2] + 0.001], c.signOff), 'onair', c.signOff, { tok2: c.sign });
    lb.add(G.t(G.tube(0, RS.glassR, 0.002, { radial: o.R(16, 12), open: true }), { r: [90, 0, 0], p: [X(RS.portX), RS.portY, F + 0.004] }), 'window', c.glass, { tok2: c.glassGlow });
    for (var b = 0; b < RS.bars; b++) {
      for (var j = 0; j < RS.segs; j++) {
        lb.add(o.box(RS.seg[0], RS.seg[1], RS.seg[2], [X(RS.vuX + (b - 1) * RS.barStep), RS.segY0 + j * RS.segStep, F + RS.housing[2] + RS.seg[2] / 2], c.meterLo),
          'vu', c.meterLo, { tok2: c.meterHi, idx: b * 8 + j });
      }
    }
    lb.add(o.box(RS.block[0], 0.012, 0.012, [0, RS.blockY + RS.block[1] / 2 - 0.002, F + 0.004], c.body), 'roof', c.body, { tok2: 'LED Cyan' });
    var A = trim.accent, lines = [], bw = RS.block[0];
    if (trim.stripe === 'A') lines.push(o.box(bw, 0.014, 0.008, [0, 0.9, F + 0.004], A));
    else if (trim.stripe === 'B') [-1, 1].forEach(function (sx) { lines.push(o.box(0.012, 0.5, 0.008, [X(RS.portX) + sx * 0.26, RS.portY, F + 0.004], A)); });
    else {
      lines.push(o.box(bw, 0.012, 0.008, [0, RS.plinth[1] + 0.008, F + 0.004], A));
      lines.push(o.box(0.012, 0.86, 0.008, [X(-0.4), RS.blockY, F + 0.004], A));
    }
    lines.forEach(function (gl) { lb.add(gl, 'accent', A); });
    /* the peak bar (pivot 'meter') */
    var needleP = [X(RS.vuX), RS.needleY, F + RS.housing[2] + 0.008];
    var needle = o.box(RS.needle[0], RS.needle[1], RS.needle[2], needleP, c.meterHi);
    /* the mic on its stand inside the porthole (pivot 'mic' at the stand's foot) */
    var MC = RS.mic, mz = F + MC.z, mx = X(RS.portX), micP = [mx, MC.y0, mz];
    var mic = [
      o.tube(0.03, 0.036, 0.012, 8, [mx, MC.y0 + 0.006, mz], null, c.mic),
      o.tube(0.007, 0.007, MC.stand, 6, [mx, MC.y0 + MC.stand / 2, mz], null, c.mic),
      G.paint(G.t(G.drop(MC.headR, MC.headH, [[0, 0], [0.8, 0.15], [1, 0.5], [0.8, 0.85], [0, 1]]), { r: [15, 0, 0], p: [mx, MC.y0 + MC.stand, mz] }), c.mic)
    ];
    /* the giant headphones over the roof (pivot 'phones'): cups, violet cushions, the band arc */
    var PH = RS.phones, phones = [];
    [-1, 1].forEach(function (sx) {
      phones.push(G.paint(G.t(G.tube(PH.cupR, PH.cupR, PH.cupW, { radial: o.R(14, 10) }), { r: [0, 0, 90], p: [sx * PH.x, PH.y, RS.blockZ] }), c.cup));
      phones.push(G.paint(G.t(G.tube(PH.cushR, PH.cushR, PH.cushW, { radial: o.R(14, 10) }), { r: [0, 0, 90], p: [sx * (PH.x - PH.cupW / 2 - PH.cushW / 2), PH.y, RS.blockZ] }), c.ring, 'hi'));
    });
    var arc = [];
    for (var q = 0; q <= 8; q++) { var an = PI - q * PI / 8; arc.push([PH.bandR * Math.cos(an), PH.bandY + PH.bandR * Math.sin(an), RS.blockZ]); }
    phones.push(G.paint(G.ribbon(arc, PH.bandr, { segments: o.R(16, 12) }), c.band));
    var phonesP = [0, RS.blockY + RS.block[1] / 2, RS.blockZ];
    var textP = [X(RS.doorX), RS.onairY, F + RS.frame[2] + 0.004];
    var tpl = ctx.K.template(ctx)
      .part('shell', shell, 'toon', { castShadow: true })
      .part('sign', [o.face(RS.text[0], RS.text[1], textP, c.sign)], 'sign', {})
      .part('lights', lb.geos, 'state', { perCopy: true })
      .pivot('meter', needleP)
      .part('meter', [needle], 'state', { pivot: 'meter' })
      .pivot('mic', micP)
      .part('mic', mic, 'toon', { pivot: 'mic' })
      .pivot('phones', phonesP)
      .part('phones', phones, 'toon', { pivot: 'phones' })
      .anchor('top', [0, topOf(ctx, 1.85), 0])
      .anchor('spot', [X(RS.doorX), 0, 0.42])
      .anchor('onair', [textP[0], textP[1], textP[2] + 0.06])
      .anchor('porthole', [mx, RS.portY + 0.1, F + 0.1])
      .anchor('ringL', [-(PH.x - 0.08), PH.y, RS.blockZ + 0.17])
      .anchor('ringR', [PH.x - 0.08, PH.y, RS.blockZ + 0.17])
      .done();
    return finish(ctx.K, tpl, lb, trim, { sign: frameX(textP, RS.text[0], RS.text[1], 0) });
  }

  /* ================================================================
     FACTORY — SL3D.defineModels('city', K → {id: {build, idle, act, show, material, forget}})
     ================================================================ */
  /* a number from a LOOK entry (the LOOK wins over this file's defaults) */
  function lookNum(id, path, dflt) {
    var v = lookOf(id);
    for (var i = 0; v && i < path.length; i++) v = v[path[i]];
    return typeof v === 'number' && isFinite(v) ? v : dflt;
  }

  function factory(K) {
    var hasDoc = typeof document !== 'undefined' && !!document && typeof document.createElement === 'function';
    var THREE = K && K.THREE;
    /* tunables the LOOK table carries */
    var TUNE = {
      clothAmp: lookNum('bld_photobooth', ['idle', 'amp'], PB.clothAmp),
      beaconHz: lookNum('bld_ledtower', ['idle', 'hz'], LT.beaconHz), beaconMin: lookNum('bld_ledtower', ['idle', 'min'], LT.beaconMin),
      scroll: lookNum('bld_ledtower', ['loops', 0, 'speed'], LT.scroll),
      autoBars: lookNum('bld_ledtower', ['show', 'screen', 'autoBars'], LT.autoBars),
      dayLevel: lookNum('bld_ledtower', ['show', 'screen', 'dayLevel'], LT.dayLevel)
    };

    /* ---------- colours (linear rgb, cached; the member colour is a runtime colour) ---------- */
    var pal = new Map();
    function rgb(tok) {
      var v = pal.get(tok);
      if (!v) {
        var x = K && typeof K.col === 'function' ? K.col(tok) : null;
        v = x ? [x.r, x.g, x.b] : [1, 1, 1];
        pal.set(tok, v);
      }
      return v;
    }
    var memberRgb = new Map();
    /* the sign side of a copy's trim (+1 L, −1 R), from its template's layout */
    function sideOf(a) { var lay = layoutOf(a && a.template); return lay ? lay.side : 1; }
    function memberColor(hex) {
      if (!hex) return rgb('@member');
      var v = memberRgb.get(hex);
      if (!v) {
        var x = K && typeof K.rgb === 'function' ? K.rgb(hex) : null;
        v = x ? [x.r, x.g, x.b] : rgb('@member');
        memberRgb.set(hex, v);
      }
      return v;
    }
    var SUN = (function () {
      var L = looks(), p = (L && L.DUSK && L.DUSK.sunPos) || [-9, 7.5, 8], l = Math.sqrt(p[0] * p[0] + p[1] * p[1] + p[2] * p[2]);
      return [p[0] / l, p[1] / l, p[2] / l];
    }());

    /* ---------- the lights writer ---------- */
    var geoStates = typeof WeakMap === 'function' ? new WeakMap() : new Map();
    function geoState(geo, lay) {
      var gs = geoStates.get(geo);
      if (gs && gs.lay === lay) return gs;
      var na = attr(geo, 'normal'), gains = null;
      if (na && na.array && lay.segs.some(function (sg) { return sg.shaded; })) {
        gains = new Float32Array(lay.n);
        for (var i = 0; i < lay.n; i++) {
          var d = na.array[i * 3] * SUN[0] + na.array[i * 3 + 1] * SUN[1] + na.array[i * 3 + 2] * SUN[2];
          gains[i] = 0.72 + 0.28 * (d > 0 ? d : 0);
        }
      }
      gs = { lay: lay, last: new Float32Array(lay.segs.length * 3).fill(-1), gains: gains };
      geoStates.set(geo, gs);
      return gs;
    }
    var _c3 = [0, 0, 0];
    function mixInto(a, b, k, f, out) { out[0] = lerp(a[0], b[0], k) * f; out[1] = lerp(a[1], b[1], k) * f; out[2] = lerp(a[2], b[2], k) * f; return out; }
    /* V: {k, accent, member, glow, bulbs[], beacon, onAir, vu[]} */
    function segColor(sg, V, out) {
      var k = V.k, neon = lerp(NEON_DAY, 1, k);
      switch (sg.role) {
        case 'accent': return mixInto(V.accent, V.accent, 0, neon, out);
        case 'neon': return mixInto(rgb(sg.tok), rgb(sg.tok), 0, neon, out);
        case 'window': return mixInto(rgb(sg.tok), rgb(sg.tok2), V.glow, 1, out);
        case 'bulb': return mixInto(rgb(sg.tok), rgb(sg.tok2), clamp01(V.bulbs[sg.idx] || 0), 1, out);
        case 'beacon': return mixInto(rgb(sg.tok), rgb(sg.tok), 0, V.beacon, out);
        case 'onair': return mixInto(rgb(sg.tok), rgb(sg.tok2), clamp01(V.onAir), 1, out);
        case 'liquid': {
          var base = rgb(sg.tok), lit = rgb(sg.tok2);
          for (var i = 0; i < 3; i++) out[i] = lerp(base[i] * 0.92, (base[i] + lit[i]) * 0.5, k);
          return out;
        }
        case 'member': return mixInto(V.member, V.member, 0, lerp(0.92, 1, k), out);
        case 'roof': return mixInto(rgb(sg.tok), rgb(sg.tok2), smooth(0.2, 1, k), 1, out);
        case 'vu': {
          var bar = (sg.idx / 8) | 0, seg = sg.idx % 8, lv = clamp01((V.vu[bar] || 0) * RS.segs - seg);
          var lo = rgb(sg.tok), hi = rgb(sg.tok2), g = seg / (RS.segs - 1), f = lerp(0.16, 1, lv);
          for (var j = 0; j < 3; j++) out[j] = lerp(lo[j], hi[j], g) * f;
          return out;
        }
      }
      out[0] = out[1] = out[2] = 1;
      return out;
    }
    function writeLights(a, V) {
      var lay = layoutOf(a && a.template), geo = copyGeo(a, 'lights');
      if (!lay || !geo) return false;
      var ca = attr(geo, 'color');
      if (!ca || !ca.array || ca.array.length !== lay.n * 3) return false;
      var gs = geoState(geo, lay), arr = ca.array, changed = false;
      for (var i = 0; i < lay.segs.length; i++) {
        var sg = lay.segs[i], o = i * 3;
        segColor(sg, V, _c3);
        if (Math.abs(gs.last[o] - _c3[0]) < 1e-4 && Math.abs(gs.last[o + 1] - _c3[1]) < 1e-4 && Math.abs(gs.last[o + 2] - _c3[2]) < 1e-4) continue;
        gs.last[o] = _c3[0]; gs.last[o + 1] = _c3[1]; gs.last[o + 2] = _c3[2];
        var st = sg.start, en = sg.start + sg.count, gn = sg.shaded ? gs.gains : null;
        for (var vtx = st; vtx < en; vtx++) {
          var g = gn ? gn[vtx] : 1, p = vtx * 3;
          arr[p] = _c3[0] * g; arr[p + 1] = _c3[1] * g; arr[p + 2] = _c3[2] * g;
        }
        changed = true;
      }
      if (changed) ca.needsUpdate = true;
      return changed;
    }
    /* the per-copy light values; the trim accent follows the live member colour on the island */
    function values(s, a, lay) {
      var V = s.V || (s.V = { k: 0, accent: null, member: null, glow: 0, bulbs: new Float32Array(PB.bulbs), beacon: 0.8, onAir: 0, vu: [0, 0, 0] });
      var k = s.k, hex = memberOf(s, a);
      V.k = k; V.glow = glowAt(k);
      V.member = memberColor(hex);
      var acc = lay && lay.accent;
      V.accent = !acc || acc === '@member' ? V.member : rgb(acc);
      return V;
    }
    /* halos (night ones grow in with k, so they never pop at full size) and the uplight decal */
    function glow(a, id, s) {
      if (!a || isCard(a)) return;
      var G2 = GLOW[id], k = s.k;
      if (typeof a.halo === 'function') {
        for (var i = 0; i < G2.halos.length; i++) {
          var h = G2.halos[i], on = h[3] ? true : k > HALO_ON;
          var size = Math.round(h[2] * (h[3] ? lerp(0.75, 1, k) : lerp(0.55, 1, smooth(HALO_ON, 1, k))) * 20) / 20;
          safe(a.halo, a, h[0], on, size, h[1]);
        }
      }
      if (typeof a.decal === 'function' && !s.decal) { s.decal = true; safe(a.decal, a, true, G2.decal); }
    }
    function stateMap() {
      var m = new Map();
      return {
        get: function (a) {
          var s = m.get(a.uid);
          if (!s) { s = { k: showOf(a), V: null, decal: false }; m.set(a.uid, s); }
          return s;
        },
        forget: function (uid) { m.delete(uid); }
      };
    }

    /* ---------- textures and materials (browser only; null in Node) ---------- */
    function hexOf(tok) { return K && typeof K.hex === 'function' ? K.hex(tok) : '#888888'; }
    function canvas(w, h) {
      if (!hasDoc) return null;
      var cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      return cv.getContext && cv.getContext('2d') ? cv : null;
    }
    function canvasTexture(cv, nearest) {
      if (!cv || !THREE || typeof THREE.CanvasTexture !== 'function') return null;
      var t = new THREE.CanvasTexture(cv);
      t.colorSpace = THREE.SRGBColorSpace;
      t.generateMipmaps = false;
      t.minFilter = THREE.LinearFilter;
      t.magFilter = nearest ? THREE.NearestFilter : THREE.LinearFilter;
      return t;
    }
    function signAtlas() { try { return K && typeof K.signAtlas === 'function' ? K.signAtlas() : null; } catch (e) { return null; } }
    function ledAtlas() { try { return K && typeof K.ledAtlas === 'function' ? K.ledAtlas() : null; } catch (e) { return null; } }
    function variant(key, name, patch) { try { return K && typeof K.variant === 'function' ? K.variant(key, name, patch) : null; } catch (e) { return null; } }
    /* Every material and view this file keeps from the kit is keyed to the live atlas texture.
       SLIsland3D.dispose({keepKit: false}) disposes the kit's materials and both atlases (the next
       mount draws new ones for the child then playing) but never re-runs this factory: a tile, the
       ON AIR sibling or the strip kept from the old kit would sample the old canvas — the previous
       child's name — and sit outside the kit's dispose list. The 'sign' / 'led' siblings live
       exactly as long as their atlas, so its texture is the key. */
    function texOf(A) { return (A && A.texture) || null; }
    var mats = {};
    function signMat(word) { var A = signAtlas(); return A && typeof A.material === 'function' ? A.material(word) : null; }
    /* the ON AIR text dims with the light (its own sibling of the shared sign material) */
    function onAirMat() {
      var A = signAtlas(), key = texOf(A);
      if (mats.onair !== undefined && mats.onairAt === key) return mats.onair;
      mats.onairAt = key;
      var tex = A && typeof A.view === 'function' ? A.view('ON AIR') : null;
      return (mats.onair = tex ? variant('sign', 'city:onair', { map: tex }) : null);
    }

    /* the photo strip: one 128×256 canvas, redrawn only on a tap (and blanked when the kit is
       disposed, so the next child's booth never shows the last child's strip) */
    var strip = { cv: null, ctx: null, tex: null, mat: undefined, at: null, key: '', emoji: null, draws: 0, imgs: new Map() };
    function stripMat() {
      var key = texOf(signAtlas());
      if (strip.mat !== undefined && strip.at === key) return strip.mat;
      if (strip.mat === undefined) {
        strip.cv = canvas(128, 256);
        strip.ctx = strip.cv ? strip.cv.getContext('2d') : null;
        strip.tex = canvasTexture(strip.cv, false);
      }
      strip.at = key; strip.key = ''; strip.emoji = null;
      if (strip.ctx) paintStrip(null, null);
      strip.mat = strip.tex ? variant('sign', 'city:strip', { map: strip.tex }) : null;
      return strip.mat;
    }
    function petImage(id, frame) {
      var key = id + '|' + frame, img = strip.imgs.get(key), ART = root.SLWorldArt;
      if (img || !hasDoc || typeof Image !== 'function' || !ART || typeof ART.petDataUrl !== 'function') return img || null;
      img = new Image();
      img.onload = function () { if (strip.key.indexOf(id + '|') === 0) paintStrip(id, strip.emoji); };
      img.src = ART.petDataUrl(id, { frame: frame });
      strip.imgs.set(key, img);
      return img;
    }
    function spark4(ctx2, x, y, r, col) {
      ctx2.fillStyle = col;
      ctx2.beginPath(); ctx2.moveTo(x, y - r);
      ctx2.quadraticCurveTo(x + r * 0.14, y - r * 0.14, x + r, y); ctx2.quadraticCurveTo(x + r * 0.14, y + r * 0.14, x, y + r);
      ctx2.quadraticCurveTo(x - r * 0.14, y + r * 0.14, x - r, y); ctx2.quadraticCurveTo(x - r * 0.14, y - r * 0.14, x, y - r);
      ctx2.fill();
    }
    function paintStrip(petId, emoji) {
      var g = strip.ctx;
      if (!g) return;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.fillStyle = hexOf('Bone White'); g.fillRect(0, 0, 128, 256);
      STRIP_FRAMES.forEach(function (r, i) {
        g.fillStyle = hexOf(STRIP_BG[i]); g.fillRect(r.x, r.y, r.w, r.h);
        if (i < 3) {
          var P = STRIP_POSES[i], img = petId ? petImage(petId, P.frame) : null;
          if (img && img.complete && img.naturalWidth) {
            var h = 48, w = h * 1.2;
            g.save();
            g.beginPath(); g.rect(r.x, r.y, r.w, r.h); g.clip();
            g.translate(r.x + r.w / 2, r.y + r.h - 4 - P.lift - h / 2);
            if (P.rot) g.rotate(P.rot * DEG);
            if (P.flip) g.scale(-1, 1);
            g.drawImage(img, -w / 2, -h / 2, w, h);
            g.restore();
          } else spark4(g, r.x + r.w / 2, r.y + r.h / 2, 14, hexOf('Neon Magenta'));
        } else {
          /* the kit's emoji face canvas (its 1×1 data fallback is not drawable: the ✦ stands in) */
          var face = emoji && K.tex && typeof K.tex.emojiFace === 'function' ? K.tex.emojiFace(emoji) : null, im = face && face.image;
          if (im && typeof im.getContext === 'function') g.drawImage(im, r.x + r.w / 2 - 25, r.y + 3, 50, 50);
          else spark4(g, r.x + r.w / 2, r.y + r.h / 2, 16, hexOf('LED Cyan'));
        }
      });
      if (strip.tex) strip.tex.needsUpdate = true;
    }
    function drawStrip(a) {
      strip.draws++;
      stripMat();
      var pet = petOf(a), em = emojiOf(a);
      strip.key = (pet || '-') + '|' + (em || '-');
      strip.emoji = em;
      paintStrip(pet, em);
    }

    /* the LED tower: two live tiles (main + companion) and the pet pixel-art textures */
    var led = [null, null], ledAt = null, petTex = new Map(), _w = { rx: 0, ry: 0, ox: 0, oy: 0 };
    function liveTile(i) {
      var A = ledAtlas(), key = texOf(A);
      if (key !== ledAt) { led[0] = led[1] = null; ledAt = key; }      /* a new kit: new tiles on its atlas */
      if (led[i] !== null) return led[i] || null;
      var tex = A && typeof A.view === 'function' ? A.view(i ? 'eq' : 'name', 0) : null;
      var m = tex ? variant('led', 'city:led:' + i, { map: tex }) : null;
      led[i] = m ? { mat: m, atlas: tex, prog: '', phase: -1, level: -1 } : false;
      return led[i] || null;
    }
    function petTexture(id) {
      if (petTex.has(id)) return petTex.get(id);
      var cv = canvas(256, 64), t = null;
      if (cv) {
        var g = cv.getContext('2d'), L = looks(), col = L && L.LOCKED && L.LOCKED.PETCOL && L.LOCKED.PETCOL[id];
        var map = { b: col && col.body, d: col && col.dark, l: col && col.light, n: col && col.nose, e: hexOf('Midnight Ink') };
        for (var f = 0; f < 2; f++) {
          var ox = f * 128;
          g.fillStyle = hexOf('Midnight Ink'); g.fillRect(ox, 0, 128, 64);
          (PET_PIXELS[id] || PET_PIXELS.pet_puppy).forEach(function (row, y) {
            for (var x = 0; x < row.length; x++) { var cc = map[row[x]]; if (cc) { g.fillStyle = cc; g.fillRect(ox + 22 + x * 3, 6 + y * 3, 3, 3); } }
          });
          SPARK_PIXELS[f].forEach(function (row, y) {
            for (var x = 0; x < row.length; x++) if (row[x] === 'x') { g.fillStyle = hexOf('LED Cyan'); g.fillRect(ox + 86 + x * 4, 22 + y * 4, 4, 4); }
          });
          g.fillStyle = hexOf('Laser Lime'); g.fillRect(ox + 8, 58, 112, 2);
        }
        t = canvasTexture(cv, true);
        if (t) t.repeat.set(0.5, 1);
      }
      petTex.set(id, t);
      return t;
    }
    /* show program `prog` at `phase` on tile i (only when it changes; no allocation) */
    function setTile(i, prog, phase, petId) {
      var T = liveTile(i), A = ledAtlas();
      if (!T || !A) return;
      if (T.prog === prog && Math.abs(T.phase - phase) < 1e-6) return;
      if (prog === 'pet') {
        var pt = petTexture(petId);
        if (!pt) return;
        if (T.mat.map !== pt) T.mat.map = pt;
        pt.offset.set(phase, 0);
      } else {
        if (T.mat.map !== T.atlas) T.mat.map = T.atlas;
        A.window(prog, phase, _w);
        T.atlas.repeat.set(_w.rx, _w.ry); T.atlas.offset.set(_w.ox, _w.oy);
      }
      T.prog = prog; T.phase = phase;
    }
    function tileLevel(level) {
      for (var i = 0; i < 2; i++) {
        var T = liveTile(i);
        if (T && Math.abs(T.level - level) > 1e-4) { T.level = level; if (T.mat.color && T.mat.color.setScalar) T.mat.color.setScalar(level); }
      }
    }
    /* a photocard copy: swap its own meshes to the shared, non-personal materials (once per object) */
    var cardsDone = typeof WeakSet === 'function' ? new WeakSet() : new Set();
    function cardMaterials(a, swaps) {
      var o = a && a.object, ms = o && o.userData && o.userData.meshes;
      if (!ms || cardsDone.has(o)) return;
      cardsDone.add(o);
      Object.keys(swaps).forEach(function (part) { var m = swaps[part](); if (m && ms[part]) ms[part].material = m; });
    }

    /* ================================================================
       Photo Booth
       ================================================================ */
    var pbBook = makeBook(), pbS = stateMap(), clothStates = typeof WeakMap === 'function' ? new WeakMap() : new Map();
    var _lensP = [0, 0, 0];
    function boothLights(a, s) {
      var V = values(s, a, layoutOf(a && a.template)), t = timeOf(a), reduced = !!a.reduced;
      for (var i = 0; i < PB.bulbs; i++) V.bulbs[i] = s.bulbAct ? s.bulbAct[i] : isCard(a) ? 0 : boothChase(t, i, s.k, reduced);
      writeLights(a, V);
    }
    /* a re-tap never strobes the bulb ring: the bulbs lit when it lands stay lit and the new
       countdown only adds to them until it is full (a restart used to drop the lit third to 0 for
       0.1 s, so a child tapping 5 times a second blinked it at 5 Hz). This keeps what the copy
       shows now (V.bulbs) for the restart. */
    function holdBulbs(a, s) {
      if (!s.V) return null;
      var held = s.held || (s.held = new Float32Array(PB.bulbs));
      held.set(s.V.bulbs);
      s.heldAt = timeOf(a);
      return held;
    }
    /* the curtain: a CPU flutter from the rod down, plus the act's kick (per-copy geometry) */
    function clothState(geo) {
      if (!geo) return null;
      var cs = clothStates.get(geo);
      if (cs) return cs;
      var pa = attr(geo, 'position');
      if (!pa || !pa.array) return null;
      var base = new Float32Array(pa.array), xmin = Infinity, xmax = -Infinity;
      for (var i = 0; i < base.length; i += 3) { xmin = Math.min(xmin, base[i]); xmax = Math.max(xmax, base[i]); }
      cs = { base: base, xmin: xmin, span: Math.max(1e-6, xmax - xmin), t: NaN, kick: NaN, still: false };
      clothStates.set(geo, cs);
      return cs;
    }
    function waveCloth(a, s, reduced) {
      var geo = copyGeo(a, 'cloth'), cs = clothState(geo);
      if (!cs) return false;
      var t = timeOf(a), kick = reduced ? 0 : s.kick || 0;
      if (cs.t === t && cs.kick === kick) return false;
      if (reduced && cs.still) return false;
      cs.t = t; cs.kick = kick;
      var M2 = mo(), pa = attr(geo, 'position'), arr = pa.array, base = cs.base, ph = phaseOf(a), kz = Math.sin(kick * DEG) * PB.curtainH;
      for (var i = 0; i < base.length; i += 3) {
        var u = clamp01((PB.curtainTop - base[i + 1]) / PB.curtainH), w = (base[i] - cs.xmin) / cs.span;
        var dz = (M2 ? M2.flutter(t, TUNE.clothAmp, PB.clothHz, u, ph + w * 0.35, reduced) : 0) + u * kz;
        arr[i] = base[i]; arr[i + 1] = base[i + 1]; arr[i + 2] = base[i + 2] + dz;
      }
      cs.still = !!reduced;
      pa.needsUpdate = true;
      return true;
    }
    function stripPose(a, s) {
      var sd = sideOf(a);
      pose(a, 'strip', 0, 0, 0, sd * PB.stripOut * clamp01(s.strip), 0, 0, 1, 1, 1);
    }
    function lensAt(a) {
      var sd = sideOf(a);
      _lensP[0] = sd * PB.camX; _lensP[1] = PB.lensY; _lensP[2] = PB.front + 0.012 + PB.bezelD + 0.03;
      return _lensP;
    }
    function bloomOff(a, s) { if (s.bloomOn) { s.bloomOn = false; if (typeof a.halo === 'function') safe(a.halo, a, 'lens', false, 0.5, 'Window Warm'); } }
    /* the lens bloom runs on its own clock from s.bloomAt (so a re-tap neither cuts nor repeats it):
       the halo for PB.bloomHalo s and a lens pop that swells in 0.25 s and settles by 0.75 s */
    function bloomEnv(dt) {
      if (!(dt >= 0) || dt >= 0.75) return 0;
      return dt < 0.25 ? 1 - (1 - dt / 0.25) * (1 - dt / 0.25) : 1 - ((dt - 0.25) / 0.5) * ((dt - 0.25) / 0.5);
    }
    function lensTick(a, s) {
      var dt = s.bloomAt == null ? -1 : timeOf(a) - s.bloomAt;
      if (s.bloomOn && !(dt < PB.bloomHalo)) bloomOff(a, s);
      var sc = 1 + PB.bloomScale * (s.popCut ? 0 : bloomEnv(dt));
      if (sc === s.lensSc) return;
      s.lensSc = sc;
      if (sc === 1) rest(a, 'flash'); else pose(a, 'flash', 0, 0, 0, 0, 0, 0, sc, sc, sc);
    }
    function snapApply(h, out, tt, rec) {
      var s = pbS.get(h), now = timeOf(h);
      s.bulbAct = s.bulbAct || new Float32Array(PB.bulbs);
      for (var i = 0; i < PB.bulbs; i++) {
        var b = boothBulb(i, out.bulbs, tt), hb = rec.bulbFrom;
        s.bulbAct[i] = hb && tt < COUNTDOWN && hb[i] > b ? hb[i] : b;      /* a restart keeps its lit bulbs */
      }
      /* this act's own bloom moment (an envelope carried over from an interrupted act is not one):
         at most one local bloom per RATE.bloom s per booth */
      if (tt >= 1.45 && out.bloom > 0.01 && !rec.bloomTried) {
        rec.bloomTried = true;
        if (!rec.o.reduced && allow(s.bloomAt, now, rate().bloom)) {
          /* the island's fx bloom (a smooth swell and fade, rate-limited per item) when the handle
             offers one (island3d a.bloom); else this booth's own halo for PB.bloomHalo s */
          var viaFx = typeof h.bloom === 'function' && safe(h.bloom, h, 'lens', 0.5, 'Window Warm') === true;
          s.bloomAt = now; s.bloomOn = !viaFx; s.popCut = false;
          if (!viaFx && typeof h.halo === 'function') safe(h.halo, h, 'lens', true, 0.5, 'Window Warm');
        }
      }
      lensTick(h, s);
      /* the strip: an interrupted strip slides back in over 0.3 s before the new one comes out */
      var from = rec.o.from && typeof rec.o.from.strip === 'number' ? rec.o.from.strip : (rec.carryStrip || 0);
      s.strip = Math.max(out.strip, from * (1 - inOut(tt / 0.3)));
      stripPose(h, s);
      s.kick = out.curtain || 0;
      waveCloth(h, s, rec.o.reduced);
      if (tt >= rec.dur) { s.bulbAct = null; s.stripAt = now; s.strip = 1; s.kick = 0; }
      boothLights(h, s);
    }
    function snapRest(h) {
      var s = pbS.get(h);
      holdBulbs(h, s);                     /* the controller's re-tap cancels first, then restarts */
      s.bulbAct = null; s.strip = 0; s.stripAt = null; s.kick = 0;
      /* the bloom's clock (s.bloomAt) stays, so a restart still honours the 1.5 s gap */
      s.popCut = true; s.lensSc = 1;
      rest(h, 'flash'); rest(h, 'strip');
      bloomOff(h, s);
      waveCloth(h, s, !!h.reduced);
      boothLights(h, s);
    }
    var booth = {
      build: buildBooth,
      idle: function (a) {
        if (!a) return false;
        var s = pbS.get(a), reduced = !!a.reduced, now = timeOf(a), live = pbBook.live(a.uid);
        if (isCard(a)) { s.k = showOf(a); boothLights(a, s); waveCloth(a, s, true); return false; }
        var moved = waveCloth(a, s, reduced);
        if (!live) {
          /* the strip waits STRIP_SEC, then slides back into its slot (instantly under reduced motion) */
          if (s.stripAt != null && s.strip > 0) {
            var over = now - (s.stripAt + stripSec());
            if (over >= 0) {
              s.strip = reduced ? 0 : 1 - inOut(over / PB.retract);
              if (s.strip <= 0) { s.strip = 0; s.stripAt = null; }
              stripPose(a, s); moved = true;
            }
          }
          lensTick(a, s);
        }
        boothLights(a, s);
        return !reduced || moved;
      },
      act: function (a, name) {
        if (!a) return null;
        var reduced = !!a.reduced, s = pbS.get(a), carry = s.strip, now = timeOf(a);
        /* the bulbs to hold through a restart: a live act superseded now, or the one whose cancel
           (the controller's re-tap) rested them a moment ago */
        var held = pbBook.live(a.uid) ? holdBulbs(a, s) : s.heldAt != null && Math.abs(now - s.heldAt) <= CARRY_WINDOW ? s.held : null;
        s.heldAt = null;
        drawStrip(a);
        if (!reduced) askPet(a, 'pose');
        var act = pbBook.start(a, {
          name: 'snap', reduced: reduced, apply: snapApply, rest: snapRest,
          emitAt: function (h) { return lensAt(h); }
        });
        var rec = act ? pbBook.live(a.uid) : null;
        /* a re-tap after the strip came out: it slides back in before the new strip */
        if (rec && carry > 0 && !rec.o.from) rec.carryStrip = carry;
        if (rec && held && !reduced) rec.bulbFrom = new Float32Array(held);
        return act;
      },
      show: function (a, k) {
        if (!a) return;
        var s = pbS.get(a);
        s.k = clamp01(+k || 0);
        boothLights(a, s);
        glow(a, 'bld_photobooth', s);
      },
      material: function (matKey, part) {
        if (!part) return null;
        if (part.name === 'sign') return signMat('PHOTO');
        if (part.name === 'strip') return stripMat();
        return null;
      },
      forget: function (uid) { pbS.forget(uid); pbBook.forget(uid); },
      _strip: strip
    };

    /* ================================================================
       Boba Café
       ================================================================ */
    var bbBook = makeBook(), bbS = stateMap(), _pp = {}, _cup = [0, 0, 0], _seat = [0, 0, 0];
    function bobDy(a, reduced) {
      var M2 = mo(), lk = lookOf('bld_boba'), id = lk && lk.idle;
      if (!M2 || reduced) return 0;
      return (M2.bob(timeOf(a), id && id.pct || 2, id && id.period || 2.4, phaseOf(a), false) - 1) * BB.liquid.h;
    }
    function pearlsPose(a, swirl, reduced) {
      pearlPose(swirl, bobDy(a, reduced), _pp);
      if (_pp.ry === 0 && _pp.dy === 0 && _pp.s === 1) { rest(a, 'pearls'); return; }
      pose(a, 'pearls', 0, _pp.ry, 0, 0, _pp.dy, 0, _pp.s, 1, _pp.s);
    }
    function bobaLights(a, s) { writeLights(a, values(s, a, layoutOf(a && a.template))); }
    function serveApply(h, out, tt, rec) {
      var s = bbS.get(h);
      pose(h, 'hatch', -out.hatch, 0, 0, 0, 0, 0, 1, 1, 1);
      if (out.cupA <= 1e-3) rest(h, 'cup');
      else {
        var r = BB.served.rest, sc = Math.max(1e-3, out.cupA);
        cupPath(out.cup, sideOf(h) < 0 ? 'R' : 'L', _cup);
        pose(h, 'cup', 0, 0, 0, _cup[0] - r[0], _cup[1] - r[1], _cup[2] - r[2], sc, sc, sc);
      }
      pearlsPose(h, out.swirl, rec.o.reduced);
      bobaLights(h, s);
    }
    function serveRest(h) { rest(h, 'hatch'); rest(h, 'cup'); pearlsPose(h, 0, !!h.reduced); }
    var boba = {
      build: buildBoba,
      idle: function (a) {
        if (!a) return false;
        var s = bbS.get(a), reduced = !!a.reduced;
        if (isCard(a)) { s.k = showOf(a); bobaLights(a, s); return false; }
        if (!bbBook.live(a.uid)) pearlsPose(a, 0, reduced);
        bobaLights(a, s);
        return !reduced;
      },
      act: function (a, name) {
        if (!a) return null;
        var reduced = !!a.reduced;
        if (!reduced) askPet(a, 'sip');
        return bbBook.start(a, {
          name: 'serve', reduced: reduced, apply: serveApply, rest: serveRest,
          emitAt: function (h) { var T = BB.table; _seat[0] = T.x + (sideOf(h) < 0 ? 0.06 : 0); _seat[1] = T.topY + 0.2; _seat[2] = T.z; return _seat; }
        });
      },
      show: function (a, k) {
        if (!a) return;
        var s = bbS.get(a);
        s.k = clamp01(+k || 0);
        bobaLights(a, s);
        glow(a, 'bld_boba', s);
      },
      forget: function (uid) { bbS.forget(uid); bbBook.forget(uid); }
    };

    /* ================================================================
       LED Screen Tower
       ================================================================ */
    var ltBook = makeBook(), ltS = stateMap(), _wp = {}, WIPE_O = { reduced: false };
    function towerLights(a, s) {
      var V = values(s, a, layoutOf(a && a.template));
      V.beacon = breathe(timeOf(a), TUNE.beaconHz, TUNE.beaconMin, phaseOf(a), !!a.reduced || isCard(a));
      writeLights(a, V);
    }
    function towerProgram(s) { return CYCLE[s.prog | 0] || 'name'; }
    /* advance to the next program, at most once per RATE.screen s */
    function advance(a, s) {
      var now = timeOf(a);
      if (!allow(s.progAt, now, rate().screen)) return false;
      s.prog = nextProgram(s.prog | 0, !!(petOf(a) && petTexture(petOf(a))));
      s.progAt = now;
      return true;
    }
    function drawScreen(a, s) {
      if (isCard(a)) return;
      var reduced = !!a.reduced, t = timeOf(a), prog = towerProgram(s), pet = petOf(a);
      if (prog === 'pet' && !(pet && petTexture(pet))) { s.prog = nextProgram(s.prog | 0, false); prog = towerProgram(s); }
      var bn = beatIndex(s, a), bf = a && typeof a.beat === 'number' ? frac(a.beat) : 0, ph = phaseOf(a);
      setTile(0, prog, programPhase(prog, t, bn, bf, ph, reduced, TUNE.scroll), pet);
      var comp = COMPANION[prog];
      setTile(1, comp, programPhase(comp, t, bn, bf, ph + 0.37, reduced, TUNE.scroll), pet);
      tileLevel(lerp(TUNE.dayLevel, 1, s.k));
    }
    /* the scanline wipe (the act's, or the Showtime auto-advance's): band down the tiles + a slight squash */
    function wipePose(a, out) {
      var tl = LT.tilt * DEG, d = LT.travel * out.wipe;
      if (!(out.band > 1e-3)) { rest(a, 'wipe'); rest(a, 'screen'); return; }
      pose(a, 'wipe', 0, 0, 0, 0, -d * Math.cos(tl), -d * Math.sin(tl), 1, Math.max(1e-3, out.band), 1);
      var q = 1 - LT.squash * out.band;
      pose(a, 'screen', 0, 0, 0, 0, 0, 0, 1, q, 1);
    }
    function screenApply(h, out, tt, rec) {
      var s = ltS.get(h);
      wipePose(h, out);
      if (out.prog >= 1 && !rec.flipped) { rec.flipped = true; advance(h, s); }
      drawScreen(h, s);
      towerLights(h, s);
    }
    function screenRest(h) { rest(h, 'wipe'); rest(h, 'screen'); }
    var tower = {
      build: buildTower,
      idle: function (a) {
        if (!a) return false;
        var s = ltS.get(a), reduced = !!a.reduced, now = timeOf(a);
        if (isCard(a)) { s.k = showOf(a); cardTower(a); towerLights(a, s); return false; }
        if (!ltBook.live(a.uid)) {
          /* Showtime: the next program every LT.autoBars bars, with the same scanline wipe */
          var bar = a.bar | 0, grp = Math.floor(bar / TUNE.autoBars);
          if (!reduced && s.k >= 0.5) {
            if (s.autoGroup == null) s.autoGroup = grp;
            else if (grp !== s.autoGroup) { s.autoGroup = grp; s.wipeT0 = now; s.wipeFlip = false; }
          } else s.autoGroup = null;
          if (s.wipeT0 != null) {
            var tw = now - s.wipeT0, M2 = mo();
            if (tw >= 0.5 || !M2) { s.wipeT0 = null; screenRest(a); }
            else {
              M2.sample('screen', tw, _wp, WIPE_O);
              wipePose(a, _wp);
              if (_wp.prog >= 1 && !s.wipeFlip) { s.wipeFlip = true; advance(a, s); }
            }
          }
        }
        drawScreen(a, s);
        towerLights(a, s);
        return !reduced;
      },
      act: function (a, name) {
        if (!a) return null;
        var s = ltS.get(a);
        s.wipeT0 = null;
        return ltBook.start(a, {
          name: 'screen', reduced: !!a.reduced, apply: screenApply, rest: screenRest,
          emitAt: function () { return 'screenFront'; }
        });
      },
      show: function (a, k) {
        if (!a) return;
        var s = ltS.get(a);
        s.k = clamp01(+k || 0);
        if (isCard(a)) cardTower(a); else drawScreen(a, s);
        towerLights(a, s);
        glow(a, 'bld_ledtower', s);
      },
      material: function (matKey, part) {
        if (!part) return null;
        if (part.name === 'screen') { var T0 = liveTile(0); return T0 ? T0.mat : null; }
        if (part.name === 'screen2') { var T1 = liveTile(1); return T1 ? T1.mat : null; }
        return null;
      },
      forget: function (uid) { ltS.forget(uid); ltBook.forget(uid); },
      _program: function (uid) { var s = ltS.get({ uid: uid }); return towerProgram(s); }
    };
    function starsMat() { var A = ledAtlas(); return A && typeof A.material === 'function' ? A.material('stars') : null; }
    var TOWER_CARD = { screen: starsMat, screen2: starsMat };
    function cardTower(a) { cardMaterials(a, TOWER_CARD); }

    /* ================================================================
       Recording Studio
       ================================================================ */
    var rsBook = makeBook(), rsS = stateMap();
    var STUDIO_CARD = { sign: function () { return signMat('ON AIR'); } };
    function studioLights(a, s) {
      var V = values(s, a, layoutOf(a && a.template));
      V.onAir = isCard(a) ? 1 : s.onAir || 0;
      for (var b = 0; b < RS.bars; b++) V.vu[b] = s.vu ? s.vu[b] : 0;
      writeLights(a, V);
      var m = onAirMat(), lv = lerp(0.42, 1, V.onAir);
      if (s.textMat !== m) { s.textMat = m; s.textLv = null; }          /* a rebuilt sibling (new kit) is not dimmed yet */
      if (m && m.color && m.color.setScalar && !isCard(a) && Math.abs((s.textLv == null ? -1 : s.textLv) - lv) > 1e-4) { s.textLv = lv; m.color.setScalar(lv); }
      if (!isCard(a) && typeof a.halo === 'function') {
        var on = V.onAir > 0.5;
        if (s.onairHalo !== on) { s.onairHalo = on; safe(a.halo, a, 'onair', on, 0.35, 'Neon Magenta'); }
      }
    }
    function recordApply(h, out, tt, rec) {
      var s = rsS.get(h), reduced = rec.o.reduced, bn = beatIndex(s, h), bf = typeof h.beat === 'number' ? frac(h.beat) : 0;
      s.onAir = out.onAir;
      s.vu = s.vu || [0, 0, 0];
      var M2 = mo(), peak = 0;
      for (var b = 0; b < RS.bars; b++) { s.vu[b] = M2 ? M2.vu(b, bn, bf, out.level, reduced) : 0; peak = Math.max(peak, s.vu[b]); }
      pose(h, 'meter', 0, 0, 0, 0, RS.needleTravel * peak, 0, 1, 1, 1);
      /* the mic sways and the phones bob with the beat, scaled by the act's level (≤ 1.97 Hz) */
      var beatWave = Math.sin(TAU * bf), lv = reduced ? 0 : out.level;
      pose(h, 'mic', 0, 0, RS.mic.sway * lv * beatWave, 0, 0, 0, 1, 1, 1);
      pose(h, 'phones', 0, 0, 0, 0, RS.phones.bob * lv * (0.5 - 0.5 * Math.cos(TAU * bf)), 0, 1, 1, 1);
      if (tt >= rec.dur) { s.vu[0] = s.vu[1] = s.vu[2] = 0; rest(h, 'meter'); rest(h, 'mic'); rest(h, 'phones'); }
      studioLights(h, s);
    }
    function recordRest(h) {
      var s = rsS.get(h);
      if (s.vu) s.vu[0] = s.vu[1] = s.vu[2] = 0;
      rest(h, 'meter'); rest(h, 'mic'); rest(h, 'phones');
      studioLights(h, s);
    }
    function musicDrop(a) {
      var m = a && a.music, Mus = root.SLMusic;
      if (!m || m.playing === false || !Mus || typeof Mus.drop !== 'function') return false;
      try { Mus.drop(); return true; } catch (e) { return false; }
    }
    var studio = {
      build: buildStudio,
      idle: function (a) {
        if (!a) return false;
        var s = rsS.get(a), reduced = !!a.reduced, now = timeOf(a), moved = false;
        if (isCard(a)) { s.k = showOf(a); cardMaterials(a, STUDIO_CARD); studioLights(a, s); return false; }
        if (!rsBook.live(a.uid) && s.tapAt != null) {
          /* ON AIR stays lit ON_AIR_SEC after the tap, then fades (instantly under reduced motion) */
          var over = now - (s.tapAt + onAirSec());
          var lv = over < 0 ? 1 : reduced ? 0 : 1 - inOut(over / RS.fade);
          if (lv <= 0) { lv = 0; s.tapAt = null; }
          if (lv !== s.onAir) { s.onAir = lv; moved = true; }
        }
        studioLights(a, s);
        return moved;
      },
      act: function (a, name) {
        if (!a) return null;
        var s = rsS.get(a);
        s.tapAt = timeOf(a);
        musicDrop(a);
        return rsBook.start(a, {
          name: 'record', reduced: !!a.reduced, apply: recordApply, rest: recordRest,
          emitAt: function () { return 'porthole'; }
        });
      },
      show: function (a, k) {
        if (!a) return;
        var s = rsS.get(a);
        s.k = clamp01(+k || 0);
        if (isCard(a)) cardMaterials(a, STUDIO_CARD);
        studioLights(a, s);
        glow(a, 'bld_recording', s);
      },
      material: function (matKey, part) { return part && part.name === 'sign' ? onAirMat() : null; },
      forget: function (uid) { rsS.forget(uid); rsBook.forget(uid); }
    };
    return { bld_photobooth: booth, bld_boba: boba, bld_ledtower: tower, bld_recording: studio };
  }

  return {
    VERSION: VERSION, IDS: IDS, factory: factory,
    LAYOUT: freezeAll({ bld_photobooth: PB, bld_boba: BB, bld_ledtower: LT, bld_recording: RS }), DEFAULT_COLORS: freezeAll(DEF),
    GLOW: freezeAll(GLOW), NEON_DAY: NEON_DAY, POP_GUARD: POP_GUARD,
    CYCLE: Object.freeze(CYCLE.slice()), COMPANION: Object.freeze(COMPANION), PET_PIXELS: freezeAll(PET_PIXELS), SPARK_PIXELS: freezeAll(SPARK_PIXELS),
    STRIP_FRAMES: Object.freeze(STRIP_FRAMES), STRIP_POSES: freezeAll(STRIP_POSES), STRIP_BG: Object.freeze(STRIP_BG.slice()),
    /* pure helpers */
    variantOf: variantOf, trimFor: trimFor, faceUV: faceUV, frameX: frameX, boothBulb: boothBulb, boothChase: boothChase,
    breathe: breathe, cupPath: cupPath, liquidR: liquidR, pearlPose: pearlPose, nextProgram: nextProgram,
    programPhase: programPhase, beatIndex: beatIndex, voiceStep: voiceStep, layoutOf: layoutOf, makeBook: makeBook
  };
}));
