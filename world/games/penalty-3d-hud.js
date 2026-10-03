/* ================================================================
   Encore Shootout 3D — the HTML overlay (ES module; DOM only).
   Sits inside .slg-mid above the WebGL canvas (z-index 2, pointer-events
   none, so the shell's 2D canvas below still takes every tap):
     4 Island-Wand hype pips (filled ✦ = lit, outline ✦ = not: shape,
     never colour alone) · ENCORE! tag · rival chip + Cheer-boost chip ·
     banners (Unbounded 800, white → Star Gold) with Outfit sublines · the
     rival's foil photocard intro · the prompt line · the 'Tap to shoot!'
     bubble · the REPLAY chip · an sr-only aria-live line.
   ENCORE CITY skin (v2): night-glass chips (rgba(22,18,40,.72), a 1px
   rgba(255,255,255,.12) edge; solid #15112A on html.sl-low or without
   backdrop-filter), flat 12px corners, Outfit 700/800 tabular numbers,
   white / Star Gold text (≥ 4.5:1), the member colour on the lit pips.
   The DOM is touched only when a value changes. Reduced motion: no pops,
   banners appear at scale 1 and fade.
   ================================================================ */
const CSS_ID = 'p3dCss';
/* the island's type tokens (world/island-encore.css), with the same fallbacks when that sheet is absent */
const UI_FONT = 'var(--sle-ui,"Outfit",system-ui,-apple-system,"Segoe UI",sans-serif)';
const DISPLAY_FONT = 'var(--sle-display,"Unbounded","Outfit",system-ui,sans-serif)';
const GLASS = 'background:rgba(22,18,40,.72);-webkit-backdrop-filter:blur(16px) saturate(1.3);backdrop-filter:blur(16px) saturate(1.3);' +
  'border:1px solid rgba(255,255,255,.12);box-shadow:0 8px 24px rgba(0,0,0,.4),inset 0 1px 0 rgba(255,255,255,.08);';
