/* ================================================================
   Neon Grand Prix 3D — the racers (ES module; THREE comes in ctx).
     makePlayer(ctx)        the child's kart (SL3D.make('kart_<colour>') in its LOCKED
                            colour, else a lite kart) with the active pet driving
                            (SL3D.makeRig → the built-in 'drive' clip on the seat
                            socket, all accessories; else miniPet), the additive
                            under-glow, the drift ground ring, the boost glitter jet
                            and the Map-cam ▼ marker.
     makeRivals(ctx, crew)  the Glow Crew: white karts with a colour stripe and number
                            discs, each driven by an original bean mascot with its
                            topper — one merged vertex-coloured mesh per rival, all 20
                            wheels in one InstancedMesh, waving paws, and additive
                            see-through sleeves (one InstancedMesh) when a rival would
                            block the view. No under-glow: the child's kart is the shiny one.
     makePacers(ctx, list)  Solo pacers: opaque PEARL shells + medal-coloured sleeves.
     makeAvatar(ctx, user)  the child's chibi bean on the riser, waving an Island Wand (MID/HIGH).
   Nothing here casts into the static shadow map (karts use blob shadows).
   ================================================================ */

const DEG = Math.PI / 180;
/* kart geometry constants shared with models-attractions.js (0.9 u long) */
const KART = { axleF: [0, 0.1, 0.26], axleB: [0, 0.1, -0.26], seat: [0, 0.22, -0.1], wheelX: 0.25, wheelR: 0.1, exhaust: [0, 0.14, -0.44] };
const PET_SCALE = 0.85;
/* the pet rig's seat socket in item space (models-characters socketsOf().seat) */
const RIG_SEAT = [0, 0.09, -0.08];

function noShadow(o) { o.traverse((m) => { if (m.isMesh || m.isInstancedMesh || m.isSkinnedMesh) m.castShadow = false; }); }

/* ================================================================
   THE PLAYER
   ================================================================ */
