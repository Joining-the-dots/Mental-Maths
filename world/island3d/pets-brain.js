/* ================================================================
   My Island 3D — the pets' brain (island chunk 9; pure: no DOM, no THREE).
   window.SLPetBrain in the browser, module.exports in Node.
   Decides WHERE the pets go and WHAT they are doing; actors.js turns
   that into rig poses. Everything is deterministic per seed: one seeded
   RNG, a fixed-step friendly clock (step(dt) adds dt), no Math.random.

   Rules come only from SLWorldCore (landSet / occupancy / item / fpCells /
   entranceCells); heights from SLGrid3D.surfaceY when present.
     free cells   unlocked land minus 'object'-layer occupancy and the
                  avatar's cell. Paths and entrance cells are walkable.
                  Only the trampoline and bench behaviours ever put a pet
                  on an occupied cell (on the item's seat).
     planning     A* over 8 neighbours with no corner cutting, line-of-
                  sight pruning with a 0.2 u clearance, Catmull-Rom through
                  the (re-densified) cell centres; every smoothed path is
                  validated cell by cell (falls back to the polyline).
     walking      0.9 u/s, turn rate 6 rad/s, accel 3 u/s²; slows to turn in
                  place; waits ≤ 0.8 s for a pet in front, then re-plans.
     reservations every pet holds exactly ONE reserved cell — its target
                  while walking, its own cell otherwise — so no two pets ever
                  pick the same spot or stand on each other.
     sync         re-plans any pet whose cell / path / target became blocked;
                  a pet on a blocked cell, or enclosed in a 1-cell pocket while
                  a bigger area exists, pops (event 'pop') to the nearest free
                  cell; new pets 'spawn' near the house.
     idle         an idle action every 4–8 s (start to start; the action is
                  sized to fit its gap): wander, sit, sniff, look at the camera,
                  look at the avatar, scratch, roll over, nap, play (puppy tail
                  chase · kitten pounce · bunny binky · dragon loop), visit an
                  item (sniff flowers, watch fun items) or sit on a bench
                  (×4 likelier at Showtime). Reduced motion: turn and emote only.
     perform      'trampoline': the active pet runs over (lead ≤ 1.2 s, a sparkle
                  zip when too far), hops on, bounces SLMotion's 3 bounces with
                  the front flip, hops off. 'bench': walks over, hops up, sits,
                  hops down. Returns the lead seconds (-1 = no pet).
     dance        pets gather (≤ 2 s) on open cells in front of the house, the
                  8-count at 118 BPM (≈ 4.07 s) starts on the next bar (when a
                  beat clock is given), then the group pose; reduced = one group
                  pose. danceAt(t) is the shared timeline.
     glance       the avatar glances at a pet every 5–7 s (glanceAt).

   API
     SLPetBrain.create({seed, reduced, C, G}) → brain
       .sync({world | land/occ/placed, pets: [{id, active, name?, acc?}], avatar: {c, r} | null,
              mode: 'play'|'edit'|'place'}) → {added: [id], removed: [id], popped: [id]}
       .step(dt) → animating      advance the clock and every pet (no allocation in steady state)
       .pets                      stable pet state objects (fields documented at newPet)
       .pet(id) · .activeId() · .now · .graph · .camYaw (set by actors: yaw that faces the camera)
       .tap(id) → emote kind | ''  hop pause + happy tail; emote chosen by the seeded RNG
       .perform(kind, uid, petId?) → lead seconds | -1
       .dance(on, {beat, bpm}) → seconds until the dance break is over (0 = none)
       .danceT0 · .danceOn · .danceEnd
       .setMode(mode) · .setReduced(on) · .setShow(k)
       .events                    [{type: 'pop'|'spawn'|'emote'|'land'|'sparkle'|'cheer', id, …}] — the
                                  reader empties it (events are rare; they may allocate)
     Pure helpers (tests / actors): buildGraph, astar, distMap, smoothPath, pathValid, samplePath,
       heightAt, nearestFree, danceSpots, danceAt, alignDelay, glanceAt, bounceAt, makeRng, hash,
       cellIndex, cellOf, centreX, centreZ, WALK, IDLE, HOP, SEAT, BOUNCE, DANCE, GLANCE, ACTIONS
   ================================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    var C = null, G = null;
    try { C = require('../world-core.js'); } catch (e) { C = null; }
    try { G = require('./grid3d.js'); } catch (e) { G = null; }
    module.exports = factory(root, C, G);
  } else root.SLPetBrain = factory(root, null, null);
}(typeof self !== 'undefined' ? self : typeof globalThis !== 'undefined' ? globalThis : this, function (root, C0, G0) {
  'use strict';

  var VERSION = 1;
  var COLS = 16, ROWS = 10, NCELL = COLS * ROWS;
  var PI = Math.PI, TAU = PI * 2, SQRT2 = Math.SQRT2;

  /* lazy lookups so script order never matters in the browser */
  function core(opt) { return opt || C0 || (root && root.SLWorldCore) || null; }
  function grid(opt) { return opt || G0 || (root && root.SLGrid3D) || null; }

  /* ---------------- tuning (art bible + architecture 'animation') ---------------- */
  var WALK = {
    speed: 0.9, turn: 6, accel: 3, run: 3, zip: 5.5, runAccel: 14,
    near: 0.45, wait: 0.8, look: 0.18, clearance: 0.2, startFree: 0.3, step: 0.05, sub: 4
  };
  var IDLE = { min: 4, max: 8, first: 0.6, stagger: 0.9, slack: 0.6, turnPad: 0.5 };
  var HOP = { on: 0.32, off: 0.4, h: 0.22, benchOn: 0.36 };
  /* seats (item space, from the models): trampoline mat top (T.y - T.depth), bench 'seat' anchor */
  var SEAT = { trampoline: { y: 0.374, z: 0, face: null }, bench: { y: 0.31, z: 0.03, face: 0 } };
  /* the trampoline bounce — the same numbers as SLMotion.BOUNCE (checked by the tests) */
  var BOUNCE = { g: 24, contact: 0.075, heights: [0.5, 0.75, 1.0], dip: 0.12, maxLead: 1.2, minLead: 0.45 };
  BOUNCE.flights = BOUNCE.heights.map(function (h) { return 2 * Math.sqrt(2 * h / BOUNCE.g); });
  BOUNCE.length = 4 * BOUNCE.contact + BOUNCE.flights.reduce(function (a, b) { return a + b; }, 0);
  var DANCE = {
    bpm: 118, counts: 8, beat: 60 / 118, dur: 8 * 60 / 118, gatherMax: 2, hold: 0.6, reducedDur: 2.2,
    /* counts 1–2 side-steps · 3–4 hops · 5–6 signature · 7 face the camera · 8 group pose */
    moves: ['side', 'side', 'hop', 'hop', 'signature', 'signature', 'face', 'pose'],
    cues: [{ count: 5, emit: 'puff', who: 'pet_dragon' }, { count: 8, emit: 'burst', heart: true }, { count: 9, sfx: 'cheer' }]
  };
  var GLANCE = { min: 5, max: 7, dur: 1.6, ease: 0.3 };

  /* in-place actions: duration range (s); kinds the actors know how to pose */
  var ACTIONS = {
    sit: { dur: [2.5, 4] }, sniff: { dur: [1.6, 2.4] }, look: { dur: [1.6, 2.4] }, lookAvatar: { dur: [1.6, 2.4] },
    scratch: { dur: [1.6, 2.2] }, roll: { dur: [1.4, 1.4] }, nap: { dur: [3.2, 7.2] },
    chase: { dur: [1.6, 1.6] }, pounce: { dur: [1.0, 1.0] }, binky: { dur: [0.9, 0.9] }, loop: { dur: [1.4, 1.4] },
    turn: { dur: [1.2, 1.6] }, emote: { dur: [1.2, 1.6] }
  };
  var PLAY = { pet_puppy: 'chase', pet_kitten: 'pounce', pet_bunny: 'binky', pet_dragon: 'loop' };
  var POUNCE_DIST = 0.35;
  /* idle choice weights (base); species tweaks below */
  var WEIGHTS = { wander: 4, sit: 1.2, sniff: 1.1, look: 1, lookAvatar: 1, scratch: 0.7, roll: 0.6, nap: 0.35, play: 1, visit: 1.3, bench: 0.8 };
  var SPECIES_W = {
    pet_puppy: { play: 1.3, roll: 0.9 }, pet_kitten: { play: 1.6, nap: 0.6, scratch: 0.9 },
    pet_bunny: { sniff: 1.6, roll: 0.3 }, pet_dragon: { play: 1.2, scratch: 0.3, roll: 0.3 }
  };
  var REDUCED_W = { look: 1.2, lookAvatar: 1, turn: 1.4, emote: 0.8 };
  var EMOTES = ['heart', 'note', 'star'];
  /* what a visit does at each kind of item */
  var SNIFF_IDS = /^(flower_|bush_|tree_|rock_|mushroom_)/;
  var WATCH_IDS = { trampoline: 1, fountain: 1, swing: 1, bubbles: 1, windmill: 1, sandcastle: 1, snowman: 1, lighthouse: 1, att_course: 1, att_pitch: 1, att_kart: 1 };

  /* ---------------- maths ---------------- */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function frac(v) { return v - Math.floor(v); }
  function wrap(a) { a = (a + PI) % TAU; if (a < 0) a += TAU; return a - PI; }
  function smooth01(u) { u = clamp01(u); return u * u * (3 - 2 * u); }
  function arc(u) { u = clamp01(u); return 4 * u * (1 - u); }
  /* FNV-1a, the same hash as SLMotion / SLGrid3D */
  function hash(s) {
    s = String(s);
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
  }
  /* mulberry32: small, fast, good enough for kid-pet choices */
  function makeRng(seed) {
    var s = (typeof seed === 'number' && isFinite(seed) ? seed : hash(seed == null ? 'pets' : seed)) >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function mix01(seed, n) {
    var h = (seed ^ Math.imul(n | 0, 0x9E3779B1)) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x85EBCA6B) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  /* ---------------- cells ---------------- */
  function cellIndex(c, r) { return c >= 0 && c < COLS && r >= 0 && r < ROWS ? r * COLS + c : -1; }
  function cellOf(x, z) { return cellIndex(Math.floor(x + COLS / 2), Math.floor(z + ROWS / 2)); }
  function colOf(i) { return i % COLS; }
  function rowOf(i) { return (i - i % COLS) / COLS; }
  function centreX(i) { return colOf(i) - 7.5; }
  function centreZ(i) { return rowOf(i) - 4.5; }
  function keyOf(i) { return colOf(i) + ',' + rowOf(i); }
  function parseKey(k) { var p = String(k).split(','); return cellIndex(+p[0], +p[1]); }
  var NB_DC = [1, -1, 0, 0, 1, 1, -1, -1], NB_DR = [0, 0, 1, -1, 1, -1, 1, -1];

  /* terrace heights: SLGrid3D.surfaceY, else the same rule from the region table */
  var TERRACE = [0.45, 0.35, 0.25, 0.15];
  function surfaceAt(c, r, Cx, Gx) {
    var G = grid(Gx);
    if (G && typeof G.surfaceY === 'function') { try { return +G.surfaceY(c, r) || 0; } catch (e) { /* fall through */ } }
    var Cc = core(Cx), reg = Cc && Cc.CELL_REGION ? Cc.CELL_REGION[c + ',' + r] : null;
    return reg === 'meadow' ? TERRACE[Math.min(c, TERRACE.length - 1)] : 0;
  }

  /* ================================================================
     THE FREE-CELL GRAPH
     src: a SLWorldCore world {owned, placed} | a view {placed, unlocked} |
          {land: {'c,r': 1}, occ: {'c,r': {uid, id, layer}}, placed}
     opts: {avatar: {c, r} | cell index | null, C, G}
     ================================================================ */
  function landOf(src, Cc) {
    if (src && src.land && typeof src.land === 'object') return src.land;
    if (src && src.owned && Array.isArray(src.placed) && Cc && typeof Cc.landSet === 'function') return Cc.landSet(src);
    var regions = src && Array.isArray(src.unlocked) ? src.unlocked : ['home'], out = {};
    regions.forEach(function (k) { ((Cc && Cc.REGION_CELLS && Cc.REGION_CELLS[k]) || []).forEach(function (c) { out[c] = 1; }); });
    return out;
  }
  function itemOf(Cc, id) { return Cc && typeof Cc.item === 'function' ? Cc.item(id) : null; }
  function occOf(src, Cc) {
    if (src && src.occ && typeof src.occ === 'object') return src.occ;
    var placed = src && Array.isArray(src.placed) ? src.placed : [];
    if (Cc && typeof Cc.occupancy === 'function') return Cc.occupancy({ placed: placed }).occ;
    var occ = {};
    placed.forEach(function (p) {
      var it = itemOf(Cc, p.id), fp = (it && it.fp) || [1, 1];
      for (var dy = 0; dy < fp[1]; dy++) for (var dx = 0; dx < fp[0]; dx++) occ[(p.x + dx) + ',' + (p.y + dy)] = { uid: p.uid, id: p.id, layer: it && it.kind === 'path' ? 'ground' : 'object' };
    });
    return occ;
  }
  function avatarCellOf(a) {
    if (a == null || a === false) return -1;
    if (typeof a === 'number') return a >= 0 && a < NCELL ? a : -1;
    if (typeof a.c === 'number' && typeof a.r === 'number') return cellIndex(a.c, a.r);
    if (typeof a.x === 'number' && typeof a.z === 'number') return cellOf(a.x, a.z);
    return -1;
  }
  /* the house's door point (between its entrance cells) and its first entrance cell */
  function houseOf(placed, Cc) {
    for (var i = 0; placed && i < placed.length; i++) {
      var p = placed[i], it = itemOf(Cc, p.id);
      if (p.id === 'house_cottage' || (it && it.kind === 'house')) {
        var fp = (it && it.fp) || [2, 2];
        return { uid: p.uid, x: p.x + fp[0] / 2 - 8, z: p.y + fp[1] - 5, entrance: cellIndex(p.x, p.y + fp[1]) };
      }
    }
    return null;
  }

  function buildGraph(src, opts) {
    opts = opts || {};
    var Cc = core(opts.C), Gx = opts.G;
    var land = landOf(src, Cc), occ = occOf(src, Cc), placed = src && Array.isArray(src.placed) ? src.placed : [];
    var g = {
      walk: new Uint8Array(NCELL), land: new Uint8Array(NCELL), y: new Float32Array(NCELL),
      obj: new Array(NCELL), comp: new Int16Array(NCELL), compSize: [0], largest: 0,
      objects: {}, items: [], avatar: -1, avatarX: 0, avatarZ: 0, house: null, free: 0
    };
    var i, c, r;
    for (i = 0; i < NCELL; i++) {
      c = colOf(i); r = rowOf(i);
      var k = c + ',' + r, o = occ[k];
      g.obj[i] = o && o.layer !== 'ground' ? o : null;
      if (land[k]) { g.land[i] = 1; g.y[i] = surfaceAt(c, r, Cc, Gx); }
    }
    var av = avatarCellOf(opts.avatar);
    if (av < 0 && opts.avatar !== null && opts.avatar !== false) {
      var h0 = houseOf(placed, Cc);
      if (h0 && h0.entrance >= 0 && g.land[h0.entrance] && !g.obj[h0.entrance]) av = h0.entrance;
    }
    g.avatar = av;
    if (av >= 0) { g.avatarX = centreX(av); g.avatarZ = centreZ(av); }
    for (i = 0; i < NCELL; i++) { g.walk[i] = g.land[i] && !g.obj[i] && i !== av ? 1 : 0; if (g.walk[i]) g.free++; }
    /* placed objects (fun items, benches, plants…): pivots and adjacent free cells */
    placed.forEach(function (p) {
      var it = itemOf(Cc, p.id);
      if (!it || it.kind === 'path') return;
      var fp = it.fp || [1, 1], cells = [], adj = [];
      for (var dy = 0; dy < fp[1]; dy++) for (var dx = 0; dx < fp[0]; dx++) { var ci = cellIndex(p.x + dx, p.y + dy); if (ci >= 0) cells.push(ci); }
      var base = 0;
      cells.forEach(function (ci) { base = Math.max(base, g.land[ci] ? g.y[ci] : surfaceAt(colOf(ci), rowOf(ci), Cc, Gx)); });
      for (var yy = p.y - 1; yy <= p.y + fp[1]; yy++) for (var xx = p.x - 1; xx <= p.x + fp[0]; xx++) {
        var ai = cellIndex(xx, yy);
        if (ai < 0 || cells.indexOf(ai) >= 0 || !g.walk[ai]) continue;
        var diag = (xx < p.x || xx >= p.x + fp[0]) && (yy < p.y || yy >= p.y + fp[1]);
        if (!diag) adj.push(ai);                         /* side neighbours only: pets face the item squarely */
      }
      var ob = { uid: p.uid, id: p.id, kind: it.kind, c: p.x, r: p.y, w: fp[0], h: fp[1], cells: cells, adj: adj,
                 x: p.x + fp[0] / 2 - 8, z: p.y + fp[1] / 2 - 5, y: base };
      g.objects[p.uid] = ob;
      g.items.push(ob);
    });
    g.house = houseOf(placed, Cc);
    labelComponents(g);
    return g;
  }
  /* neighbour n of cell i is passable (no corner cutting on diagonals) */
  function stepOk(g, i, n, extra) {
    var c = colOf(i) + NB_DC[n], r = rowOf(i) + NB_DR[n], j = cellIndex(c, r);
    if (j < 0 || !g.walk[j] || (extra && extra[j])) return -1;
    if (n >= 4) {
      var a = cellIndex(c, rowOf(i)), b = cellIndex(colOf(i), r);
      if (!g.walk[a] || !g.walk[b] || (extra && (extra[a] || extra[b]))) return -1;
    }
    return j;
  }
  function labelComponents(g) {
    var comp = g.comp, size = [0], queue = new Int16Array(NCELL), best = 0, bestN = 0;
    comp.fill(0);
    for (var s = 0; s < NCELL; s++) {
      if (!g.walk[s] || comp[s]) continue;
      var id = size.length, head = 0, tail = 0, n = 0;
      comp[s] = id; queue[tail++] = s;
      while (head < tail) {
        var i = queue[head++]; n++;
        for (var k = 0; k < 8; k++) { var j = stepOk(g, i, k, null); if (j >= 0 && !comp[j]) { comp[j] = id; queue[tail++] = j; } }
      }
      size.push(n);
      if (n > bestN) { bestN = n; best = id; }
    }
    g.compSize = size; g.largest = best;
  }

  /* ---------------- A* (octile, no corner cutting) ---------------- */
  var _gs = new Float64Array(NCELL), _fs = new Float64Array(NCELL), _from = new Int16Array(NCELL), _st = new Uint8Array(NCELL);
  var _heap = new Int16Array(NCELL * 8), _hn = 0;
  function octile(a, b) {
    var dx = Math.abs(colOf(a) - colOf(b)), dz = Math.abs(rowOf(a) - rowOf(b));
    return dx > dz ? dx - dz + SQRT2 * dz : dz - dx + SQRT2 * dx;
  }
  function hpush(i) {
    var k = _hn++; _heap[k] = i;
    while (k > 0) { var p = (k - 1) >> 1; if (_fs[_heap[p]] <= _fs[_heap[k]]) break; var t = _heap[p]; _heap[p] = _heap[k]; _heap[k] = t; k = p; }
  }
  function hpop() {
    var top = _heap[0]; _hn--;
    if (_hn > 0) {
      _heap[0] = _heap[_hn];
      var k = 0;
      for (;;) {
        var l = 2 * k + 1, r = l + 1, m = k;
        if (l < _hn && _fs[_heap[l]] < _fs[_heap[m]]) m = l;
        if (r < _hn && _fs[_heap[r]] < _fs[_heap[m]]) m = r;
        if (m === k) break;
        var t = _heap[m]; _heap[m] = _heap[k]; _heap[k] = t; k = m;
      }
    }
    return top;
  }
  /* → [cell, …] from → to inclusive, or null. `from` may be blocked (the pet stands there). */
  function astar(g, from, to, extra) {
    if (from < 0 || to < 0 || !g.walk[to] || (extra && extra[to] && to !== from)) return null;
    if (from === to) return [from];
    _gs.fill(Infinity); _st.fill(0); _from.fill(-1); _hn = 0;
    _gs[from] = 0; _fs[from] = octile(from, to); hpush(from); _st[from] = 1;
    while (_hn > 0) {
      var i = hpop();
      if (_st[i] === 2) continue;
      _st[i] = 2;
      if (i === to) break;
      for (var n = 0; n < 8; n++) {
        var j = stepOk(g, i, n, extra);
        if (j < 0 || _st[j] === 2) continue;
        var cost = _gs[i] + (n >= 4 ? SQRT2 : 1);
        if (cost < _gs[j] - 1e-9) { _gs[j] = cost; _from[j] = i; _fs[j] = cost + octile(j, to); hpush(j); _st[j] = 1; }
      }
    }
    if (_st[to] !== 2) return null;
    var out = [], k = to;
    while (k >= 0) { out.push(k); if (k === from) break; k = _from[k]; }
    if (out[out.length - 1] !== from) return null;
    return out.reverse();
  }
  /* Dijkstra distances (octile steps) from `from` → fills dist (Float64Array NCELL) and parent (Int16Array) */
  function distMap(g, from, extra, dist, parent) {
    dist = dist || new Float64Array(NCELL); parent = parent || new Int16Array(NCELL);
    dist.fill(Infinity); parent.fill(-1); _st.fill(0); _hn = 0;
    if (from < 0) return dist;
    dist[from] = 0; _fs[from] = 0; hpush(from);
    while (_hn > 0) {
      var i = hpop();
      if (_st[i]) continue;
      _st[i] = 1;
      for (var n = 0; n < 8; n++) {
        var j = stepOk(g, i, n, extra);
        if (j < 0 || _st[j]) continue;
        var d = dist[i] + (n >= 4 ? SQRT2 : 1);
        if (d < dist[j] - 1e-9) { dist[j] = d; parent[j] = i; _fs[j] = d; hpush(j); }
      }
    }
    return dist;
  }
  function chainTo(parent, from, to) {
    var out = [], k = to, guard = 0;
    while (k >= 0 && guard++ < NCELL) { out.push(k); if (k === from) return out.reverse(); k = parent[k]; }
    return null;
  }

  /* ---------------- smoothing ---------------- */
  function walkableAt(g, x, z, extra, allow) {
    var i = cellOf(x, z);
    return i >= 0 && (i === allow || (g.walk[i] && !(extra && extra[i])));
  }
  /* a fat line of sight: the centre line plus two parallel lines `clr` either side */
  function losClear(g, x0, z0, x1, z1, extra, clr, allow) {
    var dx = x1 - x0, dz = z1 - z0, len = Math.sqrt(dx * dx + dz * dz);
    if (len < 1e-6) return true;
    var nx = -dz / len, nz = dx / len, steps = Math.ceil(len / WALK.step);
    for (var s = 0; s <= steps; s++) {
      var u = s / steps, x = x0 + dx * u, z = z0 + dz * u, d = u * len;
      if (!walkableAt(g, x, z, extra, allow)) return false;
      if (d < WALK.startFree || len - d < 0.05) continue;       /* near the ends only the centre line counts */
      if (!walkableAt(g, x + nx * clr, z + nz * clr, extra, allow) || !walkableAt(g, x - nx * clr, z - nz * clr, extra, allow)) return false;
    }
    return true;
  }
  function crPoint(p0, p1, p2, p3, u) {
    var u2 = u * u, u3 = u2 * u;
    return 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3);
  }
  function finishPath(xs, zs, cells, target) {
    var n = xs.length, pts = new Float64Array(n * 2), cum = new Float64Array(n), total = 0;
    for (var i = 0; i < n; i++) {
      pts[i * 2] = xs[i]; pts[i * 2 + 1] = zs[i];
      if (i) { var dx = xs[i] - xs[i - 1], dz = zs[i] - zs[i - 1]; total += Math.sqrt(dx * dx + dz * dz); }
      cum[i] = total;
    }
    return { pts: pts, cum: cum, n: n, total: total, cells: cells, target: target };
  }
  /* cells (A* output) → a smoothed, validated path from (x0, z0) */
  function smoothPath(g, cells, x0, z0, extra) {
    if (!cells || !cells.length) return null;
    var start = cells[0], last = cells[cells.length - 1];
    var wx = [x0], wz = [z0], i;
    for (i = 1; i < cells.length; i++) { wx.push(centreX(cells[i])); wz.push(centreZ(cells[i])); }
    if (cells.length === 1) { wx.push(centreX(last)); wz.push(centreZ(last)); }
    /* line-of-sight pruning (greedy farthest) */
    var px = [wx[0]], pz = [wz[0]], a = 0;
    while (a < wx.length - 1) {
      var b = wx.length - 1;
      while (b > a + 1 && !losClear(g, wx[a], wz[a], wx[b], wz[b], extra, WALK.clearance, start)) b--;
      px.push(wx[b]); pz.push(wz[b]); a = b;
    }
    /* re-densify every ≤ 1 u so the spline hugs the validated lines */
    var dx = [px[0]], dz = [pz[0]];
    for (i = 1; i < px.length; i++) {
      var ex = px[i] - px[i - 1], ez = pz[i] - pz[i - 1], L = Math.sqrt(ex * ex + ez * ez), m = Math.max(1, Math.ceil(L / 1));
      for (var k = 1; k <= m; k++) { dx.push(px[i - 1] + ex * k / m); dz.push(pz[i - 1] + ez * k / m); }
    }
    /* Catmull-Rom through the dense points */
    var sx = [dx[0]], sz = [dz[0]], n = dx.length;
    for (i = 0; i < n - 1; i++) {
      var i0 = Math.max(0, i - 1), i3 = Math.min(n - 1, i + 2);
      for (var s = 1; s <= WALK.sub; s++) {
        var u = s / WALK.sub;
        sx.push(crPoint(dx[i0], dx[i], dx[i + 1], dx[i3], u));
        sz.push(crPoint(dz[i0], dz[i], dz[i + 1], dz[i3], u));
      }
    }
    var path = finishPath(sx, sz, cells, last);
    if (!pathValid(g, path, 0, extra, start)) path = finishPath(dx, dz, cells, last);
    if (!pathValid(g, path, 0, extra, start)) path = finishPath(wx, wz, cells, last);
    return path;
  }
  /* every point along the polyline (from arc length s0) is on a free cell (allow = the start cell) */
  function pathValid(g, path, s0, extra, allow) {
    if (!path) return false;
    var P = path.pts;
    for (var i = 1; i < path.n; i++) {
      if (path.cum[i] < (s0 || 0)) continue;
      var x0 = P[i * 2 - 2], z0 = P[i * 2 - 1], x1 = P[i * 2], z1 = P[i * 2 + 1];
      var ddx = x1 - x0, ddz = z1 - z0, steps = Math.max(1, Math.ceil(Math.sqrt(ddx * ddx + ddz * ddz) / WALK.step));
      for (var s = 0; s <= steps; s++) if (!walkableAt(g, x0 + ddx * s / steps, z0 + ddz * s / steps, extra, allow)) return false;
    }
    return true;
  }
  /* position (and the segment index hint) at arc length s → out {x, z, dx, dz, seg} */
  function samplePath(path, s, out, hint) {
    out = out || {};
    var P = path.pts, cum = path.cum, n = path.n;
    if (n < 2) { out.x = P[0]; out.z = P[1]; out.dx = 0; out.dz = 1; out.seg = 0; return out; }
    s = clamp(s, 0, path.total);
    var k = hint > 0 && hint < n ? hint : 1;
    if (cum[k - 1] > s) k = 1;
    while (k < n - 1 && cum[k] < s) k++;
    var seg = cum[k] - cum[k - 1], u = seg > 1e-9 ? (s - cum[k - 1]) / seg : 1;
    out.x = P[k * 2 - 2] + (P[k * 2] - P[k * 2 - 2]) * u;
    out.z = P[k * 2 - 1] + (P[k * 2 + 1] - P[k * 2 - 1]) * u;
    out.dx = P[k * 2] - P[k * 2 - 2]; out.dz = P[k * 2 + 1] - P[k * 2 - 1];
    out.seg = k;
    return out;
  }

  /* ground height under (x, z): the cell's surface, blended across a terrace edge with a little hop */
  var EDGE = 0.18;
  function yCell(g, c, r, base) { var i = cellIndex(c, r); return i >= 0 && g.land[i] ? g.y[i] : base; }
  function heightAt(g, x, z) {
    var fx = x + COLS / 2, fz = z + ROWS / 2, c = Math.floor(fx), r = Math.floor(fz);
    var i = cellIndex(c, r), base = i >= 0 && g.land[i] ? g.y[i] : 0, h = base;
    var ux = fx - c, uz = fz - r;
    if (ux < EDGE) h += edge(yCell(g, c - 1, r, base) - base, ux);
    else if (ux > 1 - EDGE) h += edge(yCell(g, c + 1, r, base) - base, 1 - ux);
    if (uz < EDGE) h += edge(yCell(g, c, r - 1, base) - base, uz);
    else if (uz > 1 - EDGE) h += edge(yCell(g, c, r + 1, base) - base, 1 - uz);
    return h;
  }
  function edge(d, u) {
    if (d === 0) return 0;
    var k = 1 - u / EDGE;
    return d * 0.5 * smooth01(k) + Math.abs(d) * 0.6 * (1 - (u / EDGE) * (u / EDGE));
  }

  /* nearest free cell to (x, z): prefer the largest component, unreserved by others */
  function nearestFree(g, x, z, res, self, wantComp) {
    var best = -1, bestD = Infinity;
    for (var pass = 0; pass < 2 && best < 0; pass++) {
      for (var i = 0; i < NCELL; i++) {
        if (!g.walk[i]) continue;
        if (pass === 0 && wantComp && g.comp[i] !== wantComp) continue;
        if (res && res[i] >= 0 && res[i] !== self) continue;
        var dx = centreX(i) - x, dz = centreZ(i) - z, d = dx * dx + dz * dz;
        if (d < bestD - 1e-9) { bestD = d; best = i; }
      }
    }
    return best;
  }

  /* ---------------- the trampoline bounce (mirrors SLMotion 'bounce') ---------------- */
  function bounceAt(t, lead, out) {
    out = out || {};
    out.matDip = 0; out.petY = 0; out.flip = 0; out.done = false;
    var s = t - clamp(lead || 0, 0, BOUNCE.maxLead);
    if (s >= BOUNCE.length) { out.done = true; return out; }
    for (var i = 0; i < 4 && s >= 0; i++) {
      if (s < BOUNCE.contact) { out.matDip = -BOUNCE.dip * Math.sin(PI * s / BOUNCE.contact); out.petY = out.matDip; break; }
      s -= BOUNCE.contact;
      if (i === 3) break;
      var f = BOUNCE.flights[i];
      if (s < f) {
        var v = Math.sqrt(2 * BOUNCE.g * BOUNCE.heights[i]);
        out.petY = v * s - BOUNCE.g * s * s / 2;
        if (i === 2) out.flip = s / f;
        break;
      }
      s -= f;
    }
    return out;
  }

  /* ---------------- dance ---------------- */
  /* the shared timeline: t = seconds since count 1 starts (negative while gathering) */
  function danceAt(t, reduced, out) {
    out = out || {};
    var dur = reduced ? DANCE.reducedDur : DANCE.dur;
    out.t = t; out.reduced = !!reduced;
    if (t < 0) { out.phase = 'wait'; out.count = 0; out.frac = 0; out.move = ''; return out; }
    if (reduced) {
      out.phase = t < dur ? 'dance' : 'done'; out.count = t < dur ? 8 : 0; out.frac = clamp01(t / dur); out.move = t < dur ? 'pose' : '';
      return out;
    }
    if (t >= dur + DANCE.hold) { out.phase = 'done'; out.count = 0; out.frac = 1; out.move = ''; return out; }
    if (t >= dur) { out.phase = 'hold'; out.count = 8; out.frac = 1; out.move = 'pose'; return out; }
    var b = t / DANCE.beat, c = Math.min(7, Math.floor(b));
    out.phase = 'dance'; out.count = c + 1; out.frac = b - c; out.move = DANCE.moves[c];
    return out;
  }
  /* the delay ≥ minDelay that lands count 1 on a bar line (or a beat when perBar is false) */
  function alignDelay(minDelay, beat, bpm, perBar) {
    minDelay = Math.max(0, +minDelay || 0);
    if (!(typeof beat === 'number' && isFinite(beat)) || !(bpm > 0)) return minDelay;
    var unit = perBar ? 4 : 1, sec = 60 / bpm, b = beat + minDelay / sec;
    var target = Math.ceil(b / unit - 1e-6) * unit;
    return minDelay + (target - b) * sec;
  }
  /* open cells in front of the house, closest first (n distinct cells, never the avatar's) */
  function danceSpots(g, n, res) {
    var ox = 0, oz = 0, row = -1;
    if (g.house) { ox = g.house.x; oz = g.house.z + 0.6; row = rowOf(Math.max(0, g.house.entrance)); }
    else if (g.avatar >= 0) { ox = g.avatarX + 0.5; oz = g.avatarZ + 0.6; }
    var list = [];
    for (var i = 0; i < NCELL; i++) {
      if (!g.walk[i]) continue;
      var dx = centreX(i) - ox, dz = centreZ(i) - oz, d = Math.sqrt(dx * dx + dz * dz);
      if (row >= 0 && rowOf(i) < row) d += 2;           /* in front of the house reads best */
      if (g.largest && g.comp[i] !== g.largest) d += 0.5;
      list.push({ i: i, d: d });
    }
    list.sort(function (a, b) { return a.d - b.d || a.i - b.i; });
    return list.slice(0, n).map(function (e) { return e.i; });
  }

  /* ---------------- the avatar's glance at a pet: every 5–7 s, 1.6 s long ---------------- */
  function glanceAt(t, seed, out) {
    out = out || {};
    var s = (typeof seed === 'number' ? seed : hash(seed == null ? '' : seed)) ^ 0x1b873593;
    var mean = (GLANCE.min + GLANCE.max) / 2, spread = (GLANCE.max - GLANCE.min) / 2;
    var n = Math.floor(t / mean) + 1;
    while (n > -2 && n * mean + (mix01(s, n) - 0.5) * spread > t) n--;
    var since = t - (n * mean + (mix01(s, n) - 0.5) * spread);
    out.n = n; out.since = since;
    out.k = since >= 0 && since < GLANCE.dur ? smooth01(since / GLANCE.ease) * (1 - smooth01((since - (GLANCE.dur - GLANCE.ease)) / GLANCE.ease)) : 0;
    out.pick = mix01(s ^ 0x7f4a7c15, n);
    return out;
  }

  /* ================================================================
     THE BRAIN
     ================================================================ */
  /* pet state (read by actors.js):
       id species index active · x y z (world; y = ground incl. hops) · yaw (rad, 0 faces +z) ·
       speed (u/s) cruise (the gait's nominal speed) omega (turn rate, rad/s) ·
       state 'idle'|'walk'|'act'|'perform'|'dance'|'sit' · action (act name / goal) ·
       actT0 actDur · lookX lookZ lookK (head look target) · faceCam 0..1 ·
       tapT happyUntil · onSeat ('' | 'trampoline' | 'bench') · flip 0..1 bounce (y above the seat) ·
       hop 0..1 (hop-on/off progress) · perfPhase · danceSpot · cell res */
  function newPet(id, index) {
    return {
      id: id, species: id, index: index, active: false,
      x: 0, y: 0, z: 0, yaw: 0, speed: 0, cruise: WALK.speed, omega: 0,
      cell: -1, res: -1,
      state: 'idle', action: '', actT0: 0, actDur: 0, actEnd: 0, nextAt: 0, gap: 0, lastStart: -1, starts: 0,
      path: null, pathS: 0, seg: 1, goal: null, waitT: 0, pauseUntil: -1, turnTo: null,
      lookX: 0, lookZ: 0, lookK: 0, faceCam: 0, desiredYaw: 0, hasDesired: false,
      tapT: -99, happyUntil: -99,
      onSeat: '', flip: 0, bounce: 0, hop: 0, perfPhase: '', danceSpot: -1, gatherT0: 0, gatherDur: 1,
      perf: { kind: '', uid: '', t0: 0, lead: 0, runT0: 0, runDur: 0, sitUntil: 0, hopT0: 0, approach: -1, fromIdle: false,
              ax: 0, ay: 0, az: 0, sx: 0, sy: 0, sz: 0, lx: 0, ly: 0, lz: 0, land: -1, face: 0, path: null },
      px: 0, pz: 0, qx: 0, qz: 0                       /* pounce start / end */
    };
  }

  function create(opts) {
    opts = opts || {};
    var Cx = opts.C || null, Gx = opts.G || null;
    var seed = typeof opts.seed === 'number' ? opts.seed >>> 0 : hash(opts.seed == null ? 'island-pets' : opts.seed);
    var rng = makeRng(seed);
    var brain = {
      version: VERSION, seed: seed, now: 0, pets: [], graph: null, mode: 'play', reduced: !!opts.reduced,
      show: 0, camYaw: 0, events: [], danceOn: false, danceT0: 0, danceEnd: 0, danceReduced: false, synced: false
    };
    var res = new Int16Array(NCELL).fill(-1);
    var extra = new Uint8Array(NCELL);              /* scratch: other pets' cells while planning */
    var dist = new Float64Array(NCELL), parent = new Int16Array(NCELL);
    var _sp = { x: 0, z: 0, dx: 0, dz: 1, seg: 1 }, _b = { matDip: 0, petY: 0, flip: 0, done: false };
    var byId = {};

    function pick(list) { return list[Math.floor(rng() * list.length) % list.length]; }
    function range(r) { return r[0] + (r[1] - r[0]) * rng(); }
    function g() { return brain.graph; }

    /* ---------- reservations: at most one cell per pet, never shared ---------- */
    function reserve(p, i) {
      if (p.res >= 0 && res[p.res] === p.index) res[p.res] = -1;
      if (i >= 0 && res[i] >= 0 && res[i] !== p.index) i = -1;     /* never steal another pet's spot */
      p.res = i;
      if (i >= 0) res[i] = p.index;
    }
    function freeFor(p, i) { return i >= 0 && g().walk[i] && (res[i] < 0 || res[i] === p.index); }
    function wantedCell(p) {
      if (p.state === 'walk' && p.path) return p.path.target;
      if (p.state === 'perform') return p.perf.land >= 0 ? p.perf.land : p.perf.approach;
      if (p.state === 'dance' && p.danceSpot >= 0) return p.danceSpot;
      return cellOf(p.x, p.z);
    }
    function rebuildReservations() {
      res.fill(-1);
      brain.pets.forEach(function (p) {
        var want = wantedCell(p);
        if (want >= 0 && res[want] < 0 && g().walk[want]) { res[want] = p.index; p.res = want; }
        else p.res = -1;
      });
    }
    /* other pets' standing cells, as extra blockers for planning */
    function blockOthers(p, also) {
      extra.fill(0);
      brain.pets.forEach(function (q) {
        if (q === p) return;
        var qc = cellOf(q.x, q.z);
        if (qc >= 0 && q.state !== 'walk' && q.onSeat === '') extra[qc] = 1;
        if (q.res >= 0 && q.state !== 'walk') extra[q.res] = 1;
      });
      if (also >= 0) extra[also] = 1;
      var me = cellOf(p.x, p.z);
      if (me >= 0) extra[me] = 0;
      return extra;
    }

    /* ---------- positioning ---------- */
    function place(p, i) {
      p.x = centreX(i); p.z = centreZ(i); p.cell = i;
      p.y = heightAt(g(), p.x, p.z);
    }
    function popTo(p, i, type) {
      var x0 = p.x, y0 = p.y, z0 = p.z;
      clearMotion(p);
      place(p, i);
      reserve(p, i);
      p.state = 'idle';
      brain.events.push({ type: type || 'pop', id: p.id, x0: x0, y0: y0, z0: z0, x: p.x, y: p.y, z: p.z });
    }
    function clearMotion(p) {
      p.path = null; p.pathS = 0; p.seg = 1; p.goal = null; p.speed = 0; p.waitT = 0;
      p.onSeat = ''; p.flip = 0; p.bounce = 0; p.hop = 0; p.perfPhase = ''; p.perf.kind = ''; p.perf.path = null;
      p.lookK = 0; p.faceCam = 0; p.hasDesired = false;
    }
    function toIdle(p, nextIn) {
      var keepCell = cellOf(p.x, p.z);
      clearMotion(p);
      p.state = 'idle'; p.action = '';
      p.cell = keepCell;
      reserve(p, freeFor(p, keepCell) ? keepCell : -1);
      if (nextIn != null) p.nextAt = brain.now + nextIn;
    }

    /* ---------- walking ---------- */
    function startPath(p, path, goal, cruise) {
      p.path = path; p.pathS = 0; p.seg = 1; p.goal = goal || null; p.waitT = 0;
      p.cruise = cruise || WALK.speed;
      p.state = 'walk';
      reserve(p, path.target);
    }
    function planTo(p, target, blockExtra) {
      var from = cellOf(p.x, p.z);
      if (from < 0 || target < 0) return null;
      var ex = blockOthers(p, blockExtra == null ? -1 : blockExtra);
      var cells = astar(g(), from, target, ex);
      if (!cells) cells = astar(g(), from, target, null);           /* pets may squeeze past each other */
      return cells ? smoothPath(g(), cells, p.x, p.z, null) : null;
    }
    function turnToward(p, yaw, rate, dt) {
      var d = wrap(yaw - p.yaw), m = rate * dt;
      var step = d > m ? m : d < -m ? -m : d;
      p.yaw = wrap(p.yaw + step);
      p.omega = dt > 0 ? step / dt : 0;
      return Math.abs(d - step);
    }
    function blockedAhead(p, dirX, dirZ) {
      for (var k = 0; k < brain.pets.length; k++) {
        var q = brain.pets[k];
        if (q === p || q.onSeat) continue;
        var dx = q.x - p.x, dz = q.z - p.z, d2 = dx * dx + dz * dz;
        if (d2 > WALK.near * WALK.near || d2 < 1e-10) continue;
        if (dx * dirX + dz * dirZ > 0.05 * Math.sqrt(d2)) return q;
      }
      return null;
    }
    function follow(p, dt, cruise, accel) {
      var path = p.path;
      if (!path) { toIdle(p, null); return; }
      samplePath(path, Math.min(path.total, p.pathS + WALK.look), _sp, p.seg);
      var hx = _sp.x - p.x, hz = _sp.z - p.z;
      if (hx * hx + hz * hz < 1e-8) { hx = _sp.dx; hz = _sp.dz; }
      var want = Math.atan2(hx, hz), off = turnToward(p, want, WALK.turn * (cruise > WALK.speed * 1.5 ? 2 : 1), dt);
      var target = cruise * clamp01((Math.cos(off) - 0.3) / 0.7);
      var q = blockedAhead(p, Math.sin(p.yaw), Math.cos(p.yaw));
      if (q && cruise <= WALK.speed * 1.5) {
        target = 0; p.waitT += dt;
        if (p.waitT > WALK.wait) {                     /* give way: re-plan around the pet in front */
          p.waitT = 0;
          var np = planTo(p, path.target, cellOf(q.x, q.z));
          if (np && np.total > 0.05) { p.path = path = np; p.pathS = 0; p.seg = 1; }
          else { arrive(p, true); return; }
        }
      } else p.waitT = 0;
      var dv = target - p.speed, a = accel * dt;
      p.speed += dv > a ? a : dv < -a ? -a : dv;
      p.pathS = Math.min(path.total, p.pathS + p.speed * dt);
      samplePath(path, p.pathS, _sp, p.seg);
      p.seg = _sp.seg; p.x = _sp.x; p.z = _sp.z;
      p.cell = cellOf(p.x, p.z);
      p.y = heightAt(g(), p.x, p.z);
      if (p.pathS >= path.total - 1e-6) arrive(p, false);
    }
    function arrive(p, gaveUp) {
      var goal = p.goal;
      p.path = null; p.goal = null; p.speed = 0;
      p.cell = cellOf(p.x, p.z);
      if (p.state === 'dance') { reserve(p, p.cell); return; }
      p.state = 'idle';
      reserve(p, freeFor(p, p.cell) ? p.cell : -1);
      if (gaveUp || !goal) return;
      if (goal.type === 'act') {
        var room = p.nextAt - IDLE.slack * 0.5 - brain.now;
        var dur = Math.min(goal.dur, room);
        if (dur >= 0.8) startAct(p, goal.name, dur, goal);
      } else if (goal.type === 'bench') {
        var ob = g().objects[goal.uid];
        if (ob && ob.id === 'bench' && !benchTaken(ob.uid, p)) startSeat(p, ob, 'bench', p.nextAt - IDLE.slack - brain.now - HOP.benchOn - HOP.off);
      }
    }

    /* ---------- in-place actions ---------- */
    function startAct(p, name, dur, goal) {
      p.state = 'act'; p.action = name; p.actT0 = brain.now; p.actDur = dur; p.actEnd = brain.now + dur;
      p.lookK = 0; p.faceCam = 0; p.hasDesired = false;
      var tx = null, tz = null;
      if (goal && goal.fx != null) { tx = goal.fx; tz = goal.fz; }
      else if (name === 'lookAvatar' && g().avatar >= 0) { tx = g().avatarX; tz = g().avatarZ; }
      if (tx != null) { p.desiredYaw = Math.atan2(tx - p.x, tz - p.z); p.hasDesired = true; p.lookX = tx; p.lookZ = tz; p.lookK = 1; }
      if (name === 'look') { p.desiredYaw = brain.camYaw; p.hasDesired = true; p.faceCam = 1; }
      if (name === 'turn') { p.desiredYaw = wrap(p.yaw + (rng() < 0.5 ? -1 : 1) * (0.8 + rng() * 1.6)); p.hasDesired = true; }
      if (name === 'emote') { p.desiredYaw = brain.camYaw; p.hasDesired = true; p.faceCam = 1; brain.events.push({ type: 'emote', id: p.id, kind: pick(EMOTES) }); }
      if (name === 'pounce') {
        p.px = p.x; p.pz = p.z;
        p.qx = p.x + Math.sin(p.yaw) * POUNCE_DIST; p.qz = p.z + Math.cos(p.yaw) * POUNCE_DIST;
      }
    }
    function actStep(p, dt) {
      if (p.hasDesired) turnToward(p, p.desiredYaw, WALK.turn, dt); else p.omega = 0;
      if (p.action === 'pounce') {
        var u = clamp01((brain.now - p.actT0 - 0.35) / 0.35), k = smooth01(u);
        p.x = p.px + (p.qx - p.px) * k; p.z = p.pz + (p.qz - p.pz) * k;
        p.y = heightAt(g(), p.x, p.z);
      }
      if (brain.now >= p.actEnd) {
        if (p.action === 'pounce') p.cell = cellOf(p.x, p.z);
        p.action = ''; p.state = 'idle'; p.lookK = 0; p.faceCam = 0; p.hasDesired = false;
        reserve(p, freeFor(p, p.cell) ? p.cell : p.res);
      }
    }

    /* ---------- choosing what to do next (every 4–8 s, start to start) ---------- */
    function weightsFor(p) {
      var w = {}, k, sp = SPECIES_W[p.species] || {};
      if (brain.reduced) { for (k in REDUCED_W) w[k] = REDUCED_W[k]; if (g().avatar < 0) w.lookAvatar = 0; return w; }
      for (k in WEIGHTS) w[k] = WEIGHTS[k] * (sp[k] != null ? sp[k] : 1);
      if (g().avatar < 0) w.lookAvatar = 0;
      if (brain.show > 0.5) w.bench *= 4;
      return w;
    }
    function decide(p) {
      var G = IDLE.min + (IDLE.max - IDLE.min) * rng();
      p.gap = G; p.lastStart = brain.now; p.nextAt = brain.now + G; p.starts++;
      var budget = G - IDLE.slack, w = weightsFor(p), names = Object.keys(w), tries = 0;
      while (tries++ < 8) {
        var total = 0, i;
        for (i = 0; i < names.length; i++) total += w[names[i]];
        if (total <= 0) break;
        var r = rng() * total, name = names[names.length - 1];
        for (i = 0; i < names.length; i++) { r -= w[names[i]]; if (r <= 0) { name = names[i]; break; } }
        if (tryAction(p, name, budget)) return name;
        w[name] = 0;
      }
      return '';
    }
    function tryAction(p, name, budget) {
      if (name === 'wander') return tryWander(p, budget);
      if (name === 'visit') return tryVisit(p, budget);
      if (name === 'bench') return tryBench(p, budget);
      var kind = name === 'play' ? PLAY[p.species] || 'chase' : name;
      var spec = ACTIONS[kind];
      if (!spec) return false;
      var dur = kind === 'nap' ? Math.min(spec.dur[1], budget - 0.2) : Math.min(range(spec.dur), budget);
      if (dur < Math.min(spec.dur[0], 1)) return false;
      if (kind === 'pounce') {
        var qx = p.x + Math.sin(p.yaw) * POUNCE_DIST, qz = p.z + Math.cos(p.yaw) * POUNCE_DIST, qc = cellOf(qx, qz);
        if (!losClear(g(), p.x, p.z, qx, qz, null, 0, -1) || !(qc === p.cell || (freeFor(p, qc) && res[qc] < 0))) return false;
      }
      startAct(p, kind, dur, null);
      return true;
    }
    function reachMap(p) {
      var from = cellOf(p.x, p.z);
      if (from < 0) return -1;
      distMap(g(), from, blockOthers(p, -1), dist, parent);
      return from;
    }
    function tryWander(p, budget) {
      var from = reachMap(p);
      if (from < 0) return false;
      var maxD = (budget - IDLE.turnPad) * WALK.speed, cand = [];
      for (var i = 0; i < NCELL; i++) {
        if (i === from || !isFinite(dist[i]) || dist[i] < 1 || dist[i] * 1.06 > maxD) continue;
        if (res[i] >= 0 && res[i] !== p.index) continue;
        cand.push(i);
      }
      while (cand.length) {
        var k = Math.floor(rng() * cand.length), t = cand[k];
        cand[k] = cand[cand.length - 1]; cand.pop();
        var cells = chainTo(parent, from, t), path = cells && smoothPath(g(), cells, p.x, p.z, null);
        if (path && path.total / WALK.speed + IDLE.turnPad <= budget && pathValid(g(), path, 0, null, from)) { startPath(p, path, null); return true; }
      }
      return false;
    }
    function tryVisit(p, budget) {
      var from = reachMap(p);
      if (from < 0) return false;
      var opts2 = [];
      g().items.forEach(function (ob) {
        var kind = SNIFF_IDS.test(ob.id) ? 'sniff' : WATCH_IDS[ob.id] ? 'look' : '';
        if (!kind || ob.id === 'bench') return;
        ob.adj.forEach(function (a) {
          if (!isFinite(dist[a]) || (res[a] >= 0 && res[a] !== p.index)) return;
          var walkT = dist[a] * 1.06 / WALK.speed + IDLE.turnPad;
          if (walkT + 1.4 <= budget) opts2.push({ a: a, ob: ob, kind: kind, walkT: walkT });
        });
      });
      while (opts2.length) {
        var k = Math.floor(rng() * opts2.length), o = opts2[k];
        opts2[k] = opts2[opts2.length - 1]; opts2.pop();
        var cells = o.a === from ? [from] : chainTo(parent, from, o.a);
        var path = cells && smoothPath(g(), cells, p.x, p.z, null);
        if (!path) continue;
        var goal = { type: 'act', name: o.kind, dur: Math.min(2.4, budget - path.total / WALK.speed - IDLE.turnPad), fx: o.ob.x, fz: o.ob.z };
        if (goal.dur < 1) continue;
        if (path.total < 0.05) { startAct(p, o.kind, goal.dur, goal); return true; }
        startPath(p, path, goal);
        return true;
      }
      return false;
    }
    function tryBench(p, budget) {
      var from = reachMap(p);
      if (from < 0) return false;
      var best = null;
      g().items.forEach(function (ob) {
        if (ob.id !== 'bench') return;
        if (benchTaken(ob.uid, p)) return;
        ob.adj.forEach(function (a) {
          if (!isFinite(dist[a]) || (res[a] >= 0 && res[a] !== p.index)) return;
          var t = dist[a] * 1.06 / WALK.speed + IDLE.turnPad + HOP.benchOn + 2 + HOP.off;
          var front = rowOf(a) === ob.r + 1 ? 0 : 0.3;     /* hop up from the front when possible */
          if (t <= budget && (!best || t + front < best.t)) best = { a: a, ob: ob, t: t + front };
        });
      });
      if (!best) return false;
      var cells = best.a === from ? [from] : chainTo(parent, from, best.a), path = cells && smoothPath(g(), cells, p.x, p.z, null);
      if (!path) return false;
      if (path.total < 0.05) { startSeat(p, best.ob, 'bench', p.nextAt - IDLE.slack - brain.now - HOP.benchOn - HOP.off); return true; }
      startPath(p, path, { type: 'bench', uid: best.ob.uid });
      return true;
    }
    function benchTaken(uid, self) {
      for (var k = 0; k < brain.pets.length; k++) {
        var q = brain.pets[k];
        if (q !== self && q.state === 'perform' && q.perf.uid === uid) return true;
        if (q !== self && q.goal && q.goal.uid === uid) return true;
      }
      return false;
    }

    /* ---------- seats: the trampoline and the bench ---------- */
    function seatOf(ob, kind) {
      var s = SEAT[kind];
      return { x: ob.x, y: ob.y + s.y, z: ob.z + s.z };
    }
    /* sit on a bench (an idle visit) from where the pet stands now — an adjacent cell */
    function startSeat(p, ob, kind, sitDur) {
      var pf = p.perf, s = seatOf(ob, kind);
      pf.kind = kind; pf.uid = ob.uid; pf.t0 = brain.now; pf.lead = HOP.benchOn; pf.runT0 = brain.now; pf.runDur = 0;
      pf.ax = p.x; pf.ay = p.y; pf.az = p.z; pf.sx = s.x; pf.sy = s.y; pf.sz = s.z;
      pf.hopT0 = brain.now; pf.sitUntil = brain.now + HOP.benchOn + Math.max(1, sitDur); pf.land = -1; pf.path = null;
      pf.face = SEAT.bench.face; pf.approach = cellOf(p.x, p.z); pf.fromIdle = true;
      p.state = 'perform'; p.action = kind; p.perfPhase = 'hopOn'; p.speed = 0;
      reserve(p, pf.approach);
    }
    function perform(kind, uid, petId) {
      var gr = g();
      if (!gr || brain.reduced || brain.mode !== 'play' || brain.danceOn) return -1;
      if (kind !== 'trampoline' && kind !== 'bench') return -1;
      var ob = gr.objects[uid];
      if (!ob && (uid == null || uid === kind)) {       /* given the item id instead of a uid: the first one */
        for (var k = 0; k < gr.items.length; k++) if (gr.items[k].id === kind) { ob = gr.items[k]; break; }
      }
      if (!ob || ob.id !== kind) return -1;
      var p = byId[petId || brain.activeId()] || null;
      if (!p) return -1;
      if (p.state === 'perform' && p.perf.uid === ob.uid) {
        var pf0 = p.perf;
        if (kind === 'bench') return p.perfPhase === 'run' || p.perfPhase === 'hopOn' ? Math.max(0, pf0.hopT0 + HOP.benchOn - brain.now) : 0;
        /* a re-tap restarts the act: bounce again from the mat now, or keep the run-over's landing time */
        if (p.perfPhase === 'bounce' || p.perfPhase === 'hopOff') { pf0.t0 = brain.now; pf0.lead = 0; pf0.land = -1; p.perfPhase = 'bounce'; placeOnSeat(p); return 0; }
        var landAt = (p.perfPhase === 'run' ? pf0.runT0 + pf0.runDur : pf0.hopT0) + HOP.on;
        pf0.t0 = brain.now; pf0.lead = clamp(landAt - brain.now, 0, BOUNCE.maxLead);
        return pf0.lead;
      }
      if (p.state === 'perform') finishSeat(p, true);
      /* the approach cell: a free side neighbour of the item, the shortest walk */
      var from = cellOf(p.x, p.z);
      if (from < 0) return -1;
      distMap(gr, from, null, dist, parent);
      var a = -1, bestD = Infinity;
      ob.adj.forEach(function (c) {
        if (res[c] >= 0 && res[c] !== p.index) return;
        var d = dist[c] + (kind === 'bench' && rowOf(c) !== ob.r + 1 ? 0.3 : 0);
        if (d < bestD) { bestD = d; a = c; }
      });
      var cells = null;
      if (a < 0) {                                       /* unreachable: the trampoline zips from a free side cell */
        if (kind === 'bench') return -1;                 /* a bench is only ever walked to */
        ob.adj.forEach(function (c) { if (a < 0 && (res[c] < 0 || res[c] === p.index)) a = c; });
        if (a < 0) return -1;
      } else cells = a === from ? [from] : chainTo(parent, from, a);
      if (kind === 'bench' && !cells) return -1;
      clearMotion(p);
      var pf = p.perf, s = seatOf(ob, kind), path = cells ? smoothPath(gr, cells, p.x, p.z, null) : null, len = path ? path.total : Infinity;
      pf.kind = kind; pf.uid = ob.uid; pf.t0 = brain.now; pf.land = -1;
      pf.sx = s.x; pf.sy = s.y; pf.sz = s.z; pf.face = kind === 'bench' ? SEAT.bench.face : null;
      var hopDur = kind === 'bench' ? HOP.benchOn : HOP.on, lead;
      if (kind === 'trampoline') {
        var runMax = BOUNCE.maxLead - hopDur;
        if (!path || len / WALK.zip > runMax) {
          /* too far for a 1.2 s run-over: a sparkle zip to the approach side, then a short dash */
          var x0 = p.x, y0 = p.y, z0 = p.z;
          var ax = centreX(a), az = centreZ(a), ddx = p.x - ax, ddz = p.z - az, dd = Math.sqrt(ddx * ddx + ddz * ddz) || 1;
          var back = Math.min(1.2, dd);
          var sx = ax + ddx / dd * back, sz = az + ddz / dd * back;
          if (!losClear(gr, sx, sz, ax, az, null, 0, -1)) { sx = ax; sz = az; }
          p.x = sx; p.z = sz; p.y = heightAt(gr, sx, sz);
          brain.events.push({ type: 'pop', id: p.id, x0: x0, y0: y0, z0: z0, x: p.x, y: p.y, z: p.z });
          path = finishPath([sx, ax], [sz, az], [cellOf(sx, sz), a], a);
          len = path.total;
        }
        var runDur = len < 0.05 ? 0 : clamp(len / WALK.run, 0.25, runMax);
        if (len / runDur > WALK.zip) runDur = len / WALK.zip;
        lead = clamp(runDur + hopDur, BOUNCE.minLead, BOUNCE.maxLead);
        runDur = lead - hopDur;
        pf.runDur = runDur;
      } else {
        if (!path) return -1;
        pf.runDur = len < 0.05 ? 0 : len / (WALK.speed * 1.4) + 0.2;
        lead = pf.runDur + hopDur;
        pf.sitUntil = brain.now + lead + 3.5 + rng() * 2;
      }
      pf.lead = lead; pf.path = path; pf.runT0 = brain.now; pf.hopT0 = brain.now + pf.runDur;
      pf.ax = centreX(a); pf.az = centreZ(a); pf.ay = heightAt(gr, pf.ax, pf.az);
      pf.approach = a; pf.fromIdle = false;
      if (pf.runDur <= 0) { pf.ax = p.x; pf.az = p.z; pf.ay = p.y; }
      p.state = 'perform'; p.action = kind; p.perfPhase = pf.runDur > 0 ? 'run' : 'hopOn';
      p.cruise = path ? Math.max(WALK.speed, path.total / Math.max(0.05, pf.runDur)) : WALK.speed;
      p.pathS = 0; p.seg = 1;
      reserve(p, a);
      return lead;
    }
    function placeOnSeat(p) {
      var pf = p.perf;
      p.x = pf.sx; p.z = pf.sz; p.y = pf.sy; p.onSeat = pf.kind; p.hop = 1;
    }
    /* the run-over profile: a quick ramp, then full speed into the hop */
    function runProfile(u) { var a = 0.15; u = clamp01(u); return u < a ? u * u / (2 * a * (1 - a / 2)) : (u - a / 2) / (1 - a / 2); }
    function performStep(p, dt) {
      var pf = p.perf, gr = g(), now = brain.now, ob = gr.objects[pf.uid];
      if (!ob) { finishSeat(p, true); return; }
      if (p.perfPhase === 'run') {
        var u = pf.runDur > 0 ? (now - pf.runT0) / pf.runDur : 1;
        if (u >= 1 || !pf.path) {
          /* the hop starts exactly at runT0 + runDur from the end of the path */
          if (pf.path) { samplePath(pf.path, pf.path.total, _sp, p.seg); pf.ax = _sp.x; pf.az = _sp.z; }
          else { pf.ax = p.x; pf.az = p.z; }
          pf.ay = heightAt(gr, pf.ax, pf.az);
          p.perfPhase = 'hopOn'; pf.hopT0 = pf.runT0 + pf.runDur;
        } else {
          var s = pf.path.total * runProfile(u);
          samplePath(pf.path, s, _sp, p.seg);
          p.seg = _sp.seg;
          var prevX = p.x, prevZ = p.z;
          p.x = _sp.x; p.z = _sp.z; p.y = heightAt(gr, p.x, p.z);
          var mv = Math.sqrt((p.x - prevX) * (p.x - prevX) + (p.z - prevZ) * (p.z - prevZ));
          p.speed = dt > 0 ? mv / dt : p.speed;
          if (mv > 1e-6) turnToward(p, Math.atan2(p.x - prevX, p.z - prevZ), WALK.turn * 2, dt);
          return;
        }
      }
      if (p.perfPhase === 'hopOn') {
        var dur = pf.kind === 'bench' ? HOP.benchOn : HOP.on, v = clamp01((now - pf.hopT0) / dur);
        p.hop = v; p.speed = 0; p.onSeat = '';
        p.x = pf.ax + (pf.sx - pf.ax) * v; p.z = pf.az + (pf.sz - pf.az) * v;
        p.y = pf.ay + (pf.sy - pf.ay) * v + HOP.h * arc(v);
        turnToward(p, Math.atan2(pf.sx - pf.ax, pf.sz - pf.az) || p.yaw, WALK.turn * 2, dt);
        if (v >= 1) {
          placeOnSeat(p);
          p.perfPhase = pf.kind === 'bench' ? 'sit' : 'bounce';
          brain.events.push({ type: 'land', id: p.id, kind: pf.kind, x: p.x, y: p.y, z: p.z });
        }
        return;
      }
      if (p.perfPhase === 'bounce') {
        placeOnSeat(p);
        bounceAt(now - pf.t0, pf.lead, _b);
        p.bounce = _b.petY; p.flip = _b.flip; p.y = pf.sy + _b.petY;
        turnToward(p, wrap(brain.camYaw + 0.6), WALK.turn, dt);
        if (_b.done) startHopOff(p);
        return;
      }
      if (p.perfPhase === 'sit') {
        placeOnSeat(p);
        turnToward(p, pf.face == null ? brain.camYaw : pf.face, WALK.turn, dt);
        if (now >= pf.sitUntil) startHopOff(p);
        return;
      }
      if (p.perfPhase === 'hopOff') {
        var w = clamp01((now - pf.hopT0) / HOP.off);
        p.hop = 1 - w; p.onSeat = ''; p.flip = 0; p.bounce = 0;
        p.x = pf.sx + (pf.lx - pf.sx) * w; p.z = pf.sz + (pf.lz - pf.sz) * w;
        p.y = pf.sy + (pf.ly - pf.sy) * w + HOP.h * arc(w);
        turnToward(p, Math.atan2(pf.lx - pf.sx, pf.lz - pf.sz) || p.yaw, WALK.turn * 2, dt);
        if (w >= 1) finishSeat(p, false);
      }
    }
    function startHopOff(p) {
      var pf = p.perf, gr = g(), ob = gr.objects[pf.uid], land = -1, bestD = Infinity;
      /* a free side cell: the front (+z) first, then the approach side, then the nearest free */
      if (ob) ob.adj.forEach(function (c) {
        if (res[c] >= 0 && res[c] !== p.index) return;
        var d = (rowOf(c) === ob.r + ob.h ? 0 : 1) + (Math.abs(centreX(c) - pf.ax) + Math.abs(centreZ(c) - pf.az) < 0.1 ? 0 : 0.5);
        if (d < bestD) { bestD = d; land = c; }
      });
      if (land < 0) land = nearestFree(gr, pf.sx, pf.sz, res, p.index, gr.largest);
      if (land < 0) { finishSeat(p, true); return; }
      pf.land = land; pf.lx = centreX(land); pf.lz = centreZ(land); pf.ly = heightAt(gr, pf.lx, pf.lz);
      pf.hopT0 = brain.now; p.perfPhase = 'hopOff';
      reserve(p, land);
    }
    function finishSeat(p, instant) {
      var pf = p.perf;
      if (instant && (p.onSeat || p.perfPhase === 'hopOn' || p.perfPhase === 'hopOff' || p.perfPhase === 'bounce' || p.perfPhase === 'sit')) {
        var gr = g(), l = pf.land >= 0 && freeFor(p, pf.land) ? pf.land : nearestFree(gr, p.x, p.z, res, p.index, gr.largest);
        if (l >= 0) { place(p, l); reserve(p, l); }
      }
      var fromIdle = pf.fromIdle;
      clearMotion(p);
      pf.approach = -1; pf.land = -1; pf.fromIdle = false;
      p.state = 'idle'; p.action = '';
      p.cell = cellOf(p.x, p.z);
      if (!freeFor(p, p.cell)) { var nf = nearestFree(g(), p.x, p.z, res, p.index, g().largest); if (nf >= 0) popTo(p, nf); }
      else reserve(p, p.cell);
      /* a tapped act rests the pet a moment; an idle bench visit keeps its 4–8 s slot */
      if (!fromIdle) p.nextAt = Math.max(p.nextAt, brain.now + 2 + 2 * rng());
    }

    /* ---------- dance break ---------- */
    function dance(on, o) {
      o = o || {};
      var gr = g();
      if (!on) {
        if (brain.danceOn) brain.pets.forEach(function (p) { if (p.state === 'dance') toIdle(p, 1 + rng() * 2); });
        brain.danceOn = false;
        return 0;
      }
      if (!gr || !brain.pets.length || brain.mode !== 'play') return 0;
      brain.danceOn = true; brain.danceReduced = brain.reduced;
      brain.pets.forEach(function (p) { if (p.state === 'perform') finishSeat(p, true); });
      if (brain.reduced) {
        brain.danceT0 = brain.now; brain.danceEnd = brain.now + DANCE.reducedDur;
        brain.pets.forEach(function (p) {
          clearMotion(p); p.state = 'dance'; p.action = 'dance'; p.danceSpot = p.cell;
          p.desiredYaw = brain.camYaw; p.hasDesired = true; p.faceCam = 1;
        });
        return DANCE.reducedDur;
      }
      var spots = danceSpots(gr, brain.pets.length, res), gather = 0;
      res.fill(-1);
      var left = brain.pets.slice();
      spots.forEach(function (sc) {
        var bi = -1, bd = Infinity;
        left.forEach(function (p, k) { var dx = p.x - centreX(sc), dz = p.z - centreZ(sc), d = dx * dx + dz * dz; if (d < bd) { bd = d; bi = k; } });
        if (bi < 0) return;
        var p = left.splice(bi, 1)[0];
        clearMotion(p);
        p.state = 'dance'; p.action = 'dance'; p.danceSpot = sc;
        reserve(p, sc);
        var here = cellOf(p.x, p.z), t = 0, path;
        if (here === sc) path = finishPath([p.x, centreX(sc)], [p.z, centreZ(sc)], [sc], sc);   /* just step to the centre */
        else path = planTo(p, sc, -1);
        if (path && path.total > 0.02) {
          /* time-driven, so everyone is on their spot by count 1 (no waiting on each other) */
          var cruise = Math.max(WALK.speed, path.total / (DANCE.gatherMax - 0.15));
          if (cruise > WALK.zip) { popTo(p, sc, 'pop'); p.state = 'dance'; p.action = 'dance'; p.danceSpot = sc; }
          else {
            p.path = path; p.pathS = 0; p.seg = 1; p.cruise = cruise;
            p.gatherT0 = brain.now; p.gatherDur = Math.max(0.2, path.total / cruise);
            t = p.gatherDur;
          }
        } else if (!path && here !== sc) { popTo(p, sc, 'pop'); p.state = 'dance'; p.action = 'dance'; p.danceSpot = sc; }
        else { p.x = centreX(sc); p.z = centreZ(sc); p.cell = sc; p.y = heightAt(gr, p.x, p.z); }
        gather = Math.max(gather, t);
      });
      left.forEach(function (p) {                       /* no spot (a full island): dance where it stands */
        clearMotion(p); p.state = 'dance'; p.action = 'dance'; p.danceSpot = cellOf(p.x, p.z);
        reserve(p, freeFor(p, p.danceSpot) ? p.danceSpot : -1);
      });
      gather = Math.min(DANCE.gatherMax, gather);
      var delay = alignDelay(gather, o.beat, o.bpm, o.perBar !== false);
      if (delay > gather + 4 * 60 / DANCE.bpm + 1e-6) delay = gather;      /* a stale clock never stalls the dance */
      brain.danceT0 = brain.now + delay;
      brain.danceEnd = brain.danceT0 + DANCE.dur + DANCE.hold;
      return brain.danceEnd - brain.now;
    }
    function danceStep(p, dt) {
      if (p.path) {
        var path = p.path, u = clamp01((brain.now - p.gatherT0) / p.gatherDur);
        samplePath(path, path.total * smooth01(u), _sp, p.seg);
        var mx = _sp.x - p.x, mz = _sp.z - p.z, mv = Math.sqrt(mx * mx + mz * mz);
        p.seg = _sp.seg; p.x = _sp.x; p.z = _sp.z; p.y = heightAt(g(), p.x, p.z); p.cell = cellOf(p.x, p.z);
        p.speed = dt > 0 ? mv / dt : 0;
        if (mv > 1e-6) turnToward(p, Math.atan2(mx, mz), WALK.turn * 2, dt); else p.omega = 0;
        if (u >= 1) { p.path = null; p.speed = 0; reserve(p, p.danceSpot); }
        return;
      }
      p.speed = 0;
      turnToward(p, brain.camYaw, WALK.turn, dt);
      if (brain.now >= brain.danceEnd) toIdle(p, 1.5 + rng() * 2);
    }

    /* ---------- the per-frame step ---------- */
    function stepPet(p, dt) {
      var now = brain.now;
      if (p.state === 'sit') { p.speed = 0; p.omega = 0; return; }
      if (now < p.pauseUntil && (p.state === 'walk' || p.state === 'idle' || p.state === 'act')) {
        p.speed = 0;
        if (p.hasDesired) turnToward(p, p.desiredYaw, WALK.turn, dt); else p.omega = 0;
        return;
      }
      switch (p.state) {
        case 'idle':
          p.speed = 0;
          if (p.hasDesired) turnToward(p, p.desiredYaw, WALK.turn, dt); else p.omega = 0;
          if (now >= p.nextAt && brain.mode === 'play' && !brain.danceOn) { p.hasDesired = false; decide(p); }
          break;
        case 'walk': follow(p, dt, p.cruise, WALK.accel); break;
        case 'act': actStep(p, dt); break;
        case 'perform': performStep(p, dt); break;
        case 'dance': danceStep(p, dt); break;
      }
    }
    function step(dt) {
      dt = typeof dt === 'number' && isFinite(dt) ? clamp(dt, 0, 0.25) : 0;
      brain.now += dt;
      if (!brain.graph) return false;
      if (brain.danceOn && brain.now >= brain.danceEnd) brain.danceOn = false;
      var moving = false;
      for (var k = 0; k < brain.pets.length; k++) {
        var p = brain.pets[k];
        stepPet(p, dt);
        if (p.speed > 0.001 || Math.abs(p.omega) > 0.001 || p.state === 'perform' || p.state === 'dance' || p.state === 'act') moving = true;
      }
      return moving;
    }

    /* ---------- sync: layout / pets / mode ---------- */
    function spawnCell(p, avoid) {
      var gr = g(), cand = [], ox = gr.avatar >= 0 ? gr.avatarX + 0.5 : 0, oz = gr.avatar >= 0 ? gr.avatarZ + 1 : 0;
      for (var i = 0; i < NCELL; i++) {
        if (!gr.walk[i] || res[i] >= 0) continue;
        if (gr.largest && gr.comp[i] !== gr.largest) continue;
        var dx = centreX(i) - ox, dz = centreZ(i) - oz, d = Math.sqrt(dx * dx + dz * dz);
        var near = 9;
        avoid.forEach(function (j) { var ex = centreX(i) - centreX(j), ez = centreZ(i) - centreZ(j); near = Math.min(near, Math.sqrt(ex * ex + ez * ez)); });
        if (near < 1.5) d += 6;
        cand.push({ i: i, d: d + rng() * 2.5 });
      }
      if (!cand.length) return nearestFree(gr, ox, oz, res, p.index, 0);
      cand.sort(function (a, b) { return a.d - b.d || a.i - b.i; });
      return cand[0].i;
    }
    function readInput(input) {
      input = input || {};
      var w = input.world || null, src = null;
      if (w && w.world && Array.isArray(w.world.placed)) src = w.world;          /* a view wrapping the world */
      else if (w && Array.isArray(w.placed)) src = w;
      else if (Array.isArray(input.placed) || input.land) src = input;
      if (!src) src = { placed: [] };
      if (!src.owned && !src.land && !Array.isArray(src.unlocked)) {
        var unlocked = (w && Array.isArray(w.unlocked)) ? w.unlocked : Array.isArray(input.unlocked) ? input.unlocked : null;
        if (unlocked) src = { placed: src.placed, unlocked: unlocked };
      }
      var mode = input.mode || (w && typeof w.mode === 'string' ? w.mode : null) || brain.mode || 'play';
      return { src: src, mode: mode, pets: Array.isArray(input.pets) ? input.pets : [], avatar: input.avatar, activePet: src.activePet || (w && w.activePet) || null };
    }
    function sync(input) {
      var r = readInput(input), out = { added: [], removed: [], popped: [] };
      var first = !brain.synced;
      brain.graph = buildGraph(r.src, { avatar: r.avatar === undefined ? undefined : r.avatar, C: Cx, G: Gx });
      var gr = brain.graph;
      /* the pet list: keep order, drop the gone, add the new */
      var ids = [], seen = {};
      r.pets.forEach(function (rec) {
        var id = typeof rec === 'string' ? rec : rec && rec.id;
        if (typeof id !== 'string' || seen[id]) return;
        seen[id] = 1; ids.push({ id: id, active: !!(rec && rec.active) || id === r.activePet });
      });
      brain.pets.filter(function (p) { return !seen[p.id]; }).forEach(function (p) { out.removed.push(p.id); delete byId[p.id]; });
      var next = [];
      ids.forEach(function (e, k) {
        var p = byId[e.id];
        if (!p) { p = newPet(e.id, k); p.isNew = true; byId[e.id] = p; out.added.push(e.id); }
        p.index = k; p.active = e.active;
        next.push(p);
      });
      if (next.length && !next.some(function (p) { return p.active; })) next[0].active = true;
      brain.pets = next;
      rebuildReservations();
      /* place new pets (spread out, near the house) */
      var taken = [];
      brain.pets.forEach(function (p) { if (!p.isNew && p.cell >= 0) taken.push(p.cell); });
      brain.pets.forEach(function (p) {
        if (!p.isNew) return;
        p.isNew = false;
        var i = spawnCell(p, taken);
        if (i < 0) return;
        place(p, i); reserve(p, i); taken.push(i);
        p.yaw = wrap(brain.camYaw + (rng() - 0.5) * 1.2);
        p.state = brain.mode === 'play' ? 'idle' : 'sit';
        p.nextAt = brain.now + IDLE.first + p.index * IDLE.stagger;
        if (!first) { brain.events.push({ type: 'spawn', id: p.id, x0: p.x, y0: p.y, z0: p.z, x: p.x, y: p.y, z: p.z }); }
      });
      /* validate everyone against the new layout */
      brain.pets.forEach(function (p) {
        if (p.state === 'perform') {
          var ob = gr.objects[p.perf.uid];
          if (!ob || ob.id !== p.perf.kind || Math.abs(ob.x - (p.perf.sx)) > 1e-6 || Math.abs(ob.z + SEAT[p.perf.kind].z - p.perf.sz) > 1e-6) finishSeat(p, true);
          else return;
        }
        var c = cellOf(p.x, p.z);
        if (c < 0 || !gr.walk[c]) {
          var nf = nearestFree(gr, p.x, p.z, res, p.index, gr.largest);
          if (nf >= 0) { popTo(p, nf); out.popped.push(p.id); if (brain.mode !== 'play') p.state = 'sit'; }
          return;
        }
        if (gr.compSize[gr.comp[c]] <= 1 && gr.compSize[gr.largest] > 1) {      /* fully enclosed */
          var nf2 = nearestFree(gr, p.x, p.z, res, p.index, gr.largest);
          if (nf2 >= 0 && nf2 !== c) { popTo(p, nf2); out.popped.push(p.id); if (brain.mode !== 'play') p.state = 'sit'; }
          return;
        }
        p.y = heightAt(gr, p.x, p.z);
        var path = p.path;
        if (p.state === 'dance' && p.danceSpot >= 0 && (!gr.walk[p.danceSpot] || (path && !pathValid(gr, path, p.pathS, null, c)))) {
          var ds = gr.walk[p.danceSpot] ? p.danceSpot : nearestFree(gr, centreX(p.danceSpot), centreZ(p.danceSpot), res, p.index, gr.largest);
          if (ds >= 0) { popTo(p, ds); p.state = 'dance'; p.action = 'dance'; p.danceSpot = ds; out.popped.push(p.id); }
          return;
        }
        if (path && p.state === 'walk') {
          var ok = gr.walk[path.target] && pathValid(gr, path, p.pathS, null, c) && (res[path.target] < 0 || res[path.target] === p.index);
          if (!ok) {
            var target = path.target;
            if (!gr.walk[target] || (res[target] >= 0 && res[target] !== p.index)) target = nearestFree(gr, centreX(target), centreZ(target), res, p.index, gr.comp[c]);
            var np = target >= 0 ? planTo(p, target, -1) : null;
            if (np && np.total > 0.05) { p.path = np; p.pathS = 0; p.seg = 1; reserve(p, target); }
            else toIdle(p, null);
          }
        }
      });
      setMode(r.mode);
      rebuildReservations();
      brain.synced = true;
      return out;
    }
    function setMode(mode) {
      mode = mode === 'edit' || mode === 'place' ? mode : 'play';
      if (mode === brain.mode) return;
      var wasPlay = brain.mode === 'play';
      brain.mode = mode;
      if (mode !== 'play') {
        if (brain.danceOn) dance(false);
        brain.pets.forEach(function (p) {
          if (p.state === 'perform') finishSeat(p, true);
          var c = cellOf(p.x, p.z);
          clearMotion(p);
          p.state = 'sit'; p.action = 'sit'; p.cell = c;
          reserve(p, freeFor(p, c) ? c : -1);
        });
      } else if (!wasPlay) {
        brain.pets.forEach(function (p, k) { if (p.state === 'sit') { p.state = 'idle'; p.action = ''; p.nextAt = brain.now + IDLE.first + k * IDLE.stagger; } });
      }
    }
    function setReduced(on) {
      on = !!on;
      if (on === brain.reduced) return;
      brain.reduced = on;
      if (on) {
        if (brain.danceOn) dance(false);
        brain.pets.forEach(function (p) {
          if (p.state === 'perform') finishSeat(p, true);
          if (p.state === 'walk' || p.state === 'act') toIdle(p, IDLE.first);
        });
      }
    }
    function tap(id) {
      var p = byId[id];
      if (!p) return '';
      var kind = p.species === 'pet_dragon' ? 'sparkle' : pick(EMOTES);
      p.happyUntil = brain.now + 2.5;
      if (!brain.reduced && (p.state === 'idle' || p.state === 'walk' || p.state === 'act')) {
        p.tapT = brain.now; p.pauseUntil = brain.now + 0.45;
        if (p.state !== 'walk') { p.desiredYaw = brain.camYaw; p.hasDesired = true; }
      } else if (brain.reduced) { p.desiredYaw = brain.camYaw; p.hasDesired = true; }
      return kind;
    }

    brain.sync = sync;
    brain.step = step;
    brain.tap = tap;
    brain.perform = perform;
    brain.dance = dance;
    brain.setMode = function (m) { setMode(m); };
    brain.setReduced = setReduced;
    brain.setShow = function (k) { brain.show = clamp01(+k || 0); };
    brain.pet = function (id) { return byId[id] || null; };
    brain.activeId = function () {
      for (var k = 0; k < brain.pets.length; k++) if (brain.pets[k].active) return brain.pets[k].id;
      return brain.pets.length ? brain.pets[0].id : null;
    };
    brain.reservations = function () { return res; };
    brain.danceInfo = function (out) { return danceAt(brain.danceOn ? brain.now - brain.danceT0 : -1, brain.danceReduced, out); };
    brain.glance = function (out) { return glanceAt(brain.now, seed, out); };
    return brain;
  }

  return {
    VERSION: VERSION, COLS: COLS, ROWS: ROWS,
    WALK: WALK, IDLE: IDLE, HOP: HOP, SEAT: SEAT, BOUNCE: BOUNCE, DANCE: DANCE, GLANCE: GLANCE, ACTIONS: ACTIONS, PLAY: PLAY,
    create: create,
    buildGraph: buildGraph, astar: astar, distMap: distMap, smoothPath: smoothPath, pathValid: pathValid, samplePath: samplePath,
    losClear: losClear, heightAt: heightAt, nearestFree: nearestFree, danceSpots: danceSpots, danceAt: danceAt,
    alignDelay: alignDelay, glanceAt: glanceAt, bounceAt: bounceAt, makeRng: makeRng, hash: hash,
    cellIndex: cellIndex, cellOf: cellOf, centreX: centreX, centreZ: centreZ, keyOf: keyOf, parseKey: parseKey, wrap: wrap
  };
}));
