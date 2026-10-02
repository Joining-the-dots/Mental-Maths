/* ================================================================
   Encore Shootout 3D — scene builders (ES module).
   Pure construction: every builder takes the kit adapter A (makeKit) and
   returns plain handles {…, update/apply, dispose}; nothing here reads the
   game state or plays sounds. Geometry comes from the shared kit K (K.G
   primitives, the shared toon program); textures are drawn on canvases at
   runtime; every geometry, material and texture made here is disposed by
   A.dispose() (K's shared materials and cached parts are never touched).
   No PointLights / SpotLights: the spotlights are additive cones.
   Spec: docs/island3d/spec-penalty.json → threeDScene.
   ================================================================ */
import * as THREE from 'three';

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;
const INK = '#3B2F4A';

/* ================================================================
   KIT ADAPTER — the shared K plus ownership tracking for disposal
   ================================================================ */
export function makeKit(K, o) {
  o = o || {};
  const tier = K.tier || 'MID';
  const owned = new Set(), hulls = new Set(), cols = new Map();
  const A = {
    THREE, K, G: K.G, tier, low: tier === 'LOW', budget: o.budget || {}, quality: o.quality || { outlines: tier !== 'LOW', particleScale: 1, cones: true },
    SL3D: o.SL3D || null,
    outlines: tier !== 'LOW' && K.outlines !== false && (!o.quality || o.quality.outlines !== false),
    own(x) { if (x) owned.add(x); return x; },
    /* runtime colours: never a catalogue token, so they go through K.rgb */
    col(hex) {
      let c = cols.get(hex);
      if (!c) { c = K.rgb ? K.rgb(hex) : new THREE.Color(hex); cols.set(hex, c); }
      return c;
    },
    tone(hex, dL) {
      const key = hex + '|' + dL;
      let c = cols.get(key);
      if (!c) { c = K.tone ? K.tone(A.col(hex), dL) : A.col(hex).clone().offsetHSL(0, 0, dL); cols.set(key, c); }
      return c;
    },
    /* one-copy InstancedMesh so every static toon part shares the island's instanced toon program */
    im(geo, mat, n) {
      const m = new THREE.InstancedMesh(geo, mat, n || 1);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array((n || 1) * 3).fill(1), 3);
      return m;
    },
    toon(geo, name) {
      A.own(geo);
      const m = A.im(geo, K.mat('toon'));
      m.name = name || 'toon';
      return m;
    },
    basicVC(geo, name) {
      A.own(geo);
      const mat = A.own(new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, toneMapped: false }));
      const m = A.im(geo, mat);
      m.name = name || 'neon';
      return m;
    },
    hull(geo, w, n) {
      if (!A.outlines) return null;
      const h = A.im(geo, K.mat('outline:' + (w || 0.018)), n || 1);
      const ink = A.col(INK);
      for (let i = 0; i < (n || 1); i++) ink.toArray(h.instanceColor.array, i * 3);
      h.name = 'hull';
      hulls.add(h);
      return h;
    },
    setOutlines(on) { A.outlines = !!on && tier !== 'LOW'; hulls.forEach((h) => { h.visible = A.outlines; }); },
    canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; },
    canvasTex(c) {
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.needsUpdate = true;
      return A.own(t);
    },
    dispose() {
      owned.forEach((x) => { try { x.dispose(); } catch (e) { /* already gone */ } });
      owned.clear(); hulls.clear(); cols.clear();
    }
  };
  return A;
}
/* paint a non-indexed kit geometry with a raw colour (a THREE.Color) */
function paint(A, geo, hex) { return A.G.paint(geo, A.col(hex)); }
function plane(A, w, h, sx, sy) { return A.G.normalise(new THREE.PlaneGeometry(w, h, sx || 1, sy || 1)); }
function box(A, w, h, d, r) { return A.G.slab(w, h, d, r == null ? 0 : r); }
/* a tube between two points (kit tubes stand on y) */
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _q = new THREE.Quaternion();
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _s = new THREE.Vector3(), _e = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0), DOWN = new THREE.Vector3(0, -1, 0);
function rod(A, p0, p1, r, radial) {
  _a.set(p0[0], p0[1], p0[2]); _b.set(p1[0], p1[1], p1[2]); _d.subVectors(_b, _a);
  const len = _d.length() || 1e-3;
  const g = A.G.tube(r, r, len, { radial: radial || 6 });
  _q.setFromUnitVectors(UP, _d.normalize());
  _m.compose(_a.add(_b).multiplyScalar(0.5), _q, _s.set(1, 1, 1));
  g.applyMatrix4(_m);
  return g;
}

/* ================================================================
   SKY — gradient dome, star field (Showtime / Night) and cloud puffs
   ================================================================ */
export function buildSky(A, o) {
  const group = new THREE.Group(); group.name = 'sky';
  const uni = { uTop: { value: new THREE.Color() }, uMid: { value: new THREE.Color() }, uHor: { value: new THREE.Color() } };
  const domeGeo = A.own(new THREE.SphereGeometry(90, 24, 12));
  const domeMat = A.own(new THREE.ShaderMaterial({
    uniforms: uni, side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false,
    vertexShader: 'varying float vH; void main(){ vH = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uHor; varying float vH;\n' +
      'void main(){ float h = max(vH, 0.0); vec3 c = mix(uHor, uMid, smoothstep(0.0, 0.22, h)); c = mix(c, uTop, smoothstep(0.22, 0.75, h));\n' +
      ' gl_FragColor = vec4(c, 1.0);\n #include <tonemapping_fragment>\n #include <colorspace_fragment>\n}'
  }));
  const dome = new THREE.Mesh(domeGeo, domeMat);
  dome.renderOrder = -10; dome.frustumCulled = false; dome.name = 'dome';
  group.add(dome);
  /* stars: 2 px points that twinkle slowly (sin(t·2 + id) ≈ 0.3 Hz) */
  const n = Math.max(60, (A.budget.stars | 0) || (A.low ? 120 : 250));
  const pos = new Float32Array(n * 3), ids = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const az = (i * 137.508) * DEG, el = (10 + 70 * (((i * 7919) % 1000) / 1000)) * DEG, r = 82;
    pos[i * 3] = Math.cos(el) * Math.sin(az) * r; pos[i * 3 + 1] = Math.sin(el) * r; pos[i * 3 + 2] = -Math.abs(Math.cos(el) * Math.cos(az)) * r;
    ids[i] = i * 1.37;
  }
  const sg = A.own(new THREE.BufferGeometry());
  sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  sg.setAttribute('aId', new THREE.BufferAttribute(ids, 1));
  const starUni = { uTime: { value: 0 }, uOpacity: { value: 0 }, uSize: { value: 2 } };
  const starMat = A.own(new THREE.ShaderMaterial({
    uniforms: starUni, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
    vertexShader: 'attribute float aId; uniform float uTime; uniform float uSize; varying float vA;\n' +
      'void main(){ vA = 0.6 + 0.4 * sin(uTime * 2.0 + aId); gl_PointSize = uSize; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform float uOpacity; varying float vA;\n' +
      'void main(){ vec2 d = gl_PointCoord - 0.5; if (dot(d, d) > 0.25) discard; gl_FragColor = vec4(vec3(1.0, 0.97, 0.85) * vA * uOpacity, 1.0); }'
  }));
  const stars = new THREE.Points(sg, starMat);
  stars.frustumCulled = false; stars.renderOrder = -9; stars.visible = false;
  group.add(stars);
  /* clouds: puffy merged icospheres, drifting at 0.08 u/s */
  const G = A.G;
  const cl = [];
  [[0, 0, 0, 1.4], [1.3, -0.15, 0.2, 1.05], [-1.25, -0.2, 0.1, 1.0], [0.5, 0.45, -0.1, 0.95], [-0.5, 0.35, 0.2, 0.8]].forEach((p) => {
    cl.push(paint(A, G.t(G.puff(p[3]), { p: [p[0], p[1], p[2]] }), '#FFFFFF'));
  });
  const cloudGeo = G.merge(cl); cl.forEach((g) => g.dispose());
  const clouds = A.im(A.own(cloudGeo), A.K.mat('toon'), 5);
  clouds.name = 'clouds'; clouds.frustumCulled = false;
  const cloudSeed = [[-26, 11, -42, 1.4], [-6, 13.5, -48, 1.1], [14, 10.5, -40, 1.25], [30, 12.5, -46, 1.0], [44, 11, -50, 1.2]];
  group.add(clouds);
  let drift = 0;
  function placeClouds() {
    for (let i = 0; i < 5; i++) {
      const c = cloudSeed[i];
      let x = c[0] + drift;
      x = ((x + 60) % 120 + 120) % 120 - 60;
      _m.compose(_a.set(x, c[1], c[2]), _q.identity(), _s.set(c[3] * 1.6, c[3], c[3]));
      clouds.setMatrixAt(i, _m);
    }
    clouds.instanceMatrix.needsUpdate = true;
  }
  placeClouds();
  return {
    group, dome, stars, clouds,
    update(dt, t, pre, reduced, pixelRatio) {
      uni.uTop.value.setRGB(pre.top[0], pre.top[1], pre.top[2], THREE.SRGBColorSpace);
      uni.uMid.value.setRGB(pre.mid[0], pre.mid[1], pre.mid[2], THREE.SRGBColorSpace);
      uni.uHor.value.setRGB(pre.hor[0], pre.hor[1], pre.hor[2], THREE.SRGBColorSpace);
      starUni.uOpacity.value = pre.stars;
      stars.visible = pre.stars > 0.01;
      starUni.uTime.value = reduced ? 0 : t;
      starUni.uSize.value = 2 * (pixelRatio || 1);
      if (!reduced && dt > 0) { drift += 0.08 * dt; placeClouds(); }
    }
  };
}

