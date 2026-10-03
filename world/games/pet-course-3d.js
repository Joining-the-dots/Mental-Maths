/* ================================================================
   Debut Run — the Three.js view (ES module, CONTRACTS §2/§6).
   The child's own pet (SL3D.makeRig, locked PETCOL, every owned
   accessory) runs a glowing toy-stage runway in the course colours.
   The view only READS round.state / round.course and drains
   round.events; it never changes the logic, plays no sounds (the logic
   owns every sound) and keeps all its visual state to itself.

     export create(mid, opts) → Promise<view | null>
       opts = {THREE, cfg, api, def, reduced, onFail(reason)}
       view = {canvas, frame(round|null, dt, alpha, phase, countT),
               resize(cssW, cssH), setRound(round|null, variant), dispose()}

   Renderer: the shared stage lease (SL3D.lease('game', …)). The shell
   drives frames; we render in frame() and never call lease.start().
   Pure maths: world/games/course-3d-math.js (window.SLCourse3DMath,
   Node-tested). Builders: world/games/course-3d-scene.js.
   Spec: docs/island3d/spec-runner.json (threeDScene, juiceAndAudio,
   consequences felt timeline, hudAndScreens, performanceNotes).
   ================================================================ */
import * as THREE from 'three';

const STEP = 1 / 120;
const QUERY = (function () { try { return new URL(import.meta.url).search || ''; } catch (e) { return ''; } })();
const TAU = Math.PI * 2, DEG = Math.PI / 180;
const ONE = new THREE.Vector3(1, 1, 1);

/* ---------------- loading (helpers carry the same ?v= as this module) ---------------- */
let libsP = null, stageP = null;
function loadLibs() {
  if (!libsP) {
    libsP = Promise.all([
      import('./course-3d-math.js' + QUERY).then(function () {
        const M = globalThis.SLCourse3DMath;
        if (!M || !M.petVisual) throw new Error('course-3d-math missing');
        return M;
      }),
      import('./course-3d-scene.js' + QUERY)
    ]).catch(function (e) { libsP = null; throw e; });
  }
  return libsP;
}
function later(ms, v) { return new Promise(function (r) { setTimeout(function () { r(v); }, ms); }); }
/* the shared runtime: SLIsland3D.ensure(), injecting stage.js once when it is missing */
function getSL3D(ms) {
  const w = window;
  function ensure() {
    try { return w.SLIsland3D.ensure({ deadlineMs: ms }).catch(function () { return null; }); } catch (e) { return Promise.resolve(null); }
  }
  if (w.SLIsland3D && typeof w.SLIsland3D.ensure === 'function') return Promise.race([ensure(), later(ms, null)]);
  if (!stageP) {
    stageP = new Promise(function (resolve) {
      try {
        const s = document.createElement('script');
        s.src = new URL('world/island3d/stage.js?v=' + (w.SL_WORLD_VER || '1'), document.baseURI).href;
        s.async = false;
        s.onload = function () { resolve(true); };
        s.onerror = function () { stageP = null; resolve(false); };
        document.head.appendChild(s);
      } catch (e) { stageP = null; resolve(false); }
    });
  }
  return Promise.race([stageP.then(function (ok) { return ok && w.SLIsland3D && w.SLIsland3D.ensure ? ensure() : null; }), later(ms, null)]);
}
function loadAddons() {
  return Promise.all([
    new Function('u', 'return import(u)')('three/addons/geometries/RoundedBoxGeometry.js').catch(function () { return null; })
  ]).then(function (m) { return { RoundedBoxGeometry: m[0] && m[0].RoundedBoxGeometry }; }).catch(function () { return {}; });
}
function guessTier() {
  try {
    const T = window.SLTier;
    if (T && T.decide && T.facts) return T.decide(T.facts(navigator, {}));
  } catch (e) { /* fall through */ }
  return 'MID';
}
const DEFAULT_BUDGET = { LOW: { particles: 128, gameDrawCalls: 60, pixelRatio: 1, antialias: false }, MID: { particles: 256, gameDrawCalls: 90, pixelRatio: 1.5, antialias: true }, HIGH: { particles: 512, gameDrawCalls: 120, pixelRatio: 2, antialias: true } };

export function create(mid, opts) { return build(mid, opts || {}); }

async function build(mid, opts) {
  let failed = false;
  function fail(reason) { if (failed) return; failed = true; try { if (opts.onFail) opts.onFail(reason); } catch (e) { /* the shell falls back */ } }
  let M, S;
  try { const r = await loadLibs(); M = r[0]; S = r[1]; } catch (e) { fail('libs'); return null; }
  const SL3D = await getSL3D(7000);
  let K = null, hub = null, tier = 'MID', budget = null;
  try {
    if (SL3D && typeof SL3D.kit === 'function' && SL3D.ready) {
      tier = SL3D.tier || 'MID'; K = SL3D.kit(tier); budget = SL3D.budget;
    } else if (window.SLKit && typeof window.SLKit.create === 'function') {
      tier = guessTier();
      hub = window.SLKit.create(THREE, { addons: await loadAddons(), look: function () { return window.SLIslandLook || null; } });
      K = hub.kit(tier);
      budget = (window.SLTier && window.SLTier.budget) ? window.SLTier.budget(tier, window.devicePixelRatio || 1) : DEFAULT_BUDGET[tier];
    }
  } catch (e) { K = null; }
  if (!K) { fail('kit'); return null; }
  /* makeView may take the island's renderer lease before something in it throws: then its own
     dispose() (published first thing) tears the half-built view down and hands the lease back.
     A leaked game lease would stay current, and the 3D island would never render again. */
  const built = { dispose: null };
  try { return makeView(mid, opts, M, S, SL3D, K, hub, tier, budget || DEFAULT_BUDGET[tier], fail, built); }
  catch (e) {
    if (built.dispose) bestEffort(built.dispose);         /* releases the lease and the hub too */
    else if (hub) bestEffort(function () { hub.dispose(); });
    fail('build'); return null;
  }
}
/* one teardown step; a step for something a failed build never reached throws (a ReferenceError
   for a name not declared yet) and is skipped, so every other step still runs */
function bestEffort(fn) { try { fn(); } catch (e) { /* not built, or already gone */ } }

/* ================================================================
   THE VIEW
   ================================================================ */
