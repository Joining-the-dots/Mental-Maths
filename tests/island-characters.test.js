'use strict';
/* My Island 3D — characters: the pure pose / clip maths of world/island3d/models-characters.js
   (the THREE builders are exercised in the QA lab; Node has no THREE) */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const L = require('../world/world-look.js');
const W = require('../world/world-core.js');
const CH = require('../world/island3d/models-characters.js');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'world', 'island3d', 'models-characters.js'), 'utf8');
const CONTRACT_CLIPS = ['idle', 'walk', 'run', 'hop', 'jump', 'fall', 'slide', 'tumble', 'dizzy', 'dance', 'cheer', 'sad', 'sit', 'kick', 'drive'];
const ONE_SHOTS = ['hop', 'jump', 'tumble', 'kick'];
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const sample = (clip, t, o) => CH.sampleClip(clip, t, null, o);
/* a pose without its cloth clock ('wave' always advances) */
const still = (p) => { const o = Object.assign({}, p); delete o.wave; return o; };
const samePose = (a, b, msg) => { for (const k of CH.POSE_KEYS) if (k !== 'wave') assert.ok(near(a[k], b[k], 1e-6), msg + ': ' + k + ' ' + a[k] + ' vs ' + b[k]); };
const BEAT = 60 / 118;

/* ---------------- contract and look agreement ---------------- */
test('characters: the contract clips, bones, sockets and accessories are all present', () => {
  assert.deepEqual(CH.CLIP_NAMES.slice().sort(), CONTRACT_CLIPS.slice().sort());
  for (const b of L.PET_BONES) assert.ok(CH.BONES.includes(b), 'bone ' + b);
  assert.deepEqual(CH.SOCKETS.slice().sort(), L.PET_SOCKETS.slice().sort());
  assert.deepEqual(CH.PETS.slice().sort(), Object.keys(L.LOOK).filter((id) => L.LOOK[id].kind === 'pet').sort());
  for (const [id, sock] of Object.entries(CH.ACC_SOCKET)) {
    assert.equal(L.LOOK[id].kind, 'acc', id);
    assert.equal(L.LOOK[id].socket, sock, id + ' socket');
  }
  assert.deepEqual(Object.keys(CH.ACC_SOCKET).sort(), W.CATALOG.filter((it) => /^acc_/.test(it.id)).map((it) => it.id).sort());
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
  }
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

test('characters: every colour in the source is a palette/look token (no raw hex)', () => {
  assert.ok(!/['"]#[0-9a-fA-F]{3,6}['"]/.test(SRC), 'no raw hex literals');
  const literals = SRC.match(/'[A-Z][a-z]+(?: [A-Z][a-z]+)*'/g) || [];
  assert.ok(literals.length > 10);
  for (const lit of literals) assert.ok(L.isToken(lit.slice(1, -1)), 'token ' + lit);
  /* accessory parts named in tokOf(...) / t(...) exist in the LOOK entry */
  const re = /\bt(?:okOf)?\('(acc_[a-z]+)', '([a-zA-Z]+)'/g;
  let m, n = 0;
  while ((m = re.exec(SRC))) { n++; assert.ok(L.LOOK[m[1]].colors[m[2]], m[1] + '.' + m[2]); }
  assert.ok(n >= 12, 'accessory colours come from LOOK (' + n + ')');
});

test('characters: classic script with THREE only from the kit', () => {
  assert.ok(!/^\s*(import|export)\b/m.test(SRC), 'no ES module syntax');
  assert.ok(!/window\.THREE|root\.THREE|globalThis\.THREE/.test(SRC), 'never a global THREE');
  assert.ok(!/new THREE\./.test(SRC), 'THREE is reached through K.THREE');
});

/* ---------------- clips ---------------- */
test('characters: every clip, species and mode gives a finite, sane pose', () => {
  for (const species of CH.PETS) for (const clip of CH.CLIP_NAMES) for (const reduced of [false, true]) {
    for (let t = 0; t <= 6; t += 0.137) {
      const p = sample(clip, t, { species, reduced, speed: 2, steer: 0.5, seed: 7 });
      for (const k of CH.POSE_KEYS) assert.ok(Number.isFinite(p[k]), `${species} ${clip} ${k} @${t}`);
      assert.ok(p.sx > 0.3 && p.sy > 0.3 && p.sz > 0.3, `${species} ${clip} keeps a positive scale`);
      assert.ok(p.eye >= 0 && p.eye <= 1.2 && p.spark >= 0 && p.spark <= 1.2 && p.cape >= 0 && p.cape <= 1, `${species} ${clip} ranges`);
      assert.ok(p.y > -0.1 && p.y < 0.45, `${species} ${clip} y ${p.y}`);
    }
  }
});

test('characters: clips are pure functions of time', () => {
  for (const clip of CH.CLIP_NAMES) {
    const o = { species: 'pet_kitten', speed: 1.4, seed: 'abc' };
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
    const o = { species, reduced }, d = CH.durOf(clip, o);
    assert.ok(d > 0 && d <= 1, clip + ' lasts ' + d);
    assert.deepEqual(sample(clip, d + 5, o), sample(clip, d, o), clip + ' holds');
    const end = sample(clip, d + 1, o);
    assert.ok(near(end.y, 0, 1e-3) && near(end.pitch % 360, 0, 1e-6) && near(end.sy, 1, 1e-3), `${species} ${clip} ends at rest`);
    if (clip === 'kick') assert.ok(Math.abs(end.legFR) < 1e-6 && Math.abs(end.legFL) < 1e-6, 'the kicking paw comes home');
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
  assert.ok(crossings('run', 3) > crossings('walk', 0.9), 'running is faster than walking');
  let hop = 0, hov = 1;
  for (let t = 0; t < 2; t += 0.01) {
    hop = Math.max(hop, sample('walk', t, { species: 'pet_bunny', speed: 0.9 }).y);
    hov = Math.min(hov, sample('walk', t, { species: 'pet_dragon', speed: 0.9 }).y);
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

test('characters: the dance is an original 8-count at 118 BPM with species signatures', () => {
  assert.ok(near(CH.durOf('dance', {}), 8 * BEAT) && near(8 * BEAT, 4.068, 0.01));
  const at = (count, f, species) => sample('dance', (count - 1 + f) * BEAT, { species });
  for (const species of CH.PETS) {
    samePose(at(1, 0.3, species), sample('dance', (8 + 0.3) * BEAT, { species }), species + ' loops every 8 counts');
    const s1 = at(1, 0.5, species), s2 = at(2, 0.5, species);
    assert.ok(s1.x > 0.05 && s2.x < -0.05 && Math.abs(s1.roll) > 5, species + ' side-steps with a lean');
    assert.ok(at(3, 0.5, species).y > 0.1 && at(4, 0.5, species).y > 0.1, species + ' two hops');
    assert.equal(at(7, 0.5, species).faceCam, 1, species + ' faces the camera');
    const g = at(8, 0.5, species);
    assert.ok(g.faceCam === 1 && g.legFR > 100, species + ' group pose with a raised paw');
  }
  assert.ok(Math.abs(at(5, 0.25, 'pet_puppy').hips) > 5, 'puppy hip wiggle');
  assert.ok(at(5, 0.5, 'pet_kitten').legFL > 100 && at(6, 0.5, 'pet_kitten').legFR > 100, 'kitten paw point left then right');
  assert.ok(near(at(6, 0.999, 'pet_bunny').yaw, 360, 1) && at(5, 0.99, 'pet_bunny').y > 0.1, 'bunny hop-spin');
  assert.ok(at(5, 0.99, 'pet_dragon').y > 0.15, 'dragon wing twirl rises');
  for (let t = 0; t < 5; t += 0.4) assert.deepEqual(still(sample('dance', t, { reduced: true })), still(sample('dance', 0, { reduced: true })), 'reduced = one group pose');
});

test('characters: reduced-motion variants are still or gentler', () => {
  for (const species of CH.PETS) {
    for (const clip of ['idle', 'sad', 'sit', 'drive', 'slide', 'fall', 'cheer']) {
      const a = sample(clip, 0.2, { species, reduced: true }), b = sample(clip, 2.9, { species, reduced: true });
      assert.ok(near(a.y, b.y) && near(a.sy, b.sy) && near(a.pitch, b.pitch), `${species} ${clip} reduced is static`);
    }
    let amp = 0, ampR = 0;
    for (let t = 0; t < 2; t += 0.01) {
      amp = Math.max(amp, Math.abs(sample('walk', t, { species, speed: 0.9 }).legFL));
      ampR = Math.max(ampR, Math.abs(sample('walk', t, { species, speed: 0.9, reduced: true }).legFL));
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
  let peaks = 0, a = 0, b = 0;
  for (let t = 0; t < 10; t += 0.01) { const c = sample('idle', t, { species: 'pet_puppy' }).sy; if (b > a && b >= c) peaks++; a = b; b = c; }
  assert.ok(peaks / 10 <= 0.6, 'breath ' + peaks / 10 + ' Hz');
});

test('characters: lights stay under 2 Hz (crown glint, fan bob on the beat)', () => {
  let peaks = 0, a = 0, b = 0;
  for (let t = 0; t < 30; t += 0.005) { const c = CH.crownGlint(t, 0.2, false); if (b > a && b >= c && b > 0.01) peaks++; a = b; b = c; }
  assert.ok(peaks / 30 <= 2 && peaks > 0, 'glint ' + peaks / 30 + ' Hz');
  for (let t = 0; t < 5; t += 0.1) assert.equal(CH.crownGlint(t, 0, true), 0);
  const look = CH.fanLook('x');
  peaks = 0; a = 0; b = 0;
  for (let t = 0; t < 20; t += 0.002) { const c = CH.fanMotion(t, look, { bpm: 118 }).y; if (b > a && b >= c) peaks++; a = b; b = c; }
  assert.ok(peaks / 20 <= 2, 'fan bob ' + peaks / 20 + ' Hz');
  assert.deepEqual(CH.fanMotion(3, look, { reduced: true }), CH.fanMotion(0.5, look, { reduced: true }));
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
  /* without the wave (reduced) the cloth only rotates about the top edge: lengths are kept */
  const d0 = Math.hypot(hem[1] - C.y, hem[2] - C.z), r1 = CH.capeDeform(hem[0], hem[1], hem[2], 1, 0.8, true);
  assert.ok(near(Math.hypot(r1.y - C.y, r1.z - C.z), d0, 1e-9));
  let maxW = 0;
  for (let t = 0; t < 2; t += 0.05) maxW = Math.max(maxW, Math.abs(CH.capeDeform(0, hem[1], hem[2], t, 1, false).y - CH.capeDeform(0, hem[1], hem[2], t, 1, true).y));
  assert.ok(maxW > 0.005, 'it flaps');
});

test('characters: dizzy stars ring the anchor, 120° apart', () => {
  const a = CH.dizzyStar(0, 30), b = CH.dizzyStar(1, 30), c = CH.dizzyStar(2, 30);
  for (const s of [a, b, c]) assert.ok(near(Math.hypot(s.x, s.z), 0.13));
  const ang = (s) => Math.atan2(s.z, s.x);
  const d = ((ang(b) - ang(a)) * 180 / Math.PI + 360) % 360;
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
  assert.equal(m.pos[9 * 3], 18);
  assert.ok(CH.BONES.length <= 64, 'fits a small bone texture');
});

test('characters: accessory state keeps valid ids in their own socket', () => {
  assert.deepEqual(CH.accState({ hat: 'acc_crown', neck: 'acc_crown', face: 'acc_nope', back: 'acc_cape' }), { hat: 'acc_crown', back: 'acc_cape' });
  assert.deepEqual(CH.accState({ hat: 'acc_crown' }, 'acc_partyhat'), { hat: 'acc_partyhat' });
  assert.deepEqual(CH.accState(null, 'acc_shades'), { face: 'acc_shades' });
  assert.equal(CH.accKey({ neck: 'acc_bow' }), '-|acc_bow|-|-');
  for (const id of Object.keys(CH.ACC_SOCKET)) {
    const st = L.resolveStyle(id, { pet: 'pet_kitten' });
    assert.equal(CH.accState(st.acc, id)[CH.ACC_SOCKET[id]], id, id + ' previews in its socket');
  }
});

test('characters: fan blobs are deterministic pastel originals holding coloured wands', () => {
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const f = CH.fanLook('fan-' + i);
    assert.deepEqual(f, CH.fanLook('fan-' + i));
    assert.ok(L.isToken(f.body) && L.isToken(f.wand), 'tokens');
    assert.ok(Object.values(L.CHARACTERS.fanBlob.colors).includes(f.body), 'body from the fan blob look ' + f.body);
    assert.ok(f.scale >= 0.92 && f.scale <= 1.08 && Math.abs(f.lean) <= 5 && (f.hand === 1 || f.hand === -1));
    seen.add(f.body + '|' + f.wand);
  }
  assert.ok(seen.size >= 15, 'varied crowd (' + seen.size + ' combos)');
});

test('characters: avatar clips are finite and the idle bob is 0.02 u at 0.5 Hz', () => {
  for (const clip of CH.AV_CLIPS.concat(['nope'])) for (const reduced of [false, true]) {
    for (let t = 0; t < 4; t += 0.21) {
      const p = CH.sampleAvatar(clip, t, null, { reduced, speed: 1, steer: -0.4 });
      for (const k of CH.AV_KEYS) assert.ok(Number.isFinite(p[k]), clip + ' ' + k);
    }
  }
  let hi = -1, lo = 1;
  for (let t = 0; t < 4; t += 0.01) { const y = CH.sampleAvatar('idle', t, null, {}).y; hi = Math.max(hi, y); lo = Math.min(lo, y); }
  assert.ok(near(hi, 0.02, 1e-3) && near(lo, -0.02, 1e-3));
  assert.ok(near(CH.sampleAvatar('idle', 0.5, null, {}).y, CH.sampleAvatar('idle', 2.5, null, {}).y, 1e-9), '2 s period');
  assert.equal(CH.sampleAvatar('idle', 1.3, null, { reduced: true }).y, 0);
  assert.ok(CH.sampleAvatar('cheer', 0.2, null, {}).armL > 120 && CH.sampleAvatar('cheer', 0.2, null, {}).wand === 1, 'cheer raises the wand');
  assert.deepEqual(CH.sampleAvatar('dance', 1, null, { reduced: true }), CH.sampleAvatar('dance', 3, null, { reduced: true }));
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