/* ================================================================
   STADIUM — pitch with mow stripes and line strips, stands, roof, LED
   frame, truss towers, touchline boards and the stadium's dressing,
   merged into one toon mesh (+ one unlit mesh for lamp lenses)
   ================================================================ */
export function buildStadium(A, o) {
  const G = A.G, look = o.look, id = o.id, group = new THREE.Group();
  group.name = 'stadium';
  const parts = [], neon = [];
  /* ground: an apron in the verge colour, the pitch in stripes ±6 % every 1.2 u */
  parts.push(paint(A, G.t(plane(A, 110, 110), { r: [-90, 0, 0], p: [0, -0.02, 0] }), look.verge));
  const pitch = G.t(plane(A, 30, 24, 1, 20), { r: [-90, 0, 0], p: [0, 0, 7.5] });
  const g1 = A.tone(look.grass, 0.06), g2 = A.tone(look.grass, -0.06);
  G.paintBy(pitch, (v) => ((Math.floor((v.z + 4.5) / 1.2) % 2 + 2) % 2 ? g1 : g2), { perFace: true });
  parts.push(pitch);
  /* white line strips (≥ 0.06 u): goal line, 6-yard box, penalty box, spot */
  const W = 0.08, ly = 0.006;
  const line = (x0, z0, x1, z1) => {
    const w = Math.abs(x1 - x0) || W, d = Math.abs(z1 - z0) || W;
    parts.push(paint(A, G.t(box(A, w, 0.012, d), { p: [(x0 + x1) / 2, ly, (z0 + z1) / 2] }), '#FFFFFF'));
  };
  line(-14, 0, 14, 0);
  line(-5, 0, -5, 2.6); line(5, 0, 5, 2.6); line(-5, 2.6, 5, 2.6);
  line(-8.6, 0, -8.6, 9.6); line(8.6, 0, 8.6, 9.6); line(-8.6, 9.6, 8.6, 9.6);
  parts.push(paint(A, G.t(G.tube(0.13, 0.012, { radial: 14 }), { p: [0, ly, 7.5] }), '#FFFFFF'));
  /* the back stand: 3 tiers, back wall, roof canopy with columns */
  const standCol = look.night ? '#4A4380' : '#E6DFF2', riser = A.tone(standCol, -0.08);
  for (let r = 0; r < 3; r++) {
    const top = 0.6 + 0.7 * r, zc = -5.45 - 0.9 * r, seat = A.col(look.seat[r % look.seat.length]);
    const t = G.t(box(A, 15, top, 0.9, 0.03), { p: [0, top / 2, zc] });
    G.paintBy(t, (v) => (v.ny > 0.7 ? seat : v.nz > 0.7 ? riser : A.col(standCol)));
    parts.push(t);
  }
  parts.push(paint(A, G.t(box(A, 15.4, 2.9, 0.3, 0.03), { p: [0, 1.45, -8.05] }), standCol));
  parts.push(paint(A, G.t(box(A, 15.6, 0.12, 2.6, 0.03), { p: [0, 3.05, -6.85] }), look.night ? '#3A3470' : '#FFFFFF'));
  [-7.5, 7.5].forEach((x) => { [-5.75, -7.9].forEach((z) => parts.push(paint(A, G.t(G.tube(0.07, 3.0, { radial: 8 }), { p: [x, 1.5, z] }), '#CFC8DC'))); });
  /* LED frame on the roof (the board's planes sit in front of it) */
  parts.push(paint(A, G.t(box(A, 7.4, 1.0, 0.2, 0.06), { p: [0, 3.6, -6.62] }), '#2B2140'));
  /* side stands: 2 tiers each, facing the pitch */
  [-1, 1].forEach((sd) => {
    for (let r = 0; r < 2; r++) {
      const top = 0.45 + 0.6 * r, seat = A.col(look.seat[(r + 1) % look.seat.length]);
      const t = G.t(box(A, 0.8, top, 8.4, 0.03), { p: [sd * (8.6 + 0.8 * r), top / 2, 0] });
      G.paintBy(t, (v) => (v.ny > 0.7 ? seat : Math.abs(v.nx) > 0.7 ? riser : A.col(standCol)));
      parts.push(t);
    }
  });
  /* touchline boards in holo pastels (no logos) */
  const holo = ['#FFB3E6', '#B3E5FF', '#C9FFE5', '#FFF3B3'];
  for (let i = 0; i < 6; i++) {
    parts.push(paint(A, G.t(box(A, 2.3, 0.45, 0.08, 0.03), { p: [-7 + 2.33 * (i + 0.5), 0.225, -4.35] }), holo[i % 4]));
    [-1, 1].forEach((sd) => parts.push(paint(A, G.t(box(A, 0.08, 0.45, 1.6, 0.03), { p: [sd * 7.6, 0.225, -3.4 + 1.65 * i] }), holo[(i + 2) % 4])));
  }
  /* truss towers: 4 poles, rungs, a lamp housing; the lens is neon */
  o.towers.forEach((tw, i) => {
    const h = tw[1] + 0.2, x = tw[0], z = tw[2];
    [[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]].forEach((c) => parts.push(paint(A, G.t(G.tube(0.045, h, { radial: 6 }), { p: [x + c[0], h / 2, z + c[1]] }), '#DDE3F0')));
    for (let y = 0.9; y < h - 0.3; y += 0.9) {
      parts.push(paint(A, rod(A, [x - 0.22, y, z + 0.22], [x + 0.22, y + 0.45, z + 0.22], 0.025, 4), '#C7B8FF'));
      parts.push(paint(A, rod(A, [x - 0.22, y + 0.45, z - 0.22], [x + 0.22, y, z - 0.22], 0.025, 4), '#C7B8FF'));
    }
    parts.push(paint(A, G.t(box(A, 0.75, 0.42, 0.55, 0.06), { p: [x, h + 0.15, z] }), '#3B2F4A'));
    neon.push(paint(A, G.t(G.tube(0.24, 0.05, { radial: 12 }), { r: [90, 0, 0], p: [x, h + 0.15, z + 0.29] }), ['#FF4FB8', '#3DF2FF', '#A66BFF'][i % 3]));
  });
  /* dressing per stadium */
  if (look.flood) {
    o.floods.forEach((f) => {
      const x = f[0], z = f[2], h = f[1];
      parts.push(paint(A, G.t(G.tube(0.09, h, { radial: 8 }), { p: [x, h / 2, z] }), '#9AA3B8'));
      const yaw = Math.atan2(-x, 3 - z) / DEG;
      const head = G.t(G.t(box(A, 1.2, 0.7, 0.25, 0.05), { r: [28, 0, 0] }), { r: [0, yaw, 0], p: [x, h + 0.2, z] });
      parts.push(paint(A, head, '#3B2F4A'));
      neon.push(paint(A, G.t(G.t(box(A, 1.0, 0.5, 0.06, 0.03), { r: [28, 0, 0], p: [0, -0.06, 0.13] }), { r: [0, yaw, 0], p: [x, h + 0.2, z] }), '#FFF6C8'));
    });
  }
  if (look.palms) {
    [[-11.6, -2.6, 1], [11.8, -1.6, -1]].forEach((p) => {
      let x = p[0], y = 0;
      for (let k = 0; k < 6; k++) {
        const nx = x + p[2] * 0.12 * k * 0.4;
        parts.push(paint(A, rod(A, [x, y, p[1]], [nx, y + 0.72, p[1]], 0.16 - 0.015 * k, 7), k % 2 ? '#A8774A' : '#B98552'));
        x = nx; y += 0.72;
      }
      for (let f = 0; f < 7; f++) {
        const a = f / 7 * 360;
        const leaf = G.t(G.t(G.puff(0.5), { s: [1.9, 0.12, 0.5], p: [0.85, -0.18, 0] }), { r: [0, 0, -18] });
        parts.push(paint(A, G.t(leaf, { r: [0, a, 0], p: [x, y + 0.05, p[1]] }), f % 2 ? '#3FB36A' : '#55C878'));
      }
      [0, 120, 240].forEach((a) => parts.push(paint(A, G.t(G.puff(0.13), { p: [x + 0.2 * Math.cos(a * DEG), y - 0.15, p[1] + 0.2 * Math.sin(a * DEG)] }), '#8A5A33')));
    });
    parts.push(paint(A, G.t(plane(A, 140, 34), { r: [-90, 0, 0], p: [0, -0.01, -27] }), '#7FE3F0'));
    parts.push(paint(A, G.t(box(A, 140, 0.03, 0.6), { p: [0, 0.0, -10.2] }), '#F2FCFF'));
  }
  if (look.snow) {
    const banks = [[-6, -4.75], [-3, -4.8], [0, -4.85], [3, -4.8], [6, -4.75], [-7.9, -1.5], [-7.9, 2.5], [7.9, -1], [7.9, 3], [-11, 6], [11, 6]];
    banks.forEach((b, i) => {
      const s = 0.85 + 0.25 * ((i * 37) % 10) / 10;
      const g = G.t(G.puff(0.6), { s: [1.5 * s, 0.42 * s, 0.75 * s], p: [b[0], 0.08, b[1]] });
      G.paintBy(g, (v) => (v.ny < -0.2 ? A.col('#DCEBFF') : A.col('#FFFFFF')));
      parts.push(g);
    });
    parts.push(paint(A, G.t(box(A, 15.6, 0.14, 2.6, 0.06), { p: [0, 3.17, -6.85] }), '#FFFFFF'));
  }
  if (!look.night && !look.snow) {
    /* bunting along the roof edge */
    for (let i = 0; i < 18; i++) {
      const x = -7.2 + 14.4 * (i + 0.5) / 18;
      parts.push(paint(A, G.t(G.cone(0.16, 0.32, 3), { r: [180, 0, 0], p: [x, 2.82, -5.62] }), holo[i % 4]));
    }
  }
  const geo = G.merge(parts); parts.forEach((g) => g.dispose());
  const mesh = A.toon(geo, 'stadium');
  group.add(mesh);
  let lamps = null;
  if (neon.length) {
    const ng = G.merge(neon); neon.forEach((g) => g.dispose());
    lamps = A.basicVC(ng, 'lamps');
    group.add(lamps);
  }
  return { group, mesh, lamps, id };
}

