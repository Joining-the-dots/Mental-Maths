'use strict';
/* My Island — the display copy table (world/world-copy.js): the Encore City voice */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const W = require('../world/world-copy.js');
const C = require('../world/world-core.js');

const ROOT = path.join(__dirname, '..');
const BANNED = ['yay', 'yippee', 'hooray', 'boing', 'oopsie', 'uh-oh', 'cosy', 'little', 'tiny', 'cute', 'poorly',
                'magic', 'magical', 'friendly', 'super', 'sparkly', 'lovely'];
/* an independent word-boundary check (case-insensitive) */
const hasBanned = (s) => BANNED.some((w) => new RegExp('(^|[^a-z])' + w.replace('-', '\\-') + '($|[^a-z])', 'i').test(s));
const emoji = (s) => (String(s).match(/\p{Extended_Pictographic}/gu) || []).filter((c) => c !== '✦').length;

test('copy: the ban list is the art bible list', () => {
  assert.deepEqual([...W.BANNED], BANNED);
  const bible = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'island3d', 'art-bible.v2.json'), 'utf8'));
  assert.deepEqual(bible.copy.banned, BANNED);
});

test('copy: every override id is in CATALOG, and the CATALOG text itself is never edited', () => {
  for (const id of W.DESC_IDS) assert.ok(C.item(id), id + ' is a CATALOG id');
  /* the trampoline line is the art director's rewrite, verbatim */
  assert.equal(W.desc('trampoline'), 'Tap it — your pet does a triple bounce and a flip.');
  assert.equal(C.item('trampoline').desc, 'Tap it and your pet bounces! Boing!', 'CATALOG desc unchanged');
  for (const id of ['wall_cream', 'mushroom_glow', 'rock_mossy', 'sandcastle', 'pet_dragon', 'pet_puppy', 'house_cottage',
                    'roof_castle', 'track_loop', 'kart_unicorn', 'trampoline']) assert.ok(W.DESC_IDS.includes(id), id + ' re-voiced');
  /* ids without an override fall back to their CATALOG description */
  assert.equal(W.desc('tree_oak'), C.item('tree_oak').desc);
  assert.equal(W.desc('bld_boba'), C.item('bld_boba').desc);
  assert.equal(W.desc('no_such_id'), '');
});

test('copy: no description for any of the 104 ids and no UI string contains a banned word; one emoji at most', () => {
  assert.equal(C.CATALOG.length, 104);
  for (const it of C.CATALOG) {
    const d = W.desc(it.id);
    assert.ok(d.length > 0, it.id + ' has a description');
    assert.ok(!hasBanned(d), it.id + ': ' + d);
    assert.deepEqual(W.bannedIn(d), [], it.id);
    assert.ok(emoji(d) <= 1, it.id + ' emoji');
    /* every CATALOG description that uses a banned word has an override */
    if (hasBanned(it.desc)) assert.ok(W.DESC_IDS.includes(it.id), it.id + ' needs a re-voiced description');
  }
  for (const k of W.KEYS) {
    const s = W.t(k, { name: 'Biscuit' });
    assert.ok(s && s !== k, k + ' has copy');
    assert.ok(!hasBanned(s), k + ': ' + s);
    assert.ok(emoji(s) <= 1, k + ' has at most one emoji');
    assert.equal(W.emojiCount(s), emoji(s), k + ' emojiCount agrees');
    assert.ok(!/K-?pop|idol/i.test(s), k + ' never says K-pop or idol');
  }
});

test('copy: the art director rewrites and the Encore City lines', () => {
  const want = {
    'celebrate.ok': 'Nice',
    'crew.neverSad': 'Your crew never gets sad. Take a break — they’ll be ready when you’re back.',
    'edit.placed': 'Placed.', 'edit.moved': 'Moved.', 'edit.stored': 'Stored. Find it in Edit.',
    'buy.style': 'New look, locked in. Tap your home to restyle any time.',
    'buy.acc': 'Equipped. Swap it around in Crew.',
    'goal.reached': 'Goal smashed — you saved for that. Set the next one.',
    'edit.hint': 'Edit mode: tap anything to move it or store it.',
    'player.pick': 'Choose a player to enter the island.',
    'goal.set': 'Set a goal 🎯',
    'buy.cosmetic': 'Equipped for your next run.',
    'light.golden': 'Golden hour', 'light.showtime': 'Showtime',
    'shop.dimmed': 'Dimmed ones are in the Island Shop.',
    'makeover.toast': 'Your home got a city makeover. Tap it to switch back to the cottage.',
    'makeover.revert': 'Back to the cottage',
    'shop.tab.city': 'City', 'home.tray.shape': 'Shape', 'label.crew': 'Crew',
    'unlock.city': 'A city building. Place it, then tap it.',
    'unlock.shape': 'A whole new shape for your home. Your walls, roof, door and extras come with you.'
  };
  for (const [k, v] of Object.entries(want)) assert.equal(W.t(k), v, k);
  assert.equal(W.t('crew.named', { name: 'Biscuit' }), 'Biscuit it is.');
  assert.match(W.t('games.noPoints'), /^Game scores don.t earn or spend ⭐$/);
});

test('copy: t() fills placeholders and falls back safely', () => {
  assert.equal(W.t('crew.named', {}), '{name} it is.', 'a missing var leaves the placeholder');
  assert.equal(W.t('no.such.key'), 'no.such.key');
  assert.equal(W.t('no.such.key', null, 'Fallback'), 'Fallback');
  assert.equal(W.t('crew.named', { name: 'O’Malley' }), 'O’Malley it is.');
  assert.deepEqual(W.bannedIn('Yay! Boing, uh-oh, super-cute'), ['yay', 'boing', 'uh-oh', 'super', 'cute']);
  assert.deepEqual(W.bannedIn('Superb littleness, magically'), [], 'whole words only');
  assert.equal(W.emojiCount('Set a goal 🎯 ⭐'), 2);
  assert.equal(W.emojiCount('✦ a spark — not an emoji'), 0);
  assert.throws(() => { 'use strict'; W.KEYS.push('x'); });
});

test('copy: loads as a browser global (window.SLWorldCopy) next to SLWorldCore', () => {
  const ctx = {};
  ctx.self = ctx;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'world', 'world-core.js'), 'utf8'), ctx);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'world', 'world-copy.js'), 'utf8'), ctx);
  assert.ok(ctx.SLWorldCopy && ctx.SLWorldCore);
  assert.equal(ctx.SLWorldCopy.desc('tree_oak'), C.item('tree_oak').desc);
  assert.equal(ctx.SLWorldCopy.t('light.golden'), 'Golden hour');
  /* without world-core it still answers the overrides and the UI strings */
  const lone = {};
  lone.self = lone;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'world', 'world-copy.js'), 'utf8'), lone);
  assert.equal(lone.SLWorldCopy.desc('trampoline'), W.desc('trampoline'));
  assert.equal(lone.SLWorldCopy.desc('tree_oak'), '');
});
