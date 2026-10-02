/* ================================================================
   My Island 3D — garden models (architecture chunk 4; classic script).
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
   THREE is never touched directly (it only arrives through K), so the pure
   helpers at the top of this file also load in Node for tests.

   CONVENTIONS
   - Item space: base at y = 0, pivot at the footprint centre, facing +z.
     Everything stays inside 0.86 × 0.86 except tree canopies, the flag
     cloth and the windmill sails above y = 1.0 (the bible's overhang rule).
   - 'sway' is NOT a template pivot: it is the kit's whole-copy root alias
     (ItemBatch.pivot(uid, 'sway') → root), so swaying trees and bobbing
     flowers keep static, shadow-casting, frustum-culled parts.
   - Lit state ('lit', 0..1) is an instance colour on a 'state' part
     (lantern glass + star bulb, mushroom caps, lighthouse lamp room): a
     toggle never rebuilds anything.
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

  /* tokens this file names directly (everything else comes from LOOK[id].colors) */
  var NEON4 = ['Neon Pink', 'Neon Cyan', 'Neon Violet', 'Neon Lime'];
  var NEON3 = ['Neon Pink', 'Neon Cyan', 'Neon Violet'];
  var LIT_TOKENS = { dim: 'Ink Deep', night: 'Stage Night', white: 'Cloud White', runway: 'Pebble' };
  var EXTRA_TOKENS = NEON4.concat(['Lamp Halo', 'Cap Halo', 'Lamp Warm', 'Cap Neon', LIT_TOKENS.dim, LIT_TOKENS.night, LIT_TOKENS.white, LIT_TOKENS.runway]);

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
  var SUN_YAW = -38;          /* item-space yaw toward the day sun at (-7, 14, 9) */

  /* point on a sphere surface along a direction (+ lift): [x, y, z] */
  function onSphere(c, r, dir, lift) {
    var l = Math.sqrt(dir[0] * dir[0] + dir[1] * dir[1] + dir[2] * dir[2]) || 1, k = (r + (lift || 0)) / l;
    return [c[0] + dir[0] * k, c[1] + dir[1] * k, c[2] + dir[2] * k];
  }
  /* broadleaf canopy (oak, apple, blossom): top puff, two lower puffs, highlight dab */
  var CANOPY = {
    trunk: { rTop: 0.08, rBot: 0.12, h: 0.72 },
    top: { c: [0, 1.16, 0], r: 0.44 },
    low: [{ c: [-0.2, 0.98, 0.04], r: 0.34 }, { c: [0.2, 0.98, -0.02], r: 0.34 }],
    dab: { c: [-0.17, 1.4, 0.26], r: 0.16 }
  };
  /* apples sit on the front of the canopy: [puff index (0 top, 1 left, 2 right), direction] */
  var APPLES = [[0, [-0.6, 0.2, 0.75]], [0, [0.5, 0.35, 0.75]], [0, [0.05, 0.6, 0.8]],
    [1, [-0.55, -0.3, 0.75]], [2, [0.6, -0.2, 0.75]], [2, [0.1, -0.5, 0.85]]];
  var APPLE_R = 0.06, APPLE_SCALE = 1.55 / 1.6;
  function canopyPuff(i) { return i === 0 ? CANOPY.top : CANOPY.low[i - 1]; }
  function applePositions() {
    return APPLES.map(function (e) { var p = canopyPuff(e[0]); return onSphere(p.c, p.r, e[1], 0.01); });
  }
  /* pine: three round-tipped cones, bottom to top */
  var PINE = { trunk: { r: 0.07, h: 0.32 }, tiers: [{ r: 0.43, h: 0.62, y: 0.24 }, { r: 0.35, h: 0.56, y: 0.62 }, { r: 0.25, h: 0.62, y: 1.18 }] };
  /* palm: a leaning trunk of 6 ringed segments, a crown of 5 fronds and 2 coconuts */
  var PALM = {
    base: [-0.04, 0, 0], ctrl: [-0.1, 0.85, 0], top: [0.04, 1.58, 0], segs: 6, rBot: 0.085, rTop: 0.06,
    frond: { r: 0.14, len: 0.58, flat: 0.22 },
    /* [azimuth deg, tilt about z deg (-90 = horizontal out, < -90 droops)] */
    fronds: [[20, -55], [95, -112], [165, -118], [240, -110], [310, -116]],
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
  /* frond tip (item space) for a [azimuth, tilt] pair */
  function frondTip(f) {
    var t = f[1] * Math.PI / 180, az = f[0] * Math.PI / 180, L = PALM.frond.len;
    var x = -Math.sin(t) * L, y = Math.cos(t) * L;              /* Rz(t) applied to +y */
    return [PALM.top[0] + x * Math.cos(az), PALM.top[1] + y, PALM.top[2] - x * Math.sin(az)];   /* then Ry(az) */
  }
  /* flower patches */
  var MOUND = { r: 0.35, h: 0.07, depth: 0.71 };
  var TULIPS = [{ x: -0.17, z: 0.02, h: 0.3 }, { x: 0, z: -0.06, h: 0.38 }, { x: 0.17, z: 0.05, h: 0.33 }];
  var TULIP_CUP = { r: 0.06, h: 0.1 };
  var DAISIES = [{ x: -0.2, z: 0.04, h: 0.24 }, { x: 0, z: -0.1, h: 0.28 }, { x: 0.2, z: 0.04, h: 0.26 }, { x: -0.1, z: 0.17, h: 0.18 }, { x: 0.12, z: 0.17, h: 0.2 }];
  var DAISY = { petals: 8, len: 0.05, wide: 0.022, inner: 0.012, tilt: 25 };
  var SUNFLOWERS = [{ x: -0.12, z: -0.03, y: 0.59 }, { x: 0.15, z: 0.08, y: 0.44 }];
  var SUNHEAD = { disc: 0.09, petals: 12, len: 0.07, wide: 0.034 };
  var BUSH = [{ c: [-0.2, 0.2, 0], r: 0.2, tok: 'puff' }, { c: [0.2, 0.2, -0.01], r: 0.2, tok: 'puff' }, { c: [0, 0.37, 0.02], r: 0.23, tok: 'puffLight' }];
  var ROSES = [[0, [-0.5, 0.3, 0.8]], [1, [0.45, 0.35, 0.8]], [2, [-0.35, 0.45, 0.8]], [2, [0.4, 0.5, 0.75]], [0, [0.2, -0.1, 1]], [2, [0.08, 0.6, 0.8]]];
  function rosePositions() { return ROSES.map(function (e) { var p = BUSH[e[0]]; return onSphere(p.c, p.r, e[1], 0); }); }
  var ROCK = { r: 0.32, s: [1, 0.62, 0.85], y: 0.2, moss: { r: 0.3, y: 0.33, s: [0.95, 0.4, 0.84] }, eyes: { x: 0.08, y: 0.24, z: 0.25, r: 0.028 } };
  /* mushrooms: x, z, stem height, cap radius */
  var SHROOMS = [{ x: -0.18, z: 0.07, stem: 0.24, r: 0.13 }, { x: 0.05, z: -0.05, stem: 0.36, r: 0.17 }, { x: 0.24, z: 0.12, stem: 0.17, r: 0.1 }];
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
  /* windmill */
  var MILL = { towerR: 0.3, towerH: 1.5, capR: 0.25, capH: 0.32, hub: [0, 1.6, 0.3], arm: 0.575, inner: 0.14, width: 0.14, trail: 6, trailDeg: 48 };
  /* lighthouse */
  var LH = { r: 0.32, h: 2.0, bands: [[0.22, 0.36], [0.58, 0.72]], lamp: [0, 2.18, 0], beamLen: 6, beamR: 0.6, beamScale: 40 };

  /* ================================================================
     PURE ANIMATION HELPERS (allocation-free; Node-tested)
     ================================================================ */
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
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
    /* a 4-sided double cone (octahedron-like): LED dots, sparkles (16 tris) */
    function bicone(G, r, h) {
      var up = T(G, G.cone(r, h / 2, 4), [0, h / 4, 0]);
      var dn = T(G, G.cone(r, h / 2, 4), [0, -h / 4, 0], [180, 0, 0]);
      return G.merge([up, dn]);
    }
    /* a flat dot facing +z (eyes, coal, shells) */
    function dot(G, r, depth, radial) { return T(G, G.tube(r, r, depth, { radial: radial || 6 }), null, [90, 0, 0]); }
    /* a dot half-sunk into a sphere (centre c, radius r) along dir, facing out of the surface */
    function stud(G, c, r, dir, dr, depth, radial) {
      var l = Math.sqrt(dir[0] * dir[0] + dir[1] * dir[1] + dir[2] * dir[2]) || 1;
      var el = Math.asin(dir[1] / l) * 180 / Math.PI, az = Math.atan2(dir[0], dir[2]) * 180 / Math.PI;
      return T(G, T(G, dot(G, dr, depth, radial), null, [-el, 0, 0]), onSphere(c, r, dir), [0, az, 0]);
    }
    /* a domed mound (lathe, 4 profile steps), elliptical in z */
    var MOUND_PROF = [[0, 0], [1, 0], [0.93, 0.5], [0.6, 0.92], [0, 1]];
    function mound(G, tok, r, h, depth) {
      var g = T(G, G.drop(r || MOUND.r, h || MOUND.h, MOUND_PROF), null, null, [1, 1, depth || MOUND.depth]);
      return tone2(G, g, tok, -0.2);
    }
    /* a low cone lying on the ground, apex up and optionally tinted (pebbles, flowers, petals) */
    function flatCone(G, r, h, radial, tok, apexTok) {
      var g = T(G, G.cone(r, h, radial), [0, h / 2, 0]);
      return G.paintBy(g, function (v) { return apexTok && v.y > h * 0.9 ? apexTok : tok; });
    }
    /* an elongated leaf: lathe of a pointed profile (flattened by the caller) */
    var LEAF_PROF = [[0, 0], [0.7, 0.2], [1, 0.5], [0.7, 0.8], [0, 1]];
    /* a two-sided quad in the x-y plane centred on the origin (nails) */
    function quad(G, w, h) { return T(G, G.flag(w, h, 1, 1), [-w / 2, 0, 0]); }
    /* a plank-like octagonal prism along x: thickness t (y) × depth d (z), length len */
    function plank(G, len, t, d, radial) {
      var g = T(G, G.tube(1, 1, len, { radial: radial || 8 }), null, [0, 22.5, 0]);
      T(G, g, null, null, [t / 2, 1, d / 2]);
      return T(G, g, null, [0, 0, 90]);
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
       TREES — one static toon part; the idle sways the whole copy ('sway' = root)
       ================================================================ */
    function swayIdle(id, dflt) {
      var idl = idleOf(id, dflt), sw = {};
      return function (a) {
        if (!M || !a) return;
        M.sway(a.t, idl.deg, idl.period, a.phase, a.reduced, sw);
        setPiv(a, 'sway', sw.x, 0, sw.z, 0, 0, 0, 1);
      };
    }
    var L_SPEC = [-0.398, 0.597, 0.697];   /* apple spec dot: faces turned toward the top-left light */
    function broadleaf(ctx, kind) {
      var G = ctx.G, c = colorsOf(ctx), geos = [], tr = CANOPY.trunk;
      var trunk = T(G, G.tube(tr.rTop, tr.rBot, tr.h, { radial: rad(ctx, 10) }), [0, tr.h / 2, 0]);
      geos.push(G.paintBy(trunk, function (v) { return v.y < 0.12 ? [c.trunk, 'shade'] : c.trunk; }));
      geos.push(tone2(G, T(G, G.puff(CANOPY.top.r), CANOPY.top.c), c.canopy, -0.45));
      CANOPY.low.forEach(function (p) { geos.push(tone2(G, T(G, G.puff(p.r), p.c), c.canopyLow, -0.3)); });
      geos.push(G.paint(T(G, G.puff(CANOPY.dab.r), CANOPY.dab.c), c.dab));
      if (kind === 'apple') {
        applePositions().forEach(function (p) {
          var ap = T(G, G.puff(APPLE_R), p);
          geos.push(G.paintBy(ap, function (v) {
            return v.nx * L_SPEC[0] + v.ny * L_SPEC[1] + v.nz * L_SPEC[2] > 0.9 ? c.spec : c.apple;
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

    var CONE_PROF = [[0, 0], [1, 0.03], [0.97, 0.13], [0.64, 0.45], [0.32, 0.78], [0.1, 0.95], [0, 1]];
    models.tree_pine = {
      build: function (ctx) {
        var G = ctx.G, c = colorsOf(ctx), geos = [], tk = PINE.trunk;
        geos.push(G.paint(T(G, G.tube(tk.r * 0.8, tk.r, tk.h, { radial: rad(ctx, 8) }), [0, tk.h / 2, 0]), c.trunk));
        PINE.tiers.forEach(function (t, i) {
          var g = T(G, G.drop(t.r, t.h, CONE_PROF), [0, t.y, 0]);
          geos.push(tone2(G, g, i === 2 ? c.top : c.cone, -0.3));
        });
        return tpl(ctx).part('body', geos, 'toon', { castShadow: true }).done();
      },
      idle: swayIdle('tree_pine', { deg: 1, period: 5 }), act: function () { return null; }, show: function () {}
    };

    models.tree_palm = {
      build: function (ctx) {
        var G = ctx.G, c = colorsOf(ctx), geos = [];
        palmTrunk().forEach(function (s, i) {
          var g = T(G, G.tube(s.rTop, s.rBot, s.len, { radial: rad(ctx, 8) }), s.c, [0, 0, s.tilt]);
          geos.push(G.paint(g, i % 2 ? c.trunkB : c.trunkA));
        });
        var fr = [c.frondA, c.frondB, c.frondC, c.frondD, c.frondA];
        PALM.fronds.forEach(function (f, i) {
          var g = T(G, G.drop(PALM.frond.r, PALM.frond.len, LEAF_PROF), PALM.top, [0, f[0], f[1]], [PALM.frond.flat, 1, 1]);
          geos.push(tone2(G, g, fr[i], -0.2));
        });
        PALM.coconuts.forEach(function (o) {
          geos.push(tone2(G, T(G, G.puff(PALM.coconutR), [PALM.top[0] + o[0], PALM.top[1] + o[1], PALM.top[2] + o[2]]), c.coconut));
        });
        return tpl(ctx).part('body', geos, 'toon', { castShadow: true }).done();
      },
      idle: swayIdle('tree_palm', { deg: 3, period: 3.6 }), act: function () { return null; }, show: function () {}
    };

    /* ================================================================
       FLOWERS, ROSE BUSH, MOSSY ROCK — patches on a low mound; heads bob
       ================================================================ */
    function bobIdle(id) {
      var idl = idleOf(id, { pct: 2, period: 2.4 });
      return function (a) {
        if (!M || !a) return;
        var s = M.bob(a.t, idl.pct, idl.period, a.phase, a.reduced), w = 1 + (s - 1) * 0.5;
        setPiv(a, 'sway', 0, 0, 0, 0, 0, 0, w, s, w);
      };
    }
    var TULIP_PROF = [[0, 0], [1, 0.38], [0.82, 1], [0, 0.8]];
    models.flower_tulip = {
      build: function (ctx) {
        var G = ctx.G, c = colorsOf(ctx), geos = [mound(G, c.mound)], cups = [c.cupA, c.cupB, c.cupC];
        TULIPS.forEach(function (f, i) {
          geos.push(G.paint(T(G, G.tube(0.015, 0.015, f.h, { radial: rad(ctx, 5), open: true }), [f.x, 0.04 + f.h / 2, f.z]), c.stem));
          geos.push(tone2(G, T(G, G.drop(TULIP_CUP.r, TULIP_CUP.h, TULIP_PROF), [f.x, 0.02 + f.h, f.z]), cups[i], -0.5));
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
        BUSH.forEach(function (p) { geos.push(tone2(G, T(G, G.puff(p.r), p.c), c[p.tok], -0.3)); });
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

    var rockIdl = idleOf('rock_mossy', { min: 5, max: 9 });
    models.rock_mossy = {
      build: function (ctx) {
        var G = ctx.G, c = colorsOf(ctx), b = tpl(ctx), E = ROCK.eyes;
        var rock = G.facet(T(G, G.puff(ROCK.r), [0, ROCK.y, 0], null, ROCK.s));
        var moss = T(G, G.puff(ROCK.moss.r), [0, ROCK.moss.y, 0], null, ROCK.moss.s);
        b.part('body', [tone2(G, rock, c.rock, -0.3), G.paintBy(moss, function (v) { return v.ny > 0.75 ? [c.moss, 'hi'] : c.moss; })], 'toon', { castShadow: true });
        b.pivot('eyes', [0, E.y, E.z]);
        b.part('eyes', [-1, 1].map(function (s) { return G.paint(T(G, dot(G, E.r, 0.03, rad(ctx, 8)), [s * E.x, E.y, E.z]), c.eye); }), 'toon', { pivot: 'eyes' });
        return b.done();
      },
      idle: function (a) {
        if (!M || !a) return;
        var open = M.blink(a.t, a.uid, rockIdl.min, rockIdl.max, a.reduced);
        setPiv(a, 'eyes', 0, 0, 0, 0, 0, 0, 1, open < 0.08 ? 0.08 : open, 1);
      },
      act: function () { return null; }, show: function () {}
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

    models.lantern = lampModel('lantern', function (ctx) {
      var G = ctx.G, c = colorsOf(ctx), b = tpl(ctx), post = [];
      post.push(tone2(G, T(G, G.tube(0.11, 0.13, 0.06, { radial: rad(ctx, 10) }), [0, 0.03, 0]), c.post));
      post.push(G.paint(T(G, G.tube(0.04, 0.045, 0.97, { radial: rad(ctx, 8) }), [0, 0.545, 0]), c.post));
      post.push(tone2(G, T(G, G.slab(0.28, 0.03, 0.28, 0), [0, 1.015, 0]), c.cage));
      post.push(tone2(G, T(G, G.slab(0.28, 0.03, 0.28, 0), [0, 1.265, 0]), c.cage));
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (q) {
        post.push(G.paint(T(G, G.tube(0.016, 0.016, 0.22, { radial: 4, open: true }), [q[0] * 0.12, 1.14, q[1] * 0.12]), c.cage));
      });
      post.push(tone2(G, T(G, G.cone(0.18, 0.08, 4), [0, 1.32, 0], [0, 45, 0]), c.cap));
      post.push(G.paint(T(G, G.cone(0.035, 0.05, rad(ctx, 6)), [0, 1.385, 0]), c.cap));
      b.part('post', post, 'toon', { castShadow: true });
      /* glass + the puffy star bulb (a nod to the Island Wand) pierce it front and back */
      var glass = G.paint(T(G, G.slab(0.22, 0.22, 0.22, 0), [0, 1.14, 0]), LIT_TOKENS.white);
      var star = G.paint(T(G, G.star(0.075, 0.034), [0, 1.14, 0], null, [1, 1, 8.3]), c.bulb);
      b.pivot('glow', [0, 1.14, 0]).anchor('glow', [0, 1.14, 0]);
      b.part('glass', [glass, star], 'state', { pivot: 'glow', stateColor: { key: 'lit', off: c.glassOff, on: c.glassOn, initial: 0 } });
      return b.done();
    });

    var CAP_PROF = [[0, 0], [1, 0.1], [0.93, 0.48], [0.58, 0.88], [0, 1]];
    var SPOTS = [[0, -35], [0, 40], [1, -25], [1, 45], [2, 10]];     /* [mushroom, azimuth deg] */
    models.mushroom_glow = lampModel('mushroom_glow', function (ctx) {
      var G = ctx.G, c = colorsOf(ctx), b = tpl(ctx), body = [mound(G, c.mound, 0.34, 0.05, 0.74)], caps = [], spots = [];
      SHROOMS.forEach(function (m) {
        body.push(tone2(G, T(G, G.tube(0.035, 0.045, m.stem, { radial: rad(ctx, 8), open: true }), [m.x, 0.03 + m.stem / 2, m.z]), c.stem));
        caps.push(G.paint(T(G, G.drop(m.r, m.r * 1.05, CAP_PROF), [m.x, 0.01 + m.stem, m.z]), LIT_TOKENS.white));
      });
      SPOTS.forEach(function (s) {
        var m = SHROOMS[s[0]], h = m.r * 1.05, base = 0.01 + m.stem, az = s[1] * Math.PI / 180;
        var rr = 0.755 * m.r + 0.004, y = base + 0.68 * h;
        var tilt = Math.atan2(0.75, 0.66) * 180 / Math.PI;     /* the cap's outward slope there */
        var sp = T(G, T(G, G.tube(0.022, 0.022, 0.03, { radial: 5 }), null, [tilt, 0, 0]), [m.x + Math.sin(az) * rr, y, m.z + Math.cos(az) * rr], [0, s[1], 0]);
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
          tone2(G, T(G, G.tube(0.09, 0.11, 0.05, { radial: rad(ctx, 10) }), [px, 0.025, 0]), c.pole),
          G.paint(T(G, G.tube(FLAG.poleR, FLAG.poleR, FLAG.poleTop - 0.05, { radial: rad(ctx, 8) }), [px, 0.05 + (FLAG.poleTop - 0.05) / 2, 0]), c.pole)
        ], 'toon', { castShadow: true });
        b.part('finial', [G.paint(T(G, G.puff(0.05), [px, FLAG.poleTop + 0.01, 0]), c.finial)], 'gold', { castShadow: true });
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
          frame.push(tone2(G, T(G, G.tube(0.03, 0.03, BUNT.postH, { radial: rad(ctx, 8) }), [x, BUNT.postH / 2, 0]), c.post));
          frame.push(G.paint(T(G, G.cone(0.045, 0.06, rad(ctx, 8)), [x, BUNT.postH + 0.03, 0]), c.post, 'hi'));
        });
        var line = [];
        for (var i = 0; i <= 4; i++) { var x = -X + i * X / 2; line.push([x, buntLineY(x), buntLineZ(x)]); }
        frame.push(G.paint(G.ribbon(line, 0.012, { segments: ctx.tier === 'LOW' ? 8 : 10 }), c.line));
        b.part('frame', frame, 'toon', { castShadow: true });
        var pc = [c.p1, c.p2, c.p3, c.p4, c.p5], pens = [];
        LAYOUT.forEach(function (L, k) {
          var g = T(G, G.cone(BUNT.pr, BUNT.ph, 4), [L.x, L.cy - BUNT.ph / 2, L.cz], [0, 0, 180], [1, 1, 0.2]);
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
    models.bench = {
      build: function (ctx) {
        var G = ctx.G, c = colorsOf(ctx), wood = [], legs = [], r8 = rad(ctx, 8);
        [0.1, -0.04].forEach(function (z) { wood.push(tone2(G, T(G, plank(G, 0.8, 0.06, 0.12, r8), [0, 0.28, z]), c.plank)); });
        [[0.36, -0.165], [0.45, -0.18]].forEach(function (q) { wood.push(tone2(G, T(G, plank(G, 0.8, 0.1, 0.045, r8), [0, q[0], q[1]], [-10, 0, 0]), c.plank)); });
        [-0.33, 0.33].forEach(function (x) {
          legs.push(G.paint(T(G, G.tube(0.025, 0.025, 0.26, { radial: r8 }), [x, 0.13, 0.11]), c.leg));
          legs.push(G.paint(T(G, G.tube(0.025, 0.025, 0.47, { radial: r8 }), [x, 0.235, -0.15], [-6, 0, 0]), c.leg));
        });
        return tpl(ctx).part('body', wood.concat(legs), 'toon', { castShadow: true }).anchor('seat', [0, 0.31, 0.03]).done();
      },
      idle: noop, act: none, show: noop
    };

    models.sandcastle = {
      build: function (ctx) {
        var G = ctx.G, c = colorsOf(ctx), g = [], r10 = rad(ctx, 10);
        g.push(T(G, flatCone(G, 0.42, 0.04, r10, [c.sand, 'shade']), null, null, [1, 1, 0.85]));
        function tower(x, z, r, h, tooth) {
          g.push(tone2(G, T(G, G.tube(r, r + 0.015, h, { radial: r10 }), [x, h / 2, z]), c.sand));
          for (var k = 0; k < 4; k++) {
            var an = (45 + k * 90) * Math.PI / 180, rr = r - tooth * 0.45;
            g.push(tone2(G, T(G, G.slab(tooth, tooth, tooth, 0), [x + Math.sin(an) * rr, h + tooth / 2, z + Math.cos(an) * rr], [0, 45 + k * 90, 0]), c.sand));
          }
        }
        tower(0, -0.03, 0.18, 0.45, 0.065);
        tower(-0.25, 0.05, 0.105, 0.55, 0.048);
        tower(0.25, 0.05, 0.105, 0.55, 0.048);
        g.push(G.paint(T(G, G.slab(0.1, 0.1, 0.04, 0), [0, 0.05, 0.175]), c.door));
        g.push(G.paint(T(G, dot(G, 0.05, 0.04, r10), [0, 0.1, 0.175]), c.door));
        g.push(G.paint(T(G, G.tube(0.01, 0.01, 0.26, { radial: 4 }), [0, 0.58, -0.03]), c.stick));
        g.push(G.paint(T(G, G.cone(0.04, 0.1, 4), [0.05, 0.66, -0.03], [0, 0, -90], [1, 1, 0.25]), c.flag));
        [[-0.25, 0.3, 0.17, 0], [0.25, 0.22, 0.17, 0], [0.09, 0.3, 0.135, 29]].forEach(function (p) {
          g.push(G.paint(T(G, dot(G, 0.02, 0.02, 6), [p[0], p[1], p[2]], [0, p[3], 0]), c.shell));
        });
        return tpl(ctx).part('body', g, 'toon', { castShadow: true }).done();
      },
      idle: noop, act: none, show: noop
    };

    models.umbrella = {
      build: function (ctx) {
        var G = ctx.G, c = colorsOf(ctx), u = [], seg = Math.PI / 4;
        u.push(G.paint(T(G, G.tube(0.022, 0.022, 1.14, { radial: rad(ctx, 6) }), [0, 0.57, 0]), c.pole));
        var can = G.paintBy(G.cone(0.55, 0.25, 8), function (v) {
          var i = Math.floor((Math.atan2(v.x, v.z) + Math.PI) / seg) % 2, tok = i ? c.canopyB : c.canopyA;
          return v.ny < -0.5 ? [tok, 'shade'] : tok;
        }, { perFace: true });
        u.push(T(G, can, [0, 1.115, 0]));
        u.push(G.paint(T(G, G.cone(0.03, 0.05, rad(ctx, 6)), [0, 1.235, 0]), c.canopyA));
        var um = T(G, G.merge(u), [-0.1, 0, 0], [0, 0, -8]);
        var towel = G.merge([
          G.paint(T(G, G.slab(0.26, 0.02, 0.46, 0), [0, 0.01, 0]), c.towel),
          G.paint(T(G, G.slab(0.264, 0.022, 0.06, 0), [0, 0.011, 0.08]), c.canopyB)
        ]);
        return tpl(ctx).part('body', [um, T(G, towel, [0.2, 0, 0.16], [0, 12, 0])], 'toon', { castShadow: true }).done();
      },
      idle: noop, act: none, show: noop
    };

    /* snowman: 6 sparkles on two counter-rotating pivots drift around him ('never melts') */
    var SNOW_SPARK = { r: 0.42, ys: [0.25, 0.75, 0.45, 0.85, 0.35, 0.6] };
    models.snowman = {
      build: function (ctx) {
        var G = ctx.G, c = colorsOf(ctx), b = tpl(ctx), g = [], r10 = rad(ctx, 10);
        g.push(tone2(G, T(G, G.puff(0.22), [0, 0.2, 0]), c.snow, -0.5));
        g.push(tone2(G, T(G, G.puff(0.16), [0, 0.54, 0]), c.snow, -0.5));
        g.push(G.paint(T(G, G.tube(0.15, 0.15, 0.025, { radial: r10 }), [0, 0.69, 0]), c.hat));
        g.push(G.paint(T(G, G.tube(0.1, 0.11, 0.26, { radial: r10 }), [0, 0.82, 0]), c.hat));
        g.push(G.paint(T(G, G.tube(0.113, 0.113, 0.04, { radial: r10, open: true }), [0, 0.73, 0]), c.scarf));
        g.push(G.paint(T(G, G.cone(0.03, 0.13, rad(ctx, 6)), [0, 0.53, 0.2], [90, 0, 0]), c.carrot));
        [-1, 1].forEach(function (s) { g.push(G.paint(stud(G, [0, 0.54, 0], 0.152, [s * 0.055, 0.045, 0.14], 0.018, 0.03, 5), c.coal)); });
        [[0, 0.5, 0.86], [0, 0.05, 1]].forEach(function (d) { g.push(G.paint(stud(G, [0, 0.2, 0], 0.207, d, 0.02, 0.03, 5), c.coal)); });
        g.push(G.paint(T(G, G.tube(0.16, 0.175, 0.06, { radial: rad(ctx, 12), open: true }), [0, 0.405, 0]), c.scarf));
        g.push(tone2(G, T(G, G.slab(0.06, 0.17, 0.03, 0), [0.09, 0.33, 0.17], [0, 0, 12]), c.scarf));
        b.part('body', g, 'toon', { castShadow: true });
        var A = [], B = [];
        SNOW_SPARK.ys.forEach(function (y, i) {
          var an = i * Math.PI / 3, sp = T(G, bicone(G, 0.032, 0.08), [Math.sin(an) * SNOW_SPARK.r, y, Math.cos(an) * SNOW_SPARK.r], [0, i * 60, 0], [1, 1, 0.35]);
          (i % 2 ? B : A).push(G.paint(sp, c.sparkle));
        });
        b.pivot('sparkA', [0, 0, 0]).pivot('sparkB', [0, 0, 0]);
        b.part('sparkA', A, 'state', { pivot: 'sparkA', stateColor: { key: 'sparkA', off: 'Holo Blue', on: LIT_TOKENS.white, initial: 0.6 } });
        b.part('sparkB', B, 'state', { pivot: 'sparkB', stateColor: { key: 'sparkB', off: 'Holo Blue', on: LIT_TOKENS.white, initial: 0.6 } });
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
    /* windmill: lattice sails on 'spin'; Showtime neon tips with 6-segment light streaks */
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
        body.push(tone2(G, G.drop(MILL.towerR, MILL.towerH, TOWER_PROF), c.tower, -0.3));
        body.push(G.paint(T(G, G.slab(0.15, 0.2, 0.05, 0), [0, 0.1, 0.29]), c.door));
        body.push(G.paint(T(G, dot(G, 0.075, 0.05, rad(ctx, 8)), [0, 0.2, 0.29]), c.door));
        body.push(tone2(G, T(G, G.drop(0.27, 0.34, DOME_PROF), [0, 1.46, 0]), c.cap, -0.3));
        body.push(G.paint(T(G, G.tube(0.03, 0.03, 0.12, { radial: 6 }), [H[0], H[1], H[2] - 0.05], [90, 0, 0]), c.hub, 'shade'));
        b.part('body', body, 'toon', { castShadow: true });
        var len = MILL.arm - MILL.inner, w = MILL.width, z0 = H[2] + 0.04;
        for (var k = 0; k < 4; k++) {
          var arm = [G.slab(0.03, MILL.arm, 0.025, 0)];
          T(G, arm[0], [0, MILL.arm / 2, 0]);
          arm.push(T(G, G.slab(0.018, len, 0.02, 0), [0.03, MILL.inner + len / 2, 0]));
          arm.push(T(G, G.slab(0.018, len, 0.02, 0), [0.02 + w, MILL.inner + len / 2, 0]));
          for (var j = 0; j < 4; j++) arm.push(T(G, G.slab(w, 0.018, 0.02, 0), [0.02 + w / 2, MILL.inner + j * len / 3, 0]));
          sails.push(tone2(G, T(G, G.merge(arm), [H[0], H[1], z0], [0, 0, -(k * 90 + 45)]), c.sail, -0.6));
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
        sails.push(G.paint(T(G, dot(G, 0.075, 0.07, rad(ctx, 10)), [H[0], H[1], z0 + 0.02]), c.hub));
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

    /* lighthouse: red-and-white tower, lamp room lit by state colour, two additive
       beams on the 'beam' pivot (authored 1/LH.beamScale size, scaled up while lit) */
    var LH_PROF = [[0, 0], [1, 0], [0.96, 0.22], [0.93, 0.36], [0.87, 0.58], [0.84, 0.72], [0.74, 1], [0, 1]];
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
        body.push(G.paintBy(G.drop(LH.r, LH.h, LH_PROF), function (v) {
          var f = v.y / LH.h, band = (f > LH.bands[0][0] && f < LH.bands[0][1]) || (f > LH.bands[1][0] && f < LH.bands[1][1]);
          var tok = band ? c.band : c.tower;
          return v.ny < -0.5 ? [tok, 'shade'] : tok;
        }, { perFace: true }));
        body.push(G.paint(T(G, G.tube(0.3, 0.27, 0.05, { radial: n12 }), [0, 2.02, 0]), c.gallery));
        body.push(G.paint(T(G, G.ring(0.29, 0.018), [0, 2.12, 0], [90, 0, 0]), c.gallery));
        body.push(tone2(G, T(G, G.cone(0.24, 0.3, n12), [0, 2.46, 0]), c.roof));
        body.push(G.paint(T(G, G.puff(0.045), [0, 2.65, 0]), c.roof, 'hi'));
        body.push(G.paint(T(G, G.cone(0.018, 0.1, 6), [0, 2.75, 0]), c.gallery));
        body.push(G.paint(T(G, G.slab(0.16, 0.22, 0.05, 0), [0, 0.11, 0.315]), c.band, 'shade'));
        body.push(G.paint(T(G, dot(G, 0.08, 0.05, rad(ctx, 8)), [0, 0.22, 0.315]), c.band, 'shade'));
        body.push(G.paint(T(G, G.slab(0.06, 0.12, 0.04, 0), [0, 0.95, 0.29]), c.gallery));
        body.push(G.paint(T(G, G.slab(0.06, 0.12, 0.04, 0), [0, 1.55, 0.263]), c.gallery));
        b.part('body', body, 'toon', { castShadow: true });
        var glass = G.paint(T(G, G.tube(0.17, 0.17, 0.26, { radial: rad(ctx, 8) }), L), LIT_TOKENS.white);
        b.pivot('glow', L).anchor('glow', L);
        b.part('glass', [glass], 'state', { pivot: 'glow', stateColor: { key: 'lit', off: c.glassOff, on: c.glassOn, initial: 0 } });
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
       PATHS — flat ground tiles (receive shadows, never cast) with the Showtime
       runway: a 'glow:Neon Cyan' under-plate whose instance colour the chase drives
       ================================================================ */
    var runTok = (LOOKS.path_stone && LOOKS.path_stone.show && LOOKS.path_stone.show.glow && LOOKS.path_stone.show.glow.token) || 'Neon Cyan';
    var runOn = perCopy(new Map());
    function runwayPlate(G) {
      return G.paintBy(T(G, G.cone(0.69, 0.002, 4), [0, 0.004, 0], [0, 45, 0]), function (v) { return v.y > 0.004 ? LIT_TOKENS.white : LIT_TOKENS.dim; });
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
          var G = ctx.G, b = tpl(ctx);
          b.part('tile', tile(ctx, G, colorsOf(ctx)), 'toon', { castShadow: false, receiveShadow: true });
          b.part('glow', [runwayPlate(G)], 'glow:' + runTok, { castShadow: false, receiveShadow: false, stateColor: { key: 'runway', off: LIT_TOKENS.night, on: LIT_TOKENS.runway, initial: 1 } });
          return b.done();
        },
        idle: runwayIdle, act: none, show: runwayIdle
      };
    }
    var PEBBLES = [[-0.24, -0.22, 0.17, 0.14], [0.2, -0.22, 0.2, 0.14], [-0.04, 0.17, 0.2, 0.15], [0.34, 0.22, 0.12, 0.13], [-0.38, 0.22, 0.09, 0.115]];
    models.path_stone = pathModel(function (ctx, G, c) {
      return PEBBLES.map(function (p) {
        return T(G, flatCone(G, 1, 0.035, rad(ctx, 10), c.stone, c.hi), [p[0] * 0.9, 0, p[1] * 0.9], null, [p[2] * 0.92, 1, p[3] * 0.92]);
      });
    });
    models.path_wood = pathModel(function (ctx, G, c) {
      var g = [];
      for (var i = 0; i < 5; i++) {
        var x = -0.345 + i * 0.175;
        g.push(tone2(G, T(G, G.slab(0.15, 0.035, 0.84, 0), [x, 0.0175, 0]), i % 2 ? c.plankB : c.plankA));
        [-0.34, 0.34].forEach(function (z) { g.push(G.paint(T(G, quad(G, 0.026, 0.026), [x, 0.0362, z], [-90, 0, 0]), c.nail)); });
      }
      return g;
    });
    models.path_flower = pathModel(function (ctx, G, c) {
      var g = [[-0.2, -0.17, 0.18, 0.14], [0.18, 0.14, 0.19, 0.15]].map(function (s) {
        return T(G, flatCone(G, 1, 0.035, rad(ctx, 12), c.stone, [c.stone, 'hi']), [s[0], 0, s[1]], null, [s[2], 1, s[3]]);
      });
      [[0.2, -0.24, c.f1, c.f2], [-0.26, 0.22, c.f2, c.f3], [-0.02, -0.01, c.f3, c.f2]].forEach(function (f) {
        g.push(T(G, flatCone(G, 0.045, 0.014, 5, f[2], f[3]), [f[0], 0, f[1]]));
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
    CANOPY: CANOPY, PINE: PINE, PALM: PALM, FLAG: FLAG, BUNT: BUNT, MILL: MILL, LH: LH, ROCK: ROCK,
    TULIPS: TULIPS, DAISIES: DAISIES, SUNFLOWERS: SUNFLOWERS, SHROOMS: SHROOMS, FIT: FIT,
    onSphere: onSphere, applePositions: applePositions, rosePositions: rosePositions, palmTrunk: palmTrunk, frondTip: frondTip,
    pennantLayout: pennantLayout, buntLineY: buntLineY,
    flagWave: flagWave, faceNormals: faceNormals, pennantAngles: pennantAngles, pennantWave: pennantWave,
    sunAim: sunAim, runwayLevel: runwayLevel, ledLevels: ledLevels
  };
}));
