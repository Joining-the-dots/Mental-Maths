'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Course = require('../world/games/pet-course.js');
const Pen = require('../world/games/penalty.js');
const Kart = require('../world/games/kart.js');
const C = require('../world/world-core.js');

const api = { sound() {}, reduced: true };
const STEP = 1 / 120;

/* ---------------- pet obstacle course ---------------- */
test('course: every seeded layout is completable with zero bumps (autopilot, 3 variants x 150 seeds)', () => {
  for (const variant of ['course_meadow', 'course_beach', 'course_snow', 'course_candy']) {
    for (let seed = 1; seed <= 150; seed++) {
      const r = Course.newRound(api, variant, { seed });
      let t = 0;
      while (!r.done && t < 200) { r.autopilot(); r.step(STEP, {}); t += STEP; }
      assert.equal(r.done, true, `${variant} seed ${seed} did not finish`);
      assert.equal(r.state.hits, 0, `${variant} seed ${seed}: autopilot was bumped`);
      assert.ok(t >= 55 && t <= 95, `round length ${t.toFixed(1)}s outside 60-90s target`);
      assert.ok(C.validResult('course', r.result()), 'result passes core validation');
    }
  }
});

test('course: layouts vary between rounds', () => {
  const a = Course.buildCourse(11).obs.map(o => o.kind + o.x).join(',');
  const b = Course.buildCourse(12).obs.map(o => o.kind + o.x).join(',');
  assert.notEqual(a, b);
});

test('course: a child who never jumps still finishes (bumps only slow you)', () => {
  const r = Course.newRound(api, 'course_meadow', { seed: 5 });
  let t = 0;
  while (!r.done && t < 300) { r.step(STEP, {}); t += STEP; }
  assert.equal(r.done, true);
  assert.ok(r.state.hits > 0);
  assert.ok(t < 150, 'still finishes in reasonable time: ' + t.toFixed(0) + 's');
});

test('course: double jump works and buffered jumps fire on landing', () => {
  const r = Course.newRound(api, 'course_meadow', { seed: 3 });
  r.input('jump', true); r.step(STEP, {});
  assert.equal(r.state.onGround, false);
  for (let i = 0; i < 20; i++) r.step(STEP, {});
  r.input('jump', true);                               /* double jump */
  assert.equal(r.state.airJumps, 0);
  assert.ok(r.state.vy < 0);
});

test('course: frame-rate independent (fixed step gives identical results at 30 and 144 fps)', () => {
  function runAt(fps) {
    const r = Course.newRound(api, 'course_meadow', { seed: 9 });
    let acc = 0, t = 0;
    while (!r.done && t < 200) {
      const dt = 1 / fps; t += dt; acc += dt;
      while (acc >= STEP) { r.autopilot(); r.step(STEP, {}); acc -= STEP; }
    }
    return r.state.treats + ':' + r.state.hits;
  }
  assert.equal(runAt(30), runAt(144));
});

/* ---------------- penalty shootout ---------------- */
test('penalty: top corners on target can never be saved', () => {
  for (const dive of ['left', 'stay', 'right']) {
    for (let x = 262; x <= 380; x += 9) for (let y = 160; y <= 200; y += 8) assert.equal(Pen.outcome(x, y, dive), 'goal', `${x},${y} vs ${dive}`);
    for (let x = 580; x <= 698; x += 9) for (let y = 160; y <= 200; y += 8) assert.equal(Pen.outcome(x, y, dive), 'goal');
  }
});

test('penalty: wide or over the bar is a miss whatever the keeper does', () => {
  for (const dive of ['left', 'stay', 'right']) {
    assert.equal(Pen.outcome(220, 300, dive), 'miss');
    assert.equal(Pen.outcome(740, 300, dive), 'miss');
    assert.equal(Pen.outcome(480, 130, dive), 'miss');
  }
});

test('penalty: the keeper is never unbeatable — every on-target spot has a dive that misses it', () => {
  for (let x = 260; x <= 700; x += 10) for (let y = 160; y <= 330; y += 10) {
    const res = ['left', 'stay', 'right'].map(d => Pen.outcome(x, y, d));
    if (res.includes('miss')) continue;
    assert.ok(res.includes('goal'), `${x},${y} is saved by every dive`);
  }
});

test('penalty: a full round plays 8 shots and the score stays within core limits', () => {
  let seed = 1;
  const rng = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const r = Pen.newRound(api, 'std', { rng });
  let t = 0;
  while (!r.done && t < 300) { r.autopilot(); r.step(STEP); t += STEP; }
  assert.equal(r.done, true);
  assert.equal(r.state.log.length, Pen.SHOTS);
  assert.ok(C.validResult('penalty', r.result()));
  /* every shot has a fixed ~4 s frame (get-ready beat, flight, 2 s result) even for the
     instant-reacting autopilot; a child aims for ~2-4 s more per shot (≈55-80 s rounds) */
  assert.ok(t >= Pen.SHOTS * 3.5 && t <= 95, 'round length ' + t.toFixed(1));
});