export const CSS = [
  '.p3d{position:absolute;inset:0;z-index:2;pointer-events:none;overflow:hidden;font-family:' + UI_FONT + ';font-variant-numeric:tabular-nums;color:#FFFFFF;}',
  '.p3d *{box-sizing:border-box;}',
  '.p3d-pips{position:absolute;left:12px;top:10px;display:flex;align-items:center;gap:6px;padding:4px 8px;border-radius:12px;' + GLASS + '}',
  '.p3d-pip{width:30px;height:30px;display:block;overflow:visible;transform-origin:50% 50%;}',
  '.p3d-pip.pop{animation:p3dPop .25s cubic-bezier(.34,1.56,.64,1) both;}',
  '.p3d-pip.drop{animation:p3dDrop .2s ease-out both;}',
  '@keyframes p3dPop{0%{transform:scale(0)}60%{transform:scale(1.25)}100%{transform:scale(1)}}',
  '@keyframes p3dDrop{0%{transform:scale(1.12)}100%{transform:scale(1)}}',
  '.p3d-enc{font-family:' + DISPLAY_FONT + ';font-weight:800;letter-spacing:-.01em;font-size:20px;color:#FFD23F;margin:0 2px 0 4px;text-shadow:0 0 10px rgba(255,46,154,.6);display:none;}',
  '.p3d-chips{position:absolute;right:10px;top:10px;display:flex;flex-direction:column;align-items:flex-end;gap:6px;}',
  '.p3d-chip{display:flex;align-items:center;gap:7px;' + GLASS + 'border-radius:12px;padding:3px 12px 3px 6px;font-weight:800;font-size:15px;white-space:nowrap;}',
  '.p3d-chip i{display:block;width:18px;height:18px;border-radius:50%;border:2px solid #FFFFFF;}',
  /* the Cheer boost: the same glass lit by a Neon Magenta edge (white text, never magenta on magenta) */
  '.p3d-boost{border:1.5px solid #FF2E9A;box-shadow:0 0 12px rgba(255,46,154,.45),inset 0 1px 0 rgba(255,255,255,.08);padding:3px 12px;display:none;}',
  'html.sl-low .p3d-pips,html.sl-low .p3d-chip,html.sl-low .p3d-prompt{background:#15112A;-webkit-backdrop-filter:none;backdrop-filter:none;}',
  '@supports not ((backdrop-filter:blur(2px)) or (-webkit-backdrop-filter:blur(2px))){.p3d-pips,.p3d-chip,.p3d-prompt{background:#15112A;}}',
  '.p3d-ban{position:absolute;left:50%;top:22%;transform:translateX(-50%);text-align:center;white-space:nowrap;opacity:0;}',
  '.p3d-ban.low{top:58%;}',
  '.p3d-ban.on{opacity:1;}',
  '.p3d-ban.out{opacity:0;transition:opacity .3s;}',
  /* GOAL! / SAVED! / NEW PERSONAL BEST: Unbounded 800, white → Star Gold, an ink edge and a magenta glow */
  '.p3d-ban b{display:inline-block;font-family:' + DISPLAY_FONT + ';font-weight:800;font-size:clamp(32px,8.4vmin,72px);line-height:1;letter-spacing:-.01em;',
  '  background:linear-gradient(180deg,#FFFFFF 0%,#FFE27A 58%,#FFD23F 100%);-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-stroke:1.5px rgba(20,16,31,.6);',
  '  filter:drop-shadow(0 4px 0 rgba(14,11,26,.6)) drop-shadow(0 0 18px rgba(255,46,154,.5));padding:0 6px;}',
  '.p3d-ban.small b{font-size:clamp(22px,5.6vmin,42px);}',
  '.p3d-ban.save b{background:linear-gradient(180deg,#FFFFFF 0%,#D6F8FF 60%,#9FEFFF 100%);-webkit-background-clip:text;background-clip:text;',
  '  filter:drop-shadow(0 4px 0 rgba(14,11,26,.6)) drop-shadow(0 0 18px rgba(34,228,255,.45));}',
  '.p3d-ban.on b{animation:p3dBan .35s cubic-bezier(.2,.9,.3,1) both;}',
  '.p3d-ban span{display:block;margin-top:6px;font-weight:700;font-size:clamp(17px,3.6vmin,28px);text-shadow:0 2px 0 #14101F,0 0 10px rgba(14,11,26,.7);}',
  '@keyframes p3dBan{0%{transform:scale(.5)}70%{transform:scale(1.05)}100%{transform:scale(1)}}',
  /* bottom-LEFT: the shell's KICK pad lives bottom-right */
  '.p3d-prompt{position:absolute;left:12px;bottom:14px;max-width:calc(100% - 210px);' + GLASS + 'border:1.5px solid #22E4FF;border-radius:12px;padding:4px 16px;',
  '  font-weight:700;font-size:clamp(15px,3vmin,20px);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:none;}',
  '.p3d-prompt.y{border-color:#FF2E9A;}',
  '.p3d-bub{position:absolute;left:56%;bottom:26%;background:#161228;color:#FFFFFF;border:2px solid #FFD23F;border-radius:12px;padding:4px 14px;',
  '  font-weight:800;font-size:clamp(18px,3.6vmin,24px);box-shadow:0 0 14px rgba(255,210,63,.35),0 8px 18px rgba(0,0,0,.4);display:none;}',
  '.p3d-bub::after{content:"";position:absolute;left:14px;bottom:-14px;border:7px solid transparent;border-top-color:#FFD23F;}',
  '.p3d-bub.bob{animation:p3dBob 1.2s ease-in-out infinite;}',
  '@keyframes p3dBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}',
  '.p3d-replay{position:absolute;left:50%;top:10px;transform:translateX(-50%);background:#161228;border:1.5px solid #FF2E9A;border-radius:12px;',
  '  box-shadow:0 0 12px rgba(255,46,154,.4);padding:2px 14px;font-weight:800;font-size:15px;letter-spacing:.12em;display:none;}',
  /* the photocard sits beside the keeper (the intro camera frames him in the middle) */
  '.p3d-card{position:absolute;left:76%;top:50%;width:min(40vmin,230px);aspect-ratio:3/4;transform:translate(-50%,-50%);border-radius:16px;padding:4px;display:none;',
  '  background:conic-gradient(from 210deg,#FF7AD9,#7AD7FF,#9DFFCF,#FFE27A,#FF7AD9);box-shadow:0 14px 40px rgba(0,0,0,.5),0 0 22px rgba(255,122,217,.25);}',
  /* portrait: centred under the goal (a top-level rule AFTER the base one, so it wins) */
  '@media (orientation: portrait){.p3d-card{left:50%;top:70%;width:min(44vmin,200px);}}',
  '.p3d-card.on{display:block;animation:p3dFlip .3s ease-out both;}',
  '@keyframes p3dFlip{0%{transform:translate(-50%,-50%) perspective(600px) rotateY(80deg)}100%{transform:translate(-50%,-50%) perspective(600px) rotateY(0)}}',
  '.p3d-card>div{width:100%;height:100%;border-radius:12px;background:radial-gradient(circle at 50% 28%,#2A1856,#0B0A1F 72%);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:10px;text-align:center;}',
  '.p3d-card .ic{width:44%;aspect-ratio:1;border-radius:50%;border:4px solid #FFFFFF;display:flex;align-items:center;justify-content:center;font-size:min(9vmin,52px);}',
  '.p3d-card h3{margin:0;font-family:' + DISPLAY_FONT + ';font-weight:800;letter-spacing:-.01em;font-size:clamp(20px,6vmin,30px);line-height:1.05;',
  '  background:linear-gradient(180deg,#FFFFFF 0%,#FFE27A 60%,#FFD23F 100%);-webkit-background-clip:text;background-clip:text;color:transparent;}',
  '.p3d-card p{margin:0;font-weight:500;font-size:min(3.4vmin,16px);color:#E6E1F7;line-height:1.3;}',
  '.p3d-card em{font-style:normal;font-weight:800;font-size:min(3.6vmin,17px);color:#FFD23F;opacity:0;transition:opacity .3s;}',
  '.p3d-card em.on{opacity:1;}',
  '.p3d-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;}',
  '.p3d.red .p3d-pip.pop,.p3d.red .p3d-pip.drop,.p3d.red .p3d-ban.on b,.p3d.red .p3d-card.on,.p3d.red .p3d-bub.bob{animation:none;}',
  '@media (prefers-reduced-motion: reduce){.p3d-pip.pop,.p3d-pip.drop,.p3d-ban.on b,.p3d-card.on,.p3d-bub.bob{animation:none;}}'
].join('\n');
/* the hype pip: the four-point ✦ spark on a 24 grid (the five-point star means reward points, never hype) */
const SPARK = 'M12 1.5C12.9 7.6 16.4 11.1 22.5 12C16.4 12.9 12.9 16.4 12 22.5C11.1 16.4 7.6 12.9 1.5 12C7.6 11.1 11.1 7.6 12 1.5Z';

