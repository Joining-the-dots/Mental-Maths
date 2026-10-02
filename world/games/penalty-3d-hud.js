/* ================================================================
   Encore Shootout 3D — the HTML overlay (ES module; DOM only).
   Sits inside .slg-mid above the WebGL canvas (z-index 2, pointer-events
   none, so the shell's 2D canvas below still takes every tap):
     4 Island-Wand hype pips (filled star = lit, outline star = not: shape,
     never colour alone) · ENCORE! tag · rival chip + Cheer-boost chip ·
     bubble-letter banners (Bagel Fat One, #FFD23F→#FF5FA2) with Baloo 2
     sublines · the rival's holo photocard intro · the prompt line · the
     'Tap to shoot!' bubble · the REPLAY chip · an sr-only aria-live line.
   The DOM is touched only when a value changes. Reduced motion: no pops,
   banners appear at scale 1 and fade.
   ================================================================ */
const CSS_ID = 'p3dCss';
export const CSS = [
  '.p3d{position:absolute;inset:0;z-index:2;pointer-events:none;overflow:hidden;font-family:"Baloo 2",system-ui,sans-serif;color:#fff;}',
  '.p3d *{box-sizing:border-box;}',
  '.p3d-pips{position:absolute;left:12px;top:10px;display:flex;align-items:center;gap:6px;}',
  '.p3d-pip{width:30px;height:30px;display:block;transform-origin:50% 50%;filter:drop-shadow(0 2px 0 rgba(0,0,0,.35));}',
  '.p3d-pip.pop{animation:p3dPop .25s cubic-bezier(.34,1.56,.64,1) both;}',
  '.p3d-pip.drop{animation:p3dDrop .2s ease-out both;}',
  '@keyframes p3dPop{0%{transform:scale(0)}60%{transform:scale(1.3)}100%{transform:scale(1)}}',
  '@keyframes p3dDrop{0%{transform:scale(1.15)}100%{transform:scale(1)}}',
  '.p3d-enc{font-family:"Bagel Fat One","Baloo 2",sans-serif;font-weight:400;font-size:20px;color:#FFD23F;margin-left:4px;text-shadow:0 2px 0 #2B2140,0 0 10px rgba(255,79,184,.6);display:none;}',
  '.p3d-chips{position:absolute;right:10px;top:10px;display:flex;flex-direction:column;align-items:flex-end;gap:6px;}',
  '.p3d-chip{display:flex;align-items:center;gap:7px;background:rgba(19,12,46,.6);border:1.5px solid rgba(255,255,255,.3);border-radius:999px;padding:3px 12px 3px 6px;font-weight:800;font-size:15px;white-space:nowrap;}',
  '.p3d-chip i{display:block;width:18px;height:18px;border-radius:50%;border:2px solid #fff;}',
  '.p3d-boost{background:rgba(224,64,138,.9);padding:3px 12px;display:none;}',
  '.p3d-ban{position:absolute;left:50%;top:22%;transform:translateX(-50%);text-align:center;white-space:nowrap;opacity:0;}',
  '.p3d-ban.low{top:58%;}',
  '.p3d-ban.on{opacity:1;}',
  '.p3d-ban.out{opacity:0;transition:opacity .3s;}',
  '.p3d-ban b{display:inline-block;font-family:"Bagel Fat One","Baloo 2",sans-serif;font-weight:400;font-size:clamp(34px,9vmin,76px);line-height:1;letter-spacing:.01em;',
  '  background:linear-gradient(180deg,#FFD23F,#FF5FA2);-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-stroke:2px #2B2140;',
  '  filter:drop-shadow(0 4px 0 #2B2140) drop-shadow(0 8px 16px rgba(0,0,0,.35));padding:0 6px;}',
  '.p3d-ban.small b{font-size:clamp(24px,6vmin,46px);}',
  '.p3d-ban.save b{background:linear-gradient(180deg,#FFFFFF,#C9E8FF);-webkit-background-clip:text;background-clip:text;}',
  '.p3d-ban.on b{animation:p3dBan .35s cubic-bezier(.34,1.56,.64,1) both;}',
  '.p3d-ban span{display:block;margin-top:4px;font-weight:800;font-size:clamp(17px,3.6vmin,28px);text-shadow:0 2px 0 #2B2140,0 0 8px rgba(0,0,0,.4);}',
  '@keyframes p3dBan{0%{transform:scale(.3)}70%{transform:scale(1.15)}100%{transform:scale(1)}}',
  /* bottom-LEFT: the shell's KICK pad lives bottom-right */
  '.p3d-prompt{position:absolute;left:12px;bottom:14px;max-width:calc(100% - 210px);background:rgba(19,12,46,.62);border:2px solid #3DF2FF;border-radius:999px;padding:4px 16px;font-weight:800;font-size:clamp(15px,3vmin,20px);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:none;}',
  '.p3d-prompt.y{border-color:#FF4FB8;}',
  '.p3d-bub{position:absolute;left:56%;bottom:26%;background:#fff;color:#E0408A;border:3px solid #3B2F4A;border-radius:18px;padding:4px 14px;font-weight:800;font-size:clamp(18px,3.6vmin,24px);display:none;}',
  '.p3d-bub::after{content:"";position:absolute;left:14px;bottom:-12px;border:8px solid transparent;border-top-color:#3B2F4A;}',
  '.p3d-bub.bob{animation:p3dBob 1.2s ease-in-out infinite;}',
  '@keyframes p3dBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}',
  '.p3d-replay{position:absolute;left:50%;top:10px;transform:translateX(-50%);background:#FF4FB8;border:2px solid #fff;border-radius:999px;padding:2px 14px;font-weight:800;font-size:15px;letter-spacing:.08em;display:none;}',
  /* the photocard sits beside the keeper (the intro camera frames him in the middle) */
  '.p3d-card{position:absolute;left:76%;top:50%;width:min(40vmin,230px);aspect-ratio:3/4;transform:translate(-50%,-50%);border-radius:18px;padding:5px;display:none;',
  '  background:conic-gradient(from 210deg,#FFB3E6,#B3E5FF,#C9FFE5,#FFF3B3,#FFB3E6);box-shadow:0 14px 40px rgba(0,0,0,.45);}',
  /* portrait: centred under the goal (a top-level rule AFTER the base one, so it wins) */
  '@media (orientation: portrait){.p3d-card{left:50%;top:70%;width:min(44vmin,200px);}}',
  '.p3d-card.on{display:block;animation:p3dFlip .3s ease-out both;}',
  '@keyframes p3dFlip{0%{transform:translate(-50%,-50%) perspective(600px) rotateY(80deg)}100%{transform:translate(-50%,-50%) perspective(600px) rotateY(0)}}',
  '.p3d-card>div{width:100%;height:100%;border-radius:14px;background:radial-gradient(circle at 50% 28%,#3B1E6E,#1A1240 72%);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:10px;text-align:center;}',
  '.p3d-card .ic{width:44%;aspect-ratio:1;border-radius:50%;border:4px solid #fff;display:flex;align-items:center;justify-content:center;font-size:min(9vmin,52px);}',
  '.p3d-card h3{margin:0;font-family:"Bagel Fat One","Baloo 2",sans-serif;font-weight:400;font-size:min(7vmin,34px);line-height:1;background:linear-gradient(180deg,#FFD23F,#FF5FA2);-webkit-background-clip:text;background-clip:text;color:transparent;}',
  '.p3d-card p{margin:0;font-family:Fredoka,"Baloo 2",sans-serif;font-weight:600;font-size:min(3.4vmin,16px);color:#E3DCFF;line-height:1.25;}',
  '.p3d-card em{font-style:normal;font-weight:800;font-size:min(3.6vmin,17px);color:#3DF2FF;opacity:0;transition:opacity .3s;}',
  '.p3d-card em.on{opacity:1;}',
  '.p3d-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;}',
  '.p3d.red .p3d-pip.pop,.p3d.red .p3d-pip.drop,.p3d.red .p3d-ban.on b,.p3d.red .p3d-card.on,.p3d.red .p3d-bub.bob{animation:none;}',
  '@media (prefers-reduced-motion: reduce){.p3d-pip.pop,.p3d-pip.drop,.p3d-ban.on b,.p3d-card.on,.p3d-bub.bob{animation:none;}}'
].join('\n');
const STAR = 'M12 1.8l2.95 6.3 6.85.75-5.1 4.65 1.42 6.75L12 16.85l-6.12 3.4 1.42-6.75L2.2 8.85l6.85-.75z';

