/* node --test tests/   (Node 22+)
   My Island 3D runtime core: tier decision + budgets, adaptive quality,
   frame pacing (world/island3d/tier.js), plus the pure helpers of the stage
   loader (stage.js) and the kit's colour/stateKey fallbacks (kit.js). */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const T = require('../world/island3d/tier.js');
const S = require('../world/island3d/stage.js');
const KIT = require('../world/island3d/kit.js');
const ART = require('../world/world-art.js').SLWorldArt;

/* ---------------- device facts → tier ---------------- */
const UA = {
  ipadOld: 'Mozilla/5.0 (iPad; CPU OS 12_5_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1.2 Mobile/15E148 Safari/604.1',
  ipadMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  android: 'Mozilla/5.0 (Linux; Android 13; SM-A136B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36',
  win: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36'
};
function tierOf(nav, extra) { return T.decide(T.facts(nav, Object.assign({ maxTex: 16384 }, extra || {}))); }

test('tier table: old iPad, iPadOS-as-Mac, 4-core Android, 8-core desktop, saved LOW', () => {
  assert.equal(tierOf({ userAgent: UA.ipadOld, platform: 'iPad', maxTouchPoints: 5, hardwareConcurrency: 2 }), 'LOW');
  const f = T.facts({ userAgent: UA.ipadMac, platform: 'MacIntel', maxTouchPoints: 5, hardwareConcurrency: 8 }, { maxTex: 16384 });
  assert.equal(f.ipadAsMac, true); assert.equal(f.ios, true); assert.equal(f.touch, true);
  assert.equal(T.decide(f), 'MID', 'an 8-core iPad Pro is never HIGH (touch)');
  assert.equal(tierOf({ userAgent: UA.ipadMac, platform: 'MacIntel', maxTouchPoints: 5, hardwareConcurrency: 4 }), 'LOW', 'iPadOS reporting as a Mac with 4 cores');
  assert.equal(tierOf({ userAgent: UA.android, platform: 'Linux armv8l', maxTouchPoints: 5, hardwareConcurrency: 4 }), 'LOW');
  assert.equal(tierOf({ userAgent: UA.android, platform: 'Linux armv8l', maxTouchPoints: 5, hardwareConcurrency: 8 }), 'MID');
  assert.equal(tierOf({ userAgent: UA.win, platform: 'Win32', maxTouchPoints: 0, hardwareConcurrency: 8 }), 'HIGH');
  assert.equal(tierOf({ userAgent: UA.ipadMac, platform: 'MacIntel', maxTouchPoints: 0, hardwareConcurrency: 10 }), 'HIGH', 'a real Mac');
  assert.equal(tierOf({ userAgent: UA.win, platform: 'Win32', maxTouchPoints: 0, hardwareConcurrency: 8 }, { saved: 'LOW' }), 'LOW');
});

test('tier table: the other rules', () => {
  const desk = { userAgent: UA.win, platform: 'Win32', maxTouchPoints: 0, hardwareConcurrency: 8 };
  assert.equal(tierOf(Object.assign({}, desk, { hardwareConcurrency: 4 })), 'MID', '4-core desktop');
  assert.equal(tierOf(Object.assign({}, desk, { maxTouchPoints: 10 })), 'MID', 'touch laptop');
  assert.equal(tierOf(desk, { maxTex: 4096 }), 'LOW', 'MAX_TEXTURE_SIZE < 8192');
  assert.equal(tierOf(desk, { caveat: true }), 'LOW', 'software / major-performance-caveat context');
  assert.equal(tierOf({ userAgent: UA.iphone, platform: 'iPhone', maxTouchPoints: 5 }), 'LOW', 'iOS with unknown cores');
  assert.equal(tierOf(desk, { saved: 'MID' }), 'MID', 'a saved tier caps the decision');
  assert.equal(tierOf(Object.assign({}, desk, { hardwareConcurrency: 4 }), { saved: 'HIGH' }), 'MID', 'a saved tier never raises it');
  assert.equal(tierOf(desk, { saved: 'TURBO' }), 'HIGH', 'garbage saved values are ignored');
  assert.equal(tierOf(desk, { saved: 'low' }), 'LOW', 'saved values are case-insensitive');
  const ex = T.explain(T.facts(desk, { maxTex: 16384, saved: 'MID' }));
  assert.equal(ex.tier, 'MID'); assert.match(ex.why, /saved MID/);
  assert.equal(T.lower('HIGH'), 'MID'); assert.equal(T.lower('MID'), 'LOW'); assert.equal(T.lower('LOW'), 'LOW');
  assert.equal(T.parseTier(' mid '), 'MID'); assert.equal(T.parseTier(3), null);
});

