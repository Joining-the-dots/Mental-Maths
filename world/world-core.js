/* ================================================================
   My Island — core logic (pure; no DOM).
   Loaded in the browser as window.SLWorldCore and in Node tests via
   require(). Everything that decides money, ownership, placement,
   arcade time or personal bests lives here so it can be tested.

   Points: the island spends the app's EXISTING spendable balance
   (u.points). It never touches u.pointsEarned (lifetime), never awards
   points, and keeps an audit ledger of every purchase in u.world.
   ================================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SLWorldCore = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = 1;
  var COLS = 16, ROWS = 10;

  /* ---------------- economy (see docs/REWARDS_WORLD.md §3) ---------------- */
  var ECONOMY = {
    sessionPts: 120,          /* representative ~25-minute learning session */
    confirmAt: 300,           /* purchases at/above this ask "are you sure?" */
    ledgerCloudCap: 1000,
    trialMaxCopies: 20        /* free test mode: per-copy items stop at this many each */
  };

  /* ---------------- land ---------------- */
  /* row -> [fromCol, toCol] inclusive */
  var REGIONS = {
    home:   { name: 'Home Island', rows: { 1: [4, 10], 2: [3, 11], 3: [2, 12], 4: [2, 12], 5: [2, 12], 6: [2, 12], 7: [3, 11], 8: [4, 10] } },
    cove:   { name: 'Beach Cove',  unlock: 'land_cove',   rows: { 2: [12, 14], 3: [13, 15], 4: [13, 15], 5: [13, 15], 6: [13, 15], 7: [12, 14] } },
    meadow: { name: 'Meadow Hill', unlock: 'land_meadow', rows: { 2: [0, 2], 3: [0, 1], 4: [0, 1], 5: [0, 1], 6: [0, 1], 7: [0, 2], 8: [1, 3] } }
  };
  function regionCells(key) {
    var out = [], r = REGIONS[key].rows;
    Object.keys(r).forEach(function (row) {
      for (var c = r[row][0]; c <= r[row][1]; c++) out.push(c + ',' + row);
    });
    return out;
  }
  var REGION_CELLS = {};
  var CELL_REGION = {};
  Object.keys(REGIONS).forEach(function (k) {
    REGION_CELLS[k] = regionCells(k);
    REGION_CELLS[k].forEach(function (ck) { CELL_REGION[ck] = k; });
  });

  /* ---------------- catalogue ----------------
     Stable ids — never rename or reuse an id. Retire with retired:true
     (owners keep it; it just leaves the shop).
     kind:   decor (per copy) | path (per copy, ground) | fun (unique, interactive)
             house (the home itself) | style (unique, selectable house look)
             pet | acc (pet accessory) | land | attraction | variant (game course/track)
             cosmetic (ball / stadium / kart)
     slot:   for style/cosmetic/variant — what it replaces when selected
     fp:     footprint [w,h] in cells for placeable kinds
     act:    what tapping it does on the island ('launch' | 'bounce' | 'splash' |
             'swing' | 'bubbles' | 'glow' | 'wave' | 'spin' | 'home' | null) */
  var CATALOG = [
    /* ---- starter (free, granted once) ---- */
    { id: 'house_cottage', kind: 'house', name: 'Your Home', price: 0, starter: true, fp: [2, 2], entrance: true, act: 'home', desc: 'Your very own home. Tap it to change its colours.' },
    { id: 'att_course', kind: 'attraction', game: 'course', name: 'Pet Obstacle Course', price: 0, starter: true, fp: [2, 2], entrance: true, act: 'launch', includes: ['course_meadow'], desc: 'Your pet’s own obstacle course. Tap the gate to play — free, forever.' },
    { id: 'pet_puppy', kind: 'pet', name: 'Puppy', price: 0, starter: true, desc: 'Your first pet! Loyal, bouncy and always pleased to see you.' },
    { id: 'wall_cream', kind: 'style', slot: 'wall', name: 'Cream walls', price: 0, starter: true, desc: 'Warm and cosy.' },
    { id: 'roof_red', kind: 'style', slot: 'roof', name: 'Red tile roof', price: 0, starter: true, desc: 'A classic red roof.' },
    { id: 'door_blue', kind: 'style', slot: 'door', name: 'Blue door', price: 0, starter: true, desc: 'A bright blue front door.' },
    { id: 'course_meadow', kind: 'variant', game: 'course', slot: 'course', name: 'Meadow Dash', price: 0, included: true, desc: 'Grassy hills, hurdles and logs.' },

    /* ---- garden: per copy ---- */
    { id: 'flower_tulip', kind: 'decor', cat: 'garden', name: 'Tulips', price: 40, fp: [1, 1], desc: 'A bunch of bright tulips. Buy as many as you like.' },
    { id: 'flower_daisy', kind: 'decor', cat: 'garden', name: 'Daisy patch', price: 40, fp: [1, 1], desc: 'A cheerful patch of daisies.' },
    { id: 'flower_sun', kind: 'decor', cat: 'garden', name: 'Sunflowers', price: 50, fp: [1, 1], desc: 'Tall sunflowers that follow the sun.' },
    { id: 'bush_rose', kind: 'decor', cat: 'garden', name: 'Rose bush', price: 70, fp: [1, 1], desc: 'A round bush full of pink roses.' },
    { id: 'rock_mossy', kind: 'decor', cat: 'garden', name: 'Mossy rock', price: 40, fp: [1, 1], desc: 'A friendly, mossy boulder.' },
    { id: 'tree_oak', kind: 'decor', cat: 'garden', name: 'Oak tree', price: 120, fp: [1, 1], desc: 'A big leafy oak tree.' },
    { id: 'tree_pine', kind: 'decor', cat: 'garden', name: 'Pine tree', price: 110, fp: [1, 1], desc: 'A tall evergreen pine.' },
    { id: 'tree_apple', kind: 'decor', cat: 'garden', name: 'Apple tree', price: 150, fp: [1, 1], desc: 'Covered in shiny red apples.' },
    { id: 'tree_blossom', kind: 'decor', cat: 'garden', name: 'Blossom tree', price: 160, fp: [1, 1], desc: 'Fluffy pink blossom all year round.' },
    { id: 'tree_palm', kind: 'decor', cat: 'garden', name: 'Palm tree', price: 140, fp: [1, 1], desc: 'A swaying palm — perfect by the sea.' },
    { id: 'lantern', kind: 'decor', cat: 'lights', name: 'Lantern post', price: 90, fp: [1, 1], act: 'glow', desc: 'Tap it to switch the light on and off.' },
    { id: 'mushroom_glow', kind: 'decor', cat: 'lights', name: 'Glowing mushrooms', price: 90, fp: [1, 1], act: 'glow', desc: 'Magic mushrooms that glow when you tap them.' },
    { id: 'flag_pole', kind: 'decor', cat: 'flags', name: 'Island flag', price: 100, fp: [1, 1], act: 'wave', desc: 'Your island’s own flag. Tap it to make it flutter.' },
    { id: 'bunting', kind: 'decor', cat: 'flags', name: 'Party bunting', price: 80, fp: [1, 1], act: 'wave', desc: 'Colourful bunting on two little posts.' },
    { id: 'bench', kind: 'decor', cat: 'garden', name: 'Garden bench', price: 110, fp: [1, 1], desc: 'A comfy wooden bench.' },
    { id: 'sandcastle', kind: 'decor', cat: 'garden', name: 'Sandcastle', price: 120, fp: [1, 1], desc: 'A sandcastle with a tiny flag on top.' },
    { id: 'umbrella', kind: 'decor', cat: 'garden', name: 'Beach umbrella', price: 130, fp: [1, 1], desc: 'Stripy shade for sunny days.' },
    { id: 'snowman', kind: 'decor', cat: 'garden', name: 'Snowman', price: 150, fp: [1, 1], desc: 'A snowman that never melts.' },
    { id: 'windmill', kind: 'decor', cat: 'garden', name: 'Windmill', price: 380, fp: [1, 1], act: 'spin', desc: 'Its sails turn in the breeze. Tap for a big spin!' },
    { id: 'lighthouse', kind: 'decor', cat: 'garden', name: 'Lighthouse', price: 650, fp: [1, 1], act: 'glow', desc: 'A red-and-white lighthouse with a beaming light.' },

    /* ---- paths: per copy, ground layer ---- */
    { id: 'path_stone', kind: 'path', cat: 'paths', name: 'Stone path', price: 20, fp: [1, 1], desc: 'One square of stone path.' },
    { id: 'path_wood', kind: 'path', cat: 'paths', name: 'Wooden boardwalk', price: 25, fp: [1, 1], desc: 'One square of wooden boardwalk.' },
    { id: 'path_flower', kind: 'path', cat: 'paths', name: 'Flower stepping stones', price: 30, fp: [1, 1], desc: 'Stepping stones with little flowers between.' },

    /* ---- fun: unique, interactive ---- */
    { id: 'trampoline', kind: 'fun', cat: 'fun', name: 'Trampoline', price: 450, fp: [1, 1], act: 'bounce', desc: 'Tap it and your pet bounces! Boing!' },
    { id: 'fountain', kind: 'fun', cat: 'fun', name: 'Fountain', price: 500, fp: [1, 1], act: 'splash', desc: 'Tap for a big splashy water show.' },
    { id: 'swing', kind: 'fun', cat: 'fun', name: 'Tree swing', price: 380, fp: [1, 1], act: 'swing', desc: 'Tap to give it a swing.' },
    { id: 'bubbles', kind: 'fun', cat: 'fun', name: 'Bubble machine', price: 300, fp: [1, 1], act: 'bubbles', desc: 'Tap it to fill the air with bubbles.' },

    /* ---- home styles: unique, choose any time once owned ---- */
    { id: 'wall_pink', kind: 'style', slot: 'wall', cat: 'home', name: 'Pink walls', price: 120, desc: 'Strawberry-milkshake pink.' },
    { id: 'wall_mint', kind: 'style', slot: 'wall', cat: 'home', name: 'Mint walls', price: 120, desc: 'Cool minty green.' },
    { id: 'wall_sky', kind: 'style', slot: 'wall', cat: 'home', name: 'Sky-blue walls', price: 120, desc: 'As blue as a summer sky.' },
    { id: 'wall_lilac', kind: 'style', slot: 'wall', cat: 'home', name: 'Lilac walls', price: 150, desc: 'A soft purple.' },
    { id: 'roof_blue', kind: 'style', slot: 'roof', cat: 'home', name: 'Blue slate roof', price: 300, desc: 'Smart blue slates.' },
    { id: 'roof_thatch', kind: 'style', slot: 'roof', cat: 'home', name: 'Thatched roof', price: 350, desc: 'A fluffy straw roof, like a storybook cottage.' },
    { id: 'roof_candy', kind: 'style', slot: 'roof', cat: 'home', name: 'Candy roof', price: 450, desc: 'Pink icing with sprinkles on top.' },
    { id: 'roof_castle', kind: 'style', slot: 'roof', cat: 'home', name: 'Castle turrets', price: 600, desc: 'Turn your home into a little castle.' },
    { id: 'door_red', kind: 'style', slot: 'door', cat: 'home', name: 'Red door', price: 80, desc: 'A bold red front door.' },
    { id: 'door_green', kind: 'style', slot: 'door', cat: 'home', name: 'Green door', price: 80, desc: 'A leafy green front door.' },
    { id: 'door_gold', kind: 'style', slot: 'door', cat: 'home', name: 'Golden door', price: 150, desc: 'A shiny golden door.' },
    { id: 'detail_windowbox', kind: 'style', slot: 'detail', multi: true, cat: 'home', name: 'Window boxes', price: 150, desc: 'Flower boxes under the windows.' },
    { id: 'detail_chimney', kind: 'style', slot: 'detail', multi: true, cat: 'home', name: 'Smoking chimney', price: 120, desc: 'A chimney with little puffs of smoke.' },
    { id: 'detail_lights', kind: 'style', slot: 'detail', multi: true, cat: 'home', name: 'Fairy lights', price: 200, desc: 'Twinkly lights along the roof.' },
    { id: 'detail_flag', kind: 'style', slot: 'detail', multi: true, cat: 'home', name: 'Rooftop flag', price: 100, desc: 'A flag flying from the roof.' },

    /* ---- pets & accessories ---- */
    { id: 'pet_kitten', kind: 'pet', cat: 'pets', name: 'Kitten', price: 600, desc: 'A playful kitten who loves to pounce.' },
    { id: 'pet_bunny', kind: 'pet', cat: 'pets', name: 'Bunny', price: 550, desc: 'A hoppy bunny with floppy ears.' },
    { id: 'pet_dragon', kind: 'pet', cat: 'pets', name: 'Baby dragon', price: 1400, desc: 'A tiny friendly dragon with little wings.' },
    { id: 'acc_partyhat', kind: 'acc', slot: 'hat', cat: 'pets', name: 'Party hat', price: 100, desc: 'A stripy party hat for any pet.' },
    { id: 'acc_crown', kind: 'acc', slot: 'hat', cat: 'pets', name: 'Golden crown', price: 250, desc: 'Fit for a royal pet.' },
    { id: 'acc_bow', kind: 'acc', slot: 'neck', cat: 'pets', name: 'Big bow', price: 100, desc: 'A big spotty bow.' },
    { id: 'acc_scarf', kind: 'acc', slot: 'neck', cat: 'pets', name: 'Cosy scarf', price: 120, desc: 'A stripy knitted scarf.' },
    { id: 'acc_shades', kind: 'acc', slot: 'face', cat: 'pets', name: 'Cool shades', price: 140, desc: 'Sunglasses for the coolest pet around.' },
    { id: 'acc_cape', kind: 'acc', slot: 'back', cat: 'pets', name: 'Super cape', price: 300, desc: 'A red hero cape that flaps when your pet runs.' },

    /* ---- land ---- */
    { id: 'land_cove', kind: 'land', region: 'cove', cat: 'land', name: 'Beach Cove', price: 1000, desc: 'A sandy bay on the east side of your island — 18 new squares to build on.' },
    { id: 'land_meadow', kind: 'land', region: 'meadow', cat: 'land', name: 'Meadow Hill', price: 900, desc: 'A green hill on the west side — 17 new squares to build on.' },

    /* ---- attractions (each includes everything needed to play) ---- */
    { id: 'att_pitch', kind: 'attraction', game: 'penalty', cat: 'games', name: 'Penalty Pitch', price: 1200, fp: [3, 2], entrance: true, act: 'launch', includes: ['ball_classic', 'stadium_day'],
      desc: 'A football pitch for your island. Unlocks the Encore Shootout game — forever.' },
    { id: 'att_kart', kind: 'attraction', game: 'kart', cat: 'games', name: 'Kart Garage', price: 1500, fp: [2, 2], entrance: true, act: 'launch', includes: ['track_loop', 'kart_red'],
      desc: 'A garage and race track entrance. Unlocks the Kart Time Trial game — forever.' },

    /* ---- course variants (pet obstacle course) ---- */
    { id: 'course_beach', kind: 'variant', game: 'course', slot: 'course', cat: 'games', name: 'Beach Run', price: 350, requires: ['att_course'], desc: 'A new course: sandy dunes, crabs and sandcastles.' },
    { id: 'course_snow', kind: 'variant', game: 'course', slot: 'course', cat: 'games', name: 'Snowy Trail', price: 400, requires: ['att_course'], desc: 'A new course: snowdrifts, sledges and snowmen.' },
    { id: 'course_candy', kind: 'variant', game: 'course', slot: 'course', cat: 'games', name: 'Candy Land', price: 500, requires: ['att_course'], desc: 'A new course: lollipops, cupcakes and sweet hurdles.' },

    /* ---- penalty cosmetics ---- */
    { id: 'ball_classic', kind: 'cosmetic', game: 'penalty', slot: 'ball', name: 'Classic ball', price: 0, included: true, desc: 'A black-and-white classic.' },
    { id: 'ball_rainbow', kind: 'cosmetic', game: 'penalty', slot: 'ball', cat: 'games', name: 'Rainbow ball', price: 200, requires: ['att_pitch'], desc: 'A ball in every colour of the rainbow.' },
    { id: 'ball_planet', kind: 'cosmetic', game: 'penalty', slot: 'ball', cat: 'games', name: 'Planet ball', price: 250, requires: ['att_pitch'], desc: 'A ball with its own little ring.' },
    { id: 'ball_gold', kind: 'cosmetic', game: 'penalty', slot: 'ball', cat: 'games', name: 'Golden ball', price: 300, requires: ['att_pitch'], desc: 'The shiniest ball in football.' },
    { id: 'stadium_day', kind: 'cosmetic', game: 'penalty', slot: 'stadium', name: 'Sunny stadium', price: 0, included: true, desc: 'Blue skies and a happy crowd.' },
    { id: 'stadium_night', kind: 'cosmetic', game: 'penalty', slot: 'stadium', cat: 'games', name: 'Floodlit night', price: 450, requires: ['att_pitch'], desc: 'Play under the stars and floodlights.' },
    { id: 'stadium_beach', kind: 'cosmetic', game: 'penalty', slot: 'stadium', cat: 'games', name: 'Beach stadium', price: 400, requires: ['att_pitch'], desc: 'Football by the sea.' },
    { id: 'stadium_snow', kind: 'cosmetic', game: 'penalty', slot: 'stadium', cat: 'games', name: 'Snowy stadium', price: 400, requires: ['att_pitch'], desc: 'A winter wonderland pitch.' },

    /* ---- kart cosmetics & tracks ---- */
    { id: 'kart_red', kind: 'cosmetic', game: 'kart', slot: 'kart', name: 'Red racer', price: 0, included: true, desc: 'A speedy red kart.' },
    { id: 'kart_blue', kind: 'cosmetic', game: 'kart', slot: 'kart', cat: 'games', name: 'Blue rocket', price: 300, requires: ['att_kart'], desc: 'A blue kart with rocket stripes.' },
    { id: 'kart_lime', kind: 'cosmetic', game: 'kart', slot: 'kart', cat: 'games', name: 'Lime lightning', price: 300, requires: ['att_kart'], desc: 'A zingy green kart with lightning bolts.' },
    { id: 'kart_unicorn', kind: 'cosmetic', game: 'kart', slot: 'kart', cat: 'games', name: 'Unicorn kart', price: 450, requires: ['att_kart'], desc: 'Pink, sparkly and very fast-looking.' },
    { id: 'kart_gold', kind: 'cosmetic', game: 'kart', slot: 'kart', cat: 'games', name: 'Golden kart', price: 500, requires: ['att_kart'], desc: 'For true champions.' },
    { id: 'track_loop', kind: 'variant', game: 'kart', slot: 'track', name: 'Island Loop', price: 0, included: true, desc: 'A friendly loop round the island.' },
    { id: 'track_volcano', kind: 'variant', game: 'kart', slot: 'track', cat: 'games', name: 'Volcano Ring', price: 800, requires: ['att_kart'], desc: 'A twisty new track around a smoking volcano.' },
    { id: 'track_beach', kind: 'variant', game: 'kart', slot: 'track', cat: 'games', name: 'Beach Hairpins', price: 700, requires: ['att_kart'], desc: 'A new track with tight hairpin bends by the sea.' }
  ];
  var BY_ID = {};
  CATALOG.forEach(function (it) { BY_ID[it.id] = it; });

  var REPEATABLE = { decor: 1, path: 1 };
  var PLACEABLE = { decor: 1, path: 1, fun: 1, house: 1, attraction: 1 };
  var STORABLE = { decor: 1, path: 1, fun: 1 };          /* house + attractions move, never store */
  var SELECTABLE = { style: 1, variant: 1, cosmetic: 1 };

  var DEFAULTS = { wall: 'wall_cream', roof: 'roof_red', door: 'door_blue',
                   course: 'course_meadow', ball: 'ball_classic', stadium: 'stadium_day',
                   kart: 'kart_red', track: 'track_loop' };

  /* starter layout — validated by tests to be legal */
  var STARTER = {
    owned: { house_cottage: 1, att_course: 1, pet_puppy: 1, wall_cream: 1, roof_red: 1, door_blue: 1,
             course_meadow: 1, tree_oak: 2, tree_pine: 1, flower_tulip: 2, flower_daisy: 1, path_stone: 4, bush_rose: 1 },
    placed: [
      { id: 'house_cottage', x: 6, y: 2 },
      { id: 'att_course', x: 9, y: 5 },
      { id: 'path_stone', x: 7, y: 4 }, { id: 'path_stone', x: 7, y: 5 },
      { id: 'path_stone', x: 7, y: 6 }, { id: 'path_stone', x: 8, y: 7 },
      { id: 'tree_oak', x: 3, y: 3 }, { id: 'tree_oak', x: 11, y: 3 }, { id: 'tree_pine', x: 4, y: 2 },
      { id: 'flower_tulip', x: 5, y: 4 }, { id: 'flower_tulip', x: 9, y: 2 },
      { id: 'flower_daisy', x: 4, y: 7 }, { id: 'bush_rose', x: 12, y: 5 }
    ]
  };

  /* ---------------- helpers ---------------- */
  function isInt(n) { return typeof n === 'number' && isFinite(n) && Math.floor(n) === n; }
  function item(id) { return Object.prototype.hasOwnProperty.call(BY_ID, id) ? BY_ID[id] : null; }
  function isRepeatable(it) { return !!(it && REPEATABLE[it.kind]); }
  function isPlaceable(it) { return !!(it && PLACEABLE[it.kind]); }
  function isStorable(it) { return !!(it && STORABLE[it.kind]); }
  function nowIso(ms) { return new Date(ms == null ? Date.now() : ms).toISOString(); }

  function emptyWorld() {
    return {
      v: VERSION, rev: 0, nextUid: 1,
      starterGrantedAt: null, introSeen: false,
      owned: {}, placed: [], ledger: [], spent: 0,
      sel: {}, details: {},             /* sel: slot -> itemId ; details: itemId -> true */
      pets: [], activePet: null,
      goal: null, goalNotified: null,
      pb: {}, tutSeen: {},
      arcade: { days: {} },
      updatedAt: null
    };
  }

  function ensureWorld(u) {
    if (!u.world || typeof u.world !== 'object') u.world = emptyWorld();
    var w = u.world, d = emptyWorld();
    Object.keys(d).forEach(function (k) { if (w[k] === undefined || w[k] === null && d[k] !== null) w[k] = d[k]; });
    if (!w.owned || typeof w.owned !== 'object') w.owned = {};
    if (!Array.isArray(w.placed)) w.placed = [];
    if (!Array.isArray(w.ledger)) w.ledger = [];
    if (!w.sel || typeof w.sel !== 'object') w.sel = {};
    if (!w.details || typeof w.details !== 'object') w.details = {};
    if (!Array.isArray(w.pets)) w.pets = [];
    if (!w.pb || typeof w.pb !== 'object') w.pb = {};
    if (!w.tutSeen || typeof w.tutSeen !== 'object') w.tutSeen = {};
    if (!w.arcade || typeof w.arcade !== 'object') w.arcade = { days: {} };
    if (!w.arcade.days || typeof w.arcade.days !== 'object') w.arcade.days = {};
    if (!isInt(w.nextUid) || w.nextUid < 1) w.nextUid = 1;
    if (!isInt(w.spent) || w.spent < 0) w.spent = 0;
    return w;
  }
  function touch(w, ms) { w.rev = (w.rev || 0) + 1; w.updatedAt = nowIso(ms); }
  function ownedCount(w, id) { var n = w.owned[id]; return isInt(n) && n > 0 ? n : 0; }
  function owns(w, id) { return ownedCount(w, id) > 0; }
  function newUid(w) { var id = 'p' + w.nextUid; w.nextUid += 1; return id; }

  /* ---------------- pets ---------------- */
  /* whole-word matches, plus a few words that are never innocent inside a longer name */
  var BAD_WORDS = ['poo', 'poop', 'wee', 'bum', 'butt', 'fart', 'damn', 'hell', 'crap', 'shit', 'fuck', 'piss', 'arse', 'ass', 'dick', 'cock', 'tit', 'tits', 'bitch', 'bastard', 'willy', 'sex', 'kill', 'stupid', 'idiot', 'dumb', 'hate', 'loser'];
  var BAD_INSIDE = ['fuck', 'shit', 'bitch', 'bastard', 'fart', 'poop'];
  function validatePetName(raw) {
    /* tablets type a curly ’ by default — treat it as a plain apostrophe */
    var s = String(raw == null ? '' : raw).replace(/[‘’ʼ]/g, "'").replace(/\s+/g, ' ').trim();
    if (!s) return { ok: false, reason: 'Give your pet a name first.' };
    if (s.length > 14) return { ok: false, reason: 'Names can be up to 14 letters long.' };
    if (!/^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ' -]*$/.test(s)) return { ok: false, reason: 'Use letters only (spaces, - and ’ are fine too).' };
    var words = s.toLowerCase().split(/[^a-zà-öø-ÿ]+/).filter(Boolean);
    var joined = s.toLowerCase().replace(/[^a-z]/g, '');
    var rude = words.some(function (wd) { return BAD_WORDS.indexOf(wd) >= 0; }) ||
               BAD_INSIDE.some(function (b) { return joined.indexOf(b) >= 0; });
    if (rude) return { ok: false, reason: 'Let’s pick a kinder name.' };
    return { ok: true, name: s };
  }
  var DEFAULT_PET_NAMES = { pet_puppy: 'Biscuit', pet_kitten: 'Mittens', pet_bunny: 'Clover', pet_dragon: 'Ember' };
  function ensurePetRecord(w, id) {
    for (var i = 0; i < w.pets.length; i++) if (w.pets[i].id === id) return w.pets[i];
    var rec = { id: id, name: DEFAULT_PET_NAMES[id] || 'Buddy', acc: {} };
    w.pets.push(rec);
    return rec;
  }
  function petById(w, id) { for (var i = 0; i < w.pets.length; i++) if (w.pets[i].id === id) return w.pets[i]; return null; }
  function renamePet(u, petId, raw, ms) {
    var w = ensureWorld(u);
    var p = petById(w, petId);
    if (!p || !owns(w, petId)) return { ok: false, reason: 'You don’t have that pet.' };
    var v = validatePetName(raw);
    if (!v.ok) return v;
    p.name = v.name; touch(w, ms);
    return { ok: true, name: v.name };
  }
  function setActivePet(u, petId, ms) {
    var w = ensureWorld(u);
    if (!owns(w, petId) || !petById(w, petId)) return { ok: false };
    w.activePet = petId; touch(w, ms); return { ok: true };
  }
  function equipAccessory(u, petId, accId, ms) {
    var w = ensureWorld(u), p = petById(w, petId), a = item(accId);
    if (!p || !a || a.kind !== 'acc' || !owns(w, accId)) return { ok: false };
    if (p.acc[a.slot] === accId) delete p.acc[a.slot]; else p.acc[a.slot] = accId;   /* tap again to take off */
    touch(w, ms); return { ok: true, on: p.acc[a.slot] === accId };
  }

  /* ---------------- selection (styles / cosmetics / variants) ---------------- */
  function selected(w, slot) {
    var id = w.sel[slot];
    return (id && owns(w, id)) ? id : (DEFAULTS[slot] && owns(w, DEFAULTS[slot]) ? DEFAULTS[slot] : (DEFAULTS[slot] || null));
  }
  function select(u, id, ms) {
    var w = ensureWorld(u), it = item(id);
    if (!it || !SELECTABLE[it.kind] || !owns(w, id)) return { ok: false };
    if (it.multi) { if (w.details[id]) delete w.details[id]; else w.details[id] = true; }
    else w.sel[it.slot] = id;
    touch(w, ms); return { ok: true };
  }

  /* ---------------- placement ---------------- */
  function unlockedRegions(w) {
    var out = ['home'];
    Object.keys(REGIONS).forEach(function (k) { if (REGIONS[k].unlock && owns(w, REGIONS[k].unlock)) out.push(k); });
    return out;
  }
  function landSet(w) {
    var s = {};
    unlockedRegions(w).forEach(function (k) { REGION_CELLS[k].forEach(function (c) { s[c] = 1; }); });
    return s;
  }
  function fpCells(it, x, y) {
    var out = [], fw = (it.fp || [1, 1])[0], fh = (it.fp || [1, 1])[1];
    for (var dy = 0; dy < fh; dy++) for (var dx = 0; dx < fw; dx++) out.push((x + dx) + ',' + (y + dy));
    return out;
  }
  function entranceCells(it, x, y) {
    if (!it.entrance) return [];
    var out = [], fw = (it.fp || [1, 1])[0], fh = (it.fp || [1, 1])[1];
    for (var dx = 0; dx < fw; dx++) out.push((x + dx) + ',' + (y + fh));
    return out;
  }
  /* cell -> {uid, id, layer} plus reserved entrance cells */
  function occupancy(w, ignoreUid) {
    var occ = {}, reserved = {};
    w.placed.forEach(function (p) {
      if (p.uid === ignoreUid) return;
      var it = item(p.id); if (!it) return;
      var layer = it.kind === 'path' ? 'ground' : 'object';
      fpCells(it, p.x, p.y).forEach(function (c) { occ[c] = { uid: p.uid, id: p.id, layer: layer }; });
      entranceCells(it, p.x, p.y).forEach(function (c) { reserved[c] = p.uid; });
    });
    return { occ: occ, reserved: reserved };
  }
  /* Rules: inside unlocked land; one thing per cell; only paths may sit
     in an entrance; a house/attraction's own entrance must be on land
     and free of objects (paths are fine). */
  function canPlace(w, id, x, y, ignoreUid) {
    var it = item(id);
    if (!it || !isPlaceable(it)) return { ok: false, reason: 'That can’t be placed.' };
    if (!isInt(x) || !isInt(y)) return { ok: false, reason: 'Pick a square.' };
    var land = landSet(w), o = occupancy(w, ignoreUid);
    var cells = fpCells(it, x, y);
    for (var i = 0; i < cells.length; i++) {
      var c = cells[i];
      if (!land[c]) return { ok: false, reason: 'That’s off your land.', cells: cells };
      if (o.occ[c]) return { ok: false, reason: 'Something is already there.', cells: cells };
      if (o.reserved[c] && it.kind !== 'path') return { ok: false, reason: 'Keep the doorway clear.', cells: cells };
    }
    var ent = entranceCells(it, x, y);
    for (var j = 0; j < ent.length; j++) {
      var e = ent[j];
      if (!land[e]) return { ok: false, reason: 'The entrance must be on your land.', cells: cells };
      if (o.occ[e] && o.occ[e].layer !== 'ground') return { ok: false, reason: 'Something is blocking the entrance.', cells: cells };
    }
    return { ok: true, cells: cells, entrance: ent };
  }
  function placedCount(w, id) { var n = 0; w.placed.forEach(function (p) { if (p.id === id) n++; }); return n; }
  function storedCount(w, id) {
    var it = item(id); if (!isPlaceable(it)) return 0;
    return Math.max(0, ownedCount(w, id) - placedCount(w, id));
  }
  function inventory(w) {
    var out = [];
    Object.keys(w.owned).forEach(function (id) {
      var n = storedCount(w, id);
      if (n > 0) out.push({ id: id, count: n });
    });
    return out;
  }
  function findSpot(w, id, prefX, prefY) {
    var px = isInt(prefX) ? prefX : 7, py = isInt(prefY) ? prefY : 5, best = null, bestD = 1e9;
    for (var y = 0; y < ROWS; y++) for (var x = 0; x < COLS; x++) {
      if (!canPlace(w, id, x, y).ok) continue;
      var d = (x - px) * (x - px) + (y - py) * (y - py);
      if (d < bestD) { bestD = d; best = { x: x, y: y }; }
    }
    return best;
  }
  /* place a stored copy (uid omitted) or move an existing instance (uid given) */
  function place(u, id, x, y, uid, ms) {
    var w = ensureWorld(u), it = item(id);
    if (!it) return { ok: false, reason: 'Unknown item.' };
    if (uid) {
      var inst = null;
      for (var i = 0; i < w.placed.length; i++) if (w.placed[i].uid === uid) inst = w.placed[i];
      if (!inst || inst.id !== id) return { ok: false, reason: 'That object isn’t on your island.' };
      var chk = canPlace(w, id, x, y, uid);
      if (!chk.ok) return chk;
      inst.x = x; inst.y = y; touch(w, ms);
      return { ok: true, uid: uid };
    }
    if (storedCount(w, id) < 1) return { ok: false, reason: 'You don’t have one of those to place.' };
    var c2 = canPlace(w, id, x, y);
    if (!c2.ok) return c2;
    var nu = newUid(w);
    w.placed.push({ uid: nu, id: id, x: x, y: y });
    touch(w, ms);
    return { ok: true, uid: nu };
  }
  function store(u, uid, ms) {
    var w = ensureWorld(u);
    for (var i = 0; i < w.placed.length; i++) {
      if (w.placed[i].uid !== uid) continue;
      var it = item(w.placed[i].id);
      if (!isStorable(it)) return { ok: false, reason: 'This one stays on your island — you can move it instead.' };
      w.placed.splice(i, 1); touch(w, ms);
      return { ok: true };
    }
    return { ok: false, reason: 'Not found.' };
  }

  /* ---------------- starter grant (exactly once per profile) ---------------- */
  function grantStarter(u, ms) {
    var w = ensureWorld(u);
    if (w.starterGrantedAt) return false;
    Object.keys(STARTER.owned).forEach(function (id) { w.owned[id] = Math.max(ownedCount(w, id), STARTER.owned[id]); });
    STARTER.placed.forEach(function (p) {
      if (canPlace(w, p.id, p.x, p.y).ok && storedCount(w, p.id) > 0) w.placed.push({ uid: newUid(w), id: p.id, x: p.x, y: p.y });
    });
    ensurePetRecord(w, 'pet_puppy');
    if (!w.activePet) w.activePet = 'pet_puppy';
    w.starterGrantedAt = nowIso(ms);
    w.ledger.push({ tx: 'starter', item: 'starter_pack', price: 0, at: w.starterGrantedAt, bal: isInt(u.points) ? u.points : 0 });
    touch(w, ms);
    return true;
  }

  /* ---------------- purchases ----------------
     purchase(u, itemId, {tx}) — the ONLY way points are spent here.
     Price always comes from CATALOG; callers cannot pass one.
     Same tx twice → returns the first result (idempotent). */
  /* opts.trial = the family's free test mode: the item costs 0 and the child's
     ⭐ are never touched; every other rule (catalogue, locks, one-offs) still applies */
  function purchaseCheck(u, id, opts) {
    var trial = !!(opts && opts.trial);
    var w = ensureWorld(u), it = item(id);
    if (!it) return { ok: false, code: 'unknown_item', reason: 'That isn’t in the shop.' };
    if (it.retired) return { ok: false, code: 'retired', reason: 'That’s no longer in the shop.' };
    if (it.starter || it.included) return { ok: false, code: 'not_for_sale', reason: 'That comes free with something else.' };
    if (!isInt(it.price) || it.price < 0) return { ok: false, code: 'bad_price', reason: 'Price problem.' };
    if (!isRepeatable(it) && owns(w, id)) return { ok: false, code: 'already_owned', reason: 'You already own this.' };
    var req = it.requires || [];
    for (var i = 0; i < req.length; i++) {
      if (!owns(w, req[i])) return { ok: false, code: 'locked', needs: req[i], reason: 'First you need: ' + (item(req[i]) ? item(req[i]).name : req[i]) + '.' };
    }
    if (trial) {
      if (isRepeatable(it) && ownedCount(w, id) >= ECONOMY.trialMaxCopies) return { ok: false, code: 'trial_cap', reason: 'You’ve got plenty of those for testing!' };
      return { ok: true, item: it, price: 0, trial: true };
    }
    var bal = isInt(u.points) ? u.points : 0;
    if (bal < it.price) return { ok: false, code: 'insufficient', need: it.price - bal, reason: 'You need ' + (it.price - bal) + ' more ⭐.' };
    return { ok: true, item: it, price: it.price };
  }
  function findTx(w, tx) {
    for (var i = w.ledger.length - 1; i >= 0; i--) if (w.ledger[i].tx === tx) return w.ledger[i];
    return null;
  }
  function purchase(u, id, opts) {
    opts = opts || {};
    var tx = opts.tx;
    if (typeof tx !== 'string' || !/^[A-Za-z0-9_-]{6,64}$/.test(tx)) return { ok: false, code: 'bad_tx', reason: 'Please try again.' };
    var w = ensureWorld(u);
    if (!isInt(u.points)) u.points = isInt(Math.round(u.points)) ? Math.round(u.points) : 0;
    var prior = findTx(w, tx);
    if (prior) {
      if (prior.item !== id) return { ok: false, code: 'tx_conflict', reason: 'Please try again.' };
      return { ok: true, replay: true, item: item(id), price: prior.price, balance: u.points, entry: prior };
    }
    var chk = purchaseCheck(u, id, opts);
    if (!chk.ok) return chk;
    var it = chk.item, ms = opts.now, charge = chk.trial ? 0 : it.price;
    /* commit — one synchronous mutation of the same profile object */
    u.points -= charge;
    w.owned[id] = ownedCount(w, id) + 1;
    w.spent += charge;
    (it.includes || []).forEach(function (inc) { if (!owns(w, inc)) w.owned[inc] = 1; });
    var entry = { tx: tx, item: id, price: charge, at: nowIso(ms), bal: u.points };
    if (chk.trial) { entry.trial = true; entry.list = it.price; }   /* tagged: decide at the end of testing */
    w.ledger.push(entry);
    var placedUid = null;
    if (it.kind === 'pet') ensurePetRecord(w, id);
    if (it.kind === 'style' || it.kind === 'cosmetic' || it.kind === 'variant') {
      if (it.multi) w.details[id] = true; else w.sel[it.slot] = id;
    }
    if (it.kind === 'attraction' || it.kind === 'house') {
      var spot = findSpot(w, id, opts.prefX, opts.prefY);
      if (spot) { placedUid = newUid(w); w.placed.push({ uid: placedUid, id: id, x: spot.x, y: spot.y }); }
    }
    if (w.goal === id && !isRepeatable(it)) { w.goal = null; w.goalNotified = null; }
    touch(w, ms);
    return { ok: true, item: it, price: charge, trial: !!chk.trial, balance: u.points, entry: entry, placedUid: placedUid };
  }

  /* ---------------- commit protocol (used by the UI for every change) ----------------
     store = { read(): stateObj (fresh parse of persisted storage), write(stateObj) }
     1. read the PERSISTED state (never trust a possibly-stale in-memory copy),
     2. check the profile is still the active one,
     3. apply the change to that fresh copy,
     4. write once,
     5. read back and confirm the change is really stored before reporting success.
     The browser wraps this in navigator.locks so two tabs can't interleave. */
  function transact(store, userName, mutate, verify) {
    var st;
    try { st = store.read(); } catch (e) { return { ok: false, code: 'read_failed', reason: 'Couldn’t load your island — please try again.' }; }
    if (!st || !st.users || !st.users[userName]) return { ok: false, code: 'no_profile', reason: 'That player isn’t here.' };
    if (st.activeUser !== userName) return { ok: false, code: 'profile_changed', reason: 'A different player is signed in now.' };
    var u = st.users[userName];
    ensureWorld(u);
    var res = mutate(u);
    if (!res || !res.ok || res.replay) return res;
    /* a store that mirrors writes into live memory must offer rollback(): a save
       that fails or doesn't read back leaves memory exactly as it was */
    function undo() { try { if (store.rollback) store.rollback(); } catch (e) {} }
    try { store.write(st); } catch (e) { undo(); return { ok: false, code: 'write_failed', reason: 'Couldn’t save — nothing was spent. Please try again.' }; }
    var back;
    try { back = store.read(); } catch (e) { back = null; }
    var bu = back && back.users && back.users[userName];
    if (!bu || !verify(bu)) { undo(); return { ok: false, code: 'not_saved', reason: 'Couldn’t save — nothing was spent. Please try again.' }; }
    res.state = st;
    return res;
  }
  function transactPurchase(store, userName, id, opts) {
    return transact(store, userName, function (u) { return purchase(u, id, opts); },
      function (bu) { return !!(bu.world && findTx(ensureWorld(bu), opts.tx)); });
  }

  /* ---------------- savings goal ---------------- */
  function setGoal(u, id, ms) {
    var w = ensureWorld(u), it = item(id);
    if (id === null) { w.goal = null; w.goalNotified = null; touch(w, ms); return { ok: true }; }
    if (!it || it.retired || it.starter || it.included) return { ok: false };
    if (!isRepeatable(it) && owns(w, id)) return { ok: false, reason: 'You already own this.' };
    /* a goal must be buyable once saved for — a locked item can't be the goal */
    var missing = (it.requires || []).filter(function (r) { return !owns(w, r); });
    if (missing.length) return { ok: false, code: 'locked', needs: missing[0], reason: 'You need the ' + (item(missing[0]) || {}).name + ' first.' };
    w.goal = id; w.goalNotified = null; touch(w, ms);
    return { ok: true };
  }
  function goalProgress(u) {
    var w = ensureWorld(u), it = w.goal ? item(w.goal) : null;
    if (!it) return null;
    var bal = isInt(u.points) ? u.points : 0;
    var locked = (it.requires || []).some(function (r) { return !owns(w, r); });   /* old saves only */
    return { id: it.id, name: it.name, price: it.price, have: bal, pct: it.price ? Math.min(100, Math.floor(bal * 100 / it.price)) : 100, ready: !locked && bal >= it.price, locked: locked, need: Math.max(0, it.price - bal) };
  }

  /* ---------------- normalise: no impossible states survive a load ---------------- */
  function normalize(u) {
    var w = ensureWorld(u);
    var changed = false;
    Object.keys(w.owned).forEach(function (id) {
      var n = w.owned[id];
      if (!isInt(n) || n < 0) { w.owned[id] = Math.max(0, Math.floor(+n || 0)); changed = true; }
      var it = item(id);
      if (it && !isRepeatable(it) && w.owned[id] > 1) { w.owned[id] = 1; changed = true; }
    });
    /* included items always come with their parent */
    CATALOG.forEach(function (it) {
      if (owns(w, it.id)) (it.includes || []).forEach(function (inc) { if (!owns(w, inc)) { w.owned[inc] = 1; changed = true; } });
    });
    /* placements: unknown ids are kept untouched (future data); too many copies trimmed;
       illegal positions: house/attractions re-homed, decorations go back to storage */
    var seenCount = {}, keep = [];
    var order = w.placed.slice().sort(function (a, b) {
      var ka = item(a.id), kb = item(b.id);
      var ra = ka && (ka.kind === 'house' || ka.kind === 'attraction') ? 0 : 1;
      var rb = kb && (kb.kind === 'house' || kb.kind === 'attraction') ? 0 : 1;
      return ra - rb;
    });
    var probe = { owned: w.owned, placed: [] };
    order.forEach(function (p) {
      var it = item(p.id);
      if (!it) { keep.push(p); return; }
      if (!p.uid) { p.uid = newUid(w); changed = true; }
      seenCount[p.id] = (seenCount[p.id] || 0) + 1;
      if (seenCount[p.id] > ownedCount(w, p.id)) { changed = true; return; }
      if (!canPlace(probe, p.id, p.x, p.y).ok) {
        changed = true;
        if (it.kind === 'house' || it.kind === 'attraction') {
          var s = findSpot(probe, p.id, p.x, p.y);
          if (s) { p.x = s.x; p.y = s.y; } else { return; }
        } else return;
      }
      probe.placed.push(p); keep.push(p);
    });
    if (changed) w.placed = keep;
    /* owned house/attractions that aren't placed get a spot if one exists */
    CATALOG.forEach(function (it) {
      if ((it.kind === 'house' || it.kind === 'attraction') && owns(w, it.id) && placedCount(w, it.id) === 0) {
        var s2 = findSpot(w, it.id);
        if (s2) { w.placed.push({ uid: newUid(w), id: it.id, x: s2.x, y: s2.y }); changed = true; }
      }
    });
    /* pets */
    CATALOG.forEach(function (it) { if (it.kind === 'pet' && owns(w, it.id) && !petById(w, it.id)) { ensurePetRecord(w, it.id); changed = true; } });
    w.pets.forEach(function (p) {
      if (!p.acc || typeof p.acc !== 'object') { p.acc = {}; changed = true; }
      Object.keys(p.acc).forEach(function (slot) { if (!owns(w, p.acc[slot])) { delete p.acc[slot]; changed = true; } });
    });
    if (w.activePet && !owns(w, w.activePet)) { w.activePet = null; changed = true; }
    if (!w.activePet) { var firstPet = w.pets.filter(function (p) { return owns(w, p.id); })[0]; if (firstPet) { w.activePet = firstPet.id; changed = true; } }
    /* selections must be owned */
    Object.keys(w.sel).forEach(function (slot) { if (!owns(w, w.sel[slot])) { delete w.sel[slot]; changed = true; } });
    Object.keys(w.details).forEach(function (id) { if (!owns(w, id)) { delete w.details[id]; changed = true; } });
    /* goal must still be buyable */
    if (w.goal) { var g = item(w.goal); if (!g || g.retired || (!isRepeatable(g) && owns(w, w.goal))) { w.goal = null; changed = true; } }
    return changed;
  }

  /* ---------------- arcade time (parent limit) ---------------- */
  var ARCADE = { graceMaxSec: 120, warnSec: 60, keepDays: 14 };
  function dayKey(ms, tz) {
    try {
      var f = new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' });
      return f.format(new Date(ms));
    } catch (e) {
      var d = new Date(ms);
      return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2);
    }
  }
  function arcadeUsed(w, day) { var s = w.arcade.days[day]; return isInt(s) && s > 0 ? s : 0; }
  function arcadeAdd(u, day, secs) {
    var w = ensureWorld(u);
    if (!(secs > 0)) return arcadeUsed(w, day);
    w.arcade.days[day] = arcadeUsed(w, day) + Math.round(secs);
    var keys = Object.keys(w.arcade.days).sort();
    keys.slice(0, Math.max(0, keys.length - ARCADE.keepDays)).forEach(function (k) { delete w.arcade.days[k]; });
    return w.arcade.days[day];
  }
  /* raise (never lower) a day's total to a value already counted elsewhere */
  function arcadeMax(u, day, secs) {
    var w = ensureWorld(u);
    var v = Math.round(secs);
    if (!(v > arcadeUsed(w, day))) return false;
    w.arcade.days[day] = v;
    var keys = Object.keys(w.arcade.days).sort();
    keys.slice(0, Math.max(0, keys.length - ARCADE.keepDays)).forEach(function (k) { delete w.arcade.days[k]; });
    return true;
  }
  /* cfg = families/{code}.arcade = {dailyMinutes, tz} (owner-written) */
  function arcadeStatus(cfg, usedSec) {
    var mins = cfg && isInt(cfg.dailyMinutes) && cfg.dailyMinutes > 0 ? cfg.dailyMinutes : null;
    if (!mins) return { limited: false, usedSec: usedSec, leftSec: Infinity, exhausted: false, warn: false, hardStopAtUsed: Infinity };
    var limitSec = mins * 60, left = Math.max(0, limitSec - usedSec);
    return { limited: true, limitSec: limitSec, usedSec: usedSec, leftSec: left, exhausted: left <= 0, warn: left > 0 && left <= ARCADE.warnSec, hardStopAtUsed: limitSec + ARCADE.graceMaxSec };
  }
  /* Called when a round wants to start. A round may only START with time
     left; once started it may finish, but never beyond limit + graceMaxSec
     of total use — restarts don't reset that ceiling. */
  function roundGate(status) {
    if (!status.limited) return { allowed: true, hardStopAtUsed: Infinity };
    if (status.exhausted) return { allowed: false, reason: 'time' };
    return { allowed: true, hardStopAtUsed: status.limitSec + ARCADE.graceMaxSec };
  }

  /* ---------------- personal bests (never touch points) ---------------- */
  var GAME_RULES = {
    course:  { better: 'higher', maxScore: 5000 },
    penalty: { better: 'higher', shots: 8, maxScore: 8 * 150 },
    kart:    { better: 'lower', minMs: 30000, maxMs: 30 * 60000 }   /* no track can be finished in under ~50 s */
  };
  function validResult(game, r) {
    var g = GAME_RULES[game]; if (!g || !r || typeof r !== 'object') return false;
    if (game === 'kart') return r.finished === true && isInt(r.ms) && r.ms >= g.minMs && r.ms <= g.maxMs;
    return isInt(r.score) && r.score >= 0 && r.score <= g.maxScore;
  }
  function recordResult(u, game, variant, r, ms) {
    var w = ensureWorld(u);
    if (!validResult(game, r)) return { ok: false, isPB: false };
    var key = game + ':' + String(variant || 'std').replace(/[^a-z0-9_]/gi, '').slice(0, 30);
    var prev = w.pb[key] || null, g = GAME_RULES[game];
    var val = g.better === 'lower' ? r.ms : r.score;
    var prevVal = prev ? (g.better === 'lower' ? prev.ms : prev.score) : null;
    var isPB = prev == null || (g.better === 'lower' ? val < prevVal : val > prevVal);
    if (isPB) {
      var rec = { at: nowIso(ms) };
      if (g.better === 'lower') rec.ms = r.ms; else rec.score = r.score;
      if (isInt(r.extra)) rec.extra = r.extra;
      w.pb[key] = rec; touch(w, ms);
    }
    return { ok: true, isPB: isPB, prev: prev, key: key };
  }

  /* ---------------- merging two forks of one profile (Control Centre) ----------------
     Ledger is unioned by tx; the spendable balance becomes
     max(each side's balance + its island spend) − union island spend,
     so an island purchase on either side is paid for exactly once. */
  function mergeWorlds(nU, gU) {
    if (!nU.world && !gU.world) return null;
    /* a side without a world simply spent nothing here */
    var nw = ensureWorld({ world: nU.world ? JSON.parse(JSON.stringify(nU.world)) : emptyWorld() });
    var gw = ensureWorld({ world: gU.world ? JSON.parse(JSON.stringify(gU.world)) : emptyWorld() });
    var byTx = {};
    nw.ledger.concat(gw.ledger).forEach(function (e) { if (e && e.tx && !byTx[e.tx]) byTx[e.tx] = e; });
    /* a one-off item bought on BOTH forks is kept once and paid for once (earliest row wins) */
    var rows = Object.keys(byTx).map(function (k) { return byTx[k]; }).sort(function (a, b) { return (a.at || '') < (b.at || '') ? -1 : (a.at || '') > (b.at || '') ? 1 : (a.tx < b.tx ? -1 : 1); });
    /* for each one-off item keep ONE row: the earliest paid row if there is one
       (so a real payment is never relabelled as a free test item), else the earliest row */
    var keepUnique = {};
    rows.forEach(function (e) {
      var it = item(e.item); if (!it || isRepeatable(it)) return;
      var k = keepUnique[e.item];
      if (!k || (k.trial && !e.trial)) keepUnique[e.item] = e;
    });
    var spentUnion = 0;
    rows = rows.filter(function (e) {
      var it = item(e.item);
      if (it && !isRepeatable(it) && keepUnique[e.item] !== e) return false;
      spentUnion += isInt(e.price) ? e.price : 0;
      return true;
    });
    /* a trimmed ledger (synced copies keep the last 1000 rows) can under-count */
    spentUnion = Math.max(spentUnion, nw.spent || 0, gw.spent || 0);
    var baseSrc = !nU.world ? gw : !gU.world ? nw : ((nw.updatedAt || '') >= (gw.updatedAt || '') ? nw : gw);
    var base = JSON.parse(JSON.stringify(baseSrc));
    base.ledger = rows;
    base.owned = {};
    [nw, gw].forEach(function (src) { Object.keys(src.owned || {}).forEach(function (id) { base.owned[id] = Math.max(base.owned[id] || 0, src.owned[id] || 0); }); });
    /* repeatable copies: count purchases in the union ledger + starter copies */
    Object.keys(base.owned).forEach(function (id) {
      var it = item(id); if (!isRepeatable(it)) return;
      var bought = 0; base.ledger.forEach(function (e) { if (e.item === id) bought++; });
      base.owned[id] = Math.max(bought + (STARTER.owned[id] || 0), nw.owned[id] || 0, gw.owned[id] || 0);
    });
    base.spent = spentUnion;
    /* personal bests: the better of both sides, whichever side is the base */
    base.pb = {};
    [nw, gw].forEach(function (src) {
      Object.keys(src.pb || {}).forEach(function (k) {
        var a = base.pb[k], b = src.pb[k], g = GAME_RULES[k.split(':')[0]];
        if (!b) return;
        if (!a) { base.pb[k] = b; return; }
        if (g && (g.better === 'lower' ? b.ms < a.ms : b.score > a.score)) base.pb[k] = b;
      });
    });
    /* arcade minutes: per-day larger value (never summed — same play could be on both) */
    base.arcade = { days: {} };
    [nw, gw].forEach(function (src) {
      var dd = (src.arcade && src.arcade.days) || {};
      Object.keys(dd).forEach(function (d) { if (isInt(dd[d])) base.arcade.days[d] = Math.max(base.arcade.days[d] || 0, dd[d]); });
    });
    if (!base.starterGrantedAt) base.starterGrantedAt = nw.starterGrantedAt || gw.starterGrantedAt;
    /* points: the larger balance BEFORE any island spending, minus everything
       either side spent here — so a spend is never refunded and never doubled */
    var preN = (isInt(nU.points) ? nU.points : 0) + (nw.spent || 0), preG = (isInt(gU.points) ? gU.points : 0) + (gw.spent || 0);
    var points = Math.max(0, Math.max(preN, preG) - spentUnion);
    var tmp = { points: points, world: base };
    normalize(tmp);
    return { world: tmp.world, points: points };
  }

  /* ---------------- shop presentation helpers ---------------- */
  function itemState(u, id, opts) {
    var w = ensureWorld(u), it = item(id);
    if (!it) return { state: 'missing' };
    var trial = !!(opts && opts.trial);
    var bal = isInt(u.points) ? u.points : 0;
    if (!isRepeatable(it) && owns(w, id)) return { state: 'owned' };
    var req = (it.requires || []).filter(function (r) { return !owns(w, r); });
    if (req.length) return { state: 'locked', needs: req };
    if (trial) {
      if (isRepeatable(it) && ownedCount(w, id) >= ECONOMY.trialMaxCopies) return { state: 'capped', copies: ownedCount(w, id) };
      return { state: 'affordable', free: true, copies: isRepeatable(it) ? ownedCount(w, id) : 0 };
    }
    if (bal >= it.price) return { state: 'affordable', copies: isRepeatable(it) ? ownedCount(w, id) : 0 };
    return { state: 'short', need: it.price - bal, copies: isRepeatable(it) ? ownedCount(w, id) : 0 };
  }
  function sessionsFor(price) { return Math.max(0, Math.round(price / ECONOMY.sessionPts * 10) / 10); }
  function shopItems() {
    return CATALOG.filter(function (it) { return !it.starter && !it.included && !it.retired; });
  }

  return {
    VERSION: VERSION, COLS: COLS, ROWS: ROWS, ECONOMY: ECONOMY, REGIONS: REGIONS, REGION_CELLS: REGION_CELLS,
    CELL_REGION: CELL_REGION, CATALOG: CATALOG, DEFAULTS: DEFAULTS, STARTER: STARTER, ARCADE: ARCADE, GAME_RULES: GAME_RULES,
    item: item, isRepeatable: isRepeatable, isPlaceable: isPlaceable, isStorable: isStorable,
    ensureWorld: ensureWorld, emptyWorld: emptyWorld, normalize: normalize, grantStarter: grantStarter,
    owns: owns, ownedCount: ownedCount, storedCount: storedCount, placedCount: placedCount, inventory: inventory,
    unlockedRegions: unlockedRegions, landSet: landSet, fpCells: fpCells, entranceCells: entranceCells,
    occupancy: occupancy, canPlace: canPlace, findSpot: findSpot, place: place, store: store,
    purchaseCheck: purchaseCheck, purchase: purchase, findTx: findTx, transact: transact, transactPurchase: transactPurchase,
    setGoal: setGoal, goalProgress: goalProgress,
    validatePetName: validatePetName, renamePet: renamePet, setActivePet: setActivePet, equipAccessory: equipAccessory, petById: petById,
    selected: selected, select: select,
    dayKey: dayKey, arcadeUsed: arcadeUsed, arcadeAdd: arcadeAdd, arcadeMax: arcadeMax, arcadeStatus: arcadeStatus, roundGate: roundGate,
    validResult: validResult, recordResult: recordResult,
    mergeWorlds: mergeWorlds, itemState: itemState, sessionsFor: sessionsFor, shopItems: shopItems
  };
}));
