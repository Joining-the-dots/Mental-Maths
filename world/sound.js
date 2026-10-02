/* ================================================================
   My Island — the named sound set (window.SLSound).
   The shell's makeSound recipes (world/games/shell.js) lifted out so the
   island and the games share one set, plus synthesised pet voices and a
   subtle stereo pan by island x. Everything plays through the app's own
   synth rack and warm SFX bus (index.html: getAudioCtx, _sfxBus, _beep,
   _slide, _pluck, _bell, _thump, _tap, _swell, playSfx, slSample) and
   respects the app's mute. Big moments duck the music (SLMusic.duck).

     var sound = SLSound.make(cfg);       cfg.muted() optional
     sound(name, vol, step, pan)          pan -1..1 (island: panFor(x, w))
     sound.at(x, width)(name, vol, step)  the same, panned by island x
     sound.pet(petId, vol, pan)           pet_puppy|kitten|bunny|dragon

   Classic UMD: window.SLSound in the browser, module.exports in Node
   (where create(fakeGlobal) builds an instance against stubs).
   ================================================================ */
(function (root, factory) {
  var S = factory();
  if (typeof module === 'object' && module.exports) module.exports = S;
  if (typeof window !== 'undefined') window.SLSound = S;
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---- the shell's tables, copied verbatim ---- */
  var SCALE = [523, 587, 659, 784, 880, 1047, 1175, 1319, 1568, 1760];
  var SAMPLE_FILES = { right: 1, wrong: 1, fanfare: 1, sting: 1, chip: 1, coins: 1, unlock: 1, applause: 1, heartbeat: 1 };
  var DUCK = { fanfare: 1, tada: 1, applause: 1, sting: 1, cheer: 1, unlock: 1 };
  var APP_SFX = { correct: 1, wrong: 1, unlock: 1, fanfare: 1, tick: 1 };

  /* every name sound() understands (shell set + pet voices) */
  var NAMES = ['right', 'wrong', 'fanfare', 'sting', 'chip', 'coins', 'unlock', 'applause', 'heartbeat',
    'correct', 'tick',
    'jump', 'coin', 'bump', 'kick', 'beep', 'go', 'check', 'pop', 'boing', 'crash', 'oof', 'powerup', 'combo',
    'whoosh', 'boost', 'miss', 'star', 'shield', 'whistle', 'save', 'skid', 'cheer', 'tada',
    'yip', 'mew', 'thump', 'trill', 'voice'];
  var PET_VOICE = { pet_puppy: 'yip', pet_kitten: 'mew', pet_bunny: 'thump', pet_dragon: 'trill' };
  var VOICE_STEPS = ['yip', 'mew', 'thump', 'trill'];      /* 'voice' with step 0-3 */

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  /* art bible: pan = (x / width - 0.5) x 0.6 — subtle, never hard-left/right */
  function panFor(x, width) {
    var w = +width, px = +x;
    if (!(w > 0) || !isFinite(px)) return 0;
    return Math.round((clamp(px / w, 0, 1) - 0.5) * 0.6 * 1000) / 1000;
  }
  function petVoice(petId) { return PET_VOICE[petId] || 'yip'; }

  /* build an instance that looks its helpers up on `g` (window in the browser) */
  function create(g) {
    g = g || {};
    function has(f) { return typeof g[f] === 'function'; }
    function globalMuted() {
      try {
        var u = has('currentUser') ? g.currentUser() : (has('ensureUser') ? g.ensureUser() : null);
        return !!(u && u.muted);
      } catch (e) { return false; }
    }
    function duckMusic() {
      var M = g.SLMusic;
      if (M && typeof M.duck === 'function') { try { M.duck(0.4, 350); } catch (e) {} }
    }

    /* ---- stereo pan: helpers look their bus up via _sfxBus(ctx), which returns
       ctx._slBus, so for the length of one synchronous call we point that at a
       StereoPanner feeding the real bus (echo send left as is), then restore it. */
    function pannerFor(ctx, real, pan) {
      var cache = ctx._slPanners || (ctx._slPanners = {});
      var key = String(Math.round(clamp(pan, -1, 1) * 20) / 20);       /* 41 positions max */
      if (!cache[key]) {
        var p = ctx.createStereoPanner();
        p.pan.value = +key;
        p.connect(real.input);
        cache[key] = p;
      }
      return cache[key];
    }
    function withPan(ctx, pan, fn) {
      if (!pan || typeof ctx.createStereoPanner !== 'function' || !has('_sfxBus')) return fn();
      var real = g._sfxBus(ctx);
      if (!real || !real.input) return fn();
      var node = pannerFor(ctx, real, pan);
      var had = Object.prototype.hasOwnProperty.call(ctx, '_slBus'), prev = ctx._slBus;
      ctx._slBus = { input: node, echo: real.echo };
      try { return fn(); } finally { if (had) ctx._slBus = prev; else delete ctx._slBus; }
    }
    /* the bus custom voices (mew) connect to; panned while withPan is active */
    function busOf(ctx) {
      if (has('_sfxBus')) { var b = g._sfxBus(ctx); if (b && b.input) return b; }
      return { input: ctx.destination, echo: null };
    }

    /* ---- pet voices (art bible: synthesised, original) ---- */
    function mew(ctx, t, vol) {
      var bus = busOf(ctx);
      var o = ctx.createOscillator(), lfo = ctx.createOscillator(), depth = ctx.createGain(), gn = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(900, t);
      o.frequency.linearRampToValueAtTime(650, t + 0.2);
      lfo.type = 'sine'; lfo.frequency.setValueAtTime(6, t);              /* 6 Hz vibrato */
      depth.gain.setValueAtTime(22, t);
      lfo.connect(depth); depth.connect(o.frequency);
      gn.gain.setValueAtTime(0, t);
      gn.gain.linearRampToValueAtTime(vol, t + 0.02);
      gn.gain.setValueAtTime(vol, t + 0.14);
      gn.gain.exponentialRampToValueAtTime(0.0004, t + 0.2);
      gn.gain.linearRampToValueAtTime(0, t + 0.23);
      o.connect(gn); gn.connect(bus.input); if (bus.echo) gn.connect(bus.echo);
      o.start(t); lfo.start(t); o.stop(t + 0.25); lfo.stop(t + 0.25);
    }

    /* the synth recipes, at an explicit start time t. Returns true if the name
       was handled. The shell set is copied faithfully from shell.js makeSound. */
    function recipe(ctx, name, t, v, step) {
      if (name === 'pop') { if (has('_pluck')) { g._pluck(ctx, 1320, t, { vol: 0.13 * v, dur: 0.22 }); g._pluck(ctx, 1760, t + 0.045, { vol: 0.1 * v, dur: 0.2 }); } else g._beep(ctx, 1320, t, 70, { vol: 0.12 * v }); return true; }
      if (name === 'boing') { if (has('_slide')) g._slide(ctx, 280, 760, t, 170, { wave: 'triangle', vol: 0.11 * v }); return true; }
      if (name === 'crash') { if (has('_thump')) g._thump(ctx, t, { f: 85, vol: 0.34 * v }); if (has('_tap')) { g._tap(ctx, t, { vol: 0.2 * v, f: 520 }); g._tap(ctx, t + 0.05, { vol: 0.14 * v, f: 340 }); } return true; }
      if (name === 'oof') { if (has('_slide')) g._slide(ctx, 440, 150, t, 280, { wave: 'triangle', vol: 0.16 * v }); if (has('_thump')) g._thump(ctx, t, { f: 110, vol: 0.2 * v }); return true; }
      if (name === 'powerup' || name === 'tada') { var notes = name === 'tada' ? [784, 988, 1175, 1568] : [659, 880, 1047, 1319]; notes.forEach(function (f, i) { if (has('_bell')) g._bell(ctx, f, t + i * 0.07, { vol: 0.09 * v, dur: 0.6 }); }); return true; }
      if (name === 'combo') { var k = Math.max(0, Math.min(SCALE.length - 1, step | 0)); if (has('_pluck')) { g._pluck(ctx, SCALE[k], t, { vol: 0.15 * v, dur: 0.3 }); g._pluck(ctx, SCALE[k] * 1.5, t + 0.05, { vol: 0.08 * v, dur: 0.25 }); } return true; }
      if (name === 'whoosh') { if (has('_swell')) g._swell(ctx, t, 0.32, { vol: 0.11 * v }); return true; }
      if (name === 'boost') { if (has('_swell')) g._swell(ctx, t, 0.45, { vol: 0.12 * v }); if (has('_slide')) g._slide(ctx, 180, 900, t, 420, { wave: 'sawtooth', vol: 0.05 * v }); return true; }
      if (name === 'miss') { if (has('_pluck')) { g._pluck(ctx, 220, t, { vol: 0.17 * v, dur: 0.4 }); g._pluck(ctx, 175, t + 0.13, { vol: 0.15 * v, dur: 0.45 }); } return true; }
      if (name === 'star') { if (has('_bell')) { g._bell(ctx, 1568, t, { vol: 0.08 * v, dur: 0.5 }); g._bell(ctx, 2093, t + 0.06, { vol: 0.07 * v, dur: 0.5 }); } return true; }
      if (name === 'shield') { if (has('_bell')) g._bell(ctx, 660, t, { vol: 0.1 * v, dur: 0.7 }); if (has('_slide')) g._slide(ctx, 500, 1000, t, 220, { wave: 'sine', vol: 0.06 * v }); return true; }
      if (name === 'whistle') { if (has('_slide')) { g._slide(ctx, 2100, 2350, t, 140, { wave: 'sine', vol: 0.08 * v }); g._slide(ctx, 2100, 2350, t + 0.2, 380, { wave: 'sine', vol: 0.08 * v }); } return true; }
      if (name === 'save') { if (has('_thump')) g._thump(ctx, t, { f: 70, vol: 0.3 * v }); if (has('_slide')) g._slide(ctx, 330, 140, t, 240, { wave: 'triangle', vol: 0.12 * v }); return true; }
      if (name === 'skid') { if (has('_tap')) { for (var s2 = 0; s2 < 4; s2++) g._tap(ctx, t + s2 * 0.04, { vol: 0.06 * v, f: 2400 - s2 * 300 }); } return true; }
      /* the original fixed-volume blips (the shell ignores vol for these) */
      if (name === 'jump') { g._beep(ctx, 520, t, 90, { wave: 'triangle', vol: 0.12 }); return true; }
      if (name === 'coin') { g._beep(ctx, 990, t, 60, { wave: 'sine', vol: 0.12 }); g._beep(ctx, 1320, t + 0.05, 80, { wave: 'sine', vol: 0.1 }); return true; }
      if (name === 'bump') { g._beep(ctx, 180, t, 140, { wave: 'triangle', vol: 0.18 }); return true; }
      if (name === 'kick') { g._beep(ctx, 140, t, 90, { wave: 'sine', vol: 0.3 }); return true; }
      if (name === 'beep') { g._beep(ctx, 660, t, 120, { wave: 'sine', vol: 0.15 }); return true; }
      if (name === 'go') { g._beep(ctx, 990, t, 260, { wave: 'sine', vol: 0.18 }); return true; }
      if (name === 'check') { g._beep(ctx, 880, t, 90, { wave: 'triangle', vol: 0.12 }); return true; }

      /* ---- pet voices ---- */
      if (name === 'yip') {                     /* puppy: 600->900 Hz triangle, 80 ms, twice, 60 ms gap */
        if (has('_slide')) { g._slide(ctx, 600, 900, t, 80, { wave: 'triangle', vol: 0.11 * v }); g._slide(ctx, 600, 900, t + 0.14, 80, { wave: 'triangle', vol: 0.1 * v }); }
        return true;
      }
      if (name === 'mew') { mew(ctx, t, 0.09 * v); return true; }             /* kitten: 900->650 Hz, 6 Hz vibrato */
      if (name === 'thump') {                   /* bunny: two soft thumps 90 ms apart, then a pop */
        if (has('_thump')) { g._thump(ctx, t, { f: 160, vol: 0.24 * v }); g._thump(ctx, t + 0.09, { f: 160, vol: 0.2 * v }); }
        recipe(ctx, 'pop', t + 0.2, v * 0.8, 0);
        return true;
      }
      if (name === 'trill') {                   /* dragon: rising 400->1200 Hz, a little swell, then a star */
        if (has('_slide')) g._slide(ctx, 400, 1200, t, 150, { wave: 'sine', vol: 0.09 * v });
        if (has('_swell')) g._swell(ctx, t, 0.2, { vol: 0.07 * v });
        recipe(ctx, 'star', t + 0.2, v * 0.8, 0);
        return true;
      }

      /* ---- quiet synth stand-ins for produced samples that have not decoded yet
         (the shell is silent here; the island uses these names constantly) ---- */
      if (name === 'chip') { if (has('_tap')) g._tap(ctx, t, { vol: 0.1 * v, f: 2100 }); if (has('_pluck')) g._pluck(ctx, 1568, t + 0.01, { vol: 0.06 * v, dur: 0.12 }); return true; }
      if (name === 'coins') { if (has('_bell')) { g._bell(ctx, 1319, t, { vol: 0.07 * v, dur: 0.35 }); g._bell(ctx, 1760, t + 0.07, { vol: 0.07 * v, dur: 0.4 }); g._bell(ctx, 2093, t + 0.14, { vol: 0.06 * v, dur: 0.45 }); } return true; }
      if (name === 'sting') {
        if (has('_brass')) { [523, 659, 784].forEach(function (f) { g._brass(ctx, f, t, 0.32, { vol: 0.07 * v }); }); }
        if (has('_bell')) g._bell(ctx, 1047, t + 0.05, { vol: 0.08 * v, dur: 0.8 });
        return true;
      }
      if (name === 'applause') {                /* a patter of soft claps, fixed offsets (no randomness) */
        if (has('_tap')) { for (var a = 0; a < 12; a++) g._tap(ctx, t + a * 0.045 + (a % 3) * 0.011, { vol: (0.07 - a * 0.004) * v, f: 1300 + (a * 397) % 1100 }); }
        return true;
      }
      if (name === 'heartbeat') { if (has('_thump')) { g._thump(ctx, t, { f: 72, vol: 0.3 * v }); g._thump(ctx, t + 0.18, { f: 64, vol: 0.22 * v }); } return true; }
      if (name === 'right') { if (has('playSfx')) g.playSfx('correct'); return true; }
      return false;
    }

    function play(name, vol, step) {
      if (name === 'cheer') name = 'applause';
      if (name === 'voice') { name = VOICE_STEPS[clamp(step | 0, 0, 3)]; step = 0; }
      /* duck before the app-sfx early return, so fanfare and unlock duck too */
      if (DUCK[name]) duckMusic();
      if (APP_SFX[name]) { if (has('playSfx')) g.playSfx(name); return; }
      /* only real sample files go to slSample — anything else would 404 on audio/sfx/<name>.mp3 */
      if (SAMPLE_FILES[name] && has('slSample') && g.slSample(name, vol == null ? 0.8 : vol)) return;
      if (has('getAudioCtx') && has('_beep')) {
        var ctx = g.getAudioCtx(); if (!ctx) return;
        var t = ctx.currentTime, v = vol == null ? 1 : Math.max(0.1, Math.min(1.5, vol));
        recipe(ctx, name, t, v, step);
      }
    }

    function make(cfg) {
      cfg = cfg || {};
      function muted() {
        try { return typeof cfg.muted === 'function' ? !!cfg.muted() : globalMuted(); } catch (e) { return false; }
      }
      function sound(name, vol, step, pan) {
        try {
          if (muted()) return;
          var p = +pan || 0;
          if (p && has('getAudioCtx')) {
            var ctx = g.getAudioCtx();
            if (ctx) { withPan(ctx, p, function () { play(name, vol, step); }); return; }
          }
          play(name, vol, step);
        } catch (e) {}
      }
      sound.at = function (x, width) {
        var p = panFor(x, width);
        return function (name, vol, step) { sound(name, vol, step, p); };
      };
      sound.pet = function (petId, vol, pan) { sound(petVoice(petId), vol, 0, pan); };
      sound.muted = muted;
      return sound;
    }

    var plain = null;
    return {
      make: make,
      /* one-off convenience bound to the app's own mute */
      play: function (name, vol, step, pan) { (plain || (plain = make({})))(name, vol, step, pan); },
      panFor: panFor, petVoice: petVoice,
      NAMES: NAMES, PET_VOICE: PET_VOICE, DUCK: DUCK, SCALE: SCALE, SAMPLE_FILES: SAMPLE_FILES,
      create: create
    };
  }

  var G = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : {});
  return create(G);
}));
