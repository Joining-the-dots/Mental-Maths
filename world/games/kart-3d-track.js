/* ================================================================
   Neon Grand Prix 3D — the track scene (ES module; THREE comes in ctx).
   Built once per track from the logic centreline and kept while that
   track is in use (switching tracks disposes it):
     ribbon (verges, Coral/white kerbs, asphalt, dashes, start checker)
     candy tyre / foam wall stacks (2 InstancedMeshes, bump wobble)
     checkpoint arches 1–3 + the finish gantry (LED board, countdown banks,
       checker band, bulbs, cone mounts) — one merged toon mesh
     Beat Strips (pastel plates + additive chevrons), the Stage Jump (striped
       ramp, side bulbs, twin confetti cannons), Glow Notes, the Glow Line
     grandstand + crowd of fan blobs with Island Wands, the avatar riser
     scenery (island palms / trees / umbrellas via the kit's ItemBatch when the
       island models exist, else built here) and the set-piece: GLOW TUNNEL,
       CRYSTAL CHICANE + cute volcano, or DOLPHIN PALS
     the results podium (hidden until results)
   One shared halo pool lights every bulb, note, wand and glint.

   buildTrack(ctx) → T
     ctx {THREE, kit, core, track, rect, tier, budget, reduced, SL3D}
     T.group, T.spots {gantry, stand, avatar, podium, fireworks[], cannonsGo[], cannonsJump[]}
     T.update(dt, st)   st {t (beat clock), gates (0..3 passed), encore, haloScale, haloAlpha,
                            wandHex, waveSince, noteGot[], banks (−1 off | 0..3 pink lit), go,
                            led, reduced, dayK}
     T.wobbleNear(lx, ly), T.setGlowLine(points, n, hex), T.showPodium(on), T.notePos(i, v3)
     T.dispose()
   ================================================================ */

