/* ================================================================
   My Island games — shared "juice": particles, pop-up text, screen
   shake, flashes and easing. Pure maths + canvas drawing, no DOM, so
   games can use it in the browser (window.SLGameFX) and in Node tests
   (require('./fx.js')). Everything is deterministic given its inputs
   and honours reduced motion (pass reduced=true: no shake, fewer bits).
   ================================================================ */
(function (root) {
  'use strict';

  /* ---------- easing ---------- */
  var ease = {
    linear: function (t) { return t; },
    outQuad: function (t) { return 1 - (1 - t) * (1 - t); },
    inQuad: function (t) { return t * t; },
    outBack: function (t) { var c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
    outElastic: function (t) { if (t === 0 || t === 1) return t; return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI) / 3) + 1; },
    inOutSine: function (t) { return -(Math.cos(Math.PI * t) - 1) / 2; }
  };
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }

  /* tiny deterministic PRNG so effects don't need Math.random */
  function rng(seed) {
    var s = (seed >>> 0) || 1;
    return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  }

  /* ---------- particles + floating text ----------
     var fx = FX.particles({ reduced: api.reduced, max: 300 });
     fx.burst(x, y, { n: 14, colors: ['#ffd23f','#fff'], speed: 260, life: 0.7, gravity: 900, size: 6, shape: 'dot'|'star'|'square'|'spark', spread: Math.PI*2, angle: -Math.PI/2 });
     fx.text(x, y, '+10', { color: '#ffd23f', size: 30, life: 0.9, vy: -70, stroke: '#3b2f4a' });
     fx.ring(x, y, { color: '#fff', r0: 10, r1: 70, life: 0.4, width: 6 });
     fx.step(dt); fx.draw(ctx);            (call draw inside your world transform)  */
  function particles(opts) {
    opts = opts || {};
    var reduced = !!opts.reduced, max = opts.max || 300;
    var R = rng(opts.seed || 1234567);
    var list = [], texts = [], rings = [];
    function burst(x, y, o) {
      o = o || {};
      var n = Math.round((o.n || 12) * (reduced ? 0.4 : 1));
      var colors = o.colors || ['#ffd23f', '#ffffff'];
      for (var i = 0; i < n && list.length < max; i++) {
        var spread = o.spread == null ? Math.PI * 2 : o.spread;
        var a = (o.angle == null ? -Math.PI / 2 : o.angle) + (R() - 0.5) * spread;
        var sp = (o.speed || 240) * (0.45 + R() * 0.75);
        list.push({
          x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          g: o.gravity == null ? 900 : o.gravity, drag: o.drag == null ? 1.5 : o.drag,
          life: (o.life || 0.7) * (0.7 + R() * 0.6), t: 0,
          size: (o.size || 6) * (0.6 + R() * 0.8), color: colors[(R() * colors.length) | 0],
          shape: o.shape || 'dot', rot: R() * 6.28, vr: (R() - 0.5) * 12
        });
      }
    }
    function text(x, y, str, o) {
      o = o || {};
      texts.push({ x: x, y: y, str: String(str), color: o.color || '#ffd23f', stroke: o.stroke === undefined ? '#3b2f4a' : o.stroke,
        size: o.size || 30, life: o.life || 0.9, t: 0, vy: o.vy == null ? -70 : o.vy, pop: o.pop !== false });
    }
    function ring(x, y, o) {
      o = o || {};
      if (reduced && o.optional) return;
      rings.push({ x: x, y: y, color: o.color || '#ffffff', r0: o.r0 || 8, r1: o.r1 || 60, life: o.life || 0.4, t: 0, width: o.width || 6 });
    }
    function step(dt) {
      var i, p;
      for (i = list.length - 1; i >= 0; i--) {
        p = list[i]; p.t += dt;
        if (p.t >= p.life) { list.splice(i, 1); continue; }
        var d = Math.max(0, 1 - p.drag * dt);
        p.vx *= d; p.vy = p.vy * d + p.g * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      }
      for (i = texts.length - 1; i >= 0; i--) { p = texts[i]; p.t += dt; p.y += p.vy * dt; if (p.t >= p.life) texts.splice(i, 1); }
      for (i = rings.length - 1; i >= 0; i--) { p = rings[i]; p.t += dt; if (p.t >= p.life) rings.splice(i, 1); }
    }
    function star(ctx, r) {
      ctx.beginPath();
      for (var k = 0; k < 10; k++) { var rr = k % 2 ? r * 0.45 : r, a = k * Math.PI / 5 - Math.PI / 2; ctx[k ? 'lineTo' : 'moveTo'](Math.cos(a) * rr, Math.sin(a) * rr); }
      ctx.closePath(); ctx.fill();
    }
    function draw(ctx) {
      var i, p, k;
      for (i = 0; i < rings.length; i++) {
        p = rings[i]; k = p.t / p.life;
        ctx.globalAlpha = 1 - k; ctx.strokeStyle = p.color; ctx.lineWidth = p.width * (1 - k * 0.6);
        ctx.beginPath(); ctx.arc(p.x, p.y, lerp(p.r0, p.r1, ease.outQuad(k)), 0, Math.PI * 2); ctx.stroke();
      }
      for (i = 0; i < list.length; i++) {
        p = list[i]; k = p.t / p.life;
        ctx.globalAlpha = k > 0.6 ? (1 - k) / 0.4 : 1;
        ctx.fillStyle = p.color;
        if (p.shape === 'dot') { ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1 - k * 0.5), 0, Math.PI * 2); ctx.fill(); }
        else {
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          if (p.shape === 'star') star(ctx, p.size * 1.3);
          else if (p.shape === 'spark') ctx.fillRect(-p.size * 1.6, -p.size * 0.25, p.size * 3.2, p.size * 0.5);
          else ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
          ctx.restore();
        }
      }
      ctx.globalAlpha = 1;
      for (i = 0; i < texts.length; i++) {
        p = texts[i]; k = p.t / p.life;
        var sc = p.pop && !reduced ? (k < 0.18 ? ease.outBack(k / 0.18) : 1) : 1;
        ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
        ctx.save(); ctx.translate(p.x, p.y); ctx.scale(sc, sc);
        ctx.font = '800 ' + p.size + 'px "Baloo 2", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        if (p.stroke) { ctx.lineWidth = Math.max(3, p.size / 6); ctx.strokeStyle = p.stroke; ctx.lineJoin = 'round'; ctx.strokeText(p.str, 0, 0); }
        ctx.fillStyle = p.color; ctx.fillText(p.str, 0, 0);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }
    return {
      burst: burst, text: text, ring: ring, step: step, draw: draw,
      count: function () { return list.length + texts.length + rings.length; },
      clear: function () { list.length = 0; texts.length = 0; rings.length = 0; }
    };
  }

  /* ---------- screen shake ----------
     var sh = FX.shaker(api.reduced); sh.kick(10, 0.3); sh.step(dt);
     var o = sh.offset(); ctx.translate(o[0], o[1]);   (no movement with reduced motion) */
  function shaker(reduced) {
    var mag = 0, dur = 0, t = 0, ph = 0;
    return {
      kick: function (m, d) { if (reduced) return; if (m >= mag * (1 - t / (dur || 1))) { mag = m; dur = d || 0.3; t = 0; } },
      step: function (dt) { if (t < dur) { t += dt; ph += dt * 60; } },
      offset: function () {
        if (reduced || t >= dur) return [0, 0];
        var k = 1 - t / dur, m = mag * k * k;
        return [Math.sin(ph * 1.7) * m, Math.cos(ph * 2.3) * m * 0.8];
      },
      active: function () { return t < dur; }
    };
  }

  /* ---------- full-screen flash (e.g. a hit or a goal) ----------
     var fl = FX.flash(); fl.fire('#fff', 0.25, 0.5); fl.step(dt); fl.draw(ctx, w, h); */
  function flash(reduced) {
    var col = '#fff', t = 1, dur = 0.2, peak = 0.4;
    return {
      fire: function (c, d, p) { col = c || '#fff'; dur = d || 0.2; peak = (p == null ? 0.4 : p) * (reduced ? 0.4 : 1); t = 0; },
      step: function (dt) { if (t < dur) t += dt; },
      draw: function (ctx, w, h) { if (t >= dur) return; ctx.globalAlpha = peak * (1 - t / dur); ctx.fillStyle = col; ctx.fillRect(0, 0, w, h); ctx.globalAlpha = 1; }
    };
  }

  /* ---------- big centre banner ("COMBO x3!", "GOAL!") ----------
     var bn = FX.banner(reduced); bn.show('GOAL!', {color, sub, life}); bn.step(dt); bn.draw(ctx, cx, cy); */
  function banner(reduced) {
    var cur = null;
    return {
      show: function (txt, o) { o = o || {}; cur = { txt: txt, sub: o.sub || '', color: o.color || '#ffd23f', life: o.life || 1.1, size: o.size || 64, t: 0 }; },
      step: function (dt) { if (cur) { cur.t += dt; if (cur.t >= cur.life) cur = null; } },
      active: function () { return !!cur; },
      draw: function (ctx, cx, cy) {
        if (!cur) return;
        var k = cur.t / cur.life, sc = reduced ? 1 : (k < 0.2 ? ease.outBack(k / 0.2) : 1);
        ctx.save(); ctx.translate(cx, cy); ctx.scale(sc, sc);
        ctx.globalAlpha = k > 0.8 ? (1 - k) / 0.2 : 1;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
        ctx.font = '800 ' + cur.size + 'px "Baloo 2", sans-serif';
        ctx.lineWidth = cur.size / 6; ctx.strokeStyle = '#3b2f4a'; ctx.strokeText(cur.txt, 0, 0);
        ctx.fillStyle = cur.color; ctx.fillText(cur.txt, 0, 0);
        if (cur.sub) {
          ctx.font = '800 ' + Math.round(cur.size * 0.42) + 'px "Baloo 2", sans-serif';
          ctx.lineWidth = 6; ctx.strokeText(cur.sub, 0, cur.size * 0.75); ctx.fillStyle = '#fff'; ctx.fillText(cur.sub, 0, cur.size * 0.75);
        }
        ctx.restore(); ctx.globalAlpha = 1;
      }
    };
  }

  var FX = { ease: ease, clamp: clamp, lerp: lerp, rng: rng, particles: particles, shaker: shaker, flash: flash, banner: banner };
  if (typeof module === 'object' && module.exports) module.exports = FX;
  if (typeof window !== 'undefined') window.SLGameFX = FX;
})(this);
