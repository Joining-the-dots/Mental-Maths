/* ================================================================
   My Island 3D — photocards: the shop icons and the stage-riser
   turntable (island architecture chunk 12; classic script).
   window.SLPhotocard in the browser (stage.js injects it with the other
   island3d scripts; the app may also load it on its own). In Node,
   module.exports is the same object: the PURE helpers below run there
   and the browser entry points are harmless no-ops.

   It needs no mounted island: it asks SLIsland3D.ensure() for SL3D and
   renders on ONE small renderer of its own (SL3D.createRenderer, alpha,
   a fixed 512² drawing buffer) that lives only while icons are queued
   or a turntable is live, and is disposed (forceContextLoss) after 30 s
   idle. Every failure is silent: the existing SVG icons simply stay.

   window.SLPhotocard
     fill(container) → Promise<number>
         Finds every [data-pc] element in (and including) container:
           data-pc="<catalogue id>"  data-st='<style JSON>' (optional)
           data-pck="<SLIslandLook.stateKey>" (optional; used when data-st is absent)
         and swaps its SVG for a 256² transparent PNG, progressively: memory hit →
         now; Cache Storage 'sl-pc-<LOOK_VERSION>' (sl-pc-2 for Encore City) hit →
         next tick; otherwise a queued render. The SVG stays in place (visibility
         hidden) to keep the layout, and the <img data-pc-img> is laid over it.
         Resolves with how many elements got a PNG. Call it after every paint
         (cheap and idempotent).
     turntable(host, id, st, opts) → stop()
         A live, slowly turning (0.15 rev/s) stage riser (a Gunmetal disc r 0.7
         with a Neon Magenta ring) with 2 crossing spot cones (Neon Magenta, LED
         Cyan), for the shop detail sheet and purchase debuts. The canvas covers
         host (made position:relative when static) and crossfades over host's SVG
         on its first frame. Drag to turn.
         opts {debut: true → one 360° turn over 1.2 s + a sparkle burst,
               reduced (default: prefers-reduced-motion) → a still riser and
                 still spotlights (drag still works) and a sparkle fade,
               flythrough (default true for course/track variants: a 2 s camera
                 swoop in), onReady(), onFail(reason)}
         stop() is idempotent and also runs by itself when host leaves the DOM.
         stop.set(id, st)  swap the item (e.g. the house after a style pick) with a sparkle
         stop.debut()      replay the debut turn + burst
         stop.ready        Promise<boolean> — true once the 3D view shows, false on failure
     prewarm(ids, {st}) → Promise<number>   ids: ['tree_oak', {id, st}, …]; low priority
     url(id, st) → Promise<string|null>     the icon's object URL (renders when needed)
     setUser({color})                       the child's member colour (the studio rim); icons are
                                            cached per rim colour, so siblings never share a tint
     clear() → Promise                      drop the memory + Cache Storage icons, cancel the queue
     dispose()                              stop every turntable, free the renderer now
     info()                                 QA counters (renders, hits, queue, gpu, member, …)

   WHAT RENDERS (SLIslandLook.resolveStyle decides the state)
     style items (wall_*, roof_*, door_*, detail_*, shape_*) → the player's own house
       wearing that style, on the player's CURRENT shape (data-st {wall, roof, door,
       details, shape}) with trim variant 0 — the per-child trim never reaches an icon;
     city buildings (bld_*) → always trim variant 0, and every LED screen shows the
       look's photocard program (the screen tower's star field);
     accessories (acc_*) → the player's active pet wearing it (data-st {pet, acc});
     pets → the pet with st.acc; land_* → a little land diorama built here;
     everything else → SL3D.make(id, st). A missing model (placeholder) keeps the SVG.
     Turntables animate the item with its model's idle(a) and pets with
     SL3D.makeRig(…).play('idle') (the static template when makeRig is missing).
     NO NAMES in a photocard: an LED window on the name program becomes the star
     field and a sign cell holding the child's name or initial is hidden (the neon
     tower's blade keeps only its ✦), so the shared icon cache never holds a name.
     Models see a.photocard = true, a.member = the rim hex and a.screen = the LED
     program to show, to pick their non-personal look themselves.

   LOOK: FOV 30 at 28° elevation; icons at 25° yaw (3/4 from the front-left)
   with the item filling 80% of the frame (framed on its sampled vertices, so
   round items fill it as well as boxy ones); the STUDIO preset (hemi Studio
   Sky / Studio Ground at 1.4, a Studio Key light of 2.2 from (−5, 8, 9), the
   member colour as the rim at 0.45); a transparent clear, so the PNG sits on
   the dark CSS image well; no shadow map — a soft blob shadow. While a
   photocard renders, the shared kit's rim and Showtime mix are held at the
   studio look and then restored, so an icon never depends on what the island
   was doing.
   ================================================================ */
