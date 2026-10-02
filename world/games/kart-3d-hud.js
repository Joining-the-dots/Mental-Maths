/* ================================================================
   Neon Grand Prix 3D — the HTML HUD overlay (ES module; DOM only).
   Lives inside #slgMid over the 3D canvas, under the shell's count-down,
   banner and screens. pointer-events: none except the 🎥 button.
     top-left    place chip 'P3/6' + gap chip '+0.8 s to P2'  (Solo: pacer splits)
     top-centre  lap pips; the 'ENCORE LAP!' gradient banner (1.6 s)
     top-right   SVG minimap (track + every racer) and the 🎥 camera button
     right edge  the HYPE WAND: a light stick — 8 pips in the signature colour
                 and a ✦ sparkle bulb (never the reward-points star emoji)
     centre      pop words (≤ 2 at once; big = Bagel Fat One, small = Baloo 2)
     WRONG WAY   the shell-style banner
   Short screens (≤ 600 px tall — every phone held sideways): the right edge has
   no room between the map + 🎥 button and the pads, so the wand lies flat in
   the top centre under the lap pips instead (WAND_ROW_MAX_H).
   Glass panels by day; dark glass with white text on the Encore lap.
   Every DOM write happens only when its value changes. The decorative parts
   are aria-hidden one by one; the 🎥 button stays in the accessibility tree.

   makeHud(mid, o) → hud
     o {core, sigHex, reduced, onCam(), camLabel}
     hud.setTrack(track, laps), hud.update(v), hud.word(key, color?), hud.banner(text),
     hud.setCam(label), hud.setReduced(on), hud.setVisible(on), hud.dispose()
   ================================================================ */

