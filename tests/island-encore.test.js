/* node --test tests/   (Node 22+)
   Static checks for world/island-encore.css — the Island Encore restyle.
   CSS can't be rendered in Node, so this guards its contract instead: it
   parses; every class it styles exists in the island / game-shell markup
   or is a documented new hook; it out-ranks the <style> blocks injected
   after it; key colour pairs meet WCAG contrast; nothing loops faster
   than 2 Hz; reduced motion turns every loop off; tap targets stay 44px. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const CSS = read('world/island-encore.css');
const MARKUP = read('world/rewards-world.js') + '\n' + read('world/games/shell.js');
const ARCH = JSON.parse(read('docs/island3d/island-architecture.json'));
const CONTRACTS = read('docs/island3d/CONTRACTS.md');

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

/* ---------- colour maths (WCAG 2.x) ---------- */
function hexRgb(h) {
  const m = /^#([0-9a-f]{6})$/i.exec(h.trim());
  if (!m) throw new Error('not a #rrggbb colour: ' + h);
  return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
}
function lum(rgb) {
  const c = rgb.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contrast(a, b) {
  const la = lum(a), lb = lum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
const ROOT_VARS = {};
rules.filter((r) => r.selector === ':root' && !r.at.length).forEach((r) => decls(r.body).forEach((d) => { if (d.prop.startsWith('--')) ROOT_VARS[d.prop] = d.value; }));
const tok = (name) => { assert.ok(ROOT_VARS[name], 'missing token ' + name); return hexRgb(ROOT_VARS[name]); };

/* ---------- the hook list, read from the architecture doc ---------- */
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
/* hooks this sheet adds, each documented in its header comment */
const OWN_HOOKS = ['sparkle'];

test('the stylesheet parses: balanced braces, no stray text', () => {
  assert.ok(rules.length > 150, 'expected a full stylesheet, got ' + rules.length + ' rules');
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
    selectorsOf(r).forEach((s) => assert.ok(/^html body /.test(s), 'selector must start with "html body": ' + s));
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
      if (HOOKS.has(c) || OWN_HOOKS.indexOf(c) >= 0) return;
      if (!new RegExp('(^|[^\\w-])' + c.replace(/-/g, '\\-') + '($|[^\\w-])').test(MARKUP)) missing.add(c);
    });
  });
  assert.deepEqual([...missing], [], 'classes not found in rewards-world.js / shell.js / the hook list');
  OWN_HOOKS.forEach((h) => assert.ok(CSS.indexOf('.slw-pts.' + h) >= 0, 'own hook .' + h + ' is documented in the header'));
});

test('data-act hooks are real HUD actions (today or in the integration notes)', () => {
  const acts = new Set((CSS.match(/data-act="([\w-]+)"/g) || []).map((m) => m.slice(10, -1)));
  assert.ok(acts.size > 0);
  acts.forEach((a) => {
    const inMarkup = MARKUP.indexOf('data-act="' + a + '"') >= 0;
    const inNotes = new RegExp("'" + a + "'").test(ARCH.integrationWithRewardsWorld);
    assert.ok(inMarkup || inNotes, 'unknown data-act: ' + a);
  });
});

test('!important only beats inline styles or injected !important rules', () => {
  const uses = rules.filter((r) => /!important/.test(r.body)).map((r) => r.selector);
  assert.deepEqual(uses.sort(), ['html body .slw-stagewrap.slw-is3d + .slw-pan', 'html body .slw.showtime .slw-kbhint'].sort());
});

