/* ================================================================
   Debut Run 3D — scene builders (ES module; THREE from the import map).
   Used only by world/games/pet-course-3d.js. Every builder takes the
   shared build context
     ctx = {THREE, K (SL3D kit), M (SLCourse3DMath), tier, low, budget,
            look (M.look3d), sizes (M.kindSizes), reduced, member (hex)}
   and returns a part {group|mesh, update…(), dispose()}. Parts only
   READ the round; they never touch the logic.

   Draw-call discipline: one InstancedMesh per (part, material); every
   toon InstancedMesh carries an instanceColor so they all share the
   kit's ONE 'encore-toon' program; dynamic instancers are not frustum
   culled (their bounds move). Shared kit materials (K.mat) are never
   disposed here; everything a builder creates itself is.
   ================================================================ */
import * as THREE from 'three';

const DEG = Math.PI / 180, TAU = Math.PI * 2;
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
const DOWN = new THREE.Vector3(0, -1, 0), ONE = new THREE.Vector3(1, 1, 1), ZAXIS = new THREE.Vector3(0, 0, 1);
const ARCH_YAW = 55 * DEG;                 /* doors face the audience like a TV set piece */
const CONE_PROFILE = [[0, 0], [1, 0], [0.83, 0.17], [0.66, 0.34], [0.5, 0.5], [0.33, 0.67], [0.16, 0.84], [0, 1]];

/* ---------------- tiny helpers ---------------- */
export function col(hex) { return new THREE.Color(hex); }
/* cheap primitives for small or many-copy parts (the kit's rounded slab is ~300 tris) */
function box(G, w, h, d) { return G.slab(w, h, d, 0); }                                   /* 12 tris */
function gem(G, r, detail) { return G.normalise(new THREE.IcosahedronGeometry(r, detail || 0)); }   /* 20 / 80 tris */
/* an InstancedMesh with instanceColor (shares the kit's instanced programs) */
export function im(geo, mat, cap, name) {
  const m = new THREE.InstancedMesh(geo, mat, cap);
  m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  m.count = 0; m.frustumCulled = false; m.name = name || 'im';
  return m;
}
/* one static copy through the instanced path (same program as everything else) */
export function single(geo, mat, name) {
  const m = im(geo, mat, 1, name);
  m.setMatrixAt(0, _m.identity()); m.count = 1;
  return m;
}
export function setInst(mesh, i, x, y, z, rx, ry, rz, sx, sy, sz) {
  _e.set(rx || 0, ry || 0, rz || 0, 'XYZ'); _q.setFromEuler(_e);
  _v.set(x, y, z); _s.set(sx == null ? 1 : sx, sy == null ? (sx == null ? 1 : sx) : sy, sz == null ? (sx == null ? 1 : sx) : sz);
  _m.compose(_v, _q, _s); mesh.setMatrixAt(i, _m);
}
function setInstQ(mesh, i, x, y, z, q, sx, sy, sz) { _v.set(x, y, z); _s.set(sx, sy, sz); _m.compose(_v, q, _s); mesh.setMatrixAt(i, _m); }
function tintInst(mesh, i, hexInt, k) { _c.setHex(hexInt); if (k != null && k !== 1) _c.multiplyScalar(k); mesh.setColorAt(i, _c); }
function commit(mesh, colors) { mesh.instanceMatrix.needsUpdate = true; if (colors && mesh.instanceColor) mesh.instanceColor.needsUpdate = true; mesh.visible = mesh.count > 0; }
function disposeList(list) { for (const d of list) { try { if (d && d.dispose) d.dispose(); } catch (e) { /* already gone */ } } list.length = 0; }
/* reverse every triangle and its normals (an inner surface) */
function flipFaces(geo) {
  ['position', 'normal', 'color'].forEach(function (n) {
    const a = geo.getAttribute(n); if (!a) return;
    const arr = a.array;
    for (let i = 0; i + 8 < arr.length; i += 9) for (let k = 0; k < 3; k++) { const t = arr[i + 3 + k]; arr[i + 3 + k] = arr[i + 6 + k]; arr[i + 6 + k] = t; }
    if (n === 'normal') for (let i = 0; i < arr.length; i++) arr[i] = -arr[i];
    a.needsUpdate = true;
  });
  return geo;
}
/* a puffy four-point ✦ (the HUD's glow-star glyph — never the ⭐ reward shape) */
function sparkleShape(rOut, rIn) {
  const sh = new THREE.Shape();
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 2 + i * Math.PI / 2, b = a + Math.PI / 4, c = a + Math.PI / 2;
    const ox = Math.cos(a) * rOut, oy = Math.sin(a) * rOut;
    if (i === 0) sh.moveTo(ox, oy);
    sh.quadraticCurveTo(Math.cos(b) * rIn, Math.sin(b) * rIn, Math.cos(c) * rOut, Math.sin(c) * rOut);
  }
  sh.closePath();
  return sh;
}
export function sparkleGeo(G, rOut, rIn, depth, low) {
  const g = new THREE.ExtrudeGeometry(sparkleShape(rOut, rIn), { depth: depth, bevelEnabled: true, bevelThickness: depth * 0.45, bevelSize: rOut * 0.08, bevelSegments: low ? 1 : 2, curveSegments: low ? 4 : 6, steps: 1 });
  g.translate(0, 0, -depth / 2);
  return G.normalise(g);
}
function canvas2d(w, h) {
  if (typeof document === 'undefined' || !document.createElement) return null;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  return c.getContext && c.getContext('2d') ? c : null;
}
function canvasTex(c) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t; }
/* run fn now and again once Bagel Fat One is ready (canvas text) */
function withFont(fn) {
  fn(false);
  try {
    if (typeof document !== 'undefined' && document.fonts && document.fonts.load) {
      document.fonts.load('400 64px "Bagel Fat One"').then(function (l) { if (l && l.length) fn(true); }, function () {});
    }
  } catch (e) { /* no font API: the fallback face stays */ }
}

/* ================================================================
   SKY — gradient dome, star field (Showtime) and a setting sun disc
   ================================================================ */
const SKY_VS = 'varying vec3 vDir;\nvoid main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const SKY_FS = [
  'uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uHor; varying vec3 vDir;',
  'void main(){',
  '  float h = vDir.y;',
  '  vec3 c = h > 0.16 ? mix(uMid, uTop, smoothstep(0.16, 0.72, h)) : mix(uHor, uMid, smoothstep(-0.05, 0.16, h));',
  '  gl_FragColor = vec4(c, 1.0);',
  '  #include <colorspace_fragment>',
  '}'].join('\n');
const STAR_VS = [
  'attribute float aPh; uniform float uT; uniform float uSize; uniform float uA; uniform float uTw; varying float vA;',
  'void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = uSize;',
  '  vA = uA * (1.0 - 0.35 * uTw + 0.35 * uTw * sin(uT * 2.0 + aPh)); }'].join('\n');
const STAR_FS = 'varying float vA;\nvoid main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d); if (r > 0.5) discard; gl_FragColor = vec4(1.0, 1.0, 1.0, vA * smoothstep(0.5, 0.15, r)); }';

export function makeSky(ctx) {
  const T = ctx.THREE, own = [];
  const group = new T.Group(); group.name = 'sky';
  const geo = new T.SphereGeometry(90, 24, 12); own.push(geo);
  const mat = new T.ShaderMaterial({
    uniforms: { uTop: { value: new T.Color() }, uMid: { value: new T.Color() }, uHor: { value: new T.Color() } },
    vertexShader: SKY_VS, fragmentShader: SKY_FS, side: T.BackSide, depthWrite: false, depthTest: false, fog: false, toneMapped: false
  }); own.push(mat);
  const dome = new T.Mesh(geo, mat); dome.renderOrder = -20; dome.frustumCulled = false; group.add(dome);
  /* star field: 250 points (120 on LOW) in the band of sky the runway camera sees
     (ahead, 2°–34° up), twinkling slowly (≤ 0.32 Hz) in the shader */
  const n = ctx.low ? 120 : 250, pos = new Float32Array(n * 3), ph = new Float32Array(n), r = ctx.M.xorshift(4242);
  for (let i = 0; i < n; i++) {
    const az = -Math.PI / 2 + (r() - 0.5) * 2.6, el = 0.035 + Math.pow(r(), 1.4) * 0.56;
    const y = Math.sin(el), c = Math.cos(el);
    pos[i * 3] = Math.cos(az) * c * 80; pos[i * 3 + 1] = y * 80; pos[i * 3 + 2] = Math.sin(az) * c * 80; ph[i] = r() * TAU;
  }
  const sgeo = new T.BufferGeometry();
  sgeo.setAttribute('position', new T.BufferAttribute(pos, 3)); sgeo.setAttribute('aPh', new T.BufferAttribute(ph, 1)); own.push(sgeo);
  const smat = new T.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uSize: { value: 2 }, uA: { value: 0 }, uTw: { value: ctx.reduced ? 0 : 1 } },
    vertexShader: STAR_VS, fragmentShader: STAR_FS, transparent: true, depthWrite: false,
    blending: T.AdditiveBlending, fog: false, toneMapped: false       /* depth-tested: hills hide them */
  }); own.push(smat);
  const stars = new T.Points(sgeo, smat); stars.renderOrder = -19; stars.frustumCulled = false; stars.visible = false; group.add(stars);
  return {
    group: group,
    update: function (cam, L, t, pixelRatio) {
      dome.position.copy(cam.position); stars.position.copy(cam.position);
      mat.uniforms.uTop.value.setHex(L.skyTop); mat.uniforms.uMid.value.setHex(L.skyMid); mat.uniforms.uHor.value.setHex(L.skyHor);
      stars.visible = L.stars > 0.01;
      smat.uniforms.uA.value = L.stars; smat.uniforms.uT.value = t; smat.uniforms.uSize.value = 2 * (pixelRatio || 1);
    },
    dispose: function () { group.removeFromParent(); disposeList(own); }
  };
}

/* ================================================================
   CLOUDS — 5 white toon puffs drifting at 0.08 u/s (fade at night)
   ================================================================ */
export function makeClouds(ctx) {
  const G = ctx.K.G, M = ctx.M;
  const parts = [[0, 0, 0, 1.1], [1.1, -0.15, 0.1, 0.85], [-1.05, -0.2, 0, 0.8], [0.4, 0.55, -0.1, 0.75], [-0.45, 0.35, 0.2, 0.6]];
  const geo = G.merge(parts.map(function (p) { return G.paint(G.t(G.puff(p[3]), { p: [p[0], p[1], p[2]], s: [1, 0.8, 0.8] }), col('#FFFFFF')); }));
  const mesh = im(geo, ctx.K.mat('toon'), 5, 'clouds');
  const base = [0, 9, 17, 26, 35], ys = [7.2, 8.6, 6.4, 9.2, 7.8], zs = [-24, -30, -22, -28, -26], ss = [1.2, 1.6, 1.0, 1.4, 1.1];
  return {
    mesh: mesh,
    update: function (camX, t, L) {
      const k = L.clouds;
      mesh.visible = k > 0.01;
      if (!mesh.visible) return;
      for (let i = 0; i < 5; i++) {
        const span = 50, x0 = camX - 20;
        const x = x0 + (((base[i] + (ctx.reduced ? 0 : 0.08 * t) - x0) % span) + span) % span;
        setInst(mesh, i, x, ys[i], zs[i], 0, 0, 0, ss[i] * k, ss[i] * k * 0.9, ss[i] * k);
      }
      mesh.count = 5; commit(mesh);
    },
    dispose: function () { mesh.removeFromParent(); mesh.dispose(); geo.dispose(); }
  };
}

/* ================================================================
   HILLS — two periodic ribbons (z -6 hill2, z -12 hill), snapped to
   their period so they never visibly move
   ================================================================ */