/* ================================================================
   GOAL — the frame as ONE instanced unit tube (posts, bar, supports) so a
   post can wobble on its own; the net shares one position buffer between
   a 0.25-opacity plane (MID/HIGH) and LineSegments, CPU-displaced at the back
   ================================================================ */
export function buildGoal(A, o) {
  const G = A.G, group = new THREE.Group(); group.name = 'goal';
  const P = o.post, B = o.bar, D = o.depth, NT = o.netTop, R = 0.07, r2 = 0.035;
  const unit = A.own(paint(A, G.tube(1, 1, 1, { radial: A.low ? 8 : 12 }), '#FFFFFF'));
  /* [from, to, radius] in world units */
  const segs = [
    [[-P, 0, 0], [-P, B + R, 0], R], [[P, 0, 0], [P, B + R, 0], R], [[-P - R, B, 0], [P + R, B, 0], R],
    [[-P, B, 0], [-P, NT, -D], r2], [[P, B, 0], [P, NT, -D], r2],
    [[-P, NT, -D], [-P, 0, -D], r2], [[P, NT, -D], [P, 0, -D], r2],
    [[-P, r2, -D], [P, r2, -D], r2], [[-P, NT, -D], [P, NT, -D], r2],
    [[-P, r2, 0], [-P, r2, -D], r2], [[P, r2, 0], [P, r2, -D], r2]
  ];
  const n = segs.length, frame = A.im(unit, A.K.mat('toon'), n);
  frame.name = 'frame';
  const base = segs.map((sg) => {
    _a.set(sg[0][0], sg[0][1], sg[0][2]); _b.set(sg[1][0], sg[1][1], sg[1][2]); _d.subVectors(_b, _a);
    const len = _d.length();
    const q = new THREE.Quaternion().setFromUnitVectors(UP, _d.clone().normalize());
    return { pos: _a.clone().add(_b).multiplyScalar(0.5), q, len, r: sg[2] };
  });
  /* wob: thickness factor; off: a sideways shiver (x for a post, y for the bar) */
  const _p = new THREE.Vector3();
  function writeSeg(i, wob, off) {
    const s = base[i];
    _p.copy(s.pos);
    if (off) { if (i === 2) _p.y += off; else _p.x += off; }
    _m.compose(_p, s.q, _s.set(s.r * wob, s.len, s.r * wob));
    frame.setMatrixAt(i, _m);
  }
  for (let i = 0; i < n; i++) writeSeg(i, 1);
  frame.instanceMatrix.needsUpdate = true;
  frame.computeBoundingSphere();
  group.add(frame);
  const hull = A.hull(unit, 0.018, n);
  if (hull) { hull.instanceMatrix.copyArray(frame.instanceMatrix.array); hull.instanceMatrix.needsUpdate = true; hull.computeBoundingSphere(); group.add(hull); }

  /* ---- the net: back grid (12×6), top (12×2), two sides (2×6) in one buffer ---- */
  const CX = 12, CY = 6, verts = [], idxTri = [], idxLine = [];
  function grid(cols, rows, at) {
    const start = verts.length / 3;
    for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) { const p = at(i / cols, j / rows); verts.push(p[0], p[1], p[2]); }
    const row = cols + 1;
    for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
      const k = start + j * row + i;
      if (i < cols) idxLine.push(k, k + 1);
      if (j < rows) idxLine.push(k, k + row);
      if (i < cols && j < rows) idxTri.push(k, k + 1, k + row, k + 1, k + row + 1, k + row);
    }
    return start;
  }
  const backStart = grid(CX, CY, (u, v) => [-P + 2 * P * u, NT * v, -D]);
  grid(CX, 2, (u, v) => [-P + 2 * P * u, B + (NT - B) * v, -D * v]);
  [-1, 1].forEach((sd) => grid(2, CY, (u, v) => [sd * P, (B + (NT - B) * u) * v, -D * u]));
  const posArr = new Float32Array(verts), posAttr = new THREE.BufferAttribute(posArr, 3);
  posAttr.setUsage(THREE.DynamicDrawUsage);
  const lineGeo = A.own(new THREE.BufferGeometry());
  lineGeo.setAttribute('position', posAttr); lineGeo.setIndex(idxLine);
  lineGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, NT / 2, -D / 2), 4.2);
  const lineMat = A.own(new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 }));
  const lines = new THREE.LineSegments(lineGeo, lineMat);
  lines.name = 'netLines'; lines.renderOrder = 1;
  group.add(lines);
  let netPlane = null;
  if (!A.low) {
    const pg = A.own(new THREE.BufferGeometry());
    pg.setAttribute('position', posAttr); pg.setIndex(idxTri);
    pg.boundingSphere = lineGeo.boundingSphere.clone();
    const pm = A.own(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false }));
    netPlane = new THREE.Mesh(pg, pm);
    netPlane.name = 'netPlane'; netPlane.renderOrder = 0;
    group.add(netPlane);
  }
  const backN = (CX + 1) * (CY + 1);
  let rippling = false;
  return {
    group, frame, hull, lines, netPlane, segs: n,
    /* post / bar wobble: 0 left post, 1 right post, 2 bar; k = sin(10 Hz)·decay in −1..1
       (thickness 1.08× plus a 0.03 u shiver: motion, not flashing) */
    wobble(which, k) {
      for (let i = 0; i < 3; i++) writeSeg(i, i === which ? 1 + 0.08 * Math.abs(k) : 1, i === which ? 0.03 * k : 0);
      frame.instanceMatrix.needsUpdate = true;
      if (hull) { hull.instanceMatrix.copyArray(frame.instanceMatrix.array); hull.instanceMatrix.needsUpdate = true; }
    },
    /* displace the back net with fn(x, y, u, v) → dz; returns false once at rest */
    ripple(fn) {
      if (!fn) {
        if (!rippling) return false;
        for (let k = 0; k < backN; k++) posArr[(backStart + k) * 3 + 2] = -D;
        rippling = false; posAttr.needsUpdate = true;
        return false;
      }
      for (let j = 0; j <= CY; j++) for (let i = 0; i <= CX; i++) {
        const k = backStart + j * (CX + 1) + i, x = posArr[k * 3], y = posArr[k * 3 + 1];
        posArr[k * 3 + 2] = -D + fn(x, y, i / CX, j / CY);
      }
      rippling = true; posAttr.needsUpdate = true;
      return true;
    },
    setNetPlane(on) { if (netPlane) netPlane.visible = !!on; }
  };
}

/* ================================================================
   CROWD — 3 InstancedMeshes (body, wand handle, wand bulb) built from
   SL3D.makeFanBlob's crowd shape (recoloured white so one mesh carries all
   the pastel bodies), or kit primitives when the character chunk is missing
   ================================================================ */