/* the viewport height (px) up to which the Hype Wand lies flat under the lap pips */
export const WAND_ROW_MAX_H = 600;
/* the wand's bulb: a puffy four-point ✦ sparkle (light-stick style) */
export const SPARKLE = 'M12 1.5C12.9 7.6 16.4 11.1 22.5 12C16.4 12.9 12.9 16.4 12 22.5C11.1 16.4 7.6 12.9 1.5 12C7.6 11.1 11.1 7.6 12 1.5Z';
export const CSS = [
  '.k3d-hud{position:absolute;inset:0;pointer-events:none;z-index:2;font-family:"Baloo 2",system-ui,sans-serif;color:#2B2140;overflow:hidden;}',
  '.k3d-hud.off{display:none;}',
  '.k3d-glass{background:rgba(255,255,255,.78);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);box-shadow:0 3px 12px rgba(19,12,46,.18);}',
  '.k3d-hud.night .k3d-glass{background:rgba(26,18,64,.72);color:#fff;}',
  '.k3d-tl{position:absolute;left:10px;top:10px;display:flex;flex-direction:column;align-items:flex-start;gap:6px;}',
  '.k3d-chip{font-weight:800;font-size:clamp(14px,2.4vmin,19px);padding:3px 12px;border-radius:999px;white-space:nowrap;}',
  '.k3d-place{font-size:clamp(20px,4.2vmin,34px);line-height:1.1;padding:2px 14px;}',
  '.k3d-chip.ahead{background:#7BD88F;color:#163a20;}.k3d-chip.behind{background:#FF6B6B;color:#fff;}',
  '.k3d-chip:empty{display:none;}',
  '.k3d-tc{position:absolute;left:50%;top:10px;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:6px;}',
  '.k3d-pips{display:flex;gap:8px;padding:5px 10px;border-radius:999px;}',
  '.k3d-pip{width:15px;height:15px;border-radius:50%;border:2px solid #3B2F4A;background:rgba(255,255,255,.55);box-sizing:border-box;}',
  '.k3d-pip.done{background:#7BD88F;}.k3d-pip.cur{box-shadow:0 0 0 3px #FFD23F;}',
  '.k3d-hud.night .k3d-pip{border-color:#fff;}',
  '.k3d-banner{font-family:"Bagel Fat One","Baloo 2",sans-serif;font-size:clamp(28px,6.5vmin,56px);line-height:1;white-space:nowrap;',
  '  background:linear-gradient(180deg,#FFD23F,#FF5FA2);-webkit-background-clip:text;background-clip:text;color:transparent;',
  '  filter:drop-shadow(0 3px 0 #3B2F4A);opacity:0;transition:opacity .25s;}',
  '.k3d-banner.on{opacity:1;}',
  '.k3d-tr{position:absolute;right:10px;top:10px;display:flex;flex-direction:column;align-items:flex-end;gap:6px;}',
  '.k3d-map{border-radius:12px;padding:5px;line-height:0;}',
  '.k3d-map svg{display:block;width:clamp(96px,17vmin,150px);height:auto;overflow:visible;}',
  '.k3d-cam{pointer-events:auto;min-width:44px;min-height:44px;border-radius:14px;border:2px solid rgba(59,47,74,.25);font:inherit;font-weight:800;',
  '  font-size:15px;padding:4px 12px;cursor:pointer;color:inherit;touch-action:manipulation;}',
  '.k3d-cam:focus-visible{outline:3px solid #FFD23F;outline-offset:2px;}',
  '.k3d-wand{position:absolute;right:14px;top:46%;transform:translateY(-50%);display:flex;flex-direction:column;align-items:center;gap:3px;',
  '  padding:8px 6px 6px;border-radius:999px;}',
  /* the bulb: an outline ✦ until the wand is full (shape + glow, never colour alone), then the signature colour */
  '.k3d-bulb{display:block;width:26px;height:26px;overflow:visible;fill:rgba(59,47,74,.14);stroke:rgba(59,47,74,.55);stroke-width:1.8;stroke-linejoin:round;}',
  '.k3d-hud.night .k3d-bulb{fill:rgba(255,255,255,.12);stroke:rgba(255,255,255,.7);}',
  '.k3d-bulb.full,.k3d-hud.night .k3d-bulb.full{fill:currentColor;stroke:#FFFFFF;}',
  '.k3d-bulb.full{animation:k3dBulb 1s ease-in-out infinite alternate;}',
  '.k3d-wpip{width:16px;height:13px;border-radius:7px;background:rgba(59,47,74,.15);transition:background .15s;}',
  '.k3d-hud.night .k3d-wpip{background:rgba(255,255,255,.18);}',
  '.k3d-wpip.pop{animation:k3dPip .25s cubic-bezier(.34,1.56,.64,1);}',
  '.k3d-handle{width:12px;height:28px;border-radius:6px;background:#fff;border:2px solid rgba(59,47,74,.3);}',
  /* out of the flow (so the hidden tag never widens the wand): beside the bulb, on the screen side */
  '.k3d-spot{position:absolute;right:calc(100% + 6px);top:10px;white-space:nowrap;',
  '  font-family:"Bagel Fat One","Baloo 2",sans-serif;font-size:13px;color:#FFD23F;filter:drop-shadow(0 1px 0 #3B2F4A);opacity:0;}',
  '.k3d-spot.on{opacity:1;}',
  '.k3d-word{position:absolute;left:50%;top:33%;transform:translate(-50%,-50%);white-space:nowrap;pointer-events:none;',
  '  font-family:"Bagel Fat One","Baloo 2",sans-serif;font-size:calc(clamp(30px,7vmin,64px) * var(--k3ds,1));line-height:1;',
  '  -webkit-text-stroke:2px #3B2F4A;paint-order:stroke fill;filter:drop-shadow(0 4px 0 rgba(59,47,74,.55));animation:k3dPop .9s ease-out forwards;}',
  '.k3d-word.small{font-family:"Baloo 2",sans-serif;font-weight:800;font-size:clamp(22px,4.6vmin,40px);top:43%;}',
  '.k3d-word.b2{top:52%;}',
  '.k3d-wrong{position:absolute;left:50%;top:24%;transform:translateX(-50%);background:#FF8A8A;color:#3B2F4A;font-weight:800;',
  '  border-radius:999px;padding:6px 18px;font-size:clamp(17px,3.4vmin,26px);box-shadow:0 4px 14px rgba(0,0,0,.25);white-space:nowrap;}',
  '.k3d-wrong[hidden]{display:none;}',
  '@keyframes k3dPop{0%{transform:translate(-50%,-50%) scale(.45);opacity:0;}16%{transform:translate(-50%,-50%) scale(1.1);opacity:1;}',
  '  30%{transform:translate(-50%,-50%) scale(1);}78%{opacity:1;}100%{transform:translate(-50%,-62%) scale(1);opacity:0;}}',
  '@keyframes k3dFade{0%{opacity:0;}15%{opacity:1;}78%{opacity:1;}100%{opacity:0;}}',
  '@keyframes k3dPip{0%{transform:scale(1);}50%{transform:scale(1.25);}100%{transform:scale(1);}}',
  '@keyframes k3dBulb{from{filter:drop-shadow(0 0 2px currentColor);}to{filter:drop-shadow(0 0 9px currentColor);}}',
  '.k3d-hud.rm .k3d-word{animation:k3dFade .9s linear forwards;}',
  '.k3d-hud.rm .k3d-wpip.pop,.k3d-hud.rm .k3d-bulb.full{animation:none;}',
  '@media (prefers-reduced-motion: reduce){.k3d-word{animation:k3dFade .9s linear forwards;}.k3d-wpip.pop,.k3d-bulb.full{animation:none;}}',
  /* short screens: the right edge between the map + 🎥 button and the pads is too short for the
     standing wand, so it lies flat under the lap pips (handle left → pips → ✦ bulb right); the
     Encore-lap banner and WRONG WAY move down below it */
  '@media (max-height:' + WAND_ROW_MAX_H + 'px){',
  '  .k3d-wand{top:42px;right:auto;left:50%;transform:translateX(-50%);flex-direction:row-reverse;padding:5px 8px 5px 6px;}',
  '  .k3d-wpip{width:13px;height:16px;}',
  '  .k3d-handle{width:24px;height:12px;}',
  '  .k3d-bulb{width:22px;height:22px;}',
  '  .k3d-spot{right:auto;left:50%;top:calc(100% + 3px);transform:translateX(-50%);}',
  '  .k3d-tc .k3d-banner{margin-top:60px;}',
  '  .k3d-wrong{top:136px;}',
  '}',
  /* a narrow AND short window: a slimmer flat wand (no handle), just under the place / gap chips,
     still fits between the left chips and the map + 🎥 button */
  '@media (max-height:' + WAND_ROW_MAX_H + 'px) and (max-width:560px){',
  '  .k3d-wand{top:80px;padding:5px 6px;gap:2px;}',
  '  .k3d-tc .k3d-banner{margin-top:96px;}',
  '  .k3d-wpip{width:10px;height:14px;}',
  '  .k3d-handle{display:none;}',
  '  .k3d-bulb{width:18px;height:18px;}',
  '}',
  '@media (max-height:420px){.k3d-map svg{width:96px;}}'
].join('\n');