export function makePlayer(ctx) {
  const { THREE, kit, core, SL3D } = ctx;
  const G = kit.G, C = core.COL;
  const kartId = core.kartId(ctx.kart), kartHex = core.kartHex(kartId);
  const disposables = [], ownMats = [];
  const keep = (x) => { disposables.push(x); return x; };

  const root = new THREE.Group(); root.name = 'player';
  const body = new THREE.Group(); body.name = 'player-body';        /* roll, squash, spin, hop */
  root.add(body);

  /* ---- the kart ---- */
  let model = null, pivots = null;
  if (SL3D && typeof SL3D.make === 'function') {
    try { model = SL3D.make(kartId, {}, ctx.tier); } catch (e) { model = null; }
  }
  if (model && model.userData && model.userData.pivots) pivots = model.userData.pivots;
  else { model = liteKart(ctx, kartHex, kartId); pivots = model.userData.pivots; }
  body.add(model);
  noShadow(model);

  /* ---- the driver: the island pet rig in its 'drive' clip, or the mini pet ---- */
  const pet = ctx.pet || {};
  const petId = /^pet_(puppy|kitten|bunny|dragon)$/.test(pet.id) ? pet.id : 'pet_puppy';
  let rig = null, mini = null;
  const driverHolder = new THREE.Group();
  driverHolder.name = 'driver';
  (pivots.seat || model).add(driverHolder);
  if (SL3D && typeof SL3D.makeRig === 'function') {
    try { rig = SL3D.makeRig(petId, pet.acc || {}, ctx.tier); } catch (e) { rig = null; }
  }
  if (rig && rig.root) {
    rig.root.scale.setScalar(PET_SCALE);
    rig.root.position.set(-RIG_SEAT[0] * PET_SCALE, -RIG_SEAT[1] * PET_SCALE, -RIG_SEAT[2] * PET_SCALE);
    driverHolder.add(rig.root);
    noShadow(rig.root);
  } else {
    rig = null;
    mini = miniPet(ctx, petId);
    driverHolder.add(mini.root);
  }

  /* ---- under-glow (additive, in the body colour; brightens with the Hype Wand) ---- */
  const glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(kartHex), map: kit.tex.halo(), transparent: true, opacity: 0.3,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  ownMats.push(glowMat);
  const glow = new THREE.Mesh(keep(new THREE.PlaneGeometry(0.95, 1.35).rotateX(-Math.PI / 2)), glowMat);
  glow.name = 'under-glow'; glow.position.y = 0.035; glow.renderOrder = 2;
  root.add(glow);
  /* ---- drift ground ring (tier colour) ---- */
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  ownMats.push(ringMat);
  const ring = new THREE.Mesh(keep(new THREE.RingGeometry(0.58, 0.7, 32).rotateX(-Math.PI / 2)), ringMat);
  ring.name = 'drift-ring'; ring.position.y = 0.04; ring.visible = false; ring.renderOrder = 2;
  root.add(ring);
  /* ---- boost glitter jet: an additive cone in the kart colour (never fire) ---- */
  const jetGeo = (function () {
    /* base at the exhaust (z 0), tip 0.9 u behind; bright at the base, fading to nothing */
    const g = G.fin(new THREE.ConeGeometry(0.15, 0.9, 10, 1, true).rotateX(-Math.PI / 2).translate(0, 0, -0.45));
    G.paintBy(g, (x, y, z) => { const v = Math.max(0, Math.min(1, 1 + z / 0.9)); return new THREE.Color(v, v, v); });
    return keep(g);
  }());
  const jetMat = kit.additive({ vertexColors: true, color: kartHex, side: THREE.DoubleSide });
  ownMats.push(jetMat);
  const jet = new THREE.Mesh(jetGeo, jetMat);
  jet.name = 'boost-jet'; jet.position.set(0, 0.16, -0.47); jet.visible = false; jet.renderOrder = 3;
  body.add(jet);
  /* ---- the Map-cam ▼ marker in the signature colour ---- */
  const marker = new THREE.Mesh(keep(G.t(G.cone(0.32, 0.55, 4), { r: [180, 45, 0] })), kit.neon(ctx.sigHex || C.neonPink));
  marker.name = 'marker'; marker.position.y = 2.4; marker.visible = false;
  root.add(marker);

  const tierCols = core.TIER_COL.map((h) => new THREE.Color(h));
  let wheelA = 0, clipName = 'drive', clipT = 0, lastClip = '';

  /* st: {dt, t, v (u/s), steer (−1..1, + = right), drifting, tier, grey, boost, boostK, wand (0..1),
          spot, roll, squashY, squashXZ, spinTurn, hop, y, trickT, clip, clipT, encore, marker,
          reduced, petStand} */
  function update(st) {
    const dt = st.dt || 0;
    /* body: roll into turns, squash, spin, hop */
    body.position.y = (st.hop || 0);
    body.rotation.set(0, st.spinTurn || 0, st.roll || 0, 'YXZ');
    const sxz = st.squashXZ || 1;
    body.scale.set(st.squashX != null ? st.squashX : sxz, st.squashY || 1, st.squashZ != null ? st.squashZ : sxz);
    /* wheels turn with v; the front ones steer */
    wheelA += (st.v || 0) / KART.wheelR * dt;
    if (pivots.wheelF) pivots.wheelF.rotation.x = wheelA;
    if (pivots.wheelB) pivots.wheelB.rotation.x = wheelA;
    if (pivots.steer) pivots.steer.rotation.y = -0.35 * (st.steer || 0);
    /* under-glow: 0.25 + 0.75 × wand; Spotlight = full with a 1.6× halo */
    glowMat.opacity = st.spot ? 1 : 0.25 + 0.75 * (st.wand || 0);
    glow.scale.setScalar(st.spot ? 1.6 : 1);
    /* drift ring in the spark-tier colour (grey while the charge drains) */
    ring.visible = !!st.drifting;
    if (ring.visible) { ringMat.color.copy(tierCols[st.grey ? 0 : Math.max(1, st.tier || 0)]); ringMat.opacity = st.tier ? 0.9 : 0.45; }
    /* boost jet */
    jet.visible = (st.boostK || 0) > 0.02;
    if (jet.visible) {
      const k = st.boostK, wob = st.reduced ? 1 : 1 + 0.08 * Math.sin(core.TAU * 1.5 * (st.t || 0));
      jet.scale.set(0.8 + 0.4 * k, 0.8 + 0.4 * k, (0.5 + 0.7 * k) * wob);
      jetMat.opacity = 0.35 + 0.6 * k;
    }
    /* map marker bobs gently */
    marker.visible = !!st.marker;
    if (marker.visible) { marker.position.y = 2.4 + (st.reduced ? 0 : 0.12 * Math.sin(core.TAU * 0.5 * (st.t || 0))); marker.rotation.y += st.reduced ? 0 : dt * 1.2; }
    /* the driver */
    const clip = st.clip || 'drive';
    if (clip !== lastClip) { lastClip = clip; }
    clipName = clip; clipT = st.clipT != null ? st.clipT : clipT + dt;
    driverHolder.position.y = st.petStand ? 0.12 : 0;
    driverHolder.rotation.y = st.trickSpin || 0;
    if (rig) {
      const o = { speed: st.v || 0, steer: -(st.steer || 0), reduced: !!st.reduced, intensity: 1, bpm: 118 };
      try { rig.play(clipName, clipT, o); if (rig.setShow) rig.setShow(st.encore || 0); } catch (e) { /* keep the last pose */ }
    } else if (mini) mini.play(clipName, clipT, st);
  }

  return {
    root, body, model, rig, mini, glow, ring, jet, marker, kartHex, kartId, petId,
    seatWorld(out) { return driverHolder.getWorldPosition(out); },
    update,
    dispose() {
      if (root.parent) root.parent.remove(root);
      if (rig && rig.dispose) { try { rig.dispose(); } catch (e) { /* gone */ } }
      if (mini) mini.dispose();
      if (model && model.userData && typeof model.userData.dispose === 'function') { try { model.userData.dispose(); } catch (e) { /* gone */ } }
      disposables.forEach((d) => { try { d.dispose(); } catch (e) { /* gone */ } });
      ownMats.forEach((m) => kit.release(m));
      root.clear();
    }
  };
}