export function buildCrowd(A, layout, o) {
  const G = A.G, S = o.SL3D, n = layout.length;
  let bodyGeo = null, handleGeo = null, bulbGeo = null, holderY = 0.15, holderZ = 0.06, holderX = 0.11, bulbY = 0.12;
  let fan = null;
  try { fan = S && typeof S.makeFanBlob === 'function' ? S.makeFanBlob(1, A.tier) : null; } catch (e) { fan = null; }
  if (fan && fan.userData && fan.userData.geos && fan.userData.geos.body) {
    const ud = fan.userData;
    bodyGeo = ud.geos.body.clone();
    const bc = A.col(ud.colors && ud.colors.body ? ud.colors.body : '#FFB3E6'), c = bodyGeo.getAttribute('color');
    if (c) {
      for (let i = 0; i < c.count; i++) {
        const dr = c.getX(i) - bc.r, dg = c.getY(i) - bc.g, db = c.getZ(i) - bc.b;
        if (dr * dr + dg * dg + db * db < 0.004) c.setXYZ(i, 1, 1, 1);
      }
      c.needsUpdate = true;
    }
    handleGeo = ud.geos.wandHandle || null; bulbGeo = ud.geos.wandBulb || null;   /* the kit's cached parts: shared, not owned */
    try { ud.dispose(); } catch (e) { /* nothing to free */ }
  }
  if (!bodyGeo) {
    const list = [paint(A, G.t(G.tube(0.1, 0.12, 0.2, { radial: 7 }), { p: [0, 0.1, 0] }), '#FFFFFF'),
      paint(A, G.t(G.cone(0.1, 0.07, 7), { p: [0, 0.235, 0] }), '#FFFFFF')];
    [-1, 1].forEach((sx) => list.push(paint(A, G.t(G.puff(0.018), { s: [0.8, 1.2, 0.5], p: [0.04 * sx, 0.17, 0.11] }), INK)));
    bodyGeo = G.merge(list); list.forEach((g) => g.dispose());
  }
  A.own(bodyGeo);
  if (!handleGeo) handleGeo = A.own(paint(A, G.t(G.tube(0.011, 0.11, { radial: 4 }), { p: [0, 0.055, 0] }), '#FFFFFF'));
  if (!bulbGeo) {
    const bl = [G.t(G.cone(0.032, 0.045, 4), { p: [0, 0.1325, 0] }), G.t(G.cone(0.032, 0.045, 4), { r: [180, 0, 0], p: [0, 0.0875, 0] })];
    bulbGeo = A.own(G.merge(bl)); bl.forEach((g) => g.dispose());
  }
  const bodies = A.im(bodyGeo, A.K.mat('toon'), n);
  const handles = A.im(handleGeo, A.K.mat('toon'), n);
  const bulbMat = A.own(new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
  const bulbs = A.im(bulbGeo, bulbMat, n);
  [bodies, handles, bulbs].forEach((m) => { m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; });
  bodies.name = 'crowd'; handles.name = 'crowdWands'; bulbs.name = 'crowdBulbs';
  const fanBody = o.fanBody, wandCols = o.wandCols, sig = A.col(o.sig);
  const bodyC = fanBody.map((h) => A.col(h)), wandC = wandCols.map((h) => A.col(h));
  const yaw = new Float32Array(n), wandColor = [];
  for (let i = 0; i < n; i++) {
    const f = layout[i];
    bodyC[f.body].toArray(bodies.instanceColor.array, i * 3);
    wandColor[i] = f.wand < 0 ? sig : wandC[f.wand];
    yaw[i] = f.side === 0 ? 0 : f.side < 0 ? Math.PI / 2 : -Math.PI / 2;
  }
  bodies.instanceColor.needsUpdate = true;
  const qB = new THREE.Quaternion(), qW = new THREE.Quaternion(), pB = new THREE.Vector3(), sB = new THREE.Vector3();
  const mB = new THREE.Matrix4(), mH = new THREE.Matrix4(), hp = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  const tip = new THREE.Vector3(), cTmp = new THREE.Color();
  let shown = n;
  const group = new THREE.Group(); group.name = 'crowdGroup';
  group.add(bodies, handles, bulbs);
  return {
    group, bodies, handles, bulbs, count: n,
    setShown(k) { shown = Math.max(1, Math.min(n, k | 0)); bodies.count = handles.count = bulbs.count = shown; },
    /* ctx: {lift(i) → extra y, level: Float32Array (wand up 0..1), bright: Float32Array (0..1), sway: amplitude,
             bob: amplitude, t, bpm, reduced, halos: pool|null, haloIdx: Int32Array, haloSize, haloAlpha} */
    update(ctx) {
      const t = ctx.t, beat = (ctx.bpm || 112) / 60, red = ctx.reduced;
      for (let i = 0; i < shown; i++) {
        const f = layout[i], ph = f.ph;
        const bob = red ? 0 : ctx.bob * (1 - ((t * beat + ph * 0.25) % 1)) ** 2;
        const lift = ctx.lift ? ctx.lift(i) : 0;
        const lean = red ? 0 : (ph - 0.5) * 0.16;
        pB.set(f.x, f.y + bob + lift, f.z);
        _e.set(0, yaw[i], lean);
        qB.setFromEuler(_e);
        sB.set(f.s, f.s * (red ? 1 : 1 + 0.04 * Math.cos(TAU * ((t * beat + ph) % 1))), f.s);
        mB.compose(pB, qB, sB);
        bodies.setMatrixAt(i, mB);
        /* the wand pivots at the paw: lowered = tipped down, raised = upright and swaying */
        const lv = ctx.level[i], sw = red ? 0 : ctx.sway * Math.sin(TAU * (beat * 0.5) * t + ph * TAU) * lv;
        hp.set(holderX * f.hand, holderY, holderZ);
        _e.set((1 - lv) * 1.45, 0, -sw * f.hand);
        qW.setFromEuler(_e);
        mH.compose(hp, qW, one);
        _m2.multiplyMatrices(mB, mH);
        handles.setMatrixAt(i, _m2);
        bulbs.setMatrixAt(i, _m2);
        const br = ctx.bright[i];
        cTmp.copy(wandColor[i]).multiplyScalar(0.22 + 0.78 * br);
        cTmp.toArray(bulbs.instanceColor.array, i * 3);
        if (ctx.halos && ctx.haloIdx[i] >= 0) {
          tip.set(0, bulbY, 0).applyMatrix4(_m2);
          ctx.halos.set(ctx.haloIdx[i], tip.x, tip.y, tip.z, ctx.haloSize * f.s, wandColor[i], ctx.haloAlpha * br * lv, 0, 0);
        }
      }
      bodies.instanceMatrix.needsUpdate = true; handles.instanceMatrix.needsUpdate = true;
      bulbs.instanceMatrix.needsUpdate = true; bulbs.instanceColor.needsUpdate = true;
    },
    /* the world position just above fan i (where a caught ball sits) */
    headPos(i, out) { const f = layout[i]; return out.set(f.x, f.y + 0.3 * f.s, f.z); }
  };
}

/* ================================================================
   LED RIBBON BOARD — a scrolling message (512×64, RepeatWrapping, UV
   scroll) above 8 kick pips (256×32, redrawn once per kick)
   ================================================================ */
function bagel() {
  try { return !!(document.fonts && document.fonts.check('40px "Bagel Fat One"')); } catch (e) { return false; }
}
export function buildLed(A) {
  const group = new THREE.Group(); group.name = 'led';
  const tc = A.canvas(512, 64), pc = A.canvas(256, 32);
  const tt = A.canvasTex(tc), pt = A.canvasTex(pc);
  tt.wrapS = THREE.RepeatWrapping; tt.repeat.set(2, 1);
  tt.minFilter = THREE.LinearFilter; tt.generateMipmaps = false; pt.generateMipmaps = false; pt.minFilter = THREE.LinearFilter;
  const tm = A.own(new THREE.MeshBasicMaterial({ map: tt, toneMapped: false }));
  const pm = A.own(new THREE.MeshBasicMaterial({ map: pt, toneMapped: false }));
  const tPlane = new THREE.Mesh(A.own(new THREE.PlaneGeometry(6.8, 0.46)), tm);
  const pPlane = new THREE.Mesh(A.own(new THREE.PlaneGeometry(6.8, 0.3)), pm);
  tPlane.position.set(0, 3.76, -6.5); pPlane.position.set(0, 3.31, -6.5);
  group.add(tPlane, pPlane);
  let text = '', fontOk = bagel(), flashT = -1, scroll = 0;
  function drawText() {
    const x = tc.getContext('2d');
    x.fillStyle = '#130C2E'; x.fillRect(0, 0, 512, 64);
    x.fillStyle = 'rgba(255,255,255,0.05)';
    for (let i = 0; i < 512; i += 8) for (let j = 4; j < 64; j += 8) x.fillRect(i + 3, j - 1, 2, 2);
    const g = x.createLinearGradient(0, 12, 0, 52); g.addColorStop(0, '#FFD23F'); g.addColorStop(1, '#FF5FA2');
    let size = 44;
    do { x.font = (fontOk ? '' : '800 ') + size + 'px ' + (fontOk ? '"Bagel Fat One", "Baloo 2", sans-serif' : '"Baloo 2", sans-serif'); size -= 2; }
    while (size > 32 && x.measureText(text).width > 470);
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineWidth = 6; x.strokeStyle = '#2B2140'; x.lineJoin = 'round'; x.strokeText(text, 256, 35);
    x.fillStyle = g; x.fillText(text, 256, 35);
    tt.needsUpdate = true;
  }
  function drawPips(codes) {
    const x = pc.getContext('2d');
    x.fillStyle = '#130C2E'; x.fillRect(0, 0, 256, 32);
    for (let i = 0; i < 8; i++) {
      const cx = 16 + i * 32, cy = 16, c = codes[i];
      x.lineWidth = 3; x.beginPath(); x.arc(cx, cy, 10, 0, TAU);
      if (c === 2 || c === 3) {
        x.fillStyle = '#2ECC71'; x.fill(); x.strokeStyle = '#FFFFFF'; x.stroke();
        x.beginPath(); x.moveTo(cx - 5, cy); x.lineTo(cx - 1, cy + 4); x.lineTo(cx + 5, cy - 4); x.strokeStyle = '#FFFFFF'; x.stroke();
        if (c === 3) { x.beginPath(); x.arc(cx, cy, 14, 0, TAU); x.strokeStyle = '#FFD23F'; x.lineWidth = 2.5; x.stroke(); }
      } else if (c === 4) {
        x.strokeStyle = '#CFC8DC'; x.stroke();
        x.beginPath(); x.moveTo(cx - 5, cy); x.lineTo(cx + 5, cy); x.stroke();
      } else {
        x.fillStyle = 'rgba(255,255,255,0.12)'; x.fill(); x.strokeStyle = c === 1 ? '#3DF2FF' : 'rgba(255,255,255,0.45)'; x.stroke();
      }
    }
    pt.needsUpdate = true;
  }
  return {
    group,
    setText(s) {
      s = String(s || '');
      if (s === text && fontOk === bagel()) return;
      text = s; fontOk = bagel(); drawText();
    },
    setPips: drawPips,
    flash() { flashT = 0; },
    update(dt, reduced) {
      if (!fontOk && bagel()) { fontOk = true; drawText(); }
      if (!reduced) { scroll = (scroll + dt * 0.07) % 1; tt.offset.x = scroll; } else tt.offset.x = 0.25;
      /* a single 1 Hz brightness pulse (Star Strike / ENCORE!) — never faster than 2 Hz */
      let k = 1;
      if (flashT >= 0) { flashT += dt; k = flashT < 1 ? 1 + 0.6 * Math.sin(Math.PI * flashT) : 1; if (flashT >= 1) flashT = -1; }
      tm.color.setScalar(k);
    }
  };
}

/* ================================================================
   SPOT CONES — one instanced additive cone (apex at the truss lamp,
   alpha 0.2·(1 − d)^1.4 with soft edges); colour encodes the strength
   ================================================================ */
export function buildCones(A, cap) {
  /* a unit cone: apex at the origin, opening along −y (radius 0.13 per unit length, the bible's 1.3 at 10 u) */
  const geo = A.own(new THREE.ConeGeometry(0.13, 1, 16, 1, true));
  geo.translate(0, -0.5, 0);
  const mat = A.own(new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false,
    vertexShader: [
      'varying float vD; varying vec3 vC; varying float vEdge;',
      'void main() {',
      '  vD = clamp(-position.y, 0.0, 1.0);',
      '  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);',
      '  vec3 n = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);',
      '  vec3 v = normalize(cameraPosition - wp.xyz);',
      '  vEdge = abs(dot(n, v));',
      '#ifdef USE_INSTANCING_COLOR',
      '  vC = instanceColor;',
      '#else',
      '  vC = vec3(1.0);',
      '#endif',
      '  gl_Position = projectionMatrix * viewMatrix * wp;',
      '}'
    ].join('\n'),
    fragmentShader: [
      'varying float vD; varying vec3 vC; varying float vEdge;',
      'void main() {',
      '  float a = 0.2 * pow(1.0 - vD, 1.4) * smoothstep(0.0, 0.55, vEdge) * smoothstep(0.0, 0.06, vD);',
      '  gl_FragColor = vec4(vC * a, a);',
      '}'
    ].join('\n')
  }));
  mat.blending = THREE.CustomBlending; mat.blendSrc = THREE.OneFactor; mat.blendDst = THREE.OneFactor;
  const mesh = A.im(geo, mat, cap);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false; mesh.renderOrder = 4; mesh.name = 'cones';
  const p = new THREE.Vector3(), d = new THREE.Vector3(), sc = new THREE.Vector3(), q = new THREE.Quaternion(), c = new THREE.Color();
  return {
    mesh,
    set(i, x, y, z, dx, dy, dz, len, col, k) {
      p.set(x, y, z); d.set(dx, dy, dz).normalize();
      q.setFromUnitVectors(DOWN, d);
      sc.set(len, len, len);
      _m.compose(p, q, sc);
      mesh.setMatrixAt(i, _m);
      c.copy(col).multiplyScalar(Math.max(0, k));
      c.toArray(mesh.instanceColor.array, i * 3);
    },
    commit() { mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true; }
  };
}