/* ---------------- budgets ---------------- */
test('budgets match the art bible and the island architecture', () => {
  const B = T.BUDGETS;
  assert.deepEqual([B.LOW.drawCalls, B.MID.drawCalls, B.HIGH.drawCalls], [70, 100, 150]);
  assert.deepEqual([B.LOW.tris, B.MID.tris, B.HIGH.tris], [60000, 120000, 200000]);
  assert.deepEqual([B.LOW.gameDrawCalls, B.MID.gameDrawCalls, B.HIGH.gameDrawCalls], [60, 90, 120]);
  assert.deepEqual([B.LOW.gameTris, B.MID.gameTris, B.HIGH.gameTris], [50000, 100000, 150000]);
  assert.deepEqual([B.LOW.particles, B.MID.particles, B.HIGH.particles], [128, 256, 512]);
  assert.deepEqual([B.LOW.shadowMapSize, B.MID.shadowMapSize, B.HIGH.shadowMapSize], [0, 1024, 2048]);
  assert.deepEqual([B.LOW.shadows, B.MID.shadows, B.HIGH.shadows], [false, true, true]);
  assert.deepEqual([B.LOW.outlines, B.MID.outlines, B.HIGH.outlines], [false, true, true]);
  assert.deepEqual([B.LOW.antialias, B.MID.antialias, B.HIGH.antialias], [false, true, true]);
  assert.deepEqual([B.LOW.programs, B.MID.programs, B.HIGH.programs], [12, 16, 16]);
  assert.deepEqual([B.LOW.stars, B.MID.stars], [120, 250]);
  assert.deepEqual([B.LOW.snow, B.MID.snow, B.HIGH.snow], [60, 100, 150]);
  assert.equal(B.LOW.bloom, false); assert.equal(B.MID.bloom, false); assert.equal(B.HIGH.bloom, 'optional');
  for (const t of T.TIERS) { assert.equal(B[t].confetti, 120); assert.equal(B[t].bubbles, 24); assert.equal(B[t].petals, 40); }
});

test('budgets: Encore City city, life, reflections and terrain per tier (v2 plan)', () => {
  const B = T.BUDGETS, row = (k) => T.TIERS.map((t) => B[t][k]);
  assert.deepEqual(row('cityBuildings'), [30, 60, 90]);
  assert.deepEqual(row('birds'), [4, 7, 10]);
  assert.deepEqual(row('boats'), [2, 4, 5]);
  assert.deepEqual(row('lanterns'), [8, 16, 24]);
  assert.deepEqual(row('reflections'), [4, 6, 10]);
  assert.deepEqual(row('terrainSpacing'), [0.5, 0.25, 0.125]);
  /* each spacing divides 1, so cell edges are lattice lines */
  for (const s of row('terrainSpacing')) assert.equal(Math.round(1 / s), 1 / s);
  /* fresh copies carry the new keys too */
  assert.equal(T.budget('LOW', 2).cityBuildings, 30); assert.equal(T.budget('HIGH', 1).terrainSpacing, 0.125);
});

test('budget(tier, dpr): pixel ratio caps LOW 1.0, MID min(dpr, 1.5), HIGH min(dpr, 2); fresh objects', () => {
  assert.equal(T.budget('LOW', 3).pixelRatio, 1);
  assert.equal(T.budget('MID', 3).pixelRatio, 1.5);
  assert.equal(T.budget('MID', 1.25).pixelRatio, 1.25);
  assert.equal(T.budget('HIGH', 3).pixelRatio, 2);
  assert.equal(T.budget('HIGH', 1).pixelRatio, 1);
  assert.equal(T.budget('HIGH').pixelRatio, 1, 'dpr defaults to 1');
  const b = T.budget('MID', 2); b.drawCalls = 1;
  assert.equal(T.budget('MID', 2).drawCalls, 100, 'callers cannot corrupt the table');
  assert.equal(T.budget('nonsense', 1).tier, 'MID');
});

