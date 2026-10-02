/* ================================================================
   Neon Grand Prix — the 3D view (ES module; CONTRACTS §2 / §6).
   The shell imports this file (after window.slLoad3D() resolved THREE),
   calls create(mid, opts) and then frame(round|null, dt, alpha, phase,
   countT) on every draw. The view only READS round.race (track, k, s, pr,
   rivals, pacers, ref) and drains round.events — it never changes logic
   state, so the shell can drop to the 2D renderer mid-race at any time.

   export create(mid, {THREE, cfg, api, def, reduced, onFail}) → Promise<view>
     view {canvas, frame(round, dt, alpha, phase, countT), resize(cssW, cssH),
           setRound(round|null, variant), dispose(), cycleCamera(), info()}
     (createKartView is the same function, for the spec's name)

   Renderer: SL3D.lease('game') — the island's one shared WebGLRenderer, which
   the view renders itself inside frame() (never L.start()); dispose() hands it
   back with L.release(). Without the island runtime it makes its own renderer
   with the tier's settings, and every model falls back to local primitives in
   the same LOCKED colours.

   Owns: the camera rig (Chase / Stage / High / TV, C key or the 🎥 button;
   intro crane on the session's first race, boost FOV kick + speed lines,
   final-lap push-in, finish orbit, bump shake — all cuts under reduced
   motion), the light arc SOUNDCHECK → SHOWTIME → ENCORE, the Spotlight
   cones, the event → juice map, the HTML HUD, the menu grid scene and the
   results podium.
   ================================================================ */
import * as THREE_NS from 'three';

const Q = (function () { try { return new URL(import.meta.url).search; } catch (e) { return ''; } }());
let craneSeen = false;                      /* the intro crane plays on the first race of the session only */
let stageP = null;

/* the island runtime (stage.js) when the page has not loaded it yet */
function injectStage() {
  if (stageP) return stageP;
  stageP = new Promise((res) => {
    try {
      const tag = document.createElement('script');
      tag.src = new URL('world/island3d/stage.js?v=' + (window.SL_WORLD_VER || '1'), document.baseURI).href;
      tag.async = false;
      const done = () => res(!!window.SLIsland3D);
      tag.onload = done; tag.onerror = done;
      setTimeout(done, 6000);
      document.head.appendChild(tag);
    } catch (e) { res(false); }
  });
  return stageP;
}
async function getSL3D() {
  try {
    if (typeof window === 'undefined') return null;
    if (!window.SLIsland3D) await injectStage();
    const IS = window.SLIsland3D;
    if (IS && typeof IS.ensure === 'function') return (await IS.ensure({ deadlineMs: 6000 })) || null;
  } catch (e) { /* 3D runtime unavailable: local primitives */ }
  return null;
}
/* one teardown step; a step for something a failed build never reached throws (a ReferenceError
   for a name not declared yet) and is skipped, so every other step still runs */
function bestEffort(fn) { try { fn(); } catch (e) { /* not built, or already gone */ } }
function fallbackBudget(tier) {
  const T = typeof window !== 'undefined' ? window.SLTier : null;
  if (T && typeof T.budget === 'function') { try { return T.budget(tier, window.devicePixelRatio || 1); } catch (e) { /* below */ } }
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  return tier === 'LOW'
    ? { tier, pixelRatio: 1, antialias: false, gameDrawCalls: 60, gameTris: 50000, particles: 128, confetti: 120, stars: 120, crowd: 30, shadows: false, shadowMapSize: 0, outlines: false }
    : { tier, pixelRatio: Math.min(dpr, 1.5), antialias: true, gameDrawCalls: 90, gameTris: 100000, particles: 256, confetti: 120, stars: 250, crowd: 60, shadows: true, shadowMapSize: 1024, outlines: true };
}