/* ================================================================
   KEEPER — one rigid-skinned goalie-blob (torso, 2 arms, 2 puff gloves,
   2 stubby legs) in ONE SkinnedMesh (+ hull on MID/HIGH); a 4-state face
   atlas; per-rival skins: Mochi's coral sweatband, Bop's headphones,
   Glowy's neon glove cores, Flip's chrome visor and ⇄ chip
   ================================================================ */
const KB = { torso: 0, armL: 1, armR: 2, gloveL: 3, gloveR: 4, legL: 5, legR: 6 };
const SHOULDER = [0.34, 0.2, 0.06], GLOVE = [0.62, 0.10, 0.15], HIP = [0.16, -0.62, 0];
const ARM_L0 = Math.hypot(GLOVE[0] - SHOULDER[0], GLOVE[1] - SHOULDER[1], GLOVE[2] - SHOULDER[2]);
function skinMerge(parts) {
  let total = 0;
  parts.forEach((p) => { total += p.geo.getAttribute('position').count; });
  const P = new Float32Array(total * 3), N = new Float32Array(total * 3), C = new Float32Array(total * 3);
  const SI = new Uint16Array(total * 4), SW = new Float32Array(total * 4);
  let off = 0;
  parts.forEach((p) => {
    const g = p.geo, n = g.getAttribute('position').count;
    P.set(g.getAttribute('position').array, off * 3); N.set(g.getAttribute('normal').array, off * 3); C.set(g.getAttribute('color').array, off * 3);
    for (let v = 0; v < n; v++) { SI[(off + v) * 4] = p.bone; SW[(off + v) * 4] = 1; }
    off += n;
    g.dispose();
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  out.setAttribute('color', new THREE.BufferAttribute(C, 3));
  out.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(SI, 4));
  out.setAttribute('skinWeight', new THREE.BufferAttribute(SW, 4));
  out.computeBoundingSphere();
  return out;
}
function keeperGeo(A, rival) {
  const G = A.G, jersey = rival.jersey, parts = [];
  const body = G.bean(0.42, 0.62), light = A.tone(jersey, 0.14), dark = A.tone(jersey, -0.1), base = A.col(jersey);
  G.paintBy(body, (v) => (v.z > 0.22 && v.y < 0.05 && v.y > -0.55 ? light : v.y < -0.5 ? dark : base));
  parts.push({ geo: body, bone: KB.torso });
  [-1, 1].forEach((sd) => {
    const arm = G.t(G.bean(0.08, ARM_L0), { p: [sd * SHOULDER[0], SHOULDER[1] - ARM_L0 / 2, SHOULDER[2]] });
    parts.push({ geo: G.paint(arm, A.tone(jersey, -0.04)), bone: sd < 0 ? KB.armL : KB.armR });
    const gl = G.puff(0.2, { sphere: true });
    G.paintBy(gl, (v) => (v.y < -0.12 ? A.col('#E4DEF0') : A.col('#FFFFFF')));
    G.t(gl, { p: [sd * GLOVE[0], GLOVE[1], GLOVE[2]] });
    const thumb = paint(A, G.t(G.puff(0.075), { p: [sd * (GLOVE[0] - 0.13), GLOVE[1] + 0.08, GLOVE[2] + 0.1] }), '#FFFFFF');
    parts.push({ geo: gl, bone: sd < 0 ? KB.gloveL : KB.gloveR }, { geo: thumb, bone: sd < 0 ? KB.gloveL : KB.gloveR });
    const leg = G.paint(G.t(G.bean(0.12, 0.08), { p: [sd * HIP[0], HIP[1] - 0.12, 0.04] }), A.tone(jersey, -0.18));
    parts.push({ geo: leg, bone: sd < 0 ? KB.legL : KB.legR });
  });
  if (rival.tell === 'lean') {
    parts.push({ geo: paint(A, G.t(G.ring(0.402, 0.05), { r: [90, 0, 0], p: [0, 0.44, 0] }), rival.trim || '#FF6B6B'), bone: KB.torso });
  } else if (rival.tell === 'beat') {
    const band = G.normalise(new THREE.TorusGeometry(0.47, 0.035, 6, 14, Math.PI));
    parts.push({ geo: paint(A, G.t(band, { p: [0, 0.31, 0] }), '#FFFFFF'), bone: KB.torso });
    [-1, 1].forEach((sd) => {
      parts.push({ geo: paint(A, G.t(G.puff(0.13, { sphere: true }), { s: [0.55, 1, 1], p: [sd * 0.45, 0.31, 0] }), rival.trim || '#FF8FC8'), bone: KB.torso });
      parts.push({ geo: paint(A, G.t(G.ring(0.1, 0.03), { r: [0, 90, 0], p: [sd * 0.415, 0.31, 0] }), '#FFFFFF'), bone: KB.torso });
    });
  }
  return skinMerge(parts);
}
/* the face atlas: calm · confident · worried (+ sweat drop) · dizzy, drawn for a 1.57:1 patch */
function faceAtlas(A) {
  const c = A.canvas(256, 64), x = c.getContext('2d'), SQ = 1 / 1.57;
  x.clearRect(0, 0, 256, 64);
  for (let i = 0; i < 4; i++) {
    x.save(); x.translate(i * 64 + 32, 0); x.scale(SQ, 1); x.translate(-50, 0);
    x.lineCap = 'round'; x.lineJoin = 'round';
    x.fillStyle = 'rgba(255,128,170,0.55)';
    x.beginPath(); x.ellipse(20, 41, 9, 5, 0, 0, TAU); x.ellipse(80, 41, 9, 5, 0, 0, TAU); x.fill();
    x.fillStyle = INK; x.strokeStyle = INK; x.lineWidth = 4.5;
    if (i === 1) {
      x.beginPath(); x.arc(34, 30, 8, Math.PI * 1.1, Math.PI * 1.9); x.stroke();
      x.beginPath(); x.arc(66, 30, 8, Math.PI * 1.1, Math.PI * 1.9); x.stroke();
      x.beginPath(); x.moveTo(40, 40); x.quadraticCurveTo(50, 56, 60, 40); x.closePath(); x.fill();
    } else if (i === 3) {
      [34, 66].forEach((ex) => { x.beginPath(); for (let k = 0; k <= 24; k++) { const a = k / 24 * TAU * 1.6, r = 1 + k * 0.4; x[k ? 'lineTo' : 'moveTo'](ex + Math.cos(a) * r, 26 + Math.sin(a) * r); } x.lineWidth = 3; x.stroke(); });
      x.beginPath(); x.moveTo(38, 46); x.quadraticCurveTo(44, 40, 50, 46); x.quadraticCurveTo(56, 52, 62, 46); x.lineWidth = 3.5; x.stroke();
    } else {
      [34, 66].forEach((ex) => { x.beginPath(); x.ellipse(ex, 26, 8, 11, 0, 0, TAU); x.fill(); });
      x.fillStyle = '#FFFFFF';
      [31, 63].forEach((ex) => { x.beginPath(); x.arc(ex, 21, 3.2, 0, TAU); x.fill(); });
      x.fillStyle = INK;
      if (i === 2) {
        x.lineWidth = 3.5;
        x.beginPath(); x.moveTo(24, 10); x.lineTo(40, 13); x.moveTo(76, 10); x.lineTo(60, 13); x.stroke();
        x.beginPath(); x.ellipse(50, 45, 5, 6, 0, 0, TAU); x.stroke();
        x.fillStyle = '#9FDCFF';
        x.beginPath(); x.moveTo(90, 6); x.quadraticCurveTo(98, 20, 90, 24); x.quadraticCurveTo(82, 20, 90, 6); x.fill();
      } else {
        x.beginPath(); x.arc(50, 37, 9, Math.PI * 0.15, Math.PI * 0.85); x.lineWidth = 4; x.stroke();
      }
    }
    x.restore();
  }
  const t = A.canvasTex(c);
  t.repeat.set(0.25, 1);
  return t;
}
function chipTexture(A) {
  const c = A.canvas(64, 64), x = c.getContext('2d');
  x.fillStyle = '#FFFFFF'; x.strokeStyle = INK; x.lineWidth = 4;
  x.beginPath(); x.arc(32, 32, 27, 0, TAU); x.fill(); x.stroke();
  x.fillStyle = '#FF4FB8'; x.font = '800 34px "Baloo 2", system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText('⇄', 32, 34);
  return A.canvasTex(c);
}
export function buildKeeper(A, o) {
  const root = new THREE.Group(), squash = new THREE.Group(), body = new THREE.Group();
  root.name = 'keeper'; root.add(squash); squash.add(body);
  const names = ['torso', 'armL', 'armR', 'gloveL', 'gloveR', 'legL', 'legR'], bones = names.map((nm) => { const b = new THREE.Bone(); b.name = nm; return b; });
  const torso = bones[0];
  body.add(torso);
  for (let i = 1; i < bones.length; i++) torso.add(bones[i]);
  bones[KB.armL].position.set(-SHOULDER[0], SHOULDER[1], SHOULDER[2]); bones[KB.armR].position.set(SHOULDER[0], SHOULDER[1], SHOULDER[2]);
  bones[KB.gloveL].position.set(-GLOVE[0], GLOVE[1], GLOVE[2]); bones[KB.gloveR].position.set(GLOVE[0], GLOVE[1], GLOVE[2]);
  bones[KB.legL].position.set(-HIP[0], HIP[1], HIP[2]); bones[KB.legR].position.set(HIP[0], HIP[1], HIP[2]);
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  const geos = {}, rivals = o.rivals;
  function geoFor(id) {
    if (!geos[id]) { const rv = rivals.find((r) => r.id === id) || rivals[0]; geos[id] = A.own(keeperGeo(A, rv)); }
    return geos[id];
  }
  let rivalId = (rivals[0] || {}).id;
  const mesh = new THREE.SkinnedMesh(geoFor(rivalId), A.K.mat('toon'));
  mesh.frustumCulled = false; mesh.name = 'keeperBody';
  body.add(mesh); mesh.bind(skeleton, new THREE.Matrix4());
  let hull = null;
  if (A.outlines) {
    hull = new THREE.SkinnedMesh(mesh.geometry, A.K.variant('outline:0.012', 'skin', { color: A.K.col('Ink') }));
    hull.frustumCulled = false; hull.name = 'keeperHull';
    body.add(hull); hull.bind(skeleton, new THREE.Matrix4());
  }
  /* the face: a cylinder patch just outside the bean (±38°, 0.36 u tall) */
  const faceTex = faceAtlas(A);
  const faceGeo = A.own(new THREE.CylinderGeometry(0.428, 0.428, 0.36, 14, 1, true, -38 * DEG, 76 * DEG));
  const faceMat = A.own(new THREE.MeshBasicMaterial({ map: faceTex, transparent: true, alphaTest: 0.02, depthWrite: false, toneMapped: false }));
  const face = new THREE.Mesh(faceGeo, faceMat);
  face.position.set(0, 0.2, 0); face.renderOrder = 2; face.name = 'face';
  torso.add(face);
  /* Glowy's glove cores (unlit spheres, lit only by the tell) */
  const coreGeo = A.own(A.G.puff(0.12, { sphere: true }));
  const cores = [KB.gloveL, KB.gloveR].map((bi) => {
    const m = new THREE.Mesh(coreGeo, A.own(new THREE.MeshBasicMaterial({ color: 0x7fb8c8, vertexColors: true, toneMapped: false })));
    m.position.set(0, 0.02, 0.13); m.visible = false; m.name = 'gloveCore';
    bones[bi].add(m);
    return m;
  });
  const dim = A.col('#7FB8C8'), lit = A.col('#3DF2FF');
  /* Flip's chrome visor (flips up for a wink after a save) */
  const visorPivot = new THREE.Group();
  visorPivot.position.set(0, 0.45, 0);
  torso.add(visorPivot);
  const vb = A.G.normalise(new THREE.CylinderGeometry(0.432, 0.432, 0.1, 16, 1, true, -70 * DEG, 140 * DEG));
  const brim = A.G.t(A.G.puff(0.24, { sphere: true }), { s: [1.1, 0.12, 0.8], p: [0, -0.03, 0.42] });
  const visorGeo = A.own(A.G.merge([vb, brim])); vb.dispose(); brim.dispose();
  const visor = new THREE.Mesh(visorGeo, A.K.mat('chrome'));
  visor.visible = false; visor.name = 'visor';
  visorPivot.add(visor);
  /* the ⇄ chip, 0.4 u above his head */
  const chipMat = A.own(new THREE.SpriteMaterial({ map: chipTexture(A), depthTest: true, toneMapped: false }));
  const chip = new THREE.Sprite(chipMat);
  chip.scale.set(0.36, 0.36, 1); chip.visible = false; chip.name = 'chip';
  root.add(chip);
  const inv = new THREE.Matrix4(), v = new THREE.Vector3(), dir = new THREE.Vector3(), q = new THREE.Quaternion();
  let cell = 0, tell = 'lean';
  function arm(bi, gi) {
    const a = bones[bi], g = bones[gi];
    dir.subVectors(g.position, a.position);
    const len = dir.length() || 1e-3;
    q.setFromUnitVectors(DOWN, dir.multiplyScalar(1 / len));
    a.quaternion.copy(q);
    a.scale.set(1, Math.max(0.4, len / ARM_L0), 1);
  }
  function setRival(id) {
    const rv = rivals.find((r) => r.id === id) || rivals[0];
    rivalId = rv.id; tell = rv.tell;
    mesh.geometry = geoFor(rivalId);
    if (hull) hull.geometry = mesh.geometry;
    cores.forEach((c) => { c.visible = tell === 'glove'; });
    visor.visible = tell === 'mirror';
  }
  setRival(rivalId);
  return {
    root, body, mesh, hull, bones, face, chip, cores,
    get rival() { return rivalId; },
    setRival,
    setOutlines(on) { if (hull) hull.visible = !!on; },
    /* p: a SLPenalty3DCore keeper pose (world units) */
    apply(p) {
      squash.position.set(p.cx * (1 - p.qx), 0, p.cz * (1 - p.qx));
      squash.scale.set(p.qx, p.qy, p.qx);
      body.position.set(p.cx, p.cy, p.cz);
      body.rotation.set(0, 0, p.roll);
      body.scale.set(p.bx, p.by, p.bx);
      root.updateMatrixWorld(true);
      inv.copy(body.matrixWorld).invert();
      bones[KB.gloveL].position.copy(v.set(p.gLx, p.gLy, p.gLz).applyMatrix4(inv));
      bones[KB.gloveR].position.copy(v.set(p.gRx, p.gRy, p.gRz).applyMatrix4(inv));
      bones[KB.gloveL].scale.setScalar(p.gLs); bones[KB.gloveR].scale.setScalar(p.gRs);
      arm(KB.armL, KB.gloveL); arm(KB.armR, KB.gloveR);
      bones[KB.legL].rotation.x = p.legs; bones[KB.legR].rotation.x = p.legs * 0.85;
      if (p.face !== cell) { cell = p.face; faceTex.offset.x = cell * 0.25; }
      face.rotation.y = p.eye * 0.14;
      if (tell === 'glove') {
        cores[0].material.color.copy(dim).lerp(lit, p.glowL); cores[1].material.color.copy(dim).lerp(lit, p.glowR);
        cores[0].scale.setScalar(1 + 0.25 * p.glowL); cores[1].scale.setScalar(1 + 0.25 * p.glowR);
      }
      if (tell === 'mirror') visorPivot.rotation.x = -0.9 * p.visor;
      chip.visible = !!p.chip && tell === 'mirror';
      if (chip.visible) chip.position.set(p.cx, p.cy + 0.73 * p.by + 0.45, p.cz);
    },
    /* world positions of the head top and the two gloves (after apply) */
    headWorld(out) { return body.localToWorld(out.set(0, 0.78, 0)); },
    gloveWorld(left, out) { return bones[left ? KB.gloveL : KB.gloveR].getWorldPosition(out); },
    dispose() { skeleton.dispose(); if (root.parent) root.parent.remove(root); root.clear(); }
  };
}

/* ================================================================
   BALL — SL3D.makeBall (the attractions chunk) or the same four looks from
   primitives; a spinner inside a velocity-aligned stretch frame
   ================================================================ */
const ICO = (() => {
  const t = (1 + Math.sqrt(5)) / 2, v = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]];
  return v.map((p) => { const l = Math.hypot(p[0], p[1], p[2]); return [p[0] / l, p[1] / l, p[2] / l]; });
})();
export function buildBall(A, o) {
  const id = o.id, look = o.look, S = o.SL3D, G = A.G, R = 0.11;
  const root = new THREE.Group(), spinner = new THREE.Group();
  root.name = 'ball'; root.add(spinner);
  let model = null, ownDispose = null;
  try {
    if (S && typeof S.makeBall === 'function') {
      model = S.makeBall(id, A.tier);
      if (model) { model.position.y = -R; ownDispose = model.userData && model.userData.dispose; }
    }
  } catch (e) { model = null; }
  if (!model) {
    model = new THREE.Group();
    if (id === 'ball_gold') {
      model.add(new THREE.Mesh(A.own(G.puff(R, { sphere: true })), A.K.mat('gold')));
    } else {
      let g;
      if (id === 'ball_rainbow') {
        g = G.puff(R, { sphere: true });
        const bands = look.bands.map((h) => A.col(h));
        G.paintBy(g, (v) => bands[Math.max(0, Math.min(5, Math.floor((1 - (v.y / R + 1) / 2) * 6)))], { perFace: true });
      } else if (id === 'ball_planet') {
        const body = paint(A, G.puff(R, { sphere: true }), look.body);
        const ring = paint(A, G.t(G.t(G.ring(R * 1.5, R * 0.11), { s: [1, 1, 0.45], r: [90, 0, 0] }), { r: [0, 0, 18] }), look.ring);
        g = G.merge([body, ring]); body.dispose(); ring.dispose();
      } else {
        g = G.facet(G.puff(R));
        const w = A.col(look.body || '#FFFFFF'), ink = A.col(look.patch || INK);
        G.paintBy(g, (v) => {
          const l = Math.hypot(v.x, v.y, v.z) || 1;
          for (let i = 0; i < ICO.length; i++) if ((v.x * ICO[i][0] + v.y * ICO[i][1] + v.z * ICO[i][2]) / l > 0.93) return ink;
          return w;
        }, { perFace: true });
      }
      model.add(A.toon(g, 'ball'));
    }
  }
  spinner.add(model);
  return {
    root, spinner,
    dispose() { if (typeof ownDispose === 'function') { try { ownDispose(); } catch (e) { /* gone */ } } if (root.parent) root.parent.remove(root); root.clear(); }
  };
}

