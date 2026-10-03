'use strict';
/* My Island 3D — characters (Encore City v2): the pure pose / clip maths and the part recipes of
   world/island3d/models-characters.js (the THREE builders are exercised in the QA lab; Node has no
   THREE, so triangle budgets are checked from the same recipes the builders interpret) */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const L = require('../world/world-look.js');
const W = require('../world/world-core.js');
const Kit = require('../world/island3d/kit.js');
const CH = require('../world/island3d/models-characters.js');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'world', 'island3d', 'models-characters.js'), 'utf8');
const CONTRACT_CLIPS = ['idle', 'walk', 'run', 'hop', 'jump', 'fall', 'slide', 'tumble', 'dizzy', 'dance', 'cheer', 'sad', 'sit', 'kick', 'drive'];
const V2_CLIPS = ['lean', 'beatNod', 'lookBack', 'point'];
const ONE_SHOTS = ['hop', 'jump', 'tumble', 'kick', 'lean', 'lookBack'];
const TIERS = ['LOW', 'MID', 'HIGH'];
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const sample = (clip, t, o) => CH.sampleClip(clip, t, null, o);
/* a pose without its cloth clock ('wave' always advances) */
const still = (p) => { const o = Object.assign({}, p); delete o.wave; return o; };
const samePose = (a, b, msg) => { for (const k of CH.POSE_KEYS) if (k !== 'wave') assert.ok(near(a[k], b[k], 1e-6), msg + ': ' + k + ' ' + a[k] + ' vs ' + b[k]); };
const BEAT = 60 / 118;
/* peaks per second of f over [0, T) */
function peakHz(f, T, step = 0.002) {
  let n = 0, a = f(0), b = f(step);
  for (let t = 2 * step; t < T; t += step) { const c = f(t); if (b > a && b >= c) n++; a = b; b = c; }
  return n / T;
}

/* ---------------- contract and look agreement ---------------- */
test('characters: the contract clips, the v2 idles, bones, sockets and all 11 accessories are present', () => {
  for (const c of CONTRACT_CLIPS) assert.ok(CH.CLIP_NAMES.includes(c), 'contract clip ' + c);
  for (const c of V2_CLIPS) assert.ok(CH.CLIP_NAMES.includes(c), 'v2 clip ' + c);
  assert.deepEqual(CH.CONTRACT_CLIPS, CONTRACT_CLIPS, 'the games\' clip list is unchanged');
  for (const b of L.PET_BONES) assert.ok(CH.BONES.includes(b), 'bone ' + b);
  assert.deepEqual(CH.SOCKETS.slice().sort(), L.PET_SOCKETS.slice().sort());
  assert.deepEqual(CH.PETS.slice().sort(), Object.keys(L.LOOK).filter((id) => L.LOOK[id].kind === 'pet').sort());
  for (const [id, sock] of Object.entries(CH.ACC_SOCKET)) {
    assert.equal(L.LOOK[id].kind, 'acc', id);
    assert.equal(L.LOOK[id].socket, sock, id + ' socket');
  }
  assert.deepEqual(Object.keys(CH.ACC_SOCKET).sort(), W.CATALOG.filter((it) => /^acc_/.test(it.id)).map((it) => it.id).sort());
  assert.equal(Object.keys(CH.ACC_SOCKET).length, 11);
  assert.deepEqual(CH.STREETWEAR.slice().sort(), ['acc_beanie', 'acc_cap', 'acc_headphones', 'acc_hoodie', 'acc_visor']);
});

test('characters: the skeleton is a tree rooted at base, and every joint and socket exists', () => {
  for (const b of CH.BONES) {
    const p = CH.BONE_PARENT[b];
    if (b === 'base') assert.equal(p, null);
    else assert.ok(CH.BONES.indexOf(p) >= 0 && CH.BONES.indexOf(p) < CH.BONES.indexOf(b), b + ' parent ' + p + ' comes first');
  }
  for (const pet of CH.PETS) {
    const J = CH.jointsOf(pet), S = CH.socketsOf(pet);
    for (const b of CH.BONES) assert.ok(Array.isArray(J[b]) && J[b].length === 3 && J[b].every(Number.isFinite), pet + ' joint ' + b);
    for (const s of CH.SOCKETS) assert.ok(CH.BONES.includes(CH.SOCKET_BONE[s]), s);
    assert.ok(S.hat[1] > S.face[1] && S.face[1] > S.neck[1] && S.neck[1] > S.seat[1], pet + ' hat > face > neck > seat');
    assert.ok(S.hat[1] >= 0.5 && S.hat[1] <= L.LOOK[pet].h + 0.05, pet + ' hat sits on the head top');
    assert.ok(J.legFL[0] > 0 && J.legFR[0] < 0 && J.earL[0] > 0 && J.earR[0] < 0, pet + ': the pet\'s left is +x');
    assert.ok(J.head[2] > 0 && J.tail[2] < 0, pet + ' faces +z');
    assert.ok(near(J.body[1], 0.235), 'v2 body centre');
  }
  assert.ok(CH.BONES.length <= 64, 'fits a small bone texture');
});

test('characters: pet colours are the LOCKED PETCOL values', () => {
  for (const withLook of [false, true]) {
    if (withLook) globalThis.SLIslandLook = L; else delete globalThis.SLIslandLook;
    for (const pet of CH.PETS) {
      const T = CH.petTokens(pet), P = L.LOCKED.PETCOL[pet];
      for (const k of ['body', 'dark', 'light', 'nose']) assert.equal(L.hex(T[k]), L.normHex(P[k]), pet + ' ' + k);
      for (const k of Object.keys(T)) assert.ok(L.isToken(T[k]), pet + ' token ' + T[k]);
    }
  }
  delete globalThis.SLIslandLook;
});

