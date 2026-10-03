/* ================================================================
   My Island 3D — the organic terrain (pure; no DOM, no THREE).
   window.SLTerrain3D in the browser (loaded by stage.js before env.js),
   module.exports in Node. Encore City v2 (plan-v2.json → islandV2 §1–3,
   island-terrain-v2.json): "flat pads in an organic skin". Every rule
   stays where grid3d.js and world-core put it — every lattice vertex in an
   unlocked cell's square sits EXACTLY at SLGrid3D.surfaceY(c, r); only the
   ground outside the cells (beaches, banks, bluffs, coves) is free-form.
   env.js owns the GPU side: it turns the arrays below into BufferGeometry.

   API
     bake(land, {tier, seed, spacing?}) → bake   land = region list | world | land set ('home' always kept)
       seed = the child's profile key: a per-child coastline that never re-rolls on reload or unlock;
       spacing = the lattice step (SL3D.budget.terrainSpacing: 0.5 / 0.25 / 0.125; default by tier)
       bake {version, tier, spacing, seed, sig, ms, land, cells[], sm (the 1/4 u coast fields over the
             sea-field area: d0, s, o, …), lattice,
             field {w, h, x0, z0, texel, data RGBA8, maxShore, maxLocked, maxOther, shore, locked, lagoon, other},
             coastLines [{closed, pts}], structures, anchors, points, bounds}
     meshArrays(bake) → {position, normal, color, index, cell, tris, verts}
                                              the terrain: ONE indexed mesh (pads flat, normals (0, 1, 0)),
                                              cell = Int16 per triangle (c + 16·r of its land cell, -1 sea)
     sceneryArrays(bake) → {position, normal, color, index, cell, tris, neon[], halos[]}
                                              walls, boulders, boardwalks, abutment, islet, rock stacks
                                              (+ the LED segments and warm glow points env lights)
     scatter(bake, placed) → {pieces[], tris} world-space ground dressing (never per cell)
     dressingArrays(bake, placed) → arrays    the dressing as one mesh (same layout as meshArrays)
     mergeArrays(list) · sliceBands(arrays, bandOfCell, n) · heightAt(bake, x, z) · zoneAt(bake, x, z)
     coastAt(bake, x, z) → coast SDF s (≤ 0 on land) · landDist(bake, x, z) → d0 · landSig(land)
     seedOffset(seed) · regionDist(x, z, lockedOnly, lg) · quayDist(x, z) · otherShoreDist(x, z) (the A channel)
     constants DOMAIN SPACING SM_RES COAST PROFILE FIELD BUDGET EXCLUDE STRUCT QUAY ZONES DRESS VERSION

   MATHS (numbers from island-terrain-v2.json)
     d0  signed distance to the union of unlocked cell squares: two Felzenszwalb EDTs on a 1/4 u
         node grid whose lines include every cell edge (exact at the nodes), bilinear in between —
         so d0 ≤ 0 all along every cell edge
     o   coast offset clamp(0.40 + 0.28·n(0.32x+sx, 0.32z+sz) + 0.10·n(1.05x+7.3+sx, 1.05z−2.1+sz)
         − 0.22·notch + 0.25·cove + 0.2·meadow, 0.16, 0.85), pinned to 0.5 at the bridge abutment;
         (sx, sz) = hash('sl-coast-v1:' + seed), n = world-space value noise in [-1, 1]
     s   coast SDF min(gauss(d0, σ 0.5) − o, d0 − 0.14): land is s ≤ 0, and s ≤ −0.14 on every
         cell edge, so the coast can never enter a cell
     h   cells: surfaceY; outside, t = d0 / (d0 − s) drives BEACH / BANK / ROCK profiles blended by o
         (back and west edges are rocky bluffs, the cove is all beach); beyond the coast
         h = SEA_Y − 0.02 − 0.04·min(s/0.1, 1) − 0.5·min(s, 1) under the opaque sea
     Steps between unlocked cells of different heights (Meadow Hill terraces, the meadow ↔ home drop)
     are crisp vertical risers exactly on the shared cell edge, so both pads stay exact up to the
     line; drops ≥ 0.15 get a Concrete retaining wall with a cap stone (scenery).
   ================================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root, require('../world-core.js'), require('./grid3d.js'), require('../world-look.js'));
  } else root.SLTerrain3D = factory(root, null, null, null);
}(typeof self !== 'undefined' ? self : typeof globalThis !== 'undefined' ? globalThis : this, function (root, C0, G0, L0) {
  'use strict';

  var VERSION = 1;
  var TAU = Math.PI * 2;

  /* lazy module lookups, so script order never matters in the browser */
  function core() { var c = C0 || root.SLWorldCore; if (!c) throw new Error('SLTerrain3D: SLWorldCore is not loaded'); return c; }
  function grid() { var g = G0 || root.SLGrid3D; if (!g) throw new Error('SLTerrain3D: SLGrid3D is not loaded'); return g; }
  function look() { return L0 || root.SLIslandLook || null; }

  /* ---------------- constants ---------------- */
  var DOMAIN = { x0: -11, x1: 11, z0: -8, z1: 8 };       /* the terrain lattice */
  var SPACING = { LOW: 0.5, MID: 0.25, HIGH: 0.125 };     /* = SLTier budget.terrainSpacing; each divides 1 */
  var SM_RES = 4;                                         /* the coast fields (d0 exact at nodes, blur, offset): 1/4 u */
  var COAST = {
    seed: 'sl-coast-v1', base: 0.40, a1: 0.28, f1: 0.32, a2: 0.10, f2: 1.05, o2: [7.3, -2.1],
    notch: 0.22, notchR: 1.5, min: 0.16, max: 0.85, beach: 0.14, sigma: 0.7,
    cove: 0.25, meadow: 0.2, pin: { x: -3.2, z: -4.3, r0: 0.55, r1: 1.15, o: 0.5 }
  };
  var PROFILE = {
    beachMax: 0.34, rockMin: 0.6, lipBeach: 0.12, lipRock: 0.25, bankPow: 2.2,
    lipDrop: 0.025, rim: 0.12, waterEps: 0.02, wetBand: 0.06, fringe: 0.05
  };
  /* the sea field env samples: R = distance to the island's OWN organic coast (the shore-following
     wave lines, the shallows and the foam), G = signed distance to the locked regions' FUTURE coast
     (the hologram), B = lagoon factor, A = distance to the other shores — the city quay, Lantern
     Islet and the rock stacks — which get a foam edge only (no wave lines of their own: their
     contours used to fill the whole channel with a second set of bands, 'the white scribble').
     Texel centres sit on the 1/4 u coast-field nodes (x -16 … 15.75, z -10 … 9.75). */
  var FIELD = { w: 128, h: 80, x0: -16.125, z0: -10.125, texel: 0.25, maxShore: 4, maxLocked: 2, maxOther: 1 };
  /* triangle budgets per tier (plan performance table): terrain, scenery, dressing */
  var BUDGET = {
    LOW: { terrain: 1400, scenery: 2500, dressing: 1500 },
    MID: { terrain: 5500, scenery: 5000, dressing: 3000 },
    HIGH: { terrain: 12000, scenery: 6000, dressing: 4500 }
  };
  var EXCLUDE = 0.3;                                      /* every region cell (locked too) dilated by this stays clear */
  var ZONES = { pad: 0, sandPad: 1, grass: 2, sand: 3, wet: 4, rock: 5, sea: 6 };
  /* fixed structures (islandV2 §3); boardwalk decks 0.36 wide, 0.06 above the ground, posts every 0.6 */
  var STRUCT = {
    deck: { w: 0.36, lift: 0.06, thick: 0.035, plank: 0.12, gap: 0.014, post: 0.6, postR: 0.028 },
    promenade: { x0: -3, x1: 3, t: 0.55, minOff: 0.21, step: 0.25, bollardEvery: 1.2 },
    plaza: { len: 1.1, depth: 0.62, minBeach: 0.5 },
    jetty: { from: [4.2, -5.8], to: [3.8, -4.6], w: 0.3 },
    abutment: { x: -3.2, z: -4.45, w: 0.5 },
    islet: { x: -8.0, z: -5.4, r: 0.7, h: 0.6 },
    stacks: [{ x: 7.15, z: 5.45, r: 0.26, h: 0.9 }, { x: 7.72, z: 5.82, r: 0.2, h: 0.55 }],
    pier: { z: 0.4, len: 1.3, w: 0.3 },
    lookout: { w: 0.7, d: 0.62 },
    boulderEvery: { LOW: 1.25, MID: 0.8, HIGH: 0.7 }
  };
  /* the city quay (city3d.js draws it; the sea field's A channel gives it foam): |x/17|^4 + |(z+0.6)/7.6|^4 = 1, back half */
  var QUAY = { a: 17, b: 7.6, zc: -0.6 };

  /* ================================================================
     MATHS + COLOUR HELPERS
     ================================================================ */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function lerp(a, b, k) { return a + (b - a) * k; }
  function smooth(a, b, x) { var u = clamp01((x - a) / (b - a)); return u * u * (3 - 2 * u); }
  function now() { try { return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now(); } catch (e) { return Date.now(); } }
  function normTier(t) { var u = typeof t === 'string' ? t.toUpperCase() : ''; return SPACING[u] ? u : 'MID'; }
  function fnv(s) {
    s = String(s);
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
  }
  /* integer lattice hash → uint32 (world-space, so the same spot always hashes the same) */
  function hash2(ix, iz, seed) {
    var h = (Math.imul(ix | 0, 0x27d4eb2d) ^ Math.imul(iz | 0, 0x165667b1) ^ seed) >>> 0;
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
    return (h ^ (h >>> 16)) >>> 0;
  }
  function h01(ix, iz, seed) { return hash2(ix, iz, seed) / 4294967296; }
  /* value noise in [-1, 1], smoothstep-interpolated */
  function vnoise(x, z, seed) {
    var ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
    var ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
    var a = h01(ix, iz, seed), b = h01(ix + 1, iz, seed), c = h01(ix, iz + 1, seed), d = h01(ix + 1, iz + 1, seed);
    return (a + (b - a) * ux + (c - a + (a - b - c + d) * ux) * uz) * 2 - 1;
  }
  var SEED_N = fnv(COAST.seed), SEED_C1 = fnv('sl-turf-a'), SEED_C2 = fnv('sl-turf-b'), SEED_D = fnv('sl-dress');
  /* the per-child coast offset (sx, sz) */
  function seedOffset(seed) {
    var h = fnv(COAST.seed + ':' + (seed == null ? '' : String(seed)));
    return { sx: (h & 0xffff) / 65536 * 512, sz: (h >>> 16) / 65536 * 512 };
  }

  /* sRGB hex → [r, g, b] 0..1 (sRGB); vertex colours are linear (three's working space) */
  var rgbCache = {};
  function tokenRgb(token) {
    var c = rgbCache[token];
    if (c) return c;
    var L = look(), h = L && typeof L.hex === 'function' ? L.hex(token) : null;
    if (!h) h = /^#[0-9a-f]{6}$/i.test(token) ? token : '#CFC8DC';
    var n = parseInt(h.slice(1), 16);
    c = [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
    rgbCache[token] = c;
    return c;
  }
  var S2L = new Float32Array(1025);
  for (var li = 0; li <= 1024; li++) { var cv = li / 1024; S2L[li] = cv <= 0.04045 ? cv / 12.92 : Math.pow((cv + 0.055) / 1.055, 2.4); }
  function s2l(c) {
    if (!(c > 0)) return 0;
    if (c >= 1) return 1;
    var u = c * 1024, i = u | 0;
    return S2L[i] + (S2L[i + 1] - S2L[i]) * (u - i);
  }
  function mix3(a, b, k, out) { out[0] = a[0] + (b[0] - a[0]) * k; out[1] = a[1] + (b[1] - a[1]) * k; out[2] = a[2] + (b[2] - a[2]) * k; return out; }
  function hue2(p, q, t) { if (t < 0) t += 1; if (t > 1) t -= 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; }
  /* lightness × (1 + dL) and hue + dH° in HSL (sRGB in, sRGB out) */
  function shift(c, dL, dH, out) {
    var r = c[0], g = c[1], b = c[2], mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, s = 0, hu = 0, d = mx - mn;
    if (d > 1e-9) {
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      hu = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
      hu /= 6;
    }
    l = clamp01(l * (1 + dL)); hu = ((hu + dH / 360) % 1 + 1) % 1;
    if (s < 1e-9) { out[0] = out[1] = out[2] = l; return out; }
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    out[0] = hue2(p, q, hu + 1 / 3); out[1] = hue2(p, q, hu); out[2] = hue2(p, q, hu - 1 / 3);
    return out;
  }
  function toLinear(c, arr, i) { arr[i] = s2l(c[0]); arr[i + 1] = s2l(c[1]); arr[i + 2] = s2l(c[2]); }

  /* ---------------- the ground palette (art bible v2 land tokens) ---------------- */
  var _g1 = [0, 0, 0], _g2 = [0, 0, 0];
  /* turf: Turf / Turf Shade / Hill Moss / Leaf Lit blended by 2-octave world noise (2.6 u clumps,
     0.7 u flecks), ±5% lightness and ±4° hue — never a checker. meadow 0..1 leans to Hill Moss. */
  function turfRgb(x, z, meadow, out) {
    var a = vnoise(x / 2.6 + 13.1, z / 2.6 - 7.7, SEED_C1), b = vnoise(x / 0.7 - 3.3, z / 0.7 + 21.9, SEED_C2);
    mix3(tokenRgb('Turf'), tokenRgb('Hill Moss'), clamp01(meadow) * 0.85, _g1);
    mix3(_g1, tokenRgb('Turf Shade'), clamp01(-a * 0.9) * 0.5, _g1);
    mix3(_g1, tokenRgb('Leaf Lit'), clamp01(a * 0.9 - 0.12) * 0.45, _g1);
    mix3(_g1, meadow > 0.5 ? tokenRgb('Turf') : tokenRgb('Hill Moss'), smooth(0.25, 0.75, b) * 0.3, _g1);
    return shift(_g1, 0.05 * (0.65 * b + 0.35 * a), 4 * b, out);
  }
  /* sand: Dune ±3% with a faint wind ripple */
  function sandRgb(x, z, out) {
    var a = vnoise(x / 1.7 - 5.1, z / 1.7 + 2.3, SEED_C1);
    var rip = Math.sin(z * 9.0 + x * 2.1 + 2.4 * a);
    return shift(tokenRgb('Dune'), 0.03 * a + 0.018 * rip, 2 * a, out);
  }
  function rockRgb(x, z, out) {
    var a = vnoise(x / 0.9 + 4.4, z / 0.9 - 9.2, SEED_C2);
    mix3(tokenRgb('Cliff Rock'), tokenRgb('Concrete'), smooth(0.2, 0.8, a) * 0.22, _g2);
    return shift(_g2, 0.05 * a, 0, out);
  }

  /* ================================================================
     DISTANCE FIELDS: Felzenszwalb EDT + box-approximated Gaussian blur
     ================================================================ */
  var INF = 1e20;
  function edt1d(f, n, d, v, z) {
    var k = 0, q, s;
    v[0] = 0; z[0] = -INF; z[1] = INF;
    for (q = 1; q < n; q++) {
      s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
      k++; v[k] = q; z[k] = s; z[k + 1] = INF;
    }
    k = 0;
    for (q = 0; q < n; q++) { while (z[k + 1] < q) k++; var dq = q - v[k]; d[q] = dq * dq + f[v[k]]; }
  }
  /* squared distance (node units) from every node to the nearest feature node */
  var edtScratch = { n: 0 };
  function edt2d(feat, nx, nz, out) {
    var n = Math.max(nx, nz), S = edtScratch;
    if (S.n < n) { S.n = n; S.f = new Float64Array(n); S.d = new Float64Array(n); S.v = new Int32Array(n); S.z = new Float64Array(n + 1); }
    var f = S.f, d = S.d, v = S.v, z = S.z, i, j;
    for (i = 0; i < nx; i++) {
      for (j = 0; j < nz; j++) f[j] = feat[j * nx + i] ? 0 : INF;
      edt1d(f, nz, d, v, z);
      for (j = 0; j < nz; j++) out[j * nx + i] = d[j];
    }
    for (j = 0; j < nz; j++) {
      var row = j * nx;
      for (i = 0; i < nx; i++) f[i] = out[row + i];
      edt1d(f, nx, d, v, z);
      for (i = 0; i < nx; i++) out[row + i] = d[i];
    }
    return out;
  }
  /* box radii whose 3 passes approximate a Gaussian of sigma (px) */
  function boxRadii(sigma) {
    var n = 3, wIdeal = Math.sqrt(12 * sigma * sigma / n + 1), wl = Math.floor(wIdeal);
    if (wl % 2 === 0) wl--;
    var wu = wl + 2, m = Math.round((12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4));
    var out = [];
    for (var i = 0; i < n; i++) out.push(((i < m ? wl : wu) - 1) / 2);
    return out;
  }
  function boxH(src, dst, nx, nz, r) {
    var w = 2 * r + 1, last = nx - 1;
    for (var j = 0; j < nz; j++) {
      var row = j * nx, acc = src[row] * (r + 1), i;
      for (i = 1; i <= r; i++) acc += src[row + (i < last ? i : last)];
      for (i = 0; i < nx; i++) {
        dst[row + i] = acc / w;
        var ia = i + r + 1, ib = i - r;
        acc += src[row + (ia < last ? ia : last)] - src[row + (ib > 0 ? ib : 0)];
      }
    }
  }
  function boxV(src, dst, nx, nz, r) {
    var w = 2 * r + 1, last = nz - 1;
    for (var i = 0; i < nx; i++) {
      var acc = src[i] * (r + 1), j;
      for (j = 1; j <= r; j++) acc += src[(j < last ? j : last) * nx + i];
      for (j = 0; j < nz; j++) {
        dst[j * nx + i] = acc / w;
        var ja = j + r + 1, jb = j - r;
        acc += src[(ja < last ? ja : last) * nx + i] - src[(jb > 0 ? jb : 0) * nx + i];
      }
    }
  }
  /* Gaussian blur (clamped edges) of src into a new array */
  function gauss(src, nx, nz, sigmaPx, tmp) {
    var a = new Float32Array(src), b = tmp || new Float32Array(src.length), radii = boxRadii(sigmaPx);
    for (var k = 0; k < radii.length; k++) {
      var r = Math.max(0, Math.round(radii[k]));
      if (!r) continue;
      boxH(a, b, nx, nz, r); boxV(b, a, nx, nz, r);
    }
    return a;
  }

  /* ================================================================
     LAND
     ================================================================ */
  function landSetOf(arg) {
    var Gr = grid(), C = core(), land;
    if (arg && !Array.isArray(arg) && typeof arg === 'object' && arg.owned && Array.isArray(arg.placed)) land = C.landSet(arg);
    else if (Array.isArray(arg)) land = Gr.landFrom(arg.indexOf('home') >= 0 ? arg : ['home'].concat(arg));
    else land = Gr.landFrom(arg);
    var out = {};
    Object.keys(land || {}).forEach(function (k) { if (land[k] && C.CELL_REGION[k]) out[k] = 1; });
    C.REGION_CELLS.home.forEach(function (k) { out[k] = 1; });
    return out;
  }
  function byCell(a, b) { var p = a.split(','), q = b.split(','); return (+p[1] - +q[1]) || (+p[0] - +q[0]); }
  function landSig(land) { return Object.keys(land).filter(function (k) { return land[k]; }).sort(byCell).join(';'); }
  var REGION_CODE = { home: 1, cove: 2, meadow: 3 };
  /* 16×10 region codes of the unlocked cells (0 = sea / locked) */
  function landGridOf(land) {
    var C = core(), g = new Uint8Array(160);
    Object.keys(land).forEach(function (k) {
      if (!land[k]) return;
      var p = k.split(','), c = +p[0], r = +p[1];
      if (c >= 0 && c < 16 && r >= 0 && r < 10) g[c + r * 16] = REGION_CODE[C.CELL_REGION[k]] || 1;
    });
    return g;
  }
  /* every region cell (locked or not) as [id, c, r, regionCode] */
  var REGION_LIST = null;
  function regionList() {
    if (REGION_LIST) return REGION_LIST;
    var C = core(), out = [];
    Object.keys(C.REGION_CELLS).forEach(function (rk) {
      C.REGION_CELLS[rk].forEach(function (k) { var p = k.split(','); out.push([+p[0] + 16 * +p[1], +p[0], +p[1], REGION_CODE[rk] || 1]); });
    });
    return (REGION_LIST = out);
  }
  function cellY(c, r, code) { return code === 3 ? grid().TERRACE[Math.min(Math.max(c, 0), 3)] : 0; }
  function squareDist(x, z, c, r) {
    var x0 = c - 8, z0 = r - 5;
    var dx = x < x0 ? x0 - x : x > x0 + 1 ? x - x0 - 1 : 0;
    var dz = z < z0 ? z0 - z : z > z0 + 1 ? z - z0 - 1 : 0;
    return Math.sqrt(dx * dx + dz * dz);
  }
  /* pad class of a cell: same class = same pad height + palette (shares vertices) */
  function padClass(c, code) { return code === 3 ? 3 + Math.min(Math.max(c, 0), 3) : code; }
  /* distance from a point to the nearest region cell (locked only, or any), ignoring the land grid lg */
  function regionDist(x, z, lockedOnly, lg) {
    var L = regionList(), best = Infinity;
    for (var k = 0; k < L.length; k++) {
      if (lockedOnly && lg && lg[L[k][0]]) continue;
      var d = squareDist(x, z, L[k][1], L[k][2]);
      if (d < best) best = d;
    }
    return best;
  }

  /* ================================================================
     THE COAST FIELDS
     sm: smooth fields at 1/4 u over the whole sea-field area (blurred d0, offset o, coverage
         fractions), so the sea field and the terrain read the same coast without seams;
     ex: the exact d0 at 1/8 u over DOMAIN and s = min(sd, d0 − 0.14) there (sd = blur − o)
     ================================================================ */
  var SMG = { res: SM_RES, x0: -16, z0: -10, nx: 32 * SM_RES + 1, nz: 20 * SM_RES + 1 };
  /* pixel mask + node coverage for a grid (res px per u, origin x0/z0, nx × nz nodes) */
  function coverage(lg, res, x0, z0, nx, nz, withRegions) {
    var px = nx - 1, pz = nz - 1, n = nx * nz, i, j;
    var pix = new Uint8Array(px * pz);
    for (j = 0; j < pz; j++) {
      var r = Math.floor(z0 + (j + 0.5) / res + 5);
      if (r < 0 || r > 9) continue;
      for (i = 0; i < px; i++) {
        var c = Math.floor(x0 + (i + 0.5) / res + 8);
        if (c >= 0 && c < 16) pix[j * px + i] = lg[c + r * 16];
      }
    }
    var closed = new Uint8Array(n), outer = new Uint8Array(n), cov = withRegions ? new Float32Array(n) : null;
    var cCove = withRegions ? new Float32Array(n) : null, cMead = withRegions ? new Float32Array(n) : null;
    for (j = 0; j < nz; j++) {
      for (i = 0; i < nx; i++) {
        var cnt = 0, cv = 0, mw = 0, idx = j * nx + i;
        for (var dj = -1; dj <= 0; dj++) {
          var pj = j + dj;
          if (pj < 0 || pj >= pz) continue;
          for (var di = -1; di <= 0; di++) {
            var pi = i + di;
            if (pi < 0 || pi >= px) continue;
            var code = pix[pj * px + pi];
            if (code) { cnt++; if (code === 2) cv++; else if (code === 3) mw++; }
          }
        }
        closed[idx] = cnt > 0 ? 1 : 0;
        outer[idx] = cnt < 4 ? 1 : 0;
        if (cov) { cov[idx] = cnt / 4; cCove[idx] = cv / 4; cMead[idx] = mw / 4; }
      }
    }
    return { closed: closed, outer: outer, cov: cov, cove: cCove, meadow: cMead };
  }
  var d0Scratch = { n: 0 };
  function signedD0(cv, nx, nz, res) {
    var n = nx * nz, S = d0Scratch;
    if (S.n < n) { S.n = n; S.a = new Float64Array(n); S.b = new Float64Array(n); }
    var dOut = edt2d(cv.closed, nx, nz, S.a), dIn = edt2d(cv.outer, nx, nz, S.b), d0 = new Float32Array(n);
    for (var k = 0; k < n; k++) d0[k] = (Math.sqrt(dOut[k]) - Math.sqrt(dIn[k])) / res;
    return d0;
  }
  /* the land-independent noise part of o on a grid of res nodes per u, cached per seed */
  var noiseCache = [];
  function noiseBase(off, res) {
    for (var k = 0; k < noiseCache.length; k++) {
      var e = noiseCache[k];
      if (e.sx === off.sx && e.sz === off.sz && e.res === res) return e.a;
    }
    var nx = 32 * res + 1, nz = 20 * res + 1, a = new Float32Array(nx * nz);
    for (var j = 0; j < nz; j++) {
      var z = SMG.z0 + j / res;
      for (var i = 0; i < nx; i++) {
        var x = SMG.x0 + i / res;
        a[j * nx + i] = COAST.base + COAST.a1 * vnoise(COAST.f1 * x + off.sx, COAST.f1 * z + off.sz, SEED_N) +
          COAST.a2 * vnoise(COAST.f2 * x + COAST.o2[0] + off.sx, COAST.f2 * z + COAST.o2[1] + off.sz, SEED_N);
      }
    }
    noiseCache.unshift({ sx: off.sx, sz: off.sz, res: res, a: a });
    if (noiseCache.length > 8) noiseCache.length = 8;
    return a;
  }
  /* the coast fields of one land grid (lg) over the sea-field area, res nodes per u (4 for the bake,
     2 for the locked regions' future coasts). d0 is exact at every node (cell edges are grid lines)
     and bilinear in between, so it is ≤ 0 all along every cell edge and
     s = min(blur(d0) − o, d0 − 0.14) ≤ −0.14 there */
  var gaussTmp = { n: 0 };
  function smoothField(lg, off, resIn) {
    var res = resIn || SMG.res, nx = 32 * res + 1, nz = 20 * res + 1, n = nx * nz, hasCove = false, hasMeadow = false;
    for (var q = 0; q < 160; q++) { if (lg[q] === 2) hasCove = true; else if (lg[q] === 3) hasMeadow = true; }
    if (gaussTmp.n < n) { gaussTmp.n = n; gaussTmp.a = new Float32Array(n); }
    var tmp = gaussTmp.a, cv = coverage(lg, res, SMG.x0, SMG.z0, nx, nz, true), d0 = signedD0(cv, nx, nz, res);
    var blur = gauss(d0, nx, nz, COAST.sigma * res, tmp);
    var landB = gauss(cv.cov, nx, nz, COAST.notchR / 2 * res, tmp);
    var meadB = hasMeadow ? gauss(cv.meadow, nx, nz, COAST.notchR / 2 * res, tmp) : null;
    var coveB = hasCove ? gauss(cv.cove, nx, nz, COAST.notchR / 2 * res, tmp) : null;
    var base = noiseBase(off, res), o = new Float32Array(n), sd = new Float32Array(n), s = new Float32Array(n);
    var cove = new Float32Array(n), mead = new Float32Array(n), notch = new Float32Array(n), pin = new Float32Array(n), P = COAST.pin;
    for (var j = 0; j < nz; j++) {
      var z = SMG.z0 + j / res, dz = z - P.z;
      for (var i = 0; i < nx; i++) {
        var x = SMG.x0 + i / res, id = j * nx + i, lb = landB[id];
        /* notch: land share of the ~1.5 u neighbourhood minus a half (coves +, headlands −) */
        var nt = clamp(lb - 0.5, -0.5, 0.5);
        var mf = meadB && lb > 0.004 ? clamp01(meadB[id] / lb) : 0, cf = coveB && lb > 0.004 ? clamp01(coveB[id] / lb) : 0;
        var ov = base[id] - COAST.notch * nt + COAST.cove * cf + COAST.meadow * mf;
        var dx = x - P.x, wp = 1 - smooth(P.r0, P.r1, Math.sqrt(dx * dx + dz * dz));
        ov = clamp(ov + (P.o - ov) * wp, COAST.min, COAST.max);
        o[id] = ov; sd[id] = blur[id] - ov; s[id] = Math.min(sd[id], d0[id] - COAST.beach);
        cove[id] = cf; mead[id] = mf; notch[id] = nt; pin[id] = wp;
      }
    }
    return { res: res, nx: nx, nz: nz, x0: SMG.x0, z0: SMG.z0, d0: d0, sd: sd, s: s, o: o, cove: cove, meadow: mead, notch: notch, pin: pin, land: landB };
  }
  /* bilinear sample of a node-grid channel (clamped to the grid) */
  function sampleGrid(g, arr, x, z) {
    var u = (x - g.x0) * g.res, v = (z - g.z0) * g.res;
    var i0 = clamp(Math.floor(u), 0, g.nx - 2), j0 = clamp(Math.floor(v), 0, g.nz - 2);
    var fu = clamp01(u - i0), fv = clamp01(v - j0), a = j0 * g.nx + i0;
    var top = arr[a] + (arr[a + 1] - arr[a]) * fu, bot = arr[a + g.nx] + (arr[a + g.nx + 1] - arr[a + g.nx]) * fu;
    return top + (bot - top) * fv;
  }
  function inDomain(x, z) { return x >= DOMAIN.x0 && x <= DOMAIN.x1 && z >= DOMAIN.z0 && z <= DOMAIN.z1; }

  /* ================================================================
     HEIGHTS + ZONES (outside the cells)
     ================================================================ */
  /* the pad height an outside point leans on: the nearby land cells' surfaces blended by
     distance (only Meadow Hill is above 0), so terraces roll gently into the sea */
  function topAt(lg, hasMeadow, x, z) {
    if (!hasMeadow) return 0;
    var cx = Math.floor(x + 8), cz = Math.floor(z + 5), sw = 0, sy = 0;
    for (var dr = -2; dr <= 2; dr++) {
      var r = cz + dr;
      if (r < 0 || r > 9) continue;
      for (var dc = -2; dc <= 2; dc++) {
        var c = cx + dc;
        if (c < 0 || c > 15 || !lg[c + r * 16]) continue;
        var d = squareDist(x, z, c, r) + 0.06, w = 1 / (d * d * d * d);
        sw += w; sy += w * cellY(c, r, lg[c + r * 16]);
      }
    }
    return sw > 0 ? sy / sw : 0;
  }
  /* every field value the profiles need at a point (bilinear on the 1/4 u grid) */
  function fieldsAt(bk, x, z, f) {
    var sm = bk.sm, e = 0.125;
    f.d0 = sampleGrid(sm, sm.d0, x, z); f.s = sampleGrid(sm, sm.s, x, z);
    f.gx = sampleGrid(sm, sm.d0, x + e, z) - sampleGrid(sm, sm.d0, x - e, z);
    f.gz = sampleGrid(sm, sm.d0, x, z + e) - sampleGrid(sm, sm.d0, x, z - e);
    var gl = Math.sqrt(f.gx * f.gx + f.gz * f.gz) || 1;
    f.gx /= gl; f.gz /= gl;
    f.o = sampleGrid(sm, sm.o, x, z); f.cove = sampleGrid(sm, sm.cove, x, z); f.meadow = sampleGrid(sm, sm.meadow, x, z);
    f.notch = sampleGrid(sm, sm.notch, x, z); f.pin = sampleGrid(sm, sm.pin, x, z);
    return f;
  }
  /* profile weights + height from fields f and the pad height top leaned on (outside, s < 0) */
  function profileOf(f, top, out) {
    var d0 = f.d0, s = f.s;
    var t = d0 > 0 && s < 0 ? clamp01(d0 / (d0 - s)) : (s >= 0 ? 1 : 0);
    var side = Math.max(smooth(0.3, 0.85, -f.gz), smooth(0.3, 0.85, -f.gx)) * 0.9;
    var rock = Math.max(smooth(0.56, 0.66, f.o), side) * (1 - f.cove) * (1 - f.pin);
    var beach = Math.max(1 - smooth(0.28, 0.40, f.o), f.cove, smooth(0.04, 0.16, f.notch)) * (1 - rock);
    var bank = Math.max(0, 1 - rock - beach);
    var WL = grid().SEA_Y - PROFILE.waterEps, hB;
    /* beach: a grass lip, then a gently sloping sand berm that dips steeply only at the waterline */
    if (t <= PROFILE.lipBeach) { var q = t / PROFILE.lipBeach; hB = top - PROFILE.lipDrop * q * q; }
    else { var u = (t - PROFILE.lipBeach) / (1 - PROFILE.lipBeach); hB = top - PROFILE.lipDrop - (top - PROFILE.lipDrop - WL) * (0.3 * u + 0.7 * u * u); }
    var hK = top - (top - WL) * Math.pow(t, PROFILE.bankPow);
    var face = smooth(PROFILE.lipRock, 0.7, t), rim = PROFILE.rim * Math.sin(Math.PI * clamp01(t / 0.5));
    var hR = top + rim * (1 - face) - (top - WL) * face;
    out.beach = beach; out.bank = bank; out.rock = rock; out.t = t; out.top = top; out.s = s;
    out.h = beach * hB + bank * hK + rock * hR;
    return out;
  }
  function underwater(s) { return grid().SEA_Y - PROFILE.waterEps - 0.04 * Math.min(s / 0.1, 1) - 0.5 * Math.min(s, 1); }
  /* grass / sand / rock shares of an outside point + the zone they make */
  function shares(pw, out) {
    var t = pw.t, gB = 1 - smooth(0.09, 0.16, t), gK = smooth(0.03, 0.08, -pw.s), gR = 1 - smooth(0.2, 0.3, t);
    var wg = pw.beach * gB + pw.bank * gK + pw.rock * gR, ws = pw.beach * (1 - gB) + pw.bank * (1 - gK), wr = pw.rock * (1 - gR);
    var tot = wg + ws + wr || 1, Y = grid().SEA_Y;
    out.g = wg / tot; out.sa = ws / tot; out.r = wr / tot; out.wet = smooth(Y + PROFILE.wetBand, Y - 0.01, pw.h);
    out.zone = out.wet > 0.5 ? ZONES.wet : out.r >= out.g && out.r >= out.sa ? ZONES.rock : out.sa > out.g ? ZONES.sand : ZONES.grass;
    return out;
  }
  var _c1 = [0, 0, 0], _c2 = [0, 0, 0], _c3 = [0, 0, 0], _c4 = [0, 0, 0], _sw = {};
  /* outside colour (sRGB) from the shares; returns the zone */
  function outsideColour(x, z, f, pw, out) {
    shares(pw, _sw);
    out[0] = out[1] = out[2] = 0;
    if (_sw.g > 0) {
      turfRgb(x, z, f.meadow, _c1);
      if (f.cove > 0) mix3(_c1, sandRgb(x, z, _c2), f.cove, _c1);
      out[0] += _c1[0] * _sw.g; out[1] += _c1[1] * _sw.g; out[2] += _c1[2] * _sw.g;
    }
    if (_sw.sa > 0) { sandRgb(x, z, _c2); out[0] += _c2[0] * _sw.sa; out[1] += _c2[1] * _sw.sa; out[2] += _c2[2] * _sw.sa; }
    if (_sw.r > 0) { rockRgb(x, z, _c3); out[0] += _c3[0] * _sw.r; out[1] += _c3[1] * _sw.r; out[2] += _c3[2] * _sw.r; }
    if (_sw.wet > 0) {
      mix3(tokenRgb('Wet Dune'), shift(_sw.r > 0 ? _c3 : tokenRgb('Cliff Rock'), -0.25, 0, _c4), _sw.r, _c4);
      mix3(out, _c4, _sw.wet * 0.9, out);
    }
    return _sw.zone;
  }

  /* ================================================================
     BAKE
     ================================================================ */
  function bake(landArg, o) {
    o = o || {};
    var t0 = now();
    /* the lattice step: the tier's (SLTier budget.terrainSpacing), or an explicit one that divides 1 */
    var tier = normTier(o.tier), sp = o.spacing === 0.5 || o.spacing === 0.25 || o.spacing === 0.125 ? o.spacing : SPACING[tier];
    var land = landSetOf(landArg), lg = landGridOf(land), seed = o.seed == null ? '' : String(o.seed), off = seedOffset(seed);
    var hasMeadow = false, cells = [];
    for (var ci = 0; ci < 160; ci++) if (lg[ci]) { cells.push({ c: ci % 16, r: (ci / 16) | 0, id: ci, code: lg[ci] }); if (lg[ci] === 3) hasMeadow = true; }
    var sm = smoothField(lg, off), ph = { coast: now() - t0 }, t1;
    var bk = { version: VERSION, tier: tier, spacing: sp, seed: seed, off: off, sig: landSig(land), land: land, lg: lg, cells: cells, hasMeadow: hasMeadow, sm: sm };
    t1 = now(); bk.lattice = buildLattice(bk); ph.lattice = now() - t1;
    t1 = now(); bk.coastLines = coastLines(sm); bk.structures = layoutStructures(bk); bk.anchors = anchorsOf(bk); ph.structures = now() - t1;
    t1 = now(); bk.points = dressPoints(bk); ph.points = now() - t1;
    t1 = now(); bk.field = seaField(bk); ph.field = now() - t1;
    bk.bounds = boundsOf(bk);
    bk.ms = now() - t0;
    bk.phases = ph;
    return bk;
  }

  /* ---------------- the lattice ---------------- */
  var _f = {}, _pw = {};
  function buildLattice(bk) {
    var sm = bk.sm, sp = bk.spacing, lg = bk.lg;
    var NX = Math.round((DOMAIN.x1 - DOMAIN.x0) / sp), NZ = Math.round((DOMAIN.z1 - DOMAIN.z0) / sp);
    var nx = NX + 1, nz = NZ + 1, n = nx * nz;
    var X = new Float32Array(n), Z = new Float32Array(n), H = new Float32Array(n), S = new Float32Array(n);
    var touch = new Int16Array(n * 4).fill(-1), flags = new Uint8Array(n), col = new Float32Array(n * 3), zone = new Uint8Array(n);
    var lim = 0.4 * sp, WL = grid().SEA_Y - PROFILE.waterEps, e = 0.0625, i, j;
    for (j = 0; j < nz; j++) {
      for (i = 0; i < nx; i++) {
        var k = j * nx + i, x = DOMAIN.x0 + i * sp, z = DOMAIN.z0 + j * sp;
        X[k] = x; Z[k] = z;
        /* a land node: the unlocked cells whose closed squares hold it */
        var cc = x + 8, rr = z + 5, t = 0, hmin = Infinity, hmax = -Infinity, code = 0;
        var c0 = Math.ceil(cc) - 1, c1 = Math.floor(cc), r0 = Math.ceil(rr) - 1, r1 = Math.floor(rr);
        for (var r = r0; r <= r1; r++) for (var c = c0; c <= c1; c++) {
          if (c < 0 || c > 15 || r < 0 || r > 9 || !lg[c + r * 16]) continue;
          touch[k * 4 + t++] = c + r * 16;
          var y = cellY(c, r, lg[c + r * 16]);
          if (y < hmin) hmin = y;
          if (y > hmax) { hmax = y; code = lg[c + r * 16]; }
        }
        if (t) {
          S[k] = Math.min(sampleGrid(sm, sm.s, x, z), -COAST.beach);
          flags[k] = 1 | (hmax - hmin > 1e-9 ? 2 : 0);
          H[k] = hmax;
          zone[k] = code === 2 ? ZONES.sandPad : ZONES.pad;
          continue;
        }
        var s = S[k] = sampleGrid(sm, sm.s, x, z);
        /* surface nets: a coast-band node slides along -∇s onto s = 0 (never a land node) */
        if (Math.abs(s) < sp / 2) {
          var gx = (sampleGrid(sm, sm.s, x + e, z) - sampleGrid(sm, sm.s, x - e, z)) / (2 * e);
          var gz = (sampleGrid(sm, sm.s, x, z + e) - sampleGrid(sm, sm.s, x, z - e)) / (2 * e);
          var l2 = gx * gx + gz * gz;
          if (l2 > 1e-6) {
            var dx = -s * gx / l2, dz = -s * gz / l2, dl = Math.sqrt(dx * dx + dz * dz);
            if (dl > lim) { dx *= lim / dl; dz *= lim / dl; }
            X[k] = x + dx; Z[k] = z + dz;
            S[k] = dl > lim ? s * (1 - lim / dl) : 0;
            flags[k] = 4;
          }
        }
        if (S[k] <= 1e-6) {
          fieldsAt(bk, x, z, _f);
          profileOf(_f, topAt(lg, bk.hasMeadow, x, z), _pw);
          if (S[k] === 0 && (flags[k] & 4)) { _pw.t = 1; _pw.s = 0; _pw.h = WL; }
          H[k] = _pw.h;
          zone[k] = outsideColour(X[k], Z[k], _f, _pw, _c1);
          toLinear(_c1, col, k * 3);
        } else {
          H[k] = underwater(S[k]);
          zone[k] = ZONES.sea;
          toLinear(tokenRgb('Wet Dune'), col, k * 3);
        }
      }
    }
    return { NX: NX, NZ: NZ, nx: nx, nz: nz, sp: sp, X: X, Z: Z, H: H, S: S, touch: touch, flags: flags, col: col, zone: zone };
  }

  /* ---------------- coastlines: marching squares on s = 0 (the 1/4 u grid) ---------------- */
  function coastLines(g) {
    var nx = g.nx, nz = g.nz, s = g.s, i, j;
    var pts = new Map(), adj = new Map();
    function pt(a, b) {
      var key = a < b ? a * 4194304 + b : b * 4194304 + a;
      if (!pts.has(key)) {
        var sa = s[a], sb = s[b], t = sa / (sa - sb), ai = a % nx, aj = (a - ai) / nx, bi = b % nx, bj = (b - bi) / nx;
        pts.set(key, [g.x0 + (ai + (bi - ai) * t) / g.res, g.z0 + (aj + (bj - aj) * t) / g.res]);
      }
      return key;
    }
    function link(p, q) {
      if (!adj.has(p)) adj.set(p, []);
      if (!adj.has(q)) adj.set(q, []);
      adj.get(p).push(q); adj.get(q).push(p);
    }
    for (j = 0; j < nz - 1; j++) {
      for (i = 0; i < nx - 1; i++) {
        var a = j * nx + i, b = a + 1, c = a + nx + 1, d = a + nx;
        var m = (s[a] <= 0 ? 1 : 0) | (s[b] <= 0 ? 2 : 0) | (s[c] <= 0 ? 4 : 0) | (s[d] <= 0 ? 8 : 0);
        if (m === 0 || m === 15) continue;
        var e = [];
        if ((m & 1) !== ((m >> 1) & 1)) e.push(pt(a, b));
        if (((m >> 1) & 1) !== ((m >> 2) & 1)) e.push(pt(b, c));
        if (((m >> 2) & 1) !== ((m >> 3) & 1)) e.push(pt(c, d));
        if (((m >> 3) & 1) !== (m & 1)) e.push(pt(d, a));
        if (e.length === 2) link(e[0], e[1]);
        else if (e.length === 4) {
          var ctr = (s[a] + s[b] + s[c] + s[d]) / 4 <= 0;
          if ((m === 5) === ctr) { link(e[0], e[3]); link(e[1], e[2]); } else { link(e[0], e[1]); link(e[2], e[3]); }
        }
      }
    }
    var seen = new Set(), lines = [], starts = [];
    /* open chains (they end on the domain border) start at an end; loops anywhere */
    adj.forEach(function (nb, key) { if (nb.length === 1) starts.push(key); });
    adj.forEach(function (nb, key) { if (nb.length !== 1) starts.push(key); });
    starts.forEach(function (start) {
      if (seen.has(start)) return;
      var cur = start, prev = null, chain = [start], guard = 0;
      seen.add(start);
      while (guard++ < 1e6) {
        var nb = adj.get(cur), nxt = null;
        for (var q = 0; q < nb.length; q++) if (nb[q] !== prev && !seen.has(nb[q])) { nxt = nb[q]; break; }
        if (nxt === null) break;
        prev = cur; cur = nxt; seen.add(cur); chain.push(cur);
      }
      var closed = chain.length > 2 && adj.get(cur).indexOf(start) >= 0;
      /* simplify to ≈ 0.12 u steps */
      var out = [], last = null;
      for (var k = 0; k < chain.length; k++) {
        var p = pts.get(chain[k]);
        if (!last || k === chain.length - 1 || Math.hypot(p[0] - last[0], p[1] - last[1]) >= 0.12) { out.push(p[0], p[1]); last = p; }
      }
      if (out.length >= 6) lines.push({ closed: closed, pts: new Float32Array(out) });
    });
    lines.sort(function (p, q) { return q.pts.length - p.pts.length; });
    return lines;
  }

  /* ================================================================
     PUBLIC SAMPLERS
     ================================================================ */
  function cellAt(bk, x, z) {
    var c = Math.floor(x + 8), r = Math.floor(z + 5);
    if (c < 0 || c > 15 || r < 0 || r > 9) return -1;
    return bk.lg[c + r * 16] ? c + r * 16 : -1;
  }
  var _hf = {}, _hp = {};
  /* ground height at a world point: a pad's surfaceY inside an unlocked cell, the baked ground elsewhere */
  function heightAt(bk, x, z) {
    var cid = cellAt(bk, x, z);
    if (cid >= 0) return cellY(cid % 16, (cid / 16) | 0, bk.lg[cid]);
    fieldsAt(bk, x, z, _hf);
    if (_hf.s >= 0) return underwater(_hf.s);
    return profileOf(_hf, topAt(bk.lg, bk.hasMeadow, x, z), _hp).h;
  }
  function coastAt(bk, x, z) { return sampleGrid(bk.sm, bk.sm.s, x, z); }
  /* distance from a point to the nearest unlocked cell square (d0; negative inside) */
  function landDist(bk, x, z) { return sampleGrid(bk.sm, bk.sm.d0, x, z); }
  var _zs = {};
  function zoneAt(bk, x, z) {
    var cid = cellAt(bk, x, z);
    if (cid >= 0) return bk.lg[cid] === 2 ? ZONES.sandPad : ZONES.pad;
    fieldsAt(bk, x, z, _hf);
    if (_hf.s >= 0) return ZONES.sea;
    profileOf(_hf, topAt(bk.lg, bk.hasMeadow, x, z), _hp);
    return shares(_hp, _zs).zone;
  }
  /* the nearest unlocked cell (within 2 cells; -1 farther out) */
  function nearestCell(bk, x, z) {
    var cx = Math.floor(x + 8), cz = Math.floor(z + 5), best = Infinity, id = -1;
    for (var dr = -2; dr <= 2; dr++) {
      var r = cz + dr;
      if (r < 0 || r > 9) continue;
      for (var dc = -2; dc <= 2; dc++) {
        var c = cx + dc;
        if (c < 0 || c > 15 || !bk.lg[c + r * 16]) continue;
        var d = squareDist(x, z, c, r);
        if (d < best) { best = d; id = c + r * 16; }
      }
    }
    return id;
  }

  /* ================================================================
     STRUCTURES (generated with the coast; regenerated only on land change)
     ================================================================ */
  function layoutStructures(bk) {
    var out = { walls: [], boulders: [], decks: [], lamps: [], plaza: null, abutment: null, lookout: null, islet: null, stacks: [], footprints: [] };
    var lg = bk.lg, SEA = grid().SEA_Y;
    /* retaining walls: unlocked neighbours whose pads differ by ≥ 0.15 (meadow ↔ home) */
    for (var r = 0; r < 10; r++) {
      for (var c = 0; c < 16; c++) {
        var a = lg[c + r * 16];
        if (!a) continue;
        var ya = cellY(c, r, a);
        for (var dv = 0; dv < 2; dv++) {
          var c2 = c + (dv ? 0 : 1), r2 = r + (dv ? 1 : 0);
          if (c2 > 15 || r2 > 9 || !lg[c2 + r2 * 16]) continue;
          var yb = cellY(c2, r2, lg[c2 + r2 * 16]);
          if (Math.abs(ya - yb) < 0.145) continue;
          var lowIsB = yb < ya, lc = lowIsB ? c2 : c, lr = lowIsB ? r2 : r;
          var w = !dv ? { x0: c2 - 8, z0: r - 5, x1: c2 - 8, z1: r - 4, nx: lowIsB ? 1 : -1, nz: 0 }
            : { x0: c - 8, z0: r2 - 5, x1: c - 7, z1: r2 - 5, nx: 0, nz: lowIsB ? 1 : -1 };
          w.yLow = Math.min(ya, yb); w.yHigh = Math.max(ya, yb); w.cell = lc + lr * 16;
          out.walls.push(w);
        }
      }
    }
    var lockedOK = function (x, z, pad) { return regionDist(x, z, true, lg) >= EXCLUDE + (pad || 0); };
    var clearOfAll = function (x, z, pad) { return regionDist(x, z, false, lg) >= EXCLUDE + (pad || 0); };
    /* boulders along the rocky coast (t ≈ 0.4–1.1), 4 faceted bases × yaw × scale 0.6–1.6 × tint */
    var every = STRUCT.boulderEvery[bk.tier] || 0.8, f = {}, pw = {};
    bk.coastLines.forEach(function (ln, li) {
      var p = ln.pts, acc = 0, nextAt = every * 0.5;
      for (var k = 2; k < p.length; k += 2) {
        var x = p[k], z = p[k + 1];
        acc += Math.hypot(x - p[k - 2], z - p[k - 1]);
        if (acc < nextAt) continue;
        var hsh = hash2(Math.round(x * 64), Math.round(z * 64), SEED_D + li);
        nextAt = acc + every * (0.75 + 0.5 * (hsh & 255) / 255);
        fieldsAt(bk, x, z, f);
        profileOf(f, topAt(lg, bk.hasMeadow, x, z), pw);
        if (pw.rock < 0.5) continue;
        /* along the coast normal: t 0.4 (on the bluff foot) … 1.1 (just off the waterline) */
        var gx = coastAt(bk, x + 0.05, z) - coastAt(bk, x - 0.05, z), gz = coastAt(bk, x, z + 0.05) - coastAt(bk, x, z - 0.05);
        var gl = Math.hypot(gx, gz) || 1;
        gx /= gl; gz /= gl;
        var dist = Math.max(landDist(bk, x, z), 0.14), tt = 0.4 + 0.7 * ((hsh >>> 8) & 255) / 255;
        var bx = x - gx * (1 - tt) * dist, bz = z - gz * (1 - tt) * dist;
        var size = 0.2 * (0.6 + 1.0 * ((hsh >>> 16) & 255) / 255);
        /* a faceted rock reaches ≤ 1.18 × 1.15 × size from its centre: keep it off every pad */
        if (landDist(bk, bx, bz) < size * 1.4 + 0.02 || !lockedOK(bx, bz, size * 1.4)) continue;
        out.boulders.push({
          x: bx, y: heightAt(bk, bx, bz) - 0.3 * size, z: bz, r: size, variant: hsh & 3, yaw: ((hsh >>> 4) & 1023) / 1023 * TAU,
          sx: 0.85 + 0.3 * ((hsh >>> 2) & 63) / 63, sy: 0.6 + 0.35 * ((hsh >>> 14) & 63) / 63, sz: 0.85 + 0.3 * ((hsh >>> 20) & 63) / 63,
          tint: 0.92 + 0.14 * ((hsh >>> 26) & 63) / 63, cell: nearestCell(bk, bx, bz)
        });
      }
    });
    /* the South Promenade: a curved boardwalk along the home south beach at t ≈ 0.55 */
    out.decks.push(promenade(bk, out));
    /* NE Ferry Jetty: from the beach out to (4.2, -5.8) */
    var jt = STRUCT.jetty, jdx = jt.to[0] - jt.from[0], jdz = jt.to[1] - jt.from[1], jl = Math.hypot(jdx, jdz);
    var ux = jdx / jl, uz = jdz / jl, sx = jt.to[0], sz = jt.to[1];
    for (var st = 0; st < 60; st++) {
      var nxp = sx + ux * 0.05, nzp = sz + uz * 0.05;
      if (!clearOfAll(nxp, nzp, jt.w / 2) || coastAt(bk, nxp, nzp) < -0.1) break;
      sx = nxp; sz = nzp;
    }
    var jetty = straightDeck(bk, 'jetty', jt.from, [sx, sz], jt.w, 'both');
    jetty.lamp = true;
    out.decks.push(jetty);
    out.footprints.push(capsule(jt.from[0], jt.from[1], sx, sz, jt.w / 2 + 0.04));
    /* the Lantern Bridge abutment: a concrete pier with a teak deck at the waterline */
    var ab = STRUCT.abutment, abz0 = ab.z;
    while (abz0 < -4.0 && clearOfAll(ab.x, abz0 + 0.02, 0)) abz0 += 0.02;
    var abTop = Math.max(heightAt(bk, ab.x, abz0) + STRUCT.deck.lift, SEA + 0.14);
    out.abutment = { x: ab.x, z0: abz0, z1: ab.z - 0.3, w: ab.w, y: abTop, cell: nearestCell(bk, ab.x, abz0) };
    out.footprints.push({ x0: ab.x - ab.w / 2 - 0.05, z0: ab.z - 0.35, x1: ab.x + ab.w / 2 + 0.05, z1: abz0 + 0.05 });
    /* P1: Cove Pier (cove unlocked) and Meadow Lookout (meadow unlocked) */
    if (bk.cells.some(function (p) { return p.code === 2; })) {
      var pxs = 8 + EXCLUDE + 0.02, pz = STRUCT.pier.z;
      var pier = straightDeck(bk, 'pier', [pxs + STRUCT.pier.len, pz], [pxs, pz], STRUCT.pier.w, 'both');
      pier.lamp = true;
      out.decks.push(pier);
      out.footprints.push(capsule(pxs, pz, pxs + STRUCT.pier.len, pz, STRUCT.pier.w / 2 + 0.04));
    }
    if (lg[2 * 16] === 3) {
      var lk = STRUCT.lookout, lx = -8 - EXCLUDE - 0.02 - lk.w / 2, lz = -3 - EXCLUDE - 0.02 - lk.d / 2;
      out.lookout = { x: lx, z: lz, w: lk.w, d: lk.d, y: cellY(0, 2, 3) + 0.04, cell: 2 * 16 };
    }
    /* off-grid relief: Lantern Islet and the rock stacks */
    out.islet = { x: STRUCT.islet.x, z: STRUCT.islet.z, r: STRUCT.islet.r, h: STRUCT.islet.h };
    out.stacks = STRUCT.stacks.map(function (q) { return { x: q.x, z: q.z, r: q.r, h: q.h }; });
    return out;
  }
  function capsule(ax, az, bx, bz, r) { return { x0: Math.min(ax, bx) - r, z0: Math.min(az, bz) - r, x1: Math.max(ax, bx) + r, z1: Math.max(az, bz) + r }; }
  /* a deck between two points: centre polyline, heights, posts over water */
  function straightDeck(bk, name, a, b, w, edge) {
    var len = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(len / 0.25)), pts = [];
    for (var k = 0; k <= n; k++) pts.push({ x: lerp(a[0], b[0], k / n), z: lerp(a[1], b[1], k / n) });
    return deckFrom(bk, name, pts, w, edge);
  }
  function deckFrom(bk, name, pts, w, edge) {
    var SEA = grid().SEA_Y, ys = pts.map(function (p) { return Math.max(heightAt(bk, p.x, p.z) + STRUCT.deck.lift, SEA + 0.1); });
    /* level small bumps: a running max over ±1 sample */
    var y2 = ys.map(function (y, k) { return Math.max(y, ys[Math.max(0, k - 1)] - 0.02, ys[Math.min(ys.length - 1, k + 1)] - 0.02); });
    var posts = [], acc = 0, k;
    if (heightAt(bk, pts[0].x, pts[0].z) < SEA + 0.02) posts.push(0);
    for (k = 1; k < pts.length; k++) {
      acc += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].z - pts[k - 1].z);
      if (acc >= STRUCT.deck.post - 1e-6) {
        acc = 0;
        if (heightAt(bk, pts[k].x, pts[k].z) < SEA + 0.02) posts.push(k);
      }
    }
    var mid = pts[(pts.length / 2) | 0];
    return { name: name, pts: pts, y: y2, w: w, edge: edge || 'sea', posts: posts, cell: nearestCell(bk, mid.x, mid.z) };
  }
  function promenade(bk, out) {
    var P = STRUCT.promenade, lg = bk.lg, pts = [], widest = null;
    for (var x = P.x0; x <= P.x1 + 1e-9; x += P.step) {
      /* the south edge of the land under this x, then the beach width beyond it */
      var zEdge = null;
      for (var cc = Math.floor(x + 8 - 1e-6); cc <= Math.floor(x + 8 + 1e-6); cc++) {
        for (var r = 9; r >= 0; r--) if (cc >= 0 && cc < 16 && lg[cc + r * 16]) { var ze = r - 4; zEdge = zEdge == null ? ze : Math.max(zEdge, ze); break; }
      }
      if (zEdge == null) zEdge = 4;
      var cd = 0;
      while (cd < 1.2 && coastAt(bk, x, zEdge + cd + 0.02) < 0) cd += 0.02;
      pts.push({ x: x, z: zEdge + Math.max(P.minOff, P.t * cd), edge: zEdge, beach: cd });
      if (!widest || cd > widest.beach) widest = pts[pts.length - 1];
    }
    /* smooth the centre line (3-tap) so the boardwalk curves instead of zig-zagging */
    var sm = pts.map(function (p, k) {
      var a = pts[Math.max(0, k - 1)], b = pts[Math.min(pts.length - 1, k + 1)];
      return { x: p.x, z: Math.max(p.edge + P.minOff, (a.z + 2 * p.z + b.z) / 4) };
    });
    var deck = deckFrom(bk, 'promenade', sm, STRUCT.deck.w, 'sea');
    deck.bollardEvery = P.bollardEvery;
    sm.forEach(function (p) { out.footprints.push({ x0: p.x - 0.16, z0: p.z - STRUCT.deck.w / 2 - 0.04, x1: p.x + 0.16, z1: p.z + STRUCT.deck.w / 2 + 0.04 }); });
    if (widest && widest.beach >= STRUCT.plaza.minBeach) {
      var pz = Math.max(widest.edge + STRUCT.plaza.depth / 2 + 0.04, widest.edge + P.t * widest.beach);
      out.plaza = { x: widest.x, z: pz, len: STRUCT.plaza.len, depth: STRUCT.plaza.depth, y: Math.max(heightAt(bk, widest.x, pz) + STRUCT.deck.lift, grid().SEA_Y + 0.1), cell: nearestCell(bk, widest.x, pz) };
      out.footprints.push({ x0: widest.x - STRUCT.plaza.len / 2, z0: pz - STRUCT.plaza.depth / 2, x1: widest.x + STRUCT.plaza.len / 2, z1: pz + STRUCT.plaza.depth / 2 });
    }
    return deck;
  }
  function anchorsOf(bk) {
    var S = bk.structures, L = look(), SEA = grid().SEA_Y, buoys = (L && L.CONES && L.CONES.buoys) || [[-9.5, -0.32, -6.5], [9.5, -0.32, -6.5]];
    function deck(name) { return S.decks.filter(function (d) { return d.name === name; })[0] || null; }
    function ends(d) { var n = d.pts.length - 1; return { start: { x: d.pts[n].x, y: d.y[n], z: d.pts[n].z }, end: { x: d.pts[0].x, y: d.y[0], z: d.pts[0].z } }; }
    var prom = deck('promenade'), jetty = deck('jetty'), pier = deck('pier');
    var out = {
      abutment: { x: S.abutment.x, y: S.abutment.y, z: S.abutment.z1 },
      jetty: ends(jetty),
      promenade: prom.pts.map(function (p, k) { return { x: p.x, y: prom.y[k], z: p.z }; }),
      plaza: S.plaza ? { x: S.plaza.x, y: S.plaza.y, z: S.plaza.z } : null,
      islet: { x: S.islet.x, y: SEA + S.islet.h, z: S.islet.z, r: S.islet.r },
      stacks: S.stacks.map(function (q) { return { x: q.x, y: SEA + q.h, z: q.z, r: q.r }; }),
      buoys: buoys.map(function (b) { return { x: b[0], y: SEA, z: b[2] }; }),
      beachLoop: beachLoop(bk)
    };
    if (S.lookout) out.lookout = { x: S.lookout.x, y: S.lookout.y, z: S.lookout.z };
    if (pier) out.pier = ends(pier);
    return out;
  }
  /* a walkable loop round the land 0.2 u outside the cell squares where the ground is above the water */
  function beachLoop(bk) {
    var out = [], ln = bk.coastLines[0];
    if (!ln) return out;
    var p = ln.pts;
    for (var k = 0; k < p.length; k += 2) {
      var x = p[k], z = p[k + 1], d = landDist(bk, x, z);
      if (d < 0.25) continue;
      var gx = landDist(bk, x + 0.05, z) - landDist(bk, x - 0.05, z), gz = landDist(bk, x, z + 0.05) - landDist(bk, x, z - 0.05), gl = Math.hypot(gx, gz) || 1;
      var bx = x - gx / gl * (d - 0.2), bz = z - gz / gl * (d - 0.2), by = heightAt(bk, bx, bz);
      if (by <= grid().SEA_Y + 0.02) continue;
      if (!out.length || Math.hypot(bx - out[out.length - 1].x, bz - out[out.length - 1].z) >= 0.3) out.push({ x: bx, y: by, z: bz });
    }
    return out;
  }

  /* ================================================================
     THE SEA FIELD (128 × 80 RGBA8 at 0.25 u)
     ================================================================ */
  /* the distance from a water point inside the quay's superellipse to the quay wall (0 on / behind
     it, Infinity in front of the quay's back half). Newton steps along the gradient land on the wall
     (g = 0), so the result is the length to a real wall point: never shorter than the true distance
     and equal to it near the wall, where the foam is drawn (the old one-step −g/|∇g| estimate read
     3.95 u at (0, −6), 2.21 u from the wall, and squeezed the contours toward the quay) */
  function quayDist(x, z) {
    if (z > QUAY.zc) return Infinity;
    var u = x / QUAY.a, v = (z - QUAY.zc) / QUAY.b, g = u * u * u * u + v * v * v * v - 1;
    if (g >= 0) return 0;
    var px = x, pz = z;
    for (var it = 0; it < 12; it++) {
      u = px / QUAY.a; v = (pz - QUAY.zc) / QUAY.b; g = u * u * u * u + v * v * v * v - 1;
      if (Math.abs(g) < 1e-9) break;
      var gx = 4 * u * u * u / QUAY.a, gz = 4 * v * v * v / QUAY.b, gl2 = gx * gx + gz * gz;
      if (!(gl2 > 1e-12)) break;
      px -= g * gx / gl2; pz -= g * gz / gl2;
    }
    return Math.min(Math.sqrt((px - x) * (px - x) + (pz - z) * (pz - z)), 8);
  }
  /* A: the nearest other shore (u) — Lantern Islet, the rock stacks, the quay wall */
  function otherShoreDist(x, z) {
    var ISL = STRUCT.islet, STK = STRUCT.stacks;
    var d = Math.sqrt((x - ISL.x) * (x - ISL.x) + (z - ISL.z) * (z - ISL.z)) - ISL.r - 0.05;
    for (var q = 0; q < STK.length; q++) {
      var dS = Math.sqrt((x - STK[q].x) * (x - STK[q].x) + (z - STK[q].z) * (z - STK[q].z)) - STK[q].r - 0.04;
      if (dS < d) d = dS;
    }
    var dQ = quayDist(x, z);
    if (dQ < d) d = dQ;
    return d > 0 ? d : 0;
  }
  function seaField(bk) {
    var W = FIELD.w, Hh = FIELD.h, sm = bk.sm, data = new Uint8Array(W * Hh * 4);
    var shore = new Float32Array(W * Hh), lockedF = new Float32Array(W * Hh), lagoon = new Float32Array(W * Hh), other = new Float32Array(W * Hh);
    var C = core(), lockedRegions = [];
    Object.keys(C.REGION_CELLS).forEach(function (rk) { if (rk !== 'home' && C.REGION_CELLS[rk].some(function (k) { return !bk.land[k]; })) lockedRegions.push(rk); });
    /* the locked regions' FUTURE coasts (1/2 u fields): bake land ∪ region, keep that region's part */
    var futures = lockedRegions.map(function (rk) {
      var lg2 = new Uint8Array(bk.lg);
      C.REGION_CELLS[rk].forEach(function (k) { var p = k.split(','); lg2[+p[0] + 16 * +p[1]] = REGION_CODE[rk]; });
      return smoothField(lg2, bk.off, 2);
    });
    for (var j = 0; j < Hh; j++) {
      var z = FIELD.z0 + (j + 0.5) * FIELD.texel;
      for (var i = 0; i < W; i++) {
        /* texel centre = coast-field node (i, j) */
        var x = FIELD.x0 + (i + 0.5) * FIELD.texel, k = j * W + i, node = j * sm.nx + i, sCur = sm.s[node];
        var R = sCur > 0 ? sCur : 0, G = FIELD.maxLocked * 4;
        /* the other shores only matter within the foam's reach (A saturates at maxOther); under the
           island A reads 'none', so filtering never smears the island's land into a fake other shore */
        var O = R > 0 ? Math.min(otherShoreDist(x, z), FIELD.maxOther) : FIELD.maxOther;
        for (var f = 0; f < futures.length; f++) G = Math.min(G, Math.max(sampleGrid(futures[f], futures[f].s, x, z), -sCur - 0.3));
        var lag = R > 0 ? clamp01((sm.land[node] - 0.2) / 0.3) * (1 - smooth(0.3, 2.2, R)) : 0;
        shore[k] = R; lockedF[k] = G; lagoon[k] = lag; other[k] = O;
        data[k * 4] = Math.round(clamp01(R / FIELD.maxShore) * 255);
        data[k * 4 + 1] = Math.round(clamp01(0.5 + G / (2 * FIELD.maxLocked)) * 255);
        data[k * 4 + 2] = Math.round(lag * 255);
        data[k * 4 + 3] = Math.round(clamp01(O / FIELD.maxOther) * 255);
      }
    }
    return { w: W, h: Hh, x0: FIELD.x0, z0: FIELD.z0, texel: FIELD.texel, maxShore: FIELD.maxShore, maxLocked: FIELD.maxLocked,
             maxOther: FIELD.maxOther, data: data, shore: shore, locked: lockedF, lagoon: lagoon, other: other, lockedRegions: lockedRegions };
  }
  function boundsOf(bk) {
    var L = bk.lattice, b = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity, maxY: 0 };
    for (var k = 0; k < L.X.length; k++) {
      if (L.S[k] > 1e-6) continue;
      var x = L.X[k], z = L.Z[k];
      if (x < b.minX) b.minX = x;
      if (x > b.maxX) b.maxX = x;
      if (z < b.minZ) b.minZ = z;
      if (z > b.maxZ) b.maxZ = z;
      if (L.H[k] > b.maxY) b.maxY = L.H[k];
    }
    b.cx = (b.minX + b.maxX) / 2; b.cz = (b.minZ + b.maxZ) / 2;
    return b;
  }

  /* ================================================================
     MESH: the terrain as one indexed mesh
     ================================================================ */
  function ArrayMesh() { this.p = []; this.n = []; this.c = []; this.i = []; this.cell = []; this.nv = 0; }
  ArrayMesh.prototype.v = function (x, y, z, nx, ny, nz, r, g, b) {
    this.p.push(x, y, z); this.n.push(nx, ny, nz); this.c.push(r, g, b);
    return this.nv++;
  };
  ArrayMesh.prototype.tri = function (a, b, c, cell) { this.i.push(a, b, c); this.cell.push(cell == null ? -1 : cell); };
  ArrayMesh.prototype.out = function () {
    var nv = this.nv, idx = nv > 65535 ? new Uint32Array(this.i) : new Uint16Array(this.i);
    return { position: new Float32Array(this.p), normal: new Float32Array(this.n), color: new Float32Array(this.c), index: idx,
             cell: new Int16Array(this.cell), tris: this.i.length / 3, verts: nv };
  };

  function meshArrays(bk) {
    var L = bk.lattice, lg = bk.lg, sp = L.sp, nx = L.nx, NX = L.NX, NZ = L.NZ;
    var M = new ArrayMesh(), keyMap = new Int32Array(L.X.length * 16).fill(-1), acc = [], tmp = [0, 0, 0];
    function vPadCol(cls, x, z) { if (cls === 2) sandRgb(x, z, tmp); else turfRgb(x, z, cls >= 3 ? 1 : 0, tmp); }
    /* a pad vertex: (node, pad class) — flat, normal exactly up */
    function vPad(k, cid) {
      var cls = padClass(cid % 16, lg[cid]), key = k * 16 + cls, v = keyMap[key];
      if (v >= 0) return v;
      vPadCol(cls, L.X[k], L.Z[k]);
      v = M.v(L.X[k], cellY(cid % 16, (cid / 16) | 0, lg[cid]), L.Z[k], 0, 1, 0, s2l(tmp[0]), s2l(tmp[1]), s2l(tmp[2]));
      keyMap[key] = v; acc[v] = null;
      return v;
    }
    /* a smooth (non-pad) vertex: an outside node, or a land node seen from an outside quad */
    function vOut(k, cid) {
      var cls = cid < 0 ? 0 : padClass(cid % 16, lg[cid]), key = k * 16 + 8 + cls, v = keyMap[key];
      if (v >= 0) return v;
      if (cid < 0) v = M.v(L.X[k], L.H[k], L.Z[k], 0, 1, 0, L.col[k * 3], L.col[k * 3 + 1], L.col[k * 3 + 2]);
      else { vPadCol(cls, L.X[k], L.Z[k]); v = M.v(L.X[k], cellY(cid % 16, (cid / 16) | 0, lg[cid]), L.Z[k], 0, 1, 0, s2l(tmp[0]), s2l(tmp[1]), s2l(tmp[2])); }
      keyMap[key] = v; acc[v] = [0, 0, 0];
      return v;
    }
    /* the land cell (touching node k) an outside quad centred at (qx, qz) leans on */
    function leanCell(k, qx, qz) {
      var best = Infinity, id = -1;
      for (var t = 0; t < 4; t++) {
        var cid = L.touch[k * 4 + t];
        if (cid < 0) break;
        var d = squareDist(qx, qz, cid % 16, (cid / 16) | 0) - cellY(cid % 16, (cid / 16) | 0, lg[cid]) * 1e-3;
        if (d < best) { best = d; id = cid; }
      }
      return id;
    }
    function nodeVertex(k, qi, qj, qc) {
      if (qc >= 0) return vPad(k, qc);
      if (L.flags[k] & 1) return vOut(k, leanCell(k, DOMAIN.x0 + (qi + 0.5) * sp, DOMAIN.z0 + (qj + 0.5) * sp));
      return vOut(k, -1);
    }
    function face(a, b, c, cell) {
      var P = M.p, ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2];
      var ux = P[b * 3] - ax, uy = P[b * 3 + 1] - ay, uz = P[b * 3 + 2] - az;
      var vx = P[c * 3] - ax, vy = P[c * 3 + 1] - ay, vz = P[c * 3 + 2] - az;
      var gx = uy * vz - uz * vy, gy = uz * vx - ux * vz, gz = ux * vy - uy * vx;
      if (gx * gx + gy * gy + gz * gz < 1e-14) return;
      if (gy < 0) { var t = b; b = c; c = t; gx = -gx; gy = -gy; gz = -gz; }
      M.tri(a, b, c, cell);
      var A = acc[a]; if (A) { A[0] += gx; A[1] += gy; A[2] += gz; }
      A = acc[b]; if (A) { A[0] += gx; A[1] += gy; A[2] += gz; }
      A = acc[c]; if (A) { A[0] += gx; A[1] += gy; A[2] += gz; }
    }
    /* which quads are drawn: any corner on land or on the coast (the rest is under the opaque sea) */
    var emit = new Uint8Array(NX * NZ), qcell = new Int16Array(NX * NZ), qi, qj;
    for (qj = 0; qj < NZ; qj++) {
      var rr = Math.floor(DOMAIN.z0 + (qj + 0.5) * sp + 5);
      for (qi = 0; qi < NX; qi++) {
        var a = qj * nx + qi, q = qj * NX + qi, cc = Math.floor(DOMAIN.x0 + (qi + 0.5) * sp + 8);
        qcell[q] = cc >= 0 && cc < 16 && rr >= 0 && rr < 10 && lg[cc + rr * 16] ? cc + rr * 16 : -1;
        emit[q] = (L.S[a] <= 1e-6 || L.S[a + 1] <= 1e-6 || L.S[a + nx] <= 1e-6 || L.S[a + nx + 1] <= 1e-6) ? 1 : 0;
      }
    }
    /* HIGH: 2 × 2 blocks of quads on one pad merge (flat, so only the vertex count changes) */
    var merged = new Uint8Array(NX * NZ), BW = Math.ceil(NX / 2), blockPad = null;
    if (sp < 0.2) {
      blockPad = new Int16Array(BW * Math.ceil(NZ / 2)).fill(-1);
      for (var bj = 0; bj + 1 < NZ; bj += 2) for (var bi = 0; bi + 1 < NX; bi += 2) {
        var qc = qcell[bj * NX + bi];
        if (qc >= 0 && qcell[bj * NX + bi + 1] === qc && qcell[(bj + 1) * NX + bi] === qc && qcell[(bj + 1) * NX + bi + 1] === qc) {
          blockPad[(bj / 2) * BW + bi / 2] = qc;
          merged[bj * NX + bi] = merged[bj * NX + bi + 1] = merged[(bj + 1) * NX + bi] = merged[(bj + 1) * NX + bi + 1] = 1;
        }
      }
    }
    function blockClass(bI, bJ) {
      if (!blockPad || bI < 0 || bJ < 0 || bI * 2 + 1 >= NX || bJ * 2 + 1 >= NZ) return -1;
      var qc2 = blockPad[bJ * BW + bI];
      return qc2 < 0 ? -1 : padClass(qc2 % 16, lg[qc2]);
    }
    for (qj = 0; qj < NZ; qj++) for (qi = 0; qi < NX; qi++) {
      var q2 = qj * NX + qi;
      if (!emit[q2] || merged[q2]) continue;
      var n00 = qj * nx + qi, n10 = n00 + 1, n01 = n00 + nx, n11 = n01 + 1, qcl = qcell[q2];
      var A0 = nodeVertex(n00, qi, qj, qcl), B0 = nodeVertex(n10, qi, qj, qcl), C0v = nodeVertex(n11, qi, qj, qcl), D0 = nodeVertex(n01, qi, qj, qcl);
      var tagCell = qcl >= 0 ? qcl : nearestCell(bk, DOMAIN.x0 + (qi + 0.5) * sp, DOMAIN.z0 + (qj + 0.5) * sp);
      var hA = M.p[A0 * 3 + 1], hB = M.p[B0 * 3 + 1], hC = M.p[C0v * 3 + 1], hD = M.p[D0 * 3 + 1];
      /* per quad, the diagonal with the smaller height difference */
      if (Math.abs(hA - hC) <= Math.abs(hB - hD)) { face(A0, D0, C0v, tagCell); face(A0, C0v, B0, tagCell); }
      else { face(A0, D0, B0, tagCell); face(B0, D0, C0v, tagCell); }
    }
    if (blockPad) {
      for (var bj2 = 0; bj2 + 1 < NZ; bj2 += 2) for (var bi2 = 0; bi2 + 1 < NX; bi2 += 2) {
        var pc = blockPad[(bj2 / 2) * BW + bi2 / 2];
        if (pc < 0) continue;
        var cls = padClass(pc % 16, lg[pc]), bI = bi2 / 2, bJ = bj2 / 2, n0 = bj2 * nx + bi2;
        /* boundary CCW from above: (x0,z0) → (x0,z1) → (x1,z1) → (x1,z0), plus the mid-edge node
           wherever the neighbour block is not the same pad class (no T-junctions) */
        var ring = [n0];
        if (blockClass(bI - 1, bJ) !== cls) ring.push(n0 + nx);
        ring.push(n0 + 2 * nx);
        if (blockClass(bI, bJ + 1) !== cls) ring.push(n0 + 2 * nx + 1);
        ring.push(n0 + 2 * nx + 2);
        if (blockClass(bI + 1, bJ) !== cls) ring.push(n0 + nx + 2);
        ring.push(n0 + 2);
        if (blockClass(bI, bJ - 1) !== cls) ring.push(n0 + 1);
        var vs = ring.map(function (k) { return vPad(k, pc); });
        if (vs.length === 4) { face(vs[0], vs[1], vs[2], pc); face(vs[0], vs[2], vs[3], pc); }
        else {
          var ctr = vPad(n0 + nx + 1, pc);
          for (var e = 0; e < vs.length; e++) face(ctr, vs[e], vs[(e + 1) % vs.length], pc);
        }
      }
    }
    /* risers: wherever two drawn quads see a shared edge at different heights (terrace steps,
       the meadow ↔ home drop), a vertical face closes the gap exactly on the cell edge */
    function viewH(k, qi2, qj2) {
      var qc2 = qcell[qj2 * NX + qi2];
      if (qc2 >= 0) return cellY(qc2 % 16, (qc2 / 16) | 0, lg[qc2]);
      if (L.flags[k] & 1) { var lc = leanCell(k, DOMAIN.x0 + (qi2 + 0.5) * sp, DOMAIN.z0 + (qj2 + 0.5) * sp); return cellY(lc % 16, (lc / 16) | 0, lg[lc]); }
      return L.H[k];
    }
    function riser(kA, kB, q1i, q1j, q2i, q2j) {
      var a1 = viewH(kA, q1i, q1j), b1 = viewH(kB, q1i, q1j), a2 = viewH(kA, q2i, q2j), b2 = viewH(kB, q2i, q2j);
      if (Math.abs(a1 - a2) < 1e-6 && Math.abs(b1 - b2) < 1e-6) return;
      /* the face looks toward the lower side */
      var low1 = a1 + b1 < a2 + b2, qLi = low1 ? q1i : q2i, qLj = low1 ? q1j : q2j;
      var hiA = Math.max(a1, a2), loA = Math.min(a1, a2), hiB = Math.max(b1, b2), loB = Math.min(b1, b2);
      var xA = L.X[kA], zA = L.Z[kA], xB = L.X[kB], zB = L.Z[kB];
      var cx = DOMAIN.x0 + (qLi + 0.5) * sp, cz = DOMAIN.z0 + (qLj + 0.5) * sp, mx = (xA + xB) / 2, mz = (zA + zB) / 2;
      var ex = xB - xA, ez = zB - zA, el = Math.hypot(ex, ez) || 1, nxv = -ez / el, nzv = ex / el;
      if (nxv * (cx - mx) + nzv * (cz - mz) < 0) { nxv = -nxv; nzv = -nzv; }
      var drop = Math.max(hiA - loA, hiB - loB), qL = qcell[qLj * NX + qLi];
      shift(tokenRgb(drop >= 0.145 ? 'Concrete' : 'Cliff Rock'), drop >= 0.145 ? 0 : 0.18, 0, tmp);
      var r0 = s2l(tmp[0]), g0 = s2l(tmp[1]), b0 = s2l(tmp[2]);
      var tA = M.v(xA, hiA, zA, nxv, 0, nzv, r0, g0, b0), tB = M.v(xB, hiB, zB, nxv, 0, nzv, r0, g0, b0);
      var bA = M.v(xA, loA, zA, nxv, 0, nzv, r0 * 0.82, g0 * 0.82, b0 * 0.82), bB = M.v(xB, loB, zB, nxv, 0, nzv, r0 * 0.82, g0 * 0.82, b0 * 0.82);
      acc[tA] = acc[tB] = acc[bA] = acc[bB] = null;
      var cellTag = qL >= 0 ? qL : nearestCell(bk, cx, cz);
      /* wind so the geometric normal faces the lower side: (tA, bA, tB) faces (-ez, ex) */
      var sideOK = (-ez * nxv + ex * nzv) > 0;
      if (hiA - loA > 1e-6) { if (sideOK) M.tri(tA, bA, tB, cellTag); else M.tri(tA, tB, bA, cellTag); }
      if (hiB - loB > 1e-6) { if (sideOK) M.tri(tB, bA, bB, cellTag); else M.tri(tB, bB, bA, cellTag); }
    }
    for (qj = 0; qj < NZ; qj++) for (qi = 0; qi < NX; qi++) {
      if (!emit[qj * NX + qi]) continue;
      var k0 = qj * nx + qi;
      if (qi + 1 < NX && emit[qj * NX + qi + 1] && ((L.flags[k0 + 1] & 1) || (L.flags[k0 + 1 + nx] & 1))) riser(k0 + 1, k0 + 1 + nx, qi, qj, qi + 1, qj);
      if (qj + 1 < NZ && emit[(qj + 1) * NX + qi] && ((L.flags[k0 + nx] & 1) || (L.flags[k0 + nx + 1] & 1))) riser(k0 + nx, k0 + nx + 1, qi, qj, qi, qj + 1);
    }
    /* smooth normals for the free-form ground */
    for (var v = 0; v < M.nv; v++) {
      var Av = acc[v];
      if (!Av) continue;
      var l = Math.sqrt(Av[0] * Av[0] + Av[1] * Av[1] + Av[2] * Av[2]) || 1;
      M.n[v * 3] = Av[0] / l; M.n[v * 3 + 1] = Av[1] / l; M.n[v * 3 + 2] = Av[2] / l;
    }
    return M.out();
  }

  /* ================================================================
     PURE PRIMITIVES (scenery + dressing): flat-shaded, linear vertex colours
     ================================================================ */
  function Builder() { ArrayMesh.call(this); this.tint = 1; this.cellTag = -1; }
  Builder.prototype = Object.create(ArrayMesh.prototype);
  /* a flat-shaded triangle (own vertices) in sRGB colour col (× the builder's tint) */
  Builder.prototype.ftri = function (a, b, c, col) {
    var ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (l < 1e-12) return;
    nx /= l; ny /= l; nz /= l;
    var t = this.tint, r = s2l(col[0] * t), g = s2l(col[1] * t), bb = s2l(col[2] * t);
    var i0 = this.v(a[0], a[1], a[2], nx, ny, nz, r, g, bb), i1 = this.v(b[0], b[1], b[2], nx, ny, nz, r, g, bb), i2 = this.v(c[0], c[1], c[2], nx, ny, nz, r, g, bb);
    this.tri(i0, i1, i2, this.cellTag);
  };
  Builder.prototype.fquad = function (a, b, c, d, col) { this.ftri(a, b, c, col); this.ftri(a, c, d, col); };
  /* an oriented box: centre (x, y, z), size (sx, sy, sz), yaw (rad about +y); colFn(face) → sRGB */
  Builder.prototype.box = function (x, y, z, sx, sy, sz, yaw, colFn, o) {
    o = o || {};
    var cs = Math.cos(yaw || 0), sn = Math.sin(yaw || 0), hx = sx / 2, hy = sy / 2, hz = sz / 2;
    function P(px, py, pz) { return [x + px * cs + pz * sn, y + py, z - px * sn + pz * cs]; }
    var c000 = P(-hx, -hy, -hz), c100 = P(hx, -hy, -hz), c110 = P(hx, hy, -hz), c010 = P(-hx, hy, -hz);
    var c001 = P(-hx, -hy, hz), c101 = P(hx, -hy, hz), c111 = P(hx, hy, hz), c011 = P(-hx, hy, hz);
    this.fquad(c010, c011, c111, c110, colFn('top'));
    this.fquad(c001, c101, c111, c011, colFn('side'));
    this.fquad(c100, c000, c010, c110, colFn('side'));
    this.fquad(c101, c100, c110, c111, colFn('end'));
    this.fquad(c000, c001, c011, c010, colFn('end'));
    if (!o.noBottom) this.fquad(c000, c100, c101, c001, colFn('bottom'));
  };
  /* an n-gon frustum from y0 (radius r0) to y1 (radius r1), optional domed top cap */
  Builder.prototype.prism = function (x, y0, z, r0, y1, r1, sides, col, o) {
    o = o || {};
    var ph = o.phase || 0, ring0 = [], ring1 = [], lx = o.lean ? o.lean[0] : 0, lz = o.lean ? o.lean[1] : 0, k;
    for (k = 0; k < sides; k++) {
      var a = ph + k / sides * TAU, j0 = o.jitter ? 1 + o.jitter(k, 0) : 1, j1 = o.jitter ? 1 + o.jitter(k, 1) : 1;
      ring0.push([x + Math.cos(a) * r0 * j0, y0, z + Math.sin(a) * r0 * j0]);
      ring1.push([x + Math.cos(a) * r1 * j1 + lx, y1, z + Math.sin(a) * r1 * j1 + lz]);
    }
    for (k = 0; k < sides; k++) {
      var k2 = (k + 1) % sides;
      this.fquad(ring0[k], ring1[k], ring1[k2], ring0[k2], typeof col === 'function' ? col('side', k) : col);
    }
    if (o.cap !== false && r1 > 1e-4) {
      var top = [x + lx, y1 + (o.dome || 0), z + lz];
      for (k = 0; k < sides; k++) this.ftri(top, ring1[(k + 1) % sides], ring1[k], typeof col === 'function' ? col('top', k) : col);
    }
    return ring1;
  };
  /* faceted rock: an icosahedron (20 faces) jittered by variant, scaled and turned */
  var ICO = (function () {
    var t = (1 + Math.sqrt(5)) / 2, v = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]];
    v = v.map(function (p) { var l = Math.hypot(p[0], p[1], p[2]); return [p[0] / l, p[1] / l, p[2] / l]; });
    var f = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
      [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
    return { v: v, f: f };
  }());
  Builder.prototype.rock = function (x, y, z, r, sx, sy, sz, yaw, variant, colFn) {
    var cs = Math.cos(yaw), sn = Math.sin(yaw), self = this;
    var pts = ICO.v.map(function (p, k) {
      var j = 0.82 + 0.36 * h01(k, variant, 0x51ed);
      var px = p[0] * r * sx * j, py = p[1] * r * sy * j, pz = p[2] * r * sz * j;
      return [x + px * cs + pz * sn, y + py, z - px * sn + pz * cs];
    });
    ICO.f.forEach(function (f, fi) {
      var a = pts[f[0]], b = pts[f[1]], c = pts[f[2]], cy = (a[1] + b[1] + c[1]) / 3 - y;
      var ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      var mx = (a[0] + b[0] + c[0]) / 3 - x, mz = (a[2] + b[2] + c[2]) / 3 - z;
      if (nx * mx + ny * cy + nz * mz < 0) { var t = b; b = c; c = t; }   /* wind outward */
      self.ftri(a, b, c, colFn(cy / (r * sy), fi));
    });
  };

  /* ================================================================
     SCENERY
     ================================================================ */
  var _sh = [0, 0, 0];
  function sceneryArrays(bk) {
    var S = bk.structures, B = new Builder(), SEA = grid().SEA_Y, low = bk.tier === 'LOW', D = STRUCT.deck;
    var neon = [], halos = [];
    function tok(t) { return tokenRgb(t); }
    function noisy(t, x, z, amp) { return shift(tokenRgb(t), amp * vnoise(x * 4, z * 4, SEED_C1), 0, [0, 0, 0]); }
    /* retaining walls: a Concrete face on the lower pad's outer 0.04 u, a Concrete Light cap, flower spill */
    S.walls.forEach(function (w) {
      B.cellTag = w.cell;
      var len = Math.hypot(w.x1 - w.x0, w.z1 - w.z0), cx = (w.x0 + w.x1) / 2, cz = (w.z0 + w.z1) / 2;
      var alongX = Math.abs(w.x1 - w.x0) > Math.abs(w.z1 - w.z0), yaw = alongX ? 0 : Math.PI / 2;
      var hgt = w.yHigh - w.yLow + 0.03, ext = len + 0.08;
      var face = noisy('Concrete', cx, cz, 0.03), cap = noisy('Concrete Light', cx, cz, 0.03), capSide = shift(cap, -0.08, 0, [0, 0, 0]);
      B.box(cx + w.nx * 0.02, w.yLow - 0.02 + hgt / 2, cz + w.nz * 0.02, ext, hgt, 0.04, yaw, function () { return face; }, { noBottom: true });
      B.box(cx + w.nx * 0.015, w.yHigh + 0.012, cz + w.nz * 0.015, ext, 0.024, 0.075, yaw, function (f) { return f === 'top' ? cap : capSide; }, { noBottom: true });
      /* flower spill over the cap: a clump on the upper side and a drape down the face, both inside
         the cells' 0.07 u margins */
      var nF = low ? 1 : 3;
      for (var f = 0; f < nF; f++) {
        var u = (f + 0.5) / nF - 0.5 + 0.12 * (h01(Math.round(cx * 10) + f, Math.round(cz * 10), SEED_D) - 0.5);
        var fx = cx + (alongX ? u * len : 0) - w.nx * 0.02, fz = cz + (alongX ? 0 : u * len) - w.nz * 0.02;
        var leaf = tok('Leaf Deep'), bloom = tok(['Tulip Pink', 'Cloud White', 'Tulip Yellow'][f % 3]);
        B.prism(fx, w.yHigh, fz, 0.045, w.yHigh + 0.03, 0.035, 5, leaf, { dome: 0.018 });
        B.prism(fx + w.nx * 0.05, w.yHigh - 0.06, fz + w.nz * 0.05, 0.012, w.yHigh + 0.012, 0.018, 4, leaf, { cap: false });
        if (!low) B.prism(fx, w.yHigh + 0.034, fz, 0.016, w.yHigh + 0.044, 0.018, 5, bloom, {});
      }
      /* the LED cap strip (warm at golden hour, member-violet at Showtime) */
      neon.push({ x: cx + w.nx * 0.045, y: w.yHigh + 0.006, z: cz + w.nz * 0.045, yaw: yaw, len: len, r: 0.012, role: 'wallCap' });
    });
    /* boulders */
    S.boulders.forEach(function (b) {
      B.cellTag = b.cell; B.tint = b.tint;
      var base = tok('Cliff Rock'), moss = tok('Hill Moss'), lightR = shift(base, 0.12, 0, [0, 0, 0]);
      B.rock(b.x, b.y, b.z, b.r, b.sx, b.sy, b.sz, b.yaw, b.variant, function (yy, fi) { return yy > 0.55 && (fi % 3 === 0) ? moss : yy > 0.1 ? lightR : base; });
      B.tint = 1;
    });
    /* boardwalk decks */
    S.decks.forEach(function (d) { deckMesh(B, d, neon, halos, low); });
    if (S.plaza) plazaMesh(B, S.plaza, neon, low);
    /* the Lantern Bridge abutment */
    var ab = S.abutment, abLen = ab.z0 - ab.z1, abCz = (ab.z0 + ab.z1) / 2, conc = noisy('Concrete', ab.x, abCz, 0.03);
    B.cellTag = ab.cell;
    B.box(ab.x, (ab.y - 0.03 + SEA - 0.3) / 2, abCz, ab.w, ab.y - 0.03 - (SEA - 0.3), abLen, 0, function (f) { return f === 'top' ? tok('Concrete Light') : conc; }, { noBottom: true });
    planks(B, ab.x, ab.z0, ab.x, ab.z1, ab.y, ab.w - 0.04, 0, low);
    neon.push({ x: ab.x - ab.w / 2 + 0.01, y: ab.y + 0.004, z: abCz, yaw: Math.PI / 2, len: abLen, r: 0.012, role: 'edge' });
    neon.push({ x: ab.x + ab.w / 2 - 0.01, y: ab.y + 0.004, z: abCz, yaw: Math.PI / 2, len: abLen, r: 0.012, role: 'edge' });
    /* Meadow Lookout (P1): a deck on posts at the hill's NW corner, facing the city */
    if (S.lookout) {
      var lo = S.lookout;
      B.cellTag = lo.cell;
      planks(B, lo.x, lo.z - lo.d / 2, lo.x, lo.z + lo.d / 2, lo.y, lo.w, 7, low);
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (q) {
        B.prism(lo.x + q[0] * (lo.w / 2 - 0.05), SEA - 0.3, lo.z + q[1] * (lo.d / 2 - 0.05), D.postR * 1.3, lo.y - D.thick, D.postR * 1.3, low ? 4 : 6, tok('Gunmetal'), { cap: false });
      });
      /* smoked-glass and gunmetal rail on the three open sides */
      [[0, -1, lo.w], [-1, 0, lo.d], [1, 0, lo.d]].forEach(function (s) {
        var rx = lo.x + s[0] * (lo.w / 2 - 0.02), rz = lo.z + s[1] * (lo.d / 2 - 0.02), yaw2 = s[0] ? Math.PI / 2 : 0;
        B.box(rx, lo.y + 0.12, rz, s[2], 0.16, 0.012, yaw2, function () { return tok('Smoked Mid'); }, { noBottom: true });
        B.box(rx, lo.y + 0.205, rz, s[2] + 0.02, 0.018, 0.03, yaw2, function () { return tok('Gunmetal'); }, {});
        neon.push({ x: rx, y: lo.y + 0.216, z: rz, yaw: yaw2, len: s[2], r: 0.01, role: 'edge' });
      });
    }
    B.cellTag = -1;
    /* Lantern Islet: a faceted rock knoll with a sand ring and one palm; the two rock stacks */
    isletMesh(B, S.islet, low);
    S.stacks.forEach(function (st, k) { stackMesh(B, st, k, low); });
    var out = B.out();
    out.neon = neon; out.halos = halos;
    return out;
  }
  /* planks across a straight run a → b, top at y, w wide: Teak / Teak Light ±4%, 1 in 9 offset */
  function planks(B, ax, az, bx, bz, y, w, seedK, low) {
    var D = STRUCT.deck, len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / (low ? D.plank * 2 : D.plank)));
    var ux = (bx - ax) / len, uz = (bz - az) / len, yaw = Math.atan2(-uz, ux) + Math.PI / 2, pitch = len / n, cs = Math.cos(yaw), sn = Math.sin(yaw);
    for (var k = 0; k < n; k++) {
      var hh = hash2(Math.round(ax * 37) + k, Math.round(az * 37) + seedK, SEED_D), u = (k + 0.5) * pitch;
      var off = (hh % 9 === 0) ? 0.03 * (hh & 16 ? 1 : -1) : 0;
      var col = shift(tokenRgb(k % 2 ? 'Teak Light' : 'Teak'), 0.04 * (((hh >>> 8) & 255) / 127.5 - 1), 0, [0, 0, 0]);
      var dark = shift(col, -0.12, 0, [0, 0, 0]);
      B.box(ax + ux * u + cs * off, y - D.thick / 2, az + uz * u - sn * off, w, D.thick, pitch - D.gap, yaw, function (f) { return f === 'top' ? col : dark; }, { noBottom: true });
    }
  }
  function deckMesh(B, d, neon, halos, low) {
    var D = STRUCT.deck, SEA = grid().SEA_Y, pts = d.pts, k;
    B.cellTag = d.cell;
    for (k = 1; k < pts.length; k++) planks(B, pts[k - 1].x, pts[k - 1].z, pts[k].x, pts[k].z, (d.y[k - 1] + d.y[k]) / 2, d.w, k, low);
    /* posts every 0.6 u over water, on both deck edges */
    d.posts.forEach(function (pk) {
      var p = pts[pk], q = pts[Math.min(pk + 1, pts.length - 1)], r0 = pts[Math.max(pk - 1, 0)];
      var tx = q.x - r0.x, tz = q.z - r0.z, tl = Math.hypot(tx, tz) || 1, nx = -tz / tl, nz = tx / tl;
      for (var s = -1; s <= 1; s += 2) {
        B.prism(p.x + nx * s * (d.w / 2 - 0.03), SEA - 0.3, p.z + nz * s * (d.w / 2 - 0.03), D.postR, d.y[pk] - D.thick, D.postR, low ? 4 : 6, tokenRgb('Gunmetal'), { cap: false });
      }
    });
    /* the LED edge strip(s): off by day, Holo Blue at dusk, the member colour at Showtime;
       Sunset Amber bollards on every 2nd span of the promenade */
    var segLen = low ? 2 : 1, accB = 0, nextB = d.bollardEvery ? d.bollardEvery / 2 : Infinity;
    for (k = segLen; k < pts.length; k += segLen) {
      var p0 = pts[k - segLen], p1 = pts[k], yy = Math.max(d.y[k - segLen], d.y[k]) + 0.004;
      var dx = p1.x - p0.x, dz = p1.z - p0.z, l = Math.hypot(dx, dz) || 1, nnx = -dz / l, nnz = dx / l, yaw = Math.atan2(-dz, dx);
      for (var side = d.edge === 'both' ? -1 : 1; side <= 1; side += 2) {
        neon.push({ x: (p0.x + p1.x) / 2 + nnx * side * (d.w / 2 - 0.012), y: yy, z: (p0.z + p1.z) / 2 + nnz * side * (d.w / 2 - 0.012), yaw: yaw, len: l, r: 0.012, role: 'edge' });
      }
      accB += l;
      if (accB >= nextB) {
        nextB += d.bollardEvery;
        var bx = p1.x + nnx * (d.w / 2 + 0.06), bz = p1.z + nnz * (d.w / 2 + 0.06), by = d.y[k];
        B.prism(bx, by - D.thick, bz, 0.03, by + 0.11, 0.026, low ? 5 : 6, tokenRgb('Gunmetal'), {});
        neon.push({ x: bx, y: by + 0.12, z: bz, yaw: 0, len: 0.05, r: 0.05, role: 'bollard' });
        halos.push({ x: bx, y: by + 0.14, z: bz, size: 0.42, token: 'Sunset Amber', role: 'bollard' });
      }
    }
    if (d.lamp) {
      var e = pts[0], ey = d.y[0];
      B.prism(e.x, ey - D.thick, e.z, 0.022, ey + 0.475, 0.018, low ? 5 : 6, tokenRgb('Gunmetal'), {});
      B.box(e.x, ey + 0.49, e.z, 0.09, 0.05, 0.09, 0, function () { return tokenRgb('Graphite'); }, {});
      neon.push({ x: e.x, y: ey + 0.455, z: e.z, yaw: 0, len: 0.07, r: 0.05, role: 'lamp' });
      halos.push({ x: e.x, y: ey + 0.45, z: e.z, size: 0.6, token: 'Sunset Amber', role: 'lamp' });
    }
    B.cellTag = -1;
  }
  /* the small LED plaza where the promenade beach is widest: paving + a grid of LED tiles */
  function plazaMesh(B, P, neon, low) {
    B.cellTag = P.cell;
    var pave = tokenRgb('Concrete Light'), rim = tokenRgb('Concrete');
    B.box(P.x, P.y - 0.03, P.z, P.len, 0.06, P.depth, 0, function (f) { return f === 'top' ? pave : rim; }, { noBottom: true });
    var nx = low ? 3 : 4, nz = 2;
    for (var i = 0; i < nx; i++) for (var j = 0; j < nz; j++) {
      neon.push({ x: P.x + ((i + 0.5) / nx - 0.5) * (P.len - 0.24), y: P.y + 0.003, z: P.z + ((j + 0.5) / nz - 0.5) * (P.depth - 0.2),
                  yaw: 0, len: 0.15, r: 0.006, w: 0.15, role: 'plaza', i: i, j: j });
    }
    B.cellTag = -1;
  }
  function isletMesh(B, I, low) {
    var SEA = grid().SEA_Y, sides = low ? 7 : 9, rings = [
      { y: SEA - 0.12, r: I.r * 1.08 }, { y: SEA + 0.03, r: I.r * 0.98 }, { y: SEA + I.h * 0.45, r: I.r * 0.72 },
      { y: SEA + I.h * 0.85, r: I.r * 0.38 }, { y: SEA + I.h, r: I.r * 0.12 }
    ];
    var pts = rings.map(function (rg, ri) {
      var out = [];
      for (var k = 0; k < sides; k++) {
        var a = (k + 0.37 * ri) / sides * TAU, j = 1 + 0.16 * (h01(k, ri, 0x15e7) - 0.5) * (ri > 0 && ri < rings.length - 1 ? 1 : 0.3);
        out.push([I.x + Math.cos(a) * rg.r * j, rg.y, I.z + Math.sin(a) * rg.r * j]);
      }
      return out;
    });
    var cols = [tokenRgb('Wet Dune'), tokenRgb('Dune'), tokenRgb('Cliff Rock'), tokenRgb('Hill Moss')];
    for (var ri = 0; ri < rings.length - 1; ri++) {
      for (var k = 0; k < sides; k++) {
        var a = pts[ri][k], b = pts[ri][(k + 1) % sides], c = pts[ri + 1][(k + 1) % sides], d = pts[ri + 1][k];
        var col = ri === 0 ? cols[0] : ri === 1 ? cols[1] : ri === 2 ? (k % 3 === 0 ? cols[3] : cols[2]) : cols[3];
        B.ftri(a, d, c, col); B.ftri(a, c, b, ri === 2 && k % 2 ? shift(col, 0.1, 0, _sh) : col);
      }
    }
    /* one palm: a leaning trunk of tapered segments and drooping fronds */
    var px = I.x + 0.08, pz = I.z - 0.05, py = SEA + I.h * 0.92, segs = low ? 3 : 5, lean = [0.05, -0.04], top = null;
    for (var sgi = 0; sgi < segs; sgi++) {
      var u0 = sgi / segs, u1 = (sgi + 1) / segs;
      var ox0 = lean[0] * u0 * u0 * 6, oz0 = lean[1] * u0 * u0 * 6, ox1 = lean[0] * u1 * u1 * 6, oz1 = lean[1] * u1 * u1 * 6;
      B.prism(px + ox0, py + u0, pz + oz0, 0.045 - 0.012 * u0, py + u1, 0.045 - 0.012 * u1, low ? 4 : 5, tokenRgb(sgi % 2 ? 'Palm Bark Dark' : 'Palm Bark'), { cap: false, lean: [ox1 - ox0, oz1 - oz0] });
      top = [px + ox1, py + u1, pz + oz1];
    }
    var nf = low ? 5 : 6;
    for (var f = 0; f < nf; f++) {
      var ang = f / nf * TAU + 0.3, cx2 = Math.cos(ang), cz2 = Math.sin(ang), fc = tokenRgb(['Frond', 'Frond Shade', 'Frond Light', 'Frond Deep'][f % 4]);
      var mid = [top[0] + cx2 * 0.22, top[1] + 0.05, top[2] + cz2 * 0.22], tip = [top[0] + cx2 * 0.42, top[1] - 0.14, top[2] + cz2 * 0.42];
      var m1 = [mid[0] - cz2 * 0.07, mid[1], mid[2] + cx2 * 0.07], m2 = [mid[0] + cz2 * 0.07, mid[1], mid[2] - cx2 * 0.07];
      B.ftri(top, m2, m1, fc); B.ftri(top, m1, m2, fc);
      B.ftri(m1, m2, tip, fc); B.ftri(m1, tip, m2, fc);
    }
  }
  function stackMesh(B, st, k, low) {
    var SEA = grid().SEA_Y, sides = low ? 5 : 7, n = 3;
    function colFor(ri) { return function (part, si) { return part === 'top' ? tokenRgb('Hill Moss') : shift(tokenRgb('Cliff Rock'), ((si + ri + k) % 3 - 1) * 0.07, 0, _sh); }; }
    function jit(ri) { return function (s2, e) { return 0.14 * (h01(s2, ri * 2 + e + 10 * k, 0x5ac) - 0.5); }; }
    for (var ri = 0; ri < n; ri++) {
      var y0 = SEA - 0.2 + (st.h + 0.2) * ri / n, y1 = SEA - 0.2 + (st.h + 0.2) * (ri + 1) / n;
      var r0 = st.r * (1 - 0.18 * ri / n), r1 = st.r * (1 - 0.18 * (ri + 1) / n) * (ri === n - 1 ? 0.8 : 1);
      B.prism(st.x, y0, st.z, r0, y1, r1, sides, colFor(ri), { cap: ri === n - 1, dome: 0.04, phase: 0.4 * ri + k, jitter: jit(ri) });
    }
  }

  /* ================================================================
     GROUND DRESSING: world-space blue-noise points (never per cell)
     ================================================================ */
  var DRESS = { r: 0.32, sandR: 0.45, kinds: ['tuft', 'clover', 'flowers', 'beachGrass', 'shell', 'starfish', 'pebble', 'moss'] };
  /* tris per piece kind (LOW / MID+) — the builders below emit exactly these */
  var DRESS_TRIS = {
    LOW: { tuft: 6, clover: 8, flowers: 20, beachGrass: 9, shell: 5, starfish: 10, pebble: 8, moss: 5 },
    MID: { tuft: 9, clover: 12, flowers: 32, beachGrass: 12, shell: 5, starfish: 10, pebble: 8, moss: 5 }
  };
  /* one jittered point per 0.32 u world cell, rejected when too close to an earlier neighbour:
     land-independent, so an unlock never re-rolls the dressing that was already there */
  function dressPoints(bk) {
    var g = DRESS.r, out = [];
    var ix0 = Math.floor(DOMAIN.x0 / g), ix1 = Math.ceil(DOMAIN.x1 / g), iz0 = Math.floor(DOMAIN.z0 / g), iz1 = Math.ceil(DOMAIN.z1 / g);
    var W = ix1 - ix0 + 1, acc = new Float32Array(W * (iz1 - iz0 + 1) * 2).fill(NaN), sandKeep = 255 * (DRESS.r * DRESS.r) / (DRESS.sandR * DRESS.sandR);
    for (var iz = iz0; iz <= iz1; iz++) {
      for (var ix = ix0; ix <= ix1; ix++) {
        var h = hash2(ix, iz, SEED_D), x = (ix + 0.1 + 0.8 * (h & 1023) / 1023) * g, z = (iz + 0.1 + 0.8 * ((h >>> 10) & 1023) / 1023) * g;
        var ok = true;
        for (var dz = -1; dz <= 0 && ok; dz++) for (var dx = -1; dx <= 1; dx++) {
          if (dz === 0 && dx >= 0) break;
          var q = ((iz + dz - iz0) * W + (ix + dx - ix0)) * 2;
          if (q < 0 || isNaN(acc[q])) continue;
          if ((acc[q] - x) * (acc[q] - x) + (acc[q + 1] - z) * (acc[q + 1] - z) < g * g * 0.7) { ok = false; break; }
        }
        if (!ok) continue;
        var qi = ((iz - iz0) * W + (ix - ix0)) * 2;
        acc[qi] = x; acc[qi + 1] = z;
        if (!inDomain(x, z)) continue;
        var s = sampleGrid(bk.sm, bk.sm.s, x, z);
        if (s > -0.03) continue;
        var zone = zoneAt(bk, x, z);
        if ((zone === ZONES.sand || zone === ZONES.sandPad || zone === ZONES.wet) && ((h >>> 20) & 255) > sandKeep) continue;
        out.push({ x: x, z: z, h: h, zone: zone, s: s });
      }
    }
    return out;
  }
  /* the dressing for a layout: drifts by noise, content by zone, occupied cells' 0.86 interiors and
     path cells left clear (tufts may sit in margins), capped at the tier's triangle budget */
  function scatter(bk, placed) {
    var C = core(), Gr = grid(), tris = 0, pieces = [], tierT = DRESS_TRIS[bk.tier === 'LOW' ? 'LOW' : 'MID'];
    var budget = BUDGET[bk.tier].dressing, occObj = {}, occPath = {}, rects = [];
    (placed || []).forEach(function (p) {
      var it = C.item(p.id);
      if (!it || !C.isPlaceable(it)) return;
      var fp = it.fp || [1, 1];
      C.fpCells(it, p.x, p.y).forEach(function (k) { if (it.kind === 'path') occPath[k] = 1; else occObj[k] = 1; });
      if (it.kind !== 'path') rects.push({ x0: p.x - 8 + Gr.MARGIN, z0: p.y - 5 + Gr.MARGIN, x1: p.x + fp[0] - 8 - Gr.MARGIN, z1: p.y + fp[1] - 5 - Gr.MARGIN });
    });
    var foot = bk.structures.footprints;
    /* a fixed hashed order (cached per bake), so the triangle cap thins the dressing evenly */
    var order = bk._order || (bk._order = bk.points.slice().sort(function (a, b) { return (a.h % 9973) - (b.h % 9973) || a.h - b.h; }));
    for (var k = 0; k < order.length; k++) {
      var p = order[k], x = p.x, z = p.z, key = Math.floor(x + 8) + ',' + Math.floor(z + 5), f, inside = false;
      if (occPath[key]) continue;
      for (f = 0; f < rects.length && !inside; f++) if (x > rects[f].x0 && x < rects[f].x1 && z > rects[f].z0 && z < rects[f].z1) inside = true;
      for (f = 0; f < foot.length && !inside; f++) if (x > foot[f].x0 && x < foot[f].x1 && z > foot[f].z0 && z < foot[f].z1) inside = true;
      if (inside) continue;
      var margin = !!occObj[key], hh = p.h, kind = null;
      var drift = vnoise(x / 1.6 + 3.7, z / 1.6 - 1.9, SEED_D), fine = vnoise(x / 0.55, z / 0.55, SEED_C2);
      var region = (x >= -8 && x < 8 && z >= -5 && z < 5) ? bk.lg[Math.floor(x + 8) + 16 * Math.floor(z + 5)] : 0;
      if (p.zone === ZONES.pad || p.zone === ZONES.grass) {
        if (drift < -0.25) continue;
        if (margin) kind = 'tuft';
        else if (p.zone === ZONES.grass && p.s > -0.12) kind = 'beachGrass';
        else if (fine > 0.42 && drift > 0.1) kind = region === 3 || (hh & 7) === 0 ? 'flowers' : 'clover';
        else if (fine < -0.45) kind = 'clover';
        else kind = 'tuft';
        if (kind === 'flowers' && region !== 3 && drift < 0.35) kind = 'tuft';
      } else if (p.zone === ZONES.sand || p.zone === ZONES.sandPad) {
        if (margin) continue;
        var d0 = landDist(bk, x, z), t = d0 > 0 ? d0 / (d0 - p.s) : 1;
        if (p.zone === ZONES.sand && t < 0.4) kind = drift > -0.2 ? 'beachGrass' : null;
        else kind = drift > 0.2 ? ((hh >>> 3) & 1 ? 'shell' : 'starfish') : (p.zone === ZONES.sandPad && drift < -0.4 ? 'beachGrass' : null);
      } else if (p.zone === ZONES.rock) kind = (hh >>> 5) & 1 ? 'pebble' : 'moss';
      if (!kind) continue;
      var cost = tierT[kind];
      if (tris + cost > budget) continue;
      tris += cost;
      pieces.push({
        kind: kind, x: x, y: heightAt(bk, x, z) - 0.004, z: z, yaw: ((hh >>> 7) & 1023) / 1023 * TAU,
        s: 0.7 + 0.55 * ((hh >>> 17) & 255) / 255, tint: 1 + 0.06 * (((hh >>> 25) & 127) / 63.5 - 1), seed: hh, region: region
      });
    }
    return { pieces: pieces, tris: tris };
  }
  var FLOWERS = ['Cloud White', 'Tulip Yellow', 'Tulip Pink', 'Rose Pale'];
  function dressingArrays(bk, placed) {
    var sc = scatter(bk, placed), B = new Builder(), low = bk.tier === 'LOW';
    sc.pieces.forEach(function (p) {
      B.tint = p.tint;
      var cs = Math.cos(p.yaw), sn = Math.sin(p.yaw), s = p.s, X = p.x, Y = p.y, Z = p.z;
      function P(lx, ly, lz) { return [X + (lx * cs + lz * sn) * s, Y + ly * s, Z + (-lx * sn + lz * cs) * s]; }
      /* a blade: 3 thin triangles (front, back sliver, shade) */
      function blade(ang, lean, h, w, colTok) {
        var bx = Math.cos(ang), bz = Math.sin(ang), px = -bz * w, pz = bx * w;
        var b0 = P(px, 0, pz), b1 = P(-px, 0, -pz), tip = P(bx * lean, h, bz * lean), c = tokenRgb(colTok);
        B.ftri(b0, b1, tip, c);
        B.ftri(P(px * 0.6 + bx * 0.012, 0, pz * 0.6 + bz * 0.012), tip, P(-px * 0.6 + bx * 0.012, 0, -pz * 0.6 + bz * 0.012), shift(c, 0.14, 0, _sh));
        B.ftri(b0, tip, P(bx * 0.015, 0, bz * 0.015), shift(c, -0.08, 0, _sh));
      }
      /* a flat disc of `sides` triangles */
      function disc(cx, cy, cz, r, sides, col) {
        var ctr = P(cx, cy + 0.006, cz), prev = P(cx + r, cy, cz);
        for (var k = 1; k <= sides; k++) {
          var a = k / sides * TAU, q = P(cx + Math.cos(a) * r, cy, cz + Math.sin(a) * r);
          B.ftri(ctr, q, prev, col);
          prev = q;
        }
      }
      var k, a;
      switch (p.kind) {
        case 'tuft': {
          var nb = low ? 2 : 3, tufTok = p.region === 3 ? 'Leaf Lit' : 'Leaf Deep';
          for (k = 0; k < nb; k++) blade(k / nb * TAU + 0.4, 0.035, 0.12 + 0.03 * (k % 2), 0.018, k === 1 ? tufTok : 'Turf Shade');
          break;
        }
        case 'clover':
          for (k = 0; k < (low ? 2 : 3); k++) { a = k / 3 * TAU; disc(Math.cos(a) * 0.035, 0.008, Math.sin(a) * 0.035, 0.032, 4, tokenRgb(k % 2 ? 'Leaf Lit' : 'Turf Shade')); }
          break;
        case 'flowers':
          for (k = 0; k < (low ? 5 : 8); k++) {
            var fh = hash2(p.seed & 0xffff, k, 0xf10), rr = 0.05 + 0.11 * (fh & 255) / 255;
            a = k * 2.39996 + ((fh >>> 8) & 255) / 255;
            disc(Math.cos(a) * rr, 0.035 + 0.02 * ((fh >>> 16) & 3) / 3, Math.sin(a) * rr, 0.022, 4, tokenRgb(FLOWERS[(fh >>> 20) % FLOWERS.length]));
          }
          break;
        case 'beachGrass':
          for (k = 0; k < 3; k++) blade(k / 3 * TAU + 1.1, 0.06, 0.2 + 0.05 * k, 0.012, k === 1 ? 'Straw' : 'Turf Shade');
          if (!low) blade(0.5, -0.05, 0.16, 0.012, 'Leaf Lit');
          break;
        case 'shell': {
          var shc = tokenRgb('Blossom Light'), hinge = P(0, 0.002, -0.025), prevS = P(Math.cos(0.15 * Math.PI) * 0.05, 0.012, -0.025 + Math.sin(0.15 * Math.PI) * 0.05);
          for (k = 1; k <= 5; k++) {
            var as = Math.PI * (0.15 + 0.7 * k / 5), q2 = P(Math.cos(as) * 0.05, 0.012 + (k % 2) * 0.006, -0.025 + Math.sin(as) * 0.05);
            B.ftri(hinge, q2, prevS, k % 2 ? shc : shift(shc, -0.06, 0, _sh));
            prevS = q2;
          }
          break;
        }
        case 'starfish': {
          var sfc = tokenRgb('Peach Coral'), ctr = P(0, 0.018, 0), pts = [];
          for (k = 0; k < 10; k++) { a = k / 10 * TAU; var r3 = k % 2 ? 0.026 : 0.07; pts.push(P(Math.cos(a) * r3, 0.004, Math.sin(a) * r3)); }
          for (k = 0; k < 10; k++) B.ftri(ctr, pts[(k + 1) % 10], pts[k], k % 2 ? sfc : shift(sfc, 0.08, 0, _sh));
          break;
        }
        case 'pebble': {
          var pc = shift(tokenRgb(p.seed & 1 ? 'Concrete' : 'Cliff Rock'), 0.08, 0, [0, 0, 0]), pd = shift(pc, -0.1, 0, [0, 0, 0]);
          var top = P(0, 0.035, 0), bot = P(0, -0.01, 0), ring = [];
          for (k = 0; k < 4; k++) { a = k / 4 * TAU; ring.push(P(Math.cos(a) * 0.05, 0.012, Math.sin(a) * 0.036)); }
          for (k = 0; k < 4; k++) { B.ftri(top, ring[(k + 1) % 4], ring[k], pc); B.ftri(bot, ring[k], ring[(k + 1) % 4], pd); }
          break;
        }
        case 'moss': disc(0, 0.004, 0, 0.07, 5, tokenRgb('Hill Moss')); break;
      }
      B.tint = 1;
    });
    var out = B.out();
    out.pieces = sc.pieces.length;
    return out;
  }

  /* ================================================================
     ARRAY UTILITIES
     ================================================================ */
  /* concatenate array meshes (indexed or not) into one indexed mesh */
  function mergeArrays(list) {
    var nv = 0, ni = 0;
    list = list.filter(function (a) { return a && a.position && a.position.length; });
    list.forEach(function (a) { nv += a.position.length / 3; ni += a.index ? a.index.length : a.position.length / 3; });
    var P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), Cc = new Float32Array(nv * 3), I = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
    var cell = new Int16Array(ni / 3), vo = 0, io = 0;
    list.forEach(function (a) {
      var n = a.position.length / 3, k, tc = a.index ? a.index.length / 3 : n / 3;
      P.set(a.position, vo * 3); N.set(a.normal, vo * 3); Cc.set(a.color, vo * 3);
      if (a.index) for (k = 0; k < a.index.length; k++) I[io + k] = a.index[k] + vo;
      else for (k = 0; k < n; k++) I[io + k] = vo + k;
      for (k = 0; k < tc; k++) cell[io / 3 + k] = a.cell ? a.cell[k] : -1;
      vo += n; io += tc * 3;
    });
    return { position: P, normal: N, color: Cc, index: I, cell: cell, tris: ni / 3, verts: nv };
  }
  /* the unlock rise: copy the triangles whose cell is in bandOfCell ({cellId: band}) into n
     non-indexed band meshes (band = rise-order slice); everything else stays out */
  function sliceBands(arr, bandOfCell, n) {
    var lists = [], k;
    for (k = 0; k < n; k++) lists.push([]);
    var idx = arr.index, tc = idx ? idx.length / 3 : arr.position.length / 9;
    for (var t = 0; t < tc; t++) {
      var b = arr.cell ? bandOfCell[arr.cell[t]] : null;
      if (b == null) continue;
      lists[Math.min(n - 1, Math.max(0, b))].push(t);
    }
    return lists.map(function (tris) {
      var P = new Float32Array(tris.length * 9), N = new Float32Array(tris.length * 9), Cc = new Float32Array(tris.length * 9);
      tris.forEach(function (t, q) {
        for (var v = 0; v < 3; v++) {
          var src = idx ? idx[t * 3 + v] : t * 3 + v, o = (q * 3 + v) * 3;
          P[o] = arr.position[src * 3]; P[o + 1] = arr.position[src * 3 + 1]; P[o + 2] = arr.position[src * 3 + 2];
          N[o] = arr.normal[src * 3]; N[o + 1] = arr.normal[src * 3 + 1]; N[o + 2] = arr.normal[src * 3 + 2];
          Cc[o] = arr.color[src * 3]; Cc[o + 1] = arr.color[src * 3 + 1]; Cc[o + 2] = arr.color[src * 3 + 2];
        }
      });
      return { position: P, normal: N, color: Cc, index: null, cell: null, tris: tris.length, verts: tris.length * 3 };
    });
  }

  return {
    VERSION: VERSION, DOMAIN: DOMAIN, SPACING: SPACING, SM_RES: SM_RES, COAST: COAST, PROFILE: PROFILE, FIELD: FIELD,
    BUDGET: BUDGET, EXCLUDE: EXCLUDE, STRUCT: STRUCT, QUAY: QUAY, ZONES: ZONES, DRESS: DRESS, DRESS_TRIS: DRESS_TRIS,
    bake: bake, meshArrays: meshArrays, sceneryArrays: sceneryArrays, scatter: scatter, dressingArrays: dressingArrays,
    mergeArrays: mergeArrays, sliceBands: sliceBands, heightAt: heightAt, zoneAt: zoneAt, coastAt: coastAt, landDist: landDist,
    nearestCell: nearestCell, landSig: landSig, landSetOf: landSetOf, seedOffset: seedOffset, regionDist: regionDist, quayDist: quayDist, otherShoreDist: otherShoreDist,
    /* internals exposed for tests */
    _edt2d: edt2d, _gauss: gauss, _vnoise: vnoise, _turfRgb: turfRgb, _cellY: cellY, _s2l: s2l
  };
}));
