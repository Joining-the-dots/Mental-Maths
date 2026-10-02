/* ================================================================
   My Island 3D — home models (classic script; THREE only through K).
   Island architecture chunk 5. Registers, through
   SL3D.defineModels('home', factory):
     house_cottage                          the 2×2 home, assembled from cached sub-parts
     wall_* · roof_* · door_* · detail_*    every CATALOG home style; SL3D.make(styleId, st)
                                            previews that style on the player's own house
                                            (photocards), using SLIslandLook.resolveStyle
   In Node, module.exports is the pure layer below (no THREE): style
   resolution, layouts, budgets and the idle/act timelines (tests).

   THE HOUSE (item space: pivot at the footprint centre, base y = 0, facing +z;
   everything stays inside ±0.93 so the 2×2 footprint keeps its 0.07 margin)
     body    slab 1.6 × 1.1 × 1.3 set 0.15 back, LOCKED wall colour, a 6%-darker
             skirting band, step, oval door mat, dark doorway behind the door,
             2 windows (ink frame + ink muntins, 'state' glass that glows at Showtime)
     door    0.42 × 0.62 arch on the 'door' pivot (hinge on its left edge); door_gold is
             the GOLD matcap and throws 2 sparkle glints every 4 s
     roofs   red tile / blue slate / candy share the gable prism (ridge 2.3, overhang)
             with soft rolled edges; red has chunky raised tile rows, blue thin flat
             slates, candy white icing rolls + 12 drips + 24 sprinkles + a cherry;
             thatch is a fluffy straw loaf on a thick lip with a straw-tuft fringe;
             castle is a flat crenellated roof with 2 cone turrets (h 2.9)
     details window boxes · smoking chimney (3 CPU puffs, lilac at Showtime) ·
             fairy lights (11 bulbs: soft twinkle by day, beat chase ≤ 2 Hz at
             Showtime, with halos) · rooftop flag (CPU flutter; hidden with the castle)

   TEMPLATE PARTS (≤ 6; static materials: toon + state)
     shell  toon, ink outline (MID/HIGH), casts shadows   body, roof masses, chimney…
     trim   toon, no hull                                 small bits (rows, sprinkles, flowers…)
     window state, stateColor 'windowGlow' (Window → Window Glow)
     door   toon | gold, pivot 'door', ink outline
     bulb   state, perCopy  — fairy-light bulbs, CPU vertex colours
     anim   toon,  perCopy  — chimney puffs + flag pennant, CPU positions/colours
   Pivots (always present): door (hinge), emitter (chimney top), flag (pole top),
   glow (fairy-light centre). Anchors: top, door, spot (the avatar's entrance spot),
   bulb0…bulb10 (with lights). perCopy parts carry their vertex layout in
   geometry.userData.slHome, so a cloned copy knows its own puffs/bulbs.

   HANDLERS {build, idle, act, show, animated, handle} (one shared set for every id)
     idle(a)        CPU puffs / pennant / bulbs, gold-door glints; returns true when it
                    moved something. Reads a.t, a.dt, a.phase, a.reduced, a.show, a.bpm.
     act(a, name)   'home' opens the door 70° (0.3 s), holds, and swings it back by itself
                    after HOLD s; 'homeClose' closes it from wherever it is (send it when
                    the style sheet closes); 'homeSwing' = open, short hold, close.
                    → {name, dur, update(a, tAct) → alive, cancel()}; fires its SLMotion
                    cues ('pop', 'unlock', 3 hearts at the 'door' anchor).
     show(a, k)     a.state('windowGlow', k) and refreshes the bulb/smoke colours.
     animated(st | stateKey) → true when the copy needs idle ticks.
     handle(obj, o) a minimal handle for an Object3D from SL3D.make (photocards / lab).
   The handle is read defensively: copy geometry via a.copyGeometry(part) |
   a.geometry(part) | a.batch.copyGeometry(a.uid, part) | a.object.userData.meshes;
   the style via a.stateKey | a.st | a.template | a.batch.template | a.object.userData;
   pivot(name) may return the documented {set(rotDeg, pos, scale)}, an Object3D or
   the batch's Matrix4.
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

  var VERSION = 1;
  var HOME = 'house_cottage';
  var DEFAULTS = { wall: 'wall_cream', roof: 'roof_red', door: 'door_blue' };
  var WALLS = ['wall_cream', 'wall_pink', 'wall_mint', 'wall_sky', 'wall_lilac'];
  var ROOFS = ['roof_red', 'roof_blue', 'roof_thatch', 'roof_candy', 'roof_castle'];
  var DOORS = ['door_blue', 'door_red', 'door_green', 'door_gold'];
  var DETAILS = ['detail_chimney', 'detail_flag', 'detail_lights', 'detail_windowbox'];
  var STYLE_IDS = WALLS.concat(ROOFS, DOORS, DETAILS);
  var PARTS = ['shell', 'trim', 'window', 'door', 'bulb', 'anim'];

  /* ---------------- dimensions (u, item space) ---------------- */
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

  /* triangle budgets (MID/HIGH; world-look BUDGET + per-style tris), read live when SLIslandLook is loaded */
  var BUDGET = {
    house: 3500, body: 1000, door: 150,
    roof: { roof_red: 1000, roof_blue: 1000, roof_thatch: 1000, roof_candy: 1000, roof_castle: 1200 },
    detail: { detail_windowbox: 300, detail_chimney: 400, detail_lights: 400, detail_flag: 120 }
  };

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
  function slotOf(id) { var m = /^(wall|roof|door|detail)_/.exec(String(id || '')); return m ? m[1] : null; }

  /* the resolved house style for a build: {wall, roof, door, details[]} (sorted; the
     rooftop flag dropped under the castle). Same rules as SLIslandLook.resolveStyle,
     which wins when it is loaded; a style id previews itself on the house. */
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
      door: pick(st.door, DOORS, DEFAULTS.door), details: detailList(st.details)
    };
    var slot = slotOf(id);
    if (slot === 'detail') { if (DETAILS.indexOf(id) >= 0 && s.details.indexOf(id) < 0) s.details = s.details.concat([id]).sort(); }
    else if (slot && STYLE_IDS.indexOf(id) >= 0) s[slot] = id;
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
    var s = { wall: pick(r.wall, WALLS, DEFAULTS.wall), roof: pick(r.roof, ROOFS, DEFAULTS.roof), door: pick(r.door, DOORS, DEFAULTS.door), details: detailList(r.details) };
    if (s.roof === 'roof_castle') s.details = s.details.filter(function (d) { return d !== 'detail_flag'; });
    return s;
  }
  /* 'wall|roof|door|d:a,b' → state (memoised; null when it isn't a house key) */
  var keyMemo = {};
  function parseKey(k) {
    if (typeof k !== 'string') return null;
    if (own(keyMemo, k)) return keyMemo[k];
    var p = k.split('|'), out = null;
    if (p.length === 4 && p[3].slice(0, 2) === 'd:') {
      out = fixState({ wall: p[0], roof: p[1], door: p[2], details: p[3].slice(2) ? p[3].slice(2).split(',') : [] });
    }
    keyMemo[k] = out;
    return out;
  }
  function stateKeyOf(s) { return s.wall + '|' + s.roof + '|' + s.door + '|d:' + s.details.join(','); }
  /* does a copy in this style need idle ticks? (smoke, flag, lights, gold glints) */
  function animated(stOrKey) {
    var s = typeof stOrKey === 'string' ? parseKey(stOrKey) : (stOrKey && stOrKey.wall ? fixState(stOrKey) : homeState(HOME, stOrKey));
    if (!s) return false;
    return s.door === 'door_gold' || s.details.some(function (d) { return d !== 'detail_windowbox'; });
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
  /* colour token for (look id, part); '$slot' resolved from the state */
  function tokenFor(id, part, fallback, st) {
    var L = Look(), e = L && L.LOOK && L.LOOK[id];
    var t = e && e.colors && typeof e.colors[part] === 'string' ? e.colors[part] : fallback;
    if (t.indexOf('$') >= 0) t = t.replace(/\$(\w+)/g, function (_, s) { return (st && st[s]) || DEFAULTS[s] || s; });
    return t;
  }

  /* ---------------- layouts (all in item space) ---------------- */
  function roofTop(roof) {
    if (roof === 'roof_castle') return CASTLE.top;
    if (roof === 'roof_candy') return GABLE.apex + 0.055 + 0.135;   /* the cherry */
    return 2.3;
  }
  /* chimney on the right slope; the castle's sits on the flat roof */
  function chimneyAt(roof) {
    var c = roof === 'roof_castle' ? { x: 0.35, z: -0.4, y0: 1.1, top: 1.85 }
      : roof === 'roof_thatch' ? { x: 0.56, z: -0.3, y0: 1.5, top: 2.25 }
        : { x: 0.5, z: -0.3, y0: 1.3, top: 2.15 };
    c.w = 0.22; c.cap = 0.1;
    c.emitter = [c.x, c.top + c.cap, c.z];
    return c;
  }
  function flagAt(roof) {
    if (roof === 'roof_castle') return null;
    return { x: FLAG.x, z: FLAG.z, y0: FLAG.y0, top: FLAG.top, w: FLAG.w, h: FLAG.h, pivot: [FLAG.x, FLAG.top, FLAG.z] };
  }
  /* the fairy-light swag across the front, just under the roof's front edge */
  function lightsAt(roof) {
    return { x: LIGHTS.x, y: roof === 'roof_castle' ? 1.03 : 1.0, z: roof === 'roof_thatch' || roof === 'roof_castle' ? 0.6 : 0.62, sag: LIGHTS.sag };
  }
  /* a point on the two-scallop swag at x (attached at -X, 0, +X) */
  function swagY(L, x) {
    var s = (x + L.x) / L.x, f = s - Math.floor(s);
    if (s >= 2) f = 0;
    var b = 4 * f * (1 - f);
    return [x, L.y - L.sag * b, L.z + 0.012 * b];
  }
  function swag(roof, nWire, nBulbs) {
    var L = lightsAt(roof), wire = [], bulbs = [], i;
    nWire = nWire || LIGHTS.wire; nBulbs = nBulbs || LIGHTS.n;
    for (i = 0; i <= nWire; i++) wire.push(swagY(L, -L.x + 2 * L.x * i / nWire));
    for (i = 0; i < nBulbs; i++) {
      var p = swagY(L, -LIGHTS.span + 2 * LIGHTS.span * i / (nBulbs - 1));
      bulbs.push([p[0], p[1] - LIGHTS.hang, p[2]]);
    }
    return { wire: wire, bulbs: bulbs, centre: [0, L.y - L.sag / 2, L.z] };
  }
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
  function drips() {
    var out = [], lens = [0.08, 0.12, 0.06, 0.1, 0.07, 0.11, 0.05, 0.09, 0.12, 0.06, 0.1, 0.08], k = 0;
    [-1, 1].forEach(function (side) {
      [0.22, 0.5, 0.78].forEach(function (t) {
        var h = lens[k++], y = GABLE.eave + (GABLE.apex - GABLE.eave) * t - 0.035;
        out.push({ p: [side * GABLE.w * (1 - t), y - h / 2, GABLE.zf + 0.03], h: h });
      });
      [0.4, 0.1, -0.2].forEach(function (z) {
        var h = lens[k++];
        out.push({ p: [side * GABLE.w, GABLE.eave - 0.035 - h / 2, z], h: h });
      });
    });
    return out;
  }
  /* the anchor heights and hit box for a state */
  function topOf(s) {
    var y = roofTop(s.roof);
    if (s.details.indexOf('detail_flag') >= 0 && flagAt(s.roof)) y = Math.max(y, FLAG.top + 0.03);
    if (s.details.indexOf('detail_chimney') >= 0) y = Math.max(y, chimneyAt(s.roof).emitter[1]);
    return y;
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
      var g = LIGHTS.groups, local = ((t * hz - i) % g + g) % g;
      show = 0.4 + 0.6 * (local < 1 ? Math.sin(Math.PI * local) : 0);
    }
    k = clamp01(num(k));
    return day + (show - day) * k;
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
    var _e = new THREE.Euler(), _s3 = new THREE.Vector3();

    /* ---------------- small geometry helpers (all output is G geometry) ---------------- */
    function R(Kt, n) { return Kt.tier === 'LOW' ? Math.max(3, Math.round(n * 0.7)) : n; }
    function paint(G, g, token, tn) { return G.paint(g, token, tn); }
    /* a plain box (radius 0: 12 tris) */
    function box(G, w, h, d, p, token, tn) { return paint(G, G.t(G.slab(w, h, d, 0), { p: p }), token, tn); }
    /* rotate the primitive's +y onto dir, then move its centre to pos */
    function aim(g, dir, pos) {
      _v.set(dir[0], dir[1], dir[2]).normalize();
      _q.setFromUnitVectors(_up, _v);
      _p.set(pos[0], pos[1], pos[2]);
      g.applyMatrix4(_m.compose(_p, _q, _one));
      return g;
    }
    /* a round rod (tube) between two points */
    function rod(Kt, r, a, b, radial) {
      var dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      var g = Kt.G.tube(r, len, { radial: R(Kt, radial || 8) });
      return aim(g, [dx, dy, dz], [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]);
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
    function emptyParts() { return { shell: [], trim: [], window: [], door: [], bulb: [], anim: [], meta: {} }; }

    /* ---------------- BODY (per wall colour) ---------------- */
    function bodyParts(Kt, wall) {
      var G = Kt.G, o = emptyParts(), st = { wall: wall };
      var wallT = tokenFor(HOME, 'wall', 'WALL.$wall', st), inkT = tokenFor(HOME, 'muntin', 'Ink');
      var body = G.t(G.slab(BODY.w, BODY.h, BODY.d), { p: [0, BODY.h / 2, BODY.z] });
      G.paintBy(body, function (v) { return v.y < BODY.skirt ? [wallT, BODY.skirtTone] : wallT; }, { perFace: true });
      o.shell.push(body);
      o.shell.push(box(G, 0.56, DOOR.y0, 0.18, [0, DOOR.y0 / 2, BODY.front + 0.09], tokenFor(HOME, 'step', 'Step')));
      /* oval door mat on the ground in front of the step */
      var matT = tokenFor(HOME, 'mat', 'Plank');
      var mat = G.t(G.tube(0.2, 0.012, { radial: R(Kt, 12) }), { s: [1.2, 1, 0.55], p: [0, 0.006, 0.8] });
      o.trim.push(G.paintBy(mat, function (v) { return v.ny > 0.5 ? matT : [matT, 'shade']; }, { perFace: true }));
      /* the dark doorway behind the door (seen when it swings open) */
      var rectH = DOOR.h - DOOR.w / 2;
      o.trim.push(box(G, DOOR.w, rectH, 0.006, [0, DOOR.y0 + rectH / 2, BODY.front + 0.003], inkT, 'shade'));
      o.trim.push(paint(G, G.t(G.tube(DOOR.w / 2, 0.006, { radial: R(Kt, 12) }), { r: [90, 0, 0], p: [0, DOOR.y0 + rectH, BODY.front + 0.003] }), inkT, 'shade'));
      /* two windows: ink frame, glowing glass, ink muntins, a light sill */
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

    /* ---------------- DOORS ---------------- */
    function doorParts(Kt, door) {
      var G = Kt.G, o = emptyParts();
      var doorT = tokenFor(door, 'door', 'DOOR.' + door), knobT = tokenFor(door, 'knob', 'Star Gold');
      var rectH = DOOR.h - DOOR.w / 2, zc = DOOR.z0 + DOOR.t / 2;
      var slab = G.t(G.slab(DOOR.w, rectH, DOOR.t, 0), { p: [0, DOOR.y0 + rectH / 2, zc] });
      o.door.push(G.paintBy(slab, function (v) { return v.nz > 0.5 ? doorT : [doorT, 'shade']; }, { perFace: true }));
      var arch = G.t(G.tube(DOOR.w / 2, DOOR.t - 0.002, { radial: R(Kt, 12) }), { r: [90, 0, 0], p: [0, DOOR.y0 + rectH, zc] });
      o.door.push(G.paintBy(arch, function (v) { return v.nz > 0.5 ? doorT : [doorT, 'shade']; }, { perFace: true }));
      o.door.push(paint(G, G.t(G.puff(0.032), { p: [0.13, DOOR.y0 + 0.26, DOOR.z0 + DOOR.t + 0.014] }), knobT));
      var L = Look(), e = L && L.LOOK && L.LOOK[door];
      o.meta.mat = e && e.mats && e.mats.door ? e.mats.door : (door === 'door_gold' ? 'gold' : 'toon');
      return o;
    }

    /* ---------------- ROOFS ---------------- */
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
      var sp = { s1: 'Star Gold', s2: 'Splash Blue', s3: 'Leaf Mint', s4: 'Grape', s5: 'Cloud White' };
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
    var ROOF_BUILD = { roof_red: roofRed, roof_blue: roofBlue, roof_thatch: roofThatch, roof_candy: roofCandy, roof_castle: roofCastle };

    /* ---------------- DETAILS ---------------- */
    function windowBoxes(Kt) {
      var G = Kt.G, o = emptyParts(), id = 'detail_windowbox';
      var boxT = tokenFor(id, 'box', 'Bark'), f = [tokenFor(id, 'f1', 'Rose Deep'), tokenFor(id, 'f2', 'Star Gold'), tokenFor(id, 'f3', 'Tulip Pink')];
      [-1, 1].forEach(function (sx) {
        var x = sx * WIN.x, top = WIN.y - WIN.h / 2 - 0.035;
        var planter = G.t(G.slab(0.38, 0.09, 0.11, 0), { p: [x, top - 0.045, BODY.front + 0.055] });
        o.shell.push(G.paintBy(planter, function (v) { return v.ny > 0.5 ? [boxT, 'shade'] : boxT; }, { perFace: true }));
        [-0.11, 0, 0.11].forEach(function (dx, i) {
          var fl = G.t(G.tube(0.045, 0.03, { radial: R(Kt, 8) }), { r: [90, 0, 0], p: [x + dx, top + (i === 1 ? 0.045 : 0.025), BODY.front + 0.085] });
          o.trim.push(paint(G, fl, f[i]));
        });
      });
      return o;
    }
    function chimney(Kt, roof) {
      var G = Kt.G, o = emptyParts(), id = 'detail_chimney', c = chimneyAt(roof);
      var bodyT = tokenFor(id, 'chimney', 'Chimney'), capT = tokenFor(id, 'cap', 'Chimney Cap'), smokeT = tokenFor(id, 'smoke', 'Smoke');
      var stack = G.t(G.slab(c.w, c.top - c.y0, c.w, 0), { p: [c.x, (c.top + c.y0) / 2, c.z] });
      o.shell.push(G.paintBy(stack, function (v) { return v.nx > 0.5 ? [bodyT, 'shade'] : bodyT; }, { perFace: true }));
      o.shell.push(box(G, c.w + 0.08, c.cap, c.w + 0.08, [c.x, c.top + c.cap / 2, c.z], capT));
      /* 3 puffs at their reduced-motion rest pose; idle() moves them on the CPU */
      var puffs = [], tmp = {};
      for (var i = 0; i < SMOKE.n; i++) {
        smokeAt(0, i, SMOKE.n, 0, true, tmp);
        var ctr = [c.emitter[0] + tmp.x, c.emitter[1] + SMOKE.r + tmp.y, c.emitter[2] + tmp.z];
        var g = paint(G, G.t(G.puff(SMOKE.r), { s: tmp.s, p: ctr }), smokeT);
        o.anim.push(g);
        puffs.push({ c: ctr, s: tmp.s, count: g.getAttribute('position').count });
      }
      o.meta.smoke = { puffs: puffs, emitter: c.emitter.slice(), token: smokeT, tint: showTint(id) };
      return o;
    }
    function showTint(id) {
      var L = Look(), e = L && L.LOOK && L.LOOK[id], tint = e && e.show && e.show.tint;
      return tint && typeof tint.token === 'string' ? tint.token : 'Iridescent Rim';
    }
    function fairyLights(Kt, roof) {
      var G = Kt.G, o = emptyParts(), id = 'detail_lights', low = Kt.tier === 'LOW';
      var sw = swag(roof, low ? 12 : LIGHTS.wire, LIGHTS.n), tokens = [];
      o.trim.push(paint(G, G.ribbon(sw.wire, 0.011, { segments: low ? 12 : 16 }), tokenFor(id, 'wire', 'Ink')));
      var fb = ['Star Gold', 'Coral', 'Splash Blue', 'Leaf Mint', 'Grape'], counts = [];
      sw.bulbs.forEach(function (p, i) {
        var tk = tokenFor(id, 'b' + (i % 5 + 1), fb[i % 5]);
        var g = paint(G, G.t(G.tube(0.018, 0.026, 0.05, { radial: R(Kt, 6) }), { p: p }), tk);
        o.bulb.push(g);
        tokens.push(tk); counts.push(g.getAttribute('position').count);
      });
      var L = Look(), e = L && L.LOOK && L.LOOK[id], halo = e && e.show && e.show.halo;
      o.meta.lights = {
        n: sw.bulbs.length, tokens: tokens, counts: counts, pos: sw.bulbs, centre: sw.centre,
        halo: { token: halo && halo.token || 'Butter', size: halo && halo.size || 0.25 }
      };
      return o;
    }
    function rooftopFlag(Kt, roof) {
      var G = Kt.G, o = emptyParts(), id = 'detail_flag', f = flagAt(roof);
      if (!f) return o;
      var poleT = tokenFor(id, 'pole', 'Ink'), penT = tokenFor(id, 'pennant', 'Star Gold');
      o.trim.push(paint(G, G.t(G.tube(0.014, f.top - f.y0, { radial: R(Kt, 6) }), { p: [f.x, (f.top + f.y0) / 2, f.z] }), poleT));
      o.trim.push(paint(G, G.t(G.tube(0.026, 0.03, { radial: R(Kt, 6) }), { p: [f.x, f.top + 0.015, f.z] }), penT));
      /* a two-sided pennant tapering to a point; the CPU flutter bends it in z */
      var cloth = G.flag(f.w, f.h, 6, 1), x0 = f.x + 0.014, yc = f.top - 0.02 - f.h / 2;
      var pa = cloth.getAttribute('position').array;
      for (var i = 0; i < pa.length; i += 3) pa[i + 1] *= 1 - 0.92 * clamp01(pa[i] / f.w);
      G.t(cloth, { p: [x0, yc, f.z] });
      o.anim.push(paint(G, cloth, penT));
      o.meta.cloth = { x0: x0, w: f.w, count: cloth.getAttribute('position').count };
      return o;
    }
    function detailParts(Kt, d, roof) {
      if (d === 'detail_windowbox') return windowBoxes(Kt);
      if (d === 'detail_chimney') return chimney(Kt, roof);
      if (d === 'detail_lights') return fairyLights(Kt, roof);
      if (d === 'detail_flag') return rooftopFlag(Kt, roof);
      return emptyParts();
    }
    /* sub-parts that depend on the roof shape are cached per roof */
    function detailKey(d, roof) { return d === 'detail_windowbox' ? 'home:' + d : 'home:' + d + ':' + roof; }

    /* ---------------- ASSEMBLY: the template for one (id, style, tier) ---------------- */
    function houseLook() {
      var L = Look();
      return (L && L.LOOK && L.LOOK[HOME]) || { h: 2.3, tris: BUDGET.house };
    }
    function buildHome(ctx) {
      var Kt = ctx.K, tier = Kt.tier, s = homeState(ctx.id, ctx.st);
      var P = Kt.parts;
      var body = P.get('home:body:' + s.wall, tier, function (k) { return bodyParts(k, s.wall); });
      var roof = P.get('home:roof:' + s.roof, tier, function (k) { return ROOF_BUILD[s.roof](k); });
      var door = P.get('home:door:' + s.door, tier, function (k) { return doorParts(k, s.door); });
      var dets = s.details.map(function (d) { return P.get(detailKey(d, s.roof), tier, function (k) { return detailParts(k, d, s.roof); }); });
      var lists = emptyParts();
      [body, roof].concat(dets).forEach(function (src) {
        PARTS.forEach(function (name) { if (src[name] && src[name].length) lists[name] = lists[name].concat(src[name]); });
      });
      /* the house template, whatever id asked for it: a style preview is a whole house,
         so it is checked against the house's budget and footprint */
      var hctx = {
        id: ctx.id, look: houseLook(), st: ctx.st, stateKey: ctx.stateKey, tier: tier, G: Kt.G,
        col: ctx.col, fp: [2, 2], K: Kt
      };
      var b = Kt.template(hctx);
      b.part('shell', lists.shell, 'toon', { outline: true, castShadow: true });
      b.part('trim', lists.trim, 'toon', { castShadow: false });
      b.part('window', lists.window, 'state', {
        stateColor: { key: 'windowGlow', off: tokenFor(HOME, 'window', 'Window'), on: tokenFor(HOME, 'windowGlow', 'Window Glow'), initial: 0 }
      });
      b.part('door', door.door, door.meta.mat, { pivot: 'door', outline: true });
      if (lists.bulb.length) b.part('bulb', lists.bulb, 'state', { perCopy: true });
      if (lists.anim.length) b.part('anim', lists.anim, 'toon', { perCopy: true });
      /* pivots (always all four, so a handler never writes an unknown one) */
      var ch = chimneyAt(s.roof), fl = flagAt(s.roof) || flagAt('roof_red'), lt = swag(s.roof);
      b.pivot('door', [DOOR.hinge, 0, DOOR.z0]);
      b.pivot('emitter', ch.emitter);
      b.pivot('flag', fl.pivot);
      b.pivot('glow', lt.centre);
      /* anchors */
      var top = topOf(s);
      b.anchor('top', [0, top + 0.15, 0]);
      b.anchor('door', [0, DOOR.y0 + 0.3, BODY.front + 0.12]);
      b.anchor('spot', SPOT);
      var lightMeta = null, smokeMeta = null, clothMeta = null;
      dets.forEach(function (d) {
        if (d.meta.lights) lightMeta = d.meta.lights;
        if (d.meta.smoke) smokeMeta = d.meta.smoke;
        if (d.meta.cloth) clothMeta = d.meta.cloth;
      });
      if (lightMeta) lightMeta.pos.forEach(function (p, i) { b.anchor('bulb' + i, p); });
      b.hit([2, Math.max(0.8, roofTop(s.roof)), 2]);
      var tpl = b.done();
      /* vertex layouts for the CPU-animated copies (travel with geometry clones) */
      tpl.parts.forEach(function (p) {
        if (p.name === 'bulb' && lightMeta) p.geo.userData.slHome = { bulbs: layoutBulbs(lightMeta) };
        if (p.name === 'anim') p.geo.userData.slHome = layoutAnim(smokeMeta, clothMeta);
      });
      return tpl;
    }
    function layoutBulbs(m) {
      var starts = [], at = 0;
      m.counts.forEach(function (c) { starts.push(at); at += c; });
      return { n: m.n, tokens: m.tokens.slice(), starts: starts, counts: m.counts.slice(), halo: m.halo };
    }
    function layoutAnim(smoke, cloth) {
      var out = {}, at = 0;
      if (smoke) {
        out.smoke = { token: smoke.token, tint: smoke.tint, emitter: smoke.emitter.slice(), puffs: smoke.puffs.map(function (p) { var o = { start: at, count: p.count, c: p.c.slice(), s: p.s }; at += p.count; return o; }) };
      }
      if (cloth) { out.cloth = { start: at, count: cloth.count, x0: cloth.x0, w: cloth.w }; at += cloth.count; }
      return out;
    }

    /* ================================================================
       HANDLERS
       ================================================================ */
    var colCache = new Map();
    function colOf(token) { var c = colCache.get(token); if (!c) { c = K0.col(token); colCache.set(token, c); } return c; }
    var rt = new WeakMap();                  /* copy geometry → {base, lastK, still} */
    /* per-copy memory keyed by uid (or, for handle(obj), by the Object3D, held weakly) */
    function store() {
      var m = new Map(), w = new WeakMap();
      function of(k) { return k !== null && typeof k === 'object' ? w : m; }
      return {
        get: function (k) { return of(k).get(k); }, set: function (k, v) { of(k).set(k, v); },
        has: function (k) { return of(k).has(k); }, delete: function (k) { of(k).delete(k); }
      };
    }
    var doorDeg = store();                   /* current door angle (for restarts and homeClose) */
    var showOf = store();                    /* last window glow written: {sk: style, k} */
    var haloOn = store();                    /* bulb halos currently on */
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
        var pos = geo.getAttribute('position');
        r = { base: new Float32Array(pos.array), lastK: -1, still: '' };
        rt.set(geo, r);
      }
      return r;
    }
    /* write a pivot rotation (about its origin) through whatever the handle hands back:
       the documented {set(rotDeg, pos, scale)}, the batch's Matrix4, or an Object3D node */
    function setPivot(a, name, rot) {
      var p = null;
      try { p = typeof a.pivot === 'function' ? a.pivot(name) : null; } catch (e) { p = null; }
      if (!p) return;
      if (p.isMatrix4) {
        _e.set(rot[0] * DEG, rot[1] * DEG, rot[2] * DEG, 'XYZ');
        p.compose(_p.set(0, 0, 0), _q.setFromEuler(_e), _s3.set(1, 1, 1));
      } else if (p.isObject3D) p.rotation.set(rot[0] * DEG, rot[1] * DEG, rot[2] * DEG);
      else if (typeof p.set === 'function') p.set(rot, [0, 0, 0], [1, 1, 1]);
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
    /* fairy-light bulbs: per-bulb vertex colour = its colour × brightness; halos at Showtime */
    function lights(geo, a, t, k, phase, reduced) {
      var meta = geo.userData && geo.userData.slHome && geo.userData.slHome.bulbs;
      if (!meta) return false;
      var r = runtime(geo), sig = reduced ? 'r' + Math.round(k * 100) : '';
      var hz = a.bpm > 0 ? a.bpm / 60 : SHOW_BEAT_HZ, key = keyOf(a);
      var haloWanted = k > 0.02 && typeof a.halo === 'function';
      if (!(sig && r.still === sig)) {
        var col = geo.getAttribute('color'), ca = col.array;
        for (var b = 0; b < meta.n; b++) {
          var c = colOf(meta.tokens[b]), L = bulbLevel(t, b, k, hz, phase, reduced);
          var cr = c.r * L, cg = c.g * L, cb = c.b * L;
          for (var v = meta.starts[b], e = v + meta.counts[b]; v < e; v++) { ca[v * 3] = cr; ca[v * 3 + 1] = cg; ca[v * 3 + 2] = cb; }
          if (haloWanted) call(a, 'halo', 'bulb' + b, true, meta.halo.size * k * (0.5 + 0.5 * L), meta.halo.token);
        }
        col.needsUpdate = true;
        r.still = sig;
      }
      if (haloWanted) haloOn.set(key, true);
      else if (haloOn.get(key)) {
        for (var h = 0; h < meta.n; h++) call(a, 'halo', 'bulb' + h, false, 0, meta.halo.token);
        haloOn.delete(key);
      }
      return !reduced;
    }
    /* the window glow follows the Showtime mix; remembered per (uid, style) so a restyle
       (a fresh batch for the same uid) is lit again straight away */
    function windowGlow(a, k) {
      var key = keyOf(a), sk = styleKey(a), last = showOf.get(key);
      if (last && last.sk === sk && Math.abs(last.k - k) < 0.002) return;
      setState(a, 'windowGlow', k);
      showOf.set(key, { sk: sk, k: k });
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
      if (bulb) moved = lights(bulb, a, t, k, ph, reduced) || moved;
      var s = styleOf(a);
      if (s && s.door === 'door_gold') {
        var g = glintAt(t, num(a.dt), ph, reduced);
        if (g >= 0) call(a, 'emit', 'sparkle', GLINT.pos[g], 1, { token: 'Gold Light', size: 0.2 });
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
      if (bulb) lights(bulb, a, t, k, ph, reduced);
    }
    /* the door act → {name, dur, update(a, tAct) → alive, cancel()} */
    function act(a, name) {
      if (!a) return null;
      if (name !== 'homeClose' && name !== 'homeSwing') name = 'home';
      var key = keyOf(a), reduced = !!a.reduced, from = doorDeg.get(key) || 0;
      if (name === 'homeClose' && !(from > 0.01)) { setPivot(a, 'door', [0, 0, 0]); return null; }
      var M = Motion(), cues = [];
      if (name !== 'homeClose' && M && typeof M.cues === 'function') { try { cues = M.cues('home', { reduced: reduced }); } catch (e) { cues = []; } }
      var fired = 0, pose = {}, dead = false;
      return {
        name: name, dur: doorDur(name, reduced),
        update: function (a2, tAct) {
          if (dead) return false;
          a2 = a2 || a;
          doorAt(name, tAct, from, reduced, pose);
          setPivot(a2, 'door', [0, -pose.deg, 0]);
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
        pivot: function (n) { return (ud.pivots && ud.pivots[n]) || null; },
        state: function (k2, v) { if (typeof ud.setState === 'function') ud.setState(k2, v); },
        emit: o.emit || null, sfx: o.sfx || null, halo: o.halo || null
      };
    }

    var handlers = { build: buildHome, idle: idle, act: act, show: show, animated: animated, handle: handle };
    var out = {};
    homeIds().forEach(function (id) {
      var h = {};
      for (var k in handlers) h[k] = handlers[k];
      out[id] = h;
    });
    return out;
  }

  return {
    VERSION: VERSION, HOME: HOME, WALLS: WALLS, ROOFS: ROOFS, DOORS: DOORS, DETAILS: DETAILS, STYLE_IDS: STYLE_IDS,
    PARTS: PARTS, BODY: BODY, WIN: WIN, DOOR: DOOR, GABLE: GABLE, LIP: LIP, LOAF: LOAF, CASTLE: CASTLE,
    SMOKE: SMOKE, LIGHTS: LIGHTS, FLAG: FLAG, GLINT: GLINT, HOLD: HOLD, SPOT: SPOT, BUDGET: BUDGET, MAX_HZ: MAX_HZ,
    factory: factory,
    /* pure helpers */
    homeState: homeState, parseKey: parseKey, stateKeyOf: stateKeyOf, animated: animated, homeIds: homeIds,
    budgetOf: budgetOf, tokenFor: tokenFor, roofTop: roofTop, topOf: topOf, chimneyAt: chimneyAt, flagAt: flagAt,
    lightsAt: lightsAt, swag: swag, tufts: tufts, sprinkles: sprinkles, drips: drips, slope: slope, onSlope: onSlope,
    hash: hash, rng: rng, doorAt: doorAt, doorDur: doorDur, smokeAt: smokeAt, bulbLevel: bulbLevel, glintAt: glintAt, clothAt: clothAt
  };
}));
