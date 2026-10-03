/* ================================================================
   My Island — shared mini-game shell.
   Fixed-timestep loop (120 Hz) so movement is identical at any frame
   rate; pauses on focus loss (and never "catches up" on return);
   letterboxed logical canvas that survives resizes/rotation; menus,
   first-play tutorial, pause/resume/restart/exit, results, personal
   bests, parent time limits, sound toggle, reduced motion, cleanup.
   Games never touch points.
   ================================================================ */
(function () {
  'use strict';
  var STEP = 1 / 120, MAX_FRAME = 0.1;
  /* 3D draw rates: play at ~60 fps even on 90/120/144 Hz screens (the logic still
     steps every frame), menus/results at ~30 fps — the contract's numbers */
  var PLAY_FPS = 60, IDLE_FPS = 30;
  window.SLGames = window.SLGames || {};

  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function injectCss() {
    if (document.getElementById('slgCss')) return;
    var c = document.createElement('style'); c.id = 'slgCss';
    c.textContent = [
      '.slg{position:fixed;inset:0;z-index:9700;background:#130c2e;display:flex;flex-direction:column;color:#fff;font-family:"Baloo 2",system-ui,sans-serif;touch-action:none;user-select:none;-webkit-user-select:none;overscroll-behavior:none;}',
      '.slg-top{display:flex;align-items:center;gap:8px;padding:8px 10px;background:rgba(0,0,0,.25);flex:0 0 auto;}',
      '.slg-top .ttl{font-weight:800;font-size:18px;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      /* on a narrow (portrait) phone the HUD pill gives way first (ellipsis), so
         🔊 ⏸ 🏝️ Exit can never be pushed past the right edge */
      '.slg-top .hud{font-weight:800;font-size:16px;background:rgba(255,255,255,.12);border-radius:999px;padding:4px 12px;white-space:nowrap;flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;}',
      '.slg-top .slg-b{flex:0 0 auto;white-space:nowrap;}',
      '.slg-b{border:2px solid rgba(255,255,255,.35);background:rgba(255,255,255,.1);color:#fff;border-radius:12px;min-width:44px;min-height:44px;padding:4px 10px;font:inherit;font-weight:800;font-size:16px;cursor:pointer;touch-action:manipulation;}',
      '.slg-b:focus-visible{outline:3px solid #ffd23f;outline-offset:2px;}',
      '.slg-b.go{background:#ffd23f;color:#4a3200;border-color:#ffd23f;font-size:20px;padding:10px 26px;}',
      '.slg-b.alt{background:#fff;color:#2c2550;border-color:#fff;}',
      '.slg-mid{position:relative;flex:1;min-height:0;}',
      '.slg-canvas{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;}',
      '.slg-touch{position:absolute;left:0;right:0;bottom:0;display:flex;justify-content:space-between;align-items:flex-end;padding:10px;pointer-events:none;gap:10px;}',
      '.slg-touch .grp{display:flex;gap:10px;pointer-events:auto;}',
      '.slg-pad{width:clamp(64px,13vmin,104px);height:clamp(64px,13vmin,104px);border-radius:50%;border:3px solid rgba(255,255,255,.55);background:rgba(255,255,255,.18);color:#fff;font:inherit;font-weight:800;font-size:clamp(14px,3vmin,22px);touch-action:none;cursor:pointer;}',
      '.slg-pad.wide{width:clamp(110px,22vmin,170px);border-radius:999px;}',
      '.slg-pad.on{background:rgba(255,210,63,.6);border-color:#ffd23f;}',
      /* a sheet's content sits in .slg-in: its auto margins centre it when it fits, and
         when it is taller than the sheet it starts at the top and scrolls down (flex
         centring would spill the title above the scroll origin, out of reach) */
      '.slg-scr{position:absolute;inset:0;display:flex;align-items:center;justify-content:flex-start;flex-direction:column;gap:12px;background:rgba(19,12,46,.94);text-align:center;padding:18px;z-index:5;overflow:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;}',
      '.slg-in{display:flex;flex-direction:column;align-items:center;gap:inherit;width:100%;margin:auto 0;flex:0 0 auto;}',
      '.slg-emo{font-size:54px;}',
      '.slg-pbslot{min-height:40px;}',
      '.slg-sr{position:absolute;width:1px;height:1px;margin:-1px;padding:0;border:0;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;}',
      '.slg-scr h2{margin:0;font-size:clamp(26px,5vw,40px);line-height:1.1;}',
      '.slg-scr p{margin:0;max-width:560px;font-size:17px;color:#e3dcff;font-family:system-ui,sans-serif;font-weight:600;}',
      '.slg-scr .row{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;}',
      '.slg-tut{display:flex;gap:12px;flex-wrap:wrap;justify-content:center;}',
      '.slg-tut div{background:rgba(255,255,255,.1);border-radius:16px;padding:12px;width:170px;font-family:system-ui,sans-serif;font-weight:700;font-size:15px;color:#fff;}',
      '.slg-tut b{display:block;font-size:34px;margin-bottom:4px;}',
      '.slg-var{border:3px solid rgba(255,255,255,.3);background:rgba(255,255,255,.08);color:#fff;border-radius:14px;padding:8px 14px;font:inherit;font-weight:800;cursor:pointer;min-height:44px;}',
      '.slg-var.on{border-color:#ffd23f;background:rgba(255,210,63,.2);}',
      '.slg-big{font-size:clamp(40px,9vw,80px);font-weight:800;line-height:1;}',
      '.slg-pb{background:linear-gradient(135deg,#ffd23f,#ff9f43);color:#4a3200;border-radius:999px;padding:6px 16px;font-weight:800;font-size:20px;animation:slgPop .6s cubic-bezier(.2,1.6,.4,1);}',
      '@keyframes slgPop{from{transform:scale(.3);}to{transform:scale(1);}}',
      '.slg-banner{position:absolute;left:50%;top:10px;transform:translateX(-50%);background:#ffd23f;color:#4a3200;font-weight:800;border-radius:999px;padding:6px 16px;z-index:4;box-shadow:0 4px 14px rgba(0,0,0,.3);font-size:15px;max-width:92%;text-align:center;}',
      '.slg-count{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:clamp(70px,18vw,160px);font-weight:800;color:#ffd23f;text-shadow:0 8px 40px rgba(0,0,0,.5);z-index:3;pointer-events:none;}',
      /* the portrait "turn sideways" hint lives IN the menu / tutorial / pause sheets
         (where the child can rotate), never over a game's HUD during play */
      '.slg-rot{display:none;max-width:100%;background:rgba(255,255,255,.12);border:2px dashed rgba(255,255,255,.35);border-radius:999px;padding:6px 14px;font-weight:800;font-size:15px;line-height:1.3;pointer-events:none;}',
      '@media (orientation: portrait) and (max-width: 760px){.slg-rot{display:block;}}',
      '.slg-gl{position:absolute;inset:0;width:100%;height:100%;display:block;transition:opacity .3s;}',
      '.slg-pad[data-st=s1]{border-color:#3DF2FF;box-shadow:0 0 12px #3DF2FF;}.slg-pad[data-st=s2]{border-color:#FF4FB8;box-shadow:0 0 14px #FF4FB8;}',
      '.slg-pad[data-st=s3]{border-color:#FFD23F;box-shadow:0 0 16px #FFD23F;}.slg-pad[data-st=grey]{border-color:#CFC8DC;opacity:.75;}.slg-pad[data-st=ready]{border-color:#FFD23F;}',
      '.slg-badges{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;}.slg-badge{border-radius:999px;padding:4px 12px;font-weight:800;font-size:15px;background:rgba(255,255,255,.14);}',
      '.slg-badge.bronze{background:linear-gradient(135deg,#e8a15b,#b86b2c);}.slg-badge.silver{background:linear-gradient(135deg,#e9edf5,#9aa6bd);color:#2b2140;}.slg-badge.gold{background:linear-gradient(135deg,#ffe89a,#f0c02f);color:#4a3200;}.slg-badge.crown{background:linear-gradient(135deg,#ffb3e6,#b3e5ff,#c9ffe5,#fff3b3);color:#2b2140;}',
      /* the results glass keeps the bottom 58% when its content fits and grows (up to the
         whole stage, then scrolls) when it doesn't */
      '.slg-scr.glass{top:auto;height:auto;min-height:58%;max-height:100%;background:rgba(26,18,64,.72);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);border-radius:22px 22px 0 0;}',
      '.slg-opt{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;align-items:center;}.slg-opt .lb{font-weight:800;font-size:14px;opacity:.85;}.slg-lock{font-size:13px;opacity:.7;margin:0;}',
      '@media (prefers-reduced-motion: reduce){.slg-pb{animation:none;}}',
      /* short screens (phones held sideways): compact sheets so results / tutorial fit.
         The html-body selectors out-rank island-encore.css only inside this query. */
      '@media (max-height: 520px){',
      '.slg-scr{padding:10px 14px;}.slg-scr p{font-size:15px;}.slg-emo{font-size:34px;line-height:1;}.slg-pbslot{min-height:34px;}',
      '.slg-tut{gap:8px;}.slg-tut div{width:150px;padding:8px 10px;font-size:14px;}.slg-tut b{font-size:24px;}',
      'html body .slg .slg-scr{gap:6px;}',
      'html body .slg .slg-scr h2{font-size:clamp(22px,min(6vw,8.5vh),50px);}',
      'html body .slg .slg-big{font-size:clamp(32px,min(10vw,13vh),88px);}',
      'html body .slg .slg-tut b{height:40px;min-width:40px;font-size:22px;margin-bottom:4px;}',
      'html body .slg .slg-scr .slg-b.go{padding:6px 22px;font-size:18px;}',
      'html body .slg .slg-pb{font-size:16px;padding:4px 14px;}',
      '}'
    ].join('\n');
    document.head.appendChild(c);
  }

  /* ---------- sound helpers (respect the app's mute) ---------- */
  /* Sound names games can use (api.sound(name, vol, step)):
       samples  right · wrong · fanfare · sting · chip · coins · unlock · applause · heartbeat
       app sfx  correct · wrong · unlock · fanfare · tick
       synth    jump · coin · bump · kick · beep · go · check · pop · boing · crash · oof ·
                powerup · combo (step = 0,1,2… climbs the scale) · whoosh · boost · miss ·
                star · shield · whistle · save · skid · cheer · tada
     Everything respects the app's mute. */
  var SCALE = [523, 587, 659, 784, 880, 1047, 1175, 1319, 1568, 1760];
  var SAMPLE_FILES = { right: 1, wrong: 1, fanfare: 1, sting: 1, chip: 1, coins: 1, unlock: 1, applause: 1, heartbeat: 1 };
  var DUCK = { fanfare: 1, tada: 1, applause: 1, sting: 1, cheer: 1, unlock: 1 };
  function makeSound(cfg) {
    return function (name, vol, step) {
      try {
        if (cfg.muted && cfg.muted()) return;
        if (name === 'correct' || name === 'wrong' || name === 'unlock' || name === 'fanfare' || name === 'tick') { if (typeof playSfx === 'function') playSfx(name); return; }
        if (name === 'cheer') name = 'applause';
        if (DUCK[name] && window.SLMusic && typeof SLMusic.duck === 'function') { try { SLMusic.duck(0.4, 350); } catch (e) {} }
        /* only real sample files go to slSample — anything else would 404 on audio/sfx/<name>.mp3 */
        if (SAMPLE_FILES[name] && typeof slSample === 'function' && slSample(name, vol == null ? 0.8 : vol)) return;
        if (typeof getAudioCtx === 'function' && typeof _beep === 'function') {
          var ctx = getAudioCtx(); if (!ctx) return;
          var t = ctx.currentTime, v = vol == null ? 1 : Math.max(0.1, Math.min(1.5, vol));
          var has = function (f) { return typeof window[f] === 'function'; };
          if (name === 'pop') { if (has('_pluck')) { _pluck(ctx, 1320, t, { vol: 0.13 * v, dur: 0.22 }); _pluck(ctx, 1760, t + 0.045, { vol: 0.1 * v, dur: 0.2 }); } else _beep(ctx, 1320, t, 70, { vol: 0.12 * v }); return; }
          if (name === 'boing') { if (has('_slide')) _slide(ctx, 280, 760, t, 170, { wave: 'triangle', vol: 0.11 * v }); return; }
          if (name === 'crash') { if (has('_thump')) _thump(ctx, t, { f: 85, vol: 0.34 * v }); if (has('_tap')) { _tap(ctx, t, { vol: 0.2 * v, f: 520 }); _tap(ctx, t + 0.05, { vol: 0.14 * v, f: 340 }); } return; }
          if (name === 'oof') { if (has('_slide')) _slide(ctx, 440, 150, t, 280, { wave: 'triangle', vol: 0.16 * v }); if (has('_thump')) _thump(ctx, t, { f: 110, vol: 0.2 * v }); return; }
          if (name === 'powerup' || name === 'tada') { var notes = name === 'tada' ? [784, 988, 1175, 1568] : [659, 880, 1047, 1319]; notes.forEach(function (f, i) { if (has('_bell')) _bell(ctx, f, t + i * 0.07, { vol: 0.09 * v, dur: 0.6 }); }); return; }
          if (name === 'combo') { var k = Math.max(0, Math.min(SCALE.length - 1, step | 0)); if (has('_pluck')) { _pluck(ctx, SCALE[k], t, { vol: 0.15 * v, dur: 0.3 }); _pluck(ctx, SCALE[k] * 1.5, t + 0.05, { vol: 0.08 * v, dur: 0.25 }); } return; }
          if (name === 'whoosh') { if (has('_swell')) _swell(ctx, t, 0.32, { vol: 0.11 * v }); return; }
          if (name === 'boost') { if (has('_swell')) _swell(ctx, t, 0.45, { vol: 0.12 * v }); if (has('_slide')) _slide(ctx, 180, 900, t, 420, { wave: 'sawtooth', vol: 0.05 * v }); return; }
          if (name === 'miss') { if (has('_pluck')) { _pluck(ctx, 220, t, { vol: 0.17 * v, dur: 0.4 }); _pluck(ctx, 175, t + 0.13, { vol: 0.15 * v, dur: 0.45 }); } return; }
          if (name === 'star') { if (has('_bell')) { _bell(ctx, 1568, t, { vol: 0.08 * v, dur: 0.5 }); _bell(ctx, 2093, t + 0.06, { vol: 0.07 * v, dur: 0.5 }); } return; }
          if (name === 'shield') { if (has('_bell')) _bell(ctx, 660, t, { vol: 0.1 * v, dur: 0.7 }); if (has('_slide')) _slide(ctx, 500, 1000, t, 220, { wave: 'sine', vol: 0.06 * v }); return; }
          if (name === 'whistle') { if (has('_slide')) { _slide(ctx, 2100, 2350, t, 140, { wave: 'sine', vol: 0.08 * v }); _slide(ctx, 2100, 2350, t + 0.2, 380, { wave: 'sine', vol: 0.08 * v }); } return; }
          if (name === 'save') { if (has('_thump')) _thump(ctx, t, { f: 70, vol: 0.3 * v }); if (has('_slide')) _slide(ctx, 330, 140, t, 240, { wave: 'triangle', vol: 0.12 * v }); return; }
          if (name === 'skid') { if (has('_tap')) { for (var s2 = 0; s2 < 4; s2++) _tap(ctx, t + s2 * 0.04, { vol: 0.06 * v, f: 2400 - s2 * 300 }); } return; }
          if (name === 'jump') _beep(ctx, 520, t, 90, { wave: 'triangle', vol: 0.12 });
          else if (name === 'coin') { _beep(ctx, 990, t, 60, { wave: 'sine', vol: 0.12 }); _beep(ctx, 1320, t + 0.05, 80, { wave: 'sine', vol: 0.1 }); }
          else if (name === 'bump') _beep(ctx, 180, t, 140, { wave: 'triangle', vol: 0.18 });
          else if (name === 'kick') _beep(ctx, 140, t, 90, { wave: 'sine', vol: 0.3 });
          else if (name === 'beep') _beep(ctx, 660, t, 120, { wave: 'sine', vol: 0.15 });
          else if (name === 'go') _beep(ctx, 990, t, 260, { wave: 'sine', vol: 0.18 });
          else if (name === 'check') _beep(ctx, 880, t, 90, { wave: 'triangle', vol: 0.12 });
        }
      } catch (e) {}
    };
  }

  /* ================================================================
     OPTIONAL HOOKS (see docs/island3d/CONTRACTS.md) — every one defaults to
     today's behaviour, so a game only opts in to what it uses:
       def.view3d {src}            ES module exporting create(mid, opts) -> view
                                   view: {canvas, frame(round, dt, alpha, phase, countT),
                                          resize(w, h), dispose(), setRound?(round, variant)}
       def.hud {mount(mid, cfg, api) -> {update(round, phase), dispose()}}
       def.countIn {beats, bpm, labels[]}   beat count-in instead of 'countdown' seconds
       def.controlsFor(cfg)        touch pads per config
       def.menuVariants(cfg)       [{id, name, icon, tip, locked, lockText, medal, best}]
       def.menuVariantsLabel       e.g. 'rival' ('Change rival')
       def.menuOptions(cfg)        [{id, label, value, options:[{value, label, locked, note}]}]
       def.setOption(cfg, id, value)
       def.pbText(rec, variant, cfg)
       def.music {track}           with window.SLMusic present
       def.resultsGlass            results sheet as glass over the 3D scene
       round.wantEvents/events[]   logic pushes view events only while wantEvents; the shell
                                   empties events after every draw
       round.countdown(countT, held, isStart), round.pauseReset(), round.padState(id),
       round.summaryBadges() -> [{text, kind}], round.onFinish()
     The shell also owns, for every 3D view: the stage's 2D verdict (no 3D view —
     so no WebGL context — once SLIsland3D.failed() or .remembered() says 2D), a
     ~60 fps draw cap (logic still steps every frame), ~30 fps menus/results, and a
     frame-rate watchdog (sustained < 20 fps in play → the same round goes 2D).
     ================================================================ */

  /* ---------- pure helpers (exported on SLGameShell for tests) ---------- */
  /* Paces draws to `fps` on any display rate; a hitch never makes it burst to
     catch up. tick(now ms) → true when a draw is due. */
  function makePacer(fps, tolMs) {
    var iv = 1000 / fps, tol = tolMs == null ? 4 : tolMs, next = null;
    return {
      tick: function (now) {
        if (next == null) { next = now + iv; return true; }
        if (now < next - tol) return false;
        next += iv;
        if (next < now - tol) next = now + iv;
        return true;
      },
      reset: function () { next = null; }
    };
  }
  /* Frame-rate watchdog for a 3D view the shell drives. Draw intervals and draw work
     (ms) are smoothed; once they average slower than `fps` (20) for `holdMs` of
     continuous play, sample() returns true (once). A gap over 1 s (pause, hidden
     page) restarts it, and so does reset() — the shell calls it on every stage
     quality step, so a view on the stage lease is judged by the stage first (its
     steps, then its own 2D verdict) and this only catches what nothing else does. */
  function makeFrameWatch(o) {
    o = o || {};
    var limit = 1000 / (o.fps || 20), hold = o.holdMs != null ? o.holdMs : 6000, minFrames = o.minFrames || 12;
    var ai = 0, aw = 0, n = 0, since = -1, fired = false;
    function reset() { ai = 0; aw = 0; n = 0; since = -1; }
    return {
      sample: function (intervalMs, workMs, now) {
        if (fired) return false;
        if (!(intervalMs > 0) || intervalMs > 1000) { reset(); return false; }
        var w = workMs > 0 ? workMs : 0;
        ai = n ? ai * 0.9 + intervalMs * 0.1 : intervalMs;
        aw = n ? aw * 0.9 + w * 0.1 : w;
        n++;
        if (n < minFrames) return false;
        if (ai <= limit && aw <= limit) { since = -1; return false; }
        if (since < 0) since = now;
        if (now - since >= hold) { fired = true; return true; }
        return false;
      },
      reset: reset,
      stats: function () { return { fps: ai > 0 ? Math.round(10000 / ai) / 10 : 0, workMs: Math.round(aw * 100) / 100, frames: n, slow: since >= 0, fired: fired }; }
    };
  }
  /* The stage's 2D verdict (world/island3d/stage.js): a 3D failure this session
     (performance, context loss, load) or a remembered "2D on this device" record.
     A game must not open a second WebGL context against it. → reason | null */
  function verdict2d(w) {
    w = w || {};
    var IS = w.SLIsland3D;
    if (!IS) return storedVerdict(w);
    try { var f = typeof IS.failed === 'function' ? IS.failed() : null; if (f) return 'failed:' + f; } catch (e) {}
    try { var r = typeof IS.remembered === 'function' ? IS.remembered(w.SL_WORLD_VER) : null; if (r && r.off) return 'remembered:' + (r.why || '2d'); } catch (e) {}
    return null;
  }
  /* stage.js not loaded: read its remembered record by the same rule (stale once
     SL_WORLD_VER changes; ?3d=1 lets a parent retry 3D) */
  function storedVerdict(w) {
    try {
      if (/[?&]3d=1(&|$)/.test(String((w.location && w.location.search) || ''))) return null;
      var rec = w.localStorage ? JSON.parse(w.localStorage.getItem('slIsland3D') || 'null') : null;
      if (rec && typeof rec === 'object' && rec.off && String(rec.ver) === String(w.SL_WORLD_VER || '1')) return 'remembered:' + (rec.why || '2d');
    } catch (e) {}
    return null;
  }
  /* a list of short phrases read as sentences by a screen reader */
  function sentences(parts) {
    return parts.filter(function (s) { return s != null && String(s).trim(); }).map(function (s) {
      s = String(s).trim(); return /[.!?…]$/.test(s) ? s : s + '.';
    }).join(' ');
  }
  var ROT_HTML = '<div class="slg-rot" aria-hidden="true">📱↻ Turn sideways for a bigger view</div>';
  /* ================================================================
     define(def) -> { start(cfg), demo(host, opts) }
     def: key, title, emoji, LW, LH, tutorial[], controls[], keys{},
          countdown (secs), preload(cfg), newRound(api, variant, cfg),
          roundSecsMax (hard cap so a round always ends)
     round: step(dt), render(ctx), input(id, down), pointer(type, x, y),
            done, hud(), result(), summary(), forceEnd(), autopilot(dt)
     ================================================================ */
  function define(def) {
    function start(cfg) {
      injectCss();
      var ac = new AbortController(), sig = { signal: ac.signal };
      /* one shared sound set when the island has loaded it (adds pet voices etc.) */
      var sound = (window.SLSound && typeof SLSound.make === 'function') ? SLSound.make(cfg) : makeSound(cfg);
      var title = def.titleFor ? (function () { try { return def.titleFor(cfg) || def.title; } catch (e) { return def.title; } })() : def.title;
      var reduced = !!cfg.reduced;
      var root = el('div', 'slg');
      root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', title);
      /* skin hooks (world/island-encore.css): the player's colour and the count-in beat */
      if (cfg.user && /^#[0-9a-f]{6}$/i.test(cfg.user.color || '')) root.style.setProperty('--sle-member', cfg.user.color);
      if (def.countIn && def.countIn.bpm > 0) root.style.setProperty('--slg-beat', (60 / def.countIn.bpm).toFixed(3) + 's');
      root.innerHTML =
        '<div class="slg-top"><span class="ttl">' + def.emoji + ' ' + esc(title) + '</span><span class="hud" id="slgHud" aria-live="off"></span>' +
        '<button class="slg-b" type="button" id="slgSound" aria-label="Sound on or off"></button>' +
        '<button class="slg-b" type="button" id="slgPause" aria-label="Pause">⏸</button>' +
        '<button class="slg-b" type="button" id="slgExit" aria-label="Back to my island">🏝️ Exit</button></div>' +
        '<div class="slg-mid" id="slgMid"><canvas class="slg-canvas" id="slgCanvas"></canvas><div class="slg-touch" id="slgTouch"></div></div>' +
        '<div class="slg-sr" id="slgLive" role="status" aria-live="polite" aria-atomic="true"></div>';
      document.body.appendChild(root);
      var mid = root.querySelector('#slgMid'), canvas = root.querySelector('#slgCanvas'), ctx = canvas.getContext('2d');
      var hudEl = root.querySelector('#slgHud'), soundBtn = root.querySelector('#slgSound'), pauseBtn = root.querySelector('#slgPause');
      var liveEl = root.querySelector('#slgLive'), liveTimer = 0, livePending = '';
      /* screen-reader announcements (results, a new personal best): the region is
         emptied first so a repeated line is read again */
      function say(text) {
        if (!liveEl || !text) return;
        livePending = livePending ? livePending + ' ' + text : String(text);
        if (liveTimer) return;
        liveEl.textContent = '';
        liveTimer = setTimeout(function () { liveTimer = 0; var t = livePending; livePending = ''; if (!exited) liveEl.textContent = t; }, 80);
      }
      function paintSound() { soundBtn.textContent = (cfg.muted && cfg.muted()) ? '🔇' : '🔊'; }
      paintSound();
      soundBtn.addEventListener('click', function () { if (cfg.toggleMute) cfg.toggleMute(); paintSound(); }, sig);

      var view = { scale: 1, ox: 0, oy: 0, dpr: 1 };
      function resize() {
        var r = mid.getBoundingClientRect();
        var dpr = Math.min(2, window.devicePixelRatio || 1);
        canvas.width = Math.max(1, Math.round(r.width * dpr));
        canvas.height = Math.max(1, Math.round(r.height * dpr));
        var s = Math.min(r.width / def.LW, r.height / def.LH);
        view = { scale: s, ox: (r.width - def.LW * s) / 2, oy: (r.height - def.LH * s) / 2, dpr: dpr };
        if (v3) { try { v3.resize(r.width, r.height); } catch (e) { fail3d('resize'); } }
        draw();
      }
      var ro = (typeof ResizeObserver !== 'undefined') ? new ResizeObserver(resize) : null;
      if (ro) ro.observe(mid); else window.addEventListener('resize', resize, sig);
      window.addEventListener('orientationchange', function () { setTimeout(resize, 200); }, sig);

      /* ---------- state machine ---------- */
      var phase = 'menu';          /* menu | tutorial | countdown | playing | paused | results | timeup */
      var variant = cfg.variant;
      var round = null, raf = 0, last = 0, acc = 0, countT = 0, playSecAcc = 0, hardStop = Infinity, graceNote = false;
      var lastDt = 0, countIsStart = true, v3 = null, v3mod = null, v3failed = false, idleRaf = 0, idleLast = 0, hudObj = null;
      var playPace = makePacer(PLAY_FPS), idlePace = makePacer(IDLE_FPS), watch = makeFrameWatch(), lastDrawAt = 0, lastWork = 0, unsubQ = null;
      var hudText = null, pads = [], countEl = null, countTxt = '';
      function countTotal() { return def.countIn ? def.countIn.beats * 60 / def.countIn.bpm : (def.countdown || 0); }
      function countLabel() {
        if (!def.countIn) return String(Math.max(1, Math.ceil(countT)));
        var beat = 60 / def.countIn.bpm, i = Math.min(def.countIn.beats - 1, Math.floor((countTotal() - countT) / beat));
        return (def.countIn.labels && def.countIn.labels[i]) || String(def.countIn.beats - i);
      }
      function mus(method) {
        var m = api && api.music; if (!m || typeof m[method] !== 'function') return;
        try { m[method].apply(m, Array.prototype.slice.call(arguments, 1)); } catch (e) {}
      }
      /* stored rival/variant choice for games with their own variant list */
      if (def.menuVariants) {
        try {
          var stored = localStorage.getItem('slgVar:' + def.key), list0 = def.menuVariants(cfg) || [];
          if (stored && list0.some(function (v) { return v.id === stored && !v.locked; })) variant = stored;
          else if (!list0.some(function (v) { return v.id === variant && !v.locked; }) && list0.length) variant = (list0.filter(function (v) { return !v.locked; })[0] || list0[0]).id;
        } catch (e) {}
      }
      var screen = null, banner = null;
      var held = {};

      /* noFocus: the caller focuses later (results wake their buttons after a guard) */
      function setScreen(html, noFocus) {
        if (screen) screen.remove();
        screen = null;
        if (html == null) return;
        var s = screen = el('div', 'slg-scr');
        s.appendChild(el('div', 'slg-in', html));
        mid.appendChild(s);
        if (!noFocus) setTimeout(function () { if (screen === s) focusMain(s); }, 30);
        return s;
      }
      /* the sheet's main button takes focus (Enter / Space press it) without scrolling
         a tall sheet away from its title */
      function focusMain(sc) {
        var f = sc.querySelector('.slg-b.go');
        if (!f || f.disabled) f = sc.querySelector('.slg-b.alt');
        if (!f || f.disabled) f = Array.prototype.filter.call(sc.querySelectorAll('button'), function (b) { return !b.disabled; })[0];
        if (f) { try { f.focus({ preventScroll: true }); } catch (e) {} }
      }
      function setBanner(txt) {
        if (banner) { banner.remove(); banner = null; }
        if (!txt) return;
        banner = el('div', 'slg-banner'); banner.textContent = txt; banner.setAttribute('role', 'status');
        mid.appendChild(banner);
      }
      function pbLine() {
        var key = def.key + ':' + String(variant || 'std');
        var rec = cfg.pb && cfg.pb[key];
        if (!rec) return 'No personal best yet — set one!';
        if (def.pbText) { try { var t = def.pbText(rec, variant, cfg); if (t) return t; } catch (e) {} }
        return '🏆 Your best: ' + (rec.ms != null ? (rec.ms / 1000).toFixed(2) + ' s' : 'score ' + String(rec.score).replace(/\B(?=(\d{3})+(?!\d))/g, ','));
      }
      function menu() {
        phase = 'menu'; stopLoop(); setBanner(null); renderTouch(false);
        mus('menuMode', true);
        var vhtml = '';
        if (def.menuVariants) {
          var mv = def.menuVariants(cfg) || [];
          vhtml = '<p class="lb" style="font-weight:800;margin:0;">' + esc(def.menuVariantsTitle || 'Choose') + '</p><div class="row">' + mv.map(function (v) {
            return '<button class="slg-var' + (v.id === variant ? ' on' : '') + '" type="button" data-mvar="' + esc(v.id) + '"' + (v.locked ? ' disabled' : '') + ' title="' + esc(v.tip || '') + '">' +
              (v.icon ? esc(v.icon) + ' ' : '') + esc(v.name) + (v.medal ? ' ' + esc(v.medal) : '') + (v.locked ? ' 🔒' : '') + '</button>';
          }).join('') + '</div>' + mv.filter(function (v) { return v.locked && v.lockText; }).map(function (v) { return '<p class="slg-lock">🔒 ' + esc(v.name) + ': ' + esc(v.lockText) + '</p>'; }).join('');
        } else {
          var vars = (cfg.ownedVariants || []);
          vhtml = vars.length > 1 ? '<div class="row">' + vars.map(function (v) { return '<button class="slg-var' + (v.id === variant ? ' on' : '') + '" type="button" data-var="' + esc(v.id) + '">' + esc(v.name) + '</button>'; }).join('') + '</div>' : '';
        }
        var ohtml = '';
        if (def.menuOptions) {
          (def.menuOptions(cfg) || []).forEach(function (o) {
            ohtml += '<div class="slg-opt" role="group" aria-label="' + esc(o.label) + '"><span class="lb">' + esc(o.label) + '</span>' + (o.options || []).map(function (op) {
              var on = op.value === o.value;
              return '<button class="slg-var' + (on ? ' on' : '') + '" type="button" aria-pressed="' + on + '" data-opt="' + esc(o.id) + '" data-val="' + esc(String(op.value)) + '"' + (op.locked ? ' disabled' : '') + '>' + (op.locked ? '🔒 ' : '') + esc(op.label) + '</button>';
            }).join('') + '</div>' + (o.options || []).filter(function (op) { return op.locked && op.note; }).map(function (op) { return '<p class="slg-lock">' + esc(op.note) + '</p>'; }).join('');
          });
        }
        var sc = setScreen(ROT_HTML + '<div class="slg-emo">' + def.emoji + '</div><h2>' + esc(title) + '</h2>' + vhtml + ohtml + '<p>' + esc(pbLine()) + '</p>' +
          '<div class="row"><button class="slg-b go" type="button" id="slgPlay">▶ Play</button><button class="slg-b" type="button" id="slgHow">❓ How to play</button></div>');
        sc.querySelectorAll('[data-var]').forEach(function (b) { b.addEventListener('click', function () { variant = b.dataset.var; cfg.variant = variant; if (cfg.onSelectVariant) cfg.onSelectVariant(variant); if (v3 && v3.setRound) v3.setRound(null, variant); menu(); }); });
        sc.querySelectorAll('[data-mvar]').forEach(function (b) { b.addEventListener('click', function () { variant = b.dataset.mvar; cfg.variant = variant; try { localStorage.setItem('slgVar:' + def.key, variant); } catch (e) {} if (v3 && v3.setRound) v3.setRound(null, variant); menu(); }); });
        sc.querySelectorAll('[data-opt]').forEach(function (b) {
          b.addEventListener('click', function () {
            var o = ((def.menuOptions && def.menuOptions(cfg)) || []).filter(function (x) { return x.id === b.dataset.opt; })[0];
            var op = o && (o.options || []).filter(function (x) { return String(x.value) === b.dataset.val; })[0];
            if (op && def.setOption) def.setOption(cfg, o.id, op.value);
            menu();
          });
        });
        sc.querySelector('#slgPlay').addEventListener('click', function () { cfg.tutSeen ? beginRound() : tutorial(); });
        sc.querySelector('#slgHow').addEventListener('click', tutorial);
        if (v3) { if (v3.setRound) v3.setRound(null, variant); startIdle(); } else drawIdle();
      }
      function tutorial() {
        phase = 'tutorial'; if (v3) startIdle();
        var sc = setScreen(ROT_HTML + '<h2>How to play</h2><div class="slg-tut">' + def.tutorial.map(function (t) { return '<div><b>' + t[0] + '</b>' + esc(t[1]) + '</div>'; }).join('') + '</div>' +
          '<div class="row"><button class="slg-b go" type="button" id="slgGotIt">Got it — let’s go!</button><button class="slg-b" type="button" id="slgBack">Back</button></div>');
        sc.querySelector('#slgGotIt').addEventListener('click', function () { if (!cfg.tutSeen) { cfg.tutSeen = true; if (cfg.onTutorialSeen) cfg.onTutorialSeen(); } beginRound(); });
        sc.querySelector('#slgBack').addEventListener('click', menu);
      }
      function timeUpScreen(afterRound) {
        phase = 'timeup'; stopLoop(); setBanner(null); renderTouch(false); mus('menuMode', true); if (v3) startIdle();
        var sc = setScreen('<div class="slg-emo">⏱️</div><h2>That’s all the game time for today</h2><p>' + (afterRound ? 'Great finish! ' : '') + 'Your games are still yours — come back tomorrow. 📚 Learning is open whenever you like.</p>' +
          '<div class="row"><button class="slg-b go" type="button" id="slgOut">🏝️ Back to my island</button></div>');
        sc.querySelector('#slgOut').addEventListener('click', exit);
      }
      function beginRound() {
        var gate = cfg.arcade ? cfg.arcade.gate() : { allowed: true, hardStopAtUsed: Infinity };
        if (!gate.allowed) return timeUpScreen(false);
        hardStop = gate.hardStopAtUsed; graceNote = false;
        setScreen(null); setBanner(null);
        round = def.newRound(api, variant, cfg);
        round.wantEvents = true; if (!round.events) round.events = [];
        held = {};
        renderTouch(true);
        acc = 0; playSecAcc = 0; countIsStart = true;
        if (!v3) mount3d();
        if (v3 && v3.setRound) { try { v3.setRound(round, variant); } catch (e) { fail3d('setRound'); } }
        if (def.music) mus('play', def.music.track, { countInSec: countTotal() });
        if (countTotal()) { phase = 'countdown'; countT = countTotal(); } else { phase = 'playing'; mus('menuMode', false); }
        var st = cfg.arcade && cfg.arcade.status();
        if (st && st.limited && st.warn) setBanner('⏱️ About 1 minute of game time left today');
        startLoop();
      }
      function finishRound() {
        if (!round || phase === 'results') return;
        if (round.onFinish) { try { round.onFinish(); } catch (e) {} }
        phase = 'results'; stopLoop(); renderTouch(false); setBanner(null);
        mus('menuMode', true);
        if (cfg.arcade) cfg.arcade.flush();
        var res = round.result();
        var badges = '', badgeList = [];
        if (round.summaryBadges) { try { badgeList = round.summaryBadges() || []; badges = '<div class="slg-badges">' + badgeList.map(function (b) { return '<span class="slg-badge ' + esc(b.kind || '') + '">' + esc(b.text) + '</span>'; }).join('') + '</div>'; } catch (e) { badges = ''; badgeList = []; } }
        var sTitle = round.summaryTitle ? round.summaryTitle() : 'Finished!', sBig = round.summaryBig(), sText = round.summaryText ? round.summaryText() : '';
        var sc = setScreen('<h2>' + esc(sTitle) + '</h2><div class="slg-big">' + esc(sBig) + '</div><p>' + esc(sText) + '</p>' + badges + '<div id="slgPbSlot" class="slg-pbslot"></div><p style="font-size:13px;opacity:.75;margin:0 0 8px;">🎮 Game scores don’t earn or spend ⭐ — learning earns ⭐.</p>' +
          '<div class="row"><button class="slg-b go" type="button" id="slgAgain">↻ Play again</button>' +
          (variantChoices() > 1 ? '<button class="slg-b" type="button" id="slgMenu">🗺️ Change ' + esc(def.menuVariantsLabel || 'course') + '</button>' : '') +
          '<button class="slg-b alt" type="button" id="slgHome">🏝️ Back to my island</button></div>', true);
        /* tell a screen reader how it went (title, score, summary, medals) */
        say(sentences([sTitle, sBig, sText].concat(badgeList.map(function (b) { return b && b.text; }))));
        if (v3 && def.resultsGlass) sc.classList.add('glass');
        if (v3) startIdle();
        sc.querySelector('#slgAgain').addEventListener('click', beginRound);
        var mb = sc.querySelector('#slgMenu'); if (mb) mb.addEventListener('click', menu);
        sc.querySelector('#slgHome').addEventListener('click', exit);
        if (res && cfg.onResult) {
          Promise.resolve(cfg.onResult(variant, res)).then(function (r) {
            var slot = sc.querySelector('#slgPbSlot'); if (!slot) return;
            if (r && r.isPB) {
              slot.innerHTML = '<span class="slg-pb">🏆 NEW PERSONAL BEST!</span>';
              sound('fanfare');
              if (screen === sc) say('New personal best!');
              var key = def.key + ':' + String(variant || 'std');
              cfg.pb = cfg.pb || {}; cfg.pb[key] = res.ms != null ? { ms: res.ms } : { score: res.score };
            } else if (r && r.prev) {
              slot.innerHTML = '<span style="font-weight:700;color:#d9d2f7;">' + esc(pbLine()) + '</span>';
            }
          }).catch(function () {});
        }
        var st = cfg.arcade && cfg.arcade.status();
        var again = sc.querySelector('#slgAgain');
        if (st && st.exhausted) { again.textContent = '⏱️ Time’s up for today'; again.disabled = true; again.dataset.stay = '1'; again.classList.remove('go'); }
        /* a finger still tapping the game mustn't hit Play again / Exit by accident: the
           buttons wake after 0.65 s and then the main one takes focus (a disabled button
           can't, so focusing it earlier did nothing and Enter / Space went nowhere) */
        var guarded = Array.prototype.filter.call(sc.querySelectorAll('button'), function (b) { return !b.disabled; });
        guarded.forEach(function (b) { b.disabled = true; });
        setTimeout(function () {
          guarded.forEach(function (b) { if (!b.dataset.stay) b.disabled = false; });
          if (screen === sc && !exited) focusMain(sc);
        }, 650);
      }
      function variantChoices() {
        if (def.menuVariants) { try { return (def.menuVariants(cfg) || []).filter(function (v) { return !v.locked; }).length; } catch (e) { return 0; } }
        return (cfg.ownedVariants || []).length;
      }
      function pause() {
        if (phase !== 'playing' && phase !== 'countdown') return;
        if (round && round.pauseReset) { try { round.pauseReset(); } catch (e) {} }
        mus('pause', 200);
        var was = phase; phase = 'paused'; stopLoop(); held = {}; renderTouchHeld();
        var sc = setScreen(ROT_HTML + '<div class="slg-emo">⏸</div><h2>Paused</h2><p>Take your time.</p><div class="row"><button class="slg-b go" type="button" id="slgResume">▶ Resume</button><button class="slg-b" type="button" id="slgRestart">↻ Restart</button><button class="slg-b alt" type="button" id="slgQuit">🏝️ Exit</button></div>');
        sc.querySelector('#slgResume').addEventListener('click', function () {
          setScreen(null);
          countIsStart = false;
          if (was === 'playing') { phase = 'countdown'; countT = def.countIn ? countTotal() : Math.max(countT, 2); } else phase = was;
          mus('resume', 300);
          startLoop();
        });
        sc.querySelector('#slgRestart').addEventListener('click', beginRound);
        sc.querySelector('#slgQuit').addEventListener('click', exit);
      }
      pauseBtn.addEventListener('click', function () { if (phase === 'paused') { var r = screen && screen.querySelector('#slgResume'); if (r) r.click(); } else pause(); }, sig);
      document.addEventListener('visibilitychange', function () {
        if (document.hidden) pause();
        else if (v3 && !exited && phase !== 'playing' && phase !== 'countdown' && phase !== 'paused') startIdle();   /* the menu/results 3D backdrop wakes up again */
      }, sig);
      window.addEventListener('blur', function () { pause(); }, sig);

      /* ---------- loop ---------- */
      function startLoop() {
        stopLoop(); stopIdle();
        last = performance.now(); lastDrawAt = last; playPace.reset(); watch.reset();
        raf = requestAnimationFrame(frame);
      }
      function stopLoop() { if (raf) cancelAnimationFrame(raf); raf = 0; }
      /* menus/results keep the 3D scene alive at ~30 fps (static 2D needs no loop) */
      function startIdle() { if (!v3 || idleRaf || exited) return; idleLast = performance.now(); idlePace.reset(); idleRaf = requestAnimationFrame(idleFrame); }
      function stopIdle() { if (idleRaf) cancelAnimationFrame(idleRaf); idleRaf = 0; }
      function idleFrame(now) {
        idleRaf = 0;
        if (!v3 || exited || document.hidden || phase === 'playing' || phase === 'countdown' || phase === 'paused') return;
        if (idlePace.tick(now)) {
          var dt = Math.min(MAX_FRAME, Math.max(0, (now - idleLast) / 1000)); idleLast = now;
          try { v3.frame(round, dt, 0, phase, 0); } catch (e) { fail3d('frame'); return; }
        }
        idleRaf = requestAnimationFrame(idleFrame);
      }
      function frame(now) {
        raf = 0;
        var dt = Math.min(MAX_FRAME, Math.max(0, (now - last) / 1000));
        last = now;
        advance(dt);
        if (!v3) { lastDt = dt; draw(); }
        else if (playPace.tick(now)) {
          /* 3D draws at ~60 fps on any screen; the view's dt is the time since ITS last draw */
          var iv = now - lastDrawAt;
          lastDrawAt = now; lastDt = Math.min(MAX_FRAME, Math.max(0, iv / 1000));
          draw();
          if (v3 && (phase === 'playing' || phase === 'countdown') && watch.sample(iv, lastWork, now)) fail3d('slow');
        }
        if (phase === 'playing' || phase === 'countdown') raf = requestAnimationFrame(frame);
      }
      /* exposed for automated QA: advance the simulation by real seconds */
      function advance(dt) {
        if (phase === 'countdown') {
          var before = countLabel();
          countT -= dt;
          if (round && round.countdown) { try { round.countdown(Math.max(0, countT), held, countIsStart); } catch (e) {} }
          if (countLabel() !== before && countT > 0) sound('beep');
          if (countT <= 0) {
            phase = 'playing'; sound('go'); mus('menuMode', false);
            /* keys/pads held through the count fire as fresh presses at GO */
            if (round && round.input) Object.keys(held).forEach(function (id) { if (held[id]) round.input(id, true); });
          }
          return;
        }
        if (phase !== 'playing' || !round) return;
        acc += dt;
        while (acc >= STEP) { round.step(STEP, held); acc -= STEP; if (round.done) break; }
        /* parent time limit: count active play only */
        playSecAcc += dt;
        if (playSecAcc >= 1 && cfg.arcade) {
          var whole = Math.floor(playSecAcc); playSecAcc -= whole;
          var st = cfg.arcade.tick(whole);
          if (st && st.limited) {
            if (st.exhausted && !graceNote) { graceNote = true; setBanner('⏱️ Time’s up after this round — finish it off!'); }
            else if (!st.exhausted && st.warn && !banner) setBanner('⏱️ About 1 minute of game time left today');
            var ceiling = Math.min(hardStop, st.hardStopAtUsed != null ? st.hardStopAtUsed : Infinity);
            if (st.usedSec >= ceiling) { round.forceEnd(); }
          }
        }
        if (round.done) finishRound();
      }

      /* ---------- drawing ---------- */
      function begin() {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = '#130c2e'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.setTransform(view.scale * view.dpr, 0, 0, view.scale * view.dpr, view.ox * view.dpr, view.oy * view.dpr);
        ctx.save(); ctx.beginPath(); ctx.rect(0, 0, def.LW, def.LH); ctx.clip();
      }
      function draw() {
        if (v3) {
          var t0 = performance.now();
          try { v3.frame(round, lastDt, acc / STEP, phase, countT); }
          catch (e) { fail3d('frame'); return draw(); }
          lastWork = performance.now() - t0;
        } else {
          if (!round) { drawIdle(); return; }
          begin();
          round.render(ctx);
          ctx.restore();
        }
        /* the text HUD only when no HTML HUD replaced it, and the DOM only on a change */
        if (round && hudEl && round.hud && !hudObj) setHudText(round.hud());
        if (hudObj) { try { hudObj.update(round, phase); } catch (e) {} }
        if (round && round.padState) {
          for (var i = 0; i < pads.length; i++) { var p = pads[i], st = round.padState(p.id) || ''; if (p.st !== st) { p.st = st; p.b.dataset.st = st; } }
        }
        if (phase === 'countdown') {
          if (!countEl) { countEl = el('div', 'slg-count'); mid.appendChild(countEl); countTxt = null; }
          var lbl = countLabel();
          if (lbl !== countTxt) {
            countTxt = lbl; countEl.textContent = lbl;
            /* one ring per beat (the CSS plays it once; reduced motion keeps the digit only) */
            if (!reduced) countEl.appendChild(el('span', 'slg-ring'));
          }
        } else if (countEl) { countEl.remove(); countEl = null; }
        if (round && round.events && round.events.length) round.events.length = 0;
      }
      function setHudText(t) {
        t = t == null ? '' : String(t);
        if (t !== hudText) { hudText = t; hudEl.textContent = t; }
      }
      function drawIdle() {
        begin();
        if (def.idle) def.idle(ctx, cfg); else { ctx.fillStyle = '#2a1b5e'; ctx.fillRect(0, 0, def.LW, def.LH); }
        ctx.restore();
        setHudText('');
      }

      /* ---------- input ---------- */
      var keyMap = def.keys || {};
      window.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') { if (phase === 'playing' || phase === 'countdown') { e.preventDefault(); pause(); } return; }
        var id = keyMap[e.key];
        if (!id) return;
        if (phase !== 'playing' && phase !== 'countdown') return;   /* let Enter/Space press the focused button */
        e.preventDefault();
        if (!held[id]) { held[id] = true; if (phase === 'playing' && round && round.input) round.input(id, true); renderTouchHeld(); }
      }, sig);
      window.addEventListener('keyup', function (e) {
        var id = keyMap[e.key]; if (!id) return;
        if (held[id]) { held[id] = false; if (round && round.input) round.input(id, false); renderTouchHeld(); }
      }, sig);
      function toLogical(e) {
        var r = canvas.getBoundingClientRect();
        return { x: (e.clientX - r.left - view.ox) / view.scale, y: (e.clientY - r.top - view.oy) / view.scale };
      }
      canvas.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        if (phase !== 'playing' || !round) return;
        var p = toLogical(e);
        if (round.pointer) round.pointer('down', p.x, p.y);
        else if (def.tapAction) { held[def.tapAction] = true; round.input(def.tapAction, true); setTimeout(function () { held[def.tapAction] = false; if (round) round.input(def.tapAction, false); }, 120); }
      }, sig);
      canvas.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false, signal: ac.signal });
      var touchHost = root.querySelector('#slgTouch');
      function renderTouch(show) {
        touchHost.innerHTML = '';
        pads = [];
        var controls = def.controlsFor ? def.controlsFor(cfg) : def.controls;
        if (!show || !controls) return;
        var left = el('div', 'grp'), right = el('div', 'grp');
        controls.forEach(function (c) {
          var b = el('button', 'slg-pad' + (c.wide ? ' wide' : ''), c.label);
          b.type = 'button'; b.dataset.ctl = c.id; b.setAttribute('aria-label', c.aria || c.label);
          function down(e) { e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch (er) {} if (phase !== 'playing' && phase !== 'countdown') return; held[c.id] = true; if (phase === 'playing' && round && round.input) round.input(c.id, true); renderTouchHeld(); }
          function up(e) { e.preventDefault(); if (held[c.id]) { held[c.id] = false; if (round && round.input) round.input(c.id, false); renderTouchHeld(); } }
          b.addEventListener('pointerdown', down, sig);
          b.addEventListener('pointerup', up, sig);
          b.addEventListener('pointercancel', up, sig);
          b.addEventListener('lostpointercapture', up, sig);
          b.addEventListener('contextmenu', function (e) { e.preventDefault(); }, sig);
          (c.side === 'left' ? left : right).appendChild(b);
          pads.push({ b: b, id: c.id, st: null });
        });
        touchHost.appendChild(left); touchHost.appendChild(right);
      }
      function renderTouchHeld() { pads.forEach(function (p) { p.b.classList.toggle('on', !!held[p.id]); }); }

      /* ---------- exit / cleanup ---------- */
      var exited = false;
      function exit() {
        if (exited) return; exited = true;
        stopLoop(); stopIdle(); unwatchQuality(); clearTimeout(liveTimer); liveTimer = 0;
        if (v3) { try { v3.dispose(); } catch (e) {} if (v3.canvas && v3.canvas.parentNode) v3.canvas.parentNode.removeChild(v3.canvas); v3 = null; }
        if (hudObj) { try { hudObj.dispose(); } catch (e) {} hudObj = null; }
        mus('stop', 200);
        if (round && round.dispose) round.dispose();
        round = null;
        ac.abort();
        if (ro) ro.disconnect();
        root.remove();
        if (cfg.arcade) cfg.arcade.flush();
        if (cfg.onExit) cfg.onExit();
      }
      root.querySelector('#slgExit').addEventListener('click', exit, sig);

      var api = { sound: sound, reduced: reduced, LW: def.LW, LH: def.LH };
      api.music = (window.SLMusic && typeof SLMusic.channel === 'function') ? (function () { try { return SLMusic.channel({ muted: cfg.muted }); } catch (e) { return null; } })() : null;

      /* ---------- optional 3D view (falls back to the 2D canvas silently) ---------- */
      function can3d() {
        if (!def.view3d || cfg.demo || v3failed) return false;
        try { if (localStorage.getItem('slNo3D') === '1' || sessionStorage.getItem('slNo3dGame') === '1') return false; } catch (e) {}
        /* the stage already judged this device 2D (too slow, lost contexts, no 3D):
           don't open a second WebGL context the island just gave up on */
        if (verdict2d(window)) return false;
        return typeof WebGL2RenderingContext !== 'undefined' && typeof window.slLoad3D === 'function';
      }
      function load3d() {
        if (!can3d()) return Promise.resolve(null);
        var v = window.SL_WORLD_VER || '1';
        try { if (localStorage.getItem('slQaMode') === '1') v += '&qa=' + Date.now(); } catch (e) {}
        var url = new URL(def.view3d.src + '?v=' + v, document.baseURI).href;
        var p = window.slLoad3D().then(function (T) {
          if (!T) return null;
          return new Function('u', 'return import(u)')(url).then(function (m) { return (m && m.create) ? { THREE: T, m: m } : null; });
        });
        var to = new Promise(function (res) { setTimeout(function () { res(null); }, 8000); });
        return Promise.race([p, to]).catch(function () { return null; });
      }
      function mount3d() {
        if (v3 || !v3mod || v3failed || exited || !can3d()) return;   /* the verdict may have changed since load */
        try {
          var made = v3mod.m.create(mid, { THREE: v3mod.THREE, cfg: cfg, api: api, def: def, reduced: reduced, onFail: fail3d });
          Promise.resolve(made).then(function (vw) {
            if (exited || v3failed || !vw || !vw.canvas) { if (vw && vw.dispose) try { vw.dispose(); } catch (e) {} return; }
            v3 = vw;
            v3.canvas.classList.add('slg-gl');
            mid.insertBefore(v3.canvas, canvas);
            canvas.style.opacity = '0';                 /* the 2D canvas stays on top as the tap target */
            var r = mid.getBoundingClientRect();
            v3.resize(r.width, r.height);
            if (v3.setRound) v3.setRound(round, variant);
            playPace.reset(); watch.reset(); lastDrawAt = performance.now(); watchQuality();
            cfg.view3d = true;
            if (phase === 'playing' || phase === 'countdown') draw(); else if (phase === 'menu') menu(); else startIdle();
          }).catch(function () { fail3d('create'); });
        } catch (e) { fail3d('create'); }
      }
      /* a stage quality step (SL3D.onQuality) restarts the shell's watchdog: the stage
         gets to finish its own ladder (and its own 2D verdict) first */
      function watchQuality() {
        unwatchQuality();
        try { var S = window.SL3D; if (S && typeof S.onQuality === 'function') unsubQ = S.onQuality(function () { watch.reset(); }); } catch (e) { unsubQ = null; }
      }
      function unwatchQuality() { if (unsubQ) { try { unsubQ(); } catch (e) {} unsubQ = null; } }
      function fail3d(reason) {
        v3failed = true; stopIdle(); unwatchQuality();
        if (v3) { try { v3.dispose(); } catch (e) {} if (v3.canvas && v3.canvas.parentNode) v3.canvas.parentNode.removeChild(v3.canvas); v3 = null; }
        canvas.style.opacity = '';
        if (reason !== 'qa') { try { sessionStorage.setItem('slNo3dGame', '1'); } catch (e) {} }
        if (!exited) draw();
      }
      if (def.hud && def.hud.mount) { try { hudObj = def.hud.mount(mid, cfg, api); } catch (e) { hudObj = null; } }
      if (hudObj) hudEl.style.display = 'none';

      var ready = def.preload ? def.preload(cfg) : Promise.resolve();
      setScreen('<p>Loading…</p>');
      var ready3d = load3d().then(function (m) { v3mod = m; if (!m) cfg.view3d = false; });
      /* wait for 3D briefly so the menu can open in 3D; a slow load just keeps 2D */
      Promise.all([Promise.resolve(ready), Promise.race([ready3d, new Promise(function (r) { setTimeout(r, 2500); })])]).then(function () {
        if (exited) return;
        resize(); menu();
        if (v3mod) mount3d(); else ready3d.then(function () { if (!exited && v3mod && !v3) mount3d(); });
      });

      /* QA hook (inert unless localStorage.slQaMode === '1') */
      try {
        if (localStorage.getItem('slQaMode') === '1') {
          window._slGame = { phase: function () { return phase; }, round: function () { return round; }, advance: function (sec) { var n = Math.round(sec / 0.05); for (var i = 0; i < n; i++) advance(0.05); draw(); }, beginRound: beginRound, pause: pause, exit: exit, variant: function () { return variant; }, view: function () { return v3 ? '3d' : '2d'; }, v3: function () { return v3; }, force2d: function () { fail3d('qa'); }, hud: function () { return hudObj; }, watch: function () { return watch.stats(); } };
          /* always the live held-input object (beginRound replaces it) */
          Object.defineProperty(window._slGame, 'held', { get: function () { return held; } });
        }
      } catch (e) {}
      return { exit: exit };
    }

    /* ---------- non-interactive preview (shop) ---------- */
    function demo(host, opts) {
      opts = opts || {};
      var canvas = document.createElement('canvas');
      canvas.width = def.LW; canvas.height = def.LH;
      canvas.setAttribute('aria-label', 'Preview of ' + def.title);
      host.appendChild(canvas);
      var label = document.createElement('div');
      label.textContent = 'PREVIEW';
      label.style.cssText = 'position:absolute;left:10px;top:10px;background:rgba(0,0,0,.55);color:#fff;font-weight:800;font-size:12px;border-radius:999px;padding:2px 10px;';
      host.appendChild(label);
      var ctx = canvas.getContext('2d');
      var cfg = { variant: opts.variant || null, pet: opts.pet || { id: 'pet_puppy', name: 'Biscuit', acc: {} }, ball: null, stadium: null, kart: null, demo: true, reduced: true };
      var api = { sound: function () {}, reduced: true, LW: def.LW, LH: def.LH };
      var round = null, raf = 0, last = 0, t = 0, acc = 0, stopped = false;
      Promise.resolve(def.preload ? def.preload(cfg) : null).then(function () {
        if (stopped) return;
        round = def.newRound(api, cfg.variant || def.defaultVariant, cfg);
        if (def.countdown && round.skipCountdown) round.skipCountdown();
        last = performance.now();
        raf = requestAnimationFrame(loop);
      });
      function loop(now) {
        var dt = Math.min(MAX_FRAME, (now - last) / 1000); last = now; t += dt;
        acc += dt;
        while (acc >= STEP) { if (round.autopilot) round.autopilot(STEP); round.step(STEP, round.autoHeld || {}); acc -= STEP; }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        round.render(ctx);
        if (t < (opts.seconds || 7) && !round.done && !stopped) raf = requestAnimationFrame(loop);
        else { ctx.fillStyle = 'rgba(19,12,46,.6)'; ctx.fillRect(0, 0, def.LW, def.LH); ctx.fillStyle = '#fff'; ctx.font = '800 40px "Baloo 2", sans-serif'; ctx.textAlign = 'center'; ctx.fillText(opts.endText || 'Buy it to play!', def.LW / 2, def.LH / 2); }
      }
      return function stop() { stopped = true; if (raf) cancelAnimationFrame(raf); };
    }

    var g = { start: start, demo: demo, def: def };
    window.SLGames[def.key] = g;
    return g;
  }

  /* deterministic RNG for fair, varied layouts */
  function rng(seed) {
    var s = (seed >>> 0) || 1;
    return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  }
  /* SVG string → Image (resolves when decoded) */
  function svgImage(svgStr) {
    return new Promise(function (res) {
      var img = new Image();
      img.onload = function () { res(img); };
      img.onerror = function () { res(null); };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgStr);
    });
  }

  window.SLGameShell = { define: define, rng: rng, svgImage: svgImage, STEP: STEP, makePacer: makePacer, makeFrameWatch: makeFrameWatch, verdict2d: verdict2d };
})();
