/* ================================================================
   Debut Run — HTML HUD (window.SLCourseHUD).
   One glass layer over the game, shared by the 3D view and the 2D
   fallback. It only READS round.state / round.course and the round's
   events (drained by the shell after each draw); it never changes the
   logic. pointer-events: none, so taps still reach the game.
     top-left    hearts as Spark Sticks (✦ heads) in the child's colour
     top-centre  HYPE bar (notches x2 / x3 / FEVER) + E N C O R E slots
     top-right   treats · ✦ glow stars · score
     bottom      mini runway: 5 Stage Door dots, pet marker, finish flag
     centre      one pop at a time (section names, FEVER!, BOUNCE!…)
   ENCORE CITY skin (v2): night-glass panels (rgba(22,18,40,.72), a 1px
   rgba(255,255,255,.12) edge; solid #15112A on html.sl-low or without
   backdrop-filter), flat 12px corners, Outfit for every HUD word and
   number (tabular-nums), Unbounded 800 for the big pops, Star Gold and
   the member colour as the accents. Text on a panel is white, Star Gold
   or #E6E1F7 (≥ 4.5:1 even over a white scene).
   Only heart changes, 'Encore unlocked' and the curtain call are
   announced (aria-live polite); the shell's top text stays the
   accessible summary.

   SHORT LANDSCAPE (phones held sideways, COMPACT.mq): the top band is
   where the action flies — ENCORE letters, glow stars and the pet at
   every double-jump / BOING apex — so nothing may sit there. Hearts,
   HYPE + letters, the counter and the 'TAP to jump!' tip stack in a
   narrow column at the left edge, BEHIND the pet (left of its screen x
   in the 3D follow camera and in the letterboxed 2D view alike), and
   the mini runway drops to the bottom between the pads.
   ================================================================ */