function makeView(mid, opts, M, S, SL3D, K, hub, tier, budget, fail, built) {
  /* first, before anything that can throw: what dispose() needs to undo a half-built view */
  if (built) built.dispose = dispose;
  let lease = null, renderer = null, ownRenderer = false, lost = false, paused = false, disposed = false;
  const cfg = opts.cfg || {};
  const reduced = !!(opts.reduced || cfg.reduced);
  const low = tier === 'LOW';
  const SC = window.SLCourse || {};
  const SECTIONS = SC.SECTIONS || [{ t0: 0, d0: 0 }, { t0: 7.5, d0: 2175 }, { t0: 22.5, d0: 6825 }, { t0: 30, d0: 9300 }, { t0: 45, d0: 14550 }, { t0: 52.5, d0: 17025 }];
  const T2 = SECTIONS[2].t0, T3 = SECTIONS[3].t0;
  const BRIDGE = [M.petX(SECTIONS[4].d0) - 0.6, M.petX(SECTIONS[5].d0) + 0.4];
  const speedNow = typeof SC.speedNow === 'function' ? SC.speedNow : function (s) { return 330; };
  const user = cfg.user || { name: '', color: '#6C5CE7', avatar: '🙂' };
  const member = M.safeMember(user.color), memberInt = M.hexInt(member);
  const pet = cfg.pet || { id: 'pet_puppy', name: 'Buddy', acc: {} };
  const petId = ['pet_puppy', 'pet_kitten', 'pet_bunny', 'pet_dragon'].indexOf(pet.id) >= 0 ? pet.id : 'pet_puppy';
  const acc = pet.acc || {};
  const PP = SL3D && SL3D.petPose ? SL3D.petPose : (window.SLCharacters && window.SLCharacters.sample ? window.SLCharacters : null);
  const demo = !!cfg.demo;

  /* ---------------- renderer: the stage lease (or our own; state declared at the top) ---------------- */
  const handlers = {
    onRevoke: function (L, why) { if (why === 'dispose') { paused = true; fail('revoked'); } else paused = true; },
    onResume: function () { paused = false; reattach(); },
    onLost: function () { lost = true; },
    onRestored: function () { lost = false; },
    onFail: function (reason) { fail(reason || 'lease'); },
    onQuality: function (q) { applyQuality(q); }
  };
  if (SL3D && typeof SL3D.lease === 'function') { try { lease = SL3D.lease('game', handlers); } catch (e) { lease = null; } }
  if (lease) renderer = lease.renderer;
  else {
    renderer = SL3D && typeof SL3D.createRenderer === 'function' ? SL3D.createRenderer({}) : null;
    if (!renderer) {
      renderer = new THREE.WebGLRenderer({ antialias: !!budget.antialias, alpha: false, stencil: false, powerPreference: 'high-performance' });
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.NeutralToneMapping != null ? THREE.NeutralToneMapping : THREE.ACESFilmicToneMapping;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, budget.pixelRatio || 1.5));
    }
    ownRenderer = true;
    renderer.domElement.addEventListener('webglcontextlost', function (e) { e.preventDefault(); lost = true; }, false);
    renderer.domElement.addEventListener('webglcontextrestored', function () { lost = false; }, false);
  }
  const canvas = renderer.domElement;
  const savedCss = canvas.style.cssText, savedClass = canvas.className;
  canvas.style.cssText = 'display:block;';
  canvas.setAttribute('aria-hidden', 'true');
  let lastW = 0, lastH = 0;
  function reattach() {
    if (disposed) return;
    if (canvas.parentNode !== mid && mid && mid.isConnected) mid.insertBefore(canvas, mid.querySelector('#slgCanvas') || mid.firstChild);
    canvas.classList.add('slg-gl'); canvas.style.cssText = 'display:block;';
    if (lastW > 0 && lastH > 0) resize(lastW, lastH);
  }

  /* ---------------- scene, camera, lights ---------------- */
  const scene = new THREE.Scene(); scene.name = 'debut-run';
  const camera = new THREE.PerspectiveCamera(M.CAM.fov, 16 / 9, M.CAM.near, M.CAM.far);
  scene.add(camera);
  scene.fog = new THREE.Fog(0xFFE3F1, 22, 75);
  const hemi = new THREE.HemisphereLight(0xDDF1FF, 0xFFE0EC, 1.9);
  const sun = new THREE.DirectionalLight(0xFFF3E0, 2.4);
  sun.castShadow = false;
  scene.add(hemi, sun, sun.target);
  const rimSave = { color: K.uniforms.uRimColor.value.clone(), strength: K.uniforms.uRimStrength.value };

  /* ---------------- shared build context ---------------- */
  const caps = { particles: Math.min(512, (budget && budget.particles) || 256), halos: 160, blobs: 44 };
  const ctx = { THREE: THREE, K: K, M: M, tier: tier, low: low, budget: budget, reduced: reduced, member: member,
    look: M.look3d(cfg.variant || 'course_meadow', SC.THEMES), sizes: M.kindSizes(SC.KINDS) };
  const parts = [];
  function keep(p, parent) { parts.push(p); (parent || scene).add(p.group || p.mesh); return p; }
  const sky = keep(S.makeSky(ctx));
  const clouds = keep(S.makeClouds(ctx));
  const leds = keep(S.makeLeds(ctx));
  const cones = keep(S.makeCones(ctx));
  const fans = keep(S.makeFans(ctx));
  const fx = keep(S.makeFx(ctx, caps));
  const curtains = keep(S.makeCurtains(ctx), camera);
  fans.setMember(member);
  if (low) cones.group.visible = false;

  /* pet shield bubble + the steady grace outline (never blinks) */
  const own = [];
  const shieldGeo = K.G.puff(0.5, { sphere: true }); own.push(shieldGeo);
  const shieldMesh = S.single(shieldGeo, K.mat('glass'), 'petShield'); shieldMesh.renderOrder = 3; scene.add(shieldMesh);
  const graceGeo = K.G.ring(0.58, 0.022); own.push(graceGeo);
  const graceMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(M.COL.HOLO[0]), transparent: true, opacity: 0.65, depthWrite: false, toneMapped: false }); own.push(graceMat);
  const graceMesh = S.single(graceGeo, graceMat, 'petGrace'); scene.add(graceMesh);

  /* ---------------- theme parts (rebuilt only when the course variant changes) ---------------- */
  let theme = null, themeVariant = '';
  function ensureTheme(variant) {
    const v = M.VARIANTS.indexOf(variant) >= 0 ? variant : 'course_meadow';
    if (theme && themeVariant === v) return;
    dropTheme();
    ctx.look = M.look3d(v, SC.THEMES);
    themeVariant = v;
    theme = {
      hills: S.makeHills(ctx), props: S.makePropRows(ctx), apron: S.makeApron(ctx), runway: S.makeRunway(ctx),
      obstacles: S.makeObstacles(ctx), doors: S.makeDoors(ctx), bridge: S.makeBridge(ctx), pickups: S.makePickups(ctx)
    };
    Object.keys(theme).forEach(function (k) { const p = theme[k]; scene.add(p.group || p.mesh); });
    if (bound) theme.obstacles.bind(bound.course);
    soilInt = M.hexInt(ctx.look.soil); puddleInt = M.hexInt(ctx.look.obs.puddle);
    feverInts = ctx.look.fever.colors.map(M.hexInt);
    feverCells = ctx.look.fever.cells.map(function (c) { return K.ATLAS && K.ATLAS[c] != null ? K.ATLAS[c] : 7; });
    warm();
  }
  function dropTheme() {
    if (!theme) return;
    Object.keys(theme).forEach(function (k) { try { theme[k].dispose(); } catch (e) { /* gone */ } });
    theme = null; themeVariant = '';
  }
  let soilInt = 0xC9925A, puddleInt = 0x6CC4FF, feverInts = [0xFFB3E6], feverCells = [7];
  /* colours used every frame (ints: no parsing in the hot loop) */
  const CYAN = M.hexInt(M.COL.NEON_CYAN), PEARL_BLUE = M.hexInt('#B3E5FF');
  const CAPE = M.hexInt(M.COL.CAPE_RED), HOLO_INTS = M.COL.HOLO.map(M.hexInt), PEARL = M.hexInt(M.COL.PEARL);

  /* ---------------- the pet: the shared chibi rig (hat separate so it can pop off) ---------------- */
  const petRoot = new THREE.Group(); petRoot.name = 'petRoot'; petRoot.rotation.y = Math.PI / 2; scene.add(petRoot);
  const accNoHat = { hat: null, neck: acc.neck || null, face: acc.face || null, back: acc.back || null };
  let rig = null;
  try { if (SL3D && typeof SL3D.makeRig === 'function') rig = SL3D.makeRig(petId, accNoHat, tier); } catch (e) { rig = null; }
  if (!rig || !rig.root) rig = S.makeFallbackPet(ctx, petId);
  petRoot.add(rig.root);
  const hasCape = acc.back === 'acc_cape', hasCrown = acc.hat === 'acc_crown', hasParty = acc.hat === 'acc_partyhat';
  const hat = (hasCrown || hasParty) ? S.makeHat(ctx, acc.hat) : null;
  const hatSocket = rig.sockets && rig.sockets.hat ? rig.sockets.hat : (rig.hatAnchor || null);
  if (hat && hatSocket) hatSocket.add(hat.group);
  let hatState = 'on';
  const hatFrom = new THREE.Vector3(), hatQ = new THREE.Quaternion(), hatOut = {};
  const pose = PP && PP.restPose ? PP.restPose({}) : {};
  const clipOpts = { species: petId, speed: 0, intensity: 1, reduced: reduced, seed: 4242, rate: 1, bpm: M.BPM, height: 0, dur: 0.6, ground: false };
  const V = M.newVisual();

  /* the child's avatar: shown at the finish only, but built hidden up front (see the end of
     makeView) so warm() compiles its shaders with the rest of the scene */
  let avatar = null;
  function ensureAvatar() {
    if (avatar) return avatar;
    try { if (SL3D && typeof SL3D.makeAvatar === 'function') avatar = SL3D.makeAvatar({ color: member, emoji: user.avatar || '🙂' }, tier); } catch (e) { avatar = null; }
    if (!avatar || !avatar.root) avatar = S.makeFallbackAvatar(ctx, user);
    try { if (avatar.setWand) avatar.setWand(true); if (avatar.setShow) avatar.setShow(1); } catch (e) { /* cosmetic */ }
    scene.add(avatar.root);
    avatar.root.visible = false;
    return avatar;
  }

  /* ---------------- per-round state ---------------- */
  let bound = null, s = null, course = null, menuVariant = cfg.variant || 'course_meadow';
  const J = M.newJuice();
  let vt = 0, hSm = 0, feverK = 0, prevFever = false, firstFrame = true;
  let petDispX = 0, petDispH = 0, holdX = 0, holdH = 0, holdClock = 0, holding = false, offX = 0, offH = 0;
  let trailAcc = 0, feverTrailAcc = 0, capeTrail = 0, confettiAcc = 0, heartAcc = 0, feverLeft = 0, feverAcc = 0, prevInv = 0;
  const stageRange = [-99, -98];
  const L = {}, camOff = {}, camPos = new THREE.Vector3(), camTgt = new THREE.Vector3(), lastCamPos = new THREE.Vector3(), lastCamTgt = new THREE.Vector3();
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), tmpC = new THREE.Color(), petTarget = new THREE.Vector3();
  const coneOpts = { alpha: 0, t: 0, lock: 0, target: petTarget, on: [1, 1, 1], reduced: reduced, dt: 0 };
  const zips = []; for (let i = 0; i < 10; i++) zips.push({ on: false, type: '', t: 0, dur: 0.35, x: 0, y: 0, z: 0, li: 0, nx: 0, ny: 0 });
  let nextZip = 0;
  const zOut = {};

  function bind(round) {
    bound = round; s = round.state; course = round.course;
    ensureTheme(round.variant);
    theme.obstacles.bind(course);
    M.resetJuice(J);
    fx.clear();
    firstFrame = true; holding = false; offX = offH = 0; hatState = 'on'; prevFever = !!s.fever; prevInv = 0;
    if (hat && hatSocket && hat.group.parent !== hatSocket) { hatSocket.add(hat.group); hat.group.position.set(0, 0, 0); hat.group.quaternion.identity(); hat.group.scale.set(1, 1, 1); }
    zips.forEach(function (z) { z.on = false; });
    feverLeft = 0;
    if (avatar) avatar.root.visible = false;
  }

  /* ---------------- quality steps (adaptive ladder, never back up) ---------------- */
  let conesOn = !low;
  function applyQuality(q) {
    if (!q) return;
    fx.setScale(q.particleScale || 1);
    if ((q.particleScale || 1) < 1) fans.setEnabled(false);    /* game ladder: particles halved → fan crowd off */
    if (q.cones === false) conesOn = false;
  }
  let unsubQ = null;
  if (!lease && SL3D && typeof SL3D.onQuality === 'function') unsubQ = SL3D.onQuality(applyQuality);
  if (SL3D && SL3D.quality) applyQuality(SL3D.quality);

  /* ================================================================
     EVENTS → juice + particles (zero allocation: the sim's spec object is reused)
     ================================================================ */
  function spec(sim, x, y, z, hex, a) {
    const p = sim.spec;
    tmpC.setHex(hex);
    p.x = x; p.y = y; p.z = z; p.r = tmpC.r; p.gg = tmpC.g; p.b = tmpC.b; p.a = a == null ? 1 : a;
    p.vx = p.vy = p.vz = 0; p.g = 0; p.drag = 0; p.vr = 0; p.rot = 0; p.floor = -99; p.cell = 0; p.life = 0.5; p.s0 = 0.12; p.s1 = 0.12;
    return p;
  }
  function sparkles(x, y, z, n, hex, speed, life, size) {
    const p = spec(fx.simG, x, y, z, hex, 1);
    p.cell = K.ATLAS ? K.ATLAS.sparkle : 0; p.life = life || 0.5; p.s0 = size || 0.16; p.s1 = (size || 0.16) * 0.4; p.drag = 2.5;
    M.burst(fx.simG, n, Math.PI / 2, TAU, speed == null ? 1.6 : speed, 0.5, 0.8);
  }
  function ring(x, y, z, hex, r1, life) {
    const p = spec(fx.simG, x, y, z, hex, 0.9);
    p.cell = 5; p.life = life || 0.35; p.s0 = 0.15; p.s1 = r1 || 0.9;
    fx.simG.emit();
  }
  function dust(x, n, hex, back) {
    if (reduced) return;
    const p = spec(fx.simS, x, 0.05, 0.25, hex, 0.85);
    p.cell = 10; p.life = 0.42; p.s0 = 0.1; p.s1 = 0.26; p.g = 1.5; p.drag = 3; p.floor = 0.02;
    M.burst(fx.simS, n, back ? Math.PI * 0.82 : Math.PI / 2, back ? 0.9 : 2.2, 1.3, 0.4, 0.9);
  }
  const CONF_CELLS = [6, 1, 13, 12];
  const NEON = [M.hexInt('#FF4FB8'), M.hexInt('#3DF2FF'), M.hexInt('#FFD23F'), M.hexInt('#A66BFF'), M.hexInt('#C9FFE5')];
  /* confetti: 40 % in the child's colour; a 0.4 s sparkle fade under reduced motion */
  function confetti(x, y, z, n, angle, spread, speed) {
    if (reduced) { sparkles(x, y, z, Math.min(10, n >> 2), memberInt, 0, 0.4, 0.2); return; }
    const sim = fx.simS;
    n = Math.round(n * (sim.scale || 1));
    for (let i = 0; i < n; i++) {
      const p = spec(sim, x, y, z, i % 5 < 2 ? memberInt : NEON[i % NEON.length], 1);
      const a = angle + (sim.rand() - 0.5) * spread, v = speed * (0.6 + 0.8 * sim.rand());
      p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v; p.vz = (sim.rand() - 0.5) * 2.4;
      p.g = 5.5; p.drag = 1.4; p.life = 1.5 + sim.rand() * 0.5; p.s0 = p.s1 = 0.08 + sim.rand() * 0.05;
      p.cell = CONF_CELLS[i % CONF_CELLS.length]; p.rot = sim.rand() * TAU; p.vr = (sim.rand() - 0.5) * 14; p.floor = 0.01;
      sim.emit();
    }
  }
  function hearts(x, y, z, n, hex, speed) {
    if (reduced) { sparkles(x, y, z, Math.min(6, n), hex, 0, 0.4, 0.2); return; }
    const p = spec(fx.simS, x, y, z, hex, 1);
    p.cell = 1; p.life = 0.8; p.s0 = 0.16; p.s1 = 0.1; p.g = 3; p.drag = 1.5; p.vr = 0;
    M.burst(fx.simS, n, Math.PI / 2, 2.4, speed || 2.4, 0.4, 1.2);
  }
  function feverPiece(dt, camX, halfW, topY) {
    if (feverLeft <= 0 || reduced) { feverLeft = 0; return; }
    feverAcc += dt * 50;                                 /* the theme set-piece: ≤ 60 pieces over ~1.2 s */
    const sim = fx.simS;
    while (feverAcc >= 1 && feverLeft > 0) {
      feverAcc -= 1; feverLeft--;
      const p = spec(sim, camX - halfW + sim.rand() * halfW * 2.2, topY, -1.2 + sim.rand() * 2.6, feverInts[feverLeft % feverInts.length], 1);
      p.vx = (sim.rand() - 0.5) * 0.8; p.vy = -0.6 - sim.rand() * 0.8; p.g = 0.9; p.drag = 0.6; p.life = 2.4;
      p.s0 = p.s1 = 0.1 + sim.rand() * 0.06; p.cell = feverCells[feverLeft % feverCells.length]; p.vr = (sim.rand() - 0.5) * 5; p.rot = sim.rand() * TAU;
      sim.emit();
    }
  }
  function zip(type, x, y, z, li, nx, ny, dur) {
    const q = zips[nextZip]; nextZip = (nextZip + 1) % zips.length;
    q.on = true; q.type = type; q.t = 0; q.dur = dur || M.VIEW.ZIP; q.x = x; q.y = y; q.z = z; q.li = li | 0; q.nx = nx; q.ny = ny;
  }

  function onEvent(e, px, h) {
    M.juiceEvent(J, e, { reduced: reduced, fever: prevFever, hasHat: !!hat && hatState === 'on' });
    const fy = h, cy = h + 0.32;
    switch (e.type) {
      case 'takeoff':
        dust(px - 0.2, 4, soilInt, true);
        if (e.grade === 3) {
          fx.sticker(0, px + 0.2, cy + 0.75, 0.6, 1.25, 0.6);
          sparkles(px, cy + 0.2, 0.3, 5, M.hexInt('#FFB3E6'), 1.4, 0.45, 0.14);
          if (hasCrown && hat) { hat.group.getWorldPosition(tmp); sparkles(tmp.x, tmp.y + 0.08, tmp.z, 4, 0xFFFFFF, 0.6, 0.4, 0.13); }
        } else if (e.grade === 2) fx.sticker(1, px + 0.2, cy + 0.7, 0.6, 0.9, 0.55);
        break;
      case 'dj':
        ring(px, fy + 0.02, 0.2, s && s.fever ? M.hexInt('#3DF2FF') : 0xFFFFFF, 0.95, 0.35);
        if (hasCape) capeTrail = 0.45;
        break;
      case 'land': dust(px, 6, soilInt, false); break;
      case 'slide': theme.obstacles.pulseGate(px, s ? s.t : 0); break;
      case 'dive': sparkles(px, cy, 0.3, 4, M.hexInt('#3DF2FF'), 1.0, 0.35, 0.12); break;
      case 'boing':
        hearts(px, fy, 0.3, 8, M.hexInt('#FF8FC8'), 2.6);
        fx.sticker(2, px + 0.2, cy + 0.8, 0.6, 1.1, 0.7);
        break;
      case 'snack': {
        const x = M.worldX(e.x), y = M.worldY(e.y);
        sparkles(x, y, 0.1, 3, 0xFFFFFF, 1.2, 0.35, 0.12);
        const mult = s ? (s.phase === 'encore' ? s.encMult : s.mult) : 1;
        fx.sticker(M.snackSticker(mult), x + 0.15, y + 0.35, 0.4, 0.55, 0.6);
        zip('snack', x, y, 0, 0, 0.84, 0.86);
        break;
      }
      case 'star': {
        const x = M.worldX(e.x), y = M.worldY(e.y);
        ring(x, y, 0.1, M.hexInt('#3DF2FF'), 1.4, 0.45);
        sparkles(x, y, 0.1, 10, M.hexInt('#FFE36B'), 2.0, 0.55, 0.15);
        zip('star', x, y, 0, 0, 0.84, 0.86);
        break;
      }
      case 'letter': {
        const it = findLetter(e.li);
        if (it) zip('letter', M.worldX(it.x), M.worldY(it.y), 0, e.li, -0.21 + 0.084 * e.li, 0.72, M.VIEW.LETTER_ZIP);
        ring(px, cy, 0.3, M.hexInt('#B3E5FF'), 1.3, 0.5);
        break;
      }
      case 'lettersComplete':
        for (let k = 0; k < 4; k++) sparkles(px, cy + 0.3, 0.3, 6, M.hexInt(M.COL.HOLO[k]), 2.6, 0.7, 0.18);
        ring(px, cy + 0.3, 0.3, 0xFFFFFF, 2.2, 0.6);
        break;
      case 'shieldGet': ring(px, cy, 0.4, M.hexInt('#F6F1FF'), 1.6, 0.45); break;
      case 'shieldPop':
        ring(px, cy, 0.4, M.hexInt('#F6F1FF'), 1.9, 0.4);
        sparkles(px, cy, 0.4, 10, M.hexInt('#B3E5FF'), 2.2, 0.5, 0.14);
        break;
      case 'bump':
        sparkles(px + 0.3, cy, 0.3, 5, M.hexInt('#FFD23F'), 1.6, 0.35, 0.14);
        break;
      case 'splash': {                                  /* a crown of 10 droplets in the puddle colour */
        if (reduced) { sparkles(px + 0.2, 0.1, 0.2, 5, puddleInt, 0, 0.4, 0.14); break; }
        const p = spec(fx.simS, px + 0.2, 0.05, 0.2, puddleInt, 1);
        p.cell = 4; p.life = 0.6; p.s0 = 0.1; p.s1 = 0.06; p.g = 9; p.floor = 0.01;
        M.burst(fx.simS, 10, Math.PI / 2, 1.6, 3.2, 0.3, 1.4);
        break;
      }
      case 'regrab': sparkles(M.worldX(e.x), M.worldY(e.y), 0.2, 3, 0xFFFFFF, 1.0, 0.3, 0.12); break;
      /* no 'heal': a lost heart never comes back (no heart floats from the fans to the HUD) */
      case 'door': {
        const d = doorWorldX(e.sec);
        if (d != null) {
          tmp.set(-0.2, 2.9, 0).applyAxisAngle(THREE.Object3D.DEFAULT_UP, S.ARCH.yaw);
          confetti(d + tmp.x, tmp.y, tmp.z, 60, Math.PI / 2, 1.6, 4.2);
        }
        if (hasParty && hat) { hat.group.getWorldPosition(tmp); confetti(tmp.x, tmp.y + 0.15, tmp.z, 14, Math.PI / 2, 1.2, 2.4); }
        break;
      }
      case 'cleanStage':
        hearts(px + 0.1, cy + 0.2, 0.35, 4, memberInt, 3.0);
        fx.sticker(7, px + 0.4, cy + 1.05, 0.6, 1.5, 1.0);
        break;
      case 'fever': feverLeft = 60; feverAcc = 0; ring(px, cy, 0.3, memberInt, 2.4, 0.6); break;
      case 'finish': {
        const hw = halfWidth(), top = camera.position.y + 1.6;
        confetti(camera.position.x - hw, top, 0.5, 60, -0.35, 0.9, 5.5);
        confetti(camera.position.x + hw, top, 0.5, 60, Math.PI + 0.35, 0.9, 5.5);
        break;
      }
      case 'encoreStart': sparkles(px, cy + 0.3, 0.3, 14, M.hexInt('#3DF2FF'), 2.4, 0.6, 0.16); break;
      case 'encoreEnd':
        for (let k = 0; k < 3; k++) { ring(px + 1.2 + k * 1.1, 3.0 + k * 0.5, -1.0, NEON[k], 2.6, 0.9); sparkles(px + 1.2 + k * 1.1, 3.0 + k * 0.5, -1.0, 8, NEON[k], 2.4, 0.8, 0.15); }
        break;
    }
  }
  function findLetter(li) {
    if (!course) return null;
    const items = course.items;
    for (let i = 0; i < items.length; i++) if (items[i].kind === 'letter' && items[i].li === li) return items[i];
    return null;
  }
  function doorWorldX(sec) {
    if (!course) return null;
    for (let i = 0; i < course.doors.length; i++) if (course.doors[i].sec === sec) return course.doors[i].x / M.PX;
    return null;
  }
  function halfWidth() { return M.CAM.z * Math.tan(camera.fov * DEG / 2) * camera.aspect; }

  /* ================================================================
     PER-FRAME UPDATE
     ================================================================ */
  const visOpts = { reduced: reduced, clock: 0, speed: 0, menu: false };
  function updatePet(dt, menu, px, h, speed, ready) {
    visOpts.clock = vt; visOpts.speed = speed; visOpts.menu = menu || ready;  /* the count-in: bounce in place */
    M.petVisual(menu || ready ? null : s, J, visOpts, V);
    /* visual hit-stop: the pet and camera hold still (the logic keeps running) */
    if (!menu && J.hold > 0) {
      if (!holding) { holding = true; holdX = petDispX; holdH = petDispH; holdClock = vt; }
    } else if (holding) { holding = false; offX = holdX - px; offH = holdH - h; }
    offX = M.approach(offX, 0, dt, 22); offH = M.approach(offH, 0, dt, 22);
    petDispX = holding ? holdX : px + offX;
    petDispH = holding ? holdH : Math.max(0, h + offH);
    clipOpts.speed = V.speed; clipOpts.intensity = V.intensity; clipOpts.rate = V.rate; clipOpts.height = V.height;
    const t = V.frozen || holding ? holdClock : V.t;
    if (PP && PP.sample) PP.sample(V.clip, t, pose, clipOpts);
    else if (rig.play) { const p = rig.play(V.clip, t, clipOpts); if (p) for (const k in p) pose[k] = p[k]; }
    else { pose.y = 0; pose.pitch = 0; pose.yaw = 0; pose.roll = 0; pose.sx = pose.sy = pose.sz = 1; }
    pose.pitch = (pose.pitch || 0) + V.pitch + 22 * V.bow;
    pose.yaw = (pose.yaw || 0) + V.yaw;
    pose.roll = (pose.roll || 0) + V.roll;
    pose.sx = (pose.sx || 1) * V.sx; pose.sy = (pose.sy || 1) * V.sy; pose.sz = (pose.sz || 1) * V.sz;
    pose.y = (pose.y || 0) + V.dy;
    pose.headPitch = (pose.headPitch || 0) + 20 * V.bow;
    if (V.spark > (pose.spark || 0)) pose.spark = V.spark;
    if (!reduced && J.sinceLand < 0.4 && acc.neck === 'acc_bow') pose.neck = (pose.neck || 0) + 14 * Math.exp(-9 * J.sinceLand) * Math.sin(J.sinceLand * 30);   /* the bow springs */
    if (V.slide) pose.cape = Math.max(pose.cape || 0, 0.7);
    rig.setPose(pose);
    if (rig.setShow) rig.setShow(s && s.fever && !menu ? 1 : 0);                 /* shades flip to holo at FEVER */
    if (rig.bones && rig.bones.scarfTail) rig.bones.scarfTail.scale.setScalar(1 + 0.22 * ((s && !menu ? s.mult : 1) - 1));   /* scarf grows with Hype */
    petRoot.position.set(petDispX, petDispH, 0);
    petRoot.rotation.y = Math.PI / 2 * (1 - 0.78 * V.faceCam);
    /* the hat pops off on a bump and lands back on at 0.5 s */
    if (hat && hatSocket) {
      if (J.hatOff && hatState === 'on' && J.sinceHat < 0.2) {
        petRoot.updateMatrixWorld(true);
        scene.attach(hat.group); hat.group.scale.set(1, 1, 1);
        hat.group.getWorldPosition(hatFrom); hatQ.copy(hat.group.quaternion); hatState = 'fly';
      }
      if (hatState === 'fly') {
        M.hatFlight(J.sinceHat, hatOut);
        hat.group.position.set(hatFrom.x + hatOut.x, hatFrom.y + hatOut.y, hatFrom.z);
        hat.group.quaternion.copy(hatQ); hat.group.rotateZ(hatOut.rot);
        fx.blob(hat.group.position.x, 0.2, 0.18, 0.14);
        if (hatOut.attach) { petRoot.updateMatrixWorld(true); hatSocket.attach(hat.group); hatState = 'settle'; }
      } else if (hatState === 'settle') {                /* drop back onto the head */
        const kk = M.smoothK(dt, 30);
        hat.group.position.multiplyScalar(1 - kk);
        hat.group.quaternion.slerp(hatQ.identity(), kk);
        hat.group.scale.lerp(ONE, kk);
        if (hat.group.position.lengthSq() < 1e-6) { hat.group.position.set(0, 0, 0); hat.group.quaternion.identity(); hat.group.scale.set(1, 1, 1); hatState = 'on'; }
      }
    }
    /* blob shadow, shield bubble, grace outline */
    fx.blob(petDispX, 0.06, 0.75 * Math.max(0.35, 1 - petDispH / 4), 0.55 * Math.max(0.35, 1 - petDispH / 4));
    const cy = petDispH + 0.32;
    shieldMesh.visible = !!(s && !menu && s.shield);
    if (shieldMesh.visible) { S.setInst(shieldMesh, 0, petDispX, cy, 0, 0, 0, 0, 1); shieldMesh.instanceMatrix.needsUpdate = true; }
    graceMesh.visible = !!(s && !menu && s.inv > 0 && !s.shield && (s.phase === 'run' || s.phase === 'encore'));
    if (graceMesh.visible) { S.setInst(graceMesh, 0, petDispX, cy, 0.05, 0, 0, 0, 1, 0.86, 1); graceMesh.instanceMatrix.needsUpdate = true; }
  }

  function updateTrails(dt, px, h) {
    if (!s || reduced) return;
    const cy = h + 0.3;
    if (V.trail) {                                       /* belly-slide sparkle trail */
      trailAcc += dt;
      while (trailAcc > 0.04) { trailAcc -= 0.04; const p = spec(fx.simG, px - 0.3, 0.12, 0.15 + (fx.simG.rand() - 0.5) * 0.3, CYAN, 0.9); p.cell = 0; p.life = 0.4; p.s0 = 0.12; p.s1 = 0.02; p.vx = -0.6; p.vy = 0.3; fx.simG.emit(); }
    } else trailAcc = 0;
    if (s.fever) {                                       /* FEVER: a sparkle trail in the child's colour */
      feverTrailAcc += dt;
      while (feverTrailAcc > 0.05) { feverTrailAcc -= 0.05; const p = spec(fx.simG, px - 0.25, cy + (fx.simG.rand() - 0.5) * 0.3, 0.1, memberInt, 0.85); p.cell = 0; p.life = 0.5; p.s0 = 0.14; p.s1 = 0.03; p.vx = -0.8; fx.simG.emit(); }
    } else feverTrailAcc = 0;
    if (capeTrail > 0) {                                 /* the cape trails a red ribbon on double jumps */
      capeTrail -= dt;
      const p = spec(fx.simS, px - 0.22, h + 0.36, -0.02, CAPE, 0.9); p.cell = 6; p.life = 0.35; p.s0 = 0.1; p.s1 = 0.04; p.vx = -0.5; p.rot = vt * 3; fx.simS.emit();
    }
    if (s.ready) { fx.twinkle(px - 0.3, 0.08, 0.3, 0.9); fx.twinkle(px + 0.26, 0.1, 0.3, 0.7); }
    if (s.fever) fx.halo(px, cy, -0.1, 1.5, memberInt, 0.32);
  }

  function updateCamera(dt, phase, menu, px, h) {
    const aspect = camera.aspect || 16 / 9;
    let fov = M.fovFor(aspect);
    if (menu) {
      const yaw = M.menuOrbit(vt, reduced), C = M.CAM.menu;
      camTgt.set(px + C.dx, C.lookY, 0);
      camPos.set(camTgt.x + Math.sin(yaw) * C.z, C.y, Math.cos(yaw) * C.z);
    } else if (demo) {                                  /* shop preview framing: a stage-riser turn */
      const a = reduced ? 0.4 : vt * 0.15 * TAU;
      camTgt.set(px, 0.6 + 0.3 * h, 0);
      camPos.set(px + Math.sin(a) * 5.2, 1.6 + 0.3 * h, Math.cos(a) * 5.2);
    } else {
      hSm = reduced || firstFrame ? h : M.approach(hSm, h, dt, M.CAM.smooth);
      M.followCam(px, hSm, camOff);
      camPos.set(camOff.x, camOff.y, camOff.z); camTgt.set(camOff.tx, camOff.ty, camOff.tz);
      feverK = reduced ? (s && s.fever ? 1 : 0) : M.approach(feverK, s && s.fever ? 1 : 0, dt, 1 / M.CAM.feverT * 3);
      fov += M.CAM.feverFov * feverK;
      if (s && (s.phase === 'encore')) fov = Math.max(fov, M.CAM.encoreFov);       /* the Encore chase */
      if (finishing()) {                                   /* the finish crane, facing the pet's dance */
        const k = M.moveK(sinceShowEnd() - 0.4, M.CAM.finish.dur, reduced), F = M.CAM.finish;
        tmp.set(px + F.dx, F.y, F.z); tmp2.set(px, F.lookY, 0);
        camPos.lerp(tmp, k); camTgt.lerp(tmp2, k);
        if (phase === 'results' && !reduced) {           /* results: a slow stage-cam orbit */
          const yaw = 8 * DEG * Math.sin(TAU * vt / 14);
          tmp.subVectors(camPos, camTgt).applyAxisAngle(THREE.Object3D.DEFAULT_UP, yaw); camPos.copy(camTgt).add(tmp);
        }
      } else if (s && s.curtain) {                         /* the curtain call: dolly in, the pet centred between the curtains */
        const k = M.moveK(J.sinceCurtain, M.CAM.curtain.dur, reduced);
        camPos.z = M.lerp(M.CAM.z, M.CAM.curtain.z, k);
        camPos.x = M.lerp(camPos.x, px + 0.15, k); camTgt.x = M.lerp(camTgt.x, px + 0.15, k);
        camTgt.y = M.lerp(camTgt.y, 0.55, k);
      }
      if (holding) { camPos.copy(lastCamPos); camTgt.copy(lastCamTgt); }
      lastCamPos.copy(camPos); lastCamTgt.copy(camTgt);
      M.juiceCam(J, reduced, camOff);
      camPos.x += camOff.x; camPos.y += camOff.y + camOff.kick; camTgt.y += camOff.kick * 0.5;
    }
    camera.position.copy(camPos);
    camera.up.set(0, 1, 0);
    camera.lookAt(camTgt);
    fovSm = menu || reduced || firstFrame ? fov : M.approach(fovSm, fov, dt, 8);   /* FEVER punch / Encore widen ease in */
    if (Math.abs(camera.fov - fovSm) > 1e-3) { camera.fov = fovSm; camera.updateProjectionMatrix(); }
  }
  let fovSm = M.CAM.fov;

  function updatePickups(px, x0, x1, sT, menu) {
    const P = theme.pickups;
    P.begin();
    if (!menu && course) {
      const items = course.items;
      for (let i = Math.max(0, (s.ic | 0) - 10); i < items.length; i++) {
        const it = items[i], x = it.x / M.PX;
        if (x > x1) break;
        if (it.got || x < x0) continue;
        drawItem(P, it, x, M.worldY(it.y), sT, i);
      }
      if (s.lettersMask === 63 || s.phase === 'encore') {
        const enc = course.enc;
        for (let i = Math.max(0, (s.ec | 0) - 4); i < enc.length; i++) {
          const it = enc[i], x = it.x / M.PX;
          if (x > x1) break;
          if (it.got || x < x0) continue;
          drawItem(P, it, x, M.worldY(it.y), sT, i + 500);
        }
      }
      const sp = s.spill;                                 /* spilled treats: arc out, land and pulse (≤ 2 Hz) */
      for (let i = 0; i < sp.length; i++) {
        const q = sp[i]; if (!q.on) continue;
        const x = q.x / M.PX, y = M.worldY(q.y);
        P.snack(x, y, 0.35, M.pickupSpin(sT * 1.5, i, reduced), 0.9 * M.spillPulse(q.landed, q.landT, reduced));
        fx.blob(x, 0.35, 0.22, 0.16);
      }
    }
    /* zips to the HUD */
    for (let i = 0; i < zips.length; i++) {
      const q = zips[i]; if (!q.on) continue;
      q.t += lastDt;
      const u = q.t / q.dur;
      if (u >= 1) { q.on = false; continue; }
      tmp.set(q.nx, q.ny, 0.5).unproject(camera).sub(camera.position).normalize().multiplyScalar(3).add(camera.position);
      M.zipAt(u, q.x, q.y, q.z, tmp.x, tmp.y, tmp.z, zOut);
      if (q.type === 'snack') P.snack(zOut.x, zOut.y, zOut.z, vt * 9, zOut.s);
      else if (q.type === 'star') { P.star(zOut.x, zOut.y, zOut.z, vt * 6, zOut.s); fx.halo(zOut.x, zOut.y, zOut.z, 0.7 * zOut.s, CYAN, 0.6); }
      else if (q.type === 'letter') P.card(q.li, zOut.x, zOut.y, zOut.z, reduced ? 0 : (1 - u) * Math.PI * 2, zOut.s * 1.1);
    }
    P.end();
  }
  function drawItem(P, it, x, y, sT, salt) {
    const bob = M.pickupBob(sT, salt * 0.7, reduced);
    if (it.kind === 'snack') { P.snack(x, y + bob, 0, M.pickupSpin(sT, salt * 0.37, reduced), 1); return; }
    const h = y + bob;
    if (it.kind === 'star') {
      P.star(x, h, 0, reduced ? 0 : sT * Math.PI, 1);
      fx.halo(x, h, -0.05, 0.95 * L.haloS, CYAN, 0.55 * L.haloA);
    } else if (it.kind === 'letter') {
      P.card(it.li, x, h, 0, reduced ? 0 : sT * Math.PI + salt, 1);           /* turns at 0.5 rev/s */
      fx.halo(x, h, -0.1, 1.0 * L.haloS, HOLO_INTS[it.li % 4], 0.5 * L.haloA);
    } else if (it.kind === 'shield') {
      P.shield(x, h, 0, reduced ? 0 : sT * 2);
      fx.halo(x, h, -0.05, 0.7 * L.haloS, PEARL_BLUE, 0.45 * L.haloA);
    }
    if (y < 6) fx.blob(x, 0, 0.32 * Math.max(0.3, 1 - y / 5), 0.24 * Math.max(0.3, 1 - y / 5));
  }

  /* the show is over (the finish dance, or after the Encore) — not while the Encore runs */
  function finishing() { return !!s && (s.phase === 'finish' || (s.phase === 'done' && s.finished)); }
  function sinceShowEnd() { return s && s.encoreCleared ? J.sinceEncoreEnd : J.sinceFinish; }
  const avOpts = { reduced: reduced, bpm: M.BPM, speed: 0 };
  /* stage-left of the pet: cheers, then joins the 8-count (one group pose under reduced motion) */
  function updateAvatar(menu, stageX) {
    const show = !menu && finishing() && sinceShowEnd() > 0.3;
    if (!show) { if (avatar) avatar.root.visible = false; return; }
    const av = ensureAvatar();
    av.root.visible = true;
    av.root.position.set(stageX + 2.05, 0, 0.35);
    av.root.rotation.y = -0.35;
    const t = sinceShowEnd() - 0.3;
    try { av.play(t < 2.0 && !reduced ? 'cheer' : 'dance', t, avOpts); } catch (e) { /* cosmetic */ }
    fx.blob(stageX + 2.05, 0.35, 0.5, 0.4);
  }

  let lastDt = 0;
  function frame(round, dt, alpha, phase, countT) {
    if (disposed || paused || lost) return;
    if (lease && !lease.active) return;
    const t0 = performance.now();
    dt = Math.max(0, Math.min(0.1, dt || 0)); lastDt = dt; vt += dt;
    const menu = phase === 'menu' || phase === 'tutorial' || (!round && !bound);
    if (!menu && round && round !== bound) bind(round);
    if (menu) ensureTheme(menuVariant); else ensureTheme(bound.variant);

    /* ---- the pet's place this frame (interpolated with the fixed-step alpha) ---- */
    let px = M.petX(0), h = 0, speed = 0, sT = vt;
    if (!menu && s) {
      const v = speedNow(s);
      speed = Math.max(0, v) / M.PX;
      const a = phase === 'playing' ? Math.max(0, Math.min(1, alpha || 0)) : 0;
      const run = s.phase === 'run' || s.phase === 'encore';
      px = M.petX(s.dist + (run ? v * a * STEP : 0));
      h = M.feetH(s.y + (!s.onGround && run ? s.vy * a * STEP : 0));
      sT = s.t;
    }
    /* ---- events (read only; the shell empties round.events after each draw) ---- */
    if (!menu && round && round === bound && round.events && round.events.length) {
      const ev = round.events;
      for (let i = 0; i < ev.length; i++) onEvent(ev[i], px, h);
    }
    if (!menu) M.juiceStep(J, dt);

    /* ---- light: day → sunset → Showtime ---- */
    let k = 0;
    if (!menu && s) {
      k = M.showMix(s.sched, T2, T3, reduced);
      if (s.section >= 3) k = Math.max(k, 0.5);
      if (s.curtain) k = Math.max(k, 0.6 * M.curtainK(J.sinceCurtain, reduced));   /* the house lights dim for the bow */
    }
    if (demo) k = 1;
    M.lightAt(k, ctx.look, member, L);
    L.haloS = 1 + 0.6 * k; L.haloA = 0.5 + 0.4 * k;
    hemi.color.setHex(L.hemiSky); hemi.groundColor.setHex(L.hemiGround); hemi.intensity = L.hemiI;
    sun.color.setHex(L.sun); sun.intensity = L.sunI;
    scene.fog.color.setHex(L.fog); scene.fog.near = M.lerp(22, 18, k); scene.fog.far = M.lerp(75, 62, k);
    const fever = !menu && s && s.fever;
    K.uniforms.uRimColor.value.setHex(fever ? M.mixInt(L.rim, memberInt, 0.6) : L.rim);
    K.uniforms.uRimStrength.value = fever ? 0.7 : L.rimI;

    /* ---- pet + camera ---- */
    updatePet(dt, menu, px, h, speed, phase === 'countdown');
    updateCamera(dt, phase, menu, petDispX, petDispH);
    if (!menu && s) {                                     /* grace ends: the steady outline pops in a soft ring */
      if (prevInv > 0 && !(s.inv > 0) && !s.shield && s.phase === 'run') ring(petDispX, petDispH + 0.32, 0.1, PEARL, 1.3, 0.3);
      prevInv = s.inv || 0;
    }
    const camX = camera.position.x;
    sun.position.set(camX - 7, 14, 9); sun.target.position.set(camX, 0, 0); sun.target.updateMatrixWorld();
    const hw = halfWidth(), x0 = camX - hw - 1.2, x1 = camX + hw + 2.5;

    /* ---- world ---- */
    fx.begin();
    sky.update(camera, L, vt, renderer.getPixelRatio());
    clouds.update(camX, vt, L);
    if (L.discA > 0.01) fx.halo(camX + 7, L.discY, -32, 9, L.disc, 0.85 * L.discA);
    theme.hills.update(camX); theme.props.update(camX); theme.apron.update(camX);
    const finishX = course ? course.finishX : 23316, encEnd = course ? course.encoreEndX : 25941;
    const encoreOn = !menu && s && (s.lettersMask === 63 || s.phase === 'encore' || s.encoreCleared);
    const stageXlogic = !menu && s && (s.phase === 'encore' || s.encoreCleared) ? encEnd : finishX;
    if (menu) { stageRange[0] = -99; stageRange[1] = -98; }
    else { stageRange[0] = finishX / M.PX - 1.0; stageRange[1] = (encoreOn ? encEnd : finishX) / M.PX + 7; }
    theme.runway.update(camX, BRIDGE, stageRange);
    if (encoreOn && !menu) {                              /* the Encore catwalk's path chase-light (≤ 2 Hz) */
      const a = Math.max(finishX / M.PX, x0), b = Math.min(encEnd / M.PX + 4, x1);
      for (let x = Math.ceil(a / 0.8) * 0.8; x < b; x += 0.8) {
        const idx = Math.round(x / 0.8), on = reduced || (idx + Math.floor(sT * 2)) % 3 === 0;
        fx.halo(x, 0.03, 0, on ? 0.34 : 0.16, CYAN, on ? 0.85 : 0.3);
      }
    }
    /* LEDs */
    const ls = leds.st;
    if (menu || !s) { ls.mult = 1; ls.fever = false; ls.sinceTier = 99; ls.sinceClear = 99; ls.dark = 0; ls.t = vt; }
    else {
      ls.mult = Math.min(3, s.mult); ls.fever = !!s.fever; ls.prevMult = Math.min(3, J.tierFrom); ls.prevFever = J.tierFrom >= 4;
      ls.sinceTier = J.sinceTier; ls.sinceClear = J.sinceClear; ls.dark = J.ledDark; ls.t = sT;
    }
    ls.petX = petDispX;
    leds.update(camX, fx, L.haloS, L.haloA, camera.position.z);
    /* doors, finish arch, debut stage */
    theme.doors.update(course ? course.doors : null, camX, menu ? vt : sT, reduced, menu, finishX, stageXlogic, J.sinceDoor < 1.2 ? J.doorSec : -1);
    theme.bridge.update(BRIDGE, camX, petDispX, sT, reduced, fx);
    /* obstacles */
    theme.obstacles.update(menu ? null : s, menu ? null : course, x0, x1, sT, L.neon, fx, reduced);
    updatePickups(petDispX, x0, x1, sT, menu);
    updateAvatar(menu, stageXlogic / M.PX);
    /* fans (from the Chorus door) */
    const fs = fans.st;
    fs.t = sT; fs.excite = J.excite; fs.ooh = J.ooh; fs.fever = !!fever; fs.reduced = reduced;
    fs.lastHeart = !menu && s && s.hearts === 1 && !s.finished && (s.phase === 'run' || s.phase === 'curtain');
    fans.update(camX, menu ? 0 : (demo ? 1 : L.fans), fx, L.haloS);
    if (fs.lastHeart && fans.count() > 0 && !reduced) {   /* fans hold up heart paws */
      heartAcc += dt;
      if (heartAcc > 0.45) { heartAcc = 0; const n = fans.count(), kk = (vt * 131 | 0) % n; hearts(fans.seats[kk * 4], fans.seats[kk * 4 + 3] + 0.1, fans.seats[kk * 4 + 2], 1, memberInt, 0.6); }
    }
    /* cones: sweep at Showtime; lock onto the pet at FEVER, at a Stage Door (0.5 s) and at the curtain call */
    const curtainK = !menu && s && s.curtain ? M.curtainK(J.sinceCurtain, reduced) : 0;
    coneOpts.alpha = conesOn ? Math.max(L.cones, curtainK * 0.9, demo ? 1 : 0) : 0;
    coneOpts.t = vt; coneOpts.dt = dt;
    coneOpts.lock = !menu && s && (s.fever || J.sinceDoor < M.VIEW.DOOR_CONES || s.curtain || s.finished || s.phase === 'finish') ? 1 : 0;
    petTarget.set(petDispX, petDispH + 0.3, 0);
    for (let i = 0; i < 3; i++) {
      const e = J.sinceFeverEnd;
      coneOpts.on[i] = J.feverByBump && e < 1.2 ? (e < i * M.VIEW.CONE_OFF_STEP ? 1 : e < 0.8 ? 0 : (e - 0.8) / 0.4) : 1;
    }
    cones.update(camX, coneOpts);
    /* FEVER set-piece, trails, results confetti */
    feverPiece(dt, camX, hw, camera.position.y + 2.6);
    if (!menu) updateTrails(dt, petDispX, petDispH);
    if (!menu && s && s.finished && !reduced && (phase === 'results' || s.phase === 'done')) {
      confettiAcc += dt;
      if (confettiAcc > 0.55) { confettiAcc = 0; confetti(petDispX + (fx.simS.rand() - 0.5) * 3, 3.2, -0.5, 6, -Math.PI / 2, 1.2, 0.8); }
    }
    /* curtains */
    curtains.update(curtainK, camera.fov, camera.aspect);
    fx.step(dt, reduced);
    fx.end();

    prevFever = !!fever;
    firstFrame = false;
    renderer.setClearColor(L.fog, 1);
    renderer.toneMappingExposure = L.exposure;
    renderer.render(scene, camera);
    if (lease && (phase === 'playing' || phase === 'countdown')) lease.sample(performance.now() - t0);
  }

  /* ---------------- warm-up: compile every program behind the menu ---------------- */
  let warmed = false;
  function warm() {
    if (warmed || disposed) return;
    warmed = true;
    const hidden = [];
    scene.traverse(function (o) { if (!o.visible) { hidden.push(o); o.visible = true; } });
    try {
      if (lease) lease.compile(scene, camera);
      else if (renderer.compileAsync) renderer.compileAsync(scene, camera).catch(function () {});
      else renderer.compile(scene, camera);
    } catch (e) { /* compiles lazily instead */ }
    for (let i = 0; i < hidden.length; i++) hidden[i].visible = false;
  }

  /* ---------------- API ---------------- */
  function resize(w, h) {
    if (disposed) return;
    w = Math.max(1, Math.round(w || 1)); h = Math.max(1, Math.round(h || 1));
    lastW = w; lastH = h;
    if (lease) lease.resize(w, h); else renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  function setRound(round, variant) {
    if (disposed) return;
    if (round) { menuVariant = round.variant || variant || menuVariant; bind(round); }
    else { if (variant) menuVariant = variant; bound = null; s = null; course = null; theme && theme.obstacles.bind(null); if (avatar) avatar.root.visible = false; }
    ensureTheme(round ? round.variant : menuVariant);
  }
  /* Also the teardown of a build that threw halfway (build() calls it then): every step is
     bestEffort(), so whatever was not built yet is skipped and the rest — above all
     lease.release() — still runs. */
  function dispose() {
    if (disposed) return;
    disposed = true;
    bestEffort(function () { if (unsubQ) unsubQ(); });
    bestEffort(dropTheme);
    bestEffort(function () { parts.forEach(function (p) { bestEffort(function () { p.dispose(); }); }); parts.length = 0; });
    bestEffort(function () { if (hat) hat.dispose(); });
    bestEffort(function () { rig.dispose(); });
    bestEffort(function () { if (avatar) avatar.dispose(); });
    bestEffort(function () { shieldMesh.removeFromParent(); shieldMesh.dispose(); });
    bestEffort(function () { graceMesh.removeFromParent(); graceMesh.dispose(); });
    bestEffort(function () { own.forEach(function (o) { bestEffort(function () { o.dispose(); }); }); });
    bestEffort(function () { scene.clear(); });
    bestEffort(function () { K.uniforms.uRimColor.value.copy(rimSave.color); K.uniforms.uRimStrength.value = rimSave.strength; });
    bestEffort(function () { if (canvas.parentNode === mid) mid.removeChild(canvas); });
    bestEffort(function () { canvas.className = savedClass; canvas.style.cssText = savedCss; canvas.removeAttribute('aria-hidden'); });
    bestEffort(function () { api.canvas = null; });       /* the shared canvas goes back to the island, not to the shell */
    if (lease) bestEffort(function () { lease.release(); });
    else if (ownRenderer) bestEffort(function () { renderer.dispose(); renderer.forceContextLoss(); });
    if (hub) bestEffort(function () { hub.dispose(); });
  }

  /* the avatar is built (hidden) BEFORE the warm-up below, so its programs — the face's alpha-
     tested 'state' material, the wand's plain toon / neon / halo meshes, none of which the
     course otherwise uses — compile behind the menu, not in the frame its finish cheer starts */
  ensureAvatar();
  ensureTheme(menuVariant);
  camera.position.set(3, 1.6, 7.5);
  const api = {
    canvas: canvas, frame: frame, resize: resize, setRound: setRound, dispose: dispose,
    /* QA: what is on screen (renderer.info) */
    info: function () { const ri = renderer.info; return { tier: tier, calls: ri.render.calls, tris: ri.render.triangles, programs: ri.programs ? ri.programs.length : 0, lease: !!lease, fallbackPet: !!rig.fallback }; }
  };
  return api;
}
