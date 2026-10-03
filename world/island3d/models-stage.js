/* ================================================================
   My Island 3D — city buildings II: the Dance Studio, the Rooftop Hangout
   and the Concert Stage (Encore City v2, chunk B7; classic script).
   Registers SL3D.defineModels('stage', factory(K, SL3D)). Geometry comes
   from the K.G kit, colours from SLIslandLook.LOOK tokens (never a raw hex;
   the child's member colour is the one runtime colour), timelines from
   SLMotion. THREE is only touched through K.THREE (the LED wall's uv
   attribute and the beams' blending constant). In Node, module.exports
   gives the factory and the pure helpers (tests/island-models-stage.test.js).

   Item space (kit.js): pivot at the footprint centre, base y = 0, facing +z
   (the camera side); every part stays inside the footprint less 0.07 u. The
   one exception is the stage's crowd, which stands in the stage's entrance
   row (the crowd pit) and is only shown while the encore runs. Buildings are
   never jittered. Trims: SLIslandLook.trimOf(id, st.variant) → {accent
   (@member | Neon Magenta | LED Cyan), signSide (L | R), stripe (A | B | C)}.

   bld_dance   Dance Studio, 2×2, h 2.25, act 'dance' (pivot 'floor')
     parts  shell (toon) · glass (smoked: the storefront and side slits) · mirror
            (chrome: the mirror-glass upper front and the door pulls) · floor
            (state, per copy, pivot 'floor': the 3×2 light-up deck, 5 LED fins
            in the trim accent, the neon sneaker pictogram, canopy downlights,
            the cove strip) · speaker (toon, pivot 'speaker', opposite the sign)
     trims  sign side; stripe A even fins, B fins grouped 2-1-2, C fins rising
            toward the sign
     act    the deck chases on the beat (each tile lights once per 4 beats, hues
            step every 2 beats), the speakers pump ≤ 6 %, 3 notes;
            pets.perform('studio') gathers the crew on the entrance cells
     show   a static pastel deck at golden hour, a neon chase at Showtime; the
            cove and downlights warm to Holo Pink; a Neon Magenta halo on the sign
   bld_rooftop Rooftop Hangout, 2×2, h 2.3, act 'hangout' (pivot 'deck')
     parts  shell (toon: brick block, course bands, roller door, switchback
            stair, teak deck, tripod, potted palm, the ✦ mural) · lights (state,
            per copy, pivot 'bulbs': 9 Edison bulbs, the windows, the smoked
            glass balustrade, the accent LED lines) · deck (toon, pivot 'deck':
            two beanbags) · scope (toon, pivot 'scope': the telescope, aimed at
            the city across the bay)
     trims  mural side; stripe A cornice LED, B corner LEDs, C door + cornice LEDs
     act    the scope swings 40° to the sky, the beanbags squish, the bulbs
            brighten in a 0.8 Hz wave (≤ ±35 %), stars at 2.2 s;
            pets.perform('roof') hops the pet to the 'roof' seat on a beanbag
     show   windows switch to Window Warm one by one (each once per ramp), the
            bulbs warm up, festoon halos and a violet up-light on the mural
   bld_stage   Concert Stage, 3×2, h 2.45, act 'encore' (pivot 'lights')
     parts  shell (toon: deck, skirt, steps, box-truss arch, speakers, floor
            monitors, mic stand, DJ booth) · wall (led, per copy, pivot
            'lights': the 2.2 × 1.1 LED wall as 8 strips with their own uv) ·
            lights (state, per copy: 8 footlights, the LED Cyan edge, the
            accent strips and the 4 moving heads) · beams (per copy, additive
            at alpha ≤ 0.18 through this model's material hook) · crowd
            (state, per copy, pivot 'crowd': 12 hooded silhouettes with ✦ sticks)
     pivots head0–head3 are the moving heads' frames (their hanging points on
            the truss); the heads and beams are per-copy geometry posed on the
            CPU about those origins, so four heads cost no extra draw calls.
            The template's rest pose is the hidden state: the crowd and the beams
            are collapsed (their authored positions live in the template meta),
            so placement ghosts, drop-ins and photocards never show them
     anchors cone0–cone2 (the Showtime cone mounts on the truss), spot, deck,
            mark0–mark3 (the crew's marks), stepL/stepR, pit, foot
     trims  DJ-booth and mic side; stripe A vertical skirt slats, B chevrons,
            C bands; the accent on the truss strips, the booth and some sticks
     act    'sting'; the wall wipes to ENCORE (8 strips, left to right), the
            heads swing to centre stage with their beams, the footlights chase,
            the crowd rises in the pit, confetti from the truss at 2.6 s;
            pets.perform('stage'). The wall holds ENCORE and the crowd stays up
            for the encore (TEMPO.encoreSec from the tap), then both go back.
            The 8 s of Showtime and the music switch are the host's encore
            moment (rewards-world), never this model's.
     show   golden hour: a slow star drift on the wall at 70 %, heads parked,
            no beams. Showtime: the wall rotates ✦ / the child's name / EQ /
            gradient every 8 bars (the name only on the island, never on a
            photocard), heads sweep at 0.12 Hz, beams on, footlights chase
            on the beat, pin-spot halos on the heads

   ACTS (SLMotion 'dance' | 'hangout' | 'encore', 3 s; reduced = the instant end
   state with the motion's reduced cues): one live act per uid; a re-tap restarts
   it and blends from the interrupted pose; cancel rests the pivots; the act owns
   every cue but the controller's tap 'pop'. No act involves points or chance.
   FLASH SAFETY: chases light each LED once per 4 beats (≤ 0.5 Hz at 118 BPM),
   hues step every 2 beats (≤ 1 Hz), beat pulses ≤ 1.97 Hz, the bulb wave 0.8 Hz,
   the head sweep 0.12 Hz, wall program changes ≥ 0.5 s apart and always a moving
   wipe (never a dimming or a full-screen white). Reduced motion freezes all of it.

   HANDLE used: a.uid, a.t, a.beat, a.bar, a.reduced, a.batch (present only on the
   island), a.template, a.pivot(name).set, a.state, a.copyGeometry(part),
   a.basePositions(part), a.halo, a.decal, a.emit, a.sfx, a.pets.perform. Per-copy
   colours, positions and uv are written into the copy's own geometry (perCopy
   parts), only when they change, without allocating.
   HANDLERS: build, idle, act, show, forget(uid), setUser({name, color}) (shared
   by the three; the host calls it on mount and on a profile switch so the trim-0
   accents and the deck's fifth hue take the member colour and the LED wall's name
   program shows the child's name — it also calls K.ledAtlas().setUser), and
   material(matKey, part) on the stage (the additive beam material).
   ================================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    var M = null, L = null, KT = null;
    try { M = require('./motion.js'); } catch (e) { M = null; }
    try { L = require('../world-look.js'); } catch (e) { L = null; }
    try { KT = require('./kit.js'); } catch (e) { KT = null; }
    module.exports = factory(root, M, L, KT);
  } else {
    var api = factory(root, null, null, null);
    var S = root.SL3D;
    if (S && typeof S.defineModels === 'function') S.defineModels('stage', function (K, S3) { return api.factory(K, S3); });
  }
}(typeof self !== 'undefined' ? self : typeof globalThis !== 'undefined' ? globalThis : this, function (root, M0, L0, KIT0) {
  'use strict';

  var VERSION = 1;
  var IDS = ['bld_dance', 'bld_rooftop', 'bld_stage'];
  var ACT = { bld_dance: 'dance', bld_rooftop: 'hangout', bld_stage: 'encore' };
  var PERFORM = { bld_dance: 'studio', bld_rooftop: 'roof', bld_stage: 'stage' };
  var PI = Math.PI, TAU = PI * 2, DEG = PI / 180;
  var NEON4 = ['Neon Magenta', 'LED Cyan', 'Electric Violet', 'Laser Lime'];
  var TRIMS = { accent: ['@member', 'Neon Magenta', 'LED Cyan'], signSide: ['L', 'R'], stripe: ['A', 'B', 'C'] };
  var NONE = Object.freeze([]);

  function mo() { return M0 || root.SLMotion || null; }
  function looks() { return L0 || root.SLIslandLook || null; }
  function kitApi() { return KIT0 || root.SLKit || null; }
  function lookOf(id) { var L = looks(); return (L && L.LOOK && L.LOOK[id]) || null; }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function lerp(a, b, k) { return a + (b - a) * k; }
  function smooth(a, b, x) { var u = clamp01((x - a) / (b - a)); return u * u * (3 - 2 * u); }
  function frac(v) { return v - Math.floor(v); }
  function freezeAll(o) { Object.keys(o).forEach(function (k) { if (o[k] && typeof o[k] === 'object') freezeAll(o[k]); }); return Object.freeze(o); }

  /* ---------------- default colour tokens (= the LOOK entries; the LOOK wins) ---------------- */
  var DEF = {
    bld_dance: { body: 'Concrete', upper: 'Concrete Light', frame: 'Bone White', glass: 'Smoked Glass', mirror: 'Chrome', floor: 'Bone White',
                 fin: '@member', accent: '@member', sign: 'Neon Magenta', speaker: 'Graphite', cone: 'Gunmetal', glow: 'Holo Pink' },
    bld_rooftop: { body: 'Chimney', course: 'Chimney Cap', lintel: 'Concrete Light', glass: 'Smoked Glass', glassGlow: 'Window Warm', frame: 'Gunmetal',
                   door: 'Gunmetal Mid', stair: 'Gunmetal', deck: 'Teak', rail: 'Smoked Glass', beanA: 'Grape', beanB: 'Splash Blue', accent: '@member',
                   bulb: 'Gunmetal Mid', bulbOn: 'Sunset Amber', scope: 'Gunmetal', palm: 'Leaf Deep', pot: 'Concrete', star: 'Star Gold' },
    bld_stage: { deck: 'Night Asphalt', edge: 'LED Cyan', step: 'Graphite', wall: 'Bone White', bezel: 'Midnight Ink', truss: 'Gunmetal',
                 head: 'Graphite', lens: 'Bone White', speaker: 'Graphite', cone: 'Gunmetal', foot: 'Gunmetal Mid', footOn: 'Window Warm', accent: '@member' }
  };

  /* ---------------- timing and flash-safety constants ---------------- */
  var RULES = {
    groups: 4,            /* a chased LED lights once per this many beats (≤ 0.49 Hz at 118 BPM) */
    hueEvery: 2,          /* deck hues step once per this many beats (≤ 0.98 Hz) */
    pump: 0.06,           /* speaker pump: up to +6 % once per beat */
    deckDay: 0.85,        /* the deck's static golden-hour level */
    bulbHz: 0.8, bulbDay: 0.35,
    wipeSec: 0.4,         /* the LED wall's strip wipe */
    screenGap: 0.5,       /* wall program changes at most once per this many s (SLMotion RATE.screen) */
    holdSec: 8,           /* ENCORE + crowd after the tap (TEMPO.encoreSec when the look has it) */
    sinkSec: 0.5, rise: [0.25, 0.65], crowdDrop: 0.36, crowdBob: 0.02,
    sweepHz: 0.12, sweepDeg: 25, parkTilt: 18, sweepTilt: 32,
    beamAlpha: 0.18, wallDay: 0.62, wallShow: 1,
    showBars: 8,          /* the wall's Showtime program changes every 8 bars */
    nightOn: 0.35         /* halos and the up-light switch on past this Showtime mix */
  };
  (function () {
    var L = looks(), st = L && L.LOOK && L.LOOK.bld_stage, b = st && st.show && st.show.beams;
    if (b && b.alpha > 0) RULES.beamAlpha = Math.min(RULES.beamAlpha, b.alpha);
    if (b && b.hz > 0) RULES.sweepHz = Math.min(RULES.sweepHz, b.hz);
    var T = L && L.TEMPO;
    if (T && T.encoreSec > 0) RULES.holdSec = T.encoreSec;
    var M = mo();
    if (M && M.RATE && M.RATE.screen > 0) RULES.screenGap = M.RATE.screen;
  }());

  /* ================================================================
     LAYOUT (item-space units)
     ================================================================ */
  /* Dance Studio: a concrete ground floor with a smoked storefront, the light-up
     deck in front of it, a set-back mirror-glass upper floor with LED fins, the
     pictogram sign on the roof and a speaker stack on the ground-floor roof */
  var D = {
    body: { x: 0.9, z0: -0.91, z1: 0.16, h: 1.15 },
    skirt: { h: 0.05, over: 0.01 },
    apron: { z0: 0.16, z1: 0.9, h: 0.045 },
    tiles: { cols: 3, rows: 2, x: 0.88, z0: 0.19, z1: 0.88, gap: 0.03, h: 0.022 },
    front: { x: 0.81, jamb: 0.06, y0: 0.045, head: [1.0, 1.07], mull: 0.035, bay: 0.28, z: 0.17 },
    glass: { y0: 0.05, y1: 0.995, d: 0.02, z: 0.168 },
    pulls: { x: 0.03, y: 0.55, h: 0.3 },
    canopy: { w: 0.74, h: 0.035, z0: 0.16, z1: 0.4, y: 1.08 },
    down: { x: [-0.22, 0, 0.22], r: 0.024, y: 1.072, z: 0.3 },
    cove: { y: 1.13, w: 1.62 },
    upper: { x: 0.66, z0: -0.9, z1: -0.06, y0: 1.15, y1: 1.9 },
    cap: { h: 0.04, over: 0.02 },
    mirror: { w: 1.2, y0: 1.21, y1: 1.81, d: 0.015 },
    fins: { w: 0.03, d: 0.05, y0: 1.18, h: 0.66, z: -0.025 },
    sign: { x: 0.34, w: 0.52, y0: 1.94, y1: 2.25, d: 0.04, z: -0.1 },
    speaker: { x: 0.79, z: 0, lower: [0.2, 0.24, 0.2], upper: [0.18, 0.18, 0.18] },
    slit: { z: -0.42, y0: 0.22, y1: 0.92, w: 0.3 },
    ac: { x: 0.4, z: -0.72, w: 0.24, h: 0.12, d: 0.18 }
  };
  /* fin x positions and heights per stripe pattern; side = -1 (sign left) | 1 */
  function finLayout(stripe, side) {
    var xs = stripe === 'B' ? [-0.54, -0.44, 0, 0.44, 0.54] : [-0.5, -0.25, 0, 0.25, 0.5];
    return xs.map(function (x, i) {
      var h = D.fins.h;
      if (stripe === 'C') { var r = side < 0 ? 4 - i : i; h = D.fins.h * (0.52 + 0.12 * r); }
      return { x: x, h: h };
    });
  }
  /* the 3×2 deck: tile centres, sizes and chase coordinates */
  function tileLayout() {
    var T = D.tiles, w = (2 * T.x - (T.cols - 1) * T.gap) / T.cols, d = (T.z1 - T.z0 - (T.rows - 1) * T.gap) / T.rows, out = [];
    for (var r = 0; r < T.rows; r++) for (var c = 0; c < T.cols; c++) {
      out.push({ i: out.length, cx: c, cz: r, x: -T.x + w / 2 + c * (w + T.gap), z: T.z0 + d / 2 + r * (d + T.gap), w: w, d: d });
    }
    return out;
  }

  /* Rooftop Hangout: a brick warehouse with a switchback steel stair on its right */
  var R = {
    block: { x0: -0.88, x1: 0.37, z0: -0.88, z1: 0.37, h: 1.55 },
    bands: [[0, 0.08, 0.01], [0.74, 0.79, 0.01], [1.5, 1.56, 0.02]],
    door: { x0: -0.14, x1: 0.3, h: 0.62, slats: 4 },
    winLow: { x0: -0.78, x1: -0.36, y0: 0.14, y1: 0.62 },
    upSlots: [-0.67, -0.255, 0.16], upW: 0.3, upY0: 0.86, upY1: 1.4,
    side: { z: -0.3, y0: 0.88, y1: 1.38, w: 0.3 },
    mural: { y: 1.13, r: 0.15 },
    stair: { outer: [0.67, 0.9], inner: [0.42, 0.65], front: 0.86, land: [-0.86, -0.55], landY: 0.78, top: [0.12, 0.36], treads: 4, t: 0.03 },
    deck: { y: 1.56, t: 0.025, planks: 6 },
    rail: { h: 0.14, t: 0.02, gapX: 0.12 },
    beans: [{ x: -0.55, z: -0.04, r: 0.17, tok: 'beanA', yaw: 20 }, { x: -0.18, z: 0.08, r: 0.15, tok: 'beanB', yaw: -30 }],
    posts: [[-0.82, 0.3], [0.16, 0.3]], postH: 0.56, sag: 0.13, bulbs: 9,
    scope: { x: 0.02, z: -0.45, head: 0.4, len: 0.34, elev: 12 },
    palm: { x: -0.66, z: -0.62, pot: 0.15, trunk: 0.38, frond: 0.26 },
    ac: { x: 0.2, z: -0.75 }
  };
  R.deckTop = R.deck.y + R.deck.t;
  /* the 9 festoon bulbs on a parabolic sag between the two post tops */
  function festoon() {
    var a = R.posts[0], b = R.posts[1], y0 = R.deckTop + R.postH, out = [];
    for (var i = 0; i < R.bulbs; i++) {
      var u = (i + 1) / (R.bulbs + 1);
      out.push({ i: i, x: lerp(a[0], b[0], u), z: lerp(a[1], b[1], u), wireY: y0 - R.sag * 4 * u * (1 - u) });
    }
    return out;
  }
  /* upper façade: the mural takes the sign-side slot, the windows the other two */
  function roofSlots(side) {
    var s = R.upSlots;
    return side < 0 ? { mural: s[0], windows: [s[1], s[2]] } : { mural: s[2], windows: [s[0], s[1]] };
  }

  /* Concert Stage: a deck under a box-truss arch with the LED wall at the back */
  var S = {
    deck: { x: 1.4, z0: -0.78, z1: 0.6, h: 0.32 },
    steps: { x0: 1.02, x1: 1.4, z0: 0.6, z1: 0.9, n: 2 },
    bezel: { x: 1.16, y0: 0.36, y1: 1.6, z: -0.67, d: 0.08 },
    screen: { x: 1.1, y0: 0.43, y1: 1.53, z: -0.625, strips: 8 },
    tower: { x: 1.31, z: -0.3, half: 0.065, top: 2.31, cap: 0.14, braces: 7 },
    truss: { y0: 2.165, y1: 2.295, z0: -0.365, z1: -0.235, braces: 12 },
    heads: [-0.93, -0.31, 0.31, 0.93], hangY: 2.15, headZ: -0.3, lensDrop: 0.17,
    ray: { len: 1.8, r: 0.25, coreLen: 1.6, core: 0.08 },
    speakers: { x: 1.17, z: 0.33 },
    monitors: { x: 0.62, z: 0.4 },
    mic: { x: 0.18, z: 0.42 },
    booth: { x: 0.82, z: -0.42 },
    foot: { n: 8, x: 0.84, z: 0.55 },
    crowd: { rows: [{ z: 1.32, h: 0.34, x0: -1.1 }, { z: 1.72, h: 0.3, x0: -0.88 }], perRow: 6, step: 0.44, pivot: [0, 0, 0.6] },
    target: [0, 0.36, 0.1]
  };
  /* the 12 fans in the pit: two staggered rows, deterministic heights and arm sides */
  function crowdLayout() {
    var out = [];
    S.crowd.rows.forEach(function (row, r) {
      for (var k = 0; k < S.crowd.perRow; k++) {
        var i = out.length, x = Math.max(-1.3, Math.min(1.3, row.x0 + k * S.crowd.step));
        out.push({ i: i, x: x, z: row.z + (k % 2 ? 0.05 : -0.04), h: row.h * (0.92 + 0.04 * ((i * 7) % 3)), arm: (i * 5) % 3 === 0 ? -1 : 1, row: r });
      }
    });
    return out;
  }
  function footLayout() {
    var out = [], n = S.foot.n;
    for (var i = 0; i < n; i++) out.push({ i: i, x: -S.foot.x + i * (2 * S.foot.x / (n - 1)), z: S.foot.z });
    return out;
  }
  var HEAD_O = S.heads.map(function (x) { return Object.freeze([x, S.hangY, S.headZ]); });
  function headOrigin(i) { return HEAD_O[i] || HEAD_O[0]; }

  /* ================================================================
     PURE HELPERS (no THREE; exported for Node tests)
     ================================================================ */
  function trimFor(id, variant) {
    var L = looks();
    if (L && typeof L.trimOf === 'function') return L.trimOf(id, variant);
    var v = Math.max(0, Math.min(2, variant | 0));
    return { accent: TRIMS.accent[v % 3], signSide: TRIMS.signSide[v % 2], stripe: TRIMS.stripe[v % 3] };
  }
  function sideOf(t) { return t && t.signSide === 'R' ? 1 : -1; }

  /* SLMotion.diagChase, or the same rule locally: the tile's diagonal lights for one
     beat in every `groups` beats, as a soft sine; steady under reduced motion */
  function diag(cx, cz, beatN, f, groups, reduced) {
    var M = mo();
    if (M && typeof M.diagChase === 'function') return M.diagChase(cx, cz, beatN, f, groups, reduced);
    if (reduced) return 0.8;
    var g = Math.max(2, groups | 0), on = ((cx + cz) % g + g) % g === ((beatN % g) + g) % g;
    return 0.35 + (on ? 0.65 * Math.sin(PI * clamp01(f)) : 0);
  }
  /* a deck tile's level: the static golden-hour level blended into the chase by amt
     (the act's chase envelope or the Showtime mix) */
  function tileLevel(cx, cz, beatN, f, amt, reduced) {
    return lerp(RULES.deckDay, diag(cx, cz, beatN, f, RULES.groups, reduced), clamp01(amt));
  }
  /* which of the 5 deck hues tile i shows (they step once per hueEvery beats while chasing) */
  function tileHue(i, beatN, amt, reduced) {
    var step = !reduced && amt > 0.01 ? Math.floor(beatN / RULES.hueEvery) : 0;
    return ((i + step) % 5 + 5) % 5;
  }
  /* footlight i: a warm base (golden hour 0.25 → night 0.8) plus the chase pulse under amt —
     SLMotion.diagChase along the row, so each light peaks once per 4 beats; a steady glow
     under reduced motion */
  function footLevel(i, beatN, f, amt, k, reduced) {
    var base = lerp(0.25, 0.8, clamp01(k)), pulse = (diag(i, 0, beatN, f, RULES.groups, reduced) - 0.35) / 0.65;
    return base + (1 - base) * clamp01(amt) * clamp01(pulse);
  }
  /* SLMotion.wave: a travelling ≤ ±35 % brightness wave (a local copy without SLMotion) */
  function waveAt(t, i, n, hz, level, reduced) {
    var M = mo();
    if (M && typeof M.wave === 'function') return M.wave(t, i, n, hz, level, reduced);
    if (reduced) return 1;
    return 1 - 0.35 * clamp01(level) * (0.5 - 0.5 * Math.cos(TAU * (Math.min(hz, 2) * t - i / Math.max(1, n))));
  }
  /* festoon bulb i: golden hour 0.35 → night 1; the act lifts it to full and runs the wave */
  function bulbLevel(i, t, wave, k, reduced) {
    var base = lerp(RULES.bulbDay, 1, clamp01(k));
    wave = clamp01(wave);
    return Math.max(base, wave) * waveAt(t, i, R.bulbs, RULES.bulbHz, wave, reduced);
  }
  /* window i of n: 40 % lit at golden hour → all lit at Showtime; each window fades over
     its own narrow band of k, so it switches once per ramp and never flickers */
  function windowLevel(i, n, k) {
    var th = n > 1 ? 0.4 + 0.6 * ((i * 0.618034) % 1) : 0.4, lit = lerp(0.4, 1, clamp01(k));
    return smooth(th - 0.12, th + 0.02, lit);
  }

  /* the moving heads (degrees): parked by day, a slow sweep at Showtime (0.12 Hz, phases
     a quarter apart), swung to centre stage by the act's heads envelope */
  function aimAngles(dx, dy, dz, out) {
    out = out || {};
    var l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    out.tilt = Math.acos(Math.max(-1, Math.min(1, -dy / l))) / DEG;
    out.pan = out.tilt < 1e-6 ? 0 : Math.atan2(dx, dz) / DEG;
    return out;
  }
  var CENTRE = Object.freeze(HEAD_O.map(function (h) {
    return Object.freeze(aimAngles(S.target[0] - h[0], S.target[1] - (h[1] - S.lensDrop), S.target[2] - h[2], {}));
  }));
  function headPose(i, t, k, heads, reduced, out) {
    out = out || {};
    var ph = TAU * ((reduced ? 0 : RULES.sweepHz * t) + i / 4);
    var pan = lerp(0, RULES.sweepDeg * Math.sin(ph), clamp01(k));
    var tilt = lerp(RULES.parkTilt, RULES.sweepTilt + 6 * Math.sin(ph + 1.3), clamp01(k));
    var c = CENTRE[i] || CENTRE[0], e = clamp01(heads);
    out.pan = lerp(pan, c.pan, e); out.tilt = lerp(tilt, c.tilt, e);
    return out;
  }
  /* p rotated about h by Ry(pan) · Rx(-tilt) into out[o..o+2] (cos/sin precomputed; the
     rest geometry hangs straight down, so tilt swings it toward +z and pan toward +x) */
  function rotAbout(px, py, pz, h, cp, sp, ct, stt, out, o) {
    var x = px - h[0], y = py - h[1], z = pz - h[2];
    var y1 = y * ct + z * stt, z1 = -y * stt + z * ct;
    out[o] = h[0] + x * cp + z1 * sp;
    out[o + 1] = h[1] + y1;
    out[o + 2] = h[2] - x * sp + z1 * cp;
  }
  /* the beams show during the act and with Showtime, never by day otherwise */
  function beamVis(beams, k) { return Math.max(clamp01(beams), clamp01(k)); }

  /* ---------------- the LED wall: programs, phases and per-strip uv ---------------- */
  var SHOW_PROGRAMS = Object.freeze(['spark', 'name', 'eq', 'gradient']);
  var SHOW_NO_NAME = Object.freeze(['spark', 'eq', 'gradient']);
  var SCROLL = { stars: 0.05, spark: 0.06, name: 0.1, gradient: 0.08, encore: 0.04, showtime: 0.05, wave: 0.08, eq: 0 };
  /* the Showtime program for a bar: a new one every RULES.showBars bars; the child's name
     only where it may appear (on the island, with a name) */
  function showProgram(bar, withName) {
    var list = withName ? SHOW_PROGRAMS : SHOW_NO_NAME;
    var slot = Math.floor(Math.max(0, bar | 0) / RULES.showBars);
    return list[slot % list.length];
  }
  /* a program's window phase (0..1 of its period): a slow scroll; the EQ steps an eighth
     on every beat with a smooth glide; frozen under reduced motion */
  function progPhase(prog, t, beatN, f, reduced) {
    if (reduced) return 0;
    if (prog === 'eq') return frac((beatN + smooth(0, 1, f)) / 8);
    return frac((SCROLL[prog] != null ? SCROLL[prog] : 0.05) * t);
  }
  /* LED atlas window maths: kit.js ledWindow, computed here from the kit's layout (or the
     same numbers without the kit) so the frame loop never allocates */
  var LED_LAYOUT = (function () {
    var KT = kitApi(), lay = KT && KT.LED, progs = KT && KT.LED_PROGRAMS;
    var F = { programs: ['eq', 'wave', 'spark', 'gradient', 'stars', 'encore', 'showtime', 'name'], w: 512, h: 256, stripW: 256, cellW: 128, cellH: 64, cols: 2 };
    if (lay && lay.w > 0 && Array.isArray(progs) && progs.length) {
      F = { programs: progs.slice(), w: lay.w, h: lay.h, stripW: lay.stripW, cellW: lay.cellW, cellH: lay.cellH, cols: lay.cols };
    }
    return F;
  }());
  function ledWin(prog, phase, out) {
    var F = LED_LAYOUT, i = F.programs.indexOf(prog);
    if (i < 0) i = 0;
    var cx = (i % F.cols) * F.stripW, cy = Math.floor(i / F.cols) * F.cellH, f = frac(+phase || 0);
    out.rx = F.cellW / F.w; out.ry = F.cellH / F.h; out.ox = (cx + f * F.cellW) / F.w; out.oy = 1 - (cy + F.cellH) / F.h;
    return out;
  }
  /* per-vertex wall data from the wall's positions: local (u, v) across the whole wall
     and the strip of the vertex's triangle (strips run left to right) */
  function wallMeta(pos) {
    var n = (pos.length / 3) | 0, loc = new Float32Array(n * 2), strip = new Uint8Array(n);
    var sc = S.screen, W = 2 * sc.x, H = sc.y1 - sc.y0, N = sc.strips;
    for (var v = 0; v < n; v++) {
      loc[v * 2] = clamp01((pos[v * 3] + sc.x) / W);
      loc[v * 2 + 1] = clamp01((pos[v * 3 + 1] - sc.y0) / H);
    }
    for (var t = 0; t + 2 < n; t += 3) {
      var cx = (pos[t * 3] + pos[t * 3 + 3] + pos[t * 3 + 6]) / 3;
      var s = Math.max(0, Math.min(N - 1, Math.floor((cx + sc.x) / W * N)));
      strip[t] = strip[t + 1] = strip[t + 2] = s;
    }
    return { n: n, loc: loc, strip: strip };
  }
  /* absolute atlas uv for every wall vertex: strips left of the wipe front show `cur`,
     the rest still show `prev` (a moving wipe, never a dimming) */
  var _wa = { rx: 0, ry: 0, ox: 0, oy: 0 }, _wb = { rx: 0, ry: 0, ox: 0, oy: 0 };
  function wallUvInto(uv, meta, cur, phCur, prev, phPrev, wipe) {
    var A = ledWin(cur, phCur, _wa), B = ledWin(prev, phPrev, _wb), N = S.screen.strips, loc = meta.loc;
    for (var v = 0; v < meta.n; v++) {
      var w = (meta.strip[v] + 0.5) / N < wipe ? A : B;
      uv[v * 2] = w.ox + loc[v * 2] * w.rx;
      uv[v * 2 + 1] = w.oy + loc[v * 2 + 1] * w.ry;
    }
    return uv;
  }

  /* ---------------- the stage crowd ---------------- */
  /* rise in the act (0.25 → 0.65 s act time), up for the encore hold, sink after it */
  function crowdU(tAct, t, holdUntil, carried) {
    var u = carried || 0;
    if (tAct != null) u = Math.max(u, smooth(RULES.rise[0], RULES.rise[1], tAct));
    if (holdUntil != null && t >= holdUntil) u = Math.min(u, 1 - clamp01((t - holdUntil) / RULES.sinkSec));
    return clamp01(u);
  }
  /* the crowd pivot: collapsed when hidden, rising from below the pit, a soft bounce on the
     beat once up (≤ 1.97 Hz) */
  function crowdPose(u, f, reduced, out) {
    out = out || {};
    if (!(u > 0.001)) { out.s = 1e-4; out.y = 0; return out; }
    var e = u * u * (3 - 2 * u);
    out.s = 1;
    out.y = -RULES.crowdDrop * (1 - e) + (u >= 1 && !reduced ? RULES.crowdBob * (0.5 + 0.5 * Math.cos(TAU * clamp01(f))) : 0);
    return out;
  }

  /* ---------------- colour maths on {r, g, b} (linear, as the kit's colours) ---------------- */
  function mixInto(out, a, b, k) { out.r = a.r + (b.r - a.r) * k; out.g = a.g + (b.g - a.g) * k; out.b = a.b + (b.b - a.b) * k; return out; }
  function scaleInto(out, a, s) { out.r = a.r * s; out.g = a.g * s; out.b = a.b * s; return out; }

  /* ================================================================
     GEOMETRY HELPERS (run only with a kit: ctx.G is the tier's geometry kit)
     ================================================================ */
  function alignY(dx, dy, dz) {
    var l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    dx /= l; dy /= l; dz /= l;
    var gz = -Math.asin(dx < -1 ? -1 : dx > 1 ? 1 : dx);
    var ax = Math.abs(dx) > 0.99999 ? 0 : Math.atan2(dz, dy);
    return [ax / DEG, 0, gz / DEG];
  }
  /* vertices of a kit geometry (non-indexed) or of a test mock ({tris}) */
  function vcount(geo) {
    if (!geo) return 0;
    if (typeof geo.getAttribute === 'function') { var p = geo.getAttribute('position'); return p ? p.count : 0; }
    return (geo.tris | 0) * 3;
  }
  function ops(ctx) {
    var G = ctx.G, low = ctx.tier === 'LOW';
    function rad(n) { return low ? Math.max(3, Math.round(n * 0.7)) : n; }
    function fin(geo, token, o) {
      if (token) G.paint(geo, token, o && o.tone);
      return o && (o.p || o.r || o.s != null) ? G.t(geo, o) : geo;
    }
    var O = {
      G: G, low: low, rad: rad,
      /* a crisp 12-triangle box (details); arch = the 0.05 architecture bevel (main volumes) */
      box: function (w, h, d, token, o) { return fin(G.slab(w, h, d, 0), token, o); },
      tube: function (rt, rb, h, token, o) { return fin(G.tube(rt, rb, h, { radial: rad((o && o.radial) || 12), open: !!(o && o.open) }), token, o); },
      /* a disc facing +z (speaker cones, lenses, grilles) */
      disc: function (r, t, token, o) { return fin(G.t(G.tube(r, r, t, { radial: rad((o && o.radial) || 12) }), { r: [90, 0, 0] }), token, o); },
      /* a tube between two points */
      rod: function (a, b, r, token, o) {
        var dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-4;
        return O.tube(r, r, len, token, { radial: (o && o.radial) || 6, open: o && o.open, tone: o && o.tone, r: alignY(dx, dy, dz), p: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2] });
      },
      /* lit tops, shaded undersides */
      shade: function (geo, token, hi, lo) {
        hi = hi == null ? 0.6 : hi; lo = lo == null ? -0.35 : lo;
        return G.paintBy(geo, function (v) { return v.ny > hi ? [token, 'hi'] : v.ny < lo ? [token, 'shade'] : token; });
      },
      /* ±3 % lightness noise on a 0.25 u grid (concrete and brick), shaded undersides */
      noisy: function (geo, token) {
        return G.paintBy(geo, function (v) {
          if (v.ny < -0.5) return [token, 'shade'];
          var h = Math.sin(Math.floor(v.x * 4 + 0.5) * 12.9898 + Math.floor(v.y * 4 + 0.5) * 78.233 + Math.floor(v.z * 4 + 0.5) * 37.719) * 43758.5453;
          return [token, Math.round(((h - Math.floor(h)) * 2 - 1) * 3) / 100];
        });
      },
      /* a four-point ✦ (never the five-point reward star): two crossed flat rhombi, facing +z */
      spark: function (r, depth, token, o) {
        var parts = [];
        [[r, 0.3 * r, 0], [0.72 * r, 0.26 * r, 90]].forEach(function (q) {
          [1, -1].forEach(function (s) {
            var ang = q[2] ? -s * 90 : (s < 0 ? 180 : 0), px = q[2] ? s * q[0] / 2 : 0, py = q[2] ? 0 : s * q[0] / 2;
            parts.push(G.t(G.cone(q[1], q[0], 4), { s: [1, 1, depth], r: [0, 0, ang], p: [px, py, 0] }));
          });
        });
        return fin(G.merge(parts), token, o);
      }
    };
    return O;
  }
  /* a recorder for per-copy parts: geometries in merge order plus the vertex range of
     every dynamic sub-object {kind, i, v0, vn} (the runtime writes colours / positions there) */
  function Rec() { this.list = []; this.n = 0; this.subs = []; }
  Rec.prototype.add = function (geo, kind, i) {
    var n = vcount(geo), last = this.subs[this.subs.length - 1];
    if (kind) {
      if (last && last.kind === kind && last.i === (i | 0) && last.v0 + last.vn === this.n) last.vn += n;
      else this.subs.push({ kind: kind, i: i | 0, v0: this.n, vn: n });
    }
    this.list.push(geo); this.n += n;
    return geo;
  };
  Rec.prototype.meta = function () {
    var by = {};
    this.subs.forEach(function (s) { (by[s.kind] = by[s.kind] || []).push(Object.freeze(s)); });
    Object.keys(by).forEach(function (k) { Object.freeze(by[k]); });
    return Object.freeze({ n: this.n, subs: Object.freeze(this.subs.slice()), by: Object.freeze(by) });
  };

  /* colour tokens for one build: the LOOK entry's, else the defaults */
  function colorsOf(ctx) {
    var c = (ctx.look && ctx.look.colors) || {}, d = DEF[ctx.id] || {}, out = {};
    Object.keys(d).forEach(function (k) { out[k] = typeof c[k] === 'string' ? c[k] : d[k]; });
    return out;
  }
  function topOf(ctx, h) { return ((ctx.look && ctx.look.h > 0) ? ctx.look.h : h) + 0.15; }
  function variantOfCtx(ctx) { return ctx.st && typeof ctx.st.variant === 'number' ? ctx.st.variant : 0; }

  /* template meta (per-copy part ranges and the trim), keyed by the finished template */
  var META = typeof WeakMap === 'function' ? new WeakMap() : null;
  function metaAll(a) { var tpl = a && a.template; return tpl && META ? META.get(tpl) || null : null; }
  function metaOf(a, part) { var m = metaAll(a); return m ? m[part] || null : null; }

  /* ================================================================
     BUILDERS
     ================================================================ */
  function buildDance(ctx) {
    var o = ops(ctx), G = o.G, c = colorsOf(ctx), t = trimFor(ctx.id, variantOfCtx(ctx)), side = sideOf(t);
    var acc = t.accent, B = D.body, U = D.upper, F = D.front, A = D.apron, Gl = D.glass;
    var shell = [], glass = [], mirror = [], speaker = [], floor = new Rec();
    var bodyD = B.z1 - B.z0, bodyZ = (B.z0 + B.z1) / 2;
    /* ground floor: a crisp concrete block on a darker skirting, the deck's plinth in front */
    shell.push(o.noisy(G.t(G.slab(2 * B.x, B.h, bodyD, { arch: true }), { p: [0, B.h / 2, bodyZ] }), c.body));
    shell.push(o.box(2 * B.x + 2 * D.skirt.over, D.skirt.h, bodyD + 2 * D.skirt.over, c.body, { tone: 'shade', p: [0, D.skirt.h / 2, bodyZ] }));
    shell.push(o.shade(G.t(G.slab(2 * B.x, A.h, A.z1 - A.z0, 0), { p: [0, A.h / 2, (A.z0 + A.z1) / 2] }), c.body));
    /* storefront frame: jambs, head, two mullions */
    var fh = F.head[0] - F.y0, jh = F.head[1] - F.y0;
    [-1, 1].forEach(function (s) {
      shell.push(o.box(F.jamb, jh, 0.05, c.frame, { p: [s * F.x, F.y0 + jh / 2, F.z] }));
      shell.push(o.box(F.mull, fh, 0.04, c.frame, { p: [s * F.bay, F.y0 + fh / 2, F.z] }));
    });
    shell.push(o.box(2 * F.x + F.jamb, F.head[1] - F.head[0], 0.05, c.frame, { p: [0, (F.head[0] + F.head[1]) / 2, F.z] }));
    /* the canopy over the doors */
    var Cn = D.canopy;
    shell.push(o.shade(G.t(G.slab(Cn.w, Cn.h, Cn.z1 - Cn.z0, 0), { p: [0, Cn.y + Cn.h / 2, (Cn.z0 + Cn.z1) / 2] }), c.upper));
    /* upper floor: set back, Concrete Light, a Bone White cap */
    var ud = U.z1 - U.z0, uz = (U.z0 + U.z1) / 2;
    shell.push(o.noisy(G.t(G.slab(2 * U.x, U.y1 - U.y0, ud, { arch: true }), { p: [0, (U.y0 + U.y1) / 2, uz] }), c.upper));
    shell.push(o.shade(G.t(G.slab(2 * U.x + 2 * D.cap.over, D.cap.h, ud + 2 * D.cap.over, 0), { p: [0, U.y1 + D.cap.h / 2, uz] }), c.frame));
    /* the sign board on the sign side, an AC unit on the other */
    var Sg = D.sign, sx = side * Sg.x, sy = (Sg.y0 + Sg.y1) / 2, Ac = D.ac, ax = -side * Ac.x, roof = U.y1 + D.cap.h;
    shell.push(o.box(Sg.w, Sg.y1 - Sg.y0, Sg.d, c.speaker, { p: [sx, sy, Sg.z] }));
    shell.push(o.shade(G.t(G.slab(Ac.w, Ac.h, Ac.d, 0), { p: [ax, roof + Ac.h / 2, Ac.z] }), c.body));
    shell.push(o.disc(0.055, 0.012, c.cone, { radial: 10, r: [-90, 0, 0], p: [ax, roof + Ac.h + 0.006, Ac.z] }));
    /* a Bone White border round the dance deck, corner pilasters, the terrace rail's cap */
    var Tl = D.tiles, bt = A.h + 0.01, rz = B.z1 - 0.015;
    shell.push(o.box(2 * B.x, 0.02, 0.015, c.frame, { p: [0, bt, A.z1 - 0.0075] }));
    [-1, 1].forEach(function (s) {
      shell.push(o.box(0.015, 0.02, Tl.z1 - Tl.z0 + 0.03, c.frame, { p: [s * (B.x - 0.0075), bt, (Tl.z0 + Tl.z1) / 2] }));
      shell.push(o.box(0.06, B.h, 0.06, c.body, { tone: 'shade', p: [s * (B.x - 0.03), B.h / 2, B.z1 - 0.03] }));
    });
    shell.push(o.box(2 * B.x, 0.012, 0.025, c.frame, { p: [0, B.h + 0.136, rz] }));

    /* glass: the storefront (two side bays and two door leaves), the side slits, the low rail
       of the ground-floor roof terrace, ribbon windows on the upper floor and a skylight */
    var gh = Gl.y1 - Gl.y0, gy = (Gl.y0 + Gl.y1) / 2, inner = F.x - F.jamb / 2, bayIn = F.bay + F.mull / 2, bayOut = F.bay - F.mull / 2;
    [-1, 1].forEach(function (s) {
      glass.push(o.box(inner - bayIn, gh, Gl.d, c.glass, { p: [s * (inner + bayIn) / 2, gy, Gl.z] }));
      glass.push(o.box(bayOut - 0.004, gh, Gl.d, c.glass, { p: [s * (bayOut + 0.004) / 2, gy, Gl.z] }));
      glass.push(o.box(Gl.d, D.slit.y1 - D.slit.y0, D.slit.w, c.glass, { p: [s * (B.x + 0.005), (D.slit.y0 + D.slit.y1) / 2, D.slit.z] }));
      glass.push(o.box(0.015, 0.12, ud * 0.7, c.glass, { p: [s * (U.x + 0.0075), U.y0 + 0.47, uz] }));
    });
    glass.push(o.box(2 * B.x - 0.04, 0.13, 0.015, c.glass, { p: [0, B.h + 0.065, rz] }));
    glass.push(o.box(0.32, 0.04, 0.24, c.glass, { p: [side * 0.3, roof + 0.02, -0.6] }));
    /* mirror glass: the upper front (the mirror the crew dances to) and the door pulls */
    var Mi = D.mirror;
    mirror.push(o.box(Mi.w, Mi.y1 - Mi.y0, Mi.d, c.mirror, { p: [0, (Mi.y0 + Mi.y1) / 2, U.z1 + 0.0015] }));
    [-1, 1].forEach(function (s) { mirror.push(o.box(0.016, D.pulls.h, 0.02, c.mirror, { p: [s * D.pulls.x, D.pulls.y, Gl.z + 0.02] })); });

    /* the light-up deck: 3×2 tiles (per-copy colours) */
    tileLayout().forEach(function (T) {
      floor.add(o.box(T.w, D.tiles.h, T.d, c.floor, { p: [T.x, A.h + D.tiles.h / 2, T.z] }), 'tile', T.i);
    });
    /* 5 LED fins over the mirror glass, in the trim accent */
    finLayout(t.stripe, side).forEach(function (f, i) {
      floor.add(o.box(D.fins.w, f.h, D.fins.d, acc, { p: [f.x, D.fins.y0 + f.h / 2, D.fins.z] }), 'fin', i);
    });
    /* the neon pictogram: a sneaker running right with three motion lines */
    var zf = Sg.z + Sg.d / 2 + 0.006, cy = sy + 0.02, sgn = c.sign;
    floor.add(o.box(0.24, 0.022, 0.01, sgn, { p: [sx + 0.02, cy - 0.075, zf] }), 'sign', 0);
    floor.add(o.box(0.15, 0.075, 0.01, sgn, { r: [0, 0, -8], p: [sx - 0.01, cy - 0.032, zf] }), 'sign', 0);
    floor.add(G.t(o.disc(0.042, 0.01, sgn, { radial: 10 }), { s: [1.15, 0.8, 1], p: [sx + 0.085, cy - 0.05, zf] }), 'sign', 0);
    floor.add(o.box(0.03, 0.06, 0.01, sgn, { p: [sx - 0.075, cy - 0.004, zf] }), 'sign', 0);
    [[0.075, 0.0], [0.06, -0.032], [0.045, -0.064]].forEach(function (q) {
      floor.add(o.box(q[0], 0.016, 0.01, sgn, { p: [sx - 0.115 - q[0] / 2, cy + q[1] - 0.004, zf] }), 'sign', 0);
    });
    /* canopy downlights and the cove strip above the canopy */
    D.down.x.forEach(function (x, i) { floor.add(o.tube(D.down.r, D.down.r, 0.01, c.floor, { radial: 8, p: [x, D.down.y, D.down.z] }), 'down', i); });
    floor.add(o.box(D.cove.w, 0.016, 0.012, c.glow, { p: [0, D.cove.y, B.z1 + 0.006] }), 'cove', 0);

    /* the speaker stack on the ground-floor roof, opposite the sign (pivot at its base) */
    var Sp = D.speaker, px = -side * Sp.x, lo = Sp.lower, up = Sp.upper, by = B.h;
    speaker.push(o.shade(G.t(G.slab(lo[0], lo[1], lo[2], 0), { p: [px, by + lo[1] / 2, Sp.z] }), c.speaker));
    speaker.push(o.shade(G.t(G.slab(up[0], up[1], up[2], 0), { p: [px, by + lo[1] + up[1] / 2, Sp.z] }), c.speaker));
    var zc = Sp.z + lo[2] / 2 + 0.004, zc2 = Sp.z + up[2] / 2 + 0.004;
    speaker.push(o.disc(0.068, 0.012, c.cone, { radial: 12, p: [px, by + 0.1, zc] }));
    speaker.push(o.disc(0.026, 0.016, c.speaker, { radial: 8, p: [px, by + 0.1, zc + 0.004] }));
    speaker.push(o.disc(0.028, 0.012, c.cone, { radial: 8, p: [px, by + 0.205, zc] }));
    speaker.push(o.disc(0.05, 0.012, c.cone, { radial: 10, p: [px, by + lo[1] + 0.085, zc2] }));

    var tpl = ctx.K.template(ctx)
      .part('shell', shell, 'toon', { castShadow: true })
      .part('glass', glass, 'smoked', { castShadow: true })
      .part('mirror', mirror, 'chrome', {})
      .pivot('floor', [0, A.h, (D.tiles.z0 + D.tiles.z1) / 2])
      .part('floor', floor.list, 'state', { pivot: 'floor', perCopy: true })
      .pivot('speaker', [px, by, Sp.z])
      .part('speaker', speaker, 'toon', { pivot: 'speaker' })
      .anchor('top', [0, topOf(ctx, 2.25), 0])
      .anchor('spot', [0, 0, 1.45])
      .anchor('floor', [0, A.h + D.tiles.h, (D.tiles.z0 + D.tiles.z1) / 2])
      .anchor('door', [0, 0.5, Gl.z + 0.05])
      .anchor('sign', [sx, sy, Sg.z + 0.1])
      .anchor('speaker', [px, by + lo[1] + up[1] + 0.08, Sp.z])
      .done();
    if (META && tpl) META.set(tpl, { floor: floor.meta(), trim: t });
    return tpl;
  }

  function buildRooftop(ctx) {
    var o = ops(ctx), G = o.G, c = colorsOf(ctx), t = trimFor(ctx.id, variantOfCtx(ctx)), side = sideOf(t);
    var Bk = R.block, bw = Bk.x1 - Bk.x0, bd = Bk.z1 - Bk.z0, bx = (Bk.x0 + Bk.x1) / 2, bz = (Bk.z0 + Bk.z1) / 2, zf = Bk.z1;
    var shell = [], deck = [], scope = [], lights = new Rec(), acc = t.accent, top = R.deckTop;
    /* the brick block and its course bands */
    shell.push(o.noisy(G.t(G.slab(bw, Bk.h, bd, { arch: true }), { p: [bx, Bk.h / 2, bz] }), c.body));
    R.bands.forEach(function (b) {
      shell.push(o.shade(G.t(G.slab(bw + 2 * b[2], b[1] - b[0], bd + 2 * b[2], 0), { p: [bx, (b[0] + b[1]) / 2, bz] }), c.course));
    });
    /* the roller door with its slats and a header */
    var Dr = R.door, dw = Dr.x1 - Dr.x0, dx = (Dr.x0 + Dr.x1) / 2;
    shell.push(o.box(dw, Dr.h, 0.02, c.door, { p: [dx, Dr.h / 2, zf + 0.012] }));
    for (var s = 1; s <= Dr.slats; s++) shell.push(o.box(dw, 0.01, 0.006, c.frame, { p: [dx, s * Dr.h / (Dr.slats + 1), zf + 0.025] }));
    shell.push(o.box(dw + 0.06, 0.05, 0.04, c.lintel, { p: [dx, Dr.h + 0.03, zf + 0.012] }));
    /* windows: a Gunmetal frame behind each pane, a lintel above, industrial glazing bars */
    var wins = [], W0 = R.winLow, slots = roofSlots(side);
    wins.push({ x: (W0.x0 + W0.x1) / 2, y: (W0.y0 + W0.y1) / 2, w: W0.x1 - W0.x0, h: W0.y1 - W0.y0 });
    slots.windows.forEach(function (x) { wins.push({ x: x, y: (R.upY0 + R.upY1) / 2, w: R.upW, h: R.upY1 - R.upY0 }); });
    wins.forEach(function (w, i) {
      shell.push(o.box(w.w + 0.06, w.h + 0.06, 0.02, c.frame, { p: [w.x, w.y, zf + 0.01] }));
      shell.push(o.box(w.w + 0.1, 0.05, 0.045, c.lintel, { p: [w.x, w.y + w.h / 2 + 0.06, zf + 0.02] }));
      shell.push(o.box(0.014, w.h, 0.008, c.frame, { p: [w.x, w.y, zf + 0.03] }));
      shell.push(o.box(w.w, 0.014, 0.008, c.frame, { p: [w.x, w.y + w.h / 6, zf + 0.03] }));
      lights.add(o.box(w.w, w.h, 0.012, c.glass, { p: [w.x, w.y, zf + 0.024] }), 'win', i);
    });
    var Sd = R.side;
    shell.push(o.box(0.02, Sd.y1 - Sd.y0 + 0.06, Sd.w + 0.06, c.frame, { p: [Bk.x0 - 0.01, (Sd.y0 + Sd.y1) / 2, Sd.z] }));
    lights.add(o.box(0.012, Sd.y1 - Sd.y0, Sd.w, c.glass, { p: [Bk.x0 - 0.024, (Sd.y0 + Sd.y1) / 2, Sd.z] }), 'win', wins.length);
    /* the ✦ mural on the sign-side slot */
    shell.push(o.spark(R.mural.r, 0.12, c.star, { p: [slots.mural, R.mural.y, zf + 0.012] }));

    /* the switchback stair: the outer flight climbs back to the landing, the inner flight
       climbs forward to a platform at the roof edge */
    var St = R.stair, ox = (St.outer[0] + St.outer[1]) / 2, ix = (St.inner[0] + St.inner[1]) / 2, sw = St.outer[1] - St.outer[0];
    var runA = (St.front - St.land[1]) / (St.treads + 1), riseA = St.landY / (St.treads + 1);
    var runB = (St.top[0] - St.land[1]) / (St.treads + 1), riseB = (top - St.landY) / (St.treads + 1);
    for (var k = 1; k <= St.treads; k++) {
      shell.push(o.box(sw, St.t, runA * 0.86, c.stair, { tone: 'hi', p: [ox, k * riseA - St.t / 2, St.front - k * runA] }));
      shell.push(o.box(sw, St.t, runB * 0.86, c.stair, { tone: 'hi', p: [ix, St.landY + k * riseB - St.t / 2, St.land[1] + k * runB] }));
    }
    shell.push(o.box(St.outer[1] - St.inner[0], 0.04, St.land[1] - St.land[0], c.stair, { p: [(St.inner[0] + St.outer[1]) / 2, St.landY - 0.02, (St.land[0] + St.land[1]) / 2] }));
    shell.push(o.box(St.inner[1] - Bk.x1 + 0.01, 0.04, St.top[1] - St.top[0], c.stair, { p: [(Bk.x1 + St.inner[1]) / 2, top - 0.02, (St.top[0] + St.top[1]) / 2] }));
    /* stringers, handrails and their posts, legs under the landing and the platform */
    St.outer.forEach(function (x) { shell.push(o.rod([x, 0.02, St.front], [x, St.landY - 0.03, St.land[1]], 0.014, c.stair, { radial: 4 })); });
    St.inner.forEach(function (x) { shell.push(o.rod([x, St.landY - 0.03, St.land[1]], [x, top - 0.03, St.top[0]], 0.014, c.stair, { radial: 4 })); });
    shell.push(o.rod([St.outer[1], 0.32, St.front], [St.outer[1], St.landY + 0.3, St.land[1]], 0.01, c.stair, { radial: 4 }));
    shell.push(o.rod([St.inner[1], St.landY + 0.3, St.land[1]], [St.inner[1], top + 0.3, St.top[0]], 0.01, c.stair, { radial: 4 }));
    [[St.outer[1], St.front, 0], [St.outer[1], St.land[1], St.landY], [St.inner[1], St.top[0], top]].forEach(function (q) {
      shell.push(o.rod([q[0], q[2], q[1]], [q[0], q[2] + 0.32, q[1]], 0.01, c.stair, { radial: 4 }));
    });
    [[St.outer[1] - 0.015, St.land[0] + 0.015], [St.inner[0] + 0.015, St.land[0] + 0.015], [St.outer[1] - 0.015, St.land[1] - 0.015]].forEach(function (q) {
      shell.push(o.rod([q[0], 0, q[1]], [q[0], St.landY - 0.04, q[1]], 0.014, c.stair, { radial: 4 }));
    });
    shell.push(o.rod([St.inner[1] - 0.015, 0, St.top[1] - 0.015], [St.inner[1] - 0.015, top - 0.04, St.top[1] - 0.015], 0.014, c.stair, { radial: 4 }));

    /* the roof terrace: teak planks in alternating tones, a low glass balustrade with caps */
    var Dk = R.deck, pd = (bd - 0.02) / Dk.planks;
    for (var p = 0; p < Dk.planks; p++) {
      shell.push(o.box(bw - 0.02, Dk.t, pd - 0.008, c.deck, { tone: p % 2 ? 'hi' : 'base', p: [bx, Dk.y + Dk.t / 2, Bk.z0 + 0.01 + pd * (p + 0.5)] }));
    }
    var Rl = R.rail, ry = top + Rl.h / 2, edge = 0.015, fx1 = Bk.x1 - Rl.gapX - edge, fx0 = Bk.x0 + edge;
    [
      { w: fx1 - fx0, d: Rl.t, x: (fx0 + fx1) / 2, z: Bk.z1 - edge },
      { w: Rl.t, d: bd - 2 * edge, x: Bk.x0 + edge, z: bz },
      { w: bw - 2 * edge, d: Rl.t, x: bx, z: Bk.z0 + edge }
    ].forEach(function (q) {
      lights.add(G.paintBy(G.t(G.slab(q.w, Rl.h, q.d, 0), { p: [q.x, ry, q.z] }), function (v) { return v.ny > 0.7 ? [c.rail, 'hi'] : c.rail; }), 'rail', 0);
      shell.push(o.box(q.w + 0.012, 0.016, q.d + 0.012, c.frame, { p: [q.x, top + Rl.h + 0.008, q.z] }));
    });
    /* the festoon: two posts, a sagging wire, 9 Edison bulbs */
    var ptop = top + R.postH, bulbs = festoon(), wire = [[R.posts[0][0], ptop, R.posts[0][1]]];
    R.posts.forEach(function (q) { shell.push(o.tube(0.016, 0.02, R.postH, c.frame, { radial: 6, p: [q[0], top + R.postH / 2, q[1]] })); });
    bulbs.forEach(function (b) { wire.push([b.x, b.wireY, b.z]); });
    wire.push([R.posts[1][0], ptop, R.posts[1][1]]);
    shell.push(G.paint(G.ribbon(wire, 0.005, { segments: o.rad(16) }), c.frame));
    bulbs.forEach(function (b) { lights.add(o.tube(0.011, 0.02, 0.045, c.bulb, { radial: 6, p: [b.x, b.wireY - 0.03, b.z] }), 'bulb', b.i); });
    /* the accent LED lines (stripe pattern) */
    var cornice = [bw + 0.06, 0.016, 0.01, bx, 1.53, zf + 0.026];
    (t.stripe === 'B'
      ? [[0.014, 1.38, 0.01, Bk.x0 + 0.004, 0.79, zf + 0.026], [0.014, 1.38, 0.01, Bk.x1 - 0.004, 0.79, zf + 0.026]]
      : t.stripe === 'C' ? [[dw + 0.06, 0.016, 0.01, dx, Dr.h + 0.065, zf + 0.036], cornice] : [cornice]
    ).forEach(function (q) { lights.add(o.box(q[0], q[1], q[2], acc, { p: [q[3], q[4], q[5]] }), 'accent', 0); });
    /* the telescope: tripod in the shell, the tube on the 'scope' pivot (aimed at the city, -z) */
    var Sc = R.scope, head = [Sc.x, top + Sc.head, Sc.z];
    for (var l = 0; l < 3; l++) {
      var la = (l * 120 + 30) * DEG;
      shell.push(o.rod(head, [Sc.x + Math.sin(la) * 0.13, top, Sc.z + Math.cos(la) * 0.13], 0.008, c.scope, { radial: 3, open: true }));
    }
    shell.push(o.box(0.05, 0.04, 0.05, c.scope, { tone: 'shade', p: [head[0], head[1] - 0.02, head[2]] }));
    var el = Sc.elev * DEG, dir = [0, Math.sin(el), -Math.cos(el)], rd = alignY(dir[0], dir[1], dir[2]), hy = head[1] + 0.025;
    scope.push(o.shade(G.t(G.tube(0.045, 0.032, Sc.len, { radial: o.rad(12) }), { r: rd, p: [head[0] + dir[0] * 0.05, hy + dir[1] * 0.05, head[2] + dir[2] * 0.05] }), c.scope, 0.5, -0.5));
    var reach = 0.05 + Sc.len / 2, fr = [head[0] + dir[0] * reach, hy + dir[1] * reach, head[2] + dir[2] * reach];
    scope.push(o.tube(0.047, 0.047, 0.01, c.glass, { radial: 12, r: rd, p: fr }));
    scope.push(o.tube(0.014, 0.014, 0.07, c.frame, { radial: 6, r: rd, p: [head[0] - dir[0] * 0.14, hy - dir[1] * 0.14, head[2] - dir[2] * 0.14] }));
    /* the potted palm in the back corner: its tallest frond tops the building at the look height */
    var Pm = R.palm, crown = [Pm.x + 0.04, top + Pm.pot + Pm.trunk, Pm.z], fl = Pm.frond;
    shell.push(o.shade(G.t(G.tube(0.085, 0.065, Pm.pot, { radial: o.rad(10) }), { p: [Pm.x, top + Pm.pot / 2, Pm.z] }), c.pot));
    shell.push(o.rod([Pm.x, top + Pm.pot - 0.01, Pm.z], crown, 0.022, c.deck, { radial: 6 }));
    var lookH = ctx.look && ctx.look.h > 0 ? ctx.look.h : 2.3;
    var elevMax = Math.asin(Math.max(-1, Math.min(1, (lookH - crown[1]) / fl))) / DEG;
    [elevMax, 18, -12, 30, 4, 22].forEach(function (e, i) {
      var yaw = (i * 60 + 15) * DEG, er = e * DEG, d = [Math.cos(er) * Math.sin(yaw), Math.sin(er), Math.cos(er) * Math.cos(yaw)];
      var cone = G.t(G.cone(0.045, fl, 4), { s: [1, 1, 0.3] });
      shell.push(G.paint(G.t(cone, { r: alignY(d[0], d[1], d[2]), p: [crown[0] + d[0] * fl / 2, crown[1] + d[1] * fl / 2, crown[2] + d[2] * fl / 2] }), c.palm, i % 2 ? 'shade' : 'base'));
    });
    /* a rooftop AC unit */
    shell.push(o.shade(G.t(G.slab(0.24, 0.14, 0.18, 0), { p: [R.ac.x, top + 0.07, R.ac.z] }), c.pot));
    shell.push(o.disc(0.055, 0.01, c.frame, { radial: 10, r: [-90, 0, 0], p: [R.ac.x, top + 0.145, R.ac.z] }));
    /* the beanbags on the 'deck' pivot (they squish about the deck surface between them) */
    R.beans.forEach(function (b) {
      deck.push(o.shade(G.t(G.puff(b.r), { s: [1.12, 0.6, 1], r: [0, b.yaw, 0], p: [b.x, top + b.r * 0.6, b.z] }), c[b.tok], 0.55, -0.4));
    });

    var bm = bulbs[Math.floor(R.bulbs / 2)], seat = R.beans[0], bl = bulbs[1], br = bulbs[R.bulbs - 2];
    var tpl = ctx.K.template(ctx)
      .part('shell', shell, 'toon', { castShadow: true })
      .pivot('bulbs', [bm.x, bm.wireY, bm.z])
      .part('lights', lights.list, 'state', { pivot: 'bulbs', perCopy: true })
      .pivot('deck', [(R.beans[0].x + R.beans[1].x) / 2, top, (R.beans[0].z + R.beans[1].z) / 2])
      .part('deck', deck, 'toon', { pivot: 'deck' })
      .pivot('scope', head)
      .part('scope', scope, 'toon', { pivot: 'scope' })
      .anchor('top', [0, topOf(ctx, 2.3), 0])
      .anchor('spot', [dx, 0, zf + 0.25])
      .anchor('roof', [seat.x, top + seat.r * 1.2, seat.z])
      .anchor('stair', [ox, 0, St.front])
      .anchor('scope', [fr[0], fr[1] + 0.12, fr[2]])
      .anchor('bulbL', [bl.x, bl.wireY - 0.03, bl.z])
      .anchor('bulbM', [bm.x, bm.wireY - 0.03, bm.z])
      .anchor('bulbR', [br.x, br.wireY - 0.03, br.z])
      .done();
    if (META && tpl) META.set(tpl, { lights: lights.meta(), trim: t, windows: wins.length + 1 });
    return tpl;
  }

  /* one hooded crowd silhouette raising a ✦ stick (≤ 48 triangles, no face) */
  function fanGeo(o, f, bodyTok, wandTok) {
    var G = o.G, h = f.h, bh = h * 0.64, hood = h - bh + 0.03, a = f.arm;
    var sh = [f.x + a * 0.06, bh * 0.92], tip = [f.x + a * 0.1, h + 0.13], len = Math.sqrt(Math.pow(tip[0] - sh[0], 2) + Math.pow(tip[1] - sh[1], 2));
    return G.merge([
      G.paint(G.t(G.tube(0.058, 0.082, bh, { radial: o.rad(5), open: true }), { p: [f.x, bh / 2, f.z] }), bodyTok),
      G.paint(G.t(G.cone(0.07, hood, o.rad(5)), { p: [f.x, bh + hood / 2 - 0.03, f.z] }), bodyTok, 'hi'),
      G.paint(G.t(G.slab(0.016, len, 0.016, 0), { r: [0, 0, -Math.atan2(tip[0] - sh[0], tip[1] - sh[1]) / DEG], p: [(sh[0] + tip[0]) / 2, (sh[1] + tip[1]) / 2, f.z + 0.02] }), bodyTok, 'shade'),
      G.paint(G.t(G.cone(0.028, 0.035, 4), { s: [1, 1, 0.5], p: [tip[0], tip[1] + 0.0175, f.z + 0.02] }), wandTok),
      G.paint(G.t(G.cone(0.028, 0.035, 4), { s: [1, 1, 0.5], r: [0, 0, 180], p: [tip[0], tip[1] - 0.0175, f.z + 0.02] }), wandTok)
    ]);
  }

  function buildStage(ctx) {
    var o = ops(ctx), G = o.G, c = colorsOf(ctx), t = trimFor(ctx.id, variantOfCtx(ctx)), side = sideOf(t), acc = t.accent;
    var Dk = S.deck, dd = Dk.z1 - Dk.z0, dz = (Dk.z0 + Dk.z1) / 2;
    var shell = [], lights = new Rec(), beams = new Rec(), wall = [], crowd = [];
    /* the deck, its front skirt (stripe pattern) and the corner steps */
    shell.push(o.shade(G.t(G.slab(2 * Dk.x, Dk.h, dd, { arch: true }), { p: [0, Dk.h / 2, dz] }), c.deck, 0.6, -0.5));
    var sk = Dk.z1 + 0.004, skH = Dk.h - 0.07, i, j;
    if (t.stripe === 'B') {
      for (i = 0; i < 10; i++) shell.push(o.box(0.022, skH * 1.1, 0.008, c.step, { r: [0, 0, i % 2 ? 30 : -30], p: [-1.08 + i * 0.24, 0.02 + skH / 2, sk] }));
    } else if (t.stripe === 'C') {
      [0.08, 0.17].forEach(function (y) { shell.push(o.box(2 * Dk.x - 0.08, 0.03, 0.008, c.step, { p: [0, y, sk] })); });
    } else {
      for (i = 0; i < 11; i++) shell.push(o.box(0.03, skH, 0.008, c.step, { p: [-1.2 + i * 0.24, 0.02 + skH / 2, sk] }));
    }
    var Sp = S.steps, sh = Dk.h / (Sp.n + 1), sd = (Sp.z1 - Sp.z0) / Sp.n;
    [-1, 1].forEach(function (s) {
      for (var k = 0; k < Sp.n; k++) {
        var h = sh * (k + 1);
        shell.push(o.shade(G.t(G.slab(Sp.x1 - Sp.x0, h, sd, 0), { p: [s * (Sp.x0 + Sp.x1) / 2, h / 2, Sp.z1 - sd * (k + 0.5)] }), c.step));
      }
    });
    /* the LED wall's bezel and its back legs */
    var Bz = S.bezel;
    shell.push(o.shade(G.t(G.slab(2 * Bz.x, Bz.y1 - Bz.y0, Bz.d, 0), { p: [0, (Bz.y0 + Bz.y1) / 2, Bz.z] }), c.bezel));
    [-1, 1].forEach(function (s) { shell.push(o.box(0.05, Bz.y0 - Dk.h + 0.02, 0.05, c.truss, { p: [s * (Bz.x - 0.15), (Bz.y0 + Dk.h) / 2, Bz.z] })); });
    /* box-truss towers: 4 chords and zig-zag braces on every face, base plates, top caps */
    var Tw = S.tower, hf = Tw.half, nb = o.low ? Tw.braces - 2 : Tw.braces;
    var CORNER = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    [-1, 1].forEach(function (s) {
      var x = s * Tw.x;
      shell.push(o.box(0.22, 0.02, 0.22, c.truss, { p: [x, 0.01, Tw.z] }));
      CORNER.forEach(function (q) { shell.push(o.tube(0.016, 0.016, Tw.top, c.truss, { radial: 6, open: true, p: [x + q[0] * hf, Tw.top / 2, Tw.z + q[1] * hf] })); });
      for (var f = 0; f < 4; f++) {
        var a = CORNER[f], b = CORNER[(f + 1) % 4];
        for (var k = 0; k < nb; k++) {
          var p0 = k % 2 ? a : b, p1 = k % 2 ? b : a;
          shell.push(o.rod([x + p0[0] * hf, k * Tw.top / nb, Tw.z + p0[1] * hf], [x + p1[0] * hf, (k + 1) * Tw.top / nb, Tw.z + p1[1] * hf], 0.007, c.truss, { radial: 3, open: true }));
        }
      }
      shell.push(o.shade(G.t(G.slab(0.18, Tw.cap, 0.18, 0), { p: [x, Tw.top + Tw.cap / 2, Tw.z] }), c.truss));
    });
    /* the top truss: 4 chords along x, zig-zags on its front and bottom faces */
    var Tr = S.truss, span = 2 * (Tw.x - hf), nt = o.low ? Tr.braces - 4 : Tr.braces;
    [[Tr.y0, Tr.z0], [Tr.y0, Tr.z1], [Tr.y1, Tr.z0], [Tr.y1, Tr.z1]].forEach(function (q) {
      shell.push(o.tube(0.016, 0.016, span, c.truss, { radial: 6, open: true, r: [0, 0, 90], p: [0, q[0], q[1]] }));
    });
    for (i = 0; i < nt; i++) {
      var xa = -span / 2 + i * span / nt, xb = xa + span / nt;
      shell.push(o.rod([xa, i % 2 ? Tr.y1 : Tr.y0, Tr.z1], [xb, i % 2 ? Tr.y0 : Tr.y1, Tr.z1], 0.007, c.truss, { radial: 3, open: true }));
      shell.push(o.rod([xa, Tr.y0, i % 2 ? Tr.z1 : Tr.z0], [xb, Tr.y0, i % 2 ? Tr.z0 : Tr.z1], 0.007, c.truss, { radial: 3, open: true }));
    }
    /* speaker stacks at the front corners, floor monitors, the mic stand, the DJ booth */
    [-1, 1].forEach(function (s) {
      var x = s * S.speakers.x, z = S.speakers.z, y = Dk.h, mx = s * S.monitors.x;
      shell.push(o.shade(G.t(G.slab(0.26, 0.26, 0.22, 0), { p: [x, y + 0.13, z] }), c.speaker));
      shell.push(o.shade(G.t(G.slab(0.24, 0.2, 0.2, 0), { p: [x, y + 0.36, z] }), c.speaker));
      shell.push(o.disc(0.075, 0.012, c.cone, { radial: 12, p: [x, y + 0.12, z + 0.116] }));
      shell.push(o.disc(0.03, 0.012, c.cone, { radial: 8, p: [x, y + 0.225, z + 0.116] }));
      shell.push(o.disc(0.055, 0.012, c.cone, { radial: 10, p: [x, y + 0.36, z + 0.106] }));
      shell.push(o.shade(G.t(G.slab(0.26, 0.12, 0.16, 0), { r: [-25, 0, 0], p: [mx, y + 0.06, S.monitors.z] }), c.speaker));
      shell.push(o.disc(0.04, 0.01, c.cone, { radial: 8, r: [-25, 0, 0], p: [mx, y + 0.085, S.monitors.z + 0.07] }));
    });
    var mic = [side * S.mic.x, Dk.h, S.mic.z];
    shell.push(o.tube(0.055, 0.06, 0.014, c.truss, { radial: 10, p: [mic[0], mic[1] + 0.007, mic[2]] }));
    shell.push(o.rod(mic, [mic[0], mic[1] + 0.44, mic[2] + 0.02], 0.007, c.truss, { radial: 4 }));
    shell.push(o.tube(0.018, 0.014, 0.05, c.head, { radial: 6, r: [-20, 0, 0], p: [mic[0], mic[1] + 0.47, mic[2] + 0.03] }));
    var bxs = side * S.booth.x, bzs = S.booth.z;
    shell.push(o.shade(G.t(G.slab(0.42, 0.3, 0.24, 0), { p: [bxs, Dk.h + 0.15, bzs] }), c.step));
    [-1, 1].forEach(function (s) { shell.push(o.disc(0.06, 0.012, c.cone, { radial: 10, r: [-90, 0, 0], p: [bxs + s * 0.1, Dk.h + 0.306, bzs] })); });

    /* the LED wall: one 8-column plane (each column a wipe strip); its uv is set below */
    var Sc = S.screen;
    wall.push(G.paint(G.t(G.flag(2 * Sc.x, Sc.y1 - Sc.y0, Sc.strips, 1), { p: [-Sc.x, (Sc.y0 + Sc.y1) / 2, Sc.z] }), c.wall));

    /* lights: footlights (housing + lens), the LED Cyan edge, the accent strips */
    footLayout().forEach(function (f) {
      lights.add(o.box(0.12, 0.05, 0.07, c.foot, { tone: 'shade', r: [-12, 0, 0], p: [f.x, Dk.h + 0.025, f.z] }), 'footBody', f.i);
      lights.add(o.box(0.09, 0.03, 0.012, c.foot, { r: [-12, 0, 0], p: [f.x, Dk.h + 0.03, f.z + 0.038] }), 'foot', f.i);
    });
    lights.add(o.box(2 * Dk.x, 0.022, 0.012, c.edge, { p: [0, Dk.h - 0.012, Dk.z1 + 0.008] }), 'edge', 0);
    [-1, 1].forEach(function (s) { lights.add(o.box(0.012, 0.022, dd - 0.04, c.edge, { p: [s * (Dk.x + 0.006), Dk.h - 0.012, dz] }), 'edge', 0); });
    [-1, 1].forEach(function (s) { lights.add(o.box(0.012, 1.7, 0.012, acc, { p: [s * (Tw.x - hf - 0.012), 1.3, Tw.z + hf] }), 'accent', 0); });
    lights.add(o.box(0.38, 0.014, 0.008, acc, { p: [bxs, Dk.h + 0.2, bzs + 0.124] }), 'accent', 0);
    /* the 4 moving heads (authored hanging straight down, posed on the CPU), kept together
       at the end of the part so their position upload is one range; then their beams */
    for (i = 0; i < S.heads.length; i++) {
      var h = headOrigin(i);
      lights.add(o.box(0.12, 0.02, 0.06, c.head, { tone: 'hi', p: [h[0], h[1] - 0.01, h[2]] }), 'head', i);
      for (j = -1; j <= 1; j += 2) lights.add(o.box(0.014, 0.1, 0.04, c.head, { p: [h[0] + j * 0.062, h[1] - 0.06, h[2]] }), 'head', i);
      lights.add(o.shade(G.t(G.tube(0.05, 0.05, 0.12, { radial: o.rad(10) }), { p: [h[0], h[1] - 0.1, h[2]] }), c.head), 'head', i);
      lights.add(o.tube(0.042, 0.042, 0.01, c.lens, { radial: 10, p: [h[0], h[1] - S.lensDrop + 0.005, h[2]] }), 'lens', i);
      var ly = h[1] - S.lensDrop, Ry = S.ray;
      beams.add(G.paint(G.t(G.tube(0, Ry.r, Ry.len, { radial: o.rad(10), open: true }), { p: [h[0], ly - Ry.len / 2, h[2]] }), NEON4[i]), 'beam', i);
      beams.add(G.paint(G.t(G.tube(0, Ry.core, Ry.coreLen, { radial: o.rad(6), open: true }), { p: [h[0], ly - Ry.coreLen / 2, h[2]] }), NEON4[i]), 'beam', i);
    }

    /* the crowd: 12 silhouettes in the pit, sticks in the 4 neons and the accent (≤ 2 in 5) */
    var bodies = [c.step, c.deck, c.bezel], wands = [acc].concat(NEON4);
    crowdLayout().forEach(function (f) { crowd.push(fanGeo(o, f, bodies[f.i % 3], wands[(f.i * 2 + f.row) % 5])); });

    var b = ctx.K.template(ctx)
      .part('shell', shell, 'toon', { castShadow: true })
      .pivot('lights', [0, (Sc.y0 + Sc.y1) / 2, Sc.z])
      .part('wall', wall, 'led', { pivot: 'lights', perCopy: true, stateColor: { key: 'level', off: c.bezel, on: c.wall, initial: RULES.wallDay } })
      .part('lights', lights.list, 'state', { perCopy: true })
      .part('beams', beams.list, 'state', { perCopy: true, receiveShadow: false })
      .pivot('crowd', S.crowd.pivot)
      .part('crowd', crowd, 'state', { pivot: 'crowd', perCopy: true });
    for (i = 0; i < S.heads.length; i++) b.pivot('head' + i, headOrigin(i));
    var capTop = Tw.top + Tw.cap;
    b.anchor('top', [0, topOf(ctx, 2.45), 0])
      .anchor('spot', [0, Dk.h, 0.1])
      .anchor('deck', [0, Dk.h, 0])
      .anchor('cone0', [-Tw.x, capTop, Tw.z]).anchor('cone1', [0, Tr.y1 + 0.016, (Tr.z0 + Tr.z1) / 2]).anchor('cone2', [Tw.x, capTop, Tw.z])
      .anchor('stepL', [-(Sp.x0 + Sp.x1) / 2, 0, Sp.z1]).anchor('stepR', [(Sp.x0 + Sp.x1) / 2, 0, Sp.z1])
      .anchor('pit', [0, 0, 1.5])
      .anchor('foot', [0, Dk.h + 0.05, S.foot.z + 0.05]);
    [-0.72, -0.24, 0.24, 0.72].forEach(function (x, k) { b.anchor('mark' + k, [x, Dk.h, 0.1]); });
    var tpl = b.done();
    if (META && tpl) {
      /* the template's rest pose is the hidden state, so a placement ghost, a drop-in or a
         photocard never shows the crowd or a beam: their authored positions move into the
         meta and the geometry collapses onto the crowd pivot and the lenses */
      var bmeta = beams.meta(), lens = function (v) { var r = rangeAt(bmeta, v), h = headOrigin(r ? r.i : 0); return [h[0], h[1] - S.lensDrop, h[2]]; };
      META.set(tpl, {
        lights: lights.meta(), beams: bmeta, trim: t,
        crowdBase: collapse(partOf(tpl, 'crowd'), function () { return S.crowd.pivot; }),
        beamBase: collapse(partOf(tpl, 'beams'), lens)
      });
      var wp = partOf(tpl, 'wall');
      if (wp) setWallUv(ctx.K, wp);
    }
    return tpl;
  }
  function partOf(tpl, name) {
    var ps = tpl && tpl.parts;
    if (ps) for (var i = 0; i < ps.length; i++) if (ps[i].name === name) return ps[i];
    return null;
  }
  function rangeAt(meta, v) {
    for (var i = 0; i < meta.subs.length; i++) { var r = meta.subs[i]; if (v >= r.v0 && v < r.v0 + r.vn) return r; }
    return null;
  }
  /* copy a template part's positions out, then collapse every vertex onto at(v) → [x, y, z];
     returns the authored positions (null for geometry without a position buffer) */
  function collapse(part, at) {
    var geo = part && part.geo, pa = geo && typeof geo.getAttribute === 'function' ? geo.getAttribute('position') : null;
    if (!pa || !pa.array) return null;
    var arr = pa.array, base = new Float32Array(arr);
    for (var v = 0, n = arr.length / 3; v < n; v++) { var p = at(v); arr[v * 3] = p[0]; arr[v * 3 + 1] = p[1]; arr[v * 3 + 2] = p[2]; }
    pa.needsUpdate = true;
    if (typeof geo.computeBoundingBox === 'function') geo.computeBoundingBox();
    if (typeof geo.computeBoundingSphere === 'function') geo.computeBoundingSphere();
    return base;
  }
  /* give the wall's template geometry a uv attribute (the kit drops uv; every copy clones
     it and rewrites it): the photocard-safe star field at phase 0 */
  function setWallUv(K, part) {
    var geo = part.geo, T = K && K.THREE;
    if (!geo || !T || typeof T.BufferAttribute !== 'function' || typeof geo.getAttribute !== 'function' || typeof geo.setAttribute !== 'function') return;
    var pos = geo.getAttribute('position');
    if (!pos) return;
    var meta = wallMeta(pos.array);
    geo.setAttribute('uv', new T.BufferAttribute(wallUvInto(new Float32Array(meta.n * 2), meta, 'stars', 0, 'stars', 0, 1), 2));
  }

  /* ================================================================
     HANDLE HELPERS (allocation-free; they only call what the handle has)
     ================================================================ */
  var R3 = [0, 0, 0], P3 = [0, 0, 0], S3 = [1, 1, 1];
  function pose(a, name, rx, ry, rz, px, py, pz, sx, sy, sz) {
    var pv = a && typeof a.pivot === 'function' ? a.pivot(name) : null;
    if (!pv || typeof pv.set !== 'function') return;
    R3[0] = rx; R3[1] = ry; R3[2] = rz; P3[0] = px; P3[1] = py; P3[2] = pz; S3[0] = sx; S3[1] = sy; S3[2] = sz;
    pv.set(R3, P3, S3);
  }
  function rest(a, name) { pose(a, name, 0, 0, 0, 0, 0, 0, 1, 1, 1); }
  function timeOf(a) { return a && typeof a.t === 'number' && isFinite(a.t) ? a.t : 0; }
  function call(fn, self, x, y, z, w) { try { return fn.call(self, x, y, z, w); } catch (e) { return undefined; } }
  function copyGeo(a, part) {
    if (!a) return null;
    try {
      if (typeof a.copyGeometry === 'function') return a.copyGeometry(part) || null;
      if (a.batch && typeof a.batch.copyGeometry === 'function') return a.batch.copyGeometry(a.uid, part) || null;
      var ob = a.object, ms = ob && ob.userData && ob.userData.meshes;
      if (ms && ms[part] && ms[part].geometry) return ms[part].geometry;
    } catch (e) {}
    return null;
  }
  function attr(geo, name) {
    if (!geo) return null;
    if (typeof geo.getAttribute === 'function') return geo.getAttribute(name) || null;
    return (geo.attributes && geo.attributes[name]) || null;
  }
  function basePos(a, part) {
    try { if (a && typeof a.basePositions === 'function') return a.basePositions(part) || null; } catch (e) {}
    return null;
  }
  /* mark an attribute for upload. With a range, upload just [v0, v0 + vn) (three r170
     addUpdateRange), adding it only when it is not already pending, so frames that are
     never drawn neither allocate nor pile ranges up */
  function touch(at, v0, vn, size) {
    if (!at) return;
    var rs = at.updateRanges;
    if (size && vn > 0 && rs && typeof at.addUpdateRange === 'function') {
      var s = v0 * size, c = vn * size, p = rs.length ? rs[rs.length - 1] : null;
      if (!p || p.start !== s || p.count !== c) at.addUpdateRange(s, c);
    }
    at.needsUpdate = true;
  }
  /* exact (float32) equality: a static frame recomputes identical colours and uploads
     nothing, and a settling colour always lands exactly on its target */
  function same(arr, o, r, g, b) { return arr[o] === r && arr[o + 1] === g && arr[o + 2] === b; }
  /* fill vertices [v0, v0 + vn) of a colour array; true when anything changed */
  function fillColor(arr, v0, vn, col) {
    if (vn <= 0) return false;
    var r = Math.fround(col.r), g = Math.fround(col.g), b = Math.fround(col.b);
    if (same(arr, v0 * 3, r, g, b) && same(arr, (v0 + (vn >> 1)) * 3, r, g, b) && same(arr, (v0 + vn - 1) * 3, r, g, b)) return false;
    for (var v = 0, o = v0 * 3; v < vn; v++, o += 3) { arr[o] = r; arr[o + 1] = g; arr[o + 2] = b; }
    return true;
  }
  function fillAll(arr, ranges, col) {
    var dirty = false;
    for (var i = 0; i < ranges.length; i++) if (fillColor(arr, ranges[i].v0, ranges[i].vn, col)) dirty = true;
    return dirty;
  }
  function rangesOf(meta, kind) { return (meta && meta.by[kind]) || NONE; }

  /* ================================================================
     ACT BOOK — one live act per uid, driven by an SLMotion timeline.
     spec: {name, reduced, start?(a, rec), apply(a, out, t, rec), rest?(a, rec), emitAt(kind)}
     Act: {name, dur, update(a, tAct) → alive, cancel()}
     ================================================================ */
  var CARRY_WINDOW = 0.25;            /* a cancel this recent is an interruption: carry the pose */
  function makeBook() {
    var recs = new Map();
    function live(uid) { var r = recs.get(uid); return r && !r.done ? r : null; }
    function fire(rec, h, t) {
      var cues = rec.cues;
      while (rec.ci < cues.length && cues[rec.ci].t <= t + 1e-6) {
        var cu = cues[rec.ci++];
        if (cu.sfx) { if (typeof h.sfx === 'function') call(h.sfx, h, cu.sfx, cu.vol, cu.step); }
        else if (cu.emit && typeof h.emit === 'function') call(h.emit, h, cu.emit, rec.spec.emitAt(cu.emit), cu.n);
      }
    }
    function step(rec, h, tAct) {
      if (rec.done) return false;
      if (h) rec.h = h; else h = rec.h;
      var M = mo(), t = +tAct;
      if (!(t >= 0)) t = 0;
      rec.lastT = timeOf(h);
      fire(rec, h, t);
      var tt = t < rec.dur ? t : rec.dur;
      M.sample(rec.name, tt, rec.out, rec.o);
      rec.spec.apply(h, rec.out, tt, rec);
      if (t >= rec.dur) {
        rec.done = true;
        if (recs.get(rec.uid) === rec) recs.delete(rec.uid);
        return false;
      }
      return true;
    }
    function cancel(rec) {
      if (rec.done) return;
      rec.done = true; rec.cancelled = true;
      var h = rec.h;                 /* only rest it through a handle still bound to this uid */
      if (h && h.uid === rec.uid && rec.spec.rest) { try { rec.spec.rest(h, rec); } catch (e) {} }
    }
    function start(a, spec) {
      var M = mo();
      if (!a || !M || !M.ACTS || !M.ACTS[spec.name]) return null;
      var uid = a.uid, prev = recs.get(uid), now = timeOf(a), from = null;
      if (prev && prev.name === spec.name &&
          (!prev.done || (prev.cancelled && Math.abs(now - prev.lastT) <= CARRY_WINDOW))) from = M.carry(spec.name, prev.out);
      if (prev && !prev.done) { prev.done = true; prev.superseded = true; }   /* never two on one uid */
      var o = { reduced: !!spec.reduced, from: from };
      var rec = {
        uid: uid, name: spec.name, spec: spec, o: o, out: {}, cues: M.cues(spec.name, o), ci: 0,
        dur: M.durOf(spec.name, o), done: false, cancelled: false, superseded: false, lastT: now, h: a
      };
      recs.set(uid, rec);
      if (spec.start) spec.start(a, rec);
      return {
        name: spec.name, dur: rec.dur,
        update: function (h, tAct) { return step(rec, h, tAct); },
        cancel: function () { cancel(rec); }
      };
    }
    return { live: live, start: start, size: function () { return recs.size; } };
  }
  /* the pet's part: perform(kind, uid) → lead seconds; ≤ 0 or a throw = no pet (the
     building animates alone either way) */
  function askPet(a, kind) {
    var p = a && a.pets;
    if (!p || typeof p.perform !== 'function') return 0;
    try { var r = p.perform(kind, a.uid); return typeof r === 'number' && r > 0 ? r : 0; } catch (e) { return 0; }
  }

  /* ================================================================
     FACTORY — SL3D.defineModels('stage', (K, SL3D) → {id: handlers})
     ================================================================ */
  function factory(K) {
    /* the child (setUser): the member colour for trim-0 accents and the deck's 5th hue */
    var USER = { name: '', color: null, ver: 0 };
    function normHex(h) { var m = typeof h === 'string' ? /^#?([0-9a-f]{6})$/i.exec(h.trim()) : null; return m ? '#' + m[1].toUpperCase() : null; }
    function setUser(u) {
      u = u || {};
      var name = typeof u.name === 'string' ? u.name : USER.name;
      var color = u.color === null ? null : (normHex(u.color) || USER.color);
      if (name !== USER.name || color !== USER.color) { USER.name = name; USER.color = color; USER.ver++; }
      if (K && typeof K.ledAtlas === 'function') { try { K.ledAtlas().setUser({ name: name, color: color }); } catch (e) {} }
      return USER.ver;
    }
    /* a controller that hands the user on the handle is honoured too */
    function syncUser(a) {
      var u = a && a.user;
      if (u && typeof u === 'object' && ((normHex(u.color) || null) !== USER.color || (typeof u.name === 'string' && u.name !== USER.name))) setUser(u);
    }

    /* linear rgb per token (cached) and the member colour */
    var cols = {}, memberC = { r: 1, g: 1, b: 1, hex: null };
    function col(token) {
      var c = cols[token];
      if (c) return c;
      var v = K && typeof K.col === 'function' ? K.col(token) : null;
      return (cols[token] = v ? { r: v.r, g: v.g, b: v.b } : { r: 1, g: 1, b: 1 });
    }
    function member() {
      if (!USER.color) return null;
      if (memberC.hex !== USER.color) {
        var v = K && typeof K.rgb === 'function' ? K.rgb(USER.color) : null;
        if (!v) return null;
        memberC.r = v.r; memberC.g = v.g; memberC.b = v.b; memberC.hex = USER.color;
      }
      return memberC;
    }
    /* the trim accent: the member colour on the island (never on a photocard) for trim 0 */
    function accentCol(a, trim) {
      if (trim && trim.accent === '@member' && island(a)) { var m = member(); if (m) return m; }
      return col(trim ? trim.accent : '@member');
    }
    function island(a) { return !!(a && a.batch); }
    function lookColor(id, part) { var lk = lookOf(id), c = lk && lk.colors; return (c && typeof c[part] === 'string' && c[part]) || DEF[id][part]; }
    function lookShow(id, key) { var lk = lookOf(id); return (lk && lk.show && lk.show[key]) || null; }
    var C1 = { r: 0, g: 0, b: 0 }, C2 = { r: 0, g: 0, b: 0 }, C3 = { r: 0, g: 0, b: 0 };
    /* the beat count, advanced when the handle's beat fraction wraps (once per clock tick) */
    function beatOf(st, a) {
      var t = timeOf(a);
      if (st.beatT === t) return st.frac;
      st.beatT = t;
      var f = typeof a.beat === 'number' && isFinite(a.beat) ? frac(a.beat) : 0;
      if (st.lastFrac >= 0 && f < st.lastFrac - 0.5) st.beatN++;
      st.lastFrac = f; st.frac = f;
      return f;
    }
    /* per-uid state; a copy whose geometry changed (a restyle, or a new photocard that
       reuses a uid) starts from fresh caches */
    function stateOf(map, a, make, keyPart) {
      var s = map.get(a.uid);
      if (!s) { s = make(); map.set(a.uid, s); }
      var g = copyGeo(a, keyPart);
      if (s.geo !== g) { var keep = s; s = make(); s.k = keep.k; s.beatN = keep.beatN || 0; s.hold = keep.hold; s.geo = g; map.set(a.uid, s); }
      return s;
    }

    /* ---------- Dance Studio ---------- */
    var dBook = makeBook(), dState = new Map();
    function dNew() { return { geo: undefined, k: 0, beatN: 0, lastFrac: -1, beatT: null, frac: 0, userVer: -1, still: false }; }
    function dSt(a) { return stateOf(dState, a, dNew, 'floor'); }
    function dancePaint(a, st, chase) {
      var g = copyGeo(a, 'floor'), meta = metaOf(a, 'floor'), ca = attr(g, 'color');
      if (!meta || !ca || !ca.array) return;
      var f = beatOf(st, a), red = !!a.reduced, k = st.k, amt = Math.max(clamp01(chase), k), arr = ca.array, dirty = false;
      var accent = accentCol(a, metaAll(a).trim), white = col(lookColor('bld_dance', 'floor'));
      var tiles = rangesOf(meta, 'tile');
      for (var i = 0; i < tiles.length; i++) {
        var r = tiles[i], T = TILES[r.i], hi = tileHue(r.i, st.beatN, amt, red);
        mixInto(C1, hi < 4 ? col(NEON4[hi]) : accent, white, 0.55 * (1 - amt));
        if (fillColor(arr, r.v0, r.vn, scaleInto(C1, C1, tileLevel(T.cx, T.cz, st.beatN, f, amt, red)))) dirty = true;
      }
      if (fillAll(arr, rangesOf(meta, 'fin'), scaleInto(C2, accent, lerp(0.8, 1, k)))) dirty = true;
      if (fillAll(arr, rangesOf(meta, 'sign'), scaleInto(C2, col(lookColor('bld_dance', 'sign')), lerp(0.85, 1, k)))) dirty = true;
      mixInto(C2, scaleInto(C3, white, 0.55), col(lookColor('bld_dance', 'glow')), k);
      if (fillAll(arr, rangesOf(meta, 'down'), C2)) dirty = true;
      if (fillAll(arr, rangesOf(meta, 'cove'), C2)) dirty = true;
      if (dirty) touch(ca);
      st.userVer = USER.ver;
    }
    function danceShow(a, k) {
      var st = dSt(a);
      syncUser(a);
      st.k = clamp01(+k || 0);
      if (!dBook.live(a.uid)) dancePaint(a, st, 0);
      st.still = false;
      var hs = lookShow('bld_dance', 'halo');
      if (typeof a.halo === 'function') call(a.halo, a, 'sign', st.k > RULES.nightOn, hs && hs.size || 0.9, hs && hs.token || lookColor('bld_dance', 'sign'));
    }

    /* ---------- Rooftop Hangout ---------- */
    var rBook = makeBook(), rState = new Map();
    function rNew() { return { geo: undefined, k: 0, userVer: -1, painted: false }; }
    function rSt(a) { return stateOf(rState, a, rNew, 'lights'); }
    function roofPaint(a, st, wave) {
      var g = copyGeo(a, 'lights'), meta = metaOf(a, 'lights'), ca = attr(g, 'color');
      if (!meta || !ca || !ca.array) return;
      var m = metaAll(a), k = st.k, red = !!a.reduced, t = timeOf(a), arr = ca.array, dirty = false, i, r;
      var off = col(lookColor('bld_rooftop', 'bulb')), on = col(lookColor('bld_rooftop', 'bulbOn'));
      var bulbs = rangesOf(meta, 'bulb');
      for (i = 0; i < bulbs.length; i++) {
        r = bulbs[i];
        if (fillColor(arr, r.v0, r.vn, mixInto(C1, off, on, clamp01(bulbLevel(r.i, t, wave, k, red))))) dirty = true;
      }
      var gOff = col(lookColor('bld_rooftop', 'glass')), gOn = col(lookColor('bld_rooftop', 'glassGlow')), wins = rangesOf(meta, 'win');
      for (i = 0; i < wins.length; i++) {
        r = wins[i];
        if (fillColor(arr, r.v0, r.vn, mixInto(C1, gOff, gOn, 0.92 * windowLevel(r.i, m.windows, k)))) dirty = true;
      }
      if (fillAll(arr, rangesOf(meta, 'accent'), scaleInto(C2, accentCol(a, m.trim), lerp(0.8, 1, k)))) dirty = true;
      if (dirty) touch(ca);
      st.userVer = USER.ver; st.painted = true;
    }
    var BULB_HALOS = ['bulbL', 'bulbM', 'bulbR'];
    function roofShow(a, k) {
      var st = rSt(a);
      syncUser(a);
      st.k = clamp01(+k || 0);
      var live = rBook.live(a.uid);
      roofPaint(a, st, live ? live.out.wave || 0 : 0);
      var on = st.k > RULES.nightOn, hs = lookShow('bld_rooftop', 'halo'), dc = lookShow('bld_rooftop', 'decal');
      if (typeof a.halo === 'function') {
        for (var i = 0; i < BULB_HALOS.length; i++) call(a.halo, a, BULB_HALOS[i], on, hs && hs.size || 0.25, hs && hs.token || lookColor('bld_rooftop', 'bulbOn'));
      }
      if (typeof a.decal === 'function') call(a.decal, a, on, dc && dc.token || 'Electric Violet');
    }
    function roofApply(a, out) {
      pose(a, 'scope', out.scope || 0, 0, 0, 0, 0, 0, 1, 1, 1);
      var s = out.squish == null ? 1 : out.squish, xz = 1 + (1 - s) * 0.5;
      pose(a, 'deck', 0, 0, 0, 0, 0, 0, xz, s, xz);
      roofPaint(a, rSt(a), out.wave || 0);
    }
    function roofRest(a) { rest(a, 'scope'); rest(a, 'deck'); roofPaint(a, rSt(a), 0); }

    /* ---------- Concert Stage ---------- */
    var sBook = makeBook(), sState = new Map(), HP = { pan: 0, tilt: 0 }, CP = { s: 1, y: 0 };
    function sNew() {
      return { geo: undefined, k: 0, beatN: 0, lastFrac: -1, beatT: null, frac: 0, userVer: -1, wallLvl: -1, frameT: null,
               wall: { cur: 'stars', prev: 'stars', wipe: 1, t0: 0, last: null, base: 0 },
               hold: -1, crowd: 0, crowdW: -1, crowdUp: false, angles: new Float32Array(8).fill(NaN), vis: -1, beamsUp: false };
    }
    function sSt(a) { return stateOf(sState, a, sNew, 'lights'); }
    var FADE = typeof WeakMap === 'function' ? new WeakMap() : null, WALL = typeof WeakMap === 'function' ? new WeakMap() : null;
    /* per-vertex beam brightness from the rest geometry: 1 at the lens, 0.3 at the far end */
    function beamFade(base, n) {
      var f = FADE && FADE.get(base);
      if (f) return f;
      f = new Float32Array(n);
      var ly = S.hangY - S.lensDrop;
      for (var v = 0; v < n; v++) f[v] = 1 - 0.7 * clamp01((ly - base[v * 3 + 1]) / S.ray.len);
      if (FADE) FADE.set(base, f);
      return f;
    }
    function wallMetaFor(base) {
      var m = WALL && WALL.get(base);
      if (!m) { m = wallMeta(base); if (WALL) WALL.set(base, m); }
      return m;
    }
    function wallWant(a, st) {
      if (timeOf(a) < st.hold) return 'encore';
      if (st.k < 0.5) return 'stars';
      return showProgram(a.bar | 0, island(a) && !!USER.name);
    }
    function poseRanges(out, base, ranges, i, h, cp, sp, ct, stt) {
      for (var k = 0; k < ranges.length; k++) {
        var r = ranges[k];
        if (r.i !== i) continue;
        for (var v = r.v0, e = r.v0 + r.vn; v < e; v++) rotAbout(base[v * 3], base[v * 3 + 1], base[v * 3 + 2], h, cp, sp, ct, stt, out, v * 3);
      }
    }
    /* the whole stage frame: wall, footlights, heads and lenses, beams, crowd (act out or null) */
    function stagePaint(a, st, out, tAct) {
      var t = timeOf(a), red = !!a.reduced, f = beatOf(st, a), k = st.k, m = metaAll(a);
      if (!m) return;
      var heads = out ? out.heads || 0 : 0, chase = out ? out.chase || 0 : 0, beams = out ? out.beams || 0 : 0, i, r;
      /* -- the LED wall: a strip wipe toward the wanted program, ≥ RULES.screenGap s apart -- */
      var W = st.wall, M = mo();
      if (out) W.wipe = red ? 1 : Math.max(W.base, clamp01(out.wall));
      else {
        var want = wallWant(a, st);
        if (W.wipe < 1) W.wipe = red ? 1 : clamp01((t - W.t0) / RULES.wipeSec);
        if (want !== W.cur && W.wipe >= 1 && (red || !M || M.allow(W.last, t, RULES.screenGap))) {
          W.prev = W.cur; W.cur = want; W.t0 = t; W.last = t; W.wipe = red ? 1 : 0;
        }
      }
      var wu = attr(copyGeo(a, 'wall'), 'uv'), wb = basePos(a, 'wall');
      if (wu && wu.array && wb) {
        var wm = wallMetaFor(wb);
        if (wm.n * 2 <= wu.array.length) {
          wallUvInto(wu.array, wm, W.cur, progPhase(W.cur, t, st.beatN, f, red), W.prev, progPhase(W.prev, t, st.beatN, f, red), W.wipe);
          wu.needsUpdate = true;
        }
      }
      var lvl = lerp(RULES.wallDay, RULES.wallShow, k);
      if (st.wallLvl !== lvl && typeof a.state === 'function') { st.wallLvl = lvl; call(a.state, a, 'level', lvl); }
      /* -- lights: footlights, lens colours and accents; head positions when they move -- */
      var lg = copyGeo(a, 'lights'), lm = m.lights, lc = attr(lg, 'color'), lp = attr(lg, 'position'), vis = beamVis(beams, k);
      if (lc && lc.array) {
        var arr = lc.array, dirty = false, amt = Math.max(chase, k);
        var off = col(lookColor('bld_stage', 'foot')), on = col(lookColor('bld_stage', 'footOn')), lens = col(lookColor('bld_stage', 'lens'));
        var foots = rangesOf(lm, 'foot'), lenses = rangesOf(lm, 'lens');
        for (i = 0; i < foots.length; i++) {
          r = foots[i];
          if (fillColor(arr, r.v0, r.vn, mixInto(C1, off, on, clamp01(footLevel(r.i, st.beatN, f, amt, k, red))))) dirty = true;
        }
        scaleInto(C2, lens, 0.45);
        for (i = 0; i < lenses.length; i++) {
          r = lenses[i];
          if (fillColor(arr, r.v0, r.vn, mixInto(C1, C2, col(NEON4[r.i % 4]), vis))) dirty = true;
        }
        if (fillAll(arr, rangesOf(lm, 'accent'), scaleInto(C3, accentCol(a, m.trim), lerp(0.8, 1, k)))) dirty = true;
        if (dirty) touch(lc);
      }
      var lb = basePos(a, 'lights'), heads0 = rangesOf(lm, 'head'), lens0 = rangesOf(lm, 'lens'), moved = false;
      for (i = 0; i < HEAD_O.length; i++) {
        headPose(i, t, k, heads, red, HP);
        var pa = st.angles[i * 2], ta = st.angles[i * 2 + 1];
        if (pa === pa && Math.abs(HP.pan - pa) <= 0.01 && Math.abs(HP.tilt - ta) <= 0.01) continue;
        st.angles[i * 2] = HP.pan; st.angles[i * 2 + 1] = HP.tilt; moved = true;
        if (lb && lp && lp.array) {
          var cp = Math.cos(HP.pan * DEG), sp = Math.sin(HP.pan * DEG), ct = Math.cos(HP.tilt * DEG), stt = Math.sin(HP.tilt * DEG);
          poseRanges(lp.array, lb, heads0, i, HEAD_O[i], cp, sp, ct, stt);
          poseRanges(lp.array, lb, lens0, i, HEAD_O[i], cp, sp, ct, stt);
        }
      }
      if (moved && lp && heads0.length && lens0.length) {
        var h0 = heads0[0].v0, h1 = lens0[lens0.length - 1].v0 + lens0[lens0.length - 1].vn;
        touch(lp, h0, h1 - h0, 3);
      }
      /* -- beams: colour by visibility, posed with their heads while visible, collapsed onto
         the lens when hidden -- */
      var bg = copyGeo(a, 'beams'), bm = m.beams, bc = attr(bg, 'color'), bp = attr(bg, 'position'), bb = m.beamBase || basePos(a, 'beams');
      if (bm && bc && bp && bb && bc.array && bp.array) {
        var up = vis > 0.004;
        if (Math.abs(vis - st.vis) > 0.004 || (up && moved) || up !== st.beamsUp) {
          var fade = beamFade(bb, bm.n);
          for (i = 0; i < bm.subs.length; i++) {
            r = bm.subs[i];
            var hc = col(NEON4[r.i % 4]), h = HEAD_O[r.i], an = r.i * 2;
            var cp2 = Math.cos(st.angles[an] * DEG), sp2 = Math.sin(st.angles[an] * DEG), ct2 = Math.cos(st.angles[an + 1] * DEG), st2 = Math.sin(st.angles[an + 1] * DEG);
            for (var v = r.v0, e = r.v0 + r.vn; v < e; v++) {
              var w = up ? vis * fade[v] : 0, o3 = v * 3;
              bc.array[o3] = hc.r * w; bc.array[o3 + 1] = hc.g * w; bc.array[o3 + 2] = hc.b * w;
              if (up) rotAbout(bb[o3], bb[o3 + 1], bb[o3 + 2], h, cp2, sp2, ct2, st2, bp.array, o3);
              else { bp.array[o3] = h[0]; bp.array[o3 + 1] = h[1] - S.lensDrop; bp.array[o3 + 2] = h[2]; }
            }
          }
          touch(bc); touch(bp);
          st.vis = vis; st.beamsUp = up;
        }
      }
      /* -- the crowd: up for the act and the encore hold (never under reduced motion) -- */
      var u = red ? 0 : crowdU(out ? tAct : null, t, st.hold > 0 ? st.hold : null, st.crowd), shown = u > 0.001;
      st.crowd = u;
      if (shown !== st.crowdUp) {
        /* the fans' geometry stands up in the copy only while it shows (collapsed otherwise) */
        var cpa = attr(copyGeo(a, 'crowd'), 'position'), cb = m.crowdBase;
        if (cpa && cpa.array && cb && cb.length === cpa.array.length) {
          if (shown) cpa.array.set(cb);
          else for (i = 0; i < cpa.array.length; i += 3) { cpa.array[i] = S.crowd.pivot[0]; cpa.array[i + 1] = S.crowd.pivot[1]; cpa.array[i + 2] = S.crowd.pivot[2]; }
          touch(cpa);
        }
        st.crowdUp = shown;
      }
      if (shown || st.crowdW !== 0) {
        crowdPose(u, f, red, CP);
        pose(a, 'crowd', 0, 0, 0, 0, CP.y, 0, CP.s, CP.s, CP.s);
        st.crowdW = shown ? u : 0;
      }
      st.userVer = USER.ver;
    }
    function stageShow(a, k) {
      var st = sSt(a);
      syncUser(a);
      st.k = clamp01(+k || 0);
      if (!sBook.live(a.uid)) stagePaint(a, st, null, null);
      if (typeof a.halo === 'function') {
        var on = st.k > RULES.nightOn, hs = lookShow('bld_stage', 'halo');
        call(a.halo, a, 'foot', on, hs && hs.size || 0.4, hs && hs.token || lookColor('bld_stage', 'footOn'));
        for (var i = 0; i < HEAD_O.length; i++) call(a.halo, a, HEAD_NAMES[i], on, 0.35, NEON4[i]);
      }
    }

    var EMIT_AT = {
      bld_dance: { note: 'speaker', sparkle: 'floor' },
      bld_rooftop: { star: 'scope', sparkle: 'roof' },
      bld_stage: { confetti: 'cone1', sparkle: 'spot' }
    };
    function emitAt(id) { var m = EMIT_AT[id]; return function (kind) { return m[kind] || 'top'; }; }
    var EMIT_DANCE = emitAt('bld_dance'), EMIT_ROOF = emitAt('bld_rooftop'), EMIT_STAGE = emitAt('bld_stage');

    /* the additive beam material: a sibling of 'state' (the same program), alpha ≤ 0.18 */
    var beamMat = null;
    function beamMaterial() {
      if (beamMat || !K || typeof K.variant !== 'function') return beamMat;
      var T = K.THREE || {};
      beamMat = K.variant('state', 'stage-beam', {
        transparent: true, opacity: RULES.beamAlpha, depthWrite: false,
        blending: T.AdditiveBlending != null ? T.AdditiveBlending : 2, toneMapped: false
      });
      return beamMat;
    }

    function danceApply(h, out) {
      var st = dSt(h), f = beatOf(st, h);
      var p = h.reduced ? 1 : 1 + RULES.pump * clamp01(out.pump) * (0.5 + 0.5 * Math.cos(TAU * f));
      pose(h, 'speaker', 0, 0, 0, 0, 0, 0, p, p, p);
      dancePaint(h, st, out.chase || 0);
      st.still = false;
    }
    function danceRest(h) { rest(h, 'speaker'); var st = dSt(h); dancePaint(h, st, 0); st.still = false; }
    /* the encore act's start: the wipe runs from whatever the wall shows (a re-tap while
       ENCORE is up never moves it backwards), and the encore hold restarts */
    function stageStart(h) {
      var st = sSt(h), W = st.wall, t = timeOf(h);
      if (W.cur === 'encore') W.base = W.wipe;
      else { W.prev = W.wipe >= 0.5 ? W.cur : W.prev; W.cur = 'encore'; W.base = 0; }
      W.t0 = t; W.last = t;
      st.hold = t + RULES.holdSec;
    }
    function stageApply(h, out, tt) { stagePaint(h, sSt(h), out, tt); }
    function stageRest(h) { stagePaint(h, sSt(h), null, null); }

    return {
      bld_dance: {
        build: buildDance,
        idle: function (a) {
          if (!a) return false;
          var st = dSt(a);
          syncUser(a);
          if (dBook.live(a.uid)) return true;                  /* the act owns the deck */
          var chasing = st.k > 0.001 && !a.reduced;
          if (!chasing && st.still && st.userVer === USER.ver) return false;
          dancePaint(a, st, 0);
          st.still = !chasing;
          return true;
        },
        act: function (a) {
          if (!a) return null;
          askPet(a, PERFORM.bld_dance);
          return dBook.start(a, { name: ACT.bld_dance, reduced: !!a.reduced, emitAt: EMIT_DANCE, apply: danceApply, rest: danceRest });
        },
        show: function (a, k) { if (a) danceShow(a, k); },
        forget: function (uid) { dState.delete(uid); },
        setUser: setUser
      },
      bld_rooftop: {
        build: buildRooftop,
        idle: function (a) {
          if (!a) return false;
          var st = rSt(a);
          syncUser(a);
          if (rBook.live(a.uid)) return true;
          if (st.painted && st.userVer === USER.ver) return false;
          roofPaint(a, st, 0);
          return true;
        },
        act: function (a) {
          if (!a) return null;
          askPet(a, PERFORM.bld_rooftop);
          return rBook.start(a, { name: ACT.bld_rooftop, reduced: !!a.reduced, emitAt: EMIT_ROOF, apply: roofApply, rest: roofRest });
        },
        show: function (a, k) { if (a) roofShow(a, k); },
        forget: function (uid) { rState.delete(uid); },
        setUser: setUser
      },
      bld_stage: {
        build: buildStage,
        idle: function (a) {
          if (!a) return false;
          var st = sSt(a);
          syncUser(a);
          if (sBook.live(a.uid)) return true;                  /* the act owns the stage */
          if (a.reduced && st.frameT != null && st.userVer === USER.ver && !(st.hold > 0 && timeOf(a) >= st.hold && st.wall.cur === 'encore')) return false;
          stagePaint(a, st, null, null);
          st.frameT = timeOf(a);
          return !a.reduced;
        },
        act: function (a) {
          if (!a) return null;
          askPet(a, PERFORM.bld_stage);
          return sBook.start(a, { name: ACT.bld_stage, reduced: !!a.reduced, emitAt: EMIT_STAGE, start: stageStart, apply: stageApply, rest: stageRest });
        },
        show: function (a, k) { if (a) stageShow(a, k); },
        material: function (matKey, part) { return part && part.name === 'beams' ? beamMaterial() : null; },
        forget: function (uid) { sState.delete(uid); },
        setUser: setUser
      }
    };
  }
  var TILES = tileLayout();
  var HEAD_NAMES = HEAD_O.map(function (h, i) { return 'head' + i; });

  return {
    VERSION: VERSION, IDS: IDS, ACT: ACT, PERFORM: PERFORM, NEON4: NEON4, factory: factory,
    LAYOUT: freezeAll({ dance: D, rooftop: R, stage: S }), RULES: freezeAll(RULES), DEFAULT_COLORS: freezeAll(DEF),
    SHOW_PROGRAMS: SHOW_PROGRAMS, CENTRE: CENTRE,
    /* pure helpers */
    trimFor: trimFor, finLayout: finLayout, tileLayout: tileLayout, festoon: festoon, roofSlots: roofSlots,
    crowdLayout: crowdLayout, footLayout: footLayout, headOrigin: headOrigin,
    diag: diag, tileLevel: tileLevel, tileHue: tileHue, footLevel: footLevel, bulbLevel: bulbLevel, windowLevel: windowLevel,
    aimAngles: aimAngles, headPose: headPose, rotAbout: rotAbout, beamVis: beamVis,
    showProgram: showProgram, progPhase: progPhase, ledWin: ledWin, wallMeta: wallMeta, wallUvInto: wallUvInto,
    crowdU: crowdU, crowdPose: crowdPose, makeBook: makeBook, metaOf: metaOf
  };
}));
