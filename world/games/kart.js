/* ================================================================
   Game C — Neon Grand Prix (unlocked by the Kart Garage).
   The race rules live in kart-logic.js (pure, Node-tested); this file
   wires them into the game shell: options (Race / Solo, Stage class,
   Easy Drive, camera) saved per profile, touch pads with spark-tier
   glow, the event → sound map, the engine purr, the results copy and
   the 2D top-down renderer (the fallback whenever 3D isn't running).
   A lap still only counts through gates 1-2-3 then the line, and the
   score is still the honest race clock.
   ================================================================ */
(function () {
  'use strict';
  var Shell = (typeof window !== 'undefined') ? window.SLGameShell : null;
  var inNode = typeof module === 'object' && module.exports && typeof require === 'function';
  var KL = inNode ? require('./kart-logic.js') : ((typeof window !== 'undefined' && window.SLKartLogic) || null);
  /* kart-logic.js normally loads first (GAMES.kart.deps); preload() fetches it if not */
  function logic() { if (!KL && typeof window !== 'undefined') KL = window.SLKartLogic || null; return KL; }
  var LW = 960, LH = 540;
  var NEON_CYAN = '#3DF2FF', NEON_PINK = '#FF4FB8', STAR_GOLD = '#FFD23F', CORAL = '#FF6B6B', LEAF_MINT = '#7BD88F', PEBBLE = '#CFC8DC', INK = '#3b2f4a';
  var TIER_COL = [PEBBLE, NEON_CYAN, NEON_PINK, STAR_GOLD];

  /* ---------- per-profile options: localStorage 'slKart:v1:<profileKey>' ---------- */
  var OPT_KEY = 'slKart:v1:', MODES = ['race', 'solo'], CAMS = ['chase', 'stage', 'map'];
  function pbMs(cfg, variant) { var r = cfg && cfg.pb && cfg.pb['kart:' + variant]; return r && r.ms != null ? r.ms : null; }
  function hasKartPb(cfg) { return Object.keys((cfg && cfg.pb) || {}).some(function (k) { return k.indexOf('kart:') === 0 && cfg.pb[k] && cfg.pb[k].ms != null; }); }
  function loadOpts(cfg) {
    cfg = cfg || {};
    if (cfg.kartOpts) return cfg.kartOpts;
    var stored = null;
    if (cfg.profileKey != null) { try { stored = JSON.parse(localStorage.getItem(OPT_KEY + cfg.profileKey) || 'null'); } catch (e) { stored = null; } }
    /* Easy Drive defaults on for a profile that has never set a kart time */
    var o = { mode: 'race', cls: 0, easy: cfg.profileKey != null ? !hasKartPb(cfg) : false, cam: 'chase' };
    if (stored && typeof stored === 'object') {
      if (MODES.indexOf(stored.mode) >= 0) o.mode = stored.mode;
      if (stored.cls === 0 || stored.cls === 1 || stored.cls === 2) o.cls = stored.cls;
      if (typeof stored.easy === 'boolean') o.easy = stored.easy;
      if (CAMS.indexOf(stored.cam) >= 0) o.cam = stored.cam;
    }
    cfg.kartOpts = o;
    return o;
  }
  function saveOpts(cfg, o) {
    cfg.kartOpts = o;
    if (cfg.profileKey == null) return;
    try { localStorage.setItem(OPT_KEY + cfg.profileKey, JSON.stringify(o)); } catch (e) {}
  }
  /* the chosen class, or Trainee while it is still locked on this track */
  function effCls(o, variant, pb) { return o.cls && logic().classUnlocked(variant, pb, o.cls) ? o.cls : 0; }
  /* the shell keeps the chosen track to itself; mirror it into cfg.variant so the
     menu rows (class unlocks) and the idle frame follow the track chips */
  function hookVariant(cfg) {
    if (!cfg || cfg._kartVarHook) return;
    var orig = cfg.onSelectVariant;
    cfg.onSelectVariant = function (vid) { cfg.variant = vid; if (orig) return orig.apply(this, arguments); };
    cfg._kartVarHook = true;
  }
  function view3dOn(cfg) {
    if (cfg && cfg.view3d === true) return true;
    try { return typeof document !== 'undefined' && !!document.querySelector('.slg .slg-gl'); } catch (e) { return false; }
  }

  /* ---------- engine purr: one original synth voice for the player kart ---------- */
  var purr = null;
  function purrStart() {
    if (purr || typeof getAudioCtx !== 'function') return;
    try {
      var ctx = getAudioCtx(); if (!ctx || !ctx.createOscillator) return;
      var osc = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
      osc.type = 'triangle'; osc.frequency.value = 70; lp.type = 'lowpass'; lp.frequency.value = 500; g.gain.value = 0;
      osc.connect(lp); lp.connect(g); g.connect(ctx.destination);
      /* drift 'shhh': looping band-passed noise (deterministic fill) */
      var buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), data = buf.getChannelData(0), x = 22222;
      for (var i = 0; i < data.length; i++) { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; data[i] = ((x >>> 0) / 4294967296) * 2 - 1; }
      var nz = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), ng = ctx.createGain();
      nz.buffer = buf; nz.loop = true; bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 0.8; ng.gain.value = 0;
      nz.connect(bp); bp.connect(ng); ng.connect(ctx.destination);
      osc.start(); nz.start();
      purr = { ctx: ctx, osc: osc, g: g, nz: nz, ng: ng };
    } catch (e) { purr = null; }
  }
  function purrSet(v, boost, drift, level) {
    if (!purr) return;
    try {
      var t = purr.ctx.currentTime, av = Math.min(350, Math.abs(v));
      purr.osc.frequency.setTargetAtTime((70 + 0.26 * Math.min(270, av)) * (boost ? 1.335 : 1), t, 0.05);
      purr.g.gain.setTargetAtTime(0.03 * (0.4 + 0.6 * Math.min(1, av / 270)) * level, t, 0.06);
      purr.ng.gain.setTargetAtTime(drift ? 0.02 * level : 0, t, 0.05);
    } catch (e) {}
  }
  function purrStop() {
    if (!purr) return;
    var p = purr; purr = null;
    try { var t = p.ctx.currentTime; p.g.gain.setTargetAtTime(0, t, 0.05); p.ng.gain.setTargetAtTime(0, t, 0.05); p.osc.stop(t + 0.4); p.nz.stop(t + 0.4); } catch (e) {}
  }

  function ordinal(n) { return n + (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'); }
  var MEDAL_KIND = ['ribbon', 'bronze', 'silver', 'gold', 'crown'];

  /* ---------- a round ---------- */
  function newRound(api, variant, cfg) {
    api = api || { sound: function () {} };
    cfg = cfg || {};
    var L = logic(), MEDALS = L.MEDALS;
    var o = loadOpts(cfg), prevPb = pbMs(cfg, variant);
    var demo = !!cfg.demo, style = demo || !!cfg.autoStyle;
    var mode = demo ? 'race' : o.mode, cls = demo ? (L.PAR[variant] ? 1 : 0) : effCls(o, variant, prevPb);
    var race = L.newRace(variant, { mode: mode, cls: cls, easy: !demo && !!o.easy, pbMs: prevPb, reduced: !!api.reduced });
    race.wantEvents = true;
    var track = race.track, k = race.k, pr = race.pr, s = race.s, LAPN = track.laps;
    var arts = (typeof window !== 'undefined' && window.SLWorldArt) || {};
    function hex(c, dflt) { return typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? c : dflt; }
    var kartCol = hex((arts.KARTS || {})[cfg.kart], '#e94b4b');
    var sigCol = hex(cfg.user && cfg.user.color, '#6C5CE7');
    var petCol = hex(((arts.PETCOL || {})[cfg.pet && cfg.pet.id] || {}).body, STAR_GOLD);
    var held = {}, fxq = [], realT = 0, later = [], lastSkid = -9, lastChip = -9, lastPip = 0, purrN = 0, lastGap = null;
    var cam = { x: 0, y: 0 };
    function camTarget() { return [Math.max(0, Math.min(L.WW - LW, k.x + Math.cos(k.h) * 90 - LW / 2)), Math.max(0, Math.min(L.WH - LH, k.y + Math.sin(k.h) * 60 - LH / 2))]; }
    var ct0 = camTarget(); cam.x = ct0[0]; cam.y = ct0[1];
    function snd(name, vol, stp) { try { if (api.sound) api.sound(name, vol, stp); } catch (e) {} }
    function mus(method) { var m = api.music; if (!m || typeof m[method] !== 'function') return; try { m[method].apply(m, Array.prototype.slice.call(arguments, 1)); } catch (e) {} }
    mus('key', 0); mus('layer', 'arp', false);

    /* every logic event → its one sound (so the 2D fallback hears everything), the
       renderer queue round.fx (capped) and, while the shell asks, round.events */
    function onEvent(e) {
      switch (e.type) {
        case 'go': mus('drop'); break;
        case 'rocket': snd('boost'); snd('powerup'); break;
        case 'driftStart': snd('boing', 0.4); break;
        case 'driftTier': snd('combo', 1, [2, 4, 7][e.tier - 1]); break;
        case 'driftRelease': if (e.tier > 0) { snd('boost'); snd('combo', 1, e.tier * 2 + 1); } break;
        case 'fizzle': snd('miss', 0.4); break;
        case 'pad': snd('boost', 0.8); if (e.onBeat) snd('star'); break;
        case 'note': snd('pop', 0.5); snd('combo', 1, e.k); if (e.full) snd('star'); break;
        case 'jump': snd('whoosh'); break;
        case 'trick': snd('combo', 1, 5); break;
        case 'land': snd('chip'); if (e.trick) snd('powerup'); break;
        case 'scrape': if (realT - lastSkid >= 0.4) { lastSkid = realT; snd('skid', 0.6); } break;
        case 'bump': snd('bump'); break;
        case 'spin': snd('bump'); snd('oof'); snd('boing', 0.6); break;
        case 'gate': snd('check'); if (e.clean) snd('combo', 1, Math.min(9, Math.floor(s.wand / 5))); break;
        case 'lap': if (e.n < LAPN) { snd('coin'); snd('powerup'); } break;
        case 'finalLap': snd('sting'); mus('key', 2); break;
        case 'spotlight': snd('sting', 0.6); snd('applause', 0.4); mus('layer', 'arp', true); break;
        case 'spotlightEnd': if (e.early) snd('miss', 0.5); else snd('whoosh', 0.4); mus('layer', 'arp', false); break;
        case 'grass': if (e.on && realT - lastSkid >= 0.4) { lastSkid = realT; snd('skid', 0.5); } break;
        case 'pass': snd('combo', 1, 7 - e.place); if (e.place === 1) snd('powerup'); break;
        case 'passedBy': snd('whoosh', 0.4); break;
        case 'pacerGap': lastGap = e; break;
        case 'finish':
          snd('fanfare'); mus('layer', 'arp', false);
          later.push({ at: realT + 0.3, name: 'applause' }, { at: realT + 0.6, name: 'tada' });
          break;
      }
    }
    function drain() {
      var ev = s.events;
      for (var i = 0; i < ev.length; i++) {
        var e = ev[i];
        onEvent(e);
        if (fxq.length >= 64) fxq.shift();
        fxq.push(e);
        if (round.wantEvents && round.events) round.events.push(e);
      }
      ev.length = 0;
      /* a chime for every new Hype pip (at most one per 0.15 s) */
      var pip = Math.floor(s.wand / 5);
      if (pip > lastPip && realT - lastChip >= 0.15) { lastChip = realT; snd('chip', 0.3); mus('set', 'hype', s.wand / L.PHYS.WAND); }
      lastPip = pip;
    }
    function muted() { try { return !!(cfg.muted && cfg.muted()); } catch (e) { return false; } }
    function engine() {
      if (demo || (purrN++ % 4)) return;
      if (s.phase === 'race' && !purr) purrStart();
      var level = muted() ? 0 : s.phase === 'coast' ? Math.max(0, 1 - s.coastT / 0.5) : 1;
      purrSet(k.v, k.boostT > 0, k.drift.on, level);
    }

    var round = {
      done: false, kart: k, progress: pr, track: track, state: s, race: race,
      fx: fxq, events: [], wantEvents: false,
      opts: { mode: mode, cls: cls, easy: race.opts.easy, cam: o.cam },
      kartColor: kartCol, sigColor: sigCol, petColor: petCol, cam: cam, fxDt: 0,
      step: function (dt, h) {
        if (round.done) return;
        held = h || held;
        race.step(dt, held);
        realT += dt; round.fxDt += dt;
        drain();
        for (var i = later.length - 1; i >= 0; i--) if (realT >= later[i].at) { snd(later[i].name); later.splice(i, 1); }
        engine();
        var tgt = camTarget(), f = Math.min(1, dt * 5);
        cam.x += (tgt[0] - cam.x) * f; cam.y += (tgt[1] - cam.y) * f;
        if (s.done) { round.done = true; purrStop(); }
      },
      input: function (id, down) { held[id] = down; },
      countdown: function (countT, h, isStart) { race.countdown(countT, h || {}, isStart); drain(); },
      pauseReset: function () { race.pauseReset(); purrStop(); },
      padState: function (id) {
        var easy = race.opts.easy;
        if (id === 'drift') {
          if (easy && race.rocketWindow()) return 'ready';
          if (k.air.on && !k.air.trick && k.air.t < k.air.dur * L.PHYS.TRICK_WIN) return 'ready';
          if (k.drift.on) return k.onGrass ? 'grey' : k.drift.tier ? 's' + k.drift.tier : '';
          return '';
        }
        if (id === 'up' && !easy && race.rocketWindow()) return 'ready';
        return '';
      },
      forceEnd: function () { round.done = true; purrStop(); },
      hud: function () {
        var t = s.finishT != null ? s.finishT : s.t;
        return (race.rivals.length ? 'P' + s.place + ' · ' : '') + 'Lap ' + Math.min(LAPN, pr.lap + 1) + '/' + LAPN + ' · ⏱ ' + L.fmt(t * 1000);
      },
      result: function () { return race.result(); },
      summaryTitle: function () {
        if (!pr.finished) return 'Race stopped';
        if (!race.rivals.length) return '🏁 Race complete!';
        var p = s.finishPlace;
        return p === 1 ? '🎤 1st — centre stage!' : p === 2 ? '🥈 2nd place!' : p === 3 ? '🥉 3rd place!' : '💖 Fan Favourite!';
      },
      summaryBig: function () {
        var res = race.result();
        if (!res) return 'Not finished';
        return (race.rivals.length ? ordinal(s.finishPlace) + ' · ' : '') + L.fmt(res.ms);
      },
      summaryText: function () {
        var res = race.result();
        if (!res) return 'Time’s up — great driving! Finish all ' + LAPN + ' laps to set a time.';
        var parts = [], m = L.medalFor(track.id, res.ms);
        parts.push(m ? MEDALS[m].icon + ' ' + MEDALS[m].name + ' time!' : 'Finisher!');
        parts.push(nudge(res.ms));
        parts.push('Laps ' + pr.laps.map(function (l) { return l.toFixed(1); }).join(' · '));
        var sp = s.sparks[0] + s.sparks[1] + s.sparks[2], sub = [];
        if (s.sparks[1]) sub.push(s.sparks[1] + ' pink'); if (s.sparks[2]) sub.push(s.sparks[2] + ' gold');
        parts.push('Sparks ' + sp + (sub.length ? ' (' + sub.join(' · ') + ')' : '') + ' · On-beat ' + s.padsOnBeat + '/' + s.pads + ' · Notes ' + s.notes + '/' + s.notesTotal +
          ' · Tricks ' + s.tricks + ' · Spotlights ' + s.spotlights + (race.rivals.length ? ' · Passes ' + s.passes : ''));
        var w = [];
        if (s.bumps) w.push(s.bumps + ' bump' + (s.bumps > 1 ? 's' : ''));
        if (s.spins) w.push(s.spins + ' spin-out' + (s.spins > 1 ? 's' : ''));
        if (s.scrapes) w.push(s.scrapes + ' scrape' + (s.scrapes > 1 ? 's' : ''));
        parts.push(w.length ? w.join(' · ') : 'no wall bumps!');
        return parts.filter(Boolean).join(' · ');
      },
      summaryBadges: function () {
        var res = race.result(), out = [];
        if (!res) return [{ text: '🏁 Finish all ' + LAPN + ' laps for a medal', kind: 'hint' }];
        var m = L.medalFor(track.id, res.ms);
        out.push({ text: m ? MEDALS[m].icon + ' ' + MEDALS[m].name : '🏁 Finisher', kind: MEDAL_KIND[m] });
        if (race.rivals.length) out.push({ text: s.finishPlace === 1 ? '🎤 Centre stage' : ordinal(s.finishPlace) + ' of ' + (race.rivals.length + 1), kind: 'ribbon' });
        if (!s.wall) out.push({ text: '✨ Clean race', kind: 'ribbon' });
        if (s.rocket) out.push({ text: '🚀 Rocket start', kind: 'ribbon' });
        return out;
      },
      onFinish: function () { purrStop(); },
      autoHeld: {},
      autopilot: function () { round.autoHeld = style ? race.driveStyle() : race.drivePlain(); },
      render: function (ctx) { draw(ctx, round); },
      dispose: function () { purrStop(); mus('layer', 'arp', false); mus('key', 0); }
    };
    /* ONE nudge for the results: an unlock, a near miss, or the next medal */
    function nudge(ms) {
      var par = L.PAR[track.id];
      if (par) {
        if (ms <= par.silver && !(prevPb != null && prevPb <= par.silver)) return '👑 Headliner Stage unlocked on ' + track.name + '!';
        if (ms <= par.bronze && !(prevPb != null && prevPb <= par.bronze)) return '🎤 Debut Stage unlocked on ' + track.name + '!';
      }
      if (race.rivals.length && s.finishPlace > 1) {
        var ahead = null;
        race.rivals.forEach(function (r) { if (r.finished && r.finishT < s.finishT && (!ahead || r.finishT > ahead.finishT)) ahead = r; });
        if (ahead && s.finishT - ahead.finishT <= 2) return ordinal(s.finishPlace - 1) + ' was only ' + (s.finishT - ahead.finishT).toFixed(1) + ' s ahead!';
      }
      var best = prevPb != null ? Math.min(prevPb, ms) : ms, nm = L.nextMedal(track.id, best);
      return nm ? 'Next: ' + nm.icon + ' ' + nm.name + ' ' + L.fmt(nm.ms) + ' — ' + (nm.gap / 1000).toFixed(1) + ' s to go' : '';
    }
    round.lastGap = function () { return lastGap; };
    return round;
  }

  /* ================================================================
     2D renderer (top-down). Reads the same state the 3D view reads, so
     a mid-race switch to 2D is seamless.
     ================================================================ */
  var layerCache = {};
  function trackLayer(track) {
    if (layerCache[track.id]) return layerCache[track.id];
    var c = (typeof document !== 'undefined') ? document.createElement('canvas') : null;
    if (!c) return null;
    var L = logic(), WW = L.WW, WH = L.WH, HW = L.HW, KERB = L.KERB, WALL = L.WALL, SCALE = L.SCALE;
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
      /* a cute volcano that never erupts */
      var vx = 480 * SCALE, vy = 290 * SCALE;
      x.fillStyle = '#8a6b5a'; x.beginPath(); x.moveTo(vx - 170, vy + 120); x.lineTo(vx, vy - 140); x.lineTo(vx + 170, vy + 120); x.closePath(); x.fill();
      x.fillStyle = '#ff8a5c'; x.beginPath(); x.moveTo(vx - 40, vy - 80); x.lineTo(vx, vy - 140); x.lineTo(vx + 40, vy - 80); x.closePath(); x.fill();
      x.fillStyle = 'rgba(217,200,242,0.7)'; x.beginPath(); x.arc(vx + 20, vy - 170, 40, 0, 7); x.arc(vx + 50, vy - 220, 52, 0, 7); x.fill();
    }
    if (track.deco === 'beach') { x.fillStyle = '#4fc3f7'; x.fillRect(0, WH - 70, WW, 70); }
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
    /* candy tyre stacks along both walls */
    var STACK = ['#FFB3E6', '#B3E5FF', '#FFF3B3'];
    for (var t = 0; t < track.n; t += 6) {
      var p = track.pts[t], tg = track.tang[t], nx = -tg[1], ny = tg[0];
      [1, -1].forEach(function (sd) {
        x.fillStyle = STACK[(t / 6) % 3]; x.strokeStyle = 'rgba(59,47,74,0.5)'; x.lineWidth = 2;
        x.beginPath(); x.arc(p[0] + nx * (WALL + 4) * sd, p[1] + ny * (WALL + 4) * sd, 6, 0, 7); x.fill(); x.stroke();
      });
    }
    /* the Stage Jump: candy-pink ramp with white stripes, full width */
    var J = track.feat.jump;
    if (J) {
      x.save(); x.translate(J.x, J.y); x.rotate(J.ang);
      for (var st = 0; st < 8; st++) { x.fillStyle = st % 2 ? '#ffffff' : '#FF8FC8'; x.fillRect(-J.len / 2 + st * J.len / 8, -(HW + KERB), J.len / 8, (HW + KERB) * 2); }
      x.strokeStyle = INK; x.lineWidth = 3; x.strokeRect(-J.len / 2, -(HW + KERB), J.len, (HW + KERB) * 2);
      x.fillStyle = STAR_GOLD;
      for (var b = 0; b < 8; b++) { [1, -1].forEach(function (sd) { x.beginPath(); x.arc(-J.len / 2 + (b + 0.5) * J.len / 8, sd * (HW + KERB + 5), 3, 0, 7); x.fill(); }); }
      x.restore();
    }
    /* start/finish strip */
    var p0 = track.pts[0], t0 = track.tang[0], nx0 = -t0[1], ny0 = t0[0];
    for (var kk = -5; kk < 5; kk++) for (var row = 0; row < 2; row++) {
      x.fillStyle = (kk + row) % 2 ? '#ffffff' : '#2d2d3d';
      var cx = p0[0] + nx0 * kk * 10 + t0[0] * row * 10, cy = p0[1] + ny0 * kk * 10 + t0[1] * row * 10;
      x.save(); x.translate(cx, cy); x.rotate(Math.atan2(t0[1], t0[0])); x.fillRect(0, 0, 10, 10); x.restore();
    }
    layerCache[track.id] = c;
    return c;
  }
  function hexRgb(h) { var n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function mix(a, b, t) { var A = hexRgb(a), B = hexRgb(b); return 'rgb(' + Math.round(A[0] + (B[0] - A[0]) * t) + ',' + Math.round(A[1] + (B[1] - A[1]) * t) + ',' + Math.round(A[2] + (B[2] - A[2]) * t) + ')'; }
  /* one kart sprite: body colour, optional stripe + initial (rivals), driver head colour */
  function kartSprite(ctx, x, y, h, body, o) {
    o = o || {};
    ctx.save(); ctx.translate(x, y); ctx.rotate(h);
    if (o.scale && o.scale !== 1) ctx.scale(o.scale, o.scale);
    if (o.alpha != null) ctx.globalAlpha = o.alpha;
    ctx.fillStyle = '#2d2d3d';
    [[-16, -16], [10, -16], [-16, 10], [10, 10]].forEach(function (w) { ctx.fillRect(w[0], w[1], 12, 7); });
    ctx.fillStyle = body; ctx.strokeStyle = o.edge || INK; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(-20, -10); ctx.lineTo(18, -8); ctx.lineTo(26, 0); ctx.lineTo(18, 8); ctx.lineTo(-20, 10); ctx.closePath(); ctx.fill(); ctx.stroke();
    if (o.stripe) { ctx.fillStyle = o.stripe; ctx.fillRect(-18, -3, 40, 6); }
    ctx.fillStyle = o.head || STAR_GOLD; ctx.beginPath(); ctx.arc(-4, 0, 7, 0, 7); ctx.fill(); ctx.stroke();
    if (o.initial) {
      ctx.translate(-4, 0); ctx.rotate(-h); ctx.fillStyle = INK; ctx.font = '800 10px "Baloo 2", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(o.initial, 0, 0);
    }
    ctx.restore();
  }
  function banner(ctx, txt, col) {
    ctx.font = '800 34px "Baloo 2", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.lineWidth = 7; ctx.strokeStyle = INK; ctx.strokeText(txt, LW / 2, 70);
    ctx.fillStyle = col; ctx.fillText(txt, LW / 2, 70);
  }
  function chip(ctx, x, y, txt, bg, fg) {
    ctx.font = '800 16px "Baloo 2", sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    var w = ctx.measureText(txt).width + 18;
    ctx.fillStyle = bg; ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, 26, 13); else ctx.rect(x, y, w, 26);
    ctx.fill();
    ctx.fillStyle = fg; ctx.fillText(txt, x + 9, y + 14);
    return w;
  }
  /* per-round 2D juice (particles, words, banner, shake), created on first draw */
  function juice(R) {
    if (R._juice) return R._juice;
    var FX = typeof window !== 'undefined' ? window.SLGameFX : null;
    if (!FX) return null;
    var red = !!(R.race.opts.reduced);
    R._juice = { FX: FX, p: FX.particles({ reduced: red, max: 260, seed: 4242 }), bn: FX.banner(red), sh: FX.shaker(red), red: red, words: [], spark: 0, jet: 0, dust: 0 };
    return R._juice;
  }
  function word(J, R, txt, col, size) {
    var now = R.race.s.t;
    J.words = J.words.filter(function (w) { return now - w < 0.9; });
    if (J.words.length >= 2) return;              /* never more than 2 words on screen */
    J.words.push(now);
    var k = R.race.k;
    J.p.text(k.x, k.y - 34, txt, { color: col, size: size || 22, life: 0.9, vy: -60 });
  }
  function eventJuice(J, R, e) {
    var k = R.race.k, p = J.p, bx = k.x - Math.cos(k.h) * 20, by = k.y - Math.sin(k.h) * 20;
    switch (e.type) {
      case 'rocket': J.bn.show('ROCKET START!', { color: STAR_GOLD, size: 56, life: 1.1 }); p.burst(bx, by, { n: 18, colors: [R.kartColor, STAR_GOLD, '#fff'], shape: 'star', speed: 220, gravity: 0, life: 0.6 }); break;
      case 'driftRelease': if (e.tier > 0) { J.bn.show('SPARK BOOST!', { color: TIER_COL[e.tier], size: Math.round(46 * [1, 1.15, 1.3][e.tier - 1]), life: 0.9 }); p.burst(bx, by, { n: 10 + e.tier * 4, colors: [TIER_COL[e.tier], '#fff'], shape: 'spark', speed: 240, gravity: 0, life: 0.5 }); } break;
      case 'fizzle': p.burst(k.x, k.y, { n: 8, colors: [PEBBLE, '#ffffff'], speed: 90, gravity: -40, life: 0.5, size: 7 }); break;
      case 'pad': p.burst(bx, by, { n: 10, colors: [NEON_CYAN, '#fff'], shape: 'spark', speed: 260, gravity: 0, life: 0.4 }); if (e.onBeat) word(J, R, 'ON BEAT!', NEON_PINK); break;
      case 'note': p.burst(k.x, k.y, { n: 6, colors: [NEON_PINK, NEON_CYAN], shape: 'star', speed: 140, gravity: 0, life: 0.45, size: 5 }); if (e.full) word(J, R, '♪ FULL TRAIL!', NEON_PINK); break;
      case 'jump': { var Jp = R.track.feat.jump; if (Jp) [1, -1].forEach(function (sd) { p.burst(Jp.x - Math.sin(Jp.ang) * sd * 64, Jp.y + Math.cos(Jp.ang) * sd * 64, { n: 20, colors: ['#FFB3E6', '#B3E5FF', '#FFF3B3', R.sigColor], shape: 'square', speed: 260, life: 0.9, size: 6 }); }); break; }
      case 'trick': p.burst(k.x, k.y, { n: 12, colors: [STAR_GOLD, '#fff'], shape: 'star', speed: 160, gravity: 0, life: 0.5 }); break;
      case 'land': p.burst(k.x, k.y, { n: 8, colors: ['#E8DCC4'], speed: 90, gravity: 0, life: 0.45, size: 6 }); break;
      case 'scrape': p.burst(k.x, k.y, { n: 6, colors: [CORAL, STAR_GOLD], shape: 'spark', speed: 180, gravity: 0, life: 0.35 }); word(J, R, 'Scrape!', CORAL, 18); break;
      case 'bump': if (R.race.features) { word(J, R, 'Bump!', CORAL); J.sh.kick(5, 0.18); } break;
      case 'spin': word(J, R, 'Spin-out!', CORAL); J.sh.kick(7, 0.18); R._dizzy = R.race.s.t; break;
      case 'gate': if (e.clean) word(J, R, 'CLEAN!', LEAF_MINT); break;
      case 'lap': if (e.n < R.track.laps) p.burst(k.x, k.y, { n: 30, colors: ['#FFB3E6', '#B3E5FF', '#C9FFE5', '#FFF3B3', R.sigColor], shape: 'square', speed: 280, life: 1 }); break;
      case 'finalLap': J.bn.show('ENCORE LAP!', { color: NEON_PINK, size: 60, life: 1.6 }); break;
      case 'spotlight': J.bn.show('SPOTLIGHT!', { color: STAR_GOLD, size: 58, life: 1.2 }); break;
      case 'pass': word(J, R, 'PASS!', R.sigColor); break;
      case 'finish':
        for (var c = 0; c < 2; c++) p.burst(k.x + (c ? 60 : -60), k.y - 20, { n: 60, colors: ['#FFB3E6', '#B3E5FF', '#C9FFE5', '#FFF3B3', R.sigColor, R.sigColor], shape: c ? 'star' : 'square', speed: 320, life: 1.4 });
        for (var r = 0; r < 3; r++) p.ring(k.x + (r - 1) * 70, k.y - 40 - r * 10, { color: [NEON_PINK, NEON_CYAN, STAR_GOLD][r], r0: 8, r1: 70, life: 0.7, width: 5, optional: true });
        J.bn.show(R.race.rivals.length ? ordinal(R.race.s.finishPlace) + '!' : 'FINISH!', { color: STAR_GOLD, size: 64, life: 1.8 });
        break;
    }
  }
  /* emit n whole particles for 'rate' per second, carrying the remainder */
  function due(J, key, rate, dt) { J[key] += rate * dt; var n = Math.floor(J[key]); J[key] -= n; return n; }
  function draw(ctx, R) {
    var L = logic(), race = R.race, track = race.track, k = race.k, s = race.s, pr = race.pr, F = track.feat;
    var HW = L.HW, KERB = L.KERB, cam = R.cam, J = juice(R);
    var dt = Math.min(0.1, R.fxDt); R.fxDt = 0;
    /* 2D just took over mid-race (the 3D view failed): skip the stale queue */
    if (R._drawT == null ? s.t > 0.5 : s.t - R._drawT > 0.5) R.fx.length = 0;
    R._drawT = s.t;
    /* events → particles, words and banners */
    while (R.fx.length) { var e = R.fx.shift(); if (J) eventJuice(J, R, e); }
    if (J) {
      /* continuous effects: drift sparks (tier colour, grey while draining), boost glitter, grass dust */
      var bx = k.x - Math.cos(k.h) * 20, by = k.y - Math.sin(k.h) * 20, n;
      if (k.drift.on && (n = due(J, 'spark', [6, 8, 14, 20][k.drift.tier], dt))) {
        J.p.burst(bx, by, { n: n, colors: [k.onGrass ? PEBBLE : TIER_COL[Math.max(1, k.drift.tier)], '#fff'], shape: 'spark', speed: 120, gravity: 0, life: 0.35, size: 4, angle: k.h + Math.PI, spread: 1.2 });
      }
      if (k.boostT > 0 && (n = due(J, 'jet', 16, dt))) J.p.burst(bx, by, { n: n, colors: [R.kartColor, STAR_GOLD], shape: 'star', speed: 90, gravity: 0, life: 0.4, size: 4, angle: k.h + Math.PI, spread: 0.6 });
      if (k.onGrass && Math.abs(k.v) > 60 && (n = due(J, 'dust', 10, dt))) J.p.burst(bx, by, { n: n, colors: ['#E8DCC4'], speed: 40, gravity: 0, life: 0.5, size: 7 });
      J.p.step(dt); J.bn.step(dt); J.sh.step(dt);
    }
    var layer = trackLayer(track);
    var shake = J ? J.sh.offset() : [0, 0];
    ctx.save();
    ctx.translate(-Math.round(cam.x) + shake[0], -Math.round(cam.y) + shake[1]);
    if (layer) ctx.drawImage(layer, Math.round(cam.x), Math.round(cam.y), LW, LH, Math.round(cam.x), Math.round(cam.y), LW, LH); else { ctx.fillStyle = track.grass; ctx.fillRect(0, 0, L.WW, L.WH); }
    /* Beat Strips: chevrons lerp Neon Cyan → Neon Pink with the beat (≤ 1.17 Hz) */
    var ph = L.beatPhase(s.t), m = 0.5 + 0.5 * Math.cos(2 * Math.PI * (ph - 0.25)), chevCol = mix(NEON_CYAN, NEON_PINK, m);
    F.pads.forEach(function (p) {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.ang);
      ctx.fillStyle = '#B3E5FF'; ctx.strokeStyle = INK; ctx.lineWidth = 2;
      ctx.fillRect(-p.len / 2, -p.w / 2, p.len, p.w); ctx.strokeRect(-p.len / 2, -p.w / 2, p.len, p.w);
      ctx.fillStyle = chevCol;
      for (var c = -1; c <= 1; c++) { ctx.beginPath(); ctx.moveTo(c * 20 - 8, -14); ctx.lineTo(c * 20 + 6, 0); ctx.lineTo(c * 20 - 8, 14); ctx.lineTo(c * 20 - 2, 14); ctx.lineTo(c * 20 + 12, 0); ctx.lineTo(c * 20 - 2, -14); ctx.closePath(); ctx.fill(); }
      ctx.restore();
    });
    /* Glow Line (Easy Drive): dots along the reference line for the next 1000 px */
    if (race.opts.easy && race.ref && s.phase === 'race') {
      var pc = race.Pc(), pt = {};
      ctx.fillStyle = R.sigColor; ctx.globalAlpha = 0.75;
      for (var d = 40; d <= 1000; d += 40) {
        var P = pc + d, lat = L.refLat(race.ref, L.refTauAt(race.ref, P));
        L.pointAt(track, P, pt);
        ctx.beginPath(); ctx.arc(pt.x - pt.ty * lat, pt.y + pt.tx * lat, 3.5, 0, 7); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    /* Glow Notes: ♪ on pink discs, hidden once collected this lap */
    ctx.font = '800 15px "Baloo 2", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    F.notes.forEach(function (q, i) {
      if (s.noteGot[i]) return;
      ctx.fillStyle = NEON_PINK; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(q.x, q.y, 10, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.fillText('♪', q.x, q.y + 1);
    });
    /* checkpoint gates: lemon until passed this lap, then Leaf Mint */
    L.CHECKS.forEach(function (f, i) {
      var target = f * track.len, idx = 0;
      while (idx < track.n - 1 && track.cum[idx] < target) idx++;
      var p = track.pts[idx], tg = track.tang[idx], nx = -tg[1], ny = tg[0];
      var lit = pr.next > i || s.phase === 'coast';
      ctx.strokeStyle = lit ? LEAF_MINT : 'rgba(255,255,255,0.75)'; ctx.lineWidth = 5; ctx.setLineDash([8, 8]);
      ctx.beginPath(); ctx.moveTo(p[0] + nx * (HW + 4), p[1] + ny * (HW + 4)); ctx.lineTo(p[0] - nx * (HW + 4), p[1] - ny * (HW + 4)); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = lit ? LEAF_MINT : '#FFF3B3'; ctx.strokeStyle = INK; ctx.lineWidth = 2;
      [1, -1].forEach(function (sd) { ctx.beginPath(); ctx.arc(p[0] + nx * (HW + 10) * sd, p[1] + ny * (HW + 10) * sd, 8, 0, 7); ctx.fill(); ctx.stroke(); });
      ctx.font = '800 14px "Baloo 2", sans-serif'; ctx.fillStyle = INK; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillText(String(i + 1), p[0] + nx * (HW + 10), p[1] + ny * (HW + 10) + 5);
    });
    /* Solo pacers (35% alpha) */
    race.pacers.forEach(function (pc2) {
      var mc = pc2.kind === 'best' ? R.sigColor : ((L.MEDALS[pc2.medal] || {}).color || '#fff');
      kartSprite(ctx, pc2.x, pc2.y, pc2.h, mc, { alpha: 0.35, head: '#ffffff' });
    });
    /* the Glow Crew: white karts with their colour stripe and initial */
    race.rivals.forEach(function (r) {
      kartSprite(ctx, r.x, r.y - r.airHop * 0.5, r.h, '#ffffff', { stripe: r.color, head: r.color, initial: r.name.charAt(0), scale: 1 + 0.25 * r.airHop / 24 });
    });
    /* the player: spotlight glow, shadow (offset when airborne), sprite */
    if (k.spotlightT > 0) {
      var g = ctx.createRadialGradient(k.x, k.y, 6, k.x, k.y, 70);
      g.addColorStop(0, 'rgba(255,255,255,0.55)'); g.addColorStop(0.5, R.sigColor + '55'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(k.x, k.y, 70, 0, 7); ctx.fill();
    }
    if (k.drift.on || k.slide > 0) {
      ctx.strokeStyle = k.onGrass ? PEBBLE : TIER_COL[Math.max(1, k.drift.tier)]; ctx.globalAlpha = k.drift.on ? 0.7 : 0.3; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(k.x, k.y, 24, 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
    }
    var air = k.airH || 0, sc = 1 + 0.25 * air / 24;
    if (air > 0) { ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(k.x + air * 0.6, k.y + air, 22, 13, k.h, 0, 7); ctx.fill(); }
    var spinA = k.spinT > 0 ? (1 - k.spinT / L.PHYS.SPIN_T) * 4 * Math.PI : 0;
    kartSprite(ctx, k.x, k.y - air * 0.4, k.h + spinA, R.kartColor, { scale: sc, head: R.petColor });
    if (k.spinT > 0 || (R._dizzy != null && s.t - R._dizzy < 1.2)) {
      ctx.fillStyle = STAR_GOLD; ctx.font = '800 14px "Baloo 2", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (var dz = 0; dz < 3; dz++) { var a = s.t * 5 + dz * 2.09; ctx.fillText('✦', k.x + Math.cos(a) * 20, k.y - 26 + Math.sin(a) * 6); }
    }
    if (J) J.p.draw(ctx);
    ctx.restore();
    /* ENCORE LAP: a violet vignette */
    if (s.lapLight === 2) {
      var vg = ctx.createRadialGradient(LW / 2, LH / 2, LH * 0.35, LW / 2, LH / 2, LW * 0.62);
      vg.addColorStop(0, 'rgba(59,30,110,0)'); vg.addColorStop(1, 'rgba(59,30,110,0.18)');
      ctx.fillStyle = vg; ctx.fillRect(0, 0, LW, LH);
    }
    /* minimap with every racer */
    var mw = 150, mh = Math.round(150 * L.WH / L.WW), mx = LW - mw - 12, my = 12, sx = mw / L.WW;
    ctx.fillStyle = 'rgba(19,12,46,0.38)'; ctx.fillRect(mx - 6, my - 6, mw + 12, mh + 12);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 4; ctx.beginPath();
    track.pts.forEach(function (p, i) { if (i) ctx.lineTo(mx + p[0] * sx, my + p[1] * sx); else ctx.moveTo(mx + p[0] * sx, my + p[1] * sx); }); ctx.closePath(); ctx.stroke();
    var p0m = track.pts[0]; ctx.fillStyle = '#fff'; ctx.fillRect(mx + p0m[0] * sx - 3, my + p0m[1] * sx - 3, 6, 6);
    race.pacers.forEach(function (pc3) { ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.arc(mx + pc3.x * sx, my + pc3.y * sx, 3.5, 0, 7); ctx.fill(); });
    race.rivals.forEach(function (r) { ctx.fillStyle = r.color; ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(mx + r.x * sx, my + r.y * sx, 4, 0, 7); ctx.fill(); ctx.stroke(); });
    ctx.fillStyle = R.kartColor; ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(mx + k.x * sx, my + k.y * sx, 6, 0, 7); ctx.fill(); ctx.stroke();
    /* the Hype Wand: 8 pips under the minimap (they drain through a Spotlight) */
    var pips = k.spotlightT > 0 ? Math.ceil(8 * k.spotlightT / L.PHYS.SPOT_T) : Math.floor(s.wand / 5), wx = LW - 26, wy = my + mh + 32;
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.strokeStyle = INK; ctx.lineWidth = 2;
    ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(wx - 11, wy - 8, 22, 8 * 16 + 14, 11); else ctx.rect(wx - 11, wy - 8, 22, 8 * 16 + 14); ctx.fill(); ctx.stroke();
    for (var pi = 0; pi < 8; pi++) {
      var on = pi < pips, py = wy + (7 - pi) * 16 + 4;
      ctx.fillStyle = on ? (k.spotlightT > 0 ? STAR_GOLD : R.sigColor) : 'rgba(59,47,74,0.15)';
      ctx.beginPath(); ctx.arc(wx, py, 6, 0, 7); ctx.fill();
    }
    ctx.fillStyle = k.spotlightT > 0 || s.wand >= 35 ? STAR_GOLD : '#FFF3B3'; ctx.beginPath(); ctx.arc(wx, wy - 14, 9, 0, 7); ctx.fill(); ctx.stroke();
    /* place chip + gap chip (Race) or the pacer split (Solo) */
    if (race.rivals.length) {
      chip(ctx, 12, 12, 'P' + s.place + '/' + (race.rivals.length + 1), 'rgba(255,255,255,0.88)', INK);
      if (s.phase === 'race' && s.gap != null && s.place > 1) chip(ctx, 12, 44, '+' + s.gap.toFixed(1) + ' s to P' + (s.place - 1), 'rgba(19,12,46,0.55)', '#fff');
    } else {
      var lg = R.lastGap && R.lastGap();
      if (lg) {
        var pcr = race.pacers.filter(function (x) { return x.kind === lg.kind; })[0], icon = lg.kind === 'best' ? '🏆' : ((L.MEDALS[pcr && pcr.medal] || {}).icon || '');
        chip(ctx, 12, 12, icon + ' ' + (lg.dt <= 0 ? '−' : '+') + Math.abs(lg.dt).toFixed(2), lg.dt <= 0 ? LEAF_MINT : CORAL, INK);
      }
    }
    /* lap pips */
    for (var i = 0; i < track.laps; i++) {
      ctx.fillStyle = i < pr.lap ? LEAF_MINT : 'rgba(255,255,255,0.6)'; ctx.strokeStyle = INK; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(LW / 2 - (track.laps - 1) * 14 + i * 28, 22, 9, 0, 7); ctx.fill(); ctx.stroke();
    }
    if (s.wrongT > 0.6) banner(ctx, '↩ WRONG WAY — turn around!', '#ff8a8a');
    if (J) J.bn.draw(ctx, LW / 2, LH * 0.36);
  }
  function idle(ctx, cfg) {
    hookVariant(cfg);
    var r = newRound({ sound: function () {}, reduced: true }, (cfg && cfg.variant) || 'track_loop', cfg || {});
    r.render(ctx);
  }
  function preload() {
    if (logic() || typeof document === 'undefined') return Promise.resolve();
    return new Promise(function (res) {
      var sc = document.createElement('script');
      sc.src = 'world/games/kart-logic.js?v=' + (window.SL_WORLD_VER || '1');
      sc.onload = function () { logic(); res(); };
      sc.onerror = function () { res(); };
      document.head.appendChild(sc);
    });
  }

  /* ---------- shell hooks ---------- */
  function controlsFor(cfg) {
    var o = loadOpts(cfg);
    var c = [{ id: 'left', label: '⬅', side: 'left' }, { id: 'right', label: '➡', side: 'left' }, { id: 'down', label: '⬇', side: 'right', aria: 'Brake' }];
    /* Easy Drive holds the gas, so GO goes and ✨ becomes the big pad */
    if (o.easy) c.push({ id: 'drift', label: '✨ DRIFT', side: 'right', wide: true, aria: 'Drift and trick' });
    else c.push({ id: 'drift', label: '✨', side: 'right', aria: 'Drift and trick' }, { id: 'up', label: 'GO', side: 'right', wide: true, aria: 'Accelerate' });
    return c;
  }
  function menuOptions(cfg) {
    hookVariant(cfg);
    var L = logic(), o = loadOpts(cfg), variant = (cfg && cfg.variant) || 'track_loop', pb = pbMs(cfg, variant), out = [];
    out.push({ id: 'mode', label: 'Mode', value: o.mode, options: [{ value: 'race', label: '🏁 Race' }, { value: 'solo', label: '⏱️ Solo' }] });
    if (o.mode === 'race') {
      var cls = effCls(o, variant, pb), C = L.CLASSES;
      out.push({ id: 'cls', label: 'Stage — ' + C[cls].name + ': ' + C[cls].tip, value: cls, options: C.map(function (c, i) {
        var locked = !L.classUnlocked(variant, pb, i);
        return { value: i, label: c.icon + ' ' + c.name, locked: locked, note: locked ? (i === 1 ? '🔒 Get a 🥉 Bronze time here to unlock 🎤 Debut' : '🔒 Get a 🥈 Silver time here to unlock 👑 Headliner') : '' };
      }) });
    }
    out.push({ id: 'easy', label: 'Easy Drive', value: !!o.easy, options: [{ value: true, label: 'On' }, { value: false, label: 'Off' }] });
    if (view3dOn(cfg)) out.push({ id: 'cam', label: 'Camera', value: o.cam, options: [{ value: 'chase', label: '🎥 Chase' }, { value: 'stage', label: '🎤 Stage' }, { value: 'map', label: '🗺️ Map' }] });
    return out;
  }
  function setOption(cfg, id, value) {
    var o = loadOpts(cfg);
    if (id === 'mode' && MODES.indexOf(value) >= 0) o.mode = value;
    else if (id === 'cls' && (value === 0 || value === 1 || value === 2)) o.cls = value;
    else if (id === 'easy') o.easy = !!value;
    else if (id === 'cam' && CAMS.indexOf(value) >= 0) o.cam = value;
    else return;
    saveOpts(cfg, o);
  }
  function pbText(rec, variant) {
    var L = logic();
    if (!L) return '';
    if (!rec || rec.ms == null) { var par = L.PAR[variant]; return par ? 'No best yet — set one! 🥉 Bronze is ' + L.fmt(par.bronze, 1) : ''; }
    var m = L.medalFor(variant, rec.ms), nm = L.nextMedal(variant, rec.ms), M = L.MEDALS[m];
    return '🏆 Best ' + L.fmt(rec.ms) + ' · ' + M.icon + ' ' + M.name +
      (nm ? ' · Next: ' + nm.icon + ' ' + nm.name + ' ' + L.fmt(nm.ms) + ' (' + (nm.gap / 1000).toFixed(1) + ' s to go)' : ' · Top of the podium!');
  }

  var def = {
    key: 'kart', title: 'Neon Grand Prix', emoji: '🏎️', LW: LW, LH: LH, defaultVariant: 'track_loop',
    tutorial: [
      ['🏎️', 'Hold GO to drive · ⬅ ➡ steer · ⬇ brake. Easy Drive does the GO for you!'],
      ['✨', 'In a bend, hold ✨ while you steer. Sparks go blue → pink → gold — let go for a boost!'],
      ['🎵', 'Zoom over Beat Strips (pink = on the beat!), grab ♪ notes, and tap ✨ in the air off the jump.'],
      ['🎤', 'Fill your Hype Wand for SPOTLIGHT! Gates 1-2-3 then the finish — pass the Glow Crew and beat your best!']
    ],
    controls: controlsFor({}),
    controlsFor: controlsFor,
    keys: { 'ArrowUp': 'up', 'w': 'up', 'W': 'up', 'ArrowDown': 'down', 's': 'down', 'S': 'down', 'ArrowLeft': 'left', 'a': 'left', 'A': 'left', 'ArrowRight': 'right', 'd': 'right', 'D': 'right',
      ' ': 'drift', 'Shift': 'drift', 'x': 'drift', 'X': 'drift' },
    countdown: 3,
    music: { track: 'kart' },
    view3d: { src: 'world/games/kart-3d.js' },
    resultsGlass: true,
    menuOptions: menuOptions, setOption: setOption, pbText: pbText,
    preload: preload, idle: idle, newRound: newRound
  };
  if (Shell) Shell.define(def);
  if (inNode) {
    module.exports = {
      buildTrack: KL.buildTrack, newRound: newRound, newProgress: KL.newProgress, updateProgress: KL.updateProgress, nearest: KL.nearest,
      TRACKS: KL.TRACKS, LAPS: KL.LAPS, CHECKS: KL.CHECKS, WALL: KL.WALL, VMAX: KL.VMAX,
      def: def, loadOpts: loadOpts, controlsFor: controlsFor, menuOptions: menuOptions, setOption: setOption, pbText: pbText
    };
  }
})();