/* ---------------- adaptive quality ---------------- */
/* feed frames at a fixed cadence; returns the actions taken with their times */
function drive(aq, opts) {
  const out = [];
  let now = opts.start || 0;
  const end = now + opts.ms;
  let k = 0;
  while (now < end) {
    const iv = typeof opts.interval === 'function' ? opts.interval(k) : opts.interval;
    const w = typeof opts.work === 'function' ? opts.work(k) : opts.work;
    now += iv; k++;
    const a = aq.sample(w, iv, now, opts.target);
    if (a) out.push(Object.assign({ at: now }, a));
  }
  return { actions: out, now };
}

test('adaptive quality: steps down in ladder order, at most once per 2 s, and never steps up', () => {
  const aq = T.AdaptiveQuality();
  const r = drive(aq, { ms: 30000, interval: 33.4, work: 28 });
  const steps = r.actions.filter(a => a.type === 'step');
  assert.deepEqual(steps.map(a => a.step), T.LADDER);
  /* perf-5: the CPU steps (draw calls, per-frame work) first, then the GPU (fill) steps; ambient
     life and the sea reflections still shed before the Showtime cones */
  assert.deepEqual(T.LADDER, ['outlines', 'particles', 'life', 'decor', 'pixelRatio', 'shadows', 'reflections', 'cones']);
  assert.ok(steps[0].at >= 2000, 'first step only after 2 s of slow frames');
  for (let i = 1; i < steps.length; i++) assert.ok(steps[i].at - steps[i - 1].at >= 2000, 'one step per 2 s');
  assert.equal(r.actions.filter(a => a.type === 'fallback').length, 0, '30 fps is slow but not < 20 fps: no fallback');
  /* fast frames afterwards never undo a step */
  const after = drive(aq, { start: r.now, ms: 10000, interval: 16.7, work: 3 });
  assert.equal(after.actions.length, 0);
  assert.deepEqual(aq.steps, T.LADDER); assert.equal(aq.level, T.LADDER.length); assert.equal(aq.done, true);
});

test('adaptive quality: falls back only after every step, and only once', () => {
  const aq = T.AdaptiveQuality();
  const r = drive(aq, { ms: 50000, interval: 80, work: 75 });   /* ~12 fps from the start (8 steps × ~4.6 s, then 3 s) */
  const types = r.actions.map(a => a.type);
  const fb = types.indexOf('fallback');
  assert.ok(fb > 0, 'fallback happens');
  assert.equal(types.slice(0, fb).filter(t => t === 'step').length, T.LADDER.length, 'every step first');
  assert.equal(types.filter(t => t === 'fallback').length, 1);
  assert.ok(r.actions[fb].at - r.actions[fb - 1].at >= 3000, 'sustained under 20 fps after the last step');
  assert.equal(aq.failed, true);
  assert.equal(aq.sample(80, 80, r.now + 80), null, 'silent after failing');
});

test('adaptive quality: a steady 30 Hz low-power cadence is not slowness', () => {
  const aq = T.AdaptiveQuality();
  const r = drive(aq, { ms: 20000, interval: k => 33.33 + (k % 2 ? 0.4 : -0.4), work: 6, target: 1000 / 60 });
  assert.equal(r.actions.length, 0);
  assert.equal(aq.lowPower, true);
  assert.equal(aq.stats().lowPower, true);
  /* the same average with heavy jitter (GPU-bound) does step down */
  const aq2 = T.AdaptiveQuality();
  const r2 = drive(aq2, { ms: 6000, interval: k => (k % 2 ? 46 : 20.6), work: 6, target: 1000 / 60 });
  assert.ok(r2.actions.some(a => a.type === 'step'), 'jittery ~33 ms frames are real slowness');
  assert.equal(aq2.lowPower, false);
  /* heavy CPU work at a 33 ms cadence is real slowness too */
  const aq3 = T.AdaptiveQuality();
  assert.ok(drive(aq3, { ms: 6000, interval: 33.3, work: 26, target: 1000 / 60 }).actions.length > 0);
});