function hillGeo(G, len, segs, baseY, amp, P, depth, hexCol) {
  const pos = [], idx = [];
  function top(x) { return baseY + amp * (0.55 * Math.sin(TAU * x / P) + 0.3 * Math.sin(TAU * x / (P / 2) + 1.3) + 0.15 * Math.sin(TAU * x / (P / 4) + 0.4)); }
  for (let i = 0; i <= segs; i++) {
    const x = -len / 2 + len * i / segs, y = top(x);
    pos.push(x, -2.2, 0, x, y, 0, x, y - 0.3, -depth);
  }
  for (let i = 0; i < segs; i++) {
    const a = i * 3, b = (i + 1) * 3;
    idx.push(a, b, a + 1, b, b + 1, a + 1, a + 1, b + 1, a + 2, b + 1, b + 2, a + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  const out = G.normalise(g);
  const base = col(hexCol), hi = col(hexCol).lerp(col('#FFFFFF'), 0.18), lo = col(hexCol).multiplyScalar(0.9);
  G.paintBy(out, function (v) { return v.ny > 0.55 ? hi : v.y < baseY - amp ? lo : base; });
  return out;
}
export function makeHills(ctx) {
  const G = ctx.K.G, lk = ctx.look;
  const g1 = hillGeo(G, 96, ctx.low ? 96 : 160, 0.55, 0.38, 16, 1.2, lk.hill2);
  const g2 = hillGeo(G, 144, ctx.low ? 96 : 160, 1.7, 0.95, 24, 2.0, lk.hill);
  const near = single(g1, ctx.K.mat('toon'), 'hill2'), far = single(g2, ctx.K.mat('toon'), 'hill');
  const group = new THREE.Group(); group.name = 'hills'; group.add(near, far);
  return {
    group: group,
    update: function (camX) {
      setInst(near, 0, Math.floor(camX / 16) * 16, -0.3, -6); setInst(far, 0, Math.floor(camX / 24) * 24, -0.3, -12);
      commit(near); commit(far);
    },
    dispose: function () { group.removeFromParent(); near.dispose(); far.dispose(); g1.dispose(); g2.dispose(); }
  };
}

/* ================================================================
   BACKDROP PROP ROWS — two themed props every 3 u at z -3.5 … -5
   ================================================================ */
function propGeo(G, kind, low) {
  const P = function (geo, hex, tn) { return G.paint(geo, col(hex), tn); };
  const L = [];
  const canopy = function (hexA, hexB) {
    [[0, 1.25, 0, 0.5], [0.36, 1.08, 0.1, 0.38], [-0.33, 1.02, -0.05, 0.36], [0.05, 1.58, 0, 0.3]].forEach(function (c) {
      const g = G.t(G.puff(c[3]), { p: [c[0], c[1], c[2]] });
      L.push(G.paintBy(g, function (v) { return v.ny > 0.55 ? col(hexB) : col(hexA); }));
    });
  };
  switch (kind) {
    case 'oak': L.push(P(G.t(G.tube(0.09, 0.13, 0.95), { p: [0, 0.47, 0] }), '#9B6B43')); canopy('#5CB85C', '#8BD17C'); break;
    case 'blossom': L.push(P(G.t(G.tube(0.08, 0.12, 0.9), { p: [0, 0.45, 0] }), '#9B6B43')); canopy('#F6A7C8', '#FFD3E6'); break;
    case 'palm': {
      for (let i = 0; i < 5; i++) L.push(P(G.t(G.tube(0.075, 0.09, 0.36), { p: [0.05 * i * i * 0.18, 0.18 + i * 0.34, 0], r: [0, 0, -4 * i] }), i % 2 ? '#8A5A2B' : '#A5743F'));
      for (let f = 0; f < 6; f++) {
        const a = f * 60;
        L.push(G.paintBy(G.t(G.puff(0.3), { s: [0.22, 0.09, 1.0], r: [-22, a, 0], p: [0.2 + Math.sin(a * DEG) * 0.32, 1.78, Math.cos(a * DEG) * 0.32] }), function (v) { return v.ny > 0.3 ? col('#5CCC70') : col('#3FA956'); }));
      }
      L.push(P(G.t(gem(G, 0.07), { p: [0.24, 1.66, 0.06] }), '#8A5A2B'), P(G.t(gem(G, 0.07), { p: [0.12, 1.64, -0.06] }), '#8A5A2B'));
      break;
    }
    case 'hut': {
      const body = G.t(G.tube(0.46, 0.5, 0.95, { radial: low ? 8 : 12 }), { p: [0, 0.48, 0] });
      L.push(G.paintBy(body, function (v) { return Math.floor((Math.atan2(v.z, v.x) + Math.PI) / (TAU / 8)) % 2 ? col('#FF6B6B') : col('#FFFFFF'); }, { perFace: true }));
      const roof = G.t(G.cone(0.66, 0.5, low ? 8 : 12), { p: [0, 1.2, 0] });
      L.push(G.paintBy(roof, function (v) { return Math.floor((Math.atan2(v.z, v.x) + Math.PI) / (TAU / 8)) % 2 ? col('#FFE27A') : col('#FF6B6B'); }, { perFace: true }));
      L.push(P(G.t(box(G, 0.28, 0.5, 0.06), { p: [0, 0.3, 0.48] }), '#C99A4D'));
      break;
    }
    case 'pine': {
      L.push(P(G.t(G.tube(0.08, 0.1, 0.5), { p: [0, 0.25, 0] }), '#8A5D3A'));
      [[0.62, 0.72, 0.75], [0.5, 0.62, 1.2], [0.36, 0.52, 1.6]].forEach(function (c) {
        const g = G.t(G.cone(c[0], c[1], low ? 7 : 10), { p: [0, c[2], 0] });
        L.push(G.paintBy(g, function (v) { return v.y > c[2] + c[1] * 0.12 ? col('#FFFFFF') : col('#3F9A5A'); }));
      });
      break;
    }
    case 'snowman': {
      [[0.34, 0.3], [0.25, 0.8], [0.19, 1.16]].forEach(function (b) { L.push(P(G.t(G.puff(b[0]), { p: [0, b[1], 0] }), '#FDFDFF')); });
      L.push(P(G.t(G.cone(0.04, 0.2, 6), { r: [90, 0, 0], p: [0, 1.15, 0.27] }), '#FF8A3D'));
      [-1, 1].forEach(function (sx) { L.push(P(G.t(gem(G, 0.028), { p: [0.07 * sx, 1.22, 0.165] }), '#3B2F4A')); });
      L.push(P(G.t(G.tube(0.13, 0.13, 0.2), { p: [0, 1.42, 0] }), '#3B2F4A'), P(G.t(G.tube(0.2, 0.2, 0.03), { p: [0, 1.32, 0] }), '#3B2F4A'));
      L.push(P(G.t(G.ring(0.2, 0.05), { r: [90, 0, 0], p: [0, 0.98, 0] }), '#4FC3F7'));
      break;
    }
    case 'lollipop': {
      L.push(P(G.t(G.tube(0.04, 1.15), { p: [0, 0.57, 0] }), '#FFFFFF'));
      const disc = G.t(G.tube(0.46, 0.46, 0.12, { radial: low ? 10 : 14 }), { r: [90, 0, 0], p: [0, 1.4, 0] });
      L.push(G.paintBy(disc, function (v) { const a = Math.atan2(v.y - 1.4, v.x), r = Math.sqrt(v.x * v.x + (v.y - 1.4) * (v.y - 1.4)); return Math.floor((a + r * 9 + Math.PI) / (TAU / 6)) % 2 ? col('#FF7AB8') : col('#FFFFFF'); }, { perFace: true }));
      break;
    }
    case 'cupcake': {
      const wrap = G.t(G.tube(0.44, 0.33, 0.48, { radial: low ? 10 : 16 }), { p: [0, 0.24, 0] });
      L.push(G.paintBy(wrap, function (v) { return Math.floor((Math.atan2(v.z, v.x) + Math.PI) / (TAU / 16)) % 2 ? col('#C38BFF') : col('#D9B8FF'); }, { perFace: true }));
      [[0.46, 0.6], [0.36, 0.86], [0.24, 1.06]].forEach(function (f) { L.push(P(G.t(G.puff(f[0]), { s: [1, 0.62, 1], p: [0, f[1], 0] }), '#FF9DBF')); });
      L.push(P(G.t(gem(G, 0.1, 1), { p: [0, 1.22, 0] }), '#FF4F6B'));
      break;
    }
    default: L.push(P(box(G, 0.5, 1, 0.5), '#CFC8DC'));
  }
  const geo = G.merge(L);
  L.forEach(function (g) { g.dispose(); });
  return geo;
}
export function makePropRows(ctx) {
  const K = ctx.K, M = ctx.M, kinds = ctx.look.props;
  const geos = [propGeo(K.G, kinds[0], ctx.low), propGeo(K.G, kinds[1], ctx.low)];
  const N = 13, SP = 3;
  const meshes = [im(geos[0], K.mat('toon'), N, 'propA'), im(geos[1], K.mat('toon'), N, 'propB')];
  const group = new THREE.Group(); group.name = 'props'; group.add(meshes[0], meshes[1]);
  let lastBase = null;
  return {
    group: group,
    update: function (camX) {
      const base = M.ringBase(camX, SP, 9);
      if (base === lastBase) return;
      lastBase = base;
      meshes[0].count = 0; meshes[1].count = 0;
      for (let i = 0; i < N; i++) {
        const k = M.ringSlot(i, N, base), which = M.hash01(k, 21) < 0.5 ? 0 : 1, mm = meshes[which];
        const s = 0.85 + 0.35 * M.hash01(k, 23);
        setInst(mm, mm.count, k * SP + (M.hash01(k, 24) - 0.5) * 1.2, -0.3, -3.6 - 1.6 * M.hash01(k, 22), 0, (M.hash01(k, 25) - 0.5) * 50 * DEG, 0, s);
        mm.count++;
      }
      commit(meshes[0]); commit(meshes[1]);
    },
    dispose: function () { group.removeFromParent(); meshes.forEach(function (m) { m.dispose(); }); geos.forEach(function (g) { g.dispose(); }); }
  };
}

/* ================================================================
   APRON — the floor around the runway + small themed dressing
   ================================================================ */
function dressGeo(G, kind) {
  const L = [], P = function (geo, hex) { return G.paint(geo, col(hex)); };
  if (kind === 'flower') {                     /* ~60 tris: a stem, a petal disc and a centre */
    L.push(P(G.t(G.tube(0.012, 0.16, { radial: 4 }), { p: [0, 0.08, 0] }), '#3C8A3C'));
    L.push(P(G.t(gem(G, 0.07), { s: [1, 0.35, 1], p: [0, 0.17, 0] }), '#FFFFFF'));
    L.push(P(G.t(gem(G, 0.03), { p: [0, 0.19, 0] }), '#FFC93C'));
  } else if (kind === 'shell') {
    const g = G.t(gem(G, 0.08, 1), { s: [1, 0.45, 0.8], p: [0, 0.03, 0] });
    L.push(G.paintBy(g, function (v) { return Math.floor((v.x + 0.1) / 0.03) % 2 ? col('#FFD3E6') : col('#FFF6E0'); }, { perFace: true }));
  } else if (kind === 'snowball') {
    L.push(P(G.t(gem(G, 0.07, 1), { p: [0, 0.05, 0] }), '#FDFDFF'), P(G.t(gem(G, 0.045), { p: [0.08, 0.03, 0.03] }), '#EAF4FF'));
  } else {
    L.push(P(G.t(gem(G, 0.07, 1), { s: [1, 0.9, 1], p: [0, 0.06, 0] }), '#FFFFFF'));
  }
  const geo = G.merge(L); L.forEach(function (g) { g.dispose(); });
  return geo;
}
export function makeApron(ctx) {
  const K = ctx.K, G = K.G, M = ctx.M, lk = ctx.look;
  const fgeo = G.paint(G.t(G.normalise(new THREE.PlaneGeometry(140, 26, 14, 4)), { r: [-90, 0, 0] }), col(lk.apron));
  const floor = single(fgeo, K.mat('toon'), 'apron');
  const dgeo = dressGeo(G, lk.dress), N = 22, SP = 1.15;
  const dress = im(dgeo, K.mat('toon'), N * 2, 'dress');
  const tints = lk.dress === 'gumdrop' ? ['#FF5C8A', '#FFD23F', '#C38BFF', '#7BD88F'] : lk.dress === 'flower' ? ['#FFFFFF', '#FFE27A', '#FFB3E6', '#FFFFFF'] : ['#FFFFFF', '#F4F0FF', '#FFF6E0', '#FFFFFF'];
  const tintInts = tints.map(M.hexInt);
  const group = new THREE.Group(); group.name = 'apron'; group.add(floor, dress);
  let lastBase = null;
  return {
    group: group,
    update: function (camX) {
      setInst(floor, 0, Math.floor(camX / 4) * 4 + 20, -0.3, -2); commit(floor);
      const base = M.ringBase(camX, SP, 7);
      if (base === lastBase) return;
      lastBase = base;
      let n = 0;
      for (let row = 0; row < 2; row++) {
        for (let i = 0; i < N; i++) {
          const k = M.ringSlot(i, N, base), h = M.hash01(k * 2 + row, 31);
          if (h < 0.35) continue;                                       /* gaps keep it natural */
          const z = row ? -1.55 - 1.0 * M.hash01(k, 32 + row) : 1.55 + 1.1 * M.hash01(k, 34);
          setInst(dress, n, k * SP + (M.hash01(k, 36 + row) - 0.5) * 0.8, -0.3, z, 0, h * 6, 0, 0.9 + 0.5 * M.hash01(k, 38 + row));
          tintInst(dress, n, tintInts[Math.floor(M.hash01(k, 40 + row) * tintInts.length) % tintInts.length]);
          n++;
        }
      }
      dress.count = n; commit(dress, true);
    },
    dispose: function () { group.removeFromParent(); floor.dispose(); dress.dispose(); fgeo.dispose(); dgeo.dispose(); }
  };
}

/* ================================================================
   RUNWAY — 16 recycled slab tiles (2.0 × 0.3 × 2.4, top at y 0) in three
   skins (ground / bridge deck / debut-stage catwalk) + 2 × 24 LED bulbs
   ================================================================ */
function tileGeos(G, lk) {
  const ground = col(lk.ground), soil = col(lk.soil), trim = col(lk.ground).lerp(col('#FFFFFF'), 0.28);
  const base = G.paintBy(G.t(G.slab(2.0, 0.3, 2.4, 0.04), { p: [0, -0.15, 0] }), function (v) { return v.ny > 0.5 ? ground : soil; });
  const trims = [-1, 1].map(function (sz) { return G.paint(G.t(box(G, 2.0, 0.02, 0.09), { p: [0, 0.003, sz * 1.02] }), trim); });
  const gGround = G.merge([base].concat(trims));
  /* the bridge: planks across the lane, alternating tones, on a soil-coloured stringer */
  const deck = [G.paint(G.t(box(G, 2.0, 0.24, 2.3), { p: [0, -0.16, 0] }), col(lk.deck[1]), 'shade')];
  for (let i = 0; i < 8; i++) deck.push(G.paint(G.t(box(G, 0.23, 0.06, 2.4), { p: [-0.875 + i * 0.25, -0.03, 0] }), col(lk.deck[i % 2])));
  const gDeck = G.merge(deck);
  /* the debut stage / Encore catwalk: dark gloss with neon pink edges */
  const stage = [G.paintBy(G.t(G.slab(2.0, 0.3, 2.4, 0.04), { p: [0, -0.15, 0] }), function (v) { return v.ny > 0.5 ? col('#2B2140') : col('#1A1240'); })];
  [-1, 1].forEach(function (sz) { stage.push(G.paint(G.t(box(G, 2.0, 0.025, 0.07), { p: [0, 0.004, sz * 1.1] }), col('#FF4FB8'))); });
  stage.push(G.paint(G.t(box(G, 2.0, 0.012, 0.5), { p: [0, 0.002, 0] }), col('#3B1E6E')));
  const gStage = G.merge(stage);
  [base, deck, stage, trims].forEach(function (a) { (Array.isArray(a) ? a : [a]).forEach(function (g) { g.dispose(); }); });
  return [gGround, gDeck, gStage];
}
export function makeRunway(ctx) {
  const K = ctx.K, M = ctx.M, N = 17, SP = 2.0;
  const geos = tileGeos(K.G, ctx.look);
  const skins = geos.map(function (g, i) { return im(g, K.mat('toon'), N, 'tiles' + i); });
  const group = new THREE.Group(); group.name = 'runway';
  skins.forEach(function (m) { group.add(m); });
  let lastBase = NaN, lastS0 = NaN, lastS1 = NaN;
  return {
    group: group,
    /* bridge = [x0, x1] world (deck skin), stage = [x0, x1] (catwalk skin) */
    update: function (camX, bridge, stage) {
      const base = M.ringBase(camX, SP, 5);
      if (base === lastBase && stage[0] === lastS0 && stage[1] === lastS1) return;
      lastBase = base; lastS0 = stage[0]; lastS1 = stage[1];
      skins[0].count = skins[1].count = skins[2].count = 0;
      for (let i = 0; i < N; i++) {
        const k = M.ringSlot(i, N, base), x = k * SP + SP / 2;
        const s = (x >= bridge[0] && x <= bridge[1]) ? 1 : (x >= stage[0] && x <= stage[1]) ? 2 : 0, mm = skins[s];
        setInst(mm, mm.count, x, 0, 0);
        _c.setScalar((k & 1) ? 0.95 : 1); mm.setColorAt(mm.count, _c);
        mm.count++;
      }
      for (let j = 0; j < skins.length; j++) commit(skins[j], true);
    },
    dispose: function () { group.removeFromParent(); skins.forEach(function (m) { m.dispose(); }); geos.forEach(function (g) { g.dispose(); }); }
  };
}
/* LED edge bulbs: the in-world Hype meter. Writes halos through fx.halo(). */
export function makeLeds(ctx) {
  const K = ctx.K, M = ctx.M, LED = M.LED, N = LED.perRow;
  const geo = gem(K.G, 0.055, ctx.low ? 0 : 1);           /* unlit: only the silhouette matters */
  const mesh = im(geo, K.mat('neon:Cloud White'), N * 2, 'leds');
  const st = { mult: 1, fever: false, prevMult: 1, prevFever: false, sinceTier: 99, sinceClear: 99, dark: 0, t: 0, reduced: ctx.reduced, petX: 0 };
  const out = {};
  return {
    mesh: mesh, st: st,
    /* camZ: the near row's halos shrink when a crane/dolly brings the camera close */
    update: function (camX, fx, haloScale, haloA, camZ) {
      const base = M.ringBase(camX, LED.spacing, LED.behind), near = M.clamp01(((camZ == null ? 7.5 : camZ) - 3.2) / 3.5);
      let n = 0;
      for (let row = 0; row < 2; row++) {
        const z = row ? -LED.z : LED.z, hk = row ? 1 : 0.3 + 0.7 * near;
        for (let i = 0; i < N; i++) {
          const k = M.ringSlot(i, N, base), x = k * LED.spacing;
          M.ledAt(x, k, st, out);
          setInst(mesh, n, x, 0.035, z); tintInst(mesh, n, out.hex);
          if (out.glow > 0.2 && fx && !(ctx.low && st.mult < 2 && !st.fever)) fx.halo(x, 0.06, z, 0.38 * out.glow * haloScale * hk, out.hex, out.glow * haloA * hk);
          n++;
        }
      }
      mesh.count = n; commit(mesh, true);
    },
    dispose: function () { mesh.removeFromParent(); mesh.dispose(); geo.dispose(); }
  };
}

/* ================================================================
   SPOTLIGHT CONES — 3 additive cones on truss pods at z -6 (NOT lights)
   ================================================================ */
const CONE_VS = [
  'varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying vec3 vCol;',
  'void main(){',
  '  vUv = uv; vec4 p = vec4(position, 1.0); vec3 n = normal;',
  '#ifdef USE_INSTANCING',
  '  p = instanceMatrix * p; n = mat3(instanceMatrix) * n;',
  '#endif',
  '#ifdef USE_INSTANCING_COLOR',
  '  vCol = instanceColor;',
  '#else',
  '  vCol = vec3(1.0);',
  '#endif',
  '  vec4 mv = modelViewMatrix * p; vV = -mv.xyz; vN = normalize(normalMatrix * n);',
  '  gl_Position = projectionMatrix * mv;',
  '}'].join('\n');
const CONE_FS = [
  'uniform float uA; varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying vec3 vCol;',
  'void main(){',
  '  float along = pow(clamp(vUv.y, 0.0, 1.0), 1.4);',
  '  float edge = abs(dot(normalize(vN), normalize(vV)));',
  '  float a = uA * 0.2 * along * smoothstep(0.0, 0.65, edge);',
  '  gl_FragColor = vec4(vCol, a);',
  '  #include <colorspace_fragment>',
  '}'].join('\n');
export function makeCones(ctx) {
  const K = ctx.K, M = ctx.M, own = [];
  const geo = new THREE.ConeGeometry(1.3, 10, ctx.low ? 12 : 16, 1, true); geo.translate(0, -5, 0); own.push(geo);
  const mat = new THREE.ShaderMaterial({ uniforms: { uA: { value: 0 } }, vertexShader: CONE_VS, fragmentShader: CONE_FS,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, toneMapped: false }); own.push(mat);
  const cones = im(geo, mat, 3, 'cones'); cones.renderOrder = 4;
  /* the lamps hang from a stage truss across the top of the view (no poles cluttering the stage) */
  const MY = 5.5, TRUSS = MY + 0.36;
  const trussGeo = K.G.merge([K.G.paint(K.G.t(K.G.tube(0.07, 34, { radial: 6 }), { r: [0, 0, 90], p: [0, 0.12, 0] }), col('#4B4F6B')),
    K.G.paint(K.G.t(K.G.tube(0.07, 34, { radial: 6 }), { r: [0, 0, 90], p: [0, -0.12, 0] }), col('#4B4F6B'))]); own.push(trussGeo);
  const podGeo = K.G.merge([K.G.paint(K.G.t(K.G.puff(0.24), { s: [1, 0.85, 1] }), col('#2B2140')),
    K.G.paint(K.G.t(K.G.tube(0.16, 0.16, 0.08), { p: [0, -0.19, 0] }), col('#DDE3F0')),
    K.G.paint(K.G.t(K.G.tube(0.025, 0.3), { p: [0, 0.3, 0] }), col('#4B4F6B'))]); own.push(podGeo);
  const truss = single(trussGeo, K.mat('toon'), 'truss'), pods = im(podGeo, K.mat('toon'), 3, 'pods');
  const group = new THREE.Group(); group.name = 'cones'; group.add(cones, truss, pods);
  const COLS = [M.hexInt(M.COL.NEON_PINK), M.hexInt(M.COL.NEON_CYAN), M.hexInt(M.COL.NEON_VIOLET)];
  const OFF = [-5.5, 0.6, 6.5], aim = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const lockK = [0, 0, 0];
  return {
    group: group,
    /* o = {alpha, t, lock 0..1, target {x,y,z}, on[3] 0..1, reduced, dt} */
    update: function (camX, o) {
      group.visible = o.alpha > 0.01;
      if (!group.visible) return;
      mat.uniforms.uA.value = o.alpha;
      for (let i = 0; i < 3; i++) {
        const mx = camX + OFF[i], my = MY, mz = -6;
        const sw = o.reduced ? (i - 1) * 14 * DEG : 25 * DEG * Math.sin(TAU * 0.12 * o.t + i * TAU / 3);   /* ±25° at 0.12 Hz */
        lockK[i] = o.reduced ? o.lock : M.approach(lockK[i], o.lock, o.dt, 9);
        aim[i].set(mx + Math.tan(sw) * MY, 0, 0).lerp(o.target, lockK[i]);
        _v2.subVectors(aim[i], _v.set(mx, my, mz)).normalize();
        _q.setFromUnitVectors(DOWN, _v2);
        setInstQ(cones, i, mx, my, mz, _q, 1, 1.15, 1);
        tintInst(cones, i, COLS[i], o.on[i]);
        setInstQ(pods, i, mx, my + 0.05, mz, _q, 1, 1, 1);
      }
      cones.count = pods.count = 3;
      setInst(truss, 0, Math.floor(camX / 2) * 2, TRUSS, -6); commit(truss);
      commit(cones, true); commit(pods);
    },
    dispose: function () { group.removeFromParent(); cones.dispose(); truss.dispose(); pods.dispose(); disposeList(own); }
  };
}

/* ================================================================
   FAN STANDS — 2 rows × 24 bean blobs with Island Wands on a chrome rail
   (from the Chorus door; 1 row on LOW). 40 % of wands glow in the child's colour.
   ================================================================ */
export function makeFans(ctx) {
  const K = ctx.K, G = K.G, M = ctx.M, own = [];
  const rows = ctx.low ? 1 : 2, N = 24, SP = 0.6, S = 1.5;
  const body = G.merge([
    G.paint(G.t(G.tube(0.1, 0.12, 0.2, { radial: 8 }), { p: [0, 0.1, 0] }), col('#FFFFFF')),
    G.paint(G.t(G.cone(0.1, 0.07, 8), { p: [0, 0.235, 0] }), col('#FFFFFF')),
    G.paint(G.t(gem(G, 0.018), { p: [-0.04, 0.17, 0.105] }), col('#3B2F4A')), G.paint(G.t(gem(G, 0.018), { p: [0.04, 0.17, 0.105] }), col('#3B2F4A'))
  ]); own.push(body);
  const handle = G.paint(G.t(G.tube(0.012, 0.12, { radial: 5 }), { p: [0, 0.06, 0] }), col('#FFFFFF')); own.push(handle);
  const bulb = G.merge([G.t(G.cone(0.034, 0.05, 4), { p: [0, 0.145, 0] }), G.t(G.cone(0.034, 0.05, 4), { r: [180, 0, 0], p: [0, 0.095, 0] })]); own.push(bulb);
  const bodies = im(body, K.mat('toon'), N * rows, 'fanBodies');
  const handles = im(handle, K.mat('toon'), N * rows, 'fanHandles');
  const bulbs = im(bulb, K.mat('neon:Cloud White'), N * rows, 'fanBulbs');
  const railGeo = G.paint(G.t(G.tube(0.035, 30, { radial: 8 }), { r: [0, 0, 90] }), col('#DDE3F0')); own.push(railGeo);
  const rail = single(railGeo, K.mat('chrome'), 'rail');
  const riserGeo = G.merge([G.paint(G.t(box(G, 30, 0.3, 0.7), { p: [0, -0.15, -3.25] }), col('#2B2140')),
    G.paint(G.t(box(G, 30, 0.04, 0.05), { p: [0, 0.0, -2.9] }), col('#FF4FB8'))]); own.push(riserGeo);
  const riser = single(riserGeo, K.mat('toon'), 'riser');
  const group = new THREE.Group(); group.name = 'fans'; group.add(bodies, handles, bulbs, rail);
  if (rows > 1) group.add(riser);
  const look = {}, pose = {}, st = { t: 0, excite: 0, ooh: 0, lastHeart: false, fever: false, reduced: ctx.reduced, x: 0 };
  const neonInts = M.FAN_NEON.map(M.hexInt), bodyInts = {};
  M.FAN_BODY.forEach(function (h) { bodyInts[h] = M.hexInt(h); });
  let memberInt = M.hexInt(ctx.member), enabled = true;
  const seats = new Float32Array(N * rows * 4);          /* x, y, z, wand-tip-y of each seat this frame (for hearts/halos) */
  return {
    group: group, st: st, seats: seats, rows: rows, perRow: N,
    setMember: function (hex) { memberInt = M.hexInt(M.safeMember(hex)); },
    setEnabled: function (on) { enabled = !!on; },
    /* k01 = appearance 0..1 (rise), showK for wand halos; fx for halos */
    update: function (camX, k01, fx, haloScale) {
      group.visible = enabled && k01 > 0.01;
      if (!group.visible) return;
      const rise = (1 - M.inOutSine(k01)) * -0.7;
      let n = 0;
      for (let r = 0; r < rows; r++) {
        const base = M.ringBase(camX, SP, 7.2 + r * 0.3);
        for (let i = 0; i < N; i++) {
          const k = M.ringSlot(i, N, base), seat = k * 2 + r;
          const x = k * SP + (r ? SP / 2 : 0), z = r ? -3.25 : -2.62, y0 = (r ? 0.0 : -0.3) + rise;
          M.fanLook(seat, look); st.x = x; M.fanPose(seat, st, pose);
          const sc = look.scale * S, y = y0 + pose.y;
          setInst(bodies, n, x, y, z, 0, 0, pose.roll, sc, sc * pose.sy, sc);
          tintInst(bodies, n, bodyInts[look.body]);
          /* the wand pivots at the paw; 'ooh' droops it, heart paws raise it */
          const hand = (seat & 1) ? 1 : -1, wx = x + 0.11 * sc * hand, wy = y + 0.15 * sc * pose.sy, wz = z + 0.07 * sc;
          const rz = -hand * (pose.wand + look.lean) + pose.roll;
          setInst(handles, n, wx, wy, wz, 0, 0, rz, sc);
          setInst(bulbs, n, wx, wy, wz, 0, 0, rz, sc);
          const wc = look.member ? memberInt : neonInts[seat % 3];
          tintInst(bulbs, n, wc);
          const tipY = wy + Math.cos(rz) * 0.12 * sc, tipX = wx - Math.sin(rz) * 0.12 * sc;
          seats[n * 4] = tipX; seats[n * 4 + 1] = tipY; seats[n * 4 + 2] = wz; seats[n * 4 + 3] = y + 0.36 * sc;
          if (fx && !ctx.low) fx.halo(tipX, tipY, wz + 0.02, 0.22 * haloScale, wc, 0.55 * k01);
          n++;
        }
      }
      bodies.count = handles.count = bulbs.count = n;
      commit(bodies, true); commit(handles); commit(bulbs, true);
      setInst(rail, 0, Math.floor(camX / 2) * 2 + 4, 0.28 + rise, -2.25); commit(rail);
      if (rows > 1) { setInst(riser, 0, Math.floor(camX / 2) * 2 + 4, rise, 0); commit(riser); }
    },
    count: function () { return group.visible ? bodies.count : 0; },
    dispose: function () { group.removeFromParent(); [bodies, handles, bulbs, rail, riser].forEach(function (m) { m.dispose(); }); disposeList(own); }
  };
}

/* ================================================================
   STAGE DOORS — a pool of 2 arches (section doors / the menu's DEBUT RUN),
   plus the big finish arch and the debut-stage riser. Each arch: 2 rounded
   pillars in the course THEME pair, a dark beam, an LED board (256×64
   canvas, drawn once per door) and 14 Star Gold marquee bulbs (≤ 2 Hz).
   ================================================================ */
function archGeo(G, cols, big) {
  const H = big ? 2.75 : 2.35, half = big ? 1.75 : 1.5, L = [];
  [[-1, cols[0]], [1, cols[1]]].forEach(function (p) {
    L.push(G.paint(G.t(G.slab(0.3, H, 0.3, 0.1), { p: [0, H / 2, p[0] * half] }), col(p[1])));
    L.push(G.paint(G.t(box(G, 0.42, 0.14, 0.42), { p: [0, 0.07, p[0] * half] }), col(p[1]), 'shade'));
    L.push(G.paint(G.t(G.puff(0.13), { p: [0, H + 0.7, p[0] * half] }), col('#FFD23F')));
  });
  L.push(G.paint(G.t(G.slab(0.36, 0.62, half * 2 + 0.5, 0.08), { p: [0, H + 0.28, 0] }), col('#1A1240')));
  const geo = G.merge(L); L.forEach(function (g) { g.dispose(); });
  return { geo: geo, H: H, half: half };
}
function makeArch(ctx, cols, big) {
  const K = ctx.K, M = ctx.M, own = [];
  const a = archGeo(K.G, cols, big); own.push(a.geo);
  const group = new THREE.Group(); group.name = big ? 'finishArch' : 'arch'; group.rotation.y = ARCH_YAW;
  const frame = single(a.geo, K.mat('toon'), 'archFrame'); group.add(frame);
  const bw = a.half * 2 + 0.2, bh = big ? 0.66 : 0.58;
  const boardGeo = new THREE.PlaneGeometry(bw, bh); boardGeo.rotateY(-Math.PI / 2); own.push(boardGeo);
  const boardMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }); own.push(boardMat);
  const board = new THREE.Mesh(boardGeo, boardMat); board.position.set(-0.19, a.H + 0.28, 0); group.add(board);
  const bulbGeo = gem(K.G, 0.045, ctx.low ? 0 : 1); own.push(bulbGeo);
  const bulbs = im(bulbGeo, K.mat('neon:Cloud White'), 14, 'marquee'); group.add(bulbs);
  for (let i = 0; i < 14; i++) setInst(bulbs, i, -0.2, a.H + 0.28 + bh / 2 + 0.05, -bw / 2 + 0.04 + i * (bw - 0.08) / 13);
  bulbs.count = 14; commit(bulbs);
  const ON = M.hexInt('#FFD23F'), OFF = M.hexInt('#8A7A3A');
  let tex = null, text = '';
  return {
    group: group, H: a.H, half: a.half, text: function () { return text; },
    setText: function (t, fill) {
      if (t === text && tex) return;
      if (tex) { K.tex.release(tex); tex = null; }
      text = t;
      tex = K.tex.banner(t, { w: 256, h: 64, fill: fill || ['Neon Cyan', 'Holo Blue'], bg: 'Stage Night', radius: 10 });
      boardMat.map = tex; boardMat.needsUpdate = true;
    },
    update: function (x, t, reduced, boost) {
      group.position.set(x, 0, 0);
      for (let i = 0; i < 14; i++) tintInst(bulbs, i, M.marqueeOn(i, t, reduced) ? ON : OFF, 1 + (boost || 0) * 0.4);
      bulbs.instanceColor.needsUpdate = true;
    },
    dispose: function () { group.removeFromParent(); if (tex) K.tex.release(tex); tex = null; frame.dispose(); bulbs.dispose(); disposeList(own); }
  };
}
const FILL_GOLD = ['Star Gold', 'Primary Pink'];
export function makeDoors(ctx) {
  const M = ctx.M;
  const pool = [makeArch(ctx, ctx.look.arch, false), makeArch(ctx, ctx.look.arch, false)];
  const finish = makeArch(ctx, ['#FFD23F', '#FF4FB8'], true);
  finish.setText('SHOW COMPLETE!', FILL_GOLD);
  const group = new THREE.Group(); group.name = 'doors';
  pool.forEach(function (a) { group.add(a.group); }); group.add(finish.group);
  /* the debut stage riser (behind the runway) with two confetti cannons */
  const K = ctx.K, G = K.G, own = [];
  const riserGeo = G.merge([
    G.paint(G.t(G.slab(4.2, 0.5, 1.1, 0.08), { p: [0, 0.25, 0] }), col('#2B2140')),
    G.paint(G.t(box(G, 4.24, 0.05, 0.06), { p: [0, 0.47, 0.56] }), col('#FF4FB8')),
    G.paint(G.t(G.tube(0.12, 0.16, 0.55), { r: [0, 0, 28], p: [-2.0, 0.72, 0.1] }), col('#DDE3F0')),
    G.paint(G.t(G.tube(0.12, 0.16, 0.55), { r: [0, 0, -28], p: [2.0, 0.72, 0.1] }), col('#DDE3F0'))
  ]); own.push(riserGeo);
  const riser = single(riserGeo, K.mat('toon'), 'riser'); group.add(riser);
  const assigned = [-1, -1];
  return {
    group: group, finish: finish,
    /* doors = course.doors; menu = true shows the DEBUT RUN start arch; stageX = debut stage centre */
    update: function (doors, camX, t, reduced, menu, finishX, stageX, boostSec) {
      let used = 0;
      if (menu) {
        pool[0].setText('DEBUT RUN', FILL_GOLD); pool[0].group.visible = true; pool[0].update(M.petX(0) + M.CAM.menu.arch, t, reduced, 0);
        assigned[0] = -2; used = 1;
      } else if (doors) {
        for (let i = 0; i < doors.length && used < 2; i++) {
          const x = doors[i].x / M.PX;
          if (x < camX - 7 || x > camX + 28) continue;
          const a = pool[used];
          if (assigned[used] !== i) { a.setText(doors[i].name, null); assigned[used] = i; }
          a.group.visible = true;
          a.update(x, t, reduced, doors[i].sec === boostSec ? 1 : 0);
          used++;
        }
      }
      for (let u = used; u < 2; u++) pool[u].group.visible = false;
      const fx = finishX / M.PX, sx = stageX / M.PX;
      finish.group.visible = !menu && fx > camX - 9 && fx < camX + 30;
      if (finish.group.visible) finish.update(fx, t, reduced, 0);
      riser.visible = !menu && sx > camX - 9 && sx < camX + 30;
      if (riser.visible) { setInst(riser, 0, sx + 1.6, -0.02, -1.9); commit(riser); }
    },
    dispose: function () { group.removeFromParent(); pool.forEach(function (a) { a.dispose(); }); finish.dispose(); riser.dispose(); disposeList(own); }
  };
}

