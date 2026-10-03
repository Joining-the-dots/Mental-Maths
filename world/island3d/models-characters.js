/* ================================================================
   My Island 3D — characters (island chunk 8; Encore City v2; classic script).
   Pet rigs, the 11 accessories (6 classics + 5 streetwear), the 'you' avatar
   (a stage-ready chibi in a hoodie), the Spark Stick and the crowd fan blobs.
   THREE only ever comes from the kit (K.THREE); everything is built from K.G
   primitives and K materials. window.SLCharacters in the browser (registers
   itself on SL3D when the stage is present); module.exports in Node (the pure
   pose / clip maths, the part recipes and their triangle budgets).

   SL3D APIs (SL3D.defineApi):
     makeRig(petId, acc, tier) → PetRig
       {root, bones, sockets, anchors, pose, petId, acc, tier, meshes, tris,
        setPose(pose), setShow(k), setBeat(beat, bpm), play(clip, t, opts) → pose,
        info(clip) → {loop, dur}, dispose()}
       bones   body head neck tail earL earR legFL legFR legBL legBR wingL wingR
               (+ base tailTip eyes lens glint spark scarfTail blush nightH scan)
       sockets hat neck face back seat (Object3Ds that follow their bone)
       anchors top, dizzy (centre of the dizzy-star ring), emote
       Rigid skinning: one SkinnedMesh per material, every vertex 100 % on one
       bone. Draw calls: toon + shine (unlit 'state') + gold (crown) + foil (shades
       at night) + rings (headphones), plus the 0.009 u Midnight Ink hull on MID/HIGH.
       The kitten's whiskers are thin tubes in the toon mesh (as on photocards): no
       line program, no extra draw. setBeat pulses the headphone rings
       ±20 % on the beat at Showtime (never faster than 2 Hz).
     makeAvatar({color, emoji}, tier) → AvatarRig {root, bones, sockets{hand}, anchors,
       pose, setPose, setShow, setWand(on), play(clip, t, opts), dispose()}
       h 1.0; hood, headset mic, hoodie, legs and sneakers; the face is ALWAYS the
       child's emoji on the face cap (an InstancedMesh(1) with an instance colour: the
       kit's LED / sign program, not a program of its own). The Spark Stick is built,
       hidden, with the avatar, so a mount's compile warms it and the first Showtime
       or dance compiles nothing; setWand(on) only shows it.
       ≤ 1,500 tris (MID) / 1,050 (LOW).
     makeWand(colorHex, tier) → the Spark Stick Group (userData {kind, color, tip, points: 4,
       setShow(k), dispose()}): a 4-point ✦ prism in the member colour on an ink handle.
       It is the only light stick; never 5-pointed (the ⭐ reward), ≤ 260 tris. Its three
       parts are InstancedMesh(1)s with an instance colour, so they draw with the island's
       instanced toon, 'state' and additive 'state' programs (no plain-mesh programs).
     makeFanBlob(seed, tier, {detail: 'crowd'|'hero', member}) → Group
       (userData {look, geos, colors, update(t, o), setShow(k), dispose()}): tonal
       streetwear by day, Crowd Shadow silhouettes at night, lit by their Spark Sticks.
       Hero fans get two Bone White eye dots; no mouths, no faces.
     petPose → the pose schema shared with actors.js (= the pure API below)
   SL3D.defineModels('characters') registers pet_* and acc_* so
   SL3D.make('pet_kitten') / make('acc_beanie', {pet, acc}) build a static
   template for photocards (accessories preview on the pet, as in 2D; the
   day look: no night-only parts, no blush).

   POSE (a flat object of numbers; restPose() fills it, every clip writes it)
     x y z            root offset (u)            yaw pitch roll  whole body (deg, about the body
     sx sy sz         squash about the feet                       centre; pitch + = nose down)
     hips             body yaw (deg)             neck            neck pitch (deg)
     headPitch headYaw headRoll (deg)            earL earR       flop outward (deg) · earBack
     tailYaw tailPitch tailCurl (deg)            legFL legFR legBL legBR  swing (deg, + = forward)
     legFLz legFRz    front paws raised sideways wingL wingR     flap (deg, + = up)
     eye              openness (1 = the relaxed rest, drawn at EYE_OPEN of full)
     spark sparkSpin  dizzy stars (0..1, deg)    glint           crown sparkle 0..1
     cape wave        cape flap 0..1, cloth clock (s; also drives the visor scan)
     scarf            scarf tail swing (deg)     faceCam         0..1 hint: turn the root to the camera
     blush            0..1 (only 'cheer' blushes)
   CLIPS (pure functions of time; opts {species, speed, intensity, reduced, seed, rate, bpm,
     steer, height, dur, left, ground}): the contract clips idle walk run hop jump fall slide
     tumble dizzy dance cheer sad sit kick drive, plus lean beatNod lookBack point (v2 idles
     and the photo-booth paw-point). speed = how fast the pet travels (u/s): it sets the
     walk/run cadence and lets the cape stream in any clip; rate = playback speed of the
     non-gait clips; intensity scales amplitudes. One-shots (hop jump tumble kick lean lookBack)
     hold their end pose. Every clip has a reduced-motion variant (opts.reduced).
   DANCE: an original 8-count at 118 BPM built ONLY from generic moves (DANCE_MOVES: groove
     bounce, step-touch, point, spin, hop-turn, freeze): 1–2 groove, 3–4 step-touch, 5–6 the
     species signature (puppy paw-point, kitten slide-step, bunny hop-turn, dragon wing-flare
     spin), 7 a point that snaps to the camera, 8 the freeze. Reduced motion = the freeze.
   ================================================================ */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.SLCharacters = api;
    if (root.SL3D && typeof root.SL3D.defineApi === 'function') api.register(root.SL3D);
  }
}(typeof self !== 'undefined' ? self : typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var PI = Math.PI, TAU = PI * 2, DEG = PI / 180;

  /* ================================================================
     PURE DATA AND MATHS (no THREE; exported for Node tests)
     ================================================================ */
  var PETS = ['pet_puppy', 'pet_kitten', 'pet_bunny', 'pet_dragon'];
  var ACC_SOCKET = {
    acc_partyhat: 'hat', acc_crown: 'hat', acc_bow: 'neck', acc_scarf: 'neck', acc_shades: 'face', acc_cape: 'back',
    acc_beanie: 'hat', acc_cap: 'hat', acc_headphones: 'neck', acc_visor: 'face', acc_hoodie: 'back'
  };
  var ACC_IDS = Object.keys(ACC_SOCKET);
  var STREETWEAR = ['acc_beanie', 'acc_cap', 'acc_headphones', 'acc_visor', 'acc_hoodie'];
  var SLOTS = ['hat', 'neck', 'face', 'back'];
  var SOCKETS = ['hat', 'neck', 'face', 'back', 'seat'];
  var BUDGET = { pet: 1800, acc: 300, avatar: 1500, avatarLow: 1050, wand: 260, fan: 50 };
  var OUTLINE_CHAR = 0.009, OUTLINE_TOKEN = 'Midnight Ink';
  var EYE_OPEN = 0.88;                    /* the relaxed, confident rest openness */
  var IDLE_SQUASH = 0.007;
  var VISOR_SCAN_HZ = 1, RING_PULSE = 0.2;
  var AV_SHIFT_SEC = 2.4;                 /* the avatar's weight shift */
  var TWIRL = { every: 8, dur: 1.2 };     /* the Showtime Spark Stick twirl */

  /* skeleton: the contract's bones plus helpers (base = the whole-body pose; blush, nightH and
     scan are switch bones: scaled to 0 they fold their parts away inside the head) */
  var BONES = ['base', 'body', 'neck', 'head', 'eyes', 'earL', 'earR', 'tail', 'tailTip',
               'legFL', 'legFR', 'legBL', 'legBR', 'wingL', 'wingR', 'lens', 'glint', 'spark', 'scarfTail',
               'blush', 'nightH', 'scan'];
  var BONE_PARENT = { base: null, body: 'base', neck: 'body', head: 'neck', eyes: 'head', earL: 'head', earR: 'head',
                      tail: 'body', tailTip: 'tail', legFL: 'body', legFR: 'body', legBL: 'body', legBR: 'body',
                      wingL: 'body', wingR: 'body', lens: 'head', glint: 'head', spark: 'head', scarfTail: 'neck',
                      blush: 'head', nightH: 'head', scan: 'head' };
  var SOCKET_BONE = { hat: 'head', face: 'head', neck: 'neck', back: 'body', seat: 'body' };

  /* rest joints in ITEM space (feet at y 0, facing +z, the pet's left is +x). v2 proportions:
     a smaller head (r 0.155, ~40 % of the height), a slimmer body, longer legs */
  var BODY_Y = 0.235;                      /* body centre: the pivot for flips, rolls and spins */
  var HEAD = [0, 0.395, 0.17], HEAD_R = 0.155;
  function jointsOf(petId) {
    var J = {
      base: [0, 0, 0], body: [0, BODY_Y, 0], neck: [0, 0.315, 0.12], head: HEAD.slice(), eyes: [0, 0.402, 0.303],
      earL: [0.1, 0.486, 0.161], earR: [-0.1, 0.486, 0.161], tail: [0, 0.285, -0.21], tailTip: [0, 0.375, -0.28],
      legFL: [0.078, 0.145, 0.105], legFR: [-0.078, 0.145, 0.105], legBL: [0.078, 0.145, -0.105], legBR: [-0.078, 0.145, -0.105],
      wingL: [0.095, 0.355, 0.0], wingR: [-0.095, 0.355, 0.0],
      lens: [0, 0.404, 0.33], glint: [0.032, 0.577, 0.238], spark: [0, 0.65, 0.17], scarfTail: [0.055, 0.245, 0.24],
      blush: HEAD.slice(), nightH: HEAD.slice(), scan: [0, 0.408, 0.184]
    };
    if (petId === 'pet_puppy') { J.earL = [0.119, 0.486, 0.152]; J.earR = [-0.119, 0.486, 0.152]; }
    if (petId === 'pet_kitten') { J.earL = [0.087, 0.504, 0.152]; J.earR = [-0.087, 0.504, 0.152]; }
    if (petId === 'pet_bunny') { J.earL = [0.05, 0.523, 0.152]; J.earR = [-0.05, 0.523, 0.152]; J.tailTip = [0, 0.285, -0.255]; }
    if (petId === 'pet_dragon') { J.earL = [0.119, 0.45, 0.134]; J.earR = [-0.119, 0.45, 0.134]; J.tail = [0, 0.255, -0.21]; J.tailTip = [0, 0.205, -0.385]; }
    return J;
  }
  /* sockets in item space: hat on the crown of the head (between the bunny's ears),
     face over the eyes, neck at the collar, back on top of the body, seat under the rump */
  function socketsOf(petId) {
    return { hat: [0, 0.536, 0.161], face: [0, 0.404, 0.33], neck: [0, 0.255, 0.17], back: [0, 0.37, 0.0], seat: [0, 0.105, -0.08] };
  }
  var TOP_Y = { pet_puppy: 0.72, pet_kitten: 0.72, pet_bunny: 0.88, pet_dragon: 0.75 };

  /* species motion character (sig = the dance-break signature move) */
  var SPECIES = {
    pet_puppy:  { gait: 'trot',    tailHz: 1.5, happyHz: 4,   tailAmp: 26, hover: 0, sig: 'point' },
    pet_kitten: { gait: 'trot',    tailHz: 0.45, happyHz: 1.6, tailAmp: 18, hover: 0, sig: 'step' },
    pet_bunny:  { gait: 'hop',     tailHz: 0.7, happyHz: 2.5, tailAmp: 8,  hover: 0, sig: 'hopTurn' },
    pet_dragon: { gait: 'flutter', tailHz: 0.6, happyHz: 1.8, tailAmp: 16, hover: 0.12, wingHz: 3, sig: 'spin' }
  };

  /* ---------------- the pose ---------------- */
  var POSE_KEYS = ['x', 'y', 'z', 'yaw', 'pitch', 'roll', 'sx', 'sy', 'sz', 'hips', 'neck',
    'headPitch', 'headYaw', 'headRoll', 'earL', 'earR', 'earBack', 'tailYaw', 'tailPitch', 'tailCurl',
    'legFL', 'legFR', 'legBL', 'legBR', 'legFLz', 'legFRz', 'wingL', 'wingR',
    'eye', 'spark', 'sparkSpin', 'glint', 'cape', 'wave', 'scarf', 'faceCam', 'blush'];
  var POSE_ONE = { sx: 1, sy: 1, sz: 1, eye: 1 };
  function restPose(out) {
    out = out || {};
    for (var i = 0; i < POSE_KEYS.length; i++) { var k = POSE_KEYS[i]; out[k] = POSE_ONE[k] || 0; }
    return out;
  }
  /* blend two poses (k = 0 → a, 1 → b); angles blend linearly */
  function mixPose(a, b, k, out) {
    out = out || {};
    for (var i = 0; i < POSE_KEYS.length; i++) {
      var key = POSE_KEYS[i], va = a && typeof a[key] === 'number' ? a[key] : (POSE_ONE[key] || 0);
      var vb = b && typeof b[key] === 'number' ? b[key] : (POSE_ONE[key] || 0);
      out[key] = va + (vb - va) * k;
    }
    return out;
  }

  /* ---------------- small maths ---------------- */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function frac(v) { return v - Math.floor(v); }
  function num(v, d) { return typeof v === 'number' && isFinite(v) ? v : d; }
  function smooth(a, b, x) { var u = clamp01((x - a) / (b - a)); return u * u * (3 - 2 * u); }
  function inOut(u) { u = clamp01(u); return -(Math.cos(PI * u) - 1) / 2; }
  function outQuad(u) { u = clamp01(u); return 1 - (1 - u) * (1 - u); }
  function arc(u) { u = clamp01(u); return 4 * u * (1 - u); }
  /* FNV-1a, the same hash as SLMotion / SLGrid3D */
  function hash(s) {
    s = String(s);
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
  }
  function seedOf(s) { return typeof s === 'number' && isFinite(s) ? (s >>> 0) : hash(s == null ? '' : s); }
  function mix01(seed, n) {
    var h = (seed ^ Math.imul(n | 0, 0x9E3779B1)) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x85EBCA6B) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  /* deterministic random events: event n at n·mean + jitter, every gap within [lo, hi] */
  var _evt = { since: 0, n: 0 };
  function eventSince(t, seed, lo, hi) {
    var mean = (lo + hi) / 2, spread = (hi - lo) / 2, s = seedOf(seed);
    var n = Math.floor(t / mean) + 1;
    while (n > -2 && n * mean + (mix01(s, n) - 0.5) * spread > t) n--;
    _evt.n = n; _evt.since = t - (n * mean + (mix01(s, n) - 0.5) * spread);
    return _evt;
  }
  /* eye openness: a 0.16 s blink every 3–6 s */
  function blinkAt(t, seed) {
    var e = eventSince(t, seedOf(seed) ^ 0x5bd1e995, 3, 6), d = 0.16;
    return e.since >= 0 && e.since < d ? Math.max(0.05, 1 - Math.sin(PI * e.since / d)) : 1;
  }
  /* which side a seeded one-off favours (lean, look-back): +1 left, -1 right */
  function sideOf(o) { return o.left === true ? 1 : o.left === false ? -1 : (seedOf(o.seed) & 1 ? 1 : -1); }

  /* ---------------- clip helpers ---------------- */
  /* tails: wag (puppy), S-sway (kitten), twitch (bunny), swish (dragon); happy = faster */
  function tailMotion(t, out, sp, happy, reduced, hzOverride) {
    if (reduced) { out.tailYaw = 0; out.tailPitch = 8; out.tailCurl = sp === SPECIES.pet_kitten ? 15 : 0; return; }
    var hz = hzOverride || (happy ? sp.happyHz : sp.tailHz), a = sp.tailAmp * (happy ? 1.3 : 1), ph = TAU * hz * t;
    out.tailYaw = a * Math.sin(ph);
    out.tailPitch = happy ? 18 : 8;
    out.tailCurl = sp === SPECIES.pet_kitten || sp === SPECIES.pet_dragon ? -a * 1.3 * Math.sin(ph - 1.2) : 0;
  }
  function wingsFolded(out) { out.wingL = 10; out.wingR = 10; }
  function wingsFlap(out, t, hz, amp, base) {
    var w = base + amp * Math.sin(TAU * hz * t);
    out.wingL = w; out.wingR = w;
  }
  function pawsUp(out, deg, side) { out.legFL = deg; out.legFR = deg; out.legFLz = side; out.legFRz = side; }
  /* rear up on the hind legs (nose up by deg): hind legs stay upright, feet stay on the ground */
  function rearUp(out, deg) {
    var r = deg * DEG;
    out.pitch -= deg; out.legBL -= deg; out.legBR -= deg; out.headPitch += deg * 0.6;
    out.y += 0.1 * Math.sin(r) - 0.09 * (1 - Math.cos(r));
  }
  function legsTuck(out, k) { out.legFL = 35 * k; out.legFR = 35 * k; out.legBL = -30 * k; out.legBR = -30 * k; }
  /* the tap squish profile over a hop (u 0..1): 1 → 0.96 → 1.03 → 1 */
  function squishAt(u) {
    if (u < 0.12) return 1 - 0.04 * smooth(0, 0.12, u);
    if (u < 0.45) return 0.96 + 0.07 * smooth(0.12, 0.45, u);
    return 1.03 - 0.03 * smooth(0.45, 1, u);
  }

  /* ---------------- the clips ---------------- */
  var CLIPS = {};
  var CLIP_INFO = {
    idle: { loop: true, dur: 0, rate: true }, walk: { loop: true, dur: 0 }, run: { loop: true, dur: 0 },
    hop: { loop: false, dur: 0.45, rate: true }, jump: { loop: false, dur: 0.6, rate: true },
    fall: { loop: true, dur: 0, rate: true }, slide: { loop: true, dur: 0 },
    tumble: { loop: false, dur: 0.85, rate: true }, dizzy: { loop: true, dur: 0, rate: true },
    dance: { loop: true, dur: 8 * 60 / 118, rate: true }, cheer: { loop: true, dur: 0.6, rate: true },
    sad: { loop: true, dur: 0, rate: true }, sit: { loop: true, dur: 0, rate: true },
    kick: { loop: false, dur: 0.75, rate: true }, drive: { loop: true, dur: 0 },
    lean: { loop: false, dur: 2, rate: true }, beatNod: { loop: true, dur: 0 },
    lookBack: { loop: false, dur: 1.6, rate: true }, point: { loop: true, dur: 0, rate: true }
  };
  var CLIP_NAMES = Object.keys(CLIP_INFO);
  var CONTRACT_CLIPS = ['idle', 'walk', 'run', 'hop', 'jump', 'fall', 'slide', 'tumble', 'dizzy', 'dance', 'cheer', 'sad', 'sit', 'kick', 'drive'];
  var KICK_STRIKE = 0.32;                /* the paw meets the ball here (s into 'kick') */
  var DANCE_BPM = 118;
  /* the dance vocabulary (generic moves only) and each species' 8-count */
  var DANCE_MOVES = ['groove', 'step', 'point', 'spin', 'hopTurn', 'freeze'];
  var DANCE_PLAN = {};
  PETS.forEach(function (id) { var s = SPECIES[id].sig; DANCE_PLAN[id] = ['groove', 'groove', 'step', 'step', s, s, 'point', 'freeze']; });

  CLIPS.idle = function (t, out, o, sp) {
    var red = !!o.reduced;
    tailMotion(t, out, sp, false, red);
    out.eye = red ? 1 : blinkAt(t, o.seed);
    if (sp.hover && !o.ground) {
      out.y = 0.06 + (red ? 0 : 0.02 * Math.sin(TAU * 0.5 * t));
      if (red) wingsFolded(out); else wingsFlap(out, t, 0.8, 14, 14);
      out.legFL = out.legFR = 8; out.legBL = out.legBR = -14;
    } else if (sp === SPECIES.pet_dragon) wingsFolded(out);
    if (red) return out;
    var b = Math.sin(TAU * 0.5 * t);
    out.sy = 1 + IDLE_SQUASH * b; out.sx = out.sz = 1 - IDLE_SQUASH * 0.5 * b;
    out.headYaw = 9 * Math.sin(TAU * t / 7.2); out.headPitch = 3 * Math.sin(TAU * t / 5.1);
    var tw = eventSince(t, seedOf(o.seed) ^ 0x2545f491, 4, 8);           /* an ear twitch every 4–8 s */
    var flick = tw.since >= 0 && tw.since < 0.3 ? 14 * Math.sin(PI * tw.since / 0.3) : 0;
    if (tw.n & 1) out.earL += flick; else out.earR += flick;
    if (sp === SPECIES.pet_bunny) {                                       /* the straight ear dips now and then */
      var fl = eventSince(t, seedOf(o.seed) ^ 0x68e31da4, 5, 9), d = fl.since;
      if (d >= 0 && d < 1.4) out.earL += 30 * smooth(0, 0.18, d) * (1 - smooth(1.1, 1.4, d));
    }
    return out;
  };

  /* walking gaits: trot (diagonal pairs), bunny hops (0.18 u), dragon flutter (0.12 u up, wings 3 Hz) */
  function gait(t, out, o, sp, run) {
    var red = !!o.reduced, I = num(o.intensity, 1);
    var v = Math.max(0, num(o.speed, run ? 3 : 1));
    out.cape = clamp(v / (run ? 2.5 : 3), 0, 1) * (red ? 0.3 : 1);
    out.wave = t;
    tailMotion(t, out, sp, run, red);
    if (sp.gait === 'hop' && !red) {
      var rate = clamp(v / (run ? 0.75 : 0.42), 1.2, run ? 3.2 : 2.6), u = frac(t * rate), H = (run ? 0.13 : 0.18) * I;
      out.y = H * arc(u);
      var push = u < 0.25 ? Math.sin(PI * u / 0.25) : 0;
      out.legBL = out.legBR = -45 * push - 20 * Math.sin(PI * u);
      out.legFL = out.legFR = 30 * Math.sin(PI * u);
      out.pitch = -8 * Math.sin(TAU * u);
      var land = u > 0.9 ? (u - 0.9) / 0.1 : u < 0.08 ? 1 - u / 0.08 : 0;
      out.sy = 1 - 0.06 * land; out.sx = out.sz = 1 + 0.03 * land;
      out.earBack = 10 + 10 * Math.sin(PI * u);
      return out;
    }
    if (sp.gait === 'flutter' && !o.ground) {
      var wh = red ? 1.5 : sp.wingHz;
      out.y = (run ? 0.08 : sp.hover) + (red ? 0 : 0.025 * Math.sin(TAU * 1.5 * t));
      wingsFlap(out, t, wh, red ? 15 : (run ? 45 : 35) * I, 10);
      out.legFL = out.legFR = 25; out.legBL = out.legBR = -30;
      if (!red) { var pd = 10 * Math.sin(TAU * 1.5 * t); out.legFL += pd; out.legFR -= pd; }
      out.pitch = run ? 8 : 4;
      out.earBack = run ? 25 : 10;
      return out;
    }
    if (sp === SPECIES.pet_dragon) wingsFolded(out);
    var f = run ? clamp(v / 0.75, 2.2, 4.5) : clamp(v / 0.34, 1.2, 4), ph = TAU * f * t, s = Math.sin(ph);
    var a = (red ? 12 : run ? 42 : 26) * I * (run ? 1 : Math.min(1, v / 0.6 + 0.3));
    if (run && !red) {
      /* gallop: the front pair then the back pair */
      out.legFL = a * s; out.legFR = a * Math.sin(ph - 0.45);
      out.legBL = -a * Math.sin(ph - 0.9); out.legBR = -a * Math.sin(ph - 1.35);
      out.pitch = 6 * Math.sin(ph + 0.6);
      out.y = 0.025 * I * Math.abs(Math.sin(ph));
      out.earBack = 30; out.headPitch = -5;
    } else {
      out.legFL = a * s; out.legBR = a * s; out.legFR = -a * s; out.legBL = -a * s;
      if (!red) { out.y = 0.012 * I * Math.abs(s); out.roll = 3 * s; out.headPitch = 3 * Math.sin(2 * ph); }
      out.earBack = run ? 20 : 4;
    }
    out.scarf = red ? 0 : 10 * Math.sin(ph);
    return out;
  }
  CLIPS.walk = function (t, out, o, sp) { return gait(t, out, o, sp, false); };
  CLIPS.run = function (t, out, o, sp) { return gait(t, out, o, sp, true); };

  /* the happy hop on tap (matches SLMotion 'hop': 0.18 u in 0.45 s) with the v2 squish 0.96 / 1.03 */
  CLIPS.hop = function (t, out, o, sp) {
    tailMotion(t, out, sp, true, !!o.reduced);
    if (sp === SPECIES.pet_dragon) wingsFlap(out, t, 3, o.reduced ? 0 : 30, 20);
    if (o.reduced || t <= 0 || t >= 0.45) return out;
    var u = t / 0.45;
    out.y = 0.18 * num(o.intensity, 1) * arc(u);
    out.sy = squishAt(u); out.sx = out.sz = 1 + (1 - out.sy) * 0.5;
    legsTuck(out, Math.sin(PI * u));
    out.earL = out.earR = -12 * Math.sin(PI * u);
    return out;
  };

  /* take-off: crouch, stretch, tuck (games own the height; opts.height adds an arc) */
  CLIPS.jump = function (t, out, o, sp) {
    var dur = num(o.dur, 0.6), red = !!o.reduced;
    tailMotion(t, out, sp, false, red);
    out.tailPitch = 25;
    if (sp === SPECIES.pet_dragon) wingsFlap(out, t, 3, red ? 0 : 40, 25);
    if (num(o.height, 0) > 0 && t < dur) out.y = o.height * arc(t / dur);
    if (red) { legsTuck(out, 0.8); return out; }
    if (t < 0.07) {
      var c = t / 0.07;
      out.sy = 1 - 0.1 * c; out.sx = out.sz = 1 + 0.04 * c;
      out.legFL = out.legFR = 10 * c; out.legBL = out.legBR = -12 * c;
    } else if (t < 0.2) {
      var s = (t - 0.07) / 0.13;
      out.sy = 1.06 - 0.06 * s; out.sx = out.sz = 0.97 + 0.03 * s;
      out.legFL = out.legFR = -40 * (1 - s) + 35 * s; out.legBL = out.legBR = -60 * (1 - s) - 30 * s;
      out.pitch = -12 * (1 - s);
    } else legsTuck(out, 1);
    out.earBack = -10; out.earL = out.earR = -10;
    out.cape = 0.6; out.wave = t;
    return out;
  };

  /* coming down: paws reach for the ground, ears float up */
  CLIPS.fall = function (t, out, o, sp) {
    var red = !!o.reduced, pd = red ? 0 : 8 * Math.sin(TAU * 3 * t);
    out.legFL = 25 + pd; out.legFR = 25 - pd; out.legBL = -20 - pd; out.legBR = -20 + pd;
    out.earL = out.earR = -15; out.earBack = -12;
    out.tailYaw = 0; out.tailPitch = 25; out.pitch = 8; out.eye = 1;
    if (sp === SPECIES.pet_dragon) wingsFlap(out, t, 3, red ? 0 : 35, 30);
    out.cape = 0.5; out.wave = t;
    return out;
  };

  /* belly slide (the runner's slide pose: y 0.55, length 1.25) */
  CLIPS.slide = function (t, out, o, sp) {
    var I = clamp(num(o.intensity, 1), 0, 1.5), red = !!o.reduced;
    out.sy = 1 - 0.45 * I; out.sz = 1 + 0.25 * I; out.sx = 1 + 0.1 * I;
    out.legFL = out.legFR = 75; out.legBL = out.legBR = -75;
    out.headPitch = -15; out.earBack = 35;
    out.tailPitch = -10; out.tailYaw = red ? 0 : 12 * Math.sin(TAU * 2 * t);
    if (sp === SPECIES.pet_dragon) { out.wingL = out.wingR = 0; }
    out.cape = 0.7; out.wave = t; out.scarf = -25;
    return out;
  };

  /* the cartoon back-flip after a bump: up, over, squash, then dizzy stars */
  CLIPS.tumble = function (t, out, o, sp) {
    var red = !!o.reduced, h = num(o.height, 0.3) * num(o.intensity, 1);
    out.sparkSpin = 180 * t;
    if (sp === SPECIES.pet_dragon) wingsFlap(out, t, 3, red ? 0 : 35, 25);
    if (red) {
      var r = clamp01(t / 0.25);
      out.sy = 1 - 0.12 * Math.sin(PI * r); out.sx = out.sz = 1 + 0.06 * Math.sin(PI * r);
      out.eye = 0.45; out.spark = clamp01((t - 0.1) / 0.15);
      return out;
    }
    if (t < 0.6) {
      var s = t / 0.6;
      out.pitch = -360 * inOut(s);
      out.y = h * arc(s);
      legsTuck(out, Math.sin(PI * s));
      out.eye = 0.2; out.earBack = 30; out.tailPitch = 30;
    } else {
      var l = clamp01((t - 0.6) / 0.25);
      out.sy = 1 - 0.18 * Math.sin(PI * l); out.sx = out.sz = 1 + 0.09 * Math.sin(PI * l);
      out.eye = 0.45; out.spark = l; out.earL = out.earR = 25 * l;
    }
    out.cape = 0.8; out.wave = t;
    return out;
  };

  /* dizzy: head circles, a lazy sway and three stars orbiting at 0.5 rev/s */
  CLIPS.dizzy = function (t, out, o, sp) {
    var red = !!o.reduced, I = num(o.intensity, 1);
    out.spark = clamp01(I); out.eye = 0.45;
    if (sp === SPECIES.pet_dragon) wingsFolded(out);
    if (red) { out.roll = 5; out.headRoll = 8; out.sparkSpin = 30; out.earL = out.earR = 20; return out; }
    var w = TAU * 0.9 * t;
    out.roll = 7 * I * Math.sin(w);
    out.headRoll = 10 * I * Math.sin(w + 1); out.headYaw = 10 * I * Math.cos(w);
    out.earL = 20 + 10 * Math.sin(w); out.earR = 20 - 10 * Math.sin(w);
    out.sparkSpin = 180 * t;
    out.tailYaw = 10 * Math.sin(w * 0.5);
    return out;
  };

  /* ---- the dance break: an 8-count of generic moves only ---- */
  /* the freeze that ends every dance (and the whole dance under reduced motion): one paw up,
     head tilted 12°, facing the camera */
  function freezePose(out, sp) {
    out.legFR = 125; out.legFRz = 22; out.headRoll = 12; out.headPitch = -4; out.eye = 0.9; out.faceCam = 1;
    rearUp(out, 25);
    out.tailYaw = 0; out.tailPitch = 25;
    if (sp === SPECIES.pet_dragon) { out.wingL = out.wingR = 40; }
    return out;
  }
  /* groove bounce: down on every beat, up on the 'and' (one bounce a beat), with a shoulder pop */
  function groove(out, f, side) {
    var up = 0.5 - 0.5 * Math.cos(TAU * f), pop = Math.sin(PI * f);
    out.y = 0.02 * up; out.sy = 1 - 0.015 * (1 - up);
    if (side > 0) out.legFL = 14 * pop; else out.legFR = 14 * pop;
    out.headRoll = 5 * side * pop; out.roll = -3 * side * pop; out.hips = 6 * side * pop;
  }
  /* step-touch: step out to the pet's left on 3 and back on 4, the other paw taps beside */
  function stepTouch(out, k, f) {
    var s = smooth(0, 0.5, f), lift = Math.sin(PI * clamp01(f / 0.5)), tap = f > 0.5 ? Math.sin(PI * (f - 0.5) / 0.5) : 0;
    out.x = k === 0 ? 0.06 * s : 0.06 * (1 - s);
    out.y = 0.012 * lift;
    if (k === 0) { out.legFL = 22 * lift; out.legFRz = 12 * tap; } else { out.legFR = 22 * lift; out.legFLz = 12 * tap; }
    out.roll = (k === 0 ? -6 : 6) * Math.sin(PI * f); out.headRoll = (k === 0 ? 5 : -5) * Math.sin(PI * f);
  }
  /* kitten signature: a gliding slide-step out to each side with a lean */
  function slideStep(out, k, f) {
    var side = k === 0 ? 1 : -1, s = Math.sin(PI * f);
    out.x = 0.08 * side * s; out.roll = -10 * side * s; out.headRoll = 8 * side * s; out.sy = 1 - 0.03 * s;
    if (side > 0) { out.legFLz = 18 * s; out.legBL = -16 * s; } else { out.legFRz = 18 * s; out.legBR = -16 * s; }
  }
  /* puppy signature: the paw-point combo, up-left on 5, up-right on 6 */
  function pawPoint(out, k, f) {
    var e = smooth(0, 0.25, f) * (1 - smooth(0.85, 1, f));
    rearUp(out, 20 * e);
    if (k === 0) { out.legFL = 135 * e; out.legFLz = 24 * e; out.headYaw = 18 * e; out.headRoll = -8 * e; }
    else { out.legFR = 135 * e; out.legFRz = 24 * e; out.headYaw = -18 * e; out.headRoll = 8 * e; }
  }
  /* count 7: snap round to the camera with a quick point */
  function pointCam(out, f) {
    out.faceCam = 1; out.y = 0.02 * arc(f); out.headPitch = -6;
    out.legFR = 95 * smooth(0, 0.3, f); out.legFRz = 6;
  }
  /* bunny signature: a hop-turn of 180° on each count, so it lands facing front after 6 */
  function hopTurn(out, k, f) {
    out.y = 0.16 * arc(f); out.yaw = 180 * (k + inOut(f)); legsTuck(out, Math.sin(PI * f));
    out.sy = 1 + 0.03 * Math.sin(PI * f);
  }
  /* dragon signature: a spin with the wings flared wide (sparkles only, never fire) */
  function wingSpin(out, u, t, beat) {
    out.y = 0.12 * Math.sin(PI * u); out.yaw = 360 * inOut(u);
    out.wingL = out.wingR = 52 + 6 * Math.sin(TAU * t / beat);
    out.glint = smooth(0.7, 1, u);
  }
  CLIPS.dance = function (t, out, o, sp) {
    if (o.reduced) return freezePose(out, sp);
    var beat = 60 / num(o.bpm, DANCE_BPM), b = t / beat, cyc = ((b % 8) + 8) % 8, c = Math.floor(cyc), f = cyc - c;
    /* tail and wings locked to the beat so the 8-count loops seamlessly */
    tailMotion(t, out, sp, true, false, Math.max(1, Math.round(sp.happyHz * beat)) / beat);
    if (sp === SPECIES.pet_dragon) wingsFlap(out, t, 1 / beat, 12, 18);
    var move = (DANCE_PLAN[o.species] || DANCE_PLAN.pet_puppy)[c];
    if (move === 'groove') groove(out, f, c === 0 ? 1 : -1);
    else if (move === 'step') { if (c < 4) stepTouch(out, c - 2, f); else slideStep(out, c - 4, f); }
    else if (move === 'point') { if (c === 6) pointCam(out, f); else pawPoint(out, c - 4, f); }
    else if (move === 'hopTurn') hopTurn(out, c - 4, f);
    else if (move === 'spin') wingSpin(out, (cyc - 4) / 2, t, beat);
    else { freezePose(out, sp); if (f < 0.2) out.y += 0.04 * arc(f / 0.2); }
    return out;
  };

  /* cheering: bouncing with both front paws up — the only clip that blushes */
  CLIPS.cheer = function (t, out, o, sp) {
    var red = !!o.reduced, u = frac(t / 0.6);
    pawsUp(out, 120, 20);
    rearUp(out, 30);
    out.earL = out.earR = -10; out.eye = 0.85; out.blush = 1;
    tailMotion(t, out, sp, true, red);
    if (sp === SPECIES.pet_dragon) wingsFlap(out, t, red ? 0 : 3, red ? 0 : 30, 35);
    if (red) return out;
    out.y += 0.1 * num(o.intensity, 1) * arc(u);
    out.legFL += 15 * Math.sin(TAU * u); out.legFR -= 15 * Math.sin(TAU * u);
    return out;
  };

  /* a gentle, kid-safe pout: head and ears down, tail low, slow breaths */
  CLIPS.sad = function (t, out, o, sp) {
    out.headPitch = 22; out.earL = out.earR = 40; out.earBack = 10;
    out.tailPitch = -35; out.tailYaw = 0; out.tailCurl = 0; out.eye = 0.6;
    out.y = -0.01; out.sy = 0.97;
    if (sp === SPECIES.pet_dragon) { out.wingL = out.wingR = -5; }
    if (!o.reduced) { var b = Math.sin(TAU * 0.25 * t); out.sy += 0.012 * b; out.headPitch += 3 * b; }
    return out;
  };

  /* sitting on the rump, front legs straight */
  CLIPS.sit = function (t, out, o, sp) {
    out.pitch = -22; out.y = -0.05;
    out.legBL = out.legBR = 75; out.legFL = out.legFR = -22; out.headPitch = 12;
    tailMotion(t, out, sp, false, !!o.reduced);
    out.tailPitch = -10;
    out.eye = o.reduced ? 1 : blinkAt(t, o.seed);
    if (sp === SPECIES.pet_dragon) wingsFolded(out);
    if (!o.reduced) { var b = Math.sin(TAU * 0.5 * t); out.sy = 1 + 0.008 * b; }
    return out;
  };

  /* the penalty kick: wind-up, strike at KICK_STRIKE, follow-through (opts.left = left paw) */
  CLIPS.kick = function (t, out, o, sp) {
    var red = !!o.reduced, leg, back = -55, fwd = 85;
    if (red) { back = -25; fwd = 45; }
    if (t < 0.28) leg = back * inOut(t / 0.28);
    else if (t < 0.36) leg = back + (fwd - back) * outQuad((t - 0.28) / 0.08);
    else leg = fwd * (1 - inOut((t - 0.36) / 0.39));
    if (o.left) out.legFL = leg; else out.legFR = leg;
    tailMotion(t, out, sp, t > 0.36, red);
    if (sp === SPECIES.pet_dragon) wingsFolded(out);
    if (red) return out;
    if (t < 0.28) { out.pitch = -6 * inOut(t / 0.28); out.z = -0.02 * inOut(t / 0.28); }
    else if (t < 0.36) { var s = (t - 0.28) / 0.08; out.pitch = -6 + 14 * s; out.z = -0.02 + 0.06 * s; out.y = 0.03 * s; }
    else { var e = inOut((t - 0.36) / 0.39); out.pitch = 8 * (1 - e); out.z = 0.04 * (1 - e); out.y = 0.03 * (1 - e); }
    out.earBack = t > 0.28 && t < 0.5 ? 20 : 0;
    out.cape = 0.5; out.wave = t;
    return out;
  };

  /* sitting in a kart seat: paws on the wheel, leaning into the steer (opts.steer −1..1) */
  CLIPS.drive = function (t, out, o, sp) {
    var red = !!o.reduced, s = clamp(num(o.steer, 0), -1, 1), v = Math.max(0, num(o.speed, 0)), I = num(o.intensity, 1);
    out.pitch = -18; out.y = -0.04;
    out.legBL = out.legBR = 80;
    out.legFL = 55 + 12 * s; out.legFR = 55 - 12 * s;
    out.roll = -8 * s * I; out.headYaw = 18 * s; out.headPitch = 10;
    out.earBack = 25 * clamp01(v / 4);
    out.cape = clamp01(v / 4); out.wave = t;
    out.tailYaw = 0; out.tailPitch = -5;
    if (sp === SPECIES.pet_dragon) wingsFolded(out);
    if (!red) out.y += 0.01 * Math.sin(TAU * 2 * t);
    return out;
  };

  /* lean (2 s): the weight settles onto one hip (6°), the head tilts 8°, then back */
  CLIPS.lean = function (t, out, o, sp) {
    var red = !!o.reduced, side = sideOf(o), k = red ? 1 : smooth(0, 0.45, t) * (1 - smooth(1.55, 2, t));
    tailMotion(t, out, sp, false, red);
    if (sp === SPECIES.pet_dragon) wingsFolded(out);
    out.eye = red ? 1 : blinkAt(t, o.seed);
    out.hips = 6 * side * k; out.headRoll = 8 * side * k; out.roll = -2.5 * side * k; out.x = 0.01 * side * k;
    out.legFLz = 4 * k; out.legFRz = 4 * k;
    return out;
  };
  /* nod to the beat (music only): the head dips ±6° on every beat (≤ 118 BPM, so ≤ 1.97 Hz) */
  CLIPS.beatNod = function (t, out, o, sp) {
    var red = !!o.reduced, bpm = clamp(num(o.bpm, 100), 40, DANCE_BPM);
    tailMotion(t, out, sp, false, red);
    if (sp === SPECIES.pet_dragon) wingsFolded(out);
    out.eye = red ? 1 : blinkAt(t, o.seed);
    if (red) { out.headPitch = 3; return out; }
    var f = frac(t * bpm / 60), e = (1 - f) * (1 - f);
    out.headPitch = 6 * (2 * e - 1); out.earBack = 4 * e; out.y = 0.004 * (1 - e);
    return out;
  };
  /* look-back (1.6 s): a 60° glance over the shoulder, then front again */
  CLIPS.lookBack = function (t, out, o, sp) {
    var red = !!o.reduced, side = sideOf(o), k = red ? 1 : smooth(0, 0.35, t) * (1 - smooth(1.2, 1.6, t));
    tailMotion(t, out, sp, false, red);
    if (sp === SPECIES.pet_dragon) wingsFolded(out);
    out.eye = red ? 1 : blinkAt(t, o.seed);
    out.headYaw = 60 * side * k; out.hips = -8 * side * k; out.headRoll = 4 * side * k; out.tailYaw += 12 * side * k; out.earBack = 6 * k;
    return out;
  };
  /* a held paw-point (the photo booth's middle pose): up a little, one paw out, head tilted */
  CLIPS.point = function (t, out, o, sp) {
    var red = !!o.reduced, left = !!o.left;
    rearUp(out, 14);
    if (left) { out.legFL = 118; out.legFLz = 18; out.headRoll = -8; out.headYaw = 10; }
    else { out.legFR = 118; out.legFRz = 18; out.headRoll = 8; out.headYaw = -10; }
    out.eye = 0.95; out.faceCam = 1;
    tailMotion(t, out, sp, true, red);
    if (sp === SPECIES.pet_dragon) { out.wingL = out.wingR = 30; }
    if (!red) out.y += 0.01 * (0.5 - 0.5 * Math.cos(TAU * 0.5 * t));
    return out;
  };

  /* sample a clip: a fresh pose (reused `out`) for clip `name` at time t */
  var NOOPT = {};
  function durOf(name, o) {
    var info = CLIP_INFO[name];
    if (!info) return 0;
    if (name === 'jump') return num(o && o.dur, info.dur);
    if (name === 'dance') return 8 * 60 / num(o && o.bpm, DANCE_BPM);
    return info.dur;
  }
  function sampleClip(name, t, out, o) {
    o = o || NOOPT;
    out = restPose(out);
    var info = CLIP_INFO[name];
    if (!info) { name = 'idle'; info = CLIP_INFO.idle; }
    var sp = SPECIES[o.species] || SPECIES.pet_puppy;
    var tt = Math.max(0, num(t, 0));
    if (info.rate) tt *= Math.max(0, num(o.rate, 1));
    if (!info.loop) tt = Math.min(tt, durOf(name, o));
    CLIPS[name](tt, out, o, sp);
    /* any clip played while moving (a jump mid-run, a tumble) lets the cape stream */
    var v = num(o.speed, 0);
    if (v > 0 && name !== 'walk' && name !== 'run') {
      var k = clamp01(v / 3) * (o.reduced ? 0.3 : 1);
      if (k > out.cape) out.cape = k;
    }
    if (!out.wave) out.wave = tt;
    return out;
  }

  /* ---------------- accessories ---------------- */
  /* {hat, neck, face, back} → only valid ids in their own socket ('add' joins in its socket) */
  function accState(acc, add) {
    var out = {};
    SLOTS.forEach(function (sl) {
      var v = acc && acc[sl];
      if (typeof v === 'string' && ACC_SOCKET[v] === sl) out[sl] = v;
    });
    if (typeof add === 'string' && ACC_SOCKET[add]) out[ACC_SOCKET[add]] = add;
    return out;
  }
  function accKey(acc) { return SLOTS.map(function (s) { return (acc && acc[s]) || '-'; }).join('|'); }
  /* face accessories that cover the eyes (no eye highlight underneath) */
  function coversEyes(acc) { return !!acc && (acc.face === 'acc_shades' || acc.face === 'acc_visor'); }

  /* ---------------- the cape: CPU cloth ----------------
     The cape rests on the pet's back, its top edge across the shoulders at
     (y CAPE.y, z CAPE.z), the hem CAPE.len behind. k (0..1, from speed) lifts it
     about the top edge and adds a travelling wave that grows toward the hem; at
     k = 0 it lies flat, exactly at rest. */
  var CAPE = { w: 0.28, len: 0.28, y: 0.385, z: 0.0 };
  function capeDeform(x, y, z, t, k, reduced, out) {
    out = out || {};
    var dy = y - CAPE.y, dz = z - CAPE.z, v = clamp01(-dz / CAPE.len), a = 0, w = 0;
    k = clamp01(num(k, 0));
    if (k > 0) {
      a = k * (0.25 + 0.35 * v) * (reduced ? 0.5 : 1) + (reduced ? 0 : 0.08 * k * Math.sin(TAU * 1.3 * t + v));
      w = reduced ? 0 : 0.035 * k * v * Math.sin(TAU * (1.5 + 2.5 * k) * t - 4 * v + 3 * x);
    }
    var yy = dy + w, c = Math.cos(a), s = Math.sin(a);
    out.x = x; out.y = CAPE.y + yy * c - dz * s; out.z = CAPE.z + yy * s + dz * c;
    return out;
  }

  /* ---------------- dizzy stars: 3 stars on a ring around the spark joint ---------------- */
  function dizzyStar(i, spinDeg, out) {
    out = out || {};
    var a = (num(spinDeg, 0) * DEG) + i * TAU / 3;
    out.x = 0.13 * Math.cos(a); out.z = 0.13 * Math.sin(a); out.y = 0.015 * Math.sin(a * 2 + i);
    return out;
  }

  /* ---------------- accessory light timing (flash-safe) ---------------- */
  /* the visor's scanning dot: degrees along the band (a 1 Hz sweep; centred and still when reduced) */
  function visorScan(t, reduced) { return reduced ? 0 : 55 * Math.sin(TAU * VISOR_SCAN_HZ * num(t, 0)); }
  /* the headphone rings at night: ±20 % on the beat; above 118 BPM they pulse every other
     beat, so they never change faster than 2 Hz */
  function ringPulse(beat, bpm, reduced) {
    if (reduced || !isFinite(beat)) return 1;
    var every = bpm > DANCE_BPM ? 2 : 1;
    return 1 + RING_PULSE * Math.cos(TAU * beat / every);
  }
  /* the Showtime twirl: degrees of the Spark Stick about its grip, 360° over 1.2 s every 8 s */
  function twirlAt(t, reduced) {
    if (reduced || !(t >= 0)) return 0;
    var u = (t % TWIRL.every) / TWIRL.dur;
    return u < 1 ? 360 * inOut(u) : 0;
  }

  /* ---------------- crowd fans ---------------- */
  /* by day tonal streetwear (CHARACTERS.fanBlob day1–6), at night Crowd Shadow silhouettes
     (a–c) lit by their Spark Sticks: Magenta, Cyan, Violet or the child's own colour */
  var FAN_DAY = ['Splash Blue', 'Grape', 'Leaf Mint', 'Coral', 'Butter', 'Concrete Light'];
  var FAN_NIGHT = ['Crowd Shadow', 'Crowd Shadow 2', 'Crowd Shadow 3'];
  var FAN_WAND = ['Neon Magenta', 'LED Cyan', 'Electric Violet', '@member'];
  function pickOf(list, u) { return list[Math.min(list.length - 1, Math.floor(u * list.length))]; }
  function fanLook(seed) {
    var s = seedOf(seed);
    return {
      body: pickOf(FAN_DAY, mix01(s, 1)), shadow: pickOf(FAN_NIGHT, mix01(s, 7)), wand: pickOf(FAN_WAND, mix01(s, 2)),
      scale: 0.92 + 0.16 * mix01(s, 3), phase: mix01(s, 4), lean: (mix01(s, 5) - 0.5) * 10, hand: mix01(s, 6) < 0.5 ? 1 : -1
    };
  }
  /* bob on the beat (≤ 118 BPM, under 2 Hz), jump with excitement (0..1), sway the stick */
  function fanMotion(t, look, o, out) {
    o = o || NOOPT; out = out || {};
    look = look || { phase: 0, lean: 0 };
    out.roll = look.lean;
    if (o.reduced) { out.y = 0; out.sy = 1; out.wand = 0; return out; }
    var bpm = Math.min(num(o.bpm, DANCE_BPM), DANCE_BPM), b = frac(t * bpm / 60 + look.phase * 0.25), ex = clamp01(num(o.excite, 0));
    out.y = 0.015 * (1 - b) * (1 - b) + 0.1 * ex * arc(frac(t * bpm / 120 + look.phase));
    out.sy = 1 + 0.04 * Math.cos(TAU * b);
    out.wand = 25 * Math.sin(TAU * (bpm / 120) * t + look.phase * TAU);
    return out;
  }

  /* ---------------- rigid-skin merge (plain arrays) ----------------
     parts: [{pos, nrm, col: Float32Array (xyz per vertex), bone: index}] →
     {pos, nrm, col, skinIndex: Uint16Array(4/vertex), skinWeight: Float32Array(4/vertex), ranges[[start, count]]}
     every vertex bound 100 % to its part's bone */
  function skinMerge(parts) {
    var total = 0, i;
    for (i = 0; i < parts.length; i++) total += parts[i].pos.length / 3;
    var P = new Float32Array(total * 3), N = new Float32Array(total * 3), C = new Float32Array(total * 3);
    var SI = new Uint16Array(total * 4), SW = new Float32Array(total * 4), ranges = [], off = 0;
    for (i = 0; i < parts.length; i++) {
      var p = parts[i], n = p.pos.length / 3;
      P.set(p.pos, off * 3); N.set(p.nrm, off * 3); C.set(p.col, off * 3);
      for (var v = 0; v < n; v++) { SI[(off + v) * 4] = p.bone; SW[(off + v) * 4] = 1; }
      ranges.push([off, n]);
      off += n;
    }
    return { pos: P, nrm: N, col: C, skinIndex: SI, skinWeight: SW, ranges: ranges, count: total };
  }

  /* ---------------- the avatar's pose and clips ---------------- */
  var AV_KEYS = ['x', 'y', 'z', 'yaw', 'pitch', 'roll', 'sx', 'sy', 'sz', 'headPitch', 'headYaw', 'headRoll',
                 'armL', 'armR', 'armLf', 'armRf', 'faceCam', 'wand', 'hips', 'lean', 'legL', 'legR', 'twirl'];
  var AV_ONE = { sx: 1, sy: 1, sz: 1 };
  var AV_BODY_Y = 0.42;
  function restAvatar(out) {
    out = out || {};
    for (var i = 0; i < AV_KEYS.length; i++) out[AV_KEYS[i]] = AV_ONE[AV_KEYS[i]] || 0;
    return out;
  }
  var AV = {};
  /* idle: a weight shift from hip to hip every 2.4 s (hips ±5°) and a glance every ~6 s */
  AV.idle = function (t, out, o) {
    if (o.reduced) return out;
    var ph = TAU * (t / AV_SHIFT_SEC + num(o.phase, 0)), s = Math.sin(ph);
    out.hips = 5 * s; out.lean = 2.5 * s; out.y = 0.006 * Math.cos(2 * ph);
    var g = eventSince(t, seedOf(o.seed) ^ 0x1b873593, 5, 7), d = g.since;   /* a glance every ~6 s */
    if (d >= 0 && d < 1.6) out.headYaw = (g.n & 1 ? 22 : -22) * smooth(0, 0.3, d) * (1 - smooth(1.3, 1.6, d));
    out.armL = 6 + 2 * s; out.armR = 6 - 2 * s;
    return out;
  };
  function avGait(t, out, o, run) {
    var v = Math.max(0, num(o.speed, run ? 3 : 1)), f = run ? clamp(v / 0.8, 2, 4) : clamp(v / 0.38, 1.2, 3);
    var s = Math.sin(TAU * f * t), a = o.reduced ? 10 : run ? 50 : 25;
    out.armLf = a * s; out.armRf = -a * s; out.armL = out.armR = 8;
    out.legL = -a * 0.9 * s; out.legR = a * 0.9 * s;
    if (!o.reduced) { out.y = (run ? 0.03 : 0.015) * Math.abs(s); out.roll = 3 * s; out.pitch = run ? 8 : 2; }
    return out;
  }
  AV.walk = function (t, out, o) { return avGait(t, out, o, false); };
  AV.run = function (t, out, o) { return avGait(t, out, o, true); };
  AV.hop = function (t, out, o) {
    if (o.reduced || t <= 0 || t >= 0.45) return out;
    var u = t / 0.45;
    out.y = 0.18 * arc(u); out.sy = squishAt(u); out.armL = out.armR = 40 * Math.sin(PI * u);
    out.legL = out.legR = -18 * Math.sin(PI * u);
    return out;
  };
  AV.jump = function (t, out, o) {
    var dur = num(o.dur, 0.6);
    if (num(o.height, 0) > 0 && t < dur) out.y = o.height * arc(t / dur);
    out.armL = out.armR = o.reduced ? 120 : 150 * smooth(0, 0.15, t);
    out.legL = 20; out.legR = -12;
    return out;
  };
  AV.fall = function (t, out) { out.armL = out.armR = 120; out.headPitch = -8; out.legL = 15; out.legR = -10; return out; };
  AV.slide = function (t, out) { out.sy = 0.8; out.pitch = 25; out.armLf = out.armRf = 80; out.legL = out.legR = -30; return out; };
  AV.tumble = function (t, out, o) {
    if (o.reduced) { out.sy = 1 - 0.1 * Math.sin(PI * clamp01(t / 0.25)); return out; }
    if (t < 0.6) { var s = t / 0.6; out.pitch = -360 * inOut(s); out.y = num(o.height, 0.3) * arc(s); out.legL = out.legR = 40 * Math.sin(PI * s); }
    else out.sy = 1 - 0.15 * Math.sin(PI * clamp01((t - 0.6) / 0.25));
    return out;
  };
  AV.dizzy = function (t, out, o) {
    var w = o.reduced ? 0 : TAU * 0.9 * t;
    out.roll = o.reduced ? 5 : 6 * Math.sin(w); out.headRoll = o.reduced ? 8 : 10 * Math.sin(w + 1); out.headYaw = o.reduced ? 0 : 10 * Math.cos(w);
    out.armL = out.armR = 20;
    return out;
  };
  AV.cheer = function (t, out, o) {
    out.armL = out.armR = 150; out.wand = 1;
    if (o.reduced) return out;
    var u = frac(t / 0.6);
    out.y = 0.08 * arc(u); out.armL += 15 * Math.sin(TAU * u); out.armR -= 15 * Math.sin(TAU * u);
    out.legL = out.legR = -10 * arc(u);
    return out;
  };
  AV.wave = function (t, out, o) {
    out.armR = 140 + (o.reduced ? 0 : 18 * Math.sin(TAU * 1.6 * t)); out.headRoll = 6; out.armL = 8; out.wand = 1;
    return out;
  };
  AV.clap = function (t, out, o) {
    out.armLf = out.armRf = 70;
    out.armL = out.armR = o.reduced ? -10 : 10 - 22 * (0.5 + 0.5 * Math.cos(TAU * 1.8 * t));
    return out;
  };
  /* the tap emotes (generic gestures): finger-heart by the cheek, V-sign with a head tilt,
     a mic-point to the camera */
  function avHeart(out) { out.armR = 125; out.armRf = 45; out.armL = 14; out.armLf = 10; out.headRoll = 10; out.faceCam = 1; return out; }
  AV.heart = function (t, out, o) { avHeart(out); if (!o.reduced) out.y = 0.012 * arc(clamp01(t / 0.4)); return out; };
  AV.vsign = function (t, out, o) {
    var e = o.reduced ? 1 : smooth(0, 0.22, t);
    out.armR = 20 + 120 * e; out.armRf = 6; out.armL = 10; out.headRoll = 12 * e; out.hips = -6 * e; out.faceCam = 1;
    return out;
  };
  AV.micpoint = function (t, out, o) {
    var e = o.reduced ? 1 : smooth(0, 0.22, t);
    out.armRf = 85 * e; out.armR = 18; out.armL = 12; out.pitch = 5 * e; out.headPitch = -5 * e; out.faceCam = 1;
    return out;
  };
  AV.dance = function (t, out, o) {
    if (o.reduced) return avHeart(out);
    var beat = 60 / num(o.bpm, DANCE_BPM), cyc = (((t / beat) % 8) + 8) % 8, c = Math.floor(cyc), f = cyc - c;
    if (c < 2) {                                             /* groove bounce with a shoulder pop */
      var up = 0.5 - 0.5 * Math.cos(TAU * f), side = c === 0 ? 1 : -1, pop = Math.sin(PI * f);
      out.y = 0.02 * up; out.hips = 8 * side * pop; out.lean = 3 * side * pop;
      out.armL = out.armR = 28 + 18 * up; out.armLf = out.armRf = 30;
    } else if (c < 4) {                                      /* step-touch */
      var k = c - 2, s = smooth(0, 0.5, f), lift = Math.sin(PI * clamp01(f / 0.5));
      out.x = k === 0 ? 0.06 * s : 0.06 * (1 - s);
      if (k === 0) out.legL = 25 * lift; else out.legR = 25 * lift;
      out.armL = out.armR = 22; out.armLf = out.armRf = 35 * Math.sin(PI * f); out.lean = (k === 0 ? -4 : 4) * Math.sin(PI * f);
    } else if (c < 6) {                                      /* point up with the Spark Stick, one arm each count */
      var e = smooth(0, 0.25, f) * (1 - smooth(0.85, 1, f));
      if (c === 4) { out.armR = 10 + 140 * e; out.armRf = 15; out.headRoll = 8 * e; }
      else { out.armL = 10 + 140 * e; out.armLf = 15; out.armR = 40; out.headRoll = -8 * e; }
      out.wand = 1;
    } else if (c === 6) {                                    /* snap to the camera with a point */
      out.faceCam = 1; out.armRf = 85 * smooth(0, 0.3, f); out.armR = 20; out.y = 0.02 * arc(f);
    } else avHeart(out);                                     /* freeze: the finger-heart */
    return out;
  };
  AV.sad = function (t, out) { out.headPitch = 20; out.armLf = out.armRf = 10; out.y = -0.01; return out; };
  AV.sit = function (t, out) { out.y = -0.06; out.sy = 0.88; out.armLf = out.armRf = 25; out.legL = out.legR = 70; return out; };
  AV.kick = function (t, out, o) { return AV.cheer(t, out, o); };
  AV.drive = function (t, out, o) {
    var s = clamp(num(o.steer, 0), -1, 1);
    out.armLf = 60 + 10 * s; out.armRf = 60 - 10 * s; out.roll = -6 * s; out.headYaw = 15 * s; out.legL = out.legR = 60;
    if (!o.reduced) out.y = 0.01 * Math.sin(TAU * 2 * t);
    return out;
  };
  var AV_CLIPS = Object.keys(AV);
  function sampleAvatar(name, t, out, o) {
    o = o || NOOPT;
    out = restAvatar(out);
    var fn = AV[name] || AV.idle, info = CLIP_INFO[name];
    var tt = Math.max(0, num(t, 0)) * (name === 'walk' || name === 'run' ? 1 : Math.max(0, num(o.rate, 1)));
    if (info && !info.loop) tt = Math.min(tt, durOf(name, o));
    return fn(tt, out, o);
  }

  /* crown sparkle: one 0.4 s sheen every 3 s (SLMotion.glint shape), none under reduced motion */
  function crownGlint(t, phase, reduced) {
    if (reduced) return 0;
    var local = frac(t / 3 + (phase || 0)) * 3;
    return local < 0.4 ? Math.sin(PI * local / 0.4) : 0;
  }

  /* ================================================================
     PART RECIPES (pure). Every model below is a list of part descriptors that
     ONE interpreter (geoOf) turns into kit geometry, so the triangle budgets are
     checked in Node from the same recipes the builders use (primTris = the
     kit's segment counts; trimmed parts count in full: an upper bound).
       {g: primitive, a: args, t: transform | [transforms] (scale, rotate XYZ, move),
        c: colour (token | [token, tone] | fn(v) → token | {rgb, tn} | {mix: [a, b, k]}),
        pf: paint per face, first: paint before the transforms, keep: fn(x, y, z) trims in the
        primitive's own space, invert: show the inside, bone, mat: 'toon' | 'shine' | 'gold' |
        'foil' | 'rings', night: only at Showtime (rigs only), rig: rigs only, blush, cloth}
     ================================================================ */
  var CONE_PROFILE = [[0, 0], [1, 0], [0.83, 0.17], [0.66, 0.34], [0.5, 0.5], [0.33, 0.67], [0.16, 0.84], [0, 1]];
  var DROP_POINTS = 8;                      /* the kit's default drop profile length */
  var WAND = { points: 4, rOut: 0.06, rIn: 0.016, depth: 0.022, bevel: 0.004, core: 0.6, halo: 0.35, tip: 0.19,
               crowd: { rOut: 0.04, rIn: 0.012, depth: 0.014, tip: 0.125 } };

  /* the outline of an n-point star: 2n vertices, outer points first (starts straight up) */
  function starOutline(points, rOut, rIn) {
    var out = [];
    for (var i = 0; i < 2 * points; i++) {
      var a = PI / 2 + i * PI / points, r = i % 2 ? rIn : rOut;
      out.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    return out;
  }
  /* triangles of one descriptor on a tier (matches kit.js G and three r170) */
  function primTris(d, tier) {
    var low = tier === 'LOW', a = d.a || [];
    switch (d.g) {
      case 'puff': return 80;
      case 'sphere': return low ? 100 : 168;
      case 'bean': return low ? 144 : 260;
      case 'capsule': return (low ? Math.min(a[3], 8) : a[3]) * 2 * (4 * (low ? Math.min(a[2], 2) : a[2]) + 1);
      case 'tube': { var rr = a[3] || (low ? 8 : 12); return rr * 2 + (a[4] ? 0 : rr * 2); }
      case 'cone': return 2 * (a[2] || (low ? 8 : 12));
      case 'drop': return (((a[2] || []).length || DROP_POINTS) - 1) * (low ? 7 : 10) * 2;
      case 'ring': return low ? 120 : 192;
      case 'torus': return 2 * a[2] * a[3];
      case 'arc': return 2 * a[3];
      case 'annulus': return 2 * a[2];
      case 'box': return 12;
      case 'disc': return 4 * (a[2] || 10);
      case 'ribbon': return 8 * a[2];
      case 'star4': return a[3] > 0 ? 60 : 28;
      case 'star4flat': return 6;
      case 'cape': return 4 * 6 * 4;
      case 'cap': return a[1] > 0 ? a[3] * a[4] * 2 : a[4] + (a[3] - 1) * a[4] * 2;
      case 'fan': return a[1];
    }
    return 0;
  }
  function sumTris(parts, tier) { var n = 0; for (var i = 0; i < parts.length; i++) n += primTris(parts[i], tier); return n; }
  function add3(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }

  /* LOCKED PETCOL tokens (world-look names them; the fallbacks are the same paths) */
  function lookOf(id) {
    var L = root.SLIslandLook;
    return (L && L.LOOK && L.LOOK[id]) || (L && L.CHARACTERS && L.CHARACTERS[id]) || null;
  }
  function tokOf(id, part, dflt) { var lk = lookOf(id); return (lk && lk.colors && lk.colors[part]) || dflt; }
  function petTokens(petId) {
    var b = 'PETCOL.' + petId + '.';
    var T = {
      body: tokOf(petId, 'body', b + 'body'), dark: tokOf(petId, 'dark', b + 'dark'), light: tokOf(petId, 'light', b + 'light'),
      nose: tokOf(petId, 'nose', b + 'nose'), eye: tokOf(petId, 'eye', 'Midnight Ink'), glint: tokOf(petId, 'glint', 'Cloud White'),
      blush: tokOf(petId, 'blush', 'Blush'), mouth: tokOf(petId, 'mouth', 'Midnight Ink')
    };
    T.ear = tokOf(petId, 'ear', petId === 'pet_puppy' ? T.dark : T.body);
    T.inner = tokOf(petId, 'inner', petId === 'pet_bunny' ? 'Bunny Ear' : T.light);
    T.tail = tokOf(petId, 'tail', petId === 'pet_bunny' ? 'Cloud White' : T.dark);
    T.whisker = tokOf(petId, 'whisker', 'Ink');
    T.spines = tokOf(petId, 'spines', T.dark); T.horns = tokOf(petId, 'horns', 'Star Gold'); T.wings = tokOf(petId, 'wings', T.light);
    return T;
  }

  /* ---------------- the pet (≤ BUDGET.pet before accessories) ---------------- */
  function petParts(petId, acc, rig) {
    var Tk = petTokens(petId), J = jointsOf(petId), P = [];
    function put(d) { P.push(d); return d; }
    var covered = coversEyes(acc);

    /* body: a slim horizontal bean with a light belly */
    put({ g: 'capsule', a: [0.16, 0.2, 2, 10], t: [{ r: [90, 0, 0] }, { s: [0.85, 0.8, 0.85], p: [0, BODY_Y, -0.01] }],
          c: function (v) { return v.y < BODY_Y - 0.055 && v.ny < -0.35 ? Tk.light : Tk.body; }, bone: 'body' });
    /* head (~40 % of the height), muzzle, nose, side-smirk, blush (cheer only) */
    put({ g: 'sphere', a: [HEAD_R], t: { p: J.head }, c: Tk.body, bone: 'head' });
    put({ g: 'puff', a: [0.075], t: { s: [1.15, 0.72, 0.95], p: [0, 0.335, 0.284] }, c: Tk.light, bone: 'head' });
    if (petId === 'pet_dragon') {
      [-1, 1].forEach(function (sx) { put({ g: 'disc', a: [0.009, 0.006, 6], t: { p: [0.024 * sx, 0.356, 0.352] }, c: Tk.nose, bone: 'head' }); });
    } else {
      var ns = petId === 'pet_kitten' ? 0.85 : 1;
      put({ g: 'puff', a: [0.021], t: { s: [1.3 * ns, ns, 0.9 * ns], p: [0, 0.356, 0.35] }, c: Tk.nose, bone: 'head' });
    }
    put({ g: 'ribbon', a: [[[-0.02, 0.316, 0.35], [0.002, 0.31, 0.357], [0.024, 0.322, 0.35]], 0.0085, 5], c: Tk.mouth, bone: 'head' });
    [-1, 1].forEach(function (sx) {
      put({ g: 'disc', a: [0.024, 0.004, 8], t: { r: [0, 40 * sx, 0], p: [0.103 * sx, 0.362, 0.283] },
            c: { mix: [Tk.body, Tk.blush, 0.3] }, bone: 'blush', blush: true });
    });

    /* confident eyes on the 'eyes' bone (blinks scale it): rolled 8° outer-up, an ink upper lid,
       a small upper-outer glint (unlit; none under shades or the visor) */
    [-1, 1].forEach(function (sx) {
      var ex = { r: [0, 24 * sx, 8 * sx], p: [0.072 * sx, 0.402, 0.303] };
      put({ g: 'puff', a: [0.024], t: [{ s: [1.15, 0.8, 0.5] }, ex], c: Tk.eye, bone: 'eyes' });
      put({ g: 'ribbon', a: [[[-0.03, 0.012, 0.005], [0, 0.021, 0.009], [0.03, 0.012, 0.005]], 0.006, 5], t: ex, c: Tk.eye, bone: 'eyes' });
      if (!covered) put({ g: 'disc', a: [0.006, 0.003, 6], t: [{ p: [0.009 * sx, 0.008, 0.013] }, ex], c: Tk.glint, bone: 'eyes', mat: 'shine' });
    });

    /* longer, athletic legs with light paws (back legs in the dark tone, like the 2D art) */
    ['legFL', 'legFR', 'legBL', 'legBR'].forEach(function (n) {
      var j = J[n], back = n.charAt(3) === 'B';
      var main = back && petId !== 'pet_bunny' ? Tk.dark : Tk.body, paw = petId === 'pet_dragon' ? main : Tk.light;
      put({ g: 'puff', a: [0.042], t: { s: [1, 1.9, 1], p: [j[0], 0.0798, j[2]] }, c: function (v) { return v.y < 0.026 ? paw : main; }, bone: n });
    });

    /* species ears */
    [['earL', 1], ['earR', -1]].forEach(function (e) {
      var n = e[0], sx = e[1], j = J[n];
      if (petId === 'pet_puppy') {                         /* slimmer drop ears, tucked 10° back */
        put({ g: 'puff', a: [0.075], t: { s: [0.36, 1.25, 0.8], r: [10, 0, 18 * sx], p: add3(j, [0.04 * sx, -0.068, -0.005]) }, c: Tk.ear, bone: n });
      } else if (petId === 'pet_kitten') {                 /* sharper ear cones */
        put({ g: 'cone', a: [0.055, 0.125, 8], t: { s: [1, 1, 0.55], r: [0, 0, -15 * sx], p: add3(j, [0, 0.042, 0]) }, c: Tk.body, bone: n });
        put({ g: 'cone', a: [0.032, 0.078, 8], t: { s: [1, 1, 0.4], r: [0, 0, -15 * sx], p: add3(j, [0.002 * sx, 0.034, 0.02]) }, c: Tk.inner, bone: n });
      } else if (petId === 'pet_bunny') {
        if (sx > 0) {                                      /* the left ear stands tall */
          put({ g: 'puff', a: [0.046], t: { s: [0.85, 3.0, 0.5], r: [0, 0, -8], p: add3(j, [0.011, 0.13, -0.01]) }, c: Tk.body, bone: n });
          put({ g: 'puff', a: [0.046], t: { s: [0.42, 2.3, 0.28], r: [0, 0, -8], p: add3(j, [0.011, 0.13, 0.012]) }, c: Tk.inner, bone: n });
        } else {                                           /* the right ear rests folded at 35° (attitude) */
          put({ g: 'puff', a: [0.046], t: { s: [0.85, 1.75, 0.5], r: [0, 0, 8], p: add3(j, [-0.007, 0.075, -0.01]) }, c: Tk.body, bone: n });
          put({ g: 'puff', a: [0.046], t: { s: [0.42, 1.35, 0.28], r: [0, 0, 8], p: add3(j, [-0.007, 0.072, 0.012]) }, c: Tk.inner, bone: n });
          put({ g: 'puff', a: [0.044], t: { s: [0.8, 1.5, 0.48], r: [18, 0, 35], p: add3(j, [-0.036, 0.172, 0.0]) }, c: Tk.body, bone: n });
        }
      } else {                                             /* dragon: little ear frills */
        put({ g: 'cone', a: [0.04, 0.085, 6], t: { s: [1, 1, 0.4], r: [0, 0, -55 * sx], p: add3(j, [0.02 * sx, 0.02, 0]) }, c: Tk.dark, bone: n });
      }
    });

    /* tails */
    var tj = J.tail;
    function rib(base, pts) { return pts.map(function (p) { return add3(base, p); }); }
    if (petId === 'pet_puppy') {
      put({ g: 'ribbon', a: [rib(tj, [[0, 0, 0], [0, 0.05, -0.05], [0, 0.11, -0.065], [0, 0.16, -0.04]]), 0.024, 8], c: Tk.tail, bone: 'tail' });
      put({ g: 'puff', a: [0.024], t: { p: add3(tj, [0, 0.16, -0.04]) }, c: Tk.tail, bone: 'tail' });
    } else if (petId === 'pet_kitten') {
      put({ g: 'ribbon', a: [rib(tj, [[0, 0, 0], [0.02, 0.045, -0.05], [0, 0.09, -0.07]]), 0.022, 6], c: Tk.tail, bone: 'tail' });
      put({ g: 'ribbon', a: [rib(J.tailTip, [[0, 0, 0], [-0.025, 0.05, -0.01], [0, 0.09, 0.02]]), 0.022, 6], c: Tk.tail, bone: 'tailTip' });
      put({ g: 'puff', a: [0.023], t: { p: add3(J.tailTip, [0, 0.09, 0.02]) }, c: Tk.light, bone: 'tailTip' });
    } else if (petId === 'pet_bunny') {
      put({ g: 'puff', a: [0.052], t: { p: add3(tj, [0, -0.005, -0.04]) }, c: Tk.tail, bone: 'tail' });
    } else {
      put({ g: 'cone', a: [0.058, 0.2, 10], t: { r: [-100, 0, 0], p: add3(tj, [0, -0.02, -0.09]) }, c: Tk.body, bone: 'tail' });
      put({ g: 'cone', a: [0.045, 0.07, 6], t: { s: [1, 1, 0.35], r: [-100, 0, 0], p: add3(J.tailTip, [0, 0, 0.005]) }, c: Tk.dark, bone: 'tailTip' });
    }

    /* dragon: sleek wings with 3 rib ribbons each, 5 rounded spines, swept-back horns.
       Sparkles only, never fire. */
    if (petId === 'pet_dragon') {
      [['wingL', 1], ['wingR', -1]].forEach(function (w) {
        var j = J[w[0]], sx = w[1];
        put({ g: 'puff', a: [0.085], t: { s: [0.2, 0.95, 1.35], r: [10, 0, -35 * sx], p: add3(j, [0.07 * sx, 0.07, -0.04]) }, c: Tk.wings, bone: w[0] });
        [[[0.11, 0.17, -0.05], [0.07, 0.1, -0.02]], [[0.15, 0.12, -0.12], [0.08, 0.08, -0.06]], [[0.13, 0.04, -0.17], [0.07, 0.05, -0.09]]].forEach(function (r) {
          put({ g: 'ribbon', a: [[add3(j, [0.02 * sx, 0.03, 0]), add3(j, [r[1][0] * sx, r[1][1], r[1][2]]), add3(j, [r[0][0] * sx, r[0][1], r[0][2]])], 0.006, 3],
                c: [Tk.dark, 'base'], bone: w[0] });
        });
      });
      var top = [0.363, 0.363, 0.362, 0.36, 0.342], zs = [0.075, 0.015, -0.045, -0.105, -0.16], hs = [1, 1, 0.9, 0.8, 0.7];
      zs.forEach(function (z, i) {
        put({ g: 'cone', a: [0.025, 0.07, 6], t: { s: [0.5, hs[i], 1], r: [-25, 0, 0], p: [0, top[i] + 0.025 * hs[i], z] }, c: Tk.spines, bone: 'body' });
      });
      [-1, 1].forEach(function (sx) {
        put({ g: 'cone', a: [0.02, 0.095, 8], t: { r: [-40, 0, 6 * -sx], p: [0.055 * sx, 0.528, 0.13] }, c: Tk.horns, bone: 'head' });
      });
    }

    /* kitten whiskers: thin tubes, on photocards and rigs alike (perf: a LineSegments mesh cost
       the rig a draw call and a line program of its own) */
    if (petId === 'pet_kitten') {
      whiskerLines().forEach(function (l) {
        var a = l[0], b = l[1], dx = b[0] - a[0], dy = b[1] - a[1], len = Math.sqrt(dx * dx + dy * dy);
        put({ g: 'tube', a: [0.0045, 0.0045, len, 4], t: { r: [0, 0, -Math.atan2(dx, dy) / DEG], p: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2] }, c: Tk.whisker, bone: 'head' });
      });
    }

    /* rig-only: three flat ✦ dizzy stars (shown by scaling the 'spark' bone) */
    if (rig) {
      var sj = J.spark, _ds = {};
      for (var i = 0; i < 3; i++) {
        dizzyStar(i, 0, _ds);
        var sp = [sj[0] + _ds.x, sj[1] + _ds.y, sj[2] + _ds.z];
        put({ g: 'star4flat', a: [0.05, 0.014], t: { p: sp }, c: 'Star Gold', bone: 'spark', rig: true });
        put({ g: 'star4flat', a: [0.05, 0.014], t: { r: [0, 180, 0], p: sp }, c: 'Star Gold', bone: 'spark', rig: true });
      }
    }

    accessoryParts(acc, petId, rig).forEach(put);
    return P;
  }
  /* whisker segments in item space: 3 a side from the muzzle */
  function whiskerLines() {
    var out = [];
    [-1, 1].forEach(function (sx) {
      [[0.012, 0.025], [0, 0], [-0.012, -0.025]].forEach(function (d) {
        out.push([[0.06 * sx, 0.345 + d[0], 0.33], [0.165 * sx, 0.345 + d[0] * 2 + d[1], 0.3]]);
      });
    });
    return out;
  }

  /* ---------------- the 11 accessories (≤ 300 tris each, existing sockets) ---------------- */
  function accessoryParts(acc, petId, rig) {
    var out = [];
    SLOTS.forEach(function (sl) { if (acc && acc[sl] && ACC_SOCKET[acc[sl]] === sl) accParts(acc[sl], petId, rig).forEach(function (d) { out.push(d); }); });
    return out;
  }
  function accParts(id, petId, rig) {
    var J = jointsOf(petId), S = socketsOf(petId), P = [], bunny = petId === 'pet_bunny';
    function put(d) { P.push(d); return d; }
    function t(part, dflt) { return tokOf(id, part, dflt); }
    var hat = S.hat, face = S.face;

    if (id === 'acc_partyhat') {                           /* a matte cone tilted 12°, 2 stripes, pompom */
      var hx = { r: [-8, 0, 12], p: [0.011, hat[1] - 0.02, hat[2] - 0.01] }, stripe = t('stripe', 'Star Gold'), cone = t('cone', 'Grape');
      put({ g: 'drop', a: [0.064, 0.15, CONE_PROFILE], t: hx, first: true, pf: true, bone: 'head',
            c: function (v) { var y = v.y; return (y > 0.033 && y < 0.054) || (y > 0.08 && y < 0.098) ? stripe : cone; } });
      put({ g: 'puff', a: [0.024], t: [{ p: [0, 0.15, 0] }, hx], c: t('pompom', 'Coral'), bone: 'head' });
    }
    if (id === 'acc_crown') {                              /* a thin GOLD band, 5 sharp points, a gem, a glint */
      var cx = { r: [-8, 0, 0], p: [0, hat[1] + 0.002, hat[2]] };
      put({ g: 'tube', a: [0.08, 0.077, 0.03, 12, true], t: cx, c: t('band', 'Gold Base'), bone: 'head', mat: 'gold' });
      put({ g: 'tube', a: [0.074, 0.071, 0.03, 12, true], t: cx, c: t('band', 'Gold Base'), bone: 'head', mat: 'gold', invert: true });
      for (var k = 0; k < 5; k++) {
        var ang = PI / 2 + k * TAU / 5;
        put({ g: 'cone', a: [0.015, 0.06, 4], t: [{ p: [0.077 * Math.cos(ang), 0.044, 0.077 * Math.sin(ang)] }, cx], c: t('band', 'Gold Base'), bone: 'head', mat: 'gold' });
      }
      put({ g: 'puff', a: [0.014], t: [{ s: [1, 1, 0.6], p: [0, 0.002, 0.082] }, cx], c: t('gem', 'Rose Deep'), bone: 'head' });
      if (rig) {
        put({ g: 'star4flat', a: [0.03, 0.008], t: { p: J.glint }, c: 'Cloud White', bone: 'glint', mat: 'shine', rig: true });
        put({ g: 'star4flat', a: [0.03, 0.008], t: { r: [0, 180, 0], p: J.glint }, c: 'Cloud White', bone: 'glint', mat: 'shine', rig: true });
      }
    }
    if (id === 'acc_bow') {                                /* 15 % smaller: 2 flattened cones, 6 spots, a gold knot */
      var B = [0, 0.262, 0.278], spot = t('spot', 'Cloud White'), bow = t('bow', 'Rose Deep'), q = 0.85;
      [-1, 1].forEach(function (sx) {
        put({ g: 'cone', a: [0.042 * q, 0.075 * q, 10], t: { s: [1, 1, 0.45], r: [0, 0, 90 * sx], p: add3(B, [0.04 * q * sx, 0, 0]) }, c: bow, bone: 'neck' });
        [[0.052, 0.017, 0.011], [0.052, -0.017, 0.011], [0.03, 0, 0.008]].forEach(function (d) {
          put({ g: 'disc', a: [0.008 * q, 0.004, 6], t: { p: add3(B, [d[0] * q * sx, d[1] * q, d[2] * q]) }, c: spot, bone: 'neck' });
        });
      });
      put({ g: 'puff', a: [0.017], t: { s: [1, 1, 0.8], p: add3(B, [0, 0, 0.005]) }, c: t('knot', 'Star Gold'), bone: 'neck' });
    }
    if (id === 'acc_scarf') {                              /* a slimmer striped collar and a swinging tail */
      var sc = t('scarf', 'Splash Blue'), st = t('stripe', 'Coral');
      put({ g: 'ring', a: [0.108, 0.022], t: { r: [-53, 0, 0], p: [0, 0.262, 0.158] }, first: true, pf: true, bone: 'neck',
            c: function (v) { var a = Math.atan2(v.y, v.x); return Math.floor((a + PI) / (TAU / 12)) % 2 ? st : sc; } });
      put({ g: 'puff', a: [0.032], t: { s: [0.75, 1.9, 0.35], r: [0, 0, 10], p: add3(J.scarfTail, [0.005, -0.055, 0.012]) }, first: true, pf: true,
            bone: 'scarfTail', c: function (v) { return Math.floor((v.y + 0.04) / 0.02) % 2 ? st : sc; } });
    }
    if (id === 'acc_shades') {                             /* one wraparound shield lens (FOIL at night) on ink temples */
      var lens = t('lens', 'Midnight Ink'), ink = t('frame', 'Midnight Ink');
      var lx = { p: [0, face[1] + 0.002, face[2] - 0.15 + 0.012] }, lensArc = [0.15, 0.15, 0.032, 10, -75 * DEG, 150 * DEG];
      put({ g: 'arc', a: lensArc, t: lx, c: lens, bone: 'lens' });
      if (rig) put({ g: 'arc', a: lensArc, t: lx, c: 'Cloud White', bone: 'head', mat: 'foil', night: true });
      put({ g: 'tube', a: [0.004, 0.004, 0.034, 4], t: { r: [0, 0, 55], p: [-0.045, face[1] + 0.008, face[2] + 0.013] }, c: t('glint', 'Cloud White'), bone: 'lens', mat: 'shine' });
      [-1, 1].forEach(function (sx) {
        put({ g: 'tube', a: [0.006, 0.006, 0.13, 6], t: { r: [90, 0, 0], p: [0.142 * sx, face[1] + 0.006, face[2] - 0.115] }, c: ink, bone: 'head' });
      });
    }
    if (id === 'acc_cape') {                               /* 6×4 cloth over the back + a Gunmetal clasp */
      put({ g: 'cape', c: t('cape', 'Cape Red'), bone: 'body', cloth: true });
      put({ g: 'tube', a: [0.011, 0.011, 0.1, 6], t: { r: [0, 0, 90], p: [0, CAPE.y - 0.004, CAPE.z + 0.012] }, bone: 'body',
            c: function (v) { return v.y > CAPE.y + 0.002 ? 'Gunmetal Spec' : t('clasp', 'Gunmetal'); } });
    }
    if (id === 'acc_beanie') {                             /* a ribbed knit beanie pulled over the crown; ears poke through */
      var bx = { r: [-12, 0, 0], p: [0, 0.462, 0.163] }, knit = t('knit', 'Concrete Light'), ribT = t('rib', 'Graphite');
      put({ g: 'tube', a: [0.128, 0.142, 0.065, 20, true], t: [{ p: [0, 0.0325, 0] }, bx], first: true, pf: true, bone: 'head',
            c: function (v) { return Math.floor((Math.atan2(v.z, v.x) + PI) / (TAU / 20)) % 2 ? ribT : knit; } });
      put({ g: 'puff', a: [0.128], keep: function (x, y) { return y > -0.004; }, t: [{ s: [1, 0.72, 1], p: [0, 0.065, 0] }, bx], c: knit, bone: 'head' });
      put({ g: 'torus', a: [0.143, 0.016, 4, 14], t: [{ r: [90, 0, 0], p: [0, 0.006, 0] }, bx], c: t('cuff', 'Concrete Light'), bone: 'head' });
      put({ g: 'box', a: [0.02, 0.024, 0.005], t: [{ r: [0, 25, 0], p: [0.068, 0.008, 0.146] }, bx], c: t('tag', 'Laser Lime'), bone: 'head', mat: 'shine' });
    }
    if (id === 'acc_cap') {                                /* a snapback worn backwards; between the ears on the bunny */
      var kx = { r: [-8, 180, 0], p: [0, 0.462, 0.16] }, crownS = bunny ? [0.8, 0.74, 1] : [1, 0.74, 1.04];
      put({ g: 'puff', a: [0.146], keep: function (x, y) { return y > -0.004; }, t: [{ s: crownS }, kx], c: t('crown', 'Graphite'), bone: 'head' });
      put({ g: 'box', a: [0.15, 0.012, 0.1], t: [{ p: [0, 0.004, 0.17] }, kx], bone: 'head',
            c: function (v) { return v.y > 0 ? t('brim', 'Graphite') : [t('under', 'Graphite'), 'shade']; } });
      put({ g: 'box', a: [0.146, 0.002, 0.096], t: [{ p: [0, -0.0035, 0.17] }, kx], c: t('underOn', 'Neon Magenta'), bone: 'nightH', mat: 'shine', night: true });
      put({ g: 'tube', a: [0.016, 0.016, 0.01, 6], t: [{ p: [0, 0.146 * crownS[1] + 0.002, 0] }, kx], c: 'Concrete Light', bone: 'head' });
    }
    if (id === 'acc_headphones') {                         /* round the neck, DJ-style; rings glow on the beat at night */
      var tilt = { r: [-53, 0, 0], p: [0, 0.272, 0.165] }, band = t('band', 'Graphite');
      put({ g: 'torus', a: [0.114, 0.013, 4, 10, PI], t: tilt, c: band, bone: 'neck' });
      [-1, 1].forEach(function (sx) {
        var yaw = { r: [0, -28 * sx, 0], p: [0.114 * sx, 0, 0] };
        put({ g: 'tube', a: [0.042, 0.042, 0.03, 10], t: [{ r: [0, 0, 90] }, yaw, tilt], first: true, bone: 'neck',
              c: function (v) { return Math.abs(v.y) > 0.013 ? 'Gunmetal Mid' : t('cup', 'Gunmetal'); } });
        put({ g: 'annulus', a: [0.026, 0.036, 12], t: [{ r: [0, 90 * sx, 0], p: [0.0165 * sx, 0, 0] }, yaw, tilt], c: t('ring', 'LED Cyan'), bone: 'neck', mat: 'rings' });
      });
    }
    if (id === 'acc_visor') {                              /* a smoked wraparound band with an LED line; a dot scans at night */
      var vc = [0, face[1] + 0.004, face[2] - 0.146], band = [0.16, 0.16, 0.03, 10, -70 * DEG, 140 * DEG];
      put({ g: 'arc', a: band, t: { p: vc }, bone: 'head', c: function (v) { return v.y > vc[1] + 0.009 ? 'Glass Edge' : t('band', 'Smoked Glass'); } });
      put({ g: 'arc', a: [0.1615, 0.1615, 0.005, 10, -70 * DEG, 140 * DEG], t: { p: vc }, c: t('line', 'LED Cyan'), bone: 'head', mat: 'shine' });
      put({ g: 'disc', a: [0.007, 0.004, 6], t: { r: [90, 0, 0], p: [0, vc[1], vc[2] + 0.165] }, c: t('dot', 'Bone White'), bone: 'scan', mat: 'shine', night: true });
    }
    if (id === 'acc_hoodie') {                             /* a graphite hoodie shell, a draped hood, neon drawstrings */
      var hb = t('body', 'Graphite');
      put({ g: 'capsule', a: [0.16 * 1.06, 0.2 * 1.06, 2, 8], keep: function (x, y, z) { return z < 0.4 * 0.17; },
            t: [{ r: [90, 0, 0] }, { s: [0.85, 0.8, 0.85], p: [0, BODY_Y + 0.004, -0.01] }], c: hb, bone: 'body' });
      put({ g: 'puff', a: [0.09], keep: function (x, y, z) { return z < 0.01; }, t: { s: [1.15, 0.75, 0.85], r: [-20, 0, 0], p: [0, 0.37, 0.02] },
            c: [t('hood', 'Graphite'), 'shade'], bone: 'body' });
      [-1, 1].forEach(function (sx) {
        put({ g: 'ribbon', a: [[[0.028 * sx, 0.3, 0.205], [0.03 * sx, 0.27, 0.215], [0.031 * sx, 0.242, 0.215]], 0.006, 3], c: t('string', 'Neon Magenta'), bone: 'body', mat: 'shine' });
      });
    }
    return P;
  }
  function accTris(id, petId, tier) { return sumTris(accParts(id, petId || 'pet_puppy', true), tier); }
  function petTris(petId, tier, acc) { return sumTris(petParts(petId, accState(acc), true), tier); }

  /* ---------------- the avatar: a stage-ready chibi in streetwear, h 1.0 ---------------- */
  var AV_BONES = ['base', 'body', 'head', 'armL', 'armR', 'legL', 'legR'];
  var AV_PARENT = { base: null, body: 'base', head: 'body', armL: 'body', armR: 'body', legL: 'base', legR: 'base' };
  var AV_J = { base: [0, 0, 0], body: [0, AV_BODY_Y, 0], head: [0, 0.6, 0], armL: [0.175, 0.57, 0], armR: [-0.175, 0.57, 0],
               legL: [0.068, 0.27, 0], legR: [-0.068, 0.27, 0], headC: [0, 0.775, 0], hand: [-0.212, 0.345, 0.03] };
  var FACE = { R: 0.205, alpha: 55 * DEG, rings: 4, segs: 16 };
  var HOOD_OPEN = Math.acos(0.12 / 0.225);   /* the hood keeps z < 0.12: a clean round opening for the face */
  var AV_H = 1.0;
  /* member = '#hex' (runtime colour); the face cap is built separately (its own emoji map) */
  function avatarParts(member, tier) {
    var low = tier === 'LOW', P = [], hc = AV_J.headC, m = { rgb: member };
    function put(d) { P.push(d); return d; }
    /* the oversized hoodie with a member chest band, its hem a shade darker */
    put({ g: 'capsule', a: [0.17, 0.2, 2, 10], t: { s: [1, 0.78, 0.92], p: [0, 0.405, 0] }, bone: 'body',
          c: function (v) { return v.y > 0.36 && v.y < 0.4 ? m : v.y < 0.23 ? ['Graphite', 'shade'] : 'Graphite'; } });
    /* the hood shell (back, top and sides: open where z > 0.12) in the member colour −12 % L,
       a member rim round the face */
    put({ g: 'cap', a: [0.225, HOOD_OPEN, PI, low ? 4 : 6, low ? 12 : 16], t: { p: hc }, c: { rgb: member, tn: -0.12 }, bone: 'head' });
    put({ g: 'torus', a: [0.17, 0.022, 4, low ? 10 : 14], t: { p: add3(hc, [0, 0, 0.115]) }, c: m, bone: 'head' });
    /* drawstrings and the headset mic: the 'on stage' tell */
    [-1, 1].forEach(function (sx) {
      put({ g: 'ribbon', a: [[add3(hc, [0.045 * sx, -0.165, 0.12]), add3(hc, [0.048 * sx, -0.21, 0.13]), add3(hc, [0.05 * sx, -0.255, 0.138])], 0.006, low ? 2 : 3], c: 'Bone White', bone: 'body' });
    });
    put({ g: 'ribbon', a: [[add3(hc, [0.215, 0.0, 0.02]), add3(hc, [0.175, -0.07, 0.12]), add3(hc, [0.1, -0.105, 0.172])], 0.005, low ? 3 : 5], c: 'Gunmetal', bone: 'head' });
    put({ g: 'tube', a: [0.012, 0.012, 0.022, low ? 4 : 6], t: { r: [0, 0, 70], p: add3(hc, [0.09, -0.108, 0.178]) }, c: 'Graphite', bone: 'head' });
    /* sleeves with member cuffs, Bone White hands */
    [['armL', 1], ['armR', -1]].forEach(function (a) {
      var j = AV_J[a[0]], sx = a[1], cuffY = j[1] - 0.17;
      put({ g: 'puff', a: [0.055], t: { s: [0.8, 1.9, 0.8], p: add3(j, [0.02 * sx, -0.09, 0]) }, bone: a[0], c: function (v) { return v.y < cuffY ? m : 'Graphite'; } });
      if (low) put({ g: 'tube', a: [0.03, 0.028, 0.045, 6], t: { p: add3(j, [0.037 * sx, -0.225, 0.03]) }, c: 'Bone White', bone: a[0] });
      else put({ g: 'puff', a: [0.03], t: { p: add3(j, [0.037 * sx, -0.225, 0.03]) }, c: 'Bone White', bone: a[0] });
    });
    /* joggers and sneakers (a member sole stripe, an ink lace dot) */
    [['legL', 1], ['legR', -1]].forEach(function (a) {
      var sx = a[1];
      put({ g: 'puff', a: [0.06], t: { s: [1, 1.85, 1], p: [0.068 * sx, 0.15, 0] }, c: 'Night Asphalt', bone: a[0] });
      put({ g: 'puff', a: [0.06], t: { s: [0.85, 0.5, 1.3], p: [0.07 * sx, 0.042, 0.025] }, bone: a[0], pf: true,
            c: function (v) { return v.z > 0.07 && v.y > 0.05 ? 'Midnight Ink' : 'Bone White'; } });
      if (!low) put({ g: 'box', a: [0.104, 0.014, 0.155], t: { p: [0.07 * sx, 0.009, 0.025] }, c: m, bone: a[0] });
    });
    return P;
  }
  function avatarTris(tier) {
    return sumTris(avatarParts(null, tier), tier) + primTris({ g: 'cap', a: [FACE.R, 0, FACE.alpha, FACE.rings, FACE.segs] }, tier);
  }

  /* ---------------- the Spark Stick: a 4-point ✦ prism on an ink handle ---------------- */
  function wandParts(detail, member) {
    var m = { rgb: member }, P = [], W = WAND;
    if (detail === 'crowd') {
      P.push({ g: 'tube', a: [0.011, 0.011, 0.1, 4], t: { p: [0, 0.05, 0] }, c: 'Midnight Ink', part: 'handle' });
      P.push({ g: 'star4', a: [W.crowd.rOut, W.crowd.rIn, W.crowd.depth, 0], t: { p: [0, W.crowd.tip, 0] }, c: m, part: 'head' });
      return P;
    }
    P.push({ g: 'tube', a: [0.014, 0.014, 0.13, 8], t: { p: [0, 0.065, 0] }, c: 'Midnight Ink', part: 'handle' });
    P.push({ g: 'tube', a: [0.0165, 0.0165, 0.022, 8, true], t: { p: [0, 0.042, 0] }, c: m, part: 'handle' });
    P.push({ g: 'tube', a: [0.02, 0.016, 0.012, 8], t: { p: [0, 0.134, 0] }, part: 'handle',
             c: function (v) { return v.y > 0.136 ? 'Gunmetal Spec' : 'Gunmetal'; } });
    P.push({ g: 'star4', a: [W.rOut, W.rIn, W.depth, W.bevel], t: { p: [0, W.tip, 0] }, c: m, part: 'head' });
    var front = W.depth / 2 + W.bevel + 0.002;
    P.push({ g: 'star4flat', a: [W.rOut * W.core, W.rIn * W.core], t: { p: [0, W.tip, front] }, c: 'Bone White', part: 'head' });
    P.push({ g: 'star4flat', a: [W.rOut * W.core, W.rIn * W.core], t: { r: [0, 180, 0], p: [0, W.tip, -front] }, c: 'Bone White', part: 'head' });
    P.push({ g: 'fan', a: [W.halo / 2, 12], t: { p: [0, W.tip, -0.004] }, c: m, part: 'halo' });
    return P;
  }
  function wandTris(detail) { return sumTris(wandParts(detail, null), 'MID'); }

  /* ---------------- fan blobs: hooded silhouettes (≤ BUDGET.fan for the crowd body) ---------------- */
  function fanParts(detail) {
    if (detail === 'hero') {
      return [
        { g: 'puff', a: [0.13], t: { s: [1, 1.12, 0.95], p: [0, 0.15, 0] }, c: 'Cloud White', part: 'body' },
        { g: 'puff', a: [0.135], keep: function (x, y, z) { return y > 0.02 && z < 0.07; }, t: { s: [1.02, 1.1, 1], p: [0, 0.16, -0.01] }, c: 'Concrete', part: 'body' },
        { g: 'disc', a: [0.014, 0.004, 6], t: { p: [-0.042, 0.19, 0.122] }, c: 'Bone White', part: 'eyes' },
        { g: 'disc', a: [0.014, 0.004, 6], t: { p: [0.042, 0.19, 0.122] }, c: 'Bone White', part: 'eyes' }
      ];
    }
    return [
      { g: 'tube', a: [0.1, 0.12, 0.2, 7], t: { p: [0, 0.1, 0] }, c: 'Cloud White', part: 'body' },
      { g: 'cone', a: [0.1, 0.07, 7], t: { p: [0, 0.235, 0] }, c: 'Concrete', part: 'body' }
    ];
  }

  /* ================================================================
     BROWSER BUILDERS — THREE is used only inside these functions (K.THREE)
     ================================================================ */
  function normHex(h) {
    if (typeof h !== 'string') return null;
    var m = /^#?([0-9a-f]{6})$/i.exec(h.trim());
    if (m) return '#' + m[1].toUpperCase();
    m = /^#?([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(h.trim());
    return m ? ('#' + m[1] + m[1] + m[2] + m[2] + m[3] + m[3]).toUpperCase() : null;
  }
  function mergeAll(G, list) { var m = G.merge(list); list.forEach(function (g) { g.dispose(); }); return m; }
  /* a flat disc facing +z (a squat tube) */
  function disc(G, r, thick, radial) { return G.t(G.tube(r, thick, { radial: radial || 10 }), { r: [90, 0, 0] }); }
  /* turn a closed shell inside out (normals and winding) so its inner wall shows */
  function invert(geo) {
    ['position', 'normal', 'color'].forEach(function (n) {
      var a = geo.getAttribute(n), arr = a.array;
      for (var i = 0; i + 8 < arr.length; i += 9) for (var k = 0; k < 3; k++) { var t = arr[i + 3 + k]; arr[i + 3 + k] = arr[i + 6 + k]; arr[i + 6 + k] = t; }
      if (n === 'normal') for (var j = 0; j < arr.length; j++) arr[j] = -arr[j];
      a.needsUpdate = true;
    });
    return geo;
  }
  /* keep only the triangles whose centroid passes keep(x, y, z) of a normalised geometry */
  function trimTris(K, geo, keep) {
    var T = K.THREE, P = geo.getAttribute('position').array, N = geo.getAttribute('normal').array, C = geo.getAttribute('color').array;
    var tri = P.length / 9, idx = [];
    for (var i = 0; i < tri; i++) {
      if (!keep((P[i * 9] + P[i * 9 + 3] + P[i * 9 + 6]) / 3, (P[i * 9 + 1] + P[i * 9 + 4] + P[i * 9 + 7]) / 3, (P[i * 9 + 2] + P[i * 9 + 5] + P[i * 9 + 8]) / 3)) continue;
      idx.push(i);
    }
    var p = new Float32Array(idx.length * 9), nn = new Float32Array(idx.length * 9), c = new Float32Array(idx.length * 9);
    idx.forEach(function (t, j) { p.set(P.subarray(t * 9, t * 9 + 9), j * 9); nn.set(N.subarray(t * 9, t * 9 + 9), j * 9); c.set(C.subarray(t * 9, t * 9 + 9), j * 9); });
    geo.dispose();
    var out = new T.BufferGeometry();
    out.setAttribute('position', new T.BufferAttribute(p, 3));
    out.setAttribute('normal', new T.BufferAttribute(nn, 3));
    out.setAttribute('color', new T.BufferAttribute(c, 3));
    return out;
  }
  function starShape(T, rOut, rIn) {
    var sh = new T.Shape(), pts = starOutline(WAND.points, rOut, rIn);
    pts.forEach(function (p, i) { if (i) sh.lineTo(p[0], p[1]); else sh.moveTo(p[0], p[1]); });
    sh.closePath();
    return sh;
  }
  /* the ✦ prism (bevelled on the hero stick), centred on its depth, facing +z */
  function star4(K, rOut, rIn, depth, bevel) {
    var T = K.THREE, g = new T.ExtrudeGeometry(starShape(T, rOut, rIn), {
      depth: depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 1, steps: 1
    });
    g.translate(0, 0, -depth / 2);
    return K.G.normalise(g);
  }
  /* a flat radial glow: the centre in colour c fading to black at the rim (for additive blending) */
  function fanDisc(K, r, segs, c) {
    var T = K.THREE, P = new Float32Array(segs * 9), N = new Float32Array(segs * 9), C = new Float32Array(segs * 9);
    for (var i = 0; i < segs; i++) {
      var a0 = i / segs * TAU, a1 = (i + 1) / segs * TAU, o = i * 9;
      P[o + 3] = Math.cos(a0) * r; P[o + 4] = Math.sin(a0) * r; P[o + 6] = Math.cos(a1) * r; P[o + 7] = Math.sin(a1) * r;
      for (var k = 0; k < 3; k++) N[o + k * 3 + 2] = 1;
      C[o] = c.r; C[o + 1] = c.g; C[o + 2] = c.b;
    }
    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(P, 3));
    g.setAttribute('normal', new T.BufferAttribute(N, 3));
    g.setAttribute('color', new T.BufferAttribute(C, 3));
    return g;
  }
  /* a spherical zone round +z between polar angles a0 and a1 (rings × segs); a0 = 0 makes a cap
     (one fan at the pole). The planar uv (for the emoji face) spans the cap's rim. */
  function capGeo(K, R, a0, a1, rings, segs) {
    var T = K.THREE, ringR = R * Math.sin(Math.min(a1, PI / 2)), list = [];
    function v(ri, si) {
      var th = a0 + (a1 - a0) * ri / rings, ph = si / segs * TAU, s = Math.sin(th);
      return [R * s * Math.cos(ph), R * s * Math.sin(ph), R * Math.cos(th)];
    }
    for (var ri = 0; ri < rings; ri++) for (var si = 0; si < segs; si++) {
      var a = v(ri, si), b = v(ri + 1, si), c = v(ri + 1, si + 1), d = v(ri, si + 1);
      if (ri === 0 && a0 <= 0) list.push(a, b, c); else list.push(a, b, c, a, c, d);
    }
    var n = list.length, P = new Float32Array(n * 3), N = new Float32Array(n * 3), C = new Float32Array(n * 3).fill(1), UV = new Float32Array(n * 2);
    list.forEach(function (p, i) {
      P[i * 3] = p[0]; P[i * 3 + 1] = p[1]; P[i * 3 + 2] = p[2];
      N[i * 3] = p[0] / R; N[i * 3 + 1] = p[1] / R; N[i * 3 + 2] = p[2] / R;
      UV[i * 2] = 0.5 + p[0] / (2 * ringR); UV[i * 2 + 1] = 0.5 + p[1] / (2 * ringR);
    });
    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(P, 3));
    g.setAttribute('normal', new T.BufferAttribute(N, 3));
    g.setAttribute('color', new T.BufferAttribute(C, 3));
    g.setAttribute('uv', new T.BufferAttribute(UV, 2));
    return g;
  }
  /* the cape cloth, shaped over the back (horizontal: top edge at z 0, hem CAPE.len behind) */
  function capeGeo(G) {
    var cape = G.t(G.flag(CAPE.w, CAPE.len, 6, 4), { p: [-CAPE.w / 2, 0, 0] });
    G.t(cape, { r: [-90, 0, 0] });
    var P = cape.getAttribute('position').array;
    for (var i = 0; i < P.length; i += 3) {
      var v = clamp01((CAPE.len / 2 - P[i + 2]) / CAPE.len), x = P[i];
      P[i + 1] = CAPE.y - 0.13 * v * v - 1.0 * x * x;
      P[i + 2] = CAPE.z - v * CAPE.len;
    }
    cape.getAttribute('position').needsUpdate = true;
    G.facet(cape);
    return cape;
  }
  /* a part colour → what G.paint / G.paintBy accept */
  function colourOf(K, c) {
    if (c && typeof c === 'object' && !Array.isArray(c)) {
      if (c.isColor) return c;
      if (c.rgb) return c.tn ? K.tone(K.rgb(c.rgb), c.tn) : K.rgb(c.rgb);
      if (c.mix) return K.col(c.mix[0]).lerp(K.col(c.mix[1]), c.mix[2]);
    }
    return c;
  }
  function paintPart(K, geo, d) {
    var G = K.G, c = d.c;
    if (typeof c === 'function') {
      G.paintBy(geo, function (v) { var r = c(v); return r && typeof r === 'object' && !Array.isArray(r) ? colourOf(K, r) : r; }, { perFace: !!d.pf });
    } else if (Array.isArray(c)) G.paint(geo, c[0], c[1]);
    else if (c != null) G.paint(geo, colourOf(K, c));
    return geo;
  }
  /* ONE interpreter for every recipe descriptor */
  function geoOf(K, d) {
    var G = K.G, T = K.THREE, a = d.a || [], low = K.tier === 'LOW', g;
    switch (d.g) {
      case 'puff': g = G.puff(a[0]); break;
      case 'sphere': g = G.puff(a[0], { sphere: true }); break;
      case 'bean': g = G.bean(a[0], a[1]); break;
      case 'capsule': g = G.normalise(new T.CapsuleGeometry(a[0], a[1], low ? Math.min(a[2], 2) : a[2], low ? Math.min(a[3], 8) : a[3])); break;
      case 'tube': g = G.tube(a[0], a[1], a[2], { radial: a[3], open: !!a[4] }); break;
      case 'cone': g = G.cone(a[0], a[1], a[2]); break;
      case 'drop': g = G.drop(a[0], a[1], a[2]); break;
      case 'ring': g = G.ring(a[0], a[1]); break;
      case 'torus': g = G.normalise(new T.TorusGeometry(a[0], a[1], a[2], a[3], a[4] == null ? TAU : a[4])); break;
      case 'arc': g = G.normalise(new T.CylinderGeometry(a[0], a[1], a[2], a[3], 1, true, a[4], a[5])); break;
      case 'annulus': g = G.normalise(new T.RingGeometry(a[0], a[1], a[2])); break;
      case 'box': g = G.slab(a[0], a[1], a[2], 0); break;
      case 'disc': g = disc(G, a[0], a[1], a[2]); break;
      case 'ribbon': g = G.ribbon(a[0], a[1], { segments: a[2] }); break;
      case 'star4': g = star4(K, a[0], a[1], a[2], a[3]); break;
      case 'star4flat': g = G.normalise(new T.ShapeGeometry(starShape(T, a[0], a[1]), 1)); break;
      case 'cape': g = capeGeo(G); break;
      case 'cap': g = capGeo(K, a[0], a[1], a[2], a[3], a[4]); break;
      case 'fan': g = fanDisc(K, a[0], a[1], colourOf(K, d.c)); break;
      default: throw new Error('characters: unknown part ' + d.g);
    }
    if (d.keep) g = trimTris(K, g, d.keep);
    if (d.first && d.g !== 'fan') paintPart(K, g, d);
    [].concat(d.t || []).forEach(function (tr) { G.t(g, tr); });
    if (!d.first && d.g !== 'fan') paintPart(K, g, d);
    if (d.invert) invert(g);
    return g;
  }

  /* ================================================================
     PET ASSEMBLY — every part in the rest pose, ITEM space, tagged with its bone
     and material. Rigs get the rig-only and night parts; photocard templates get
     the day look (no blush). Both draw the kitten's whiskers as thin toon tubes.
     → {parts: [{geo, bone, mat, cloth?}], whiskers (null), J, S}
     ================================================================ */
  function assemblePet(K, petId, acc, mode) {
    var rig = !!(mode && mode.rig), list = petParts(petId, acc, rig), parts = [];
    list.forEach(function (d) {
      if (!rig && (d.night || d.blush || d.rig)) return;
      var mat = d.mat || 'toon';
      if (!rig && mat === 'rings') mat = 'shine';
      parts.push({ geo: geoOf(K, d), bone: d.bone || 'body', mat: mat, cloth: !!d.cloth });
    });
    /* whiskers: always null since perf (they are toon tubes in parts, rig or not) */
    return { parts: parts, whiskers: null, J: jointsOf(petId), S: socketsOf(petId) };
  }

  /* ---------------- rigid-skinned geometry (cached per pet + accessories + tier) ---------------- */
  function skinnedGeometry(T, parts, boneList) {
    var m = skinMerge(parts.map(function (p) {
      return { pos: p.geo.getAttribute('position').array, nrm: p.geo.getAttribute('normal').array, col: p.geo.getAttribute('color').array, bone: boneList.indexOf(p.bone) };
    }));
    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(m.pos, 3));
    g.setAttribute('normal', new T.BufferAttribute(m.nrm, 3));
    g.setAttribute('color', new T.BufferAttribute(m.col, 3));
    g.setAttribute('skinIndex', new T.Uint16BufferAttribute(m.skinIndex, 4));
    g.setAttribute('skinWeight', new T.BufferAttribute(m.skinWeight, 4));
    g.computeBoundingSphere();
    return { geo: g, ranges: m.ranges, count: m.count };
  }
  var RIG_MATS = ['toon', 'shine', 'gold', 'foil', 'rings'];
  function rigData(K, petId, acc) {
    return K.parts.get('char:rig|' + petId + '|' + accKey(acc), K.tier, function (Kt) {
      var T = Kt.THREE, a = assemblePet(Kt, petId, acc, { rig: true });
      var by = {};
      RIG_MATS.forEach(function (m) { by[m] = []; });
      a.parts.forEach(function (p) { (by[p.mat] || by.toon).push(p); });
      by.toon.sort(function (x, y) { return (x.cloth ? 1 : 0) - (y.cloth ? 1 : 0); });   /* cloth last: one contiguous range */
      var out = { J: a.J, S: a.S, whiskers: a.whiskers, cape: null, tris: 0 };
      RIG_MATS.forEach(function (mat) {
        out[mat] = null;
        if (!by[mat].length) return;
        var s = skinnedGeometry(T, by[mat], BONES);
        out[mat] = s.geo;
        if (mat !== 'foil') out.tris += s.count / 3;           /* the foil lens swaps in for the day lens */
        var last = by[mat].length - 1;
        if (mat === 'toon' && by.toon[last].cloth) {
          var r = s.ranges[last];
          out.cape = { start: r[0], count: r[1], base: new Float32Array(s.geo.getAttribute('position').array.subarray(r[0] * 3, (r[0] + r[1]) * 3)) };
        }
      });
      a.parts.forEach(function (p) { p.geo.dispose(); });
      return out;
    });
  }

  /* ================================================================
     makeRig(petId, acc, tier) → PetRig
     ================================================================ */
  var OPT_KEYS = ['speed', 'intensity', 'reduced', 'seed', 'rate', 'bpm', 'steer', 'height', 'dur', 'left', 'ground'];
  var rigSeq = 0;
  function quality(S) { return (S && S.quality) || { outlines: true }; }
  /* the character hull: 0.009 u in Midnight Ink, MID/HIGH only */
  function hullMaterial(K) { return K.variant('outline:' + OUTLINE_CHAR, 'skin', { color: K.col(OUTLINE_TOKEN) }); }
  /* the headphone rings' shared unlit material (dim by day, full and beat-pulsed at night) */
  function ringsMaterial(K) { return K.variant('state', 'char:rings', {}); }
  function buildBones(T, J, names, parent, holder) {
    var bones = {}, list = [];
    names.forEach(function (n) {
      var b = new T.Bone(), p = parent[n], j = J[n], pj = p ? J[p] : [0, 0, 0];
      b.name = n;
      b.position.set(j[0] - pj[0], j[1] - pj[1], j[2] - pj[2]);
      (p ? bones[p] : holder).add(b);
      bones[n] = b; list.push(b);
    });
    holder.updateMatrixWorld(true);
    return { bones: bones, skeleton: new T.Skeleton(list) };
  }
  function skinnedMesh(T, geo, material, skeleton, holder, name) {
    var m = new T.SkinnedMesh(geo, material);
    m.name = name; m.frustumCulled = false; m.castShadow = false; m.receiveShadow = true;
    holder.add(m);
    m.bind(skeleton, new T.Matrix4());
    return m;
  }
  /* a per-copy geometry for CPU cloth: its own position buffer, every other attribute shared */
  function clothCopy(T, geo) {
    var g = new T.BufferGeometry(), pos = geo.getAttribute('position');
    var own = new T.BufferAttribute(new Float32Array(pos.array), 3);
    own.setUsage(T.DynamicDrawUsage);
    g.setAttribute('position', own);
    ['normal', 'color', 'skinIndex', 'skinWeight'].forEach(function (n) { g.setAttribute(n, geo.getAttribute(n)); });
    g.boundingSphere = geo.boundingSphere ? geo.boundingSphere.clone() : null;
    return g;
  }
  function releaseCopy(g) {
    ['normal', 'color', 'skinIndex', 'skinWeight'].forEach(function (n) { g.deleteAttribute(n); });   /* keep the shared buffers alive */
    g.dispose();
  }
  /* the whole-body transform: squash about the feet, rotate about the body centre */
  function baseTransform(T, b, p, cy, _q, _e, _v) {
    _e.set((p.pitch || 0) * DEG, (p.yaw || 0) * DEG, (p.roll || 0) * DEG, 'YXZ');
    _q.setFromEuler(_e);
    var sy = num(p.sy, 1), c = cy * sy;
    _v.set(0, c, 0).applyQuaternion(_q);
    b.quaternion.copy(_q);
    b.position.set((p.x || 0) - _v.x, (p.y || 0) + c - _v.y, (p.z || 0) - _v.z);
    b.scale.set(num(p.sx, 1) || 1e-4, sy || 1e-4, num(p.sz, 1) || 1e-4);
  }
  function scaleBone(b, s) { s = s > 1e-4 ? s : 1e-4; b.scale.set(s, s, s); }

  function makeRig(SL3D, petId, acc, tier) {
    if (PETS.indexOf(petId) < 0) petId = 'pet_puppy';
    acc = accState(acc);
    var K = SL3D.kit(tier), T = K.THREE, data = rigData(K, petId, acc);
    var hasShades = acc.face === 'acc_shades', hasCrown = acc.hat === 'acc_crown', hasVisor = acc.face === 'acc_visor';
    var group = new T.Group();
    group.name = 'pet:' + petId;
    var sk = buildBones(T, data.J, BONES, BONE_PARENT, group), bones = sk.bones, skeleton = sk.skeleton;

    /* meshes: toon (+ cloth), shine (unlit), gold (crown), foil (shades at night), rings (headphones) */
    var toonGeo = data.cape ? clothCopy(T, data.toon) : data.toon;
    var meshes = { toon: skinnedMesh(T, toonGeo, K.mat('toon'), skeleton, group, 'toon') };
    if (data.shine) meshes.shine = skinnedMesh(T, data.shine, K.mat('state'), skeleton, group, 'shine');
    if (data.gold) meshes.gold = skinnedMesh(T, data.gold, K.mat('gold'), skeleton, group, 'gold');
    if (data.foil) { meshes.foil = skinnedMesh(T, data.foil, K.mat('foil'), skeleton, group, 'foil'); meshes.foil.visible = false; }
    var ringMat = data.rings ? ringsMaterial(K) : null;
    if (data.rings) meshes.rings = skinnedMesh(T, data.rings, ringMat, skeleton, group, 'rings');
    if (K.tier !== 'LOW' && K.outlines !== false && quality(SL3D).outlines) {
      meshes.outline = skinnedMesh(T, toonGeo, hullMaterial(K), skeleton, group, 'outline');
      meshes.outline.receiveShadow = false;
    }
    /* sockets and anchors follow their bones */
    var sockets = {}, anchors = {};
    SOCKETS.forEach(function (s) {
      var o = new T.Object3D(), bn = SOCKET_BONE[s], j = data.J[bn], p = data.S[s];
      o.name = 'socket:' + s; o.position.set(p[0] - j[0], p[1] - j[1], p[2] - j[2]);
      bones[bn].add(o); sockets[s] = o;
    });
    var topY = TOP_Y[petId];
    [['top', 'head', [0, topY, 0.17]], ['emote', 'head', [0.14, topY - 0.06, 0.2]], ['dizzy', 'spark', data.J.spark]].forEach(function (a) {
      var o = new T.Object3D(), j = data.J[a[1]];
      o.name = 'anchor:' + a[0]; o.position.set(a[2][0] - j[0], a[2][1] - j[1], a[2][2] - j[2]);
      bones[a[1]].add(o); anchors[a[0]] = o;
    });

    var pose = restPose({}), opts = { species: petId }, seed = (rigSeq++ * 2654435761) >>> 0, showK = 0, pulse = 1, disposed = false;
    var _q = new T.Quaternion(), _e = new T.Euler(), _v = new T.Vector3(), _cd = {};
    var unsub = typeof SL3D.onQuality === 'function' ? SL3D.onQuality(function (q) { if (meshes.outline && q && q.outlines === false) meshes.outline.visible = false; }) : null;
    function rot(b, x, y, z, order) { b.rotation.set(x * DEG, y * DEG, z * DEG, order || 'XYZ'); }
    var clothK = -1;
    function cloth(k, t) {
      var c = data.cape;
      if (!c) return;
      if (k <= 0 && clothK === 0) return;                  /* flat and already at rest */
      var attr = toonGeo.getAttribute('position'), arr = attr.array, base = c.base, o3 = c.start * 3, red = !!opts.reduced;
      for (var i = 0; i < c.count; i++) {
        capeDeform(base[i * 3], base[i * 3 + 1], base[i * 3 + 2], t, k, red, _cd);
        arr[o3 + i * 3] = _cd.x; arr[o3 + i * 3 + 1] = _cd.y; arr[o3 + i * 3 + 2] = _cd.z;
      }
      if (typeof attr.addUpdateRange === 'function') { attr.clearUpdateRanges(); attr.addUpdateRange(o3, c.count * 3); }
      attr.needsUpdate = true;
      clothK = k <= 0 ? 0 : k;
    }
    /* Showtime switches: the night-only parts, the shades' foil lens, the rings' level */
    function applyShow() {
      var night = showK > 0.5;
      scaleBone(bones.nightH, night ? 1 : 0);
      scaleBone(bones.lens, hasShades && night ? 0 : 1);
      if (meshes.foil) meshes.foil.visible = hasShades && night;
      if (ringMat) ringMat.color.setScalar(night ? pulse : 0.45);
    }
    function setPose(p) {
      if (disposed || !p) return rig;
      if (p !== pose) for (var i = 0; i < POSE_KEYS.length; i++) { var key = POSE_KEYS[i]; pose[key] = typeof p[key] === 'number' ? p[key] : (POSE_ONE[key] || 0); }
      p = pose;
      baseTransform(T, bones.base, p, BODY_Y, _q, _e, _v);
      rot(bones.body, 0, p.hips, 0);
      rot(bones.neck, p.neck, 0, 0);
      rot(bones.head, p.headPitch, p.headYaw, p.headRoll, 'YXZ');
      rot(bones.earL, -p.earBack, 0, -p.earL);
      rot(bones.earR, -p.earBack, 0, p.earR);
      rot(bones.tail, p.tailPitch, p.tailYaw, 0, 'YXZ');
      rot(bones.tailTip, 0, p.tailCurl, 0);
      rot(bones.legFL, -p.legFL, 0, p.legFLz, 'ZXY');
      rot(bones.legFR, -p.legFR, 0, -p.legFRz, 'ZXY');
      rot(bones.legBL, -p.legBL, 0, 0);
      rot(bones.legBR, -p.legBR, 0, 0);
      rot(bones.wingL, 0, 0, p.wingL);
      rot(bones.wingR, 0, 0, -p.wingR);
      rot(bones.scarfTail, p.scarf, 0, 0);
      bones.eyes.scale.set(1, clamp(p.eye * EYE_OPEN, 0.05, 1.1), 1);
      var s = p.spark > 0.01 ? Math.min(1.2, p.spark) : 0;
      bones.spark.scale.set(s || 1e-4, s || 1e-4, s || 1e-4); bones.spark.rotation.set(0, p.sparkSpin * DEG, 0);
      scaleBone(bones.glint, clamp(p.glint, 0, 1.2));
      scaleBone(bones.blush, p.blush > 0.02 ? 0.6 + 0.4 * clamp01(p.blush) : 0);
      if (hasVisor) {                                      /* the visor dot scans only at night */
        scaleBone(bones.scan, showK > 0.5 ? 1 : 0);
        bones.scan.rotation.set(0, visorScan(p.wave, !!opts.reduced) * DEG, 0);
      }
      cloth(clamp01(p.cape), p.wave);
      return rig;
    }
    var rig = {
      root: group, bones: bones, sockets: sockets, anchors: anchors, pose: pose, meshes: meshes, skeleton: skeleton,
      petId: petId, acc: acc, tier: K.tier, tris: data.tris,
      setPose: setPose,
      setShow: function (k) { showK = clamp01(num(k, 0)); applyShow(); if (hasVisor) setPose(pose); return rig; },
      /* the music beat (count, any phase) and its BPM: the headphone rings pulse ±20 % at night */
      setBeat: function (beat, bpm, reduced) {
        if (!ringMat) return rig;
        pulse = ringPulse(num(beat, NaN), num(bpm, 100), !!reduced);
        if (showK > 0.5) ringMat.color.setScalar(pulse);
        return rig;
      },
      /* sample a built-in clip and apply it; returns the (reused) pose */
      play: function (clip, t, o) {
        if (disposed) return pose;
        for (var i = 0; i < OPT_KEYS.length; i++) { var k = OPT_KEYS[i]; opts[k] = o ? o[k] : undefined; }
        if (opts.seed == null) opts.seed = seed;
        opts.species = petId;
        sampleClip(clip, t, pose, opts);
        if (hasCrown) pose.glint = Math.max(pose.glint, crownGlint(t, (seed % 1000) / 1000, !!opts.reduced));
        return setPose(pose), pose;
      },
      info: function (clip) { var c = CLIP_INFO[clip]; return c ? { loop: c.loop, dur: durOf(clip, opts) } : null; },
      dispose: function () {
        if (disposed) return;
        disposed = true;
        if (unsub) unsub();
        if (group.parent) group.parent.remove(group);
        if (toonGeo !== data.toon) releaseCopy(toonGeo);
        skeleton.dispose();
        group.clear();
      }
    };
    applyShow();
    setPose(pose);
    return rig;
  }

  /* ================================================================
     STATIC TEMPLATES for SL3D.make (photocards): the same parts merged per
     material, socket pivots, character outline. Accessories preview on a pet.
     ================================================================ */
  function petTemplate(ctx, petId, acc) {
    var K = ctx.K, a = assemblePet(K, petId, acc, { rig: false });
    var by = { toon: [], shine: [], gold: [] };
    a.parts.forEach(function (p) { if (by[p.mat]) by[p.mat].push(p.geo); else p.geo.dispose(); });
    var n = SLOTS.filter(function (s) { return acc[s]; }).length, lk = ctx.look || {}, look = {};
    for (var k in lk) look[k] = lk[k];
    look.tris = BUDGET.pet + BUDGET.acc * n;               /* a pet template carries its accessories */
    var c2 = {};
    for (var k2 in ctx) c2[k2] = ctx[k2];
    c2.look = look;
    var b = K.template(c2);
    if (by.toon.length) b.part('body', by.toon, 'toon', { outline: OUTLINE_CHAR });
    if (by.shine.length) b.part('shine', by.shine, 'state');
    if (by.gold.length) b.part('gold', by.gold, 'gold');
    SOCKETS.forEach(function (s) { b.pivot(s, a.S[s]); b.anchor(s, a.S[s]); });
    b.anchor('top', [0, TOP_Y[petId], 0.17]).anchor('dizzy', a.J.spark);
    b.hit(Array.isArray(lk.hit) ? lk.hit : [0.8, 0.8, 0.8]);
    var tpl = b.done();
    [by.toon, by.shine, by.gold].forEach(function (l) { l.forEach(function (g) { g.dispose(); }); });   /* done() merged copies */
    return tpl;
  }

  /* ================================================================
     THE SPARK STICK — the only light stick: an ink handle with a member grip and a
     gunmetal collar, a 4-point ✦ prism in the member colour (unlit) with a frosted
     white inner ✦, and a soft additive halo whose strength follows the Showtime mix.
     ================================================================ */
  function memberHex(K, hex) {
    var h = normHex(hex);
    if (h) return h;
    var L = root.SLIslandLook;
    return K.hex((L && L.MEMBER_FALLBACK) || 'Bubblegum');
  }
  function wandGeos(K, detail, hex) {
    return K.parts.get('char:wand|' + detail + '|' + hex, K.tier, function (Kt) {
      var G = Kt.G, by = { handle: [], head: [], halo: [] };
      wandParts(detail, hex).forEach(function (d) { by[d.part].push(geoOf(Kt, d)); });
      return {
        handle: mergeAll(G, by.handle), bulb: mergeAll(G, by.head), halo: by.halo.length ? mergeAll(G, by.halo) : null,
        tip: detail === 'crowd' ? WAND.crowd.tip : WAND.tip
      };
    });
  }
  /* one shared additive halo material (its opacity is the scene's Showtime level) */
  function haloMaterial(K) {
    return K.variant('state', 'char:wand-halo', { transparent: true, opacity: 0.15, blending: K.THREE.AdditiveBlending, depthWrite: false });
  }
  /* a single copy as an InstancedMesh(1) with a white instance colour: it draws with the island's
     instanced programs (toon, 'state', the additive 'state' beams, the LED / sign map program)
     rather than plain-mesh twins of them */
  function one(T, geo, mat, name) {
    var m = new T.InstancedMesh(geo, mat, 1);
    m.instanceColor = new T.InstancedBufferAttribute(new Float32Array([1, 1, 1]), 3);
    m.name = name;
    return m;
  }
  function makeWand(SL3D, colorHex, tier, detail) {
    var K = SL3D.kit(tier), T = K.THREE, hex = memberHex(K, colorHex), crowd = detail === 'crowd', g = wandGeos(K, crowd ? 'crowd' : 'hero', hex);
    var root3 = new T.Group();
    root3.name = 'wand';
    var handle = one(T, g.handle, K.mat('toon'), 'handle'), bulb = one(T, g.bulb, K.mat('state'), 'bulb'), halo = null;
    root3.add(handle, bulb);
    if (g.halo) { halo = one(T, g.halo, haloMaterial(K), 'halo'); halo.renderOrder = 2; root3.add(halo); }
    var disposed = false;
    root3.userData = {
      kind: 'wand', color: hex, tip: g.tip, points: WAND.points,
      setShow: function (k) { if (halo) halo.material.opacity = 0.15 + 0.5 * clamp01(num(k, 0)); },
      dispose: function () { if (disposed) return; disposed = true; if (root3.parent) root3.parent.remove(root3); root3.clear(); }
    };
    return root3;
  }

  /* ================================================================
     'YOU' AVATAR — a stage-ready chibi in a hoodie (h 1.0) with the child's emoji on
     the face cap; skinned like the pets (bones base, body, head, armL, armR, legL, legR).
     ================================================================ */
  function avatarData(K, hex) {
    return K.parts.get('char:avatar|' + hex, K.tier, function (Kt) {
      var T = Kt.THREE, parts = avatarParts(hex, Kt.tier).map(function (d) { return { geo: geoOf(Kt, d), bone: d.bone }; });
      var s = skinnedGeometry(T, parts, AV_BONES);
      parts.forEach(function (p) { p.geo.dispose(); });
      /* the face: a spherical cap just inside the hood opening, planar-mapped (head-local) */
      var face = capGeo(Kt, FACE.R, 0, FACE.alpha, FACE.rings, FACE.segs);
      face.translate(AV_J.headC[0] - AV_J.head[0], AV_J.headC[1] - AV_J.head[1], AV_J.headC[2] - AV_J.head[2]);
      return { skin: s.geo, face: face, tris: s.count / 3 + face.getAttribute('position').count / 3 };
    });
  }
  function makeAvatar(SL3D, opts, tier) {
    opts = opts || {};
    var K = SL3D.kit(tier), T = K.THREE, hex = memberHex(K, opts.color), data = avatarData(K, hex);
    var group = new T.Group();
    group.name = 'avatar';
    var sk = buildBones(T, AV_J, AV_BONES, AV_PARENT, group), bones = sk.bones;
    var meshes = { body: skinnedMesh(T, data.skin, K.mat('toon'), sk.skeleton, group, 'body') };
    var emoji = typeof opts.emoji === 'string' && opts.emoji ? opts.emoji : '🙂';
    var faceMat = K.variant('state', 'emoji:' + emoji, {
      map: K.tex.emojiFace(emoji), vertexColors: false, transparent: true, alphaTest: 0.05,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1
    });
    meshes.face = one(T, data.face, faceMat, 'face');
    bones.head.add(meshes.face);
    if (K.tier !== 'LOW' && K.outlines !== false && quality(SL3D).outlines) {
      meshes.outline = skinnedMesh(T, data.skin, hullMaterial(K), sk.skeleton, group, 'outline');
      meshes.outline.receiveShadow = false;
    }
    var hand = new T.Object3D();
    hand.name = 'socket:hand';
    hand.position.set(AV_J.hand[0] - AV_J.armR[0], AV_J.hand[1] - AV_J.armR[1], AV_J.hand[2] - AV_J.armR[2]);
    bones.armR.add(hand);
    var top = new T.Object3D();
    top.name = 'anchor:top'; top.position.set(0, AV_H + 0.06 - AV_J.head[1], 0);
    bones.head.add(top);
    var pose = restAvatar({}), o2 = {}, seed = (rigSeq++ * 2654435761) >>> 0, phase = (seed % 997) / 997, wand = null, showK = 0, disposed = false;
    var _q = new T.Quaternion(), _e = new T.Euler(), _v = new T.Vector3();
    /* the Spark Stick exists from the start, hidden: the mount's compile pre-warms it, so the first
       Showtime or dance (setWand(true)) compiles nothing mid-transition */
    function addWand() {
      wand = makeWand(SL3D, hex, K.tier);
      wand.rotation.set(70 * DEG, 0, (pose.twirl || 0) * DEG);
      wand.userData.setShow(showK);
      wand.visible = false;
      hand.add(wand);
    }
    addWand();
    var unsub = typeof SL3D.onQuality === 'function' ? SL3D.onQuality(function (q) { if (meshes.outline && q && q.outlines === false) meshes.outline.visible = false; }) : null;
    function rot(b, x, y, z, order) { b.rotation.set(x * DEG, y * DEG, z * DEG, order || 'XYZ'); }
    function setPose(p) {
      if (disposed || !p) return av;
      if (p !== pose) for (var i = 0; i < AV_KEYS.length; i++) { var k = AV_KEYS[i]; pose[k] = typeof p[k] === 'number' ? p[k] : (AV_ONE[k] || 0); }
      p = pose;
      baseTransform(T, bones.base, p, AV_BODY_Y, _q, _e, _v);
      rot(bones.body, 0, p.hips, -p.lean, 'YXZ');
      rot(bones.head, p.headPitch, p.headYaw, p.headRoll, 'YXZ');
      rot(bones.armL, -p.armLf, 0, p.armL, 'ZXY');
      rot(bones.armR, -p.armRf, 0, -p.armR, 'ZXY');
      rot(bones.legL, -p.legL, 0, 0);
      rot(bones.legR, -p.legR, 0, 0);
      if (wand) wand.rotation.set(70 * DEG, 0, (p.twirl || 0) * DEG);    /* a baton twirl about the grip */
      return av;
    }
    var av = {
      root: group, bones: bones, sockets: { hand: hand }, anchors: { top: top }, pose: pose, meshes: meshes, color: hex, emoji: emoji, tier: K.tier,
      tris: data.tris, h: AV_H,
      setPose: setPose,
      /* the Spark Stick in the right hand (Showtime, dances) */
      setWand: function (on) {
        if (on && !wand && !disposed) addWand();
        if (wand) wand.visible = !!on;
        return av;
      },
      setShow: function (k) { showK = clamp01(num(k, 0)); if (wand) wand.userData.setShow(showK); return av; },
      play: function (clip, t, o) {
        if (disposed) return pose;
        for (var i = 0; i < OPT_KEYS.length; i++) { var k = OPT_KEYS[i]; o2[k] = o ? o[k] : undefined; }
        if (o2.seed == null) o2.seed = seed;
        o2.phase = phase;
        sampleAvatar(clip, t, pose, o2);
        return setPose(pose), pose;
      },
      info: function (clip) { var c = CLIP_INFO[clip]; return c ? { loop: c.loop, dur: durOf(clip, o2) } : null; },
      dispose: function () {
        if (disposed) return;
        disposed = true;
        if (unsub) unsub();
        if (wand) wand.userData.dispose();
        if (group.parent) group.parent.remove(group);
        sk.skeleton.dispose();
        group.clear();
      }
    };
    setPose(pose);
    return av;
  }

  /* ================================================================
     FAN BLOBS — hooded silhouettes for crowds. By day tonal streetwear, at night
     Crowd Shadow bodies (the Showtime mix crossfades them) lit by their own Spark
     Sticks. The geometry is white with a darker hood shade, so the body material
     (one cached variant per look) carries the colour; heroes add two eye dots.
     ================================================================ */
  function fanGeos(K, detail) {
    return K.parts.get('char:fan|' + detail, K.tier, function (Kt) {
      var G = Kt.G, by = { body: [], eyes: [] };
      fanParts(detail).forEach(function (d) { by[d.part].push(geoOf(Kt, d)); });
      return { body: mergeAll(G, by.body), eyes: by.eyes.length ? mergeAll(G, by.eyes) : null };
    });
  }
  function makeFanBlob(SL3D, seed, tier, o) {
    o = o || {};
    var K = SL3D.kit(tier), T = K.THREE, look = fanLook(seed), detail = o.detail === 'hero' ? 'hero' : 'crowd';
    var geos = fanGeos(K, detail), group = new T.Group();
    group.name = 'fan';
    var dayC = K.col(look.body), nightC = K.col(look.shadow);
    var bodyMat = K.variant('toon', 'fan:' + look.body + '|' + look.shadow, { color: dayC.clone() });
    var body = new T.Mesh(geos.body, bodyMat);
    body.name = 'body';
    group.add(body);
    var eyes = null;
    if (geos.eyes) { eyes = new T.Mesh(geos.eyes, K.mat('state')); eyes.name = 'eyes'; body.add(eyes); }
    var holder = new T.Group();                              /* the stick pivots at the paw */
    holder.position.set(0.11 * look.hand, 0.15, 0.06);
    var stickHex = look.wand === '@member' ? memberHex(K, o.member) : K.hex(look.wand);
    var wand = makeWand(SL3D, stickHex, tier, detail === 'hero' ? 'hero' : 'crowd');
    wand.scale.setScalar(detail === 'hero' ? 0.7 : 1);
    holder.add(wand);
    group.add(holder);
    group.scale.setScalar(look.scale);
    var m = {}, disposed = false;
    group.userData = {
      kind: 'fan', look: look, geos: { body: geos.body, wandHandle: wand.children[0].geometry, wandBulb: wand.children[1].geometry },
      colors: { body: K.hex('Cloud White'), day: K.hex(look.body), night: K.hex(look.shadow), wand: stickHex },
      /* t: the scene clock; o {bpm, excite 0..1, reduced} */
      update: function (t, opt) {
        fanMotion(t, look, opt, m);
        body.position.y = m.y; holder.position.y = 0.15 + m.y;
        body.scale.y = m.sy;
        group.rotation.z = m.roll * DEG;
        holder.rotation.z = -m.wand * DEG * look.hand;
        return m;
      },
      /* day streetwear → night silhouette (the cached look material is shared: one scene, one mix) */
      setShow: function (k) { k = clamp01(num(k, 0)); bodyMat.color.copy(dayC).lerp(nightC, k); wand.userData.setShow(k); },
      dispose: function () { if (disposed) return; disposed = true; wand.userData.dispose(); if (group.parent) group.parent.remove(group); group.clear(); }
    };
    return group;
  }

  /* ================================================================
     REGISTRATION
     ================================================================ */
  function noop() {}
  function noAct() { return null; }
  function models() {
    var out = {};
    function entry(build) { return { build: build, idle: noop, act: noAct, show: noop }; }
    PETS.forEach(function (id) {
      out[id] = entry(function (ctx) { return petTemplate(ctx, id, accState(ctx.st && ctx.st.acc)); });
    });
    ACC_IDS.forEach(function (id) {
      out[id] = entry(function (ctx) {
        var st = ctx.st || {}, L = root.SLIslandLook, rs = null;
        try { rs = L && typeof L.resolveStyle === 'function' ? L.resolveStyle(id, st) : null; } catch (e) { rs = null; }
        var pet = rs && PETS.indexOf(rs.pet) >= 0 ? rs.pet : PETS.indexOf(st.pet) >= 0 ? st.pet : 'pet_puppy';
        return petTemplate(ctx, pet, accState(rs ? rs.acc : st.acc, id));
      });
    });
    return out;
  }
  var POSE_API = null;
  function register(SL3D) {
    if (!SL3D || typeof SL3D.defineApi !== 'function' || SL3D.__slCharacters) return false;
    SL3D.__slCharacters = true;
    SL3D.defineModels('characters', function () { return models(); });
    SL3D.defineApi('makeRig', function (K, S) { return function (petId, acc, tier) { return makeRig(S, petId, acc, tier); }; });
    SL3D.defineApi('makeAvatar', function (K, S) { return function (o, tier) { return makeAvatar(S, o, tier); }; });
    SL3D.defineApi('makeWand', function (K, S) { return function (hex, tier) { return makeWand(S, hex, tier); }; });
    SL3D.defineApi('makeFanBlob', function (K, S) { return function (seed, tier, o) { return makeFanBlob(S, seed, tier, o); }; });
    SL3D.defineApi('petPose', function () { return POSE_API; });
    return true;
  }

  POSE_API = {
    PETS: PETS, ACC_SOCKET: ACC_SOCKET, STREETWEAR: STREETWEAR, SLOTS: SLOTS, SOCKETS: SOCKETS, BONES: BONES, BONE_PARENT: BONE_PARENT,
    SOCKET_BONE: SOCKET_BONE, BODY_Y: BODY_Y, BUDGET: BUDGET, SPECIES: SPECIES, CAPE: CAPE, KICK_STRIKE: KICK_STRIKE, DANCE_BPM: DANCE_BPM,
    DANCE_MOVES: DANCE_MOVES, DANCE_PLAN: DANCE_PLAN, POSE_KEYS: POSE_KEYS, CLIP_NAMES: CLIP_NAMES, CONTRACT_CLIPS: CONTRACT_CLIPS,
    CLIP_INFO: CLIP_INFO, AV_KEYS: AV_KEYS, AV_CLIPS: AV_CLIPS, TOP_Y: TOP_Y, EYE_OPEN: EYE_OPEN, IDLE_SQUASH: IDLE_SQUASH,
    OUTLINE_CHAR: OUTLINE_CHAR, OUTLINE_TOKEN: OUTLINE_TOKEN, WAND: WAND, VISOR_SCAN_HZ: VISOR_SCAN_HZ, RING_PULSE: RING_PULSE,
    AV_SHIFT_SEC: AV_SHIFT_SEC, TWIRL: TWIRL, AV_H: AV_H, FAN_DAY: FAN_DAY, FAN_NIGHT: FAN_NIGHT, FAN_WAND: FAN_WAND,
    jointsOf: jointsOf, socketsOf: socketsOf, restPose: restPose, mixPose: mixPose, sample: sampleClip, sampleClip: sampleClip,
    durOf: durOf, blinkAt: blinkAt, crownGlint: crownGlint, restAvatar: restAvatar, sampleAvatar: sampleAvatar, squishAt: squishAt,
    accState: accState, accKey: accKey, capeDeform: capeDeform, dizzyStar: dizzyStar, fanLook: fanLook, fanMotion: fanMotion,
    visorScan: visorScan, ringPulse: ringPulse, twirlAt: twirlAt, starOutline: starOutline,
    skinMerge: skinMerge, hash: hash, petTokens: petTokens,
    petParts: petParts, accParts: accParts, avatarParts: avatarParts, wandParts: wandParts, fanParts: fanParts,
    primTris: primTris, petTris: petTris, accTris: accTris, avatarTris: avatarTris, wandTris: wandTris
  };
  var api = {};
  Object.keys(POSE_API).forEach(function (k) { api[k] = POSE_API[k]; });
  api.register = register;
  /* browser-only builders (they need a kit K / SL3D; exported for the lab and tests with a THREE) */
  api.build = { assemblePet: assemblePet, rigData: rigData, makeRig: makeRig, petTemplate: petTemplate, makeAvatar: makeAvatar,
                makeWand: makeWand, makeFanBlob: makeFanBlob, models: models, geoOf: geoOf };
  return api;
}));