export function buildTrack(ctx) {
  const { THREE, kit, core, track } = ctx;
  const G = kit.G, C = core.COL, U = core.U, DEG = core.DEG, TAU = core.TAU;
  const low = ctx.tier === 'LOW';
  const look = core.trackLook(track.id);
  const group = new THREE.Group();
  group.name = 'k3d-track:' + track.id;
  const disposables = [], ownMats = [], statics = [], batches = [];
  const keep = (x) => { disposables.push(x); return x; };
  let reduced = !!ctx.reduced;

  /* ---------------- frame helpers (logic px → world) ---------------- */
  function frameAt(s, lat) {
    const p = core.offsetAt(track, s, lat || 0, {});
    return { x: core.wx(p.x), z: core.wz(p.y), yaw: core.yawDir(p.tx, p.ty), tx: p.tx, ty: p.ty, nx: -p.ty, nz: p.tx, i: p.i };
  }
  /* local (x across, y, z along) in a frame → world Vector3 */
  function local(f, x, y, z, out) {
    const c = Math.cos(f.yaw), s = Math.sin(f.yaw);
    out = out || new THREE.Vector3();
    return out.set(f.x + x * c + z * s, y, f.z - x * s + z * c);
  }
  /* place a local-frame geometry into the world */
  function put(geo, f, y) { return G.t(geo, { r: [0, f.yaw / DEG, 0], p: [f.x, y || 0, f.z] }); }
  function paint(geo, hex) { return G.paint(geo, kit.color(hex)); }
  /* a flat-shaded triangle soup with per-triangle colours → normalised geometry */
  function soup(tris) {
    const P = new Float32Array(tris.length * 9), N = new Float32Array(tris.length * 9), Cc = new Float32Array(tris.length * 9);
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), e = new THREE.Vector3();
    tris.forEach((t, i) => {
      a.fromArray(t[0]); b.fromArray(t[1]); c.fromArray(t[2]);
      n.subVectors(b, a).cross(e.subVectors(c, a)).normalize();
      const col = kit.color(t[3]);
      for (let k = 0; k < 3; k++) {
        P.set(t[k], i * 9 + k * 3); n.toArray(N, i * 9 + k * 3);
        Cc[i * 9 + k * 3] = col.r; Cc[i * 9 + k * 3 + 1] = col.g; Cc[i * 9 + k * 3 + 2] = col.b;
      }
    });
    return G.fromArrays(P, N, Cc);
  }

  /* ---------------- 1. the ribbon ---------------- */
  const rib = core.buildRibbon(track, { verge: look.verge });
  const ribbon = new THREE.Mesh(keep(G.fromArrays(rib.position, rib.normal, rib.color)), kit.mat('toon'));
  ribbon.name = 'ribbon'; ribbon.receiveShadow = true;
  group.add(ribbon);

  /* ---------------- 2. the shared halo pool ---------------- */
  const F = track.feat;
  const nFans = (ctx.budget && ctx.budget.crowd) || (low ? 30 : 60);
  const haloCap = 42 + 14 + 16 + 9 + nFans + F.notes.length + 8 + 4;
  const halos = kit.billboards({ texture: 'halo', capacity: haloCap, additive: true, renderOrder: 6 });
  group.add(halos.mesh);
  const halo = [];                          /* {i, x, y, z, size, col, kind, g, k} */
  function addHalo(v, size, hex, kind, g, k) {
    const i = halos.alloc();
    if (i < 0) return null;
    const h = { i, x: v.x, y: v.y, z: v.z, size, col: kit.color(hex), kind, g, k, a: 1 };
    halos.set(i, h.x, h.y, h.z, size, h.col, 0.6, 0, 0);
    halo.push(h);
    return h;
  }

  /* ---------------- 3. Beat Strips ---------------- */
  const chevCount = F.pads.length * 3;
  let chevrons = null;
  const chevronGeo = (function () {
    const sh = new THREE.Shape();
    [[-0.45, 0.08], [0, -0.25], [0.45, 0.08], [0.45, 0.25], [0, -0.08], [-0.45, 0.25]].forEach((p, i) => (i ? sh.lineTo(p[0], p[1]) : sh.moveTo(p[0], p[1])));
    sh.closePath();
    return keep(G.fin(new THREE.ShapeGeometry(sh).rotateX(-Math.PI / 2)));
  }());
  if (chevCount) {
    const m = kit.additive({ vertexColors: true }); ownMats.push(m);
    chevrons = new THREE.InstancedMesh(chevronGeo, m, chevCount);
    chevrons.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(chevCount * 3), 3);
    chevrons.name = 'chevrons'; chevrons.renderOrder = 3;
    const mm = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3();
    F.pads.forEach((p, j) => {
      const f = { x: core.wx(p.x), z: core.wz(p.y), yaw: core.yawDir(Math.cos(p.ang), Math.sin(p.ang)) };
      statics.push(put(paint(G.slab(p.w / U, 0.05, p.len / U, 0.02), C.holoBlue), f, 0.04));
      q.setFromAxisAngle(up, f.yaw);
      for (let c = 0; c < 3; c++) {
        local(f, 0, 0.075, (c - 1) * 0.52, v);
        mm.compose(v, q, sc);
        chevrons.setMatrixAt(j * 3 + c, mm);
      }
    });
    group.add(chevrons);
  }
  const cCyan = kit.color(C.neonCyan), cPink = kit.color(C.neonPink), _cc = new THREE.Color();

  /* ---------------- 4. the Stage Jump ---------------- */
  const J = F.jump;
  const spots = { fireworks: [], cannonsGo: [], cannonsJump: [] };
  if (J) {
    const f = { x: core.wx(J.x), z: core.wz(J.y), yaw: core.yawDir(Math.cos(J.ang), Math.sin(J.ang)) };
    const W = 2.6, L = J.len / U, H = core.RAMP_H, bands = 8, tris = [];
    const hz = (z) => H * (z + L) / L;
    for (let b = 0; b < bands; b++) {
      const z0 = -L + b * L / bands, z1 = z0 + L / bands, col = b % 2 ? C.white : C.bubblegum;
      const A = [-W / 2, hz(z0), z0], B = [W / 2, hz(z0), z0], Cq = [-W / 2, hz(z1), z1], D = [W / 2, hz(z1), z1];
      tris.push([A, Cq, B, col], [B, Cq, D, col]);
    }
    const sideCol = core.shadeHex(C.bubblegum, -0.12);
    tris.push([[-W / 2, 0, -L], [-W / 2, 0, 0], [-W / 2, H, 0], sideCol], [[W / 2, 0, -L], [W / 2, H, 0], [W / 2, 0, 0], sideCol]);
    tris.push([[-W / 2, 0, 0], [W / 2, 0, 0], [-W / 2, H, 0], sideCol], [[W / 2, 0, 0], [W / 2, H, 0], [-W / 2, H, 0], sideCol]);
    statics.push(put(soup(tris), f, 0.017));
    /* 2 side rows of 8 bulbs */
    for (let sd = -1; sd <= 1; sd += 2) for (let k = 0; k < 8; k++) {
      const z = -L + (k + 0.5) * L / 8;
      addHalo(local(f, sd * (W / 2 + 0.07), hz(z) + 0.1, z), 0.3, C.holoLemon, 'jump', sd, k);
    }
    /* twin tube cannons beside the lip, aimed up and out */
    for (let sd = -1; sd <= 1; sd += 2) {
      const base = local(f, sd * (W / 2 + 0.45), 0, -0.2);
      const tube = paint(G.tube(0.13, 0.16, 0.62, 10), C.grape);
      const ring = paint(G.ring(0.14, 0.035, 5, 12), C.starGold);
      G.t(ring, { r: [90, 0, 0], p: [0, 0.31, 0] });
      const cannon = G.merge([tube, ring]);
      G.t(cannon, { r: [0, 0, -sd * 28], p: [0, 0.3, 0] });
      statics.push(G.t(cannon, { r: [0, f.yaw / DEG, 0], p: [base.x, 0.02, base.z] }));
      const mouth = local(f, sd * (W / 2 + 0.45 + 0.29), 0.62, -0.2);
      const dir = local(f, sd * 0.47, 0.88, 0).sub(new THREE.Vector3(f.x, 0, f.z)).normalize();
      spots.cannonsJump.push({ pos: mouth, dir });
    }
  }

  /* ---------------- 5. checkpoint arches + finish gantry ---------------- */
  const gates = core.gateSpots(track);
  const gateBulbs = [];
  gates.forEach((g) => {
    const f = { x: core.wx(g.x), z: core.wz(g.y), yaw: core.yawDir(Math.cos(g.ang), Math.sin(g.ang)) };
    for (let sd = -1; sd <= 1; sd += 2) statics.push(put(G.t(paint(G.bean(0.18, 1.54), C.grape), { p: [sd * 2.95, 0.95, 0] }), f));
    statics.push(put(G.t(paint(G.torusArc(2.95, 0.12, Math.PI, 6, low ? 18 : 28), C.white), { p: [0, 1.9, 0] }), f));
    statics.push(put(G.t(paint(G.tube(0.33, 0.33, 0.08, 18), C.white), { r: [90, 0, 0], p: [0, 4.85, 0] }), f));
    const list = [];
    for (let k = 0; k < 14; k++) {
      const a = Math.PI * (k + 0.5) / 14;
      list.push(addHalo(local(f, 2.95 * Math.cos(a), 1.9 + 2.95 * Math.sin(a), -0.16), 0.36, C.holoLemon, 'gate', g.n - 1, k));
    }
    gateBulbs.push(list);
    g.frame = f;
  });
  /* number discs: one canvas atlas, planes on both faces of each disc */
  const discTex = (function () {
    const c = canvasEl(384, 128), x = c && c.getContext('2d');
    if (x) {
      x.clearRect(0, 0, 384, 128);
      for (let d = 0; d < 3; d++) {
        x.fillStyle = '#FFFFFF'; x.beginPath(); x.arc(64 + d * 128, 64, 60, 0, TAU); x.fill();
        x.lineWidth = 8; x.strokeStyle = C.grape; x.stroke();
        x.fillStyle = C.ink; x.font = '400 84px "Bagel Fat One", "Baloo 2", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.fillText(String(d + 1), 64 + d * 128, 70);
      }
    }
    const t = c ? new THREE.CanvasTexture(c) : new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true;
    return keep(t);
  }());
  const discMat = new THREE.MeshBasicMaterial({ map: discTex, transparent: true, alphaTest: 0.4, toneMapped: false });
  ownMats.push(discMat);
  /* digit quads on both faces of a disc: {f, digit 0..2, r, y, zOff, xo}. Mirroring x on the −z
     face keeps both counter-clockwise and readable from their own side. */
  function discQuads(list) {
    const P = [], UV = [];
    list.forEach((d) => {
      const r = d.r, u0 = d.digit / 3, u1 = (d.digit + 1) / 3;
      [[-1, -1], [1, 1]].forEach(([zs, sx]) => {
        const corners = [[-r, -r, u0, 0], [r, -r, u1, 0], [r, r, u1, 1], [-r, r, u0, 1]];
        const w = corners.map((c) => local(d.f, (d.xo || 0) + c[0] * sx, d.y + c[1], zs * d.zOff));
        [0, 1, 2, 0, 2, 3].forEach((k) => { P.push(w[k].x, w[k].y, w[k].z); UV.push(corners[k][2], corners[k][3]); });
      });
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(P), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(UV), 2));
    g.computeBoundingSphere();
    return keep(g);
  }
  const discs = new THREE.Mesh(discQuads(gates.map((g) => ({ f: g.frame, digit: g.n - 1, r: 0.3, y: 4.85, zOff: 0.05 }))), discMat);
  discs.name = 'gate-discs';
  group.add(discs);

  /* the finish gantry at the line */
  const gf = frameAt(0, 0);
  spots.gantry = gf;
  for (let sd = -1; sd <= 1; sd += 2) {
    statics.push(put(G.t(paint(G.bean(0.2, 3.2), C.grape), { p: [sd * 3.45, 1.8, 0] }), gf));
    statics.push(put(G.t(paint(G.tube(0.36, 0.42, 0.18, 12), C.ink), { p: [sd * 3.45, 0.09, 0] }), gf));
  }
  statics.push(put(G.t(paint(G.slab(7.3, 0.42, 0.46, 0.08), C.white), { p: [0, 3.62, 0] }), gf));
  statics.push(put(G.t(paint(G.slab(5.05, 0.78, 0.14, 0.05), C.ink), { p: [0, 4.22, 0] }), gf));
  for (let face = -1; face <= 1; face += 2) for (let row = 0; row < 2; row++) for (let col = 0; col < 8; col++) {
    const w = 7.0 / 8;
    statics.push(put(G.t(paint(G.box(w, 0.17, 0.02), (row + col) % 2 ? C.white : C.checkA), { p: [-3.5 + (col + 0.5) * w, 3.53 + row * 0.17 - 0.08, face * 0.24] }), gf));
  }
  /* countdown banks: 3 housings × 3 lenses (Neon Pink at 3, 2, 1; all Neon Cyan at GO) */
  const lensGeo = keep(G.t(G.tube(0.12, 0.12, 0.05, 14), { r: [90, 0, 0] }));
  const lens = new THREE.InstancedMesh(lensGeo, kit.mat('state'), 9);
  lens.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(27), 3);
  lens.name = 'bank-lenses';
  const bankHalo = [];
  {
    const mm = new THREE.Matrix4(), q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), gf.yaw), one = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3();
    for (let b = 0; b < 3; b++) {
      statics.push(put(G.t(paint(G.slab(1.0, 0.36, 0.22, 0.06), C.ink), { p: [(b - 1) * 1.6, 3.17, -0.06] }), gf));
      for (let l = 0; l < 3; l++) {
        local(gf, (b - 1) * 1.6 + (l - 1) * 0.3, 3.17, -0.19, v);
        mm.compose(v, q, one); lens.setMatrixAt(b * 3 + l, mm);
        bankHalo.push(addHalo(local(gf, (b - 1) * 1.6 + (l - 1) * 0.3, 3.17, -0.3), 0.75, C.neonPink, 'bank', b, l));
      }
    }
  }
  group.add(lens);
  const gantryBulbs = [];
  for (let k = 0; k < 14; k++) gantryBulbs.push(addHalo(local(gf, -3.25 + k * 6.5 / 13, 3.36, -0.27), 0.32, C.holoLemon, 'gantry', 0, k));
  spots.cannonsGo = [-1, 1].map((sd) => ({ pos: local(gf, sd * 3.45, 3.7, -0.2), dir: local(gf, -sd * 0.35, 1, -0.45).sub(new THREE.Vector3(gf.x, 0, gf.z)).normalize() }));
  spots.gantryCones = [local(gf, -2.6, 3.95, 0), local(gf, 2.6, 3.95, 0)];

  /* the LED board: a scrolling 512×64 canvas, redrawn only when its text changes */
  const ledCanvas = canvasEl(512, 64), ledCtx = ledCanvas && ledCanvas.getContext('2d');
  const ledTex = keep(ledCanvas ? new THREE.CanvasTexture(ledCanvas) : new THREE.DataTexture(new Uint8Array([20, 12, 46, 255]), 1, 1));
  ledTex.colorSpace = THREE.SRGBColorSpace; ledTex.wrapS = THREE.RepeatWrapping;
  const ledMat = new THREE.MeshBasicMaterial({ map: ledTex, toneMapped: false });
  ownMats.push(ledMat);
  {
    const geo = new THREE.PlaneGeometry(4.8, 0.6);
    const back = new THREE.PlaneGeometry(4.8, 0.6).rotateY(Math.PI);
    const a = new THREE.Mesh(keep(geo), ledMat), b = new THREE.Mesh(keep(back), ledMat);
    const p = local(gf, 0, 4.22, -0.08), p2 = local(gf, 0, 4.22, 0.08);
    a.position.copy(p); a.rotation.y = gf.yaw + Math.PI;
    b.position.copy(p2); b.rotation.y = gf.yaw + Math.PI;
    a.name = 'led'; b.name = 'led-back';
    group.add(a, b);
  }
  let ledText = '';
  function drawLed(text) {
    if (text === ledText) return;
    ledText = text;
    if (!ledCtx) return;
    const x = ledCtx;
    x.fillStyle = '#1A1240'; x.fillRect(0, 0, 512, 64);
    x.fillStyle = 'rgba(255,255,255,0.06)';
    for (let i = 0; i < 512; i += 4) x.fillRect(i, 0, 1, 64);
    let size = 38;
    do { x.font = '800 ' + size + 'px "Baloo 2", sans-serif'; size -= 2; } while (size > 16 && x.measureText(text).width > 470);
    const g = x.createLinearGradient(0, 12, 0, 52);
    g.addColorStop(0, C.starGold); g.addColorStop(1, C.neonPink);
    x.fillStyle = g; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(text, 256, 35);
    ledTex.needsUpdate = true;
  }
  drawLed('NEON GRAND PRIX');

  /* ---------------- 6. grandstand, crowd, cone poles, avatar riser ---------------- */
  const gs = core.grandstandSpot(track);
  const crowd = { mesh: null, n: 0, base: [], wands: [] };
  if (gs) {
    const base = frameAt(0, 0), side = gs.side;
    const cx = base.x + base.nx * side * (gs.off / U), cz = base.z + base.nz * side * (gs.off / U);
    const yaw = Math.atan2(-side * base.nx, -side * base.nz);          /* fans face the track */
    const sf = { x: cx, z: cz, yaw };
    spots.stand = sf;
    const width = gs.width, rows = 3;
    for (let k = 0; k < rows; k++) {
      const h = 0.4 * (k + 1), zc = 0.8 - (k + 0.5) * 0.8;
      const tier = G.slab(width, h, 0.82, 0.05);
      G.paintBy(tier, (x, y, z, nx, ny) => (ny > 0.6 ? C.riserTop : C.grape));
      statics.push(put(G.t(tier, { p: [0, h / 2, zc] }), sf));
    }
    /* light poles behind the stand: the cone mounts */
    spots.standCones = [];
    spots.coneHomes = [];
    [-4, 0, 4].forEach((x, i) => {
      statics.push(put(G.t(paint(G.tube(0.08, 0.1, 8.6, 8), C.pebble), { p: [x, 4.3, -2.2] }), sf));
      statics.push(put(G.t(paint(G.slab(0.5, 0.4, 0.4, 0.08), C.ink), { p: [x, 8.7, -2.2] }), sf));
      spots.standCones.push(local(sf, x, 8.75, -2.0));
      spots.coneHomes.push(local(sf, x * 1.6 + (i - 1) * 2, 0, 7 + i));
    });
    /* fan blobs: 3 rows on the tiers, pastel bodies × instanceColor, ink eyes, a wand in the paw */
    /* ≈ 70 tris: a pastel gumdrop, two ink eye discs, a wand handle (the bulb is a halo) */
    const fanGeo = (function () {
      const list = [paint(G.t(G.tube(0.1, 0.12, 0.2, 7, true), { p: [0, 0.1, 0] }), C.white), paint(G.t(G.cone(0.1, 0.07, 7), { p: [0, 0.235, 0] }), C.white)];
      for (let sd = -1; sd <= 1; sd += 2) list.push(paint(G.t(G.circle(0.024, 6), { s: [0.85, 1.2, 1], p: [0.042 * sd, 0.17, 0.112] }), '#4A3F5C'));
      list.push(paint(G.t(G.tube(0.012, 0.014, 0.12, 4, true), { p: [0.11, 0.21, 0.06] }), C.white));
      return keep(G.merge(list));
    }());
    const perRow = Math.max(1, Math.round(nFans / rows));
    crowd.n = perRow * rows;
    crowd.mesh = new THREE.InstancedMesh(fanGeo, kit.mat('toon'), crowd.n);
    crowd.mesh.name = 'crowd'; crowd.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    crowd.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(crowd.n * 3), 3);
    const pastel = [C.holoPink, C.holoBlue, C.holoMint, C.holoLemon, C.bubblegum, '#E3D3FF'];
    const wandPastel = [C.neonPink, C.neonCyan, C.leafMint, C.starGold, C.grape];
    for (let r = 0; r < rows; r++) for (let k = 0; k < perRow; k++) {
      const i = r * perRow + k, hash = (i * 2654435761) >>> 0;
      const x = -width / 2 + 0.45 + (width - 0.9) * (perRow > 1 ? k / (perRow - 1) : 0.5) + ((hash % 7) - 3) * 0.02;
      const zc = 0.8 - (r + 0.5) * 0.8, y = 0.4 * (r + 1);
      const p = local(sf, x, y, zc + 0.05);
      const scale = 1.75 + (hash % 5) * 0.06;
      kit.color(pastel[hash % pastel.length]).toArray(crowd.mesh.instanceColor.array, i * 3);
      const wandHex = wandPastel[(hash >> 3) % wandPastel.length];
      crowd.base.push({ x: p.x, y: p.y, z: p.z, scale, phase: (hash % 100) / 100, u: (k + 0.5) / perRow, wand: kit.color(wandHex) });
      crowd.wands.push(addHalo(p, 0.32, wandHex, 'wand', r, k));
    }
    crowd.yaw = yaw;
    group.add(crowd.mesh);
    /* the avatar's riser beside the stand (MID/HIGH show the avatar) */
    const ar = local(sf, width / 2 + 1.1, 0, 0.5);
    statics.push(G.t(paint(G.tube(0.5, 0.55, 0.5, 14), C.riserTop), { p: [ar.x, 0.25, ar.z] }));
    statics.push(G.t(paint(G.ring(0.5, 0.04, 5, 18), C.neonPink), { r: [90, 0, 0], p: [ar.x, 0.5, ar.z] }));
    spots.avatar = { x: ar.x, y: 0.5, z: ar.z, yaw };
    /* fireworks bloom over the infield in front of the stand */
    for (let k = -1; k <= 1; k++) spots.fireworks.push(local(sf, k * 4.5, 6.5 + Math.abs(k) * 0.8, 9));
  }
  /* cone home aims down the track for the gantry cones */
  spots.gantryHomes = [local(gf, -1.2, 0, 10), local(gf, 1.2, 0, 14)];

  /* ---------------- 7. tyre-stack walls (2 InstancedMeshes) ---------------- */
  const stacks = core.wallStacks(track);
  /* one lathe with three tyre bulges (≈ 98 tris; 50 on LOW) instead of three full tori */
  const tyreGeo = (function () {
    const prof = low
      ? [[0.24, 0], [0.31, 0.11], [0.26, 0.23], [0.31, 0.35], [0.22, 0.47], [0, 0.45]]
      : [[0.22, 0], [0.31, 0.075], [0.26, 0.155], [0.31, 0.235], [0.26, 0.315], [0.31, 0.395], [0.2, 0.47], [0, 0.44]];
    const g = G.fin(new THREE.LatheGeometry(prof.map((p) => new THREE.Vector2(p[0], p[1])), low ? 5 : 7));
    G.paintBy(g, (x, y, z) => (Math.hypot(x, z) < 0.12 && y > 0.4 ? C.ink : core.STACK_COL[Math.min(2, Math.floor(y / 0.16))]));
    return keep(g);
  }());
  const foamGeo = keep(G.t(paint(G.box(0.35, 0.45, 0.5), C.white), { p: [0, 0.225, 0] }));
  const tyreList = stacks.filter((s) => s.kind === 'tyre'), foamList = stacks.filter((s) => s.kind === 'foam');
  function stackMesh(geo, list, tint) {
    const m = new THREE.InstancedMesh(geo, kit.mat('toon'), Math.max(1, list.length));
    m.count = list.length; m.castShadow = true; m.receiveShadow = true;
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, list.length) * 3).fill(1), 3);
    const mm = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3();
    list.forEach((rec, i) => {
      rec.mesh = m; rec.idx = i; rec.wx = core.wx(rec.x); rec.wz = core.wz(rec.y); rec.yaw = core.yawDir(Math.cos(rec.ang), Math.sin(rec.ang));
      q.setFromAxisAngle(up, rec.yaw);
      mm.compose(v.set(rec.wx, 0.01, rec.wz), q, one);
      m.setMatrixAt(i, mm);
      if (tint) kit.color(core.STACK_COL[rec.ci]).toArray(m.instanceColor.array, i * 3);
    });
    m.computeBoundingSphere();
    return m;
  }
  const tyres = stackMesh(tyreGeo, tyreList, false), foams = stackMesh(foamGeo, foamList, true);
  tyres.name = 'tyre-stacks'; foams.name = 'foam-blocks';
  group.add(tyres, foams);
  const wobbles = [];
  function wobbleNear(lx, ly) {
    const i = core.nearestStack(stacks, lx, ly);
    if (i < 0) return;
    const s = stacks[i];
    if (Math.hypot(s.x - lx, s.y - ly) > 2.2 * U) return;
    for (const w of wobbles) if (w.s === s) { w.t = 0; return; }
    if (wobbles.length >= 4) wobbles.shift();
    wobbles.push({ s, t: 0 });
  }

  /* ---------------- 8. Glow Notes ---------------- */
  /* ♪ ≈ 100 tris: a flattened puff head, a stem and a curved flag */
  const noteGeo = (function () {
    const head = paint(G.t(G.puff(0.12), { s: [1.15, 0.85, 0.7], p: [-0.05, 0, 0] }), C.white);
    const stem = paint(G.t(G.tube(0.025, 0.025, 0.36, 5, true), { p: [0.075, 0.18, 0] }), C.white);
    const flag = paint(G.t(G.cone(0.04, 0.17, 4), { s: [1, 1, 0.5], r: [0, 0, -125], p: [0.14, 0.3, 0] }), C.white);
    return keep(G.merge([head, stem, flag]));
  }());
  const nNotes = F.notes.length;
  const notes = nNotes ? new THREE.InstancedMesh(noteGeo, kit.neon(C.neonPink), nNotes) : null;
  const noteBase = [], noteHalo = [];
  if (notes) {
    notes.name = 'glow-notes'; notes.instanceMatrix.setUsage(THREE.DynamicDrawUsage); notes.frustumCulled = false;
    F.notes.forEach((q, i) => {
      noteBase.push({ x: core.wx(q.x), z: core.wz(q.y), ph: i * 0.37 });
      noteHalo.push(addHalo(new THREE.Vector3(core.wx(q.x), 0.45, core.wz(q.y)), 0.6, C.neonCyan, 'note', q.trail, q.k));
    });
    group.add(notes);
  }

  /* ---------------- 9. the Glow Line (Easy Drive) ---------------- */
  const glowGeo = keep(G.gem(0.06));
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, transparent: true, opacity: 0.85 });
  ownMats.push(glowMat);
  const glow = new THREE.InstancedMesh(glowGeo, glowMat, 25);
  glow.name = 'glow-line'; glow.count = 0; glow.frustumCulled = false; glow.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(glow);

  /* ---------------- 10. scenery ---------------- */
  const SL3D = ctx.SL3D;
  const islandModel = (id) => !!(kit.island && SL3D && SL3D.models && SL3D.models[id] && typeof SL3D.models[id].build === 'function' && kit.K.templates);
  function batchOf(id, list, scaleMul) {
    if (!list.length || !islandModel(id)) return false;
    try {
      const K = kit.K, tpl = K.templates.get(id, K.stateKey(id, {}), K.tier, {});
      const mdl = SL3D.models[id];
      const b = K.batch(tpl, { capacity: list.length, material: mdl && mdl.material ? mdl.material : undefined });
      list.forEach((p, i) => b.add('k3d-' + id + '-' + i, { pos: [core.wx(p.x), 0, core.wz(p.y)], yaw: p.yaw / DEG }, { jitter: { yaw: 0, scale: p.scale * scaleMul } }));
      b.commit();
      group.add(b.group);
      batches.push(b);
      return true;
    } catch (e) { return false; }
  }
  const reserved = [];
  if (gs && spots.stand) reserved.push({ x: core.CX + spots.stand.x * U, y: core.CZ + spots.stand.z * U, r: 8.5 * U });
  if (look.setPiece === 'crystals') reserved.push({ x: core.VOLCANO.x, y: core.VOLCANO.y, r: 5.2 * U });
  const nScenery = low ? look.palmsLow : look.palms;
  const scen = core.scatter(track, nScenery + (look.huts || 0), { rect: ctx.rect, reserved, pool: track.id === 'track_beach' ? 220 : 80 });
  const own = [];
  function ownInstanced(geo, list, scaleMul, matKey) {
    if (!list.length) return;
    const m = new THREE.InstancedMesh(keep(geo), kit.mat(matKey || 'toon'), list.length);
    const mm = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), s = new THREE.Vector3(), v = new THREE.Vector3();
    list.forEach((p, i) => { q.setFromAxisAngle(up, p.yaw); s.setScalar(p.scale * scaleMul); mm.compose(v.set(core.wx(p.x), 0, core.wz(p.y)), q, s); m.setMatrixAt(i, mm); });
    m.castShadow = true; m.receiveShadow = true; m.computeBoundingSphere();
    group.add(m); own.push(m);
  }
  function palmGeo() {
    const list = [];
    for (let k = 0; k < 5; k++) list.push(paint(G.t(G.tube(0.09 - k * 0.008, 0.1 - k * 0.008, 0.42, 7), { r: [0, 0, 4 + k * 2], p: [0.02 * k * k, 0.21 + k * 0.38, 0] }), k % 2 ? C.trunk : '#8A5A2B'));
    for (let k = 0; k < 6; k++) {
      const a = k * 60;
      list.push(paint(G.t(G.gem(0.32), { s: [2.3, 0.3, 0.8], r: [0, a, -24], p: [0.2 + Math.cos(a * DEG) * 0.45, 1.98, -Math.sin(a * DEG) * 0.45] }), k % 2 ? C.frond : C.frondDark));
    }
    list.push(paint(G.t(G.gem(0.08), { p: [0.2, 1.88, 0.1] }), '#8A5A2B'), paint(G.t(G.gem(0.08), { p: [0.32, 1.86, -0.06] }), '#8A5A2B'));
    return G.merge(list);
  }
  function treeGeo() {
    return G.merge([
      paint(G.t(G.tube(0.1, 0.14, 0.8, 7, true), { p: [0, 0.4, 0] }), '#9B6B43'),
      paint(G.t(G.puff(0.55), { p: [0, 1.25, 0] }), '#5CB85C'), paint(G.t(G.puff(0.4), { p: [0.3, 1.05, 0.15] }), '#4BA84B'),
      paint(G.t(G.gem(0.38), { p: [-0.28, 1.1, -0.1] }), '#8BD17C')
    ]);
  }
  function umbrellaGeo() {
    const top = G.cone(0.75, 0.32, 12);
    G.paintBy(top, (x, y, z) => (Math.floor((Math.atan2(z, x) / TAU + 1) * 8) % 2 ? C.white : C.coral));
    return G.merge([paint(G.t(G.tube(0.025, 0.025, 1.25, 6), { p: [0, 0.62, 0] }), C.white), G.t(top, { p: [0, 1.3, 0] })]);
  }
  function hutGeo() {
    const body = G.slab(1.0, 0.8, 0.9, 0.05);
    G.paintBy(body, (x, y) => (Math.floor((y + 0.4) / 0.16) % 2 ? C.white : C.coral));
    const roof = paint(G.t(G.cone(0.85, 0.5, 4), { r: [0, 45, 0] }), C.butter);
    const door = paint(G.box(0.3, 0.45, 0.02), C.ink);
    return G.merge([G.t(body, { p: [0, 0.4, 0] }), G.t(roof, { p: [0, 1.05, 0] }), G.t(door, { p: [0, 0.23, 0.46] })]);
  }
  if (look.scenery === 'palms') {
    if (!batchOf('tree_palm', scen, 1.5)) ownInstanced(palmGeo(), scen, 1.45);
  } else if (look.scenery === 'trees') {
    const a = scen.filter((p, i) => i % 2 === 0), b = scen.filter((p, i) => i % 2 === 1);
    if (!batchOf('tree_oak', a, 1.4)) ownInstanced(treeGeo(), a, 1.4);
    if (!batchOf('tree_palm', b, 1.4)) ownInstanced(palmGeo(), b, 1.35);
  } else {
    const huts = scen.slice(0, look.huts || 0), rest = scen.slice(look.huts || 0);
    huts.forEach((h) => { h.yaw = Math.round(h.yaw / (Math.PI / 2)) * (Math.PI / 2); });
    ownInstanced(hutGeo(), huts, 1.3);
    if (!batchOf('umbrella', rest, 1.5)) ownInstanced(umbrellaGeo(), rest, 1.5);
  }

  /* ---------------- 11. the set-piece ---------------- */
  const sp = F.setPiece || { kind: look.setPiece, i0: 0, i1: 0 };
  const setPiece = { kind: look.setPiece };
  if (look.setPiece === 'tunnel') {
    const arches = core.tunnelArches(track, sp, 8);
    const archGeo = keep(paint(G.torusArc(3.05, 0.1, Math.PI, 5, low ? 16 : 24), C.white));
    const m = new THREE.InstancedMesh(archGeo, kit.mat('state'), Math.max(1, arches.length));
    m.count = arches.length; m.name = 'glow-tunnel';
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, arches.length) * 3), 3);
    const mm = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3();
    arches.forEach((a, k) => {
      const f = { x: core.wx(a.x), z: core.wz(a.y), yaw: core.yawDir(Math.cos(a.ang), Math.sin(a.ang)) };
      q.setFromAxisAngle(up, f.yaw); mm.compose(v.set(f.x, 0.05, f.z), q, one); m.setMatrixAt(k, mm);
      for (let sd = -1; sd <= 1; sd += 2) statics.push(put(G.t(paint(G.tube(0.1, 0.13, 0.12, 8), C.ink), { p: [sd * 3.05, 0.06, 0] }), f));
    });
    group.add(m);
    setPiece.arches = m; setPiece.n = arches.length;
    setPiece.lit = [C.neonPink, C.neonCyan, C.neonViolet, C.neonLime].map((h) => kit.color(h));
    setPiece.dim = kit.color(core.mixHex(C.holoPink, C.white, 0.3));
  } else if (look.setPiece === 'crystals') {
    const gems = core.crystalSpots(track, sp);
    const gemGeo = keep(G.t(G.fin(new THREE.OctahedronGeometry(0.42, 0)), { s: [0.8, 1.6, 0.8], p: [0, 0.6, 0] }));
    const m = new THREE.InstancedMesh(gemGeo, kit.mat('pearl'), Math.max(1, gems.length));
    m.count = gems.length; m.name = 'crystal-chicane'; m.castShadow = true;
    const mm = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), v = new THREE.Vector3();
    setPiece.glints = [];
    gems.forEach((g, k) => {
      e.set(0.15 * ((k % 3) - 1), k * 0.9, 0.12 * ((k % 2) * 2 - 1)); q.setFromEuler(e); s.setScalar(g.scale);
      mm.compose(v.set(core.wx(g.x), 0, core.wz(g.y)), q, s); m.setMatrixAt(k, mm);
      setPiece.glints.push(addHalo(new THREE.Vector3(core.wx(g.x), 1.25 * g.scale + 0.1, core.wz(g.y)), 0.9, C.white, 'glint', 0, k));
    });
    group.add(m);
    /* the cute volcano (never erupts): rounded cone, pastel lava rim, 3 lilac smoke puffs */
    const vf = core.volcanoFit(track), r = vf.r, h = vf.h;
    const vx = core.wx(vf.x), vz = core.wz(vf.y);
    /* bottom → top keeps the lathe's faces outward; the crater dips and closes at 0.9 h */
    const prof = [[r * 1.02, 0], [r, 0.02], [0.85 * r, h * 0.2], [0.62 * r, h * 0.55], [0.4 * r, h * 0.9], [0.28 * r, h], [0.2 * r, h * 0.94], [0, h * 0.9]];
    const cone = G.lathe(prof, 16);
    G.paintBy(cone, (x, y) => (y > h * 0.85 ? core.shadeHex(C.volcano, 0.06) : C.volcano));
    statics.push(G.t(cone, { p: [vx, 0, vz] }));
    const rim = new THREE.Mesh(keep(G.t(G.ring(0.26 * r, 0.07 + 0.02 * r, 6, 18), { r: [90, 0, 0], p: [vx, h * 0.985, vz] })), kit.neon(C.lava));
    rim.name = 'lava-rim';
    group.add(rim);
    const puffGeo = keep(paint(G.puff(0.45, true), C.smoke));
    const smoke = new THREE.InstancedMesh(puffGeo, kit.mat('toon'), 3);
    smoke.name = 'volcano-smoke'; smoke.instanceMatrix.setUsage(THREE.DynamicDrawUsage); smoke.frustumCulled = false;
    group.add(smoke);
    setPiece.smoke = smoke; setPiece.vx = vx; setPiece.vz = vz; setPiece.vh = h;
  } else if (look.setPiece === 'dolphins') {
    const pods = core.dolphinSpots(track, ctx.rect);
    const dGeo = (function () {
      const body = paint(G.t(G.bean(0.22, 0.6), { r: [90, 0, 0] }), C.holoBlue);
      const belly = paint(G.t(G.puff(0.18), { s: [0.9, 0.6, 1.8], p: [0, -0.08, 0.05] }), C.white);
      const snout = paint(G.t(G.cone(0.08, 0.22, 8), { r: [90, 0, 0], p: [0, -0.02, 0.6] }), C.holoBlue);
      const fin = paint(G.t(G.cone(0.1, 0.24, 5), { s: [0.35, 1, 1], r: [-20, 0, 0], p: [0, 0.27, -0.02] }), core.shadeHex(C.holoBlue, -0.1));
      const tail = paint(G.t(G.cone(0.18, 0.12, 5), { s: [1.6, 1, 0.35], r: [90, 0, 0], p: [0, 0, -0.62] }), core.shadeHex(C.holoBlue, -0.1));
      const eyes = [-1, 1].map((sd) => paint(G.t(G.puff(0.03), { p: [sd * 0.13, 0.06, 0.38] }), C.ink));
      return keep(G.merge([body, belly, snout, fin, tail].concat(eyes)));
    }());
    const m = new THREE.InstancedMesh(dGeo, kit.mat('toon'), Math.max(1, pods.length));
    m.count = pods.length; m.name = 'dolphin-pals'; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false;
    group.add(m);
    setPiece.dolphins = m;
    setPiece.pods = pods.map((p) => ({ x: core.wx(p.x), z: core.wz(p.y), yaw: core.yawDir(Math.cos(p.ang), Math.sin(p.ang)), phase: p.phase }));
  }

  /* ---------------- 12. the results podium (hidden) ---------------- */
  const ps = core.podiumSpot(track);
  const podium = new THREE.Group();
  podium.name = 'podium'; podium.visible = false;
  {
    const f = { x: core.wx(ps.x), z: core.wz(ps.y), yaw: core.yawDir(Math.cos(ps.ang), Math.sin(ps.ang)) };
    /* the front faces the infield: rotate the step row to face along the lateral axis */
    const faceYaw = f.yaw + (ps.face > 0 ? -Math.PI / 2 : Math.PI / 2);
    const pf = { x: f.x, z: f.z, yaw: faceYaw };
    const P = core.PODIUM, list = [];
    [0, 1, 2].forEach((k) => {
      const step = G.slab(P.w, P.h[k], P.d, 0.06);
      G.paintBy(step, (x, y, z, nx, ny) => (ny > 0.6 ? C.riserTop : k === 0 ? C.starGold : k === 1 ? '#DDE3F0' : '#E8A15B'));
      list.push(G.t(step, { p: [P.x[k], P.h[k] / 2, 0] }));
    });
    list.push(G.t(paint(G.slab(4.4, 0.06, 2.0, 0.03), C.neonPink), { p: [0, 0.03, 0.2] }));
    const pg = keep(put(G.merge(list), pf));
    const pm = new THREE.Mesh(pg, kit.mat('toon'));
    pm.name = 'podium-steps';
    podium.add(pm);
    const pd = new THREE.Mesh(discQuads([0, 1, 2].map((k) => ({ f: pf, digit: k, r: 0.2, y: P.h[k] * 0.5, zOff: P.d / 2 + 0.02, xo: P.x[k] }))), discMat);
    pd.name = 'podium-digits';
    podium.add(pd);
    const slot = (x, y, z) => { const v = local(pf, x, y, z); return { x: v.x, y, z: v.z, yaw: faceYaw }; };
    spots.podium = {
      x: f.x, z: f.z, yaw: faceYaw,
      slots: [0, 1, 2].map((k) => slot(P.x[k], P.h[k], 0)),             /* P1 · P2 · P3 */
      front: [-1.6, 0, 1.6].map((x) => slot(x, 0, 1.75))                 /* everyone else, in front */
    };
  }
  group.add(podium);

  /* ---------------- 13. merge every static toon part into one mesh ---------------- */
  const staticGeo = keep(G.merge(statics));
  const staticMesh = new THREE.Mesh(staticGeo, kit.mat('toon'));
  staticMesh.name = 'track-props'; staticMesh.castShadow = true; staticMesh.receiveShadow = true;
  group.add(staticMesh);
  halos.commit();

  /* ---------------- per-frame ---------------- */
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _v = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
  const cLemon = kit.color(C.holoLemon), cMint = kit.color(C.leafMint), cInk = kit.color('#4A3F5C'), cBankPink = kit.color(C.neonPink), cBankCyan = kit.color(C.neonCyan), cWhite = kit.color(C.white);
  let ledScroll = 0;
  function update(dt, st) {
    const t = st.t || 0, red = !!st.reduced, hs = st.haloScale || 1, ha = st.haloAlpha == null ? 0.5 : st.haloAlpha;
    /* Beat Strip chevrons (Neon Cyan ↔ Neon Pink with the half-time beat) */
    if (chevrons) {
      const mix = core.chevronMix(core.beatPhase(t)), arr = chevrons.instanceColor.array;
      _cc.copy(cCyan).lerp(cPink, mix).multiplyScalar(0.85);
      for (let i = 0; i < chevCount; i++) _cc.toArray(arr, i * 3);
      chevrons.instanceColor.needsUpdate = true;
    }
    /* gate bulbs: Holo Lemon until passed this lap, then a Leaf Mint chase */
    for (let g = 0; g < gateBulbs.length; g++) {
      const passed = st.gates > g, list = gateBulbs[g];
      for (let k = 0; k < list.length; k++) {
        const h = list[k]; if (!h) continue;
        const a = passed ? (red ? 0.9 : 0.4 + 0.6 * core.bulbChase(k, 14, t)) : 0.75;
        halos.set(h.i, h.x, h.y, h.z, h.size * hs, passed ? cMint : cLemon, a * (0.6 + ha * 0.5), 0, 0);
      }
    }
    for (let k = 0; k < gantryBulbs.length; k++) {
      const h = gantryBulbs[k]; if (!h) continue;
      halos.set(h.i, h.x, h.y, h.z, h.size * hs, cLemon, (red ? 0.8 : 0.45 + 0.55 * core.bulbChase(k, 14, t)) * (0.6 + ha * 0.5), 0, 0);
    }
    /* countdown banks */
    const lensArr = lens.instanceColor.array;
    for (let b = 0; b < 3; b++) for (let l = 0; l < 3; l++) {
      const i = b * 3 + l, h = bankHalo[i];
      const on = st.go || (st.banks >= 0 && b < st.banks);
      const col = st.go ? cBankCyan : on ? cBankPink : cInk;
      col.toArray(lensArr, i * 3);
      if (h) halos.set(h.i, h.x, h.y, h.z, h.size, st.go ? cBankCyan : cBankPink, on ? 0.95 : 0, 0, 0);
    }
    lens.instanceColor.needsUpdate = true;
    /* jump bulbs: a gentle marquee */
    for (const h of halo) {
      if (h.kind === 'jump') halos.set(h.i, h.x, h.y, h.z, h.size * hs, cLemon, (red ? 0.8 : 0.5 + 0.5 * core.bulbChase(h.k, 8, t)) * (0.6 + ha * 0.5), 0, 0);
    }
    /* Glow Notes: hover 0.45 u, spin 0.5 rev/s, bob 0.06 u; a collected note hides until the next lap */
    if (notes) {
      for (let i = 0; i < nNotes; i++) {
        const b = noteBase[i], got = st.noteGot && st.noteGot[i];
        const y = 0.45 + (red ? 0 : 0.06 * Math.sin(TAU * (t * 1 + b.ph)));
        _q.setFromAxisAngle(_up, red ? 0.6 : TAU * 0.5 * t + b.ph * 3);
        _s.setScalar(got ? 0 : 1);
        _m.compose(_v.set(b.x, y, b.z), _q, _s);
        notes.setMatrixAt(i, _m);
        const h = noteHalo[i];
        if (h) halos.set(h.i, b.x, y + 0.12, b.z, h.size * hs, h.col, got ? 0 : 0.55 + ha * 0.3, 0, 0);
      }
      notes.instanceMatrix.needsUpdate = true;
    }
    /* the crowd: sway ±15° at 1 Hz, the stadium wave, wands in the signature colour on Spotlight */
    if (crowd.mesh) {
      const arr = crowd.mesh.instanceMatrix.array;
      for (let i = 0; i < crowd.n; i++) {
        const c = crowd.base[i];
        const sway = core.crowdSway(t, c.phase, red), lift = red ? 0 : 0.35 * core.waveLift(c.u, st.waveSince);
        _e.set(0, crowd.yaw, sway, 'YXZ'); _q.setFromEuler(_e); _s.setScalar(c.scale);
        _m.compose(_v.set(c.x, c.y + lift, c.z), _q, _s);
        _m.toArray(arr, i * 16);
        const h = crowd.wands[i];
        if (h) {
          /* the wand tip follows the sway */
          const tipX = 0.11 * c.scale, tipY = 0.28 * c.scale, cs = Math.cos(sway), sn = Math.sin(sway);
          const lx = tipX * cs - tipY * sn, ly = tipX * sn + tipY * cs, cy = Math.cos(crowd.yaw), sy = Math.sin(crowd.yaw);
          const wcol = st.wandHex || c.wand;
          halos.set(h.i, c.x + lx * cy + 0.06 * c.scale * sy, c.y + lift + ly, c.z - lx * sy + 0.06 * c.scale * cy, h.size * hs * (st.wandHex ? 1.25 : 1), wcol, 0.45 + 0.55 * Math.max(st.encore || 0, st.wandHex ? 1 : 0), 0, 0);
        }
      }
      crowd.mesh.instanceMatrix.needsUpdate = true;
    }
    /* wall wobbles */
    for (let w = wobbles.length - 1; w >= 0; w--) {
      const wb = wobbles[w], s = wb.s;
      wb.t += dt;
      const k = red ? 1 : core.wobbleScale(wb.t);
      _q.setFromAxisAngle(_up, s.yaw); _s.set(k, 2 - k, k);
      _m.compose(_v.set(s.wx, 0.01, s.wz), _q, _s);
      s.mesh.setMatrixAt(s.idx, _m);
      s.mesh.instanceMatrix.needsUpdate = true;
      if (wb.t >= 0.3) wobbles.splice(w, 1);
    }
    /* the set-piece */
    if (setPiece.arches) {
      const arr = setPiece.arches.instanceColor.array;
      for (let k = 0; k < setPiece.n; k++) {
        const lit = red ? (k % 2 === 0) : core.tunnelLit(k, setPiece.n, t);
        (lit ? setPiece.lit[k % setPiece.lit.length] : setPiece.dim).toArray(arr, k * 3);
      }
      setPiece.arches.instanceColor.needsUpdate = true;
    }
    if (setPiece.glints) {
      setPiece.glints.forEach((h, k) => {
        if (!h) return;
        const a = red ? 0.35 : 0.15 + 0.6 * Math.max(0, Math.cos(TAU * (t / core.BEAT2) + k * 1.3));
        halos.set(h.i, h.x, h.y, h.z, h.size * hs, cWhite, a, 0, 0);
      });
    }
    if (setPiece.smoke) {
      const m = setPiece.smoke;
      for (let k = 0; k < 3; k++) {
        const u = red ? 0.3 + k * 0.2 : (((t / 3) + k / 3) % 1);
        const sc = (0.35 + 0.7 * u) * (u > 0.8 ? (1 - u) / 0.2 : 1);
        _q.identity(); _s.setScalar(Math.max(0.001, sc));
        _m.compose(_v.set(setPiece.vx + 0.3 * Math.sin(k * 2 + u * 2), setPiece.vh + 0.2 + u * 2.4, setPiece.vz + 0.25 * k - 0.25), _q, _s);
        m.setMatrixAt(k, _m);
      }
      m.instanceMatrix.needsUpdate = true;
    }
    if (setPiece.dolphins) {
      const m = setPiece.dolphins, period = 8 * 60 / 140;
      setPiece.pods.forEach((p, k) => {
        const u = red ? 0.5 : (((t / period) + p.phase) % 1);
        const leap = u < 0.35 ? u / 0.35 : -1;
        let y = -1.2, pitch = 0, along = 0;
        if (leap >= 0) { y = -0.45 + 1.65 * core.arc(leap); pitch = (leap - 0.5) * 1.6; along = (leap - 0.5) * 3; }
        if (red) { y = 0.05; pitch = 0; }
        _e.set(pitch, p.yaw, 0, 'YXZ'); _q.setFromEuler(_e); _s.setScalar(1.3);
        _m.compose(_v.set(p.x + Math.sin(p.yaw) * along, y - 0.32, p.z + Math.cos(p.yaw) * along), _q, _s);
        m.setMatrixAt(k, _m);
      });
      m.instanceMatrix.needsUpdate = true;
    }
    /* the LED board */
    if (st.led) drawLed(st.led);
    if (!red) { ledScroll = (ledScroll + dt * 0.06) % 1; ledTex.offset.x = ledScroll; } else ledTex.offset.x = 0;
    halos.commit();
  }

  /* the Glow Line dots (Easy Drive): pts = flat [x, y, z, …] world, n ≤ 25 */
  function setGlowLine(pts, n, hex) {
    if (!pts || !n) { glow.count = 0; return; }
    glow.count = Math.min(25, n);
    glowMat.color.set(hex || C.neonPink);
    _q.identity(); _s.setScalar(1);
    for (let i = 0; i < glow.count; i++) { _m.compose(_v.set(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]), _q, _s); glow.setMatrixAt(i, _m); }
    glow.instanceMatrix.needsUpdate = true;
  }
  function notePos(i, out) {
    const b = noteBase[i];
    return b ? out.set(b.x, 0.5, b.z) : out.set(0, 0, 0);
  }

  function canvasEl(w, h) {
    if (typeof document === 'undefined' || !document.createElement) return null;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  return {
    group, track, spots, stacks, setPiece, podium, halos,
    update, setGlowLine, notePos, wobbleNear, drawLed,
    setReduced(on) { reduced = !!on; },
    showPodium(on) { podium.visible = !!on; },
    info() { return { tris: rib.tris, stacks: stacks.length, halos: halo.length, fans: crowd.n, scenery: scen.length, batches: batches.length }; },
    dispose() {
      if (group.parent) group.parent.remove(group);
      batches.forEach((b) => { try { b.dispose(); } catch (e) { /* gone */ } });
      kit.release(halos);
      group.traverse((o) => { if (o.isInstancedMesh && typeof o.dispose === 'function') o.dispose(); });
      disposables.forEach((d) => { try { d.dispose(); } catch (e) { /* gone */ } });
      ownMats.forEach((m) => kit.release(m));
      group.clear();
    }
  };
}