/* Bagel Fat One: index.html normally loads it; add the single Google Fonts link only when it is missing */
function ensureFont() {
  try {
    const has = Array.prototype.some.call(document.querySelectorAll('link[href*="fonts.googleapis.com"]'), (l) => /Bagel\+Fat\+One/.test(l.href));
    if (has) return;
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?family=Bagel+Fat+One&display=swap';
    document.head.appendChild(l);
  } catch (e) { /* the Baloo 2 800 fallback still reads */ }
}

export function makeHud(mid, o) {
  o = o || {};
  if (!document.getElementById(CSS_ID)) {
    const st = document.createElement('style');
    st.id = CSS_ID; st.textContent = CSS;
    document.head.appendChild(st);
  }
  ensureFont();
  const red = !!o.reduced, sig = o.sig || '#6C5CE7';
  const el = document.createElement('div');
  el.className = 'p3d' + (red ? ' red' : '');
  el.setAttribute('aria-hidden', 'false');
  el.innerHTML =
    '<div class="p3d-pips" aria-hidden="true">' + [0, 1, 2, 3].map(() => '<svg class="p3d-pip" viewBox="0 0 24 24"><path d="' + STAR + '"/></svg>').join('') + '<span class="p3d-enc">ENCORE!</span></div>' +
    '<div class="p3d-chips" aria-hidden="true"><div class="p3d-chip p3d-rival"><i></i><span></span></div><div class="p3d-chip p3d-boost"></div></div>' +
    '<div class="p3d-ban" aria-hidden="true"><b></b><span></span></div>' +
    '<div class="p3d-ban low small" aria-hidden="true"><b></b><span></span></div>' +
    '<div class="p3d-prompt" aria-hidden="true"></div>' +
    '<div class="p3d-bub" aria-hidden="true"></div>' +
    '<div class="p3d-replay" aria-hidden="true"></div>' +
    '<div class="p3d-card" aria-hidden="true"><div><div class="ic"></div><h3></h3><p></p><em></em></div></div>' +
    '<div class="p3d-sr" role="status" aria-live="polite"></div>';
  mid.appendChild(el);
  const q = (s) => el.querySelector(s);
  const pips = Array.prototype.slice.call(el.querySelectorAll('.p3d-pip')), paths = pips.map((p) => p.firstChild);
  const encTag = q('.p3d-enc'), rivalChip = q('.p3d-rival'), boostChip = q('.p3d-boost');
  const bans = [q('.p3d-ban:not(.low)'), q('.p3d-ban.low')], prompt = q('.p3d-prompt'), bub = q('.p3d-bub'), replay = q('.p3d-replay');
  const card = q('.p3d-card'), cardIc = card.querySelector('.ic'), cardH = card.querySelector('h3'), cardP = card.querySelector('p'), cardEm = card.querySelector('em');
  const sr = q('.p3d-sr');
  const banT = [-1, -1], banLife = [0, 0];
  let hypeShown = -1, encShown = null, promptShown = null, promptAxis = null, bubShown = null, replayShown = null, cardShown = null, cardSkip = null, boostShown = null, visible = true;
  bub.textContent = o.copy && o.copy.nudge ? o.copy.nudge : 'Tap to shoot!';
  replay.textContent = o.copy && o.copy.replay ? o.copy.replay : 'REPLAY';
  boostChip.textContent = o.copy && o.copy.boostChip ? o.copy.boostChip : 'Cheer boost!';
  cardEm.textContent = o.copy && o.copy.tapStart ? o.copy.tapStart : 'Tap to start';
  function paintPip(i, on) {
    const p = paths[i];
    p.setAttribute('fill', on ? sig : 'rgba(19,12,46,.35)');
    p.setAttribute('stroke', on ? '#FFFFFF' : 'rgba(255,255,255,.8)');
    p.setAttribute('stroke-width', '1.8'); p.setAttribute('stroke-linejoin', 'round');
  }
  function restart(node, cls) {
    node.classList.remove(cls);
    void node.offsetWidth;                                 /* restart the CSS animation */
    node.classList.add(cls);
  }
  const hud = {
    el,
    setVisible(on) { on = !!on; if (on !== visible) { visible = on; el.style.display = on ? '' : 'none'; } },
    /* hype pips; `anim` true pops the changed pips (gains pop, losses flash down) */
    setHype(h, anim) {
      h = Math.max(0, Math.min(4, h | 0));
      if (h === hypeShown) return;
      const from = hypeShown < 0 ? h : hypeShown;
      for (let i = 0; i < 4; i++) {
        paintPip(i, i < h);
        if (anim && !red) {
          if (i >= from && i < h) restart(pips[i], 'pop');
          else if (i >= h && i < from) { pips[i].style.animationDelay = ((from - 1 - i) * 0.08) + 's'; restart(pips[i], 'drop'); }
        }
      }
      hypeShown = h;
    },
    setEncore(on) { if (on !== encShown) { encShown = on; encTag.style.display = on ? 'inline' : 'none'; } },
    setRival(rv) {
      rivalChip.querySelector('i').style.background = rv.jersey;
      rivalChip.querySelector('span').textContent = 'VS ' + String(rv.name).toUpperCase();
      cardIc.style.background = rv.jersey; cardIc.textContent = rv.icon || '';
      cardH.textContent = 'VS ' + String(rv.name).toUpperCase(); cardP.textContent = rv.tip || '';
    },
    setBoost(on) { if (on !== boostShown) { boostShown = on; boostChip.style.display = on ? 'block' : 'none'; } },
    /* b: {title, sub, kind, life, slot: 'main'|'low'} */
    banner(b) {
      if (!b) return;
      const k = b.slot === 'low' ? 1 : 0, node = bans[k];
      node.querySelector('b').textContent = b.title; node.querySelector('span').textContent = b.sub || '';
      node.classList.toggle('save', b.kind === 'save');
      node.classList.toggle('small', k === 1 || String(b.title).length > 14);
      node.classList.remove('out');
      restart(node, 'on');
      banT[k] = 0; banLife[k] = b.life || 1.8;
    },
    clearBanners() { for (let k = 0; k < 2; k++) { banT[k] = -1; bans[k].classList.remove('on', 'out'); } },
    say(text) { if (text) { sr.textContent = ''; sr.textContent = String(text); } },
    prompt(text, axis) {
      text = text || '';
      if (text === promptShown && axis === promptAxis) return;
      promptShown = text; promptAxis = axis;
      prompt.style.display = text ? 'block' : 'none';
      if (text) { prompt.textContent = text; prompt.classList.toggle('y', axis === 'y'); }
    },
    bubble(on) { if (on !== bubShown) { bubShown = on; bub.style.display = on ? 'block' : 'none'; bub.classList.toggle('bob', on && !red); } },
    replay(on) { if (on !== replayShown) { replayShown = on; replay.style.display = on ? 'block' : 'none'; } },
    /* the rival photocard during kick 1's READY; `skip` shows 'Tap to start' */
    intro(on, skip) {
      if (on !== cardShown) { cardShown = on; if (on) restart(card, 'on'); else card.classList.remove('on'); }
      if (on && skip !== cardSkip) { cardSkip = skip; cardEm.classList.toggle('on', !!skip); }
    },
    update(dt) {
      for (let k = 0; k < 2; k++) {
        if (banT[k] < 0) continue;
        banT[k] += dt;
        if (banT[k] >= banLife[k] && !bans[k].classList.contains('out')) bans[k].classList.add('out');
        if (banT[k] >= banLife[k] + 0.35) { banT[k] = -1; bans[k].classList.remove('on', 'out'); }
      }
    },
    reset() {
      hud.clearBanners(); hud.prompt('', ''); hud.bubble(false); hud.replay(false); hud.intro(false); hud.setBoost(false);
      hypeShown = -1; hud.setHype(0, false); hud.setEncore(false);
    },
    dispose() {
      if (el.parentNode) el.parentNode.removeChild(el);
      const st = document.getElementById(CSS_ID);
      if (st && !document.querySelector('.p3d')) st.parentNode.removeChild(st);
    }
  };
  hud.reset();
  return hud;
}