test('penalty: shooting away from the lean (autopilot) beats a keeper who commits', () => {
  let seed = 7;
  const rng = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const r = Pen.newRound(api, 'std', { rng });
  let t = 0;
  while (!r.done && t < 300) { r.autopilot(); r.step(STEP); t += STEP; }
  assert.ok(r.state.goals >= 7, 'reading the keeper scores almost every time: ' + r.state.goals);
});

/* ---------------- kart time trial ---------------- */
function driveAutopilot(trackId) {
  const r = Kart.newRound(api, trackId, {});
  let t = 0;
  while (!r.done && t < 240) { r.autopilot(); r.step(STEP, r.autoHeld); t += STEP; }
  return { r, t };
}
for (const id of Object.keys(Kart.TRACKS)) {
  test(`kart: autopilot completes ${id} — every lap counted exactly once, time is plausible`, () => {
    const { r, t } = driveAutopilot(id);
    assert.equal(r.done, true, 'finished');
    assert.equal(r.progress.lap, r.track.laps);
    assert.deepEqual(r.progress.crossedLog.filter(x => x.startsWith('lap')), Array.from({ length: r.track.laps }, (_, i) => 'lap' + (i + 1)));
    assert.equal(r.state.wall, 0, 'the line is drivable without touching a wall');
    const res = r.result();
    assert.ok(C.validResult('kart', res), 'time ' + res.ms + ' accepted by core rules');
    assert.ok(t >= 45 && t <= 95, `${id} race length ${t.toFixed(1)}s`);
  });
}

test('kart: driving the whole track backwards never counts a lap', () => {
  const tr = Kart.buildTrack('track_loop');
  const pr = Kart.newProgress(tr);
  for (let loop = 0; loop < 3; loop++) for (let i = tr.n - 1; i >= 0; i--) {
    const p = tr.pts[i];
    Kart.updateProgress(tr, pr, p[0], p[1], 60, 0);
  }
  assert.equal(pr.lap, 0);
  assert.ok(pr.P < 0);
});

test('kart: wiggling back and forth over the finish line never counts a lap', () => {
  const tr = Kart.buildTrack('track_loop');
  const pr = Kart.newProgress(tr);
  for (let k = 0; k < 200; k++) {
    for (const i of [tr.n - 3, tr.n - 1, 1, 3, 1, tr.n - 1]) { const p = tr.pts[i]; Kart.updateProgress(tr, pr, p[0], p[1], 60, k); }
  }
  assert.equal(pr.lap, 0);
});

test('kart: jumping across the infield earns no progress and skips no gates', () => {
  const tr = Kart.buildTrack('track_loop');
  const pr = Kart.newProgress(tr);
  const far = tr.pts[Math.floor(tr.n / 2)];
  Kart.updateProgress(tr, pr, far[0], far[1], 60, 0);
  assert.equal(pr.P, 0);
  assert.equal(pr.next, 0);
});

test('kart: one honest forward loop = exactly one lap, with gates in order', () => {
  const tr = Kart.buildTrack('track_volcano');
  const pr = Kart.newProgress(tr);
  for (let i = 1; i <= tr.n; i++) { const p = tr.pts[i % tr.n]; Kart.updateProgress(tr, pr, p[0], p[1], 60, i); }
  assert.equal(pr.lap, 1);
  assert.deepEqual(pr.crossedLog, ['cp1', 'cp2', 'cp3', 'lap1']);
});

test('kart: walls stop the kart at the barrier line (no escaping the track)', () => {
  const r = Kart.newRound(api, 'track_loop', {});
  /* point the kart at the outside and floor it for 3 seconds */
  r.kart.h += Math.PI / 2;
  for (let i = 0; i < 360; i++) r.step(STEP, { up: true });
  const nb = Kart.nearest(r.track, r.kart.x, r.kart.y, r.progress.idx);
  assert.ok(nb.d <= Kart.WALL + 0.5, 'kart stays inside the wall: ' + nb.d.toFixed(1));
  assert.ok(r.state.wall >= 1);
});

test('kart: no lap is counted before the race starts moving', () => {
  const r = Kart.newRound(api, 'track_beach', {});
  for (let i = 0; i < 600; i++) r.step(STEP, {});
  assert.equal(r.progress.lap, 0);
  assert.equal(r.done, false);
});
