/* ================================================================
   My Island 3D — particles, halos, light decals, emotes and camera
   shake (island chunk 11; classic script, THREE comes from the kit K).
   window.SLFx3D in the browser (also SL3D.makeFx(opts) once the stage
   is ready); require() in Node returns the same object, whose PURE
   helpers (the emitter table, spawn maths, envelopes, caps, plans and
   the shake curve) run without THREE.

   var fx = SLFx3D.create(K, SL3D, {scene, camera, reduced, member, tier})
     (scene given → scene.add(fx.group) is done for you)
     fx.emit(kind, worldPos, n, opts) → count spawned
         worldPos: Vector3 | [x, y, z] | {x, y, z} | Object3D (its world position). pos and opts are
         COPIED (models reuse scratch objects). kinds: sparkle sparkleRing heart note star confetti
         streamer dust splash drop bubble petal snow firework glow exhaust smoke trail glint dizzy
         flight, and 'emote' (→ fx.emote). Unknown kinds play 'sparkle'.
         opts: {token | color ('#hex' | Color) | tokens[], member '#hex', size (u), cell (atlas name),
                max (live cap for this kind), seed (bubbles follow SLMotion.bubbleTrack), pearl (holo
                sheen; bubbles always have it), idle (no pop sparkle), reduced (force the reduced
                variant), radius (ring / dust spread, u), dir [x, y, z] + dirSpeed [min, max] + cone
                (rad), speed ×, life ×, up ×, to (flight target: a position in any form above),
                dur (flight seconds, 0.5), delay (seconds before it sets off)}
         'flight' (an item put away → the tray): a gold sparkle that waits `delay`, then flies along
         a raised arc (flightAt) to `to` over `dur`, leaving a short trail; without `to` — or under
         reduced motion — it is a still sparkle at the emit point.
     fx.halo(key, on, pos, sizeU, token)     keyed additive glow billboard (K.billboards show pool:
                                             Showtime grows it 1 → 1.6× and 0.5 → 0.9 opacity)
     fx.decal(key, on, pos, token)           keyed additive light pool on the ground (r 0.7, 0.35)
     fx.mark(key, on, pos, {cell, token|color, size, alpha, glow, flat, rot})   any keyed sprite
     fx.confetti({at?, n?, member?, tokens?, streamers?})   a burst at `at`, or (no at) cannons from
                                             both screen edges; 40 % in the member colour, ≤ 120 alive
     fx.streamers({n?, member?})             curly ribbons drifting down across the view
     fx.fireworks({at?, n = 3, height?})     soft sparkle-ring fireworks in the sky (no flash, no bang)
     fx.emote(worldPos | Object3D, kind)     a speech bubble with heart | note | star | sparkle | dizzy
     fx.shake(amp = 0.06, dur = 0.18)        decaying camera shake; never under reduced motion
     fx.update(dt, camera) → animating       once per frame, after the camera rig (shake is applied to
                                             camera.position and undone next frame; cannons and
                                             firework rings use the camera's basis)
     fx.setTier(tier) · fx.setQuality(q) · fx.setReduced(on) · fx.setMember(hex) · fx.clear()
     fx.shakeOffset(outV3) · fx.info() · fx.dispose()

   DRAWING: one particle mesh (InstancedBufferGeometry quads + a small ShaderMaterial on the kit's
   sparkle atlas), one keyed 'marks' mesh (decals, controller sprites, emote bubbles) with the SAME
   shader (one program), and the kit's halo billboard pool. Each sprite is either 'paper' (normal
   blend: confetti, petals, dust, hearts) or 'glow' (additive: sparkles, snow, fireworks) in the
   same draw call (premultiplied output: alpha 0 = additive), camera-facing or flat on the ground
   (splash rings, decals). Capacity per tier (LOW 128 / MID 256 / HIGH 512, halved by the adaptive
   'particles' step); confetti ≤ 120, bubbles ≤ 24, petals ≤ 40, snow 60/100/150. Everything is
   preallocated: the frame loop writes typed arrays and allocates nothing.
   SAFETY: every shimmer / twinkle / flip is ≤ 2 Hz (MAX_FLASH_HZ); no full-screen flash; under
   reduced motion particles become a few static sparkle fades (0.4 s), petals stop, no shake.
   ================================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root, require('./motion.js'), require('../world-look.js'));
  } else {
    root.SLFx3D = factory(root, null, null);
  }
}(typeof self !== 'undefined' ? self : typeof globalThis !== 'undefined' ? globalThis : this, function (root, M0, L0) {
  'use strict';

  var VERSION = 1;
  var PI = Math.PI, TAU = PI * 2;
  var MAX_FLASH_HZ = 2;
  var TIERS = ['LOW', 'MID', 'HIGH'];

  /* lazy lookups, so script order never matters in the browser */
  function motion() { return M0 || root.SLMotion || null; }
  function look() { return L0 || root.SLIslandLook || null; }

  /* world-look FX (fallback copy for a standalone kit) */
  var FX_FALLBACK = {
    particles: { LOW: 128, MID: 256, HIGH: 512 }, snow: { LOW: 60, MID: 100, HIGH: 150 },
    confetti: 120, bubbles: 24, petals: 40, dustPuffs: 6, fireworkRings: 3, confettiMemberShare: 0.4,
    haloSize: [0.5, 1.2], decal: { r: 0.7, opacity: 0.35 }, shake: { amp: 0.06, dur: 0.18 }
  };
  function fxConst() { var L = look(); return (L && L.FX) || FX_FALLBACK; }

  /* the kit's sparkle atlas (kit.js ATLAS; test-compared) */
  var ATLAS = { sparkle: 0, heart: 1, note: 2, star: 3, dot: 4, ring: 5, rect: 6, petal: 7, snow: 8, bubble: 9,
    puff: 10, circle: 11, curl: 12, diamond: 13, plus: 14, tri: 15 };

  /* colour sets (palette / ART2D tokens only) */
  var TOKENS = {
    sparkle: ['Star Gold', 'Cloud White', 'Holo Pink', 'Neon Cyan'],
    neon: ['Neon Pink', 'Neon Cyan', 'Neon Violet', 'Star Gold'],
    confetti: ['Neon Pink', 'Neon Cyan', 'Star Gold', 'Neon Lime', 'Neon Violet', 'Holo Pink', 'Holo Blue',
      'Holo Mint', 'Bubblegum', 'Splash Blue'],
    holo: ['Holo Pink', 'Holo Blue', 'Holo Mint', 'Holo Lemon']
  };

  /* ================================================================
     THE EMITTER TABLE (pure data)
       cells    atlas cells, picked per particle      glow   1 additive light · 0 paper (normal blend)
       flat     lies on the ground / water            n      default count · per: particles per unit
       life     [min, max] s                          speed  [min, max] horizontal / radial u/s
       up       [min, max] vertical u/s (− falls)     spread sphere | ring | up | disc | fall | none
       jitter   start scatter radius u                g      gravity u/s² (− = buoyant) · drag 1/s
       size     [min, max] quad u · end ×size at death · spin rad/s · sway [amp u, hz]
       flip     [min, max] Hz paper flip (≤ 2)        twinkle Hz shimmer (≤ 2) · pop scale-in
       alpha    base opacity · tokens list | TOKENS key · member share in the child's colour
       cap      confetti | bubbles | petals | snow (shared live limits)
       reduced  'fade' (a static sparkle fade) | 'static' (its own cell, still, fading) | 'none'
       beh      track (SLMotion bubble) | orbit | hump (swell and shrink) | shell (firework launch)
     ================================================================ */
  var KINDS = {
    sparkle: { cells: ['sparkle'], glow: 1, n: 8, life: [0.55, 0.95], speed: [0.3, 0.9], up: [0.7, 1.5], spread: 'sphere',
      jitter: 0.12, g: 1.8, drag: 1.4, size: [0.13, 0.21], end: 0.3, spin: [-2.4, 2.4], twinkle: 1.6, alpha: 1,
      tokens: 'sparkle', reduced: 'static', reducedMax: 6 },
    sparkleRing: { cells: ['sparkle'], glow: 1, n: 12, life: [0.6, 0.8], speed: [1.4, 1.7], up: [0.1, 0.3], spread: 'ring',
      jitter: 0, g: 0.3, drag: 2.4, size: [0.14, 0.19], end: 0.35, spin: [-2, 2], twinkle: 1.5, alpha: 1,
      tokens: ['Star Gold', 'Neon Cyan', 'Holo Pink'], reduced: 'static', reducedMax: 6 },
    heart: { cells: ['heart'], glow: 0, n: 3, life: [0.9, 1.3], speed: [0.08, 0.28], up: [0.55, 0.85], spread: 'up',
      jitter: 0.1, g: -0.15, drag: 1.2, size: [0.17, 0.23], end: 0.85, spin: [-0.5, 0.5], sway: [0.05, 1.1], pop: 1,
      alpha: 1, tokens: ['Neon Pink', 'Bubblegum', 'Primary Pink'], reduced: 'static', reducedMax: 3 },
    note: { cells: ['note'], glow: 0, n: 3, life: [0.9, 1.3], speed: [0.08, 0.28], up: [0.55, 0.85], spread: 'up',
      jitter: 0.1, g: -0.15, drag: 1.2, size: [0.17, 0.23], end: 0.85, spin: [-0.5, 0.5], sway: [0.06, 0.9], pop: 1,
      alpha: 1, tokens: ['Neon Violet', 'Neon Cyan', 'Neon Pink'], reduced: 'static', reducedMax: 3 },
    star: { cells: ['star'], glow: 0, n: 5, life: [0.7, 1.0], speed: [0.4, 1.0], up: [1.2, 1.9], spread: 'sphere',
      jitter: 0.08, g: 3.2, drag: 0.8, size: [0.14, 0.2], end: 0.5, spin: [-3, 3], pop: 1, alpha: 1,
      tokens: ['Star Gold', 'Gold Light'], reduced: 'static', reducedMax: 4 },
    confetti: { cells: ['rect', 'rect', 'tri', 'diamond', 'circle', 'heart', 'star'], glow: 0, n: 40, maxPerCall: 120,
      life: [2.2, 3.2], speed: [0.8, 2.2], up: [2.8, 4.4], spread: 'sphere', jitter: 0.2, g: 3.2, drag: 1.5,
      size: [0.1, 0.15], end: 1, spin: [-4, 4], sway: [0.08, 1.2], flip: [1.0, 2.0], alpha: 1, tokens: 'confetti',
      member: 0.4, cap: 'confetti', reduced: 'fade', reducedMax: 8 },
    streamer: { cells: ['curl'], glow: 0, n: 10, maxPerCall: 40, life: [3.0, 4.0], speed: [0.1, 0.5], up: [-1.2, -0.6],
      spread: 'fall', jitter: 0.6, g: 1.2, drag: 0.8, size: [0.26, 0.36], end: 1, spin: [-1.2, 1.2], sway: [0.14, 0.6],
      flip: [0.5, 1.0], alpha: 1, tokens: 'confetti', member: 0.4, cap: 'confetti', reduced: 'fade', reducedMax: 6 },
    dust: { cells: ['puff'], glow: 0, n: 6, life: [0.45, 0.65], speed: [0.9, 1.3], up: [0.15, 0.3], spread: 'ring',
      jitter: 0, g: 0.3, drag: 3.5, size: [0.16, 0.22], end: 1.9, spin: [-0.6, 0.6], alpha: 0.75,
      tokens: ['Cloud White', 'Pebble'], reduced: 'static', reducedMax: 3 },
    splash: { cells: ['ring'], glow: 0, flat: 1, n: 1, life: [0.55, 0.7], speed: [0, 0], up: [0, 0], spread: 'none',
      jitter: 0.05, g: 0, drag: 0, size: [0.3, 0.36], end: 3.6, spin: [0, 0], alpha: 0.85, tokens: ['Foam'],
      extra: 'drop', extraN: 2, reduced: 'static', reducedMax: 2 },
    drop: { cells: ['dot'], glow: 0, n: 2, life: [0.4, 0.55], speed: [0.25, 0.6], up: [1.2, 1.8], spread: 'sphere',
      jitter: 0.05, g: 7, drag: 0.4, size: [0.06, 0.09], end: 0.6, spin: [0, 0], alpha: 0.9, tokens: ['Foam', 'Water'],
      reduced: 'none' },
    bubble: { cells: ['bubble'], glow: 0, n: 4, life: [1.6, 2.4], speed: [0.05, 0.2], up: [0.5, 0.8], spread: 'up',
      jitter: 0.1, g: 0, drag: 0.6, size: [0.13, 0.22], end: 1.05, spin: [-0.3, 0.3], sway: [0.1, 0.9], alpha: 0.85,
      tokens: 'holo', pearl: 1, beh: 'track', cap: 'bubbles', reduced: 'static', reducedMax: 4 },
    petal: { cells: ['petal'], glow: 0, n: 1, life: [2.8, 3.6], speed: [0.05, 0.2], up: [-0.4, -0.25], spread: 'fall',
      jitter: 0.05, g: 0.1, drag: 2, size: [0.1, 0.13], end: 1, spin: [-1.5, 1.5], sway: [0.12, 0.7], flip: [0.6, 1.2],
      alpha: 1, tokens: ['Blossom Light', 'Blossom'], cap: 'petals', reduced: 'none' },
    snow: { cells: ['snow', 'sparkle'], glow: 1, n: 6, life: [1.8, 2.6], speed: [0.03, 0.12], up: [-0.25, 0.12],
      spread: 'sphere', jitter: 0.35, g: 0, drag: 1, size: [0.08, 0.12], end: 0.8, spin: [-0.8, 0.8], sway: [0.08, 0.5],
      twinkle: 0.8, alpha: 0.9, tokens: ['Cloud White', 'Holo Blue'], cap: 'snow', reduced: 'static', reducedMax: 4 },
    firework: { cells: ['sparkle'], glow: 1, n: 18, maxPerCall: 40, life: [1.0, 1.4], speed: [2.0, 2.4], up: [0, 0],
      spread: 'disc', jitter: 0, g: 0.5, drag: 1.6, size: [0.16, 0.22], end: 0.3, spin: [-2, 2], twinkle: 1.2, alpha: 1,
      tokens: 'neon', reduced: 'fade', reducedMax: 6 },
    shell: { cells: ['sparkle'], glow: 1, n: 1, life: [0.55, 0.55], speed: [0, 0], up: [0, 0], spread: 'none', jitter: 0,
      g: 0, drag: 0, size: [0.2, 0.2], end: 0.7, spin: [2, 2], alpha: 1, tokens: ['Star Gold'], beh: 'shell', reduced: 'none' },
    glow: { cells: ['dot'], glow: 1, n: 1, life: [0.45, 0.55], speed: [0, 0], up: [0, 0], spread: 'none', jitter: 0,
      g: 0, drag: 0, size: [0.7, 0.8], end: 1.4, spin: [0, 0], alpha: 0.5, tokens: ['Cloud White'], beh: 'hump',
      reduced: 'static', reducedMax: 1 },
    exhaust: { cells: ['puff'], glow: 0, n: 1, per: 3, life: [0.6, 0.9], speed: [0.15, 0.35], up: [0.3, 0.55],
      spread: 'sphere', jitter: 0.06, g: -0.2, drag: 2, size: [0.14, 0.2], end: 2.2, spin: [-0.8, 0.8], alpha: 0.8,
      tokens: ['Holo Pink', 'Holo Blue', 'Holo Lemon'], reduced: 'static', reducedMax: 2 },
    smoke: { cells: ['puff'], glow: 0, n: 1, life: [1.4, 1.8], speed: [0.02, 0.08], up: [0.35, 0.5], spread: 'up',
      jitter: 0.04, g: -0.05, drag: 0.5, size: [0.16, 0.2], end: 2.4, spin: [-0.4, 0.4], alpha: 0.6,
      tokens: ['Smoke', 'Cloud White'], reduced: 'none' },
    trail: { cells: ['sparkle'], glow: 1, n: 1, life: [0.25, 0.4], speed: [0, 0.12], up: [-0.05, 0.1], spread: 'sphere',
      jitter: 0.03, g: 0, drag: 2, size: [0.08, 0.12], end: 0.2, spin: [-1, 1], alpha: 0.9,
      tokens: ['Star Gold', 'Cloud White'], reduced: 'none' },
    glint: { cells: ['sparkle'], glow: 1, n: 1, life: [0.5, 0.7], speed: [0, 0], up: [0, 0], spread: 'none', jitter: 0.02,
      g: 0, drag: 0, size: [0.2, 0.26], end: 1, spin: [0.6, 1.2], alpha: 1, tokens: ['Cloud White', 'Gold Light'],
      beh: 'hump', reduced: 'static', reducedMax: 1 },
    dizzy: { cells: ['star'], glow: 0, n: 3, life: [1.2, 1.2], speed: [0, 0], up: [0, 0], spread: 'none', jitter: 0,
      g: 0, drag: 0, size: [0.11, 0.11], end: 1, spin: [1.5, 1.5], orbit: [0.2, 0.9], alpha: 1, tokens: ['Star Gold'],
      beh: 'orbit', reduced: 'static', reducedMax: 3 },
    flight: { cells: ['sparkle'], glow: 1, n: 1, maxPerCall: 4, life: [0.5, 0.5], speed: [0, 0], up: [0, 0], spread: 'none',
      jitter: 0, g: 0, drag: 0, size: [0.26, 0.3], end: 0.5, spin: [2, 3], alpha: 1, tokens: ['Star Gold', 'Gold Light'],
      beh: 'flight', reduced: 'static', reducedMax: 1 }
  };
  /* model / controller names that mean the same thing */
  var ALIAS = {
    sparkles: 'sparkle', twinkle: 'glint', ring: 'sparkleRing', hearts: 'heart', love: 'heart', notes: 'note',
    music: 'note', stars: 'star', bubbles: 'bubble', pearl: 'bubble', petals: 'petal', snowSparkle: 'snow',
    fireworks: 'firework', puff: 'dust', drops: 'drop', droplets: 'drop', streamers: 'streamer', exhaustPuff: 'exhaust'
  };
  function kindOf(kind) {
    var k = ALIAS[kind] || kind;
    return KINDS[k] && k !== 'shell' ? k : 'sparkle';
  }

  /* emote bubbles: icon cell + colour per kind */
  var EMOTES = {
    heart: { cell: 'heart', token: 'Neon Pink' }, note: { cell: 'note', token: 'Neon Violet' },
    star: { cell: 'star', token: 'Star Gold' }, sparkle: { cell: 'sparkle', token: 'Neon Cyan' },
    dizzy: { cell: 'star', token: 'Star Gold', spin: true }
  };
  var EMOTE_ALIAS = { love: 'heart', happy: 'heart', hearts: 'heart', music: 'note', sing: 'note', notes: 'note',
    wow: 'star', stars: 'star', shine: 'sparkle', sparkles: 'sparkle', tumble: 'dizzy' };
  function emoteOf(kind) { var k = EMOTE_ALIAS[kind] || kind; return EMOTES[k] ? k : 'heart'; }

  /* ---------------- maths ---------------- */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function safeHz(hz) { return hz > MAX_FLASH_HZ ? MAX_FLASH_HZ : hz < 0 ? 0 : hz; }
  function outQuad(t) { return 1 - (1 - t) * (1 - t); }
  function outBack(t) { var c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }
  function range(r, rnd) { return r[0] + (r[1] - r[0]) * rnd(); }
  /* mulberry32: a small seeded RNG (deterministic tests; no allocation per call) */
  function rng(seed) {
    var s = (seed >>> 0) || 0x9E3779B9;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function parseTier(t) { var u = typeof t === 'string' ? t.toUpperCase() : ''; return TIERS.indexOf(u) >= 0 ? u : null; }

  /* ---------------- caps per tier ----------------
     particles = the pool (× the adaptive particleScale); the per-kind live limits never exceed the
     bible's numbers and leave room in the small LOW pool for sparkles while confetti flies. */
  function caps(tier, scale) {
    var F = fxConst(), t = parseTier(tier) || 'MID';
    var s = scale > 0 && scale <= 1 ? scale : 1;
    var pt = (F.particles && F.particles[t]) || FX_FALLBACK.particles[t];
    var P = Math.max(16, Math.floor(pt * s));
    var snow = (F.snow && F.snow[t]) || FX_FALLBACK.snow[t];
    return {
      tier: t, particles: P,
      confetti: Math.min(F.confetti || 120, Math.floor(P * 0.75)),
      bubbles: Math.min(F.bubbles || 24, Math.floor(P * 0.25)),
      petals: Math.min(F.petals || 40, Math.floor(P * 0.3)),
      snow: Math.min(Math.floor(snow * s), Math.floor(P * 0.6))
    };
  }
  var CAP_KEYS = ['', 'confetti', 'bubbles', 'petals', 'snow'];

  /* how many particles one emit spawns before pool / cap limits */
  function emitCount(kind, n, reduced) {
    var spec = KINDS[kindOf(kind)];
    var want = n > 0 ? Math.round(n) : spec.n;
    if (reduced) {
      if (spec.reduced === 'none') return 0;
      return Math.min(spec.reducedMax || 6, Math.max(1, Math.ceil(want / 3)));
    }
    return clamp(want, 1, spec.maxPerCall || 64) * (spec.per || 1);
  }

  /* ---------------- one particle's start state (pure) ----------------
     spec = KINDS[kind]; i of n in this burst; rnd() → [0, 1); o = emit opts (+ reduced, basis
     {rx, ry, rz, ux, uy, uz} for 'disc', dir [x, y, z] + dirSpeed [min, max] + cone rad).
     out: {x, y, z (offset from the emit point), vx, vy, vz, life, size, end, rot, spin, swayA, swayHz,
           swayPh, flipHz, flipPh, twHz, twPh, alpha, cell, glow, flat, still, hump, pop, tok}
     tok = index into the colour list, or -1 for the member colour. */
  var NOOPT = {};
  function spawn(spec, i, n, rnd, o, out) {
    o = o || NOOPT; out = out || {};
    var reduced = !!o.reduced;
    var lifeMul = o.life > 0 ? o.life : 1, spMul = o.speed > 0 ? o.speed : 1, upMul = o.up > 0 ? o.up : 1;
    var cells = spec.cells;
    out.cell = typeof o.cell === 'string' && ATLAS[o.cell] != null ? o.cell : cells[cells.length > 1 ? Math.floor(rnd() * cells.length) : 0];
    out.glow = spec.glow ? 1 : 0; out.flat = spec.flat ? 1 : 0;
    out.life = range(spec.life, rnd) * lifeMul;
    out.size = (o.size > 0 ? o.size * (0.85 + 0.3 * rnd()) : range(spec.size, rnd));
    out.end = spec.end; out.alpha = spec.alpha; out.pop = spec.pop ? 1 : 0;
    out.rot = rnd() * TAU; out.spin = range(spec.spin, rnd);
    out.swayA = spec.sway ? spec.sway[0] * (0.7 + 0.6 * rnd()) : 0;
    out.swayHz = spec.sway ? safeHz(spec.sway[1] * (0.8 + 0.4 * rnd())) : 0;
    out.swayPh = rnd() * TAU;
    out.flipHz = spec.flip ? safeHz(range(spec.flip, rnd)) : 0;
    out.flipPh = rnd() * TAU;
    out.twHz = spec.twinkle ? safeHz(spec.twinkle * (0.8 + 0.25 * rnd())) : 0;
    out.twPh = rnd() * TAU;
    out.still = 0; out.hump = spec.beh === 'hump' ? 1 : 0;
    /* colour: the member share first (every 5th pair), then the list */
    var share = spec.member && o.hasMember ? clamp01(o.memberShare != null ? o.memberShare : spec.member) : 0;
    out.tok = share > 0 && (i % 5) < Math.round(share * 5) ? -1 : Math.floor(rnd() * 1e6);
    /* start scatter: uniform in a disc */
    var jr = (o.radius > 0 && spec.spread !== 'ring' ? Math.max(spec.jitter, o.radius * 0.5) : spec.jitter) * Math.sqrt(rnd());
    var ja = rnd() * TAU;
    out.x = Math.cos(ja) * jr; out.y = 0; out.z = Math.sin(ja) * jr;
    out.vx = 0; out.vy = 0; out.vz = 0;
    var hs = range(spec.speed, rnd) * spMul, vy = range(spec.up, rnd) * upMul, a;
    if (reduced) {
      /* reduced motion: a still sparkle (or the kind's own cell) that fades in and out */
      out.still = 1; out.hump = 1; out.spin = 0; out.swayA = 0; out.flipHz = 0; out.twHz = 0; out.pop = 0; out.end = 1;
      out.life = spec.reduced === 'fade' ? 0.4 + 0.15 * rnd() : clamp(out.life * 0.6, 0.35, 0.9);
      if (spec.reduced === 'fade') { out.cell = 'sparkle'; out.glow = 1; out.size = 0.16 + 0.06 * rnd(); out.end = 1; }
      if (n > 1) { var rr = Math.max(spec.jitter, 0.3) * Math.sqrt(rnd()), ra = rnd() * TAU; out.x = Math.cos(ra) * rr; out.z = Math.sin(ra) * rr; out.y = 0.15 * rnd(); }
      return out;
    }
    if (o.dir) {
      /* a directed cone (cannons, exhaust): dir · speed plus a sideways spread */
      var dx = o.dir[0] || 0, dy = o.dir[1] || 0, dz = o.dir[2] || 0, dl = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      dx /= dl; dy /= dl; dz /= dl;
      var sp = o.dirSpeed ? range(o.dirSpeed, rnd) : Math.max(hs, Math.abs(vy)), cone = o.cone > 0 ? o.cone : 0.3;
      coneVelocity(dx, dy, dz, sp, cone, rnd(), rnd(), out);
      return out;
    }
    switch (spec.spread) {
      case 'ring': {
        var r0 = o.radius > 0 ? o.radius * 0.45 : 0.05;
        a = (i / Math.max(1, n)) * TAU + (rnd() - 0.5) * (TAU / Math.max(1, n)) * 0.3;
        var ringMul = o.radius > 0 ? 0.6 + o.radius * 0.6 : 1;
        out.x = Math.cos(a) * r0; out.z = Math.sin(a) * r0;
        out.vx = Math.cos(a) * hs * ringMul; out.vz = Math.sin(a) * hs * ringMul; out.vy = vy;
        break;
      }
      case 'disc': {
        var b = o.basis || DEFAULT_BASIS;
        a = (i / Math.max(1, n)) * TAU + (rnd() - 0.5) * 0.12;
        var c = Math.cos(a) * hs, s = Math.sin(a) * hs;
        out.vx = b.rx * c + b.ux * s; out.vy = b.ry * c + b.uy * s + vy; out.vz = b.rz * c + b.uz * s;
        break;
      }
      case 'none': break;
      default: {   /* sphere | up | fall: a random heading, horizontal hs, vertical vy */
        a = rnd() * TAU;
        out.vx = Math.cos(a) * hs; out.vz = Math.sin(a) * hs; out.vy = vy;
      }
    }
    return out;
  }
  var DEFAULT_BASIS = { rx: 1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0 };
  /* velocity inside a cone of half-angle `cone` around the unit (dx, dy, dz) */
  function coneVelocity(dx, dy, dz, speed, cone, r1, r2, out) {
    /* any two unit vectors perpendicular to d */
    var px = Math.abs(dy) < 0.9 ? -dz : 0, py = Math.abs(dy) < 0.9 ? 0 : dz, pz = Math.abs(dy) < 0.9 ? dx : -dy;
    var pl = Math.sqrt(px * px + py * py + pz * pz) || 1;
    px /= pl; py /= pl; pz /= pl;
    var qx = dy * pz - dz * py, qy = dz * px - dx * pz, qz = dx * py - dy * px;
    var th = cone * Math.sqrt(r1), ph = r2 * TAU, st = Math.sin(th), ct = Math.cos(th);
    var cp = Math.cos(ph) * st, sp = Math.sin(ph) * st;
    out.vx = (dx * ct + px * cp + qx * sp) * speed;
    out.vy = (dy * ct + py * cp + qy * sp) * speed;
    out.vz = (dz * ct + pz * cp + qz * sp) * speed;
    return out;
  }

  /* ---------------- envelopes (pure) ---------------- */
  /* opacity over life: quick fade-in, fade-out over the last 30 %, an optional ≤ 2 Hz shimmer;
     hump = a single swell (reduced-motion fades, glints) */
  function alphaAt(age, life, a0, twHz, twPh, hump) {
    var u = life > 0 ? clamp01(age / life) : 1;
    if (hump) return a0 * Math.sin(PI * u);
    var a = a0 * Math.min(1, age / 0.06) * (u > 0.7 ? (1 - u) / 0.3 : 1);
    if (twHz > 0) a *= 1 - 0.35 * (0.5 - 0.5 * Math.cos(TAU * safeHz(twHz) * age + (twPh || 0)));
    return a;
  }
  /* quad size over life: toward size·end (outQuad), an outBack pop-in, or a hump */
  function sizeAt(age, life, size, end, pop, hump) {
    var u = life > 0 ? clamp01(age / life) : 1;
    var s = size * (1 + ((end == null ? 1 : end) - 1) * outQuad(u));
    if (hump) s *= 0.35 + 0.65 * Math.sin(PI * u);
    if (pop && age < 0.16) s *= Math.max(0, outBack(age / 0.16));
    return s;
  }
  /* paper flip: the quad's x scale (sign kept, never fully edge-on) */
  function flipAt(age, hz, ph) {
    if (!(hz > 0)) return 1;
    var c = Math.cos(TAU * safeHz(hz) * age + (ph || 0));
    return c < 0 ? Math.min(c, -0.12) : Math.max(c, 0.12);
  }
  /* semi-implicit Euler with exponential drag on typed arrays (pos/vel stride 3) */
  function integrate(pos, vel, i, g, drag, dt) {
    var j = i * 3, k = drag > 0 ? Math.exp(-drag * dt) : 1;
    vel[j] *= k; vel[j + 1] = vel[j + 1] * k - g * dt; vel[j + 2] *= k;
    pos[j] += vel[j] * dt; pos[j + 1] += vel[j + 1] * dt; pos[j + 2] += vel[j + 2] * dt;
  }
  /* pearl bubbles drift through the holo stops (0.35 Hz: a slow sheen, never a flash) */
  var PEARL_HZ = 0.35;
  function holoAt(age, ph, out) {
    var f = ((age * PEARL_HZ + (ph || 0)) % 1 + 1) % 1 * 4, i = Math.floor(f);
    out = out || {};
    out.i = i % 4; out.j = (i + 1) % 4; out.k = f - i;
    return out;
  }
  /* an emote bubble: pop in (outBack 0.22 s), rise 0.22 u, fade over the last 0.3 s (1.4 s);
     reduced: no pop or rise, a 1.2 s fade */
  var EMOTE_SEC = 1.4, EMOTE_REDUCED_SEC = 1.2;
  function emoteTrack(t, reduced, out) {
    out = out || {};
    var d = reduced ? EMOTE_REDUCED_SEC : EMOTE_SEC;
    out.done = t >= d;
    if (reduced) {
      out.scale = 1; out.dy = 0;
      out.alpha = t <= 0 ? 0 : Math.min(1, t / 0.15) * clamp01((d - t) / 0.3);
      return out;
    }
    out.scale = t <= 0 ? 0 : t < 0.22 ? Math.max(0, outBack(t / 0.22)) : 1;
    out.dy = 0.22 * outQuad(clamp01(t / d)) + 0.015 * Math.sin(TAU * 0.9 * t);
    out.alpha = clamp01((d - t) / 0.3);
    return out;
  }
  /* the 'flight' sparkle at `age`: still at `from` during `delay`, then an ease-out along a raised
     arc to `to`, arriving at `life`. from / to are [x, y, z] (any array, read at fi / ti — the
     particle arrays are passed in directly); out {x, y, z, f (0..1 progress)} */
  var FLIGHT_ARC = 0.6;
  function flightAt(age, delay, life, from, fi, to, ti, out) {
    out = out || {};
    fi = fi || 0; ti = ti || 0;
    var span = Math.max(0.01, life - (delay > 0 ? delay : 0)), f = clamp01((age - (delay > 0 ? delay : 0)) / span), e = outQuad(f);
    out.f = f;
    out.x = from[fi] + (to[ti] - from[fi]) * e;
    out.y = from[fi + 1] + (to[ti + 1] - from[fi + 1]) * e + Math.sin(PI * f) * FLIGHT_ARC;
    out.z = from[fi + 2] + (to[ti + 2] - from[fi + 2]) * e;
    return out;
  }
  /* camera shake: a decaying buzz, |offset| ≤ amp, zero once done or under reduced motion */
  function shakeOffset(t, amp, dur, seed, reduced, out) {
    out = out || {};
    if (reduced || !(amp > 0) || !(dur > 0) || t < 0 || t >= dur) { out.x = 0; out.y = 0; out.z = 0; return out; }
    var e = 1 - t / dur, env = amp * e * e, ph = ((seed >>> 0) % 997) / 997 * TAU;
    out.x = env * Math.sin(TAU * 19 * t + ph) * 0.8;
    out.y = env * Math.sin(TAU * 23 * t + ph * 1.7) * 0.5;
    out.z = env * Math.sin(TAU * 17 * t + ph * 2.3) * 0.3;
    return out;
  }

  /* ---------------- show plans (pure) ---------------- */
  /* fireworks: n shells launched 0.4 s apart; each rises 0.55 s and bursts into a ring */
  var FW = { stagger: 0.4, rise: 0.55, offsets: [[-2.4, 4.6, -1.0], [0.2, 5.4, -1.8], [2.6, 4.8, -0.8], [-1.2, 5.8, -2.4], [1.4, 5.0, -2.6]] };
  function fireworkPlan(n, at, height) {
    var out = [], ax = at ? at[0] : 0, ay = at ? at[1] : 0, az = at ? at[2] : -0.5, h = height > 0 ? height / 5 : 1;
    n = clamp(n > 0 ? Math.round(n) : 3, 1, 8);
    for (var k = 0; k < n; k++) {
      var o = FW.offsets[k % FW.offsets.length];
      var bx = ax + o[0], by = ay + o[1] * h, bz = az + o[2];
      /* the shell climbs straight up from just above the ground to its burst point */
      out.push({ t: k * FW.stagger, sx: bx, sy: ay + 0.4, sz: bz, bx: bx, by: by, bz: bz, col: k % TOKENS.neon.length });
    }
    return out;
  }
  /* confetti cannons: an origin near a bottom corner of the view and an up-and-inward heading.
     cam = {px, py, pz, rx, ry, rz, ux, uy, uz, fx, fy, fz, fov (deg), aspect}, side −1 left / +1 right */
  function cannonPlan(side, cam, dist) {
    var hh = Math.tan((cam.fov || 30) * PI / 360) * dist, hw = hh * (cam.aspect || 1);
    var ox = side * hw * 0.92, oy = -hh * 0.72;
    var origin = [cam.px + cam.fx * dist + cam.rx * ox + cam.ux * oy,
      cam.py + cam.fy * dist + cam.ry * ox + cam.uy * oy,
      cam.pz + cam.fz * dist + cam.rz * ox + cam.uz * oy];
    /* up and inward, leaning a little into the scene so the paper settles over the island */
    var dx = cam.ux * 0.95 - cam.rx * side * 0.5 + cam.fx * 0.15;
    var dy = cam.uy * 0.95 - cam.ry * side * 0.5 + cam.fy * 0.15;
    var dz = cam.uz * 0.95 - cam.rz * side * 0.5 + cam.fz * 0.15;
    var l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    return { origin: origin, dir: [dx / l, dy / l, dz / l], halfW: hw, halfH: hh };
  }

  /* ================================================================
     SHADERS — one program for every fx sprite (particles, marks, emotes)
       iPos  xyz world position, w = quad x-scale (paper flip)
       iCol  rgb linear colour, a opacity (≤ 0 = dead: collapsed off-screen)
       iData size (u), rotation (rad), atlas cell, mode (bit 0 glow/additive, bit 1 flat on ground)
     Output is premultiplied (blend ONE, ONE_MINUS_SRC_ALPHA): paper writes its alpha, glow writes
     alpha 0, so both blend correctly in one draw call. Glow fades into the fog; paper takes its colour.
     ================================================================ */
  var SPRITE_VERT = [
    '#include <common>',
    '#include <fog_pars_vertex>',
    'attribute vec4 iPos;',
    'attribute vec4 iCol;',
    'attribute vec4 iData;',
    'uniform float uCells;',
    'varying vec2 vUv;',
    'varying vec4 vCol;',
    'varying float vGlow;',
    'void main() {',
    '  vCol = iCol;',
    '  vGlow = mod(iData.w, 2.0);',
    '  float cx = mod(iData.z, uCells), cy = floor(iData.z / uCells);',
    '  vUv = vec2((uv.x + cx) / uCells, 1.0 - (cy + 1.0 - uv.y) / uCells);',
    '  vec4 mvPosition = vec4(0.0, 0.0, -1.0, 1.0);',
    '  if (iCol.a <= 0.002 || iData.x <= 0.0) {',
    '    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);',          /* dead slot: beyond the far plane */
    '  } else {',
    '    float c = cos(iData.y), s = sin(iData.y);',
    '    vec2 q = vec2(position.x * iPos.w, position.y);',
    '    q = vec2(q.x * c - q.y * s, q.x * s + q.y * c) * iData.x;',
    '    if (iData.w >= 1.5) {',
    '      mvPosition = modelViewMatrix * vec4(iPos.x + q.x, iPos.y, iPos.z - q.y, 1.0);',
    '    } else {',
    '      mvPosition = modelViewMatrix * vec4(iPos.xyz, 1.0);',
    '      mvPosition.xy += q;',
    '    }',
    '    gl_Position = projectionMatrix * mvPosition;',
    '  }',
    '  #include <fog_vertex>',
    '}'
  ].join('\n');
  var SPRITE_FRAG = [
    '#include <common>',
    '#include <fog_pars_fragment>',
    'uniform sampler2D uMap;',
    'uniform float uAlphaMul;',
    'varying vec2 vUv;',
    'varying vec4 vCol;',
    'varying float vGlow;',
    'void main() {',
    '  float a = texture2D(uMap, vUv).a * vCol.a * uAlphaMul;',
    '  if (a < 0.004) discard;',
    '  vec3 col = vCol.rgb;',
    '  #ifdef USE_FOG',
    '    #ifdef FOG_EXP2',
    '      float fogF = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);',
    '    #else',
    '      float fogF = smoothstep(fogNear, fogFar, vFogDepth);',
    '    #endif',
    '    col = mix(col, fogColor, fogF * (1.0 - vGlow));',
    '    a *= 1.0 - fogF * vGlow;',
    '  #endif',
    '  gl_FragColor = vec4(col, 1.0);',
    '  #include <colorspace_fragment>',
    '  gl_FragColor = vec4(gl_FragColor.rgb * a, a * (1.0 - vGlow));',
    '}'
  ].join('\n');

  /* ================================================================
     create(K, SL3D, opts) → fx   (browser; THREE comes from K.THREE)
     ================================================================ */
  var BEH = { none: 0, track: 1, orbit: 2, shell: 3, flight: 4 };
  var KIND_NAMES = Object.keys(KINDS);
  var MARK_CAP = 40, EMOTE_CAP = 8, EMOTE_SLOTS = 3;
  var HALO_CAP = 48, QUEUE_CAP = 32;

  function create(K, SL3D, opts) {
    if (!K || !K.THREE || typeof K.col !== 'function') throw new Error('SLFx3D.create needs the kit K');
    opts = opts || {};
    var T = K.THREE, Mo = motion();
    var ATL = K.ATLAS || ATLAS, CELLS = K.ATLAS_CELLS || 4;
    var q0 = (SL3D && SL3D.quality) || {};
    var state = {
      tier: parseTier(opts.tier) || parseTier(K.tier) || parseTier(SL3D && SL3D.tier) || 'MID',
      scale: q0.particleScale > 0 ? q0.particleScale : 1,
      reduced: !!opts.reduced, t: 0, disposed: false,
      camera: opts.camera && opts.camera.isCamera ? opts.camera : null, member: null
    };
    var CAPS = caps(state.tier, state.scale);
    var rnd = rng(opts.seed != null ? opts.seed : (Date.now() >>> 0));

    /* scratch (nothing below allocates per frame) */
    var _v = new T.Vector3(), _v2 = new T.Vector3(), _to = new T.Vector3(), _col = new T.Color();
    var _sp = {}, _ho = {}, _et = {}, _sh = { x: 0, y: 0, z: 0 }, _bt = {}, _fl = { x: 0, y: 0, z: 0, f: 0 };
    var _basis = { rx: 1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0 };
    /* the opts one emit uses, copied here (a caller's object is never kept) */
    var _eo = { reduced: false, hasMember: false, memberShare: null, cell: null, size: 0, radius: 0, life: 0, speed: 0, up: 0,
      basis: null, dir: null, dirSpeed: null, cone: 0 };
    var _dir = [0, 1, 0], _dirSpeed = [5.5, 8];
    var _pick = { color: null, token: null, max: 0, idle: false, pearl: false };   /* per-particle colour / cap / idle / sheen */
    var _memberSave = new T.Color();
    var _popOpt = { size: 0.12, token: 'Cloud White', life: 0.8 };
    var _fwOpt = { token: null, size: 0, radius: 0, speed: 0 }, _glowOpt = { token: null };
    var _conOpt = { member: null, tokens: null, dir: null, dirSpeed: null, cone: 0.32, size: 0 };
    var _strOpt = { member: null, tokens: null };
    var _atArr = [0, 0, 0], _cannonDir = [0, 1, 0], CANNON_SPEED = [5.5, 8.0], STREAMER_SPEED = [4.0, 6.0];

    var group = new T.Group();
    group.name = 'fx3d';

    /* ---------------- colours (cached per token; runtime hex via K.rgb) ---------------- */
    var colCache = new Map();
    function colorOf(tok) {
      if (tok && tok.isColor) return tok;
      var key = String(tok || 'Cloud White'), c = colCache.get(key);
      if (c) return c;
      c = /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(key) ? K.rgb(key) : K.col(key);
      colCache.set(key, c);
      return c;
    }
    var HOLO = TOKENS.holo.map(colorOf);
    var memberC = new T.Color(1, 1, 1);
    function setMember(hex) {
      if (typeof hex === 'string' && /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(hex)) { memberC.copy(K.rgb(hex)); state.member = hex; }
      else state.member = null;
    }
    setMember(opts.member);
    function tokenList(spec) { return typeof spec.tokens === 'string' ? TOKENS[spec.tokens] : spec.tokens; }

    /* ---------------- sprite buffers: one InstancedBufferGeometry per mesh ---------------- */
    function spriteMaterial(name) {
      var u = T.UniformsUtils.merge([T.UniformsLib.fog, { uMap: { value: null }, uCells: { value: CELLS }, uAlphaMul: { value: 1 } }]);
      u.uMap.value = K.tex.sparkles();
      return new T.ShaderMaterial({
        name: name, uniforms: u, vertexShader: SPRITE_VERT, fragmentShader: SPRITE_FRAG,
        transparent: true, depthWrite: false, depthTest: true, fog: true, toneMapped: false,
        blending: T.CustomBlending, blendEquation: T.AddEquation, blendSrc: T.OneFactor, blendDst: T.OneMinusSrcAlphaFactor
      });
    }
    function Sprites(cap, name, renderOrder) {
      var geo = new T.InstancedBufferGeometry();
      geo.setIndex([0, 1, 2, 2, 1, 3]);
      geo.setAttribute('position', new T.BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 0]), 3));
      geo.setAttribute('uv', new T.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), 2));
      this.pos = new T.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
      this.col = new T.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
      this.dat = new T.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
      [this.pos, this.col, this.dat].forEach(function (a) { a.setUsage(T.DynamicDrawUsage); });
      geo.setAttribute('iPos', this.pos); geo.setAttribute('iCol', this.col); geo.setAttribute('iData', this.dat);
      geo.instanceCount = 0;
      this.geo = geo;
      this.mat = spriteMaterial(name);
      this.mesh = new T.Mesh(geo, this.mat);
      this.mesh.name = name; this.mesh.frustumCulled = false; this.mesh.renderOrder = renderOrder; this.mesh.visible = false;
      this.cap = cap; this.alive = new Uint8Array(cap); this.hi = 0; this.dirty = true; this.first = 0;
      this.ranges = [{ start: 0, count: 0 }, { start: 0, count: 0 }, { start: 0, count: 0 }];
      for (var i = 0; i < cap; i++) this.pos.array[i * 4 + 3] = 1;
    }
    Sprites.prototype.alloc = function (from, to) {
      for (var k = Math.max(from, this.first); k < to; k++) {
        if (!this.alive[k]) {
          this.alive[k] = 1;
          if (k + 1 > this.hi) this.hi = k + 1;
          if (k === this.first) this.first = k + 1;
          return k;
        }
      }
      return -1;
    };
    Sprites.prototype.release = function (k) {
      if (k < 0 || k >= this.cap || !this.alive[k]) return;
      this.alive[k] = 0;
      this.col.array[k * 4 + 3] = 0; this.dat.array[k * 4] = 0;
      if (k < this.first) this.first = k;
      while (this.hi > 0 && !this.alive[this.hi - 1]) this.hi--;
      this.dirty = true;
    };
    Sprites.prototype.write = function (k, x, y, z, flip, c, a, size, rot, cell, mode) {
      var o = k * 4, p = this.pos.array, cc = this.col.array, d = this.dat.array;
      p[o] = x; p[o + 1] = y; p[o + 2] = z; p[o + 3] = flip;
      cc[o] = c.r; cc[o + 1] = c.g; cc[o + 2] = c.b; cc[o + 3] = a;
      d[o] = size; d[o + 1] = rot; d[o + 2] = cell; d[o + 3] = mode;
      this.dirty = true;
    };
    Sprites.prototype.flush = function () {
      if (!this.dirty) return;
      this.dirty = false;
      var n = this.hi;
      this.geo.instanceCount = n;
      this.mesh.visible = n > 0;
      if (!n) return;
      upload(this.pos, n, this.ranges[0]); upload(this.col, n, this.ranges[1]); upload(this.dat, n, this.ranges[2]);
    };
    /* re-send only the live range [0, n) of a vec4 instance attribute; the range object is
       reused (addUpdateRange would allocate one per call; three empties the list after upload) */
    function upload(a, n, r) {
      if (Array.isArray(a.updateRanges)) {
        r.start = 0; r.count = n * 4;
        a.updateRanges.length = 0;
        a.updateRanges.push(r);
      }
      a.needsUpdate = true;
    }
    Sprites.prototype.clear = function () {
      for (var k = 0; k < this.cap; k++) { this.alive[k] = 0; this.col.array[k * 4 + 3] = 0; this.dat.array[k * 4] = 0; }
      this.hi = 0; this.first = 0; this.dirty = true;
    };
    Sprites.prototype.dispose = function () {
      if (this.mesh.parent) this.mesh.parent.remove(this.mesh);
      this.geo.dispose(); this.mat.dispose();
    };

    /* ================================================================
       PARTICLES — struct-of-arrays sized to the pool
       ================================================================ */
    var P = null;
    function buildParticles(cap) {
      if (P) { P.spr.dispose(); }
      var spr = new Sprites(cap, 'fx3d:particles', 6);
      group.add(spr.mesh);
      P = {
        spr: spr, cap: cap, n: 0, list: new Int32Array(cap), at: new Int32Array(cap),
        pos: new Float32Array(cap * 3), vel: new Float32Array(cap * 3), org: new Float32Array(cap * 3),
        age: new Float32Array(cap), life: new Float32Array(cap), size: new Float32Array(cap), end: new Float32Array(cap),
        rot: new Float32Array(cap), spin: new Float32Array(cap), g: new Float32Array(cap), drag: new Float32Array(cap),
        a0: new Float32Array(cap), swA: new Float32Array(cap), swHz: new Float32Array(cap), swPh: new Float32Array(cap),
        flHz: new Float32Array(cap), flPh: new Float32Array(cap), twHz: new Float32Array(cap), twPh: new Float32Array(cap),
        rgb: new Float32Array(cap * 3), tmr: new Float32Array(cap), tgt: new Float32Array(cap * 3), dly: new Float32Array(cap),
        cell: new Uint8Array(cap), mode: new Uint8Array(cap), beh: new Uint8Array(cap), capK: new Uint8Array(cap),
        flags: new Uint8Array(cap), kind: new Uint8Array(cap), seed: new Uint32Array(cap),
        counts: new Int32Array(CAP_KEYS.length)
      };
    }
    var F_STILL = 1, F_HUMP = 2, F_POP = 4, F_PEARL = 8, F_IDLE = 16;
    buildParticles(caps(state.tier, 1).particles);

    function limitOf(capKey, o) {
      var lim = capKey ? CAPS[capKey] : CAPS.particles;
      if (o && o.max > 0) lim = Math.min(lim, o.max);
      return lim;
    }
    /* spawn one particle from the pure start state `s` at (x, y, z) */
    function addParticle(kindIdx, spec, s, x, y, z, tokens, o) {
      if (P.n >= Math.min(P.cap, CAPS.particles)) return -1;
      /* reduced-motion fades are a few still sparkles: only the pool limits them */
      var ck = spec.cap && !s.still ? CAP_KEYS.indexOf(spec.cap) : 0;
      if (ck > 0 && P.counts[ck] >= limitOf(spec.cap, o)) return -1;
      var i = P.spr.alloc(0, P.cap);
      if (i < 0) return -1;
      P.list[P.n] = i; P.at[i] = P.n; P.n++;
      if (ck > 0) P.counts[ck]++;
      var j = i * 3;
      P.pos[j] = x + s.x; P.pos[j + 1] = y + s.y; P.pos[j + 2] = z + s.z;
      P.org[j] = x; P.org[j + 1] = y; P.org[j + 2] = z;
      P.vel[j] = s.vx; P.vel[j + 1] = s.vy; P.vel[j + 2] = s.vz;
      P.age[i] = 0; P.life[i] = Math.max(0.05, s.life); P.size[i] = s.size; P.end[i] = s.end;
      P.rot[i] = s.rot; P.spin[i] = s.spin; P.g[i] = s.still ? 0 : spec.g; P.drag[i] = spec.drag; P.a0[i] = s.alpha;
      P.swA[i] = s.swayA; P.swHz[i] = s.swayHz; P.swPh[i] = s.swayPh; P.flHz[i] = s.flipHz; P.flPh[i] = s.flipPh;
      P.twHz[i] = s.twHz; P.twPh[i] = s.twPh; P.tmr[i] = 0;
      P.cell[i] = ATL[s.cell] != null ? ATL[s.cell] : 0;
      P.mode[i] = (s.glow ? 1 : 0) | (s.flat ? 2 : 0);
      P.beh[i] = s.still ? BEH.none : (BEH[spec.beh] || 0);
      P.capK[i] = ck; P.kind[i] = kindIdx;
      P.flags[i] = (s.still ? F_STILL : 0) | (s.hump ? F_HUMP : 0) | (s.pop ? F_POP : 0) |
        ((spec.pearl || (o && o.pearl)) && !s.still ? F_PEARL : 0) | (o && o.idle ? F_IDLE : 0);
      /* colour */
      var c;
      if (o && o.color) c = colorOf(o.color);
      else if (o && o.token) c = colorOf(o.token);
      else if (s.tok < 0) c = memberC;
      else c = colorOf(tokens[s.tok % tokens.length]);
      P.rgb[j] = c.r; P.rgb[j + 1] = c.g; P.rgb[j + 2] = c.b;
      writeParticle(i);
      return i;
    }
    function killAt(listPos) {
      var i = P.list[listPos], last = P.n - 1;
      if (listPos !== last) { var mv = P.list[last]; P.list[listPos] = mv; P.at[mv] = listPos; }
      P.n = last;
      if (P.capK[i] > 0) P.counts[P.capK[i]]--;
      P.spr.release(i);
    }
    function writeParticle(i) {
      var j = i * 3, age = P.age[i], life = P.life[i], fl = P.flags[i];
      var x = P.pos[j], y = P.pos[j + 1], z = P.pos[j + 2];
      if (P.swA[i] > 0) {
        var w = TAU * P.swHz[i] * age + P.swPh[i];
        x += P.swA[i] * Math.sin(w); z += P.swA[i] * 0.6 * Math.cos(w * 0.8);
      }
      var a = alphaAt(age, life, P.a0[i], P.twHz[i], P.twPh[i], fl & F_HUMP);
      var size = sizeAt(age, life, P.size[i], P.end[i], fl & F_POP, (fl & F_HUMP) && !(fl & F_STILL) ? 1 : 0);
      if (fl & F_PEARL) {
        holoAt(age, P.twPh[i] / TAU, _ho);
        _col.copy(HOLO[_ho.i]).lerp(HOLO[_ho.j], _ho.k);
      } else _col.setRGB(P.rgb[j], P.rgb[j + 1], P.rgb[j + 2]);
      if (P.beh[i] === BEH.track) { a = P.a0[i]; size = P.size[i]; }     /* the bubble track owns both */
      else if (P.beh[i] === BEH.flight && age < P.dly[i]) a = 0;         /* waiting for its delay */
      P.spr.write(i, x, y, z, flipAt(age, P.flHz[i], P.flPh[i]), _col, a, size, P.rot[i], P.cell[i], P.mode[i]);
    }

    /* the emit core: kind index + position + count + (scratch-safe) opts */
    function emitAt(kind, x, y, z, n, o) {
      var k = kindOf(kind), spec = KINDS[k], kindIdx = KIND_NAMES.indexOf(k);
      var reduced = state.reduced || !!(o && o.reduced);
      var count = emitCount(k, n, reduced);
      if (!count) return 0;
      /* copy the opts we use into the scratch block (never keep the caller's object) */
      var tmpMember = !!(o && typeof o.member === 'string' && setMemberTmp(o.member));
      _eo.reduced = reduced;
      _eo.hasMember = tmpMember || !!state.member;
      _eo.memberShare = o && o.memberShare != null ? +o.memberShare : (fxConst().confettiMemberShare != null ? fxConst().confettiMemberShare : null);
      _eo.cell = o && typeof o.cell === 'string' ? o.cell : null;
      _eo.size = o && o.size > 0 ? o.size : 0;
      _eo.radius = o && o.radius > 0 ? o.radius : 0;
      _eo.life = o && o.life > 0 ? o.life : 0;
      _eo.speed = o && o.speed > 0 ? o.speed : 0;
      _eo.up = o && o.up > 0 ? o.up : 0;
      _eo.basis = spec.spread === 'disc' ? cameraBasis(_basis) : null;
      _eo.dir = null; _eo.cone = 0; _eo.dirSpeed = null;
      if (o && o.dir && !reduced) {
        _dir[0] = +o.dir[0] || 0; _dir[1] = +o.dir[1] || 0; _dir[2] = +o.dir[2] || 0;
        _eo.dir = _dir; _eo.cone = o.cone > 0 ? o.cone : 0.35;
        if (o.dirSpeed) { _dirSpeed[0] = o.dirSpeed[0]; _dirSpeed[1] = o.dirSpeed[1]; _eo.dirSpeed = _dirSpeed; }
      }
      var tokens = o && Array.isArray(o.tokens) && o.tokens.length ? o.tokens : tokenList(spec);
      _pick.color = o && o.color ? o.color : null;
      _pick.token = o && !o.color && o.token ? o.token : null;
      _pick.max = o && o.max > 0 ? o.max : 0;
      _pick.idle = !!(o && o.idle);
      _pick.pearl = !!(o && o.pearl);
      var pick = _pick.color || _pick.token || _pick.max || _pick.idle || _pick.pearl ? _pick : null;
      var seed = o && o.seed != null ? (o.seed >>> 0) : 0;
      var useTrack = spec.beh === 'track' && o && o.seed != null && !!(Mo && Mo.bubbleTrack);
      /* a flight needs its target (copied: the caller's object is never kept) */
      var fly = spec.beh === 'flight' && !reduced && !!(o && o.to) && readPos(o.to, _to);
      var flyDelay = fly && o.delay > 0 ? +o.delay : 0, flyDur = fly && o.dur > 0 ? +o.dur : 0.5;
      var made = 0;
      for (var i = 0; i < count; i++) {
        spawn(spec, i, count, rnd, _eo, _sp);
        if (useTrack && !reduced) _sp.life = 3.2;                 /* the track decides when it pops */
        if (fly) _sp.life = flyDelay + flyDur;
        var idx = addParticle(kindIdx, spec, _sp, x, y, z, tokens, pick);
        if (idx < 0) break;
        made++;
        if (spec.beh === 'track') {
          P.seed[idx] = (seed + Math.imul(i + 1, 2654435761)) >>> 0;
          if (!useTrack && P.beh[idx] === BEH.track) P.beh[idx] = BEH.none;
          if (P.beh[idx] === BEH.track) { P.a0[idx] = 0; writeParticle(idx); }     /* shown from the first step */
        }
        if (spec.beh === 'orbit') P.tmr[idx] = (i / count) * TAU;
        if (spec.beh === 'flight') {
          if (!fly && P.beh[idx] === BEH.flight) P.beh[idx] = BEH.none;           /* no target: a still sparkle */
          if (P.beh[idx] === BEH.flight) {
            var jj = idx * 3;
            P.tgt[jj] = _to.x; P.tgt[jj + 1] = _to.y; P.tgt[jj + 2] = _to.z;
            P.dly[idx] = flyDelay; P.tmr[idx] = 0;
            writeParticle(idx);
          }
        }
      }
      if (tmpMember) { memberC.copy(_memberSave); }
      if (spec.extra && !reduced && made) emitAt(spec.extra, x, y, z, spec.extraN || 2, null);
      return made;
    }
    /* a per-emit member colour (opts.member) without touching the stored one */
    function setMemberTmp(hex) {
      if (!/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(hex)) return false;
      _memberSave.copy(memberC); memberC.copy(colorOf(hex));
      return true;
    }
    /* the camera's right / up vectors (world) for rings that face the viewer */
    function cameraBasis(out) {
      var cam = state.camera;
      if (!cam) { out.rx = 1; out.ry = 0; out.rz = 0; out.ux = 0; out.uy = 1; out.uz = 0; return out; }
      var e = cam.matrixWorld.elements;
      var rl = Math.sqrt(e[0] * e[0] + e[1] * e[1] + e[2] * e[2]) || 1, ul = Math.sqrt(e[4] * e[4] + e[5] * e[5] + e[6] * e[6]) || 1;
      out.rx = e[0] / rl; out.ry = e[1] / rl; out.rz = e[2] / rl;
      out.ux = e[4] / ul; out.uy = e[5] / ul; out.uz = e[6] / ul;
      return out;
    }
    /* any accepted position form → _v (false when unusable) */
    function readPos(p, out) {
      if (!p) return false;
      if (p.isObject3D) { p.getWorldPosition(out); return true; }
      if (p.isVector3) { out.copy(p); return true; }
      if (Array.isArray(p) || (typeof p === 'object' && typeof p.length === 'number' && p.length >= 3)) { out.set(+p[0] || 0, +p[1] || 0, +p[2] || 0); return true; }
      if (typeof p.x === 'number') { out.set(p.x, +p.y || 0, +p.z || 0); return true; }
      return false;
    }
    function emit(kind, worldPos, n, o) {
      if (state.disposed) return 0;
      if (kind === 'emote') { emote(worldPos, o && (o.kind || o.emote) || 'heart'); return 1; }
      if (!readPos(worldPos, _v)) return 0;
      try { return emitAt(kind, _v.x, _v.y, _v.z, n, o); } catch (e) { note('emit ' + kind, e); return 0; }
    }
    /* a particle never breaks the island: problems only reach the stage's QA log */
    function note(where, e) {
      if (SL3D && SL3D.issues && typeof SL3D.issues.push === 'function') SL3D.issues.push('fx3d ' + where + ': ' + (e && e.message ? e.message : e));
    }

    /* ---------------- the frame step ---------------- */
    function stepParticles(dt) {
      for (var p = P.n - 1; p >= 0; p--) {
        var i = P.list[p];
        var age = P.age[i] + dt;
        P.age[i] = age;
        var beh = P.beh[i], j = i * 3;
        if (beh === BEH.track) {
          Mo.bubbleTrack(age, P.seed[i], _bt);
          if (_bt.popped || age > 3.2) { popBubble(i); killAt(p); continue; }
          P.pos[j] = P.org[j] + _bt.x; P.pos[j + 1] = P.org[j + 1] + _bt.y - 0.35; P.pos[j + 2] = P.org[j + 2] + _bt.z;
          P.size[i] = _bt.r * 2.6; P.a0[i] = Math.min(1, _bt.a * 2);     /* the bubble cell's ring is 0.39 of the quad */
        } else if (age >= P.life[i]) {
          if (P.kind[i] === KIND_BUBBLE && !(P.flags[i] & F_STILL)) popBubble(i);
          killAt(p);
          continue;
        } else if (beh === BEH.orbit) {
          var orb = KINDS.dizzy.orbit, ang = P.tmr[i] + TAU * safeHz(orb[1]) * age;
          P.pos[j] = P.org[j] + Math.cos(ang) * orb[0]; P.pos[j + 1] = P.org[j + 1] + 0.03 * Math.sin(TAU * age);
          P.pos[j + 2] = P.org[j + 2] + Math.sin(ang) * orb[0];
        } else if (beh === BEH.flight) {
          flightAt(age, P.dly[i], P.life[i], P.org, j, P.tgt, j, _fl);
          P.pos[j] = _fl.x; P.pos[j + 1] = _fl.y; P.pos[j + 2] = _fl.z;
          if (age >= P.dly[i] && _fl.f < 1) {
            P.tmr[i] += dt;
            if (P.tmr[i] >= 0.045) { P.tmr[i] = 0; emitAt('trail', _fl.x, _fl.y, _fl.z, 1, null); }
          }
        } else if (!(P.flags[i] & F_STILL)) {
          integrate(P.pos, P.vel, i, P.g[i], P.drag[i], dt);
          if (beh === BEH.shell) {
            P.tmr[i] += dt;
            if (P.tmr[i] >= 0.045) { P.tmr[i] = 0; emitAt('trail', P.pos[j], P.pos[j + 1], P.pos[j + 2], 1, null); }
          }
        }
        P.rot[i] += P.spin[i] * dt;
        writeParticle(i);
      }
    }
    var KIND_BUBBLE = KIND_NAMES.indexOf('bubble');
    /* a bubble that reaches the end of its rise pops into a tiny glint (idle bubbles just fade) */
    function popBubble(i) {
      if (P.flags[i] & F_IDLE) return;
      var j = i * 3;
      emitAt('glint', P.pos[j], P.pos[j + 1], P.pos[j + 2], 1, _popOpt);
    }

    /* ================================================================
       MARKS — keyed persistent sprites (decals, controller sprites) + emote bubbles
       ================================================================ */
    var MK = new Sprites(MARK_CAP + EMOTE_CAP * EMOTE_SLOTS, 'fx3d:marks', 4);
    group.add(MK.mesh);
    var marks = new Map();
    function markSet(key, on, pos, o) {
      if (state.disposed || key == null) return false;
      key = String(key);
      var k = marks.get(key);
      if (!on) {
        if (k != null) { MK.release(k); marks.delete(key); }
        return true;
      }
      if (!readPos(pos, _v)) return false;
      if (k == null) {
        k = MK.alloc(0, MARK_CAP);
        if (k < 0) return false;
        marks.set(key, k);
      }
      o = o || NOOPT;
      var c = colorOf(o.color || o.token || 'Cloud White');
      var mode = (o.glow === false ? 0 : 1) | (o.flat ? 2 : 0);
      var cell = typeof o.cell === 'number' ? o.cell : (ATL[o.cell] != null ? ATL[o.cell] : ATL.dot);
      MK.write(k, _v.x, _v.y + (o.flat ? 0.012 : 0), _v.z, 1, c, o.alpha != null ? clamp01(o.alpha) : 1,
        o.size > 0 ? o.size : 0.4, o.rot || 0, cell, mode);
      return true;
    }
    var DECAL = fxConst().decal || FX_FALLBACK.decal;
    var _decalOpt = { cell: 'dot', token: null, size: 0, alpha: 0, glow: true, flat: true };
    function decal(key, on, pos, token) {
      _decalOpt.token = token || 'Lamp Warm';
      _decalOpt.size = (DECAL.r || 0.7) * 2 / 0.875;      /* the dot cell's gradient ends at 7/8 of its half */
      _decalOpt.alpha = DECAL.opacity != null ? DECAL.opacity : 0.35;
      return markSet('decal:' + key, on, pos, _decalOpt);
    }

    /* emotes: a white bubble, a small tail and the icon, in fixed slots so the icon draws on top */
    var EM = { alive: new Uint8Array(EMOTE_CAP), t: new Float32Array(EMOTE_CAP), cell: new Uint8Array(EMOTE_CAP),
      spin: new Uint8Array(EMOTE_CAP), pos: new Float32Array(EMOTE_CAP * 3), target: new Array(EMOTE_CAP), color: [] };
    for (var ei = 0; ei < EMOTE_CAP; ei++) { EM.color.push(new T.Color()); EM.target[ei] = null; }
    var emoteN = 0, emoteNext = 0, WHITE = new T.Color(1, 1, 1);
    function emote(worldPos, kind) {
      if (state.disposed) return -1;
      var target = worldPos && worldPos.isObject3D ? worldPos : null;
      if (!target && !readPos(worldPos, _v)) return -1;
      var e = -1, k;
      for (k = 0; k < EMOTE_CAP; k++) if (!EM.alive[k]) { e = k; break; }
      if (e < 0) { e = emoteNext; emoteNext = (emoteNext + 1) % EMOTE_CAP; }      /* recycle the oldest */
      var spec = EMOTES[emoteOf(kind)];
      if (!EM.alive[e]) emoteN++;
      EM.alive[e] = 1; EM.t[e] = 0; EM.cell[e] = ATL[spec.cell] != null ? ATL[spec.cell] : 1; EM.spin[e] = spec.spin ? 1 : 0;
      EM.color[e].copy(colorOf(spec.token));
      EM.target[e] = target;
      if (!target) { EM.pos[e * 3] = _v.x; EM.pos[e * 3 + 1] = _v.y; EM.pos[e * 3 + 2] = _v.z; }
      var base = MARK_CAP + e * EMOTE_SLOTS;
      for (k = 0; k < EMOTE_SLOTS; k++) { MK.alive[base + k] = 1; if (base + k + 1 > MK.hi) MK.hi = base + k + 1; }
      cameraBasis(_basis);
      writeEmote(e);
      return e;
    }
    function freeEmote(e) {
      EM.alive[e] = 0; EM.target[e] = null; emoteN--;
      var base = MARK_CAP + e * EMOTE_SLOTS;
      for (var k = 0; k < EMOTE_SLOTS; k++) MK.release(base + k);
    }
    function writeEmote(e) {
      var tr = emoteTrack(EM.t[e], state.reduced, _et), j = e * 3, x, y, z;
      if (EM.target[e]) { EM.target[e].getWorldPosition(_v2); x = _v2.x; y = _v2.y; z = _v2.z; }
      else { x = EM.pos[j]; y = EM.pos[j + 1]; z = EM.pos[j + 2]; }
      y += 0.28 + tr.dy;
      var s = tr.scale, a = tr.alpha, base = MARK_CAP + e * EMOTE_SLOTS, B = _basis;
      var rot = EM.spin[e] && !state.reduced ? TAU * 0.5 * EM.t[e] : 0;      /* a dizzy star turns at 0.5 rev/s */
      /* the tail hangs below-left of the bubble on screen (camera right / up) */
      var tx = -0.05 * s, ty = -0.16 * s;
      MK.write(base, x, y, z, 1, WHITE, a * 0.94, 0.38 * s, 0, ATL.circle, 0);
      MK.write(base + 1, x + B.rx * tx + B.ux * ty, y + B.ry * tx + B.uy * ty, z + B.rz * tx + B.uz * ty, 1, WHITE,
        a * 0.94, 0.13 * s, PI, ATL.tri, 0);
      MK.write(base + 2, x, y, z, 1, EM.color[e], a, 0.24 * s, rot, EM.cell[e], 0);
    }
    function stepEmotes(dt) {
      if (!emoteN) return;
      cameraBasis(_basis);
      for (var e = 0; e < EMOTE_CAP; e++) {
        if (!EM.alive[e]) continue;
        EM.t[e] += dt;
        if (emoteTrack(EM.t[e], state.reduced, _et).done) { freeEmote(e); continue; }
        writeEmote(e);
      }
    }

    /* ================================================================
       HALOS — the kit's billboard pool with the Showtime link (K.setShow)
       ================================================================ */
    var halos = K.billboards({ capacity: HALO_CAP, texture: 'halo', show: true, additive: true, name: 'fx3d:halos', renderOrder: 5 });
    group.add(halos.mesh);
    var haloSlots = new Map();
    var HALO_SIZE = fxConst().haloSize || FX_FALLBACK.haloSize;
    function halo(key, on, pos, sizeU, token) {
      if (state.disposed || key == null) return false;
      key = String(key);
      var k = haloSlots.get(key);
      if (!on) {
        if (k != null) { halos.free(k); haloSlots.delete(key); halos.commit(); }
        return true;
      }
      if (!readPos(pos, _v)) return false;
      if (k == null) {
        k = halos.alloc();
        if (k < 0) return false;
        haloSlots.set(key, k);
      }
      var size = sizeU > 0 ? clamp(sizeU, HALO_SIZE[0] * 0.5, HALO_SIZE[1] * 1.5) : 0.8;
      halos.set(k, _v.x, _v.y, _v.z, size, colorOf(token || 'Lamp Halo'), 1, 0, 0);
      halos.commit();
      return true;
    }

    /* ================================================================
       SHOWS — confetti cannons, streamers, fireworks (a small fixed queue)
       ================================================================ */
    var Q = { n: 0, t: new Float32Array(QUEUE_CAP), type: new Uint8Array(QUEUE_CAP), x: new Float32Array(QUEUE_CAP),
      y: new Float32Array(QUEUE_CAP), z: new Float32Array(QUEUE_CAP), a: new Float32Array(QUEUE_CAP), b: new Float32Array(QUEUE_CAP) };
    var Q_SHELL = 1, Q_BURST = 2;
    function enqueue(type, at, x, y, z, a, b) {
      if (Q.n >= QUEUE_CAP) return false;
      var k = Q.n++;
      Q.type[k] = type; Q.t[k] = state.t + at; Q.x[k] = x; Q.y[k] = y; Q.z[k] = z; Q.a[k] = a; Q.b[k] = b;
      return true;
    }
    var _shellSpec = KINDS.shell, KIND_SHELL = KIND_NAMES.indexOf('shell');
    function runQueue() {
      for (var k = Q.n - 1; k >= 0; k--) {
        if (Q.t[k] > state.t) continue;
        var type = Q.type[k], x = Q.x[k], y = Q.y[k], z = Q.z[k], a = Q.a[k], b = Q.b[k];
        var last = --Q.n;
        if (k !== last) {
          Q.t[k] = Q.t[last]; Q.type[k] = Q.type[last]; Q.x[k] = Q.x[last]; Q.y[k] = Q.y[last]; Q.z[k] = Q.z[last];
          Q.a[k] = Q.a[last]; Q.b[k] = Q.b[last];
        }
        if (type === Q_SHELL) launchShell(x, y, z, a, b);
        else if (type === Q_BURST) burst(x, y, z, a | 0);
      }
    }
    /* a shell climbs from (x, y, z) to height `h` above in FW.rise seconds, leaving sparkle trails */
    function launchShell(x, y, z, h, col) {
      spawn(_shellSpec, 0, 1, rnd, NOOPT, _sp);
      _sp.vx = 0; _sp.vz = 0; _sp.vy = h / FW.rise; _sp.life = FW.rise; _sp.x = 0; _sp.z = 0;
      addParticle(KIND_SHELL, _shellSpec, _sp, x, y, z, TOKENS.neon, null);
    }
    /* one burst: an outer ring, a slower inner ring in another colour and a soft glow (never a flash) */
    function burst(x, y, z, colIdx) {
      var big = CAPS.particles >= 256 ? 20 : 14, nn = TOKENS.neon.length;
      _fwOpt.token = TOKENS.neon[colIdx % nn]; _fwOpt.size = 0; _fwOpt.speed = 0;
      emitAt('firework', x, y, z, big, _fwOpt);
      _fwOpt.token = TOKENS.neon[(colIdx + 2) % nn]; _fwOpt.size = 0.13; _fwOpt.speed = 0.5;
      emitAt('firework', x, y, z, Math.round(big * 0.45), _fwOpt);
      _fwOpt.speed = 0;
      _glowOpt.token = TOKENS.neon[colIdx % nn];
      emitAt('glow', x, y, z, 1, _glowOpt);
    }

    function fireworks(o) {
      if (state.disposed) return 0;
      o = o || NOOPT;
      var at = null;
      if (o.at && readPos(o.at, _v)) { _atArr[0] = _v.x; _atArr[1] = _v.y; _atArr[2] = _v.z; at = _atArr; }
      var plan = fireworkPlan(o.n || (fxConst().fireworkRings || 3), at, o.height);
      for (var k = 0; k < plan.length; k++) {
        var f = plan[k];
        if (state.reduced) { _fwOpt.token = TOKENS.neon[f.col]; _fwOpt.size = 0; emitAt('firework', f.bx, f.by, f.bz, 12, _fwOpt); continue; }
        enqueue(Q_SHELL, f.t, f.sx, f.sy, f.sz, f.by - f.sy, f.col);
        enqueue(Q_BURST, f.t + FW.rise, f.bx, f.by, f.bz, f.col, 0);
      }
      return plan.length;
    }

    /* camera facts for the screen-edge cannons and the streamer curtain */
    var _cam = { px: 0, py: 0, pz: 0, rx: 1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0, fx: 0, fy: 0, fz: -1, fov: 30, aspect: 1 };
    function camFacts() {
      var cam = state.camera;
      if (!cam) return null;
      cam.updateMatrixWorld();
      var e = cam.matrixWorld.elements;
      cameraBasis(_basis);
      _cam.px = e[12]; _cam.py = e[13]; _cam.pz = e[14];
      _cam.rx = _basis.rx; _cam.ry = _basis.ry; _cam.rz = _basis.rz; _cam.ux = _basis.ux; _cam.uy = _basis.uy; _cam.uz = _basis.uz;
      var fl = Math.sqrt(e[8] * e[8] + e[9] * e[9] + e[10] * e[10]) || 1;
      _cam.fx = -e[8] / fl; _cam.fy = -e[9] / fl; _cam.fz = -e[10] / fl;
      _cam.fov = cam.isPerspectiveCamera ? cam.fov : 30; _cam.aspect = cam.aspect || 1;
      return _cam;
    }
    function viewDist(cf) {
      /* a little in front of the island: 55 % of the way to the world origin, within 4..18 u */
      var d = Math.sqrt(cf.px * cf.px + cf.py * cf.py + cf.pz * cf.pz);
      return clamp(d * 0.55, 4, 18);
    }
    function confetti(o) {
      if (state.disposed) return 0;
      o = o || NOOPT;
      var tierMul = CAPS.particles >= 256 ? 1 : 0.7, made = 0;
      _conOpt.member = typeof o.member === 'string' ? o.member : null;
      _conOpt.tokens = Array.isArray(o.tokens) && o.tokens.length ? o.tokens : null;
      _conOpt.dir = null; _conOpt.dirSpeed = null; _conOpt.size = 0;
      if (o.at && readPos(o.at, _v)) {
        var bx = _v.x, by = _v.y, bz = _v.z;
        made += emitAt('confetti', bx, by, bz, o.n > 0 ? o.n : Math.round(40 * tierMul), _conOpt);
        if (o.streamers) made += emitAt('streamer', bx, by + 1.2, bz, Math.round(6 * tierMul), _conOpt);
        return made;
      }
      var cf = camFacts(), n = o.n > 0 ? o.n : Math.round(90 * tierMul), half = Math.ceil(n / 2);
      /* both cannons get the same share of what the caps leave (streamers count as confetti) */
      var budget = state.reduced ? n : Math.max(0, Math.min(CAPS.confetti - P.counts[1], Math.min(P.cap, CAPS.particles) - P.n));
      var strPer = o.streamers === false || state.reduced ? 0 : Math.min(Math.round(5 * tierMul), Math.floor(budget * 0.06));
      var conPer = Math.min(half, Math.floor((budget - 2 * strPer) / 2));
      for (var side = -1; side <= 1; side += 2) {
        var ox, oy, oz;
        if (cf) {
          var plan = cannonPlan(side, cf, viewDist(cf));
          ox = plan.origin[0]; oy = plan.origin[1]; oz = plan.origin[2];
          _conOpt.dir = plan.dir;
        } else {
          ox = side * 7; oy = 0.5; oz = 4;
          _cannonDir[0] = -side * 0.45; _cannonDir[1] = 0.88; _cannonDir[2] = -0.15;
          _conOpt.dir = _cannonDir;
        }
        _conOpt.dirSpeed = CANNON_SPEED;
        if (conPer > 0) made += emitAt('confetti', ox, oy, oz, conPer, _conOpt);
        if (strPer > 0) { _conOpt.dirSpeed = STREAMER_SPEED; made += emitAt('streamer', ox, oy, oz, strPer, _conOpt); }
      }
      return made;
    }
    /* a curtain of curly ribbons released just above the top of the view */
    function streamers(o) {
      if (state.disposed) return 0;
      o = o || NOOPT;
      _strOpt.member = typeof o.member === 'string' ? o.member : null;
      _strOpt.tokens = Array.isArray(o.tokens) && o.tokens.length ? o.tokens : null;
      var n = o.n > 0 ? o.n : (CAPS.particles >= 256 ? 16 : 9), made = 0, cf = camFacts();
      for (var k = 0; k < n; k++) {
        var u = (k + 0.5) / n * 2 - 1;
        if (cf) {
          var d = viewDist(cf) * 0.75, hh = Math.tan(cf.fov * PI / 360) * d, hw = hh * cf.aspect;
          var x = cf.px + cf.fx * d + cf.rx * u * hw * 0.95 + cf.ux * hh * 1.05;
          var y = cf.py + cf.fy * d + cf.ry * u * hw * 0.95 + cf.uy * hh * 1.05;
          var z = cf.pz + cf.fz * d + cf.rz * u * hw * 0.95 + cf.uz * hh * 1.05;
          made += emitAt('streamer', x, y, z, 1, _strOpt);
        } else made += emitAt('streamer', u * 6.5, 6.5, (k % 3 - 1) * 1.6, 1, _strOpt);
      }
      return made;
    }

    /* ================================================================
       SHAKE — applied to camera.position after the rig, undone next frame
       ================================================================ */
    var SHAKE = fxConst().shake || FX_FALLBACK.shake;
    var shakeS = { on: false, t: 0, amp: 0, dur: 0, seed: 0, applied: false, cam: null };
    var shOff = new T.Vector3(), shAfter = new T.Vector3();
    function shake(amp, dur) {
      if (state.disposed || state.reduced) return false;
      amp = clamp(amp > 0 ? amp : SHAKE.amp, 0, 0.2); dur = clamp(dur > 0 ? dur : SHAKE.dur, 0.05, 1);
      if (shakeS.on && shakeS.amp * (1 - shakeS.t / shakeS.dur) > amp) return true;   /* a stronger one is running */
      shakeS.on = true; shakeS.t = 0; shakeS.amp = amp; shakeS.dur = dur; shakeS.seed = (rnd() * 4294967296) >>> 0;
      return true;
    }
    function unshake() {
      if (shakeS.applied && shakeS.cam && shakeS.cam.position.equals(shAfter)) {
        shakeS.cam.position.sub(shOff);
        shakeS.cam.updateMatrixWorld();
      }
      shakeS.applied = false; shakeS.cam = null;
    }
    function stepShake(dt, camera) {
      if (!shakeS.on && !shakeS.applied) return;
      unshake();
      if (!shakeS.on) return;
      shakeS.t += dt;
      if (shakeS.t >= shakeS.dur || state.reduced) { shakeS.on = false; return; }
      if (!camera || !camera.position) return;
      shakeOffset(shakeS.t, shakeS.amp, shakeS.dur, shakeS.seed, state.reduced, _sh);
      cameraBasis(_basis);
      shOff.set(_basis.rx * _sh.x + _basis.ux * _sh.y, _basis.ry * _sh.x + _basis.uy * _sh.y + _sh.z * 0.3, _basis.rz * _sh.x + _basis.uz * _sh.y);
      camera.position.add(shOff);
      camera.updateMatrixWorld();
      shAfter.copy(camera.position);
      shakeS.applied = true; shakeS.cam = camera;
    }

    /* ================================================================
       public API
       ================================================================ */
    function update(dt, camera) {
      if (state.disposed) return false;
      dt = dt > 0 ? Math.min(dt, 0.1) : 0;
      if (camera && camera.isCamera) state.camera = camera;
      state.t += dt;
      try {
        if (Q.n) runQueue();
        stepParticles(dt);
        stepEmotes(dt);
        stepShake(dt, state.camera);
      } catch (e) {
        note('update', e);
        clear();
      }
      P.spr.flush();
      MK.flush();
      return P.n > 0 || emoteN > 0 || Q.n > 0 || shakeS.on;
    }
    function setTier(t) {
      var tt = parseTier(t);
      if (!tt || state.disposed) return state.tier;
      state.tier = tt;
      CAPS = caps(tt, state.scale);
      var full = caps(tt, 1).particles;
      if (full !== P.cap) { buildParticles(full); }
      return tt;
    }
    function setQuality(q) {
      if (!q || state.disposed) return;
      var s = q.particleScale > 0 ? q.particleScale : 1;
      if (s !== state.scale) { state.scale = s; CAPS = caps(state.tier, s); }
    }
    var unsubQ = SL3D && typeof SL3D.onQuality === 'function' ? SL3D.onQuality(function (q) { setQuality(q); }) : null;
    function setReduced(on) {
      on = !!on;
      if (on === state.reduced) return;
      state.reduced = on;
      if (on) {
        /* settle what is flying: freeze it and let it fade within 0.4 s */
        for (var p = 0; p < P.n; p++) {
          var i = P.list[p];
          P.flags[i] |= F_STILL; P.beh[i] = BEH.none; P.spin[i] = 0; P.swA[i] = 0; P.flHz[i] = 0;
          P.life[i] = Math.min(P.life[i], P.age[i] + 0.4);
        }
        Q.n = 0;
        shakeS.on = false; unshake();
      }
    }
    function clear() {
      for (var p = P.n - 1; p >= 0; p--) killAt(p);
      P.spr.clear(); P.counts.fill(0);
      for (var e = 0; e < EMOTE_CAP; e++) if (EM.alive[e]) freeEmote(e);
      Q.n = 0;
    }
    function info() {
      return {
        tier: state.tier, capacity: P.cap, limit: Math.min(P.cap, CAPS.particles), alive: P.n,
        counts: { confetti: P.counts[1], bubbles: P.counts[2], petals: P.counts[3], snow: P.counts[4] },
        caps: CAPS, halos: haloSlots.size, marks: marks.size, emotes: emoteN, queued: Q.n, shaking: shakeS.on,
        reduced: state.reduced, instances: P.spr.hi + MK.hi
      };
    }
    function dispose() {
      if (state.disposed) return;
      shakeS.on = false; unshake();
      state.disposed = true;
      if (unsubQ) { try { unsubQ(); } catch (e) {} }
      P.spr.dispose(); MK.dispose();
      halos.dispose();
      haloSlots.clear(); marks.clear();
      for (var e = 0; e < EMOTE_CAP; e++) EM.target[e] = null;
      if (group.parent) group.parent.remove(group);
      colCache.clear();
    }

    if (opts.scene && typeof opts.scene.add === 'function') opts.scene.add(group);

    var fx = {
      group: group,
      emit: emit, halo: halo, decal: decal, mark: markSet,
      confetti: confetti, streamers: streamers, fireworks: fireworks, emote: emote, shake: shake,
      update: update, setTier: setTier, setQuality: setQuality, setReduced: setReduced, setMember: setMember,
      clear: clear, info: info, dispose: dispose,
      shakeOffset: function (out) { out = out || new T.Vector3(); return shakeS.applied ? out.copy(shOff) : out.set(0, 0, 0); },
      get reduced() { return state.reduced; },
      get tier() { return state.tier; }
    };
    return fx;
  }

  var api = {
    VERSION: VERSION, MAX_FLASH_HZ: MAX_FLASH_HZ, create: create,
    /* data (read-only use) */
    KINDS: KINDS, ALIAS: ALIAS, EMOTES: EMOTES, TOKENS: TOKENS, ATLAS: ATLAS, FW: FW, PEARL_HZ: PEARL_HZ,
    EMOTE_SEC: EMOTE_SEC, EMOTE_REDUCED_SEC: EMOTE_REDUCED_SEC, MARK_CAP: MARK_CAP, EMOTE_CAP: EMOTE_CAP, HALO_CAP: HALO_CAP,
    /* pure helpers */
    kindOf: kindOf, emoteOf: emoteOf, caps: caps, emitCount: emitCount, spawn: spawn, coneVelocity: coneVelocity,
    alphaAt: alphaAt, sizeAt: sizeAt, flipAt: flipAt, integrate: integrate, holoAt: holoAt, emoteTrack: emoteTrack, flightAt: flightAt,
    FLIGHT_ARC: FLIGHT_ARC,
    shakeOffset: shakeOffset, fireworkPlan: fireworkPlan, cannonPlan: cannonPlan, rng: rng, safeHz: safeHz,
    SHADERS: { SPRITE_VERT: SPRITE_VERT, SPRITE_FRAG: SPRITE_FRAG }
  };

  /* the stage registry: SL3D.makeFx(opts) → create(K, SL3D, opts) once the stage is ready */
  if (root && root.SL3D && typeof root.SL3D.defineApi === 'function') {
    try {
      root.SL3D.defineApi('makeFx', function (K, S) { return function (o) { o = o || {}; return create(o.K || K, S, o); }; });
    } catch (e) { /* the stage logs its own issues */ }
  }
  return api;
}));
