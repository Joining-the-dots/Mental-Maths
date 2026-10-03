/* ================================================================
   My Island 3D — garden models (architecture chunk 4, Encore City v2 restyle; classic script).
   Registers, through SL3D.defineModels('garden', factory), the 23
   catalogue ids of the garden / lights / flags / paths shop shelves:
     trees      tree_oak tree_pine tree_apple tree_blossom tree_palm
     plants     flower_tulip flower_daisy flower_sun bush_rose rock_mossy
     lights     lantern mushroom_glow
     flags      flag_pole bunting
     decor      bench sandcastle umbrella snowman
     landmarks  windmill lighthouse
     paths      path_stone path_wood path_flower
   Each id gets {build(ctx) → Template, idle(a), act(a, name) → Act|null,
   show(a, k)} built only from K.G primitives and K materials, to the LOOK
   heights, colour tokens, pivots and triangle budgets in world-look.js.
   THREE is never touched as a global: the one primitive the kit lacks (a
   detail-0 icosahedron for the faceted canopies) comes from ctx.K.THREE, and
   the pure helpers at the top of this file also load in Node for tests.

   ENCORE CITY LOOK (art-bible.v2): designer-toy, not nursery.
   - Trees are low-poly faceted canopies: 3–5 detail-0 icosahedron clusters,
     each facet flat-toned (lit tops, mid sides, shaded undersides). Variety
     comes from SLIslandLook.jitter2 in the batch (yaw, scale, lean, tint),
     never from geometry variants; idle amplitudes vary ×0.8–1.2 by uid.
   - Architecture-like pieces (lantern bollard, bench, sandcastle, windmill,
     lighthouse, paths) are crisp boxes and faceted lathes; no ink hulls.
   - The mossy rock has no face; the snowman's only features are coal dots
     and his carrot.

   CONVENTIONS
   - Item space: base at y = 0, pivot at the footprint centre, facing +z.
     Everything stays inside 0.86 × 0.86 except tree canopies, the flag
     cloth and the windmill sails above y ≈ 1.0 (the bible's overhang rule),
     and path arms, which run to the cell edge to meet their neighbours.
   - 'sway' is NOT a template pivot: it is the kit's whole-copy root alias
     (ItemBatch.pivot(uid, 'sway') → root), so swaying trees and bobbing
     flowers keep static, shadow-casting, frustum-culled parts.
   - Lit state ('lit', 0..1) is an instance colour on 'state' parts
     (bollard head, mushroom caps, lighthouse lamp room and LED gallery
     ring): a toggle never rebuilds anything.
   - Showtime-only light parts — LED dots (flags, bunting) and the windmill's
     light-painting tips — are 'state' parts on their own pivot, authored at
     1/FX_SCALE and collapsed into the pivot origin (hidden inside the
     hoist / rope / hub). The show handler scales them up by FX_SCALE at
     Showtime and to 0 by day, so photocards and first frames never show them.
   - The lighthouse beams are authored the same way (1/LH.beamScale on the
     'beam' pivot, inside the lamp room), so they never inflate the template
     bounds that frame photocards, and are scaled up only while lit.
   - Flag cloth and bunting pennants are perCopy parts: CPU waves written
     into each copy's own geometry (no allocation per frame).

   PATHS (P1 auto-tiling). The controller hands the piece in the stateKey:
     'p:<piece>' or 'p:<piece>:<layout>'   piece = single | end | straight | corner |
                                            tee | cross (SLIslandLook.pathPiece), layout 0..2
     anything else ('base': photocards, shop icons, a controller without auto-tiling)
                                            → the stand-alone square 'tile'
   Pieces are authored canonical (yaw 0: end opens N = -z, straight N-S, corner
   N+E, tee N+E+W) and turned by the copy's yaw; arms run to the cell edge, inner
   corners are filleted. pathPose(mask, uid) gives the controller {piece, yawDeg,
   layout, stateKey} in one call (3 stone / plank layouts and a free quarter-turn
   for the symmetric pieces, both hashed from the uid).

   ANIMATION HANDLE a (island-architecture.json → modelFactoryApi), used
   defensively — every call is skipped when the handle lacks it:
     a.uid a.t a.dt a.phase a.reduced a.beat a.show (0..1)
     a.pivot(name).set(rotDeg[3], pos[3], scale[3]) · a.state(key, value)
     a.halo(name, on, sizeU, token) · a.decal(on, token) · a.emit(kind, pos, n, opts)
     a.sfx(name, vol, step)
   Extra fields this chunk reads when the controller offers them:
     a.lit (bool|0..1, the island's lit memory) · a.music (false = music off)
     a.pathD (steps from the path network root, SLGrid3D.pathNetworks) ·
     a.copyGeometry(part) / a.basePositions(part) (else a.batch / a.object)
   Extra model fields (optional for the controller):
     lit(a, on)              snap a lamp to on/off without the flicker act
     material(matKey, part)  pass as K.batch / K.instantiate {material}: gives
                             the lighthouse beam its day-visible additive
                             material (without it the beam falls back to
                             'glow:Lamp Halo', which only shows at Showtime)
   Acts accept the CATALOG act ('glow' | 'wave' | 'spin') or the SLMotion
   act name ('glowOn' | 'glowOff' | 'flag' | 'bunting' | 'spin'); each plays
   the SLMotion timeline (reduced variant when a.reduced) and its cues. The
   glow acts play no sound: rewards-world plays 'star' / 'chip' itself.
   ================================================================ */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.SLModelsGarden = api;
    if (root.SL3D && typeof root.SL3D.defineModels === 'function') root.SL3D.defineModels('garden', api.factory);
  }
}(typeof self !== 'undefined' ? self : typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var IDS = ['tree_oak', 'tree_pine', 'tree_apple', 'tree_blossom', 'tree_palm',
    'flower_tulip', 'flower_daisy', 'flower_sun', 'bush_rose', 'rock_mossy',
    'lantern', 'mushroom_glow', 'flag_pole', 'bunting',
    'bench', 'sandcastle', 'umbrella', 'snowman', 'windmill', 'lighthouse',
    'path_stone', 'path_wood', 'path_flower'];

  /* tokens this file names directly (everything else comes from LOOK[id].colors):
     the v2 neon set (= SLIslandLook.NEON4) for Showtime LEDs, tips and the LED gallery ring */
  var NEON4 = ['Neon Magenta', 'LED Cyan', 'Electric Violet', 'Laser Lime'];
  var NEON3 = NEON4.slice(0, 3);
  var LIT_TOKENS = { dim: 'Ink Deep', night: 'Stage Night', white: 'Cloud White', runway: 'Pebble', spark: 'Holo Blue', led: 'LED Cyan' };
  var EXTRA_TOKENS = NEON4.concat(['Lamp Halo', 'Cap Halo', 'Lamp Warm', 'Cap Neon', LIT_TOKENS.dim, LIT_TOKENS.night,
    LIT_TOKENS.white, LIT_TOKENS.runway, LIT_TOKENS.spark]);

  /* SLMotion: the browser global, or the sibling module in Node */
  var M0 = null;
  function motion() {
    if (M0) return M0;
    M0 = root.SLMotion || null;
    if (!M0 && typeof require === 'function') { try { M0 = require('./motion.js'); } catch (e) { M0 = null; } }
    return M0;
  }

  /* ================================================================
     PURE LAYOUT DATA (no THREE; Node-tested for margins and heights)
     ================================================================ */
  var FIT = 0.43;             /* half of the 0.86 cell fit */
  var FX_SCALE = 40;          /* Showtime-only parts (LEDs, windmill tips) are authored at 1/FX_SCALE */
  var SUN_YAW = -38;          /* item-space yaw toward the day sun (front-left) */
  var ICO_TILT = Math.atan2(1, (1 + Math.sqrt(5)) / 2) * 180 / Math.PI;   /* 31.72°: a vertex on +y */
  var ICO_BELT = 2 / Math.sqrt(5);   /* a vertex-up icosahedron's widest ring, × its circumradius */

  /* point on a sphere surface along a direction (+ lift): [x, y, z] */
  function onSphere(c, r, dir, lift) {
    var l = Math.sqrt(dir[0] * dir[0] + dir[1] * dir[1] + dir[2] * dir[2]) || 1, k = (r + (lift || 0)) / l;
    return [c[0] + dir[0] * k, c[1] + dir[1] * k, c[2] + dir[2] * k];
  }
  /* broadleaf canopy (oak, apple, blossom): 5 faceted clusters (circumradius r, vertex up) on a
     hexagonal trunk with two limbs; 'tone' picks the cluster's mid colour, so the canopy reads
     two-tone. The crown tops out at the LOOK height 1.6 (the apple tree is built × 1.55/1.6). */
  var CANOPY = {
    trunk: { rTop: 0.06, rBot: 0.1, h: 0.86 },
    limbs: [[-0.17, 1.04, 0.05, 0.034], [0.18, 1.04, -0.04, 0.032]],     /* [tip x, y, z, base r] from the trunk top */
    /* clusters wider than the cell keep their widest ring (the belt) above y 1.0 */
    clusters: [
      { c: [0, 1.24, -0.02], r: 0.36, tone: 'canopy' },
      { c: [-0.22, 1.14, 0.06], r: 0.3, tone: 'canopyLow' },
      { c: [0.24, 1.13, -0.05], r: 0.28, tone: 'canopy' },
      { c: [0.04, 1.02, 0.2], r: 0.23, tone: 'canopyLow' },
      { c: [-0.04, 1.14, -0.21], r: 0.22, tone: 'canopy' }
    ]
  };
  /* apples sit on the front of the canopy: [cluster index, direction] */
  var APPLES = [[0, [-0.55, 0.25, 0.8]], [0, [0.5, 0.3, 0.8]], [2, [0.6, -0.15, 0.8]],
    [1, [-0.55, -0.15, 0.85]], [3, [0.25, -0.2, 1]], [3, [-0.5, 0.3, 0.85]]];
  var APPLE_R = 0.058, APPLE_SCALE = 1.55 / 1.6;
  function applePositions() {
    return APPLES.map(function (e) { var p = CANOPY.clusters[e[0]]; return onSphere(p.c, p.r * 0.84, e[1], 0); });
  }
  /* a vertex-up cluster's horizontal reach (its widest ring, the belt) and the belt's height */
  function clusterReach(cl) { return Math.max(Math.abs(cl.c[0]), Math.abs(cl.c[2])) + cl.r * ICO_BELT; }
  function clusterBelt(cl) { return cl.c[1] - cl.r / Math.sqrt(5); }
  /* pine: three hexagonal faceted tiers, bottom to top */
  var PINE = { trunk: { r: 0.07, h: 0.32 }, tiers: [{ r: 0.43, h: 0.62, y: 0.24 }, { r: 0.35, h: 0.56, y: 0.62 }, { r: 0.25, h: 0.62, y: 1.18 }] };
  /* palm: a leaning trunk of 6 ringed hexagonal segments, a crown of 5 two-kite fronds (the outer
     kite droops a further `bend` degrees) and 2 coconuts */
  var PALM = {
    base: [-0.04, 0, 0], ctrl: [-0.1, 0.85, 0], top: [0.04, 1.58, 0], segs: 6, rBot: 0.085, rTop: 0.06,
    frond: { r: 0.16, len: 0.58, flat: 0.26, waist: 0.42, split: 0.6, bend: 28 },
    /* [azimuth deg, tilt about z deg (-90 = horizontal out, < -90 droops)] of the inner kite */
    fronds: [[20, -44], [95, -108], [165, -114], [240, -106], [310, -112]],
    coconuts: [[-0.06, -0.07, 0.07], [0.07, -0.06, 0.06]], coconutR: 0.065
  };
  function bez(a, b, c, s) {
    var u = 1 - s;
    return [u * u * a[0] + 2 * u * s * b[0] + s * s * c[0], u * u * a[1] + 2 * u * s * b[1] + s * s * c[1], u * u * a[2] + 2 * u * s * b[2] + s * s * c[2]];
  }
  /* trunk segments: [{c: centre, len, tilt (deg about z), rBot, rTop}] */
  function palmTrunk() {
    var out = [];
    for (var i = 0; i < PALM.segs; i++) {
      var p0 = bez(PALM.base, PALM.ctrl, PALM.top, i / PALM.segs), p1 = bez(PALM.base, PALM.ctrl, PALM.top, (i + 1) / PALM.segs);
      var dx = p1[0] - p0[0], dy = p1[1] - p0[1], len = Math.sqrt(dx * dx + dy * dy);
      var k0 = i / PALM.segs, k1 = (i + 1) / PALM.segs;
      out.push({
        c: [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, 0], len: len * 1.06, tilt: -Math.atan2(dx, dy) * 180 / Math.PI,
        rBot: PALM.rBot + (PALM.rTop - PALM.rBot) * k0 + 0.012, rTop: PALM.rBot + (PALM.rTop - PALM.rBot) * k1
      });
    }
    return out;
  }
  /* a point `len` along +y turned by Rz(tilt) then Ry(az), from `from` (item space) */
  function frondPoint(from, az, tilt, len) {
    var t = tilt * Math.PI / 180, a = az * Math.PI / 180, x = -Math.sin(t) * len, y = Math.cos(t) * len;
    return [from[0] + x * Math.cos(a), from[1] + y, from[2] - x * Math.sin(a)];
  }
  /* the inner kite's tip (where the outer kite starts) and the frond's tip, for a [azimuth, tilt] pair */
  function frondKnee(f) { return frondPoint(PALM.top, f[0], f[1], PALM.frond.len * PALM.frond.split); }
  function frondTip(f) { var F = PALM.frond; return frondPoint(frondKnee(f), f[0], f[1] - F.bend, F.len * (1 - F.split)); }
  /* flower patches */
  var MOUND = { r: 0.35, h: 0.07, depth: 0.71 };
  var TULIPS = [{ x: -0.17, z: 0.02, h: 0.3 }, { x: 0, z: -0.06, h: 0.38 }, { x: 0.17, z: 0.05, h: 0.33 }];
  var TULIP_CUP = { r: 0.06, h: 0.1 };
  var DAISIES = [{ x: -0.2, z: 0.04, h: 0.24 }, { x: 0, z: -0.1, h: 0.28 }, { x: 0.2, z: 0.04, h: 0.26 }, { x: -0.1, z: 0.17, h: 0.18 }, { x: 0.12, z: 0.17, h: 0.2 }];
  var DAISY = { petals: 8, len: 0.05, wide: 0.022, inner: 0.012, tilt: 25 };
  var SUNFLOWERS = [{ x: -0.12, z: -0.03, y: 0.59 }, { x: 0.15, z: 0.08, y: 0.44 }];
  var SUNHEAD = { disc: 0.09, petals: 12, len: 0.07, wide: 0.034 };
  /* rose bush: three faceted clusters (vertex up), the top one lighter */
  var BUSH = [{ c: [-0.19, 0.2, 0], r: 0.22, tok: 'puff' }, { c: [0.2, 0.2, -0.01], r: 0.21, tok: 'puff' }, { c: [0, 0.37, 0.02], r: 0.23, tok: 'puffLight' }];
  var ROSES = [[0, [-0.5, 0.3, 0.8]], [1, [0.45, 0.35, 0.8]], [2, [-0.35, 0.45, 0.8]], [2, [0.4, 0.5, 0.75]], [0, [0.2, -0.1, 1]], [2, [0.08, 0.6, 0.8]]];
  function rosePositions() { return ROSES.map(function (e) { var p = BUSH[e[0]]; return onSphere(p.c, p.r * 0.86, e[1], 0); }); }
  /* mossy rock: a faceted boulder, a moss cap and a small companion stone (no face, no blink) */
  var ROCK = { r: 0.32, s: [1, 0.62, 0.85], y: 0.2, moss: { r: 0.27, y: 0.335, s: [0.92, 0.36, 0.78] }, pebble: { c: [0.29, 0.05, 0.17], r: 0.1, s: [1, 0.6, 0.9] } };
  /* mushrooms: x, z, stem height, cap radius */
  var SHROOMS = [{ x: -0.18, z: 0.07, stem: 0.24, r: 0.13 }, { x: 0.05, z: -0.05, stem: 0.36, r: 0.17 }, { x: 0.24, z: 0.12, stem: 0.17, r: 0.1 }];
  /* the slim bollard lantern: [w, h, d] boxes stacked from the base plate to the cap (top 1.4) */
  var LANTERN = { base: [0.22, 0.05, 0.22], post: [0.07, 0.975, 0.07], collar: [0.12, 0.03, 0.12], head: [0.17, 0.28, 0.17], fin: 0.022, cap: [0.21, 0.04, 0.21], tip: [0.07, 0.025, 0.07] };
  (function () {
    var y = 0;
    LANTERN.baseY = y + LANTERN.base[1] / 2; y += LANTERN.base[1];
    LANTERN.postY = y + LANTERN.post[1] / 2; y += LANTERN.post[1];
    LANTERN.collarY = y + LANTERN.collar[1] / 2; y += LANTERN.collar[1];
    LANTERN.headY = y + LANTERN.head[1] / 2; y += LANTERN.head[1];
    LANTERN.capY = y + LANTERN.cap[1] / 2; y += LANTERN.cap[1];
    LANTERN.tipY = y + LANTERN.tip[1] / 2; y += LANTERN.tip[1];
    LANTERN.top = y;
  }());
  /* bench: three seat slats and two back slats on two gunmetal side frames */
  var BENCH = { len: 0.82, seatY: 0.3, slat: [0.035, 0.078], seatZ: [0.115, 0.03, -0.055], back: [[0.4, -0.15], [0.49, -0.168]], frameX: 0.34, leg: 0.035 };
  /* flags */
  var FLAG = { poleX: -0.3, poleR: 0.03, poleTop: 1.85, w: 0.7, h: 0.45, top: 1.8 };
  FLAG.x0 = FLAG.poleX + FLAG.poleR; FLAG.cy = FLAG.top - FLAG.h / 2;
  var BUNT = { postX: 0.36, postH: 0.94, lineY: 0.9, sag: 0.14, n: 5, pr: 0.06, ph: 0.13 };
  function buntLineY(x) { var u = x / BUNT.postX; return BUNT.lineY - BUNT.sag * (1 - u * u); }
  function buntLineZ(x) { var u = x / BUNT.postX; return 0.03 * (1 - u * u); }
  /* pennant i hangs from the line at its top edge: {x, cy (hang height), cz, x0, x1} */
  function pennantLayout() {
    var out = [];
    for (var i = 0; i < BUNT.n; i++) {
      var x = -BUNT.postX + 2 * BUNT.postX * (i + 0.5) / BUNT.n;
      out.push({ x: x, cy: buntLineY(x) - 0.006, cz: buntLineZ(x), x0: x - BUNT.pr - 0.005, x1: x + BUNT.pr + 0.005 });
    }
    return out;
  }
  /* windmill: slim slat sails (a spar and `slats` thin blades on one side of it) */
  var MILL = { towerR: 0.3, towerH: 1.5, capR: 0.25, capH: 0.32, hub: [0, 1.6, 0.3], arm: 0.575, inner: 0.14, width: 0.14, slats: 6, trail: 6, trailDeg: 48 };
  /* lighthouse */
  var LH = { r: 0.32, h: 2.0, bands: [[0.22, 0.36], [0.58, 0.72]], lamp: [0, 2.18, 0], ledR: 0.3, beamLen: 6, beamR: 0.6, beamScale: 40 };

  /* ---------------- paths (P1 auto-tiling; pure) ---------------- */
  var PATH = { hw: 0.3, edge: 0.5, fit: 0.42, ro: 0.1, ri: 0.1, h: 0.035, plateY: 0.004, layouts: 3, budget: 120 };
  var PATH_PIECES = ['single', 'end', 'straight', 'corner', 'tee', 'cross'];
  var PIECE_MASK = { single: 0, end: 1, straight: 5, corner: 3, tee: 11, cross: 15 };   /* N 1 · E 2 · S 4 · W 8 */
  function fnv(s) {
    s = String(s);
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
  }
  function mix01(seed, n) {
    var h = (seed ^ Math.imul(n | 0, 0x9E3779B1)) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x85EBCA6B) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  /* the canonical piece for a neighbour mask (the same table as SLIslandLook.pathPiece:
     +90° yaw carries N onto W) */
  function rotMask(m) { return (m & 1 ? 8 : 0) | (m & 2 ? 1 : 0) | (m & 4 ? 2 : 0) | (m & 8 ? 4 : 0); }
  var PIECE_OF = {};
  PATH_PIECES.forEach(function (p) {
    var m = PIECE_MASK[p];
    for (var k = 0; k < 4; k++) { if (!PIECE_OF[m]) PIECE_OF[m] = { piece: p, yawDeg: 90 * k }; m = rotMask(m); }
  });
  function pathPieceOf(mask) { var p = PIECE_OF[(mask | 0) & 15]; return { piece: p.piece, yawDeg: p.yawDeg }; }
  function pathKey(piece, layout) {
    if (!Object.prototype.hasOwnProperty.call(PIECE_MASK, piece)) return 'base';
    var l = (layout | 0) % PATH.layouts;
    return 'p:' + piece + (l > 0 ? ':' + l : '');
  }
  /* stateKey → {piece ('tile' when it is not a path piece key), mask, layout} */
  function parsePathKey(key) {
    var m = /^p:(single|end|straight|corner|tee|cross)(?::([0-9]+))?$/.exec(String(key == null ? '' : key));
    if (!m) return { piece: 'tile', mask: -1, layout: 0 };
    return { piece: m[1], mask: PIECE_MASK[m[1]], layout: ((m[2] | 0) % PATH.layouts) };
  }
  /* everything the controller needs for one path copy: the piece and its yaw from the mask, a free
     extra quarter-turn for the symmetric pieces and a layout, both hashed from the uid. Each
     (piece, layout) is its own template and batch: pass layouts = 1 to keep one layout per piece
     (at most 6 batches per path id, e.g. on LOW) */
  function pathPose(mask, uid, out, layouts) {
    out = out || {};
    var n = layouts >= 1 && layouts <= PATH.layouts ? layouts | 0 : PATH.layouts;
    var p = pathPieceOf(mask), h = fnv(String(uid) + '|path');
    var turns = p.piece === 'single' || p.piece === 'cross' ? h % 4 : p.piece === 'straight' ? (h % 2) * 2 : 0;
    out.piece = p.piece; out.yawDeg = (p.yawDeg + 90 * turns) % 360; out.layout = (h >>> 8) % n;
    out.stateKey = pathKey(out.piece, out.layout);
    return out;
  }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function sdBox(x, z, x0, z0, x1, z1) {
    var hx = (x1 - x0) / 2, hz = (z1 - z0) / 2;
    var dx = Math.abs(x - (x0 + x1) / 2) - hx, dz = Math.abs(z - (z0 + z1) / 2) - hz;
    var ox = dx > 0 ? dx : 0, oz = dz > 0 ? dz : 0;
    return Math.sqrt(ox * ox + oz * oz) + Math.min(Math.max(dx, dz), 0);
  }
  function sdRoundSquare(x, z, half, r) {
    var dx = Math.abs(x) - (half - r), dz = Math.abs(z) - (half - r);
    var ox = dx > 0 ? dx : 0, oz = dz > 0 ? dz : 0;
    return Math.sqrt(ox * ox + oz * oz) + Math.min(Math.max(dx, dz), 0) - r;
  }
  /* the fillet in a concave corner at (cx, cz), growing r into the quadrant away from the centre:
     the corner square minus the disc that rounds it */
  function sdFillet(x, z, cx, cz, r) {
    var sx = cx < 0 ? -1 : 1, sz = cz < 0 ? -1 : 1, ox = cx + sx * r, oz = cz + sz * r;
    var sq = sdBox(x, z, Math.min(cx, ox), Math.min(cz, oz), Math.max(cx, ox), Math.max(cz, oz));
    var dx = x - ox, dz = z - oz;
    return Math.max(sq, r - Math.sqrt(dx * dx + dz * dz));
  }
  /* signed distance (u) to a canonical piece's walkable area (< 0 inside): a rounded centre
     square, arms out past the cell edge, filleted inner corners. 'tile' is the stand-alone square. */
  function pathSd(piece, x, z) {
    if (!Object.prototype.hasOwnProperty.call(PIECE_MASK, piece)) return sdRoundSquare(x, z, PATH.fit, PATH.ro);
    var mask = PIECE_MASK[piece], hw = PATH.hw, E = PATH.edge + hw, d = sdRoundSquare(x, z, hw, PATH.ro);
    if (mask & 1) d = Math.min(d, sdBox(x, z, -hw, -E, hw, 0));
    if (mask & 2) d = Math.min(d, sdBox(x, z, 0, -hw, E, hw));
    if (mask & 4) d = Math.min(d, sdBox(x, z, -hw, 0, hw, E));
    if (mask & 8) d = Math.min(d, sdBox(x, z, -E, -hw, 0, hw));
    pathFillets(piece).forEach(function (q) { d = Math.min(d, sdFillet(x, z, q[0], q[1], PATH.ri)); });
    return d;
  }
  /* flagstones: a 0.25 u lattice (4 × 4 per cell, so the stride carries on across cell edges) kept
     where it falls on the walk; each layout jitters, sizes and turns the stones differently.
     The stand-alone tile is a 3 × 3 patch. Stones are open 5-sided cones: 5 tris each. */
  var COBBLE = { lattice: [-0.375, -0.125, 0.125, 0.375], tile: 0.27, jitter: 0.022, rMin: 0.106, rMax: 0.126, sides: 5 };
  function pathStones(piece, layout) {
    var l = (layout | 0) % PATH.layouts, s = fnv('sl-cobble|' + l), pts = [], out = [];
    if (!Object.prototype.hasOwnProperty.call(PIECE_MASK, piece)) {
      for (var i = -1; i <= 1; i++) for (var j = -1; j <= 1; j++) pts.push([i * COBBLE.tile, j * COBBLE.tile]);
    } else {
      COBBLE.lattice.forEach(function (z) {
        COBBLE.lattice.forEach(function (x) { if (pathSd(piece, x, z) < -0.1) pts.push([x, z]); });
      });
    }
    pts.forEach(function (p, n) {
      /* a running-bond nudge: alternate lattice rows slide ±jitter along x on layouts 1 and 2;
         every stone stays inside its own cell */
      var row = Math.round((p[1] + 0.375) / 0.25), bond = l ? (row % 2 ? 1 : -1) * COBBLE.jitter * (l === 1 ? 1 : -1) : 0;
      var r = COBBLE.rMin + (COBBLE.rMax - COBBLE.rMin) * mix01(s, n * 4 + 2), lim = PATH.edge - r * 0.82;
      var x = p[0] + bond + (mix01(s, n * 4) * 2 - 1) * COBBLE.jitter * 0.6, z = p[1] + (mix01(s, n * 4 + 1) * 2 - 1) * COBBLE.jitter * 0.6;
      out.push({ x: x < -lim ? -lim : x > lim ? lim : x, z: z < -lim ? -lim : z > lim ? lim : z, r: r, rot: mix01(s, n * 4 + 3) * 72 });
    });
    return out;
  }
  /* stepping stones (flower path): two per open arm at 0.125 and 0.375 u from the centre, so the
     stride stays 0.25 u along the run and across cell edges (where arms turn a corner the inner
     stones are a little smaller, so they never touch); an end gets a closing stone, the single
     one big stone; the tile is the two-stone v1 patch */
  function stepStones(piece, layout) {
    var l = (layout | 0) % PATH.layouts, s = fnv('sl-step|' + l), out = [];
    function r(n) { return 0.085 + 0.025 * mix01(s, n); }
    if (!Object.prototype.hasOwnProperty.call(PIECE_MASK, piece)) {
      return [{ x: -0.18, z: -0.15, r: 0.17, rot: 10 }, { x: 0.17, z: 0.15, r: 0.18, rot: 40 }];
    }
    var mask = PIECE_MASK[piece], turns = ((mask & 1) || (mask & 4)) && ((mask & 2) || (mask & 8)), arms = 0;
    [[1, 0, -1], [2, 1, 0], [4, 0, 1], [8, -1, 0]].forEach(function (a, i) {
      if (!(mask & a[0])) return;
      arms++;
      [0.125, 0.375].forEach(function (d, k) {
        var n = i * 2 + k, wob = (mix01(s, 20 + n) - 0.5) * 0.04;
        out.push({ x: a[1] * d + (a[1] ? 0 : wob), z: a[2] * d + (a[2] ? 0 : wob), r: r(n) * (turns && !k ? 0.85 : 1), rot: mix01(s, 40 + n) * 60 });
      });
    });
    if (arms === 1) out.push({ x: 0, z: (mask & 1) ? 0.125 : 0, r: r(9), rot: mix01(s, 9) * 60 });
    if (arms === 0) out.push({ x: 0, z: 0, r: 0.16, rot: mix01(s, 9) * 60 });
    return out;
  }
  /* flower clumps of the flower path: spots off the walk (sd > 0) inside the cell */
  var FLOWER_SPOTS = [[0.31, -0.31], [-0.31, 0.31], [0.32, 0.3], [-0.3, -0.32], [0, -0.37], [0.37, 0], [0, 0.37], [-0.37, 0]];
  function pathFlowers(piece, layout, max) {
    var l = (layout | 0) % PATH.layouts, out = [], n = max == null ? 3 : max;
    if (!Object.prototype.hasOwnProperty.call(PIECE_MASK, piece)) {
      return [[0.2, -0.24, 0], [-0.26, 0.22, 1], [-0.02, -0.01, 2]].slice(0, n).map(function (f) { return { x: f[0], z: f[1], k: f[2] }; });
    }
    for (var i = 0; i < FLOWER_SPOTS.length && out.length < n; i++) {
      var q = FLOWER_SPOTS[(i + l * 3) % FLOWER_SPOTS.length];
      if (pathSd(piece, q[0], q[1]) > 0.04) out.push({ x: q[0], z: q[1], k: (i + l) % 3 });
    }
    return out;
  }
  /* boardwalk planks (canonical: boards run along x across the N-S walk):
     [{x0, x1, z, w}] — three centre boards (reaching E / W when those arms are open) and one board
     per N / S arm; the tile is the v1 five-board square. Layouts 1 and 2 stagger one board's
     closed end (never an end that meets a neighbour) */
  var PLANK = { w: 0.19, gap: 0.01, inset: 0.035, tile: { n: 5, w: 0.155, half: 0.42 } };
  function pathPlanks(piece, layout) {
    var out = [], hw = PATH.hw, E = PATH.edge - 0.005, l = (layout | 0) % PATH.layouts;
    if (!Object.prototype.hasOwnProperty.call(PIECE_MASK, piece)) {
      var tp = PLANK.tile;
      for (var i = 0; i < tp.n; i++) out.push({ x0: -tp.half, x1: tp.half, z: -tp.half + tp.w / 2 + i * (2 * tp.half - tp.w) / (tp.n - 1), w: tp.w });
    } else {
      var mask = PIECE_MASK[piece], x0 = mask & 8 ? -E : -hw, x1 = mask & 2 ? E : hw, step = PLANK.w + PLANK.gap;
      for (var k = -1; k <= 1; k++) out.push({ x0: x0, x1: x1, z: k * step, w: PLANK.w });
      if (mask & 1) out.push({ x0: -hw, x1: hw, z: -E + PLANK.w / 2, w: PLANK.w });
      if (mask & 4) out.push({ x0: -hw, x1: hw, z: E - PLANK.w / 2, w: PLANK.w });
    }
    for (var n = 0; l && n < out.length; n++) {
      var p = out[(l * 2 + 1 + n) % out.length], d = PLANK.inset * (l === 1 ? 1 : 0.6);
      if (p.x0 > -E + 1e-9) { p.x0 += d; break; }
      if (p.x1 < E - 1e-9) { p.x1 -= d; break; }
    }
    return out;
  }
  /* the inner (concave) corners of a piece, each filled by a low fillet board: [[x, z], …] */
  function pathFillets(piece) {
    if (!Object.prototype.hasOwnProperty.call(PIECE_MASK, piece)) return [];
    var m = PIECE_MASK[piece], hw = PATH.hw, out = [];
    if ((m & 1) && (m & 2)) out.push([hw, -hw]);
    if ((m & 2) && (m & 4)) out.push([hw, hw]);
    if ((m & 4) && (m & 8)) out.push([-hw, hw]);
    if ((m & 8) && (m & 1)) out.push([-hw, -hw]);
    return out;
  }
  /* the Showtime runway under-glow as rectangles [x0, z0, x1, z1] (≤ 2 per piece) */
  function pathPlates(piece) {
    var hw = PATH.hw, E = PATH.edge, f = PATH.fit;
    if (!Object.prototype.hasOwnProperty.call(PIECE_MASK, piece)) return [[-f, -f, f, f]];
    var m = PIECE_MASK[piece], out = [];
    var ns = (m & 1) || (m & 4), ew = (m & 2) || (m & 8);
    if (ns || !ew) out.push([-hw, m & 1 ? -E : -hw, hw, m & 4 ? E : hw]);
    if (ew) out.push([m & 8 ? -E : -hw, -hw, m & 2 ? E : hw, hw]);
    return out;
  }

  /* ================================================================
     PURE ANIMATION HELPERS (allocation-free; Node-tested)
     ================================================================ */
  /* idle amplitude ×0.8–1.2 per copy (decorrelated from its phase), so neighbours never sway in step */
  function idleAmp(phase) { var v = (phase || 0) * 9.73 + 0.13; return 0.8 + 0.4 * (v - Math.floor(v)); }
  /* flag cloth: z = base z + flutter(u) with u = 0 at the hoist … 1 at the free edge */
  function flagWave(base, pos, t, amp, hz, phase, reduced, x0, w, flutter) {
    for (var i = 0; i < base.length; i += 3) {
      var u = clamp01((base[i] - x0) / w);
      pos[i] = base[i];
      pos[i + 1] = base[i + 1] - (reduced ? 0 : 0.25 * amp * u * u);          /* the free corner droops a touch */
      pos[i + 2] = base[i + 2] + flutter(t, amp, hz, u, phase, reduced);
    }
    return pos;
  }
  /* flat normals of a non-indexed triangle list */
  function faceNormals(pos, nrm) {
    for (var i = 0; i + 8 < pos.length; i += 9) {
      var ax = pos[i + 3] - pos[i], ay = pos[i + 4] - pos[i + 1], az = pos[i + 5] - pos[i + 2];
      var bx = pos[i + 6] - pos[i], by = pos[i + 7] - pos[i + 1], bz = pos[i + 8] - pos[i + 2];
      var nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
      var l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      nx /= l; ny /= l; nz /= l;
      for (var k = 0; k < 9; k += 3) { nrm[i + k] = nx; nrm[i + k + 1] = ny; nrm[i + k + 2] = nz; }
    }
    return nrm;
  }
  /* per-pennant swing (deg): idle ±deg with staggered phases, plus the tap ripple */
  function pennantAngles(t, n, deg, hz, phase, reduced, front, rippleAmp, pennant, ripple, out) {
    for (var i = 0; i < n; i++) {
      var u = n > 1 ? i / (n - 1) : 0;
      out[i] = pennant(t, i, deg, hz, phase, reduced) + (rippleAmp ? ripple(u, front, rippleAmp) : 0);
    }
    return out;
  }
  /* rotate each pennant about its hang line (an x-axis through cy, cz); normals follow */
  function pennantWave(base, pos, baseN, nrm, layout, angles) {
    for (var i = 0; i < base.length; i += 3) {
      var x = base[i], k = -1;
      for (var j = 0; j < layout.length; j++) if (x >= layout[j].x0 && x <= layout[j].x1) { k = j; break; }
      if (k < 0) { pos[i] = x; pos[i + 1] = base[i + 1]; pos[i + 2] = base[i + 2]; continue; }
      var L = layout[k], a = angles[k] * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
      var dy = base[i + 1] - L.cy, dz = base[i + 2] - L.cz;
      pos[i] = x; pos[i + 1] = L.cy + dy * c - dz * s; pos[i + 2] = L.cz + dy * s + dz * c;
      if (baseN && nrm) {
        var ny = baseN[i + 1], nz = baseN[i + 2];
        nrm[i] = baseN[i]; nrm[i + 1] = ny * c - nz * s; nrm[i + 2] = ny * s + nz * c;
      }
    }
    return pos;
  }
  /* sunflower head aim: by day toward the sun with a slow drift, at Showtime swivelling
     with the sweeping spotlight (coneSweep) and looking up; reduced = the still day pose */
  function sunAim(t, show, i, phase, reduced, coneSweep, out) {
    out = out || {};
    var k = clamp01(show || 0);
    var dayYaw = SUN_YAW + (reduced ? 0 : 4 * Math.sin(2 * Math.PI * (t / 14 + (phase || 0) + i * 0.27)));
    var showYaw = reduced ? 0 : coneSweep(t, i % 3, false);
    out.yaw = dayYaw + (showYaw - dayYaw) * k;
    out.pitch = -16 - 10 * k;
    return out;
  }
  /* path runway chase level at Showtime (0 by day; the glow material itself fades
     with the Showtime mix); d = steps along the path network */
  function runwayLevel(t, d, show, reduced, chaseWave) {
    if (!(show > 0.001)) return 0;
    return chaseWave(t, d, 2, 4, reduced);
  }
  /* the two antiphase LED groups (≤ 1.5 Hz), scaled by the Showtime mix */
  function ledLevels(t, phase, show, reduced, twinkle, out) {
    out = out || [0, 0];
    var k = clamp01(show || 0);
    out[0] = k * (0.35 + 0.65 * twinkle(t, 1.5, phase, reduced));
    out[1] = k * (0.35 + 0.65 * twinkle(t, 1.5, (phase || 0) + 0.5, reduced));
    return out;
  }
  /* Euler XYZ degrees (three.js order) that turn +y onto the direction (dx, dy, dz) */
  function alignY(dx, dy, dz) {
    var l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    dx /= l; dy /= l; dz /= l;
    var gz = -Math.asin(dx < -1 ? -1 : dx > 1 ? 1 : dx);
    var ax = Math.abs(dx) > 0.99999 ? 0 : Math.atan2(dz, dy);
    return [ax * 180 / Math.PI, 0, gz * 180 / Math.PI];
  }

  /* ================================================================
     FACTORY — runs once THREE is ready: SL3D.defineModels('garden', factory)
     K0 is the session-tier kit; every build uses ctx.K / ctx.G (its own tier).
     ================================================================ */
  function factory(K0) {
    var M = motion();
    var LOOKS = (root.SLIslandLook && root.SLIslandLook.LOOK) || {};

    /* ---------------- build helpers ---------------- */
    function colorsOf(ctx) { return (ctx.look && ctx.look.colors) || (LOOKS[ctx.id] && LOOKS[ctx.id].colors) || {}; }
    function rad(ctx, n) { return ctx.tier === 'LOW' ? Math.max(3, Math.round(n * 0.7)) : n; }
    function T(G, geo, p, r, s) { return G.t(geo, { p: p, r: r, s: s }); }
    /* base tone everywhere, shade on the undersides (the toon ramp does the rest) */
    function tone2(G, geo, tok, under) {
      var lim = under == null ? -0.35 : under;
      return G.paintBy(geo, function (v) { return v.ny < lim ? [tok, 'shade'] : tok; });
    }
    /* one flat tone per facet: lit tops, mid sides, shaded undersides */
    function gem(G, geo, lit, mid, low, up, down) {
      var hi = up == null ? 0.5 : up, lo = down == null ? -0.3 : down;
      return G.paintBy(geo, function (v) { return v.ny > hi ? lit : v.ny < lo ? low : mid; }, { perFace: true });
    }
    /* a faceted detail-0 icosahedron of circumradius r with a vertex on +y (the low-poly canopy
       cluster); the kit has no detail-0 primitive, so it comes from ctx.K.THREE (an 80-face
       faceted puff without it) */
    function ico(ctx, r) {
      var G = ctx.G, T3 = ctx.K && ctx.K.THREE, g = null;
      if (T3 && typeof T3.IcosahedronGeometry === 'function' && typeof G.normalise === 'function') g = G.normalise(new T3.IcosahedronGeometry(r, 0));
      if (!g) g = G.puff(r);
      return G.facet(T(G, g, null, [0, 0, ICO_TILT]));
    }
    /* a crisp box (BoxGeometry: architecture at this scale reads crisp without a bevel) */
    function box(G, w, h, d, p, r) { return T(G, G.slab(w, h, d, 0), p, r); }
    /* a tube between two points */
    function rod(G, a, b, r0, r1, radial) {
      var dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-4;
      return T(G, G.tube(r1, r0, len, { radial: radial }), [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], alignY(dx, dy, dz));
    }
    /* a 4-sided double cone (octahedron-like): LED dots, sparkles (16 tris) */
    function bicone(G, r, h) {
      var up = T(G, G.cone(r, h / 2, 4), [0, h / 4, 0]);
      var dn = T(G, G.cone(r, h / 2, 4), [0, -h / 4, 0], [180, 0, 0]);
      return G.merge([up, dn]);
    }
    /* a flat dot facing +z (coal, shells) */
    function dot(G, r, depth, radial) { return T(G, G.tube(r, r, depth, { radial: radial || 6 }), null, [90, 0, 0]); }
    /* a dot half-sunk into a sphere (centre c, radius r) along dir, facing out of the surface */
    function stud(G, c, r, dir, dr, depth, radial) {
      var l = Math.sqrt(dir[0] * dir[0] + dir[1] * dir[1] + dir[2] * dir[2]) || 1;
      var el = Math.asin(dir[1] / l) * 180 / Math.PI, az = Math.atan2(dir[0], dir[2]) * 180 / Math.PI;
      return T(G, T(G, dot(G, dr, depth, radial), null, [-el, 0, 0]), onSphere(c, r, dir), [0, az, 0]);
    }
    /* a faceted domed mound (lathe, 4 profile steps), elliptical in z */
    var MOUND_PROF = [[0, 0], [1, 0], [0.93, 0.5], [0.6, 0.92], [0, 1]];
    function mound(G, tok, r, h, depth) {
      var g = G.facet(T(G, G.drop(r || MOUND.r, h || MOUND.h, MOUND_PROF), null, null, [1, 1, depth || MOUND.depth]));
      return G.paintBy(g, function (v) { return v.ny > 0.8 ? [tok, 'hi'] : v.ny < -0.2 ? [tok, 'shade'] : tok; }, { perFace: true });
    }
    /* a low cone lying on the ground, apex up and optionally tinted (pebbles, flowers, petals) */
    function flatCone(G, r, h, radial, tok, apexTok) {
      var g = T(G, G.cone(r, h, radial), [0, h / 2, 0]);
      return G.paintBy(g, function (v) { return apexTok && v.y > h * 0.9 ? apexTok : tok; });
    }
    /* a flat rectangle plate on the ground (a 4-sided cone turned 45° and stretched): w × d at (x, z) */
    function plate(G, x0, z0, x1, z1, y, centreTok, rimTok) {
      var g = T(G, G.cone(1, 0.002, 4), null, [0, 45, 0]);
      G.paintBy(g, function (v) { return v.y > 0 ? centreTok : rimTok; });
      return T(G, g, [(x0 + x1) / 2, y, (z0 + z1) / 2], null, [(x1 - x0) / Math.SQRT2, 1, (z1 - z0) / Math.SQRT2]);
    }
    function tpl(ctx) { return ctx.K.template(ctx); }
    /* Showtime-only light parts are authored 1/FX_SCALE size, collapsed into their pivot
       origin (inside the hub / rope / hoist), so templates, photocards and the first
       frame never show them; the show handler scales the pivot up by FX_SCALE */
    function shrink(G, g, o) {
      T(G, g, [-o[0], -o[1], -o[2]]);
      return T(G, g, o, null, 1 / FX_SCALE);
    }

    /* ---------------- per-copy memory ----------------
       Handlers remember what they last wrote to a copy (lit level, halo, decal, LED / tip / beam
       pivots, act carry-over) so idles only send changes. That memory belongs to ONE copy: it is
       dropped when the uid's copy changes (a remount, a context-restore rebuild or a restyle hands
       the handle a new ItemBatch / object, whose state is the template's initial one) and when the
       controller calls model.forget(uid) as it removes a copy. Handles without a batch / object
       (photocards, tests) keep plain per-uid memory. */
    var PER_COPY = [], copyOf = new Map();
    function perCopy(m) { PER_COPY.push(m); return m; }
    function forget(uid) {
      for (var i = 0; i < PER_COPY.length; i++) PER_COPY[i].delete(uid);
      copyOf.delete(uid);
    }
    function own(a) {
      if (!a || a.uid == null) return;
      var c = a.batch || a.object || a.obj || null;
      if (!c || copyOf.get(a.uid) === c) return;
      forget(a.uid);
      copyOf.set(a.uid, c);
    }

    /* ---------------- animation-handle helpers (no allocation per frame) ---------------- */
    var R3 = [0, 0, 0], P3 = [0, 0, 0], S3 = [1, 1, 1];
    function setPiv(a, name, rx, ry, rz, px, py, pz, sx, sy, sz) {
      if (!a || typeof a.pivot !== 'function') return;
      var p = a.pivot(name);
      if (!p || typeof p.set !== 'function') return;
      R3[0] = rx; R3[1] = ry; R3[2] = rz; P3[0] = px; P3[1] = py; P3[2] = pz;
      S3[0] = sx; S3[1] = sy == null ? sx : sy; S3[2] = sz == null ? sx : sz;
      p.set(R3, P3, S3);
    }
    function setState(a, key, v) { if (a && typeof a.state === 'function') a.state(key, v); }
    function sfx(a, name, vol, step) { if (a && typeof a.sfx === 'function') a.sfx(name, vol == null ? 1 : vol, step); }
    function emit(a, kind, pos, n, opts) { if (a && typeof a.emit === 'function') a.emit(kind, pos, n, opts); }
    function showOf(a) { var k = a ? +a.show : 0; return k > 0 ? (k > 1 ? 1 : k) : 0; }
    /* a perCopy part's live geometry, and the template's rest positions / normals */
    function copyGeo(a, part) {
      if (typeof a.copyGeometry === 'function') return a.copyGeometry(part);
      if (a.batch && typeof a.batch.copyGeometry === 'function') return a.batch.copyGeometry(a.uid, part);
      var o = a.object || a.obj, ms = o && o.userData && o.userData.meshes;
      return ms && ms[part] ? ms[part].geometry : null;
    }
    function templateOf(a) {
      return a.template || (a.batch && a.batch.template) || (a.object && a.object.userData && a.object.userData.template) || null;
    }
    function baseAttr(a, part, attr) {
      if (attr === 'position') {
        if (typeof a.basePositions === 'function') return a.basePositions(part);
        if (a.batch && typeof a.batch.basePositions === 'function') return a.batch.basePositions(part);
      }
      var t = templateOf(a), ps = t && t.parts;
      if (ps) for (var i = 0; i < ps.length; i++) if (ps[i].name === part) { var at = ps[i].geo.getAttribute(attr); return at ? at.array : null; }
      return null;
    }

    /* ---------------- acts: SLMotion timelines with cue playback ---------------- */
    var carry = perCopy(new Map());      /* uid → {name, pose}: an interrupted act's pose for its restart */
    var running = perCopy(new Map());    /* uid → {name, end}: the live act (expires, in case a controller drops it) */
    var isRunning = {
      has: function (uid, t) {
        var r = running.get(uid);
        if (!r) return false;
        if (typeof t === 'number' && t > r.end) { running.delete(uid); return false; }
        return true;
      }
    };
    function runAct(a, name, apply, o) {
      if (!M || !M.ACTS[name] || !a) return null;
      o = o || {};
      var uid = a.uid, reduced = !!a.reduced;
      var c = carry.get(uid), from = c && c.name === name ? c.pose : null;
      carry.delete(uid);
      var opt = { reduced: reduced, from: from };
      var dur = M.durOf(name, opt), cues = M.cues(name, opt), ci = 0, pose = {}, done = false;
      var me = { name: name, end: (typeof a.t === 'number' ? a.t : 0) + dur + 1 };
      running.set(uid, me);
      function stop() { done = true; if (running.get(uid) === me) running.delete(uid); }
      return {
        dur: dur, name: name,
        update: function (a2, tAct) {
          if (done) return false;
          a2 = a2 || a;
          M.sample(name, tAct, pose, opt);
          for (; ci < cues.length && cues[ci].t <= tAct; ci++) {
            var cue = cues[ci];
            if (cue.sfx && o.sfx !== false) sfx(a2, cue.sfx, cue.vol, cue.step);
            if (cue.emit) emit(a2, cue.emit, 'top', cue.n || 1);
          }
          apply(a2, pose, tAct);
          if (tAct >= dur) { stop(); if (o.end) o.end(a2, pose); return false; }
          return true;
        },
        cancel: function () {
          if (done) return;
          carry.set(uid, { name: name, pose: M.carry(name, pose) });
          stop();
          if (o.cancel) o.cancel(a, pose);
        }
      };
    }
    function busy(a) { return isRunning.has(a.uid, a.t); }

    /* ---------------- lamps: lit level → state colour, halo, Showtime decal ---------------- */
    var litLv = perCopy(new Map()), haloOn = perCopy(new Map()), decalOn = perCopy(new Map());
    function litNow(a) {
      if (busy(a) && litLv.has(a.uid)) return litLv.get(a.uid);
      if (typeof a.lit === 'boolean' || typeof a.lit === 'number') return clamp01(+a.lit);
      return litLv.get(a.uid) || 0;
    }
    function lampApply(a, level, cfg) {
      var uid = a.uid;
      if (litLv.get(uid) !== level) { litLv.set(uid, level); setState(a, 'lit', level); }
      var on = level > 0.5;     /* halos and decals start off: only changes are sent */
      if (!!haloOn.get(uid) !== on && typeof a.halo === 'function') { haloOn.set(uid, on); a.halo('glow', on, cfg.halo.size, cfg.halo.token); }
      var d = on && showOf(a) > 0.5;
      if (!!decalOn.get(uid) !== d && typeof a.decal === 'function') { decalOn.set(uid, d); a.decal(d, cfg.decal); }
    }
    function lampCfg(id) {
      var s = (LOOKS[id] && LOOKS[id].show) || {};
      var dflt = id === 'mushroom_glow' ? { token: 'Cap Halo', size: 0.8 } : { token: 'Lamp Halo', size: id === 'lighthouse' ? 1.0 : 0.9 };
      return { halo: s.halo || dflt, decal: (s.decal && s.decal.token) || (id === 'mushroom_glow' ? 'Cap Neon' : 'Lamp Warm') };
    }
    /* 'glow' toggles from the tracked level; 'glowOn' / 'glowOff' are explicit */
    function glowAct(a, name, cfg, extra) {
      var nm = name === 'glowOn' || name === 'glowOff' ? name : (litNow(a) >= 0.5 ? 'glowOff' : 'glowOn');
      return runAct(a, nm, function (a2, pose) {
        var lv = clamp01(pose.level);
        lampApply(a2, lv, cfg);
        if (extra) extra(a2, lv);
      }, { sfx: false });
    }
    var models = {};
    function idleOf(id, dflt) { return (LOOKS[id] && LOOKS[id].idle) || dflt; }

    /* ================================================================
       TREES — one static faceted toon part; the idle sways the whole copy ('sway' = root)
       ================================================================ */
    function swayIdle(id, dflt) {
      var idl = idleOf(id, dflt), sw = {};
      return function (a) {
        if (!M || !a) return;
        M.sway(a.t, idl.deg * idleAmp(a.phase), idl.period, a.phase, a.reduced, sw);
        setPiv(a, 'sway', sw.x, 0, sw.z, 0, 0, 0, 1);
      };
    }
    function trunkGeos(ctx, c, geos) {
      var G = ctx.G, tr = CANOPY.trunk, top = [0, tr.h, 0];
      var trunk = G.facet(T(G, G.tube(tr.rTop, tr.rBot, tr.h, { radial: rad(ctx, 6) }), [0, tr.h / 2, 0], [0, 15, 0]));
      geos.push(G.paintBy(trunk, function (v) { return v.y < 0.1 || v.ny < -0.5 ? [c.trunk, 'shade'] : c.trunk; }, { perFace: true }));
      CANOPY.limbs.forEach(function (l) {
        var from = [top[0] * 0.5, top[1] - 0.12, top[2]];
        geos.push(G.paint(G.facet(rod(G, from, [l[0], l[1], l[2]], l[3], l[3] * 0.6, rad(ctx, 5))), c.trunk));
      });
    }
    var L_SPEC = [-0.398, 0.597, 0.697];   /* apple spec facet: turned toward the top-left light */
    function broadleaf(ctx, kind) {
      var G = ctx.G, c = colorsOf(ctx), geos = [];
      trunkGeos(ctx, c, geos);
      CANOPY.clusters.forEach(function (cl) {
        var g = T(G, ico(ctx, cl.r), cl.c);
        if (cl.tone === 'canopyLow') geos.push(gem(G, g, c.canopy, c.canopyLow, [c.canopyLow, 'shade']));
        else geos.push(gem(G, g, c.dab, c.canopy, c.canopyLow));
      });
      if (kind === 'apple') {
        /* faceted 80-face apples: one small facet toward the light carries the shine */
        applePositions().forEach(function (p) {
          var ap = G.facet(T(G, G.puff(APPLE_R), p));
          geos.push(G.paintBy(ap, function (v) {
            var d = v.nx * L_SPEC[0] + v.ny * L_SPEC[1] + v.nz * L_SPEC[2];
            return d > 0.92 ? c.spec : d < -0.4 ? [c.apple, 'shade'] : c.apple;
          }, { perFace: true }));
        });
      }
      if (kind === 'blossom') {   /* a few fallen petals on the grass, as in the 2D art */
        [[-0.3, 0.3, 20], [0.28, 0.34, 70], [0.04, 0.4, 130]].forEach(function (q) {
          geos.push(T(G, flatCone(G, 0.035, 0.006, 5, c.petal), [q[0], 0, q[1]], [0, q[2], 0], [1, 1, 0.7]));
        });
      }
      if (kind === 'apple') geos.forEach(function (g) { T(G, g, null, null, APPLE_SCALE); });   /* 1.55 tall, not 1.6 */
      return tpl(ctx).part('body', geos, 'toon', { castShadow: true }).done();
    }
    /* blossom petals drift through the fx pool (at most 40 alive, capped there) */
    var petalLast = perCopy(new Map()), PETAL_POS = [0, 0, 0], petalOpts = null, ev = {};
    function blossomPetals(a) {
      if (!M || !a || a.reduced || typeof a.emit !== 'function') return;
      var seed = ((a.phase || 0) * 4294967296) >>> 0;
      M.every(a.t, 1.0, 1.6, seed ^ 0x5bd1e995, ev);
      if (ev.since < 0 || ev.since > 0.5 || petalLast.get(a.uid) === ev.n) return;
      petalLast.set(a.uid, ev.n);
      var ang = ev.n * 2.39996 + (a.phase || 0) * 6.2832;
      PETAL_POS[0] = Math.cos(ang) * 0.38; PETAL_POS[1] = 0.92; PETAL_POS[2] = Math.sin(ang) * 0.32 + 0.06;
      if (!petalOpts) {
        var tok = (LOOKS.tree_blossom && LOOKS.tree_blossom.colors.petal) || 'Blossom Light';
        petalOpts = { token: tok, cell: 'petal', max: 40 };
      }
      emit(a, 'petal', PETAL_POS, 1, petalOpts);
    }
    var treeSway = swayIdle('tree_oak', { deg: 1.5, period: 4.2 });
    models.tree_oak = { build: function (ctx) { return broadleaf(ctx, 'oak'); }, idle: treeSway, act: function () { return null; }, show: function () {} };
    models.tree_apple = { build: function (ctx) { return broadleaf(ctx, 'apple'); }, idle: swayIdle('tree_apple', { deg: 1.5, period: 4.2 }), act: function () { return null; }, show: function () {} };
    var blossomSway = swayIdle('tree_blossom', { deg: 1.5, period: 4.2 });
    models.tree_blossom = {
      build: function (ctx) { return broadleaf(ctx, 'blossom'); },
      idle: function (a) { blossomSway(a); blossomPetals(a); },
      act: function () { return null; }, show: function () {}
    };

    models.tree_pine = {
      build: function (ctx) {
        var G = ctx.G, c = colorsOf(ctx), geos = [], tk = PINE.trunk;
        geos.push(G.paint(G.facet(T(G, G.tube(tk.r * 0.8, tk.r, tk.h, { radial: 6 }), [0, tk.h / 2, 0])), c.trunk));
        PINE.tiers.forEach(function (t, i) {
          /* hexagonal tiers, each turned 30° from the one below, so the facets stagger */
          var g = G.facet(T(G, G.cone(t.r, t.h, 6), [0, t.y + t.h / 2, 0], [0, i * 30, 0]));
          var tok = i === 2 ? c.top : c.cone;
          geos.push(G.paintBy(g, function (v) { return v.ny < -0.5 ? [c.cone, 'shade'] : v.nx * 0.6 + v.nz * 0.5 > 0.45 ? [tok, 'hi'] : tok; }, { perFace: true }));
        });
        return tpl(ctx).part('body', geos, 'toon', { castShadow: true }).done();
      },
      idle: swayIdle('tree_pine', { deg: 1, period: 5 }), act: function () { return null; }, show: function () {}
    };

    /* a diamond frond: two 4-sided cones base to base along +y (widest at `waist` of the length) */
    function frondGeo(G, r, len, waist) {
      var up = T(G, G.cone(r, len * (1 - waist), 4), [0, len * waist + len * (1 - waist) / 2, 0]);
      var dn = T(G, G.cone(r, len * waist, 4), [0, len * waist / 2, 0], [180, 0, 0]);
      return G.facet(G.merge([up, dn]));
    }
    models.tree_palm = {
      build: function (ctx) {
        var G = ctx.G, c = colorsOf(ctx), geos = [], F = PALM.frond;
        palmTrunk().forEach(function (s, i) {
          var g = G.facet(T(G, G.tube(s.rTop, s.rBot, s.len, { radial: 6 }), s.c, [0, i * 30, s.tilt]));
          geos.push(G.paint(g, i % 2 ? c.trunkB : c.trunkA));
        });
        var fr = [c.frondA, c.frondB, c.frondC, c.frondD, c.frondA];
        PALM.fronds.forEach(function (f, i) {
          /* the inner kite from the crown, then the outer kite drooping from its tip */
          var inner = T(G, frondGeo(G, F.r, F.len * F.split, F.waist), PALM.top, [0, f[0], f[1]], [F.flat, 1, 1]);
          var outer = T(G, frondGeo(G, F.r * 0.78, F.len * (1 - F.split), 0.3), frondKnee(f), [0, f[0], f[1] - F.bend], [F.flat, 1, 1]);
          geos.push(G.paintBy(G.merge([inner, outer]), function (v) { return v.ny < -0.2 ? [fr[i], 'shade'] : fr[i]; }, { perFace: true }));
        });
        PALM.coconuts.forEach(function (o) {
          geos.push(gem(G, T(G, ico(ctx, PALM.coconutR), [PALM.top[0] + o[0], PALM.top[1] + o[1], PALM.top[2] + o[2]]), [c.coconut, 'hi'], c.coconut, [c.coconut, 'shade']));
        });
        return tpl(ctx).part('body', geos, 'toon', { castShadow: true }).done();
      },
      idle: swayIdle('tree_palm', { deg: 3, period: 3.6 }), act: function () { return null; }, show: function () {}
    };

    /* ================================================================
       FLOWERS, ROSE BUSH, MOSSY ROCK — patches on a faceted mound; heads bob
       ================================================================ */
    function bobIdle(id) {
      var idl = idleOf(id, { pct: 2, period: 2.4 });
      return function (a) {
        if (!M || !a) return;
        var s = M.bob(a.t, idl.pct * idleAmp(a.phase), idl.period, a.phase, a.reduced), w = 1 + (s - 1) * 0.5;
        setPiv(a, 'sway', 0, 0, 0, 0, 0, 0, w, s, w);
      };
    }
    var TULIP_PROF = [[0, 0], [1, 0.38], [0.82, 1], [0, 0.8]];
    models.flower_tulip = {
      build: function (ctx) {
        var G = ctx.G, c = colorsOf(ctx), geos = [mound(G, c.mound)], cups = [c.cupA, c.cupB, c.cupC];
        TULIPS.forEach(function (f, i) {
          geos.push(G.paint(T(G, G.tube(0.015, 0.015, f.h, { radial: rad(ctx, 5), open: true }), [f.x, 0.04 + f.h / 2, f.z]), c.stem));
          var cup = G.facet(T(G, G.drop(TULIP_CUP.r, TULIP_CUP.h, TULIP_PROF), [f.x, 0.02 + f.h, f.z]));
          geos.push(G.paintBy(cup, function (v) { return v.ny < -0.5 ? [cups[i], 'shade'] : v.ny > 0.6 ? [cups[i], 'hi'] : cups[i]; }, { perFace: true }));
        });
        geos.push(tone2(G, T(G, G.cone(0.035, 0.22, 4), [0.08, 0.14, 0.09], [0, 0, -24], [1, 1, 0.3]), c.leaf));
        return tpl(ctx).part('body', geos, 'toon', { castShadow: true }).done();
      },
      idle: bobIdle('flower_tulip'), act: function () { return null; }, show: function () {}
    };

    models.flower_daisy = {
      build: function (ctx) {
        var G = ctx.G, c = colorsOf(ctx), geos = [mound(G, c.mound)];
        DAISIES.forEach(function (d) {
          geos.push(G.paint(T(G, G.tube(0.012, 0.012, d.h, { radial: 4, open: true }), [d.x, 0.04 + d.h / 2, d.z]), c.stem));
          var head = [];
          for (var k = 0; k < DAISY.petals; k++) {
            var q = T(G, G.flag(DAISY.len, DAISY.wide, 1, 1), [DAISY.inner, 0, 0], [-90, 0, 0]);   /* lie flat… */
            head.push(G.paint(T(G, q, null, [0, k * 360 / DAISY.petals, 0]), c.petal));           /* …then fan out */
          }
          head.push(G.paint(T(G, G.cone(0.022, 0.016, 6), [0, 0.008, 0]), c.centre));
          geos.push(T(G, G.merge(head), [d.x, 0.04 + d.h, d.z], [DAISY.tilt, 0, 0]));
        });
        return tpl(ctx).part('body', geos, 'toon', { castShadow: true }).done();
      },
      idle: bobIdle('flower_daisy'), act: function () { return null; }, show: function () {}
    };

    /* sunflowers: two heads on their own pivots that track the sun / the spotlight */
    var sunBob = bobIdle('flower_sun'), aim = {};
    models.flower_sun = {
      build: function (ctx) {
        var G = ctx.G, c = colorsOf(ctx), body = [mound(G, c.mound)], b = tpl(ctx);
        SUNFLOWERS.forEach(function (f, i) {
          var h = f.y - 0.06;
          body.push(G.paint(T(G, G.tube(0.02, 0.02, h, { radial: rad(ctx, 5), open: true }), [f.x, 0.04 + h / 2, f.z - 0.02]), c.stem));
          body.push(tone2(G, T(G, G.cone(0.04, 0.16, 4), [f.x + (i ? -0.06 : 0.06), 0.24 + i * 0.04, f.z], [0, 0, i ? 50 : -50], [1, 1, 0.3]), c.leaf));
          var head = [G.paint(dot(G, SUNHEAD.disc, 0.035, rad(ctx, 10)), c.disc)];
          for (var k = 0; k < SUNHEAD.petals; k++) {
            var q = T(G, G.flag(SUNHEAD.len, SUNHEAD.wide, 1, 1), [SUNHEAD.disc - 0.016, 0, 0]);
            head.push(G.paint(T(G, q, null, [0, 0, k * 360 / SUNHEAD.petals]), c.petal));
          }
          b.pivot('head' + i, [f.x, f.y, f.z]);
          b.part('head' + i, [T(G, G.merge(head), [f.x, f.y, f.z])], 'toon', { pivot: 'head' + i });
        });
        return b.part('body', body, 'toon', { castShadow: true }).done();
      },
      idle: function (a) {
        if (!M || !a) return;
        sunBob(a);
        var k = showOf(a);
        for (var i = 0; i < SUNFLOWERS.length; i++) {
          sunAim(a.t, k, i, a.phase, a.reduced, M.coneSweep, aim);
          setPiv(a, i ? 'head1' : 'head0', aim.pitch, aim.yaw, 0, 0, 0, 0, 1);
        }
      },
      act: function () { return null; }, show: function () {}
    };

    models.bush_rose = {
      build: function (ctx) {
        var G = ctx.G, c = colorsOf(ctx), geos = [], roses = [c.roseA, c.roseB, c.roseC];
        geos.push(T(G, flatCone(G, 0.36, 0.04, rad(ctx, 10), c.mound), null, null, [1, 1, 0.8]));
        BUSH.forEach(function (p) { var t = c[p.tok]; geos.push(gem(G, T(G, ico(ctx, p.r), p.c), [t, 'hi'], t, [t, 'shade'])); });
        rosePositions().forEach(function (p, i) {
          var e = ROSES[i][1], l = Math.sqrt(e[0] * e[0] + e[1] * e[1] + e[2] * e[2]);
          var tilt = Math.acos(e[1] / l) * 180 / Math.PI, az = Math.atan2(e[0], e[2]) * 180 / Math.PI;
          var cup = G.paint(T(G, G.tube(0.042, 0.03, 0.045, { radial: 6 }), [0, 0.01, 0]), roses[i % 3]);
          var bud = G.paint(T(G, G.cone(0.034, 0.03, 6), [0, 0.045, 0], [0, 30, 0]), roses[i % 3], 'shade');
          var rose = T(G, G.merge([cup, bud]), null, [tilt, 0, 0]);
          geos.push(T(G, rose, p, [0, az, 0]));
        });
        return tpl(ctx).part('body', geos, 'toon', { castShadow: true }).done();
      },
      idle: bobIdle('bush_rose'), act: function () { return null; }, show: function () {}
    };

    /* a plain mossy boulder: no eyes, no blink; still under every motion setting */
    models.rock_mossy = {
      build: function (ctx) {
        var G = ctx.G, c = colorsOf(ctx), P = ROCK.pebble;
        var rock = G.facet(T(G, G.puff(ROCK.r), [0, ROCK.y, 0], [0, 20, 0], ROCK.s));
        var moss = T(G, ico(ctx, ROCK.moss.r), [0, ROCK.moss.y, 0], [0, 35, 0], ROCK.moss.s);
        var stone = T(G, ico(ctx, P.r), P.c, [0, 50, 0], P.s);
        return tpl(ctx).part('body', [
          gem(G, rock, [c.rock, 'hi'], c.rock, [c.rock, 'shade'], 0.7, -0.3),
          gem(G, moss, c.moss, [c.moss, 'shade'], [c.moss, 'shade'], 0.6, -0.4),
          gem(G, stone, [c.rock, 'hi'], c.rock, [c.rock, 'shade'], 0.6, -0.3)
        ], 'toon', { castShadow: true }).done();
      },
      idle: function () { return false; }, act: function () { return null; }, show: function () {}
    };
    /* ================================================================
       LIGHTS — lit = the 'lit' instance colour on a 'state' part; the glow
       pivot pulses ±12% on the beat while lit and music plays
       ================================================================ */
    function lampIdle(id) {
      var cfg = lampCfg(id), idl = idleOf(id, { pct: 12 });
      return function (a) {
        if (!a) return;
        var lv = litNow(a);
        if (!busy(a)) lampApply(a, lv, cfg);
        var s = M && lv >= 0.5 && !a.reduced && a.music !== false ? M.pulse(a.beat || 0, idl.pct, false) : 1;
        setPiv(a, 'glow', 0, 0, 0, 0, 0, 0, s);
      };
    }
    function lampModel(id, build) {
      var cfg = lampCfg(id);
      return {
        build: build,
        idle: lampIdle(id),
        act: function (a, name) {
          if (name !== 'glow' && name !== 'glowOn' && name !== 'glowOff') return null;
          return glowAct(a, name, cfg);
        },
        show: function (a) { if (a && !busy(a)) lampApply(a, litNow(a), cfg); },
        lit: function (a, on) { if (a) { running.delete(a.uid); lampApply(a, on ? 1 : 0, cfg); } }
      };
    }

    /* the slim bollard: a gunmetal post on a base plate, a frosted light box (lit Sunset Amber)
       between four corner fins, a thin cap */
    models.lantern = lampModel('lantern', function (ctx) {
      var G = ctx.G, c = colorsOf(ctx), b = tpl(ctx), Ln = LANTERN, post = [], hx = Ln.head[0] / 2;
      post.push(G.paintBy(box(G, Ln.base[0], Ln.base[1], Ln.base[2], [0, Ln.baseY, 0]), function (v) { return v.ny > 0.5 ? c.post : [c.post, 'shade']; }));
      post.push(G.paintBy(box(G, Ln.post[0], Ln.post[1], Ln.post[2], [0, Ln.postY, 0]), function (v) { return v.nx + v.nz > 0.5 ? [c.post, 'hi'] : c.post; }));
      post.push(G.paint(box(G, Ln.collar[0], Ln.collar[1], Ln.collar[2], [0, Ln.collarY, 0]), c.cage, 'shade'));
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (q) {
        post.push(G.paint(box(G, Ln.fin, Ln.head[1], Ln.fin, [q[0] * hx, Ln.headY, q[1] * hx]), c.cage));
      });
      post.push(G.paintBy(box(G, Ln.cap[0], Ln.cap[1], Ln.cap[2], [0, Ln.capY, 0]), function (v) { return v.ny > 0.5 ? [c.cap, 'hi'] : c.cap; }));
      post.push(G.paint(box(G, Ln.tip[0], Ln.tip[1], Ln.tip[2], [0, Ln.tipY, 0]), c.cap));
      b.part('post', post, 'toon', { castShadow: true });
      /* the frosted head: brighter at the top, the instance colour carries off → Sunset Amber */
      var glass = G.paintBy(box(G, Ln.head[0] - 0.01, Ln.head[1] - 0.004, Ln.head[2] - 0.01, [0, Ln.headY, 0]), function (v) {
        return v.y < Ln.headY - 0.1 ? [LIT_TOKENS.white, 'shade'] : LIT_TOKENS.white;
      });
      b.pivot('glow', [0, Ln.headY, 0]).anchor('glow', [0, Ln.headY, 0]);
      b.part('glass', [glass], 'state', { pivot: 'glow', stateColor: { key: 'lit', off: c.glassOff, on: c.glassOn, initial: 0 } });
      return b.done();
    });

    /* glowing mushrooms: faceted caps (violet by day, LED Cyan lit) over darker gills */
    var CAP_PROF = [[0, 0], [1, 0.1], [0.93, 0.48], [0.58, 0.88], [0, 1]];
    var SPOTS = [[0, -35], [0, 40], [1, -25], [1, 45], [2, 10]];     /* [mushroom, azimuth deg] */
    models.mushroom_glow = lampModel('mushroom_glow', function (ctx) {
      var G = ctx.G, c = colorsOf(ctx), b = tpl(ctx), body = [mound(G, c.mound, 0.34, 0.05, 0.74)], caps = [], spots = [];
      SHROOMS.forEach(function (m) {
        body.push(tone2(G, G.facet(T(G, G.tube(0.03, 0.042, m.stem, { radial: rad(ctx, 6), open: true }), [m.x, 0.03 + m.stem / 2, m.z])), c.stem));
        var cap = G.facet(T(G, G.drop(m.r, m.r * 0.95, CAP_PROF), [m.x, 0.01 + m.stem, m.z]));
        caps.push(G.paintBy(cap, function (v) { return v.ny < -0.2 ? [LIT_TOKENS.white, 'shade'] : LIT_TOKENS.white; }, { perFace: true }));
      });
      SPOTS.forEach(function (s) {
        var m = SHROOMS[s[0]], h = m.r * 0.95, base = 0.01 + m.stem, az = s[1] * Math.PI / 180;
        var rr = 0.755 * m.r + 0.004, y = base + 0.68 * h;
        var tilt = Math.atan2(0.75, 0.66) * 180 / Math.PI;     /* the cap's outward slope there */
        var sp = T(G, T(G, G.tube(0.018, 0.018, 0.03, { radial: 5 }), null, [tilt, 0, 0]), [m.x + Math.sin(az) * rr, y, m.z + Math.cos(az) * rr], [0, s[1], 0]);
        spots.push(G.paint(sp, c.spot));
      });
      b.part('body', body, 'toon', { castShadow: true });
      b.pivot('glow', [0.04, 0.4, 0.04]).anchor('glow', [0.04, 0.44, 0.04]);
      b.part('cap', caps, 'state', { pivot: 'glow', stateColor: { key: 'lit', off: c.capOff, on: c.capOn, initial: 0 } });
      b.part('spots', spots, 'toon', { pivot: 'glow' });
      return b.done();
    });

    /* ================================================================
       FLAGS — perCopy cloth / pennants waved on the CPU; Showtime LED dots
       (two antiphase 'state' groups on the 'leds' pivot, hidden by day)
       ================================================================ */
    function ledParts(b, G, pts, origin) {
      var A = [], B = [];
      pts.forEach(function (p, i) { (i % 2 ? B : A).push(shrink(G, G.paint(T(G, bicone(G, 0.018, 0.04), p), NEON4[i % 4]), origin)); });
      b.pivot('leds', origin);
      b.part('ledA', A, 'state', { pivot: 'leds', stateColor: { key: 'ledA', off: LIT_TOKENS.dim, on: LIT_TOKENS.white, initial: 0 } });
      b.part('ledB', B, 'state', { pivot: 'leds', stateColor: { key: 'ledB', off: LIT_TOKENS.dim, on: LIT_TOKENS.white, initial: 0 } });
    }
    var ledShown = perCopy(new Map()), LV = [0, 0];
    function ledsApply(a) {
      var k = showOf(a), on = k > 0.01;
      if (ledShown.get(a.uid) !== on) { ledShown.set(a.uid, on); setPiv(a, 'leds', 0, 0, 0, 0, 0, 0, on ? FX_SCALE : 0); }
      if (!on || !M) return;
      ledLevels(a.t, a.phase, k, a.reduced, M.twinkle, LV);
      setState(a, 'ledA', LV[0]); setState(a, 'ledB', LV[1]);
    }

    var flagOver = perCopy(new Map());     /* uid → act-driven flutter amplitude */
    var flagIdl = idleOf('flag_pole', { amp: 0.04, hz: 2 });
    function clothApply(a, amp, hz) {
      var g = copyGeo(a, 'cloth'), base = g && baseAttr(a, 'cloth', 'position');
      if (!g || !base) return;
      var pa = g.getAttribute('position'), na = g.getAttribute('normal');
      flagWave(base, pa.array, a.t, amp, hz, a.phase, a.reduced, FLAG.x0, FLAG.w, M.flutter);
      if (na) { faceNormals(pa.array, na.array); na.needsUpdate = true; }
      pa.needsUpdate = true;
    }
    models.flag_pole = {
      build: function (ctx) {
        var G = ctx.G, c = colorsOf(ctx), b = tpl(ctx), px = FLAG.poleX;
        b.part('pole', [
          G.paintBy(box(G, 0.17, 0.05, 0.17, [px, 0.025, 0]), function (v) { return v.ny > 0.5 ? c.pole : [c.pole, 'shade']; }),
          G.paint(T(G, G.tube(FLAG.poleR * 0.8, FLAG.poleR, FLAG.poleTop - 0.05, { radial: rad(ctx, 8) }), [px, 0.05 + (FLAG.poleTop - 0.05) / 2, 0]), c.pole)
        ], 'toon', { castShadow: true });
        b.part('finial', [G.paint(T(G, G.cone(0.04, 0.09, rad(ctx, 8)), [px, FLAG.poleTop + 0.04, 0]), c.finial)], 'gold', { castShadow: true });
        var cloth = G.paint(T(G, G.flag(FLAG.w, FLAG.h, 8, 1), [FLAG.x0, FLAG.cy, 0]), c.cloth);
        var dia = [0.004, -0.004].map(function (z) {
          return G.paint(T(G, T(G, G.flag(0.12, 0.12, 1, 1), [-0.06, 0, 0]), [FLAG.x0 + FLAG.w / 2, FLAG.cy, z], [0, 0, 45]), c.diamond);
        });
        b.pivot('flag', [FLAG.x0, FLAG.cy, 0]).anchor('flag', [FLAG.x0 + FLAG.w / 2, FLAG.cy, 0]);
        b.part('cloth', [cloth].concat(dia), 'toon', { pivot: 'flag', perCopy: true });
        var pts = [];
        [0.012, -0.012].forEach(function (z) { [1.4, 1.52, 1.64, 1.76].forEach(function (y) { pts.push([FLAG.x0 + 0.016, y, z]); }); });
        ledParts(b, G, pts, [FLAG.x0, FLAG.cy, 0]);
        return b.done();
      },
      idle: function (a) {
        if (!M || !a) return;
        var amp = flagOver.has(a.uid) ? flagOver.get(a.uid) : flagIdl.amp;
        clothApply(a, amp, flagIdl.hz);
        ledsApply(a);
      },
      act: function (a, name) {
        if (name !== 'wave' && name !== 'flag') return null;
        return runAct(a, 'flag', function (a2, pose) {
          flagOver.set(a2.uid, pose.amp);
          clothApply(a2, pose.amp, pose.hz || flagIdl.hz);
        }, {
          end: function (a2) { flagOver.delete(a2.uid); },
          cancel: function (a2) { flagOver.delete(a2.uid); }
        });
      },
      show: function (a) { if (a) ledsApply(a); }
    };

    var LAYOUT = pennantLayout(), ANG = new Array(BUNT.n), buntOver = perCopy(new Map());
    var buntIdl = idleOf('bunting', { deg: 6, hz: 0.8 });
    function pennantsApply(a, front, rAmp) {
      var g = copyGeo(a, 'pennants'), base = g && baseAttr(a, 'pennants', 'position');
      if (!g || !base) return;
      pennantAngles(a.t, BUNT.n, buntIdl.deg, buntIdl.hz, a.phase, a.reduced, front, rAmp, M.pennant, M.ripple, ANG);
      var pa = g.getAttribute('position'), na = g.getAttribute('normal');
      pennantWave(base, pa.array, na ? baseAttr(a, 'pennants', 'normal') : null, na ? na.array : null, LAYOUT, ANG);
      pa.needsUpdate = true;
      if (na) na.needsUpdate = true;
    }
    models.bunting = {
      build: function (ctx) {
        var G = ctx.G, c = colorsOf(ctx), b = tpl(ctx), frame = [], X = BUNT.postX;
        [-X, X].forEach(function (x) {
          frame.push(tone2(G, box(G, 0.05, BUNT.postH, 0.05, [x, BUNT.postH / 2, 0]), c.post));
          frame.push(G.paint(box(G, 0.07, 0.03, 0.07, [x, BUNT.postH + 0.015, 0]), c.post, 'hi'));
        });
        var line = [];
        for (var i = 0; i <= 4; i++) { var x = -X + i * X / 2; line.push([x, buntLineY(x), buntLineZ(x)]); }
        frame.push(G.paint(G.ribbon(line, 0.01, { segments: ctx.tier === 'LOW' ? 8 : 10 }), c.line));
        b.part('frame', frame, 'toon', { castShadow: true });
        var pc = [c.p1, c.p2, c.p3, c.p4, c.p5], pens = [];
        LAYOUT.forEach(function (L, k) {
          var g = T(G, G.cone(BUNT.pr, BUNT.ph, 3), [L.x, L.cy - BUNT.ph / 2, L.cz], [0, 0, 180], [1, 1, 0.2]);
          pens.push(tone2(G, g, pc[k], -0.5));
        });
        b.pivot('flag', [0, buntLineY(0), 0]).anchor('flag', [0, buntLineY(0), 0]);
        b.part('pennants', pens, 'toon', { pivot: 'flag', perCopy: true });
        var pts = [];
        for (var j = 0; j < 6; j++) { var lx = -0.3 + j * 0.12; pts.push([lx, buntLineY(lx) + 0.02, buntLineZ(lx)]); }
        ledParts(b, G, pts, [0, buntLineY(0), 0]);
        return b.done();
      },
      idle: function (a) {
        if (!M || !a) return;
        var o = buntOver.get(a.uid);
        pennantsApply(a, o ? o.front : 1.3, o ? o.amp : 0);
        ledsApply(a);
      },
      act: function (a, name) {
        if (name !== 'wave' && name !== 'bunting') return null;
        return runAct(a, 'bunting', function (a2, pose) {
          var o = buntOver.get(a2.uid) || {};
          o.front = pose.front; o.amp = pose.amp;
          buntOver.set(a2.uid, o);
          pennantsApply(a2, pose.front, pose.amp);
        }, {
          end: function (a2) { buntOver.delete(a2.uid); },
          cancel: function (a2) { buntOver.delete(a2.uid); }
        });
      },
      show: function (a) { if (a) ledsApply(a); }
    };
    /* ================================================================
       GARDEN AND BEACH DECOR — static, squish-only (the controller's tap)
       ================================================================ */
    function none() { return null; }
    function noop() {}
    /* a teak slat bench on two gunmetal side frames */
    models.bench = {
      build: function (ctx) {
        var G = ctx.G, c = colorsOf(ctx), Bn = BENCH, wood = [], frame = [], sy = Bn.seatY;
        Bn.seatZ.forEach(function (z, i) {
          wood.push(G.paintBy(box(G, Bn.len, Bn.slat[0], Bn.slat[1], [0, sy, z]), function (v) { return v.ny > 0.5 ? (i % 2 ? c.plank : [c.plank, 'hi']) : [c.plank, 'shade']; }));
        });
        Bn.back.forEach(function (q, i) {
          wood.push(G.paintBy(box(G, Bn.len, Bn.slat[1], Bn.slat[0], [0, q[0], q[1]], [-12, 0, 0]), function (v) { return v.nz > 0.5 ? (i ? c.plank : [c.plank, 'hi']) : [c.plank, 'shade']; }));
        });
        [-Bn.frameX, Bn.frameX].forEach(function (x) {
          frame.push(G.paint(box(G, Bn.leg, sy - Bn.slat[0] / 2, Bn.leg, [x, (sy - Bn.slat[0] / 2) / 2, 0.11]), c.leg));
          frame.push(G.paint(box(G, Bn.leg, 0.54, Bn.leg, [x, 0.27, -0.14], [-8, 0, 0]), c.leg));
          frame.push(G.paint(box(G, Bn.leg, 0.03, 0.3, [x, sy - 0.03, -0.01]), c.leg, 'shade'));
        });
        return tpl(ctx).part('body', wood.concat(frame), 'toon', { castShadow: true }).anchor('seat', [0, sy + 0.02, 0.03]).done();
      },
      idle: noop, act: none, show: noop
    };

    /* a crisp sandcastle: hexagonal towers with square crenels, a door, a flag and shells */
    models.sandcastle = {
      build: function (ctx) {
        var G = ctx.G, c = colorsOf(ctx), g = [], r10 = rad(ctx, 10);
        g.push(T(G, flatCone(G, 0.42, 0.04, r10, [c.sand, 'shade']), null, null, [1, 1, 0.85]));
        function tower(x, z, r, h, tooth, turn) {
          var t = G.facet(T(G, G.tube(r, r + 0.02, h, { radial: 6 }), [x, h / 2, z], [0, turn, 0]));
          g.push(G.paintBy(t, function (v) { return v.ny > 0.5 ? [c.sand, 'hi'] : c.sand; }, { perFace: true }));
          for (var k = 0; k < 6; k += 2) {
            var an = (turn + 30 + k * 60) * Math.PI / 180, rr = (r - tooth * 0.4) * 0.92;
            g.push(G.paint(box(G, tooth, tooth, tooth, [x + Math.sin(an) * rr, h + tooth / 2, z + Math.cos(an) * rr], [0, turn + 30 + k * 60, 0]), c.sand, 'hi'));
          }
        }
        tower(0, -0.03, 0.18, 0.45, 0.07, 0);
        tower(-0.25, 0.05, 0.105, 0.55, 0.05, 30);
        tower(0.25, 0.05, 0.105, 0.55, 0.05, 30);
        g.push(G.paint(box(G, 0.1, 0.11, 0.04, [0, 0.055, 0.16]), c.door));
        g.push(G.paint(T(G, dot(G, 0.05, 0.04, rad(ctx, 8)), [0, 0.11, 0.16]), c.door));
        g.push(G.paint(T(G, G.tube(0.008, 0.008, 0.26, { radial: 4 }), [0, 0.58, -0.03]), c.stick));
        g.push(G.paint(T(G, G.cone(0.045, 0.11, 3), [0.055, 0.66, -0.03], [0, 0, -90], [1, 1, 0.2]), c.flag));
        [[-0.25, 0.3, 0.17, 0], [0.25, 0.22, 0.17, 0], [0.09, 0.3, 0.135, 29]].forEach(function (p) {
          g.push(G.paint(T(G, flatCone(G, 0.026, 0.014, 5, c.shell), [p[0], 0.03, p[1]], [0, p[3], 0]), c.shell));
        });
        return tpl(ctx).part('body', g, 'toon', { castShadow: true }).done();
      },
      idle: noop, act: none, show: noop
    };

    models.umbrella = {
      build: function (ctx) {
        var G = ctx.G, c = colorsOf(ctx), u = [], seg = Math.PI / 4;
        /* the canopy rim stays above the 1.0 u overhang line, even on its tilted low side */
        u.push(G.paint(T(G, G.tube(0.018, 0.018, 1.18, { radial: rad(ctx, 6) }), [0, 0.59, 0]), c.pole));
        var can = G.paintBy(G.facet(G.cone(0.55, 0.2, 8)), function (v) {
          var i = Math.floor((Math.atan2(v.x, v.z) + Math.PI) / seg) % 2, tok = i ? c.canopyB : c.canopyA;
          return v.ny < -0.5 ? [tok, 'shade'] : tok;
        }, { perFace: true });
        u.push(T(G, can, [0, 1.17, 0]));
        u.push(G.paint(T(G, G.cone(0.022, 0.05, rad(ctx, 6)), [0, 1.295, 0]), c.canopyA));
        var um = T(G, G.merge(u), [-0.06, 0, 0], [0, 0, -6]);
        var towel = G.merge([
          G.paint(box(G, 0.26, 0.016, 0.46, [0, 0.008, 0]), c.towel),
          G.paint(box(G, 0.264, 0.018, 0.06, [0, 0.009, 0.08]), c.canopyB)
        ]);
        return tpl(ctx).part('body', [um, T(G, towel, [0.2, 0, 0.16], [0, 12, 0])], 'toon', { castShadow: true }).done();
      },
      idle: noop, act: none, show: noop
    };

    /* snowman: faceted snowballs, coal dots and his carrot; 6 sparkles on two counter-rotating
       pivots drift around him ('never melts') */
    var SNOW_SPARK = { r: 0.42, ys: [0.25, 0.75, 0.45, 0.85, 0.35, 0.6] };
    models.snowman = {
      build: function (ctx) {
        var G = ctx.G, c = colorsOf(ctx), b = tpl(ctx), g = [], r10 = rad(ctx, 10);
        g.push(gem(G, G.facet(T(G, G.puff(0.22), [0, 0.2, 0])), [c.snow, 'hi'], c.snow, [c.snow, 'shade'], 0.6, -0.5));
        g.push(gem(G, G.facet(T(G, G.puff(0.16), [0, 0.54, 0], [0, 30, 0])), [c.snow, 'hi'], c.snow, [c.snow, 'shade'], 0.6, -0.5));
        g.push(G.paint(T(G, G.tube(0.15, 0.15, 0.022, { radial: r10 }), [0, 0.69, 0]), c.hat));
        g.push(G.paint(T(G, G.tube(0.1, 0.105, 0.26, { radial: r10 }), [0, 0.82, 0]), c.hat));
        g.push(G.paint(T(G, G.tube(0.107, 0.107, 0.035, { radial: r10, open: true }), [0, 0.73, 0]), c.scarf));
        g.push(G.paint(T(G, G.cone(0.026, 0.12, 5), [0, 0.53, 0.2], [90, 0, 0]), c.carrot));
        [-1, 1].forEach(function (s) { g.push(G.paint(stud(G, [0, 0.54, 0], 0.15, [s * 0.055, 0.045, 0.14], 0.014, 0.03, 5), c.coal)); });
        [[0, 0.5, 0.86], [0, 0.05, 1]].forEach(function (d) { g.push(G.paint(stud(G, [0, 0.2, 0], 0.205, d, 0.017, 0.03, 5), c.coal)); });
        g.push(G.paint(T(G, G.tube(0.16, 0.175, 0.055, { radial: rad(ctx, 12), open: true }), [0, 0.405, 0]), c.scarf));
        g.push(tone2(G, box(G, 0.06, 0.17, 0.025, [0.09, 0.33, 0.17], [0, 0, 12]), c.scarf));
        b.part('body', g, 'toon', { castShadow: true });
        var A = [], B = [];
        SNOW_SPARK.ys.forEach(function (y, i) {
          var an = i * Math.PI / 3, sp = T(G, bicone(G, 0.032, 0.08), [Math.sin(an) * SNOW_SPARK.r, y, Math.cos(an) * SNOW_SPARK.r], [0, i * 60, 0], [1, 1, 0.35]);
          (i % 2 ? B : A).push(G.paint(sp, c.sparkle));
        });
        b.pivot('sparkA', [0, 0, 0]).pivot('sparkB', [0, 0, 0]);
        b.part('sparkA', A, 'state', { pivot: 'sparkA', stateColor: { key: 'sparkA', off: LIT_TOKENS.spark, on: LIT_TOKENS.white, initial: 0.6 } });
        b.part('sparkB', B, 'state', { pivot: 'sparkB', stateColor: { key: 'sparkB', off: LIT_TOKENS.spark, on: LIT_TOKENS.white, initial: 0.6 } });
        return b.done();
      },
      idle: function (a) {
        if (!M || !a) return;
        var ph = a.phase || 0, red = !!a.reduced, t = a.t;
        var angA = red ? ph * 360 : (t / 9 + ph) * 360, angB = red ? ph * 360 : -(t / 12 + ph) * 360;
        var yA = red ? 0 : 0.04 * Math.sin(2 * Math.PI * (t / 6 + ph)), yB = red ? 0 : 0.04 * Math.sin(2 * Math.PI * (t / 6 + ph + 0.5));
        setPiv(a, 'sparkA', 0, angA % 360, 0, 0, yA, 0, 1);
        setPiv(a, 'sparkB', 0, angB % 360, 0, 0, yB, 0, 1);
        setState(a, 'sparkA', M.twinkle(t, 0.5, ph, red));
        setState(a, 'sparkB', M.twinkle(t, 0.5, ph + 0.5, red));
      },
      act: none, show: noop
    };

    /* ================================================================
       LANDMARKS
       ================================================================ */
    /* windmill: a faceted tower, slim slat sails on 'spin'; Showtime neon tips with 6-segment
       light streaks */
    var TOWER_PROF = [[0, 0], [1, 0], [0.97, 0.25], [0.86, 0.7], [0.78, 1], [0, 1]];
    var DOME_PROF = [[0, 0], [1, 0], [0.96, 0.3], [0.72, 0.72], [0.32, 0.96], [0, 1]];
    var millExtra = perCopy(new Map()), millBase = perCopy(new Map()), tipsShown = perCopy(new Map());
    var millIdl = idleOf('windmill', { rps: 0.25 });
    function millAngle(a) { return M.spin(a.t, millIdl.rps, a.phase, a.reduced) + (millExtra.get(a.uid) || 0); }
    function tipsApply(a) {
      var k = showOf(a), on = k > 0.01;
      if (tipsShown.get(a.uid) !== on) { tipsShown.set(a.uid, on); setPiv(a, 'tips', 0, 0, 0, 0, 0, 0, on ? FX_SCALE : 0); }
      if (on) setState(a, 'tips', k);
    }
    models.windmill = {
      build: function (ctx) {
        var G = ctx.G, c = colorsOf(ctx), b = tpl(ctx), H = MILL.hub, body = [], sails = [], tips = [];
        body.push(G.paintBy(G.facet(G.drop(MILL.towerR, MILL.towerH, TOWER_PROF)), function (v) { return v.ny < -0.3 ? [c.tower, 'shade'] : c.tower; }, { perFace: true }));
        body.push(G.paint(box(G, 0.15, 0.22, 0.05, [0, 0.11, 0.285]), c.door));
        body.push(G.paint(T(G, dot(G, 0.075, 0.05, rad(ctx, 8)), [0, 0.22, 0.285]), c.door));
        body.push(G.paintBy(G.facet(T(G, G.drop(0.27, 0.34, DOME_PROF), [0, 1.46, 0])), function (v) { return v.ny < -0.3 ? [c.cap, 'shade'] : v.ny > 0.7 ? [c.cap, 'hi'] : c.cap; }, { perFace: true }));
        body.push(G.paint(T(G, G.tube(0.03, 0.03, 0.12, { radial: 6 }), [H[0], H[1], H[2] - 0.05], [90, 0, 0]), c.hub, 'shade'));
        b.part('body', body, 'toon', { castShadow: true });
        var len = MILL.arm - MILL.inner, w = MILL.width, z0 = H[2] + 0.04;
        for (var k = 0; k < 4; k++) {
          /* the spar, then `slats` thin blades stepping out along one side of it */
          var arm = [box(G, 0.03, MILL.arm, 0.024, [0, MILL.arm / 2, 0])];
          for (var j = 0; j < MILL.slats; j++) {
            var sy = MILL.inner + (j + 0.5) * len / MILL.slats;
            arm.push(box(G, w, len / MILL.slats * 0.62, 0.01, [0.02 + w / 2, sy, -0.004], [0, 8, 0]));
          }
          sails.push(G.paintBy(T(G, G.merge(arm), [H[0], H[1], z0], [0, 0, -(k * 90 + 45)]), function (v) { return v.nz < -0.5 ? [c.sail, 'shade'] : c.sail; }));
          /* the tip light and its trailing streak (behind the clockwise motion) */
          var tok = NEON4[k], tip = [0.02 + w / 2, MILL.arm], pts = [tip], tr = [G.paint(T(G, dot(G, 0.032, 0.03, 6), [tip[0], tip[1], 0.03]), tok)];
          for (var s = 1; s <= MILL.trail; s++) {
            var d = s * MILL.trailDeg / MILL.trail * Math.PI / 180;
            pts.push([tip[0] * Math.cos(d) - tip[1] * Math.sin(d), tip[0] * Math.sin(d) + tip[1] * Math.cos(d)]);
            var p0 = pts[s - 1], p1 = pts[s], dx = p1[0] - p0[0], dy = p1[1] - p0[1], l = Math.sqrt(dx * dx + dy * dy);
            var r0 = 0.02 * (1 - (s - 1) / MILL.trail) + 0.004, r1 = 0.02 * (1 - s / MILL.trail) + 0.004;
            var seg = T(G, G.tube(r0, r1, l * 1.05, { radial: 4 }), [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, 0.03], [0, 0, -Math.atan2(-dx, -dy) * 180 / Math.PI]);
            tr.push(G.paint(seg, tok, -0.07 * s));         /* the streak darkens toward its tail */
          }
          tips.push(shrink(G, T(G, G.merge(tr), [H[0], H[1], z0], [0, 0, -(k * 90 + 45)]), H));
        }
        sails.push(G.paint(T(G, dot(G, 0.075, 0.07, rad(ctx, 8)), [H[0], H[1], z0 + 0.02]), c.hub));
        b.pivot('spin', H).pivot('tips', H, 'spin');
        b.part('sails', sails, 'toon', { pivot: 'spin' });
        b.part('tips', tips, 'state', { pivot: 'tips', stateColor: { key: 'tips', off: LIT_TOKENS.dim, on: LIT_TOKENS.white, initial: 0 } });
        return b.done();
      },
      idle: function (a) {
        if (!M || !a) return;
        setPiv(a, 'spin', 0, 0, -(millAngle(a) % 360), 0, 0, 0, 1);
        tipsApply(a);
      },
      act: function (a, name) {
        if (name !== 'spin') return null;
        var prev = millExtra.get(a.uid) || 0;
        millBase.set(a.uid, prev - (((prev % 90) + 90) % 90));
        return runAct(a, 'spin', function (a2, pose) {
          millExtra.set(a2.uid, ((millBase.get(a2.uid) || 0) + pose.extraDeg) % 360);
          setPiv(a2, 'spin', 0, 0, -(millAngle(a2) % 360), 0, 0, 0, 1);
          tipsApply(a2);
        });
      },
      show: function (a) { if (a) tipsApply(a); }
    };

    /* lighthouse: a faceted red-and-white tower, the lamp room lit by state colour, an LED
       gallery ring that lights LED Cyan with the lamp, two additive beams on the 'beam' pivot
       (authored 1/LH.beamScale size, scaled up while lit) */
    /* profile rings sit on the band edges, so every facet is wholly red or white */
    var LH_PROF = [[0, 0], [1, 0], [1, 0.035], [0.95, 0.045], [0.935, LH.bands[0][0]], [0.915, LH.bands[0][1]],
      [0.885, LH.bands[1][0]], [0.86, LH.bands[1][1]], [0.74, 1], [0, 1]];
    var lhCfg = lampCfg('lighthouse'), lhShow = (LOOKS.lighthouse && LOOKS.lighthouse.show && LOOKS.lighthouse.show.beam) || {};
    var beamRps = lhShow.rps || 0.3, beamEvery = lhShow.every || 4, beamTok = lhShow.token || 'Lamp Halo';
    var beamTokens = lhShow.tokens || NEON3, beamMatObj = null, beamCols = null, beamTmp = null, bc = {}, beamUp = perCopy(new Map());
    function beamMat() {
      if (!beamMatObj && K0 && typeof K0.variant === 'function') {
        beamMatObj = K0.variant('glow:' + beamTok, 'gardenBeam', { opacity: 0.32, visible: true, vertexColors: true });
        beamCols = { day: K0.col(beamTok), show: beamTokens.map(function (t) { return K0.col(t); }) };
        beamTmp = K0.col(beamTok);
      }
      return beamMatObj;
    }
    function beamApply(a, lv) {
      var up = lv > 0.01;
      if (!up && !beamUp.get(a.uid)) return;
      beamUp.set(a.uid, up);
      setPiv(a, 'beam', 0, up ? M.beamAngle(a.t, beamRps, a.phase, a.reduced) : 0, 0, 0, 0, 0, up ? LH.beamScale * lv : 0);
      if (beamMatObj && up) {                       /* warm by day; a neon cycle at Showtime */
        var k = showOf(a);
        if (k > 0.001) {
          if (a.reduced) beamTmp.copy(beamCols.show[0]);
          else { M.beamColor(a.t, beamEvery, beamCols.show.length, bc); beamTmp.copy(beamCols.show[bc.i]).lerp(beamCols.show[bc.j], bc.k); }
          beamMatObj.color.copy(beamCols.day).lerp(beamTmp, k);
        } else beamMatObj.color.copy(beamCols.day);
      }
    }
    models.lighthouse = {
      build: function (ctx) {
        var G = ctx.G, c = colorsOf(ctx), b = tpl(ctx), body = [], L = LH.lamp, n12 = rad(ctx, 12);
        body.push(G.paintBy(G.facet(G.drop(LH.r, LH.h, LH_PROF)), function (v) {
          var f = v.y / LH.h, band = (f > LH.bands[0][0] && f < LH.bands[0][1]) || (f > LH.bands[1][0] && f < LH.bands[1][1]);
          var tok = f < 0.05 ? c.gallery : band ? c.band : c.tower;
          return v.ny < -0.5 ? [tok, 'shade'] : tok;
        }, { perFace: true }));
        body.push(G.paint(T(G, G.tube(0.3, 0.27, 0.05, { radial: n12 }), [0, 2.02, 0]), c.gallery));
        body.push(G.paint(T(G, G.ring(0.29, 0.012), [0, 2.13, 0], [90, 0, 0]), c.gallery));
        [0, 90, 180, 270].forEach(function (yaw) {
          body.push(G.paint(T(G, box(G, 0.012, 0.09, 0.012, [0, 2.09, 0.29]), null, [0, yaw + 45, 0]), c.gallery));
        });
        body.push(G.paintBy(G.facet(T(G, G.cone(0.24, 0.3, 8), [0, 2.46, 0])), function (v) { return v.nx * -0.6 + v.nz * 0.6 > 0.3 ? [c.roof, 'hi'] : c.roof; }, { perFace: true }));
        body.push(G.paint(T(G, G.cone(0.018, 0.12, 6), [0, 2.66, 0]), c.gallery));
        body.push(G.paint(box(G, 0.16, 0.22, 0.05, [0, 0.13, 0.3]), c.band, 'shade'));
        body.push(G.paint(box(G, 0.06, 0.12, 0.04, [0, 0.95, 0.284]), c.gallery));
        body.push(G.paint(box(G, 0.06, 0.12, 0.04, [0, 1.55, 0.257]), c.gallery));
        b.part('body', body, 'toon', { castShadow: true });
        var glass = G.paint(T(G, G.tube(0.17, 0.17, 0.26, { radial: rad(ctx, 8) }), L), LIT_TOKENS.white);
        b.pivot('glow', L).anchor('glow', L);
        b.part('glass', [glass], 'state', { pivot: 'glow', stateColor: { key: 'lit', off: c.glassOff, on: c.glassOn, initial: 0 } });
        /* the LED gallery ring: gunmetal while dark, LED Cyan with the lamp */
        b.part('ledRing', [G.paint(T(G, G.ring(LH.ledR, 0.014), [0, 2.055, 0], [90, 0, 0]), LIT_TOKENS.white)], 'state',
          { stateColor: { key: 'lit', off: c.gallery, on: LIT_TOKENS.led, initial: 0 } });
        var s = LH.beamScale, beams = [0, 180].map(function (yaw) {
          var g = T(G, G.tube(0, LH.beamR / s, LH.beamLen / s, { radial: 12, open: true }), [LH.beamLen / s / 2, 0, 0], [0, 0, 90]);
          G.paintBy(g, function (v) { return Math.abs(v.x) < LH.beamLen / s * 0.5 ? LIT_TOKENS.white : LIT_TOKENS.dim; });
          return T(G, g, L, [0, yaw, 0]);
        });
        b.pivot('beam', L);
        b.part('beam', beams, 'glow:' + beamTok, { pivot: 'beam', receiveShadow: false });
        return b.done();
      },
      idle: function (a) {
        if (!M || !a) return;
        var lv = litNow(a);
        if (!busy(a)) lampApply(a, lv, lhCfg);
        beamApply(a, busy(a) ? (litLv.get(a.uid) || 0) : lv);
      },
      act: function (a, name) {
        if (name !== 'glow' && name !== 'glowOn' && name !== 'glowOff') return null;
        return glowAct(a, name, lhCfg, function (a2, lv) { if (M) beamApply(a2, lv); });
      },
      show: function (a) { if (a && !busy(a)) lampApply(a, litNow(a), lhCfg); },
      lit: function (a, on) { if (a) { running.delete(a.uid); lampApply(a, on ? 1 : 0, lhCfg); if (M) beamApply(a, on ? 1 : 0); } },
      material: function (matKey, part) { return part && part.name === 'beam' ? beamMat() : null; }
    };

    /* ================================================================
       PATHS — flat ground pieces (receive shadows, never cast) with the Showtime
       runway: 'glow:<token>' under-plates whose instance colour the chase drives
       ================================================================ */
    var runTok = (LOOKS.path_stone && LOOKS.path_stone.show && LOOKS.path_stone.show.glow && LOOKS.path_stone.show.glow.token) || 'Neon Cyan';
    var runOn = perCopy(new Map());
    function runwayPlates(G, piece) {
      return pathPlates(piece).map(function (r) { return plate(G, r[0], r[1], r[2], r[3], PATH.plateY, LIT_TOKENS.white, LIT_TOKENS.dim); });
    }
    function runwayIdle(a) {
      if (!M || !a) return;
      var k = showOf(a);
      if (k <= 0.001) { if (runOn.get(a.uid)) { runOn.delete(a.uid); setState(a, 'runway', 1); } return; }
      runOn.set(a.uid, true);
      var d = typeof a.pathD === 'number' ? a.pathD : (a.phase || 0) * 4;
      setState(a, 'runway', runwayLevel(a.t, d, k, a.reduced, M.chaseWave));
    }
    function pathModel(tile) {
      return {
        build: function (ctx) {
          var G = ctx.G, b = tpl(ctx), pk = parsePathKey(ctx.stateKey), plates = runwayPlates(G, pk.piece);
          b.part('tile', tile(ctx, G, colorsOf(ctx), pk), 'toon', { castShadow: false, receiveShadow: true });
          b.part('glow', plates, 'glow:' + runTok, { castShadow: false, receiveShadow: false, stateColor: { key: 'runway', off: LIT_TOKENS.night, on: LIT_TOKENS.runway, initial: 1 } });
          return b.done();
        },
        idle: runwayIdle, act: none, show: runwayIdle
      };
    }
    /* a flat faceted stone: an open n-sided cone (no hidden base), apex up */
    function flagstone(G, s, sides, h, sz) {
      return G.facet(T(G, G.tube(0, s.r, h, { radial: sides, open: true }), [s.x, h / 2, s.z], [0, s.rot, 0], [1, 1, sz]));
    }
    /* stone path: pentagonal flagstones laid on the piece's lattice */
    models.path_stone = pathModel(function (ctx, G, c, pk) {
      return pathStones(pk.piece, pk.layout).map(function (s, i) {
        var lit = i % 3 === 1 ? c.hi : c.stone;
        return G.paintBy(flagstone(G, s, COBBLE.sides, PATH.h, 0.94), function (v) { return v.nz - v.nx * 0.5 > 0.06 ? lit : c.stone; }, { perFace: true });
      });
    });
    /* boardwalk: teak boards across the walk (Teak Light / Teak by layout), a low fillet board in
       every inner corner */
    models.path_wood = pathModel(function (ctx, G, c, pk) {
      var g = [], l = pk.layout;
      pathPlanks(pk.piece, l).forEach(function (p, i) {
        var tok = (i + l) % 2 ? c.plankB : c.plankA, shade = pk.piece !== 'tile' && i === (l * 2) % 3;
        var slab = box(G, p.x1 - p.x0, PATH.h, p.w, [(p.x0 + p.x1) / 2, PATH.h / 2, p.z]);
        g.push(G.paintBy(slab, function (v) { return v.ny > 0.5 ? (shade ? [tok, 'shade'] : tok) : [tok, 'shade']; }));
      });
      pathFillets(pk.piece).forEach(function (q) {
        g.push(G.paint(T(G, G.cone(PATH.ri * 1.2, 0.002, 4), [q[0], PATH.h - 0.008, q[1]]), c.plankB, 'shade'));
      });
      return g;
    });
    /* flower stepping stones: stones every 0.25 u along the walk, flower clumps off it */
    var FLOWER_TRIS = 10;
    models.path_flower = pathModel(function (ctx, G, c, pk) {
      var sides = rad(ctx, 8), stones = stepStones(pk.piece, pk.layout);
      var g = stones.map(function (s) {
        return G.paintBy(flagstone(G, s, sides, PATH.h, 0.86), function (v) { return v.nz - v.nx * 0.5 > 0.06 ? [c.stone, 'hi'] : c.stone; }, { perFace: true });
      });
      /* as many flower heads as the path budget leaves (after the stones and the runway plates) */
      var left = PATH.budget - stones.length * sides - pathPlates(pk.piece).length * 8, fl = [[c.f1, c.f2], [c.f2, c.f3], [c.f3, c.f2]];
      pathFlowers(pk.piece, pk.layout, Math.min(4, Math.floor(left / FLOWER_TRIS))).forEach(function (f) {
        g.push(T(G, flatCone(G, 0.06, 0.02, 5, fl[f.k][0], fl[f.k][1]), [f.x, 0.002, f.z], [0, f.k * 24, 0]));
      });
      return g;
    });

    /* every handler first checks that its per-copy memory describes the handle's copy; forget(uid)
       is the controller's hook for a removed copy (island3d calls it on remove / restyle / teardown) */
    function owned(fn) { return function (a, x, y) { own(a); return fn.call(this, a, x, y); }; }
    Object.keys(models).forEach(function (id) {
      var m = models[id];
      ['idle', 'show', 'act', 'lit'].forEach(function (k) { if (typeof m[k] === 'function') m[k] = owned(m[k]); });
      m.forget = forget;
    });
    return models;
  }

  return {
    IDS: IDS, EXTRA_TOKENS: EXTRA_TOKENS, FX_SCALE: FX_SCALE, factory: factory,
    /* pure layout + animation helpers (Node-tested) */
    CANOPY: CANOPY, PINE: PINE, PALM: PALM, FLAG: FLAG, BUNT: BUNT, MILL: MILL, LH: LH, ROCK: ROCK, LANTERN: LANTERN, BENCH: BENCH,
    TULIPS: TULIPS, DAISIES: DAISIES, SUNFLOWERS: SUNFLOWERS, SHROOMS: SHROOMS, BUSH: BUSH, FIT: FIT, ICO_BELT: ICO_BELT,
    onSphere: onSphere, applePositions: applePositions, rosePositions: rosePositions, palmTrunk: palmTrunk, frondTip: frondTip,
    frondKnee: frondKnee, clusterReach: clusterReach, clusterBelt: clusterBelt, pennantLayout: pennantLayout, buntLineY: buntLineY,
    flagWave: flagWave, faceNormals: faceNormals, pennantAngles: pennantAngles, pennantWave: pennantWave,
    sunAim: sunAim, runwayLevel: runwayLevel, ledLevels: ledLevels, idleAmp: idleAmp,
    /* paths (P1 auto-tiling) */
    PATH: PATH, PATH_PIECES: PATH_PIECES, pathPieceOf: pathPieceOf, pathKey: pathKey, parsePathKey: parsePathKey, pathPose: pathPose,
    pathSd: pathSd, pathStones: pathStones, stepStones: stepStones, pathFlowers: pathFlowers, pathPlanks: pathPlanks,
    pathFillets: pathFillets, pathPlates: pathPlates
  };
}));
