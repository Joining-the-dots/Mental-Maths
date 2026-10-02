/* ================================================================
   Neon Grand Prix 3D — the kit adapter (ES module; THREE is passed in,
   so this file never imports 'three' itself and Node can import it).

   makeKit(THREE, SL3D, tier) → kit
     Uses the island's shared kit K (SL3D.kit(tier)) when it exists, so the
     game shares the island's compiled toon / matcap / billboard programs
     and materials; otherwise a LITE kit with the same surface built from
     plain THREE (contract §1: the game must work without SLIsland3D).
     kit.G      geometry: puff bean slab box roundBox gem circle tube cone ring torusArc lathe plane disc star
                + t(geo, {p, r°, s}), paint(geo, hex|Color), paintBy(geo, fn), merge(list),
                fin(geo). Every geometry is non-indexed with position/normal/color.
     kit.mat(key)      'toon' | 'gold' | 'chrome' | 'pearl' | 'state' | 'blob'  (shared)
     kit.neon(hex)     unlit, not tone mapped (shared per colour)
     kit.additive(o)   an OWN additive basic material (vertexColors), disposed with the kit
     kit.own(material|texture|geometry) → it (tracked for dispose)
     kit.color(hex)    a cached THREE.Color (never mutate it)
     kit.tex           {halo(), sparkles(), blob(), matcap(name)}
     kit.ATLAS         sparkle-atlas cell indices (K.ATLAS)
     kit.billboards(o) camera-facing quad pool {mesh, alloc, free, set, tint, alpha, commit, clear, dispose}
     kit.blobs(n)      blob-shadow pool {mesh, alloc, free, set, commit, clear, dispose}
     kit.release(x)    dispose one pool / own material early (a dropped track)
     kit.setRim(hex, s) the shared toon rim (island kit only; the island's rim is restored on dispose)
     kit.dispose()     frees everything the GAME made (never the island's shared kit)
   ================================================================ */

const KEEP = { position: 1, normal: 1, color: 1 };
const ATLAS = { sparkle: 0, heart: 1, note: 2, star: 3, dot: 4, ring: 5, rect: 6, petal: 7, snow: 8, bubble: 9, puff: 10, circle: 11, curl: 12, diamond: 13, plus: 14, tri: 15 };
const DEG = Math.PI / 180;