/* ================================================================
   COMET RIBBON — a 12-segment additive camera-facing strip, 0.08 u wide
   and tapering; vertex colours carry the accent / holo / gold→pink mix
   ================================================================ */
export function buildTrail(A) {
  const N = 13, posArr = new Float32Array(N * 2 * 3), colArr = new Float32Array(N * 2 * 3), idx = [];
  for (let i = 0; i < N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const geo = A.own(new THREE.BufferGeometry());
  const pa = new THREE.BufferAttribute(posArr, 3), ca = new THREE.BufferAttribute(colArr, 3);
  pa.setUsage(THREE.DynamicDrawUsage); ca.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', pa); geo.setAttribute('color', ca); geo.setIndex(idx);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 4), 12);
  const mat = A.own(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }));
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'trail'; mesh.frustumCulled = false; mesh.renderOrder = 6; mesh.visible = false;
  const hist = new Float32Array(N * 3), tg = new THREE.Vector3(), vd = new THREE.Vector3(), sd = new THREE.Vector3(), c = new THREE.Color();
  let count = 0;
  return {
    mesh,
    reset() { count = 0; mesh.visible = false; },
    push(x, y, z) {
      hist.copyWithin(3, 0, (N - 1) * 3);
      hist[0] = x; hist[1] = y; hist[2] = z;
      count = Math.min(N, count + 1);
    },
    fade() { if (count > 0) count--; if (count < 2) mesh.visible = false; },
    /* colorAt(i, k, out): the colour of point i (0 = head) at fraction k = i / (N-1) */
    draw(cam, width, alpha, colorAt) {
      if (count < 2) { mesh.visible = false; return; }
      mesh.visible = true;
      for (let i = 0; i < N; i++) {
        const j = Math.min(i, count - 1), k = i / (N - 1), p = j * 3;
        const a = Math.max(0, j - 1) * 3, b = Math.min(count - 1, j + 1) * 3;
        tg.set(hist[a] - hist[b], hist[a + 1] - hist[b + 1], hist[a + 2] - hist[b + 2]);
        vd.set(cam.x - hist[p], cam.y - hist[p + 1], cam.z - hist[p + 2]);
        sd.crossVectors(tg, vd);
        const l = sd.length();
        if (l > 1e-6) sd.multiplyScalar((width * (1 - k) * 0.5) / l); else sd.set(0, 0, 0);
        const o2 = i * 6;
        posArr[o2] = hist[p] + sd.x; posArr[o2 + 1] = hist[p + 1] + sd.y; posArr[o2 + 2] = hist[p + 2] + sd.z;
        posArr[o2 + 3] = hist[p] - sd.x; posArr[o2 + 4] = hist[p + 1] - sd.y; posArr[o2 + 5] = hist[p + 2] - sd.z;
        colorAt(i, k, c);
        const f = alpha * (i >= count ? 0 : (1 - k) * (1 - k));
        colArr[o2] = colArr[o2 + 3] = c.r * f; colArr[o2 + 1] = colArr[o2 + 4] = c.g * f; colArr[o2 + 2] = colArr[o2 + 5] = c.b * f;
      }
      pa.needsUpdate = true; ca.needsUpdate = true;
    }
  };
}

