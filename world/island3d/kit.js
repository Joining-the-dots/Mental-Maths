/* ================================================================
   My Island 3D — the shared kit K (classic script; THREE is injected).
   window.SLKit in the browser, require() in Node (pure helpers only
   work there without THREE). stage.js calls SLKit.create(THREE, opts)
   once and hands out SL3D.kit(tier) → K. This file owns the K contract
   (island-architecture.json → modelFactoryApi); other chunks request
   changes rather than editing it.

   K (one per tier; materials, textures and caches are shared by all tiers)
     K.THREE, K.tier, K.outlines (tier allows hulls), K.uniforms (the ONE shared rim/outline uniforms)
     K.col(token) → THREE.Color      token from SLIslandLook PALETTE / LOCKED / ART2D / EXTRA only
     K.hex(token) → '#RRGGBB'; K.tone(token, 'base'|'shade'|'hi'|±n) → Color; K.has(token)
     K.rgb('#hex') → Color           RUNTIME colours only (the child's member colour) — never catalogue art
     K.G                             geometry kit bound to the tier (see makeG below)
     K.mat(key)                      'toon' | 'gold' | 'chrome' | 'pearl' | 'smoked' | 'gunmetal' | 'foil'
                                     (matcaps, one program) | 'glass' | 'neon:<Token>' | 'glow:<Token>' |
                                     'state' | 'led' | 'sign' | 'blob' (one instanced basic + map program, which
                                     the avatar's emoji face shares) | 'ink' | 'outline[:w]' | 'line[:Token]'
     K.variant(key, name, patch)     a cached sibling material (e.g. a transparent ghost) sharing the program
     K.ctx(id, st, stateKey?)        the ctx given to build(): {id, look, st, stateKey, tier, G, col, fp, K}
     K.template(ctx)                 → TemplateBuilder: .part() .pivot() .anchor() .hit() .done() → Template
     K.batch(template, opts)         → ItemBatch (instanced, one InstancedMesh per part; opts.merge: a merger)
     K.merger(opts)                  → the merged layer (perf): every eligible part of every batch that joins it
                                     draws in one rigid-skinned mesh per material — the island's item draw
                                     calls stop growing with the island (see MERGED LAYER)
     K.instantiate(template, opts)   → THREE.Group (a ready-to-add copy, used by SL3D.make)
     K.templates.get(id, stateKey, tier, st) / K.parts.get(key, tier, fn)   memo caches
     K.placeholder(ctx)              a rounded slab of the look height in the item's base colour
     K.stateKey(id, st)              SLIslandLook.stateKey, or the documented fallback
     K.facet(geo)                    bake flat per-face normals (faceted rocks and canopies, no extra program)
     K.ledAtlas()                    the ONE shared 512×256 LED screen texture: 8 programs (LED_PROGRAMS), each a
                                     256×64 strip holding two periods of a 128-px pattern; a screen shows a 128×64
                                     window and scrolls it by UV offset only (view(p, phase) → a texture clone that
                                     shares the Source; setWindow(tex, p, phase) moves it). setUser({name, color})
                                     redraws only the name cell. Never redrawn per frame.
     K.signAtlas()                   the ONE shared 512×256 sign texture: SIGN_WORDS in cells 0–6 and the child's
                                     first name + initial in cell 7 (rect(word) → UV rect; view(word) → a clone);
                                     Unbounded 800 once document.fonts has it (Outfit / system-ui until then).
                                     A word outside SIGN_WORDS throws in QA mode and draws nothing otherwise.
     K.tex.{ramp, halo, blob, sparkles, matcap, emojiFace, banner, fontReady, release}, K.ATLAS
     K.billboards(opts), K.blobs(capacity)   base pools for halos/particles and blob shadows (the blobs carry white
                                     instance colours: they draw with the LED / sign program)
     K.setRim(color, strength), K.setShow(k), K.setOutlines(on), K.setSelPulse(p), K.setGrid({baseY})
     K.issues (QA log), K.dispose()

   OUTLINES (v2): only OUTLINE_KINDS (pets, accessories, the avatar) keep an ink hull, at
   K.OUTLINE_CHAR (0.009 u) in Midnight Ink. Architecture has none: a part flagged outline on a
   house, building or attraction gets the edit SELECTION hull only (Star Gold, 0.02 ↔ 0.03 u with
   K.setSelPulse), drawn just for copies with setHighlight(uid, 1|2). LOW has no hulls at all.

   GEOMETRY CONVENTION: every G builder returns a NON-indexed BufferGeometry
   with exactly position, normal and a 'color' attribute (uv dropped), so any
   mix merges. Primitives are centred on the origin except drop() (base at
   y = 0) and flag() (pole edge at x = 0). Template parts are authored in ITEM
   space (pivot at the footprint centre, base y = 0, facing +z); a pivot's
   animation is applied about its origin.
   ================================================================ */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SLKit = api;
}(typeof self !== 'undefined' ? self : typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var VERSION = 2;
  var DEG = Math.PI / 180;
  var OUTLINE_W = 0.02;            /* the selection hull's base width (pulses to SEL_W[1]) */
  var OUTLINE_CHAR = 0.009;        /* character hulls (pets, accessories, avatar) */
  var SEL_W = [0.02, 0.03];        /* selection hull width range (world-look MATERIAL.outline.pulse) */
  var TEMPLATE_CAP = 120;          /* LRU trim beyond this many cached templates */
  var UNKNOWN_HEX = '#CFC8DC';     /* Pebble: what an unknown token renders as (logged in QA) */
  var TIERS = ['LOW', 'MID', 'HIGH'];

  /* ---------------- inline fallback palette ----------------
     Used ONLY when world/world-look.js (SLIslandLook) is not loaded, so the
     kit still works standalone. Values copied from the art bible palette and
     the locked 2D colours in world/world-art.js. */
  var FALLBACK = {
    PALETTE: {
      'Ink': '#3B2F4A', 'Ink Deep': '#2B2140', 'Cloud White': '#FFFFFF', 'Grass Top': '#8EE07A',
      'Grass Alt': '#84D872', 'Grass Side': '#5FBF55', 'Tuft Green': '#4FA94A', 'Meadow Hill': '#A6E88A',
      'Sand': '#F3DC9A', 'Cove Sand': '#F7E3A6', 'Wet Sand': '#E8C77E', 'Sea Shallow': '#7FE3F0',
      'Sea Deep': '#2F8FD8', 'Foam': '#F2FCFF', 'Sky Day Top': '#8FD3FF', 'Sky Day Mid': '#CDEBFF',
      'Sky Day Horizon': '#FFE3F1', 'Sky Night Top': '#1A1240', 'Sky Night Mid': '#3B1E6E',
      'Sky Night Horizon': '#FF7AC8', 'Stage Night': '#130C2E', 'Neon Pink': '#FF4FB8',
      'Neon Cyan': '#3DF2FF', 'Neon Violet': '#A66BFF', 'Neon Lime': '#B6FF5C', 'Star Gold': '#FFD23F',
      'Coral': '#FF6B6B', 'Splash Blue': '#4FC3F7', 'Leaf Mint': '#7BD88F', 'Grape': '#C38BFF',
      'Bubblegum': '#FF8FC8', 'Primary Pink': '#FF5FA2', 'Butter': '#FFE27A', 'Lamp Warm': '#FFE36B',
      'Window Glow': '#FFE9A8', 'Bark': '#9B6B43', 'Plank': '#C48A52', 'Pebble': '#CFC8DC',
      'Gold Base': '#F0C02F', 'Gold Light': '#FFE89A', 'Gold Deep': '#C9921A', 'Chrome': '#DDE3F0',
      'Iridescent Rim': '#C7B8FF', 'Holo Pink': '#FFB3E6', 'Holo Blue': '#B3E5FF', 'Holo Mint': '#C9FFE5',
      'Holo Lemon': '#FFF3B3', 'Rim Showtime': '#FF7AD9', 'Blush': '#FF9DB8', 'Success': '#2ECC71',
      'Error': '#E74C3C', 'Blob Shadow': '#3B2F4A'
    },
    LOCKED: {
      WALL: { wall_cream: '#f7e6c4', wall_pink: '#f9b7cc', wall_mint: '#b8ecd6', wall_sky: '#a9d6f7', wall_lilac: '#d6bdf2',
              wall_concrete: '#a9a5b3', wall_gallery: '#eceaf2', wall_graphite: '#34303f', wall_midnight: '#232a57' },
      DOOR: { door_blue: '#3b7dd8', door_red: '#d94b4b', door_green: '#38a85c', door_gold: '#f0c02f', door_glass: '#1b2438' },
      ROOF: { roof_red: ['#e0574f', '#c4433c'], roof_blue: ['#4a6fa5', '#3a5888'], roof_thatch: ['#e3b24f', '#c99634'], roof_candy: ['#ff8fb8', '#f06d9e'] },
      PETCOL: {
        pet_puppy: { body: '#e3b077', dark: '#b8834f', light: '#f6d9b3', nose: '#3b2f4a' },
        pet_kitten: { body: '#f0a35e', dark: '#c97834', light: '#fde2c6', nose: '#e86a8a' },
        pet_bunny: { body: '#f4f0ea', dark: '#d8cfc4', light: '#ffffff', nose: '#f08aa6' },
        pet_dragon: { body: '#5fc97a', dark: '#3a9a58', light: '#b9f0c6', nose: '#2e6b40' }
      },
      KARTS: { kart_red: '#e94b4b', kart_blue: '#3b7dd8', kart_lime: '#7ed957', kart_gold: '#f0c02f', kart_unicorn: '#ff8fd0' },
      BALLS: { ball_classic: ['#ffffff', '#3b2f4a'], ball_rainbow: ['#ff6b6b', '#4fc3f7'], ball_planet: ['#c38bff', '#ffd23f'], ball_gold: ['#ffd23f', '#e0a81c'] },
      STADIA: { stadium_day: ['#7ecbff', '#6ac46a'], stadium_night: ['#2b2a5e', '#3f9a4a'], stadium_beach: ['#ffe0a0', '#7fd0a0'], stadium_snow: ['#dfeeff', '#bfe6c8'] },
      THEME: { course_meadow: ['#7bd88f', '#ffd23f'], course_beach: ['#f3dc9a', '#4fc3f7'], course_snow: ['#e8f4ff', '#7fb3ff'], course_candy: ['#ffb6d5', '#c38bff'] }
    }
  };

  /* ================================================================
     PURE HELPERS (no THREE; exported for Node tests)
     ================================================================ */
  function normHex(v) {
    if (typeof v !== 'string') return null;
    var s = v.trim();
    if (/^#[0-9a-f]{3}$/i.test(s)) s = '#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
    return /^#[0-9a-f]{6}$/i.test(s) ? s.toUpperCase() : null;
  }
  function hexOf(v) {
    if (typeof v === 'string') return normHex(v);
    if (v && typeof v === 'object' && !Array.isArray(v) && typeof v.hex === 'string') return normHex(v.hex);
    return null;
  }
  /* the bible stores the palette as [{name, hex}]; world-look as {name: hex} — accept both */
  var mapCache = typeof WeakMap === 'function' ? new WeakMap() : null;
  function asMap(t) {
    if (!Array.isArray(t)) return t;
    if (mapCache && mapCache.has(t)) return mapCache.get(t);
    var m = {};
    t.forEach(function (e) { if (e && e.name) m[e.name] = e.hex; });
    if (mapCache) mapCache.set(t, m);
    return m;
  }
  /* 'WALL.wall_cream', 'PETCOL.pet_puppy.body', 'ROOF.roof_red[1]', 'ROOF/roof_red/0' */
  function walk(table, token) {
    if (!table || typeof table !== 'object') return null;
    var h = hexOf(table[token]);
    if (h) return h;
    var parts = token.replace(/\[(\w+)\]/g, '.$1').split(/[./]/);
    if (parts.length < 2) return null;
    var cur = table;
    for (var i = 0; i < parts.length && cur != null; i++) cur = cur[parts[i]];
    return hexOf(cur);
  }
  /* 'wall_cream' → LOCKED.WALL.wall_cream (one level deep, string values only) */
  function shallow(table, token) {
    if (!table || typeof table !== 'object') return null;
    for (var k in table) {
      var sub = table[k];
      if (sub && typeof sub === 'object' && !Array.isArray(sub)) {
        var h = hexOf(sub[token]);
        if (h) return h;
      }
    }
    return null;
  }
  function caseless(table, token) {
    if (!table) return null;
    var lt = token.toLowerCase();
    for (var k in table) if (k.toLowerCase() === lt) { var h = hexOf(table[k]); if (h) return h; }
    return null;
  }
  var RESOLVER_FNS = ['hex', 'resolve', 'resolveToken', 'tokenHex', 'colorHex'];
  /* resolve a colour token against a look module ({PALETTE, LOCKED, ART2D, EXTRA}
     plus an optional resolver function). Returns '#RRGGBB' or null. */
  function resolveHex(L, token) {
    if (!L || typeof token !== 'string' || !token) return null;
    var i, h;
    for (i = 0; i < RESOLVER_FNS.length; i++) {
      var f = L[RESOLVER_FNS[i]];
      if (typeof f === 'function') {
        try { h = hexOf(f.call(L, token)); } catch (e) { h = null; }
        if (h) return h;
      }
    }
    var pal = asMap(L.PALETTE);
    var tables = [pal, L.LOCKED, L.ART2D, L.EXTRA];
    for (i = 0; i < tables.length; i++) { h = walk(tables[i], token); if (h) return h; }
    h = shallow(L.LOCKED, token) || shallow(L.ART2D, token) || shallow(L.EXTRA, token);
    if (h) return h;
    return caseless(pal, token);
  }

  /* stateKey fallback, matching the documented format (world-look.js owns the real one):
     house 'wall|roof|door|d:<sorted details>' (detail_flag dropped under roof_castle), plus
     '|s:<shape>|v:<0|1>' for every shape but the cottage (the default shape is the City loft);
     att_course course; att_pitch ball|stadium; att_kart kart; pets hat|neck|face|back;
     city buildings 'v:<0..2>'. */
  function detailList(d) {
    var out = [];
    if (Array.isArray(d)) out = d.filter(function (x) { return typeof x === 'string'; });
    else if (d && typeof d === 'object') out = Object.keys(d).filter(function (k) { return !!d[k]; });
    return out.sort();
  }
  function clampTrim(v, n) { var x = v | 0; return x < 0 ? 0 : x > n - 1 ? n - 1 : x; }
  function fallbackStateKey(id, st) {
    st = st || {};
    if (id === 'house_cottage') {
      var roof = st.roof || 'roof_red';
      var det = detailList(st.details).filter(function (k) { return !(roof === 'roof_castle' && k === 'detail_flag'); });
      var key = [st.wall || 'wall_cream', roof, st.door || 'door_blue', 'd:' + det.join(',')].join('|');
      var shape = typeof st.shape === 'string' && st.shape ? st.shape : 'shape_loft';
      return shape === 'shape_cottage' ? key : key + '|s:' + shape + '|v:' + clampTrim(st.variant, 2);
    }
    if (/^bld_/.test(id)) return 'v:' + clampTrim(st.variant, 3);
    if (id === 'att_course') return st.course || 'course_meadow';
    if (id === 'att_pitch') return (st.ball || 'ball_classic') + '|' + (st.stadium || 'stadium_day');
    if (id === 'att_kart') return st.kart || 'kart_red';
    if (/^pet_/.test(id)) {
      var a = st.acc || {};
      return ['hat', 'neck', 'face', 'back'].map(function (k) { return a[k] || '-'; }).join('|');
    }
    return '';
  }
  function parseTier(t) { var u = typeof t === 'string' ? t.toUpperCase() : ''; return TIERS.indexOf(u) >= 0 ? u : null; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hasDoc() { return typeof document !== 'undefined' && !!document && typeof document.createElement === 'function'; }
  function qaDefault() { try { return !!(root.localStorage && root.localStorage.getItem('slQaMode') === '1'); } catch (e) { return false; } }

  /* default lathe profile for drop(): normalised [x/r, y/h], a round-tipped teardrop */
  var DROP_PROFILE = [[0, 0], [0.55, 0.02], [0.9, 0.12], [1, 0.3], [0.93, 0.5], [0.72, 0.7], [0.4, 0.88], [0, 1]];

  /* sparkle atlas: 4×4 cells of 64², drawn white and tinted per instance */
  var ATLAS = { sparkle: 0, heart: 1, note: 2, star: 3, dot: 4, ring: 5, rect: 6, petal: 7, snow: 8, bubble: 9, puff: 10, circle: 11, curl: 12, diamond: 13, plus: 14, tri: 15 };
  var ATLAS_CELLS = 4;

  /* ---------------- v2 look constants (world-look wins when it is loaded) ---------------- */
  var RAMP = [64, 128, 200, 255];                           /* MATERIAL.toonRamp */
  var BEVEL = { arch: 0.05, archMax: 0.06, organic: 0.18 }; /* MATERIAL.bevel */
  var OUTLINE_KINDS_FALLBACK = { pet: 1, acc: 1, avatar: 1 };
  var SIGN_WORDS_FALLBACK = ['ENCORE', 'SHOWTIME', 'ON AIR', 'PHOTO', 'DANCE', 'PET COURSE', 'ISLAND'];
  /* matcap stops (spec/centre → edge) and the atlas colours, as hexes for a kit without world-look */
  var MATCAP_FALLBACK = {
    smoked: ['#8FB7FF', '#2A3B5C', '#1B2438', '#0E1626'],
    gunmetal: ['#E6E9F2', '#7C8194', '#5A5F72', '#2A2D3A'],
    foil: ['#FF7AD9', '#7AD7FF', '#9DFFCF', '#FFE27A']
  };
  var NEON_FALLBACK = { 'Neon Magenta': '#FF2E9A', 'LED Cyan': '#22E4FF', 'Electric Violet': '#8A5CFF', 'Laser Lime': '#C6FF3D',
                        'Midnight Ink': '#14101F', 'Night Zenith': '#0B0A1F', 'Bone White': '#F4F2FA' };

  function rampFrom(L) {
    var r = L && L.MATERIAL && L.MATERIAL.toonRamp, ok = r && r.length === 4;
    for (var i = 0; ok && i < 4; i++) ok = typeof r[i] === 'number' && r[i] >= 0 && r[i] <= 255 && (i === 0 || r[i] >= r[i - 1]);
    return ok ? [r[0] | 0, r[1] | 0, r[2] | 0, r[3] | 0] : RAMP.slice();
  }
  function bevelFrom(L) {
    var b = L && L.MATERIAL && L.MATERIAL.bevel;
    return b && b.arch > 0 && b.archMax > 0 ? b : BEVEL;
  }
  /* the crisp architecture bevel: arch × the smallest side, capped at archMax */
  function archRadius(w, h, d, bevel) {
    var b = bevel || BEVEL;
    return Math.min(b.arch * Math.min(w, h, d), b.archMax);
  }

  /* ---------------- LED screen atlas layout (pure) ----------------
     512×256, 2 columns × 4 rows of 256×64 strips. Each strip holds two periods of a 128-px
     pattern, so a 128×64 window slides across it by UV offset alone and wraps seamlessly. */
  var LED_PROGRAMS = ['eq', 'wave', 'spark', 'gradient', 'stars', 'encore', 'showtime', 'name'];
  var LED = { w: 512, h: 256, stripW: 256, cellW: 128, cellH: 64, cols: 2 };
  function ledIndex(p) {
    var i = typeof p === 'number' ? Math.floor(p) : LED_PROGRAMS.indexOf(p);
    return i >= 0 && i < LED_PROGRAMS.length ? i : -1;
  }
  /* the strip of program p in canvas pixels (top-left origin), or null */
  function ledCell(p) {
    var i = ledIndex(p);
    return i < 0 ? null : { x: (i % LED.cols) * LED.stripW, y: Math.floor(i / LED.cols) * LED.cellH, w: LED.stripW, h: LED.cellH };
  }
  /* the window of program p at phase (0..1 of its 128-px period) as texture repeat/offset
     (flipY: v = 0 at the canvas bottom) */
  function ledWindow(p, phase, out) {
    out = out || {};
    var c = ledCell(p) || ledCell(0), ph = +phase || 0, f = ph - Math.floor(ph);
    out.rx = LED.cellW / LED.w; out.ry = LED.cellH / LED.h;
    out.ox = (c.x + f * LED.cellW) / LED.w; out.oy = 1 - (c.y + LED.cellH) / LED.h;
    return out;
  }

  /* ---------------- sign atlas layout (pure) ----------------
     512×256, 8 cells of 256×64: cells 0–6 = SIGN_WORDS in order; cell 7 = the child's first
     name (x 0–191) and initial (x 192–255). Nothing else is ever drawn into a texture. */
  var SIGN = { w: 512, h: 256, cellW: 256, cellH: 64, cols: 2, userCell: 7, nameW: 192 };
  /* the pixel rect for a whitelisted word, ':name' or ':initial'; null for anything else */
  function signCell(word, words) {
    words = words || SIGN_WORDS_FALLBACK;
    var i, x0 = 0, w = SIGN.cellW;
    if (word === ':name') { i = SIGN.userCell; w = SIGN.nameW; }
    else if (word === ':initial') { i = SIGN.userCell; x0 = SIGN.nameW; w = SIGN.cellW - SIGN.nameW; }
    else { i = typeof word === 'string' ? words.indexOf(word.trim().toUpperCase()) : -1; if (i >= SIGN.userCell) i = -1; }
    if (i < 0) return null;
    return { cell: i, x: (i % SIGN.cols) * SIGN.cellW + x0, y: Math.floor(i / SIGN.cols) * SIGN.cellH, w: w, h: SIGN.cellH };
  }
  function signRect(word, words) {
    var c = signCell(word, words);
    return c ? { u0: c.x / SIGN.w, u1: (c.x + c.w) / SIGN.w, v0: 1 - (c.y + c.h) / SIGN.h, v1: 1 - c.y / SIGN.h } : null;
  }
  /* true for an allowed word; otherwise throws when strict (QA mode), else false */
  function checkSignWord(word, words, strict) {
    if (signCell(word, words)) return true;
    if (strict) throw new Error('SLKit: "' + word + '" is not a sign word (SIGN_WORDS, :name, :initial only)');
    return false;
  }
  /* the child's first name as drawn on signs and screens: letters only, upper case, ≤ 12 */
  function signName(name) {
    var first = String(name == null ? '' : name).trim().split(/\s+/)[0] || '';
    return first.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ'\-]/g, '').toUpperCase().slice(0, 12).replace(/['\-]+$/, '');
  }
  function signInitial(name) { var m = /[A-ZÀ-ÖØ-Þ]/.exec(signName(name)); return m ? m[0] : ''; }

  /* ---------------- placement variety maths (pure) ---------------- */
  /* SLIslandLook.jitter2 {yaw, sx, sy, sz, lean, leanAxis, tint: {l, h}} or the v1 {yaw, scale}
     → {yaw, sx, sy, sz, lean, leanAxis (degrees), tl (lightness ×), th (hue tilt °)};
     scales are always positive (never a mirror) */
  function normJitter(j, out) {
    out = out || {};
    function num(v) { return typeof v === 'number' && isFinite(v) ? v : 0; }
    function pos(v, d) { return typeof v === 'number' && isFinite(v) && v > 0 ? v : d; }
    var s = pos(j && j.scale, 1), t = j && j.tint;
    out.yaw = num(j && j.yaw); out.sx = pos(j && j.sx, s); out.sy = pos(j && j.sy, s); out.sz = pos(j && j.sz, s);
    out.lean = num(j && j.lean); out.leanAxis = num(j && j.leanAxis);
    out.tl = pos(t && t.l, 1); out.th = num(t && t.h);
    return out;
  }
  /* the copy's rotation: yaw about +y, then a lean about the horizontal axis at leanAxis° round
     +y (three.js convention) → quaternion [x, y, z, w] */
  function jitterQuat(yawDeg, leanDeg, axisDeg, out) {
    out = out || [0, 0, 0, 1];
    var hy = (yawDeg || 0) * DEG / 2, hl = (leanDeg || 0) * DEG / 2, a = (axisDeg || 0) * DEG;
    var sy = Math.sin(hy), cy = Math.cos(hy), sl = Math.sin(hl), cl = Math.cos(hl);
    var x1 = Math.cos(a) * sl, z1 = -Math.sin(a) * sl;
    out[0] = x1 * cy - z1 * sy; out[1] = cl * sy; out[2] = x1 * sy + z1 * cy; out[3] = cl * cy;
    return out;
  }
  /* the per-copy colour multiplier: lightness × l with a warm/cool tilt of h degrees (+ leans a
     green toward yellow, − toward blue: about a ±5° hue shift on foliage) */
  function tintMul(l, h, out) {
    out = out || [1, 1, 1];
    var m = l > 0 ? l : 1, k = 0.012 * (h || 0);
    out[0] = m * (1 + k); out[1] = m; out[2] = m * (1 - k);
    return out;
  }

  /* ---------------- shader program families (≤ 12 programs on LOW) ----------------
     Every K.mat key maps to a family; keys in one family share one compiled program. The v2
     matcaps join the v1 matcap family; the LED / sign atlases, the emoji face (an
     InstancedMesh(1) since perf) and the blob shadows (instance colour + alphaTest + a
     pre-tone-mapped colour) all share the instanced basic + map program. */
  var PROGRAM_FAMILY = {
    toon: 'toon', gold: 'matcap', chrome: 'matcap', pearl: 'matcap', smoked: 'matcap', gunmetal: 'matcap', foil: 'matcap',
    glass: 'matcap-transparent', neon: 'basic', ink: 'basic', glow: 'basic-additive', state: 'basic-vertex',
    led: 'basic-map', sign: 'basic-map', emoji: 'basic-map', blob: 'basic-map', line: 'line', outline: 'outline'
  };
  /* three's NeutralToneMapping (Khronos PBR Neutral) of a linear colour at an exposure: what a
     tone-mapped material shows, so a toneMapped:false one can show the same colour (the blob
     shadows join the toneMapped:false map program this way) */
  var BLOB_EXPOSURE = 1.05;        /* the golden hour preset's exposure (Showtime's 1.10 moves a 22% blob < 0.1%) */
  function neutralTone(rgb, exposure, out) {
    out = out || [0, 0, 0];
    var e = exposure > 0 ? exposure : 1, r = rgb[0] * e, g = rgb[1] * e, b = rgb[2] * e;
    var x = Math.min(r, g, b), off = x < 0.08 ? x - 6.25 * x * x : 0.04;
    r -= off; g -= off; b -= off;
    var peak = Math.max(r, g, b), start = 0.8 - 0.04;
    if (peak >= start) {
      var d = 1 - start, np = 1 - d * d / (peak + d - start), k = 1 - 1 / (0.15 * (peak - np) + 1);
      r = r * np / peak; g = g * np / peak; b = b * np / peak;
      r += (np - r) * k; g += (np - g) * k; b += (np - b) * k;
    }
    out[0] = r; out[1] = g; out[2] = b;
    return out;
  }
  function programFamily(key) {
    var b = String(key || 'toon').split(':')[0];
    return Object.prototype.hasOwnProperty.call(PROGRAM_FAMILY, b) ? PROGRAM_FAMILY[b] : null;
  }

  /* ================================================================
     create(THREE, opts) → hub {kit(tier), dispose(), setOutlines(), setShow(), …}
     opts: {addons: {RoundedBoxGeometry, BufferGeometryUtils}, look: fn|object,
            models: {id: {build, idle, act, show}} (live map), qa, baseY(x, y, fp)}
     ================================================================ */
  function create(THREE, opts) {
    if (!THREE || !THREE.BufferGeometry) throw new Error('SLKit.create needs the THREE namespace');
    opts = opts || {};
    var addons = opts.addons || {};
    var RoundedBox = addons.RoundedBoxGeometry || null;
    var lookFn = typeof opts.look === 'function' ? opts.look : function () { return opts.look || root.SLIslandLook || null; };
    var qa = opts.qa != null ? !!opts.qa : qaDefault();

    var hub = { issues: [], models: opts.models || {}, outlinesOn: true, show: 0 };
    var seen = {};
    function warn(msg) {
      if (seen[msg]) return;
      seen[msg] = 1;
      hub.issues.push(msg);
      if (qa && typeof console !== 'undefined') console.warn('[SL3D kit] ' + msg);
    }

    /* scratch objects: nothing below allocates in a per-frame path */
    var _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _base = new THREE.Matrix4(), _w = new THREE.Matrix4();
    var _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
    var _jit = {}, _jq = [0, 0, 0, 1];         /* jitter scratch (normJitter / jitterQuat) */
    var _c = new THREE.Color(), _hsl = { h: 0, s: 0, l: 0 };
    var Y_AXIS = new THREE.Vector3(0, 1, 0);
    var ZERO = new THREE.Matrix4().set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1);
    var SINK = new THREE.Matrix4();            /* writes to unknown pivots land here */

    /* ---------------- colours ---------------- */
    var hexCache = new Map(), lookRef;
    function lookNow() {
      var L = null;
      try { L = lookFn(); } catch (e) { L = null; }
      if (L !== lookRef) { lookRef = L; hexCache.clear(); }
      return L;
    }
    function tryHex(token) {
      if (token && token.isColor) return '#' + token.getHexString().toUpperCase();
      var L = lookNow();
      if (hexCache.has(token)) return hexCache.get(token);
      var h = resolveHex(L || FALLBACK, token);
      if (h) hexCache.set(token, h);
      return h;
    }
    function hex(token) {
      var h = tryHex(token);
      if (h) return h;
      warn('unknown colour token "' + token + '" (rendered as Pebble)');
      hexCache.set(token, UNKNOWN_HEX);
      return UNKNOWN_HEX;
    }
    function col(token) { return token && token.isColor ? token.clone() : new THREE.Color(hex(token)); }
    function rgb(h) { var n = normHex(h); return new THREE.Color(n || UNKNOWN_HEX); }
    /* tone: 'base' | 'shade' (-12 points of HSL lightness) | 'hi' (+12) | a number (±lightness) */
    function tone(token, t) {
      var c = col(token);
      var d = t === 'shade' ? -0.12 : t === 'hi' ? 0.12 : typeof t === 'number' ? t : 0;
      if (d) {
        c.getHSL(_hsl, THREE.SRGBColorSpace);
        c.setHSL(_hsl.h, _hsl.s, clamp(_hsl.l + d, 0.02, 0.98), THREE.SRGBColorSpace);
      }
      return c;
    }
    var colTmp = new Map();   /* token → Color for per-frame tints (no allocation after first use) */
    function colCached(token) {
      if (token && token.isColor) return token;
      var c = colTmp.get(token);
      if (!c) { c = col(token); colTmp.set(token, c); }
      return c;
    }

    /* ---------------- geometry normalisation ---------------- */
    var KEEP = { position: 1, normal: 1, color: 1 };
    function ensureColor(geo) {
      var a = geo.getAttribute('color');
      if (a && a.itemSize === 3) return a;
      if (a) geo.deleteAttribute('color');
      a = new THREE.BufferAttribute(new Float32Array(geo.getAttribute('position').count * 3).fill(1), 3);
      geo.setAttribute('color', a);
      return a;
    }
    function fin(geo) {
      Object.keys(geo.attributes).forEach(function (n) { if (!KEEP[n]) geo.deleteAttribute(n); });
      geo.morphAttributes = {};
      if (geo.index) { var g2 = geo.toNonIndexed(); geo.dispose(); geo = g2; }
      geo.clearGroups();
      if (!geo.getAttribute('normal')) geo.computeVertexNormals();
      ensureColor(geo);
      return geo;
    }
    function normalised(geo) {
      if (geo.index) return false;
      for (var n in geo.attributes) if (!KEEP[n]) return false;
      var p = geo.getAttribute('position'), nn = geo.getAttribute('normal'), c = geo.getAttribute('color');
      return !!(p && nn && c && p.itemSize === 3 && nn.itemSize === 3 && c.itemSize === 3 && !p.isInterleavedBufferAttribute);
    }
    /* reverse the winding of every triangle (after a mirror) */
    function flipWinding(geo) {
      ['position', 'normal', 'color'].forEach(function (n) {
        var a = geo.getAttribute(n);
        if (!a) return;
        var arr = a.array;
        for (var i = 0; i + 8 < arr.length; i += 9) {
          for (var k = 0; k < 3; k++) { var t = arr[i + 3 + k]; arr[i + 3 + k] = arr[i + 6 + k]; arr[i + 6 + k] = t; }
        }
        a.needsUpdate = true;
      });
      return geo;
    }
    function flatten(list, out) {
      if (!list) return out;
      if (Array.isArray(list)) { for (var i = 0; i < list.length; i++) flatten(list[i], out); }
      else if (list.isBufferGeometry) out.push(list);
      return out;
    }
    /* safe merge: always a NEW geometry; normalises anything that isn't already */
    function merge(list) {
      var geos = flatten(list, []), total = 0, i;
      for (i = 0; i < geos.length; i++) {
        if (!normalised(geos[i])) geos[i] = fin(geos[i].clone());
        total += geos[i].getAttribute('position').count;
      }
      var P = new Float32Array(total * 3), N = new Float32Array(total * 3), C = new Float32Array(total * 3), off = 0;
      for (i = 0; i < geos.length; i++) {
        var g = geos[i];
        P.set(g.getAttribute('position').array, off);
        N.set(g.getAttribute('normal').array, off);
        C.set(g.getAttribute('color').array, off);
        off += g.getAttribute('position').count * 3;
      }
      var out = new THREE.BufferGeometry();
      out.setAttribute('position', new THREE.BufferAttribute(P, 3));
      out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
      out.setAttribute('color', new THREE.BufferAttribute(C, 3));
      return out;
    }

    /* ---------------- the geometry kit G (bound to a tier) ---------------- */
    function makeG(tier) {
      var low = tier === 'LOW';
      var G = {};
      /* puff(r): icosahedron detail 1; puff(r, {sphere: true}): 12×8 sphere (10×6 on LOW) */
      G.puff = function (r, o) {
        var g = o && o.sphere ? new THREE.SphereGeometry(r, low ? 10 : 12, low ? 6 : 8) : new THREE.IcosahedronGeometry(r, 1);
        return fin(g);
      };
      /* bean(r, len): capsule, len = straight middle length */
      G.bean = function (r, len) { return fin(new THREE.CapsuleGeometry(r, len, low ? 2 : 3, low ? 8 : 10)); };
      /* slab(w, h, d[, radius | {arch: true} | {radius}]): rounded box. Default radius 0.18 × the
         smallest side (organic / toy pieces); {arch: true} is the crisp architecture bevel
         min(0.05 × the smallest side, 0.06) from MATERIAL.bevel */
      G.slab = function (w, h, d, radius) {
        var m = Math.min(w, h, d), rad;
        if (radius && typeof radius === 'object') {
          rad = radius.arch ? archRadius(w, h, d, bevelFrom(lookNow()))
            : radius.radius != null ? Math.min(radius.radius, m * 0.49) : 0.18 * m;
        } else rad = radius != null ? Math.min(radius, m * 0.49) : 0.18 * m;
        var g = RoundedBox && rad > 0 ? new RoundedBox(w, h, d, low ? 1 : 2, rad) : new THREE.BoxGeometry(w, h, d);
        return fin(g);
      };
      /* tube(rTop, rBot, h[, {radial, open}]) or tube(r, h): cylinder, 12 radial (8 on LOW) */
      G.tube = function (rTop, rBot, h, o) {
        if (h === undefined || (h !== null && typeof h === 'object')) { o = h; h = rBot; rBot = rTop; }
        o = o || {};
        return fin(new THREE.CylinderGeometry(rTop, rBot, h, o.radial || (low ? 8 : 12), 1, !!o.open));
      };
      /* drop(r, h[, profile]): lathe of an 8-point profile ([x/r, y/h] pairs), base at y = 0 */
      G.drop = function (r, h, profile) {
        var prof = Array.isArray(profile) && profile.length >= 2 ? profile : DROP_PROFILE;
        var pts = prof.map(function (p) { return new THREE.Vector2(Math.max(0, p[0]) * r, p[1] * h); });
        return fin(new THREE.LatheGeometry(pts, low ? 7 : 10));
      };
      /* ring(R, r): torus 16×6 (12×5 on LOW), lying in the XY plane like THREE's */
      G.ring = function (R, r) { return fin(new THREE.TorusGeometry(R, r, low ? 5 : 6, low ? 12 : 16)); };
      /* star(rOut, rIn): puffy 5-point star facing +z, depth 0.25·rOut, bevel 0.3·depth */
      G.star = function (rOut, rIn) {
        rIn = rIn || rOut * 0.5;
        var sh = new THREE.Shape();
        for (var i = 0; i < 10; i++) {
          var a = Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? rIn : rOut;
          if (i) sh.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else sh.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        sh.closePath();
        var depth = 0.25 * rOut, bev = 0.3 * depth;
        var g = new THREE.ExtrudeGeometry(sh, { depth: depth, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: low ? 1 : 2, curveSegments: 1, steps: 1 });
        g.translate(0, 0, -depth / 2);
        return fin(g);
      };
      /* flag(w, h, sx = 8, sy = 1): a two-sided plane (front + flipped back), pole edge at x = 0 */
      G.flag = function (w, h, sx, sy) {
        var front = fin(new THREE.PlaneGeometry(w, h, sx || 8, sy || 1));
        front.translate(w / 2, 0, 0);
        var back = front.clone();
        var n = back.getAttribute('normal').array;
        for (var i = 0; i < n.length; i++) n[i] = -n[i];
        flipWinding(back);
        return merge([front, back]);
      };
      /* ribbon(points, r[, {segments, closed}]): Catmull-Rom tube, 4 radial segments */
      G.ribbon = function (points, r, o) {
        o = o || {};
        var v = points.map(function (p) { return p && p.isVector3 ? p : new THREE.Vector3(p[0], p[1], p[2]); });
        var curve = new THREE.CatmullRomCurve3(v, !!o.closed);
        var seg = o.segments || Math.max(6, Math.round(v.length * (low ? 4 : 6)));
        return fin(new THREE.TubeGeometry(curve, seg, r, 4, !!o.closed));
      };
      /* cone(r, h[, radial]) */
      G.cone = function (r, h, radial) { return fin(new THREE.ConeGeometry(r, h, radial || (low ? 8 : 12))); };

      /* t(geo, {p:[x,y,z], r:[deg,deg,deg], s:n|[x,y,z]}): scale, then rotate (XYZ), then translate */
      G.t = function (geo, o) {
        if (!o) return geo;
        var s = o.s == null ? 1 : o.s;
        if (typeof s === 'number') _s.set(s, s, s); else _s.set(s[0], s[1], s[2]);
        var r = o.r || [0, 0, 0];
        _e.set((r[0] || 0) * DEG, (r[1] || 0) * DEG, (r[2] || 0) * DEG, 'XYZ');
        _q.setFromEuler(_e);
        var p = o.p || [0, 0, 0];
        _p.set(p[0] || 0, p[1] || 0, p[2] || 0);
        _m.compose(_p, _q, _s);
        geo.applyMatrix4(_m);
        if (_s.x * _s.y * _s.z < 0) flipWinding(geo);   /* a mirror keeps faces pointing outwards */
        return geo;
      };
      /* mirror(geo, 'x'|'y'|'z') */
      G.mirror = function (geo, axis) {
        return G.t(geo, { s: axis === 'y' ? [1, -1, 1] : axis === 'z' ? [1, 1, -1] : [-1, 1, 1] });
      };
      /* paint(geo, token, tone = 'base') */
      G.paint = function (geo, token, tn) {
        var c = tone(token, tn || 'base'), a = ensureColor(geo), arr = a.array;
        for (var i = 0; i < arr.length; i += 3) { arr[i] = c.r; arr[i + 1] = c.g; arr[i + 2] = c.b; }
        a.needsUpdate = true;
        return geo;
      };
      /* paintBy(geo, fn(v) → token | [token, tone] | Color | null[, {perFace}])
         v = {x, y, z, nx, ny, nz, i, face}; perFace evaluates once at each triangle's centroid */
      G.paintBy = function (geo, fn, o) {
        var perFace = !!(o && o.perFace);
        var pos = geo.getAttribute('position').array, nrm = geo.getAttribute('normal') ? geo.getAttribute('normal').array : null;
        var a = ensureColor(geo), arr = a.array, cache = {};
        var v = { x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0, i: 0, face: 0 };
        function res(r) {
          if (r == null) return null;
          if (r.isColor) return r;
          var key = Array.isArray(r) ? r[0] + '|' + r[1] : r;
          return cache[key] || (cache[key] = Array.isArray(r) ? tone(r[0], r[1]) : tone(r, 'base'));
        }
        var n = pos.length / 3, i, k, c;
        if (perFace && !geo.index) {
          for (i = 0; i + 2 < n; i += 3) {
            v.x = (pos[i * 3] + pos[i * 3 + 3] + pos[i * 3 + 6]) / 3;
            v.y = (pos[i * 3 + 1] + pos[i * 3 + 4] + pos[i * 3 + 7]) / 3;
            v.z = (pos[i * 3 + 2] + pos[i * 3 + 5] + pos[i * 3 + 8]) / 3;
            if (nrm) {
              v.nx = (nrm[i * 3] + nrm[i * 3 + 3] + nrm[i * 3 + 6]) / 3;
              v.ny = (nrm[i * 3 + 1] + nrm[i * 3 + 4] + nrm[i * 3 + 7]) / 3;
              v.nz = (nrm[i * 3 + 2] + nrm[i * 3 + 5] + nrm[i * 3 + 8]) / 3;
            }
            v.i = i; v.face = i / 3;
            c = res(fn(v));
            if (!c) continue;
            for (k = 0; k < 3; k++) { arr[(i + k) * 3] = c.r; arr[(i + k) * 3 + 1] = c.g; arr[(i + k) * 3 + 2] = c.b; }
          }
        } else {
          for (i = 0; i < n; i++) {
            v.x = pos[i * 3]; v.y = pos[i * 3 + 1]; v.z = pos[i * 3 + 2];
            if (nrm) { v.nx = nrm[i * 3]; v.ny = nrm[i * 3 + 1]; v.nz = nrm[i * 3 + 2]; }
            v.i = i; v.face = (i / 3) | 0;
            c = res(fn(v));
            if (!c) continue;
            arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b;
          }
        }
        a.needsUpdate = true;
        return geo;
      };
      /* facet(geo): bake flat normals (non-indexed → per-face), so no flatShading program is needed */
      G.facet = function (geo) {
        if (geo.index) geo = fin(geo);
        geo.computeVertexNormals();
        return geo;
      };
      G.merge = merge;
      G.clone = function (geo) { return geo.clone(); };
      G.normalise = fin;
      G.tier = tier;
      return G;
    }

    /* ---------------- canvas textures (generated at runtime) ---------------- */
    var texCache = {}, emojiCache = new Map(), extraTex = new Set();
    function mkCanvas(w, h) {
      if (!hasDoc()) return null;
      var c = document.createElement('canvas');
      c.width = w; c.height = h;
      return c;
    }
    function canvasTex(c) {
      var t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.needsUpdate = true;
      return t;
    }
    function whiteTex() {
      var t = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat);
      t.needsUpdate = true;
      return t;
    }
    function radialAlpha(size, fn) {
      var c = mkCanvas(size, size);
      if (!c) return whiteTex();
      var ctx = c.getContext('2d');
      if (!ctx || !ctx.createImageData) return whiteTex();
      var img = ctx.createImageData(size, size), d = img.data, h = size / 2;
      for (var y = 0; y < size; y++) {
        for (var x = 0; x < size; x++) {
          var r = Math.sqrt((x + 0.5 - h) * (x + 0.5 - h) + (y + 0.5 - h) * (y + 0.5 - h)) / h;
          var o = (y * size + x) * 4;
          d[o] = d[o + 1] = d[o + 2] = 255;
          d[o + 3] = Math.round(clamp(fn(r), 0, 1) * 255);
        }
      }
      ctx.putImageData(img, 0, 0);
      return canvasTex(c);
    }
    var tex = {
      /* toon ramp: 4×1 RedFormat from MATERIAL.toonRamp (v2 [64, 128, 200, 255]), Nearest, no mips */
      ramp: function () {
        if (texCache.ramp) return texCache.ramp;
        var t = new THREE.DataTexture(new Uint8Array(rampFrom(lookNow())), 4, 1, THREE.RedFormat);
        t.minFilter = THREE.NearestFilter; t.magFilter = THREE.NearestFilter;
        t.generateMipmaps = false; t.needsUpdate = true;
        return (texCache.ramp = t);
      },
      /* halo: 64², alpha = (1 - r)² */
      halo: function () {
        return texCache.halo || (texCache.halo = radialAlpha(64, function (r) { return r >= 1 ? 0 : (1 - r) * (1 - r); }));
      },
      /* blob shadow: 64² soft radial (tinted Blob Shadow at 0.22 by the 'blob' material) */
      blob: function () {
        return texCache.blob || (texCache.blob = radialAlpha(64, function (r) { var a = clamp((1 - r) * 1.6, 0, 1); return a * a * (3 - 2 * a); }));
      },
      sparkles: function () { return texCache.sparkles || (texCache.sparkles = drawAtlas()); },
      /* matcaps at 128²: 'gold' | 'chrome' | 'pearl' | 'smoked' | 'gunmetal' | 'foil' */
      matcap: function (name) {
        var k = 'mc_' + name;
        return texCache[k] || (texCache[k] = drawMatcap(name));
      },
      emojiFace: function (emoji) { return emojiFace(emoji); },
      banner: function (text, o) { return banner(text, o); },
      fontReady: fontReady,
      /* dispose a texture made by emojiFace/banner (profile switch, item removed) */
      release: function (t) {
        if (!t) return;
        emojiCache.forEach(function (v, k) { if (v === t) emojiCache.delete(k); });
        extraTex.delete(t);
        t.dispose();
      }
    };

    /* v2 matcap stops: the look's MATCAPS tokens, else the bible hexes */
    function matcapStops(name) {
      var L = lookNow(), toks = L && L.MATCAPS && L.MATCAPS[name];
      if (toks && toks.length) {
        var out = toks.map(function (t) { return tryHex(t); });
        if (out.every(Boolean)) return out;
      }
      return MATCAP_FALLBACK[name];
    }
    function drawMatcap(name) {
      var S = 128, c = mkCanvas(S, S);
      if (!c) return whiteTex();
      var ctx = c.getContext('2d');
      if (!ctx) return whiteTex();
      var g, st;
      if (name === 'smoked') {
        /* opaque smoked glass: a cool spec near the top-left (0.32, 0.28) → mid 35% → glass 70% → deep edge */
        st = matcapStops('smoked');
        ctx.fillStyle = st[3]; ctx.fillRect(0, 0, S, S);
        g = ctx.createRadialGradient(S * 0.32, S * 0.28, 0, S / 2, S / 2, S * 0.52);
        g.addColorStop(0, st[0]); g.addColorStop(0.35, st[1]); g.addColorStop(0.7, st[2]); g.addColorStop(1, st[3]);
        ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
        spec(ctx, S * 0.32, S * 0.28, S * 0.06, 0.55);
        return canvasTex(c);
      }
      if (name === 'gunmetal') {
        /* dark chrome: spec → mid → gunmetal → deep, with a soft horizon band */
        st = matcapStops('gunmetal');
        ctx.fillStyle = st[3]; ctx.fillRect(0, 0, S, S);
        g = ctx.createRadialGradient(S * 0.42, S * 0.38, 2, S / 2, S / 2, S * 0.52);
        g.addColorStop(0, st[0]); g.addColorStop(0.4, st[1]); g.addColorStop(0.78, st[2]); g.addColorStop(1, st[3]);
        ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
        var band = ctx.createLinearGradient(0, S * 0.5, 0, S * 0.66);
        band.addColorStop(0, 'rgba(42,45,58,0)'); band.addColorStop(0.5, 'rgba(42,45,58,0.35)'); band.addColorStop(1, 'rgba(42,45,58,0)');
        ctx.fillStyle = band; ctx.fillRect(0, S * 0.5, S, S * 0.16);
        spec(ctx, S * 0.36, S * 0.32, S * 0.07, 0.8);
        return canvasTex(c);
      }
      if (name === 'foil') {
        /* conic foil: pink → blue → mint → gold → pink, with a soft sheen */
        st = matcapStops('foil');
        st = st.concat([st[0]]);
        if (typeof ctx.createConicGradient === 'function') {
          g = ctx.createConicGradient(-Math.PI / 4, S / 2, S / 2);
          st.forEach(function (s, i) { g.addColorStop(i / (st.length - 1), s); });
        } else {
          g = ctx.createLinearGradient(0, 0, S, S);
          st.slice(0, 4).forEach(function (s, i) { g.addColorStop(i / 3, s); });
        }
        ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
        var sh = ctx.createRadialGradient(S * 0.4, S * 0.36, 0, S * 0.4, S * 0.36, S * 0.42);
        sh.addColorStop(0, 'rgba(255,255,255,0.6)'); sh.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = sh; ctx.fillRect(0, 0, S, S);
        return canvasTex(c);
      }
      if (name === 'gold') {
        ctx.fillStyle = '#8A5F10'; ctx.fillRect(0, 0, S, S);
        g = ctx.createRadialGradient(S * 0.42, S * 0.38, 2, S / 2, S / 2, S * 0.52);
        g.addColorStop(0, '#FFF6CC'); g.addColorStop(0.3, '#FFE89A'); g.addColorStop(0.6, '#F0C02F');
        g.addColorStop(0.9, '#C9921A'); g.addColorStop(1, '#8A5F10');
        ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
        spec(ctx, S * 0.35, S * 0.3, S * 0.09, 0.95);
      } else if (name === 'chrome') {
        ctx.fillStyle = '#C7B8FF'; ctx.fillRect(0, 0, S, S);
        g = ctx.createRadialGradient(S * 0.42, S * 0.38, 2, S / 2, S / 2, S * 0.52);
        g.addColorStop(0, '#FFFFFF'); g.addColorStop(0.4, '#DDE3F0'); g.addColorStop(0.78, '#9AA3B8');
        g.addColorStop(0.92, '#C7B8FF'); g.addColorStop(1, '#C7B8FF');
        ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
        /* a soft horizon band gives the Y2K chrome read */
        var hb = ctx.createLinearGradient(0, S * 0.5, 0, S * 0.66);
        hb.addColorStop(0, 'rgba(154,163,184,0)'); hb.addColorStop(0.5, 'rgba(120,128,150,0.35)'); hb.addColorStop(1, 'rgba(154,163,184,0)');
        ctx.fillStyle = hb; ctx.fillRect(0, S * 0.5, S, S * 0.16);
        spec(ctx, S * 0.36, S * 0.32, S * 0.08, 0.9);
      } else {                                   /* pearl / holo */
        var stops = ['#FFB3E6', '#B3E5FF', '#C9FFE5', '#FFF3B3', '#FFB3E6'];
        if (typeof ctx.createConicGradient === 'function') {
          g = ctx.createConicGradient(-Math.PI / 4, S / 2, S / 2);
          stops.forEach(function (s, i) { g.addColorStop(i / 4, s); });
        } else {
          g = ctx.createLinearGradient(0, 0, S, S);
          stops.slice(0, 4).forEach(function (s, i) { g.addColorStop(i / 3, s); });
        }
        ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
        var w = ctx.createRadialGradient(S * 0.4, S * 0.36, 0, S * 0.4, S * 0.36, S * 0.42);
        w.addColorStop(0, 'rgba(255,255,255,0.75)'); w.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = w; ctx.fillRect(0, 0, S, S);
        var e = ctx.createRadialGradient(S / 2, S / 2, S * 0.36, S / 2, S / 2, S * 0.52);
        e.addColorStop(0, 'rgba(166,107,255,0)'); e.addColorStop(1, 'rgba(166,107,255,0.25)');
        ctx.fillStyle = e; ctx.fillRect(0, 0, S, S);
      }
      return canvasTex(c);
    }
    function spec(ctx, x, y, r, a) {
      var g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,' + a + ')'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }

    function drawAtlas() {
      var C = 64, S = C * ATLAS_CELLS, c = mkCanvas(S, S);
      if (!c) return whiteTex();
      var ctx = c.getContext('2d');
      if (!ctx) return whiteTex();
      ctx.fillStyle = '#FFFFFF'; ctx.strokeStyle = '#FFFFFF'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      function cell(i, fn) {
        ctx.save();
        ctx.translate((i % ATLAS_CELLS) * C + C / 2, Math.floor(i / ATLAS_CELLS) * C + C / 2);
        ctx.beginPath(); fn(); ctx.restore();
      }
      function starPath(n, ro, ri) {
        for (var k = 0; k < n * 2; k++) {
          var a = -Math.PI / 2 + k * Math.PI / n, r = k % 2 ? ri : ro;
          if (k) ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); else ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.closePath();
      }
      cell(ATLAS.sparkle, function () {              /* four-point ✦ with curved arms */
        ctx.moveTo(0, -28);
        ctx.quadraticCurveTo(3, -3, 28, 0); ctx.quadraticCurveTo(3, 3, 0, 28);
        ctx.quadraticCurveTo(-3, 3, -28, 0); ctx.quadraticCurveTo(-3, -3, 0, -28);
        ctx.fill();
      });
      cell(ATLAS.heart, function () {
        ctx.moveTo(0, 22);
        ctx.bezierCurveTo(-30, 2, -22, -24, 0, -10);
        ctx.bezierCurveTo(22, -24, 30, 2, 0, 22);
        ctx.fill();
      });
      cell(ATLAS.note, function () {                 /* ♪ */
        ctx.ellipse(-8, 16, 10, 7.5, -0.4, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.lineWidth = 5; ctx.moveTo(1, 14); ctx.lineTo(1, -22); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(1, -22); ctx.quadraticCurveTo(14, -18, 16, -4); ctx.stroke();
      });
      cell(ATLAS.star, function () { starPath(5, 28, 13); ctx.fill(); });
      cell(ATLAS.dot, function () {
        var g = ctx.createRadialGradient(0, 0, 0, 0, 0, 28);
        g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.5, 'rgba(255,255,255,0.8)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g; ctx.arc(0, 0, 28, 0, Math.PI * 2); ctx.fill();
      });
      cell(ATLAS.ring, function () { ctx.lineWidth = 6; ctx.arc(0, 0, 24, 0, Math.PI * 2); ctx.stroke(); });
      cell(ATLAS.rect, function () { ctx.fillRect(-12, -20, 24, 40); });
      cell(ATLAS.petal, function () {
        ctx.moveTo(0, -26); ctx.quadraticCurveTo(20, -4, 0, 26); ctx.quadraticCurveTo(-20, -4, 0, -26); ctx.fill();
      });
      cell(ATLAS.snow, function () {
        ctx.lineWidth = 5;
        for (var k = 0; k < 6; k++) {
          var a = k * Math.PI / 3, x = Math.cos(a), y = Math.sin(a);
          ctx.moveTo(0, 0); ctx.lineTo(x * 26, y * 26);
          ctx.moveTo(x * 15, y * 15); ctx.lineTo(x * 15 + Math.cos(a + 0.8) * 8, y * 15 + Math.sin(a + 0.8) * 8);
          ctx.moveTo(x * 15, y * 15); ctx.lineTo(x * 15 + Math.cos(a - 0.8) * 8, y * 15 + Math.sin(a - 0.8) * 8);
        }
        ctx.stroke();
      });
      cell(ATLAS.bubble, function () {
        ctx.lineWidth = 4; ctx.globalAlpha = 0.9; ctx.arc(0, 0, 25, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.arc(0, 0, 23, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(-9, -10, 5, 0, Math.PI * 2); ctx.fill();
      });
      cell(ATLAS.puff, function () {
        [[-10, 4, 14], [8, 6, 13], [0, -8, 15]].forEach(function (b) { ctx.moveTo(b[0] + b[2], b[1]); ctx.arc(b[0], b[1], b[2], 0, Math.PI * 2); });
        ctx.fill();
      });
      cell(ATLAS.circle, function () { ctx.arc(0, 0, 24, 0, Math.PI * 2); ctx.fill(); });
      cell(ATLAS.curl, function () {
        ctx.lineWidth = 6;
        for (var k = 0; k <= 40; k++) {
          var a = k / 40 * Math.PI * 3, r = 4 + k * 0.55;
          if (k) ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); else ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.stroke();
      });
      cell(ATLAS.diamond, function () { ctx.moveTo(0, -26); ctx.lineTo(16, 0); ctx.lineTo(0, 26); ctx.lineTo(-16, 0); ctx.closePath(); ctx.fill(); });
      cell(ATLAS.plus, function () { ctx.lineWidth = 7; ctx.moveTo(0, -20); ctx.lineTo(0, 20); ctx.moveTo(-20, 0); ctx.lineTo(20, 0); ctx.stroke(); });
      cell(ATLAS.tri, function () { ctx.moveTo(0, -22); ctx.lineTo(22, 18); ctx.lineTo(-22, 18); ctx.closePath(); ctx.fill(); });
      return canvasTex(c);
    }

    /* the child's emoji on a transparent 128² canvas; falls back to 🙂, then to a drawn smile */
    function emojiFace(emoji) {
      var key = typeof emoji === 'string' && emoji ? emoji : '🙂';
      if (emojiCache.has(key)) return emojiCache.get(key);
      var c = mkCanvas(128, 128);
      var t;
      if (!c || !c.getContext('2d')) t = whiteTex();
      else {
        var ctx = c.getContext('2d');
        var draw = function (e) {
          ctx.clearRect(0, 0, 128, 128);
          ctx.font = '96px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Twemoji Mozilla",sans-serif';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(e, 64, 70);
          return inked(ctx);
        };
        if (!draw(key) && !draw('🙂')) {
          ctx.clearRect(0, 0, 128, 128);
          ctx.fillStyle = '#FFE27A'; ctx.beginPath(); ctx.arc(64, 64, 52, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#3B2F4A';
          ctx.beginPath(); ctx.arc(46, 54, 7, 0, Math.PI * 2); ctx.arc(82, 54, 7, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#3B2F4A'; ctx.lineWidth = 6; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.arc(64, 70, 22, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke();
        }
        t = canvasTex(c);
      }
      emojiCache.set(key, t);
      return t;
    }
    function inked(ctx) {
      try {
        var d = ctx.getImageData(0, 0, 128, 128).data, sum = 0;
        for (var i = 3; i < d.length; i += 16) sum += d[i];
        return sum > 255 * 40;
      } catch (e) { return true; }   /* can't read back: assume it drew */
    }

    /* wait for a webfont (with a timeout); resolves true when it is usable */
    function fontReady(spec, ms) {
      if (!hasDoc() || !document.fonts || typeof document.fonts.load !== 'function') return Promise.resolve(false);
      try { if (document.fonts.check(spec)) return Promise.resolve(true); } catch (e) {}
      var done = document.fonts.load(spec).then(function (l) { return !!(l && l.length); }, function () { return false; });
      return Promise.race([done, new Promise(function (r) { setTimeout(function () { r(false); }, ms || 1500); })]);
    }
    /* banner(text, {w=512, h=128, font='Bagel Fat One', fallback='Baloo 2', weight, fill: token|[token…],
                     stroke: token, strokeW, bg: token|null, radius}) → CanvasTexture.
       Draws now with whatever font is ready and redraws once the display font arrives. */
    function banner(text, o) {
      o = o || {};
      var W = o.w || 512, H = o.h || 128, c = mkCanvas(W, H);
      if (!c || !c.getContext('2d')) return whiteTex();
      var ctx = c.getContext('2d');
      var font = o.font || 'Bagel Fat One', fb = o.fallback || 'Baloo 2';
      var t = canvasTex(c);
      extraTex.add(t);
      function paint(useFont, weight) {
        ctx.clearRect(0, 0, W, H);
        if (o.bg) {
          var r = o.radius != null ? o.radius : H * 0.3;
          ctx.fillStyle = hex(o.bg);
          ctx.beginPath();
          if (typeof ctx.roundRect === 'function') ctx.roundRect(0, 0, W, H, r); else ctx.rect(0, 0, W, H);
          ctx.fill();
        }
        var size = Math.round(H * 0.62), pad = W * 0.06;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        do { ctx.font = weight + ' ' + size + 'px "' + useFont + '", sans-serif'; size -= 2; }
        while (size > 12 && ctx.measureText(text).width > W - pad * 2);
        var fills = Array.isArray(o.fill) ? o.fill : [o.fill || 'Cloud White'];
        if (fills.length > 1) {
          var g = ctx.createLinearGradient(0, H * 0.2, 0, H * 0.8);
          fills.forEach(function (f, i) { g.addColorStop(i / (fills.length - 1), hex(f)); });
          ctx.fillStyle = g;
        } else ctx.fillStyle = hex(fills[0]);
        if (o.stroke) {
          ctx.lineWidth = o.strokeW || Math.max(4, H * 0.07); ctx.lineJoin = 'round';
          ctx.strokeStyle = hex(o.stroke);
          ctx.strokeText(text, W / 2, H * 0.54);
        }
        ctx.fillText(text, W / 2, H * 0.54);
        t.needsUpdate = true;
      }
      var spec = (o.weight || 400) + ' 64px "' + font + '"';
      var ready = false;
      try { ready = !!(document.fonts && document.fonts.check(spec)); } catch (e) { ready = false; }
      if (ready) paint(font, o.weight || 400);
      else {
        paint(fb, 800);
        fontReady(spec, 60000).then(function (ok) { if (ok && extraTex.has(t)) paint(font, o.weight || 400); });
      }
      return t;
    }

    /* ---------------- shared atlases: LED screens and signs (one GPU upload each) ----------------
       Drawn once (and the user cell again on setUser); screens animate by UV offset only. Text
       uses Unbounded 800 once document.fonts has it, Outfit / system-ui until then, and redraws
       once when the display font arrives. */
    var DISPLAY_FONT = '800 48px "Unbounded"';
    function fontStack(px) { return '800 ' + px + 'px "Unbounded", "Outfit", system-ui, -apple-system, "Segoe UI", sans-serif'; }
    function atlasHex(token) { return tryHex(token) || NEON_FALLBACK[token] || '#FFFFFF'; }
    function fitText(ctx, text, maxW, px, minPx) {
      var size = px;
      do { ctx.font = fontStack(size); size -= 1; } while (size > minPx && ctx.measureText(text).width > maxW);
    }
    function signWordsNow() { var L = lookNow(); return L && Array.isArray(L.SIGN_WORDS) ? L.SIGN_WORDS : SIGN_WORDS_FALLBACK; }
    function atlasTexture(c) {
      var t = c ? canvasTex(c) : whiteTex();
      t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter;
      return t;
    }
    /* a texture clone that shares the atlas Source (no second upload), framed on one window */
    function windowView(base, rx, ry, ox, oy) {
      var v = base.clone();
      v.repeat.set(rx, ry); v.offset.set(ox, oy);
      return v;
    }
    function star4(ctx, x, y, r) {          /* ✦: the four-point spark (never the five-point ⭐) */
      ctx.beginPath(); ctx.moveTo(x, y - r);
      ctx.quadraticCurveTo(x + r * 0.12, y - r * 0.12, x + r, y); ctx.quadraticCurveTo(x + r * 0.12, y + r * 0.12, x, y + r);
      ctx.quadraticCurveTo(x - r * 0.12, y + r * 0.12, x - r, y); ctx.quadraticCurveTo(x - r * 0.12, y - r * 0.12, x, y - r);
      ctx.fill();
    }
    var shared = { led: null, sign: null, user: { name: '', color: null } };

    /* one 128-px period of program i at (x, y); every LED colour set mixes ≥ 4 hues, none over 35% */
    function drawLedPeriod(ctx, i, x, y, user) {
      var W = LED.cellW, H = LED.cellH, hues = ['Neon Magenta', 'LED Cyan', 'Electric Violet', 'Laser Lime'].map(atlasHex);
      var ink = atlasHex('Midnight Ink'), k;
      ctx.save();
      ctx.beginPath(); ctx.rect(x, y, W, H); ctx.clip();
      ctx.fillStyle = i === 4 ? atlasHex('Night Zenith') : ink; ctx.fillRect(x, y, W, H);
      if (i === 0) {                                     /* EQ: 8 bars, 2 per hue */
        var hs = [0.45, 0.8, 0.6, 0.95, 0.5, 0.75, 0.35, 0.65];
        for (k = 0; k < 8; k++) { ctx.fillStyle = hues[k % 4]; var bh = hs[k] * (H - 10); ctx.fillRect(x + k * 16 + 2, y + H - 5 - bh, 12, bh); }
      } else if (i === 1) {                              /* waves: 3 lines + lime dots, one cycle per period */
        ctx.lineWidth = 3; ctx.lineCap = 'round';
        [[18, 0], [12, 0.33], [8, 0.66]].forEach(function (w, n) {
          ctx.strokeStyle = hues[n]; ctx.beginPath();
          for (var px = 0; px <= W; px += 2) {
            var yy = y + H / 2 + w[0] * Math.sin(2 * Math.PI * (px / W + w[1]));
            if (px) ctx.lineTo(x + px, yy); else ctx.moveTo(x + px, yy);
          }
          ctx.stroke();
        });
        ctx.fillStyle = hues[3];
        for (k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc(x + 16 + k * 32, y + 10, 2.5, 0, Math.PI * 2); ctx.fill(); }
      } else if (i === 2) {                              /* ✦ drift: fixed sparks, 4 hues */
        [[18, 20, 9], [52, 44, 6], [80, 16, 7], [108, 40, 10], [36, 52, 4], [96, 56, 4], [66, 30, 5], [122, 18, 4]].forEach(function (s, n) {
          ctx.fillStyle = hues[n % 4]; star4(ctx, x + s[0], y + s[1], s[2]);
        });
      } else if (i === 3) {                              /* gradient sweep: magenta → cyan → violet → lime → magenta */
        var g = ctx.createLinearGradient(x, 0, x + W, 0);
        hues.concat([hues[0]]).forEach(function (h, n) { g.addColorStop(n / 4, h); });
        ctx.fillStyle = g; ctx.fillRect(x, y, W, H);
      } else if (i === 4) {                              /* star field (photocards and shop icons use this one) */
        ctx.fillStyle = '#FFFFFF';
        for (k = 0; k < 22; k++) {
          var sx = (k * 37 + 11) % W, sy = (k * 23 + 7) % H, r = 0.8 + (k % 3) * 0.6;
          ctx.globalAlpha = 0.55 + (k % 4) * 0.15; ctx.beginPath(); ctx.arc(x + sx, y + sy, r, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1; ctx.fillStyle = hues[2]; star4(ctx, x + 96, y + 22, 6);
      } else {                                           /* ENCORE / SHOWTIME / the child's name + ✦ */
        var text = i === 5 ? 'ENCORE' : i === 6 ? 'SHOWTIME' : signName(user.name);
        if (i >= 5 && i <= 6 && !checkSignWord(text, signWordsNow(), false)) text = '';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = i === 7 ? (normHex(user.color) || hues[0]) : i === 5 ? hues[0] : hues[1];
        if (text) { fitText(ctx, text, i === 7 ? W - 34 : W - 12, 26, 9); ctx.fillText(text, x + (i === 7 ? W / 2 - 10 : W / 2), y + H / 2 + 1); }
        if (i === 7) { ctx.fillStyle = hues[2]; star4(ctx, x + (text ? W - 14 : W / 2), y + H / 2, text ? 7 : 14); }
        ctx.fillStyle = hues[i === 7 ? 3 : 2]; ctx.fillRect(x + 8, y + H - 6, W - 16, 2);
      }
      ctx.restore();
    }
    function drawLedProgram(ctx, i, user) {
      var c = ledCell(i);
      ctx.clearRect(c.x, c.y, c.w, c.h);
      drawLedPeriod(ctx, i, c.x, c.y, user);
      drawLedPeriod(ctx, i, c.x + LED.cellW, c.y, user);
    }
    function ledAtlas() {
      if (shared.led) return shared.led;
      var c = mkCanvas(LED.w, LED.h), ctx = c && c.getContext('2d');
      var t = atlasTexture(ctx ? c : null), mats = {};
      extraTex.add(t);
      function paint(onlyText) {
        if (!ctx) return;
        for (var i = 0; i < LED_PROGRAMS.length; i++) if (!onlyText || i >= 5) drawLedProgram(ctx, i, shared.user);
        t.needsUpdate = true;
      }
      paint(false);
      fontReady(DISPLAY_FONT, 60000).then(function (ok) { if (ok && shared.led) paint(true); });
      var api = shared.led = {
        texture: t, PROGRAMS: LED_PROGRAMS.slice(), CELL: { w: LED.cellW, h: LED.cellH },
        cell: ledCell,
        window: function (p, phase, out) { return ledWindow(p, phase, out); },
        /* a texture clone framed on program p (scroll it with setWindow) */
        view: function (p, phase) { var w = ledWindow(p, phase); return windowView(t, w.rx, w.ry, w.ox, w.oy); },
        setWindow: function (tx, p, phase) { var w = ledWindow(p, phase); tx.repeat.set(w.rx, w.ry); tx.offset.set(w.ox, w.oy); return tx; },
        /* one shared material per program (copies showing it scroll together) */
        material: function (p) {
          var i = ledIndex(p);
          if (i < 0) i = 0;
          return mats[i] || (mats[i] = variant('led', 'p:' + LED_PROGRAMS[i], { map: api.view(i, 0) }));
        },
        /* redraws only the name cell (and the sign atlas's name + initial) */
        setUser: function (u) { setAtlasUser(u); return api; },
        _redrawUser: function () { if (ctx) { drawLedProgram(ctx, 7, shared.user); t.needsUpdate = true; } }
      };
      return api;
    }
    /* the child's name and member colour for both atlases; only the user cells are redrawn */
    function setAtlasUser(u) {
      u = u || {};
      var name = typeof u.name === 'string' ? u.name : shared.user.name, color = u.color != null ? u.color : shared.user.color;
      if (name === shared.user.name && color === shared.user.color) return;
      var renamed = name !== shared.user.name;
      shared.user.name = name; shared.user.color = color;
      if (shared.led) shared.led._redrawUser();
      if (shared.sign && renamed) shared.sign._redrawUser();
    }
    function drawSignCell(ctx, word, user) {
      var c = signCell(word, signWordsNow());
      if (!c) return;
      ctx.clearRect(c.x, c.y, c.w, c.h);
      var text = word === ':name' ? signName(user.name) : word === ':initial' ? signInitial(user.name) : word.trim().toUpperCase();
      if (!text) return;
      ctx.save();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#FFFFFF';
      fitText(ctx, text, c.w - 16, 46, 10);
      ctx.fillText(text, c.x + c.w / 2, c.y + c.h / 2 + 2);
      ctx.restore();
    }
    function signAtlas() {
      if (shared.sign) return shared.sign;
      var c = mkCanvas(SIGN.w, SIGN.h), ctx = c && c.getContext('2d');
      var t = atlasTexture(ctx ? c : null), mats = {};
      extraTex.add(t);
      function paint() {
        if (!ctx) return;
        signWordsNow().slice(0, SIGN.userCell).forEach(function (w) { drawSignCell(ctx, w, shared.user); });
        drawSignCell(ctx, ':name', shared.user); drawSignCell(ctx, ':initial', shared.user);
        t.needsUpdate = true;
      }
      paint();
      fontReady(DISPLAY_FONT, 60000).then(function (ok) { if (ok && shared.sign) paint(); });
      function allowed(word) { return checkSignWord(word, signWordsNow(), qa); }
      var api = shared.sign = {
        texture: t, WORDS: signWordsNow().slice(),
        /* UV rect of a word, ':name' or ':initial' (null — or a throw in QA mode — for anything else) */
        rect: function (word) { return allowed(word) ? signRect(word, signWordsNow()) : null; },
        view: function (word) {
          var r = api.rect(word);
          return r ? windowView(t, r.u1 - r.u0, r.v1 - r.v0, r.u0, r.v0) : null;
        },
        material: function (word) {
          if (!allowed(word)) return null;
          var key = word.trim().toUpperCase();
          return mats[key] || (mats[key] = variant('sign', 'w:' + key, { map: api.view(word) }));
        },
        setUser: function (u) { setAtlasUser(u); return api; },
        _redrawUser: function () {
          if (ctx) { drawSignCell(ctx, ':name', shared.user); drawSignCell(ctx, ':initial', shared.user); t.needsUpdate = true; }
        }
      };
      return api;
    }

    /* ---------------- materials (each created once, shared) ---------------- */
    var uniforms = {
      uRimColor: { value: new THREE.Color(1, 1, 1) },
      uRimStrength: { value: 0.28 },
      uSelPulse: { value: 0 },
      uSelMin: { value: SEL_W[0] },
      uSelMax: { value: SEL_W[1] }
    };
    (function () {
      var L = lookNow(), o = L && L.MATERIAL && L.MATERIAL.outline, p = o && o.pulse;
      if (p && p.length === 2 && p[0] > 0 && p[1] >= p[0]) { uniforms.uSelMin.value = p[0]; uniforms.uSelMax.value = p[1]; }
    }());
    var mats = new Map(), allMats = new Set(), glowMats = [], variants = new Map();
    function rimPatch(shader) {
      shader.uniforms.uRimColor = uniforms.uRimColor;
      shader.uniforms.uRimStrength = uniforms.uRimStrength;
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uRimColor;\nuniform float uRimStrength;')
        .replace('#include <opaque_fragment>',
          'outgoingLight += uRimColor * pow(1.0 - clamp(dot(normal, geometryViewDir), 0.0, 1.0), 2.5) * uRimStrength;\n#include <opaque_fragment>');
    }
    function toonKey() { return 'encore-toon'; }
    function outlineKey() { return 'encore-outline'; }
    function outlineMat(w) {
      var m = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide, name: 'outline:' + w });
      var uW = { value: w };
      m.userData.uOutline = uW;
      m.onBeforeCompile = function (shader) {
        shader.uniforms.uOutline = uW;
        shader.uniforms.uSelPulse = uniforms.uSelPulse;
        shader.uniforms.uSelMin = uniforms.uSelMin;
        shader.uniforms.uSelMax = uniforms.uSelMax;
        /* a gold (selected) copy pulses between the selection widths; every other copy keeps uOutline */
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nuniform float uOutline;\nuniform float uSelPulse;\nuniform float uSelMin;\nuniform float uSelMax;')
          .replace('#include <begin_vertex>',
            '#include <begin_vertex>\n' +
            '#ifdef USE_INSTANCING_COLOR\nfloat slSel = step(0.35, instanceColor.r - instanceColor.b);\n#else\nfloat slSel = 0.0;\n#endif\n' +
            'transformed += normalize(normal) * mix(uOutline, mix(uSelMin, uSelMax, uSelPulse), slSel);');
      };
      m.customProgramCacheKey = outlineKey;
      return m;
    }
    function makeMat(key) {
      var i = key.indexOf(':'), base = i < 0 ? key : key.slice(0, i), arg = i < 0 ? '' : key.slice(i + 1);
      var m;
      switch (base) {
        case 'toon':
          m = new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: tex.ramp(), name: 'toon' });
          m.onBeforeCompile = rimPatch;
          m.customProgramCacheKey = toonKey;
          return m;
        case 'gold': case 'chrome': case 'pearl': case 'smoked': case 'gunmetal': case 'foil':
          return new THREE.MeshMatcapMaterial({ matcap: tex.matcap(base), name: base });
        case 'led': case 'sign':
          /* the emoji face's basic + map program: the 'state' material with the shared atlas */
          m = mat('state').clone();
          m.vertexColors = false; m.transparent = true; m.alphaTest = 0.05; m.name = base;
          m.map = base === 'led' ? ledAtlas().texture : signAtlas().texture;
          return m;
        case 'glass':
          return new THREE.MeshMatcapMaterial({ matcap: tex.matcap('pearl'), transparent: true, opacity: 0.45, depthWrite: false, name: 'glass' });
        case 'neon':
          return new THREE.MeshBasicMaterial({ color: col(arg || 'Neon Pink'), toneMapped: false, name: key });
        case 'glow':
          m = new THREE.MeshBasicMaterial({ color: col(arg || 'Neon Pink'), transparent: true, opacity: 0.45 * hub.show, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, name: key });
          m.visible = hub.show > 0.001;
          glowMats.push(m);
          return m;
        case 'state':
          return new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, toneMapped: false, name: 'state' });
        case 'ink':
          return new THREE.MeshBasicMaterial({ color: inkC().clone(), name: 'ink' });
        case 'line':
          return new THREE.LineBasicMaterial({ color: col(arg || 'Ink'), name: key });
        case 'outline':
          return outlineMat(arg && isFinite(parseFloat(arg)) ? parseFloat(arg) : OUTLINE_W);
        case 'blob':
          /* the LED / sign program (instance colour, alphaTest, not tone-mapped): the colour is
             Blob Shadow already tone-mapped, so it reads exactly as before; alphaTest 0.002 only
             drops the invisible rim (< 0.05% darkening) */
          m = new THREE.MeshBasicMaterial({ color: col('Blob Shadow'), map: tex.blob(), transparent: true, opacity: 0.22, depthWrite: false, alphaTest: 0.002, toneMapped: false, name: 'blob' });
          var nt = neutralTone([m.color.r, m.color.g, m.color.b], BLOB_EXPOSURE);
          m.color.setRGB(nt[0], nt[1], nt[2]);
          return m;
        default:
          warn('unknown material key "' + key + '" (using toon)');
          return null;
      }
    }
    function mat(key) {
      key = key || 'toon';
      var m = mats.get(key);
      if (m) return m;
      m = makeMat(key) || mat('toon');
      mats.set(key, m); allMats.add(m);
      return m;
    }
    /* a sibling of a shared material with some properties changed, sharing its program
       (e.g. edit3d's ghost: K.variant('toon', 'ghost', {transparent: true, opacity: 0.85})) */
    function variant(key, name, patch) {
      var vk = key + '#' + name, v = variants.get(vk);
      if (v) return v;
      var base = mat(key);
      v = base.clone();
      v.onBeforeCompile = base.onBeforeCompile;
      v.customProgramCacheKey = base.customProgramCacheKey;
      if (base.userData && base.userData.uOutline) v.userData.uOutline = base.userData.uOutline;
      if (patch) for (var k in patch) if (Object.prototype.hasOwnProperty.call(patch, k)) v[k] = patch[k];
      v.name = vk;
      variants.set(vk, v); allMats.add(v);
      return v;
    }

    /* ---------------- show mix / rim / outlines ---------------- */
    var showPools = new Set();
    function setShow(k) {
      k = clamp(Number(k) || 0, 0, 1);
      hub.show = k;
      for (var i = 0; i < glowMats.length; i++) { glowMats[i].opacity = 0.45 * k; glowMats[i].visible = k > 0.001; }
      showPools.forEach(function (p) { p.uniforms.uSizeMul.value = 1 + 0.6 * k; p.uniforms.uAlphaMul.value = 0.5 + 0.4 * k; });
    }
    function setRim(color, strength) {
      if (color != null) {
        if (color.isColor) uniforms.uRimColor.value.copy(color);
        else if (normHex(color) && !tryHex(color)) uniforms.uRimColor.value.set(normHex(color));   /* runtime mix (member colour) */
        else uniforms.uRimColor.value.set(hex(color));
      }
      if (strength != null) uniforms.uRimStrength.value = Number(strength) || 0;
    }
    var batches = new Set(), instOutlines = new Set();
    function setOutlines(on) {
      hub.outlinesOn = !!on;
      batches.forEach(function (b) { b._applyOutlines(); });
      instOutlines.forEach(function (m) { m.visible = hub.outlinesOn; });
    }
    function setSelPulse(p) { uniforms.uSelPulse.value = clamp(Number(p) || 0, 0, 1); }

    /* ---------------- grid / catalogue hooks ---------------- */
    var gridBaseY = typeof opts.baseY === 'function' ? opts.baseY : null;
    /* ground height under a placed item. A custom hook gets (x, y, fp, id);
       the default uses grid3d, whose signature is baseY(id, x, y). */
    function baseY(x, y, fp, id) {
      try {
        var v = gridBaseY ? gridBaseY(x, y, fp, id)
          : (root.SLGrid3D && typeof root.SLGrid3D.baseY === 'function' && id) ? root.SLGrid3D.baseY(id, x, y) : 0;
        return isFinite(v) ? Number(v) : 0;
      } catch (e) { return 0; }
    }
    function itemFp(id) {
      var C = root.SLWorldCore;
      try { var it = C && typeof C.item === 'function' ? C.item(id) : null; return it && Array.isArray(it.fp) ? it.fp : null; } catch (e) { return null; }
    }
    function stateKeyOf(id, st) {
      var L = lookNow();
      if (L && typeof L.stateKey === 'function') {
        try { var k = L.stateKey(id, st || {}); if (typeof k === 'string') return k; } catch (e) {}
      }
      return fallbackStateKey(id, st);
    }
    function ctxFor(K, id, st, stateKey) {
      var L = lookNow();
      var look = (L && L.LOOK && L.LOOK[id]) || {};
      st = st || {};
      return {
        id: id, look: look, st: st, stateKey: stateKey != null ? stateKey : stateKeyOf(id, st),
        tier: K.tier, G: K.G, col: col, fp: itemFp(id) || (Array.isArray(look.fp) ? look.fp : null), K: K
      };
    }

    /* ================================================================
       TEMPLATE BUILDER
       .part(name, geos[], matKey, {pivot, perCopy, castShadow, outline, stateColor, receiveShadow = true})
            outline: true (0.018 u) or a width (0.012 for characters)
            stateColor: {key, off: token, on: token, initial: 0..1|bool, map: {value: token}}
              → per-instance colour = lerp(off, on, value) (or map[value]); paint the geometry
                'Cloud White' so the instance colour shows exactly
       .pivot(name, origin [x, y, z], parent = 'root')   parts on a pivot rotate/move about its origin
       .anchor(name, [x, y, z])                          'top', 'door', 'seat', 'spot'…
       .hit([w, h, d])
       .done() → frozen Template {id, stateKey, tier, key, parts, pivots, pivotOrder, anchors, hit, height, radius, tris}
       ================================================================ */
    function TemplateBuilder(K, ctx) {
      this.K = K; this.ctx = ctx || {};
      this._parts = []; this._byName = {}; this._pivots = {}; this._pivotOrder = [];
      this._anchors = {}; this._hit = null; this._placeholder = false;
    }
    TemplateBuilder.prototype.part = function (name, geos, matKey, o) {
      name = String(name || ('part' + this._parts.length));
      var list = flatten(geos, []);
      var ex = this._byName[name];
      if (ex) {
        if (ex.mat === (matKey || 'toon')) { ex.geos = ex.geos.concat(list); return this; }
        warn((this.ctx.id || 'template') + ': part "' + name + '" reused with a different material; renamed');
        name = name + '_' + this._parts.length;
      }
      var p = { name: name, geos: list, mat: matKey || 'toon', o: o || {} };
      this._parts.push(p); this._byName[name] = p;
      return this;
    };
    TemplateBuilder.prototype.pivot = function (name, origin, parent) {
      if (!name || name === 'root') { warn('pivot name "root" is reserved'); return this; }
      if (!this._pivots[name]) this._pivotOrder.push(name);
      this._pivots[name] = { origin: [origin && origin[0] || 0, origin && origin[1] || 0, origin && origin[2] || 0], parent: parent && parent !== 'root' ? parent : null };
      return this;
    };
    TemplateBuilder.prototype.anchor = function (name, pos) {
      this._anchors[name] = [pos && pos[0] || 0, pos && pos[1] || 0, pos && pos[2] || 0];
      return this;
    };
    TemplateBuilder.prototype.hit = function (size) { this._hit = [size[0], size[1], size[2]]; return this; };
    TemplateBuilder.prototype.done = function () {
      var K = this.K, ctx = this.ctx, id = ctx.id || 'item', look = ctx.look || {}, self = this;
      var stateKey = ctx.stateKey != null ? ctx.stateKey : '';
      /* pivots: resolve parents (unknown parent → root) and ancestor chains top → self */
      var pivots = {}, order = [];
      function chainOf(name, depth) {
        var pv = self._pivots[name];
        if (!pv || depth > 16) return [];
        var par = pv.parent && self._pivots[pv.parent] ? pv.parent : null;
        return (par ? chainOf(par, depth + 1) : []).concat([name]);
      }
      this._pivotOrder.slice().sort(function (a, b) { return chainOf(a, 0).length - chainOf(b, 0).length; }).forEach(function (name) {
        var pv = self._pivots[name];
        if (pv.parent && !self._pivots[pv.parent]) warn(id + ': pivot "' + name + '" has unknown parent "' + pv.parent + '"');
        var par = pv.parent && self._pivots[pv.parent] ? pv.parent : null;
        pivots[name] = Object.freeze({ origin: Object.freeze(pv.origin.slice()), parent: par, chain: Object.freeze(chainOf(name, 0)) });
        order.push(name);
      });
      var box = new THREE.Box3(), tris = 0;
      var parts = this._parts.filter(function (p) { return p.geos.length; }).map(function (p) {
        var geo = merge(p.geos);
        geo.computeBoundingBox(); geo.computeBoundingSphere();
        box.union(geo.boundingBox);
        var piv = p.o.pivot && p.o.pivot !== 'root' ? p.o.pivot : null;
        if (piv && !pivots[piv]) { warn(id + ': part "' + p.name + '" uses unknown pivot "' + piv + '"'); piv = null; }
        var ol = p.o.outline === true ? OUTLINE_W : (typeof p.o.outline === 'number' && p.o.outline > 0 ? p.o.outline : 0);
        var t = geo.getAttribute('position').count / 3;
        tris += t;
        return Object.freeze({
          name: p.name, geo: geo, mat: p.mat, pivot: piv, perCopy: !!p.o.perCopy,
          castShadow: !!p.o.castShadow && !piv && !p.o.perCopy,
          receiveShadow: p.o.receiveShadow !== false, outline: ol,
          stateColor: p.o.stateColor ? normStateColor(p.o.stateColor) : null, tris: t
        });
      });
      if (box.isEmpty()) box.set(new THREE.Vector3(-0.3, 0, -0.3), new THREE.Vector3(0.3, 0.6, 0.3));
      var height = box.max.y, size = new THREE.Vector3(), center = new THREE.Vector3();
      box.getSize(size); box.getCenter(center);
      var fp = ctx.fp || [1, 1];
      var hit = this._hit || (Array.isArray(look.hit) ? look.hit.slice(0, 3) : [fp[0], Math.max(look.h || height, 0.8), fp[1]]);
      var anchors = {};
      Object.keys(this._anchors).forEach(function (k) { anchors[k] = Object.freeze(self._anchors[k].slice()); });
      if (!anchors.top) anchors.top = Object.freeze([0, height + 0.15, 0]);
      /* QA budget checks (art bible modellingRules) */
      var staticMats = {};
      parts.forEach(function (p) { if (!p.pivot && !p.perCopy) staticMats[p.mat] = 1; });
      if (Object.keys(staticMats).length > 4) warn(id + ': ' + Object.keys(staticMats).length + ' static materials (max 4)');
      if (parts.length > 6) warn(id + ': ' + parts.length + ' parts (max 6)');
      if (typeof look.tris === 'number' && tris > look.tris) warn(id + ': ' + tris + ' tris > look budget ' + look.tris + ' (' + K.tier + ')');
      return Object.freeze({
        __template: true, id: id, stateKey: stateKey, tier: K.tier, key: id + '#' + stateKey + '#' + K.tier,
        parts: Object.freeze(parts), pivots: Object.freeze(pivots), pivotOrder: Object.freeze(order),
        anchors: Object.freeze(anchors), hit: Object.freeze(hit), height: height,
        radius: size.length() / 2, center: Object.freeze([center.x, center.y, center.z]),
        tris: tris, placeholder: this._placeholder
      });
    };
    function normStateColor(sc) {
      var out = { key: String(sc.key || 'state'), offC: col(sc.off || 'Cloud White'), onC: col(sc.on || sc.off || 'Cloud White'), initial: 0, mapC: null };
      out.initial = sc.initial === true ? 1 : typeof sc.initial === 'number' ? clamp(sc.initial, 0, 1) : 0;
      if (sc.map && typeof sc.map === 'object') {
        out.mapC = {};
        Object.keys(sc.map).forEach(function (k) { out.mapC[k] = col(sc.map[k]); });
      }
      return Object.freeze(out);
    }
    function stateColorInto(sc, v, out) {
      if (typeof v === 'string' && sc.mapC && sc.mapC[v]) return out.copy(sc.mapC[v]);
      var f = v === true ? 1 : v === false ? 0 : typeof v === 'number' ? clamp(v, 0, 1) : sc.initial;
      return out.copy(sc.offC).lerp(sc.onC, f);
    }
    function isTemplate(t) { return !!(t && t.__template); }

    /* ---------------- placeholder ---------------- */
    function placeholder(K, ctx) {
      var look = ctx.look || {}, fp = ctx.fp || [1, 1];
      var w = Math.max(0.3, fp[0] * 0.86), d = Math.max(0.3, fp[1] * 0.86), h = look.h > 0 ? look.h : 0.6;
      var tok = 'Pebble';
      if (look.colors && typeof look.colors === 'object') {
        var vals = Object.keys(look.colors).map(function (k) { return look.colors[k]; });
        for (var i = 0; i < vals.length; i++) if (typeof vals[i] === 'string' && tryHex(vals[i])) { tok = vals[i]; break; }
      }
      var g = K.G.t(K.G.slab(w, h, d), { p: [0, h / 2, 0] });
      K.G.paintBy(g, function (v) { return v.ny > 0.7 ? [tok, 'hi'] : v.ny < -0.5 ? [tok, 'shade'] : tok; });
      var b = new TemplateBuilder(K, ctx);
      b._placeholder = true;
      return b.part('body', [g], 'toon', { castShadow: true }).anchor('top', [0, h + 0.15, 0]).done();
    }

    /* ---------------- template + part caches ---------------- */
    var tcache = new Map(), pcache = new Map();
    function disposeTemplate(t) { t.parts.forEach(function (p) { p.geo.dispose(); }); }
    function buildTemplate(Kt, id, st, stateKey) {
      var ctx = Kt.ctx(id, st, stateKey), m = hub.models[id], tpl = null;
      if (m && typeof m.build === 'function') {
        try {
          tpl = m.build(ctx);
          if (tpl instanceof TemplateBuilder) tpl = tpl.done();
          if (!isTemplate(tpl)) { warn('builder ' + id + ' did not return a Template (placeholder)'); tpl = null; }
        } catch (e) { warn('builder ' + id + ' threw: ' + (e && e.message ? e.message : e) + ' (placeholder)'); tpl = null; }
      } else warn('no model for ' + id + ' (placeholder)');
      return tpl || placeholder(Kt, ctx);
    }
    function templateGet(id, stateKey, tier, st) {
      tier = parseTier(tier) || 'MID';
      if (stateKey == null) stateKey = stateKeyOf(id, st);
      var k = id + '#' + stateKey + '#' + tier, e = tcache.get(k);
      if (e) { tcache.delete(k); tcache.set(k, e); return e.tpl; }
      var tpl = buildTemplate(kit(tier), id, st, stateKey);
      tcache.set(k, { tpl: tpl, refs: 0 });
      trim();
      return tpl;
    }
    function ref(tpl, d) {
      var e = tpl && tcache.get(tpl.key);
      if (e && e.tpl === tpl) e.refs = Math.max(0, e.refs + d);
    }
    function trim(limit) {
      limit = limit || TEMPLATE_CAP;
      if (tcache.size <= limit) return;
      var keys = Array.from(tcache.keys());
      for (var i = 0; i < keys.length && tcache.size > limit; i++) {
        var e = tcache.get(keys[i]);
        if (e.refs > 0) continue;
        disposeTemplate(e.tpl);
        tcache.delete(keys[i]);
      }
    }
    function disposeDeep(v, depth) {
      if (!v || (depth || 0) > 3) return;
      if (v.isBufferGeometry) { v.dispose(); return; }
      if (isTemplate(v)) { disposeTemplate(v); return; }
      if (Array.isArray(v)) { v.forEach(function (x) { disposeDeep(x, (depth || 0) + 1); }); return; }
      if (typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) Object.keys(v).forEach(function (k) { disposeDeep(v[k], (depth || 0) + 1); });
    }
    function partGet(key, tier, fn) {
      tier = parseTier(tier) || 'MID';
      var k = key + '#' + tier;
      if (pcache.has(k)) return pcache.get(k);
      var v = fn(kit(tier));
      pcache.set(k, v);
      return v;
    }

    /* ---------------- instanced mesh helper ---------------- */
    var WHITE = new THREE.Color(1, 1, 1), INK = null, GOLD = null;
    /* hull ink: MATERIAL.outline.token (Midnight Ink), or v1 Ink without world-look */
    function inkC() {
      if (INK) return INK;
      var L = lookNow(), o = L && L.MATERIAL && L.MATERIAL.outline, tok = o && typeof o.token === 'string' && tryHex(o.token) ? o.token : 'Ink';
      return (INK = col(tok));
    }
    function goldC() {
      if (GOLD) return GOLD;
      var L = lookNow(), o = L && L.MATERIAL && L.MATERIAL.outline, tok = o && typeof o.selected === 'string' && tryHex(o.selected) ? o.selected : 'Star Gold';
      return (GOLD = col(tok));
    }
    /* does this template's look kind keep a character hull? (OUTLINE_KINDS: pets, accessories, avatar) */
    function charHull(id) {
      var L = lookNow(), e = L && L.LOOK && L.LOOK[id], kinds = (L && L.OUTLINE_KINDS) || OUTLINE_KINDS_FALLBACK;
      if (e) return !!kinds[e.kind];
      return /^(pet|acc)_/.test(String(id || ''));
    }
    /* a flagged part's hull width: characters keep their own (true → OUTLINE_CHAR); architecture
       only ever shows the selection hull */
    function hullWidth(part, character) {
      if (!character) return OUTLINE_W;
      return part.outline === OUTLINE_W ? OUTLINE_CHAR : part.outline;
    }
    function newIM(geo, m, cap) {
      var im = new THREE.InstancedMesh(geo, m, cap);
      im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
      return im;
    }

    /* ================================================================
       ITEM BATCH — every placed copy of one (id, stateKey): one InstancedMesh
       per part (capacity 4, doubling), instanceColor always allocated so all
       static items share one toon program. With opts.merge the parts the merged
       layer accepts draw there instead (their InstancedMesh stays out of the scene;
       hulls stay here) — the API below is the same either way. Static parts are written on add /
       move only; pivoted parts while their idle or act runs; the reserved
       pivot 'root' (alias 'sway' when the template has none) moves the whole
       copy (squish, sway, drop-in). perCopy parts are one InstancedMesh(1)
       per copy with their own geometry for CPU waves.
         add(uid, {x, y, fp, baseY, pos:[x,y,z], yaw}, {jitter}), move(uid, x, y, place?), remove(uid)
           jitter: SLIslandLook.jitter2's {yaw, sx, sy, sz, lean, leanAxis, tint: {l, h}} (or the
           v1 {yaw, scale}); move(…, {jitter}) re-jitters. The tint multiplies the instance colour
           of every non-state part.
         hide(uid) / show(uid), setState(uid, key, value), setHighlight(uid, 0|1|2)
         pivot(uid, name) → Matrix4 to write;  setPivot(uid, name, rotDeg[], pos[], scale)
         resetPivots(uid), commit(), anchorWorld(uid, name, outV3), worldPos(uid, outV3)
         copyGeometry(uid, part), basePositions(part), has(uid), uids(), count, dispose()
       opts: {capacity, material(matKey, part) → Material override, castShadow = true, outlines = true,
              merge: a K.merger() — its eligible parts draw there (see MERGED LAYER), the rest here}
       ================================================================ */
    function ItemBatch(K, tpl, o) {
      if (!isTemplate(tpl)) throw new Error('K.batch needs a Template (K.template(ctx)…done())');
      o = o || {};
      this.K = K; this.template = tpl;
      this.group = new THREE.Group();
      this.group.name = 'batch:' + tpl.id + (tpl.stateKey ? '|' + tpl.stateKey : '');
      this.cap = Math.max(1, o.capacity || 4);
      this.n = 0; this.recs = []; this.index = new Map();
      this.fp = o.fp || itemFp(tpl.id) || [1, 1];
      this._matFor = typeof o.material === 'function' ? o.material : null;
      this._wantOutlines = K.tier !== 'LOW' && o.outlines !== false && hub.outlinesOn;
      /* architecture: the hull is the edit selection hull only, shown for highlighted copies */
      this._charHull = charHull(tpl.id);
      this._selOnly = !this._charHull;
      this._castShadow = o.castShadow !== false;
      this._mg = o.merge && o.merge.isMerger && !o.merge.disposed ? o.merge : null;
      this._dirty = []; this._structural = false; this._disposed = false;
      this._slots = []; this._copyParts = []; this._copyMg = []; this._merged = false;
      for (var i = 0; i < tpl.parts.length; i++) {
        var p = tpl.parts[i];
        if (p.perCopy) {
          var cg = this._mg ? this._mg.groupFor(this._mat(p), false, p.receiveShadow) : null;
          this._copyParts.push(p); this._copyMg.push(cg);
          if (cg) this._merged = true;
        } else {
          var sl = this._makeSlot(p, this.cap);
          this._slots.push(sl);
          if (sl.mg) this._merged = true;
        }
      }
      ref(tpl, 1);
      batches.add(this);
    }
    ItemBatch.prototype._mat = function (p) {
      var m = this._matFor ? this._matFor(p.mat, p) : null;
      return m || mat(p.mat);
    };
    ItemBatch.prototype._makeSlot = function (p, cap) {
      var mesh = newIM(p.geo, this._mat(p), cap);
      mesh.name = p.name;
      mesh.castShadow = this._castShadow && p.castShadow;
      mesh.receiveShadow = p.receiveShadow;
      mesh.frustumCulled = !p.pivot;
      if (p.pivot) mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0; mesh.visible = false;
      /* a merged part never draws here: its mesh stays out of the scene graph, so a compile never
         warms a program nothing draws (its hull, if any, still lives here) */
      var mg = this._mg ? this._mg.groupFor(mesh.material, mesh.castShadow, mesh.receiveShadow) : null;
      if (!mg) this.group.add(mesh);
      var out = null;
      if (p.outline && this._wantOutlines) {
        out = newIM(p.geo, mat('outline:' + hullWidth(p, this._charHull)), cap);
        out.name = p.name + ':outline';
        /* a selection hull's bounds change with the selection: never cull it on stale bounds */
        out.frustumCulled = this._selOnly ? false : mesh.frustumCulled;
        if (p.pivot || this._selOnly) out.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        out.count = 0; out.visible = false;
        this.group.add(out);
      }
      return { part: p, mesh: mesh, outline: out, m: false, c: false, mg: mg };
    };
    /* the merged layer: a bone per pivot the copy's merged parts hang on ('' = its root) and one
       entry per merged part (rec.ms[slot], rec.mc[copy part]) */
    function mergeBone(mg, rec, pivot) {
      var key = pivot || '';
      if (rec.mb[key] == null) rec.mb[key] = mg._allocBone();
      return rec.mb[key];
    }
    ItemBatch.prototype._mergeIn = function (rec) {
      var mg = this._mg, k;
      rec.mb = {}; rec.ms = []; rec.mc = null;
      for (k = 0; k < this._slots.length; k++) {
        var s = this._slots[k];
        rec.ms.push(s.mg ? mg._add(s.mg, rec, s.part, s.part.geo, false, mergeBone(mg, rec, s.part.pivot)) : null);
      }
      if (rec.copies) {
        rec.mc = [];
        for (k = 0; k < rec.copies.length; k++) {
          var c = rec.copies[k], cg = this._copyMg[k];
          rec.mc.push(cg ? mg._add(cg, rec, c.part, c.mesh.geometry, true, mergeBone(mg, rec, c.part.pivot)) : null);
          if (cg) c.mesh.visible = false;
        }
      }
    };
    ItemBatch.prototype._mergeScale = function (rec) {
      var k;
      for (k = 0; k < rec.ms.length; k++) if (rec.ms[k]) this._mg._rescale(rec.ms[k], rec);
      if (rec.mc) for (k = 0; k < rec.mc.length; k++) if (rec.mc[k]) this._mg._rescale(rec.mc[k], rec);
    };
    ItemBatch.prototype._mergeOut = function (rec) {
      var mg = this._mg, k;
      if (!mg || !rec.mb) return;
      for (k = 0; k < rec.ms.length; k++) if (rec.ms[k]) mg._remove(rec.ms[k]);
      if (rec.mc) for (k = 0; k < rec.mc.length; k++) if (rec.mc[k]) mg._remove(rec.mc[k]);
      if (!mg.disposed) for (var key in rec.mb) mg._freeBone(rec.mb[key]);
      rec.mb = null; rec.ms = null; rec.mc = null;
    };
    /* is any copy highlighted? (selection-only hulls draw nothing otherwise) */
    ItemBatch.prototype._anyHl = function () {
      for (var i = 0; i < this.n; i++) if (this.recs[i].hl) return true;
      return false;
    };
    ItemBatch.prototype._hullVisible = function () {
      return this.n > 0 && hub.outlinesOn && (!this._selOnly || this._anyHl());
    };
    function regrow(group, old, cap) {
      var im = newIM(old.geometry, old.material, cap);
      im.instanceMatrix.array.set(old.instanceMatrix.array);
      im.instanceColor.array.set(old.instanceColor.array);
      im.instanceMatrix.setUsage(old.instanceMatrix.usage);
      im.name = old.name; im.castShadow = old.castShadow; im.receiveShadow = old.receiveShadow;
      im.frustumCulled = old.frustumCulled; im.visible = old.visible; im.renderOrder = old.renderOrder;
      im.count = old.count;
      var inGraph = old.parent === group;                  /* a merged slot's mesh stays out of it */
      group.remove(old);
      if (inGraph) group.add(im);
      old.dispose();
      return im;
    }
    ItemBatch.prototype._grow = function (cap) {
      for (var i = 0; i < this._slots.length; i++) {
        var s = this._slots[i];
        s.mesh = regrow(this.group, s.mesh, cap);
        if (s.outline) s.outline = regrow(this.group, s.outline, cap);
      }
      this.cap = cap;
    };
    ItemBatch.prototype._rec = function (uid) { var i = this.index.get(uid); return i == null ? null : this.recs[i]; };
    ItemBatch.prototype._mark = function (rec, lvl) {
      if (!rec.dirty) this._dirty.push(rec);
      if (lvl > rec.dirty) rec.dirty = lvl;
    };
    ItemBatch.prototype._place = function (rec, place, jitter) {
      place = place || {};
      var fp = place.fp || rec.fp || this.fp;
      rec.fp = fp;
      if (Array.isArray(place.pos)) rec.pos.set(place.pos[0], place.pos[1], place.pos[2]);
      else {
        var x = place.x != null ? place.x : rec.x, y = place.y != null ? place.y : rec.y;
        rec.x = x; rec.y = y;
        var by = place.baseY != null ? place.baseY : baseY(x, y, fp, this.template.id);
        rec.pos.set(x + fp[0] / 2 - 8, by, y + fp[1] / 2 - 5);
      }
      if (jitter) {
        var j = normJitter(jitter, _jit);
        rec.jYaw = j.yaw; rec.sx = j.sx; rec.sy = j.sy; rec.sz = j.sz; rec.lean = j.lean; rec.leanAxis = j.leanAxis;
        rec.tint = j.tl !== 1 || j.th !== 0 ? tintMul(j.tl, j.th, rec.tint || [1, 1, 1]) : null;
        if (rec.mb) this._mergeScale(rec);                    /* merged vertices carry the scale */
      }
      if (place.yaw != null) rec.yaw = place.yaw * DEG;
      jitterQuat(rec.yaw / DEG + rec.jYaw, rec.lean, rec.leanAxis, _jq);
      _q.set(_jq[0], _jq[1], _jq[2], _jq[3]);
      _s.set(rec.sx, rec.sy, rec.sz);
      rec.item.compose(rec.pos, _q, _s);
    };
    ItemBatch.prototype.add = function (uid, place, o) {
      if (this._disposed) return -1;
      if (this.index.has(uid)) { this.move(uid, place && place.x, place && place.y, place); return this.index.get(uid); }
      if (this.n >= this.cap) this._grow(this.cap * 2);
      var i = this.n++, self = this;
      var rec = {
        uid: uid, i: i, x: 0, y: 0, fp: null, pos: new THREE.Vector3(), yaw: 0,
        jYaw: 0, sx: 1, sy: 1, sz: 1, lean: 0, leanAxis: 0, tint: null,
        item: new THREE.Matrix4(), root: new THREE.Matrix4(), rootAnim: false, piv: {},
        hidden: false, hl: 0, state: {}, copies: null, dirty: 0, mb: null, ms: null, mc: null
      };
      this.template.pivotOrder.forEach(function (n) { rec.piv[n] = new THREE.Matrix4(); });
      this.recs[i] = rec; this.index.set(uid, i);
      this._place(rec, place, o && o.jitter);
      if (this._copyParts.length) {
        rec.copies = this._copyParts.map(function (p, k) {
          var mm = newIM(p.geo.clone(), self._mat(p), 1);
          mm.count = 1; mm.name = p.name + ':' + uid;
          mm.castShadow = false; mm.receiveShadow = p.receiveShadow; mm.frustumCulled = false;
          if (!self._copyMg[k]) self.group.add(mm);         /* merged: only its geometry is used */
          return { part: p, mesh: mm };
        });
      }
      if (this._merged) this._mergeIn(rec);
      this._writeColors(rec);
      this._mark(rec, 2);
      this._structural = true;
      return i;
    };
    ItemBatch.prototype.move = function (uid, x, y, place) {
      var rec = this._rec(uid);
      if (!rec) return false;
      var p = { x: x, y: y };
      if (place) { p.fp = place.fp; p.baseY = place.baseY; p.pos = place.pos; p.yaw = place.yaw; }
      this._place(rec, p, place && place.jitter);
      if (place && place.jitter) this._writeColors(rec);
      this._mark(rec, 2);
      this._structural = true;
      return true;
    };
    ItemBatch.prototype.remove = function (uid) {
      var i = this.index.get(uid);
      if (i == null) return false;
      var rec = this.recs[i], last = this.n - 1, self = this;
      this._mergeOut(rec);
      if (rec.copies) rec.copies.forEach(function (c) { self.group.remove(c.mesh); c.mesh.geometry.dispose(); c.mesh.dispose(); });
      this.index.delete(uid);
      rec.i = -1;
      if (i !== last) {
        var mv = this.recs[last];
        this.recs[i] = mv; mv.i = i;
        this.index.set(mv.uid, i);
        this._writeColors(mv);
        this._mark(mv, 2);
      }
      this.recs.length = last;
      this.n = last;
      this._structural = true;
      return true;
    };
    ItemBatch.prototype.hide = function (uid) { var r = this._rec(uid); if (r && !r.hidden) { r.hidden = true; this._mark(r, 2); } return this; };
    ItemBatch.prototype.show = function (uid) { var r = this._rec(uid); if (r && r.hidden) { r.hidden = false; this._mark(r, 2); } return this; };
    ItemBatch.prototype.pivot = function (uid, name) {
      var rec = this._rec(uid);
      if (!rec) return SINK;
      if (name === 'root' || (name === 'sway' && !this.template.pivots.sway)) { rec.rootAnim = true; this._mark(rec, 2); return rec.root; }
      var m = rec.piv[name];
      if (!m) { warn(this.template.id + ': no pivot "' + name + '"'); return SINK; }
      this._mark(rec, 1);
      return m;
    };
    ItemBatch.prototype.setPivot = function (uid, name, rotDeg, pos, scale) {
      var m = this.pivot(uid, name);
      if (m === SINK) return this;
      _e.set(rotDeg ? (rotDeg[0] || 0) * DEG : 0, rotDeg ? (rotDeg[1] || 0) * DEG : 0, rotDeg ? (rotDeg[2] || 0) * DEG : 0, 'XYZ');
      _q.setFromEuler(_e);
      _p.set(pos ? pos[0] || 0 : 0, pos ? pos[1] || 0 : 0, pos ? pos[2] || 0 : 0);
      if (scale == null) _s.set(1, 1, 1);
      else if (typeof scale === 'number') _s.set(scale, scale, scale);
      else _s.set(scale[0], scale[1], scale[2]);
      m.compose(_p, _q, _s);
      return this;
    };
    ItemBatch.prototype.resetPivots = function (uid) {
      var rec = this._rec(uid);
      if (!rec) return this;
      rec.root.identity(); rec.rootAnim = false;
      for (var n in rec.piv) rec.piv[n].identity();
      this._mark(rec, 2);
      return this;
    };
    ItemBatch.prototype._chain = function (rec, pivotName, base, out) {
      out.copy(base);
      var pv = this.template.pivots[pivotName], chain = pv.chain;
      for (var k = 0; k < chain.length; k++) {
        var o = this.template.pivots[chain[k]].origin;
        _m2.makeTranslation(o[0], o[1], o[2]); out.multiply(_m2);
        out.multiply(rec.piv[chain[k]]);
        _m2.makeTranslation(-o[0], -o[1], -o[2]); out.multiply(_m2);
      }
      return out;
    };
    ItemBatch.prototype._write = function (rec, lvl) {
      var i = rec.i, k, s, p, mg = rec.mb ? this._mg : null;
      if (rec.rootAnim) _base.multiplyMatrices(rec.item, rec.root); else _base.copy(rec.item);
      for (k = 0; k < this._slots.length; k++) {
        s = this._slots[k]; p = s.part;
        if (lvl < 2 && !p.pivot) continue;
        if (rec.hidden) _w.copy(ZERO);
        else if (p.pivot) this._chain(rec, p.pivot, _base, _w);
        else _w.copy(_base);
        if (s.mg) { if (mg) mg._bone(rec.mb[p.pivot || ''], _w, rec, rec.ms[k]); }   /* the merged part rides its bone */
        else _w.toArray(s.mesh.instanceMatrix.array, i * 16);
        if (!s.mg || s.outline) s.m = true;
        if (s.outline) (this._selOnly && !rec.hl ? ZERO : _w).toArray(s.outline.instanceMatrix.array, i * 16);
      }
      if (rec.copies) {
        for (k = 0; k < rec.copies.length; k++) {
          var c = rec.copies[k];
          if (rec.hidden) _w.copy(ZERO);
          else if (c.part.pivot) this._chain(rec, c.part.pivot, _base, _w); else _w.copy(_base);
          if (mg && rec.mc[k]) { mg._bone(rec.mb[c.part.pivot || ''], _w, rec, rec.mc[k]); continue; }
          _w.toArray(c.mesh.instanceMatrix.array, 0);
          c.mesh.instanceMatrix.needsUpdate = true;
          c.mesh.visible = !rec.hidden;
        }
      }
    };
    /* a non-state part's instance colour: white, or the copy's jitter tint */
    function baseColorInto(rec, out) { return rec.tint ? out.setRGB(rec.tint[0], rec.tint[1], rec.tint[2]) : out.copy(WHITE); }
    ItemBatch.prototype._writeColors = function (rec) {
      var i = rec.i, k, s, p;
      for (k = 0; k < this._slots.length; k++) {
        s = this._slots[k]; p = s.part;
        if (p.stateColor) stateColorInto(p.stateColor, rec.state[p.stateColor.key], _c); else baseColorInto(rec, _c);
        if (rec.ms && rec.ms[k]) this._mg._color(rec.ms[k], _c);       /* baked into the merged vertex colours */
        else _c.toArray(s.mesh.instanceColor.array, i * 3);
        if (s.outline) { (rec.hl ? goldC() : inkC()).toArray(s.outline.instanceColor.array, i * 3); }
        s.c = true;
      }
      if (rec.copies) {
        for (k = 0; k < rec.copies.length; k++) {
          var cp = rec.copies[k];
          if (cp.part.stateColor) stateColorInto(cp.part.stateColor, rec.state[cp.part.stateColor.key], _c); else baseColorInto(rec, _c);
          if (rec.mc && rec.mc[k]) { this._mg._color(rec.mc[k], _c); continue; }
          _c.toArray(cp.mesh.instanceColor.array, 0);
          cp.mesh.instanceColor.needsUpdate = true;
        }
      }
    };
    ItemBatch.prototype.setState = function (uid, key, value) {
      var rec = this._rec(uid);
      if (!rec) return this;
      rec.state[key] = value;
      var i = rec.i, k;
      for (k = 0; k < this._slots.length; k++) {
        var s = this._slots[k], sc = s.part.stateColor;
        if (!sc || sc.key !== key) continue;
        stateColorInto(sc, value, _c);
        if (rec.ms && rec.ms[k]) { this._mg._color(rec.ms[k], _c); continue; }
        _c.toArray(s.mesh.instanceColor.array, i * 3);
        s.mesh.instanceColor.needsUpdate = true;
      }
      if (rec.copies) {
        for (k = 0; k < rec.copies.length; k++) {
          var cp = rec.copies[k], sc2 = cp.part.stateColor;
          if (!sc2 || sc2.key !== key) continue;
          stateColorInto(sc2, value, _c);
          if (rec.mc && rec.mc[k]) { this._mg._color(rec.mc[k], _c); continue; }
          _c.toArray(cp.mesh.instanceColor.array, 0);
          cp.mesh.instanceColor.needsUpdate = true;
        }
      }
      return this;
    };
    /* 0 none | 1 focus | 2 selected: the outline hull turns Star Gold (selected copies
       also pulse with K.setSelPulse). LOW has no hulls; edit3d draws its own ring there. */
    ItemBatch.prototype.setHighlight = function (uid, level) {
      var rec = this._rec(uid);
      if (!rec) return this;
      var was = rec.hl;
      rec.hl = level | 0;
      for (var k = 0; k < this._slots.length; k++) {
        var s = this._slots[k];
        if (!s.outline) continue;
        (rec.hl ? goldC() : inkC()).toArray(s.outline.instanceColor.array, rec.i * 3);
        s.outline.instanceColor.needsUpdate = true;
      }
      /* selection-only hulls: write (or zero) this copy's hull and show the hull mesh only while selected */
      if (this._selOnly && !was !== !rec.hl) { this._mark(rec, 2); this.commit(); this._applyOutlines(); }
      return this;
    };
    ItemBatch.prototype.commit = function () {
      if (this._disposed) return this;
      var d, k, s;
      for (d = 0; d < this._dirty.length; d++) {
        var rec = this._dirty[d], lvl = rec.dirty;
        rec.dirty = 0;
        if (rec.i < 0 || this.recs[rec.i] !== rec) continue;
        this._write(rec, lvl);
      }
      this._dirty.length = 0;
      for (k = 0; k < this._slots.length; k++) {
        s = this._slots[k];
        if (s.m) { if (!s.mg) s.mesh.instanceMatrix.needsUpdate = true; if (s.outline) s.outline.instanceMatrix.needsUpdate = true; s.m = false; }
        if (s.c) { if (!s.mg) s.mesh.instanceColor.needsUpdate = true; if (s.outline) s.outline.instanceColor.needsUpdate = true; s.c = false; }
      }
      if (this._structural) {
        this._structural = false;
        for (k = 0; k < this._slots.length; k++) {
          s = this._slots[k];
          s.mesh.count = this.n; s.mesh.visible = this.n > 0 && !s.mg;
          if (this.n && s.mesh.frustumCulled && !s.mg) {
            s.mesh.computeBoundingSphere();
            s.mesh.boundingSphere.radius += 0.25;    /* room for squish / sway */
          }
          if (s.outline) {
            s.outline.count = this.n; s.outline.visible = this._hullVisible();
            if (this.n && s.outline.frustumCulled) { s.outline.computeBoundingSphere(); s.outline.boundingSphere.radius += 0.25; }
          }
        }
      }
      return this;
    };
    ItemBatch.prototype._applyOutlines = function () {
      for (var k = 0; k < this._slots.length; k++) {
        var s = this._slots[k];
        if (s.outline) s.outline.visible = this._hullVisible();
      }
    };
    ItemBatch.prototype.anchorWorld = function (uid, name, out) {
      var rec = this._rec(uid);
      out = out || new THREE.Vector3();
      if (!rec) return out.set(0, 0, 0);
      var a = this.template.anchors[name] || this.template.anchors.top;
      out.set(a[0], a[1], a[2]);
      if (rec.rootAnim) out.applyMatrix4(rec.root);
      return out.applyMatrix4(rec.item);
    };
    ItemBatch.prototype.worldPos = function (uid, out) {
      var rec = this._rec(uid);
      out = out || new THREE.Vector3();
      return rec ? out.copy(rec.pos) : out.set(0, 0, 0);
    };
    /* perCopy parts: the copy's own geometry (deform its position array, then set needsUpdate) */
    ItemBatch.prototype.copyGeometry = function (uid, partName) {
      var rec = this._rec(uid);
      if (!rec || !rec.copies) return null;
      for (var k = 0; k < rec.copies.length; k++) if (rec.copies[k].part.name === partName) return rec.copies[k].mesh.geometry;
      return null;
    };
    /* the template's rest positions for a part (read-only; the baseline for CPU waves) */
    ItemBatch.prototype.basePositions = function (partName) {
      var ps = this.template.parts;
      for (var k = 0; k < ps.length; k++) if (ps[k].name === partName) return ps[k].geo.getAttribute('position').array;
      return null;
    };
    ItemBatch.prototype.has = function (uid) { return this.index.has(uid); };
    ItemBatch.prototype.uids = function () { return this.recs.map(function (r) { return r.uid; }); };
    Object.defineProperty(ItemBatch.prototype, 'count', { get: function () { return this.n; } });
    ItemBatch.prototype.dispose = function () {
      if (this._disposed) return;
      this._disposed = true;
      var self = this;
      this.recs.forEach(function (rec) {
        self._mergeOut(rec);
        if (rec.copies) rec.copies.forEach(function (c) { c.mesh.geometry.dispose(); c.mesh.dispose(); });
      });
      this._slots.forEach(function (s) { s.mesh.dispose(); if (s.outline) s.outline.dispose(); });
      if (this.group.parent) this.group.parent.remove(this.group);
      this.group.clear();
      this.recs = []; this.index.clear(); this.n = 0;
      ref(this.template, -1);
      batches.delete(self);
    };

    /* ================================================================
       MERGED LAYER (perf) — the island's item draw calls, one per material instead of one per
       part of every (id, stateKey). K.merger({name, additive = true}) → Merger
         {group (add it to the scene), commit() once a frame after the batches' commits,
          info() → {groups, calls, entries, vertices, bones}, dispose()}
         K.batch(tpl, {merge: merger}) joins it.
       Every eligible part of every copy — static, pivoted and perCopy alike — is baked into ONE
       rigid-skinned mesh per (material, castShadow, receiveShadow). Each vertex rides one bone:
       the copy's root or the pivot its part hangs on, whose matrix is exactly the transform the
       batch would have written into its InstancedMesh, × the copy's jitter scale⁻¹ (the
       vertices are baked pre-scaled, so normals stay exact at rest and a moved copy only moves
       its bones). Instance colours (state colours, jitter tints) are baked into the vertex
       colours and re-baked for that copy's range when they change; perCopy geometry is copied
       in when its attributes' versions move. Hidden copies get a zero bone.
       Programs: skinned toon and skinned 'state' are the pet rigs' own programs. A material
       without vertex colours ('neon:*', 'glow:*') draws through a cached vertex-colour twin
       that follows its colour, opacity and visibility, so neon joins skinned 'state';
       additive parts (glow, beams) share one skinned additive program and casters on the
       shadow tiers one skinned depth program. Maps, matcaps, normal-blend transparency,
       hulls and custom shaders stay in their batches.
       Structural changes (copies added or removed, a re-jitter) rebuild only the groups they
       touch, at the next commit(); a frame without them allocates nothing.
       ================================================================ */
    var BASE_OBC = THREE.Material.prototype.onBeforeCompile, BASE_CPK = THREE.Material.prototype.customProgramCacheKey;
    var IDENT = new THREE.Matrix4(), mergers = new Set(), twins = new Map();
    /* how a material merges: 'toon' | 'basic' | 'additive' | null (stays in its batch) */
    function mergeClass(m, additive) {
      if (!m || !m.isMaterial || m.map || m.alphaMap || m.alphaTest > 0 || m.side !== THREE.FrontSide || m.wireframe || m.flatShading) return null;
      if (m.isMeshToonMaterial) return m.vertexColors && !m.transparent && m.fog && m.onBeforeCompile === rimPatch && m.customProgramCacheKey === toonKey ? 'toon' : null;
      if (!m.isMeshBasicMaterial || m.toneMapped !== false || !m.fog || m.envMap || m.lightMap || m.aoMap || m.specularMap) return null;
      if (m.onBeforeCompile !== BASE_OBC || m.customProgramCacheKey !== BASE_CPK) return null;
      if (!m.transparent && m.blending === THREE.NormalBlending) return 'basic';
      if (additive && m.transparent && m.blending === THREE.AdditiveBlending && !m.depthWrite) return 'additive';
      return null;
    }
    /* the material a merged group draws with: the part's own, or its vertex-colour twin */
    function twinOf(m) {
      if (m.vertexColors) return m;
      var t = twins.get(m);
      if (t) return t;
      t = m.clone();
      t.vertexColors = true; t.name = (m.name || 'mat') + '#merged';
      twins.set(m, t); allMats.add(t);
      return t;
    }
    function Merger(o) {
      o = o || {};
      this.isMerger = true; this.disposed = false;
      this.additive = o.additive !== false;
      this.group = new THREE.Group();
      this.group.name = o.name || 'merged';
      this.groups = new Map(); this.list = [];
      /* bone 0 stays zero: a removed copy's vertices are pointed at it (a hole until compaction) */
      this.skel = null; this.cap = 0; this.free = []; this.top = 1; this.boneDirty = false;
      this._growBones(64);
      mergers.add(this);
    }
    Merger.prototype._growBones = function (cap) {
      var bones = [];
      for (var i = 0; i < cap; i++) bones.push(new THREE.Bone());
      var sk = new THREE.Skeleton(bones), self = this;
      sk.computeBoneTexture();
      if (this.skel) { sk.boneMatrices.set(this.skel.boneMatrices.subarray(0, this.cap * 16)); this.skel.dispose(); }
      /* the matrices are written straight into boneMatrices: upload them only when a bone moved */
      sk.update = function () { if (self.boneDirty && this.boneTexture) { this.boneTexture.needsUpdate = true; self.boneDirty = false; } };
      this.skel = sk; this.cap = cap; this.boneDirty = true;
      for (var g = 0; g < this.list.length; g++) if (this.list[g].mesh) this.list[g].mesh.bind(sk, IDENT);
    };
    Merger.prototype._allocBone = function () {
      if (this.free.length) return this.free.pop();
      if (this.top >= this.cap) this._growBones(this.cap * 2);
      return this.top++;
    };
    Merger.prototype._freeBone = function (i) {
      var e = this.skel.boneMatrices, b = i * 16;
      for (var k = 0; k < 16; k++) e[b + k] = 0;
      this.free.push(i); this.boneDirty = true;
    };
    /* bone i = m × diag(1/sx, 1/sy, 1/sz) (the copy's jitter scale, baked into its vertices); e: the
       entry riding it, whose normals follow a non-rigid bone (see _bend) */
    Merger.prototype._bone = function (i, m, rec, e) {
      var o = this.skel.boneMatrices, s = m.elements, b = i * 16, ix = 1 / rec.sx, iy = 1 / rec.sy, iz = 1 / rec.sz;
      o[b] = s[0] * ix; o[b + 1] = s[1] * ix; o[b + 2] = s[2] * ix; o[b + 3] = s[3] * ix;
      o[b + 4] = s[4] * iy; o[b + 5] = s[5] * iy; o[b + 6] = s[6] * iy; o[b + 7] = s[7] * iy;
      o[b + 8] = s[8] * iz; o[b + 9] = s[9] * iz; o[b + 10] = s[10] * iz; o[b + 11] = s[11] * iz;
      o[b + 12] = s[12]; o[b + 13] = s[13]; o[b + 14] = s[14]; o[b + 15] = s[15];
      this.boneDirty = true;
      if (e) this._bend(e, s, rec);
    };
    /* skinning turns a normal by the bone itself, an InstancedMesh by its inverse transpose: the
       same while the bone is a rotation (× a uniform scale), which it is at rest. Under a non-rigid
       bone (a tap squish, a squash-and-stretch pivot) the entry's normals are re-baked as
       S·(WᵀW)⁻¹·n, which the bone W·S⁻¹ turns into W⁻ᵀ·n exactly (W = the copy's whole transform);
       back to rigid, they are re-baked at rest. Under BEND_TOL of anisotropy (≈ 0.9° at worst: the
       flowers' 2% bob) the bone counts as rigid. */
    var BEND_TOL = 0.015;
    Merger.prototype._bend = function (e, s, rec) {
      var ix = 1 / rec.sx, iy = 1 / rec.sy, iz = 1 / rec.sz;
      var g00 = s[0] * s[0] + s[1] * s[1] + s[2] * s[2], g11 = s[4] * s[4] + s[5] * s[5] + s[6] * s[6], g22 = s[8] * s[8] + s[9] * s[9] + s[10] * s[10];
      var g01 = s[0] * s[4] + s[1] * s[5] + s[2] * s[6], g02 = s[0] * s[8] + s[1] * s[9] + s[2] * s[10], g12 = s[4] * s[8] + s[5] * s[9] + s[6] * s[10];
      /* A = W·S⁻¹: rigid when AᵀA is a multiple of I */
      var a00 = g00 * ix * ix, a11 = g11 * iy * iy, a22 = g22 * iz * iz, mean = (a00 + a11 + a22) / 3;
      if (!(mean > 1e-12)) return;                           /* collapsed (hidden, stored away): nothing is lit */
      var tol = 2 * BEND_TOL * mean;
      var rigid = Math.abs(a00 - mean) < tol && Math.abs(a11 - mean) < tol && Math.abs(a22 - mean) < tol &&
        Math.abs(g01 * ix * iy) < tol && Math.abs(g02 * ix * iz) < tol && Math.abs(g12 * iy * iz) < tol;
      if (rigid) {
        if (!e.bend) return;
        e.bend = null;
      } else {
        /* (WᵀW)⁻¹ up to its (positive) determinant — the normals are normalised anyway */
        var c00 = g11 * g22 - g12 * g12, c01 = g02 * g12 - g01 * g22, c02 = g01 * g12 - g02 * g11;
        var c11 = g00 * g22 - g02 * g02, c12 = g01 * g02 - g00 * g12, c22 = g00 * g11 - g01 * g01;
        var B = e.bendM || (e.bendM = new Float64Array(9));
        B[0] = rec.sx * c00; B[1] = rec.sx * c01; B[2] = rec.sx * c02;
        B[3] = rec.sy * c01; B[4] = rec.sy * c11; B[5] = rec.sy * c12;
        B[6] = rec.sz * c02; B[7] = rec.sz * c12; B[8] = rec.sz * c22;
        e.bend = B;
      }
      var g = e.g;
      if (g.dirty || !g.mesh) return;                        /* the rebuild bakes them */
      var na = g.mesh.geometry.getAttribute('normal');
      bakeNormals(e, na.array);
      markRange(na, e.rN, e);
    };
    /* the group a part of material m joins, or null (it stays in its batch) */
    Merger.prototype.groupFor = function (m, cast, recv) {
      if (this.disposed || !mergeClass(m, this.additive)) return null;
      var key = m.uuid + '|' + (cast ? 1 : 0) + (recv ? 1 : 0), g = this.groups.get(key);
      if (g) return g;
      g = { key: key, base: m, draw: twinOf(m), vcol: !!m.vertexColors, cast: !!cast, recv: !!recv, entries: [], copies: [],
            dirty: true, mesh: null, cap: 0, used: 0, holes: 0 };
      this.groups.set(key, g); this.list.push(g);
      return g;
    };
    /* adds, removals and re-jitters are incremental: a new copy is appended into the group's spare
       capacity, a removed one is pointed at the zero bone 0 (a hole), a re-jittered one is re-baked in
       place — only that copy's ranges are uploaded. A full rebuild (compaction, 25% headroom) runs
       when the capacity runs out or holes pass a quarter of the group. */
    var HOLES_MAX = 0.25;
    Merger.prototype._add = function (g, rec, part, geo, perCopy, bone) {
      var e = { g: g, rec: rec, part: part, geo: geo, perCopy: perCopy, bone: bone, start: 0, count: geo.getAttribute('position').count,
                cr: 1, cg: 1, cb: 1, sx: rec.sx, sy: rec.sy, sz: rec.sz, pv: -1, nv: -1, cv: -1, bend: null, bendM: null,
                rP: { start: 0, count: 0 }, rN: { start: 0, count: 0 }, rC: { start: 0, count: 0 }, rI: { start: 0, count: 0 }, rW: { start: 0, count: 0 } };
      g.entries.push(e);
      if (perCopy) g.copies.push(e);
      if (g.dirty || !g.mesh || g.used + e.count > g.cap) { g.dirty = true; return e; }
      e.start = g.used; g.used += e.count;
      var mg = g.mesh.geometry;
      bakeEntry(g, e, mg.getAttribute('position').array, mg.getAttribute('normal').array, mg.getAttribute('color').array,
        mg.getAttribute('skinIndex').array, mg.getAttribute('skinWeight').array, e.bone);
      markAll(mg, e);
      mg.setDrawRange(0, g.used);
      return e;
    };
    Merger.prototype._remove = function (e) {
      var g = e.g, i = g.entries.indexOf(e);
      if (i < 0) return;
      g.entries.splice(i, 1);
      if (e.perCopy) { i = g.copies.indexOf(e); if (i >= 0) g.copies.splice(i, 1); }
      if (g.dirty || !g.mesh) return;
      g.holes += e.count;
      if (g.holes > HOLES_MAX * g.used) { g.dirty = true; return; }
      var si = g.mesh.geometry.getAttribute('skinIndex'), A = si.array;
      for (var v = e.start; v < e.start + e.count; v++) A[v * 4] = 0;   /* the zero bone: collapsed */
      markRange(si, e.rI, e);
    };
    /* a copy's jitter scale changed: its vertices are re-baked in place */
    Merger.prototype._rescale = function (e, rec) {
      if (e.sx === rec.sx && e.sy === rec.sy && e.sz === rec.sz) return;
      e.sx = rec.sx; e.sy = rec.sy; e.sz = rec.sz;
      var g = e.g;
      if (g.dirty || !g.mesh) return;
      var mg = g.mesh.geometry, pa = mg.getAttribute('position'), na = mg.getAttribute('normal');
      bakePositions(e, pa.array); bakeNormals(e, na.array);
      markRange(pa, e.rP, e); markRange(na, e.rN, e);
    };
    Merger.prototype._color = function (e, c) {
      if (e.cr === c.r && e.cg === c.g && e.cb === c.b) return;
      e.cr = c.r; e.cg = c.g; e.cb = c.b;
      var g = e.g;
      if (g.dirty || !g.mesh) return;                        /* the rebuild bakes it */
      var ca = g.mesh.geometry.getAttribute('color');
      bakeColors(g, e, ca.array);
      markRange(ca, e.rC, e);
    };
    /* one entry's vertices changed: upload just its range (a reused range object: three only reads
       it and clears the list after the upload) */
    function markRange(attr, r, e) {
      r.start = e.start * attr.itemSize; r.count = e.count * attr.itemSize;
      attr.updateRanges.push(r);
      attr.needsUpdate = true;
    }
    function markAll(geo, e) {
      markRange(geo.getAttribute('position'), e.rP, e); markRange(geo.getAttribute('normal'), e.rN, e);
      markRange(geo.getAttribute('color'), e.rC, e); markRange(geo.getAttribute('skinIndex'), e.rI, e);
      markRange(geo.getAttribute('skinWeight'), e.rW, e);
    }
    /* positions pre-scaled by the copy's jitter scale */
    function bakePositions(e, P) {
      var pa = e.geo.getAttribute('position').array, o = e.start * 3, n = e.count * 3;
      if (e.sx === 1 && e.sy === 1 && e.sz === 1) { P.set(pa.subarray(0, n), o); return; }
      for (var i = 0; i < n; i += 3) { P[o + i] = pa[i] * e.sx; P[o + i + 1] = pa[i + 1] * e.sy; P[o + i + 2] = pa[i + 2] * e.sz; }
    }
    /* normals: S⁻¹·n at rest (exact under the rigid bone), the bend correction under a non-rigid one */
    function bakeNormals(e, N) {
      var na = e.geo.getAttribute('normal').array, o = e.start * 3, n = e.count * 3, B = e.bend, i, x, y, z, l;
      if (!B && e.sx === 1 && e.sy === 1 && e.sz === 1) { N.set(na.subarray(0, n), o); return; }
      var ix = 1 / e.sx, iy = 1 / e.sy, iz = 1 / e.sz;
      for (i = 0; i < n; i += 3) {
        if (B) {
          x = B[0] * na[i] + B[1] * na[i + 1] + B[2] * na[i + 2];
          y = B[3] * na[i] + B[4] * na[i + 1] + B[5] * na[i + 2];
          z = B[6] * na[i] + B[7] * na[i + 1] + B[8] * na[i + 2];
        } else { x = na[i] * ix; y = na[i + 1] * iy; z = na[i + 2] * iz; }
        l = Math.sqrt(x * x + y * y + z * z) || 1;
        N[o + i] = x / l; N[o + i + 1] = y / l; N[o + i + 2] = z / l;
      }
    }
    /* vertex colour = the part's own (vertex-colour materials) × the copy's instance colour */
    function bakeColors(g, e, C) {
      var o = e.start * 3, n = e.count * 3, ca = g.vcol ? e.geo.getAttribute('color') : null, a = ca ? ca.array : null, i;
      if (a && e.cr === 1 && e.cg === 1 && e.cb === 1) { C.set(a.subarray(0, n), o); return; }
      for (i = 0; i < n; i += 3) {
        C[o + i] = a ? a[i] * e.cr : e.cr; C[o + i + 1] = a ? a[i + 1] * e.cg : e.cg; C[o + i + 2] = a ? a[i + 2] * e.cb : e.cb;
      }
    }
    function bakeEntry(g, e, P, N, C, SI, SW, bone) {
      bakePositions(e, P); bakeNormals(e, N); bakeColors(g, e, C);
      for (var v = e.start, end = e.start + e.count; v < end; v++) { SI[v * 4] = bone; SW[v * 4] = 255; }
      if (e.perCopy) { e.pv = versionOf(e.geo, 'position'); e.nv = versionOf(e.geo, 'normal'); e.cv = versionOf(e.geo, 'color'); }
    }
    function versionOf(geo, name) { var a = geo.getAttribute(name); return a ? a.version : -1; }
    Merger.prototype._rebuild = function (g) {
      var list = g.entries, n = 0, k, e;
      for (k = 0; k < list.length; k++) { e = list[k]; e.start = n; n += e.count; }
      g.dirty = false; g.used = n; g.holes = 0;
      var old = g.mesh ? g.mesh.geometry : null;
      if (!n) {
        if (g.mesh) { this.group.remove(g.mesh); g.mesh = null; }
        if (old) old.dispose();
        g.cap = 0;
        return;
      }
      var cap = g.cap = Math.ceil(n * 1.25) + 64;
      var P = new Float32Array(cap * 3), N = new Float32Array(cap * 3), C = new Float32Array(cap * 3);
      var SI = new Uint16Array(cap * 4), SW = new Uint8Array(cap * 4);
      for (k = 0; k < list.length; k++) bakeEntry(g, list[k], P, N, C, SI, SW, list[k].bone);
      var geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(C, 3));
      geo.setAttribute('skinIndex', new THREE.BufferAttribute(SI, 4));
      geo.setAttribute('skinWeight', new THREE.BufferAttribute(SW, 4, true));
      ['position', 'normal', 'color', 'skinIndex', 'skinWeight'].forEach(function (nm) { geo.getAttribute(nm).setUsage(THREE.DynamicDrawUsage); });
      geo.setDrawRange(0, n);
      if (!g.mesh) {
        var mesh = new THREE.SkinnedMesh(geo, g.draw);
        mesh.name = 'merged:' + (g.base.name || 'mat') + (g.cast ? ':cast' : '') + (g.recv ? '' : ':norecv');
        mesh.bindMode = THREE.DetachedBindMode || 'detached';   /* the bind matrix stays identity */
        mesh.bind(this.skel, IDENT);
        mesh.frustumCulled = false;                          /* it spans the island */
        mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 40);   /* never CPU-skinned for sorting */
        mesh.castShadow = g.cast; mesh.receiveShadow = g.recv;
        mesh.matrixAutoUpdate = false;
        g.mesh = mesh;
        this.group.add(mesh);
      } else g.mesh.geometry = geo;
      if (old) old.dispose();
    };
    /* perCopy parts (CPU waves, LED chases written into the copy's own geometry): copy what moved */
    Merger.prototype._copies = function (g) {
      var geo = g.mesh.geometry, pa = geo.getAttribute('position'), na = geo.getAttribute('normal'), ca = geo.getAttribute('color');
      for (var k = 0; k < g.copies.length; k++) {
        var e = g.copies[k], pv = versionOf(e.geo, 'position'), nv = versionOf(e.geo, 'normal'), cv = versionOf(e.geo, 'color');
        if (pv !== e.pv) { e.pv = pv; bakePositions(e, pa.array); markRange(pa, e.rP, e); }
        if (nv !== e.nv) { e.nv = nv; bakeNormals(e, na.array); markRange(na, e.rN, e); }
        if (cv !== e.cv && g.vcol) { e.cv = cv; bakeColors(g, e, ca.array); markRange(ca, e.rC, e); }
      }
    };
    /* a group whose material is hidden (glow by day) is never uploaded: its pending ranges are
       capped, and the next upload is then a whole one */
    var RANGE_CAP = 48, ATTRS = ['position', 'normal', 'color', 'skinIndex', 'skinWeight'];
    Merger.prototype.commit = function () {
      if (this.disposed) return this;
      for (var i = 0; i < this.list.length; i++) {
        var g = this.list[i];
        if (g.draw !== g.base) {                             /* a twin follows its material (glow fades, member colours) */
          if (!g.draw.color.equals(g.base.color)) g.draw.color.copy(g.base.color);
          g.draw.opacity = g.base.opacity; g.draw.visible = g.base.visible;
        }
        if (g.dirty) { this._rebuild(g); continue; }
        if (!g.mesh) continue;
        if (g.copies.length) this._copies(g);
        var geo = g.mesh.geometry;
        for (var a = 0; a < ATTRS.length; a++) { var at = geo.getAttribute(ATTRS[a]); if (at.updateRanges.length > RANGE_CAP) at.clearUpdateRanges(); }
      }
      return this;
    };
    Merger.prototype.info = function () {
      var out = { groups: 0, calls: 0, entries: 0, vertices: 0, holes: 0, bones: this.top - 1 - this.free.length };
      for (var i = 0; i < this.list.length; i++) {
        var g = this.list[i];
        out.entries += g.entries.length;
        if (!g.mesh) continue;
        out.groups++; out.vertices += g.used - g.holes; out.holes += g.holes;
        if (g.draw.visible) out.calls++;
      }
      return out;
    };
    Merger.prototype.dispose = function () {
      if (this.disposed) return;
      this.disposed = true;
      for (var i = 0; i < this.list.length; i++) { var g = this.list[i]; if (g.mesh) g.mesh.geometry.dispose(); g.mesh = null; g.entries.length = 0; g.copies.length = 0; }
      this.list.length = 0; this.groups.clear();
      if (this.group.parent) this.group.parent.remove(this.group);
      this.group.clear();
      if (this.skel) { this.skel.dispose(); this.skel = null; }
      mergers.delete(this);
    };

    /* ================================================================
       INSTANTIATE — one standalone copy as a Group (photocards, games).
       Parts are InstancedMesh(count 1) so they reuse the island's compiled
       programs. userData: {id, stateKey, template, pivots{name: Object3D},
       anchors{name: Object3D}, meshes{part: mesh}, setState(k, v), setHighlight(l), dispose()}.
       Animate a pivot by rotating/moving userData.pivots[name] (it sits at the
       pivot origin); 'root' is the group itself.
       ================================================================ */
    function instantiate(K, tpl, o) {
      o = o || {};
      var g = new THREE.Group();
      g.name = tpl.id;
      var nodes = { root: g };
      tpl.pivotOrder.forEach(function (name) {
        var pv = tpl.pivots[name], parent = pv.parent ? nodes[pv.parent] : g;
        var po = pv.parent ? tpl.pivots[pv.parent].origin : [0, 0, 0];
        var n = new THREE.Group();
        n.name = name;
        n.position.set(pv.origin[0] - po[0], pv.origin[1] - po[1], pv.origin[2] - po[2]);
        (parent || g).add(n);
        nodes[name] = n;
      });
      var meshes = {}, hulls = [], clones = [], state = {}, hl = 0;
      /* standalone copies (photocards, games): only characters keep a hull; architecture has no selection here */
      var withOutlines = K.tier !== 'LOW' && hub.outlinesOn && o.outlines !== false && charHull(tpl.id);
      tpl.parts.forEach(function (p) {
        var node = p.pivot ? nodes[p.pivot] : g;
        var geo = p.perCopy ? p.geo.clone() : p.geo;
        if (p.perCopy) clones.push(geo);
        var mm = newIM(geo, (typeof o.material === 'function' && o.material(p.mat, p)) || mat(p.mat), 1);
        mm.count = 1; mm.name = p.name;
        mm.castShadow = o.castShadow !== false && p.castShadow; mm.receiveShadow = p.receiveShadow;
        if (p.perCopy) mm.frustumCulled = false;
        if (p.pivot) { var or = tpl.pivots[p.pivot].origin; mm.position.set(-or[0], -or[1], -or[2]); }
        if (p.stateColor) { stateColorInto(p.stateColor, undefined, _c); _c.toArray(mm.instanceColor.array, 0); }
        node.add(mm);
        meshes[p.name] = mm;
        if (p.outline && withOutlines) {
          var h = newIM(geo, mat('outline:' + hullWidth(p, true)), 1);
          h.count = 1; h.name = p.name + ':outline';
          h.position.copy(mm.position); h.frustumCulled = mm.frustumCulled;
          inkC().toArray(h.instanceColor.array, 0);
          node.add(h); hulls.push(h); instOutlines.add(h);
        }
      });
      var anchors = {};
      Object.keys(tpl.anchors).forEach(function (k) {
        var a = new THREE.Object3D();
        a.name = 'anchor:' + k;
        a.position.set(tpl.anchors[k][0], tpl.anchors[k][1], tpl.anchors[k][2]);
        g.add(a); anchors[k] = a;
      });
      ref(tpl, 1);
      var disposed = false;
      g.userData = {
        id: tpl.id, stateKey: tpl.stateKey, template: tpl, pivots: nodes, anchors: anchors, meshes: meshes,
        setState: function (key, value) {
          state[key] = value;
          tpl.parts.forEach(function (p) {
            if (!p.stateColor || p.stateColor.key !== key) return;
            var mm = meshes[p.name];
            stateColorInto(p.stateColor, value, _c).toArray(mm.instanceColor.array, 0);
            mm.instanceColor.needsUpdate = true;
          });
        },
        setHighlight: function (level) {
          hl = level | 0;
          hulls.forEach(function (h) { (hl ? goldC() : inkC()).toArray(h.instanceColor.array, 0); h.instanceColor.needsUpdate = true; });
        },
        dispose: function () {
          if (disposed) return;
          disposed = true;
          clones.forEach(function (c) { c.dispose(); });
          g.traverse(function (o2) { if (o2.isInstancedMesh) o2.dispose(); });
          hulls.forEach(function (h) { instOutlines.delete(h); });
          if (g.parent) g.parent.remove(g);
          ref(tpl, -1);
        }
      };
      return g;
    }

    /* ================================================================
       POOLS — base classes for fx3d / actors / edit3d
       billboards({capacity, texture: 'sparkles'|'halo'|Texture, cells, additive = true, fog = true, show = false})
         → {mesh, capacity, uniforms, alloc() → i|-1, free(i), set(i, x, y, z, size, color, alpha, cell, rot),
            tint(i, color), alpha(i, a), commit(), clear(), dispose()}
         Camera-facing quads; cell indexes K.ATLAS on the sparkle atlas. show: true links the
         size/opacity to the Showtime mix like the bible's halos (1 → 1.6×, 0.5 → 0.9).
       blobs(capacity) → {mesh, alloc(), free(i), set(i, x, y, z, sx, sz), commit(), clear(), dispose()}
       ================================================================ */
    var BB_VERT = [
      '#include <common>',
      '#include <fog_pars_vertex>',
      'attribute vec4 aData;',
      'uniform float uCells;',
      'uniform float uSizeMul;',
      'varying vec2 vUv;',
      'varying vec4 vTint;',
      'void main() {',
      '  vec4 mvPosition = modelViewMatrix * vec4(instanceMatrix[3].xyz, 1.0);',
      '  float s = aData.w * uSizeMul;',
      '  float c = cos(aData.z), sn = sin(aData.z);',
      '  mvPosition.xy += vec2(position.x * c - position.y * sn, position.x * sn + position.y * c) * s;',
      '  gl_Position = projectionMatrix * mvPosition;',
      '  float cx = mod(aData.y, uCells), cy = floor(aData.y / uCells);',
      '  vUv = vec2((uv.x + cx) / uCells, 1.0 - (cy + 1.0 - uv.y) / uCells);',
      '#ifdef USE_INSTANCING_COLOR',
      '  vTint = vec4(instanceColor, aData.x);',
      '#else',
      '  vTint = vec4(1.0, 1.0, 1.0, aData.x);',
      '#endif',
      '#include <fog_vertex>',
      '}'
    ].join('\n');
    var BB_FRAG = [
      '#include <common>',
      '#include <fog_pars_fragment>',
      'uniform sampler2D uMap;',
      'uniform float uAlphaMul;',
      'varying vec2 vUv;',
      'varying vec4 vTint;',
      'void main() {',
      '  vec4 t = texture2D(uMap, vUv);',
      '  float a = t.a * vTint.a * uAlphaMul;',
      '  if (a < 0.004) discard;',
      '  gl_FragColor = vec4(t.rgb * vTint.rgb, a);',
      '  #include <colorspace_fragment>',
      '  #include <fog_fragment>',
      '}'
    ].join('\n');
    var pools = new Set();
    function billboards(o) {
      o = o || {};
      var cap = Math.max(1, o.capacity | 0 || 64);
      var map = o.texture && o.texture.isTexture ? o.texture : o.texture === 'halo' ? tex.halo() : tex.sparkles();
      var cells = o.cells || (map === texCache.sparkles ? ATLAS_CELLS : 1);
      var geo = new THREE.PlaneGeometry(1, 1);
      var data = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
      data.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('aData', data);
      var u = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uMap: { value: null }, uCells: { value: cells }, uSizeMul: { value: 1 }, uAlphaMul: { value: 1 } }]);
      u.uMap.value = map;
      var m = new THREE.ShaderMaterial({
        uniforms: u, vertexShader: BB_VERT, fragmentShader: BB_FRAG, transparent: true, depthWrite: false,
        blending: o.additive === false ? THREE.NormalBlending : THREE.AdditiveBlending, fog: o.fog !== false, toneMapped: false
      });
      var mesh = newIM(geo, m, cap);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false; mesh.count = 0; mesh.renderOrder = o.renderOrder != null ? o.renderOrder : 5;
      mesh.name = o.name || 'billboards';
      var free = [], used = new Uint8Array(cap), hi = 0, dirty = false;
      for (var i = cap - 1; i >= 0; i--) free.push(i);
      var pool = {
        mesh: mesh, capacity: cap, uniforms: u,
        alloc: function () {
          if (!free.length) return -1;
          var k = free.pop();
          used[k] = 1;
          if (k + 1 > hi) { hi = k + 1; mesh.count = hi; }
          return k;
        },
        free: function (k) {
          if (k < 0 || k >= cap || !used[k]) return;
          used[k] = 0; data.array[k * 4] = 0; data.array[k * 4 + 3] = 0;
          free.push(k); dirty = true;
          while (hi > 0 && !used[hi - 1]) hi--;
          mesh.count = hi;
        },
        set: function (k, x, y, z, size, color, alpha, cell, rot) {
          var a = mesh.instanceMatrix.array, b = k * 16, d = data.array, j = k * 4;
          a[b + 12] = x; a[b + 13] = y; a[b + 14] = z;
          d[j] = alpha == null ? 1 : alpha; d[j + 1] = cell || 0; d[j + 2] = rot || 0; d[j + 3] = size;
          if (color) colCached(color).toArray(mesh.instanceColor.array, k * 3);
          dirty = true;
        },
        tint: function (k, color) { colCached(color).toArray(mesh.instanceColor.array, k * 3); dirty = true; },
        alpha: function (k, a) { data.array[k * 4] = a; dirty = true; },
        commit: function () {
          if (!dirty) return;
          mesh.instanceMatrix.needsUpdate = true; data.needsUpdate = true; mesh.instanceColor.needsUpdate = true;
          dirty = false;
        },
        clear: function () {
          free.length = 0;
          for (var k = cap - 1; k >= 0; k--) { free.push(k); used[k] = 0; data.array[k * 4] = 0; data.array[k * 4 + 3] = 0; }
          hi = 0; mesh.count = 0; dirty = true;
        },
        dispose: function () {
          if (mesh.parent) mesh.parent.remove(mesh);
          geo.dispose(); m.dispose(); mesh.dispose();
          pools.delete(pool); showPools.delete(pool);
        }
      };
      pools.add(pool);
      if (o.show) { showPools.add(pool); u.uSizeMul.value = 1 + 0.6 * hub.show; u.uAlphaMul.value = 0.5 + 0.4 * hub.show; }
      return pool;
    }
    function blobs(capacity) {
      var cap = Math.max(1, capacity | 0 || 16);
      var geo = new THREE.PlaneGeometry(1, 1);
      geo.rotateX(-Math.PI / 2);
      var mesh = newIM(geo, mat('blob'), cap);            /* white instance colours: the shared map program */
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false; mesh.count = 0; mesh.renderOrder = 1; mesh.name = 'blobs';
      var free = [], used = new Uint8Array(cap), hi = 0, dirty = false;
      for (var i = cap - 1; i >= 0; i--) free.push(i);
      function zero(k) { var a = mesh.instanceMatrix.array, b = k * 16; a[b] = 0; a[b + 5] = 1; a[b + 10] = 0; }
      for (i = 0; i < cap; i++) zero(i);
      var pool = {
        mesh: mesh, capacity: cap,
        alloc: function () {
          if (!free.length) return -1;
          var k = free.pop();
          used[k] = 1;
          if (k + 1 > hi) { hi = k + 1; mesh.count = hi; }
          return k;
        },
        free: function (k) {
          if (k < 0 || k >= cap || !used[k]) return;
          used[k] = 0; zero(k); free.push(k); dirty = true;
          while (hi > 0 && !used[hi - 1]) hi--;
          mesh.count = hi;
        },
        set: function (k, x, y, z, sx, sz) {
          var a = mesh.instanceMatrix.array, b = k * 16;
          a[b] = sx; a[b + 5] = 1; a[b + 10] = sz == null ? sx : sz;
          a[b + 12] = x; a[b + 13] = y + 0.006; a[b + 14] = z;
          dirty = true;
        },
        commit: function () { if (dirty) { mesh.instanceMatrix.needsUpdate = true; dirty = false; } },
        clear: function () {
          free.length = 0;
          for (var k = cap - 1; k >= 0; k--) { free.push(k); used[k] = 0; zero(k); }
          hi = 0; mesh.count = 0; dirty = true;
        },
        dispose: function () { if (mesh.parent) mesh.parent.remove(mesh); geo.dispose(); mesh.dispose(); pools.delete(pool); }
      };
      pools.add(pool);
      return pool;
    }

    /* ---------------- K per tier ---------------- */
    var kits = {};
    function kit(tier) {
      tier = parseTier(tier) || 'MID';
      if (kits[tier]) return kits[tier];
      var K = {
        THREE: THREE, tier: tier, version: VERSION, outlines: tier !== 'LOW',
        ATLAS: ATLAS, ATLAS_CELLS: ATLAS_CELLS, OUTLINE_W: OUTLINE_W, OUTLINE_CHAR: OUTLINE_CHAR,
        LED_PROGRAMS: LED_PROGRAMS, SIGN_WORDS: signWordsNow(),
        uniforms: uniforms, issues: hub.issues,
        col: col, hex: hex, tone: tone, rgb: rgb,
        has: function (token) { return !!tryHex(token); },
        mat: mat, variant: variant, tex: tex,
        ledAtlas: ledAtlas, signAtlas: signAtlas,
        stateKey: stateKeyOf,
        billboards: billboards, blobs: blobs,
        setRim: setRim, setShow: setShow, setOutlines: setOutlines, setSelPulse: setSelPulse,
        setGrid: function (g) { if (g && typeof g.baseY === 'function') gridBaseY = g.baseY; },
        warn: warn, dispose: dispose,
        isTemplate: isTemplate
      };
      K.G = makeG(tier);
      K.facet = K.G.facet;
      K.ctx = function (id, st, stateKey) { return ctxFor(K, id, st, stateKey); };
      K.template = function (ctx) { return new TemplateBuilder(K, ctx || K.ctx('item', {})); };
      K.batch = function (tpl, o) { return new ItemBatch(K, tpl, o); };
      K.merger = function (o) { return new Merger(o); };
      K.instantiate = function (tpl, o) { return instantiate(K, tpl, o); };
      K.placeholder = function (ctx) { return placeholder(K, ctx || K.ctx('item', {})); };
      K.templates = {
        get: function (id, stateKey, t, st) { return templateGet(id, stateKey, t || tier, st); },
        has: function (id, stateKey, t) { return tcache.has(id + '#' + (stateKey || '') + '#' + (parseTier(t) || tier)); },
        delete: function (id, stateKey, t) {
          var k = id + '#' + (stateKey || '') + '#' + (parseTier(t) || tier), e = tcache.get(k);
          if (!e || e.refs > 0) return false;
          disposeTemplate(e.tpl); tcache.delete(k);
          return true;
        },
        trim: function (limit) { trim(limit); },
        get size() { return tcache.size; }
      };
      K.parts = {
        get: function (key, t, fn) {
          if (typeof t === 'function') { fn = t; t = tier; }
          return partGet(key, t || tier, fn);
        },
        has: function (key, t) { return pcache.has(key + '#' + (parseTier(t) || tier)); }
      };
      kits[tier] = K;
      return K;
    }

    /* ---------------- disposal ---------------- */
    function dispose() {
      Array.from(batches).forEach(function (b) { b.dispose(); });
      Array.from(mergers).forEach(function (m) { m.dispose(); });
      twins.clear();
      Array.from(pools).forEach(function (p) { p.dispose(); });
      tcache.forEach(function (e) { disposeTemplate(e.tpl); });
      tcache.clear();
      pcache.forEach(function (v) { disposeDeep(v); });
      pcache.clear();
      allMats.forEach(function (m) { m.dispose(); });
      allMats.clear(); mats.clear(); variants.clear(); glowMats.length = 0;
      Object.keys(texCache).forEach(function (k) { texCache[k].dispose(); delete texCache[k]; });
      emojiCache.forEach(function (t) { t.dispose(); }); emojiCache.clear();
      extraTex.forEach(function (t) { t.dispose(); }); extraTex.clear();
      instOutlines.clear(); colTmp.clear();
      INK = null; GOLD = null;
      shared.led = null; shared.sign = null;
      shared.user = { name: '', color: null };      /* the next atlas never starts with the last child's name */
    }

    hub.kit = kit;
    hub.dispose = dispose;
    hub.setOutlines = setOutlines;
    hub.setShow = setShow;
    hub.setRim = setRim;
    hub.setSelPulse = setSelPulse;
    hub.uniforms = uniforms;
    hub.stateKey = stateKeyOf;
    hub.stats = function () {
      return { templates: tcache.size, parts: pcache.size, materials: allMats.size, batches: batches.size, pools: pools.size, issues: hub.issues.length };
    };
    return hub;
  }

  return {
    VERSION: VERSION, FALLBACK: FALLBACK, ATLAS: ATLAS, ATLAS_CELLS: ATLAS_CELLS, OUTLINE_W: OUTLINE_W,
    create: create,
    /* pure helpers (Node-testable) */
    resolveHex: resolveHex, fallbackStateKey: fallbackStateKey, normHex: normHex,
    OUTLINE_CHAR: OUTLINE_CHAR, SEL_W: SEL_W, RAMP: RAMP, BEVEL: BEVEL, MATCAP_FALLBACK: MATCAP_FALLBACK,
    rampFrom: rampFrom, bevelFrom: bevelFrom, archRadius: archRadius,
    LED_PROGRAMS: LED_PROGRAMS, LED: LED, ledIndex: ledIndex, ledCell: ledCell, ledWindow: ledWindow,
    SIGN: SIGN, SIGN_WORDS: SIGN_WORDS_FALLBACK, signCell: signCell, signRect: signRect, checkSignWord: checkSignWord,
    signName: signName, signInitial: signInitial,
    normJitter: normJitter, jitterQuat: jitterQuat, tintMul: tintMul,
    PROGRAM_FAMILY: PROGRAM_FAMILY, programFamily: programFamily, neutralTone: neutralTone
  };
}));
