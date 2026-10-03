/* ================================================================
   My Island — original SVG art, drawn in code.
   World sprites: 100 units per grid column; a cell's ground is 78 units
   tall (the island is drawn in a gentle 3/4 view). Sprites stand on
   their footprint and may rise above it.
   Pet art is self-contained (no shared gradients) so games can turn it
   into canvas images.
   ================================================================ */
(function (root) {
  'use strict';
  var CH = 78;                      /* ground units per row */
  var INK = '#3b2f4a';              /* soft outline colour */
  var SW = 'stroke="' + INK + '" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"';
  var SW2 = 'stroke="' + INK + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"';

  var WALL = { wall_cream: '#f7e6c4', wall_pink: '#f9b7cc', wall_mint: '#b8ecd6', wall_sky: '#a9d6f7', wall_lilac: '#d6bdf2', wall_concrete: '#a9a5b3', wall_gallery: '#eceaf2', wall_graphite: '#34303f', wall_midnight: '#232a57' };
  var DOOR = { door_blue: '#3b7dd8', door_red: '#d94b4b', door_green: '#38a85c', door_gold: '#f0c02f', door_glass: '#1b2438' };
  var PETCOL = {
    pet_puppy:  { body: '#e3b077', dark: '#b8834f', light: '#f6d9b3', nose: '#3b2f4a' },
    pet_kitten: { body: '#f0a35e', dark: '#c97834', light: '#fde2c6', nose: '#e86a8a' },
    pet_bunny:  { body: '#f4f0ea', dark: '#d8cfc4', light: '#ffffff', nose: '#f08aa6' },
    pet_dragon: { body: '#5fc97a', dark: '#3a9a58', light: '#b9f0c6', nose: '#2e6b40' }
  };

  function svg(w, h, inner, extra) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + h + '"' + (extra || '') + '>' + inner + '</svg>';
  }
  function shadow(cx, cy, rx) { return '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="' + Math.round(rx * 0.3) + '" fill="rgba(40,30,60,0.18)"/>'; }

  /* ---------------- shared defs for the island (injected once) ---------------- */
  function defs() {
    return svg(0, 0,
      '<defs>' +
      '<linearGradient id="slwSea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7fd6ff"/><stop offset="1" stop-color="#2f8fd8"/></linearGradient>' +
      '<linearGradient id="slwGrass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#93e07c"/><stop offset="1" stop-color="#5fbf55"/></linearGradient>' +
      '<linearGradient id="slwGrassLock" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b8c7c0"/><stop offset="1" stop-color="#93a59d"/></linearGradient>' +
      '<radialGradient id="slwGlow"><stop offset="0" stop-color="#fff6a8" stop-opacity="0.95"/><stop offset="1" stop-color="#fff6a8" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="slwGlowCyan"><stop offset="0" stop-color="#9ffcff" stop-opacity="0.9"/><stop offset="1" stop-color="#9ffcff" stop-opacity="0"/></radialGradient>' +
      '</defs>', ' width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"');
  }

  /* ---------------- island ground ---------------- */
  /* cellsByRegion: {regionKey: ['x,y', ...]}, unlocked: {regionKey:true} */
  function island(cols, rows, cellsByRegion, unlocked) {
    var W = cols * 100, H = rows * CH;
    var sand = '', grass = '', lockSand = '', tufts = '', locked = {};
    Object.keys(cellsByRegion).forEach(function (rk) {
      var open = !!unlocked[rk];
      cellsByRegion[rk].forEach(function (ck) {
        var p = ck.split(','), cx = +p[0], cy = +p[1], x = cx * 100, y = cy * CH;
        /* generous overlap so neighbouring cells melt into one smooth landmass */
        var sRect = '<rect x="' + (x - 28) + '" y="' + (y - 24) + '" width="156" height="' + (CH + 48) + '" rx="48"/>';
        if (open) {
          sand += sRect;
          grass += '<rect x="' + (x - 15) + '" y="' + (y - 14) + '" width="130" height="' + (CH + 28) + '" rx="38"/>';
          /* a few grass tufts for texture (deterministic per cell) */
          var h = (cx * 73 + cy * 151) % 97;
          tufts += '<path d="M' + (x + 20 + h % 50) + ' ' + (y + 30 + h % 30) + ' l4 -9 l4 9 m2 0 l4 -7 l4 7" fill="none" stroke="#4fa94a" stroke-width="2.5" stroke-linecap="round" opacity="0.55"/>';
        } else { lockSand += sRect; locked[rk] = 1; }
      });
    });
    var waves = '';
    for (var i = 0; i < 9; i++) {
      var wx = (i * 197) % W, wy = 22 + ((i * 131) % (H - 30));
      waves += '<path class="slw-wave" style="animation-delay:' + (i * 0.7).toFixed(1) + 's" d="M' + wx + ' ' + wy + ' q 14 -8 28 0 t 28 0" fill="none" stroke="#e8f8ff" stroke-width="4" stroke-linecap="round" opacity="0.7"/>';
    }
    return svg(W, H,
      '<rect width="' + W + '" height="' + H + '" fill="url(#slwSea)"/>' + waves +
      /* locked land: a pale sandbar with a dotted edge — clearly "not yet" */
      '<g fill="#f6e7bd" opacity="0.5">' + lockSand + '</g>' +
      '<g fill="none" stroke="#ffffff" stroke-width="3" stroke-dasharray="2 10" stroke-linecap="round" opacity="0.7">' + lockSand + '</g>' +
      /* open land: sand ring, grass, tufts */
      '<g fill="#f3dc9a">' + sand + '</g><g fill="url(#slwGrass)">' + grass + '</g>' + tufts,
      ' preserveAspectRatio="none" class="slw-ground-svg"');
  }

  /* ---------------- plants & decorations (1×1, viewBox 100×170, base y≈135) ---------------- */
  function tree(kind) {
    var trunk = '<path d="M44 135 L46 92 L54 92 L56 135 Z" fill="#9b6b43" ' + SW2 + '/>';
    if (kind === 'pine') {
      return shadow(50, 136, 30) + '<rect x="45" y="112" width="10" height="24" fill="#8a5d3a" ' + SW2 + '/>' +
        '<path d="M50 18 L80 70 L66 70 L86 108 L14 108 L34 70 L20 70 Z" fill="#3f9a5a" ' + SW + '/>' +
        '<path d="M50 30 L66 62 L50 56 Z" fill="#69c07c" opacity="0.7"/>';
    }
    if (kind === 'palm') {
      return shadow(50, 136, 26) +
        '<path d="M48 136 C 44 110, 46 80, 58 52" fill="none" stroke="#a5743f" stroke-width="11" stroke-linecap="round"/>' +
        '<path d="M48 136 C 44 110, 46 80, 58 52" fill="none" stroke="' + INK + '" stroke-width="2" stroke-dasharray="2 9" stroke-linecap="round"/>' +
        '<g ' + SW2 + '>' +
        '<path d="M58 52 C 40 36, 18 40, 8 58 C 26 50, 42 52, 58 52 Z" fill="#4fbf63"/>' +
        '<path d="M58 52 C 74 34, 94 38, 98 58 C 82 50, 70 50, 58 52 Z" fill="#45b05a"/>' +
        '<path d="M58 52 C 52 28, 64 14, 80 16 C 70 28, 64 40, 58 52 Z" fill="#5ccc70"/>' +
        '<path d="M58 52 C 46 30, 30 22, 18 28 C 34 32, 46 42, 58 52 Z" fill="#3fa956"/></g>' +
        '<circle cx="56" cy="58" r="5" fill="#8a5a2b"/><circle cx="63" cy="57" r="5" fill="#7a4d22"/>';
    }
    var c1 = '#5cb85c', c2 = '#4ba84b', c3 = '#8bd17c', fruit = '';
    if (kind === 'blossom') { c1 = '#f6a7c8'; c2 = '#ec86b0'; c3 = '#ffd3e6'; }
    if (kind === 'apple') {
      fruit = '<circle cx="34" cy="70" r="5" fill="#e53935" ' + SW2 + '/><circle cx="60" cy="56" r="5" fill="#e53935" ' + SW2 + '/>' +
              '<circle cx="66" cy="80" r="5" fill="#e53935" ' + SW2 + '/><circle cx="44" cy="46" r="5" fill="#e53935" ' + SW2 + '/>';
    }
    var petals = kind === 'blossom' ? '<circle cx="30" cy="96" r="3" fill="#ffd3e6"/><circle cx="70" cy="104" r="2.5" fill="#ffd3e6"/>' : '';
    return shadow(50, 136, 32) + trunk +
      '<g ' + SW + '><circle cx="34" cy="74" r="22" fill="' + c2 + '"/><circle cx="66" cy="74" r="22" fill="' + c2 + '"/>' +
      '<circle cx="50" cy="52" r="28" fill="' + c1 + '"/></g>' +
      '<circle cx="42" cy="44" r="10" fill="' + c3 + '" opacity="0.7"/>' + fruit + petals;
  }
  function flowers(kind) {
    var out = shadow(50, 136, 28) + '<ellipse cx="50" cy="128" rx="30" ry="10" fill="#4fae4c" ' + SW2 + '/>';
    if (kind === 'tulip') {
      [[32, '#ff5c6c'], [50, '#ffc93c'], [68, '#ff7ab8']].forEach(function (f, i) {
        var top = 86 + (i % 2) * 10;
        out += '<path d="M' + f[0] + ' 128 L' + f[0] + ' ' + (top + 12) + '" stroke="#3c8a3c" stroke-width="4"/>' +
          '<path d="M' + (f[0] - 10) + ' ' + (top + 2) + ' Q' + (f[0] - 10) + ' ' + (top + 18) + ' ' + f[0] + ' ' + (top + 18) + ' Q' + (f[0] + 10) + ' ' + (top + 18) + ' ' + (f[0] + 10) + ' ' + (top + 2) +
          ' L' + (f[0] + 5) + ' ' + (top + 8) + ' L' + f[0] + ' ' + top + ' L' + (f[0] - 5) + ' ' + (top + 8) + ' Z" fill="' + f[1] + '" ' + SW2 + '/>';
      });
      return out;
    }
    if (kind === 'daisy') {
      [[30, 118], [50, 110], [70, 118], [40, 126], [62, 126]].forEach(function (p) {
        var petalsS = '';
        for (var a = 0; a < 8; a++) {
          var ang = a * Math.PI / 4;
          petalsS += '<ellipse cx="' + (p[0] + Math.cos(ang) * 6).toFixed(1) + '" cy="' + (p[1] + Math.sin(ang) * 6).toFixed(1) + '" rx="4" ry="2.4" transform="rotate(' + (a * 45) + ' ' + (p[0] + Math.cos(ang) * 6).toFixed(1) + ' ' + (p[1] + Math.sin(ang) * 6).toFixed(1) + ')" fill="#fff"/>';
        }
        out += petalsS + '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="3.6" fill="#ffc93c"/>';
      });
      return out;
    }
    /* sunflowers */
    [[38, 60], [64, 74]].forEach(function (p) {
      out += '<path d="M' + p[0] + ' 128 L' + p[0] + ' ' + p[1] + '" stroke="#3c8a3c" stroke-width="5"/>' +
        '<path d="M' + p[0] + ' 100 q 12 -6 16 4 q -10 4 -16 -4" fill="#4fae4c" ' + SW2 + '/>';
      var pet = '';
      for (var a = 0; a < 12; a++) {
        var ang = a * Math.PI / 6;
        pet += '<ellipse cx="' + (p[0] + Math.cos(ang) * 13).toFixed(1) + '" cy="' + (p[1] + Math.sin(ang) * 13).toFixed(1) + '" rx="7" ry="4" transform="rotate(' + (a * 30) + ' ' + (p[0] + Math.cos(ang) * 13).toFixed(1) + ' ' + (p[1] + Math.sin(ang) * 13).toFixed(1) + ')" fill="#ffcf2e" stroke="' + INK + '" stroke-width="1.5"/>';
      }
      out += pet + '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="9" fill="#8a5a2b" ' + SW2 + '/>';
    });
    return out;
  }
  function decor(id, st) {
    st = st || {};
    switch (id) {
      case 'tree_oak': return tree('oak');
      case 'tree_pine': return tree('pine');
      case 'tree_apple': return tree('apple');
      case 'tree_blossom': return tree('blossom');
      case 'tree_palm': return tree('palm');
      case 'flower_tulip': return flowers('tulip');
      case 'flower_daisy': return flowers('daisy');
      case 'flower_sun': return flowers('sun');
      case 'bush_rose':
        return shadow(50, 136, 32) + '<g ' + SW + '><circle cx="34" cy="116" r="18" fill="#3f9a4a"/><circle cx="66" cy="116" r="18" fill="#3f9a4a"/><circle cx="50" cy="102" r="22" fill="#4caf50"/></g>' +
          '<circle cx="40" cy="98" r="5" fill="#ff7aa8" ' + SW2 + '/><circle cx="58" cy="94" r="5" fill="#ff5c8a" ' + SW2 + '/><circle cx="30" cy="114" r="5" fill="#ff7aa8" ' + SW2 + '/>' +
          '<circle cx="66" cy="112" r="5" fill="#ff5c8a" ' + SW2 + '/><circle cx="50" cy="118" r="5" fill="#ff9dbf" ' + SW2 + '/>';
      case 'rock_mossy':
        return shadow(50, 136, 32) + '<path d="M18 134 Q 14 106 36 98 Q 56 86 74 100 Q 90 112 84 134 Z" fill="#a9a6b8" ' + SW + '/>' +
          '<path d="M30 104 Q 50 90 72 102 Q 60 98 50 104 Q 40 100 30 104 Z" fill="#6cc26a"/><path d="M60 118 q 8 -4 12 4" fill="none" stroke="#8d8aa0" stroke-width="3"/>';
      case 'lantern':
        return (st.lit ? '<circle cx="50" cy="46" r="40" fill="url(#slwGlow)"/>' : '') + shadow(50, 136, 18) +
          '<rect x="46" y="58" width="8" height="78" rx="3" fill="#4b4f6b" ' + SW2 + '/><rect x="38" y="130" width="24" height="7" rx="3" fill="#4b4f6b" ' + SW2 + '/>' +
          '<path d="M34 38 L66 38 L62 62 L38 62 Z" fill="' + (st.lit ? '#ffe36b' : '#cfe0ec') + '" ' + SW + '/><path d="M30 38 L50 24 L70 38 Z" fill="#4b4f6b" ' + SW2 + '/>';
      case 'mushroom_glow':
        return (st.lit ? '<circle cx="50" cy="108" r="46" fill="url(#slwGlowCyan)"/>' : '') + shadow(50, 136, 30) +
          [[32, 116, 13], [56, 104, 17], [72, 122, 10]].map(function (m) {
            var cap = st.lit ? '#6ff3ff' : '#b06bd8';
            return '<rect x="' + (m[0] - 4) + '" y="' + m[1] + '" width="8" height="' + (134 - m[1]) + '" rx="3" fill="#fff4e0" ' + SW2 + '/>' +
              '<path d="M' + (m[0] - m[2]) + ' ' + (m[1] + 2) + ' Q' + m[0] + ' ' + (m[1] - m[2] * 1.4) + ' ' + (m[0] + m[2]) + ' ' + (m[1] + 2) + ' Z" fill="' + cap + '" ' + SW2 + '/>' +
              '<circle cx="' + (m[0] - 4) + '" cy="' + (m[1] - 4) + '" r="2.2" fill="#fff"/>';
          }).join('');
      case 'flag_pole':
        return shadow(50, 136, 16) + '<rect x="30" y="20" width="6" height="116" rx="3" fill="#8f8aa6" ' + SW2 + '/><circle cx="33" cy="18" r="5" fill="#ffd23f" ' + SW2 + '/>' +
          '<g class="slw-flag"><path d="M36 26 Q 56 18 76 28 Q 86 40 76 50 Q 56 58 36 52 Z" fill="#ff6b6b" ' + SW2 + '/><path d="M46 38 l6 -6 l6 6 l-6 6 z" fill="#ffd23f"/></g>';
      case 'bunting':
        return shadow(50, 136, 30) + '<rect x="12" y="62" width="6" height="74" rx="3" fill="#9b6b43" ' + SW2 + '/><rect x="82" y="62" width="6" height="74" rx="3" fill="#9b6b43" ' + SW2 + '/>' +
          '<path d="M15 66 Q 50 86 85 66" fill="none" stroke="' + INK + '" stroke-width="2"/>' +
          '<g class="slw-flag">' + ['#ff6b6b', '#ffd23f', '#4fc3f7', '#7bd88f', '#c38bff'].map(function (c, i) {
            var x = 20 + i * 13, y = 68 + Math.sin((i + 0.5) / 5 * Math.PI) * 10;
            return '<path d="M' + x + ' ' + y.toFixed(1) + ' l12 0 l-6 14 z" fill="' + c + '" ' + SW2 + '/>';
          }).join('') + '</g>';
      case 'bench':
        return shadow(50, 136, 34) + '<g ' + SW2 + '><rect x="16" y="102" width="68" height="10" rx="3" fill="#c48a52"/><rect x="16" y="86" width="68" height="9" rx="3" fill="#c48a52"/>' +
          '<rect x="22" y="112" width="6" height="22" fill="#6b5a7a"/><rect x="72" y="112" width="6" height="22" fill="#6b5a7a"/><rect x="22" y="86" width="5" height="26" fill="#6b5a7a"/><rect x="73" y="86" width="5" height="26" fill="#6b5a7a"/></g>';
      case 'sandcastle':
        return shadow(50, 136, 34) + '<g ' + SW2 + ' fill="#f2cd7c"><rect x="20" y="96" width="60" height="38" rx="3"/><rect x="14" y="78" width="20" height="56" rx="2"/><rect x="66" y="78" width="20" height="56" rx="2"/>' +
          '<rect x="38" y="70" width="24" height="30" rx="2"/></g><path d="M44 134 v-14 a6 6 0 0 1 12 0 v14 z" fill="#c99a4d"/><rect x="49" y="46" width="2" height="24" fill="' + INK + '"/><path d="M51 46 l14 5 l-14 5 z" fill="#ff6b6b"/>';
      case 'umbrella':
        return shadow(50, 136, 30) + '<rect x="48" y="44" width="4" height="92" fill="#8f8aa6"/><path d="M8 58 Q 50 6 92 58 Z" fill="#ff6b6b" ' + SW + '/>' +
          '<path d="M30 58 Q 50 6 50 6 Q 50 6 70 58 Z" fill="#fff"/><path d="M8 58 Q 50 6 92 58" fill="none" ' + SW + '/><ellipse cx="68" cy="128" rx="18" ry="6" fill="#4fc3f7" ' + SW2 + '/>';
      case 'snowman':
        return shadow(50, 136, 26) + '<g ' + SW + ' fill="#fdfdff"><circle cx="50" cy="114" r="22"/><circle cx="50" cy="78" r="16"/></g>' +
          '<path d="M34 64 L66 64 L62 52 L38 52 Z" fill="#3b2f4a"/><rect x="32" y="62" width="36" height="5" fill="#3b2f4a"/><path d="M50 80 l14 3 l-14 3 z" fill="#ff8a3d"/>' +
          '<circle cx="44" cy="74" r="2.5" fill="' + INK + '"/><circle cx="56" cy="74" r="2.5" fill="' + INK + '"/><path d="M36 92 q14 8 28 0 l0 7 q-14 8 -28 0 z" fill="#ff5c6c"/>';
      case 'windmill':
        return shadow(50, 136, 26) + '<path d="M36 136 L42 66 L58 66 L64 136 Z" fill="#f6efe2" ' + SW + '/><rect x="45" y="112" width="10" height="24" fill="#9b6b43"/>' +
          '<g class="slw-spin" style="transform-origin:50px 62px"><g ' + SW2 + ' fill="#ffffff"><path d="M50 62 L46 18 L54 18 Z"/><path d="M50 62 L94 58 L94 66 Z"/><path d="M50 62 L54 106 L46 106 Z"/><path d="M50 62 L6 66 L6 58 Z"/></g></g>' +
          '<circle cx="50" cy="62" r="5" fill="#ff6b6b" ' + SW2 + '/>';
      case 'lighthouse':
        return (st.lit ? '<path d="M50 32 L0 10 L0 54 Z" fill="#fff6a8" opacity="0.55"/><path d="M50 32 L100 10 L100 54 Z" fill="#fff6a8" opacity="0.55"/>' : '') + shadow(50, 136, 26) +
          '<path d="M34 136 L40 46 L60 46 L66 136 Z" fill="#fff" ' + SW + '/><path d="M37 98 L63 98 L64.5 118 L35.5 118 Z" fill="#ff5c6c"/><path d="M39 62 L61 62 L62 80 L38 80 Z" fill="#ff5c6c"/>' +
          '<rect x="38" y="24" width="24" height="22" rx="4" fill="' + (st.lit ? '#ffe36b' : '#cfe0ec') + '" ' + SW + '/><path d="M34 26 L50 10 L66 26 Z" fill="#ff5c6c" ' + SW2 + '/>';
      /* fun */
      case 'trampoline':
        return shadow(50, 136, 38) + '<g ' + SW2 + '><path d="M16 118 l-4 18" /><path d="M84 118 l4 18"/><path d="M50 122 l0 14"/></g>' +
          '<ellipse cx="50" cy="114" rx="40" ry="14" fill="#4b8ff0" ' + SW + '/><ellipse cx="50" cy="112" rx="30" ry="9" fill="#2a64c9"/><ellipse cx="40" cy="110" rx="9" ry="3" fill="#7fb3ff" opacity="0.8"/>';
      case 'fountain':
        return shadow(50, 136, 40) + '<ellipse cx="50" cy="122" rx="42" ry="14" fill="#c9c3d9" ' + SW + '/><ellipse cx="50" cy="118" rx="34" ry="9" fill="#6fd0ff"/>' +
          '<rect x="44" y="76" width="12" height="42" fill="#c9c3d9" ' + SW2 + '/><ellipse cx="50" cy="78" rx="18" ry="6" fill="#c9c3d9" ' + SW2 + '/>' +
          '<g class="slw-water"><path d="M50 74 Q 40 50 30 74" fill="none" stroke="#6fd0ff" stroke-width="4" stroke-linecap="round"/><path d="M50 74 Q 60 50 70 74" fill="none" stroke="#6fd0ff" stroke-width="4" stroke-linecap="round"/><path d="M50 74 L50 46" stroke="#a8e6ff" stroke-width="5" stroke-linecap="round"/></g>';
      case 'swing':
        return shadow(50, 136, 36) + '<g ' + SW + ' fill="none"><path d="M14 136 L28 30 L42 136"/><path d="M58 136 L72 30 L86 136"/><path d="M24 32 L76 32"/></g>' +
          '<g class="slw-swing" style="transform-origin:50px 32px"><path d="M42 32 L42 104 M58 32 L58 104" stroke="#8f8aa6" stroke-width="2.5"/><rect x="36" y="102" width="28" height="7" rx="3" fill="#ff8a3d" ' + SW2 + '/></g>';
      case 'bubbles':
        return shadow(50, 136, 30) + '<rect x="24" y="100" width="52" height="34" rx="8" fill="#c38bff" ' + SW + '/><circle cx="50" cy="117" r="9" fill="#fff" ' + SW2 + '/>' +
          '<path d="M60 100 L72 70" stroke="#8f8aa6" stroke-width="4" stroke-linecap="round"/><circle cx="74" cy="64" r="8" fill="none" stroke="#8f8aa6" stroke-width="3"/>' +
          '<g class="slw-bubbles"><circle cx="70" cy="40" r="7" fill="rgba(180,230,255,0.35)" stroke="#9fdcff" stroke-width="2"/><circle cx="56" cy="22" r="5" fill="rgba(180,230,255,0.35)" stroke="#9fdcff" stroke-width="2"/><circle cx="84" cy="26" r="4" fill="rgba(180,230,255,0.35)" stroke="#9fdcff" stroke-width="2"/></g>';
    }
    return null;
  }

  /* ---------------- paths (ground tiles, 100×78) ---------------- */
  function pathTile(id) {
    if (id === 'path_wood') {
      var planks = '';
      for (var i = 0; i < 5; i++) planks += '<rect x="' + (8 + i * 17.5) + '" y="8" width="15" height="62" rx="3" fill="' + (i % 2 ? '#c98f58' : '#d69d64') + '" ' + SW2 + '/>';
      return planks;
    }
    if (id === 'path_flower') {
      return '<ellipse cx="30" cy="26" rx="18" ry="11" fill="#d9d3e6" ' + SW2 + '/><ellipse cx="68" cy="50" rx="19" ry="12" fill="#d9d3e6" ' + SW2 + '/>' +
        '<circle cx="70" cy="20" r="4" fill="#ff7ab8"/><circle cx="24" cy="56" r="4" fill="#ffc93c"/><circle cx="48" cy="38" r="3" fill="#fff"/>';
    }
    return '<g fill="#cfc8dc" ' + SW2 + '><ellipse cx="26" cy="22" rx="17" ry="11"/><ellipse cx="70" cy="22" rx="20" ry="11"/><ellipse cx="46" cy="52" rx="20" ry="12"/><ellipse cx="84" cy="56" rx="12" ry="10"/><ellipse cx="12" cy="56" rx="9" ry="9"/></g>';
  }

  /* ---------------- house (2×2, viewBox 200×250, front base y≈206) ---------------- */
  function house(st) {
    st = st || {};
    var wall = WALL[st.wall] || WALL.wall_cream, door = DOOR[st.door] || DOOR.door_blue, roof = st.roof || 'roof_red';
    var det = st.details || {};
    var out = shadow(100, 214, 92);
    if (det.detail_chimney) {
      out += '<rect x="132" y="40" width="20" height="44" fill="#b4675a" ' + SW + '/><rect x="128" y="34" width="28" height="10" rx="2" fill="#93524a" ' + SW2 + '/>' +
        '<g class="slw-smoke"><circle cx="142" cy="24" r="7" fill="#eef0f6"/><circle cx="150" cy="12" r="9" fill="#eef0f6"/><circle cx="160" cy="0" r="10" fill="#eef0f6" opacity="0.8"/></g>';
    }
    /* walls */
    out += '<rect x="32" y="104" width="136" height="104" rx="6" fill="' + wall + '" ' + SW + '/>' +
      '<rect x="32" y="190" width="136" height="18" fill="rgba(0,0,0,0.06)"/>';
    /* roof */
    if (roof === 'roof_castle') {
      out += '<rect x="28" y="88" width="144" height="22" fill="#b9b4c9" ' + SW + '/>';
      for (var b = 0; b < 7; b++) out += '<rect x="' + (30 + b * 20) + '" y="74" width="12" height="16" fill="#b9b4c9" ' + SW2 + '/>';
      out += '<rect x="14" y="58" width="34" height="150" fill="#cdc8dc" ' + SW + '/><rect x="152" y="58" width="34" height="150" fill="#cdc8dc" ' + SW + '/>' +
        '<path d="M10 60 L31 18 L52 60 Z" fill="#6c5ce7" ' + SW + '/><path d="M148 60 L169 18 L190 60 Z" fill="#6c5ce7" ' + SW + '/>' +
        '<path d="M31 18 l0 -14 l14 6 l-14 6" fill="#ff6b6b" ' + SW2 + '/><path d="M169 18 l0 -14 l14 6 l-14 6" fill="#ffd23f" ' + SW2 + '/>' +
        '<rect x="24" y="96" width="14" height="20" rx="7" fill="#4b4f6b"/><rect x="162" y="96" width="14" height="20" rx="7" fill="#4b4f6b"/>';
    } else {
      var rc = { roof_red: ['#e0574f', '#c4433c'], roof_blue: ['#4a6fa5', '#3a5888'], roof_thatch: ['#e3b24f', '#c99634'], roof_candy: ['#ff8fb8', '#f06d9e'] }[roof] || ['#e0574f', '#c4433c'];
      out += '<path d="M18 112 L100 40 L182 112 Z" fill="' + rc[0] + '" ' + SW + '/>' +
        '<path d="M100 40 L182 112 L160 112 L100 58 Z" fill="' + rc[1] + '"/>';
      if (roof === 'roof_red' || roof === 'roof_blue') {
        for (var r = 0; r < 3; r++) out += '<path d="M' + (44 + r * 8) + ' ' + (88 - r * 12) + ' L' + (156 - r * 8) + ' ' + (88 - r * 12) + '" stroke="' + rc[1] + '" stroke-width="3"/>';
      }
      if (roof === 'roof_thatch') {
        for (var t = 0; t < 10; t++) out += '<path d="M' + (30 + t * 15) + ' 110 l6 -18" stroke="#b9842a" stroke-width="2.5"/>';
        out += '<path d="M18 112 Q 100 124 182 112" fill="none" ' + SW + '/>';
      }
      if (roof === 'roof_candy') {
        out += '<path d="M24 108 Q 40 120 56 108 Q 72 120 88 108 Q 104 120 120 108 Q 136 120 152 108 Q 168 120 178 110" fill="#fff" ' + SW2 + '/>';
        ['#ffd23f', '#4fc3f7', '#7bd88f', '#c38bff', '#fff'].forEach(function (c, i) {
          out += '<rect x="' + (66 + i * 16) + '" y="' + (74 + (i % 2) * 14) + '" width="7" height="3" rx="1.5" fill="' + c + '" transform="rotate(' + (i * 37) + ' ' + (69 + i * 16) + ' ' + (75 + (i % 2) * 14) + ')"/>';
        });
        out += '<circle cx="100" cy="36" r="8" fill="#ff5c6c" ' + SW2 + '/>';
      }
    }
    if (det.detail_lights) {
      var lc = ['#ffd23f', '#ff6b6b', '#4fc3f7', '#7bd88f', '#c38bff'];
      out += '<path d="M24 110 Q 100 122 176 110" fill="none" stroke="' + INK + '" stroke-width="1.5"/>';
      for (var l = 0; l < 9; l++) out += '<circle class="slw-twinkle" style="animation-delay:' + (l * 0.23).toFixed(2) + 's" cx="' + (30 + l * 17.5) + '" cy="' + (114 + Math.sin(l / 8 * Math.PI) * 5).toFixed(1) + '" r="3.6" fill="' + lc[l % 5] + '"/>';
    }
    if (det.detail_flag && roof !== 'roof_castle') {
      out += '<rect x="98" y="8" width="3" height="34" fill="' + INK + '"/><g class="slw-flag"><path d="M101 9 l22 7 l-22 7 z" fill="#ffd23f" ' + SW2 + '/></g>';
    }
    /* windows + door */
    [[52, 128], [124, 128]].forEach(function (p) {
      out += '<rect x="' + p[0] + '" y="' + p[1] + '" width="26" height="24" rx="4" fill="#bfe6ff" ' + SW + '/>' +
        '<path d="M' + (p[0] + 13) + ' ' + p[1] + ' v24 M' + p[0] + ' ' + (p[1] + 12) + ' h26" stroke="' + INK + '" stroke-width="2"/>';
      if (det.detail_windowbox) {
        out += '<rect x="' + (p[0] - 3) + '" y="' + (p[1] + 25) + '" width="32" height="8" rx="2" fill="#9b6b43" ' + SW2 + '/>' +
          '<circle cx="' + (p[0] + 4) + '" cy="' + (p[1] + 24) + '" r="4" fill="#ff5c8a"/><circle cx="' + (p[0] + 14) + '" cy="' + (p[1] + 22) + '" r="4" fill="#ffd23f"/><circle cx="' + (p[0] + 24) + '" cy="' + (p[1] + 24) + '" r="4" fill="#ff7ab8"/>';
      }
    });
    out += '<path d="M86 208 L86 164 Q100 150 114 164 L114 208 Z" fill="' + door + '" ' + SW + '/><circle cx="108" cy="188" r="2.6" fill="#ffd23f"/>' +
      '<rect x="80" y="206" width="40" height="6" rx="3" fill="#b8b2c9" ' + SW2 + '/>';
    return out;
  }

  /* ---------------- attractions ---------------- */
  var THEME = { course_meadow: ['#7bd88f', '#ffd23f'], course_beach: ['#f3dc9a', '#4fc3f7'], course_snow: ['#e8f4ff', '#7fb3ff'], course_candy: ['#ffb6d5', '#c38bff'] };
  function courseGate(st) {
    var th = THEME[st && st.course] || THEME.course_meadow;
    return shadow(100, 214, 88) +
      '<rect x="22" y="196" width="156" height="14" rx="4" fill="' + th[0] + '" ' + SW2 + '/>' +
      '<g ' + SW2 + '><rect x="40" y="168" width="6" height="30" fill="#fff"/><rect x="66" y="168" width="6" height="30" fill="#fff"/><rect x="36" y="168" width="40" height="8" rx="3" fill="#ff6b6b"/>' +
      '<rect x="128" y="176" width="6" height="22" fill="#fff"/><rect x="154" y="176" width="6" height="22" fill="#fff"/><rect x="124" y="176" width="40" height="7" rx="3" fill="#ffd23f"/></g>' +
      '<rect x="22" y="70" width="14" height="140" rx="5" fill="#ff8a3d" ' + SW + '/><rect x="164" y="70" width="14" height="140" rx="5" fill="#ff8a3d" ' + SW + '/>' +
      '<path d="M18 74 Q 100 30 182 74 L182 100 Q 100 58 18 100 Z" fill="' + th[1] + '" ' + SW + '/>' +
      '<text x="100" y="80" text-anchor="middle" font-family="Baloo 2, Arial, sans-serif" font-weight="800" font-size="19" fill="#3b2f4a">PET COURSE</text>' +
      '<path d="M90 120 l0 -20 l22 7 l-22 7" fill="#7bd88f" ' + SW2 + '/><path d="M60 44 l4 -10 l4 10 l10 2 l-8 6 l2 10 l-8 -6 l-8 6 l2 -10 l-8 -6 z" fill="#ffd23f" ' + SW2 + '/>' +
      '<path d="M132 44 l4 -10 l4 10 l10 2 l-8 6 l2 10 l-8 -6 l-8 6 l2 -10 l-8 -6 z" fill="#ffd23f" ' + SW2 + '/>';
  }
  var BALLS = { ball_classic: ['#ffffff', '#3b2f4a'], ball_rainbow: ['#ff6b6b', '#4fc3f7'], ball_planet: ['#c38bff', '#ffd23f'], ball_gold: ['#ffd23f', '#e0a81c'] };
  var STADIA = { stadium_day: ['#7ecbff', '#6ac46a'], stadium_night: ['#2b2a5e', '#3f9a4a'], stadium_beach: ['#ffe0a0', '#7fd0a0'], stadium_snow: ['#dfeeff', '#bfe6c8'] };
  function pitch(st) {
    var ball = BALLS[st && st.ball] || BALLS.ball_classic, stad = STADIA[st && st.stadium] || STADIA.stadium_day;
    return shadow(150, 200, 140) +
      '<path d="M20 58 L280 58 L292 196 L8 196 Z" fill="' + stad[1] + '" ' + SW + '/>' +
      '<path d="M44 76 L256 76 L264 180 L36 180 Z M150 76 L150 180" fill="none" stroke="#fff" stroke-width="3" opacity="0.9"/>' +
      '<ellipse cx="150" cy="128" rx="26" ry="14" fill="none" stroke="#fff" stroke-width="3" opacity="0.9"/>' +
      '<rect x="20" y="22" width="260" height="34" rx="6" fill="' + stad[0] + '" ' + SW + '/>' +
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(function (i) { return '<circle cx="' + (34 + i * 21) + '" cy="' + (36 + (i % 2) * 8) + '" r="5" fill="' + ['#ff6b6b', '#ffd23f', '#4fc3f7', '#fff', '#c38bff'][i % 5] + '"/>'; }).join('') +
      '<path d="M232 88 L276 88 L280 132 L236 132" fill="rgba(255,255,255,0.35)" ' + SW + '/><path d="M240 92 l0 38 M252 92 l0 38 M264 92 l2 38 M236 104 l42 0 M237 118 l42 0" stroke="#fff" stroke-width="1.5" opacity="0.8"/>' +
      '<circle cx="120" cy="140" r="11" fill="' + ball[0] + '" ' + SW + '/><circle cx="117" cy="137" r="4" fill="' + ball[1] + '"/>';
  }
  var KARTS = { kart_red: '#e94b4b', kart_blue: '#3b7dd8', kart_lime: '#7ed957', kart_gold: '#f0c02f', kart_unicorn: '#ff8fd0' };
  function garage(st) {
    var kc = KARTS[st && st.kart] || KARTS.kart_red;
    var chk = '';
    for (var i = 0; i < 8; i++) chk += '<rect x="' + (36 + i * 16) + '" y="58" width="16" height="10" fill="' + (i % 2 ? '#fff' : INK) + '"/><rect x="' + (36 + i * 16) + '" y="68" width="16" height="10" fill="' + (i % 2 ? INK : '#fff') + '"/>';
    return shadow(100, 214, 92) +
      '<rect x="24" y="78" width="152" height="130" rx="8" fill="#8fa3c8" ' + SW + '/>' + chk +
      '<rect x="36" y="58" width="128" height="20" fill="none" ' + SW + '/>' +
      '<rect x="48" y="112" width="104" height="96" rx="4" fill="#d9e1ef" ' + SW + '/>' +
      [0, 1, 2, 3, 4].map(function (i) { return '<path d="M48 ' + (124 + i * 18) + ' h104" stroke="#a8b3c9" stroke-width="3"/>'; }).join('') +
      '<g transform="translate(64 176)"><rect x="0" y="6" width="72" height="22" rx="10" fill="' + kc + '" ' + SW + '/><path d="M18 6 l10 -12 l18 0 l6 12" fill="' + kc + '" ' + SW2 + '/>' +
      '<circle cx="14" cy="30" r="9" fill="#3b2f4a"/><circle cx="58" cy="30" r="9" fill="#3b2f4a"/><circle cx="14" cy="30" r="3.5" fill="#cfc8dc"/><circle cx="58" cy="30" r="3.5" fill="#cfc8dc"/>' +
      '<circle cx="34" cy="-2" r="7" fill="#ffd23f" ' + SW2 + '/></g>' +
      '<g ' + SW2 + '><circle cx="16" cy="200" r="10" fill="#3b2f4a"/><circle cx="184" cy="200" r="10" fill="#3b2f4a"/><circle cx="16" cy="186" r="10" fill="#3b2f4a"/></g>';
  }

  /* ---------------- pets (side view facing right, viewBox 120×100, feet y≈92) ----------------
     frame 0/1 = walking legs; acc = {hat, neck, face, back} -> item ids */
  function pet(id, opts) {
    opts = opts || {};
    var c = PETCOL[id] || PETCOL.pet_puppy, f = opts.frame ? 1 : 0, acc = opts.acc || {};
    var legA = f ? 'translate(4 0)' : 'translate(-3 0)', legB = f ? 'translate(-4 0)' : 'translate(3 0)';
    var out = '<ellipse cx="60" cy="94" rx="34" ry="5" fill="rgba(40,30,60,0.18)"/>';
    /* cape behind */
    if (acc.back === 'acc_cape') out += '<path class="slw-cape" d="M44 52 Q 20 58 14 84 L40 76 Q 46 66 52 56 Z" fill="#e94b4b" ' + SW2 + '/>';
    /* tail */
    if (id === 'pet_puppy') out += '<path d="M30 56 Q 14 44 18 30" fill="none" stroke="' + c.dark + '" stroke-width="8" stroke-linecap="round"/>';
    if (id === 'pet_kitten') out += '<path d="M30 60 Q 6 52 14 28" fill="none" stroke="' + c.dark + '" stroke-width="7" stroke-linecap="round"/>';
    if (id === 'pet_bunny') out += '<circle cx="28" cy="58" r="9" fill="#fff" ' + SW2 + '/>';
    if (id === 'pet_dragon') out += '<path d="M30 64 Q 10 70 6 54 L14 56 L10 46 Z" fill="' + c.body + '" ' + SW2 + '/>';
    /* back legs */
    out += '<g transform="' + legA + '"><rect x="34" y="66" width="11" height="26" rx="5" fill="' + c.dark + '" ' + SW2 + '/></g>' +
           '<g transform="' + legB + '"><rect x="68" y="66" width="11" height="26" rx="5" fill="' + c.dark + '" ' + SW2 + '/></g>';
    /* body */
    out += '<ellipse cx="56" cy="62" rx="30" ry="18" fill="' + c.body + '" ' + SW + '/><ellipse cx="58" cy="70" rx="18" ry="7" fill="' + c.light + '"/>';
    if (id === 'pet_dragon') out += '<path class="slw-wing" d="M50 48 Q 46 22 64 18 Q 60 32 72 30 Q 64 42 62 50 Z" fill="' + c.light + '" ' + SW2 + '/>' +
      '<path d="M36 46 l5 -8 l4 8 M48 43 l5 -8 l4 8" fill="' + c.dark + '" stroke="' + INK + '" stroke-width="1.5"/>';
    /* front legs */
    out += '<g transform="' + legB + '"><rect x="40" y="68" width="11" height="24" rx="5" fill="' + c.body + '" ' + SW2 + '/></g>' +
           '<g transform="' + legA + '"><rect x="74" y="68" width="11" height="24" rx="5" fill="' + c.body + '" ' + SW2 + '/></g>';
    /* head */
    var hx = 88, hy = 42;
    if (id === 'pet_bunny') {
      out += '<ellipse cx="' + (hx - 8) + '" cy="' + (hy - 30) + '" rx="6" ry="20" fill="' + c.body + '" ' + SW2 + ' transform="rotate(-14 ' + (hx - 8) + ' ' + (hy - 30) + ')"/>' +
             '<ellipse cx="' + (hx + 4) + '" cy="' + (hy - 30) + '" rx="6" ry="20" fill="' + c.body + '" ' + SW2 + ' transform="rotate(10 ' + (hx + 4) + ' ' + (hy - 30) + ')"/>' +
             '<ellipse cx="' + (hx + 4) + '" cy="' + (hy - 30) + '" rx="2.5" ry="13" fill="#f6b7c9" transform="rotate(10 ' + (hx + 4) + ' ' + (hy - 30) + ')"/>';
    }
    if (id === 'pet_kitten') {
      out += '<path d="M' + (hx - 16) + ' ' + (hy - 8) + ' L' + (hx - 12) + ' ' + (hy - 28) + ' L' + (hx - 2) + ' ' + (hy - 14) + ' Z" fill="' + c.body + '" ' + SW2 + '/>' +
             '<path d="M' + (hx + 4) + ' ' + (hy - 14) + ' L' + (hx + 14) + ' ' + (hy - 28) + ' L' + (hx + 16) + ' ' + (hy - 8) + ' Z" fill="' + c.body + '" ' + SW2 + '/>';
    }
    if (id === 'pet_dragon') {
      out += '<path d="M' + (hx - 10) + ' ' + (hy - 14) + ' l-2 -14 l8 10 Z M' + (hx + 6) + ' ' + (hy - 16) + ' l4 -14 l4 14 Z" fill="#ffd23f" ' + SW2 + '/>';
    }
    out += '<circle cx="' + hx + '" cy="' + hy + '" r="20" fill="' + c.body + '" ' + SW + '/>';
    if (id === 'pet_puppy') {
      out += '<path d="M' + (hx - 18) + ' ' + (hy - 10) + ' Q ' + (hx - 30) + ' ' + (hy + 4) + ' ' + (hx - 20) + ' ' + (hy + 18) + ' Q ' + (hx - 12) + ' ' + (hy + 8) + ' ' + (hx - 8) + ' ' + (hy - 6) + ' Z" fill="' + c.dark + '" ' + SW2 + '/>';
    }
    /* face */
    out += '<ellipse cx="' + (hx + 12) + '" cy="' + (hy + 8) + '" rx="11" ry="8" fill="' + c.light + '"/>' +
      '<circle cx="' + (hx + 4) + '" cy="' + (hy - 3) + '" r="3.8" fill="' + INK + '"/><circle cx="' + (hx + 5.3) + '" cy="' + (hy - 4.4) + '" r="1.3" fill="#fff"/>' +
      '<ellipse cx="' + (hx + 20) + '" cy="' + (hy + 5) + '" rx="4" ry="3" fill="' + c.nose + '"/>' +
      '<path d="M' + (hx + 12) + ' ' + (hy + 12) + ' q 4 4 8 0" fill="none" stroke="' + INK + '" stroke-width="2" stroke-linecap="round"/>' +
      '<circle cx="' + (hx - 4) + '" cy="' + (hy + 8) + '" r="3.5" fill="#ff9db8" opacity="0.6"/>';
    if (id === 'pet_kitten') out += '<path d="M' + (hx + 16) + ' ' + (hy + 6) + ' l14 -3 M' + (hx + 16) + ' ' + (hy + 9) + ' l14 2" stroke="' + INK + '" stroke-width="1.3"/>';
    /* accessories */
    if (acc.neck === 'acc_scarf') out += '<path d="M' + (hx - 18) + ' ' + (hy + 14) + ' Q ' + hx + ' ' + (hy + 24) + ' ' + (hx + 14) + ' ' + (hy + 16) + ' L' + (hx + 14) + ' ' + (hy + 24) + ' Q ' + hx + ' ' + (hy + 32) + ' ' + (hx - 18) + ' ' + (hy + 22) + ' Z" fill="#4fc3f7" ' + SW2 + '/><path d="M' + (hx - 14) + ' ' + (hy + 22) + ' l-4 16 l8 0 z" fill="#ff6b6b" ' + SW2 + '/>';
    if (acc.neck === 'acc_bow') out += '<path d="M' + (hx - 8) + ' ' + (hy + 20) + ' l-12 -7 l0 14 z M' + (hx - 8) + ' ' + (hy + 20) + ' l12 -7 l0 14 z" fill="#ff5c8a" ' + SW2 + '/><circle cx="' + (hx - 8) + '" cy="' + (hy + 20) + '" r="4" fill="#ffd23f" ' + SW2 + '/>';
    if (acc.face === 'acc_shades') out += '<rect x="' + (hx - 4) + '" y="' + (hy - 8) + '" width="13" height="9" rx="3" fill="#3b2f4a"/><rect x="' + (hx + 11) + '" y="' + (hy - 8) + '" width="11" height="9" rx="3" fill="#3b2f4a"/><path d="M' + (hx + 9) + ' ' + (hy - 4) + ' h2" stroke="#3b2f4a" stroke-width="2"/><path d="M' + (hx - 2) + ' ' + (hy - 6) + ' l4 0" stroke="#fff" stroke-width="1.5" opacity="0.7"/>';
    if (acc.hat === 'acc_partyhat') out += '<path d="M' + (hx - 6) + ' ' + (hy - 17) + ' L' + (hx + 2) + ' ' + (hy - 46) + ' L' + (hx + 12) + ' ' + (hy - 17) + ' Z" fill="#c38bff" ' + SW2 + '/><path d="M' + (hx - 3) + ' ' + (hy - 25) + ' l13 0 M' + (hx) + ' ' + (hy - 35) + ' l7 0" stroke="#ffd23f" stroke-width="3"/><circle cx="' + (hx + 2) + '" cy="' + (hy - 47) + '" r="4" fill="#ff6b6b" ' + SW2 + '/>';
    if (acc.hat === 'acc_crown') out += '<path d="M' + (hx - 12) + ' ' + (hy - 16) + ' L' + (hx - 12) + ' ' + (hy - 32) + ' L' + (hx - 4) + ' ' + (hy - 24) + ' L' + (hx + 2) + ' ' + (hy - 36) + ' L' + (hx + 8) + ' ' + (hy - 24) + ' L' + (hx + 16) + ' ' + (hy - 32) + ' L' + (hx + 16) + ' ' + (hy - 16) + ' Z" fill="#ffd23f" ' + SW2 + '/><circle cx="' + (hx + 2) + '" cy="' + (hy - 21) + '" r="2.5" fill="#ff5c8a"/>';
    return svg(120, 100, out);
  }

  /* ---------------- dispatch ---------------- */
  /* returns {w, h, svg} in world units, or null for non-placeable */
  function sprite(id, st) {
    st = st || {};
    if (id === 'house_cottage') return { w: 200, h: 250, svg: svg(200, 250, house(st)) };
    if (id === 'att_course') return { w: 200, h: 250, svg: svg(200, 250, courseGate(st)) };
    if (id === 'att_pitch') return { w: 300, h: 210, svg: svg(300, 210, pitch(st)) };
    if (id === 'att_kart') return { w: 200, h: 250, svg: svg(200, 250, garage(st)) };
    if (/^path_/.test(id)) return { w: 100, h: CH, svg: svg(100, CH, pathTile(id)) };
    var d = decor(id, st);
    if (d) return { w: 100, h: 170, svg: svg(100, 170, d) };
    return null;
  }

  /* square shop icons for everything, including non-placeable kinds */
  function swatch(fill, label) {
    return svg(100, 100, '<rect x="14" y="14" width="72" height="72" rx="18" fill="' + fill + '" ' + SW + '/>' + (label || ''));
  }
  function icon(id, st) {
    st = st || {};
    if (/^wall_/.test(id)) return swatch(WALL[id] || '#eee', '<path d="M30 70 L30 46 L50 30 L70 46 L70 70 Z" fill="rgba(255,255,255,0.6)" ' + SW2 + '/>');
    if (/^door_/.test(id)) return svg(100, 100, '<path d="M32 88 L32 34 Q50 14 68 34 L68 88 Z" fill="' + (DOOR[id] || '#888') + '" ' + SW + '/><circle cx="60" cy="62" r="4" fill="#ffd23f"/>');
    if (/^roof_/.test(id) || /^detail_/.test(id)) {
      var sel = { wall: 'wall_cream', door: 'door_blue', roof: /^roof_/.test(id) ? id : 'roof_red', details: {} };
      if (/^detail_/.test(id)) sel.details[id] = true;
      return svg(200, 250, house(sel), ' preserveAspectRatio="xMidYMid meet"');
    }
    if (/^pet_/.test(id)) return pet(id, {});
    if (/^acc_/.test(id)) {
      var a = {}; var it = { acc_partyhat: 'hat', acc_crown: 'hat', acc_bow: 'neck', acc_scarf: 'neck', acc_shades: 'face', acc_cape: 'back' }[id];
      a[it] = id; return pet('pet_puppy', { acc: a });
    }
    if (id === 'land_cove') return svg(100, 100, '<rect width="100" height="100" rx="18" fill="#4fc3f7"/><path d="M10 70 Q 30 40 60 46 Q 86 50 90 76 Q 60 90 30 88 Q 12 84 10 70 Z" fill="#f3dc9a" ' + SW + '/><path d="M60 46 C 58 34 62 26 70 22" fill="none" stroke="#a5743f" stroke-width="4"/><path d="M70 22 q -12 -4 -18 4 q 10 -2 18 -4 q 10 -6 16 2 q -8 -2 -16 -2" fill="#4fbf63" ' + SW2 + '/>');
    if (id === 'land_meadow') return svg(100, 100, '<rect width="100" height="100" rx="18" fill="#4fc3f7"/><path d="M8 78 Q 30 30 54 34 Q 84 38 92 78 Q 50 92 8 78 Z" fill="#7bd88f" ' + SW + '/><circle cx="36" cy="60" r="4" fill="#ff7ab8"/><circle cx="58" cy="54" r="4" fill="#ffc93c"/><circle cx="70" cy="66" r="4" fill="#fff"/>');
    if (/^ball_/.test(id)) { var b = BALLS[id]; return svg(100, 100, '<circle cx="50" cy="52" r="30" fill="' + b[0] + '" ' + SW + '/><path d="M50 38 l12 9 l-5 14 h-14 l-5 -14 z" fill="' + b[1] + '"/>' + (id === 'ball_planet' ? '<ellipse cx="50" cy="52" rx="44" ry="10" fill="none" stroke="#ffd23f" stroke-width="5" transform="rotate(-18 50 52)"/>' : '') + (id === 'ball_rainbow' ? '<path d="M24 40 q26 -20 52 0" fill="none" stroke="#ffd23f" stroke-width="5"/><path d="M22 64 q28 20 56 0" fill="none" stroke="#7bd88f" stroke-width="5"/>' : '')); }
    if (/^stadium_/.test(id)) { var s = STADIA[id]; return svg(100, 100, '<rect x="8" y="8" width="84" height="84" rx="16" fill="' + s[0] + '" ' + SW + '/><path d="M8 66 L92 66 L92 76 Q92 92 76 92 L24 92 Q8 92 8 76 Z" fill="' + s[1] + '"/><path d="M30 66 L30 40 L70 40 L70 66" fill="none" stroke="#fff" stroke-width="4"/>' + (id === 'stadium_night' ? '<circle cx="24" cy="24" r="6" fill="#fff6a8"/><circle cx="76" cy="24" r="6" fill="#fff6a8"/>' : '') + (id === 'stadium_snow' ? '<circle cx="24" cy="30" r="3" fill="#fff"/><circle cx="60" cy="20" r="3" fill="#fff"/><circle cx="80" cy="44" r="3" fill="#fff"/>' : '')); }
    if (/^kart_/.test(id)) return svg(100, 100, '<g transform="translate(14 40)"><rect x="0" y="12" width="72" height="22" rx="10" fill="' + (KARTS[id] || '#888') + '" ' + SW + '/><path d="M18 12 l10 -12 l18 0 l6 12" fill="' + (KARTS[id] || '#888') + '" ' + SW2 + '/><circle cx="14" cy="36" r="9" fill="#3b2f4a"/><circle cx="58" cy="36" r="9" fill="#3b2f4a"/><circle cx="34" cy="4" r="7" fill="#ffd23f" ' + SW2 + '/></g>' + (id === 'kart_unicorn' ? '<path d="M50 30 l4 -16 l4 16 z" fill="#ffd23f" ' + SW2 + '/>' : '') + (id === 'kart_lime' ? '<path d="M44 54 l8 -6 l-2 6 l8 -2 l-8 8 l2 -6 z" fill="#ffd23f"/>' : ''));
    if (/^track_/.test(id)) {
      var tc = { track_loop: '#7bd88f', track_volcano: '#ff8a3d', track_beach: '#f3dc9a' }[id] || '#7bd88f';
      var d = { track_loop: 'M24 50 C24 24 76 24 76 50 C76 76 24 76 24 50 Z', track_volcano: 'M20 60 C16 30 46 18 60 30 C74 42 88 34 84 58 C80 82 50 70 40 78 C28 86 22 74 20 60 Z', track_beach: 'M18 30 L80 30 C92 30 92 46 80 46 L30 46 C18 46 18 62 30 62 L80 62 C92 62 92 78 80 78 L18 78' }[id];
      return svg(100, 100, '<rect x="6" y="6" width="88" height="88" rx="16" fill="' + tc + '" ' + SW + '/><path d="' + d + '" fill="none" stroke="#5b5670" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/><path d="' + d + '" fill="none" stroke="#fff" stroke-width="2" stroke-dasharray="5 6"/>');
    }
    if (/^course_/.test(id)) {
      var th = THEME[id] || THEME.course_meadow;
      return svg(100, 100, '<rect x="6" y="6" width="88" height="88" rx="16" fill="' + th[0] + '" ' + SW + '/><path d="M6 70 Q 30 56 50 66 Q 72 76 94 62 L94 78 Q94 94 78 94 L22 94 Q6 94 6 78 Z" fill="' + th[1] + '"/>' +
        '<g ' + SW2 + '><rect x="30" y="44" width="4" height="22" fill="#fff"/><rect x="50" y="44" width="4" height="22" fill="#fff"/><rect x="27" y="42" width="30" height="7" rx="3" fill="#ff6b6b"/></g><circle cx="72" cy="34" r="6" fill="#ffd23f" ' + SW2 + '/>');
    }
    var sp = sprite(id, st);
    if (sp) return sp.svg;
    return svg(100, 100, '<rect x="14" y="14" width="72" height="72" rx="18" fill="#eee"/>');
  }

  /* render a pet SVG as a data URL (for canvas games) */
  function petDataUrl(id, opts) {
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(pet(id, opts));
  }

  root.SLWorldArt = { CH: CH, defs: defs, island: island, sprite: sprite, pet: pet, icon: icon, petDataUrl: petDataUrl, KARTS: KARTS, BALLS: BALLS, STADIA: STADIA, THEME: THEME, PETCOL: PETCOL };
}(typeof self !== 'undefined' ? self : this));