/* a kart from plain primitives in the LOCKED colour (when the island models are missing) */
function liteKart(ctx, hex, kartId) {
  const { THREE, kit, core } = ctx;
  const G = kit.G, C = core.COL, disposables = [];
  const keep = (x) => { disposables.push(x); return x; };
  const p = (geo, c) => G.paint(geo, kit.color(c));
  const g = new THREE.Group(); g.name = 'lite-kart';
  const isGold = kartId === 'kart_gold';
  const shell = keep(G.merge([
    G.t(G.slab(0.4, 0.12, 0.66, 0.04), { p: [0, 0.16, -0.02] }),
    G.t(G.puff(0.078, true), { s: [1, 1, 1.9], p: [0, 0.155, 0.3] }),
    G.t(G.tube(0.06, 0.06, 0.46, 10), { s: [0.3, 1, 1], r: [0, 0, 90], p: [0, 0.37, -0.39] })
  ]));
  p(shell, hex);
  const bodyMesh = new THREE.Mesh(shell, isGold ? kit.mat('gold') : kit.mat('toon'));
  const extras = keep(G.merge([
    p(G.t(G.tube(0.06, 0.06, 0.26, 10), { r: [0, 0, 90], p: [0, 0.28, -0.22] }), core.shadeHex(hex, -0.12)),
    p(G.t(G.ring(0.055, 0.012, 5, 12), { r: [-62, 0, 0], p: [0, 0.285, 0.075] }), C.ink),
    p(G.t(G.tube(0.012, 0.012, 0.12, 5), { r: [-50, 0, 0], p: [0, 0.24, 0.12] }), C.ink),
    p(G.t(G.tube(0.02, 0.02, 0.36, 8), { r: [0, 0, 90], p: [0, 0.1, 0.39] }), '#DDE3F0')
  ]));
  g.add(bodyMesh, new THREE.Mesh(extras, kit.mat('toon')));
  const pivots = { root: g };
  [['seat', KART.seat], ['steer', KART.axleF], ['wheelB', KART.axleB]].forEach(([n, o]) => { const q = new THREE.Group(); q.name = n; q.position.set(o[0], o[1], o[2]); g.add(q); pivots[n] = q; });
  pivots.wheelF = new THREE.Group(); pivots.wheelF.name = 'wheelF'; pivots.steer.add(pivots.wheelF);
  const wheelGeo = keep(G.merge([-1, 1].map((sd) => G.merge([
    p(G.t(G.tube(KART.wheelR, KART.wheelR, 0.08, 12), { r: [0, 0, 90], p: [sd * KART.wheelX, 0, 0] }), C.ink),
    p(G.t(G.tube(0.05, 0.05, 0.084, 8), { r: [0, 0, 90], p: [sd * KART.wheelX, 0, 0] }), C.pebble)
  ]))));
  pivots.wheelF.add(new THREE.Mesh(wheelGeo, kit.mat('toon')));
  pivots.wheelB.add(new THREE.Mesh(wheelGeo, kit.mat('toon')));
  g.userData = { pivots, dispose() { disposables.forEach((d) => d.dispose()); if (g.parent) g.parent.remove(g); g.clear(); } };
  return g;
}

