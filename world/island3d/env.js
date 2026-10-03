/* ================================================================
   My Island 3D — the environment (classic script; THREE comes from K).
   window.SLIslandEnv in the browser; require() in Node returns the same
   object, whose PURE helpers run without THREE (create() needs the kit K).
   Encore City v2 (plan-v2.json → B1, islandV2 §1–5): the organic ground from
   SLTerrain3D (falls back to the v1 tiles), the sea, the sky, the lights and
   the golden hour (DUSK) ↔ Showtime (SHOW) mix. Rules (regions, cells,
   unlocks, occupancy) come only from SLWorldCore; heights from SLGrid3D and
   SLTerrain3D; colours and presets from SLIslandLook; timelines from SLMotion.

   FOR THE SCENE CONTROLLER (island3d.js)
     var env = SLIslandEnv.create(K, SL3D, opts)       (also SL3D.makeEnv(opts) once the stage is ready)
       opts {scene, renderer, unlocked: ['home', …], world, placed, show: 0..1, member: '#RRGGBB', reduced,
             seed: the child's profile key (their own coastline), name: first name (the city's hero board),
             terrain: false → the v1 tile ground, terrainMs: bake budget (60), city / life: false → skip them,
             lazyLand: true → no land (open water) until the first setLand, which is then the only bake}
     scene.add(env.group)                   sky, stars, clouds, sea, ground, scenery, dressing, buoys, pole,
                                            neon accents, cones, ambient halos, the city and the ambient life
     env.lights {hemi, sun}                 the ONLY lights; sun.target is in env.group
     env.fog                                THREE.Fog, mixed with the light
     env.update(dt, t, showK?) → animating  once per frame before rendering. A numeric showK drives the Showtime
                                            mix directly (it cancels a running blend). false = nothing moves
     env.beforeRender(renderer) · env.attach(renderer | null)
     env.setLand(unlocked, world?, {rise, reduced}?) → riseHandle | null   (cheap on every sync)
     env.setPlaced(placed)                  layout change (re-scatters the dressing, plinths, pole)
     env.riseRegion(region, {reduced}?) → {region, cells: [{c, r, key, x, y, z, delay}], dur, done, promise, cancel()}
                                            the new land rises in up to 5 bands (M.landRise delays) over the old
                                            ground, then swaps in one frame; reduced = instant swap + 0.25 s field
                                            crossfade. cells[].delay times fx3d's splash rings
     env.showtime(on, {reduced}?) → sec     golden hour ↔ Showtime: 1.6 s inOutSine (0.25 s crossfade reduced),
                                            with the 'city wakes up' ripple (40 ms per cell from the home, 0.3 s fades)
     env.setShow(k) · env.show              the Showtime mix models see (eases to 0 in edit mode)
     env.light                              the full light mix (Showtime + the golden ↔ blue-hour drift + edit)
     env.setEdit(on)                        edit / place mode: the light eases to golden hour (k 0) for readability
     env.aim(point | null, {instant}?)      swing the 3 spot cones onto a point / release
     env.setConeMounts([{x, y, z}] | null)  cone lamps on e.g. the stage truss (P1); null = buoys + the pole
     env.setMember(hex) · env.setUser({name, color, seed}) · env.setReduced(on) · env.setQuality(q)
     env.setSeed(seed)                      a new child's coastline: baked by the next setLand (their land), else after 0.5 s of frames
     env.invalidateShadows() · env.lockedAt(x, z) → region | null · env.heightAt(x, z) · env.wakeAt(x, z) → 0..1
     env.anchors (terrain anchors or null) · env.mode ('terrain' | 'tiles') · env.haloLayer · env.city · env.life
     env.info() → {calls, tris, instances, land, show, light, mode, bakeMs, layers: {name: {calls, tris}}}
     env.dispose()                          frees what env made, the city and the life included

   WHAT IT DRAWS (terrain mode; LOW merges the scenery into the terrain and drops the clouds)
     sky dome (golden-hour sun halo, Showtime city-glow band) · 3 dusk cloud streaks · sea (ShaderMaterial: the
     RGBA field from SLTerrain3D — foam on the organic coast, lagoons, the locked regions' future coasts as a
     hologram sandbar with a dashed neon edge — wave lines, glints, Showtime spot streaks, city light pillars,
     the boats' V wakes from life.boats() on MID / HIGH) ·
     terrain (ONE InstancedMesh, count 1, on K's toon program) · scenery (walls, boulders, boardwalks, abutment,
     islet, rock stacks; casts shadows) · layout (world-space dressing + plinth risers) · 2 LED ring buoys + the
     pole behind the house · neon accents (one InstancedMesh of unit boxes on 'state') · 3 spot cones · stars ·
     the ambient halo layer (48, shared with life3d). Every toon mesh is an InstancedMesh with instanceColor,
     so they share ONE toon program; the sky, sea, stars and cones (env's own ShaderMaterials) share ONE env
     program too (SHADERS.ENV_VERT / ENV_FRAG: the four passes joined, picked per material by uPass).
   ================================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    var T3 = null;
    try { T3 = require('./terrain3d.js'); } catch (e) { T3 = null; }
    module.exports = factory(root, require('../world-core.js'), require('./grid3d.js'), require('../world-look.js'), require('./motion.js'), T3);
  } else root.SLIslandEnv = factory(root, null, null, null, null, null);
}(typeof self !== 'undefined' ? self : typeof globalThis !== 'undefined' ? globalThis : this, function (root, C0, G0, L0, M0, T30) {
  'use strict';

  var VERSION = 2;
  var DEG = Math.PI / 180, TAU = Math.PI * 2;

  /* lazy module lookups, so script order never matters in the browser */
  function core() { var c = C0 || root.SLWorldCore; if (!c) throw new Error('SLIslandEnv: SLWorldCore is not loaded'); return c; }
  function grid() { var g = G0 || root.SLGrid3D; if (!g) throw new Error('SLIslandEnv: SLGrid3D is not loaded'); return g; }
  function look() { var l = L0 || root.SLIslandLook; if (!l) throw new Error('SLIslandEnv: SLIslandLook is not loaded'); return l; }
  function motion() { var m = M0 || root.SLMotion; if (!m) throw new Error('SLIslandEnv: SLMotion is not loaded'); return m; }
  function terrainModule() { return T30 || root.SLTerrain3D || null; }

  /* ---------------- constants ---------------- */
  var ALT_DY = 0.001;          /* v1 tiles: alternate tiles sit 0.001 u higher (no z-fighting) */
  var PLINTH_DY = 0.002;       /* a plinth's top sits just over the terrace it covers */
  var RISE_FLOOR = 0.1;        /* rising land starts this far under the sea surface */
  var LOCKED_EDGE = 0.2;       /* v1 tiles: the hologram sandbar reaches this far beyond its cells */
  var FIELD_PACK = { maxShore: 4, maxLocked: 2, maxOther: 1 };
  var FIELD = { w: 128, h: 80, x0: -16.125, z0: -10.125, texel: 0.25 };   /* = SLTerrain3D.FIELD (RGBA8) */
  var SEA_SIZE = 160, SKY_R = 90;
  var PLINTH_CAP = 16;
  var AIM_LIFT = 2.4, AIM_SEC = 0.3;
  var CONE_ALPHA_FACE = 0.6;   /* the open cone renders both faces: 0.2 × 0.6 per face ≈ the bible's 0.2 through the middle */
  var TERRAIN_MS = 60;         /* a bake slower than this (or one that throws) falls back to the v1 tiles */
  var SEED_WAIT = 0.5;         /* s of frames a new seed waits for the profile switch's setLand before baking alone */
  var BAND_MAX = 5;            /* unlock rise bands (3 on LOW) */
  var EDIT_SEC = 0.6;          /* edit mode eases the light to golden hour over this */
  var HALO_CAP = 48;           /* the env-owned ambient halo layer (bollards, lamps, buoys, life3d's lanterns) */
  /* the 'city wakes up' ripple: each light fades in 0.3 s, 40 ms per cell of distance from the home.
     settle: a ripple older than this has reached every light on the island (≤ 19 u from the home);
     chain: the reversals inside one ripple wakeAt remembers exactly (a host toggles Showtime at most
     about once a second; past 16 toggles in 1.2 s the oldest is folded in approximately) */
  var WAKE = { perCell: 0.04, fade: 0.3, settle: 1.2, chain: 16 };
  /* the sea (art-bible-v2 WATER; island-terrain-v2 §10). The wave lines follow the island's OWN coast
     (field R) only, 0.3–1.6 u out (2–3 strokes), never round the quay, the islet or the stacks (field A:
     foam only), at 0.6 × the v1 width. They calm toward Showtime — alpha 0.26 at golden hour (the bible's
     0.35, softened) → 0.1, the stroke colour 60% of the way to the shallow water — and the shallows hug
     the coast tighter at night (2.5 → 1.8 u), so the bay reads as dark glass under the city's light
     pillars. Foam: the bible's 0.10 + 0.05·sin band on every shore; the broken second line on the
     island's coast only, softer at Showtime. */
  var SEA = {
    spacing: 0.45, scroll: 0.04, bandIn: [0.3, 0.6], bandOut: [1.1, 1.6], clearOther: [0.2, 0.6],
    waveW: 0.018, waveA: [0.26, 0.1], waveShowMix: 0.6, deepAt: [2.5, 1.8],
    foamEdge: [0.1, 0.05], foam2: [0.7, 0.45]
  };
  /* the golden ↔ blue-hour drift (P1): k_a = 0.12 − 0.12·cos(2πt / 420 s), starting at golden hour;
     reduced motion holds 0.12, edit mode eases to 0 */
  var DRIFT = { mid: 0.12, amp: 0.12, period: 420 };
  /* the play camera's elevation (camera.js elevDefault v2): the calibration view */
  var VIEW_ELEV = 48;
  /* LED ring buoys (torus R 0.4, Electric Violet) and the lamp heads the cones mount on */
  /* headY = the square lamp head's centre (0.08 tall); the glowing lens sits on its top face and the
     cone springs from just above it (apex) */
  var BUOY = { headY: 0.89, lens: 0.936, apex: 0.94, bob: 0.025, hz: 0.4, tiltDeg: 2.5, ringR: 0.4, ringY: 0.1, ringSeg: { LOW: 10, MID: 14, HIGH: 16 } };
  var POLE = { headY: 1.63, lens: 1.676, apex: 1.68 };
  var LENS_OFF = 'Gunmetal Mid';
  /* the abutment of the Lantern Bridge: the house light pole steps 0.6 u along x when it lands within 0.6 */
  var ABUTMENT = { x: -3.2, z: -4.45, clear: 0.6 };
  /* the golden-hour sun halo on the horizon (sky shader): yaw -30°, 2° up */
  var SUN_HALO = { yawDeg: -30, elevDeg: 2, token: 'Sun Halo', opacity: 0.6 };

  /* v1 tile surfaces in v2 tokens (no checker: alt = top); meadow / cove tokens come from the LOOK land entries */
  var SURF_FALLBACK = {
    home: { top: 'Turf', alt: 'Turf', altTone: 0, side: 'Turf Shade' },
    meadow: { top: 'Hill Moss', alt: 'Hill Moss', altTone: 0, side: 'Cliff Rock' },
    cove: { top: 'Dune', alt: 'Dune', altTone: 0, side: 'Wet Dune' }
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

  /* v1 chamfered land tile (the fallback ground): a flat 1×1 top whose bevel hangs OUTSIDE the cell */
  var TILE = {
    MID: { a: 0.5, N: 1, topStrips: 1, rings: [{ d: 0, y: 0 }, { d: 0.035, y: -0.012 }, { d: 0.05, y: -0.045 }, { d: 0.05, y: -0.8 }], shade: [1, 1, 0.96, 0.8] },
    LOW: { a: 0.5, N: 1, topStrips: 1, rings: [{ d: 0, y: 0 }, { d: 0.05, y: -0.045 }, { d: 0.05, y: -0.8 }], shade: [1, 1, 0.8] }
  };
  TILE.HIGH = TILE.MID;
  /* v1 sand skirt tile (fallback): 1.5 × 1.5 with 0.3 rounded corners, top at SAND_Y, bottom under the sea */
  var SAND = {
    MID: { a: 0.45, N: 2, rings: [{ d: 0.26, y: 0, tok: 'Dune', tone: 0 }, { d: 0.3, y: -0.04, tok: 'Dune', tone: -0.03 },
      { d: 0.3, y: -0.12, tok: 'Wet Dune', tone: 0 }, { d: 0.3, y: -0.22, tok: 'Wet Dune', tone: -0.06 }] },
    LOW: { a: 0.45, N: 1, rings: [{ d: 0.26, y: 0, tok: 'Dune', tone: 0 }, { d: 0.3, y: -0.04, tok: 'Dune', tone: -0.03 },
      { d: 0.3, y: -0.22, tok: 'Wet Dune', tone: 0 }] }
  };
  SAND.HIGH = SAND.MID;

  /* the 3 fake spotlight cones: base heading (x, z) and tilt from vertical; the sweep turns the heading */
  var CONE_BASE = [{ h: [1, -0.35], tilt: 28 }, { h: [-1, -0.35], tilt: 28 }, { h: [0, -1], tilt: 18 }];
  var CONE_GEO = { r: 1.3, h: 10, radial: 16, radialLow: 12 };

  /* 3 flattened dusk cloud streaks hovering over the sea BEHIND the island (z ≤ -10.5, y 5.2–6.4),
     drifting +x: seen from the 34–65° island camera they sit above the back edge and never cover land */
  var CLOUDS = [
    { x: -10, y: 5.6, z: -11.5, s: 1.6, yaw: 8 }, { x: 3, y: 6.4, z: -14.5, s: 2.0, yaw: -6 }, { x: 13, y: 5.2, z: -10.5, s: 1.4, yaw: 12 }
  ];
  var CLOUD_SHAPE = [2.3, 0.36, 0.95];                      /* streak stretch of the merged puffs */
  var CLOUD_EXTENT = { x: 1.1 * 2.3, y: 0.62 * 0.36, z: 0.62 * 0.95 };   /* the streak's half-size at scale 1 */
  var CLOUD_SPAN = 56;
  var STAR = { skyShare: 0.35, r: 80, elev: [4, 70], sea: { x: 24, zMin: -16, zMax: 12, holeX: 9.6, holeZ: 6.4 } };
  var STAR_TINTS = ['Cloud White', 'Holo Blue', 'Holo Pink', 'Holo Lemon'];

  /* every periodic light / motion in this file (Hz) — all ≤ SLMotion.MAX_FLASH_HZ (test-enforced) */
  var FREQS = {
    foamEdge: 1.3 / TAU, foamLine: 0.9 / TAU, waveBands: SEA.scroll / SEA.spacing, glintMax: 1 / 1.6, spotRipple: 1.4 / TAU,
    scanLines: 0.12, edgeDashes: 0.15, starTwinkle: 2 / TAU, coneSweep: 0.12, buoyBob: BUOY.hz, seaTint: 0.03,
    drift: 1 / DRIFT.period, ringBreathe: 0.25, plazaWave: 0.25, lagoonShimmer: 0.2, reflRipple: 1.2 / TAU, quayShimmer: 0.3
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

  /* v1 tiles: one top/side record per land cell plus a plinth for every placed item that straddles terraces */
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
    plinths(placed).forEach(function (pl) {
      var region = Gr.regionOf(pl.hi.c, pl.hi.r) || 'meadow', s = S[region] || S.meadow;
      tops.push({
        key: 'plinth:' + pl.uid, cell: 'plinth:' + pl.uid, c: pl.c, r: pl.r, region: region, kind: 'plinth', alt: false,
        x: pl.x, y: pl.top + PLINTH_DY, z: pl.z, w: pl.w, d: pl.d, bottom: pl.bottom, top: s.top, tone: 0, side: s.side
      });
    });
    return tops;
  }
  /* every placed item that straddles terraces: Gr.plinth plus the highest cell it lifts the item to */
  function plinths(placed) {
    var Gr = grid(), out = [];
    (placed || []).forEach(function (it) {
      var pl = null;
      try { pl = Gr.plinth(it.id, it.x, it.y); } catch (e) { pl = null; }
      if (!pl) return;
      var hi = null;
      Gr.cellsOf(it.id, it.x, it.y).forEach(function (q) { var sy = Gr.surfaceY(q.c, q.r); if (!hi || sy > hi.s) hi = { c: q.c, r: q.r, s: sy }; });
      out.push({ uid: it.uid, c: it.x, r: it.y, x: pl.x, z: pl.z, w: pl.w, d: pl.d, top: pl.top, bottom: pl.bottom, hi: hi });
    });
    return out;
  }
  /* v1 tiles: cells whose sand skirt can show (any of the 8 neighbours is not land) */
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
  /* v1 tiles: deterministic per-cell dressing on FREE unlocked cells (the fallback ground only) */
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
  /* the third light pole stands behind the house (CONES.poleBehindHouse from its pivot), stepping 0.6 u
     along x when it would land within 0.6 u of the Lantern Bridge abutment; on the ground when that
     point is land (heightAt(x, z) when given), at sea level otherwise */
  function polePosition(placed, landArg, heightAt) {
    var Gr = grid(), C = core(), L = look(), land = landOf(landArg), house = null, i;
    for (i = 0; i < (placed || []).length; i++) if (placed[i].id === 'house_cottage') { house = placed[i]; break; }
    if (!house) for (i = 0; i < C.STARTER.placed.length; i++) if (C.STARTER.placed[i].id === 'house_cottage') { house = C.STARTER.placed[i]; break; }
    var pv = Gr.pivot('house_cottage', house ? house.x : 6, house ? house.y : 2), off = (L.CONES && L.CONES.poleBehindHouse) || [0, 0, -1.6];
    var x = pv.x + off[0], z = pv.z + off[2];
    if (Math.hypot(x - ABUTMENT.x, z - ABUTMENT.z) < ABUTMENT.clear) x += x >= ABUTMENT.x ? ABUTMENT.clear : -ABUTMENT.clear;
    var cell = Gr.worldToCell(x, z), onLand = Gr.inGrid(cell.c, cell.r) && !!land[cell.c + ',' + cell.r];
    var y = onLand ? Gr.cellTop(cell.c, cell.r, land) : Gr.SEA_Y;
    if (typeof heightAt === 'function') { var h = heightAt(x, z); if (isFinite(h)) y = Math.max(h, Gr.SEA_Y); }
    return { x: x, y: y, z: z, c: cell.c, r: cell.r };
  }

  /* ---------------- v1 tile geometry maths (the fallback ground) ---------------- */
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
  function tileTris(spec, part) {
    var M = 4 * (spec.N + 1), rings = spec.rings, n = 0, ts = spec.topStrips || 0;
    if (part !== 'side') n += rings[0].d === 0 ? 2 : M;
    var from = part === 'side' ? ts : 0, to = part === 'top' ? ts : rings.length - 1;
    for (var s = from; s < to; s++) n += rings[s].d === 0 ? 8 + 4 * spec.N : 2 * M;
    return n;
  }
  function stripNormal(r0, r1) {
    var dd = r1.d - r0.d, dy = r1.y - r0.y, l = Math.sqrt(dd * dd + dy * dy) || 1;
    return { r: -dy / l, y: dd / l };
  }

  /* ---------------- presets ---------------- */
  function hexRgb(h) { var n = parseInt(String(h).slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; }
  /* DUSK / SHOW resolved to numbers: colours as sRGB [r, g, b] 0..1 (each end's rim mixed with the member
     colour exactly like SLIslandLook.presetAt), arrays copied, numbers as they are. Tables keep the v1
     field names (day = the k 0 end, show = the k 1 end). */
  function presetTables(member) {
    var L = look(), A = L.DUSK || L.DAY, B = L.SHOW, day = {}, show = {}, m = L.normHex(member);
    L.PRESET_KEYS.forEach(function (key) {
      var a = A[key], b = B[key];
      if (typeof a === 'string') {
        var ah = L.hex(a), bh = L.hex(b);
        if (key === 'rimColor' && m) { ah = L.mixHex(ah, m, A.rimMember || 0); bh = L.mixHex(bh, m, B.rimMember || 0); }
        day[key] = hexRgb(ah); show[key] = hexRgb(bh);
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
  /* the golden hour → Showtime mix for k in 0..1 into a preallocated out (no allocation: safe per frame) */
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

  /* ---------------- calibration: lit Turf at golden hour reads #4FA36A (±6% L) ----------------
     The rendered colour of a lit (unshadowed), up-facing surface: three r170's toon lighting
     (gradient ramp(N·L) × key + hemisphere, × albedo / π), the kit's rim at the play camera,
     × exposure, NeutralToneMapping, sRGB. Only the key intensity is tuned (keyScale). */
  function s2l(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function l2s(c) { c = c < 0 ? 0 : c; return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; }
  function neutralTone(c) {
    var x = Math.min(c[0], c[1], c[2]), off = x < 0.08 ? x - 6.25 * x * x : 0.04;
    var r = c[0] - off, g = c[1] - off, b = c[2] - off, peak = Math.max(r, g, b), start = 0.8 - 0.04;
    if (peak < start) return [r, g, b];
    var d = 1 - start, np = 1 - d * d / (peak + d - start), s = np / peak;
    r *= s; g *= s; b *= s;
    var q = 1 - 1 / (0.15 * (peak - np) + 1);
    return [r + (np - r) * q, g + (np - g) * q, b + (np - b) * q];
  }
  function hslL(rgb) { return (Math.max(rgb[0], rgb[1], rgb[2]) + Math.min(rgb[0], rgb[1], rgb[2])) / 2; }
  function litColor(token, k, member, keyScale, viewElev) {
    var L = look(), P = L.presetAt(k || 0, member || null), alb = hexRgb(L.hex(token) || token).map(s2l);
    var sun = hexRgb(P.sunColor).map(s2l), hs = hexRgb(P.hemiSky).map(s2l), rim = hexRgb(P.rimColor).map(s2l);
    var sp = P.sunPos, sl = Math.sqrt(sp[0] * sp[0] + sp[1] * sp[1] + sp[2] * sp[2]), dotNL = sp[1] / sl;
    var ramp = (L.MATERIAL && L.MATERIAL.toonRamp) || [64, 128, 200, 255];
    var rv = ramp[Math.min(3, Math.floor((dotNL * 0.5 + 0.5) * 4))] / 255;
    var key = (keyScale == null ? keyCalibration() : keyScale) * P.sunIntensity;
    var rimK = Math.pow(1 - Math.sin((viewElev == null ? VIEW_ELEV : viewElev) * DEG), 2.5) * P.rimStrength;
    var out = [0, 1, 2].map(function (i) {
      return (alb[i] / Math.PI * (sun[i] * key * rv + hs[i] * P.hemiIntensity) + rim[i] * rimK) * P.exposure;
    });
    out = neutralTone(out).map(l2s);
    return '#' + out.map(function (v) { var s = Math.round(clamp01(v) * 255).toString(16).toUpperCase(); return s.length < 2 ? '0' + s : s; }).join('');
  }
  /* the key multiplier that puts lit Turf at #4FA36A's lightness at golden hour (bisection; cached) */
  var KEY_CAL = null;
  function keyCalibration() {
    if (KEY_CAL != null) return KEY_CAL;
    var L = look(), target = hslL(hexRgb(L.hex('Turf'))), lo = 0.25, hi = 8;
    for (var i = 0; i < 40; i++) {
      var mid = (lo + hi) / 2;
      if (hslL(hexRgb(litColor('Turf', 0, null, mid))) < target) lo = mid; else hi = mid;
    }
    KEY_CAL = Math.round((lo + hi) / 2 * 1000) / 1000;
    return KEY_CAL;
  }

  /* ---------------- the light cycle ---------------- */
  function blendState(k) { k = clamp01(+k || 0); return { k: k, from: k, to: k, t: 0, dur: 0, reduced: false }; }
  /* start a blend toward target: 1.6 s inOutSine, or a 0.25 s linear crossfade under reduced motion */
  function blendTo(b, target, reduced) {
    var M = motion();
    b.from = b.k; b.to = clamp01(+target || 0); b.t = 0; b.reduced = !!reduced;
    b.dur = b.reduced ? M.SHOW_MIX_REDUCED_SEC : M.SHOW_MIX_SEC;
    return b.dur;
  }
  function blendStep(b, dt) {
    if (b.t >= b.dur) { b.k = b.to; return false; }
    b.t = Math.min(b.dur, b.t + (dt > 0 ? dt : 0));
    b.k = b.t >= b.dur ? b.to : motion().showMix(b.t, b.from, b.to, b.reduced);
    return true;
  }
  /* the ambient golden ↔ blue-hour drift (0 at t = 0, 0.24 at 210 s); reduced motion holds the middle */
  function driftK(t, reduced) {
    if (reduced) return DRIFT.mid;
    return DRIFT.mid - DRIFT.amp * Math.cos(TAU * (t > 0 ? t : 0) / DRIFT.period);
  }
  /* the full light mix: the drift lifts golden hour toward blue hour, Showtime takes it to 1, and
     edit mode eases all of it back to golden hour (k 0, the brightest) */
  function lightMix(showK, ambient, editK) {
    var s = clamp01(showK), a = clamp01(ambient), e = clamp01(editK);
    return (a + (1 - a) * s) * (1 - e);
  }
  /* one light's 'city wakes up' level from a clean start: on → fades 0 → 1 over 0.3 s after its delay;
     off → back down the same way; reduced = everything together inside the 0.25 s crossfade */
  function wakeLevel(since, delay, on, reduced) {
    var u = reduced ? clamp01(since / motion().SHOW_MIX_REDUCED_SEC) : clamp01((since - (delay || 0)) / WAKE.fade);
    u = u * u * (3 - 2 * u);
    return on ? u : 1 - u;
  }
  /* the per-light ripple step env runs every frame: a linear level w (shown through smoothstep) moves
     toward its target once the light's delay has passed, so a reversal mid-ripple never pops */
  function wakeStep(w, on, since, delay, dt, reduced) {
    var target = on ? 1 : 0;
    if (w === target || (!reduced && since < (delay || 0))) return w;
    var rate = dt / (reduced ? motion().SHOW_MIX_REDUCED_SEC : WAKE.fade);
    return target > w ? Math.min(target, w + rate) : Math.max(target, w - rate);
  }
  function wakeEase(w) { return w * w * (3 - 2 * w); }
  function wakeDelay(x, z, home) { return WAKE.perCell * Math.hypot(x - home.x, z - home.z); }
  /* the ripple as a short record of its toggles, so ANY light's level can be read at any delay with
     no per-light state (env.wakeAt for the placed copies): {base (the settled level before the
     first remembered toggle), on, t (s since the last toggle), n, segOn[], segDur[] (earlier
     toggles)}. Each segment moves a light toward its target at wakeStep's rate once its delay has
     passed, so a reversal mid-ripple carries every light on from where it is — the item lights never
     pop back to golden hour (they used to read wakeLevel(t since the last toggle), which reset a
     not-yet-reached light from 1 to 0 in one frame). */
  function rippleNew(on) {
    return { base: on ? 1 : 0, on: !!on, t: 1e3, n: 0, segOn: [], segDur: [] };
  }
  function rippleRun(w, on, since, delay, reduced) {
    var run = reduced ? since / motion().SHOW_MIX_REDUCED_SEC : (since - (delay || 0)) / WAKE.fade;
    if (!(run > 0)) return w;
    return on ? Math.min(1, w + run) : Math.max(0, w - run);
  }
  /* a new ripple toward `on` (ignored when it is already the target) */
  function rippleToggle(r, on) {
    on = !!on;
    if (on === r.on) return r;
    if (r.t >= WAKE.settle) { r.base = r.on ? 1 : 0; r.n = 0; }       /* the running one has reached everything */
    else {
      if (r.n >= WAKE.chain) {                                         /* fold the oldest toggle (> 16 within 1.2 s) */
        r.base = rippleRun(r.base, r.segOn[0], r.segDur[0], WAKE.settle / 2, false);
        for (var i = 1; i < r.n; i++) { r.segOn[i - 1] = r.segOn[i]; r.segDur[i - 1] = r.segDur[i]; }
        r.n--;
      }
      r.segOn[r.n] = r.on; r.segDur[r.n] = r.t; r.n++;
    }
    r.on = on; r.t = 0;
    return r;
  }
  function rippleAdvance(r, dt) { if (dt > 0 && r.t < 1e3) r.t = Math.min(1e3, r.t + dt); return r; }
  /* a light's eased level (0..1) for its delay; allocation-free */
  function rippleLevel(r, delay, reduced) {
    var w = r.base;
    for (var i = 0; i < r.n; i++) w = rippleRun(w, r.segOn[i], r.segDur[i], delay, reduced);
    return wakeEase(rippleRun(w, r.on, r.t, delay, reduced));
  }
  /* the neon token colours (sRGB 0..1), resolved once */
  var NEON_RGB = null, MEMBER_RGB = { raw: undefined, hex: null, rgb: [1, 1, 1] };
  function neonRgb() {
    if (NEON_RGB) return NEON_RGB;
    var L = look(), h = function (t) { return hexRgb(L.hex(t)); };
    NEON_RGB = {
      off: h('Gunmetal Deep'), blue: h('Holo Blue'), amber: h('Sunset Amber'), violet: h('Electric Violet'), cyan: h('LED Cyan'), lensOff: h(LENS_OFF),
      cones: ((L.CONES && L.CONES.tokens) || ['Neon Magenta', 'LED Cyan', 'Electric Violet']).map(h),
      neon4: (L.NEON4 || ['Neon Magenta', 'LED Cyan', 'Electric Violet', 'Laser Lime']).map(h)
    };
    return NEON_RGB;
  }
  /* the member colour as sRGB 0..1, parsed once per colour: the per-frame neon pass hands in the same
     raw value every frame, so the RegExp / string work in normHex only runs when it changes */
  function memberRgb(member) {
    if (member === MEMBER_RGB.raw && MEMBER_RGB.hex) return MEMBER_RGB.rgb;
    var L = look(), hx = L.normHex(member) || L.hex(L.MEMBER_FALLBACK || 'Bubblegum');
    MEMBER_RGB.raw = member;
    if (hx !== MEMBER_RGB.hex) { MEMBER_RGB.hex = hx; MEMBER_RGB.rgb = hexRgb(hx); }
    return MEMBER_RGB.rgb;
  }
  function mixInto(out, a, sa, b, sb, k, s) {
    out[0] = (a[0] * sa + (b[0] * sb - a[0] * sa) * k) * s;
    out[1] = (a[1] * sa + (b[1] * sb - a[1] * sa) * k) * s;
    out[2] = (a[2] * sa + (b[2] * sb - a[2] * sa) * k) * s;
    return out;
  }
  /* a neon accent's colour (sRGB 0..1, emissive) for its role at light k, wake level w (0..1) and time t.
     Flash-safe: only the wake fades and smooth sines ≤ 0.25 Hz; i, j = a plaza tile's grid position.
     Allocation-free (runs per frame). */
  function neonColour(role, k, w, member, t, i, j, reduced, out) {
    out = out || [0, 0, 0];
    var N = neonRgb(), m = memberRgb(member), lvl;
    i = i || 0; j = j || 0;
    switch (role) {
      case 'edge': {      /* off by day, Holo Blue at dusk, the member colour at Showtime */
        var blue = clamp01(k / 0.24);
        mixInto(out, N.off, 1, N.blue, 0.8, blue, 1);
        out[0] += (m[0] - out[0]) * w; out[1] += (m[1] - out[1]) * w; out[2] += (m[2] - out[2]) * w;
        return out;
      }
      case 'wallCap': return mixInto(out, N.amber, 0.55, N.violet, 1, w, 1);   /* warm at golden hour, violet at Showtime */
      case 'bollard': return mixInto(out, N.amber, 1, N.amber, 1, 0, 0.8 + 0.2 * w);
      case 'lamp': return mixInto(out, N.amber, 1, N.amber, 1, 0, 1);
      case 'plaza': {     /* a slow diagonal swell (0.25 Hz); the NEON4 + member set at Showtime */
        lvl = 0.6 + 0.4 * Math.sin(reduced ? 0 : TAU * FREQS.plazaWave * t - (i + j) * 0.9);
        var q = (i + 2 * j) % 5;
        return mixInto(out, N.cyan, 0.35, q < 4 ? N.neon4[q] : m, 1, w, 0.55 + 0.45 * lvl);
      }
      case 'ring':        /* LED ring buoys: a soft breathe at Showtime (0.25 Hz, ±15%) */
        lvl = 0.55 + 0.45 * w;
        if (!reduced) lvl *= 1 - 0.15 * w * (0.5 + 0.5 * Math.sin(TAU * FREQS.ringBreathe * t + i * 2.1));
        return mixInto(out, N.violet, 1, N.violet, 1, 0, lvl);
      case 'lens': return mixInto(out, N.lensOff, 1, N.cones[i % N.cones.length], 1, w, 1);   /* the cone lamps */
      default: return mixInto(out, N.off, 1, N.off, 1, 0, 1);
    }
  }

  /* ---------------- the sea ---------------- */
  function smoothstepJs(a, b, x) { var u = clamp01((x - a) / (b - a)); return u * u * (3 - 2 * u); }
  /* the sea's per-light-mix numbers (uniforms) for light k → out {a, w, mix, deepAt, foam2} */
  function seaWave(k, out) {
    out = out || {};
    k = clamp01(+k || 0);
    out.a = SEA.waveA[0] + (SEA.waveA[1] - SEA.waveA[0]) * k;     /* the stroke opacity */
    out.w = SEA.waveW;                                             /* half-width (u), the same at every k */
    out.mix = SEA.waveShowMix * k;                                 /* how far the stroke colour sinks toward the shallows */
    out.deepAt = SEA.deepAt[0] + (SEA.deepAt[1] - SEA.deepAt[0]) * k;
    out.foam2 = SEA.foam2[0] + (SEA.foam2[1] - SEA.foam2[0]) * k;
    return out;
  }
  /* where the wave lines may be drawn (the shader's `bands`, mirrored): sd = distance to the island's own
     waterline, od = distance to the other shores (quay, islet, stacks) */
  function waveBands(sd, od) {
    return smoothstepJs(SEA.bandIn[0], SEA.bandIn[1], sd) * (1 - smoothstepJs(SEA.bandOut[0], SEA.bandOut[1], sd)) *
      smoothstepJs(SEA.clearOther[0], SEA.clearOther[1], od == null ? 9 : od);
  }
  /* a GLSL float literal */
  function glf(v) { var s = String(Math.round(v * 1e6) / 1e6); return /[.e]/.test(s) ? s : s + '.0'; }

  /* ---------------- cones, clouds, stars, shadows ---------------- */
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
  function sunBasis(sunPos) {
    var p = sunPos || [-9, 7.5, 8], l = Math.sqrt(p[0] * p[0] + p[1] * p[1] + p[2] * p[2]);
    var f = [-p[0] / l, -p[1] / l, -p[2] / l];
    var r = [-f[2], 0, f[0]], rl = Math.sqrt(r[0] * r[0] + r[2] * r[2]) || 1;
    r = [r[0] / rl, 0, r[2] / rl];
    var u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
    return { f: f, r: r, u: u, dist: l };
  }
  /* the static shadow camera fitted to the unlocked land: every ground receiver (sand reach, or the
     terrain's own bounds when given) and everything up to ITEM_MAX_H above it, plus pad. Ortho bounds in
     light space (never wider than the bible's -13..13 × -9..9); near 1, far 45. */
  function shadowFit(landArg, sunPos, pad, bounds) {
    var Gr = grid(), land = landOf(landArg), B = sunBasis(sunPos), SR = Gr.SAND_REACH;
    var b = { left: Infinity, right: -Infinity, bottom: Infinity, top: -Infinity };
    pad = pad == null ? 0.4 : pad;
    function add(x, y, z) {
      var lx = x * B.r[0] + y * B.r[1] + z * B.r[2], ly = x * B.u[0] + y * B.u[1] + z * B.u[2];
      if (lx < b.left) b.left = lx; if (lx > b.right) b.right = lx;
      if (ly < b.bottom) b.bottom = ly; if (ly > b.top) b.top = ly;
    }
    Object.keys(land).forEach(function (k) {
      var p = Gr.parseKey(k), s = Gr.surfaceY(p.c, p.r);
      [p.c - 8 - SR, p.c - 7 + SR].forEach(function (x) {
        [p.r - 5 - SR, p.r - 4 + SR].forEach(function (z) { add(x, Gr.SAND_Y, z); add(x, s + Gr.ITEM_MAX_H, z); });
      });
    });
    if (bounds && isFinite(bounds.minX)) {
      [bounds.minX, bounds.maxX].forEach(function (x) {
        [bounds.minZ, bounds.maxZ].forEach(function (z) { add(x, Gr.SEA_Y, z); add(x, (bounds.maxY || 0) + 0.3, z); });
      });
    }
    return {
      left: Math.max(-13, b.left - pad), right: Math.min(13, b.right + pad),
      bottom: Math.max(-9, b.bottom - pad), top: Math.min(9, b.top + pad), near: 1, far: 45
    };
  }
  /* the v1 shore / locked field resampled into the v2 RGBA8 layout (the tile fallback): R shore, G locked,
     A 255 (the v1 field has no other shores) */
  function fieldFromGrid(landArg) {
    var Gr = grid(), f = Gr.bakeField(landOf(landArg)), out = new Uint8Array(FIELD.w * FIELD.h * 4);
    for (var j = 0; j < FIELD.h; j++) {
      for (var i = 0; i < FIELD.w; i++) {
        var x = FIELD.x0 + (i + 0.5) * FIELD.texel, z = FIELD.z0 + (j + 0.5) * FIELD.texel, k = (j * FIELD.w + i) * 4;
        out[k] = Math.round(clamp01(Gr.sampleField(f, 'shore', x, z) / FIELD_PACK.maxShore) * 255);
        out[k + 1] = Math.round(clamp01(0.5 + Gr.sampleField(f, 'locked', x, z) / (2 * FIELD_PACK.maxLocked)) * 255);
        out[k + 2] = 0; out[k + 3] = 255;
      }
    }
    return out;
  }
  /* open water everywhere (no shore, no hologram, no lagoon): the field of a lazy env before its land */
  function openSeaField() {
    var out = new Uint8Array(FIELD.w * FIELD.h * 4);
    for (var k = 0; k < out.length; k += 4) { out[k] = 255; out[k + 1] = 255; out[k + 2] = 0; out[k + 3] = 255; }
    return out;
  }
  /* the unlock rise bands: the region's cells in rise order, sliced into n bands, each starting at its
     first cell's SLMotion delay → {bandOf: {cellId: band}, delays: [s], n} */
  function riseBands(region, landArg, n) {
    var Gr = grid(), order = Gr.riseOrder(region, landOf(landArg)), bands = Math.max(1, Math.min(n || BAND_MAX, order.length));
    var bandOf = {}, delays = [];
    order.forEach(function (p, k) {
      var b = Math.floor(k * bands / order.length);
      bandOf[p.c + 16 * p.r] = b;
      if (delays[b] == null) delays[b] = p.delay;
    });
    return { bandOf: bandOf, delays: delays, n: bands, order: order };
  }

  /* the bakes, shared by every env instance (a remount reuses them): ≤ 4 land combos per tier and seed */
  var BAKES = [];
  function bakeCached(T3, land, tier, seed, spacing) {
    var key = tier + '|' + (spacing || '') + '|' + seed + '|' + landSig(land);
    for (var i = 0; i < BAKES.length; i++) if (BAKES[i].key === key) { var hit = BAKES.splice(i, 1)[0]; BAKES.unshift(hit); return { bake: hit.bake, ms: 0, cached: true }; }
    var t0 = nowMs(), bk = T3.bake(land, { tier: tier, seed: seed, spacing: spacing }), ms = nowMs() - t0;
    BAKES.unshift({ key: key, bake: bk });
    if (BAKES.length > 4) BAKES.length = 4;
    return { bake: bk, ms: ms, cached: false };
  }
  function nowMs() { try { return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now(); } catch (e) { return Date.now(); } }
  /* the tile fallback rule for bake times. The page's first two bakes run with a cold JIT (the mount
     bake hides behind the 2D → 3D crossfade, an unlock bake behind the purchase confirm, and each
     result is already paid for), so they may take up to 4× the budget; any later bake over the
     budget, or any bake over 4× it, means this device is too slow for the organic ground and env
     uses the v1 tiles from then on (setLand / unlocks keep working). */
  function slowBakeRule(ms, budgetMs, bakesBefore) {
    if (!(ms > budgetMs)) return false;
    return ms > budgetMs * 4 || bakesBefore >= 2;
  }
  var SLOW = { bakes: 0 };
  function bakeTooSlow(ms, budgetMs) { return slowBakeRule(ms, budgetMs, SLOW.bakes++); }

  /* ================================================================
     create(K, SL3D, opts) → env   (browser; THREE comes from K.THREE)
     ================================================================ */
  function create(K, SL3D, opts) {
    if (!K || !K.THREE || !K.G) throw new Error('SLIslandEnv.create needs the kit K');
    opts = opts || {};
    var T = K.THREE, tier = K.tier || 'MID', low = tier === 'LOW';
    var L = look(), Gr = grid(), M = motion(), C = core();
    var budget = (SL3D && SL3D.budget) || (root.SLTier && root.SLTier.budget ? root.SLTier.budget(tier, 1) : null) ||
      { stars: low ? 120 : 250, shadows: !low, shadowMapSize: tier === 'HIGH' ? 2048 : 1024, reflections: low ? 4 : 6, terrainSpacing: low ? 0.5 : 0.25 };
    var q0 = (SL3D && SL3D.quality) || {};
    var quality = { shadows: q0.shadows != null ? !!q0.shadows : !!budget.shadows, cones: q0.cones !== false, particleScale: q0.particleScale || 1,
                    reflections: q0.reflections !== false, lifeScale: q0.lifeScale || 1 };
    var issues = [];
    function issue(msg) { issues.push(msg); try { if (SL3D && typeof SL3D.log === 'function') SL3D.log('env: ' + msg); } catch (e) {} }

    /* scratch (nothing below allocates per frame) */
    var _m = new T.Matrix4(), _m2 = new T.Matrix4(), _m3 = new T.Matrix4(), _q = new T.Quaternion(), _e = new T.Euler();
    var _p = new T.Vector3(), _s = new T.Vector3(), _v2 = new T.Vector3(), _ax = new T.Vector3();
    var _c = new T.Color(), _rim = new T.Color(), _up = new T.Vector3(0, 1, 0), _one = new T.Vector3(1, 1, 1), _nc = [0, 0, 0];
    var _ca = {}, _cl = {}, _lr = {}, _sw = {};
    var WHITE = new T.Color(1, 1, 1);

    var state = {
      reduced: !!opts.reduced, animT: 0, frame: 0, landFrame: -1, disposed: false,
      land: {}, sig: null, placed: [], psig: null, k: 0, kLight: -1, applied: false, exposure: 1, shadowDirty: true,
      member: opts.member || null, name: opts.name || '', seed: opts.seed != null ? String(opts.seed) : '',
      pr: 0, clear: new T.Color(-1, -1, -1), aimK: 0, aimTo: 0, motionDirty: true,
      editK: 0, editTo: 0, editFrom: 0, editT: 0, wakeOn: false, waking: false, neonDirty: true, keyCal: keyCalibration(),
      mode: opts.terrain === false ? 'tiles' : 'terrain', bakeMs: 0,
      seedDirty: false, seedWait: 0     /* a new child's coastline waits for the next setLand (their land) */
    };
    var blend = blendState(opts.show || 0);
    state.wakeOn = blend.k > 0.5;
    var ripple = rippleNew(state.wakeOn);       /* the 'city wakes up' ripple (its t drives every light's delay) */
    var PT = presetTables(state.member), P = presetOut(PT);
    var rise = null, fieldFade = null, renderer = opts.renderer || null;
    var aimPt = new T.Vector3();
    var T3 = terrainModule();
    if (!T3 && state.mode === 'terrain') state.mode = 'tiles';
    var terrainBudgetMs = opts.terrainMs > 0 ? opts.terrainMs : TERRAIN_MS;
    var bake = null, pendingOld = null, home = { x: -1, z: -2 };   /* pendingOld: the ground on screen while new land rises */

    var group = new T.Group();
    group.name = 'env';
    var owned = { geos: [], mats: [], texs: [], meshes: [] };

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
    var sunPos = (L.DUSK && L.DUSK.sunPos) || L.DAY.sunPos || [-9, 7.5, 8];
    sun.position.set(sunPos[0], sunPos[1], sunPos[2]);
    sun.target.position.set(0, 0, 0);
    sun.castShadow = !!budget.shadows && quality.shadows;
    sun.shadow.mapSize.set(budget.shadowMapSize || 1024, budget.shadowMapSize || 1024);
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.03;
    /* static map: the stage sets renderer.shadowMap.autoUpdate = false and beforeRender() raises
       renderer.shadowMap.needsUpdate once per change */
    var sc = sun.shadow.camera;
    sc.left = -13; sc.right = 13; sc.top = 9; sc.bottom = -9; sc.near = 1; sc.far = 45;
    sc.updateProjectionMatrix();
    group.add(hemi, sun, sun.target);
    var fog = new T.Fog(0xffffff, 28, 72);
    if (opts.scene) opts.scene.fog = fog;

    /* ---------------- shared geometry (cached in K.parts per tier; K disposes them) ---------------- */
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
        if (gx * gx + gy * gy + gz * gz < 1e-14) return;
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
      var G = Kt.G, lw = Kt.tier === 'LOW', out = {};
      /* LED ring buoy: a dark float with a collar and a slim mast, a square lamp head on top */
      var body = G.t(G.puff(0.3, { sphere: true }), { s: [1, 0.55, 1], p: [0, 0.04, 0] });
      G.paintBy(body, function (p) { return p.y > 0.1 ? ['Graphite', 'hi'] : p.y < -0.05 ? ['Gunmetal Deep', 'shade'] : 'Graphite'; });
      var collar = G.paint(G.t(G.tube(0.2, 0.24, 0.06), { p: [0, 0.18, 0] }), 'Gunmetal');
      var mast = G.paint(G.t(G.tube(0.028, 0.036, 0.68), { p: [0, 0.54, 0] }), 'Gunmetal');
      var head = G.paintBy(G.t(G.slab(0.16, 0.08, 0.16, { arch: true }), { p: [0, BUOY.headY, 0] }), function (p) { return p.ny > 0.7 ? ['Graphite', 'hi'] : 'Graphite'; });
      out.buoy = G.merge([body, collar, mast, head]);
      /* the light pole behind the house: a concrete foot, a gunmetal pole, a square lamp head */
      var base = G.paintBy(G.t(G.slab(0.24, 0.08, 0.24, { arch: true }), { p: [0, 0.04, 0] }), function (p) { return p.ny > 0.7 ? ['Concrete', 'hi'] : 'Concrete'; });
      var pole = G.paint(G.t(G.tube(0.03, 0.04, 1.56), { p: [0, 0.83, 0] }), 'Gunmetal');
      var phead = G.paintBy(G.t(G.slab(0.18, 0.08, 0.18, { arch: true }), { p: [0, POLE.headY, 0] }), function (p) { return p.ny > 0.7 ? ['Graphite', 'hi'] : 'Graphite'; });
      out.pole = G.merge([base, pole, phead]);
      /* the neon accent unit: a 1 × 1 × 1 box (strips, tiles, lamp lenses and ring segments scale it) */
      out.unit = G.paint(G.normalise(new T.BoxGeometry(1, 1, 1)), 'Cloud White');
      /* a dusk cloud streak: merged puffs, stretched flat by CLOUD_SHAPE per instance */
      var puffs = [[0.62, 0, 0, 0], [0.46, -0.62, -0.12, 0.06], [0.5, 0.62, -0.1, -0.05], [0.38, 0.22, 0.34, 0.12], [0.34, -0.3, 0.26, -0.1]];
      out.cloud = G.merge(puffs.slice(0, lw ? 4 : 5).map(function (p) { return G.t(G.puff(p[0]), { p: [p[1], p[2], p[3]], s: [1, 0.82, 1] }); }));
      G.paintBy(out.cloud, function (p) { return p.y < -0.2 ? 'Holo Pink' : 'Bone White'; });
      /* v1 fallback ground: tiles, sand skirt and the per-cell dressing */
      var ts = TILE[Kt.tier] || TILE.MID, ss = SAND[Kt.tier] || SAND.MID, shades = ts.shade.map(grey), white = new T.Color(1, 1, 1);
      var sandCols = ss.rings.map(function (r) { return r.tone ? Kt.tone(r.tok, r.tone) : Kt.col(r.tok); });
      out.tileTop = tileGeometry(ts, 'top', function () { return white; }, white);
      out.tileSide = tileGeometry(ts, 'side', function (i) { return shades[i]; }, white);
      out.sand = tileGeometry({ a: ss.a, N: ss.N, rings: ss.rings, topStrips: 0 }, 'all', function (i) { return sandCols[i]; }, sandCols[0]);
      var blades = [], nb = lw ? 2 : 3;
      for (var i = 0; i < nb; i++) {
        var b = G.t(G.cone(0.03, 0.16, 3), { p: [0, 0.08, 0] });
        G.t(b, { s: [1, 1, 0.45] });
        G.t(b, { r: [0, 0, (i - (nb - 1) / 2) * 24] });
        G.t(b, { r: [0, i * 60 + 15, 0], p: [Math.cos(i * 2.1) * 0.02, 0, Math.sin(i * 2.1) * 0.02] });
        G.paintBy(b, function (v) { return v.y > 0.1 ? ['Leaf Lit', 'hi'] : v.y < 0.03 ? ['Turf Shade', 'shade'] : 'Leaf Deep'; });
        blades.push(b);
      }
      out.tuft = G.merge(blades);
      out.flower = G.t(G.tube(0.045, 0.05, 0.022, { radial: lw ? 5 : 6 }), { p: [0, 0.013, 0] });
      G.paintBy(out.flower, function (v) { return v.y > 0.02 && Math.abs(v.x) + Math.abs(v.z) < 0.012 ? 'Butter' : 'Cloud White'; });
      out.shell = G.t(G.tube(0, 0.065, 0.035, { radial: 7 }), { s: [1, 1, 0.8], p: [0, 0.0175, 0] });
      G.paintBy(out.shell, function (v) { return v.face % 2 ? ['Blossom Light', 'hi'] : 'Blossom Light'; }, { perFace: true });
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
      return out;
    });

    /* ---------------- instanced helpers ---------------- */
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
    function rec(x, y, z, yaw, sx, sy, sz, color, cell) {
      return { x: x, y: y, z: z, yaw: yaw || 0, sx: sx, sy: sy, sz: sz, color: color, cell: cell, rise: y - Gr.SEA_Y + RISE_FLOOR };
    }
    /* a geometry from SLTerrain3D arrays (indexed or not) */
    function geoFrom(a) {
      var g = new T.BufferGeometry();
      g.setAttribute('position', new T.BufferAttribute(a.position, 3));
      g.setAttribute('normal', new T.BufferAttribute(a.normal, 3));
      g.setAttribute('color', new T.BufferAttribute(a.color, 3));
      if (a.index) g.setIndex(new T.BufferAttribute(a.index, 1));
      g.computeBoundingSphere();
      return g;
    }
    /* three copies of one cone (position + normal + index) in one geometry, aCone = the copy */
    function coneTriple(g) {
      var P = g.getAttribute('position'), N = g.getAttribute('normal'), I = g.index, nv = P.count, ni = I ? I.count : 0;
      var pos = new Float32Array(nv * 9), nor = new Float32Array(nv * 9), id = new Float32Array(nv * 3);
      var idx = ni ? (nv * 3 > 65535 ? new Uint32Array(ni * 3) : new Uint16Array(ni * 3)) : null;
      for (var c = 0; c < 3; c++) {
        pos.set(P.array, c * nv * 3); nor.set(N.array, c * nv * 3);
        id.fill(c, c * nv, (c + 1) * nv);
        for (var k = 0; k < ni; k++) idx[c * ni + k] = I.array[k] + c * nv;
      }
      var out = new T.BufferGeometry();
      out.setAttribute('position', new T.BufferAttribute(pos, 3));
      out.setAttribute('normal', new T.BufferAttribute(nor, 3));
      out.setAttribute('aCone', new T.BufferAttribute(id, 1));
      if (idx) out.setIndex(new T.BufferAttribute(idx, 1));
      return out;
    }
    /* a count-1 InstancedMesh on the shared toon program holding one merged geometry */
    function solo(name, o) {
      var m = new T.InstancedMesh(new T.BufferGeometry(), K.mat('toon'), 1);
      m.instanceColor = new T.InstancedBufferAttribute(new Float32Array([1, 1, 1]), 3);
      m.name = 'env:' + name; m.frustumCulled = false; m.visible = false;
      m.castShadow = !!(o && o.cast); m.receiveShadow = !(o && o.receive === false);
      group.add(m);
      owned.meshes.push(m);
      return m;
    }
    function setGeo(mesh, arrays) {
      var old = mesh.geometry;
      if (arrays && arrays.position && arrays.position.length) { mesh.geometry = geoFrom(arrays); mesh.visible = true; }
      else { mesh.geometry = new T.BufferGeometry(); mesh.visible = false; }
      if (old) old.dispose();
    }

    /* ---------------- the v1 tile ground (fallback) ---------------- */
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

    /* ---------------- the organic ground (terrain mode) ---------------- */
    var terrainM = solo('terrain', { cast: false });
    var sceneryM = solo('scenery', { cast: true });
    var layoutM = solo('layout', { cast: false });
    var bandMs = [];

    /* ---------------- buoys, pole ---------------- */
    var BUOYS = (L.CONES && L.CONES.buoys) || [[-9.5, -0.32, -6.5], [9.5, -0.32, -6.5]];
    var buoyM = newIM(GEO.buoy, K.mat('toon'), 2); buoyM.name = 'env:buoys'; buoyM.count = 2; buoyM.visible = true; buoyM.receiveShadow = false;
    var poleM = newIM(GEO.pole, K.mat('toon'), 1); poleM.name = 'env:pole'; poleM.count = 1; poleM.visible = true;
    buoyM.instanceMatrix.setUsage(T.DynamicDrawUsage);
    group.add(buoyM, poleM);
    owned.meshes.push(buoyM, poleM);
    var polePt = { x: -1, y: 0, z: -3.6 };
    var buoyMat = [new T.Matrix4(), new T.Matrix4()], sources = [new T.Vector3(), new T.Vector3(), new T.Vector3()];
    var buoyPhase = [Gr.hash01('buoy:0'), Gr.hash01('buoy:1')];
    var coneMounts = null;
    var coneTokens = (L.CONES && L.CONES.tokens) || ['Neon Magenta', 'LED Cyan', 'Electric Violet'];
    var lensOn = coneTokens.map(function (t) { return K.col(t); });

    /* ---------------- neon accents: one InstancedMesh of unit boxes on 'state' ----------------
       static scenery LEDs (edge strips, wall caps, plaza tiles, bollards, lamps) + the buoy rings +
       the 3 cone lamp lenses; each knows its wake delay */
    var RING_SEG = BUOY.ringSeg[tier] || 14;
    var neonM = null, neonRecs = [], neonDyn = 0;
    function buildNeon(list) {
      var recs = [];
      (list || []).forEach(function (n) { recs.push({ x: n.x, y: n.y, z: n.z, yaw: n.yaw || 0, sx: n.w ? n.w : n.len, sy: n.w ? n.r : n.r * 2, sz: n.w ? n.w : n.r * 2, role: n.role, i: n.i || 0, j: n.j || 0, dyn: false }); });
      for (var b = 0; b < 2; b++) for (var s = 0; s < RING_SEG; s++) recs.push({ role: 'ring', buoy: b, seg: s, i: b, dyn: true, sx: TAU * BUOY.ringR / RING_SEG * 1.04, sy: 0.03, sz: 0.03 });
      for (var l = 0; l < 3; l++) recs.push({ role: 'lens', lens: l, i: l, dyn: true, sx: 0.13, sy: 0.012, sz: 0.13 });
      recs.forEach(function (r) {
        r.delay = r.dyn ? (r.role === 'lens' ? 0.04 * r.i : 0.12 * r.i) : wakeDelay(r.x, r.z, home);
        r.w = state.wakeOn ? 1 : 0;
      });
      neonRecs = recs;
      var cap = recs.length;
      if (!neonM || neonM.instanceMatrix.count < cap) {
        if (neonM) { group.remove(neonM); neonM.dispose(); owned.meshes.splice(owned.meshes.indexOf(neonM), 1); }
        neonM = newIM(GEO.unit, K.mat('state'), Math.max(cap, 64));
        neonM.name = 'env:neon'; neonM.receiveShadow = false; neonM.renderOrder = 1;
        neonM.instanceMatrix.setUsage(T.DynamicDrawUsage); neonM.instanceColor.setUsage(T.DynamicDrawUsage);
        group.add(neonM); owned.meshes.push(neonM);
      }
      neonM.count = cap; neonM.visible = cap > 0;
      neonDyn = 0;
      for (var k = 0; k < recs.length; k++) {
        var r = recs[k];
        if (r.dyn) { neonDyn++; continue; }
        _p.set(r.x, r.y, r.z); _q.setFromAxisAngle(_up, r.yaw); _s.set(r.sx, r.sy, r.sz);
        neonM.setMatrixAt(k, _m.compose(_p, _q, _s));
      }
      neonM.instanceMatrix.needsUpdate = true;
      state.neonDirty = true; state.motionDirty = true;
    }
    /* the ripple: every light steps its own level toward the wake state after its delay */
    function stepWake(dt) {
      var on = state.wakeOn, target = on ? 1 : 0, moving = false, k;
      for (k = 0; k < neonRecs.length; k++) {
        var r = neonRecs[k];
        r.w = wakeStep(r.w, on, ripple.t, r.delay, dt, state.reduced);
        if (r.w !== target) moving = true;
      }
      for (k = 0; k < haloRecs.length; k++) {
        var h = haloRecs[k];
        h.w = wakeStep(h.w, on, ripple.t, h.delay, dt, state.reduced);
        if (h.w !== target) moving = true;
      }
      state.waking = moving;
    }
    function updateNeonColours() {
      if (!neonM) return;
      var kl = state.kLight < 0 ? 0 : state.kLight, t = state.animT;
      for (var k = 0; k < neonRecs.length; k++) {
        var r = neonRecs[k];
        neonColour(r.role, kl, wakeEase(r.w) * (1 - state.editK), state.member, t, r.i, r.j, state.reduced, _nc);
        _c.setRGB(_nc[0], _nc[1], _nc[2], T.SRGBColorSpace);
        neonM.setColorAt(k, _c);
      }
      neonM.instanceColor.needsUpdate = true;
      updateHalos();
    }

    /* ---------------- the ambient halo layer (shared with life3d) ---------------- */
    var halos = K.billboards({ capacity: HALO_CAP, texture: 'halo', name: 'env:halos', additive: true, renderOrder: 6 });
    group.add(halos.mesh);
    var haloRecs = [];
    function buildHalos(list) {
      haloRecs.forEach(function (h) { halos.free(h.slot); });
      haloRecs = [];
      var all = (list || []).slice();
      for (var b = 0; b < 2; b++) all.push({ role: 'ringGlow', buoy: b, size: 1.3, token: 'Electric Violet' });
      all.forEach(function (h) {
        var slot = halos.alloc();
        if (slot < 0) return;
        haloRecs.push({ slot: slot, x: h.x, y: h.y, z: h.z, size: h.size, color: K.col(h.token), role: h.role, buoy: h.buoy,
                        delay: h.x != null ? wakeDelay(h.x, h.z, home) : 0.12 * (h.buoy || 0), w: state.wakeOn ? 1 : 0 });
      });
      updateHalos();
    }
    function updateHalos() {
      var kl = state.kLight < 0 ? 0 : state.kLight;
      for (var i = 0; i < haloRecs.length; i++) {
        var h = haloRecs[i], w = wakeEase(h.w) * (1 - state.editK), a, x = h.x, y = h.y, z = h.z;
        if (h.role === 'ringGlow') { a = 0.12 + 0.38 * w; x = sources[h.buoy].x; y = Gr.SEA_Y + 0.12; z = sources[h.buoy].z; }
        else a = (0.35 + 0.4 * Math.max(kl, w)) * (h.role === 'lamp' ? 1 : 0.8);
        halos.set(h.slot, x, y, z, h.size, h.color, a);
      }
      halos.commit();
    }

    /* ---------------- clouds (MID / HIGH: never visible in landscape on LOW) ---------------- */
    var nClouds = low ? 0 : CLOUDS.length;
    var cloudM = newIM(GEO.cloud, K.mat('toon'), Math.max(1, nClouds));
    cloudM.name = 'env:clouds'; cloudM.count = nClouds; cloudM.visible = nClouds > 0; cloudM.receiveShadow = false;
    cloudM.instanceMatrix.setUsage(T.DynamicDrawUsage);
    group.add(cloudM); owned.meshes.push(cloudM);

    /* ---------------- sky ---------------- */
    var skyGeo = new T.SphereGeometry(SKY_R, low ? 16 : 24, low ? 8 : 12);
    var hy = SUN_HALO.yawDeg * DEG, he = SUN_HALO.elevDeg * DEG;
    var skyU = {
      uTop: { value: new T.Color() }, uMid: { value: new T.Color() }, uHorizon: { value: new T.Color() }, uBelow: { value: new T.Color() },
      uBand: { value: 0.3 }, uHaloDir: { value: new T.Vector3(Math.sin(hy) * Math.cos(he), Math.sin(he), -Math.cos(hy) * Math.cos(he)) },
      uHaloCol: { value: K.col(SUN_HALO.token) }, uHaloK: { value: SUN_HALO.opacity }
    };
    /* every env ShaderMaterial draws through ONE program (ENV_PROGRAM: the sky, sea, star and cone passes
       joined, picked by uPass) — it only stays one program while all four keep the flags envMat sets */
    var envDefs = { REFL_N: Math.max(1, Math.min(14, budget.reflections || (low ? 4 : 6))) };
    if (low) envDefs.ENV_LOW = 1;
    function envMat(name, pass, u, o) {
      var fu = T.UniformsUtils.clone(T.UniformsLib.fog);
      for (var fk in fu) if (!u[fk]) u[fk] = fu[fk];             /* fog: true reads three's fog uniforms */
      u.uPass = { value: pass };
      var p = { name: name, uniforms: u, vertexShader: ENV_PROGRAM.vert, fragmentShader: ENV_PROGRAM.frag, defines: envDefs,
                side: T.DoubleSide, fog: true, depthWrite: false };
      for (var k in o) p[k] = o[k];
      return new T.ShaderMaterial(p);
    }
    /* NoBlending = what three draws an opaque NormalBlending material with; DoubleSide adds no pixel
       (the camera is always inside the dome) */
    var skyMat = envMat('env:sky', ENV_PASS.sky, skyU, { blending: T.NoBlending });
    var sky = new T.Mesh(skyGeo, skyMat);
    sky.name = 'env:sky'; sky.renderOrder = -10; sky.frustumCulled = false;
    owned.geos.push(skyGeo); owned.mats.push(skyMat);

    /* ---------------- sea ---------------- */
    function fieldTex() {
      var t = new T.DataTexture(new Uint8Array(FIELD.w * FIELD.h * 4), FIELD.w, FIELD.h, T.RGBAFormat, T.UnsignedByteType);
      t.minFilter = T.LinearFilter; t.magFilter = T.LinearFilter; t.generateMipmaps = false;
      t.wrapS = T.ClampToEdgeWrapping; t.wrapT = T.ClampToEdgeWrapping; t.flipY = false;
      t.needsUpdate = true;
      owned.texs.push(t);
      return t;
    }
    var fieldCur = fieldTex(), fieldPrev = fieldTex();
    var HT = hologramTokens(), REFL_N = envDefs.REFL_N;
    var reflArr = [], reflCol = [];
    for (var ri = 0; ri < REFL_N; ri++) { reflArr.push(new T.Vector4(0, 0, 0.3, 0)); reflCol.push(new T.Color(0, 0, 0)); }
    var seaU = T.UniformsUtils.merge([T.UniformsLib.fog, {
      uField: { value: null }, uFieldPrev: { value: null }, uFieldMix: { value: 1 },
      uFieldRect: { value: new T.Vector4(FIELD.x0, FIELD.z0, 1 / (FIELD.w * FIELD.texel), 1 / (FIELD.h * FIELD.texel)) },
      uFieldMax: { value: new T.Vector3(FIELD_PACK.maxShore, FIELD_PACK.maxLocked, FIELD_PACK.maxOther) },
      uTime: { value: 0 }, uShow: { value: 0 }, uGlints: { value: 1 }, uSpots: { value: 0 },
      uSandReach: { value: 0 }, uLockedEdge: { value: 0 }, uHalf: { value: SEA_SIZE / 2 },
      uWaveA: { value: SEA.waveA[0] }, uWaveW: { value: SEA.waveW }, uDeepAt: { value: SEA.deepAt[0] }, uFoam2: { value: SEA.foam2[0] },
      uShallow: { value: new T.Color() }, uDeep: { value: new T.Color() }, uFoam: { value: new T.Color() }, uWave: { value: new T.Color() },
      uLagoon: { value: new T.Color() }, uGlintCol: { value: new T.Color() },
      uSandbar: { value: new T.Color() }, uEdge: { value: new T.Color() }, uFogCol: { value: new T.Color() },
      uSpotColA: { value: new T.Color() }, uSpotColB: { value: new T.Color() },
      uSpotA: { value: new T.Vector4(0, 0, 1, 0) }, uSpotB: { value: new T.Vector4(0, 0, -1, 0) },
      uRefl: { value: [] }, uReflCol: { value: [] }, uReflK: { value: 0 }, uQuayK: { value: 0 },
      uBoat: { value: null }
    }]);
    seaU.uField.value = fieldCur; seaU.uFieldPrev.value = fieldPrev;   /* after merge: shared, not cloned */
    /* every material of the shared env program binds the field textures, so no draw ever leaves the
       program's samplers on a stale texture unit (the sky's own pass never samples them) */
    skyU.uField = seaU.uField; skyU.uFieldPrev = seaU.uFieldPrev;
    seaU.uRefl.value = reflArr; seaU.uReflCol.value = reflCol;
    /* the boats' V wakes (MID / HIGH): life3d's uBoat[4] array, (x, z, dirX·w, dirZ·w) per boat */
    var noBoats = new Float32Array(16);
    seaU.uBoat.value = noBoats;
    seaU.uSandbar.value.copy(K.col(HT.sandbar)); seaU.uEdge.value.copy(K.col(HT.edge));
    seaU.uSpotColA.value.copy(lensOn[0]); seaU.uSpotColB.value.copy(lensOn[1]);
    /* opaque, depth-writing: NoBlending (as three draws an opaque material); DoubleSide on a plane the
       camera only ever sees from above */
    var seaMat = envMat('env:sea', ENV_PASS.sea, seaU, { blending: T.NoBlending, depthWrite: true });
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
    var starU = { uTime: { value: 0 }, uPR: { value: 1 }, uSize: { value: 2 }, uAlpha: { value: 0 }, uZenith: { value: 1 }, uFogNear: { value: 28 }, uFogFar: { value: 72 },
                  uField: seaU.uField, uFieldPrev: seaU.uFieldPrev };
    /* (points are never culled: DoubleSide changes nothing for them) */
    var starMat = envMat('env:stars', ENV_PASS.stars, starU, { transparent: true, blending: T.AdditiveBlending });
    var stars = new T.Points(starGeo, starMat);
    stars.name = 'env:stars'; stars.frustumCulled = false; stars.renderOrder = 2; stars.visible = false;
    owned.geos.push(starGeo); owned.mats.push(starMat);

    /* ---------------- spotlight cones ---------------- */
    /* one mesh holding the 3 open cones (aCone = 0, 1, 2), each placed by its uConeM matrix and tinted
       uConeCol: not an InstancedMesh, so it shares the env program (still one draw call) */
    var cone1 = new T.ConeGeometry(CONE_GEO.r, CONE_GEO.h, low ? CONE_GEO.radialLow : CONE_GEO.radial, 1, true);
    cone1.rotateX(Math.PI);
    cone1.translate(0, CONE_GEO.h / 2, 0);
    var coneGeo = coneTriple(cone1);
    cone1.dispose();
    var coneM = [new T.Matrix4(), new T.Matrix4(), new T.Matrix4()];
    var coneCol = [0, 1, 2].map(function (ci) { return (lensOn[ci] || lensOn[0]).clone(); });
    var coneU = { uAlpha: { value: 0 }, uLen: { value: CONE_GEO.h }, uFogNear: { value: 28 }, uFogFar: { value: 72 },
                  uConeM: { value: coneM }, uConeCol: { value: coneCol }, uField: seaU.uField, uFieldPrev: seaU.uFieldPrev };
    var coneMat = envMat('env:cones', ENV_PASS.cones, coneU, { transparent: true, blending: T.AdditiveBlending });
    var cones = new T.Mesh(coneGeo, coneMat);
    cones.name = 'env:cones'; cones.frustumCulled = false; cones.renderOrder = 4; cones.visible = false;
    owned.geos.push(coneGeo); owned.mats.push(coneMat);
    group.add(sky, stars, sea, cones);

    /* ---------------- the city across the bay and the ambient life (optional modules) ---------------- */
    var city = null, life = null;
    function mountExtra(name, glob, extra) {
      var mod = root[glob];
      if (!mod || typeof mod.create !== 'function' || opts[name] === false) return null;
      try {
        var o = { tier: tier, member: state.member, reduced: state.reduced, name: state.name };
        for (var k in extra) o[k] = extra[k];
        var inst = mod.create(K, SL3D, o);
        if (inst && inst.group) group.add(inst.group);
        return inst;
      } catch (e) { issue(glob + ' failed: ' + (e && e.message || e)); return null; }
    }
    /* a sibling module that throws is switched off (logged once); the island keeps going */
    function safeCall(which, fn) {
      var inst = which === 'city' ? city : life;
      if (!inst) return;
      try { fn(inst); }
      catch (e) {
        issue(which + ' failed: ' + (e && e.message || e));
        try { if (inst.group && inst.group.parent) inst.group.parent.remove(inst.group); if (typeof inst.dispose === 'function') inst.dispose(); } catch (e2) {}
        if (which === 'city') city = null; else life = null;
      }
    }

    /* ================================================================
       THE LIGHT
       ================================================================ */
    function coneLevel() { return P.cones * (quality.cones ? 1 : 0); }
    function applyLight(k, force) {
      k = clamp01(+k || 0);
      if (!force && state.applied && Math.abs(k - state.kLight) < 1e-6) return;
      state.kLight = k; state.applied = true;
      mixPreset(k, PT, P);
      setSRGB(hemi.color, P.hemiSky); setSRGB(hemi.groundColor, P.hemiGround); hemi.intensity = P.hemiIntensity;
      setSRGB(sun.color, P.sunColor); sun.intensity = P.sunIntensity * state.keyCal;
      setSRGB(fog.color, P.fogColor); fog.near = P.fogNear; fog.far = P.fogFar;
      state.exposure = P.exposure;
      K.setRim(setSRGB(_rim, P.rimColor), P.rimStrength);
      setSRGB(skyU.uTop.value, P.skyTop); setSRGB(skyU.uMid.value, P.skyMid); setSRGB(skyU.uHorizon.value, P.skyHorizon);
      skyU.uBelow.value.copy(fog.color);
      skyU.uBand.value = 0.3 + (0.14 - 0.3) * k;               /* the Showtime city-glow band hugs the horizon (0–8°) */
      skyU.uHaloK.value = SUN_HALO.opacity * (1 - M.smoothstep(0, 0.6, k));
      setSRGB(seaU.uShallow.value, P.seaShallow); setSRGB(seaU.uDeep.value, P.seaDeep);
      setSRGB(seaU.uFoam.value, P.foam);
      seaU.uLagoon.value.copy(seaU.uShallow.value).lerp(seaU.uFoam.value, 0.3);
      seaU.uGlintCol.value.copy(WHITE).lerp(skyU.uHaloCol.value, 1 - k);
      /* the wave lines calm toward Showtime: fainter, and their colour sinks toward the shallows */
      seaWave(k, _sw);
      setSRGB(seaU.uWave.value, P.waveLine).lerp(seaU.uShallow.value, _sw.mix);
      seaU.uWaveA.value = _sw.a; seaU.uWaveW.value = _sw.w; seaU.uDeepAt.value = _sw.deepAt; seaU.uFoam2.value = _sw.foam2;
      seaU.uFogCol.value.copy(fog.color);
      seaU.uShow.value = k; seaU.uGlints.value = P.glints;
      starU.uAlpha.value = P.stars; starU.uZenith.value = 1 - M.smoothstep(0.2, 0.8, k);
      starU.uFogNear.value = coneU.uFogNear.value = P.fogNear; starU.uFogFar.value = coneU.uFogFar.value = P.fogFar;
      stars.visible = P.stars > 0.002;
      var cl = coneLevel();
      coneU.uAlpha.value = 0.2 * CONE_ALPHA_FACE * cl;
      seaU.uSpots.value = cl;
      if (cl > 0.002 && !cones.visible) state.motionDirty = true;
      cones.visible = cl > 0.002;
      seaU.uReflK.value = quality.reflections ? M.smoothstep(0.1, 0.9, k) : 0;
      seaU.uQuayK.value = M.smoothstep(0.05, 0.7, k) * (quality.reflections ? 1 : 0.5);
      K.setShow(k);                                       /* neon sleeves and halos follow the light */
      state.neonDirty = true;
    }
    /* the Showtime mix models see: the blend, eased back to 0 in edit mode */
    function modelShow() { return blend.k * (1 - state.editK); }

    /* ================================================================
       LAND
       ================================================================ */
    function writeField(data) {
      fieldPrev.image.data.set(fieldCur.image.data);
      fieldCur.image.data.set(data);
      fieldPrev.needsUpdate = true; fieldCur.needsUpdate = true;
    }
    /* bake the organic ground for a land set; a throw or a slow bake drops to the v1 tiles for good */
    function bakeFor(land) {
      if (state.mode !== 'terrain') return null;
      try {
        var r = bakeCached(T3, land, tier, state.seed, budget.terrainSpacing);
        state.bakeMs = r.ms;
        if (!r.cached && bakeTooSlow(r.ms, terrainBudgetMs)) { issue('terrain bake ' + Math.round(r.ms) + ' ms > ' + terrainBudgetMs + ' ms: v1 tiles'); toTiles(); return null; }
        return r.bake;
      } catch (e) { issue('terrain bake failed: ' + (e && e.message || e)); toTiles(); return null; }
    }
    function toTiles() {
      state.mode = 'tiles';
      bake = null;
      [terrainM, sceneryM, layoutM].forEach(function (m) { setGeo(m, null); });
      clearBands();
      seaU.uSandReach.value = Gr.SAND_REACH; seaU.uLockedEdge.value = LOCKED_EDGE;
      buildNeon([]); buildHalos([]);
    }
    function arraysOf(bk) {
      if (!bk._arrays) {
        var ter = T3.meshArrays(bk), scen = T3.sceneryArrays(bk);
        bk._arrays = { terrain: ter, scenery: scen, neon: scen.neon, halos: scen.halos };
      }
      return bk._arrays;
    }
    function showTerrain(bk) {
      var A = arraysOf(bk);
      if (low) { setGeo(terrainM, T3.mergeArrays([A.terrain, A.scenery])); setGeo(sceneryM, null); }
      else { setGeo(terrainM, A.terrain); setGeo(sceneryM, A.scenery); }
      buildNeon(A.neon); buildHalos(A.halos);
      groundLayers.forEach(function (Ly) { Ly.recs = []; Ly.mesh.count = 0; Ly.mesh.visible = false; });
    }
    function fitShadows() {
      var f = shadowFit(state.land, sunPos, 0.4, bake ? bake.bounds : null);
      sc.left = f.left; sc.right = f.right; sc.top = f.top; sc.bottom = f.bottom; sc.near = f.near; sc.far = f.far;
      sc.updateProjectionMatrix();
    }
    function landWithout(region) {
      var out = {};
      Object.keys(state.land).forEach(function (k) { if (C.CELL_REGION[k] !== region) out[k] = 1; });
      return out;
    }
    function homePoint() {
      var h = null;
      for (var i = 0; i < state.placed.length; i++) if (state.placed[i].id === 'house_cottage') { h = state.placed[i]; break; }
      var pv = Gr.pivot('house_cottage', h ? h.x : 6, h ? h.y : 2);
      return { x: pv.x, z: pv.z };
    }
    /* v1 tiles: the sand skirt (the final land's boundary, plus the old shore's during a rise) */
    function rebuildSand(extraLand) {
      var seen = {}, list = [];
      function add(cells) { cells.forEach(function (p) { if (!seen[p.key]) { seen[p.key] = 1; list.push(rec(p.x, Gr.SAND_Y, p.z, 0, 1, 1, 1, WHITE, p.key)); } }); }
      add(skirtCells(state.land));
      if (extraLand) add(skirtCells(extraLand));
      fill(sandL, list);
    }
    function rebuildTiles() {
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
      if (rise && rise.tiles) { collectRise(); applyRise(rise.t); }
    }
    /* terrain mode: the layout mesh = world-space dressing + plinth risers (Teak top, Concrete skirt) */
    function plinthArrays() {
      var G = K.G, parts = [];
      plinths(state.placed).forEach(function (pl) {
        var h = pl.top - pl.bottom + 0.06;
        var skirt = G.paint(G.t(G.slab(pl.w, h, pl.d, { arch: true }), { p: [pl.x, pl.top - h / 2, pl.z] }), 'Concrete');
        var top = G.paint(G.t(G.slab(pl.w - 0.06, 0.03, pl.d - 0.06, { arch: true }), { p: [pl.x, pl.top + PLINTH_DY - 0.012, pl.z] }), 'Teak');
        parts.push(skirt, top);
      });
      if (!parts.length) return null;
      var g = G.merge(parts);
      parts.forEach(function (p) { p.dispose(); });
      var out = { position: g.getAttribute('position').array, normal: g.getAttribute('normal').array, color: g.getAttribute('color').array, index: null, cell: null };
      g.dispose();
      return out;
    }
    function rebuildLayout(bk) {
      bk = bk || bake;
      if (state.mode !== 'terrain' || !bk) return;
      setGeo(layoutM, T3.mergeArrays([T3.dressingArrays(bk, state.placed), plinthArrays()]));
    }
    function rebuildGround() {
      if (state.mode === 'terrain' && bake) { if (!pendingOld) rebuildLayout(); }   /* rising land gets its dressing when it lands */
      else rebuildTiles();
    }
    function placePole() {
      var pp = polePosition(state.placed, state.land, heightAt);
      polePt.x = pp.x; polePt.y = pp.y; polePt.z = pp.z;
      _m.makeTranslation(pp.x, pp.y, pp.z);
      poleM.setMatrixAt(0, _m);
      poleM.instanceMatrix.needsUpdate = true;
      state.motionDirty = true;
    }
    function heightAt(x, z) {
      if (state.mode === 'terrain' && bake) return T3.heightAt(bake, x, z);
      var cell = Gr.worldToCell(x, z);
      return Gr.inGrid(cell.c, cell.r) && state.land[cell.c + ',' + cell.r] ? Gr.surfaceY(cell.c, cell.r) : Gr.SEA_Y;
    }
    function setPlaced(placed, force) {
      if (state.disposed) return;
      var list = Array.isArray(placed) ? placed.slice() : [], sig = placedSig(list);
      if (!force && sig === state.psig) return;
      state.placed = list; state.psig = sig;
      var hp = homePoint();
      if (Math.abs(hp.x - home.x) > 1e-6 || Math.abs(hp.z - home.z) > 1e-6) {
        home = hp;
        neonRecs.forEach(function (r) { if (!r.dyn) r.delay = wakeDelay(r.x, r.z, home); });
        haloRecs.forEach(function (h) { if (h.x != null) h.delay = wakeDelay(h.x, h.z, home); });
      }
      rebuildGround();
      placePole();
      invalidateShadows();
    }
    function setLand(unlocked, world, o) {
      if (state.disposed) return null;
      o = o || {};
      if (unlocked == null && world) unlocked = world;
      var land = landOf(unlocked == null ? ['home'] : unlocked), sig = landSig(land);
      /* a new child's seed waiting for this call re-bakes even an unchanged land signature */
      var reseed = state.seedDirty && state.sig !== null, changed = sig !== state.sig || reseed;
      var placed = world && Array.isArray(world.placed) ? world.placed : state.placed;
      if (changed) {
        var first = state.sig === null, oldBake = bake;
        state.land = land; state.sig = sig; state.landFrame = state.frame; state.seedDirty = false;
        if (reseed) finishRise();
        var nb = bakeFor(land);
        if (nb) {
          writeField(nb.field.data);
          seaU.uSandReach.value = 0; seaU.uLockedEdge.value = 0;
          bake = nb;
          /* a rise keeps the old ground on screen until its bands land (never another child's); otherwise swap now */
          if (!(o.rise && oldBake && !reseed && !(o.reduced != null ? o.reduced : state.reduced))) showTerrain(nb);
          else pendingOld = oldBake;
        } else {
          writeField(fieldFromGrid(land));
          seaU.uSandReach.value = Gr.SAND_REACH; seaU.uLockedEdge.value = LOCKED_EDGE;
        }
        fieldFade = null;
        seaU.uFieldMix.value = 1;                       /* a rise crossfades it from the old field */
        if (first) fieldPrev.image.data.set(fieldCur.image.data);
        fitShadows();
      }
      setPlaced(placed, changed);
      if (o.rise) return startRise(o.rise, o.reduced != null ? !!o.reduced : state.reduced, changed);
      return null;
    }

    /* ---------------- the unlock rise ---------------- */
    function clearBands() {
      bandMs.forEach(function (m) { group.remove(m); m.geometry.dispose(); m.dispose(); });
      bandMs = [];
    }
    /* v1 tiles: the cells' instances ride up with their per-cell delay */
    function collectRise() {
      rise.lists = groundLayers.map(function (Ly) {
        var idx = [];
        for (var i = 0; i < Ly.recs.length; i++) if (rise.delays[Ly.recs[i].cell] != null) idx.push(i);
        return idx;
      });
    }
    function applyRise(t) {
      if (rise.tiles) {
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
        return;
      }
      for (var b = 0; b < bandMs.length; b++) {
        var bm = bandMs[b];
        M.landRise(t, bm.userData.delay, rise.reduced, _lr);
        _m.makeTranslation(0, -bm.userData.drop * (1 - _lr.y01), 0);
        bm.setMatrixAt(0, _m);
        bm.instanceMatrix.needsUpdate = true;
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
      var tiles = state.mode !== 'terrain' || !bake;
      rise = { region: region, t: 0, dur: dur, reduced: reduced, delays: delays, lists: null, handle: handle, resolve: done, tiles: tiles, extra: tiles && !reduced ? landWithout(region) : null };
      if (!tiles && !reduced && !pendingOld) {
        /* the land already shows the region (setLand ran first): put the ground without it back on
           screen for the rise (that bake is normally still cached) */
        try { var ob = bakeCached(T3, landWithout(region), tier, state.seed, budget.terrainSpacing).bake; showTerrain(ob); rebuildLayout(ob); pendingOld = ob; }
        catch (e) { issue('rise: ' + (e && e.message || e)); }
      }
      if (tiles) { rebuildSand(rise.extra); collectRise(); }
      else if (!reduced && pendingOld) {
        /* the new region's terrain + scenery triangles rise in bands over the old ground */
        var bands = riseBands(region, state.land, low ? 3 : BAND_MAX), A = arraysOf(bake);
        var parts = T3.sliceBands(T3.mergeArrays([A.terrain, A.scenery]), bands.bandOf, bands.n);
        parts.forEach(function (pa, b) {
          if (!pa.tris) return;
          var m = new T.InstancedMesh(geoFrom(pa), K.mat('toon'), 1);
          m.instanceColor = new T.InstancedBufferAttribute(new Float32Array([1, 1, 1]), 3);
          m.name = 'env:rise' + b; m.frustumCulled = false; m.receiveShadow = true;
          var top = -Infinity;
          for (var v = 1; v < pa.position.length; v += 3) if (pa.position[v] > top) top = pa.position[v];
          m.userData.delay = bands.delays[b] || 0;
          m.userData.drop = Math.max(0.05, top - (Gr.SEA_Y - RISE_FLOOR));
          group.add(m);
          bandMs.push(m);
        });
      }
      applyRise(0);
      if (fadeField) { seaU.uFieldMix.value = 0; fieldFade = { t: 0, dur: Math.max(dur, M.SHOW_MIX_REDUCED_SEC) }; }
      return handle;
    }
    function finishRise() {
      if (!rise) return;
      var r = rise;
      applyRise(1e6);
      rise = null;
      if (r.tiles) rebuildSand(null);
      else {
        /* one frame: the merged new ground replaces the old one and the bands */
        clearBands();
        if (pendingOld && bake) { showTerrain(bake); pendingOld = null; }
        rebuildLayout();
      }
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
        _p.set(_cl.x, _cl.y, _cl.z); _q.setFromAxisAngle(_up, _cl.yaw);
        _s.set(_cl.s * CLOUD_SHAPE[0], _cl.s * CLOUD_SHAPE[1], _cl.s * CLOUD_SHAPE[2]);
        cloudM.setMatrixAt(i, _m.compose(_p, _q, _s));
      }
      if (nClouds) cloudM.instanceMatrix.needsUpdate = true;
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
      }
      /* the cone lamps: the buoys' lamp heads and the pole (or the mounts the stage truss gave) */
      for (var s = 0; s < 3; s++) {
        if (coneMounts && coneMounts[s]) sources[s].set(coneMounts[s].x, coneMounts[s].y, coneMounts[s].z);
        else if (s < 2) sources[s].set(0, BUOY.apex, 0).applyMatrix4(buoyMat[s]);
        else sources[s].set(polePt.x, polePt.y + POLE.apex, polePt.z);
      }
      buoyM.instanceMatrix.needsUpdate = true;
      if (!neonM) return;
      for (var k = 0; k < neonRecs.length; k++) {
        var r = neonRecs[k];
        if (!r.dyn) continue;
        if (r.role === 'ring') {
          var a = (r.seg + 0.5) / RING_SEG * TAU;
          _m2.makeRotationY(-a + Math.PI / 2);
          _m2.setPosition(Math.cos(a) * BUOY.ringR, BUOY.ringY, Math.sin(a) * BUOY.ringR);
          _m3.makeScale(r.sx, r.sy, r.sz);
          _m.multiplyMatrices(buoyMat[r.buoy], _m2).multiply(_m3);
        } else {
          var src = sources[r.lens];                   /* the lens on the lamp head's top face, under the cone */
          _m.makeScale(r.sx, r.sy, r.sz).setPosition(src.x, src.y - (BUOY.apex - BUOY.lens), src.z);
        }
        neonM.setMatrixAt(k, _m);
      }
      neonM.instanceMatrix.needsUpdate = true;
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
        coneM[i].compose(sources[i], _q, _one);
        if (i < 2) {
          var hl = Math.sqrt(_ax.x * _ax.x + _ax.z * _ax.z) || 1, sp = i === 0 ? seaU.uSpotA.value : seaU.uSpotB.value;
          sp.set(sources[i].x, sources[i].z, _ax.x / hl, _ax.z / hl);
        }
      }
    }
    /* the sibling ticks, bound once (nothing in update() allocates) */
    var tick = { dt: 0, k: 0, show: 0, busy: false, list: null };
    function cityTick(c) { if (typeof c.update === 'function' && c.update(tick.dt, tick.k)) tick.busy = true; }
    function lifeTick(l) { if (typeof l.update === 'function' && l.update(tick.dt, tick.k, tick.show)) tick.busy = true; }
    function cityRefl(c) { tick.list = typeof c.reflections === 'function' ? c.reflections() : null; }
    /* the water taxis' and catamarans' wakes on the sea (MID / HIGH; life3d keeps them 0 on LOW and
       after the ladder's 'life' step); the same Float32Array every frame, so it is simply bound */
    function lifeBoats(l) {
      var b = typeof l.boats === 'function' ? l.boats() : null;
      seaU.uBoat.value = b && b.length >= 16 ? b : noBoats;
    }
    /* city light pillars on the water (P1): the city's list, else the 2 LED ring buoys */
    function updateReflections() {
      var list = null, n = 0;
      if (city) { tick.list = null; safeCall('city', cityRefl); list = tick.list; }
      for (var i = 0; i < REFL_N; i++) {
        var r = list && list[i], v = reflArr[i];
        if (r) { v.set(r.x, r.z, r.w || 0.3, r.intensity == null ? 1 : r.intensity); if (r.color) { if (r.color.isColor) reflCol[i].copy(r.color); else reflCol[i].set(r.color); } n++; }
        else if (!list && i < 2) { v.set(sources[i].x, sources[i].z, 0.35, 0.6); reflCol[i].copy(lensOn[2] || lensOn[0]); n++; }
        else v.w = 0;
      }
      return n;
    }
    function update(dt, t, showK) {
      if (state.disposed) return false;
      dt = typeof dt === 'number' && dt > 0 ? Math.min(dt, 0.1) : 0;
      state.frame++;
      /* a new seed that no setLand followed within SEED_WAIT of frames: its coastline on the current land */
      if (state.seedDirty && (state.seedWait += dt) >= SEED_WAIT) setLand(state.land, null);
      if (!state.reduced) state.animT += dt;
      var busy = false;
      if (typeof showK === 'number' && isFinite(showK)) {
        var k = clamp01(showK);
        setWake(k > 0.5);
        blend.k = blend.from = blend.to = k; blend.t = blend.dur = 0;
      } else if (blendStep(blend, dt)) busy = true;
      /* edit mode eases the light back to golden hour */
      if (state.editK !== state.editTo) {
        state.editT = Math.min(EDIT_SEC, state.editT + dt);
        state.editK = state.reduced ? state.editTo : state.editFrom + (state.editTo - state.editFrom) * M.ease.inOutSine(state.editT / EDIT_SEC);
        if (state.editT >= EDIT_SEC) state.editK = state.editTo;
        busy = true;
      }
      var kl = lightMix(blend.k, driftK(state.animT, state.reduced), state.editK);
      if (busy || Math.abs(kl - state.kLight) > 0.0015) applyLight(kl);
      /* the ripple clock runs every frame (env's own lights may settle before a far item's delay) */
      rippleAdvance(ripple, dt);
      if (state.waking) { stepWake(dt); state.neonDirty = true; busy = true; }
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
        state.neonDirty = true;
      }
      if (state.neonDirty) { updateNeonColours(); state.neonDirty = false; }
      if (seaU.uReflK.value > 0.001 || seaU.uQuayK.value > 0.001) updateReflections();
      tick.dt = dt; tick.k = state.kLight; tick.show = modelShow(); tick.busy = false;
      if (city) safeCall('city', cityTick);
      if (life) safeCall('life', lifeTick);
      if (life && !low) safeCall('life', lifeBoats);
      else if (seaU.uBoat.value !== noBoats) seaU.uBoat.value = noBoats;      /* life gone: no ghost wakes */
      if (tick.busy) busy = true;
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
    /* start the 'city wakes up' ripple (on) or its fade back (off); a reversal mid-ripple carries on
       from each light's current level, so nothing jumps */
    function setWake(on) {
      on = !!on;
      if (on === state.wakeOn) return;
      rippleToggle(ripple, on);
      state.wakeOn = on; state.waking = true; state.neonDirty = true;
    }
    function setQuality(q) {
      if (!q) return;
      if (q.shadows != null) quality.shadows = !!q.shadows;
      if (q.cones != null) quality.cones = !!q.cones;
      if (q.reflections != null) quality.reflections = !!q.reflections;
      if (q.particleScale) quality.particleScale = q.particleScale;
      if (q.lifeScale) quality.lifeScale = q.lifeScale;
      var cast = !!budget.shadows && quality.shadows;
      if (cast !== sun.castShadow) { sun.castShadow = cast; invalidateShadows(); }
      starGeo.setDrawRange(0, Math.max(1, Math.round(nStars * Math.min(1, quality.particleScale))));
      applyLight(state.kLight < 0 ? 0 : state.kLight, true);
      safeCall('life', function (l) { if (typeof l.setQuality === 'function') l.setQuality(quality); });
      safeCall('city', function (c) { if (typeof c.setQuality === 'function') c.setQuality(quality); });
    }
    var unsubQ = SL3D && typeof SL3D.onQuality === 'function' ? SL3D.onQuality(function (q) { setQuality(q); }) : null;

    function layerInfo(objs) {
      var calls = 0, tris = 0;
      objs.forEach(function (o) {
        if (!o) return;
        o.traverse(function (n) {
          if (!n.visible || !(n.isMesh || n.isPoints)) return;
          var cnt = n.isInstancedMesh ? n.count : 1;
          if (!cnt) return;
          calls++;
          var g = n.geometry, vc = g.index ? g.index.count : (g.getAttribute('position') ? g.getAttribute('position').count : 0);
          if (n.isMesh) tris += (vc / 3) * cnt;
        });
      });
      return { calls: calls, tris: Math.round(tris) };
    }

    var env = {
      VERSION: VERSION, group: group, lights: { hemi: hemi, sun: sun }, fog: fog, tier: tier,
      update: update, beforeRender: beforeRender,
      attach: function (r) { renderer = r || null; state.clear.setRGB(-1, -1, -1); state.pr = 0; },
      setLand: setLand, setPlaced: setPlaced, riseRegion: riseRegion,
      setShow: function (k) {
        var kk = clamp01(+k || 0);
        setWake(kk > 0.5);
        blend.k = blend.from = blend.to = kk; blend.t = blend.dur = 0;
        applyLight(lightMix(kk, driftK(state.animT, state.reduced), state.editK), true);
      },
      showtime: function (on, o) {
        var red = o && o.reduced != null ? !!o.reduced : state.reduced;
        setWake(!!on);
        return blendTo(blend, on ? 1 : 0, red);
      },
      setEdit: function (on) {
        var to = on ? 1 : 0;
        if (to === state.editTo) return;
        state.editFrom = state.editK; state.editTo = to; state.editT = 0;
        if (state.reduced) state.editK = to;
        state.neonDirty = true;
        safeCall('life', function (l) { if (typeof l.setEdit === 'function') l.setEdit(!!on); });
      },
      aim: function (pt, o) {
        if (pt && isFinite(pt.x) && isFinite(pt.z)) { aimPt.set(pt.x, (pt.y || 0) + AIM_LIFT, pt.z); state.aimTo = 1; }
        else state.aimTo = 0;
        if (state.reduced || (o && o.instant)) state.aimK = state.aimTo;
        state.motionDirty = true;
      },
      setConeMounts: function (list) {
        coneMounts = Array.isArray(list) && list.length ? list.slice(0, 3).map(function (p) { return { x: +p.x || 0, y: +p.y || 0, z: +p.z || 0 }; }) : null;
        state.motionDirty = true;
      },
      setMember: function (hex) {
        state.member = hex || null; PT = presetTables(state.member);
        applyLight(state.kLight < 0 ? 0 : state.kLight, true);
        safeCall('city', function (c) { if (typeof c.setMember === 'function') c.setMember(hex); });
        safeCall('life', function (l) { if (typeof l.setMember === 'function') l.setMember(hex); });
      },
      setUser: function (u) {
        if (!u) return;
        if (u.color) env.setMember(u.color);
        if (u.name != null) { state.name = String(u.name); safeCall('city', function (c) { if (typeof c.setUser === 'function') c.setUser({ name: state.name, color: state.member }); }); }
        if (u.seed != null && String(u.seed) !== state.seed) env.setSeed(u.seed);
      },
      /* a different child: their own coastline. The bake waits for the next setLand — the profile
         switch's sync, which brings the NEXT child's land (re-baking the previous child's land with the
         new seed first was a wasted bake, and it used up one of the slow-bake rule's two cold-JIT
         slots) — or, when no sync comes, for SEED_WAIT (0.5 s) of frames */
      setSeed: function (seed) {
        seed = seed == null ? '' : String(seed);
        if (seed === state.seed || state.disposed) return;
        state.seed = seed;
        if (state.mode !== 'terrain') return;
        finishRise();
        if (state.sig !== null) { state.seedDirty = true; state.seedWait = 0; }   /* a lazy env's first setLand bakes with it anyway */
      },
      setReduced: function (on) {
        state.reduced = !!on; state.motionDirty = true;
        safeCall('city', function (c) { if (typeof c.setReduced === 'function') c.setReduced(!!on); });
        safeCall('life', function (l) { if (typeof l.setReduced === 'function') l.setReduced(!!on); });
      },
      setQuality: setQuality,
      invalidateShadows: invalidateShadows,
      lockedAt: function (x, z) { try { return Gr.lockedRegionAt(x, z, state.land, Gr.SAND_REACH); } catch (e) { return null; } },
      heightAt: heightAt,
      /* a placed copy's level in the ripple (reversal-safe: it never jumps, see rippleLevel) */
      wakeAt: function (x, z) { return rippleLevel(ripple, wakeDelay(x, z, home), state.reduced); },
      info: function () {
        var all = layerInfo([group]), terr = layerInfo([terrainM]), scen = layerInfo([sceneryM]), lay = layerInfo([layoutM]);
        var inst = {};
        group.traverse(function (o) { if (o.visible && (o.isMesh || o.isPoints)) inst[o.name] = o.isInstancedMesh ? o.count : 1; });
        return {
          calls: all.calls, tris: all.tris, instances: inst, land: Object.keys(state.land).length, show: modelShow(), light: state.kLight,
          mode: state.mode, bakeMs: Math.round(state.bakeMs * 10) / 10, rising: !!rise, issues: issues.slice(),
          layers: {
            terrain: terr, scenery: scen, layout: lay, tiles: layerInfo(groundLayers.map(function (Ly) { return Ly.mesh; })),
            sea: layerInfo([sea]), sky: layerInfo([sky, stars, cloudM]), lights: layerInfo([buoyM, poleM, neonM, cones, halos.mesh]),
            rise: layerInfo(bandMs), city: city && city.group ? layerInfo([city.group]) : { calls: 0, tris: 0 },
            life: life && life.group ? layerInfo([life.group]) : { calls: 0, tris: 0 }
          }
        };
      },
      dispose: function () {
        if (state.disposed) return;
        if (rise) finishRise();
        state.disposed = true;
        if (unsubQ) unsubQ();
        if (opts.scene && opts.scene.fog === fog) opts.scene.fog = null;
        safeCall('city', function (c) { if (typeof c.dispose === 'function') c.dispose(); });
        safeCall('life', function (l) { if (typeof l.dispose === 'function') l.dispose(); });
        city = life = null;
        if (group.parent) group.parent.remove(group);
        clearBands();
        layers.forEach(function (Ly) { Ly.mesh.dispose(); });
        owned.meshes.forEach(function (m) { if (m.geometry && (m === terrainM || m === sceneryM || m === layoutM)) m.geometry.dispose(); m.dispose(); });
        halos.dispose();
        owned.geos.forEach(function (g) { g.dispose(); });
        owned.mats.forEach(function (m) { m.dispose(); });
        owned.texs.forEach(function (t) { t.dispose(); });
        if (typeof sun.dispose === 'function') sun.dispose();
        if (typeof hemi.dispose === 'function') hemi.dispose();
        group.clear();
        renderer = null;
      }
    };
    Object.defineProperty(env, 'show', { get: function () { return modelShow(); } });
    Object.defineProperty(env, 'light', { get: function () { return state.kLight; } });
    Object.defineProperty(env, 'reduced', { get: function () { return state.reduced; } });
    Object.defineProperty(env, 'mode', { get: function () { return state.mode; } });
    Object.defineProperty(env, 'anchors', { get: function () { return state.mode === 'terrain' && bake ? bake.anchors : null; } });
    Object.defineProperty(env, 'bake', { get: function () { return state.mode === 'terrain' ? bake : null; } });
    Object.defineProperty(env, 'haloLayer', { get: function () { return halos; } });
    Object.defineProperty(env, 'city', { get: function () { return city; } });
    Object.defineProperty(env, 'life', { get: function () { return life; } });

    /* first state */
    applyLight(lightMix(blend.k, driftK(0, state.reduced), 0), true);
    if (opts.lazyLand) {
      /* the controller syncs its view right after create: that first setLand is the ONLY bake (baking
         a placeholder home-only coast here first was thrown away by that sync, and used up one of the
         slow-bake rule's two cold-JIT slots). Until then: open water, the buoys and the pole. */
      writeField(openSeaField()); fieldPrev.image.data.set(fieldCur.image.data);
      if (state.mode === 'terrain') { buildNeon([]); buildHalos([]); }
      placePole();
    } else {
      var startLand = opts.unlocked != null ? opts.unlocked : (opts.world || ['home']);
      setLand(startLand, opts.world || null);
      if (Array.isArray(opts.placed)) setPlaced(opts.placed);
    }
    if (state.mode !== 'terrain') { seaU.uSandReach.value = Gr.SAND_REACH; seaU.uLockedEdge.value = LOCKED_EDGE; buildNeon([]); buildHalos([]); }
    ripple = rippleNew(state.wakeOn); state.waking = false;   /* the first state is already awake (or asleep) */
    city = mountExtra('city', 'SLCity3D', { seed: 'sl-city-v1' });
    life = mountExtra('life', 'SLLife3D', { haloLayer: halos, anchors: bake ? bake.anchors : null, terrain: bake });
    setQuality(quality);
    updateClouds(); updateBuoys(); updateCones(); updateNeonColours();
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
    'uniform float uBand;',
    'uniform vec3 uHaloDir;',
    'uniform vec3 uHaloCol;',
    'uniform float uHaloK;',
    'varying vec3 vWorld;',
    'void main() {',
    '  vec3 dir = normalize(vWorld - cameraPosition);',
    '  float h = dir.y;',
    '  vec3 col = mix(uHorizon, uMid, smoothstep(0.0, uBand, h));',
    '  col = mix(col, uTop, smoothstep(uBand, 0.9, h));',
    /* the golden-hour sun halo: a soft disc on the horizon */
    '  float ca = dot(dir, uHaloDir);',
    '  col += uHaloCol * uHaloK * (0.35 * smoothstep(0.93, 1.0, ca) + 0.65 * smoothstep(0.994, 0.999, ca));',
    '  col = mix(col, uBelow, smoothstep(0.0, 0.14, -h));',     /* below the horizon: the fog colour */
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
    'uniform vec3 uFieldMax;',
    'uniform float uTime;',
    'uniform float uShow;',
    'uniform float uGlints;',
    'uniform float uSpots;',
    'uniform float uSandReach;',
    'uniform float uLockedEdge;',
    'uniform float uHalf;',
    'uniform float uWaveA;',
    'uniform float uWaveW;',
    'uniform float uDeepAt;',
    'uniform float uFoam2;',
    'uniform vec3 uShallow;',
    'uniform vec3 uDeep;',
    'uniform vec3 uFoam;',
    'uniform vec3 uWave;',
    'uniform vec3 uLagoon;',
    'uniform vec3 uGlintCol;',
    'uniform vec3 uSandbar;',
    'uniform vec3 uEdge;',
    'uniform vec3 uFogCol;',
    'uniform vec3 uSpotColA;',
    'uniform vec3 uSpotColB;',
    'uniform vec4 uSpotA;',
    'uniform vec4 uSpotB;',
    'uniform vec4 uRefl[REFL_N];',
    'uniform vec3 uReflCol[REFL_N];',
    'uniform float uReflK;',
    'uniform float uQuayK;',
    '#ifndef ENV_LOW',
    'uniform vec4 uBoat[4];',
    '#endif',
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
    /* R = distance to the island's own coast (u), G = signed distance to the locked future coast (u),
       B = lagoon, A = distance to the other shores: the quay wall, Lantern Islet, the rock stacks (u) */
    'vec4 fieldAt(sampler2D tex, vec2 uv) {',
    '  vec4 t = texture2D(tex, uv);',
    '  return vec4(t.r * uFieldMax.x, (t.g - 0.5) * 2.0 * uFieldMax.y, t.b, t.a * uFieldMax.z);',
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
    /* a city light's pillar: from its waterline point toward the camera, rippled */
    'float pillar(vec2 p, vec4 r) {',
    '  vec2 toCam = cameraPosition.xz - r.xy;',
    '  float lc = length(toCam);',
    '  vec2 dir = lc > 0.001 ? toCam / lc : vec2(0.0, 1.0);',
    '  vec2 d = p - r.xy;',
    '  float a = dot(d, dir);',
    '  float perp = length(d - a * dir);',
    '  float w = r.z * (1.0 + max(a, 0.0) * 0.12) * (0.75 + 0.5 * vnoise(vec2(a * 2.4 - uTime * 1.2, r.x)));',
    '  float along = smoothstep(-0.2, 0.25, a) * (1.0 - smoothstep(1.5, 4.5, a));',
    '  return along * exp(-perp * perp / (w * w)) * r.w;',
    '}',
    /* a boat's V wake (life3d uBoat: x, z, heading × w): two foam arms opening behind it plus a
       churned centre line, fading out over ~2.4 u; it moves with the boat (nothing flickers) */
    '#ifndef ENV_LOW',
    'float boatWake(vec2 p, vec4 b) {',
    '  float w = length(b.zw);',
    '  if (w < 0.001) return 0.0;',
    '  vec2 dir = b.zw / w;',
    '  vec2 d = p - b.xy;',
    '  float back = -dot(d, dir);',
    '  if (back < -0.15 || back > 2.6) return 0.0;',
    '  float side = abs(dir.x * d.y - dir.y * d.x);',
    '  float span = 0.05 + max(back, 0.0) * 0.2;',
    '  float arm = (side - span) / (0.035 + max(back, 0.0) * 0.03);',
    '  float arms = exp(-arm * arm);',
    '  float churn = exp(-side * side / (0.01 + max(back, 0.0) * 0.015)) * 0.7;',
    '  float fade = smoothstep(-0.12, 0.12, back) * (1.0 - smoothstep(0.8, 2.4, back));',
    '  return max(arms, churn) * fade * min(w, 1.0);',
    '}',
    '#endif',
    'void main() {',
    '  vec2 uv = (vXZ - uFieldRect.xy) * uFieldRect.zw;',
    '  vec4 fld = mix(fieldAt(uFieldPrev, uv), fieldAt(uField, uv), uFieldMix);',
    '  float sd = max(fld.x - uSandReach, 0.0);',          /* distance from the island's own waterline */
    '  float locked = fld.y - uLockedEdge;',               /* < 0 inside a locked region's future coast */
    '  float lagoon = fld.z;',
    '  float od = fld.w;',                                 /* distance from the quay / islet / stacks (foam only) */
    '  float fd = min(sd, od);',                           /* the nearest waterline of any kind */
    '  float aa = fwidth(sd) * 1.2 + 0.004;',
    '  float aaF = fwidth(fd) * 1.2 + 0.004;',
    '  float aaL = fwidth(locked) * 1.2 + 0.004;',
    /* body: shallow at the island's beach → deep (tighter at Showtime), a paler lagoon in the coves,
       a slow tint drift */
    '  vec3 col = mix(uShallow, uDeep, smoothstep(0.0, uDeepAt, sd));',
    '  col = mix(col, uLagoon, lagoon * (0.5 + 0.08 * sin(uTime * 1.25 + vXZ.x * 0.7)));',
    '  col *= 0.95 + 0.1 * vnoise(vXZ * 0.33 + vec2(uTime * 0.03, -uTime * 0.02));',
    '  float inside = 1.0 - smoothstep(-aaL, aaL, locked);',
    '  float open = 1.0 - inside;',
    /* wave-line strokes following the island's OWN shore, near it only (SEA.bandIn → bandOut) and clear
       of the other shores, scrolling outward at 0.04 u/s */
    '  float q = (sd - 0.5) / ' + glf(SEA.spacing) + ' - uTime * (' + glf(SEA.scroll) + ' / ' + glf(SEA.spacing) + ');',
    '  float fq = fract(q);',
    '  float dl = min(fq, 1.0 - fq) * ' + glf(SEA.spacing) + ';',
    '  float line = 1.0 - smoothstep(uWaveW - aa, uWaveW + aa, dl);',
    '  float dash = smoothstep(0.38, 0.58, vnoise(vXZ * 0.95 + vec2(floor(q + 0.5) * 3.7, 0.0)));',
    '  float island = smoothstep(' + glf(SEA.clearOther[0]) + ', ' + glf(SEA.clearOther[1]) + ', od);',
    '  float bands = smoothstep(' + glf(SEA.bandIn[0]) + ', ' + glf(SEA.bandIn[1]) + ', sd) * (1.0 - smoothstep(' +
      glf(SEA.bandOut[0]) + ', ' + glf(SEA.bandOut[1]) + ', sd)) * island;',
    '  col = mix(col, uWave, uWaveA * line * dash * bands * open);',
    /* the foam: a breathing band hugging every waterline (0.10 + 0.05·sin), plus a broken second line
       on the island's coast */
    '  float edge = ' + glf(SEA.foamEdge[0]) + ' + ' + glf(SEA.foamEdge[1]) + ' * sin(uTime * 1.3 + fd * 9.0 + vnoise(vXZ * 1.1) * 3.0);',
    '  float foam = 1.0 - smoothstep(edge - aaF, edge + aaF, fd);',
    '  float l2 = 0.3 + 0.04 * sin(uTime * 0.9 + vnoise(vXZ * 0.7 + 4.0) * 4.0);',
    '  float foam2 = (1.0 - smoothstep(0.02 - aa, 0.02 + aa, abs(sd - l2))) * smoothstep(0.35, 0.6, vnoise(vXZ * 1.6 + 9.0)) * island;',
    '  col = mix(col, uFoam, max(foam, foam2 * uFoam2) * (1.0 - 0.4 * inside));',
    /* the boats' wakes (MID / HIGH) */
    '#ifndef ENV_LOW',
    '  float wake = boatWake(vXZ, uBoat[0]) + boatWake(vXZ, uBoat[1]) + boatWake(vXZ, uBoat[2]) + boatWake(vXZ, uBoat[3]);',
    '  col = mix(col, uFoam, clamp(wake, 0.0, 1.0) * 0.5 * open);',
    '#endif',
    /* golden-hour glints: soft ✦ twinkles tinted by the sun halo, one per lucky 1.7 u cell (each ≤ 0.63 Hz) */
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
    '  col += uGlintCol * (glint * uGlints * 0.9);',
    /* Showtime: the cone streaks, then the city's light pillars behind the island (P1) */
    '  col += (uSpotColA * streak(vXZ, uSpotA) + uSpotColB * streak(vXZ, uSpotB)) * (0.55 * uSpots);',
    '  if (vXZ.y < -4.4 && uReflK > 0.001) {',
    '    vec3 refl = vec3(0.0);',
    '    for (int i = 0; i < REFL_N; i++) {',
    '      if (uRefl[i].w > 0.001) refl += uReflCol[i] * pillar(vXZ, uRefl[i]);',
    '    }',
    '    col += refl * (0.6 * uReflK) * open;',
    '  }',
    /* a shimmering band along the quay lip (the city line on the water), ≤ 0.3 Hz */
    '  vec2 qe = vec2(vXZ.x / 17.0, (vXZ.y + 0.6) / 7.6);',
    '  vec2 q2 = qe * qe;',
    '  float qd = abs(1.0 - pow(q2.x * q2.x + q2.y * q2.y, 0.25)) * 7.6;',
    '  float quay = (1.0 - smoothstep(0.0, 0.5, qd)) * step(vXZ.y, -0.6) * (0.55 + 0.45 * sin(vXZ.x * 2.3 + uTime * 1.885));',
    '  col += uEdge * quay * 0.35 * uQuayK;',
    /* locked land: a translucent sandbar on its future coast, slow scan lines and a dashed neon edge */
    '  col = mix(col, uSandbar, 0.5 * inside);',
    '  float sl = fract(vXZ.y * 2.2 - uTime * 0.12);',
    '  float scan = smoothstep(0.0, 0.06, sl) * (1.0 - smoothstep(0.06, 0.3, sl));',
    '  col = mix(col, uEdge, 0.25 * scan * inside);',
    '  float ed = abs(locked);',
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
    'uniform float uZenith;',
    'uniform float uFogNear;',
    'uniform float uFogFar;',
    'varying vec3 vTint;',
    'varying float vA;',
    'void main() {',
    '  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);',
    '  gl_Position = projectionMatrix * mvPosition;',
    '  float tw = 0.55 + 0.45 * sin(uTime * 2.0 + aSeed);',            /* 0.32 Hz twinkle */
    '  float fogK = aSea * smoothstep(uFogNear, uFogFar, -mvPosition.z);',
    /* golden hour: only the zenith stars show (none on the water) */
    '  float zen = (1.0 - aSea) * smoothstep(0.55, 0.85, normalize(position).y);',
    '  vA = tw * mix(1.0, 0.6, aSea) * (1.0 - fogK) * mix(1.0, zen, uZenith);',
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
    /* below 0.003 a point adds nothing (additive, no depth write): zero instead of discard, which
       would cost the shared env program (the sea writes depth) its early depth test */
    '  a *= step(0.003, a);',
    '  gl_FragColor = vec4(vTint, a);',
    '  #include <colorspace_fragment>',
    '}'
  ].join('\n');

  /* the 3 cones are one mesh: aCone picks each vertex's cone matrix and colour */
  var CONE_VERT = [
    'attribute float aCone;',
    'uniform mat4 uConeM[3];',
    'uniform vec3 uConeCol[3];',
    'uniform float uLen;',
    'uniform float uFogNear;',
    'uniform float uFogFar;',
    'varying float vAlong;',
    'varying vec3 vN;',
    'varying vec3 vW;',
    'varying vec3 vCol;',
    'varying float vFog;',
    'void main() {',
    '  int ci = int(aCone + 0.5);',
    '  mat4 m = modelMatrix * uConeM[ci];',
    '  vec4 wp = m * vec4(position, 1.0);',
    '  vW = wp.xyz;',
    '  vN = normalize(mat3(m) * normal);',
    '  vAlong = clamp(position.y / uLen, 0.0, 1.0);',
    '  vCol = uConeCol[ci];',
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
    '  float facing = abs(dot(normalize(vN), V));',
    '  float a = uAlpha * pow(1.0 - vAlong, 1.4) * smoothstep(0.0, 0.06, vAlong) * pow(facing, 1.3) * (1.0 - vFog);',
    '  gl_FragColor = vec4(vCol, a);',
    '  #include <colorspace_fragment>',
    '}'
  ].join('\n');

  /* ---------------- ONE program for the whole env ----------------
     three keys a program on the shader source, the defines and a material's flags. The sky, sea,
     star and cone passes are joined into one source whose main() runs the pass uPass names, and
     create() gives all four materials the same defines and flags (DoubleSide — a ShaderMaterial
     draws in one pass —, fog on, NoBlending for the opaque sky and sea, never instanced), so they
     share ONE compiled program instead of four. A uniform branch: each draw runs only its pass.
     joinPasses([[fnName, src], …]) → one GLSL source: each part's main() becomes fnName(); the
     shared chunk includes and identical uniform / attribute / varying declarations appear once
     (a name declared twice differently throws) */
  var SHARED_INCLUDE = /^#include <(common|fog_pars_vertex|fog_pars_fragment)>$/;
  var DECL = /^(uniform|attribute|varying)\s+\w+\s+(\w+)/;
  function joinPasses(parts) {
    var head = [], seen = {}, body = [], calls = [];
    parts.forEach(function (p, i) {
      var lines = p[1].split('\n'), m = lines.indexOf('void main() {');
      if (m < 0 || lines[lines.length - 1] !== '}') throw new Error('joinPasses: ' + p[0] + ' needs a last-line main()');
      for (var j = 0; j < lines.length; j++) {
        var ln = lines[j], d = j < m ? DECL.exec(ln) : null;
        if (j < m && SHARED_INCLUDE.test(ln)) { if (head.indexOf(ln) < 0) head.push(ln); continue; }
        if (d) {
          if (seen[d[2]] != null && seen[d[2]] !== ln) throw new Error('joinPasses: ' + d[2] + ' is declared twice differently');
          if (seen[d[2]] != null) continue;
          seen[d[2]] = ln;
        }
        body.push(j === m ? 'void ' + p[0] + '() {' : ln);
      }
      calls.push((i ? '  else ' : '  ') + (i < parts.length - 1 ? 'if (uPass < ' + (i + 0.5).toFixed(1) + ') ' : '') + p[0] + '();');
    });
    return head.concat(['uniform float uPass;'], body, ['void main() {'], calls, ['}']).join('\n');
  }
  var ENV_PASS = { sky: 0, sea: 1, stars: 2, cones: 3 };
  var ENV_PROGRAM = {
    vert: joinPasses([['envSkyV', SKY_VERT], ['envSeaV', SEA_VERT], ['envStarV', STAR_VERT], ['envConeV', CONE_VERT]]),
    frag: joinPasses([['envSkyF', SKY_FRAG], ['envSeaF', SEA_FRAG], ['envStarF', STAR_FRAG], ['envConeF', CONE_FRAG]])
  };

  var api = {
    VERSION: VERSION, create: create,
    /* constants (read-only use) */
    TILE: TILE, SAND: SAND, CONE_BASE: CONE_BASE, CONE_GEO: CONE_GEO, BUOY: BUOY, POLE: POLE, CLOUDS: CLOUDS, CLOUD_SHAPE: CLOUD_SHAPE,
    CLOUD_SPAN: CLOUD_SPAN, CLOUD_EXTENT: CLOUD_EXTENT, STAR: STAR, STAR_TINTS: STAR_TINTS, FREQS: FREQS, FIELD_PACK: FIELD_PACK, FIELD: FIELD,
    ALT_DY: ALT_DY, PLINTH_DY: PLINTH_DY, RISE_FLOOR: RISE_FLOOR, LOCKED_EDGE: LOCKED_EDGE, SEA_SIZE: SEA_SIZE, SKY_R: SKY_R,
    TERRAIN_MS: TERRAIN_MS, SEED_WAIT: SEED_WAIT, BAND_MAX: BAND_MAX, EDIT_SEC: EDIT_SEC, HALO_CAP: HALO_CAP, WAKE: WAKE, DRIFT: DRIFT, VIEW_ELEV: VIEW_ELEV,
    ABUTMENT: ABUTMENT, SUN_HALO: SUN_HALO, SEA: SEA,
    /* pure helpers */
    landOf: landOf, regionsOf: regionsOf, landSig: landSig, placedSig: placedSig, landTiles: landTiles, plinths: plinths, skirtCells: skirtCells,
    dressing: dressing, polePosition: polePosition, surfaces: surfaces, hologramTokens: hologramTokens,
    ringPoints: ringPoints, tileTris: tileTris, stripNormal: stripNormal,
    presetTables: presetTables, presetOut: presetOut, mixPreset: mixPreset,
    litColor: litColor, keyCalibration: keyCalibration, neutralTone: neutralTone,
    blendState: blendState, blendTo: blendTo, blendStep: blendStep, driftK: driftK, lightMix: lightMix,
    wakeLevel: wakeLevel, wakeStep: wakeStep, wakeEase: wakeEase, wakeDelay: wakeDelay, neonColour: neonColour, slowBakeRule: slowBakeRule,
    rippleNew: rippleNew, rippleToggle: rippleToggle, rippleAdvance: rippleAdvance, rippleLevel: rippleLevel,
    seaWave: seaWave, waveBands: waveBands,
    coneAxis: coneAxis, cloudAt: cloudAt, starField: starField, sunBasis: sunBasis, shadowFit: shadowFit,
    fieldFromGrid: fieldFromGrid, openSeaField: openSeaField, riseBands: riseBands, joinPasses: joinPasses,
    /* the per-pass sources, and ENV_VERT / ENV_FRAG: what every env material actually compiles */
    SHADERS: { SKY_VERT: SKY_VERT, SKY_FRAG: SKY_FRAG, SEA_VERT: SEA_VERT, SEA_FRAG: SEA_FRAG, STAR_VERT: STAR_VERT, STAR_FRAG: STAR_FRAG, CONE_VERT: CONE_VERT, CONE_FRAG: CONE_FRAG,
               ENV_VERT: ENV_PROGRAM.vert, ENV_FRAG: ENV_PROGRAM.frag },
    ENV_PASS: ENV_PASS
  };

  /* the stage registry: SL3D.makeEnv(opts) → create(K, SL3D, opts) once the stage is ready */
  if (root && root.SL3D && typeof root.SL3D.defineApi === 'function') {
    try {
      root.SL3D.defineApi('makeEnv', function (K, S) { return function (o) { o = o || {}; return create(o.K || K, S, o); }; });
    } catch (e) { /* the stage logs its own issues */ }
  }
  return api;
}));