test('adaptive quality: healthy frames, idle pacing at 30 fps, pauses and skipped steps', () => {
  const aq = T.AdaptiveQuality();
  assert.equal(drive(aq, { ms: 20000, interval: 16.7, work: 9 }).actions.length, 0, '60 fps is fine');
  assert.equal(drive(aq, { start: 20000, ms: 20000, interval: 33.3, work: 4, target: 1000 / 30 }).actions.length, 0, 'the pacer idling at 30 fps is not slowness');
  /* a long gap (tab switch) resets the window instead of counting as a slow frame */
  const aq2 = T.AdaptiveQuality();
  drive(aq2, { ms: 1500, interval: 40, work: 30 });
  assert.equal(aq2.sample(5, 5000, 6500), null);
  assert.equal(aq2.stats().samples, 0);
  /* LOW has no shadows or outlines: those steps start taken */
  const aq3 = T.AdaptiveQuality({ skip: ['shadows', 'outlines'] });
  const steps = drive(aq3, { ms: 25000, interval: 33.4, work: 28 }).actions.filter(a => a.type === 'step').map(a => a.step);
  assert.deepEqual(steps, ['particles', 'life', 'decor', 'pixelRatio', 'reflections', 'cones']);
  assert.ok(aq3.has('shadows') && aq3.done);
});

/* perf-5: no step used to shed draw calls or frame work, so a draw-call-bound device walked the
   whole fragment-only ladder and was remembered as 2D. Each step now names the bottleneck it
   relieves, and the controller takes the next step of the kind the frames say is slow. */
test('perf-5: adaptive quality steps the bottleneck the frames show (CPU work → CPU steps, slow cadence → GPU steps)', () => {
  assert.deepEqual(T.LADDER.map(T.stepKind), ['cpu', 'cpu', 'cpu', 'cpu', 'gpu', 'gpu', 'gpu', 'gpu']);
  assert.equal(T.STEP_KIND.decor, 'cpu', 'the decor idles are per-frame work');
  /* CPU-bound: 28 ms of update + draw submission at 33 ms — the CPU steps come first */
  const cpu = drive(T.AdaptiveQuality(), { ms: 16000, interval: 33.4, work: 28 }).actions.filter(a => a.type === 'step');
  assert.deepEqual(cpu.map(a => a.step).slice(0, 4), ['outlines', 'particles', 'life', 'decor']);
  assert.ok(cpu.every(a => a.kind === 'cpu'));
  /* GPU-bound: cheap work (6 ms) but a 40 ms cadence — pixel ratio first, then the fill steps */
  const gpu = drive(T.AdaptiveQuality(), { ms: 16000, interval: 40, work: 6 }).actions.filter(a => a.type === 'step');
  assert.deepEqual(gpu.map(a => a.step).slice(0, 4), ['pixelRatio', 'shadows', 'reflections', 'cones']);
  assert.ok(gpu.every(a => a.kind === 'gpu'));
  /* once its kind runs out, any step left is taken (the fallback still needs every step) */
  const aq = T.AdaptiveQuality();
  const r = drive(aq, { ms: 40000, interval: 40, work: 6 });
  assert.deepEqual(r.actions.filter(a => a.type === 'step').map(a => a.step),
    ['pixelRatio', 'shadows', 'reflections', 'cones', 'outlines', 'particles', 'life', 'decor']);
  assert.equal(aq.done, true);
  /* a CPU-bound LOW device (no shadows, no hulls) sheds particles, life and the decor idles before
     any fill step, and only then can the 2D fallback come */
  const low = T.AdaptiveQuality({ skip: ['shadows', 'outlines'] });
  const rl = drive(low, { ms: 50000, interval: 80, work: 75 });
  const kinds = rl.actions.map(a => a.type === 'step' ? a.step : a.type);
  assert.deepEqual(kinds.slice(0, 3), ['particles', 'life', 'decor']);
  assert.equal(kinds[kinds.length - 1], 'fallback');
  assert.equal(kinds.indexOf('fallback'), T.LADDER.length - 2, 'after every step that tier can take');
});

/* ---------------- frame pacer ---------------- */
function ticks(p, hz, ms, start, animating) {
  const step = 1000 / hz;
  let n = 0;
  const k0 = Math.round(start / step);
  for (let k = 1; k <= Math.round(ms / step); k++) if (p.tick((k0 + k) * step, animating)) n++;
  return n;
}

