/* ================================================================
   My Island 3D — QA lab helpers (pure; no DOM, no THREE).
   window.SLIslandLab in the browser (island3d_lab.html), module.exports
   in Node (tests/island-lab.test.js). DEV ONLY: not linked from the app
   and not precached. Rules come from SLWorldCore (C), looks from
   SLIslandLook (L) and act timelines from SLMotion (M); they are passed
   in, so nothing here depends on script order.

   API
     MODES, FIXTURES, CLIPS, PETS, KARTS, ACC_SLOTS, COMBOS, T0
     parseParams(search) → lab state      toQuery(state) → '?…' (defaults omitted)
     styleFor(id, st, defaults)           the st SL3D.make hands build() (mirrors stage.js resolveSt)
     plan(id, C, L, has)                  one showcase entry {key, id, via, base, st, fp, kind, label, note, missing}
     showcaseSections(C, L, has)          [{name, entries}] — every CATALOG id once, plus house combos
     layoutGrid(sections, opts)           {items: [{entry, x, z, w, d}], headers: [{name, x, z}], bounds}
     actsFor(id, C, M)                    {item: [...], controller: [...]} act names for the turntable
     styleOptions(id, C) · accBySlot(C)   pickers for the turntable / pets mode
     starterWorld(C) · maxWorld(C) · showcaseWorld(C) · fixture(name, C)
                                          deterministic profiles {name, points, world, errors}
     islandView(C, u, extra)              the view model rewards-world hands SLIsland3D.sync
     petSpots(C, u, n)                    free land cells near the house entrance (pets in the preview)
     budgetRows(stats, budget, scope)     [{key, label, value, limit, level}] level ok|warn|over|info
     checkItem(report, L)                 [{level, msg}] look-table checks for one built item
     fpsMeter(n) · memoryVerdict(base, after)
   ================================================================ */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SLIslandLab = api;
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = 1;
  var MODES = ['showcase', 'item', 'pets', 'karts', 'env', 'island'];
  var FIXTURES = ['starter', 'max', 'showcase'];
  var TIERS = ['LOW', 'MID', 'HIGH'];
  /* PetRig built-in clips (docs/island3d/CONTRACTS.md §1) */
  var CLIPS = ['idle', 'walk', 'run', 'hop', 'jump', 'fall', 'slide', 'tumble', 'dizzy', 'dance', 'cheer', 'sad', 'sit', 'kick', 'drive'];
  var PETS = ['pet_puppy', 'pet_kitten', 'pet_bunny', 'pet_dragon'];
  var KARTS = ['kart_red', 'kart_blue', 'kart_lime', 'kart_gold', 'kart_unicorn'];
  var ACC_SLOTS = ['hat', 'neck', 'face', 'back'];
  var T0 = Date.UTC(2026, 0, 1, 9, 0, 0);       /* every fixture timestamp: deterministic */
  var ALL_DETAILS = { detail_windowbox: true, detail_chimney: true, detail_lights: true, detail_flag: true };
  /* house style permutations shown after the single styles */
  var COMBOS = [
    { key: 'combo_castle', label: 'castle + every detail', st: { wall: 'wall_lilac', roof: 'roof_castle', door: 'door_gold', details: ALL_DETAILS } },
    { key: 'combo_candy', label: 'candy + every detail', st: { wall: 'wall_pink', roof: 'roof_candy', door: 'door_red', details: ALL_DETAILS } },
    { key: 'combo_thatch', label: 'thatch, box + chimney', st: { wall: 'wall_mint', roof: 'roof_thatch', door: 'door_green', details: { detail_windowbox: true, detail_chimney: true } } },
    { key: 'combo_slate', label: 'slate, lights + flag', st: { wall: 'wall_sky', roof: 'roof_blue', door: 'door_blue', details: { detail_lights: true, detail_flag: true } } }
  ];

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function own(o, k) { return o != null && Object.prototype.hasOwnProperty.call(o, k); }
  function copy(o) { var r = {}; for (var k in o) if (own(o, k)) r[k] = o[k]; return r; }
  function parseTier(v) { var t = typeof v === 'string' ? v.trim().toUpperCase() : ''; return TIERS.indexOf(t) >= 0 ? t : null; }

  /* ---------------- URL state ---------------- */
  function dec(s) { try { return decodeURIComponent(String(s).replace(/\+/g, ' ')); } catch (e) { return ''; } }
  function bool3(v) {
    if (v == null) return null;
    var s = String(v).toLowerCase();
    if (s === '1' || s === 'true' || s === 'on' || s === 'yes' || s === '') return true;
    if (s === '0' || s === 'false' || s === 'off' || s === 'no') return false;
    return null;
  }
  function parseAcc(s) {
    var out = {};
    String(s || '').split(',').forEach(function (pair) {
      var m = /^(hat|neck|face|back)[:=](acc_[a-z0-9_]+)$/.exec(pair.trim());
      if (m) out[m[1]] = m[2];
    });
    return out;
  }
  function parseSt(s) {
    if (!s) return null;
    try { var o = JSON.parse(s); return o && typeof o === 'object' && !Array.isArray(o) ? o : null; } catch (e) { return null; }
  }
  /* ?mode=showcase|item|pets|karts|env|island &item=<id> &st=<json> &tier=LOW|MID|HIGH &show=0..1
     &reduced=0|1 &wire=1 &outlines=0|1 &shadows=0|1 &idle=0 &spin=0 &sound=1 &fixture=starter|max|showcase
     &engine=mount|preview &sim=no3d|slNo3D &clip=<clip> &acc=hat:acc_crown,neck:acc_bow &fresh=1 */
  function parseParams(search) {
    var q = {};
    String(search || '').replace(/^\?/, '').split('&').forEach(function (kv) {
      if (!kv) return;
      var i = kv.indexOf('=');
      q[dec(i < 0 ? kv : kv.slice(0, i))] = i < 0 ? '' : dec(kv.slice(i + 1));
    });
    var item = /^[a-z0-9_]{2,40}$/.test(q.item || '') ? q.item : null;
    var mode = MODES.indexOf(q.mode) >= 0 ? q.mode : (item ? 'item' : 'showcase');
    var show = Number(q.show);
    return {
      mode: mode, item: item, st: parseSt(q.st), tier: parseTier(q.tier),
      show: own(q, 'show') && isFinite(show) ? clamp(show, 0, 1) : 0,
      reduced: bool3(q.reduced), wire: bool3(q.wire) === true,
      outlines: bool3(q.outlines), shadows: bool3(q.shadows),
      idle: bool3(q.idle) !== false, spin: bool3(q.spin) !== false, sound: bool3(q.sound) === true,
      fixture: FIXTURES.indexOf(q.fixture) >= 0 ? q.fixture : 'starter',
      engine: q.engine === 'mount' || q.engine === 'preview' ? q.engine : null,
      sim: q.sim === 'no3d' || q.sim === 'slNo3D' ? q.sim : null,
      clip: CLIPS.indexOf(q.clip) >= 0 ? q.clip : 'idle',
      acc: parseAcc(q.acc), fresh: bool3(q.fresh) === true
    };
  }
  function toQuery(s) {
    s = s || {};
    var out = [];
    function add(k, v) { out.push(encodeURIComponent(k) + '=' + encodeURIComponent(v)); }
    var mode = MODES.indexOf(s.mode) >= 0 ? s.mode : 'showcase';
    if (mode !== 'showcase' && !(mode === 'item' && s.item)) add('mode', mode);
    if (mode === 'item' && s.item) add('item', s.item);
    if (mode === 'item' && s.st && typeof s.st === 'object' && Object.keys(s.st).length) add('st', JSON.stringify(s.st));
    if (parseTier(s.tier)) add('tier', parseTier(s.tier));
    if (s.show > 0) add('show', String(Math.round(clamp(+s.show, 0, 1) * 100) / 100));
    if (s.reduced === true || s.reduced === false) add('reduced', s.reduced ? '1' : '0');
    if (s.wire) add('wire', '1');
    if (s.outlines === true || s.outlines === false) add('outlines', s.outlines ? '1' : '0');
    if (s.shadows === true || s.shadows === false) add('shadows', s.shadows ? '1' : '0');
    if (s.idle === false) add('idle', '0');
    if (s.spin === false) add('spin', '0');
    if (s.sound) add('sound', '1');
    if (s.fixture && s.fixture !== 'starter' && FIXTURES.indexOf(s.fixture) >= 0) add('fixture', s.fixture);
    if (s.engine === 'mount' || s.engine === 'preview') add('engine', s.engine);
    if (s.sim === 'no3d' || s.sim === 'slNo3D') add('sim', s.sim);
    if (s.clip && s.clip !== 'idle' && CLIPS.indexOf(s.clip) >= 0) add('clip', s.clip);
    var acc = ACC_SLOTS.filter(function (k) { return s.acc && typeof s.acc[k] === 'string' && /^acc_/.test(s.acc[k]); })
      .map(function (k) { return k + ':' + s.acc[k]; });
    if (acc.length) add('acc', acc.join(','));
    if (s.fresh) add('fresh', '1');
    return out.length ? '?' + out.join('&') : '';
  }

  /* ---------------- styles ---------------- */
  /* exactly stage.js resolveSt: the st that SL3D.make(id, st) passes to build() */
  function styleFor(id, st, defaults) {
    st = st || {}; defaults = defaults || {};
    function pick(k, d) { return st[k] || defaults[k] || d; }
    if (id === 'house_cottage') return { wall: pick('wall', 'wall_cream'), roof: pick('roof', 'roof_red'), door: pick('door', 'door_blue'), details: st.details || {} };
    if (id === 'att_course') return { course: pick('course', 'course_meadow') };
    if (id === 'att_pitch') return { ball: pick('ball', 'ball_classic'), stadium: pick('stadium', 'stadium_day') };
    if (id === 'att_kart') return { kart: pick('kart', 'kart_red') };
    if (/^pet_/.test(id)) return { acc: st.acc || {} };
    return st;
  }
  /* the house style that shows one home-style item */
  function houseStFor(it) {
    if (!it) return {};
    if (it.slot === 'detail') { var d = {}; d[it.id] = true; return { details: d }; }
    var o = {}; o[it.slot] = it.id; return o;
  }
  function accBySlot(C) {
    var out = { hat: [], neck: [], face: [], back: [] };
    C.CATALOG.forEach(function (it) { if (it.kind === 'acc' && out[it.slot] && !it.retired) out[it.slot].push(it.id); });
    return out;
  }
  function bySlot(C, slot) {
    return C.CATALOG.filter(function (it) { return it.slot === slot && !it.retired; }).map(function (it) { return it.id; });
  }
  /* pickers for the turntable: [{slot, label, multi, options}] */
  function styleOptions(id, C) {
    var it = C.item(id);
    if (!it) return [];
    if (id === 'house_cottage' || it.kind === 'style') {
      return [
        { slot: 'wall', label: 'Walls', multi: false, options: bySlot(C, 'wall') },
        { slot: 'roof', label: 'Roof', multi: false, options: bySlot(C, 'roof') },
        { slot: 'door', label: 'Door', multi: false, options: bySlot(C, 'door') },
        { slot: 'details', label: 'Details', multi: true, options: bySlot(C, 'detail') }
      ];
    }
    if (id === 'att_course' || it.slot === 'course') return [{ slot: 'course', label: 'Course', multi: false, options: bySlot(C, 'course') }];
    if (id === 'att_pitch' || it.slot === 'stadium' || it.slot === 'ball') {
      return [{ slot: 'ball', label: 'Ball', multi: false, options: bySlot(C, 'ball') },
              { slot: 'stadium', label: 'Stadium', multi: false, options: bySlot(C, 'stadium') }];
    }
    if (id === 'att_kart' || it.slot === 'kart') return [{ slot: 'kart', label: 'Kart', multi: false, options: bySlot(C, 'kart') }];
    if (it.kind === 'pet' || it.kind === 'acc') {
      var a = accBySlot(C);
      return ACC_SLOTS.map(function (s) { return { slot: 'acc.' + s, label: s.charAt(0).toUpperCase() + s.slice(1), multi: false, none: true, options: a[s] }; });
    }
    return [];
  }

  /* ---------------- showcase ---------------- */
  /* has = {model(id) → bool (a registered build), rig: bool (SL3D.makeRig), env: bool (SLIslandEnv)} */
  function plan(id, C, L, has) {
    has = has || {};
    var it = C.item(id), look = (L && L.LOOK && L.LOOK[id]) || {};
    var kind = it ? it.kind : (look.kind || 'unknown');
    var hasModel = function (x) { return !!(has.model && has.model(x)); };
    var e = { key: id, id: id, label: id, via: 'make', base: id, st: {}, fp: (it && it.fp) ? it.fp.slice() : [1, 1], kind: kind, note: '' };
    /* styles, course variants and stadia show on their base item (a style's own model, if a
       chunk registers one, still gets the base's footprint so neighbours never overlap) */
    if (kind === 'style') {
      e.st = houseStFor(it); e.fp = [2, 2];
      if (!hasModel(id)) { e.via = 'base'; e.base = 'house_cottage'; e.note = 'on the house'; }
    } else if (kind === 'variant' && it.slot === 'course') {
      e.st = { course: id }; e.fp = [2, 2];
      if (!hasModel(id)) { e.via = 'base'; e.base = 'att_course'; e.note = 'on the course gate'; }
    } else if (kind === 'variant') {
      e.note = 'kart track (game scene)';
    } else if (kind === 'cosmetic' && it.slot === 'stadium') {
      e.st = { stadium: id }; e.fp = [3, 2];
      if (!hasModel(id)) { e.via = 'base'; e.base = 'att_pitch'; e.note = 'on the pitch'; }
    } else if (kind === 'cosmetic' && it.slot === 'ball') {
      e.note = 'penalty ball';
    } else if (kind === 'cosmetic' && it.slot === 'kart') {
      e.note = 'kart';
    } else if (kind === 'pet') {
      e.st = { acc: {} };
      if (has.rig) { e.via = 'rig'; e.note = 'makeRig'; }
    } else if (kind === 'acc') {
      var acc = {}; acc[it.slot] = id;
      e.st = { acc: acc };
      if (has.rig) { e.via = 'rig'; e.base = 'pet_puppy'; e.note = 'on the puppy'; }
    } else if (kind === 'land') {
      e.via = 'land'; e.fp = [2, 2]; e.note = 'drawn by env.js';
    }
    e.missing = e.via === 'rig' ? false : e.via === 'land' ? !has.env : !hasModel(e.base);
    return e;
  }
  function lookKind(L, id) { return (L && L.LOOK && L.LOOK[id] && L.LOOK[id].kind) || ''; }
  /* section order; every CATALOG id lands in exactly one (tested) */
  var SECTIONS = [
    { name: 'Home & attractions', test: function (it) { return it.kind === 'house' || it.kind === 'attraction'; } },
    { name: 'Garden', test: function (it, lk) { return /^(tree|flower|bush|rock)$/.test(lk); } },
    { name: 'Lights & flags', test: function (it, lk) { return /^(light|mushroom|flag)$/.test(lk); } },
    { name: 'Decor & landmarks', test: function (it, lk) { return it.kind === 'decor' && /^(decor|landmark)$/.test(lk); } },
    { name: 'Paths', test: function (it) { return it.kind === 'path'; } },
    { name: 'Fun', test: function (it) { return it.kind === 'fun'; } },
    { name: 'Walls & doors', test: function (it) { return it.kind === 'style' && (it.slot === 'wall' || it.slot === 'door'); } },
    { name: 'Roofs & details', test: function (it) { return it.kind === 'style' && (it.slot === 'roof' || it.slot === 'detail'); } },
    { name: 'House combos', combos: true, test: function () { return false; } },
    { name: 'Pets & accessories', test: function (it) { return it.kind === 'pet' || it.kind === 'acc'; } },
    { name: 'Course & tracks', test: function (it) { return it.kind === 'variant'; } },
    { name: 'Balls & stadia', test: function (it) { return it.kind === 'cosmetic' && (it.slot === 'ball' || it.slot === 'stadium'); } },
    { name: 'Karts', test: function (it) { return it.kind === 'cosmetic' && it.slot === 'kart'; } },
    { name: 'Land', test: function (it) { return it.kind === 'land'; } },
    { name: 'Other', test: function () { return true; } }    /* a future CATALOG kind still shows up */
  ];
  function showcaseSections(C, L, has) {
    var taken = {};
    return SECTIONS.map(function (s) {
      var entries;
      if (s.combos) {
        entries = COMBOS.map(function (cb) {
          var hasHouse = !!(has && has.model && has.model('house_cottage'));
          return { key: cb.key, id: 'house_cottage', label: cb.label, via: 'base', base: 'house_cottage', st: JSON.parse(JSON.stringify(cb.st)),
                   fp: [2, 2], kind: 'house', note: 'style permutation', missing: !hasHouse, combo: true };
        });
      } else {
        entries = C.CATALOG.filter(function (it) {
          if (taken[it.id] || it.retired) return false;
          if (!s.test(it, lookKind(L, it.id))) return false;
          taken[it.id] = true;
          return true;
        }).map(function (it) { return plan(it.id, C, L, has); });
      }
      return { name: s.name, entries: entries };
    }).filter(function (s) { return s.entries.length > 0; });
  }
  /* rows of footprints (1 cell = 1 u) wrapped at maxWidth, rows advancing toward +z (the
     camera side), so the first section is at the back (top of the screen). Every row keeps
     `header` u above it for section titles. flow (default): a section continues on the
     current row after a wider sectionGap; flow false: every section starts a new row. */
  function layoutGrid(sections, o) {
    o = o || {};
    var maxW = o.maxWidth || 20, gap = o.gap == null ? 0.7 : o.gap, sGap = o.sectionGap == null ? 1.2 : o.sectionGap;
    var head = o.header == null ? 0.5 : o.header, flow = o.flow !== false;
    var items = [], headers = [], z = head, x = 0, rowD = 0, maxX = 0;
    function newRow() { z += rowD + gap + head; x = 0; rowD = 0; }
    (sections || []).forEach(function (s) {
      if (!s.entries || !s.entries.length) return;
      if (x > 0) { if (flow) x += sGap - gap; else newRow(); }
      s.entries.forEach(function (e, i) {
        var w = (e.fp && e.fp[0]) || 1, d = (e.fp && e.fp[1]) || 1;
        if (x > 0 && x + w > maxW) newRow();
        if (i === 0) headers.push({ name: s.name, x: x, z: z - head * 0.5 });
        items.push({ entry: e, x: x + w / 2, z: z + d / 2, w: w, d: d });
        maxX = Math.max(maxX, x + w);
        x += w + gap;
        rowD = Math.max(rowD, d);
      });
    });
    z += rowD;
    var cx = maxX / 2, cz = z / 2;
    items.forEach(function (i) { i.x -= cx; i.z -= cz; });
    headers.forEach(function (h) { h.x -= cx; h.z -= cz; });
    return { items: items, headers: headers, bounds: { minX: -cx, maxX: maxX - cx, minZ: -cz, maxZ: z - cz, width: maxX, depth: z } };
  }

  /* ---------------- acts ---------------- */
  /* item acts (the model's act handler) and the controller's own acts (squish etc.) */
  function actsFor(id, C, M) {
    var it = C.item(id), out = [];
    if (it && it.act) {
      if (it.act === 'glow') out.push('glowOn', 'glowOff');
      else if (it.act === 'home') out.push('home', 'homeClose');
      else {
        var n = M && typeof M.actFor === 'function' ? M.actFor(it.act, id, false) : null;
        if (n) out.push(n);
      }
    }
    if (it && it.kind === 'pet') out.push('hop');
    return { item: out, controller: ['squish', 'dropIn', 'debut', 'store'] };
  }

  /* ---------------- fixture worlds ---------------- */
  function profile(name) { return { name: name || 'Lab', points: 0, world: null }; }
  function newCtx(tag) { return { tag: tag, n: 0, errors: [] }; }
  function buy(C, u, id, ctx, pref) {
    ctx.n++;
    var r = C.purchase(u, id, { tx: 'lab_' + ctx.tag + '_' + ctx.n, trial: true, now: T0, prefX: pref && pref.x, prefY: pref && pref.y });
    if (!r.ok) ctx.errors.push('buy ' + id + ': ' + (r.code || r.reason));
    return r;
  }
  function landCells(C, w) {
    return Object.keys(C.landSet(w)).map(function (k) { var p = k.split(','); return { c: +p[0], r: +p[1] }; })
      .sort(function (a, b) { return a.r - b.r || a.c - b.c; });
  }
  function placeOne(C, u, id, pref, ctx) {
    var w = C.ensureWorld(u), spot = C.findSpot(w, id, pref && pref.c, pref && pref.r);
    if (!spot) { ctx.errors.push('no room for ' + id); return null; }
    var r = C.place(u, id, spot.x, spot.y, null, T0);
    if (!r.ok) { ctx.errors.push('place ' + id + ': ' + r.reason); return null; }
    return r.uid;
  }
  function finish(u, ctx) { u.errors = ctx.errors; return u; }
  function starterWorld(C) {
    var u = profile('Lab starter'), ctx = newCtx('st');
    C.ensureWorld(u);
    if (!C.grantStarter(u, T0)) ctx.errors.push('starter not granted');
    return finish(u, ctx);
  }
  /* everything else in the shop once (attractions first, so their cosmetics unlock) */
  function buyEverything(C, u, ctx) {
    buy(C, u, 'land_cove', ctx); buy(C, u, 'land_meadow', ctx);
    buy(C, u, 'att_pitch', ctx, { x: 13, y: 3 });
    buy(C, u, 'att_kart', ctx, { x: 0, y: 3 });
    var w = C.ensureWorld(u);
    C.CATALOG.forEach(function (it) {
      if (it.starter || it.included || it.retired || C.owns(w, it.id)) return;
      buy(C, u, it.id, ctx);
    });
  }
  function equipAll(C, u, sets, ctx) {
    Object.keys(sets).forEach(function (petId) {
      sets[petId].forEach(function (accId) {
        var r = C.equipAccessory(u, petId, accId, T0);
        if (!r.ok || !r.on) ctx.errors.push('equip ' + accId + ' on ' + petId);
      });
    });
  }
  function selectAll(C, u, ids, ctx) {
    ids.forEach(function (id) { if (!C.select(u, id, T0).ok) ctx.errors.push('select ' + id); });
  }
  /* 'max island': all land, every placeable id, 20 paths, 4 pets wearing every accessory */
  function maxWorld(C) {
    var u = starterWorld(C), ctx = newCtx('mx');
    ctx.errors = u.errors.slice();
    buyEverything(C, u, ctx);
    var w = C.ensureWorld(u);
    /* paths: 20 in all (the starter's 4 stone + 2 stone + 7 wood + 7 flower) */
    var extraPaths = { path_stone: 20 - 7 - 7 - C.ownedCount(w, 'path_stone'), path_wood: 7 - C.ownedCount(w, 'path_wood'), path_flower: 7 - C.ownedCount(w, 'path_flower') };
    Object.keys(extraPaths).forEach(function (id) { for (var i = 0; i < extraPaths[id]; i++) buy(C, u, id, ctx); });
    selectAll(C, u, ['wall_pink', 'roof_candy', 'door_gold'], ctx);    /* candy keeps the rooftop flag (castle drops it) */
    equipAll(C, u, {
      pet_puppy: ['acc_crown', 'acc_bow', 'acc_shades', 'acc_cape'],
      pet_kitten: ['acc_partyhat', 'acc_scarf', 'acc_shades', 'acc_cape'],
      pet_bunny: ['acc_crown', 'acc_scarf', 'acc_shades', 'acc_cape'],
      pet_dragon: ['acc_partyhat', 'acc_bow', 'acc_shades', 'acc_cape']
    }, ctx);
    /* place every stored copy: fun, then decor spread over the land, then paths near the door */
    var cells = landCells(C, w), k = 0;
    var stored = C.inventory(w).map(function (x) { return x; });
    var rank = { fun: 0, decor: 1, path: 2 };
    stored.sort(function (a, b) { return (rank[C.item(a.id).kind] || 0) - (rank[C.item(b.id).kind] || 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0); });
    stored.forEach(function (x) {
      var kind = C.item(x.id).kind;
      for (var i = 0; i < x.count; i++) {
        var pref = kind === 'path' ? { c: 7, r: 6 } : cells[(k++ * 29) % cells.length];
        placeOne(C, u, x.id, pref, ctx);
      }
    });
    u.name = 'Lab max island';
    return finish(u, ctx);
  }
  /* 'all-81 showcase': every CATALOG id owned, each placeable placed exactly once, in rows */
  function showcaseWorld(C) {
    var u = starterWorld(C), ctx = newCtx('sc');
    ctx.errors = u.errors.slice();
    var w = C.ensureWorld(u);
    /* store the starter's decor and paths so each id is placed once, in catalogue order */
    w.placed.slice().forEach(function (p) { if (C.isStorable(C.item(p.id))) C.store(u, p.uid, T0); });
    buyEverything(C, u, ctx);
    selectAll(C, u, ['wall_sky', 'roof_castle', 'door_red'], ctx);
    equipAll(C, u, {
      pet_puppy: ['acc_partyhat', 'acc_bow'], pet_kitten: ['acc_crown', 'acc_scarf'],
      pet_bunny: ['acc_shades'], pet_dragon: ['acc_cape']
    }, ctx);
    var ids = C.CATALOG.filter(function (it) { return C.isPlaceable(it) && C.placedCount(w, it.id) === 0; }).map(function (it) { return it.id; });
    var cells = landCells(C, w), step = Math.max(1, Math.floor(cells.length / Math.max(1, ids.length)));
    ids.forEach(function (id, i) { placeOne(C, u, id, cells[Math.min(cells.length - 1, i * step)], ctx); });
    u.name = 'Lab all-81 showcase';
    return finish(u, ctx);
  }
  function fixture(name, C) {
    if (name === 'max') return maxWorld(C);
    if (name === 'showcase') return showcaseWorld(C);
    return starterWorld(C);
  }

  /* ---------------- view model (architecture: integrationWithRewardsWorld → islandView) ---------------- */
  function islandView(C, u, extra) {
    extra = extra || {};
    var w = C.ensureWorld(u);
    return {
      placed: w.placed.filter(function (p) { return !!C.item(p.id); }).map(function (p) { return { uid: p.uid, id: p.id, x: p.x, y: p.y }; }),
      style: {
        wall: C.selected(w, 'wall'), roof: C.selected(w, 'roof'), door: C.selected(w, 'door'), details: copy(w.details),
        course: C.selected(w, 'course'), ball: C.selected(w, 'ball'), stadium: C.selected(w, 'stadium'), kart: C.selected(w, 'kart')
      },
      unlocked: C.unlockedRegions(w),
      pets: w.pets.filter(function (p) { return C.owns(w, p.id); })
        .map(function (p) { return { id: p.id, name: p.name, acc: copy(p.acc || {}), active: w.activePet === p.id }; }),
      lit: copy(extra.lit || {}), mode: extra.mode || 'play', selectedUid: extra.selectedUid || null,
      placing: extra.placing || null, newUids: (extra.newUids || []).slice(), anim: copy(extra.anim || {})
    };
  }
  /* free land cells for pets in the lab preview: nearest the house entrance first,
     skipping the avatar's cell (the left half of the entrance) and anything occupied */
  function petSpots(C, u, n) {
    var w = C.ensureWorld(u), land = C.landSet(w), occ = C.occupancy(w).occ, house = null;
    w.placed.forEach(function (p) { if (p.id === 'house_cottage') house = p; });
    var ent = house ? C.entranceCells(C.item('house_cottage'), house.x, house.y) : [];
    var avatar = ent[0] || null, o = ent[1] ? ent[1].split(',').map(Number) : [7, 5];
    return Object.keys(land).filter(function (k) { return !occ[k] && k !== avatar; })
      .map(function (k) { var p = k.split(',').map(Number); return { c: p[0], r: p[1], d: (p[0] - o[0]) * (p[0] - o[0]) + (p[1] - o[1]) * (p[1] - o[1]) }; })
      .sort(function (a, b) { return a.d - b.d || a.r - b.r || a.c - b.c; })
      .slice(0, Math.max(0, n | 0))
      .map(function (p) { return { c: p.c, r: p.r }; });
  }

  /* ---------------- budgets and checks ---------------- */
  /* scope: 'island' (island budgets) | 'game' (game budgets) | 'info' (a QA scene: only
     programs are judged, since every item shares the same few) */
  function budgetRows(stats, budget, scope) {
    stats = stats || {}; budget = budget || {};
    var game = scope === 'game', judged = scope === 'island' || game;
    function row(key, label, value, limit, always) {
      var level = 'info';
      if (limit > 0 && value != null && (judged || always)) level = value > limit ? 'over' : value > limit * 0.85 ? 'warn' : 'ok';
      return { key: key, label: label, value: value, limit: limit || null, level: level };
    }
    var rows = [
      row('calls', 'Draw calls', stats.calls, game ? budget.gameDrawCalls : budget.drawCalls, false),
      row('tris', 'Triangles', stats.tris, game ? budget.gameTris : budget.tris, false),
      row('programs', 'Programs', stats.programs, budget.programs, true),
      row('geometries', 'Geometries', stats.geometries, null, false),
      row('textures', 'Textures', stats.textures, null, false)
    ];
    var fps = { key: 'fps', label: 'FPS', value: stats.fps, limit: 30, level: 'info' };
    if (stats.fps > 0) fps.level = stats.fps < 30 ? 'over' : stats.fps < 55 ? 'warn' : 'ok';
    rows.push(fps);
    return rows;
  }
  /* a built item against its look entry. report: {id, look, fp, size: {w, h, d}, low: {w, d}
     (bounds below y = 1), tris, parts, staticMats, pivots[], anchors[], placeholder, st} */
  var HOUSE_DETAIL_PIVOT = { emitter: 'detail_chimney', flag: 'detail_flag', glow: 'detail_lights' };
  function checkItem(r, L) {
    r = r || {};
    var out = [], look = r.look || {}, fp = r.fp || [1, 1];
    function add(level, msg) { out.push({ level: level, msg: msg }); }
    if (r.placeholder) add('over', 'no model yet: placeholder slab');
    if (typeof look.tris === 'number' && r.tris > look.tris) add('over', r.tris + ' tris > budget ' + look.tris);
    if (r.parts > 6) add('warn', r.parts + ' parts (max 6)');
    if (r.staticMats > 4) add('warn', r.staticMats + ' static materials (max 4)');
    if (r.size && typeof look.h === 'number' && !r.placeholder) {
      var tol = Math.max(0.05, look.h * 0.15);
      if (look.h > 0 && Math.abs(r.size.h - look.h) > tol) add('warn', 'height ' + r.size.h.toFixed(2) + ' u vs look ' + look.h + ' u');
    }
    var placed = L && L.PLACED_KINDS ? !!L.PLACED_KINDS[look.kind] : false;
    if (placed && r.low && !r.placeholder) {
      var lw = fp[0] * 0.86 + 0.02, ld = fp[1] * 0.86 + 0.02;
      if (r.low.w > lw || r.low.d > ld) add('warn', 'below 1 u it spans ' + r.low.w.toFixed(2) + ' × ' + r.low.d.toFixed(2) + ' (fits ' + (lw - 0.02).toFixed(2) + ' × ' + (ld - 0.02).toFixed(2) + ')');
      if (r.size && (r.size.w > fp[0] + 0.12 || r.size.d > fp[1] + 0.12)) add('warn', 'overhangs its ' + fp[0] + ' × ' + fp[1] + ' footprint');
    }
    if (!r.placeholder && Array.isArray(look.pivots) && look.instancing !== 'rig') {
      var have = r.pivots || [], details = (r.st && r.st.details) || {};
      look.pivots.forEach(function (p) {
        if (p === 'root' || have.indexOf(p) >= 0) return;
        if (r.id === 'house_cottage' && HOUSE_DETAIL_PIVOT[p] && !details[HOUSE_DETAIL_PIVOT[p]]) return;
        add(p === look.actPivot ? 'over' : 'warn', 'missing pivot "' + p + '"' + (p === look.actPivot ? ' (the act drives it)' : ''));
      });
    }
    if (!r.placeholder && Array.isArray(look.anchors)) {
      look.anchors.forEach(function (a) { if ((r.anchors || []).indexOf(a) < 0) add('warn', 'missing anchor "' + a + '"'); });
    }
    if (!out.length) add('ok', 'matches its look entry');
    return out;
  }
  /* rolling average of frame intervals */
  function fpsMeter(n) {
    n = n || 60;
    var buf = [], sum = 0;
    return {
      push: function (ms) {
        if (!(ms > 0) || ms > 1000) return;
        buf.push(ms); sum += ms;
        if (buf.length > n) sum -= buf.shift();
      },
      avgMs: function () { return buf.length ? sum / buf.length : 0; },
      fps: function () { return buf.length ? 1000 / (sum / buf.length) : 0; },
      reset: function () { buf = []; sum = 0; },
      get count() { return buf.length; }
    };
  }
  /* leak check: geometries and textures must return to the baseline */
  function memoryVerdict(base, after) {
    base = base || {}; after = after || {};
    var rows = ['geometries', 'textures'].map(function (k) {
      var b = +base[k] || 0, a = +after[k] || 0;
      return { key: k, base: b, after: a, delta: a - b, ok: a <= b };
    });
    return { ok: rows.every(function (r) { return r.ok; }), rows: rows };
  }

  return {
    VERSION: VERSION, MODES: MODES, FIXTURES: FIXTURES, CLIPS: CLIPS, PETS: PETS, KARTS: KARTS,
    ACC_SLOTS: ACC_SLOTS, COMBOS: COMBOS, T0: T0,
    parseParams: parseParams, toQuery: toQuery, styleFor: styleFor, plan: plan,
    showcaseSections: showcaseSections, layoutGrid: layoutGrid, actsFor: actsFor,
    styleOptions: styleOptions, accBySlot: accBySlot,
    starterWorld: starterWorld, maxWorld: maxWorld, showcaseWorld: showcaseWorld, fixture: fixture,
    islandView: islandView, petSpots: petSpots,
    budgetRows: budgetRows, checkItem: checkItem, fpsMeter: fpsMeter, memoryVerdict: memoryVerdict
  };
}));
