/* ================================================================
   Game B — Penalty Shootout (unlocked by the Penalty Pitch).
   8 shots. Tap once to lock the side, tap again to lock the height.
   The keeper picks a dive (left / stay / right) before each shot and
   LEANS that way while you aim — watch the lean and shoot the other way.
   Fair by construction:
     • top corners are out of the keeper's reach → always a goal if on target
     • a ball inside the keeper's reach is saved only if he went that way
     • aim outside the posts or over the bar = miss (your timing)
   ================================================================ */
(function () {
  'use strict';
  var Shell = (typeof window !== 'undefined') ? window.SLGameShell : null;
  var LW = 960, LH = 540;
  var POST_L = 250, POST_R = 710, BAR = 150, LINE = 340, MID = 480;
  var AIM_X0 = 196, AIM_X1 = 764, AIM_Y0 = 108, AIM_Y1 = 332;
  var SHOTS = 8;
  var REACH = {
    stay:  { x0: MID - 88, x1: MID + 88, y0: 172 },
    left:  { x0: 268, x1: MID - 40, y0: 206 },
    right: { x0: MID + 40, x1: 692, y0: 206 }
  };

  /* pure outcome rules (exported for tests) */
  function outcome(x, y, dive) {
    if (x <= POST_L + 6 || x >= POST_R - 6 || y <= BAR + 6) return 'miss';
    if (y > LINE) return 'miss';
    var r = REACH[dive];
    if (x >= r.x0 && x <= r.x1 && y >= r.y0) return 'save';
    return 'goal';
  }
  function isTopCorner(x, y) { return y < REACH.left.y0 && Math.abs(x - MID) > 88; }

  function newRound(api, variant, cfg) {
    var r = (cfg && cfg.rng) || (Shell ? Shell.rng((Date.now() & 0x7fffffff) || 9) : Math.random);
    var ballCol = ((typeof window !== 'undefined' && window.SLWorldArt && window.SLWorldArt.BALLS) || {})[cfg && cfg.ball] || ['#ffffff', '#3b2f4a'];
    var stad = ((typeof window !== 'undefined' && window.SLWorldArt && window.SLWorldArt.STADIA) || {})[cfg && cfg.stadium] || ['#7ecbff', '#6ac46a'];
    var night = cfg && cfg.stadium === 'stadium_night';
    var s = {
      shot: 0, goals: 0, corners: 0, score: 0, phase: 'ready', readyT: 0, t: 0, ax: AIM_X0, ay: AIM_Y1, lockX: null, lockY: null,
      sweepX: 0, sweepY: 0, dive: 'stay', lean: 0, flight: 0, result: null, resT: 0, history: { left: 0, right: 0, mid: 0 },
      keeperX: MID, keeperT: 0, crowd: 0, log: []
    };
    function speedFor(n) { return 0.55 + n * 0.06; }          /* sweeps per second, gentle ramp */
    function chooseDive() {
      /* the keeper "learns": leans toward the side you've used most */
      var wl = 0.36 + Math.min(0.24, s.history.left * 0.08), wr = 0.36 + Math.min(0.24, s.history.right * 0.08), wm = 0.28 + Math.min(0.2, s.history.mid * 0.08);
      var tot = wl + wr + wm, x = r() * tot;
      return x < wl ? 'left' : x < wl + wm ? 'stay' : 'right';
    }
    function nextShot() {
      s.phase = 'ready'; s.readyT = 0; s.lockX = s.lockY = null; s.t = 0; s.flight = 0; s.result = null;
      s.sweepX = r() * Math.PI * 2;                         /* start the marker somewhere different */
      s.dive = chooseDive(); s.lean = 0; s.keeperX = MID; s.keeperT = 0;
    }
    nextShot();
    var round = {
      done: false, state: s,
      step: function (dt) {
        if (round.done) return;
        s.t += dt; s.crowd += dt;
        var sp = speedFor(s.shot);
        if (s.phase === 'ready') {
          s.readyT += dt; s.lean = 0;
          if (s.readyT > 0.9) s.phase = 'aimX';
        } else if (s.phase === 'aimX') {
          s.sweepX += dt * sp * Math.PI * 2;
          s.ax = (AIM_X0 + AIM_X1) / 2 + Math.sin(s.sweepX) * (AIM_X1 - AIM_X0) / 2;
          s.lean = Math.min(1, s.lean + dt * 1.2);
        } else if (s.phase === 'aimY') {
          s.sweepY += dt * sp * 1.1 * Math.PI * 2;
          s.ay = (AIM_Y0 + AIM_Y1) / 2 + Math.cos(s.sweepY) * (AIM_Y1 - AIM_Y0) / 2;
          s.lean = Math.min(1, s.lean + dt * 1.2);
        } else if (s.phase === 'flight') {
          s.flight += dt / 0.62;
          s.keeperT = Math.min(1, s.keeperT + dt / 0.5);
          if (s.flight >= 1) {
            s.flight = 1;
            var res = outcome(s.lockX, s.lockY, s.dive);
            s.result = res; s.phase = 'result'; s.resT = 0;
            var top = res === 'goal' && isTopCorner(s.lockX, s.lockY);
            if (res === 'goal') { s.goals++; s.score += top ? 150 : 100; if (top) s.corners++; api.sound(top ? 'applause' : 'correct', 0.7); }
            else api.sound(res === 'save' ? 'wrong' : 'bump');
            s.log.push({ x: Math.round(s.lockX), y: Math.round(s.lockY), dive: s.dive, res: res });
          }
        } else if (s.phase === 'result') {
          s.resT += dt;
          if (s.resT > 2.0) { s.shot++; if (s.shot >= SHOTS) round.done = true; else nextShot(); }
        }
      },
      input: function (id, down) {
        if (id !== 'kick' || !down || round.done) return;
        if (s.phase === 'aimX') { s.lockX = s.ax; s.phase = 'aimY'; s.sweepY = r() * Math.PI * 2; api.sound('tick'); }
        else if (s.phase === 'aimY') {
          s.lockY = s.ay; s.phase = 'flight'; s.flight = 0; api.sound('kick');
          var side = s.lockX < MID - 88 ? 'left' : s.lockX > MID + 88 ? 'right' : 'mid';
          s.history[side]++;
        }
      },
      forceEnd: function () { round.done = true; },
      hud: function () { return '⚽ ' + s.goals + ' / ' + Math.min(SHOTS, s.shot + (s.phase === 'result' ? 1 : 0)) + '  · shot ' + Math.min(SHOTS, s.shot + 1) + ' of ' + SHOTS; },
      result: function () { return { score: s.score, extra: s.goals }; },
      summaryTitle: function () { return s.goals >= 6 ? '🏆 Superstar striker!' : s.goals >= 4 ? '⚽ Great shooting!' : 'Good effort!'; },
      summaryBig: function () { return s.goals + ' / ' + SHOTS + ' goals'; },
      summaryText: function () { return s.score + ' pts' + (s.corners ? ' · ' + s.corners + ' top-corner screamer' + (s.corners > 1 ? 's' : '') + ' (+50 each)' : '') + ' · Tip: watch which way the keeper leans!'; },
      autoHeld: {},
      autopilot: function () {
        /* preview: aim for a corner away from the keeper's lean */
        var wantX = s.dive === 'left' ? 640 : s.dive === 'right' ? 320 : 300;
        if (s.phase === 'aimX' && Math.abs(s.ax - wantX) < 10) round.input('kick', true);
        else if (s.phase === 'aimY' && Math.abs(s.ay - 190) < 8) round.input('kick', true);
      },
      render: function (ctx) { draw(ctx, s, ballCol, stad, night, api); }
    };
    return round;
  }

  /* ---------- drawing ---------- */
  function draw(ctx, s, ballCol, stad, night, api) {
    /* sky + stands */
    var g = ctx.createLinearGradient(0, 0, 0, 260);
    g.addColorStop(0, night ? '#14143a' : stad[0]); g.addColorStop(1, night ? '#2b2a5e' : '#d8f0ff');
    ctx.fillStyle = g; ctx.fillRect(0, 0, LW, LH);
    if (night) { [[90, 40], [870, 40]].forEach(function (p) { ctx.fillStyle = 'rgba(255,246,168,0.25)'; ctx.beginPath(); ctx.arc(p[0], p[1], 80, 0, 7); ctx.fill(); ctx.fillStyle = '#fff6a8'; ctx.fillRect(p[0] - 30, p[1] - 10, 60, 18); }); }
    ctx.fillStyle = night ? '#24204a' : '#5b6a8f'; ctx.fillRect(0, 70, LW, 120);
    var cols = ['#ff6b6b', '#ffd23f', '#4fc3f7', '#ffffff', '#c38bff', '#7bd88f'];
    for (var row = 0; row < 5; row++) for (var c = 0; c < 48; c++) {
      var bob = api.reduced ? 0 : Math.sin(s.crowd * 6 + c * 0.7 + row) * (s.result === 'goal' ? 4 : 1);
      ctx.fillStyle = cols[(c * 7 + row * 3) % cols.length];
      ctx.beginPath(); ctx.arc(10 + c * 20 + (row % 2) * 10, 86 + row * 21 + bob, 6, 0, 7); ctx.fill();
    }
    /* pitch */
    var pg = ctx.createLinearGradient(0, 190, 0, LH);
    pg.addColorStop(0, stad[1]); pg.addColorStop(1, shade(stad[1], -18));
    ctx.fillStyle = pg; ctx.fillRect(0, 190, LW, LH - 190);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    for (var st = 0; st < 6; st++) ctx.fillRect(0, 190 + st * 60, LW, 30);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(120, LINE); ctx.lineTo(840, LINE); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(200, LINE); ctx.lineTo(150, 440); ctx.lineTo(810, 440); ctx.lineTo(760, LINE); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(MID, 476, 6, 3, 0, 0, 7); ctx.fill();
    /* net + goal frame */
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(POST_L, BAR, POST_R - POST_L, LINE - BAR);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1.5;
    for (var nx = POST_L; nx <= POST_R; nx += 20) { ctx.beginPath(); ctx.moveTo(nx, BAR); ctx.lineTo(nx, LINE); ctx.stroke(); }
    for (var ny = BAR; ny <= LINE; ny += 20) { ctx.beginPath(); ctx.moveTo(POST_L, ny); ctx.lineTo(POST_R, ny); ctx.stroke(); }
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 12; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(POST_L, LINE); ctx.lineTo(POST_L, BAR); ctx.lineTo(POST_R, BAR); ctx.lineTo(POST_R, LINE); ctx.stroke();
    ctx.lineCap = 'butt';
    /* keeper */
    var leanX = (s.dive === 'left' ? -1 : s.dive === 'right' ? 1 : 0) * 12 * s.lean;
    var kx = MID + leanX, ky = LINE, rot = 0;
    if (s.phase === 'flight' || s.phase === 'result') {
      var k = s.phase === 'result' ? 1 : s.keeperT;
      if (s.dive === 'left') { kx = MID - 150 * k; ky = LINE - 40 * Math.sin(k * Math.PI) - 10 * k; rot = -1.25 * k; }
      else if (s.dive === 'right') { kx = MID + 150 * k; ky = LINE - 40 * Math.sin(k * Math.PI) - 10 * k; rot = 1.25 * k; }
      else { ky = LINE - 36 * Math.sin(Math.min(1, k) * Math.PI); }
    }
    drawKeeper(ctx, kx, ky, rot);
    /* ball */
    var bx = MID, by = 470, br = 22;
    if (s.phase === 'flight' || s.phase === 'result') {
      var f = s.phase === 'result' ? 1 : s.flight;
      var e = 1 - Math.pow(1 - f, 2);
      bx = MID + (s.lockX - MID) * e; by = 470 + (s.lockY - 470) * e - Math.sin(f * Math.PI) * 40; br = 22 - 10 * e;
      if (s.phase === 'result' && s.result === 'save') { bx = kx + (s.dive === 'left' ? -30 : s.dive === 'right' ? 30 : 0); by = ky - 70; }
      if (s.phase === 'result' && s.result === 'miss') { var mo = Math.min(1, s.resT * 2); bx += (s.lockX < MID ? -1 : 1) * 80 * mo * (s.lockY <= BAR + 6 ? 0.2 : 1); by -= (s.lockY <= BAR + 6 ? 60 * mo : 0); }
    }
    ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(bx, Math.max(by + br, LINE) + 4, br, br * 0.35, 0, 0, 7); ctx.fill();
    ctx.fillStyle = ballCol[0]; ctx.strokeStyle = '#3b2f4a'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(bx, by, br, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = ballCol[1]; ctx.beginPath(); ctx.arc(bx - br * 0.15, by - br * 0.1, br * 0.38, 0, 7); ctx.fill();
    /* aim markers */
    if (s.phase === 'ready') {
      ctx.font = '800 34px "Baloo 2", sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 6; ctx.strokeStyle = '#3b2f4a'; ctx.fillStyle = '#fff';
      var rd = 'Shot ' + (s.shot + 1) + ' — get ready…'; ctx.strokeText(rd, MID, 520); ctx.fillText(rd, MID, 520);
    }
    if (s.phase === 'aimX' || s.phase === 'aimY') {
      ctx.setLineDash([10, 8]); ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(AIM_X0, LINE + 14); ctx.lineTo(AIM_X1, LINE + 14); ctx.stroke(); ctx.setLineDash([]);
      var tx = s.phase === 'aimX' ? s.ax : s.lockX;
      ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.moveTo(tx, LINE + 4); ctx.lineTo(tx - 12, LINE + 26); ctx.lineTo(tx + 12, LINE + 26); ctx.closePath(); ctx.fill();
      if (s.phase === 'aimY') {
        ctx.strokeStyle = 'rgba(255,210,63,0.6)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(tx, AIM_Y0); ctx.lineTo(tx, AIM_Y1); ctx.stroke();
        target(ctx, tx, s.ay);
      } else target(ctx, tx, 250);
      ctx.font = '800 26px "Baloo 2", sans-serif'; ctx.textAlign = 'center';
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#3b2f4a'; ctx.lineWidth = 5;
      var tip = s.phase === 'aimX' ? 'TAP to pick the side' : 'TAP to pick the height';
      ctx.strokeText(tip, MID, 520); ctx.fillText(tip, MID, 520);
    }
    /* result text */
    if (s.phase === 'result') {
      var label = s.result === 'goal' ? (isTopCorner(s.lockX, s.lockY) ? 'TOP CORNER! ⚽' : 'GOAL! ⚽') : s.result === 'save' ? 'SAVED! 🧤' : (s.lockY <= BAR + 6 ? 'OVER THE BAR!' : 'WIDE!');
      var sc = api.reduced ? 1 : 1 + Math.max(0, 0.3 - s.resT) * 1.5;
      ctx.save(); ctx.translate(MID, 250); ctx.scale(sc, sc);
      ctx.font = '800 76px "Baloo 2", sans-serif'; ctx.textAlign = 'center';
      ctx.lineWidth = 10; ctx.strokeStyle = '#3b2f4a'; ctx.strokeText(label, 0, 0);
      ctx.fillStyle = s.result === 'goal' ? '#ffd23f' : '#ffffff'; ctx.fillText(label, 0, 0);
      ctx.restore();
    }
    /* shot dots */
    for (var i = 0; i < SHOTS; i++) {
      var lg = s.log[i];
      ctx.fillStyle = !lg ? 'rgba(255,255,255,0.35)' : lg.res === 'goal' ? '#2ecc71' : '#e74c3c';
      ctx.strokeStyle = '#3b2f4a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(MID - (SHOTS - 1) * 14 + i * 28, 30, 9, 0, 7); ctx.fill(); ctx.stroke();
    }
  }
  function target(ctx, x, y) {
    ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(x, y, 18, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 26, y); ctx.lineTo(x + 26, y); ctx.moveTo(x, y - 26); ctx.lineTo(x, y + 26); ctx.stroke();
  }
  function drawKeeper(ctx, x, y, rot) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    ctx.strokeStyle = '#3b2f4a'; ctx.lineWidth = 3;
    ctx.fillStyle = '#2d2d4d'; ctx.fillRect(-22, -44, 16, 44); ctx.fillRect(6, -44, 16, 44);
    ctx.fillStyle = '#ff8a3d'; ctx.beginPath(); ctx.moveTo(-30, -44); ctx.lineTo(30, -44); ctx.lineTo(26, -112); ctx.lineTo(-26, -112); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.font = '800 22px "Baloo 2", sans-serif'; ctx.textAlign = 'center'; ctx.fillText('1', 0, -70);
    ctx.strokeStyle = '#ff8a3d'; ctx.lineWidth = 12; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-24, -104); ctx.lineTo(-58, -132); ctx.moveTo(24, -104); ctx.lineTo(58, -132); ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.fillStyle = '#ffd23f'; ctx.strokeStyle = '#3b2f4a'; ctx.lineWidth = 3;
    [[-60, -136], [60, -136]].forEach(function (p) { ctx.beginPath(); ctx.arc(p[0], p[1], 11, 0, 7); ctx.fill(); ctx.stroke(); });
    ctx.fillStyle = '#f1c27d'; ctx.beginPath(); ctx.arc(0, -130, 17, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#3b2f4a'; ctx.beginPath(); ctx.arc(-6, -132, 2.5, 0, 7); ctx.arc(6, -132, 2.5, 0, 7); ctx.fill();
    ctx.restore();
  }
  function shade(hex, amt) {
    var n = parseInt(hex.slice(1), 16), r = Math.max(0, Math.min(255, (n >> 16) + amt)), g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt)), b = Math.max(0, Math.min(255, (n & 255) + amt));
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }
  function idle(ctx, cfg) {
    var r = newRound({ sound: function () {}, reduced: true }, 'std', cfg);
    r.render(ctx);
  }

  var def = {
    key: 'penalty', title: 'Penalty Shootout', emoji: '⚽', LW: LW, LH: LH, defaultVariant: 'std',
    tutorial: [['👆', 'First tap picks the SIDE as the arrow slides'], ['👆', 'Second tap picks the HEIGHT — then you shoot'], ['👀', 'Watch the keeper lean — shoot the other way!'], ['🎯', 'Top corners can’t be saved… but don’t go wide!']],
    controls: [{ id: 'kick', label: '⚽ KICK', side: 'right', wide: true }],
    keys: { ' ': 'kick', 'Enter': 'kick', 'ArrowUp': 'kick' },
    tapAction: 'kick',
    countdown: 0,
    idle: idle, newRound: newRound
  };
  if (Shell) Shell.define(def);
  if (typeof module === 'object' && module.exports) module.exports = { outcome: outcome, isTopCorner: isTopCorner, newRound: newRound, REACH: REACH, SHOTS: SHOTS, POST_L: POST_L, POST_R: POST_R, BAR: BAR, LINE: LINE, MID: MID };
})();