export function makeKit(THREE, SL3D, tier) {
  const K = SL3D && typeof SL3D.kit === 'function' ? safe(() => SL3D.kit(tier)) : null;
  const low = tier === 'LOW';
  const owned = new Set(), pools = new Set(), colors = new Map(), neons = new Map(), liteMats = new Map(), liteTex = {};
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
  const RoundedBox = SL3D && SL3D.addons && SL3D.addons.RoundedBoxGeometry ? SL3D.addons.RoundedBoxGeometry : null;

  function safe(fn) { try { return fn(); } catch (e) { return null; } }
  function own(x) { if (x) owned.add(x); return x; }
  function color(hex) {
    if (hex && hex.isColor) return hex;
    let c = colors.get(hex);
    if (!c) { c = new THREE.Color(hex || '#CFC8DC'); colors.set(hex, c); }
    return c;
  }

  /* ---------------- geometry ---------------- */
  function ensureColor(geo) {
    let a = geo.getAttribute('color');
    if (a && a.itemSize === 3) return a;
    if (a) geo.deleteAttribute('color');
    a = new THREE.BufferAttribute(new Float32Array(geo.getAttribute('position').count * 3).fill(1), 3);
    geo.setAttribute('color', a);
    return a;
  }
  function fin(geo) {
    Object.keys(geo.attributes).forEach((n) => { if (!KEEP[n]) geo.deleteAttribute(n); });
    geo.morphAttributes = {};
    if (geo.index) { const g2 = geo.toNonIndexed(); geo.dispose(); geo = g2; }
    geo.clearGroups();
    if (!geo.getAttribute('normal')) geo.computeVertexNormals();
    ensureColor(geo);
    return geo;
  }
  function seg(n) { return low ? Math.max(3, Math.round(n * 0.7)) : n; }
  const G = {
    fin,
    puff: (r, sphere) => fin(sphere ? new THREE.SphereGeometry(r, seg(12), seg(8)) : new THREE.IcosahedronGeometry(r, 1)),
    bean: (r, len) => fin(new THREE.CapsuleGeometry(r, len, low ? 2 : 3, low ? 8 : 10)),
    slab: (w, h, d, radius) => {
      const m = Math.min(w, h, d), rad = radius != null ? Math.min(radius, m * 0.49) : 0.18 * m;
      if (K && K.G && K.G.slab) return K.G.slab(w, h, d, rad);
      return fin(RoundedBox && rad > 0 ? new RoundedBox(w, h, d, low ? 1 : 2, rad) : new THREE.BoxGeometry(w, h, d));
    },
    box: (w, h, d) => fin(new THREE.BoxGeometry(w, h, d)),
    /* a lightly rounded box with ONE bevel segment (~108 tris) for things seen many times */
    roundBox: (w, h, d, radius) => {
      const m = Math.min(w, h, d), rad = Math.min(radius != null ? radius : 0.18 * m, m * 0.49);
      return fin(RoundedBox && rad > 0 && !low ? new RoundedBox(w, h, d, 1, rad) : new THREE.BoxGeometry(w, h, d));
    },
    /* a 20-triangle puff for small round bits (eyes' glints, paws, coconuts, dots) */
    gem: (r) => fin(new THREE.IcosahedronGeometry(r, 0)),
    /* a flat disc facing +z (eyes, blush, discs) */
    circle: (r, segs) => fin(new THREE.CircleGeometry(r, segs || 8)),
    tube: (rt, rb, h, radial, open) => fin(new THREE.CylinderGeometry(rt, rb, h, seg(radial || 12), 1, !!open)),
    cone: (r, h, radial) => fin(new THREE.ConeGeometry(r, h, seg(radial || 12))),
    ring: (R, r, rs, ts) => fin(new THREE.TorusGeometry(R, r, seg(rs || 6), seg(ts || 16))),
    torusArc: (R, r, arcRad, rs, ts) => fin(new THREE.TorusGeometry(R, r, seg(rs || 6), seg(ts || 24), arcRad)),
    lathe: (pts, segs) => fin(new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(Math.max(0, p[0]), p[1])), seg(segs || 12))),
    plane: (w, d) => fin(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2)),
    disc: (r, segs) => fin(new THREE.CircleGeometry(r, seg(segs || 16)).rotateX(-Math.PI / 2)),
    star: (ro, ri, depth) => {
      const sh = new THREE.Shape();
      ri = ri || ro * 0.5;
      for (let i = 0; i < 10; i++) {
        const a = Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? ri : ro;
        if (i) sh.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else sh.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      const dp = depth || 0.25 * ro, g = new THREE.ExtrudeGeometry(sh, { depth: dp, bevelEnabled: false, curveSegments: 1, steps: 1 });
      g.translate(0, 0, -dp / 2);
      return fin(g);
    },
    /* scale, rotate (degrees, XYZ), translate — in place */
    t: (geo, o) => {
      if (!o) return geo;
      const s = o.s == null ? 1 : o.s;
      if (typeof s === 'number') _s.set(s, s, s); else _s.set(s[0], s[1], s[2]);
      const r = o.r || [0, 0, 0];
      _e.set((r[0] || 0) * DEG, (r[1] || 0) * DEG, (r[2] || 0) * DEG, 'XYZ');
      _q.setFromEuler(_e);
      const p = o.p || [0, 0, 0];
      _p.set(p[0] || 0, p[1] || 0, p[2] || 0);
      _m.compose(_p, _q, _s);
      geo.applyMatrix4(_m);
      if (_s.x * _s.y * _s.z < 0) flipWinding(geo);
      return geo;
    },
    paint: (geo, c) => {
      const col = color(c), a = ensureColor(geo), arr = a.array;
      for (let i = 0; i < arr.length; i += 3) { arr[i] = col.r; arr[i + 1] = col.g; arr[i + 2] = col.b; }
      a.needsUpdate = true;
      return geo;
    },
    /* fn(x, y, z, nx, ny, nz) → hex | Color | null (keep) */
    paintBy: (geo, fn) => {
      const pos = geo.getAttribute('position').array, nrm = geo.getAttribute('normal').array, a = ensureColor(geo), arr = a.array;
      for (let i = 0; i < pos.length; i += 3) {
        const r = fn(pos[i], pos[i + 1], pos[i + 2], nrm[i], nrm[i + 1], nrm[i + 2]);
        if (r == null) continue;
        const c = color(r);
        arr[i] = c.r; arr[i + 1] = c.g; arr[i + 2] = c.b;
      }
      a.needsUpdate = true;
      return geo;
    },
    /* a NEW merged geometry; the inputs are disposed */
    merge: (list) => {
      const geos = [];
      (function flat(l) { if (!l) return; if (Array.isArray(l)) l.forEach(flat); else if (l.isBufferGeometry) geos.push(l); }(list));
      let total = 0;
      for (let i = 0; i < geos.length; i++) {
        if (geos[i].index || !geos[i].getAttribute('normal') || !geos[i].getAttribute('color')) geos[i] = fin(geos[i]);
        total += geos[i].getAttribute('position').count;
      }
      const P = new Float32Array(total * 3), N = new Float32Array(total * 3), C = new Float32Array(total * 3);
      let off = 0;
      for (const g of geos) {
        P.set(g.getAttribute('position').array, off); N.set(g.getAttribute('normal').array, off); C.set(g.getAttribute('color').array, off);
        off += g.getAttribute('position').count * 3;
        g.dispose();
      }
      const out = new THREE.BufferGeometry();
      out.setAttribute('position', new THREE.BufferAttribute(P, 3));
      out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
      out.setAttribute('color', new THREE.BufferAttribute(C, 3));
      out.computeBoundingSphere();
      return out;
    },
    /* a geometry straight from flat arrays (the ribbon) */
    fromArrays: (position, normal, col) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(position, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.computeBoundingSphere();
      return g;
    }
  };
  function flipWinding(geo) {
    ['position', 'normal', 'color'].forEach((n) => {
      const a = geo.getAttribute(n);
      if (!a) return;
      const arr = a.array;
      for (let i = 0; i + 8 < arr.length; i += 9) for (let k = 0; k < 3; k++) { const t = arr[i + 3 + k]; arr[i + 3 + k] = arr[i + 6 + k]; arr[i + 6 + k] = t; }
      a.needsUpdate = true;
    });
  }

  /* ---------------- lite textures ---------------- */
  function canvas(w, h) {
    if (typeof document === 'undefined' || !document.createElement) return null;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  function canvasTex(c) {
    const t = own(new THREE.CanvasTexture(c));
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  function whiteTex() {
    const t = own(new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat));
    t.needsUpdate = true;
    return t;
  }
  function radialTex(size, fn) {
    const c = canvas(size, size), ctx = c && c.getContext('2d');
    if (!ctx || !ctx.createImageData) return whiteTex();
    const img = ctx.createImageData(size, size), d = img.data, h = size / 2;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const r = Math.sqrt((x + 0.5 - h) ** 2 + (y + 0.5 - h) ** 2) / h, o = (y * size + x) * 4;
      d[o] = d[o + 1] = d[o + 2] = 255;
      d[o + 3] = Math.round(Math.max(0, Math.min(1, fn(r))) * 255);
    }
    ctx.putImageData(img, 0, 0);
    return canvasTex(c);
  }
  function liteAtlas() {
    const C = 64, c = canvas(C * 4, C * 4), ctx = c && c.getContext('2d');
    if (!ctx) return whiteTex();
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#fff'; ctx.lineCap = 'round';
    const cell = (i, fn) => { ctx.save(); ctx.translate((i % 4) * C + C / 2, Math.floor(i / 4) * C + C / 2); ctx.beginPath(); fn(); ctx.restore(); };
    const star = (n, ro, ri) => { for (let k = 0; k < n * 2; k++) { const a = -Math.PI / 2 + k * Math.PI / n, r = k % 2 ? ri : ro; if (k) ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); else ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); };
    cell(ATLAS.sparkle, () => { ctx.moveTo(0, -28); ctx.quadraticCurveTo(3, -3, 28, 0); ctx.quadraticCurveTo(3, 3, 0, 28); ctx.quadraticCurveTo(-3, 3, -28, 0); ctx.quadraticCurveTo(-3, -3, 0, -28); ctx.fill(); });
    cell(ATLAS.heart, () => { ctx.moveTo(0, 22); ctx.bezierCurveTo(-30, 2, -22, -24, 0, -10); ctx.bezierCurveTo(22, -24, 30, 2, 0, 22); ctx.fill(); });
    cell(ATLAS.star, () => { star(5, 28, 13); ctx.fill(); });
    cell(ATLAS.dot, () => { const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 28); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.arc(0, 0, 28, 0, 7); ctx.fill(); });
    cell(ATLAS.ring, () => { ctx.lineWidth = 6; ctx.arc(0, 0, 24, 0, 7); ctx.stroke(); });
    cell(ATLAS.rect, () => { ctx.fillRect(-12, -20, 24, 40); });
    cell(ATLAS.puff, () => { [[-10, 4, 14], [8, 6, 13], [0, -8, 15]].forEach((b) => { ctx.moveTo(b[0] + b[2], b[1]); ctx.arc(b[0], b[1], b[2], 0, 7); }); ctx.fill(); });
    cell(ATLAS.circle, () => { ctx.arc(0, 0, 24, 0, 7); ctx.fill(); });
    cell(ATLAS.diamond, () => { ctx.moveTo(0, -26); ctx.lineTo(16, 0); ctx.lineTo(0, 26); ctx.lineTo(-16, 0); ctx.closePath(); ctx.fill(); });
    cell(ATLAS.note, () => { ctx.ellipse(-8, 16, 10, 7.5, -0.4, 0, 7); ctx.fill(); ctx.beginPath(); ctx.lineWidth = 5; ctx.moveTo(1, 14); ctx.lineTo(1, -22); ctx.stroke(); });
    return canvasTex(c);
  }
  function liteMatcap(name) {
    const S = 128, c = canvas(S, S), ctx = c && c.getContext('2d');
    if (!ctx) return whiteTex();
    const stops = name === 'gold' ? ['#FFF6CC', '#FFE89A', '#F0C02F', '#C9921A', '#8A5F10'] : name === 'chrome' ? ['#FFFFFF', '#DDE3F0', '#9AA3B8', '#C7B8FF', '#C7B8FF'] : ['#FFFFFF', '#FFB3E6', '#B3E5FF', '#C9FFE5', '#FFF3B3'];
    const g = ctx.createRadialGradient(S * 0.42, S * 0.38, 2, S / 2, S / 2, S * 0.52);
    stops.forEach((s, i) => g.addColorStop(i / (stops.length - 1), s));
    ctx.fillStyle = stops[stops.length - 1]; ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
    return canvasTex(c);
  }
  const tex = K && K.tex ? {
    halo: () => K.tex.halo(), sparkles: () => K.tex.sparkles(), blob: () => K.tex.blob(), matcap: (n) => K.tex.matcap(n)
  } : {
    halo: () => liteTex.halo || (liteTex.halo = radialTex(64, (r) => (r >= 1 ? 0 : (1 - r) * (1 - r)))),
    sparkles: () => liteTex.sparkles || (liteTex.sparkles = liteAtlas()),
    blob: () => liteTex.blob || (liteTex.blob = radialTex(64, (r) => { const a = Math.max(0, Math.min(1, (1 - r) * 1.6)); return a * a * (3 - 2 * a); })),
    matcap: (n) => liteTex['mc' + n] || (liteTex['mc' + n] = liteMatcap(n))
  };

  /* ---------------- materials ---------------- */
  function liteMat(key) {
    let m = liteMats.get(key);
    if (m) return m;
    if (key === 'toon') {
      const ramp = own(new THREE.DataTexture(new Uint8Array([110, 165, 215, 255]), 4, 1, THREE.RedFormat));
      ramp.minFilter = ramp.magFilter = THREE.NearestFilter; ramp.generateMipmaps = false; ramp.needsUpdate = true;
      m = new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: ramp });
    } else if (key === 'gold' || key === 'chrome' || key === 'pearl') m = new THREE.MeshMatcapMaterial({ matcap: tex.matcap(key) });
    else if (key === 'state') m = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, toneMapped: false });
    else if (key === 'blob') m = new THREE.MeshBasicMaterial({ color: 0x3b2f4a, map: tex.blob(), transparent: true, opacity: 0.22, depthWrite: false });
    else m = new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true });
    liteMats.set(key, own(m));
    return m;
  }
  function mat(key) {
    if (K && typeof K.mat === 'function') { const m = safe(() => K.mat(key)); if (m) return m; }
    return liteMat(key);
  }
  function neon(hex) {
    let m = neons.get(hex);
    if (m) return m;
    if (K && typeof K.variant === 'function') m = safe(() => K.variant('neon:Cloud White', 'k3d' + hex, { color: new THREE.Color(hex) }));
    if (!m) m = own(new THREE.MeshBasicMaterial({ color: new THREE.Color(hex), toneMapped: false }));
    neons.set(hex, m);
    return m;
  }
  /* an additive, unlit, depth-test-only material (cones, sleeves, speed lines, glows) */
  function additive(o) {
    o = o || {};
    return own(new THREE.MeshBasicMaterial({
      color: o.color != null ? new THREE.Color(o.color) : 0xffffff, vertexColors: o.vertexColors !== false,
      transparent: true, opacity: o.opacity != null ? o.opacity : 1, blending: THREE.AdditiveBlending,
      depthWrite: false, toneMapped: false, side: o.side != null ? o.side : THREE.FrontSide, fog: o.fog !== false, map: o.map || null
    }));
  }

  /* ---------------- pools ---------------- */
  const BB_VERT = [
    '#include <common>', '#include <fog_pars_vertex>', 'attribute vec4 aData;', 'uniform float uCells;', 'uniform float uSizeMul;',
    'varying vec2 vUv;', 'varying vec4 vTint;',
    'void main() {',
    '  vec4 mvPosition = modelViewMatrix * vec4(instanceMatrix[3].xyz, 1.0);',
    '  float s = aData.w * uSizeMul; float c = cos(aData.z), sn = sin(aData.z);',
    '  mvPosition.xy += vec2(position.x * c - position.y * sn, position.x * sn + position.y * c) * s;',
    '  gl_Position = projectionMatrix * mvPosition;',
    '  float cx = mod(aData.y, uCells), cy = floor(aData.y / uCells);',
    '  vUv = vec2((uv.x + cx) / uCells, 1.0 - (cy + 1.0 - uv.y) / uCells);',
    '#ifdef USE_INSTANCING_COLOR', '  vTint = vec4(instanceColor, aData.x);', '#else', '  vTint = vec4(1.0, 1.0, 1.0, aData.x);', '#endif',
    '#include <fog_vertex>', '}'
  ].join('\n');
  const BB_FRAG = [
    '#include <common>', '#include <fog_pars_fragment>', 'uniform sampler2D uMap;', 'uniform float uAlphaMul;', 'varying vec2 vUv;', 'varying vec4 vTint;',
    'void main() {', '  vec4 t = texture2D(uMap, vUv);', '  float a = t.a * vTint.a * uAlphaMul;', '  if (a < 0.004) discard;',
    '  gl_FragColor = vec4(t.rgb * vTint.rgb, a);', '  #include <colorspace_fragment>', '  #include <fog_fragment>', '}'
  ].join('\n');
  function liteBillboards(o) {
    const cap = Math.max(1, o.capacity | 0 || 64);
    const map = o.texture === 'halo' ? tex.halo() : tex.sparkles(), cells = o.texture === 'halo' ? 1 : 4;
    const geo = new THREE.PlaneGeometry(1, 1), data = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    data.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aData', data);
    const u = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uMap: { value: null }, uCells: { value: cells }, uSizeMul: { value: 1 }, uAlphaMul: { value: 1 } }]);
    u.uMap.value = map;
    const m = new THREE.ShaderMaterial({ uniforms: u, vertexShader: BB_VERT, fragmentShader: BB_FRAG, transparent: true, depthWrite: false,
      blending: o.additive === false ? THREE.NormalBlending : THREE.AdditiveBlending, fog: o.fog !== false, toneMapped: false });
    const mesh = new THREE.InstancedMesh(geo, m, cap);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false; mesh.count = 0; mesh.renderOrder = o.renderOrder != null ? o.renderOrder : 5;
    const free = [], used = new Uint8Array(cap);
    let hi = 0, dirty = false;
    for (let i = cap - 1; i >= 0; i--) free.push(i);
    const pool = {
      mesh, capacity: cap, uniforms: u,
      alloc() { if (!free.length) return -1; const k = free.pop(); used[k] = 1; if (k + 1 > hi) { hi = k + 1; mesh.count = hi; } return k; },
      free(k) { if (k < 0 || k >= cap || !used[k]) return; used[k] = 0; data.array[k * 4] = 0; data.array[k * 4 + 3] = 0; free.push(k); dirty = true; while (hi > 0 && !used[hi - 1]) hi--; mesh.count = hi; },
      set(k, x, y, z, size, c, alpha, cell, rot) {
        const a = mesh.instanceMatrix.array, b = k * 16, d = data.array, j = k * 4;
        a[b + 12] = x; a[b + 13] = y; a[b + 14] = z;
        d[j] = alpha == null ? 1 : alpha; d[j + 1] = cell || 0; d[j + 2] = rot || 0; d[j + 3] = size;
        if (c) color(c).toArray(mesh.instanceColor.array, k * 3);
        dirty = true;
      },
      tint(k, c) { color(c).toArray(mesh.instanceColor.array, k * 3); dirty = true; },
      alpha(k, al) { data.array[k * 4] = al; dirty = true; },
      commit() { if (!dirty) return; mesh.instanceMatrix.needsUpdate = true; data.needsUpdate = true; mesh.instanceColor.needsUpdate = true; dirty = false; },
      clear() { free.length = 0; for (let k = cap - 1; k >= 0; k--) { free.push(k); used[k] = 0; data.array[k * 4] = 0; data.array[k * 4 + 3] = 0; } hi = 0; mesh.count = 0; dirty = true; },
      dispose() { if (mesh.parent) mesh.parent.remove(mesh); geo.dispose(); m.dispose(); mesh.dispose(); }
    };
    return pool;
  }
  function liteBlobs(capacity) {
    const cap = Math.max(1, capacity | 0 || 16), geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const mesh = new THREE.InstancedMesh(geo, mat('blob'), cap);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false; mesh.count = 0; mesh.renderOrder = 1;
    const free = [], used = new Uint8Array(cap);
    let hi = 0, dirty = false;
    const zero = (k) => { const a = mesh.instanceMatrix.array, b = k * 16; a[b] = 0; a[b + 5] = 1; a[b + 10] = 0; };
    for (let i = cap - 1; i >= 0; i--) { free.push(i); zero(i); }
    return {
      mesh, capacity: cap,
      alloc() { if (!free.length) return -1; const k = free.pop(); used[k] = 1; if (k + 1 > hi) { hi = k + 1; mesh.count = hi; } return k; },
      free(k) { if (k < 0 || k >= cap || !used[k]) return; used[k] = 0; zero(k); free.push(k); dirty = true; while (hi > 0 && !used[hi - 1]) hi--; mesh.count = hi; },
      set(k, x, y, z, sx, sz) { const a = mesh.instanceMatrix.array, b = k * 16; a[b] = sx; a[b + 5] = 1; a[b + 10] = sz == null ? sx : sz; a[b + 12] = x; a[b + 13] = y + 0.006; a[b + 14] = z; dirty = true; },
      commit() { if (dirty) { mesh.instanceMatrix.needsUpdate = true; dirty = false; } },
      clear() { free.length = 0; for (let k = cap - 1; k >= 0; k--) { free.push(k); used[k] = 0; zero(k); } hi = 0; mesh.count = 0; dirty = true; },
      dispose() { if (mesh.parent) mesh.parent.remove(mesh); geo.dispose(); mesh.dispose(); }
    };
  }
  function billboards(o) {
    o = o || {};
    let p = null;
    if (K && typeof K.billboards === 'function') p = safe(() => K.billboards({ capacity: o.capacity, texture: o.texture === 'halo' ? 'halo' : 'sparkles', additive: o.additive, fog: o.fog, renderOrder: o.renderOrder, show: false }));
    if (!p) p = liteBillboards(o);
    pools.add(p);
    return p;
  }
  function blobs(n) {
    let p = null;
    if (K && typeof K.blobs === 'function') p = safe(() => K.blobs(n));
    if (!p) p = liteBlobs(n);
    pools.add(p);
    return p;
  }

  /* the shared toon rim follows the light arc; the island's own rim is restored on dispose */
  const rimSaved = K && K.uniforms && K.uniforms.uRimColor ? { c: K.uniforms.uRimColor.value.clone(), s: K.uniforms.uRimStrength.value } : null;
  const _rim = new THREE.Color();
  function setRim(hex, strength) {
    if (!rimSaved || typeof K.setRim !== 'function') return;
    try { K.setRim(_rim.set(hex), strength); } catch (e) { /* keep the island's rim */ }
  }
  /* dispose one pool (or own material / texture) early, e.g. when a cached track is dropped */
  function release(x) {
    if (!x) return;
    if (pools.has(x)) pools.delete(x);
    if (owned.has(x)) owned.delete(x);
    try { x.dispose(); } catch (e) { /* already gone */ }
  }
  function dispose() {
    if (rimSaved) { try { K.setRim(rimSaved.c, rimSaved.s); } catch (e) { /* island re-applies on resume */ } }
    pools.forEach((p) => { try { p.dispose(); } catch (e) { /* already gone */ } });
    pools.clear();
    owned.forEach((x) => { try { x.dispose(); } catch (e) { /* already gone */ } });
    owned.clear(); liteMats.clear(); neons.clear(); colors.clear();
  }

  return {
    THREE, tier, low, island: !!K, K, G, ATLAS: (K && K.ATLAS) || ATLAS,
    mat, neon, additive, own, color, tex, billboards, blobs, release, setRim, dispose
  };
}