export async function create(mid, opts) {
  opts = opts || {};
  const THREE = THREE_NS;
  const cfg = opts.cfg || {};
  const reducedMotion = !!(opts.reduced || cfg.reduced);
  let failed = false;
  const fail = (why) => { if (failed) return; failed = true; try { if (opts.onFail) opts.onFail(why); } catch (e) { /* shell handles it */ } };

  /* ---------------- modules + the island runtime, in parallel ---------------- */
  const [SL3D, , kitM, envM, trackM, modelsM, fxM, hudM] = await Promise.all([
    getSL3D(),
    import('./kart-3d-core.js' + Q),
    import('./kart-3d-kit.js' + Q), import('./kart-3d-env.js' + Q), import('./kart-3d-track.js' + Q),
    import('./kart-3d-models.js' + Q), import('./kart-3d-fx.js' + Q), import('./kart-3d-hud.js' + Q)
  ]);
  const core = window.SLKart3DCore, KL = window.SLKartLogic;
  if (!core || !KL) throw new Error('kart-3d: core or kart logic missing');
  const tier = (SL3D && SL3D.tier) || (/Mobi|Android|iPad|iPhone/.test(navigator.userAgent || '') ? 'LOW' : 'MID');
  const budget = (SL3D && SL3D.budget) || fallbackBudget(tier);
  const quality = (SL3D && SL3D.quality) || { pixelRatio: budget.pixelRatio, shadows: !!budget.shadows, outlines: !!budget.outlines, particleScale: 1, cones: true, steps: [] };

  /* ---------------- build: everything that may hold the island's renderer ----------------
     The view is built in ONE synchronous step once the modules are in. If anything in it
     throws, the half-built view is torn down — above all the renderer lease is handed back —
     before the error reaches the shell (which then carries on in 2D). A leaked game lease
     would stay current and the 3D island would never render again after the game. */
  const built = { dispose: null };
  try {
    const view = buildView();
    cfg.view3d = true;                          /* kart.js: the menu offers the Camera row */
    return view;
  } catch (err) {
    if (built.dispose) bestEffort(built.dispose);
    cfg.view3d = false;
    throw err;
  }

  function buildView() {
    /* first, before anything that can throw: what dispose() needs to undo a half-built view */
    built.dispose = dispose;
    let disposed = false;
    const ac = new AbortController();
    /* ---------------- the renderer: the island's lease, or our own ---------------- */
    let L = null, renderer = null, revoked = false, lost = false, lostCount = 0;
    const handlers = {
      onRevoke(lease, why) { revoked = true; if (why === 'dispose') fail('revoked'); },
      onResume() { revoked = false; attachCanvas(); applyRendererState(); shadowsDirty = true; },
      onLost() { lost = true; },
      onRestored() { lost = false; shadowsDirty = true; },
      onFail(reason) { fail(reason || 'lease'); },
      onQuality(q, step) { applyQuality(q, step); }
    };
    if (SL3D && typeof SL3D.lease === 'function') { try { L = SL3D.lease('game', handlers); } catch (e) { L = null; } }
    if (L) renderer = L.renderer;
    else {
      renderer = new THREE.WebGLRenderer({ antialias: !!budget.antialias, alpha: false, stencil: false, powerPreference: 'high-performance' });
      renderer.setPixelRatio(budget.pixelRatio || 1);
      renderer.shadowMap.enabled = !!quality.shadows;
      renderer.shadowMap.autoUpdate = false;
    }
    const canvas = renderer.domElement;
    const saved = {
      css: canvas.style.cssText, cls: canvas.className, exposure: renderer.toneMappingExposure, toneMapping: renderer.toneMapping,
      clear: renderer.getClearColor(new THREE.Color()), clearA: renderer.getClearAlpha(), autoClear: renderer.autoClear, parent: canvas.parentNode
    };
    function onCtxLost(e) {
      if (L) return;
      if (e && e.preventDefault) e.preventDefault();
      lost = true; lostCount++;
      if (lostCount >= 2) fail('context');
      else setTimeout(() => { if (lost) fail('context'); }, 6000);
    }
    function onCtxRestored() { lost = false; shadowsDirty = true; }
    if (!L) { canvas.addEventListener('webglcontextlost', onCtxLost, false); canvas.addEventListener('webglcontextrestored', onCtxRestored, false); }
    function attachCanvas() {
      canvas.style.cssText = '';
      canvas.classList.add('slg-gl');
      if (mid && canvas.parentNode !== mid) {
        const c2d = mid.querySelector && mid.querySelector('#slgCanvas');
        if (c2d) mid.insertBefore(canvas, c2d); else mid.insertBefore(canvas, mid.firstChild);
      }
    }
    canvas.style.cssText = '';
    function applyRendererState() {
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.NeutralToneMapping != null ? THREE.NeutralToneMapping : THREE.ACESFilmicToneMapping;
      renderer.autoClear = true;
      renderer.shadowMap.enabled = !!quality.shadows && !!budget.shadows;
      renderer.shadowMap.type = THREE.PCFShadowMap;
      renderer.toneMappingExposure = exposure;
    }

    /* ---------------- scene, camera, kit, HUD, effects ---------------- */
    const scene = new THREE.Scene();
    scene.name = 'neon-grand-prix';
    const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 520);
    camera.position.set(0, 12, 20);
    scene.add(camera);
    const kit = kitM.makeKit(THREE, SL3D, tier);
    const user = cfg.user || {};
    const sigHex = core.normHex(user.color) || core.normHex(cfg.color) || '#FF5FA2';
    const sigCol = new THREE.Color(sigHex);
    const ctxBase = { THREE, kit, core, SL3D, tier, budget, quality, reduced: reducedMotion, sigHex };
    let camMode = core.camMode((cfg.kartOpts && cfg.kartOpts.cam) || 'chase'), lastOptCam = (cfg.kartOpts && cfg.kartOpts.cam) || null;
    const hud = hudM.makeHud(mid, { core, sigHex, reduced: reducedMotion, onCam: () => cycleCamera() });
    hud.setCam(core.CAM_LABEL[camMode]);
    const fx = fxM.makeFx({ ...ctxBase, camera });
    scene.add(fx.group);
    const blobs = kit.blobs(8);
    scene.add(blobs.mesh);
    const blobIdx = [];
    for (let i = 0; i < 8; i++) blobIdx.push(blobs.alloc());
    const player = modelsM.makePlayer({ ...ctxBase, kart: cfg.kart, pet: cfg.pet });
    scene.add(player.root);
    const crewList = KL.CREW.map((c) => ({ id: c.id, name: c.name, color: c.color, topper: c.topper }));
    const rivals = modelsM.makeRivals(ctxBase, crewList);
    scene.add(rivals.group);
    let pacers = null, pacerKey = '';
    let avatar = null;

    /* ---------------- per-track scene (cached while the track is in use) ---------------- */
    let cur = null, shadowsDirty = true, compiled = false;
    function ensureTrack(id, trackObj) {
      if (cur && cur.id === id) return cur;
      if (cur) { cur.env.dispose(); cur.tr.dispose(); }
      if (avatar) { avatar.dispose(); avatar = null; }
      const track = trackObj || KL.buildTrack(id);
      const rect = core.islandRect(track);
      const env = envM.buildEnv({ ...ctxBase, track, rect });
      const tr = trackM.buildTrack({ ...ctxBase, track, rect });
      scene.add(env.group, tr.group);
      scene.fog = env.fog;
      env.setConeMounts(tr.spots.standCones || [], tr.spots.gantryCones || []);
      const homes = [];
      for (let i = 0; i < 3; i++) homes.push((tr.spots.coneHomes && tr.spots.coneHomes[i]) || new THREE.Vector3(rect.cx, 0, rect.cz));
      for (let i = 0; i < 2; i++) homes.push((tr.spots.gantryHomes && tr.spots.gantryHomes[i]) || new THREE.Vector3(rect.cx, 0, rect.cz));
      avatar = modelsM.makeAvatar(ctxBase, user, tr.spots.avatar);
      if (avatar) scene.add(avatar.group);
      cur = { id, track, rect, env, tr, homes, tv: core.tvPosts(track), J: track.feat.jump };
      hud.setTrack(track, track.laps);
      shadowsDirty = true; compiled = false;
      arc.k = -1;                                       /* re-apply the preset to the new env */
      return cur;
    }

    /* ---------------- view state (all preallocated) ---------------- */
    let round = null, variant = cfg.variant || 'track_loop', clock = 0, exposure = 1, lastPhase = '';
    const arc = { k: -1, from: 0, to: 0, t: 1, dur: 0, level: 0 };
    const preset = {};
    const fxT = { hop: 9, land: 9, bump: 9, shake: 9, dizzy: 9, trick: 9, push: 9, go: 9, finish: -1, sparkC: 0, jetC: 0, dustC: 0, skidC: 0, trailC: 0 };
    let boostK = 0, spotW = 0, snapUntil = -1, waveStart = -99, omegaS = 0, camYaw = 0, jumpK = 0, fovNow = 50, camSnap = true;
    let craneOn = false, ledOverride = '', ledUntil = 0, splits = { best: null, next: null }, waveUntil = new Float32Array(8);
    let podiumOn = false, podiumOrder = null, confettiT = 0, glowTick = 0;
    const firework = [];                                /* scheduled bursts {at, i} */
    const camPos = new THREE.Vector3(0, 12, 20), camLook = new THREE.Vector3(), _v = new THREE.Vector3(), _w = new THREE.Vector3(), _t = new THREE.Vector3();
    const want = {}, crane = {}, pst = {}, spinP = {}, sq = {}, tmpPt = {}, coneInfo = { encore: 0, spot: 0, snap: 0, target: new THREE.Vector3(), homes: null };
    const glowPts = new Float32Array(75);
    const hudV = { place: 0, total: 0, gapVal: null, splits: [], lap: 0, laps: 3, wandPips: 0, full: false, spot: false, dots: [], night: false, wrong: false };
    const dotPool = [];
    for (let i = 0; i < 8; i++) dotPool.push({ x: 0, y: 0, color: '#fff', me: false });
    const trackSt = { t: 0, gates: 0, encore: 0, haloScale: 1, haloAlpha: 0.5, wandHex: null, waveSince: null, noteGot: null, banks: -1, go: false, led: '', reduced: reducedMotion };
    const ledArg = { override: null, lap: -1, laps: 0, place: -1 };
    let ledText = 'NEON GRAND PRIX';
    const dueOut = { n: 0, carry: 0 };
    const OPT_DRIFT = { speed: 1.2, life: 0.35, size: 0.16 };
    const OPT_JET = { cell: kit.ATLAS.star, speed: 0.8, life: 0.4, gravity: 0, size: 0.16 };
    const OPT_TRAIL = { cell: kit.ATLAS.sparkle, speed: 0.4, life: 0.7, gravity: 0.3, size: 0.13 };
    const JET_COLS = [player.kartHex, core.COL.starGold];
    const TRAIL_COLS = [core.COL.coral, '#FFA94D', core.COL.starGold, core.COL.leafMint, '#4FC3F7', core.COL.grape];
    const TIMERS = ['hop', 'land', 'bump', 'shake', 'dizzy', 'trick', 'push', 'go'], SQUASH = ['hop', 'land', 'bump'];
    /* the player pose at rest (menu grid, podium) */
    function restPst(dt, clip, petStand) {
      pst.dt = dt; pst.t = clock; pst.v = 0; pst.steer = 0; pst.drifting = false; pst.tier = 0; pst.grey = false; pst.boostK = 0;
      pst.wand = petStand ? 1 : 0.15; pst.spot = false; pst.roll = 0; pst.squashY = 1; pst.squashXZ = 1; pst.squashX = 1; pst.squashZ = 1; pst.spinTurn = 0; pst.hop = 0;
      pst.clip = clip; pst.clipT = clock; pst.encore = preset.encore || 0; pst.marker = false; pst.reduced = reducedMotion;
      pst.petStand = !!petStand; pst.trickSpin = 0;
      return pst;
    }

    function startArc(level, instant) {
      const to = core.arcK(level);
      arc.level = level;
      if (instant || arc.k < 0) { arc.from = arc.to = to; arc.t = 1; arc.dur = 0; arc.k = -1; return; }
      arc.from = arc.cur == null ? to : arc.cur; arc.to = to; arc.t = 0; arc.dur = reducedMotion ? core.ARC_SEC_REDUCED : core.ARC_SEC;
    }
    function stepArc(dt) {
      let k;
      if (arc.t < 1 && arc.dur > 0) {
        arc.t = Math.min(1, arc.t + dt / arc.dur);
        k = core.arcBlend(arc.from, arc.to, arc.t * arc.dur, reducedMotion);
        if (arc.t >= 1) shadowsDirty = true;             /* the static map re-renders at each arc change */
      } else k = arc.to;
      if (Math.abs(k - arc.k) > 1e-4 || arc.k < 0) {
        arc.k = k;
        core.arcPreset(k, cur.id, preset, sigHex);
        cur.env.apply(preset);
        kit.setRim(preset.rimColor, preset.rimStrength);
        exposure = preset.exposure;
        renderer.toneMappingExposure = exposure;
        renderer.setClearColor(cur.env.fog.color, 1);
      }
      arc.cur = k;
    }

    /* ---------------- setRound: a new race (or the menu grid for a variant) ---------------- */
    function setRound(r, v) {
      if (disposed) return;
      round = r && r.race ? r : null;
      if (v) variant = v;
      const race = round ? round.race : null;
      const id = race ? race.track.id : variant;
      ensureTrack(id, race ? race.track : null);
      /* pacers (Solo) */
      const plist = race ? race.pacers : [];
      const key = plist.map((p) => p.kind + p.medal).join('|');
      if (key !== pacerKey) {
        if (pacers) { pacers.dispose(); pacers = null; }
        pacerKey = key;
        if (plist.length) { pacers = modelsM.makePacers(ctxBase, plist); scene.add(pacers.group); }
      }
      rivals.group.visible = !race || race.rivals.length > 0;
      /* fresh round state */
      fxT.hop = fxT.land = fxT.bump = fxT.shake = fxT.dizzy = fxT.trick = fxT.push = fxT.go = 9; fxT.finish = -1;
      boostK = 0; spotW = 0; snapUntil = -1; waveStart = -99; omegaS = 0; jumpK = 0; ledOverride = ''; ledUntil = 0;
      splits = { best: null, next: null }; waveUntil.fill(0); firework.length = 0;
      podiumOn = false; podiumOrder = null; cur.tr.showPodium(false);
      fx.clear(); hud.clearWords();
      camSnap = true;
      startArc(race ? race.s.lapLight : 0, true);
      craneOn = !!race && !craneSeen && !reducedMotion && race.s.t === 0;
      /* the menu's Camera chip (kart.js options) wins whenever it changed since we last looked */
      const optCam = (cfg.kartOpts && cfg.kartOpts.cam) || (round && round.opts && round.opts.cam) || null;
      if (optCam && optCam !== lastOptCam) { lastOptCam = optCam; camMode = core.camMode(optCam); }
      hud.setCam(core.CAM_LABEL[camMode]);
      precompile();
    }
    function precompile() {
      if (compiled) return;
      compiled = true;
      try {
        if (L && typeof L.compile === 'function') L.compile(scene, camera);
        else if (typeof renderer.compileAsync === 'function') renderer.compileAsync(scene, camera).catch(() => {});
      } catch (e) { /* compiles lazily on first render */ }
    }

    /* ---------------- events → juice (the logic already played every sound) ---------------- */
    const STEP = KL.STEP, PHYS = KL.PHYS;
    function kartWorld(out) { const k = round.race.k; return out.set(core.wx(k.x), 0.3, core.wz(k.y)); }
    function rearOf(out, side) {
      const yaw = player.root.rotation.y, c = Math.cos(yaw), s2 = Math.sin(yaw);
      const lx = 0.25 * side, lz = -0.3;
      return out.set(player.root.position.x + lx * c + lz * s2, player.root.position.y + 0.1, player.root.position.z - lx * s2 + lz * c);
    }
    function onEvent(e) {
      const C = core.COL, race = round.race, k = race.k;
      switch (e.type) {
        case 'go':
          fxT.go = 0; setLed('GO!', 1.5);
          (cur.tr.spots.cannonsGo || []).forEach((cn) => fx.confetti(cn.pos, cn.dir, 30, sigHex));
          break;
        case 'rocket':
          hud.word('rocket', clock);
          for (let sd = -1; sd <= 1; sd += 2) { rearOf(_v, sd); fx.spark(_v.x, _v.y, _v.z, 9, [player.kartHex, C.starGold, '#FFFFFF'], { cell: kit.ATLAS.star, speed: 2.2, life: 0.6, gravity: 0, size: 0.24 }); }
          break;
        case 'driftStart': fxT.hop = 0; break;
        case 'driftTier': rearOf(_v, 0); fx.spark(_v.x, _v.y, _v.z, 6, core.TIER_COL[e.tier], { speed: 1.6, life: 0.4 }); break;
        case 'driftRelease':
          if (e.tier > 0) {
            const w = core.WORDS.spark;
            hud.word({ text: w.text, big: true, color: core.TIER_COL[e.tier], scale: [1, 1.15, 1.3][e.tier - 1] }, clock);
            rearOf(_v, 0); fx.spark(_v.x, _v.y, _v.z, 10 + e.tier * 4, [core.TIER_COL[e.tier], '#FFFFFF'], { speed: 2.6, life: 0.5, gravity: 0 });
          }
          break;
        case 'fizzle': kartWorld(_v); fx.dust(_v.x, 0.2, _v.z, 6, C.pebble); break;
        case 'pad':
          kartWorld(_v); fx.spark(_v.x, 0.2, _v.z, 10, [C.neonCyan, '#FFFFFF'], { speed: 2.4, life: 0.4, gravity: 0 });
          if (e.onBeat) hud.word('onbeat', clock);
          break;
        case 'note': {
          const i = e.trail * 5 + e.k;
          cur.tr.notePos(i, _v);
          fx.spark(_v.x, _v.y, _v.z, 8, [C.neonPink, C.neonCyan], { cell: kit.ATLAS.star, speed: 1.5, life: 0.45, gravity: 0, size: 0.18 });
          if (e.full) hud.word('trail', clock);
          break;
        }
        case 'jump': (cur.tr.spots.cannonsJump || []).forEach((cn) => fx.confetti(cn.pos, cn.dir, tier === 'LOW' ? 10 : 20, sigHex)); break;
        case 'trick': fxT.trick = 0; kartWorld(_v); fx.spark(_v.x, _v.y + 0.5, _v.z, 12, [C.starGold, '#FFFFFF'], { cell: kit.ATLAS.star, speed: 1.6, life: 0.5, gravity: 0 }); break;
        case 'land': fxT.land = 0; kartWorld(_v); fx.dust(_v.x, 0.08, _v.z, 8, C.dust); if (e.trick) fx.spark(_v.x, 0.3, _v.z, 10, [C.starGold, sigHex], { cell: kit.ATLAS.star, speed: 2, life: 0.5 }); break;
        case 'scrape': {
          const side = e.side || 1, yaw = player.root.rotation.y;
          _v.set(player.root.position.x - Math.cos(yaw) * 0.3 * side, 0.2, player.root.position.z + Math.sin(yaw) * 0.3 * side);
          fx.spark(_v.x, _v.y, _v.z, 6, [C.coral, C.starGold], { speed: 2.2, life: 0.35 });
          hud.word('scrape', clock);
          cur.tr.wobbleNear(k.x, k.y);
          break;
        }
        case 'bump': fxT.bump = 0; fxT.shake = 0; hud.word('bump', clock); cur.tr.wobbleNear(k.x, k.y); break;
        case 'spin': fxT.shake = 0; fxT.dizzy = 0; hud.word('spin', clock); cur.tr.wobbleNear(k.x, k.y); break;
        case 'gate': if (e.clean) hud.word('clean', clock); break;
        case 'lap': if (e.n < race.track.laps) (cur.tr.spots.cannonsGo || []).forEach((cn) => fx.confetti(cn.pos, cn.dir, 20, sigHex)); break;
        case 'finalLap':
          hud.banner('ENCORE LAP!'); fxT.push = 0;
          for (let i = 0; i < 3; i++) firework.push({ at: clock + 0.6 + i * 0.45, i });
          break;
        case 'lightArc': startArc(e.level, false); break;
        case 'spotlight': hud.word('spotlight', clock); waveStart = clock; if (avatar) avatar.cheer(); break;
        case 'pass':
          hud.word('pass', clock, sigHex);
          if (e.rival >= 0 && e.rival < waveUntil.length) waveUntil[e.rival] = clock + 1.6;
          if (e.place === 1) { snapUntil = clock + 2; setLed(((cfg.pet && cfg.pet.name) || 'YOUR PET') + ' · P1!', 2); waveStart = clock; }
          break;
        case 'pacerGap': {
          const pc = race.pacers.filter((p) => p.kind === e.kind)[0];
          const icon = e.kind === 'best' ? '🏆' : ((KL.MEDALS[pc && pc.medal] || {}).icon || '');
          splits[e.kind] = core.splitText(icon, e.dt);
          break;
        }
        case 'finish':
          fxT.finish = 0; waveStart = clock;
          (cur.tr.spots.cannonsGo || []).forEach((cn) => fx.confetti(cn.pos, cn.dir, 60, sigHex));
          for (let i = 0; i < 3; i++) firework.push({ at: clock + 0.2 + i * 0.4, i });
          setLed(core.finishLed(race.rivals.length ? e.place : 0, e.ms), 1e9);
          if (avatar) avatar.cheer();
          break;
        default: break;
      }
    }
    function setLed(text, sec) { ledOverride = text; ledUntil = clock + sec; }

    /* ---------------- per-frame: the live race ---------------- */
    function raceFrame(dt, alpha, phase, countT) {
      const race = round.race, k = race.k, rs = race.s, pr = race.pr, track = race.track, J = cur.J;
      const a = phase === 'playing' ? Math.max(0, Math.min(1, alpha || 0)) : 1;
      const evs = round.events;
      if (evs && evs.length) for (let i = 0; i < evs.length; i++) onEvent(evs[i]);
      for (let i = 0; i < TIMERS.length; i++) fxT[TIMERS[i]] += dt;
      if (fxT.finish >= 0) fxT.finish += dt;
      /* the kart pose (interpolated; shortest-arc heading) */
      const lx = core.lerp(k.px, k.x, a), ly = core.lerp(k.py, k.y, a), h = core.lerpAngle(k.ph, k.h, a);
      const x = core.wx(lx), z = core.wz(ly), y = core.kartHeight(J, lx, ly, k.air, k.airH);
      const omega = core.wrapAngle(k.h - k.ph) / STEP;
      omegaS += (omega - omegaS) * core.damp(14, dt);
      const drifting = !!k.drift.on, slideFrac = k.slide / PHYS.SLIDE;
      const yaw = core.yawOf(h) - (k.slideDir || 0) * 0.12 * slideFrac;
      player.root.position.set(x, y, z);
      player.root.rotation.set(0, yaw, 0);
      core.spinPose(k.spinT, spinP);
      /* squash: drift hop, landing, bump (strongest wins) */
      let sy = 1, sxz = 1, win = '';
      for (let i = 0; i < SQUASH.length; i++) {
        core.squashAt(SQUASH[i], fxT[SQUASH[i]], sq);
        if (Math.abs(sq.sy - 1) + Math.abs(sq.sxz - 1) > Math.abs(sy - 1) + Math.abs(sxz - 1)) { sy = sq.sy; sxz = sq.sxz; win = SQUASH[i]; }
      }
      if (reducedMotion) { sy = 1; sxz = 1; win = ''; }
      boostK = core.boostEase(boostK, k.boostT > 0, dt);
      const spotOn = k.spotlightT > 0;
      spotW = reducedMotion ? (spotOn ? 1 : 0) : core.clamp(spotW + (spotOn ? dt / 0.4 : -dt / 0.8), 0, 1);
      /* the driver's clip */
      const coasting = rs.phase === 'coast';
      let clip = 'drive', clipT = clock;
      if (coasting) { clip = 'dance'; clipT = 4 * 60 / 118 + rs.coastT; }
      else if (fxT.dizzy < 1.2 || k.spinT > 0) { clip = 'dizzy'; clipT = fxT.dizzy; }
      else if (fxT.trick < 0.5) { clip = 'cheer'; clipT = fxT.trick; }
      pst.dt = dt; pst.t = clock; pst.v = Math.abs(k.v) / core.U; pst.steer = core.clamp(omegaS / 2.9, -1, 1);
      pst.drifting = drifting; pst.tier = k.drift.tier; pst.grey = drifting && k.onGrass; pst.boostK = reducedMotion ? Math.min(boostK, 0.6) : boostK;
      pst.wand = Math.min(1, rs.wand / PHYS.WAND); pst.spot = spotOn; pst.roll = reducedMotion ? 0 : core.bodyRoll(omegaS, drifting);
      /* a bump squashes the kart sideways (the hit side); hops and landings squash it round */
      pst.squashY = sy; pst.squashXZ = sxz; pst.squashX = sxz; pst.squashZ = win === 'bump' ? 1 : sxz; pst.spinTurn = reducedMotion ? 0 : spinP.turn;
      pst.hop = (reducedMotion ? 0 : spinP.hop + (fxT.hop < 0.14 ? 0.07 * core.arc(fxT.hop / 0.14) : 0));
      pst.clip = clip; pst.clipT = clipT; pst.encore = preset.encore || 0; pst.marker = camMode === 'map'; pst.reduced = reducedMotion;
      pst.petStand = coasting; pst.trickSpin = fxT.trick < 0.45 && !reducedMotion ? core.TAU * core.outQuad(fxT.trick / 0.45) : 0;
      player.update(pst);
      /* blob shadows: you, the crew, the pacers */
      const bs = 1.15 * (1 - 0.4 * Math.min(1, y / 0.8));
      blobs.set(blobIdx[0], x, 0.02, z, bs, bs * 1.25);
      /* the Glow Crew */
      const nR = race.rivals.length;
      for (let i = 0; i < 5; i++) {
        const r = race.rivals[i];
        if (!r) { blobs.set(blobIdx[1 + i], 0, -5, 0, 0, 0); continue; }
        const rx = core.lerp(r.px, r.x, a), ry = core.lerp(r.py, r.y, a), rh = core.lerpAngle(r.ph, r.h, a);
        const wxr = core.wx(rx), wzr = core.wz(ry), wyr = core.rivalHeight(J ? J.s : null, track.len, r.P, r.airHop);
        const rv = Math.hypot(r.x - r.px, r.y - r.py) / STEP / core.U;
        const roll = reducedMotion ? 0 : core.bodyRoll(core.wrapAngle(r.h - r.ph) / STEP * 0.6, false);
        const sleeve = core.occludes(camera.position.x, camera.position.y, camera.position.z, x, y + 0.4, z, wxr, wyr + 0.35, wzr, 0.7);
        rivals.setPose(i, wxr, wyr, wzr, core.yawOf(rh), roll, phase === 'playing' ? rv : 0, dt, sleeve, waveUntil[i] > clock ? 1 : 0, clock);
        blobs.set(blobIdx[1 + i], wxr, 0.02, wzr, 1.0, 1.2);
      }
      if (nR) rivals.commit();
      /* Solo pacers */
      if (pacers) {
        for (let i = 0; i < race.pacers.length && i < 2; i++) {
          const p = race.pacers[i];
          const px = core.lerp(p.px, p.x, a), py = core.lerp(p.py, p.y, a), ph = core.lerpAngle(p.ph, p.h, a);
          pacers.setPose(i, core.wx(px), core.rivalHeight(J ? J.s : null, track.len, p.P, p.airHop), core.wz(py), core.yawOf(ph));
          blobs.set(blobIdx[6 + i], core.wx(px), 0.02, core.wz(py), 0.9, 1.1);
        }
        pacers.commit();
      }
      blobs.commit();
      /* continuous effects: drift sparks (tier colour, grey while draining), boost glitter,
         grass dust, skid marks, and the unicorn kart's rainbow sparkle trail */
      const C = core.COL;
      if (drifting && phase === 'playing') {
        const d = core.due(k.onGrass ? 6 : core.SPARK_RATE[k.drift.tier] || 8, dt, fxT.sparkC, dueOut);
        fxT.sparkC = d.carry;
        if (d.n) for (let sd = -1; sd <= 1; sd += 2) { rearOf(_v, sd); fx.spark(_v.x, _v.y, _v.z, Math.max(1, d.n >> 1), k.onGrass ? C.pebble : core.TIER_COL[Math.max(1, k.drift.tier)], OPT_DRIFT); }
        if (tier !== 'LOW' && !k.onGrass) { fxT.skidC += dt; if (fxT.skidC > 0.05) { fxT.skidC = 0; for (let sd = -1; sd <= 1; sd += 2) { rearOf(_v, sd); fx.skid(_v.x, _v.z, yaw); } } }
      }
      if (k.boostT > 0 && phase === 'playing') {
        const d = core.due(16, dt, fxT.jetC, dueOut); fxT.jetC = d.carry;
        if (d.n) { rearOf(_v, 0); fx.spark(_v.x, _v.y, _v.z, d.n, JET_COLS, OPT_JET); }
      }
      if (k.onGrass && Math.abs(k.v) > 60 && !k.air.on && phase === 'playing') {
        const d = core.due(10, dt, fxT.dustC, dueOut); fxT.dustC = d.carry;
        if (d.n) { rearOf(_v, 0); fx.dust(_v.x, 0.08, _v.z, d.n, C.dust); }
      }
      if (player.kartId === 'kart_unicorn' && Math.abs(k.v) > 60 && phase === 'playing') {
        const d = core.due(6, dt, fxT.trailC, dueOut); fxT.trailC = d.carry;
        if (d.n) { rearOf(_v, 0); fx.spark(_v.x, _v.y + 0.15, _v.z, d.n, TRAIL_COLS, OPT_TRAIL); }
      }
      fx.speedLines(camMode === 'chase' || camMode === 'stage' ? boostK : 0);
      const tg = track.tang[pr.idx] || track.tang[0];
      fx.wrongWay(rs.wrongT > 0.6, x, z, core.yawDir(tg[0], tg[1]), clock);
      fx.dizzy(!!player.mini && (fxT.dizzy < 1.2 || k.spinT > 0), x, y + 0.85, z, clock);
      /* scheduled fireworks */
      for (let i = firework.length - 1; i >= 0; i--) {
        if (clock >= firework[i].at) {
          const spots = cur.tr.spots.fireworks;
          if (spots && spots.length) fx.firework(spots[firework[i].i % spots.length], [C.neonPink, C.neonCyan, C.starGold][firework[i].i % 3]);
          firework.splice(i, 1);
        }
      }
      /* the Glow Line (Easy Drive): dots along the baked reference line, the next 25 u */
      if (race.opts && race.opts.easy && race.ref && rs.phase === 'race' && KL.refLat && KL.refTauAt) {
        if ((glowTick++ & 1) === 0) {
          const pc = race.Pc();
          for (let d = 1; d <= 25; d++) {
            const P = pc + d * core.U, lat = KL.refLat(race.ref, KL.refTauAt(race.ref, P));
            core.offsetAt(track, P, lat, tmpPt);
            glowPts[(d - 1) * 3] = core.wx(tmpPt.x); glowPts[(d - 1) * 3 + 1] = 0.09; glowPts[(d - 1) * 3 + 2] = core.wz(tmpPt.y);
          }
          cur.tr.setGlowLine(glowPts, 25, sigHex);
        }
      } else cur.tr.setGlowLine(null, 0);
      /* the camera */
      raceCamera(dt, x, y, z, k, rs, pr, phase, countT, track);
      /* the track: chevrons, bulbs, banks, notes, crowd, LED */
      trackSt.t = rs.t; trackSt.gates = coasting ? 3 : pr.next; trackSt.noteGot = rs.noteGot;
      trackSt.banks = phase === 'countdown' && round.race.s.t === 0 ? Math.max(0, Math.min(3, 4 - Math.ceil(countT))) : -1;
      trackSt.go = phase === 'playing' && fxT.go < 1.5;
      trackSt.wandHex = spotOn ? sigCol : null;
      if (clock >= ledUntil) ledOverride = '';
      const ledPlace = nR ? rs.place : 0;
      if (ledOverride !== ledArg.override || pr.lap !== ledArg.lap || ledPlace !== ledArg.place || track.laps !== ledArg.laps) {
        ledArg.override = ledOverride; ledArg.lap = pr.lap; ledArg.laps = track.laps; ledArg.place = ledPlace;
        ledText = core.ledText(ledArg);                 /* rebuilt only when lap, place or the message changes */
      }
      trackSt.led = ledText;
      coneInfo.spot = spotW; coneInfo.snap = snapUntil > clock ? 1 : 0;
      coneInfo.target.set(x, 0, z);
      /* the HUD */
      hudV.total = nR ? nR + 1 : 0; hudV.place = rs.place;
      hudV.gapVal = rs.phase === 'race' && nR ? rs.gap : null;
      hudV.splits.length = 0;
      if (!nR) { if (splits.best) hudV.splits.push(splits.best); if (splits.next) hudV.splits.push(splits.next); }
      hudV.lap = Math.min(pr.lap, track.laps); hudV.laps = track.laps;
      hudV.wandPips = core.wandPips(rs.wand, k.spotlightT, PHYS.SPOT_T, PHYS.WAND);
      hudV.full = rs.wand >= PHYS.WAND * 0.875; hudV.spot = spotOn; hudV.wrong = rs.wrongT > 0.6;
      let nd = 0;
      for (let i = 0; i < race.pacers.length && nd < 7; i++) { const d = dotPool[nd++], p = race.pacers[i]; d.x = p.x; d.y = p.y; d.color = 'rgba(255,255,255,.7)'; d.me = false; }
      for (let i = 0; i < nR && nd < 7; i++) { const d = dotPool[nd++], r = race.rivals[i]; d.x = r.x; d.y = r.y; d.color = r.color; d.me = false; }
      const me = dotPool[nd++]; me.x = k.x; me.y = k.y; me.color = sigHex; me.me = true;
      hudV.dots.length = nd;
      for (let i = 0; i < nd; i++) hudV.dots[i] = dotPool[i];
    }

    /* chase / stage / high (north-up) / TV, plus the crane, push-in, boost kick, shake and finish orbit */
    function raceCamera(dt, x, y, z, k, rs, pr, phase, countT, track) {
      const travelYaw = core.yawOf(k.travel != null ? k.travel : k.h);
      const drifting = k.drift.on;
      if (camSnap) camYaw = travelYaw;
      else camYaw = core.lerpAngle(camYaw, travelYaw, core.damp(drifting ? 3 : 5, dt));
      jumpK = core.clamp(jumpK + (k.air.on ? dt / 0.25 : -dt / 0.4), 0, 1);
      const kick = reducedMotion ? 0 : boostK;
      const c = core.CAMERAS[camMode];
      let fov;
      if (camMode === 'tv') {
        const post = cur.tv[core.tvPick(cur.tv, pr.s, track.len)];
        _w.set(core.wx(post.x), core.CAMERAS.tv.up, core.wz(post.y));
        if (camSnap || _w.distanceToSquared(camPos) > 1) { camPos.copy(_w); camLook.set(x, y + 0.5, z); }
        _t.set(x, y + 0.5, z);
        camLook.lerp(_t, core.damp(c.lookRate, dt));
        fov = c.fov;
      } else {
        core.camDesired(camMode, x, y, z, camYaw, kick, jumpK * (reducedMotion ? 0 : 1), want);
        /* the finish orbit: 90° round the kart over the coast */
        if (rs.phase === 'coast' && !reducedMotion && camMode !== 'map') {
          const ang = core.orbitAngle(rs.coastT), dx = want.px - x, dz = want.pz - z, cs = Math.cos(ang), sn = Math.sin(ang);
          want.px = x + dx * cs + dz * sn; want.pz = z - dx * sn + dz * cs;
          want.lx = x; want.ly = y + 0.6; want.lz = z;
        }
        _w.set(want.px, want.py, want.pz); _t.set(want.lx, want.ly, want.lz);
        if (craneOn && phase === 'countdown') {
          core.craneAt(1 - Math.max(0, Math.min(3, countT)) / 3, cur.tr.spots.gantry.x, cur.tr.spots.gantry.z, cur.tr.spots.gantry.yaw, want, crane);
          _w.set(crane.px, crane.py, crane.pz); _t.set(crane.lx, crane.ly, crane.lz);
          camPos.copy(_w); camLook.copy(_t);
          fov = crane.fov;
        } else {
          if (craneOn) { craneOn = false; craneSeen = true; }
          if (camSnap) { camPos.copy(_w); camLook.copy(_t); }
          else {
            const pr8 = core.damp(c.posRate, dt);
            camPos.x += (_w.x - camPos.x) * pr8; camPos.z += (_w.z - camPos.z) * pr8;
            camPos.y += (_w.y - camPos.y) * core.damp(c.posRate * (jumpK > 0 ? 0.5 : 1), dt);
            camLook.lerp(_t, core.damp(c.posRate * 1.5, dt));
          }
          fov = want.fov;
        }
        if (!reducedMotion) fov += core.pushIn(fxT.push);
      }
      if (phase === 'countdown' && round.race.s.t === 0 && !craneOn) craneSeen = true;
      camSnap = false;
      camera.position.copy(camPos);
      /* bump / spin shake: 0.06 u for 0.18 s (never under reduced motion) */
      const sh = reducedMotion ? 0 : core.shakeAmp(fxT.shake);
      if (sh > 0) camera.position.set(camPos.x + sh * Math.sin(clock * 91), camPos.y + sh * Math.sin(clock * 113 + 1), camPos.z + sh * Math.cos(clock * 97));
      camera.lookAt(camLook);
      setFov(fov, dt);
    }
    function setFov(f, dt) {
      fovNow += (f - fovNow) * (dt > 0 ? core.damp(10, dt) : 1);
      if (Math.abs(camera.fov - fovNow) > 0.01) { camera.fov = fovNow; camera.updateProjectionMatrix(); }
    }

    /* ---------------- the menu grid, results podium and idle orbits ---------------- */
    function gridPose(P, lat, out) {
      core.offsetAt(cur.track, P, lat, tmpPt);
      out.x = core.wx(tmpPt.x); out.z = core.wz(tmpPt.y); out.yaw = core.yawDir(tmpPt.tx, tmpPt.ty);
      return out;
    }
    const gp = { x: 0, z: 0, yaw: 0 };
    function idleRacers(dt) {
      gridPose(-30, 0, gp);
      player.root.position.set(gp.x, 0, gp.z); player.root.rotation.set(0, gp.yaw, 0);
      player.update(restPst(dt, 'drive', false));
      blobs.set(blobIdx[0], gp.x, 0.02, gp.z, 1.15, 1.4);
      rivals.group.visible = true;
      for (let i = 0; i < KL.CREW.length && i < 5; i++) {
        const c = KL.CREW[i];
        gridPose(-30 + c.gridP, c.gridLat, gp);
        rivals.setPose(i, gp.x, 0, gp.z, gp.yaw, 0, 0, dt, false, 0, clock);
        blobs.set(blobIdx[1 + i], gp.x, 0.02, gp.z, 1.0, 1.2);
      }
      rivals.commit();
      for (let i = 6; i < 8; i++) blobs.set(blobIdx[i], 0, -5, 0, 0, 0);
      blobs.commit();
      if (pacers) { pacers.dispose(); pacers = null; pacerKey = ''; }
    }
    function orbit(cx, cy, cz, radius, height, base, speed, lookY, dt) {
      const ang = base + (reducedMotion ? 0 : clock * speed);
      camPos.set(cx + Math.sin(ang) * radius, height, cz + Math.cos(ang) * radius);
      camera.position.copy(camPos);
      camLook.set(cx, lookY, cz);
      camera.lookAt(camLook);
      setFov(44, dt);
    }
    function idleFrame(dt, phase) {
      if (round && phase === 'timeup') { /* keep the last race frame, gently orbiting the kart */ }
      idleRacers(dt);
      gridPose(40, 0, gp);
      orbit(gp.x, 0, gp.z, 9.5, 4.6, gp.yaw + 2.3, 0.05 * core.TAU, 0.4, dt);
      trackSt.t = clock; trackSt.gates = 0; trackSt.noteGot = null; trackSt.banks = -1; trackSt.go = false; trackSt.wandHex = null;
      trackSt.led = 'NEON GRAND PRIX · ' + String(cur.track.name || '').toUpperCase();
      coneInfo.spot = 0; coneInfo.snap = 0;
      fx.speedLines(0); fx.wrongWay(false); fx.dizzy(false); cur.tr.setGlowLine(null, 0);
    }
    function podiumFrame(dt) {
      const race = round.race, P = cur.tr.spots.podium;
      if (!podiumOn) {
        podiumOn = true;
        cur.tr.showPodium(true);
        startArc(2, false);
        /* final order: finished racers by time (you at your frozen place), the rest by progress */
        const list = [{ who: -1, t: race.s.finishT == null ? Infinity : race.s.finishT, P: Infinity }];
        race.rivals.forEach((r, i) => list.push({ who: i, t: r.finished && r.finishT != null ? r.finishT : Infinity, P: r.P }));
        list.sort((A, B) => (A.t - B.t) || (B.P - A.P));
        podiumOrder = list;
        fx.clear(); confettiT = 0;
        if (avatar) avatar.cheer();
        waveStart = clock;
      }
      let front = 0;
      for (let place = 0; place < podiumOrder.length; place++) {
        const e = podiumOrder[place], slot = place < 3 ? P.slots[place] : P.front[Math.min(2, front++)];
        if (e.who < 0) {
          player.root.position.set(slot.x, slot.y, slot.z); player.root.rotation.set(0, slot.yaw, 0);
          blobs.set(blobIdx[0], slot.x, slot.y + 0.02, slot.z, 1.1, 1.3);
        } else {
          rivals.setPose(e.who, slot.x, slot.y, slot.z, slot.yaw, 0, 0, dt, false, 1, clock);
          blobs.set(blobIdx[1 + e.who], slot.x, slot.y + 0.02, slot.z, 1.0, 1.2);
        }
      }
      if (race.rivals.length) rivals.commit();
      for (let i = 6; i < 8; i++) blobs.set(blobIdx[i], 0, -5, 0, 0, 0);
      blobs.commit();
      if (pacers) pacers.group.visible = false;
      let myPlace = 0;
      while (myPlace < podiumOrder.length && podiumOrder[myPlace].who >= 0) myPlace++;
      player.update(restPst(dt, myPlace < 3 ? 'dance' : 'cheer', true));
      orbit(P.x, 0, P.z, 7.6, 3.5, P.yaw + (reducedMotion ? 0.25 : 0.45 * Math.sin(core.TAU * 0.05 * clock)), 0, -0.9, dt);
      /* a gentle confetti trickle and a crowd wave every few seconds */
      confettiT += dt;
      if (!reducedMotion && confettiT > 0.6) {
        confettiT = 0;
        _v.set(P.x + (Math.sin(clock * 3.1) * 2), 4.5, P.z + Math.cos(clock * 2.3) * 1.2);
        fx.confetti(_v, _w.set(0, -0.2, 0), 4, sigHex);
      }
      if (clock - waveStart > 4) waveStart = clock;
      trackSt.t = clock; trackSt.gates = 3; trackSt.noteGot = null; trackSt.banks = -1; trackSt.go = false; trackSt.wandHex = sigCol;
      trackSt.led = core.finishLed(race.rivals.length ? race.s.finishPlace : 0, Math.round((race.s.finishT || 0) * 1000));
      coneInfo.spot = 0; coneInfo.snap = 1; coneInfo.target.set(P.slots[0].x, 0.8, P.slots[0].z);
      fx.speedLines(0); fx.wrongWay(false); fx.dizzy(false); cur.tr.setGlowLine(null, 0);
    }

    /* ---------------- the frame ---------------- */
    function frame(r, dt, alpha, phase, countT) {
      if (disposed || failed) return;
      if (revoked || lost) return;
      dt = Math.max(0, Math.min(0.1, Number(dt) || 0));
      clock += dt;
      const live = phase === 'countdown' || phase === 'playing' || phase === 'paused';
      if (live && r && r.race && r !== round) setRound(r, null);
      if (!cur) ensureTrack(variant);
      if (phase !== lastPhase) {
        if (phase === 'menu' || phase === 'tutorial') { if (podiumOn) { podiumOn = false; cur.tr.showPodium(false); } if (round && phase === 'menu') { round = null; } startArc(0, false); }
        lastPhase = phase;
      }
      const finishedRound = round && round.race && round.race.pr.finished && round.race.s.finishT != null;
      if (live && round) raceFrame(dt, alpha, phase, countT);
      else if (phase === 'results' && finishedRound) podiumFrame(dt);
      else if (phase === 'results' && round) {
        const k = round.race.k;
        orbit(core.wx(k.x), 0, core.wz(k.y), 8, 4, camYaw + Math.PI, 0.04 * core.TAU, 0.3, dt);
        trackSt.t = clock;
      } else idleFrame(dt, phase);
      if (pacers && !podiumOn) pacers.group.visible = true;
      stepArc(dt);
      trackSt.encore = preset.encore || 0; trackSt.haloScale = preset.haloScale || 1; trackSt.haloAlpha = preset.haloOpacity == null ? 0.5 : preset.haloOpacity;
      trackSt.waveSince = clock - waveStart < 2 ? clock - waveStart : null;
      cur.tr.update(dt, trackSt);
      coneInfo.encore = preset.encore || 0; coneInfo.homes = cur.homes;
      cur.env.update(dt, clock, camera, coneInfo);
      if (avatar) avatar.update(dt, clock, reducedMotion, preset.encore || 0);
      fx.step(dt);
      hud.setVisible(live && !!round);
      if (live && round) { hudV.night = (preset.encore || 0) > 0.5; hud.update(hudV); }
      render(live);
    }
    function render(live) {
      if (L && !L.active) return;
      if (shadowsDirty && cur && cur.env.hasShadows() && renderer.shadowMap.enabled) { renderer.shadowMap.needsUpdate = true; shadowsDirty = false; }
      const t0 = performance.now();
      renderer.render(scene, camera);
      const work = performance.now() - t0;
      if (live) {
        if (L && typeof L.sample === 'function') L.sample(work);
        else if (aq) judgeOwn(work);
      }
    }

    /* ---------------- adaptive quality ---------------- */
    function applyQuality(q, step) {
      if (!q) return;
      if (cur) cur.env.setQuality(q);
      if (q.particleScale) fx.setScale(q.particleScale);
      if (step === 'shadows' || q.shadows === false) renderer.shadowMap.enabled = false;
    }
    /* own-renderer watchdog (the lease has the stage's): same steps, 2D when hopeless */
    const aq = !L && window.SLTier && typeof window.SLTier.AdaptiveQuality === 'function' ? window.SLTier.AdaptiveQuality({ skip: quality.shadows ? [] : ['shadows'] }) : null;
    let lastSample = -1;
    function judgeOwn(work) {
      const now = performance.now(), interval = lastSample < 0 ? 0 : now - lastSample;
      lastSample = now;
      const act = aq.sample(work, interval, now, 1000 / 60);
      if (!act) return;
      if (act.type === 'fallback') { fail('performance'); return; }
      if (act.step === 'pixelRatio') renderer.setPixelRatio(Math.max(0.5, renderer.getPixelRatio() - 0.25));
      else if (act.step === 'shadows') quality.shadows = false;
      else if (act.step === 'particles') quality.particleScale = 0.5;
      else if (act.step === 'cones') quality.cones = false;
      applyQuality(quality, act.step);
    }

    /* ---------------- input: the C key and the tap that skips the crane (ac: top of buildView) ---------------- */
    window.addEventListener('keydown', (e) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key !== 'c' && e.key !== 'C') return;
      const tg = e.target;
      if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.isContentEditable)) return;
      cycleCamera();
    }, { signal: ac.signal });
    if (mid && mid.addEventListener) mid.addEventListener('pointerdown', () => { if (craneOn) { craneOn = false; craneSeen = true; camSnap = true; } }, { signal: ac.signal });
    function cycleCamera() {
      camMode = core.nextCam(camMode);
      camSnap = true;
      hud.setCam(core.CAM_LABEL[camMode]);
      /* chase / stage / map persist through kart.js's option store; 'tv' lasts for this session */
      try { if (opts.def && typeof opts.def.setOption === 'function') opts.def.setOption(cfg, 'cam', camMode); } catch (e) { /* not saved */ }
      lastOptCam = (cfg.kartOpts && cfg.kartOpts.cam) || lastOptCam;
      return camMode;
    }

    /* ---------------- resize / dispose ---------------- */
    function resize(w, h) {
      w = Math.max(1, Math.round(w || 1)); h = Math.max(1, Math.round(h || 1));
      if (L) L.resize(w, h); else renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    /* Also the teardown of a build that threw halfway (create() calls it then): every step is
       bestEffort(), so whatever was not built yet is skipped and the rest — above all
       L.release() — still runs. */
    function dispose() {
      if (disposed) return;
      disposed = true;
      ac.abort();
      cfg.view3d = false;                               /* kart.js: no Camera row in a 2D menu */
      bestEffort(() => hud.dispose());
      bestEffort(() => fx.dispose());
      bestEffort(() => player.dispose());
      bestEffort(() => rivals.dispose());
      bestEffort(() => { if (pacers) pacers.dispose(); });
      bestEffort(() => { if (avatar) avatar.dispose(); });
      bestEffort(() => { if (cur) { const c = cur; cur = null; c.env.dispose(); c.tr.dispose(); } });
      bestEffort(() => kit.dispose());
      bestEffort(() => scene.clear());
      bestEffort(() => { if (canvas.parentNode) canvas.parentNode.removeChild(canvas); });
      if (L) {
        /* hand the island its renderer back as we found it */
        bestEffort(() => { canvas.style.cssText = saved.css; canvas.className = saved.cls; });
        bestEffort(() => {
          renderer.toneMappingExposure = saved.exposure; renderer.toneMapping = saved.toneMapping;
          renderer.setClearColor(saved.clear, saved.clearA); renderer.autoClear = saved.autoClear;
        });
        bestEffort(() => { if (saved.parent && saved.parent.isConnected && !canvas.parentNode) saved.parent.appendChild(canvas); });   /* else the island re-parents on resume */
        bestEffort(() => L.release());
      } else if (renderer) {
        bestEffort(() => {
          canvas.removeEventListener('webglcontextlost', onCtxLost, false);
          canvas.removeEventListener('webglcontextrestored', onCtxRestored, false);
        });
        bestEffort(() => { renderer.dispose(); renderer.forceContextLoss(); });
      }
      bestEffort(() => { view.canvas = null; });        /* the shell must not remove the island's canvas */
    }

    applyRendererState();
    attachCanvas();
    ensureTrack(variant);
    const view = {
      canvas,
      frame, resize, setRound, dispose, cycleCamera,
      attach(r) { setRound(r, null); },
      idle(c) { setRound(null, (c && c.variant) || variant); },
      camera() { return camMode; },
      /* QA: live references for the lab / automated checks (read-only use) */
      debug() { return { scene, camera, track: cur, player, rivals, hud, fx, arc, preset, podium: podiumOn }; },
      info() {
        const ri = renderer.info;
        return { tier, lease: !!L, island: kit.island, camera: camMode, calls: ri.render.calls, tris: ri.render.triangles,
          programs: ri.programs ? ri.programs.length : 0, track: cur ? cur.tr.info() : null, particles: fx.alive() };
      }
    };
    return view;
  }
}

export const createKartView = create;
