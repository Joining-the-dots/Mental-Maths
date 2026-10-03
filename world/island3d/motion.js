/* ================================================================
   My Island 3D — motion timelines (pure; no DOM, no THREE).
   window.SLMotion in the browser, module.exports in Node.
   Every idle loop and every act is a pure function of time, so the
   same t always gives the same pose: frame-rate independent, testable,
   and allocation-free in the frame loop (pass an `out` object to reuse).
   Easing reuses SLGameFX.ease (world/games/fx.js) when it is present.

   API (frozen contract):
     MAX_FLASH_HZ = 2 · safeHz(hz) · ease{...} · clamp · lerp · smoothstep · frac
     hash(str) · phaseOf(uid) → [0, 1)  (same FNV-1a as SLGrid3D.hash01)
     beatInfo(t, bpm, t0, out) → {beat, frac, bar, beatInBar, count}  (count 1..8)
   IDLE (reduced = true gives the static pose):
     sway(t, deg, period, phase, reduced, out) → {x, z} degrees about the base
     bob(t, pct, period, phase, reduced) → scale
     spin(t, rps, phase, reduced) → degrees
     flutter(t, amp, hz, u, phase, reduced) → cloth offset (u = 0 at the pole … 1 free edge)
     pennant(t, i, deg, hz, phase, reduced) → degrees
     every(t, minGap, maxGap, seed, out) → {n, t0, since, next}  (gaps always in [min, max])
     blink(t, seed, minGap, maxGap, reduced) → eye openness 0..1
     pulse(beatFrac, pct, reduced) → scale (once per beat)
     twinkle(t, hz, phase, reduced) · chase(t, i, hz, groups, reduced) ·
       chaseWave(t, d, speed, spacing, reduced) · glint(t, period, n, phase, reduced)   → 0..1 light
     smoke(t, i, n, period, phase, reduced, out) → {y, s, a}
     drop(t, i, n, streams, period, phase, reduced, out) → {x, y, z, a}   fountain trickle
     idleBubble(t, k, every, phase, reduced, out) → {x, y, z, r, a}
     petal(t, i, seed, reduced, out) → {x, y, z, rot, a}
     snowSparkle(t, i, n, phase, reduced, out) → {x, y, z, a}
     avatarBob(t, phase, reduced) → dy · beamAngle(t, rps, phase, reduced) → deg
     beamColor(t, every, n, out) → {i, j, k} · coneSweep(t, i, reduced) → deg · drift(t, speed, span, offset)
     bubbleTrack(age, seed, out) → {x, y, z, r, a, popped}
   ACTS (each ≤ 3 s; the swing's decay is the one exception):
     ACTS[name] = {name, dur, reducedDur, end, endReduced?, mod?, hold?, keys, cues, reducedCues, sample}
     sample(name, t, out, o) → out      o = {reduced, from, lead}
     carry(name, out) → from            hand an interrupted act's pose to its restart
     cues(name, o) → [{t, sfx, vol, step} | {t, emit, n}]
     durOf(name, o) · actFor(catalogAct, id, lit) → act name
     names: squish dropIn store glowOn glowOff flag bunting spin swing splash bounce
            bubbles launch kartRev home homeClose debut hop
            city buildings (3 s; 'screen' 0.5 s; reduced = the instant end state):
            snap {bulbs, bloom, strip, curtain} · serve {hatch, cup, cupA, swirl} ·
            screen {wipe, band, prog} · record {onAir, level} · dance {chase, pump} ·
            hangout {scope, wave, squish} · encore {wall, heads, chase, beams}
            (a cue with pet: true is the active pet's voice: SLSound 'voice' at that pet's step)
     ripple(u, front, amp) → bunting pennant extra degrees
     ON_AIR_SEC (4) · STRIP_SEC (6) · RATE {bloom 1.5, screen 0.5} · allow(lastT, t, gap) → bool
     vu(i, beat, beatFrac, level, reduced) → bar height · diagChase(cx, cz, beat, beatFrac, groups,
       reduced) → tile light · wave(t, i, n, hz, level, reduced) → bulb light (≤ ±35%)
   SCENE TIMELINES:
     showMix(t, k0, target, reduced) → k · landRise(t, delay, reduced, out) → {y01, a} ·
     riseDur(n) · crane(t, reduced, out) → {k, elev} · pushIn(t, reduced) · orbit(t, reduced)
   ================================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    var fx = null;
    try { fx = require('../games/fx.js'); } catch (e) { fx = null; }
    module.exports = factory(root, fx);
  } else root.SLMotion = factory(root, null);
}(typeof self !== 'undefined' ? self : this, function (root, FX0) {
  'use strict';

  var MAX_FLASH_HZ = 2;
  var PI = Math.PI, TAU = PI * 2;

  /* ---------------- maths ---------------- */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function lerp(a, b, k) { return a + (b - a) * k; }
  function smoothstep(a, b, x) { var u = clamp01((x - a) / (b - a)); return u * u * (3 - 2 * u); }
  function frac(v) { return v - Math.floor(v); }
  function safeHz(hz) { return hz > MAX_FLASH_HZ ? MAX_FLASH_HZ : hz < 0 ? 0 : hz; }

  var ease = {
    linear: function (t) { return t; },
    inQuad: function (t) { return t * t; },
    outQuad: function (t) { return 1 - (1 - t) * (1 - t); },
    inOutQuad: function (t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; },
    inCubic: function (t) { return t * t * t; },
    outCubic: function (t) { return 1 - Math.pow(1 - t, 3); },
    inOutCubic: function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
    inSine: function (t) { return 1 - Math.cos(t * PI / 2); },
    outSine: function (t) { return Math.sin(t * PI / 2); },
    inOutSine: function (t) { return -(Math.cos(PI * t) - 1) / 2; },
    inBack: function (t) { var c1 = 1.70158, c3 = c1 + 1; return c3 * t * t * t - c1 * t * t; },
    outBack: function (t) { var c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
    outElastic: function (t) { if (t === 0 || t === 1) return t; return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * PI) / 3) + 1; }
  };
  /* the games' shared juice module wins where it defines the same curve */
  var FXM = FX0 || (root && root.SLGameFX) || null;
  if (FXM && FXM.ease) Object.keys(FXM.ease).forEach(function (k) { if (typeof FXM.ease[k] === 'function') ease[k] = FXM.ease[k]; });

  /* FNV-1a 32-bit, identical to SLGrid3D.hash */
  function hash(s) {
    s = String(s);
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
  }
  function phaseOf(uid) { return hash(uid) / 4294967296; }
  /* integer mix of (seed, n) → [0, 1) without allocating */
  function mix01(seed, n) {
    var h = (seed ^ Math.imul(n | 0, 0x9E3779B1)) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x85EBCA6B) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function seedOf(s) { return typeof s === 'number' ? (s >>> 0) : hash(s); }

  function beatInfo(t, bpm, t0, out) {
    out = out || {};
    var b = (t - (t0 || 0)) * bpm / 60, n = Math.floor(b);
    out.beat = n; out.frac = b - n;
    out.bar = Math.floor(n / 4); out.beatInBar = ((n % 4) + 4) % 4;
    out.count = ((n % 8) + 8) % 8 + 1;
    return out;
  }

  /* ---------------- idle loops ---------------- */
  function sway(t, deg, period, phase, reduced, out) {
    out = out || {};
    if (reduced) { out.x = 0; out.z = 0; return out; }
    var a = TAU * (t / period + (phase || 0));
    out.z = deg * Math.sin(a);
    out.x = deg * 0.3 * Math.cos(a);          /* a slight ellipse reads as wind, not a metronome */
    return out;
  }
  function bob(t, pct, period, phase, reduced) {
    return reduced ? 1 : 1 + pct / 100 * Math.sin(TAU * (t / period + (phase || 0)));
  }
  function spin(t, rps, phase, reduced) {
    return reduced ? frac(phase || 0) * 360 : frac(t * rps + (phase || 0)) * 360;
  }
  function flutter(t, amp, hz, u, phase, reduced) {
    if (reduced) return 0;
    return amp * u * Math.sin(TAU * (hz * t + (phase || 0)) - u * 2.4);
  }
  function pennant(t, i, deg, hz, phase, reduced) {
    return reduced ? 0 : deg * Math.sin(TAU * (hz * t + (phase || 0)) + i * 0.9);
  }
  /* event n happens at (n + phase)·mean + j(n) with |j| ≤ spread/2, so every gap is in [min, max] */
  function eventAt(n, s, ph, mean, spread) { return (n + ph) * mean + (mix01(s, n) - 0.5) * spread; }
  function every(t, minGap, maxGap, seed, out) {
    out = out || {};
    var mean = (minGap + maxGap) / 2, spread = (maxGap - minGap) / 2, s = seedOf(seed), ph = mix01(s, -1);
    var n = Math.floor(t / mean - ph) + 1;
    while (eventAt(n, s, ph, mean, spread) > t) n--;
    out.n = n; out.t0 = eventAt(n, s, ph, mean, spread); out.since = t - out.t0; out.next = eventAt(n + 1, s, ph, mean, spread);
    return out;
  }
  var _ev = {};
  function blink(t, seed, minGap, maxGap, reduced) {
    if (reduced) return 1;
    every(t, minGap == null ? 5 : minGap, maxGap == null ? 9 : maxGap, seed, _ev);
    var d = 0.18;
    return _ev.since < d ? 1 - Math.sin(PI * _ev.since / d) : 1;
  }
  /* lit lanterns/mushrooms on the music beat: one smooth swell per beat (≤ 1.97 Hz at 118 BPM) */
  function pulse(beatFrac, pct, reduced) {
    return reduced ? 1 : 1 + pct / 100 * Math.cos(TAU * beatFrac);
  }
  function twinkle(t, hz, phase, reduced) {
    if (reduced) return 0.85;
    return 0.5 + 0.5 * Math.sin(TAU * (safeHz(hz) * t + (phase || 0)));
  }
  /* bulb i of a chase advancing `hz` steps a second; each bulb lights once per `groups` steps */
  function chase(t, i, hz, groups, reduced) {
    if (reduced) return 0.8;
    var g = Math.max(1, groups | 0), local = ((t * safeHz(hz) - i) % g + g) % g;
    return 0.25 + 0.75 * (local < 1 ? Math.sin(PI * local) : 0);
  }
  /* the Showtime path runway: a pulse travelling `speed` cells/s, one every `spacing` cells */
  function chaseWave(t, d, speed, spacing, reduced) {
    if (reduced) return 0.8;
    var sp = Math.max(spacing, speed / MAX_FLASH_HZ), local = frac((t * speed - d) / sp) * sp;
    return 0.25 + 0.75 * (local < 1 ? Math.sin(PI * local) : 0);
  }
  /* n soft sheen sweeps (0.4 s each, 0.6 s apart) at the start of every period */
  function glint(t, period, n, phase, reduced) {
    if (reduced) return 0;
    var local = frac(t / period + (phase || 0)) * period;
    for (var i = 0; i < n; i++) {
      var s = local - i * 0.6;
      if (s >= 0 && s < 0.4) return Math.sin(PI * s / 0.4);
    }
    return 0;
  }
  function smoke(t, i, n, period, phase, reduced, out) {
    out = out || {};
    var p = reduced ? (i + 0.5) / n : frac(t / period + (phase || 0) + i / n);
    out.y = 0.6 * p; out.s = 1 + 0.8 * p; out.a = reduced ? 0.6 : Math.sin(PI * p) * 0.9;
    return out;
  }
  function drop(t, i, n, streams, period, phase, reduced, out) {
    out = out || {};
    if (reduced) { out.x = out.y = out.z = 0; out.a = 0; return out; }
    var k = i % streams, per = Math.max(1, Math.floor(n / streams));
    var ang = TAU * (k / streams + (phase || 0)), p = frac(t / period + Math.floor(i / streams) / per);
    out.x = Math.cos(ang) * 0.32 * p; out.z = Math.sin(ang) * 0.32 * p;
    out.y = 0.42 * 4 * p * (1 - p); out.a = p < 0.85 ? 1 : (1 - p) / 0.15;
    return out;
  }
  function idleBubble(t, k, everySec, phase, reduced, out) {
    out = out || {};
    var life = 3.4, age = ((t + (phase || 0) * everySec) % everySec + everySec) % everySec + k * everySec;
    if (reduced || age > life) { out.x = out.y = out.z = 0; out.r = 0; out.a = 0; return out; }
    out.y = 0.3 + 0.42 * age; out.x = 0.12 + 0.07 * Math.sin(age * 2.6 + k); out.z = 0.05 * Math.cos(age * 2.1 + k);
    out.r = 0.05 + 0.015 * k; out.a = 0.45 * Math.min(1, age / 0.3) * Math.min(1, (life - age) / 0.4);
    return out;
  }
  function petal(t, i, seed, reduced, out) {
    out = out || {};
    var s = seedOf(seed), h = mix01(s, i), period = 4.8, p = frac(t / period + h);
    if (reduced) { out.x = out.y = out.z = out.rot = 0; out.a = 0; return out; }
    var a = TAU * (h + p * 0.6);
    out.y = 1.3 * (1 - p); out.x = Math.cos(a) * (0.25 + 0.3 * p); out.z = Math.sin(a) * (0.25 + 0.3 * p);
    out.rot = (p * 2 + h) * 360; out.a = Math.min(1, p / 0.1) * Math.min(1, (1 - p) / 0.15);
    return out;
  }
  function snowSparkle(t, i, n, phase, reduced, out) {
    out = out || {};
    var u = i / n + (phase || 0), p = reduced ? frac(u) : frac(t / 6 + u), ang = TAU * (reduced ? u : t / 9 + u);
    out.x = Math.cos(ang) * 0.4; out.z = Math.sin(ang) * 0.4; out.y = 0.15 + 0.75 * p;
    out.a = reduced ? 0.6 : 0.3 + 0.7 * Math.sin(PI * p);
    return out;
  }
  function avatarBob(t, phase, reduced) { return reduced ? 0 : 0.02 * Math.sin(TAU * (0.5 * t + (phase || 0))); }
  function beamAngle(t, rps, phase, reduced) { return reduced ? frac(phase || 0) * 360 : frac(t * rps + (phase || 0)) * 360; }
  /* a colour cycle (lighthouse at Showtime): hold, then a 0.5 s crossfade to the next */
  function beamColor(t, everySec, n, out) {
    out = out || {};
    var step = Math.floor(t / everySec), local = t - step * everySec;
    out.i = ((step % n) + n) % n; out.j = (out.i + 1) % n; out.k = smoothstep(everySec - 0.5, everySec, local);
    return out;
  }
  function coneSweep(t, i, reduced) { return reduced ? 0 : 25 * Math.sin(TAU * (0.12 * t + i / 3)); }
  function drift(t, speed, span, offset) { return frac((t * speed + (offset || 0)) / span + 0.5) * span - span / 2; }
  /* one PEARL bubble from the machine act: rises 1.5–3 u, wobbles, pops at the end of its life */
  function bubbleTrack(age, seed, out) {
    out = out || {};
    var s = seedOf(seed), rise = 1.5 + 1.5 * mix01(s, 1), life = 1.6 + 0.8 * mix01(s, 2), w = mix01(s, 3) * TAU;
    var u = clamp01(age / life);
    out.popped = age >= life;
    out.y = 0.35 + rise * ease.outQuad(u);
    out.x = 0.14 * Math.sin(age * 4 + w) + (mix01(s, 4) - 0.5) * 0.6 * u;
    out.z = 0.14 * Math.cos(age * 3.3 + w) + (mix01(s, 5) - 0.5) * 0.6 * u;
    out.r = 0.04 + 0.08 * mix01(s, 6);
    out.a = out.popped || age < 0 ? 0 : 0.45 * Math.min(1, age / 0.15);
    return out;
  }

  /* ---------------- acts ---------------- */
  var BLEND = 0.12;        /* a restarted act eases out of the interrupted pose over this long */
  function blendFrom(out, from, keys, t) {
    if (!from) return out;
    var k = smoothstep(0, BLEND, t);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      if (typeof from[key] === 'number' && typeof out[key] === 'number') out[key] = from[key] + (out[key] - from[key]) * k;
    }
    return out;
  }
  function seg(t, a, b) { return clamp01((t - a) / (b - a)); }
  /* a jet that rises over `up`, holds, and falls by `end` */
  function jet(t, start, up, holdTo, end, H) {
    if (t < start || t >= end) return 0;
    if (t < start + up) return H * ease.outQuad(seg(t, start, start + up));
    if (t < holdTo) return H;
    return H * (1 - ease.inQuad(seg(t, holdTo, end)));
  }

  var ACTS = {};
  /* cues may be a list or a function(o) (when they depend on the restart phase or the
     pet's run-over); by default the reduced variant fires the same cues at t = 0 */
  function defAct(spec) {
    spec.keys = Object.keys(spec.end);
    spec.cues = spec.cues || [];
    if (!spec.reducedCues) {
      spec.reducedCues = typeof spec.cues === 'function' ? spec.cues
        : spec.cues.map(function (c) { var o = {}; for (var k in c) o[k] = c[k]; o.t = 0; return o; });
    }
    ACTS[spec.name] = spec;
  }

  /* universal tap feedback: 1 → 0.92 → 1.06 → 1 over 0.25 s */
  defAct({ name: 'squish', dur: 0.25, reducedDur: 0.12, end: { sy: 1, sxz: 1 }, cues: [{ t: 0, sfx: 'pop' }],
    sample: function (t, out, o) {
      var s;
      if (o.reduced) s = t >= 0.12 || t <= 0 ? 1 : 1 - 0.03 * Math.sin(PI * t / 0.12);
      else if (t <= 0 || t >= 0.25) s = 1;
      else if (t < 0.07) s = lerp(1, 0.92, ease.outQuad(t / 0.07));
      else if (t < 0.16) s = lerp(0.92, 1.06, ease.inOutSine((t - 0.07) / 0.09));
      else s = lerp(1.06, 1, ease.inOutSine((t - 0.16) / 0.09));
      out.sy = s; out.sxz = 1 + (1 - s) * 0.5;
      return blendFrom(out, o.from, this.keys, t);
    } });

  /* placement: fall 1.2 u in 0.22 s (inQuad), squash y 0.8 / xz 1.12 for 0.08 s, outBack rebound 0.25 s.
     A re-drop always falls from 1.2 (it is a new placement); the squash blends. */
  var DROP_BLEND = ['sy', 'sxz', 'a'];
  defAct({ name: 'dropIn', dur: 0.55, reducedDur: 0.15, end: { dy: 0, sy: 1, sxz: 1, a: 1 },
    cues: [{ t: 0.22, sfx: 'chip' }, { t: 0.22, sfx: 'pop' }, { t: 0.22, emit: 'dust', n: 6 }],
    reducedCues: [{ t: 0, sfx: 'chip' }, { t: 0, sfx: 'pop' }, { t: 0, emit: 'sparkle', n: 4 }],
    sample: function (t, out, o) {
      out.dy = 0; out.sy = 1; out.sxz = 1; out.a = 1;
      if (o.reduced) { out.a = clamp01(t / 0.15); return out; }
      if (t < 0.22) out.dy = 1.2 * (1 - ease.inQuad(clamp01(t / 0.22)));
      else if (t < 0.30) { out.sy = 0.8; out.sxz = 1.12; }
      else if (t < 0.55) { var e = ease.outBack((t - 0.30) / 0.25); out.sy = 0.8 + 0.2 * e; out.sxz = 1.12 - 0.12 * e; }
      return blendFrom(out, o.from, DROP_BLEND, t);
    } });

  /* storing: anticipate, shrink into a sparkle, and the sparkle flies to the tray */
  defAct({ name: 'store', dur: 0.75, reducedDur: 0.3, end: { s: 0, flight: 1, a: 0 },
    cues: [{ t: 0, sfx: 'whoosh' }, { t: 0.25, emit: 'sparkle', n: 6 }],
    sample: function (t, out, o) {
      if (o.reduced) { var r = clamp01(t / 0.3); out.s = 1 - r; out.flight = r; out.a = 1 - r; return out; }
      out.s = t < 0.25 ? 1 - ease.inBack(clamp01(t / 0.25)) : 0;
      out.flight = t < 0.25 ? 0 : ease.outQuad(seg(t, 0.25, 0.75));
      out.a = t < 0.25 ? 1 : 1 - seg(t, 0.25, 0.75);
      return blendFrom(out, o.from, ['s'], t);
    } });

  /* lamps: 3 gentle, rising steps over 0.25 s, then on — never a dip, so never a strobe */
  var GLOW_STEPS = [0.35, 0.6, 0.8, 1];
  defAct({ name: 'glowOn', dur: 0.25, reducedDur: 0, end: { level: 1 }, cues: [{ t: 0, sfx: 'star' }],
    sample: function (t, out, o) {
      var f = o.from ? clamp01(o.from.level) : 0;
      if (o.reduced || t >= 0.25) { out.level = 1; return out; }
      var i = Math.min(3, Math.floor(Math.max(0, t) / (0.25 / 3))), into = (Math.max(0, t) - i * 0.25 / 3) / 0.03;
      var lv = i === 0 ? GLOW_STEPS[0] : lerp(GLOW_STEPS[i - 1], GLOW_STEPS[i], clamp01(into));
      out.level = f + (1 - f) * lv;
      return out;
    } });
  defAct({ name: 'glowOff', dur: 0.15, reducedDur: 0, end: { level: 0 }, cues: [{ t: 0, sfx: 'chip' }],
    sample: function (t, out, o) {
      var f = o.from ? clamp01(o.from.level) : 1;
      out.level = o.reduced ? 0 : f * (1 - ease.outQuad(clamp01(t / 0.15)));
      return out;
    } });

  /* flag pole: flutters harder (0.12 u) for 1.2 s, back to the 0.04 u idle */
  defAct({ name: 'flag', dur: 1.2, reducedDur: 0, end: { amp: 0.04, hz: 2 }, endReduced: { amp: 0, hz: 2 },
    cues: [{ t: 0, sfx: 'whoosh', vol: 0.5 }],
    sample: function (t, out, o) {
      out.hz = 2;
      if (o.reduced) { out.amp = 0; return out; }
      var env = t < 0.15 ? ease.outQuad(clamp01(t / 0.15)) : t < 0.6 ? 1 : 1 - ease.inOutSine(seg(t, 0.6, 1.2));
      out.amp = 0.04 + 0.08 * env;
      return blendFrom(out, o.from, ['amp'], t);
    } });

  /* bunting: a ripple runs left to right along the line in 0.6 s */
  function ripple(u, front, amp) { var x = (u - front) / 0.15; return amp * Math.exp(-x * x); }
  defAct({ name: 'bunting', dur: 0.8, reducedDur: 0, end: { front: 1.3, amp: 0 },
    cues: [{ t: 0, sfx: 'whoosh', vol: 0.5 }],
    sample: function (t, out, o) {
      if (o.reduced) { out.front = 1.3; out.amp = 0; return out; }
      out.front = -0.3 + 1.6 * clamp01(t / 0.6);
      out.amp = 14 * (1 - smoothstep(0.55, 0.8, t));
      return blendFrom(out, o.from, ['amp'], t);
    } });

  /* windmill: spin up to 2.5 rev/s in 1/3 s, ease back to the 0.25 rev/s idle by 3 s.
     The extra turn always totals a whole number of quarter turns (the sails have
     4-fold symmetry), so the idle carries on seamlessly; a restart keeps the current
     speed and the pose (mod 90°) and re-solves the peak so it still lands square. */
  var SPIN = { idle: 0.25, peak: 2.5, up: 1 / 3, down: 8 / 3, quarter: 0.25 };
  var _plan = { w0: 0, c: 0, P: 0, need: 0 };      /* scratch: sampled every frame, so no allocation */
  function spinPlan(from) {
    var A = SPIN.up, B = SPIN.down, W = SPIN.idle;
    var w0 = from && typeof from.rps === 'number' ? from.rps : W;
    var c = from && typeof from.extraDeg === 'number' ? frac(from.extraDeg / 360 / SPIN.quarter) * SPIN.quarter : 0;
    var lin = (w0 - W) * A - w0 * (2 * A / 3) - W * (B / 2), coef = 2 * A / 3 + B / 2;
    var natural = SPIN.peak * coef + lin;
    var k = Math.max(1, Math.round((c + natural) / SPIN.quarter)), need = k * SPIN.quarter - c;
    _plan.w0 = w0; _plan.c = c; _plan.need = need; _plan.P = (need - lin) / coef;
    return _plan;
  }
  defAct({ name: 'spin', dur: 3, reducedDur: 0.6, end: { rps: 0.25, extraDeg: 0 }, mod: { extraDeg: 90 },
    cues: [{ t: 0, sfx: 'whoosh' }, { t: 0, sfx: 'boost', vol: 0.4 }],
    sample: function (t, out, o) {
      if (o.reduced) { out.rps = SPIN.idle; out.extraDeg = 90 * ease.inOutSine(clamp01(t / 0.6)); return out; }
      var A = SPIN.up, B = SPIN.down, W = SPIN.idle, pl = spinPlan(o.from), E;
      if (t <= 0) { out.rps = pl.w0; E = 0; }
      else if (t < A) {
        var u = t / A;
        out.rps = pl.w0 + (pl.P - pl.w0) * (1 - (1 - u) * (1 - u));
        E = (pl.w0 - W) * t + (pl.P - pl.w0) * (t - (A / 3) * (1 - Math.pow(1 - u, 3)));
      } else if (t < A + B) {
        var v = (t - A) / B, Ea = (pl.w0 - W) * A + (pl.P - pl.w0) * (2 * A / 3);
        out.rps = W + (pl.P - W) * (1 + Math.cos(PI * v)) / 2;
        E = Ea + (pl.P - W) * B * (v / 2 + Math.sin(PI * v) / (2 * PI));
      } else { out.rps = W; E = pl.need; }
      out.extraDeg = (pl.c + E) * 360;
      return out;
    } });

  /* swing: a pendulum to ±38° (period 1.6 s) that decays to rest over 4 s, the one act
     allowed past 3 s. A restart keeps the angle and direction (phase-matched) and refills
     the swing to full height. idleMix fades the ±4° idle out under the big swing. */
  var SWING = { amp: 38, period: 1.6, dur: 4 };
  function swingPhase(from) {
    if (!from || typeof from.deg !== 'number') return 0;
    var phi = Math.asin(clamp(from.deg / SWING.amp, -1, 1));
    return from.dir < 0 ? PI - phi : phi;
  }
  function swingFirstPeak(phi) { var w = TAU / SWING.period; return (((PI / 2 - phi) % PI) + PI) % PI / w; }
  defAct({ name: 'swing', dur: SWING.dur, reducedDur: 0, end: { deg: 0, dir: 1, idleMix: 1 },
    cues: function (o) {
      if (o && o.reduced) return [{ t: 0, sfx: 'whoosh' }];
      var t1 = swingFirstPeak(swingPhase(o && o.from)), half = SWING.period / 2;
      return [0, 1, 2].map(function (k) { return { t: t1 + k * half, sfx: 'whoosh' }; });
    },
    sample: function (t, out, o) {
      if (o.reduced || t >= SWING.dur) { out.deg = 0; out.dir = 1; out.idleMix = 1; return out; }
      var phi = swingPhase(o.from), t1 = swingFirstPeak(phi), w = TAU / SWING.period, a = w * Math.max(0, t) + phi;
      var env = t <= t1 ? 1 : Math.pow(clamp01((SWING.dur - t) / (SWING.dur - t1)), 1.5);
      out.deg = SWING.amp * env * Math.sin(a);
      out.dir = Math.cos(a) < 0 ? -1 : 1;
      out.idleMix = 1 - env;
      return blendFrom(out, o.from, ['idleMix'], t);
    } });

  /* fountain: a 3 s concert show — centre, left, right, then all together */
  defAct({ name: 'splash', dur: 3, reducedDur: 0.6, end: { c: 0, l: 0, r: 0 },
    cues: [{ t: 0, sfx: 'whoosh' }, { t: 0, sfx: 'combo', step: 0 }, { t: 0.6, sfx: 'combo', step: 1 },
           { t: 1.2, sfx: 'combo', step: 2 }, { t: 1.8, sfx: 'combo', step: 3 }, { t: 2.6, sfx: 'star' }],
    reducedCues: [{ t: 0, sfx: 'whoosh' }, { t: 0.4, sfx: 'star' }],
    sample: function (t, out, o) {
      if (o.reduced) { var h = jet(t, 0, 0.2, 0.4, 0.6, 0.5); out.c = out.l = out.r = h; return out; }
      var fin = jet(t, 1.8, 0.25, 2.35, 2.7, 1.2);
      out.c = Math.max(jet(t, 0, 0.2, 0.45, 0.6, 0.9), fin);
      out.l = Math.max(jet(t, 0.6, 0.2, 1.05, 1.2, 0.9), fin);
      out.r = Math.max(jet(t, 1.2, 0.2, 1.65, 1.8, 0.9), fin);
      return blendFrom(out, o.from, this.keys, t);
    } });

  /* trampoline: after the pet's run-over (o.lead ≤ 1.2 s) 3 bounces of 0.5, 0.75 and 1.0 u
     with a front flip on the last; the mat dips 0.12 u at each contact; 'boing' with
     combo steps 0, 2, 4 layered on top ('boing' itself ignores step) */
  var BOUNCE = { g: 24, contact: 0.075, heights: [0.5, 0.75, 1.0], dip: 0.12, maxLead: 1.2 };
  BOUNCE.flights = BOUNCE.heights.map(function (h) { return 2 * Math.sqrt(2 * h / BOUNCE.g); });
  BOUNCE.length = 4 * BOUNCE.contact + BOUNCE.flights.reduce(function (a, b) { return a + b; }, 0);
  function leadOf(o) { return clamp(o && o.lead || 0, 0, BOUNCE.maxLead); }
  defAct({ name: 'bounce', dur: BOUNCE.maxLead + BOUNCE.length, reducedDur: 0.2, end: { matDip: 0, petY: 0, flip: 0 },
    cues: function (o) {
      if (o && o.reduced) return [{ t: 0, sfx: 'boing' }];
      var t = leadOf(o), out = [];
      for (var i = 0; i < 3; i++) {
        out.push({ t: t, sfx: 'boing' }, { t: t, sfx: 'combo', step: i * 2 });
        t += BOUNCE.contact + BOUNCE.flights[i];
      }
      return out;
    },
    sample: function (t, out, o) {
      out.matDip = 0; out.petY = 0; out.flip = 0;
      if (o.reduced) { out.matDip = t > 0 && t < 0.2 ? -0.06 * Math.sin(PI * t / 0.2) : 0; return out; }
      var s = t - leadOf(o);
      for (var i = 0; i < 4 && s >= 0; i++) {
        if (s < BOUNCE.contact) { out.matDip = -BOUNCE.dip * Math.sin(PI * s / BOUNCE.contact); out.petY = out.matDip; break; }
        s -= BOUNCE.contact;
        if (i === 3) break;
        var f = BOUNCE.flights[i];
        if (s < f) {
          var v = Math.sqrt(2 * BOUNCE.g * BOUNCE.heights[i]);
          out.petY = v * s - BOUNCE.g * s * s / 2;
          if (i === 2) out.flip = s / f;
          break;
        }
        s -= f;
      }
      return blendFrom(out, o.from, ['matDip', 'petY'], t);
    } });

  /* bubble machine: a happy shake while 24 PEARL bubbles leave in 6 bursts; ≤ 6 audible
     pops with the combo stepping up underneath */
  var BUBBLE_CUES = [];
  for (var bi = 0; bi < 6; bi++) BUBBLE_CUES.push({ t: bi * 0.15, emit: 'bubble', n: 4 });
  for (var bp = 0; bp < 6; bp++) BUBBLE_CUES.push({ t: 1.6 + bp * 0.22, sfx: 'pop' }, { t: 1.6 + bp * 0.22, sfx: 'combo', step: bp });
  defAct({ name: 'bubbles', dur: 3, reducedDur: 0.6, end: { wobble: 0 }, cues: BUBBLE_CUES,
    reducedCues: [{ t: 0, emit: 'bubble', n: 6 }, { t: 0.4, sfx: 'pop' }],
    sample: function (t, out, o) {
      out.wobble = o.reduced || t >= 0.9 ? 0 : 3 * Math.sin(TAU * 3 * t) * (1 - t / 0.9);
      return blendFrom(out, o.from, this.keys, t);
    } });

  /* course gate / pitch: sparkle ring, stars spin two turns, the ball hops, 0.7 s push-in */
  defAct({ name: 'launch', dur: 0.7, reducedDur: 0, end: { k: 1, hop: 0, spinDeg: 0 }, mod: { spinDeg: 360 },
    cues: [{ t: 0, sfx: 'whoosh' }, { t: 0, emit: 'sparkleRing', n: 12 }],
    sample: function (t, out, o) {
      if (o.reduced) { out.k = 1; out.hop = 0; out.spinDeg = 0; return out; }
      var u = clamp01(t / 0.7);
      out.k = ease.inOutSine(u); out.hop = 0.15 * Math.sin(PI * clamp01(t / 0.4)); out.spinDeg = 720 * ease.outQuad(u);
      return out;
    } });
  /* garage: the parked kart revs with a 3 Hz wobble and 2 pastel exhaust puffs */
  defAct({ name: 'kartRev', dur: 0.7, reducedDur: 0, end: { k: 1, wobble: 0 },
    cues: [{ t: 0, sfx: 'boost' }, { t: 0.1, emit: 'exhaust', n: 1 }, { t: 0.35, emit: 'exhaust', n: 1 }, { t: 0.35, sfx: 'whoosh' }],
    sample: function (t, out, o) {
      if (o.reduced) { out.k = 1; out.wobble = 0; return out; }
      var u = clamp01(t / 0.7);
      out.k = ease.inOutSine(u); out.wobble = 3 * Math.sin(TAU * 3 * t) * (1 - u);
      return out;
    } });

  /* house door: swings open 70° in 0.3 s and HOLDS until homeClose */
  defAct({ name: 'home', dur: 0.3, reducedDur: 0, hold: true, end: { deg: 70 },
    cues: [{ t: 0, sfx: 'pop' }, { t: 0.05, sfx: 'unlock' }, { t: 0.15, emit: 'heart', n: 3 }],
    sample: function (t, out, o) {
      var d0 = o.from ? o.from.deg : 0;
      out.deg = o.reduced || t >= 0.3 ? 70 : d0 + (70 - d0) * ease.outBack(clamp01(t / 0.3));
      return out;
    } });
  defAct({ name: 'homeClose', dur: 0.3, reducedDur: 0, end: { deg: 0 }, cues: [],
    sample: function (t, out, o) {
      var d0 = o.from ? o.from.deg : 70;
      out.deg = o.reduced || t >= 0.3 ? 0 : d0 * (1 - ease.inOutSine(clamp01(t / 0.3)));
      return out;
    } });

  /* a new purchase on the stage riser: pop in and turn once (1.2 s) */
  defAct({ name: 'debut', dur: 1.2, reducedDur: 0.3, end: { deg: 0, s: 1, a: 1 }, mod: { deg: 360 },
    cues: [{ t: 0, emit: 'sparkle', n: 16 }],
    sample: function (t, out, o) {
      if (o.reduced) { out.deg = 0; out.s = 1; out.a = clamp01(t / 0.3); return out; }
      out.deg = t >= 1.2 ? 0 : 360 * ease.inOutSine(clamp01(t / 1.2));
      out.s = t < 0.3 ? 0.6 + 0.4 * ease.outBack(clamp01(t / 0.3)) : 1;
      out.a = 1;
      return out;
    } });

  /* a pet's or the avatar's happy hop on tap */
  defAct({ name: 'hop', dur: 0.45, reducedDur: 0, end: { dy: 0, sy: 1 }, cues: [{ t: 0, emit: 'emote', n: 1 }],
    sample: function (t, out, o) {
      if (o.reduced || t <= 0 || t >= 0.45) { out.dy = 0; out.sy = 1; }
      else { var u = t / 0.45; out.dy = 0.18 * 4 * u * (1 - u); out.sy = 1 + 0.08 * Math.sin(PI * u); }
      return blendFrom(out, o.from, this.keys, t);
    } });

  /* ---------------- city building acts (Encore City) ----------------
     Each lasts ≤ 3 s on the building's ACT_PIVOT pivot, restarts on a re-tap (blending the
     keys that must not jump), never plays 'pop' in its first 0.05 s (the controller's tap
     squish owns that), and never involves points or chance. Reduced motion: the instant end
     state, one sparkle, and the same sounds at t = 0. Longer pet performances run in
     pets-brain; the models fire them alongside. */
  /* 0 before a, up to 1 by b (inOutSine), held to c, back to 0 by d */
  function env(t, a, b, c, d) {
    if (t <= a || t >= d) return 0;
    if (t < b) return ease.inOutSine((t - a) / (b - a));
    if (t <= c) return 1;
    return 1 - ease.inOutSine((t - c) / (d - c));
  }
  function reducedOf(list) {
    var out = [];
    list.forEach(function (c) { if (c.sfx) { var o = {}; for (var k in c) o[k] = c[k]; o.t = 0; out.push(o); } });
    out.push({ t: 0, emit: 'sparkle', n: 1 });
    return out;
  }
  function endInto(out, end) { for (var k in end) out[k] = end[k]; return out; }
  function defBuildingAct(spec0) {
    spec0.reducedDur = 0;
    spec0.reducedCues = reducedOf(spec0.cues);
    defAct(spec0);
  }
  /* the ON AIR sign stays lit this long after a tap (past the 3 s act; the model fades it),
     and the photo strip waits this long before it fades (or until the next tap) */
  var ON_AIR_SEC = 4, STRIP_SEC = 6;

  /* Photo Booth: the countdown rings light one by one (1.67 Hz), a local lens bloom at
     1.5 s, then the strip slides out of the slot (it stays out at the end) */
  defBuildingAct({ name: 'snap', dur: 3, end: { bulbs: 0, bloom: 0, strip: 1, curtain: 0 },
    cues: [{ t: 0.1, sfx: 'tick', step: 0 }, { t: 0.7, sfx: 'tick', step: 2 }, { t: 1.3, sfx: 'tick', step: 4 },
           { t: 1.5, sfx: 'star' }, { t: 1.5, emit: 'sparkle', n: 4 }],
    sample: function (t, out, o) {
      if (o.reduced || t >= 3) return endInto(out, this.end);
      out.bulbs = t < 0.1 ? 0 : t < 0.7 ? 1 / 3 : t < 1.3 ? 2 / 3 : t < 1.5 ? 1 : 1 - clamp01((t - 1.5) / 0.3);
      out.bloom = t < 1.5 ? 0 : t < 1.75 ? ease.outQuad((t - 1.5) / 0.25) : 1 - ease.inQuad(clamp01((t - 1.75) / 0.5));
      out.strip = t < 1.7 ? 0 : ease.outQuad(clamp01((t - 1.7) / 0.6));
      out.curtain = t < 0.5 ? 4 * Math.sin(TAU * 2 * t) * (1 - t / 0.5) : 0;
      return blendFrom(out, o.from, ['bloom', 'curtain'], t);
    } });

  /* Boba Café: the hatch flips up, a cup slides along the counter to the table, the giant
     sign's pearls swirl up a helix and settle, two hearts, the hatch closes */
  defBuildingAct({ name: 'serve', dur: 3, end: { hatch: 0, cup: 1, cupA: 0, swirl: 0 },
    cues: [{ t: 0.1, sfx: 'whoosh' }, { t: 0.9, sfx: 'pop', step: 0 }, { t: 1.1, sfx: 'pop', step: 2 },
           { t: 1.3, sfx: 'pop', step: 4 }, { t: 1.4, emit: 'heart', n: 2 }],
    sample: function (t, out, o) {
      if (o.reduced || t >= 3) return endInto(out, this.end);
      out.hatch = t < 0.1 ? 0 : t < 0.35 ? 110 * ease.outBack((t - 0.1) / 0.25) : t < 2.6 ? 110 : 110 * (1 - ease.inOutSine(clamp01((t - 2.6) / 0.3)));
      out.cup = t < 0.35 ? 0 : ease.inOutSine(clamp01((t - 0.35) / 0.5));
      out.cupA = t < 0.35 ? 0 : t < 2.4 ? clamp01((t - 0.35) / 0.1) : 1 - clamp01((t - 2.4) / 0.5);
      out.swirl = t < 0.9 ? 0 : t < 1.4 ? ease.inOutSine((t - 0.9) / 0.5) : 1 - ease.inOutSine(clamp01((t - 1.4) / 0.6));
      return blendFrom(out, o.from, ['hatch'], t);
    } });

  /* LED Screen Tower: a dark scanline band sweeps top to bottom (a moving wipe, never a
     dimming); prog flips 0 → 1 at 0.2 s = advance the program (the model rate-limits
     changes to one per RATE.screen s) */
  defBuildingAct({ name: 'screen', dur: 0.5, end: { wipe: 1, band: 0, prog: 1 },
    cues: [{ t: 0.2, sfx: 'beep' }, { t: 0.4, sfx: 'chip' }],
    sample: function (t, out, o) {
      if (o.reduced || t >= 0.5) return endInto(out, this.end);
      out.wipe = clamp01((t - 0.05) / 0.3);
      out.band = t < 0.05 ? 0 : t < 0.1 ? (t - 0.05) / 0.05 : t < 0.3 ? 1 : 1 - clamp01((t - 0.3) / 0.05);
      out.prog = t < 0.2 ? 0 : 1;
      return blendFrom(out, o.from, ['band'], t);
    } });

  /* Recording Studio: ON AIR switches on (and stays on: a re-tap never toggles it off), the
     VU level envelope runs 0.3–2.7 s (bar heights follow the music beat via vu()), a
     4-note phrase on the beeps and the active pet's voice (cue pet: true → that pet's step) */
  var RECORD_CUES = [];
  [[0.4, 0], [1.0, 2], [1.6, 4], [2.2, 7]].forEach(function (b) {
    RECORD_CUES.push({ t: b[0], sfx: 'beep', step: b[1] }, { t: b[0], emit: 'note', n: 1 });
  });
  RECORD_CUES.push({ t: 2.4, sfx: 'voice', pet: true });
  defBuildingAct({ name: 'record', dur: 3, end: { onAir: 1, level: 0 }, cues: RECORD_CUES,
    sample: function (t, out, o) {
      if (o.reduced || t >= 3) return endInto(out, this.end);
      var held = o.from && typeof o.from.onAir === 'number' ? clamp01(o.from.onAir) : 0;
      out.onAir = Math.max(held, ease.inOutSine(clamp01((t - 0.1) / 0.15)));
      out.level = env(t, 0.3, 0.5, 2.5, 2.7);
      return blendFrom(out, o.from, ['level'], t);
    } });

  /* Dance Studio: the floor chase and the speaker pump run under this envelope (the tiles
     step on the beat via diagChase(), each tile at most once per 4 beats) */
  defBuildingAct({ name: 'dance', dur: 3, end: { chase: 0, pump: 0 },
    cues: [{ t: 0.1, sfx: 'go' }, { t: 0.1, emit: 'note', n: 3 }],
    sample: function (t, out, o) {
      if (o.reduced || t >= 3) return endInto(out, this.end);
      out.chase = env(t, 0.1, 0.3, 2.6, 3);
      out.pump = env(t, 0.1, 0.3, 2.6, 3);
      return blendFrom(out, o.from, this.keys, t);
    } });

  /* Rooftop Hangout: the telescope swings 40° to the sky and back, the beanbags squish, the
     festoon bulbs brighten in a 0.8 Hz wave (wave() under this envelope), stars at 2.2 s */
  defBuildingAct({ name: 'hangout', dur: 3, end: { scope: 0, wave: 0, squish: 1 },
    cues: [{ t: 0.1, sfx: 'whoosh' }, { t: 2.2, sfx: 'star' }, { t: 2.2, emit: 'star', n: 3 }],
    sample: function (t, out, o) {
      if (o.reduced || t >= 3) return endInto(out, this.end);
      out.scope = 40 * env(t, 0.1, 0.7, 2.4, 3);
      out.wave = env(t, 0.3, 0.5, 1.8, 2);
      out.squish = t < 0.3 || t >= 0.8 ? 1 : t < 0.45 ? lerp(1, 0.92, ease.outQuad((t - 0.3) / 0.15))
        : t < 0.62 ? lerp(0.92, 1.03, ease.inOutSine((t - 0.45) / 0.17)) : lerp(1.03, 1, ease.inOutSine((t - 0.62) / 0.18));
      return blendFrom(out, o.from, ['scope', 'squish'], t);
    } });

  /* Concert Stage (building part): sting, the LED wall wipes to ENCORE (and stays there for
     the encore moment, which the scene owns), the moving heads swing to centre and back, the
     footlights chase, beams (alpha ≤ 0.18) under their envelope, confetti at 2.6 s */
  defBuildingAct({ name: 'encore', dur: 3, end: { wall: 1, heads: 0, chase: 0, beams: 0 },
    cues: [{ t: 0.1, sfx: 'sting' }, { t: 2.6, sfx: 'tada' }, { t: 2.6, emit: 'confetti', n: 30 }],
    sample: function (t, out, o) {
      if (o.reduced || t >= 3) return endInto(out, this.end);
      out.wall = clamp01((t - 0.1) / 0.4);
      out.heads = env(t, 0.1, 0.8, 2.4, 3);
      out.chase = env(t, 0.2, 0.4, 2.6, 3);
      out.beams = env(t, 0.1, 0.4, 2.5, 3);
      return blendFrom(out, o.from, ['heads', 'chase', 'beams'], t);
    } });

  /* ---------------- flash-safe light helpers for the city buildings ---------------- */
  /* rate gates: one local bloom per item per 1.5 s; one screen program change per 0.5 s */
  var RATE = { bloom: 1.5, screen: 0.5 };
  function allow(lastT, t, gap) { return lastT == null || !(t - lastT < gap); }
  /* VU bar i: smooth heights on a 4-beat pattern (no on/off), scaled by the act envelope */
  var VU = [0.55, 0.9, 0.7, 1.0];
  function vu(i, beat, beatFrac, level, reduced) {
    if (reduced) return 0.75 * level;
    var b = ((beat + i) % 4 + 4) % 4;
    return level * lerp(VU[b], VU[(b + 1) % 4], smoothstep(0, 1, beatFrac));
  }
  /* light-up floor tile (cx, cz): its diagonal lights for one beat in every `groups` beats,
     a soft sine within the beat; steady under reduced motion */
  function diagChase(cx, cz, beat, beatFrac, groups, reduced) {
    if (reduced) return 0.8;
    var g = Math.max(2, groups | 0), on = ((cx + cz) % g + g) % g === ((beat % g) + g) % g;
    return 0.35 + (on ? 0.65 * Math.sin(PI * clamp01(beatFrac)) : 0);
  }
  /* a travelling brightness wave over n lights at hz (≤ ±35%), scaled by an envelope */
  function wave(t, i, n, hz, level, reduced) {
    if (reduced) return 1;
    return 1 - 0.35 * clamp01(level) * (0.5 - 0.5 * Math.cos(TAU * (safeHz(hz) * t - i / Math.max(1, n))));
  }

  var NOOPT = {};
  function spec(name) { var s = ACTS[name]; if (!s) throw new Error('SLMotion: unknown act ' + name); return s; }
  function sample(name, t, out, o) { var s = spec(name); return s.sample(t, out || {}, o || NOOPT); }
  /* the pose to hand a restarted act (called once at the restart, so it may allocate) */
  function carry(name, out) {
    spec(name);
    var c = {};
    for (var k in out) if (typeof out[k] === 'number') c[k] = out[k];
    return c;
  }
  function cues(name, o) {
    var s = spec(name), list = o && o.reduced ? s.reducedCues : s.cues;
    if (typeof list === 'function') list = list(o || {});
    return list.slice().sort(function (a, b) { return a.t - b.t; });
  }
  function durOf(name, o) {
    var s = spec(name);
    if (o && o.reduced) return s.reducedDur;
    if (name === 'bounce') return leadOf(o) + BOUNCE.length;
    return s.dur;
  }
  /* CATALOG act → act timeline */
  function actFor(act, id, lit) {
    switch (act) {
      case 'glow': return lit ? 'glowOff' : 'glowOn';
      case 'wave': return id === 'bunting' ? 'bunting' : 'flag';
      case 'spin': return 'spin';
      case 'bounce': return 'bounce';
      case 'splash': return 'splash';
      case 'swing': return 'swing';
      case 'bubbles': return 'bubbles';
      case 'home': return 'home';
      case 'launch': return id === 'att_kart' ? 'kartRev' : 'launch';
      case 'serve': case 'snap': case 'screen': case 'record': case 'dance': case 'hangout': case 'encore': return act;
    }
    return null;
  }

  /* ---------------- scene timelines ---------------- */
  var SHOW_MIX_SEC = 1.6, SHOW_MIX_REDUCED_SEC = 0.25;
  /* Day ↔ Showtime: from k0 toward target over 1.6 s inOutSine (0.25 s linear under reduced motion) */
  function showMix(t, k0, target, reduced) {
    var d = reduced ? SHOW_MIX_REDUCED_SEC : SHOW_MIX_SEC, u = clamp01(t / d);
    return k0 + (target - k0) * (reduced ? u : ease.inOutSine(u));
  }
  /* land unlock: each cell pops up 0.35 s (outBack) after its stagger delay */
  var RISE = { stagger: 0.05, each: 0.35 };
  function landRise(t, delay, reduced, out) {
    out = out || {};
    if (reduced) { out.y01 = 1; out.a = clamp01(t / 0.25); return out; }
    var u = clamp01((t - (delay || 0)) / RISE.each);
    out.y01 = u <= 0 ? 0 : ease.outBack(u); out.a = 1;
    return out;
  }
  function riseDur(n) { return Math.max(0, n - 1) * RISE.stagger + RISE.each; }
  /* camera reveal moves (inOutSine; instant cuts under reduced motion) */
  var CRANE = { from: 52, to: 40, out: 1.4, hold: 1.5, back: 1.0 };
  CRANE.dur = CRANE.out + CRANE.hold + CRANE.back;
  function crane(t, reduced, out) {
    out = out || {};
    var k;
    if (reduced) k = t >= 0 && t < CRANE.out + CRANE.hold ? 1 : 0;
    else if (t < CRANE.out) k = ease.inOutSine(clamp01(t / CRANE.out));
    else if (t < CRANE.out + CRANE.hold) k = 1;
    else k = 1 - ease.inOutSine(clamp01((t - CRANE.out - CRANE.hold) / CRANE.back));
    out.k = k; out.elev = lerp(CRANE.from, CRANE.to, k);
    return out;
  }
  function pushIn(t, reduced) { return reduced ? 1 : ease.inOutSine(clamp01(t / 0.7)); }
  function orbit(t, reduced) { return reduced || t <= 0 || t >= 8 ? 0 : 8 * Math.sin(PI * t / 8); }

  return {
    MAX_FLASH_HZ: MAX_FLASH_HZ, safeHz: safeHz, ease: ease,
    clamp: clamp, clamp01: clamp01, lerp: lerp, smoothstep: smoothstep, frac: frac,
    hash: hash, phaseOf: phaseOf, beatInfo: beatInfo,
    sway: sway, bob: bob, spin: spin, flutter: flutter, pennant: pennant, every: every, blink: blink,
    pulse: pulse, twinkle: twinkle, chase: chase, chaseWave: chaseWave, glint: glint,
    smoke: smoke, drop: drop, idleBubble: idleBubble, petal: petal, snowSparkle: snowSparkle,
    avatarBob: avatarBob, beamAngle: beamAngle, beamColor: beamColor, coneSweep: coneSweep, drift: drift,
    bubbleTrack: bubbleTrack, ripple: ripple,
    ACTS: ACTS, BLEND: BLEND, SPIN: SPIN, SWING: SWING, BOUNCE: BOUNCE,
    sample: sample, carry: carry, cues: cues, durOf: durOf, actFor: actFor,
    ON_AIR_SEC: ON_AIR_SEC, STRIP_SEC: STRIP_SEC, RATE: RATE, allow: allow, vu: vu, diagChase: diagChase, wave: wave,
    SHOW_MIX_SEC: SHOW_MIX_SEC, SHOW_MIX_REDUCED_SEC: SHOW_MIX_REDUCED_SEC, showMix: showMix,
    RISE: RISE, landRise: landRise, riseDur: riseDur, CRANE: CRANE, crane: crane, pushIn: pushIn, orbit: orbit
  };
}));