test('frame pacer: 60 fps on 60 Hz, fast screens capped at 60', () => {
  assert.equal(ticks(T.FramePacer(), 60, 1000, 0), 60);
  const p120 = T.FramePacer();
  const n120 = ticks(p120, 120, 1000, 0);
  assert.ok(n120 >= 59 && n120 <= 61, '120 Hz → ' + n120);
  for (const hz of [90, 144, 165]) {
    const n = ticks(T.FramePacer(), hz, 2000, 0) / 2;
    assert.ok(n >= 55 && n <= 61, hz + ' Hz → ' + n + ' fps');
  }
  /* a hitch does not trigger a burst of catch-up frames */
  const p = T.FramePacer();
  ticks(p, 120, 500, 0);
  assert.equal(p.tick(1500), true);
  assert.equal(p.tick(1500 + 8.33), false, 'no catch-up burst after a hitch');
});

test('frame pacer: 30 fps after 20 s without input, back to 60 on the next input', () => {
  const p = T.FramePacer();
  p.input(0);
  ticks(p, 60, 21000, 0);
  assert.equal(p.idle(21000), true);
  assert.equal(p.targetFps(21000), 30);
  const idle = ticks(p, 60, 1000, 21000);
  assert.ok(idle >= 29 && idle <= 31, 'idle → ' + idle);
  assert.equal(p.input(22000), true, 'input reports it woke the pacer');
  assert.equal(p.tick(22000 + 16.67), true, 'renders on the next tick');
  const active = ticks(p, 60, 1000, 22000 + 16.67);
  assert.ok(active >= 59, 'active → ' + active);
  assert.equal(p.idle(23100), false);
});

test('frame pacer: under reduced motion it renders only on demand', () => {
  const p = T.FramePacer({ reduced: true });
  assert.equal(p.tick(16.7, false), true, 'the first frame always renders');
  assert.equal(ticks(p, 60, 1000, 16.7, false), 0, 'nothing animating → no frames');
  p.invalidate();
  assert.equal(ticks(p, 60, 1000, 1016.7, false), 1, 'invalidate → exactly one frame');
  assert.ok(ticks(p, 60, 1000, 2016.7, true) >= 59, 'animating → normal pacing');
  p.setReduced(false);
  assert.ok(ticks(p, 60, 1000, 3016.7, false) >= 59, 'without reduced motion the idle island keeps rendering');
});

/* ---------------- stage.js pure helpers ---------------- */
test('stage: boot loads the island3d scripts in order, reusing the ?v= query, skipping loaded globals', () => {
  const base = S.baseFrom('https://x.test/app/world/island3d/stage.js?v=5&qa=1', 'https://x.test/app/index.html', '1');
  assert.deepEqual(base, { dir: 'https://x.test/app/world/island3d/', query: '?v=5&qa=1' });
  const list = S.scriptList(base, { SLTier: {}, SLSound: {} });
  const names = list.map(f => f.path);
  const ordered = ['grid3d.js', 'motion.js', 'kit.js', 'terrain3d.js', 'env.js', 'city3d.js', 'life3d.js', 'models-garden.js', 'models-home.js',
    'models-fun.js', 'models-attractions.js', 'models-city.js', 'models-stage.js', 'models-characters.js', 'pets-brain.js', 'actors.js',
    'fx3d.js', 'edit3d.js', 'camera.js', 'island3d.js', 'photocard.js'];
  let last = -1;
  for (const f of ordered) { const i = names.indexOf(f); assert.ok(i > last, f + ' in order'); last = i; }
  assert.ok(names.indexOf('tier.js') < names.indexOf('kit.js'));
  assert.equal(list[0].url, 'https://x.test/app/world/world-look.js?v=5&qa=1');
  assert.equal(list.find(f => f.path === 'kit.js').url, 'https://x.test/app/world/island3d/kit.js?v=5&qa=1');
  assert.equal(list.find(f => f.path === 'tier.js').skip, true);
  assert.equal(list.find(f => f.path === '../sound.js').skip, true);
  assert.equal(list.find(f => f.path === 'env.js').skip, false);
  assert.deepEqual(list.filter(f => f.required).map(f => f.path), ['tier.js', 'kit.js']);
  assert.deepEqual(S.baseFrom('', 'https://x.test/app/index.html', '9'), { dir: 'https://x.test/app/world/island3d/', query: '?v=9' });
  assert.deepEqual(S.ADDONS, ['three/addons/geometries/RoundedBoxGeometry.js', 'three/addons/utils/BufferGeometryUtils.js']);
  /* the Encore City modules are optional (a missing one only means a fallback) and skip when already loaded */
  const V2 = { 'terrain3d.js': 'SLTerrain3D', 'city3d.js': 'SLCity3D', 'life3d.js': 'SLLife3D', 'models-city.js': null, 'models-stage.js': null };
  for (const [f, g] of Object.entries(V2)) {
    const e = list.find(x => x.path === f);
    assert.ok(e, f + ' listed'); assert.equal(e.required, false, f + ' optional'); assert.equal(e.global, g, f + ' global');
  }
  assert.equal(S.scriptList(base, { SLCity3D: {} }).find(f => f.path === 'city3d.js').skip, true);
  /* every listed island3d file is one the architecture (v1) or the Encore City plan (v2) names */
  const arch = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'docs', 'island3d', 'island-architecture.json'), 'utf8'));
  const named = arch.files.join(' ') + ' ' + Object.keys(V2).map(f => 'world/island3d/' + f).join(' ');
  for (const f of names.filter(n => !n.startsWith('..'))) assert.ok(named.includes('world/island3d/' + f), f + ' is in the architecture');
});

