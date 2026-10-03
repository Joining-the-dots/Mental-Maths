/* ================================================================
   My Island — display copy (pure; no DOM).
   window.SLWorldCopy in the browser (load after world-core.js), require()
   in Node. The island and game UI read every string from here so the
   voice stays one voice: a cool older cousin who runs the stage crew.
   Short, confident, a little witty, never babyish or sarcastic. UK English,
   sentence case, verbs first, at most one emoji (only when it means
   something). 'Pets' are the 'Crew' in labels only (ids never change).

   CATALOG names and descriptions are never edited: desc(id) returns a
   re-voiced description where the CATALOG one uses a banned word (or reads
   young), and the CATALOG text otherwise.

     t(key, vars, fallback)   UI string; '{name}' placeholders come from vars.
                              Unknown key → fallback, else the key itself.
                              Strings are plain text: callers escape for HTML.
     desc(id)                 shop / sheet description for a CATALOG id ('' if unknown)
     bannedIn(text)           banned words found in text (lower case, word-bounded)
     emojiCount(text)         pictographs in text (⭐ counts; letters and ✦ do not)
     KEYS, BANNED, DESC_IDS   the table keys, the ban list, the ids desc() re-voices
   ================================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    var core = null;
    try { core = require('./world-core.js'); } catch (e) { core = null; }
    module.exports = factory(root, core);
  } else root.SLWorldCopy = factory(root, null);
}(typeof self !== 'undefined' ? self : this, function (root, CORE0) {
  'use strict';

  var BANNED = ['yay', 'yippee', 'hooray', 'boing', 'oopsie', 'uh-oh', 'cosy', 'little', 'tiny', 'cute', 'poorly',
                'magic', 'magical', 'friendly', 'super', 'sparkly', 'lovely'];

  /* UI strings. The art director's rewrites keep their wording; the rest are the
     Encore City additions (makeover toast, city tab, shape tray, unlock lines). */
  var STRINGS = {
    /* celebration card button (was 'Yay! 🎉') */
    'celebrate.ok': 'Nice',
    /* the crew sheet reassurance (was 'Pets never get sad or poorly — …') */
    'crew.neverSad': 'Your crew never gets sad. Take a break — they’ll be ready when you’re back.',
    'crew.named': '{name} it is.',
    'crew.title': 'Your crew',
    'label.crew': 'Crew',
    /* edit mode */
    'edit.hint': 'Edit mode: tap anything to move it or store it.',
    'edit.placed': 'Placed.',
    'edit.moved': 'Moved.',
    'edit.stored': 'Stored. Find it in Edit.',
    /* purchases */
    'buy.style': 'New look, locked in. Tap your home to restyle any time.',
    'buy.acc': 'Equipped. Swap it around in Crew.',
    'buy.cosmetic': 'Equipped for your next run.',
    'goal.reached': 'Goal smashed — you saved for that. Set the next one.',
    'goal.set': 'Set a goal 🎯',
    /* the player picker */
    'player.pick': 'Choose a player to enter the island.',
    /* light toggle (was '☀️ Day' / '🌙✨ Showtime') */
    'light.golden': 'Golden hour',
    'light.showtime': 'Showtime',
    /* shop */
    'shop.dimmed': 'Dimmed ones are in the shop.',
    'shop.tab.city': 'City',
    /* home sheet */
    'home.tray.shape': 'Shape',
    'unlock.city': 'A city building. Place it, then tap it.',
    'unlock.shape': 'A whole new shape for your home. Your walls, roof, door and extras come with you.',
    /* the one-time makeover toast for existing saves (the default home became the City loft) */
    'makeover.toast': 'Your home got a city makeover. Tap it to switch back to the cottage.',
    'makeover.revert': 'Back to the cottage',
    /* games: the results-screen safety line */
    'games.noPoints': 'Game scores don’t earn or spend ⭐'
  };

  /* re-voiced descriptions: every CATALOG desc with a banned word, plus a few that read young */
  var DESC = {
    house_cottage: 'Your home base. Tap it to restyle the walls, roof, door and shape.',
    wall_cream: 'Warm cream walls. A classic.',
    pet_puppy: 'Your first crew member. Loyal, bouncy and always ready to go.',
    pet_dragon: 'A young dragon with swept-back wings. Sparkles, never fire.',
    rock_mossy: 'A mossy boulder with a soft green top.',
    mushroom_glow: 'Glowing mushrooms. Tap them to switch the glow on and off.',
    sandcastle: 'A sandcastle with a flag on top.',
    bunting: 'Colourful bunting strung between two posts.',
    path_flower: 'Stepping stones with flowers between them.',
    trampoline: 'Tap it — your pet does a triple bounce and a flip.',
    roof_castle: 'Turrets and battlements. Your home becomes a castle.',
    detail_chimney: 'A chimney that sends up puffs of smoke.',
    ball_planet: 'A ball with its own ring, like a planet.',
    kart_unicorn: 'Pink, shimmering and very fast-looking.',
    track_loop: 'A smooth loop round the island.'
  };

  function core() { return CORE0 || (root && root.SLWorldCore) || null; }
  function own(o, k) { return o != null && Object.prototype.hasOwnProperty.call(o, k); }

  function t(key, vars, fallback) {
    var s = own(STRINGS, key) ? STRINGS[key] : (typeof fallback === 'string' ? fallback : String(key));
    if (vars && typeof vars === 'object') {
      s = s.replace(/\{(\w+)\}/g, function (m, k) { return own(vars, k) && vars[k] != null ? String(vars[k]) : m; });
    }
    return s;
  }
  function desc(id) {
    if (own(DESC, id)) return DESC[id];
    var C = core(), it = null;
    try { it = C && typeof C.item === 'function' ? C.item(id) : null; } catch (e) { it = null; }
    return it && typeof it.desc === 'string' ? it.desc : '';
  }

  var BANNED_RE = new RegExp('(^|[^a-z])(' + BANNED.map(function (w) { return w.replace(/-/g, '\\-'); }).join('|') + ')(?=$|[^a-z])', 'gi');
  function bannedIn(text) {
    var out = [], m;
    BANNED_RE.lastIndex = 0;
    while ((m = BANNED_RE.exec(String(text == null ? '' : text)))) {
      var w = m[2].toLowerCase();
      if (out.indexOf(w) < 0) out.push(w);
    }
    return out;
  }
  /* pictographic emoji (⭐ 🎯 …); text symbols such as ✦ — and ’ are not emoji. Engines without
     Unicode property escapes count astral pictographs and the common BMP symbol blocks. */
  var EMOJI_RE = (function () {
    try { return new RegExp('\\p{Extended_Pictographic}', 'gu'); }
    catch (e) { return /[\uD83C-\uD83E][\uDC00-\uDFFF]|[☀-➿⬀-⯿]/g; }
  }());
  function emojiCount(text) {
    var s = String(text == null ? '' : text), n = 0;
    s.replace(EMOJI_RE, function (c) { if (c !== '✦') n++; return c; });
    return n;
  }

  var KEYS = Object.keys(STRINGS);
  var DESC_IDS = Object.keys(DESC);
  [STRINGS, DESC, BANNED, KEYS, DESC_IDS].forEach(Object.freeze);

  return { t: t, desc: desc, bannedIn: bannedIn, emojiCount: emojiCount, KEYS: KEYS, BANNED: BANNED, DESC_IDS: DESC_IDS, STRINGS: STRINGS };
}));
