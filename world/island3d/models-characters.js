/* ================================================================
   My Island 3D — characters (island chunk 8; classic script).
   Pet rigs, the 6 accessories, the 'you' avatar, the Island Wand and
   the crowd fan blobs. THREE only ever comes from the kit (K.THREE);
   everything is built from K.G primitives and K materials.
   window.SLCharacters in the browser (registers itself on SL3D when the
   stage is present); module.exports in Node (the pure pose/clip maths).

   SL3D APIs (SL3D.defineApi):
     makeRig(petId, acc, tier) → PetRig
       {root, bones, sockets, anchors, pose, petId, acc, tier, meshes,
        setPose(pose), setShow(k), play(clip, t, opts) → pose, info(clip) → {loop, dur},
        dispose()}
       bones   body head neck tail earL earR legFL legFR legBL legBR wingL wingR
               (+ base tailTip eyes lens glint spark scarfTail)
       sockets hat neck face back seat (Object3Ds that follow their bone)
       anchors top, dizzy (centre of the dizzy-star ring), emote
       Rigid skinning: one SkinnedMesh per material, every vertex 100 % on one
       bone. Draw calls: toon + (shine | pearl) + gold ≤ 3, plus the ink hull
       on MID/HIGH (and the kitten's whisker LineSegments).
     makeAvatar({color, emoji}, tier) → AvatarRig {root, bones, sockets{hand}, anchors,
       pose, setPose, setShow, setWand(on), play(clip, t, opts), dispose()}
     makeWand(colorHex, tier) → Group (userData {setShow(k), dispose()})
     makeFanBlob(seed, tier, {detail: 'crowd'|'hero'}) → Group
       (userData {look, geos, update(t, o), setShow(k), dispose()})
     petPose → the pose schema shared with actors.js (= the pure API below)
   SL3D.defineModels('characters') registers pet_* and acc_* so
   SL3D.make('pet_kitten') / make('acc_crown', {pet, acc}) build a static
   template for photocards (accessories preview on the pet, as in 2D).

   POSE (a flat object of numbers; restPose() fills it, every clip writes it)
     x y z            root offset (u)            yaw pitch roll  whole body (deg, about the body
     sx sy sz         squash about the feet                       centre; pitch + = nose down)
     hips             body yaw (deg)             neck            neck pitch (deg)
     headPitch headYaw headRoll (deg)            earL earR       flop outward (deg) · earBack
     tailYaw tailPitch tailCurl (deg)            legFL legFR legBL legBR  swing (deg, + = forward)
     legFLz legFRz    front paws raised sideways wingL wingR     flap (deg, + = up)
     eye              openness 0..1              spark sparkSpin dizzy stars (0..1, deg)
     glint            crown sparkle 0..1         cape wave       cape flap 0..1, cloth clock (s)
     scarf            scarf tail swing (deg)     faceCam         0..1 hint: turn the root to the camera
   CLIPS (pure functions of time; opts {species, speed, intensity, reduced, seed, rate, bpm,
     steer, height, dur, left, ground}): idle walk run hop jump fall slide tumble dizzy
     dance cheer sad sit kick drive. speed = how fast the pet travels (u/s): it sets the
     walk/run cadence and lets the cape stream in any clip; rate = playback speed of the
     non-gait clips; intensity scales amplitudes. One-shots (hop jump tumble kick) hold
     their end pose. Every clip has a reduced-motion variant (opts.reduced).
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
  var ACC_SOCKET = { acc_partyhat: 'hat', acc_crown: 'hat', acc_bow: 'neck', acc_scarf: 'neck', acc_shades: 'face', acc_cape: 'back' };
  var ACC_IDS = Object.keys(ACC_SOCKET);
  var SLOTS = ['hat', 'neck', 'face', 'back'];
  var SOCKETS = ['hat', 'neck', 'face', 'back', 'seat'];
  var BUDGET = { pet: 1800, acc: 300, avatar: 1500, wand: 300, fan: 50 };
  var OUTLINE_CHAR = 0.012;

  /* skeleton: the contract's bones plus helpers (base = the whole-body pose) */
  var BONES = ['base', 'body', 'neck', 'head', 'eyes', 'earL', 'earR', 'tail', 'tailTip',
               'legFL', 'legFR', 'legBL', 'legBR', 'wingL', 'wingR', 'lens', 'glint', 'spark', 'scarfTail'];
  var BONE_PARENT = { base: null, body: 'base', neck: 'body', head: 'neck', eyes: 'head', earL: 'head', earR: 'head',
                      tail: 'body', tailTip: 'tail', legFL: 'body', legFR: 'body', legBL: 'body', legBR: 'body',
                      wingL: 'body', wingR: 'body', lens: 'head', glint: 'head', spark: 'head', scarfTail: 'neck' };
  var SOCKET_BONE = { hat: 'head', face: 'head', neck: 'neck', back: 'body', seat: 'body' };

  /* rest joints in ITEM space (feet at y 0, facing +z, the pet's left is +x) */
  var BODY_Y = 0.22;                       /* body centre: the pivot for flips, rolls and spins */
  function jointsOf(petId) {
    var J = {
      base: [0, 0, 0], body: [0, BODY_Y, 0], neck: [0, 0.3, 0.12], head: [0, 0.38, 0.17], eyes: [0, 0.4, 0.318],
      earL: [0.11, 0.48, 0.16], earR: [-0.11, 0.48, 0.16], tail: [0, 0.27, -0.2], tailTip: [0, 0.36, -0.27],
      legFL: [0.085, 0.13, 0.1], legFR: [-0.085, 0.13, 0.1], legBL: [0.085, 0.13, -0.1], legBR: [-0.085, 0.13, -0.1],
      wingL: [0.1, 0.34, 0.0], wingR: [-0.1, 0.34, 0.0],
      lens: [0, 0.405, 0.344], glint: [0.035, 0.579, 0.245], spark: [0, 0.66, 0.17], scarfTail: [0.06, 0.23, 0.25]
    };
    if (petId === 'pet_puppy') { J.earL = [0.13, 0.48, 0.15]; J.earR = [-0.13, 0.48, 0.15]; }
    if (petId === 'pet_kitten') { J.earL = [0.095, 0.5, 0.15]; J.earR = [-0.095, 0.5, 0.15]; }
    if (petId === 'pet_bunny') { J.earL = [0.055, 0.52, 0.15]; J.earR = [-0.055, 0.52, 0.15]; J.tailTip = [0, 0.27, -0.24]; }
    if (petId === 'pet_dragon') { J.earL = [0.13, 0.44, 0.13]; J.earR = [-0.13, 0.44, 0.13]; J.tail = [0, 0.24, -0.2]; J.tailTip = [0, 0.19, -0.37]; }
    return J;
  }
  /* sockets in item space: hat on the crown of the head (between the bunny's ears),
     face over the eyes, neck at the collar, back on top of the body, seat under the rump */
  function socketsOf(petId) {
    return { hat: [0, 0.535, 0.16], face: [0, 0.405, 0.344], neck: [0, 0.24, 0.17], back: [0, 0.36, 0.0], seat: [0, 0.09, -0.08] };
  }

  /* species motion character */
  var SPECIES = {
    pet_puppy:  { gait: 'trot',    tailHz: 1.5, happyHz: 4,   tailAmp: 26, hover: 0 },
    pet_kitten: { gait: 'trot',    tailHz: 0.45, happyHz: 1.6, tailAmp: 18, hover: 0 },
    pet_bunny:  { gait: 'hop',     tailHz: 0.7, happyHz: 2.5, tailAmp: 8,  hover: 0 },
    pet_dragon: { gait: 'flutter', tailHz: 0.6, happyHz: 1.8, tailAmp: 16, hover: 0.12, wingHz: 3 }
  };

  /* ---------------- the pose ---------------- */
  var POSE_KEYS = ['x', 'y', 'z', 'yaw', 'pitch', 'roll', 'sx', 'sy', 'sz', 'hips', 'neck',
    'headPitch', 'headYaw', 'headRoll', 'earL', 'earR', 'earBack', 'tailYaw', 'tailPitch', 'tailCurl',
    'legFL', 'legFR', 'legBL', 'legBR', 'legFLz', 'legFRz', 'wingL', 'wingR',
    'eye', 'spark', 'sparkSpin', 'glint', 'cape', 'wave', 'scarf', 'faceCam'];
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

  /* ---------------- the clips ---------------- */
  var CLIPS = {};
  var CLIP_INFO = {
    idle: { loop: true, dur: 0, rate: true }, walk: { loop: true, dur: 0 }, run: { loop: true, dur: 0 },
    hop: { loop: false, dur: 0.45, rate: true }, jump: { loop: false, dur: 0.6, rate: true },
    fall: { loop: true, dur: 0, rate: true }, slide: { loop: true, dur: 0 },
    tumble: { loop: false, dur: 0.85, rate: true }, dizzy: { loop: true, dur: 0, rate: true },
    dance: { loop: true, dur: 8 * 60 / 118, rate: true }, cheer: { loop: true, dur: 0.6, rate: true },
    sad: { loop: true, dur: 0, rate: true }, sit: { loop: true, dur: 0, rate: true },
    kick: { loop: false, dur: 0.75, rate: true }, drive: { loop: true, dur: 0 }
  };
  var CLIP_NAMES = Object.keys(CLIP_INFO);
  var KICK_STRIKE = 0.32;                /* the paw meets the ball here (s into 'kick') */
  var DANCE_BPM = 118;

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
    out.sy = 1 + 0.015 * b; out.sx = out.sz = 1 - 0.007 * b;
    out.headYaw = 9 * Math.sin(TAU * t / 7.2); out.headPitch = 3 * Math.sin(TAU * t / 5.1);
    var tw = eventSince(t, seedOf(o.seed) ^ 0x2545f491, 4, 8);           /* an ear twitch every 4–8 s */
    var flick = tw.since >= 0 && tw.since < 0.3 ? 14 * Math.sin(PI * tw.since / 0.3) : 0;
    if (tw.n & 1) out.earL += flick; else out.earR += flick;
    if (sp === SPECIES.pet_bunny) {                                       /* one ear flops now and then */
      var fl = eventSince(t, seedOf(o.seed) ^ 0x68e31da4, 5, 9), d = fl.since;
      if (d >= 0 && d < 1.4) out.earR += 48 * smooth(0, 0.18, d) * (1 - smooth(1.1, 1.4, d));
    }
    return out;
  };

  /* walking gaits: trot (diagonal pairs), bunny hops (0.18 u), dragon flutter (0.12 u up, wings 3 Hz) */
  function gait(t, out, o, sp, run) {
    var red = !!o.reduced, I = num(o.intensity, 1);
    var v = Math.max(0, num(o.speed, run ? 3 : 0.9));
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
      out.sy = 1 - 0.1 * land; out.sx = out.sz = 1 + 0.05 * land;
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
    var f = run ? clamp(v / 0.75, 2.2, 4.5) : clamp(v / 0.32, 1.2, 4), ph = TAU * f * t, s = Math.sin(ph);
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

  /* the happy hop on tap (matches SLMotion 'hop': 0.18 u in 0.45 s) */
  CLIPS.hop = function (t, out, o, sp) {
    tailMotion(t, out, sp, true, !!o.reduced);
    if (sp === SPECIES.pet_dragon) wingsFlap(out, t, 3, o.reduced ? 0 : 30, 20);
    if (o.reduced || t <= 0 || t >= 0.45) return out;
    var u = t / 0.45;
    out.y = 0.18 * num(o.intensity, 1) * arc(u);
    out.sy = 1 + 0.08 * Math.sin(PI * u); out.sx = out.sz = 1 - 0.04 * Math.sin(PI * u);
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
      out.sy = 1 - 0.12 * c; out.sx = out.sz = 1 + 0.05 * c;
      out.legFL = out.legFR = 10 * c; out.legBL = out.legBR = -12 * c;
    } else if (t < 0.2) {
      var s = (t - 0.07) / 0.13;
      out.sy = 1.1 - 0.1 * s; out.sx = out.sz = 0.96 + 0.04 * s;
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

  /* the group pose that ends every dance (and the whole dance under reduced motion) */
  function groupPose(out, sp) {
    out.legFR = 125; out.legFRz = 22; out.headRoll = 12; out.headPitch = -4; out.eye = 0.85; out.faceCam = 1;
    rearUp(out, 25);
    out.tailYaw = 0; out.tailPitch = 25;
    if (sp === SPECIES.pet_dragon) { out.wingL = out.wingR = 40; }
    return out;
  }
  /* an ORIGINAL generic 8-count (118 BPM): side-steps, two hops, a species move,
     face the camera, group pose */
  CLIPS.dance = function (t, out, o, sp) {
    if (o.reduced) return groupPose(out, sp);
    var beat = 60 / num(o.bpm, DANCE_BPM), b = t / beat, cyc = ((b % 8) + 8) % 8, c = Math.floor(cyc), f = cyc - c;
    /* tail and wings locked to the beat so the 8-count loops seamlessly */
    tailMotion(t, out, sp, true, false, Math.max(1, Math.round(sp.happyHz * beat)) / beat);
    if (sp === SPECIES.pet_dragon) wingsFlap(out, t, 1 / beat, 12, 18);
    if (c < 2) {                                             /* 1–2: side-step left, right, with a 10° lean */
      var s = Math.sin(PI * cyc);
      out.x = 0.08 * s; out.roll = -10 * s;
      out.legFLz = 15 * Math.max(0, s); out.legFRz = 15 * Math.max(0, -s);
      out.headRoll = 6 * s;
    } else if (c < 4) {                                      /* 3–4: two hops */
      out.y = 0.12 * arc(f); out.sy = 1 + 0.06 * Math.sin(PI * f); legsTuck(out, Math.sin(PI * f));
    } else if (c < 6) {                                      /* 5–6: the signature move */
      var u = (cyc - 4) / 2;
      if (sp === SPECIES.pet_puppy) {                        /* tail-wag shuffle: hip wiggle + paw wave */
        out.hips = 14 * Math.sin(TAU * 2 * u); out.x = 0.03 * Math.sin(TAU * 2 * u);
        out.legFR = 110 + 20 * Math.sin(TAU * 4 * u); out.legFRz = 10; rearUp(out, 15);
      } else if (sp === SPECIES.pet_kitten) {                /* paw point: up-left, then up-right */
        var k1 = smooth(0, 0.25, f) * (1 - smooth(0.85, 1, f));
        rearUp(out, 22 * k1);
        if (c === 4) { out.legFL = 140 * k1; out.legFLz = 25 * k1; out.headYaw = 20 * k1; out.headRoll = -10 * k1; }
        else { out.legFR = 140 * k1; out.legFRz = 25 * k1; out.headYaw = -20 * k1; out.headRoll = 10 * k1; }
      } else if (sp === SPECIES.pet_bunny) {                 /* hop-spin */
        out.y = 0.18 * arc(u); out.yaw = 360 * inOut(u); legsTuck(out, Math.sin(PI * u));
      } else {                                               /* dragon wing twirl with a sparkle puff */
        out.y = 0.2 * Math.sin(PI * u); out.yaw = 360 * inOut(u);
        wingsFlap(out, t, 2 / beat, 40, 20);
        out.glint = smooth(0.7, 1, u);
      }
    } else if (c === 6) {                                    /* 7: everyone faces the camera */
      out.faceCam = 1; out.y = 0.03 * arc(f); out.headPitch = -5;
    } else {                                                 /* 8: group pose */
      groupPose(out, sp);
      if (f < 0.2) out.y += 0.04 * arc(f / 0.2);
    }
    return out;
  };

  /* cheering: bouncing with both front paws up */
  CLIPS.cheer = function (t, out, o, sp) {
    var red = !!o.reduced, u = frac(t / 0.6);
    pawsUp(out, 120, 20);
    rearUp(out, 30);
    out.earL = out.earR = -10; out.eye = 0.85;
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
    if (!o.reduced) { var b = Math.sin(TAU * 0.5 * t); out.sy = 1 + 0.012 * b; }
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

  /* ---------------- the cape: CPU cloth ----------------
     The cape rests on the pet's back, its top edge across the shoulders at
     (y CAPE.y, z CAPE.z), the hem CAPE.len behind. k (0..1, from speed) lifts it
     about the top edge and adds a travelling wave that grows toward the hem; at
     k = 0 it lies flat, exactly at rest. */
  var CAPE = { w: 0.3, len: 0.28, y: 0.372, z: 0.0 };
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

  /* ---------------- crowd fans ---------------- */
  var FAN_BODY = ['Holo Pink', 'Holo Blue', 'Holo Mint', 'Holo Lemon', 'Bubblegum'];       /* CHARACTERS.fanBlob a–e */
  var FAN_WAND = ['Bubblegum', 'Splash Blue', 'Star Gold', 'Leaf Mint', 'Grape'];
  function fanLook(seed) {
    var s = seedOf(seed);
    return {
      body: FAN_BODY[Math.min(4, Math.floor(mix01(s, 1) * 5))], wand: FAN_WAND[Math.min(4, Math.floor(mix01(s, 2) * 5))],
      scale: 0.92 + 0.16 * mix01(s, 3), phase: mix01(s, 4), lean: (mix01(s, 5) - 0.5) * 10, hand: mix01(s, 6) < 0.5 ? 1 : -1
    };
  }
  /* bob on the beat (≤ 118 BPM, under 2 Hz), jump with excitement (0..1), sway the wand */
  function fanMotion(t, look, o, out) {
    o = o || NOOPT; out = out || {};
    look = look || { phase: 0, lean: 0 };
    out.roll = look.lean;
    if (o.reduced) { out.y = 0; out.sy = 1; out.wand = 0; return out; }
    var bpm = num(o.bpm, DANCE_BPM), b = frac(t * bpm / 60 + look.phase * 0.25), ex = clamp01(num(o.excite, 0));
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
                 'armL', 'armR', 'armLf', 'armRf', 'faceCam', 'wand'];
  var AV_ONE = { sx: 1, sy: 1, sz: 1 };
  var AV_BODY_Y = 0.33;
  function restAvatar(out) {
    out = out || {};
    for (var i = 0; i < AV_KEYS.length; i++) out[AV_KEYS[i]] = AV_ONE[AV_KEYS[i]] || 0;
    return out;
  }
  var AV = {};
  AV.idle = function (t, out, o) {
    if (o.reduced) return out;
    out.y = 0.02 * Math.sin(TAU * (0.5 * t + num(o.phase, 0)));             /* 0.02 u at 0.5 Hz */
    var g = eventSince(t, seedOf(o.seed) ^ 0x1b873593, 5, 7), d = g.since;   /* a glance every ~6 s */
    if (d >= 0 && d < 1.6) out.headYaw = (g.n & 1 ? 22 : -22) * smooth(0, 0.3, d) * (1 - smooth(1.3, 1.6, d));
    out.armL = out.armR = 6 + 3 * Math.sin(TAU * 0.5 * t);
    return out;
  };
  function avGait(t, out, o, run) {
    var v = Math.max(0, num(o.speed, run ? 3 : 0.9)), f = run ? clamp(v / 0.8, 2, 4) : clamp(v / 0.35, 1.2, 3);
    var s = Math.sin(TAU * f * t), a = o.reduced ? 10 : run ? 50 : 25;
    out.armLf = a * s; out.armRf = -a * s; out.armL = out.armR = 8;
    if (!o.reduced) { out.y = (run ? 0.03 : 0.015) * Math.abs(s); out.roll = 3 * s; out.pitch = run ? 8 : 2; }
    return out;
  }
  AV.walk = function (t, out, o) { return avGait(t, out, o, false); };
  AV.run = function (t, out, o) { return avGait(t, out, o, true); };
  AV.hop = function (t, out, o) {
    if (o.reduced || t <= 0 || t >= 0.45) return out;
    var u = t / 0.45;
    out.y = 0.18 * arc(u); out.sy = 1 + 0.08 * Math.sin(PI * u); out.armL = out.armR = 40 * Math.sin(PI * u);
    return out;
  };
  AV.jump = function (t, out, o) {
    var dur = num(o.dur, 0.6);
    if (num(o.height, 0) > 0 && t < dur) out.y = o.height * arc(t / dur);
    out.armL = out.armR = o.reduced ? 120 : 150 * smooth(0, 0.15, t);
    return out;
  };
  AV.fall = function (t, out) { out.armL = out.armR = 120; out.headPitch = -8; return out; };
  AV.slide = function (t, out) { out.sy = 0.8; out.pitch = 25; out.armLf = out.armRf = 80; return out; };
  AV.tumble = function (t, out, o) {
    if (o.reduced) { out.sy = 1 - 0.1 * Math.sin(PI * clamp01(t / 0.25)); return out; }
    if (t < 0.6) { var s = t / 0.6; out.pitch = -360 * inOut(s); out.y = num(o.height, 0.3) * arc(s); }
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
  function avHeart(out) { out.armL = out.armR = 150; out.armLf = out.armRf = 20; out.headRoll = 10; out.faceCam = 1; return out; }
  AV.dance = function (t, out, o) {
    if (o.reduced) return avHeart(out);
    var beat = 60 / num(o.bpm, DANCE_BPM), cyc = (((t / beat) % 8) + 8) % 8, c = Math.floor(cyc), f = cyc - c;
    if (c < 2) { var s = Math.sin(PI * cyc); out.x = 0.08 * s; out.roll = -10 * s; out.armL = 40 + 30 * Math.max(0, s); out.armR = 40 + 30 * Math.max(0, -s); }
    else if (c < 4) { out.y = 0.12 * arc(f); out.armL = out.armR = 150 * Math.sin(PI * f); }
    else if (c < 6) { out.armR = 150 + 25 * Math.sin(TAU * (cyc - 4)); out.armL = 20; out.wand = 1; out.headRoll = 8 * Math.sin(TAU * (cyc - 4)); }
    else if (c === 6) { out.faceCam = 1; out.y = 0.03 * arc(f); }
    else avHeart(out);
    return out;
  };
  AV.sad = function (t, out) { out.headPitch = 20; out.armLf = out.armRf = 10; out.y = -0.01; return out; };
  AV.sit = function (t, out) { out.y = -0.06; out.sy = 0.88; out.armLf = out.armRf = 25; return out; };
  AV.kick = function (t, out, o) { return AV.cheer(t, out, o); };
  AV.drive = function (t, out, o) {
    var s = clamp(num(o.steer, 0), -1, 1);
    out.armLf = 60 + 10 * s; out.armRf = 60 - 10 * s; out.roll = -6 * s; out.headYaw = 15 * s;
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
     BROWSER BUILDERS — THREE is used only inside these functions (K.THREE)
     ================================================================ */
  var CONE_PROFILE = [[0, 0], [1, 0], [0.83, 0.17], [0.66, 0.34], [0.5, 0.5], [0.33, 0.67], [0.16, 0.84], [0, 1]];

  function lookOf(id) { var L = root.SLIslandLook; return (L && L.LOOK && L.LOOK[id]) || null; }
  function tokOf(id, part, dflt) { var lk = lookOf(id); return (lk && lk.colors && lk.colors[part]) || dflt; }
  function normHex(h) {
    if (typeof h !== 'string') return null;
    var m = /^#?([0-9a-f]{6})$/i.exec(h.trim());
    if (m) return '#' + m[1].toUpperCase();
    m = /^#?([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(h.trim());
    return m ? ('#' + m[1] + m[1] + m[2] + m[2] + m[3] + m[3]).toUpperCase() : null;
  }
  /* LOCKED PETCOL tokens (world-look names them; the fallbacks are the same paths) */
  function petTokens(petId) {
    var b = 'PETCOL.' + petId + '.';
    var T = {
      body: tokOf(petId, 'body', b + 'body'), dark: tokOf(petId, 'dark', b + 'dark'), light: tokOf(petId, 'light', b + 'light'),
      nose: tokOf(petId, 'nose', b + 'nose'), eye: tokOf(petId, 'eye', 'Ink'), glint: tokOf(petId, 'glint', 'Cloud White'),
      blush: tokOf(petId, 'blush', 'Blush'), mouth: tokOf(petId, 'mouth', 'Ink')
    };
    T.ear = tokOf(petId, 'ear', petId === 'pet_puppy' ? T.dark : T.body);
    T.inner = tokOf(petId, 'inner', petId === 'pet_bunny' ? 'Bunny Ear' : T.light);
    T.tail = tokOf(petId, 'tail', petId === 'pet_bunny' ? 'Cloud White' : T.dark);
    T.whisker = tokOf(petId, 'whisker', 'Ink');
    T.spines = tokOf(petId, 'spines', T.dark); T.horns = tokOf(petId, 'horns', 'Star Gold'); T.wings = tokOf(petId, 'wings', T.light);
    return T;
  }

  /* ---------------- geometry helpers (all on K.G output) ---------------- */
  function mergeAll(G, list) { var m = G.merge(list); list.forEach(function (g) { g.dispose(); }); return m; }
  /* a flat disc facing +z (a squat tube) */
  function disc(G, r, thick, radial) { return G.t(G.tube(r, thick, { radial: radial || 10 }), { r: [90, 0, 0] }); }
  /* a ✦ sparkle in the XY plane: 4 thin cones from the centre */
  function sparkle(G, len, w) {
    var arms = [];
    for (var i = 0; i < 4; i++) arms.push(G.t(G.t(G.cone(w, len, 4), { p: [0, len / 2, 0] }), { r: [0, 0, i * 90] }));
    return G.t(mergeAll(G, arms), { s: [1, 1, 0.5] });
  }
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
  /* keep only the first n triangles (or those passing keep(centroid)) of a normalised geometry */
  function trimTris(K, geo, n, keep) {
    var T = K.THREE, P = geo.getAttribute('position').array, N = geo.getAttribute('normal').array, C = geo.getAttribute('color').array;
    var tri = P.length / 9, idx = [];
    for (var i = 0; i < tri; i++) {
      if (n != null && idx.length >= n) break;
      if (keep && !keep((P[i * 9] + P[i * 9 + 3] + P[i * 9 + 6]) / 3, (P[i * 9 + 1] + P[i * 9 + 4] + P[i * 9 + 7]) / 3, (P[i * 9 + 2] + P[i * 9 + 5] + P[i * 9 + 8]) / 3)) continue;
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
  function add3(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }

  /* ================================================================
     PET ASSEMBLY — every part in the rest pose, ITEM space, tagged with
     its bone and material. mode.rig adds the rig-only parts (dizzy stars,
     crown glint, the pearl lens copy, whisker lines); the template path gets
     thin whisker tubes instead and skips the hidden helpers.
     → {parts: [{geo, bone, mat: 'toon'|'shine'|'gold'|'pearl', cloth?}], whiskers, J, S}
     ================================================================ */
  function assemblePet(K, petId, acc, mode) {
    var G = K.G, Tk = petTokens(petId), J = jointsOf(petId), S = socketsOf(petId), parts = [];
    var rig = !!(mode && mode.rig), shades = acc.face === 'acc_shades';
    function put(geo, bone, mat, extra) { var p = { geo: geo, bone: bone, mat: mat || 'toon' }; if (extra) for (var k in extra) p[k] = extra[k]; parts.push(p); return geo; }
    function col(geo, token, tn) { return G.paint(geo, token, tn); }
    var blushC = K.col(Tk.body).lerp(K.col(Tk.blush), 0.6);

    /* body: a horizontal bean with a light belly */
    var body = G.t(G.t(G.bean(0.17, 0.18), { r: [90, 0, 0] }), { s: [0.9, 0.78, 0.8], p: [0, BODY_Y, -0.01] });
    G.paintBy(body, function (v) { return v.y < BODY_Y - 0.06 && v.ny < -0.35 ? Tk.light : Tk.body; });
    put(body, 'body');

    /* head (~45 % of the height), muzzle, nose, smile, blush */
    put(col(G.t(G.puff(0.17, { sphere: true }), { p: J.head }), Tk.body), 'head');
    put(col(G.t(G.puff(0.075), { s: [1.25, 0.8, 0.85], p: [0, 0.33, 0.29] }), Tk.light), 'head');
    if (petId === 'pet_dragon') {
      [-1, 1].forEach(function (sx) { put(col(G.t(disc(G, 0.009, 0.006, 6), { p: [0.025 * sx, 0.356, 0.356] }), Tk.nose), 'head'); });
    } else {
      var ns = petId === 'pet_kitten' ? 0.85 : 1;
      put(col(G.t(G.puff(0.022), { s: [1.3 * ns, ns, 0.9 * ns], p: [0, 0.36, 0.352] }), Tk.nose), 'head');
    }
    put(col(G.ribbon([[-0.022, 0.318, 0.35], [0, 0.306, 0.357], [0.022, 0.318, 0.35]], 0.009, { segments: 6 }), Tk.mouth), 'head');
    [-1, 1].forEach(function (sx) {
      put(G.paint(G.t(disc(G, 0.026, 0.004, 10), { r: [0, 40 * sx, 0], p: [0.113 * sx, 0.35, 0.293] }), blushC), 'head');
    });

    /* big glossy eyes on the 'eyes' bone (blinks scale it); the highlight is unlit.
       Shades cover the eyes, so a pet wearing them has no highlight mesh at all. */
    [-1, 1].forEach(function (sx) {
      put(col(G.t(G.puff(0.032), { s: [0.9, 1.15, 0.55], r: [0, 22 * sx, 0], p: [0.068 * sx, 0.4, 0.318] }), Tk.eye), 'eyes');
      if (!shades) put(col(G.t(disc(G, 0.011, 0.004, 8), { r: [0, 22 * sx, 0], p: [0.068 * sx - 0.01, 0.412, 0.338] }), Tk.glint), 'eyes', 'shine');
    });

    /* legs: stubby ovoids with light paws (back legs in the dark tone, like the 2D art) */
    ['legFL', 'legFR', 'legBL', 'legBR'].forEach(function (n) {
      var j = J[n], back = n.charAt(3) === 'B';
      var main = back && petId !== 'pet_bunny' ? Tk.dark : Tk.body, paw = petId === 'pet_dragon' ? main : Tk.light;
      var g = G.t(G.puff(0.048), { s: [1, 1.55, 1], p: [j[0], 0.074, j[2]] });
      put(G.paintBy(g, function (v) { return v.y < 0.028 ? paw : main; }), n);
    });

    /* species ears */
    [['earL', 1], ['earR', -1]].forEach(function (e) {
      var n = e[0], sx = e[1], j = J[n];
      if (petId === 'pet_puppy') {
        put(col(G.t(G.puff(0.075), { s: [0.42, 1.3, 0.85], r: [0, 0, 18 * sx], p: add3(j, [0.045 * sx, -0.075, 0]) }), Tk.ear), n);
      } else if (petId === 'pet_kitten') {
        put(col(G.t(G.cone(0.058, 0.11, 8), { s: [1, 1, 0.55], r: [0, 0, -15 * sx], p: add3(j, [0, 0.035, 0]) }), Tk.body), n);
        put(col(G.t(G.cone(0.034, 0.068, 8), { s: [1, 1, 0.4], r: [0, 0, -15 * sx], p: add3(j, [0.002 * sx, 0.028, 0.02]) }), Tk.inner), n);
      } else if (petId === 'pet_bunny') {
        put(col(G.t(G.puff(0.05), { s: [0.85, 3.0, 0.5], r: [0, 0, -8 * sx], p: add3(j, [0.012 * sx, 0.14, -0.01]) }), Tk.body), n);
        put(col(G.t(G.puff(0.05), { s: [0.42, 2.3, 0.28], r: [0, 0, -8 * sx], p: add3(j, [0.012 * sx, 0.14, 0.013]) }), Tk.inner), n);
      } else {
        put(col(G.t(G.cone(0.04, 0.085, 6), { s: [1, 1, 0.4], r: [0, 0, -55 * sx], p: add3(j, [0.02 * sx, 0.02, 0]) }), Tk.dark), n);
      }
    });

    /* tails */
    var tj = J.tail;
    function rib(base, pts, r, seg) { return G.ribbon(pts.map(function (p) { return add3(base, p); }), r, { segments: seg }); }
    if (petId === 'pet_puppy') {
      put(col(rib(tj, [[0, 0, 0], [0, 0.05, -0.05], [0, 0.11, -0.065], [0, 0.16, -0.04]], 0.026, 8), Tk.tail), 'tail');
      put(col(G.t(G.puff(0.026), { p: add3(tj, [0, 0.16, -0.04]) }), Tk.tail), 'tail');
    } else if (petId === 'pet_kitten') {
      put(col(rib(tj, [[0, 0, 0], [0.02, 0.045, -0.05], [0, 0.09, -0.07]], 0.024, 6), Tk.tail), 'tail');
      put(col(rib(J.tailTip, [[0, 0, 0], [-0.025, 0.05, -0.01], [0, 0.09, 0.02]], 0.024, 6), Tk.tail), 'tailTip');
      put(col(G.t(G.puff(0.025), { p: add3(J.tailTip, [0, 0.09, 0.02]) }), Tk.light), 'tailTip');
    } else if (petId === 'pet_bunny') {
      put(col(G.t(G.puff(0.055), { p: add3(tj, [0, 0, -0.035]) }), Tk.tail), 'tail');
    } else {
      put(col(G.t(G.cone(0.06, 0.19, 10), { r: [-100, 0, 0], p: add3(tj, [0, -0.02, -0.085]) }), Tk.body), 'tail');
      put(col(G.t(G.cone(0.045, 0.07, 6), { s: [1, 1, 0.35], r: [-100, 0, 0], p: [0, 0.2, -0.375] }), Tk.dark), 'tailTip');
    }

    /* dragon: soft wings, rounded spines, gold horn nubs */
    if (petId === 'pet_dragon') {
      [['wingL', 1], ['wingR', -1]].forEach(function (w) {
        var j = J[w[0]], sx = w[1];
        put(col(G.t(G.puff(0.085), { s: [0.22, 0.95, 1.35], r: [10, 0, -35 * sx], p: add3(j, [0.07 * sx, 0.07, -0.03]) }), Tk.wings), w[0]);
        put(col(G.t(G.puff(0.06), { s: [0.2, 0.8, 1.05], r: [10, 0, -45 * sx], p: add3(j, [0.12 * sx, 0.12, -0.09]) }), Tk.wings), w[0]);
      });
      [[0.06, 0.371], [-0.04, 0.371], [-0.14, 0.357]].forEach(function (s) {
        put(col(G.t(G.cone(0.03, 0.06, 6), { s: [0.45, 1, 1], r: [-20, 0, 0], p: [0, s[1], s[0]] }), Tk.spines), 'body');
      });
      [-1, 1].forEach(function (sx) {
        put(col(G.t(G.cone(0.022, 0.065, 8), { r: [-20, 0, 8 * -sx], p: [0.06 * sx, 0.545, 0.13] }), Tk.horns), 'head');
      });
    }

    /* kitten whiskers: LineSegments on the rig (head-local), thin tubes on a photocard */
    var whiskers = null;
    if (petId === 'pet_kitten') {
      var W = [], hj = J.head;
      [-1, 1].forEach(function (sx) {
        [[0.012, 0.025], [0, 0], [-0.012, -0.025]].forEach(function (d) {
          var a = [0.065 * sx, 0.335 + d[0], 0.33], b = [0.175 * sx, 0.335 + d[0] * 2 + d[1], 0.3];
          if (rig) W.push(a[0] - hj[0], a[1] - hj[1], a[2] - hj[2], b[0] - hj[0], b[1] - hj[1], b[2] - hj[2]);
          else {
            var dx = b[0] - a[0], dy = b[1] - a[1], len = Math.sqrt(dx * dx + dy * dy);
            put(col(G.t(G.tube(0.0045, len, { radial: 4 }), { r: [0, 0, -Math.atan2(dx, dy) / DEG], p: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2] }), Tk.whisker), 'head');
          }
        });
      });
      if (rig) whiskers = new Float32Array(W);
    }

    /* rig-only: three dizzy stars (shown by scaling the 'spark' bone) */
    if (rig) {
      var stars = [], sj = J.spark, _ds = {};
      for (var i = 0; i < 3; i++) {
        dizzyStar(i, 0, _ds);
        stars.push(G.t(sparkle(G, 0.048, 0.014), { p: [sj[0] + _ds.x, sj[1] + _ds.y, sj[2] + _ds.z] }));
      }
      put(col(mergeAll(G, stars), 'Star Gold'), 'spark');
    }

    accessories(K, acc, J, S, rig, put);
    return { parts: parts, whiskers: whiskers, J: J, S: S };
  }

  /* ---------------- the 6 accessories (≤ 300 tris each) ---------------- */
  function accessories(K, acc, J, S, rig, put) {
    var G = K.G;
    function col(geo, token, tn) { return G.paint(geo, token, tn); }
    function t(id, part, dflt) { return tokOf(id, part, dflt); }

    if (acc.hat === 'acc_partyhat') {                       /* cone tilted 12°, 2 stripes, pompom */
      var cone = G.drop(0.07, 0.16, CONE_PROFILE);
      G.paintBy(cone, function (v) {
        var y = v.y;
        return (y > 0.035 && y < 0.058) || (y > 0.085 && y < 0.105) ? t('acc_partyhat', 'stripe', 'Star Gold') : t('acc_partyhat', 'cone', 'Grape');
      }, { perFace: true });
      var pom = col(G.t(G.puff(0.026), { p: [0, 0.16, 0] }), t('acc_partyhat', 'pompom', 'Coral'));
      put(G.t(mergeAll(G, [cone, pom]), { r: [-8, 0, 12], p: [0.012, S.hat[1] - 0.02, S.hat[2] - 0.01] }), 'head');
    }
    if (acc.hat === 'acc_crown') {                          /* open GOLD band, 5 rounded points, a gem, a glint */
      var outer = G.tube(0.085, 0.08, 0.045, { radial: 12, open: true });
      var inner = invert(G.tube(0.078, 0.074, 0.045, { radial: 12, open: true }));
      var pts = [];
      for (var k = 0; k < 5; k++) {
        var a = PI / 2 + k * TAU / 5;
        pts.push(G.t(G.cone(0.022, 0.05, 6), { p: [0.082 * Math.cos(a), 0.047, 0.082 * Math.sin(a)] }));
      }
      var crownX = { r: [-8, 0, 0], p: [0, S.hat[1] + 0.002, S.hat[2]] };
      put(G.t(mergeAll(G, [outer, inner].concat(pts)), crownX), 'head', 'gold');
      put(col(G.t(G.t(G.puff(0.016), { s: [1, 1, 0.6], p: [0, 0.004, 0.088] }), crownX), t('acc_crown', 'gem', 'Rose Deep')), 'head');
      if (rig) put(col(G.t(sparkle(G, 0.03, 0.008), { p: J.glint }), 'Cloud White'), 'glint');
    }
    if (acc.neck === 'acc_bow') {                           /* 2 flattened cones, 6 white spots, a gold knot */
      var B = [0, 0.25, 0.285], spot = t('acc_bow', 'spot', 'Cloud White'), bow = t('acc_bow', 'bow', 'Rose Deep');
      [-1, 1].forEach(function (sx) {
        put(col(G.t(G.cone(0.042, 0.075, 10), { s: [1, 1, 0.45], r: [0, 0, 90 * sx], p: add3(B, [0.04 * sx, 0, 0]) }), bow), 'neck');
        [[0.052, 0.017, 0.011], [0.052, -0.017, 0.011], [0.03, 0, 0.008]].forEach(function (d) {
          put(col(G.t(disc(G, 0.008, 0.004, 6), { p: add3(B, [d[0] * sx, d[1], d[2]]) }), spot), 'neck');
        });
      });
      put(col(G.t(G.puff(0.02), { s: [1, 1, 0.8], p: add3(B, [0, 0, 0.006]) }), t('acc_bow', 'knot', 'Star Gold')), 'neck');
    }
    if (acc.neck === 'acc_scarf') {                         /* a striped collar and a swinging tail */
      var sc = t('acc_scarf', 'scarf', 'Splash Blue'), st = t('acc_scarf', 'stripe', 'Coral');
      var ring = G.ring(0.115, 0.03);
      G.paintBy(ring, function (v) { var a = Math.atan2(v.y, v.x); return Math.floor((a + PI) / (TAU / 12)) % 2 ? st : sc; }, { perFace: true });
      put(G.t(ring, { r: [-53, 0, 0], p: [0, 0.25, 0.16] }), 'neck');
      var tailG = G.puff(0.035);
      G.paintBy(tailG, function (v) { return Math.floor((v.y + 0.04) / 0.022) % 2 ? st : sc; }, { perFace: true });
      put(G.t(tailG, { s: [0.75, 1.9, 0.35], r: [0, 0, 10], p: add3(J.scarfTail, [0.005, -0.06, 0.012]) }), 'scarfTail');
    }
    if (acc.face === 'acc_shades') {                        /* 2 rounded ink lenses (PEARL at Showtime) + glints */
      var ink = t('acc_shades', 'frame', 'Ink'), lensTok = t('acc_shades', 'lens', 'Ink');
      [-1, 1].forEach(function (sx) {
        var lx = { s: [1.15, 0.85, 1], r: [0, 18 * sx, 0], p: [0.062 * sx, S.face[1], S.face[2]] };
        put(col(G.t(disc(G, 0.034, 0.012, 12), lx), lensTok), 'lens');
        if (rig) put(G.t(disc(G, 0.034, 0.012, 12), lx), 'head', 'pearl');
        put(col(G.t(G.tube(0.0045, 0.03, { radial: 4 }), { r: [0, 0, 40], p: [0.062 * sx - 0.008, S.face[1] + 0.008, S.face[2] + 0.008] }), t('acc_shades', 'glint', 'Cloud White')), 'lens');
        put(col(G.t(G.tube(0.007, 0.15, { radial: 6 }), { r: [90, 0, 0], p: [0.12 * sx, S.face[1] + 0.005, S.face[2] - 0.075] }), ink), 'head');
      });
      put(col(G.t(G.tube(0.007, 0.05, { radial: 6 }), { r: [0, 0, 90], p: [0, S.face[1] + 0.005, S.face[2] + 0.006] }), ink), 'head');
    }
    if (acc.back === 'acc_cape') {                          /* 6×4 cloth over the back + 2 gold studs */
      var cape = G.t(G.flag(CAPE.w, CAPE.len, 6, 4), { p: [-CAPE.w / 2, 0, 0] });
      G.t(cape, { r: [-90, 0, 0] });                       /* now horizontal: z +len/2 (top) … -len/2 (hem) */
      var P = cape.getAttribute('position').array;
      for (var i = 0; i < P.length; i += 3) {
        var v = clamp01((CAPE.len / 2 - P[i + 2]) / CAPE.len), x = P[i];
        P[i + 1] = CAPE.y - 0.13 * v * v - 1.0 * x * x;
        P[i + 2] = CAPE.z - v * CAPE.len;
      }
      cape.getAttribute('position').needsUpdate = true;
      G.facet(cape);
      put(col(cape, t('acc_cape', 'cape', 'Cape Red')), 'body', 'toon', { cloth: true });
      [-1, 1].forEach(function (sx) { put(G.t(G.puff(0.022), { p: [0.11 * sx, CAPE.y - 0.02, CAPE.z + 0.005] }), 'body', 'gold'); });
    }
  }

  /* ---------------- rigid-skinned geometry (cached per pet + accessories + tier) ---------------- */
  function skinnedGeometry(T, parts) {
    var m = skinMerge(parts.map(function (p) {
      return { pos: p.geo.getAttribute('position').array, nrm: p.geo.getAttribute('normal').array, col: p.geo.getAttribute('color').array, bone: BONES.indexOf(p.bone) };
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
  function rigData(K, petId, acc) {
    return K.parts.get('char:rig|' + petId + '|' + accKey(acc), K.tier, function (Kt) {
      var T = Kt.THREE, a = assemblePet(Kt, petId, acc, { rig: true });
      var by = { toon: [], shine: [], gold: [], pearl: [] };
      a.parts.forEach(function (p) { by[p.mat].push(p); });
      by.toon.sort(function (x, y) { return (x.cloth ? 1 : 0) - (y.cloth ? 1 : 0); });   /* cloth last: one contiguous range */
      var out = { J: a.J, S: a.S, whiskers: a.whiskers, cape: null, tris: 0, toon: null, shine: null, gold: null, pearl: null };
      Object.keys(by).forEach(function (mat) {
        if (!by[mat].length) return;
        var s = skinnedGeometry(T, by[mat]);
        out[mat] = s.geo;
        if (mat !== 'pearl') out.tris += s.count / 3;
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
  function hullMaterial(K) { return K.variant('outline:' + (K.OUTLINE_CHAR || OUTLINE_CHAR), 'skin', { color: K.col('Ink') }); }
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

  function makeRig(SL3D, petId, acc, tier) {
    if (PETS.indexOf(petId) < 0) petId = 'pet_puppy';
    acc = accState(acc);
    var K = SL3D.kit(tier), T = K.THREE, data = rigData(K, petId, acc);
    var hasShades = acc.face === 'acc_shades', hasCrown = acc.hat === 'acc_crown';
    var group = new T.Group();
    group.name = 'pet:' + petId;
    var sk = buildBones(T, data.J, BONES, BONE_PARENT, group), bones = sk.bones, skeleton = sk.skeleton;

    /* meshes: toon (+ cloth), shine (unlit highlights), gold, pearl (Showtime lenses) */
    var toonGeo = data.cape ? clothCopy(T, data.toon) : data.toon;
    var meshes = { toon: skinnedMesh(T, toonGeo, K.mat('toon'), skeleton, group, 'toon') };
    if (data.shine) meshes.shine = skinnedMesh(T, data.shine, K.mat('state'), skeleton, group, 'shine');
    if (data.gold) meshes.gold = skinnedMesh(T, data.gold, K.mat('gold'), skeleton, group, 'gold');
    if (data.pearl) { meshes.pearl = skinnedMesh(T, data.pearl, K.mat('pearl'), skeleton, group, 'pearl'); meshes.pearl.visible = false; }
    if (K.tier !== 'LOW' && K.outlines !== false && quality(SL3D).outlines) {
      meshes.outline = skinnedMesh(T, toonGeo, hullMaterial(K), skeleton, group, 'outline');
      meshes.outline.receiveShadow = false;
    }
    if (data.whiskers) {
      var wg = K.parts.get('char:whiskers', K.tier, function (Kt) {
        var g = new Kt.THREE.BufferGeometry();
        g.setAttribute('position', new Kt.THREE.BufferAttribute(data.whiskers, 3));
        return g;
      });
      meshes.whiskers = new T.LineSegments(wg, K.mat('line:' + petTokens(petId).whisker));
      meshes.whiskers.name = 'whiskers'; meshes.whiskers.frustumCulled = false;
      bones.head.add(meshes.whiskers);
    }

    /* sockets and anchors follow their bones */
    var sockets = {}, anchors = {};
    SOCKETS.forEach(function (s) {
      var o = new T.Object3D(), bn = SOCKET_BONE[s], j = data.J[bn], p = data.S[s];
      o.name = 'socket:' + s; o.position.set(p[0] - j[0], p[1] - j[1], p[2] - j[2]);
      bones[bn].add(o); sockets[s] = o;
    });
    var topY = petId === 'pet_bunny' ? 0.88 : petId === 'pet_dragon' ? 0.75 : 0.72;
    [['top', 'head', [0, topY, 0.17]], ['emote', 'head', [0.14, topY - 0.06, 0.2]], ['dizzy', 'spark', data.J.spark]].forEach(function (a) {
      var o = new T.Object3D(), j = data.J[a[1]];
      o.name = 'anchor:' + a[0]; o.position.set(a[2][0] - j[0], a[2][1] - j[1], a[2][2] - j[2]);
      bones[a[1]].add(o); anchors[a[0]] = o;
    });

    var pose = restPose({}), opts = { species: petId }, seed = (rigSeq++ * 2654435761) >>> 0, showK = 0, disposed = false;
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
      bones.eyes.scale.set(1, clamp(p.eye, 0.06, 1.2), 1);
      var s = p.spark > 0.01 ? Math.min(1.2, p.spark) : 0;
      bones.spark.scale.set(s, s, s); bones.spark.rotation.set(0, p.sparkSpin * DEG, 0);
      var g = clamp(p.glint, 0, 1.2); bones.glint.scale.set(g, g, g);
      var l = hasShades && showK > 0.5 ? 0 : 1; bones.lens.scale.set(l, l, l);
      cloth(clamp01(p.cape), p.wave);
      return rig;
    }
    var rig = {
      root: group, bones: bones, sockets: sockets, anchors: anchors, pose: pose, meshes: meshes, skeleton: skeleton,
      petId: petId, acc: acc, tier: K.tier, tris: data.tris,
      setPose: setPose,
      setShow: function (k) {
        showK = clamp01(num(k, 0));
        if (meshes.pearl) meshes.pearl.visible = hasShades && showK > 0.5;
        var l = hasShades && showK > 0.5 ? 0 : 1; bones.lens.scale.set(l, l, l);
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
    a.parts.forEach(function (p) { if (by[p.mat]) by[p.mat].push(p.geo); });
    var n = SLOTS.filter(function (s) { return acc[s]; }).length, lk = ctx.look || {}, look = {};
    for (var k in lk) look[k] = lk[k];
    look.tris = BUDGET.pet + BUDGET.acc * n;               /* a pet template carries its accessories */
    var c2 = {};
    for (var k2 in ctx) c2[k2] = ctx[k2];
    c2.look = look;
    var b = K.template(c2);
    if (by.toon.length) b.part('body', by.toon, 'toon', { outline: K.OUTLINE_CHAR || OUTLINE_CHAR });
    if (by.shine.length) b.part('shine', by.shine, 'state');
    if (by.gold.length) b.part('gold', by.gold, 'gold');
    SOCKETS.forEach(function (s) { b.pivot(s, a.S[s]); b.anchor(s, a.S[s]); });
    var topY = petId === 'pet_bunny' ? 0.88 : petId === 'pet_dragon' ? 0.75 : 0.72;
    b.anchor('top', [0, topY, 0.17]).anchor('dizzy', a.J.spark);
    b.hit(Array.isArray(lk.hit) ? lk.hit : [0.8, 0.8, 0.8]);
    var tpl = b.done();
    a.parts.forEach(function (p) { p.geo.dispose(); });   /* done() merged copies */
    return tpl;
  }

  /* ================================================================
     ISLAND WAND — an original light stick: a white bean handle and a puffy
     5-point star bulb glowing in the member colour (unlit) with a soft halo
     shell whose strength follows the Showtime mix.
     ================================================================ */
  function memberHex(K, hex) {
    var h = normHex(hex);
    if (h) return h;
    var L = root.SLIslandLook;
    return K.hex((L && L.MEMBER_FALLBACK) || 'Bubblegum');
  }
  function wandGeos(K, detail) {
    return K.parts.get('char:wand|' + detail, K.tier, function (Kt) {
      var G = Kt.G;
      if (detail === 'crowd') {
        return {
          handle: G.paint(G.t(G.tube(0.011, 0.11, { radial: 4 }), { p: [0, 0.055, 0] }), 'Cloud White'),
          bulb: mergeAll(G, [G.t(G.cone(0.032, 0.045, 4), { p: [0, 0.1325, 0] }), G.t(G.cone(0.032, 0.045, 4), { r: [180, 0, 0], p: [0, 0.0875, 0] })]),
          tip: 0.11
        };
      }
      return {
        handle: G.paint(G.t(G.puff(0.028), { s: [1, 3.2, 1], p: [0, 0.09, 0] }), 'Cloud White'),
        bulb: G.t(G.star(0.065, 0.034), { p: [0, 0.235, 0] }),
        halo: G.t(G.puff(0.1), { s: [1, 1, 0.55], p: [0, 0.235, 0] }),
        tip: 0.235
      };
    });
  }
  function neonFor(K, hex) { return K.variant('neon:Cloud White', 'm' + hex, { color: K.rgb(hex) }); }
  function haloFor(K, hex) { return K.variant('glow:Cloud White', 'm' + hex, { color: K.rgb(hex), visible: true, opacity: 0.2, side: K.THREE.FrontSide }); }
  function makeWand(SL3D, colorHex, tier, detail) {
    var K = SL3D.kit(tier), T = K.THREE, hex = memberHex(K, colorHex), g = wandGeos(K, detail === 'crowd' ? 'crowd' : 'hero');
    var root3 = new T.Group();
    root3.name = 'wand';
    var handle = new T.Mesh(g.handle, K.mat('toon')), bulb = new T.Mesh(g.bulb, neonFor(K, hex)), halo = null;
    handle.name = 'handle'; bulb.name = 'bulb';
    root3.add(handle, bulb);
    if (g.halo) { halo = new T.Mesh(g.halo, haloFor(K, hex)); halo.name = 'halo'; halo.renderOrder = 2; root3.add(halo); }
    var disposed = false;
    root3.userData = {
      kind: 'wand', color: hex, tip: g.tip,
      setShow: function (k) { if (halo) halo.material.opacity = 0.2 + 0.45 * clamp01(num(k, 0)); },
      dispose: function () { if (disposed) return; disposed = true; if (root3.parent) root3.parent.remove(root3); root3.clear(); }
    };
    return root3;
  }

  /* ================================================================
     'YOU' AVATAR — a chibi bean in the member colour with the child's emoji
     on a face cap; skinned like the pets (bones base, body, head, armL, armR).
     ================================================================ */
  var AV_BONES = ['base', 'body', 'head', 'armL', 'armR'];
  var AV_PARENT = { base: null, body: 'base', head: 'body', armL: 'body', armR: 'body' };
  var AV_J = { base: [0, 0, 0], body: [0, AV_BODY_Y, 0], head: [0, 0.6, 0], armL: [0.17, 0.5, 0], armR: [-0.17, 0.5, 0], headC: [0, 0.71, 0], hand: [-0.2, 0.3, 0.03] };
  function avatarData(K, hex) {
    return K.parts.get('char:avatar|' + hex, K.tier, function (Kt) {
      var G = Kt.G, T = Kt.THREE, c = Kt.rgb(hex), parts = [];
      var body = G.t(G.bean(0.18, 0.22), { p: [0, AV_BODY_Y, 0] });
      G.paintBy(body, function (v) { return v.y < 0.13 ? [c, 'shade'] : c; });
      parts.push({ geo: body, bone: 'body' });
      parts.push({ geo: G.paint(G.t(G.puff(0.24, { sphere: true }), { p: AV_J.headC }), 'Cloud White'), bone: 'head' });
      [['armL', 1], ['armR', -1]].forEach(function (a) {
        parts.push({ geo: G.paint(G.t(G.puff(0.055), { s: [0.75, 1.9, 0.75], p: add3(AV_J[a[0]], [0.02 * a[1], -0.085, 0]) }), c), bone: a[0] });
      });
      [-1, 1].forEach(function (sx) { parts.push({ geo: G.paint(G.t(G.puff(0.065), { s: [1, 0.55, 1.3], p: [0.08 * sx, 0.03, 0.03] }), c, 'shade'), bone: 'body' }); });
      var m = skinMerge(parts.map(function (p) {
        return { pos: p.geo.getAttribute('position').array, nrm: p.geo.getAttribute('normal').array, col: p.geo.getAttribute('color').array, bone: AV_BONES.indexOf(p.bone) };
      }));
      var g = new T.BufferGeometry();
      g.setAttribute('position', new T.BufferAttribute(m.pos, 3));
      g.setAttribute('normal', new T.BufferAttribute(m.nrm, 3));
      g.setAttribute('color', new T.BufferAttribute(m.col, 3));
      g.setAttribute('skinIndex', new T.Uint16BufferAttribute(m.skinIndex, 4));
      g.setAttribute('skinWeight', new T.BufferAttribute(m.skinWeight, 4));
      g.computeBoundingSphere();
      parts.forEach(function (p) { p.geo.dispose(); });
      /* the face: the front cap of a shell just outside the head, planar-mapped (head-local) */
      var R = 0.244, face = trimTris(Kt, G.puff(R, { sphere: true }), null, function (x, y, z) { return z > 0.14; });
      var P = face.getAttribute('position').array, uv = new Float32Array(P.length / 3 * 2);
      for (var i = 0, j = 0; i < P.length; i += 3, j += 2) { uv[j] = 0.5 + P[i] / 0.4; uv[j + 1] = 0.5 + P[i + 1] / 0.4; }
      face.setAttribute('uv', new T.BufferAttribute(uv, 2));
      face.translate(AV_J.headC[0] - AV_J.head[0], AV_J.headC[1] - AV_J.head[1], AV_J.headC[2] - AV_J.head[2]);
      return { skin: g, face: face, tris: m.count / 3 + P.length / 9 };
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
    meshes.face = new T.Mesh(data.face, faceMat);
    meshes.face.name = 'face';
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
    top.name = 'anchor:top'; top.position.set(0, 0.5, 0);
    bones.head.add(top);
    var pose = restAvatar({}), o2 = {}, seed = (rigSeq++ * 2654435761) >>> 0, phase = (seed % 997) / 997, wand = null, showK = 0, disposed = false;
    var _q = new T.Quaternion(), _e = new T.Euler(), _v = new T.Vector3();
    var unsub = typeof SL3D.onQuality === 'function' ? SL3D.onQuality(function (q) { if (meshes.outline && q && q.outlines === false) meshes.outline.visible = false; }) : null;
    function rot(b, x, y, z, order) { b.rotation.set(x * DEG, y * DEG, z * DEG, order || 'XYZ'); }
    function setPose(p) {
      if (disposed || !p) return av;
      if (p !== pose) for (var i = 0; i < AV_KEYS.length; i++) { var k = AV_KEYS[i]; pose[k] = typeof p[k] === 'number' ? p[k] : (AV_ONE[k] || 0); }
      p = pose;
      baseTransform(T, bones.base, p, AV_BODY_Y, _q, _e, _v);
      rot(bones.head, p.headPitch, p.headYaw, p.headRoll, 'YXZ');
      rot(bones.armL, -p.armLf, 0, p.armL, 'ZXY');
      rot(bones.armR, -p.armRf, 0, -p.armR, 'ZXY');
      return av;
    }
    var av = {
      root: group, bones: bones, sockets: { hand: hand }, anchors: { top: top }, pose: pose, meshes: meshes, color: hex, emoji: emoji, tier: K.tier,
      tris: data.tris,
      setPose: setPose,
      /* the Island Wand in the right hand (Showtime) */
      setWand: function (on) {
        if (on && !wand) {
          wand = makeWand(SL3D, hex, K.tier);
          wand.rotation.set(70 * DEG, 0, 0);
          wand.userData.setShow(showK);
          hand.add(wand);
        }
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
     FAN BLOBS — original round gumdrop fans for crowds, in seeded pastel
     colours, each holding a little wand. 'crowd' detail ≤ 50 tris for the
     blob (instancing hosts read userData.geos); 'hero' is rounder.
     ================================================================ */
  function fanGeos(K, detail, bodyTok) {
    return K.parts.get('char:fan|' + detail + '|' + bodyTok, K.tier, function (Kt) {
      var G = Kt.G, eye = tokOf('fanBlob', 'eye', 'Ink'), list;
      if (detail === 'hero') {
        list = [G.paint(G.t(G.puff(0.13, { sphere: true }), { s: [1, 1.12, 0.95], p: [0, 0.15, 0] }), bodyTok)];
        [-1, 1].forEach(function (sx) {
          list.push(G.paint(G.t(G.puff(0.022), { s: [0.9, 1.2, 0.6], p: [0.045 * sx, 0.18, 0.118] }), eye));
          list.push(G.paint(G.t(disc(G, 0.018, 0.004, 8), { p: [0.075 * sx, 0.14, 0.11] }), Kt.col(bodyTok).lerp(Kt.col('Blush'), 0.6)));
        });
      } else {
        list = [G.paint(G.t(G.tube(0.1, 0.12, 0.2, { radial: 7 }), { p: [0, 0.1, 0] }), bodyTok),
                G.paint(G.t(G.cone(0.1, 0.07, 7), { p: [0, 0.235, 0] }), bodyTok)];
        [-1, 1].forEach(function (sx) {
          list.push(G.paint(trimTris(Kt, G.t(G.cone(0.017, 0.006, 3), { r: [90, 0, 0], p: [0.04 * sx, 0.17, 0.113] }), 3), eye));
        });
      }
      return { body: mergeAll(G, list) };
    });
  }
  function makeFanBlob(SL3D, seed, tier, o) {
    var K = SL3D.kit(tier), T = K.THREE, look = fanLook(seed), detail = o && o.detail === 'hero' ? 'hero' : 'crowd';
    var geos = fanGeos(K, detail, look.body), group = new T.Group();
    group.name = 'fan';
    var body = new T.Mesh(geos.body, K.mat('toon'));
    body.name = 'body';
    var holder = new T.Group();                              /* the wand pivots at the paw */
    holder.position.set(0.11 * look.hand, 0.15, 0.06);
    var wand = makeWand(SL3D, K.hex(look.wand), tier, detail === 'hero' ? 'hero' : 'crowd');
    wand.scale.setScalar(detail === 'hero' ? 0.7 : 1);
    holder.add(wand);
    group.add(body, holder);
    group.scale.setScalar(look.scale);
    var m = {}, disposed = false;
    group.userData = {
      kind: 'fan', look: look, geos: { body: geos.body, wandHandle: wand.children[0].geometry, wandBulb: wand.children[1].geometry },
      colors: { body: K.hex(look.body), wand: K.hex(look.wand) },
      /* t: the scene clock; o {bpm, excite 0..1, reduced} */
      update: function (t, opt) {
        fanMotion(t, look, opt, m);
        body.position.y = m.y; holder.position.y = 0.15 + m.y;
        body.scale.y = m.sy;
        group.rotation.z = m.roll * DEG;
        holder.rotation.z = -m.wand * DEG * look.hand;
        return m;
      },
      setShow: function (k) { wand.userData.setShow(k); },
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
    PETS: PETS, ACC_SOCKET: ACC_SOCKET, SLOTS: SLOTS, SOCKETS: SOCKETS, BONES: BONES, BONE_PARENT: BONE_PARENT,
    SOCKET_BONE: SOCKET_BONE, BODY_Y: BODY_Y, BUDGET: BUDGET, SPECIES: SPECIES, CAPE: CAPE, KICK_STRIKE: KICK_STRIKE, DANCE_BPM: DANCE_BPM,
    POSE_KEYS: POSE_KEYS, CLIP_NAMES: CLIP_NAMES, CLIP_INFO: CLIP_INFO, AV_KEYS: AV_KEYS, AV_CLIPS: AV_CLIPS,
    jointsOf: jointsOf, socketsOf: socketsOf, restPose: restPose, mixPose: mixPose, sample: sampleClip, sampleClip: sampleClip,
    durOf: durOf, blinkAt: blinkAt, crownGlint: crownGlint, restAvatar: restAvatar, sampleAvatar: sampleAvatar,
    accState: accState, accKey: accKey, capeDeform: capeDeform, dizzyStar: dizzyStar, fanLook: fanLook, fanMotion: fanMotion,
    skinMerge: skinMerge, hash: hash, petTokens: petTokens
  };
  var api = {};
  Object.keys(POSE_API).forEach(function (k) { api[k] = POSE_API[k]; });
  api.register = register;
  /* browser-only builders (they need a kit K / SL3D; exported for the lab and tests with a THREE) */
  api.build = { assemblePet: assemblePet, rigData: rigData, makeRig: makeRig, petTemplate: petTemplate, makeAvatar: makeAvatar,
                makeWand: makeWand, makeFanBlob: makeFanBlob, models: models };
  return api;
}));