/* the mini pet (≤ 900 tris): bean body, puff head, species ears / tail / wings, glossy eyes, blush */
function miniPet(ctx, petId) {
  const { THREE, kit, core } = ctx;
  const G = kit.G, col = core.PETCOL[petId] || core.PETCOL.pet_puppy, C = core.COL, disposables = [];
  const keep = (x) => { disposables.push(x); return x; };
  const p = (geo, c) => G.paint(geo, kit.color(c));
  const root = new THREE.Group(); root.name = 'mini-pet';
  root.position.set(0, -0.02, 0.02);
  const torso = new THREE.Group(), head = new THREE.Group();
  root.add(torso); torso.add(head);
  head.position.set(0, 0.3, 0.04);
  const bodyGeo = keep(G.merge([
    p(G.t(G.bean(0.13, 0.08), { p: [0, 0.14, 0] }), col.body),
    p(G.t(G.puff(0.09), { s: [1, 0.8, 0.6], p: [0, 0.12, 0.09] }), col.light),
    ...[-1, 1].map((sd) => p(G.t(G.puff(0.045), { p: [sd * 0.09, 0.2, 0.16] }), col.light))      /* paws on the wheel */
  ]));
  torso.add(new THREE.Mesh(bodyGeo, kit.mat('toon')));
  const ears = [];
  [-1, 1].forEach((sd) => {
    if (petId === 'pet_bunny') ears.push(p(G.t(G.bean(0.035, 0.16), { r: [0, 0, -sd * 8], p: [sd * 0.06, 0.24, 0] }), col.body));
    else if (petId === 'pet_kitten') ears.push(p(G.t(G.cone(0.05, 0.09, 4), { r: [0, 0, -sd * 15], p: [sd * 0.09, 0.15, 0] }), col.dark));
    else if (petId === 'pet_dragon') ears.push(p(G.t(G.cone(0.03, 0.08, 6), { r: [-20, 0, -sd * 10], p: [sd * 0.07, 0.15, -0.02] }), C.butter));
    else ears.push(p(G.t(G.puff(0.06), { s: [0.7, 1.4, 0.5], r: [0, 0, sd * 20], p: [sd * 0.13, 0.05, 0] }), col.dark));
  });
  const face = [
    p(G.puff(0.15, true), col.body),
    p(G.t(G.puff(0.07), { s: [1.1, 0.8, 0.7], p: [0, -0.04, 0.12] }), col.light),
    p(G.t(G.puff(0.022), { p: [0, -0.01, 0.17] }), col.nose)
  ];
  [-1, 1].forEach((sd) => {
    face.push(p(G.t(G.puff(0.032, true), { s: [0.9, 1.15, 0.6], p: [sd * 0.06, 0.03, 0.13] }), C.ink));
    face.push(p(G.t(G.puff(0.011), { p: [sd * 0.06 + 0.01, 0.05, 0.155] }), C.white));
    face.push(p(G.t(G.puff(0.026), { s: [1.2, 0.5, 0.4], p: [sd * 0.1, -0.04, 0.115] }), C.blush));
  });
  const headGeo = keep(G.merge(face.concat(ears)));
  head.add(new THREE.Mesh(headGeo, kit.mat('toon')));
  const tailGeo = keep(petId === 'pet_dragon'
    ? G.merge([p(G.t(G.cone(0.05, 0.22, 6), { r: [-110, 0, 0], p: [0, 0.1, -0.2] }), col.dark),
      ...[-1, 1].map((sd) => p(G.t(G.cone(0.08, 0.16, 3), { s: [1, 1, 0.3], r: [0, 0, sd * 70], p: [sd * 0.14, 0.24, -0.05] }), col.light))])
    : p(G.t(G.puff(petId === 'pet_bunny' ? 0.05 : 0.04, true), { s: [1, 1, petId === 'pet_bunny' ? 1 : 1.8], p: [0, 0.1, -0.15] }), petId === 'pet_bunny' ? C.white : col.dark));
  torso.add(new THREE.Mesh(tailGeo, kit.mat('toon')));
  root.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  function play(clip, t, st) {
    const red = !!st.reduced;
    torso.position.y = 0; torso.rotation.set(0, 0, 0); head.rotation.set(0, 0, 0);
    if (clip === 'dance' || clip === 'cheer') {
      torso.position.y = red ? 0.03 : 0.06 * Math.abs(Math.sin(core.TAU * 1.0 * t));
      torso.rotation.y = red || clip === 'cheer' ? 0 : core.TAU * Math.max(0, Math.min(1, (t % 4) - 2));
      head.rotation.z = red ? 0.15 : 0.2 * Math.sin(core.TAU * 0.9 * t);
    } else if (clip === 'dizzy') {
      head.rotation.z = red ? 0.12 : 0.18 * Math.sin(core.TAU * 0.9 * t); head.rotation.x = red ? 0 : 0.1 * Math.cos(core.TAU * 0.9 * t);
    } else {
      torso.rotation.z = 0.14 * (st.steer || 0);
      head.rotation.y = -0.3 * (st.steer || 0);
      if (!red) torso.position.y = 0.008 * Math.sin(core.TAU * 2 * t);
    }
  }
  return { root, play, dispose() { disposables.forEach((d) => d.dispose()); if (root.parent) root.parent.remove(root); root.clear(); } };
}