(function () {
  'use strict';
  /* the short-landscape column, in px (the CSS below is built from these numbers; the Node
     tests project the real course against the same rectangles) */
  var COMPACT = {
    mq: '(max-height: 500px) and (orientation: landscape)',
    x: 8, w: 132,                          /* the column's left edge and its widest panel (the tip) */
    hearts: { top: 6, h: 32 }, mid: { top: 42, h: 56 }, cnt: { top: 102, h: 42 }, tip: { top: 150 },
    prog: { bottom: 12, side: 150 },       /* the mini runway: clear of the pads at both sides */
    /* the smallest phones (568 wide): the letterboxed 2D pet starts ~135 px in, so the tip shrinks */
    narrow: { mq: '(max-height: 500px) and (orientation: landscape) and (max-width: 600px)', w: 118 }
  };
  var LETTERS_TIP = 'Collect all 6 letters for an ENCORE stage!', LETTERS_TIP_SHORT = 'All 6 letters = ENCORE!';
  function compactCss() {
    var C = COMPACT, px = function (v) { return v + 'px'; };
    return '@media ' + C.mq + '{' + [
      '.slc-hearts{left:' + px(C.x) + ';top:' + px(C.hearts.top) + ';height:' + px(C.hearts.h) + ';padding:2px 8px;}',
      '.slc-w{width:18px;height:24px;}',
      '.slc-mid{left:' + px(C.x) + ';top:' + px(C.mid.top) + ';height:' + px(C.mid.h) + ';transform:none;min-width:0;padding:4px 8px;gap:3px;justify-content:center;}',
      '.slc-hype{height:8px;}',
      '.slc-hl{font-size:11px;}',
      '.slc-letters{gap:2px;}',
      '.slc-l{width:16px;height:18px;font-size:11px;border-radius:5px;}',
      '.slc-cnt{left:' + px(C.x) + ';right:auto;top:' + px(C.cnt.top) + ';height:' + px(C.cnt.h) + ';max-width:' + px(C.w) + ';padding:4px 10px;font-size:13px;line-height:1.2;white-space:normal;display:flex;align-items:center;}',
      '.slc-tip{left:' + px(C.x) + ';transform:none;bottom:auto;top:' + px(C.tip.top) + ';max-width:' + px(C.w) + ';padding:5px 10px;border-width:2px;border-radius:12px;font-size:15px;line-height:1.2;white-space:normal;}',
      '.slc-tip.big{font-size:16px;}',
      '.slc-prog{bottom:' + px(C.prog.bottom) + ';width:min(420px,calc(100% - ' + px(2 * C.prog.side) + '));}'
    ].join('') + '}\n@media ' + C.narrow.mq + '{' + [
      '.slc-cnt,.slc-tip{max-width:' + px(C.narrow.w) + ';}',
      '.slc-tip{font-size:13px;padding:5px 8px;}',
      '.slc-tip.big{font-size:14px;}'
    ].join('') + '}';
  }
  function compactNow() { try { return !!(window.matchMedia && window.matchMedia(COMPACT.mq).matches); } catch (e) { return false; } }
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    if (typeof module === 'object' && module.exports) module.exports = { COMPACT: COMPACT, compactCss: compactCss };
    return;
  }

  var PET_HEAD = { pet_puppy: '🐶', pet_kitten: '🐱', pet_bunny: '🐰', pet_dragon: '🐲' };
  var POP_BIG = { door: 1, fever: 1, tier: 1, cleanStage: 1, lettersComplete: 1, encoreStart: 1, finish: 1, curtain: 1 };
  /* the island's type tokens (world/island-encore.css), with the same fallbacks when that sheet is absent */
  var UI_FONT = 'var(--sle-ui,"Outfit",system-ui,-apple-system,"Segoe UI",sans-serif)';
  var DISPLAY_FONT = 'var(--sle-display,"Unbounded","Outfit",system-ui,sans-serif)';
  /* the four-point ✦ spark on a 24 grid (the Spark Stick head; never the five-point reward star) */
  var SPARK = 'M12 1.5C12.9 7.6 16.4 11.1 22.5 12C16.4 12.9 12.9 16.4 12 22.5C11.1 16.4 7.6 12.9 1.5 12C7.6 11.1 11.1 7.6 12 1.5Z';

  function injectCss() {
    if (document.getElementById('slcHudCss')) return;
    var c = document.createElement('style'); c.id = 'slcHudCss';
    c.textContent = [
      '.slc-hud{position:absolute;inset:0;pointer-events:none;z-index:2;font-family:' + UI_FONT + ';font-variant-numeric:tabular-nums;color:#FFFFFF;}',
      '.slc-hud[hidden]{display:none;}',
      /* night glass, as on the island; solid where blur is missing or on the LOW tier */
      '.slc-p{position:absolute;background:rgba(22,18,40,.72);-webkit-backdrop-filter:blur(16px) saturate(1.3);backdrop-filter:blur(16px) saturate(1.3);border:1px solid rgba(255,255,255,.12);border-radius:12px;',
      '  box-shadow:0 12px 32px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.08);}',
      '@supports not ((backdrop-filter:blur(2px)) or (-webkit-backdrop-filter:blur(2px))){.slc-p{background:#15112A;}}',
      'html.sl-low .slc-p{background:#15112A;-webkit-backdrop-filter:none;backdrop-filter:none;}',
      /* the Showtime stretch (section 4 on): the same glass with a magenta edge */
      '.slc-hud.show .slc-p{border-color:rgba(255,95,176,.35);box-shadow:0 12px 32px rgba(0,0,0,.45),0 0 18px rgba(255,46,154,.18),inset 0 1px 0 rgba(255,255,255,.08);}',
      '.slc-hearts{left:10px;top:8px;padding:5px 10px;display:flex;gap:2px;align-items:center;}',
      '.slc-w{width:26px;height:34px;display:block;overflow:visible;}',
      '.slc-w.lost{opacity:.6;}',
      '.slc-w.crack{animation:slcCrack .4s ease-in forwards;}',
      '.slc-w.last{animation:slcPulse 1s ease-in-out infinite;}',
      '@keyframes slcCrack{0%{transform:none;}30%{transform:rotate(-14deg) scale(1.12);}100%{transform:rotate(0) scale(.92);opacity:.6;}}',
      '@keyframes slcPulse{0%,100%{transform:scale(1);}50%{transform:scale(1.12);}}',
      '.slc-mid{left:50%;top:8px;transform:translateX(-50%);padding:6px 12px 7px;display:flex;flex-direction:column;align-items:center;gap:4px;min-width:min(330px,46vw);}',
      '.slc-hype{position:relative;width:100%;height:16px;border-radius:999px;background:rgba(255,255,255,.12);box-shadow:inset 0 0 0 1px rgba(255,255,255,.12);overflow:hidden;}',
      '.slc-fill{position:absolute;left:0;top:0;bottom:0;width:0;border-radius:999px;background:linear-gradient(90deg,#22E4FF,#8A5CFF 55%,#FF2E9A);transition:width .25s;}',
      '.slc-hype.fever .slc-fill{background:linear-gradient(90deg,#FF7AD9,#7AD7FF,#9DFFCF,#FFE27A,#FF7AD9);}',
      '.slc-hype.shatter .slc-fill{transition:none;}',
      '.slc-hype.shatter{animation:slcShatter .4s ease-out;}',
      '@keyframes slcShatter{0%{transform:scale(1.04);filter:brightness(1.35);}100%{transform:none;filter:none;}}',
      '.slc-notch{position:absolute;top:0;bottom:0;width:2px;background:rgba(255,255,255,.75);}',
      '.slc-hl{font-weight:800;font-size:13px;line-height:1;letter-spacing:.06em;color:#FFFFFF;}',
      '.slc-hype.fever + .slc-hl{color:#FFD23F;text-shadow:0 0 8px rgba(255,46,154,.75);}',
      '.slc-letters{display:flex;gap:4px;}',
      /* uncollected letters sit in dark wells; collected ones turn to foil with ink letters */
      '.slc-l{width:20px;height:24px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;',
      '  background:rgba(0,0,0,.28);box-shadow:inset 0 0 0 1px rgba(255,255,255,.16);color:rgba(230,225,247,.7);}',
      '.slc-l.got{background:conic-gradient(from 200deg,#FF7AD9,#7AD7FF,#9DFFCF,#FFE27A,#FF7AD9);color:#14101F;box-shadow:0 0 0 1px rgba(255,255,255,.85),0 0 10px rgba(255,122,217,.45);}',
      '.slc-cnt{right:10px;top:8px;padding:7px 14px;font-weight:800;font-size:17px;white-space:nowrap;}',
      '.slc-prog{position:absolute;left:50%;transform:translateX(-50%);bottom:calc(clamp(64px,13vmin,104px) + 26px);width:min(420px,56vw);height:26px;}',
      '.slc-track{position:absolute;left:0;right:0;top:9px;height:8px;border-radius:999px;background:rgba(14,11,26,.55);box-shadow:inset 0 0 0 1px rgba(255,255,255,.18);}',
      '.slc-pf{position:absolute;left:0;top:0;bottom:0;border-radius:999px;background:linear-gradient(90deg,#FFD23F,#FF2E9A);}',
      '.slc-dot{position:absolute;top:8px;width:10px;height:10px;margin-left:-5px;border-radius:50%;background:rgba(255,255,255,.4);box-shadow:0 0 0 1.5px rgba(14,11,26,.6);}',
      '.slc-dot.on{background:#FFD23F;box-shadow:0 0 0 1.5px rgba(14,11,26,.6),0 0 6px rgba(255,210,63,.6);}',
      '.slc-pet{position:absolute;top:-2px;margin-left:-13px;font-size:22px;line-height:1;filter:drop-shadow(0 2px 2px rgba(14,11,26,.5));}',
      '.slc-flag{position:absolute;right:-16px;top:-1px;font-size:20px;line-height:1;}',
      /* the big pops: Unbounded 800 in white → Star Gold with an ink edge and a magenta glow */
      '.slc-pop{position:absolute;left:0;right:0;top:32%;text-align:center;font-family:' + DISPLAY_FONT + ';font-weight:800;letter-spacing:-.01em;font-size:clamp(32px,7vw,68px);line-height:1;',
      '  background:linear-gradient(180deg,#FFFFFF 0%,#FFE27A 58%,#FFD23F 100%);-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-stroke:1.5px rgba(20,16,31,.55);',
      '  filter:drop-shadow(0 4px 0 rgba(14,11,26,.55)) drop-shadow(0 0 16px rgba(255,46,154,.5));opacity:0;}',
      '.slc-pop.on{animation:slcPop .9s cubic-bezier(.2,.9,.3,1) forwards;}',
      '.slc-pop.small{font-size:clamp(22px,4.6vw,42px);}',
      '@keyframes slcPop{0%{opacity:0;transform:scale(.6);}18%{opacity:1;transform:scale(1.04);}30%{transform:scale(1);}80%{opacity:1;}100%{opacity:0;transform:translateY(-10px);}}',
      '.slc-tip{position:absolute;left:50%;transform:translateX(-50%);bottom:calc(clamp(64px,13vmin,104px) + 66px);padding:8px 18px;border-radius:12px;',
      '  background:rgba(22,18,40,.82);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);border:2px solid #22E4FF;box-shadow:0 0 14px rgba(34,228,255,.35),0 8px 20px rgba(0,0,0,.4);',
      '  color:#FFFFFF;font-weight:800;font-size:clamp(16px,3.4vmin,22px);white-space:nowrap;opacity:0;transition:opacity .25s;}',
      'html.sl-low .slc-tip{background:#15112A;-webkit-backdrop-filter:none;backdrop-filter:none;}',
      '.slc-tip.on{opacity:1;}.slc-tip.big{font-size:clamp(22px,5vmin,32px);}',
      '.slc-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;}',
      /* reduced motion: no pulses or shakes, and the pops only fade in and out (no scale, no drift) */
      '@keyframes slcFade{0%{opacity:0;}12%{opacity:1;}80%{opacity:1;}100%{opacity:0;}}',
      '.slc-hud.rm .slc-w,.slc-hud.rm .slc-hype{animation:none !important;}',
      '.slc-hud.rm .slc-pop.on{animation:slcFade .9s linear forwards;}',
      '@media (prefers-reduced-motion: reduce){.slc-w,.slc-hype{animation:none !important;}.slc-pop.on{animation:slcFade .9s linear forwards;}}',
      '@media (max-width:560px){.slc-cnt{font-size:14px;padding:5px 10px;}.slc-w{width:20px;height:27px;}.slc-mid{top:48px;}}',
      compactCss()                                /* last, so it wins over the rules above */
    ].join('\n');
    document.head.appendChild(c);
  }
  function el(tag, cls) { var e = document.createElement(tag); if (cls) e.className = cls; return e; }
  function fmt(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function safeCol(c) { return /^#[0-9a-f]{6}$/i.test(c || '') ? c : '#8A5CFF'; }
  /* a heart as a Spark Stick: a Midnight Ink handle with a member-colour grip and a Gunmetal collar,
     topped by a ✦ in the child's colour with a white inner ✦ (a lost heart: an empty outline ✦) */
  function wandSvg(col, lost) {
    var head = 'translate(13 9) scale(.78) translate(-12 -12)', core = 'translate(13 9) scale(.47) translate(-12 -12)';
    return '<svg class="slc-w' + (lost ? ' lost' : '') + '" viewBox="0 0 26 34" aria-hidden="true">' +
      (lost ? '' : '<circle cx="13" cy="9" r="10.5" fill="' + col + '" opacity=".3"/>') +
      '<rect x="11.2" y="16.5" width="3.6" height="16.5" rx="1.8" fill="' + (lost ? '#221C3A' : '#14101F') + '" stroke="rgba(255,255,255,.55)" stroke-width="1"/>' +
      '<rect x="11.2" y="23.5" width="3.6" height="4" fill="' + (lost ? '#4A4560' : col) + '"/>' +
      '<rect x="10.3" y="15.4" width="5.4" height="2.6" rx="1" fill="#5A5F72"/>' +
      '<path transform="' + head + '" d="' + SPARK + '" fill="' + (lost ? 'none' : col) + '" stroke="' + (lost ? 'rgba(230,225,247,.7)' : '#FFFFFF') + '" stroke-width="2.2" stroke-linejoin="round"/>' +
      (lost ? '' : '<path transform="' + core + '" d="' + SPARK + '" fill="#FFFFFF" opacity=".85"/>') +
      '</svg>';
  }

  function mount(mid, cfg) {
    if (!mid) return null;
    injectCss();
    cfg = cfg || {};
    var col = safeCol(cfg.user && cfg.user.color);
    var root = el('div', 'slc-hud'); root.hidden = true;
    if (cfg.reduced) root.classList.add('rm');
    root.innerHTML =
      '<div class="slc-p slc-hearts"></div>' +
      '<div class="slc-p slc-mid"><div class="slc-hype"><div class="slc-fill"></div><i class="slc-notch" style="left:25%"></i><i class="slc-notch" style="left:62.5%"></i></div>' +
      '<div class="slc-hl">HYPE x1</div><div class="slc-letters"></div></div>' +
      '<div class="slc-p slc-cnt"></div>' +
      '<div class="slc-prog"><div class="slc-track"><div class="slc-pf"></div></div><span class="slc-flag">🏁</span><span class="slc-pet"></span></div>' +
      '<div class="slc-pop"></div><div class="slc-tip"></div><span class="slc-sr" aria-live="polite"></span>';
    mid.appendChild(root);
    var $ = function (s) { return root.querySelector(s); };
    var heartsEl = $('.slc-hearts'), hypeEl = $('.slc-hype'), fillEl = $('.slc-fill'), hlEl = $('.slc-hl'), lettersEl = $('.slc-letters');
    var cntEl = $('.slc-cnt'), progEl = $('.slc-prog'), pfEl = $('.slc-pf'), petEl = $('.slc-pet'), popEl = $('.slc-pop'), tipEl = $('.slc-tip'), srEl = $('.slc-sr');
    for (var i = 0; i < 6; i++) { var l = el('b', 'slc-l'); l.textContent = 'ENCORE'[i]; lettersEl.appendChild(l); }
    var letterEls = lettersEl.children;

    var last = { round: null, hearts: -1, max: -1, hype: -1, fever: null, mult: -1, letters: -1, cnt: '', prog: -1, show: null, sec: -1 };
    var popQ = [], popUntil = 0, popLv = 0, tipUntil = 0, tipText = '', lastBonk = -1e9;
    function now() { return (window.performance && performance.now()) || Date.now(); }
    function say(t) { srEl.textContent = ''; setTimeout(function () { srEl.textContent = t; }, 30); }
    /* one pop at a time. Levels: 0 PERFECT! (only when idle) · 1 BOUNCE! (may replace a PERFECT!) ·
       2 the big moments (queued, up to 3) */
    function pop(text, lv) {
      if (lv >= 2) { if (popQ.length < 3) popQ.push({ t: text, lv: 2 }); return; }
      if (popQ.length || (now() < popUntil && lv <= popLv)) return;
      popQ.push({ t: text, lv: lv });
    }
    function showPop() {
      if (!popQ.length) return;
      var p = popQ[0], busy = now() < popUntil - (p.lv >= 2 ? 450 : 0);
      if (busy && !(p.lv > popLv && popLv < 2)) return;
      popQ.shift();
      popEl.textContent = p.t;
      popEl.classList.toggle('small', p.lv < 2 || p.t.length > 12);
      popEl.classList.remove('on'); void popEl.offsetWidth; popEl.classList.add('on');
      popUntil = now() + (p.lv >= 2 ? 1000 : 650); popLv = p.lv;
    }
    function tip(text, ms, big) { tipText = text; tipUntil = now() + ms; tipEl.textContent = text; tipEl.classList.toggle('big', !!big); tipEl.classList.add('on'); }
    function buildDots(round) {
      var secs = round.sections || [], fd = round.course.finishD || round.course.length || 1, html = '';
      for (var k = 1; k < secs.length; k++) html += '<i class="slc-dot" style="left:' + (100 * secs[k].d0 / fd).toFixed(2) + '%"></i>';
      progEl.querySelectorAll('.slc-dot').forEach(function (d) { d.remove(); });
      progEl.insertAdjacentHTML('afterbegin', html);
      petEl.textContent = PET_HEAD[(round.pet && round.pet.id) || 'pet_puppy'] || '🐾';
    }
    function hearts(s) {
      var lastOne = s.hearts === 1 && !s.finished;
      if (s.hearts === last.hearts && s.maxHearts === last.max) {
        if (heartsEl.firstChild && heartsEl.firstChild.classList.contains('last') !== lastOne) heartsEl.firstChild.classList.toggle('last', lastOne);
        return;
      }
      var crackIdx = -1;
      if (last.hearts >= 0 && s.hearts < last.hearts) {
        crackIdx = s.hearts;                      /* the wand that was just lost cracks once, then stays grey */
        if (s.hearts > 0) say('Ouch! ' + s.hearts + (s.hearts === 1 ? ' heart' : ' hearts') + ' left.');
      } else if (last.hearts >= 0 && s.hearts > last.hearts) say('Heart back! ' + s.hearts + (s.hearts === 1 ? ' heart.' : ' hearts.'));
      var html = '';
      for (var k = 0; k < s.maxHearts; k++) html += wandSvg(col, k >= s.hearts);
      heartsEl.innerHTML = html;
      var ws = heartsEl.children;
      if (crackIdx >= 0 && ws[crackIdx]) ws[crackIdx].classList.add('crack');
      if (lastOne && ws[0]) ws[0].classList.add('last');   /* the last heart pulses at 1 Hz */
      last.hearts = s.hearts; last.max = s.maxHearts;
    }
    function events(round) {
      var ev = round.events; if (!ev || !ev.length) return;
      var secs = round.sections || [];
      for (var k = 0; k < ev.length; k++) {
        var e = ev[k];
        switch (e.type) {
          case 'takeoff': if (e.grade === 3) pop('PERFECT!', 0); break;
          case 'boing': pop('BOUNCE!', 1); break;
          case 'tier': if (e.mult === 2 || e.mult === 3) pop('HYPE x' + e.mult + '!', 2); break;
          case 'fever': pop('FEVER!', 2); break;
          case 'door': pop((secs[e.sec] && secs[e.sec].pop) || e.name, 2); break;
          case 'cleanStage': pop('CLEAN STAGE +25', 2); break;
          case 'letter': if (e.li >= 0 && round.state.lettersMask === (1 << e.li)) tip(compactNow() ? LETTERS_TIP_SHORT : LETTERS_TIP, 2600, false); break;
          case 'lettersComplete': pop('ENCORE UNLOCKED!', 2); say('Encore unlocked!'); break;
          case 'encoreStart': pop('ENCORE!', 2); break;
          case 'finish': pop('SHOW COMPLETE!', 2); break;
          case 'curtain': pop('CURTAIN CALL!', 2); say('Curtain call!'); break;
          case 'bump': if (e.rehearsal) lastBonk = now(); else { hypeEl.classList.remove('shatter'); void hypeEl.offsetWidth; hypeEl.classList.add('shatter'); } break;
        }
      }
    }
    /* 'TAP to jump!' / '⬇ SLIDE!' while a rehearsal prop is coming up */
    function prompts(round) {
      var s = round.state, obs = round.course.obs;
      if (now() < tipUntil && tipText.indexOf('ENCORE') >= 0) return;
      var want = '';
      if (s.phase === 'run') {
        for (var i = s.oc; i < obs.length && i < s.oc + 3; i++) {
          var o = obs[i]; if (o.passed || o.hit) continue;
          if (o.rehearsal && o.cueX - (s.dist + 235) < 520) want = o.kind === 'bar' ? '⬇ SLIDE!' : 'TAP to jump!';
          break;
        }
      }
      if (want) {
        var big = now() - lastBonk < 1600;                /* bigger right after a rehearsal bonk */
        if (want !== tipText || !tipEl.classList.contains('on')) tip(want, 400, big);
        else { tipUntil = now() + 400; if (tipEl.classList.contains('big') !== big) tipEl.classList.toggle('big', big); }
      } else if (now() > tipUntil) tipEl.classList.remove('on');
    }

    function update(round, phase) {
      var live = !!round && (phase === 'countdown' || phase === 'playing' || phase === 'paused');
      if (root.hidden === live) root.hidden = !live;
      if (!live) return;
      var s = round.state;
      if (round !== last.round) {                 /* a fresh round: rebuild everything */
        last = { round: round, hearts: -1, max: -1, hype: -1, fever: null, mult: -1, letters: -1, cnt: '', prog: -1, show: null, sec: -1 };
        popQ.length = 0; popUntil = 0; popLv = 0; tipUntil = 0; tipText = '';
        tipEl.classList.remove('on'); popEl.classList.remove('on');
        buildDots(round);
      }
      events(round);
      hearts(s);
      var showtime = s.section >= 3;
      if (showtime !== last.show) { root.classList.toggle('show', showtime); last.show = showtime; }
      if (s.hype !== last.hype || s.fever !== last.fever || s.mult !== last.mult) {
        fillEl.style.width = (100 * Math.min(1, s.hype / 32)).toFixed(1) + '%';
        hypeEl.classList.toggle('fever', s.fever);
        hlEl.textContent = s.fever ? 'FEVER x4' : 'HYPE x' + s.mult;
        last.hype = s.hype; last.fever = s.fever; last.mult = s.mult;
      }
      if (s.lettersMask !== last.letters) {
        for (var k = 0; k < 6; k++) letterEls[k].classList.toggle('got', !!(s.lettersMask & (1 << k)));
        last.letters = s.lettersMask;
      }
      var cnt = (round.treatIcon || '🦴') + ' ' + s.treats + ' · ✦ ' + s.stars + ' · ' + fmt(Math.max(0, Math.round(s.score)));
      if (cnt !== last.cnt) { cntEl.textContent = cnt; last.cnt = cnt; }
      var pg = Math.round(s.progress * 400) / 4;
      if (pg !== last.prog) { pfEl.style.width = pg + '%'; petEl.style.left = pg + '%'; last.prog = pg; }
      if (s.section !== last.sec) {
        progEl.querySelectorAll('.slc-dot').forEach(function (d, i) { d.classList.toggle('on', s.section > i); });
        last.sec = s.section;
      }
      prompts(round);
      showPop();
    }
    function dispose() { if (root.parentNode) root.parentNode.removeChild(root); }
    return { update: update, dispose: dispose };
  }

  window.SLCourseHUD = { mount: mount, COMPACT: COMPACT };
  if (typeof module === 'object' && module.exports) module.exports = { mount: mount, COMPACT: COMPACT, compactCss: compactCss };
})();