/* ================================================================
   OBSTACLES — modelled at the exact logic sizes (/100), pooled per kind,
   coloured from THEMES[v].obs. Hit props wobble then flatten to 35 %.
   ================================================================ */
function obstacleGeos(G, lk, sz, low) {
  const o = lk.obs, out = {};
  const P = function (g, hex, tn) { return G.paint(g, col(hex), tn); };
  /* hurdle: 2 tube posts + a striped rounded bar, top at exactly 0.58 */
  {
    const h = sz.low.h, w = sz.low.w, L = [];
    [-1, 1].forEach(function (s) { L.push(P(G.t(G.tube(0.045, h - 0.1), { p: [0, (h - 0.1) / 2, s * 0.43] }), o.low[0])); });
    const bar = G.t(G.slab(w, 0.14, 0.98, 0.05), { p: [0, h - 0.07, 0] });
    L.push(G.paintBy(bar, function (v) { return Math.floor((v.z + 0.5) / 0.163) % 2 ? col(o.low[0]) : col(o.low[1]); }, { perFace: true }));
    L.push(P(G.t(box(G, w * 0.7, 0.05, 0.86), { p: [0, h * 0.42, 0] }), o.low[1]));
    out.low = G.merge(L); L.forEach(function (g) { g.dispose(); });
  }
  /* log pile: 2 logs across the lane (r 0.22), ringed end grain; x-extent exactly 0.88 */
  {
    const r = sz.log.r, L = [], bark = col(o.log[0]).multiplyScalar(0.82), ring = col(o.log[1]), wood = col(o.log[0]);
    [-1, 1].forEach(function (s) {
      const g = G.t(G.tube(r, r, 0.92, { radial: low ? 10 : 14 }), { r: [90, 0, 0], p: [s * r, r, 0] });
      G.paintBy(g, function (v) {
        if (Math.abs(v.nz) < 0.7) return bark;
        const d = Math.sqrt((v.x - s * r) * (v.x - s * r) + (v.y - r) * (v.y - r)) / r;
        return d > 0.78 ? bark : (Math.floor(d * 3.2) % 2 ? ring : wood);
      });
      L.push(g);
    });
    out.log = G.merge(L); L.forEach(function (g) { g.dispose(); });
  }
  /* hedge (68 × 78): a slab + a crown in the course style */
  {
    const w = sz.hedge.w, h = sz.hedge.h, L = [], a = o.hedge[0], b = o.hedge[1];
    if (lk.hedge === 'castle') {                 /* sandcastle wall with crenels and a little door */
      L.push(P(G.t(G.slab(w, h - 0.12, 0.92, 0.03), { p: [0, (h - 0.12) / 2, 0] }), a));
      for (let i = 0; i < 4; i++) L.push(P(G.t(box(G, w * 0.9, 0.12, 0.16), { p: [0, h - 0.06, -0.38 + i * 0.253] }), a, 'shade'));
      L.push(P(G.t(box(G, w * 0.3, 0.26, 0.05), { p: [0, 0.13, 0.465] }), b));
    } else {                                      /* leafy hedge / snow bank / frosting hedge: a slab + 5 puffs */
      const top = h - 0.17;
      L.push(P(G.t(G.slab(w, top, 0.9, 0.08), { p: [0, top / 2, 0] }), lk.hedge === 'bank' ? '#F4F9FF' : b));
      for (let i = 0; i < 5; i++) {
        const z = -0.36 + i * 0.18, puff = G.t(G.puff(0.17), { s: [lk.hedge === 'bank' ? 1.15 : 1, 1, 1], p: [(i % 2 ? 0.05 : -0.05), h - 0.17, z] });
        L.push(G.paintBy(puff, function (v) { return v.ny > 0.5 ? col(a).lerp(col('#FFFFFF'), lk.hedge === 'frosting' ? 0.25 : 0.12) : col(a); }));
      }
      if (lk.hedge === 'frosting') for (let i = 0; i < 9; i++) L.push(P(G.t(box(G, 0.05, 0.02, 0.02), { r: [0, i * 40, i * 25], p: [(i % 3 - 1) * 0.12, h - 0.03, -0.32 + i * 0.08] }), ['#FFD23F', '#4FC3F7', '#FFFFFF'][i % 3]));
      if (lk.hedge === 'leafy') for (let i = 0; i < 3; i++) L.push(P(G.t(gem(G, 0.035), { p: [0.2, 0.3 + i * 0.12, -0.3 + i * 0.3] }), '#FF7AB8'));
    }
    out.hedge = G.merge(L); L.forEach(function (g) { g.dispose(); });
  }
  /* stack (56 × 116): 2 themed blocks; the BOING cushion is its own mesh (it squashes) */
  {
    const w = sz.stack.w, L = [], a = o.stack[0], b = o.stack[1];
    for (let k = 0; k < 2; k++) {
      const y0 = k * 0.5, blk = G.t(G.slab(w, 0.48, 0.9, 0.06), { p: [0, y0 + 0.24, 0] });
      if (lk.stack === 'hay') G.paintBy(blk, function (v) { return Math.abs(v.z) > 0.28 && Math.abs(v.z) < 0.34 ? col(b) : col(k ? b : a).lerp(col(a), 0.5); }, { perFace: true });
      else if (lk.stack === 'rings') G.paintBy(blk, function (v) { return Math.floor((v.y - y0) / 0.12) % 2 ? col('#FFFFFF') : col(k ? b : a); }, { perFace: true });
      else if (lk.stack === 'snowblock') G.paintBy(blk, function (v) { return v.ny > 0.5 ? col('#FFFFFF') : col(k ? b : a); });
      else G.paintBy(blk, function (v) { return k === 0 ? (Math.floor((Math.atan2(v.z, v.x) + Math.PI) / (TAU / 12)) % 2 ? col(a) : col(b)) : col('#FFF6E0'); }, { perFace: true });
      L.push(blk);
      if (lk.stack === 'hay') [-0.31, 0.31].forEach(function (z) { L.push(P(G.t(box(G, w + 0.012, 0.49, 0.03), { p: [0, y0 + 0.24, z] }), b)); });
    }
    out.stack = G.merge(L); L.forEach(function (g) { g.dispose(); });
  }
  /* puddle: a flat ellipse 1.08 × 0.5 */
  out.puddle = P(G.t(G.tube(1, 1, 0.02, { radial: low ? 16 : 24 }), { s: [sz.puddle.w / 2, 1, sz.puddle.d / 2], p: [0, 0.008, 0] }), o.puddle);
  return out;
}
export function makeObstacles(ctx) {
  const K = ctx.K, G = K.G, M = ctx.M, sz = ctx.sizes, own = [], CAP = 8;
  const geos = obstacleGeos(G, ctx.look, sz, ctx.low);
  Object.keys(geos).forEach(function (k) { own.push(geos[k]); });
  const meshes = {};
  ['low', 'log', 'hedge', 'stack', 'puddle'].forEach(function (k) { meshes[k] = im(geos[k], K.mat('toon'), CAP, 'obs:' + k); });
  /* the BOING cushion (Bubblegum pillow, top at exactly 1.16) */
  const cushGeo = K.G.merge([G.paintBy(G.t(G.slab(sz.stack.w + 0.08, sz.stack.cushionH, 0.96, 0.08), { p: [0, sz.stack.cushionH / 2, 0] }), function (v) { return v.ny > 0.6 ? col('#FFB3D9') : col('#FF8FC8'); })]);
  own.push(cushGeo);
  const cushion = im(cushGeo, K.mat('toon'), CAP, 'cushions');
  /* puddle ripple rings (white) */
  const ripGeo = G.paint(G.t(G.ring(1, 0.06), { r: [90, 0, 0] }), col('#FFFFFF')); own.push(ripGeo);
  const ripples = im(ripGeo, K.mat('neon:Cloud White'), CAP, 'ripples');
  /* LED gate: chrome posts 2.2 tall at z ±0.85, a dark board 0.52 × 0.6 with a neon edge + 3 chevrons */
  const bz = sz.bar;
  const postGeo = G.merge([-1, 1].map(function (s) { return G.paint(G.t(G.tube(0.035, bz.post, { radial: 8 }), { p: [0, bz.post / 2, s * bz.postZ] }), col('#FFFFFF')); })); own.push(postGeo);
  const boardGeo = G.merge([
    G.paint(G.t(G.slab(bz.w, bz.board, bz.postZ * 2, 0.05), { p: [0, bz.under + bz.board / 2, 0] }), col('#1A1240')),
    G.paint(G.t(box(G, 0.06, 0.06, bz.postZ * 2 + 0.06), { p: [0, bz.post - 0.03, 0] }), col('#DDE3F0'))
  ]); own.push(boardGeo);
  const neonParts = [];
  const fz = bz.postZ + 0.012, yb = bz.under, yt = bz.under + bz.board, hw = bz.w / 2;
  [[0, yb, 1], [0, yt, 1]].forEach(function (e) { neonParts.push(G.t(box(G, bz.w + 0.02, 0.03, 0.03), { p: [0, e[1], fz] })); });
  [-1, 1].forEach(function (s) { neonParts.push(G.t(box(G, 0.03, bz.board, 0.03), { p: [s * hw, yb + bz.board / 2, fz] })); });
  for (let c = 0; c < 3; c++) {                 /* 3 down-chevrons */
    const cy = yt - 0.14 - c * 0.14;
    [-1, 1].forEach(function (s) { neonParts.push(G.t(box(G, 0.15, 0.03, 0.03), { r: [0, 0, s * 35], p: [s * 0.055, cy, fz] })); });
  }
  const neonGeo = G.paint(G.merge(neonParts), col('#FFFFFF')); neonParts.forEach(function (g) { g.dispose(); }); own.push(neonGeo);
  const gatePosts = im(postGeo, K.mat('chrome'), CAP, 'gatePosts'), gateBoards = im(boardGeo, K.mat('toon'), CAP, 'gateBoards'), gateNeon = im(neonGeo, K.mat('neon:Cloud White'), CAP, 'gateNeon');
  /* rehearsal: dashed Neon Cyan outline; cue rings (Neon Cyan, 50 %, 1 Hz pulse) */
  const dashGeo = box(G, 0.085, 0.026, 0.026); own.push(dashGeo);
  const dashes = im(dashGeo, K.mat('neon:Neon Cyan'), 160, 'dashes');
  const cueGeo = G.t(G.ring(0.35, 0.028), { r: [90, 0, 0] }); own.push(cueGeo);
  const cueMat = new THREE.MeshBasicMaterial({ color: col('#3DF2FF'), transparent: true, opacity: 0.5, depthWrite: false, toneMapped: false }); own.push(cueMat);
  const cues = im(cueGeo, cueMat, CAP, 'cueRings');
  const group = new THREE.Group(); group.name = 'obstacles';
  Object.keys(meshes).forEach(function (k) { group.add(meshes[k]); });
  [cushion, ripples, gatePosts, gateBoards, gateNeon, dashes, cues].forEach(function (m) { group.add(m); });
  const anim = M.newPropAnim(), rect = {}, dash = {}, CYAN = M.hexInt('#3DF2FF');
  const SOLID_KINDS = ['low', 'log', 'hedge', 'stack', 'puddle'], n = { low: 0, log: 0, hedge: 0, stack: 0, puddle: 0 };
  let clearT = new Float32Array(0), prevPassed = new Uint8Array(0), pulseT = new Float32Array(0), bound = null;
  return {
    group: group,
    bind: function (course) {
      bound = course;
      const n = course ? course.obs.length : 0;
      clearT = new Float32Array(n).fill(-99); prevPassed = new Uint8Array(n); pulseT = new Float32Array(n).fill(-99);
      if (course) for (let i = 0; i < n; i++) prevPassed[i] = course.obs[i].passed ? 1 : 0;
    },
    /* the next LED gate ahead of x flashes its chevrons once (a slide) */
    pulseGate: function (x, sT) {
      if (!bound) return;
      const obs = bound.obs;
      for (let i = 0; i < obs.length; i++) { const o = obs[i]; if (o.kind === 'bar' && !o.passed && o.x / M.PX > x - 1 && o.x / M.PX < x + 4) { pulseT[i] = sT; return; } }
    },
    /* s = round.state; x0..x1 = the visible window; showK for the gate glow */
    update: function (s, course, x0, x1, sT, showK, fx, reduced) {
      for (let k = 0; k < SOLID_KINDS.length; k++) n[SOLID_KINDS[k]] = 0;
      let nc = 0, nr = 0, ng = 0, nd = 0, nq = 0;
      const obs = course ? course.obs : null;
      if (obs) {
        for (let i = Math.max(0, (s.oc | 0) - 4); i < obs.length; i++) {
          const o = obs[i], ox = o.x / M.PX;
          if (o.passed && !prevPassed[i]) { prevPassed[i] = 1; if (!o.hit) clearT[i] = sT; }
          if (ox > x1) break;
          if ((o.x + o.w) / M.PX < x0) continue;
          M.propAnim(o, sT, clearT[i], reduced, anim);
          const cx = M.obsCentreX(o), kind = o.kind;
          if (kind === 'bar') {
            setInst(gatePosts, ng, cx, anim.dy, 0, 0, 0, anim.rot);
            setInst(gateBoards, ng, cx, anim.dy + anim.lift, 0, 0, 0, anim.rot);
            setInst(gateNeon, ng, cx, anim.dy + anim.lift, 0, 0, 0, anim.rot);
            const pk = sT - pulseT[i], pulse = pk >= 0 && pk < 0.3 ? 1 - pk / 0.3 : 0;
            tintInst(gateNeon, ng, CYAN, (o.hit ? 0.45 : 0.75 + 0.25 * showK) + pulse * 1.2);
            if (fx && !o.hit && showK > 0.3) fx.halo(cx, bz.under + bz.board / 2 + anim.lift, 0.3, 1.1, CYAN, 0.3 * showK);
            ng++;
          } else {
            const mm = meshes[kind];
            if (!mm || n[kind] >= CAP) continue;
            setInst(mm, n[kind], cx, anim.dy, 0, 0, 0, anim.rot, 1, anim.sy, 1);
            n[kind]++;
            if (kind === 'stack') {
              /* the cushion follows the stack's wobble/flatten, plus its own BOING spring */
              _e.set(0, 0, anim.rot); _q.setFromEuler(_e); _v.set(cx, anim.dy, 0); _s.set(1, anim.sy, 1); _m.compose(_v, _q, _s);
              _m2.makeScale(anim.csxz, anim.csy, anim.csxz); _m2.setPosition(0, sz.stack.cushion - sz.stack.cushionH, 0);
              _m.multiply(_m2); cushion.setMatrixAt(nc, _m);
              _c.setScalar(1 + 0.25 * anim.twinkle); cushion.setColorAt(nc, _c);
              if (fx && anim.twinkle > 0.5 && !o.hit) fx.twinkle(cx + 0.18, sz.stack.cushion * anim.sy + 0.05, 0.3, anim.twinkle);
              nc++;
            } else if (kind === 'puddle') {
              const w = Math.sin(sT * Math.PI + i);
              setInst(ripples, nr, cx - 0.08, 0.02, 0.02, 0, 0, 0, sz.puddle.w * 0.24 * (1 + (reduced ? 0 : 0.18 * w)), 1, sz.puddle.d * 0.24 * (1 + (reduced ? 0 : 0.18 * w)));
              nr++;
            }
          }
          if (o.rehearsal && !o.hit && nd < 150) {
            M.rehearsalRect(o, sz, rect);
            const cnt = M.dashCount(rect);
            for (let d = 0; d < cnt && nd < 160; d++) { M.dashAt(rect, d, 0.14, dash); setInst(dashes, nd, dash.x, dash.y, 0.56, 0, 0, dash.a ? Math.PI / 2 : 0); nd++; }
          }
          if (o.cue && !o.passed && !o.hit && nq < CAP) {
            const sc = M.cueRingScale(sT, reduced);
            setInst(cues, nq, o.cueX / M.PX, 0.012, 0, 0, 0, 0, sc, 1, sc); nq++;
          }
        }
      }
      for (let k = 0; k < SOLID_KINDS.length; k++) { const mm = meshes[SOLID_KINDS[k]]; mm.count = n[SOLID_KINDS[k]]; commit(mm); }
      cushion.count = nc; commit(cushion, true);
      ripples.count = nr; commit(ripples);
      gatePosts.count = gateBoards.count = gateNeon.count = ng; commit(gatePosts); commit(gateBoards); commit(gateNeon, true);
      dashes.count = nd; commit(dashes);
      cues.count = nq; commit(cues);
    },
    dispose: function () {
      group.removeFromParent();
      Object.keys(meshes).forEach(function (k) { meshes[k].dispose(); });
      [cushion, ripples, gatePosts, gateBoards, gateNeon, dashes, cues].forEach(function (m) { m.dispose(); });
      disposeList(own);
    }
  };
}