test('stage: resolved styles default from the catalogue (the house carries its shape and trim)', () => {
  const D = { wall: 'wall_cream', roof: 'roof_red', door: 'door_blue', course: 'course_meadow', ball: 'ball_classic', stadium: 'stadium_day', kart: 'kart_red' };
  assert.deepEqual(S.resolveSt('house_cottage', { roof: 'roof_castle' }, D), { wall: 'wall_cream', roof: 'roof_castle', door: 'door_blue', details: {}, shape: 'shape_loft', variant: 0 });
  assert.deepEqual(S.resolveSt('house_cottage', { shape: 'shape_dome', variant: 1 }, Object.assign({ shape: 'shape_cottage' }, D)),
    { wall: 'wall_cream', roof: 'roof_red', door: 'door_blue', details: {}, shape: 'shape_dome', variant: 1 });
  assert.equal(S.resolveSt('house_cottage', {}, Object.assign({ shape: 'shape_cottage' }, D)).shape, 'shape_cottage', 'the catalogue default wins');
  /* make() forwards a city building's trim untouched */
  assert.deepEqual(S.resolveSt('bld_stage', { variant: 2 }, D), { variant: 2 });
  assert.deepEqual(S.resolveSt('att_course', {}, D), { course: 'course_meadow' });
  assert.deepEqual(S.resolveSt('att_pitch', { stadium: 'stadium_night' }, D), { ball: 'ball_classic', stadium: 'stadium_night' });
  assert.deepEqual(S.resolveSt('att_kart', null, D), { kart: 'kart_red' });
  assert.deepEqual(S.resolveSt('pet_bunny', { acc: { hat: 'acc_crown' } }, D), { acc: { hat: 'acc_crown' } });
  assert.deepEqual(S.resolveSt('tree_oak', undefined, D), {});
});

test('stage: the remembered-2D record and the saved measured tier', () => {
  const NOW = 1.8e12;
  const rec = JSON.stringify({ off: true, why: 'performance', ver: '3', at: NOW - 3600e3 });
  assert.equal(S.rememberedFrom(rec, '3', '', NOW).rec.why, 'performance');
  assert.deepEqual(S.rememberedFrom(rec, '4', '', NOW), { rec: null, clear: true }, 'SL_WORLD_VER changed');
  assert.deepEqual(S.rememberedFrom(rec, '3', '?tab=world&3d=1', NOW), { rec: null, clear: true }, 'a parent opened ?3d=1');
  assert.deepEqual(S.rememberedFrom('{nope', '3', '', NOW), { rec: null, clear: true });
  assert.deepEqual(S.rememberedFrom(null, '3', '', NOW), { rec: null, clear: false });
  assert.deepEqual(S.rememberedFrom(JSON.stringify({ off: false, ver: '3' }), '3', '', NOW), { rec: null, clear: false });
  assert.equal(S.rememberedFrom(rec, '3', '?x=13d=1', NOW).rec.why, 'performance', 'only the real 3d=1 parameter counts');
  assert.equal(S.rememberedFrom(JSON.stringify({ off: true, why: 'context', ver: '3', at: Date.now() }), '3', '').rec.why, 'context', 'now defaults to the clock');
  assert.equal(S.tierToSave(null, 'MID'), 'MID');
  assert.equal(S.tierToSave('MID', 'LOW'), 'LOW');
  assert.equal(S.tierToSave('LOW', 'MID'), null, 'never raises a saved tier');
  assert.equal(S.tierToSave('MID', 'MID'), null);
  assert.equal(S.tierToSave('MID', 'bogus'), null);
});

