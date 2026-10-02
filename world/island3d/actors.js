/* ================================================================
   My Island 3D — actors (island chunk 9; classic script, browser).
   Drives the chunk-8 rigs (SL3D.makeRig / makeAvatar) from the pure
   SLPetBrain: where each pet is and what it is doing becomes a blended
   pose (rig clips sampled through SL3D.petPose, crossfaded with mixPose),
   plus secondary motion, emotes, blob shadows and the avatar.
   THREE only ever comes from the kit (K.THREE). window.SLActors in the
   browser (and SL3D.makeActors(opts) once the stage is ready);
   module.exports in Node (create() runs against an injected kit).

   var actors = SLActors.create(K, SL3D, {scene, reduced, camera?, sound?, emit?, voice?, user?, seed?, tier?})
     scene      the island scene: actors.group (rigs, avatar, blob shadows, emote sprites) is added to it
     camera     optional THREE camera (or setCamera later): pets and the avatar face it for looks,
                count 7 of the dance and the group pose (default: the +z default view)
     sound      optional SLSound instance (sound(name, vol, step, pan) + .pet); default SLSound.make({})
     emit       optional fx hook emit(kind, [x, y, z], n, {reduced, colors}) for sparkle bursts
                (fx3d); without it the actors' own 32-sprite pool draws them
     voice      false = tap() does not play the pet voice (when the caller plays it)
     user       optional {color, avatar | emoji}: the avatar until sync() passes one
   actors.sync(pets, avatar, world)
     pets       [{id, acc, active?, name?}]  (owned pet records + the active flag)
     avatar     {color, emoji | avatar} | null (no avatar) | undefined (keep)
     world      the SLWorldCore world, or the island view {placed, unlocked, mode, world?} —
                land / occupancy / layout for the brain; view.mode 'edit' | 'place' sits the pets
   actors.update(dt, t, show?, beat?) → animating
     show       the Showtime mix 0..1 (also settable with setShow)
     beat       the music beat clock: SLMusic.clock() {bpm, beat}, or the beat count (number);
                used to start the dance break on a bar line (SLMusic.clock() is read when absent)
   actors.perform(kind, uid) → lead seconds | -1   'trampoline' (run-over ≤ 1.2 s, 3 bounces,
                front flip, hop off — SLMotion 'bounce' timing) · 'bench' (walk, hop up, sit)
   actors.active() → active pet id | null       (what a.pets.active() reports)
   actors.petsApi = {active(), perform(kind, uid)}   ready to hand to model handles as a.pets
   actors.tap(target) → bool   a pet id ('pet:<id>' too): happy hop + voice + emote sprite
                (the dragon puffs rainbow sparkles); 'me' | 'avatar': wave + finger-heart + 'pop'
   actors.emote(target, kind)  target 'pet:<id>' | '<petId>' | 'me' | 'avatar' | 'pets' | 'all';
                kind 'heart' | 'note' | 'star' | 'sparkle' | 'rainbow' | 'hop' | 'happy' |
                'wave' | 'fingerHeart' | 'cheer'
   actors.dance(on) → seconds the dance break lasts (0 = none): gather ≤ 2 s near the house,
                the 8-count at 118 BPM from the next bar, group pose with finger-hearts and a sparkle
                burst, 'cheer'; reduced = one group pose with a sparkle fade
   actors.setShow(k) · setReduced(on) · setMode(mode) · setCamera(cam)
   actors.hits(out) → [{kind: 'pet'|'me', id, x, y, z, r, pickable}]   picking spheres (0.4 u)
   actors.anchorOf(target, out) → {x, y, z} | null                     label / emote anchors
   actors.info() → {pets, avatar, calls, tris} · actors.brain · actors.group · actors.dispose()

   MOTION (art bible / island-architecture 'animation'): walk 0.9 u/s · trot, bunny 0.18 u hops,
   dragon 0.12 u flutter with 3 Hz wings (all from the rig clips, blended idle → walk → run by
   speed) · lean into turns, head leads the turn, tail and ears lag · cape streams with speed ·
   happy tail after a tap and at Showtime · idle actions every 4–8 s (brain) · edit / place mode:
   still sitting · reduced motion: still poses, turn and emote only, static sprite fades.
   Avatar: 0.02 u bob at 0.5 Hz, a glance at a pet every ~6 s, the Island Wand at Showtime
   (swaying once per two beats), wave + finger-heart on tap, the avatar's own dance moves.
   Nothing flashes; sprites fade smoothly; per-frame work allocates nothing.
   ================================================================ */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.SLActors = api;
    if (root.SL3D && typeof root.SL3D.defineApi === 'function') api.register(root.SL3D);
  }
}(typeof self !== 'undefined' ? self : typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var VERSION = 1;
  var PI = Math.PI, TAU = PI * 2, DEG = PI / 180;
  var PETS = ['pet_puppy', 'pet_kitten', 'pet_bunny', 'pet_dragon'];
  var TOP_Y = { pet_puppy: 0.72, pet_kitten: 0.72, pet_bunny: 0.88, pet_dragon: 0.75 };
  var HIT_R = 0.4, AV_TOP = 1.0, AV_HIT_Y = 0.48;
  var BLOB = { pet: 0.62, avatar: 0.72, shrink: 0.5, lift: 1.0 };
  var BLEND = { dflt: 0.18, hop: 0.06, act: 0.25, edit: 0.3 };
  var FX_CAP = 32;
  var EMOTE = {
    rise: 0.36, dur: 1.15, size: 0.26, sparkle: 0.12,
    cells: { sparkle: 0, heart: 1, note: 2, star: 3 },
    colors: { heart: 'Bubblegum', note: 'Splash Blue', star: 'Star Gold', sparkle: 'Star Gold' },
    rainbow: ['Neon Pink', 'Star Gold', 'Leaf Mint', 'Neon Cyan', 'Grape']
  };
  var AV_TAP = { wave: 1.0, heart: 0.9 };

  /* ---------------- small maths ---------------- */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function num(v, d) { return typeof v === 'number' && isFinite(v) ? v : d; }
  function smooth01(u) { u = clamp01(u); return u * u * (3 - 2 * u); }
  function inOut(u) { u = clamp01(u); return -(Math.cos(PI * u) - 1) / 2; }
  function arc(u) { u = clamp01(u); return 4 * u * (1 - u); }
  function lerp(a, b, k) { return a + (b - a) * k; }
  function wrap(a) { a = (a + PI) % TAU; if (a < 0) a += TAU; return a - PI; }
  /* fade in over a, out over b, inside a window of length d */
  function env(t, d, a, b) { return smooth01(t / a) * (1 - smooth01((t - (d - b)) / b)); }
  function hash(s) {
    s = String(s);
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
  }

  /* ---------------- the pose API (SL3D.petPose = SLCharacters' pure maths) ---------------- */
  var MINI_KEYS = ['x', 'y', 'z', 'yaw', 'pitch', 'roll', 'sx', 'sy', 'sz', 'hips', 'neck', 'headPitch', 'headYaw', 'headRoll',
    'earL', 'earR', 'earBack', 'tailYaw', 'tailPitch', 'tailCurl', 'legFL', 'legFR', 'legBL', 'legBR', 'legFLz', 'legFRz',
    'wingL', 'wingR', 'eye', 'spark', 'sparkSpin', 'glint', 'cape', 'wave', 'scarf', 'faceCam'];
  var MINI_AV = ['x', 'y', 'z', 'yaw', 'pitch', 'roll', 'sx', 'sy', 'sz', 'headPitch', 'headYaw', 'headRoll', 'armL', 'armR', 'armLf', 'armRf', 'faceCam', 'wand'];
  var ONE = { sx: 1, sy: 1, sz: 1, eye: 1 };
  /* a still fallback (rest poses only) when the characters chunk is missing */
  function miniPoseApi() {
    function rest(keys) { return function (out) { out = out || {}; for (var i = 0; i < keys.length; i++) out[keys[i]] = ONE[keys[i]] || 0; return out; }; }
    var restPose = rest(MINI_KEYS), restAvatar = rest(MINI_AV);
    return {
      POSE_KEYS: MINI_KEYS, AV_KEYS: MINI_AV, SPECIES: {}, DANCE_BPM: 118, restPose: restPose, restAvatar: restAvatar,
      mixPose: function (a, b, k, out) { out = out || {}; for (var i = 0; i < MINI_KEYS.length; i++) { var key = MINI_KEYS[i], va = num(a && a[key], ONE[key] || 0); out[key] = va + (num(b && b[key], ONE[key] || 0) - va) * k; } return out; },
      sampleClip: function (n, t, out) { return restPose(out); },
      sampleAvatar: function (n, t, out) { return restAvatar(out); },
      crownGlint: function () { return 0; }, mini: true
    };
  }
  function poseApi(SL3D) {
    var P = (SL3D && SL3D.petPose) || root.SLCharacters || null;
    return P && typeof P.sampleClip === 'function' && typeof P.mixPose === 'function' ? P : miniPoseApi();
  }
  /* avatar poses blend over their own keys */
  function mixAv(P, a, b, k, out) {
    var keys = P.AV_KEYS || MINI_AV;
    for (var i = 0; i < keys.length; i++) { var key = keys[i], va = num(a[key], ONE[key] || 0); out[key] = va + (num(b[key], ONE[key] || 0) - va) * k; }
    return out;
  }
  function copyPose(keys, src, dst) { for (var i = 0; i < keys.length; i++) dst[keys[i]] = src[keys[i]]; return dst; }

  /* ---------------- placeholders (only when chunk 8 is missing) ---------------- */
  function placeholderRig(K, petId) {
    var T = K.THREE, G = K.G, tok = 'PETCOL.' + petId + '.body';
    var parts = [G.paint(G.t(G.bean(0.15, 0.16), { r: [90, 0, 0], p: [0, 0.22, 0] }), tok), G.paint(G.t(G.puff(0.15), { p: [0, 0.4, 0.15] }), tok)];
    var geo = G.merge(parts);
    parts.forEach(function (g) { g.dispose(); });
    return simpleRig(T, geo, K.mat('toon'), 'pet:' + petId, 0.22);
  }
  function placeholderAvatar(K, hex) {
    var T = K.THREE, G = K.G, c = K.rgb(hex || '#FF8FC8');
    var parts = [G.paint(G.t(G.bean(0.18, 0.22), { p: [0, 0.33, 0] }), c), G.paint(G.t(G.puff(0.24), { p: [0, 0.71, 0] }), 'Cloud White')];
    var geo = G.merge(parts);
    parts.forEach(function (g) { g.dispose(); });
    var rig = simpleRig(T, geo, K.mat('toon'), 'avatar', 0.33);
    rig.setWand = function () { return rig; };
    return rig;
  }
  /* a one-mesh rig honouring only the whole-body pose (offset, rotation, squash) */
  function simpleRig(T, geo, mat, name, cy) {
    var group = new T.Group(), inner = new T.Group(), mesh = new T.Mesh(geo, mat);
    group.name = name; inner.add(mesh); group.add(inner);
    var disposed = false;
    var rig = {
      root: group, placeholder: true, pose: {}, anchors: {}, sockets: {}, bones: {},
      setPose: function (p) {
        if (disposed || !p) return rig;
        inner.position.set(num(p.x, 0), num(p.y, 0), num(p.z, 0));
        inner.rotation.set(num(p.pitch, 0) * DEG, num(p.yaw, 0) * DEG, num(p.roll, 0) * DEG, 'YXZ');
        inner.scale.set(num(p.sx, 1) || 1e-4, num(p.sy, 1) || 1e-4, num(p.sz, 1) || 1e-4);
        return rig;
      },
      setShow: function () { return rig; },
      play: function () { return rig.pose; },
      dispose: function () { if (disposed) return; disposed = true; if (group.parent) group.parent.remove(group); geo.dispose(); }
    };
    return rig;
  }

  /* ================================================================
     create(K, SL3D, opts)
     ================================================================ */
  function create(K, SL3D, opts) {
    if (!K || !K.THREE) throw new Error('SLActors.create needs the kit K');
    opts = opts || {};
    SL3D = SL3D || {};
    var T = K.THREE, tier = opts.tier || K.tier || SL3D.tier || 'MID';
    var P = poseApi(SL3D), POSE_KEYS = P.POSE_KEYS || MINI_KEYS, AV_KEYS = P.AV_KEYS || MINI_AV;
    var Brain = opts.Brain || root.SLPetBrain || null;
    var brain = Brain ? Brain.create({ seed: opts.seed == null ? 'island-pets' : opts.seed, reduced: !!opts.reduced }) : null;
    var DANCE = Brain ? Brain.DANCE : { bpm: 118, beat: 60 / 118, dur: 8 * 60 / 118, hold: 0.6, reducedDur: 2.2 };
    var WALK = Brain ? Brain.WALK : { speed: 0.9 };
    var HOP = Brain ? Brain.HOP : { on: 0.32, off: 0.4, benchOn: 0.36 };

    var group = new T.Group();
    group.name = 'actors';
    if (opts.scene && typeof opts.scene.add === 'function') opts.scene.add(group);
    var blobs = typeof K.blobs === 'function' ? K.blobs(8) : null;
    if (blobs) { blobs.mesh.name = 'actor-blobs'; group.add(blobs.mesh); }
    var fxPool = typeof K.billboards === 'function' ? K.billboards({ capacity: FX_CAP, texture: 'sparkles', additive: false, name: 'actor-fx', renderOrder: 6 }) : null;
    if (fxPool) group.add(fxPool.mesh);

    var reduced = !!opts.reduced, showK = 0, mode = 'play', camera = opts.camera || null, disposed = false;
    var actors = [], byId = {};
    var avatar = null, avatarInfo = opts.user || null, avatarSpot = null;
    var lastBeat = null, now = 0, fxNow = 0;
    var danceSeen = -1, danceCue = 0, danceWasOn = false;
    var _glance = {}, _hits = [], _cam = { x: 0, y: 10, z: 30 };
    var sound = null, soundTried = false;

    /* ---------- sound ---------- */
    function snd() {
      if (opts.sound) return opts.sound;
      if (!soundTried) {
        soundTried = true;
        try { if (root.SLSound && typeof root.SLSound.make === 'function') sound = root.SLSound.make({}); } catch (e) { sound = null; }
      }
      return sound;
    }
    function panOf(x) { var S = root.SLSound; return S && typeof S.panFor === 'function' ? S.panFor(x + 8, 16) : 0; }
    function sfx(name, x, vol, step) { var s = snd(); if (!s || typeof s !== 'function') return; try { s(name, vol == null ? 1 : vol, step || 0, panOf(x)); } catch (e) { /* sound is never fatal */ } }
    function voice(petId, x) {
      var s = snd();
      if (!s) return;
      try {
        if (typeof s.pet === 'function') s.pet(petId, 0.9, panOf(x));
        else if (typeof s === 'function') s(root.SLSound && root.SLSound.petVoice ? root.SLSound.petVoice(petId) : 'yip', 0.9, 0, panOf(x));
      } catch (e) { /* ignore */ }
    }

    /* ---------- the camera direction ---------- */
    function camPos() {
      if (camera && camera.position) { _cam.x = camera.position.x; _cam.y = camera.position.y; _cam.z = camera.position.z; }
      return _cam;
    }
    function yawToCam(x, z) { var c = camPos(); return Math.atan2(c.x - x, c.z - z); }

    /* ================================================================
       SPRITES: emotes that follow an actor + sparkles (one pooled draw call)
       ================================================================ */
    var fx = [];
    for (var fi = 0; fi < FX_CAP; fi++) fx.push({ on: false, k: -1, cell: 0, color: null, follow: null, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, t0: 0, dur: 1, size: 0.2, rise: 0, rot: 0, spin: 0, still: false });
    function fxSlot() {
      if (!fxPool) return null;
      for (var i = 0; i < fx.length; i++) if (!fx[i].on) {
        var k = fxPool.alloc();
        if (k < 0) return null;
        var f = fx[i]; f.on = true; f.k = k; return f;
      }
      return null;
    }
    function fxFree(f) { if (f.on) { fxPool.free(f.k); f.on = false; f.k = -1; f.follow = null; } }
    /* a heart / note / star / sparkle rising above an actor */
    function emoteSprite(target, kind, dx) {
      var f = fxSlot();
      if (!f) return;
      var cell = EMOTE.cells[kind] != null ? EMOTE.cells[kind] : EMOTE.cells.heart;
      f.cell = cell; f.color = EMOTE.colors[kind] || EMOTE.colors.heart; f.follow = target;
      f.x = dx || 0; f.y = 0; f.z = 0; f.vx = f.vy = f.vz = 0;
      f.t0 = fxNow; f.dur = EMOTE.dur; f.size = EMOTE.size; f.rise = reduced ? 0 : EMOTE.rise; f.rot = 0; f.spin = 0; f.still = reduced;
    }
    /* a burst of n sparkles at a world point (colors: one token or a list) */
    function sparkles(x, y, z, n, colors, spread) {
      if (typeof opts.emit === 'function') {
        try { opts.emit('sparkle', [x, y, z], n, { reduced: reduced, colors: colors }); return; } catch (e) { /* fall back to our pool */ }
      }
      spread = spread || 0.9;
      for (var i = 0; i < n; i++) {
        var f = fxSlot();
        if (!f) return;
        var a = (i / n) * TAU + i * 0.37, up = 0.4 + 0.6 * ((i * 7) % 5) / 5;
        f.cell = EMOTE.cells.sparkle; f.color = Array.isArray(colors) ? colors[i % colors.length] : (colors || EMOTE.colors.sparkle);
        f.follow = null; f.x = x; f.y = y; f.z = z;
        if (reduced) { f.vx = f.vy = f.vz = 0; f.x += Math.cos(a) * 0.18 * spread; f.z += Math.sin(a) * 0.18 * spread; f.y += 0.1 * up; }
        else { f.vx = Math.cos(a) * 0.55 * spread; f.vz = Math.sin(a) * 0.55 * spread; f.vy = 0.5 + 0.7 * up; }
        f.t0 = fxNow; f.dur = reduced ? 0.9 : 0.75; f.size = EMOTE.sparkle; f.rise = 0; f.rot = a; f.spin = reduced ? 0 : 2.4; f.still = reduced;
      }
    }
    function updateFx(dt) {
      if (!fxPool) return false;
      var live = false;
      for (var i = 0; i < fx.length; i++) {
        var f = fx[i];
        if (!f.on) continue;
        var age = fxNow - f.t0, u = age / f.dur;
        if (u >= 1 || (f.follow && f.follow.gone)) { fxFree(f); continue; }
        live = true;
        var x, y, z, size = f.size, alpha;
        if (f.follow) {
          var A = f.follow;
          x = A.ax + f.x; z = A.az; y = A.ay + 0.08 + f.rise * (1 - (1 - u) * (1 - u));
          size *= f.still ? 1 : (u < 0.15 ? 0.6 + 0.5 * smooth01(u / 0.15) : u < 0.3 ? 1.1 - 0.1 * smooth01((u - 0.15) / 0.15) : 1);
          alpha = f.still ? smooth01(u / 0.15) * (1 - smooth01((u - 0.7) / 0.3)) : 1 - smooth01((u - 0.72) / 0.28);
        } else {
          f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt;
          f.vy -= 1.6 * dt; f.vx *= 1 - 1.5 * dt; f.vz *= 1 - 1.5 * dt;
          x = f.x; y = f.y; z = f.z;
          alpha = f.still ? smooth01(u / 0.2) * (1 - smooth01((u - 0.45) / 0.55)) : 1 - smooth01((u - 0.4) / 0.6);
          size *= f.still ? 1 : 1 - 0.4 * u;
        }
        f.rot += f.spin * dt;
        fxPool.set(f.k, x, y, z, size, f.color, alpha, f.cell, f.rot);
      }
      fxPool.commit();
      return live;
    }

    /* ================================================================
       PETS
       ================================================================ */
    function accKey(acc) { return ['hat', 'neck', 'face', 'back'].map(function (s) { return (acc && acc[s]) || '-'; }).join('|'); }
    function makePetRig(id, acc) {
      var rig = null;
      try { if (typeof SL3D.makeRig === 'function') rig = SL3D.makeRig(id, acc || {}, tier); } catch (e) { rig = null; }
      if (!rig) { try { rig = placeholderRig(K, id); } catch (e2) { rig = null; } }
      if (rig && typeof rig.setShow === 'function') rig.setShow(showK);
      return rig;
    }
    function newActor(id) {
      var a = {
        id: id, species: PETS.indexOf(id) >= 0 ? id : 'pet_puppy', rig: null, key: '', acc: '',
        pose: P.restPose({}), base: P.restPose({}), tmp: P.restPose({}), from: P.restPose({}),
        blend: 1, blendDur: BLEND.dflt, idleT: 0, gaitT: 0, omegaS: 0, accS: 0, lastSpeed: 0, lookKs: 0, happyK: 0,
        landT: -9, lastKey: '', cueN: -1, seed: hash(id) >>> 0, sign: (hash(id) & 1) ? 1 : -1, fcS: 0, dt: 0, lastBounce: null,
        blob: blobs ? blobs.alloc() : -1, ax: 0, ay: 0, az: 0, gone: false, crown: false, yawShown: 0,
        hit: { kind: 'pet', id: id, x: 0, y: 0, z: 0, r: HIT_R, pickable: true },
        o: { species: id, seed: hash(id) >>> 0, reduced: false, speed: undefined, bpm: undefined, rate: undefined, intensity: undefined, dur: undefined, height: undefined, ground: undefined }
      };
      return a;
    }
    function dropActor(a) {
      a.gone = true;
      if (a.rig) { try { a.rig.dispose(); } catch (e) { /* already gone */ } a.rig = null; }
      if (blobs && a.blob >= 0) blobs.free(a.blob);
      a.blob = -1;
    }

    /* ---------- reading sync() inputs ---------- */
    function placedOf(world) {
      if (!world) return [];
      if (world.world && Array.isArray(world.world.placed)) return world.world.placed;
      return Array.isArray(world.placed) ? world.placed : [];
    }
    function modeOf(world) { return world && typeof world.mode === 'string' ? world.mode : null; }
    function spotOf(placed) {
      var G = root.SLGrid3D;
      try { if (G && typeof G.avatarSpot === 'function') return G.avatarSpot(placed); } catch (e) { /* fall back */ }
      var C = root.SLWorldCore;
      for (var i = 0; i < placed.length; i++) {
        var p = placed[i];
        if (p.id !== 'house_cottage') continue;
        var it = C && C.item ? C.item(p.id) : null, fp = (it && it.fp) || [2, 2];
        return { x: p.x - 7.5, y: 0, z: p.y + fp[1] - 4.5, c: p.x, r: p.y + fp[1] };
      }
      return null;
    }
    function avatarKeyOf(info) {
      if (!info) return '';
      return String(info.color || '') + '|' + String(info.emoji || info.avatar || '');
    }

    function sync(pets, avatarArg, world) {
      if (disposed) return;
      var list = Array.isArray(pets) ? pets.filter(function (p) { return p && typeof p.id === 'string' && /^pet_/.test(p.id); }) : [];
      var placed = placedOf(world);
      if (avatarArg !== undefined) avatarInfo = avatarArg ? avatarArg : null;
      avatarSpot = avatarInfo ? spotOf(placed) : null;
      var m = modeOf(world);
      if (m) mode = m === 'edit' || m === 'place' ? m : 'play';
      if (brain) {
        brain.sync({
          world: world || { placed: placed },
          pets: list.map(function (p) { return { id: p.id, active: !!p.active }; }),
          avatar: avatarSpot ? { c: avatarSpot.c, r: avatarSpot.r } : null,
          mode: mode
        });
      }
      /* rigs: one per pet, rebuilt when its accessories change */
      var keep = {};
      list.forEach(function (rec) {
        keep[rec.id] = 1;
        var a = byId[rec.id];
        if (!a) { a = newActor(rec.id); byId[rec.id] = a; actors.push(a); }
        var key = accKey(rec.acc);
        if (!a.rig || a.acc !== key) {
          if (a.rig) { try { a.rig.dispose(); } catch (e) { /* ignore */ } }
          a.rig = makePetRig(rec.id, rec.acc);
          a.acc = key; a.crown = !!(rec.acc && rec.acc.hat === 'acc_crown');
          if (a.rig) group.add(a.rig.root);
          a.key = ''; a.blend = 1;
        }
      });
      for (var i = actors.length - 1; i >= 0; i--) {
        if (keep[actors[i].id]) continue;
        dropActor(actors[i]); delete byId[actors[i].id]; actors.splice(i, 1);
      }
      syncAvatar();
      drainEvents();
      if (reduced) poseAll(0);              /* reduced motion renders on demand: pose once now */
    }

    /* ---------- the brain's events → sparkles ---------- */
    function drainEvents() {
      if (!brain || !brain.events.length) return;
      for (var i = 0; i < brain.events.length; i++) {
        var e = brain.events[i], a = byId[e.id];
        if (e.type === 'pop') { sparkles(e.x0, e.y0 + 0.3, e.z0, 6, EMOTE.colors.sparkle, 0.7); sparkles(e.x, e.y + 0.3, e.z, 8, EMOTE.colors.sparkle, 0.8); }
        else if (e.type === 'spawn') sparkles(e.x, e.y + 0.3, e.z, 10, EMOTE.rainbow, 1);
        else if (e.type === 'emote' && a) emoteSprite(a, e.kind, 0);
        else if (e.type === 'land' && a && !reduced) a.landT = brain.now;
      }
      brain.events.length = 0;
    }

    /* ---------- pose composition for one pet ---------- */
    function setKey(a, key, dur) {
      if (a.key === key) return;
      if (a.key && !reduced) { copyPose(POSE_KEYS, a.pose, a.from); a.blend = 0; a.blendDur = dur || BLEND.dflt; }
      else a.blend = 1;                                          /* still mode: poses cut, never drift */
      if ((a.key === 'perf:hop' || a.key === 'perf:bounce') && key === 'loco') a.landT = brain ? brain.now : 0;
      a.key = key; a.cueN = -1;
    }
    function resetOpts(o, red) {
      o.reduced = red; o.speed = undefined; o.bpm = undefined; o.rate = undefined; o.intensity = undefined;
      o.dur = undefined; o.height = undefined; o.ground = undefined;
    }
    /* idle → walk → run by speed (one continuous key, so no crossfade is needed) */
    function locomotion(a, p, pose) {
      var o = a.o;
      P.sampleClip('idle', a.idleT, a.base, o);
      if (p.speed > 0.01 && !o.reduced) {
        var run = p.cruise > 1.6;
        o.speed = run ? p.cruise : WALK.speed;
        P.sampleClip(run ? 'run' : 'walk', a.gaitT, a.tmp, o);
        o.speed = undefined;
        P.mixPose(a.base, a.tmp, smooth01(p.speed / Math.max(0.25, p.cruise * 0.6)), pose);
      } else copyPose(POSE_KEYS, a.base, pose);
    }
    function lerpKeys(pose, k, vals) { for (var key in vals) pose[key] = lerp(pose[key], vals[key], k); }
    var NAP = { pitch: 0, y: -0.1, sy: 0.86, sx: 1.06, sz: 1.04, legFL: 70, legFR: 70, legBL: -70, legBR: -70, headPitch: 22, headRoll: 10, eye: 0.06, earL: 28, earR: 28, tailYaw: 0, tailPitch: -5 };
    var ROLL_LEGS = { legFL: 55, legFR: 55, legBL: -50, legBR: -50 };
    var ACT_KEY = {};                                            /* 'act:<name>' strings, built once (no per-frame concat) */
    function actPose(a, p, pose, red) {
      var o = a.o, t = brain.now - p.actT0, d = Math.max(0.1, p.actDur), u = clamp01(t / d), e;
      switch (p.action) {
        case 'sit': P.sampleClip('sit', a.idleT, pose, o); break;
        case 'scratch':
          P.sampleClip('sit', a.idleT, pose, o);
          e = env(t, d, 0.25, 0.25);
          pose.legBR = lerp(pose.legBR, 35 + (red ? 0 : 22 * Math.sin(TAU * 2 * t)), e);
          pose.headRoll += 16 * e * a.sign; pose.headYaw -= 14 * e * a.sign; pose.roll += 6 * e * a.sign;
          pose.eye = Math.min(pose.eye, 1 - 0.55 * e);
          break;
        case 'sniff':
          P.sampleClip('idle', a.idleT, pose, o);
          e = env(t, d, 0.3, 0.3);
          pose.headPitch += (28 + (red ? 0 : 4 * Math.sin(TAU * 1.8 * t))) * e;
          pose.neck += 12 * e; pose.earBack += 8 * e; pose.y -= 0.01 * e; pose.tailPitch += 10 * e;
          break;
        case 'look': case 'lookAvatar': case 'turn': case 'emote':
          P.sampleClip('idle', a.idleT, pose, o);
          e = env(t, d, 0.3, 0.35);
          if (p.action === 'look') { pose.headPitch -= 8 * e; pose.headRoll += 10 * e * a.sign; }
          if (p.action === 'lookAvatar') pose.headRoll += 6 * e * a.sign;
          break;
        case 'roll':
          P.sampleClip('idle', a.idleT, pose, o);
          var lie = smooth01(u / 0.18) * (1 - smooth01((u - 0.8) / 0.2));
          pose.roll += 360 * inOut((u - 0.18) / 0.62) * a.sign;
          pose.y -= 0.07 * lie; pose.sy *= 1 - 0.12 * lie;
          lerpKeys(pose, lie, ROLL_LEGS);
          pose.eye = 1 - 0.5 * lie;
          break;
        case 'nap':
          P.sampleClip('idle', a.idleT, pose, o);
          e = env(t, d, 0.6, 0.6);
          lerpKeys(pose, e, NAP);
          if (a.species === 'pet_dragon') { pose.wingL = lerp(pose.wingL, 10, e); pose.wingR = lerp(pose.wingR, 10, e); }
          if (!red) { pose.sy += 0.025 * Math.sin(TAU * 0.28 * t) * e; pose.tailYaw += 6 * Math.sin(TAU * 0.2 * t) * e; }
          break;
        case 'chase':                                             /* puppy: two spins after its tail */
          P.sampleClip('idle', a.idleT, a.base, o);
          o.speed = WALK.speed; P.sampleClip('walk', a.gaitT, a.tmp, o); o.speed = undefined;
          e = env(t, d, 0.2, 0.25);
          P.mixPose(a.base, a.tmp, 0.85 * e, pose);
          pose.yaw += 720 * inOut(u) * a.sign;
          pose.headYaw += 25 * e * a.sign; pose.tailYaw += 30 * e * a.sign;
          break;
        case 'pounce':                                            /* kitten: crouch, wiggle, leap, land */
          P.sampleClip('idle', a.idleT, pose, o);
          if (t < 0.35) {
            var c = smooth01(t / 0.3);
            pose.sy *= 1 - 0.1 * c; pose.pitch += 6 * c; pose.headPitch -= 4 * c; pose.eye = 1 + 0.12 * c;
            pose.legFL += 15 * c; pose.legFR += 15 * c; pose.legBL -= 15 * c; pose.legBR -= 15 * c;
            pose.tailYaw = 12 * Math.sin(TAU * 3 * t); pose.hips = 5 * Math.sin(TAU * 1.5 * t);
          } else if (t < 0.7) {
            var v = (t - 0.35) / 0.35, s = Math.sin(PI * v);
            pose.y += 0.14 * arc(v); pose.pitch -= 10 * s;
            pose.legFL = pose.legFR = 70 * s; pose.legBL = pose.legBR = -50 * s; pose.earBack = 15;
          } else {
            var w = clamp01((t - 0.7) / 0.3);
            pose.sy *= 1 - 0.1 * Math.sin(PI * w); pose.sx *= 1 + 0.05 * Math.sin(PI * w); pose.sz = pose.sx;
          }
          break;
        case 'binky':                                             /* bunny: a twisting joy-hop */
          P.sampleClip('idle', a.idleT, pose, o);
          pose.y += 0.24 * arc(u); pose.yaw += 35 * Math.sin(TAU * u) * a.sign; pose.roll += 18 * Math.sin(TAU * u);
          pose.legBL = pose.legBR = -60 * Math.sin(PI * u); pose.legFL = pose.legFR = 30 * Math.sin(PI * u);
          pose.earL -= 20 * Math.sin(PI * u); pose.earR -= 20 * Math.sin(PI * u);
          break;
        case 'loop':                                              /* dragon: a little loop-the-loop and a sparkle */
          P.sampleClip('idle', a.idleT, pose, o);
          pose.y += 0.22 * Math.sin(PI * u);
          pose.pitch -= 360 * inOut((u - 0.2) / 0.6);
          if (!red) { pose.wingL = pose.wingR = 20 + 40 * Math.sin(TAU * 3 * t); }
          if (u >= 0.5 && a.cueN < 0) { a.cueN = 0; sparkles(p.x, p.y + 0.6, p.z, 6, EMOTE.rainbow, 0.6); }
          break;
        default: P.sampleClip('idle', a.idleT, pose, o);
      }
    }
    function perfPose(a, p, pose) {
      var o = a.o, pf = p.perf, now = brain.now;
      if (p.perfPhase === 'hopOn' || p.perfPhase === 'hopOff') {
        var dur = p.perfPhase === 'hopOn' ? (pf.kind === 'bench' ? HOP.benchOn : HOP.on) : HOP.off;
        var t = now - pf.hopT0, u = clamp01(t / dur);
        o.dur = dur;
        P.sampleClip('jump', t, a.base, o);
        P.sampleClip('fall', t, a.tmp, o);
        o.dur = undefined;
        P.mixPose(a.base, a.tmp, smooth01((u - 0.4) / 0.5), pose);
        pose.y = 0;                                             /* the brain owns the arc */
      } else if (p.perfPhase === 'bounce') {
        var vy = (p.bounce - (a.lastBounce == null ? p.bounce : a.lastBounce)) / Math.max(1e-3, a.dt);
        a.lastBounce = p.bounce;
        P.sampleClip('jump', 0.3, a.base, o);                   /* rising: tucked */
        P.sampleClip('fall', a.idleT, a.tmp, o);                 /* falling: paws reach for the mat */
        P.mixPose(a.base, a.tmp, smooth01((1 - vy / 3) / 2), pose);
        pose.y = 0;
        if (p.bounce < 0) {                                      /* sink with the mat */
          var q = clamp01(-p.bounce / 0.12);
          pose.sy *= 1 - 0.16 * q; pose.sx *= 1 + 0.07 * q; pose.sz *= 1 + 0.07 * q;
        }
        if (p.flip > 0) pose.pitch += 360 * inOut(p.flip);       /* the front flip on the last bounce */
      } else if (p.perfPhase === 'sit') {
        P.sampleClip('sit', a.idleT, pose, o);
      } else locomotion(a, p, pose);
    }

    function updatePet(a, p, dt) {
      var rig = a.rig;
      if (!rig) return;
      var red = reduced, o = a.o, pose = a.pose, now = brain.now;
      resetOpts(o, red);
      a.dt = dt;
      a.idleT += dt;
      if (p.speed > 0.01) a.gaitT += dt;
      /* which behaviour (crossfaded on change) */
      var key, bd = BLEND.dflt;
      if (p.state === 'sit') { key = 'edit'; bd = BLEND.edit; }
      else if (p.state === 'dance') key = now >= brain.danceT0 ? 'dance' : 'loco';
      else if (p.state === 'perform') key = p.perfPhase === 'run' ? 'loco' : p.perfPhase === 'bounce' ? 'perf:bounce' : p.perfPhase === 'sit' ? 'perf:sit' : 'perf:hop';
      else if (!red && now - p.tapT < 0.45) { key = 'hop'; bd = BLEND.hop; }
      else if (p.state === 'act') { key = ACT_KEY[p.action] || (ACT_KEY[p.action] = 'act:' + p.action); bd = BLEND.act; }
      else key = 'loco';
      setKey(a, key, bd);
      if (key !== 'perf:bounce') a.lastBounce = null;

      if (key === 'edit') { o.reduced = true; P.sampleClip('sit', 0, pose, o); o.reduced = red; }
      else if (key === 'loco') locomotion(a, p, pose);
      else if (key === 'hop') P.sampleClip('hop', now - p.tapT, pose, o);
      else if (key === 'dance') {
        o.bpm = DANCE.bpm;
        var td = now - brain.danceT0;
        P.sampleClip('dance', brain.danceReduced ? td : Math.min(td, DANCE.dur - 1e-3), pose, o);
        o.bpm = undefined;
      } else if (key.charAt(0) === 'p') perfPose(a, p, pose);
      else actPose(a, p, pose, red);

      /* happy tail (after a tap, at Showtime, while dancing) — tails may beat faster than 2 Hz */
      var sp = P.SPECIES && P.SPECIES[a.species];
      var wantHappy = !red && sp && key !== 'edit' && key !== 'perf:sit' && key !== 'act:nap' && (now < p.happyUntil || showK > 0.5) ? 1 : 0;
      a.happyK += (wantHappy - a.happyK) * clamp01(dt * 4);
      if (a.happyK > 0.01 && sp && key !== 'dance') {
        var hz = sp.happyHz, amp = sp.tailAmp * 1.3, ph = TAU * hz * a.idleT;
        pose.tailYaw = lerp(pose.tailYaw, amp * Math.sin(ph), a.happyK);
        pose.tailPitch = lerp(pose.tailPitch, 18, a.happyK);
      }
      /* head look-at (avatar, an item) */
      a.lookKs += (p.lookK - a.lookKs) * clamp01(dt * 5);
      if (a.lookKs > 0.01) {
        var rel = wrap(Math.atan2(p.lookX - p.x, p.lookZ - p.z) - a.yawShown) / DEG;
        pose.headYaw += clamp(rel, -55, 55) * a.lookKs;
      }
      /* secondary motion: lean into turns, the head leads, tail and ears lag, a nod on speed-ups */
      if (!red && key !== 'dance' && key !== 'edit') {
        var kk = clamp01(dt * 8);
        a.omegaS += (p.omega - a.omegaS) * kk;
        var acc = dt > 0 ? (p.speed - a.lastSpeed) / dt : 0;
        a.accS += (acc - a.accS) * kk;
        var w = a.omegaS;
        pose.roll += clamp(-w * p.speed * 7, -12, 12);
        pose.headYaw += clamp(w * 6, -18, 18);
        pose.tailYaw += clamp(-w * 10, -25, 25);
        pose.earL += clamp(w * 5, -12, 12); pose.earR -= clamp(w * 5, -12, 12);
        pose.pitch += clamp(a.accS * 2, -6, 6);
      }
      a.lastSpeed = p.speed;
      /* the crossfade between behaviours */
      if (a.blend < 1) {
        a.blend = Math.min(1, a.blend + dt / a.blendDur);
        P.mixPose(a.from, pose, smooth01(a.blend), pose);
      }
      /* a little squash on landing from a hop-off or a bounce */
      var ls = brain.now - a.landT;
      if (!red && ls >= 0 && ls < 0.18) { var s = Math.sin(PI * ls / 0.18); pose.sy *= 1 - 0.1 * s; pose.sx *= 1 + 0.05 * s; pose.sz *= 1 + 0.05 * s; }
      if (a.crown && P.crownGlint) pose.glint = Math.max(pose.glint || 0, P.crownGlint(a.idleT, (a.seed % 1000) / 1000, red));
      pose.wave = red || key === 'edit' ? 0 : a.idleT;           /* one continuous cloth clock (frozen when still) */
      rig.setPose(pose);
      /* the root: brain position, body yaw (+ the clip's 'face the camera' hint, eased) */
      a.fcS += (clamp01(num(pose.faceCam, 0)) - a.fcS) * (red ? 1 : clamp01(dt * 8));
      var yaw = p.yaw;
      if (a.fcS > 0.001) yaw = p.yaw + wrap(yawToCam(p.x, p.z) - p.yaw) * a.fcS;
      a.yawShown = yaw;
      rig.root.position.set(p.x, p.y, p.z);
      rig.root.rotation.set(0, yaw, 0);
      /* anchors, hit sphere, blob shadow */
      var lift = num(pose.y, 0), top = (TOP_Y[a.species] || 0.72) * num(pose.sy, 1);
      a.ax = p.x; a.ay = p.y + lift + top; a.az = p.z;
      var h = a.hit; h.x = p.x; h.y = p.y + lift + 0.3; h.z = p.z; h.pickable = mode === 'play';
      if (blobs && a.blob >= 0) {
        var gy = groundUnder(p), hgt = Math.max(0, p.y + lift - gy), sc = BLOB.pet * (1 - BLOB.shrink * clamp01(hgt / BLOB.lift));
        blobs.set(a.blob, p.x, gy, p.z, sc, sc * 0.85);
      }
    }
    function groundUnder(p) {
      var B = root.SLPetBrain || opts.Brain, g = brain && brain.graph;
      if (p.state === 'perform' && (p.onSeat || p.perfPhase === 'hopOn' || p.perfPhase === 'hopOff') && p.perf) {
        var pf = p.perf, k = p.onSeat ? 1 : p.hop;
        var gx = B && g ? B.heightAt(g, p.x, p.z) : 0;
        return lerp(gx, pf.sy, smooth01(k));
      }
      return B && g ? B.heightAt(g, p.x, p.z) : 0;
    }

    /* ---------- dance cues: the dragon's sparkle puff, the burst + finger-hearts, 'cheer' ---------- */
    function danceCues() {
      if (!brain) return;
      if (!brain.danceOn) { danceWasOn = false; return; }
      if (!danceWasOn || danceSeen !== brain.danceT0) {
        danceWasOn = true; danceSeen = brain.danceT0; danceCue = 0;
        if (brain.danceReduced) {                                 /* reduced: one group pose with a sparkle fade */
          actors.forEach(function (a) { if (a.rig) sparkles(a.ax, a.ay - 0.2, a.az, 5, EMOTE.colors.sparkle, 0.8); });
          if (avatar) sparkles(avatar.x, avatar.y + 0.8, avatar.z, 5, EMOTE.colors.sparkle, 0.8);
          danceCue = 9;
        }
      }
      if (brain.danceReduced) return;
      var t = brain.now - brain.danceT0, beat = DANCE.beat;
      if (danceCue === 0 && t >= 4 * beat) {
        danceCue = 1;
        actors.forEach(function (a) { if (a.species === 'pet_dragon' && a.rig) sparkles(a.ax, a.ay - 0.15, a.az, 8, EMOTE.rainbow, 0.8); });
      }
      if (danceCue === 1 && t >= 7 * beat) {
        danceCue = 2;
        /* count 8: finger-hearts and a sparkle burst, sized to fit the 32-sprite pool */
        var n = Math.max(3, Math.floor(FX_CAP / (actors.length + (avatar ? 1 : 0)) - 1));
        n = Math.min(6, n);
        actors.forEach(function (a) { if (a.rig) { emoteSprite(a, 'heart', 0); sparkles(a.ax, a.ay - 0.1, a.az, n, EMOTE.rainbow, 1); } });
        if (avatar) { emoteSprite(avatar, 'heart', -0.08); sparkles(avatar.x, avatar.y + 0.9, avatar.z, n, EMOTE.rainbow, 1); }
      }
      if (danceCue === 2 && t >= DANCE.dur) { danceCue = 3; sfx('cheer', 0, 0.8); }
    }

    /* ================================================================
       THE AVATAR
       ================================================================ */
    function syncAvatar() {
      var key = avatarKeyOf(avatarInfo);
      if (avatar && (!avatarInfo || !avatarSpot || avatar.key !== key)) dropAvatar();
      if (!avatarInfo || !avatarSpot || avatar) { if (avatar) placeAvatar(); return; }
      var rig = null, emoji = avatarInfo.emoji || avatarInfo.avatar || '';
      try { if (typeof SL3D.makeAvatar === 'function') rig = SL3D.makeAvatar({ color: avatarInfo.color, emoji: emoji }, tier); } catch (e) { rig = null; }
      if (!rig) { try { rig = placeholderAvatar(K, avatarInfo.color); } catch (e2) { rig = null; } }
      if (!rig) return;
      group.add(rig.root);
      avatar = {
        rig: rig, key: key, x: 0, y: 0, z: 0, yaw: 0, ax: 0, ay: 0, az: 0, gone: false,
        pose: P.restAvatar({}), from: P.restAvatar({}), blend: 1, blendDur: BLEND.dflt, akey: '',
        idleT: 0, tapT: -99, tapKind: '', heartShown: true, seed: hash('avatar:' + key) >>> 0, wand: false,
        blob: blobs ? blobs.alloc() : -1,
        hit: { kind: 'me', id: 'me', x: 0, y: 0, z: 0, r: HIT_R, pickable: true },
        o: { reduced: false, seed: hash('avatar') >>> 0, phase: (hash(key) % 997) / 997, bpm: undefined }
      };
      if (typeof rig.setShow === 'function') rig.setShow(showK);
      setWand(showK > 0.5);
      placeAvatar();
    }
    function placeAvatar() {
      if (!avatar || !avatarSpot) return;
      avatar.x = avatarSpot.x; avatar.y = num(avatarSpot.y, 0); avatar.z = avatarSpot.z;
    }
    function dropAvatar() {
      if (!avatar) return;
      avatar.gone = true;
      try { avatar.rig.dispose(); } catch (e) { /* ignore */ }
      if (blobs && avatar.blob >= 0) blobs.free(avatar.blob);
      avatar = null;
    }
    function setWand(on) {
      if (!avatar || avatar.wand === on) return;
      avatar.wand = on;
      if (typeof avatar.rig.setWand === 'function') avatar.rig.setWand(on);
    }
    function avSetKey(k, dur) {
      if (avatar.akey === k) return;
      if (avatar.akey && !reduced) { copyPose(AV_KEYS, avatar.pose, avatar.from); avatar.blend = 0; avatar.blendDur = dur || BLEND.dflt; }
      else avatar.blend = 1;
      avatar.akey = k;
    }
    /* the continuous beat count (music clock, else our own 118 BPM clock) */
    function beatCount() {
      var c = readClock(false);
      return c && c.perBar ? c.beat : now * DANCE.bpm / 60;
    }
    function updateAvatar(dt) {
      if (!avatar) return;
      var A = avatar, rig = A.rig, o = A.o, pose = A.pose, red = reduced, bt = brain ? brain.now : now;
      o.reduced = red; o.bpm = undefined;
      A.idleT += dt;
      var tap = bt - A.tapT, dancing = brain && brain.danceOn && bt >= brain.danceT0, k;
      if (dancing) k = 'dance';
      else if (tap >= 0 && tap < AV_TAP.wave + AV_TAP.heart && A.tapKind) k = A.tapKind === 'cheer' ? 'cheer' : tap < AV_TAP.wave && A.tapKind === 'wave' ? 'wave' : 'heart';
      else k = showK > 0.5 ? 'show' : 'idle';
      avSetKey(k, k === 'heart' ? 0.15 : BLEND.dflt);
      if (k === 'heart' && !A.heartShown) {                          /* the finger-heart: a pink heart + 'pop' */
        A.heartShown = true;
        emoteSprite(A, 'heart', -0.06);
        sfx('pop', A.x, 0.8);
      }
      if (k === 'dance') {
        o.bpm = DANCE.bpm;
        var td = bt - brain.danceT0;
        P.sampleAvatar('dance', brain.danceReduced ? td : Math.min(td, DANCE.dur - 1e-3), pose, o);
      } else if (k === 'wave') P.sampleAvatar('wave', tap, pose, o);
      else if (k === 'cheer') P.sampleAvatar('cheer', tap, pose, o);
      else if (k === 'heart') { o.reduced = true; P.sampleAvatar('dance', 0, pose, o); o.reduced = red; }   /* = the finger-heart pose */
      else {
        P.sampleAvatar('idle', A.idleT, pose, o);
        if (!red && brain && brain.pets.length) {                   /* the glance goes to a real pet */
          brain.glance(_glance);
          var q = brain.pets[Math.min(brain.pets.length - 1, Math.floor(_glance.pick * brain.pets.length))];
          var rel = wrap(Math.atan2(q.x - A.x, q.z - A.z) - A.yaw) / DEG;
          pose.headYaw = clamp(rel, -50, 50) * _glance.k;
        }
        if (k === 'show') {                                          /* the wand up, swaying once per two beats (≤ 1 Hz) */
          var sw = red ? 0 : Math.sin(PI * beatCount());
          pose.armR = 118 + 14 * sw; pose.armRf = 12; pose.headRoll = 3 + 3 * sw;
        }
      }
      if (A.blend < 1) { A.blend = Math.min(1, A.blend + dt / A.blendDur); mixAv(P, A.from, pose, smooth01(A.blend), pose); }
      setWand(showK > 0.5 || dancing);
      rig.setPose(pose);
      var face = clamp(wrap(yawToCam(A.x, A.z)), -0.5, 0.5);
      A.yaw = face;
      rig.root.position.set(A.x, A.y, A.z);
      rig.root.rotation.set(0, face, 0);
      A.ax = A.x; A.ay = A.y + num(pose.y, 0) + AV_TOP; A.az = A.z;
      var h = A.hit; h.x = A.x; h.y = A.y + AV_HIT_Y + num(pose.y, 0); h.z = A.z; h.pickable = mode === 'play';
      if (blobs && A.blob >= 0) {
        var sc = BLOB.avatar * (1 - BLOB.shrink * clamp01(Math.max(0, num(pose.y, 0)) / BLOB.lift));
        blobs.set(A.blob, A.x, A.y, A.z, sc, sc * 0.85);
      }
    }
    /* 'wave' (then the finger-heart), 'heart' (straight to the finger-heart) or 'cheer' */
    function avatarTap(kind) {
      if (!avatar) return false;
      var bt = brain ? brain.now : now;
      avatar.tapT = bt; avatar.tapKind = kind || 'wave'; avatar.heartShown = kind === 'cheer';
      if (reduced) poseAll(0);
      return true;
    }

    /* ================================================================
       FRAME
       ================================================================ */
    /* the music's beat clock → {beat, bpm, perBar} | null. A number < 1 is only a beat
       fraction (align to beats); a count or SLMusic.clock() aligns the dance to bars. */
    var _clk = { beat: 0, bpm: 118, perBar: true };
    function readClock(askMusic) {
      var c = lastBeat, M = root.SLMusic;
      /* SLMusic.clock() allocates, so it is only asked at a dance start, never per frame */
      if (c == null && askMusic && M && typeof M.clock === 'function') { try { c = M.clock(); } catch (e) { c = null; } }
      if (typeof c === 'number' && isFinite(c)) { _clk.beat = c; _clk.bpm = DANCE.bpm; _clk.perBar = c >= 1; return _clk; }
      if (c && typeof c === 'object' && isFinite(c.beat) && c.bpm > 0) { _clk.beat = c.beat; _clk.bpm = c.bpm; _clk.perBar = true; return _clk; }
      return null;
    }
    function poseAll(dt) {
      if (!brain) return;
      for (var i = 0; i < brain.pets.length; i++) {
        var p = brain.pets[i], a = byId[p.id];
        if (a) updatePet(a, p, dt);
      }
      updateAvatar(dt);
      if (blobs) blobs.commit();
    }
    function update(dt, t, show, beat) {
      if (disposed) return false;
      dt = clamp(num(dt, 0), 0, 0.1);
      now += dt; fxNow += dt;
      if (typeof show === 'number') setShow(show);
      lastBeat = beat == null ? null : beat;
      if (!brain) { updateAvatar(dt); if (blobs) blobs.commit(); return updateFx(dt) || !reduced; }
      var c = camPos(), cx = c.x, cz = c.z;
      brain.camYaw = Math.atan2(cx, cz);
      var moving = brain.step(dt);
      drainEvents();
      poseAll(dt);
      danceCues();
      var fxLive = updateFx(dt);
      if (!reduced) return true;
      var blending = false;
      for (var i = 0; i < actors.length; i++) if (actors[i].blend < 1) blending = true;
      if (avatar && avatar.blend < 1) blending = true;
      return moving || fxLive || blending;
    }

    /* ================================================================
       PUBLIC
       ================================================================ */
    function petIdOf(target) {
      if (typeof target !== 'string') return null;
      var id = target.indexOf('pet:') === 0 ? target.slice(4) : target;
      return byId[id] ? id : null;
    }
    function isMe(target) { return target === 'me' || target === 'avatar' || target === 'you'; }
    function tap(target) {
      if (disposed) return false;
      if (isMe(target)) return avatarTap('wave');
      var id = petIdOf(target), a = id && byId[id], p = brain && brain.pet(id);
      if (!a || !p) return false;
      var kind = brain.tap(id) || 'heart';
      if (kind === 'sparkle') sparkles(p.x, p.y + 0.55, p.z + 0.15, 9, EMOTE.rainbow, 0.7);   /* the dragon: rainbow sparkles, never fire */
      else emoteSprite(a, kind, 0);
      if (opts.voice !== false) voice(id, p.x);
      if (reduced) poseAll(0);
      return true;
    }
    function emote(target, kind) {
      if (disposed) return false;
      kind = kind || 'heart';
      if (target === 'all' || target === 'pets') {
        var any = false;
        actors.forEach(function (a) { any = emote('pet:' + a.id, kind) || any; });
        if (target === 'all' && avatar) any = emote('me', kind === 'hop' || kind === 'happy' ? 'heart' : kind) || any;
        return any;
      }
      if (isMe(target)) {
        if (!avatar) return false;
        if (kind === 'wave' || kind === 'fingerHeart' || kind === 'cheer') return avatarTap(kind === 'fingerHeart' ? 'heart' : kind);
        emoteSprite(avatar, EMOTE.cells[kind] != null ? kind : 'heart', -0.06);
        return true;
      }
      var id = petIdOf(target), a = id && byId[id], p = brain && brain.pet(id);
      if (!a || !p) return false;
      if (kind === 'hop' || kind === 'happy') {
        var k2 = brain.tap(id);
        if (kind === 'happy') emoteSprite(a, 'heart', 0);
        else if (k2 === 'sparkle') sparkles(p.x, p.y + 0.55, p.z + 0.15, 7, EMOTE.rainbow, 0.6);
        return true;
      }
      if (kind === 'rainbow' || kind === 'sparkle') { sparkles(p.x, p.y + 0.55, p.z, 8, kind === 'rainbow' ? EMOTE.rainbow : EMOTE.colors.sparkle, 0.7); return true; }
      emoteSprite(a, EMOTE.cells[kind] != null ? kind : 'heart', 0);
      p.happyUntil = Math.max(p.happyUntil, brain.now + 1.5);
      return true;
    }
    function dance(on) {
      if (disposed || !brain) return 0;
      if (!on) { brain.dance(false); return 0; }
      var c = readClock(true);
      return brain.dance(true, c ? { beat: c.beat, bpm: c.bpm, perBar: c.perBar } : {});
    }
    function setShow(k) {
      k = clamp01(num(k, 0));
      if (Math.abs(k - showK) < 1e-4) return;
      showK = k;
      if (brain) brain.setShow(k);
      actors.forEach(function (a) { if (a.rig && typeof a.rig.setShow === 'function') a.rig.setShow(k); });
      if (avatar) { if (typeof avatar.rig.setShow === 'function') avatar.rig.setShow(k); setWand(k > 0.5); }
    }
    function setReduced(on) {
      reduced = !!on;
      if (brain) brain.setReduced(reduced);
      poseAll(0);
    }
    function setMode(m) {
      mode = m === 'edit' || m === 'place' ? m : 'play';
      if (brain) brain.setMode(mode);
      if (reduced) poseAll(0);
    }
    function active() {
      if (!brain || mode !== 'play') return null;
      return brain.activeId();
    }
    function perform(kind, uid) {
      if (disposed || !brain) return -1;
      var lead = brain.perform(kind, uid);
      return typeof lead === 'number' && isFinite(lead) ? lead : -1;
    }
    function hits(out) {
      out = out || _hits;
      out.length = 0;
      for (var i = 0; i < actors.length; i++) if (actors[i].rig) out.push(actors[i].hit);
      if (avatar) out.push(avatar.hit);
      return out;
    }
    function anchorOf(target, out) {
      out = out || {};
      var a = isMe(target) ? avatar : byId[petIdOf(target)];
      if (!a) return null;
      out.x = a.ax; out.y = a.ay; out.z = a.az;
      return out;
    }
    function info() {
      var calls = 0, tris = 0;
      function count(rig) {
        if (!rig) return;
        if (rig.meshes) for (var k in rig.meshes) if (rig.meshes[k] && rig.meshes[k].visible !== false) calls++;
        tris += num(rig.tris, 0);
      }
      actors.forEach(function (a) { count(a.rig); });
      if (avatar) count(avatar.rig);
      if (blobs) calls++;
      if (fxPool) calls++;
      return { pets: actors.length, avatar: !!avatar, calls: calls, tris: Math.round(tris), mode: mode, reduced: reduced, show: showK, dance: !!(brain && brain.danceOn) };
    }
    function dispose() {
      if (disposed) return;
      disposed = true;
      actors.forEach(dropActor);
      actors.length = 0;
      for (var k in byId) delete byId[k];
      dropAvatar();
      for (var i = 0; i < fx.length; i++) fx[i].on = false;
      if (fxPool) fxPool.dispose();
      if (blobs) blobs.dispose();
      if (group.parent) group.parent.remove(group);
      if (typeof group.clear === 'function') group.clear();
    }

    var api = {
      version: VERSION, group: group, brain: brain,
      sync: sync, update: update, perform: perform, active: active, tap: tap, emote: emote, dance: dance,
      setShow: setShow, setReduced: setReduced, setMode: setMode,
      setCamera: function (cam) { camera = cam || null; },
      hits: hits, anchorOf: anchorOf, info: info, dispose: dispose,
      petsApi: { active: function () { return active(); }, perform: function (kind, uid) { return perform(kind, uid); } }
    };
    if (opts.camera) camera = opts.camera;
    return api;
  }

  function register(SL3D) {
    if (!SL3D || typeof SL3D.defineApi !== 'function' || SL3D.__slActors) return false;
    SL3D.__slActors = true;
    SL3D.defineApi('makeActors', function (K, S) { return function (opts) { return create(K, S, opts); }; });
    return true;
  }

  return {
    VERSION: VERSION, create: create, register: register,
    TOP_Y: TOP_Y, BLOB: BLOB, BLEND: BLEND, EMOTE: EMOTE, HIT_R: HIT_R, FX_CAP: FX_CAP
  };
}));
