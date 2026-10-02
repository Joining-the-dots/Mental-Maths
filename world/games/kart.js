/* ================================================================
   Game C — Kart Time Trial (unlocked by the Kart Garage).
   Top-down, 4 laps against the clock. Grass slows you, tyre walls
   stop you (predictably). A lap only counts when you pass the three
   checkpoint gates in order and then the finish line going forwards:
   driving backwards, cutting across, or wiggling over the line never
   counts. Progress is measured along the track's centreline.
   ================================================================ */
(function () {
  'use strict';
  var Shell = (typeof window !== 'undefined') ? window.SLGameShell : null;
  var LW = 960, LH = 540, SCALE = 2.4, WW = Math.round(960 * SCALE), WH = Math.round(540 * SCALE);
  var HW = 50, KERB = 8, VERGE = 46, WALL = HW + VERGE + 14;   /* half-widths from the centreline */
  var LAPS = 3, CHECKS = [0.25, 0.5, 0.75];   /* default; tracks may set their own */
  var ACCEL = 430, BRAKE = 620, DRAG = 260, VMAX = 270, VMAX_GRASS = 135, VREV = -110, TURN = 2.9;

  var TRACKS = {
    track_loop: { name: 'Island Loop', laps: 3, grass: '#7ad06a', deco: 'palms',
      pts: [[160, 130], [330, 95], [520, 110], [700, 92], [840, 150], [868, 270], [820, 395], [640, 448], [470, 418], [300, 450], [140, 400], [96, 270]] },
    track_volcano: { name: 'Volcano Ring', laps: 3, grass: '#9cc46a', deco: 'volcano',
      pts: [[140, 120], [320, 92], [440, 170], [560, 96], [780, 110], [870, 220], [800, 300], [870, 410], [700, 455], [520, 385], [360, 452], [170, 430], [92, 300], [160, 230]] },
    track_beach: { name: 'Beach Hairpins', laps: 2, grass: '#f3dc9a', deco: 'beach',
      /* three wide semicircle hairpins: the two legs of each bend stay well apart */
      pts: [[120, 100], [845, 100], [889, 118], [907, 162], [889, 207], [845, 225], [300, 225], [250, 246], [230, 295], [250, 344], [300, 365],
            [845, 365], [882, 380], [897, 417], [882, 455], [845, 470], [150, 470], [80, 290]] }
  };

  /* ---------- track geometry (pure) ---------- */
  function catmull(pts, perSeg) {
    var out = [], n = pts.length;
    for (var i = 0; i < n; i++) {
      var p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      for (var k = 0; k < perSeg; k++) {
        var t = k / perSeg, t2 = t * t, t3 = t2 * t;
        out.push([
          0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
          0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
        ]);
      }
    }
    return out;
  }
  /* even spacing along the curve, so 'N samples ahead' means the same distance everywhere */
  function resample(raw, step) {
    var out = [raw[0]], carry = 0, m = raw.length;
    for (var i = 0; i < m; i++) {
      var a = raw[i], b = raw[(i + 1) % m], seg = Math.hypot(b[0] - a[0], b[1] - a[1]), d = step - carry;
      while (d <= seg) { var f = d / seg; out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]); d += step; }
      carry = seg - (d - step);
    }
    if (out.length > 1) { var l = out[out.length - 1]; if (Math.hypot(l[0] - out[0][0], l[1] - out[0][1]) < step * 0.5) out.pop(); }
    return out;
  }
  function buildTrack(id) {
    var T = TRACKS[id] || TRACKS.track_loop;
    var pts = resample(catmull(T.pts.map(function (q) { return [q[0] * SCALE, q[1] * SCALE]; }), 60), 16), n = pts.length, cum = [0], len = 0;
    for (var i = 1; i <= n; i++) { var a = pts[i - 1], b = pts[i % n]; len += Math.hypot(b[0] - a[0], b[1] - a[1]); if (i < n) cum.push(len); }
    var tang = pts.map(function (p, i) { var q = pts[(i + 1) % n], r = pts[(i - 1 + n) % n]; var dx = q[0] - r[0], dy = q[1] - r[1], m = Math.hypot(dx, dy) || 1; return [dx / m, dy / m]; });
    return { id: id, name: T.name, laps: T.laps || LAPS, grass: T.grass, deco: T.deco, pts: pts, cum: cum, len: len, tang: tang, n: n, spacing: len / n };
  }
  /* nearest centreline sample, searched near the last known one (so a
     neighbouring straight can never "steal" the kart) */
  function nearest(track, x, y, hint) {
    /* the kart moves only a few pixels per step, so tracking stays continuous:
       a tight window means a neighbouring straight can never be picked */
    var best = hint, bd = Infinity, n = track.n, span = hint == null ? n : 8;
    var from = hint == null ? 0 : hint - span;
    for (var k = 0; k < (hint == null ? n : span * 2 + 1); k++) {
      var i = ((from + k) % n + n) % n, p = track.pts[i];
      var d = (p[0] - x) * (p[0] - x) + (p[1] - y) * (p[1] - y);
      if (d < bd) { bd = d; best = i; }
    }
    return { i: best, d: Math.sqrt(bd) };
  }
  function wrapDelta(track, a, b) { var d = b - a; if (d > track.len / 2) d -= track.len; if (d < -track.len / 2) d += track.len; return d; }

  /* progress bookkeeping shared by the game and the tests */
  function newProgress(track) {
    return { idx: 0, s: 0, P: 0, lap: 0, next: 0, back: 0, lapStartT: 0, laps: [], finished: false, crossedLog: [] };
  }
  function updateProgress(track, pr, x, y, maxStep, t) {
    var nb = nearest(track, x, y, pr.idx);
    var sNow = track.cum[nb.i];
    var ds = wrapDelta(track, pr.s, sNow);
    if (Math.abs(ds) > maxStep) ds = 0;            /* a jump across the infield earns nothing */
    pr.idx = nb.i; pr.s = sNow; pr.P += ds;
    pr.back = ds < -0.01 ? pr.back + 1 : Math.max(0, pr.back - 2);
    var lapBase = pr.lap * track.len;
    /* checkpoints, in order, forwards only */
    while (pr.next < CHECKS.length && pr.P >= lapBase + CHECKS[pr.next] * track.len) { pr.next++; pr.crossedLog.push('cp' + pr.next); if (pr.onCheck) pr.onCheck(pr.next); }
    /* the finish line only counts after all three gates this lap */
    if (pr.next === CHECKS.length && pr.P >= lapBase + track.len) {
      pr.laps.push(t - pr.lapStartT); pr.lapStartT = t;
      pr.lap++; pr.next = 0; pr.crossedLog.push('lap' + pr.lap);
      if (pr.onLap) pr.onLap(pr.lap);
      if (pr.lap >= (track.laps || LAPS)) pr.finished = true;
    }
    return nb.d;
  }

  /* ---------- a round ---------- */
  function newRound(api, variant, cfg) {
    var track = buildTrack(variant);
    var start = track.pts[0], tg = track.tang[0];
    var kartCol = ((typeof window !== 'undefined' && window.SLWorldArt && window.SLWorldArt.KARTS) || {})[cfg && cfg.kart] || '#e94b4b';
    var k = { x: start[0] - tg[0] * 30, y: start[1] - tg[1] * 30, h: Math.atan2(tg[1], tg[0]), v: 0, wallT: 0, skid: [] };
    var pr = newProgress(track);
    pr.idx = nearest(track, k.x, k.y, null).i; pr.s = track.cum[pr.idx];
    /* start a touch behind the line: progress counts from there */
    pr.P = wrapDelta(track, 0, pr.s);
    var s = { t: 0, msg: null, msgT: 0, wrongT: 0, wall: 0, wallT: 0, done: false, camX: 0, camY: 0 };
    function camTarget() { return [Math.max(0, Math.min(WW - LW, k.x + Math.cos(k.h) * 90 - LW / 2)), Math.max(0, Math.min(WH - LH, k.y + Math.sin(k.h) * 60 - LH / 2))]; }
    var ct = camTarget(); s.camX = ct[0]; s.camY = ct[1];
    pr.onCheck = function (n) { api.sound('check'); s.msg = 'Checkpoint ' + n + ' ✓'; s.msgT = 0.9; };
    var LAPN = track.laps;
    pr.onLap = function (n) { if (n < LAPN) { api.sound('coin'); s.msg = n === LAPN - 1 ? 'FINAL LAP!' : 'Lap ' + (n + 1); s.msgT = 1.2; } };
    var held = {};
    var round = {
      done: false, kart: k, progress: pr, track: track, state: s,
      step: function (dt, h) {
        if (round.done) return;
        held = h || held;
        s.t += dt;
        var up = !!held.up, down = !!held.down, left = !!held.left, right = !!held.right;
        var nb0 = nearest(track, k.x, k.y, pr.idx);
        var onGrass = nb0.d > HW + KERB;
        var vmax = onGrass ? VMAX_GRASS : VMAX;
        if (up && !down) { if (k.v < vmax) k.v = Math.min(vmax, k.v + ACCEL * dt); }
        else if (down) { if (k.v > 0) k.v -= BRAKE * dt; else k.v -= ACCEL * 0.6 * dt; }
        else { var dr = DRAG * dt; k.v = Math.abs(k.v) <= dr ? 0 : k.v - Math.sign(k.v) * dr; }
        if (k.v > vmax) k.v = Math.max(vmax, k.v - (onGrass ? 700 : 300) * dt);
        if (k.v < VREV) k.v = VREV;
        var grip = Math.min(1, Math.abs(k.v) / 110) * Math.sign(k.v);
        if (left) k.h -= TURN * grip * dt;
        if (right) k.h += TURN * grip * dt;
        k.x += Math.cos(k.h) * k.v * dt; k.y += Math.sin(k.h) * k.v * dt;
        /* tyre walls: stop at the wall line, keep facing roughly along the track */
        var nb = nearest(track, k.x, k.y, pr.idx);
        if (nb.d > WALL) {
          var c = track.pts[nb.i], nx = (k.x - c[0]) / nb.d, ny = (k.y - c[1]) / nb.d;
          k.x = c[0] + nx * WALL; k.y = c[1] + ny * WALL;
          k.v *= 0.45;
          var tt = track.tang[nb.i], along = Math.atan2(tt[1], tt[0]);
          if (Math.cos(k.h - along) < 0) along += Math.PI;
          k.h += Math.atan2(Math.sin(along - k.h), Math.cos(along - k.h)) * 0.35;
          if (s.wallT <= 0) { api.sound('bump'); s.wall++; }
          s.wallT = 0.4;
        }
        s.wallT -= dt;
        updateProgress(track, pr, k.x, k.y, Math.abs(k.v) * dt * 2.5 + 24, s.t);
        s.wrongT = pr.back > 50 && k.v > 30 ? s.wrongT + dt : Math.max(0, s.wrongT - dt * 2);
        if (s.msgT > 0) s.msgT -= dt;
        var tgt = camTarget(), f = Math.min(1, dt * 5);
        s.camX += (tgt[0] - s.camX) * f; s.camY += (tgt[1] - s.camY) * f;
        if (pr.finished) { round.done = true; api.sound('fanfare'); }
      },
      input: function (id, down) { held[id] = down; },
      forceEnd: function () { round.done = true; },
      hud: function () { return 'Lap ' + Math.min(LAPN, pr.lap + 1) + '/' + LAPN + '  ⏱ ' + fmt(s.t * 1000); },
      result: function () { return pr.finished ? { finished: true, ms: Math.round(s.t * 1000) } : null; },
      summaryTitle: function () { return pr.finished ? '🏁 Race complete!' : 'Race stopped'; },
      summaryBig: function () { return pr.finished ? fmt(s.t * 1000) : 'DNF'; },
      summaryText: function () { return pr.finished ? 'Laps: ' + pr.laps.map(function (l) { return fmt(l * 1000); }).join(' · ') + (s.wall ? ' · ' + s.wall + ' wall bump' + (s.wall > 1 ? 's' : '') : ' · no wall bumps!') : 'Finish all ' + LAPN + ' laps to set a time.'; },
      autoHeld: {},
      autopilot: function () {
        var look = track.pts[(pr.idx + Math.round(95 / track.spacing)) % track.n];
        var want = Math.atan2(look[1] - k.y, look[0] - k.x);
        var diff = Math.atan2(Math.sin(want - k.h), Math.cos(want - k.h));
        /* ease off before tight bends (a hairpin needs ~170), and creep forward
           when slow — steering needs a little speed, so never sit still */
        var t0 = track.tang[pr.idx], t1 = track.tang[(pr.idx + Math.round(170 / track.spacing)) % track.n];
        var bend = Math.acos(Math.max(-1, Math.min(1, t0[0] * t1[0] + t0[1] * t1[1])));
        var target = bend > 1.4 ? 175 : bend > 0.8 ? 215 : VMAX, ad = Math.abs(diff);
        round.autoHeld = { up: (ad < 0.75 || k.v < 60) && k.v < target, down: k.v > target + 30 || (ad > 1.1 && k.v > 140), left: diff < -0.04, right: diff > 0.04 };
      },
      render: function (ctx) { draw(ctx, track, k, pr, s, kartCol, api); }
    };
    return round;
  }
  function fmt(ms) { var t = ms / 1000, m = Math.floor(t / 60), sec = t - m * 60; return m + ':' + (sec < 10 ? '0' : '') + sec.toFixed(2); }

  /* ---------- drawing ---------- */
  var cache = {};
  function trackLayer(track) {
    if (cache[track.id]) return cache[track.id];
    var c = (typeof document !== 'undefined') ? document.createElement('canvas') : null;
    if (!c) return null;
    c.width = WW; c.height = WH;
    var x = c.getContext('2d');
    x.fillStyle = track.grass; x.fillRect(0, 0, WW, WH);
    x.fillStyle = 'rgba(0,0,0,0.05)';
    for (var i = 0; i < 1500; i++) { var px = (i * 137) % WW, py = (i * 241) % WH; x.fillRect(px, py, 5, 5); }
    /* scenery */
    for (var sc = 0; sc < 40; sc++) {
      var sx = (sc * 619) % WW, sy = (sc * 373) % WH;
      var near = false; for (var q = 0; q < track.n; q += 4) { if (Math.hypot(track.pts[q][0] - sx, track.pts[q][1] - sy) < WALL + 60) { near = true; break; } }
      if (near) continue;
      if (track.deco === 'beach') { x.fillStyle = '#ff6b6b'; x.beginPath(); x.arc(sx, sy, 26, Math.PI, 0); x.fill(); x.fillStyle = '#fff'; x.fillRect(sx - 2, sy, 4, 30); }
      else { x.fillStyle = '#3f9a4a'; x.beginPath(); x.arc(sx, sy, 22, 0, 7); x.arc(sx + 18, sy + 6, 18, 0, 7); x.fill(); x.fillStyle = '#5cb85c'; x.beginPath(); x.arc(sx + 4, sy - 4, 14, 0, 7); x.fill(); }
    }
    if (track.deco === 'volcano') {
      var vx = 480 * SCALE, vy = 290 * SCALE;
      x.fillStyle = '#8a5a3b'; x.beginPath(); x.moveTo(vx - 170, vy + 120); x.lineTo(vx, vy - 140); x.lineTo(vx + 170, vy + 120); x.closePath(); x.fill();
      x.fillStyle = '#ff6b3d'; x.beginPath(); x.moveTo(vx - 40, vy - 80); x.lineTo(vx, vy - 140); x.lineTo(vx + 40, vy - 80); x.closePath(); x.fill();
      x.fillStyle = 'rgba(120,110,110,0.5)'; x.beginPath(); x.arc(vx + 20, vy - 170, 40, 0, 7); x.arc(vx + 50, vy - 220, 52, 0, 7); x.fill();
    }
    if (track.deco === 'beach') {
      x.fillStyle = '#4fc3f7'; x.fillRect(0, WH - 70, WW, 70);
    }
    function strokePath(w, col, dash) {
      x.beginPath(); track.pts.forEach(function (p, i) { if (i) x.lineTo(p[0], p[1]); else x.moveTo(p[0], p[1]); }); x.closePath();
      x.lineWidth = w; x.strokeStyle = col; x.lineJoin = 'round'; x.setLineDash(dash || []); x.stroke(); x.setLineDash([]);
    }
    strokePath((WALL + 6) * 2, '#5b5670');                       /* tyre wall shadow line */
    strokePath(WALL * 2, track.deco === 'beach' ? '#e9cf88' : '#a6dc8e');   /* verge */
    strokePath((HW + KERB) * 2, '#e94b4b');
    strokePath((HW + KERB) * 2, '#ffffff', [18, 18]);
    strokePath(HW * 2, '#5f5a72');
    strokePath(3, 'rgba(255,255,255,0.55)', [16, 18]);
    /* tyre stacks along both walls */
    for (var t = 0; t < track.n; t += 6) {
      var p = track.pts[t], tg = track.tang[t], nx = -tg[1], ny = tg[0];
      [1, -1].forEach(function (sd) {
        x.fillStyle = (t / 6) % 2 ? '#2d2d3d' : '#e94b4b';
        x.beginPath(); x.arc(p[0] + nx * (WALL + 4) * sd, p[1] + ny * (WALL + 4) * sd, 6, 0, 7); x.fill();
      });
    }
    /* start/finish strip */
    var p0 = track.pts[0], t0 = track.tang[0], nx0 = -t0[1], ny0 = t0[0];
    for (var k = -5; k < 5; k++) for (var row = 0; row < 2; row++) {
      x.fillStyle = (k + row) % 2 ? '#ffffff' : '#2d2d3d';
      var cx = p0[0] + nx0 * k * 10 + t0[0] * row * 10, cy = p0[1] + ny0 * k * 10 + t0[1] * row * 10;
      x.save(); x.translate(cx, cy); x.rotate(Math.atan2(t0[1], t0[0])); x.fillRect(0, 0, 10, 10); x.restore();
    }
    cache[track.id] = c;
    return c;
  }
  function draw(ctx, track, k, pr, s, col, api) {
    var layer = trackLayer(track);
    ctx.save();
    ctx.translate(-Math.round(s.camX), -Math.round(s.camY));
    if (layer) ctx.drawImage(layer, Math.round(s.camX), Math.round(s.camY), LW, LH, Math.round(s.camX), Math.round(s.camY), LW, LH); else { ctx.fillStyle = track.grass; ctx.fillRect(0, 0, WW, WH); }
    /* checkpoint gates: grey until passed this lap, then green */
    CHECKS.forEach(function (f, i) {
      var target = f * track.len, idx = 0;
      while (idx < track.n - 1 && track.cum[idx] < target) idx++;
      var p = track.pts[idx], tg = track.tang[idx], nx = -tg[1], ny = tg[0];
      var lit = pr.next > i;
      ctx.strokeStyle = lit ? '#2ecc71' : 'rgba(255,255,255,0.75)'; ctx.lineWidth = 5; ctx.setLineDash([8, 8]);
      ctx.beginPath(); ctx.moveTo(p[0] + nx * (HW + 4), p[1] + ny * (HW + 4)); ctx.lineTo(p[0] - nx * (HW + 4), p[1] - ny * (HW + 4)); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = lit ? '#2ecc71' : '#ffd23f'; ctx.strokeStyle = '#3b2f4a'; ctx.lineWidth = 2;
      [1, -1].forEach(function (sd) { ctx.beginPath(); ctx.arc(p[0] + nx * (HW + 10) * sd, p[1] + ny * (HW + 10) * sd, 8, 0, 7); ctx.fill(); ctx.stroke(); });
      ctx.font = '800 14px "Baloo 2", sans-serif'; ctx.fillStyle = '#3b2f4a'; ctx.textAlign = 'center'; ctx.fillText(String(i + 1), p[0] + nx * (HW + 10), p[1] + ny * (HW + 10) + 5);
    });
    /* kart */
    ctx.save(); ctx.translate(k.x, k.y); ctx.rotate(k.h);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(-20, -12, 44, 28);
    ctx.fillStyle = '#2d2d3d';
    [[-16, -16], [10, -16], [-16, 10], [10, 10]].forEach(function (w) { ctx.fillRect(w[0], w[1], 12, 7); });
    ctx.fillStyle = col; ctx.strokeStyle = '#3b2f4a'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(-20, -10); ctx.lineTo(18, -8); ctx.lineTo(26, 0); ctx.lineTo(18, 8); ctx.lineTo(-20, 10); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(-4, 0, 7, 0, 7); ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.restore();
    /* minimap */
    var mw = 190, mh = Math.round(190 * WH / WW), mx = LW - mw - 12, my = 12, sx = mw / WW;
    ctx.fillStyle = 'rgba(19,12,46,0.55)'; ctx.fillRect(mx - 6, my - 6, mw + 12, mh + 12);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 4; ctx.beginPath();
    track.pts.forEach(function (p, i) { if (i) ctx.lineTo(mx + p[0] * sx, my + p[1] * sx); else ctx.moveTo(mx + p[0] * sx, my + p[1] * sx); }); ctx.closePath(); ctx.stroke();
    var p0m = track.pts[0]; ctx.fillStyle = '#fff'; ctx.fillRect(mx + p0m[0] * sx - 3, my + p0m[1] * sx - 3, 6, 6);
    ctx.fillStyle = col; ctx.strokeStyle = '#3b2f4a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(mx + k.x * sx, my + k.y * sx, 6, 0, 7); ctx.fill(); ctx.stroke();
    /* messages */
    if (s.wrongT > 0.6) banner(ctx, '↩ WRONG WAY — turn around!', '#ff8a8a');
    else if (s.msgT > 0 && s.msg) banner(ctx, s.msg, '#ffd23f');
    /* lap pips */
    for (var i = 0; i < track.laps; i++) {
      ctx.fillStyle = i < pr.lap ? '#2ecc71' : 'rgba(255,255,255,0.6)'; ctx.strokeStyle = '#3b2f4a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(LW / 2 - (track.laps - 1) * 14 + i * 28, 22, 9, 0, 7); ctx.fill(); ctx.stroke();
    }
  }
  function banner(ctx, txt, col) {
    ctx.font = '800 34px "Baloo 2", sans-serif'; ctx.textAlign = 'center';
    ctx.lineWidth = 7; ctx.strokeStyle = '#3b2f4a'; ctx.strokeText(txt, LW / 2, 70);
    ctx.fillStyle = col; ctx.fillText(txt, LW / 2, 70);
  }
  function idle(ctx, cfg) {
    var r = newRound({ sound: function () {}, reduced: true }, (cfg && cfg.variant) || 'track_loop', cfg || {});
    r.render(ctx);
  }

  var def = {
    key: 'kart', title: 'Kart Time Trial', emoji: '🏎️', LW: LW, LH: LH, defaultVariant: 'track_loop',
    tutorial: [['⬆️', 'Hold ⬆ or GO to drive (⬇ to brake and reverse)'], ['⬅️➡️', 'Steer with ⬅ ➡ — or the buttons on the left'], ['🚦', 'Drive through gates 1, 2, 3, then the finish line'], ['🏁', 'Finish every lap — beat your best time!']],
    controls: [{ id: 'left', label: '⬅', side: 'left' }, { id: 'right', label: '➡', side: 'left' }, { id: 'down', label: '⬇', side: 'right', aria: 'Brake' }, { id: 'up', label: 'GO', side: 'right', wide: true, aria: 'Accelerate' }],
    keys: { 'ArrowUp': 'up', 'w': 'up', 'W': 'up', 'ArrowDown': 'down', 's': 'down', 'S': 'down', 'ArrowLeft': 'left', 'a': 'left', 'A': 'left', 'ArrowRight': 'right', 'd': 'right', 'D': 'right' },
    countdown: 3,
    idle: idle, newRound: newRound
  };
  if (Shell) Shell.define(def);
  if (typeof module === 'object' && module.exports) module.exports = { buildTrack: buildTrack, newRound: newRound, newProgress: newProgress, updateProgress: updateProgress, nearest: nearest, TRACKS: TRACKS, LAPS: LAPS, CHECKS: CHECKS, WALL: WALL, VMAX: VMAX };
})();