/* Unbounded + Outfit: index.html normally loads them; add the single Google Fonts link only when either is missing */
function ensureFont() {
  try {
    const has = Array.prototype.some.call(document.querySelectorAll('link[href*="fonts.googleapis.com"]'), (l) => /Unbounded/.test(l.href) && /Outfit/.test(l.href));
    if (has) return;
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?family=Unbounded:wght@600;800&family=Outfit:wght@400;500;600;700;800&display=swap';
    document.head.appendChild(l);
  } catch (e) { /* the system-ui fallback still reads */ }
}

export function makeHud(mid, o) {
  o = o || {};
  if (!document.getElementById(CSS_ID)) {
    const st = document.createElement('style');
    st.id = CSS_ID; st.textContent = CSS;
    document.head.appendChild(st);
  }
  ensureFont();
  const red = !!o.reduced, sig = o.sig || '#8A5CFF';
  const el = document.createElement('div');
  el.className = 'p3d' + (red ? ' red' : '');
  el.setAttribute('aria-hidden', 'false');
  el.innerHTML =
    '<div class="p3d-pips" aria-hidden="true">' + [0, 1, 2, 3].map(() => '<svg class="p3d-pip" viewBox="0 0 24 24"><path d="' + SPARK + '"/></svg>').join('') + '<span class="p3d-enc">ENCORE!</span></div>' +
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
  /* lit: a member-colour ✦ with a white edge and its own glow; unlit: an empty outline ✦ */
  function paintPip(i, on) {
    const p = paths[i];
    p.setAttribute('fill', on ? sig : 'rgba(255,255,255,.08)');
    p.setAttribute('stroke', on ? '#FFFFFF' : 'rgba(230,225,247,.7)');
    p.setAttribute('stroke-width', '1.8'); p.setAttribute('stroke-linejoin', 'round');
    pips[i].style.filter = on ? 'drop-shadow(0 0 6px ' + sig + ')' : 'none';
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
