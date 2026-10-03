/* node --test tests/   (Node 22+)
   Static checks for world/island-encore.css — the "Encore City" v2 restyle
   (night glass, flat buttons, Unbounded + Outfit). CSS can't be rendered in
   Node, so this guards its contract instead: it parses; every class it styles
   exists in the island / game-shell / 3D-anchor markup or is a documented
   hook; it out-ranks the <style> blocks injected after it; text meets WCAG
   contrast on the real (composited) glass; the fonts match the Google Fonts
   link; LOW tier and no-blur browsers get solid panels; nothing loops faster
   than 2 Hz (UI chrome no faster than 0.5 Hz); reduced motion turns every
   loop and act off; tap targets stay 44px; the 3D stage grows tall on phones. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const CSS = read('world/island-encore.css');
const RW = read('world/rewards-world.js');
const SHELL = read('world/games/shell.js');
/* the markup this sheet styles: the island + sheets, the game shell, and island3d's 3D anchors */
const MARKUP = RW + '\n' + SHELL + '\n' + read('world/island3d/island3d.js');
const ARCH = JSON.parse(read('docs/island3d/island-architecture.json'));
const CONTRACTS = read('docs/island3d/CONTRACTS.md');
const HEADER = (/^\/\*[\s\S]*?\*\//.exec(CSS) || [''])[0];

/* ---------- a tiny CSS parser: style rules (with their @media/@supports
   context) and raw @-blocks (@keyframes, @property) ---------- */
function parse(css) {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [], blocks = [];
  let pos = 0;
  function skipBlock() {
    let depth = 1;
    while (pos < src.length && depth) { if (src[pos] === '{') depth++; else if (src[pos] === '}') depth--; pos++; }
    if (depth) throw new Error('unclosed @-block');
  }
  function walk(at) {
    let start = pos;
    while (pos < src.length) {
      const ch = src[pos];
      if (ch === '{') {
        const head = src.slice(start, pos).trim();
        pos++;
        if (head[0] === '@') {
          if (/^@(media|supports)\b/.test(head)) walk(at.concat(head));
          else { const b = pos; skipBlock(); blocks.push({ at, head, body: src.slice(b, pos - 1) }); }
        } else {
          const b = pos;
          while (pos < src.length && src[pos] !== '}') { if (src[pos] === '{') throw new Error('nested { inside rule: ' + head); pos++; }
          if (pos >= src.length) throw new Error('unclosed rule: ' + head);
          rules.push({ at, selector: head, body: src.slice(b, pos) });
          pos++;
        }
        start = pos;
      } else if (ch === '}') {
        if (!at.length) throw new Error('stray } at ' + pos);
        pos++;
        return;
      } else pos++;
    }
    if (at.length) throw new Error('unclosed block: ' + at.join(' > '));
    if (src.slice(start).trim()) throw new Error('trailing text: ' + src.slice(start).trim().slice(0, 40));
  }
  walk([]);
  return { rules, blocks };
}
/* split on commas that aren't inside (...) or [...] */
function splitTop(s) {
  const out = []; let depth = 0, cur = '';
  for (const ch of s) {
    if (ch === '(' || ch === '[') depth++;
    if (ch === ')' || ch === ']') depth--;
    if (ch === ',' && !depth) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
function decls(body) {
  return body.split(';').map((d) => d.trim()).filter(Boolean).map((d) => {
    const i = d.indexOf(':');
    return { prop: d.slice(0, i).trim().toLowerCase(), value: d.slice(i + 1).trim() };
  });
}
const { rules, blocks } = parse(CSS);
const selectorsOf = (r) => splitTop(r.selector);
const inReduced = (r) => r.at.some((a) => /prefers-reduced-motion:\s*reduce/.test(a));
const ruleOf = (sel, pred) => rules.find((r) => selectorsOf(r).indexOf(sel) >= 0 && (!pred || pred(r)));
const declOf = (r, prop) => { const d = r && decls(r.body).filter((x) => x.prop === prop).pop(); return d ? d.value : undefined; };
const baseRule = (sel, pred) => ruleOf(sel, (r) => !r.at.length && (!pred || pred(r)));
const exactRule = (sel) => rules.find((r) => r.selector === sel && !r.at.length);
const sec = (t) => (/ms$/.test(t) ? parseFloat(t) / 1000 : parseFloat(t));

/* ---------- colours: tokens, rgba, compositing, WCAG 2.x contrast ---------- */
const ROOT_VARS = {};
rules.filter((r) => r.selector === ':root' && !r.at.length).forEach((r) => decls(r.body).forEach((d) => { if (d.prop.startsWith('--')) ROOT_VARS[d.prop] = d.value; }));
function resolve(v) {
  let guard = 0;
  while (/^var\(\s*(--[\w-]+)\s*\)$/.test(v.trim()) && guard++ < 8) {
    const name = /^var\(\s*(--[\w-]+)\s*\)$/.exec(v.trim())[1];
    assert.ok(ROOT_VARS[name], 'missing token ' + name);
    v = ROOT_VARS[name];
  }
  return v.trim();
}
function colour(v) {
  v = resolve(v);
  if (v === 'transparent') return { rgb: [0, 0, 0], a: 0 };
  let m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v);
  if (m) {
    const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
    return { rgb: [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)), a: 1 };
  }
  m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(v);
  if (m) return { rgb: [+m[1], +m[2], +m[3]], a: m[4] == null ? 1 : +m[4] };
  throw new Error('not a colour: ' + v);
}
/* `top` painted over an opaque rgb */
function over(top, under) {
  const c = typeof top === 'string' ? colour(top) : top;
  return c.rgb.map((v, i) => v * c.a + under[i] * (1 - c.a));
}
const solid = (v) => over(v, [0, 0, 0]);
function lum(rgb) {
  const c = rgb.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contrast(a, b) {
  const la = lum(a), lb = lum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
const AA = 4.5;
function assertAA(fg, bgRgb, what) {
  const c = contrast(over(fg, bgRgb), bgRgb);
  assert.ok(c >= AA, what + ' is ' + c.toFixed(2) + ':1');
}

/* the backdrops text really sits on. The light app page is the worst case
   under every overlay; panels inside .slw sit on the night stage + its glow. */
const PAGE = [255, 255, 255];
const bgOf = (sel) => { const v = declOf(baseRule(sel), 'background'); assert.ok(v, 'no background for ' + sel); return v; };
const SHEET = over('var(--sle-panel-bg)', over(bgOf('html body .slw-ov'), PAGE));
const CELE = over('var(--sle-panel-bg)', over(bgOf('html body .slw-cele'), PAGE));
const TOAST = over('var(--sle-toast-bg)', PAGE);
const HUD_GLOW = 'rgba(194, 51, 143, 0.26)';   /* the strongest glow layer behind the HUD (.slw::after) */
const HUD = over('var(--sle-panel-bg)', over(HUD_GLOW, solid('var(--sle-stage)')));
const LABEL = over('var(--sle-new-bg)', PAGE);   /* labels float over the bright 3D / 2D island */
const CARD = solid('var(--sle-card)');
const SURFACES = { sheet: SHEET, celebration: CELE, hud: HUD };

/* ---------- the hook list: v1 hooks from the architecture doc, v2 hooks from the header ---------- */
function documentedHooks() {
  const chunk = ARCH.workBreakdown.find((c) => c.files.indexOf('world/island-encore.css') >= 0);
  assert.ok(chunk, 'architecture names a chunk for world/island-encore.css');
  const text = chunk.details + '\n' + ARCH.integrationWithRewardsWorld + '\n' + ARCH.sceneAndCamera;
  const hooks = new Set();
  (text.match(/\.slw[\w-]*(\.[\w-]+)*/g) || []).forEach((sel) => sel.split('.').filter(Boolean).forEach((c) => hooks.add(c)));
  const m = /shine-(\d)\.\.(\d)/.exec(text);
  if (m) for (let i = +m[1]; i <= +m[2]; i++) hooks.add('shine-' + i);
  /* badge kinds the shell contract lets games emit */
  const kinds = /kind:\s*((?:'[a-z]+'\|?)+)/.exec(CONTRACTS);
  if (kinds) kinds[1].split('|').forEach((k) => hooks.add(k.replace(/'/g, '')));
  return hooks;
}
const HOOKS = documentedHooks();
/* v2 hooks (plan-v2 chunks B12/B13/L): the 2D building-act groups world-art draws,
   the icon set, the countdown ring, the LOW-tier html class and the optional 2D dusk */
const V2_HOOKS = ['dusk', 'sl-low', 'slw-ico', 'slg-ring', 'slw-hatch', 'slw-pearls', 'slw-strip', 'slw-marquee',
  'slw-onair', 'slw-eq', 'slw-floor', 'slw-bean', 'slw-beam', 'slw-neon', 'slw-win'];
/* hooks this sheet adds itself */
const OWN_HOOKS = ['sparkle'];
/* the beams are not an act: they belong to .showtime (the toggle, or the 8 s encore) */
const ACT_HOOKS = ['slw-hatch', 'slw-pearls', 'slw-strip', 'slw-marquee', 'slw-onair', 'slw-eq', 'slw-floor', 'slw-bean'];

test('the stylesheet parses: balanced braces, no stray text', () => {
  assert.ok(rules.length > 180, 'expected a full stylesheet, got ' + rules.length + ' rules');
  rules.forEach((r) => assert.ok(r.selector.length, 'empty selector'));
});

test('no downloaded or embedded assets (no url(), no @import)', () => {
  const src = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/url\s*\(/i.test(src), 'url() found');
  assert.ok(!/@import/i.test(src), '@import found');
  assert.ok(!/@font-face/i.test(src), '@font-face found (fonts come from the Google Fonts link)');
});

test('every rule out-ranks the injected #slwCss / #slgCss styles', () => {
  rules.forEach((r) => {
    if (r.selector === ':root') return;
    selectorsOf(r).forEach((s) => assert.ok(/^html(\.sl-low)? body( |$)/.test(s), 'selector must start with "html body": ' + s));
  });
});

test('every styled class exists in the markup or is a documented hook', () => {
  for (const want of ['slw-is3d', 'showtime', 'slw-3d', 'slw-3dcanvas', 'slw-anchors', 'slw-tag3d', 'slw-focusring', 'slw-camctl', 'slw-sr-list', 'slw-pc', 'shine-0', 'shine-3', 'encore', 'slw-cannons', 'ribbon', 'hint']) {
    assert.ok(HOOKS.has(want), 'hook list from the docs should include ' + want);
  }
  const missing = new Set();
  rules.forEach((r) => {
    const sel = r.selector.replace(/\[[^\]]*\]/g, '');
    (sel.match(/\.[a-zA-Z_][\w-]*/g) || []).map((c) => c.slice(1)).forEach((c) => {
      if (HOOKS.has(c) || OWN_HOOKS.indexOf(c) >= 0 || V2_HOOKS.indexOf(c) >= 0) return;
      if (!new RegExp('(^|[^\\w-])' + c.replace(/-/g, '\\-') + '($|[^\\w-])').test(MARKUP)) missing.add(c);
    });
  });
  assert.deepEqual([...missing], [], 'classes not found in rewards-world.js / shell.js / island3d.js / the hook lists');
  OWN_HOOKS.forEach((h) => assert.ok(HEADER.indexOf('.slw-pts.' + h) >= 0, 'own hook .' + h + ' is documented in the header'));
  V2_HOOKS.forEach((h) => assert.ok(HEADER.indexOf('.' + h) >= 0, 'v2 hook .' + h + ' is documented in the header'));
  /* every v2 hook is actually styled */
  V2_HOOKS.forEach((h) => assert.ok(rules.some((r) => new RegExp('\\.' + h + '(?![\\w-])').test(r.selector)), 'no rule styles .' + h));
});

test('data-act hooks are real HUD actions', () => {
  const acts = new Set((CSS.replace(/\/\*[\s\S]*?\*\//g, '').match(/data-act="([\w-]+)"/g) || []).map((m) => m.slice(10, -1)));
  assert.deepEqual([...acts].sort(), ['games', 'shop', 'showtime']);
  acts.forEach((a) => assert.ok(RW.indexOf('data-act="' + a + '"') >= 0, 'unknown data-act: ' + a));
});

test('!important only beats inline styles or injected !important rules, and says so', () => {
  const ALLOW = ['html body .slw-stagewrap.slw-is3d + .slw-pan'];
  rules.filter((r) => /!important/.test(r.body)).forEach((r) => selectorsOf(r).forEach((s) => {
    assert.ok(/\[style\*=/.test(s) || ALLOW.indexOf(s) >= 0, '!important outside an inline-style remap: ' + s);
  }));
  CSS.slice(HEADER.length).split('\n').filter((l) => /!important/.test(l)).forEach((l) => assert.match(l, /beats (inline|injected)/, 'unmarked !important: ' + l.trim()));
});

test('the focus ring stays 3px #FFD23F, on every interactive family', () => {
  rules.forEach((r) => decls(r.body).filter((d) => d.prop === 'outline').forEach((d) => {
    if (d.value === 'none') return;
    assert.match(d.value, /^3px solid #FFD23F$/i, 'outline in ' + r.selector);
  }));
  const focusSels = rules.filter((r) => /focus-visible/.test(r.selector) && /outline:\s*3px solid #FFD23F/i.test(r.body)).map((r) => r.selector).join(',');
  for (const fam of ['.slw-btn', '.slw-learn', '.slw-buy', '.slw-goalbtn', '.slw-goal', '.slw-x', '.slw-trayitem', '.slw-sign', '.slw-camctl button', '.slw-toast button', '.slw-sheet input', '.slg-b', '.slg-var', '.slg-pad']) {
    assert.ok(focusSels.indexOf(fam + ':focus-visible') >= 0, 'no #FFD23F focus ring for ' + fam);
  }
  assert.match(CSS, /\.slw-focusring\s*\{[^}]*border:\s*3px solid #FFD23F/i);
});

test('Unbounded only for display ≥ 20px; Outfit for UI and body', () => {
  const src = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/Bagel Fat One|Baloo 2|Fredoka/i.test(src), 'v1 fonts stay on the learning screens only');
  assert.match(ROOT_VARS['--sle-display'], /^"Unbounded", system-ui/);
  assert.match(ROOT_VARS['--sle-ui'], /^"Outfit", system-ui/);
  assert.match(ROOT_VARS['--sle-body'], /^"Outfit", system-ui/);
  assert.equal((src.match(/Unbounded/g) || []).length, 1, 'Unbounded appears once, in the --sle-display token');
  assert.equal((src.match(/Outfit/g) || []).length, 2, 'Outfit appears only in --sle-ui and --sle-body');
  /* the families/weights the Google Fonts link must carry, documented in the header */
  assert.match(HEADER, /Unbounded:wght@600;800/);
  assert.match(HEADER, /Outfit:wght@400;500;600;700;800/);
  const DISPLAY = /( h2| h3|\.slw-cele \.t|\.slg-count|\.slg-big)$/;
  const minPx = (v) => { const m = /^(?:clamp\(\s*)?(\d+(?:\.\d+)?)px/.exec(v); assert.ok(m, 'font-size must start in px: ' + v); return +m[1]; };
  let display = 0;
  rules.forEach((r) => {
    const ds = decls(r.body), fam = declOf(r, 'font-family'), weight = declOf(r, 'font-weight'), size = declOf(r, 'font-size');
    if (fam === 'var(--sle-display)') {
      display++;
      selectorsOf(r).forEach((s) => assert.match(s, DISPLAY, 'display font on non-display text: ' + s));
      assert.ok(weight === '600' || weight === '800', 'Unbounded 600/800 only in ' + r.selector);
      assert.equal(declOf(r, 'letter-spacing'), '-0.01em', 'display letter-spacing in ' + r.selector);
      assert.ok(size && minPx(size) >= 20, 'Unbounded never below 20px: ' + r.selector);
    }
    if (fam === 'var(--sle-ui)' && weight) assert.ok(['600', '700', '800'].indexOf(weight) >= 0, 'Outfit UI is 600–800 in ' + r.selector);
    if (fam === 'var(--sle-body)' && weight) assert.ok(['400', '500'].indexOf(weight) >= 0, 'Outfit body is 400/500 in ' + r.selector);
    /* a display selector re-sized anywhere (phones) stays ≥ 20px */
    if (size && selectorsOf(r).every((s) => DISPLAY.test(s))) assert.ok(minPx(size) >= 20, 'display text below 20px: ' + r.selector);
    ds.filter((d) => d.prop === 'font-weight').forEach((d) => assert.ok(['400', '500', '600', '700', '800'].indexOf(d.value) >= 0, 'a weight the font link lacks: ' + d.value + ' in ' + r.selector));
  });
  assert.ok(display >= 6, 'titles, banners and countdown digits use Unbounded');
  /* numbers that change sit still */
  for (const sel of ['html body .slw-pts', 'html body .slw-goal .gt', 'html body .slw-grid > .slw-card .pr', 'html body .slg .slg-top .hud', 'html body .slg .slg-count', 'html body .slg .slg-big']) {
    assert.equal(declOf(baseRule(sel), 'font-variant-numeric'), 'tabular-nums', 'tabular-nums on ' + sel);
  }
});

test('flat buttons: 12px radius, no sticker borders or lips, CTA / secondary / ghost / BUY', () => {
  rules.forEach((r) => decls(r.body).forEach((d) => {
    if (/^border/.test(d.prop)) assert.ok(!/(^|\s)3px solid #FFF(FFF)?\b/i.test(d.value), 'white sticker border in ' + r.selector);
    if (d.prop !== 'box-shadow') return;
    splitTop(d.value).forEach((layer) => {
      if (/\binset\b/.test(layer)) return;
      const m = /^(-?[\d.]+(?:px)?)\s+([\d.]+)px\s+0\s+(#|rgba?\(|var\()/.exec(layer);
      assert.ok(!m || +m[2] === 0, 'a sticker "lip" shadow in ' + r.selector + ': ' + layer);
    });
  }));
  const btn = baseRule('html body .slw-btn');
  assert.equal(declOf(btn, 'border-radius'), '12px');
  assert.equal(declOf(btn, 'padding'), '10px 16px');
  assert.equal(declOf(btn, 'font-family'), 'var(--sle-ui)');
  assert.equal(declOf(baseRule('html body .slg .slg-b'), 'border-radius'), '12px');
  /* paint from the variant properties, at 120deg */
  assert.equal(declOf(baseRule('html body .slw-btn[class]'), 'background'), 'linear-gradient(120deg, var(--sle-a), var(--sle-b))');
  /* primary CTA: magenta → violet with a glow; .go in the shell is the same gradient */
  assert.equal(ROOT_VARS['--sle-primary-a'], '#E0157F');
  assert.equal(ROOT_VARS['--sle-primary-b'], '#7B4DFF');
  ['a', 'b', 'fg'].forEach((k) => assert.equal(ROOT_VARS['--sle-go-' + k], ROOT_VARS['--sle-primary-' + k]));
  const cta = baseRule('html body .slw-btn.big.on');
  assert.match(cta.body, /--sle-a:\s*var\(--sle-primary-a\)/);
  assert.match(cta.body, /--sle-glow:\s*0 6px 20px rgba\(224, 21, 127, 0\.35\)/);
  assert.ok(selectorsOf(cta).indexOf('html body .slw-btn[data-act="shop"]') >= 0, 'Shop is the CTA');
  assert.equal(declOf(baseRule('html body .slg .slg-b.go'), 'background'), 'linear-gradient(120deg, var(--sle-go-a), var(--sle-go-b))');
  /* secondary: a 1.5px LED Cyan outline; ghost: 6% white */
  assert.equal(ROOT_VARS['--sle-secondary-lip'], '#22E4FF');
  assert.match(baseRule('html body .slw-btn[data-act="games"]').body, /--sle-bw:\s*1\.5px/);
  assert.equal(ROOT_VARS['--sle-plain-a'], 'rgba(255, 255, 255, 0.06)');
  /* BUY stays green */
  assert.equal(ROOT_VARS['--sle-buy-a'], '#2ECC71');
  assert.equal(ROOT_VARS['--sle-buy-b'], '#1FA463');
  assert.equal(ROOT_VARS['--sle-buy-fg'], '#04301A');
  assert.match(exactRule('html body .slw-buy').body, /--sle-a:\s*var\(--sle-buy-a\)/);
  /* pressed = scale .97 */
  assert.equal(declOf(ruleOf('html body .slw-btn:active:not(:disabled)'), 'transform'), 'scale(0.97)');
  assert.equal(declOf(ruleOf('html body .slg .slg-b:active:not(:disabled)'), 'transform'), 'scale(0.97)');
  /* no overshoot anywhere: every cubic-bezier stays inside 0..1 */
  const beziers = CSS.match(/cubic-bezier\(([^)]*)\)/g) || [];
  assert.ok(beziers.length >= 3);
  beziers.forEach((b) => {
    const p = b.slice(13, -1).split(',').map(Number);
    assert.ok(p[1] >= 0 && p[1] <= 1 && p[3] >= 0 && p[3] <= 1, 'overshoot easing: ' + b);
  });
});

test('night glass at 72%; LOW tier, no-blur and reduced-transparency get solid #15112A', () => {
  assert.equal(ROOT_VARS['--sle-panel-bg'], 'rgba(22, 18, 40, 0.72)');
  assert.equal(ROOT_VARS['--sle-panel-solid'], '#15112A');
  assert.equal(ROOT_VARS['--sle-panel-edge'], 'rgba(255, 255, 255, 0.12)');
  assert.equal(ROOT_VARS['--sle-blur'], 'blur(16px) saturate(1.3)');
  /* every blur goes through a token the fallbacks can switch off, with the -webkit- twin */
  let blurs = 0;
  rules.forEach((r) => {
    const std = declOf(r, 'backdrop-filter'), wk = declOf(r, '-webkit-backdrop-filter');
    if (!std && !wk) return;
    blurs++;
    assert.ok(std && wk && std === wk, 'backdrop-filter with its -webkit- twin in ' + r.selector);
    assert.match(std, /^var\(--sle-blur(-bar)?\)$/, 'blur through the token in ' + r.selector);
  });
  assert.ok(blurs >= 6);
  /* glass surfaces paint the panel token, so the fallbacks reach them */
  for (const sel of ['html body .slw-hud', 'html body .slw-sheet', 'html body .slw-cele::before', 'html body .slg .slg-scr.glass', 'html body .slw-pts']) {
    assert.equal(declOf(baseRule(sel), 'background'), 'var(--sle-panel-bg)', sel);
  }
  const low = rules.find((r) => r.selector === 'html.sl-low body' && !r.at.length);
  assert.ok(low, 'an html.sl-low hook');
  const lowSet = Object.fromEntries(decls(low.body).map((d) => [d.prop, d.value]));
  assert.equal(lowSet['--sle-panel-bg'], 'var(--sle-panel-solid)');
  assert.equal(lowSet['--sle-show-bg'], 'var(--sle-show-solid)');
  assert.equal(lowSet['--sle-toast-bg'], 'var(--sle-panel-solid)');
  assert.equal(lowSet['--sle-blur'], 'none');
  assert.equal(lowSet['--sle-blur-bar'], 'none');
  const noBlur = rules.find((r) => r.selector === 'html body' && r.at.some((a) => /^@supports not/.test(a)));
  assert.ok(noBlur && /--sle-panel-bg:\s*var\(--sle-panel-solid\)/.test(noBlur.body), 'solid panels without backdrop-filter');
  const rt = rules.find((r) => r.selector === 'html body' && r.at.some((a) => /prefers-reduced-transparency/.test(a)));
  assert.ok(rt && /--sle-blur:\s*none/.test(rt.body), 'solid panels under reduced transparency');
});

test('golden hour by default, Showtime adds the night glow (a crossfade, not a jump)', () => {
  assert.equal(ROOT_VARS['--sle-stage'], '#0E0B1A');
  assert.equal(declOf(baseRule('html body .slw'), 'background-color'), 'var(--sle-stage)');
  const layers = baseRule('html body .slw::before');
  assert.ok(selectorsOf(layers).indexOf('html body .slw::after') >= 0);
  assert.match(declOf(layers, 'transition'), /^opacity /);
  assert.match(declOf(baseRule('html body .slw::before', (r) => /background/.test(r.body)), 'background'), /rgba\(255, 154, 122, /, 'a warm sun-haze layer');
  assert.match(declOf(baseRule('html body .slw::after', (r) => /background/.test(r.body)), 'background'), /rgba\(194, 51, 143, /, 'a City Glow layer');
  assert.ok(CSS.indexOf(HUD_GLOW) >= 0, 'the HUD contrast test uses the real Showtime glow');
  assert.equal(declOf(baseRule('html body .slw.showtime::before'), 'opacity'), '0');
  assert.equal(declOf(baseRule('html body .slw.showtime::after'), 'opacity'), '1');
  assert.equal(declOf(baseRule('html body .slw.showtime'), '--sle-panel-bg'), 'var(--sle-show-bg)');
});

test('shop photocards: dark 3:4 cards, shine by price, 8 s foil, 2 gold glints per 4 s, outline NEW chip', () => {
  const card = baseRule('html body .slw-grid > .slw-card');
  assert.equal(declOf(card, 'aspect-ratio'), '3 / 4');
  assert.equal(declOf(card, 'background'), 'var(--sle-card)');
  assert.equal(ROOT_VARS['--sle-card'], '#1A1530');
  assert.match(declOf(baseRule('html body .slw-grid > .slw-card .ic'), 'background'), /radial-gradient\(circle at 50% 35%, #3A2A6E 0%, #15112A 70%\)/);
  assert.match(declOf(baseRule('html body .slw-grid > .slw-card .ic::after'), 'box-shadow'), /#FF2E9A/, 'the riser wears a Neon Magenta ring');
  const shine = (n) => baseRule('html body .slw-grid > .slw-card.shine-' + n);
  [0, 1, 2, 3].forEach((n) => assert.ok(shine(n), 'shine-' + n + ' defined'));
  assert.match(shine(1).body, /1\.5px solid transparent/);
  assert.match(shine(1).body, /#FF7AD9, #7AD7FF/);
  assert.match(shine(2).body, /conic-gradient\(from var\(--sle-foil\), #FF7AD9, #7AD7FF, #9DFFCF, #FFE27A/);
  assert.match(shine(2).body, /animation:\s*sleFoil 8s linear infinite/);
  assert.match(shine(3).body, /#FFE89A[^;]*#F0C02F[^;]*#C9921A/);
  const glints = rules.filter((r) => /shine-3/.test(r.selector) && /sleGlint 4s/.test(r.body));
  assert.equal(glints.length, 1);
  assert.equal(selectorsOf(glints[0]).length, 2, 'two glints on gold foil');
  assert.equal(declOf(baseRule('html body .slw-grid > .slw-card.shine-3::after', (r) => /animation-delay/.test(r.body)), 'animation-delay'), '2s', 'the glints alternate, 2 per 4 s');
  /* name / description / price per the bible */
  assert.match(baseRule('html body .slw-grid > .slw-card .nm').body, /font-weight:\s*700;[^}]*font-size:\s*15px/);
  assert.match(baseRule('html body .slw-grid > .slw-card .ds').body, /font-weight:\s*400;[^}]*font-size:\s*13px/);
  assert.match(baseRule('html body .slw-grid > .slw-card .pr').body, /color:\s*var\(--sle-gold\)[^}]*font-weight:\s*800;[^}]*font-size:\s*16px/);
  /* NEW: an outline pill, not a filled bubblegum one */
  const nw = baseRule('html body .slw-new', (r) => /border/.test(r.body));
  assert.equal(declOf(nw, 'border'), '1.5px solid var(--sle-magenta)');
  assert.equal(declOf(nw, 'background'), 'var(--sle-new-bg)');
});

test('celebration: a centred glass card (max 420px) over a 40% scrim, scale .94 + blur 6px in', () => {
  const cele = baseRule('html body .slw-cele');
  assert.equal(declOf(cele, 'display'), 'grid');
  assert.equal(declOf(cele, 'grid-template-columns'), 'minmax(0, 420px)');
  assert.equal(declOf(cele, 'background'), 'rgba(14, 11, 26, 0.4)');
  const card = baseRule('html body .slw-cele::before');
  assert.equal(declOf(card, 'grid-row'), '2 / 6', 'the card spans the 4 content rows');
  assert.match(declOf(card, 'animation'), /^sleCardIn 320ms/);
  assert.match(declOf(baseRule('html body .slw-cele > *'), 'animation'), /^sleRiseIn 320ms/);
  ['.t', '.ic', '.s', '.btns'].forEach((c, i) => assert.equal(declOf(baseRule('html body .slw-cele ' + c), 'grid-row'), String(i + 2), c + ' row'));
  /* the retired slwPopIn overshoot is replaced on the icon */
  assert.match(declOf(baseRule('html body .slw-cele.pop .ic'), 'animation'), /^sleRiseIn/);
  const kf = (n) => blocks.find((b) => b.head === '@keyframes ' + n).body;
  assert.match(kf('sleCardIn'), /scale\(0\.94\)/);
  assert.match(kf('sleRiseIn'), /blur\(6px\)/);
});

test('key text/background pairs meet WCAG contrast on the composited glass', () => {
  /* text tokens on the night surfaces that carry them (worst case: the light page under the scrim) */
  const ALL_TEXT = ['--sle-fg', '--sle-fg-2', '--sle-gold', '--sle-gold-soft', '--sle-ok', '--sle-coral', '--sle-cyan', '--sle-panel-fg', '--sle-panel-fg-2', '--sle-show-fg', '--sle-show-fg-2'];
  const SURFACE_TEXT = { sheet: ALL_TEXT, hud: ALL_TEXT, celebration: ['--sle-fg', '--sle-fg-2', '--sle-gold', '--sle-panel-fg', '--sle-panel-fg-2'] };
  for (const [name, bg] of Object.entries(SURFACES)) {
    SURFACE_TEXT[name].forEach((fg) => assertAA('var(' + fg + ')', bg, fg + ' on the ' + name));
  }
  assertAA('var(--sle-fg)', TOAST, 'toast text');
  assertAA('var(--sle-secondary-fg)', TOAST, 'toast action');
  assertAA('var(--sle-new-fg)', LABEL, 'island labels over a bright scene');
  /* every button variant: text on both gradient stops, over a sheet and over the HUD */
  for (const v of ['primary', 'deep', 'secondary', 'go', 'buy', 'night', 'plain', 'gold', 'amber', 'off', 'points']) {
    for (const [name, bg] of [['sheet', SHEET], ['hud', HUD]]) {
      for (const stop of v === 'off' ? ['bg'] : ['a', 'b']) {
        assertAA('var(--sle-' + v + '-fg)', over('var(--sle-' + v + '-' + stop + ')', bg), '--sle-' + v + '-fg on its ' + stop + ' fill (' + name + ')');
      }
    }
  }
  /* shop cards and their chips */
  for (const fg of ['--sle-fg', '--sle-fg-2', '--sle-gold']) assertAA('var(' + fg + ')', CARD, fg + ' on a card');
  ['own', 'lock', 'rep', 'uni'].forEach((k) => {
    const r = baseRule('html body .slw-card .chip.' + k);
    assertAA(declOf(r, 'color'), over(declOf(r, 'background'), CARD), 'chip.' + k);
  });
  /* gold labels with ink text */
  assertAA('var(--sle-ink)', solid('#FFD23F'), '▶ PLAY tag');
  assertAA('var(--sle-ink)', solid('#C9921A'), 'gold-foil PB pill (darkest stop)');
  /* game cards: white text over the night scrim on the brightest inline card colour */
  const scrim = declOf(baseRule('html body .slw-game::before'), 'background');
  const stops = (scrim.match(/rgba\([^)]*\)/g) || []).slice(0, 2);   /* the text sits in the top 60% */
  const grads = (RW.match(/grad: 'linear-gradient\(135deg,(#[0-9a-f]{6}),(#[0-9a-f]{6})\)'/gi) || []);
  assert.equal(grads.length, 3, 'three game cards');
  grads.forEach((g) => (g.match(/#[0-9a-f]{6}/gi) || []).forEach((hex) => stops.forEach((s) => assertAA('#FFFFFF', over(s, solid(hex)), 'game card text on ' + hex))));
});

test('inline text colours written for the old light sheets are re-mapped for the night theme', () => {
  /* every value a sheet rule gives `prop` for elements whose inline style holds `needle` */
  const remaps = (needle, prop) => rules.filter((x) => selectorsOf(x).some((s) => s.toLowerCase().indexOf('[style*="' + needle.toLowerCase()) >= 0))
    .map((x) => declOf(x, prop)).filter(Boolean).map((v) => v.replace(/\s*!important$/, ''));
  const styles = [...(RW + '\n' + SHELL).matchAll(/style="([^"]*)"/g)].map((m) => m[1]);
  let checked = 0;
  styles.forEach((s) => {
    const fg = (/(?:^|;)\s*color:\s*(#[0-9a-f]{3,6})\b/i.exec(s) || [])[1];
    const bg = (/(?:^|;)\s*background:\s*(#[0-9a-f]{3,6})\b/i.exec(s) || [])[1];
    if (!fg && !bg) return;
    checked++;
    const fgMaps = fg ? remaps('color:' + fg, 'color') : [];
    const bgMaps = bg ? remaps('background:' + bg, 'background') : [];
    const inks = fg ? (fgMaps.length ? fgMaps : [fg]) : null;
    if (bg && !bgMaps.length) {
      /* a self-contained chip: its own text colour (or a sheet rule for that chip) on its own fill */
      const chipInks = inks || remaps('background:' + bg + ';', 'color');
      assert.ok(chipInks.length, 'inline background ' + bg + ' has no text colour of its own: ' + s);
      chipInks.forEach((ink) => assertAA(ink, solid(bg), 'inline chip "' + s + '"'));
      return;
    }
    /* night text: the remapped (or untouched) colour on the sheet, or on a remapped tint */
    const surfaces = bgMaps.length ? bgMaps.map((b) => over(b, SHEET)) : [SHEET];
    surfaces.forEach((surface) => (inks || ['var(--sle-fg)']).forEach((ink) => assertAA(ink, surface, 'inline text in "' + s + '"')));
    if (fg && !fgMaps.length) assertAA(fg, HUD, 'inline text in "' + s + '" on the HUD');
  });
  assert.ok(checked >= 20, 'expected the inline colours to be found, got ' + checked);
  /* the old Baloo price line is switched to Outfit */
  assert.match(CSS, /\[style\*="color:#b9821a"\] \{[^}]*font-family: var\(--sle-ui\) !important/);
});

test('nothing loops faster than 2 Hz; UI chrome no faster than 0.5 Hz', () => {
  /* in-world / in-game loops allowed between 0.5 and 2 Hz, each named by the plan */
  const IN_WORLD = ['html body .slw-cell.bad', 'html body .slg .slg-count::after'];
  let loops = 0;
  rules.forEach((r) => decls(r.body).forEach((d) => {
    if (d.prop !== 'animation') return;
    splitTop(d.value).forEach((layer) => {
      const dur = sec((layer.match(/(^|\s)(\d*\.?\d+m?s)\b/) || [])[2]);
      const count = /\binfinite\b/.test(layer) ? Infinity : +((layer.match(/\s(\d+)(?=\s|$)/) || [])[1] || 1);
      const cycle = /\balternate\b/.test(layer) ? dur * 2 : dur;
      if (count === Infinity) {
        loops++;
        assert.ok(cycle >= 0.5, r.selector + ' loops every ' + cycle + 's');
        if (!selectorsOf(r).every((s) => IN_WORLD.indexOf(s) >= 0)) assert.ok(cycle >= 2, r.selector + ' (UI) loops faster than 0.5 Hz: ' + cycle + 's');
      } else if (count > 1) {
        assert.ok(cycle >= 0.5, r.selector + ' repeats every ' + cycle + 's');
      }
    });
  }));
  assert.ok(loops >= 7, 'expected the looping animations to be found');
  /* the beat-driven rings are clamped too: the looping fallback ring is a beat pulse
     (≤ 1.97 Hz), the shell's one-shot ring lives ≥ 0.5 s */
  assert.match(CSS, /animation-duration:\s*max\(0\.51s, var\(--slg-beat, 1s\)\)/);
  assert.ok(1 / 0.51 <= 1.97);
  assert.match(CSS, /animation-duration:\s*max\(0\.5s, calc\(var\(--slg-beat, 1s\) \* 0\.9\)\)/);
  /* the injected 2D label pulses are slowed to 0.5 Hz */
  assert.equal(declOf(baseRule('html body .slw-tag.play', (r) => /animation-duration/.test(r.body)), 'animation-duration'), '2s');
});

test('2D city-building acts: each hook plays once on .go, ends within 3 s, chases ≤ 1.5 Hz', () => {
  ACT_HOOKS.forEach((h) => {
    const r = rules.find((x) => !x.at.length && selectorsOf(x).some((s) => new RegExp('\\.' + h + '\\.go( > \\*)?$').test(s)) && /animation:/.test(x.body));
    assert.ok(r, 'no .go act for .' + h);
    splitTop(declOf(r, 'animation')).forEach((layer) => {
      if (/\binfinite\b/.test(layer)) return;   /* the marquee keeps scrolling; its .go adds a 0.5 s wipe */
      const dur = sec((layer.match(/(^|\s)(\d*\.?\d+m?s)\b/) || [])[2]);
      const n = +((layer.match(/\s(\d+)(?=\s|$)/) || [])[1] || 1);
      assert.ok(dur * n <= 3 + 1e-9, '.' + h + ' act lasts ' + (dur * n) + 's');
    });
  });
  /* the floor chase: every tile cycles at ≤ LED_CHASE_HZ, never at full contrast */
  const floor = declOf(baseRule('html body .slw-floor.go > *'), 'animation');
  assert.ok(1 / sec(floor.split(/\s+/)[1]) <= 1.5, 'floor chase ≤ 1.5 Hz');
  assert.match(blocks.find((b) => b.head === '@keyframes sleFloor').body, /opacity:\s*0\.55/);
  /* Showtime: neon glows, windows light, beams show (and hide by day) */
  assert.match(baseRule('html body .slw.showtime .slw-neon').body, /drop-shadow\(0 0 4px currentColor\)/);
  assert.equal(declOf(baseRule('html body .slw.showtime .slw-win'), 'fill'), '#FFE9A8');
  assert.equal(declOf(baseRule('html body .slw-beam', (r) => /opacity/.test(r.body)), 'opacity'), '0');
  assert.equal(declOf(baseRule('html body .slw.showtime .slw-beam'), 'opacity'), '0.8');
});

test('reduced motion stops every loop and act; sheets, toasts and the card become 120 ms fades', () => {
  const reducedSel = new Map();
  rules.filter(inReduced).forEach((r) => selectorsOf(r).forEach((s) => reducedSel.set(s, (reducedSel.get(s) || '') + r.body)));
  rules.filter((r) => !inReduced(r)).forEach((r) => decls(r.body).forEach((d) => {
    if (d.prop !== 'animation' || !/\binfinite\b/.test(d.value)) return;
    selectorsOf(r).forEach((s) => {
      const body = reducedSel.get(s) || '';
      assert.match(body, /animation:\s*(none|sleFade|sleSparkleFade)/, 'no reduced-motion override for ' + s);
    });
  }));
  /* every 2D act jumps to its end state */
  rules.filter((r) => !inReduced(r) && /\.go\b/.test(r.selector) && /animation:/.test(r.body)).forEach((r) => selectorsOf(r).forEach((s) => {
    if (/\.slw-marquee\.go$/.test(s)) return;   /* covered with the marquee loop above */
    assert.match(reducedSel.get(s) || '', /animation:\s*none/, 'act without a reduced end state: ' + s);
  }));
  assert.match(reducedSel.get('html body .slw-onair.go') || '', /opacity:\s*1/, 'ON AIR ends lit');
  ['html body .slw-sheet', 'html body .slw-toast', 'html body .slw-ov', 'html body .slw-cele', 'html body .slw-cele::before', 'html body .slw-cele > *', 'html body .slg .slg-scr.glass'].forEach((s) => {
    assert.match(reducedSel.get(s) || '', /animation:\s*sleFade 120ms/, s + ' fades in 120 ms');
  });
  assert.match(reducedSel.get('html body .slw-cannons::before') || '', /sleSparkleFade 0\.4s/, 'confetti becomes a 0.4 s sparkle fade');
  assert.match(reducedSel.get('html body .slw::before') || '', /transition-duration:\s*120ms/, 'the Showtime glow swap is a short fade');
  /* the desktop tilt-shine is gated off for reduced motion and touch */
  assert.ok(rules.some((r) => /--sle-tilt-x/.test(r.body) && r.at.some((a) => /hover: hover/.test(a) && /pointer: fine/.test(a) && /prefers-reduced-motion: no-preference/.test(a))));
});

test('tap targets stay at least 44px', () => {
  const families = ['html body .slw-btn', 'html body .slw-learn', 'html body .slw-buy', 'html body .slw-goalbtn', 'html body .slw-toast button',
    'html body .slw-x', 'html body .slw-sign', 'html body .slw-camctl button', 'html body .slg .slg-b', 'html body .slg .slg-var', 'html body .slw-pts',
    'html body .slw-sheet input'];
  families.forEach((sel) => {
    const own = rules.filter((r) => !r.at.length && selectorsOf(r).indexOf(sel) >= 0);
    const sizes = own.map((r) => decls(r.body)).reduce((a, b) => a.concat(b), []).filter((d) => /^(min-height|height)$/.test(d.prop));
    assert.ok(sizes.length, 'no height for ' + sel);
    sizes.forEach((d) => assert.ok(parseFloat(d.value) >= 44, sel + ' ' + d.prop + ': ' + d.value));
  });
  /* the shell's pads keep their own clamp sizes: never resized here */
  rules.filter((r) => /slg-pad/.test(r.selector)).forEach((r) => decls(r.body).forEach((d) => {
    assert.ok(!/^(width|height|min-width|min-height)$/.test(d.prop), 'pads keep clamp(64px,13vmin,104px): ' + r.selector);
  }));
  /* the camera controls: a vertical stack of 44px ghost circles; it lies down on short stages */
  const cam = baseRule('html body .slw-camctl');
  assert.equal(declOf(cam, 'flex-direction'), 'column');
  assert.ok(rules.some((r) => r.selector === 'html body .slw-camctl' && r.at.some((a) => /max-height: 540px/.test(a)) && /flex-direction:\s*row/.test(r.body)));
});

test('the shell\'s short-screen block still wins: its selectors keep the same form here', () => {
  ['html body .slg .slg-scr h2', 'html body .slg .slg-big', 'html body .slg .slg-tut b', 'html body .slg .slg-pb'].forEach((s) => assert.ok(baseRule(s), 'missing ' + s));
  assert.ok(SHELL.indexOf('html body .slg .slg-scr h2{') >= 0, 'the shell still re-sizes these on short screens');
  /* what the shell's plain short-screen rules set must not be set (more specifically) here */
  for (const [sel, props] of [['html body .slg .slg-scr p', ['font-size']], ['html body .slg .slg-tut div', ['width', 'padding', 'font-size']], ['html body .slg .slg-scr', ['padding']]]) {
    rules.filter((r) => selectorsOf(r).indexOf(sel) >= 0).forEach((r) => props.forEach((p) => assert.equal(declOf(r, p), undefined, sel + ' must leave ' + p + ' to the shell')));
  }
});

test('phones: no sideways scroll, and the 3D stage grows tall for finger-sized cells', () => {
  rules.forEach((r) => decls(r.body).forEach((d) => {
    if (!/^(width|min-width)$/.test(d.prop)) return;
    const px = /^(\d+(?:\.\d+)?)px$/.exec(d.value);
    if (px) assert.ok(+px[1] <= 120, r.selector + ' ' + d.prop + ': ' + d.value);
    assert.ok(!/\d+vw/.test(d.value) || /min\(|clamp\(/.test(d.value), r.selector + ' uses a raw vw width');
  }));
  const STAGE = 'html body .slw-stagewrap.slw-is3d .slw-stage';
  const ratio = (v) => { const m = /^(\d+)\s*\/\s*(\d+)$/.exec(v); assert.ok(m, 'aspect-ratio ' + v); return +m[1] / +m[2]; };
  /* the 3D stage never gets the 2D phone layout's fixed 760px */
  const desk = baseRule(STAGE);
  assert.equal(declOf(desk, 'width'), '100%');
  assert.equal(declOf(desk, 'aspect-ratio'), '16 / 9');
  /* portrait phones: taller than v1's 4:5, capped by the dynamic viewport */
  const phone = ruleOf(STAGE, (r) => r.at.some((a) => /orientation: portrait/.test(a) && /max-width: 700px/.test(a)));
  assert.ok(phone, 'a portrait-phone stage rule');
  assert.ok(ratio(declOf(phone, 'aspect-ratio')) <= 3 / 4, 'portrait stage at least 3:4 tall');
  assert.ok(parseFloat(declOf(phone, 'min-height')) >= 320, 'a usable minimum on small phones');
  assert.match(phone.body, /max-height:\s*calc\(100dvh - \d+px\)/);
  assert.match(phone.body, /max-height:\s*calc\(100vh - \d+px\)/, 'a vh fallback before dvh');
  /* phones held sideways: height-limited, so the stage takes the viewport height */
  const side = ruleOf(STAGE, (r) => r.at.some((a) => /orientation: landscape/.test(a) && /max-height/.test(a)));
  assert.ok(side, 'a landscape-phone stage rule');
  assert.equal(declOf(side, 'aspect-ratio'), 'auto');
  assert.match(side.body, /height:\s*calc\(100dvh - \d+px\)/);
  assert.equal(declOf(side, 'max-height'), 'none');
  /* the edit frame keeps the border width, so entering edit mode never resizes the canvas */
  assert.equal(declOf(baseRule('html body .slw-stagewrap'), 'border'), '2px solid var(--sle-panel-edge)');
  assert.ok(!/border-width|border:/.test(baseRule('html body .slw.slw-edit .slw-stagewrap').body), 'edit mode changes style and colour only');
});

test('custom keyframes are all defined, and every @property is registered once', () => {
  const defined = new Set(blocks.filter((b) => /^@keyframes /.test(b.head)).map((b) => b.head.split(/\s+/)[1]));
  const used = new Set();
  rules.forEach((r) => decls(r.body).forEach((d) => {
    if (d.prop !== 'animation' && d.prop !== 'animation-name') return;
    (d.value.match(/\bsle[A-Z]\w*/g) || []).forEach((n) => used.add(n));
  }));
  used.forEach((n) => assert.ok(defined.has(n), 'missing @keyframes ' + n));
  defined.forEach((n) => assert.ok(used.has(n), 'unused @keyframes ' + n));
  const props = blocks.filter((b) => /^@property /.test(b.head)).map((b) => b.head.split(/\s+/)[1]);
  assert.deepEqual(props, ['--sle-foil']);
});

/* ================================================================
   review fixes: flash safety and the 2D fallback look (fix2/twod)
   ================================================================ */
/* specificity [ids, classes, types] — enough for this sheet (no ids) */
function specificity(sel) {
  const s = sel.replace(/:not\(([^)]*)\)/g, ' $1').replace(/::[\w-]+/g, ' pseudo');
  return [(s.match(/#[\w-]+/g) || []).length, (s.match(/\.[\w-]+|\[[^\]]*\]|:[\w-]+/g) || []).length, (s.match(/(^|[\s>+~])[a-z][\w-]*/gi) || []).length];
}
/* does a plain descendant selector (tags + classes) match the last node of `chain`
   (root → element, each {tag, cls: []})? */
function matches(sel, chain) {
  const parts = sel.trim().split(/\s+/).map((p) => ({ tag: (/^[a-z][\w-]*/i.exec(p) || [null])[0], cls: (p.match(/\.[\w-]+/g) || []).map((c) => c.slice(1)) }));
  const ok = (p, n) => (!p.tag || p.tag === n.tag) && p.cls.every((c) => n.cls.indexOf(c) >= 0);
  if (!ok(parts[parts.length - 1], chain[chain.length - 1])) return false;
  let i = parts.length - 2;
  for (let j = chain.length - 2; i >= 0 && j >= 0; j--) if (ok(parts[i], chain[j])) i--;
  return i < 0;
}
/* the winning `prop` for that element: base rules, plus the reduced-motion block when asked
   (higher specificity wins, then the later rule) */
function cascade(chain, prop, reduced) {
  const wins = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] > b[i]; return false; };
  let best = null;
  rules.forEach((r, order) => {
    if (r.at.length && !(reduced && r.at.length === 1 && inReduced(r))) return;
    const v = declOf(r, prop);
    if (v === undefined) return;
    selectorsOf(r).forEach((sel) => {
      if (/[:>+~[]/.test(sel) || !matches(sel, chain)) return;
      const key = specificity(sel).concat(order);
      if (!best || wins(key, best.key)) best = { key, v };
    });
  });
  return best ? best.v : undefined;
}
/* the stops of @keyframes `name` as sorted fractions with their blocks */
function keyframes(name) {
  const b = blocks.find((x) => x.head === '@keyframes ' + name);
  assert.ok(b, 'no @keyframes ' + name);
  const out = [];
  for (const m of b.body.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    m[1].split(',').map((k) => k.trim()).forEach((k) => out.push({ at: k === 'from' ? 0 : k === 'to' ? 1 : parseFloat(k) / 100, body: m[2] }));
  }
  return out.sort((a, b) => a.at - b.at);
}
/* CSS ease-in-out = cubic-bezier(0.42, 0, 0.58, 1) */
function easeInOut(t) {
  const bx = (s) => 3 * (1 - s) * (1 - s) * s * 0.42 + 3 * (1 - s) * s * s * 0.58 + s * s * s;
  const by = (s) => 3 * (1 - s) * s * s + s * s * s;
  let lo = 0, hi = 1;
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (bx(m) < t) lo = m; else hi = m; }
  return by((lo + hi) / 2);
}
/* the largest share of a `dur`-second fade (linear or ease-in-out) inside any `win` seconds */
function maxShare(dur, win, ease) {
  const f = ease === 'linear' ? (t) => t : easeInOut;
  let best = 0;
  for (let t = 0; t <= 1; t += 0.001) best = Math.max(best, f(Math.min(1, t + win / dur)) - f(t));
  return best;
}
const colourStops = (v) => v.match(/rgba?\([^)]*\)|#[0-9a-f]{6}\b/gi) || [];

test('count-in rings: the shell draws its own (≤ 1.97 Hz), so the CSS fallback loop stays off', () => {
  assert.equal(declOf(baseRule('html body .slg .slg-count.slg-rings::after'), 'content'), 'none');
  assert.ok(SHELL.indexOf("'slg-count slg-rings'") >= 0, 'the shell marks its count element');
  assert.ok(/BEAT_PULSE_HZ = 1\.97/.test(SHELL), 'the shell caps ring onsets at the beat-pulse limit');
});

test('2D encore beams: lit only while .showtime is on; lifting it never replays an act (motion and reduced)', () => {
  const chain = (slw, beam) => [{ tag: 'html', cls: [] }, { tag: 'body', cls: [] }, { tag: 'div', cls: ['slw', 'dusk'].concat(slw) },
    { tag: 'div', cls: ['slw-stagewrap'] }, { tag: 'div', cls: ['slw-stage'] }, { tag: 'button', cls: ['slw-obj'] }, { tag: 'g', cls: ['slw-beam'].concat(beam) }];
  const names = (c, red) => { const v = cascade(c, 'animation', red); return !v || v === 'none' ? [] : splitTop(v).map((l) => (/\bsle[A-Z]\w*/.exec(l) || [])[0]).filter(Boolean); };
  for (const red of [false, true]) {
    const tag = red ? 'reduced: ' : '', rest = chain([], []), encore = chain(['showtime'], ['go']), after = chain([], ['go']);
    assert.equal(cascade(rest, 'opacity', red), '0', tag + 'dark at golden hour');
    assert.equal(cascade(encore, 'opacity', red), '0.8', tag + 'lit during the encore');
    assert.equal(cascade(after, 'opacity', red), '0', tag + 'dark again once the encore lifts .showtime');
    /* the encore → after step: an animation name that was not running starts again (a replay) */
    const restart = names(after, red).filter((n) => names(encore, red).indexOf(n) < 0);
    assert.deepEqual(restart, [], tag + 'nothing starts when .showtime lifts');
    if (red) assert.deepEqual(names(encore, red), [], 'reduced: the beams hold still');
    else assert.deepEqual(names(encore, red), ['sleBeam'], 'the Showtime sweep');
  }
  /* the cascade helper itself: the injected-style tie-break picks the later, more specific rule */
  assert.equal(cascade(chain(['showtime'], []), 'animation', false), 'sleBeam 4s ease-in-out infinite alternate');
});

test('no steps() flicker: every stepped layer switches ≤ LED_CHASE_HZ 1.5; the EQ moves smoothly', () => {
  let stepped = 0;
  rules.filter((r) => !inReduced(r)).forEach((r) => decls(r.body).filter((d) => d.prop === 'animation').forEach((d) => splitTop(d.value).forEach((layer) => {
    const st = /steps\((\d+)/.exec(layer);
    if (!st) return;
    stepped++;
    const name = (/\bsle[A-Z]\w*/.exec(layer) || [])[0], dur = sec((layer.match(/(^|\s)(\d*\.?\d+m?s)\b/) || [])[2]);
    const segs = new Set(keyframes(name).map((k) => k.at)).size - 1;
    /* a change every dur / (segs × n) s, and an on + an off make one flash */
    const hz = segs * +st[1] / (2 * dur);
    assert.ok(hz <= 1.5 + 1e-9, r.selector + ': ' + name + ' switches at ' + hz.toFixed(2) + ' Hz');
  })));
  assert.ok(stepped >= 1, 'the floor chase is still stepped (never full contrast)');
  /* the EQ eases between heights; a bar pixel lights and darkens once per peak */
  const eq = declOf(baseRule('html body .slw-eq.go'), 'animation');
  assert.ok(!/steps\(/.test(eq), 'the EQ eases between heights: ' + eq);
  const ys = keyframes('sleEq').map((k) => +(/scaleY\(([\d.]+)\)/.exec(k.body) || [])[1]);
  const peaks = ys.filter((y, i) => i > 0 && i < ys.length - 1 && y > ys[i - 1] && y > ys[i + 1]).length, cycle = sec(eq.split(/\s+/)[1]);
  assert.ok(peaks >= 2, 'still an EQ, not a pump');
  assert.ok(peaks / cycle <= 1.5, 'EQ: ' + peaks + ' peaks per ' + cycle + ' s = ' + (peaks / cycle).toFixed(2) + ' Hz');
});

test('2D Showtime: the stage night layer always exists and only fades, so no 0.5 s window moves luminance > 0.2', () => {
  const ART = require('../world/world-art.js').SLWorldArt;
  const STAGE = 'html body .slw-stagewrap:not(.slw-is3d) .slw-stage';
  const base = (p) => baseRule(STAGE + p, (r) => /content:/.test(r.body));
  for (const p of ['::before', '::after']) {
    const r = base(p);
    assert.ok(r, p + ': the layer exists without .showtime / .dusk (adding the class must not create a box)');
    assert.equal(declOf(r, 'content'), '""');
    assert.equal(declOf(r, 'opacity'), '0');
    const tr = /^opacity (\d*\.?\d+m?s) (linear|ease-in-out)$/.exec(declOf(r, 'transition') || '');
    assert.ok(tr && sec(tr[1]) >= 0.6, p + ' fades its opacity over ≥ 0.6 s: ' + declOf(r, 'transition'));
    /* no media block shortens it (under reduced motion a fade is still a fade, not motion) */
    rules.filter((x) => x.at.length && selectorsOf(x).some((s) => s.indexOf('.slw-stage' + p) >= 0)).forEach((x) => assert.ok(!/transition/.test(x.body), p + ' shortened in ' + x.at.join(' ')));
  }
  /* the class toggles change opacity, nothing else */
  for (const sel of ['html body .slw.showtime .slw-stagewrap:not(.slw-is3d) .slw-stage::after', 'html body .slw.dusk .slw-stagewrap:not(.slw-is3d) .slw-stage::before']) {
    const r = rules.find((x) => !x.at.length && x.selector === sel);
    assert.ok(r, sel);
    assert.deepEqual(decls(r.body).map((d) => d.prop + ':' + d.value), ['opacity:1'], sel + ' toggles opacity only');
  }
  /* luminance: the night layer over every 2D backdrop — the dusk sky stops, world-art's dusk
     bay, turf and dune — under the golden-hour haze, worst-case pairings */
  const art = ART.defs();
  const grad = (id) => {
    const m = new RegExp('id="' + id + '"[\\s\\S]*?</linearGradient>').exec(art);
    assert.ok(m, 'world-art defines ' + id);
    return (m[0].match(/stop-color="#[0-9a-f]{6}"/gi) || []).map((x) => x.slice(12, 19));
  };
  const grounds = colourStops(declOf(baseRule('html body .slw-stagewrap:not(.slw-is3d)'), 'background')).concat(grad('slwSeaDusk'), grad('slwTurf'), ['#E9C9A0']);
  const paint = (p) => colourStops(declOf(baseRule(STAGE + p, (r) => /background/.test(r.body)), 'background'));
  const haze = paint('::before'), night = paint('::after');
  assert.ok(grounds.length >= 8 && haze.length === 3 && night.length === 3);
  const tr = /^opacity (\d*\.?\d+m?s) (linear|ease-in-out)$/.exec(declOf(base('::after'), 'transition'));
  const dur = sec(tr[1]), share = maxShare(dur, 0.5, tr[2]);
  /* (an ease-in-out fade of the same length would put 51% of the change in its steepest 0.5 s) */
  assert.ok(Math.abs(maxShare(1.6, 0.5, 'ease-in-out') - 0.507) < 0.01 && Math.abs(maxShare(1.6, 0.5, 'linear') - 0.3125) < 0.002);
  let worst = 0, at = '';
  grounds.forEach((g) => haze.forEach((h) => night.forEach((n) => {
    const gold = over(h, solid(g)), show = over(n, gold), d = Math.abs(lum(gold) - lum(show));
    if (d > worst) { worst = d; at = g + ' under ' + n; }
  })));
  assert.ok(worst * share <= 0.2, 'golden hour → Showtime: ' + worst.toFixed(3) + ' in all (' + at + '), ' + (worst * share).toFixed(3) + ' in the steepest 0.5 s of the ' + dur + ' s fade');
  /* the lit windows and the neon glow fade too; the 2D .slw always carries .dusk, and
     Showtime's brighter window fill still wins over it */
  assert.match(declOf(baseRule('html body .slw-win', (r) => /transition/.test(r.body)), 'transition'), /^fill 0\.6s/);
  const win = (slw) => [{ tag: 'html', cls: [] }, { tag: 'body', cls: [] }, { tag: 'div', cls: ['slw'].concat(slw) }, { tag: 'div', cls: ['slw-stage'] }, { tag: 'rect', cls: ['slw-win'] }];
  assert.equal(cascade(win(['dusk']), 'fill', false), '#FFD08A', 'Window Warm at golden hour');
  assert.equal(cascade(win(['dusk', 'showtime']), 'fill', false), '#FFE9A8', 'Showtime lights the windows over the dusk default');
  assert.match(declOf(baseRule('html body .slw-neon', (r) => /transition/.test(r.body)), 'transition'), /^filter 0\.6s/);
});

test('2D island: a Dusk Zenith sky replaces the injected v1 sky blue, horizon on the island art', () => {
  const r = baseRule('html body .slw-stagewrap:not(.slw-is3d)');
  assert.ok(r, 'a 2D stage background rule');
  const bg = declOf(r, 'background');
  assert.ok(/#2B1E5C/i.test(bg) && /#6A3D8F/i.test(bg) && /#FF9A7A/i.test(bg), 'Dusk Zenith → Dusk Mid → Dusk Horizon: ' + bg);
  assert.ok(!/#7fd6ff/i.test(CSS.replace(/\/\*[\s\S]*?\*\//g, '')), 'no v1 sky blue here');
  /* the horizon sits where the island art starts: PAD 80 above ROWS × 78 */
  const C = require('../world/world-core.js');
  const horizon = (80 / (C.ROWS * 78 + 80) * 100).toFixed(1);
  assert.ok(new RegExp('#FF9A7A ' + horizon + '%, #1E3F86 ' + horizon + '%', 'i').test(bg), 'horizon at ' + horizon + '%: ' + bg);
  /* it beats the injected `.slw-stagewrap{…background:#7fd6ff}` (+0,1,0) while that exists */
  if (/\.slw-stagewrap\{[^}]*#7fd6ff/.test(RW)) assert.ok(specificity(r.selector)[1] > 1 && specificity(r.selector)[2] >= 2);
});

test('reduced motion: a floating tap glyph (.slw-fx) fades in place, no rise, no scale', () => {
  const r = rules.find((x) => inReduced(x) && selectorsOf(x).indexOf('html body .slw-fx') >= 0 && /animation/.test(x.body));
  assert.ok(r, 'a reduced-motion rule for .slw-fx');
  const anim = declOf(r, 'animation'), name = (/\bsle[A-Z]\w*/.exec(anim) || [])[0];
  assert.ok(anim === 'none' || name, anim);
  if (name) assert.ok(!/transform/.test(blocks.find((b) => b.head === '@keyframes ' + name).body), name + ' moves nothing');
  const tf = declOf(r, 'transform');
  assert.ok(tf && !/scale|rotate/.test(tf), 'a still transform: ' + tf);
  /* what it replaces: the injected float (it out-ranks .slw-fx at +0,1,2) */
  if (/\.slw-fx\{/.test(RW)) assert.match(RW, /\.slw-fx\{[^}]*animation:slwFloat/);
});