/* ================================================================
   THE GLOW CREW
   ================================================================ */
/* 7-segment digits 1–5 (a top, b top-right, c bottom-right, d bottom, e bottom-left, f top-left, g middle) */
const SEG = { 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd' };
function digitGeos(G, n, w, h, th) {
  const out = [], hw = w / 2, hh = h / 2;
  const seg = { a: [0, hh, w, th], d: [0, -hh, w, th], g: [0, 0, w, th], b: [hw, hh / 2, th, hh], c: [hw, -hh / 2, th, hh], e: [-hw, -hh / 2, th, hh], f: [-hw, hh / 2, th, hh] };
  (SEG[n] || '').split('').forEach((k) => { const s = seg[k]; out.push(G.t(G.box(s[2], s[3], 0.012), { p: [s[0], s[1], 0] })); });
  return out;
}
function rivalGeo(ctx, r, num) {
  const { kit, core } = ctx;
  const G = kit.G, C = core.COL, low = ctx.tier === 'LOW';
  const p = (geo, c) => G.paint(geo, kit.color(c));
  const col = r.color || C.bubblegum, shade = core.shadeHex(col, -0.12);
  /* ≈ 1,050 tris on MID/HIGH, ≈ 700 on LOW (one merged vertex-coloured mesh) */
  const list = [
    /* the white toon kart with a colour stripe */
    p(G.t(G.roundBox(0.4, 0.12, 0.66, 0.04), { p: [0, 0.16, -0.02] }), C.white),
    p(G.t(low ? G.gem(0.078) : G.puff(0.078), { s: [1, 1, 1.9], p: [0, 0.155, 0.3] }), C.white),
    p(G.t(G.box(0.09, 0.012, 0.62), { p: [0, 0.226, 0.0] }), col),
    p(G.t(G.tube(0.06, 0.06, 0.46, low ? 6 : 8), { s: [0.3, 1, 1], r: [0, 0, 90], p: [0, 0.37, -0.39] }), C.white),
    p(G.t(G.ring(0.055, 0.012, 3, low ? 6 : 8), { r: [-62, 0, 0], p: [0, 0.285, 0.075] }), C.ink),
    /* the number disc on the spoiler back + the digit */
    p(G.t(G.circle(0.085, low ? 8 : 12), { r: [0, 180, 0], p: [0, 0.37, -0.412] }), C.white),
    ...digitGeos(G, num, 0.06, 0.1, 0.016).map((g) => p(G.t(g, { r: [0, 180, 0], p: [0, 0.37, -0.42] }), C.ink)),
    /* the bean mascot: body, puff head, big ink eyes with a glint, blush */
    p(G.t(G.bean(0.16, 0.08), { s: [1, 1, 0.9], p: [0, 0.38, -0.1] }), col),
    p(G.t(G.puff(0.15, true), { p: [0, 0.64, -0.08] }), col),
    p(G.t(G.gem(0.07), { s: [1, 0.75, 0.5], p: [0, 0.35, 0.03] }), core.mixHex(col, C.white, 0.5))
  ];
  [-1, 1].forEach((sd) => {
    list.push(p(G.t(low ? G.gem(0.04) : G.puff(0.04), { s: [0.85, 1.2, 0.55], p: [sd * 0.055, 0.66, 0.05] }), C.ink));
    list.push(p(G.t(G.circle(0.012, 5), { p: [sd * 0.055 + 0.012, 0.685, 0.073] }), C.white));
    list.push(p(G.t(G.circle(0.03, 6), { s: [1.3, 0.55, 1], r: [0, sd * 25, 0], p: [sd * 0.1, 0.6, 0.072] }), C.blush));
    list.push(p(G.t(G.gem(0.04), { p: [sd * 0.07, 0.31, 0.06] }), shade));        /* paws on the wheel */
  });
  /* the topper */
  const top = r.topper || 'bow';
  if (top === 'bow') {
    [-1, 1].forEach((sd) => list.push(p(G.t(G.cone(0.06, 0.1, 4), { r: [0, 0, sd * 90], p: [sd * 0.06, 0.8, -0.08] }), C.neonPink)));
    list.push(p(G.t(G.gem(0.03), { p: [0, 0.8, -0.08] }), C.neonPink));
  } else if (top === 'headphones') {
    list.push(p(G.t(G.torusArc(0.16, 0.018, Math.PI, 3, 8), { p: [0, 0.64, -0.08] }), C.ink));
    [-1, 1].forEach((sd) => list.push(p(G.t(G.tube(0.05, 0.05, 0.04, 8), { r: [0, 0, 90], p: [sd * 0.155, 0.64, -0.08] }), C.white)));
  } else if (top === 'sprout') {
    list.push(p(G.t(G.tube(0.008, 0.01, 0.08, 4, true), { p: [0, 0.82, -0.08] }), C.frondDark));
    [-1, 1].forEach((sd) => list.push(p(G.t(G.gem(0.04), { s: [1.6, 0.4, 0.8], r: [0, 0, sd * 25], p: [sd * 0.045, 0.87, -0.08] }), C.leafMint)));
  } else if (top === 'heart') {
    [-1, 1].forEach((sd) => list.push(p(G.t(G.gem(0.032), { p: [0.09 + sd * 0.025, 0.76, -0.04] }), C.neonPink)));
    list.push(p(G.t(G.cone(0.045, 0.05, 4), { r: [180, 45, 0], p: [0.09, 0.725, -0.04] }), C.neonPink));
  } else {
    list.push(p(G.t(G.tube(0.16, 0.16, 0.05, low ? 8 : 12, true), { p: [0, 0.72, -0.08] }), C.white));
    list.push(p(G.t(G.box(0.22, 0.02, 0.14), { p: [0, 0.7, 0.07] }), C.coral));
  }
  return G.merge(list);
}
/* a simplified kart + driver hull for the see-through sleeves (≈ 250 tris) */
function sleeveGeo(ctx, driver) {
  const G = ctx.kit.G, list = [G.t(G.box(0.44, 0.16, 0.74), { p: [0, 0.16, 0] }), G.t(G.tube(0.07, 0.07, 0.5, 8), { s: [0.35, 1, 1], r: [0, 0, 90], p: [0, 0.37, -0.39] })];
  if (driver) list.push(G.t(G.bean(0.18, 0.08), { p: [0, 0.38, -0.1] }), G.t(G.puff(0.17), { p: [0, 0.64, -0.08] }));
  const g = G.merge(list);
  /* inflate along the normals: an edge sleeve that hugs the silhouette */
  const pos = g.getAttribute('position').array, nrm = g.getAttribute('normal').array;
  for (let i = 0; i < pos.length; i++) pos[i] += nrm[i] * 0.035;
  return g;
}

export function makeRivals(ctx, crew) {
  const { THREE, kit, core } = ctx;
  const n = crew.length, disposables = [], ownMats = [];
  const keep = (x) => { disposables.push(x); return x; };
  const group = new THREE.Group(); group.name = 'glow-crew';
  const meshes = crew.map((r, i) => {
    const m = new THREE.Mesh(keep(rivalGeo(ctx, r, i + 1)), kit.mat('toon'));
    m.name = 'rival:' + (r.id || i); m.castShadow = false; m.matrixAutoUpdate = false;
    group.add(m);
    return m;
  });
  /* all 20 wheels */
  const G = kit.G, C = core.COL;
  const wheelGeo = keep(G.merge([
    G.paint(G.t(G.tube(KART.wheelR, KART.wheelR, 0.08, ctx.tier === 'LOW' ? 8 : 12), { r: [0, 0, 90] }), kit.color(C.ink)),
    G.paint(G.t(G.tube(0.05, 0.05, 0.084, 8), { r: [0, 0, 90] }), kit.color(C.pebble))
  ]));
  const wheels = new THREE.InstancedMesh(wheelGeo, kit.mat('toon'), Math.max(1, n * 4));
  wheels.name = 'rival-wheels'; wheels.instanceMatrix.setUsage(THREE.DynamicDrawUsage); wheels.frustumCulled = false;
  group.add(wheels);
  /* waving paws (shown while a passed rival waves) */
  const pawGeo = keep(G.paint(G.puff(0.05, true), kit.color(C.white)));
  const paws = new THREE.InstancedMesh(pawGeo, kit.mat('toon'), Math.max(1, n));
  paws.name = 'rival-paws'; paws.instanceMatrix.setUsage(THREE.DynamicDrawUsage); paws.frustumCulled = false;
  paws.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, n) * 3), 3);
  crew.forEach((r, i) => kit.color(r.color || C.bubblegum).toArray(paws.instanceColor.array, i * 3));
  group.add(paws);
  /* see-through sleeves: additive, back faces (an edge glow), one instanced mesh */
  const sMat = kit.additive({ vertexColors: true, side: THREE.BackSide, opacity: 0.9 });
  ownMats.push(sMat);
  const sleeves = new THREE.InstancedMesh(keep(G.paint(sleeveGeo(ctx, true), kit.color('#FFFFFF'))), sMat, Math.max(1, n));
  sleeves.name = 'rival-sleeves'; sleeves.instanceMatrix.setUsage(THREE.DynamicDrawUsage); sleeves.frustumCulled = false; sleeves.renderOrder = 4;
  sleeves.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, n) * 3), 3);
  crew.forEach((r, i) => kit.color(r.color || C.bubblegum).toArray(sleeves.instanceColor.array, i * 3));
  group.add(sleeves);

  const wheelOff = [[KART.wheelX, KART.wheelR, KART.axleF[2]], [-KART.wheelX, KART.wheelR, KART.axleF[2]], [KART.wheelX, KART.wheelR, KART.axleB[2]], [-KART.wheelX, KART.wheelR, KART.axleB[2]]];
  const _m = new THREE.Matrix4(), _w = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  const spin = new Float32Array(n);
  /* one rival's pose: world x/y/z, yaw, roll, v (u/s), sleeve, wave 0..1, squash */
  function setPose(i, x, y, z, yaw, roll, v, dt, sleeve, wave, t) {
    const m = meshes[i];
    _e.set(0, yaw, roll || 0, 'YXZ'); _q.setFromEuler(_e); _s.set(1, 1, 1);
    _m.compose(_p.set(x, y, z), _q, _s);
    m.matrix.copy(_m); m.matrixWorldNeedsUpdate = true;
    m.visible = !sleeve;
    (sleeve ? _m : ZERO).toArray(sleeves.instanceMatrix.array, i * 16);
    spin[i] += (v || 0) / KART.wheelR * (dt || 0);
    for (let w = 0; w < 4; w++) {
      const o = wheelOff[w];
      _w.makeRotationX(spin[i]).setPosition(o[0], o[1], o[2]);
      _w.premultiply(_m);
      (sleeve ? ZERO : _w).toArray(wheels.instanceMatrix.array, (i * 4 + w) * 16);
    }
    /* the waving paw: up by the head, swinging (a 1.5 Hz wave, gentle) */
    if (wave > 0 && !sleeve) {
      const sw = 0.5 * Math.sin(core.TAU * 1.5 * (t || 0));
      _w.makeTranslation(0.17 + 0.05 * Math.sin(sw), 0.72 + 0.04 * Math.cos(sw), -0.06);
      _w.premultiply(_m);
      _w.toArray(paws.instanceMatrix.array, i * 16);
    } else ZERO.toArray(paws.instanceMatrix.array, i * 16);
  }
  function commit() { wheels.instanceMatrix.needsUpdate = true; paws.instanceMatrix.needsUpdate = true; sleeves.instanceMatrix.needsUpdate = true; }
  return {
    group, meshes, wheels, paws, sleeves, count: n, setPose, commit,
    dispose() {
      if (group.parent) group.parent.remove(group);
      [wheels, paws, sleeves].forEach((m) => m.dispose());
      disposables.forEach((d) => { try { d.dispose(); } catch (e) { /* gone */ } });
      ownMats.forEach((m) => kit.release(m));
      group.clear();
    }
  };
}

