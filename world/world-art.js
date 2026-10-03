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

  var WALL = { wall_cream: '#f7e6c4', wall_pink: '#f9b7cc', wall_mint: '#b8ecd6', wall_sky: '#a9d6f7', wall_lilac: '#d6bdf2' };
  var DOOR = { door_blue: '#3b7dd8', door_red: '#d94b4b', door_green: '#38a85c', door_gold: '#f0c02f' };
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

  /* ================================================================
     ENCORE CITY v2 — shared 2D pieces for the home shapes, the city
     buildings and the new accessories. Colours are the art bible v2
     PALETTE_V2 tokens (the same names the 3D look table uses), written
     here as hex so the 2D fallback needs nothing else loaded:
       Midnight Ink #14101f · Graphite #2e2b3a · Night Asphalt #3a3646
       Concrete #8c8798 / Light #c9c5d3 · Bone White #f4f2fa
       Smoked Glass #1b2438 · Glass Edge #8fb7ff · Smoked Deep #0e1626
       Gunmetal #5a5f72 / Spec #e6e9f2 / Mid #7c8194 / Deep #2a2d3a
       Teak #9a6a4a / Light #b07e58 · Milk Tea #e2be94 · CTA Magenta #e0157f
       Neon Magenta #ff2e9a · LED Cyan #22e4ff · Electric Violet #8a5cff
       Laser Lime #c6ff3d · Sunset Amber #ffb23e · Window Warm #ffd08a
       Leaf Deep #2f7d57 · Leaf Lit #57b07a · Night Glass Plum #43294f
       Error Coral #ff5a6a
     Neon only ever goes on lines, rings, signs and screens.
     CSS HOOKS (styled by world/island-encore.css; every animation there is
     <= 2 Hz and off under reduced motion — nothing here animates by itself):
       .slw-neon     neon tube / sign / ring; `color` = its hue (Showtime glow)
       .slw-win      smoked glazing (warm fill at Showtime)
       .slw-strip    photo strip (Photo Booth, act 'snap'; origin = top edge)
       .slw-pearls   boba pearls (act 'serve')      .slw-hatch  serving hatch (origin = top)
       .slw-screen   LED tower screen; data-prog="0..3" picks the visible
                     .slw-prog.pN group (N > 0 ships display="none")
       .slw-marquee  the child's name on the LED tower (scroll by -50%: the text repeats)
       .slw-onair    ON AIR lightbox, dim at rest (act 'record' lights it, steady)
       .slw-eq       EQ / VU bars (origin = bottom)  .slw-floor  dance-floor tiles
       .slw-bean     rooftop beanbags (origin = bottom)
       .slw-beam     stage light beams, opacity 0 until Showtime / act 'encore'
       .slw-twinkle  festoon and booth bulbs (v1 class)  .slw-smoke, .slw-flag (v1)
     ================================================================ */

  /* v2 walls and door. A1 appends the same values to the WALL / DOOR literals
     above (those two lines are LOCKED and test-parsed); filling in only what is
     missing keeps the 2D art right in either merge order. */
  function fillMissing(map, extra) { Object.keys(extra).forEach(function (k) { if (!map[k]) map[k] = extra[k]; }); }
  fillMissing(WALL, { wall_concrete: '#a9a5b3', wall_gallery: '#eceaf2', wall_graphite: '#34303f', wall_midnight: '#232a57' });
  fillMissing(DOOR, { door_glass: '#1b2438' });

  var NEON_DEFAULT = '#ff2e9a';               /* Neon Magenta, when no member colour is given */
  var SIGN_FONT = 'font-family="Unbounded, Outfit, Arial, sans-serif" font-weight="800" text-anchor="middle"';
  function n1(x) { return String(Math.round(x * 10) / 10); }
  function hexOk(h) { return typeof h === 'string' && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(h) ? h.toLowerCase() : null; }
  function xmlEsc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  /* the ✦ spark: a 4-point star (never 5) centred on (cx, cy) */
  function star4(cx, cy, r) {
    var i = r * 0.28;
    return 'M' + n1(cx) + ' ' + n1(cy - r) + ' L' + n1(cx + i) + ' ' + n1(cy - i) + ' L' + n1(cx + r) + ' ' + n1(cy) + ' L' + n1(cx + i) + ' ' + n1(cy + i) +
      ' L' + n1(cx) + ' ' + n1(cy + r) + ' L' + n1(cx - i) + ' ' + n1(cy + i) + ' L' + n1(cx - r) + ' ' + n1(cy) + ' L' + n1(cx - i) + ' ' + n1(cy - i) + ' Z';
  }
  /* a neon tube: soft sleeve + bright core in one .slw-neon group */
  function neon(d, col, w) {
    return '<g class="slw-neon" color="' + col + '" fill="none" stroke="' + col + '" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="' + d + '" stroke-width="' + n1(w * 2.6) + '" opacity="0.3"/><path d="' + d + '" stroke-width="' + n1(w) + '"/></g>';
  }
  function neonStar(cx, cy, r, col) { return '<path class="slw-neon" color="' + col + '" d="' + star4(cx, cy, r) + '" fill="' + col + '" stroke="' + INK + '" stroke-width="1.2" stroke-linejoin="round"/>'; }
  /* smoked glass pane with a Glass Edge glint and Gunmetal mullions */
  function glass(x, y, w, h, cols, rows) {
    var out = '<rect class="slw-win" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="2" fill="#1b2438" ' + SW2 + '/>';
    var bars = '';
    for (var c = 1; c < cols; c++) bars += 'M' + n1(x + w * c / cols) + ' ' + y + ' v' + h + ' ';
    for (var r = 1; r < rows; r++) bars += 'M' + x + ' ' + n1(y + h * r / rows) + ' h' + w + ' ';
    if (bars) out += '<path d="' + bars + '" stroke="#5a5f72" stroke-width="2"/>';
    var g = Math.min(w, h, 16) * 0.6;
    return out + '<path d="M' + n1(x + 3) + ' ' + n1(y + 3 + g) + ' L' + n1(x + 3 + g) + ' ' + n1(y + 3) + '" stroke="#8fb7ff" stroke-width="1.6" stroke-linecap="round" opacity="0.75"/>';
  }
  function porthole(cx, cy, r) {
    return '<circle class="slw-win" cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="#1b2438"/><circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="#5a5f72" stroke-width="3"/>' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + (r + 1.5) + '" fill="none" stroke="' + INK + '" stroke-width="1.5"/>' +
      '<path d="M' + n1(cx - r * 0.5) + ' ' + n1(cy - r * 0.1) + ' Q' + n1(cx - r * 0.45) + ' ' + n1(cy - r * 0.5) + ' ' + n1(cx - r * 0.05) + ' ' + n1(cy - r * 0.55) + '" fill="none" stroke="#8fb7ff" stroke-width="1.5" stroke-linecap="round"/>';
  }
  /* a painted trim stripe, pattern A/B/C by variant (solid / dashed / dotted) */
  function stripeBand(x1, x2, y, v, col) {
    var dash = ['', ' stroke-dasharray="9 6"', ' stroke-dasharray="0.1 7"'][v] || '';
    return '<path d="M' + x1 + ' ' + y + ' L' + x2 + ' ' + y + '" stroke="' + col + '" stroke-width="3" stroke-linecap="round"' + dash + '/>';
  }
  function mirror(w, inner) { return '<g transform="matrix(-1 0 0 1 ' + w + ' 0)">' + inner + '</g>'; }

  /* roof finish colours: the LOCKED pair literal (one copy, parsed by the look tests) */
  function roofPair(roof) {
    var rc = { roof_red: ['#e0574f', '#c4433c'], roof_blue: ['#4a6fa5', '#3a5888'], roof_thatch: ['#e3b24f', '#c99634'], roof_candy: ['#ff8fb8', '#f06d9e'] }[roof] || ['#e0574f', '#c4433c'];
    return rc;
  }
  var CASTLE = { stone: '#b9b4c9', tower: '#cdc8dc', cone: '#6c5ce7', slit: '#4b4f6b' };
  var CANDY_BITS = ['#ffd23f', '#4fc3f7', '#7bd88f', '#c38bff', '#fff'];

  /* ---------------- house (2×2, viewBox 200×250, front base y≈206) ----------------
     st = {shape, wall, roof, door, details, variant (0|1), member (hex)}.
     A missing or unknown shape draws the classic cottage, byte-identical to v1:
     the caller (rewards-world artState) resolves the default shape. Every shape
     keeps the door at x 86–114 standing on the y≈206 step, so the 2D doorway and
     the avatar beside the house line up. The roof slot is each shape's crown. */
  function house(st) {
    st = st || {};
    var draw = SHAPE_ART[st.shape];
    return draw ? draw(st) : cottage(st);
  }
  function cottage(st) {
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
      var rc = roofPair(roof);
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
    /* v2 items only (v1 states never reach these lines, so v1 output is unchanged) */
    if (st.door === 'door_glass') out += glassDoorTrim('M90 206 L90 166 Q100 156 110 166 L110 206', 'M93 196 L93 170 Q96 165 100 163');
    if (det.detail_neon) out += neon(roof === 'roof_castle' ? 'M28 88 L172 88 M14 58 L48 58 M152 58 L186 58' : 'M18 112 L100 40 L182 112', memberHex(st), 2.4);
    return out;
  }

  /* door_glass on any shape: a Gunmetal inner frame and a Glass Edge glint */
  function glassDoorTrim(frame, glint) {
    return '<path d="' + frame + '" fill="none" stroke="#5a5f72" stroke-width="2.5" stroke-linejoin="round"/>' +
      '<path d="' + glint + '" fill="none" stroke="#8fb7ff" stroke-width="1.8" stroke-linecap="round" opacity="0.8"/>';
  }
  function memberHex(st) { return hexOk(st && st.member) || NEON_DEFAULT; }
  function trimOf(st) { return (st.variant | 0) === 1 ? 1 : 0; }

  /* modern slab door at x 86–114 (top y0, bottom yb) with a bar handle and the shared step */
  function slabDoor(st, y0, yb) {
    yb = yb || 208;
    var out = '<rect x="86" y="' + y0 + '" width="28" height="' + (yb - y0) + '" rx="2" fill="' + (DOOR[st.door] || DOOR.door_blue) + '" ' + SW + '/>';
    if (st.door === 'door_glass') out += glassDoorTrim('M90 ' + (yb - 3) + ' L90 ' + (y0 + 4) + ' L110 ' + (y0 + 4) + ' L110 ' + (yb - 3), 'M93 ' + (y0 + 22) + ' L99 ' + (y0 + 9));
    out += '<rect x="106" y="' + n1(y0 + (yb - y0) * 0.4) + '" width="3.4" height="13" rx="1.7" fill="#e6e9f2" stroke="' + INK + '" stroke-width="1"/>';
    return out + '<rect x="80" y="206" width="40" height="6" rx="3" fill="#c9c5d3" ' + SW2 + '/>';
  }
  /* a red-roof shape's tiled pent canopy over the entrance */
  function entranceCanopy(y, rc) {
    return '<path d="M76 ' + y + ' L124 ' + y + ' L119 ' + (y + 9) + ' L81 ' + (y + 9) + ' Z" fill="' + rc[0] + '" ' + SW2 + '/>' +
      '<path d="M86 ' + (y + 1) + ' l-2 7 M96 ' + (y + 1) + ' l-1 7 M104 ' + (y + 1) + ' l1 7 M114 ' + (y + 1) + ' l2 7" stroke="' + rc[1] + '" stroke-width="2"/>';
  }
  /* blue roofs clad the top storey in slate */
  function slateClad(x, y, w, h, rc) {
    var lines = '';
    for (var yy = y + 8; yy < y + h - 2; yy += 8) lines += 'M' + (x + 2) + ' ' + yy + ' h' + (w - 4) + ' ';
    return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="4" fill="' + rc[0] + '" ' + SW + '/><path d="' + lines + '" stroke="' + rc[1] + '" stroke-width="2"/>';
  }
  /* teak accent cladding (the trim variant decides which side it sits on) */
  function teakPanel(x, y, w, h) {
    var boards = '';
    for (var xx = x + 6; xx < x + w - 2; xx += 6) boards += 'M' + xx + ' ' + (y + 2) + ' v' + (h - 4) + ' ';
    return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="3" fill="#9a6a4a" ' + SW2 + '/><path d="' + boards + '" stroke="#b07e58" stroke-width="2"/>';
  }
  function turret(x, yTop, yBase, coneH, pennant) {
    var cx = x + 11;
    return '<rect x="' + x + '" y="' + yTop + '" width="22" height="' + (yBase - yTop) + '" fill="' + CASTLE.tower + '" ' + SW + '/>' +
      '<rect x="' + (x + 7) + '" y="' + (yTop + 10) + '" width="8" height="14" rx="4" fill="' + CASTLE.slit + '"/>' +
      '<path d="M' + (x - 4) + ' ' + (yTop + 2) + ' L' + cx + ' ' + (yTop + 2 - coneH) + ' L' + (x + 26) + ' ' + (yTop + 2) + ' Z" fill="' + CASTLE.cone + '" ' + SW + '/>' +
      '<path d="M' + cx + ' ' + (yTop + 2 - coneH) + ' l0 -12 l12 5 l-12 5" fill="' + pennant + '" ' + SW2 + '/>';
  }
  function merlons(x1, x2, y) {
    var out = '';
    for (var x = x1; x + 10 <= x2; x += 18) out += '<rect x="' + x + '" y="' + (y - 9) + '" width="10" height="10" fill="' + CASTLE.stone + '" ' + SW2 + '/>';
    return out;
  }
  function sprinkles(pts) {
    return pts.map(function (p, i) {
      return '<rect x="' + n1(p[0] - 3.5) + '" y="' + n1(p[1] - 1.5) + '" width="7" height="3" rx="1.5" fill="' + CANDY_BITS[i % 5] + '" transform="rotate(' + (i * 37 % 180) + ' ' + n1(p[0]) + ' ' + n1(p[1]) + ')"/>';
    }).join('');
  }
  function cherry(cx, cy) { return '<path d="M' + cx + ' ' + (cy - 6) + ' q 2 -8 8 -9" fill="none" stroke="#2f7d57" stroke-width="2" stroke-linecap="round"/><circle cx="' + cx + '" cy="' + cy + '" r="6.5" fill="#ff5c6c" ' + SW2 + '/>'; }

  /* flat-parapet crown (loft, tower): a coping band x1..x2 with its top at y */
  function flatCrown(x1, x2, y, roof, rc) {
    var w = x2 - x1, out = '', i;
    if (roof === 'roof_castle') {
      out += '<rect x="' + x1 + '" y="' + y + '" width="' + w + '" height="9" fill="' + CASTLE.stone + '" ' + SW2 + '/>' + merlons(x1 + 22, x2 - 22, y + 1);
      var coneH = Math.max(14, Math.min(30, y - 26));
      return out + turret(x1 - 8, y - 10, y + 40, coneH, '#ff6b6b') + turret(x2 - 14, y - 10, y + 40, coneH, '#ffd23f');
    }
    if (roof === 'roof_thatch') {
      out += '<path d="M' + (x1 - 3) + ' ' + (y + 8) + ' Q' + (x1 - 3) + ' ' + (y - 9) + ' ' + (x1 + 14) + ' ' + (y - 9) + ' L' + (x2 - 14) + ' ' + (y - 9) + ' Q' + (x2 + 3) + ' ' + (y - 9) + ' ' + (x2 + 3) + ' ' + (y + 8) + ' Z" fill="' + rc[0] + '" ' + SW + '/>';
      var tufts = '', fringe = 'M' + (x1 - 2) + ' ' + (y + 8);
      for (i = 0; x1 + 10 + i * 12 < x2 - 6; i++) tufts += 'M' + (x1 + 10 + i * 12) + ' ' + (y + 4) + ' l4 -10 ';
      for (i = 0; x1 + i * 8 < x2; i++) fringe += ' l4 6 l4 -6';
      return out + '<path d="' + tufts + '" stroke="#b9842a" stroke-width="2.5" stroke-linecap="round"/><path d="' + fringe + '" fill="none" stroke="#b9842a" stroke-width="2" stroke-linejoin="round"/>';
    }
    if (roof === 'roof_candy') {
      /* icing over a pink coping: 12 drips of three lengths, scalloped between */
      var seg = w / 12, ice = 'M' + x1 + ' ' + (y - 2) + ' L' + x2 + ' ' + (y - 2) + ' L' + x2 + ' ' + (y + 5);
      for (i = 11; i >= 0; i--) {
        var a = x1 + i * seg, c = a + seg / 2, len = 5 + (i * 5 % 3) * 4;
        ice += ' Q' + n1(a + seg * 0.85) + ' ' + (y + 7) + ' ' + n1(c + 3.5) + ' ' + (y + 6) + ' L' + n1(c + 3.5) + ' ' + (y + 6 + len) +
          ' A3.5 3.5 0 0 1 ' + n1(c - 3.5) + ' ' + (y + 6 + len) + ' L' + n1(c - 3.5) + ' ' + (y + 6) + ' Q' + n1(a + seg * 0.15) + ' ' + (y + 7) + ' ' + n1(a) + ' ' + (y + 5);
      }
      var pts = [];
      for (i = 0; i < 10; i++) pts.push([x1 + 9 + i * (w - 18) / 9, y + (i % 2 ? 2.5 : 0.5)]);
      return out + '<rect x="' + x1 + '" y="' + y + '" width="' + w + '" height="9" fill="' + rc[0] + '" ' + SW2 + '/>' +
        '<path d="' + ice + ' Z" fill="#fff" stroke="' + INK + '" stroke-width="1.4" stroke-linejoin="round"/>' + sprinkles(pts) + cherry(x2 - 7, y - 7);
    }
    /* red: terracotta coping with tile ticks; blue: slate coping */
    out += '<rect x="' + x1 + '" y="' + y + '" width="' + w + '" height="9" rx="2" fill="' + (roof === 'roof_blue' ? rc[1] : rc[0]) + '" ' + SW2 + '/>';
    var ticks = '';
    for (var tx = x1 + 6; tx < x2 - 2; tx += 8) ticks += 'M' + tx + ' ' + (y + 2) + ' v5 ';
    return out + '<path d="' + ticks + '" stroke="' + (roof === 'roof_blue' ? rc[0] : rc[1]) + '" stroke-width="2"/>';
  }

  /* details shared by the modern shapes */
  function flue(x, y, h) {
    return '<rect x="' + x + '" y="' + y + '" width="8" height="' + h + '" rx="2" fill="#7c8194" ' + SW2 + '/><rect x="' + (x - 2) + '" y="' + (y - 4) + '" width="12" height="6" rx="2" fill="#5a5f72" ' + SW2 + '/>' +
      '<g class="slw-smoke"><circle cx="' + (x + 5) + '" cy="' + (y - 12) + '" r="6" fill="#eef0f6"/><circle cx="' + (x + 12) + '" cy="' + (y - 22) + '" r="8" fill="#eef0f6"/><circle cx="' + (x + 20) + '" cy="' + (y - 33) + '" r="9" fill="#eef0f6" opacity="0.8"/></g>';
  }
  function windowBox(x, y, w) {
    var out = '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="7" rx="2" fill="#9a6a4a" ' + SW2 + '/>', cols = ['#ff5c8a', '#ffd23f', '#ff7ab8', '#c38bff'];
    for (var i = 0, k = Math.max(2, Math.round(w / 11)); i < k; i++) out += '<circle cx="' + n1(x + 5 + i * (w - 10) / (k - 1)) + '" cy="' + (y - 1 - (i % 2) * 2) + '" r="3.6" fill="' + cols[i % 4] + '"/>';
    return out;
  }
  function fairyLights(x1, x2, y, sag) {
    var lc = ['#ffd08a', '#ff2e9a', '#22e4ff', '#c6ff3d', '#8a5cff'];
    var out = '<path d="M' + x1 + ' ' + y + ' Q ' + n1((x1 + x2) / 2) + ' ' + (y + sag * 2) + ' ' + x2 + ' ' + y + '" fill="none" stroke="' + INK + '" stroke-width="1.4"/>';
    for (var l = 0; l < 11; l++) {
      var t = l / 10;
      out += '<circle class="slw-twinkle" style="animation-delay:' + (l * 0.19).toFixed(2) + 's" cx="' + n1(x1 + (x2 - x1) * t) + '" cy="' + n1(y + sag * 4 * t * (1 - t) + 2.5) + '" r="3" fill="' + lc[l % 5] + '"/>';
    }
    return out;
  }
  function roofFlag(x, y) {
    return '<rect x="' + (x - 1.5) + '" y="' + (y - 34) + '" width="3" height="34" fill="' + INK + '"/><g class="slw-flag"><path d="M' + (x + 1.5) + ' ' + (y - 33) + ' l22 7 l-22 7 z" fill="#ffd23f" ' + SW2 + '/></g>';
  }

  /* City loft: two stacked boxes, the top one cantilevered left over the door
     as a porch (teak soffit + 3 downlights), a ribbon window and a glass wall */
  function loft(st) {
    var v = trimOf(st), roof = st.roof || 'roof_red', castle = roof === 'roof_castle', rc = roofPair(roof);
    var wall = WALL[st.wall] || WALL.wall_cream, det = st.details || {};
    var out = shadow(100, 214, 92);
    if (det.detail_chimney) out += flue(136, 46, 36);
    out += '<rect x="64" y="138" width="108" height="70" rx="4" fill="' + wall + '" ' + SW + '/><rect x="64" y="190" width="108" height="18" fill="rgba(0,0,0,0.06)"/>';
    out += roof === 'roof_blue' ? slateClad(28, 82, 128, 60, rc) : '<rect x="28" y="82" width="128" height="60" rx="4" fill="' + wall + '" ' + SW + '/>';
    out += v ? teakPanel(28, 82, 24, 60) : teakPanel(132, 82, 24, 60);
    var rw = v ? [58, 86, 3] : [40, 86, 4];                       /* ribbon window: x, width, panes */
    out += glass(rw[0], 96, rw[1], 26, rw[2], 1);
    if (det.detail_windowbox) out += windowBox(rw[0] - 2, 124, rw[1] + 4);
    out += glass(v ? 122 : 124, 150, v ? 44 : 42, 52, v ? 3 : 2, 1);   /* floor-to-ceiling glass */
    out += '<rect x="28" y="140" width="92" height="7" fill="#9a6a4a" ' + SW2 + '/>' +
      '<circle cx="46" cy="148.5" r="2.2" fill="#ffd08a"/><circle cx="74" cy="148.5" r="2.2" fill="#ffd08a"/><circle cx="102" cy="148.5" r="2.2" fill="#ffd08a"/>';
    if (roof === 'roof_red') out += entranceCanopy(147, rc);
    out += slabDoor(st, 158);
    out += flatCrown(24, 160, 76, roof, rc) + neon('M30 88 L154 88', '#22e4ff', 1.4);
    if (det.detail_lights) out += fairyLights(30, 154, 89, 4);
    if (det.detail_flag && !castle) out += roofFlag(152, roof === 'roof_thatch' ? 67 : 76);
    if (det.detail_neon) out += neon('M24 85 L24 76 L160 76 L160 85 M156 138 L172 138 L172 146', memberHex(st), 2.2);
    return out;
  }

  /* hip roof (villa): eave y ye over x1..x2, ridge y yr inset by `inset` */
  function hipCrown(x1, x2, ye, yr, inset, roof, rc, noCherry) {
    var out = '', i;
    if (roof === 'roof_castle') {
      return '<rect x="' + (x1 + 4) + '" y="' + (ye - 16) + '" width="' + (x2 - x1 - 8) + '" height="16" fill="' + CASTLE.stone + '" ' + SW + '/>' + merlons(x1 + 8, x2 - 8, ye - 15);
    }
    out += '<path d="M' + x1 + ' ' + ye + ' L' + (x1 + inset) + ' ' + yr + ' L' + (x2 - inset) + ' ' + yr + ' L' + x2 + ' ' + ye + ' Z" fill="' + rc[0] + '" ' + SW + '/>' +
      '<path d="M' + (x2 - inset) + ' ' + yr + ' L' + x2 + ' ' + ye + ' L' + (x2 - inset) + ' ' + ye + ' Z" fill="' + rc[1] + '"/>';
    var courses = roof === 'roof_blue' ? [0.3, 0.55, 0.8] : roof === 'roof_red' ? [0.38, 0.72] : [];
    courses.forEach(function (t) {
      var y = yr + t * (ye - yr), a = x1 + inset * (1 - t) + 5, b = x2 - inset * (1 - t) - 5;
      out += '<path d="M' + n1(a) + ' ' + n1(y) + ' L' + n1(b) + ' ' + n1(y) + '" stroke="' + rc[1] + '" stroke-width="' + (roof === 'roof_blue' ? 2 : 3) + '"/>';
    });
    if (roof === 'roof_thatch') {
      var straw = '';
      for (i = 0; x1 + inset * 0.6 + i * 14 < x2 - inset * 0.6; i++) straw += 'M' + n1(x1 + inset * 0.6 + i * 14) + ' ' + (ye - 2) + ' l5 -' + Math.round((ye - yr) * 0.55) + ' ';
      out += '<path d="' + straw + '" stroke="#b9842a" stroke-width="2.5"/><path d="M' + x1 + ' ' + ye + ' Q ' + ((x1 + x2) / 2) + ' ' + (ye + 10) + ' ' + x2 + ' ' + ye + '" fill="none" ' + SW + '/>';
    }
    if (roof === 'roof_candy') {
      var sc = 'M' + (x1 + 6) + ' ' + (ye - 4), step = (x2 - x1 - 12) / 8;
      for (i = 0; i < 8; i++) sc += ' Q' + n1(x1 + 6 + (i + 0.5) * step) + ' ' + (ye + 8) + ' ' + n1(x1 + 6 + (i + 1) * step) + ' ' + (ye - 4);
      out += '<path d="' + sc + '" fill="#fff" ' + SW2 + '/>' +
        sprinkles([[x1 + inset + 8, yr + 10], [x1 + inset + 30, yr + 18], [(x1 + x2) / 2, yr + 9], [x2 - inset - 30, yr + 18], [x2 - inset - 8, yr + 10]]) + (noCherry ? '' : cherry((x1 + x2) / 2, yr - 5));
    }
    return out;
  }

  /* Beach villa: a long low back wing with glass sliders, a front wing holding
     the door (porthole), a teak deck with a plunge pool and a lounger */
  function villa(st) {
    var v = trimOf(st), roof = st.roof || 'roof_red', castle = roof === 'roof_castle', rc = roofPair(roof);
    var wall = WALL[st.wall] || WALL.wall_cream, det = st.details || {}, col = memberHex(st);
    var out = shadow(100, 214, 96);
    if (castle) out += turret(6, 98, 200, 30, '#ff6b6b') + turret(172, 98, 200, 30, '#ffd23f');
    if (det.detail_chimney) out += flue(52, 92, 30);
    out += '<rect x="18" y="138" width="164" height="62" rx="4" fill="' + wall + '" ' + SW + '/><rect x="18" y="184" width="164" height="16" fill="rgba(0,0,0,0.06)"/>';
    out += v ? glass(24, 148, 52, 44, 3, 1) : glass(26, 148, 42, 44, 2, 1);
    out += glass(140, 148, 36, 40, v ? 3 : 2, 1);
    if (det.detail_windowbox) out += windowBox(v ? 24 : 26, 193, v ? 52 : 42);
    out += hipCrown(10, 190, 144, 112, 42, roof, rc);
    if (det.detail_neon) out += neon(castle ? 'M14 128 L186 128' : 'M10 144 L52 112 L148 112 L190 144', col, 2.2);
    if (det.detail_lights) out += fairyLights(16, 184, 146, 4);
    if (det.detail_flag && !castle) out += roofFlag(100, 112);
    /* front wing with the door, its accent panel and a porthole */
    out += '<rect x="66" y="160" width="68" height="48" rx="3" fill="' + wall + '" ' + SW + '/>';
    out += v ? teakPanel(116, 160, 18, 48) + porthole(76, 178, 6) : teakPanel(66, 160, 18, 48) + porthole(124, 178, 6);
    out += castle ? '<rect x="62" y="150" width="76" height="12" fill="' + CASTLE.stone + '" ' + SW2 + '/>' + merlons(66, 134, 151)
      : hipCrown(58, 142, 162, 140, 22, roof, rc, true);
    if (det.detail_neon && !castle) out += neon('M58 162 L80 140 L120 140 L142 162', col, 2.2);
    out += slabDoor(st, 170);
    /* deck, plunge pool and lounger */
    out += '<rect x="136" y="194" width="60" height="16" rx="2" fill="#9a6a4a" ' + SW2 + '/><path d="M146 196 v12 M156 196 v12 M186 196 v12" stroke="#b07e58" stroke-width="2"/>' +
      '<ellipse cx="172" cy="202" rx="18" ry="5" fill="#6fd0ff" ' + SW2 + '/><ellipse cx="172" cy="202" rx="9" ry="2.4" fill="none" stroke="#fff" stroke-width="1.5" opacity="0.7"/>' +
      '<path d="M139 202 L148 202 L153 195" fill="none" stroke="#f4f2fa" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M140 203 l0 5 M150 203 l0 5" stroke="#5a5f72" stroke-width="2"/>';
    return out;
  }

  /* Neon tower: three storeys on a concrete plinth, a low annex with an outside
     zig-zag stair, and a blade sign with the ✦ on the tower corner */
  function tower(st) {
    var v = trimOf(st), roof = st.roof || 'roof_red', castle = roof === 'roof_castle', rc = roofPair(roof);
    var wall = WALL[st.wall] || WALL.wall_cream, det = st.details || {}, col = memberHex(st);
    var out = shadow(100, 214, 90);
    if (det.detail_chimney) out += flue(164, 104, 32);
    out += '<rect x="38" y="198" width="84" height="12" rx="2" fill="#8c8798" ' + SW2 + '/>';
    out += '<rect x="44" y="44" width="72" height="156" rx="3" fill="' + wall + '" ' + SW + '/><path d="M45 96 h70 M45 148 h70" stroke="rgba(0,0,0,0.12)" stroke-width="2"/>';
    if (roof === 'roof_blue') out += slateClad(44, 44, 72, 52, rc);
    if (v) out += teakPanel(44, 44, 12, 156);
    /* grid windows on three storeys: two per floor (v0) or one wide (v1) */
    [54, 106].forEach(function (y) {
      if (v) {
        out += glass(60, y, 50, 28, 3, 1);
        if (det.detail_windowbox) out += windowBox(58, y + 30, 54);
      } else {
        out += glass(52, y, 26, 30, 1, 2) + glass(84, y, 26, 30, 1, 2);
        if (det.detail_windowbox) out += windowBox(50, y + 32, 30) + windowBox(82, y + 32, 30);
      }
    });
    out += glass(v ? 60 : 52, 158, 22, 30, 1, 2);
    /* annex, its stair and the steel coping */
    out += '<rect x="116" y="140" width="64" height="68" rx="3" fill="' + wall + '" ' + SW + '/><rect x="116" y="190" width="64" height="18" fill="rgba(0,0,0,0.06)"/>';
    if (!v) out += teakPanel(162, 142, 18, 66);
    out += glass(124, 150, 22, 26, 1, 1) + '<rect x="114" y="134" width="68" height="8" rx="2" fill="#8c8798" ' + SW2 + '/>';
    out += '<path d="M176 206 L152 180 L160 180 L176 160 L170 160 L152 142" fill="none" stroke="#5a5f72" stroke-width="3" stroke-linejoin="round"/>' +
      '<path d="M166 194 h8 M160 187 h8 M154 180 h8 M162 173 h8 M168 166 h8 M164 153 h8 M158 147 h8" stroke="#7c8194" stroke-width="2.5" stroke-linecap="round"/>';
    if (roof === 'roof_red') out += entranceCanopy(142, rc);
    out += slabDoor(st, 152, 200);
    /* the blade sign: ✦ in the member colour (no letters, so icons stay non-personal) */
    out += '<path d="M42 74 h4 M42 118 h4" stroke="#5a5f72" stroke-width="3"/><rect x="28" y="66" width="14" height="60" rx="2" fill="#2e2b3a" ' + SW2 + '/>' +
      '<rect class="slw-neon" color="' + col + '" x="30.5" y="68.5" width="9" height="55" rx="1.5" fill="none" stroke="' + col + '" stroke-width="1.4"/>' + neonStar(35, 96, 8, col);
    out += flatCrown(40, 120, 38, roof, rc);
    if (det.detail_lights) out += fairyLights(46, 114, 49, 3);
    if (det.detail_flag && !castle) out += roofFlag(112, roof === 'roof_thatch' ? 29 : 38);
    if (det.detail_neon) out += neon('M40 47 L40 38 L120 38 L120 47 M114 134 L182 134', col, 2.2);
    return out;
  }

  /* Sky dome: a drum, a dome shell in the roof finish, a glass pod and antenna,
     an equator ring with an LED band, 4 portholes and a round-topped sliding door */
  function dome(st) {
    var v = trimOf(st), roof = st.roof || 'roof_red', castle = roof === 'roof_castle', rc = roofPair(roof);
    var wall = WALL[st.wall] || WALL.wall_cream, det = st.details || {}, col = memberHex(st);
    var shell = castle ? [CASTLE.stone, CASTLE.tower] : rc, arc = 'M30 160 A70 66 0 0 1 170 160';
    var out = shadow(100, 214, 92), i;
    if (castle) out += turret(12, 108, 204, 26, '#ff6b6b') + turret(166, 108, 204, 26, '#ffd23f');
    if (det.detail_chimney) out += flue(140, 80, 40);
    out += '<path d="M28 160 L28 198 Q100 216 172 198 L172 160 Z" fill="' + wall + '" ' + SW + '/>';
    out += v ? teakPanel(122, 166, 16, 36) : teakPanel(62, 166, 16, 36);
    out += '<path d="' + arc + ' Z" fill="' + shell[0] + '" ' + SW + '/><path d="M100 94 A70 66 0 0 1 170 160 L148 160 Q146 112 100 94 Z" fill="' + shell[1] + '"/>';
    if (roof === 'roof_red') out += '<path d="M42 136 Q100 124 158 136 M58 112 Q100 102 142 112" fill="none" stroke="' + rc[1] + '" stroke-width="3"/>';
    if (roof === 'roof_blue') out += '<path d="M38 142 Q100 130 162 142 M48 124 Q100 112 152 124 M64 108 Q100 98 136 108 M70 102 Q64 130 62 156 M130 102 Q136 130 138 156" fill="none" stroke="' + rc[1] + '" stroke-width="2"/>';
    if (roof === 'roof_thatch') {
      var lump = 'M30 160', tuft = '';
      for (i = 0; i < 12; i++) {
        var a0 = Math.PI * (1 - i / 12), a1 = Math.PI * (1 - (i + 1) / 12), am = (a0 + a1) / 2;
        lump += ' Q' + n1(100 + 78 * Math.cos(am)) + ' ' + n1(160 - 74 * Math.sin(am)) + ' ' + n1(100 + 70 * Math.cos(a1)) + ' ' + n1(160 - 66 * Math.sin(a1));
      }
      for (i = 0; i < 16; i++) tuft += 'M' + n1(34 + i * 8.8) + ' 152 l2 8 ';
      out += '<path d="' + lump + ' Z" fill="' + rc[0] + '" ' + SW + '/><path d="M60 128 l6 -12 M84 110 l5 -12 M112 108 l5 -12 M136 124 l5 -12" stroke="#b9842a" stroke-width="2.5"/>' +
        '<path d="' + tuft + '" stroke="#b9842a" stroke-width="2.5" stroke-linecap="round"/>';
    }
    if (roof === 'roof_candy') {
      var cap = 'M50 114 A70 66 0 0 1 150 114', k = 7;
      for (i = k; i > 0; i--) {
        var x0 = 50 + 100 * i / k, x1 = 50 + 100 * (i - 1) / k, len = 8 + (i % 3) * 5;
        cap += ' Q' + n1((x0 + x1) / 2) + ' ' + (114 + len) + ' ' + n1(x1) + ' 114';
      }
      out += '<path d="' + cap + ' Z" fill="#fff" ' + SW2 + '/>' + sprinkles([[46, 142], [68, 134], [100, 130], [132, 134], [154, 142], [84, 104], [116, 104]]);
    }
    /* portholes: two in the shell, two in the drum */
    out += v ? porthole(56, 136, 8) + porthole(144, 136, 8) : porthole(66, 128, 9) + porthole(134, 128, 9);
    out += porthole(44, 182, 7) + porthole(156, 182, 7);
    if (det.detail_windowbox) out += windowBox(34, 191, 20) + windowBox(146, 191, 20);
    /* equator ring and LED band, crenel ring on castle */
    if (castle) out += merlons(34, 170, 156);
    out += '<rect x="24" y="155" width="152" height="8" rx="4" fill="#5a5f72" ' + SW2 + '/>' + neon('M30 159 L170 159', '#22e4ff', 1.4);
    /* glass pod and antenna on top */
    out += '<path d="M100 79 L100 47" stroke="#5a5f72" stroke-width="3" stroke-linecap="round"/><circle class="slw-neon" color="#ff2e9a" cx="100" cy="45" r="3.6" fill="#ff2e9a" stroke="' + INK + '" stroke-width="1.2"/>' +
      '<circle class="slw-win" cx="100" cy="92" r="13" fill="#1b2438" ' + SW2 + '/><path d="M93 88 Q95 83 100 82" fill="none" stroke="#8fb7ff" stroke-width="1.6" stroke-linecap="round"/>';
    if (roof === 'roof_candy') out += cherry(110, 80);
    if (det.detail_flag && !castle) out += '<g class="slw-flag"><path d="M101.5 50 l20 6 l-20 6 z" fill="#ffd23f" ' + SW2 + '/></g>';
    if (det.detail_lights) out += fairyLights(30, 170, 164, 3);
    if (det.detail_neon) out += neon(arc, col, 2.2);
    /* vestibule and the sliding door on its rail */
    out += '<rect x="78" y="164" width="44" height="44" rx="3" fill="' + wall + '" ' + SW + '/><rect x="74" y="158" width="52" height="8" rx="3" fill="#5a5f72" ' + SW2 + '/>' +
      '<path d="M84 170 L132 170" stroke="#2a2d3a" stroke-width="2" stroke-linecap="round"/>' +
      '<path d="M86 208 L86 186 A14 14 0 0 1 114 186 L114 208 Z" fill="' + (DOOR[st.door] || DOOR.door_blue) + '" ' + SW + '/>';
    if (st.door === 'door_glass') out += glassDoorTrim('M90 205 L90 186 A10 10 0 0 1 110 186 L110 205', 'M93 198 L93 187 Q94 181 99 179');
    return out + '<rect x="106" y="190" width="3.4" height="12" rx="1.7" fill="#e6e9f2" stroke="' + INK + '" stroke-width="1"/>' +
      '<rect x="80" y="206" width="40" height="6" rx="3" fill="#c9c5d3" ' + SW2 + '/>';
  }

  var SHAPE_ART = { shape_loft: loft, shape_villa: villa, shape_tower: tower, shape_dome: dome };
  var SHAPES = ['shape_cottage', 'shape_loft', 'shape_villa', 'shape_tower', 'shape_dome'];

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

  /* ---------------- city buildings (kind 'fun', cat 'city') ----------------
     Sized by footprint in world units: 1×1 100×170, 2×1 200×170, 2×2 200×250,
     3×2 300×230 (the 2D stage scales by fp). Three trims by st.variant (0..2):
     accent {@member, Neon Magenta, LED Cyan}, sign side (variant 1 flips) and
     stripe pattern A/B/C. Words only from SIGN_WORDS plus the child's own name
     (st.name, LED tower marquee and stage wall); icons pass no name/member, so
     they are the same for every child. */
  var PIX_PET = ['e......e', 'eb....be', 'bbbbbbbb', 'bkbbbbkb', 'bbllllbb', 'bblnnlbb', '.bbllbb.'];
  function bldOpts(st, iconMode) {
    st = st || {};
    var v = iconMode ? 0 : Math.max(0, Math.min(2, st.variant | 0));
    var member = iconMode ? null : hexOk(st.member);
    return {
      v: v, flip: v === 1, acc: [member || '#8a5cff', '#ff2e9a', '#22e4ff'][v],
      name: iconMode ? '' : String(st.name == null ? '' : st.name).replace(/\s+/g, ' ').trim().slice(0, 12).toUpperCase(),
      pet: !iconMode && PETCOL[st.pet] ? st.pet : 'pet_puppy', icon: !!iconMode
    };
  }
  function signText(x, y, size, txt, fill) {
    return '<text x="' + x + '" y="' + y + '" ' + SIGN_FONT + ' font-size="' + size + '" fill="' + fill + '">' + xmlEsc(txt) + '</text>';
  }
  function bulbRing(cx, cy, r, count, dot) {
    var out = '';
    for (var i = 0; i < count; i++) {
      var a = i / count * Math.PI * 2;
      out += '<circle class="slw-twinkle" style="animation-delay:' + (i * 0.2).toFixed(1) + 's" cx="' + n1(cx + Math.cos(a) * r) + '" cy="' + n1(cy + Math.sin(a) * r) + '" r="' + dot + '" fill="#ffd08a"/>';
    }
    return out;
  }
  function starField(w, h) {
    var out = '<rect width="' + w + '" height="' + h + '" fill="#0e1626"/>', cols = ['#f4f2fa', '#22e4ff', '#8a5cff', '#ff2e9a'];
    for (var i = 0; i < 14; i++) out += '<circle cx="' + n1((i * 37 % 61) / 61 * w) + '" cy="' + n1((i * 23 % 47) / 47 * h) + '" r="' + (i % 3 ? 0.9 : 1.4) + '" fill="' + cols[i % 4] + '"/>';
    return out + '<path d="' + star4(w * 0.3, h * 0.42, 6) + ' ' + star4(w * 0.74, h * 0.64, 4.5) + '" fill="#f4f2fa"/>';
  }
  function eqBars(x0, yb, step, bw, hs, cols) {
    var out = '<g class="slw-eq" style="transform-box:fill-box;transform-origin:50% 100%">';
    hs.forEach(function (h, i) { out += '<rect x="' + n1(x0 + i * step) + '" y="' + (yb - h) + '" width="' + bw + '" height="' + h + '" rx="1" fill="' + cols[i % cols.length] + '"/>'; });
    return out + '</g>';
  }
  function pixelPet(petId, x0, y0, px) {
    var c = PETCOL[petId] || PETCOL.pet_puppy, map = { e: c.dark, b: c.body, l: c.light, k: '#14101f', n: c.nose }, out = '';
    PIX_PET.forEach(function (row, y) {
      for (var x = 0; x < row.length; x++) if (map[row[x]]) out += '<rect x="' + (x0 + x * px) + '" y="' + (y0 + y * px) + '" width="' + px + '" height="' + px + '" fill="' + map[row[x]] + '"/>';
    });
    return out;
  }

  /* Photo Booth (1×1): asphalt kiosk, curtain alcove, lens ring of bulbs, the photo strip */
  function bldPhotobooth(o) {
    var body = '<rect x="26" y="44" width="48" height="92" rx="4" fill="#3a3646" ' + SW + '/>' + stripeBand(31, 69, 52, o.v, o.acc) +
      '<rect x="30" y="58" width="20" height="74" rx="2" fill="#1b2438" ' + SW2 + '/>' +
      '<path d="M30 60 L50 60 L50 128 Q45 133 40 128 Q35 133 30 128 Z" fill="#e0157f" ' + SW2 + '/>' +
      '<path d="M36 63 L35 125 M42 63 L42 125 M47 63 L46 125" stroke="rgba(20,16,31,0.25)" stroke-width="2"/><rect x="28" y="56" width="24" height="4" rx="2" fill="#5a5f72"/>' +
      bulbRing(62, 77, 11.5, 8, 1.7) +
      '<circle cx="62" cy="77" r="8" fill="#5a5f72" ' + SW2 + '/><circle cx="62" cy="77" r="4.6" fill="#1b2438"/><circle cx="60.4" cy="75.4" r="1.4" fill="#8fb7ff"/>' +
      '<rect x="56" y="99" width="13" height="3" rx="1.5" fill="#14101f"/>' +
      '<g class="slw-strip" style="transform-box:fill-box;transform-origin:50% 0"><rect x="58" y="101" width="9" height="31" fill="#f4f2fa" stroke="' + INK + '" stroke-width="1.2"/>' +
      [o.acc, '#22e4ff', '#ff2e9a', '#8a5cff'].map(function (c, i) { return '<rect x="59.6" y="' + (103 + i * 7.3) + '" width="5.8" height="5.4" fill="' + c + '"/>'; }).join('') + '</g>';
    return shadow(50, 136, 30) + (o.flip ? mirror(100, body) : body) +
      '<rect x="49" y="18" width="2.5" height="10" fill="#5a5f72"/>' + neonStar(50, 15, 8, o.acc) +
      '<rect x="22" y="26" width="56" height="18" rx="3" fill="#2e2b3a" ' + SW2 + '/>' +
      '<rect class="slw-neon" color="' + o.acc + '" x="24.5" y="28.5" width="51" height="13" rx="2" fill="none" stroke="' + o.acc + '" stroke-width="1.4"/>' +
      signText(50, 39, 9, 'PHOTO', '#f4f2fa');
  }

  /* Boba Café (2×1): concrete kiosk under a giant bubble-tea cup; awning, table, stools */
  function bldBoba(o) {
    var awn = '';
    if (o.v === 0) for (var i = 0; i < 6; i++) awn += '<rect x="' + (108 + i * 15) + '" y="64" width="7" height="10" fill="' + o.acc + '"/>';
    if (o.v === 1) for (var j = 0; j < 3; j++) awn += '<rect x="' + (110 + j * 28) + '" y="64" width="14" height="10" fill="' + o.acc + '"/>';
    if (o.v === 2) for (var k = 0; k < 9; k++) awn += '<circle cx="' + (110 + k * 10) + '" cy="69" r="2.2" fill="' + o.acc + '"/>';
    var art = shadow(100, 137, 92) +
      '<rect x="12" y="72" width="86" height="64" rx="4" fill="#8c8798" ' + SW + '/>' + glass(22, 88, 66, 22, 3, 1) +
      '<g class="slw-hatch" style="transform-box:fill-box;transform-origin:50% 0"><rect x="18" y="76" width="74" height="10" rx="2" fill="#f4f2fa" ' + SW2 + '/><path d="M20 83 h70" stroke="' + o.acc + '" stroke-width="2.5"/></g>' +
      '<rect x="14" y="110" width="82" height="7" rx="2" fill="#9a6a4a" ' + SW2 + '/><path d="M17 111.8 h76" stroke="#b07e58" stroke-width="1.6"/>' + stripeBand(22, 88, 127, o.v, o.acc) +
      /* the giant cup: frosted tube, milk tea, pearls, lid and a tilted straw */
      '<rect x="61" y="2" width="6" height="26" rx="3" fill="' + o.acc + '" ' + SW2 + ' transform="rotate(12 64 24)"/>' +
      '<path d="M35.6 38 L80.4 38 L76 72 L40 72 Z" fill="#e2be94"/>' +
      '<g class="slw-pearls">' + [[48, 66], [56, 67], [64, 66], [72, 66], [52, 59], [61, 60], [69, 59]].map(function (p) { return '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="3.3" fill="#14101f"/>'; }).join('') + '</g>' +
      '<path d="M34 26 L82 26 L76 72 L40 72 Z" fill="#f4f2fa" fill-opacity="0.35" ' + SW + '/><path d="M40 32 L44 66" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity="0.55"/>' +
      neon('M34 26 L82 26 L76 72 L40 72 Z', '#ff2e9a', 1.2) +
      '<rect x="30" y="20" width="56" height="8" rx="3" fill="#f4f2fa" ' + SW2 + '/>' +
      /* awning on the right cell, posts, bar table and two stools */
      '<path d="M110 74 v62 M188 74 v62" stroke="#5a5f72" stroke-width="4"/>' +
      '<rect x="104" y="64" width="90" height="10" rx="2" fill="#f4f2fa" ' + SW2 + '/>' + awn + neon('M106 76 L192 76', '#ff2e9a', 1.6) +
      '<path d="M148 104 v30 M139 134 h18" stroke="#5a5f72" stroke-width="3.5" stroke-linecap="round"/><ellipse cx="148" cy="103" rx="18" ry="5" fill="#9a6a4a" ' + SW2 + '/>' +
      [124, 172].map(function (x) { return '<path d="M' + (x - 5) + ' 134 L' + (x - 3) + ' 117 M' + (x + 5) + ' 134 L' + (x + 3) + ' 117" stroke="#5a5f72" stroke-width="2.5"/><ellipse cx="' + x + '" cy="116" rx="8" ry="3" fill="#b07e58" ' + SW2 + '/>'; }).join('');
    return o.flip ? mirror(200, art) : art;
  }

  /* LED Screen Tower (1×1): steel mast, ladder and a giant screen. Island sprites carry
     4 programs (name marquee, pixel pet, EQ, star field) switched by data-prog;
     icons always show the star field. */
  function bldLedtower(o) {
    var lx = o.flip ? 42 : 52, rungs = '';
    for (var y = 78; y < 124; y += 7) rungs += 'M' + lx + ' ' + y + ' h6 ';
    var screen;
    if (o.icon) screen = starField(66, 50);
    else {
      var nm = o.name || 'ENCORE';
      screen = '<g class="slw-screen" data-prog="0">' +
        '<g class="slw-prog p0"><rect width="66" height="50" fill="#0e1626"/><g class="slw-marquee"><text x="4" y="31" ' + SIGN_FONT.replace('text-anchor="middle"', 'text-anchor="start"') + ' font-size="14" fill="#22e4ff">' + xmlEsc(nm + ' ✦ ' + nm + ' ✦') + '</text></g></g>' +
        '<g class="slw-prog p1" display="none"><rect width="66" height="50" fill="#0e1626"/>' + pixelPet(o.pet, 13, 7, 5) + '</g>' +
        '<g class="slw-prog p2" display="none"><rect width="66" height="50" fill="#0e1626"/>' + eqBars(6, 44, 8.4, 6, [20, 32, 26, 38, 22, 30, 16], ['#22e4ff', '#ff2e9a', '#8a5cff', '#c6ff3d']) + '</g>' +
        '<g class="slw-prog p3" display="none">' + starField(66, 50) + '</g></g>';
    }
    return shadow(50, 136, 26) +
      '<rect x="30" y="124" width="40" height="12" rx="2" fill="#8c8798" ' + SW2 + '/>' + stripeBand(34, 66, 130, o.v, o.acc) +
      '<path d="M36 124 L41 70 M64 124 L59 70" stroke="#5a5f72" stroke-width="5" stroke-linecap="round"/>' +
      '<path d="M38 112 L61 92 M62 112 L39 92 M40 90 L60 74 M60 90 L40 74" stroke="#7c8194" stroke-width="2"/>' +
      '<path d="M' + lx + ' 124 V72 M' + (lx + 6) + ' 124 V72 ' + rungs + '" stroke="#2a2d3a" stroke-width="1.8"/>' +
      '<rect x="12" y="10" width="76" height="60" rx="4" fill="#2e2b3a" ' + SW + '/>' +
      '<svg x="17" y="15" width="66" height="50" viewBox="0 0 66 50" overflow="hidden">' + screen + '</svg>' +
      '<rect class="slw-neon" color="' + o.acc + '" x="14.5" y="12.5" width="71" height="55" rx="3" fill="none" stroke="' + o.acc + '" stroke-width="1.4"/>' +
      '<circle class="slw-neon" color="#ff2e9a" cx="50" cy="6" r="3.6" fill="#ff2e9a" stroke="' + INK + '" stroke-width="1.2"/>';
  }

  /* Recording Studio (2×1): graphite block, foam studs, porthole mic, VU column,
     ON AIR lightbox (steady) and giant headphones over the roof */
  function bldRecording(o) {
    var studs = '';
    for (var r = 0; r < 3; r++) for (var c = 0; c < 4; c++) studs += '<rect x="' + (26 + c * 12) + '" y="' + (78 + r * 16) + '" width="9" height="12" rx="1" fill="#2a2d3a"/><path d="M' + (26 + c * 12) + ' ' + (78 + r * 16) + ' l9 12" stroke="#7c8194" stroke-width="1" opacity="0.5"/>';
    var body = '<path d="M36 70 Q100 -20 164 70" fill="none" stroke="#5a5f72" stroke-width="9" stroke-linecap="round"/><path d="M36 70 Q100 -20 164 70" fill="none" stroke="#7c8194" stroke-width="3" stroke-linecap="round"/>' +
      '<rect x="14" y="64" width="172" height="72" rx="4" fill="#2e2b3a" ' + SW + '/>' + stripeBand(20, 180, 131, o.v, o.acc) +
      '<rect x="22" y="74" width="52" height="52" rx="2" fill="#3a3646" ' + SW2 + '/>' + studs +
      porthole(96, 96, 15) + '<rect x="93" y="86" width="6" height="13" rx="3" fill="#e6e9f2"/><path d="M96 99 v8 M91 107 h10" stroke="#e6e9f2" stroke-width="2" stroke-linecap="round"/>' +
      eqBars(118, 128, 7, 5, [14, 22, 30, 18, 10], ['#c6ff3d', '#22e4ff', '#8a5cff', '#ff2e9a', '#ffb23e']) +
      '<rect x="160" y="96" width="20" height="40" rx="2" fill="#3a3646" ' + SW2 + '/><rect x="174" y="112" width="3" height="10" rx="1.5" fill="#e6e9f2"/>' +
      [22, 154].map(function (x) { return '<rect x="' + x + '" y="50" width="24" height="36" rx="9" fill="#5a5f72" ' + SW2 + '/><rect class="slw-neon" color="#8a5cff" x="' + (x + 4) + '" y="54" width="16" height="28" rx="6" fill="none" stroke="#8a5cff" stroke-width="2.5"/>'; }).join('');
    var bx = o.flip ? 48 : 112;
    return shadow(100, 137, 94) + (o.flip ? mirror(200, body) : body) +
      '<g class="slw-onair" opacity="0.55"><rect x="' + bx + '" y="70" width="40" height="16" rx="3" fill="#43294f" ' + SW2 + '/>' + signText(bx + 20, 81.5, 7.5, 'ON AIR', '#ff5a6a') + '</g>';
  }

  /* Dance Studio (2×2): concrete ground floor with a full smoked-glass front, a mirror
     wall and an LED floor; set-back upper level with 5 accent fins, sign and speakers */
  function bldDance(o) {
    var tiles = '', xb = [42, 80, 120, 158], xm = [38, 79, 121, 162], xf = [33, 77.5, 122.5, 167];
    var tc = ['#8a5cff', '#ff2e9a', '#22e4ff', '#c6ff3d', '#8a5cff', '#ff2e9a'];
    for (var i = 0; i < 3; i++) {
      tiles += '<path d="M' + xb[i] + ' 176 L' + xb[i + 1] + ' 176 L' + xm[i + 1] + ' 186 L' + xm[i] + ' 186 Z" fill="' + tc[i] + '" stroke="#14101f" stroke-width="1"/>';
      tiles += '<path d="M' + xm[i] + ' 186 L' + xm[i + 1] + ' 186 L' + xf[i + 1] + ' 198 L' + xf[i] + ' 198 Z" fill="' + tc[i + 3] + '" stroke="#14101f" stroke-width="1"/>';
    }
    var fins = '';
    for (var f = 0; f < 5; f++) fins += '<rect x="' + (50 + f * 22) + '" y="76" width="8" height="34" rx="1.5" fill="' + o.acc + '" ' + SW2 + '/>';
    var body = '<rect x="182" y="150" width="16" height="28" rx="2" fill="#2e2b3a" ' + SW2 + '/><rect x="182" y="180" width="16" height="28" rx="2" fill="#2e2b3a" ' + SW2 + '/>' +
      '<circle cx="190" cy="164" r="5" fill="#5a5f72"/><circle cx="190" cy="194" r="5" fill="#5a5f72"/><circle cx="190" cy="164" r="2" fill="#2a2d3a"/><circle cx="190" cy="194" r="2" fill="#2a2d3a"/>' +
      '<rect x="40" y="72" width="120" height="40" rx="3" fill="#c9c5d3" ' + SW + '/>' + fins +
      '<rect x="18" y="110" width="164" height="98" rx="4" fill="#8c8798" ' + SW + '/>' +
      '<rect class="slw-win" x="28" y="120" width="144" height="80" rx="2" fill="#1b2438" ' + SW2 + '/>' +
      '<rect x="34" y="126" width="132" height="30" fill="#dde3f0" opacity="0.22"/><path d="M50 156 L70 126 M110 156 L130 126" stroke="#fff" stroke-width="4" opacity="0.2"/>' +
      '<g class="slw-floor">' + tiles + '</g>' +
      '<path d="M76 120 V200 M124 120 V200" stroke="#5a5f72" stroke-width="3"/><rect x="86" y="150" width="28" height="50" fill="none" stroke="#5a5f72" stroke-width="2.5"/><rect x="107" y="168" width="3.4" height="13" rx="1.7" fill="#e6e9f2"/>' +
      '<path d="M36 196 L60 122" stroke="#fff" stroke-width="6" opacity="0.14" stroke-linecap="round"/>' + stripeBand(22, 178, 204, o.v, o.acc) +
      '<rect x="80" y="206" width="40" height="6" rx="3" fill="#c9c5d3" ' + SW2 + '/>';
    var sx = o.flip ? 48 : 92, sign;
    if (o.v === 2) {
      sign = '<rect x="' + sx + '" y="52" width="60" height="20" rx="3" fill="#2e2b3a" ' + SW2 + '/>' +
        neon('M' + (sx + 22) + ' 66 L' + (sx + 22) + ' 59 Q' + (sx + 30) + ' 58 ' + (sx + 33) + ' 62 L' + (sx + 44) + ' 63 Q' + (sx + 47) + ' 66 ' + (sx + 44) + ' 66 Z M' + (sx + 8) + ' 58 h9 M' + (sx + 6) + ' 62 h10 M' + (sx + 8) + ' 66 h9', o.acc, 1.4);
    } else {
      sign = '<rect x="' + sx + '" y="52" width="60" height="20" rx="3" fill="#2e2b3a" ' + SW2 + '/>' +
        '<rect class="slw-neon" color="' + o.acc + '" x="' + (sx + 2.5) + '" y="54.5" width="55" height="15" rx="2" fill="none" stroke="' + o.acc + '" stroke-width="1.4"/>' + signText(sx + 30, 66, 9.5, 'DANCE', '#f4f2fa');
    }
    return shadow(100, 214, 94) + (o.flip ? mirror(200, body) : body) + sign;
  }

  /* Rooftop Hangout (2×2): brick warehouse, smoked windows, roller door, outside stair;
     roof deck with glass balustrade, beanbags, Edison bulbs, telescope and a potted palm */
  function bldRooftop(o) {
    var bulbs = '', mortar = '';
    for (var i = 0; i < 9; i++) {
      var t = i / 8, x = (1 - t) * (1 - t) * 38 + 2 * (1 - t) * t * 92 + t * t * 146, y = (1 - t) * (1 - t) * 48 + 2 * (1 - t) * t * 64 + t * t * 48;
      bulbs += '<circle class="slw-twinkle" style="animation-delay:' + (i * 0.2).toFixed(1) + 's" cx="' + n1(x) + '" cy="' + n1(y + 3.5) + '" r="3" fill="#ffb23e" stroke="' + INK + '" stroke-width="1"/>';
    }
    for (var r = 0; r < 6; r++) mortar += 'M' + (40 + (r % 2) * 14) + ' ' + (104 + r * 17) + ' h12 M' + (104 + (r % 2) * 12) + ' ' + (110 + r * 16) + ' h12 ';
    var art = shadow(100, 214, 94) +
      '<path d="M38 92 V46 M146 92 V46" stroke="#5a5f72" stroke-width="3"/>' +
      '<g class="slw-bean" style="transform-box:fill-box;transform-origin:50% 100%"><path d="M46 90 Q44 68 58 68 Q72 68 70 90 Z" fill="' + o.acc + '" ' + SW2 + '/><path d="M76 90 Q76 72 88 72 Q100 72 98 90 Z" fill="#8a5cff" ' + SW2 + '/></g>' +
      '<path d="M128 90 L134 70 L140 90 M134 70 V90" stroke="#5a5f72" stroke-width="2"/><g transform="rotate(-24 134 66)"><rect x="122" y="62" width="28" height="8" rx="3" fill="#7c8194" ' + SW2 + '/><circle cx="150" cy="66" r="3" fill="#1b2438"/></g>' +
      '<path d="M110 80 Q108 70 112 62" fill="none" stroke="#9a6a4a" stroke-width="2.5"/><path d="M112 62 Q100 58 94 66 M112 62 Q122 56 128 64 M112 62 Q106 52 98 54 M112 62 Q118 50 126 52" fill="none" stroke="#2f7d57" stroke-width="3.5" stroke-linecap="round"/>' +
      '<path d="M112 62 Q103 60 98 64 M112 62 Q120 59 124 62" fill="none" stroke="#57b07a" stroke-width="1.8" stroke-linecap="round"/><rect x="104" y="80" width="13" height="10" rx="2" fill="#8c8798" ' + SW2 + '/>' +
      '<path d="M38 48 Q92 64 146 48" fill="none" stroke="#2a2d3a" stroke-width="1.5"/>' + bulbs +
      '<rect x="30" y="76" width="124" height="14" fill="#1b2438" fill-opacity="0.55" stroke="#5a5f72" stroke-width="2"/><path d="M30 76 H154" stroke="#e6e9f2" stroke-width="2"/>' +
      '<rect x="30" y="88" width="124" height="10" fill="#9a6a4a" ' + SW2 + '/><path d="M42 89 v8 M54 89 v8 M66 89 v8 M78 89 v8 M90 89 v8 M102 89 v8 M114 89 v8 M126 89 v8 M138 89 v8" stroke="#b07e58" stroke-width="2"/>' + stripeBand(34, 150, 93, o.v, o.acc) +
      '<rect x="34" y="98" width="116" height="110" rx="3" fill="#b4675a" ' + SW + '/><path d="' + mortar + '" stroke="#93524a" stroke-width="2" opacity="0.45"/>' +
      glass(46, 108, 22, 36, 1, 2) + glass(81, 108, 22, 36, 1, 2) + glass(116, 108, 22, 36, 1, 2) + glass(44, 158, 26, 38, 1, 2) + glass(126, 158, 16, 38, 1, 2) +
      '<rect x="84" y="156" width="32" height="52" rx="2" fill="#7c8194" ' + SW + '/><path d="M86 163 h28 M86 170 h28 M86 177 h28 M86 184 h28 M86 191 h28 M86 198 h28" stroke="#5a5f72" stroke-width="2"/><rect x="95" y="201" width="10" height="3" rx="1.5" fill="#e6e9f2"/>' +
      '<path d="M190 206 L158 170 L166 170 L190 136 L182 136 L154 98" fill="none" stroke="#5a5f72" stroke-width="3" stroke-linejoin="round"/>' +
      '<path d="M176 194 h10 M168 185 h10 M160 176 h10 M170 158 h10 M178 147 h10 M170 125 h10 M162 113 h10 M156 104 h10" stroke="#7c8194" stroke-width="2.5" stroke-linecap="round"/>' +
      '<rect x="80" y="206" width="40" height="6" rx="3" fill="#c9c5d3" ' + SW2 + '/>';
    return o.flip ? mirror(200, art) : art;
  }

  /* Concert Stage (3×2): box-truss arch with 4 moving heads, an LED wall (✦ and the
     child's name, or ENCORE), speaker stacks and an asphalt deck with an LED edge */
  function bldStage(o) {
    var lattice = '', feet = '', heads = '';
    for (var x = 24; x < 276; x += 12) lattice += 'M' + x + ' 34 L' + (x + 6) + ' 22 L' + (x + 12) + ' 34 ';
    [24, 264].forEach(function (lx) { for (var y = 196; y > 34; y -= 12) lattice += 'M' + lx + ' ' + y + ' L' + (lx + 12) + ' ' + (y - 6) + ' L' + lx + ' ' + (y - 12) + ' '; });
    for (var i = 0; i < 8; i++) feet += '<rect x="' + n1(42 + i * 31 - 4) + '" y="155" width="8" height="5" rx="1" fill="#2a2d3a"/><circle cx="' + n1(42 + i * 31) + '" cy="157" r="3" fill="#ffd08a"/>';
    [80, 128, 172, 220].forEach(function (hx) { heads += '<path d="M' + (hx - 6) + ' 34 v5 h12 v-5" fill="none" stroke="#5a5f72" stroke-width="2"/><rect x="' + (hx - 5) + '" y="38" width="10" height="10" rx="2" fill="#2e2b3a" ' + SW2 + '/><circle cx="' + hx + '" cy="48" r="2.5" fill="#f4f2fa"/>'; });
    var eqX = o.flip ? 202 : 68;
    return shadow(150, 206, 140) +
      '<g class="slw-beam" opacity="0"><path d="M76 48 L84 48 L140 168 L56 168 Z" fill="#8a5cff" fill-opacity="0.18"/><path d="M216 48 L224 48 L244 168 L160 168 Z" fill="#22e4ff" fill-opacity="0.18"/></g>' +
      '<rect x="54" y="50" width="192" height="86" rx="4" fill="#2e2b3a" ' + SW + '/>' +
      '<svg x="60" y="56" width="180" height="74" viewBox="0 0 180 74" overflow="hidden"><rect width="180" height="74" fill="#0e1626"/>' +
      eqBars(eqX - 60, 70, 8, 5, [16, 26, 20, 30], ['#22e4ff', '#c6ff3d', '#ff2e9a', '#8a5cff']) + '</svg>' +
      neonStar(150, 82, 20, o.acc) + signText(150, 122, o.name.length > 7 ? 10 : 13, o.name || 'ENCORE', '#f4f2fa') +
      '<path d="' + lattice + '" fill="none" stroke="#7c8194" stroke-width="1.5"/>' +
      '<path d="M24 196 V22 M36 196 V34 M264 196 V34 M276 196 V22 M24 22 H276 M36 34 H264" fill="none" stroke="#5a5f72" stroke-width="3" stroke-linecap="round"/>' + heads +
      [32, 244].map(function (sx) { return '<rect x="' + sx + '" y="112" width="24" height="26" rx="2" fill="#2e2b3a" ' + SW2 + '/><rect x="' + sx + '" y="138" width="24" height="16" rx="2" fill="#2e2b3a" ' + SW2 + '/><circle cx="' + (sx + 12) + '" cy="125" r="7" fill="#5a5f72"/><circle cx="' + (sx + 12) + '" cy="125" r="2.5" fill="#2a2d3a"/><circle cx="' + (sx + 12) + '" cy="146" r="4" fill="#5a5f72"/>'; }).join('') +
      '<path d="M28 150 L272 150 L282 166 L18 166 Z" fill="#3a3646" ' + SW2 + '/>' + feet +
      '<rect x="18" y="166" width="264" height="30" rx="2" fill="#2e2b3a" ' + SW + '/>' + stripeBand(28, 272, 186, o.v, o.acc) + neon('M20 166 L280 166', '#22e4ff', 2) +
      '<rect x="130" y="196" width="40" height="8" rx="2" fill="#3a3646" ' + SW2 + '/>';
  }

  var BUILDINGS = {
    bld_photobooth: { w: 100, h: 170, draw: bldPhotobooth },
    bld_boba: { w: 200, h: 170, draw: bldBoba },
    bld_ledtower: { w: 100, h: 170, draw: bldLedtower },
    bld_recording: { w: 200, h: 170, draw: bldRecording },
    bld_dance: { w: 200, h: 250, draw: bldDance },
    bld_rooftop: { w: 200, h: 250, draw: bldRooftop },
    bld_stage: { w: 300, h: 230, draw: bldStage }
  };
  function building(id, st, iconMode) {
    var b = BUILDINGS[id];
    return b ? { w: b.w, h: b.h, svg: svg(b.w, b.h, b.draw(bldOpts(st, iconMode))) } : null;
  }

  /* v2 streetwear accessories in the pet's frame (head centre 88,42 r 20); fixed
     strings so the same item always draws the same way */
  var ACC2D = {
    beanie: '<path d="M69 30 Q68 7 89 6 Q109 7 108 30 Z" fill="#c9c5d3" ' + SW2 + '/>' +
      '<path d="M76 11 L75 29 M82 8 L81.5 29 M88 7 V29 M94 8 L94.5 29 M100 11 L101 29" stroke="#2e2b3a" stroke-width="1.6" opacity="0.5"/>' +
      '<rect x="67" y="25" width="43" height="9" rx="4.5" fill="#2e2b3a" ' + SW2 + '/><path d="M73 27 v5 M79 27 v5 M85 27 v5 M91 27 v5" stroke="#5a5f72" stroke-width="1.4"/>' +
      '<rect x="99" y="26.5" width="6" height="6" rx="1" fill="#c6ff3d"/>',
    bunnyTips: '<path d="M74 13 Q80 8 86 12 M87 10 Q93 6 99 11" fill="none" stroke="#2e2b3a" stroke-width="2.5" stroke-linecap="round"/>',
    cap: '<path d="M72 23 L54 25 Q52 27 54 29 L72 28 Z" fill="#2e2b3a" ' + SW2 + '/>' +
      '<path class="slw-neon" color="#ff2e9a" d="M56 29.6 L71 29.1" fill="none" stroke="#ff2e9a" stroke-width="1.8" stroke-linecap="round"/>' +
      '<path d="M70 26 Q71 8 89 7 Q107 8 107 26 Z" fill="#2e2b3a" ' + SW2 + '/><path d="M89 8 V25 M78 11 Q80 18 79 25" fill="none" stroke="#5a5f72" stroke-width="1.4"/>' +
      '<path d="M94 26 Q98 19 102 26 Z" fill="#14101f"/><circle cx="89" cy="7.5" r="2" fill="#5a5f72"/>',
    headphones: '<path d="M74 58 Q86 69 102 60" fill="none" stroke="#2e2b3a" stroke-width="4.5" stroke-linecap="round"/>' +
      '<ellipse cx="73" cy="57" rx="5" ry="6.5" fill="#5a5f72" ' + SW2 + '/><ellipse cx="102" cy="59" rx="5.5" ry="7" fill="#5a5f72" ' + SW2 + '/>' +
      '<g class="slw-neon" color="#22e4ff" fill="none" stroke="#22e4ff" stroke-width="1.6"><ellipse cx="73" cy="57" rx="2.6" ry="3.8"/><ellipse cx="102" cy="59" rx="3" ry="4.2"/></g>',
    visor: '<path d="M81 38 Q74 39 69 42" fill="none" stroke="#2e2b3a" stroke-width="3" stroke-linecap="round"/>' +
      '<path d="M80 36 Q95 30 110 35 L109 42 Q95 38 81 43 Z" fill="#1b2438" ' + SW2 + '/>' +
      '<path class="slw-neon" color="#22e4ff" d="M84 39 Q95 35 106 38" fill="none" stroke="#22e4ff" stroke-width="1.4" stroke-linecap="round"/><circle cx="98" cy="36.6" r="1.6" fill="#f4f2fa"/>',
    hoodieShell: '<path d="M27 66 Q26 44 56 43 Q80 43 87 56 L86 70 Q60 75 30 72 Z" fill="#2e2b3a" ' + SW2 + '/><path d="M44 66 Q56 70 68 66" fill="none" stroke="#3a3646" stroke-width="2"/>',
    hood: '<path d="M70 56 Q60 44 66 30 Q72 24 78 26 Q70 38 78 56 Z" fill="#2e2b3a" ' + SW2 + '/>',
    drawstrings: '<path d="M84 60 L83 72 M90 61 L90 73" stroke="#ff2e9a" stroke-width="2" stroke-linecap="round"/><circle cx="83" cy="73" r="1.7" fill="#ff2e9a"/><circle cx="90" cy="74" r="1.7" fill="#ff2e9a"/>'
  };
  var ACC_SLOT = { acc_partyhat: 'hat', acc_crown: 'hat', acc_bow: 'neck', acc_scarf: 'neck', acc_shades: 'face', acc_cape: 'back',
    acc_beanie: 'hat', acc_cap: 'hat', acc_headphones: 'neck', acc_visor: 'face', acc_hoodie: 'back' };

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
    if (acc.back === 'acc_hoodie') out += ACC2D.hoodieShell;
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
    if (acc.back === 'acc_hoodie') out += ACC2D.hood;
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
    /* v2 streetwear (each line runs only for its own new id) */
    if (acc.back === 'acc_hoodie') out += ACC2D.drawstrings;
    if (acc.neck === 'acc_headphones') out += ACC2D.headphones;
    if (acc.face === 'acc_visor') out += ACC2D.visor;
    if (acc.hat === 'acc_beanie') out += ACC2D.beanie + (id === 'pet_bunny' ? ACC2D.bunnyTips : '');
    if (acc.hat === 'acc_cap') out += ACC2D.cap;
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
    var bld = building(id, st, false);
    if (bld) return bld;
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
    if (id === 'door_glass') {
      return svg(100, 100, '<rect x="30" y="20" width="40" height="70" rx="3" fill="#5a5f72" ' + SW + '/><rect x="35" y="25" width="30" height="60" rx="2" fill="' + DOOR.door_glass + '"/>' +
        '<path d="M40 52 L52 32 M42 62 L58 36" stroke="#8fb7ff" stroke-width="2.5" stroke-linecap="round" opacity="0.75"/><rect x="58" y="48" width="4" height="16" rx="2" fill="#e6e9f2"/>');
    }
    if (/^door_/.test(id)) return svg(100, 100, '<path d="M32 88 L32 34 Q50 14 68 34 L68 88 Z" fill="' + (DOOR[id] || '#888') + '" ' + SW + '/><circle cx="60" cy="62" r="4" fill="#ffd23f"/>');
    /* a shape previews with the default colours; roofs and details preview on the
       child's own shape (st.shape), trim 0, so no icon is personal beyond the colour */
    if (/^shape_/.test(id)) return svg(200, 250, house({ shape: id, wall: 'wall_cream', roof: 'roof_red', door: 'door_blue' }), ' preserveAspectRatio="xMidYMid meet"');
    if (/^roof_/.test(id) || /^detail_/.test(id)) {
      var sel = { wall: 'wall_cream', door: 'door_blue', roof: /^roof_/.test(id) ? id : 'roof_red', details: {}, shape: st.shape, member: st.member };
      if (/^detail_/.test(id)) sel.details[id] = true;
      return svg(200, 250, house(sel), ' preserveAspectRatio="xMidYMid meet"');
    }
    if (/^pet_/.test(id)) return pet(id, {});
    if (/^acc_/.test(id)) {
      var a = {}; a[ACC_SLOT[id] || 'hat'] = id; return pet('pet_puppy', { acc: a });
    }
    if (BUILDINGS[id]) return building(id, st, true).svg;
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

  /* ---------------- UI chrome icons ----------------
     An original line set on a 24 grid: 2px round strokes in currentColor, no fills,
     so a button's text colour (and .slw-ico in the CSS) styles them. Callers give
     the button its own label; the icon is aria-hidden. Unknown names return ''. */
  var UI_ICONS = {
    shop: '<path d="M5 8h14l-1.3 11.2a2 2 0 0 1-2 1.8H8.3a2 2 0 0 1-2-1.8z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>',
    crew: '<path d="M8.6 19.5c-2.3 0-3.6-1.5-3-3.3.7-2.1 3.4-4.4 6.4-4.4s5.7 2.3 6.4 4.4c.6 1.8-.7 3.3-3 3.3-1.3 0-2.1-.6-3.4-.6s-2.1.6-3.4.6z"/><circle cx="5.5" cy="10" r="1.6"/><circle cx="9.5" cy="6.2" r="1.6"/><circle cx="14.5" cy="6.2" r="1.6"/><circle cx="18.5" cy="10" r="1.6"/>',
    games: '<path d="M7.5 8h9a4.5 4.5 0 0 1 4.5 4.5v.5a3.5 3.5 0 0 1-6.3 2.1L14 14h-4l-.7 1.1A3.5 3.5 0 0 1 3 13v-.5A4.5 4.5 0 0 1 7.5 8z"/><path d="M7.5 10.2v3.6M5.7 12h3.6"/><path d="M15.5 11h.01M17.5 13h.01"/>',
    edit: '<path d="M4 20l1.2-4.4L15.8 5a2 2 0 0 1 2.9 0l.3.3a2 2 0 0 1 0 2.9L8.4 18.8z"/><path d="M14 7l3 3"/>',
    home: '<path d="M3.5 11.5L12 4l8.5 7.5"/><path d="M6 10v10h12V10"/><path d="M10 20v-5.5h4V20"/>',
    goal: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><path d="M12 12h.01"/>',
    storage: '<path d="M4 8l8-4 8 4v8.5l-8 4-8-4z"/><path d="M4 8l8 4 8-4M12 12v8.5"/>',
    city: '<path d="M3 21h18"/><path d="M5 21v-9h4.5v9"/><path d="M9.5 21V4h6v17"/><path d="M15.5 21v-7H19v7"/><path d="M12 8h1.5M12 12h1.5M12 16h1.5"/>',
    showtime: '<path d="M18.5 15.2A7.6 7.6 0 1 1 8.8 5.5a6.2 6.2 0 0 0 9.7 9.7z"/><path d="M17.5 2.8l.9 2.3 2.3.9-2.3.9-.9 2.3-.9-2.3-2.3-.9 2.3-.9z"/>',
    golden: '<path d="M2.5 17.5h19"/><path d="M7 17.5a5 5 0 0 1 10 0"/><path d="M12 7.5v2.2M5.6 11.1l1.5 1.5M18.4 11.1l-1.5 1.5M3.5 14.6h1.8M18.7 14.6h1.8"/><path d="M7.5 20.5h9"/>',
    music: '<path d="M9 18V5.5l11-2.2V16"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    rotL: '<path d="M4.5 4.5v5h5"/><path d="M4.8 9.5A7.5 7.5 0 1 1 5.2 15.6"/>',
    rotR: '<path d="M19.5 4.5v5h-5"/><path d="M19.2 9.5A7.5 7.5 0 1 0 18.8 15.6"/>',
    zoomIn: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.3 15.3L20.5 20.5"/><path d="M8 10.5h5M10.5 8v5"/>',
    zoomOut: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.3 15.3L20.5 20.5"/><path d="M8 10.5h5"/>',
    reset: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/><circle cx="12" cy="12" r="2.5"/>'
  };
  function uiIcon(name) {
    if (!Object.prototype.hasOwnProperty.call(UI_ICONS, name)) return '';
    return '<svg class="slw-ico" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + UI_ICONS[name] + '</svg>';
  }

  root.SLWorldArt = { CH: CH, defs: defs, island: island, sprite: sprite, pet: pet, icon: icon, petDataUrl: petDataUrl, KARTS: KARTS, BALLS: BALLS, STADIA: STADIA, THEME: THEME, PETCOL: PETCOL,
    uiIcon: uiIcon, UI_ICON_NAMES: Object.keys(UI_ICONS), SHAPES: SHAPES, BUILDINGS: Object.keys(BUILDINGS) };
}(typeof self !== 'undefined' ? self : this));
