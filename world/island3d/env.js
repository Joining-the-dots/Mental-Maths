/* ================================================================
   My Island 3D — the environment (classic script; THREE comes from K).
   window.SLIslandEnv in the browser; require() in Node returns the same
   object, whose PURE helpers run without THREE (create() needs the kit K).
   Island chunk 3 (island-architecture.json): the ground, the sea, the sky,
   the lights and the DAY ↔ SHOW mix. Rules (regions, cells, unlocks,
   occupancy) come only from SLWorldCore; heights, the shore / locked
   distance field and the ground dressing from SLGrid3D; colours and the
   DAY / SHOW presets from SLIslandLook; timelines from SLMotion.

   FOR THE SCENE CONTROLLER (island3d.js, wave C)
     var env = SLIslandEnv.create(K, SL3D, opts)       (also SL3D.makeEnv(opts) once the stage is ready)
       opts {scene, renderer, unlocked: ['home', …], world, placed, show: 0..1, member: '#RRGGBB', reduced}
         scene     → scene.fog = env.fog (otherwise assign env.fog yourself)
         renderer  → update() also runs env.beforeRender(renderer)
         world     → SLWorldCore world: unlocked regions + placed items (plinths, dressing, light pole)
     scene.add(env.group)                   sky, stars, clouds, sea, ground, dressing, buoys, pole, cones, lights
     env.lights {hemi, sun}                 the ONLY lights (no Ambient / Point / Spot); sun.target is in env.group
     env.fog                                THREE.Fog, mixed with the show
     env.update(dt, t, showK?) → animating  once per frame, before rendering. A numeric showK drives the mix
                                            directly (it cancels a running blend); omit it to let showtime()
                                            drive it. t is accepted for symmetry; env keeps its own animation
                                            clock (dt-driven, frozen under reduced motion). false = nothing moves
                                            (reduced motion and no blend, rise or cone swing) → render on demand
     env.beforeRender(renderer)             exposure, clear colour (= fog colour), star pixel ratio and at most
                                            ONE pending static shadow-map render (needsUpdate only after a change)
     env.attach(renderer | null)            the renderer update() should call beforeRender() on (after a remount)
     env.setLand(unlocked, world?, {rise, reduced}?) → riseHandle | null
                                            unlocked = SLWorldCore.unlockedRegions(w) | a world | a land set.
                                            Cheap to call on every sync: the shore field is re-baked only when
                                            the land changes, the ground only when land or layout changed
                                            (plinths / dressing / pole follow world.placed), and each real
                                            change requests one shadow-map render.
     env.setPlaced(placed)                  layout-only change (place / move / store / undo); a no-op when no
                                            uid / id / cell changed. House restyles: call invalidateShadows().
     env.riseRegion(region, {reduced}?) → {region, cells: [{c, r, key, x, y, z, delay}], dur, done, promise, cancel()}
                                            the unlock wave: cells pop up from the sea 0.05 s apart (0.35 s outBack
                                            each) while the hologram and foam crossfade; reduced = instant swap with
                                            a 0.25 s field crossfade. cells[].delay times fx3d's splash rings.
                                            Adds the region to the land itself when setLand has not.
     env.showtime(on, {reduced}?) → sec     start the DAY ↔ SHOW blend: 1.6 s inOutSine (0.25 s crossfade reduced)
     env.setShow(k)                         apply the mix k (0..1) now and cancel a running blend
     env.show                               the current mix 0..1 (read-only)
     env.aim(point | null, {instant}?)      swing the 3 spot cones onto a point (launch at Showtime) / release
     env.setMember(hex)                     the child's member colour (Showtime rim = mix(Rim Showtime, member, 0.4))
     env.setReduced(on)                     reduced motion: frozen sea, still clouds / buoys / cones, crossfades
     env.setQuality(q)                      SL3D.quality {shadows, cones, particleScale}; subscribed automatically
     env.invalidateShadows()                request one shadow-map render (layout / house style change)
     env.lockedAt(x, z) → region | null     the locked hologram under a sea-plane point (picking)
     env.info() → {calls, tris, instances, land, show}
     env.dispose()                          frees what env made (K's shared geometry cache and materials stay)

   WHAT IT DRAWS (draw calls by day / at Showtime, every region unlocked: 13 / 15)
     sky dome · cloud puffs (1 instanced) · sea (ShaderMaterial: shallow → deep from the packed shore field,
     foam ring, 6 scrolling wave lines, day glints, Showtime colours and spot streaks, the locked-land
     sandbar with its neon dashed edge and scan lines) · sand skirt (boundary cells only, wet-sand ring at
     the waterline) · land tiles as top + side instanced meshes (exact top tokens: Grass Top / Grass Alt
     checker, Meadow Hill terraces, Cove Sand; plinths ride in the same meshes) · tufts · wildflowers ·
     shells · starfish · 2 stage buoys + the light pole behind the house + their 3 lamp lenses · the 3 fake
     spotlight cones (one instanced additive mesh) · star Points (sky + reflections on the night sea).
     Every toon mesh is an InstancedMesh with instanceColor, so they share K's ONE toon program.
   ================================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root, require('../world-core.js'), require('./grid3d.js'), require('../world-look.js'), require('./motion.js'));
  } else root.SLIslandEnv = factory(root, null, null, null, null);
}(typeof self !== 'undefined' ? self : typeof globalThis !== 'undefined' ? globalThis : this, function (root, C0, G0, L0, M0) {
  'use strict';

  var VERSION = 1;
  var DEG = Math.PI / 180, TAU = Math.PI * 2;

  /* lazy module lookups, so script order never matters in the browser */
  function core() { var c = C0 || root.SLWorldCore; if (!c) throw new Error('SLIslandEnv: SLWorldCore is not loaded'); return c; }
  function grid() { var g = G0 || root.SLGrid3D; if (!g) throw new Error('SLIslandEnv: SLGrid3D is not loaded'); return g; }
  function look() { var l = L0 || root.SLIslandLook; if (!l) throw new Error('SLIslandEnv: SLIslandLook is not loaded'); return l; }
  function motion() { var m = M0 || root.SLMotion; if (!m) throw new Error('SLIslandEnv: SLMotion is not loaded'); return m; }

  /* ---------------- constants ---------------- */
  var ALT_DY = 0.001;          /* alternate checker tiles sit 0.001 u higher: no z-fighting */
  var PLINTH_DY = 0.002;       /* a plinth's top sits just over the terrace tile it covers */
  var RISE_FLOOR = 0.1;        /* a rising cell starts this far under the sea surface */
  var LOCKED_EDGE = 0.2;       /* the hologram sandbar reaches this far beyond its cells */
  var FIELD_PACK = { maxShore: 4, maxLocked: 2 };
  var SEA_SIZE = 80, SKY_R = 90;
  var PLINTH_CAP = 16;
  var AIM_LIFT = 2.4, AIM_SEC = 0.3;
  var CONE_ALPHA_FACE = 0.6;   /* the open cone renders both faces: 0.2 × 0.6 per face ≈ the bible's 0.2 through the middle */

  /* land surfaces by region (meadow / cove tokens come from the LOOK land entries) */
  var SURF_FALLBACK = {
    home: { top: 'Grass Top', alt: 'Grass Alt', altTone: 0, side: 'Grass Side' },
    meadow: { top: 'Meadow Hill', alt: 'Meadow Hill', altTone: -0.025, side: 'Grass Side' },
    cove: { top: 'Cove Sand', alt: 'Cove Sand', altTone: -0.02, side: 'Wet Sand' }
  };
  function surfaces() {
    var L = L0 || root.SLIslandLook, out = {}, k;
    for (k in SURF_FALLBACK) out[k] = { top: SURF_FALLBACK[k].top, alt: SURF_FALLBACK[k].alt, altTone: SURF_FALLBACK[k].altTone, side: SURF_FALLBACK[k].side };
    var lk = L && L.LOOK;
    if (lk && lk.land_meadow) { out.meadow.top = out.meadow.alt = lk.land_meadow.colors.top; out.meadow.side = lk.land_meadow.colors.side; }
    if (lk && lk.land_cove) { out.cove.top = out.cove.alt = lk.land_cove.colors.top; out.cove.side = lk.land_cove.colors.side; }
    return out;
  }
  function hologramTokens() {
    var L = L0 || root.SLIslandLook, c = L && L.LOOK && L.LOOK.land_cove && L.LOOK.land_cove.colors;
    return { sandbar: (c && c.locked) || 'Sandbar', edge: (c && c.edge) || 'Neon Cyan' };
  }

  /* chamfered land tile: a flat 1×1 top (exactly the cell) whose bevel hangs OUTSIDE the cell, under the
     neighbour's top, so neighbours meet without grooves and the island's outer edge reads soft. No bottom.
     rings: d = outward offset of the cell square, y = depth below the top; topStrips = strips drawn in the
     top mesh (exact top colour); shade = side brightness per ring (sRGB) */
  var TILE = {
    MID: { a: 0.5, N: 1, topStrips: 1, rings: [{ d: 0, y: 0 }, { d: 0.035, y: -0.012 }, { d: 0.05, y: -0.045 }, { d: 0.05, y: -0.8 }], shade: [1, 1, 0.96, 0.8] },
    LOW: { a: 0.5, N: 1, topStrips: 1, rings: [{ d: 0, y: 0 }, { d: 0.05, y: -0.045 }, { d: 0.05, y: -0.8 }], shade: [1, 1, 0.8] }
  };
  TILE.HIGH = TILE.MID;
  /* sand skirt tile: 1.5 × 1.5 with 0.3 rounded corners, top at SAND_Y, bottom just under the sea; the
     lower rings are Wet Sand, which reads as the wet ring at the waterline */
  var SAND = {
    MID: { a: 0.45, N: 2, rings: [{ d: 0.26, y: 0, tok: 'Sand', tone: 0 }, { d: 0.3, y: -0.04, tok: 'Sand', tone: -0.03 },
      { d: 0.3, y: -0.12, tok: 'Wet Sand', tone: 0 }, { d: 0.3, y: -0.22, tok: 'Wet Sand', tone: -0.06 }] },
    LOW: { a: 0.45, N: 1, rings: [{ d: 0.26, y: 0, tok: 'Sand', tone: 0 }, { d: 0.3, y: -0.04, tok: 'Sand', tone: -0.03 },
      { d: 0.3, y: -0.22, tok: 'Wet Sand', tone: 0 }] }
  };
  SAND.HIGH = SAND.MID;

  /* the 3 fake spotlight cones: base heading (x, z) and tilt from vertical; the sweep turns the heading */
  var CONE_BASE = [{ h: [1, -0.35], tilt: 28 }, { h: [-1, -0.35], tilt: 28 }, { h: [0, -1], tilt: 18 }];
  var CONE_GEO = { r: 1.3, h: 10, radial: 16, radialLow: 12 };
  var BUOY = { lens: 0.85, apex: 0.87, bob: 0.025, hz: 0.4, tiltDeg: 2.5 };
  var POLE = { lens: 1.66, apex: 1.68 };
  var LENS_OFF = 'Holo Lemon';

  /* cloud puffs hovering over the sea BEHIND the island (z ≤ -8.5, y 4.8–6.4), drifting +x: seen from
     the 40–65° island camera they sit above the island's back edge and never cover land or items */
  var CLOUDS = [
    { x: -12, y: 5.4, z: -9.5, s: 1.5, yaw: 10 }, { x: -3, y: 6.4, z: -13.5, s: 1.9, yaw: -20 },
    { x: 8, y: 5.8, z: -11.5, s: 1.6, yaw: 35 }, { x: 15, y: 5.0, z: -8.5, s: 1.3, yaw: -5 },
    { x: -19, y: 4.8, z: -10.5, s: 1.2, yaw: 60 }
  ];
  var CLOUD_EXTENT = { x: 1.1, y: 0.62, z: 0.62 };   /* the merged puffs' half-size at scale 1 */
  var CLOUD_SPAN = 56;
  var STAR = { skyShare: 0.35, r: 80, elev: [4, 70], sea: { x: 24, zMin: -16, zMax: 12, holeX: 9.6, holeZ: 6.4 } };
  var STAR_TINTS = ['Cloud White', 'Holo Blue', 'Holo Pink', 'Holo Lemon'];

  /* every periodic light / motion in this file (Hz) — all ≤ SLMotion.MAX_FLASH_HZ (test-enforced) */
  var FREQS = {
    foamEdge: 1.3 / TAU, foamLine: 0.9 / TAU, waveBands: 0.04 / 0.45, glintMax: 1 / 1.6, spotRipple: 1.4 / TAU,
    scanLines: 0.12, edgeDashes: 0.15, starTwinkle: 2 / TAU, coneSweep: 0.12, buoyBob: BUOY.hz, seaTint: 0.03
  };

  /* ================================================================
     PURE HELPERS (no THREE; Node-testable)
     ================================================================ */
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function byCell(a, b) { var p = a.split(','), q = b.split(','); return (+p[1] - +q[1]) || (+p[0] - +q[0]); }

  /* the land set from unlocked regions ['home', …] | a world | a land set {'c,r': 1} */
  function landOf(arg) {
    var Gr = grid(), C = core();
    if (arg && !Array.isArray(arg) && typeof arg === 'object' && arg.owned && Array.isArray(arg.placed)) return C.landSet(arg);
    if (Array.isArray(arg)) return Gr.landFrom(arg.indexOf('home') >= 0 ? arg : ['home'].concat(arg));
    return Gr.landFrom(arg);
  }
  function regionsOf(land) {
    var C = core(), seen = {}, out = [];
    Object.keys(land).forEach(function (k) { var r = C.CELL_REGION[k]; if (r && !seen[r]) { seen[r] = 1; out.push(r); } });
    return out.sort(function (a, b) { return a === 'home' ? -1 : b === 'home' ? 1 : a < b ? -1 : 1; });
  }
  function landSig(land) { return Object.keys(land).sort(byCell).join(';'); }
  /* what the ground depends on in a layout: uid, id and cell of every placed item */
  function placedSig(placed) {
    return (placed || []).map(function (p) { return p.uid + ':' + p.id + ':' + p.x + ',' + p.y; }).join(';');
  }

  /* one top/side record per land cell (checker + terraces) plus a plinth for every placed item that
     straddles terraces. y is the top of the tile; w/d scale the 1×1 tile */
  function landTiles(landArg, placed) {
    var Gr = grid(), land = landOf(landArg), S = surfaces(), tops = [];
    Object.keys(land).sort(byCell).forEach(function (k) {
      var p = Gr.parseKey(k), region = Gr.regionOf(p.c, p.r) || 'home', s = S[region] || S.home;
      var alt = ((p.c + p.r) & 1) === 1;
      tops.push({
        key: k, cell: k, c: p.c, r: p.r, region: region, kind: 'cell', alt: alt,
        x: p.c - 7.5, y: Gr.surfaceY(p.c, p.r) + (alt ? ALT_DY : 0), z: p.r - 4.5, w: 1, d: 1,
        top: alt ? s.alt : s.top, tone: alt ? s.altTone : 0, side: s.side
      });
    });
    (placed || []).forEach(function (it) {
      var pl = null;
      try { pl = Gr.plinth(it.id, it.x, it.y); } catch (e) { pl = null; }
      if (!pl) return;
      /* the plinth wears the surface of the highest cell it lifts the item to */
      var hi = null;
      Gr.cellsOf(it.id, it.x, it.y).forEach(function (q) { var sy = Gr.surfaceY(q.c, q.r); if (!hi || sy > hi.s) hi = { c: q.c, r: q.r, s: sy }; });
      var region = Gr.regionOf(hi.c, hi.r) || 'meadow', s = S[region] || S.meadow;
      tops.push({
        key: 'plinth:' + it.uid, cell: 'plinth:' + it.uid, c: it.x, r: it.y, region: region, kind: 'plinth', alt: false,
        x: pl.x, y: pl.top + PLINTH_DY, z: pl.z, w: pl.w, d: pl.d, bottom: pl.bottom, top: s.top, tone: 0, side: s.side
      });
    });
    return tops;
  }
  /* cells whose sand skirt can show: any of the 8 neighbours is not land (interior skirts hide under grass) */
  function skirtCells(landArg) {
    var Gr = grid(), land = landOf(landArg), out = [];
    Object.keys(land).sort(byCell).forEach(function (k) {
      var p = Gr.parseKey(k), edge = false;
      for (var dz = -1; dz <= 1 && !edge; dz++) for (var dx = -1; dx <= 1; dx++) if ((dx || dz) && !land[(p.c + dx) + ',' + (p.r + dz)]) { edge = true; break; }
      if (edge) out.push({ key: k, cell: k, c: p.c, r: p.r, x: p.c - 7.5, z: p.r - 4.5 });
    });
    return out;
  }
  /* occupied cells (objects AND paths) from SLWorldCore.occupancy */
  function occupied(placed) {
    var occ = {};
    try { occ = core().occupancy({ placed: placed || [] }).occ || {}; } catch (e) { occ = {}; }
    return occ;
  }
  /* deterministic ground dressing on FREE unlocked cells: tufts (not on cove sand), wildflowers on
     Meadow Hill, shells and starfish on Beach Cove */
  function dressing(landArg, placed) {
    var Gr = grid(), land = landOf(landArg), occ = occupied(placed);
    var out = { tufts: [], flowers: [], shells: [], starfish: [] };
    Object.keys(land).sort(byCell).forEach(function (k) {
      if (occ[k]) return;
      var p = Gr.parseKey(k), region = Gr.regionOf(p.c, p.r) || 'home';
      function tag(list, items) { items.forEach(function (it) { it.cell = k; list.push(it); }); }
      if (region !== 'cove') tag(out.tufts, Gr.tufts(p.c, p.r));
      if (region === 'meadow') tag(out.flowers, Gr.wildflowers(p.c, p.r));
      if (region === 'cove') Gr.coveDeco(p.c, p.r).forEach(function (it) { it.cell = k; (it.kind === 'shell' ? out.shells : out.starfish).push(it); });
    });
    return out;
  }
  /* the third light pole stands behind the house (CONES.poleBehindHouse from its pivot), on the
     ground when that point is land, at sea level otherwise; the starter house spot without a house */
  function polePosition(placed, landArg) {
    var Gr = grid(), C = core(), L = look(), land = landOf(landArg), house = null, i;
    for (i = 0; i < (placed || []).length; i++) if (placed[i].id === 'house_cottage') { house = placed[i]; break; }
    if (!house) for (i = 0; i < C.STARTER.placed.length; i++) if (C.STARTER.placed[i].id === 'house_cottage') { house = C.STARTER.placed[i]; break; }
    var pv = Gr.pivot('house_cottage', house ? house.x : 6, house ? house.y : 2), off = (L.CONES && L.CONES.poleBehindHouse) || [0, 0, -1.6];
    var x = pv.x + off[0], z = pv.z + off[2], cell = Gr.worldToCell(x, z);
    return { x: x, y: Gr.inGrid(cell.c, cell.r) ? Gr.cellTop(cell.c, cell.r, land) : Gr.SEA_Y, z: z, c: cell.c, r: cell.r };
  }

  /* ---------------- tile geometry maths ---------------- */
  /* the outline of the square of half-size a offset outwards by d: 4 quarter arcs of N segments
     (d = 0 collapses each arc onto its corner). Points carry their outward horizontal normal. */
  function ringPoints(a, d, N) {
    var out = [], corners = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
    for (var k = 0; k < 4; k++) {
      for (var j = 0; j <= N; j++) {
        var th = (k * 90 + 90 * j / N) * DEG, nx = Math.cos(th), nz = Math.sin(th);
        out.push({ x: corners[k][0] * a + d * nx, z: corners[k][1] * a + d * nz, nx: nx, nz: nz });
      }
    }
    return out;
  }
  /* triangles per tile part: 'top' (cap + top strips), 'side' (the rest) or 'all' */
  function tileTris(spec, part) {
    var M = 4 * (spec.N + 1), rings = spec.rings, n = 0, ts = spec.topStrips || 0;
    if (part !== 'side') n += rings[0].d === 0 ? 2 : M;
    var from = part === 'side' ? ts : 0, to = part === 'top' ? ts : rings.length - 1;
    for (var s = from; s < to; s++) n += rings[s].d === 0 ? 8 + 4 * spec.N : 2 * M;
    return n;
  }
  /* outward profile normal of the strip from ring s to ring s+1, as (radial, y) */
  function stripNormal(r0, r1) {
    var dd = r1.d - r0.d, dy = r1.y - r0.y, l = Math.sqrt(dd * dd + dy * dy) || 1;
    return { r: -dy / l, y: dd / l };
  }

  /* ---------------- presets ---------------- */
  function hexRgb(h) { var n = parseInt(String(h).slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; }
  /* DAY / SHOW resolved to numbers: colours as sRGB [r, g, b] 0..1 (the SHOW rim mixed with the member
     colour exactly like SLIslandLook.presetAt), arrays copied, numbers as they are */
  function presetTables(member) {
    var L = look(), day = {}, show = {};
    L.PRESET_KEYS.forEach(function (key) {
      var a = L.DAY[key], b = L.SHOW[key];
      if (typeof a === 'string') {
        var bh = L.hex(b);
        if (key === 'rimColor' && L.normHex(member)) bh = L.mixHex(bh, L.normHex(member), L.SHOW.rimMember);
        day[key] = hexRgb(L.hex(a)); show[key] = hexRgb(bh);
      } else if (Array.isArray(a)) { day[key] = a.slice(); show[key] = b.slice(); }
      else { day[key] = a; show[key] = b; }
    });
    return { keys: L.PRESET_KEYS.slice(), day: day, show: show };
  }
  function presetOut(tables) {
    var out = {};
    tables.keys.forEach(function (k) { var a = tables.day[k]; out[k] = Array.isArray(a) ? a.slice() : a; });
    return out;
  }
  /* the DAY → SHOW mix for k in 0..1 into a preallocated out (no allocation: safe per frame);
     a·(1-k) + b·k so both endpoints come out exactly */
  function mixPreset(k, tables, out) {
    k = clamp01(+k || 0);
    var u = 1 - k;
    for (var i = 0; i < tables.keys.length; i++) {
      var key = tables.keys[i], a = tables.day[key], b = tables.show[key];
      if (typeof a === 'number') out[key] = a * u + b * k;
      else { var o = out[key]; for (var j = 0; j < a.length; j++) o[j] = a[j] * u + b[j] * k; }
    }
    return out;
  }

  /* ---------------- the Showtime blend ---------------- */
  function blendState(k) { k = clamp01(+k || 0); return { k: k, from: k, to: k, t: 0, dur: 0, reduced: false }; }
  /* start a blend toward target: 1.6 s inOutSine, or a 0.25 s linear crossfade under reduced motion */
  function blendTo(b, target, reduced) {
    var M = motion();
    b.from = b.k; b.to = clamp01(+target || 0); b.t = 0; b.reduced = !!reduced;
    b.dur = b.reduced ? M.SHOW_MIX_REDUCED_SEC : M.SHOW_MIX_SEC;
    return b.dur;
  }
  /* advance by dt; returns true while it moved */
  function blendStep(b, dt) {
    if (b.t >= b.dur) { b.k = b.to; return false; }
    b.t = Math.min(b.dur, b.t + (dt > 0 ? dt : 0));
    b.k = b.t >= b.dur ? b.to : motion().showMix(b.t, b.from, b.to, b.reduced);
    return true;
  }

  /* ---------------- cones, clouds, stars, shadows ---------------- */
  /* cone i's beam axis (unit, from the lamp) and its horizontal heading (for the water streak) */
  function coneAxis(i, t, reduced, out) {
    out = out || {};
    var b = CONE_BASE[i], l = Math.sqrt(b.h[0] * b.h[0] + b.h[1] * b.h[1]);
    var sw = motion().coneSweep(t, i, reduced) * DEG, c = Math.cos(sw), s = Math.sin(sw);
    var hx = b.h[0] / l, hz = b.h[1] / l, rx = hx * c - hz * s, rz = hx * s + hz * c, th = b.tilt * DEG;
    out.x = rx * Math.sin(th); out.y = Math.cos(th); out.z = rz * Math.sin(th);
    out.hx = rx; out.hz = rz;
    return out;
  }
  function cloudAt(i, t, reduced, out) {
    out = out || {};
    var c = CLOUDS[i], M = motion(), L = L0 || root.SLIslandLook;
    var speed = (L && L.TEMPO && L.TEMPO.idle && L.TEMPO.idle.cloudDrift) || 0.08;
    var x = reduced ? c.x : M.drift(t, speed, CLOUD_SPAN, c.x);
    out.x = x; out.y = c.y; out.z = c.z; out.yaw = c.yaw * DEG;
    out.s = Math.max(1e-4, c.s * (1 - M.smoothstep(CLOUD_SPAN / 2 - 6, CLOUD_SPAN / 2 - 1, Math.abs(x))));
    return out;
  }
  /* n stars: a share on the sky dome (elevation 4–70°), the rest as reflections on the night sea around
     the island (the default 40–65° camera rarely sees the sky). Deterministic. */
  function starField(n, seed) {
    var Gr = grid(), R = Gr.rng(Gr.hash(seed || 'sl-stars')), nSky = Math.round(n * STAR.skyShare);
    var out = { n: n, pos: new Float32Array(n * 3), seed: new Float32Array(n), size: new Float32Array(n), sea: new Float32Array(n), tint: new Uint8Array(n) };
    var s0 = Math.sin(STAR.elev[0] * DEG), s1 = Math.sin(STAR.elev[1] * DEG), sea = STAR.sea;
    for (var i = 0; i < n; i++) {
      var x, y, z;
      if (i < nSky) {
        var az = R() * TAU, el = Math.asin(s0 + (s1 - s0) * R());
        x = Math.cos(el) * Math.cos(az) * STAR.r; y = Math.sin(el) * STAR.r; z = Math.cos(el) * Math.sin(az) * STAR.r;
      } else {
        var guard = 0;
        do { x = (R() * 2 - 1) * sea.x; z = sea.zMin + R() * (sea.zMax - sea.zMin); guard++; }
        while (Math.abs(x) < sea.holeX && Math.abs(z) < sea.holeZ && guard < 64);
        y = Gr.SEA_Y + 0.015; out.sea[i] = 1;
      }
      out.pos[i * 3] = x; out.pos[i * 3 + 1] = y; out.pos[i * 3 + 2] = z;
      out.seed[i] = R() * TAU; out.size[i] = R(); out.tint[i] = Math.floor(R() * STAR_TINTS.length) % STAR_TINTS.length;
    }
    return out;
  }
  /* the sun's light-space basis (THREE's shadow camera looks at the target with up = +y) */
  function sunBasis(sunPos) {
    var p = sunPos || [-7, 14, 9], l = Math.sqrt(p[0] * p[0] + p[1] * p[1] + p[2] * p[2]);
    var f = [-p[0] / l, -p[1] / l, -p[2] / l];
    var r = [-f[2], 0, f[0]], rl = Math.sqrt(r[0] * r[0] + r[2] * r[2]) || 1;
    r = [r[0] / rl, 0, r[2] / rl];
    var u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
    return { f: f, r: r, u: u, dist: l };
  }
  /* the static shadow camera fitted to the unlocked land: every ground receiver (sand skirt included)
     and everything up to ITEM_MAX_H above it, plus pad. Ortho bounds in light space; near 1, far 40. */
  function shadowFit(landArg, sunPos, pad) {
    var Gr = grid(), land = landOf(landArg), B = sunBasis(sunPos), SR = Gr.SAND_REACH;
    var b = { left: Infinity, right: -Infinity, bottom: Infinity, top: -Infinity };
    pad = pad == null ? 0.4 : pad;
    Object.keys(land).forEach(function (k) {
      var p = Gr.parseKey(k), s = Gr.surfaceY(p.c, p.r);
      [p.c - 8 - SR, p.c - 7 + SR].forEach(function (x) {
        [p.r - 5 - SR, p.r - 4 + SR].forEach(function (z) {
          [Gr.SAND_Y, s + Gr.ITEM_MAX_H].forEach(function (y) {
            var lx = x * B.r[0] + y * B.r[1] + z * B.r[2], ly = x * B.u[0] + y * B.u[1] + z * B.u[2];
            if (lx < b.left) b.left = lx; if (lx > b.right) b.right = lx;
            if (ly < b.bottom) b.bottom = ly; if (ly > b.top) b.top = ly;
          });
        });
      });
    });
    return { left: b.left - pad, right: b.right + pad, bottom: b.bottom - pad, top: b.top + pad, near: 1, far: 40 };
  }

  /* ================================================================
     create(K, SL3D, opts) → env   (browser; THREE comes from K.THREE)
     ================================================================ */
  function create(K, SL3D, opts) {
    if (!K || !K.THREE || !K.G) throw new Error('SLIslandEnv.create needs the kit K');
    opts = opts || {};
    var T = K.THREE, tier = K.tier || 'MID', low = tier === 'LOW';
    var L = look(), Gr = grid(), M = motion(), C = core();
    var budget = (SL3D && SL3D.budget) || (root.SLTier && root.SLTier.budget ? root.SLTier.budget(tier, 1) : null) ||
      { stars: low ? 120 : 250, shadows: !low, shadowMapSize: tier === 'HIGH' ? 2048 : 1024 };
    var q0 = (SL3D && SL3D.quality) || {};
    var quality = { shadows: q0.shadows != null ? !!q0.shadows : !!budget.shadows, cones: q0.cones !== false, particleScale: q0.particleScale || 1 };

    /* scratch (nothing below allocates per frame) */
    var _m = new T.Matrix4(), _m2 = new T.Matrix4(), _m3 = new T.Matrix4(), _q = new T.Quaternion(), _e = new T.Euler();
    var _p = new T.Vector3(), _s = new T.Vector3(), _v2 = new T.Vector3(), _ax = new T.Vector3();
    var _c = new T.Color(), _rim = new T.Color(), _up = new T.Vector3(0, 1, 0), _one = new T.Vector3(1, 1, 1);
    var _ca = {}, _cl = {}, _lr = {};
    var WHITE = new T.Color(1, 1, 1);

    var state = {
      reduced: !!opts.reduced, animT: 0, frame: 0, landFrame: -1, disposed: false,
      land: {}, sig: null, placed: [], psig: null, k: 0, applied: false, exposure: 1, shadowDirty: true,
      member: opts.member || null, pr: 0, clear: new T.Color(-1, -1, -1), aimK: 0, aimTo: 0, motionDirty: true
    };
    var blend = blendState(opts.show || 0);
    var PT = presetTables(state.member), P = presetOut(PT);
    var rise = null, fieldFade = null, renderer = opts.renderer || null;
    var aimPt = new T.Vector3();

    var group = new T.Group();
    group.name = 'env';
    var owned = { geos: [], mats: [], texs: [] };

    /* ---------------- colours ---------------- */
    var colCache = new Map();
    function colorOf(token, tn) {
      var key = token + '|' + (tn || 0), c = colCache.get(key);
      if (!c) { c = tn ? K.tone(token, tn) : K.col(token); colCache.set(key, c); }
      return c;
    }
    function setSRGB(c, a) { c.setRGB(a[0], a[1], a[2], T.SRGBColorSpace); return c; }

    /* ---------------- lights + fog ---------------- */
    var hemi = new T.HemisphereLight(0xffffff, 0xffffff, 1);
    hemi.name = 'env:hemi';
    var sun = new T.DirectionalLight(0xffffff, 1);
    sun.name = 'env:sun';
    var sunPos = L.DAY.sunPos || [-7, 14, 9];
    sun.position.set(sunPos[0], sunPos[1], sunPos[2]);
    sun.target.position.set(0, 0, 0);
    sun.castShadow = !!budget.shadows && quality.shadows;
    sun.shadow.mapSize.set(budget.shadowMapSize || 1024, budget.shadowMapSize || 1024);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    /* static map: the stage sets renderer.shadowMap.autoUpdate = false and beforeRender() raises
       renderer.shadowMap.needsUpdate once per change (sun.shadow.autoUpdate stays true, or three
       would skip this light even when the renderer asks for a refresh) */
    var sc = sun.shadow.camera;
    sc.left = -10; sc.right = 10; sc.top = 7; sc.bottom = -7; sc.near = 1; sc.far = 40;
    sc.updateProjectionMatrix();
    group.add(hemi, sun, sun.target);
    var fog = new T.Fog(0xffffff, 30, 70);
    if (opts.scene) opts.scene.fog = fog;

    /* ---------------- geometry (cached in K.parts per tier; K disposes them) ---------------- */
    function tileGeometry(spec, part, ringColor, capColor) {
      var rings = spec.rings, Mn = 4 * (spec.N + 1), pts = rings.map(function (r) { return ringPoints(spec.a, r.d, spec.N); });
      var P3 = [], N3 = [], C3 = [];
      function vtx(i, j, pn) {
        var p = pts[i][j], nx = pn.r * p.nx, ny = pn.y, nz = pn.r * p.nz, l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        return { x: p.x, y: rings[i].y, z: p.z, nx: nx / l, ny: ny / l, nz: nz / l, c: ringColor(i) };
      }
      function tri(a, b, c) {
        var ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z, vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
        var gx = uy * vz - uz * vy, gy = uz * vx - ux * vz, gz = ux * vy - uy * vx;
        if (gx * gx + gy * gy + gz * gz < 1e-14) return;                      /* degenerate (collapsed corner) */
        if (gx * (a.nx + b.nx + c.nx) + gy * (a.ny + b.ny + c.ny) + gz * (a.nz + b.nz + c.nz) < 0) { var t = b; b = c; c = t; }
        [a, b, c].forEach(function (v) { P3.push(v.x, v.y, v.z); N3.push(v.nx, v.ny, v.nz); C3.push(v.c.r, v.c.g, v.c.b); });
      }
      if (part !== 'side') {
        var y0 = rings[0].y, cc = capColor, up = function (p) { return { x: p.x, y: y0, z: p.z, nx: 0, ny: 1, nz: 0, c: cc }; };
        if (rings[0].d === 0) {
          var k0 = pts[0], step = spec.N + 1;
          tri(up(k0[0]), up(k0[step]), up(k0[2 * step]));
          tri(up(k0[0]), up(k0[2 * step]), up(k0[3 * step]));
        } else {
          var ctr = { x: 0, y: y0, z: 0, nx: 0, ny: 1, nz: 0, c: cc };
          for (var j = 0; j < Mn; j++) tri(ctr, up(pts[0][j]), up(pts[0][(j + 1) % Mn]));
        }
      }
      var from = part === 'side' ? (spec.topStrips || 0) : 0, to = part === 'top' ? (spec.topStrips || 0) : rings.length - 1;
      for (var s = from; s < to; s++) {
        var pn = stripNormal(rings[s], rings[s + 1]);
        for (var jj = 0; jj < Mn; jj++) {
          var jn = (jj + 1) % Mn, A = vtx(s, jj, pn), B = vtx(s, jn, pn), Cq = vtx(s + 1, jn, pn), D = vtx(s + 1, jj, pn);
          tri(A, D, Cq); tri(A, Cq, B);
        }
      }
      var g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(P3, 3));
      g.setAttribute('normal', new T.Float32BufferAttribute(N3, 3));
      g.setAttribute('color', new T.Float32BufferAttribute(C3, 3));
      return g;
    }
    function grey(v) { return new T.Color().setRGB(v, v, v, T.SRGBColorSpace); }
    var GEO = K.parts.get('env:geo:v' + VERSION, tier, function (Kt) {
      var G = Kt.G, lw = Kt.tier === 'LOW', ts = TILE[Kt.tier] || TILE.MID, ss = SAND[Kt.tier] || SAND.MID;
      var shades = ts.shade.map(grey), white = new T.Color(1, 1, 1);
      var sandCols = ss.rings.map(function (r) { return r.tone ? Kt.tone(r.tok, r.tone) : Kt.col(r.tok); });
      var out = {};
      out.tileTop = tileGeometry(ts, 'top', function () { return white; }, white);
      out.tileSide = tileGeometry(ts, 'side', function (i) { return shades[i]; }, white);
      out.sand = tileGeometry({ a: ss.a, N: ss.N, rings: ss.rings, topStrips: 0 }, 'all', function (i) { return sandCols[i]; }, sandCols[0]);

      /* grass tuft: 3 flattened, fanned blades (2 on LOW) */
      var blades = [], nb = lw ? 2 : 3;
      for (var i = 0; i < nb; i++) {
        var b = G.t(G.cone(0.03, 0.16, 3), { p: [0, 0.08, 0] });
        G.t(b, { s: [1, 1, 0.45] });
        G.t(b, { r: [0, 0, (i - (nb - 1) / 2) * 24] });
        G.t(b, { r: [0, i * 60 + 15, 0], p: [Math.cos(i * 2.1) * 0.02, 0, Math.sin(i * 2.1) * 0.02] });
        G.paintBy(b, function (v) { return v.y > 0.1 ? ['Tuft Green', 'hi'] : v.y < 0.03 ? ['Tuft Green', 'shade'] : 'Tuft Green'; });
        blades.push(b);
      }
      out.tuft = G.merge(blades);
      /* wildflower: a little disc with a Butter centre (instance colour = its token) */
      out.flower = G.t(G.tube(0.045, 0.05, 0.022, { radial: lw ? 5 : 6 }), { p: [0, 0.013, 0] });
      G.paintBy(out.flower, function (v) { return v.y > 0.02 && Math.abs(v.x) + Math.abs(v.z) < 0.012 ? 'Butter' : 'Cloud White'; });
      /* shell: a ridged scallop dome */
      out.shell = G.t(G.tube(0, 0.065, 0.035, { radial: 7 }), { s: [1, 1, 0.8], p: [0, 0.0175, 0] });
      G.paintBy(out.shell, function (v) { return v.face % 2 ? ['Blossom Light', 'hi'] : 'Blossom Light'; }, { perFace: true });
      /* starfish: a low 10-sided cone with every other rim point pinched in → a puffy 5-point star */
      var sf = G.t(G.cone(0.085, 0.03, 10), { p: [0, 0.015, 0] }), sp = sf.getAttribute('position');
      for (var v = 0; v < sp.count; v++) {
        var x = sp.getX(v), y = sp.getY(v), z = sp.getZ(v);
        if (Math.abs(y) > 1e-4 || x * x + z * z < 1e-8) continue;
        var kk = Math.round(Math.atan2(x, z) / (TAU / 10));
        if (((kk % 2) + 2) % 2 === 1) sp.setXYZ(v, x * 0.42, y, z * 0.42);
      }
      sp.needsUpdate = true;
      out.starfish = G.facet(sf);
      G.paintBy(out.starfish, function (p) { return p.y > 0.02 ? ['Peach Coral', 'hi'] : 'Peach Coral'; });

      /* stage buoy: a floating Cloud White ball with a Bubblegum band, collar, mast and lamp housing */
      var body = G.t(G.puff(0.32, { sphere: true }), { s: [1, 0.62, 1], p: [0, 0.06, 0] });
      G.paintBy(body, function (p) { return p.y > 0.1 && p.y < 0.18 ? 'Bubblegum' : p.y >= 0.18 ? ['Cloud White', 'hi'] : 'Cloud White'; });
      var collar = G.paint(G.t(G.ring(0.19, 0.035), { r: [90, 0, 0], p: [0, 0.24, 0] }), 'Pebble');
      var mast = G.paint(G.t(G.tube(0.04, 0.05, 0.42), { p: [0, 0.48, 0] }), 'Pole');
      var lamp = function (y) {
        return G.paintBy(G.t(G.tube(0.11, 0.09, 0.15), { p: [0, y, 0] }), function (p) { return p.ny > 0.7 ? ['Lamp Post', 'hi'] : 'Lamp Post'; });
      };
      out.buoy = G.merge([body, collar, mast, lamp(0.765)]);
      /* the light pole behind the house */
      var base = G.paintBy(G.t(G.tube(0.13, 0.17, 0.08), { p: [0, 0.04, 0] }), function (p) { return p.ny > 0.7 ? ['Pebble', 'hi'] : 'Pebble'; });
      var pole = G.paint(G.t(G.tube(0.035, 0.045, 1.42), { p: [0, 0.79, 0] }), 'Pole');
      out.pole = G.merge([base, pole, lamp(1.575)]);
      /* lamp lens (state material: off Holo Lemon by day → its neon at Showtime) */
      out.lens = G.paint(G.tube(0.088, 0.088, 0.022), 'Cloud White');
      /* cloud: merged puffs, a soft grey belly */
      var puffs = [[0.62, 0, 0, 0], [0.46, -0.62, -0.12, 0.06], [0.5, 0.62, -0.1, -0.05], [0.38, 0.22, 0.34, 0.12], [0.34, -0.3, 0.26, -0.1]];
      out.cloud = G.merge(puffs.slice(0, lw ? 4 : 5).map(function (p) { return G.t(G.puff(p[0]), { p: [p[1], p[2], p[3]], s: [1, 0.82, 1] }); }));
      G.paintBy(out.cloud, function (p) { return p.y < -0.2 ? ['Cloud White', 'shade'] : 'Cloud White'; });
      return out;
    });

    /* ---------------- instanced layers ---------------- */
    function newIM(geo, mat, cap) {
      var m = new T.InstancedMesh(geo, mat, cap);
      m.instanceColor = new T.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
      m.count = 0; m.frustumCulled = false; m.visible = false;
      return m;
    }
    var layers = [];
    function layer(name, geo, matKey, cap, o) {
      o = o || {};
      var Ly = { name: name, geo: geo, mat: K.mat(matKey), cap: Math.max(1, cap), recs: [], receive: o.receive !== false, order: o.order || 0 };
      Ly.mesh = newIM(geo, Ly.mat, Ly.cap);
      decorate(Ly);
      group.add(Ly.mesh);
      layers.push(Ly);
      return Ly;
    }
    function decorate(Ly) {
      Ly.mesh.name = 'env:' + Ly.name; Ly.mesh.castShadow = false; Ly.mesh.receiveShadow = Ly.receive; Ly.mesh.renderOrder = Ly.order;
    }
    function grow(Ly, n) {
      var cap = Math.max(n, Ly.cap * 2), old = Ly.mesh;
      Ly.mesh = newIM(Ly.geo, Ly.mat, cap);
      decorate(Ly);
      group.remove(old);
      group.add(Ly.mesh);
      old.dispose();
      Ly.cap = cap;
    }
    function writeRec(Ly, i, dy) {
      var r = Ly.recs[i];
      _p.set(r.x, r.y + dy, r.z);
      _q.setFromAxisAngle(_up, r.yaw || 0);
      _s.set(r.sx || 1, r.sy || 1, r.sz || 1);
      _m.compose(_p, _q, _s);
      Ly.mesh.setMatrixAt(i, _m);
    }
    function fill(Ly, list) {
      if (list.length > Ly.cap) grow(Ly, list.length);
      Ly.recs = list;
      for (var i = 0; i < list.length; i++) { writeRec(Ly, i, 0); Ly.mesh.setColorAt(i, list[i].color || WHITE); }
      Ly.mesh.count = list.length;
      Ly.mesh.visible = list.length > 0;
      Ly.mesh.instanceMatrix.needsUpdate = true;
      Ly.mesh.instanceColor.needsUpdate = true;
    }
    /* a record: base transform + colour + the cell it rides with during a rise */
    function rec(x, y, z, yaw, sx, sy, sz, color, cell) {
      return { x: x, y: y, z: z, yaw: yaw || 0, sx: sx, sy: sy, sz: sz, color: color, cell: cell, rise: y - Gr.SEA_Y + RISE_FLOOR };
    }

    var NCELLS = 0;
    Object.keys(C.REGION_CELLS).forEach(function (rk) { NCELLS += C.REGION_CELLS[rk].length; });
    var sandL = layer('sand', GEO.sand, 'toon', NCELLS, { order: 0 });
    var sideL = layer('landSide', GEO.tileSide, 'toon', NCELLS + PLINTH_CAP);
    var topL = layer('landTop', GEO.tileTop, 'toon', NCELLS + PLINTH_CAP);
    var tuftL = layer('tufts', GEO.tuft, 'toon', NCELLS * 2);
    var flowerL = layer('flowers', GEO.flower, 'toon', 96);
    var shellL = layer('shells', GEO.shell, 'toon', 64);
    var starfishL = layer('starfish', GEO.starfish, 'toon', 64);
    var groundLayers = [sandL, sideL, topL, tuftL, flowerL, shellL, starfishL];

    /* ---------------- buoys, pole, lenses ---------------- */
    var BUOYS = (L.CONES && L.CONES.buoys) || [[-9.5, -0.32, -6.5], [9.5, -0.32, -6.5]];
    var buoyM = newIM(GEO.buoy, K.mat('toon'), 2); buoyM.name = 'env:buoys'; buoyM.count = 2; buoyM.visible = true; buoyM.receiveShadow = false;
    var poleM = newIM(GEO.pole, K.mat('toon'), 1); poleM.name = 'env:pole'; poleM.count = 1; poleM.visible = true;
    var lensM = newIM(GEO.lens, K.mat('state'), 3); lensM.name = 'env:lenses'; lensM.count = 3; lensM.visible = true;
    buoyM.instanceMatrix.setUsage(T.DynamicDrawUsage); lensM.instanceMatrix.setUsage(T.DynamicDrawUsage);
    group.add(buoyM, poleM, lensM);
    var coneTokens = (L.CONES && L.CONES.tokens) || ['Neon Pink', 'Neon Cyan', 'Neon Violet'];
    var lensOn = coneTokens.map(function (t) { return K.col(t); }), lensOff = K.col(LENS_OFF);
    var polePt = { x: -1, y: 0, z: -3.6 };
    var buoyMat = [new T.Matrix4(), new T.Matrix4()], sources = [new T.Vector3(), new T.Vector3(), new T.Vector3()];
    var buoyPhase = [Gr.hash01('buoy:0'), Gr.hash01('buoy:1')];

    /* ---------------- clouds ---------------- */
    var nClouds = low ? 4 : CLOUDS.length;
    var cloudM = newIM(GEO.cloud, K.mat('toon'), nClouds);
    cloudM.name = 'env:clouds'; cloudM.count = nClouds; cloudM.visible = true; cloudM.receiveShadow = false;
    cloudM.instanceMatrix.setUsage(T.DynamicDrawUsage);
    group.add(cloudM);

    /* ---------------- sky ---------------- */
    var skyGeo = new T.SphereGeometry(SKY_R, low ? 16 : 24, low ? 8 : 12);
    var skyU = { uTop: { value: new T.Color() }, uMid: { value: new T.Color() }, uHorizon: { value: new T.Color() }, uBelow: { value: new T.Color() } };
    var skyMat = new T.ShaderMaterial({
      name: 'env:sky', uniforms: skyU, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG,
      side: T.BackSide, depthWrite: false, fog: false
    });
    var sky = new T.Mesh(skyGeo, skyMat);
    sky.name = 'env:sky'; sky.renderOrder = -10; sky.frustumCulled = false;
    owned.geos.push(skyGeo); owned.mats.push(skyMat);

    /* ---------------- sea ---------------- */
    var FW = Gr.FIELD.w, FH = Gr.FIELD.h;
    function fieldTex() {
      var t = new T.DataTexture(new Uint8Array(FW * FH * 2), FW, FH, T.RGFormat, T.UnsignedByteType);
      t.minFilter = T.LinearFilter; t.magFilter = T.LinearFilter; t.generateMipmaps = false;
      t.wrapS = T.ClampToEdgeWrapping; t.wrapT = T.ClampToEdgeWrapping; t.flipY = false;
      t.needsUpdate = true;
      owned.texs.push(t);
      return t;
    }
    var fieldCur = fieldTex(), fieldPrev = fieldTex();
    var HT = hologramTokens();
    var seaU = T.UniformsUtils.merge([T.UniformsLib.fog, {
      uField: { value: null }, uFieldPrev: { value: null }, uFieldMix: { value: 1 },
      uFieldRect: { value: new T.Vector4(Gr.FIELD.x0, Gr.FIELD.z0, 1 / (FW * Gr.FIELD.texel), 1 / (FH * Gr.FIELD.texel)) },
      uFieldMax: { value: new T.Vector2(FIELD_PACK.maxShore, FIELD_PACK.maxLocked) },
      uTime: { value: 0 }, uShow: { value: 0 }, uGlints: { value: 1 }, uSpots: { value: 0 },
      uSandReach: { value: Gr.SAND_REACH }, uLockedEdge: { value: LOCKED_EDGE }, uHalf: { value: SEA_SIZE / 2 },
      uShallow: { value: new T.Color() }, uDeep: { value: new T.Color() }, uFoam: { value: new T.Color() }, uWave: { value: new T.Color() },
      uSandbar: { value: new T.Color() }, uEdge: { value: new T.Color() }, uFogCol: { value: new T.Color() },
      uSpotColA: { value: new T.Color() }, uSpotColB: { value: new T.Color() },
      uSpotA: { value: new T.Vector4(0, 0, 1, 0) }, uSpotB: { value: new T.Vector4(0, 0, -1, 0) }
    }]);
    seaU.uField.value = fieldCur; seaU.uFieldPrev.value = fieldPrev;   /* after merge: textures are shared, not cloned */
    seaU.uSandbar.value.copy(K.col(HT.sandbar)); seaU.uEdge.value.copy(K.col(HT.edge));
    seaU.uSpotColA.value.copy(lensOn[0]); seaU.uSpotColB.value.copy(lensOn[1]);
    var seaMat = new T.ShaderMaterial({
      name: 'env:sea', uniforms: seaU, vertexShader: SEA_VERT, fragmentShader: SEA_FRAG, fog: true,
      defines: low ? { ENV_LOW: 1 } : {}
    });
    var seaGeo = new T.PlaneGeometry(SEA_SIZE, SEA_SIZE, 1, 1);
    seaGeo.rotateX(-Math.PI / 2);
    var sea = new T.Mesh(seaGeo, seaMat);
    sea.name = 'env:sea'; sea.position.y = Gr.SEA_Y; sea.frustumCulled = false;
    owned.geos.push(seaGeo); owned.mats.push(seaMat);

    /* ---------------- stars ---------------- */
    var nStars = Math.max(1, budget.stars || (low ? 120 : 250));
    var SF = starField(nStars);
    var starGeo = new T.BufferGeometry(), tintArr = new Float32Array(nStars * 3);
    var tintCols = STAR_TINTS.map(function (t) { return K.col(t); });
    for (var si = 0; si < nStars; si++) tintCols[SF.tint[si]].toArray(tintArr, si * 3);
    starGeo.setAttribute('position', new T.BufferAttribute(SF.pos, 3));
    starGeo.setAttribute('aSeed', new T.BufferAttribute(SF.seed, 1));
    starGeo.setAttribute('aSize', new T.BufferAttribute(SF.size, 1));
    starGeo.setAttribute('aSea', new T.BufferAttribute(SF.sea, 1));
    starGeo.setAttribute('aTint', new T.BufferAttribute(tintArr, 3));
    var starU = { uTime: { value: 0 }, uPR: { value: 1 }, uSize: { value: 2 }, uAlpha: { value: 0 }, uFogNear: { value: 30 }, uFogFar: { value: 70 } };
    var starMat = new T.ShaderMaterial({
      name: 'env:stars', uniforms: starU, vertexShader: STAR_VERT, fragmentShader: STAR_FRAG,
      transparent: true, depthWrite: false, blending: T.AdditiveBlending, fog: false
    });
    var stars = new T.Points(starGeo, starMat);
    stars.name = 'env:stars'; stars.frustumCulled = false; stars.renderOrder = 2; stars.visible = false;
    owned.geos.push(starGeo); owned.mats.push(starMat);

    /* ---------------- spotlight cones ---------------- */
    var coneGeo = new T.ConeGeometry(CONE_GEO.r, CONE_GEO.h, low ? CONE_GEO.radialLow : CONE_GEO.radial, 1, true);
    coneGeo.rotateX(Math.PI);                       /* apex down … */
    coneGeo.translate(0, CONE_GEO.h / 2, 0);        /* … at the lamp; the wide end 10 u along +y */
    var coneU = { uAlpha: { value: 0 }, uLen: { value: CONE_GEO.h }, uFogNear: { value: 30 }, uFogFar: { value: 70 } };
    var coneMat = new T.ShaderMaterial({
      name: 'env:cones', uniforms: coneU, vertexShader: CONE_VERT, fragmentShader: CONE_FRAG,
      transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide, fog: false
    });
    var cones = new T.InstancedMesh(coneGeo, coneMat, 3);
    cones.instanceColor = new T.InstancedBufferAttribute(new Float32Array(9), 3);
    for (var ci = 0; ci < 3; ci++) cones.setColorAt(ci, lensOn[ci] || lensOn[0]);
    cones.instanceMatrix.setUsage(T.DynamicDrawUsage);
    cones.name = 'env:cones'; cones.frustumCulled = false; cones.renderOrder = 4; cones.visible = false;
    owned.geos.push(coneGeo); owned.mats.push(coneMat);

    group.add(sky, stars, sea, cones);
    owned.meshes = [buoyM, poleM, lensM, cloudM, cones];

    /* ================================================================
       DAY ↔ SHOW
       ================================================================ */
    function coneLevel() { return P.cones * (quality.cones ? 1 : 0); }
    function applyShow(k, force) {
      k = clamp01(+k || 0);
      if (!force && state.applied && k === state.k) return;
      state.k = k; state.applied = true;
      mixPreset(k, PT, P);
      setSRGB(hemi.color, P.hemiSky); setSRGB(hemi.groundColor, P.hemiGround); hemi.intensity = P.hemiIntensity;
      setSRGB(sun.color, P.sunColor); sun.intensity = P.sunIntensity;
      setSRGB(fog.color, P.fogColor); fog.near = P.fogNear; fog.far = P.fogFar;
      state.exposure = P.exposure;
      K.setRim(setSRGB(_rim, P.rimColor), P.rimStrength);
      setSRGB(skyU.uTop.value, P.skyTop); setSRGB(skyU.uMid.value, P.skyMid); setSRGB(skyU.uHorizon.value, P.skyHorizon);
      skyU.uBelow.value.copy(fog.color);
      setSRGB(seaU.uShallow.value, P.seaShallow); setSRGB(seaU.uDeep.value, P.seaDeep);
      setSRGB(seaU.uFoam.value, P.foam); setSRGB(seaU.uWave.value, P.waveLine);
      seaU.uFogCol.value.copy(fog.color);
      seaU.uShow.value = k; seaU.uGlints.value = P.glints;
      starU.uAlpha.value = P.stars; starU.uFogNear.value = coneU.uFogNear.value = P.fogNear; starU.uFogFar.value = coneU.uFogFar.value = P.fogFar;
      stars.visible = P.stars > 0.002;
      var cl = coneLevel();
      coneU.uAlpha.value = 0.2 * CONE_ALPHA_FACE * cl;
      seaU.uSpots.value = cl;                             /* the water streaks belong to the beams */
      if (cl > 0.002 && !cones.visible) state.motionDirty = true;
      cones.visible = cl > 0.002;
      K.setShow(k);                                       /* neon sleeves 0 → 0.45, halos 1 → 1.6× / 0.5 → 0.9 */
      for (var i = 0; i < 3; i++) lensM.setColorAt(i, _c.copy(lensOff).lerp(lensOn[i] || lensOn[0], k));
      lensM.instanceColor.needsUpdate = true;
    }

    /* ================================================================
       LAND
       ================================================================ */
    function bake(land) {
      var packed = Gr.packField(Gr.bakeField(land), FIELD_PACK);
      fieldPrev.image.data.set(fieldCur.image.data);
      fieldCur.image.data.set(packed);
      fieldPrev.needsUpdate = true; fieldCur.needsUpdate = true;
    }
    function fitShadows() {
      var f = shadowFit(state.land, sunPos);
      sc.left = f.left; sc.right = f.right; sc.top = f.top; sc.bottom = f.bottom; sc.near = f.near; sc.far = f.far;
      sc.updateProjectionMatrix();
    }
    function landWithout(region) {
      var out = {};
      Object.keys(state.land).forEach(function (k) { if (C.CELL_REGION[k] !== region) out[k] = 1; });
      return out;
    }
    /* sand skirt: the final land's boundary, plus (during a rise) the old shore's, so it stays until the end */
    function rebuildSand(extraLand) {
      var seen = {}, list = [];
      function add(cells) {
        cells.forEach(function (p) { if (!seen[p.key]) { seen[p.key] = 1; list.push(rec(p.x, Gr.SAND_Y, p.z, 0, 1, 1, 1, WHITE, p.key)); } });
      }
      add(skirtCells(state.land));
      if (extraLand) add(skirtCells(extraLand));
      fill(sandL, list);
    }
    function rebuildGround() {
      var tops = landTiles(state.land, state.placed), topList = [], sideList = [];
      tops.forEach(function (t) {
        topList.push(rec(t.x, t.y, t.z, 0, t.w, 1, t.d, colorOf(t.top, t.tone), t.cell));
        sideList.push(rec(t.x, t.y, t.z, 0, t.w, 1, t.d, colorOf(t.side, 0), t.cell));
      });
      fill(topL, topList); fill(sideL, sideList);
      rebuildSand(rise ? rise.extra : null);
      var dr = dressing(state.land, state.placed);
      fill(tuftL, dr.tufts.map(function (p) { return rec(p.x, p.y, p.z, p.yaw, p.s, p.s, p.s, WHITE, p.cell); }));
      fill(flowerL, dr.flowers.map(function (p) { return rec(p.x, p.y, p.z, p.yaw, p.s, p.s, p.s, colorOf(p.token, 0), p.cell); }));
      fill(shellL, dr.shells.map(function (p) { return rec(p.x, p.y, p.z, p.yaw, p.s, p.s, p.s, WHITE, p.cell); }));
      fill(starfishL, dr.starfish.map(function (p) { return rec(p.x, p.y, p.z, p.yaw, p.s, p.s, p.s, WHITE, p.cell); }));
      if (rise) { collectRise(); applyRise(rise.t); }
    }
    function placePole() {
      var pp = polePosition(state.placed, state.land);
      polePt.x = pp.x; polePt.y = pp.y; polePt.z = pp.z;
      _m.makeTranslation(pp.x, pp.y, pp.z);
      poleM.setMatrixAt(0, _m);
      poleM.instanceMatrix.needsUpdate = true;
      state.motionDirty = true;
    }
    /* layout changes rebuild the ground only when a uid / id / cell actually changed (the controller
       may call this on every sync); house restyles go through invalidateShadows() instead */
    function setPlaced(placed, force) {
      if (state.disposed) return;
      var list = Array.isArray(placed) ? placed.slice() : [], sig = placedSig(list);
      if (!force && sig === state.psig) return;
      state.placed = list; state.psig = sig;
      rebuildGround();
      placePole();
      invalidateShadows();
    }
    function setLand(unlocked, world, o) {
      if (state.disposed) return null;
      o = o || {};
      if (unlocked == null && world) unlocked = world;
      var land = landOf(unlocked == null ? ['home'] : unlocked), sig = landSig(land), changed = sig !== state.sig;
      if (changed) {
        var first = state.sig === null;
        state.land = land; state.sig = sig; state.landFrame = state.frame;
        bake(land);
        fieldFade = null;
        seaU.uFieldMix.value = 1;                       /* a rise below crossfades it from the old field */
        if (first) fieldPrev.image.data.set(fieldCur.image.data);
        fitShadows();
      }
      var placed = world && Array.isArray(world.placed) ? world.placed : state.placed;
      setPlaced(placed, changed);
      if (o.rise) return startRise(o.rise, o.reduced != null ? !!o.reduced : state.reduced, changed);
      return null;
    }

    /* ---------------- the unlock rise ---------------- */
    function collectRise() {
      rise.lists = groundLayers.map(function (Ly) {
        var idx = [];
        for (var i = 0; i < Ly.recs.length; i++) if (rise.delays[Ly.recs[i].cell] != null) idx.push(i);
        return idx;
      });
    }
    function applyRise(t) {
      for (var li = 0; li < groundLayers.length; li++) {
        var Ly = groundLayers[li], idx = rise.lists[li];
        if (!idx || !idx.length) continue;
        for (var k = 0; k < idx.length; k++) {
          var r = Ly.recs[idx[k]];
          M.landRise(t, rise.delays[r.cell], rise.reduced, _lr);
          writeRec(Ly, idx[k], -r.rise * (1 - _lr.y01));
        }
        Ly.mesh.instanceMatrix.needsUpdate = true;
      }
    }
    function startRise(region, reduced, fadeField) {
      if (!C.REGION_CELLS[region] || region === 'home') return null;
      finishRise();
      var order = Gr.riseOrder(region, state.land), delays = {}, cells = [];
      order.forEach(function (p) {
        delays[p.key] = p.delay;
        var ctr = Gr.cellCenter(p.c, p.r);
        cells.push({ c: p.c, r: p.r, key: p.key, x: ctr.x, y: ctr.y, z: ctr.z, delay: reduced ? 0 : p.delay });
      });
      var dur = reduced ? M.SHOW_MIX_REDUCED_SEC : M.riseDur(order.length), done;
      var handle = { region: region, cells: cells, dur: dur, done: false, promise: null, cancel: function () { if (rise && rise.handle === handle) finishRise(); } };
      handle.promise = typeof Promise === 'function' ? new Promise(function (res) { done = res; }) : null;
      rise = { region: region, t: 0, dur: dur, reduced: reduced, delays: delays, lists: null, handle: handle, resolve: done, extra: reduced ? null : landWithout(region) };
      rebuildSand(rise.extra);
      collectRise();
      applyRise(0);
      if (fadeField) { seaU.uFieldMix.value = 0; fieldFade = { t: 0, dur: Math.max(dur, M.SHOW_MIX_REDUCED_SEC) }; }
      return handle;
    }
    function finishRise() {
      if (!rise) return;
      var r = rise;
      applyRise(1e6);
      rise = null;
      rebuildSand(null);
      invalidateShadows();
      r.handle.done = true;
      if (r.resolve) r.resolve(r.handle);
    }
    function riseRegion(region, o) {
      if (state.disposed || !C.REGION_CELLS[region] || region === 'home') return null;
      o = o || {};
      var reduced = o.reduced != null ? !!o.reduced : state.reduced;
      var has = C.REGION_CELLS[region].every(function (k) { return state.land[k]; });
      if (!has) return setLand(regionsOf(state.land).concat([region]), null, { rise: region, reduced: reduced });
      return startRise(region, reduced, state.landFrame === state.frame);
    }

    /* ================================================================
       PER FRAME
       ================================================================ */
    function updateClouds() {
      for (var i = 0; i < nClouds; i++) {
        cloudAt(i, state.animT, state.reduced, _cl);
        _p.set(_cl.x, _cl.y, _cl.z); _q.setFromAxisAngle(_up, _cl.yaw); _s.set(_cl.s, _cl.s, _cl.s);
        cloudM.setMatrixAt(i, _m.compose(_p, _q, _s));
      }
      cloudM.instanceMatrix.needsUpdate = true;
    }
    function updateBuoys() {
      var t = state.animT, red = state.reduced;
      for (var i = 0; i < 2; i++) {
        var b = BUOYS[i], ph = buoyPhase[i], w = TAU * (BUOY.hz * t + ph);
        var dy = red ? 0 : BUOY.bob * Math.sin(w);
        var tx = red ? 0 : BUOY.tiltDeg * DEG * Math.sin(w * 0.8 + 1.3), tz = red ? 0 : BUOY.tiltDeg * DEG * Math.cos(w * 0.7);
        _e.set(tx, ph * TAU, tz, 'XYZ'); _q.setFromEuler(_e); _p.set(b[0], Gr.SEA_Y + dy, b[2]);
        buoyMat[i].compose(_p, _q, _one);
        buoyM.setMatrixAt(i, buoyMat[i]);
        _m2.makeTranslation(0, BUOY.lens, 0);
        lensM.setMatrixAt(i, _m3.multiplyMatrices(buoyMat[i], _m2));
        sources[i].set(0, BUOY.apex, 0).applyMatrix4(buoyMat[i]);
      }
      lensM.setMatrixAt(2, _m3.makeTranslation(polePt.x, polePt.y + POLE.lens, polePt.z));
      sources[2].set(polePt.x, polePt.y + POLE.apex, polePt.z);
      buoyM.instanceMatrix.needsUpdate = true;
      lensM.instanceMatrix.needsUpdate = true;
    }
    function updateCones() {
      var ak = state.aimK;
      for (var i = 0; i < 3; i++) {
        coneAxis(i, state.animT, state.reduced, _ca);
        _ax.set(_ca.x, _ca.y, _ca.z);
        if (ak > 0) {
          _v2.copy(aimPt).sub(sources[i]).normalize();
          _ax.lerp(_v2, M.ease.inOutSine(ak)).normalize();
        }
        _q.setFromUnitVectors(_up, _ax);
        cones.setMatrixAt(i, _m.compose(sources[i], _q, _one));
        if (i < 2) {
          var hl = Math.sqrt(_ax.x * _ax.x + _ax.z * _ax.z) || 1, sp = i === 0 ? seaU.uSpotA.value : seaU.uSpotB.value;
          sp.set(sources[i].x, sources[i].z, _ax.x / hl, _ax.z / hl);
        }
      }
      cones.instanceMatrix.needsUpdate = true;
    }
    function update(dt, t, showK) {
      if (state.disposed) return false;
      dt = typeof dt === 'number' && dt > 0 ? Math.min(dt, 0.1) : 0;
      state.frame++;
      if (!state.reduced) state.animT += dt;
      var busy = false;
      if (typeof showK === 'number' && isFinite(showK)) {
        var k = clamp01(showK);
        blend.k = blend.from = blend.to = k; blend.t = blend.dur = 0;
        applyShow(k);
      } else if (blendStep(blend, dt)) { applyShow(blend.k); busy = true; }
      if (rise) {
        rise.t += dt;
        if (rise.t >= rise.dur) finishRise(); else applyRise(rise.t);
        busy = true;
      }
      if (fieldFade) {
        fieldFade.t += dt;
        seaU.uFieldMix.value = clamp01(fieldFade.t / fieldFade.dur);
        if (fieldFade.t >= fieldFade.dur) fieldFade = null;
        busy = true;
      }
      if (state.aimK !== state.aimTo) {
        var stp = dt / AIM_SEC;
        state.aimK = state.aimTo > state.aimK ? Math.min(state.aimTo, state.aimK + stp) : Math.max(state.aimTo, state.aimK - stp);
        state.motionDirty = true; busy = true;
      }
      seaU.uTime.value = state.animT;
      starU.uTime.value = state.animT;
      if (!state.reduced || state.motionDirty) {
        updateClouds();
        updateBuoys();
        if (cones.visible) updateCones();
        state.motionDirty = false;
      }
      if (renderer) beforeRender(renderer);
      return busy || !state.reduced;
    }
    function beforeRender(r) {
      if (!r || state.disposed) return;
      if (r.toneMappingExposure !== state.exposure) r.toneMappingExposure = state.exposure;
      var fc = fog.color;
      if (fc.r !== state.clear.r || fc.g !== state.clear.g || fc.b !== state.clear.b) { r.setClearColor(fc, 1); state.clear.copy(fc); }
      var pr = typeof r.getPixelRatio === 'function' ? r.getPixelRatio() : 1;
      if (pr !== state.pr) { state.pr = pr; starU.uPR.value = pr; }
      if (state.shadowDirty && r.shadowMap) {
        if (r.shadowMap.enabled && sun.castShadow) r.shadowMap.needsUpdate = true;
        state.shadowDirty = false;
      }
    }

    /* ================================================================
       CONTROLS
       ================================================================ */
    function invalidateShadows() { state.shadowDirty = true; }
    function setQuality(q) {
      if (!q) return;
      if (q.shadows != null) quality.shadows = !!q.shadows;
      if (q.cones != null) quality.cones = !!q.cones;
      if (q.particleScale) quality.particleScale = q.particleScale;
      var cast = !!budget.shadows && quality.shadows;
      if (cast !== sun.castShadow) { sun.castShadow = cast; invalidateShadows(); }
      starGeo.setDrawRange(0, Math.max(1, Math.round(nStars * Math.min(1, quality.particleScale))));
      applyShow(state.k, true);
    }
    var unsubQ = SL3D && typeof SL3D.onQuality === 'function' ? SL3D.onQuality(function (q) { setQuality(q); }) : null;

    var env = {
      VERSION: VERSION, group: group, lights: { hemi: hemi, sun: sun }, fog: fog, tier: tier,
      update: update, beforeRender: beforeRender,
      attach: function (r) { renderer = r || null; state.clear.setRGB(-1, -1, -1); state.pr = 0; },
      setLand: setLand, setPlaced: setPlaced, riseRegion: riseRegion,
      setShow: function (k) { var kk = clamp01(+k || 0); blend.k = blend.from = blend.to = kk; blend.t = blend.dur = 0; applyShow(kk); },
      showtime: function (on, o) {
        var red = o && o.reduced != null ? !!o.reduced : state.reduced;
        return blendTo(blend, on ? 1 : 0, red);
      },
      aim: function (pt, o) {
        if (pt && isFinite(pt.x) && isFinite(pt.z)) { aimPt.set(pt.x, (pt.y || 0) + AIM_LIFT, pt.z); state.aimTo = 1; }
        else state.aimTo = 0;
        if (state.reduced || (o && o.instant)) state.aimK = state.aimTo;
        state.motionDirty = true;
      },
      setMember: function (hex) { state.member = hex || null; PT = presetTables(state.member); applyShow(state.k, true); },
      setReduced: function (on) { state.reduced = !!on; state.motionDirty = true; },
      setQuality: setQuality,
      invalidateShadows: invalidateShadows,
      lockedAt: function (x, z) { try { return Gr.lockedRegionAt(x, z, state.land, Gr.SAND_REACH); } catch (e) { return null; } },
      info: function () {
        var calls = 0, tris = 0, inst = {};
        group.traverse(function (o) {
          if (!o.visible || !(o.isMesh || o.isPoints)) return;
          var n = o.isInstancedMesh ? o.count : 1;
          if (!n) return;
          calls++;
          var g = o.geometry, vc = g.index ? g.index.count : g.getAttribute('position').count;
          if (o.isMesh) tris += (vc / 3) * n;
          inst[o.name] = n;
        });
        return { calls: calls, tris: Math.round(tris), instances: inst, land: Object.keys(state.land).length, show: state.k, rising: !!rise };
      },
      dispose: function () {
        if (state.disposed) return;
        if (rise) finishRise();
        state.disposed = true;
        if (unsubQ) unsubQ();
        if (opts.scene && opts.scene.fog === fog) opts.scene.fog = null;
        if (group.parent) group.parent.remove(group);
        layers.forEach(function (Ly) { Ly.mesh.dispose(); });
        owned.meshes.forEach(function (m) { m.dispose(); });
        owned.geos.forEach(function (g) { g.dispose(); });
        owned.mats.forEach(function (m) { m.dispose(); });
        owned.texs.forEach(function (t) { t.dispose(); });
        if (typeof sun.dispose === 'function') sun.dispose();
        if (typeof hemi.dispose === 'function') hemi.dispose();
        group.clear();
        renderer = null;
      }
    };
    Object.defineProperty(env, 'show', { get: function () { return state.k; } });
    Object.defineProperty(env, 'reduced', { get: function () { return state.reduced; } });

    /* first state */
    applyShow(blend.k, true);
    var startLand = opts.unlocked != null ? opts.unlocked : (opts.world || ['home']);
    setLand(startLand, opts.world || null);
    if (Array.isArray(opts.placed)) setPlaced(opts.placed);
    setQuality(quality);
    updateClouds(); updateBuoys(); updateCones();
    return env;
  }

  /* ================================================================
     SHADERS (GLSL ES 1.0 style; three r170 compiles them as WebGL2)
     ================================================================ */
  var SKY_VERT = [
    'varying vec3 vWorld;',
    'void main() {',
    '  vec4 wp = modelMatrix * vec4(position, 1.0);',
    '  vWorld = wp.xyz;',
    '  gl_Position = projectionMatrix * viewMatrix * wp;',
    '}'
  ].join('\n');
  var SKY_FRAG = [
    'uniform vec3 uTop;',
    'uniform vec3 uMid;',
    'uniform vec3 uHorizon;',
    'uniform vec3 uBelow;',
    'varying vec3 vWorld;',
    'void main() {',
    '  vec3 dir = normalize(vWorld - cameraPosition);',
    '  float h = dir.y;',
    '  vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.3, h));',
    '  col = mix(col, uTop, smoothstep(0.3, 0.9, h));',
    '  col = mix(col, uBelow, smoothstep(0.0, 0.14, -h));',     /* below the horizon: the fog colour (sea edge melts in) */
    '  gl_FragColor = vec4(col, 1.0);',
    '  #include <colorspace_fragment>',
    '}'
  ].join('\n');

  var SEA_VERT = [
    '#include <common>',
    '#include <fog_pars_vertex>',
    'varying vec2 vXZ;',
    'void main() {',
    '  vec4 wp = modelMatrix * vec4(position, 1.0);',
    '  vXZ = wp.xz;',
    '  vec4 mvPosition = viewMatrix * wp;',
    '  gl_Position = projectionMatrix * mvPosition;',
    '  #include <fog_vertex>',
    '}'
  ].join('\n');
  var SEA_FRAG = [
    '#include <common>',
    '#include <fog_pars_fragment>',
    'uniform sampler2D uField;',
    'uniform sampler2D uFieldPrev;',
    'uniform float uFieldMix;',
    'uniform vec4 uFieldRect;',
    'uniform vec2 uFieldMax;',
    'uniform float uTime;',
    'uniform float uShow;',
    'uniform float uGlints;',
    'uniform float uSpots;',
    'uniform float uSandReach;',
    'uniform float uLockedEdge;',
    'uniform float uHalf;',
    'uniform vec3 uShallow;',
    'uniform vec3 uDeep;',
    'uniform vec3 uFoam;',
    'uniform vec3 uWave;',
    'uniform vec3 uSandbar;',
    'uniform vec3 uEdge;',
    'uniform vec3 uFogCol;',
    'uniform vec3 uSpotColA;',
    'uniform vec3 uSpotColB;',
    'uniform vec4 uSpotA;',
    'uniform vec4 uSpotB;',
    'varying vec2 vXZ;',
    'float hash12(vec2 p) {',
    '  vec3 p3 = fract(vec3(p.xyx) * 0.1031);',
    '  p3 += dot(p3, p3.yzx + 33.33);',
    '  return fract((p3.x + p3.y) * p3.z);',
    '}',
    'float vnoise(vec2 p) {',
    '  vec2 i = floor(p);',
    '  vec2 f = fract(p);',
    '  vec2 u = f * f * (3.0 - 2.0 * f);',
    '  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);',
    '}',
    'vec2 fieldAt(sampler2D tex, vec2 uv) {',
    '  vec4 t = texture2D(tex, uv);',
    '  return vec2(t.r * uFieldMax.x, (t.g - 0.5) * 2.0 * uFieldMax.y);',
    '}',
    /* a spotlight washing across the water from its buoy along the beam heading */
    'float streak(vec2 p, vec4 s) {',
    '  vec2 d = p - s.xy;',
    '  float a = dot(d, s.zw);',
    '  vec2 perp = d - a * s.zw;',
    '  float w = 0.3 + max(a, 0.0) * 0.12;',
    '  float along = smoothstep(0.0, 0.9, a) * (1.0 - smoothstep(3.5, 8.0, a));',
    '  float across = exp(-dot(perp, perp) / (w * w));',
    '  float rip = 0.6 + 0.4 * sin(a * 4.0 - uTime * 1.4 + vnoise(p * 1.3) * 3.0);',
    '  return along * across * rip;',
    '}',
    'void main() {',
    '  vec2 uv = (vXZ - uFieldRect.xy) * uFieldRect.zw;',
    '  vec2 fld = mix(fieldAt(uFieldPrev, uv), fieldAt(uField, uv), uFieldMix);',
    '  float sd = max(fld.x - uSandReach, 0.0);',          /* distance from the sand edge */
    '  float locked = fld.y;',
    '  float aa = fwidth(sd) * 1.2 + 0.004;',
    '  float aaL = fwidth(locked) * 1.2 + 0.004;',
    /* body: shallow at the beach → deep, with a slow tint drift */
    '  vec3 col = mix(uShallow, uDeep, smoothstep(0.0, 2.5, sd));',
    '  col *= 0.95 + 0.1 * vnoise(vXZ * 0.33 + vec2(uTime * 0.03, -uTime * 0.02));',
    '  float inside = 1.0 - smoothstep(uLockedEdge - aaL, uLockedEdge + aaL, locked);',
    '  float open = 1.0 - inside;',
    /* 6 wave-line bands following the shore, broken into strokes, scrolling outward at 0.04 u/s */
    '  float q = (sd - 0.5) / 0.45 - uTime * (0.04 / 0.45);',
    '  float fq = fract(q);',
    '  float dl = min(fq, 1.0 - fq) * 0.45;',
    '  float line = 1.0 - smoothstep(0.03 - aa, 0.03 + aa, dl);',
    '  float dash = smoothstep(0.38, 0.58, vnoise(vXZ * 0.95 + vec2(floor(q + 0.5) * 3.7, 0.0)));',
    '  float bands = smoothstep(0.3, 0.7, sd) * (1.0 - smoothstep(2.4, 3.3, sd));',
    '  col = mix(col, uWave, 0.5 * line * dash * bands * open);',
    /* the foam ring: a breathing band at the sand edge plus a broken second line */
    '  float edge = 0.12 + 0.06 * sin(uTime * 1.3 + sd * 9.0 + vnoise(vXZ * 1.1) * 3.0);',
    '  float foam = 1.0 - smoothstep(edge - aa, edge + aa, sd);',
    '  float l2 = 0.3 + 0.04 * sin(uTime * 0.9 + vnoise(vXZ * 0.7 + 4.0) * 4.0);',
    '  float foam2 = (1.0 - smoothstep(0.02 - aa, 0.02 + aa, abs(sd - l2))) * smoothstep(0.35, 0.6, vnoise(vXZ * 1.6 + 9.0));',
    '  col = mix(col, uFoam, max(foam, foam2 * 0.7) * (1.0 - 0.4 * inside));',
    /* day glints: soft ✦ twinkles, one per lucky 1.7 u cell (each ≤ 0.63 Hz) */
    '#ifndef ENV_LOW',
    '  vec2 gp = vXZ / 1.7;',
    '  vec2 gid = floor(gp);',
    '  float gh = hash12(gid + 17.0);',
    '  vec2 gq = (fract(gp) - (vec2(hash12(gid + 3.1), hash12(gid + 7.7)) * 0.6 + 0.2)) * 1.7;',
    '  float gper = 1.6 + 1.4 * hash12(gid + 11.0);',
    '  float tw = pow(max(0.0, sin(uTime * 6.2831 / gper + gh * 40.0)), 6.0);',
    '  float arms = exp(-abs(gq.x) * 30.0 - abs(gq.y) * 7.0) + exp(-abs(gq.y) * 30.0 - abs(gq.x) * 7.0);',
    '  float glint = step(gh, 0.45) * tw * (arms * 0.6 + exp(-dot(gq, gq) * 260.0));',
    '#else',
    '  vec2 gp = vXZ / 2.0;',
    '  vec2 gid = floor(gp);',
    '  float gh = hash12(gid + 17.0);',
    '  vec2 gq = (fract(gp) - 0.5) * 2.0;',
    '  float tw = pow(max(0.0, sin(uTime * 6.2831 / (1.6 + 1.4 * gh) + gh * 40.0)), 6.0);',
    '  float glint = step(gh, 0.4) * tw * exp(-dot(gq, gq) * 200.0);',
    '#endif',
    '  glint *= smoothstep(0.5, 1.1, sd) * (1.0 - smoothstep(12.0, 17.0, length(vXZ))) * open;',
    '  col += vec3(glint * uGlints * 0.9);',
    /* Showtime: pink and cyan spot streaks washing across the night water */
    '  col += (uSpotColA * streak(vXZ, uSpotA) + uSpotColB * streak(vXZ, uSpotB)) * (0.55 * uSpots);',
    /* locked land: a translucent sandbar at sea level, slow scan lines and a dashed neon edge */
    '  col = mix(col, uSandbar, 0.5 * inside);',
    '  float sl = fract(vXZ.y * 2.2 - uTime * 0.12);',
    '  float scan = smoothstep(0.0, 0.06, sl) * (1.0 - smoothstep(0.06, 0.3, sl));',
    '  col = mix(col, uEdge, 0.25 * scan * inside);',
    '  float ed = abs(locked - uLockedEdge);',
    '  float eLine = 1.0 - smoothstep(0.035 - aaL, 0.035 + aaL, ed);',
    '  float sDash = fract((vXZ.x + vXZ.y) * 1.8 - uTime * 0.15);',
    '  float dashE = smoothstep(0.0, 0.08, sDash) * (1.0 - smoothstep(0.5, 0.58, sDash));',
    '  col = mix(col, uEdge, eLine * dashE * (0.8 + 0.2 * uShow));',
    '  col += uEdge * exp(-ed * ed * 40.0) * 0.22 * uShow;',
    /* the far edge of the plane melts into the fog colour */
    '  col = mix(col, uFogCol, smoothstep(uHalf * 0.75, uHalf * 0.98, max(abs(vXZ.x), abs(vXZ.y))));',
    '  gl_FragColor = vec4(col, 1.0);',
    '  #include <colorspace_fragment>',
    '  #include <fog_fragment>',
    '}'
  ].join('\n');

  var STAR_VERT = [
    'attribute float aSeed;',
    'attribute float aSize;',
    'attribute float aSea;',
    'attribute vec3 aTint;',
    'uniform float uTime;',
    'uniform float uPR;',
    'uniform float uSize;',
    'uniform float uFogNear;',
    'uniform float uFogFar;',
    'varying vec3 vTint;',
    'varying float vA;',
    'void main() {',
    '  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);',
    '  gl_Position = projectionMatrix * mvPosition;',
    '  float tw = 0.55 + 0.45 * sin(uTime * 2.0 + aSeed);',            /* 0.32 Hz twinkle */
    '  float fogK = aSea * smoothstep(uFogNear, uFogFar, -mvPosition.z);',
    '  vA = tw * mix(1.0, 0.6, aSea) * (1.0 - fogK);',
    '  vTint = aTint;',
    '  gl_PointSize = uSize * uPR * mix(0.8, 1.3, aSize) * mix(1.2, 0.9, aSea);',
    '}'
  ].join('\n');
  var STAR_FRAG = [
    'uniform float uAlpha;',
    'varying vec3 vTint;',
    'varying float vA;',
    'void main() {',
    '  float r = length(gl_PointCoord - vec2(0.5));',
    '  float a = (1.0 - smoothstep(0.15, 0.5, r)) * vA * uAlpha;',
    '  if (a < 0.003) discard;',
    '  gl_FragColor = vec4(vTint, a);',
    '  #include <colorspace_fragment>',
    '}'
  ].join('\n');

  var CONE_VERT = [
    'uniform float uLen;',
    'uniform float uFogNear;',
    'uniform float uFogFar;',
    'varying float vAlong;',
    'varying vec3 vN;',
    'varying vec3 vW;',
    'varying vec3 vCol;',
    'varying float vFog;',
    'void main() {',
    '  mat4 m = modelMatrix;',
    '#ifdef USE_INSTANCING',
    '  m = modelMatrix * instanceMatrix;',
    '#endif',
    '  vec4 wp = m * vec4(position, 1.0);',
    '  vW = wp.xyz;',
    '  vN = normalize(mat3(m) * normal);',
    '  vAlong = clamp(position.y / uLen, 0.0, 1.0);',
    '#ifdef USE_INSTANCING_COLOR',
    '  vCol = instanceColor;',
    '#else',
    '  vCol = vec3(1.0);',
    '#endif',
    '  vec4 mv = viewMatrix * wp;',
    '  vFog = smoothstep(uFogNear, uFogFar, -mv.z);',
    '  gl_Position = projectionMatrix * mv;',
    '}'
  ].join('\n');
  var CONE_FRAG = [
    'uniform float uAlpha;',
    'varying float vAlong;',
    'varying vec3 vN;',
    'varying vec3 vW;',
    'varying vec3 vCol;',
    'varying float vFog;',
    'void main() {',
    '  vec3 V = normalize(cameraPosition - vW);',
    '  float facing = abs(dot(normalize(vN), V));',            /* soft edges: fade where the beam turns away */
    '  float a = uAlpha * pow(1.0 - vAlong, 1.4) * smoothstep(0.0, 0.06, vAlong) * pow(facing, 1.3) * (1.0 - vFog);',
    '  gl_FragColor = vec4(vCol, a);',
    '  #include <colorspace_fragment>',
    '}'
  ].join('\n');

  var api = {
    VERSION: VERSION, create: create,
    /* constants (read-only use) */
    TILE: TILE, SAND: SAND, CONE_BASE: CONE_BASE, CONE_GEO: CONE_GEO, BUOY: BUOY, POLE: POLE, CLOUDS: CLOUDS,
    CLOUD_SPAN: CLOUD_SPAN, CLOUD_EXTENT: CLOUD_EXTENT, STAR: STAR, STAR_TINTS: STAR_TINTS, FREQS: FREQS, FIELD_PACK: FIELD_PACK,
    ALT_DY: ALT_DY, PLINTH_DY: PLINTH_DY, RISE_FLOOR: RISE_FLOOR, LOCKED_EDGE: LOCKED_EDGE, SEA_SIZE: SEA_SIZE, SKY_R: SKY_R,
    /* pure helpers */
    landOf: landOf, regionsOf: regionsOf, landSig: landSig, placedSig: placedSig, landTiles: landTiles, skirtCells: skirtCells,
    dressing: dressing, polePosition: polePosition, surfaces: surfaces, hologramTokens: hologramTokens,
    ringPoints: ringPoints, tileTris: tileTris, stripNormal: stripNormal,
    presetTables: presetTables, presetOut: presetOut, mixPreset: mixPreset,
    blendState: blendState, blendTo: blendTo, blendStep: blendStep,
    coneAxis: coneAxis, cloudAt: cloudAt, starField: starField, sunBasis: sunBasis, shadowFit: shadowFit,
    SHADERS: { SKY_VERT: SKY_VERT, SKY_FRAG: SKY_FRAG, SEA_VERT: SEA_VERT, SEA_FRAG: SEA_FRAG, STAR_VERT: STAR_VERT, STAR_FRAG: STAR_FRAG, CONE_VERT: CONE_VERT, CONE_FRAG: CONE_FRAG }
  };

  /* the stage registry: SL3D.makeEnv(opts) → create(K, SL3D, opts) once the stage is ready */
  if (root && root.SL3D && typeof root.SL3D.defineApi === 'function') {
    try {
      root.SL3D.defineApi('makeEnv', function (K, S) { return function (o) { o = o || {}; return create(o.K || K, S, o); }; });
    } catch (e) { /* the stage logs its own issues */ }
  }
  return api;
}));