test('characters: every colour in the source and the recipes is a palette/look token (no raw hex)', () => {
  assert.ok(!/['"]#[0-9a-fA-F]{3,6}['"]/.test(SRC), 'no raw hex literals');
  const literals = SRC.match(/'[A-Z][a-z]+(?: [A-Z][a-z]+)*'/g) || [];
  assert.ok(literals.length > 10);
  for (const lit of literals) assert.ok(L.isToken(lit.slice(1, -1)), 'token ' + lit);
  /* accessory parts named in tokOf(...) / t(...) exist in the LOOK entry */
  const re = /\bt(?:okOf)?\('([a-z]+)', '[A-Z]/g;
  let m, n = 0;
  const accIds = Object.keys(CH.ACC_SOCKET);
  /* every accessory's t('part', …) is resolved against its own LOOK colours */
  globalThis.SLIslandLook = L;
  for (const id of accIds) {
    const parts = CH.accParts(id, 'pet_puppy', true);
    assert.ok(parts.length > 0, id + ' has parts');
    for (const d of parts) {
      const toks = typeof d.c === 'string' ? [d.c] : Array.isArray(d.c) ? [d.c[0]] : d.c && d.c.mix ? d.c.mix.slice(0, 2) : [];
      if (typeof d.c === 'function') for (const v of [{ x: 0, y: -1, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0.5, z: 0.5 }, { x: 0.1, y: 0.4, z: 0.3 }]) {
        const r = d.c(Object.assign({ nx: 0, ny: 1, nz: 0 }, v));
        toks.push(Array.isArray(r) ? r[0] : r);
      }
      for (const tk of toks) assert.ok(L.isToken(tk), id + ' colour ' + tk);
    }
  }
  delete globalThis.SLIslandLook;
  while ((m = re.exec(SRC))) n++;
  assert.ok(n >= 25, 'accessory colours come from LOOK (' + n + ')');
});

test('characters: classic script with THREE only from the kit', () => {
  assert.ok(!/^\s*(import|export)\b/m.test(SRC), 'no ES module syntax');
  assert.ok(!/window\.THREE|root\.THREE|globalThis\.THREE/.test(SRC), 'never a global THREE');
  assert.ok(!/new THREE\./.test(SRC), 'THREE is reached through K.THREE');
  assert.ok(!/PointLight|SpotLight/.test(SRC));
});

/* ---------------- clips ---------------- */
test('characters: every clip, species and mode gives a finite, sane pose', () => {
  for (const species of CH.PETS) for (const clip of CH.CLIP_NAMES) for (const reduced of [false, true]) {
    for (let t = 0; t <= 6; t += 0.137) {
      const p = sample(clip, t, { species, reduced, speed: 2, steer: 0.5, seed: 7, bpm: 118 });
      for (const k of CH.POSE_KEYS) assert.ok(Number.isFinite(p[k]), `${species} ${clip} ${k} @${t}`);
      assert.ok(p.sx > 0.3 && p.sy > 0.3 && p.sz > 0.3, `${species} ${clip} keeps a positive scale`);
      assert.ok(p.eye >= 0 && p.eye <= 1.2 && p.spark >= 0 && p.spark <= 1.2 && p.cape >= 0 && p.cape <= 1, `${species} ${clip} ranges`);
      assert.ok(p.blush >= 0 && p.blush <= 1, `${species} ${clip} blush`);
      assert.ok(p.y > -0.1 && p.y < 0.45, `${species} ${clip} y ${p.y}`);
    }
  }
});

test('characters: clips are pure functions of time', () => {
  for (const clip of CH.CLIP_NAMES) {
    const o = { species: 'pet_kitten', speed: 1.4, seed: 'abc', bpm: 100 };
    const a = sample(clip, 2.31, o), b = CH.sampleClip(clip, 9, {}, o), c = CH.sampleClip(clip, 2.31, b, o);
    assert.deepEqual(c, a, clip + ' does not depend on history');
    const reused = {};
    CH.sampleClip(clip, 0.5, reused, o);
    assert.equal(CH.sampleClip(clip, 0.5, reused, o), reused, clip + ' writes into the given pose');
  }
  /* the dance is the lockstep exception: every pet of a species hits the same pose regardless of seed */
  for (let t = 0; t < 4; t += 0.3) assert.deepEqual(sample('dance', t, { species: 'pet_puppy', seed: 1 }), sample('dance', t, { species: 'pet_puppy', seed: 99 }));
});

test('characters: one-shots hold their end pose and land back at rest', () => {
  for (const clip of ONE_SHOTS) for (const species of CH.PETS) for (const reduced of [false, true]) {
    const o = { species, reduced, seed: 3 }, d = CH.durOf(clip, o);
    assert.ok(d > 0 && d <= 2, clip + ' lasts ' + d);
    assert.deepEqual(sample(clip, d + 5, o), sample(clip, d, o), clip + ' holds');
    const end = sample(clip, d + 1, o);
    assert.ok(near(end.y, 0, 1e-3) && near(end.pitch % 360, 0, 1e-6) && near(end.sy, 1, 1e-3), `${species} ${clip} ends at rest`);
    if (clip === 'kick') assert.ok(Math.abs(end.legFR) < 1e-6 && Math.abs(end.legFL) < 1e-6, 'the kicking paw comes home');
    if (!reduced && (clip === 'lean' || clip === 'lookBack')) assert.ok(Math.abs(end.headYaw) < 1e-6 && Math.abs(end.hips) < 1e-6, clip + ' returns to neutral');
  }
  assert.equal(CH.durOf('jump', { dur: 0.9 }), 0.9);
});

test('characters: the tumble is a back-flip ending in dizzy stars; reduced motion never flips', () => {
  let minPitch = 0, maxY = 0;
  for (let t = 0; t <= 0.85; t += 0.01) { const p = sample('tumble', t, {}); minPitch = Math.min(minPitch, p.pitch); maxY = Math.max(maxY, p.y); }
  assert.ok(minPitch < -350, 'turns a full 360 nose-up (pitch negative)');
  assert.ok(sample('tumble', 0.15, {}).pitch < 0, 'the nose goes up first');
  assert.ok(maxY > 0.25 && maxY <= 0.3 + 1e-9);
  assert.ok(near(sample('tumble', 0.85, {}).spark, 1), 'stars at the end');
  assert.equal(sample('tumble', 0.85, { height: 0 }).y, 0);
  for (let t = 0; t <= 1; t += 0.05) { const p = sample('tumble', t, { reduced: true }); assert.equal(p.pitch, 0); assert.equal(p.y, 0); }
  const dz = sample('dizzy', 1.3, {});
  assert.equal(dz.spark, 1);
  assert.ok(dz.eye < 1);
  const r1 = sample('dizzy', 0.2, { reduced: true }), r2 = sample('dizzy', 3.1, { reduced: true });
  assert.deepEqual(still(r1), still(r2), 'reduced dizzy is still');
});

test('characters: the kick strikes at KICK_STRIKE (wind back, then whip forward)', () => {
  const s = CH.KICK_STRIKE;
  assert.ok(sample('kick', s - 0.05, {}).legFR < -40, 'wound back');
  assert.ok(sample('kick', s + 0.04, {}).legFR > 60, 'through the ball');
  assert.ok(sample('kick', s + 0.04, { left: true }).legFL > 60 && sample('kick', s + 0.04, { left: true }).legFR === 0, 'left paw option');
  assert.ok(Math.abs(sample('kick', s + 0.04, { reduced: true }).legFR) < 60, 'reduced is smaller');
});

test('characters: gaits follow speed; bunny hops 0.18 u; the dragon flutters 0.12 u up', () => {
  const crossings = (clip, speed, sp = 'pet_puppy') => {
    let n = 0, prev = sample(clip, 0, { speed, species: sp }).legFL;
    for (let t = 0.005; t < 4; t += 0.005) { const v = sample(clip, t, { speed, species: sp }).legFL; if ((prev < 0) !== (v < 0)) n++; prev = v; }
    return n / 4;
  };
  assert.ok(crossings('walk', 1.2) > crossings('walk', 0.5), 'faster walk, faster legs');
  assert.ok(crossings('run', 3) > crossings('walk', 1.0), 'running is faster than walking');
  let hop = 0, hov = 1;
  for (let t = 0; t < 2; t += 0.01) {
    hop = Math.max(hop, sample('walk', t, { species: 'pet_bunny', speed: 1.0 }).y);
    hov = Math.min(hov, sample('walk', t, { species: 'pet_dragon', speed: 1.0 }).y);
  }
  assert.ok(near(hop, 0.18, 0.005), 'bunny hop ' + hop);
  assert.ok(hov >= 0.09, 'dragon hovers ' + hov);
  assert.equal(sample('walk', 0.3, { species: 'pet_dragon', ground: true }).y >= 0, true);
  /* wings beat 3 Hz while moving */
  let peaks = 0, a = 0, b = 0;
  for (let t = 0; t < 2; t += 0.002) { const c = sample('walk', t, { species: 'pet_dragon' }).wingL; if (b > a && b >= c) peaks++; a = b; b = c; }
  assert.ok(Math.abs(peaks / 2 - 3) <= 0.5, 'wings ' + peaks / 2 + ' Hz');
  /* the cape streams with speed in any clip, and lies flat when still */
  assert.equal(sample('idle', 1, {}).cape, 0);
  assert.ok(sample('run', 1, { speed: 3 }).cape > 0.9);
  assert.ok(sample('jump', 0.3, { speed: 3 }).cape > 0.9);
});

/* ---------------- the v2 dance: generic moves only ---------------- */
test('characters: the dance is an original 8-count at 118 BPM built only from generic moves', () => {
  assert.deepEqual(CH.DANCE_MOVES, ['groove', 'step', 'point', 'spin', 'hopTurn', 'freeze']);
  assert.ok(near(CH.durOf('dance', {}), 8 * BEAT) && near(8 * BEAT, 4.068, 0.01));
  const SIG = { pet_puppy: 'point', pet_kitten: 'step', pet_bunny: 'hopTurn', pet_dragon: 'spin' };
  const at = (count, f, species) => sample('dance', (count - 1 + f) * BEAT, { species });
  for (const species of CH.PETS) {
    const plan = CH.DANCE_PLAN[species];
    assert.equal(plan.length, 8);
    for (const m of plan) assert.ok(CH.DANCE_MOVES.includes(m), species + ': ' + m + ' is a generic move');
    assert.deepEqual(plan, ['groove', 'groove', 'step', 'step', SIG[species], SIG[species], 'point', 'freeze'], species + ' plan');
    samePose(at(1, 0.3, species), sample('dance', (8 + 0.3) * BEAT, { species }), species + ' loops every 8 counts');
    /* 1–2 groove bounce: up on the 'and' (0.02 u), down on the beat — one bounce a beat */
    assert.ok(near(at(1, 0.5, species).y, 0.02, 1e-6) && near(at(1, 0, species).y, 0, 1e-6) && near(at(2, 0.5, species).y, 0.02, 1e-6), species + ' groove');
    assert.ok(Math.abs(at(1, 0.5, species).headRoll) > 3, species + ' shoulder pop');
    /* 3–4 step-touch: out to the left on 3, home on 4, the other paw taps */
    assert.ok(at(3, 0.6, species).x > 0.05 && at(3, 0.75, species).legFRz > 5, species + ' steps out and touches');
    assert.ok(Math.abs(at(4, 0.95, species).x) < 0.005 && at(4, 0.75, species).legFLz > 5, species + ' steps home');
    assert.equal(at(7, 0.5, species).faceCam, 1, species + ' snaps to the camera');
    assert.ok(at(7, 0.6, species).legFR > 60, species + ' with a point');
    const g = at(8, 0.5, species);
    assert.ok(g.faceCam === 1 && g.legFR > 100 && near(g.headRoll, 12), species + ' freeze: a paw up, head tilted 12°');
  }
  assert.ok(at(5, 0.5, 'pet_puppy').legFL > 100 && at(6, 0.5, 'pet_puppy').legFR > 100, 'puppy paw-point combo, left then right');
  assert.ok(at(5, 0.5, 'pet_kitten').x > 0.07 && at(6, 0.5, 'pet_kitten').x < -0.07, 'kitten slide-step out to each side');
  assert.ok(near(at(5, 0.999, 'pet_bunny').yaw, 180, 1) && near(at(6, 0.999, 'pet_bunny').yaw, 360, 1) && at(5, 0.5, 'pet_bunny').y > 0.1, 'bunny hop-turn, 180° a count');
  assert.ok(at(5, 0.99, 'pet_dragon').y > 0.1 && at(5, 0.99, 'pet_dragon').wingL > 45 && near(at(6, 0.999, 'pet_dragon').yaw, 360, 1), 'dragon wing-flare spin');
  for (let t = 0; t < 5; t += 0.4) assert.deepEqual(still(sample('dance', t, { reduced: true })), still(sample('dance', 0, { reduced: true })), 'reduced = one freeze pose');
});

/* ---------------- the v2 de-babied look and motion ---------------- */
test('characters: confident eyes, a smaller squash and the 0.96 / 1.03 tap squish', () => {
  assert.equal(CH.EYE_OPEN, 0.88, 'relaxed resting openness');
  assert.ok(CH.IDLE_SQUASH <= 0.007);
  let lo = 2, hi = 0;
  for (let t = 0; t < 4; t += 0.01) { const sy = sample('idle', t, {}).sy; lo = Math.min(lo, sy); hi = Math.max(hi, sy); }
  assert.ok(hi - 1 <= 0.0071 && 1 - lo <= 0.0071, 'idle squash ' + (hi - lo));
  let mn = 2, mx = 0;
  for (let t = 0; t <= 0.45; t += 0.002) { const sy = sample('hop', t, {}).sy; mn = Math.min(mn, sy); mx = Math.max(mx, sy); }
  assert.ok(near(mn, 0.96, 0.002) && near(mx, 1.03, 0.002), 'tap squish ' + mn + ' / ' + mx);
  assert.equal(CH.squishAt(0), 1); assert.ok(near(CH.squishAt(1), 1));
  /* the head is smaller (~40 % of the height) and the legs longer than v1 */
  const J = CH.jointsOf('pet_puppy');
  assert.ok(near(J.head[1], 0.395) && J.legFL[1] > 0.13);
});

test('characters: blush shows only in cheer', () => {
  for (const species of CH.PETS) for (const clip of CH.CLIP_NAMES) for (const reduced of [false, true]) {
    for (let t = 0; t < 3; t += 0.29) {
      const b = sample(clip, t, { species, reduced, seed: 5 }).blush;
      if (clip === 'cheer') assert.equal(b, 1, species + ' cheers with a blush');
      else assert.equal(b, 0, species + ' ' + clip + ' never blushes');
    }
  }
});

test('characters: the v2 idles — lean, beat-nod (on the beat, ±6°) and look-back (60°)', () => {
  /* lean: hips 6°, head tilt 8°, over 2 s */
  const mid = sample('lean', 1, { seed: 2 });
  assert.ok(near(Math.abs(mid.hips), 6, 1e-6) && near(Math.abs(mid.headRoll), 8, 1e-6), 'lean ' + mid.hips + ' / ' + mid.headRoll);
  assert.equal(Math.sign(sample('lean', 1, { left: true }).hips), 1);
  assert.equal(Math.sign(sample('lean', 1, { left: false }).hips), -1);
  /* look-back: the head turns 60° over the shoulder */
  const lb = sample('lookBack', 0.8, { left: true });
  assert.ok(near(lb.headYaw, 60, 1e-6), 'look-back ' + lb.headYaw);
  /* beat-nod: ±6° once per beat, never past 118 BPM */
  let lo = 0, hi = 0;
  for (let t = 0; t < 2; t += 0.002) { const p = sample('beatNod', t, { bpm: 100 }).headPitch; lo = Math.min(lo, p); hi = Math.max(hi, p); }
  assert.ok(near(hi, 6, 0.05) && near(lo, -6, 0.05), 'nod ±6°: ' + lo + ' / ' + hi);
  assert.ok(peakHz((t) => sample('beatNod', t, { bpm: 100 }).headPitch, 6) <= 100 / 60 + 0.05, 'once per beat');
  assert.ok(peakHz((t) => sample('beatNod', t, { bpm: 160 }).headPitch, 6) <= 2, 'clamped to 118 BPM');
  assert.deepEqual(still(sample('beatNod', 0.3, { reduced: true })), still(sample('beatNod', 2.7, { reduced: true })), 'reduced: still');
  /* the photo booth's paw-point faces the camera with one paw up */
  const pt = sample('point', 1, {});
  assert.ok(pt.faceCam === 1 && pt.legFR > 100);
  assert.ok(sample('point', 1, { left: true }).legFL > 100);
});

test('characters: reduced-motion variants are still or gentler', () => {
  for (const species of CH.PETS) {
    for (const clip of ['idle', 'sad', 'sit', 'drive', 'slide', 'fall', 'cheer', 'point', 'beatNod']) {
      const a = sample(clip, 0.2, { species, reduced: true }), b = sample(clip, 2.9, { species, reduced: true });
      assert.ok(near(a.y, b.y) && near(a.sy, b.sy) && near(a.pitch, b.pitch), `${species} ${clip} reduced is static`);
    }
    let amp = 0, ampR = 0;
    for (let t = 0; t < 2; t += 0.01) {
      amp = Math.max(amp, Math.abs(sample('walk', t, { species, speed: 1.0 }).legFL));
      ampR = Math.max(ampR, Math.abs(sample('walk', t, { species, speed: 1.0, reduced: true }).legFL));
    }
    assert.ok(ampR <= amp, species + ' reduced walk is gentler');
    assert.equal(sample('hop', 0.2, { species, reduced: true }).y, 0, species + ' reduced hop stays down');
  }
});

test('characters: blinks every 3–6 s; the idle breathes slowly', () => {
  for (const seed of [1, 2, 'pet-a', 'pet-b']) {
    const starts = [];
    let prev = 1;
    for (let t = 0; t < 60; t += 0.01) { const e = CH.blinkAt(t, seed); if (e < 0.5 && prev >= 0.5) starts.push(t); prev = e; }
    assert.ok(starts.length >= 9, 'blinks ' + starts.length);
    for (let i = 1; i < starts.length; i++) { const g = starts[i] - starts[i - 1]; assert.ok(g > 2.9 && g < 6.1, 'gap ' + g); }
  }
  assert.ok(peakHz((t) => sample('idle', t, { species: 'pet_puppy' }).sy, 10, 0.01) <= 0.6, 'breathing');
});

test('characters: lights and loops stay under 2 Hz (glint, fan bob, visor scan, ring pulse, twirl)', () => {
  const g = peakHz((t) => CH.crownGlint(t, 0.2, false), 30, 0.005);
  assert.ok(g <= 2 && g > 0, 'glint ' + g + ' Hz');
  for (let t = 0; t < 5; t += 0.1) assert.equal(CH.crownGlint(t, 0, true), 0);
  const look = CH.fanLook('x');
  for (const bpm of [100, 118, 140]) assert.ok(peakHz((t) => CH.fanMotion(t, look, { bpm }).y, 20) <= 2, 'fan bob at ' + bpm);
  assert.deepEqual(CH.fanMotion(3, look, { reduced: true }), CH.fanMotion(0.5, look, { reduced: true }));
  /* the visor's dot sweeps at 1 Hz; centred and still when reduced */
  assert.ok(CH.VISOR_SCAN_HZ <= 1);
  assert.ok(Math.abs(peakHz((t) => CH.visorScan(t, false), 10) - 1) < 0.05);
  assert.equal(CH.visorScan(1.37, true), 0);
  /* headphone rings: ±20 %, at most one pulse a beat and never faster than 2 Hz */
  for (const bpm of [92, 118, 128, 140, 180]) {
    const hz = peakHz((t) => CH.ringPulse(t * bpm / 60, bpm, false), 10);
    assert.ok(hz <= 2 + 1e-9, 'rings at ' + bpm + ' BPM pulse ' + hz + ' Hz');
  }
  for (let b = 0; b < 4; b += 0.1) { const v = CH.ringPulse(b, 118, false); assert.ok(v >= 0.8 - 1e-9 && v <= 1.2 + 1e-9); }
  assert.equal(CH.ringPulse(1.3, 118, true), 1);
  /* the Showtime twirl: 360° over 1.2 s, once every 8 s; none when reduced */
  assert.ok(near(CH.twirlAt(0.6, false), 180));
  assert.equal(CH.twirlAt(3, false), 0);
  assert.ok(near(CH.twirlAt(8.6, false), 180));
  assert.equal(CH.twirlAt(0.6, true), 0);
});

/* ---------------- cloth, stars, skinning, accessories, fans ---------------- */
test('characters: the cape lies flat at rest, keeps its top edge, and lifts with speed', () => {
  const C = CH.CAPE, top = [0.1, C.y, C.z], hem = [0, C.y - 0.13, C.z - C.len];
  for (const t of [0, 0.7, 2.3]) {
    const r = CH.capeDeform(hem[0], hem[1], hem[2], t, 0, false);
    assert.ok(near(r.x, hem[0]) && near(r.y, hem[1]) && near(r.z, hem[2]), 'flat when idle');
    const e = CH.capeDeform(top[0], top[1], top[2], t, 1, false);
    assert.ok(near(e.y, top[1]) && near(e.z, top[2]), 'the top edge stays on the shoulders');
  }
  const lift = (k) => CH.capeDeform(hem[0], hem[1], hem[2], 0.25, k, true).y;
  assert.ok(lift(1) > lift(0.5) && lift(0.5) > lift(0), 'more speed, more lift');
  const d0 = Math.hypot(hem[1] - C.y, hem[2] - C.z), r1 = CH.capeDeform(hem[0], hem[1], hem[2], 1, 0.8, true);
  assert.ok(near(Math.hypot(r1.y - C.y, r1.z - C.z), d0, 1e-9));
  let maxW = 0;
  for (let t = 0; t < 2; t += 0.05) maxW = Math.max(maxW, Math.abs(CH.capeDeform(0, hem[1], hem[2], t, 1, false).y - CH.capeDeform(0, hem[1], hem[2], t, 1, true).y));
  assert.ok(maxW > 0.005, 'it flaps');
});

test('characters: dizzy stars ring the anchor, 120° apart', () => {
  const a = CH.dizzyStar(0, 30), b = CH.dizzyStar(1, 30), c = CH.dizzyStar(2, 30);
  for (const s of [a, b, c]) assert.ok(near(Math.hypot(s.x, s.z), 0.13));
  const d = ((Math.atan2(b.z, b.x) - Math.atan2(a.z, a.x)) * 180 / Math.PI + 360) % 360;
  assert.ok(near(d, 120, 1e-6));
});

test('characters: rigid skin merge binds every vertex 100 % to one bone', () => {
  const part = (n, bone) => ({ pos: new Float32Array(n * 3).fill(bone), nrm: new Float32Array(n * 3), col: new Float32Array(n * 3).fill(1), bone });
  const m = CH.skinMerge([part(6, 3), part(3, 0), part(9, 18)]);
  assert.equal(m.count, 18);
  assert.deepEqual(m.ranges, [[0, 6], [6, 3], [9, 9]]);
  for (let v = 0; v < m.count; v++) {
    assert.equal(m.skinWeight[v * 4], 1);
    assert.equal(m.skinWeight[v * 4 + 1] + m.skinWeight[v * 4 + 2] + m.skinWeight[v * 4 + 3], 0);
  }
  assert.equal(m.skinIndex[0], 3); assert.equal(m.skinIndex[6 * 4], 0); assert.equal(m.skinIndex[17 * 4], 18);
});

test('characters: accessory state keeps valid ids in their own socket', () => {
  assert.deepEqual(CH.accState({ hat: 'acc_crown', neck: 'acc_crown', face: 'acc_nope', back: 'acc_cape' }), { hat: 'acc_crown', back: 'acc_cape' });
  assert.deepEqual(CH.accState({ hat: 'acc_crown' }, 'acc_partyhat'), { hat: 'acc_partyhat' });
  assert.deepEqual(CH.accState(null, 'acc_shades'), { face: 'acc_shades' });
  assert.deepEqual(CH.accState({ hat: 'acc_beanie', neck: 'acc_headphones', face: 'acc_visor', back: 'acc_hoodie' }, 'acc_cap'),
    { hat: 'acc_cap', neck: 'acc_headphones', face: 'acc_visor', back: 'acc_hoodie' });
  assert.equal(CH.accKey({ neck: 'acc_bow' }), '-|acc_bow|-|-');
  for (const id of Object.keys(CH.ACC_SOCKET)) {
    const st = L.resolveStyle(id, { pet: 'pet_kitten' });
    assert.equal(CH.accState(st.acc, id)[CH.ACC_SOCKET[id]], id, id + ' previews in its socket');
  }
});

test('characters: the recipes use known primitives, bones and materials; night parts are switchable', () => {
  const PRIMS = ['puff', 'sphere', 'bean', 'capsule', 'tube', 'cone', 'drop', 'ring', 'torus', 'arc', 'annulus', 'box', 'disc', 'ribbon', 'star4', 'star4flat', 'cape', 'cap', 'fan'];
  const MATS = ['toon', 'shine', 'gold', 'foil', 'rings'];
  for (const pet of CH.PETS) {
    const all = CH.petParts(pet, CH.accState({}), true);
    for (const id of Object.keys(CH.ACC_SOCKET)) all.push(...CH.accParts(id, pet, true));
    for (const d of all) {
      assert.ok(PRIMS.includes(d.g), 'primitive ' + d.g);
      assert.ok(CH.BONES.includes(d.bone || 'body'), 'bone ' + d.bone);
      assert.ok(MATS.includes(d.mat || 'toon'), 'material ' + d.mat);
      if (d.night) assert.ok(['nightH', 'scan'].includes(d.bone) || d.mat === 'foil', 'night parts sit on a switch bone or the foil mesh');
      if (d.blush) assert.equal(d.bone, 'blush');
    }
    /* blush discs only on the blush switch bone; the eyes are covered by shades and the visor (no glint) */
    assert.equal(CH.petParts(pet, {}, true).filter((d) => d.blush).length, 2);
    for (const face of ['acc_shades', 'acc_visor']) assert.ok(!CH.petParts(pet, { face }, true).some((d) => d.bone === 'eyes' && d.mat === 'shine'), face + ' hides the glint');
  }
  /* the bunny wears the cap between its ears (a narrower crown) */
  const crown = (pet) => CH.accParts('acc_cap', pet, true)[0].t[0].s[0];
  assert.ok(crown('pet_bunny') < crown('pet_puppy'));
});

test('characters: triangle budgets — pets ≤ 1,800, every accessory ≤ 300 on every pet, avatar ≤ 1,500 / 1,050', () => {
  for (const tier of TIERS) {
    for (const pet of CH.PETS) {
      assert.ok(CH.petTris(pet, tier) <= CH.BUDGET.pet, tier + ' ' + pet + ' ' + CH.petTris(pet, tier));
      for (const id of Object.keys(CH.ACC_SOCKET)) {
        const n = CH.accTris(id, pet, tier);
        assert.ok(n > 0 && n <= L.BUDGET.acc, `${tier} ${id} on ${pet}: ${n}`);
      }
    }
    const av = CH.avatarTris(tier), cap = tier === 'LOW' ? L.CHARACTERS.avatar.trisLow : L.CHARACTERS.avatar.tris;
    assert.ok(av <= cap, tier + ' avatar ' + av + ' > ' + cap);
  }
  assert.equal(CH.BUDGET.avatarLow, 1050);
  assert.ok(CH.wandTris('hero') <= L.CHARACTERS.wand.tris && CH.wandTris('hero') <= 260, 'Spark Stick ' + CH.wandTris('hero'));
  let fan = 0;
  for (const d of CH.fanParts('crowd')) if (d.part === 'body') fan += CH.primTris(d, 'MID');
  assert.ok(fan <= CH.BUDGET.fan, 'crowd fan body ' + fan);
});

test('characters: the avatar is h 1.0 in a hood, hoodie, joggers and sneakers, with the child\'s emoji as its face', () => {
  assert.equal(CH.AV_H, L.CHARACTERS.avatar.h);
  const parts = CH.avatarParts(null, 'MID');
  const top = Math.max(...parts.filter((d) => d.g === 'cap').map((d) => d.t.p[1] + d.a[0]));
  assert.ok(near(top, 1.0, 1e-9), 'the hood top is at 1.0 (' + top + ')');
  for (const bone of ['legL', 'legR']) assert.ok(parts.some((d) => d.bone === bone), 'legs and sneakers on ' + bone);
  /* never a realistic face: no eyes, mouths or noses in the recipe — the emoji is the face */
  assert.ok(!/eye|mouth|nose/i.test(JSON.stringify(parts.map((d) => d.c))));
  assert.ok(/emojiFace\(emoji\)/.test(SRC), 'the face cap uses the emoji texture');
  for (const k of ['hood', 'hoodie', 'band', 'legs', 'sneaker', 'mic']) assert.ok(L.CHARACTERS.avatar.colors[k], 'look key ' + k);
});

test('characters: the Spark Stick has 4 points (never the 5-point reward star) and is the only light stick', () => {
  assert.equal(CH.WAND.points, 4);
  assert.equal(CH.WAND.points, L.CHARACTERS.wand.points);
  const o = CH.starOutline(4, CH.WAND.rOut, CH.WAND.rIn);
  assert.equal(o.length, 8);
  const tips = o.filter((p) => near(Math.hypot(p[0], p[1]), CH.WAND.rOut, 1e-9));
  assert.equal(tips.length, 4, 'four tips');
  assert.ok(near(Math.atan2(tips[0][1], tips[0][0]), Math.PI / 2, 1e-9), 'one tip straight up (✦)');
  assert.ok(CH.WAND.rIn / CH.WAND.rOut <= 0.3, 'a crisp ✦, not a puffy star');
  for (const detail of ['hero', 'crowd']) {
    const heads = CH.wandParts(detail, null).filter((d) => d.part === 'head');
    assert.ok(heads.length && heads.every((d) => d.g === 'star4' || d.g === 'star4flat'), detail + ' head is a ✦');
  }
  assert.ok(!/G\.star\(/.test(SRC), 'the puffy 5-point star helper is never used');
  assert.ok(!/sphere-on|heart head|hammer/i.test(SRC));
});

test('characters: hulls are 0.009 u in Midnight Ink (characters only, MID/HIGH)', () => {
  assert.equal(CH.OUTLINE_CHAR, L.MATERIAL.outline.character);
  assert.equal(CH.OUTLINE_CHAR, Kit.OUTLINE_CHAR);
  assert.equal(CH.OUTLINE_TOKEN, L.MATERIAL.outline.token);
  assert.ok(L.isToken(CH.OUTLINE_TOKEN));
  assert.match(SRC, /K\.variant\('outline:' \+ OUTLINE_CHAR, 'skin', \{ color: K\.col\(OUTLINE_TOKEN\) \}\)/);
  assert.match(SRC, /K\.tier !== 'LOW' && K\.outlines !== false && quality\(SL3D\)\.outlines/, 'no hulls on LOW');
  for (const k of ['pet', 'acc', 'avatar']) assert.ok(L.OUTLINE_KINDS[k], k + ' keeps its hull');
});

test('characters: fan blobs are deterministic streetwear by day, Crowd Shadow silhouettes at night', () => {
  const C = L.CHARACTERS.fanBlob.colors, day = ['day1', 'day2', 'day3', 'day4', 'day5', 'day6'].map((k) => C[k]), night = [C.a, C.b, C.c];
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const f = CH.fanLook('fan-' + i);
    assert.deepEqual(f, CH.fanLook('fan-' + i));
    assert.ok(day.includes(f.body), 'day body ' + f.body);
    assert.ok(night.includes(f.shadow), 'night body ' + f.shadow);
    assert.ok(f.wand === '@member' || L.NEON3.includes(f.wand), 'stick ' + f.wand);
    assert.ok(f.scale >= 0.92 && f.scale <= 1.08 && Math.abs(f.lean) <= 5 && (f.hand === 1 || f.hand === -1));
    seen.add(f.body + '|' + f.wand);
  }
  assert.ok(seen.size >= 15, 'varied crowd (' + seen.size + ' combos)');
  /* no faces in the crowd; heroes get two Bone White eye dots and no mouth */
  assert.ok(!CH.fanParts('crowd').some((d) => d.part === 'eyes'));
  const eyes = CH.fanParts('hero').filter((d) => d.part === 'eyes');
  assert.equal(eyes.length, 2);
  assert.ok(eyes.every((d) => d.c === 'Bone White'));
});

test('characters: avatar clips are finite; the idle shifts its weight every 2.4 s; the tap emotes', () => {
  for (const clip of CH.AV_CLIPS.concat(['nope'])) for (const reduced of [false, true]) {
    for (let t = 0; t < 4; t += 0.21) {
      const p = CH.sampleAvatar(clip, t, null, { reduced, speed: 1, steer: -0.4 });
      for (const k of CH.AV_KEYS) assert.ok(Number.isFinite(p[k]), clip + ' ' + k);
    }
  }
  for (const k of ['hips', 'lean', 'legL', 'legR', 'twirl']) assert.ok(CH.AV_KEYS.includes(k), 'v2 avatar key ' + k);
  let hi = -99, lo = 99, yMax = 0;
  for (let t = 0; t < 6; t += 0.01) { const p = CH.sampleAvatar('idle', t, null, {}); hi = Math.max(hi, p.hips); lo = Math.min(lo, p.hips); yMax = Math.max(yMax, Math.abs(p.y)); }
  assert.ok(near(hi, 5, 0.01) && near(lo, -5, 0.01), 'hips ±5° (' + lo + ', ' + hi + ')');
  assert.ok(yMax <= 0.01, 'a small bob');
  assert.ok(near(CH.sampleAvatar('idle', 0.5, null, {}).hips, CH.sampleAvatar('idle', 2.9, null, {}).hips, 1e-9), '2.4 s period');
  assert.deepEqual(CH.sampleAvatar('idle', 1.3, null, { reduced: true }), CH.restAvatar({}));
  assert.ok(CH.sampleAvatar('cheer', 0.2, null, {}).armL > 120 && CH.sampleAvatar('cheer', 0.2, null, {}).wand === 1, 'cheer raises the stick');
  /* the three tap emotes are generic gestures with the right hand up or pointing at the camera */
  const heart = CH.sampleAvatar('heart', 0.5, null, {}), v = CH.sampleAvatar('vsign', 0.5, null, {}), mic = CH.sampleAvatar('micpoint', 0.5, null, {});
  assert.ok(heart.armR > 100 && heart.faceCam === 1, 'finger-heart by the cheek');
  assert.ok(v.armR > 100 && near(v.headRoll, 12), 'V-sign with a head tilt');
  assert.ok(mic.armRf > 70 && mic.faceCam === 1, 'mic-point to the camera');
  assert.deepEqual(CH.sampleAvatar('dance', 1, null, { reduced: true }), CH.sampleAvatar('dance', 3, null, { reduced: true }));
  assert.deepEqual(CH.sampleAvatar('dance', 1, null, { reduced: true }), CH.sampleAvatar('heart', 0, null, { reduced: true }), 'reduced dance = the finger-heart');
  /* the avatar's 8-count follows the pets': groove, step-touch, point, point, freeze */
  const at = (c, f) => CH.sampleAvatar('dance', (c - 1 + f) * BEAT, null, {});
  assert.ok(near(at(1, 0.5).y, 0.02) && at(3, 0.6).x > 0.05 && at(5, 0.5).armR > 100 && at(7, 0.5).faceCam === 1 && at(8, 0.5).armR > 100);
});

test('characters: registers the shared character API and the pet/accessory models once', () => {
  const calls = { models: [], apis: [] };
  const fake = {
    defineModels(cat, f) { calls.models.push([cat, f]); },
    defineApi(name, f) { calls.apis.push([name, f]); }
  };
  assert.equal(CH.register(fake), true);
  assert.equal(CH.register(fake), false, 'idempotent');
  assert.deepEqual(calls.apis.map((a) => a[0]).sort(), ['makeAvatar', 'makeFanBlob', 'makeRig', 'makeWand', 'petPose']);
  assert.equal(calls.models.length, 1);
  assert.equal(calls.models[0][0], 'characters');
  const reg = calls.models[0][1]({}, fake);
  assert.deepEqual(Object.keys(reg).sort(), CH.PETS.concat(Object.keys(CH.ACC_SOCKET)).sort());
  for (const id of Object.keys(reg)) {
    assert.equal(typeof reg[id].build, 'function', id);
    assert.equal(reg[id].act({}, 'tap'), null);
  }
  const pose = calls.apis.find((a) => a[0] === 'petPose')[1]();
  assert.equal(pose.sample, CH.sampleClip);
  assert.deepEqual(pose.POSE_KEYS, CH.POSE_KEYS);
});

test('characters: kid-safe and original — no real names, words or fire in the characters source', () => {
  assert.ok(!/[ᄀ-ᇿ㄰-㆏가-힯]/.test(SRC), 'no Hangul');
  assert.ok(!/k-?pop|\bidol\b/i.test(SRC), 'no "K-pop" or "idol"');
  assert.match(SRC, /never fire/, 'the dragon sparkles, never breathes fire');
});
