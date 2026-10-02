/* ================================================================
   Game A — Pet Obstacle Course (free starter game).
   The child's selected pet (with its accessories) runs a seeded course.
   Jump (and double-jump) over obstacles, collect treats and stars,
   reach the flag. Bumps only slow you briefly — nobody fails.
   Fairness: every generated course is checked by an autopilot in
   tests/games-logic.test.js (zero-hit completion on every seed).
   ================================================================ */
(function () {
  'use strict';
  var Shell = (typeof window !== 'undefined') ? window.SLGameShell : null;
  var LW = 960, LH = 540, GROUND = 452, PET_X = 170;
  var G = 2400, JUMP_V = 900, DJUMP_V = 760, COYOTE = 0.09, BUFFER = 0.12;
  var LENGTH = 21000, SPEED0 = 300, SPEED1 = 375;
  var PET_W = 62, PET_H = 56;                          /* forgiving hitbox (smaller than the art) */

  var THEMES = {
    course_meadow: { sky: ['#8fd8ff', '#d9f6ff'], hill: '#9fdc8a', hill2: '#7cc96e', ground: '#7ad06a', soil: '#c9925a', treat: 'bone',
      obs: { low: ['#ffffff', '#ff6b6b'], log: ['#a8743f', '#7a4f26'], hedge: ['#4caf50', '#2f8a3a'], stack: ['#e9b46a', '#b67f37'], puddle: '#6cc4ff' } },
    course_beach: { sky: ['#7fd0ff', '#fff3d6'], hill: '#4fc3f7', hill2: '#2fa3e0', ground: '#f3dc9a', soil: '#e2c27a', treat: 'fish',
      obs: { low: ['#ff6b4a', '#c43f2a'], log: ['#c9a06a', '#8d6a3d'], hedge: ['#f2cd7c', '#c99a4d'], stack: ['#ff8a5c', '#d0603a'], puddle: '#4fc3f7' } },
    course_snow: { sky: ['#a8c8ff', '#eef6ff'], hill: '#ffffff', hill2: '#dfeeff', ground: '#f4f9ff', soil: '#c9d9ee', treat: 'bone',
      obs: { low: ['#ff6b6b', '#c94a4a'], log: ['#6b8fd8', '#4a6fb8'], hedge: ['#ffffff', '#cdd9ea'], stack: ['#9fd0ff', '#6aa8e0'], puddle: '#bfe8ff' } },
    course_candy: { sky: ['#ffc6e5', '#fff0f8'], hill: '#ffb3d6', hill2: '#ff8fc4', ground: '#c38bff', soil: '#9b62e0', treat: 'sweet',
      obs: { low: ['#ffffff', '#ff5c8a'], log: ['#8a5a2b', '#6a3f1a'], hedge: ['#ff8fb8', '#e8679a'], stack: ['#ffd23f', '#e8b020'], puddle: '#a0522d' } }
  };
  var KINDS = {
    low:    { w: 30, h: 58 },
    log:    { w: 88, h: 44 },
    hedge:  { w: 68, h: 78 },
    stack:  { w: 56, h: 116 },
    puddle: { w: 108, h: 0 }
  };

  /* ---------- course generation (pure; also used by tests) ---------- */
  function speedAt(x) { var p = Math.min(1, Math.max(0, x / LENGTH)); return SPEED0 + (SPEED1 - SPEED0) * p; }
  function buildCourse(seed) {
    var r = Shell ? Shell.rng(seed) : null;
    if (!r) r = (function (s) { return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; })(seed >>> 0 || 1);
    var obs = [], items = [], x = 1100;
    while (x < LENGTH - 900) {
      var p = x / LENGTH, roll = r();
      var pool = p < 0.25 ? ['low', 'low', 'log', 'puddle'] : p < 0.6 ? ['low', 'log', 'hedge', 'puddle', 'stack'] : ['low', 'log', 'hedge', 'puddle', 'stack', 'stack'];
      var kind = pool[Math.floor(roll * pool.length)];
      var K = KINDS[kind];
      obs.push({ x: x, kind: kind, w: K.w, h: K.h, hit: false });
      /* treats in an arc over the obstacle reward jumping */
      var arcN = kind === 'puddle' ? 4 : 3;
      for (var i = 0; i < arcN; i++) {
        var t = (i + 1) / (arcN + 1);
        items.push({ x: x + K.w / 2 - 70 + t * 140, y: GROUND - 70 - Math.sin(t * Math.PI) * (K.h + 40), kind: 'treat', got: false });
      }
      /* a star high up after tall obstacles — reachable with a double jump */
      if ((kind === 'stack' || kind === 'hedge') && r() < 0.5) items.push({ x: x + K.w + 120, y: GROUND - 250, kind: 'star', got: false });
      /* gap: always enough room to land and jump again at the speed here */
      var sp = speedAt(x);
      var minGap = Math.ceil(sp * 0.82 + 60);
      var gap = minGap + Math.floor(r() * 260);
      /* ground treats in the gap */
      var gN = Math.floor(gap / 160);
      for (var j = 1; j < gN; j++) items.push({ x: x + K.w + j * 160 - 20, y: GROUND - 30, kind: 'treat', got: false });
      x += K.w + gap;
    }
    return { obs: obs, items: items, length: LENGTH };
  }

  /* ---------- a round ---------- */
  function newRound(api, variant, cfg) {
    var theme = THEMES[variant] || THEMES.course_meadow;
    var seed = (cfg && cfg.seed) || (Date.now() & 0x7fffffff) || 7;
    var course = buildCourse(seed);
    var s = {
      dist: 0, y: 0, vy: 0, onGround: true, airJumps: 1, coyote: 0, buffer: 0,
      slow: 0, inv: 0, hits: 0, treats: 0, stars: 0, t: 0, done: false, finishT: 0, frame: 0, frameT: 0,
      parts: [], flash: 0
    };
    var imgs = petImages;
    var round = {
      done: false,
      course: course, state: s,
      step: function (dt, held) {
        if (round.done) return;
        s.t += dt;
        if (s.dist >= course.length) {
          s.finishT += dt;
          if (s.finishT > 1.2) round.done = true;
          return;
        }
        var spd = speedAt(s.dist) * (s.slow > 0 ? 0.55 + 0.45 * (1 - s.slow / 0.9) : 1);
        s.slow = Math.max(0, s.slow - dt);
        s.inv = Math.max(0, s.inv - dt);
        s.dist += spd * dt;
        /* jump buffer + coyote time make timing forgiving */
        s.buffer = Math.max(0, s.buffer - dt);
        if (s.onGround) s.coyote = COYOTE; else s.coyote = Math.max(0, s.coyote - dt);
        if (s.buffer > 0 && (s.onGround || s.coyote > 0)) { s.vy = -JUMP_V; s.onGround = false; s.coyote = 0; s.buffer = 0; api.sound('jump'); }
        s.vy += G * dt;
        s.y += s.vy * dt;
        if (s.y >= 0) {
          if (!s.onGround && s.vy > 300 && !api.reduced) for (var d = 0; d < 4; d++) s.parts.push({ x: PET_X + 30 + d * 10, y: GROUND, vx: -40 - d * 20, vy: -60 - d * 15, life: 0.35, c: theme.soil });
          s.y = 0; s.vy = 0; s.onGround = true; s.airJumps = 1;
        }
        /* collisions (forgiving hitbox) */
        var pl = s.dist + PET_X + 34, pr = pl + PET_W, pb = GROUND + s.y, pt = pb - PET_H;
        for (var i = 0; i < course.obs.length; i++) {
          var o = course.obs[i];
          if (o.x > pr + 10) break;
          if (o.x + o.w < pl - 10 || o.hit) continue;
          var ox1 = o.x + 4, ox2 = o.x + o.w - 4, oyTop = GROUND - o.h;
          var overlapX = pr > ox1 && pl < ox2;
          var hit = o.kind === 'puddle' ? (overlapX && s.y > -2) : (overlapX && pb > oyTop + 6);
          if (hit && s.inv <= 0) {
            o.hit = true; s.hits += 1; s.slow = 0.9; s.inv = 1.2; s.flash = 0.25;
            api.sound(o.kind === 'puddle' ? 'bump' : 'bump');
            if (!api.reduced) for (var k = 0; k < 6; k++) s.parts.push({ x: PET_X + 60, y: pb - 20, vx: -120 + k * 30, vy: -200 + k * 20, life: 0.5, c: o.kind === 'puddle' ? theme.obs.puddle : '#ffffff' });
          }
        }
        /* pickups */
        var cx = s.dist + PET_X + 60, cy = GROUND + s.y - 40;
        for (var n = 0; n < course.items.length; n++) {
          var it = course.items[n];
          if (it.got) continue;
          if (it.x > cx + 60) break;
          if (Math.abs(it.x - cx) < 40 && Math.abs(it.y - cy) < 46) {
            it.got = true;
            if (it.kind === 'star') { s.stars++; api.sound('coin'); } else { s.treats++; api.sound('coin'); }
            if (!api.reduced) for (var q = 0; q < 5; q++) s.parts.push({ x: it.x - s.dist, y: it.y, vx: Math.cos(q * 1.26) * 120, vy: Math.sin(q * 1.26) * 120, life: 0.4, c: it.kind === 'star' ? '#ffd23f' : '#ffffff' });
          }
        }
        s.parts.forEach(function (pp) { pp.x += pp.vx * dt; pp.y += pp.vy * dt; pp.vy += 600 * dt; pp.life -= dt; });
        s.parts = s.parts.filter(function (pp) { return pp.life > 0; });
        s.flash = Math.max(0, s.flash - dt);
        s.frameT += dt * (spd / 300);
        if (s.frameT > 0.13) { s.frameT = 0; s.frame = 1 - s.frame; }
      },
      input: function (id, down) {
        if (id !== 'jump' || !down || round.done) return;
        if (s.onGround || s.coyote > 0) { s.vy = -JUMP_V; s.onGround = false; s.coyote = 0; api.sound('jump'); }
        else if (s.airJumps > 0) { s.airJumps -= 1; s.vy = -DJUMP_V; api.sound('jump'); }
        else s.buffer = BUFFER;               /* pressed just before landing: jump on touchdown */
      },
      forceEnd: function () { s.dist = course.length; round.done = true; },
      hud: function () { return '🦴 ' + s.treats + '  ⭐ ' + s.stars + '  🏁 ' + Math.min(100, Math.floor(s.dist / course.length * 100)) + '%'; },
      score: function () { return s.treats * 10 + s.stars * 50 + Math.max(0, 600 - 100 * s.hits); },
      result: function () { return { score: Math.min(5000, round.score()) }; },
      summaryTitle: function () { return s.dist >= course.length ? '🏁 Finished!' : 'Round over'; },
      summaryBig: function () { return round.score() + ' pts'; },
      summaryText: function () { return '🦴 ' + s.treats + ' treats · ⭐ ' + s.stars + ' stars · ' + (s.hits ? s.hits + ' bump' + (s.hits > 1 ? 's' : '') : 'no bumps — perfect run! (+600)'); },
      /* autopilot: used for the shop preview and the fairness tests */
      autoHeld: {},
      autopilot: function () { var a = autopilotWants(s, course); if (a) round.input('jump', true); },
      render: function (ctx) { render(ctx, s, course, theme, imgs, cfg, api); }
    };
    return round;
  }

  /* jump when the next obstacle is at the right distance for this height */
  function clearWindow(h) {
    /* times after take-off when the pet's feet are above height h */
    var a = G / 2, b = -JUMP_V, c = h + 8;
    var disc = b * b - 4 * a * c; if (disc < 0) return null;
    var r = Math.sqrt(disc);
    return [(-b - r) / (2 * a), (-b + r) / (2 * a)];
  }
  function autopilotWants(s, course) {
    if (!(s.onGround || s.coyote > 0)) return false;
    var pl = s.dist + PET_X + 34, pr = pl + PET_W, spd = speedAt(s.dist) * (s.slow > 0 ? 0.55 : 1);
    for (var i = 0; i < course.obs.length; i++) {
      var o = course.obs[i];
      if (o.x + o.w < pl) continue;
      var w = clearWindow(o.kind === 'puddle' ? 2 : o.h);
      /* same edges the collision test uses (4 px forgiveness each side) */
      var enter = (o.x + 4 - pr) / spd;
      /* jump at the latest moment the front still clears */
      return enter <= w[0] + 0.015;
    }
    return false;
  }

  /* ---------- drawing ---------- */
  function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function render(ctx, s, course, th, imgs, cfg, api) {
    var cam = s.dist;
    var sky = ctx.createLinearGradient(0, 0, 0, GROUND);
    sky.addColorStop(0, th.sky[0]); sky.addColorStop(1, th.sky[1]);
    ctx.fillStyle = sky; ctx.fillRect(0, 0, LW, LH);
    /* sun + clouds (parallax) */
    ctx.fillStyle = 'rgba(255,240,150,0.9)'; ctx.beginPath(); ctx.arc(820, 90, 44, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (var c = 0; c < 5; c++) {
      var cx = ((c * 260 - cam * 0.08) % 1300 + 1300) % 1300 - 150, cy = 70 + (c % 3) * 40;
      ctx.beginPath(); ctx.arc(cx, cy, 26, 0, 7); ctx.arc(cx + 30, cy - 10, 32, 0, 7); ctx.arc(cx + 62, cy, 24, 0, 7); ctx.fill();
    }
    /* hills */
    [[th.hill2, 0.18, 300, 120], [th.hill, 0.35, 340, 90]].forEach(function (h) {
      ctx.fillStyle = h[0]; ctx.beginPath(); ctx.moveTo(0, GROUND);
      for (var x = 0; x <= LW + 40; x += 40) ctx.lineTo(x, h[2] + Math.sin((x + cam * h[1]) / 140) * 26 + Math.sin((x + cam * h[1]) / 61) * 10);
      ctx.lineTo(LW, GROUND); ctx.closePath(); ctx.fill();
    });
    /* ground */
    ctx.fillStyle = th.soil; ctx.fillRect(0, GROUND, LW, LH - GROUND);
    ctx.fillStyle = th.ground; ctx.fillRect(0, GROUND, LW, 18);
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    for (var gx = -((cam) % 60); gx < LW; gx += 60) ctx.fillRect(gx, GROUND + 30, 30, 6);
    /* finish line */
    var fx = course.length - cam + PET_X + 60;
    if (fx < LW + 80) {
      for (var fy = 0; fy < 8; fy++) for (var fx2 = 0; fx2 < 2; fx2++) { ctx.fillStyle = (fy + fx2) % 2 ? '#fff' : '#3b2f4a'; ctx.fillRect(fx + fx2 * 14, GROUND - 160 + fy * 20, 14, 20); }
      ctx.fillStyle = '#3b2f4a'; ctx.fillRect(fx - 4, GROUND - 170, 6, 170);
      ctx.fillStyle = '#ffd23f'; ctx.font = '800 26px "Baloo 2", sans-serif'; ctx.textAlign = 'center'; ctx.fillText('FINISH', fx + 14, GROUND - 180);
    }
    /* obstacles */
    course.obs.forEach(function (o) {
      var x = o.x - cam + PET_X; if (x < -140 || x > LW + 40) return;
      var col = th.obs[o.kind === 'puddle' ? 'puddle' : o.kind];
      ctx.save();
      if (o.hit && o.kind !== 'puddle') { ctx.translate(x + o.w / 2, GROUND); ctx.rotate(0.18); ctx.translate(-(x + o.w / 2), -GROUND); }
      ctx.lineWidth = 3; ctx.strokeStyle = '#3b2f4a';
      if (o.kind === 'puddle') { ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(x + o.w / 2, GROUND + 6, o.w / 2, 10, 0, 0, 7); ctx.fill(); ctx.stroke(); }
      else if (o.kind === 'low') { ctx.fillStyle = col[0]; ctx.fillRect(x, GROUND - o.h, 8, o.h); ctx.fillRect(x + o.w - 8, GROUND - o.h, 8, o.h); ctx.strokeRect(x, GROUND - o.h, 8, o.h); ctx.strokeRect(x + o.w - 8, GROUND - o.h, 8, o.h); ctx.fillStyle = col[1]; roundRect(ctx, x - 8, GROUND - o.h, o.w + 16, 14, 6); ctx.fill(); ctx.stroke(); }
      else if (o.kind === 'log') { ctx.fillStyle = col[0]; roundRect(ctx, x, GROUND - o.h, o.w, o.h, o.h / 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = col[1]; ctx.beginPath(); ctx.ellipse(x + o.w - o.h / 2, GROUND - o.h / 2, o.h / 2 - 6, o.h / 2 - 6, 0, 0, 7); ctx.fill(); }
      else if (o.kind === 'hedge') { ctx.fillStyle = col[0]; ctx.beginPath(); ctx.arc(x + o.w * 0.3, GROUND - o.h * 0.45, o.h * 0.45, 0, 7); ctx.arc(x + o.w * 0.7, GROUND - o.h * 0.45, o.h * 0.45, 0, 7); ctx.arc(x + o.w * 0.5, GROUND - o.h * 0.62, o.h * 0.4, 0, 7); ctx.fill(); ctx.stroke(); ctx.fillStyle = col[1]; ctx.beginPath(); ctx.arc(x + o.w * 0.4, GROUND - o.h * 0.5, 6, 0, 7); ctx.fill(); }
      else if (o.kind === 'stack') { for (var b = 0; b < 2; b++) { ctx.fillStyle = b ? col[1] : col[0]; roundRect(ctx, x, GROUND - (b + 1) * (o.h / 2), o.w, o.h / 2 - 2, 6); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x + 8, GROUND - (b + 1) * (o.h / 2) + 8); ctx.lineTo(x + o.w - 8, GROUND - b * (o.h / 2) - 10); ctx.stroke(); } }
      ctx.restore();
    });
    /* pickups */
    course.items.forEach(function (it) {
      if (it.got) return;
      var x = it.x - cam + PET_X; if (x < -30 || x > LW + 30) return;
      ctx.lineWidth = 2.5; ctx.strokeStyle = '#3b2f4a';
      if (it.kind === 'star') { star(ctx, x, it.y, 18, '#ffd23f'); }
      else if (th.treat === 'fish') { ctx.fillStyle = '#ff9f43'; ctx.beginPath(); ctx.ellipse(x, it.y, 14, 8, 0, 0, 7); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x - 12, it.y); ctx.lineTo(x - 22, it.y - 8); ctx.lineTo(x - 22, it.y + 8); ctx.closePath(); ctx.fill(); ctx.stroke(); }
      else if (th.treat === 'sweet') { ctx.fillStyle = '#ff5c8a'; ctx.beginPath(); ctx.arc(x, it.y, 9, 0, 7); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(x - 9, it.y); ctx.lineTo(x - 18, it.y - 7); ctx.lineTo(x - 18, it.y + 7); ctx.closePath(); ctx.moveTo(x + 9, it.y); ctx.lineTo(x + 18, it.y - 7); ctx.lineTo(x + 18, it.y + 7); ctx.closePath(); ctx.fill(); }
      else { ctx.fillStyle = '#fff6e0'; ctx.beginPath(); ctx.arc(x - 10, it.y - 4, 6, 0, 7); ctx.arc(x - 10, it.y + 4, 6, 0, 7); ctx.arc(x + 10, it.y - 4, 6, 0, 7); ctx.arc(x + 10, it.y + 4, 6, 0, 7); ctx.fill(); ctx.fillRect(x - 10, it.y - 4, 20, 8); ctx.stroke(); }
    });
    /* pet */
    var py = GROUND + s.y - 108;
    var blink = s.inv > 0 && Math.floor(s.t * 10) % 2 === 0;
    ctx.save();
    if (blink) ctx.globalAlpha = 0.45;
    var img = imgs && imgs[s.onGround ? s.frame : 1];
    if (img) ctx.drawImage(img, PET_X, py, 132, 110);
    else { ctx.fillStyle = '#e3b077'; ctx.beginPath(); ctx.ellipse(PET_X + 66, py + 70, 40, 26, 0, 0, 7); ctx.fill(); }
    ctx.restore();
    /* particles */
    s.parts.forEach(function (p) { ctx.globalAlpha = Math.max(0, p.life * 2); ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, 7); ctx.fill(); });
    ctx.globalAlpha = 1;
    if (s.flash > 0 && !api.reduced) { ctx.fillStyle = 'rgba(255,255,255,' + (s.flash * 1.2).toFixed(2) + ')'; ctx.fillRect(0, 0, LW, LH); }
    /* progress bar */
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; roundRect(ctx, 260, 18, 440, 14, 7); ctx.fill();
    ctx.fillStyle = '#ffd23f'; roundRect(ctx, 260, 18, Math.max(14, 440 * Math.min(1, s.dist / course.length)), 14, 7); ctx.fill();
    ctx.font = '800 16px "Baloo 2", sans-serif'; ctx.fillStyle = '#3b2f4a'; ctx.textAlign = 'left';
    ctx.fillText((cfg && cfg.pet ? cfg.pet.name : 'Pet') + '’s run', 262, 54);
    if (s.dist >= course.length) { ctx.font = '800 64px "Baloo 2", sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#ffd23f'; ctx.strokeStyle = '#3b2f4a'; ctx.lineWidth = 6; ctx.strokeText('🏁 FINISHED!', LW / 2, LH / 2 - 30); ctx.fillText('🏁 FINISHED!', LW / 2, LH / 2 - 30); }
  }
  function star(ctx, x, y, r, col) {
    ctx.fillStyle = col; ctx.beginPath();
    for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }

  /* pet sprites (two run frames) from the island art, with accessories */
  var petImages = null;
  function preload(cfg) {
    var pet = (cfg && cfg.pet) || { id: 'pet_puppy', acc: {} };
    if (!window.SLWorldArt) return Promise.resolve();
    return Promise.all([0, 1].map(function (f) { return Shell.svgImage(window.SLWorldArt.pet(pet.id, { acc: pet.acc, frame: f })); }))
      .then(function (imgs) { petImages = imgs; });
  }
  function idle(ctx, cfg) {
    var th = THEMES[cfg && cfg.variant] || THEMES.course_meadow;
    render(ctx, { dist: 0, y: 0, parts: [], inv: 0, t: 0, onGround: true, frame: 0, flash: 0 }, { obs: [], items: [], length: LENGTH }, th, petImages, cfg, { reduced: true });
  }

  var def = {
    key: 'course', title: 'Pet Obstacle Course', emoji: '🐾', LW: LW, LH: LH, defaultVariant: 'course_meadow',
    tutorial: [['👆', 'Tap the screen, press Space or ⬆ to jump'], ['✌️', 'Tap again in the air for a double jump'], ['🦴', 'Grab treats and ⭐ stars for points'], ['🏁', 'Reach the flag! Bumps only slow you down']],
    controls: [{ id: 'jump', label: '⬆ JUMP', side: 'right', wide: true }],
    keys: { ' ': 'jump', 'ArrowUp': 'jump', 'w': 'jump', 'W': 'jump', 'Enter': 'jump' },
    tapAction: 'jump',
    countdown: 3,
    preload: preload, idle: idle, newRound: newRound
  };
  if (Shell) Shell.define(def);
  /* exported for the Node fairness tests */
  if (typeof module === 'object' && module.exports) module.exports = { buildCourse: buildCourse, newRound: newRound, LENGTH: LENGTH, autopilotWants: autopilotWants, KINDS: KINDS };
})();
