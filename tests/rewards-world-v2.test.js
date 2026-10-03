/* node --test tests/   (Node 22+)
   My Island host (world/rewards-world.js) — source checks for the Encore City v2
   review fixes. The file needs a DOM, so these pin the decisions in its source. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'world', 'rewards-world.js'), 'utf8').replace(/\r\n/g, '\n');
const fn = (name) => {
  const i = SRC.indexOf('function ' + name + '(');
  assert.ok(i >= 0, name + ' exists');
  let d = 0, j = SRC.indexOf('{', i);
  for (let k = j; k < SRC.length; k++) { if (SRC[k] === '{') d++; else if (SRC[k] === '}' && --d === 0) return SRC.slice(i, k + 1); }
  return '';
};

test('the first-visit / migration branch re-enters render() once, so a suspended stage resumes', () => {
  const r = fn('render');
  assert.match(r, /function render\(again\)/);
  assert.match(r, /if \(!again && \(!w\.starterGrantedAt \|\| C\.normalize\(u\)\)\)/);
  assert.match(r, /\.then\(function \(\) \{ render\(true\); \}\)/);
  assert.match(r, /if \(!running\) s3\('resume'\)/);
});

test('the 3D stage encore leaves the sting to the stage act (no doubled hit)', () => {
  const tap = fn('tapItem');
  const enc3d = tap.slice(tap.indexOf("case 'encore'"), tap.indexOf("default:"));
  assert.ok(enc3d.includes("s3('act', uid, 'encore')") && enc3d.includes('encoreMs: 8000'));
  assert.ok(!/sample\('sting'/.test(enc3d), 'no host sting in the 3D branch');
});

test('the light toggle is named by its action and the 2D island gets dusk + its own Showtime toggle', () => {
  assert.match(SRC, /function lightAria\(\) \{ return esc\('Switch to '/);
  assert.match(SRC, /data-act="showtime"' \+ \(showtimeOn \? ' data-on="1"' : ''\) \+ ' aria-label="' \+ lightAria\(\)/);
  assert.ok(!/\(is3d \? '<button class="slw-btn" type="button" data-act="showtime"/.test(SRC), 'the toggle is not 3D-only');
  assert.match(SRC, /\(is3d \? '' : ' dusk'\) \+ \(showtimeOn \|\| \(!is3d && Date\.now\(\) < encoreUntil\) \? ' showtime' : ''\)/, 'a redraw during the 2D encore keeps the night layer');
});

test('reduced motion: no floating glyphs; LED tower shows change at most every 0.5 s and survive redraws', () => {
  assert.match(fn('fx'), /if \(reduced\) return;/);
  const tap = fn('tapItem');
  assert.match(tap, /nowS - \(screenTap\[uid\] \|\| 0\) < 500/);
  assert.match(SRC, /if \(screenProg\[el\.dataset\.uid\]\) showProg\(el, screenProg\[el\.dataset\.uid\]\)/);
});

test('the makeover note never shows when the home is still the cottage (the parent switch)', () => {
  assert.match(fn('maybeMakeover'), /C\.selected\(w, 'shape'\) === 'shape_cottage'\) return;/);
});

test('sheets fill their 3D photocards (item, buy confirm, crew, goal chip) instead of the 2D cartoon pets', () => {
  assert.match(fn('openItem'), /fillPhotocards\(ov\)/);
  assert.match(fn('buyFlow'), /fillPhotocards\(c\)/);
  const pets = fn('openPets');
  assert.match(pets, /fillPhotocards\(ov\)/);
  assert.ok(!/ART\.pet\(/.test(pets), 'no 2D cartoon pet in the crew sheet');
  assert.match(fn('draw'), /fillPhotocards\(root\.querySelector\('\.slw-goal'\)\)/);
});

test('a 2D-fallback device gets the solid LOW panels', () => {
  assert.match(fn('disable3D'), /lowPanels\(\);/);
});

test('every photocard slot is a positioned box (.slw-pc is display:contents, so the 3D image covers its nearest positioned ancestor)', () => {
  assert.match(SRC, /'\.slw-goal \.gi\{[^}]*position:relative;/);
  assert.match(fn('openPets'), /<div style="width:120px;position:relative;">' \+ iconHtml\(p\.id/);
  assert.match(fn('openPets'), /<span style="display:block;position:relative;height:56px;">' \+ iconHtml\(a\.id\)/);
  assert.match(fn('buyFlow'), /<div class="big" style="width:140px;margin:8px auto;position:relative;">' \+ iconHtml/);
});
