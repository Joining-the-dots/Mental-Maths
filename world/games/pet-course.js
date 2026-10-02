/* ================================================================
   Game A — Debut Run (the Pet Obstacle Course, key 'course').
   The child's own pet makes its stage debut: one original 70-second
   song played out down a glowing toy-stage runway.

   THE SONG IS THE LEVEL. Every obstacle sits on the 128 BPM beat grid
   (docs/island3d/spec-runner.json). Taking off ON the beat is both the
   safest and the best-scoring move (PERFECT). Mistakes cost something:
   a bump takes a heart, wipes Hype, spills treats and loses exactly two
   beats; losing every heart brings a kind CURTAIN CALL.

   This file is the pure, Node-testable rules (UMD: window.SLCourse in
   the browser, module.exports in Node) plus the shell wiring and the
   2D fallback renderer. Rules for the logic:
     • fixed 1/120 s steps from the shell; no Date.now() when cfg.seed
       is given; the lag model is closed-form so totals are exact;
     • zero allocations in step(): index cursors, a fixed spill pool,
       events pushed only while round.wantEvents (never in Node);
     • every gameplay sound goes through api.sound (≤ 3 per step).
   Learning points are never earned or spent here.
   ================================================================ */
(function () {
  'use strict';
  var HAS_WIN = typeof window !== 'undefined';
  var Shell = HAS_WIN ? window.SLGameShell : null;

  /* ---------------- tuning: every number in one place ---------------- */
  var BPM = 128, BEAT = 60 / BPM, STEP = 1 / 120;
  var TUNING = {
    LW: 960, LH: 540, GROUND: 452, PET_X: 170,
    HB_X: 34, PET_W: 62, PET_H: 56, SLIDE_H: 28,        /* hitbox: pl = dist + PET_X + HB_X (= dist + 204) */
    G: 2400, JUMP_V: 900, DJUMP_V: 760, BOUNCE_V: 980, DIVE_V: 1400, POP_V: 520,
    COYOTE: 0.09, BUFFER: 0.12, TUMBLE_BUFFER: 0.6, IGNORE_T: 0.3,
    SLIDE_T: 0.6, SLIDE_MAX: 1.0,
    STEP: STEP, BPM: BPM, BEAT: BEAT, BAR: 4 * BEAT,
    EDGE: 4, SINK: 6, PUDDLE_Y: 2, GATE_GAP: 40,       /* collision kept from the old game */
    CUSH_PREV: 4, CUSH_NOW: 2, CUSH_OVERLAP: 20,         /* cushion bounce test */
    PICK_UP: 40, PICK_UP_SLIDE: 14, PICK_X: 40, PICK_Y: 46, MAGNET: 70,
    PERFECT: 0.070, GREAT: 0.140, JUDGE_MIN: -0.2, JUDGE_MAX: 1.0,
    HYPE_X2: 8, HYPE_X3: 20, FEVER: 32,
    HEARTS: 3, FAN_HEARTS: 5, BONUS_HEARTS: 3,
    GRACE_BUMP: 1.4, GRACE_SPLASH: 1.15, GRACE_SHIELD: 0.6,
    /* tumble: knocked back at f=-0.5 for 0.18 s, stopped until 0.5 s, then a linear
       ramp back to full speed over R, chosen so the total lag is exactly 2 beats */
    TUMBLE_KNOCK: 0.18, TUMBLE_STOP: 0.5, TUMBLE_F: -0.5,
    TUMBLE_R: 2 * (2 * BEAT - 0.59), TUMBLE_T: 0.5 + 2 * (2 * BEAT - 0.59), TUMBLE_LAG: 2 * BEAT,
    SLIP_F: 0.5, SLIP_T: 2 * BEAT, SLIP_LAG: BEAT,
    SPILL_BUMP: 8, SPILL_SPLASH: 3, SPILL_POOL: 11, SPILL_G: 1400, SPILL_GRAB: 0.35, SPILL_SIT: 0.6, SPILL_Y: 24,
    SPILL_VX0: -240, SPILL_VXR: 380, SPILL_VY0: -560, SPILL_VYS: 80,
    SCORE: { SNACK: 3, STAR: 15, BOING: 10, PERFECT: 2, LETTER: 30, CLEAN: 25, FINISH: 250, HEART: 50, SPILL: 3, MAX: 5000 },
    MEDAL: { SILVER: 2000, GOLD: 2800 },
    TAIL_BEATS: 2, ENC_BEATS: 16, ENC_V: 350, FINISH_HOLD: 2.0, CURTAIN_T: 2.0, FINISH_STOP: 0.6,
    /* take-off windows in ms (lo-hi lead from take-off / slide start until the pet's front
       reaches o.x+4). Derived from the collision code below at 120 Hz; tests re-derive it. */
    WIN: {
      290: { low: [59, 393], log: [42, 210], hedge: [92, 229], stack: [265, 514], puddle: [0, 183], bar: [0, 234] },
      310: { low: [59, 412], log: [42, 241], hedge: [92, 256], stack: [285, 518], puddle: [0, 219], bar: [0, 258] },
      330: { low: [59, 428], log: [42, 269], hedge: [92, 280], stack: [303, 522], puddle: [0, 250], bar: [0, 278] },
      350: { low: [59, 443], log: [42, 294], hedge: [92, 301], stack: [318, 526], puddle: [0, 278], bar: [0, 297] },
      380: { low: [59, 462], log: [42, 326], hedge: [92, 328], stack: [339, 530], puddle: [0, 315], bar: [0, 321] }
    }
  };
  var T = TUNING, WIN = TUNING.WIN, SC = TUNING.SCORE;
  var LW = T.LW, LH = T.LH, GROUND = T.GROUND, PET_X = T.PET_X;
  var PL_OFF = PET_X + T.HB_X, PR_OFF = PL_OFF + T.PET_W, PET_CX = PL_OFF + T.PET_W / 2;   /* 204, 266, 235 */

  /* locked course colours (unchanged; the island look table copies them) */
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
  /* obstacle kit in logic px (the 3D view models them at exactly these sizes, /100) */
  var KINDS = {
    low:    { w: 30, h: 58 },
    log:    { w: 88, h: 44 },
    hedge:  { w: 68, h: 78 },
    stack:  { w: 56, h: 116, cushion: 116 },             /* pink BOING cushion top at exactly 116 */
    puddle: { w: 108, h: 0 },
    bar:    { w: 52, h: 100, gap: 40, board: 60, post: 220 }   /* LED gate: underside 40 px up */
  };

  /* ---------------- the song: 6 sections on the beat grid ---------------- */
  var SECTIONS = [
    { id: 'rehearsal', name: 'REHEARSAL', pop: 'REHEARSAL', beats: 16, v: 290, first: 5, gaps: [4, 4], pool: ['low', 'low', 'log', 'puddle'], stars: 0, letter: 'E', shields: 0 },
    { id: 'verse', name: 'VERSE', pop: 'VERSE', beats: 32, v: 310, first: 2, gaps: [4, 4, 4, 4, 3, 3, 4], pool: ['low', 'low', 'log', 'puddle', 'hedge'], stars: 1, letter: 'N', shields: 1 },
    { id: 'prechorus', name: 'PRE-CHORUS', pop: 'PRE-CHORUS', beats: 16, v: 330, first: 2, gaps: [3, 3, 3, 3], pool: ['low', 'log', 'hedge', 'bar', 'puddle'], stars: 1, letter: 'C', shields: 0 },
    { id: 'chorus', name: 'CHORUS', pop: 'CHORUS!', beats: 32, v: 350, first: 2, gaps: [4, 3, 3, 2, 2, 4, 3, 3, 2, 2], pool: ['low', 'log', 'hedge', 'stack', 'bar', 'puddle'], stars: 2, letter: 'O', shields: 1 },
    { id: 'bridge', name: 'BOUNCE BRIDGE', pop: 'BOUNCE BRIDGE', beats: 16, v: 330, first: 2, gaps: [4, 4, 4], pool: ['stack'], stars: 3, letter: 'R', shields: 0 },
    { id: 'final', name: 'FINAL CHORUS', pop: 'FINAL CHORUS', beats: 32, v: 380, first: 2, gaps: [2, 2, 4, 2, 2, 4, 2, 2, 4, 2, 2], pool: ['low', 'log', 'hedge', 'stack', 'bar'], stars: 3, letter: 'E', shields: 0 }
  ];
  var LETTERS = 'ENCORE';
  var LETTER_HINT = ['REHEARSAL, at the top of a jump', 'VERSE, up high with a double jump', 'PRE-CHORUS, sliding under an LED gate',
    'CHORUS, on top of a pink cushion', 'BOUNCE BRIDGE, BOING then double jump', 'FINAL CHORUS, up high with a double jump'];

  /* schedule segments: the 6 sections, the 2-beat run-out to the finish arch, the Encore,
     then an open end. Times are schedule time tau = t - lag. */
  var SEG = [];
  (function () {
    var t = 0, d = 0, b = 0;
    function add(beats, v, sec) { SEG.push({ t0: t, t1: t + beats * BEAT, d0: d, v: v, b0: b, sec: sec }); t += beats * BEAT; d += beats * BEAT * v; b += beats; }
    SECTIONS.forEach(function (sc, i) { sc.t0 = t; sc.d0 = d; sc.b0 = b; add(sc.beats, sc.v, i); });
    add(T.TAIL_BEATS, SECTIONS[5].v, 5);
    add(T.ENC_BEATS, T.ENC_V, 6);
    SEG.push({ t0: t, t1: Infinity, d0: d, v: T.ENC_V, b0: b, sec: 6 });
  })();
  var RUN_T = SECTIONS[5].t0 + SECTIONS[5].beats * BEAT;              /* 144 beats = 67.5 s */
  var FINISH_T = SEG[7].t0, ENC_END_T = SEG[8].t0;                   /* arch 2 beats later at 68.4375 s; Encore ends 7.5 s on */
  var FINISH_D = SEG[7].d0;                                          /* 23,081.25 px */
  TUNING.RUN_T = RUN_T; TUNING.FINISH_T = FINISH_T; TUNING.ENC_END_T = ENC_END_T; TUNING.FINISH_D = FINISH_D;

  function segAt(tau) { var i = 0; while (i < SEG.length - 1 && tau >= SEG[i].t1) i++; return SEG[i]; }
  function schedDist(tau) { if (tau <= 0) return SEG[0].v * tau; var g = segAt(tau); return g.d0 + g.v * (tau - g.t0); }
  function schedV(tau) { return tau <= 0 ? SEG[0].v : segAt(tau).v; }
  function schedTime(d) {
    if (d <= 0) return d / SEG[0].v;
    var i = 0; while (i < SEG.length - 1 && d >= SEG[i + 1].d0) i++;
    return SEG[i].t0 + (d - SEG[i].d0) / SEG[i].v;
  }
  function sectionAt(tau) { var i = 0; while (i < 5 && tau >= SECTIONS[i + 1].t0) i++; return i; }

  /* ---------------- canonical paths (heights per 1/120 s step after take-off) ----------------
     The exact integration the step uses, so items sit exactly on the beat-timed move:
       jump · dj (double jump 0.375 s after take-off) · boing (bounce off a cushion) ·
       boingdj (BOING plus a double jump 0.41 s after the bounce). */
  function simPath(kind) {
    var H = [0], y = 0, vy = -T.JUMP_V, bounce = -1, n, prev, h;
    var dj = kind === 'dj' ? Math.round(0.375 / STEP) : -1;
    for (n = 1; n < 600; n++) {
      if (n - 1 === dj) vy = -T.DJUMP_V;
      if (kind === 'boingdj' && bounce >= 0 && n - 1 === bounce + Math.ceil(0.41 / STEP - 1e-6)) vy = -T.DJUMP_V;
      prev = -y; vy += T.G * STEP; y += vy * STEP; h = -y;
      if ((kind === 'boing' || kind === 'boingdj') && bounce < 0 && vy > 0 && prev >= KINDS.stack.h - T.CUSH_PREV && h <= KINDS.stack.h + T.CUSH_NOW) {
        y = -KINDS.stack.h; vy = -T.BOUNCE_V; bounce = n; h = KINDS.stack.h;
      }
      if (y >= 0) { H.push(0); break; }
      H.push(h);
    }
    var apex = 0, from = bounce >= 0 ? bounce : 0;
    for (var k = from; k < H.length; k++) if (H[k] > H[apex] || apex < from) apex = k;
    return { H: H, land: H.length - 1, bounce: bounce, apex: apex };
  }
  var PATH = { jump: simPath('jump'), dj: simPath('dj'), boing: simPath('boing'), boingdj: simPath('boingdj') };
  function pathH(p, n) { return n < p.H.length ? p.H[n] : 0; }

  /* ---------------- seeds ---------------- */
  function fnv1a(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h >>> 0;
  }
  /* one chart per course per day: same for every sibling and device */
  function seedFor(day, variant) { return fnv1a('debut|' + day + '|' + variant) || 7; }
  /* the same xorshift as SLGameShell.rng, inline so Node and the browser draw identical charts */
  function xorshift(seed) {
    var s = (seed >>> 0) || 1;
    return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  }
  function localDay() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }

  /* ---------------- beat-grid generator (pure, seeded) ---------------- */
  function winMid(v, kind) { var w = WIN[v][kind]; return (w[0] + w[1]) / 2000; }
  function pickN(r, arr, n) {             /* n distinct random picks (partial Fisher-Yates on a copy) */
    var a = arr.slice(), out = [];
    for (var i = 0; i < n && a.length; i++) { var j = Math.floor(r() * a.length); out.push(a[j]); a.splice(j, 1); }
    return out;
  }
  function fixKind(k, f) { if (k === 'stack' && f < 4) k = 'hedge'; if (k === 'hedge' && f < 3) k = 'log'; return k; }
  function drawKind(r, pool, f, banned) {
    var ok = pool.filter(function (k) { return banned.indexOf(k) < 0 && fixKind(k, f) === k; });
    return ok.length ? ok[Math.floor(r() * ok.length)] : 'low';
  }

  function buildCourse(seed) {
    var r = xorshift(seed);
    var obs = [], items = [], enc = [], doors = [];
    for (var si = 0; si < SECTIONS.length; si++) {
      var sec = SECTIONS[si], i, j;
      /* 1. shuffle the spacings */
      var gaps = sec.gaps.slice();
      for (i = gaps.length - 1; i > 0; i--) { j = Math.floor(r() * (i + 1)); var tg = gaps[i]; gaps[i] = gaps[j]; gaps[j] = tg; }
      /* 2. slot beats and what follows each */
      var n = gaps.length + 1, slots = [], foll = [], b = sec.first;
      for (i = 0; i < n; i++) { slots.push(b); if (i < gaps.length) b += gaps[i]; }
      var nextFirst = si < 5 ? SECTIONS[si + 1].first : T.TAIL_BEATS;
      for (i = 0; i < n; i++) foll.push(i < gaps.length ? gaps[i] : sec.beats - slots[i] + nextFirst);
      /* 3. roll kinds, then apply the spacing rules (a 2-beat slot can only be low/log/bar/puddle) */
      var kinds = [];
      for (i = 0; i < n; i++) kinds.push(si === 2 && i === 0 ? 'bar' : fixKind(sec.pool[Math.floor(r() * sec.pool.length)], foll[i]));
      /* 4. special slots: the section's letter, glow stars and shields (one item per slot) */
      var special = []; for (i = 0; i < n; i++) special.push('');
      var idx = function (pred) { var out = []; for (var q = 0; q < n; q++) if (pred(q)) out.push(q); return out; };
      var li = si, ls;
      if (si === 0) ls = pickN(r, idx(function () { return true; }), 1)[0];
      else if (si === 1 || si === 5) {
        var dj = idx(function (q) { return foll[q] >= 3 && kinds[q] !== 'bar' && kinds[q] !== 'stack'; });
        if (dj.length) ls = pickN(r, dj, 1)[0];
        else { ls = pickN(r, idx(function (q) { return foll[q] >= 3; }), 1)[0]; kinds[ls] = drawKind(r, sec.pool, foll[ls], ['bar', 'stack']); }
      } else if (si === 2) ls = pickN(r, idx(function (q) { return kinds[q] === 'bar'; }), 1)[0];
      else if (si === 3) {
        var st = idx(function (q) { return kinds[q] === 'stack'; });
        if (st.length) ls = pickN(r, st, 1)[0];
        else { ls = pickN(r, idx(function (q) { return foll[q] >= 4; }), 1)[0]; kinds[ls] = 'stack'; }
      } else ls = pickN(r, idx(function () { return true; }), 1)[0];
      special[ls] = 'letter';
      if (sec.stars) {
        var sc = idx(function (q) { return !special[q] && foll[q] >= 3 && kinds[q] !== 'bar'; });
        if (sc.length < sec.stars) {
          var extra = pickN(r, idx(function (q) { return !special[q] && foll[q] >= 3 && kinds[q] === 'bar'; }), sec.stars - sc.length);
          extra.forEach(function (q) { kinds[q] = drawKind(r, sec.pool, foll[q], ['bar']); });
          sc = sc.concat(extra);
        }
        pickN(r, sc, sec.stars).forEach(function (q) { special[q] = 'star'; });
      }
      if (sec.shields) {
        var sh = idx(function (q) { return !special[q] && kinds[q] !== 'bar' && kinds[q] !== 'stack'; });
        if (!sh.length) { sh = idx(function (q) { return !special[q]; }); sh = pickN(r, sh, 1); kinds[sh[0]] = 'low'; }
        pickN(r, sh, sec.shields).forEach(function (q) { special[q] = 'shield'; });
      }
      /* 5. place each obstacle so a take-off ON its beat is exactly at the window midpoint */
      for (i = 0; i < n; i++) {
        var gb = sec.b0 + slots[i], tb = gb * BEAT, kind = kinds[i], K = KINDS[kind], mid = winMid(sec.v, kind);
        var x = Math.round(schedDist(tb) + PR_OFF + sec.v * mid - T.EDGE);
        var sp = special[i], move = kind === 'bar' ? 'slide' : kind === 'stack' ? 'boing' : 'jump';
        if (sp === 'letter' && (si === 1 || si === 5)) move = 'dj';
        if (sp === 'letter' && si === 4) move = 'boingdj';
        if (sp === 'star' && kind !== 'stack') move = 'dj';
        var o = { x: x, w: K.w, h: K.h, kind: kind, sec: si, slot: i, beat: gb, rehearsal: si === 0 || (si === 2 && i === 0),
          mid: mid, cueX: x + T.EDGE - sec.v * mid - T.PET_W / 2, move: move, item: -1, cue: false,
          hit: false, hitT: 0, bounced: false, bounceT: 0, passed: false, judge: 0 };
        obs.push(o);
        placeItems(items, o, tb, foll[i], sp, li);
      }
      if (si > 0) doors.push({ x: Math.round(sec.d0 + PET_CX), sec: si, name: sec.name });
    }
    /* Encore: 7 snack arcs on alternate beats (hop on the beat) + 4 glow stars at DJ height */
    for (var k = 1; k <= 13; k += 2) {
      var te = FINISH_T + k * BEAT;
      [18, 45, 72].forEach(function (st) { enc.push(item(te, st, PATH.jump, 'snack', 6)); });
      if (k === 1 || k === 5 || k === 9 || k === 13) enc.push(item(te, PATH.dj.apex, PATH.dj, 'star', 6));
    }
    items.sort(function (a, b2) { return a.x - b2.x; });
    enc.sort(function (a, b2) { return a.x - b2.x; });
    obs.forEach(function (o2, oi) { o2.index = oi; });
    items.forEach(function (it, ii) { if (it.obs >= 0) { var ob = obs[it.obs]; if (it.kind !== 'snack') ob.item = ii; } });
    return { seed: seed, obs: obs, items: items, enc: enc, doors: doors,
      finishX: Math.round(FINISH_D + PET_CX), encoreEndX: Math.round(SEG[8].d0 + PET_CX), finishD: FINISH_D, length: FINISH_D };

    function item(tb, step, path, kind, sec2) {
      return { x: Math.round(schedDist(tb + step * STEP) + PET_CX), y: Math.round(GROUND - T.PICK_UP - pathH(path, step)), kind: kind, ch: '', li: -1, slide: false, got: false, sec: sec2, obs: -1 };
    }
    function placeItems(list, o, tb, f, sp, li) {
      var oi = obs.length - 1, base = o.kind === 'stack' ? PATH.boing : PATH.jump, add = function (it) { it.obs = oi; list.push(it); return it; };
      var spItem = null, spPath = null, spStep = -1;
      if (sp) {                                                         /* 'letter' | 'star' | 'shield' */
        if (o.kind === 'bar') {                                         /* C: under the gate, only while sliding */
          spItem = { x: o.x + o.w / 2, y: GROUND - T.PICK_UP_SLIDE, kind: sp, ch: '', li: -1, slide: true, got: false, sec: o.sec, obs: -1 };
        } else {
          spPath = o.move === 'dj' ? PATH.dj : o.move === 'boingdj' ? PATH.boingdj : o.kind === 'stack' ? PATH.boing : PATH.jump;
          spStep = spPath === PATH.jump ? Math.round(0.375 / STEP) : spPath.apex;
          spItem = item(tb, spStep, spPath, sp, o.sec);
        }
        if (sp === 'letter') { spItem.ch = LETTERS[li]; spItem.li = li; }
        add(spItem);
      }
      /* path snacks */
      var steps = o.kind === 'puddle' ? [0.12, 0.29, 0.46, 0.63] : o.kind === 'stack' ? [0.15, 0.375] : [0.15, 0.375, 0.6];
      if (o.kind === 'bar') {
        var c = o.x + o.w / 2, offs = spItem ? [-40, 40, 80] : [-40, 0, 40];
        offs.forEach(function (dx) { add({ x: c + dx, y: GROUND - T.PICK_UP_SLIDE, kind: 'snack', ch: '', li: -1, slide: true, got: false, sec: o.sec, obs: -1 }); });
      } else {
        steps.forEach(function (tau) {
          var st = Math.round(tau / STEP);
          if (spPath === PATH.jump && st === spStep) return;          /* the special takes the apex spot */
          add(item(tb, st, base, 'snack', o.sec));
        });
        if (o.kind === 'stack') add(item(tb, base.bounce + 24, base, 'snack', o.sec));
      }
      /* beat snacks: one per spare beat from slot+2 to the next slot-1 (≤ 4), on the ground —
         or on the bounce path while a BOING is still in the air */
      for (var bb = 2; bb <= Math.min(f - 1, 5); bb++) {
        var st2 = Math.round(bb * BEAT / STEP), h = pathH(base, st2);
        if (h > 0 && spPath === base && Math.abs(st2 - spStep) < 14) st2 = spStep + 30;   /* keep clear of the apex prize */
        h = pathH(base, st2);
        var it = item(tb, st2, base, 'snack', o.sec);
        if (h <= 0) it.y = GROUND - 30;
        add(it);
      }
    }
  }

  /* ---------------- medals + result packing ---------------- */
  function medal(score, finished, encoreCleared) {
    if (!finished) return 0;                                   /* curtain call or time-up: Trainee ribbon */
    if (encoreCleared && score >= T.MEDAL.GOLD) return 4;      /* Encore Legend */
    if (score >= T.MEDAL.GOLD) return 3;
    if (score >= T.MEDAL.SILVER) return 2;
    return 1;
  }
  var MEDALS = [
    { name: 'Trainee', icon: '🎀', kind: 'ribbon' }, { name: 'Rookie', icon: '🥉', kind: 'bronze' },
    { name: 'Rising Star', icon: '🥈', kind: 'silver' }, { name: 'Superstar', icon: '🥇', kind: 'gold' },
    { name: 'Encore Legend', icon: '👑', kind: 'crown' }
  ];
  /* extra bitfield: bits 0-2 medal, 3-8 letters E N C O R E, 9-15 maxHype (≤127), 16 Fan support */
  function encodeExtra(o) {
    o = o || {};
    return ((o.medal | 0) & 7) | (((o.letters | 0) & 63) << 3) | (Math.max(0, Math.min(127, o.maxHype | 0)) << 9) | (o.fan ? 65536 : 0);
  }
  function decodeExtra(n) {
    n = n | 0;
    return { medal: n & 7, letters: (n >> 3) & 63, maxHype: (n >> 9) & 127, fan: !!(n & 65536) };
  }
  function tierOf(h) { return h >= T.FEVER ? 4 : h >= T.HYPE_X3 ? 3 : h >= T.HYPE_X2 ? 2 : 1; }

  /* speed factor of the running effect (tumble / slip) — pure, used by the judge and autopilot */
  function effFactor(s) {
    if (s.eff === 'tumble') {
      var tau = s.effT;
      if (tau < T.TUMBLE_KNOCK) return T.TUMBLE_F;
      if (tau < T.TUMBLE_STOP) return 0;
      return Math.min(1, (tau - T.TUMBLE_STOP) / T.TUMBLE_R);
    }
    return s.eff === 'slip' ? T.SLIP_F : 1;
  }
  function speedNow(s) { return schedV(s.sched) * effFactor(s); }
  /* closed-form lag of an effect tau seconds after it began */
  function tumbleL(tau) {
    var k = T.TUMBLE_KNOCK, L1 = (1 - T.TUMBLE_F) * k, L2 = L1 + (T.TUMBLE_STOP - k);
    if (tau < k) return (1 - T.TUMBLE_F) * tau;
    if (tau < T.TUMBLE_STOP) return L1 + (tau - k);
    var u = Math.min(tau - T.TUMBLE_STOP, T.TUMBLE_R);
    return L2 + u - u * u / (2 * T.TUMBLE_R);
  }

  /* ---------------- autopilots (pure: read state + course, answer with an action) ----------------
     returns 0 nothing · 1 jump · 2 slide · 3 double jump
       safe     — on-beat take-offs (jump at lead ≤ mid, slide for gates); never double jumps
       showcase — safe + scripted special moves (DJ letters/stars, BOING+DJ for R, Encore hops)
       demo     — showcase plus one deliberately missed obstacle (the shop preview's bump) */
  function nextObstacle(s, course) {
    var obs = course.obs;
    for (var i = s.oc; i < obs.length; i++) { var o = obs[i]; if (!o.passed && !o.hit) return i; }
    return -1;
  }
  function autopilotWants(s, course, mode) {
    mode = mode || 'safe';
    var grounded = s.onGround || s.coyote > 0;
    if (s.phase === 'encore') {
      if (mode === 'safe' || !grounded) return 0;
      var e = s.sched - FINISH_T, k = Math.floor(e / BEAT + 1e-9);
      return (k & 1) && k <= 13 && e - k * BEAT < 0.05 ? 1 : 0;
    }
    if (s.phase !== 'run') return 0;
    if (s.eff === 'tumble' && s.effT < T.IGNORE_T) return 0;
    if (!grounded) {
      if (mode === 'safe' || s.airJumps <= 0) return 0;
      var ob = s.toObs >= 0 ? course.obs[s.toObs] : null;
      if (ob && ob.move === 'dj' && s.djT < s.toT && s.t - s.toT >= 0.375 - 1e-6) return 3;
      var bo = s.bounceObs >= 0 ? course.obs[s.bounceObs] : null;
      if (bo && bo.move === 'boingdj' && s.bounceT > s.toT && s.djT < s.bounceT && s.t - s.bounceT >= 0.41 - 1e-6) return 3;
      return 0;
    }
    var i = nextObstacle(s, course);
    if (i < 0) return 0;
    if (mode === 'demo' && i === s.demoMiss) return 0;
    var o = course.obs[i], v = speedNow(s);
    if (v <= 0) return 0;
    var lead = (o.x + T.EDGE - (s.dist + PR_OFF)) / v;
    if (lead > o.mid) return 0;
    if (o.kind === 'bar') return s.sliding ? 0 : 2;
    return 1;
  }

  /* ---------------- Fan support + streaks: session memory per child (never stored) ---------------- */
  var session = {};
  function sess(cfg) { var k = String((cfg && cfg.profileKey) || '_'); return session[k] || (session[k] = { fan: null, manual: false, curtains: 0 }); }
  function fanFor(cfg) {
    if (!cfg || cfg.demo) return false;
    if (cfg.fan != null) return !!cfg.fan;
    var m = sess(cfg);
    if (m.fan === null) m.fan = cfg.tutSeen === false;          /* ON for the very first Debut Run */
    return !!m.fan;
  }

  /* ---------------- a round ---------------- */
  function newRound(api, variant, cfg) {
    cfg = cfg || {};
    api = api || { sound: function () {} };
    var theme = THEMES[variant] || THEMES.course_meadow;
    var seed = (cfg.seed != null && cfg.seed !== '') ? (cfg.seed >>> 0) || 7 : cfg.demo ? 2026 : seedFor(cfg.day || localDay(), variant || 'course_meadow');
    var course = cfg.course || buildCourse(seed);
    var obs = course.obs, items = course.items, enc = course.enc;
    var fan = fanFor(cfg), H = fan ? T.FAN_HEARTS : T.HEARTS;
    var petIdx = { pet_puppy: 0, pet_kitten: 1, pet_bunny: 2, pet_dragon: 3 }[(cfg.pet && cfg.pet.id) || 'pet_puppy'] || 0;
    obs.forEach(function (o) { o.cue = o.rehearsal || fan; });
    var spill = [];
    for (var p = 0; p < T.SPILL_POOL; p++) spill.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, landed: false, age: 0, landT: 0 });
    var s = {
      t: 0, lag: 0, lagBase: 0, sched: 0, dist: 0, y: 0, vy: 0, onGround: true, airJumps: 1, coyote: T.COYOTE, buffer: 0, prevH: 0,
      sliding: false, slideT: 0, slideStart: -9, slideHeld: false, diving: false,
      eff: null, effT: 0, effStart: 0, effL: 0, inv: 0, shield: false, ready: false,
      hearts: H, maxHearts: H, hype: 0, mult: 1, fever: false, streak: 0,
      treats: 0, stars: 0, lettersMask: 0, score: 0, perfects: 0, greats: 0, bounces: 0, bumps: 0, splashes: 0, bonks: 0, regrabs: 0, spilled: 0,
      maxHype: 0, fan: fan, section: 0, phase: 'run', endT: 0, finished: false, encoreCleared: false, timeUp: false, curtain: false,
      clean: true, secClears: 0, encMult: 1, progress: 0, grade: 0, endV: 0,
      toT: -9, toObs: -1, bounceT: -9, bounceObs: -1, djT: -9, landT: -9,
      oc: 0, ic: 0, ec: 0, lastBeat: -1, cdBeat: -999, needSync: true, snd: 0, spillNext: 0, curtainSaid: false, demoMiss: -1,
      spill: spill
    };
    var ms = { section: 0, mult: 1, fever: false, lastHeart: false, tumble: false, phase: 'run', curtain: false };

    /* ---------- helpers (no allocations) ---------- */
    function snd(name, vol, step) { if (s.snd >= 3) return; s.snd++; try { api.sound(name, vol, step); } catch (e) {} }
    function mu(method, a, b) {
      var m = api.music; if (!m || typeof m[method] !== 'function') return;
      try { m[method](a, b); } catch (e) {}
    }
    var wantE = function () { return round.wantEvents && round.events; };
    function emit(type, a, av, b, bv) {
      if (!wantE()) return;
      var e = { type: type }; if (a) e[a] = av; if (b) e[b] = bv;
      round.events.push(e);
    }
    function ignoring() { return s.eff === 'tumble' && s.effT < T.IGNORE_T; }
    function setHype(h) {
      var oldMult = s.mult, oldFever = s.fever, oldHype = s.hype;
      s.hype = h < 0 ? 0 : h; if (s.hype > s.maxHype) s.maxHype = s.hype;
      s.mult = tierOf(s.hype); s.fever = s.hype >= T.FEVER;
      if (s.mult !== oldMult) { emit('tier', 'mult', s.mult); if (s.mult > oldMult && s.mult < 4) snd('powerup', 0.7); }
      if (s.fever && !oldFever) { snd('sting'); snd('whoosh'); emit('fever'); mu('set', 'fever', true); mu('key', 2); }
      if (!s.fever && oldFever) { emit('feverEnd'); mu('set', 'fever', false); mu('key', 0); }
      if (s.hype !== oldHype) mu('set', 'hype', Math.min(1, s.hype / T.FEVER));
    }
    function startEffect(kind) {
      if (s.eff) endEffect();
      s.eff = kind; s.effStart = s.t; s.effT = 0; s.effL = 0;
      if (kind === 'tumble') mu('set', 'tumble', true);
    }
    function endEffect() {
      s.lagBase += s.eff === 'tumble' ? T.TUMBLE_LAG : T.SLIP_LAG;      /* always whole beats */
      if (s.eff === 'tumble') mu('set', 'tumble', false);
      s.eff = null; s.effT = 0; s.effL = 0;
    }
    function stepLag() {
      if (s.eff) {
        var tau = s.t - s.effStart; s.effT = tau;
        if (s.eff === 'tumble') { if (tau >= T.TUMBLE_T) endEffect(); else s.effL = tumbleL(tau); }
        else if (tau >= T.SLIP_T) endEffect(); else s.effL = (1 - T.SLIP_F) * tau;
      }
      s.lag = s.lagBase + s.effL;
    }

    /* judge the next obstacle at a ground take-off or slide start (against its window, never the audio clock) */
    function judgeNext() {
      s.grade = 0; s.toObs = -1;
      var v = speedNow(s);
      if (v <= 0 || s.phase !== 'run') return;
      var pr = s.dist + PR_OFF;
      for (var i = s.oc; i < obs.length; i++) {
        var o = obs[i]; if (o.passed || o.hit) continue;
        var lead = (o.x + T.EDGE - pr) / v;
        if (lead > T.JUDGE_MAX) break;
        if (lead < T.JUDGE_MIN) continue;
        var d = Math.abs(lead - o.mid), g = d <= T.PERFECT ? 3 : d <= T.GREAT ? 2 : 1;
        o.judge = g; s.grade = g; s.toObs = i;
        if (g === 3) snd('pop', 0.6);
        return;
      }
    }
    function takeoff() {
      s.vy = -T.JUMP_V; s.onGround = false; s.coyote = 0; s.buffer = 0; s.ready = false; s.sliding = false;
      s.toT = s.t; judgeNext();
      snd('jump'); emit('takeoff', 'grade', s.grade);
    }
    function doubleJump() {
      s.airJumps--; s.vy = -T.DJUMP_V; s.djT = s.t;
      snd('jump'); snd('combo', 0.7, 1); emit('dj');
    }
    function startSlide() {
      s.sliding = true; s.slideT = 0; s.slideStart = s.t; s.diving = false; s.toT = s.t;
      judgeNext(); snd('whoosh', 0.4); emit('slide');
    }
    function land() {
      var hard = s.vy > 900;
      s.y = 0; s.vy = 0; s.onGround = true; s.airJumps = 1; s.coyote = T.COYOTE; s.landT = s.t;
      if (hard) snd('chip', 0.25);
      emit('land', 'hard', hard);
      if (s.diving) startSlide();
    }
    function spillTreats(cap) {
      var n = Math.min(cap, s.treats);
      if (n <= 0) return;
      s.treats -= n; s.score -= SC.SPILL * n; s.spilled += n;
      var cx = s.dist + PET_CX, cy = GROUND + s.y - T.PET_H / 2;
      for (var i = 0; i < n; i++) {
        var q = s.spill[s.spillNext]; s.spillNext = (s.spillNext + 1) % T.SPILL_POOL;   /* a new spill overwrites the oldest */
        q.on = true; q.x = cx; q.y = cy; q.landed = false; q.age = 0; q.landT = 0;
        q.vx = n === 1 ? 0 : T.SPILL_VX0 + T.SPILL_VXR * i / (n - 1);
        q.vy = T.SPILL_VY0 - (i % 3) * T.SPILL_VYS;
      }
      emit('spill', 'n', n);
    }
    function tumble() {
      startEffect('tumble');
      s.vy = -T.POP_V; s.onGround = false; s.coyote = 0; s.sliding = false; s.diving = false; s.buffer = 0; s.ready = false;
      s.inv = T.GRACE_BUMP;
    }
    function bump(o) {
      s.bumps++; s.hearts--; s.streak = 0; s.clean = false;
      setHype(0);
      spillTreats(T.SPILL_BUMP);
      tumble();
      snd('bump'); snd('oof');
      if (s.hearts === 1) { snd('heartbeat'); emit('lastHeart'); mu('set', 'lastHeart', true); } else snd('miss', 0.5);
      emit('bump', 'kind', o.kind, 'rehearsal', false);
      if (s.hearts <= 0) curtain();
    }
    function splash(o) {
      s.splashes++; s.streak = 0; s.clean = false;
      setHype(Math.floor(s.hype / 2));
      spillTreats(T.SPILL_SPLASH);
      startEffect('slip'); s.sliding = false; s.inv = T.GRACE_SPLASH;
      snd('skid'); snd('miss', 0.5);
      emit('splash', 'kind', o.kind, 'rehearsal', false);
    }
    function contact(o) {
      o.hit = true; o.hitT = s.t;                  /* a hit prop is flattened and passable */
      if (s.inv > 0) return;                       /* grace: no cost */
      if (o.rehearsal) {                           /* free mistakes: the flip (or slip) only */
        s.bonks++;
        if (o.kind === 'puddle') { startEffect('slip'); s.sliding = false; s.inv = T.GRACE_SPLASH; snd('skid'); snd('boing'); emit('splash', 'kind', o.kind, 'rehearsal', true); }
        else { tumble(); snd('oof'); snd('boing'); emit('bump', 'kind', o.kind, 'rehearsal', true); }
        return;
      }
      if (s.shield) {                              /* Bubble Shield: nothing lost */
        s.shield = false; s.inv = T.GRACE_SHIELD;
        snd('pop'); snd('shield'); emit('shieldPop', 'kind', o.kind);
        return;
      }
      if (o.kind === 'puddle') splash(o); else bump(o);
    }
    function bounce(o, i) {
      o.bounced = true; o.bounceT = s.t;
      s.y = -o.h; s.vy = -T.BOUNCE_V; s.airJumps = 1; s.onGround = false; s.coyote = 0;
      s.bounces++; s.score += SC.BOING * s.mult; s.bounceT = s.t; s.bounceObs = i;
      snd('boing'); snd('combo', 0.8, Math.min(9, s.streak + 1)); emit('boing');
    }
    function passObs(o) {
      o.passed = true;
      if (o.hit) return;
      var add = 1;
      if (o.judge === 3) { add++; s.perfects++; s.score += SC.PERFECT * s.mult; } else if (o.judge === 2) s.greats++;
      if (o.bounced) add++;
      s.streak++; s.secClears++;
      setHype(s.hype + add);
      snd('combo', 0.8, Math.min(9, s.streak));
      emit('clear', 'kind', o.kind, 'perfect', o.judge === 3);
    }
    function collide() {
      var pl = s.dist + PL_OFF, pr = pl + T.PET_W, h = -s.y, petH = s.sliding ? T.SLIDE_H : T.PET_H;
      for (var i = s.oc; i < obs.length; i++) {
        var o = obs[i];
        if (o.x - 12 > pr) break;
        if (o.passed) { if (i === s.oc) s.oc++; continue; }
        var ox1 = o.x + T.EDGE, ox2 = o.x + o.w - T.EDGE;
        if (pl >= ox2) { passObs(o); if (i === s.oc) s.oc++; continue; }
        if (o.hit || pr <= ox1) continue;
        /* cushion: falling onto the top from above (feet crossed it this step) with ≥ 20 px overlap */
        if (o.kind === 'stack' && !s.onGround && s.vy > 0 && s.prevH >= o.h - T.CUSH_PREV && h <= o.h + T.CUSH_NOW &&
            Math.min(pr, ox2) - Math.max(pl, ox1) >= T.CUSH_OVERLAP) { bounce(o, i); h = -s.y; continue; }
        var hit = o.kind === 'puddle' ? h < T.PUDDLE_Y : o.kind === 'bar' ? h + petH > T.GATE_GAP : h < o.h - T.SINK;
        if (hit) { contact(o); if (s.phase !== 'run') return; }
      }
    }
    function collect(it, inEncore) {
      it.got = true;
      var m = inEncore ? s.encMult : s.mult;
      if (it.kind === 'snack') { s.treats++; s.score += SC.SNACK * m; snd('coin'); emit('snack', 'x', it.x, 'y', it.y); }
      else if (it.kind === 'star') { s.stars++; s.score += SC.STAR * m; snd('star'); emit('star', 'x', it.x, 'y', it.y); }
      else if (it.kind === 'shield') { s.shield = true; snd('shield'); emit('shieldGet'); }
      else if (it.kind === 'letter') {
        s.lettersMask |= 1 << it.li; s.score += SC.LETTER;
        emit('letter', 'ch', it.ch, 'li', it.li);
        if (s.lettersMask === 63) { snd('fanfare'); emit('lettersComplete'); } else snd('powerup');
      }
    }
    function pickList(list, cur, inEncore) {
      var cx = s.dist + PET_CX, cy = GROUND + s.y - (s.sliding ? T.PICK_UP_SLIDE : T.PICK_UP);
      var c = s[cur];
      for (var i = c; i < list.length; i++) {
        var it = list[i];
        if (it.x > cx + T.MAGNET) break;
        if (it.got || it.x < cx - T.MAGNET) { if (i === s[cur]) s[cur]++; continue; }
        var big = s.fever && it.kind === 'snack', hx = big ? T.MAGNET : T.PICK_X, hy = big ? T.MAGNET : T.PICK_Y;
        if (Math.abs(it.x - cx) < hx && Math.abs(it.y - cy) < hy && (!it.slide || s.sliding)) collect(it, inEncore);
      }
    }
    function stepSpill(dt, canGrab) {
      var cx = s.dist + PET_CX, cy = GROUND + s.y - (s.sliding ? T.PICK_UP_SLIDE : T.PICK_UP);
      var hx = s.fever ? T.MAGNET : T.PICK_X, hy = s.fever ? T.MAGNET : T.PICK_Y, floor = GROUND - T.SPILL_Y;
      for (var i = 0; i < T.SPILL_POOL; i++) {
        var q = s.spill[i]; if (!q.on) continue;
        q.age += dt;
        if (!q.landed) {
          q.vy += T.SPILL_G * dt; q.x += q.vx * dt; q.y += q.vy * dt;
          if (q.vy > 0 && q.y >= floor) { q.y = floor; q.landed = true; q.landT = 0; }
        } else { q.landT += dt; if (q.landT >= T.SPILL_SIT) { q.on = false; continue; } }
        if (canGrab && q.age >= T.SPILL_GRAB && Math.abs(q.x - cx) < hx && Math.abs(q.y - cy) < hy) {
          q.on = false; s.treats++; s.regrabs++; s.score += SC.SNACK;     /* win it back (+3 at x1) */
          snd('coin'); emit('regrab', 'x', q.x, 'y', q.y);
        }
      }
    }
    function door(sec) {
      var ended = s.section;
      s.section = sec;
      /* CLEAN STAGE: no bump or splash, and the section was actually played (≥ 1 clean clear) */
      if (s.clean && s.secClears > 0) { s.score += SC.CLEAN; snd('star', 0.6); emit('cleanStage', 'sec', ended); }
      s.clean = true; s.secClears = 0;
      var before = s.hearts;
      if (s.fan) { s.hearts = s.maxHearts; if (!s.shield) { s.shield = true; emit('shieldGet', 'free', true); } }
      else s.hearts = Math.min(s.maxHearts, s.hearts + 1);
      if (s.hearts > before) { snd('chip'); emit('heal'); if (before === 1) mu('set', 'lastHeart', false); }
      snd('whoosh', 0.5);
      emit('door', 'sec', sec, 'name', SECTIONS[sec].name);
      mu('set', 'section', sec);
      if (sec === 3) mu('drop');                     /* the Chorus drops into Showtime */
    }
    function finish() {
      s.finished = true;
      if (s.clean && s.secClears > 0) { s.score += SC.CLEAN; emit('cleanStage', 'sec', 5); }
      s.score += SC.FINISH + SC.HEART * Math.min(T.BONUS_HEARTS, s.hearts);   /* Fan support's extra hearts never count */
      s.endV = speedNow(s);
      snd('tada'); snd('applause');
      emit('finish', 'medal', curMedal());
      mu('set', 'finish', true);
      if (s.lettersMask === 63) {
        s.phase = 'encore'; s.section = 6; s.encMult = s.fever ? 4 : s.mult;
        snd('sting'); emit('encoreStart'); mu('set', 'encore', true);
      } else { s.phase = 'finish'; s.endT = 0; }
    }
    function encoreEnd() {
      s.encoreCleared = true; s.phase = 'finish'; s.endT = 0; s.endV = speedNow(s);
      snd('cheer'); emit('encoreEnd', 'medal', curMedal());
    }
    function curtain() {
      s.curtain = true; s.phase = 'curtain'; s.endT = 0;
      emit('curtain'); mu('set', 'curtain', true);
    }
    function curMedal() { return medal(clampScore(), s.finished, s.encoreCleared); }
    function clampScore() { return Math.max(0, Math.min(SC.MAX, Math.round(s.score))); }
    function stepEnd(dt) {
      s.endT += dt;
      if (!s.onGround) { s.prevH = -s.y; s.vy += T.G * dt; s.y += s.vy * dt; if (s.y >= 0) land(); }
      if (s.sliding) { s.slideT += dt; if (s.slideT >= T.SLIDE_T) s.sliding = false; }
      if (s.phase === 'finish') {                   /* run out past the arch, then the dance */
        var k = 1 - s.endT / T.FINISH_STOP; if (k > 0) s.dist += s.endV * k * dt;
        if (s.endT >= T.FINISH_HOLD) end();
      } else {
        if (!s.curtainSaid && s.endT >= 0.3) { s.curtainSaid = true; snd('applause', 0.6); snd('voice', 0.8, petIdx); }
        if (s.endT >= T.CURTAIN_T) end();
      }
      stepSpill(dt, false);
    }
    function end() { s.phase = 'done'; round.done = true; }

    /* ---------- start part-way in (the shop demo begins at the Chorus) ---------- */
    var startMode = cfg.startAt != null ? cfg.startAt : cfg.demo ? 'chorus' : 0;
    var startAt = startMode === 'chorus' ? SECTIONS[3].t0 : typeof startMode === 'number' ? startMode : 0;
    if (startAt > 0) {
      s.t = s.sched = startAt; s.dist = schedDist(startAt); s.section = sectionAt(startAt); s.lastBeat = Math.floor(startAt / BEAT);
      var pl0 = s.dist + PL_OFF, cx0 = s.dist + PET_CX;
      obs.forEach(function (o, i) { if (o.x + o.w - T.EDGE <= pl0 + 40) { o.passed = true; s.oc = i + 1; } });
      items.forEach(function (it, i) { if (it.x < cx0) { it.got = true; s.ic = i + 1; } });
      if (startMode === 'chorus') {                 /* Showtime, Hype 20 = x3 */
        s.hype = s.maxHype = 20; s.mult = 3; s.treats = 48; s.score = 905; s.stars = 1; s.lettersMask = 7;
        for (var di = s.oc; di < obs.length; di++) {
          var od = obs[di];
          if (di >= s.oc + 2 && od.kind !== 'puddle' && od.kind !== 'bar') { s.demoMiss = di; break; }
        }
      }
    }

    var round = {
      done: false, state: s, course: course, variant: variant, theme: theme, sections: SECTIONS,
      user: cfg.user || { name: '', color: '#6C5CE7', avatar: '🙂' },
      pet: cfg.pet || { id: 'pet_puppy', name: 'Buddy', acc: {} },
      treatIcon: theme.treat === 'fish' ? '🐟' : theme.treat === 'sweet' ? '🍬' : '🦴',
      autoMode: cfg.autoMode || (cfg.demo ? 'demo' : 'safe'),
      wantEvents: false, events: [], autoHeld: {},

      step: function (dt) {
        if (round.done) return;
        s.snd = 0;
        /* a buffered press fires on touchdown — at the step boundary, exactly like a live press */
        if (s.buffer > 0 && (s.onGround || s.coyote > 0) && !ignoring() && (s.phase === 'run' || s.phase === 'encore')) takeoff();
        s.t += dt;
        var bi = Math.floor(s.t / BEAT);
        if (bi !== s.lastBeat || s.needSync) { s.lastBeat = bi; s.needSync = false; mu('sync', s.t); }  /* beat-locked band */
        if (s.phase === 'curtain' || s.phase === 'finish') { stepEnd(dt); return; }
        s.inv = s.inv > dt ? s.inv - dt : 0;
        if (s.buffer > 0) { s.buffer = s.buffer > dt ? s.buffer - dt : 0; if (!s.buffer) s.ready = false; }
        s.coyote = s.onGround ? T.COYOTE : (s.coyote > dt ? s.coyote - dt : 0);
        stepLag();
        s.sched = s.t - s.lag;
        s.dist = schedDist(s.sched);
        s.prevH = -s.y;
        if (!s.onGround) { s.vy += T.G * dt; s.y += s.vy * dt; if (s.y >= 0) land(); }
        if (s.sliding) { s.slideT += dt; if (s.slideT >= T.SLIDE_MAX || (s.slideT >= T.SLIDE_T && !s.slideHeld)) s.sliding = false; }
        if (s.phase === 'run') collide();
        if (s.phase === 'run') pickList(items, 'ic', false);
        else if (s.phase === 'encore') pickList(enc, 'ec', true);
        stepSpill(dt, s.phase === 'run' || s.phase === 'encore');
        s.progress = Math.max(0, Math.min(1, s.dist / FINISH_D));
        if (s.phase === 'run') {
          while (s.section < 5 && s.sched >= SECTIONS[s.section + 1].t0) door(s.section + 1);
          if (s.sched >= FINISH_T) finish();
        } else if (s.phase === 'encore' && s.sched >= ENC_END_T) encoreEnd();
      },
      input: function (id, down) {
        if (round.done || (s.phase !== 'run' && s.phase !== 'encore')) return;
        if (id === 'slide') {
          if (!down) { s.slideHeld = false; return; }
          if (ignoring()) return;
          s.slideHeld = true;
          if (s.onGround) { if (!s.sliding) startSlide(); }
          else if (!s.diving) { s.vy = Math.max(s.vy, T.DIVE_V); s.diving = true; snd('whoosh', 0.6); emit('dive'); }   /* stage dive */
          return;
        }
        if (id !== 'jump' || !down || ignoring()) return;
        if (s.eff === 'tumble' && !s.onGround) { s.buffer = T.TUMBLE_BUFFER; s.ready = true; emit('buffered'); return; }
        if (s.onGround || s.coyote > 0) takeoff();            /* also cancels a slide */
        else if (s.airJumps > 0) doubleJump();
        else { s.buffer = T.BUFFER; s.ready = true; emit('buffered'); }
      },
      autopilot: function () {
        if (s.sliding && s.slideHeld && s.t - s.slideStart >= 0.05) round.input('slide', false);   /* tap-and-release */
        var a = autopilotWants(s, course, round.autoMode);
        if (a === 1 || a === 3) round.input('jump', true); else if (a === 2) round.input('slide', true);
      },
      /* shell hooks */
      countdown: function (countT) {
        var vt = s.t - countT, b = Math.floor(vt / BEAT);   /* the count-in sits on the beats before GO */
        if (b !== s.cdBeat) { s.cdBeat = b; mu('sync', vt); }
        s.needSync = true;
      },
      pauseReset: function () { s.slideHeld = false; s.buffer = 0; s.ready = false; s.needSync = true; s.cdBeat = -999; },
      padState: function (id) {
        if (s.phase !== 'run' && s.phase !== 'encore') return 'grey';
        if (ignoring()) return 'grey';
        if (id === 'jump') { if (s.ready) return 'ready'; return s.fever ? 's3' : s.mult === 3 ? 's2' : s.mult === 2 ? 's1' : ''; }
        if (id === 'slide') {
          if (s.sliding) return 'ready';
          var i = nextObstacle(s, course), v = speedNow(s);
          if (i >= 0 && obs[i].kind === 'bar' && v > 0 && (obs[i].x - s.dist - PR_OFF) / v < 1.2) return 's1';
        }
        return '';
      },
      onFinish: function () {
        if (cfg.demo || cfg.fan != null) return;
        var m = sess(cfg);
        if (s.curtain) m.curtains++; else if (s.finished) m.curtains = 0;
        if (!m.manual) m.fan = false;                          /* the first-run default lasts one show */
        if (m.curtains >= 2 && !m.fan) { m.fan = true; m.manual = true; s.fanAutoOn = true; }
      },
      musicState: function () {
        ms.section = s.section; ms.mult = s.mult; ms.fever = s.fever; ms.lastHeart = s.hearts === 1 && !s.finished;
        ms.tumble = s.eff === 'tumble'; ms.phase = s.phase; ms.curtain = s.curtain;
        return ms;
      },
      clock: function () { return s.t; },
      medal: curMedal,
      forceEnd: function () { if (!s.finished) s.timeUp = true; s.phase = 'done'; round.done = true; },
      hud: function () {
        var hs = ''; for (var i = 0; i < s.maxHearts; i++) hs += i < s.hearts ? '❤' : '🤍';
        return hs + ' · ' + round.treatIcon + ' ' + s.treats + ' · ✦ ' + s.stars + ' · ' + (s.fever ? 'FEVER x4' : 'HYPE x' + s.mult);
      },
      score: clampScore,
      result: function () {
        return { score: clampScore(), extra: encodeExtra({ medal: curMedal(), letters: s.lettersMask, maxHype: s.maxHype, fan: s.fan }) };
      },
      summaryTitle: function () {
        if (s.timeUp) return 'Time’s up!';
        if (s.curtain) return 'CURTAIN CALL!';
        return s.encoreCleared ? 'ENCORE!' : 'SHOW COMPLETE!';
      },
      /* 'score', never 'pts' — arcade scores must not look like reward points */
      summaryBig: function () { return 'Score ' + fmt(clampScore()); },
      summaryText: function () {
        var fanTxt = s.fan ? ' · 🎟️ with Fan support' : '';
        if (!s.finished) {
          var sec = Math.min(5, s.section), pct = Math.floor(s.progress * 100);
          var next = sec < 5 ? 'the ' + SECTIONS[sec + 1].name : 'the FINISH';
          return 'You reached the ' + SECTIONS[sec].name + ' (' + pct + '%). Next time: ' + next + '!' + fanTxt;
        }
        var hs = ''; for (var i = 0; i < s.maxHearts; i++) hs += i < s.hearts ? '❤' : '🤍';
        var lt = ''; for (var k = 0; k < 6; k++) lt += (k ? ' ' : '') + (s.lettersMask & (1 << k) ? LETTERS[k] : '_');
        return round.treatIcon + ' ' + s.treats + ' treats · ✦ ' + s.stars + ' glow star' + (s.stars === 1 ? '' : 's') + ' · ' + lt +
          ' · Best Hype ' + s.maxHype + ' · ' + hs + ' left' + fanTxt;
      },
      summaryBadges: function () {
        var md = curMedal(), sc = clampScore(), out = [{ text: MEDALS[md].icon + ' ' + MEDALS[md].name, kind: MEDALS[md].kind }];
        if (s.finished && md < 4) {
          if (md === 1) out.push({ text: 'Only ' + fmt(T.MEDAL.SILVER - sc) + ' to SILVER!', kind: 'hint' });
          else if (md === 2) out.push({ text: 'Only ' + fmt(T.MEDAL.GOLD - sc) + ' to GOLD!', kind: 'hint' });
          else if (md === 3) out.push({ text: 'Collect all 6 letters for the ENCORE crown!', kind: 'hint' });
        }
        var reached = s.finished ? 5 : Math.min(5, s.section), missed = 0;
        for (var k = 0; k <= reached && missed < 2; k++) {
          if (!(s.lettersMask & (1 << k))) { out.push({ text: 'Missed ' + LETTERS[k] + ': ' + LETTER_HINT[k], kind: 'hint' }); missed++; }
        }
        if (s.fanAutoOn) out.push({ text: '🎟️ Fan support is on for your next show', kind: 'hint' });
        return out;
      },
      render: function (ctx) {
        if (!round._v2d) round._v2d = makeView2D(round, cfg, api);
        round._v2d.draw(ctx);
      },
      dispose: function () { round._v2d = null; }
    };
    /* the shop demo has no shell to drain events; the 2D view drains them itself there */
    if (cfg.demo) round.wantEvents = true;
    return round;
  }
  function fmt(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

  /* ================================================================
     2D FALLBACK RENDERER — flat but complete: LED gates, cushions,
     rehearsal dashes, cue rings, glow stars, letters, shields, spills,
     Stage Doors, finish stage, Encore catwalk, Showtime night, crowd.
     Visual state only lives here (particles, shake, pops); it never
     feeds back into the logic.
     ================================================================ */
  var INK = '#3B2F4A', NEON_CYAN = '#3DF2FF', NEON_PINK = '#FF4FB8', NEON_VIOLET = '#A66BFF', STAR_GOLD = '#FFD23F';
  var BUBBLEGUM = '#FF8FC8', GLOW_STAR = '#FFE36B', PEARL = '#F6F1FF', LED_OFF = '#FFF3B3';
  var HOLO = ['#FFB3E6', '#B3E5FF', '#C9FFE5', '#FFF3B3'];
  var NIGHT_TOP = '#1A1240', NIGHT_MID = '#3B1E6E', NIGHT_HORIZON = '#FF7AC8';
  var hudLive = 0;                                   /* an HTML HUD is mounted: skip the canvas HUD */

  function hexRgb(h) { var n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function mix(a, b, k) {
    var A = hexRgb(a), B = hexRgb(b);
    return 'rgb(' + Math.round(A[0] + (B[0] - A[0]) * k) + ',' + Math.round(A[1] + (B[1] - A[1]) * k) + ',' + Math.round(A[2] + (B[2] - A[2]) * k) + ')';
  }
  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function starPath(ctx, x, y, r, inner) {
    ctx.beginPath();
    for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? r * (inner || 0.5) : r; ctx.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); }
    ctx.closePath();
  }
  function showK(sched, reduced) {
    var t2 = SECTIONS[2].t0, t3 = SECTIONS[3].t0;
    if (sched < t2) return 0;
    if (sched < t3) return 0.5 * (sched - t2) / (t3 - t2);           /* Pre-Chorus sunset */
    return 0.5 + 0.5 * Math.min(1, (sched - t3) / (reduced ? 0.25 : 1.6));
  }
  function drawTreat(ctx, kind, x, y, sc) {
    ctx.save(); ctx.translate(x, y); if (sc !== 1) ctx.scale(sc, sc);
    ctx.lineWidth = 2.5; ctx.strokeStyle = INK;
    if (kind === 'fish') {
      ctx.fillStyle = '#FF8A5C'; ctx.beginPath(); ctx.ellipse(0, 0, 14, 8, 0, 0, 7); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(-22, -8); ctx.lineTo(-22, 8); ctx.closePath(); ctx.fill(); ctx.stroke();
    } else if (kind === 'sweet') {
      ctx.fillStyle = '#FF5C8A'; ctx.beginPath(); ctx.arc(0, 0, 9, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(-18, -7); ctx.lineTo(-18, 7); ctx.closePath(); ctx.moveTo(9, 0); ctx.lineTo(18, -7); ctx.lineTo(18, 7); ctx.closePath(); ctx.fill(); ctx.stroke();
    } else {
      ctx.fillStyle = '#FFF6E0'; ctx.beginPath(); ctx.arc(-10, -4, 6, 0, 7); ctx.arc(-10, 4, 6, 0, 7); ctx.arc(10, -4, 6, 0, 7); ctx.arc(10, 4, 6, 0, 7); ctx.fill();
      ctx.fillRect(-10, -4, 20, 8); ctx.stroke();
    }
    ctx.restore();
  }
  function drawGlowStar(ctx, x, y, r, t) {
    ctx.save();
    ctx.strokeStyle = NEON_CYAN; ctx.globalAlpha = 0.55; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, r * 1.45, 0, 7); ctx.stroke();
    ctx.globalAlpha = 1; ctx.fillStyle = GLOW_STAR; ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
    starPath(ctx, x, y + Math.sin(t * 3) * 1.5, r, 0.55); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  function drawLetter(ctx, x, y, ch, t) {
    ctx.save(); ctx.translate(x, y); ctx.scale(Math.max(0.25, Math.abs(Math.cos(t * Math.PI))), 1);   /* turns at 0.5 rev/s */
    var g = ctx.createLinearGradient(-15, -20, 15, 20);
    g.addColorStop(0, HOLO[0]); g.addColorStop(0.35, HOLO[1]); g.addColorStop(0.7, HOLO[2]); g.addColorStop(1, HOLO[3]);
    rr(ctx, -15, -20, 30, 40, 7); ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = PEARL; ctx.stroke();
    ctx.lineWidth = 1.5; ctx.strokeStyle = INK; ctx.stroke();
    ctx.fillStyle = '#2B2140'; ctx.font = '400 26px "Bagel Fat One", "Baloo 2", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(ch, 0, 2);
    ctx.restore();
  }
  function drawShieldCap(ctx, x, y, r) {
    ctx.save();
    var g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 1, x, y, r);
    g.addColorStop(0, '#FFFFFF'); g.addColorStop(0.6, PEARL); g.addColorStop(1, HOLO[1]);
    ctx.fillStyle = g; ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = STAR_GOLD; starPath(ctx, x, y, r * 0.45, 0.5); ctx.fill();
    ctx.restore();
  }
  function drawCrowdBlob(ctx, x, y, col, wand, lift, droop) {
    ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(x, y - 18 - lift, 13, 18, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#2B2140'; ctx.beginPath(); ctx.arc(x - 4, y - 24 - lift, 1.8, 0, 7); ctx.arc(x + 4, y - 24 - lift, 1.8, 0, 7); ctx.fill();
    var a = droop ? 0.9 : 0.25, wx = x + 10 + Math.sin(a) * 18, wy = y - 30 - lift - Math.cos(a) * 18;
    ctx.strokeStyle = '#F1ECFF'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(x + 9, y - 22 - lift); ctx.lineTo(wx, wy); ctx.stroke();
    ctx.fillStyle = wand; ctx.beginPath(); ctx.arc(wx, wy, 5, 0, 7); ctx.fill();
  }

  function makeView2D(round, cfg, api) {
    var FX = HAS_WIN ? window.SLGameFX : null;
    var reduced = !!(api && api.reduced) || !!cfg.reduced;
    var fx = FX ? FX.particles({ reduced: reduced, max: 300, seed: 4242 }) : null;
    var shaker = FX ? FX.shaker(reduced) : null;
    var pop = FX ? FX.banner(reduced) : null;
    var s = round.state, course = round.course, th = round.theme, user = round.user;
    var ucol = /^#[0-9a-f]{6}$/i.test(user.color || '') ? user.color : '#6C5CE7';
    var lastT = s.t, camY = 0, ledDark = 0, landSq = 0, ooh = 0, perfectT = -9, lastHurtT = -9, starsBg = [];
    var r = xorshift(17);
    for (var i = 0; i < 46; i++) starsBg.push([r() * LW, r() * (GROUND - 170), 0.6 + r() * 1.6, r() * 6]);
    var petCol = (HAS_WIN && window.SLWorldArt && window.SLWorldArt.PETCOL && window.SLWorldArt.PETCOL[round.pet.id]) || { body: '#e3b077', dark: '#b8834f' };
    var archCols = (HAS_WIN && window.SLWorldArt && window.SLWorldArt.THEME && window.SLWorldArt.THEME[round.variant]) || [th.hill, STAR_GOLD];

    function popText(txt, color) { if (!hudLive && pop) pop.show(txt, { color: color || STAR_GOLD, life: 1.0, size: 58 }); }
    function confetti(x, y, n, spread, angle) {
      if (!fx) return;
      fx.burst(x, y, { n: Math.round(n * 0.6), colors: [ucol], speed: 380, life: 1.1, gravity: 700, size: 6, shape: 'square', spread: spread, angle: angle });
      fx.burst(x, y, { n: Math.round(n * 0.4), colors: [NEON_PINK, NEON_CYAN, STAR_GOLD, NEON_VIOLET], speed: 380, life: 1.1, gravity: 700, size: 6, shape: 'square', spread: spread, angle: angle });
    }
    function events() {
      var ev = round.events; if (!ev || !ev.length) return;
      var px = s.dist + PET_CX, feet = GROUND + s.y;
      for (var k = 0; k < ev.length; k++) {
        var e = ev[k];
        switch (e.type) {
          case 'takeoff':
            if (fx) fx.burst(px - 20, GROUND, { n: 4, colors: [th.soil], speed: 120, life: 0.4, gravity: 300, size: 5, spread: 1.2, angle: -2.6 });
            if (e.grade === 3) { perfectT = s.t; if (fx) fx.text(px, feet - 130, 'PERFECT!', { color: HOLO[0], size: 26, life: 0.6, vy: -66 }); }
            break;
          case 'dj': if (fx) fx.ring(px, feet, { color: s.fever ? NEON_CYAN : '#FFFFFF', r0: 10, r1: 46, life: 0.35, width: 5 }); break;
          case 'land': landSq = 0.08; if (fx && e.hard) fx.burst(px, GROUND, { n: 6, colors: [th.soil], speed: 140, life: 0.4, gravity: 300, size: 5, spread: 2.4, angle: -Math.PI / 2 }); break;
          case 'slide': case 'dive': if (fx) fx.burst(px - 30, GROUND - 10, { n: 6, colors: [NEON_CYAN, '#FFFFFF'], speed: 90, life: 0.5, gravity: 0, size: 4, shape: 'star', spread: 1, angle: Math.PI }); break;
          case 'boing':
            if (fx) { fx.burst(px, feet, { n: 8, colors: [BUBBLEGUM, NEON_PINK], speed: 220, life: 0.7, gravity: 400, size: 7, shape: 'star' }); fx.text(px, feet - 40, 'BOING!', { color: BUBBLEGUM, size: 30, life: 0.7 }); }
            break;
          case 'snack':
            if (fx) { fx.burst(e.x, e.y, { n: 3, colors: ['#FFFFFF', STAR_GOLD], speed: 140, life: 0.35, gravity: 0, size: 4, shape: 'star' }); fx.text(e.x, e.y - 18, '+' + (3 * s.mult), { color: s.mult >= 4 ? NEON_PINK : s.mult === 3 ? NEON_VIOLET : s.mult === 2 ? NEON_CYAN : '#FFFFFF', size: 20, life: 0.6 }); }
            break;
          case 'star': if (fx) { fx.ring(e.x, e.y, { color: NEON_CYAN, r0: 10, r1: 60, life: 0.45, width: 5 }); fx.burst(e.x, e.y, { n: 10, colors: [GLOW_STAR, NEON_CYAN], speed: 200, life: 0.55, gravity: 0, size: 5, shape: 'star' }); } break;
          case 'letter': if (fx) fx.ring(px, feet - 40, { color: HOLO[1], r0: 10, r1: 60, life: 0.5, width: 6 }); break;
          case 'lettersComplete': popText('ENCORE UNLOCKED!', HOLO[0]); break;
          case 'shieldGet': if (fx) fx.ring(px, feet - 30, { color: PEARL, r0: 20, r1: 70, life: 0.45, width: 5 }); break;
          case 'shieldPop': if (fx) { fx.ring(px, feet - 30, { color: PEARL, r0: 40, r1: 90, life: 0.4, width: 6 }); fx.burst(px, feet - 30, { n: 10, colors: [PEARL, HOLO[1]], speed: 220, life: 0.5, gravity: 0, size: 5, shape: 'star' }); } break;
          case 'bump':
            lastHurtT = s.t;
            if (!e.rehearsal) { ledDark = 0.8; ooh = 0.6; }
            if (shaker) shaker.kick(6, 0.18);
            if (fx) fx.burst(px + 30, feet - 30, { n: 6, colors: ['#FFFFFF', STAR_GOLD], speed: 160, life: 0.35, gravity: 0, size: 5, shape: 'star' });
            break;
          case 'splash':
            lastHurtT = s.t;
            if (fx) fx.burst(px + 20, GROUND, { n: 10, colors: [th.obs.puddle, '#FFFFFF'], speed: 220, life: 0.55, gravity: 700, size: 5, spread: 1.6, angle: -Math.PI / 2 });
            break;
          case 'regrab': if (fx) fx.burst(e.x, e.y, { n: 3, colors: ['#FFFFFF', STAR_GOLD], speed: 120, life: 0.3, gravity: 0, size: 4, shape: 'star' }); break;
          case 'heal': if (fx) fx.text(px, feet - 120, '❤', { color: ucol, size: 30, life: 0.8, vy: -80 }); break;
          case 'door':
            confetti(px + 60, GROUND - 230, 60, 2.2, -Math.PI / 2);
            popText(SECTIONS[e.sec].pop, e.sec >= 3 ? NEON_PINK : STAR_GOLD);
            break;
          case 'cleanStage': if (fx) fx.text(px, feet - 150, 'CLEAN STAGE +25', { color: '#C9FFE5', size: 24, life: 1.0, vy: -50 }); break;
          case 'tier': if (e.mult === 2 || e.mult === 3) popText('HYPE x' + e.mult + '!', e.mult === 3 ? NEON_PINK : NEON_CYAN); break;
          case 'fever': popText('FEVER!', NEON_PINK); feverPiece(px); break;
          case 'finish': confetti(s.dist + 40, 40, 60, 1.2, -0.4); confetti(s.dist + LW - 40, 40, 60, 1.2, Math.PI + 0.4); popText('SHOW COMPLETE!', STAR_GOLD); break;
          case 'encoreStart': popText('ENCORE!', HOLO[0]); break;
          case 'encoreEnd': confetti(px, GROUND - 200, 80, 2.4, -Math.PI / 2); break;
          case 'curtain': popText('CURTAIN CALL!', HOLO[0]); break;
        }
      }
      if (cfg.demo) ev.length = 0;            /* no shell drains the demo's events */
    }
    function feverPiece(px) {                  /* theme set-piece, ≤ 60 particles */
      if (!fx) return;
      var cols = round.variant === 'course_beach' ? ['#4FC3F7', '#FFFFFF', '#FF8A5C'] : round.variant === 'course_snow' ? ['#FFFFFF', '#B3E5FF', '#C9FFE5'] :
        round.variant === 'course_candy' ? ['#FF5C8A', '#FFD23F', '#C38BFF', '#4FC3F7'] : ['#FFB3E6', '#FFFFFF', '#FF8FC8'];
      fx.burst(px + 200, 20, { n: 60, colors: cols, speed: 160, life: 1.6, gravity: 220, size: 6, shape: round.variant === 'course_snow' ? 'star' : 'square', spread: 2.6, angle: Math.PI / 2 });
    }

    function sky(ctx, k) {
      var g = ctx.createLinearGradient(0, 0, 0, GROUND);
      g.addColorStop(0, mix(th.sky[0], NIGHT_TOP, k)); g.addColorStop(0.6, mix(th.sky[1], NIGHT_MID, k * 0.9));
      g.addColorStop(1, mix(th.sky[1], NIGHT_HORIZON, k * 0.6));
      ctx.fillStyle = g; ctx.fillRect(0, 0, LW, LH);
      if (k < 0.75) {                                      /* sun / sunset disc */
        ctx.globalAlpha = 1 - k / 0.75; ctx.fillStyle = mix('#FFF096', '#FF9E6B', Math.min(1, k * 2));
        ctx.beginPath(); ctx.arc(820, 90 + k * 160, 44, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
      }
      if (k > 0.5) {                                       /* star dots */
        ctx.fillStyle = '#FFFFFF';
        for (var i = 0; i < starsBg.length; i++) {
          var st = starsBg[i]; ctx.globalAlpha = (k - 0.5) * 2 * (reduced ? 0.8 : 0.55 + 0.45 * Math.abs(Math.sin(s.t * 0.9 + st[3])));
          ctx.fillRect(st[0], st[1], st[2], st[2]);
        }
        ctx.globalAlpha = 1;
      }
    }
    function cones(ctx, k) {                              /* 3 additive spotlight cones (not real lights) */
      if (k < 0.55) return;
      var a = (k - 0.55) / 0.45, cols = [NEON_PINK, NEON_CYAN, NEON_VIOLET], bx = [160, 480, 800];
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (var i = 0; i < 3; i++) {
        var sw = reduced ? (i - 1) * 0.2 : Math.sin(s.t * 2 * Math.PI * 0.12 + i * 2.1) * 0.44;   /* ±25° at 0.12 Hz */
        if (s.fever && !reduced) sw *= 0.25;                                             /* FEVER: cones lock on the pet */
        ctx.save(); ctx.translate(bx[i], GROUND + 40); ctx.rotate(sw + (s.fever ? (235 - bx[i]) / 900 : 0));
        var g = ctx.createLinearGradient(0, 0, 0, -GROUND);
        g.addColorStop(0, cols[i]); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = 0.16 * a; ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(-120, -GROUND - 40); ctx.lineTo(120, -GROUND - 40); ctx.lineTo(14, 0); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      ctx.restore();
    }
    function hills(ctx, k, cam) {
      ctx.fillStyle = 'rgba(255,255,255,' + (0.85 * (1 - k)).toFixed(2) + ')';
      for (var c = 0; c < 5; c++) {
        var cx = ((c * 260 - cam * 0.08) % 1300 + 1300) % 1300 - 150, cy = 70 + (c % 3) * 40;
        ctx.beginPath(); ctx.arc(cx, cy, 26, 0, 7); ctx.arc(cx + 30, cy - 10, 32, 0, 7); ctx.arc(cx + 62, cy, 24, 0, 7); ctx.fill();
      }
      var hs = [[th.hill2, 0.18, 300, 120], [th.hill, 0.35, 340, 90]];
      for (var i = 0; i < 2; i++) {
        var hh = hs[i];
        ctx.fillStyle = mix(hh[0], '#2A1B5E', k * 0.65); ctx.beginPath(); ctx.moveTo(0, GROUND);
        for (var x = 0; x <= LW + 40; x += 40) ctx.lineTo(x, hh[2] + Math.sin((x + cam * hh[1]) / 140) * 26 + Math.sin((x + cam * hh[1]) / 61) * 10);
        ctx.lineTo(LW, GROUND); ctx.closePath(); ctx.fill();
      }
    }
    function crowd(ctx, k) {                              /* fan blobs from the Chorus: bob on every 2nd beat (≈1 Hz) */
      if (k < 0.55) return;
      ctx.save(); ctx.globalAlpha = Math.min(1, (k - 0.55) / 0.3);
      var beat2 = (s.t / (2 * BEAT)) % 1, cols = ['#FFB3E6', '#B3E5FF', '#C9FFE5', '#FFF3B3', '#D9C6FF'];
      ctx.fillStyle = 'rgba(26,18,64,0.55)'; ctx.fillRect(0, GROUND - 16, LW, 16);
      for (var i = 0; i < 24; i++) {
        var x = i * 41 + 12, lift = 0;
        if (!reduced) {
          lift = Math.abs(Math.sin(Math.PI * beat2)) * 4;
          if (s.fever) lift += Math.max(0, Math.sin(s.t * 3 - i * 0.45)) * 8;     /* stadium wave */
        }
        drawCrowdBlob(ctx, x, GROUND - 4, cols[i % cols.length], i % 5 < 2 ? ucol : [NEON_PINK, NEON_CYAN, NEON_VIOLET][i % 3], lift, ooh > 0);
      }
      ctx.restore();
    }
    function runway(ctx, cam, k) {
      ctx.fillStyle = mix(th.soil, '#2A1B5E', k * 0.45); ctx.fillRect(cam - 40, GROUND, LW + 80, LH - GROUND + 400);
      ctx.fillStyle = mix(th.ground, '#3B1E6E', k * 0.35); ctx.fillRect(cam - 40, GROUND, LW + 80, 18);
      ctx.fillStyle = 'rgba(0,0,0,0.06)';
      for (var gx = Math.floor(cam / 60) * 60; gx < cam + LW + 60; gx += 60) ctx.fillRect(gx, GROUND + 30, 30, 6);
      /* LED edge bulbs — the in-world Hype meter */
      var dark = ledDark > 0, chase = Math.floor(s.t * 2);
      for (var bx = Math.floor((cam - 20) / 50) * 50; bx < cam + LW + 40; bx += 50) {
        var idx = Math.round(bx / 50), col;
        if (dark) col = '#5B5470';
        else if (s.fever) col = 'hsl(' + (((idx + (reduced ? 0 : chase)) * 47) % 360) + ',95%,65%)';
        else col = s.mult === 3 ? NEON_PINK : s.mult === 2 ? NEON_CYAN : LED_OFF;
        if (!dark && s.mult >= 2) { ctx.globalAlpha = 0.35; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(bx, GROUND + 9, 9, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(bx, GROUND + 9, 4.5, 0, 7); ctx.fill();
      }
    }
    function doors(ctx, cam) {
      var ds = course.doors;
      for (var i = 0; i < ds.length; i++) {
        var d = ds[i], x = d.x; if (x < cam - 160 || x > cam + LW + 160) continue;
        arch(ctx, x, d.name, archCols, false);
      }
      var fxX = course.finishX;
      if (fxX < cam + LW + 260) {
        if (s.lettersMask === 63 || s.phase === 'encore') {          /* Encore catwalk */
          ctx.fillStyle = 'rgba(26,18,64,0.85)'; ctx.fillRect(fxX + 30, GROUND - 2, course.encoreEndX - fxX, 14);
          for (var cx2 = fxX + 40; cx2 < course.encoreEndX; cx2 += 40) {
            var on = reduced || (Math.floor(cx2 / 40) + Math.floor(s.t * 2)) % 3 === 0;
            ctx.fillStyle = on ? NEON_CYAN : '#5B5470'; ctx.fillRect(cx2, GROUND + 2, 18, 5);
          }
        }
        /* the debut stage riser behind the finish */
        var sx = s.phase === 'encore' || s.encoreCleared ? course.encoreEndX : fxX;
        ctx.fillStyle = '#2B2140'; rr(ctx, sx + 20, GROUND - 46, 340, 46, 10); ctx.fill();
        ctx.fillStyle = NEON_PINK; ctx.fillRect(sx + 26, GROUND - 46, 328, 4);
        ctx.fillStyle = '#FFFFFF'; ctx.font = '800 16px "Baloo 2", sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('★ DEBUT STAGE ★', sx + 190, GROUND - 18);
        arch(ctx, fxX, 'SHOW COMPLETE!', [STAR_GOLD, NEON_PINK], true);
      }
    }
    function arch(ctx, x, name, cols, big) {
      var w = big ? 150 : 120, h = big ? 270 : 240, top = GROUND - h;
      ctx.save();
      ctx.lineWidth = 3; ctx.strokeStyle = INK;
      ctx.fillStyle = cols[0]; rr(ctx, x - w / 2, top + 30, 22, h - 30, 10); ctx.fill(); ctx.stroke();
      ctx.fillStyle = cols[1]; rr(ctx, x + w / 2 - 22, top + 30, 22, h - 30, 10); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#1A1240'; rr(ctx, x - w / 2 - 14, top, w + 28, 46, 12); ctx.fill(); ctx.stroke();
      /* marquee bulbs: a 3-step chase at 2 Hz (each bulb changes at most twice a second) */
      var nb = 14, ph = Math.floor(s.t * 2) % 3;
      for (var i = 0; i < nb; i++) {
        var bx = x - w / 2 - 6 + i * (w + 12) / (nb - 1);
        ctx.fillStyle = reduced || (i % 3) === ph ? STAR_GOLD : '#8A7A3A'; ctx.beginPath(); ctx.arc(bx, top + 6, 3.5, 0, 7); ctx.fill();
      }
      ctx.fillStyle = big ? STAR_GOLD : NEON_CYAN; ctx.font = '400 ' + (name.length > 10 ? 15 : 19) + 'px "Bagel Fat One", "Baloo 2", sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(name, x, top + 27);
      ctx.restore();
    }
    function obstacle(ctx, o, k) {
      var x = o.x, w = o.w, cols = th.obs[o.kind === 'bar' ? 'low' : o.kind];
      ctx.save();
      if (o.hit && o.kind !== 'puddle') {
        var hk = s.t - o.hitT, sy = hk < 0.3 ? 1 - 0.65 * (hk / 0.3) : 0.35;
        var wob = reduced ? 0 : 0.21 * Math.exp(-6 * hk) * Math.sin(hk * 18);
        ctx.translate(x + w / 2, GROUND); ctx.rotate(wob); ctx.scale(1, sy); ctx.translate(-(x + w / 2), -GROUND);
      }
      ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.lineJoin = 'round';
      if (o.kind === 'puddle') {
        ctx.fillStyle = cols; ctx.beginPath(); ctx.ellipse(x + w / 2, GROUND + 6, w / 2, 10, 0, 0, 7); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x + w / 2 - 14, GROUND + 4, 18, 4, 0, 0, 7); ctx.stroke();
      } else if (o.kind === 'low') {
        ctx.fillStyle = cols[0]; ctx.fillRect(x, GROUND - o.h, 8, o.h); ctx.fillRect(x + w - 8, GROUND - o.h, 8, o.h);
        ctx.strokeRect(x, GROUND - o.h, 8, o.h); ctx.strokeRect(x + w - 8, GROUND - o.h, 8, o.h);
        ctx.fillStyle = cols[1]; rr(ctx, x - 8, GROUND - o.h, w + 16, 14, 6); ctx.fill(); ctx.stroke();
      } else if (o.kind === 'log') {               /* two logs lying across the lane: we see their ringed ends */
        for (var l = 0; l < 2; l++) {
          var lx = x + 22 + l * 44;
          ctx.fillStyle = cols[0]; ctx.beginPath(); ctx.arc(lx, GROUND - 22, 22, 0, 7); ctx.fill(); ctx.stroke();
          ctx.strokeStyle = cols[1]; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(lx, GROUND - 22, 13, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.arc(lx, GROUND - 22, 5, 0, 7); ctx.stroke();
          ctx.strokeStyle = INK; ctx.lineWidth = 3;
        }
      } else if (o.kind === 'hedge') {
        ctx.fillStyle = cols[0]; ctx.beginPath(); ctx.arc(x + w * 0.3, GROUND - o.h * 0.45, o.h * 0.45, 0, 7); ctx.arc(x + w * 0.7, GROUND - o.h * 0.45, o.h * 0.45, 0, 7); ctx.arc(x + w * 0.5, GROUND - o.h * 0.62, o.h * 0.4, 0, 7); ctx.fill(); ctx.stroke();
        ctx.fillStyle = cols[1]; ctx.beginPath(); ctx.arc(x + w * 0.4, GROUND - o.h * 0.5, 6, 0, 7); ctx.arc(x + w * 0.66, GROUND - o.h * 0.7, 5, 0, 7); ctx.fill();
      } else if (o.kind === 'stack') {
        for (var b = 0; b < 2; b++) {
          ctx.fillStyle = b ? cols[1] : cols[0]; rr(ctx, x, GROUND - (b + 1) * 50, w, 48, 6); ctx.fill(); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(x + 8, GROUND - (b + 1) * 50 + 8); ctx.lineTo(x + w - 8, GROUND - b * 50 - 10); ctx.stroke();
        }
        /* the BOING cushion: top at exactly 116; squashes when bounced */
        var bk = o.bounced ? s.t - o.bounceT : 9, sq = bk < 0.4 && !reduced ? 1 - 0.4 * Math.exp(-7 * bk) * Math.cos(bk * 26) : 1;
        ctx.save(); ctx.translate(x + w / 2, GROUND - 100); ctx.scale(1 + (1 - sq) * 0.4, sq);
        ctx.fillStyle = BUBBLEGUM; rr(ctx, -w / 2 - 4, -16, w + 8, 18, 9); ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.7)'; rr(ctx, -w / 2 + 4, -13, w - 18, 5, 3); ctx.fill();
        ctx.restore();
        if (k > 0.5) { ctx.globalAlpha = 0.3; ctx.fillStyle = NEON_PINK; ctx.beginPath(); ctx.ellipse(x + w / 2, GROUND - 108, w * 0.7, 12, 0, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
      } else if (o.kind === 'bar') {               /* LED gate: two chrome posts + a glowing board, gap underneath */
        var K = KINDS.bar;
        ctx.fillStyle = '#DCE3F0';
        rr(ctx, x - 2, GROUND - K.post, 7, K.post, 3); ctx.fill(); ctx.stroke();
        rr(ctx, x + w - 5, GROUND - K.post, 7, K.post, 3); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#1A1240'; rr(ctx, x, GROUND - K.gap - K.board, w, K.board, 8); ctx.fill();
        ctx.save(); ctx.shadowColor = NEON_CYAN; ctx.shadowBlur = 8 + k * 10; ctx.strokeStyle = NEON_CYAN; ctx.lineWidth = 3;
        rr(ctx, x, GROUND - K.gap - K.board, w, K.board, 8); ctx.stroke(); ctx.restore();
        ctx.strokeStyle = NEON_CYAN; ctx.lineWidth = 3; ctx.lineCap = 'round';
        for (var c = 0; c < 3; c++) {
          var cy = GROUND - K.gap - K.board + 14 + c * 14;
          ctx.beginPath(); ctx.moveTo(x + w / 2 - 10, cy - 4); ctx.lineTo(x + w / 2, cy + 4); ctx.lineTo(x + w / 2 + 10, cy - 4); ctx.stroke();
        }
      }
      ctx.restore();
      if (o.rehearsal && !o.hit) {                 /* dashed Neon Cyan outline: a free practice prop */
        ctx.save(); ctx.setLineDash([8, 6]); ctx.strokeStyle = NEON_CYAN; ctx.lineWidth = 2.5;
        var top = o.kind === 'puddle' ? GROUND - 12 : o.kind === 'bar' ? GROUND - KINDS.bar.gap - KINDS.bar.board : GROUND - o.h;
        var bot = o.kind === 'bar' ? GROUND - KINDS.bar.gap : GROUND + (o.kind === 'puddle' ? 18 : 2);
        rr(ctx, x - 7, top - 6, w + 14, bot - top + 8, 10); ctx.stroke(); ctx.restore();
      }
    }
    function cueRing(ctx, o) {
      var pulse = reduced ? 1 : 1 + 0.1 * Math.sin(s.t * 2 * Math.PI);
      ctx.save(); ctx.globalAlpha = 0.5; ctx.strokeStyle = NEON_CYAN; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.ellipse(o.cueX, GROUND + 4, 34 * pulse, 8 * pulse, 0, 0, 7); ctx.stroke(); ctx.restore();
    }
    function prompt(ctx, o) {
      var txt = o.kind === 'bar' ? '⬇ SLIDE!' : 'TAP to jump!';
      var big = s.t - lastHurtT < 1.6, x = o.cueX, y = GROUND - (big ? 190 : 150);
      ctx.save(); ctx.font = '800 ' + (big ? 26 : 20) + 'px "Baloo 2", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      var w = ctx.measureText(txt).width + 26;
      ctx.fillStyle = 'rgba(255,255,255,0.92)'; rr(ctx, x - w / 2, y - 20, w, 40, 20); ctx.fill();
      ctx.strokeStyle = NEON_CYAN; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = '#2B2140'; ctx.fillText(txt, x, y + 1);
      ctx.restore();
    }
    function pet(ctx) {
      var px = s.dist + PET_CX, feet = GROUND + s.y;
      var imgs = petImages, frame = s.sliding ? 0 : s.onGround ? (Math.floor(s.t * 7.5 * schedV(s.sched) / 300) & 1) : 1;   /* slide = frame 0 squashed */
      if (s.phase === 'finish' || s.phase === 'curtain' || s.phase === 'done') frame = 0;
      /* steady pastel grace outline — never blinks */
      if (s.inv > 0 && !s.shield) {
        ctx.save(); ctx.globalAlpha = 0.65; ctx.strokeStyle = HOLO[0]; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.ellipse(px, feet - 48, 70, 58, 0, 0, 7); ctx.stroke(); ctx.restore();
      }
      if (s.fever) { ctx.save(); ctx.globalAlpha = 0.25; ctx.fillStyle = ucol; ctx.beginPath(); ctx.ellipse(px, feet - 46, 74, 56, 0, 0, 7); ctx.fill(); ctx.restore(); }
      ctx.save();
      ctx.translate(px, feet);
      ctx.fillStyle = 'rgba(40,30,60,0.18)'; ctx.beginPath(); ctx.ellipse(0, GROUND - feet + 2, 36 * Math.max(0.4, 1 - (-s.y) / 400), 6, 0, 0, 7); ctx.fill();
      var sx = 1, sy = 1, rot = 0;
      if (s.sliding) { sx = 1.25; sy = 0.55; }                                  /* belly slide */
      if (landSq > 0 && !reduced) { sx *= 1.2; sy *= 0.75; }
      if (s.eff === 'tumble') {
        var e = s.effT;
        if (reduced) { if (e < 0.3) { sx *= 1.15; sy *= 0.8; } }
        else if (e >= 0.08 && e < 0.53) rot = -2 * Math.PI * (e - 0.08) / 0.45;  /* cartoon back-flip */
      }
      if (s.eff === 'slip' && !reduced && s.effT < 0.5) sx *= Math.cos(s.effT / 0.5 * 2 * Math.PI);  /* yaw slip-spin */
      if (s.phase === 'curtain' && s.endT > 1.0 && !reduced) rot = 0.25 * Math.min(1, (s.endT - 1.0) / 0.4);   /* a little bow */
      if (s.phase === 'finish' && s.endT > 0.5 && !reduced) sy *= 1 + 0.05 * Math.sin(s.endT * 8);            /* dance bop */
      if (rot) { ctx.translate(0, -50); ctx.rotate(rot); ctx.translate(0, 50); }
      ctx.scale(sx, sy);
      var img = imgs && imgs[frame];
      if (img) ctx.drawImage(img, -66, -101, 132, 110);
      else {
        ctx.fillStyle = petCol.body; ctx.strokeStyle = INK; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(-4, -38, 34, 22, 0, 0, 7); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.arc(28, -60, 20, 0, 7); ctx.fill(); ctx.stroke();
        ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(34, -64, 3.5, 0, 7); ctx.fill();
      }
      ctx.restore();
      /* dizzy ✦ sparkles after a tumble lands */
      if (s.eff === 'tumble' && s.onGround && s.effT < 1.4) {
        ctx.save(); ctx.fillStyle = STAR_GOLD; ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
        for (var d = 0; d < 3; d++) {
          var a = (reduced ? 0 : s.t * 5) + d * 2.1;
          starPath(ctx, px + Math.cos(a) * 30, feet - 112 + Math.sin(a) * 8, 7, 0.4); ctx.fill(); ctx.stroke();
        }
        ctx.restore();
      }
      if (s.shield) {                                  /* pearl bubble */
        ctx.save(); ctx.globalAlpha = 0.35; ctx.fillStyle = PEARL; ctx.beginPath(); ctx.arc(px, feet - 50, 66, 0, 7); ctx.fill();
        ctx.globalAlpha = 0.9; ctx.strokeStyle = HOLO[1]; ctx.lineWidth = 3; ctx.stroke();
        ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(px, feet - 50, 54, 3.6, 4.4); ctx.stroke(); ctx.restore();
      }
      if (s.ready) { ctx.save(); ctx.fillStyle = STAR_GOLD; starPath(ctx, px - 30, GROUND - 6, 8, 0.4); ctx.fill(); starPath(ctx, px + 26, GROUND - 4, 6, 0.4); ctx.fill(); ctx.restore(); }
    }
    function curtains(ctx) {
      if (s.phase !== 'curtain' && !(s.curtain && s.phase === 'done')) return;
      var k = reduced ? 1 : Math.min(1, s.endT / 1.0), w = LW * 0.42 * k;
      for (var side = 0; side < 2; side++) {
        ctx.save();
        var g = ctx.createLinearGradient(0, 0, 60, 0); g.addColorStop(0, '#FFB3E6'); g.addColorStop(1, '#E8A6FF');
        ctx.fillStyle = g;
        if (side) { ctx.translate(LW, 0); ctx.scale(-1, 1); }
        ctx.fillRect(0, 0, w, LH);
        ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 3;
        for (var f = 20; f < w; f += 34) { ctx.beginPath(); ctx.moveTo(f, 0); ctx.lineTo(f, LH); ctx.stroke(); }
        ctx.restore();
      }
    }
    function canvasHud(ctx) {                          /* only when no HTML HUD is mounted (e.g. the shop demo) */
      ctx.save(); ctx.textBaseline = 'middle';
      for (var i = 0; i < s.maxHearts; i++) {
        ctx.fillStyle = i < s.hearts ? ucol : 'rgba(255,255,255,0.35)'; ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 2;
        var hx = 28 + i * 30, hy = 30;
        ctx.beginPath(); ctx.moveTo(hx, hy + 9); ctx.bezierCurveTo(hx - 16, hy - 2, hx - 8, hy - 14, hx, hy - 5); ctx.bezierCurveTo(hx + 8, hy - 14, hx + 16, hy - 2, hx, hy + 9); ctx.fill(); ctx.stroke();
      }
      var bx = 330, bw = 300;
      ctx.fillStyle = 'rgba(26,18,64,0.55)'; rr(ctx, bx, 16, bw, 16, 8); ctx.fill();
      var fill = Math.min(1, s.hype / T.FEVER);
      if (fill > 0) {
        var g = ctx.createLinearGradient(bx, 0, bx + bw, 0);
        if (s.fever) { g.addColorStop(0, HOLO[0]); g.addColorStop(0.4, HOLO[1]); g.addColorStop(0.7, HOLO[2]); g.addColorStop(1, HOLO[3]); }
        else { g.addColorStop(0, NEON_CYAN); g.addColorStop(1, NEON_PINK); }
        ctx.fillStyle = g; rr(ctx, bx, 16, Math.max(16, bw * fill), 16, 8); ctx.fill();
      }
      ctx.fillStyle = '#FFFFFF'; ctx.fillRect(bx + bw * 8 / 32, 14, 2, 20); ctx.fillRect(bx + bw * 20 / 32, 14, 2, 20);
      ctx.font = '800 15px "Baloo 2", sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#FFFFFF';
      ctx.fillText(s.fever ? 'FEVER x4' : 'HYPE x' + s.mult, bx + bw / 2, 46);
      for (var l = 0; l < 6; l++) {
        var lx = bx + bw / 2 - 75 + l * 30, got = s.lettersMask & (1 << l);
        ctx.fillStyle = got ? HOLO[l % 4] : 'rgba(255,255,255,0.25)'; rr(ctx, lx - 11, 58, 22, 26, 5); ctx.fill();
        ctx.fillStyle = got ? '#2B2140' : 'rgba(255,255,255,0.6)'; ctx.font = '800 15px "Baloo 2", sans-serif'; ctx.fillText(LETTERS[l], lx, 72);
      }
      ctx.textAlign = 'right'; ctx.font = '800 20px "Baloo 2", sans-serif'; ctx.fillStyle = '#FFFFFF'; ctx.strokeStyle = 'rgba(26,18,64,0.6)'; ctx.lineWidth = 4;
      var txt = round.treatIcon + ' ' + s.treats + ' · ✦ ' + s.stars + ' · ' + fmt(Math.max(0, Math.round(s.score)));
      ctx.strokeText(txt, LW - 18, 28); ctx.fillText(txt, LW - 18, 28);
      ctx.fillStyle = 'rgba(26,18,64,0.45)'; rr(ctx, 280, LH - 22, 400, 10, 5); ctx.fill();
      ctx.fillStyle = STAR_GOLD; rr(ctx, 280, LH - 22, Math.max(10, 400 * s.progress), 10, 5); ctx.fill();
      for (var dd = 1; dd <= 5; dd++) { ctx.fillStyle = s.section >= dd ? '#FFFFFF' : 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.arc(280 + 400 * SECTIONS[dd].d0 / FINISH_D, LH - 17, 5, 0, 7); ctx.fill(); }
      ctx.restore();
    }

    return {
      draw: function (ctx) {
        var dt = Math.max(0, Math.min(0.1, s.t - lastT)); lastT = s.t;
        events();
        if (fx) fx.step(dt); if (shaker) shaker.step(dt); if (pop) pop.step(dt);
        ledDark = Math.max(0, ledDark - dt); landSq = Math.max(0, landSq - dt); ooh = Math.max(0, ooh - dt);
        var cam = s.dist, k = showK(s.sched, reduced);
        if (s.section >= 3) k = Math.max(k, 0.5 + 0.5 * Math.min(1, (s.sched - SECTIONS[3].t0) / (reduced ? 0.25 : 1.6)));
        var hgt = -s.y, target = Math.max(0, hgt - 250) * 0.8;
        camY = reduced ? target : camY + (target - camY) * Math.min(1, dt * 10);
        sky(ctx, k); cones(ctx, k); hills(ctx, k, cam);
        ctx.save();
        ctx.translate(0, camY);
        crowd(ctx, k);
        var so = shaker ? shaker.offset() : [0, 0];
        ctx.translate(-cam + so[0], so[1]);
        runway(ctx, cam, k);
        doors(ctx, cam);
        var obs = course.obs, j;
        for (j = Math.max(0, s.oc - 3); j < obs.length; j++) {
          var o = obs[j]; if (o.x > cam + LW + 40) break; if (o.x + o.w < cam - 140) continue;
          if (o.cue && !o.passed && !o.hit) cueRing(ctx, o);
          obstacle(ctx, o, k);
        }
        var list = course.items;
        for (j = Math.max(0, s.ic - 8); j < list.length; j++) {
          var it = list[j]; if (it.x > cam + LW + 40) break; if (it.got || it.x < cam - 40) continue;
          itemDraw(ctx, it);
        }
        if (s.lettersMask === 63 || s.phase === 'encore') {
          for (j = 0; j < course.enc.length; j++) { var en = course.enc[j]; if (!en.got && en.x > cam - 40 && en.x < cam + LW + 40) itemDraw(ctx, en); }
        }
        for (j = 0; j < s.spill.length; j++) {
          var q = s.spill[j]; if (!q.on) continue;
          ctx.globalAlpha = q.landed && !reduced ? 0.6 + 0.4 * Math.cos(q.landT * 2 * Math.PI * 1.5) : 1;   /* ≤ 2 Hz pulse */
          drawTreat(ctx, th.treat, q.x, q.y, 0.9); ctx.globalAlpha = 1;
        }
        pet(ctx);
        if (!hudLive && s.phase === 'run') {
          var ni = nextObstacle(s, course);
          if (ni >= 0 && obs[ni].rehearsal && obs[ni].cueX - (s.dist + PET_CX) < 520) prompt(ctx, obs[ni]);
        }
        if (fx) fx.draw(ctx);
        ctx.restore();
        curtains(ctx);
        if (!hudLive) { canvasHud(ctx); if (pop) pop.draw(ctx, LW / 2, LH / 2 - 40); }
      }
    };
    function itemDraw(ctx, it) {
      if (it.kind === 'snack') drawTreat(ctx, th.treat, it.x, it.y, 1);
      else if (it.kind === 'star') drawGlowStar(ctx, it.x, it.y, 17, reduced ? 0 : s.t);
      else if (it.kind === 'letter') drawLetter(ctx, it.x, it.y, it.ch, reduced ? 0 : s.t * 0.5 + it.li);
      else if (it.kind === 'shield') drawShieldCap(ctx, it.x, it.y, 17);
    }
  }

  /* ---------------- pet sprites (two run frames) from the island art, with accessories ---------------- */
  var petImages = null;
  function preload(cfg) {
    var pet = (cfg && cfg.pet) || { id: 'pet_puppy', acc: {} };
    try { if (HAS_WIN && document.fonts && document.fonts.load) document.fonts.load('400 40px "Bagel Fat One"').catch(function () {}); } catch (e) {}
    if (!HAS_WIN || !window.SLWorldArt || !Shell) return Promise.resolve();
    return Promise.all([0, 1].map(function (f) { return Shell.svgImage(window.SLWorldArt.pet(pet.id, { acc: pet.acc, frame: f })); }))
      .then(function (imgs) { petImages = imgs; });
  }
  /* menu backdrop in 2D: the start line, the first Stage Door and the pet waiting */
  function idle(ctx, cfg) {
    var r = newRound({ sound: function () {}, reduced: true }, (cfg && cfg.variant) || 'course_meadow', { seed: 7, fan: false, reduced: true, pet: cfg && cfg.pet, user: cfg && cfg.user });
    r.course.obs.length = 0; r.course.items.length = 0;
    r.course.doors.unshift({ x: 520, sec: 0, name: 'DEBUT RUN' });
    hudLive++;                                         /* no canvas HUD behind the menu */
    try { r.render(ctx); } finally { hudLive--; }
  }

  /* ---------------- shell wiring ---------------- */
  function mountHud(mid, cfg, api) {
    if (!HAS_WIN || !window.SLCourseHUD || typeof window.SLCourseHUD.mount !== 'function') return null;
    var h = window.SLCourseHUD.mount(mid, cfg, api);
    if (!h) return null;
    hudLive++;
    var gone = false;
    return { update: function (round, phase) { h.update(round, phase); }, dispose: function () { if (!gone) { gone = true; hudLive--; } h.dispose(); } };
  }
  /* the beat game's own 🎵 (world/music.js gameToggle): default ON, so the song — the level —
     plays even when the child turned the island music off; null when SLMusic can't say */
  function musicApi() { return HAS_WIN && window.SLMusic && typeof window.SLMusic.gameEnabled === 'function' ? window.SLMusic : null; }
  /* the cfg the shell is showing right now (menu → tutorial → rounds), so the tutorial cards
     can match this child's Fan support */
  var shownCfg = null;
  /* what Fan support does, in full (an option-level note, for a shell that shows one) */
  var FAN_NOTE = 'Fan support: ' + T.FAN_HEARTS + ' hearts instead of ' + T.HEARTS + ', your hearts refill and you get a free bubble shield at every Stage Door, and glow rings show when to jump.';
  function menuOptions(cfg) {
    if (cfg && !cfg.demo) shownCfg = cfg;
    var on = fanFor(cfg), out = [
      /* the label itself says what it does: today's shell shows option notes only for locked chips */
      { id: 'fan', label: '🎟️ Fan support — ' + T.FAN_HEARTS + ' hearts + a free shield at each door', value: on,
        note: FAN_NOTE, options: [{ value: true, label: 'ON' }, { value: false, label: 'OFF' }] }
    ];
    var mus = musicApi();
    if (mus) {
      var mOn = true;
      try { mOn = !!mus.gameEnabled('course'); } catch (e) { mOn = true; }
      out.push({ id: 'music', label: '🎵 Music (jump on the beat!)', value: mOn, options: [{ value: true, label: 'ON' }, { value: false, label: 'OFF' }] });
    }
    return out;
  }
  function setOption(cfg, id, value) {
    if (id === 'music') { var mus = musicApi(); if (mus) { try { mus.setGameEnabled('course', !!value); } catch (e) { /* not saved */ } } return; }
    if (id !== 'fan') return;
    var m = sess(cfg); m.fan = !!value; m.manual = true;
  }
  /* the How-to-play cards for this child: the heart count is the one their run will have, and
     Fan support (ON for a very first run) gets its own card */
  function tutorialFor(cfg) {
    var fan = fanFor(cfg), n = fan ? T.FAN_HEARTS : T.HEARTS;
    var cards = [
      ['👆', 'Tap or Space to jump. Tap again in the air to double jump.'],
      ['⬇️', 'LED gate ahead? Hold ⬇ SLIDE to slip under it.'],
      ['💔', 'Bumps cost a heart and spill treats. Lose all ' + n + ' and the show ends!'],
      ['💗', 'Bounce on pink cushions. Jump on the beat for PERFECT!']
    ];
    if (fan) cards.push(['🎟️', 'Fan support is ON: ' + n + ' hearts, a refill and a free bubble shield at every Stage Door, and glow rings that show when to jump. Turn it off in the menu any time.']);
    return cards;
  }
  function pbText(rec) {
    if (!rec || rec.score == null) return '';
    var t = '🏆 Your best: score ' + fmt(rec.score);
    if (typeof rec.extra === 'number' && rec.extra === Math.floor(rec.extra)) { var md = MEDALS[decodeExtra(rec.extra).medal] || MEDALS[0]; t += ' · ' + md.icon + ' ' + md.name; }
    return t + ' · 📅 Today’s stage';
  }

  var def = {
    key: 'course', title: 'Debut Run', emoji: '🐾', LW: LW, LH: LH, defaultVariant: 'course_meadow',
    /* the shell reads def.tutorial when it shows the cards (always after the menu, which hands us
       its cfg): a getter, so the cards match THIS child's run — 5 hearts and a Fan support card
       on a very first run, 3 hearts otherwise. tutorialFor(cfg) is the same, for a shell that
       passes cfg itself. */
    get tutorial() { return tutorialFor(shownCfg); },
    tutorialFor: tutorialFor,
    controls: [{ id: 'slide', label: '⬇ SLIDE', side: 'left', aria: 'Slide' }, { id: 'jump', label: '⬆ JUMP', side: 'right', wide: true, aria: 'Jump' }],
    keys: { ' ': 'jump', 'ArrowUp': 'jump', 'w': 'jump', 'W': 'jump', 'Enter': 'jump', 'ArrowDown': 'slide', 's': 'slide', 'S': 'slide' },
    tapAction: 'jump',
    countIn: { beats: 4, bpm: BPM, labels: ['5', '6', '7', '8!'] },
    countdown: 3,                                      /* fallback only; countIn wins */
    view3d: { src: 'world/games/pet-course-3d.js' },
    hud: { mount: mountHud },
    music: { track: 'course' },
    resultsGlass: true,
    menuOptions: menuOptions, setOption: setOption, pbText: pbText,
    preload: preload, idle: idle, newRound: newRound
  };

  var API = {
    buildCourse: buildCourse, newRound: newRound, seedFor: seedFor, schedDist: schedDist, schedV: schedV, schedTime: schedTime,
    SECTIONS: SECTIONS, KINDS: KINDS, BEAT: BEAT, RUN_T: RUN_T, TUNING: TUNING, WIN: WIN, THEMES: THEMES, PATH: PATH, LETTERS: LETTERS,
    decodeExtra: decodeExtra, encodeExtra: encodeExtra, medal: medal, MEDALS: MEDALS, autopilotWants: autopilotWants,
    tierOf: tierOf, tumbleL: tumbleL, speedNow: speedNow, def: def
  };
  if (HAS_WIN) window.SLCourse = API;
  if (Shell) Shell.define(def);
  if (typeof module === 'object' && module.exports) module.exports = API;
})();
