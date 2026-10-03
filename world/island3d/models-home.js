/* ================================================================
   My Island 3D — home models (classic script; THREE only through K).
   Island architecture chunk 5, Encore City v2 chunk B4. Registers, through
   SL3D.defineModels('home', factory):
     house_cottage                          the 2×2 home, assembled from cached sub-parts
     wall_* · roof_* · door_* · detail_* · shape_*   every CATALOG home style; SL3D.make(styleId, st)
                                            previews that style on the player's own house
                                            (photocards), using SLIslandLook.resolveStyle
   In Node, module.exports is the pure layer below (no THREE): style resolution and keys,
   per-shape layouts, budgets and the idle/act timelines (tests).

   FIVE HOME SHAPES (houseState.shape; the default is SLIslandLook.SLOT_DEFAULTS.shape, the loft).
   Item space: pivot at the footprint centre, base y = 0, facing +z; every part stays inside
   ±0.93 so the 2×2 footprint keeps its 0.07 margin. Heights follow SLIslandLook.HOUSE_H
   [shape][roof] (all ≤ 2.9). The avatar spot is the left entrance cell for every shape.
     shape_cottage  the v1 gabled house: the same layout and parts, re-materialised (crisp 0.05
                    bevel, no ink hull, Smoked Glass windows, Gunmetal frames and door surround);
                    its stateKey is the exact v1 key 'wall|roof|door|d:…'
     shape_loft     City loft (the default): a lower box under a cantilevered upper box that
                    makes a porch (Teak soffit, 3 downlights), a floor-to-ceiling glass wall, a
                    ribbon window, a parapet roof and an LED Cyan line under it at night
     shape_villa    Beach villa: a long main wing, a side wing holding the door, a Teak deck round
                    a plunge pool (a ripple ring every 2.4 s, tinted toward LED Cyan at night) and a lounger
     shape_tower    Neon tower: three storeys on a Concrete plinth, an annex with a Gunmetal zig-zag
                    stair, and a tall sign with a member-colour ✦ and the child's initial (drawn by
                    K.signAtlas(); island copies only, photocards show the ✦), breathing 70–100% at
                    0.5 Hz at Showtime. The sign faces the camera on stand-off brackets: a blade
                    square to the wall would be edge-on to the default view
     shape_dome     Sky dome: a drum, a faceted dome (the crown), a glass pod and an antenna (2.25 for
                    every roof), a Gunmetal equator ring with an LED band (a NEON3 hue travelling at
                    0.25 Hz at Showtime), 4 portholes and an airlock door that SLIDES 0.36 u
   Every non-cottage shape has 2 trims from the stateKey's v: window rhythm and accent-panel side.

   THE ROOF SLOT IS EACH SHAPE'S CROWN, so every roof name stays true on every shape:
     cottage  the v1 gable prism (red tile rows · blue slates · candy icing), thatch loaf, castle
     flat     loft, tower — red: terracotta coping + a tiled pent roof (and a tiled canopy over the
              tower door) · blue: slate coping, fascia and pent · thatch: a straw pergola cushion
              with a tuft fringe · candy: icing coping, 12 drips, 24 sprinkles, a cherry on the
              front-left corner · castle: crenels + 2 corner turrets with Castle Cone spires
     hip      villa — the five finishes on hip roofs; castle = flat crenellated wings + 2 turrets
     dome     dome — terracotta latitude rings · slate bands · lumpy straw with a 16-tuft fringe ·
              pink icing drips with the cherry on the pod · a Castle Stone crenel ring + 2 turrets
   The castle always hides the rooftop flag (houseState drops it).

   DETAILS (a data-driven anchor table per shape): window boxes under the main glazing ·
   chimney (the v1 brick stack on the cottage, a steel flue elsewhere; the same puffs) · fairy
   lights (11 bulbs along the front parapet, eave or dome) · flag on the highest point (on the
   dome's antenna) · detail_neon: a member-colour neon core along every roof edge, steady at
   golden hour, a 1 Hz chase at Showtime (each segment lit once per 4 steps); its glow is 4
   '@member' halos rather than an additive sleeve mesh, which keeps every house ≤ 6 parts.

   TEMPLATE PARTS (partsFor(state) ≤ 6; static materials: toon + state)
     shell  toon, selection hull, casts shadows   masses, crowns, frames (modern shapes fold their
                                                  small trims in here)
     trim   toon, no shadow (the cottage only, as v1)
     window state, stateColor 'windowGlow' (Smoked Glass → Window Warm; DUSK 0.6 → SHOW 1)
     door   toon | gold | smoked, pivot 'door', selection hull
     bulb   state, perCopy — every CPU-lit lamp (fairy bulbs, neon, downlights, LED lines, pool,
            ripple, sign, LED band, antenna tip): vertex colour = lamp colour × its baked shade
     anim   toon, perCopy — chimney puffs + flag pennant, CPU positions/colours
     sign   'sign' (the K.signAtlas texture), perCopy, the tower only — the initial; built
            collapsed and opened by show()/idle() for island copies only
   Pivots: door (hinge; the dome's door centre), emitter, flag, glow, plus the shape's own (villa
   pool, tower sign, dome ring + tip). Anchors: top, door, spot and the halo anchors (bulb0…10,
   neon0…3, down0…2, deck0…2, pool, sign, ring, tip). perCopy parts carry their vertex layout in
   geometry.userData.slHome, so a cloned copy knows its own lamps, puffs and quad.

   HANDLERS {build, idle, act, show, animated, handle, material, forget} (one set for every id)
     idle(a)        CPU puffs / pennant / lamps / sign, gold-door glints; true when it moved
                    something. Reads a.t, a.dt, a.phase, a.reduced, a.show, a.bpm, a.member ('#hex':
                    the child's colour; else a.user.color; else the look's MEMBER_FALLBACK) and
                    a.personal (default: island batch copies only show the child's initial).
     act(a, name)   'home' opens the door (a 70° swing, or the dome's 0.36 u slide) in 0.3 s, holds
                    HOLD s and closes by itself; 'homeClose' closes it from wherever it is; 'homeSwing'
                    = open, short hold, close → {name, dur, update(a, tAct) → alive, cancel()}. It
                    plays the SLMotion 'home' cues except the opening 'pop' (the controller's tap
                    squish owns it) and pops 3 hearts at the shape's 'door' anchor.
     show(a, k)     window glow, lamp colours, halos and the tower's initial for the Showtime mix k.
     animated(st | stateKey) → true when the copy needs idle ticks.
     handle(obj, o) a minimal handle for an Object3D from SL3D.make (photocards / lab); o.member,
                    o.user, o.personal pass through.
     material(key, part)   the tower initial's sign-atlas material (tinted with the member colour).
     forget(uid)    drops a copy's memory (door pose, glow, halos).
   The handle is read defensively: copy geometry via a.copyGeometry(part) | a.geometry(part) |
   a.batch.copyGeometry(a.uid, part) | a.object.userData.meshes; the style via a.stateKey | a.st |
   a.template | a.batch.template | a.object.userData; pivot(name) may return the documented
   {set(rotDeg, pos, scale)}, an Object3D or the batch's Matrix4.
   ================================================================ */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.SLHome3D = api;
    if (root.SL3D && typeof root.SL3D.defineModels === 'function') root.SL3D.defineModels('home', api.factory);
  }
}(typeof self !== 'undefined' ? self : typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var VERSION = 2;
  var HOME = 'house_cottage';
  var COTTAGE = 'shape_cottage';
  var DEFAULTS = { wall: 'wall_cream', roof: 'roof_red', door: 'door_blue', shape: 'shape_loft' };
  var WALLS = ['wall_cream', 'wall_pink', 'wall_mint', 'wall_sky', 'wall_lilac', 'wall_concrete', 'wall_gallery', 'wall_graphite', 'wall_midnight'];
  var ROOFS = ['roof_red', 'roof_blue', 'roof_thatch', 'roof_candy', 'roof_castle'];
  var DOORS = ['door_blue', 'door_red', 'door_green', 'door_gold', 'door_glass'];
  var DETAILS = ['detail_chimney', 'detail_flag', 'detail_lights', 'detail_neon', 'detail_windowbox'];
  var SHAPES = ['shape_cottage', 'shape_loft', 'shape_villa', 'shape_tower', 'shape_dome'];
  var STYLE_IDS = WALLS.concat(ROOFS, DOORS, DETAILS, SHAPES);
  var PARTS = ['shell', 'trim', 'window', 'door', 'bulb', 'anim', 'sign'];
  var MAX_PARTS = 6;

  /* ---------------- the cottage (v1 dimensions, unchanged; u, item space) ---------------- */
  var BODY = { w: 1.6, h: 1.1, d: 1.3, z: -0.15, front: 0.5, skirt: 0.2, skirtTone: -0.06 };
  var WIN = { x: 0.44, y: 0.72, w: 0.3, h: 0.28 };
  var DOOR = { w: 0.42, h: 0.62, y0: 0.06, z0: 0.505, t: 0.05, hinge: -0.21, open: 70 };
  var GABLE = { w: 0.88, eave: 1.04, apex: 2.23, zf: 0.6, zb: -0.9 };
  var LIP = { y: 1.12, rx: 0.82, rz: 0.66, r: 0.1, z: -0.15 };
  var LOAF = { y: 1.35, hw: 0.78, hh: 0.95, z: -0.15, len: 1.24, cap: 0.4 };
  var CASTLE = { slabTop: 1.24, tx: 0.68, tz: 0.25, tr: 0.22, th: 2.1, coneTop: 2.78, top: 2.9 };
  var SMOKE = { n: 3, period: 2.4, rise: 0.6, r: 0.075, drift: [0.12, -0.04] };
  var LIGHTS = { n: 11, x: 0.84, span: 0.8, sag: 0.085, hang: 0.03, dayHz: 0.5, groups: 3, wire: 16 };
  var FLAG = { x: 0, z: -0.3, y0: 2.2, top: 2.78, w: 0.3, h: 0.18, amp: 0.04, hz: 2 };
  var GLINT = { period: 4, n: 2, pos: [[-0.1, 0.6, 0.58], [0.12, 0.3, 0.6]] };
  var HOLD = { home: 2.4, swing: 0.6 };      /* open 0.3 + hold + close 0.3: 'home' stays ≤ 3 s */
  var SPOT = [-0.5, 0, 1.5];                 /* the avatar's spot: left entrance cell (SLGrid3D.avatarSpot) */
  var MAX_HZ = 2;
  var SHOW_BEAT_HZ = 118 / 60;
  var SLIDE = 0.36;                          /* the dome's door slides this far (a position change, never a turn) */
  var MARGIN = 0.93;                         /* every part stays inside ±MARGIN */

  /* ---------------- the modern shapes (u, item space; boxes are x0 x1 · y0 y1 · z0 z1) ---------------- */
  function bx(x0, x1, y0, y1, z0, z1) { return { x0: x0, x1: x1, y0: y0, y1: y1, z0: z0, z1: z1 }; }
  var SHAPE = {
    shape_loft: {
      family: 'flat',
      lower: bx(-0.63, 0.87, 0, 0.95, -0.845, 0.405),
      upper: bx(-0.855, 0.495, 0.95, 1.75, -0.525, 0.625),            /* overhangs the door by 0.22: the porch */
      crown: { x0: -0.855, x1: 0.495, z0: -0.525, z1: 0.625, P: 1.75, t: 0.06, h: 0.12 },
      pergola: { x0: -0.62, x1: 0.22, z0: -0.4, z1: 0.5 },
      door: { kind: 'swing', x: -0.38, w: 0.34, h: 0.72, y0: 0.06, z: 0.405, t: 0.045 },
      step: bx(-0.6, -0.16, 0, 0.06, 0.405, 0.6),
      glass: [{ x0: 0.02, x1: 0.8, y0: 0.08, y1: 0.86, cols: 2, rows: 1 }, { x0: 0.02, x1: 0.8, y0: 0.08, y1: 0.86, cols: 3, rows: 2 }],
      ribbon: [{ x0: -0.8, x1: 0.25, y0: 1.2, y1: 1.52, cols: 1, rows: 1 }, { x0: -0.53, x1: 0.44, y0: 1.18, y1: 1.5, cols: 3, rows: 1 }],
      accent: [{ x0: 0.29, x1: 0.47, y0: 1.04, y1: 1.56, n: 4 }, { x0: -0.83, x1: -0.57, y0: 1.04, y1: 1.56, n: 5 }],
      down: [[-0.68, 0.93, 0.52], [-0.38, 0.93, 0.52], [-0.08, 0.93, 0.52]],
      led: { x0: -0.835, x1: 0.475, y: 1.585, z: 0.632 },
      chimney: { x: 0.33, z: -0.36, y0: 1.6, top: 2.25 },
      flag: { x: -0.77, z: -0.44, y0: 1.6, rise: 0.45 },
      lights: { kind: 'line', x0: -0.83, x1: 0.47, y: 1.725, z: 0.645, sag: 0.05, span: [-0.79, 0.43] }
    },
    shape_villa: {
      family: 'hip',
      main: bx(-0.86, 0.86, 0, 0.72, -0.86, -0.08),
      side: bx(-0.86, -0.14, 0, 0.72, -0.15, 0.55),
      deck: bx(-0.13, 0.87, 0, 0.06, -0.08, 0.87),
      pool: bx(0.105, 0.735, 0.03, 0.045, 0.22, 0.7),                 /* coping edges on plank seams */
      ripple: { x: 0.42, y: 0.049, z: 0.46, r: 0.17 },
      lounger: bx(-0.1, 0.08, 0.06, 0.15, 0.25, 0.7),
      sliders: [{ x0: -0.06, x1: 0.84, y0: 0.08, y1: 0.58, cols: 2, rows: 1 }, { x0: -0.06, x1: 0.84, y0: 0.08, y1: 0.58, cols: 3, rows: 1 }],
      door: { kind: 'swing', x: -0.5, w: 0.34, h: 0.5, y0: 0.04, z: 0.55, t: 0.04 },
      transom: { x0: -0.67, x1: -0.33, y0: 0.57, y1: 0.66, cols: 4, rows: 1 },
      porthole: [{ x: -0.24, y: 0.4, r: 0.07 }, { x: -0.77, y: 0.4, r: 0.07 }],
      accent: [{ x0: -0.845, x1: -0.69, y0: 0.06, y1: 0.66, n: 3 }, { x0: -0.31, x1: -0.155, y0: 0.06, y1: 0.66, n: 3 }],
      hips: [{ x0: -0.87, x1: 0.87, z0: -0.87, z1: 0.03, y0: 0.72, apex: 1.18 }, { x0: -0.87, x1: -0.12, z0: -0.19, z1: 0.6, y0: 0.72, apex: 1.13 }],
      deckLights: [[0.84, 0.075, 0.12], [0.84, 0.075, 0.84], [-0.112, 0.075, 0.84]],
      chimney: { x: 0.55, z: -0.62, y0: 0.8, top: 1.6 },
      flag: { x: 0.3, z: -0.42, y0: 1.05, top: 1.75 },
      lights: { kind: 'line', x0: -0.08, x1: 0.84, y: 0.71, z: 0.06, sag: 0.045, span: [-0.05, 0.81] }
    },
    shape_tower: {
      family: 'flat',
      plinth: bx(-0.87, 0.14, 0, 0.32, -0.825, 0.3),
      body: bx(-0.87, 0.11, 0.32, 2.37, -0.825, 0.225),
      annex: bx(0.11, 0.87, 0, 0.85, -0.8, 0.15),
      crown: { x0: -0.87, x1: 0.11, z0: -0.825, z1: 0.225, P: 2.37, t: 0.06, h: 0.12 },
      pergola: { x0: -0.7, x1: 0.0, z0: -0.62, z1: 0.1 },
      steps: [bx(-0.62, -0.14, 0, 0.107, 0.3, 0.5), bx(-0.62, -0.14, 0.107, 0.213, 0.3, 0.4)],
      door: { kind: 'swing', x: -0.38, w: 0.36, h: 0.66, y0: 0.32, z: 0.225, t: 0.045 },
      floors: [1.0, 1.68],
      sign: { x0: -0.84, x1: -0.54, y0: 1.08, y1: 1.88, z0: 0.255, z1: 0.33 },
      windows: [
        [{ x0: -0.42, x1: 0.07, y0: 1.14, y1: 1.54, cols: 3, rows: 2 }, { x0: -0.42, x1: 0.07, y0: 1.8, y1: 2.18, cols: 3, rows: 2 },
          { x0: -0.13, x1: 0.06, y0: 0.46, y1: 0.86, cols: 1, rows: 2 }],
        [{ x0: -0.42, x1: -0.2, y0: 1.1, y1: 1.58, cols: 1, rows: 3 }, { x0: -0.15, x1: 0.07, y0: 1.1, y1: 1.58, cols: 1, rows: 3 },
          { x0: -0.42, x1: -0.2, y0: 1.78, y1: 2.18, cols: 1, rows: 3 }, { x0: -0.15, x1: 0.07, y0: 1.78, y1: 2.18, cols: 1, rows: 3 }]
      ],
      accent: [{ x0: 0.16, x1: 0.44, y0: 0.06, y1: 0.42, n: 5, face: 0.15 }, { x0: -0.13, x1: 0.06, y0: 0.42, y1: 0.92, n: 4, face: 0.225 }],
      annexWin: { x0: 0.52, x1: 0.82, y0: 0.4, y1: 0.72, cols: 2, rows: 1 },
      stair: { x0: 0.8, x1: 0.3, n: 6, z0: 0.16, z1: 0.34, top: 0.85 },
      chimney: { x: 0.62, z: -0.52, y0: 0.85, top: 1.6 },
      flag: { x: -0.77, z: -0.725, y0: 2.29, top: 2.86 },
      lights: { kind: 'line', x0: -0.85, x1: 0.09, y: 2.345, z: 0.245, sag: 0.05, span: [-0.81, 0.05] }
    },
    shape_dome: {
      family: 'dome',
      zc: -0.02, R: 0.84, drum: 0.6, rise: 0.9, top: 2.25,
      pod: { y: 1.66, r: 0.2, collar: 1.53 },
      antenna: { y0: 1.84, y1: 2.2, r: 0.015, tip: 0.035 },
      portal: { x0: -0.31, x1: 0.31, z0: 0.46, z1: 0.87, y1: 0.47 },       /* an arch of radius 0.31 above y1 */
      pocket: bx(-0.64, -0.31, 0, 0.7, 0.44, 0.87),
      door: { kind: 'slide', x: 0, w: 0.4, h: 0.66, y0: 0.04, z: 0.87, t: 0.032, arch: true, slide: SLIDE, dir: -1 },
      portholes: [[155, 25, 210, -30], [155, 25, 210, -30]], capsule: [false, true], porthole: { y: 0.32, r: 0.12 },
      accent: [58, 196],
      ledStrip: { x: -0.6, y0: 0.14, y1: 0.6, z: 0.875 },
      chimney: { x: 0.52, z: -0.21, y0: 1.0, top: 1.75 },
      flag: { x: 0.015, z: -0.02, y0: 1.98, top: 2.16, pole: false },
      lights: { kind: 'arc', y: 1.05, a0: 22, a1: 158, sag: 0.05, span: [28, 152] }
    }
  };
  /* HOUSE_H fallback (red, blue, thatch, candy, castle) when SLIslandLook is not loaded */
  var HOUSE_H = {
    shape_cottage: [2.3, 2.3, 2.3, 2.3, 2.9], shape_loft: [1.95, 1.95, 2.1, 2.0, 2.75], shape_villa: [1.2, 1.2, 1.2, 1.3, 1.95],
    shape_tower: [2.6, 2.6, 2.75, 2.65, 2.9], shape_dome: [2.25, 2.25, 2.25, 2.25, 2.25]
  };

  /* triangle budgets (MID/HIGH; world-look BUDGET, HOUSE_TRIS and per-style tris), read live when SLIslandLook is loaded */
  var BUDGET = {
    house: 3500, body: 1000, door: 150,
    roof: { roof_red: 1000, roof_blue: 1000, roof_thatch: 1000, roof_candy: 1000, roof_castle: 1200 },
    detail: { detail_windowbox: 250, detail_chimney: 300, detail_lights: 300, detail_flag: 120, detail_neon: 200 },
    shape: { shape_cottage: 1000, shape_loft: 1200, shape_villa: 1200, shape_tower: 1200, shape_dome: 1200 },
    crown: 900, crownCastle: 1050
  };
  /* light timings (≤ 2 Hz everywhere; LED chases ≤ 1.5 Hz per light) — the look table wins when loaded */
  var NEON = { hz: 1, groups: 4, r: 0.015, seg: 0.42, segMax: 24, halos: 4, halo: 0.5 };
  var SIGN = { hz: 0.5, min: 0.7, day: 0.9 };
  var TIP = { hz: 0.5, min: 0.6 };
  var RING = { hz: 0.25 };
  var RIPPLE = { period: 2.4, s0: 0.6, s1: 1, rest: 0.8 };
  var DOTS = { hz: 1.5, groups: 3 };
  var POOL = { mix: 0.45 };

  /* ================================================================
     PURE HELPERS (no THREE; exported for Node tests)
     ================================================================ */
  function Look() { return (root && root.SLIslandLook) || nodeReq('../world-look.js'); }
  function Motion() { return (root && root.SLMotion) || nodeReq('./motion.js'); }
  var reqCache = {};
  function nodeReq(p) {
    if (typeof module !== 'object' || typeof require !== 'function') return null;
    if (p in reqCache) return reqCache[p];
    try { reqCache[p] = require(p); } catch (e) { reqCache[p] = null; }
    return reqCache[p];
  }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function frac(v) { return v - Math.floor(v); }
  function num(v, d) { return typeof v === 'number' && isFinite(v) ? v : (d || 0); }
  function own(o, k) { return o != null && Object.prototype.hasOwnProperty.call(o, k); }
  function slotOf(id) { var m = /^(wall|roof|door|detail|shape)_/.exec(String(id || '')); return m ? m[1] : null; }
  function trim01(v) { var x = v | 0; return x < 0 ? 0 : x > 1 ? 1 : x; }
  function isModern(shape) { return shape !== COTTAGE && own(SHAPE, shape); }
  /* '#RGB' / '#RRGGBB' / 'RRGGBB' → '#RRGGBB', else null (the runtime member colour) */
  function hexOf(v) {
    if (typeof v !== 'string') return null;
    var m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v.trim());
    if (!m) return null;
    var s = m[1].length === 3 ? m[1].replace(/(.)/g, '$1$1') : m[1];
    return '#' + s.toUpperCase();
  }

  /* the resolved house style for a build: {wall, roof, door, details[], shape, variant} (details
     sorted; the rooftop flag dropped under the castle; the cottage has one trim). Same rules as
     SLIslandLook.resolveStyle, which wins when it is loaded; a style id previews itself on the house. */
  function homeState(id, st) {
    var L = Look();
    if (L && typeof L.resolveStyle === 'function' && L.LOOK && L.LOOK[id]) {
      try {
        var r = L.resolveStyle(id, st || {});
        if (r && typeof r.wall === 'string' && Array.isArray(r.details)) return fixState(r);
      } catch (e) { /* fall through */ }
    }
    st = st || {};
    var s = {
      wall: pick(st.wall, WALLS, DEFAULTS.wall), roof: pick(st.roof, ROOFS, DEFAULTS.roof),
      door: pick(st.door, DOORS, DEFAULTS.door), details: detailList(st.details),
      shape: pick(st.shape, SHAPES, DEFAULTS.shape), variant: 0
    };
    var slot = slotOf(id);
    if (slot === 'detail') { if (DETAILS.indexOf(id) >= 0 && s.details.indexOf(id) < 0) s.details = s.details.concat([id]).sort(); }
    else if (slot && STYLE_IDS.indexOf(id) >= 0) s[slot] = id;
    s.variant = s.shape === COTTAGE ? 0 : trim01(st.variant);
    if (s.roof === 'roof_castle') s.details = s.details.filter(function (d) { return d !== 'detail_flag'; });
    return s;
  }
  function pick(v, list, d) { return typeof v === 'string' && list.indexOf(v) >= 0 ? v : d; }
  function detailList(d) {
    var list = Array.isArray(d) ? d : (d && typeof d === 'object' ? Object.keys(d).filter(function (k) { return d[k]; }) : []);
    var out = [];
    list.forEach(function (x) { if (DETAILS.indexOf(x) >= 0 && out.indexOf(x) < 0) out.push(x); });
    return out.sort();
  }
  /* unknown ids from a newer look table fall back to the defaults so a build never throws */
  function fixState(r) {
    var shape = pick(r.shape, SHAPES, DEFAULTS.shape);
    var s = {
      wall: pick(r.wall, WALLS, DEFAULTS.wall), roof: pick(r.roof, ROOFS, DEFAULTS.roof), door: pick(r.door, DOORS, DEFAULTS.door),
      details: detailList(r.details), shape: shape, variant: shape === COTTAGE ? 0 : trim01(r.variant)
    };
    if (s.roof === 'roof_castle') s.details = s.details.filter(function (d) { return d !== 'detail_flag'; });
    return s;
  }
  /* 'wall|roof|door|d:a,b' (the cottage: the exact v1 key) or that key + '|s:<shape>|v:<n>' → state
     (memoised; null when it isn't a house key) */
  var keyMemo = {};
  function parseKey(k) {
    if (typeof k !== 'string') return null;
    if (own(keyMemo, k)) return keyMemo[k];
    var p = k.split('|'), out = null;
    var det = p.length >= 4 && p[3].slice(0, 2) === 'd:' ? (p[3].slice(2) ? p[3].slice(2).split(',') : []) : null;
    if (det && p.length === 4) {
      out = fixState({ wall: p[0], roof: p[1], door: p[2], details: det, shape: COTTAGE, variant: 0 });
    } else if (det && p.length === 6 && p[4].slice(0, 2) === 's:' && p[5].slice(0, 2) === 'v:' && /^-?\d+$/.test(p[5].slice(2))) {
      out = fixState({ wall: p[0], roof: p[1], door: p[2], details: det, shape: p[4].slice(2), variant: +p[5].slice(2) });
    }
    keyMemo[k] = out;
    return out;
  }
  function stateKeyOf(s) {
    var k = s.wall + '|' + s.roof + '|' + s.door + '|d:' + s.details.join(',');
    return !s.shape || s.shape === COTTAGE ? k : k + '|s:' + s.shape + '|v:' + trim01(s.variant);
  }
  function stateOf(stOrKey) {
    return typeof stOrKey === 'string' ? parseKey(stOrKey) : (stOrKey && stOrKey.wall ? fixState(stOrKey) : homeState(HOME, stOrKey));
  }
  /* does a copy in this style need idle ticks? (smoke, flag, lights, neon, gold glints, and the
     villa ripple, tower sign and dome ring / antenna) */
  var ANIMATED_SHAPES = { shape_villa: 1, shape_tower: 1, shape_dome: 1 };
  function animated(stOrKey) {
    var s = stateOf(stOrKey);
    if (!s) return false;
    return s.door === 'door_gold' || !!ANIMATED_SHAPES[s.shape] || s.details.some(function (d) { return d !== 'detail_windowbox'; });
  }
  /* the template parts a state builds (≤ MAX_PARTS): modern shapes fold their trims into the shell,
     always carry lamps, and the tower adds its sign */
  function partsFor(stOrKey) {
    var s = stateOf(stOrKey);
    if (!s) return [];
    var modern = isModern(s.shape), out = modern ? ['shell', 'window', 'door'] : ['shell', 'trim', 'window', 'door'];
    var has = function (d) { return s.details.indexOf(d) >= 0; };
    if (modern || has('detail_lights') || has('detail_neon')) out.push('bulb');
    if (has('detail_chimney') || (has('detail_flag') && flagAt(s.roof, s.shape))) out.push('anim');
    if (s.shape === 'shape_tower') out.push('sign');
    return out;
  }
  /* every id this file registers: the house plus CATALOG kind 'style' ids it understands */
  function homeIds() {
    var ids = [HOME].concat(STYLE_IDS);
    var C = (root && root.SLWorldCore) || nodeReq('../world-core.js');
    if (C && Array.isArray(C.CATALOG)) {
      C.CATALOG.forEach(function (it) { if (it && it.kind === 'style' && slotOf(it.id) && ids.indexOf(it.id) < 0) ids.push(it.id); });
    }
    return ids;
  }
  function budgetOf(id, fallback) {
    var L = Look(), e = L && L.LOOK && L.LOOK[id];
    return e && typeof e.tris === 'number' && e.tris > 0 ? e.tris : fallback;
  }
  /* body + crown + door + every detail shown (SLIslandLook.houseBudget when loaded) */
  function houseBudget(stOrKey) {
    var s = stateOf(stOrKey), L = Look();
    if (!s) return 0;
    if (L && typeof L.houseBudget === 'function') { try { return L.houseBudget(s); } catch (e) { /* fall through */ } }
    var crown = s.shape === COTTAGE ? BUDGET.roof[s.roof] : s.roof === 'roof_castle' ? BUDGET.crownCastle : BUDGET.crown;
    return BUDGET.shape[s.shape] + crown + BUDGET.door + s.details.reduce(function (n, d) { return n + BUDGET.detail[d]; }, 0);
  }
  /* colour token for (look id, part); '$slot' resolved from the state */
  function tokenFor(id, part, fallback, st) {
    var L = Look(), e = L && L.LOOK && L.LOOK[id];
    var t = e && e.colors && typeof e.colors[part] === 'string' ? e.colors[part] : fallback;
    if (t.indexOf('$') >= 0) t = t.replace(/\$(\w+)/g, function (_, s) { return (st && st[s]) || DEFAULTS[s] || s; });
    return t;
  }
  /* a look-table number (e.g. LOOK.shape_tower.idle.hz) with a fallback */
  function lookNum(id, path, d) {
    var L = Look(), o = L && L.LOOK && L.LOOK[id];
    for (var i = 0; o != null && i < path.length; i++) o = o[path[i]];
    return typeof o === 'number' && isFinite(o) ? o : d;
  }
  /* the light rates the timelines run at, read once from the look table (the file's fallbacks
     until it is loaded), so the per-frame paths never walk or allocate */
  var rateMemo = null;
  function rates() {
    if (rateMemo) return rateMemo;
    var L = Look(), tip = L && L.LOOK && L.LOOK.shape_dome && L.LOOK.shape_dome.loops && L.LOOK.shape_dome.loops[0];
    var r = {
      neonHz: Math.min(MAX_HZ, lookNum('detail_neon', ['show', 'chase', 'hz'], NEON.hz)), neonGroups: lookNum('detail_neon', ['show', 'chase', 'groups'], NEON.groups),
      signHz: Math.min(MAX_HZ, lookNum('shape_tower', ['idle', 'hz'], SIGN.hz)), signMin: lookNum('shape_tower', ['idle', 'min'], SIGN.min),
      tipHz: Math.min(MAX_HZ, num(tip && tip.hz, TIP.hz)), tipMin: num(tip && tip.min, TIP.min),
      ringHz: Math.min(MAX_HZ, lookNum('shape_dome', ['idle', 'hz'], RING.hz)), ripple: lookNum('shape_villa', ['idle', 'period'], RIPPLE.period),
      poolMix: lookNum('shape_villa', ['show', 'pool', 'mix'], POOL.mix)
    };
    if (L) rateMemo = r;
    return r;
  }

  /* ---------------- layouts (all in item space) ---------------- */
  /* the crown top for (roof, shape); the cottage keeps its v1 tops (the candy cherry pokes above 2.3) */
  function roofTop(roof, shape) {
    if (!shape || shape === COTTAGE) {
      if (roof === 'roof_castle') return CASTLE.top;
      if (roof === 'roof_candy') return GABLE.apex + 0.055 + 0.135;   /* the cherry */
      return 2.3;
    }
    var L = Look(), row = L && L.HOUSE_H && L.HOUSE_H[shape];
    if (row && typeof row[roof] === 'number') return row[roof];
    var fb = HOUSE_H[shape] || HOUSE_H[DEFAULTS.shape], i = ROOFS.indexOf(roof);
    return fb[i < 0 ? 0 : i];
  }
  /* the door: {kind 'swing'|'slide', x, w, h, y0, z (wall face), t, arch, slide, dir, pivot[], anchor[]} */
  var doorMemo = {};
  function doorOf(shape) {
    shape = own(SHAPE, shape) ? shape : COTTAGE;
    if (doorMemo[shape]) return doorMemo[shape];
    var d;
    if (shape === COTTAGE) {
      d = { kind: 'swing', x: 0, w: DOOR.w, h: DOOR.h, y0: DOOR.y0, z: BODY.front, t: DOOR.t, arch: true, slide: 0, dir: 0,
            pivot: [DOOR.hinge, 0, DOOR.z0], anchor: [0, DOOR.y0 + 0.3, BODY.front + 0.12] };
    } else {
      var s = SHAPE[shape].door;
      d = { kind: s.kind, x: s.x, w: s.w, h: s.h, y0: s.y0, z: s.z, t: s.t, arch: !!s.arch, slide: s.slide || 0, dir: s.dir || 0 };
      d.pivot = s.kind === 'slide' ? [s.x, 0, s.z + 0.003] : [s.x - s.w / 2, 0, s.z + 0.003];
      d.anchor = [s.x, s.y0 + 0.3, s.z + 0.12];
    }
    doorMemo[shape] = d;
    return d;
  }
  /* gold-door glints, at the door's upper left and lower right (memoised: read from idle) */
  var glintMemo = {};
  function glintsOf(shape) {
    if (!isModern(shape)) return GLINT.pos;
    if (glintMemo[shape]) return glintMemo[shape];
    var d = doorOf(shape), zf = d.z + d.t + 0.02;
    return (glintMemo[shape] = [[d.x - d.w * 0.25, d.y0 + d.h * 0.86, zf], [d.x + d.w * 0.28, d.y0 + d.h * 0.4, zf + 0.005]]);
  }
  /* chimney: the v1 brick stack on the cottage (on the castle's flat roof there), a steel flue elsewhere */
  function chimneyAt(roof, shape) {
    var c;
    if (isModern(shape)) {
      var s = SHAPE[shape].chimney;
      c = { kind: 'flue', x: s.x, z: s.z, y0: s.y0, top: s.top, w: 0.12, cap: 0.04 };
    } else {
      c = roof === 'roof_castle' ? { x: 0.35, z: -0.4, y0: 1.1, top: 1.85 }
        : roof === 'roof_thatch' ? { x: 0.56, z: -0.3, y0: 1.5, top: 2.25 }
          : { x: 0.5, z: -0.3, y0: 1.3, top: 2.15 };
      c.kind = 'brick'; c.w = 0.22; c.cap = 0.1;
    }
    c.emitter = [c.x, c.top + c.cap, c.z];
    return c;
  }
  /* the rooftop flag on the highest point (hidden with the castle); the dome flies it on its antenna */
  function flagAt(roof, shape) {
    if (roof === 'roof_castle') return null;
    if (!isModern(shape)) return { x: FLAG.x, z: FLAG.z, y0: FLAG.y0, top: FLAG.top, w: FLAG.w, h: FLAG.h, pole: true, pivot: [FLAG.x, FLAG.top, FLAG.z] };
    var f = SHAPE[shape].flag, top = f.top || Math.min(2.88, roofTop(roof, shape) + f.rise);
    return { x: f.x, z: f.z, y0: f.y0, top: top, w: FLAG.w, h: FLAG.h, pole: f.pole !== false, pivot: [f.x, top, f.z] };
  }
  /* the fairy-light swag: the cottage's front eave (v1), or a shape's front parapet / eave / dome arc */
  function lightsAt(roof, shape) {
    if (!isModern(shape)) {
      return { kind: 'line', x: LIGHTS.x, x0: -LIGHTS.x, x1: LIGHTS.x, span: [-LIGHTS.span, LIGHTS.span], sag: LIGHTS.sag,
               y: roof === 'roof_castle' ? 1.03 : 1.0, z: roof === 'roof_thatch' || roof === 'roof_castle' ? 0.6 : 0.62 };
    }
    var s = SHAPE[shape].lights, o = {};
    for (var k in s) o[k] = s[k];
    if (shape === 'shape_villa' && roof === 'roof_castle') { o.y = 0.76; o.z = -0.05; }
    return o;
  }
  /* the dome surface radius at height y (0 above the apex) */
  function domeR(y) {
    var D = SHAPE.shape_dome, u = (y - D.drum) / D.rise;
    if (u <= 0) return D.R;
    return u >= 1 ? 0 : D.R * Math.sqrt(1 - u * u);
  }
  /* a point on the two-scallop swag at s ∈ [0, 1] (attached at the ends and the middle) */
  function swagPoint(L, s) {
    var f = frac(s * 2);
    if (s >= 1) f = 0;
    var b = 4 * f * (1 - f);
    if (L.kind === 'arc') {
      var D = SHAPE.shape_dome, a = (L.a0 + (L.a1 - L.a0) * s) * Math.PI / 180, y = L.y - L.sag * b, r = domeR(y) + 0.022;
      return [r * Math.cos(a), y, D.zc + r * Math.sin(a)];
    }
    var x = L.x0 + (L.x1 - L.x0) * s;
    return [x, L.y - L.sag * b, L.z + 0.012 * b];
  }
  function swag(roof, nWire, nBulbs, shape) {
    var L = lightsAt(roof, shape), wire = [], bulbs = [], i;
    nWire = nWire || LIGHTS.wire; nBulbs = nBulbs || LIGHTS.n;
    for (i = 0; i <= nWire; i++) wire.push(swagPoint(L, i / nWire));
    var sp = L.kind === 'arc' ? [(L.span[0] - L.a0) / (L.a1 - L.a0), (L.span[1] - L.a0) / (L.a1 - L.a0)]
      : [(L.span[0] - L.x0) / (L.x1 - L.x0), (L.span[1] - L.x0) / (L.x1 - L.x0)];
    for (i = 0; i < nBulbs; i++) {
      var p = swagPoint(L, sp[0] + (sp[1] - sp[0]) * i / (nBulbs - 1));
      bulbs.push([p[0], p[1] - LIGHTS.hang, p[2]]);
    }
    return { wire: wire, bulbs: bulbs, centre: swagPoint(L, 0.25).map(function (v, j) { return j === 1 ? L.y - L.sag / 2 : v; }) };
  }
  /* the neon roofline: one or more polylines {pts, closed} just outside each roof edge */
  function rect(x0, x1, z0, z1, y, o) { return [[x0 - o, y, z1 + o], [x1 + o, y, z1 + o], [x1 + o, y, z0 - o], [x0 - o, y, z0 - o]]; }
  function neonPaths(shape, roof) {
    var o = 0.016, out = [];
    if (!isModern(shape)) {
      if (roof === 'roof_castle') {
        var y = CASTLE.slabTop - 0.03, hx = 0.86 + o, zf = BODY.z + 0.71 + o, zb = BODY.z - 0.71 - o;
        out.push({ pts: [[-hx, y, zb], [-hx, y, zf], [hx, y, zf], [hx, y, zb]], closed: false });
      } else if (roof === 'roof_thatch') {
        /* round the front of the straw lip, just outside it */
        var pts = [];
        for (var k = 0; k <= 10; k++) {
          var a = Math.PI * k / 10;
          pts.push([(LIP.rx + LIP.r - 0.025) * Math.cos(a), LIP.y - LIP.r * 0.8, LIP.z + (LIP.rz + LIP.r) * Math.sin(a)]);
        }
        out.push({ pts: pts, closed: false });
      } else {
        /* under both side eaves, then up and down the front rakes just in front of their rolls */
        var W = GABLE.w - 0.01, E = GABLE.eave - 0.07, A = GABLE.apex - 0.04, z1 = GABLE.zf + 0.075, z0 = GABLE.zb + 0.05;
        out.push({ pts: [[-W, E, z0], [-W, E, z1], [0, A, z1], [W, E, z1], [W, E, z0]], closed: false });
      }
      return out;
    }
    var S = SHAPE[shape];
    if (shape === 'shape_loft' || shape === 'shape_tower') {
      var C = S.crown;
      out.push({ pts: rect(C.x0, C.x1, C.z0, C.z1, C.P - 0.02, o), closed: true });
      if (shape === 'shape_loft') {
        var LB = S.lower, yl = LB.y1 + 0.02;
        out.push({ pts: [[S.upper.x1, yl, LB.z1 + o], [LB.x1 + o, yl, LB.z1 + o], [LB.x1 + o, yl, LB.z0 - o], [LB.x0 - o, yl, LB.z0 - o], [LB.x0 - o, yl, S.upper.z0]], closed: false });
      } else {
        var An = S.annex, ya = An.y1 - 0.02;
        out.push({ pts: [[An.x0, ya, An.z1 + o], [An.x1 + o, ya, An.z1 + o], [An.x1 + o, ya, An.z0 - o], [An.x0, ya, An.z0 - o]], closed: false });
      }
    } else if (shape === 'shape_villa') {
      var yv = roof === 'roof_castle' ? 0.78 : 0.705, m = S.hips[0], sd = S.hips[1];
      out.push({ pts: rect(m.x0, m.x1, m.z0, m.z1, yv, o), closed: true });
      out.push({ pts: [[sd.x0 - o, yv, m.z1 + o], [sd.x0 - o, yv, sd.z1 + o], [sd.x1 + o, yv, sd.z1 + o], [sd.x1 + o, yv, m.z1 + o]], closed: false });
    } else if (shape === 'shape_dome') {
      var P = S.portal, zp = P.z1 + o, arc = [[P.x0 - o, 0.06, zp], [P.x0 - o, P.y1, zp]], rr = (P.x1 - P.x0) / 2 + o;
      for (var j = 1; j < 8; j++) { var aa = Math.PI * (1 - j / 8); arc.push([rr * Math.cos(aa), P.y1 + rr * Math.sin(aa), zp]); }
      arc.push([P.x1 + o, P.y1, zp], [P.x1 + o, 0.06, zp]);
      out.push({ pts: arc, closed: false });
      var ring = [], rc = S.pod.r + 0.035;
      for (var q = 0; q < 10; q++) { var b = 2 * Math.PI * q / 10; ring.push([rc * Math.cos(b), S.pod.collar + 0.035, S.zc + rc * Math.sin(b)]); }
      out.push({ pts: ring, closed: true });
    }
    return out;
  }
  /* the neon paths split into ≤ NEON.segMax straight segments {a, b, i} (i = chase order) */
  function neonSegments(shape, roof) {
    var paths = neonPaths(shape, roof), total = 0, edges = [];
    paths.forEach(function (p) {
      var n = p.pts.length, last = p.closed ? n : n - 1;
      for (var i = 0; i < last; i++) {
        var a = p.pts[i], b = p.pts[(i + 1) % n], len = Math.sqrt(Math.pow(b[0] - a[0], 2) + Math.pow(b[1] - a[1], 2) + Math.pow(b[2] - a[2], 2));
        edges.push({ a: a, b: b, len: len }); total += len;
      }
    });
    var seg = Math.max(NEON.seg, total / NEON.segMax), out = [];
    edges.forEach(function (e) {
      var n = Math.max(1, Math.round(e.len / seg));
      if (out.length + n > NEON.segMax) n = Math.max(1, NEON.segMax - out.length);
      for (var k = 0; k < n; k++) {
        var u0 = k / n, u1 = (k + 1) / n;
        out.push({ a: lerp3(e.a, e.b, u0), b: lerp3(e.a, e.b, u1), i: out.length });
      }
    });
    return out;
  }
  function lerp3(a, b, u) { return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u]; }
  /* window boxes under the main glazing: [{cx, top, cz, w, d, n, yaw}] (planter centre, top, flowers) */
  function windowBoxesAt(shape, v) {
    v = trim01(v);
    if (!isModern(shape)) {
      return [-1, 1].map(function (sx) { return { cx: sx * WIN.x, top: WIN.y - WIN.h / 2 - 0.035, cz: BODY.front + 0.055, w: 0.38, d: 0.11, n: 3, yaw: 0 }; });
    }
    var S = SHAPE[shape];
    if (shape === 'shape_loft') {
      var g = S.glass[v], rb = S.ribbon[v];
      return [{ cx: (g.x0 + g.x1) / 2, top: 0.1, cz: S.lower.z1 + 0.06, w: g.x1 - g.x0 - 0.06, d: 0.12, n: 4, yaw: 0 },
        { cx: (rb.x0 + rb.x1) / 2, top: rb.y0 - 0.03, cz: S.upper.z1 + 0.05, w: Math.min(0.56, rb.x1 - rb.x0), d: 0.1, n: 3, yaw: 0 }];
    }
    if (shape === 'shape_tower') {
      var ws = S.windows[v], b1 = v ? [ws[0], ws[1]] : [ws[0]], b2 = v ? [ws[2], ws[3]] : [ws[1]];
      return [b1, b2].map(function (row) {
        var x0 = row[0].x0, x1 = row[row.length - 1].x1;
        return { cx: (x0 + x1) / 2, top: row[0].y0 - 0.03, cz: S.body.z1 + 0.05, w: Math.min(0.46, x1 - x0), d: 0.1, n: 3, yaw: 0 };
      });
    }
    if (shape === 'shape_villa') {
      var ph = S.porthole[v];
      return [{ cx: 0.02, top: 0.15, cz: 0.805, w: 0.2, d: 0.1, n: 2, yaw: 0 }, { cx: 0.6, top: 0.15, cz: 0.805, w: 0.36, d: 0.1, n: 3, yaw: 0 },
        { cx: ph.x, top: ph.y - ph.r - 0.035, cz: S.side.z1 + 0.04, w: 0.17, d: 0.08, n: 2, yaw: 0 }];
    }
    var D = S, P = D.porthole;
    return [D.portholes[v][0], D.portholes[v][1]].map(function (deg) {
      var a = deg * Math.PI / 180, r = D.R + 0.05;
      return { cx: r * Math.cos(a), top: P.y - P.r - 0.03, cz: D.zc + r * Math.sin(a), w: 0.26, d: 0.1, n: 3, yaw: 90 - deg };
    });
  }
  /* a hip roof's ridge (equal pitches; on the long axis): {along, r1, r2, run} (run = eave → ridge) */
  function hipRidge(h) {
    var w = h.x1 - h.x0, d = h.z1 - h.z0, ya = h.apex;
    if (w >= d) { var zc = (h.z0 + h.z1) / 2; return { along: 'x', r1: [h.x0 + d / 2, ya, zc], r2: [h.x1 - d / 2, ya, zc], run: d / 2 }; }
    var xc = (h.x0 + h.x1) / 2;
    return { along: 'z', r1: [xc, ya, h.z1 - w / 2], r2: [xc, ya, h.z0 + w / 2], run: w / 2 };
  }
  /* the anchor heights and hit box for a state */
  function topOf(s) {
    var y = roofTop(s.roof, s.shape), f = flagAt(s.roof, s.shape);
    if (s.details.indexOf('detail_flag') >= 0 && f) y = Math.max(y, f.top + 0.03);
    if (s.details.indexOf('detail_chimney') >= 0) y = Math.max(y, chimneyAt(s.roof, s.shape).emitter[1]);
    return y;
  }

  /* ---------------- the cottage's v1 roof maths ---------------- */
  /* straw tufts around the thatch lip, tips pointing down and out */
  function tufts(n) {
    var out = [], down = 32 * Math.PI / 180;
    for (var k = 0; k < n; k++) {
      var a = 2 * Math.PI * (k + 0.5) / n, ca = Math.cos(a), sa = Math.sin(a);
      var nx = ca / LIP.rx, nz = sa / LIP.rz, nl = Math.sqrt(nx * nx + nz * nz);
      nx /= nl; nz /= nl;
      out.push({ p: [(LIP.rx + 0.03) * ca, LIP.y - 0.07, LIP.z + (LIP.rz + 0.03) * sa], dir: [nx * Math.sin(down), -Math.cos(down), nz * Math.sin(down)] });
    }
    return out;
  }
  /* deterministic RNG (mulberry32) seeded from a string (FNV-1a) */
  function hash(s) {
    s = String(s);
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
  }
  function rng(seed) {
    var a = (typeof seed === 'number' ? seed : hash(seed)) >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = Math.imul(a ^ (a >>> 15), a | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  /* gable geometry maths: slope normal/up for side ±1 */
  function slope(side) {
    var A = GABLE.apex - GABLE.eave, W = GABLE.w, l = Math.sqrt(A * A + W * W);
    return { n: [side * A / l, W / l, 0], up: [-side * W / l, A / l, 0], A: A, W: W, len: l };
  }
  function onSlope(side, u, z, lift) {
    var s = slope(side);
    return [side * GABLE.w * (1 - u) + s.n[0] * lift, GABLE.eave + s.A * u + s.n[1] * lift, z];
  }
  /* 24 sprinkles (16 on LOW) on the front gable and both slopes: {p, dir, tok} */
  function sprinkles(n) {
    var r = rng('roof_candy:sprinkles'), out = [], tokens = ['s1', 's2', 's3', 's4', 's5'];
    var nFront = Math.round(n * 0.375), nLeft = Math.round(n * 0.375), i, th;
    for (i = 0; i < n; i++) {
      th = r() * Math.PI * 2;
      var tok = tokens[i % tokens.length], p, dir;
      if (i < nFront) {
        var y = GABLE.eave + 0.12 + r() * (GABLE.apex - GABLE.eave - 0.36);
        var hw = GABLE.w * (GABLE.apex - y) / (GABLE.apex - GABLE.eave) - 0.1;
        p = [(r() * 2 - 1) * Math.max(0, hw), y, GABLE.zf + 0.008];
        dir = [Math.cos(th), Math.sin(th), 0];
      } else {
        var side = i < nFront + nLeft ? -1 : 1, s = slope(side);
        var u = 0.12 + r() * 0.66, z = GABLE.zb + 0.14 + r() * (GABLE.zf - GABLE.zb - 0.26);
        p = onSlope(side, u, z, 0.008);
        dir = [s.up[0] * Math.sin(th), s.up[1] * Math.sin(th), Math.cos(th)];
      }
      out.push({ p: p, dir: dir, tok: tok });
    }
    return out;
  }
  /* 12 icing drips: 3 down each front rake, 3 under each side eave; lengths 0.05–0.12 */
  var DRIP_LENS = [0.08, 0.12, 0.06, 0.1, 0.07, 0.11, 0.05, 0.09, 0.12, 0.06, 0.1, 0.08];
  function drips() {
    var out = [], k = 0;
    [-1, 1].forEach(function (side) {
      [0.22, 0.5, 0.78].forEach(function (t) {
        var h = DRIP_LENS[k++], y = GABLE.eave + (GABLE.apex - GABLE.eave) * t - 0.035;
        out.push({ p: [side * GABLE.w * (1 - t), y - h / 2, GABLE.zf + 0.03], h: h });
      });
      [0.4, 0.1, -0.2].forEach(function (z) {
        var h = DRIP_LENS[k++];
        out.push({ p: [side * GABLE.w, GABLE.eave - 0.035 - h / 2, z], h: h });
      });
    });
    return out;
  }

  /* ---------------- timelines (pure functions of time) ---------------- */
  /* door angle for one act: 'home' opens 70° (outBack, 0.3 s), holds HOLD.home and
     swings back; 'homeClose' closes from `from`; 'homeSwing' opens, holds briefly, closes.
     → out {deg, done, phase: 'open'|'hold'|'close'|'rest'} */
  var _mo = {}, _mf = { deg: 0 }, _mopt = { reduced: false, from: _mf };
  function doorAt(name, t, from, reduced, out) {
    out = out || {};
    var M = Motion(), openDur = reduced ? 0 : 0.3, closeDur = reduced ? 0 : 0.3;
    from = num(from, name === 'homeClose' ? DOOR.open : 0);
    t = Math.max(0, num(t));
    if (name === 'homeClose') {
      out.deg = sampleDoor(M, 'homeClose', t, from, reduced);
      out.done = t >= closeDur; out.phase = out.done ? 'rest' : 'close';
      return out;
    }
    var hold = name === 'homeSwing' ? HOLD.swing : HOLD.home, tc = openDur + hold;
    if (t < tc) {
      out.deg = sampleDoor(M, 'home', t, from, reduced);
      out.phase = t < openDur ? 'open' : 'hold'; out.done = false;
    } else {
      out.deg = sampleDoor(M, 'homeClose', t - tc, DOOR.open, reduced);
      out.done = t - tc >= closeDur; out.phase = out.done ? 'rest' : 'close';
    }
    return out;
  }
  function sampleDoor(M, act, t, from, reduced) {
    if (M && typeof M.sample === 'function') {
      _mf.deg = from; _mopt.reduced = !!reduced;
      return M.sample(act, t, _mo, _mopt).deg;
    }
    var u = reduced ? 1 : clamp01(t / 0.3), e = u * u * (3 - 2 * u);
    return act === 'homeClose' ? from * (1 - e) : from + (DOOR.open - from) * e;
  }
  /* the door pose for a shape: a swing turns rot° about the hinge; the dome's door slides
     `slide` u along its track (no overshoot, no turn). deg is the shared openness 0…70. */
  function doorPose(shape, name, t, from, reduced, out) {
    out = doorAt(name, t, from, reduced, out);
    var d = doorOf(shape);
    if (d.kind === 'slide') { out.rot = 0; out.slide = d.slide * clamp01(out.deg / DOOR.open); }
    else { out.rot = out.deg; out.slide = 0; }
    return out;
  }
  function doorDur(name, reduced) {
    var o = reduced ? 0 : 0.3;
    if (name === 'homeClose') return o;
    return Math.round((o + (name === 'homeSwing' ? HOLD.swing : HOLD.home) + o) * 1e6) / 1e6;
  }
  /* one chimney puff: rises 0.6 u and grows ×1.8 per 2.4 s loop; appears from and
     melts to nothing (scale, since toon is opaque) → out {x, y, z, s} offsets/scale */
  var _sm = {};
  function smokeAt(t, i, n, phase, reduced, out) {
    out = out || {};
    var M = Motion(), y, s, a;
    if (M && typeof M.smoke === 'function') { M.smoke(t, i, n, SMOKE.period, phase, reduced, _sm); y = _sm.y; s = _sm.s; a = _sm.a; }
    else {
      var p0 = reduced ? (i + 0.5) / n : frac(t / SMOKE.period + (phase || 0) + i / n);
      y = 0.6 * p0; s = 1 + 0.8 * p0; a = reduced ? 0.6 : Math.sin(Math.PI * p0) * 0.9;
    }
    var p = y / 0.6;
    out.y = SMOKE.rise * p; out.x = SMOKE.drift[0] * p; out.z = SMOKE.drift[1] * p;
    out.s = s * (reduced ? 1 : Math.min(1, a / 0.5));
    return out;
  }
  /* a chase light: lit once per `groups` steps of a `hz` step clock (0.25…1; 0.8 reduced) */
  function chase(t, i, hz, groups, reduced) {
    var M = Motion();
    if (M && typeof M.chase === 'function') return M.chase(t, i, hz, groups, reduced);
    if (reduced) return 0.8;
    var g = Math.max(1, groups | 0), local = ((t * Math.min(MAX_HZ, hz) - i) % g + g) % g;
    return 0.25 + 0.75 * (local < 1 ? Math.sin(Math.PI * local) : 0);
  }
  /* fairy-light bulb i brightness: soft 0.5 Hz twinkle by day → beat chase at Showtime
     (each bulb lights once per 3 steps, the step rate capped at 2 Hz); steady under reduced motion */
  function bulbLevel(t, i, k, hz, phase, reduced) {
    var M = Motion(), day, show;
    hz = Math.min(MAX_HZ, Math.max(0, num(hz, SHOW_BEAT_HZ)));
    if (reduced) { day = 0.85; show = 0.9; }
    else if (M && typeof M.twinkle === 'function') {
      day = 0.72 + 0.28 * M.twinkle(t, LIGHTS.dayHz, (phase || 0) + i * 0.37, false);
      show = 0.4 + 0.6 * (M.chase(t, i, hz, LIGHTS.groups, false) - 0.25) / 0.75;
    } else {
      day = 0.72 + 0.28 * (0.5 + 0.5 * Math.sin(2 * Math.PI * (LIGHTS.dayHz * t + (phase || 0) + i * 0.37)));
      show = 0.4 + 0.6 * (chase(t, i, hz, LIGHTS.groups, false) - 0.25) / 0.75;
    }
    k = clamp01(num(k));
    return day + (show - day) * k;
  }
  /* neon segment i: steady (1) at golden hour; at Showtime a chase (NEON.hz steps a second, each
     segment lit once per NEON.groups steps) between 0.45 and 1; steady under reduced motion */
  function neonLevel(t, i, k, phase, reduced) {
    k = clamp01(num(k));
    if (reduced || k <= 0) return 1;
    var R = rates(), hz = R.neonHz, g = R.neonGroups;
    var c = chase(t + num(phase) * g / Math.max(hz, 0.01), i, hz, g, false);
    var show = 0.45 + 0.55 * (c - 0.25) / 0.75;
    return 1 + (show - 1) * k;
  }
  /* the tower sign: 0.9 at golden hour; at Showtime it breathes 70–100% at 0.5 Hz (a sine, never on/off) */
  function signLevel(t, k, phase, reduced) {
    k = clamp01(num(k));
    var R = rates(), min = R.signMin;
    var show = reduced ? 1 : min + (1 - min) * (0.5 + 0.5 * Math.sin(2 * Math.PI * (R.signHz * num(t) + num(phase))));
    return SIGN.day + (show - SIGN.day) * k;
  }
  /* the dome's antenna tip breathes 60–100% at 0.5 Hz (steady 0.8 under reduced motion) */
  function tipLevel(t, phase, reduced) {
    if (reduced) return 0.8;
    var R = rates();
    return R.tipMin + (1 - R.tipMin) * (0.5 + 0.5 * Math.sin(2 * Math.PI * (R.tipHz * num(t) + num(phase))));
  }
  /* tower stair LED dot i: off by day, a 0.5 Hz-per-dot chase at night */
  function dotLevel(t, i, k, phase, reduced) {
    k = clamp01(num(k));
    if (k <= 0) return 0;
    return k * chase(t + num(phase) * 2, i, DOTS.hz, DOTS.groups, reduced);
  }
  /* the dome's LED band: the NEON3 colour at angle `ang` (radians) → out {i, j, f} (blend tokens i → j
     by f), travelling round once every 1 / RING.hz s (a moving hue, never a flash); fixed under reduced motion */
  function ringHue(t, ang, phase, reduced, out) {
    out = out || {};
    var u = frac(num(ang) / (2 * Math.PI) - (reduced ? 0 : rates().ringHz * num(t)) + num(phase)) * 3, i = Math.floor(u) % 3, f = u - Math.floor(u);
    out.i = i; out.j = (i + 1) % 3; out.f = f * f * (3 - 2 * f);
    return out;
  }
  /* the villa pool ripple: grows 0.6 → 1.0 and fades over 2.4 s → out {s, a} (still under reduced motion) */
  function rippleAt(t, phase, reduced, out) {
    out = out || {};
    var p = reduced ? 0.5 : frac(num(t) / rates().ripple + num(phase));
    out.s = RIPPLE.s0 + (RIPPLE.s1 - RIPPLE.s0) * p;
    out.a = reduced ? 0.35 : Math.sin(Math.PI * p);
    return out;
  }
  /* window glow for the Showtime mix k: DUSK 0.6 (the first windows lit at golden hour) → SHOW 1 */
  function windowLevel(k) {
    var L = Look(), d = L && L.DUSK && typeof L.DUSK.windowGlow === 'number' ? L.DUSK.windowGlow : 0.6;
    var s = L && L.SHOW && typeof L.SHOW.windowGlow === 'number' ? L.SHOW.windowGlow : 1;
    return d + (s - d) * clamp01(num(k));
  }
  /* which gold-door glint starts in (t - dt, t]: 2 glints 0.6 s apart every 4 s; -1 if none */
  function glintAt(t, dt, phase, reduced) {
    if (reduced || !(dt > 0) || dt > 1) return -1;
    var local = frac(t / GLINT.period + (phase || 0)) * GLINT.period;
    for (var i = 0; i < GLINT.n; i++) {
      var s = i * 0.6;
      if (local >= s && local - dt < s) return i;
    }
    return -1;
  }
  /* pennant flutter offset (u = 0 at the pole … 1 at the tip) */
  function clothAt(t, u, phase, reduced) {
    var M = Motion();
    if (M && typeof M.flutter === 'function') return M.flutter(t, FLAG.amp, FLAG.hz, u, phase, reduced);
    return reduced ? 0 : FLAG.amp * u * Math.sin(2 * Math.PI * (FLAG.hz * t + (phase || 0)) - u * 2.4);
  }

  /* ================================================================
     FACTORY (browser): SL3D.defineModels('home', factory) → {id: handlers}
     Everything that touches THREE lives below and runs only once K exists.
     ================================================================ */
  function factory(K0, SL3D) {
    var THREE = K0 && K0.THREE;
    if (!THREE) return {};
    var DEG = Math.PI / 180;

    /* scratch for aiming primitives along a direction */
    var _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _p = new THREE.Vector3();
    var _up = new THREE.Vector3(0, 1, 0), _one = new THREE.Vector3(1, 1, 1), _m = new THREE.Matrix4();
    var _e = new THREE.Euler(), _s3 = new THREE.Vector3(), _c = new THREE.Color(), _c2 = new THREE.Color();

    /* ---------------- small geometry helpers (all output is G geometry) ---------------- */
    function R(Kt, n) { return Kt.tier === 'LOW' ? Math.max(3, Math.round(n * 0.7)) : n; }
    function paint(G, g, token, tn) { return G.paint(g, token, tn); }
    /* a plain box (radius 0: 12 tris) */
    function box(G, w, h, d, p, token, tn) { return paint(G, G.t(G.slab(w, h, d, 0), { p: p }), token, tn); }
    function boxAt(G, b, token, tn) { return box(G, b.x1 - b.x0, b.y1 - b.y0, b.z1 - b.z0, [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2], token, tn); }
    /* a crisp architectural mass, unpainted: a box with one flat 45° chamfer of the arch bevel radius
       (MATERIAL.bevel: 0.05 × the smallest side, capped at 0.06) on every edge — 44 tris, where a
       rounded box costs 300, so a modern house can afford several masses */
    function massAt(Kt, b) {
      var L = Look(), bv = (L && L.MATERIAL && L.MATERIAL.bevel) || { arch: 0.05, archMax: 0.06 };
      var hx = (b.x1 - b.x0) / 2, hy = (b.y1 - b.y0) / 2, hz = (b.z1 - b.z0) / 2;
      var c = Math.min(bv.arch * 2 * Math.min(hx, hy, hz), bv.archMax, 0.5 * Math.min(hx, hy, hz));
      function v(ax, sx, sy, sz) {
        return [sx * (ax === 0 ? hx : hx - c), sy * (ax === 1 ? hy : hy - c), sz * (ax === 2 ? hz : hz - c)];
      }
      var S = [-1, 1], faces = [], i, j;
      S.forEach(function (s) {
        faces.push([v(0, s, -1, -1), v(0, s, 1, -1), v(0, s, 1, 1), v(0, s, -1, 1)]);
        faces.push([v(1, -1, s, -1), v(1, 1, s, -1), v(1, 1, s, 1), v(1, -1, s, 1)]);
        faces.push([v(2, -1, -1, s), v(2, 1, -1, s), v(2, 1, 1, s), v(2, -1, 1, s)]);
      });
      for (i = 0; i < 2; i++) for (j = 0; j < 2; j++) {
        var a = S[i], d = S[j];
        faces.push([v(0, a, d, -1), v(0, a, d, 1), v(1, a, d, 1), v(1, a, d, -1)]);     /* x–y edges */
        faces.push([v(0, a, -1, d), v(0, a, 1, d), v(2, a, 1, d), v(2, a, -1, d)]);     /* x–z edges */
        faces.push([v(1, -1, a, d), v(1, 1, a, d), v(2, 1, a, d), v(2, -1, a, d)]);     /* y–z edges */
        S.forEach(function (e) { faces.push([v(0, a, d, e), v(1, a, d, e), v(2, a, d, e)]); });   /* corners */
      }
      /* wind every face outward (its normal away from the box centre) */
      faces.forEach(function (f) {
        var u = [f[1][0] - f[0][0], f[1][1] - f[0][1], f[1][2] - f[0][2]], w = [f[2][0] - f[0][0], f[2][1] - f[0][1], f[2][2] - f[0][2]];
        var n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]], m = [0, 0, 0];
        f.forEach(function (p) { m[0] += p[0]; m[1] += p[1]; m[2] += p[2]; });
        if (n[0] * m[0] + n[1] * m[1] + n[2] * m[2] < 0) f.reverse();
      });
      return Kt.G.t(solid(Kt, faces), { p: [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2] });
    }
    /* rotate the primitive's +y onto dir, then move its centre to pos */
    function aim(g, dir, pos) {
      _v.set(dir[0], dir[1], dir[2]).normalize();
      _q.setFromUnitVectors(_up, _v);
      _p.set(pos[0], pos[1], pos[2]);
      g.applyMatrix4(_m.compose(_p, _q, _one));
      return g;
    }
    /* a round rod (tube) between two points; `open` drops the caps (hidden ends) */
    function rod(Kt, r, a, b, radial, open) {
      var dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      var g = Kt.G.tube(r, len, { radial: R(Kt, radial || 8), open: !!open });
      return aim(g, [dx, dy, dz], [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]);
    }
    /* a solid from polygons (each counter-clockwise seen from outside), flat-shaded */
    function solid(Kt, faces) {
      var arr = [];
      faces.forEach(function (f) {
        var pts = f.filter(function (p, i) { var q = f[(i + f.length - 1) % f.length]; return i === 0 || p[0] !== q[0] || p[1] !== q[1] || p[2] !== q[2]; });
        for (var i = 1; i + 1 < pts.length; i++) arr.push(pts[0][0], pts[0][1], pts[0][2], pts[i][0], pts[i][1], pts[i][2], pts[i + 1][0], pts[i + 1][1], pts[i + 1][2]);
      });
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
      return Kt.G.normalise(g);
    }
    /* a pent (mono-pitch) wedge: front edge yF at zf, back edge yB at zb, sitting on y0 */
    function wedge(Kt, x0, x1, zf, zb, y0, yF, yB) {
      var FL0 = [x0, y0, zf], FR0 = [x1, y0, zf], FR1 = [x1, yF, zf], FL1 = [x0, yF, zf];
      var BL0 = [x0, y0, zb], BR0 = [x1, y0, zb], BR1 = [x1, yB, zb], BL1 = [x0, yB, zb];
      return solid(Kt, [[FL0, FR0, FR1, FL1], [BR0, BL0, BL1, BR1], [FL1, FR1, BR1, BL1], [FL0, FL1, BL1, BL0], [FR0, BR0, BR1, FR1], [FL0, BL0, BR0, FR0]]);
    }
    /* a hip roof on the rectangle at y0, rising to the apex (equal pitches; the ridge on the long axis) */
    function hip(Kt, h) {
      var A = [h.x0, h.y0, h.z1], B = [h.x1, h.y0, h.z1], Cc = [h.x1, h.y0, h.z0], D = [h.x0, h.y0, h.z0], r = hipRidge(h);
      if (r.along === 'x') return solid(Kt, [[A, B, r.r2, r.r1], [B, Cc, r.r2], [Cc, D, r.r1, r.r2], [D, A, r.r1], [A, D, Cc, B]]);
      return solid(Kt, [[A, B, r.r1], [B, Cc, r.r2, r.r1], [Cc, D, r.r2], [D, A, r.r1, r.r2], [A, D, Cc, B]]);
    }
    /* a faceted lathe about the y axis (profile [r, y] pairs), centred on z = zc */
    function lathe(Kt, prof, segs, zc) {
      var pts = prof.map(function (p) { return new THREE.Vector2(Math.max(0, p[0]), p[1]); });
      var g = Kt.G.normalise(new THREE.LatheGeometry(pts, segs));
      g.translate(0, 0, zc || 0);
      return Kt.G.facet(g);
    }
    /* the ✦: a four-point spark prism facing +z (never the five-point star) */
    function star4(Kt, rOut, depth) {
      var sh = new THREE.Shape(), c = rOut * 0.14;
      sh.moveTo(0, rOut);
      sh.quadraticCurveTo(c, c, rOut, 0);
      sh.quadraticCurveTo(c, -c, 0, -rOut);
      sh.quadraticCurveTo(-c, -c, -rOut, 0);
      sh.quadraticCurveTo(-c, c, 0, rOut);
      var g = new THREE.ExtrudeGeometry(sh, { depth: depth, bevelEnabled: false, curveSegments: Kt.tier === 'LOW' ? 2 : 3, steps: 1 });
      g.translate(0, 0, -depth / 2);
      return Kt.G.normalise(g);
    }
    /* a flat quad facing +z */
    function quadXY(Kt, x0, x1, y0, y1, z) {
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([x0, y0, z, x1, y0, z, x1, y1, z, x0, y0, z, x1, y1, z, x0, y1, z], 3));
      return Kt.G.normalise(g);
    }
    function vcount(g) { return g.getAttribute('position').count; }
    function emptyParts() { return { shell: [], trim: [], window: [], door: [], bulb: [], anim: [], sign: [], lamps: [], halos: [], meta: {} }; }
    /* a CPU-lit lamp: its geometry joins the 'bulb' part, its record describes how to light it */
    function lamp(o, g, rec) { rec.count = vcount(g); o.bulb.push(g); o.lamps.push(rec); return rec; }
    function halo(o, name, pos, size, token, rec, mode) { o.halos.push({ name: name, pos: pos.slice(), size: size, token: token, lamp: rec || null, mode: mode || 'k' }); }
    function wallPaint(G, g, wallT, skirtY, topT) {
      return G.paintBy(g, function (v) { return topT && v.ny > 0.7 ? topT : v.y < skirtY ? [wallT, BODY.skirtTone] : wallT; }, { perFace: true });
    }

    /* the gable mass: a 3-sided prism, faceted; left slope + front base, right slope shade */
    function prism(Kt, base, shade) {
      var G = Kt.G, A = GABLE.apex - GABLE.eave, L = GABLE.zf - GABLE.zb;
      var g = G.t(G.tube(1, 1, 1, { radial: 3 }), { s: [GABLE.w / 0.8660254, L, A / 1.5], r: [-90, 0, 0], p: [0, GABLE.eave + A / 3, (GABLE.zf + GABLE.zb) / 2] });
      G.facet(g);
      return G.paintBy(g, function (v) { return v.nx > 0.3 || v.nz < -0.5 || v.ny < -0.5 ? shade : base; }, { perFace: true });
    }
    /* soft rolled edges: ridge, 2 front rakes, 2 side eaves (left = base, right = shade) */
    function gableRolls(Kt, r, base, shade, all) {
      var G = Kt.G, E = GABLE.eave, A = GABLE.apex, W = GABLE.w, zf = GABLE.zf, zb = GABLE.zb, out = [];
      var ridge = rod(Kt, r * 1.3, [0, A, zb], [0, A, zf], 10);
      out.push(all ? paint(G, ridge, all) : G.paintBy(ridge, function (v) { return v.nx > 0.15 ? shade : base; }, { perFace: true }));
      out.push(paint(G, rod(Kt, r, [-W, E, zf], [0, A, zf], 8), all || base));
      out.push(paint(G, rod(Kt, r, [W, E, zf], [0, A, zf], 8), all || shade));
      out.push(paint(G, rod(Kt, r, [-W, E, zb], [-W, E, zf], 8), all || base));
      out.push(paint(G, rod(Kt, r, [W, E, zb], [W, E, zf], 8), all || shade));
      return out;
    }

    /* ================================================================
       THE COTTAGE (v1 layout; colours from the re-pointed look table)
       ================================================================ */
    function cottageBody(Kt, wall) {
      var G = Kt.G, o = emptyParts(), st = { wall: wall };
      var wallT = tokenFor(HOME, 'wall', 'WALL.$wall', st), inkT = tokenFor(HOME, 'muntin', 'Ink');
      var body = G.t(G.slab(BODY.w, BODY.h, BODY.d, { arch: true }), { p: [0, BODY.h / 2, BODY.z] });
      G.paintBy(body, function (v) { return v.y < BODY.skirt ? [wallT, BODY.skirtTone] : wallT; }, { perFace: true });
      o.shell.push(body);
      o.shell.push(box(G, 0.56, DOOR.y0, 0.18, [0, DOOR.y0 / 2, BODY.front + 0.09], tokenFor(HOME, 'step', 'Step')));
      /* oval door mat on the ground in front of the step */
      var matT = tokenFor(HOME, 'mat', 'Plank');
      var mat = G.t(G.tube(0.2, 0.012, { radial: R(Kt, 12) }), { s: [1.2, 1, 0.55], p: [0, 0.006, 0.8] });
      o.trim.push(G.paintBy(mat, function (v) { return v.ny > 0.5 ? matT : [matT, 'shade']; }, { perFace: true }));
      /* the dark doorway behind the door (seen when it swings open), in a slim Gunmetal surround */
      var rectH = DOOR.h - DOOR.w / 2;
      o.trim.push(box(G, DOOR.w, rectH, 0.006, [0, DOOR.y0 + rectH / 2, BODY.front + 0.003], inkT, 'shade'));
      o.trim.push(paint(G, G.t(G.tube(DOOR.w / 2, 0.006, { radial: R(Kt, 12) }), { r: [90, 0, 0], p: [0, DOOR.y0 + rectH, BODY.front + 0.003] }), inkT, 'shade'));
      [-1, 1].forEach(function (sx) { o.trim.push(box(G, 0.032, rectH, 0.022, [sx * (DOOR.w / 2 + 0.016), DOOR.y0 + rectH / 2, BODY.front + 0.011], inkT)); });
      var surround = new THREE.TorusGeometry(DOOR.w / 2 + 0.016, 0.014, 4, R(Kt, 10), Math.PI);
      o.trim.push(paint(G, G.t(G.normalise(surround), { p: [0, DOOR.y0 + rectH, BODY.front + 0.012] }), inkT));
      /* two windows: Gunmetal frame, Smoked Glass that glows at Showtime, muntins, a light sill */
      [-1, 1].forEach(function (sx) {
        var x = sx * WIN.x, gw = WIN.w - 0.05, gh = WIN.h - 0.05;
        o.trim.push(box(G, WIN.w, WIN.h, 0.03, [x, WIN.y, BODY.front + 0.005], inkT));
        o.window.push(box(G, gw, gh, 0.03, [x, WIN.y, BODY.front + 0.015], 'Cloud White'));
        o.trim.push(box(G, 0.022, gh, 0.012, [x, WIN.y, BODY.front + 0.036], inkT));
        o.trim.push(box(G, gw, 0.022, 0.012, [x, WIN.y, BODY.front + 0.036], inkT));
        o.trim.push(box(G, WIN.w + 0.06, 0.035, 0.07, [x, WIN.y - WIN.h / 2 - 0.0175, BODY.front + 0.035], wallT, 'hi'));
      });
      return o;
    }
    function cottageDoor(Kt, door) {
      var G = Kt.G, o = emptyParts();
      var doorT = tokenFor(door, 'door', 'DOOR.' + door), knobT = tokenFor(door, 'knob', 'Star Gold');
      var rectH = DOOR.h - DOOR.w / 2, zc = DOOR.z0 + DOOR.t / 2;
      var slab = G.t(G.slab(DOOR.w, rectH, DOOR.t, 0), { p: [0, DOOR.y0 + rectH / 2, zc] });
      o.door.push(G.paintBy(slab, function (v) { return v.nz > 0.5 ? doorT : [doorT, 'shade']; }, { perFace: true }));
      var arch = G.t(G.tube(DOOR.w / 2, DOOR.t - 0.002, { radial: R(Kt, 12) }), { r: [90, 0, 0], p: [0, DOOR.y0 + rectH, zc] });
      o.door.push(G.paintBy(arch, function (v) { return v.nz > 0.5 ? doorT : [doorT, 'shade']; }, { perFace: true }));
      o.door.push(paint(G, G.t(G.puff(0.032), { p: [0.13, DOOR.y0 + 0.26, DOOR.z0 + DOOR.t + 0.014] }), knobT));
      o.meta.mat = doorMat(door);
      return o;
    }
    function doorMat(door) {
      var L = Look(), e = L && L.LOOK && L.LOOK[door];
      return e && e.mats && e.mats.door ? e.mats.door : (door === 'door_gold' ? 'gold' : 'toon');
    }
    function roofRed(Kt) {
      var G = Kt.G, o = emptyParts(), id = 'roof_red';
      var base = tokenFor(id, 'roof', 'ROOF.roof_red.0'), shade = tokenFor(id, 'shade', 'ROOF.roof_red.1');
      o.shell.push(prism(Kt, base, shade));
      o.shell = o.shell.concat(gableRolls(Kt, 0.05, base, shade));
      /* 3 chunky raised tile rows round the front and both slopes */
      [0.24, 0.48, 0.72].forEach(function (u) {
        var y = GABLE.eave + (GABLE.apex - GABLE.eave) * u, hw = GABLE.w * (1 - u) - 0.03;
        o.trim.push(paint(G, rod(Kt, 0.032, [-hw, y, GABLE.zf + 0.012], [hw, y, GABLE.zf + 0.012], 6), shade));
        [-1, 1].forEach(function (side) {
          var a = onSlope(side, u, GABLE.zb + 0.02, 0.012), b = onSlope(side, u, GABLE.zf, 0.012);
          o.trim.push(paint(G, rod(Kt, 0.032, a, b, 6), side < 0 ? shade : base));
        });
      });
      return o;
    }
    function roofBlue(Kt) {
      var G = Kt.G, o = emptyParts(), id = 'roof_blue';
      var base = tokenFor(id, 'roof', 'ROOF.roof_blue.0'), shade = tokenFor(id, 'shade', 'ROOF.roof_blue.1');
      o.shell.push(prism(Kt, base, shade));
      o.shell = o.shell.concat(gableRolls(Kt, 0.035, base, shade));
      /* 4 thin flat slate rows, crisp and sleek (no bumps on the silhouette) */
      var L = GABLE.zf - GABLE.zb - 0.02;
      [0.2, 0.4, 0.6, 0.8].forEach(function (u) {
        var y = GABLE.eave + (GABLE.apex - GABLE.eave) * u, hw = GABLE.w * (1 - u) - 0.02;
        o.trim.push(box(G, 2 * hw, 0.05, 0.014, [0, y, GABLE.zf + 0.007], shade));
        [-1, 1].forEach(function (side) {
          var s = slope(side), c = onSlope(side, u, (GABLE.zf + GABLE.zb) / 2 - 0.01, 0.007);
          var g = G.t(G.slab(0.075, 0.014, L, 0), { r: [0, 0, -side * Math.atan2(s.A, s.W) / DEG], p: c });
          o.trim.push(paint(G, g, side < 0 ? shade : base));
        });
      });
      return o;
    }
    function roofThatch(Kt) {
      var G = Kt.G, o = emptyParts(), id = 'roof_thatch', low = Kt.tier === 'LOW';
      var base = tokenFor(id, 'roof', 'ROOF.roof_thatch.0'), shade = tokenFor(id, 'shade', 'ROOF.roof_thatch.1'), straw = tokenFor(id, 'straw', 'Straw');
      /* the fluffy loaf: a capsule along z, scaled tall; straw streaks by radial segment */
      var seg = (low ? 8 : 10), lb = LOAF.len / LOAF.cap - 2;
      var loaf = G.t(G.bean(1, lb), { s: [LOAF.hw, LOAF.cap, LOAF.hh], r: [90, 0, 0], p: [0, LOAF.y, LOAF.z] });
      G.paintBy(loaf, function (v) {
        var phi = Math.atan2(v.x / LOAF.hw, -(v.y - LOAF.y) / LOAF.hh);
        var k = Math.floor(((phi + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI / seg) + 1e-6);
        return k % 2 ? shade : base;
      }, { perFace: true });
      o.shell.push(loaf);
      /* the thick lip round the eaves (its inner half hides in the loaf) */
      var lip = G.t(G.ring(LIP.rx, LIP.r), { s: [1, LIP.rz / LIP.rx, 1], r: [90, 0, 0], p: [0, LIP.y, LIP.z] });
      o.shell.push(G.paintBy(lip, function (v) { return v.ny > 0.3 ? base : shade; }, { perFace: true }));
      /* straw-tuft fringe */
      tufts(low ? 10 : 14).forEach(function (t) {
        var g = G.cone(0.045, 0.14, R(Kt, 5));
        o.trim.push(paint(G, aim(g, t.dir, [t.p[0] + t.dir[0] * 0.07, t.p[1] + t.dir[1] * 0.07, t.p[2] + t.dir[2] * 0.07]), straw));
      });
      return o;
    }
    function roofCandy(Kt) {
      var G = Kt.G, o = emptyParts(), id = 'roof_candy', low = Kt.tier === 'LOW';
      var base = tokenFor(id, 'roof', 'ROOF.roof_candy.0'), shade = tokenFor(id, 'shade', 'ROOF.roof_candy.1'), icing = tokenFor(id, 'icing', 'Cloud White');
      o.shell.push(prism(Kt, base, shade));
      o.shell = o.shell.concat(gableRolls(Kt, 0.055, base, shade, icing));
      /* icing drips hanging off the rakes and eaves */
      drips().forEach(function (d) {
        o.trim.push(paint(G, G.t(G.tube(0.03, 0.038, d.h, { radial: R(Kt, 6) }), { p: d.p }), icing));
      });
      /* sprinkles: thin 4-sided rods lying half-sunk in the pink */
      var sp = SPRINKLE_FALLBACK;
      sprinkles(low ? 16 : 24).forEach(function (s) {
        o.trim.push(paint(G, aim(G.tube(0.013, 0.06, { radial: 4 }), s.dir, s.p), tokenFor(id, s.tok, sp[s.tok])));
      });
      /* the cherry on the ridge, near the front */
      var cherryT = tokenFor(id, 'cherry', 'Tulip Red');
      var cherry = G.t(G.puff(0.075), { p: [0, GABLE.apex + 0.055 + 0.06, GABLE.zf - 0.12] });
      o.shell.push(G.paintBy(cherry, function (v) { return v.x < -0.02 && v.y > GABLE.apex + 0.15 ? [cherryT, 'hi'] : cherryT; }, { perFace: true }));
      return o;
    }
    function roofCastle(Kt) {
      var G = Kt.G, o = emptyParts(), id = 'roof_castle';
      var stone = tokenFor(id, 'roof', 'Castle Stone'), tower = tokenFor(id, 'tower', 'Castle Tower'), cone = tokenFor(id, 'cone', 'Castle Cone');
      var slit = tokenFor(id, 'slit', 'Lamp Post');
      /* flat roof slab with a crenellated parapet: 7 merlons across the front */
      var slab = G.t(G.slab(1.72, 0.16, 1.42), { p: [0, CASTLE.slabTop - 0.08, BODY.z] });
      o.shell.push(paint(G, slab, stone));
      var my = CASTLE.slabTop + 0.065, i;
      for (i = 0; i < 7; i++) o.shell.push(box(G, 0.1, 0.13, 0.1, [-0.42 + i * 0.14, my, 0.5], stone));
      [-1, 1].forEach(function (sx) { [-0.65, -0.4, -0.15].forEach(function (z) { o.shell.push(box(G, 0.1, 0.13, 0.1, [sx * 0.81, my, z], stone)); }); });
      for (i = 0; i < 5; i++) o.shell.push(box(G, 0.1, 0.13, 0.1, [-0.5 + i * 0.25, my, -0.81], stone));
      /* two front corner turrets with violet cones and pennants (Coral left, gold right) */
      [-1, 1].forEach(function (sx) {
        var x = sx * CASTLE.tx, z = CASTLE.tz, coneH = CASTLE.coneTop - CASTLE.th - 0.05;
        o.shell.push(paint(G, G.t(G.tube(CASTLE.tr, CASTLE.th, { radial: R(Kt, 12) }), { p: [x, CASTLE.th / 2, z] }), tower));
        o.shell.push(paint(G, G.t(G.tube(CASTLE.tr + 0.025, 0.1, { radial: R(Kt, 12) }), { p: [x, CASTLE.th, z] }), stone));
        o.shell.push(G.paintBy(G.t(G.cone(CASTLE.tr + 0.03, coneH, R(Kt, 12)), { p: [x, CASTLE.th + 0.05 + coneH / 2, z] }),
          function (v) { return v.nx > 0.4 ? [cone, 'shade'] : cone; }, { perFace: true }));
        o.trim.push(paint(G, G.t(G.tube(0.012, 0.2, { radial: R(Kt, 5) }), { p: [x, CASTLE.top - 0.1, z] }), slit));
        var pen = G.t(G.cone(0.055, 0.2, 3), { s: [1, 1, 0.3], r: [0, 0, -sx * 90], p: [x + sx * 0.11, CASTLE.top - 0.06, z] });
        o.trim.push(paint(G, pen, tokenFor(id, sx < 0 ? 'pennantL' : 'pennantR', sx < 0 ? 'Coral' : 'Star Gold')));
        [1.6, 0.95].forEach(function (y) { o.trim.push(box(G, 0.05, 0.15, 0.03, [x, y, z + CASTLE.tr - 0.005], slit)); });
      });
      return o;
    }
    var SPRINKLE_FALLBACK = { s1: 'Star Gold', s2: 'Splash Blue', s3: 'Leaf Mint', s4: 'Grape', s5: 'Cloud White' };
    var COTTAGE_ROOF = { roof_red: roofRed, roof_blue: roofBlue, roof_thatch: roofThatch, roof_candy: roofCandy, roof_castle: roofCastle };

    /* ================================================================
       MODERN SHAPES — shared pieces
       ================================================================ */
    function tok(id, part, fb) { return tokenFor(id, part, fb); }
    /* a glazed opening on the +z wall at z: a Gunmetal frame behind a 'state' pane (its own lit
       tone, so not every room glows the same, and a diagonal sheen across its two front
       triangles), muntins and one thin glint */
    function glazing(Kt, o, g, z, frameT, seed) {
      var G = Kt.G, w = g.x1 - g.x0, h = g.y1 - g.y0, cx = (g.x0 + g.x1) / 2, cy = (g.y0 + g.y1) / 2, r = rng(seed), i;
      var lit = -0.2 * r();
      o.shell.push(box(G, w + 0.044, h + 0.044, 0.016, [cx, cy, z + 0.008], frameT));
      o.window.push(G.paintBy(G.t(G.slab(w, h, 0.016, 0), { p: [cx, cy, z + 0.016] }), function (q) {
        return ['Cloud White', q.nz > 0.5 && q.face % 2 ? lit - 0.14 : lit];
      }, { perFace: true }));
      for (i = 1; i < (g.cols || 1); i++) o.shell.push(box(G, 0.02, h, 0.012, [g.x0 + w * i / g.cols, cy, z + 0.028], frameT));
      for (i = 1; i < (g.rows || 1); i++) o.shell.push(box(G, w, 0.02, 0.012, [cx, g.y0 + h * i / g.rows, z + 0.028], frameT));
      o.window.push(box(G, 0.018, h * 0.42, 0.004, [g.x0 + Math.min(0.07, w * 0.22), g.y1 - h * 0.3, z + 0.026], 'Cloud White'));
    }
    /* vertical Teak slats over an accent panel on the +z wall at z */
    function slats(Kt, o, a, z, token) {
      var G = Kt.G, n = a.n || 4, w = (a.x1 - a.x0) / n, h = a.y1 - a.y0;
      o.shell.push(box(G, a.x1 - a.x0, h, 0.008, [(a.x0 + a.x1) / 2, (a.y0 + a.y1) / 2, z + 0.004], token, 'shade'));
      for (var i = 0; i < n; i++) o.shell.push(box(G, w * 0.62, h, 0.022, [a.x0 + w * (i + 0.5), (a.y0 + a.y1) / 2, z + 0.012], token, i % 2 ? 'hi' : 0));
    }
    /* the parapet ring: 4 wall-coloured boxes on the crown rectangle, inner faces in shade */
    function parapet(Kt, o, C, wallT) {
      var G = Kt.G, y0 = C.P - C.h, y1 = C.P, t = C.t;
      [bx(C.x0, C.x1, y0, y1, C.z1 - t, C.z1), bx(C.x0, C.x1, y0, y1, C.z0, C.z0 + t),
        bx(C.x0, C.x0 + t, y0, y1, C.z0 + t, C.z1 - t), bx(C.x1 - t, C.x1, y0, y1, C.z0 + t, C.z1 - t)].forEach(function (b) {
        o.shell.push(G.paintBy(boxAt(G, b, wallT), function (v) {
          var inner = (v.nz < -0.5 && b.z1 === C.z1) || (v.nz > 0.5 && b.z0 === C.z0) || (v.nx > 0.5 && b.x0 === C.x0) || (v.nx < -0.5 && b.x1 === C.x1);
          return inner ? [wallT, 'shade'] : wallT;
        }, { perFace: true }));
      });
    }
    /* the door surround: a dark doorway (seen when the door opens) in Gunmetal jambs and head */
    function doorFrame(Kt, o, d, frameT) {
      var G = Kt.G, z = d.z, rectH = d.arch ? d.h - d.w / 2 : d.h, fw = 0.032;
      o.shell.push(box(G, d.w, rectH, 0.006, [d.x, d.y0 + rectH / 2, z + 0.003], 'Midnight Ink'));
      [-1, 1].forEach(function (sx) { o.shell.push(box(G, fw, rectH + (d.arch ? 0 : fw), 0.024, [d.x + sx * (d.w / 2 + fw / 2), d.y0 + (rectH + (d.arch ? 0 : fw)) / 2, z + 0.012], frameT)); });
      if (d.arch) {
        o.shell.push(paint(G, G.t(G.tube(d.w / 2, 0.006, { radial: R(Kt, 12) }), { r: [90, 0, 0], p: [d.x, d.y0 + rectH, z + 0.003] }), 'Midnight Ink'));
        o.shell.push(paint(G, G.t(G.normalise(new THREE.TorusGeometry(d.w / 2 + fw / 2, fw / 2, 4, R(Kt, 10), Math.PI)), { p: [d.x, d.y0 + rectH, z + 0.012] }), frameT));
      } else o.shell.push(box(G, d.w + 2 * fw, fw, 0.024, [d.x, d.y0 + d.h + fw / 2, z + 0.012], frameT));
    }
    /* a modern door leaf on the 'door' pivot: a flat slab (round-topped on the dome), a bar handle */
    function modernDoor(Kt, shape, door) {
      var G = Kt.G, o = emptyParts(), d = doorOf(shape);
      var doorT = tokenFor(door, 'door', 'DOOR.' + door), knobT = tokenFor(door, 'knob', 'Star Gold');
      var z0 = d.z + 0.003, zc = z0 + d.t / 2, rectH = d.arch ? d.h - d.w / 2 : d.h;
      function face(g) { return G.paintBy(g, function (v) { return v.nz > 0.5 ? doorT : [doorT, 'shade']; }, { perFace: true }); }
      o.door.push(face(G.t(G.slab(d.w, rectH, d.t, 0), { p: [d.x, d.y0 + rectH / 2, zc] })));
      if (d.arch) o.door.push(face(G.t(G.tube(d.w / 2, d.t - 0.002, { radial: R(Kt, 12) }), { r: [90, 0, 0], p: [d.x, d.y0 + rectH, zc] })));
      /* a recessed line down the leaf and a vertical bar handle on the latch side */
      o.door.push(box(G, 0.012, rectH * 0.8, 0.004, [d.x - d.w * 0.18, d.y0 + rectH * 0.5, z0 + d.t + 0.001], doorT, 'shade'));
      var hx = d.kind === 'slide' ? d.x - d.w * 0.34 : d.x + d.w * 0.32;
      o.door.push(box(G, 0.022, Math.min(0.22, d.h * 0.32), 0.016, [hx, d.y0 + d.h * 0.48, z0 + d.t + 0.01], knobT));
      o.meta.mat = doorMat(door);
      return o;
    }
    /* a planter: a Graphite trough, a strip of green and n flowers (window boxes on modern shapes) */
    function planter(Kt, o, p) {
      var G = Kt.G, id = 'detail_windowbox', list = [];
      var f = [tokenFor(id, 'f1', 'Rose Deep'), tokenFor(id, 'f2', 'Star Gold'), tokenFor(id, 'f3', 'Tulip Pink')];
      list.push(G.paintBy(G.t(G.slab(p.w, 0.09, p.d, 0), { p: [0, -0.045, 0] }), function (v) { return v.ny > 0.5 ? 'Bark' : 'Graphite'; }, { perFace: true }));
      list.push(box(G, p.w - 0.04, 0.035, p.d - 0.03, [0, 0.012, -0.004], 'Leaf Deep'));
      for (var i = 0; i < p.n; i++) {
        var x = (p.n === 1 ? 0 : -p.w / 2 + 0.06 + (p.w - 0.12) * i / (p.n - 1));
        list.push(paint(G, G.t(G.tube(0.04, 0.026, { radial: R(Kt, 6) }), { r: [90, 0, 0], p: [x, 0.035 + (i % 2) * 0.018, p.d / 2 - 0.02] }), f[i % 3]));
      }
      list.forEach(function (g) { o.shell.push(G.t(g, { r: [0, p.yaw || 0, 0], p: [p.cx, p.top, p.cz] })); });
    }

    /* ---------------- City loft ---------------- */
    function loftBody(Kt, wall, v) {
      var S = SHAPE.shape_loft, G = Kt.G, o = emptyParts(), id = 'shape_loft', st = { wall: wall };
      var wallT = tokenFor(HOME, 'wall', 'WALL.$wall', st), frameT = tok(id, 'frame', 'Gunmetal'), teakT = tok(id, 'soffit', 'Teak');
      var copeT = tok(id, 'parapet', 'Concrete Light'), stepT = tok(id, 'step', 'Concrete');
      var LB = S.lower, UB = S.upper, C = S.crown, deck = C.P - 0.08;
      /* the lower box (Concrete roof terrace on top) and the cantilevered upper box (a roof deck inside its parapet) */
      o.shell.push(wallPaint(G, massAt(Kt, LB), wallT, 0.12, 'Concrete'));
      o.shell.push(wallPaint(G, massAt(Kt, bx(UB.x0, UB.x1, UB.y0, deck, UB.z0, UB.z1)), wallT, -1, 'Night Asphalt'));
      parapet(Kt, o, C, wallT);
      /* the lower box's roof terrace: coping where it is open to the sky, a Teak deck and a slim rail */
      [bx(LB.x1 - 0.04, LB.x1, LB.y1, LB.y1 + 0.04, LB.z0, LB.z1), bx(LB.x0, LB.x1, LB.y1, LB.y1 + 0.04, LB.z0, LB.z0 + 0.04),
        bx(UB.x1, LB.x1, LB.y1, LB.y1 + 0.04, LB.z1 - 0.04, LB.z1)].forEach(function (b) { o.shell.push(boxAt(G, b, copeT)); });
      var tz0 = LB.z0 + 0.06, tz1 = LB.z1 - 0.06, tx0 = UB.x1 + 0.02, tx1 = LB.x1 - 0.06, tn = 4, ry = LB.y1 + 0.17, i;
      for (i = 0; i < tn; i++) o.shell.push(boxAt(G, bx(tx0 + (tx1 - tx0) * i / tn + 0.004, tx0 + (tx1 - tx0) * (i + 1) / tn - 0.004, LB.y1, LB.y1 + 0.015, tz0, tz1), teakT, i % 2 ? 'hi' : 0));
      [[LB.x1 - 0.02, LB.z1 - 0.02], [LB.x1 - 0.02, (LB.z0 + LB.z1) / 2], [LB.x1 - 0.02, LB.z0 + 0.02], [UB.x1 + 0.03, LB.z1 - 0.02]].forEach(function (p) {
        o.shell.push(box(G, 0.018, ry - LB.y1, 0.018, [p[0], (LB.y1 + ry) / 2, p[1]], frameT));
      });
      o.shell.push(box(G, 0.02, 0.02, LB.z1 - LB.z0 - 0.04, [LB.x1 - 0.02, ry, (LB.z0 + LB.z1) / 2], frameT));
      o.shell.push(box(G, LB.x1 - UB.x1 - 0.05, 0.02, 0.02, [(UB.x1 + 0.03 + LB.x1 - 0.02) / 2, ry, LB.z1 - 0.02], frameT));
      /* the porch: a Teak soffit under the overhang and a Teak fascia along its edge */
      o.shell.push(boxAt(G, bx(UB.x0, UB.x1, UB.y0 - 0.015, UB.y0, LB.z1, UB.z1), teakT, 'shade'));
      o.shell.push(boxAt(G, bx(UB.x0 - 0.004, UB.x1 + 0.004, UB.y0 - 0.015, UB.y0 + 0.05, UB.z1, UB.z1 + 0.01), teakT));
      o.shell.push(boxAt(G, S.step, stepT));
      doorFrame(Kt, o, doorOf('shape_loft'), frameT);
      glazing(Kt, o, S.glass[v], LB.z1, frameT, 'loft:glass:' + v);
      glazing(Kt, o, S.ribbon[v], UB.z1 + 0.01, frameT, 'loft:ribbon:' + v);
      slats(Kt, o, S.accent[v], UB.z1 + 0.01, teakT);
      /* 3 downlights in the soffit (warm, lit from golden hour) and the LED Cyan line under the parapet */
      var dlOff = 'Gunmetal Deep', dlOn = tok(id, 'downlight', 'Window Warm');
      S.down.forEach(function (p, i) {
        var rec = lamp(o, paint(G, G.t(G.tube(0.035, 0.02, { radial: R(Kt, 8) }), { p: p }), 'Cloud White'), { kind: 'warm', off: dlOff, on: dlOn });
        halo(o, 'down' + i, [p[0], p[1] - 0.06, p[2]], lookNum(id, ['show', 'halo', 'size'], 0.35), dlOn, rec);
      });
      var led = S.led;
      lamp(o, box(G, led.x1 - led.x0, 0.016, 0.01, [(led.x0 + led.x1) / 2, led.y, led.z], 'Cloud White'), { kind: 'led', off: 'Gunmetal Deep', on: tok(id, 'led', 'LED Cyan') });
      return o;
    }

    /* ---------------- Neon tower ---------------- */
    function towerBody(Kt, wall, v) {
      var S = SHAPE.shape_tower, G = Kt.G, o = emptyParts(), id = 'shape_tower', st = { wall: wall };
      var wallT = tokenFor(HOME, 'wall', 'WALL.$wall', st), frameT = tok(id, 'frame', 'Gunmetal'), stairT = tok(id, 'stair', 'Gunmetal');
      var plinthT = tok(id, 'plinth', 'Concrete'), B = S.body, A = S.annex, C = S.crown, deck = C.P - 0.08;
      /* plinth and steps, the tower (a roof deck inside its parapet), Concrete Light string courses */
      o.shell.push(G.paintBy(massAt(Kt, S.plinth), function (q) { return q.ny > 0.7 ? 'Concrete Light' : plinthT; }, { perFace: true }));
      S.steps.forEach(function (b) { o.shell.push(boxAt(G, b, plinthT, 'hi')); });
      o.shell.push(wallPaint(G, massAt(Kt, bx(B.x0, B.x1, B.y0, deck, B.z0, B.z1)), wallT, B.y0 + 0.1, 'Night Asphalt'));
      parapet(Kt, o, C, wallT);
      S.floors.forEach(function (y) { o.shell.push(boxAt(G, bx(B.x0 - 0.006, B.x1 + 0.006, y - 0.016, y + 0.016, B.z1, B.z1 + 0.014), 'Concrete Light')); });
      /* the annex (a Concrete roof terrace) and its Gunmetal rail */
      o.shell.push(wallPaint(G, massAt(Kt, A), wallT, 0.1, 'Concrete'));
      var ry = A.y1 + 0.17, posts = [[0.36, A.z1 - 0.02], [0.62, A.z1 - 0.02], [A.x1 - 0.02, A.z1 - 0.02], [A.x1 - 0.02, -0.33], [A.x1 - 0.02, A.z0 + 0.02]];
      posts.forEach(function (p) { o.shell.push(box(G, 0.02, ry - A.y1, 0.02, [p[0], (A.y1 + ry) / 2, p[1]], stairT)); });
      o.shell.push(box(G, A.x1 - 0.36, 0.022, 0.022, [(0.36 + A.x1) / 2, ry, A.z1 - 0.02], stairT));
      o.shell.push(box(G, 0.022, 0.022, A.z1 - A.z0, [A.x1 - 0.02, ry, (A.z0 + A.z1) / 2], stairT));
      doorFrame(Kt, o, doorOf('shape_tower'), frameT);
      S.windows[v].forEach(function (g, k) { glazing(Kt, o, g, B.z1, frameT, 'tower:win:' + v + ':' + k); });
      glazing(Kt, o, S.annexWin, A.z1, frameT, 'tower:annex');
      var ac = S.accent[v];
      slats(Kt, o, ac, ac.face, tok(id, 'accent', 'Teak'));
      towerSign(Kt, o, S.sign);
      towerStair(Kt, o, S.stair, stairT);
      return o;
    }
    /* the sign: a Midnight Ink lightbox on Gunmetal brackets with a member-colour neon edge, the ✦
       and the child's initial (the 'sign' part, collapsed until an island copy opens it) */
    function towerSign(Kt, o, s) {
      var G = Kt.G, id = 'shape_tower', back = tok(id, 'signBack', 'Midnight Ink'), cx = (s.x0 + s.x1) / 2, zf = s.z1;
      o.shell.push(boxAt(G, bx(s.x0, s.x1, s.y0, s.y1, s.z0, s.z1), back));
      [s.y0 + 0.1, s.y1 - 0.1].forEach(function (y) { o.shell.push(box(G, 0.05, 0.03, s.z0 - SHAPE.shape_tower.body.z1 + 0.01, [cx, y, (s.z0 + SHAPE.shape_tower.body.z1) / 2], 'Gunmetal')); });
      var e = 0.03, x0 = s.x0 + e, x1 = s.x1 - e, y0 = s.y0 + e, y1 = s.y1 - e, r = 0.011, edges = [];
      edges.push(rod(Kt, r, [x0 - r, y0, zf + 0.01], [x1 + r, y0, zf + 0.01], 4, true), rod(Kt, r, [x1, y0 - r, zf + 0.01], [x1, y1 + r, zf + 0.01], 4, true),
        rod(Kt, r, [x1 + r, y1, zf + 0.01], [x0 - r, y1, zf + 0.01], 4, true), rod(Kt, r, [x0, y1 + r, zf + 0.01], [x0, y0 - r, zf + 0.01], 4, true));
      var rec = { kind: 'sign' };
      edges.forEach(function (g) { lamp(o, paint(G, g, 'Cloud White'), { kind: 'sign' }); });
      lamp(o, paint(G, G.t(star4(Kt, 0.095, 0.022), { p: [cx, s.y1 - 0.19, zf + 0.012] }), 'Cloud White'), rec);
      halo(o, 'sign', [cx, (s.y0 + s.y1) / 2, zf + 0.1], lookNum(id, ['show', 'halo', 'size'], 0.9), '@member', rec);
      var q = { x0: cx - 0.1, x1: cx + 0.1, y0: s.y0 + 0.16, y1: s.y0 + 0.36, z: zf + 0.004 };
      var quad = quadXY(Kt, q.x0, q.x1, q.y0, q.y1, q.z), pa = quad.getAttribute('position').array;
      for (var i = 0; i < pa.length; i += 3) { pa[i] = (q.x0 + q.x1) / 2; pa[i + 1] = (q.y0 + q.y1) / 2; }
      o.sign.push(paint(G, quad, 'Cloud White'));
      o.meta.sign = q;
    }
    /* the Gunmetal zig-zag stair up the annex front: 6 treads, a landing, a cut (sawtooth) stringer,
       a handrail and an LED dot under each nose (a slow chase at night) */
    function towerStair(Kt, o, s, stairT) {
      var G = Kt.G, rise = s.top / (s.n + 1), run = (s.x0 - s.x1) / s.n, zc = (s.z0 + s.z1) / 2, dz = s.z1 - s.z0, i, saw = [];
      saw.push([s.x0 + 0.03, 0.012, s.z1]);
      for (i = 0; i < s.n; i++) {
        var xf = s.x0 - run * i, xb = xf - run, y = rise * (i + 1);
        o.shell.push(box(G, run + 0.012, 0.022, dz, [(xf + xb) / 2, y - 0.011, zc], stairT, i % 2 ? 'shade' : 0));
        saw.push([xf, y, s.z1], [xb, y, s.z1]);
        lamp(o, box(G, 0.022, 0.012, 0.012, [xf - 0.02, y - 0.03, s.z1 + 0.012], 'Cloud White'), { kind: 'dot', i: i, off: 'Gunmetal Deep', on: 'LED Cyan' });
      }
      var lx0 = SHAPE.shape_tower.annex.x0, lx1 = s.x1;
      o.shell.push(box(G, lx1 - lx0, 0.03, dz, [(lx0 + lx1) / 2, s.top - 0.015, zc], stairT));
      saw.push([lx0, s.top, s.z1]);
      for (i = 0; i + 1 < saw.length; i++) o.shell.push(paint(G, rod(Kt, 0.011, saw[i], saw[i + 1], 4, true), stairT));
      var h0 = [s.x0 + 0.02, 0.36, s.z1], h1 = [lx0 + 0.04, s.top + 0.28, s.z1];
      o.shell.push(paint(G, rod(Kt, 0.011, h0, h1, 4, true), stairT));
      [[h0[0], 0, h0[0], h0[1]], [h1[0], s.top, h1[0], h1[1]]].forEach(function (p) { o.shell.push(box(G, 0.016, p[3] - p[1], 0.016, [p[0], (p[1] + p[3]) / 2, s.z1], stairT)); });
    }

    /* ---------------- Beach villa ---------------- */
    function villaBody(Kt, wall, v) {
      var S = SHAPE.shape_villa, G = Kt.G, o = emptyParts(), id = 'shape_villa', st = { wall: wall }, i;
      var wallT = tokenFor(HOME, 'wall', 'WALL.$wall', st), frameT = tok(id, 'frame', 'Gunmetal');
      var deckT = tok(id, 'deck', 'Teak'), deckB = tok(id, 'deckAlt', 'Teak Light'), copeT = tok(id, 'coping', 'Concrete Light');
      o.shell.push(wallPaint(G, massAt(Kt, S.main), wallT, 0.1, wallT));
      o.shell.push(wallPaint(G, massAt(Kt, S.side), wallT, 0.1, wallT));
      /* the Teak deck: 10 planks in alternating tones, cut round the plunge pool */
      var D = S.deck, n = 10, pw = (D.x1 - D.x0) / n, P = S.pool, cp = 0.035, py = D.y1 + 0.006;
      for (i = 0; i < n; i++) {
        var px0 = D.x0 + pw * i + 0.003, px1 = px0 + pw - 0.006, tone = i % 2 ? deckB : deckT;
        var runs = px1 > P.x0 - cp && px0 < P.x1 + cp ? [[D.z0, P.z0 - cp], [P.z1 + cp, D.z1]] : [[D.z0, D.z1]];
        runs.forEach(function (z) { if (z[1] - z[0] > 0.01) o.shell.push(boxAt(G, bx(px0, px1, 0, D.y1, z[0], z[1]), tone)); });
      }
      /* the plunge pool: Concrete Light coping round a lit water surface and its ripple ring */
      [bx(P.x0 - cp, P.x1 + cp, D.y1 - 0.01, py, P.z1, P.z1 + cp), bx(P.x0 - cp, P.x1 + cp, D.y1 - 0.01, py, P.z0 - cp, P.z0),
        bx(P.x0 - cp, P.x0, D.y1 - 0.01, py, P.z0, P.z1), bx(P.x1, P.x1 + cp, D.y1 - 0.01, py, P.z0, P.z1)].forEach(function (b) { o.shell.push(boxAt(G, b, copeT)); });
      var water = new THREE.PlaneGeometry(P.x1 - P.x0, P.z1 - P.z0, 4, 4);
      water = G.t(G.normalise(water), { r: [-90, 0, 0], p: [(P.x0 + P.x1) / 2, P.y1, (P.z0 + P.z1) / 2] });
      var pcx = (P.x0 + P.x1) / 2, pcz = (P.z0 + P.z1) / 2;
      G.paintBy(water, function (q) { var d = Math.sqrt(Math.pow((q.x - pcx) / 0.3, 2) + Math.pow((q.z - pcz) / 0.24, 2)); return ['Cloud White', -0.22 * Math.min(1, d)]; });
      var poolRec = lamp(o, water, { kind: 'pool', off: tok(id, 'pool', 'Lagoon'), on: tok(id, 'poolGlow', 'LED Cyan') });
      halo(o, 'pool', [pcx, P.y1 + 0.12, pcz], lookNum(id, ['show', 'halo', 'size'], 0.8), tok(id, 'poolGlow', 'LED Cyan'), poolRec);
      var rp = S.ripple, ring = new THREE.RingGeometry(rp.r * RIPPLE.rest - 0.012, rp.r * RIPPLE.rest + 0.012, R(Kt, 24));
      lamp(o, paint(G, G.t(G.normalise(ring), { r: [-90, 0, 0], p: [rp.x, rp.y, rp.z] }), 'Cloud White'),
        { kind: 'ripple', cx: rp.x, cz: rp.z, off: tok(id, 'pool', 'Lagoon'), glow: tok(id, 'poolGlow', 'LED Cyan'), on: tok(id, 'cushion', 'Bone White') });
      /* a lounger: Teak frame, Bone White cushion with a raised back */
      var Lg = S.lounger, cushT = tok(id, 'cushion', 'Bone White');
      o.shell.push(boxAt(G, bx(Lg.x0, Lg.x1, Lg.y0, Lg.y0 + 0.05, Lg.z0, Lg.z1), deckT, 'shade'));
      o.shell.push(boxAt(G, bx(Lg.x0 + 0.01, Lg.x1 - 0.01, Lg.y0 + 0.05, Lg.y1, Lg.z0 + 0.12, Lg.z1 - 0.01), cushT));
      o.shell.push(G.t(box(G, Lg.x1 - Lg.x0 - 0.02, 0.035, 0.16, [0, 0, 0], cushT), { r: [55, 0, 0], p: [(Lg.x0 + Lg.x1) / 2, Lg.y1 + 0.03, Lg.z0 + 0.08] }));
      /* glass sliders to the deck in a fixed Teak band; the side-wing door with a 4-light transom */
      var sl = S.sliders[v], zf = S.main.z1;
      [bx(sl.x0 - 0.06, sl.x1 + 0.06, sl.y1 + 0.022, sl.y1 + 0.07, zf, zf + 0.018), bx(sl.x0 - 0.06, sl.x0 - 0.022, sl.y0 - 0.02, sl.y1 + 0.022, zf, zf + 0.018),
        bx(sl.x1 + 0.022, sl.x1 + 0.06, sl.y0 - 0.02, sl.y1 + 0.022, zf, zf + 0.018)].forEach(function (b) { o.shell.push(boxAt(G, b, deckT)); });
      glazing(Kt, o, sl, zf, frameT, 'villa:sliders:' + v);
      doorFrame(Kt, o, doorOf('shape_villa'), frameT);
      glazing(Kt, o, S.transom, S.side.z1, frameT, 'villa:transom');
      o.shell.push(boxAt(G, bx(-0.72, -0.28, 0, 0.04, S.side.z1, S.side.z1 + 0.12), tok(id, 'step', 'Concrete')));
      /* the porthole and the accent slats swap sides between the two trims */
      var ph = S.porthole[v];
      o.shell.push(paint(G, G.t(G.tube(ph.r + 0.022, 0.024, { radial: R(Kt, 12) }), { r: [90, 0, 0], p: [ph.x, ph.y, S.side.z1 + 0.012] }), frameT));
      o.window.push(paint(G, G.t(G.tube(ph.r, 0.02, { radial: R(Kt, 12) }), { r: [90, 0, 0], p: [ph.x, ph.y, S.side.z1 + 0.022] }), 'Cloud White', -0.1));
      slats(Kt, o, S.accent[v], S.side.z1, deckT);
      /* 3 warm deck-edge lights */
      S.deckLights.forEach(function (p, k) {
        var rec = lamp(o, paint(G, G.t(G.tube(0.022, 0.03, { radial: R(Kt, 8) }), { p: p }), 'Cloud White'), { kind: 'warm', off: 'Gunmetal Deep', on: 'Window Warm' });
        halo(o, 'deck' + k, [p[0], p[1] + 0.05, p[2]], 0.25, 'Window Warm', rec);
      });
      return o;
    }

    /* ---------------- Sky dome ---------------- */
    function domeBody(Kt, wall, v) {
      var S = SHAPE.shape_dome, G = Kt.G, o = emptyParts(), id = 'shape_dome', st = { wall: wall }, low = Kt.tier === 'LOW';
      var wallT = tokenFor(HOME, 'wall', 'WALL.$wall', st), frameT = tok(id, 'frame', 'Gunmetal'), ringT = tok(id, 'ring', 'Gunmetal');
      var segs = low ? 12 : 16, zc = S.zc;
      /* the drum (its caps hidden under the dome and on the ground) with a darker skirting */
      o.shell.push(wallPaint(G, G.t(G.tube(S.R, S.drum, { radial: segs, open: true }), { p: [0, S.drum / 2, zc] }), wallT, 0.1));
      /* the airlock: an arched portal and the pocket wall the door slides into */
      var Pt = S.portal, pw = Pt.x1 - Pt.x0, pd = Pt.z1 - Pt.z0;
      o.shell.push(wallPaint(G, boxAt(G, bx(Pt.x0, Pt.x1, 0, Pt.y1, Pt.z0, Pt.z1), wallT), wallT, 0.1));
      o.shell.push(wallPaint(G, G.t(G.tube(pw / 2, pd, { radial: R(Kt, 16) }), { r: [90, 0, 0], p: [0, Pt.y1, (Pt.z0 + Pt.z1) / 2] }), wallT, -1));
      o.shell.push(wallPaint(G, boxAt(G, S.pocket, wallT), wallT, 0.1));
      o.shell.push(boxAt(G, bx(S.pocket.x0, S.pocket.x1, S.pocket.y1, S.pocket.y1 + 0.03, S.pocket.z0, S.pocket.z1 + 0.01), frameT));
      var d = doorOf('shape_dome');
      doorFrame(Kt, o, d, frameT);
      o.shell.push(boxAt(G, bx(S.pocket.x0 + 0.02, d.x + d.w / 2 + 0.03, d.y0 + d.h + 0.02, d.y0 + d.h + 0.045, d.z, d.z + 0.044), frameT));
      lamp(o, box(G, 0.022, S.ledStrip.y1 - S.ledStrip.y0, 0.01, [S.ledStrip.x, (S.ledStrip.y0 + S.ledStrip.y1) / 2, S.ledStrip.z], 'Cloud White'), { kind: 'led', off: 'Gunmetal Deep', on: tok(id, 'led', 'LED Cyan') });
      /* the Gunmetal equator ring and its LED band (a moving NEON3 hue at Showtime) */
      o.shell.push(paint(G, G.t(G.normalise(new THREE.TorusGeometry(S.R + 0.012, 0.035, 4, low ? 14 : 20)), { r: [90, 0, 0], p: [0, S.drum, zc] }), ringT));
      var bandY = S.drum - 0.055;
      var band = lamp(o, paint(G, G.t(G.tube(S.R + 0.007, 0.03, { radial: low ? 16 : 24, open: true }), { p: [0, bandY, zc] }), 'Cloud White'), { kind: 'ring', cz: zc, off: 'Gunmetal Mid' });
      halo(o, 'ring', [0, bandY, zc + S.R + 0.1], lookNum(id, ['show', 'halo', 'size'], 0.6), tok(id, 'led', 'LED Cyan'), band);
      /* the glass pod on a Gunmetal collar, the antenna and its breathing amber tip */
      o.shell.push(paint(G, G.t(G.tube(S.pod.r + 0.02, 0.07, { radial: R(Kt, 12) }), { p: [0, S.pod.collar, zc] }), ringT));
      o.window.push(paint(G, G.t(G.puff(S.pod.r), { p: [0, S.pod.y, zc] }), 'Cloud White', -0.08));
      var an = S.antenna;
      o.shell.push(paint(G, G.t(G.tube(an.r, an.y1 - an.y0, { radial: R(Kt, 6) }), { p: [0, (an.y0 + an.y1) / 2, zc] }), tok(id, 'antenna', 'Gunmetal')));
      var tip = lamp(o, paint(G, G.t(G.normalise(new THREE.OctahedronGeometry(an.tip, 0)), { p: [0, S.top - an.tip, zc] }), 'Cloud White'), { kind: 'tip', on: tok(id, 'tip', 'Sunset Amber') });
      halo(o, 'tip', [0, S.top - an.tip, zc], 0.25, tok(id, 'tip', 'Sunset Amber'), tip, 'tip');
      /* 4 portholes (the front pair become wide capsule windows on trim 1) and an accent fin */
      var P = S.porthole;
      S.portholes[v].forEach(function (deg, k) {
        var a = deg * DEG, nx = Math.cos(a), nz = Math.sin(a), px = (S.R + 0.006) * nx, pz = zc + (S.R + 0.006) * nz, yaw = 90 - deg;
        if (S.capsule[v] && k < 2) {
          /* a wide capsule window: a box with round ends, framed, turned to face out of the drum */
          [[0.3 + 0.05, 0.14 + 0.05, 0.02, frameT, 0], [0.3, 0.14, 0.03, 'Cloud White', 1]].forEach(function (L) {
            var hw = (L[0] - L[1]) / 2, rr = L[1] / 2, sh = L[4] ? -0.12 : 0, list = [box(G, 2 * hw, L[1], L[2], [0, 0, 0], L[3], sh)];
            [-1, 1].forEach(function (sx) { list.push(paint(G, G.t(G.tube(rr, L[2], { radial: R(Kt, 8) }), { r: [90, 0, 0], p: [sx * hw, 0, 0] }), L[3], sh)); });
            list.forEach(function (g) { (L[4] ? o.window : o.shell).push(G.t(g, { r: [0, yaw, 0], p: [px + nx * 0.01 * L[4], P.y, pz + nz * 0.01 * L[4]] })); });
          });
          return;
        }
        o.shell.push(paint(G, aim(G.tube(P.r + 0.025, 0.03, { radial: R(Kt, 10) }), [nx, 0, nz], [px, P.y, pz]), frameT));
        o.window.push(paint(G, aim(G.tube(P.r, 0.03, { radial: R(Kt, 10) }), [nx, 0, nz], [px + nx * 0.008, P.y, pz + nz * 0.008]), 'Cloud White', -0.1));
      });
      var fa = S.accent[v] * DEG;
      o.shell.push(paint(G, G.t(G.slab(0.05, 0.5, 0.12, 0), { r: [0, 90 - S.accent[v], 0], p: [(S.R + 0.04) * Math.cos(fa), 0.3, zc + (S.R + 0.04) * Math.sin(fa)] }), 'Concrete Light'));
      return o;
    }

    /* ================================================================
       CROWNS — the roof slot on modern shapes
       ================================================================ */
    function roofTokens(roof) {
      if (roof === 'roof_castle') return { base: tokenFor(roof, 'roof', 'Castle Stone'), shade: tokenFor(roof, 'tower', 'Castle Tower') };
      return { base: tokenFor(roof, 'roof', 'ROOF.' + roof + '.0'), shade: tokenFor(roof, 'shade', 'ROOF.' + roof + '.1') };
    }
    function shadeBy(G, g, base, shade) { return G.paintBy(g, function (v) { return v.nx > 0.3 || v.nz < -0.5 || v.ny < -0.5 ? shade : base; }, { perFace: true }); }
    /* sprinkles lying on a surface: n rods {p, dir} → candy-coloured 4-sided open tubes */
    function sprinkleRods(Kt, o, list, roof) {
      var G = Kt.G;
      list.forEach(function (s, i) {
        var t = 's' + (i % 5 + 1);
        o.shell.push(paint(G, aim(G.tube(0.012, 0.055, { radial: 4, open: true }), s.dir, s.p), tokenFor(roof, t, SPRINKLE_FALLBACK[t])));
      });
    }
    function cherryAt(Kt, o, p, r, stemTop) {
      var G = Kt.G, T = tokenFor('roof_candy', 'cherry', 'Tulip Red');
      o.shell.push(G.paintBy(G.t(G.puff(r), { p: p }), function (v) { return v.x < p[0] - 0.02 && v.y > p[1] + r * 0.4 ? [T, 'hi'] : T; }, { perFace: true }));
      o.shell.push(paint(G, rod(Kt, 0.008, [p[0], p[1] + r * 0.8, p[2]], [p[0] + 0.012, stemTop, p[2]], 4, true), 'Leaf Deep'));
    }
    /* a castle turret standing on y0: body, stone band, Castle Cone spire to coneTop, pole + pennant to top */
    function turret(Kt, o, x, z, r, y0, yTop, coneTop, top, side, corbel) {
      var G = Kt.G, id = 'roof_castle', stone = tokenFor(id, 'roof', 'Castle Stone'), towerT = tokenFor(id, 'tower', 'Castle Tower');
      var coneT = tokenFor(id, 'cone', 'Castle Cone'), slitT = tokenFor(id, 'slit', 'Lamp Post');
      if (corbel) o.shell.push(paint(G, G.t(G.cone(r, 0.18, R(Kt, 10)), { r: [180, 0, 0], p: [x, y0 - 0.09, z] }), stone, 'shade'));
      o.shell.push(paint(G, G.t(G.tube(r, yTop - y0, { radial: R(Kt, 12), open: !corbel }), { p: [x, (y0 + yTop) / 2, z] }), towerT));
      o.shell.push(paint(G, G.t(G.tube(r + 0.022, 0.07, { radial: R(Kt, 12) }), { p: [x, yTop, z] }), stone));
      var ch = coneTop - yTop - 0.035;
      o.shell.push(G.paintBy(G.t(G.cone(r + 0.03, ch, R(Kt, 12)), { p: [x, yTop + 0.035 + ch / 2, z] }), function (v) { return v.nx > 0.4 ? [coneT, 'shade'] : coneT; }, { perFace: true }));
      o.shell.push(paint(G, G.t(G.tube(0.01, top - coneTop + 0.04, { radial: 4, open: true }), { p: [x, (coneTop - 0.04 + top) / 2, z] }), slitT));
      var pen = G.t(G.cone(0.045, 0.16, 3), { s: [1, 1, 0.3], r: [0, 0, -side * 90], p: [x + side * 0.09, top - 0.045, z] });
      o.shell.push(paint(G, pen, tokenFor(id, side < 0 ? 'pennantL' : 'pennantR', side < 0 ? 'Coral' : 'Star Gold')));
      o.shell.push(box(G, 0.04, 0.12, 0.02, [x, (y0 + yTop) / 2, z + r - 0.004], slitT));
    }

    /* flat-parapet crowns (loft, tower) */
    function crownFlat(Kt, shape, roof) {
      var S = SHAPE[shape], C = S.crown, G = Kt.G, o = emptyParts(), H = roofTop(roof, shape), low = Kt.tier === 'LOW';
      var P = C.P, t = C.t, deck = P - 0.08, ix0 = C.x0 + t, ix1 = C.x1 - t, iz0 = C.z0 + t, iz1 = C.z1 - t, T = roofTokens(roof);
      function coping(token, tn, h, over) {
        [bx(C.x0 - over, C.x1 + over, P, P + h, C.z1 - t, C.z1 + over), bx(C.x0 - over, C.x1 + over, P, P + h, C.z0 - over, C.z0 + t),
          bx(C.x0 - over, C.x0 + t, P, P + h, C.z0 + t, C.z1 - t), bx(C.x1 - t, C.x1 + over, P, P + h, C.z0 + t, C.z1 - t)].forEach(function (b) { o.shell.push(boxAt(G, b, token, tn)); });
      }
      if (roof === 'roof_red' || roof === 'roof_blue') {
        var red = roof === 'roof_red';
        coping(T.shade, red ? 0 : 'shade', 0.035, 0.012);
        /* a mono-pitch roof inside the parapet, rising to the back: tiles read straight at the camera */
        var zf = iz1 - 0.01, zb = iz0 + 0.01, yF = P + 0.01, yB = H - 0.022, x0 = ix0 + 0.01, x1 = ix1 - 0.01;
        o.shell.push(shadeBy(G, wedge(Kt, x0, x1, zf, zb, deck, yF, yB), T.base, T.shade));
        o.shell.push(paint(G, rod(Kt, 0.022, [x0 - 0.01, yB, zb], [x1 + 0.01, yB, zb], 6), T.shade));
        var len = Math.sqrt((zb - zf) * (zb - zf) + (yB - yF) * (yB - yF)), ny = (zf - zb) / len, nz = (yB - yF) / len;
        (red ? [0.2, 0.4, 0.6, 0.8] : [0.17, 0.34, 0.51, 0.68, 0.85]).forEach(function (u) {
          var z = zf + (zb - zf) * u, y = yF + (yB - yF) * u;
          if (red) o.shell.push(paint(G, rod(Kt, 0.02, [x0 + 0.02, y + ny * 0.014, z + nz * 0.014], [x1 - 0.02, y + ny * 0.014, z + nz * 0.014], 6, true), T.shade));
          else o.shell.push(paint(G, G.t(G.slab(x1 - x0 - 0.04, 0.008, 0.05, 0), { r: [-Math.atan2(yB - yF, zf - zb) / DEG, 0, 0], p: [(x0 + x1) / 2, y + ny * 0.005, z + nz * 0.005] }), T.shade));
        });
        /* slate: a slate fascia round the top storey */
        if (!red) {
          [bx(C.x0 - 0.008, C.x1 + 0.008, P - 0.11, P - 0.01, C.z1, C.z1 + 0.008), bx(C.x0 - 0.008, C.x0, P - 0.11, P - 0.01, C.z0, C.z1),
            bx(C.x1, C.x1 + 0.008, P - 0.11, P - 0.01, C.z0, C.z1)].forEach(function (b) { o.shell.push(boxAt(G, b, T.base)); });
        }
        /* the tower's entrance canopy in the same finish */
        if (shape === 'shape_tower') {
          var d = doorOf(shape), cy = d.y0 + d.h + 0.1, cz0 = d.z, cz1 = d.z + 0.26, ang = Math.atan2(0.07, 0.26) / DEG;
          o.shell.push(paint(G, G.t(G.slab(d.w + 0.2, 0.03, 0.28, 0), { r: [ang, 0, 0], p: [d.x, cy, (cz0 + cz1) / 2] }), T.base));
          o.shell.push(paint(G, rod(Kt, 0.018, [d.x - d.w / 2 - 0.1, cy - 0.04, cz1 - 0.01], [d.x + d.w / 2 + 0.1, cy - 0.04, cz1 - 0.01], 6), T.shade));
          [-1, 1].forEach(function (sx) { o.shell.push(paint(G, rod(Kt, 0.008, [d.x + sx * (d.w / 2 + 0.06), cy - 0.02, cz1 - 0.03], [d.x + sx * (d.w / 2 + 0.06), cy + 0.2, d.z + 0.005], 4, true), 'Gunmetal')); });
        }
      } else if (roof === 'roof_thatch') {
        var straw = tokenFor(roof, 'straw', 'Straw'), pg = S.pergola;
        coping(T.shade, 0, 0.03, 0.01);
        /* a straw pergola: 4 Teak posts under a fluffy straw cushion with a tuft fringe */
        var cushionY = H - 0.07;
        [[pg.x0 + 0.05, pg.z0 + 0.05], [pg.x1 - 0.05, pg.z0 + 0.05], [pg.x0 + 0.05, pg.z1 - 0.05], [pg.x1 - 0.05, pg.z1 - 0.05]].forEach(function (p) {
          o.shell.push(paint(G, G.t(G.tube(0.022, cushionY - 0.06 - deck, { radial: R(Kt, 6) }), { p: [p[0], (deck + cushionY - 0.06) / 2, p[1]] }), 'Teak'));
        });
        var cw = pg.x1 - pg.x0, cd = pg.z1 - pg.z0;
        var cushion = G.t(G.slab(cw, 0.14, cd, 0.06), { p: [(pg.x0 + pg.x1) / 2, cushionY, (pg.z0 + pg.z1) / 2] });
        o.shell.push(G.paintBy(cushion, function (v) { return v.ny > 0.6 ? (Math.floor((v.x - pg.x0) / 0.09) % 2 ? T.shade : T.base) : T.shade; }, { perFace: true }));
        var nx = low ? 3 : 5, nz = low ? 2 : 4, list = [], k;
        for (k = 0; k < nx; k++) { var fx = pg.x0 + cw * (k + 0.5) / nx; list.push([fx, pg.z1, 0, 1], [fx, pg.z0, 0, -1]); }
        for (k = 0; k < nz; k++) { var fz = pg.z0 + cd * (k + 0.5) / nz; list.push([pg.x0, fz, -1, 0], [pg.x1, fz, 1, 0]); }
        list.forEach(function (q) {
          var dir = [q[2] * 0.53, -0.85, q[3] * 0.53];
          o.shell.push(paint(G, aim(G.cone(0.04, 0.13, R(Kt, 5)), dir, [q[0] + q[2] * 0.035 + dir[0] * 0.05, cushionY - 0.05 + dir[1] * 0.05, q[1] + q[3] * 0.035 + dir[2] * 0.05]), straw));
        });
      } else if (roof === 'roof_candy') {
        var icing = tokenFor(roof, 'icing', 'Cloud White'), r = 0.042, yc = P + 0.012;
        o.shell.push(boxAt(G, bx(ix0, ix1, deck, deck + 0.02, iz0, iz1), T.base));
        /* thick icing rolls along the parapet, overlapping at the corners */
        var mx = t / 2;
        [[[C.x0 - r + mx, yc, C.z1 - mx], [C.x1 + r - mx, yc, C.z1 - mx]], [[C.x0 - r + mx, yc, C.z0 + mx], [C.x1 + r - mx, yc, C.z0 + mx]],
          [[C.x0 + mx, yc, C.z0 + mx], [C.x0 + mx, yc, C.z1 - mx]], [[C.x1 - mx, yc, C.z0 + mx], [C.x1 - mx, yc, C.z1 - mx]]].forEach(function (e) {
          o.shell.push(paint(G, rod(Kt, r, e[0], e[1], 8), icing));
        });
        /* 12 drips down the outer faces: 4 front, 3 down each side, 2 at the back */
        var dr = [], w = C.x1 - C.x0, dd = C.z1 - C.z0;
        [0.15, 0.4, 0.62, 0.86].forEach(function (u) { dr.push([C.x0 + w * u, C.z1 + 0.022]); });
        [0.25, 0.55, 0.85].forEach(function (u) { dr.push([C.x0 - 0.022, C.z0 + dd * u], [C.x1 + 0.022, C.z0 + dd * u]); });
        [0.3, 0.7].forEach(function (u) { dr.push([C.x0 + w * u, C.z0 - 0.022]); });
        dr.forEach(function (p, k) {
          var h = DRIP_LENS[k];
          o.shell.push(paint(G, G.t(G.tube(0.024, 0.032, h, { radial: R(Kt, 6) }), { p: [p[0], P - 0.01 - h / 2, p[1]] }), icing));
        });
        /* 24 sprinkles on the pink roof and the icing */
        var rr = rng('crown:candy:' + shape), sp = [];
        for (k = 0; k < (low ? 16 : 24); k++) {
          var th = rr() * Math.PI * 2;
          sp.push({ p: [ix0 + 0.05 + rr() * (ix1 - ix0 - 0.1), deck + 0.026, iz0 + 0.05 + rr() * (iz1 - iz0 - 0.1)], dir: [Math.cos(th), 0, Math.sin(th)] });
        }
        sprinkleRods(Kt, o, sp, roof);
        var cr = Math.max(0.06, Math.min(0.1, (H - P - 0.09) / 2));
        cherryAt(Kt, o, [Math.max(C.x0 + mx, -MARGIN + cr + 0.012), P + 0.05 + cr, Math.min(C.z1 - mx, MARGIN - cr - 0.012)], cr, H);
      } else {
        /* castle: a stone coping, merlons round every edge and 2 corbelled corner turrets */
        coping(T.base, 0, 0.03, 0.012);
        var my = P + 0.03 + 0.06, tr = 0.15, mt = t + 0.02;
        var merlons = function (xa, za, xb, zb, alongX) {
          var n = Math.max(2, Math.round((alongX ? Math.abs(xb - xa) : Math.abs(zb - za)) / 0.19));
          for (var q = 0; q < n; q++) {
            var u = (q + 0.5) / n, x = xa + (xb - xa) * u, z = za + (zb - za) * u;
            if (z > C.z1 - 2 * tr - 0.04 && (x < C.x0 + 2 * tr + 0.04 || x > C.x1 - 2 * tr - 0.04)) continue;   /* the corner turrets stand there */
            o.shell.push(box(G, alongX ? 0.1 : mt, 0.12, alongX ? mt : 0.1, [x, my, z], T.base));
          }
        };
        merlons(C.x0, C.z1 - t / 2, C.x1, C.z1 - t / 2, true);
        merlons(C.x0, C.z0 + t / 2, C.x1, C.z0 + t / 2, true);
        merlons(C.x0 + t / 2, C.z0, C.x0 + t / 2, C.z1, false);
        merlons(C.x1 - t / 2, C.z0, C.x1 - t / 2, C.z1, false);
        var coneTop = H - 0.1, yTop = Math.min(P + 0.15, coneTop - 0.3), yb = yTop - 0.5;
        turret(Kt, o, C.x0 + tr, C.z1 - tr, tr, yb, yTop, coneTop, H, -1, true);
        turret(Kt, o, C.x1 - tr, C.z1 - tr, tr, yb, yTop, coneTop, H, 1, true);
      }
      return o;
    }

    /* hip crowns (the villa) */
    function crownHip(Kt, roof) {
      var S = SHAPE.shape_villa, G = Kt.G, o = emptyParts(), H = roofTop(roof, 'shape_villa'), T = roofTokens(roof), low = Kt.tier === 'LOW', k;
      if (roof === 'roof_castle') {
        var stone = T.base;
        [S.main, S.side].forEach(function (b) { o.shell.push(boxAt(G, bx(b.x0 - 0.01, b.x1 + 0.01, b.y1, b.y1 + 0.07, b.z0 - 0.01, b.z1 + 0.01), stone)); });
        var my = S.main.y1 + 0.07 + 0.055;
        for (k = 0; k < 8; k++) o.shell.push(box(G, 0.09, 0.11, 0.07, [-0.07 + k * 0.12, my, S.main.z1 - 0.025], stone));
        for (k = 0; k < 4; k++) o.shell.push(box(G, 0.09, 0.11, 0.07, [S.side.x0 + 0.14 + k * 0.15, my, S.side.z1 - 0.025], stone));
        for (k = 0; k < 6; k++) o.shell.push(box(G, 0.07, 0.11, 0.09, [S.main.x1 - 0.025, my, S.main.z0 + 0.08 + k * 0.13], stone));
        for (k = 0; k < 4; k++) o.shell.push(box(G, 0.07, 0.11, 0.09, [S.main.x0 + 0.025, my, S.main.z0 + 0.08 + k * 0.16], stone));
        for (k = 0; k < 3; k++) [S.side.x0 + 0.025, S.side.x1 - 0.025].forEach(function (x) { o.shell.push(box(G, 0.07, 0.11, 0.09, [x, my, 0.02 + k * 0.17], stone)); });
        turret(Kt, o, S.side.x0 + 0.13, S.side.z1 - 0.12, 0.13, 0, 1.4, H - 0.1, H, -1, false);
        turret(Kt, o, S.main.x1 - 0.13, S.main.z1 - 0.12, 0.13, 0, 1.4, H - 0.1, H, 1, false);
        return o;
      }
      var thatch = roof === 'roof_thatch', candy = roof === 'roof_candy', icing = tokenFor('roof_candy', 'icing', 'Cloud White');
      S.hips.forEach(function (h, hi) {
        var r = hipRidge(h), corners = [[h.x0, h.y0, h.z1], [h.x1, h.y0, h.z1], [h.x1, h.y0, h.z0], [h.x0, h.y0, h.z0]];
        var roofG = hip(Kt, h);
        if (thatch) G.paintBy(roofG, function (v) { return Math.floor((v.x + v.z) / 0.1) % 2 ? T.shade : T.base; }, { perFace: true });
        else shadeBy(G, roofG, T.base, T.shade);
        o.shell.push(roofG);
        var rollT = candy ? icing : T.shade, rr = candy ? 0.03 : thatch ? 0.045 : 0.02;
        /* rolls along the ridge (its top 0.02 above the apex: the crown top) and the 4 hip edges */
        var lift = 0.02 - rr, ra = [r.r1[0], r.r1[1] + lift, r.r1[2]], rb = [r.r2[0], r.r2[1] + lift, r.r2[2]];
        o.shell.push(paint(G, rod(Kt, rr, ra, rb, 6), rollT));
        [[corners[0], r.r1], [corners[1], r.along === 'x' ? r.r2 : r.r1], [corners[2], r.r2], [corners[3], r.along === 'x' ? r.r1 : r.r2]].forEach(function (e) {
          if (!thatch) o.shell.push(paint(G, rod(Kt, rr * 0.8, e[0], e[1], 5, true), rollT));
        });
        /* contour rows (tile, slate) or the eave lip (straw, icing) */
        if (roof === 'roof_red' || roof === 'roof_blue') {
          (roof === 'roof_red' ? [0.28, 0.55, 0.8] : [0.22, 0.42, 0.62, 0.82]).forEach(function (u) {
            var ins = u * r.run - 0.012, y = h.y0 + (h.apex - h.y0) * u + 0.01, x0 = h.x0 + ins, x1 = h.x1 - ins, z0 = h.z0 + ins, z1 = h.z1 - ins;
            if (x1 - x0 < 0.05 || z1 - z0 < 0.05) return;
            var pts = [[x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0]];
            for (var e = 0; e < 4; e++) {
              if (hi === 1 && e === 2) continue;                    /* the side wing's back edge hides in the main roof */
              if (roof === 'roof_red') o.shell.push(paint(G, rod(Kt, 0.017, pts[e], pts[(e + 1) % 4], 5, true), T.shade));
              else o.shell.push(paint(G, rod(Kt, 0.007, pts[e], pts[(e + 1) % 4], 4, true), T.shade));
            }
          });
        } else {
          var lip = thatch ? 0.05 : 0.032, eave = [[h.x0, h.y0, h.z1], [h.x1, h.y0, h.z1], [h.x1, h.y0, h.z0], [h.x0, h.y0, h.z0]];
          for (var e2 = 0; e2 < 4; e2++) {
            if (hi === 1 && e2 === 2) continue;
            var a = eave[e2], b = eave[(e2 + 1) % 4];
            o.shell.push(paint(G, rod(Kt, lip, a, b, thatch ? 8 : 6), thatch ? T.shade : icing));
          }
        }
      });
      if (thatch) {
        /* a straw-tuft fringe along the front eaves (the side eaves sit on the footprint margin) */
        var M = S.hips[0], Sd = S.hips[1], fr = [];
        for (k = 0; k < (low ? 7 : 11); k++) { var fx = M.x0 + 0.08 + (M.x1 - M.x0 - 0.16) * k / (low ? 6 : 10); if (fx > Sd.x1 + 0.03) fr.push([fx, M.z1]); }
        for (k = 0; k < (low ? 3 : 5); k++) fr.push([Sd.x0 + 0.08 + (Sd.x1 - Sd.x0 - 0.16) * k / (low ? 2 : 4), Sd.z1]);
        fr.forEach(function (q) {
          var dir = [0, -0.86, 0.5];
          o.shell.push(paint(G, aim(G.cone(0.04, 0.12, R(Kt, 5)), dir, [q[0], M.y0 - 0.03, q[1] + 0.04]), tokenFor(roof, 'straw', 'Straw')));
        });
      }
      if (candy) {
        /* 12 drips under the eaves, 24 sprinkles on the slopes, the cherry on the main ridge */
        var Mh = S.hips[0], dl = [];
        [0.0, 0.2, 0.38, 0.56, 0.74].forEach(function (x) { dl.push([x, Mh.z1 + 0.03]); });
        [-0.82, -0.6, -0.38, -0.18].forEach(function (x) { dl.push([x, S.hips[1].z1 + 0.03]); });
        [-0.25, -0.6].forEach(function (z) { dl.push([Mh.x1 + 0.03, z]); });
        dl.push([Mh.x0 - 0.03, -0.5]);
        dl.forEach(function (p, i) {
          var hh = DRIP_LENS[i];
          o.shell.push(paint(G, G.t(G.tube(0.022, 0.03, hh, { radial: R(Kt, 6) }), { p: [p[0], Mh.y0 - 0.02 - hh / 2, p[1]] }), icing));
        });
        var rr2 = rng('crown:candy:villa'), sp = [], rid = hipRidge(Mh), rise = Mh.apex - Mh.y0, sl = Math.sqrt(rise * rise + rid.run * rid.run);
        for (k = 0; k < (low ? 16 : 24); k++) {
          /* on the front slope (70%) or the back one, lying along it: dir = cos·x̂ + sin·(up the slope) */
          var u = 0.15 + rr2() * 0.65, x = Mh.x0 + rid.run * u + 0.06 + rr2() * (Mh.x1 - Mh.x0 - 2 * rid.run * u - 0.12), front = rr2() < 0.7;
          var zz = front ? Mh.z1 - u * rid.run : Mh.z0 + u * rid.run, yy = Mh.y0 + rise * u + 0.012, th = rr2() * Math.PI * 2;
          var uz = (front ? -1 : 1) * rid.run / sl, uy = rise / sl;
          sp.push({ p: [x, yy, zz + (front ? 0.008 : -0.008)], dir: [Math.cos(th), uy * Math.sin(th), uz * Math.sin(th)] });
        }
        sprinkleRods(Kt, o, sp, roof);
        var cr = 0.045;
        cherryAt(Kt, o, [0.1, Mh.apex + 0.03 + cr, rid.r1[2]], cr, H);
      }
      return o;
    }

    /* dome-shell crowns */
    function domeProfile(n, lumpy) {
      var D = SHAPE.shape_dome, out = [];
      for (var k = 0; k <= n; k++) {
        var phi = (k / n) * Math.PI / 2;
        out.push([(D.R + 0.006) * Math.cos(phi) * (lumpy && k > 0 && k < n ? (k % 2 ? 1.035 : 0.985) : 1), D.drum + D.rise * Math.sin(phi)]);
      }
      return out;
    }
    function crownDome(Kt, roof) {
      var D = SHAPE.shape_dome, G = Kt.G, o = emptyParts(), T = roofTokens(roof), low = Kt.tier === 'LOW', segs = low ? 12 : 16, k;
      var thatch = roof === 'roof_thatch', zc = D.zc;
      var shell = lathe(Kt, domeProfile(low ? 5 : 6, thatch), segs, zc);
      if (thatch) G.paintBy(shell, function (v) { return Math.floor((Math.atan2(v.z - zc, v.x) + Math.PI) / (Math.PI / 8)) % 2 ? T.shade : T.base; }, { perFace: true });
      else if (roof === 'roof_castle') G.paint(shell, tokenFor(roof, 'roof', 'Castle Stone'));
      else shadeBy(G, shell, T.base, T.shade);
      o.shell.push(shell);
      function onDome(phi, lift) { return { r: D.R * Math.cos(phi) + lift, y: D.drum + D.rise * Math.sin(phi) }; }
      /* n angles spread round the seam where the camera sees it: clear of the airlock (52°…142°) and of
         the back (232°…308°, hidden behind the dome and on the footprint margin) */
      function seam(n) {
        var out = [], arcs = [[142, 232], [308, 412]], total = 90 + 104;
        for (var q = 0; q < n; q++) {
          var u = total * (q + 0.5) / n;
          out.push((u < 90 ? arcs[0][0] + u : arcs[1][0] + u - 90) * DEG);
        }
        return out;
      }
      if (roof === 'roof_red') {
        [18, 36, 54, 70].forEach(function (d) {
          var p = onDome(d * DEG, 0.01);
          o.shell.push(paint(G, G.t(G.normalise(new THREE.TorusGeometry(p.r, 0.02, 3, segs)), { r: [90, 0, 0], p: [0, p.y, zc] }), T.shade));
        });
      } else if (roof === 'roof_blue') {
        [12, 24, 36, 48, 60, 72].forEach(function (d) {
          var a = onDome(d * DEG, 0.006), b = onDome((d + 3) * DEG, 0.006);
          o.shell.push(paint(G, G.t(G.tube(b.r, a.r, b.y - a.y, { radial: segs, open: true }), { p: [0, (a.y + b.y) / 2, zc] }), T.shade));
        });
      } else if (thatch) {
        /* a lumpy straw shell over a thick straw lip, 16 tufts hanging round the seam */
        o.shell.push(paint(G, G.t(G.normalise(new THREE.TorusGeometry(D.R + 0.01, 0.045, 4, segs)), { r: [90, 0, 0], p: [0, D.drum + 0.07, zc] }), T.shade));
        seam(low ? 11 : 16).forEach(function (a2) {
          var dir = [Math.cos(a2) * 0.5, -0.86, Math.sin(a2) * 0.5], rr = D.R + 0.025;
          o.shell.push(paint(G, aim(G.cone(0.045, 0.13, R(Kt, 5)), dir, [rr * Math.cos(a2), D.drum + 0.03, zc + rr * Math.sin(a2)]), tokenFor(roof, 'straw', 'Straw')));
        });
      } else if (roof === 'roof_candy') {
        var icing = tokenFor(roof, 'icing', 'Cloud White');
        o.shell.push(paint(G, G.t(G.normalise(new THREE.TorusGeometry(D.R + 0.01, 0.034, 4, segs)), { r: [90, 0, 0], p: [0, D.drum + 0.07, zc] }), icing));
        seam(12).forEach(function (ad, n) {
          var hh = DRIP_LENS[n], rd = D.R + 0.03;
          o.shell.push(paint(G, G.t(G.tube(0.022, 0.03, hh, { radial: R(Kt, 5) }), { p: [rd * Math.cos(ad), D.drum + 0.05 - hh / 2, zc + rd * Math.sin(ad)] }), icing));
        });
        var rs = rng('crown:candy:dome'), sp = [];
        for (k = 0; k < (low ? 16 : 24); k++) {
          var phi = (14 + rs() * 52) * DEG, az = rs() * Math.PI * 2, p = onDome(phi, 0.01), th = rs() * Math.PI * 2;
          var nrm = [Math.cos(phi) * Math.cos(az), Math.sin(phi), Math.cos(phi) * Math.sin(az)], tan = [-Math.sin(az), 0, Math.cos(az)];
          var up = [-Math.sin(phi) * Math.cos(az), Math.cos(phi), -Math.sin(phi) * Math.sin(az)];
          sp.push({ p: [p.r * Math.cos(az) + nrm[0] * 0.004, p.y + nrm[1] * 0.004, zc + p.r * Math.sin(az) + nrm[2] * 0.004],
                    dir: [tan[0] * Math.cos(th) + up[0] * Math.sin(th), up[1] * Math.sin(th), tan[2] * Math.cos(th) + up[2] * Math.sin(th)] });
        }
        sprinkleRods(Kt, o, sp, roof);
        cherryAt(Kt, o, [0.06, D.pod.y + D.pod.r + 0.04, zc + 0.05], 0.055, 2.02);
      } else {
        /* castle: a stone band and merlons at the seam (clear of the airlock), 2 turrets flanking it */
        var stone = tokenFor(roof, 'roof', 'Castle Stone');
        o.shell.push(paint(G, G.t(G.tube(D.R + 0.03, 0.08, { radial: segs, open: true }), { p: [0, D.drum + 0.04, zc] }), stone, 'shade'));
        seam(low ? 11 : 15).forEach(function (am) {
          var rm = D.R + 0.025;
          o.shell.push(G.t(box(G, 0.1, 0.1, 0.06, [0, 0, 0], stone), { r: [0, 90 - am / DEG, 0], p: [rm * Math.cos(am), D.drum + 0.13, zc + rm * Math.sin(am)] }));
        });
        turret(Kt, o, -0.47, 0.62, 0.15, 0, 1.45, 1.92, 2.0, -1, false);
        turret(Kt, o, 0.47, 0.62, 0.15, 0, 1.45, 1.92, 2.0, 1, false);
      }
      return o;
    }

    /* ================================================================
       DETAILS (a per-shape anchor table: windowBoxesAt, chimneyAt, swag, flagAt, neonSegments)
       ================================================================ */
    function windowBoxParts(Kt, shape, v) {
      var G = Kt.G, o = emptyParts(), id = 'detail_windowbox';
      if (!isModern(shape)) {
        var boxT = tokenFor(id, 'box', 'Bark'), f = [tokenFor(id, 'f1', 'Rose Deep'), tokenFor(id, 'f2', 'Star Gold'), tokenFor(id, 'f3', 'Tulip Pink')];
        [-1, 1].forEach(function (sx) {
          var x = sx * WIN.x, top = WIN.y - WIN.h / 2 - 0.035;
          var pl = G.t(G.slab(0.38, 0.09, 0.11, 0), { p: [x, top - 0.045, BODY.front + 0.055] });
          o.shell.push(G.paintBy(pl, function (q) { return q.ny > 0.5 ? [boxT, 'shade'] : boxT; }, { perFace: true }));
          [-0.11, 0, 0.11].forEach(function (dx, i) {
            var fl = G.t(G.tube(0.045, 0.03, { radial: R(Kt, 8) }), { r: [90, 0, 0], p: [x + dx, top + (i === 1 ? 0.045 : 0.025), BODY.front + 0.085] });
            o.trim.push(paint(G, fl, f[i]));
          });
        });
        return o;
      }
      windowBoxesAt(shape, v).forEach(function (p) { planter(Kt, o, p); });
      return o;
    }
    function chimneyParts(Kt, roof, shape) {
      var G = Kt.G, o = emptyParts(), id = 'detail_chimney', c = chimneyAt(roof, shape);
      var smokeT = tokenFor(id, 'smoke', 'Smoke');
      if (c.kind === 'brick') {
        var bodyT = tokenFor(id, 'chimney', 'Chimney'), capT = tokenFor(id, 'cap', 'Chimney Cap');
        var stack = G.t(G.slab(c.w, c.top - c.y0, c.w, 0), { p: [c.x, (c.top + c.y0) / 2, c.z] });
        o.shell.push(G.paintBy(stack, function (v) { return v.nx > 0.5 ? [bodyT, 'shade'] : bodyT; }, { perFace: true }));
        o.shell.push(box(G, c.w + 0.08, c.cap, c.w + 0.08, [c.x, c.top + c.cap / 2, c.z], capT));
      } else {
        /* a steel flue with a cap ring */
        var flueT = tokenFor(id, 'flue', 'Gunmetal');
        o.shell.push(G.paintBy(G.t(G.tube(c.w / 2, c.top - c.y0, { radial: R(Kt, 8), open: true }), { p: [c.x, (c.top + c.y0) / 2, c.z] }),
          function (v) { return v.nx > 0.4 ? [flueT, 'shade'] : flueT; }, { perFace: true }));
        o.shell.push(paint(G, G.t(G.tube(c.w / 2 + 0.02, c.cap, { radial: R(Kt, 8) }), { p: [c.x, c.top + c.cap / 2, c.z] }), 'Gunmetal Deep'));
      }
      /* 3 puffs at their reduced-motion rest pose; idle() moves them on the CPU */
      var puffs = [], tmp = {};
      for (var i = 0; i < SMOKE.n; i++) {
        smokeAt(0, i, SMOKE.n, 0, true, tmp);
        var ctr = [c.emitter[0] + tmp.x, c.emitter[1] + SMOKE.r + tmp.y, c.emitter[2] + tmp.z];
        var g = paint(G, G.t(G.puff(SMOKE.r), { s: tmp.s, p: ctr }), smokeT);
        o.anim.push(g);
        puffs.push({ c: ctr, s: tmp.s, count: vcount(g) });
      }
      o.meta.smoke = { puffs: puffs, emitter: c.emitter.slice(), token: smokeT, tint: showTint(id) };
      return o;
    }
    function showTint(id) {
      var L = Look(), e = L && L.LOOK && L.LOOK[id], tint = e && e.show && e.show.tint;
      return tint && typeof tint.token === 'string' ? tint.token : 'Iridescent Rim';
    }
    function lightsParts(Kt, roof, shape) {
      var G = Kt.G, o = emptyParts(), id = 'detail_lights', low = Kt.tier === 'LOW', modern = isModern(shape);
      var sw = swag(roof, modern ? (low ? 8 : 10) : (low ? 12 : LIGHTS.wire), LIGHTS.n, shape);
      o.trim.push(paint(G, G.ribbon(sw.wire, 0.011, { segments: modern ? (low ? 8 : 10) : (low ? 12 : 16) }), tokenFor(id, 'wire', 'Ink')));
      var fb = ['Star Gold', 'Coral', 'Splash Blue', 'Leaf Mint', 'Grape'];
      var L = Look(), e = L && L.LOOK && L.LOOK[id], hl = e && e.show && e.show.halo;
      sw.bulbs.forEach(function (p, i) {
        var tk = tokenFor(id, 'b' + (i % 5 + 1), fb[i % 5]);
        var g = modern ? G.t(G.tube(0.017, 0.024, 0.045, { radial: R(Kt, 5) }), { p: p }) : G.t(G.tube(0.018, 0.026, 0.05, { radial: R(Kt, 6) }), { p: p });
        var rec = lamp(o, paint(G, g, 'Cloud White'), { kind: 'fairy', i: i, tok: tk });
        halo(o, 'bulb' + i, p, hl && hl.size || 0.25, hl && hl.token || 'Butter', rec, 'fairy');
      });
      o.meta.lightsCentre = sw.centre;
      return o;
    }
    function flagParts(Kt, roof, shape) {
      var G = Kt.G, o = emptyParts(), id = 'detail_flag', f = flagAt(roof, shape);
      if (!f) return o;
      var poleT = tokenFor(id, 'pole', 'Ink'), penT = tokenFor(id, 'pennant', 'Star Gold');
      if (f.pole) {
        o.trim.push(paint(G, G.t(G.tube(0.014, f.top - f.y0, { radial: R(Kt, 6) }), { p: [f.x, (f.top + f.y0) / 2, f.z] }), poleT));
        o.trim.push(paint(G, G.t(G.tube(0.026, 0.03, { radial: R(Kt, 6) }), { p: [f.x, f.top + 0.015, f.z] }), penT));
      } else o.trim.push(paint(G, G.t(G.tube(0.022, 0.03, { radial: R(Kt, 6) }), { p: [f.x - 0.015, f.top + 0.01, f.z] }), poleT));
      /* a two-sided pennant tapering to a point; the CPU flutter bends it in z */
      var cloth = G.flag(f.w, f.h, 6, 1), x0 = f.x + 0.014, yc = f.top - 0.02 - f.h / 2;
      var pa = cloth.getAttribute('position').array;
      for (var i = 0; i < pa.length; i += 3) pa[i + 1] *= 1 - 0.92 * clamp01(pa[i] / f.w);
      G.t(cloth, { p: [x0, yc, f.z] });
      o.anim.push(paint(G, cloth, penT));
      o.meta.cloth = { x0: x0, w: f.w, count: vcount(cloth) };
      return o;
    }
    /* the neon roofline: member-colour core segments (chase order i) and '@member' halos */
    function neonParts(Kt, roof, shape) {
      var G = Kt.G, o = emptyParts(), segs = neonSegments(shape, roof), n = segs.length, r = NEON.r;
      segs.forEach(function (s) {
        var d = [s.b[0] - s.a[0], s.b[1] - s.a[1], s.b[2] - s.a[2]], l = Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]) || 1;
        var a = [s.a[0] - d[0] / l * r, s.a[1] - d[1] / l * r, s.a[2] - d[2] / l * r], b = [s.b[0] + d[0] / l * r, s.b[1] + d[1] / l * r, s.b[2] + d[2] / l * r];
        var rec = lamp(o, paint(G, rod(Kt, r, a, b, 4, true), 'Cloud White'), { kind: 'neon', i: s.i, n: n });
        if (s.i % Math.max(1, Math.floor(n / NEON.halos)) === 0 && o.halos.length < NEON.halos) halo(o, 'neon' + o.halos.length, lerp3(s.a, s.b, 0.5), NEON.halo, '@member', rec);
      });
      return o;
    }
    function detailParts(Kt, d, roof, shape, v) {
      if (d === 'detail_windowbox') return windowBoxParts(Kt, shape, v);
      if (d === 'detail_chimney') return chimneyParts(Kt, roof, shape);
      if (d === 'detail_lights') return lightsParts(Kt, roof, shape);
      if (d === 'detail_flag') return flagParts(Kt, roof, shape);
      if (d === 'detail_neon') return neonParts(Kt, roof, shape);
      return emptyParts();
    }
    /* sub-parts that depend on the crown (and the trim, for window boxes) are cached per key */
    function detailKey(d, roof, shape, v) {
      var s = isModern(shape) ? shape : COTTAGE;
      if (d === 'detail_windowbox') return 'home:' + s + ':' + d + (isModern(shape) ? ':v' + v : '');
      if (d === 'detail_chimney' && isModern(shape)) return 'home:' + s + ':' + d;
      return 'home:' + s + ':' + d + ':' + roof;
    }
    var BODY_BUILD = { shape_loft: loftBody, shape_villa: villaBody, shape_tower: towerBody, shape_dome: domeBody };

    /* ---------------- ASSEMBLY: the template for one (id, style, tier) ---------------- */
    function houseLook() {
      var L = Look();
      return (L && L.LOOK && L.LOOK[HOME]) || { h: 2.3, tris: BUDGET.house };
    }
    function buildHome(ctx) {
      var Kt = ctx.K, tier = Kt.tier, s = homeState(ctx.id, ctx.st), P = Kt.parts, shape = s.shape, v = s.variant;
      var modern = isModern(shape);
      var body = modern ? P.get('home:' + shape + ':body:' + s.wall + ':v' + v, tier, function (k) { return BODY_BUILD[shape](k, s.wall, v); })
        : P.get('home:body:' + s.wall, tier, function (k) { return cottageBody(k, s.wall); });
      var crown = modern ? P.get('home:' + shape + ':crown:' + s.roof, tier, function (k) {
        var fam = SHAPE[shape].family;
        return fam === 'hip' ? crownHip(k, s.roof) : fam === 'dome' ? crownDome(k, s.roof) : crownFlat(k, shape, s.roof);
      }) : P.get('home:roof:' + s.roof, tier, function (k) { return COTTAGE_ROOF[s.roof](k); });
      var door = modern ? P.get('home:' + shape + ':door:' + s.door, tier, function (k) { return modernDoor(k, shape, s.door); })
        : P.get('home:door:' + s.door, tier, function (k) { return cottageDoor(k, s.door); });
      var dets = s.details.map(function (d) { return P.get(detailKey(d, s.roof, shape, v), tier, function (k) { return detailParts(k, d, s.roof, shape, v); }); });
      var lists = emptyParts();
      [body, crown].concat(dets).forEach(function (src) {
        PARTS.forEach(function (name) { if (src[name] && src[name].length) lists[name] = lists[name].concat(src[name]); });
        lists.lamps = lists.lamps.concat(src.lamps);
        lists.halos = lists.halos.concat(src.halos);
      });
      if (modern) { lists.shell = lists.shell.concat(lists.trim); lists.trim = []; }
      /* the house template, whatever id asked for it: a style preview is a whole house,
         so it is checked against the house's budget and footprint */
      var hctx = { id: ctx.id, look: houseLook(), st: ctx.st, stateKey: ctx.stateKey, tier: tier, G: Kt.G, col: ctx.col, fp: [2, 2], K: Kt };
      var b = Kt.template(hctx);
      b.part('shell', lists.shell, 'toon', { outline: true, castShadow: true });
      if (lists.trim.length) b.part('trim', lists.trim, 'toon', { castShadow: false });
      b.part('window', lists.window, 'state', {
        stateColor: { key: 'windowGlow', off: tokenFor(HOME, 'window', 'Window'), on: tokenFor(HOME, 'windowGlow', 'Window Glow'), initial: windowLevel(0) }
      });
      b.part('door', door.door, door.meta.mat, { pivot: 'door', outline: true });
      if (lists.bulb.length) b.part('bulb', lists.bulb, 'state', { perCopy: true });
      if (lists.anim.length) b.part('anim', lists.anim, 'toon', { perCopy: true });
      var signQ = body.meta && body.meta.sign, signRect = null;
      if (lists.sign.length && signQ) {
        try { signRect = K0.signAtlas && K0.signAtlas().rect(':initial'); } catch (e) { signRect = null; }
        if (signRect) b.part('sign', lists.sign, 'sign', { perCopy: true });
      }
      /* pivots (the four house pivots always, so a handler never writes an unknown one) */
      var ch = chimneyAt(s.roof, shape), fl = flagAt(s.roof, shape) || flagAt('roof_red', shape), dr = doorOf(shape);
      var centre = null;
      dets.forEach(function (d) { if (d.meta.lightsCentre) centre = d.meta.lightsCentre; });
      b.pivot('door', dr.pivot);
      b.pivot('emitter', ch.emitter);
      b.pivot('flag', fl.pivot);
      b.pivot('glow', centre || swag(s.roof, 4, 3, shape).centre);
      if (shape === 'shape_villa') b.pivot('pool', [SHAPE.shape_villa.ripple.x, SHAPE.shape_villa.ripple.y, SHAPE.shape_villa.ripple.z]);
      if (shape === 'shape_tower') { var sg = SHAPE.shape_tower.sign; b.pivot('sign', [(sg.x0 + sg.x1) / 2, (sg.y0 + sg.y1) / 2, sg.z1]); }
      if (shape === 'shape_dome') { b.pivot('ring', [0, SHAPE.shape_dome.drum, SHAPE.shape_dome.zc]); b.pivot('tip', [0, SHAPE.shape_dome.top, SHAPE.shape_dome.zc]); }
      /* anchors */
      var top = topOf(s);
      b.anchor('top', [0, top + 0.15, 0]);
      b.anchor('door', dr.anchor);
      b.anchor('spot', SPOT);
      lists.halos.forEach(function (h) { b.anchor(h.name, h.pos); });
      b.hit([2, Math.max(0.8, roofTop(s.roof, shape)), 2]);
      var tpl = b.done();
      /* vertex layouts for the CPU-lit / CPU-animated copies (travel with geometry clones) */
      var smokeMeta = null, clothMeta = null;
      dets.forEach(function (d) { if (d.meta.smoke) smokeMeta = d.meta.smoke; if (d.meta.cloth) clothMeta = d.meta.cloth; });
      tpl.parts.forEach(function (p) {
        if (p.name === 'bulb') p.geo.userData.slHome = bakeLamps(p.geo, layoutLamps(lists.lamps, lists.halos));
        if (p.name === 'anim') p.geo.userData.slHome = layoutAnim(smokeMeta, clothMeta);
        if (p.name === 'sign') { p.geo.userData.slHome = { sign: { x0: signQ.x0, x1: signQ.x1, y0: signQ.y0, y1: signQ.y1, z: signQ.z } }; signUV(p.geo, signRect); }
      });
      return tpl;
    }
    /* lamp records with their vertex ranges in the merged 'bulb' part; halos point at lamp indices */
    function layoutLamps(lamps, halos) {
      var at = 0, out = lamps.map(function (L) {
        var o = {};
        for (var k in L) o[k] = L[k];
        o.start = at; at += L.count;
        return o;
      });
      return { lamps: out, halos: halos.map(function (h) { return { name: h.name, size: h.size, token: h.token, mode: h.mode, lamp: lamps.indexOf(h.lamp) }; }) };
    }
    /* keep each vertex's painted shade (shared, read-only, by every copy), each LED band vertex's
       angle round the dome, then light the template at its golden-hour rest pose, so a copy that is
       never shown (a lab thumbnail, a ghost) still reads right */
    function bakeLamps(geo, meta) {
      var ca = geo.getAttribute('color').array, pa = geo.getAttribute('position').array, i, v;
      meta.shade = new Float32Array(ca.length / 3);
      for (i = 0; i < meta.shade.length; i++) meta.shade[i] = ca[i * 3];
      meta.ang = {};
      meta.ripple = false;
      meta.lamps.forEach(function (L, j) {
        if (L.kind === 'ripple') meta.ripple = true;
        if (L.kind !== 'ring') return;
        var ang = meta.ang[j] = new Float32Array(L.count);
        for (v = 0; v < L.count; v++) ang[v] = Math.atan2(pa[(L.start + v) * 3 + 2] - L.cz, pa[(L.start + v) * 3]);
      });
      writeLamps(ca, null, null, meta, memberOf(null), 0, 0, 0, true, SHOW_BEAT_HZ);
      return meta;
    }
    function layoutAnim(smoke, cloth) {
      var out = {}, at = 0;
      if (smoke) {
        out.smoke = { token: smoke.token, tint: smoke.tint, emitter: smoke.emitter.slice(), puffs: smoke.puffs.map(function (p) { var o = { start: at, count: p.count, c: p.c.slice(), s: p.s }; at += p.count; return o; }) };
      }
      if (cloth) { out.cloth = { start: at, count: cloth.count, x0: cloth.x0, w: cloth.w }; at += cloth.count; }
      return out;
    }
    /* the initial's UVs: the K.signAtlas ':initial' cell over the quad (the 6 vertices of quadXY) */
    function signUV(geo, r) {
      var uv = [r.u0, r.v0, r.u1, r.v0, r.u1, r.v1, r.u0, r.v0, r.u1, r.v1, r.u0, r.v1];
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    }

    /* ================================================================
       HANDLERS
       ================================================================ */
    var colCache = new Map();
    function colOf(token) { var c = colCache.get(token); if (!c) { c = K0.col(token); colCache.set(token, c); } return c; }
    /* the child's member colour, from the handle: a.member ('#hex') or a.user.color (the look's
       '@member' convention, st.member, as a last resort); MEMBER_FALLBACK when there is none.
       One object per colour, and the last raw value is remembered, so a frame never allocates. */
    var memberCache = {}, lastRaw = null, lastMem = null;
    function memberOf(a) {
      var raw = a ? a.member || (a.user && a.user.color) || (a.st && a.st.member) || '' : '';
      if (lastMem && raw === lastRaw) return lastMem;
      var h = hexOf(raw), key = h || '@', m = memberCache[key];
      if (!m) {
        var L = Look(), fb = (L && L.MEMBER_FALLBACK) || 'Bubblegum';
        m = memberCache[key] = { key: key, col: h ? K0.rgb(h) : colOf(fb) };
      }
      lastRaw = raw; lastMem = m;
      return m;
    }
    var rt = new WeakMap();                  /* copy geometry → {base, shade, ang, lastK, still, lit*} */
    /* per-copy memory keyed by uid (or, for handle(obj), by the Object3D, held weakly) */
    function store() {
      var m = new Map(), w = new WeakMap();
      function of(k) { return k !== null && typeof k === 'object' ? w : m; }
      return {
        get: function (k) { return of(k).get(k); }, set: function (k, v) { of(k).set(k, v); },
        has: function (k) { return of(k).has(k); }, delete: function (k) { of(k).delete(k); }
      };
    }
    var doorDeg = store();                   /* current door openness (for restarts and homeClose) */
    var showOf = store();                    /* last window glow written: {sk: style, k} */
    var haloOn = store();                    /* halos currently on */
    var nodeBase = new WeakMap();            /* an Object3D pivot's rest position (for the dome's slide) */
    function keyOf(a) { return a.uid != null ? a.uid : (a.object || a); }

    function copyGeo(a, part) {
      try {
        var g;
        if (typeof a.copyGeometry === 'function' && (g = a.copyGeometry(part))) return g;
        if (typeof a.geometry === 'function' && (g = a.geometry(part))) return g;
        if (a.batch && typeof a.batch.copyGeometry === 'function' && (g = a.batch.copyGeometry(a.uid, part))) return g;
        var o = a.object || a.obj || a.root || a.group;
        var m = o && o.userData && o.userData.meshes && o.userData.meshes[part];
        if (m && m.geometry) return m.geometry;
      } catch (e) { /* no copy geometry: skip the CPU animation */ }
      return null;
    }
    function styleOf(a) {
      var s = parseKey(styleKey(a));
      if (!s && a.st) s = homeState(a.id || HOME, a.st);
      return s;
    }
    function runtime(geo) {
      var r = rt.get(geo);
      if (!r) {
        r = { base: new Float32Array(geo.getAttribute('position').array), lastK: -1, still: '', litK: -1, litMem: null, litReduced: false };
        rt.set(geo, r);
      }
      return r;
    }
    /* write a pivot rotation (about its origin) and offset through whatever the handle hands back:
       the documented {set(rotDeg, pos, scale)}, the batch's Matrix4, or an Object3D node */
    var ZERO3 = [0, 0, 0];
    function setPivot(a, name, rot, pos) {
      var p = null;
      pos = pos || ZERO3;
      try { p = typeof a.pivot === 'function' ? a.pivot(name) : null; } catch (e) { p = null; }
      if (!p) return;
      if (p.isMatrix4) {
        _e.set(rot[0] * DEG, rot[1] * DEG, rot[2] * DEG, 'XYZ');
        p.compose(_p.set(pos[0], pos[1], pos[2]), _q.setFromEuler(_e), _s3.set(1, 1, 1));
      } else if (p.isObject3D) {
        p.rotation.set(rot[0] * DEG, rot[1] * DEG, rot[2] * DEG);
        var b = nodeBase.get(p);
        if (!b) { b = p.position.clone(); nodeBase.set(p, b); }
        p.position.set(b.x + pos[0], b.y + pos[1], b.z + pos[2]);
      } else if (typeof p.set === 'function') p.set(rot, pos, [1, 1, 1]);
    }
    function setState(a, key, v) { try { if (typeof a.state === 'function') a.state(key, v); else if (typeof a.setState === 'function') a.setState(key, v); } catch (e) {} }
    function call(a, fn, x, y, z, w) { try { if (typeof a[fn] === 'function') a[fn](x, y, z, w); } catch (e) {} }

    /* chimney puffs + pennant: positions from the rest pose; smoke tint at Showtime */
    var _sp = {};
    function animate(geo, t, k, phase, reduced) {
      var meta = geo.userData && geo.userData.slHome;
      if (!meta) return false;
      var r = runtime(geo), sig = reduced ? 'r' + Math.round(k * 100) : '';
      if (sig && r.still === sig) return false;
      var pos = geo.getAttribute('position'), arr = pos.array, base = r.base, i, v, e;
      if (meta.smoke) {
        var ps = meta.smoke.puffs, em = meta.smoke.emitter;
        for (i = 0; i < ps.length; i++) {
          var pf = ps[i], m = smokeAt(t, i, ps.length, phase, reduced, _sp);
          var cx = em[0] + m.x, cy = em[1] + SMOKE.r + m.y, cz = em[2] + m.z, sc = m.s / pf.s;
          for (v = pf.start, e = pf.start + pf.count; v < e; v++) {
            arr[v * 3] = cx + (base[v * 3] - pf.c[0]) * sc;
            arr[v * 3 + 1] = cy + (base[v * 3 + 1] - pf.c[1]) * sc;
            arr[v * 3 + 2] = cz + (base[v * 3 + 2] - pf.c[2]) * sc;
          }
        }
        if (Math.abs(k - r.lastK) > 0.004) {
          var c0 = colOf(meta.smoke.token), c1 = colOf(meta.smoke.tint), col = geo.getAttribute('color'), ca = col.array;
          var cr = c0.r + (c1.r - c0.r) * k, cg = c0.g + (c1.g - c0.g) * k, cb = c0.b + (c1.b - c0.b) * k;
          var last = ps[ps.length - 1];
          for (v = ps[0].start, e = last.start + last.count; v < e; v++) { ca[v * 3] = cr; ca[v * 3 + 1] = cg; ca[v * 3 + 2] = cb; }
          col.needsUpdate = true;
          r.lastK = k;
        }
      }
      if (meta.cloth) {
        var cl = meta.cloth;
        for (v = cl.start, e = cl.start + cl.count; v < e; v++) {
          var u = clamp01((base[v * 3] - cl.x0) / cl.w);
          arr[v * 3] = base[v * 3];
          arr[v * 3 + 1] = base[v * 3 + 1];
          arr[v * 3 + 2] = base[v * 3 + 2] + clothAt(t, u, phase, reduced);
        }
      }
      pos.needsUpdate = true;
      r.still = sig;
      return !reduced;
    }
    /* does any lamp change from frame to frame at Showtime mix k? */
    function lampsMove(list, k) {
      for (var i = 0; i < list.length; i++) {
        var kd = list[i].kind;
        if (kd === 'fairy' || kd === 'ripple' || kd === 'tip') return true;
        if (k > 0.001 && (kd === 'neon' || kd === 'sign' || kd === 'ring' || kd === 'dot')) return true;
      }
      return false;
    }
    var _rp = {}, NEON3_FB = ['Neon Magenta', 'LED Cyan', 'Electric Violet'], levels = [];
    function neon3() { var L = Look(); return (L && Array.isArray(L.NEON3) && L.NEON3.length === 3) ? L.NEON3 : NEON3_FB; }
    /* light every lamp of a 'bulb' layout into a colour array (and move the ripple ring when pa
       is given): vertex colour = lamp colour × level × its baked shade (meta.shade). levels[]
       keeps each lamp's level for its halo. Used per frame and once to bake the rest pose. */
    function writeLamps(ca, pa, base, meta, mem, t, k, ph, reduced, hz) {
      var list = meta.lamps, sh = meta.shade, poolK = rates().poolMix * clamp01(k), i, v, f;
      for (i = 0; i < list.length; i++) {
        var L = list[i], lv = 1, s0 = L.start, s1 = L.start + L.count;
        switch (L.kind) {
          case 'fairy': lv = bulbLevel(t, L.i, k, hz, ph, reduced); _c.copy(colOf(L.tok)).multiplyScalar(lv); break;
          case 'neon': lv = neonLevel(t, L.i, k, ph, reduced); _c.copy(mem.col).multiplyScalar(lv); break;
          case 'sign': lv = signLevel(t, k, ph, reduced); _c.copy(mem.col).multiplyScalar(lv); break;
          case 'warm': _c.copy(colOf(L.off)).lerp(colOf(L.on), windowLevel(k)); break;
          case 'led': _c.copy(colOf(L.off)).lerp(colOf(L.on), clamp01(k)); break;
          case 'dot': lv = dotLevel(t, L.i, k, ph, reduced); _c.copy(colOf(L.off)).lerp(colOf(L.on), lv); break;
          case 'pool': _c.copy(colOf(L.off)).lerp(colOf(L.on), poolK); break;
          case 'tip': lv = tipLevel(t, ph, reduced); _c.copy(colOf(L.on)).multiplyScalar(lv); break;
          case 'ripple': {
            /* the pool's own colour (tinted at night) brightening toward the ring colour as it fades in */
            rippleAt(t, ph, reduced, _rp);
            _c2.copy(colOf(L.off)).lerp(colOf(L.glow), poolK);
            _c.copy(_c2).lerp(colOf(L.on), 0.55 * _rp.a).multiplyScalar(0.88 + 0.12 * _rp.a);
            if (pa && base) {
              var sc = _rp.s / RIPPLE.rest;
              for (v = s0; v < s1; v++) { pa[v * 3] = L.cx + (base[v * 3] - L.cx) * sc; pa[v * 3 + 2] = L.cz + (base[v * 3 + 2] - L.cz) * sc; }
            }
            break;
          }
          case 'ring': {
            /* every vertex its own hue, by its angle round the dome (meta.ang, baked at build):
               ringHue() inlined, so the per-vertex loop makes no calls */
            var ang = meta.ang[i], N3 = neon3(), off = colOf(L.off), kk = clamp01(k), TAU = 2 * Math.PI;
            var c0 = colOf(N3[0]), c1 = colOf(N3[1]), c2 = colOf(N3[2]), shift = (reduced ? 0 : rates().ringHz * num(t)) - num(ph);
            for (v = s0; v < s1; v++) {
              var u = ang[v - s0] / TAU - shift;
              u = (u - Math.floor(u)) * 3;
              var hi = Math.floor(u), hf = u - hi, he = hf * hf * (3 - 2 * hf);
              var A = hi === 0 ? c0 : hi === 1 ? c1 : c2, B = hi === 0 ? c1 : hi === 1 ? c2 : c0;
              f = sh ? sh[v] : 1;
              ca[v * 3] = (off.r + ((A.r + (B.r - A.r) * he) - off.r) * kk) * f;
              ca[v * 3 + 1] = (off.g + ((A.g + (B.g - A.g) * he) - off.g) * kk) * f;
              ca[v * 3 + 2] = (off.b + ((A.b + (B.b - A.b) * he) - off.b) * kk) * f;
            }
            levels[i] = kk;
            continue;
          }
        }
        levels[i] = lv;
        for (v = s0; v < s1; v++) { f = sh ? sh[v] : 1; ca[v * 3] = _c.r * f; ca[v * 3 + 1] = _c.g * f; ca[v * 3 + 2] = _c.b * f; }
      }
    }
    /* every CPU-lit lamp of a copy, and its halos at Showtime */
    function lamps(geo, a, t, k, ph, reduced) {
      var meta = geo.userData && geo.userData.slHome;
      if (!meta || !meta.lamps) return false;
      var r = runtime(geo), mem = memberOf(a), moving = !reduced && lampsMove(meta.lamps, k), kq = Math.round(k * 1000);
      /* still lamps are rewritten only when the Showtime mix, the member colour or reduced motion changes */
      if (moving || r.litK !== kq || r.litMem !== mem || r.litReduced !== !!reduced) {
        var col = geo.getAttribute('color'), pos = meta.ripple ? geo.getAttribute('position') : null;
        writeLamps(col.array, pos ? pos.array : null, r.base, meta, mem, t, k, ph, reduced, a.bpm > 0 ? a.bpm / 60 : SHOW_BEAT_HZ);
        col.needsUpdate = true;
        if (pos) pos.needsUpdate = true;
        r.litK = moving ? -1 : kq; r.litMem = mem; r.litReduced = !!reduced;
        halos(a, meta, k);
      }
      return moving;
    }
    /* halos follow the Showtime mix (fairy bulbs also their twinkle; the antenna tip its breath) */
    function halos(a, meta, k) {
      var key = keyOf(a), want = k > 0.02 && typeof a.halo === 'function', list = meta.halos || [];
      if (want) {
        for (var i = 0; i < list.length; i++) {
          var h = list[i], L = h.lamp >= 0 ? levels[h.lamp] : 1, size = h.size * k;
          if (h.mode === 'fairy' || h.mode === 'tip') size *= 0.5 + 0.5 * (L == null ? 1 : L);
          call(a, 'halo', h.name, true, size, h.token);
        }
        haloOn.set(key, true);
      } else if (haloOn.get(key)) {
        for (var j = 0; j < list.length; j++) call(a, 'halo', list[j].name, false, 0, list[j].token);
        haloOn.delete(key);
      }
    }
    /* the tower's initial: opened for island copies only (photocards and shop icons show the ✦),
       tinted with the member colour and the sign's breath */
    var signMat = null;
    function signMaterial() {
      if (!signMat && typeof K0.variant === 'function') { try { signMat = K0.variant('sign', 'home-initial', {}); } catch (e) { signMat = null; } }
      return signMat;
    }
    var GLINT_FX = { token: 'Gold Light', size: 0.2 };          /* the controller copies emit opts */
    function personalOf(a) { return a.personal != null ? !!a.personal : !!a.batch; }
    var QX = [0, 1, 1, 0, 1, 0], QY = [0, 0, 1, 0, 1, 1];   /* quadXY's 6 corners: 0 = x0 / y0, 1 = x1 / y1 */
    var atlasName = null, atlasColour = null;
    function signShow(a, t, k, ph, reduced) {
      var geo = copyGeo(a, 'sign'), meta = geo && geo.userData && geo.userData.slHome && geo.userData.slHome.sign;
      if (!meta) return false;
      var r = runtime(geo), on = personalOf(a), want = on ? 'open' : 'shut';
      if (r.still !== want) {
        var pa = geo.getAttribute('position').array, q = meta, mx = (q.x0 + q.x1) / 2, my = (q.y0 + q.y1) / 2;
        for (var i = 0; i < 6; i++) {
          pa[i * 3] = on ? (QX[i] ? q.x1 : q.x0) : mx;
          pa[i * 3 + 1] = on ? (QY[i] ? q.y1 : q.y0) : my;
          pa[i * 3 + 2] = q.z;
        }
        geo.getAttribute('position').needsUpdate = true;
        r.still = want;
      }
      if (on) {
        var m = signMaterial(), mem = memberOf(a);
        if (m && m.color) m.color.copy(mem.col).multiplyScalar(signLevel(t, k, ph, reduced));
        /* the atlas already holds the child set by the controller; this only fills a gap */
        var name = a.user && typeof a.user.name === 'string' ? a.user.name : null, colour = mem.key === '@' ? null : mem.key;
        if (name !== null && (name !== atlasName || colour !== atlasColour) && typeof K0.signAtlas === 'function') {
          atlasName = name; atlasColour = colour;
          try { K0.signAtlas().setUser({ name: name, color: colour }); } catch (e) { /* the controller owns the atlas user */ }
        }
      }
      return on && !reduced && k > 0.001;
    }
    /* the window glow follows the Showtime mix; remembered per (uid, style) so a restyle
       (a fresh batch for the same uid) is lit again straight away */
    function windowGlow(a, k) {
      var key = keyOf(a), sk = styleKey(a), last = showOf.get(key);
      if (last && last.sk === sk && Math.abs(last.k - k) < 0.002) return;
      setState(a, 'windowGlow', windowLevel(k));
      if (last) { last.sk = sk; last.k = k; } else showOf.set(key, { sk: sk, k: k });
    }
    function styleKey(a) {
      var o = a.object || a.obj || a.root || a.group;
      return (typeof a.stateKey === 'string' && a.stateKey) || (a.template && a.template.stateKey) ||
        (a.batch && a.batch.template && a.batch.template.stateKey) || (o && o.userData && o.userData.stateKey) || '';
    }

    function idle(a) {
      if (!a) return false;
      var t = num(a.t), k = clamp01(num(a.show)), ph = num(a.phase), reduced = !!a.reduced, moved = false;
      windowGlow(a, k);
      var anim = copyGeo(a, 'anim'), bulb = copyGeo(a, 'bulb');
      if (anim) moved = animate(anim, t, k, ph, reduced) || moved;
      if (bulb) moved = lamps(bulb, a, t, k, ph, reduced) || moved;
      moved = signShow(a, t, k, ph, reduced) || moved;
      var s = styleOf(a);
      if (s && s.door === 'door_gold') {
        var g = glintAt(t, num(a.dt), ph, reduced);
        if (g >= 0) call(a, 'emit', 'sparkle', glintsOf(s.shape)[g], 1, GLINT_FX);
        moved = moved || !reduced;
      }
      return moved;
    }
    function show(a, k) {
      if (!a) return;
      k = clamp01(num(k));
      windowGlow(a, k);
      var t = num(a.t), ph = num(a.phase), reduced = !!a.reduced;
      var anim = copyGeo(a, 'anim'), bulb = copyGeo(a, 'bulb');
      if (anim) animate(anim, t, k, ph, reduced);
      if (bulb) lamps(bulb, a, t, k, ph, reduced);
      signShow(a, t, k, ph, reduced);
    }
    /* the door act → {name, dur, update(a, tAct) → alive, cancel()} */
    function act(a, name) {
      if (!a) return null;
      if (name !== 'homeClose' && name !== 'homeSwing') name = 'home';
      var key = keyOf(a), reduced = !!a.reduced, from = doorDeg.get(key) || 0, s = styleOf(a), shape = s ? s.shape : DEFAULTS.shape;
      var d = doorOf(shape), slideDir = d.dir || -1;
      if (name === 'homeClose' && !(from > 0.01)) { setPivot(a, 'door', ZERO3, ZERO3); return null; }
      var M = Motion(), cues = [];
      if (name !== 'homeClose' && M && typeof M.cues === 'function') { try { cues = M.cues('home', { reduced: reduced }); } catch (e) { cues = []; } }
      /* the controller's tap squish owns the opening 'pop' */
      cues = cues.filter(function (c) { return !(c.sfx === 'pop' && c.t < 0.05); });
      var fired = 0, pose = {}, dead = false, rot = [0, 0, 0], off = [0, 0, 0];
      return {
        name: name, dur: doorDur(name, reduced),
        update: function (a2, tAct) {
          if (dead) return false;
          a2 = a2 || a;
          doorPose(shape, name, tAct, from, reduced, pose);
          rot[1] = -pose.rot; off[0] = slideDir * pose.slide;
          setPivot(a2, 'door', rot, off);
          doorDeg.set(key, pose.deg);
          while (fired < cues.length && cues[fired].t <= tAct) {
            var c = cues[fired++];
            if (c.sfx) call(a2, 'sfx', c.sfx, c.vol, c.step);
            if (c.emit) call(a2, 'emit', c.emit, 'door', c.n || 1);
          }
          if (pose.done) { if (Math.abs(pose.deg) < 0.01) doorDeg.delete(key); return false; }
          return true;
        },
        cancel: function () { dead = true; }
      };
    }
    /* a minimal handle for an Object3D made by SL3D.make (photocard turntables, the lab) */
    function handle(obj, o) {
      o = o || {};
      var ud = (obj && obj.userData) || {};
      return {
        uid: o.uid != null ? o.uid : obj, id: ud.id, t: num(o.t), dt: num(o.dt), phase: num(o.phase), reduced: !!o.reduced,
        show: num(o.show), bpm: num(o.bpm), stateKey: ud.stateKey, object: obj,
        member: o.member || null, user: o.user || null, personal: !!o.personal,
        pivot: function (n) { return (ud.pivots && ud.pivots[n]) || null; },
        state: function (k2, v) { if (typeof ud.setState === 'function') ud.setState(k2, v); },
        emit: o.emit || null, sfx: o.sfx || null, halo: o.halo || null
      };
    }
    /* the tower initial's sign-atlas material (one member-tinted sibling of K.mat('sign')) */
    function material(key, part) { return part && part.name === 'sign' && key === 'sign' ? signMaterial() : null; }
    function forget(uid) { doorDeg.delete(uid); showOf.delete(uid); haloOn.delete(uid); }

    var handlers = { build: buildHome, idle: idle, act: act, show: show, animated: animated, handle: handle, material: material, forget: forget };
    var out = {};
    homeIds().forEach(function (id) {
      var h = {};
      for (var k in handlers) h[k] = handlers[k];
      out[id] = h;
    });
    return out;
  }

  return {
    VERSION: VERSION, HOME: HOME, COTTAGE: COTTAGE, DEFAULTS: DEFAULTS, WALLS: WALLS, ROOFS: ROOFS, DOORS: DOORS, DETAILS: DETAILS,
    SHAPES: SHAPES, STYLE_IDS: STYLE_IDS, PARTS: PARTS, MAX_PARTS: MAX_PARTS, SHAPE: SHAPE, HOUSE_H: HOUSE_H,
    BODY: BODY, WIN: WIN, DOOR: DOOR, GABLE: GABLE, LIP: LIP, LOAF: LOAF, CASTLE: CASTLE, SMOKE: SMOKE, LIGHTS: LIGHTS,
    FLAG: FLAG, GLINT: GLINT, HOLD: HOLD, SPOT: SPOT, SLIDE: SLIDE, MARGIN: MARGIN, BUDGET: BUDGET, MAX_HZ: MAX_HZ,
    NEON: NEON, SIGN: SIGN, TIP: TIP, RING: RING, RIPPLE: RIPPLE, DOTS: DOTS,
    factory: factory,
    /* pure helpers */
    homeState: homeState, parseKey: parseKey, stateKeyOf: stateKeyOf, animated: animated, partsFor: partsFor, homeIds: homeIds,
    budgetOf: budgetOf, houseBudget: houseBudget, tokenFor: tokenFor, hexOf: hexOf,
    roofTop: roofTop, topOf: topOf, doorOf: doorOf, glintsOf: glintsOf, chimneyAt: chimneyAt, flagAt: flagAt, lightsAt: lightsAt,
    swag: swag, domeR: domeR, neonPaths: neonPaths, neonSegments: neonSegments, windowBoxesAt: windowBoxesAt, hipRidge: hipRidge,
    tufts: tufts, sprinkles: sprinkles, drips: drips, slope: slope, onSlope: onSlope, hash: hash, rng: rng,
    doorAt: doorAt, doorPose: doorPose, doorDur: doorDur, smokeAt: smokeAt, bulbLevel: bulbLevel, glintAt: glintAt, clothAt: clothAt,
    neonLevel: neonLevel, signLevel: signLevel, tipLevel: tipLevel, dotLevel: dotLevel, ringHue: ringHue, rippleAt: rippleAt, windowLevel: windowLevel
  };
}));