test('stage: a remembered 2D record expires after REMEMBER_DAYS (a home-screen app has no ?3d=1)', () => {
  const NOW = 1.8e12, DAY = 24 * 3600 * 1000;
  assert.equal(S.REMEMBER_DAYS, 7);
  const at = (ms) => JSON.stringify({ off: true, why: 'performance', ver: '3', at: ms });
  assert.equal(S.rememberedFrom(at(NOW), '3', '', NOW).rec.why, 'performance', 'just written');
  assert.equal(S.rememberedFrom(at(NOW - 6.9 * DAY), '3', '', NOW).rec.why, 'performance', 'six days on: still 2D');
  assert.equal(S.rememberedFrom(at(NOW - 7 * DAY), '3', '', NOW).rec.why, 'performance', 'exactly a week: the last day of it');
  assert.deepEqual(S.rememberedFrom(at(NOW - 7 * DAY - 1), '3', '', NOW), { rec: null, clear: true }, 'a week old: stale, and cleared');
  assert.deepEqual(S.rememberedFrom(at(NOW - 40 * DAY), '3', '', NOW), { rec: null, clear: true });
  /* undated or junk dates: the stage always writes `at`, so these never lock a device */
  for (const bad of [undefined, null, 'soon', '', true]) {
    const raw = JSON.stringify({ off: true, why: 'performance', ver: '3', at: bad });
    assert.deepEqual(S.rememberedFrom(raw, '3', '', NOW), { rec: null, clear: true }, 'at = ' + JSON.stringify(bad));
  }
  /* a clock that ran ahead: an hour is fine, more than a day is not trusted */
  assert.equal(S.rememberedFrom(at(NOW + 3600e3), '3', '', NOW).rec.why, 'performance');
  assert.deepEqual(S.rememberedFrom(at(NOW + 2 * DAY), '3', '', NOW), { rec: null, clear: true });
  /* the version and ?3d=1 rules still come first */
  assert.deepEqual(S.rememberedFrom(at(NOW), '4', '', NOW), { rec: null, clear: true });
  assert.deepEqual(S.rememberedFrom(at(NOW), '3', '?3d=1', NOW), { rec: null, clear: true });
});

/* ---------------- kit.js pure helpers ---------------- */
test('kit: the inline fallback palette is the art bible palette and the locked 2D colours', () => {
  const bible = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'docs', 'island3d', 'art-bible.json'), 'utf8'));
  assert.equal(Object.keys(KIT.FALLBACK.PALETTE).length, bible.palette.length);
  for (const p of bible.palette) assert.equal(KIT.FALLBACK.PALETTE[p.name], p.hex.toUpperCase(), p.name);
  const L = KIT.FALLBACK.LOCKED;
  for (const k of ['KARTS', 'BALLS', 'STADIA', 'THEME', 'PETCOL']) assert.deepEqual(L[k], ART[k], k + ' matches world-art.js');
  const src = fs.readFileSync(path.join(__dirname, '..', 'world', 'world-art.js'), 'utf8');
  for (const [id, hex] of Object.entries(L.WALL).concat(Object.entries(L.DOOR))) assert.ok(src.includes(id + ": '" + hex + "'"), id);
  for (const [id, pair] of Object.entries(L.ROOF)) assert.ok(src.includes(id + ": ['" + pair[0] + "', '" + pair[1] + "']"), id);
});