/* ================================================================
   SOLO PACERS: opaque PEARL shells with medal-coloured additive sleeves, no driver
   ================================================================ */
export function makePacers(ctx, list) {
  const { THREE, kit, core } = ctx;
  const n = list.length, G = kit.G, disposables = [], ownMats = [];
  const keep = (x) => { disposables.push(x); return x; };
  const group = new THREE.Group(); group.name = 'pacers';
  const shellGeo = keep(G.merge([
    G.t(G.slab(0.4, 0.12, 0.66, 0.04), { p: [0, 0.16, -0.02] }), G.t(G.puff(0.078, true), { s: [1, 1, 1.9], p: [0, 0.155, 0.3] }),
    G.t(G.tube(0.06, 0.06, 0.46, 10), { s: [0.3, 1, 1], r: [0, 0, 90], p: [0, 0.37, -0.39] }),
    ...[-1, 1].map((sd) => G.t(G.tube(0.1, 0.1, 0.08, 10), { r: [0, 0, 90], p: [sd * 0.25, 0.1, 0.26] })),
    ...[-1, 1].map((sd) => G.t(G.tube(0.1, 0.1, 0.08, 10), { r: [0, 0, 90], p: [sd * 0.25, 0.1, -0.26] }))
  ]));
  const shells = new THREE.InstancedMesh(shellGeo, kit.mat('pearl'), Math.max(1, n));
  shells.name = 'pacer-shells'; shells.instanceMatrix.setUsage(THREE.DynamicDrawUsage); shells.frustumCulled = false; shells.count = n;
  const sMat = kit.additive({ vertexColors: true, side: THREE.BackSide, opacity: 1 });
  ownMats.push(sMat);
  const sleeves = new THREE.InstancedMesh(keep(G.paint(sleeveGeo(ctx, false), kit.color('#FFFFFF'))), sMat, Math.max(1, n));
  sleeves.name = 'pacer-sleeves'; sleeves.instanceMatrix.setUsage(THREE.DynamicDrawUsage); sleeves.frustumCulled = false; sleeves.count = n; sleeves.renderOrder = 4;
  sleeves.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, n) * 3), 3);
  list.forEach((pc, i) => kit.color(pc.kind === 'best' ? (ctx.sigHex || core.COL.neonPink) : core.MEDAL_COL[pc.medal] || '#FFFFFF').toArray(sleeves.instanceColor.array, i * 3));
  group.add(shells, sleeves);
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
  return {
    group, count: n,
    setPose(i, x, y, z, yaw) {
      _q.setFromAxisAngle(up, yaw); _m.compose(_p.set(x, y, z), _q, _s);
      shells.setMatrixAt(i, _m); sleeves.setMatrixAt(i, _m);
    },
    commit() { shells.instanceMatrix.needsUpdate = true; sleeves.instanceMatrix.needsUpdate = true; },
    dispose() {
      if (group.parent) group.parent.remove(group);
      shells.dispose(); sleeves.dispose();
      disposables.forEach((d) => { try { d.dispose(); } catch (e) { /* gone */ } });
      ownMats.forEach((m) => kit.release(m));
      group.clear();
    }
  };
}