/* ================================================================
   AIM UI — always on top (MeshBasic, depthTest off, renderOrder 10):
   the cyan X rail / pin / column, the pink Y rail / reticle, the dashed
   holo-gold top-corner zones, the pink help-zone quad
   ================================================================ */
export function buildAim(A, o) {
  const group = new THREE.Group(); group.name = 'aim';
  const M = (hex, op) => A.own(new THREE.MeshBasicMaterial({ color: A.col(hex), toneMapped: false, depthTest: false, depthWrite: false, transparent: true, opacity: op == null ? 1 : op }));
  const top = (m) => { m.renderOrder = 10; m.frustumCulled = false; group.add(m); return m; };
  const cyan = o.cyan, pink = o.pink, au = o.aimU;
  const railGeo = A.own(new THREE.CylinderGeometry(0.025, 0.025, au.x1 - au.x0, 8));
  railGeo.rotateZ(Math.PI / 2);
  const railX = top(new THREE.Mesh(railGeo, M(cyan, 0.9)));
  railX.position.set(0, 0.02, 0.04);
  const pinGeo = A.own(new THREE.ConeGeometry(0.1, 0.24, 12));
  const pin = top(new THREE.Mesh(pinGeo, M(cyan)));
  const colGeo = A.own(new THREE.PlaneGeometry(0.04, 2.8));
  colGeo.translate(0, 1.4, 0);
  const column = top(new THREE.Mesh(colGeo, M(cyan, 0.35)));
  const railYGeo = A.own(new THREE.CylinderGeometry(0.02, 0.02, au.y1 - au.y0, 6));
  railYGeo.translate(0, (au.y0 + au.y1) / 2, 0);
  const railY = top(new THREE.Mesh(railYGeo, M(pink, 0.6)));
  const retParts = [A.G.normalise(new THREE.TorusGeometry(0.24, 0.028, 6, 28)),
    A.G.normalise(new THREE.BoxGeometry(0.66, 0.035, 0.01)), A.G.normalise(new THREE.BoxGeometry(0.035, 0.66, 0.01))];
  const retGeo = A.own(A.G.merge(retParts)); retParts.forEach((g) => g.dispose());
  const reticle = top(new THREE.Mesh(retGeo, M(pink)));
  /* top-corner zones: dashed gold outlines + a soft fill that brightens under the reticle */
  const cz = o.corner, zoneVerts = [], fills = [];
  [cz.left, cz.right].forEach((z) => {
    zoneVerts.push(z.x0, z.y0, 0.02, z.x1, z.y0, 0.02, z.x1, z.y0, 0.02, z.x1, z.y1, 0.02, z.x1, z.y1, 0.02, z.x0, z.y1, 0.02, z.x0, z.y1, 0.02, z.x0, z.y0, 0.02);
    fills.push(z);
  });
  const zg = A.own(new THREE.BufferGeometry());
  zg.setAttribute('position', new THREE.Float32BufferAttribute(zoneVerts, 3));
  const zm = A.own(new THREE.LineDashedMaterial({ color: A.col(o.gold), dashSize: 0.12, gapSize: 0.08, transparent: true, opacity: 0.5, depthTest: false, toneMapped: false }));
  const zones = top(new THREE.LineSegments(zg, zm));
  zones.computeLineDistances();
  const fillMeshes = fills.map((z) => {
    const g = A.own(new THREE.PlaneGeometry(z.x1 - z.x0, z.y1 - z.y0));
    const m = top(new THREE.Mesh(g, M(o.gold, 0)));
    m.position.set((z.x0 + z.x1) / 2, (z.y0 + z.y1) / 2, 0.015);
    return m;
  });
  /* the help zone / teaching flash: a pink quad exactly over REACH[dive] (unit plane, scaled) */
  const helpGeo = A.own(new THREE.PlaneGeometry(1, 1));
  helpGeo.translate(0.5, 0.5, 0);
  const help = top(new THREE.Mesh(helpGeo, M(o.glove, 0)));
  help.renderOrder = 9;
  return {
    group, railX, pin, column, railY, reticle, zones, zoneMat: zm, fills: fillMeshes, help,
    setHelp(box, a) {
      help.visible = a > 0.004;
      if (!help.visible) return;
      help.position.set(box.x0, 0, 0.03);
      help.scale.set(box.x1 - box.x0, box.y1, 1);
      help.material.opacity = a;
    }
  };
}

/* ================================================================
   FOLLOW-SPOT — an additive ground disc that keeps the keeper's tell
   readable at dusk (show level > 0.5)
   ================================================================ */
