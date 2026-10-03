/* ================================================================
   My Island 3D — the look table (pure data; no DOM, no THREE).
   Loaded in the browser as window.SLIslandLook (after world-core.js and
   world-art.js) and in Node tests via require(). The 3D builders, the
   photocard renderer and the 2D shop (shine levels) all read from here,
   so the 2D fallback and the 3D island always agree on colour.
   Source: docs/island3d/art-bible.json (v1) + art-bible.v2.json (Encore City)
   + island-architecture.json.

   API (frozen contract — A1 owns it; other chunks request changes):
     LOOK_VERSION                 bump on ANY visual change (photocard cache key) — 2 = Encore City
     PALETTE  {name: '#RRGGBB'}   every v1 art-bible palette token (unchanged)
     PALETTE_V2 {name: hex}       the v2 tokens (art-bible.v2.json); names unique across all tables
     LOCKED   {WALL, DOOR, ROOF, PETCOL, KARTS, BALLS, STADIA, THEME, THEMES, TRACKS}
                                  verbatim copies of the 2D/game colours (test-enforced)
     ART2D    {name: hex}         per-item colours the bible takes from world-art.js
     EXTRA    {name: hex}         the few v1 3D-only colours (lights, matcaps, Showtime sea)
     LOOK     {id: entry}         all 104 CATALOG ids (schema below); every table is deep-frozen
     CHARACTERS {avatar, wand, fanBlob}   non-catalogue models (may use '@member' = u.color;
                                  MEMBER_FALLBACK when the member colour is missing)
     DUSK, SHOW                   golden hour (the default, k = 0) and Showtime (k = 1) presets;
                                  DAY (v1 pastel day) and SHOW_V1 stay exported for scenes that copied them
     PRESET_KEYS, PRESET_COLOR_KEYS
     presetAt(k, memberHex)       DUSK→SHOW mix for k in 0..1 (hex colours + numbers)
     presetV1At(k, memberHex)     the v1 DAY→SHOW_V1 mix (kept for the games' own light arcs)
     TEMPO                        BPMs (day 100, show 118, …), idle periods, beatSec/barSec/loopSec
     FX, MATERIAL, MATCAPS, EDIT, CONES, BUDGET   caps, material constants, overlay colours, budgets
     SHINE_BANDS, SHINE_NAMES, SLOT_DEFAULTS (= SLWorldCore.DEFAULTS), MAX_FLASH_HZ (2),
     LED_CHASE_HZ (1.5: full-contrast chases), SIGN_WORDS (the only words drawn into textures)
     KINDS, ORGANIC_KINDS, OUTLINE_KINDS, PLACED_KINDS, ACT_PIVOT, LAUNCH_PIVOT, PET_BONES, PET_SOCKETS
     NEON3, NEON4                 the neon colour sets (v2 tokens)
     HOUSE_H, HOUSE_TRIS          per-shape heights (by roof) and triangle budgets
     VARIANTS, BUILDING_TRIMS     trim counts per id; the 3 building trims (accent, sign side, stripe)
     hex(token, st)               token → '#RRGGBB' ('$slot' resolved from st), or null
     isToken(token)               true when hex(token) resolves
     tokensIn(entry)              every colour token an entry references
     colorsFor(id, st)            {part: '#RRGGBB'} with style slots resolved
     heightOf(id, st)             item height; the house uses HOUSE_H[shape][roof] (all ≤ 2.9)
     houseState(st, override)     {wall, roof, door, details[], shape, variant}
     resolveStyle(id, st)         the resolved ctx.st for a build (see stateKey)
     stateKey(id, st)             stable template / photocard cache key (cottage keys = v1 keys)
     houseBudget(st)              body + crown + door + details tris for a resolved house state
     variantOf(uid, id)           deterministic trim index in [0, VARIANTS[id]) (0 when none)
     trimOf(id, variant)          {accent, signSide, stripe} for a building trim
     jitter2(uid, id, sameIdNeighbours, out?)   {yaw, sx, sy, sz, lean, leanAxis, tint} placement variety
     pathPiece(mask)              {piece, yawDeg} for a path cell's N1 E2 S4 W8 neighbour mask
     shineLevel(price)            0 | 1 | 2 | 3 from price only (a CATALOG item is accepted too)
     normHex(h), mixHex(a, b, k), tone(hex, dL)   colour maths shared with the kit (dL in HSL points)

   LOOK ENTRY SCHEMA:
     kind       look category (KINDS): tree flower bush rock mushroom light flag
                decor landmark path fun house style pet acc land attraction
                variant cosmetic building (the city buildings: CATALOG kind 'fun', cat 'city')
     h          height (u) of the top above the item's base
     colors     {part: token}; tokens come ONLY from PALETTE, PALETTE_V2, LOCKED (dotted path,
                e.g. 'PETCOL.pet_puppy.body', '$slot' = the selected style, e.g.
                'WALL.$wall'), ART2D or EXTRA — never a raw hex
     mats       {part: materialKey} for non-toon parts: gold | chrome | pearl | glass |
                smoked | gunmetal | foil (matcaps) | led | sign (atlas screens/signs) |
                state | 'neon:<Token>' (absent part = 'toon')
     pivots     named pivots the template must create (actPivot is one of them)
     anchors    named anchors ('top' for labels and emotes, 'door', 'seat', 'spot', 'roof', …)
     actPivot   pivot driven by the tap act (ACT_PIVOT / LAUNCH_PIVOT), or null
     idle       primary idle loop {type, ...params} or null (types below)
     loops      secondary idle loops (same shape), e.g. blossom petals
     show       Showtime behaviour {neon[], halo, led, chase, ...extras};
                halo {token, size}, led {hz, tokens[]}, chase {hz, groups (each light
                lights once per `groups` steps), ...}; every hz is ≤ 2 (MAX_FLASH_HZ) and a
                chase's per-light rate hz / groups is ≤ LED_CHASE_HZ — test-enforced
     organic    placement variety from jitter2 (organic kinds only)
     outline    inverted-hull outline on MID/HIGH (OUTLINE_KINDS: pets, accessories, avatar);
                architecture has no hull (the edit selection hull is the kit's)
     instancing 'batch' (placed on the island, one ItemBatch per (id, stateKey)) |
                'rig' (pets) | 'socket' (accessories) | 'part' (styles, course
                dressing, cosmetics) | 'scene' (kart tracks) | 'env' (land)
     perCopy    parts that get their own CPU-waved Mesh per copy (cloth, pennants)
     hit        [w, h, d] raycast box (fp w × max(h, 0.8) × fp d) or null
     tris       triangle budget for the full template on MID/HIGH
     extras     part (style slot), slot/socket, base (photocard base item), bones,
                bodyTris (house), crowdTris (pitch, stage)
   IDLE TYPES: sway {deg, period} · bob {pct, period} · blink {min, max} ·
     pulse {pct, on:'beat', hz} · flutter {amp, hz} · pennants {deg, hz} ·
     spin {rps} · drip {streams, drops, period} · emit {every} ·
     pendulum {deg, period} · smoke {n, period, rise, grow} · twinkle {hz} ·
     glint {n, period} · sparkle {n, period} · petals {n, max} · track {day, show} ·
     cloth {amp} · actor (driven by pets-brain/actors) · breathe {hz, min} (a sine
     between min and 1, never on/off) · ripple {period} · hue {hz, tokens} (a moving
     hue) · scroll {speed} (LED atlas UV scroll, program widths per second)
     `when: 'show'` limits a loop to Showtime.
   ================================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SLIslandLook = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var LOOK_VERSION = 2;
  var MAX_FLASH_HZ = 2;
  var LED_CHASE_HZ = 1.5;        /* full-contrast LED chases (per light) never run faster */
  /* the only words ever drawn into a texture (plus the child's own first name and initial) */
  var SIGN_WORDS = ['ENCORE', 'SHOWTIME', 'ON AIR', 'PHOTO', 'DANCE', 'PET COURSE', 'ISLAND'];

  /* ---------------- palette (art bible, by name) ---------------- */
  var PALETTE = {
    'Ink': '#3B2F4A', 'Ink Deep': '#2B2140', 'Cloud White': '#FFFFFF',
    'Grass Top': '#8EE07A', 'Grass Alt': '#84D872', 'Grass Side': '#5FBF55', 'Tuft Green': '#4FA94A', 'Meadow Hill': '#A6E88A',
    'Sand': '#F3DC9A', 'Cove Sand': '#F7E3A6', 'Wet Sand': '#E8C77E',
    'Sea Shallow': '#7FE3F0', 'Sea Deep': '#2F8FD8', 'Foam': '#F2FCFF',
    'Sky Day Top': '#8FD3FF', 'Sky Day Mid': '#CDEBFF', 'Sky Day Horizon': '#FFE3F1',
    'Sky Night Top': '#1A1240', 'Sky Night Mid': '#3B1E6E', 'Sky Night Horizon': '#FF7AC8', 'Stage Night': '#130C2E',
    'Neon Pink': '#FF4FB8', 'Neon Cyan': '#3DF2FF', 'Neon Violet': '#A66BFF', 'Neon Lime': '#B6FF5C',
    'Star Gold': '#FFD23F', 'Coral': '#FF6B6B', 'Splash Blue': '#4FC3F7', 'Leaf Mint': '#7BD88F', 'Grape': '#C38BFF',
    'Bubblegum': '#FF8FC8', 'Primary Pink': '#FF5FA2', 'Butter': '#FFE27A', 'Lamp Warm': '#FFE36B', 'Window Glow': '#FFE9A8',
    'Bark': '#9B6B43', 'Plank': '#C48A52', 'Pebble': '#CFC8DC',
    'Gold Base': '#F0C02F', 'Gold Light': '#FFE89A', 'Gold Deep': '#C9921A', 'Chrome': '#DDE3F0', 'Iridescent Rim': '#C7B8FF',
    'Holo Pink': '#FFB3E6', 'Holo Blue': '#B3E5FF', 'Holo Mint': '#C9FFE5', 'Holo Lemon': '#FFF3B3',
    'Rim Showtime': '#FF7AD9', 'Blush': '#FF9DB8', 'Success': '#2ECC71', 'Error': '#E74C3C', 'Blob Shadow': '#3B2F4A'
  };

  /* ---------------- palette v2: Encore City (art-bible.v2.json; every v1 token above stays) ----------------
     Neon tokens are emissive only (lines, rings, signs, screens — never a surface). */
  var PALETTE_V2 = {
    /* ink and UI */
    'Midnight Ink': '#14101F', 'Night Base': '#0E0B1A', 'Panel Glass': '#161228', 'CTA Magenta': '#E0157F',
    'CTA Violet': '#7B4DFF', 'Text Muted': '#B8B2D6', 'Error Coral': '#FF5A6A',
    /* architecture */
    'Graphite': '#2E2B3A', 'Night Asphalt': '#3A3646', 'Concrete': '#8C8798', 'Concrete Light': '#C9C5D3',
    'Bone White': '#F4F2FA', 'Smoked Glass': '#1B2438', 'Glass Edge': '#8FB7FF', 'Smoked Mid': '#2A3B5C',
    'Smoked Deep': '#0E1626', 'Gunmetal': '#5A5F72', 'Gunmetal Spec': '#E6E9F2', 'Gunmetal Mid': '#7C8194',
    'Gunmetal Deep': '#2A2D3A', 'Teak': '#9A6A4A', 'Teak Light': '#B07E58', 'Milk Tea': '#E2BE94',
    /* sky, fog and light */
    'Dusk Zenith': '#2B1E5C', 'Dusk Mid': '#6A3D8F', 'Dusk Horizon': '#FF9A7A', 'Dusk Fog': '#7E4E8E',
    'Sun Halo': '#FFD6A0', 'Night Zenith': '#0B0A1F', 'Night Mid': '#1E1450', 'City Glow': '#C2338F',
    'Hemi Dusk Sky': '#9C8CFF', 'Hemi Dusk Ground': '#3A2550', 'Sun Dusk': '#FFB48A', 'Rim Dusk': '#FFB0D9',
    'Hemi Night Sky': '#5A4BD1', 'Hemi Night Ground': '#1A1030', 'Moon V2': '#A9B8FF', 'Rim Night': '#FF5FD2',
    'Studio Sky': '#B9B0FF', 'Studio Ground': '#2A2240', 'Studio Key': '#FFE2C8',
    /* water */
    'Lagoon': '#3FB8D0', 'Deep Bay': '#1E3F86', 'Foam Dusk': '#FFD9E8', 'Wave Dusk': '#FFC7B0',
    'Night Lagoon': '#1F4FA8', 'Night Deep': '#0B1440', 'Foam Night': '#B9A8FF',
    /* land */
    'Turf': '#4FA36A', 'Turf Shade': '#3C8456', 'Hill Moss': '#5DB67E', 'Cliff Rock': '#5A5168',
    'Dune': '#E9C9A0', 'Wet Dune': '#B98F6E', 'Leaf Deep': '#2F7D57', 'Leaf Lit': '#57B07A',
    /* neon (emissive only) */
    'Neon Magenta': '#FF2E9A', 'LED Cyan': '#22E4FF', 'Electric Violet': '#8A5CFF', 'Laser Lime': '#C6FF3D',
    /* warm lights */
    'Sunset Amber': '#FFB23E', 'Window Warm': '#FFD08A',
    /* crowd silhouettes */
    'Crowd Shadow': '#2A2348', 'Crowd Shadow 2': '#33295A', 'Crowd Shadow 3': '#3D3166',
    /* foil */
    'Foil Pink': '#FF7AD9', 'Foil Blue': '#7AD7FF', 'Foil Mint': '#9DFFCF', 'Foil Gold': '#FFE27A',
    /* the city across the bay */
    'Night Glass Indigo': '#2A2F5E', 'Night Glass Teal': '#1F4A55', 'Night Glass Plum': '#43294F',
    'Night Glass Graphite': '#2B2D38', 'Night Glass Smoke': '#4A4E63', 'Quay Stone': '#3B3747'
  };

  /* ---------------- locked colours (verbatim copies; tests compare them) ----------------
     WALL, DOOR, ROOF pairs, PETCOL, KARTS, BALLS, STADIA, THEME: world/world-art.js
     THEMES (course colours, without the non-colour 'treat'): world/games/pet-course.js
     TRACKS (grass only): world/games/kart.js */
  var LOCKED = {
    WALL: { wall_cream: '#f7e6c4', wall_pink: '#f9b7cc', wall_mint: '#b8ecd6', wall_sky: '#a9d6f7', wall_lilac: '#d6bdf2',
            wall_concrete: '#a9a5b3', wall_gallery: '#eceaf2', wall_graphite: '#34303f', wall_midnight: '#232a57' },
    DOOR: { door_blue: '#3b7dd8', door_red: '#d94b4b', door_green: '#38a85c', door_gold: '#f0c02f', door_glass: '#1b2438' },
    ROOF: { roof_red: ['#e0574f', '#c4433c'], roof_blue: ['#4a6fa5', '#3a5888'], roof_thatch: ['#e3b24f', '#c99634'], roof_candy: ['#ff8fb8', '#f06d9e'] },
    PETCOL: {
      pet_puppy:  { body: '#e3b077', dark: '#b8834f', light: '#f6d9b3', nose: '#3b2f4a' },
      pet_kitten: { body: '#f0a35e', dark: '#c97834', light: '#fde2c6', nose: '#e86a8a' },
      pet_bunny:  { body: '#f4f0ea', dark: '#d8cfc4', light: '#ffffff', nose: '#f08aa6' },
      pet_dragon: { body: '#5fc97a', dark: '#3a9a58', light: '#b9f0c6', nose: '#2e6b40' }
    },
    KARTS: { kart_red: '#e94b4b', kart_blue: '#3b7dd8', kart_lime: '#7ed957', kart_gold: '#f0c02f', kart_unicorn: '#ff8fd0' },
    BALLS: { ball_classic: ['#ffffff', '#3b2f4a'], ball_rainbow: ['#ff6b6b', '#4fc3f7'], ball_planet: ['#c38bff', '#ffd23f'], ball_gold: ['#ffd23f', '#e0a81c'] },
    STADIA: { stadium_day: ['#7ecbff', '#6ac46a'], stadium_night: ['#2b2a5e', '#3f9a4a'], stadium_beach: ['#ffe0a0', '#7fd0a0'], stadium_snow: ['#dfeeff', '#bfe6c8'] },
    THEME: { course_meadow: ['#7bd88f', '#ffd23f'], course_beach: ['#f3dc9a', '#4fc3f7'], course_snow: ['#e8f4ff', '#7fb3ff'], course_candy: ['#ffb6d5', '#c38bff'] },
    THEMES: {
      course_meadow: { sky: ['#8fd8ff', '#d9f6ff'], hill: '#9fdc8a', hill2: '#7cc96e', ground: '#7ad06a', soil: '#c9925a',
        obs: { low: ['#ffffff', '#ff6b6b'], log: ['#a8743f', '#7a4f26'], hedge: ['#4caf50', '#2f8a3a'], stack: ['#e9b46a', '#b67f37'], puddle: '#6cc4ff' } },
      course_beach: { sky: ['#7fd0ff', '#fff3d6'], hill: '#4fc3f7', hill2: '#2fa3e0', ground: '#f3dc9a', soil: '#e2c27a',
        obs: { low: ['#ff6b4a', '#c43f2a'], log: ['#c9a06a', '#8d6a3d'], hedge: ['#f2cd7c', '#c99a4d'], stack: ['#ff8a5c', '#d0603a'], puddle: '#4fc3f7' } },
      course_snow: { sky: ['#a8c8ff', '#eef6ff'], hill: '#ffffff', hill2: '#dfeeff', ground: '#f4f9ff', soil: '#c9d9ee',
        obs: { low: ['#ff6b6b', '#c94a4a'], log: ['#6b8fd8', '#4a6fb8'], hedge: ['#ffffff', '#cdd9ea'], stack: ['#9fd0ff', '#6aa8e0'], puddle: '#bfe8ff' } },
      course_candy: { sky: ['#ffc6e5', '#fff0f8'], hill: '#ffb3d6', hill2: '#ff8fc4', ground: '#c38bff', soil: '#9b62e0',
        obs: { low: ['#ffffff', '#ff5c8a'], log: ['#8a5a2b', '#6a3f1a'], hedge: ['#ff8fb8', '#e8679a'], stack: ['#ffd23f', '#e8b020'], puddle: '#a0522d' } }
    },
    TRACKS: { track_loop: { grass: '#7ad06a' }, track_volcano: { grass: '#9cc46a' }, track_beach: { grass: '#f3dc9a' } }
  };

  /* ---------------- per-item colours the bible takes from the 2D art ---------------- */
  var ART2D = {
    /* trees */
    'Leaf': '#5CB85C', 'Leaf Shade': '#4BA84B', 'Leaf Light': '#8BD17C',
    'Pine Bark': '#8A5D3A', 'Pine': '#3F9A5A', 'Pine Light': '#69C07C', 'Apple Red': '#E53935',
    'Blossom': '#F6A7C8', 'Blossom Shade': '#EC86B0', 'Blossom Light': '#FFD3E6',
    'Palm Bark': '#A5743F', 'Palm Bark Dark': '#8A5A2B',
    'Frond': '#4FBF63', 'Frond Shade': '#45B05A', 'Frond Light': '#5CCC70', 'Frond Deep': '#3FA956',
    /* flowers and plants */
    'Mound': '#4FAE4C', 'Stem': '#3C8A3C', 'Tulip Red': '#FF5C6C', 'Tulip Yellow': '#FFC93C', 'Tulip Pink': '#FF7AB8', 'Sunflower': '#FFCF2E',
    'Bush': '#3F9A4A', 'Bush Light': '#4CAF50', 'Rose': '#FF7AA8', 'Rose Deep': '#FF5C8A', 'Rose Pale': '#FF9DBF',
    'Rock': '#A9A6B8', 'Moss': '#6CC26A',
    /* lights */
    'Lamp Post': '#4B4F6B', 'Glass Off': '#CFE0EC', 'Lamp Halo': '#FFF6A8',
    'Stem Cream': '#FFF4E0', 'Cap Violet': '#B06BD8', 'Cap Neon': '#6FF3FF', 'Cap Halo': '#9FFCFF',
    /* flags, garden/beach decor, landmarks */
    'Pole': '#8F8AA6', 'Bench Leg': '#6B5A7A', 'Castle Sand': '#F2CD7C', 'Castle Door': '#C99A4D',
    'Snow': '#FDFDFF', 'Carrot': '#FF8A3D', 'Mill White': '#F6EFE2',
    /* paths */
    'Plank Light': '#D69D64', 'Plank Dark': '#C98F58', 'Stepping Stone': '#D9D3E6',
    /* fun */
    'Tramp Frame': '#4B8FF0', 'Tramp Mat': '#2A64C9', 'Tramp Shine': '#7FB3FF', 'Basin': '#C9C3D9', 'Water': '#6FD0FF', 'Bubble Rim': '#9FDCFF',
    /* house */
    'Step': '#B8B2C9', 'Window': '#BFE6FF', 'Straw': '#B9842A',
    'Castle Stone': '#B9B4C9', 'Castle Tower': '#CDC8DC', 'Castle Cone': '#6C5CE7',
    'Chimney': '#B4675A', 'Chimney Cap': '#93524A', 'Smoke': '#EEF0F6',
    /* pets and accessories */
    'Bunny Ear': '#F6B7C9', 'Cape Red': '#E94B4B',
    /* land and sea */
    'Sandbar': '#F6E7BD', 'Wave Line': '#E8F8FF',
    /* attractions */
    'Garage': '#8FA3C8', 'Roller Door': '#D9E1EF', 'Door Slat': '#A8B3C9', 'Asphalt': '#5B5670'
  };

  /* ---------------- 3D-only colours ---------------- */
  var EXTRA = {
    'Stone Light': '#E6E1EF', 'Peach Coral': '#FF8A5C', 'Rainbow Orange': '#FFA94D',
    'Volcano Rock': '#8A6B5A', 'Sunset Peach': '#FFB38A', 'Dusk Violet': '#A66BFF',
    /* light presets */
    'Hemi Sky Day': '#DDF1FF', 'Hemi Ground Day': '#FFE0EC', 'Sun Day': '#FFF3E0',
    'Hemi Sky Show': '#6B5BD6', 'Hemi Ground Show': '#2A1840', 'Moon': '#B9C6FF',
    /* the sea at Showtime */
    'Sea Shallow Show': '#3C6FD1', 'Sea Deep Show': '#1B2A6B', 'Foam Show': '#CFC4FF',
    /* matcap stops */
    'Gold Spec': '#FFF6CC', 'Gold Edge': '#8A5F10', 'Chrome Deep': '#9AA3B8',
    /* photocard riser and image well */
    'Riser Top': '#FFF0FA', 'Well Blue': '#E8F4FF'
  };

  /* ---------------- tempo, caps and shared constants ---------------- */
  var TEMPO = {
    day: 100, show: 118, shop: 92, course: 128, penalty: 112, kart: 140,
    beatsPerBar: 4, danceCounts: 8, danceEveryBars: 16, encoreSec: 8,
    showMixSec: 1.6, showMixReducedSec: 0.25,
    /* idle loop periods (s); day half-beat = 0.3 s, most are whole multiples */
    idle: {
      treeSway: 4.2, pineSway: 5, palmSway: 3.6, flowerBob: 2.4, smoke: 2.4, swingIdle: 2.4,
      avatarBob: 2, windmillRps: 0.25, bubbleEvery: 2, cloudDrift: 0.08, seaScroll: 0.04,
      rockBlink: [5, 9], petIdle: [4, 8], avatarGlance: 6, doorGlint: 4, crownGlint: 3,
      lighthouseRps: 0.3, lighthouseCycle: 4, coneHz: 0.12, coneSweepDeg: 25
    },
    beatHz: function (bpm) { return bpm / 60; },
    beatSec: function (bpm) { return 60 / bpm; },
    barSec: function (bpm) { return 240 / bpm; },
    loopSec: function (bars, bpm) { return bars * 240 / bpm; }
  };
  var SHOW_BEAT_HZ = TEMPO.show / 60;      /* 1.97 Hz — the fastest beat-driven light */

  var FX = {
    particles: { LOW: 128, MID: 256, HIGH: 512 },
    stars: { LOW: 120, MID: 250, HIGH: 250 },
    snow: { LOW: 60, MID: 100, HIGH: 150 },
    confetti: 120, bubbles: 24, petals: 40, petalsPerTree: 4, glints: 40,
    dustPuffs: 6, fireworkRings: 3, confettiMemberShare: 0.4,
    haloSize: [0.5, 1.2], haloOpacity: { day: 0.5, show: 0.9 },
    blob: { token: 'Blob Shadow', opacity: 0.22, scale: 0.9 },
    decal: { r: 0.7, opacity: 0.35 },
    /* emissive uplight pools under lamps and signs (golden hour → Showtime opacity) */
    uplight: { r: 0.5, day: 0.25, show: 0.4 },
    shake: { amp: 0.06, dur: 0.18 },
    /* any local brightness bloom (lens flash, screen wipe) at most once per this many s per item */
    bloomGapSec: 1.5,
    maxFlashHz: MAX_FLASH_HZ
  };

  /* v2 materials: a deeper toon ramp, crisp 0.05 architecture bevels, no hull on buildings */
  var MATERIAL = {
    toonRamp: [64, 128, 200, 255],
    rim: { day: { token: 'Rim Dusk', strength: 0.35, member: 0.25, exp: 3.0 }, show: { token: 'Rim Night', strength: 0.6, member: 0.5 } },
    outline: { token: 'Midnight Ink', building: 0, character: 0.009, selected: 'Star Gold', pulse: [0.02, 0.03], hz: 1.5 },
    glassOpacity: 0.45, neonSleeve: { r: 0.05, core: 0.015, day: 0.25, show: 0.45 },
    /* bevel radius: architecture min(arch × smallest side, archMax); organic pieces 0.18 × smallest side */
    bevel: { arch: 0.05, archMax: 0.06, organic: 0.18 },
    toneShift: 12, skirting: -6
  };
  /* matcap stops, centre/spec → edge (128² canvases sharing one matcap program) */
  var MATCAPS = {
    gold: ['Gold Spec', 'Gold Light', 'Gold Base', 'Gold Deep', 'Gold Edge'],
    chrome: ['Cloud White', 'Chrome', 'Chrome Deep', 'Iridescent Rim'],
    pearl: ['Holo Pink', 'Holo Blue', 'Holo Mint', 'Holo Lemon'],
    smoked: ['Glass Edge', 'Smoked Mid', 'Smoked Glass', 'Smoked Deep'],
    gunmetal: ['Gunmetal Spec', 'Gunmetal Mid', 'Gunmetal', 'Gunmetal Deep'],
    foil: ['Foil Pink', 'Foil Blue', 'Foil Mint', 'Foil Gold']
  };
  /* edit / placement overlay (edit3d.js) */
  var EDIT = {
    grid: { token: 'Cloud White', opacity: 0.55 },
    valid: { token: 'Success', opacity: 0.45, edge: 'Neon Cyan' },
    invalid: { token: 'Error', opacity: 0.42, hz: 1.5 },
    entrance: { token: 'Star Gold', opacity: 0.25 },
    selected: { token: 'Star Gold', hz: 1.5 },
    ghost: { opacity: 0.85, invalidOpacity: 0.5, lift: 0.25, wobbleDeg: 4, wobbleRate: 3, shadow: 0.7 },
    tiltDeg: 62
  };
  /* the v2 neon sets: every show.neon, chase and cone picks these up; an LED set always mixes
     at least 4 hues (with the member colour) and no hue covers more than 35% */
  var NEON3 = ['Neon Magenta', 'LED Cyan', 'Electric Violet'];
  var NEON4 = ['Neon Magenta', 'LED Cyan', 'Electric Violet', 'Laser Lime'];
  /* Showtime spotlight cones (env.js): two stage buoys + one pole behind the house */
  var CONES = {
    tokens: NEON3,
    buoys: [[-9.5, -0.32, -6.5], [9.5, -0.32, -6.5]], poleBehindHouse: [0, 0, -1.6],
    radius: 1.3, height: 10, sweepDeg: 25, hz: 0.12, phaseDeg: 120, alpha: 0.2
  };
  /* triangle budgets (modellingRules); city buildings use per-id tris (the stage = attraction) */
  var BUDGET = {
    path: 120, flower: 350, small: 500, tree: 900, landmark: 1400, fun: 1200,
    house: 3500, houseBody: 1000, attraction: 4000, crowd: 2000, building: 3000,
    pet: 1800, acc: 300, avatar: 1500, kart: 1500, ball: 400
  };
  /* shop shine by price only: plain, pastel holo edge, animated holo foil, gold foil */
  var SHINE_BANDS = [0, 200, 600, 1200];
  var SHINE_NAMES = ['plain', 'holo-edge', 'holo-foil', 'gold-foil'];
  /* must equal SLWorldCore.DEFAULTS (test-enforced) */
  var SLOT_DEFAULTS = { wall: 'wall_cream', roof: 'roof_red', door: 'door_blue', shape: 'shape_loft', course: 'course_meadow',
                        ball: 'ball_classic', stadium: 'stadium_day', kart: 'kart_red', track: 'track_loop' };

  var KINDS = ['tree', 'flower', 'bush', 'rock', 'mushroom', 'light', 'flag', 'decor', 'landmark', 'path', 'fun',
               'house', 'style', 'pet', 'acc', 'land', 'attraction', 'variant', 'cosmetic', 'building'];
  var ORGANIC_KINDS = { tree: 1, flower: 1, bush: 1, rock: 1, mushroom: 1 };
  /* v2: only characters keep an ink hull; architecture gets the edit selection hull only */
  var OUTLINE_KINDS = { pet: 1, acc: 1, avatar: 1 };
  var PLACED_KINDS = { tree: 1, flower: 1, bush: 1, rock: 1, mushroom: 1, light: 1, flag: 1, decor: 1, landmark: 1,
                       path: 1, fun: 1, house: 1, attraction: 1, building: 1 };
  /* CATALOG act → the pivot its act handler drives ('launch' is per attraction) */
  var ACT_PIVOT = { glow: 'glow', wave: 'flag', spin: 'spin', bounce: 'mat', splash: 'water', swing: 'swing',
                    bubbles: 'emitter', home: 'door', launch: null,
                    serve: 'hatch', snap: 'flash', screen: 'screen', record: 'meter', dance: 'floor', hangout: 'deck', encore: 'lights' };
  var LAUNCH_PIVOT = { att_course: 'spin', att_pitch: 'ball', att_kart: 'kart' };
  var PET_BONES = ['body', 'head', 'neck', 'tail', 'earL', 'earR', 'legFL', 'legFR', 'legBL', 'legBR', 'wingL', 'wingR'];
  var PET_SOCKETS = ['hat', 'neck', 'face', 'back', 'seat'];
  var FAIRY = ['Star Gold', 'Coral', 'Splash Blue', 'Leaf Mint', 'Grape'];

  /* ---------------- home shapes ----------------
     HOUSE_H[shape][roof]: the house top for each shape and roof (all ≤ 2.9).
     HOUSE_TRIS: body and crown budgets per shape; with the door and every detail a
     house stays ≤ BUDGET.house (houseBudget, test-enforced). The roof slot dresses
     each shape's crown, so every roof name stays true on every shape. */
  var SHAPES = ['shape_cottage', 'shape_loft', 'shape_villa', 'shape_tower', 'shape_dome'];
  var ROOFS = ['roof_red', 'roof_blue', 'roof_thatch', 'roof_candy', 'roof_castle'];
  function byRoof(v) { var o = {}; ROOFS.forEach(function (r, i) { o[r] = v[i]; }); return o; }
  var HOUSE_H = {
    shape_cottage: byRoof([2.3, 2.3, 2.3, 2.3, 2.9]),
    shape_loft: byRoof([1.95, 1.95, 2.1, 2.0, 2.75]),
    shape_villa: byRoof([1.2, 1.2, 1.2, 1.3, 1.95]),
    shape_tower: byRoof([2.6, 2.6, 2.75, 2.65, 2.9]),
    shape_dome: byRoof([2.25, 2.25, 2.25, 2.25, 2.25])
  };
  var HOUSE_TRIS = {
    body: { shape_cottage: 1000, shape_loft: 1200, shape_villa: 1200, shape_tower: 1200, shape_dome: 1200 },
    /* modern crowns (the cottage keeps its v1 roof budgets from LOOK) */
    crown: 900, crownCastle: 1050, door: 150
  };
  /* trim variants: 3 per city building (by uid), 2 per non-cottage shape (by profile seed) */
  var VARIANTS = {
    bld_photobooth: 3, bld_boba: 3, bld_ledtower: 3, bld_recording: 3, bld_dance: 3, bld_rooftop: 3, bld_stage: 3,
    shape_loft: 2, shape_villa: 2, shape_tower: 2, shape_dome: 2
  };
  /* building trim n: accent [n], sign side [n % 2], stripe pattern [n] */
  var BUILDING_TRIMS = { accent: ['@member', 'Neon Magenta', 'LED Cyan'], signSide: ['L', 'R'], stripe: ['A', 'B', 'C'] };

  /* ---------------- the look table ---------------- */
  var FP = { house_cottage: [2, 2], att_course: [2, 2], att_pitch: [3, 2], att_kart: [2, 2],
             bld_boba: [2, 1], bld_recording: [2, 1], bld_dance: [2, 2], bld_rooftop: [2, 2], bld_stage: [3, 2] };
  var INSTANCING = { pet: 'rig', acc: 'socket', style: 'part', land: 'env', variant: 'part', cosmetic: 'part' };
  function noShow() { return { neon: [], halo: null, led: null, chase: null }; }
  /* fills every schema field so consumers never test for undefined */
  function entry(id, kind, h, colors, o) {
    o = o || {};
    var show = noShow(), k;
    if (o.show) for (k in o.show) show[k] = o.show[k];
    var placed = !!PLACED_KINDS[kind];
    var fp = FP[id] || [1, 1];
    var e = {
      kind: kind, h: h, colors: colors, mats: o.mats || {},
      pivots: o.pivots || [], anchors: o.anchors || (placed ? ['top'] : []),
      actPivot: o.actPivot || null, idle: o.idle || null, loops: o.loops || [], show: show,
      organic: !!ORGANIC_KINDS[kind], outline: !!OUTLINE_KINDS[kind],
      instancing: placed ? 'batch' : (o.instancing || INSTANCING[kind] || 'part'),
      perCopy: o.perCopy || [],
      hit: o.hit !== undefined ? o.hit : (placed ? [fp[0], Math.max(h, 0.8), fp[1]] : null),
      tris: o.tris
    };
    ['part', 'slot', 'socket', 'base', 'bones', 'bodyTris', 'crowdTris'].forEach(function (x) { if (o[x] !== undefined) e[x] = o[x]; });
    return e;
  }

  var LOOK = {};
  function def(id, kind, h, colors, o) { LOOK[id] = entry(id, kind, h, colors, o); }
  var SWAY = ['sway'];
  var treeIdle = function (deg, period) { return { type: 'sway', deg: deg, period: period, pivot: 'sway' }; };
  var flowerIdle = { type: 'bob', pct: 2, period: TEMPO.idle.flowerBob, pivot: 'sway' };
  var beatPulse = { type: 'pulse', pct: 12, on: 'beat', hz: SHOW_BEAT_HZ, when: 'lit+music', pivot: 'glow' };
  var flagLed = { hz: 1.5, tokens: NEON4 };

  /* -- starter -- */
  def('house_cottage', 'house', 2.3,
    { wall: 'WALL.$wall', door: 'DOOR.$door', step: 'Concrete', mat: 'Teak', window: 'Smoked Glass', muntin: 'Gunmetal', knob: 'Star Gold', windowGlow: 'Window Warm' },
    { pivots: ['door', 'emitter', 'flag', 'glow'], anchors: ['top', 'door', 'spot'], actPivot: 'door', mats: { window: 'state' },
      show: { windowGlow: { token: 'Window Warm' } }, tris: BUDGET.house, bodyTris: BUDGET.houseBody });
  def('att_course', 'attraction', 1.9,
    { pillar: 'Graphite', banner: 'THEME.$course.1', plate: 'THEME.$course.0', text: 'Bone White', bulb: 'Holo Lemon', star: 'Star Gold',
      hurdlePost: 'Cloud White', hurdleA: 'Coral', hurdleB: 'Star Gold' },
    { pivots: ['spin', 'glow'], anchors: ['top', 'spot'], actPivot: 'spin', mats: { bulb: 'state' },
      idle: { type: 'spin', rps: 0.25, pivot: 'spin' },
      show: { chase: { on: 'beat', hz: SHOW_BEAT_HZ, groups: 2, tokens: NEON3, bulbs: 14 }, spot: true }, tris: BUDGET.attraction });
  def('pet_puppy', 'pet', 0.55,
    { body: 'PETCOL.pet_puppy.body', dark: 'PETCOL.pet_puppy.dark', light: 'PETCOL.pet_puppy.light', nose: 'PETCOL.pet_puppy.nose',
      ear: 'PETCOL.pet_puppy.dark', eye: 'Midnight Ink', glint: 'Cloud White', blush: 'Blush', mouth: 'Midnight Ink' },
    { pivots: PET_SOCKETS, bones: PET_BONES, idle: { type: 'actor' }, hit: [0.8, 0.8, 0.8], tris: BUDGET.pet });
  def('wall_cream', 'style', 1.1, { wall: 'WALL.wall_cream' }, { part: 'wall', slot: 'wall', base: 'house_cottage', tris: 0 });
  def('roof_red', 'style', 2.3, { roof: 'ROOF.roof_red.0', shade: 'ROOF.roof_red.1' }, { part: 'roof', slot: 'roof', base: 'house_cottage', tris: 1000 });
  def('door_blue', 'style', 0.62, { door: 'DOOR.door_blue', knob: 'Star Gold' }, { part: 'door', slot: 'door', base: 'house_cottage', pivots: ['door'], tris: 150 });
  /* home shapes: the whole house form (part 'shape'); h = the red-roof top (HOUSE_H has every roof).
     Glazing is the 'state' part (Smoked Glass by day → Window Warm lit). */
  def('shape_cottage', 'style', HOUSE_H.shape_cottage.roof_red,
    { wall: 'WALL.$wall', glass: 'Smoked Glass', glassGlow: 'Window Warm', frame: 'Gunmetal', step: 'Concrete' },
    { part: 'shape', slot: 'shape', base: 'house_cottage', mats: { glass: 'state' }, show: { windowGlow: { token: 'Window Warm' } },
      tris: HOUSE_TRIS.body.shape_cottage });
  def('shape_loft', 'style', HOUSE_H.shape_loft.roof_red,
    { wall: 'WALL.$wall', glass: 'Smoked Glass', glassGlow: 'Window Warm', frame: 'Gunmetal', soffit: 'Teak', downlight: 'Window Warm',
      parapet: 'Concrete Light', step: 'Concrete', led: 'LED Cyan' },
    { part: 'shape', slot: 'shape', base: 'house_cottage', mats: { glass: 'state', led: 'neon:LED Cyan' },
      show: { windowGlow: { token: 'Window Warm' }, neon: ['LED Cyan'], halo: { token: 'Window Warm', size: 0.35 } },
      tris: HOUSE_TRIS.body.shape_loft });
  def('course_meadow', 'variant', 1.9, { plate: 'THEME.course_meadow.0', banner: 'THEME.course_meadow.1', hedge: 'Bush', flower: 'Tulip Pink' },
    { slot: 'course', base: 'att_course', tris: 600 });

  /* -- garden: trees -- */
  def('tree_oak', 'tree', 1.6, { trunk: 'Bark', canopy: 'Leaf Deep', canopyLow: 'Turf Shade', dab: 'Leaf Lit' },
    { pivots: SWAY, idle: treeIdle(1.5, TEMPO.idle.treeSway), tris: BUDGET.tree });
  def('tree_pine', 'tree', 1.8, { trunk: 'Pine Bark', cone: 'Pine', top: 'Pine Light' },
    { pivots: SWAY, idle: treeIdle(1, TEMPO.idle.pineSway), tris: BUDGET.tree });
  def('tree_apple', 'tree', 1.55, { trunk: 'Bark', canopy: 'Leaf Deep', canopyLow: 'Turf Shade', dab: 'Leaf Lit', apple: 'Apple Red', spec: 'Cloud White' },
    { pivots: SWAY, idle: treeIdle(1.5, TEMPO.idle.treeSway), tris: BUDGET.tree });
  def('tree_blossom', 'tree', 1.6, { trunk: 'Bark', canopy: 'Blossom', canopyLow: 'Blossom Shade', dab: 'Blossom Light', petal: 'Blossom Light' },
    { pivots: SWAY, idle: treeIdle(1.5, TEMPO.idle.treeSway), loops: [{ type: 'petals', n: FX.petalsPerTree, max: FX.petals }], tris: BUDGET.tree });
  def('tree_palm', 'tree', 1.9,
    { trunkA: 'Palm Bark', trunkB: 'Palm Bark Dark', frondA: 'Frond', frondB: 'Frond Shade', frondC: 'Frond Light', frondD: 'Frond Deep', coconut: 'Palm Bark Dark' },
    { pivots: SWAY, idle: treeIdle(3, TEMPO.idle.palmSway), tris: BUDGET.tree });

  /* -- garden: flowers, plants, rock -- */
  def('flower_tulip', 'flower', 0.5, { mound: 'Turf Shade', stem: 'Stem', leaf: 'Stem', cupA: 'Tulip Red', cupB: 'Tulip Yellow', cupC: 'Tulip Pink' },
    { pivots: SWAY, idle: flowerIdle, tris: BUDGET.flower });
  def('flower_daisy', 'flower', 0.35, { mound: 'Turf Shade', stem: 'Stem', petal: 'Cloud White', centre: 'Tulip Yellow' },
    { pivots: SWAY, idle: flowerIdle, tris: BUDGET.flower });
  def('flower_sun', 'flower', 0.75, { mound: 'Turf Shade', stem: 'Stem', leaf: 'Mound', petal: 'Sunflower', disc: 'Palm Bark Dark' },
    { pivots: ['sway', 'head0', 'head1'], idle: flowerIdle, loops: [{ type: 'track', day: 'sun', show: 'spot', pivots: ['head0', 'head1'] }],
      show: { track: 'spot' }, tris: BUDGET.flower });
  def('bush_rose', 'bush', 0.6, { mound: 'Turf Shade', puff: 'Bush', puffLight: 'Bush Light', roseA: 'Rose', roseB: 'Rose Deep', roseC: 'Rose Pale' },
    { pivots: SWAY, idle: flowerIdle, tris: BUDGET.small });
  /* v2: a plain mossy rock (no eyes, no blink) */
  def('rock_mossy', 'rock', 0.45, { rock: 'Cliff Rock', moss: 'Moss' }, { pivots: ['sway'], tris: BUDGET.small });

  /* -- lights -- */
  def('lantern', 'light', 1.4,
    { post: 'Gunmetal', cage: 'Gunmetal', glassOff: 'Glass Off', glassOn: 'Sunset Amber', bulb: 'Star Gold', cap: 'Gunmetal' },
    { pivots: ['glow'], actPivot: 'glow', mats: { glass: 'state' }, idle: beatPulse,
      show: { halo: { token: 'Lamp Halo', size: 0.9 }, decal: { token: 'Lamp Warm', r: FX.decal.r, opacity: FX.decal.opacity } }, tris: BUDGET.small });
  def('mushroom_glow', 'mushroom', 0.55, { stem: 'Stem Cream', capOff: 'Cap Violet', capOn: 'LED Cyan', spot: 'Cloud White', mound: 'Mound' },
    { pivots: ['sway', 'glow'], actPivot: 'glow', mats: { cap: 'state' }, idle: beatPulse,
      show: { halo: { token: 'Cap Halo', size: 0.8 }, decal: { token: 'Cap Neon', r: FX.decal.r, opacity: FX.decal.opacity } }, tris: BUDGET.small });

  /* -- flags -- */
  def('flag_pole', 'flag', 1.9, { pole: 'Pole', finial: 'Gold Base', cloth: 'Coral', diamond: 'Star Gold' },
    { pivots: ['flag'], actPivot: 'flag', mats: { finial: 'gold' }, perCopy: ['cloth'],
      idle: { type: 'flutter', amp: 0.04, hz: 2, pivot: 'flag' }, show: { led: flagLed }, tris: BUDGET.small });
  def('bunting', 'flag', 1.0, { post: 'Bark', line: 'Ink', p1: 'Coral', p2: 'Star Gold', p3: 'Splash Blue', p4: 'Leaf Mint', p5: 'Grape' },
    { pivots: ['flag'], actPivot: 'flag', perCopy: ['pennants'],
      idle: { type: 'pennants', deg: 6, hz: 0.8, pivot: 'flag' }, show: { led: flagLed }, tris: BUDGET.small });

  /* -- garden and beach decor -- */
  def('bench', 'decor', 0.5, { plank: 'Teak', leg: 'Gunmetal' }, { anchors: ['top', 'seat'], show: { sit: true }, tris: BUDGET.small });
  def('sandcastle', 'decor', 0.7, { sand: 'Castle Sand', door: 'Castle Door', flag: 'Coral', stick: 'Ink', shell: 'Blossom Light' }, { tris: BUDGET.small });
  def('umbrella', 'decor', 1.25, { canopyA: 'Coral', canopyB: 'Cloud White', pole: 'Pole', towel: 'Splash Blue' }, { tris: BUDGET.small });
  def('snowman', 'decor', 0.95, { snow: 'Snow', hat: 'Ink', carrot: 'Carrot', scarf: 'Tulip Red', coal: 'Ink', sparkle: 'Cloud White' },
    { idle: { type: 'sparkle', n: 6, period: 4.8 }, tris: BUDGET.small });

  /* -- landmarks -- */
  def('windmill', 'landmark', 2.2, { tower: 'Bone White', door: 'Bark', cap: 'Coral', sail: 'Bone White', hub: 'Coral' },
    { pivots: ['spin'], actPivot: 'spin', idle: { type: 'spin', rps: TEMPO.idle.windmillRps, pivot: 'spin' },
      show: { neon: NEON4, streak: 6 }, tris: BUDGET.landmark });
  def('lighthouse', 'landmark', 2.8, { tower: 'Cloud White', band: 'Tulip Red', gallery: 'Gunmetal', glassOff: 'Glass Off', glassOn: 'Lamp Warm', roof: 'Tulip Red' },
    { pivots: ['glow', 'beam'], actPivot: 'glow', mats: { glass: 'state' },
      show: { beam: { token: 'Lamp Halo', tokens: NEON3, every: TEMPO.idle.lighthouseCycle, rps: TEMPO.idle.lighthouseRps, r: 0.6, len: 6 },
              halo: { token: 'Lamp Halo', size: 1.0 }, decal: { token: 'Lamp Warm', r: FX.decal.r, opacity: FX.decal.opacity } }, tris: BUDGET.landmark });

  /* -- paths: ground tiles; Showtime runway under-glow + chase (2 cells/s, one pulse per 4 cells = 0.5 Hz a cell) -- */
  var runway = { glow: { token: 'Neon Cyan', opacity: 0.35 }, chase: { speed: 2, spacing: 4, hz: 0.5 } };
  def('path_stone', 'path', 0.04, { stone: 'Pebble', hi: 'Stone Light' }, { show: runway, tris: BUDGET.path });
  def('path_wood', 'path', 0.04, { plankA: 'Teak Light', plankB: 'Teak', nail: 'Ink' }, { show: runway, tris: BUDGET.path });
  def('path_flower', 'path', 0.04, { stone: 'Stepping Stone', f1: 'Tulip Pink', f2: 'Tulip Yellow', f3: 'Cloud White' }, { show: runway, tris: BUDGET.path });

  /* -- fun -- */
  def('trampoline', 'fun', 0.45, { frame: 'Gunmetal', mat: 'Graphite', shine: 'LED Cyan', leg: 'Midnight Ink' },
    { pivots: ['mat'], anchors: ['top', 'seat'], actPivot: 'mat', tris: BUDGET.fun });
  def('fountain', 'fun', 0.95, { basin: 'Concrete Light', water: 'Water', drop: 'Water' },
    { pivots: ['water'], actPivot: 'water', idle: { type: 'drip', streams: 3, drops: 12, period: 0.9, pivot: 'water' },
      show: { neon: NEON3 }, tris: BUDGET.fun });
  def('swing', 'fun', 1.4, { post: 'Palm Bark', leaves: 'Leaf Deep', rope: 'Pole', seat: 'Teak' },
    { pivots: ['swing'], anchors: ['top', 'seat'], actPivot: 'swing', idle: { type: 'pendulum', deg: 4, period: TEMPO.idle.swingIdle, pivot: 'swing' }, tris: BUDGET.fun });
  def('bubbles', 'fun', 0.8, { body: 'Graphite', face: 'Gunmetal', wand: 'Pole', bubble: 'Holo Pink', rim: 'Bubble Rim' },
    { pivots: ['emitter'], actPivot: 'emitter', mats: { bubble: 'glass' }, idle: { type: 'emit', every: TEMPO.idle.bubbleEvery, pivot: 'emitter' }, tris: BUDGET.fun });

  /* -- home styles: sub-parts assembled onto house_cottage (h = top of the part above the house base) -- */
  ['wall_pink', 'wall_mint', 'wall_sky', 'wall_lilac', 'wall_concrete', 'wall_gallery', 'wall_graphite', 'wall_midnight'].forEach(function (id) {
    def(id, 'style', 1.1, { wall: 'WALL.' + id }, { part: 'wall', slot: 'wall', base: 'house_cottage', tris: 0 });
  });
  def('roof_blue', 'style', 2.3, { roof: 'ROOF.roof_blue.0', shade: 'ROOF.roof_blue.1' }, { part: 'roof', slot: 'roof', base: 'house_cottage', tris: 1000 });
  def('roof_thatch', 'style', 2.3, { roof: 'ROOF.roof_thatch.0', shade: 'ROOF.roof_thatch.1', straw: 'Straw' }, { part: 'roof', slot: 'roof', base: 'house_cottage', tris: 1000 });
  def('roof_candy', 'style', 2.3,
    { roof: 'ROOF.roof_candy.0', shade: 'ROOF.roof_candy.1', icing: 'Cloud White', s1: 'Star Gold', s2: 'Splash Blue', s3: 'Leaf Mint', s4: 'Grape', s5: 'Cloud White', cherry: 'Tulip Red' },
    { part: 'roof', slot: 'roof', base: 'house_cottage', tris: 1000 });
  def('roof_castle', 'style', 2.9, { roof: 'Castle Stone', tower: 'Castle Tower', cone: 'Castle Cone', pennantL: 'Coral', pennantR: 'Star Gold', slit: 'Lamp Post' },
    { part: 'roof', slot: 'roof', base: 'house_cottage', tris: 1200 });
  def('door_red', 'style', 0.62, { door: 'DOOR.door_red', knob: 'Star Gold' }, { part: 'door', slot: 'door', base: 'house_cottage', pivots: ['door'], tris: 150 });
  def('door_green', 'style', 0.62, { door: 'DOOR.door_green', knob: 'Star Gold' }, { part: 'door', slot: 'door', base: 'house_cottage', pivots: ['door'], tris: 150 });
  def('door_gold', 'style', 0.62, { door: 'DOOR.door_gold', knob: 'Star Gold' },
    { part: 'door', slot: 'door', base: 'house_cottage', pivots: ['door'], mats: { door: 'gold' }, idle: { type: 'glint', n: 2, period: TEMPO.idle.doorGlint }, tris: 150 });
  def('door_glass', 'style', 0.62, { door: 'DOOR.door_glass', frame: 'Gunmetal', knob: 'Gunmetal Spec' },
    { part: 'door', slot: 'door', base: 'house_cottage', pivots: ['door'], mats: { door: 'smoked' }, tris: 150 });
  /* details: one budget per id for every shape (a steel flue replaces the brick stack on
     modern shapes); with the body, crown and door every house stays ≤ BUDGET.house */
  def('detail_windowbox', 'style', 0.75, { box: 'Bark', f1: 'Rose Deep', f2: 'Star Gold', f3: 'Tulip Pink' }, { part: 'detail', slot: 'detail', base: 'house_cottage', tris: 250 });
  def('detail_chimney', 'style', 2.25, { chimney: 'Chimney', cap: 'Chimney Cap', smoke: 'Smoke', flue: 'Gunmetal' },
    { part: 'detail', slot: 'detail', base: 'house_cottage', pivots: ['emitter'],
      idle: { type: 'smoke', n: 3, period: TEMPO.idle.smoke, rise: 0.6, grow: 1.8, pivot: 'emitter' }, show: { tint: { token: 'Iridescent Rim' } }, tris: 300 });
  def('detail_lights', 'style', 1.15, { wire: 'Ink', b1: 'Star Gold', b2: 'Coral', b3: 'Splash Blue', b4: 'Leaf Mint', b5: 'Grape' },
    { part: 'detail', slot: 'detail', base: 'house_cottage', pivots: ['glow'], mats: { bulb: 'state' }, idle: { type: 'twinkle', hz: 0.5, pivot: 'glow' },
      show: { chase: { on: 'beat', hz: SHOW_BEAT_HZ, groups: 3, tokens: FAIRY, bulbs: 11 }, halo: { token: 'Butter', size: 0.25 } }, tris: 300 });
  def('detail_flag', 'style', 2.8, { pole: 'Ink', pennant: 'Star Gold' },
    { part: 'detail', slot: 'detail', base: 'house_cottage', pivots: ['flag'], perCopy: ['cloth'], idle: { type: 'flutter', amp: 0.04, hz: 2, pivot: 'flag' }, tris: 120 });
  /* a member-colour neon core + sleeve along each shape's roofline: steady at golden hour,
     a 1 Hz chase at Showtime, steady under reduced motion */
  def('detail_neon', 'style', 2.3, { neon: '@member' },
    { part: 'detail', slot: 'detail', base: 'house_cottage', pivots: ['glow'], mats: { neon: 'state' }, show: { chase: { hz: 1, groups: 4 } }, tris: 200 });
  def('shape_villa', 'style', HOUSE_H.shape_villa.roof_red,
    { wall: 'WALL.$wall', glass: 'Smoked Glass', glassGlow: 'Window Warm', frame: 'Gunmetal', deck: 'Teak', deckAlt: 'Teak Light',
      pool: 'Lagoon', poolGlow: 'LED Cyan', coping: 'Concrete Light', cushion: 'Bone White' },
    { part: 'shape', slot: 'shape', base: 'house_cottage', pivots: ['pool'], mats: { glass: 'state', pool: 'state' },
      idle: { type: 'ripple', period: 2.4, pivot: 'pool' },
      show: { windowGlow: { token: 'Window Warm' }, halo: { token: 'LED Cyan', size: 0.8 }, pool: { token: 'LED Cyan', mix: 0.45 } },
      tris: HOUSE_TRIS.body.shape_villa });
  def('shape_tower', 'style', HOUSE_H.shape_tower.roof_red,
    { wall: 'WALL.$wall', glass: 'Smoked Glass', glassGlow: 'Window Warm', frame: 'Gunmetal', plinth: 'Concrete', stair: 'Gunmetal',
      sign: '@member', signBack: 'Midnight Ink' },
    { part: 'shape', slot: 'shape', base: 'house_cottage', pivots: ['sign'], mats: { glass: 'state', sign: 'sign' },
      idle: { type: 'breathe', hz: 0.5, min: 0.7, when: 'show', pivot: 'sign' },
      show: { windowGlow: { token: 'Window Warm' }, halo: { token: '@member', size: 0.9 } },
      tris: HOUSE_TRIS.body.shape_tower });
  def('shape_dome', 'style', HOUSE_H.shape_dome.roof_red,
    { wall: 'WALL.$wall', glass: 'Smoked Glass', glassGlow: 'Window Warm', frame: 'Gunmetal', ring: 'Gunmetal', led: 'LED Cyan',
      pod: 'Smoked Glass', antenna: 'Gunmetal', tip: 'Sunset Amber' },
    { part: 'shape', slot: 'shape', base: 'house_cottage', pivots: ['ring', 'tip'], mats: { glass: 'state', led: 'state', pod: 'smoked' },
      idle: { type: 'hue', hz: 0.25, tokens: NEON3, when: 'show', pivot: 'ring' },
      loops: [{ type: 'breathe', hz: 0.5, min: 0.6, pivot: 'tip' }],
      show: { windowGlow: { token: 'Window Warm' }, halo: { token: 'LED Cyan', size: 0.6 } },
      tris: HOUSE_TRIS.body.shape_dome });

  /* -- pets and accessories -- */
  def('pet_kitten', 'pet', 0.55,
    { body: 'PETCOL.pet_kitten.body', dark: 'PETCOL.pet_kitten.dark', light: 'PETCOL.pet_kitten.light', nose: 'PETCOL.pet_kitten.nose',
      inner: 'PETCOL.pet_kitten.light', whisker: 'Ink', eye: 'Midnight Ink', glint: 'Cloud White', blush: 'Blush', mouth: 'Midnight Ink' },
    { pivots: PET_SOCKETS, bones: PET_BONES, idle: { type: 'actor' }, hit: [0.8, 0.8, 0.8], tris: BUDGET.pet });
  def('pet_bunny', 'pet', 0.55,
    { body: 'PETCOL.pet_bunny.body', dark: 'PETCOL.pet_bunny.dark', light: 'PETCOL.pet_bunny.light', nose: 'PETCOL.pet_bunny.nose',
      inner: 'Bunny Ear', tail: 'Cloud White', eye: 'Midnight Ink', glint: 'Cloud White', blush: 'Blush', mouth: 'Midnight Ink' },
    { pivots: PET_SOCKETS, bones: PET_BONES, idle: { type: 'actor' }, hit: [0.8, 0.8, 0.8], tris: BUDGET.pet });
  def('pet_dragon', 'pet', 0.65,
    { body: 'PETCOL.pet_dragon.body', dark: 'PETCOL.pet_dragon.dark', light: 'PETCOL.pet_dragon.light', nose: 'PETCOL.pet_dragon.nose',
      spines: 'PETCOL.pet_dragon.dark', horns: 'Star Gold', wings: 'PETCOL.pet_dragon.light', eye: 'Midnight Ink', glint: 'Cloud White', blush: 'Blush', mouth: 'Midnight Ink' },
    { pivots: PET_SOCKETS, bones: PET_BONES, idle: { type: 'actor' }, hit: [0.8, 0.8, 0.8], tris: BUDGET.pet });
  def('acc_partyhat', 'acc', 0.16, { cone: 'Grape', stripe: 'Star Gold', pompom: 'Coral' }, { socket: 'hat', tris: BUDGET.acc });
  def('acc_crown', 'acc', 0.1, { band: 'Gold Base', gem: 'Rose Deep' },
    { socket: 'hat', mats: { band: 'gold' }, idle: { type: 'glint', n: 1, period: TEMPO.idle.crownGlint }, tris: BUDGET.acc });
  def('acc_bow', 'acc', 0.08, { bow: 'Rose Deep', spot: 'Cloud White', knot: 'Star Gold' }, { socket: 'neck', tris: BUDGET.acc });
  def('acc_scarf', 'acc', 0.08, { scarf: 'Splash Blue', stripe: 'Coral' }, { socket: 'neck', tris: BUDGET.acc });
  /* one wraparound shield lens; FOIL at night */
  def('acc_shades', 'acc', 0.05, { lens: 'Midnight Ink', frame: 'Midnight Ink', glint: 'Cloud White' }, { socket: 'face', show: { foil: ['lens'] }, tris: BUDGET.acc });
  def('acc_cape', 'acc', 0.3, { cape: 'Cape Red', clasp: 'Gunmetal' },
    { socket: 'back', mats: { clasp: 'gunmetal' }, perCopy: ['cloth'], idle: { type: 'cloth', amp: 0.06 }, tris: BUDGET.acc });
  /* streetwear (fixed tokens so photocards stay stable) */
  def('acc_beanie', 'acc', 0.1, { knit: 'Concrete Light', rib: 'Graphite', cuff: 'Concrete Light', tag: 'Laser Lime' },
    { socket: 'hat', mats: { tag: 'neon:Laser Lime' }, tris: BUDGET.acc });
  def('acc_cap', 'acc', 0.06, { crown: 'Graphite', brim: 'Graphite', under: 'Graphite', underOn: 'Neon Magenta' },
    { socket: 'hat', mats: { under: 'state' }, show: { neon: ['Neon Magenta'] }, tris: BUDGET.acc });
  def('acc_headphones', 'acc', 0.08, { band: 'Graphite', cup: 'Gunmetal', ring: 'LED Cyan' },
    { socket: 'neck', mats: { ring: 'state' }, show: { pulse: { on: 'beat', hz: SHOW_BEAT_HZ, pct: 20 }, neon: ['LED Cyan'] }, tris: BUDGET.acc });
  def('acc_visor', 'acc', 0.04, { band: 'Smoked Glass', line: 'LED Cyan', dot: 'Bone White' },
    { socket: 'face', mats: { band: 'smoked', line: 'neon:LED Cyan' }, show: { scan: { hz: 1 } }, tris: BUDGET.acc });
  def('acc_hoodie', 'acc', 0.3, { body: 'Graphite', hood: 'Graphite', string: 'Neon Magenta' },
    { socket: 'back', mats: { string: 'neon:Neon Magenta' }, tris: BUDGET.acc });

  /* -- land: drawn by env.js (h = the highest surface: Meadow Hill rises to 0.45) -- */
  def('land_cove', 'land', 0,
    { top: 'Dune', side: 'Wet Dune', tide: 'Wet Dune', shell: 'Blossom Light', starfish: 'Peach Coral', locked: 'Sandbar', edge: 'Neon Cyan' }, { tris: 2000 });
  def('land_meadow', 'land', 0.45,
    { top: 'Hill Moss', side: 'Cliff Rock', w1: 'Cloud White', w2: 'Tulip Yellow', w3: 'Tulip Pink', locked: 'Sandbar', edge: 'Neon Cyan' }, { tris: 2000 });

  /* -- attractions -- */
  def('att_pitch', 'attraction', 0.4,
    { grass: 'STADIA.$stadium.1', sky: 'STADIA.$stadium.0', line: 'Cloud White', post: 'Cloud White', net: 'Cloud White', stand: 'Pebble',
      ball: 'BALLS.$ball.0', ballPatch: 'BALLS.$ball.1', fanA: 'Crowd Shadow', fanB: 'Crowd Shadow 2', fanC: 'Crowd Shadow 3', fanD: 'Graphite', wand: 'Cloud White' },
    { pivots: ['ball', 'crowd'], anchors: ['top', 'spot'], actPivot: 'ball', show: { neon: NEON4, wands: true }, tris: BUDGET.attraction, crowdTris: BUDGET.crowd });
  def('att_kart', 'attraction', 1.4,
    { garage: 'Graphite', door: 'Roller Door', slat: 'Door Slat', checkA: 'Midnight Ink', checkB: 'Cloud White', sign: 'Laser Lime', tyre: 'Ink', kart: 'KARTS.$kart' },
    { pivots: ['kart'], anchors: ['top', 'spot'], actPivot: 'kart', mats: { sign: 'neon:Laser Lime' }, show: { neon: ['Laser Lime'] }, tris: BUDGET.attraction });

  /* -- city buildings (CATALOG kind 'fun', cat 'city'): no hull, never jittered; ≤ 4 meshes and
     ≤ 4 materials each; 3 trims by variantOf(uid, id) (BUILDING_TRIMS: 'accent' resolves per trim).
     Static shells cast into the static shadow map; moving bits use blob shadows. -- */
  def('bld_photobooth', 'building', 1.6,
    { body: 'Night Asphalt', panel: 'Graphite', accent: '@member', curtain: 'Primary Pink', rod: 'Gunmetal', bezel: 'Gunmetal',
      lens: 'Smoked Glass', bulb: 'Gunmetal Mid', bulbOn: 'Window Warm', slot: 'Midnight Ink', kick: 'Gunmetal',
      sign: 'Neon Magenta', signText: 'Bone White', star: 'Star Gold', strip: 'Bone White' },
    { pivots: ['flash', 'strip'], anchors: ['top', 'spot', 'strip'], actPivot: 'flash', perCopy: ['cloth'],
      mats: { lens: 'smoked', bulb: 'state', sign: 'sign' }, idle: { type: 'cloth', amp: 0.02 },
      show: { neon: ['Neon Magenta'], chase: { hz: 0.5, groups: 2, bulbs: 8 }, halo: { token: 'Window Warm', size: 0.3 }, windowGlow: { token: 'Window Warm' } },
      tris: 900 });
  def('bld_boba', 'building', 1.95,
    { body: 'Concrete', band: 'Bone White', accent: '@member', glass: 'Smoked Glass', glassGlow: 'Window Warm', counter: 'Teak',
      cup: 'Bone White', liquid: 'Milk Tea', pearl: 'Midnight Ink', straw: '@member', lid: 'Bone White',
      awning: 'Bone White', awningEdge: 'Neon Magenta', table: 'Teak', stool: 'Gunmetal' },
    { pivots: ['hatch', 'pearls', 'cup'], anchors: ['top', 'spot', 'seat'], actPivot: 'hatch',
      mats: { glass: 'state', cup: 'pearl', awningEdge: 'neon:Neon Magenta' },
      idle: { type: 'bob', pct: 2, period: TEMPO.idle.flowerBob, pivot: 'pearls' },
      show: { neon: ['Neon Magenta'], halo: { token: 'Neon Magenta', size: 0.7 }, windowGlow: { token: 'Window Warm' } },
      tris: 1300 });
  def('bld_ledtower', 'building', 2.5,
    { plinth: 'Concrete', leg: 'Gunmetal', brace: 'Gunmetal Mid', ladder: 'Gunmetal Mid', bezel: 'Graphite', screen: 'Bone White',
      cap: 'Gunmetal', antenna: 'Gunmetal', beacon: 'Neon Magenta', accent: '@member' },
    { pivots: ['screen', 'beacon'], anchors: ['top', 'spot'], actPivot: 'screen', mats: { screen: 'led', beacon: 'state' },
      idle: { type: 'breathe', hz: 0.5, min: 0.6, pivot: 'beacon' }, loops: [{ type: 'scroll', speed: 0.125, pivot: 'screen' }],
      show: { halo: { token: 'Electric Violet', size: 1.1 }, screen: { autoBars: 8, dayLevel: 0.7, photocard: 'stars' } },
      tris: 900 });
  def('bld_recording', 'building', 1.85,
    { body: 'Graphite', plinth: 'Concrete', accent: '@member', foam: 'Night Asphalt', door: 'Gunmetal', sign: 'Neon Magenta',
      signOff: 'Gunmetal Mid', porthole: 'Gunmetal', glass: 'Smoked Glass', glassGlow: 'Window Warm', mic: 'Gunmetal Spec',
      meterLo: 'Laser Lime', meterHi: 'Neon Magenta', band: 'Gunmetal', cup: 'Graphite', ring: 'Electric Violet' },
    { pivots: ['meter', 'mic', 'phones'], anchors: ['top', 'spot'], actPivot: 'meter',
      mats: { sign: 'sign', glass: 'state', ring: 'neon:Electric Violet', meter: 'state' },
      show: { neon: ['Electric Violet', 'LED Cyan'], halo: { token: 'Electric Violet', size: 0.4 }, windowGlow: { token: 'Window Warm' } },
      tris: 1600 });
  def('bld_dance', 'building', 2.25,
    { body: 'Concrete', upper: 'Concrete Light', frame: 'Bone White', glass: 'Smoked Glass', mirror: 'Chrome', floor: 'Bone White',
      fin: '@member', accent: '@member', sign: 'Neon Magenta', speaker: 'Graphite', cone: 'Gunmetal', glow: 'Holo Pink' },
    /* the sign is the sneaker-and-motion-lines pictogram in 'state' neon, keeping 4 materials */
    { pivots: ['floor', 'speaker'], anchors: ['top', 'spot'], actPivot: 'floor',
      mats: { glass: 'smoked', mirror: 'chrome', floor: 'state', sign: 'state' },
      show: { neon: NEON4, chase: { on: 'beat', hz: SHOW_BEAT_HZ, groups: 4, tiles: 6, tokens: NEON4 },
              halo: { token: 'Neon Magenta', size: 0.9 }, windowGlow: { token: 'Holo Pink' } },
      tris: 2600 });
  def('bld_rooftop', 'building', 2.3,
    { body: 'Chimney', course: 'Chimney Cap', lintel: 'Concrete Light', glass: 'Smoked Glass', glassGlow: 'Window Warm', frame: 'Gunmetal',
      door: 'Gunmetal Mid', stair: 'Gunmetal', deck: 'Teak', rail: 'Smoked Glass', beanA: 'Grape', beanB: 'Splash Blue', accent: '@member',
      bulb: 'Gunmetal Mid', bulbOn: 'Sunset Amber', scope: 'Gunmetal', palm: 'Leaf Deep', pot: 'Concrete', star: 'Star Gold' },
    { pivots: ['deck', 'scope', 'bulbs'], anchors: ['top', 'spot', 'roof'], actPivot: 'deck',
      mats: { glass: 'state', rail: 'smoked', bulb: 'state' },
      show: { halo: { token: 'Sunset Amber', size: 0.25 }, windowGlow: { token: 'Window Warm' },
              decal: { token: 'Electric Violet', r: FX.uplight.r, opacity: FX.uplight.show } },
      tris: 2700 });
  def('bld_stage', 'building', 2.45,
    { deck: 'Night Asphalt', edge: 'LED Cyan', step: 'Graphite', wall: 'Bone White', bezel: 'Midnight Ink', truss: 'Gunmetal',
      head: 'Graphite', lens: 'Bone White', speaker: 'Graphite', cone: 'Gunmetal', foot: 'Gunmetal Mid', footOn: 'Window Warm', accent: '@member' },
    { pivots: ['lights', 'head0', 'head1', 'head2', 'head3', 'crowd'], anchors: ['top', 'spot', 'cone0', 'cone1', 'cone2'], actPivot: 'lights',
      mats: { edge: 'neon:LED Cyan', wall: 'led', foot: 'state' },
      idle: { type: 'scroll', speed: 0.05, pivot: 'lights' },
      show: { neon: ['LED Cyan'], chase: { on: 'beat', hz: SHOW_BEAT_HZ, groups: 4, bulbs: 8 },
              beams: { alpha: 0.18, tokens: NEON4, hz: TEMPO.idle.coneHz }, halo: { token: 'Window Warm', size: 0.4 } },
      tris: BUDGET.attraction, crowdTris: 600 });

  /* -- course variants (dressing on the gate) -- */
  def('course_beach', 'variant', 1.9, { plate: 'THEME.course_beach.0', banner: 'THEME.course_beach.1', crab: 'Coral', shell: 'Blossom Light' },
    { slot: 'course', base: 'att_course', tris: 600 });
  def('course_snow', 'variant', 1.9, { plate: 'THEME.course_snow.0', banner: 'THEME.course_snow.1', snow: 'Snow', hat: 'Ink', carrot: 'Carrot' },
    { slot: 'course', base: 'att_course', tris: 600 });
  def('course_candy', 'variant', 1.9,
    { plate: 'THEME.course_candy.0', banner: 'THEME.course_candy.1', stick: 'Cloud White', lolly: 'Tulip Pink', gumA: 'Grape', gumB: 'Leaf Mint', gumC: 'Star Gold' },
    { slot: 'course', base: 'att_course', tris: 600 });

  /* -- penalty cosmetics (ball r 0.11; stadium = the pitch's dressing) -- */
  def('ball_classic', 'cosmetic', 0.22, { body: 'BALLS.ball_classic.0', patch: 'BALLS.ball_classic.1', trail: 'BALLS.ball_classic.1' }, { slot: 'ball', base: 'ball', tris: BUDGET.ball });
  def('ball_rainbow', 'cosmetic', 0.22,
    { body: 'BALLS.ball_rainbow.0', trail: 'BALLS.ball_rainbow.1', b1: 'Coral', b2: 'Rainbow Orange', b3: 'Star Gold', b4: 'Leaf Mint', b5: 'Splash Blue', b6: 'Grape' },
    { slot: 'ball', base: 'ball', tris: BUDGET.ball });
  def('ball_planet', 'cosmetic', 0.22, { body: 'BALLS.ball_planet.0', ring: 'BALLS.ball_planet.1', trail: 'BALLS.ball_planet.1' }, { slot: 'ball', base: 'ball', tris: BUDGET.ball });
  def('ball_gold', 'cosmetic', 0.22, { body: 'BALLS.ball_gold.0', accent: 'BALLS.ball_gold.1', trail: 'BALLS.ball_gold.1' },
    { slot: 'ball', base: 'ball', mats: { body: 'gold' }, tris: BUDGET.ball });
  def('stadium_day', 'cosmetic', 0.4, { sky: 'STADIA.stadium_day.0', grass: 'STADIA.stadium_day.1' }, { slot: 'stadium', base: 'att_pitch', tris: 1200 });
  def('stadium_night', 'cosmetic', 0.4, { sky: 'STADIA.stadium_night.0', grass: 'STADIA.stadium_night.1', flood: 'Lamp Halo', pole: 'Pole' },
    { slot: 'stadium', base: 'att_pitch', tris: 1200 });
  def('stadium_beach', 'cosmetic', 0.4, { sky: 'STADIA.stadium_beach.0', grass: 'STADIA.stadium_beach.1', sand: 'Sand', palm: 'Frond', trunk: 'Palm Bark', sea: 'Sea Shallow' },
    { slot: 'stadium', base: 'att_pitch', tris: 1200 });
  def('stadium_snow', 'cosmetic', 0.4, { sky: 'STADIA.stadium_snow.0', grass: 'STADIA.stadium_snow.1', snow: 'Snow' }, { slot: 'stadium', base: 'att_pitch', tris: 1200 });

  /* -- kart cosmetics (0.9 u long, LOCKED body, neon under-glow) and tracks -- */
  function kart(id, glow, extra, mats) {
    var c = { body: 'KARTS.' + id, wheel: 'Ink', hub: 'Pebble', trim: 'Chrome', glow: glow };
    for (var k in extra) c[k] = extra[k];
    var m = { trim: 'chrome', glow: 'neon:' + glow };
    for (var j in (mats || {})) m[j] = mats[j];
    def(id, 'cosmetic', 0.4, c, { slot: 'kart', base: 'kart', pivots: ['seat'], mats: m, show: { neon: [glow] }, tris: BUDGET.kart });
  }
  kart('kart_red', 'Neon Pink', {});
  kart('kart_blue', 'Neon Cyan', { stripe: 'Cloud White', fin: 'Cloud White' });
  kart('kart_lime', 'Neon Lime', { bolt: 'Star Gold' });
  kart('kart_unicorn', 'Neon Pink', { horn: 'Gold Base', m1: 'Coral', m2: 'Rainbow Orange', m3: 'Star Gold', m4: 'Leaf Mint', m5: 'Splash Blue', m6: 'Grape' }, { horn: 'gold' });
  kart('kart_gold', 'Star Gold', { star: 'Star Gold' }, { body: 'gold' });
  var trackBase = { asphalt: 'Asphalt', line: 'Cloud White', kerbA: 'Coral', kerbB: 'Cloud White' };
  function track(id, extra) {
    var c = { grass: 'TRACKS.' + id + '.grass' }, k;
    for (k in trackBase) c[k] = trackBase[k];
    for (k in extra) c[k] = extra[k];
    def(id, 'variant', 0.6, c, { slot: 'track', base: 'track', instancing: 'scene', tris: 2000 });
  }
  track('track_loop', { palm: 'Frond', trunk: 'Palm Bark', sea: 'Sea Shallow' });
  track('track_volcano', { cone: 'Volcano Rock', lava: 'Peach Coral', smoke: 'Iridescent Rim', skyA: 'Sunset Peach', skyB: 'Dusk Violet' });
  track('track_beach', { sea: 'Sea Shallow', hutA: 'Coral', hutB: 'Cloud White', umbrella: 'Splash Blue' });

  /* ---------------- characters that are not catalogue items ---------------- */
  /* v2: the idol-style chibi in a hoodie (the face stays the child's emoji), the 4-point ✦
     Spark Stick (never 5-pointed) and a silhouette crowd lit by its own Spark Sticks */
  var CHARACTERS = {
    avatar: { kind: 'avatar', h: 1.0,
              colors: { hood: '@member', hoodie: 'Graphite', band: '@member', legs: 'Night Asphalt', sneaker: 'Bone White', mic: 'Gunmetal',
                        hand: 'Bone White', string: 'Bone White' },
              outline: true, anchors: ['top', 'hand'], hit: [0.8, 0.8, 0.8], tris: BUDGET.avatar, trisLow: 1050,
              idle: { type: 'shift', period: 2.4 }, loops: [{ type: 'glance', every: TEMPO.idle.avatarGlance }] },
    wand: { kind: 'wand', h: 0.26, colors: { handle: 'Midnight Ink', grip: '@member', collar: 'Gunmetal', head: '@member', core: 'Bone White' },
            mats: { head: 'neon:@member' }, points: 4, outline: false, tris: 260 },
    fanBlob: { kind: 'fan', h: 0.3,
               colors: { a: 'Crowd Shadow', b: 'Crowd Shadow 2', c: 'Crowd Shadow 3', eye: 'Bone White',
                         day1: 'Splash Blue', day2: 'Grape', day3: 'Leaf Mint', day4: 'Coral', day5: 'Butter', day6: 'Concrete Light' },
               outline: false, tris: 50 }
  };
  var MEMBER_FALLBACK = 'Bubblegum';

  /* ---------------- light / sky / water / fog presets ----------------
     v2: DUSK (golden hour) is the default (k = 0) and SHOW is Showtime (k = 1). The sun and
     the moon share ONE fixed direction, so the static shadow map never re-renders for light.
     rimMember = how much of the member colour the rim takes. DAY and SHOW_V1 are the v1
     pastel pair, kept for scenes that copied them (the kart game's light arc). */
  var SUN_POS = [-9, 7.5, 8];
  var DUSK = {
    hemiSky: 'Hemi Dusk Sky', hemiGround: 'Hemi Dusk Ground', hemiIntensity: 1.35,
    sunColor: 'Sun Dusk', sunIntensity: 2.2, sunPos: SUN_POS,
    fogColor: 'Dusk Fog', fogNear: 28, fogFar: 72, exposure: 1.05,
    rimColor: 'Rim Dusk', rimStrength: 0.35, rimMember: 0.25,
    skyTop: 'Dusk Zenith', skyMid: 'Dusk Mid', skyHorizon: 'Dusk Horizon',
    seaShallow: 'Lagoon', seaDeep: 'Deep Bay', foam: 'Foam Dusk', waveLine: 'Wave Dusk',
    neonSleeve: 0.25, haloScale: 1.2, haloOpacity: 0.6, stars: 0.25, cones: 0, glints: 1, windowGlow: 0.6
  };
  var SHOW = {
    hemiSky: 'Hemi Night Sky', hemiGround: 'Hemi Night Ground', hemiIntensity: 0.75,
    sunColor: 'Moon V2', sunIntensity: 0.8, sunPos: SUN_POS,
    fogColor: 'Night Mid', fogNear: 22, fogFar: 58, exposure: 1.10,
    rimColor: 'Rim Night', rimStrength: 0.6, rimMember: 0.5,
    skyTop: 'Night Zenith', skyMid: 'Night Mid', skyHorizon: 'City Glow',
    seaShallow: 'Night Lagoon', seaDeep: 'Night Deep', foam: 'Foam Night', waveLine: 'Holo Blue',
    neonSleeve: 0.45, haloScale: 1.6, haloOpacity: 0.9, stars: 1, cones: 1, glints: 0, windowGlow: 1
  };
  var DAY = {
    hemiSky: 'Hemi Sky Day', hemiGround: 'Hemi Ground Day', hemiIntensity: 1.9,
    sunColor: 'Sun Day', sunIntensity: 2.4, sunPos: [-7, 14, 9],
    fogColor: 'Sky Day Horizon', fogNear: 30, fogFar: 70, exposure: 1.0,
    rimColor: 'Cloud White', rimStrength: 0.28, rimMember: 0,
    skyTop: 'Sky Day Top', skyMid: 'Sky Day Mid', skyHorizon: 'Sky Day Horizon',
    seaShallow: 'Sea Shallow', seaDeep: 'Sea Deep', foam: 'Foam', waveLine: 'Wave Line',
    neonSleeve: 0, haloScale: 1, haloOpacity: 0.5, stars: 0, cones: 0, glints: 1, windowGlow: 0
  };
  var SHOW_V1 = {
    hemiSky: 'Hemi Sky Show', hemiGround: 'Hemi Ground Show', hemiIntensity: 0.85,
    sunColor: 'Moon', sunIntensity: 0.9, sunPos: [-7, 14, 9],
    fogColor: 'Sky Night Mid', fogNear: 24, fogFar: 60, exposure: 1.08,
    rimColor: 'Rim Showtime', rimStrength: 0.55, rimMember: 0.4,
    skyTop: 'Sky Night Top', skyMid: 'Sky Night Mid', skyHorizon: 'Sky Night Horizon',
    seaShallow: 'Sea Shallow Show', seaDeep: 'Sea Deep Show', foam: 'Foam Show', waveLine: 'Holo Blue',
    neonSleeve: 0.45, haloScale: 1.6, haloOpacity: 0.9, stars: 1, cones: 1, glints: 0, windowGlow: 1
  };
  var PRESET_KEYS = Object.keys(DAY);
  var PRESET_COLOR_KEYS = PRESET_KEYS.filter(function (k) { return typeof DAY[k] === 'string'; });

  /* ---------------- colour maths ---------------- */
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function normHex(h) {
    if (typeof h !== 'string') return null;
    var m = /^#?([0-9a-f]{6})$/i.exec(h.trim());
    return m ? '#' + m[1].toUpperCase() : null;
  }
  function hexToRgb(h) { var n = parseInt(normHex(h).slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function rgbToHex(r, g, b) {
    function c(v) { var s = Math.round(Math.max(0, Math.min(255, v))).toString(16).toUpperCase(); return s.length < 2 ? '0' + s : s; }
    return '#' + c(r) + c(g) + c(b);
  }
  function mixHex(a, b, k) {
    var x = hexToRgb(a), y = hexToRgb(b); k = clamp01(k);
    return rgbToHex(x[0] + (y[0] - x[0]) * k, x[1] + (y[1] - x[1]) * k, x[2] + (y[2] - x[2]) * k);
  }
  /* shift HSL lightness by dL percentage points (+12 highlight, -12 shade, -6 skirting) */
  function tone(h, dL) {
    var c = hexToRgb(h), r = c[0] / 255, g = c[1] / 255, b = c[2] / 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, s = 0, hu = 0, d = mx - mn;
    if (d) {
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      hu = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
      hu /= 6;
    }
    l = clamp01(l + dL / 100);
    function f(p, q, t) { if (t < 0) t += 1; if (t > 1) t -= 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; }
    if (!s) return rgbToHex(l * 255, l * 255, l * 255);
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    return rgbToHex(f(p, q, hu + 1 / 3) * 255, f(p, q, hu) * 255, f(p, q, hu - 1 / 3) * 255);
  }

  /* ---------------- token resolution ---------------- */
  function sel(st, slot) { var v = st && st[slot]; return typeof v === 'string' && v ? v : SLOT_DEFAULTS[slot]; }
  function own(o, k) { return o != null && Object.prototype.hasOwnProperty.call(o, k); }
  /* 'Grass Top' | 'WALL.wall_pink' | 'WALL.$wall' | 'THEMES.course_snow.obs.low.0' | '@member' */
  function hex(token, st) {
    if (typeof token !== 'string' || !token) return null;
    if (token.charAt(0) === '@') {
      if (token === '@member') return normHex(st && st.member) || PALETTE[MEMBER_FALLBACK];
      return null;
    }
    if (own(PALETTE, token)) return PALETTE[token];
    if (own(PALETTE_V2, token)) return PALETTE_V2[token];
    if (own(ART2D, token)) return ART2D[token];
    if (own(EXTRA, token)) return EXTRA[token];
    var parts = token.split('.');
    if (parts.length < 2 || !own(LOCKED, parts[0])) return null;
    var cur = LOCKED[parts[0]];
    for (var i = 1; i < parts.length; i++) {
      var p = parts[i];
      if (p.charAt(0) === '$') p = sel(st, p.slice(1));
      if (!own(cur, p)) return null;
      cur = cur[p];
    }
    return normHex(cur);
  }
  function isToken(token) {
    if (typeof token !== 'string') return false;
    if (token.indexOf('$') >= 0) return hex(token, {}) != null;
    return hex(token) != null;
  }
  /* every colour token an entry references: colors values, show.neon[], and any
     {token} / {tokens: []} object inside show, idle, loops or mats ('neon:<Token>') */
  function tokensIn(e) {
    var out = [];
    function walk(o) {
      if (!o || typeof o !== 'object') return;
      if (Array.isArray(o)) { o.forEach(walk); return; }
      Object.keys(o).forEach(function (k) {
        var v = o[k];
        if (k === 'token' && typeof v === 'string') out.push(v);
        else if ((k === 'tokens' || k === 'neon') && Array.isArray(v)) v.forEach(function (t) { if (typeof t === 'string') out.push(t); });
        else walk(v);
      });
    }
    if (!e) return out;
    Object.keys(e.colors || {}).forEach(function (k) { out.push(e.colors[k]); });
    Object.keys(e.mats || {}).forEach(function (k) { var m = e.mats[k]; if (/^neon:/.test(m)) out.push(m.slice(5)); });
    walk(e.show); walk(e.idle); walk(e.loops);
    return out;
  }
  function colorsFor(id, st) {
    var e = LOOK[id] || CHARACTERS[id], out = {};
    if (!e) return out;
    Object.keys(e.colors).forEach(function (k) { out[k] = hex(e.colors[k], st); });
    return out;
  }

  /* ---------------- style state ---------------- */
  var HOUSE_SLOTS = { wall: 1, roof: 1, door: 1, shape: 1 };
  function detailList(d) {
    var list = Array.isArray(d) ? d.filter(function (x) { return typeof x === 'string'; })
      : (d && typeof d === 'object' ? Object.keys(d).filter(function (k) { return d[k]; }) : []);
    var seen = {}, out = [];
    list.forEach(function (x) { if (/^detail_/.test(x) && own(LOOK, x) && !seen[x]) { seen[x] = 1; out.push(x); } });
    return out.sort();
  }
  function isShape(id) { return typeof id === 'string' && own(LOOK, id) && LOOK[id].slot === 'shape'; }
  function variantCount(id) { return own(VARIANTS, id) ? VARIANTS[id] : 1; }
  function clampVariant(v, id) { var n = variantCount(id), x = v | 0; return x < 0 ? 0 : x >= n ? n - 1 : x; }
  /* {wall, roof, door, details[], shape, variant}. An unknown shape (from a newer save)
     falls back to the default; the cottage has a single trim, so its variant is 0. */
  function houseState(st, override) {
    var s = { wall: sel(st, 'wall'), roof: sel(st, 'roof'), door: sel(st, 'door'), details: detailList(st && st.details),
              shape: sel(st, 'shape'), variant: 0 };
    if (override) {
      var e = LOOK[override];
      if (e && e.part === 'detail') { if (s.details.indexOf(override) < 0) s.details = s.details.concat([override]).sort(); }
      else if (e && HOUSE_SLOTS[e.slot]) s[e.slot] = override;
    }
    if (!isShape(s.shape)) s.shape = SLOT_DEFAULTS.shape;
    s.variant = s.shape === 'shape_cottage' ? 0 : clampVariant(st && st.variant, s.shape);
    /* the castle has its own pennants, so the rooftop flag is hidden (same rule as 2D) */
    if (s.roof === 'roof_castle') s.details = s.details.filter(function (x) { return x !== 'detail_flag'; });
    return s;
  }
  /* the cottage keeps the exact v1 key; every other shape appends its shape and trim */
  function houseKey(s) {
    var k = s.wall + '|' + s.roof + '|' + s.door + '|d:' + s.details.join(',');
    return s.shape === 'shape_cottage' ? k : k + '|s:' + s.shape + '|v:' + s.variant;
  }
  function crownTris(shape, roof) {
    if (shape === 'shape_cottage') return (LOOK[roof] || LOOK[SLOT_DEFAULTS.roof]).tris;
    return roof === 'roof_castle' ? HOUSE_TRIS.crownCastle : HOUSE_TRIS.crown;
  }
  /* the triangle budget of one house state: body + crown + door + every detail shown */
  function houseBudget(st) {
    var s = houseState(st), t = HOUSE_TRIS.body[s.shape] + crownTris(s.shape, s.roof) + HOUSE_TRIS.door;
    s.details.forEach(function (d) { t += LOOK[d].tris; });
    return t;
  }
  var ACC_SLOTS = ['hat', 'neck', 'face', 'back'];
  function accState(acc, add) {
    var out = {};
    ACC_SLOTS.forEach(function (sl) {
      var v = acc && acc[sl];
      if (typeof v === 'string' && LOOK[v] && LOOK[v].socket === sl) out[sl] = v;
    });
    if (add && LOOK[add] && LOOK[add].socket) out[LOOK[add].socket] = add;
    return out;
  }
  /* the ctx.st handed to a build: {wall, roof, door, details[], shape, variant} for the house
     and every home style (styles and shapes preview on the player's own house), {course}
     for the gate and course variants, {ball, stadium} for the pitch, {kart} for the garage,
     {acc} for pets, {pet, acc} for accessories (they preview on the active pet), {variant}
     for city buildings, {} otherwise */
  function resolveStyle(id, st) {
    var e = LOOK[id];
    if (!e) return {};
    if (id === 'house_cottage') return houseState(st);
    if (e.kind === 'style') return houseState(st, id);
    if (id === 'att_course') return { course: sel(st, 'course') };
    if (id === 'att_pitch') return { ball: sel(st, 'ball'), stadium: sel(st, 'stadium') };
    if (id === 'att_kart') return { kart: sel(st, 'kart') };
    if (e.kind === 'building') return { variant: clampVariant(st && st.variant, id) };
    if (e.kind === 'pet') return { acc: accState(st && st.acc) };
    if (e.kind === 'acc') {
      var pet = st && typeof st.pet === 'string' && LOOK[st.pet] && LOOK[st.pet].kind === 'pet' ? st.pet : 'pet_puppy';
      return { pet: pet, acc: accState(st && st.acc, id) };
    }
    return {};
  }
  function accKey(acc) { return 'a:' + ACC_SLOTS.filter(function (s) { return acc[s]; }).map(function (s) { return acc[s]; }).sort().join(','); }
  /* stable cache key per (id, resolved style); 'base' for items with one look */
  function stateKey(id, st) {
    var e = LOOK[id];
    if (!e) return 'base';
    var s = resolveStyle(id, st);
    if (id === 'house_cottage' || e.kind === 'style') return houseKey(s);
    if (id === 'att_course') return s.course;
    if (id === 'att_pitch') return s.ball + '|' + s.stadium;
    if (id === 'att_kart') return s.kart;
    if (e.kind === 'building') return 'v:' + s.variant;
    if (e.kind === 'pet') return accKey(s.acc);
    if (e.kind === 'acc') return s.pet + '|' + accKey(s.acc);
    return 'base';
  }
  function heightOf(id, st) {
    var e = LOOK[id];
    if (!e) return 0;
    if (id === 'house_cottage') {
      var s = houseState(st), row = HOUSE_H[s.shape];
      return own(row, s.roof) ? row[s.roof] : row[SLOT_DEFAULTS.roof];
    }
    return e.h;
  }

  /* ---------------- deterministic variety (never random at purchase) ---------------- */
  /* FNV-1a 32-bit (the same hash as SLMotion.hash / SLGrid3D) */
  function fnv(s) {
    s = String(s);
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
  }
  /* an independent [0, 1) value per (seed, n) */
  function mix01(seed, n) {
    var h = (seed ^ Math.imul(n | 0, 0x9E3779B1)) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x85EBCA6B) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  /* the trim of one placed copy: FNV-1a(uid|id) modulo VARIANTS[id] (0 for single-look ids) */
  function variantOf(uid, id) {
    var n = variantCount(id);
    return n > 1 ? fnv(String(uid) + '|' + id) % n : 0;
  }
  function trimOf(id, variant) {
    var v = clampVariant(variant, id);
    return { accent: BUILDING_TRIMS.accent[v % 3], signSide: BUILDING_TRIMS.signSide[v % 2], stripe: BUILDING_TRIMS.stripe[v % 3] };
  }
  /* small decor turns by a fixed step only; organic items whose colour the CATALOG names
     (red apples, pink blossom and roses) keep their hue and vary lightness by ±4% only */
  var JITTER_RULES = {
    smallDecor: ['bench', 'umbrella', 'lantern', 'sandcastle', 'snowman', 'flag_pole', 'bunting'],
    smallDecorYaw: [-20, 0, 20],
    namedColour: ['tree_apple', 'tree_blossom', 'bush_rose'],
    neighbourYaw: 120, neighbourScale: 0.06
  };
  function identityJitter(out) {
    out.yaw = 0; out.sx = 1; out.sy = 1; out.sz = 1; out.lean = 0; out.leanAxis = 0; out.tint = null;
    return out;
  }
  function jitterBase(uid, id, out) {
    identityJitter(out);
    var e = LOOK[id];
    if (!e) return out;
    var s = fnv(String(uid) + '|' + id);
    if (ORGANIC_KINDS[e.kind]) {
      out.yaw = mix01(s, 0) * 360;
      out.sx = out.sz = Math.min(1.1, 0.9 + 0.2 * mix01(s, 1));
      out.sy = 0.88 + 0.24 * mix01(s, 2);
      if (e.kind === 'tree' || e.kind === 'flower') { out.lean = (mix01(s, 3) * 2 - 1) * 3; out.leanAxis = mix01(s, 4) * 360; }
      var named = JITTER_RULES.namedColour.indexOf(id) >= 0, foliage = !named && (e.kind === 'tree' || e.kind === 'bush');
      out.tint = { l: named ? 0.96 + 0.08 * mix01(s, 5) : 0.93 + 0.12 * mix01(s, 5), h: foliage ? (mix01(s, 6) * 2 - 1) * 5 : 0 };
    } else if (JITTER_RULES.smallDecor.indexOf(id) >= 0) out.yaw = JITTER_RULES.smallDecorYaw[s % 3];
    return out;
  }
  function uidOrder(a, b) {
    var ma = /^p(\d+)$/.exec(String(a)), mb = /^p(\d+)$/.exec(String(b));
    if (ma && mb) return (+ma[1]) - (+mb[1]);
    return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
  }
  var _nb = {};
  /* placement variety for one copy → {yaw (deg), sx, sy, sz, lean (deg), leanAxis (deg about
     +y), tint {l: lightness ×, h: hue °} | null}. Organic decor: full yaw, non-uniform scale,
     a lean (trees and flowers) and a tint; small decor: yaw from {-20, 0, +20}; anything
     else (houses, buildings, attractions, paths, fun) is the identity. A 4-adjacent copy of
     the same id with an EARLIER uid pushes this one +120° round and ≥ 0.06 the other way in
     scale, so neighbours never look cloned. */
  function jitter2(uid, id, sameIdNeighbours, out) {
    out = jitterBase(uid, id, out || {});
    var e = LOOK[id];
    if (!e || !ORGANIC_KINDS[e.kind] || !Array.isArray(sameIdNeighbours) || !sameIdNeighbours.length) return out;
    var first = null;
    sameIdNeighbours.forEach(function (n) { if (uidOrder(n, uid) < 0 && (first === null || uidOrder(n, first) < 0)) first = n; });
    if (first === null) return out;
    var nb = jitterBase(first, id, _nb), k = JITTER_RULES.neighbourScale;
    out.yaw = (nb.yaw + JITTER_RULES.neighbourYaw) % 360;
    out.sx = out.sz = nb.sx >= 1 ? Math.min(out.sx, nb.sx - k) : Math.max(out.sx, nb.sx + k);
    return out;
  }

  /* ---------------- path auto-tiling ----------------
     mask bits: N 1 · E 2 · S 4 · W 8 (N = -z). Canonical pieces at yaw 0: end opens N,
     straight N-S, corner N+E, tee N+E+W. yawDeg turns the piece about +y (three.js: +90°
     carries N onto W). */
  function rotMask(m) { return (m & 1 ? 8 : 0) | (m & 2 ? 1 : 0) | (m & 4 ? 2 : 0) | (m & 8 ? 4 : 0); }
  var PATH_PIECES = {};
  [['single', 0], ['end', 1], ['straight', 5], ['corner', 3], ['tee', 11], ['cross', 15]].forEach(function (c) {
    var m = c[1];
    for (var k = 0; k < 4; k++) { if (!PATH_PIECES[m]) PATH_PIECES[m] = { piece: c[0], yawDeg: 90 * k }; m = rotMask(m); }
  });
  function pathPiece(mask) { var p = PATH_PIECES[(mask | 0) & 15]; return { piece: p.piece, yawDeg: p.yawDeg }; }
  function shineLevel(price) {
    var p = price && typeof price === 'object' ? price.price : price;
    p = Number(p);
    if (!(p >= 0)) return 0;
    for (var i = SHINE_BANDS.length - 1; i > 0; i--) if (p >= SHINE_BANDS[i]) return i;
    return 0;
  }

  /* ---------------- light preset mixes ---------------- */
  /* A → B at k (clamped to 0..1). Colours come back as '#RRGGBB'; with a member hex each
     end's rim takes that preset's rimMember share of the member colour. */
  function mixPresets(A, B, k, member) {
    k = clamp01(+k || 0);
    var m = normHex(member), out = {};
    PRESET_KEYS.forEach(function (key) {
      var a = A[key], b = B[key];
      if (typeof a === 'string') {
        var ah = hex(a), bh = hex(b);
        if (key === 'rimColor' && m) { ah = mixHex(ah, m, A.rimMember); bh = mixHex(bh, m, B.rimMember); }
        out[key] = mixHex(ah, bh, k);
      } else if (Array.isArray(a)) out[key] = a.map(function (v, i) { return v + (b[i] - v) * k; });
      else out[key] = a + (b - a) * k;
    });
    return out;
  }
  /* k: 0 = golden hour (DUSK), 1 = Showtime */
  function presetAt(k, member) { return mixPresets(DUSK, SHOW, k, member); }
  /* the v1 pastel day → v1 Showtime mix, unchanged (games that copied the v1 island arc) */
  function presetV1At(k, member) { return mixPresets(DAY, SHOW_V1, k, member); }

  /* the tables are a shared contract (entries share sub-objects): freeze them so a
     consumer can never change another chunk's look by accident */
  function deepFreeze(o) {
    if (o && typeof o === 'object' && !Object.isFrozen(o)) {
      Object.freeze(o);
      Object.keys(o).forEach(function (k) { deepFreeze(o[k]); });
    }
    return o;
  }
  [PALETTE, PALETTE_V2, LOCKED, ART2D, EXTRA, LOOK, CHARACTERS, DUSK, SHOW, DAY, SHOW_V1, PRESET_KEYS, PRESET_COLOR_KEYS,
   TEMPO, FX, MATERIAL, MATCAPS, EDIT, CONES, BUDGET, SHINE_BANDS, SHINE_NAMES, SLOT_DEFAULTS, KINDS, ORGANIC_KINDS,
   OUTLINE_KINDS, PLACED_KINDS, ACT_PIVOT, LAUNCH_PIVOT, PET_BONES, PET_SOCKETS, SIGN_WORDS, NEON3, NEON4,
   SHAPES, HOUSE_H, HOUSE_TRIS, VARIANTS, BUILDING_TRIMS, JITTER_RULES, PATH_PIECES].forEach(deepFreeze);

  return {
    LOOK_VERSION: LOOK_VERSION, MAX_FLASH_HZ: MAX_FLASH_HZ, LED_CHASE_HZ: LED_CHASE_HZ, SIGN_WORDS: SIGN_WORDS,
    PALETTE: PALETTE, PALETTE_V2: PALETTE_V2, LOCKED: LOCKED, ART2D: ART2D, EXTRA: EXTRA,
    LOOK: LOOK, CHARACTERS: CHARACTERS, MEMBER_FALLBACK: MEMBER_FALLBACK,
    DUSK: DUSK, SHOW: SHOW, DAY: DAY, SHOW_V1: SHOW_V1, PRESET_KEYS: PRESET_KEYS, PRESET_COLOR_KEYS: PRESET_COLOR_KEYS,
    presetAt: presetAt, presetV1At: presetV1At,
    TEMPO: TEMPO, FX: FX, MATERIAL: MATERIAL, MATCAPS: MATCAPS, EDIT: EDIT, CONES: CONES, BUDGET: BUDGET,
    SHINE_BANDS: SHINE_BANDS, SHINE_NAMES: SHINE_NAMES, SLOT_DEFAULTS: SLOT_DEFAULTS,
    KINDS: KINDS, ORGANIC_KINDS: ORGANIC_KINDS, OUTLINE_KINDS: OUTLINE_KINDS, PLACED_KINDS: PLACED_KINDS,
    ACT_PIVOT: ACT_PIVOT, LAUNCH_PIVOT: LAUNCH_PIVOT, PET_BONES: PET_BONES, PET_SOCKETS: PET_SOCKETS,
    NEON3: NEON3, NEON4: NEON4, HOUSE_SHAPES: SHAPES, HOUSE_H: HOUSE_H, HOUSE_TRIS: HOUSE_TRIS,
    VARIANTS: VARIANTS, BUILDING_TRIMS: BUILDING_TRIMS, JITTER_RULES: JITTER_RULES,
    hex: hex, isToken: isToken, tokensIn: tokensIn, colorsFor: colorsFor, heightOf: heightOf,
    houseState: houseState, resolveStyle: resolveStyle, stateKey: stateKey, houseBudget: houseBudget, shineLevel: shineLevel,
    variantOf: variantOf, trimOf: trimOf, jitter2: jitter2, pathPiece: pathPiece,
    normHex: normHex, mixHex: mixHex, tone: tone
  };
}));