/* ================================================================
   THE CHILD'S AVATAR on the riser, waving an Island Wand (MID/HIGH only)
   ================================================================ */
export function makeAvatar(ctx, user, spot) {
  const { THREE, SL3D } = ctx;
  if (!spot || ctx.tier === 'LOW' || !SL3D || typeof SL3D.makeAvatar !== 'function') return null;
  let av = null;
  try { av = SL3D.makeAvatar({ color: user && user.color, emoji: user && user.avatar }, ctx.tier); } catch (e) { av = null; }
  if (!av || !av.root) return null;
  const holder = new THREE.Group();
  holder.name = 'avatar-riser';
  holder.position.set(spot.x, spot.y, spot.z);
  holder.rotation.y = spot.yaw;
  av.root.scale.setScalar(1.5);
  holder.add(av.root);
  noShadow(holder);
  try { if (av.setWand) av.setWand(true); } catch (e) { /* no wand */ }
  let cheerT = -1;
  return {
    group: holder,
    cheer() { cheerT = 0; },
    update(dt, t, reduced, showK) {
      if (cheerT >= 0) { cheerT += dt; if (cheerT > 2.4) cheerT = -1; }
      try {
        av.play(cheerT >= 0 ? 'cheer' : 'wave', cheerT >= 0 ? cheerT : t, { reduced: !!reduced });
        if (av.setShow) av.setShow(showK || 0);
      } catch (e) { /* keep the last pose */ }
    },
    dispose() { try { av.dispose(); } catch (e) { /* gone */ } if (holder.parent) holder.parent.remove(holder); holder.clear(); }
  };
}