test('kit: colour tokens resolve only through the look tables', () => {
  const F = KIT.FALLBACK;
  assert.equal(KIT.resolveHex(F, 'Grass Top'), '#8EE07A');
  assert.equal(KIT.resolveHex(F, 'grass top'), '#8EE07A', 'palette names are case-insensitive as a last resort');
  assert.equal(KIT.resolveHex(F, 'WALL.wall_mint'), '#B8ECD6');
  assert.equal(KIT.resolveHex(F, 'ROOF.roof_candy[1]'), '#F06D9E');
  assert.equal(KIT.resolveHex(F, 'ROOF/roof_blue/0'), '#4A6FA5');
  assert.equal(KIT.resolveHex(F, 'PETCOL.pet_dragon.nose'), '#2E6B40');
  assert.equal(KIT.resolveHex(F, 'kart_lime'), '#7ED957', 'catalogue ids find their LOCKED colour');
  assert.equal(KIT.resolveHex(F, '#FF0000'), null, 'raw hex is not a token');
  assert.equal(KIT.resolveHex(F, 'Hot Pink'), null);
  assert.equal(KIT.resolveHex(F, ''), null);
  /* a world-look-shaped module: palette as an array, tables, and a resolver function that wins */
  const look = {
    PALETTE: [{ name: 'Sand', hex: '#f3dc9a' }],
    LOCKED: { WALL: { wall_cream: '#f7e6c4' } },
    ART2D: { lighthouse_red: '#e0574f' },
    EXTRA: { kart_glow: { hex: '#b6ff5c' } }
  };
  assert.equal(KIT.resolveHex(look, 'Sand'), '#F3DC9A');
  assert.equal(KIT.resolveHex(look, 'lighthouse_red'), '#E0574F');
  assert.equal(KIT.resolveHex(look, 'kart_glow'), '#B6FF5C');
  assert.equal(KIT.resolveHex(look, 'Grass Top'), null, 'no silent fallback once a look module is present');
  const withFn = Object.assign({ hex: t => (t === 'Special' ? '#123456' : null) }, look);
  assert.equal(KIT.resolveHex(withFn, 'Special'), '#123456');
  assert.equal(KIT.resolveHex(withFn, 'Sand'), '#F3DC9A');
  const throwing = Object.assign({ resolve: () => { throw new Error('x'); } }, look);
  assert.equal(KIT.resolveHex(throwing, 'Sand'), '#F3DC9A', 'a throwing resolver is ignored');
  assert.equal(KIT.normHex('#abc'), '#AABBCC');
});

test('kit: the stateKey fallback matches the documented format (and world-look)', () => {
  const k = KIT.fallbackStateKey, COT = { shape: 'shape_cottage' };
  assert.equal(k('house_cottage', { ...COT, wall: 'wall_pink', roof: 'roof_blue', door: 'door_red', details: { detail_lights: true, detail_chimney: true, detail_flag: false } }),
    'wall_pink|roof_blue|door_red|d:detail_chimney,detail_lights');
  assert.equal(k('house_cottage', { ...COT, roof: 'roof_castle', details: ['detail_flag', 'detail_windowbox'] }), 'wall_cream|roof_castle|door_blue|d:detail_windowbox', 'detail_flag dropped under the castle roof');
  assert.equal(k('house_cottage', COT), 'wall_cream|roof_red|door_blue|d:');
  assert.equal(k('house_cottage', {}), 'wall_cream|roof_red|door_blue|d:|s:shape_loft|v:0', 'the loft is the default shape');
  assert.equal(k('house_cottage', { shape: 'shape_tower', variant: 5 }), 'wall_cream|roof_red|door_blue|d:|s:shape_tower|v:1');
  assert.equal(k('bld_boba', { variant: 2 }), 'v:2'); assert.equal(k('bld_boba', { variant: 9 }), 'v:2'); assert.equal(k('bld_boba', {}), 'v:0');
  const L = require('../world/world-look.js');
  for (const st of [{}, COT, { shape: 'shape_dome', variant: 1, roof: 'roof_candy', details: ['detail_neon'] }, { shape: 'shape_villa', details: { detail_flag: 1 }, roof: 'roof_castle' }])
    assert.equal(k('house_cottage', st), L.stateKey('house_cottage', st), JSON.stringify(st));
  for (const v of [0, 1, 2, 7]) assert.equal(k('bld_dance', { variant: v }), L.stateKey('bld_dance', { variant: v }));
  assert.equal(k('att_course', { course: 'course_snow' }), 'course_snow');
  assert.equal(k('att_pitch', { ball: 'ball_gold' }), 'ball_gold|stadium_day');
  assert.equal(k('att_kart', {}), 'kart_red');
  assert.equal(k('pet_kitten', { acc: { face: 'acc_shades' } }), '-|-|acc_shades|-');
  assert.equal(k('tree_oak', { anything: 1 }), '');
  assert.equal(KIT.ATLAS_CELLS * KIT.ATLAS_CELLS > Math.max(...Object.values(KIT.ATLAS)), true, 'atlas cells fit the 4×4 sheet');
});