function injectCss() {
  if (typeof document === 'undefined' || document.getElementById('k3dCss')) return;
  const tag = document.createElement('style');
  tag.id = 'k3dCss';
  tag.textContent = CSS;
  document.head.appendChild(tag);
}
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
const SVG = 'http://www.w3.org/2000/svg';

export function makeHud(mid, o) {
  injectCss();
  const core = o.core;
  /* NOT aria-hidden as a whole: it holds the focusable 🎥 button (an aria-hidden ancestor would
     hide a control that Tab still reaches). Each decorative part is hidden on its own instead. */
  const root = el('div', 'k3d-hud off');
  const deco = (n) => { n.setAttribute('aria-hidden', 'true'); return n; };
  /* top-left */
  const tl = el('div', 'k3d-tl'), place = el('div', 'k3d-chip k3d-place k3d-glass'), gap = el('div', 'k3d-chip k3d-glass');
  const splits = [el('div', 'k3d-chip'), el('div', 'k3d-chip')];
  tl.append(place, gap, splits[0], splits[1]);
  /* top-centre */
  const tc = el('div', 'k3d-tc'), pips = el('div', 'k3d-pips k3d-glass'), banner = el('div', 'k3d-banner');
  tc.append(pips, banner);
  /* top-right: minimap + camera button */
  const tr = el('div', 'k3d-tr'), mapBox = el('div', 'k3d-map k3d-glass');
  const svg = document.createElementNS(SVG, 'svg'), path = document.createElementNS(SVG, 'path');
  path.setAttribute('fill', 'none'); path.setAttribute('stroke', '#FFFFFF'); path.setAttribute('stroke-width', '4'); path.setAttribute('stroke-linejoin', 'round');
  const path2 = document.createElementNS(SVG, 'path');
  path2.setAttribute('fill', 'none'); path2.setAttribute('stroke', '#5B5670'); path2.setAttribute('stroke-width', '2'); path2.setAttribute('stroke-linejoin', 'round');
  svg.append(path, path2);
  mapBox.appendChild(svg);
  const cam = el('button', 'k3d-cam k3d-glass', '🎥');
  cam.type = 'button';
  cam.setAttribute('aria-label', 'Change camera');
  tr.append(deco(mapBox), cam);
  /* right edge: the Hype Wand (a light stick with a ✦ bulb in the signature colour) */
  const wand = el('div', 'k3d-wand k3d-glass'), spotTag = el('div', 'k3d-spot', 'SPOTLIGHT!');
  const bulb = document.createElementNS(SVG, 'svg'), bulbPath = document.createElementNS(SVG, 'path');
  bulb.setAttribute('class', 'k3d-bulb');
  bulb.setAttribute('viewBox', '0 0 24 24');
  bulbPath.setAttribute('d', SPARKLE);
  bulb.appendChild(bulbPath);
  wand.append(spotTag, bulb);
  const wpips = [];
  for (let i = 7; i >= 0; i--) { const p = el('div', 'k3d-wpip'); wpips[i] = p; wand.appendChild(p); }
  wand.appendChild(el('div', 'k3d-handle'));
  /* centre */
  const wrong = el('div', 'k3d-wrong', '↩ WRONG WAY — turn around!');
  wrong.hidden = true;
  root.append(deco(tl), deco(tc), tr, deco(wand), deco(wrong));
  /* above the canvases, below the shell's count-down / banner / screens */
  const touch = mid.querySelector && mid.querySelector('#slgTouch');
  if (touch) mid.insertBefore(root, touch); else mid.appendChild(root);

  const ac = typeof AbortController === 'function' ? new AbortController() : null;
  const lo = ac ? { signal: ac.signal } : false;
  cam.addEventListener('click', (e) => { if (o.onCam) o.onCam(); if (e.detail > 0) cam.blur(); }, lo);
  cam.addEventListener('pointerdown', (e) => { e.stopPropagation(); }, lo);

  const limiter = new core.WordLimiter(2, 0.9);
  let dots = [], sx = 1, lastPips = -1, last = {}, sig = o.sigHex || '#FF5FA2', reduced = !!o.reduced, bannerTimer = 0, words = [];
  if (reduced) root.classList.add('rm');
  bulb.style.color = sig;                              /* the lit ✦ and its glow (currentColor) */
  function set(key, node, prop, val) { if (last[key] === val) return; last[key] = val; node[prop] = val; }
  function setTrack(track, laps) {
    const mm = core.minimap(track, 150);
    sx = mm.sx;
    svg.setAttribute('viewBox', '-6 -6 ' + (mm.w + 12) + ' ' + (mm.h + 12));
    path.setAttribute('d', mm.d); path2.setAttribute('d', mm.d);
    dots.forEach((d) => d.remove());
    dots = [];
    pips.textContent = '';
    for (let i = 0; i < laps; i++) pips.appendChild(el('div', 'k3d-pip'));
    last = {}; lastPips = -1;
  }
  function dot(i, r, fill) {
    let c = dots[i];
    if (!c) {
      c = document.createElementNS(SVG, 'circle');
      c.setAttribute('stroke', '#3B2F4A'); c.setAttribute('stroke-width', '1.5');
      svg.appendChild(c); dots[i] = c;
    }
    if (c._r !== r) { c._r = r; c.setAttribute('r', String(r)); }
    if (c._f !== fill) { c._f = fill; c.setAttribute('fill', fill); }
    return c;
  }
  /* v {place, total, gapVal (s | null), splits[{text, ahead}], lap, laps, wandPips, full, spot,
        dots[{x, y, color, me}], night, wrong} — strings are rebuilt only when their numbers change */
  function update(v) {
    if (last.night !== !!v.night) { last.night = !!v.night; root.classList.toggle('night', last.night); }
    const showPlace = v.total > 1;
    if (last.showPlace !== showPlace) { last.showPlace = showPlace; place.style.display = showPlace ? '' : 'none'; }
    if (showPlace && (last.pl !== v.place || last.tot !== v.total)) { last.pl = v.place; last.tot = v.total; place.textContent = core.placeText(v.place, v.total); }
    const g10 = v.gapVal == null || v.place <= 1 ? -1 : Math.round(v.gapVal * 10);
    if (last.g10 !== g10 || last.gpl !== v.place) { last.g10 = g10; last.gpl = v.place; gap.textContent = g10 < 0 ? '' : core.gapText(g10 / 10, v.place); }
    for (let k = 0; k < 2; k++) {
      const s = v.splits && v.splits[k];
      if (last['sp' + k] !== s) {
        last['sp' + k] = s;
        splits[k].textContent = s ? s.text : '';
        splits[k].className = 'k3d-chip ' + (s ? (s.ahead ? 'ahead' : 'behind') : '');
      }
    }
    /* lap pips */
    if (last.lapN !== v.lap || last.lapsN !== v.laps) {
      last.lapN = v.lap; last.lapsN = v.laps;
      for (let i = 0; i < pips.children.length; i++) pips.children[i].className = 'k3d-pip' + (i < v.lap ? ' done' : i === v.lap ? ' cur' : '');
    }
    /* the wand */
    if (v.wandPips !== lastPips) {
      for (let i = 0; i < 8; i++) {
        const on = i < v.wandPips;
        wpips[i].style.background = on ? (v.spot ? '#FFD23F' : sig) : '';
        if (on && i >= lastPips && lastPips >= 0 && !v.spot) { wpips[i].classList.remove('pop'); void wpips[i].offsetWidth; wpips[i].classList.add('pop'); }
      }
      lastPips = v.wandPips;
    }
    const lit = !!(v.full || v.spot);
    if (last.full !== lit) { last.full = lit; bulb.classList.toggle('full', lit); }   /* an SVG's className is read-only */
    set('spot', spotTag, 'className', 'k3d-spot' + (v.spot ? ' on' : ''));
    set('wrong', wrong, 'hidden', !v.wrong);
    /* minimap dots (pacers, rivals, then you on top) */
    if (v.dots) {
      for (let i = 0; i < v.dots.length; i++) {
        const d = v.dots[i], c = dot(i, d.me ? 6 : 4, d.color);
        const cx = Math.round(d.x * sx * 2) / 2, cy = Math.round(d.y * sx * 2) / 2;
        if (c._x !== cx) { c._x = cx; c.setAttribute('cx', String(cx)); }
        if (c._y !== cy) { c._y = cy; c.setAttribute('cy', String(cy)); }
      }
      for (let j = v.dots.length; j < dots.length; j++) if (dots[j]) { dots[j].remove(); dots[j] = null; }
      dots.length = v.dots.length;
    }
  }
  /* a pop word: key from core.WORDS (or {text, big, color}); t = a seconds clock */
  function word(key, t, color) {
    const w = typeof key === 'string' ? core.WORDS[key] : key;
    if (!w || !limiter.push(t)) return false;
    words = words.filter((n) => n.isConnected);
    const n = deco(el('div', 'k3d-word' + (w.big ? '' : ' small') + (words.length ? ' b2' : ''), w.text));
    n.style.color = color || w.color || sig;
    if (w.scale && w.scale !== 1) n.style.setProperty('--k3ds', String(w.scale));
    root.appendChild(n);
    words.push(n);
    setTimeout(() => n.remove(), 950);
    return true;
  }
  function showBanner(text) {
    banner.textContent = text;
    banner.classList.add('on');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => banner.classList.remove('on'), 1600);
  }
  return {
    root, setTrack, update, word, banner: showBanner,
    setCam(label) { set('cam', cam, 'textContent', '🎥 ' + label); },
    setSig(hex) { sig = hex || sig; lastPips = -1; bulb.style.color = sig; },
    setReduced(on) { reduced = !!on; root.classList.toggle('rm', reduced); },
    setVisible(on) { if (last.vis !== !!on) { last.vis = !!on; root.classList.toggle('off', !on); } },
    clearWords() { words.forEach((n) => n.remove()); words = []; limiter.clear(); banner.classList.remove('on'); },
    dispose() { clearTimeout(bannerTimer); if (ac) ac.abort(); root.remove(); }
  };
}
