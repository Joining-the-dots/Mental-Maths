/* ================================================================
   Neon Grand Prix — race logic (pure: no DOM, no THREE, no clocks,
   no randomness). Classic UMD: window.SLKartLogic in the browser,
   module.exports in Node.

   The race clock is the score, so everything here is physical and
   deterministic: Spark Boosts (drift), Beat Strips, Glow Notes, the
   Stage Jump, the Hype Wand / Spotlight, graded walls, the Glow Crew
   rivals and Solo pacers (which replay a baked reference lap and can
   never touch the player), the rocket start and the victory coast.

   Track geometry, progress and the anti-cheat lap rules are moved
   here from kart.js unchanged. newRace(id, {features: false}) runs
   the exact legacy physics (pinned by a refactor-guard test).
   ================================================================ */
(function () {
  'use strict';

  /* ---------- world + physics constants ---------- */
  var LW = 960, LH = 540, SCALE = 2.4, WW = Math.round(960 * SCALE), WH = Math.round(540 * SCALE);
  var HW = 50, KERB = 8, VERGE = 46, WALL = HW + VERGE + 14;   /* half-widths from the centreline */
  var LAPS = 3, CHECKS = [0.25, 0.5, 0.75];
  var STEP = 1 / 120;
  var PHYS = {
    ACCEL: 430, BRAKE: 620, DRAG: 260, VMAX: 270, VMAX_GRASS: 135, VREV: -110, TURN: 2.9,
    VBOOST: 335, BOOST_ACC: 900, VCAP: 350, SPOT_MUL: 1.05,
    DRIFT_MIN_V: 150, DRIFT_KEEP_V: 120, HOP: 0.12, SLIDE: 0.28, DRIFT_CAP: 0.97,
    DRIFT_TURN: 1.7, DRIFT_INTO: 1.1, DRIFT_AGAINST: 0.9, GRASS_DRAIN: 2,
    TIERS: [0.55, 1.1, 1.8], TIER_BOOST: [0.5, 0.9, 1.3], TIER_HYPE: [3, 5, 8],
    AIR_STEER: 0.35, TRICK_WIN: 0.7, TRICK_BOOST: 0.6, JUMP_MIN_V: 160, JUMP_GAP: 500, JUMP_LEN: 64,
    SPIN_T: 0.8, SPIN_DECEL: 600, SCRAPE_VN: 70, SPIN_VN: 180,
    ROCKET_PRE: 0.25, ROCKET_POST: 0.15, ROCKET_BOOST: 1.0,
    PAD_ON: 1.1, PAD_OFF: 0.7, PAD_CD: 1.2, PAD_MIN_V: 80, PAD_LEN: 70, PAD_W: 40,
    NOTE_R: 26, NOTE_GAP: 48,
    WAND: 40, SPOT_T: 6, SPOT_BOOST: 1.0,
    COAST_T: 2.2, SLOWMO_T: 0.6, SLOWMO: 0.35, COAST_V: 150, WALL_DEBOUNCE: 0.4
  };
  var ACCEL = PHYS.ACCEL, BRAKE = PHYS.BRAKE, DRAG = PHYS.DRAG, VMAX = PHYS.VMAX, VMAX_GRASS = PHYS.VMAX_GRASS, VREV = PHYS.VREV, TURN = PHYS.TURN;
  var VBOOST = PHYS.VBOOST, VCAP = PHYS.VCAP, EPS = 1e-9;
  /* the beat: half-time of 140 BPM; a Beat Strip is LIT in the first half of each beat */
  var BPM = 140, BEAT2 = 120 / BPM;
  var HYPE = { note: 1, trail: 2, padOff: 3, padOn: 5, rocket: 5, trick: 5, gate: 2, scrape: -2, bump: -8 };

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

  /* ---------- the Glow Crew (original bean mascots) ---------- */
  var CREW = [
    { id: 'gumdrop', name: 'Gumdrop', lane: -0.45, gridP: 55, gridLat: -24, color: '#FF8FC8', topper: 'bow' },
    { id: 'fizz', name: 'Fizz', lane: 0.40, gridP: 55, gridLat: 24, color: '#4FC3F7', topper: 'headphones' },
    { id: 'sprout', name: 'Sprout', lane: -0.20, gridP: 110, gridLat: -24, color: '#7BD88F', topper: 'sprout' },
    { id: 'plum', name: 'Plum', lane: 0.25, gridP: 110, gridLat: 24, color: '#C38BFF', topper: 'heart' },
    { id: 'noodle', name: 'Noodle', lane: 0, gridP: 165, gridLat: 0, color: '#FFE27A', topper: 'visor' }
  ];
  var TRAINEE_M = [0.80, 0.87, 0.93, 0.98, 1.03], DEBUT_F = [0.55, 0.40, 0.25, 0.10, 0], HEAD_F = [0.8, 0.6, 0.4, 0.2, 0];
  var CLASSES = [
    { id: 'trainee', name: 'Trainee', icon: '🌱', tip: 'the Glow Crew race at your pace' },
    { id: 'debut', name: 'Debut', icon: '🎤', tip: 'the Glow Crew race between Bronze and Silver pace' },
    { id: 'headliner', name: 'Headliner', icon: '👑', tip: 'beat the Glow Crew leader and you have a Gold time' }
  ];
  var MEDALS = [
    { id: 'finisher', name: 'Finisher', icon: '🏁' },
    { id: 'bronze', name: 'Bronze', icon: '🥉', color: '#C48A52' },
    { id: 'silver', name: 'Silver', icon: '🥈', color: '#DDE3F0' },
    { id: 'gold', name: 'Gold', icon: '🥇', color: '#F0C02F' },
    { id: 'holo', name: 'Holo', icon: '🌈', color: '#FFB3E6' }
  ];
  /* medal ladder per track (ms), pinned from the final drivers (plain 50.575 / 59.692 / 70.842 s,
     style 46.358 / 52.242 / 66.592 s; a test re-measures and flags any drift over 0.5 s):
     Bronze = ceil½(plain×1.6) · Silver = ceil½(plain×1.12) · Gold = round½((plain+style)/2) · Holo = ceil⅒(style×1.005) */
  var PAR = {
    track_loop: { bronze: 81000, silver: 57000, gold: 48500, holo: 46600 },
    track_volcano: { bronze: 96000, silver: 67000, gold: 56000, holo: 52600 },
    track_beach: { bronze: 113500, silver: 79500, gold: 68500, holo: 67000 }
  };
  /* style-driver tuning per track: drift entry bend (rad over 200 px), release charge (s),
     look-ahead (px), bend speed targets (>1.4 / >0.8 rad), the bend a boost may carry
     into, steering dead-zone, and how far the bend must ease before the next drift */
  var STYLE = {
    track_loop: { enter: 0.35, rel: 0.55, look: 95, t14: 175, t08: 215, boostBend: 0.8, dz: 0.05, rearm: 1 },
    track_volcano: { enter: 0.45, rel: 0.55, look: 115, t14: 225, t08: 240, boostBend: 1.2, dz: 0.03, rearm: 0.6 },
    track_beach: { enter: 0.35, rel: 1.8, look: 115, t14: 200, t08: 240, boostBend: 1.2, dz: 0.03, rearm: 0.6 }
  };
  var STYLE_DEFAULT = { enter: 0.45, rel: 1.1, look: 95, t14: 175, t08: 215, boostBend: 0.8, dz: 0.05, rearm: 1 };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function wrapAng(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }

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
  var trackCache = {};
  function buildTrack(id) {
    if (trackCache[id]) return trackCache[id];
    var T = TRACKS[id] || TRACKS.track_loop;
    var pts = resample(catmull(T.pts.map(function (q) { return [q[0] * SCALE, q[1] * SCALE]; }), 60), 16), n = pts.length, cum = [0], len = 0;
    for (var i = 1; i <= n; i++) { var a = pts[i - 1], b = pts[i % n]; len += Math.hypot(b[0] - a[0], b[1] - a[1]); if (i < n) cum.push(len); }
    var tang = pts.map(function (p, i) { var q = pts[(i + 1) % n], r = pts[(i - 1 + n) % n]; var dx = q[0] - r[0], dy = q[1] - r[1], m = Math.hypot(dx, dy) || 1; return [dx / m, dy / m]; });
    var track = { id: id, name: T.name, laps: T.laps || LAPS, grass: T.grass, deco: T.deco, pts: pts, cum: cum, len: len, tang: tang, n: n, spacing: len / n };
    track.feat = buildFeatures(track);
    track.par = PAR[id] || null;
    trackCache[id] = track;
    return track;
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

  /* ---------- track helpers ---------- */
  function ahead(track, i, dist) { return (i + Math.round(dist / track.spacing)) % track.n; }
  /* how much the track turns between sample i and dist px further on (rad, unsigned) */
  function bendAt(track, i, dist) {
    var a = track.tang[((i % track.n) + track.n) % track.n], b = track.tang[ahead(track, ((i % track.n) + track.n) % track.n, dist)];
    return Math.acos(clamp(a[0] * b[0] + a[1] * b[1], -1, 1));
  }
  /* +1 when the track turns right (clockwise on screen), -1 left */
  function turnSign(track, i, dist) {
    var a = track.tang[i], b = track.tang[ahead(track, i, dist)], c = a[0] * b[1] - a[1] * b[0];
    return c > 0 ? 1 : c < 0 ? -1 : 0;
  }
  /* distance along the track between two arc positions (cyclic) */
  function sDist(track, a, b) { var d = Math.abs(a - b) % track.len; return Math.min(d, track.len - d); }
  /* centreline point + unit tangent at arc position s (any real s; wraps) */
  function pointAt(track, s, out) {
    var len = track.len, n = track.n, cum = track.cum;
    s = s % len; if (s < 0) s += len;
    var lo = 0, hi = n - 1;
    while (lo < hi) { var mid = (lo + hi + 1) >> 1; if (cum[mid] <= s) lo = mid; else hi = mid - 1; }
    var i = lo, j = (i + 1) % n, a = track.pts[i], b = track.pts[j];
    var seg = (j === 0 ? len : cum[j]) - cum[i], f = seg > 0 ? (s - cum[i]) / seg : 0;
    var ta = track.tang[i], tb = track.tang[j], tx = ta[0] + (tb[0] - ta[0]) * f, ty = ta[1] + (tb[1] - ta[1]) * f, m = Math.hypot(tx, ty) || 1;
    out = out || {};
    out.x = a[0] + (b[0] - a[0]) * f; out.y = a[1] + (b[1] - a[1]) * f; out.tx = tx / m; out.ty = ty / m; out.i = f < 0.5 ? i : j;
    return out;
  }
  /* sample index at arc position s */
  function idxAt(track, s) { return pointAt(track, s).i; }

  /* maximal runs of 'straight' samples: the bend over the next 200 px stays under 0.35 rad */
  function straightRuns(track) {
    var n = track.n, ok = [], all = true, any = false, runs = [];
    for (var i = 0; i < n; i++) { ok.push(bendAt(track, i, 200) < 0.35); if (ok[i]) any = true; else all = false; }
    if (!any) return runs;
    if (all) return [{ start: 0, count: n }];
    for (var j = 0; j < n; j++) {
      if (ok[j] && !ok[(j - 1 + n) % n]) { var c = 0; while (c < n && ok[(j + c) % n]) c++; runs.push({ start: j, count: c }); }
    }
    return runs;
  }

  /* ---------- automatic, deterministic mechanic layout ---------- */
  function buildFeatures(track) {
    var n = track.n, sp = track.spacing, len = track.len, cum = track.cum;
    var runs = straightRuns(track), byLen = runs.slice().sort(function (a, b) { return b.count - a.count || a.start - b.start; });
    var gatesS = [0].concat(CHECKS.map(function (f) { return f * len; }));
    /* STAGE JUMP: full width, 60% along the longest straight */
    var jump = null;
    if (byLen.length) {
      var L0 = byLen[0], ji = (L0.start + Math.floor(0.6 * L0.count)) % n, jt = track.tang[ji];
      jump = { i: ji, s: cum[ji], x: track.pts[ji][0], y: track.pts[ji][1], ang: Math.atan2(jt[1], jt[0]), len: PHYS.JUMP_LEN };
    }
    /* BEAT STRIPS: 2 samples into each long straight that is clear of hard bends, gates, the jump and each other */
    var pads = [];
    for (var r = 0; r < runs.length && pads.length < 4; r++) {
      var run = runs[r];
      /* a run's physical straight reaches the 200 px look-ahead past its last sample */
      if (run.count * sp + 200 < 300) continue;
      var pi = (run.start + 2) % n, ps = cum[pi], bad = false;
      for (var q = 0; q <= Math.round(320 / sp); q++) { if (bendAt(track, (pi + q) % n, 170) > 1.0) { bad = true; break; } }
      if (bad) continue;
      if (jump && sDist(track, ps, jump.s) < 200) continue;
      if (gatesS.some(function (g) { return sDist(track, ps, g) < 60; })) continue;
      if (pads.some(function (p) { return sDist(track, ps, p.s) < 0.15 * len; })) continue;
      /* every other strip sits toward the OUTSIDE of the next bend (the risk: it pulls you wide) */
      var off = 0;
      if (pads.length % 2 === 1) {
        var nb = nextBend(track, pi, 0.35, 900);
        off = -(nb ? nb.sign : 1) * 0.45 * HW;
      }
      var t0 = track.tang[pi], nx = -t0[1], ny = t0[0];
      pads.push({ i: pi, s: ps, off: off, x: track.pts[pi][0] + nx * off, y: track.pts[pi][1] + ny * off, ang: Math.atan2(t0[1], t0[0]), len: PHYS.PAD_LEN, w: PHYS.PAD_W });
    }
    /* GLOW NOTES: 3 trails of 5 per lap on the inside line, slid forward until clear */
    var notes = [], NOM = [0.12, 0.40, 0.66], tmp = {};
    function clear(s0) {
      for (var kk = 0; kk < 5; kk++) {
        var s = s0 + kk * PHYS.NOTE_GAP;
        if (gatesS.some(function (g) { return sDist(track, s, g) < 150; })) return false;
        if (pads.some(function (p) { return sDist(track, s, p.s) < 150; })) return false;
        if (jump && sDist(track, s, jump.s) < 250) return false;
      }
      return true;
    }
    for (var tr = 0; tr < NOM.length; tr++) {
      var s0 = -1;
      for (var st = 0; st <= 8; st++) { var cand = (NOM[tr] + st * 0.01) * len; if (clear(cand)) { s0 = cand; break; } }
      if (s0 < 0) continue;
      var i0 = idxAt(track, s0), bend = nextBend(track, i0, 0.35, 400);
      var side = bend ? bend.sign : (notes.length / 5) % 2 === 0 ? 1 : -1;
      var off2 = side * 0.5 * HW, trail = notes.length / 5;
      for (var k2 = 0; k2 < 5; k2++) {
        var p2 = pointAt(track, s0 + k2 * PHYS.NOTE_GAP, tmp);
        notes.push({ trail: trail, k: k2, s: (s0 + k2 * PHYS.NOTE_GAP) % len, i: p2.i, off: off2, x: p2.x - p2.ty * off2, y: p2.y + p2.tx * off2 });
      }
    }
    /* one signature set-piece per track (visual only) */
    var kind = track.deco === 'volcano' ? 'crystals' : track.deco === 'beach' ? 'dolphins' : 'tunnel';
    var spRun = kind === 'tunnel' ? (byLen[1] || byLen[0]) : byLen[0];
    var setPiece = spRun ? { kind: kind, i0: spRun.start, i1: (spRun.start + spRun.count - 1) % n } : { kind: kind, i0: 0, i1: 0 };
    return { pads: pads, jump: jump, notes: notes, trails: notes.length / 5, setPiece: setPiece };
  }
  /* the first sample within 'within' px ahead whose 170 px bend exceeds 'min' rad → {i, sign} */
  function nextBend(track, i, min, within) {
    var steps = Math.round(within / track.spacing), best = null, bestB = min;
    for (var q = 0; q <= steps; q++) {
      var j = (i + q) % track.n, b = bendAt(track, j, 170);
      if (b > bestB) { bestB = b; best = { i: j, sign: turnSign(track, j, 170), bend: b }; }
      else if (best && b < min) break;
    }
    return best;
  }

  /* ---------- beat ---------- */
  function beatPhase(t) { var p = (t % BEAT2) / BEAT2; return p < 0 ? p + 1 : p; }
  function beatLit(t) { return beatPhase(t) < 0.5; }

  /* ---------- medals and Stage classes (derived from the one PB time; nothing saved) ---------- */
  function medalFor(trackId, ms) {
    var p = PAR[trackId];
    if (!p || ms == null || !isFinite(ms)) return 0;
    return ms <= p.holo ? 4 : ms <= p.gold ? 3 : ms <= p.silver ? 2 : ms <= p.bronze ? 1 : 0;
  }
  /* the next medal above this time → {medal, id, name, icon, ms, gap} (gap null without a time), or null at Holo */
  function nextMedal(trackId, ms) {
    var p = PAR[trackId];
    if (!p) return null;
    var cur = ms == null ? 0 : medalFor(trackId, ms);
    if (cur >= 4) return null;
    var m = MEDALS[cur + 1], target = p[m.id];
    return { medal: cur + 1, id: m.id, name: m.name, icon: m.icon, ms: target, gap: ms == null ? null : ms - target };
  }
  function classUnlocked(trackId, pbMs, cls) {
    if (!cls) return true;
    var p = PAR[trackId];
    if (!p || pbMs == null) return false;
    return cls === 1 ? pbMs <= p.bronze : cls === 2 ? pbMs <= p.silver : false;
  }
  function fmt(ms, dp) {
    dp = dp == null ? 2 : dp;
    var t = ms / 1000, m = Math.floor(t / 60), sec = t - m * 60, s = sec.toFixed(dp);
    if (Number(s) >= 60) { m++; s = (0).toFixed(dp); }
    return m + ':' + (Number(s) < 10 ? '0' : '') + s;
  }

  /* ================================================================
     stepKart — one 120 Hz tick of kart physics: the SPIN / AIR /
     GROUND branch (drift state machine, boost, throttle, clamps,
     steering), the move along the travel angle, and the wall. Race
     consequences (Hype, events, counters) are applied by the caller
     from the returned report. m = {features, idx, edgeDrift, spot}.
     ================================================================ */
  var REP = {};
  function resetRep() {
    REP.onGrass = false; REP.contact = 0; REP.side = 0; REP.fizzle = false;
    REP.driftStart = 0; REP.driftTier = 0; REP.driftRelease = 0; REP.driftCancel = false;
    REP.trick = false; REP.landed = false; REP.landTrick = false; REP.spinEnd = false; REP.boostCancel = false;
    REP.boostSrc = ''; REP.boostDur = 0;
    return REP;
  }
  function giveBoost(k, dur, src, R) {
    if (dur > k.boostT) k.boostT = dur;
    k.boostSrc = src;
    if (R) { R.boostSrc = src; R.boostDur = dur; }
  }
  function endDrift(k) {
    var d = k.drift;
    d.on = false; d.hopT = 0; d.charge = 0; d.tier = 0; d.latch = true;
  }
  function releaseDrift(k, R) {
    var tier = k.drift.tier;
    endDrift(k);
    if (tier >= 1) giveBoost(k, PHYS.TIER_BOOST[tier - 1], 'drift', R);
    return tier;
  }
  function stepKart(track, k, inp, dt, m) {
    var R = resetRep(), feat = m.features !== false;
    var up = !!inp.up, down = !!inp.down, left = !!inp.left, right = !!inp.right;
    var nb0 = nearest(track, k.x, k.y, m.idx);
    var onGrass = nb0.d > HW + KERB, d = k.drift;
    R.onGrass = onGrass; k.onGrass = onGrass;
    if (!inp.drift) d.latch = false;
    if (feat && k.spinT > 0) {
      /* SPIN-OUT: slide along the nudged heading, controls ignored, then face forward (mercy) */
      var sv = Math.abs(k.v) - PHYS.SPIN_DECEL * dt;
      k.v = sv > 0 ? (k.v < 0 ? -sv : sv) : 0;
      k.spinT -= dt;
      if (k.spinT <= EPS) {
        k.spinT = 0;
        var tf = track.tang[nb0.i];
        k.h = Math.atan2(tf[1], tf[0]); k.spinDir = 0; R.spinEnd = true;
      }
    } else if (feat && k.air.on) {
      /* AIRBORNE: 35% steering, no throttle / brake / drag (a boost still pushes) */
      var a = k.air;
      a.t += dt;
      if (m.edgeDrift && !a.trick && a.t <= a.dur * PHYS.TRICK_WIN + EPS) { a.trick = true; R.trick = true; }
      if (k.boostT > 0 && k.v < VBOOST) k.v = Math.min(VBOOST, k.v + PHYS.BOOST_ACC * dt);
      var ga = Math.max(0.45, Math.min(1, Math.abs(k.v) / 110)) * (k.v < -1 ? -1 : 1) * PHYS.AIR_STEER;
      if (left) k.h -= TURN * ga * dt;
      if (right) k.h += TURN * ga * dt;
      if (a.t >= a.dur - EPS) {
        a.on = false; k.airH = 0; R.landed = true; R.landTrick = a.trick;
        if (a.trick) giveBoost(k, PHYS.TRICK_BOOST, 'trick', R);
      } else { var u = a.t / a.dur; k.airH = a.peak * 4 * u * (1 - u); }
    } else {
      /* GROUND */
      var vmax = onGrass ? VMAX_GRASS : VMAX;
      if (feat && m.spot) vmax *= PHYS.SPOT_MUL;
      if (feat) {
        if (down && k.boostT > 0) { k.boostT = 0; R.boostCancel = true; }
        if (d.on) {
          if (!inp.drift) R.driftRelease = releaseDrift(k, R) || -1;     /* -1: let go before the first tier (no boost, no cost) */
          else if (Math.abs(k.v) < PHYS.DRIFT_KEEP_V) { endDrift(k); R.driftCancel = true; }
        }
        if (!d.on && inp.drift && !d.latch && left !== right && k.v >= PHYS.DRIFT_MIN_V && !onGrass) {
          d.on = true; d.dir = right ? 1 : -1; d.hopT = 0; d.charge = 0; d.tier = 0;
          k.slideDir = d.dir; R.driftStart = d.dir;
        }
        if (d.on) {
          d.hopT += dt;
          d.charge = onGrass ? Math.max(0, d.charge - PHYS.GRASS_DRAIN * dt) : d.charge + dt;
          var T = PHYS.TIERS, tier = d.charge >= T[2] - EPS ? 3 : d.charge >= T[1] - EPS ? 2 : d.charge >= T[0] - EPS ? 1 : 0;
          if (tier > d.tier) R.driftTier = tier;
          d.tier = tier;
          k.slide = Math.min(PHYS.SLIDE, PHYS.SLIDE * d.hopT / PHYS.HOP);
        }
      }
      var boosting = feat && k.boostT > 0;
      var cap = boosting ? VBOOST : vmax;
      if (d.on) cap *= PHYS.DRIFT_CAP;
      if (boosting) { if (k.v < cap) k.v = Math.min(cap, k.v + PHYS.BOOST_ACC * dt); }
      else if (up && !down) { if (k.v < cap) k.v = Math.min(cap, k.v + ACCEL * dt); }
      else if (down) { if (k.v > 0) k.v -= BRAKE * dt; else k.v -= ACCEL * 0.6 * dt; }
      else { var dr = DRAG * dt; k.v = Math.abs(k.v) <= dr ? 0 : k.v - Math.sign(k.v) * dr; }
      if (k.v > cap) k.v = Math.max(cap, k.v - (onGrass ? 700 : 300) * dt);
      if (k.v < VREV) k.v = VREV;
      /* steering needs a little speed, but never none: a stopped kart can still
         turn slowly on the spot, so nobody gets stuck facing a wall */
      if (d.on && d.hopT > PHYS.HOP) {
        var sd = left && !right ? -1 : right && !left ? 1 : 0;
        var rate = PHYS.DRIFT_TURN + (sd === d.dir ? PHYS.DRIFT_INTO : sd === -d.dir ? -PHYS.DRIFT_AGAINST : 0);
        k.h += d.dir * rate * dt;
      } else {
        var grip = Math.max(0.45, Math.min(1, Math.abs(k.v) / 110)) * (k.v < -1 ? -1 : 1);
        if (left) k.h -= TURN * grip * dt;
        if (right) k.h += TURN * grip * dt;
      }
    }
    if (feat) {
      if (k.boostT > 0) k.boostT = Math.max(0, k.boostT - dt);
      if (!d.on && k.slide > 0) { k.slide = Math.max(0, k.slide - PHYS.SLIDE / PHYS.HOP * dt); if (!k.slide) k.slideDir = 0; }
      if (k.v > VCAP) k.v = VCAP;
    }
    /* move along the travel angle (the nose leads it while drifting) */
    var tr = (feat && k.spinT > 0) ? k.spinDir : (k.slide ? k.h - k.slideDir * k.slide : k.h);
    k.travel = tr;
    k.x += Math.cos(tr) * k.v * dt; k.y += Math.sin(tr) * k.v * dt;
    /* tyre walls: stop at the wall line, keep facing roughly along the track */
    var nb = nearest(track, k.x, k.y, m.idx);
    if (nb.d > WALL) {
      var c = track.pts[nb.i], nx = (k.x - c[0]) / nb.d, ny = (k.y - c[1]) / nb.d;
      var vn = (Math.cos(tr) * nx + Math.sin(tr) * ny) * k.v;
      /* bounce back a little inside the barrier and swing the nose along the track
         and slightly inwards so the next frame drives free instead of pinning the
         kart against the wall */
      k.x = c[0] + nx * (WALL - 3); k.y = c[1] + ny * (WALL - 3);
      if (!feat) k.v *= 0.45;
      var tt = track.tang[nb.i], along = Math.atan2(tt[1], tt[0]);
      if (Math.cos(k.h - along) < 0) along += Math.PI;
      var inward = Math.atan2(-ny, -nx), toIn = Math.atan2(Math.sin(inward - along), Math.cos(inward - along));
      along += Math.sign(toIn) * 0.3;
      k.h += Math.atan2(Math.sin(along - k.h), Math.cos(along - k.h)) * 0.5;
      if (!feat) R.contact = 4;
      else if (k.spinT > 0) { R.contact = 5; k.spinDir = k.h; }       /* already spinning: just keep it inside */
      else {
        var g = k.air.on ? 2 : vn < PHYS.SCRAPE_VN ? 1 : vn < PHYS.SPIN_VN ? 2 : 3;
        R.contact = g; R.side = (nx * -tt[1] + ny * tt[0]) >= 0 ? 1 : -1;
        if (d.on) { endDrift(k); R.fizzle = true; }
        if (g === 1) k.v *= 0.88;
        else if (g === 2) { k.v *= 0.5; if (k.boostT > 0) { k.boostT = 0; R.boostCancel = true; } }
        else { k.v *= 0.35; k.spinT = PHYS.SPIN_T; k.spinDir = k.h; k.boostT = 0; R.boostCancel = true; }
      }
    }
    /* the travel angle after any wall nudge (wrong-way and strip checks read it) */
    k.travel = (feat && k.spinT > 0) ? k.spinDir : (k.slide ? k.h - k.slideDir * k.slide : k.h);
    return R;
  }

  /* ---------- the baked reference run (rival + pacer replays) ---------- */
  var refCache = {};
  function bakeRef(trackId) {
    if (refCache[trackId]) return refCache[trackId];
    var race = newRace(trackId, { features: true, rivals: false, bake: true });
    var P = [], lat = [], n = 0, guard = Math.round(600 / STEP);
    P.push(race.Pc()); lat.push(race.lateral());
    while (!race.pr.finished && n < guard) {
      race.step(STEP, race.drivePlain());
      n++;
      if (n % 12 === 0) { P.push(Math.max(P[P.length - 1], race.Pc())); lat.push(race.lateral()); }
    }
    var ref = { dt: 0.1, P: new Float32Array(P), lat: new Float32Array(lat), ms: Math.round((race.s.bakeT || race.s.t) * 1000) };
    refCache[trackId] = ref;
    return ref;
  }
  function refP(ref, tau) {
    var P = ref.P, N = P.length, f = tau / ref.dt, i = Math.floor(f);
    if (i < 0) return P[0];
    if (i >= N - 1) return P[N - 1] + (P[N - 1] - P[N - 2]) * (f - (N - 1));
    return P[i] + (P[i + 1] - P[i]) * (f - i);
  }
  function refLat(ref, tau) {
    var L = ref.lat, N = L.length, f = tau / ref.dt, i = Math.floor(f);
    if (i < 0) return L[0];
    if (i >= N - 1) return L[N - 1];
    return L[i] + (L[i + 1] - L[i]) * (f - i);
  }
  /* reference clock (s) at which the reference run reached progress P */
  function refTauAt(ref, Pq) {
    var P = ref.P, N = P.length;
    if (Pq <= P[0]) return 0;
    if (Pq >= P[N - 1]) { var slope = (P[N - 1] - P[N - 2]) || 1; return (N - 1) * ref.dt + (Pq - P[N - 1]) / slope * ref.dt; }
    var lo = 0, hi = N - 1;
    while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (P[mid] <= Pq) lo = mid; else hi = mid; }
    var span = P[hi] - P[lo];
    return (lo + (span > 0 ? (Pq - P[lo]) / span : 0)) * ref.dt;
  }

  /* ================================================================
     newRace(trackId, opts) → race
     opts = {mode:'race'|'solo', cls:0|1|2, easy, pbMs, features = true,
             rivals = true, reduced, forceBoost (test hook)}
     ================================================================ */
  function newRace(trackId, opts) {
    opts = opts || {};
    var feat = opts.features !== false;
    var base = buildTrack(trackId), track = base;
    if (opts.bake) { track = Object.create(base); track.laps = base.laps + 1; }
    var laps = base.laps, len = base.len, F = base.feat, par = PAR[base.id] || null;
    var mode = opts.mode === 'solo' ? 'solo' : 'race', cls = opts.cls === 1 || opts.cls === 2 ? opts.cls : 0;
    var start = track.pts[0], tg = track.tang[0];
    var k = {
      x: start[0] - tg[0] * 30, y: start[1] - tg[1] * 30, h: Math.atan2(tg[1], tg[0]), v: 0,
      px: 0, py: 0, ph: 0, travel: 0, onGrass: false,
      slide: 0, slideDir: 0, drift: { on: false, dir: 0, hopT: 0, charge: 0, tier: 0, latch: false },
      boostT: 0, boostSrc: '', spotlightT: 0,
      air: { on: false, t: 0, dur: 0, peak: 0, trick: false }, airH: 0, spinT: 0, spinDir: 0
    };
    k.px = k.x; k.py = k.y; k.ph = k.h; k.travel = k.h;
    var pr = newProgress(track);
    pr.idx = nearest(track, k.x, k.y, null).i; pr.s = track.cum[pr.idx];
    /* start a touch behind the line: progress counts from there */
    pr.P = wrapDelta(track, 0, pr.s);
    var s = {
      t: 0, phase: 'race', done: false, started: false, inCount: false, countT: 0, countStart: false,
      wall: 0, wallT: 0, sev: 0, scrapes: 0, bumps: 0, spins: 0, wrongT: 0, wrong: false, grass: false,
      clean: true, cleanLaps: 0, wand: 0, spotlights: 0, lapLight: 0,
      rocket: false, rocketUsed: false, rocketArmed: false, prevInp: null,
      sparks: [0, 0, 0], pads: 0, padsOnBeat: 0, notes: 0, notesTotal: F.notes.length * laps, tricks: 0, jumps: 0, passes: 0,
      place: 0, rawPlace: 0, gap: null, gapRival: -1, finishT: null, finishPlace: 0, coastT: 0, cIdx: 0,
      lastLaunchP: -Infinity, bakeT: null, events: []
    };
    /* per-strip cooldown / re-arm progress, and this lap's collected notes (read-only for views) */
    var padReady = s.padReady = F.pads.map(function () { return 0; }), padArm = s.padArm = F.pads.map(function () { return -Infinity; });
    var noteGot = s.noteGot = F.notes.map(function () { return false; }), trailN = s.trailN = [];
    for (var ti = 0; ti < F.trails; ti++) trailN.push(0);
    var race = { track: track, k: k, pr: pr, s: s, rivals: [], pacers: [], opts: opts, laps: laps, ref: null, wantEvents: false };
    function emit(e) { if (race.wantEvents) s.events.push(e); }

    /* ---------- derived player position ---------- */
    function Pc() { var p = track.pts[pr.idx], t = track.tang[pr.idx]; return pr.P + (k.x - p[0]) * t[0] + (k.y - p[1]) * t[1]; }
    function lateral() { var p = track.pts[pr.idx], t = track.tang[pr.idx]; return (k.x - p[0]) * -t[1] + (k.y - p[1]) * t[0]; }
    race.Pc = Pc; race.lateral = lateral;

    /* ---------- Hype Wand + Spotlight ---------- */
    function boostEvent(src, dur) { emit({ type: 'boost', src: src, dur: dur }); }
    function addHype(n) {
      if (!feat || s.phase !== 'race') return;
      s.wand = Math.max(0, s.wand + n);
      if (s.wand >= PHYS.WAND) {
        s.wand = 0; k.spotlightT = PHYS.SPOT_T; s.spotlights++;
        emit({ type: 'spotlight' });
        giveBoost(k, PHYS.SPOT_BOOST, 'spotlight'); boostEvent('spotlight', PHYS.SPOT_BOOST);
      }
    }
    function endSpotlight(early) {
      if (k.spotlightT <= 0) return;
      k.spotlightT = 0; emit({ type: 'spotlightEnd', early: !!early });
    }
    function fireRocket() {
      s.rocketUsed = true; s.rocketArmed = false; s.rocket = true;
      giveBoost(k, PHYS.ROCKET_BOOST, 'rocket');
      emit({ type: 'rocket' }); boostEvent('rocket', PHYS.ROCKET_BOOST);
      addHype(HYPE.rocket);
    }
    function lightFor(lap) { return lap >= laps - 1 ? 2 : lap >= 1 ? 1 : 0; }

    /* ---------- gates, laps, pacer splits ---------- */
    function pacerSplits(Pgate) {
      for (var i = 0; i < race.pacers.length; i++) {
        var pc = race.pacers[i];
        emit({ type: 'pacerGap', kind: pc.kind, dt: s.t - refTauAt(race.ref, Pgate) / pc.rho });
      }
    }
    /* each event is emitted before the Hype it earns, so a 'spotlight' always follows its cause */
    pr.onCheck = function (n) {
      var clean = feat && s.clean;
      s.clean = true;
      emit({ type: 'gate', n: n, clean: clean });
      if (clean) addHype(HYPE.gate);
      if (race.pacers.length) pacerSplits(pr.lap * len + CHECKS[n - 1] * len);
    };
    pr.onLap = function (n) {
      var clean = feat && s.clean;
      s.clean = true;
      if (clean) s.cleanLaps++;
      emit({ type: 'lap', n: n, clean: clean });
      if (clean && n < laps) addHype(HYPE.gate);          /* the line is the 4th gate (not at the finish) */
      if (race.pacers.length) pacerSplits(n * len);
      for (var j = 0; j < noteGot.length; j++) noteGot[j] = false;
      for (var j2 = 0; j2 < trailN.length; j2++) trailN[j2] = 0;
      if (opts.bake && n === laps) s.bakeT = s.t;
      var ll = lightFor(n);
      if (ll !== s.lapLight && n < laps) { s.lapLight = ll; emit({ type: 'lightArc', level: ll }); }
      if (n === laps - 1) emit({ type: 'finalLap' });
    };

    /* ---------- the Glow Crew and Solo pacers ---------- */
    var needRef = opts.rivals !== false && !opts.bake;
    if (needRef) {
      race.ref = bakeRef(base.id);
      var refSec = race.ref.ms / 1000, refRate = (laps * len + 30) / refSec;
      if (mode === 'race') {
        race.rivals = CREW.map(function (c, i) {
          var T = null;
          if (par && cls === 1) T = par.silver + (par.bronze - par.silver) * DEBUT_F[i];
          else if (par && cls === 2) T = par.gold + (par.silver - par.gold) * HEAD_F[i];
          return { i: i, id: c.id, name: c.name, color: c.color, lane: c.lane, gridP: c.gridP, gridLat: c.gridLat,
            T: T, rho: T ? race.ref.ms / T : TRAINEE_M[i] * 0.75, tau: 0, P: 0, lat: 0, dodge: 0,
            x: 0, y: 0, h: k.h, px: 0, py: 0, ph: k.h, finished: false, finishT: null, airHop: 0, near: false, dist: Infinity };
        });
      } else {
        var pacers = [];
        if (opts.pbMs > 0) pacers.push({ kind: 'best', medal: medalFor(base.id, opts.pbMs), T: opts.pbMs, lane: 0.35 });
        var nm = nextMedal(base.id, opts.pbMs > 0 ? opts.pbMs : null);
        if (nm) pacers.push({ kind: 'next', medal: nm.medal, T: nm.ms, lane: -0.35 });
        race.pacers = pacers.map(function (p) {
          return { kind: p.kind, medal: p.medal, T: p.T, rho: race.ref.ms / p.T, lane: p.lane, tau: 0, P: 0, lat: 0,
            x: 0, y: 0, h: k.h, px: 0, py: 0, ph: k.h, finished: false, finishT: null, airHop: 0, near: false, dist: Infinity };
        });
      }
      race.refRate = refRate;
    }
    var mirror = 0.75, lastPc = Pc(), tmpPt = {};
    function placeRacer(r, P, lat) {
      var p = pointAt(track, P, tmpPt);
      r.px = r.x; r.py = r.y; r.ph = r.h;
      r.x = p.x - p.ty * lat; r.y = p.y + p.tx * lat;
      if (!r.init) { r.init = true; r.px = r.x; r.py = r.y; r.h = r.ph = Math.atan2(p.ty, p.tx); }
      var dx = r.x - r.px, dy = r.y - r.py;
      if (dx * dx + dy * dy > 1e-4) r.h = Math.atan2(dy, dx);
      var dj = F.jump ? ((P - F.jump.s) % len + len) % len : Infinity, hop = 170;
      r.airHop = dj < hop ? 24 * 4 * (dj / hop) * (1 - dj / hop) : 0;
    }
    function advanceRacer(r, sdt, refSec) {
      var tau0 = r.tau;
      r.tau += r.rho * sdt;
      if (!r.finished && r.tau >= refSec) {
        r.finished = true;
        var frac = r.tau > tau0 ? (refSec - tau0) / (r.tau - tau0) : 1;
        r.finishT = s.t - sdt + frac * sdt;
        return true;
      }
      return false;
    }
    function updateRivals(sdt, playerPc, playerLat) {
      if (!race.ref) return;
      var refSec = race.ref.ms / 1000, fade = Math.max(0, 1 - s.t / 8), i, r;
      /* Trainee mirror pacing: an EWMA of the player's pace against the reference */
      if (s.phase === 'race' && sdt > 0) {
        if (s.t < 2) mirror = 0.75;
        else {
          var inst = clamp((playerPc - lastPc) / sdt / race.refRate, -1, 3);
          mirror = clamp(mirror + (inst - mirror) * Math.min(1, sdt / 5), 0, 1.5);
        }
      }
      lastPc = playerPc;
      for (i = 0; i < race.rivals.length; i++) {
        r = race.rivals[i];
        if (!r.finished && s.phase === 'race') {
          if (cls === 0 || !r.T) r.rho = clamp(TRAINEE_M[i] * mirror + 0.15 * clamp((playerPc - r.P) / 400, -1, 1), 0.30, 0.95);
          else if (cls === 1) r.rho = race.ref.ms / r.T - 0.06 * clamp((r.P - playerPc) / 500, 0, 1);
          else r.rho = race.ref.ms / r.T;
        }
        if (advanceRacer(r, sdt, refSec)) emit({ type: 'rivalFinish', i: i });
        r.P = refP(race.ref, r.tau) + r.gridP * fade;
        var latBase = r.gridLat * fade + r.lane * HW * (1 - fade) + 0.5 * refLat(race.ref, r.tau);
        /* dodge: the rival eases aside as you come through (rival-side only) */
        var latNow = latBase + r.dodge, close = Math.abs(r.P - playerPc) < 45 && Math.abs(latNow - playerLat) < 32;
        if (close && s.phase === 'race') {
          var away = (latNow - playerLat) || r.lane || 1, tgt = (away > 0 ? 1 : -1) * 0.5 * HW;
          r.dodge += clamp(tgt - r.dodge, -125 * sdt, 125 * sdt);
        } else r.dodge += clamp(-r.dodge, -30 * sdt, 30 * sdt);
        r.lat = clamp(latBase + r.dodge, -0.85 * HW, 0.85 * HW);
        placeRacer(r, r.P, r.lat);
        r.dist = Math.hypot(r.x - k.x, r.y - k.y); r.near = r.dist < 60;
      }
      for (i = 0; i < race.pacers.length; i++) {
        r = race.pacers[i];
        advanceRacer(r, sdt, refSec);
        r.P = refP(race.ref, r.tau);
        r.lat = clamp(r.lane * HW + 0.5 * refLat(race.ref, r.tau), -0.85 * HW, 0.85 * HW);
        placeRacer(r, r.P, r.lat);
        r.dist = Math.hypot(r.x - k.x, r.y - k.y); r.near = r.dist < 60;
      }
    }
    /* places: rank by progress; finished rivals by finish time; a change must hold 1 s */
    var aheadMask = 0, candMask = -1, candT = 0;
    for (var gi = 0; gi < race.rivals.length; gi++) aheadMask |= 1 << gi;
    function bits(m) { var c = 0; while (m) { c += m & 1; m >>= 1; } return c; }
    function updatePlaces(sdt, playerPc, v) {
      if (!race.rivals.length) { s.place = s.rawPlace = 0; return; }
      var mask = 0, best = null, bestI = -1;
      for (var i = 0; i < race.rivals.length; i++) {
        var r = race.rivals[i];
        if (r.finished || r.P > playerPc) mask |= 1 << i;
        if (!r.finished && r.P > playerPc && (best == null || r.P < best)) { best = r.P; bestI = i; }
      }
      s.rawPlace = 1 + bits(mask);
      s.gap = best == null ? null : (best - playerPc) / Math.max(60, v); s.gapRival = bestI;
      if (mask === aheadMask) { candMask = -1; candT = 0; }
      else if (mask !== candMask) { candMask = mask; candT = 0; }
      else {
        candT += sdt;
        if (candT >= 1 - EPS) {
          var place = 1 + bits(mask);
          for (var j = 0; j < race.rivals.length; j++) {
            var was = (aheadMask >> j) & 1, now = (mask >> j) & 1;
            if (was && !now) { s.passes++; emit({ type: 'pass', rival: j, place: place }); }
            else if (!was && now) emit({ type: 'passedBy', rival: j, place: place });
          }
          aheadMask = mask; candMask = -1; candT = 0;
        }
      }
      s.place = 1 + bits(aheadMask);
    }
    if (race.rivals.length) { s.place = s.rawPlace = race.rivals.length + 1; }

    /* ---------- one fixed step ---------- */
    function xform(raw) {
      raw = raw || {};
      var down = !!raw.down;
      return { up: opts.easy ? !down : !!raw.up, down: down, left: !!raw.left, right: !!raw.right, drift: !!raw.drift };
    }
    function step(dt, raw) {
      if (s.done) return;
      if (s.phase === 'coast') { coast(dt); return; }
      k.px = k.x; k.py = k.y; k.ph = k.h;
      s.t += dt; s.inCount = false;
      var inp = xform(raw), prev = s.prevInp;
      var edgeUp = !!(prev && inp.up && !prev.up), edgeDrift = !!(prev && inp.drift && !prev.drift);
      s.prevInp = inp;
      if (!s.started) { s.started = true; emit({ type: 'go' }); }
      if (feat && opts.forceBoost) k.boostT = Math.max(k.boostT, 0.5);
      /* rocket start: a fresh press just before GO (armed by countdown) or just after */
      if (feat && !s.rocketUsed) {
        if (s.rocketArmed || ((opts.easy ? edgeDrift : edgeUp) && s.t <= PHYS.ROCKET_POST + EPS)) fireRocket();
      }
      var wasAir = k.air.on, wasGrass = s.grass;
      var rep = stepKart(track, k, inp, dt, { features: feat, idx: pr.idx, edgeDrift: edgeDrift, spot: k.spotlightT > 0 });
      if (feat) {
        if (k.spotlightT > 0) { k.spotlightT -= dt; if (k.spotlightT <= EPS) { k.spotlightT = 0; emit({ type: 'spotlightEnd', early: false }); } }
        if (rep.driftStart) emit({ type: 'driftStart', dir: rep.driftStart });
        if (rep.driftTier) emit({ type: 'driftTier', tier: rep.driftTier });
        if (rep.driftRelease) onRelease(rep.driftRelease);
        if (rep.trick) { s.tricks++; emit({ type: 'trick' }); }
        if (rep.landed) {
          emit({ type: 'land', trick: rep.landTrick });
          if (rep.landTrick) { addHype(HYPE.trick); boostEvent('trick', PHYS.TRICK_BOOST); }
        }
        if (rep.onGrass !== wasGrass) { s.grass = rep.onGrass; emit({ type: 'grass', on: s.grass }); }
      }
      if (rep.contact) {
        var g = rep.contact;
        if (g !== 5) s.clean = false;
        if (g >= 1 && g <= 3 && (s.wallT <= 0 || g > s.sev)) {
          s.sev = s.wallT <= 0 ? g : Math.max(s.sev, g);
          if (rep.fizzle) emit({ type: 'fizzle' });
          if (g === 1) { s.scrapes++; addHype(HYPE.scrape); emit({ type: 'scrape', side: rep.side }); }
          else if (g === 2) { s.bumps++; addHype(HYPE.bump); endSpotlight(true); emit({ type: 'bump' }); }
          else { s.spins++; s.wand = 0; endSpotlight(true); emit({ type: 'spin' }); }
        } else if (rep.fizzle) emit({ type: 'fizzle' });
        if (g !== 5) {
          if (s.wallT <= 0) { s.wall++; if (g === 4) emit({ type: 'bump' }); }
          s.wallT = PHYS.WALL_DEBOUNCE;
        }
      }
      s.wallT -= dt;
      if (s.wallT <= 0) s.sev = 0;
      var prevP = pr.P;
      updateProgress(track, pr, k.x, k.y, Math.abs(k.v) * dt * 2.5 + 24, s.t);
      var tw = track.tang[pr.idx], alongV = (Math.cos(k.travel) * tw[0] + Math.sin(k.travel) * tw[1]) * k.v;
      if (feat && !pr.finished) features(prevP, alongV, wasAir);
      /* wrong way = actually travelling against the track direction (works at any speed,
         and reversing a little to untangle from a wall doesn't trigger it) */
      s.wrongT = alongV < -40 ? s.wrongT + dt : Math.max(0, s.wrongT - dt * 2);
      var wrong = s.wrongT > 0.6;
      if (wrong !== s.wrong) { s.wrong = wrong; emit({ type: 'wrongWay', on: wrong }); }
      var pc = Pc();
      updateRivals(dt, pc, lateral());
      if (pr.finished) finish(pc);
      else updatePlaces(dt, pc, Math.abs(k.v));
    }
    function onRelease(tier) {
      if (tier > 0) {
        s.sparks[tier - 1]++;
        emit({ type: 'driftRelease', tier: tier });
        boostEvent('drift', PHYS.TIER_BOOST[tier - 1]);
        addHype(PHYS.TIER_HYPE[tier - 1]);
      } else emit({ type: 'driftRelease', tier: 0 });
    }
    function features(prevP, alongV, wasAir) {
      var i;
      /* BEAT STRIPS */
      for (i = 0; i < F.pads.length; i++) {
        if (s.t < padReady[i] || pr.P < padArm[i] || k.air.on || alongV <= PHYS.PAD_MIN_V) continue;
        var p = F.pads[i], t0 = track.tang[p.i], dx = k.x - p.x, dy = k.y - p.y;
        if (Math.abs(dx * t0[0] + dy * t0[1]) > p.len / 2 || Math.abs(-dx * t0[1] + dy * t0[0]) > p.w / 2) continue;
        var lit = beatLit(s.t), dur = lit ? PHYS.PAD_ON : PHYS.PAD_OFF;
        padReady[i] = s.t + PHYS.PAD_CD; padArm[i] = pr.P + 0.5 * len;
        s.pads++; if (lit) s.padsOnBeat++;
        giveBoost(k, dur, 'pad');
        emit({ type: 'pad', i: i, onBeat: lit }); boostEvent('pad', dur);
        addHype(lit ? HYPE.padOn : HYPE.padOff);
      }
      /* GLOW NOTES */
      var r2 = PHYS.NOTE_R * PHYS.NOTE_R;
      for (i = 0; i < F.notes.length; i++) {
        if (noteGot[i]) continue;
        var q = F.notes[i], ex = k.x - q.x, ey = k.y - q.y;
        if (ex * ex + ey * ey > r2) continue;
        noteGot[i] = true; s.notes++;
        trailN[q.trail]++;
        var full = trailN[q.trail] === 5;
        emit({ type: 'note', trail: q.trail, k: q.k, full: full });
        addHype(HYPE.note + (full ? HYPE.trail : 0));
      }
      /* STAGE JUMP: launch when progress crosses its line forwards at speed, on the tarmac */
      var J = F.jump;
      if (J && !k.air.on && !wasAir && k.spinT <= 0 && pr.P > prevP && k.v >= PHYS.JUMP_MIN_V && pr.P - s.lastLaunchP > PHYS.JUMP_GAP &&
          Math.floor((pr.P - J.s) / len) > Math.floor((prevP - J.s) / len) && nearest(track, k.x, k.y, pr.idx).d <= HW + KERB) {
        if (k.drift.on) onRelease(releaseDrift(k, null) || -1);
        var a = k.air;
        a.on = true; a.t = 0; a.dur = 0.35 + 0.0012 * k.v; a.peak = 24 * k.v / 270; a.trick = false;
        s.jumps++; s.lastLaunchP = pr.P;
        emit({ type: 'jump' });
      }
    }
    function finish(pc) {
      s.finishT = s.t; s.phase = 'coast'; s.coastT = 0; s.cIdx = pr.idx;
      var place = 1;
      for (var i = 0; i < race.rivals.length; i++) { var r = race.rivals[i]; if (r.finished && r.finishT < s.finishT) place++; }
      s.place = s.rawPlace = s.finishPlace = race.rivals.length ? place : 0;
      if (k.drift.on) endDrift(k);
      s.finishPc = pc;
      emit({ type: 'finish', place: s.finishPlace, ms: Math.round(s.finishT * 1000) });
    }
    /* VICTORY COAST: input ignored, plain steering toward 150 px/s, progress frozen */
    function coast(dt) {
      k.px = k.x; k.py = k.y; k.ph = k.h;
      var sdt = dt * (!opts.reduced && s.coastT < PHYS.SLOWMO_T ? PHYS.SLOWMO : 1);
      s.t += sdt; s.coastT += sdt;
      var nb = nearest(track, k.x, k.y, s.cIdx); s.cIdx = nb.i;
      if (k.air.on) {
        k.air.t += sdt;
        if (k.air.t >= k.air.dur) { k.air.on = false; k.airH = 0; } else { var u = k.air.t / k.air.dur; k.airH = k.air.peak * 4 * u * (1 - u); }
      }
      if (k.spinT > 0) {
        k.spinT -= sdt;
        if (k.spinT <= EPS) { k.spinT = 0; var tf = track.tang[nb.i]; k.h = Math.atan2(tf[1], tf[0]); }
      } else {
        var look = track.pts[ahead(track, nb.i, 95)], want = Math.atan2(look[1] - k.y, look[0] - k.x), diff = wrapAng(want - k.h);
        var grip = Math.max(0.45, Math.min(1, Math.abs(k.v) / 110)) * (k.air.on ? PHYS.AIR_STEER : 1);
        if (diff < -0.04) k.h -= TURN * grip * sdt; else if (diff > 0.04) k.h += TURN * grip * sdt;
        k.v += clamp(PHYS.COAST_V - k.v, -BRAKE * 0.5 * sdt, ACCEL * sdt);
      }
      if (k.boostT > 0) k.boostT = Math.max(0, k.boostT - sdt);
      if (k.spotlightT > 0) k.spotlightT = Math.max(0, k.spotlightT - sdt);
      if (k.slide > 0) { k.slide = Math.max(0, k.slide - PHYS.SLIDE / PHYS.HOP * sdt); if (!k.slide) k.slideDir = 0; }
      var tr = k.spinT > 0 ? k.spinDir : (k.slide ? k.h - k.slideDir * k.slide : k.h);
      k.travel = tr;
      k.x += Math.cos(tr) * k.v * sdt; k.y += Math.sin(tr) * k.v * sdt;
      var nw = nearest(track, k.x, k.y, s.cIdx);
      if (nw.d > WALL) {
        var c = track.pts[nw.i], nx = (k.x - c[0]) / nw.d, ny = (k.y - c[1]) / nw.d;
        k.x = c[0] + nx * (WALL - 3); k.y = c[1] + ny * (WALL - 3); k.v *= 0.5;
      }
      updateRivals(sdt, s.finishPc, lateral());
      if (s.coastT >= PHYS.COAST_T - EPS) s.done = true;
    }

    /* ---------- countdown hook (rocket arming + input baseline) ---------- */
    function countdown(countT, raw, isStart) {
      var inp = xform(raw), prev = s.prevInp, key = opts.easy ? 'drift' : 'up';
      if (feat && prev && isStart && !s.rocketUsed && inp[key] && !prev[key] && countT > 0 && countT <= PHYS.ROCKET_PRE + EPS) s.rocketArmed = true;
      s.prevInp = inp; s.inCount = true; s.countT = countT; s.countStart = !!isStart;
    }
    function pauseReset() {
      if (k.drift.on) { endDrift(k); k.drift.latch = false; }
      s.prevInp = null;
    }
    /* is the rocket-start window open right now? (pad glow cue) */
    function rocketWindow() {
      if (!feat || s.rocketUsed || s.phase !== 'race') return false;
      if (s.inCount) return s.countStart && s.countT > 0 && s.countT <= PHYS.ROCKET_PRE + EPS;
      return s.started && s.t <= PHYS.ROCKET_POST + EPS;
    }

    /* ---------- the two deterministic drivers ---------- */
    /* PLAIN: today's line and bend braking; boost-aware; never drifts, seeks or tricks */
    function drivePlain(o) {
      var look = track.pts[(pr.idx + Math.round(95 / track.spacing)) % track.n];
      var want = Math.atan2(look[1] - k.y, look[0] - k.x) + ((o && o.jitter) || 0);
      var diff = Math.atan2(Math.sin(want - k.h), Math.cos(want - k.h));
      /* ease off before tight bends (a hairpin needs ~170), and creep forward
         when slow — steering needs a little speed, so never sit still */
      var t0 = track.tang[pr.idx], t1 = track.tang[(pr.idx + Math.round(170 / track.spacing)) % track.n];
      var bend = Math.acos(Math.max(-1, Math.min(1, t0[0] * t1[0] + t0[1] * t1[1])));
      var target = bend > 1.4 ? 175 : bend > 0.8 ? 215 : VMAX, ad = Math.abs(diff);
      if (feat && bend <= 0.8) { if (k.boostT > 0) target = VBOOST; else if (k.spotlightT > 0) target = VMAX * PHYS.SPOT_MUL; }
      return { up: (ad < 0.75 || k.v < 60) && k.v < target, down: k.v > target + 30 || (ad > 1.1 && k.v > 140), left: diff < -0.04, right: diff > 0.04, drift: false };
    }
    /* STYLE: drifts the bends, seeks the strips, tricks every jump (the Gold/Holo reference).
       Steering is measured against the travel angle; one drift per bend (re-armed once the
       bend ahead eases), released at Gold sparks, at the track's release charge once the
       bend is ending, or as soon as it has any sparks on a straight. */
    var lastDrift = false, styleArmed = true;
    function driveStyle() {
      var ST = STYLE[base.id] || STYLE_DEFAULT, i = pr.idx;
      var travel = k.slide ? k.h - k.slideDir * k.slide : k.h;
      var latT = 0, hard = false;
      for (var q = 0; q <= Math.round(250 / track.spacing); q++) if (bendAt(track, i + q, 170) > 0.8) { hard = true; break; }
      if (!hard) {
        for (var j = 0; j < F.pads.length; j++) {
          var d = ((F.pads[j].s - track.cum[i]) % len + len) % len;
          if (d < 300 && s.t >= padReady[j] && pr.P >= padArm[j]) { latT = F.pads[j].off; break; }
        }
      }
      var li = ahead(track, i, ST.look), lp = track.pts[li], lt = track.tang[li];
      var want = Math.atan2(lp[1] + lt[0] * latT - k.y, lp[0] - lt[1] * latT - k.x), diff = wrapAng(want - travel), ad = Math.abs(diff);
      var b170 = bendAt(track, i, 170), b200 = bendAt(track, i, 200), b120 = bendAt(track, i, 120);
      var target = b170 > 1.4 ? ST.t14 : b170 > 0.8 ? ST.t08 : VMAX;
      if (k.boostT > 0 && b170 <= ST.boostBend) target = VBOOST;
      else if (k.spotlightT > 0 && b170 <= 0.8) target = VMAX * PHYS.SPOT_MUL;
      var inp = { up: (ad < 0.75 || k.v < 60) && k.v < target, down: k.v > target + 30 || (ad > 1.1 && k.v > 140), left: diff < -0.04, right: diff > 0.04, drift: false };
      var dr = k.drift;
      if (b200 < ST.enter * ST.rearm) styleArmed = true;
      if (k.air.on) {
        inp.drift = !k.air.trick && !lastDrift;          /* tap ✨ for the trick */
      } else if (dr.on) {
        inp.drift = !(dr.tier >= 3 || (dr.charge >= ST.rel && b120 < 0.25) || (dr.tier >= 1 && b120 < 0.05));
        var into = diff * dr.dir;
        inp.left = false; inp.right = false;
        if (into > ST.dz) { if (dr.dir > 0) inp.right = true; else inp.left = true; }
        else if (into < -ST.dz) { if (dr.dir > 0) inp.left = true; else inp.right = true; }
      } else if (styleArmed && b200 > ST.enter && k.v >= 160 && k.boostT <= 0 && ad < 0.5 && !k.onGrass && !dr.latch) {
        var dir = turnSign(track, i, 200);
        if (dir) { inp.drift = true; inp.left = dir < 0; inp.right = dir > 0; styleArmed = false; }
      }
      lastDrift = inp.drift;
      return inp;
    }
    /* driver input while the countdown runs: the plain driver holds GO early (a normal
       start); the style driver presses fresh at countT 0.1 (a rocket start) */
    function driveCountdown(countT, style) { return style ? { up: countT <= 0.1 } : { up: true }; }

    race.step = step; race.countdown = countdown; race.pauseReset = pauseReset; race.rocketWindow = rocketWindow;
    race.drivePlain = drivePlain; race.driveStyle = driveStyle; race.driveCountdown = driveCountdown;
    race.result = function () { return pr.finished && s.finishT != null ? { finished: true, ms: Math.round(s.finishT * 1000) } : null; };
    race.features = feat; race.mode = mode; race.cls = cls;
    /* rivals sit on the grid before GO */
    updateRivals(0, Pc(), lateral());
    return race;
  }

  /* headless helper: 3 s countdown then drive with the plain or style driver until done */
  function simulate(trackId, opts, style, maxSec) {
    var race = newRace(trackId, opts);
    var c = 3;
    while (c > 0) { c -= STEP; var ct = Math.max(0, c); race.countdown(ct, race.driveCountdown(ct, style), true); }
    var guard = Math.round((maxSec || 300) / STEP), n = 0;
    while (!race.s.done && n < guard) { race.step(STEP, style ? race.driveStyle() : race.drivePlain()); n++; }
    return race;
  }

  var API = {
    LW: LW, LH: LH, SCALE: SCALE, WW: WW, WH: WH, HW: HW, KERB: KERB, VERGE: VERGE, WALL: WALL, LAPS: LAPS, CHECKS: CHECKS,
    STEP: STEP, PHYS: PHYS, VMAX: VMAX, BPM: BPM, BEAT2: BEAT2, HYPE: HYPE,
    TRACKS: TRACKS, CREW: CREW, CLASSES: CLASSES, MEDALS: MEDALS, PAR: PAR, STYLE: STYLE,
    catmull: catmull, resample: resample, buildTrack: buildTrack, buildFeatures: buildFeatures, nearest: nearest, wrapDelta: wrapDelta,
    newProgress: newProgress, updateProgress: updateProgress, pointAt: pointAt, bendAt: bendAt, turnSign: turnSign, sDist: sDist,
    stepKart: stepKart, bakeRef: bakeRef, refP: refP, refLat: refLat, refTauAt: refTauAt, newRace: newRace, simulate: simulate,
    medalFor: medalFor, nextMedal: nextMedal, classUnlocked: classUnlocked, beatLit: beatLit, beatPhase: beatPhase, fmt: fmt
  };
  if (typeof module === 'object' && module.exports) module.exports = API;
  if (typeof window !== 'undefined') window.SLKartLogic = API;
})();
