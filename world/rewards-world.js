/* ================================================================
   My Island — the rewards world UI.
   Loaded lazily by index.html (slLoadWorld) when the 🏝️ tab opens.
   Reads/writes the existing profile model (state/ensureUser/saveState)
   through the commit protocol in world-core.js. Never awards points.
   ================================================================ */
(function () {
  'use strict';
  var C = window.SLWorldCore, ART = window.SLWorldArt;
  if (!C || !ART) return;
  var CH = ART.CH, COLS = C.COLS, ROWS = C.ROWS;
  var PAD = 80;                               /* sky above row 0 for tall sprites */
  var STAGE_W = COLS * 100, STAGE_H = ROWS * CH + PAD, GROUND_H = ROWS * CH;
  var STORAGE_KEY = 'timesTableQuest_v1';
  var reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* ---------------- tiny utils ---------------- */
  function $(sel, el) { return (el || document).querySelector(sel); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(n) { return (n || 0).toLocaleString('en-GB'); }
  function pct(v, of) { return (v / of * 100).toFixed(4) + '%'; }
  function newTx() {
    var a = new Uint8Array(9);
    (window.crypto || window.msCrypto).getRandomValues(a);
    return 'tx_' + Date.now().toString(36) + '_' + Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }
  function sfx(name) { try { if (typeof playSfx === 'function') playSfx(name); } catch (e) {} }
  function sample(name, vol) { try { if (typeof slSample === 'function') return slSample(name, vol); } catch (e) {} return false; }
  function me() { try { return ensureUser(); } catch (e) { return null; } }
  function W() { var u = me(); return u ? C.ensureWorld(u) : null; }

  /* ---------------- commit protocol (lock + fresh read + verify) ---------------- */
  function adapter() {
    var prev = null;
    return {
      read: function () { return JSON.parse(localStorage.getItem(STORAGE_KEY)); },
      write: function (st) {
        /* saveState() swallows storage errors, so remember what memory held:
           if the read-back can't find the change, rollback() puts it all back */
        prev = {};
        Object.keys(st).forEach(function (k) { prev[k] = state[k]; state[k] = st[k]; });
        saveState();
      },
      rollback: function () {
        if (!prev) return;
        Object.keys(prev).forEach(function (k) { state[k] = prev[k]; });
        prev = null;
      }
    };
  }
  /* If this tab was the last writer, flush its in-memory profile first so
     nothing it holds (e.g. telemetry) is lost; if another tab wrote since,
     never overwrite — the fresh read below takes theirs. */
  function flushIfCurrent() {
    try {
      var stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
      var name = state.activeUser;
      var mem = state.users[name], disk = stored && stored.users && stored.users[name];
      if (mem && (!disk || (mem._localUpdatedAt || 0) >= (disk._localUpdatedAt || 0))) saveState();
    } catch (e) {}
  }
  function withLock(fn) {
    if (navigator.locks && navigator.locks.request) return navigator.locks.request('sl-world-commit', function () { return fn(); });
    return Promise.resolve().then(fn);
  }
  function commit(mutate) {
    var name = state.activeUser;
    return withLock(function () {
      flushIfCurrent();
      return C.transact(adapter(), name, mutate, function () { return true; });
    }).then(function (res) { afterCommit(); return res; });
  }
  function commitPurchase(id, tx) {
    var name = state.activeUser;
    return withLock(function () {
      flushIfCurrent();
      return C.transactPurchase(adapter(), name, id, { tx: tx });
    }).then(function (res) { afterCommit(); return res; });
  }
  function afterCommit() {
    try { if (typeof updatePointsDisplay === 'function') updatePointsDisplay(); } catch (e) {}
  }

  /* ---------------- module state ---------------- */
  var root = null, renderedFor = null;
  var mode = 'play';                     /* 'play' | 'edit' | 'place' */
  var placing = null;                    /* {id, uid, x, y, ox, oy, fromBuy} */
  var selectedUid = null;
  var lastUndo = null;
  var lit = {};                          /* uid -> lights on */
  var pendingTx = {};                    /* itemId -> tx kept for retries */
  var buying = false, confirming = false;
  var petTimers = [];
  /* "now" for the game-time day: server time (HTTP Date header) or the clock at
     load, carried forward by the monotonic performance clock — so changing the
     device clock while the app is open can't jump to a fresh day */
  var timeAnchor = { at: Date.now(), perf: (window.performance && performance.now) ? performance.now() : 0, server: false };

  /* ---------------- styles ---------------- */
  function injectCss() {
    if (document.getElementById('slwCss')) return;
    var css = document.createElement('style');
    css.id = 'slwCss';
    css.textContent = [
      '.slw{max-width:1120px;margin:0 auto;padding:0 4px 18px;font-family:inherit;}',
      '.slw-hud{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:4px 0 10px;}',
      '.slw-learn{background:linear-gradient(135deg,#6c5ce7,#a86ff0);color:#fff;border:none;border-radius:999px;padding:10px 18px;font:inherit;font-weight:800;font-size:15px;cursor:pointer;box-shadow:0 4px 14px rgba(108,92,231,.35);}',
      '.slw-pts{background:linear-gradient(135deg,#ffe27a,#ffb347);color:#5a3700;border-radius:999px;padding:8px 16px;font-family:"Baloo 2",sans-serif;font-weight:800;font-size:18px;}',
      '.slw-goal{flex:1;min-width:200px;display:flex;align-items:center;gap:8px;background:#fff;border:2px solid #f2e2a8;border-radius:14px;padding:6px 10px;cursor:pointer;font:inherit;text-align:left;}',
      '.slw-goal .gi{width:36px;height:36px;flex:0 0 36px;}.slw-goal .gi svg{width:100%;height:100%;}',
      '.slw-goal .gb{height:10px;background:#f3eedf;border-radius:999px;overflow:hidden;margin-top:3px;}.slw-goal .gb>i{display:block;height:100%;background:linear-gradient(90deg,#ffd166,#ff9f43);border-radius:999px;}',
      '.slw-goal .gt{font-size:12.5px;font-weight:800;color:#6b5a22;}.slw-goal.ready{border-color:#2ecc71;background:#eafaf0;}.slw-goal.ready .gt{color:#1d8a4c;}',
      '.slw-acts{display:flex;gap:6px;flex-wrap:wrap;}',
      '.slw-btn{border:2px solid #d9d2ee;background:#fff;color:#4a3f75;border-radius:12px;padding:8px 12px;font:inherit;font-weight:800;font-size:14px;cursor:pointer;min-height:42px;}',
      '.slw-btn.on{background:#6c5ce7;border-color:#6c5ce7;color:#fff;}',
      '.slw-btn.big{font-size:16px;padding:10px 16px;}',
      '.slw-btn:focus-visible,.slw-obj:focus-visible,.slw-cell:focus-visible{outline:3px solid #ffd23f;outline-offset:2px;}',
      '.slw-stagewrap{position:relative;border-radius:22px;overflow:hidden;box-shadow:0 10px 30px rgba(30,60,120,.25);background:#7fd6ff;}',
      '.slw-stage{position:relative;width:100%;aspect-ratio:' + STAGE_W + '/' + STAGE_H + ';touch-action:manipulation;user-select:none;-webkit-user-select:none;}',
      /* phones: keep island squares finger-sized (~47px) and let the island pan sideways */
      '@media (max-width: 700px){.slw-stagewrap{overflow-x:auto;overflow-y:hidden;overscroll-behavior-x:contain;-webkit-overflow-scrolling:touch;}.slw-stage{width:760px;}.slw-pan{display:block !important;}}',
      '.slw-pan{display:none;text-align:center;font-size:12.5px;font-weight:800;color:#6b6390;margin:6px 0 0;}',
      '.slw-ground{position:absolute;left:0;right:0;bottom:0;height:' + (GROUND_H / STAGE_H * 100).toFixed(4) + '%;}.slw-ground svg{position:absolute;inset:0;width:100%;height:100%;}',
      '.slw-obj{position:absolute;padding:0;border:none;background:none;cursor:default;display:block;}',
      '.slw-obj svg{width:100%;height:100%;display:block;overflow:visible;}',
      'button.slw-obj{cursor:pointer;}',
      '.slw-obj.path{z-index:2;}',
      '.slw-tag{position:absolute;left:50%;transform:translateX(-50%);bottom:-6%;white-space:nowrap;font-family:"Baloo 2",sans-serif;font-weight:800;font-size:clamp(10px,1.3vw,14px);padding:2px 9px;border-radius:999px;pointer-events:none;}',
      '.slw-tag.play{background:#ffd23f;color:#4a3200;box-shadow:0 2px 8px rgba(0,0,0,.25);animation:slwPulse 1.8s infinite;}',
      '.slw-tag.lockg{background:#4a4468;color:#fff;}',
      '.slw-dot{position:absolute;right:8%;top:30%;width:clamp(14px,1.8vw,22px);height:clamp(14px,1.8vw,22px);border-radius:50%;background:#fff;border:2px solid #6c5ce7;display:flex;align-items:center;justify-content:center;font-size:clamp(8px,1vw,12px);pointer-events:none;}',
      '.slw-new{position:absolute;left:50%;top:-4%;transform:translateX(-50%);background:#ff5c8a;color:#fff;font-weight:800;font-size:clamp(9px,1.1vw,12px);border-radius:999px;padding:1px 8px;pointer-events:none;animation:slwPulse 1.4s infinite;}',
      '.slw-new.base{top:auto;bottom:2%;}',
      '@media (pointer: coarse){.slw-kbhint{display:none;}}',
      '@keyframes slwPulse{0%,100%{transform:translateX(-50%) scale(1);}50%{transform:translateX(-50%) scale(1.08);}}',
      '.slw-sign{position:absolute;transform:translate(-50%,-50%);background:rgba(40,34,70,.85);color:#fff;border:2px solid rgba(255,255,255,.6);border-radius:14px;padding:6px 10px;font:inherit;font-weight:800;font-size:clamp(10px,1.3vw,14px);cursor:pointer;z-index:900;text-align:center;line-height:1.2;}',
      '.slw-pet{position:absolute;z-index:500;width:' + pct(90, STAGE_W) + ';cursor:pointer;background:none;border:none;padding:0;transition-property:left,top;transition-timing-function:linear;}',
      '.slw-pet svg{width:100%;height:auto;display:block;}.slw-pet.flip svg{transform:scaleX(-1);}',
      '.slw-pet.hop{animation:slwHop .6s ease-out;}',
      '@keyframes slwHop{0%,100%{translate:0 0;}35%{translate:0 -38%;}}',
      '.slw-pet .nm{position:absolute;left:50%;bottom:100%;transform:translateX(-50%);font-size:clamp(9px,1.1vw,12px);font-weight:800;background:#fff;border-radius:999px;padding:1px 7px;color:#4a3f75;white-space:nowrap;opacity:0;transition:opacity .3s;pointer-events:none;}',
      '.slw-pet:hover .nm,.slw-pet.say .nm,.slw-pet:focus-visible .nm{opacity:1;}',
      '.slw-me{position:absolute;z-index:480;width:' + pct(70, STAGE_W) + ';pointer-events:auto;cursor:pointer;background:none;border:none;padding:0;}',
      '.slw-me svg{width:100%;height:auto;display:block;}.slw-me .face{position:absolute;left:50%;top:6%;transform:translateX(-50%);font-size:clamp(14px,2.4vw,30px);line-height:1;}',
      '.slw-me.wave{animation:slwHop .6s ease-out;}',
      '.slw-fx{position:absolute;pointer-events:none;z-index:950;font-size:clamp(16px,2.6vw,30px);animation:slwFloat 1.1s ease-out forwards;}',
      '@keyframes slwFloat{0%{opacity:1;transform:translate(-50%,0) scale(.6);}100%{opacity:0;transform:translate(-50%,-140%) scale(1.3);}}',
      '.slw-bounce{animation:slwBounceObj .7s ease-out;}@keyframes slwBounceObj{0%,100%{transform:scaleY(1);}30%{transform:scaleY(.82);}60%{transform:scaleY(1.06);}}',
      '.slw-wiggle{animation:slwWiggle .5s;}@keyframes slwWiggle{25%{transform:rotate(-4deg);}75%{transform:rotate(4deg);}}',
      '.slw-wave{animation:slwWave 4s ease-in-out infinite;}@keyframes slwWave{0%,100%{transform:translateX(0);opacity:.7;}50%{transform:translateX(10px);opacity:.3;}}',
      '.slw-spin{animation:slwSpin 6s linear infinite;}.slw-spin.fast{animation-duration:.7s;}@keyframes slwSpin{to{transform:rotate(360deg);}}',
      '.slw-flag{animation:slwFlag 2.4s ease-in-out infinite;transform-origin:left center;}.slw-flag.fast{animation-duration:.4s;}@keyframes slwFlag{0%,100%{transform:skewY(0);}50%{transform:skewY(-6deg) scaleX(.94);}}',
      '.slw-swing.go{animation:slwSwing 1.6s ease-in-out 2;}@keyframes slwSwing{25%{transform:rotate(18deg);}75%{transform:rotate(-18deg);}}',
      '.slw-water{transform-origin:50px 74px;}.slw-water.go{animation:slwWater .9s ease-out 2;}@keyframes slwWater{50%{transform:scaleY(1.6);}}',
      '.slw-bubbles{opacity:.8;}.slw-bubbles.go{animation:slwBub 1.8s ease-out;}@keyframes slwBub{0%{transform:translateY(0);opacity:1;}100%{transform:translateY(-60px);opacity:0;}}',
      '.slw-twinkle{animation:slwTw 1.6s infinite;}@keyframes slwTw{50%{opacity:.35;}}',
      '.slw-smoke{animation:slwSmoke 3s ease-out infinite;}@keyframes slwSmoke{0%{transform:translateY(8px);opacity:.9;}100%{transform:translateY(-10px);opacity:0;}}',
      '.slw-cell{position:absolute;border:2px dashed rgba(255,255,255,.55);border-radius:10px;background:rgba(255,255,255,.08);z-index:600;padding:0;cursor:pointer;}',
      '.slw-cell.ok{background:rgba(46,204,113,.45);border:3px solid #2ecc71;}',
      '.slw-cell.bad{background:rgba(231,76,60,.42);border:3px solid #e74c3c;}',
      '.slw-cell.door{background:rgba(255,210,63,.25);border-color:#ffd23f;}',
      '.slw-ghost{position:absolute;z-index:650;opacity:.82;pointer-events:none;filter:drop-shadow(0 6px 10px rgba(0,0,0,.3));}',
      '.slw-ghost.bad{opacity:.5;filter:grayscale(.6) drop-shadow(0 6px 10px rgba(0,0,0,.3));}',
      '.slw-ghost svg{width:100%;height:100%;display:block;}',
      '.slw-edit .slw-obj{cursor:pointer;}',
      '.slw-obj.sel{filter:drop-shadow(0 0 6px #ffd23f) drop-shadow(0 0 3px #ffd23f);}',
      '.slw-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;justify-content:center;background:#fff;border-radius:16px;padding:10px;margin-top:10px;box-shadow:0 4px 16px rgba(0,0,0,.08);}',
      '.slw-bar .msg{font-weight:800;color:#4a3f75;font-size:14px;flex:1 1 220px;text-align:center;}',
      '.slw-bar .msg.bad{color:#c0392b;}',
      '.slw-tray{display:flex;gap:8px;overflow-x:auto;padding:8px 2px;}',
      '.slw-trayitem{flex:0 0 auto;width:86px;border:2px solid #e8e2f6;border-radius:14px;background:#fff;padding:6px;cursor:pointer;font:inherit;position:relative;}',
      '.slw-trayitem svg{width:100%;height:56px;display:block;}.slw-trayitem b{position:absolute;right:6px;top:4px;background:#6c5ce7;color:#fff;border-radius:999px;font-size:11px;padding:0 7px;}',
      '.slw-trayitem span{display:block;font-size:11px;font-weight:800;color:#4a3f75;margin-top:2px;}',
      '.slw-legend{display:flex;gap:14px;flex-wrap:wrap;justify-content:center;font-size:12.5px;font-weight:700;color:var(--ink-soft,#7c8696);margin-top:8px;}',
      '.slw-legend span{display:inline-flex;align-items:center;gap:5px;}',
      '.slw-legend i{font-style:normal;display:inline-block;padding:1px 8px;border-radius:999px;font-size:11px;font-weight:800;}',
      /* overlays */
      '.slw-ov{position:fixed;inset:0;z-index:9000;background:rgba(30,24,58,.55);display:flex;align-items:center;justify-content:center;padding:12px;}',
      '.slw-sheet{background:#fff;border-radius:22px;max-width:960px;width:100%;max-height:92vh;overflow:auto;box-shadow:0 16px 50px rgba(0,0,0,.3);padding:16px 16px 18px;position:relative;}',
      '.slw-sheet.small{max-width:440px;}',
      '.slw-sheet h2{margin:0 0 6px;font-family:"Baloo 2",sans-serif;padding-right:44px;}',   /* clear of the ✕ */
      '.slw-x{position:absolute;right:10px;top:10px;width:42px;height:42px;border-radius:50%;border:none;background:#f1edfb;font-size:20px;cursor:pointer;}',
      '.slw-cats{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0 10px;}',
      '.slw-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px;}',
      '.slw-card{border:2px solid #ece6f8;border-radius:16px;padding:10px;display:flex;flex-direction:column;gap:5px;background:#fff;position:relative;}',
      '.slw-card .ic{height:92px;display:flex;align-items:center;justify-content:center;background:linear-gradient(180deg,#eef9ff,#f7fff2);border-radius:12px;cursor:pointer;border:none;padding:4px;}',
      '.slw-card .ic svg{max-height:84px;max-width:100%;}',
      '.slw-card .nm{font-weight:800;font-size:14.5px;color:#2c2550;}',
      '.slw-card .ds{font-size:12px;color:#6b6585;line-height:1.35;min-height:32px;}',
      '.slw-card .pr{font-family:"Baloo 2",sans-serif;font-weight:800;color:#b9821a;font-size:15px;}',
      '.slw-card .chip{font-size:11px;font-weight:800;border-radius:999px;padding:2px 8px;align-self:flex-start;}',
      '.chip.own{background:#e5f6ea;color:#1e7d3f;}.chip.lock{background:#efeaf9;color:#5a4fd0;}.chip.rep{background:#fff3d9;color:#8a6100;}.chip.uni{background:#e8f4ff;color:#1f5f9e;}',
      '.slw-card .row{display:flex;gap:6px;margin-top:auto;}',
      '.slw-buy{flex:1;border:none;border-radius:12px;padding:9px 8px;font:inherit;font-weight:800;font-size:14px;cursor:pointer;background:linear-gradient(135deg,#2ecc71,#27ae60);color:#fff;min-height:42px;}',
      '.slw-buy[disabled]{background:#e4e0ee;color:#4f4870;cursor:not-allowed;}',
      '.slw-goalbtn{border:2px solid #ffd166;background:#fffaf0;border-radius:12px;padding:6px 9px;font:inherit;font-weight:800;cursor:pointer;min-height:42px;}',
      '.slw-goalbtn.on{background:#ffd166;}',
      '.slw-need{font-size:12px;font-weight:800;color:#8a6100;}',
      '.slw-detail{display:flex;gap:16px;flex-wrap:wrap;}',
      '.slw-detail .big{flex:1 1 260px;min-height:200px;background:linear-gradient(180deg,#eef9ff,#f7fff2);border-radius:16px;display:flex;align-items:center;justify-content:center;padding:10px;position:relative;overflow:hidden;}',
      '.slw-detail .big svg{max-width:100%;max-height:240px;}',
      '.slw-detail .big canvas{width:100%;height:auto;border-radius:12px;display:block;}',
      '.slw-detail .info{flex:1 1 260px;display:flex;flex-direction:column;gap:8px;}',
      '.slw-unlocks{background:#f5f2ff;border-radius:12px;padding:8px 12px;font-size:13px;line-height:1.5;color:#4a3f75;}',
      '.slw-err{color:#c0392b;font-weight:800;font-size:13px;min-height:18px;}',
      '.slw-cele{position:fixed;inset:0;z-index:9500;display:flex;align-items:center;justify-content:center;flex-direction:column;background:radial-gradient(ellipse at center,rgba(49,25,122,.92),rgba(20,11,51,.94));color:#fff;text-align:center;padding:20px;cursor:pointer;}',
      '.slw-cele .t{font-family:"Baloo 2",sans-serif;font-size:clamp(28px,5vw,48px);font-weight:800;line-height:1.1;}',
      '.slw-cele .s{font-size:16px;color:#d9d2f7;margin-top:8px;max-width:520px;}',
      '.slw-cele .ic{width:min(220px,40vw);margin:10px auto;}',
      '.slw-cele .ic svg{width:100%;height:auto;}',
      '.slw-cele .btns{display:flex;gap:10px;margin-top:16px;flex-wrap:wrap;justify-content:center;}',
      '.slw-cele.pop .ic{animation:slwPopIn .7s cubic-bezier(.2,1.6,.4,1);}@keyframes slwPopIn{from{transform:scale(.2);}to{transform:scale(1);}}',
      '.slw-toast{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:9600;background:#2c2550;color:#fff;border-radius:14px;padding:10px 14px;font-weight:800;display:flex;gap:10px;align-items:center;box-shadow:0 8px 24px rgba(0,0,0,.3);max-width:92vw;}',
      '.slw-toast button{border:none;border-radius:10px;background:#ffd23f;color:#4a3200;font:inherit;font-weight:800;padding:6px 10px;cursor:pointer;}',
      '.slw-intro .card{max-width:520px;text-align:center;}',
      '.slw-intro .hero{font-size:64px;line-height:1;margin:6px 0;}',
      '.slw-dots{display:flex;gap:6px;justify-content:center;margin:10px 0;}.slw-dots i{width:10px;height:10px;border-radius:50%;background:#ddd6f3;}.slw-dots i.on{background:#6c5ce7;}',
      '.slw-games{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px;}',
      '.slw-game{border-radius:18px;padding:14px;color:#fff;display:flex;flex-direction:column;gap:6px;min-height:150px;}',
      '.slw-game h3{margin:0;font-family:"Baloo 2",sans-serif;font-size:20px;}',
      '.slw-game .pb{font-size:13px;font-weight:700;opacity:.9;}',
      '.slw-game .slw-btn{margin-top:auto;background:#fff;border-color:#fff;color:#2c2550;}',
      '.slw-game.locked{background:#5f5a7a !important;}',
      '.slw-time{background:#fff8e1;border:2px solid #ffd166;border-radius:12px;padding:8px 12px;font-size:13.5px;font-weight:700;color:#6b5a22;margin-bottom:10px;}',
      '.slw-loading{padding:40px;text-align:center;font-weight:800;color:#6c5ce7;}',
      '@media (max-width:640px){.slw-pts{font-size:16px;padding:6px 12px;}.slw-btn{padding:7px 9px;font-size:13px;}.slw-learn{font-size:14px;padding:8px 12px;}}',
      '@media (prefers-reduced-motion: reduce){.slw-wave,.slw-spin,.slw-flag,.slw-twinkle,.slw-smoke,.slw-tag.play,.slw-new{animation:none !important;}.slw-pet{transition-duration:0s !important;}.slw-cele.pop .ic{animation:none;}}'
    ].join('\n');
    document.head.appendChild(css);
    if (!document.getElementById('slwDefs')) {
      var d = document.createElement('div');
      d.id = 'slwDefs';
      d.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;';
      d.innerHTML = ART.defs();
      document.body.appendChild(d);
    }
  }

  /* ---------------- style state for art ---------------- */
  function artState(w) {
    return {
      wall: C.selected(w, 'wall'), roof: C.selected(w, 'roof'), door: C.selected(w, 'door'), details: w.details,
      course: C.selected(w, 'course'), ball: C.selected(w, 'ball'), stadium: C.selected(w, 'stadium'), kart: C.selected(w, 'kart')
    };
  }

  /* ---------------- top-level render ---------------- */
  function render() {
    root = document.getElementById('worldView');
    if (!root) return;
    injectCss();
    var u = me();
    if (!u) { root.innerHTML = '<div class="slw-loading">Pick a player first 🙂</div>'; return; }
    var w = C.ensureWorld(u);
    /* first visit for this profile: grant the starter island exactly once */
    if (!w.starterGrantedAt || C.normalize(u)) {
      commit(function (fu) {
        var granted = C.grantStarter(fu);
        var fixed = C.normalize(fu);
        return { ok: granted || fixed };
      }).then(function () { draw(); maybeIntro(); });
      root.innerHTML = '<div class="slw-loading">Building your island… 🏝️</div>';
      return;
    }
    draw();
    maybeIntro();
    checkGoalReached(true);
    measureServerTime();
  }

  function draw() {
    if (!root) return;
    var u = me(); if (!u) return;
    var w = C.ensureWorld(u);
    renderedFor = state.activeUser;
    stopPets();
    root.innerHTML =
      '<div class="slw' + (mode !== 'play' ? ' slw-edit' : '') + '">' +
        '<div class="slw-hud">' +
          '<button class="slw-learn" type="button" data-act="learn">📚 Back to learning</button>' +
          '<div class="slw-pts" title="Your spendable points">⭐ <span id="slwPts">' + fmt(u.points) + '</span></div>' +
          goalHtml(u) +
          '<div class="slw-acts">' +
            '<button class="slw-btn big" type="button" data-act="shop">🛍️ Shop</button>' +
            '<button class="slw-btn big" type="button" data-act="games">🎮 Games</button>' +
            '<button class="slw-btn' + (mode === 'edit' ? ' on' : '') + '" type="button" data-act="edit" aria-pressed="' + (mode === 'edit') + '">✏️ ' + (mode === 'edit' ? 'Done' : 'Edit') + '</button>' +
            '<button class="slw-btn" type="button" data-act="pets">🐾 Pets</button>' +
            '<button class="slw-btn" type="button" data-act="sound" aria-label="Sound on or off">' + (u.muted ? '🔇 Off' : '🔊 On') + '</button>' +
            '<button class="slw-btn" type="button" data-act="info" aria-label="How it works">❓</button>' +
          '</div>' +
        '</div>' +
        '<div class="slw-stagewrap"><div class="slw-stage" id="slwStage"></div></div>' +
        '<div class="slw-pan" aria-hidden="true">👆 Swipe the island sideways to see it all</div>' +
        '<div id="slwBar"></div>' +
        '<div class="slw-legend"><span><i style="background:#ffd23f;color:#4a3200;">▶ PLAY</i> tap to play a game</span>' +
          '<span><i style="background:#fff;border:2px solid #6c5ce7;">✋</i> tap to play with it</span>' +
          '<span><i style="background:#4a4468;color:#fff;">🔒</i> unlock in the shop</span>' +
          '<span>Everything else is decoration ✨</span></div>' +
      '</div>';
    drawStage();
    drawBar();
    /* on a phone the island is wider than the screen: start centred on home */
    var wrap = root.querySelector('.slw-stagewrap');
    if (wrap && wrap.scrollWidth > wrap.clientWidth + 4) wrap.scrollLeft = (wrap.scrollWidth - wrap.clientWidth) / 2;
    root.querySelectorAll('[data-act]').forEach(function (b) { b.addEventListener('click', onHudAction); });
    var g = root.querySelector('.slw-goal'); if (g) g.addEventListener('click', function () { if (W().goal) openItem(W().goal); else openShop(); });
  }

  function goalHtml(u) {
    var gp = C.goalProgress(u);
    if (!gp) return '<button class="slw-goal" type="button"><span class="gt">🎯 Pick a savings goal in the shop</span></button>';
    return '<button class="slw-goal' + (gp.ready ? ' ready' : '') + '" type="button" aria-label="Savings goal: ' + esc(gp.name) + '">' +
      '<span class="gi">' + ART.icon(gp.id, artState(C.ensureWorld(u))) + '</span>' +
      '<span style="flex:1;min-width:0;"><span class="gt">' + (gp.ready ? '🎉 You can buy ' + esc(gp.name) + '!' : '🎯 ' + esc(gp.name) + ' · ' + fmt(gp.have) + ' / ' + fmt(gp.price) + ' ⭐') + '</span>' +
      '<span class="gb" style="display:block;"><i style="width:' + gp.pct + '%"></i></span></span></button>';
  }

  /* ---------------- the island ---------------- */
  function drawStage() {
    var stage = $('#slwStage', root); if (!stage) return;
    var u = me(), w = C.ensureWorld(u), st = artState(w);
    var unlocked = {}; C.unlockedRegions(w).forEach(function (k) { unlocked[k] = 1; });
    var html = '<div class="slw-ground">' + ART.island(COLS, ROWS, C.REGION_CELLS, unlocked) + '</div>';
    /* objects */
    w.placed.forEach(function (p) {
      var it = C.item(p.id); if (!it) return;          /* unknown future item: kept in data, not drawn */
      if (placing && placing.uid === p.uid) return;    /* drawn as the ghost while moving */
      var sp = ART.sprite(p.id, Object.assign({ lit: !!lit[p.uid] }, st)); if (!sp) return;
      var fw = it.fp[0], fh = it.fp[1];
      var hUnits = sp.h * (fw * 100 / sp.w);
      var top = PAD + (p.y + fh) * CH - hUnits;
      var isPath = it.kind === 'path';
      var interactive = mode !== 'play' || !!it.act;
      var tag = '';
      if (mode === 'play' && it.act === 'launch') tag = '<span class="slw-tag play">▶ PLAY</span>';
      else if (mode === 'play' && it.act && it.act !== 'home') tag = '<span class="slw-dot" aria-hidden="true">✋</span>';
      /* NEW! sits on the item's base (sprite boxes are taller than short art); games keep it on top, clear of ▶ PLAY */
      var newBadge = (window._slwNew && window._slwNew[p.uid]) ? '<span class="slw-new' + (it.act === 'launch' ? '' : ' base') + '">NEW!</span>' : '';
      var label = it.name + (it.act === 'launch' ? ' — tap to play' : it.act ? ' — tap to play with it' : '');
      var styleAttr = 'left:' + pct(p.x * 100, STAGE_W) + ';top:' + pct(top, STAGE_H) + ';width:' + pct(fw * 100, STAGE_W) + ';height:' + pct(hUnits, STAGE_H) + ';z-index:' + (isPath ? 2 : 10 + (p.y + fh) * 10) + ';';
      var cls = 'slw-obj' + (isPath ? ' path' : '') + (selectedUid === p.uid ? ' sel' : '');
      html += interactive
        ? '<button type="button" class="' + cls + '" data-uid="' + p.uid + '" style="' + styleAttr + '" aria-label="' + esc(label) + '">' + sp.svg + tag + newBadge + '</button>'
        : '<div class="' + cls + '" data-uid="' + p.uid + '" style="' + styleAttr + '" role="img" aria-label="' + esc(it.name) + '">' + sp.svg + newBadge + '</div>';
    });
    /* locked land signs */
    Object.keys(C.REGIONS).forEach(function (rk) {
      var R = C.REGIONS[rk]; if (!R.unlock || unlocked[rk]) return;
      /* sign sits on the outer edge of the locked land, clear of the home island */
      var cells = C.REGION_CELLS[rk], sy = 0, xs = [];
      cells.forEach(function (c) { var q = c.split(','); xs.push(+q[0]); sy += +q[1]; });
      var onLeft = (Math.min.apply(null, xs) + Math.max.apply(null, xs)) / 2 < C.COLS / 2;
      var it = C.item(R.unlock);
      html += '<button type="button" class="slw-sign" data-land="' + it.id + '" style="' + (onLeft ? 'left:1%;' : 'left:auto;right:1%;') + 'transform:translate(0,-50%);top:' + pct(PAD + (sy / cells.length + 0.5) * CH, STAGE_H) + ';">🔒 ' + esc(R.name) + '<br>⭐ ' + fmt(it.price) + '</button>';
    });
    /* you (avatar) beside the house */
    var house = w.placed.filter(function (p) { return p.id === 'house_cottage'; })[0];
    if (house) {
      var mx = house.x * 100 - 62, my = PAD + (house.y + 2) * CH - 110;
      html += '<button type="button" class="slw-me" style="left:' + pct(mx, STAGE_W) + ';top:' + pct(my, STAGE_H) + ';z-index:' + (10 + (house.y + 2) * 10 + 4) + ';" aria-label="That’s you!">' +
        '<svg viewBox="0 0 70 110"><ellipse cx="35" cy="104" rx="20" ry="5" fill="rgba(40,30,60,.18)"/><path d="M18 102 L22 58 Q35 48 48 58 L52 102 Z" fill="' + esc(u.color || '#6c5ce7') + '" stroke="#3b2f4a" stroke-width="3" stroke-linejoin="round"/><circle cx="35" cy="30" r="24" fill="#fff" stroke="#3b2f4a" stroke-width="3"/></svg>' +
        '<span class="face">' + esc(u.avatar || '🙂') + '</span></button>';
    }
    stage.innerHTML = html + '<div id="slwPets"></div><div id="slwPlace"></div>';
    stage.querySelectorAll('[data-uid]').forEach(function (el) { el.addEventListener('click', onObjectTap); });
    stage.querySelectorAll('[data-land]').forEach(function (el) { el.addEventListener('click', function () { openItem(el.dataset.land); }); });
    var meEl = stage.querySelector('.slw-me');
    if (meEl) meEl.addEventListener('click', function () { meEl.classList.remove('wave'); void meEl.offsetWidth; meEl.classList.add('wave'); fx(meEl, '👋'); });
    if (mode === 'place') drawPlacement();
    startPets();
  }

  function fx(el, txt) {
    var stage = $('#slwStage', root); if (!stage || !el) return;
    var r = el.getBoundingClientRect(), s = stage.getBoundingClientRect();
    var d = document.createElement('div');
    d.className = 'slw-fx'; d.textContent = txt;
    d.style.left = ((r.left + r.width / 2 - s.left) / s.width * 100) + '%';
    d.style.top = ((r.top - s.top) / s.height * 100) + '%';
    stage.appendChild(d);
    setTimeout(function () { d.remove(); }, 1150);
  }

  /* ---------------- pets wander ---------------- */
  function stopPets() { petTimers.forEach(function (t) { clearTimeout(t); }); petTimers = []; }
  function startPets() {
    var host = $('#slwPets', root); if (!host) return;
    var u = me(), w = C.ensureWorld(u);
    var pets = w.pets.filter(function (p) { return C.owns(w, p.id); });
    host.innerHTML = '';
    var land = Object.keys(C.landSet(w));
    var occ = C.occupancy(w).occ;
    var free = land.filter(function (c) { return !occ[c] || occ[c].layer === 'ground'; });
    if (!free.length) return;
    pets.forEach(function (p, i) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'slw-pet';
      b.setAttribute('aria-label', p.name + ' the ' + C.item(p.id).name.toLowerCase() + (w.activePet === p.id ? ' (runs your obstacle course)' : ''));
      var frame = 0;
      b.innerHTML = '<span class="nm">' + esc(p.name) + (w.activePet === p.id ? ' 🏅' : '') + '</span>' + ART.pet(p.id, { acc: p.acc, frame: 0 });
      var cell = free[(i * 7 + 3) % free.length].split(',');
      var pos = { x: +cell[0], y: +cell[1] };
      function zFor(y) { return 10 + (Math.round(y) + 1) * 10 + 5; }
      function placeAt(x, y, dur, keepZ) {
        b.style.transitionDuration = (reduced ? 0 : dur) + 's';
        b.style.left = pct(x * 100 + 5, STAGE_W);
        b.style.top = pct(PAD + (y + 1) * CH - 72, STAGE_H);
        if (!keepZ) b.style.zIndex = zFor(y);
      }
      placeAt(pos.x, pos.y, 0);
      b.addEventListener('click', function () {
        b.classList.remove('hop'); void b.offsetWidth; b.classList.add('hop');
        b.classList.add('say'); setTimeout(function () { b.classList.remove('say'); }, 1800);
        fx(b, ['💖', '✨', '🎾', '😊'][Math.floor(Math.random() * 4)]);
        sfx('unlock');
      });
      host.appendChild(b);
      function wander() {
        if (!document.body.contains(b)) return;
        var target = free[Math.floor(Math.random() * free.length)].split(',');
        var tx = +target[0], ty = +target[1];
        var dist = Math.hypot(tx - pos.x, ty - pos.y);
        b.classList.toggle('flip', tx < pos.x);
        var dur = Math.max(0.8, dist * 0.7), y0 = pos.y, t0 = Date.now();
        placeAt(tx, ty, reduced ? 0 : dur, !reduced);
        var walk = setInterval(function () {
          if (!document.body.contains(b)) { clearInterval(walk); return; }
          /* depth follows the row the pet is crossing right now, so it walks
             behind the house instead of over its roof */
          var f = Math.min(1, (Date.now() - t0) / (dur * 1000));
          b.style.zIndex = zFor(y0 + (ty - y0) * f);
          frame = 1 - frame;
          var svgHost = b.querySelector('svg');
          if (svgHost && !reduced) svgHost.outerHTML = ART.pet(p.id, { acc: p.acc, frame: frame });
        }, 220);
        petTimers.push(setTimeout(function () { clearInterval(walk); b.style.zIndex = zFor(ty); }, dur * 1000));
        pos = { x: tx, y: ty };
        petTimers.push(setTimeout(wander, dur * 1000 + 1500 + Math.random() * 3500));
      }
      if (!reduced) petTimers.push(setTimeout(wander, 800 + i * 900));
    });
  }

  /* ---------------- HUD actions ---------------- */
  function onHudAction(e) {
    var a = e.currentTarget.dataset.act;
    if (a === 'learn') { closeAllOverlays(); if (typeof setActiveApp === 'function') setActiveApp('maths'); return; }
    if (a === 'shop') return openShop();
    if (a === 'games') return openGames();
    if (a === 'pets') return openPets();
    if (a === 'info') return openInfo();
    if (a === 'sound') {
      var u = me(); u.muted = !u.muted; saveState();
      try { if (typeof renderMuteBtn === 'function') renderMuteBtn(); } catch (er) {}
      e.currentTarget.textContent = u.muted ? '🔇 Off' : '🔊 On';
      if (!u.muted) sfx('correct');
      return;
    }
    if (a === 'edit') {
      if (mode === 'place') cancelPlacement();
      mode = mode === 'edit' ? 'play' : 'edit';
      selectedUid = null;
      draw();
    }
  }

  /* ---------------- tapping objects ---------------- */
  function onObjectTap(e) {
    var uid = e.currentTarget.dataset.uid;
    var w = W(), p = w.placed.filter(function (q) { return q.uid === uid; })[0];
    if (!p) return;
    var it = C.item(p.id), el = e.currentTarget;
    if (mode === 'edit') { selectedUid = uid; drawStage(); drawBar(); return; }
    if (mode === 'place') return;
    if (window._slwNew && window._slwNew[uid]) { delete window._slwNew[uid]; }
    switch (it.act) {
      case 'launch': return launch(it.game);
      case 'home': return openHome();
      case 'glow': lit[uid] = !lit[uid]; sfx('tick'); drawStage(); return;
      case 'bounce': {
        el.classList.remove('slw-bounce'); void el.offsetWidth; el.classList.add('slw-bounce');
        var petEl = $('.slw-pet', root);
        if (petEl) { petEl.style.transitionDuration = '0.4s'; petEl.style.left = el.style.left; petEl.style.top = 'calc(' + el.style.top + ' + 2%)'; setTimeout(function () { petEl.classList.remove('hop'); void petEl.offsetWidth; petEl.classList.add('hop'); fx(el, 'BOING!'); }, 420); }
        else fx(el, 'BOING!');
        sample('chip', 0.6) || sfx('unlock');
        return;
      }
      case 'splash': { var wtr = el.querySelector('.slw-water'); if (wtr) { wtr.classList.remove('go'); void el.offsetWidth; wtr.classList.add('go'); } fx(el, '💦'); sfx('correct'); return; }
      case 'swing': { var sw = el.querySelector('.slw-swing'); if (sw) { sw.classList.remove('go'); void el.offsetWidth; sw.classList.add('go'); } fx(el, '🎶'); return; }
      case 'bubbles': { var bb = el.querySelector('.slw-bubbles'); if (bb) { bb.classList.remove('go'); void el.offsetWidth; bb.classList.add('go'); } fx(el, '🫧'); sfx('unlock'); return; }
      case 'spin': { var sp = el.querySelector('.slw-spin'); if (sp) { sp.classList.add('fast'); setTimeout(function () { sp.classList.remove('fast'); }, 2200); } fx(el, '🌬️'); return; }
      case 'wave': { var fl = el.querySelector('.slw-flag'); if (fl) { fl.classList.add('fast'); setTimeout(function () { fl.classList.remove('fast'); }, 1600); } fx(el, '🎉'); return; }
    }
  }

  /* ---------------- edit / placement ---------------- */
  function drawBar() {
    var bar = $('#slwBar', root); if (!bar) return;
    var w = W();
    if (mode === 'play') { bar.innerHTML = ''; return; }
    if (mode === 'place' && placing) {
      var chk = C.canPlace(w, placing.id, placing.x, placing.y, placing.uid);
      var it = C.item(placing.id);
      bar.innerHTML = '<div class="slw-bar"><div class="msg' + (chk.ok ? '' : ' bad') + '" id="slwPlaceMsg">' +
        (chk.ok ? 'Tap a square to move it, then tap ✅' : '⚠️ ' + esc(chk.reason)) + '</div>' +
        '<button class="slw-btn on big" type="button" id="slwPlaceOk"' + (chk.ok ? '' : ' disabled') + '>✅ Put ' + esc(it.name.toLowerCase()) + ' here</button>' +
        '<button class="slw-btn big" type="button" id="slwPlaceCancel">' + (placing.uid ? '✖ Cancel move' : '📦 Keep it for later') + '</button>' +
        '<span class="slw-kbhint" style="font-size:12px;color:#7c8696;font-weight:700;">Keyboard: arrows move · Enter places · Esc cancels</span></div>';
      $('#slwPlaceOk', bar).addEventListener('click', confirmPlacement);
      $('#slwPlaceCancel', bar).addEventListener('click', cancelPlacement);
      return;
    }
    /* edit mode: selection actions + storage tray */
    var html = '<div class="slw-bar">';
    if (selectedUid) {
      var p = w.placed.filter(function (q) { return q.uid === selectedUid; })[0];
      var sit = p && C.item(p.id);
      if (sit) {
        html += '<div class="msg">' + esc(sit.name) + '</div>' +
          '<button class="slw-btn on" type="button" id="slwMove">↔️ Move</button>' +
          (C.isStorable(sit) ? '<button class="slw-btn" type="button" id="slwStore">📦 Put away</button>' : '<span style="font-size:12px;font-weight:700;color:#7c8696;">This one always stays on your island — you can move it.</span>') +
          (sit.id === 'house_cottage' ? '<button class="slw-btn" type="button" id="slwHome">🎨 Colours</button>' : '');
      }
    } else {
      html += '<div class="msg">✏️ Tap something on your island to move it or put it away.</div>';
    }
    html += '<button class="slw-btn" type="button" id="slwEditDone">Done</button></div>';
    var inv = C.inventory(w).filter(function (x) { return C.isPlaceable(C.item(x.id)); });
    html += '<div class="slw-tray" aria-label="Things you own that aren’t on the island">' + (inv.length
      ? inv.map(function (x) { var it2 = C.item(x.id); return '<button type="button" class="slw-trayitem" data-tray="' + x.id + '"><b>×' + x.count + '</b>' + ART.icon(x.id, artState(w)) + '<span>' + esc(it2.name) + '</span></button>'; }).join('')
      : '<div style="font-size:13px;font-weight:700;color:#7c8696;padding:6px;">📦 Your storage is empty — everything you own is out on the island!</div>') + '</div>';
    bar.innerHTML = html;
    var mv = $('#slwMove', bar); if (mv) mv.addEventListener('click', function () { var pp = w.placed.filter(function (q) { return q.uid === selectedUid; })[0]; if (pp) startPlacement(pp.id, pp.uid, false); });
    var stb = $('#slwStore', bar); if (stb) stb.addEventListener('click', function () { storeSelected(); });
    var hm = $('#slwHome', bar); if (hm) hm.addEventListener('click', openHome);
    $('#slwEditDone', bar).addEventListener('click', function () { mode = 'play'; selectedUid = null; draw(); });
    bar.querySelectorAll('[data-tray]').forEach(function (b) { b.addEventListener('click', function () { startPlacement(b.dataset.tray, null, false); }); });
  }

  function startPlacement(id, uid, fromBuy) {
    var w = W(), it = C.item(id);
    if (!it || !C.isPlaceable(it)) return;
    var start;
    if (uid) { var p = w.placed.filter(function (q) { return q.uid === uid; })[0]; start = { x: p.x, y: p.y }; }
    else start = C.findSpot(w, id) || { x: 7, y: 5 };
    placing = { id: id, uid: uid || null, x: start.x, y: start.y, ox: start.x, oy: start.y, fromBuy: !!fromBuy };
    mode = 'place';
    document.addEventListener('keydown', placeKeys);
    draw();
    if (!uid && !C.findSpot(w, id)) { var m = $('#slwPlaceMsg', root); if (m) m.textContent = '⚠️ Your island is full! Put something away first, or keep it for later.'; }
  }
  function drawPlacement() {
    var host = $('#slwPlace', root); if (!host || !placing) return;
    var w = W(), it = C.item(placing.id), land = C.landSet(w);
    var o = C.occupancy(w, placing.uid);
    var chk = C.canPlace(w, placing.id, placing.x, placing.y, placing.uid);
    var foot = {}; C.fpCells(it, placing.x, placing.y).forEach(function (c) { foot[c] = 1; });
    var html = '';
    Object.keys(land).forEach(function (ck) {
      var q = ck.split(','), x = +q[0], y = +q[1];
      var cls = 'slw-cell' + (foot[ck] ? (chk.ok ? ' ok' : ' bad') : (o.reserved[ck] ? ' door' : ''));
      html += '<button type="button" class="' + cls + '" data-cx="' + x + '" data-cy="' + y + '" aria-label="Square ' + (x + 1) + ', ' + (y + 1) + '" style="left:' + pct(x * 100 + 3, STAGE_W) + ';top:' + pct(PAD + y * CH + 3, STAGE_H) + ';width:' + pct(94, STAGE_W) + ';height:' + pct(CH - 6, STAGE_H) + ';"></button>';
    });
    var sp = ART.sprite(placing.id, artState(w));
    if (sp) {
      var fw = it.fp[0], fh = it.fp[1], hUnits = sp.h * (fw * 100 / sp.w);
      html += '<div class="slw-ghost' + (chk.ok ? '' : ' bad') + '" style="left:' + pct(placing.x * 100, STAGE_W) + ';top:' + pct(PAD + (placing.y + fh) * CH - hUnits, STAGE_H) + ';width:' + pct(fw * 100, STAGE_W) + ';height:' + pct(hUnits, STAGE_H) + ';">' + sp.svg + '</div>';
    }
    host.innerHTML = html;
    host.querySelectorAll('[data-cx]').forEach(function (b) {
      b.addEventListener('click', function () {
        var nx = +b.dataset.cx, ny = +b.dataset.cy;
        if (nx === placing.x && ny === placing.y && C.canPlace(W(), placing.id, nx, ny, placing.uid).ok) return confirmPlacement();
        placing.x = nx; placing.y = ny; drawPlacement(); drawBar();
      });
    });
  }
  function islandOnScreen() {
    var wv = document.getElementById('worldView');
    return !!(wv && !wv.classList.contains('hidden') && !document.querySelector('.slw-ov,.slw-cele,.slg'));
  }
  function placeKeys(e) {
    if (mode !== 'place' || !placing) return;
    if (!islandOnScreen()) return;   /* never steal keys from maths, games or dialogs */
    var k = e.key, moved = true;
    if (k === 'ArrowLeft') placing.x = Math.max(0, placing.x - 1);
    else if (k === 'ArrowRight') placing.x = Math.min(COLS - 1, placing.x + 1);
    else if (k === 'ArrowUp') placing.y = Math.max(0, placing.y - 1);
    else if (k === 'ArrowDown') placing.y = Math.min(ROWS - 1, placing.y + 1);
    else if (k === 'Enter') { e.preventDefault(); confirmPlacement(); return; }
    else if (k === 'Escape') { e.preventDefault(); cancelPlacement(); return; }
    else moved = false;
    if (moved) { e.preventDefault(); drawPlacement(); drawBar(); }
  }
  function endPlacement(nextMode) {
    placing = null;
    document.removeEventListener('keydown', placeKeys);
    mode = nextMode || 'play';
    draw();
  }
  function confirmPlacement() {
    if (!placing) return;
    var pl = placing;
    if (!C.canPlace(W(), pl.id, pl.x, pl.y, pl.uid).ok) return;
    commit(function (u) { return C.place(u, pl.id, pl.x, pl.y, pl.uid || undefined); }).then(function (res) {
      if (!res || !res.ok) { toast('⚠️ ' + ((res && res.reason) || 'Couldn’t save that — try again.')); return; }
      sfx('correct');
      lastUndo = pl.uid ? { type: 'move', uid: pl.uid, id: pl.id, x: pl.ox, y: pl.oy } : { type: 'place', uid: res.uid };
      if (!pl.uid) { window._slwNew = window._slwNew || {}; window._slwNew[res.uid] = 1; }
      endPlacement(pl.fromBuy ? 'play' : 'edit');
      toast(pl.uid ? 'Moved! ✨' : 'Placed! ✨', { label: '↩ Undo', fn: undo });
    });
  }
  function cancelPlacement() {
    if (!placing) return;
    var wasBuy = placing.fromBuy, wasNew = !placing.uid;
    endPlacement(wasBuy ? 'play' : 'edit');
    if (wasNew) toast('📦 Saved in your storage — place it any time from ✏️ Edit.');
  }
  function storeSelected() {
    var uid = selectedUid; if (!uid) return;
    var p = W().placed.filter(function (q) { return q.uid === uid; })[0]; if (!p) return;
    commit(function (u) { return C.store(u, uid); }).then(function (res) {
      if (!res || !res.ok) { toast('⚠️ ' + ((res && res.reason) || 'Couldn’t put that away.')); return; }
      lastUndo = { type: 'store', id: p.id, x: p.x, y: p.y };
      selectedUid = null; draw();
      toast('📦 Put away safely — it’s in your storage.', { label: '↩ Undo', fn: undo });
    });
  }
  function undo() {
    var un = lastUndo; lastUndo = null; if (!un) return;
    commit(function (u) {
      if (un.type === 'move') return C.place(u, un.id, un.x, un.y, un.uid);
      if (un.type === 'place') return C.store(u, un.uid);
      if (un.type === 'store') return C.place(u, un.id, un.x, un.y);
      return { ok: false };
    }).then(function () { draw(); });
  }

  /* ---------------- overlays ---------------- */
  function overlay(inner, opts) {
    opts = opts || {};
    var ov = document.createElement('div');
    ov.className = 'slw-ov' + (opts.cls ? ' ' + opts.cls : '');
    ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true');
    ov.setAttribute('data-sl-modal', '1');   /* the app's own pop-ups (Daily 30 etc.) wait for this */
    ov.innerHTML = '<div class="slw-sheet' + (opts.small ? ' small' : '') + '"><button class="slw-x" type="button" aria-label="Close">✕</button>' + inner + '</div>';
    var opener = document.activeElement;
    var h2 = ov.querySelector('h2'); if (h2) { h2.id = h2.id || ('slwH' + (++ovSeq)); ov.setAttribute('aria-labelledby', h2.id); }
    document.body.appendChild(ov);
    function close() {
      ov.remove(); document.removeEventListener('keydown', onKey); if (opts.onClose) opts.onClose();
      try { if (opener && document.body.contains(opener) && opener.focus) opener.focus(); } catch (e) {}
    }
    function onKey(e) {
      if (e.key !== 'Escape') return;
      var all = document.querySelectorAll('.slw-ov');
      if (all[all.length - 1] === ov && !document.querySelector('.slw-cele')) close();   /* one Esc = one dialog */
    }
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    $('.slw-x', ov).addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    var focusable = ov.querySelector('button:not(.slw-x), input');
    setTimeout(function () { try { (focusable || $('.slw-x', ov)).focus(); } catch (e) {} }, 30);
    ov._close = close;
    return ov;
  }
  var ovSeq = 0;
  function closeAllOverlays() { document.querySelectorAll('.slw-ov,.slw-cele').forEach(function (o) { if (o._close) o._close(); else o.remove(); }); }
  function toast(msg, action) {
    var old = document.querySelector('.slw-toast'); if (old) old.remove();
    var t = document.createElement('div'); t.className = 'slw-toast'; t.setAttribute('role', 'status');
    t.innerHTML = '<span>' + esc(msg) + '</span>' + (action ? '<button type="button">' + esc(action.label) + '</button>' : '');
    document.body.appendChild(t);
    if (action) $('button', t).addEventListener('click', function () { t.remove(); action.fn(); });
    setTimeout(function () { if (t.parentNode) t.remove(); }, action ? 6000 : 3200);
  }

  /* ---------------- shop ---------------- */
  var SHOP_CATS = [['all', '⭐ All'], ['afford', '✅ I can buy'], ['garden', '🌷 Garden'], ['paths', '🛤️ Paths'], ['fun', '🎪 Fun'], ['home', '🏠 Home'], ['pets', '🐾 Pets'], ['land', '🏝️ Land'], ['games', '🎮 Games']];
  var shopCat = 'all';
  function catOf(it) {
    if (it.cat === 'lights' || it.cat === 'flags') return 'garden';
    return it.cat || 'garden';
  }
  function cardHtml(u, it) {
    var w = C.ensureWorld(u), s = C.itemState(u, it.id), rep = C.isRepeatable(it);
    var chip = s.state === 'owned' ? '<span class="chip own">✓ Owned</span>'
      : s.state === 'locked' ? '<span class="chip lock">🔒 Needs ' + esc(C.item(s.needs[0]).name) + '</span>'
      : rep ? '<span class="chip rep">Buy as many as you like' + (s.copies ? ' · you have ' + s.copies : '') + '</span>'
      : '<span class="chip uni">Buy once, keep forever</span>';
    var buyLabel = s.state === 'owned' ? (it.kind === 'style' || it.kind === 'cosmetic' || it.kind === 'variant' ? 'Use it' : 'Owned ✓')
      : s.state === 'locked' ? '🔒 Locked' : s.state === 'short' ? 'Need ' + fmt(s.need) + ' more ⭐' : 'Buy';
    var disabled = s.state === 'locked' || s.state === 'short' || (s.state === 'owned' && !(it.kind === 'style' || it.kind === 'cosmetic' || it.kind === 'variant'));
    var isGoal = w.goal === it.id;
    var goalBtn = (s.state === 'owned') ? '' : '<button type="button" class="slw-goalbtn' + (isGoal ? ' on' : '') + '" data-goal="' + it.id + '" aria-pressed="' + isGoal + '" title="' + (isGoal ? 'This is your goal' : 'Make this my savings goal') + '">🎯</button>';
    return '<div class="slw-card"><button type="button" class="ic" data-open="' + it.id + '" aria-label="See ' + esc(it.name) + '">' + ART.icon(it.id, artState(w)) + '</button>' +
      '<div class="nm">' + esc(it.name) + '</div><div class="ds">' + esc(it.desc) + '</div>' + chip +
      '<div class="pr">⭐ ' + fmt(it.price) + (rep ? ' <span style="font-size:11px;color:#8a84a3;">each</span>' : '') + '</div>' +
      '<div class="row"><button type="button" class="slw-buy" data-buy="' + it.id + '"' + (disabled ? ' disabled' : '') + '>' + buyLabel + '</button>' + goalBtn + '</div></div>';
  }
  function openShop(cat) {
    if (cat) shopCat = cat;
    var u = me();
    var ov = overlay('<h2>🛍️ Island Shop</h2><div style="font-weight:800;color:#6b5a22;">You have ⭐ <span id="slwShopPts">' + fmt(u.points) + '</span> to spend · earn more by learning 📚 · same ⭐ as the 🎁 Shop</div><div class="slw-cats" id="slwCats"></div><div class="slw-err" id="slwShopErr" role="alert"></div><div class="slw-grid" id="slwShopGrid"></div>');
    function paint() {
      var u2 = me();
      $('#slwShopPts', ov).textContent = fmt(u2.points);
      $('#slwCats', ov).innerHTML = SHOP_CATS.map(function (c) { return '<button type="button" class="slw-btn' + (shopCat === c[0] ? ' on' : '') + '" data-cat="' + c[0] + '">' + c[1] + '</button>'; }).join('');
      var items = C.shopItems().filter(function (it) {
        if (shopCat === 'afford') return C.itemState(u2, it.id).state === 'affordable';
        return shopCat === 'all' || catOf(it) === shopCat;
      });
      /* affordable & useful first, owned uniques last */
      items.sort(function (a, b) {
        var sa = C.itemState(u2, a.id).state, sb = C.itemState(u2, b.id).state;
        var rank = { affordable: 0, short: 1, locked: 2, owned: 3 };
        return (rank[sa] - rank[sb]) || (a.price - b.price);
      });
      var next = null;
      if (!items.length && shopCat === 'afford') {
        C.shopItems().forEach(function (it) { if (C.itemState(u2, it.id).state === 'short' && (!next || it.price < next.price)) next = it; });
      }
      $('#slwShopGrid', ov).innerHTML = items.length ? items.map(function (it) { return cardHtml(u2, it); }).join('')
        : '<p style="grid-column:1/-1;font-weight:800;text-align:center;color:#6b6390;padding:18px;">Nothing to buy just yet — every bit of learning earns ⭐!' +
          (next ? '<br>Next up: <b>' + esc(next.name) + '</b> — just ' + fmt(next.price - (u2.points || 0)) + ' more ⭐.' : '') + '</p>';
      ov.querySelectorAll('[data-cat]').forEach(function (b) { b.addEventListener('click', function () { shopCat = b.dataset.cat; paint(); }); });
      ov.querySelectorAll('[data-open]').forEach(function (b) { b.addEventListener('click', function () { openItem(b.dataset.open); }); });
      ov.querySelectorAll('[data-goal]').forEach(function (b) { b.addEventListener('click', function () { toggleGoal(b.dataset.goal).then(paint); }); });
      ov.querySelectorAll('[data-buy]').forEach(function (b) {
        b.addEventListener('click', function () {
          var it = C.item(b.dataset.buy);
          if (C.itemState(me(), it.id).state === 'owned') { useOwned(it); ov._close(); return; }
          buyFlow(it, b, $('#slwShopErr', ov), function (ok) { if (ok) { ov._close(); } else paint(); });
        });
      });
    }
    paint();
  }
  function toggleGoal(id) {
    var w = W();
    var target = w.goal === id ? null : id;
    var it = target && C.item(target);
    return commit(function (u) {
      var r = C.setGoal(u, target);
      if (r.ok) { var fw = C.ensureWorld(u); fw.goalPrice = it ? it.price : null; fw.goalName = it ? it.name : null; }
      return r;
    }).then(function (res) {
      if (res && res.ok) { toast(target ? '🎯 New goal: ' + it.name + '!' : 'Goal cleared.'); draw(); return; }
      if (res && res.code === 'locked' && res.needs && W().goal !== res.needs) {
        var pre = C.item(res.needs);
        return toggleGoal(res.needs).then(function () { toast('🎯 First you need the ' + pre.name + ' — that’s your goal now!'); });
      }
      if (res && res.reason) toast(res.reason);
    });
  }
  function useOwned(it) {
    if (it.kind === 'style') { commit(function (u) { return C.select(u, it.id); }).then(function () { draw(); openHome(); }); return; }
    if (it.kind === 'cosmetic' || it.kind === 'variant') { commit(function (u) { return C.select(u, it.id); }).then(function () { draw(); toast('Selected: ' + it.name + ' ✓'); }); return; }
  }

  /* item detail sheet (preview, unlocks, buy, goal) */
  function unlockText(it) {
    var parts = [];
    if (it.kind === 'attraction') parts.push('🎮 Unlocks a new game for keeps — tap it on your island to play.');
    (it.includes || []).forEach(function (inc) { var ii = C.item(inc); if (ii) parts.push('🎁 Comes with: ' + ii.name); });
    if (it.kind === 'land') parts.push('🏝️ Opens ' + (C.REGION_CELLS[it.region] || []).length + ' new squares of island.');
    if (it.kind === 'pet') parts.push('🐾 A new pet who wanders your island and can run your obstacle course.');
    if (it.kind === 'acc') parts.push('🎀 Any of your pets can wear it — on the island and in the obstacle course.');
    if (it.kind === 'variant' && it.game === 'course') parts.push('🏃 A new obstacle course for your pet, with its own best score.');
    if (it.kind === 'variant' && it.game === 'kart') parts.push('🏁 A new race track, with its own best time.');
    if (it.kind === 'cosmetic') parts.push('✨ Changes how the game looks — it doesn’t make it easier or harder.');
    if (it.kind === 'style') parts.push('🏠 Changes how your home looks. Switch between styles you own any time.');
    if (C.isRepeatable(it)) parts.push('🔁 Each one you buy is one more on your island. Put them away and bring them back any time.');
    if (it.kind === 'fun') parts.push('✋ Tap it on your island to play with it.');
    (it.requires || []).forEach(function (r) { parts.push('🔒 First you need: ' + C.item(r).name + '.'); });
    return parts.join('<br>');
  }
  function openItem(id) {
    var it = C.item(id); if (!it) return;
    var u = me(), w = C.ensureWorld(u), s = C.itemState(u, id);
    var demoGame = it.kind === 'attraction' ? it.game : (it.kind === 'variant' ? it.game : null);
    var ov = overlay(
      '<div class="slw-detail"><div class="big" id="slwBig">' + ART.icon(id, artState(w)) + '</div>' +
      '<div class="info"><h2>' + esc(it.name) + '</h2><div style="color:#6b6585;">' + esc(it.desc) + '</div>' +
      '<div class="slw-unlocks">' + unlockText(it) + '</div>' +
      '<div class="pr" style="font-family:\'Baloo 2\',sans-serif;font-weight:800;font-size:22px;color:#b9821a;">⭐ ' + fmt(it.price) + (C.isRepeatable(it) ? ' each' : '') + '</div>' +
      '<div class="slw-need">' + (s.state === 'short' ? 'You have ⭐ ' + fmt(u.points) + ' — just ' + fmt(s.need) + ' more to go!' : s.state === 'owned' ? 'You own this ✓' : '') + '</div>' +
      '<div class="slw-err" id="slwItemErr" role="alert"></div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
        (s.state === 'owned'
          ? ((it.kind === 'style' || it.kind === 'cosmetic' || it.kind === 'variant') ? '<button class="slw-buy" type="button" id="slwUse">Use it</button>' : '') +
            (it.kind === 'attraction' && it.game ? '<button class="slw-buy" type="button" id="slwPlayNow">▶ Play</button>' : '')
          : '<button class="slw-buy" type="button" id="slwBuyNow"' + (s.state !== 'affordable' ? ' disabled' : '') + '>' + (s.state === 'affordable' ? 'Buy for ⭐ ' + fmt(it.price) : s.state === 'locked' ? '🔒 Locked' : 'Not enough ⭐ yet') + '</button>' +
            '<button class="slw-goalbtn' + (w.goal === id ? ' on' : '') + '" type="button" id="slwGoalNow">🎯 ' + (w.goal === id ? 'My goal ✓' : 'Make it my goal') + '</button>') +
        (demoGame ? '<button class="slw-btn" type="button" id="slwDemo">▶ Watch a preview</button>' : '') +
      '</div></div></div>');
    var bn = $('#slwBuyNow', ov);
    if (bn) bn.addEventListener('click', function () { buyFlow(it, bn, $('#slwItemErr', ov), function (ok) { if (ok) ov._close(); }); });
    var gn = $('#slwGoalNow', ov); if (gn) gn.addEventListener('click', function () { toggleGoal(id).then(function () { ov._close(); }); });
    var un = $('#slwUse', ov); if (un) un.addEventListener('click', function () { useOwned(it); ov._close(); });
    var pn = $('#slwPlayNow', ov); if (pn) pn.addEventListener('click', function () { ov._close(); closeAllOverlays(); launch(it.game); });
    var dm = $('#slwDemo', ov);
    if (dm) dm.addEventListener('click', function () {
      dm.disabled = true;
      loadGame(demoGame).then(function () {
        var host = $('#slwBig', ov); if (!host) return;
        host.innerHTML = '';
        var stop = window.SLGames[demoGame].demo(host, { variant: it.kind === 'variant' ? it.id : null, world: W(), seconds: 7, endText: s.state === 'owned' ? 'It’s yours — play it on your island!' : 'Buy it to play!' });
        var prevClose = ov._close;
        ov._close = function () { try { stop(); } catch (e) {} prevClose(); };
        setTimeout(function () { dm.disabled = false; }, 7500);
      }).catch(function () { dm.textContent = 'Preview unavailable offline'; });
    });
  }

  /* the purchase flow: confirm (expensive only) → locked commit → celebrate */
  function buyFlow(it, btn, errEl, done) {
    if (buying || confirming) return;   /* a double-tap must not stack two confirm boxes */
    var u = me();
    var chk = C.purchaseCheck(u, it.id);
    if (!chk.ok) { if (errEl) errEl.textContent = chk.reason; return done && done(false); }
    var proceed = function () {
      buying = true;
      if (btn) { btn.disabled = true; btn.textContent = 'Buying…'; }
      if (errEl) errEl.textContent = '';
      var tx = pendingTx[it.id] || (pendingTx[it.id] = newTx());
      var wasGoal = W().goal === it.id;
      commitPurchase(it.id, tx).then(function (res) {
        buying = false;
        if (res && res.ok) {
          delete pendingTx[it.id];
          if (done) done(true);
          afterPurchase(it, res, wasGoal);
        } else {
          /* definitive refusals free the tx; save failures keep it so a retry can't double-charge */
          if (!res || ['write_failed', 'not_saved', 'read_failed'].indexOf(res.code) < 0) delete pendingTx[it.id];
          if (errEl) errEl.textContent = (res && res.reason) || 'Something went wrong — nothing was spent.';
          if (btn) { btn.disabled = false; btn.textContent = 'Try again'; }
          if (done) done(false);
        }
      }).catch(function () {
        buying = false;
        if (errEl) errEl.textContent = 'Something went wrong — please try again.';
        if (btn) { btn.disabled = false; btn.textContent = 'Try again'; }
      });
    };
    if (it.price >= C.ECONOMY.confirmAt) {
      var c = overlay('<h2>Buy ' + esc(it.name) + '?</h2><div class="big" style="width:140px;margin:8px auto;">' + ART.icon(it.id, artState(W())) + '</div>' +
        '<p style="font-weight:700;">It costs <b>⭐ ' + fmt(it.price) + '</b>. You’ll have <b>⭐ ' + fmt((u.points || 0) - it.price) + '</b> left.</p>' +
        '<p style="font-size:13px;font-weight:700;color:#6b6390;margin-top:-4px;">These are the same ⭐ you save for real prizes in the 🎁 Shop.</p>' +
        '<div style="display:flex;gap:8px;justify-content:center;"><button class="slw-btn big" type="button" id="slwNo">Not yet</button><button class="slw-buy" type="button" id="slwYes" style="flex:0 0 auto;padding:10px 22px;">Yes, buy it!</button></div>', { small: true, onClose: function () { confirming = false; } });
      confirming = true;
      $('#slwNo', c).addEventListener('click', function () { c._close(); });
      $('#slwYes', c).addEventListener('click', function () { c._close(); proceed(); });
      return;
    }
    proceed();
  }

  function afterPurchase(it, res, isGoal) {
    var w = W();
    if (res.replay) { toast('✓ ' + it.name + ' is yours.'); draw(); return; }
    sample('coins', 0.8) || sfx('fanfare');
    if (isGoal && it.kind !== 'attraction' && it.kind !== 'land') {
      draw();
      celebrate({ title: '🎯 Goal reached: ' + it.name + '!', sub: 'You saved up and did it. Pick your next goal in the shop!', icon: it.id, sfx: 'fanfare' });
      if (C.isPlaceable(it)) startPlacement(it.id, null, true);
      return;
    }
    if (it.kind === 'land') {
      draw();
      celebrate({ title: (isGoal ? '🎯 Goal reached! ' : '🏝️ ') + it.name + ' is open!', sub: 'New land to build on. Tap ✏️ Edit to move things there.', icon: it.id, sfx: 'fanfare' });
      return;
    }
    if (it.kind === 'attraction') {
      if (res.placedUid) { window._slwNew = window._slwNew || {}; window._slwNew[res.placedUid] = 1; }
      draw();
      celebrate({ title: (isGoal ? '🎯 Goal reached! ' : '🎉 ') + it.name + '!', sub: res.placedUid ? 'It’s on your island now — look for the ▶ PLAY sign. Yours forever!' : 'Your island is full — put something away in ✏️ Edit to make room. You can play it from 🎮 Games right now.', icon: it.id, sfx: 'fanfare',
        btns: [{ label: '▶ Play now', fn: function () { launch(it.game); } }] });
      return;
    }
    if (it.kind === 'pet') {
      draw();
      celebrate({ title: '🐾 Welcome, ' + C.petById(w, it.id).name + '!', sub: 'Your new ' + it.name.toLowerCase() + ' is exploring your island. Give them a name in 🐾 Pets.', icon: it.id, sfx: 'fanfare', btns: [{ label: '✏️ Name my pet', fn: openPets }] });
      return;
    }
    if (it.kind === 'style') { draw(); celebrate({ title: '🏠 ' + it.name + '!', sub: 'Your home has had a makeover. Switch styles any time by tapping your home.', icon: it.id }); return; }
    if (it.kind === 'acc') {
      var ap = w.activePet;
      commit(function (u) { return C.equipAccessory(u, ap, it.id); }).then(function () { draw(); });
      celebrate({ title: '🎀 ' + it.name + '!', sub: 'Your pet is wearing it now. Swap it between pets in 🐾 Pets.', icon: it.id });
      return;
    }
    if (it.kind === 'cosmetic' || it.kind === 'variant') { draw(); celebrate({ title: '✨ ' + it.name + '!', sub: 'Selected — you’ll see it next time you play.', icon: it.id }); return; }
    /* placeable decor/path/fun → straight into placement, which can be skipped */
    toast('✨ ' + it.name + ' is yours! Pick a spot.');
    startPlacement(it.id, null, true);
  }

  function celebrate(o) {
    var cel = document.createElement('div');
    cel.className = 'slw-cele' + (reduced ? '' : ' pop');
    cel.setAttribute('role', 'dialog'); cel.setAttribute('aria-live', 'polite'); cel.setAttribute('data-sl-modal', '1');
    cel.innerHTML = '<div class="t">' + esc(o.title) + '</div>' + (o.icon ? '<div class="ic">' + ART.icon(o.icon, artState(W())) + '</div>' : '') +
      '<div class="s">' + esc(o.sub || '') + '</div><div class="btns">' +
      (o.btns || []).map(function (b, i) { return '<button class="slw-btn big" type="button" data-b="' + i + '">' + esc(b.label) + '</button>'; }).join('') +
      '<button class="slw-btn big on" type="button" data-b="x">Yay! 🎉</button></div>';
    document.body.appendChild(cel);
    if (o.sfx) sample(o.sfx, 0.8);
    try { if (!reduced && typeof popConfetti === 'function') { popConfetti(); setTimeout(popConfetti, 300); } } catch (e) {}
    function close() { cel.remove(); document.removeEventListener('keydown', onKey); }
    function onKey(e) {
      if (e.key === 'Escape') close();
      else if (e.key === 'Enter' && !(document.activeElement && cel.contains(document.activeElement) && document.activeElement.tagName === 'BUTTON')) close();
    }
    document.addEventListener('keydown', onKey);
    cel._close = close;
    cel.querySelectorAll('[data-b]').forEach(function (b) {
      b.addEventListener('click', function (e) { e.stopPropagation(); close(); var i = b.dataset.b; if (i !== 'x' && o.btns[+i]) o.btns[+i].fn(); });
    });
    cel.addEventListener('click', close);
    setTimeout(function () { try { $('[data-b="x"]', cel).focus(); } catch (e) {} }, 40);
  }

  /* ---------------- home customisation ---------------- */
  function openHome() {
    var w = W(), st = artState(w);
    function opts(slot) {
      return C.CATALOG.filter(function (it) { return it.kind === 'style' && it.slot === slot; }).map(function (it) {
        var own = C.owns(w, it.id), on = it.multi ? !!w.details[it.id] : st[slot] === it.id;
        return '<button type="button" class="slw-trayitem" data-style="' + it.id + '" ' + (own ? '' : 'data-locked="1"') + ' style="' + (on ? 'border-color:#6c5ce7;background:#f1edfb;' : '') + (own ? '' : 'opacity:.55;') + '">' +
          ART.icon(it.id) + '<span>' + esc(it.name) + (own ? (on ? ' ✓' : '') : ' · ⭐' + fmt(it.price)) + '</span></button>';
      }).join('');
    }
    var ov = overlay('<h2>🏠 Your home</h2><div class="slw-detail"><div class="big" style="max-width:300px;">' + ART.sprite('house_cottage', st).svg + '</div><div class="info">' +
      '<b>Walls</b><div class="slw-tray">' + opts('wall') + '</div><b>Roof</b><div class="slw-tray">' + opts('roof') + '</div>' +
      '<b>Door</b><div class="slw-tray">' + opts('door') + '</div><b>Extras (tap to switch on/off)</b><div class="slw-tray">' + opts('detail') + '</div>' +
      '<div style="font-size:12.5px;color:#7c8696;font-weight:700;">Faded ones are in the shop — tap to see them.</div></div></div>');
    ov.querySelectorAll('[data-style]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.dataset.style;
        if (b.dataset.locked) { ov._close(); openItem(id); return; }
        commit(function (u) { return C.select(u, id); }).then(function () { ov._close(); draw(); openHome(); sfx('correct'); });
      });
    });
  }

  /* ---------------- pets panel ---------------- */
  function openPets() {
    var w = W();
    var pets = w.pets.filter(function (p) { return C.owns(w, p.id); });
    var accs = C.CATALOG.filter(function (it) { return it.kind === 'acc' && C.owns(w, it.id); });
    var html = '<h2>🐾 Your pets</h2><div style="font-size:13px;color:#6b6585;font-weight:700;margin-bottom:8px;">Pets never get sad or poorly — they’re always happy to see you. The ⭐ pet runs your obstacle course.</div>';
    pets.forEach(function (p) {
      var it = C.item(p.id);
      html += '<div class="slw-card" style="margin-bottom:10px;"><div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">' +
        '<div style="width:120px;">' + ART.pet(p.id, { acc: p.acc }) + '</div>' +
        '<div style="flex:1;min-width:200px;"><div class="nm">' + esc(p.name) + ' <span style="font-weight:700;color:#7c8696;">the ' + esc(it.name.toLowerCase()) + '</span>' + (w.activePet === p.id ? ' 🏅' : '') + '</div>' +
        '<label style="font-size:12px;font-weight:800;color:#4a3f75;">New name <input data-name="' + p.id + '" maxlength="14" value="' + esc(p.name) + '" style="font:inherit;padding:6px 8px;border:2px solid #d9d2ee;border-radius:10px;width:140px;"></label> ' +
        '<button class="slw-btn" type="button" data-rename="' + p.id + '">Save name</button> ' +
        (w.activePet === p.id ? '' : '<button class="slw-btn" type="button" data-active="' + p.id + '">⭐ Run the course</button>') +
        '<div class="slw-err" data-err="' + p.id + '"></div>' +
        (accs.length ? '<div style="font-size:12px;font-weight:800;margin-top:4px;">Wear:</div><div class="slw-tray">' + accs.map(function (a) {
          var on = p.acc[a.slot] === a.id;
          return '<button type="button" class="slw-trayitem" data-acc="' + a.id + '" data-pet="' + p.id + '" style="' + (on ? 'border-color:#6c5ce7;background:#f1edfb;' : '') + '">' + ART.icon(a.id) + '<span>' + esc(a.name) + (on ? ' ✓' : '') + '</span></button>';
        }).join('') + '</div>' : '<div style="font-size:12px;color:#7c8696;font-weight:700;margin-top:4px;">Hats, bows and capes are in the shop’s 🐾 Pets aisle.</div>') +
        '</div></div></div>';
    });
    html += '<button class="slw-btn" type="button" id="slwMorePets">🛍️ More pets & outfits</button>';
    var ov = overlay(html);
    ov.querySelectorAll('[data-rename]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.dataset.rename, val = $('[data-name="' + id + '"]', ov).value, err = $('[data-err="' + id + '"]', ov);
        var v = C.validatePetName(val);
        if (!v.ok) { err.textContent = v.reason; return; }
        commit(function (u) { return C.renamePet(u, id, val); }).then(function (res) {
          if (res && res.ok) { ov._close(); draw(); toast('🐾 Hello, ' + res.name + '!'); openPets(); }
          else err.textContent = (res && res.reason) || 'Couldn’t save that.';
        });
      });
    });
    ov.querySelectorAll('[data-active]').forEach(function (b) { b.addEventListener('click', function () { commit(function (u) { return C.setActivePet(u, b.dataset.active); }).then(function () { ov._close(); draw(); openPets(); }); }); });
    ov.querySelectorAll('[data-acc]').forEach(function (b) { b.addEventListener('click', function () { commit(function (u) { return C.equipAccessory(u, b.dataset.pet, b.dataset.acc); }).then(function () { ov._close(); draw(); openPets(); }); }); });
    $('#slwMorePets', ov).addEventListener('click', function () { ov._close(); openShop('pets'); });
  }

  /* ---------------- info ---------------- */
  function openInfo() {
    var st = arcadeState();
    var ov = overlay('<h2>❓ How My Island works</h2>' +
      '<p style="font-weight:700;line-height:1.6;">📚 <b>Learn</b> anywhere in the app → you earn ⭐ points.<br>🛍️ <b>Spend</b> them in the Island Shop → your island grows.<br>🎮 <b>Play</b> your island games — they’re just for fun and never cost or earn points.<br>' +
      '🐾 Your pets are always happy, even if you have a break.<br>⭐ Spending points never lowers your total-earned score.</p>' + timeHtml(st) +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;"><button class="slw-btn" type="button" id="slwReplay">▶ Show the welcome again</button></div>', { small: true });
    $('#slwReplay', ov).addEventListener('click', function () { ov._close(); showIntro(); });
  }
  function timeHtml(st) {
    if (!st.status.limited) return '<div class="slw-time" style="background:#f1edfb;border-color:#d9d2ee;color:#4a3f75;">🎮 Island games have no daily time limit on this account.</div>';
    var m = Math.floor(st.status.leftSec / 60), s = Math.floor(st.status.leftSec % 60);
    return '<div class="slw-time">⏱️ Your grown-up set <b>' + Math.round(st.status.limitSec / 60) + ' minutes</b> of island games a day. ' +
      (st.status.exhausted ? 'That’s all for today — see you tomorrow! 📚 Learning is still open.' : '<b>' + m + ' min ' + (s ? s + ' s ' : '') + '</b> left today.') + '</div>';
  }

  /* ---------------- intro (once, skippable) ---------------- */
  function maybeIntro() { var w = W(); if (w && !w.introSeen) showIntro(); }
  function showIntro() {
    var slides = [
      ['🏝️', 'This is your island!', 'It’s all yours — with a home, a pet and an obstacle course to play.'],
      ['📚 ➜ ⭐', 'Learn to earn', 'Every time you practise maths, spelling or flags, you earn ⭐ points.'],
      ['⭐ ➜ 🌴', 'Make it amazing', 'Spend ⭐ on trees, pets, a football pitch, a kart track and more. They’re the same ⭐ as the 🎁 Shop’s real prizes — so choose what you’d love most!']
    ];
    var i = 0;
    var ov = overlay('<div class="slw-intro"><div class="card" style="margin:0 auto;" id="slwIntro"></div></div>', { small: true, onClose: finish });
    function finish() { commit(function (u) { var w = C.ensureWorld(u); if (w.introSeen) return { ok: false }; w.introSeen = true; return { ok: true }; }); }
    function paint() {
      var s = slides[i];
      $('#slwIntro', ov).innerHTML = '<div class="hero">' + s[0] + '</div><h2>' + s[1] + '</h2><p style="font-weight:700;color:#4a3f75;">' + s[2] + '</p>' +
        '<div class="slw-dots">' + slides.map(function (_, k) { return '<i class="' + (k === i ? 'on' : '') + '"></i>'; }).join('') + '</div>' +
        '<div style="display:flex;gap:8px;justify-content:center;"><button class="slw-btn" type="button" id="slwSkip">Skip</button><button class="slw-btn big on" type="button" id="slwNext">' + (i < slides.length - 1 ? 'Next ➜' : 'Let’s go! 🎉') + '</button></div>';
      $('#slwSkip', ov).addEventListener('click', function () { ov._close(); });
      $('#slwNext', ov).addEventListener('click', function () { if (i < slides.length - 1) { i++; paint(); } else ov._close(); });
      try { $('#slwNext', ov).focus(); } catch (e) {}
    }
    paint();
  }

  /* ---------------- savings-goal reached ---------------- */
  function checkGoalReached(onOpen) {
    var u = me(); if (!u) return;
    var w = C.ensureWorld(u), gp = C.goalProgress(u);
    if (!gp || !gp.ready || w.goalNotified === gp.id) return;
    commit(function (fu) { var fw = C.ensureWorld(fu); if (fw.goalNotified === gp.id) return { ok: false }; fw.goalNotified = gp.id; return { ok: true }; });
    window._slwLastGoal = gp.id;
    if (onOpen) celebrate({ title: '🎯 You did it!', sub: 'You’ve saved enough for ' + gp.name + '. Buy it now, or keep saving for something bigger.', icon: gp.id, sfx: 'fanfare', btns: [{ label: '🛍️ Go to it', fn: function () { openItem(gp.id); } }] });
  }

  /* ---------------- arcade time (parent limit) ---------------- */
  var qaArcade = null;   /* QA mode only: can IMPOSE a test limit, never lift a family one */
  var CFG_KEY = 'slArcadeCfg';
  function cleanCfg(a) {
    if (!a || typeof a !== 'object') return null;
    var m = +a.dailyMinutes;
    return { dailyMinutes: (m > 0 && m <= 1440) ? Math.round(m) : 0, tz: typeof a.tz === 'string' ? a.tz.slice(0, 64) : 'Europe/London', setAt: +a.setAt || 0 };
  }
  function familyArcadeCfg() {
    var live = null, u = me();
    try {
      var cs = window.cloudState;
      if (cs && cs.doc && cs.doc.familyCode && u && cs.boundName === u.name) live = cleanCfg(window.slFamilyCfg && window.slFamilyCfg.arcade);
    } catch (e) { live = null; }
    var dev = null; try { dev = cleanCfg(JSON.parse(localStorage.getItem(CFG_KEY) || 'null')); } catch (e) {}
    var prof = null; try { prof = cleanCfg(u && u.world && u.world.arcadeCfg); } catch (e) {}
    if (live) {
      /* remember the parent's latest setting; only a newer owner setting replaces it */
      if (!dev || live.setAt >= dev.setAt) { try { localStorage.setItem(CFG_KEY, JSON.stringify(live)); } catch (e) {} dev = live; }
      if (u && u.world && (!prof || live.setAt > prof.setAt || live.dailyMinutes !== prof.dailyMinutes)) { u.world.arcadeCfg = live; try { saveState(); } catch (e) {} }
      return live.dailyMinutes ? live : qaArcade;
    }
    /* signed out / offline / another profile on this device: the newest remembered setting applies */
    var best = [prof, dev].filter(Boolean).sort(function (a, b) { return b.setAt - a.setAt; })[0];
    if (best && best.dailyMinutes) return best;
    return qaArcade;
  }
  function perfNow() { return (window.performance && performance.now) ? performance.now() : Date.now(); }
  function nowMs() { return timeAnchor.at + (perfNow() - timeAnchor.perf); }
  var measuring = false;
  function measureServerTime() {
    if (measuring) return;
    measuring = true;
    try {
      var p0 = perfNow();
      fetch(location.pathname + '?t=' + Date.now(), { method: 'HEAD', cache: 'no-store' }).then(function (r) {
        measuring = false;
        var d = r.headers.get('Date'); if (!d) return;
        var srv = Date.parse(d); if (!isFinite(srv)) return;
        var p1 = perfNow();
        timeAnchor = { at: srv + 500, perf: (p0 + p1) / 2, server: true };   /* Date header has 1 s resolution */
      }).catch(function () { measuring = false; });
    } catch (e) { measuring = false; }
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) measureServerTime(); });
  function localKey() { return 'slArcade:' + String(state.activeUser || '').toLowerCase(); }
  function arcadeState() {
    var cfg = familyArcadeCfg();
    var tz = (cfg && cfg.tz) || 'Europe/London';
    var day = C.dayKey(nowMs(), tz);
    var w = W(), lk = null;
    try { lk = JSON.parse(localStorage.getItem(localKey()) || 'null'); } catch (e) {}
    var latest = Object.keys((w && w.arcade && w.arcade.days) || {}).concat(lk && lk.d ? [lk.d] : []).sort().pop();
    if (latest && day < latest) day = latest;
    var used = C.arcadeUsed(w, day);
    if (lk && lk.d === day && lk.s > used) used = lk.s;
    return { cfg: cfg, day: day, used: used, status: C.arcadeStatus(cfg, used) };
  }
  var sinceMirror = 0;
  function arcadeTick(sec) {
    /* counts one active second at a time; tabs share the per-device total */
    var st = arcadeState();
    var total = st.used + sec;
    try { localStorage.setItem(localKey(), JSON.stringify({ d: st.day, s: total })); } catch (e) {}
    sinceMirror += sec;
    if (sinceMirror >= 10) { sinceMirror = 0; arcadeMirror(st.day, total); }
    return arcadeState();
  }
  function arcadeMirror(day, total) {
    /* copy into the synced profile so other devices / reloads see it (max, never added twice) */
    try { var u = me(); if (C.arcadeMax(u, day, total)) saveState(); } catch (e) {}
  }
  function arcadeFlush() { var st = arcadeState(); sinceMirror = 0; arcadeMirror(st.day, st.used); }

  /* ---------------- games ---------------- */
  var GAMES = {
    course: { name: 'Pet Obstacle Course', att: 'att_course', file: 'pet-course.js', grad: 'linear-gradient(135deg,#43c66f,#2a9d8f)', emoji: '🐾' },
    penalty: { name: 'Penalty Shootout', att: 'att_pitch', file: 'penalty.js', grad: 'linear-gradient(135deg,#4a8ff0,#6c5ce7)', emoji: '⚽' },
    kart: { name: 'Kart Time Trial', att: 'att_kart', file: 'kart.js', grad: 'linear-gradient(135deg,#ff8a3d,#e94b4b)', emoji: '🏎️' }
  };
  var loaded = {};
  function loadScript(src) {
    if (loaded[src]) return loaded[src];
    loaded[src] = new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = res; s.onerror = function () { delete loaded[src]; rej(new Error('load ' + src)); };
      document.head.appendChild(s);
    });
    return loaded[src];
  }
  function loadGame(game) {
    var v = window.SL_WORLD_VER || '1';
    try { if (localStorage.getItem('slQaMode') === '1') v += '&qa=' + Date.now(); } catch (e) {}
    return loadScript('world/games/shell.js?v=' + v).then(function () { return loadScript('world/games/' + GAMES[game].file + '?v=' + v); });
  }
  function pbText(game) {
    var w = W(), out = [];
    Object.keys(w.pb).forEach(function (k) {
      if (k.indexOf(game + ':') !== 0) return;
      var rec = w.pb[k], vid = k.split(':')[1], it = C.item(vid);
      out.push((it ? it.name : 'Best') + ': ' + (rec.ms != null ? (rec.ms / 1000).toFixed(2) + 's' : 'score ' + fmt(rec.score)));
    });
    return out.length ? '🏆 ' + out.join(' · ') : 'No best yet — set one!';
  }
  function openGames() {
    var w = W(), st = arcadeState();
    var html = '<h2>🎮 Island games</h2>' + timeHtml(st) + '<div class="slw-games">';
    Object.keys(GAMES).forEach(function (g) {
      var G = GAMES[g], own = C.owns(w, G.att);
      html += '<div class="slw-game' + (own ? '' : ' locked') + '" style="background:' + G.grad + ';"><h3>' + G.emoji + ' ' + G.name + '</h3>' +
        '<div class="pb">' + (own ? esc(pbText(g)) : '🔒 Unlock with the ' + esc(C.item(G.att).name) + ' in the shop') + '</div>' +
        '<button class="slw-btn big" type="button" data-play="' + g + '">' + (own ? '▶ Play' : '👀 See it in the shop') + '</button></div>';
    });
    var ov = overlay(html + '</div>');
    ov.querySelectorAll('[data-play]').forEach(function (b) { b.addEventListener('click', function () { ov._close(); launch(b.dataset.play); }); });
  }
  var running = null;
  function launch(game) {
    var G = GAMES[game]; if (!G) return;
    var w = W();
    /* ownership gate — every entry point (island, menu, URL) comes through here */
    if (!C.owns(w, G.att)) { openItem(G.att); return; }
    if (running) return;
    if (placing) { placing = null; document.removeEventListener('keydown', placeKeys); mode = 'play'; draw(); }
    var st = arcadeState();
    if (C.roundGate(st.status).allowed === false) {
      var ov = overlay('<h2>⏱️ That’s all the game time for today</h2><p style="font-weight:700;">Your grown-up set ' + Math.round(st.status.limitSec / 60) + ' minutes of island games a day. Your games are still yours — come back tomorrow!</p><button class="slw-btn big on" type="button" id="slwToLearn">📚 Learning is open — let’s go</button>', { small: true });
      $('#slwToLearn', ov).addEventListener('click', function () { ov._close(); if (typeof setActiveApp === 'function') setActiveApp('maths'); });
      return;
    }
    var launchedFor = state.activeUser;
    running = { game: game };
    loadGame(game).then(function () {
      var world = W();
      var pet = C.petById(world, world.activePet) || world.pets[0];
      var cfg = {
        variant: game === 'course' ? C.selected(world, 'course') : game === 'kart' ? C.selected(world, 'track') : 'std',
        ownedVariants: C.CATALOG.filter(function (it) { return it.game === game && it.kind === 'variant' && C.owns(world, it.id); }).map(function (it) { return { id: it.id, name: it.name }; }),
        pet: pet ? { id: pet.id, name: pet.name, acc: pet.acc } : { id: 'pet_puppy', name: 'Buddy', acc: {} },
        ball: C.selected(world, 'ball'), stadium: C.selected(world, 'stadium'), kart: C.selected(world, 'kart'),
        pb: world.pb, tutSeen: !!world.tutSeen[game], reduced: reduced,
        muted: function () { var u = me(); return !!(u && u.muted); },
        toggleMute: function () { var u = me(); if (!u) return false; u.muted = !u.muted; saveState(); try { if (typeof renderMuteBtn === 'function') renderMuteBtn(); } catch (e) {} return u.muted; },
        arcade: {
          status: function () { return arcadeState().status; },
          gate: function () { return C.roundGate(arcadeState().status); },
          tick: function (sec) { return arcadeTick(sec).status; },
          flush: arcadeFlush
        },
        onTutorialSeen: function () { commit(function (u) { C.ensureWorld(u).tutSeen[game] = true; return { ok: true }; }); },
        onSelectVariant: function (vid) { commit(function (u) { return C.select(u, vid); }); },
        onResult: function (variant, result) {
          /* results go only to the profile that launched the game, and never touch points */
          if (state.activeUser !== launchedFor) return Promise.resolve({ ok: false });
          return commit(function (u) { return C.recordResult(u, game, variant, result); });
        },
        onExit: function () {
          arcadeFlush();
          running = null;
          window.slGameBusy = false;
          draw();
        }
      };
      window.slGameBusy = true;
      window.SLGames[game].start(cfg);
    }).catch(function () {
      running = null;
      toast('⚠️ Couldn’t load the game — check your connection and try again.');
    });
  }

  /* ---------------- leaving the island tab ---------------- */
  function onHide() {
    if (placing) { placing = null; document.removeEventListener('keydown', placeKeys); }
    mode = 'play'; selectedUid = null;
    stopPets();
    renderedFor = null;
  }

  /* ---------------- profile switches / external changes ---------------- */
  function onUserChanged() {
    if (!root || !document.getElementById('worldView') || document.getElementById('worldView').classList.contains('hidden')) { renderedFor = null; return; }
    closeAllOverlays();
    placing = null; mode = 'play'; selectedUid = null;
    document.removeEventListener('keydown', placeKeys);
    render();
  }
  function onPointsChanged() {
    if (!root) return;
    var el = document.getElementById('slwPts'); var u = me();
    if (el && u) el.textContent = fmt(u.points);
    var g = root.querySelector('.slw-goal');
    if (g && u) { var tmp = document.createElement('div'); tmp.innerHTML = goalHtml(u); g.replaceWith(tmp.firstChild); var ng = root.querySelector('.slw-goal'); if (ng) ng.addEventListener('click', function () { if (W().goal) openItem(W().goal); else openShop(); }); }
  }

  window.SLWorld = {
    render: render,
    onUserChanged: onUserChanged,
    onPointsChanged: onPointsChanged,
    onHide: onHide,
    renderedFor: function () { return renderedFor; },
    launch: launch,
    openShop: openShop,
    openItem: openItem,
    _qa: function () {
      try { if (localStorage.getItem('slQaMode') !== '1') return null; } catch (e) { return null; }
      return { C: C, commit: commit, commitPurchase: commitPurchase, arcadeState: arcadeState, arcadeTick: arcadeTick, state: function () { return { mode: mode, placing: placing, selectedUid: selectedUid, running: running }; }, setServerOffset: function (ms) { timeAnchor = { at: Date.now() + ms, perf: perfNow(), server: true }; }, setArcadeCfg: function (cfg) { qaArcade = cfg || null; } };
    }
  };
})();