/* ================================================================
   PICKUPS — snacks (one instancer per theme treat, also used for spilled
   treats and HUD zips), ✦ glow stars, holo ENCORE letter cards, the pearl
   Bubble Shield capsule
   ================================================================ */
function treatGeo(G, kind) {
  const L = [], P = function (g, hex) { return G.paint(g, col(hex)); };
  if (kind === 'fish') {                        /* ~110 tris each: these are drawn by the dozen */
    L.push(P(G.t(G.puff(0.12), { s: [1.25, 0.72, 0.5] }), '#FF8A5C'));
    L.push(P(G.t(G.cone(0.08, 0.12, 6), { r: [0, 0, 90], s: [1, 1, 0.4], p: [-0.19, 0, 0] }), '#FF6B3A'));
    L.push(P(G.t(gem(G, 0.02), { p: [0.08, 0.025, 0.055] }), '#3B2F4A'));
  } else if (kind === 'sweet') {
    L.push(P(G.puff(0.09), '#FF5C8A'));
    [-1, 1].forEach(function (s) { L.push(P(G.t(G.cone(0.065, 0.1, 6), { r: [0, 0, s * 90], s: [1, 1, 0.5], p: [s * 0.13, 0, 0] }), '#FFFFFF')); });
  } else {
    L.push(P(G.t(G.tube(0.035, 0.22, { radial: 6 }), { r: [0, 0, 90] }), '#FFF6E0'));
    [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(function (c) { L.push(P(G.t(gem(G, 0.052), { p: [c[0] * 0.11, c[1] * 0.04, 0] }), '#FFF6E0')); });
  }
  const geo = G.merge(L); L.forEach(function (g) { g.dispose(); });
  return geo;
}
function letterCanvas(ch) {
  const c = canvas2d(128, 128);
  if (!c) return null;
  const g = c.getContext('2d');
  function paint(fontOk) {
    g.clearRect(0, 0, 128, 128);
    const gr = g.createLinearGradient(0, 0, 128, 128);
    gr.addColorStop(0, '#FFB3E6'); gr.addColorStop(0.35, '#B3E5FF'); gr.addColorStop(0.7, '#C9FFE5'); gr.addColorStop(1, '#FFF3B3');
    g.fillStyle = gr; g.beginPath();
    if (g.roundRect) g.roundRect(4, 4, 120, 120, 18); else g.rect(4, 4, 120, 120);
    g.fill(); g.lineWidth = 6; g.strokeStyle = '#F6F1FF'; g.stroke();
    g.fillStyle = '#2B2140'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = (fontOk ? '400 84px "Bagel Fat One"' : '800 84px "Baloo 2"') + ', sans-serif';
    g.fillText(ch, 64, 70);
  }
  return { canvas: c, paint: paint };
}
export function makePickups(ctx) {
  const K = ctx.K, G = K.G, M = ctx.M, own = [], textures = [];
  const tGeo = treatGeo(G, ctx.look.treat); own.push(tGeo);
  const snacks = im(tGeo, K.mat('toon'), 72, 'snacks');
  const sGeo = sparkleGeo(G, 0.2, 0.06, 0.07, ctx.low);
  G.paintBy(sGeo, function (v) { return Math.abs(v.nz) > 0.6 ? col('#FFE36B').lerp(col('#FFFFFF'), 0.25) : col('#FFC93C'); });
  own.push(sGeo);
  const stars = im(sGeo, K.mat('state'), 16, 'glowStars');
  /* shield capsule: a pearl bubble with a tiny gold ✦ inside */
  const bubGeo = G.puff(0.18, { sphere: true }); own.push(bubGeo);
  const bubbles = im(bubGeo, K.mat('glass'), 2, 'shieldCaps'); bubbles.renderOrder = 3;
  const inGeo = G.paint(sparkleGeo(G, 0.08, 0.025, 0.03, true), col('#FFD23F')); own.push(inGeo);
  const inner = im(inGeo, K.mat('state'), 2, 'shieldStars');
  /* letter cards: pearl frame + a holo face on both sides (letter drawn once, redrawn when the font lands) */
  const frameGeo = G.slab(0.46, 0.6, 0.05, 0.05); own.push(frameGeo);
  const faceGeo = new THREE.PlaneGeometry(0.42, 0.56); own.push(faceGeo);
  const cards = [];
  const group = new THREE.Group(); group.name = 'pickups'; group.add(snacks, stars, bubbles, inner);
  'ENCORE'.split('').forEach(function (ch, li) {
    const g = new THREE.Group(); g.name = 'letter:' + ch + li; g.visible = false;
    g.add(single(frameGeo, K.mat('pearl'), 'cardFrame'));
    const lc = letterCanvas(ch);
    let mat;
    if (lc) {
      const tex = canvasTex(lc.canvas); textures.push(tex);
      withFont(function (ok) { lc.paint(ok); tex.needsUpdate = true; });
      mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
    } else mat = new THREE.MeshBasicMaterial({ color: col(M.COL.HOLO[li % 4]), toneMapped: false });
    own.push(mat);
    const f = new THREE.Mesh(faceGeo, mat); f.position.z = 0.027; g.add(f);
    const b = new THREE.Mesh(faceGeo, mat); b.position.z = -0.027; b.rotation.y = Math.PI; g.add(b);
    group.add(g); cards.push(g);
  });
  return {
    group: group, snacks: snacks, stars: stars, cards: cards,
    begin: function () { snacks.count = 0; stars.count = 0; bubbles.count = 0; inner.count = 0; for (let i = 0; i < 6; i++) cards[i].visible = false; },
    snack: function (x, y, z, rotY, s) { if (snacks.count >= 72) return; setInst(snacks, snacks.count, x, y, z, 0.25, rotY, 0, s); snacks.count++; },
    star: function (x, y, z, rotY, s) { if (stars.count >= 16) return; setInst(stars, stars.count, x, y, z, 0, rotY, 0, s); stars.count++; },
    shield: function (x, y, z, rotY) {
      if (bubbles.count >= 2) return;
      setInst(bubbles, bubbles.count, x, y, z); setInst(inner, inner.count, x, y, z, 0, rotY, 0);
      bubbles.count++; inner.count++;
    },
    card: function (li, x, y, z, rotY, s) { const c = cards[li]; if (!c) return; c.visible = true; c.position.set(x, y, z); c.rotation.set(0, rotY, 0); c.scale.setScalar(s); },
    end: function () { commit(snacks); commit(stars); commit(bubbles); commit(inner); },
    dispose: function () {
      group.removeFromParent();
      [snacks, stars, bubbles, inner].forEach(function (m) { m.dispose(); });
      cards.forEach(function (c) { c.traverse(function (o) { if (o.isInstancedMesh) o.dispose(); }); });
      textures.forEach(function (t) { t.dispose(); });
      disposeList(own);
    }
  };
}

/* ================================================================
   FX — the pooled particle billboards (solid + additive), halos, blob
   shadows and the in-world text stickers (PERFECT!, BOUNCE!, +3 …)
   ================================================================ */
function stickerAtlas(M) {
  const c = canvas2d(512, 512);
  if (!c) return null;
  const g = c.getContext('2d');
  const fills = [['#FFB3E6', '#B3E5FF', '#C9FFE5'], ['#C9FFE5', '#7BD88F'], ['#FF8FC8', '#FF4FB8'], ['#FFFFFF', '#FFF3B3'],
    ['#3DF2FF', '#B3E5FF'], ['#A66BFF', '#D9B8FF'], ['#FF4FB8', '#FFB3E6'], ['#C9FFE5', '#FFF3B3']];
  function paint(fontOk) {
    g.clearRect(0, 0, 512, 512);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    for (let r = 0; r < M.STICKERS.length; r++) {
      const y = r * 64 + 33, txt = M.STICKERS[r];
      let size = 50;
      do { g.font = (fontOk ? '400 ' + size + 'px "Bagel Fat One"' : '800 ' + size + 'px "Baloo 2"') + ', sans-serif'; size -= 2; } while (size > 14 && g.measureText(txt).width > 480);
      const gr = g.createLinearGradient(0, y - 24, 0, y + 24);
      fills[r].forEach(function (f, i) { gr.addColorStop(i / Math.max(1, fills[r].length - 1), f); });
      g.lineWidth = 9; g.strokeStyle = 'rgba(43,33,64,0.85)'; g.strokeText(txt, 256, y);
      g.fillStyle = gr; g.fillText(txt, 256, y);
    }
  }
  return { canvas: c, paint: paint };
}
export function makeFx(ctx, caps) {
  const K = ctx.K, M = ctx.M, own = [];
  /* the tier's particle budget (128/256/512) split between solid confetti and additive sparkles */
  const gcap = Math.max(32, Math.round(caps.particles / 3)), cap = Math.max(64, caps.particles - gcap);
  const solid = K.billboards({ capacity: cap, texture: 'sparkles', additive: false, name: 'fxSolid', renderOrder: 6 });
  const glow = K.billboards({ capacity: gcap, texture: 'sparkles', additive: true, name: 'fxGlow', renderOrder: 7 });
  const halos = K.billboards({ capacity: caps.halos, texture: 'halo', additive: true, fog: false, name: 'halos', renderOrder: 5 });
  const blobs = K.blobs(caps.blobs);
  [solid, glow, halos].forEach(function (p) { for (let i = 0; i < p.capacity; i++) { p.alloc(); p.set(i, 0, -99, 0, 0, null, 0, 0, 0); } p.commit(); });
  for (let i = 0; i < caps.blobs; i++) blobs.alloc();
  const simS = new M.ParticleSim(cap, 101), simG = new M.ParticleSim(gcap, 202);
  const parkS = new Uint8Array(cap).fill(1), parkG = new Uint8Array(gcap).fill(1);
  const group = new THREE.Group(); group.name = 'fx'; group.add(solid.mesh, glow.mesh, halos.mesh, blobs.mesh);
  /* stickers: 6 sprites over one atlas (clones share the GPU texture's source) */
  const atlas = stickerAtlas(M), stickers = [];
  if (atlas) {
    atlas.paint(false);
    const atlasTex = canvasTex(atlas.canvas); own.push(atlasTex);
    for (let i = 0; i < 6; i++) {
      const tx = atlasTex.clone(); tx.repeat.set(1, 1 / 8); tx.needsUpdate = true; own.push(tx);
      const sm = new THREE.SpriteMaterial({ map: tx, transparent: true, depthWrite: false, depthTest: false, toneMapped: false, fog: false }); own.push(sm);
      const sp = new THREE.Sprite(sm); sp.visible = false; sp.renderOrder = 9; group.add(sp);
      stickers.push({ sprite: sp, mat: sm, tex: tx, t: 99, life: 0.6, x: 0, y: 0, z: 0, w: 1, rise: 0.4 });
    }
    withFont(function (ok) { if (!ok) return; atlas.paint(true); atlasTex.needsUpdate = true; stickers.forEach(function (s) { s.tex.needsUpdate = true; }); });
  }
  let nextSticker = 0, haloN = 0, haloPrev = 0, blobN = 0, blobPrev = 0;
  const tmpC = new THREE.Color();
  /* live particles are written every frame; a dead slot is parked (zero size) once */
  function flush(pool, sim, park) {
    for (let i = 0; i < sim.cap; i++) {
      if (sim.on[i]) {
        tmpC.setRGB(sim.r[i], sim.gg[i], sim.b[i]);
        pool.set(i, sim.x[i], sim.y[i], sim.z[i], sim.size(i), tmpC, sim.a[i], sim.cell[i], sim.rot[i]);
        park[i] = 0;
      } else if (!park[i]) { pool.set(i, 0, -99, 0, 0, null, 0, 0, 0); park[i] = 1; }
    }
    pool.commit();
  }
  return {
    group: group, simS: simS, simG: simG, solid: solid, glow: glow,
    setScale: function (k) { simS.scale = k; simG.scale = k; },
    /* frame begin: halos and blobs are rewritten every frame */
    begin: function () { haloN = 0; blobN = 0; },
    halo: function (x, y, z, size, hexInt, alpha) {
      if (haloN >= halos.capacity || alpha <= 0.004) return;
      tmpC.setHex(hexInt); halos.set(haloN++, x, y, z, size, tmpC, Math.min(1, alpha), 0, 0);
    },
    twinkle: function (x, y, z, k) {
      if (haloN >= halos.capacity) return;
      tmpC.setHex(0xFFFFFF); halos.set(haloN++, x, y, z, 0.28 * k, tmpC, 0.8 * k, 0, 0);
    },
    blob: function (x, z, sx, sz) { if (blobN < caps.blobs) blobs.set(blobN++, x, -0.002, z, sx, sz); },
    sticker: function (row, x, y, z, w, life) {
      if (!stickers.length) return;
      const s = stickers[nextSticker]; nextSticker = (nextSticker + 1) % stickers.length;
      s.tex.offset.set(0, 1 - (row + 1) / 8); s.t = 0; s.life = life || 0.6; s.x = x; s.y = y; s.z = z; s.w = w || 1.2;
      s.sprite.visible = true;
    },
    step: function (dt, reduced) {
      simS.step(dt); simG.step(dt);
      for (let i = 0; i < stickers.length; i++) {
        const s = stickers[i];
        if (!s.sprite.visible) continue;
        s.t += dt;
        if (s.t >= s.life) { s.sprite.visible = false; continue; }
        const u = s.t / s.life;
        s.sprite.position.set(s.x, s.y + (reduced ? 0 : s.rise * M.outQuad(u)), s.z);
        const pop = reduced ? 1 : (u < 0.15 ? 0.6 + 0.4 * M.outBack(u / 0.15) : 1);
        s.sprite.scale.set(s.w * pop, s.w * pop / 8, 1);
        s.mat.opacity = u < 0.7 ? 1 : 1 - (u - 0.7) / 0.3;
      }
    },
    end: function () {
      flush(solid, simS, parkS); flush(glow, simG, parkG);
      for (let i = haloN; i < haloPrev; i++) halos.set(i, 0, -99, 0, 0, null, 0, 0, 0);
      haloPrev = haloN; halos.commit();
      for (let i = blobN; i < blobPrev; i++) blobs.set(i, 0, -99, 0, 0, 0);
      blobPrev = blobN; blobs.commit();
    },
    clear: function () { simS.clear(); simG.clear(); stickers.forEach(function (s) { s.sprite.visible = false; }); },
    dispose: function () { group.removeFromParent(); solid.dispose(); glow.dispose(); halos.dispose(); blobs.dispose(); disposeList(own); }
  };
}

/* ================================================================
   CURTAIN CALL — pastel pleated curtains that slide in from both sides
   (children of the camera, so they always frame the screen)
   ================================================================ */
export function makeCurtains(ctx) {
  const K = ctx.K, G = K.G, own = [];
  const pg = G.normalise(new THREE.PlaneGeometry(1, 1, 24, 1));
  const pos = pg.getAttribute('position');
  for (let i = 0; i < pos.count; i++) pos.setZ(i, 0.035 * Math.cos(pos.getX(i) * TAU * 6));
  pos.needsUpdate = true; pg.computeVertexNormals();
  const top = col('#FFB3E6'), bot = col('#E8A6FF');
  G.paintBy(pg, function (v) { return top.clone().lerp(bot, 0.5 - v.y); });
  own.push(pg);
  const vg = G.paint(G.t(G.slab(1, 0.12, 0.03, 0.02), {}), col('#FF8FC8')); own.push(vg);
  const left = single(pg, K.mat('toon'), 'curtainL'), right = single(pg, K.mat('toon'), 'curtainR'), val = single(vg, K.mat('toon'), 'valance');
  const group = new THREE.Group(); group.name = 'curtains'; group.add(left, right, val); group.visible = false;
  return {
    group: group,
    /* k = cover 0..1; the camera's fov/aspect size them at distance d */
    update: function (k, fovDeg, aspect) {
      group.visible = k > 0.001;
      if (!group.visible) return;
      const d = 1.0, hh = d * Math.tan(fovDeg * DEG / 2), hw = hh * aspect, w = 2 * hw * ctx.M.VIEW.CURTAIN_COVER;   /* 42 % each: the pet bows in the gap */
      setInst(left, 0, -hw - w / 2 + w * k, 0, -d, 0, 0, 0, w, hh * 2.1, 1); commit(left);
      setInst(right, 0, hw + w / 2 - w * k, 0, -d, 0, 0, 0, w, hh * 2.1, 1); commit(right);
      setInst(val, 0, 0, hh - 0.05 + (1 - k) * 0.3, -d + 0.01, 0, 0, 0, hw * 2.1, 1, 1); commit(val);
    },
    dispose: function () { group.removeFromParent(); left.dispose(); right.dispose(); val.dispose(); disposeList(own); }
  };
}

/* ================================================================
   BOUNCE BRIDGE set-piece — theme water on both sides + a friend
   (meadow frog, beach dolphin, snow icicles, candy gumdrops)
   ================================================================ */
export function makeBridge(ctx) {
  const K = ctx.K, G = K.G, M = ctx.M, lk = ctx.look, own = [];
  const water = col(lk.water), deep = col(lk.waterDeep);
  const wgeo = G.merge([
    G.paintBy(G.t(G.normalise(new THREE.PlaneGeometry(1, 5.2, 1, 4)), { r: [-90, 0, 0], p: [0, 0, 3.8] }), function (v) { return water.clone().lerp(deep, M.clamp01((v.z - 1.2) / 6)); }),
    G.paintBy(G.t(G.normalise(new THREE.PlaneGeometry(1, 6.0, 1, 4)), { r: [-90, 0, 0], p: [0, 0, -4.2] }), function (v) { return water.clone().lerp(deep, M.clamp01((-v.z - 1.2) / 6)); })
  ]); own.push(wgeo);
  const waterMesh = single(wgeo, K.mat('toon'), 'water');
  const group = new THREE.Group(); group.name = 'bridge'; group.add(waterMesh);
  /* the friend */
  let friend = null, friendGeo = null, extras = null, extrasGeo = null;
  if (lk.friend === 'frog') {
    friendGeo = G.merge([
      G.paint(G.t(G.tube(0.32, 0.32, 0.03, { radial: 14 }), { p: [0, 0, 0] }), col('#4FAE4C')),
      G.paint(G.t(G.puff(0.16, { sphere: true }), { s: [1.1, 0.8, 1], p: [0, 0.13, 0] }), col('#7BD88F')),
      G.paint(G.t(G.puff(0.06, { sphere: true }), { p: [-0.07, 0.25, 0.08] }), col('#FFFFFF')), G.paint(G.t(G.puff(0.06, { sphere: true }), { p: [0.07, 0.25, 0.08] }), col('#FFFFFF')),
      G.paint(G.t(G.puff(0.03), { p: [-0.07, 0.26, 0.13] }), col('#3B2F4A')), G.paint(G.t(G.puff(0.03), { p: [0.07, 0.26, 0.13] }), col('#3B2F4A'))
    ]);
  } else if (lk.friend === 'dolphin') {
    friendGeo = G.merge([
      G.paint(G.t(G.bean(0.13, 0.5), { r: [0, 0, 90] }), col('#7FB3DE')),
      G.paint(G.t(G.cone(0.08, 0.16, 6), { p: [0, 0.16, 0], s: [1, 1, 0.4] }), col('#5E93C2')),
      G.paint(G.t(G.cone(0.1, 0.12, 6), { r: [0, 0, 90], s: [1, 1, 0.3], p: [-0.42, 0, 0] }), col('#5E93C2')),
      G.paint(G.t(G.puff(0.025), { p: [0.27, 0.04, 0.09] }), col('#3B2F4A'))
    ]);
  } else if (lk.friend === 'icicles') {                      /* twinkling icicles under the ice bridge's front edge */
    const L = [];
    for (let i = 0; i < 52; i++) L.push(G.paint(G.t(G.cone(0.05, 0.16 + 0.1 * ((i * 7) % 3), 5), { r: [180, 0, 0], p: [i * 0.5, -0.36 - 0.05 * ((i * 7) % 3), 0] }), col('#DFF4FF')));
    friendGeo = G.merge(L); L.forEach(function (g) { g.dispose(); });
  } else {                                                     /* gumdrops bobbing on the chocolate river */
    const L = [], cs = ['#FF5C8A', '#FFD23F', '#C38BFF', '#7BD88F'];
    for (let i = 0; i < 8; i++) L.push(G.paint(G.t(G.puff(0.12), { s: [1, 0.8, 1], p: [i * 3.4, 0.06, (i % 2 ? 2.4 : -2.6) + (i % 3) * 0.4] }), col(cs[i % 4])));
    friendGeo = G.merge(L); L.forEach(function (g) { g.dispose(); });
  }
  own.push(friendGeo);
  friend = single(friendGeo, K.mat('toon'), 'friend'); group.add(friend);
  if (lk.friend === 'frog') {                                  /* lily pads on the stream */
    const L = [];
    for (let i = 0; i < 7; i++) L.push(G.paint(G.t(G.tube(0.22, 0.22, 0.02, { radial: 10 }), { p: [i * 3.8, 0, (i % 2 ? 2.2 : -2.4) + (i % 3) * 0.5] }), col('#5FBF55')));
    extrasGeo = G.merge(L); L.forEach(function (g) { g.dispose(); }); own.push(extrasGeo);
    extras = single(extrasGeo, K.mat('toon'), 'lilies'); group.add(extras);
  }
  group.visible = false;
  return {
    group: group,
    /* range = [x0, x1] world; petX for the frog's gaze; t for the dolphin; fx for icicle glints */
    update: function (range, camX, petX, t, reduced, fx) {
      const vis = range[1] > camX - 8 && range[0] < camX + 26;
      group.visible = vis;
      if (!vis) return;
      const w = range[1] - range[0] + 2;
      setInst(waterMesh, 0, (range[0] + range[1]) / 2, -0.27, 0, 0, 0, 0, w, 1, 1); commit(waterMesh);
      if (extras) { setInst(extras, 0, range[0] + 0.5, -0.255, 0); commit(extras); }
      if (lk.friend === 'frog') {
        const fx = (range[0] + range[1]) / 2, yaw = reduced ? 0 : Math.atan2(petX - fx, 2.4) * 0.8;
        setInst(friend, 0, fx, -0.24, 2.3, 0, yaw, 0, 1.4);
      } else if (lk.friend === 'dolphin') {
        const period = 4 * 4 * M.BEAT, u = reduced ? 0.5 : ((t % period) / period);
        const jump = u < 0.3 ? u / 0.3 : -1, x = camX + 2 + (jump >= 0 ? jump * 3.2 : 0), y = jump >= 0 ? -0.6 + 1.5 * M.arc(jump) : -1.2;
        setInst(friend, 0, x, y, -4.6, 0, 0, jump >= 0 ? (0.6 - 1.2 * jump) : 0, 1.3);
      } else if (lk.friend === 'icicles') {
        setInst(friend, 0, range[0], 0, 1.22);
        if (fx) {                                          /* each icicle glints once every 2 s (0.5 Hz) */
          const i0 = Math.max(0, Math.floor((camX - 6 - range[0]) / 0.5)), i1 = Math.min(51, Math.ceil((camX + 8 - range[0]) / 0.5));
          for (let i = i0; i <= i1; i++) {
            const g = reduced ? 0.35 : M.frac(t * 0.5 + i * 0.37);
            if (reduced || g < 0.12) fx.twinkle(range[0] + i * 0.5, -0.5, 1.26, reduced ? 0.35 : Math.sin(Math.PI * g / 0.12));
          }
        }
      } else setInst(friend, 0, range[0], -0.27, 0);
      commit(friend);
    },
    dispose: function () { group.removeFromParent(); waterMesh.dispose(); friend.dispose(); if (extras) extras.dispose(); disposeList(own); }
  };
}

/* ================================================================
   ACCESSORY HAT — the rig is built without its hat so the hat can pop
   off on a bump and land back on (same shapes/colours as the island rig)
   ================================================================ */
function tokOr(K, look, id, part, dflt) {
  try {
    const L = typeof window !== 'undefined' && window.SLIslandLook, lk = L && L.LOOK && L.LOOK[id], tok = lk && lk.colors && lk.colors[part];
    if (tok && K.has(tok)) return K.col(tok);
  } catch (e) { /* no look table: defaults */ }
  return K.has(dflt) ? K.col(dflt) : col('#C38BFF');
}
export function makeHat(ctx, accId) {
  const K = ctx.K, G = K.G, own = [];
  const group = new THREE.Group(); group.name = 'hat:' + accId;
  const inner = new THREE.Group(); group.add(inner);
  if (accId === 'acc_partyhat') {
    const cone = G.drop(0.07, 0.16, CONE_PROFILE), stripe = tokOr(K, null, 'acc_partyhat', 'stripe', 'Star Gold'), body = tokOr(K, null, 'acc_partyhat', 'cone', 'Grape');
    G.paintBy(cone, function (v) { return (v.y > 0.035 && v.y < 0.058) || (v.y > 0.085 && v.y < 0.105) ? stripe : body; }, { perFace: true });
    const pom = G.paint(G.t(G.puff(0.026), { p: [0, 0.16, 0] }), tokOr(K, null, 'acc_partyhat', 'pompom', 'Coral'));
    const geo = G.merge([cone, pom]); cone.dispose(); pom.dispose(); own.push(geo);
    inner.add(single(geo, K.mat('toon'), 'partyhat'));
    inner.position.set(0.012, -0.02, -0.01); inner.rotation.set(-8 * DEG, 0, 12 * DEG);
  } else if (accId === 'acc_crown') {
    const outer = G.tube(0.085, 0.08, 0.045, { radial: 12, open: true });
    const inn = flipFaces(G.tube(0.078, 0.074, 0.045, { radial: 12, open: true }));
    const pts = [];
    for (let k = 0; k < 5; k++) { const a = Math.PI / 2 + k * TAU / 5; pts.push(G.t(G.cone(0.022, 0.05, 6), { p: [0.082 * Math.cos(a), 0.047, 0.082 * Math.sin(a)] })); }
    const geo = G.merge([outer, inn].concat(pts)); [outer, inn].concat(pts).forEach(function (g) { g.dispose(); }); own.push(geo);
    const gem = G.paint(G.t(G.puff(0.016), { s: [1, 1, 0.6], p: [0, 0.004, 0.088] }), tokOr(K, null, 'acc_crown', 'gem', 'Rose Deep')); own.push(gem);
    inner.add(single(geo, K.mat('gold'), 'crown'), single(gem, K.mat('toon'), 'gem'));
    inner.position.set(0, 0.002, 0); inner.rotation.set(-8 * DEG, 0, 0);
  }
  return {
    group: group, id: accId,
    dispose: function () { group.removeFromParent(); inner.traverse(function (o) { if (o.isInstancedMesh) o.dispose(); }); disposeList(own); }
  };
}

/* ================================================================
   FALLBACK PET — simple primitives in the locked PETCOL colours, for when
   SL3D.makeRig is missing. Same facing (+z) and pose fields as the rig.
   ================================================================ */
export function makeFallbackPet(ctx, petId) {
  const K = ctx.K, G = K.G, own = [];
  const pc = function (part, dflt) { const t = 'PETCOL.' + petId + '.' + part; return K.has(t) ? K.col(t) : col(dflt); };
  const body = pc('body', '#e3b077'), dark = pc('dark', '#b8834f'), light = pc('light', '#f6d9b3'), nose = pc('nose', '#3b2f4a');
  const root = new THREE.Group(); root.name = 'pet:fallback';
  const base = new THREE.Group(); root.add(base);
  const mat = K.mat('toon');
  const add = function (geo, parent, name) { own.push(geo); const m = single(geo, mat, name); parent.add(m); return m; };
  add(G.merge([G.paint(G.t(G.bean(0.17, 0.18), { r: [90, 0, 0], s: [0.9, 0.78, 0.8], p: [0, 0.22, -0.01] }), body)]), base, 'body');
  const head = new THREE.Group(); head.position.set(0, 0.38, 0.17); base.add(head);
  const earGeo = petId === 'pet_bunny' ? G.paint(G.t(G.puff(0.05), { s: [0.85, 3, 0.5], p: [0, 0.14, 0] }), body)
    : petId === 'pet_kitten' || petId === 'pet_dragon' ? G.paint(G.t(G.cone(0.055, 0.11, 8), { s: [1, 1, 0.55], p: [0, 0.04, 0] }), petId === 'pet_dragon' ? dark : body)
      : G.paint(G.t(G.puff(0.075), { s: [0.42, 1.3, 0.85], p: [0, -0.07, 0] }), dark);
  add(G.merge([
    G.paint(G.puff(0.17, { sphere: true }), body),
    G.paint(G.t(G.puff(0.075), { s: [1.25, 0.8, 0.85], p: [0, -0.05, 0.12] }), light),
    G.paint(G.t(G.puff(0.022), { p: [0, -0.02, 0.18] }), nose),
    G.paint(G.t(G.puff(0.03), { s: [0.9, 1.15, 0.55], p: [-0.068, 0.02, 0.148] }), col('#3B2F4A')),
    G.paint(G.t(G.puff(0.03), { s: [0.9, 1.15, 0.55], p: [0.068, 0.02, 0.148] }), col('#3B2F4A'))
  ]), head, 'head');
  [-1, 1].forEach(function (s) { const e = new THREE.Group(); e.position.set(0.11 * s, 0.1, -0.01); head.add(e); e.add(single(earGeo, mat, 'ear')); });
  own.push(earGeo);
  const legGeo = G.paintBy(G.t(G.puff(0.048), { s: [1, 1.55, 1], p: [0, -0.056, 0] }), function (v) { return v.y < -0.1 ? light : body; }); own.push(legGeo);
  const legs = {};
  [['legFL', 0.085, 0.1], ['legFR', -0.085, 0.1], ['legBL', 0.085, -0.1], ['legBR', -0.085, -0.1]].forEach(function (l) {
    const g = new THREE.Group(); g.position.set(l[1], 0.13, l[2]); base.add(g); g.add(single(legGeo, mat, l[0])); legs[l[0]] = g;
  });
  const tail = new THREE.Group(); tail.position.set(0, 0.27, -0.2); base.add(tail);
  add(G.paint(G.t(G.puff(0.05), { s: [0.8, 1.6, 0.8], p: [0, 0.06, -0.03] }), petId === 'pet_dragon' ? body : dark), tail, 'tail');
  const BODY_Y = 0.22;
  return {
    root: root, fallback: true,
    setPose: function (p) {
      _e.set((p.pitch || 0) * DEG, (p.yaw || 0) * DEG, (p.roll || 0) * DEG, 'YXZ'); _q.setFromEuler(_e);
      const sy = p.sy || 1, c = BODY_Y * sy;
      _v.set(0, c, 0).applyQuaternion(_q);
      base.quaternion.copy(_q);
      base.position.set((p.x || 0) - _v.x, (p.y || 0) + c - _v.y, (p.z || 0) - _v.z);
      base.scale.set(p.sx || 1, sy, p.sz || 1);
      legs.legFL.rotation.x = -(p.legFL || 0) * DEG; legs.legFR.rotation.x = -(p.legFR || 0) * DEG;
      legs.legBL.rotation.x = -(p.legBL || 0) * DEG; legs.legBR.rotation.x = -(p.legBR || 0) * DEG;
      head.rotation.set((p.headPitch || 0) * DEG, (p.headYaw || 0) * DEG, (p.headRoll || 0) * DEG);
      tail.rotation.set((p.tailPitch || 0) * DEG, (p.tailYaw || 0) * DEG, 0);
    },
    setShow: function () {},
    hatAnchor: head,
    dispose: function () { root.removeFromParent(); root.traverse(function (o) { if (o.isInstancedMesh) o.dispose(); }); disposeList(own); }
  };
}

/* the child's chibi avatar when SL3D.makeAvatar is missing: a bean in the
   member colour, a white head with the emoji face, holding an Island Wand */
export function makeFallbackAvatar(ctx, user) {
  const K = ctx.K, G = K.G, own = [], hex = ctx.M.safeMember(user && user.color);
  const root = new THREE.Group(); root.name = 'avatar:fallback';
  const bodyGeo = G.merge([G.paint(G.t(G.bean(0.18, 0.22), { p: [0, 0.33, 0] }), col(hex)), G.paint(G.t(G.puff(0.24, { sphere: true }), { p: [0, 0.71, 0] }), col('#FFFFFF'))]);
  own.push(bodyGeo);
  const body = single(bodyGeo, K.mat('toon'), 'avatarBody'); root.add(body);
  const faceGeo = new THREE.PlaneGeometry(0.34, 0.34); own.push(faceGeo);
  const faceMat = new THREE.MeshBasicMaterial({ map: K.tex.emojiFace(user && user.avatar), transparent: true, alphaTest: 0.05, toneMapped: false }); own.push(faceMat);
  const face = new THREE.Mesh(faceGeo, faceMat); face.position.set(0, 0.72, 0.245); root.add(face);
  const wandGeo = G.merge([G.paint(G.t(G.tube(0.014, 0.2), { p: [0, 0.1, 0] }), col('#FFFFFF')), G.paint(G.t(sparkleGeo(G, 0.07, 0.025, 0.03, true), { p: [0, 0.24, 0] }), col(hex))]);
  own.push(wandGeo);
  const wand = single(wandGeo, K.mat('state'), 'avatarWand'); wand.position.set(-0.22, 0.42, 0.05); root.add(wand);
  return {
    root: root, fallback: true,
    play: function (clip, t, o) {
      const red = o && o.reduced;
      root.position.y = red ? 0 : 0.06 * Math.abs(Math.sin(t * Math.PI * 1.6));
      wand.rotation.z = red ? 0.4 : 0.4 + 0.35 * Math.sin(t * TAU * 0.8);
    },
    setWand: function () {}, setShow: function () {},
    dispose: function () { root.removeFromParent(); root.traverse(function (o) { if (o.isInstancedMesh) o.dispose(); }); disposeList(own); }
  };
}

export const ARCH = { yaw: ARCH_YAW };