export function buildFollowSpot(A) {
  const g = A.own(new THREE.CircleGeometry(0.9, 28));
  g.rotateX(-Math.PI / 2);
  const m = A.own(new THREE.MeshBasicMaterial({ map: A.K.tex.halo(), color: A.col('#FFF0FA'), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  const mesh = new THREE.Mesh(g, m);
  mesh.position.set(0, 0.012, 0.35); mesh.renderOrder = 2; mesh.visible = false; mesh.name = 'followSpot';
  return { mesh, set(x, a) { mesh.position.x = x; m.opacity = a; mesh.visible = a > 0.005; } };
}

/* ================================================================
   QA overlay (?qa=1 / slQaMode): REACH boxes and corner zones as wireframes
   ================================================================ */
export function buildQa(A, reachU, cornerU) {
  const v = [];
  const rect = (x0, y0, x1, y1, z) => { v.push(x0, y0, z, x1, y0, z, x1, y0, z, x1, y1, z, x1, y1, z, x0, y1, z, x0, y1, z, x0, y0, z); };
  ['stay', 'left', 'right'].forEach((k) => { const b = reachU[k]; rect(b.x0, 0, b.x1, b.y1, 0.36); });
  [cornerU.left, cornerU.right].forEach((z) => rect(z.x0, z.y0, z.x1, z.y1, 0.03));
  const g = A.own(new THREE.BufferGeometry());
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  const m = A.own(new THREE.LineBasicMaterial({ color: 0x00ff88, depthTest: false, transparent: true }));
  const l = new THREE.LineSegments(g, m);
  l.renderOrder = 11; l.name = 'qa';
  return l;
}

/* ================================================================
   FALLBACK PET / AVATAR — built from kit primitives in the LOCKED colours,
   used only when SL3D.makeRig / makeAvatar are missing. Same small surface:
   {root, play(clip, t, opts), setShow(k), dispose()}
   ================================================================ */
const PETCOL = {
  pet_puppy: { body: '#e3b077', dark: '#b8834f', light: '#f6d9b3', nose: '#3b2f4a' },
  pet_kitten: { body: '#f0a35e', dark: '#c97834', light: '#fde2c6', nose: '#e86a8a' },
  pet_bunny: { body: '#f4f0ea', dark: '#d8cfc4', light: '#ffffff', nose: '#f08aa6' },
  pet_dragon: { body: '#5fc97a', dark: '#3a9a58', light: '#b9f0c6', nose: '#2e6b40' }
};
function petColours(id) {
  const L = typeof window !== 'undefined' && window.SLIslandLook, lk = L && L.LOCKED && L.LOCKED.PETCOL && L.LOCKED.PETCOL[id];
  return lk || PETCOL[id] || PETCOL.pet_puppy;
}
export function makeFallbackPet(A, petId) {
  const G = A.G, pc = petColours(petId), parts = [];
  parts.push(paint(A, G.t(G.bean(0.13, 0.1), { r: [90, 0, 0], p: [0, 0.22, 0] }), pc.body));
  parts.push(paint(A, G.t(G.puff(0.16, { sphere: true }), { p: [0, 0.38, 0.15] }), pc.body));
  parts.push(paint(A, G.t(G.puff(0.07, { sphere: true }), { s: [1.2, 0.8, 1], p: [0, 0.34, 0.29] }), pc.light));
  parts.push(paint(A, G.t(G.puff(0.025), { p: [0, 0.37, 0.34] }), pc.nose));
  [-1, 1].forEach((sd) => {
    parts.push(paint(A, G.t(G.puff(0.022), { s: [1, 1.3, 0.6], p: [sd * 0.06, 0.42, 0.29] }), INK));
    if (petId === 'pet_bunny') parts.push(paint(A, G.t(G.bean(0.04, 0.16), { r: [0, 0, sd * 8], p: [sd * 0.06, 0.6, 0.12] }), pc.body));
    else if (petId === 'pet_kitten') parts.push(paint(A, G.t(G.cone(0.06, 0.12, 4), { p: [sd * 0.1, 0.53, 0.13] }), pc.body));
    else if (petId === 'pet_dragon') parts.push(paint(A, G.t(G.cone(0.03, 0.1, 6), { r: [0, 0, -sd * 15], p: [sd * 0.08, 0.53, 0.12] }), '#FFD23F'));
    else parts.push(paint(A, G.t(G.bean(0.045, 0.08), { r: [0, 0, sd * 25], p: [sd * 0.15, 0.4, 0.12] }), pc.dark));
  });
  parts.push(paint(A, G.t(G.bean(0.035, 0.12), { r: [-50, 0, 0], p: [0, 0.3, -0.2] }), petId === 'pet_bunny' ? '#FFFFFF' : pc.dark));
  const bodyGeo = G.merge(parts); parts.forEach((g) => g.dispose());
  const root = new THREE.Group(), inner = new THREE.Group();
  root.name = 'pet:fallback'; root.add(inner);
  inner.add(A.toon(bodyGeo, 'petBody'));
  const legGeo = paint(A, G.t(G.bean(0.04, 0.07), { p: [0, -0.07, 0] }), pc.dark);
  const legs = A.im(A.own(legGeo), A.K.mat('toon'), 4);
  legs.frustumCulled = false; inner.add(legs);
  const LEG = [[0.085, 0.13, 0.1], [-0.085, 0.13, 0.1], [0.085, 0.13, -0.1], [-0.085, 0.13, -0.1]];
  const p = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), e = new THREE.Euler();
  function setLegs(a) {
    for (let i = 0; i < 4; i++) {
      e.set(a[i], 0, 0); q.setFromEuler(e);
      _m.compose(p.set(LEG[i][0], LEG[i][1], LEG[i][2]), q, sc);
      legs.setMatrixAt(i, _m);
    }
    legs.instanceMatrix.needsUpdate = true;
  }
  const a4 = [0, 0, 0, 0];
  setLegs(a4);
  return {
    root, fallback: true,
    play(clip, t, o) {
      const red = o && o.reduced;
      inner.position.set(0, 0, 0); inner.rotation.set(0, 0, 0); a4[0] = a4[1] = a4[2] = a4[3] = 0;
      if (clip === 'walk' || clip === 'run') {
        const s = Math.sin(TAU * (clip === 'run' ? 3.5 : 2) * t) * (red ? 0.2 : 0.5);
        a4[0] = s; a4[3] = s; a4[1] = -s; a4[2] = -s; inner.position.y = red ? 0 : 0.012 * Math.abs(s);
      } else if (clip === 'kick') {
        const k = t < 0.28 ? -0.9 * (t / 0.28) : t < 0.36 ? -0.9 + 2.4 * ((t - 0.28) / 0.08) : 1.5 * Math.max(0, 1 - (t - 0.36) / 0.4);
        a4[1] = k;
      } else if (clip === 'cheer' || clip === 'dance') {
        inner.position.y = red ? 0.02 : 0.08 * Math.abs(Math.sin(TAU * 1.6 * t)); inner.rotation.x = -0.4; a4[0] = a4[1] = -1.6;
      } else if (clip === 'sad') {
        inner.rotation.x = 0.12;
      } else if (!red) {
        inner.position.y = 0.006 * Math.sin(TAU * 0.5 * t);
      }
      setLegs(a4);
    },
    setShow() {},
    dispose() { if (root.parent) root.parent.remove(root); root.clear(); }
  };
}
export function makeFallbackAvatar(A, member) {
  const G = A.G, hex = member.color || '#6C5CE7', root = new THREE.Group(), inner = new THREE.Group();
  root.name = 'avatar:fallback'; root.add(inner);
  const body = paint(A, G.t(G.bean(0.18, 0.22), { p: [0, 0.33, 0] }), hex);
  const head = paint(A, G.t(G.puff(0.24, { sphere: true }), { p: [0, 0.71, 0] }), '#FFFFFF');
  const geo = G.merge([body, head]); body.dispose(); head.dispose();
  inner.add(A.toon(geo, 'avatarBody'));
  const faceMat = A.own(new THREE.MeshBasicMaterial({ map: A.K.tex.emojiFace(member.emoji || '🙂'), transparent: true, alphaTest: 0.05, depthWrite: false }));
  const face = new THREE.Mesh(A.own(new THREE.PlaneGeometry(0.36, 0.36)), faceMat);
  face.position.set(0, 0.71, 0.25); inner.add(face);
  const armGeo = A.own(paint(A, G.t(G.puff(0.055), { s: [0.75, 1.9, 0.75], p: [0, -0.085, 0] }), hex));
  const arms = A.im(armGeo, A.K.mat('toon'), 2);
  arms.frustumCulled = false; inner.add(arms);
  const p = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), e = new THREE.Euler();
  function setArms(l, r) {
    [[0.17, l], [-0.17, -r]].forEach((a, i) => { e.set(0, 0, a[1]); q.setFromEuler(e); _m.compose(p.set(a[0], 0.5, 0), q, sc); arms.setMatrixAt(i, _m); });
    arms.instanceMatrix.needsUpdate = true;
  }
  setArms(0.1, 0.1);
  return {
    root, fallback: true,
    play(clip, t, o) {
      const red = o && o.reduced;
      inner.position.y = red ? 0 : 0.02 * Math.sin(TAU * 0.5 * t);
      if (clip === 'cheer' || clip === 'dance') { setArms(2.6, 2.6); if (!red) inner.position.y = 0.08 * Math.abs(Math.sin(TAU * 1.6 * t)); }
      else if (clip === 'wave') setArms(0.1, 2.4 + (red ? 0 : 0.3 * Math.sin(TAU * 1.6 * t)));
      else if (clip === 'clap') setArms(0.9 + (red ? 0 : 0.35 * Math.cos(TAU * 1.8 * t)), 0.9 + (red ? 0 : 0.35 * Math.cos(TAU * 1.8 * t)));
      else setArms(0.1, 0.1);
    },
    setShow() {}, setWand() {},
    dispose() { if (root.parent) root.parent.remove(root); root.clear(); }
  };
}
