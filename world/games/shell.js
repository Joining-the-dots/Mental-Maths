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
      '.slg-top .hud{font-weight:800;font-size:16px;background:rgba(255,255,255,.12);border-radius:999px;padding:4px 12px;white-space:nowrap;}',
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
      '.slg-scr{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px;background:rgba(19,12,46,.94);text-align:center;padding:18px;z-index:5;overflow:auto;}',
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
      '.slg-rot{display:none;position:absolute;left:50%;top:14px;transform:translateX(-50%);background:rgba(255,255,255,.12);border:2px dashed rgba(255,255,255,.35);border-radius:999px;padding:6px 14px;font-weight:800;font-size:15px;white-space:nowrap;pointer-events:none;z-index:2;}',
      '@media (orientation: portrait) and (max-width: 760px){.slg-rot{display:block;}}',
      '@media (prefers-reduced-motion: reduce){.slg-pb{animation:none;}}'
    ].join('\n');
    document.head.appendChild(c);
  }

  /* ---------- sound helpers (respect the app's mute) ---------- */
  function makeSound(cfg) {
    return function (name, vol) {
      try {
        if (cfg.muted && cfg.muted()) return;
        if (name === 'correct' || name === 'wrong' || name === 'unlock' || name === 'fanfare' || name === 'tick') { if (typeof playSfx === 'function') playSfx(name); return; }
        if (typeof slSample === 'function' && slSample(name, vol == null ? 0.8 : vol)) return;
        if (typeof getAudioCtx === 'function' && typeof _beep === 'function') {
          var ctx = getAudioCtx(); if (!ctx) return;
          var t = ctx.currentTime;
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
      var sound = makeSound(cfg);
      var reduced = !!cfg.reduced;
      var root = el('div', 'slg');
      root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', def.title);
      root.innerHTML =
        '<div class="slg-top"><span class="ttl">' + def.emoji + ' ' + esc(def.title) + '</span><span class="hud" id="slgHud" aria-live="off"></span>' +
        '<button class="slg-b" type="button" id="slgSound" aria-label="Sound on or off"></button>' +
        '<button class="slg-b" type="button" id="slgPause" aria-label="Pause">⏸</button>' +
        '<button class="slg-b" type="button" id="slgExit" aria-label="Back to my island">🏝️ Exit</button></div>' +
        '<div class="slg-mid" id="slgMid"><canvas class="slg-canvas" id="slgCanvas"></canvas><div class="slg-rot" aria-hidden="true">📱↻ Turn sideways for a bigger view</div><div class="slg-touch" id="slgTouch"></div></div>';
      document.body.appendChild(root);
      var mid = root.querySelector('#slgMid'), canvas = root.querySelector('#slgCanvas'), ctx = canvas.getContext('2d');
      var hudEl = root.querySelector('#slgHud'), soundBtn = root.querySelector('#slgSound'), pauseBtn = root.querySelector('#slgPause');
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
        draw();
      }
      var ro = (typeof ResizeObserver !== 'undefined') ? new ResizeObserver(resize) : null;
      if (ro) ro.observe(mid); else window.addEventListener('resize', resize, sig);
      window.addEventListener('orientationchange', function () { setTimeout(resize, 200); }, sig);

      /* ---------- state machine ---------- */
      var phase = 'menu';          /* menu | tutorial | countdown | playing | paused | results | timeup */
      var variant = cfg.variant;
      var round = null, raf = 0, last = 0, acc = 0, countT = 0, playSecAcc = 0, hardStop = Infinity, graceNote = false;
      var screen = null, banner = null;
      var held = {};

      function setScreen(html) {
        if (screen) screen.remove();
        screen = null;
        if (html == null) return;
        screen = el('div', 'slg-scr', html);
        mid.appendChild(screen);
        var f = screen.querySelector('.slg-b.go') || screen.querySelector('button');
        if (f) setTimeout(function () { try { f.focus(); } catch (e) {} }, 30);
        return screen;
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
        return '🏆 Your best: ' + (rec.ms != null ? (rec.ms / 1000).toFixed(2) + ' s' : rec.score);
      }
      function menu() {
        phase = 'menu'; stopLoop(); setBanner(null); renderTouch(false);
        var vars = (cfg.ownedVariants || []);
        var vhtml = vars.length > 1 ? '<div class="row">' + vars.map(function (v) { return '<button class="slg-var' + (v.id === variant ? ' on' : '') + '" type="button" data-var="' + esc(v.id) + '">' + esc(v.name) + '</button>'; }).join('') + '</div>' : '';
        var sc = setScreen('<div style="font-size:54px;">' + def.emoji + '</div><h2>' + esc(def.title) + '</h2>' + vhtml + '<p>' + esc(pbLine()) + '</p>' +
          '<div class="row"><button class="slg-b go" type="button" id="slgPlay">▶ Play</button><button class="slg-b" type="button" id="slgHow">❓ How to play</button></div>');
        sc.querySelectorAll('[data-var]').forEach(function (b) { b.addEventListener('click', function () { variant = b.dataset.var; if (cfg.onSelectVariant) cfg.onSelectVariant(variant); menu(); }); });
        sc.querySelector('#slgPlay').addEventListener('click', function () { cfg.tutSeen ? beginRound() : tutorial(); });
        sc.querySelector('#slgHow').addEventListener('click', tutorial);
        drawIdle();
      }
      function tutorial() {
        phase = 'tutorial';
        var sc = setScreen('<h2>How to play</h2><div class="slg-tut">' + def.tutorial.map(function (t) { return '<div><b>' + t[0] + '</b>' + esc(t[1]) + '</div>'; }).join('') + '</div>' +
          '<div class="row"><button class="slg-b go" type="button" id="slgGotIt">Got it — let’s go!</button><button class="slg-b" type="button" id="slgBack">Back</button></div>');
        sc.querySelector('#slgGotIt').addEventListener('click', function () { if (!cfg.tutSeen) { cfg.tutSeen = true; if (cfg.onTutorialSeen) cfg.onTutorialSeen(); } beginRound(); });
        sc.querySelector('#slgBack').addEventListener('click', menu);
      }
      function timeUpScreen(afterRound) {
        phase = 'timeup'; stopLoop(); setBanner(null); renderTouch(false);
        var sc = setScreen('<div style="font-size:54px;">⏱️</div><h2>That’s all the game time for today</h2><p>' + (afterRound ? 'Great finish! ' : '') + 'Your games are still yours — come back tomorrow. 📚 Learning is open whenever you like.</p>' +
          '<div class="row"><button class="slg-b go" type="button" id="slgOut">🏝️ Back to my island</button></div>');
        sc.querySelector('#slgOut').addEventListener('click', exit);
      }
      function beginRound() {
        var gate = cfg.arcade ? cfg.arcade.gate() : { allowed: true, hardStopAtUsed: Infinity };
        if (!gate.allowed) return timeUpScreen(false);
        hardStop = gate.hardStopAtUsed; graceNote = false;
        setScreen(null); setBanner(null);
        round = def.newRound(api, variant, cfg);
        held = {};
        renderTouch(true);
        acc = 0; playSecAcc = 0;
        if (def.countdown) { phase = 'countdown'; countT = def.countdown; } else phase = 'playing';
        var st = cfg.arcade && cfg.arcade.status();
        if (st && st.limited && st.warn) setBanner('⏱️ About 1 minute of game time left today');
        startLoop();
      }
      function finishRound() {
        if (!round || phase === 'results') return;
        phase = 'results'; stopLoop(); renderTouch(false); setBanner(null);
        if (cfg.arcade) cfg.arcade.flush();
        var res = round.result();
        var sc = setScreen('<h2>' + esc(round.summaryTitle ? round.summaryTitle() : 'Finished!') + '</h2><div class="slg-big">' + esc(round.summaryBig()) + '</div><p>' + esc(round.summaryText ? round.summaryText() : '') + '</p><div id="slgPbSlot" style="min-height:40px;"></div><p style="font-size:13px;opacity:.75;margin:0 0 8px;">🎮 Game scores don’t earn or spend ⭐ — learning earns ⭐.</p>' +
          '<div class="row"><button class="slg-b go" type="button" id="slgAgain">↻ Play again</button>' +
          ((cfg.ownedVariants || []).length > 1 ? '<button class="slg-b" type="button" id="slgMenu">🗺️ Change course</button>' : '') +
          '<button class="slg-b alt" type="button" id="slgHome">🏝️ Back to my island</button></div>');
        sc.querySelector('#slgAgain').addEventListener('click', beginRound);
        var mb = sc.querySelector('#slgMenu'); if (mb) mb.addEventListener('click', menu);
        sc.querySelector('#slgHome').addEventListener('click', exit);
        if (res && cfg.onResult) {
          Promise.resolve(cfg.onResult(variant, res)).then(function (r) {
            var slot = sc.querySelector('#slgPbSlot'); if (!slot) return;
            if (r && r.isPB) {
              slot.innerHTML = '<span class="slg-pb">🏆 NEW PERSONAL BEST!</span>';
              sound('fanfare');
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
        /* a finger still tapping the game mustn't hit Play again / Exit by accident */
        sc.querySelectorAll('button').forEach(function (b) { if (!b.disabled) { b.disabled = true; setTimeout(function () { if (!b.dataset.stay) b.disabled = false; }, 650); } });
      }
      function pause() {
        if (phase !== 'playing' && phase !== 'countdown') return;
        var was = phase; phase = 'paused'; stopLoop(); held = {}; renderTouchHeld();
        var sc = setScreen('<div style="font-size:54px;">⏸</div><h2>Paused</h2><p>Take your time.</p><div class="row"><button class="slg-b go" type="button" id="slgResume">▶ Resume</button><button class="slg-b" type="button" id="slgRestart">↻ Restart</button><button class="slg-b alt" type="button" id="slgQuit">🏝️ Exit</button></div>');
        sc.querySelector('#slgResume').addEventListener('click', function () {
          setScreen(null);
          if (was === 'playing') { phase = 'countdown'; countT = Math.max(countT, 2); } else phase = was;
          startLoop();
        });
        sc.querySelector('#slgRestart').addEventListener('click', beginRound);
        sc.querySelector('#slgQuit').addEventListener('click', exit);
      }
      pauseBtn.addEventListener('click', function () { if (phase === 'paused') { var r = screen && screen.querySelector('#slgResume'); if (r) r.click(); } else pause(); }, sig);
      document.addEventListener('visibilitychange', function () { if (document.hidden) pause(); }, sig);
      window.addEventListener('blur', function () { pause(); }, sig);

      /* ---------- loop ---------- */
      function startLoop() { stopLoop(); last = performance.now(); raf = requestAnimationFrame(frame); }
      function stopLoop() { if (raf) cancelAnimationFrame(raf); raf = 0; }
      function frame(now) {
        raf = 0;
        var dt = Math.min(MAX_FRAME, Math.max(0, (now - last) / 1000));
        last = now;
        advance(dt);
        draw();
        if (phase === 'playing' || phase === 'countdown') raf = requestAnimationFrame(frame);
      }
      /* exposed for automated QA: advance the simulation by real seconds */
      function advance(dt) {
        if (phase === 'countdown') {
          var before = Math.ceil(countT);
          countT -= dt;
          if (Math.ceil(countT) !== before && countT > 0) sound('beep');
          if (countT <= 0) { phase = 'playing'; sound('go'); }
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
        if (!round) { drawIdle(); return; }
        begin();
        round.render(ctx);
        ctx.restore();
        if (hudEl && round.hud) hudEl.textContent = round.hud();
        var cnt = mid.querySelector('.slg-count');
        if (phase === 'countdown') {
          if (!cnt) { cnt = el('div', 'slg-count'); mid.appendChild(cnt); }
          cnt.textContent = Math.max(1, Math.ceil(countT));
        } else if (cnt) cnt.remove();
      }
      function drawIdle() {
        begin();
        if (def.idle) def.idle(ctx, cfg); else { ctx.fillStyle = '#2a1b5e'; ctx.fillRect(0, 0, def.LW, def.LH); }
        ctx.restore();
        hudEl.textContent = '';
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
        if (!show || !def.controls) return;
        var left = el('div', 'grp'), right = el('div', 'grp');
        def.controls.forEach(function (c) {
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
        });
        touchHost.appendChild(left); touchHost.appendChild(right);
      }
      function renderTouchHeld() { touchHost.querySelectorAll('[data-ctl]').forEach(function (b) { b.classList.toggle('on', !!held[b.dataset.ctl]); }); }

      /* ---------- exit / cleanup ---------- */
      var exited = false;
      function exit() {
        if (exited) return; exited = true;
        stopLoop();
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
      var ready = def.preload ? def.preload(cfg) : Promise.resolve();
      setScreen('<p>Loading…</p>');
      Promise.resolve(ready).then(function () { if (!exited) { resize(); menu(); } });

      /* QA hook (inert unless localStorage.slQaMode === '1') */
      try {
        if (localStorage.getItem('slQaMode') === '1') {
          window._slGame = { phase: function () { return phase; }, round: function () { return round; }, advance: function (sec) { var n = Math.round(sec / 0.05); for (var i = 0; i < n; i++) advance(0.05); draw(); }, beginRound: beginRound, pause: pause, exit: exit, held: held, variant: function () { return variant; } };
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

  window.SLGameShell = { define: define, rng: rng, svgImage: svgImage, STEP: STEP };
})();
