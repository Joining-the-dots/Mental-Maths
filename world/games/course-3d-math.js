/* ================================================================
   Debut Run 3D — the pure maths behind the Three.js view
   (world/games/pet-course-3d.js). No DOM, no THREE: UMD that sets
   window.SLCourse3DMath in the browser (also when the view imports it
   as an ES module for its side effect) and module.exports in Node.

   What lives here (all deterministic, all allocation-free per frame):
     • mapping       logic px → world units (100 px = 1 u, ground y = 0)
     • look table    LOOK3D[variant]: the locked course THEMES plus the 3D
                     extras (deck, water, prop rows, set-pieces, arch pair)
     • light         DAY → SUNSET → SHOWTIME preset mix (showMix, lightAt)
     • camera        follow rig, aspect-aware FOV, decaying shake, cranes
     • juice         a plain-object state machine fed by round.events
                     (hit-stop, shake, kicks, LED blackout, fan reactions)
     • pet visual    which rig clip + overrides for the pet this frame
     • props         wobble / flatten / cushion spring / happy hop
     • LEDs, fans, marquee, cue rings, hat pop, zips, curtains
     • ParticleSim   a fixed-capacity SoA particle pool (no allocation)
   Spec: docs/island3d/spec-runner.json (threeDScene, juiceAndAudio,
   consequences → felt timeline). Nothing here can change the logic.
   ================================================================ */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else if (root) root.SLCourse3DMath = api;
}(typeof self !== 'undefined' ? self : typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var VERSION = 1;
  var PI = Math.PI, TAU = PI * 2, DEG = PI / 180;

  /* ---------------- logic constants mirrored from pet-course.js (TUNING) ---------------- */
  var PX = 100, GROUND = 452, PET_CX = 235, BPM = 128, BEAT = 60 / BPM;

  /* ---------------- view tuning (spec numbers) ---------------- */
  var VIEW = {
    HITSTOP: 0.08,              /* visual-only hold on a bump (the logic keeps running) */
    SHAKE_AMP: 0.06, SHAKE_DUR: 0.18,
    BOING_KICK: 0.15, BOING_HOLD: 0.05, KICK_DUR: 0.28,
    LED_DARK: 0.8, OOH: 0.6, EXCITE: 0.35,
    TIER_CHASE: 0.4, CLEAR_SWEEP: 0.4,
    DOOR_CONES: 0.5, CONE_OFF_STEP: 0.1,
    FLIP_TUMBLE: 0.45, FLIP_DJ: 0.35, TWIRL: 0.45, SLIP_SPIN: 0.5, DIVE_SPIN: 0.3,
    DIZZY_END: 1.4, HAT_LAND: 0.5, HAT_SETTLE: 0.12,
    SQUASH_TO: 0.06, STRETCH_TO: 0.18, LAND_SQ: 0.08, LAND_BACK: 0.18,
    PROP_WOBBLE: 12 * DEG, PROP_FLAT: 0.35, PROP_FLAT_T: 0.3, HOP: 0.05, HOP_T: 0.25,
    CUSHION_SQ: 0.4, CUSHION_T: 0.4, CUSHION_TWINKLE: 1.2,
    ZIP: 0.35, LETTER_ZIP: 0.5,
    CURTAIN_T: 1.0, CURTAIN_COVER: 0.42
  };
  var CAM = {
    dx: 2.2, y: 1.7, ky: 0.35, lookY: 0.9, z: 7.5, fov: 40, fovMax: 60, lane: 9.6,
    smooth: 6, feverFov: 3, feverT: 0.3, encoreFov: 44, near: 0.1, far: 120,
    finish: { dx: 0.8, y: 1.3, z: 3.2, lookY: 0.45, dur: 1.2 },
    curtain: { z: 4.5, dur: 0.8 },
    menu: { dx: 1.7, y: 1.7, z: 6.8, lookY: 0.95, orbitDeg: 10, period: 16, arch: 3.7 }
  };
  var LED = { spacing: 0.5, perRow: 24, z: 1.25, behind: 3.0, hue: 47, chaseHz: 2 };

  /* ---------------- palette (art bible hexes the view uses directly) ---------------- */
  var COL = {
    INK: '#3B2F4A', INK_DEEP: '#2B2140', WHITE: '#FFFFFF',
    NEON_PINK: '#FF4FB8', NEON_CYAN: '#3DF2FF', NEON_VIOLET: '#A66BFF', STAR_GOLD: '#FFD23F',
    BUBBLEGUM: '#FF8FC8', PRIMARY_PINK: '#FF5FA2', GLOW_STAR: '#FFE36B', PEARL: '#F6F1FF',
    LED_OFF: '#FFF3B3', LED_DARK: '#5B5470', STAGE_NIGHT: '#130C2E', BOARD: '#1A1240',
    HOLO: ['#FFB3E6', '#B3E5FF', '#C9FFE5', '#FFF3B3'], MINT: '#C9FFE5', CHROME: '#DDE3F0',
    CAPE_RED: '#E94B4B', CURTAIN: ['#FFB3E6', '#E8A6FF'], MEMBER_FALLBACK: '#FF8FC8',
    SKY_DAY_HOR: '#FFE3F1', SKY_NIGHT_TOP: '#1A1240', SKY_NIGHT_MID: '#3B1E6E', SKY_NIGHT_HOR: '#FF7AC8',
    RIM_SHOW: '#FF7AD9'
  };

  /* ================================================================
     SMALL MATHS
     ================================================================ */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function lerp(a, b, k) { return a + (b - a) * k; }
  function frac(v) { return v - Math.floor(v); }
  function arc(u) { u = clamp01(u); return 4 * u * (1 - u); }
  function inOutSine(u) { u = clamp01(u); return -(Math.cos(PI * u) - 1) / 2; }
  function outQuad(u) { u = clamp01(u); return 1 - (1 - u) * (1 - u); }
  function inQuad(u) { u = clamp01(u); return u * u; }
  function outBack(u) { u = clamp01(u); var c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2); }
  function outElastic(u) {
    u = clamp01(u);
    if (u === 0 || u === 1) return u;
    return Math.pow(2, -10 * u) * Math.sin((u * 10 - 0.75) * (TAU / 3)) + 1;
  }
  /* frame-rate independent exponential approach factor (1 - e^(-rate·dt)) */
  function smoothK(dt, rate) { return 1 - Math.exp(-Math.max(0, rate) * Math.max(0, dt)); }
  function approach(cur, target, dt, rate) { return cur + (target - cur) * smoothK(dt, rate); }
  /* FNV-1a 32 (same family as SLMotion / SLCourse.seedFor) */
  function hash(str) {
    str = String(str);
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h >>> 0;
  }
  /* integer → [0, 1) without allocation (for per-slot looks: trees, fans, puffs) */
  function hash01(n, salt) {
    var h = ((n | 0) ^ Math.imul((salt | 0) + 0x9E3779B1, 0x85EBCA6B)) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x7FEB352D) >>> 0;
    h = Math.imul(h ^ (h >>> 15), 0x846CA68B) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function xorshift(seed) {
    var s = (seed >>> 0) || 1;
    return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  }

  /* ---------------- colours (ints 0xRRGGBB; mixed in sRGB like the 2D art) ---------------- */
  function hexInt(h) {
    if (typeof h === 'number') return h & 0xFFFFFF;
    var m = /^#?([0-9a-f]{6})$/i.exec(String(h || '').trim());
    return m ? parseInt(m[1], 16) : 0xCFC8DC;
  }
  function intHex(n) { var s = (n & 0xFFFFFF).toString(16).toUpperCase(); while (s.length < 6) s = '0' + s; return '#' + s; }
  function isHex(h) { return typeof h === 'string' && /^#[0-9a-f]{6}$/i.test(h); }
  function mixInt(a, b, k) {
    k = clamp01(k);
    var ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
    var br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
    return (Math.round(ar + (br - ar) * k) << 16) | (Math.round(ag + (bg - ag) * k) << 8) | Math.round(ab + (bb - ab) * k);
  }
  function scaleInt(a, s) {
    var r = clamp(Math.round(((a >> 16) & 255) * s), 0, 255), g = clamp(Math.round(((a >> 8) & 255) * s), 0, 255), b = clamp(Math.round((a & 255) * s), 0, 255);
    return (r << 16) | (g << 8) | b;
  }
  /* h in degrees, s/l 0..1 */
  function hslInt(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360;
    function f(p, q, t) { if (t < 0) t += 1; if (t > 1) t -= 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; }
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    return (Math.round(f(p, q, h + 1 / 3) * 255) << 16) | (Math.round(f(p, q, h) * 255) << 8) | Math.round(f(p, q, h - 1 / 3) * 255);
  }
  function safeMember(hex) { return isHex(hex) ? hex.toUpperCase() : COL.MEMBER_FALLBACK; }

  /* ================================================================
     MAPPING (logic px → world u)
     ================================================================ */
  function worldX(px) { return px / PX; }
  function worldY(ly) { return (GROUND - ly) / PX; }          /* a logic y (down-positive) → height above the runway */
  function petX(dist) { return (dist + PET_CX) / PX; }        /* the hitbox centre */
  function feetH(y) { return y < 0 ? -y / PX : 0; }           /* state.y ≤ 0 is up */
  function obsCentreX(o) { return (o.x + o.w / 2) / PX; }
  /* per-kind 3D sizes, modelled at exactly the logic sizes (/100) */
  function kindSizes(K) {
    K = K || {};
    function g(k, f, d) { return K[k] && typeof K[k][f] === 'number' ? K[k][f] : d; }
    return {
      low: { w: g('low', 'w', 30) / PX, h: g('low', 'h', 58) / PX },
      log: { w: g('log', 'w', 88) / PX, h: g('log', 'h', 44) / PX, r: g('log', 'h', 44) / PX / 2 },
      hedge: { w: g('hedge', 'w', 68) / PX, h: g('hedge', 'h', 78) / PX },
      stack: { w: g('stack', 'w', 56) / PX, h: g('stack', 'h', 116) / PX, cushion: g('stack', 'cushion', 116) / PX, cushionH: 0.18 },
      puddle: { w: g('puddle', 'w', 108) / PX, d: 0.5 },
      bar: { w: g('bar', 'w', 52) / PX, under: g('bar', 'gap', 40) / PX, board: g('bar', 'board', 60) / PX, post: 2.2, postZ: 0.85 },
      lane: 0.45
    };
  }

  /* ================================================================
     LOOK TABLE — locked course THEMES (pet-course.js) + 3D extras
     ================================================================ */
  var THEMES_LOCKED = {     /* copied from pet-course.js THEMES (locked; tests compare against the logic) */
    course_meadow: { sky: ['#8fd8ff', '#d9f6ff'], hill: '#9fdc8a', hill2: '#7cc96e', ground: '#7ad06a', soil: '#c9925a', treat: 'bone',
      obs: { low: ['#ffffff', '#ff6b6b'], log: ['#a8743f', '#7a4f26'], hedge: ['#4caf50', '#2f8a3a'], stack: ['#e9b46a', '#b67f37'], puddle: '#6cc4ff' } },
    course_beach: { sky: ['#7fd0ff', '#fff3d6'], hill: '#4fc3f7', hill2: '#2fa3e0', ground: '#f3dc9a', soil: '#e2c27a', treat: 'fish',
      obs: { low: ['#ff6b4a', '#c43f2a'], log: ['#c9a06a', '#8d6a3d'], hedge: ['#f2cd7c', '#c99a4d'], stack: ['#ff8a5c', '#d0603a'], puddle: '#4fc3f7' } },
    course_snow: { sky: ['#a8c8ff', '#eef6ff'], hill: '#ffffff', hill2: '#dfeeff', ground: '#f4f9ff', soil: '#c9d9ee', treat: 'bone',
      obs: { low: ['#ff6b6b', '#c94a4a'], log: ['#6b8fd8', '#4a6fb8'], hedge: ['#ffffff', '#cdd9ea'], stack: ['#9fd0ff', '#6aa8e0'], puddle: '#bfe8ff' } },
    course_candy: { sky: ['#ffc6e5', '#fff0f8'], hill: '#ffb3d6', hill2: '#ff8fc4', ground: '#c38bff', soil: '#9b62e0', treat: 'sweet',
      obs: { low: ['#ffffff', '#ff5c8a'], log: ['#8a5a2b', '#6a3f1a'], hedge: ['#ff8fb8', '#e8679a'], stack: ['#ffd23f', '#e8b020'], puddle: '#a0522d' } }
  };
  /* the 3D-only extras per course (palette / world-art hexes only) */
  var EXTRAS = {
    course_meadow: {
      arch: ['#7bd88f', '#ffd23f'], apron: '#7cc96e', deck: ['#D69D64', '#C98F58'], water: '#6cc4ff', waterDeep: '#2F8FD8',
      props: ['oak', 'blossom'], hedge: 'leafy', stack: 'hay', friend: 'frog', dress: 'flower', bridgeName: 'plank bridge',
      fever: { name: 'petal storm', cells: ['petal'], colors: ['#FFB3E6', '#FFFFFF', '#FF8FC8'] }, flavour: 'marimba'
    },
    course_beach: {
      arch: ['#f3dc9a', '#4fc3f7'], apron: '#E8C77E', deck: ['#D69D64', '#C98F58'], water: '#4fc3f7', waterDeep: '#2F8FD8',
      props: ['palm', 'hut'], hedge: 'castle', stack: 'rings', friend: 'dolphin', dress: 'shell', bridgeName: 'boardwalk',
      fever: { name: 'splash confetti', cells: ['dot', 'rect'], colors: ['#4FC3F7', '#FFFFFF', '#FF8A5C'] }, flavour: 'steel'
    },
    course_snow: {
      arch: ['#e8f4ff', '#7fb3ff'], apron: '#dfeeff', deck: ['#CDEBFF', '#B3E5FF'], water: '#bfe8ff', waterDeep: '#7fb3ff',
      props: ['pine', 'snowman'], hedge: 'bank', stack: 'snowblock', friend: 'icicles', dress: 'snowball', bridgeName: 'ice bridge',
      fever: { name: 'glitter', cells: ['snow', 'sparkle'], colors: ['#FFFFFF', '#B3E5FF', '#C9FFE5'] }, flavour: 'sleigh'
    },
    course_candy: {
      arch: ['#ffb6d5', '#c38bff'], apron: '#ff8fc4', deck: ['#F2CD7C', '#C99A4D'], water: '#a0522d', waterDeep: '#6a3f1a',
      props: ['lollipop', 'cupcake'], hedge: 'frosting', stack: 'cupcake', friend: 'gumdrops', dress: 'gumdrop', bridgeName: 'wafer bridge',
      fever: { name: 'sprinkle rain', cells: ['rect'], colors: ['#FF5C8A', '#FFD23F', '#C38BFF', '#4FC3F7'] }, flavour: 'musicbox'
    }
  };
  var TREATS = { bone: { color: '#FFF6E0', icon: '🦴' }, fish: { color: '#FF8A5C', icon: '🐟' }, sweet: { color: '#FF5C8A', icon: '🍬' } };
  var VARIANTS = ['course_meadow', 'course_beach', 'course_snow', 'course_candy'];
  /* one merged look for a variant; themes = the logic's THEMES when available (the locked source of truth) */
  function look3d(variant, themes) {
    var v = EXTRAS[variant] ? variant : 'course_meadow';
    var th = (themes && themes[v]) || THEMES_LOCKED[v], ex = EXTRAS[v];
    return {
      variant: v, sky: th.sky, hill: th.hill, hill2: th.hill2, ground: th.ground, soil: th.soil, treat: th.treat,
      treatColor: (TREATS[th.treat] || TREATS.bone).color, obs: th.obs,
      arch: ex.arch, apron: ex.apron, deck: ex.deck, water: ex.water, waterDeep: ex.waterDeep, props: ex.props,
      hedge: ex.hedge, stack: ex.stack, friend: ex.friend, dress: ex.dress, fever: ex.fever, flavour: ex.flavour, bridgeName: ex.bridgeName
    };
  }

  /* ================================================================
     LIGHT: DAY → SUNSET (end of the Pre-Chorus) → SHOWTIME (from the Chorus door)
     ================================================================ */
  /* 0 by day, 0.5 by the end of the Pre-Chorus (sunset), then 1 over 1.6 s inOutSine
     from the Chorus door (0.25 s under reduced motion). t2/t3 = Pre-Chorus/Chorus starts. */
  function showMix(sched, t2, t3, reduced) {
    if (!(sched >= t2)) return 0;
    if (sched < t3) return 0.5 * (sched - t2) / (t3 - t2);
    return 0.5 + 0.5 * inOutSine((sched - t3) / (reduced ? 0.25 : 1.6));
  }
  var SUNSET = {
    skyTop: '#8A7BE8', skyMid: '#FFB38A', skyHor: '#FF9EC8', fog: '#FFC2B0',
    hemiSky: '#FFD6C2', hemiGround: '#FFB8D0', hemiI: 1.55, sun: '#FFC48A', sunI: 1.9, exposure: 1.04,
    rim: '#FFD6E8', rimI: 0.4, disc: '#FF9E6B'
  };
  /* the three keyed presets for one look + member colour (cached: no allocation per frame) */
  var PRESET_KEYS = ['skyTop', 'skyMid', 'skyHor', 'fog', 'hemiSky', 'hemiGround', 'sun', 'rim', 'disc'];
  var NUM_KEYS = ['hemiI', 'sunI', 'exposure', 'rimI'];
  var presetCache = { lk: null, member: null, day: {}, sunset: {}, night: {} };
  function presetsFor(lk, member) {
    if (presetCache.lk === lk && presetCache.member === member) return presetCache;   /* identity check: no per-frame strings */
    var sky0 = hexInt(lk.sky[0]), sky1 = hexInt(lk.sky[1]), dayHor = hexInt(COL.SKY_DAY_HOR);
    var d = presetCache.day, s = presetCache.sunset, n = presetCache.night;
    d.skyTop = sky0; d.skyMid = sky1; d.skyHor = dayHor; d.fog = mixInt(sky1, dayHor, 0.5); d.hemiSky = 0xDDF1FF; d.hemiGround = 0xFFE0EC;
    d.sun = 0xFFF3E0; d.rim = 0xFFFFFF; d.disc = 0xFFF096; d.hemiI = 1.9; d.sunI = 2.4; d.exposure = 1.0; d.rimI = 0.28;
    PRESET_KEYS.forEach(function (k) { s[k] = hexInt(SUNSET[k]); });
    NUM_KEYS.forEach(function (k) { s[k] = SUNSET[k]; });
    n.skyTop = hexInt(COL.SKY_NIGHT_TOP); n.skyMid = hexInt(COL.SKY_NIGHT_MID);
    n.skyHor = mixInt(hexInt(COL.SKY_NIGHT_HOR), sky1, 0.4);                  /* theme horizon tint kept at 40 % */
    n.fog = hexInt(COL.SKY_NIGHT_MID); n.hemiSky = 0x6B5BD6; n.hemiGround = 0x2A1840; n.sun = 0xB9C6FF;
    n.rim = mixInt(hexInt(COL.RIM_SHOW), hexInt(safeMember(member)), 0.4); n.disc = 0xFF9E6B;
    n.hemiI = 0.85; n.sunI = 0.9; n.exposure = 1.08; n.rimI = 0.55;
    presetCache.lk = lk; presetCache.member = member;
    return presetCache;
  }
  /* the preset for mix k (0..1) into `out` (colours as ints) */
  function lightAt(k, lk, member, out) {
    out = out || {};
    k = clamp01(k);
    var P = presetsFor(lk, member), a, b, u, i;
    if (k <= 0.5) { a = P.day; b = P.sunset; u = k / 0.5; } else { a = P.sunset; b = P.night; u = (k - 0.5) / 0.5; }
    for (i = 0; i < PRESET_KEYS.length; i++) out[PRESET_KEYS[i]] = mixInt(a[PRESET_KEYS[i]], b[PRESET_KEYS[i]], u);
    for (i = 0; i < NUM_KEYS.length; i++) out[NUM_KEYS[i]] = lerp(a[NUM_KEYS[i]], b[NUM_KEYS[i]], u);
    out.discA = clamp01(1 - k / 0.75);                       /* the sun sets by k 0.75 */
    out.discY = lerp(7.5, 1.2, clamp01(k / 0.75));
    out.stars = clamp01((k - 0.5) * 2);
    out.cones = clamp01((k - 0.55) / 0.45);
    out.fans = clamp01((k - 0.5) * 2.5);
    out.clouds = clamp01(1 - (k - 0.3) / 0.45);
    out.neon = k;                                           /* neon sleeves / gate glow follow the show */
    return out;
  }

  /* ================================================================
     CAMERA
     ================================================================ */
  /* vertical FOV so `lane` u of runway stay visible across at distance `dist`
     (raised for aspects narrower than 16:9, never below base, at most max) */
  function fovFor(aspect, base, max, lane, dist) {
    base = base || CAM.fov; max = max || CAM.fovMax; lane = lane || CAM.lane; dist = dist || CAM.z;
    aspect = aspect > 0.05 ? aspect : 16 / 9;
    var need = 2 * Math.atan(lane / (2 * dist * aspect)) / DEG;
    return clamp(Math.max(base, need), base, max);
  }
  /* the follow rig: position + look-at for pet x and smoothed height h (yaw/roll always 0) */
  function followCam(px, h, out) {
    out = out || {};
    out.x = px + CAM.dx; out.y = CAM.y + CAM.ky * h; out.z = CAM.z;
    out.tx = px + CAM.dx; out.ty = CAM.lookY + CAM.ky * h; out.tz = 0;
    return out;
  }
  /* a decaying screen shake (never above amp): `since` seconds after the kick */
  function shakeAt(since, amp, dur, out) {
    out = out || {};
    if (!(since >= 0) || since >= dur || amp <= 0) { out.x = 0; out.y = 0; return out; }
    var k = 1 - since / dur; k *= k;
    out.x = amp * k * Math.sin(since * 97 + 0.4);
    out.y = amp * k * Math.sin(since * 131 + 1.3) * 0.8;
    return out;
  }
  /* camera kick (BOING): +amp up, eased back down over dur */
  function kickAt(since, amp, dur) {
    if (!(since >= 0) || since >= dur || amp <= 0) return 0;
    var k = since / dur;
    return amp * (k < 0.25 ? outQuad(k / 0.25) : 1 - inOutSine((k - 0.25) / 0.75));
  }
  /* 0..1 progress of a timed camera move (static cut under reduced motion) */
  function moveK(since, dur, reduced) { if (reduced) return since >= 0 ? 1 : 0; return inOutSine(since / dur); }
  /* the menu stage-cam: a slow ±5° (10° total) orbit of the pet on the start line */
  function menuOrbit(t, reduced) { return reduced ? 0 : (CAM.menu.orbitDeg / 2) * Math.sin(TAU * t / CAM.menu.period) * DEG; }

  /* ================================================================
     JUICE — the view's own reaction state, driven ONLY by round.events
     (plain object, so the 3D view and tests share one implementation)
     ================================================================ */
  var SINCE_KEYS = ['sinceTakeoff', 'sinceLand', 'sinceDJ', 'sinceBoing', 'sinceBump', 'sinceSplash', 'sincePerfect', 'sinceGreat',
    'sinceDoor', 'sinceFever', 'sinceFeverEnd', 'sinceTier', 'sinceClear', 'sinceHeal', 'sinceClean', 'sinceShieldGet', 'sinceShieldPop',
    'sinceLetter', 'sinceLetters', 'sinceStar', 'sinceFinish', 'sinceEncore', 'sinceEncoreEnd', 'sinceCurtain', 'sinceHat',
    'sinceSlide', 'sinceDive', 'sinceShake', 'sinceKick', 'sinceDJRing', 'sinceLastHeart'];
  function newJuice() {
    var j = { hold: 0, shakeAmp: 0, ledDark: 0, ooh: 0, excite: 0, kickAmp: 0, landHard: false,
      bumpRehearsal: false, bumpKind: '', doorSec: -1, tierFrom: 1, tierTo: 1, feverWas: false, feverByBump: false,
      hatOff: false, finishMedal: 0, events: 0 };
    for (var i = 0; i < SINCE_KEYS.length; i++) j[SINCE_KEYS[i]] = 99;
    return j;
  }
  function resetJuice(j) {
    var f = newJuice();
    for (var k in f) if (Object.prototype.hasOwnProperty.call(f, k)) j[k] = f[k];
    return j;
  }
  /* one event (o = {reduced, fever (before the event), mult, hasHat}) */
  function juiceEvent(j, e, o) {
    o = o || {};
    var red = !!o.reduced;
    j.events++;
    switch (e && e.type) {
      case 'takeoff':
        j.sinceTakeoff = 0;
        if (e.grade === 3) { j.sincePerfect = 0; j.excite = VIEW.EXCITE; } else if (e.grade === 2) j.sinceGreat = 0;
        break;
      case 'dj': j.sinceDJ = 0; j.sinceDJRing = 0; break;
      case 'land': j.sinceLand = 0; j.landHard = !!e.hard; break;
      case 'slide': j.sinceSlide = 0; break;
      case 'dive': j.sinceDive = 0; break;
      case 'boing':
        j.sinceBoing = 0; j.excite = VIEW.EXCITE;
        j.hold = Math.max(j.hold, VIEW.BOING_HOLD);
        if (!red) { j.sinceKick = 0; j.kickAmp = VIEW.BOING_KICK; }
        break;
      case 'clear': j.sinceClear = 0; break;
      case 'bump':
        j.sinceBump = 0; j.bumpRehearsal = !!e.rehearsal; j.bumpKind = e.kind || '';
        j.hold = Math.max(j.hold, VIEW.HITSTOP);                 /* stillness: kept under reduced motion */
        if (!red) { j.sinceShake = 0; j.shakeAmp = VIEW.SHAKE_AMP; }
        if (!e.rehearsal) { j.ledDark = VIEW.LED_DARK; j.ooh = VIEW.OOH; }
        if (o.hasHat && !red) { j.sinceHat = 0; j.hatOff = true; }
        if (o.fever) j.feverByBump = true;
        break;
      case 'splash': j.sinceSplash = 0; if (!e.rehearsal) j.ooh = Math.max(j.ooh, VIEW.OOH * 0.5); break;
      case 'shieldGet': j.sinceShieldGet = 0; break;
      case 'shieldPop': j.sinceShieldPop = 0; break;
      case 'star': j.sinceStar = 0; break;
      case 'letter': j.sinceLetter = 0; break;
      case 'lettersComplete': j.sinceLetters = 0; j.excite = VIEW.EXCITE; break;
      case 'heal': j.sinceHeal = 0; break;
      case 'lastHeart': j.sinceLastHeart = 0; break;
      case 'door': j.sinceDoor = 0; j.doorSec = e.sec | 0; break;
      case 'cleanStage': j.sinceClean = 0; break;
      case 'tier': j.sinceTier = 0; j.tierFrom = j.tierTo; j.tierTo = e.mult | 0; if (e.mult > j.tierFrom) j.excite = VIEW.EXCITE; break;
      case 'fever': j.sinceFever = 0; j.feverByBump = false; j.excite = VIEW.EXCITE; break;
      case 'feverEnd': j.sinceFeverEnd = 0; break;
      case 'finish': j.sinceFinish = 0; j.finishMedal = e.medal | 0; break;
      case 'encoreStart': j.sinceEncore = 0; break;
      case 'encoreEnd': j.sinceEncoreEnd = 0; j.excite = VIEW.EXCITE; break;
      case 'curtain': j.sinceCurtain = 0; break;
    }
    return j;
  }
  function juiceStep(j, dt) {
    if (!(dt > 0)) return j;
    for (var i = 0; i < SINCE_KEYS.length; i++) { var k = SINCE_KEYS[i]; if (j[k] < 99) j[k] = Math.min(99, j[k] + dt); }
    j.hold = Math.max(0, j.hold - dt);
    j.ledDark = Math.max(0, j.ledDark - dt);
    j.ooh = Math.max(0, j.ooh - dt);
    j.excite = Math.max(0, j.excite - dt);
    if (j.hatOff && j.sinceHat >= VIEW.HAT_LAND + VIEW.HAT_SETTLE) j.hatOff = false;
    return j;
  }
  /* the camera's shake + kick offset now */
  function juiceCam(j, reduced, out) {
    out = out || {};
    if (reduced) { out.x = 0; out.y = 0; out.kick = 0; return out; }
    shakeAt(j.sinceShake, j.shakeAmp, VIEW.SHAKE_DUR, out);
    out.kick = kickAt(j.sinceKick, j.kickAmp, VIEW.KICK_DUR);
    return out;
  }

  /* ================================================================
     THE PET — which built-in rig clip to play and what to add on top
     s = round.state (read only), j = juice, o = {reduced, clock, speed (u/s), menu}
     ================================================================ */
  function newVisual() {
    return { clip: 'idle', t: 0, rate: 1, height: 0, speed: 0, intensity: 1, pitch: 0, yaw: 0, roll: 0,
      sx: 1, sy: 1, sz: 1, dy: 0, faceCam: 0, spark: 0, frozen: false, slide: false, trail: false, bow: 0 };
  }
  function petVisual(s, j, o, out) {
    out = out || newVisual();
    var red = !!o.reduced, clock = o.clock || 0, v = Math.max(0, o.speed || 0);
    out.clip = 'run'; out.t = clock; out.rate = 1; out.height = 0; out.speed = v; out.intensity = 1;
    out.pitch = 0; out.yaw = 0; out.roll = 0; out.sx = 1; out.sy = 1; out.sz = 1; out.dy = 0;
    out.faceCam = 0; out.spark = 0; out.frozen = false; out.slide = false; out.trail = false; out.bow = 0;
    if (!s || o.menu) {                                      /* the start line: bounce on every 2nd beat */
      var bt = clock % (2 * BEAT);
      if (red) { out.clip = 'idle'; out.t = 0; }
      else if (bt < 0.45) { out.clip = 'hop'; out.t = bt; out.intensity = 0.8; }
      else { out.clip = 'idle'; out.t = clock; }
      out.speed = 0;
      return out;
    }
    var ph = s.phase;
    if (ph === 'finish' || (ph === 'done' && s.finished)) {
      var e = s.endT || 0;
      if (ph === 'finish' && e < 0.6) { out.clip = 'run'; out.speed = v * (1 - e / 0.6); }
      else { out.clip = 'dance'; out.t = ph === 'done' ? clock : e - 0.6; out.faceCam = red ? 1 : clamp01((e - 0.6) / 0.4); }
      return out;
    }
    if (ph === 'curtain' || (ph === 'done' && s.curtain)) {
      var c = ph === 'done' ? 9 : (s.endT || 0);
      out.speed = 0;
      if (c < 1.0) { out.clip = 'dizzy'; out.t = c; out.spark = 1; out.intensity = 0.8; }
      else { out.clip = 'idle'; out.t = clock; out.bow = red ? 1 : inOutSine((c - 1.0) / 0.4); out.faceCam = out.bow; }
      return out;
    }
    if (ph === 'done') { out.clip = 'idle'; out.t = clock; out.speed = 0; out.faceCam = 0.5; return out; }   /* time's up */
    if (s.eff === 'tumble') {
      var et = s.effT || 0;
      out.speed = 0;
      if (red) { out.clip = 'tumble'; out.t = et; out.spark = et > 0.1 ? 1 : 0; }   /* reduced: squash + dizzy fade */
      else if (et < VIEW.HITSTOP) { out.clip = 'run'; out.frozen = true; }
      else if (!s.onGround || et - VIEW.HITSTOP < VIEW.FLIP_TUMBLE) {
        out.clip = 'tumble'; out.t = (et - VIEW.HITSTOP) * (0.6 / VIEW.FLIP_TUMBLE); out.height = 0;
      } else { out.clip = 'dizzy'; out.t = et; out.spark = et < VIEW.DIZZY_END ? 1 : 0; }
    } else if (!s.onGround) {
      out.clip = s.vy < 0 ? 'jump' : 'fall';
      out.t = s.vy < 0 ? 0.2 + j.sinceTakeoff : clock;      /* skip the clip's own crouch: the view squashes */
      if (!red) {
        if (s.diving) { out.clip = 'jump'; out.t = 0.6; out.pitch = 360 * inOutSine(j.sinceDive / VIEW.DIVE_SPIN); }
        else if (j.sinceBoing < VIEW.TWIRL) out.yaw = 360 * inOutSine(j.sinceBoing / VIEW.TWIRL);
        else if (j.sinceDJ < VIEW.FLIP_DJ) out.pitch = 360 * inOutSine(j.sinceDJ / VIEW.FLIP_DJ);   /* front flip: nose first */
      }
    } else if (s.sliding) { out.clip = 'slide'; out.slide = true; out.trail = true; }
    if (s.eff === 'slip' && !red && (s.effT || 0) < VIEW.SLIP_SPIN) out.yaw += 360 * inOutSine((s.effT || 0) / VIEW.SLIP_SPIN);
    /* squash and stretch (multipliers; xz share one factor) */
    var sxz = 1, sy = 1;
    if (j.sinceBump < VIEW.HITSTOP) { sxz = 0.7; sy = 1.15; }                       /* pressed against the prop */
    else if (!red) {
      if (j.sinceTakeoff < VIEW.SQUASH_TO) { sy = 0.8; sxz = 1.15; }
      else if (j.sinceTakeoff < VIEW.STRETCH_TO) { sy = 1.2; sxz = 0.9; }
      else if (s.onGround && j.sinceLand < VIEW.LAND_SQ) { sy = 0.75; sxz = 1.2; }
      else if (s.onGround && j.sinceLand < VIEW.LAND_SQ + VIEW.LAND_BACK) {
        var u = outBack((j.sinceLand - VIEW.LAND_SQ) / VIEW.LAND_BACK);
        sy = 0.75 + 0.25 * u; sxz = 1.2 - 0.2 * u;
      }
    }
    out.sx = sxz; out.sz = sxz; out.sy = sy;
    return out;
  }

  /* ================================================================
     OBSTACLES — wobble / flatten / cushion spring / happy hop
     ================================================================ */
  function newPropAnim() { return { rot: 0, sy: 1, dy: 0, lift: 0, csy: 1, csxz: 1, twinkle: 0 }; }
  function propAnim(o, sT, clearT, reduced, out) {
    out = out || newPropAnim();
    out.rot = 0; out.sy = 1; out.dy = 0; out.lift = 0; out.csy = 1; out.csxz = 1; out.twinkle = 0;
    if (o.hit && o.kind !== 'puddle') {
      var hk = Math.max(0, sT - o.hitT);
      out.rot = reduced ? 0 : VIEW.PROP_WOBBLE * Math.exp(-6 * hk) * Math.sin(hk * 18);
      if (o.kind === 'bar') out.lift = 0.55 * (reduced ? 1 : outQuad(hk / VIEW.PROP_FLAT_T));   /* the LED board lifts clear */
      else out.sy = reduced ? VIEW.PROP_FLAT : hk < VIEW.PROP_FLAT_T ? 1 - (1 - VIEW.PROP_FLAT) * (hk / VIEW.PROP_FLAT_T) : VIEW.PROP_FLAT;
    }
    if (!reduced && clearT > -90) {
      var ck = sT - clearT;
      if (ck >= 0 && ck < VIEW.HOP_T) out.dy = VIEW.HOP * Math.sin(PI * ck / VIEW.HOP_T);
    }
    if (o.kind === 'stack') {
      if (o.bounced && !reduced) {
        var bk = sT - o.bounceT;
        if (bk >= 0 && bk < VIEW.CUSHION_T) {
          out.csy = 1 - VIEW.CUSHION_SQ * (1 - outElastic(bk / VIEW.CUSHION_T));
          out.csxz = 1 + (1 - out.csy) * 0.4;
        }
      }
      var tw = frac((sT + (o.x % 97) * 0.013) / VIEW.CUSHION_TWINKLE);
      out.twinkle = reduced ? 0.4 : tw < 0.22 ? Math.sin(PI * tw / 0.22) : 0;
    }
    return out;
  }
  /* the dashed rehearsal outline: rectangle (x0, y0, x1, y1) around the prop */
  function rehearsalRect(o, sz, out) {
    out = out || {};
    var x0 = o.x / PX - 0.07, x1 = (o.x + o.w) / PX + 0.07, y0 = -0.01, y1;
    if (o.kind === 'puddle') y1 = 0.14;
    else if (o.kind === 'bar') { y0 = sz.bar.under - 0.06; y1 = sz.bar.under + sz.bar.board + 0.06; }
    else y1 = o.h / PX + 0.06;
    out.x0 = x0; out.x1 = x1; out.y0 = y0; out.y1 = y1;
    return out;
  }
  /* dashes along a rectangle: count, and the i-th dash centre + angle (0 = horizontal) */
  function dashCount(r, step) { step = step || 0.14; return 2 * Math.max(1, Math.floor((r.x1 - r.x0) / step)) + 2 * Math.max(1, Math.floor((r.y1 - r.y0) / step)); }
  function dashAt(r, i, step, out) {
    step = step || 0.14; out = out || {};
    var nx = Math.max(1, Math.floor((r.x1 - r.x0) / step)), ny = Math.max(1, Math.floor((r.y1 - r.y0) / step));
    var sx = (r.x1 - r.x0) / nx, sy = (r.y1 - r.y0) / ny;
    if (i < nx) { out.x = r.x0 + (i + 0.5) * sx; out.y = r.y1; out.a = 0; }
    else if (i < nx + ny) { out.x = r.x1; out.y = r.y1 - (i - nx + 0.5) * sy; out.a = 1; }
    else if (i < 2 * nx + ny) { out.x = r.x1 - (i - nx - ny + 0.5) * sx; out.y = r.y0; out.a = 0; }
    else { out.x = r.x0; out.y = r.y0 + (i - 2 * nx - ny + 0.5) * sy; out.a = 1; }
    return out;
  }

  /* ================================================================
     RUNWAY LEDs — the in-world Hype meter (x1 unlit, x2 cyan, x3 pink, FEVER rainbow chase)
     st = {mult, fever, prevMult, prevFever, sinceTier, sinceClear, dark, t, reduced, petX}
     ================================================================ */
  var LED_INTS = { off: hexInt(COL.LED_OFF), dark: hexInt(COL.LED_DARK), cyan: hexInt(COL.NEON_CYAN), pink: hexInt(COL.NEON_PINK), white: 0xFFFFFF };
  function ledAt(bx, idx, st, out) {
    out = out || {};
    if (st.dark > 0) { out.hex = LED_INTS.dark; out.glow = 0; return out; }
    var mult = st.mult, fever = st.fever, red = !!st.reduced;
    if (!red && st.sinceTier < VIEW.TIER_CHASE && bx > st.petX - 3 + (st.sinceTier / VIEW.TIER_CHASE) * 15) { mult = st.prevMult; fever = st.prevFever; }
    var hex, glow;
    if (fever) {
      var step = red ? 0 : Math.floor((st.t || 0) * LED.chaseHz);          /* moves forward one cell every 0.5 s (2 Hz) */
      hex = hslInt((idx - step) * LED.hue, 0.95, 0.65); glow = 0.9;
    } else if (mult >= 3) { hex = LED_INTS.pink; glow = 0.7; }
    else if (mult === 2) { hex = LED_INTS.cyan; glow = 0.6; }
    else { hex = LED_INTS.off; glow = 0.12; }
    if (!red && st.sinceClear < VIEW.CLEAR_SWEEP) {                      /* a light sweeps forward on a clean clear */
      var band = st.petX + (st.sinceClear / VIEW.CLEAR_SWEEP) * 12;
      var d = Math.abs(bx - band);
      if (d < 0.75) { var w = 1 - d / 0.75; hex = mixInt(hex, LED_INTS.white, 0.6 * w); glow = Math.max(glow, 0.5 + 0.4 * w); }
    }
    if (!red && st.t != null) {                                          /* a soft floor accent every 2nd beat (≈1.07 Hz) */
      var b2 = frac(st.t / (2 * BEAT));
      if (b2 < 0.25) glow += 0.15 * (1 - b2 / 0.25);
    }
    out.hex = hex; out.glow = Math.min(1, glow);
    return out;
  }
  /* marquee bulbs: a 3-step chase at 2 Hz (each bulb changes at most twice a second) */
  function marqueeOn(i, t, reduced) { return reduced ? true : (i % 3) === (Math.floor(t * 2) % 3); }

  /* ================================================================
     RECYCLED STRIPS — n slots that always cover [camX - behind, …)
     slot i holds global index k ≡ i (mod n), k ∈ [base, base + n)
     ================================================================ */
  function ringBase(camX, spacing, behind) { return Math.floor((camX - behind) / spacing); }
  function ringSlot(i, n, base) { return base + ((((i - base) % n) + n) % n); }

  /* ================================================================
     FANS — 2 rows of bean blobs (from the Chorus door): bob every 2nd beat,
     jump on PERFECT / BOING, 'ooh' on bumps, heart paws at the last heart,
     a stadium wave at FEVER. k = global seat index.
     ================================================================ */
  var FAN_BODY = ['#FFB3E6', '#B3E5FF', '#C9FFE5', '#FFF3B3', '#FF8FC8'];
  var FAN_NEON = ['#FF4FB8', '#3DF2FF', '#A66BFF'];
  function fanLook(k, out) {
    out = out || {};
    out.body = FAN_BODY[Math.floor(hash01(k, 11) * FAN_BODY.length) % FAN_BODY.length];
    out.member = hash01(k, 12) < 0.4;                                    /* 40 % hold a wand in the child's colour */
    out.wand = FAN_NEON[Math.floor(hash01(k, 13) * 3) % 3];
    out.scale = 0.92 + 0.16 * hash01(k, 14);
    out.phase = hash01(k, 15);
    out.lean = (hash01(k, 16) - 0.5) * 10 * DEG;
    return out;
  }
  /* st = {t (logic clock), excite 0..EXCITE left, ooh, lastHeart, fever, reduced, x (seat world x)} */
  function fanPose(k, st, out) {
    out = out || {};
    var ph = hash01(k, 15);
    out.y = 0; out.sy = 1; out.wand = 0; out.paws = 0; out.roll = (hash01(k, 16) - 0.5) * 10 * DEG;
    if (st.ooh > 0) {                                                    /* paws to cheeks, wands droop */
      out.sy = 0.93; out.y = -0.01; out.wand = 70 * DEG; out.paws = -1; return out;
    }
    if (st.lastHeart) { out.wand = -10 * DEG; out.paws = 1; }            /* heart paws up */
    if (st.reduced) return out;
    var b = frac((st.t || 0) / (2 * BEAT) + ph * 0.15);                  /* every 2nd beat (≈ 1.07 Hz) */
    out.y += 0.03 * (1 - b) * (1 - b);
    out.sy += 0.04 * Math.cos(TAU * b) * 0.5;
    if (!st.lastHeart) out.wand = 22 * DEG * Math.sin(TAU * ((st.t || 0) / (4 * BEAT) + ph));
    if (st.excite > 0) {                                                 /* a happy jump, rippling a little */
      var u = 1 - st.excite / VIEW.EXCITE - ph * 0.25;
      if (u > 0 && u < 0.75) out.y += 0.14 * arc(u / 0.75);
    }
    if (st.fever) {                                                      /* stadium wave travelling forward */
      var w = Math.sin((st.t || 0) * 3 - (st.x || 0) * 0.9);
      if (w > 0) { out.y += 0.12 * w; out.wand -= 30 * DEG * w; }
    }
    return out;
  }

  /* ================================================================
     SMALL TIMELINES
     ================================================================ */
  function cueRingScale(t, reduced) { return reduced ? 1 : 1 + 0.1 * Math.sin(TAU * t); }   /* 1 Hz pulse */
  function pickupSpin(t, phase, reduced) { return reduced ? phase : TAU * t + phase; }      /* 1 rev/s */
  function pickupBob(t, phase, reduced) { return reduced ? 0 : 0.04 * Math.sin(TAU * t + phase); }
  /* spilled treats pulse (scale) at 1.5 Hz while they sit — never above 2 Hz */
  function spillPulse(landed, landT, reduced) { return landed && !reduced ? 1 + 0.12 * Math.cos(TAU * 1.5 * landT) : 1; }
  /* the hat's flight after a bump: up and back, lands on the head at 0.5 s */
  function hatFlight(since, out) {
    out = out || {};
    var t = Math.min(since, VIEW.HAT_LAND);
    out.x = -0.55 * t;
    out.y = 2.4 * t - 0.5 * 9.6 * t * t;
    if (out.y < 0) out.y = 0;
    out.rot = -720 * DEG * clamp01(t / VIEW.HAT_LAND);
    out.attach = since >= VIEW.HAT_LAND;
    out.settle = since >= VIEW.HAT_LAND ? clamp01((since - VIEW.HAT_LAND) / VIEW.HAT_SETTLE) : 0;
    return out;
  }
  /* a pickup zipping to its HUD slot: eased lerp with an arc, shrinking */
  function zipAt(u, fx, fy, fz, tx, ty, tz, out) {
    out = out || {};
    var k = inQuad(clamp01(u)) * 0.6 + outQuad(clamp01(u)) * 0.4;
    out.x = lerp(fx, tx, k); out.y = lerp(fy, ty, k) + 0.6 * arc(u) * 0.5; out.z = lerp(fz, tz, k);
    out.s = lerp(1, 0.35, clamp01(u));
    return out;
  }
  /* curtain cover 0..1 over 1.0 s (instant under reduced motion) */
  function curtainK(endT, reduced) { return reduced ? 1 : inOutSine(endT / VIEW.CURTAIN_T); }

  /* the in-world sticker for an event (row in the sticker atlas). Row 2 is the cushion
     bounce: 'BOUNCE!', the HUD's word (the v2 copy voice bans 'boing') */
  var STICKERS = ['PERFECT!', 'GREAT', 'BOUNCE!', '+3', '+6', '+9', '+12', 'CLEAN STAGE +25'];
  function snackSticker(mult) { return 3 + clamp((mult | 0) - 1, 0, 3); }

  /* ================================================================
     PARTICLES — one fixed pool, structure-of-arrays, zero allocation.
     Fill sim.spec, then sim.emit(); step(dt) integrates; dead slots have a = 0.
     ================================================================ */
  function ParticleSim(cap, seed) {
    cap = Math.max(1, cap | 0);
    this.cap = cap; this.next = 0; this.alive = 0;
    var F = function () { return new Float32Array(cap); };
    this.x = F(); this.y = F(); this.z = F(); this.vx = F(); this.vy = F(); this.vz = F();
    this.g = F(); this.drag = F(); this.age = F(); this.life = F(); this.s0 = F(); this.s1 = F();
    this.rot = F(); this.vr = F(); this.r = F(); this.gg = F(); this.b = F(); this.a = F(); this.a0 = F();
    this.cell = new Uint8Array(cap); this.on = new Uint8Array(cap); this.floor = F();
    this.rand = xorshift(seed || 9001);
    this.scale = 1;                     /* quality step: spawn counts × scale */
    this.spec = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, g: 0, drag: 0, life: 1, s0: 0.1, s1: 0.1, rot: 0, vr: 0,
      r: 1, gg: 1, b: 1, a: 1, cell: 0, floor: -99 };
  }
  ParticleSim.prototype.emit = function () {
    var p = this.spec, i = this.next;
    this.next = (i + 1) % this.cap;                          /* a full pool overwrites the oldest */
    if (!this.on[i]) this.alive++;
    this.on[i] = 1;
    this.x[i] = p.x; this.y[i] = p.y; this.z[i] = p.z; this.vx[i] = p.vx; this.vy[i] = p.vy; this.vz[i] = p.vz;
    this.g[i] = p.g; this.drag[i] = p.drag; this.age[i] = 0; this.life[i] = Math.max(0.01, p.life);
    this.s0[i] = p.s0; this.s1[i] = p.s1; this.rot[i] = p.rot; this.vr[i] = p.vr;
    this.r[i] = p.r; this.gg[i] = p.gg; this.b[i] = p.b; this.a0[i] = p.a; this.a[i] = p.a;
    this.cell[i] = p.cell; this.floor[i] = p.floor;
    return i;
  };
  ParticleSim.prototype.step = function (dt) {
    if (!(dt > 0)) return;
    for (var i = 0; i < this.cap; i++) {
      if (!this.on[i]) continue;
      var age = this.age[i] + dt;
      if (age >= this.life[i]) { this.on[i] = 0; this.a[i] = 0; this.alive--; continue; }
      this.age[i] = age;
      var dr = this.drag[i] > 0 ? Math.exp(-this.drag[i] * dt) : 1;
      this.vx[i] *= dr; this.vz[i] *= dr; this.vy[i] = this.vy[i] * dr - this.g[i] * dt;
      this.x[i] += this.vx[i] * dt; this.y[i] += this.vy[i] * dt; this.z[i] += this.vz[i] * dt;
      if (this.y[i] < this.floor[i]) { this.y[i] = this.floor[i]; this.vy[i] = 0; this.vx[i] *= 0.6; this.vz[i] *= 0.6; this.vr[i] *= 0.5; }
      this.rot[i] += this.vr[i] * dt;
      var u = age / this.life[i];
      this.a[i] = this.a0[i] * (u < 0.7 ? 1 : 1 - (u - 0.7) / 0.3);  /* hold, then fade over the last 30 % */
    }
  };
  ParticleSim.prototype.size = function (i) { var u = this.age[i] / this.life[i]; return this.s0[i] + (this.s1[i] - this.s0[i]) * u; };
  ParticleSim.prototype.clear = function () { for (var i = 0; i < this.cap; i++) { this.on[i] = 0; this.a[i] = 0; } this.alive = 0; this.next = 0; };
  /* n particles in a cone around `angle` (radians in the x-y plane, 0 = +x, π/2 = up), spread ± half,
     speed ± jitter; the spec's other fields are kept. Returns how many were emitted. */
  function burst(sim, n, angle, spread, speed, jitter, zSpread) {
    n = Math.max(0, Math.round(n * (sim.scale || 1)));
    var p = sim.spec, bx = p.x, by = p.y, bz = p.z;
    for (var k = 0; k < n; k++) {
      var a = angle + (sim.rand() - 0.5) * spread, v = speed * (1 + (sim.rand() - 0.5) * 2 * (jitter || 0));
      p.x = bx; p.y = by; p.z = bz;
      p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v; p.vz = (sim.rand() - 0.5) * (zSpread || 0);
      p.rot = sim.rand() * TAU;
      sim.emit();
    }
    p.x = bx; p.y = by; p.z = bz;
    return n;
  }

  return {
    VERSION: VERSION, PX: PX, GROUND: GROUND, PET_CX: PET_CX, BPM: BPM, BEAT: BEAT,
    VIEW: VIEW, CAM: CAM, LED: LED, COL: COL, VARIANTS: VARIANTS, THEMES_LOCKED: THEMES_LOCKED, EXTRAS: EXTRAS,
    TREATS: TREATS, SUNSET: SUNSET, FAN_BODY: FAN_BODY, FAN_NEON: FAN_NEON, STICKERS: STICKERS, SINCE_KEYS: SINCE_KEYS,
    /* maths */
    clamp: clamp, clamp01: clamp01, lerp: lerp, frac: frac, arc: arc, inOutSine: inOutSine, outQuad: outQuad, inQuad: inQuad,
    outBack: outBack, outElastic: outElastic, smoothK: smoothK, approach: approach, hash: hash, hash01: hash01, xorshift: xorshift,
    hexInt: hexInt, intHex: intHex, isHex: isHex, mixInt: mixInt, scaleInt: scaleInt, hslInt: hslInt, safeMember: safeMember,
    /* mapping + look */
    worldX: worldX, worldY: worldY, petX: petX, feetH: feetH, obsCentreX: obsCentreX, kindSizes: kindSizes, look3d: look3d,
    /* light + camera */
    showMix: showMix, lightAt: lightAt, fovFor: fovFor, followCam: followCam, shakeAt: shakeAt, kickAt: kickAt,
    moveK: moveK, menuOrbit: menuOrbit,
    /* juice + pet + props */
    newJuice: newJuice, resetJuice: resetJuice, juiceEvent: juiceEvent, juiceStep: juiceStep, juiceCam: juiceCam,
    newVisual: newVisual, petVisual: petVisual, newPropAnim: newPropAnim, propAnim: propAnim,
    rehearsalRect: rehearsalRect, dashCount: dashCount, dashAt: dashAt,
    /* lights, fans, strips, timelines */
    ledAt: ledAt, marqueeOn: marqueeOn, ringBase: ringBase, ringSlot: ringSlot, fanLook: fanLook, fanPose: fanPose,
    cueRingScale: cueRingScale, pickupSpin: pickupSpin, pickupBob: pickupBob, spillPulse: spillPulse, hatFlight: hatFlight,
    zipAt: zipAt, curtainK: curtainK, snackSticker: snackSticker,
    /* particles */
    ParticleSim: ParticleSim, burst: burst
  };
}));