(function (root, factory) {
  var hasDom = typeof window !== 'undefined' && typeof document !== 'undefined' && !!document.createElement;
  var api = factory(root, hasDom);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else if (root) root.SLPhotocard = api;
}(typeof self !== 'undefined' ? self : typeof globalThis !== 'undefined' ? globalThis : this, function (root, HAS_DOM) {
  'use strict';

  /* a second copy of this file (stage injection + the app) must not start a second engine */
  if (HAS_DOM && root.SLPhotocard && root.SLPhotocard.__pc) return root.SLPhotocard;

  var VERSION = 2;
  var DEG = Math.PI / 180, TAU = Math.PI * 2;
  var OUT = 256;                       /* icon PNG size */
  var BUF = 512;                       /* the offscreen drawing buffer: icons render 2× and downsample */
  var IDLE_MS = 30000;                 /* dispose the renderer after this long with nothing to do */
  var CAM = { fov: 30, elev: 28, yaw: 25, fill: 0.8 };
  var TT = {
    rps: 0.15, start: -25, fill: 0.86, frameMs: 31, riserR: 0.7, riserH: 0.16, itemR: 0.6, itemH: 1.45,
    flyDur: 2, flyFrom: { yaw: -40, elev: 12, dist: 0.75 }, dragDegPerPx: 0.6, resumeAfter: 1.5
  };
  /* the photocard STUDIO light (art bible v2): a cool hemisphere, one warm key from the
     front-right and the child's member colour as the rim; '@member' = the setUser colour */
  var STUDIO = { hemiSky: 'Studio Sky', hemiGround: 'Studio Ground', hemiIntensity: 1.4, keyColor: 'Studio Key', keyIntensity: 2.2,
                 keyPos: [-5, 8, 9], rim: '@member', rimStrength: 0.45, exposure: 1.0 };
  /* the renderer clears to fully transparent: the PNG and the turntable sit on the dark CSS well */
  var CLEAR = { color: 0x000000, alpha: 0 };
  /* the turntable riser: a Gunmetal disc (the gunmetal matcap; vertex tones for a toon fallback),
     a Neon Magenta rim ring and two crossing spot cones */
  var RISER = { mat: 'gunmetal', top: 'Gunmetal Mid', side: 'Gunmetal', base: 'Gunmetal Deep', ring: 'Neon Magenta',
                cones: ['Neon Magenta', 'LED Cyan'], coneAlpha: 0.2 };
  var MEM_MAX = 160, STORE_MAX = 400, TRIM_EVERY = 24, PMAX = 40, CANVAS_MAX = 3;
  var CACHE_PREFIX = 'sl-pc-';
  var ID_RE = /^[a-z][a-z0-9_]{1,47}$/;
  var SLOTS = ['wall', 'roof', 'door', 'shape', 'course', 'ball', 'stadium', 'kart'];
  var ACC_SLOTS = ['hat', 'neck', 'face', 'back'];
  var SPARKLE_TOKENS = ['Star Gold', 'Neon Magenta', 'LED Cyan', 'Bone White'];
  /* the kit's atlas layouts (SLKit.LED / SLKit.SIGN), for reading which cell a screen or sign shows */
  var LED_LAYOUT = { w: 512, h: 256, stripW: 256, cellH: 64, cols: 2 };
  var LED_PROGRAMS = ['eq', 'wave', 'spark', 'gradient', 'stars', 'encore', 'showtime', 'name'];
  var SIGN_LAYOUT = { w: 512, h: 256, cellW: 256, cellH: 64, cols: 2, userCell: 7 };
  /* display fonts a texture waits for before an icon is drawn (and cached for good) */
  var FONT_BAGEL = '400 48px "Bagel Fat One"', FONT_DISPLAY = '800 48px "Unbounded"';

  /* ================================================================
     PURE HELPERS (no DOM, no THREE; exported for Node tests)
     ================================================================ */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function inOutSine(u) { u = clamp01(u); return -(Math.cos(Math.PI * u) - 1) / 2; }
  function outQuad(u) { u = clamp01(u); return 1 - (1 - u) * (1 - u); }
  function outBack(u) { var c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2); }
  /* FNV-1a, the same hash as SLMotion / SLGrid3D */
  function hash(s) {
    s = String(s);
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
  }
  /* (seed, n) → [0, 1), allocation-free */
  function rnd(seed, n) {
    var h = ((seed >>> 0) ^ Math.imul(n | 0, 0x9E3779B1)) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x85EBCA6B) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  /* the [data-pc] attributes → {id, st|null, pck|null}, or null when the id is not an id */
  function parseSpec(pc, stText, pck) {
    var id = typeof pc === 'string' ? pc.trim() : '';
    if (!ID_RE.test(id)) return null;
    var st = null;
    if (typeof stText === 'string' && stText.trim()) {
      try { var v = JSON.parse(stText); if (v && typeof v === 'object' && !Array.isArray(v)) st = v; } catch (e) { st = null; }
    }
    return { id: id, st: st, pck: typeof pck === 'string' && pck.trim() ? pck.trim() : null };
  }
  /* keep only the style fields a photocard uses, with ids that exist in LOOK for that slot. The
     trim variant is never kept: every photocard renders trim 0, so no icon depends on the child */
  function cleanSt(st, L) {
    var out = {}, LOOK = L && L.LOOK;
    if (!st || typeof st !== 'object') return out;
    SLOTS.forEach(function (sl) {
      var v = st[sl];
      if (typeof v === 'string' && v && (!LOOK || (LOOK[v] && LOOK[v].slot === sl))) out[sl] = v;
    });
    var d = st.details;
    var list = Array.isArray(d) ? d : (d && typeof d === 'object' ? Object.keys(d).filter(function (k) { return d[k]; }) : []);
    list = list.filter(function (x, i) {
      return typeof x === 'string' && list.indexOf(x) === i && (!LOOK || (LOOK[x] && LOOK[x].part === 'detail'));
    }).sort();
    if (list.length) out.details = list;
    if (typeof st.pet === 'string' && (!LOOK || (LOOK[st.pet] && LOOK[st.pet].kind === 'pet'))) out.pet = st.pet;
    if (st.acc && typeof st.acc === 'object') {
      var a = {}, n = 0;
      ACC_SLOTS.forEach(function (sl) {
        var v = st.acc[sl];
        if (typeof v === 'string' && (!LOOK || (LOOK[v] && LOOK[v].socket === sl))) { a[sl] = v; n++; }
      });
      if (n) out.acc = a;
    }
    return out;
  }
  /* 'a:acc_bow,acc_crown' → {neck: 'acc_bow', hat: 'acc_crown'} */
  function accFromKey(k, LOOK) {
    var out = {};
    if (typeof k !== 'string' || k.slice(0, 2) !== 'a:') return out;
    k.slice(2).split(',').forEach(function (a) { var e = a && LOOK[a]; if (e && e.socket && ACC_SLOTS.indexOf(e.socket) >= 0) out[e.socket] = a; });
    return out;
  }
  /* the inverse of SLIslandLook.stateKey: a style object that gives the same key. A house key
     without the '|s:<shape>|v:<n>' suffix is the cottage (its key stays the exact v1 string);
     a city building's key is 'v:<n>' */
  function stFromKey(id, key, L) {
    var LOOK = L && L.LOOK, e = LOOK && LOOK[id];
    if (!e || typeof key !== 'string' || !key || key === 'base') return {};
    function ok(v, slot) { return typeof v === 'string' && LOOK[v] && LOOK[v].slot === slot ? v : undefined; }
    function pack(o) { var r = {}; for (var k in o) if (o[k] !== undefined) r[k] = o[k]; return r; }
    if (id === 'house_cottage' || e.kind === 'style') {
      var m = /^([a-z0-9_]+)\|([a-z0-9_]+)\|([a-z0-9_]+)\|d:([a-z0-9_,]*)(?:\|s:([a-z0-9_]+)\|v:(\d+))?$/.exec(key);
      if (!m) return {};
      var det = m[4] ? m[4].split(',').filter(function (x) { return LOOK[x] && LOOK[x].part === 'detail'; }) : [];
      return pack({ wall: ok(m[1], 'wall'), roof: ok(m[2], 'roof'), door: ok(m[3], 'door'), details: det,
                    shape: ok(m[5] || 'shape_cottage', 'shape'), variant: m[6] != null ? +m[6] : undefined });
    }
    if (e.kind === 'building') { var v = /^v:(\d+)$/.exec(key); return v ? { variant: +v[1] } : {}; }
    if (id === 'att_course') return pack({ course: ok(key, 'course') });
    if (id === 'att_pitch') { var p = key.split('|'); return pack({ ball: ok(p[0], 'ball'), stadium: ok(p[1], 'stadium') }); }
    if (id === 'att_kart') return pack({ kart: ok(key, 'kart') });
    if (e.kind === 'pet') return { acc: accFromKey(key, LOOK) };
    if (e.kind === 'acc') {
      var i = key.indexOf('|'), pet = i > 0 ? key.slice(0, i) : '';
      return pack({ pet: LOOK[pet] && LOOK[pet].kind === 'pet' ? pet : undefined, acc: accFromKey(i > 0 ? key.slice(i + 1) : '', LOOK) });
    }
    return {};
  }
  /* a stable string for a plain object (sorted keys), for the no-world-look fallback key */
  function stableKey(o) {
    if (o == null || typeof o !== 'object') return o == null ? 'base' : String(o);
    if (Array.isArray(o)) return '[' + o.map(stableKey).join(',') + ']';
    var ks = Object.keys(o).sort();
    if (!ks.length) return 'base';
    return '{' + ks.map(function (k) { return k + ':' + stableKey(o[k]); }).join(',') + '}';
  }
  /* what actually renders for (id, st): {id, src, st, stateKey, key, kind, screen}.
     Styles render the house (on the player's own shape) and accessories the pet, so equal
     pictures share a key. Houses and buildings always render trim 0, and screen is the LED
     program a building shows in a photocard (LOOK show.screen.photocard, e.g. 'stars'). */
  function renderSpec(id, st, L) {
    if (typeof id !== 'string' || !ID_RE.test(id)) return null;
    var s = cleanSt(st, L), LOOK = L && L.LOOK;
    if (!LOOK || typeof L.resolveStyle !== 'function' || typeof L.stateKey !== 'function') {
      var k0 = stableKey(s);
      var kind0 = /^pet_/.test(id) ? 'pet' : /^land_/.test(id) ? 'land' : /^acc_/.test(id) ? 'acc' : /^bld_/.test(id) ? 'building' : '';
      return { id: id, src: id, st: s, stateKey: k0, key: id + '#' + k0, kind: kind0, screen: kind0 === 'building' ? 'stars' : null };
    }
    var e = LOOK[id];
    if (!e) return null;
    var rid = id, rst = L.resolveStyle(id, s) || {};
    if (e.kind === 'style') rid = 'house_cottage';
    else if (e.kind === 'acc') { rid = LOOK[rst.pet] && LOOK[rst.pet].kind === 'pet' ? rst.pet : 'pet_puppy'; rst = { acc: rst.acc || {} }; }
    if (!LOOK[rid]) return null;
    var re = LOOK[rid];
    if (rid === 'house_cottage' || re.kind === 'building') rst = pinTrim(rst);
    var sk = String(L.stateKey(rid, rst));
    var scr = re.kind === 'building' ? ((re.show && re.show.screen && re.show.screen.photocard) || null) : null;
    return { id: rid, src: id, st: rst, stateKey: sk, key: rid + '#' + sk, kind: re.kind, screen: scr };
  }
  /* a copy of a resolved house / building state on trim 0 */
  function pinTrim(rst) {
    var o = {};
    for (var k in rst) if (Object.prototype.hasOwnProperty.call(rst, k)) o[k] = rst[k];
    o.variant = 0;
    return o;
  }
  /* the icon cache key: the render key plus the studio rim colour ('@rrggbb'), so two children
     with different member colours never share a tinted icon; no member → the bare key */
  function iconKey(key, member) {
    var m = typeof member === 'string' && /^#?([0-9a-f]{6})$/i.exec(member.trim());
    return m ? key + '@' + m[1].toLowerCase() : key;
  }
  /* the STUDIO preset resolved for one render: token colours as '#RRGGBB' (through L.hex when
     world-look is loaded), the rim = the member colour, else the look's member fallback */
  function studioLights(L, member) {
    function hx(tok) { try { return L && typeof L.hex === 'function' ? L.hex(tok) : null; } catch (e) { return null; } }
    var m = typeof member === 'string' && /^#?([0-9a-f]{6})$/i.exec(member.trim());
    return {
      hemiSky: hx(STUDIO.hemiSky), hemiGround: hx(STUDIO.hemiGround), hemiIntensity: STUDIO.hemiIntensity,
      keyColor: hx(STUDIO.keyColor), keyIntensity: STUDIO.keyIntensity, keyPos: STUDIO.keyPos.slice(),
      rim: m ? '#' + m[1].toUpperCase() : hx('@member'), rimStrength: STUDIO.rimStrength, exposure: STUDIO.exposure
    };
  }
  /* which LED program a screen texture window shows (texture offset ox, oy; flipY) → index | -1 */
  function ledProgramAt(ox, oy, layout) {
    var A = layout || LED_LAYOUT, col = Math.floor((+ox || 0) * A.w / A.stripW + 1e-6);
    var row = Math.round(((1 - (+oy || 0)) * A.h - A.cellH) / A.cellH);
    if (col < 0 || col >= A.cols || row < 0 || row >= Math.round(A.h / A.cellH)) return -1;
    return row * A.cols + col;
  }
  /* which sign-atlas cell a sign texture window starts in → index | -1 (userCell = name + initial) */
  function signCellAt(ox, oy, layout) {
    var A = layout || SIGN_LAYOUT, col = Math.floor((+ox || 0) * A.w / A.cellW + 1e-6);
    var row = Math.round(((1 - (+oy || 0)) * A.h - A.cellH) / A.cellH);
    if (col < 0 || col >= A.cols || row < 0 || row >= Math.round(A.h / A.cellH)) return -1;
    return row * A.cols + col;
  }

  /* No names in a photocard (the shared icon cache must never hold one). On a built copy (its
     own meshes; the template's shared materials are never edited): every LED screen of a look
     with a photocard program shows that program (the screen tower's star field), any other LED
     window on the name program becomes the star field, and a sign window on the name / initial
     cell is hidden (the neon tower's blade keeps its ✦). Swapped-in materials are photocard
     siblings of the kit's 'led' / 'sign' materials (K.variant: the same programs). Needs only
     obj.traverse, the meshes' materials and K, so it runs in Node tests on plain objects. */
  function atlasKind(m, K) {
    var nm = String(m.name || '');
    if (/^led(#|$)/.test(nm)) return 'led';
    if (/^sign(#|$)/.test(nm)) return 'sign';
    if (nm || !m.map || !m.map.source) return '';
    try {
      if (typeof K.ledAtlas === 'function' && m.map.source === K.ledAtlas().texture.source) return 'led';
      if (typeof K.signAtlas === 'function' && m.map.source === K.signAtlas().texture.source) return 'sign';
    } catch (e) { /* no atlases: nothing to compare */ }
    return '';
  }
  function ledPhotocardMat(K, program) {
    var led = K.ledAtlas(), m = K.variant('led', 'pc:' + program, { map: led.view(program, 0) });
    led.setWindow(m.map, program, 0);                        /* a turntable's idle may have scrolled it */
    return m;
  }
  function depersonalise(obj, spec, K) {
    if (!obj || typeof obj.traverse !== 'function' || !K) return 0;
    var SK = root && root.SLKit, ledL = (SK && SK.LED) || LED_LAYOUT, signL = (SK && SK.SIGN) || SIGN_LAYOUT;
    var nameProg = LED_PROGRAMS.indexOf('name'), screen = spec && spec.screen, hidden = null, n = 0;
    function hide() { return hidden || (hidden = K.variant('sign', 'pc:hidden', { visible: false })); }
    obj.traverse(function (o) {
      if (!o.isMesh || !o.material) return;
      var list = Array.isArray(o.material) ? o.material.slice() : [o.material], changed = false;
      for (var i = 0; i < list.length; i++) {
        var m = list[i], map = m && m.map;
        if (!map || !map.offset) continue;
        var kind = atlasKind(m, K);
        if (kind === 'led') {
          var prog = ledProgramAt(map.offset.x, map.offset.y, ledL), want = screen || (prog === nameProg ? 'stars' : null);
          if (!want || m.name === 'led#pc:' + want) continue;
          try { list[i] = ledPhotocardMat(K, want); } catch (e) { try { list[i] = hide(); } catch (e2) { o.visible = false; } }
          changed = true;
        } else if (kind === 'sign' && signCellAt(map.offset.x, map.offset.y, signL) === signL.userCell) {
          try { list[i] = hide(); } catch (e) { o.visible = false; }
          changed = true;
        }
      }
      if (changed) { o.material = Array.isArray(o.material) ? list : list[0]; n++; }
    });
    return n;
  }
  function cacheName(lookVersion) { return CACHE_PREFIX + (lookVersion == null ? 0 : lookVersion); }
  /* a same-origin URL for the Cache Storage entry (never fetched; only matched) */
  function cacheUrl(base, key) {
    var path = '__sl-pc/' + encodeURIComponent(String(key)) + '.png';
    try { return new URL(path, base).href; } catch (e) { return path; }
  }
  function staleCaches(names, current) {
    return (names || []).filter(function (n) { return typeof n === 'string' && n.indexOf(CACHE_PREFIX) === 0 && n !== current; });
  }
  function trimCount(n, max) { return Math.max(0, (n | 0) - (max | 0)); }

  /* camera basis (same convention as SLGrid3D.basis): D = from target toward the camera,
     F = forward, R = screen right, U = screen up; yaw +25 puts the camera on the item's
     front-left (+x), elevation looks down */
  function basis(yawDeg, elevDeg) {
    var y = yawDeg * DEG, e = elevDeg * DEG;
    var D = { x: Math.sin(y) * Math.cos(e), y: Math.sin(e), z: Math.cos(y) * Math.cos(e) };
    var F = { x: -D.x, y: -D.y, z: -D.z };
    var rl = Math.sqrt(F.z * F.z + F.x * F.x) || 1;
    var R = { x: -F.z / rl, y: 0, z: F.x / rl };
    var U = { x: R.y * F.z - R.z * F.y, y: R.z * F.x - R.x * F.z, z: R.x * F.y - R.y * F.x };
    return { D: D, F: F, R: R, U: U };
  }
  /* the camera position for (target, yaw, elev, dist), written into out */
  function camPos(tx, ty, tz, yawDeg, elevDeg, dist, out) {
    var y = yawDeg * DEG, e = elevDeg * DEG;
    out.x = tx + Math.sin(y) * Math.cos(e) * dist; out.y = ty + Math.sin(e) * dist; out.z = tz + Math.cos(y) * Math.cos(e) * dist;
    return out;
  }
  /* the 8 corners of a box into a flat [x, y, z, …] array */
  function boxPoints(min, max, out) {
    out = out || [];
    out.length = 0;
    for (var i = 0; i < 8; i++) out.push(i & 1 ? max[0] : min[0], i & 2 ? max[1] : min[1], i & 4 ? max[2] : min[2]);
    return out;
  }
  /* frame a point set (flat [x, y, z, …]) from (yaw, elev): the tightest distance that keeps
     every point inside NDC ±fill, with the target nudged until the picture is centred.
     o {fov = 30, yaw = 0, elev = 28, aspect = 1, fill = 0.8, minDist}
     → {tx, ty, tz, px, py, pz, dist, near, far, minX, maxX, minY, maxY} */
  function fitView(pts, o, out) {
    o = o || {}; out = out || {};
    var fov = o.fov || CAM.fov, yaw = o.yaw || 0, elev = o.elev == null ? CAM.elev : o.elev;
    var aspect = o.aspect > 0 ? o.aspect : 1, fill = o.fill > 0 ? Math.min(o.fill, 0.99) : CAM.fill;
    var tanH = Math.tan(fov * DEG / 2), B = basis(yaw, elev), D = B.D, F = B.F, R = B.R, U = B.U;
    var n = (pts.length / 3) | 0, i, k;
    var mnx = Infinity, mny = Infinity, mnz = Infinity, mxx = -Infinity, mxy = -Infinity, mxz = -Infinity;
    for (i = 0; i < n; i++) {
      var x = pts[i * 3], y = pts[i * 3 + 1], z = pts[i * 3 + 2];
      if (x < mnx) mnx = x; if (x > mxx) mxx = x; if (y < mny) mny = y; if (y > mxy) mxy = y; if (z < mnz) mnz = z; if (z > mxz) mxz = z;
    }
    if (!n) { mnx = mny = mnz = -0.5; mxx = mxy = mxz = 0.5; }
    var tx = (mnx + mxx) / 2, ty = (mny + mxy) / 2, tz = (mnz + mxz) / 2, dist = 0;
    var ex0 = 0, ex1 = 0, ey0 = 0, ey1 = 0, dmin = 0, dmax = 0;
    for (k = 0; k < 8; k++) {
      dist = o.minDist > 0 ? o.minDist : 0.05;
      for (i = 0; i < n; i++) {
        var qx = pts[i * 3] - tx, qy = pts[i * 3 + 1] - ty, qz = pts[i * 3 + 2] - tz;
        var f = qx * F.x + qy * F.y + qz * F.z;
        var r = Math.abs(qx * R.x + qy * R.y + qz * R.z), u = Math.abs(qx * U.x + qy * U.y + qz * U.z);
        dist = Math.max(dist, r / (fill * tanH * aspect) - f, u / (fill * tanH) - f);
      }
      var px = tx + D.x * dist, py = ty + D.y * dist, pz = tz + D.z * dist;
      ex0 = ey0 = dmin = Infinity; ex1 = ey1 = dmax = -Infinity;
      for (i = 0; i < n; i++) {
        var vx = pts[i * 3] - px, vy = pts[i * 3 + 1] - py, vz = pts[i * 3 + 2] - pz;
        var dep = vx * F.x + vy * F.y + vz * F.z;
        var nx = (vx * R.x + vy * R.y + vz * R.z) / (dep * tanH * aspect), ny = (vx * U.x + vy * U.y + vz * U.z) / (dep * tanH);
        if (nx < ex0) ex0 = nx; if (nx > ex1) ex1 = nx; if (ny < ey0) ey0 = ny; if (ny > ey1) ey1 = ny;
        if (dep < dmin) dmin = dep; if (dep > dmax) dmax = dep;
      }
      var cx = (ex0 + ex1) / 2, cy = (ey0 + ey1) / 2;
      if (!n || (Math.abs(cx) < 2e-3 && Math.abs(cy) < 2e-3) || k === 7) break;
      /* move the target by the picture's centre offset, measured at the target's depth */
      var sx = cx * dist * tanH * aspect, sy = cy * dist * tanH;
      tx += R.x * sx + U.x * sy; ty += R.y * sx + U.y * sy; tz += R.z * sx + U.z * sy;
    }
    out.tx = tx; out.ty = ty; out.tz = tz;
    out.px = tx + D.x * dist; out.py = ty + D.y * dist; out.pz = tz + D.z * dist;
    out.dist = dist; out.yaw = yaw; out.elev = elev; out.fov = fov; out.aspect = aspect;
    if (!n) { dmin = dist * 0.5; dmax = dist * 1.5; ex0 = ey0 = -fill; ex1 = ey1 = fill; }
    out.near = Math.max(0.01, dmin * 0.6); out.far = dmax * 1.4 + 0.5;
    out.minX = ex0; out.maxX = ex1; out.minY = ey0; out.maxY = ey1;
    return out;
  }
  /* the riser's yaw (deg) after t seconds of auto-turn; still under reduced motion */
  function turntableAngle(t, o) {
    o = o || {};
    var start = o.start != null ? o.start : TT.start;
    if (o.reduced) return start;
    var a = start + 360 * (o.rps != null ? o.rps : TT.rps) * (t || 0);
    return ((a + 180) % 360 + 360) % 360 - 180;
  }
  /* the spot cones' slow sweep (an aim offset in u, ≈0.09 Hz, opposite phases) */
  function beamSway(t, i, reduced) { return reduced ? 0 : 0.22 * Math.sin(TAU * 0.09 * (t || 0) + (i ? Math.PI : 0)); }
  /* turntable drawing-buffer size for a host of cssW × cssH: dpr capped at 2, the
     longer side capped at max, aspect kept; null when the host has no size */
  function sizeFor(cssW, cssH, dpr, max) {
    var d = Math.min(Math.max(Number(dpr) || 1, 1), 2), w = Math.round((Number(cssW) || 0) * d), h = Math.round((Number(cssH) || 0) * d);
    if (w < 2 || h < 2) return null;
    var m = Math.max(w, h), k = Math.min(1, (max || BUF) / m);
    return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
  }
  /* uniform scale that fits an item (half-diagonal rXZ in plan, height h) onto the riser */
  function fitScale(rXZ, h) {
    var s = Math.min(TT.itemR / Math.max(rXZ || 0, 0.05), TT.itemH / Math.max(h || 0, 0.05));
    return clamp(s, 0.2, 4);
  }
  /* one particle of a sparkle burst at age (s): offsets from the burst centre (u),
     size (u), alpha and rotation (rad); reduced → in place, fading over 0.4 s */
  function sparkleAt(age, i, n, seed, reduced, out) {
    out = out || {};
    var r1 = rnd(seed, i * 3), r2 = rnd(seed, i * 3 + 1), r3 = rnd(seed, i * 3 + 2), a, u, life;
    n = Math.max(1, n | 0);
    if (reduced) {
      life = 0.4; u = (age || 0) / life;
      a = (i / n) * TAU + r1 * 0.6;
      var rad = 0.35 + 0.25 * r2;
      out.x = Math.cos(a) * rad; out.z = Math.sin(a) * rad; out.y = (r3 - 0.3) * 0.5;
      out.size = 0.11 + 0.05 * r2; out.alpha = u >= 1 ? 0 : 1 - clamp01(u); out.rot = r1 * TAU;
      out.alive = u < 1; out.life = life;
      return out;
    }
    life = 0.85 + 0.35 * r3; u = (age || 0) / life;
    a = (i / n) * TAU + (r1 - 0.5) * 0.7;
    var reach = 0.55 + 0.35 * r2, e = outQuad(u), uu = clamp01(u);
    out.x = Math.cos(a) * reach * e; out.z = Math.sin(a) * reach * e;
    out.y = (0.15 + 0.55 * r3) * e - 0.25 * uu * uu;
    out.size = (0.1 + 0.08 * r2) * (uu < 0.12 ? uu / 0.12 : Math.pow(1 - uu, 0.6));
    out.alpha = u >= 1 ? 0 : 1 - uu * uu;
    out.rot = r1 * TAU + uu * 1.4;
    out.alive = u < 1; out.life = life;
    return out;
  }
  /* a model's emitted glint (e.g. the gold door): rises and fades over life → {alpha, dy, alive} */
  function glintAt(age, life, out) {
    out = out || {};
    life = life || 0.6;
    var u = clamp01((age || 0) / life);
    out.alpha = Math.sin(Math.PI * u); out.dy = 0.12 * u; out.alive = (age || 0) < life;
    return out;
  }
  /* the purchase debut (same timeline as SLMotion 'debut'): {deg, s, a} */
  var MO_RED = { reduced: true }, MO_FULL = { reduced: false };
  function debutPose(t, reduced, out) {
    out = out || {};
    var M = root && root.SLMotion;
    if (M && typeof M.sample === 'function') {
      try { return M.sample('debut', t, out, reduced ? MO_RED : MO_FULL); } catch (e) { /* fall through */ }
    }
    if (reduced) { out.deg = 0; out.s = 1; out.a = clamp01(t / 0.3); return out; }
    out.deg = t >= 1.2 ? 0 : 360 * inOutSine(t / 1.2);
    out.s = t < 0.3 ? 0.6 + 0.4 * outBack(clamp01(t / 0.3)) : 1;
    out.a = 1;
    return out;
  }
  /* the cone beams' alpha ramp along v (0 = base on the riser, 1 = the lamp): RGBA bytes */
  function alphaRamp(n) {
    n = Math.max(2, n | 0);
    var out = new Uint8Array(n * 4);
    for (var i = 0; i < n; i++) {
      var v = (i + 0.5) / n, a = (0.28 + 0.72 * Math.pow(v, 1.3)) * (v > 0.96 ? (1 - v) / 0.04 : 1);
      out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = 255;
      out[i * 4 + 3] = Math.round(clamp01(a) * 255);
    }
    return out;
  }
  /* a tiny LRU (Map order = recency); onEvict(key, value) on eviction, replacement and clear */
  function lru(max, onEvict) {
    var m = new Map();
    function evict(k, v) { if (onEvict) { try { onEvict(k, v); } catch (e) { /* ignore */ } } }
    return {
      get: function (k) { if (!m.has(k)) return undefined; var v = m.get(k); m.delete(k); m.set(k, v); return v; },
      peek: function (k) { return m.get(k); },
      has: function (k) { return m.has(k); },
      set: function (k, v) {
        if (m.has(k)) { var old = m.get(k); m.delete(k); if (old !== v) evict(k, old); }
        m.set(k, v);
        while (m.size > max) { var first = m.keys().next().value, fv = m.get(first); m.delete(first); evict(first, fv); }
        return this;
      },
      delete: function (k) { if (!m.has(k)) return false; var v = m.get(k); m.delete(k); evict(k, v); return true; },
      clear: function () { var all = []; m.forEach(function (v, k) { all.push([k, v]); }); m.clear(); all.forEach(function (e) { evict(e[0], e[1]); }); },
      keys: function () { return Array.from(m.keys()); },
      get size() { return m.size; }
    };
  }
  /* the display fonts an item's textures are drawn in: the PET COURSE banner (Bagel Fat One,
     Unbounded once the banner moves to it) and the city buildings' signs and screens (Unbounded) */
  function fontsFor(id) {
    id = id || '';
    if (id === 'att_course' || /^course_/.test(id)) return [FONT_BAGEL, FONT_DISPLAY];
    if (/^bld_/.test(id)) return [FONT_DISPLAY];
    return [];
  }
  function needsFont(id) { return fontsFor(id).length > 0; }

  var PURE = {
    VERSION: VERSION, OUT: OUT, BUF: BUF, IDLE_MS: IDLE_MS, CAM: CAM, TT: TT, STUDIO: STUDIO, CLEAR: CLEAR, RISER: RISER,
    CACHE_PREFIX: CACHE_PREFIX, LED_LAYOUT: LED_LAYOUT, LED_PROGRAMS: LED_PROGRAMS, SIGN_LAYOUT: SIGN_LAYOUT,
    parseSpec: parseSpec, cleanSt: cleanSt, stFromKey: stFromKey, stableKey: stableKey, renderSpec: renderSpec,
    iconKey: iconKey, studioLights: studioLights, ledProgramAt: ledProgramAt, signCellAt: signCellAt, depersonalise: depersonalise,
    cacheName: cacheName, cacheUrl: cacheUrl, staleCaches: staleCaches, trimCount: trimCount,
    basis: basis, camPos: camPos, boxPoints: boxPoints, fitView: fitView,
    turntableAngle: turntableAngle, beamSway: beamSway, sizeFor: sizeFor, fitScale: fitScale,
    sparkleAt: sparkleAt, glintAt: glintAt, debutPose: debutPose, alphaRamp: alphaRamp, lru: lru,
    hash: hash, rnd: rnd, needsFont: needsFont, fontsFor: fontsFor
  };
  [STUDIO, STUDIO.keyPos, CLEAR, RISER, RISER.cones, LED_LAYOUT, LED_PROGRAMS, SIGN_LAYOUT].forEach(Object.freeze);
  var api = { __pc: VERSION };
  Object.keys(PURE).forEach(function (k) { api[k] = PURE[k]; });

  if (!HAS_DOM) {
    /* Node: the browser entry points exist but do nothing (the SVG icons stay) */
    var noStop = function () {};
    noStop.stop = noStop; noStop.set = noStop; noStop.debut = noStop; noStop.ready = Promise.resolve(false);
    api.fill = function () { return Promise.resolve(0); };
    api.turntable = function () { return noStop; };
    api.prewarm = function () { return Promise.resolve(0); };
    api.url = function () { return Promise.resolve(null); };
    api.setUser = function () { return api; };
    api.clear = function () { return Promise.resolve(); };
    api.dispose = function () {};
    api.info = function () { return { dom: false }; };
    return api;
  }

  /* ================================================================
     BROWSER RUNTIME
     ================================================================ */
  var perf = root.performance && root.performance.now ? function () { return root.performance.now(); } : Date.now;
  var raf = typeof root.requestAnimationFrame === 'function' ? function (f) { return root.requestAnimationFrame(f); }
    : function (f) { return setTimeout(function () { f(perf()); }, 16); };
  function ls(k) { try { return root.localStorage.getItem(k); } catch (e) { return null; } }
  var QA = ls('slQaMode') === '1';
  function log(m) { if (QA && root.console) root.console.info('[SLPhotocard] ' + m); }
  function errText(e) { return e && e.message ? e.message : String(e); }
  function Look() { return root.SLIslandLook || null; }
  function lookVersion() { var l = Look(); return l && l.LOOK_VERSION != null ? l.LOOK_VERSION : 0; }
  /* the child's member colour (setUser), '#RRGGBB' or null */
  var member = null;
  function memberHex() { return member; }
  function reducedPref() {
    try { return !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
  }

  var stats = { renders: 0, memHits: 0, storeHits: 0, stored: 0, fails: 0, lost: 0, lastMs: 0, frames: 0, disposed: 0 };
  var S = null, sP = null, off = false;   /* SL3D once ready; off = no more renderers this session */
  var gpu = null, res = null, lostCount = 0;
  var mem = lru(MEM_MAX, function (k, url) { try { root.URL.revokeObjectURL(url); } catch (e) { /* ignore */ } });
  var jobs = new Map(), renderQ = [], tts = [], liveBuf = [];
  var rafId = 0, slowId = 0, idleId = 0, waitCanvas = false;
  var freeCanvas = [], canvasTotal = 0, probe = null;

  /* ---------------- SL3D (no mounted island needed) ---------------- */
  function blocked() {
    if (ls('slNo3D') === '1') return 'slNo3D';
    var IS = root.SLIsland3D;
    if (!IS || typeof IS.ensure !== 'function') return 'no stage';
    try { if (typeof IS.failed === 'function' && IS.failed()) return '3D failed'; } catch (e) { /* ignore */ }
    try { if (typeof IS.remembered === 'function' && IS.remembered()) return 'remembered 2D'; } catch (e) { /* ignore */ }
    return null;
  }
  function getS() {
    if (S && S.ready) return Promise.resolve(S);
    if (off) return Promise.resolve(null);
    if (sP) return sP;
    var why = blocked();
    if (why) { log('rendering off: ' + why); return Promise.resolve(null); }
    sP = Promise.resolve().then(function () { return root.SLIsland3D.ensure(); }).then(function (s) {
      sP = null;
      if (s && s.ready && s.THREE && typeof s.make === 'function' && typeof s.createRenderer === 'function') { S = s; return s; }
      return null;
    }, function (e) { sP = null; log('ensure failed: ' + errText(e)); return null; });
    return sP;
  }
  var kicking = false;
  function kickS() {
    if (kicking) return;
    kicking = true;
    getS().then(function (s) {
      kicking = false;
      if (!s) { failQueue(); failTurntables('3D unavailable'); return; }
      wake();
    });
  }

  /* ---------------- the renderer (recreatable) ---------------- */
  function ensureGpu() {
    if (gpu) return gpu;
    if (!S || off) return null;
    var r = null;
    try { r = S.createRenderer({ alpha: true, pixelRatio: 1, width: BUF, height: BUF, shadows: false, antialias: S.tier !== 'LOW' }); } catch (e) { r = null; }
    if (!r) { off = true; log('no renderer: SVG icons for this session'); return null; }
    var c = r.domElement;
    r.setClearColor(CLEAR.color, CLEAR.alpha);           /* transparent: the PNG sits on the dark CSS well */
    r.autoClear = true;
    r.toneMappingExposure = STUDIO.exposure;
    var g = { r: r, canvas: c, onLost: null, away: !!document.hidden };
    g.onLost = function () {
      if (gpu !== g) return;
      stats.lost++;
      /* Safari drops a backgrounded page's contexts: a loss after the page was hidden is
         routine (the next render makes a fresh renderer). Only losses while the page
         stayed visible since this renderer was made count toward switching off. */
      var routine = g.away || !!document.hidden;
      if (!routine) lostCount++;
      log('photocard context lost (' + (routine ? 'after the page was hidden' : lostCount + ' this session') + ')');
      dropGpu(false);
      if (lostCount >= 2) { off = true; failQueue(); failTurntables('context'); }
      else wake();
    };
    c.addEventListener('webglcontextlost', g.onLost, false);
    gpu = g;
    log('renderer up (' + S.tier + ')');
    return g;
  }
  /* true (and the loss counted, the renderer dropped) when the context went away under us */
  function gpuLost() {
    if (!gpu) return true;
    var lost;
    try { var gl = gpu.r.getContext(); lost = !gl || gl.isContextLost(); } catch (e) { lost = true; }
    if (lost) gpu.onLost();                               /* the async event will then be ignored */
    return lost;
  }
  function dropGpu(force) {
    if (!gpu) return;
    var g = gpu;
    gpu = null;
    g.canvas.removeEventListener('webglcontextlost', g.onLost, false);
    try { g.r.dispose(); } catch (e) { /* ignore */ }
    if (force) { try { g.r.forceContextLoss(); } catch (e) { /* ignore */ } }
    try { g.canvas.width = 1; g.canvas.height = 1; } catch (e) { /* ignore */ }
    stats.disposed++;
  }

  /* ---------------- shared JS resources (live as long as the renderer is wanted) ---------------- */
  /* the STUDIO hemisphere + key (the rim is the kit's shared rim uniform, held per render) */
  function makeLights(T, K) {
    var hemi = new T.HemisphereLight(K.col(STUDIO.hemiSky), K.col(STUDIO.hemiGround), STUDIO.hemiIntensity);
    var sun = new T.DirectionalLight(K.col(STUDIO.keyColor), STUDIO.keyIntensity);
    var kp = STUDIO.keyPos;
    sun.position.set(kp[0], kp[1], kp[2]);
    sun.target.position.set(0, 0, 0);
    sun.castShadow = false;
    return { hemi: hemi, sun: sun };
  }
  function disposeLights(l) {
    [l.hemi, l.sun].forEach(function (x) { if (x && typeof x.dispose === 'function') { try { x.dispose(); } catch (e) { /* ignore */ } } });
  }
  function ensureRes() {
    if (res) return res;
    var T = S.THREE, K = S.kit(S.tier);
    var scene = new T.Scene();
    var lights = makeLights(T, K);
    scene.add(lights.hemi, lights.sun, lights.sun.target);
    var blobGeo = new T.PlaneGeometry(1, 1);
    blobGeo.rotateX(-Math.PI / 2);
    var blob = new T.Mesh(blobGeo, K.mat('blob'));
    blob.renderOrder = 1; blob.name = 'pc:blob';
    scene.add(blob);
    /* spot cone: apex at the origin, base (r 1) at y = -1, open; v runs base → apex */
    var coneGeo = new T.ConeGeometry(1, 1, S.tier === 'LOW' ? 16 : 28, 1, true);
    coneGeo.translate(0, -0.5, 0);
    var ramp = new T.DataTexture(alphaRamp(64), 1, 64, T.RGBAFormat);
    ramp.magFilter = T.LinearFilter; ramp.minFilter = T.LinearFilter; ramp.generateMipmaps = false; ramp.needsUpdate = true;
    var coneMats = RISER.cones.map(function (tok) {
      return new T.MeshBasicMaterial({ color: K.col(tok), map: ramp, transparent: true, opacity: RISER.coneAlpha, depthWrite: false,
        side: T.DoubleSide, toneMapped: false, fog: false, name: 'pc:cone' });
    });
    res = {
      T: T, K: K, scene: scene, lights: lights, blob: blob, blobGeo: blobGeo, coneGeo: coneGeo, ramp: ramp, coneMats: coneMats,
      cam: new T.PerspectiveCamera(CAM.fov, 1, 0.05, 100), box: new T.Box3(), box2: new T.Box3(),
      v: new T.Vector3(), v2: new T.Vector3(), m: new T.Matrix4(), mi: new T.Matrix4(), down: new T.Vector3(0, -1, 0),
      rim: new T.Color(), rimFor: '', savedRim: new T.Color(), pts: [], view: {}
    };
    return res;
  }
  function disposeRes() {
    if (!res) return;
    var R = res;
    res = null;
    R.scene.clear();
    disposeLights(R.lights);
    R.blobGeo.dispose(); R.coneGeo.dispose(); R.ramp.dispose();
    R.coneMats.forEach(function (m) { m.dispose(); });
  }

  /* hold the shared kit at the studio look while a photocard renders (the island may be at
     Showtime): the member-colour rim at 0.45 and the Showtime mix at 0, restored afterwards */
  var heldShow = 0, heldRimS = 0;
  function showNow(K) {
    try { var m = K.mat('glow:Neon Pink'); return m && m.visible ? clamp01(m.opacity / 0.45) : 0; } catch (e) { return 0; }
  }
  /* the rim Color for a member hex (null → the look's member fallback); re-made only on change */
  function studioRim(R, member) {
    var hex = studioLights(Look(), member).rim;
    if (hex !== R.rimFor) {
      R.rimFor = hex;
      if (hex) R.rim.copy(R.K.rgb(hex));
      else R.rim.copy(R.K.col((Look() && Look().MEMBER_FALLBACK) || 'Bubblegum'));
    }
    return R.rim;
  }
  function holdStudio(R, member) {
    var K = R.K, u = K.uniforms;
    if (u && u.uRimColor) { R.savedRim.copy(u.uRimColor.value); heldRimS = u.uRimStrength.value; }
    K.setRim(studioRim(R, member), STUDIO.rimStrength);
    heldShow = showNow(K);
    if (heldShow > 0.001) K.setShow(0);
  }
  function releaseStudio(R) {
    var K = R.K;
    K.setRim(R.savedRim, heldRimS);
    if (heldShow > 0.001) K.setShow(heldShow);
  }

  /* ---------------- 2D canvases (one per PNG being encoded) ---------------- */
  function takeCanvas() {
    if (freeCanvas.length) return freeCanvas.pop();
    if (canvasTotal >= CANVAS_MAX) return null;
    var c = document.createElement('canvas');
    c.width = OUT; c.height = OUT;
    canvasTotal++;
    return c;
  }
  function giveCanvas(c) { freeCanvas.push(c); if (waitCanvas) { waitCanvas = false; wake(); } }
  function releaseCanvases() {
    freeCanvas.forEach(function (c) { c.width = 0; c.height = 0; });
    canvasTotal -= freeCanvas.length;
    freeCanvas.length = 0;
    if (probe) { probe.width = 0; probe.height = 0; probe = null; }
  }
  /* a render that came out empty (context trouble) must never be cached */
  function hasInk(cv) {
    try {
      if (!probe) { probe = document.createElement('canvas'); probe.width = 32; probe.height = 32; }
      var p = probe.getContext('2d', { willReadFrequently: true });
      p.clearRect(0, 0, 32, 32);
      p.drawImage(cv, 0, 0, OUT, OUT, 0, 0, 32, 32);
      var d = p.getImageData(0, 0, 32, 32).data, n = 0;
      for (var i = 3; i < d.length; i += 4) if (d[i] > 16 && ++n >= 12) return true;
      return false;
    } catch (e) { return true; }   /* can't check: trust the render */
  }
  function dataUrlBlob(url) {
    var i = url.indexOf(','), bin = root.atob(url.slice(i + 1)), a = new Uint8Array(bin.length);
    for (var k = 0; k < bin.length; k++) a[k] = bin.charCodeAt(k);
    return new root.Blob([a], { type: 'image/png' });
  }
  /* PNG-encode (async where the browser can); cb fires exactly once, null after 6 s */
  function toBlob(cv, cb) {
    var done = false, timer = 0;
    function once(b) { if (done) return; done = true; clearTimeout(timer); cb(b || null); }
    try {
      if (typeof cv.toBlob === 'function') {
        timer = setTimeout(function () { once(null); }, 6000);
        cv.toBlob(once, 'image/png');
        return;
      }
      once(dataUrlBlob(cv.toDataURL('image/png')));
    } catch (e) { once(null); }
  }

  /* ---------------- Cache Storage 'sl-pc-<LOOK_VERSION>' ---------------- */
  var storeP = null, storeFor = '', putsSinceTrim = 0, staleSwept = false;
  function store() {
    var name = cacheName(lookVersion());
    if (storeP && storeFor === name) return storeP;
    storeFor = name;
    var C = root.caches;
    if (!C || typeof C.open !== 'function') return (storeP = Promise.resolve(null));
    storeP = Promise.resolve().then(function () { return C.open(name); }).then(function (c) { return c || null; }, function () { return null; });
    if (!staleSwept) { staleSwept = true; setTimeout(sweepStale, 4000); }
    return storeP;
  }
  function sweepStale() {
    var C = root.caches;
    if (!C || typeof C.keys !== 'function') return;
    C.keys().then(function (names) {
      return Promise.all(staleCaches(names, storeFor).map(function (n) { return C.delete(n); }));
    }).catch(function () { /* ignore */ });
  }
  function keyUrl(key) { return cacheUrl(document.baseURI || root.location.href, key); }
  function storeGet(key) {
    return store().then(function (c) { return c ? c.match(keyUrl(key)) : null; })
      .then(function (r) { return r && r.ok ? r.blob() : null; })
      .then(function (b) { return b && b.size > 0 ? b : null; }, function () { return null; });
  }
  function storePut(key, blob) {
    store().then(function (c) {
      if (!c) return null;
      return c.put(keyUrl(key), new root.Response(blob, { headers: { 'Content-Type': 'image/png' } })).then(function () {
        stats.stored++;
        if (++putsSinceTrim < TRIM_EVERY) return null;
        putsSinceTrim = 0;
        return c.keys().then(function (ks) {
          return Promise.all(ks.slice(0, trimCount(ks.length, STORE_MAX)).map(function (k) { return c.delete(k); }));
        });
      });
    }).catch(function () { /* quota / private mode: memory only */ });
  }

  /* ---------------- specs, the DOM swap ---------------- */
  /* the render spec, keyed for the icon caches by the render key plus the studio rim colour */
  function specOf(id, st, pck) {
    var Lk = Look();
    if (!st && pck && Lk && Lk.LOOK) st = stFromKey(id, pck, Lk);
    var spec = renderSpec(id, st || {}, Lk);
    if (spec && !(Lk && Lk.LOOK) && pck) { spec.stateKey = pck; spec.key = id + '#' + pck; }
    if (spec) { spec.member = memberHex(); spec.key = iconKey(spec.key, spec.member); }
    return spec;
  }
  function specOfEl(el) {
    var p = parseSpec(el.getAttribute('data-pc'), el.getAttribute('data-st'), el.getAttribute('data-pck'));
    return p ? specOf(p.id, p.st, p.pck) : null;
  }
  /* lay the PNG over the element's SVG (which keeps the layout) once it has decoded */
  function apply(el, url, key) {
    if (!el || !url) return;
    if (el.getAttribute('data-pc-done') === key) return;
    el.setAttribute('data-pc-done', key);
    var img = el.querySelector('img[data-pc-img]'), fresh = !img;
    if (fresh) {
      img = document.createElement('img');
      img.setAttribute('data-pc-img', '');
      img.alt = ''; img.draggable = false;
      img.setAttribute('aria-hidden', 'true');
      try { img.decoding = 'async'; } catch (e) { /* ignore */ }
    }
    var others = [];
    for (var c = el.firstElementChild; c; c = c.nextElementSibling) if (c !== img) others.push(c);
    var overlay = others.length > 0;
    /* a fresh image waits invisible until decoded; a restyled one keeps its old picture meanwhile */
    img.style.cssText = (overlay
      ? 'position:absolute;left:0;top:0;width:100%;height:100%;object-fit:contain;pointer-events:none;'
      : 'display:block;width:100%;height:100%;object-fit:contain;pointer-events:none;') + (fresh ? 'opacity:0;' : '');
    img.onload = function () {
      if (el.getAttribute('data-pc-done') !== key) return;     /* superseded meanwhile */
      if (overlay) {
        try { if (root.getComputedStyle(el).position === 'static') el.style.position = 'relative'; } catch (e) { /* ignore */ }
        others.forEach(function (o) { if (o.parentNode === el) o.style.visibility = 'hidden'; });
      }
      img.style.opacity = '1';
    };
    img.onerror = function () { if (img.parentNode) img.parentNode.removeChild(img); el.removeAttribute('data-pc-done'); };
    if (fresh) el.appendChild(img);
    img.src = url;
  }

  /* ---------------- jobs: memory → Cache Storage → render ---------------- */
  function request(spec, el, prio) {
    var hit = mem.get(spec.key);
    if (hit) { stats.memHits++; if (el) apply(el, hit, spec.key); return Promise.resolve(hit); }
    var job = jobs.get(spec.key);
    if (!job) {
      job = { key: spec.key, spec: spec, els: [], prio: prio, tries: 0, queued: false, resolve: null, promise: null };
      job.promise = new Promise(function (r) { job.resolve = r; });
      jobs.set(spec.key, job);
      storeGet(spec.key).then(function (blob) {
        if (jobs.get(spec.key) !== job) return;
        if (blob) { stats.storeHits++; finish(job, blob); return; }
        fontGate(fontsFor(spec.id)).then(function () { enqueue(job); });
      });
    } else if (prio < job.prio) {
      job.prio = prio;
      if (job.queued) { renderQ.splice(renderQ.indexOf(job), 1); job.queued = false; enqueue(job); }
    }
    if (el && job.els.indexOf(el) < 0) job.els.push(el);
    return job.promise;
  }
  function enqueue(job) {
    if (jobs.get(job.key) !== job || job.queued) return;
    if (off) { finish(job, null); return; }
    var i = 0;
    while (i < renderQ.length && renderQ[i].prio <= job.prio) i++;
    renderQ.splice(i, 0, job);
    job.queued = true;
    wake();
  }
  function finish(job, blob) {
    if (jobs.get(job.key) === job) jobs.delete(job.key);
    if (job.queued) { var i = renderQ.indexOf(job); if (i >= 0) renderQ.splice(i, 1); job.queued = false; }
    var url = null;
    if (blob) {
      try { url = root.URL.createObjectURL(blob); } catch (e) { url = null; }
      if (url) mem.set(job.key, url);
    }
    var els = job.els;
    job.els = [];
    if (url) els.forEach(function (el) { apply(el, url, job.key); });
    job.resolve(url);
    scheduleQuiet();
  }
  function failQueue() { renderQ.slice().forEach(function (j) { finish(j, null); }); renderQ.length = 0; }
  /* wait (once per font, at most 1.5 s) for the display fonts an icon's textures use, so a
     cached icon is not drawn in a fallback face for good */
  var fontWait = {};
  function fontGate(list) {
    var F = document.fonts;
    if (!list || !list.length || !F || typeof F.load !== 'function') return Promise.resolve();
    return Promise.all(list.map(function (spec) {
      if (!fontWait[spec]) {
        fontWait[spec] = Promise.race([
          Promise.resolve().then(function () { return F.load(spec); }).catch(function () { return null; }),
          new Promise(function (r) { setTimeout(r, 1500); })
        ]).then(function () { return null; });
      }
      return fontWait[spec];
    })).then(function () { return null; });
  }

  /* ---------------- building one item ---------------- */
  /* the land photocard: a small organic islet in the region's LOOK colours on a lagoon puddle —
     round, layered, off-centre tiers (no square tiles: the v2 island has no grid in play) */
  function landGeo(K, id) {
    return K.parts.get('pc:land|' + id, K.tier, function (Kt) {
      var G = Kt.G, Lk = Look(), c = (Lk && Lk.LOOK && Lk.LOOK[id] && Lk.LOOK[id].colors) || {}, list = [];
      var meadow = id === 'land_meadow', top = c.top || (meadow ? 'Hill Moss' : 'Dune'), side = c.side || (meadow ? 'Cliff Rock' : 'Wet Dune');
      var rad = Kt.tier === 'LOW' ? 20 : 32;
      /* one tier: a tapered disc squashed to an oval; the flat top in the top colour, the bank in
         the side colour (shaded toward the water) */
      function tier(rTop, rBot, h, x, y, z, sx, sz) {
        var g = G.t(G.tube(rTop, rBot, h, { radial: rad }), { s: [sx, 1, sz], p: [x, y + h / 2, z] });
        return G.paintBy(g, function (v) { return v.ny > 0.6 ? top : v.y < y + h * 0.45 ? [side, 'shade'] : side; });
      }
      function dot(geo, tok, s, p, r) { list.push(G.paint(G.t(geo, { s: s, r: r, p: p }), tok)); }
      list.push(G.paintBy(G.t(G.tube(1.12, 1.16, 0.05, { radial: 32 }), { p: [0, 0.025, 0] }), function (v) { return v.ny > 0.6 ? 'Lagoon' : 'Deep Bay'; }));
      list.push(G.paint(G.t(G.ring(0.97, 0.028), { s: [1.04, 0.92, 1], r: [90, 0, 0], p: [0, 0.055, 0] }), 'Foam Dusk'));
      if (meadow) {
        list.push(tier(0.8, 0.96, 0.18, 0.02, 0.04, 0.04, 1.06, 0.95));
        list.push(tier(0.46, 0.58, 0.2, -0.18, 0.22, -0.2, 1.1, 0.92));
        var fl = [c.w1 || 'Cloud White', c.w2 || 'Tulip Yellow', c.w3 || 'Tulip Pink'];
        [[0.55, 0.23, 0.35], [0.62, 0.23, -0.1], [0.15, 0.23, 0.62], [-0.55, 0.23, 0.42], [-0.12, 0.43, -0.12], [-0.32, 0.43, -0.32]].forEach(function (p, i) {
          dot(G.puff(0.04), fl[i % 3], 1, p);
        });
      } else {
        list.push(tier(0.78, 0.98, 0.14, 0.04, 0.04, 0.02, 1.08, 0.94));
        list.push(tier(0.34, 0.5, 0.12, -0.28, 0.17, -0.22, 1.2, 0.9));
        dot(G.puff(0.055), c.shell || 'Blossom Light', [1, 0.5, 1.2], [0.45, 0.19, 0.35]);
        dot(G.puff(0.045), c.shell || 'Blossom Light', [1.2, 0.5, 1], [0.18, 0.19, 0.62]);
        dot(G.star(0.11, 0.045), c.starfish || 'Peach Coral', 1, [0.55, 0.2, -0.08], [-90, 0, 20]);
      }
      var merged = G.merge(list);
      list.forEach(function (g) { g.dispose(); });
      return merged;
    });
  }
  function landDiorama(K, id) {
    var T = K.THREE, g = new T.Group();
    var m = new T.Mesh(landGeo(K, id), K.mat('toon'));
    m.name = 'land';
    g.add(m);
    g.name = 'pc:' + id;
    g.userData = { id: id, dispose: function () { if (g.parent) g.parent.remove(g); g.clear(); } };
    return g;
  }

  /* the animation handle a model's idle(a) / show(a, k) gets on a photocard (allocation-free) */
  function PivotSetter(node) {
    this.node = node || null;
    this.bx = node ? node.position.x : 0; this.by = node ? node.position.y : 0; this.bz = node ? node.position.z : 0;
  }
  PivotSetter.prototype.set = function (rot, pos, scale) {
    var n = this.node;
    if (!n) return this;
    n.rotation.set(rot ? (rot[0] || 0) * DEG : 0, rot ? (rot[1] || 0) * DEG : 0, rot ? (rot[2] || 0) * DEG : 0, 'XYZ');
    n.position.set(this.bx + (pos ? pos[0] || 0 : 0), this.by + (pos ? pos[1] || 0 : 0), this.bz + (pos ? pos[2] || 0 : 0));
    if (scale == null) n.scale.set(1, 1, 1);
    else if (typeof scale === 'number') n.scale.set(scale || 1e-4, scale || 1e-4, scale || 1e-4);
    else n.scale.set(scale[0] || 1e-4, scale[1] || 1e-4, scale[2] || 1e-4);
    return this;
  };
  var NO_PETS = { active: function () { return null; }, perform: function () { return 0; } };
  function noop() {}
  /* beyond the island's handle: photocard = true (pick the non-personal look: no name, no
     initial), member = the studio rim colour, screen = the LED program to show (or null) */
  function Handle(obj, tpl, spec, uid) {
    this.uid = uid; this.id = spec.id; this.object = obj; this.template = tpl || null; this.batch = null;
    this.stateKey = (tpl && tpl.stateKey) || spec.stateKey; this.st = spec.st;
    this.t = 0; this.dt = 0; this.phase = (hash(uid) % 1000) / 1000; this.rand = (hash(uid + ':r') % 1000) / 1000;
    this.reduced = false; this.beat = 0; this.bar = 0; this.bpm = 100; this.show = 0; this.lit = 0; this.music = null;
    this.photocard = true; this.member = studioLights(Look(), spec.member).rim; this.screen = spec.screen || null;
    this.pets = NO_PETS; this._piv = {}; this._base = {}; this._emit = null;
  }
  Handle.prototype.pivot = function (name) {
    var p = this._piv[name];
    if (p) return p;
    var ud = this.object.userData || {}, node = ud.pivots && ud.pivots[name];
    if (!node && (name === 'sway' || name === 'root')) node = this.object;
    p = this._piv[name] = new PivotSetter(node);
    return p;
  };
  Handle.prototype.copyGeometry = function (part) {
    var ms = this.object.userData && this.object.userData.meshes, m = ms && ms[part];
    return m && m.geometry ? m.geometry : null;
  };
  Handle.prototype.basePositions = function (part) {
    if (this._base[part]) return this._base[part];
    var ps = this.template && this.template.parts, i;
    if (ps) for (i = 0; i < ps.length; i++) if (ps[i].name === part) return (this._base[part] = ps[i].geo.getAttribute('position').array);
    return null;
  };
  Handle.prototype.state = function (key, value) { var ud = this.object.userData; if (ud && typeof ud.setState === 'function') ud.setState(key, value); };
  Handle.prototype.emit = function (kind, at, n, o) { if (this._emit) this._emit(this, kind, at, n, o); };
  Handle.prototype.halo = noop; Handle.prototype.decal = noop; Handle.prototype.sfx = noop;
  Handle.prototype.shake = noop; Handle.prototype.squish = noop;
  Handle.prototype.tick = function (t, dt) {
    this.t = t; this.dt = dt;
    var b = t * this.bpm / 60;
    this.beat = b - Math.floor(b); this.bar = Math.floor(b / 4);
  };

  /* SL3D.make (or a rig for live pets, or the land diorama) → {obj, rig, model, tpl, handle} | null
     o {live (a turntable: rigs, per-frame idle), uid, reduced, emit(handle, kind, at, n, opts)} */
  function buildItem(spec, o) {
    var K = S.kit(S.tier), live = !!o.live, out = { obj: null, rig: null, model: null, tpl: null, handle: null, idleOk: true };
    if (spec.kind === 'land') { out.obj = landDiorama(K, spec.id); return out; }
    if (live && spec.kind === 'pet' && typeof S.makeRig === 'function') {
      try {
        var rig = S.makeRig(spec.id, (spec.st && spec.st.acc) || {}, S.tier);
        if (rig && rig.root) { if (rig.setShow) rig.setShow(0); out.rig = rig; out.obj = rig.root; return out; }
      } catch (e) { log('makeRig ' + spec.id + ': ' + errText(e)); }
    }
    var obj = S.make(spec.id, spec.st, S.tier);
    if (!obj) return null;
    var ud = obj.userData || {};
    if (ud.template && ud.template.placeholder) { disposeBuilt({ obj: obj }); log('no model for ' + spec.id + ': SVG stays'); return null; }
    out.obj = obj; out.tpl = ud.template || null;
    out.model = ud.model || (S.models && S.models[spec.id]) || null;
    out.handle = new Handle(obj, out.tpl, spec, o.uid || 'pc:icon');
    out.handle.reduced = !live || !!o.reduced;            /* icons always take the still pose */
    out.handle._emit = live && o.emit ? o.emit : null;
    settle(out);
    depersonalise(obj, spec, K);
    return out;
  }
  /* the studio look once (show k = 0), and the static pose for icons / reduced motion */
  function settle(b) {
    var m = b.model, a = b.handle;
    if (!m || !a) return;
    a.tick(0, 0);
    try { if (typeof m.show === 'function') m.show(a, 0); } catch (e) { log('show ' + a.id + ': ' + errText(e)); }
    if (a.reduced && typeof m.idle === 'function') {
      try { m.idle(a); } catch (e) { b.idleOk = false; log('idle ' + a.id + ': ' + errText(e)); }
    }
  }
  function disposeBuilt(b) {
    if (!b) return;
    try {
      if (b.rig) b.rig.dispose();
      else if (b.obj && b.obj.userData && typeof b.obj.userData.dispose === 'function') b.obj.userData.dispose();
      else if (b.obj && b.obj.parent) b.obj.parent.remove(b.obj);
    } catch (e) { log('dispose: ' + errText(e)); }
  }
  /* visible mesh bounds in obj's own space (glow sleeves hidden by day and hull copies skipped) */
  function boundsOf(obj, box, tmp) {
    box.makeEmpty();
    obj.updateMatrixWorld(true);
    obj.traverseVisible(function (o) {
      if (!o.isMesh || !o.geometry) return;
      var mt = o.material;
      if (mt && mt.visible === false) return;
      if (/:outline$|^outline$/.test(o.name || '')) return;
      var b = null;
      if ((o.isInstancedMesh || o.isSkinnedMesh) && typeof o.computeBoundingBox === 'function') {
        try { o.computeBoundingBox(); b = o.boundingBox; } catch (e) { b = null; }
      }
      if (!b) { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); b = o.geometry.boundingBox; }
      if (!b || b.isEmpty()) return;
      tmp.copy(b).applyMatrix4(o.matrixWorld);
      box.union(tmp);
    });
    return box;
  }

  /* up to max world-space vertices of the visible meshes (flat [x, y, z, …]) — round items
     frame on their real silhouette, not on their bounding box's corners */
  function samplePoints(obj, out, max, R) {
    out.length = 0;
    var meshes = [], total = 0, v = R.v, m = R.m, mi = R.mi;
    obj.traverseVisible(function (o) {
      if (!o.isMesh || !o.geometry || o.isSkinnedMesh) return;
      if (o.material && o.material.visible === false) return;
      if (/:outline$|^outline$/.test(o.name || '')) return;
      var p = o.geometry.getAttribute('position');
      if (p) { meshes.push(o); total += p.count; }
    });
    var stride = Math.max(1, Math.ceil(total / max));
    meshes.forEach(function (o) {
      var p = o.geometry.getAttribute('position');
      m.copy(o.matrixWorld);
      if (o.isInstancedMesh) { o.getMatrixAt(0, mi); m.multiply(mi); }
      for (var i = 0; i < p.count; i += stride) {
        v.fromBufferAttribute(p, i).applyMatrix4(m);
        out.push(v.x, v.y, v.z);
      }
    });
    return out;
  }

  /* ---------------- one icon ---------------- */
  /* → 'done' (encoding; finish() follows) | 'fail' | 'wait' (no free 2D canvas) | 'retry' (context lost) */
  function renderIcon(job) {
    var g = ensureGpu();
    if (!g) return 'fail';
    var R = ensureRes();
    var cv = takeCanvas();
    if (!cv) return 'wait';
    var built = null, ok = false, lost = false, t0 = perf();
    try {
      built = buildItem(job.spec, { live: false, uid: 'pc:icon' });
      if (!built) throw new Error('nothing to render');
      var obj = built.obj, b = boundsOf(obj, R.box, R.box2);
      if (b.isEmpty()) throw new Error('empty bounds');
      var w = b.max.x - b.min.x, d = b.max.z - b.min.z, by = Math.min(0, b.min.y);
      var cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2;
      R.blob.scale.set(Math.max(0.2, w * 1.1), 1, Math.max(0.2, d * 1.1));
      R.blob.position.set(cx, by + 0.004, cz);
      /* frame the real silhouette (80% of the frame) plus the shadow's soft ellipse */
      var pts = samplePoints(obj, R.pts, 4000, R);
      if (pts.length < 24) pts = boxPoints([b.min.x, b.min.y, b.min.z], [b.max.x, b.max.y, b.max.z], pts);
      pts.push(cx - w * 0.5, by, cz, cx + w * 0.5, by, cz, cx, by, cz - d * 0.5, cx, by, cz + d * 0.5);
      var v = fitView(pts, { fov: CAM.fov, yaw: CAM.yaw, elev: CAM.elev, aspect: 1, fill: CAM.fill }, R.view), cam = R.cam;
      cam.fov = CAM.fov; cam.aspect = 1; cam.near = v.near; cam.far = v.far;
      cam.position.set(v.px, v.py, v.pz); cam.up.set(0, 1, 0); cam.lookAt(v.tx, v.ty, v.tz);
      cam.updateProjectionMatrix();
      R.scene.add(obj);
      holdStudio(R, job.spec.member);                      /* the rim the icon's cache key names */
      try { g.r.setViewport(0, 0, BUF, BUF); g.r.render(R.scene, cam); } finally { releaseStudio(R); }
      if (gpuLost()) { lost = true; throw new Error('context lost'); }
      var ctx = cv.getContext('2d');
      ctx.clearRect(0, 0, OUT, OUT);
      ctx.imageSmoothingEnabled = true;
      try { ctx.imageSmoothingQuality = 'high'; } catch (e) { /* ignore */ }
      ctx.drawImage(g.canvas, 0, 0, BUF, BUF, 0, 0, OUT, OUT);
      if (!hasInk(cv)) { lost = gpuLost(); throw new Error('blank render'); }
      ok = true;
      stats.renders++; stats.lastMs = Math.round((perf() - t0) * 10) / 10;
    } catch (e) {
      if (!lost) { stats.fails++; log('icon ' + job.key + ': ' + errText(e)); }
    } finally {
      if (built) disposeBuilt(built);
    }
    if (!ok) { giveCanvas(cv); return lost ? 'retry' : 'fail'; }
    toBlob(cv, function (blob) {
      giveCanvas(cv);
      if (blob) storePut(job.key, blob);
      finish(job, blob);
    });
    return 'done';
  }

  /* ================================================================
     TURNTABLES
     ================================================================ */
  var uidSlots = [];
  function takeSlot() { var i = 0; while (uidSlots[i]) i++; uidSlots[i] = true; return i; }
  /* the riser: a Gunmetal disc (drawn with the gunmetal matcap; the vertex tones carry the same
     look if the kit falls back to toon) with a Neon Magenta ring round its top edge */
  function riserParts(K) {
    return K.parts.get('pc:riser', K.tier, function (Kt) {
      var G = Kt.G, H = TT.riserH, R = TT.riserR;
      var body = G.t(G.tube(R, R + 0.04, H, { radial: Kt.tier === 'LOW' ? 28 : 44 }), { p: [0, H / 2, 0] });
      G.paintBy(body, function (v) { return v.ny > 0.6 ? RISER.top : v.ny < -0.6 || v.y < H * 0.35 ? RISER.base : RISER.side; });
      var ring = G.t(G.ring(R + 0.006, 0.022), { r: [90, 0, 0], p: [0, H, 0] });
      return { body: body, ring: ring };
    });
  }
  function Turntable(host, spec, opts) {
    this.host = host; this.spec = spec; this.opts = opts;
    this.reduced = typeof opts.reduced === 'boolean' ? opts.reduced : reducedPref();
    this.slot = takeSlot(); this.uid = 'pc:tt' + this.slot;
    this.dead = false; this.shown = false; this.built = null; this.sc = null; this.next = null;
    this.t = 0; this.spinT = 0; this.lastNow = -1; this.lastDraw = -1; this.dirty = true; this.anim = true;
    this.debutT = opts.debut ? 0 : -1; this.squishT = -1;
    this.flyT = (opts.flythrough !== false && spec.kind === 'variant') ? 0 : -1;
    this.dragAngle = 0; this.drag = null; this.resumeAt = 0;
    this.w = 0; this.h = 0; this.sizeDirty = true; this.offscreen = false;
    this.canvas = null; this.ctx = null; this.saved = []; this.hostPos = null;
    this.ro = null; this.io = null; this.scale = 1; this.top = 1; this.reach = TT.riserR;
    this.view = {}; this.cp = { x: 0, y: 0, z: 0 }; this.pose = {}; this.squish = {}; this.rigOpts = { reduced: this.reduced, intensity: 1 };
    this.parts = []; this.seed = hash(this.uid + ':' + spec.key) ^ (Date.now() & 0xffff);
    this._ready = null; this.stopFn = null; this.burst = false;
  }
  function turntable(host, id, st, opts) {
    opts = opts || {};
    var stop = function () { if (tt) kill(tt, null); };
    var tt = null, readyFn = null, spec = null;
    stop.ready = new Promise(function (r) { readyFn = r; });
    stop.stop = stop;
    stop.set = function () {}; stop.debut = function () {};
    try { spec = host && host.nodeType === 1 ? specOf(id, st || null, null) : null; } catch (e) { spec = null; }
    if (!spec || blocked() === 'slNo3D' || off) { readyFn(false); return stop; }
    tts.slice().forEach(function (o) { if (o.host === host) kill(o, null); });   /* one turntable per host */
    tt = new Turntable(host, spec, opts);
    tt._ready = readyFn;
    stop.set = function (id2, st2) {
      if (tt.dead) return;
      var s2 = null;
      try { s2 = specOf(id2, st2 || null, null); } catch (e) { s2 = null; }
      if (!s2) return;
      if (!tt.sc) { tt.spec = s2; return; }               /* not built yet: just build the new one */
      if (s2.key === (tt.next || tt.spec).key) return;
      tt.next = s2; tt.dirty = true; wake();
    };
    stop.debut = function () { if (!tt.dead) { tt.debutT = 0; tt.burst = true; tt.dirty = true; wake(); } };
    stop.canvas = null;
    tt.stopFn = stop;
    tts.push(tt);
    getS().then(function (s) {
      if (tt.dead) return;
      if (!s) { kill(tt, '3D unavailable'); return; }
      wake();
    });
    return stop;
  }
  function failTurntables(why) { tts.slice().forEach(function (tt) { kill(tt, why); }); }
  /* stop a turntable: why = null for a normal stop, else the failure reason (onFail) */
  function kill(tt, why) {
    if (tt.dead) return;
    tt.dead = true;
    var i = tts.indexOf(tt);
    if (i >= 0) tts.splice(i, 1);
    uidSlots[tt.slot] = false;
    if (tt.ro) { try { tt.ro.disconnect(); } catch (e) { /* ignore */ } tt.ro = null; }
    if (tt.io) { try { tt.io.disconnect(); } catch (e) { /* ignore */ } tt.io = null; }
    if (tt.canvas) {
      if (tt.canvas.parentNode) tt.canvas.parentNode.removeChild(tt.canvas);
      tt.canvas.width = 0; tt.canvas.height = 0;
    }
    tt.saved.forEach(function (s) { s.el.style.visibility = s.vis; s.el.style.opacity = s.op; s.el.style.transition = s.tr; });
    tt.saved = [];
    if (tt.hostPos != null) { tt.host.style.position = tt.hostPos; tt.hostPos = null; }
    if (tt.built) { disposeBuilt(tt.built); tt.built = null; }
    if (tt.sc) {
      try { tt.pool.dispose(); } catch (e) { /* ignore */ }
      disposeLights(tt.lights);
      tt.sc.clear();
      tt.sc = null;
    }
    if (tt._ready) { tt._ready(!why && tt.shown ? true : false); tt._ready = null; }
    if (why) {
      log('turntable failed: ' + why);
      if (typeof tt.opts.onFail === 'function') { try { tt.opts.onFail(why); } catch (e) { /* ignore */ } }
    }
    scheduleQuiet();
  }
  function buildTT(tt) {
    var R = ensureRes(), T = R.T, K = R.K;
    var sc = new T.Scene(), lights = makeLights(T, K);
    sc.add(lights.hemi, lights.sun, lights.sun.target);
    var cam = new T.PerspectiveCamera(CAM.fov, 1, 0.05, 80);
    var spin = new T.Group(), fit = new T.Group(), rp = riserParts(K);
    var body = new T.Mesh(rp.body, K.mat(RISER.mat)), ring = new T.Mesh(rp.ring, K.mat('neon:' + RISER.ring));
    body.name = 'pc:riser'; ring.name = 'pc:ring';
    var blob = new T.Mesh(R.blobGeo, K.mat('blob'));
    blob.renderOrder = 1; blob.position.y = TT.riserH + 0.004;
    spin.add(body, ring, blob, fit);
    sc.add(spin);
    var cones = [0, 1].map(function (i) {
      var m = new T.Mesh(R.coneGeo, R.coneMats[i]);
      m.renderOrder = 4; m.frustumCulled = false; m.name = 'pc:cone' + i;
      sc.add(m);
      return m;
    });
    var pool = K.billboards({ capacity: PMAX, texture: 'sparkles', additive: false, fog: false, renderOrder: 6, name: 'pc:sparkles' });
    sc.add(pool.mesh);
    tt.sc = sc; tt.cam = cam; tt.lights = lights; tt.spinG = spin; tt.fitG = fit; tt.blob = blob; tt.cones = cones; tt.pool = pool;
    for (var p = 0; p < PMAX; p++) tt.parts.push({ k: -1, age: 0, life: 0, i: 0, n: 1, mode: 0, x: 0, y: 0, z: 0, tok: '', cell: 0, size: 0.1 });
    tt.emitFn = function (a, kind, at, n, o) { emitFromModel(tt, a, at, n, o); };
    return swapItem(tt, tt.spec);
  }
  function swapItem(tt, spec) {
    var R = res, b = buildItem(spec, { live: true, uid: tt.uid, reduced: tt.reduced, emit: tt.emitFn });
    if (!b) return false;
    if (tt.built) disposeBuilt(tt.built);
    tt.built = b; tt.spec = spec;
    if (b.rig) { try { b.rig.play('idle', 0, tt.rigOpts); } catch (e) { /* the rest pose stays */ } }
    var box = boundsOf(b.obj, R.box, R.box2);
    if (box.isEmpty()) box.set(R.v.set(-0.3, 0, -0.3), R.v2.set(0.3, 0.6, 0.3));
    var w = box.max.x - box.min.x, d = box.max.z - box.min.z, h = Math.max(0.05, box.max.y - Math.min(0, box.min.y));
    var rxz = 0.5 * Math.sqrt(w * w + d * d), s = fitScale(rxz, h);
    tt.scale = s;
    tt.fitG.scale.setScalar(s);
    tt.fitG.position.set(-(box.min.x + box.max.x) / 2 * s, TT.riserH - Math.min(0, box.min.y) * s, -(box.min.z + box.max.z) / 2 * s);
    tt.fitG.add(b.obj);
    tt.blob.scale.set(clamp(w * s * 1.1, 0.25, 1.3), 1, clamp(d * s * 1.1, 0.25, 1.3));
    tt.top = TT.riserH + h * s;
    tt.reach = Math.max(TT.riserR + 0.05, rxz * s);
    frameTT(tt);
    tt.dirty = true;
    return true;
  }
  /* fit the camera to the riser + the item's turning cylinder at the host's aspect */
  function frameTT(tt) {
    var pts = [], r = tt.reach;
    for (var i = 0; i < 8; i++) {
      var a = i / 8 * TAU, x = Math.cos(a) * r, z = Math.sin(a) * r;
      pts.push(x, 0, z, x, tt.top + 0.04, z);
    }
    fitView(pts, { fov: CAM.fov, yaw: 0, elev: CAM.elev, aspect: tt.w > 0 && tt.h > 0 ? tt.w / tt.h : 1, fill: TT.fill }, tt.view);
    tt.cam.aspect = tt.view.aspect;
    tt.cam.updateProjectionMatrix();
  }
  function placeCam(tt) {
    var v = tt.view, cam = tt.cam, yaw = 0, elev = v.elev, dm = 1;
    if (tt.flyT >= 0) {
      var k = inOutSine(tt.flyT / TT.flyDur), f = TT.flyFrom;
      yaw = f.yaw + (0 - f.yaw) * k; elev = f.elev + (v.elev - f.elev) * k; dm = f.dist + (1 - f.dist) * k;
    }
    camPos(v.tx, v.ty, v.tz, yaw, elev, v.dist * dm, tt.cp);
    cam.position.set(tt.cp.x, tt.cp.y, tt.cp.z);
    cam.near = Math.max(0.01, v.near * (dm < 1 ? 0.5 : 1)); cam.far = v.far;
    cam.up.set(0, 1, 0);
    cam.lookAt(v.tx, v.ty, v.tz);
    cam.updateProjectionMatrix();
  }
  /* ---- sparkles ---- */
  function spawn(tt, mode, n, x, y, z, size, tok) {
    var ps = tt.parts, made = 0;
    for (var i = 0; i < ps.length && made < n; i++) {
      var p = ps[i];
      if (p.k >= 0) continue;
      var k = tt.pool.alloc();
      if (k < 0) break;
      p.k = k; p.age = 0; p.mode = mode; p.i = made; p.n = n; p.x = x; p.y = y; p.z = z; p.size = size;
      p.tok = tok || SPARKLE_TOKENS[(made + (tt.seed & 3)) % SPARKLE_TOKENS.length];
      p.cell = made % 2 ? 3 : 0;   /* K.ATLAS: star, sparkle */
      made++;
    }
    tt.dirty = true;
    return made;
  }
  function burst(tt, n) {
    tt.seed = (tt.seed + 0x9E3779B1) >>> 0;
    spawn(tt, 1, n, 0, TT.riserH + (tt.top - TT.riserH) * 0.55, 0, 1, null);
  }
  var _sp = {}, _gl = {};
  function stepParts(tt, dt) {
    var ps = tt.parts, live = false, pool = tt.pool;
    for (var i = 0; i < ps.length; i++) {
      var p = ps[i];
      if (p.k < 0) continue;
      p.age += dt;
      if (p.mode === 1) {
        sparkleAt(p.age, p.i, p.n, tt.seed, tt.reduced, _sp);
        if (!_sp.alive) { pool.free(p.k); p.k = -1; continue; }
        pool.set(p.k, p.x + _sp.x, p.y + _sp.y, p.z + _sp.z, _sp.size * 1.6, p.tok, _sp.alpha, p.cell, _sp.rot);
      } else {
        glintAt(p.age, 0.6, _gl);
        if (!_gl.alive) { pool.free(p.k); p.k = -1; continue; }
        pool.set(p.k, p.x, p.y + _gl.dy, p.z, p.size, p.tok, _gl.alpha, 0, p.age);
      }
      live = true;
    }
    pool.commit();
    return live;
  }
  /* a model's a.emit(kind, anchor | localPos, n, {token, size}) → glints in world space */
  function emitFromModel(tt, a, at, n, o) {
    if (!tt.sc || !a || !a.object) return;
    var R = res, v = R.v, obj = a.object, ud = obj.userData || {};
    try {
      if (typeof at === 'string' && ud.anchors && ud.anchors[at]) ud.anchors[at].getWorldPosition(v);
      else if (at && at.isVector3) v.copy(at).applyMatrix4(obj.matrixWorld);
      else if (Array.isArray(at)) v.set(at[0] || 0, at[1] || 0, at[2] || 0).applyMatrix4(obj.matrixWorld);
      else return;
    } catch (e) { return; }
    var size = ((o && o.size) || 0.18) * tt.scale * 1.4;
    spawn(tt, 2, Math.min(4, Math.max(1, n | 0)), v.x, v.y, v.z, size, (o && o.token) || 'Gold Light');
  }
  /* ---- host DOM ---- */
  function measure(tt) {
    var cw = tt.host.clientWidth, ch = tt.host.clientHeight;
    var sz = sizeFor(cw, ch, root.devicePixelRatio || 1, BUF);
    tt.sizeDirty = false;
    if (!sz) { tt.w = tt.h = 0; return false; }
    if (sz.w !== tt.w || sz.h !== tt.h) {
      tt.w = sz.w; tt.h = sz.h;
      if (tt.canvas) { tt.canvas.width = tt.w; tt.canvas.height = tt.h; }
      if (tt.sc) frameTT(tt);
      tt.dirty = true;
    }
    return true;
  }
  function makeCanvas(tt) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, tt.w); c.height = Math.max(1, tt.h);
    c.setAttribute('aria-hidden', 'true');
    c.setAttribute('data-pc-turntable', '');
    c.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;display:block;opacity:0;touch-action:pan-y;cursor:grab;' +
      'transition:opacity ' + (tt.reduced ? 120 : 300) + 'ms ease;';
    c.addEventListener('pointerdown', function (e) {
      if (tt.dead || tt.drag) return;
      tt.drag = { id: e.pointerId, x: e.clientX, a0: tt.dragAngle };
      try { c.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ }
      c.style.cursor = 'grabbing';
      wake();
    });
    c.addEventListener('pointermove', function (e) {
      if (!tt.drag || e.pointerId !== tt.drag.id) return;
      tt.dragAngle = tt.drag.a0 + (e.clientX - tt.drag.x) * TT.dragDegPerPx;
      tt.dirty = true;
      wake();
    });
    function up(e) {
      if (!tt.drag || (e && e.pointerId !== tt.drag.id)) return;
      tt.drag = null; tt.resumeAt = tt.t + TT.resumeAfter;
      c.style.cursor = 'grab';
      wake();
    }
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('lostpointercapture', up);
    tt.canvas = c; tt.ctx = c.getContext('2d');
    tt.stopFn.canvas = c;
    return c;
  }
  function observe(tt) {
    if (typeof root.ResizeObserver === 'function') {
      tt.ro = new root.ResizeObserver(function () { tt.sizeDirty = true; wake(); });
      tt.ro.observe(tt.host);
    }
    if (typeof root.IntersectionObserver === 'function') {
      tt.io = new root.IntersectionObserver(function (es) {
        var e = es[es.length - 1];
        tt.offscreen = !e.isIntersecting;
        if (!tt.offscreen) { tt.dirty = true; wake(); }
      });
      tt.io.observe(tt.host);
    }
  }
  /* first frame drawn: lay the canvas over host and crossfade its SVG out */
  function reveal(tt) {
    var host = tt.host, c = tt.canvas;
    try {
      if (root.getComputedStyle(host).position === 'static') { tt.hostPos = host.style.position || ''; host.style.position = 'relative'; }
    } catch (e) { /* ignore */ }
    var ms = tt.reduced ? 120 : 300;
    for (var el = host.firstElementChild; el; el = el.nextElementSibling) {
      if (el === c) continue;
      tt.saved.push({ el: el, vis: el.style.visibility, op: el.style.opacity, tr: el.style.transition });
      el.style.transition = 'opacity ' + ms + 'ms ease';
    }
    host.appendChild(c);
    void c.offsetWidth;                                   /* commit opacity 0 before fading */
    c.style.opacity = '1';
    tt.saved.forEach(function (s) { s.el.style.opacity = '0'; });
    setTimeout(function () { if (!tt.dead) tt.saved.forEach(function (s) { s.el.style.visibility = 'hidden'; }); }, ms + 40);
    tt.shown = true;
    if (tt._ready) { tt._ready(true); tt._ready = null; }
    if (typeof tt.opts.onReady === 'function') { try { tt.opts.onReady(); } catch (e) { /* ignore */ } }
  }
  /* ---- one frame: advance, animate, render, copy; → wants more frames ---- */
  function stepTT(tt, now) {
    if (tt.dead) return false;
    if (!tt.host.isConnected || (tt.shown && !tt.canvas.isConnected)) { kill(tt, null); return false; }
    if (!S) return false;
    if (tt.sizeDirty) measure(tt);
    if (tt.w < 2 || tt.h < 2) return false;
    if (!tt.sc) {
      try { if (!buildTT(tt)) { kill(tt, 'no model'); return false; } }
      catch (e) { kill(tt, 'build: ' + errText(e)); return false; }
      if (!tt.canvas) makeCanvas(tt);
      observe(tt);
      if (tt.debutT >= 0) tt.burst = true;
    }
    if (tt.next) {
      var nx = tt.next;
      tt.next = null;
      try {
        if (swapItem(tt, nx)) {
          if (tt.debutT < 0) { tt.squishT = 0; burst(tt, tt.reduced ? 8 : 10); }
        }
      } catch (e) { log('turntable swap: ' + errText(e)); }
    }
    if (tt.offscreen && tt.shown) return false;
    var due = !tt.shown || tt.dirty || (tt.anim && (tt.lastDraw < 0 || now - tt.lastDraw >= TT.frameMs));
    if (!due) return tt.anim;
    var dt = tt.lastNow < 0 ? 1 / 30 : Math.min(0.1, Math.max(0, (now - tt.lastNow) / 1000));
    tt.lastNow = now;
    tt.t += dt;
    var anim = animateTT(tt, dt);
    if (!drawTT(tt)) return anim;
    tt.lastDraw = now; tt.dirty = false; tt.anim = anim;
    return anim;
  }
  function animateTT(tt, dt) {
    var anim = false, red = tt.reduced, b = tt.built;
    if (tt.burst) { tt.burst = false; burst(tt, red ? 12 : 16); }
    /* the turn: auto (paused while dragging and briefly after), plus the drag and the debut spin */
    if (!red && !tt.drag && tt.t >= tt.resumeAt) tt.spinT += dt;
    var deg = turntableAngle(tt.spinT, red ? MO_RED : MO_FULL) + tt.dragAngle, sMul = 1;
    if (!red && !tt.drag) anim = true;
    if (tt.drag) anim = true;
    if (tt.debutT >= 0) {
      debutPose(tt.debutT, red, tt.pose);
      deg += tt.pose.deg || 0; sMul *= tt.pose.s == null ? 1 : tt.pose.s;
      tt.debutT += dt;
      if (tt.debutT > (red ? 0.3 : 1.2)) tt.debutT = -1;
      anim = true;
    }
    var sy = 1, sxz = 1;
    if (tt.squishT >= 0) {
      var M = root.SLMotion;
      if (M && typeof M.sample === 'function' && !red) {
        try { M.sample('squish', tt.squishT, tt.squish, MO_FULL); sy = tt.squish.sy || 1; sxz = tt.squish.sxz || 1; } catch (e) { /* ignore */ }
      }
      tt.squishT += dt;
      if (red || tt.squishT > 0.25) tt.squishT = -1;
      anim = true;
    }
    tt.spinG.rotation.y = deg * DEG;
    tt.fitG.scale.set(tt.scale * sMul * sxz, tt.scale * sMul * sy, tt.scale * sMul * sxz);
    /* the item's own life */
    if (b) {
      if (b.rig) {
        if (!red) { try { b.rig.play('idle', tt.t, tt.rigOpts); anim = true; } catch (e) { /* keep the last pose */ } }
      } else if (b.handle && b.model && typeof b.model.idle === 'function' && b.idleOk && !red) {
        b.handle.tick(tt.t, dt);
        try { if (b.model.idle(b.handle) !== false) anim = true; } catch (e) { b.idleOk = false; log('idle ' + b.handle.id + ': ' + errText(e)); }
      }
    }
    /* crossing spot cones from the upper left and right, aimed past the item */
    var R = res;
    for (var i = 0; i < 2; i++) {
      var side = i ? 1 : -1, cone = tt.cones[i];
      cone.position.set(1.9 * side, 3.4, -0.6);
      R.v.set(-0.24 * side + beamSway(tt.t, i, red), TT.riserH + 0.05, 0.12).sub(cone.position);
      var len = R.v.length() * 1.12;                     /* reach a little past the riser top */
      cone.quaternion.setFromUnitVectors(R.down, R.v.normalize());
      cone.scale.set(0.46, len, 0.46);
    }
    if (stepParts(tt, dt)) anim = true;
    if (tt.flyT >= 0) {
      if (red) tt.flyT = -1;
      else { tt.flyT += dt; if (tt.flyT >= TT.flyDur) tt.flyT = -1; anim = true; }
    }
    placeCam(tt);
    return anim;
  }
  function drawTT(tt) {
    var g = ensureGpu();
    if (!g) return false;
    var R = res;
    holdStudio(R, memberHex());                            /* a live view follows the current child */
    try { g.r.setViewport(0, 0, tt.w, tt.h); g.r.render(tt.sc, tt.cam); } finally { releaseStudio(R); }
    if (gpuLost()) return false;
    var ctx = tt.ctx;
    ctx.clearRect(0, 0, tt.w, tt.h);
    ctx.drawImage(g.canvas, 0, BUF - tt.h, tt.w, tt.h, 0, 0, tt.w, tt.h);
    stats.frames++;
    if (!tt.shown) reveal(tt);
    return true;
  }

  /* ================================================================
     THE SCHEDULER — one rAF loop for turntable frames and queued icons
     ================================================================ */
  function wake() {
    if (idleId) { clearTimeout(idleId); idleId = 0; }
    if (slowId) { clearTimeout(slowId); slowId = 0; }
    if (!rafId) rafId = raf(tick);
  }
  function tick() {
    rafId = 0;
    var now = perf(), t0 = now, more = false, i;
    if (document.hidden) { scheduleQuiet(); return; }
    liveBuf.length = 0;                                   /* a reused list: a stop may edit tts mid-loop */
    for (i = 0; i < tts.length; i++) liveBuf.push(tts[i]);
    for (i = 0; i < liveBuf.length; i++) {
      try { if (stepTT(liveBuf[i], now)) more = true; }
      catch (e) { kill(liveBuf[i], 'frame: ' + errText(e)); }
    }
    liveBuf.length = 0;
    if (tts.length && !S) kickS();
    if (renderQ.length) {
      if (!S) kickS();
      else {
        var budget = tts.length ? 6 : 12, did = 0;
        while (renderQ.length && (!did || perf() - t0 < budget)) {    /* at least one icon per frame */
          var job = renderQ[0], r = renderIcon(job);
          did++;
          if (r === 'wait') { waitCanvas = true; break; }
          if (r === 'retry') { if (++job.tries > 2) finish(job, null); more = true; break; }
          if (r === 'fail') finish(job, null);
          else { renderQ.shift(); job.queued = false; }
        }
        if (renderQ.length && !waitCanvas) more = true;
      }
    }
    if (more) wake();
    else scheduleQuiet();
  }
  /* nothing to draw this frame: watch still turntables slowly, else start the idle clock */
  function scheduleQuiet() {
    if (rafId) return;
    if (tts.length) { if (!slowId) slowId = setTimeout(function () { slowId = 0; wake(); }, 700); return; }
    if (renderQ.length && !waitCanvas && S) { wake(); return; }
    if (idleId || (!gpu && !res)) return;
    idleId = setTimeout(idleDispose, IDLE_MS);
  }
  function idleDispose() {
    idleId = 0;
    if (tts.length || renderQ.length || canvasTotal > freeCanvas.length) { scheduleQuiet(); return; }
    log('idle: renderer disposed');
    dropGpu(true);
    disposeRes();
    releaseCanvases();
  }

  /* ---------------- page lifecycle ---------------- */
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && gpu) gpu.away = true;              /* a later loss of this context is routine */
    if (!document.hidden && (tts.length || renderQ.length)) { tts.forEach(function (t) { t.dirty = true; t.lastNow = -1; }); wake(); }
  });
  root.addEventListener('pagehide', function () {
    /* free the GPU now (bfcache may keep the page); scenes stay for a pageshow */
    dropGpu(true);
    if (!tts.length) { disposeRes(); releaseCanvases(); }
  });
  root.addEventListener('pageshow', function (e) { if (e && e.persisted && (tts.length || renderQ.length)) wake(); });

  /* ================================================================
     PUBLIC API
     ================================================================ */
  function fill(container) {
    if (!container || typeof container.querySelectorAll !== 'function') return Promise.resolve(0);
    if (blocked() === 'slNo3D') return Promise.resolve(0);
    var els = [];
    if (typeof container.matches === 'function' && container.matches('[data-pc]')) els.push(container);
    var list = container.querySelectorAll('[data-pc]');
    for (var i = 0; i < list.length; i++) els.push(list[i]);
    var proms = [];
    els.forEach(function (el) {
      var spec = null;
      try { spec = specOfEl(el); } catch (e) { spec = null; }
      if (!spec) return;
      if (el.getAttribute('data-pc-done') === spec.key && el.querySelector('img[data-pc-img]')) { proms.push(Promise.resolve(true)); return; }
      proms.push(request(spec, el, 0));
    });
    return Promise.all(proms).then(function (r) { return r.filter(Boolean).length; }, function () { return 0; });
  }
  function prewarm(ids, o) {
    o = o || {};
    if (blocked() === 'slNo3D') return Promise.resolve(0);
    if (!Array.isArray(ids)) ids = ids ? [ids] : [];
    return Promise.all(ids.map(function (x) {
      var id = typeof x === 'string' ? x : x && x.id, st = x && typeof x === 'object' && x.st ? x.st : o.st;
      var spec = null;
      try { spec = typeof id === 'string' ? specOf(id, st || null, null) : null; } catch (e) { spec = null; }
      return spec ? request(spec, null, 1) : Promise.resolve(null);
    })).then(function (r) { return r.filter(Boolean).length; }, function () { return 0; });
  }
  function url(id, st) {
    if (blocked() === 'slNo3D') return Promise.resolve(null);
    var spec = null;
    try { spec = specOf(id, st || null, null); } catch (e) { spec = null; }
    return spec ? request(spec, null, 0) : Promise.resolve(null);
  }
  function clear() {
    failQueue();
    jobs.forEach(function (j) { j.resolve(null); });
    jobs.clear();
    mem.clear();
    var C = root.caches;
    storeP = null; storeFor = '';
    if (!C || typeof C.keys !== 'function') return Promise.resolve();
    return C.keys().then(function (names) {
      return Promise.all(names.filter(function (n) { return n.indexOf(CACHE_PREFIX) === 0; }).map(function (n) { return C.delete(n); }));
    }).then(function () {}, function () {});
  }
  function dispose() {
    failTurntables(null);
    failQueue();
    if (idleId) { clearTimeout(idleId); idleId = 0; }
    if (slowId) { clearTimeout(slowId); slowId = 0; }
    dropGpu(true);
    disposeRes();
    releaseCanvases();
  }
  /* the child whose colour lights the studio rim: {color: '#hex'} (anything else → the look's
     member fallback). Icons are keyed by it, so the next fill() picks up that child's set; live
     turntables switch on their next frame. */
  function setUser(u) {
    var c = u && typeof u.color === 'string' ? /^#?([0-9a-f]{6})$/i.exec(u.color.trim()) : null;
    var next = c ? '#' + c[1].toUpperCase() : null;
    if (next !== member) { member = next; tts.forEach(function (t) { t.dirty = true; }); if (tts.length) wake(); }
    return api;
  }
  function info() {
    var out = {
      version: VERSION, look: lookVersion(), ready: !!S, off: off, blocked: blocked(), gpu: !!gpu, res: !!res,
      queue: renderQ.length, jobs: jobs.size, memory: mem.size, turntables: tts.length, contextLosses: lostCount,
      canvases: canvasTotal, member: member, stats: {}
    };
    for (var k in stats) out.stats[k] = stats[k];
    if (gpu) { try { var m = gpu.r.info.memory; out.geometries = m.geometries; out.textures = m.textures; out.programs = gpu.r.info.programs ? gpu.r.info.programs.length : 0; } catch (e) { /* ignore */ } }
    return out;
  }

  api.fill = fill;
  api.turntable = turntable;
  api.prewarm = prewarm;
  api.url = url;
  api.setUser = setUser;
  api.clear = clear;
  api.dispose = dispose;
  api.info = info;
  return api;
}));
