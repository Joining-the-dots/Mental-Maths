/* ================================================================
   My Island 3D — attractions and their cosmetics (island chunk 7).
   Classic script. In the browser it registers with stage.js:
     SL3D.defineModels('attractions', models)   the 23 ids below
     SL3D.defineApi('makeBall', …)              SL3D.makeBall(ballId, tier) → a bare ball for games
   In Node it exports only the pure layout helpers and tables (THREE is
   used solely inside builders that run when a kit K exists).

   IDS (model space = item space: base y = 0, pivot at the footprint
   centre, facing +z; colour tokens follow SLIslandLook.LOOK[id].colors).
   Encore City v2: LOCKED THEME / KARTS / BALLS / STADIA colours are untouched;
   architecture has no ink hull (a part flagged outline gets only the kit's
   edit-selection hull).
     att_course   2×2 LED-strip arch: slim Graphite pillars, a Graphite arch band
                  with THEME[course][1] rims, 'PET COURSE' white from the shared
                  sign atlas (Unbounded 800) over a member-colour underline, LED
                  strips tracing the band, a 14-dot LED marquee, two spinning ✦
                  sparks, 2 mini hurdles, THEME[course][0] plate + per-course dressing
                  parts body | text | bulbA, bulbB (state, pivot 'glow': dots +
                        outer / inner strip) | starL (pivot 'spin'), starR (pivot 'spin2')
                  state keys bulbA, bulbB: 'day' | 'pink' | 'cyan' | 'violet' | 'dim'
                  anchors top, spot, banner
     att_pitch    3×2 pitch in STADIA[stadium][1], line strips, goal + rope net,
                  a 3-tier stand of 40 crowd silhouettes (30 on LOW; makeFanBlob's
                  when it is light enough) holding ✦ Spark Sticks, the selected
                  ball on the spot, the stadium's dressing
                  parts body | detail | crowd (pivot 'crowd') | wands (state,
                        pivot 'wands' ⊂ 'crowd') | ball (pivot 'ball') | lamps (night)
                  state key wands: 0 dim … 1 lit (always lit in stadium_night)
                  anchors top, spot (penalty spot)
     att_kart     2×2 pit garage: a crisp Graphite box under a cantilevered roof,
                  roller door + slats in a frame, a 16-quad checkered band, a Laser
                  Lime LED bolt sign on the roof edge (+ Showtime glow sleeve), a
                  tool chest, 3 ink tyres and the selected kart parked out front at
                  half scale
                  parts body | sign | signGlow | kart, kartGlow, kartGold (pivot 'kart')
                  anchors top, spot, seat, exhaust
     kart_red|blue|lime|unicorn|gold   the shared 0.9 u kart in its LOCKED colour
                  parts body | wheelF (pivot 'wheelF' ⊂ 'steer') | wheelB (pivot
                        'wheelB') | trim (chrome) | glow (neon under-glow) | gold
                  pivots seat, steer, wheelF, wheelB · anchors seat, nose, exhaust, top
                  Games: SL3D.make('kart_<x>', {}, tier) (spin wheels about x, steer about y)
     ball_*       a ball (r 0.11) on a little display riser; pivot 'ball' at its centre
                  SL3D.makeBall(id, tier) → the bare ball, base y = 0, centre (0, 0.11, 0)
     stadium_*    a mini stadium diorama (1×1) in that stadium's colours and dressing
     course_*     the gate dressed as that course (variants preview on their base item)
     track_*      a mini track diorama: oval road, kerbs, the track's grass and props

   HANDLERS: att_course {build, idle, act, show, material, setUser, setMember};
   course_* {build, idle, show, material, setUser, setMember}; att_pitch {build,
   idle, act, show} (its idle animates the crowd although LOOK.att_pitch.idle is
   null); att_kart {build, act}; the rest {build}.
   idle(a) / show(a, k) / act(a, name) → {dur, update(a, t) → alive, cancel()}
   use only the documented animation handle (a.pivot(name).set, a.state, a.emit,
   a.sfx, a.t, a.phase, a.reduced, a.bpm, a.show); timelines come from SLMotion
   ('launch' for the gate and the pitch, 'kartRev' for the garage), every act
   has its reduced-motion variant and fires its own SLMotion cues (sfx + emits).

   CUSTOM MATERIAL HOOK (integration): the banner text is a separate part
   ('text', matKey 'toon', painted in the band colour so it is invisible
   without the hook). handler.material(matKey, part) returns the sign
   material for it (null otherwise) — pass it as opts.material to
   K.batch / K.instantiate (the kit's documented override). Templates drop
   uv, so the material maps the 'PET COURSE' cell of K.signAtlas() from the
   item-space position on the arch, and paints the underline below it in the
   child's member colour: model.setUser({color}) / setMember('#hex') (or a
   handle carrying a.member / a.user.color) sets it; until then it is the
   look's member fallback. One material (one program) serves every gate.
   ================================================================ */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) { module.exports = api; return; }
  var S = root.SL3D;
  if (S && typeof S.defineModels === 'function') {
    S.defineModels('attractions', api.models);
    if (typeof S.defineApi === 'function') S.defineApi('makeBall', api.makeBallApi);
  }
}(typeof self !== 'undefined' ? self : typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var DEG = Math.PI / 180;
  var TAU = Math.PI * 2;

  /* ================================================================
     PURE DATA AND HELPERS (no THREE; exported for Node tests)
     ================================================================ */
  var IDS = {
    attractions: ['att_course', 'att_pitch', 'att_kart'],
    karts: ['kart_red', 'kart_blue', 'kart_lime', 'kart_unicorn', 'kart_gold'],
    balls: ['ball_classic', 'ball_rainbow', 'ball_planet', 'ball_gold'],
    stadiums: ['stadium_day', 'stadium_night', 'stadium_beach', 'stadium_snow'],
    courses: ['course_meadow', 'course_beach', 'course_snow', 'course_candy'],
    tracks: ['track_loop', 'track_volcano', 'track_beach']
  };
  var ALL_IDS = [].concat(IDS.attractions, IDS.karts, IDS.balls, IDS.stadiums, IDS.courses, IDS.tracks);
  var SLOTS = { course: IDS.courses, ball: IDS.balls, stadium: IDS.stadiums, kart: IDS.karts, track: IDS.tracks };
  var SLOT_DEFAULTS = { course: 'course_meadow', ball: 'ball_classic', stadium: 'stadium_day', kart: 'kart_red', track: 'track_loop' };

  /* colour tokens per id and part — a copy of SLIslandLook.LOOK[id].colors (the live
     table wins when it is loaded; a test keeps the two identical) */
  var KART_GLOW = { kart_red: 'Neon Pink', kart_blue: 'Neon Cyan', kart_lime: 'Neon Lime', kart_unicorn: 'Neon Pink', kart_gold: 'Star Gold' };
  var KART_EXTRA = {
    kart_red: {}, kart_blue: { stripe: 'Cloud White', fin: 'Cloud White' }, kart_lime: { bolt: 'Star Gold' },
    kart_unicorn: { horn: 'Gold Base', m1: 'Coral', m2: 'Rainbow Orange', m3: 'Star Gold', m4: 'Leaf Mint', m5: 'Splash Blue', m6: 'Grape' },
    kart_gold: { star: 'Star Gold' }
  };
  var TRACK_EXTRA = {
    track_loop: { palm: 'Frond', trunk: 'Palm Bark', sea: 'Sea Shallow' },
    track_volcano: { cone: 'Volcano Rock', lava: 'Peach Coral', smoke: 'Iridescent Rim', skyA: 'Sunset Peach', skyB: 'Dusk Violet' },
    track_beach: { sea: 'Sea Shallow', hutA: 'Coral', hutB: 'Cloud White', umbrella: 'Splash Blue' }
  };
  var COLORS = (function () {
    var c = {
      att_course: { pillar: 'Graphite', banner: 'THEME.$course.1', plate: 'THEME.$course.0', text: 'Bone White', bulb: 'Holo Lemon', star: 'Star Gold',
        hurdlePost: 'Cloud White', hurdleA: 'Coral', hurdleB: 'Star Gold' },
      att_pitch: { grass: 'STADIA.$stadium.1', sky: 'STADIA.$stadium.0', line: 'Cloud White', post: 'Cloud White', net: 'Cloud White', stand: 'Pebble',
        ball: 'BALLS.$ball.0', ballPatch: 'BALLS.$ball.1', fanA: 'Crowd Shadow', fanB: 'Crowd Shadow 2', fanC: 'Crowd Shadow 3', fanD: 'Graphite', wand: 'Cloud White' },
      att_kart: { garage: 'Graphite', door: 'Roller Door', slat: 'Door Slat', checkA: 'Midnight Ink', checkB: 'Cloud White', sign: 'Laser Lime', tyre: 'Ink', kart: 'KARTS.$kart' },
      course_meadow: { plate: 'THEME.course_meadow.0', banner: 'THEME.course_meadow.1', hedge: 'Bush', flower: 'Tulip Pink' },
      course_beach: { plate: 'THEME.course_beach.0', banner: 'THEME.course_beach.1', crab: 'Coral', shell: 'Blossom Light' },
      course_snow: { plate: 'THEME.course_snow.0', banner: 'THEME.course_snow.1', snow: 'Snow', hat: 'Ink', carrot: 'Carrot' },
      course_candy: { plate: 'THEME.course_candy.0', banner: 'THEME.course_candy.1', stick: 'Cloud White', lolly: 'Tulip Pink', gumA: 'Grape', gumB: 'Leaf Mint', gumC: 'Star Gold' },
      ball_classic: { body: 'BALLS.ball_classic.0', patch: 'BALLS.ball_classic.1', trail: 'BALLS.ball_classic.1' },
      ball_rainbow: { body: 'BALLS.ball_rainbow.0', trail: 'BALLS.ball_rainbow.1', b1: 'Coral', b2: 'Rainbow Orange', b3: 'Star Gold', b4: 'Leaf Mint', b5: 'Splash Blue', b6: 'Grape' },
      ball_planet: { body: 'BALLS.ball_planet.0', ring: 'BALLS.ball_planet.1', trail: 'BALLS.ball_planet.1' },
      ball_gold: { body: 'BALLS.ball_gold.0', accent: 'BALLS.ball_gold.1', trail: 'BALLS.ball_gold.1' },
      stadium_day: { sky: 'STADIA.stadium_day.0', grass: 'STADIA.stadium_day.1' },
      stadium_night: { sky: 'STADIA.stadium_night.0', grass: 'STADIA.stadium_night.1', flood: 'Lamp Halo', pole: 'Pole' },
      stadium_beach: { sky: 'STADIA.stadium_beach.0', grass: 'STADIA.stadium_beach.1', sand: 'Sand', palm: 'Frond', trunk: 'Palm Bark', sea: 'Sea Shallow' },
      stadium_snow: { sky: 'STADIA.stadium_snow.0', grass: 'STADIA.stadium_snow.1', snow: 'Snow' }
    };
    IDS.karts.forEach(function (id) {
      var e = { body: 'KARTS.' + id, wheel: 'Ink', hub: 'Pebble', trim: 'Chrome', glow: KART_GLOW[id] };
      for (var k in KART_EXTRA[id]) e[k] = KART_EXTRA[id][k];
      c[id] = e;
    });
    IDS.tracks.forEach(function (id) {
      var e = { grass: 'TRACKS.' + id + '.grass', asphalt: 'Asphalt', line: 'Cloud White', kerbA: 'Coral', kerbB: 'Cloud White' };
      for (var k in TRACK_EXTRA[id]) e[k] = TRACK_EXTRA[id][k];
      c[id] = e;
    });
    return c;
  }());

  /* every other token this file paints with (palette / PALETTE_V2 / ART2D / EXTRA names) */
  var X = {
    ink: 'Ink', white: 'Cloud White', stem: 'Stem', flower2: 'Tulip Yellow', flower3: 'Cloud White',
    wandOff: 'Pole', pole: 'Pole', stick: 'Midnight Ink', riser: 'Gunmetal', riserRing: 'Neon Magenta',
    pennants: ['Coral', 'Star Gold', 'Splash Blue', 'Leaf Mint'],
    /* LED dot / strip states (instance colours of the 'state' material): the LOOK bulb colour by
       day, the v2 neon set at Showtime */
    bulbs: { day: 'Holo Lemon', pink: 'Neon Magenta', cyan: 'LED Cyan', violet: 'Electric Violet', dim: 'Night Mid' },
    neon4: ['Neon Magenta', 'LED Cyan', 'Electric Violet', 'Laser Lime'],
    /* the PET COURSE underline when the child's member colour is not known yet (= MEMBER_FALLBACK) */
    member: 'Bubblegum'
  };

  /* 'THEME.$course.1' + {course: 'course_snow'} → 'THEME.course_snow.1' (unknown or missing → default) */
  function pick(slot, st) {
    var v = st && st[slot], list = SLOTS[slot];
    return typeof v === 'string' && list && list.indexOf(v) >= 0 ? v : SLOT_DEFAULTS[slot];
  }
  function slotToken(token, st) {
    if (typeof token !== 'string' || token.indexOf('$') < 0) return token;
    return token.replace(/\$(\w+)/g, function (m0, slot) { return SLOTS[slot] ? pick(slot, st) : m0; });
  }
  function lookColors(id) {
    var L = root && root.SLIslandLook, e = L && L.LOOK && L.LOOK[id];
    return (e && e.colors) || null;
  }
  function tok(id, part, st) {
    var live = lookColors(id), t = (live && live[part]) || (COLORS[id] && COLORS[id][part]) || 'Pebble';
    return slotToken(t, st);
  }

  /* ---------------- the gate's arch ----------------
     A band of height h on a circle centred (0, cy), inner radius rIn, between the
     pillar axes at x = ±pillarX. Flat band coords (s along the arc at the mid radius,
     v across from the inner edge) map onto it with arcMap. */
  var ARCH = (function () {
    var px = 0.72, rIn = 0.95, h = 0.26, rMid = rIn + h / 2;
    return {
      cy: 0.5, rIn: rIn, h: h, rMid: rMid, rOut: rIn + h, half: Math.asin(px / rMid),
      z: -0.3, depth: 0.09, pillarX: px, pillarR: 0.09, pillarTop: 1.57, starY: 1.79, starR: 0.13,
      textHalf: 0.5, bulbHalf: 0.46, bulbR: 0.024, bulbs: 14, strip: 0.012, dotInset: 0.034,
      /* the member underline just under the PET COURSE baseline (the atlas fits the word to ~0.3–0.65
         of its cell height): band v from v0 to v1 (fractions of h), |text u − ½| ≤ half */
      under: { v0: 0.2, v1: 0.25, half: 0.36 }
    };
  }());
  function arcMap(s, v, out) {
    out = out || {};
    var th = s / ARCH.rMid, r = ARCH.rIn + v;
    out.theta = th; out.x = r * Math.sin(th); out.y = ARCH.cy + r * Math.cos(th);
    out.c = Math.cos(th); out.s = Math.sin(th);
    return out;
  }
  /* the 14 LED marquee dots along the arch's outer rim, alternating between two chase groups */
  function bulbLayout(n) {
    n = n || ARCH.bulbs;
    var out = [];
    for (var i = 0; i < n; i++) {
      var th = -ARCH.bulbHalf + (n > 1 ? i * 2 * ARCH.bulbHalf / (n - 1) : ARCH.bulbHalf);
      out.push({ i: i, theta: th, x: ARCH.rOut * Math.sin(th), y: ARCH.cy + ARCH.rOut * Math.cos(th), group: i % 2 });
    }
    return out;
  }
  /* the Showtime LED chase (dots + strips): groups alternate every beat (≤ 1 Hz each at 118 BPM),
     colours step Magenta → Cyan → Violet every 2 beats; steady under reduced motion */
  var CHASE = ['pink', 'cyan', 'violet'];
  var MAX_BPM = 180;                 /* one toggle per beat: a group never cycles above LED_CHASE_HZ = 1.5 */
  function chaseState(t, bpm, show, reduced, out) {
    out = out || {};
    if (!(show > 0.5)) { out.a = 'day'; out.b = 'day'; return out; }
    if (reduced) { out.a = 'pink'; out.b = 'cyan'; return out; }
    var b = bpm > 0 ? Math.min(bpm, MAX_BPM) : 118, n = Math.floor((t || 0) * b / 60);
    var col = CHASE[((Math.floor(n / 2) % 3) + 3) % 3];
    if (n & 1) { out.a = 'dim'; out.b = col; } else { out.a = col; out.b = 'dim'; }
    return out;
  }

  /* ---------------- the pitch ---------------- */
  var PITCH = {
    top: 0.06, field: { x0: -1.3, x1: 1.3, z0: -0.4, z1: 0.84 },
    goal: { x: 1.3, z: 0.22, half: 0.25, h: 0.27, d: 0.11 }, spot: { x: 0.96, z: 0.22 }, ballR: 0.055,
    standX: 1.2, tierH: 0.08,
    tiers: [{ y: 0.06, z0: -0.92, z1: -0.46 }, { y: 0.14, z0: -0.92, z1: -0.62 }, { y: 0.22, z0: -0.92, z1: -0.78 }],
    rows: [14, 13, 13], fanStep: 0.17, fanH: 0.12,
    /* corner props stand beside the stand ends (x beyond standX) or the front corners */
    towers: [[-1.34, -0.8], [1.34, -0.8], [-1.34, 0.78], [1.34, 0.78]], palms: [[-1.31, -0.72, 1], [1.31, -0.72, -1]],
    banks: [[-0.95, 0.82, 0.1], [0.12, 0.83, 0.09], [1.05, 0.82, 0.1], [-1.3, -0.62, 0.085], [1.3, -0.62, 0.085], [-1.31, 0.3, 0.08]]
  };
  /* fans: rows on the 3 tiers, deterministic colour mixes; a cap (LOW: SLTier crowd 30)
     drops seats evenly across all rows (Bresenham), so the stand never looks lopsided */
  function crowdLayout(max) {
    var total = 0, r, i, j = 0, out = [];
    for (r = 0; r < PITCH.rows.length; r++) total += PITCH.rows[r];
    var cap = max > 0 && max < total ? Math.floor(max) : total;
    for (r = 0; r < PITCH.rows.length; r++) {
      var cnt = PITCH.rows[r], tier = PITCH.tiers[r], next = PITCH.tiers[r + 1];
      var z = ((next ? next.z1 : tier.z0) + tier.z1) / 2, y = tier.y + PITCH.tierH;
      for (i = 0; i < cnt; i++, j++) {
        if (Math.floor((j + 1) * cap / total) === Math.floor(j * cap / total)) continue;
        out.push({ x: (i - (cnt - 1) / 2) * PITCH.fanStep, y: y, z: z, row: r, fan: (i * 3 + r) % 4, wand: (i * 5 + r * 2) % 4, lean: ((i + r) % 3) - 1 });
      }
    }
    return out;
  }
  /* the crowd's idle: a soft breath by day; a beat bounce + light-stick sway at Showtime */
  function crowdPose(t, bpm, show, reduced, phase, out) {
    out = out || {};
    out.cy = 0; out.wx = 0; out.wy = 0;
    if (reduced) return out;
    t = t || 0;
    if (show > 0.5) {
      var beats = t * (bpm > 0 ? Math.min(bpm, MAX_BPM) : 118) / 60, s = Math.sin(Math.PI * beats);
      out.cy = 0.012 * Math.abs(s); out.wx = 0.022 * s; out.wy = 0.006 * Math.abs(s);
    } else out.cy = 0.004 * Math.sin(TAU * (t / 2.4 + (phase || 0)));
    return out;
  }

  /* ---------------- the garage ---------------- */
  /* the 2D banner: two rows of 8, row 0 starts dark */
  function checkerLayout(cols, rows) {
    var out = [];
    for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) out.push({ c: c, r: r, dark: (c + r) % 2 === 0 });
    return out;
  }
  /* a lightning zigzag in a unit box (x right, y up), top to bottom */
  var BOLT = [[0.2, 0.5], [-0.12, 0.04], [0.12, 0.02], [-0.2, -0.5]];
  /* the parked kart: half scale, yawed toward the front-right */
  var PARKED = { x: 0.18, z: 0.58, yaw: 25, s: 0.5 };
  function parkedPoint(p) {
    var y = PARKED.yaw * DEG, c = Math.cos(y), s = Math.sin(y), x = p[0] * PARKED.s, z = p[2] * PARKED.s;
    return [PARKED.x + x * c + z * s, p[1] * PARKED.s, PARKED.z - x * s + z * c];
  }

  /* ---------------- the kart (0.9 u long) ---------------- */
  var KART = { axleF: [0, 0.1, 0.26], axleB: [0, 0.1, -0.26], seat: [0, 0.22, -0.1], wheelX: 0.25, wheelR: 0.1, nose: [0, 0.16, 0.45], exhaust: [0, 0.14, -0.44] };

  /* ---------------- balls ---------------- */
  var ICO_DIRS = (function () {
    var p = (1 + Math.sqrt(5)) / 2, v = [], l = Math.sqrt(1 + p * p);
    [[-1, p, 0], [1, p, 0], [-1, -p, 0], [1, -p, 0], [0, -1, p], [0, 1, p], [0, -1, -p], [0, 1, -p], [p, 0, -1], [p, 0, 1], [-p, 0, -1], [-p, 0, 1]]
      .forEach(function (a) { v.push([a[0] / l, a[1] / l, a[2] / l]); });
    return v;
  }());
  function nearIco(x, y, z, cosMax) {
    var l = Math.sqrt(x * x + y * y + z * z) || 1, lim = cosMax || 0.985;
    for (var i = 0; i < ICO_DIRS.length; i++) {
      var d = ICO_DIRS[i];
      if ((x * d[0] + y * d[1] + z * d[2]) / l > lim) return true;
    }
    return false;
  }
  /* latitude band (0 = top) of a point at normalised height yn ∈ [-1, 1] */
  function rainbowBand(yn, n) {
    var b = Math.floor((1 - yn) / 2 * n);
    return b < 0 ? 0 : b >= n ? n - 1 : b;
  }
  /* Euler XYZ degrees (three.js order) that turn +y onto the direction d */
  function alignY(dx, dy, dz) {
    var l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    dx /= l; dy /= l; dz /= l;
    var gz = -Math.asin(dx < -1 ? -1 : dx > 1 ? 1 : dx);
    var ax = Math.abs(dx) > 0.99999 ? 0 : Math.atan2(dz, dy);
    return [ax / DEG, 0, gz / DEG];
  }

  /* ---------------- track dioramas ---------------- */
  var TRACK = { R: 0.25, r: 0.065, sx: 1.18, sz: 0.82, flat: 0.16, y: 0.092, kerbs: 16, dashes: 8 };
  function ovalPoint(phi, out) {
    out = out || {};
    out.x = TRACK.sx * TRACK.R * Math.cos(phi); out.z = TRACK.sz * TRACK.R * Math.sin(phi);
    var tx = -TRACK.sx * Math.sin(phi), tz = TRACK.sz * Math.cos(phi);
    out.yaw = Math.atan2(-tz, tx) / DEG;          /* Ry that turns +x along the tangent */
    return out;
  }

  /* ================================================================
     K-BOUND GEOMETRY HELPERS (run only when a kit K exists)
     ================================================================ */
  function ops(K) {
    var G = K.G, low = K.tier === 'LOW';
    function rad(n) { return low ? Math.max(3, Math.round(n * 0.7)) : n; }
    function fin(geo, token, o) {
      if (token) G.paint(geo, token, o && o.tone);
      return o && (o.p || o.r || o.s != null) ? G.t(geo, o) : geo;
    }
    var O = {
      G: G, K: K, low: low, rad: rad,
      puff: function (r, token, o) { return fin(G.puff(r, o && o.sphere ? { sphere: true } : null), token, o); },
      tube: function (rt, rb, h, token, o) { return fin(G.tube(rt, rb, h, { radial: rad((o && o.radial) || 12), open: !!(o && o.open) }), token, o); },
      cone: function (r, h, token, o) { return fin(G.cone(r, h, rad((o && o.radial) || 12)), token, o); },
      slab: function (w, h, d, token, o) { return fin(G.slab(w, h, d, o && o.radius != null ? o.radius : undefined), token, o); },
      box: function (w, h, d, token, o) { return fin(G.slab(w, h, d, 0), token, o); },
      bean: function (r, len, token, o) { return fin(G.bean(r, len), token, o); },
      drop: function (r, h, token, o) { return fin(G.drop(r, h, o && o.profile), token, o); },
      ring: function (R, r, token, o) { return fin(G.ring(R, r), token, o); },
      star: function (ro, ri, token, o) { return fin(G.star(ro, ri), token, o); },
      /* a tube between two points */
      rod: function (a, b, r, token, o) {
        var dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-4;
        return O.tube(r, r, len, token, { radial: (o && o.radial) || 6, tone: o && o.tone, r: alignY(dx, dy, dz), p: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2] });
      },
      /* the ✦ spark (16 tris): a tall and a wide flattened 4-sided double cone, crossed, facing +z.
         Four points, never the five-point ⭐ reward star */
      spark: function (rOut, rIn, depth, token, o) {
        function spike(sx, sy) {
          var up = G.t(G.tube(0, 1, 1, { radial: 4, open: true }), { p: [0, 0.5, 0] });
          var dn = G.t(G.tube(1, 0, 1, { radial: 4, open: true }), { p: [0, -0.5, 0] });
          return G.t(G.merge([up, dn]), { s: [sx, sy, depth] });
        }
        var g = G.facet(G.merge([spike(rIn, rOut), spike(rOut, rIn)]));
        if (token) G.paintBy(g, function (v) { return v.nz > 0.3 && v.nx + v.ny < 0 ? [token, 'shade'] : v.nz > 0.3 ? [token, 'hi'] : token; }, { perFace: true });
        return o && (o.p || o.r || o.s != null) ? G.t(g, o) : g;
      },
      /* a crisp box (BoxGeometry) painted by face: lit top, shaded sides facing away from the sun */
      crisp: function (w, h, d, token, o) {
        var g = G.slab(w, h, d, 0);
        if (token) G.paintBy(g, function (v) { return v.ny > 0.5 ? [token, 'hi'] : v.ny < -0.5 || v.nx > 0.5 ? [token, 'shade'] : token; });
        return o && (o.p || o.r || o.s != null) ? G.t(g, o) : g;
      }
    };
    return O;
  }
  /* bend a flat band (x = s along the arc, y = v across) onto the arch, normals too */
  var _arc = {};
  function bendArc(geo) {
    var P = geo.getAttribute('position'), N = geo.getAttribute('normal'), p = P.array, n = N.array;
    for (var i = 0; i < p.length; i += 3) {
      arcMap(p[i], p[i + 1], _arc);
      p[i] = _arc.x; p[i + 1] = _arc.y;
      var nx = n[i], ny = n[i + 1];
      n[i] = nx * _arc.c + ny * _arc.s; n[i + 1] = -nx * _arc.s + ny * _arc.c;
    }
    P.needsUpdate = true; N.needsUpdate = true;
    return geo;
  }
  /* the ctx handed to K.template with the look's triangle budget replaced (a preview that
     IS its base item, or an attraction plus its instanced crowd) */
  function withBudget(ctx, tris) {
    var c = {}, k;
    for (k in ctx) c[k] = ctx[k];
    var look = {};
    for (k in (ctx.look || {})) look[k] = ctx.look[k];
    look.tris = tris;
    c.look = look;
    return c;
  }
  function budgetOf(id, dflt) {
    var L = root && root.SLIslandLook, e = L && L.LOOK && L.LOOK[id];
    return e && typeof e.tris === 'number' ? e.tris : dflt;
  }

  /* ================================================================
     THE COURSE GATE (att_course and the course_* previews)
     ================================================================ */
  var BULB_STATE = function (key) {
    return { key: key, off: X.bulbs.day, on: X.bulbs.pink, initial: 0, map: X.bulbs };
  };
  function courseDressing(o, course, list) {
    var c = function (p) { return tok(course, p, {}); }, y0 = 0.07;
    if (course === 'course_beach') {
      /* a small faceted crab (no face), two scallop shells and a starfish */
      var cx = -0.62, cz = 0.58, crab = c('crab');
      list.push(o.G.facet(o.puff(0.075, crab, { s: [1.3, 0.6, 1], p: [cx, y0 + 0.045, cz] })));
      [-1, 1].forEach(function (s) {
        list.push(o.puff(0.032, crab, { tone: 'shade', p: [cx + s * 0.11, y0 + 0.04, cz + 0.06] }));
        list.push(o.tube(0.008, 0.008, 0.045, crab, { radial: 4, tone: 'hi', p: [cx + s * 0.03, y0 + 0.095, cz + 0.04] }));
      });
      [[0.7, 0.2, 20], [0.12, 0.76, -30]].forEach(function (s) {
        var shell = o.cone(0.07, 0.035, null, { radial: 10 });
        o.G.paintBy(shell, function (v) { return Math.floor((Math.atan2(v.z, v.x) + Math.PI) / (TAU / 10)) % 2 ? [c('shell'), 'shade'] : c('shell'); }, { perFace: true });
        list.push(o.G.t(shell, { s: [1, 1, 0.8], r: [0, s[2], 0], p: [s[0], y0 + 0.0175, s[1]] }));
      });
      list.push(o.star(0.06, 0.028, crab, { tone: 'hi', r: [-90, 0, 0], p: [-0.12, y0 + 0.008, 0.74] }));
    } else if (course === 'course_snow') {
      /* a mini snowman, snow caps on the pillars and a snow bank */
      var sx = -0.66, sz = 0.56, snow = c('snow');
      list.push(o.puff(0.1, snow, { p: [sx, y0 + 0.09, sz] }));
      list.push(o.puff(0.07, snow, { p: [sx, y0 + 0.24, sz] }));
      list.push(o.tube(0.07, 0.07, 0.012, c('hat'), { radial: 12, p: [sx, y0 + 0.3, sz] }));
      list.push(o.tube(0.045, 0.045, 0.06, c('hat'), { radial: 10, p: [sx, y0 + 0.335, sz] }));
      list.push(o.cone(0.014, 0.06, c('carrot'), { radial: 6, r: [90, 0, 0], p: [sx, y0 + 0.24, sz + 0.09] }));
      [-1, 1].forEach(function (s) { list.push(o.box(0.018, 0.018, 0.012, X.ink, { p: [sx + s * 0.025, y0 + 0.265, sz + 0.064] })); });
      [-1, 1].forEach(function (s) { list.push(o.puff(0.13, snow, { s: [1, 0.35, 1], p: [s * ARCH.pillarX, ARCH.pillarTop + 0.05, ARCH.z] })); });
      list.push(o.puff(0.12, snow, { s: [1.3, 0.45, 1], p: [0.66, y0 + 0.02, 0.64] }));
      list.push(o.puff(0.09, snow, { s: [1.2, 0.5, 1], p: [0.8, y0 + 0.02, 0.5] }));
    } else if (course === 'course_candy') {
      /* two swirl lollipops and three gumdrops */
      var lolly = function (x, z, h, r) {
        list.push(o.tube(0.012, 0.012, h, c('stick'), { radial: 6, p: [x, y0 + h / 2, z] }));
        var disc = o.tube(r, r, 0.035, null, { radial: 16 });
        o.G.paintBy(disc, function (v) { return Math.floor((Math.atan2(v.z, v.x) + Math.PI) / (TAU / 8)) % 2 ? c('stick') : c('lolly'); }, { perFace: true });
        list.push(o.G.t(disc, { r: [90, 0, 0], p: [x, y0 + h + r * 0.8, z] }));
      };
      lolly(-0.68, 0.6, 0.34, 0.11);
      lolly(0.6, -0.7, 0.26, 0.085);
      var prof = [[0, 0], [1, 0.04], [0.92, 0.45], [0.55, 0.85], [0, 1]];
      [[0.62, 0.66, 'gumA'], [0.79, 0.52, 'gumB'], [0.8, 0.74, 'gumC']].forEach(function (g) {
        list.push(o.drop(0.055, 0.075, c(g[2]), { profile: prof, p: [g[0], y0, g[1]] }));
      });
    } else {
      /* meadow: a hedge seen through the arch and a little flower clump */
      var hedge = c('hedge');
      [[-0.3, -0.72, 1], [0, -0.75, 1.1], [0.3, -0.72, 0.95]].forEach(function (h) {
        list.push(o.puff(0.13 * h[2], hedge, { s: [1.1, 0.85, 0.9], p: [h[0], y0 + 0.1 * h[2], h[1]] }));
      });
      [[-0.7, 0.6, 0.16, c('flower')], [-0.6, 0.68, 0.12, X.flower2], [-0.76, 0.7, 0.1, X.flower3]].forEach(function (f) {
        list.push(o.tube(0.012, 0.012, f[2], X.stem, { radial: 5, p: [f[0], y0 + f[2] / 2, f[1]] }));
        list.push(o.puff(0.04, f[3], { p: [f[0], y0 + f[2] + 0.025, f[1]] }));
      });
    }
  }
  /* a thin flat strip on the arch's front face, centred at band height v (u), half-width w, over the
     arc length L: bent from a subdivided flag, so it follows the curve */
  function arcStrip(G, L, v, w, z, seg, token) {
    return bendArc(G.t(G.paint(G.flag(L, 2 * w, seg, 1), token), { p: [-L / 2, v, z] }));
  }
  function buildCourse(ctx, course) {
    var K = ctx.K, o = ops(K), G = K.G, A = ARCH, st = { course: course };
    var c = function (p) { return tok('att_course', p, st); };
    var body = [], band = c('pillar'), accent = c('banner');
    /* the start pad: its top in the exact course colour, the sides a shade darker */
    body.push(G.paintBy(o.box(1.84, 0.07, 1.84, null, { p: [0, 0.035, 0] }), function (v) { return v.ny > 0.5 ? c('plate') : [c('plate'), 'shade']; }));
    /* slim square Graphite pillars on course-colour plinths, a lit cap and a spark peg */
    [-1, 1].forEach(function (sx) {
      var x = sx * A.pillarX, h0 = 0.19, top = A.pillarTop - 0.03;
      body.push(o.crisp(0.25, 0.12, 0.25, accent, { p: [x, 0.07 + 0.06, A.z] }));
      body.push(o.crisp(2 * A.pillarR, top - h0, 2 * A.pillarR, band, { p: [x, (top + h0) / 2, A.z] }));
      body.push(o.crisp(2 * A.pillarR + 0.03, 0.04, 2 * A.pillarR + 0.03, band, { p: [x, top + 0.02, A.z] }));
      body.push(o.tube(0.014, 0.014, 0.12, c('star'), { radial: 6, tone: 'shade', p: [x, A.pillarTop + 0.07, A.z] }));
    });
    /* the arch band: a Graphite front face, its outer and inner rims in the course colour */
    var seg = o.low ? 11 : 16, L = 2 * A.half * A.rMid, zf = A.z + A.depth / 2;
    body.push(bendArc(G.t(G.paint(G.flag(L, A.h, seg, 1), band), { p: [-L / 2, A.h / 2, zf] })));
    body.push(bendArc(G.t(G.paint(G.flag(L, A.depth, seg, 1), accent), { r: [-90, 0, 0], p: [-L / 2, A.h, A.z] })));
    body.push(bendArc(G.t(G.paint(G.flag(L, A.depth, seg, 1), accent, 'shade'), { r: [90, 0, 0], p: [-L / 2, 0, A.z] })));
    /* the text quad over the middle of the band (the sign material through the hook; painted in
       the band colour, it is invisible without it) */
    var Lt = 2 * A.textHalf * A.rMid;
    var text = bendArc(G.t(G.paint(G.flag(Lt, A.h, seg, 1), band), { p: [-Lt / 2, A.h / 2, zf + 0.004] }));
    /* the LED arch: a strip along each edge of the band and 14 LED dots on its outer rim, in the
       two chase groups (A: dots 0, 2, … + the outer strip; B: dots 1, 3, … + the inner strip) */
    var leds = [[arcStrip(G, L, A.h - A.strip * 0.75, A.strip / 2, zf + 0.006, seg, X.white)], [arcStrip(G, L, A.strip * 0.75, A.strip / 2, zf + 0.006, seg, X.white)]];
    bulbLayout().forEach(function (b) {
      var g = G.t(G.cone(A.bulbR, A.bulbR * 0.9, 6), { p: [0, A.bulbR * 0.45, 0] });
      G.paint(g, X.white);
      leds[b.group].push(G.t(g, { r: [0, 0, -b.theta / DEG], p: [b.x, b.y, A.z] }));
    });
    /* two mini hurdles in front (white posts on feet, coral and gold bars) */
    [[-0.3, 0.14, c('hurdleA')], [0.32, 0.5, c('hurdleB')]].forEach(function (h) {
      [-1, 1].forEach(function (s) {
        body.push(o.crisp(0.036, 0.24, 0.036, c('hurdlePost'), { p: [h[0] + s * 0.15, 0.07 + 0.12, h[1]] }));
        body.push(o.crisp(0.05, 0.025, 0.14, c('hurdlePost'), { p: [h[0] + s * 0.15, 0.0825, h[1]] }));
      });
      body.push(o.crisp(0.36, 0.05, 0.03, h[2], { p: [h[0], 0.285, h[1]] }));
    });
    courseDressing(o, course, body);
    /* the spinning ✦ sparks, one pivot each */
    var starL = o.spark(A.starR, A.starR * 0.34, 0.04, c('star'), { p: [-A.pillarX, A.starY, A.z] });
    var starR = o.spark(A.starR, A.starR * 0.34, 0.04, c('star'), { p: [A.pillarX, A.starY, A.z] });

    var tc = withBudget(ctx, Math.max(budgetOf('att_course', 4000), ctx.look && ctx.look.tris || 0));
    return K.template(tc)
      .pivot('glow', [0, A.cy + A.rOut, A.z])
      .pivot('spin', [-A.pillarX, A.starY, A.z])
      .pivot('spin2', [A.pillarX, A.starY, A.z])
      .part('body', body, 'toon', { castShadow: true, outline: true })
      .part('text', [text], 'toon', {})
      .part('bulbA', leds[0], 'state', { pivot: 'glow', stateColor: BULB_STATE('bulbA') })
      .part('bulbB', leds[1], 'state', { pivot: 'glow', stateColor: BULB_STATE('bulbB') })
      .part('starL', [starL], 'toon', { pivot: 'spin' })
      .part('starR', [starR], 'toon', { pivot: 'spin2' })
      .anchor('spot', [0, 0.07, 0.05])
      .anchor('banner', [0, A.cy + A.rOut, A.z + 0.06])
      .done();
  }

  /* the PET COURSE sign: one material shared by every course and tier. It shows the 'PET COURSE'
     cell of the shared sign atlas (K.signAtlas: Unbounded 800, white; the canvas banner when the kit
     has no atlas) in the LOOK text colour, and draws the underline in the member colour. u runs
     along the arch, v across it, both computed from item-space position. */
  var signRef = null;
  function bannerMaterial(K) {
    var e = K.parts.get('att:sign', 'MID', function () {
      var T3 = K.THREE, atlas = null, r = null, tex;
      try { atlas = typeof K.signAtlas === 'function' ? K.signAtlas() : null; r = atlas ? atlas.rect('PET COURSE') : null; } catch (err) { atlas = null; r = null; }
      if (atlas && r) tex = atlas.texture;
      else {
        tex = K.tex.banner('PET COURSE', { w: 512, h: 128, font: 'Unbounded', weight: 800, fallback: 'Outfit', fill: 'Cloud White' });
        r = { u0: 0, v0: 0, u1: 1, v1: 1 };
      }
      var m = new T3.MeshBasicMaterial({ map: tex, color: K.col(tok('att_course', 'text', {})), transparent: true, depthWrite: false, alphaTest: 0.02, toneMapped: false, name: 'att-sign' });
      var U = ARCH.under;
      var uArc = { value: new T3.Vector4(ARCH.cy, ARCH.rIn, ARCH.h, ARCH.textHalf) };
      var uRect = { value: new T3.Vector4(r.u0, r.v0, r.u1 - r.u0, r.v1 - r.v0) };
      var uLine = { value: new T3.Vector4(U.v0, U.v1, U.half, 0) };
      var uMember = { value: K.col(X.member) };
      m.onBeforeCompile = function (sh) {
        sh.uniforms.uArc = uArc; sh.uniforms.uRect = uRect; sh.uniforms.uLine = uLine; sh.uniforms.uMember = uMember;
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nuniform vec4 uArc;\nuniform vec4 uRect;\nvarying vec2 vBand;')
          .replace('#include <uv_vertex>', '#include <uv_vertex>\n{ vec2 q = vec2(position.x, position.y - uArc.x);\n' +
            '  vBand = vec2(atan(q.x, q.y) / (2.0 * uArc.w) + 0.5, (length(q) - uArc.y) / uArc.z); }\n' +
            '#ifdef USE_MAP\n  vMapUv = uRect.xy + uRect.zw * clamp(vBand, 0.0, 1.0);\n#endif');
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform vec4 uLine;\nuniform vec3 uMember;\nvarying vec2 vBand;')
          .replace('#include <map_fragment>', '#include <map_fragment>\n' +
            '  if (vBand.y > uLine.x && vBand.y < uLine.y && abs(vBand.x - 0.5) < uLine.z) diffuseColor = vec4(uMember, 1.0);');
      };
      m.customProgramCacheKey = function () { return 'att-sign'; };
      return { mat: m, member: uMember, hex: null };
    });
    if (!signRef || signRef.e !== e) { signRef = { e: e, K: K }; applyMember(); }
    return e.mat;
  }
  /* the underline's member colour (a '#hex'); safe before the material exists (kept for it) */
  var memberHex = null;
  function setMember(hex) {
    var s0 = typeof hex === 'string' ? hex.trim() : '', h = /^#?[0-9a-f]{6}$/i.test(s0) ? ('#' + s0.replace('#', '')).toUpperCase() : null;
    if (!h) return false;
    memberHex = h;
    var s = signRef;
    if (s && s.e.hex !== h) {
      s.e.hex = h;
      var col = typeof s.K.rgb === 'function' ? s.K.rgb(h) : null;
      if (col) s.e.member.value.copy(col);
    }
    return true;
  }
  function applyMember() { if (memberHex) setMember(memberHex); }

  /* ================================================================
     THE PITCH (att_pitch) AND THE MINI STADIUMS (stadium_*)
     ================================================================ */
  function ballGeos(K, id, r, crisp) {
    var o = ops(K), G = K.G, toon = [], gold = [];
    var c = function (p) { return tok(id, p, {}); };
    if (id === 'ball_gold') gold.push(G.puff(r, crisp ? { sphere: true } : null));
    else if (id === 'ball_rainbow') {
      var bands = ['b1', 'b2', 'b3', 'b4', 'b5', 'b6'].map(c), g = G.puff(r, crisp ? { sphere: true } : null);
      toon.push(G.paintBy(g, function (v) { return bands[rainbowBand(v.y / r, 6)]; }, { perFace: true }));
    } else if (id === 'ball_planet') {
      toon.push(o.puff(r, c('body')));
      var ring = o.ring(r * 1.5, r * 0.11, c('ring'), { s: [1, 1, 0.45], r: [90, 0, 0] });
      toon.push(G.t(ring, { r: [0, 0, 18] }));
    } else {
      var b = G.puff(r), body = c('body'), patch = c('patch');
      if (crisp) {
        toon.push(G.paint(G.facet(b), body));
        ICO_DIRS.forEach(function (d) {
          toon.push(o.tube(r * 0.3, r * 0.3, r * 0.14, patch, { radial: 5, r: alignY(d[0], d[1], d[2]), p: [d[0] * r * 0.94, d[1] * r * 0.94, d[2] * r * 0.94] }));
        });
      } else toon.push(G.paintBy(b, function (v) { return nearIco(v.x, v.y, v.z) ? patch : body; }));
    }
    return { toon: toon, gold: gold };
  }
  /* a crowd fan: SL3D.makeFanBlob's template (models-characters) when it is light enough
     for 40 copies inside the crowd budget, else a silhouette: a tapered body and a faceted head
     (no face), in the Crowd Shadow tokens */
  var FAN_MAX_TRIS = 36;
  function borrowedFans(K, S) {
    if (!S || typeof S.makeFanBlob !== 'function') return null;
    return K.parts.get('att:fans', K.tier, function () {
      var list = [];
      for (var s = 0; s < 4; s++) {
        var obj = null, tpl = null;
        try { obj = S.makeFanBlob(s, K.tier); } catch (e) { obj = null; }
        if (K.isTemplate(obj)) tpl = obj;
        else if (obj && obj.userData && K.isTemplate(obj.userData.template)) tpl = obj.userData.template;
        if (tpl && tpl.tris <= FAN_MAX_TRIS && tpl.height > 0) list.push({ geo: K.G.merge(tpl.parts.map(function (p) { return p.geo; })), h: tpl.height });
        if (obj && obj.userData && typeof obj.userData.dispose === 'function') { try { obj.userData.dispose(); } catch (e) {} }
        if (!list.length) break;
      }
      return { list: list.length ? list : null };
    }).list;
  }
  function fanGeo(o, borrowed, k, token, x, y, z, h) {
    if (borrowed) {
      var b = borrowed[k % borrowed.length];
      return o.G.t(o.G.clone(b.geo), { s: h / b.h, p: [x, y, z] });
    }
    var rb = h * 0.36, rt = h * 0.2, hb = h * 0.64, hr = h * 0.17, hy = y + hb + hr * 0.95;
    return o.G.merge([
      o.tube(rt, rb, hb, token, { radial: 6, open: true, p: [x, y + hb / 2, z] }),
      o.tube(0, hr, hr, token, { radial: 6, open: true, tone: 'hi', p: [x, hy + hr / 2, z] }),
      o.tube(hr, 0, hr, token, { radial: 6, open: true, p: [x, hy - hr / 2, z] })
    ]);
  }
  /* a fan's Spark Stick: a Midnight Ink stick and a small ✦ head in one of the v2 neon hues
     (the 'wands' state colour dims them by day and lights them at Showtime) */
  function wandGeos(o, f, s, list) {
    var a = [f.x + 0.045 * s, f.y + 0.06 * s, f.z + 0.01], b = [f.x + 0.06 * s + f.lean * 0.012, f.y + 0.15 * s, f.z + 0.012];
    list.push(o.tube(0.005 * Math.max(1, s * 0.8), 0.005 * Math.max(1, s * 0.8), Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), X.stick,
      { radial: 3, open: true, r: alignY(b[0] - a[0], b[1] - a[1], b[2] - a[2]), p: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2] }));
    list.push(o.spark(0.024 * s, 0.009 * s, 0.007 * s, X.neon4[f.wand], { r: [0, 0, f.lean * 8], p: b }));
  }
  /* floodlight tower aimed at the pitch centre (pole + head in body, lamp face in lamps) */
  function floodlight(o, ctxStad, x, z, h, body, lamps, scale, top) {
    var pole = tok(ctxStad, 'pole', {}), flood = tok(ctxStad, 'flood', {});
    var yaw = Math.atan2(-x, -z) / DEG, s = scale || 1;
    body.push(o.tube(0.025 * s, 0.03 * s, h, pole, { radial: 6, p: [x, top + h / 2, z] }));
    body.push(o.box(0.18 * s, 0.11 * s, 0.05 * s, pole, { tone: 'shade', r: [25, yaw, 0], p: [x, top + h, z] }));
    var f = Math.sin(yaw * DEG) * 0.03 * s, g = Math.cos(yaw * DEG) * 0.03 * s;
    lamps.push(o.box(0.15 * s, 0.085 * s, 0.012 * s, flood, { r: [25, yaw, 0], p: [x + f, top + h - 0.012 * s, z + g] }));
  }
  /* a palm: 3 leaning trunk rings and 5 drooping flat fronds (base y0) */
  function palmGeos(o, colorsId, x, z, h, lean, list, y0) {
    var trunk = tok(colorsId, 'trunk', {}), frond = tok(colorsId, 'palm', {}), segs = 3, sh = h / segs, fl = 0.4 * h;
    var px = x, py = y0 == null ? PITCH.top : y0;
    for (var i = 0; i < segs; i++) {
      var nx = px + lean * sh * 0.35, ny = py + sh;
      list.push(o.rod([px, py, z], [nx, ny, z], 0.035 - i * 0.004, trunk, { radial: 6, tone: i % 2 ? 'shade' : 'base' }));
      px = nx; py = ny;
    }
    for (var k = 0; k < 5; k++) {
      var f = o.cone(0.05, fl, frond, { radial: 4, tone: k % 2 ? 'shade' : 'base', p: [0, fl / 2, 0] });   /* base at the crown */
      list.push(o.G.t(f, { s: [1, 1, 0.25], r: [0, k * 72 + 20, -112], p: [px, py, z] }));
    }
  }
  /* goal at g.x facing -x: posts, crossbar, back frame and a rope net
     (templates are instanced triangle meshes, so the net is thin ropes, not LineSegments) */
  function goalGeos(o, g, top, post, net, posts, ropes) {
    var zl = g.z - g.half, zr = g.z + g.half, xb = g.x + g.d, pr = g.pr || 0.022, fr = pr * 0.55, nr = 0.006;
    [zl, zr].forEach(function (z) {
      posts.push(o.tube(pr, pr, g.h, post, { radial: 8, p: [g.x, top + g.h / 2, z] }));
      if (!g.lite) {
        posts.push(o.rod([g.x, top + g.h, z], [xb, top + g.h * 0.6, z], fr, post, { radial: 5 }));
        posts.push(o.rod([xb, top + g.h * 0.6, z], [xb, top, z], fr, post, { radial: 5 }));
      }
    });
    posts.push(o.tube(pr, pr, g.half * 2 + pr * 2, post, { radial: 8, r: [90, 0, 0], p: [g.x, top + g.h, g.z] }));
    var i, z, t, n = g.ropes || 5, yb = g.lite ? g.h : g.h * 0.6;
    for (i = 1; i < n; i++) { z = zl + (zr - zl) * i / n; ropes.push(o.rod([xb, top, z], [xb, top + yb, z], nr, net, { radial: 3 })); }
    for (i = 1; i < 3; i++) { t = i / 3; ropes.push(o.rod([xb, top + yb * t, zl], [xb, top + yb * t, zr], nr, net, { radial: 3 })); }
    if (g.lite) { ropes.push(o.rod([g.x, top + g.h, g.z], [xb, top + yb, g.z], nr, net, { radial: 3 })); return; }
    posts.push(o.rod([xb, top + 0.01, zl], [xb, top + 0.01, zr], fr, post, { radial: 5 }));
    for (i = 1; i < n - 1; i++) { z = zl + (zr - zl) * i / (n - 1); ropes.push(o.rod([g.x, top + g.h, z], [xb, top + yb, z], nr, net, { radial: 3 })); }
    [zl, zr].forEach(function (zz) { ropes.push(o.rod([g.x, top + g.h * 0.5, zz], [xb, top + g.h * 0.3, zz], nr, net, { radial: 3 })); });
  }
  function lineBox(o, x0, z0, x1, z1, y, token, list) {
    var w = Math.abs(x1 - x0) + 0.03, d = Math.abs(z1 - z0) + 0.03;
    list.push(o.box(w, 0.006, d, token, { p: [(x0 + x1) / 2, y, (z0 + z1) / 2] }));
  }

  function buildPitch(ctx, S) {
    var K = ctx.K, o = ops(K), G = K.G, P = PITCH, st = ctx.st || {};
    var stadium = pick('stadium', st), ballId = pick('ball', st);
    var c = function (p) { return tok('att_pitch', p, st); };
    var body = [], detail = [], crowd = [], wands = [], lamps = [], top = P.top, F = P.field;
    /* grass base, lines, centre circle and both penalty boxes */
    body.push(G.paintBy(o.slab(2.84, top, 1.84, null, { p: [0, top / 2, 0] }), function (v) { return v.ny > 0.7 ? c('grass') : [c('grass'), 'shade']; }));
    var ly = top + 0.003, line = c('line');
    lineBox(o, F.x0, F.z0, F.x1, F.z0, ly, line, detail); lineBox(o, F.x0, F.z1, F.x1, F.z1, ly, line, detail);
    lineBox(o, F.x0, F.z0, F.x0, F.z1, ly, line, detail); lineBox(o, F.x1, F.z0, F.x1, F.z1, ly, line, detail);
    lineBox(o, 0, F.z0, 0, F.z1, ly, line, detail);
    detail.push(o.ring(0.18, 0.016, line, { s: [1, 1, 0.25], r: [90, 0, 0], p: [0, ly, P.goal.z] }));
    [-1, 1].forEach(function (s) {
      var xa = s * F.x1, xb = s * (F.x1 - 0.42), z0 = P.goal.z - 0.3, z1 = P.goal.z + 0.3;
      lineBox(o, xa, z0, xb, z0, ly, line, detail); lineBox(o, xa, z1, xb, z1, ly, line, detail); lineBox(o, xb, z0, xb, z1, ly, line, detail);
    });
    goalGeos(o, P.goal, top, c('post'), c('net'), detail, detail);
    /* the stand: 3 rounded tiers with lighter tops, the back wall in the stadium's sky */
    P.tiers.forEach(function (t, i) {
      var d = t.z1 - t.z0, tier = o.slab(P.standX * 2, P.tierH, d, null, { radius: 0.025, p: [0, t.y + P.tierH / 2, (t.z0 + t.z1) / 2] });
      body.push(G.paintBy(tier, function (v) { return v.ny > 0.7 ? [c('stand'), 'hi'] : i ? c('stand') : [c('stand'), 'shade']; }));
    });
    var wallY = P.tiers[2].y + P.tierH;
    if (stadium === 'stadium_beach') {
      body.push(o.box(P.standX * 2, 0.05, 0.04, tok(stadium, 'sea', {}), { p: [0, wallY + 0.025, -0.9] }));
      body.push(o.box(P.standX * 2, 0.05, 0.04, c('sky'), { p: [0, wallY + 0.075, -0.9] }));
    } else body.push(o.box(P.standX * 2, 0.1, 0.04, c('sky'), { p: [0, wallY + 0.05, -0.9] }));
    /* the crowd: fan blobs on the tiers, each holding a light-stick wand */
    var budget = root.SLTier && root.SLTier.BUDGETS && root.SLTier.BUDGETS[K.tier];
    var cap = Math.min(40, budget && budget.crowd ? budget.crowd : 40);
    var fanToks = [c('fanA'), c('fanB'), c('fanC'), c('fanD')], borrowed = borrowedFans(K, S);
    crowdLayout(cap).forEach(function (f, i) {
      crowd.push(fanGeo(o, borrowed, i, fanToks[f.fan], f.x, f.y, f.z, P.fanH));
      wandGeos(o, f, 1, wands);
    });
    /* the selected ball on the penalty spot */
    var bg = ballGeos(K, ballId, P.ballR, false), bpos = [P.spot.x, top + P.ballR, P.spot.z];
    var ball = bg.toon.concat(bg.gold).map(function (g) { return G.t(g, { p: bpos }); });
    /* stadium dressing */
    stadiumDressing(o, stadium, body, detail, lamps, false);

    var night = stadium === 'stadium_night';
    var tc = withBudget(ctx, budgetOf('att_pitch', 4000) + ((ctx.look && ctx.look.crowdTris) || 2000));
    var t = K.template(tc)
      .pivot('crowd', [0, P.tiers[0].y + P.tierH, -0.7])
      .pivot('wands', [0, P.tiers[1].y + P.tierH, -0.7], 'crowd')
      .pivot('ball', bpos)
      .part('body', body, 'toon', { castShadow: true, outline: true })
      .part('detail', detail, 'toon', { castShadow: true })
      .part('crowd', crowd, 'toon', { pivot: 'crowd' })
      .part('wands', wands, 'state', { pivot: 'wands', stateColor: { key: 'wands', off: night ? X.white : X.wandOff, on: X.white, initial: 0 } })
      .part('ball', ball, bg.gold.length ? 'gold' : 'toon', { pivot: 'ball' });
    if (lamps.length) t.part('lamps', lamps, 'neon:' + tok('stadium_night', 'flood', {}), {});
    return t.anchor('spot', [P.spot.x, top, P.spot.z]).done();
  }
  /* day pennants, night floodlights, beach palms + sand + sea, snow banks */
  function stadiumDressing(o, stadium, body, detail, lamps, mini) {
    var P = PITCH, top = mini ? MINI_TOP : P.top;
    if (stadium === 'stadium_night') {
      (mini ? [[-0.36, -0.33], [0.36, -0.33]] : P.towers).forEach(function (q) {
        floodlight(o, 'stadium_night', q[0], q[1], mini ? 0.36 : 0.6, body, lamps, mini ? 0.6 : 1, top);
      });
    } else if (stadium === 'stadium_beach') {
      var sand = tok(stadium, 'sand', {});
      if (mini) palmGeos(o, stadium, -0.34, 0.28, 0.26, 1, body, top);
      else {
        P.palms.forEach(function (q) { palmGeos(o, stadium, q[0], q[1], 0.42, q[2], body, top); });
        detail.push(o.box(2.8, 0.004, 0.05, sand, { p: [0, top + 0.002, 0.895] }));
        [-1, 1].forEach(function (s) { detail.push(o.box(0.05, 0.004, 1.3, sand, { p: [s * 1.395, top + 0.002, 0.23] })); });
      }
    } else if (stadium === 'stadium_snow') {
      var snow = tok(stadium, 'snow', {});
      (mini ? [[-0.3, 0.34, 0.06], [0.3, 0.35, 0.055]] : P.banks).forEach(function (b) {
        body.push(o.puff(b[2], snow, { s: [1.4, 0.5, 1], p: [b[0], top + b[2] * 0.15, b[1]] }));
      });
      var wy = mini ? MINI_WALL : P.tiers[2].y + P.tierH + 0.1;
      body.push(o.box(mini ? 0.84 : P.standX * 2, 0.02, mini ? 0.06 : 0.05, snow, { p: [0, wy + 0.01, mini ? -0.335 : -0.9] }));
    } else {
      /* day: pastel bunting — on two poles above the crowd (pitch) or along the wall top (mini);
         thin, so it goes in the part without an ink hull */
      var n = mini ? 5 : 11, xe = mini ? 0.35 : P.standX + 0.07, yTop = mini ? MINI_WALL - 0.01 : 0.62, sag = mini ? 0 : 0.05, pz = mini ? -0.3 : -0.88;
      if (!mini) {
        [-1, 1].forEach(function (s) { detail.push(o.tube(0.014, 0.014, yTop - top, X.pole, { radial: 6, p: [s * xe, (yTop + top) / 2, pz] })); });
        detail.push(o.rod([-xe, yTop, pz], [0, yTop - sag, pz], 0.006, X.ink, { radial: 4 }));
        detail.push(o.rod([0, yTop - sag, pz], [xe, yTop, pz], 0.006, X.ink, { radial: 4 }));
      }
      for (var i = 1; i < n + (mini ? 1 : 0); i++) {
        var u = mini ? (i - 1) / (n - 1) : i / n, px = -xe + 2 * xe * u, py = yTop - sag * (1 - Math.abs(2 * u - 1));
        detail.push(o.cone(0.035, 0.07, X.pennants[i % 4], { radial: 3, s: [1, 1, 0.35], r: [180, 0, 0], p: [px, py - 0.035, pz] }));
      }
    }
  }
  var MINI_TOP = 0.05, MINI_WALL = 0.28;
  function buildMiniStadium(ctx, stadium) {
    var K = ctx.K, o = ops(K), G = K.G, top = MINI_TOP;
    var c = function (p) { return tok(stadium, p, {}); }, pc = function (p) { return tok('att_pitch', p, { stadium: stadium }); };
    var body = [], crowd = [], wands = [], lamps = [];
    body.push(G.paintBy(o.slab(0.84, top, 0.62, null, { p: [0, top / 2, 0.08] }), function (v) { return v.ny > 0.7 ? c('grass') : [c('grass'), 'shade']; }));
    /* back wall in the sky colour and a one-tier stand */
    if (stadium === 'stadium_beach') {
      body.push(o.box(0.84, MINI_WALL / 2, 0.05, c('sea'), { p: [0, MINI_WALL / 4, -0.335] }));
      body.push(o.box(0.84, MINI_WALL / 2, 0.05, c('sky'), { p: [0, MINI_WALL * 0.75, -0.335] }));
    } else body.push(o.box(0.84, MINI_WALL, 0.05, c('sky'), { p: [0, MINI_WALL / 2, -0.335] }));
    body.push(o.box(0.84, 0.1, 0.14, pc('stand'), { p: [0, 0.05, -0.24] }));
    /* lines: border + halfway */
    var ly = top + 0.003, line = pc('line'), x0 = -0.38, x1 = 0.38, z0 = -0.14, z1 = 0.36;
    lineBox(o, x0, z0, x1, z0, ly, line, body); lineBox(o, x0, z1, x1, z1, ly, line, body);
    lineBox(o, x0, z0, x0, z1, ly, line, body); lineBox(o, x1, z0, x1, z1, ly, line, body);
    lineBox(o, 0, z0, 0, z1, ly, line, body);
    /* a small goal at the right end, rope net */
    goalGeos(o, { x: 0.33, z: 0.11, half: 0.12, h: 0.13, d: 0.06, pr: 0.013, ropes: 4, lite: true }, top, pc('post'), pc('net'), body, body);
    /* seven fans with wands on the stand */
    var fanToks = [pc('fanA'), pc('fanB'), pc('fanC'), pc('fanD')];
    for (var i = 0; i < 7; i++) {
      var f = { x: -0.33 + i * 0.11, y: 0.1, z: -0.22, fan: i % 4, wand: (i * 3) % 4, lean: (i % 3) - 1 };
      crowd.push(fanGeo(o, null, i, fanToks[f.fan], f.x, f.y, f.z, 0.08));
      wandGeos(o, f, 0.7, wands);
    }
    /* the classic ball on the spot */
    var bg = ballGeos(K, 'ball_classic', 0.035, false);
    bg.toon.forEach(function (g) { body.push(G.t(g, { p: [0.15, top + 0.035, 0.11] })); });
    stadiumDressing(o, stadium, body, body, lamps, true);
    var t = K.template(ctx)
      .part('body', body, 'toon', { castShadow: true })
      .part('crowd', crowd, 'toon', {})
      .part('wands', wands, 'state', { stateColor: { key: 'wands', off: stadium === 'stadium_night' ? X.white : X.wandOff, on: X.white, initial: 0 } });
    if (lamps.length) t.part('lamps', lamps, 'neon:' + c('flood'), {});
    return t.anchor('spot', [0.15, top, 0.11]).done();
  }

  /* ================================================================
     KARTS, THE GARAGE AND BALL PREVIEWS
     ================================================================ */
  function kartGeos(K, id) {
    var o = ops(K), G = K.G, c = function (p) { return tok(id, p, {}); };
    var g = { body: [], wheelF: [], wheelB: [], trim: [], glow: [], gold: [] };
    var isGold = id === 'kart_gold', shell = isGold ? g.gold : g.body, bodyTok = c('body');
    /* rounded chassis, a bean nose (a stretched puff: a capsule costs 3× the triangles), seat bolster */
    shell.push(o.slab(0.4, 0.12, 0.66, bodyTok, { p: [0, 0.16, -0.02] }));
    shell.push(o.puff(0.078, bodyTok, { sphere: true, s: [1, 1, 1.9], p: [0, 0.155, 0.3] }));
    g.body.push(o.tube(0.06, 0.06, 0.26, bodyTok, { radial: 10, tone: 'shade', r: [0, 0, 90], p: [0, 0.28, -0.22] }));
    /* steering column and wheel (torus) */
    g.body.push(o.rod([0, 0.2, 0.16], [0, 0.28, 0.08], 0.012, c('wheel'), { radial: 6 }));
    g.body.push(o.ring(0.055, 0.012, c('wheel'), { r: [-62, 0, 0], p: [0, 0.285, 0.075] }));
    /* spoiler: an elliptical wing on two struts */
    shell.push(o.tube(0.06, 0.06, 0.46, bodyTok, { radial: 10, s: [0.3, 1, 1], r: [0, 0, 90], p: [0, 0.37, -0.39] }));
    [-1, 1].forEach(function (s) { g.body.push(o.rod([s * 0.12, 0.21, -0.33], [s * 0.12, 0.36, -0.38], 0.012, bodyTok, { radial: 6, tone: 'shade' })); });
    /* 4 fat ink wheels with Pebble hubs, on the two axle pivots */
    [[KART.axleF, g.wheelF], [KART.axleB, g.wheelB]].forEach(function (ax) {
      [-1, 1].forEach(function (s) {
        var p = [s * KART.wheelX, ax[0][1], ax[0][2]];
        ax[1].push(o.tube(KART.wheelR, KART.wheelR, 0.08, c('wheel'), { radial: 12, r: [0, 0, 90], p: p }));
        ax[1].push(o.tube(0.05, 0.05, 0.084, c('hub'), { radial: 8, r: [0, 0, 90], p: p }));
      });
    });
    /* chrome bumper + exhausts, neon under-glow strip */
    g.trim.push(o.tube(0.02, 0.02, 0.36, c('trim'), { radial: 8, r: [0, 0, 90], p: [0, 0.1, 0.39] }));
    [-1, 1].forEach(function (s) { g.trim.push(o.tube(0.022, 0.022, 0.1, c('trim'), { radial: 8, r: [90, 0, 0], p: [s * 0.08, 0.14, -0.39] })); });
    g.glow.push(o.box(0.44, 0.012, 0.54, X.white, { p: [0, 0.095, -0.02] }));
    /* per-kart decals */
    if (id === 'kart_blue') {
      [-1, 1].forEach(function (s) {
        g.body.push(o.box(0.035, 0.008, 0.58, c('stripe'), { p: [s * 0.08, 0.222, -0.03] }));
        g.body.push(o.cone(0.06, 0.13, c('fin'), { radial: 3, s: [0.3, 1, 1], r: [-55, 0, 0], p: [s * 0.19, 0.23, -0.3] }));
      });
    } else if (id === 'kart_lime') {
      /* gold lightning bolts on both sides and one across the deck */
      var bolt = function (map) {
        var pts = BOLT.map(map);
        for (var i = 0; i < pts.length - 1; i++) g.body.push(o.rod(pts[i], pts[i + 1], 0.011, c('bolt'), { radial: 4 }));
      };
      [-1, 1].forEach(function (s) { bolt(function (b) { return [s * 0.203, 0.16 + b[1] * 0.1, -0.02 + b[0] * 0.5]; }); });
      bolt(function (b) { return [b[0] * 0.4, 0.224, -0.05 + b[1] * 0.3]; });
    } else if (id === 'kart_unicorn') {
      g.gold.push(o.cone(0.03, 0.15, c('horn'), { radial: 8, r: [35, 0, 0], p: [0, 0.27, 0.33] }));
      ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'].forEach(function (m, i) {
        g.body.push(o.cone(0.03, 0.1, c(m), { radial: 6, r: [-62, 0, 0], p: [-0.2 + i * 0.08, 0.4, -0.4] }));
      });
    } else if (isGold) {
      [-1, 1].forEach(function (s) { g.body.push(o.star(0.05, 0.025, c('star'), { r: [0, s * 90, 0], p: [s * 0.203, 0.165, -0.02] })); });
    }
    return g;
  }
  function buildKart(ctx, id) {
    var K = ctx.K, g = kartGeos(K, id);
    var t = K.template(ctx)
      .pivot('seat', KART.seat)
      .pivot('steer', KART.axleF)
      .pivot('wheelF', KART.axleF, 'steer')
      .pivot('wheelB', KART.axleB)
      .part('body', g.body, 'toon', { castShadow: true })
      .part('wheelF', g.wheelF, 'toon', { pivot: 'wheelF' })
      .part('wheelB', g.wheelB, 'toon', { pivot: 'wheelB' })
      .part('trim', g.trim, 'chrome', { castShadow: true })
      .part('glow', g.glow, 'neon:' + tok(id, 'glow', {}), {});
    if (g.gold.length) t.part('gold', g.gold, 'gold', { castShadow: true });
    return t.anchor('seat', KART.seat).anchor('nose', KART.nose).anchor('exhaust', KART.exhaust).done();
  }
  /* the pit garage: a crisp box under a cantilevered roof whose fascia carries the checker band */
  var GARAGE = { body: [1.7, 1.0, 1.1], bodyZ: -0.36, roof: [1.84, 0.14, 1.34], door: [1.0, 0.76], jamb: 0.06, sign: [0.4, 0.27, 0.04], signZ: 0.27 };
  GARAGE.front = GARAGE.bodyZ + GARAGE.body[2] / 2;
  GARAGE.roofZ = GARAGE.bodyZ - GARAGE.body[2] / 2 + GARAGE.roof[2] / 2;
  GARAGE.roofFront = GARAGE.roofZ + GARAGE.roof[2] / 2;
  function buildGarage(ctx) {
    var K = ctx.K, o = ops(K), G = K.G, st = ctx.st || {}, kartId = pick('kart', st), Gr = GARAGE;
    var c = function (p) { return tok('att_kart', p, st); };
    var body = [], sign = [], zf = Gr.front, garage = c('garage'), top = Gr.body[1], R = Gr.roof;
    /* the body: a crisp graphite box, its front face a touch lighter */
    body.push(G.paintBy(G.t(G.slab(Gr.body[0], Gr.body[1], Gr.body[2], { arch: true }), { p: [0, top / 2, Gr.bodyZ] }), function (v) {
      return v.nz > 0.5 ? garage : v.nx > 0.5 ? [garage, 'shade'] : [garage, 'hi'];
    }));
    /* the cantilevered roof: lit on top, shaded underneath */
    body.push(o.crisp(R[0], R[1], R[2], garage, { p: [0, top + R[1] / 2, Gr.roofZ] }));
    /* the roller door in a frame (two jambs and a lintel), its slats */
    var dw = Gr.door[0], dh = Gr.door[1], j = Gr.jamb;
    body.push(o.box(dw, dh, 0.03, c('door'), { p: [0, dh / 2, zf + 0.008] }));
    for (var i = 0; i < 5; i++) body.push(o.box(dw - 0.04, 0.022, 0.012, c('slat'), { p: [0, 0.12 + i * 0.13, zf + 0.028] }));
    [-1, 1].forEach(function (s) { body.push(o.crisp(j, dh + j, j, garage, { p: [s * (dw + j) / 2, (dh + j) / 2, zf + j / 2] })); });
    body.push(o.crisp(dw + 2 * j, j, j, garage, { p: [0, dh + j / 2, zf + j / 2] }));
    /* the checkered band: 16 quads (8 × 2) across the roof fascia */
    var qw = (R[0] - 0.24) / 8, qh = (R[1] - 0.03) / 2;
    checkerLayout(8, 2).forEach(function (q) {
      body.push(o.box(qw, qh, 0.012, q.dark ? c('checkA') : c('checkB'), { p: [-4 * qw + qw / 2 + q.c * qw, top + R[1] - 0.015 - qh / 2 - q.r * qh, Gr.roofFront + 0.006] }));
    });
    /* the Laser Lime LED bolt on a Midnight Ink board standing on the roof edge: a neon core and
       the additive glow sleeve the kit fades in at Showtime (opacity 0 by day) */
    var S = Gr.sign, sy = top + R[1] + S[1] / 2;
    body.push(o.crisp(S[0], S[1], S[2], c('checkA'), { p: [0, sy, Gr.signZ] }));
    body.push(o.crisp(0.05, 0.05, 0.08, garage, { p: [0, top + R[1] + 0.025, Gr.signZ - 0.05] }));
    var sleeve = [];
    for (var b = 0; b < BOLT.length - 1; b++) {
      var p0 = BOLT[b], p1 = BOLT[b + 1], zs = Gr.signZ + S[2] / 2 + 0.012;
      var seg = [[p0[0] * 0.5, sy + p0[1] * 0.2, zs], [p1[0] * 0.5, sy + p1[1] * 0.2, zs]];
      sign.push(G.ribbon(seg, 0.022, { segments: 1 }));
      sleeve.push(G.ribbon(seg, 0.055, { segments: 1 }));
    }
    /* pit dressing: a tool chest by the door, tyre stacks at the front corners */
    body.push(o.crisp(0.24, 0.3, 0.16, c('slat'), { p: [-0.68, 0.15, zf + 0.12] }));
    [0.1, 0.2].forEach(function (y) { body.push(o.box(0.2, 0.01, 0.005, c('checkA'), { p: [-0.68, y, zf + 0.202] })); });
    [[-0.74, 0.045, 0.6], [-0.74, 0.135, 0.6], [0.76, 0.045, 0.36]].forEach(function (t) {
      body.push(o.ring(0.11, 0.045, c('tyre'), { r: [90, 0, 0], p: t }));
    });
    /* the parked half-scale kart (its tiny chrome trim rides in the toon part, already
       painted in the Chrome token, which leaves room for the sign's glow sleeve) */
    var kg = kartGeos(K, kartId), tr = { s: PARKED.s, r: [0, PARKED.yaw, 0], p: [PARKED.x, 0, PARKED.z] };
    var place = function (list) { return list.map(function (geo) { return G.t(geo, tr); }); };
    var t = K.template(ctx)
      .pivot('kart', [PARKED.x, 0, PARKED.z])
      .part('body', body, 'toon', { castShadow: true, outline: true })
      .part('sign', sign, 'neon:' + c('sign'), {})
      .part('signGlow', sleeve, 'glow:' + c('sign'), {})
      .part('kart', place(kg.body.concat(kg.wheelF, kg.wheelB, kg.trim)), 'toon', { pivot: 'kart' })
      .part('kartGlow', place(kg.glow), 'neon:' + tok(kartId, 'glow', {}), { pivot: 'kart' });
    if (kg.gold.length) t.part('kartGold', place(kg.gold), 'gold', { pivot: 'kart' });
    return t.anchor('spot', [-0.3, 0, 0.62]).anchor('seat', parkedPoint(KART.seat)).anchor('exhaust', parkedPoint(KART.exhaust)).done();
  }
  /* a ball on a display riser (previews) or bare (stateKey 'bare': games) */
  function buildBall(ctx, id) {
    var K = ctx.K, o = ops(K), r = 0.11, bare = ctx.stateKey === 'bare', y = bare ? r : 0.05 + r;
    var bg = ballGeos(K, id, r, true), place = function (g) { return K.G.t(g, { p: [0, y, 0] }); };
    var t = K.template(ctx).pivot('ball', [0, y, 0]);
    if (bg.toon.length) t.part('ball', bg.toon.map(place), 'toon', { pivot: 'ball' });
    if (bg.gold.length) t.part('ballGold', bg.gold.map(place), 'gold', { pivot: 'ball' });
    if (!bare) {
      t.part('riser', [o.tube(0.16, 0.18, 0.05, X.riser, { radial: 12, p: [0, 0.025, 0] })], 'toon', { castShadow: true });
      t.part('riserRing', [o.tube(0.182, 0.182, 0.012, X.white, { radial: 12, open: true, p: [0, 0.038, 0] })], 'neon:' + X.riserRing, {});
    }
    return t.anchor('spot', [0, bare ? 0 : 0.05, 0]).anchor('ball', [0, y, 0]).done();
  }

  /* ================================================================
     TRACK DIORAMAS (track_*)
     ================================================================ */
  function buildTrack(ctx, id) {
    var K = ctx.K, o = ops(K), G = K.G, T = TRACK, c = function (p) { return tok(id, p, {}); };
    var body = [], deco = [];
    var rim = id === 'track_volcano' ? c('skyA') : c('sea');
    body.push(o.tube(0.425, 0.425, 0.04, rim, { radial: 24, p: [0, 0.02, 0] }));
    if (id === 'track_volcano') body.push(o.tube(0.428, 0.428, 0.012, c('skyB'), { radial: 24, open: true, p: [0, 0.006, 0] }));
    body.push(o.tube(0.38, 0.4, 0.05, c('grass'), { radial: 24, p: [0, 0.065, 0] }));
    /* the road: a flattened oval torus, kerb stripes on its outer edge */
    var road = G.ring(T.R, T.r), asph = c('asphalt'), ka = c('kerbA'), kb = c('kerbB');
    G.paintBy(road, function (v) {
      var rho = Math.sqrt(v.x * v.x + v.y * v.y) - T.R;
      if (rho > T.r * 0.45) return Math.floor((Math.atan2(v.y, v.x) + Math.PI) / (TAU / T.kerbs)) % 2 ? kb : ka;
      return rho < -T.r * 0.45 ? [asph, 'shade'] : asph;
    }, { perFace: true });
    body.push(G.t(road, { s: [T.sx, T.sz, T.flat], r: [90, 0, 0], p: [0, T.y, 0] }));
    var yTop = T.y + T.r * T.flat + 0.002, op = {};
    for (var i = 0; i < T.dashes; i++) {
      if (i === T.dashes / 4) continue;            /* φ = 90°: the start line sits here */
      ovalPoint(i * TAU / T.dashes, op);
      deco.push(o.box(0.045, 0.004, 0.012, c('line'), { r: [0, op.yaw, 0], p: [op.x, yTop, op.z] }));
    }
    /* a chequered start line across the road at the front (the road runs along x there) */
    ovalPoint(Math.PI / 2, op);
    for (var k = 0; k < 4; k++) {
      deco.push(o.box(0.03, 0.004, 0.022, k % 2 ? c('line') : X.ink, { p: [op.x, yTop + 0.001, op.z - 0.033 + k * 0.022] }));
    }
    if (id === 'track_volcano') {
      /* a cute volcano in the infield: lava rim and two lilac smoke puffs, never erupting */
      deco.push(o.tube(0.035, 0.13, 0.18, c('cone'), { radial: 12, p: [0, 0.09 + 0.09, 0] }));
      deco.push(o.ring(0.033, 0.012, c('lava'), { r: [90, 0, 0], p: [0, 0.27, 0] }));
      deco.push(o.tube(0.03, 0.03, 0.006, c('lava'), { radial: 8, tone: 'hi', p: [0, 0.268, 0] }));
      deco.push(o.puff(0.045, c('smoke'), { p: [0.02, 0.33, 0] }));
      deco.push(o.puff(0.035, c('smoke'), { tone: 'hi', p: [-0.03, 0.4, 0.01] }));
    } else if (id === 'track_beach') {
      /* a striped beach hut at the back and an umbrella at the front */
      for (var s = 0; s < 3; s++) deco.push(o.box(0.035, 0.09, 0.08, s % 2 ? c('hutB') : c('hutA'), { p: [-0.1 + (s - 1) * 0.035, 0.09 + 0.045, -0.33] }));
      deco.push(o.cone(0.085, 0.06, c('hutA'), { radial: 4, r: [0, 45, 0], p: [-0.1, 0.21, -0.33] }));
      deco.push(o.tube(0.006, 0.006, 0.16, X.ink, { radial: 5, p: [0.14, 0.09 + 0.08, 0.33] }));
      deco.push(o.cone(0.08, 0.04, c('umbrella'), { radial: 8, r: [0, 0, 8], p: [0.14, 0.27, 0.33] }));
    } else {
      /* the island loop: two palms, sea all around */
      palmGeos(o, 'track_loop', 0.02, 0, 0.3, 1, deco, 0.09);
      palmGeos(o, 'track_loop', -0.05, -0.31, 0.22, -1, deco, 0.09);
    }
    return K.template(ctx)
      .part('body', body, 'toon', { castShadow: true })
      .part('deco', deco, 'toon', { castShadow: true })
      .anchor('spot', [0, yTop, 0])
      .done();
  }

  /* ================================================================
     ANIMATION HANDLERS (documented handle `a`; no allocation per frame)
     ================================================================ */
  var M = null;                                 /* SLMotion, bound when the factory runs */
  var R3 = [0, 0, 0], P3 = [0, 0, 0];
  function pose(a, name, rx, ry, rz, px, py, pz, s) {
    if (!a || typeof a.pivot !== 'function') return;
    var p = a.pivot(name);
    if (!p || typeof p.set !== 'function') return;
    R3[0] = rx; R3[1] = ry; R3[2] = rz; P3[0] = px; P3[1] = py; P3[2] = pz;
    p.set(R3, P3, s == null ? 1 : s);
  }
  function setState(a, key, value) { if (a && typeof a.state === 'function') a.state(key, value); }
  var memo = Object.create(null);
  function mem(a) {
    var k = a && a.uid != null ? a.uid : '_';
    return memo[k] || (memo[k] = { spin: 0, cheer: 0, a: '', b: '', w: -1, tw: -1 });
  }
  /* the motion timelines run on a.t; acts add on top through the memo */
  var CH = {}, CP = {};
  function courseBulbs(a, m, k) {
    var t = a.t || 0;
    chaseState(t, a.bpm, k, !!a.reduced, CH);
    /* re-send every 0.5 s too: a restyle swaps the batch and resets its instance colours */
    var stale = !(t - m.tw < 0.5 && t >= m.tw);
    if (CH.a !== m.a || stale) { m.a = CH.a; setState(a, 'bulbA', CH.a); }
    if (CH.b !== m.b || stale) { m.b = CH.b; setState(a, 'bulbB', CH.b); }
    if (stale) m.tw = t;
  }
  /* a handle that knows the child's member colour (a.member '#hex' or a.user.color) sets the underline */
  var memberSeen = null;
  function memberFrom(a) {
    var h = a && (typeof a.member === 'string' ? a.member : a.user && typeof a.user.color === 'string' ? a.user.color : null);
    if (h && h !== memberSeen) { memberSeen = h; setMember(h); }
  }
  function courseIdle(a) {
    if (!a) return false;
    var m = mem(a), red = !!a.reduced, base = M ? M.spin(a.t || 0, 0.25, a.phase || 0, red) : 0;
    pose(a, 'spin', 0, base + m.spin, 0, 0, 0, 0, 1);
    pose(a, 'spin2', 0, 45 - base - m.spin, 0, 0, 0, 0, 1);
    courseBulbs(a, m, a.show || 0);
    memberFrom(a);
    return !red;
  }
  function courseShow(a, k) { if (a) { var m = mem(a); m.tw = -1; courseBulbs(a, m, k); memberFrom(a); } }
  function pitchWands(a, m, k) {
    var v = k > 1 ? 1 : k > 0 ? k : 0, t = a.t || 0;
    if (Math.abs(v - m.w) > 0.02 || !(t - m.tw < 0.5 && t >= m.tw)) { m.w = v; m.tw = t; setState(a, 'wands', v); }
  }
  function pitchIdle(a) {
    if (!a) return false;
    var m = mem(a), red = !!a.reduced;
    crowdPose(a.t, a.bpm, a.show || 0, red, a.phase, CP);
    pose(a, 'crowd', 0, 0, 0, 0, CP.cy + 0.03 * m.cheer, 0, 1);
    pose(a, 'wands', 0, 0, 0, CP.wx, CP.wy, 0, 1);
    pitchWands(a, m, a.show || 0);
    return !red;
  }
  function pitchShow(a, k) { if (a) { var m = mem(a); m.tw = -1; pitchWands(a, m, k); } }

  /* one SLMotion act: samples the timeline, applies it, fires its cues (sfx + emits) */
  function timeline(a, name, apply, done, where) {
    if (!M || !M.ACTS || !M.ACTS[name]) return null;
    var o = { reduced: !!(a && a.reduced) }, dur = M.durOf(name, o), cues = M.cues(name, o), ci = 0, out = {}, ended = false;
    function end(h) { if (!ended) { ended = true; done(h || a); } }
    return {
      dur: dur,
      update: function (h, t) {
        if (ended) return false;
        h = h || a; t = t > 0 ? t : 0;
        M.sample(name, t < dur ? t : dur, out, o);
        apply(h, out, t);
        while (ci < cues.length && cues[ci].t <= t) fire(h, cues[ci++], where);
        if (t >= dur) { end(h); return false; }
        return true;
      },
      cancel: function () { end(a); }
    };
  }
  function fire(h, c, where) {
    try {
      if (c.sfx && typeof h.sfx === 'function') h.sfx(c.sfx, c.vol == null ? 1 : c.vol, c.step);
      if (c.emit && typeof h.emit === 'function') h.emit(c.emit, where, c.n || 1);
    } catch (e) { /* a missing sound or particle never breaks the act */ }
  }
  /* gate: the stars whirl two extra turns ('launch'; the controller pushes the camera in) */
  function courseAct(a) {
    var m = mem(a);
    return timeline(a, 'launch', function (h, out) { m.spin = out.spinDeg || 0; courseIdle(h); },
      function (h) { m.spin = 0; courseIdle(h); }, 'banner');
  }
  /* pitch: the ball hops and rolls, the crowd jumps up and cheers */
  function pitchAct(a) {
    var m = mem(a);
    return timeline(a, 'launch', function (h, out, t) {
      pose(h, 'ball', 0, 0, -(out.spinDeg || 0) * 0.5, 0, (out.hop || 0) * 0.6, 0, 1);
      m.cheer = t > 0 && t < 0.6 ? Math.sin(Math.PI * t / 0.6) : 0;
      pitchIdle(h);
    }, function (h) { pose(h, 'ball', 0, 0, 0, 0, 0, 0, 1); m.cheer = 0; pitchIdle(h); }, 'spot');
  }
  /* garage: the parked kart revs with a 3 Hz wobble and two pastel exhaust puffs */
  function kartAct(a) {
    return timeline(a, 'kartRev', function (h, out, t) {
      pose(h, 'kart', 0, 0, out.wobble || 0, 0, 0.01 * Math.abs(Math.sin(Math.PI * 6 * t)) * (1 - (out.k || 0)), 0, 1);
    }, function (h) { pose(h, 'kart', 0, 0, 0, 0, 0, 0, 1); }, parkedPoint(KART.exhaust));
  }

  /* ================================================================
     REGISTRATION
     ================================================================ */
  function models(K, S) {
    M = root.SLMotion || M;
    /* start fetching the display font now, so the sign atlas is usually drawn in it first time */
    try { if (K && K.tex && K.tex.fontReady) K.tex.fontReady('800 48px "Unbounded"', 4000); } catch (e) {}
    var material = function (matKey, part) { return part && part.name === 'text' && K ? bannerMaterial(K) : null; };
    /* the child's member colour for the PET COURSE underline (the controller's mount / setUser) */
    var setUser = function (u) { return !!(u && setMember(u.color)); };
    var out = {};
    out.att_course = {
      build: function (ctx) { return buildCourse(ctx, pick('course', ctx.st)); },
      idle: courseIdle, show: courseShow, act: courseAct, material: material, setUser: setUser, setMember: setMember
    };
    IDS.courses.forEach(function (id) {
      out[id] = { build: function (ctx) { return buildCourse(ctx, id); }, idle: courseIdle, show: courseShow, material: material, setUser: setUser, setMember: setMember };
    });
    out.att_pitch = { build: function (ctx) { return buildPitch(ctx, S); }, idle: pitchIdle, show: pitchShow, act: pitchAct };
    out.att_kart = { build: buildGarage, act: kartAct };
    IDS.karts.forEach(function (id) { out[id] = { build: function (ctx) { return buildKart(ctx, id); } }; });
    IDS.balls.forEach(function (id) { out[id] = { build: function (ctx) { return buildBall(ctx, id); } }; });
    IDS.stadiums.forEach(function (id) { out[id] = { build: function (ctx) { return buildMiniStadium(ctx, id); } }; });
    IDS.tracks.forEach(function (id) { out[id] = { build: function (ctx) { return buildTrack(ctx, id); } }; });
    return out;
  }
  /* SL3D.makeBall(ballId, tier) → Object3D: the bare ball (base y = 0, centre (0, 0.11, 0),
     pivot 'ball' at the centre) for the penalty game; null before 3D is ready */
  function makeBallApi(K0, S) {
    return function makeBall(id, tier) {
      if (!S || !S.ready) return null;
      var t = (root.SLTier && root.SLTier.parseTier(tier)) || S.tier, K = S.kit(t);
      if (IDS.balls.indexOf(id) < 0) id = SLOT_DEFAULTS.ball;
      var obj = K.instantiate(K.templates.get(id, 'bare', t, {}), { outlines: false });
      obj.userData.model = S.models[id] || null;
      return obj;
    };
  }

  return {
    IDS: IDS, ALL_IDS: ALL_IDS, COLORS: COLORS, X: X, SLOT_DEFAULTS: SLOT_DEFAULTS,
    ARCH: ARCH, PITCH: PITCH, KART: KART, PARKED: PARKED, GARAGE: GARAGE, TRACK: TRACK, BOLT: BOLT, ICO_DIRS: ICO_DIRS, MAX_BPM: MAX_BPM,
    pick: pick, slotToken: slotToken, tok: tok, arcMap: arcMap, bulbLayout: bulbLayout, chaseState: chaseState,
    crowdLayout: crowdLayout, crowdPose: crowdPose, checkerLayout: checkerLayout, parkedPoint: parkedPoint,
    nearIco: nearIco, rainbowBand: rainbowBand, alignY: alignY, ovalPoint: ovalPoint,
    /* registration factories (need K; used by stage.js, and by QA harnesses) */
    models: models, makeBallApi: makeBallApi
  };
}));
