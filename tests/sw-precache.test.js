/* node --test tests/   (Node 22+)
   The service worker precaches everything My Island and its games load, at the
   same ?v= the app asks for (index.html SL_WORLD_VER), so an offline launch
   after an update finds every file. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const S = require('../world/island3d/stage.js');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const SW = read('sw.js');
const INDEX = read('index.html');
const shell = JSON.parse('[' + /const APP_SHELL = \[([\s\S]*?)\];/.exec(SW)[1].replace(/\/\*[\s\S]*?\*\//g, '').replace(/'/g, '"').replace(/,\s*$/, '') + ']');
const VER = /window\.SL_WORLD_VER = '(\d+)';/.exec(INDEX)[1];

test('sw.js: every precached file exists and world files carry the current SL_WORLD_VER', () => {
  shell.forEach((u) => {
    const f = u.replace(/^\.\//, '').replace(/\?.*$/, '');
    if (f) assert.ok(fs.existsSync(path.join(ROOT, f)), u + ' exists');
    if (/^\.\/world\//.test(u)) assert.ok(u.endsWith('?v=' + VER), u + ' uses ?v=' + VER);
  });
  assert.equal(new Set(shell).size, shell.length, 'no duplicates');
});

test('sw.js: precaches every island3d stage file and every script the world loader fetches', () => {
  S.FILES.forEach((f) => {
    const url = './world/' + (f.path.startsWith('../') ? f.path.slice(3) : 'island3d/' + f.path) + '?v=' + VER;
    assert.ok(shell.includes(url), url);
  });
  const loader = /window\.slLoadWorld = function \(\) \{([\s\S]*?)\n {2}\};/.exec(INDEX)[1];
  (loader.match(/'world\/[a-z0-9/_.-]+\.(?:js|css)'/g) || []).forEach((q) => {
    const url = './' + q.slice(1, -1) + '?v=' + VER;
    assert.ok(shell.includes(url), url);
  });
  ['shell.js', 'fx.js', 'pet-course.js', 'penalty.js', 'kart.js'].forEach((g) => assert.ok(shell.includes('./world/games/' + g + '?v=' + VER), g));
});