test('the focus ring stays 3px #FFD23F, on every interactive family', () => {
  rules.forEach((r) => decls(r.body).filter((d) => d.prop === 'outline').forEach((d) => {
    if (d.value === 'none') return;
    assert.match(d.value, /^3px solid #FFD23F$/i, 'outline in ' + r.selector);
  }));
  const focusSels = rules.filter((r) => /focus-visible/.test(r.selector) && /outline:\s*3px solid #FFD23F/i.test(r.body)).map((r) => r.selector).join(',');
  for (const fam of ['.slw-btn', '.slw-learn', '.slw-buy', '.slw-goalbtn', '.slw-goal', '.slw-x', '.slw-trayitem', '.slw-sign', '.slw-camctl button', '.slw-toast button', '.slg-b', '.slg-var', '.slg-pad']) {
    assert.ok(focusSels.indexOf(fam + ':focus-visible') >= 0, 'no #FFD23F focus ring for ' + fam);
  }
  assert.match(CSS, /\.slw-focusring\s*\{[^}]*border:\s*3px solid #FFD23F/i);
});

test('Bagel Fat One is for big display text only', () => {
  const src = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.equal((src.match(/Bagel Fat One/g) || []).length, 1, 'Bagel Fat One appears once, in the --sle-display token');
  const DISPLAY = /( h2| h3|\.slw-cele \.t|\.slg-count|\.slg-big|\.slg-pb)$/;
  rules.forEach((r) => {
    if (!/var\(--sle-display\)/.test(r.body)) return;
    selectorsOf(r).forEach((s) => assert.match(s, DISPLAY, 'display font on non-display text: ' + s));
    assert.match(r.body, /font-weight:\s*400/, 'Bagel has one weight — set 400 in ' + r.selector);
  });
});

test('BUY stays green and shine levels go 0–3 by the bible', () => {
  assert.equal(ROOT_VARS['--sle-buy-a'].toUpperCase(), '#2ECC71');
  assert.equal(ROOT_VARS['--sle-buy-b'].toUpperCase(), '#1FA463');
  assert.match(CSS, /html body \.slw-buy \{[^}]*--sle-a:\s*var\(--sle-buy-a\)/);
  const shine = (n) => rules.find((r) => r.selector === 'html body .slw-grid > .slw-card.shine-' + n && !r.at.length);
  [0, 1, 2, 3].forEach((n) => assert.ok(shine(n), 'shine-' + n + ' defined'));
  assert.match(shine(1).body, /#FFB3E6, #B3E5FF/i);
  assert.match(shine(2).body, /conic-gradient\(from var\(--sle-foil\), #FFB3E6, #B3E5FF, #C9FFE5, #FFF3B3/i);
  assert.match(shine(2).body, /animation:\s*sleFoil 6s/);
  assert.match(shine(3).body, /#FFE89A[^;]*#F0C02F[^;]*#C9921A/i);
  const twinkles = rules.filter((r) => /shine-3/.test(r.selector) && /sleTwinkle/.test(r.body));
  assert.equal(selectorsOf(twinkles[0]).length, 3, 'three twinkles on gold foil');
});

test('key text/background pairs meet WCAG contrast', () => {
  const AA = 4.5;
  const pairs = [
    ['--sle-deep-fg', '--sle-deep-a'], ['--sle-deep-fg', '--sle-deep-b'],
    ['--sle-secondary-fg', '--sle-secondary-a'], ['--sle-secondary-fg', '--sle-secondary-b'],
    ['--sle-go-fg', '--sle-go-a'], ['--sle-go-fg', '--sle-go-b'],
    ['--sle-buy-fg', '--sle-buy-a'], ['--sle-buy-fg', '--sle-buy-b'],
    ['--sle-night-fg', '--sle-night-a'], ['--sle-night-fg', '--sle-night-b'],
    ['--sle-plain-fg', '--sle-plain-a'], ['--sle-plain-fg', '--sle-plain-b'],
    ['--sle-gold-fg', '--sle-gold-a'], ['--sle-gold-fg', '--sle-gold-b'],
    ['--sle-off-fg', '--sle-off-bg'],
    ['--sle-points-fg', '--sle-points-a'], ['--sle-points-fg', '--sle-points-b'],
    ['--sle-new-fg', '--sle-new-bg'],
    ['--sle-panel-fg', '--sle-panel-solid'], ['--sle-panel-fg-2', '--sle-panel-solid'],
    ['--sle-show-fg', '--sle-show-solid'], ['--sle-show-fg-2', '--sle-show-solid']
  ];
  pairs.forEach(([fg, bg]) => {
    const c = contrast(tok(fg), tok(bg));
    assert.ok(c >= AA, fg + ' on ' + bg + ' is ' + c.toFixed(2) + ':1');
  });
  /* the bright primary is only used at 18px bold: large-text 3:1 at the gradient middle */
  const a = tok('--sle-primary-a'), b = tok('--sle-primary-b');
  const mid = a.map((v, i) => Math.round((v + b[i]) / 2));
  assert.ok(contrast(tok('--sle-primary-fg'), mid) >= 3, 'bright primary middle');
  assert.match(CSS, /html body \.slw-btn\.big\.on \{[^}]*--sle-a:\s*var\(--sle-primary-a\)[^}]*font-size:\s*18px/);
});

test('nothing loops faster than 2 Hz', () => {
  const sec = (t) => (/ms$/.test(t) ? parseFloat(t) / 1000 : parseFloat(t));
  let loops = 0;
  rules.forEach((r) => decls(r.body).forEach((d) => {
    if (d.prop !== 'animation') return;
    splitTop(d.value).forEach((layer) => {
      if (!/\binfinite\b/.test(layer)) return;
      loops++;
      const dur = sec((layer.match(/(^|\s)(\d*\.?\d+m?s)\b/) || [])[2]);
      const cycle = /\balternate\b/.test(layer) ? dur * 2 : dur;
      assert.ok(cycle >= 0.5, r.selector + ' loops every ' + cycle + 's');
    });
  }));
  assert.ok(loops >= 8, 'expected the looping animations to be found');
  /* the beat-driven ring is clamped too */
  assert.match(CSS, /animation-duration:\s*max\(0\.5s, var\(--slg-beat, 1s\)\)/);
});

test('reduced motion stops every loop and turns sheets/toasts into 120 ms fades', () => {
  const reducedSel = new Map();
  rules.filter(inReduced).forEach((r) => selectorsOf(r).forEach((s) => reducedSel.set(s, (reducedSel.get(s) || '') + r.body)));
  rules.filter((r) => !inReduced(r)).forEach((r) => decls(r.body).forEach((d) => {
    if (d.prop !== 'animation' || !/\binfinite\b/.test(d.value)) return;
    selectorsOf(r).forEach((s) => {
      const body = reducedSel.get(s) || '';
      assert.match(body, /animation:\s*(none|sleFade|sleSparkleFade)/, 'no reduced-motion override for ' + s);
    });
  }));
  ['html body .slw-sheet', 'html body .slw-toast', 'html body .slw-ov', 'html body .slg .slg-scr.glass'].forEach((s) => {
    assert.match(reducedSel.get(s) || '', /animation:\s*sleFade 120ms/, s + ' fades in 120 ms');
  });
  assert.match(reducedSel.get('html body .slw-cannons::before') || '', /sleSparkleFade 0\.4s/, 'confetti becomes a 0.4 s sparkle fade');
  /* the desktop tilt-shine is gated off for reduced motion and touch */
  assert.ok(rules.some((r) => /--sle-tilt-x/.test(r.body) && r.at.some((a) => /hover: hover/.test(a) && /pointer: fine/.test(a) && /prefers-reduced-motion: no-preference/.test(a))));
});

test('tap targets stay at least 44px', () => {
  const families = ['html body .slw-btn', 'html body .slw-learn', 'html body .slw-buy', 'html body .slw-goalbtn', 'html body .slw-toast button',
    'html body .slw-x', 'html body .slw-sign', 'html body .slw-camctl button', 'html body .slg .slg-b', 'html body .slg .slg-var', 'html body .slw-pts'];
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
});

test('phones: no fixed widths that could push the page sideways', () => {
  rules.forEach((r) => decls(r.body).forEach((d) => {
    if (!/^(width|min-width)$/.test(d.prop)) return;
    const px = /^(\d+(?:\.\d+)?)px$/.exec(d.value);
    if (px) assert.ok(+px[1] <= 120, r.selector + ' ' + d.prop + ': ' + d.value);
    assert.ok(!/\d+vw/.test(d.value) || /min\(|clamp\(/.test(d.value), r.selector + ' uses a raw vw width');
  }));
  /* the 3D stage never gets the 2D phone layout's fixed 760px */
  assert.match(CSS, /html body \.slw-stagewrap\.slw-is3d \.slw-stage \{[^}]*width:\s*100%/);
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
