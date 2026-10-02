/* ================================================================
   Debut Run — HTML HUD (window.SLCourseHUD).
   One glass layer over the game, shared by the 3D view and the 2D
   fallback. It only READS round.state / round.course and the round's
   events (drained by the shell after each draw); it never changes the
   logic. pointer-events: none, so taps still reach the game.
     top-left    hearts as glow wands in the child's colour
     top-centre  HYPE bar (notches x2 / x3 / FEVER) + E N C O R E slots
     top-right   treats · ✦ glow stars · score
     bottom      mini runway: 5 Stage Door dots, pet marker, finish flag
     centre      one pop at a time (section names, FEVER!, BOING!…)
   Only heart changes, 'Encore unlocked' and the curtain call are
   announced (aria-live polite); the shell's top text stays the
   accessible summary.
   ================================================================ */
(function () {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var PET_HEAD = { pet_puppy: '🐶', pet_kitten: '🐱', pet_bunny: '🐰', pet_dragon: '🐲' };
  var POP_BIG = { door: 1, fever: 1, tier: 1, cleanStage: 1, lettersComplete: 1, encoreStart: 1, finish: 1, curtain: 1 };

  function injectCss() {
    if (document.getElementById('slcHudCss')) return;
    var c = document.createElement('style'); c.id = 'slcHudCss';
    c.textContent = [
      '.slc-hud{position:absolute;inset:0;pointer-events:none;z-index:2;font-family:"Baloo 2",system-ui,-apple-system,sans-serif;color:#2B2140;}',
      '.slc-hud[hidden]{display:none;}',
      '.slc-p{position:absolute;background:rgba(255,255,255,.78);-webkit-backdrop-filter:blur(14px) saturate(1.4);backdrop-filter:blur(14px) saturate(1.4);border:1.5px solid rgba(255,255,255,.9);border-radius:22px;box-shadow:0 10px 30px rgba(43,33,64,.16);}',
      '@supports not ((backdrop-filter:blur(2px)) or (-webkit-backdrop-filter:blur(2px))){.slc-p{background:#FFF8FD;}}',
      '.slc-hud.show .slc-p{background:rgba(26,18,64,.72);border-color:rgba(255,255,255,.25);color:#fff;}',
      '.slc-hearts{left:10px;top:8px;padding:5px 10px;display:flex;gap:2px;align-items:center;}',
      '.slc-w{width:26px;height:34px;display:block;}',
      '.slc-w.lost{opacity:.55;}',
      '.slc-w.crack{animation:slcCrack .4s ease-in forwards;}',
      '.slc-w.last{animation:slcPulse 1s ease-in-out infinite;}',
      '@keyframes slcCrack{0%{transform:none;}30%{transform:rotate(-14deg) scale(1.15);}100%{transform:rotate(0) scale(.92);opacity:.55;}}',
      '@keyframes slcPulse{0%,100%{transform:scale(1);}50%{transform:scale(1.14);}}',
      '.slc-mid{left:50%;top:8px;transform:translateX(-50%);padding:6px 12px 7px;display:flex;flex-direction:column;align-items:center;gap:4px;min-width:min(330px,46vw);}',
      '.slc-hype{position:relative;width:100%;height:16px;border-radius:999px;background:rgba(43,33,64,.18);overflow:hidden;}',
      '.slc-hud.show .slc-hype{background:rgba(255,255,255,.18);}',
      '.slc-fill{position:absolute;left:0;top:0;bottom:0;width:0;border-radius:999px;background:linear-gradient(90deg,#3DF2FF,#FF4FB8);transition:width .25s;}',
      '.slc-hype.fever .slc-fill{background:linear-gradient(90deg,#FFB3E6,#B3E5FF,#C9FFE5,#FFF3B3,#FFB3E6);}',
      '.slc-hype.shatter .slc-fill{transition:none;}',
      '.slc-hype.shatter{animation:slcShatter .4s ease-out;}',
      '@keyframes slcShatter{0%{transform:scale(1.06);filter:brightness(1.8);}100%{transform:none;filter:none;}}',
      '.slc-notch{position:absolute;top:0;bottom:0;width:2px;background:rgba(255,255,255,.9);}',
      '.slc-hl{font-weight:800;font-size:13px;line-height:1;letter-spacing:.04em;}',
      '.slc-hype.fever + .slc-hl{background:linear-gradient(90deg,#FF4FB8,#A66BFF,#3DF2FF);-webkit-background-clip:text;background-clip:text;color:transparent;}',
      '.slc-letters{display:flex;gap:4px;}',
      '.slc-l{width:20px;height:24px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;background:rgba(43,33,64,.14);color:rgba(43,33,64,.45);}',
      '.slc-hud.show .slc-l{background:rgba(255,255,255,.14);color:rgba(255,255,255,.5);}',
      '.slc-l.got,.slc-hud.show .slc-l.got{background:conic-gradient(from 200deg,#FFB3E6,#B3E5FF,#C9FFE5,#FFF3B3,#FFB3E6);color:#2B2140;box-shadow:0 0 0 1.5px #fff;}',
      '.slc-cnt{right:10px;top:8px;padding:7px 14px;font-weight:800;font-size:17px;white-space:nowrap;}',
      '.slc-prog{position:absolute;left:50%;transform:translateX(-50%);bottom:calc(clamp(64px,13vmin,104px) + 26px);width:min(420px,56vw);height:26px;}',
      '.slc-track{position:absolute;left:0;right:0;top:9px;height:8px;border-radius:999px;background:rgba(26,18,64,.35);}',
      '.slc-pf{position:absolute;left:0;top:0;bottom:0;border-radius:999px;background:linear-gradient(90deg,#FFD23F,#FF5FA2);}',
      '.slc-dot{position:absolute;top:8px;width:10px;height:10px;margin-left:-5px;border-radius:50%;background:rgba(255,255,255,.55);box-shadow:0 0 0 1.5px rgba(26,18,64,.4);}',
      '.slc-dot.on{background:#FFD23F;}',
      '.slc-pet{position:absolute;top:-2px;margin-left:-13px;font-size:22px;line-height:1;filter:drop-shadow(0 2px 2px rgba(26,18,64,.35));}',
      '.slc-flag{position:absolute;right:-16px;top:-1px;font-size:20px;line-height:1;}',
      '.slc-pop{position:absolute;left:0;right:0;top:32%;text-align:center;font-family:"Bagel Fat One","Baloo 2",system-ui,sans-serif;font-size:clamp(34px,7.5vw,72px);line-height:1;',
      '  background:linear-gradient(180deg,#FFD23F,#FF5FA2);-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-stroke:1.5px rgba(43,33,64,.35);opacity:0;}',
      '.slc-pop.on{animation:slcPop .9s cubic-bezier(.2,1.4,.4,1) forwards;}',
      '.slc-pop.small{font-size:clamp(24px,5vw,44px);}',
      '@keyframes slcPop{0%{opacity:0;transform:scale(.4);}18%{opacity:1;transform:scale(1.08);}30%{transform:scale(1);}80%{opacity:1;}100%{opacity:0;transform:translateY(-10px);}}',
      '.slc-tip{position:absolute;left:50%;transform:translateX(-50%);bottom:calc(clamp(64px,13vmin,104px) + 66px);padding:8px 18px;border-radius:999px;background:rgba(255,255,255,.92);border:3px solid #3DF2FF;font-weight:800;font-size:clamp(16px,3.4vmin,22px);white-space:nowrap;opacity:0;transition:opacity .25s;}',
      '.slc-tip.on{opacity:1;}.slc-tip.big{font-size:clamp(22px,5vmin,32px);}',
      '.slc-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;}',
      '.slc-hud.rm .slc-w,.slc-hud.rm .slc-hype,.slc-hud.rm .slc-pop.on{animation:none !important;}',
      '.slc-hud.rm .slc-pop.on{opacity:1;}',
      '@media (prefers-reduced-motion: reduce){.slc-w,.slc-hype{animation:none !important;}.slc-pop.on{animation:none;opacity:1;}}',
      '@media (max-width:560px){.slc-cnt{font-size:14px;padding:5px 10px;}.slc-w{width:20px;height:27px;}.slc-mid{top:48px;}}'
    ].join('\n');
    document.head.appendChild(c);
  }
  function el(tag, cls) { var e = document.createElement(tag); if (cls) e.className = cls; return e; }
  function fmt(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function safeCol(c) { return /^#[0-9a-f]{6}$/i.test(c || '') ? c : '#6C5CE7'; }
  /* a glow-wand heart: a pearl stick with a heart top in the child's colour (or a grey outline) */
  function wandSvg(col, lost) {
    var fill = lost ? 'none' : col, stroke = lost ? '#CFC8DC' : '#FFFFFF';
    return '<svg class="slc-w' + (lost ? ' lost' : '') + '" viewBox="0 0 26 34" aria-hidden="true">' +
      '<rect x="11.5" y="15" width="3" height="18" rx="1.5" fill="' + (lost ? '#CFC8DC' : '#F1ECFF') + '" stroke="#2B2140" stroke-width="1"/>' +
      (lost ? '' : '<circle cx="13" cy="10" r="10" fill="' + col + '" opacity=".28"/>') +
      '<path d="M13 18 C 4 12, 4 4, 9 3.5 C 11 3.3, 12.4 4.6, 13 6 C 13.6 4.6, 15 3.3, 17 3.5 C 22 4, 22 12, 13 18 Z" fill="' + fill + '" stroke="' + stroke + '" stroke-width="1.8" stroke-linejoin="round"/>' +
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
    /* one pop at a time. Levels: 0 PERFECT! (only when idle) · 1 BOING! (may replace a PERFECT!) ·
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
          case 'boing': pop('BOING!', 1); break;
          case 'tier': if (e.mult === 2 || e.mult === 3) pop('HYPE x' + e.mult + '!', 2); break;
          case 'fever': pop('FEVER!', 2); break;
          case 'door': pop((secs[e.sec] && secs[e.sec].pop) || e.name, 2); break;
          case 'cleanStage': pop('CLEAN STAGE +25', 2); break;
          case 'letter': if (e.li >= 0 && round.state.lettersMask === (1 << e.li)) tip('Collect all 6 letters for an ENCORE stage!', 2600, false); break;
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

  window.SLCourseHUD = { mount: mount };
})();
