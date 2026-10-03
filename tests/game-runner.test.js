'use strict';
/* Debut Run (world/games/pet-course.js) — the redesigned runner's rules.
   Spec: docs/island3d/spec-runner.json ("tests"). Every pilot here is
   deterministic (seeded), so the coverage numbers are exact, not flaky. */
const test = require('node:test');
const assert = require('node:assert/strict');
const Course = require('../world/games/pet-course.js');
const C = require('../world/world-core.js');

const STEP = 1 / 120;
const api = { sound() {}, reduced: true };
const T = Course.TUNING, BEAT = Course.BEAT, KINDS = Course.KINDS, SECTIONS = Course.SECTIONS;
const VARIANTS = ['course_meadow', 'course_beach', 'course_snow', 'course_candy'];
const PR_OFF = T.PET_X + T.HB_X + T.PET_W;                      /* pet front = dist + 266 */

function xorshift(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
function play(variant, cfg, pilot, maxT) {
  const r = Course.newRound(api, variant, Object.assign({ fan: false }, cfg));
  let t = 0;
  while (!r.done && t < (maxT || 200)) { if (pilot) pilot(r); r.step(STEP, {}); t += STEP; }
  return { r, s: r.state, t };
}
const auto = r => r.autopilot();
function nextObs(s, obs) { for (let i = s.oc; i < obs.length; i++) if (!obs[i].passed && !obs[i].hit) return i; return -1; }

/* will the current arc (no more input) hit obstacle o within the next few steps? */
function predictHit(s, o, v) {
  let y = s.y, vy = s.vy, d = s.dist, ground = s.onGround;
  const ox1 = o.x + T.EDGE, ox2 = o.x + o.w - T.EDGE, petH = s.sliding ? T.SLIDE_H : T.PET_H;
  for (let k = 1; k <= 45; k++) {
    const prevH = -y;
    if (!ground) { vy += T.G * STEP; y += vy * STEP; if (y >= 0) { y = 0; vy = 0; ground = true; } }
    d += v * STEP;
    const pl = d + PR_OFF - T.PET_W, pr = pl + T.PET_W, h = -y;
    if (pl >= ox2) return 0;
    if (pr <= ox1) continue;
    if (o.kind === 'stack' && vy > 0 && prevH >= o.h - T.CUSH_PREV && h <= o.h + T.CUSH_NOW && Math.min(pr, ox2) - Math.max(pl, ox1) >= T.CUSH_OVERLAP) return 0;
    const hit = o.kind === 'puddle' ? h < T.PUDDLE_Y : o.kind === 'bar' ? h + petH > T.GATE_GAP : h < o.h - T.SINK;
    if (hit) return k;
  }
  return 0;
}
/* the deterministic 'kid' (spec): acts at o.mid + uniform(-J, J); a rescue double jump with p = 0.5 when about to hit */
function kid(J, seed) {
  const rnd = xorshift(seed * 7919 + 13);
  const mem = { idx: -1, off: 0, resc: null, rel: -1 };
  return function (r) {
    const s = r.state, obs = r.course.obs;
    if (mem.rel >= 0 && s.t >= mem.rel) { r.input('slide', false); mem.rel = -1; }
    if (s.phase !== 'run' || (s.eff === 'tumble' && s.effT < T.IGNORE_T)) return;
    const i = nextObs(s, obs); if (i < 0) return;
    if (i !== mem.idx) { mem.idx = i; mem.off = (rnd() * 2 - 1) * J / 1000; mem.resc = null; }
    const o = obs[i], v = Course.speedNow(s); if (v <= 0) return;
    const lead = (o.x + T.EDGE - (s.dist + PR_OFF)) / v;
    if (s.onGround) {
      if (lead <= o.mid + mem.off) {
        if (o.kind === 'bar') { if (!s.sliding) { r.input('slide', true); mem.rel = s.t + 0.15; } } else r.input('jump', true);
      }
    } else if (s.airJumps > 0 && o.kind !== 'bar' && mem.resc === null) {
      const k = predictHit(s, o, v);
      if (k && k <= 24) { mem.resc = rnd() < 0.5; if (mem.resc) r.input('jump', true); }
    }
  };
}
/* a random masher: a tap every 0.3-0.9 s */
function masher(seed) {
  const rnd = xorshift(seed * 104729 + 7);
  let next = 0.3 + rnd() * 0.6;
  return r => { if (r.state.t >= next) { r.input('jump', true); next = r.state.t + 0.3 + rnd() * 0.6; } };
}
/* a hand-made course: one or more obstacles in a section, for exact-consequence tests */
function custom(list) {
  const obs = list.map(o => {
    const w = T.WIN[SECTIONS[o.sec == null ? 1 : o.sec].v][o.kind];
    return Object.assign({ x: 1e9, w: KINDS[o.kind].w, h: KINDS[o.kind].h, sec: 1, rehearsal: false, mid: (w[0] + w[1]) / 2000, cueX: 0, move: 'jump', item: -1,
      cue: false, hit: false, hitT: 0, bounced: false, bounceT: 0, passed: false, judge: 0 }, o);
  });
  return { obs, items: [], enc: [], doors: [], finishX: 1e9, encoreEndX: 1e9, finishD: T.FINISH_D, length: T.FINISH_D };
}
/* place obstacle o so the pet's front reaches o.x+4 after `lead` seconds (constant section speed) */
function placeAhead(r, o, lead) { const s = r.state; o.x = s.dist + Course.schedV(s.sched) * STEP + PR_OFF + Course.schedV(s.sched) * lead - T.EDGE; }

/* ================= fairness ================= */
test('runner: the safe autopilot clears every chart on the beat — 4 variants x 150 seeds, 3 hearts, 0 contacts, every snack', () => {
  const scores = [];
  VARIANTS.forEach((variant, vi) => {
    for (let k = 1; k <= 150; k++) {
      const seed = vi * 1000 + k;
      const { r, s, t } = play(variant, { seed }, auto);
      const tag = `${variant} seed ${seed}`;
      assert.equal(s.phase, 'done', tag + ' finished');
      assert.equal(s.curtain, false, tag + ' no curtain call');
      assert.equal(s.bumps + s.splashes + s.bonks, 0, tag + ' zero contacts');
      assert.equal(s.hearts, 3, tag + ' kept every heart');
      assert.ok(t >= 69 && t <= 72, `${tag}: run length ${t.toFixed(2)} s`);
      const res = r.result();
      assert.ok(C.validResult('course', res), tag + ' result passes core validation');
      assert.ok(Number.isInteger(res.extra), tag + ' integer extra');
      assert.ok(Course.decodeExtra(res.extra).medal >= 3, tag + ' is Gold or better');
      assert.equal(r.course.items.filter(i => i.kind === 'snack' && !i.got).length, 0, tag + ' every snack sits on the beat-timed path');
      scores.push(res.score);
    }
  });
  scores.sort((a, b) => a - b);
  /* calibration (spec: 3,038-3,374, median 3,153 in the judge model) */
  assert.ok(scores[0] >= 2950 && scores[scores.length - 1] <= 3600, `safe range ${scores[0]}-${scores[scores.length - 1]}`);
});

test('runner: the showcase autopilot gets E-N-C-O-R-E, all 10 glow stars and clears the Encore — 4 variants x 50 seeds', () => {
  VARIANTS.forEach((variant, vi) => {
    for (let k = 1; k <= 50; k++) {
      const seed = 5000 + vi * 100 + k;
      const { r, s } = play(variant, { seed, autoMode: 'showcase' }, auto);
      const tag = `${variant} seed ${seed}`;
      assert.equal(s.lettersMask, 63, tag + ' all six letters');
      assert.equal(s.encoreCleared, true, tag + ' Encore cleared');
      assert.equal(s.stars, 10, tag + ' all 10 glow stars');
      assert.equal(s.bumps + s.splashes + s.bonks, 0, tag + ' zero contacts');
      const res = r.result();
      assert.equal(Course.decodeExtra(res.extra).medal, 4, tag + ' Encore Legend');
      assert.ok(res.score >= 3300 && res.score <= 4500, `${tag}: showcase score ${res.score} (headroom under the 5,000 clamp)`);
    }
  });
});

/* ================= real consequences ================= */
test('runner: a child who never jumps is curtain-called early with 0 points; Timing rings change nothing about that', () => {
  for (let seed = 1; seed <= 100; seed++) {
    const { r, s, t } = play('course_meadow', { seed }, null);
    assert.equal(s.curtain, true, 'seed ' + seed + ' curtain call');
    assert.equal(s.phase, 'done');
    assert.equal(s.bumps, 3, 'seed ' + seed + ': exactly 3 bumps, the 3rd ends the show');
    assert.ok(t <= 35, `seed ${seed}: curtain after ${t.toFixed(1)} s`);
    assert.ok(s.progress < 0.30, `seed ${seed}: reached ${(s.progress * 100).toFixed(0)}%`);
    assert.ok(C.validResult('course', r.result()));
    assert.equal(r.result().score, 0, 'seed ' + seed + ' scores nothing');
    assert.equal(Course.decodeExtra(r.result().extra).medal, 0, 'Trainee ribbon');
    assert.equal(r.summaryTitle(), 'CURTAIN CALL!');
    /* Timing rings only show where to jump: the same 3 hearts, the same curtain at the same spot */
    const f = play('course_meadow', { seed, fan: true }, null);
    assert.equal(f.s.rings, true);
    assert.equal(f.s.curtain, true, 'rings seed ' + seed + ' is curtain-called too');
    assert.equal(f.s.bumps, 3);
    assert.equal(f.s.progress, s.progress, 'rings seed ' + seed + ': the same progress');
    assert.equal(f.t, t, 'rings seed ' + seed + ': the same run length');
  }
});

test('runner: a random masher is curtain-called on at least 90% of 100 seeds', () => {
  let curtains = 0;
  for (let seed = 1; seed <= 100; seed++) if (play('course_meadow', { seed }, masher(seed)).s.curtain) curtains++;
  assert.ok(curtains >= 90, 'masher curtain calls: ' + curtains);
});

/* 3 hearts, never regained (the parent: "too easy… only 3 lives and no getting lives back").
   Measured on these 400 seeded kids (V4.53 → now): ±120 ms 99.25% → 97.5%; ±150 ms 90.25%
   (100% with Fan support) → 61.75%; ±250 ms 6.75% (85.75% with Fan support) → 0.5%. */
test('runner: kid pilots — ±120 ms still finishes ≥ 95%; ±150 ms is a real test (50-75%); ±250 ms almost never finishes', () => {
  function rate(J, fan, seeds) {
    let fin = 0, n = 0;
    VARIANTS.forEach((variant, vi) => { for (let k = 1; k <= (seeds || 100); k++) { const seed = vi * 1000 + k; n++; if (play(variant, { seed, fan }, kid(J, seed)).s.finished) fin++; } });
    return fin / n;
  }
  const a = rate(120, false), b = rate(150, false), c = rate(250, false);
  assert.ok(a >= 0.95, '±120 ms finish rate ' + a);
  assert.ok(b >= 0.5 && b <= 0.75, '±150 ms finish rate ' + b + ' (V4.53: 90%, 100% with Fan support)');
  assert.ok(c <= 0.05, '±250 ms finish rate ' + c + ' (V4.53 Fan support: 86%)');
  /* Timing rings are a visual cue only: the same kids finish exactly as often */
  assert.equal(rate(150, true, 25), rate(150, false, 25), 'rings never change the outcome');
});

test('runner: a bump costs exactly a heart, all Hype, 8 treats (−24) and two beats; a puddle halves Hype, spills 3 and costs one beat', () => {
  /* hedge in the Verse, 1 s ahead, treats 10, Hype 25, no input */
  const course = custom([{ kind: 'hedge', sec: 1 }]);
  const r = Course.newRound(api, 'course_meadow', { course, startAt: SECTIONS[1].t0 + 3, fan: false });
  const s = r.state, o = course.obs[0];
  r.wantEvents = true; r.events = [];
  s.treats = 10; s.score = 100; s.hype = 25; s.maxHype = 25; s.mult = 3;
  placeAhead(r, o, 1.0);
  const lag0 = s.lag;
  let n = 0;
  while (!o.hit && n++ < 400) r.step(STEP);
  assert.equal(o.hit, true, 'ran into the hedge');
  assert.equal(s.hearts, 2, 'hearts -1');
  assert.equal(s.hype, 0, 'Hype to 0');
  assert.equal(s.mult, 1);
  assert.equal(s.treats, 2, '8 treats spilled');
  assert.equal(s.spill.filter(q => q.on).length, 8);
  assert.equal(s.score, 100 - 24, 'each spilled treat costs 3');
  assert.equal(s.inv, T.GRACE_BUMP, 'grace starts at 1.4 s');
  assert.equal(s.eff, 'tumble');
  assert.equal(s.vy, -T.POP_V, 'cartoon pop');
  assert.equal(r.events.filter(e => e.type === 'bump').length, 1, 'exactly one bump event');
  for (let k = 0; k < Math.ceil(T.TUMBLE_T / STEP) + 2; k++) r.step(STEP);
  assert.equal(s.eff, null);
  assert.ok(Math.abs(s.lag - (lag0 + 2 * BEAT)) < 1e-9, 'exactly two beats lost: ' + s.lag);

  const course2 = custom([{ kind: 'puddle', sec: 1 }]);
  const r2 = Course.newRound(api, 'course_meadow', { course: course2, startAt: SECTIONS[1].t0 + 3, fan: false });
  const s2 = r2.state, p = course2.obs[0];
  s2.treats = 10; s2.score = 100; s2.hype = 25; s2.maxHype = 25; s2.mult = 3;
  placeAhead(r2, p, 1.0);
  n = 0;
  while (!p.hit && n++ < 400) r2.step(STEP);
  assert.equal(s2.hearts, 3, 'no heart lost in a puddle');
  assert.equal(s2.hype, 12, 'Hype halved, rounded down');
  assert.equal(s2.treats, 7, '3 treats spilled');
  assert.equal(s2.inv, T.GRACE_SPLASH);
  assert.equal(s2.eff, 'slip');
  for (let k = 0; k < Math.ceil(T.SLIP_T / STEP) + 2; k++) r2.step(STEP);
  assert.ok(Math.abs(s2.lag - BEAT) < 1e-9, 'exactly one beat lost: ' + s2.lag);
});

test('runner: rehearsal props are free (the flip only), and a Bubble Shield absorbs exactly one hit', () => {
  /* the 3 Rehearsal props, no input: hearts, Hype, treats and the clean flag untouched */
  for (const seed of [2, 9, 40]) {
    const r = Course.newRound(api, 'course_meadow', { seed, fan: false });
    const s = r.state;
    s.hype = 12; s.mult = 2; s.maxHype = 12;
    const rehearsal = r.course.obs.filter(o => o.sec === 0);
    while (s.section === 0) {
      r.step(STEP);
      assert.equal(s.hearts, 3); assert.equal(s.hype, 12); assert.equal(s.spilled, 0); assert.equal(s.clean, true);
    }
    const solids = rehearsal.filter(o => o.kind !== 'puddle').length, puddles = rehearsal.length - solids;
    assert.equal(s.bonks, 3, 'every rehearsal prop was a free bonk');
    assert.ok(Math.abs(s.lag - (solids * 2 * BEAT + puddles * BEAT)) < 1e-9, 'a solid bonk costs 2 beats, a rehearsal puddle 1');
  }
  /* the first LED gate is a rehearsal prop too */
  const rg = Course.newRound(api, 'course_meadow', { seed: 3, fan: false, startAt: SECTIONS[2].t0 });
  const gate = rg.course.obs.find(o => o.sec === 2 && o.slot === 0);
  assert.equal(gate.kind, 'bar'); assert.equal(gate.rehearsal, true);
  while (!gate.hit) rg.step(STEP);
  assert.equal(rg.state.hearts, 3); assert.equal(rg.state.bonks, 1); assert.equal(rg.state.eff, 'tumble');

  /* shield: the first hit is absorbed with nothing lost, the second counts */
  const course = custom([{ kind: 'log', sec: 1 }, { kind: 'low', sec: 1 }]);
  const r = Course.newRound(api, 'course_meadow', { course, startAt: SECTIONS[1].t0 + 3, fan: false });
  const s = r.state;
  s.shield = true; s.treats = 5; s.hype = 10; s.mult = 2;
  placeAhead(r, course.obs[0], 0.6);
  course.obs[1].x = course.obs[0].x + 700;
  while (!course.obs[0].hit) r.step(STEP);
  assert.equal(s.shield, false, 'shield used');
  assert.equal(s.hearts, 3); assert.equal(s.hype, 10); assert.equal(s.treats, 5); assert.equal(s.eff, null); assert.equal(s.clean, true);
  assert.equal(s.inv, T.GRACE_SHIELD);
  while (!course.obs[1].hit) r.step(STEP);
  assert.equal(s.hearts, 2, 'the second hit counts');
  assert.equal(s.hype, 0);
});

test('runner: cushions BOING (vy −980, double jump restored) and their sides bump; LED gates need a slide (a stage dive works)', () => {
  function stackRound(lead) {
    const course = custom([{ kind: 'stack', sec: 3 }]);
    const r = Course.newRound(api, 'course_meadow', { course, startAt: SECTIONS[3].t0 + 3, fan: false });
    placeAhead(r, course.obs[0], lead);
    return { r, s: r.state, o: course.obs[0] };
  }
  let { r, s, o } = stackRound(0.8);
  while ((o.x + T.EDGE - (s.dist + PR_OFF)) / 350 > o.mid + 0.003) r.step(STEP);
  r.input('jump', true);
  s.airJumps = 0;                                          /* spent: the cushion must give it back */
  let bounced = false;
  for (let k = 0; k < 120 && !bounced; k++) { r.step(STEP); bounced = o.bounced; }
  assert.equal(bounced, true, 'landed on the cushion');
  assert.equal(s.vy, -T.BOUNCE_V); assert.equal(s.airJumps, 1); assert.equal(s.y, -KINDS.stack.h);
  while (!o.passed) r.step(STEP);
  assert.equal(o.hit, false); assert.equal(s.bounces, 1);
  ({ r, s, o } = stackRound(0.8));
  while (!o.hit && s.t < SECTIONS[3].t0 + 6) r.step(STEP);
  assert.equal(o.hit, true, 'running into the side is a bump'); assert.equal(s.hearts, 2);

  function gateRound(lead) {
    const course = custom([{ kind: 'bar', sec: 2 }]);
    const r2 = Course.newRound(api, 'course_meadow', { course, startAt: SECTIONS[2].t0 + 3, fan: false });
    placeAhead(r2, course.obs[0], lead);
    return { r: r2, s: r2.state, o: course.obs[0] };
  }
  const leadOf = (st, ob) => (ob.x + T.EDGE - (st.dist + PR_OFF)) / 330;
  let g = gateRound(0.6);
  while (leadOf(g.s, g.o) > g.o.mid + 0.003) g.r.step(STEP);
  assert.ok(leadOf(g.s, g.o) >= T.WIN[330].bar[0] / 1000 && leadOf(g.s, g.o) <= T.WIN[330].bar[1] / 1000);
  g.r.input('slide', true); g.r.input('slide', false);
  while (!g.o.passed) g.r.step(STEP);
  assert.equal(g.o.hit, false, 'a slide inside WIN passes under the gate');
  g = gateRound(0.6);
  while (!g.o.passed && !g.o.hit) g.r.step(STEP);
  assert.equal(g.o.hit, true, 'standing into it is a bump');
  g = gateRound(0.6);
  while (leadOf(g.s, g.o) > T.WIN[330].low[0] / 1000 + 0.15) g.r.step(STEP);
  g.r.input('jump', true);
  while (!g.o.passed && !g.o.hit) g.r.step(STEP);
  assert.equal(g.o.hit, true, 'jumping into it is a bump');
  /* stage dive: jump early, press SLIDE in the air, slide on landing */
  g = gateRound(1.2);
  while (leadOf(g.s, g.o) > 0.75) g.r.step(STEP);
  g.r.input('jump', true);
  while (leadOf(g.s, g.o) > 0.32) g.r.step(STEP);
  assert.equal(g.s.onGround, false);
  g.r.input('slide', true); g.r.input('slide', false);
  assert.equal(g.s.diving, true); assert.ok(g.s.vy >= T.DIVE_V);
  while (!g.s.sliding && !g.o.hit) g.r.step(STEP);
  while (!g.o.passed && !g.o.hit) g.r.step(STEP);
  assert.equal(g.o.hit, false, 'a stage dive into a slide passes');
});

/* ================= the generator ================= */
test('runner: beat grid — every ideal take-off lands on its beat; spacing rules and counts hold on 1,000 seeds', () => {
  const finishBeat = T.FINISH_T / BEAT;
  for (let seed = 1; seed <= 1000; seed++) {
    const c = Course.buildCourse(seed);
    assert.equal(c.obs.length, 43, 'seed ' + seed + ' obstacles');
    const stars = c.items.filter(i => i.kind === 'star').length, shields = c.items.filter(i => i.kind === 'shield').length;
    const letters = c.items.filter(i => i.kind === 'letter').sort((a, b) => a.li - b.li).map(i => i.ch).join('');
    const snacks = c.items.filter(i => i.kind === 'snack').length;
    assert.equal(stars, 10, 'seed ' + seed + ' glow stars'); assert.equal(shields, 2); assert.equal(letters, 'ENCORE');
    assert.ok(snacks >= 180 && snacks <= 200, 'seed ' + seed + ' snacks ' + snacks);
    assert.equal(c.items.filter(i => i.kind === 'letter' && i.ch === 'C' && i.slide).length, 1, 'C sits under a gate');
    assert.equal(c.doors.length, 5);
    for (let i = 0; i < 43; i++) {
      const o = c.obs[i], v = SECTIONS[o.sec].v;
      const ideal = Course.schedTime(o.x + T.EDGE - v * o.mid - PR_OFF);
      assert.ok(Math.abs(ideal - o.beat * BEAT) <= STEP, `seed ${seed} obstacle ${i}: ideal take-off ${ideal.toFixed(4)} vs beat ${(o.beat * BEAT).toFixed(4)}`);
      const follow = (i < 42 ? c.obs[i + 1].beat : finishBeat) - o.beat;
      if (o.kind === 'stack') assert.ok(follow >= 4, `seed ${seed}: stack followed by ${follow}`);
      if (o.kind === 'hedge') assert.ok(follow >= 3, `seed ${seed}: hedge followed by ${follow}`);
      if (follow === 2) assert.ok(['low', 'log', 'bar', 'puddle'].includes(o.kind));
      const sp = o.item >= 0 ? c.items[o.item] : null;
      if (sp && (sp.kind === 'star' || o.move === 'dj' || o.move === 'boingdj')) assert.ok(follow >= 3, `seed ${seed}: special slot followed by ${follow}`);
      if (sp && o.kind === 'bar') assert.ok(sp.kind === 'letter' && sp.ch === 'C', `seed ${seed}: only C may sit on a gate`);
      if (sp && sp.kind === 'shield') assert.ok(o.kind !== 'bar' && o.kind !== 'stack' && (o.sec === 1 || o.sec === 3));
      assert.equal(o.rehearsal, o.sec === 0 || (o.sec === 2 && o.slot === 0));
      assert.ok(Math.abs(o.cueX - (o.x + T.EDGE - v * o.mid - T.PET_W / 2)) < 1e-9);
    }
    const sec2 = c.obs.filter(o => o.sec === 2);
    assert.equal(sec2[0].kind, 'bar', 'the Pre-Chorus opens with the rehearsal gate');
    assert.ok(c.obs.filter(o => o.sec === 4).every(o => o.kind === 'stack'), 'the Bounce Bridge is all cushions');
  }
});

test('runner: TUNING.WIN matches windows re-derived from the collision code (±2 ms)', () => {
  /* success = no contact (and a BOING for stacks) when taking off `ms` before the front reaches o.x+4 */
  function ok(v, kind, ms) {
    const secIdx = SECTIONS.findIndex(sc => sc.v === v);
    const course = custom([{ kind, sec: secIdx }]);
    const r = Course.newRound(api, 'course_meadow', { course, startAt: SECTIONS[secIdx].t0 + 2, fan: false });
    const o = course.obs[0];
    placeAhead(r, o, ms / 1000);
    r.step(STEP);                                         /* the boundary's own collision check sees it */
    if (o.hit) return false;
    if (kind === 'bar') { r.input('slide', true); r.input('slide', false); } else r.input('jump', true);
    for (let k = 0; k < 400 && !o.passed; k++) r.step(STEP);
    return kind === 'stack' ? o.bounced && !o.hit : !o.hit;
  }
  function edge(v, kind, a, b, wantFirst) {             /* binary search the success/failure boundary */
    while (b - a > 1) { const m = (a + b) >> 1; if (ok(v, kind, m) === wantFirst) b = m; else a = m; }
    return wantFirst ? b : a;
  }
  for (const v of [290, 310, 330, 350, 380]) {
    for (const kind of ['low', 'log', 'hedge', 'stack', 'puddle', 'bar']) {
      const w = T.WIN[v][kind], mid = Math.round((w[0] + w[1]) / 2);
      assert.ok(ok(v, kind, mid), `${kind} @${v}: the window midpoint clears`);
      const lo = edge(v, kind, -60, mid, true), hi = edge(v, kind, mid, 900, false);
      assert.ok(Math.abs(lo - w[0]) <= 2 && Math.abs(hi - w[1]) <= 2, `${kind} @${v}: derived ${lo}-${hi} ms vs table ${w[0]}-${w[1]}`);
      assert.equal(ok(v, kind, lo - 3), false, `${kind} @${v}: just early of the window fails`);
      assert.equal(ok(v, kind, hi + 3), false, `${kind} @${v}: just late of the window fails`);
    }
  }
});

test('runner: daily seeds — one chart per course per day, the same everywhere; cfg.seed overrides', () => {
  const sig = c => c.obs.map(o => o.kind + o.x).join(',') + '|' + c.items.map(i => i.kind + i.x + ':' + i.y).join(',');
  const s1 = Course.seedFor('2026-10-02', 'course_meadow');
  assert.ok(Number.isInteger(s1) && s1 > 0);
  assert.equal(s1, Course.seedFor('2026-10-02', 'course_meadow'));
  assert.equal(sig(Course.buildCourse(s1)), sig(Course.buildCourse(Course.seedFor('2026-10-02', 'course_meadow'))));
  assert.notEqual(sig(Course.buildCourse(s1)), sig(Course.buildCourse(Course.seedFor('2026-10-03', 'course_meadow'))), 'a new chart tomorrow');
  assert.notEqual(sig(Course.buildCourse(s1)), sig(Course.buildCourse(Course.seedFor('2026-10-02', 'course_beach'))), 'each course has its own chart');
  const a = Course.newRound(api, 'course_meadow', { day: '2026-10-02', fan: false });
  const b = Course.newRound(api, 'course_meadow', { day: '2026-10-02', fan: false });
  assert.equal(sig(a.course), sig(b.course), 'siblings race the same chart');
  assert.equal(sig(a.course), sig(Course.buildCourse(s1)));
  const c = Course.newRound(api, 'course_meadow', { day: '2026-10-02', seed: 2026, fan: false });
  assert.equal(sig(c.course), sig(Course.buildCourse(2026)), 'cfg.seed overrides the day');
});

test('runner: frame-rate independent — 30 fps and 144 fps give identical score, extra, treats and lag', () => {
  function runAt(fps, seed, mode) {
    const r = Course.newRound(api, 'course_candy', { seed, autoMode: mode, fan: false });
    let acc = 0, t = 0;
    while (!r.done && t < 200) {
      const dt = 1 / fps; t += dt; acc += dt;
      while (acc >= STEP) { r.autopilot(); r.step(STEP, {}); acc -= STEP; if (r.done) break; }
    }
    const res = r.result();
    return [res.score, res.extra, r.state.treats, r.state.lag.toFixed(9), r.state.stars].join(':');
  }
  for (const [seed, mode] of [[9, 'safe'], [21, 'showcase']]) assert.equal(runAt(30, seed, mode), runAt(144, seed, mode));
});

/* ================= three hearts, never regained =================
   The parent played it: "too easy… only 3 lives and no getting lives back". Every run (any
   variant, mode, course or start point) has exactly 3 hearts; nothing gives one back — not a
   Stage Door, not a pickup, not Timing rings (the old Fan support) — and the 3rd lost heart ends
   the show with the curtain call. Bubble-shield pickups stay: they block a bump, never add a heart. */
const PLAIN = ['low', 'log', 'hedge', 'stack'];
/* the safe autopilot, except it gives no input to the props of the listed sections until running
   into one has really cost something there (a heart; in the Rehearsal a free bonk). A held
   bubble shield can absorb a planned bump — then it simply tries the section's next plain prop. */
function bumper(secs) {
  const done = new Set();
  let target = -1, cost = 0;
  return (r) => {
    const s = r.state, obs = r.course.obs;
    if (target >= 0 && s.bumps + s.bonks > cost) { done.add(target); target = -1; }
    if (s.phase === 'run') {
      const i = nextObs(s, obs), o = i >= 0 ? obs[i] : null;
      if (o && secs.includes(o.sec) && !done.has(o.sec) && (o.sec === 0 || PLAIN.includes(o.kind))) {
        target = o.sec; cost = s.bumps + s.bonks;
        if (s.sliding && s.slideHeld) r.input('slide', false);
        return;
      }
    }
    r.autopilot();
  };
}
/* run to the end, checking every step: never more than 3 hearts, never a heart back, no heal */
function watchHearts(r, pilot, tag) {
  r.wantEvents = true; r.events = [];
  const s = r.state, w = { heal: 0, freeShield: 0, doors: 0, doorsHurt: 0, bumpSecs: new Set(), bonkSecs: new Set() };
  let prev = s.hearts, bumps = s.bumps, bonks = s.bonks, sec = s.section, t = 0;
  while (!r.done && t < 200) {
    if (pilot) pilot(r);
    r.step(STEP); t += STEP;
    assert.ok(s.hearts <= T.HEARTS && s.maxHearts === T.HEARTS, tag + ': never more than 3 hearts (' + s.hearts + '/' + s.maxHearts + ')');
    assert.ok(s.hearts <= prev, tag + ': hearts went back up ' + prev + ' → ' + s.hearts + ' at ' + t.toFixed(2) + ' s');
    assert.equal(s.hearts, Math.max(0, T.HEARTS - s.bumps), tag + ': a heart is lost per bump and never regained');
    if (s.bumps > bumps) w.bumpSecs.add(s.section);
    if (s.bonks > bonks) w.bonkSecs.add(s.section);
    if (s.section !== sec && s.section <= 5) {            /* a Stage Door (6 = the Encore): hearts untouched */
      w.doors++; if (s.hearts < T.HEARTS) w.doorsHurt++;
      assert.equal(s.hearts, prev, tag + ': the ' + Course.SECTIONS[s.section].name + ' door changed the hearts');
      const hs = r.hud().split(' · ')[0];
      assert.equal([...hs].length, T.HEARTS, tag + ': the HUD line shows 3 heart slots');
      assert.equal([...hs].filter((c) => c === '❤').length, s.hearts);
    }
    for (const e of r.events) { if (e.type === 'heal') w.heal++; if (e.type === 'shieldGet' && e.free) w.freeShield++; }
    r.events.length = 0;
    prev = s.hearts; bumps = s.bumps; bonks = s.bonks; sec = s.section;
  }
  assert.equal(w.heal, 0, tag + ': no heal event');
  assert.equal(w.freeShield, 0, tag + ': no free shield');
  return w;
}

test('three hearts: full runs with a bump in every section never show more than 3 hearts or one coming back', () => {
  const cover = new Set();
  let doorsHurt = 0, runs = 0;
  VARIANTS.forEach((variant, vi) => {
    for (let k = 1; k <= 5; k++) {
      const seed = vi * 1000 + k;
      for (const secs of [[0, 1, 2], [3, 4], [5], [1, 5], [2, 4]]) {
        for (const fan of [false, true]) {
          const tag = `${variant} seed ${seed} miss ${secs.join('+')}${fan ? ' rings' : ''}`;
          const r = Course.newRound(api, variant, { seed, fan });
          assert.equal(r.state.hearts, 3, tag + ' starts with 3');
          const w = watchHearts(r, bumper(secs), tag);
          const s = r.state;
          runs++; doorsHurt += w.doorsHurt;
          w.bumpSecs.forEach((x) => cover.add(x)); if (w.bonkSecs.has(0)) cover.add(0);
          assert.ok(s.bumps <= 2, tag + ': only the planned bumps (' + s.bumps + ')');
          assert.equal(s.finished, true, tag + ' finished on ' + s.hearts + ' heart(s)');
          assert.equal(s.hearts, 3 - s.bumps);
          assert.equal(w.doors, 5, tag + ': through all 5 Stage Doors');
        }
      }
    }
  });
  assert.deepEqual([...cover].sort(), [0, 1, 2, 3, 4, 5], 'a real bump (a free bonk in the Rehearsal) in every section');
  assert.ok(doorsHurt >= runs, 'hundreds of Stage Doors passed below 3 hearts, none healed (' + doorsHurt + ')');
});

test('three hearts: every Stage Door leaves the hearts (and the shield) exactly as they were', () => {
  for (const fan of [false, true]) {
    for (let sec = 1; sec <= 5; sec++) {
      for (const hearts of [1, 2, 3]) {
        const tag = `door ${sec} at ${hearts} heart(s)${fan ? ' rings' : ''}`;
        const r = Course.newRound(api, 'course_meadow', { course: custom([]), startAt: SECTIONS[sec].t0 - 0.2, fan });
        const s = r.state;
        r.wantEvents = true; r.events = [];
        s.hearts = hearts;
        while (s.section < sec) r.step(STEP);
        assert.equal(s.hearts, hearts, tag + ': hearts unchanged');
        assert.equal(s.shield, false, tag + ': no free bubble shield');
        assert.equal(r.events.filter((e) => e.type === 'door').length, 1, tag + ': the door itself still fires');
        assert.ok(!r.events.some((e) => e.type === 'heal' || e.type === 'shieldGet'), tag + ': ' + JSON.stringify(r.events.map((e) => e.type)));
      }
    }
  }
  /* a pet that collected a bubble shield keeps exactly that one shield through a door */
  const r = Course.newRound(api, 'course_meadow', { course: custom([]), startAt: SECTIONS[3].t0 - 0.2, fan: false });
  r.state.shield = true; r.state.hearts = 2;
  while (r.state.section < 3) r.step(STEP);
  assert.equal(r.state.shield, true); assert.equal(r.state.hearts, 2);
});

test('three hearts: Timing rings ON — 3 hearts, no free shield anywhere, only the timing-ring cues', () => {
  for (const variant of VARIANTS) {
    for (const seed of [3, 17]) {
      const tag = `${variant} seed ${seed}`;
      const r = Course.newRound(api, variant, { seed, fan: true });
      const s = r.state;
      assert.equal(s.rings, true, tag + ': the timing-ring flag is set');
      assert.equal(s.hearts, 3); assert.equal(s.maxHearts, 3); assert.equal(s.shield, false);
      assert.ok(r.course.obs.every((o) => o.cue), tag + ': a cue ring on every prop');
      const off = Course.newRound(api, variant, { seed, fan: false });
      assert.equal(off.state.rings, false);
      assert.deepEqual(off.course.obs.filter((o) => o.cue).map((o) => o.index), off.course.obs.filter((o) => o.rehearsal).map((o) => o.index), tag + ': rings off: rehearsal cues only');
      /* the safe autopilot through the whole show: every shield it ever holds is a course pickup */
      r.wantEvents = true; r.events = [];
      let gets = 0, t = 0;
      while (!r.done && t < 200) {
        r.autopilot(); r.step(STEP); t += STEP;
        for (const e of r.events) if (e.type === 'shieldGet') { gets++; assert.ok(!e.free, tag + ': a free shield'); }
        r.events.length = 0;
        assert.equal(s.hearts, 3);
      }
      const pickups = r.course.items.filter((it) => it.kind === 'shield');
      assert.equal(pickups.length, 2, tag + ': the Verse and Chorus shield pickups are still on the course');
      assert.equal(gets, pickups.filter((it) => it.got).length, tag + ': shields only from pickups');
      assert.equal(Course.decodeExtra(r.result().extra).fan, true, tag + ': extra bit 16 still says the assist was on');
    }
  }
  /* an empty stage, rings on, start to finish: no shield ever appears */
  const e = Course.newRound(api, 'course_meadow', { course: custom([]), fan: true });
  while (!e.state.finished) { e.step(STEP); assert.equal(e.state.shield, false); assert.equal(e.state.hearts, 3); }
  assert.equal(e.summaryText().endsWith('❤❤❤ left · 🎯 with Timing rings'), true, e.summaryText());
});

test('three hearts: the assist is OFF for a first run and for a legacy (V4.53 Fan support) session value', () => {
  const d = Course.def;
  /* a child's very first Debut Run (tutorial not seen yet) */
  const first = { tutSeen: false, profileKey: 'lives-first' };
  assert.equal(Course.ringsFor(first), false);
  assert.equal(d.menuOptions(first)[0].value, false);
  const r1 = Course.newRound(api, 'course_meadow', Object.assign({ seed: 3 }, first));
  assert.equal(r1.state.rings, false); assert.equal(r1.state.hearts, 3); assert.equal(r1.state.maxHearts, 3);
  assert.ok(r1.course.obs.every((o) => o.cue === o.rehearsal), 'cue rings on the rehearsal props only');
  assert.equal(d.tutorial.length, 4, 'no assist card');
  /* session memory left in V4.53's shape: Fan support switched ON by itself (first run), by hand,
     or after 2 curtain calls — all read as OFF now, and the legacy fields are gone */
  for (const legacy of [{ fan: true, manual: false, curtains: 0 }, { fan: true, manual: true, curtains: 0 }, { fan: true, manual: true, curtains: 2 }, { fan: null, manual: false, curtains: 1 }]) {
    const cfg = { tutSeen: true, profileKey: 'lives-legacy-' + JSON.stringify(legacy) };
    const m = Course._session(cfg);
    for (const k of Object.keys(m)) delete m[k];
    Object.assign(m, legacy);
    assert.equal(Course.ringsFor(cfg), false, JSON.stringify(legacy));
    assert.ok(!('fan' in m) && !('manual' in m) && !('curtains' in m), 'migrated: ' + JSON.stringify(m));
    assert.equal(d.menuOptions(cfg)[0].value, false);
    const r = Course.newRound(api, 'course_meadow', Object.assign({ seed: 3 }, cfg));
    assert.equal(r.state.rings, false); assert.equal(r.state.hearts, 3);
    /* the stored option id still works: 'fan' (the chip) switches the rings on, and nothing else */
    d.setOption(cfg, 'fan', true);
    assert.equal(Course.ringsFor(cfg), true);
    const on = Course.newRound(api, 'course_meadow', Object.assign({ seed: 3 }, cfg));
    assert.equal(on.state.rings, true); assert.equal(on.state.hearts, 3); assert.equal(on.state.shield, false);
    d.menuOptions(cfg);
    assert.equal(d.tutorial.length, 5, 'rings on: the 🎯 card');
    d.setOption(cfg, 'fan', false);
  }
  d.menuOptions(first);                                      /* leave the shell's shown cfg on a rings-off child */
  d.setOption({ profileKey: 'lives-alias' }, 'rings', true);
  assert.equal(Course.ringsFor({ profileKey: 'lives-alias' }), true, "'rings' is accepted as an alias");
  /* the shop demo never has them */
  assert.equal(Course.ringsFor({ demo: true, fan: true }), false);
});

test('three hearts: losing the 3rd heart ends the run with the curtain call (and not a moment before)', () => {
  /* four plain props in the Verse, 1,200 px apart (clear of the 1.4 s grace), no input */
  const course = custom([{ kind: 'hedge', sec: 1 }, { kind: 'log', sec: 1 }, { kind: 'low', sec: 1 }, { kind: 'hedge', sec: 1 }]);
  for (const fan of [false, true]) {
    for (const o of course.obs) Object.assign(o, { hit: false, passed: false, hitT: 0, judge: 0 });
    const r = Course.newRound(api, 'course_meadow', { course, startAt: SECTIONS[1].t0 + 3, fan });
    const s = r.state;
    r.wantEvents = true; r.events = [];
    placeAhead(r, course.obs[0], 0.5);
    for (let k = 1; k < 4; k++) course.obs[k].x = course.obs[0].x + 1200 * k;
    const seen = [];
    let curtainAt = -1, n = 0;
    while (!r.done && n++ < 120 * 30) {
      r.step(STEP);
      for (const e of r.events) { seen.push(e.type); if (e.type === 'curtain') curtainAt = s.bumps; }
      r.events.length = 0;
      if (s.bumps < 3) { assert.equal(s.phase, 'run', 'still running on ' + s.hearts + ' heart(s)'); assert.equal(s.curtain, false); }
    }
    assert.equal(r.done, true);
    assert.equal(s.bumps, 3, 'exactly 3 bumps'); assert.equal(s.hearts, 0);
    assert.equal(curtainAt, 3, 'the curtain falls on the 3rd bump');
    assert.equal(seen.filter((t) => t === 'curtain').length, 1);
    assert.equal(seen.filter((t) => t === 'lastHeart').length, 1, 'one last-heart warning, after the 2nd bump');
    assert.equal(course.obs[3].hit, false, 'the show was over before the 4th prop');
    assert.equal(s.curtain, true); assert.equal(s.finished, false);
    assert.equal(r.summaryTitle(), 'CURTAIN CALL!');
    assert.equal(Course.decodeExtra(r.result().extra).medal, 0, 'Trainee ribbon');
  }
  /* on a real course: a pilot that runs into a prop in every section from the Verse on is
     curtain-called at its 3rd real bump, wherever that falls */
  for (const [variant, seed] of [['course_meadow', 3], ['course_snow', 2005], ['course_candy', 3002]]) {
    const r = Course.newRound(api, variant, { seed, fan: false });
    const w = watchHearts(r, bumper([1, 2, 3, 4, 5]), variant + ' ' + seed);
    assert.equal(r.state.curtain, true); assert.equal(r.state.bumps, 3); assert.equal(r.state.finished, false);
    assert.ok(w.doorsHurt >= 1, 'a door was passed with hearts missing');
  }
});

/* ================= controls ================= */
test('runner: double jump works, buffered jumps fire on landing, and a tumble ignores input for 0.3 s then buffers it', () => {
  const r = Course.newRound(api, 'course_meadow', { seed: 3, fan: false });
  const s = r.state;
  r.input('jump', true); r.step(STEP);
  assert.equal(s.onGround, false);
  for (let i = 0; i < 20; i++) r.step(STEP);
  r.input('jump', true);
  assert.equal(s.airJumps, 0, 'double jump used');
  assert.ok(s.vy < 0);
  while (s.vy < 0) r.step(STEP);
  while (-s.y > 30) r.step(STEP);
  r.input('jump', true);                                 /* no air jumps left: buffered */
  assert.ok(s.buffer > 0 && s.ready, 'buffered with a ready sparkle');
  let jumped = false;
  for (let i = 0; i < 20 && !jumped; i++) { const wasGround = s.onGround; r.step(STEP); jumped = wasGround && !s.onGround; }
  assert.equal(jumped, true, 'the buffered press fired on touchdown');

  /* tumble: the first 0.3 s ignore input; later presses are buffered to the landing */
  const course = custom([{ kind: 'log', sec: 1 }]);
  const r2 = Course.newRound(api, 'course_meadow', { course, startAt: SECTIONS[1].t0 + 3, fan: false });
  const s2 = r2.state;
  placeAhead(r2, course.obs[0], 0.3);
  while (!course.obs[0].hit) r2.step(STEP);
  assert.equal(s2.eff, 'tumble');
  r2.step(STEP);
  const vy = s2.vy;
  r2.input('jump', true); r2.input('slide', true);
  assert.equal(s2.vy, vy, 'ignored during the first 0.3 s'); assert.equal(s2.buffer, 0); assert.equal(s2.diving, false);
  assert.equal(r2.padState('jump'), 'grey');
  while (s2.effT < T.IGNORE_T + 0.02) r2.step(STEP);
  assert.equal(s2.onGround, false, 'still in the air after the pop');
  r2.input('jump', true);
  assert.ok(s2.ready && s2.buffer > 0, 'buffered after 0.3 s');
  assert.equal(r2.padState('jump'), 'ready');
  let fired = false;
  for (let i = 0; i < 120 && !fired; i++) { const g = s2.onGround; r2.step(STEP); fired = g && !s2.onGround && s2.vy < 0; }
  assert.equal(fired, true, 'fires on landing');
});

/* ================= scoring + rules ================= */
test('runner: scoring — finish bonus capped at 3 hearts, score clamp, extra round-trips, Hype tiers, FEVER ends', () => {
  function finishOn(fan, hearts) {
    const r = Course.newRound(api, 'course_meadow', { course: custom([]), startAt: T.FINISH_T - 0.3, fan });
    if (hearts != null) r.state.hearts = hearts;
    while (!r.state.finished) r.step(STEP);
    return r.state.score;
  }
  assert.equal(T.BONUS_HEARTS, 3);
  assert.equal(finishOn(true, 5), 250 + 150, 'never more than 3 hearts’ worth, even from a tampered state');
  assert.equal(finishOn(false, null), 400, 'a full house: 250 + 3 x 50');
  assert.equal(finishOn(true, null), 400, 'Timing rings: the same bonus');
  assert.equal(finishOn(false, 3), 400);
  assert.equal(finishOn(false, 1), 300);
  const r = Course.newRound(api, 'course_meadow', { seed: 1, fan: false });
  r.state.score = 12345;
  assert.equal(r.result().score, 5000, 'the score never exceeds 5,000');
  assert.ok(C.validResult('course', r.result()));
  for (let medal = 0; medal <= 4; medal++) {
    for (const letters of [0, 1, 7, 21, 42, 63]) {
      for (const maxHype of [0, 1, 31, 32, 100, 127]) {
        for (const fan of [false, true]) {
          const n = Course.encodeExtra({ medal, letters, maxHype, fan });
          assert.ok(Number.isInteger(n) && n >= 0 && n <= 131071);
          assert.deepEqual(Course.decodeExtra(n), { medal, letters, maxHype, fan });
        }
      }
    }
  }
  assert.equal(Course.decodeExtra(Course.encodeExtra({ medal: 2, letters: 5, maxHype: 400, fan: false })).maxHype, 127, 'maxHype capped');
  assert.deepEqual([7, 8, 19, 20, 31, 32, 60].map(Course.tierOf), [1, 2, 2, 3, 3, 4, 4]);
  /* FEVER ends on a bump, and on a splash that drops Hype below 32 (but not one that doesn't) */
  function hitWith(kind, hype) {
    const course = custom([{ kind, sec: 3 }]);
    const r2 = Course.newRound(api, 'course_meadow', { course, startAt: SECTIONS[3].t0 + 3, fan: false });
    Object.assign(r2.state, { hype, maxHype: hype, mult: Course.tierOf(hype), fever: hype >= 32 });
    placeAhead(r2, course.obs[0], 0.5);
    while (!course.obs[0].hit) r2.step(STEP);
    return r2.state;
  }
  assert.equal(hitWith('log', 45).fever, false, 'a bump ends FEVER');
  assert.equal(hitWith('puddle', 45).fever, false, 'a splash to 22 ends FEVER');
  const keep = hitWith('puddle', 70);
  assert.equal(keep.hype, 35); assert.equal(keep.fever, true, 'a splash that stays ≥ 32 keeps FEVER');
});

test('runner: medals by score and run; results text, badges, curtain call and time-up', () => {
  assert.equal(Course.medal(4000, false, false), 0, 'curtain call / time-up: Trainee');
  assert.equal(Course.medal(100, true, false), 1);
  assert.equal(Course.medal(1999, true, false), 1);
  assert.equal(Course.medal(2000, true, false), 2);
  assert.equal(Course.medal(2799, true, true), 2, 'the Encore alone is not the crown');
  assert.equal(Course.medal(2800, true, false), 3);
  assert.equal(Course.medal(2800, true, true), 4);
  /* finished runs below Gold get a next-medal nudge (seeded ±150 ms kids: seed 70 = Silver, 6 = Bronze;
     V4.53 used 71 for Bronze, which is a curtain call now that hearts never come back) */
  const silver = play('course_meadow', { seed: 70 }, kid(150, 70)).r;
  assert.equal(Course.decodeExtra(silver.result().extra).medal, 2);
  const sb = silver.summaryBadges();
  assert.deepEqual(sb[0], { text: '🥈 Rising Star', kind: 'silver' });
  assert.ok(sb.some(b => b.kind === 'hint' && b.text === 'Only ' + (2800 - silver.result().score) + ' to GOLD!'), JSON.stringify(sb));
  assert.ok(sb.filter(b => /^Missed /.test(b.text)).length <= 2, 'at most 2 missed-letter hints');
  assert.equal(silver.summaryTitle(), 'SHOW COMPLETE!');
  assert.match(silver.summaryText(), /^🦴 \d+ treats · ✦ \d+ glow stars? · [ENCORE_ ]{11} · Best Hype \d+ · [❤🤍]+ left$/u);
  const bronze = play('course_meadow', { seed: 6 }, kid(150, 6)).r;
  assert.equal(bronze.summaryBadges()[0].kind, 'bronze');
  assert.ok(bronze.summaryBadges().some(b => b.text === 'Only ' + (2000 - bronze.result().score) + ' to SILVER!'));
  /* it limped home on its last heart: the results say so, and no badge offers help or hearts */
  assert.equal(bronze.state.hearts, 1);
  assert.ok(bronze.summaryText().endsWith(' · ❤🤍🤍 left'), bronze.summaryText());
  assert.ok(!bronze.summaryBadges().some(b => /Fan support|heart|🎟️/i.test(b.text)), JSON.stringify(bronze.summaryBadges()));
  assert.ok(!/⭐|🌟/.test(silver.hud() + silver.summaryText()), 'glow stars use ✦, never the reward star');
  assert.match(silver.summaryBig(), /^Score [\d,]+$/);
  /* a curtain call keeps what was earned, with the Trainee ribbon */
  const cc = play('course_meadow', { seed: 4 }, kid(260, 4));
  assert.equal(cc.s.curtain, true);
  assert.ok(cc.r.result().score > 0, 'earned points are kept');
  assert.equal(cc.r.summaryTitle(), 'CURTAIN CALL!');
  assert.match(cc.r.summaryText(), /^You reached the [A-Z -]+ \(\d+%\)\. Next time: the [A-Z -]+!$/);
  assert.equal(Course.decodeExtra(cc.r.result().extra).medal, 0);
  assert.deepEqual(cc.r.summaryBadges()[0], { text: '🎀 Trainee', kind: 'ribbon' });
  /* an arcade hard stop: the score so far with medal 0 */
  const tu = Course.newRound(api, 'course_meadow', { seed: 6, fan: false });
  for (let i = 0; i < 120 * 20; i++) { tu.autopilot(); tu.step(STEP); }
  tu.forceEnd();
  assert.equal(tu.done, true);
  assert.equal(tu.summaryTitle(), 'Time’s up!');
  assert.ok(C.validResult('course', tu.result()));
  assert.equal(Course.decodeExtra(tu.result().extra).medal, 0);
  assert.ok(tu.result().score > 0);
});

test('runner: spilled treats fly out, land, can be won back (+1 treat, +3) and poof; the pool never grows', () => {
  const course = custom([{ kind: 'hedge', sec: 1 }, { kind: 'log', sec: 1 }]);
  const r = Course.newRound(api, 'course_meadow', { course, startAt: SECTIONS[1].t0 + 3, fan: false });
  const s = r.state;
  s.treats = 20;
  placeAhead(r, course.obs[0], 0.4);
  course.obs[1].x = course.obs[0].x + 3200;
  while (!course.obs[0].hit) r.step(STEP);
  assert.equal(s.spill.length, T.SPILL_POOL);
  assert.equal(s.spill.filter(q => q.on).length, 8);
  const xs = s.spill.filter(q => q.on).map(q => q.vx);
  assert.equal(Math.min(...xs), T.SPILL_VX0); assert.equal(Math.max(...xs), T.SPILL_VX0 + T.SPILL_VXR);
  let landed = false;
  for (let i = 0; i < 240; i++) { r.step(STEP); if (s.spill.some(q => q.on && q.landed)) { landed = true; assert.ok(s.spill.filter(q => q.on && q.landed).every(q => q.y === T.GROUND - T.SPILL_Y)); } }
  assert.ok(landed, 'spilled treats land');
  assert.ok(s.regrabs >= 1, 'running on wins some back');
  assert.equal(s.treats, 12 + s.regrabs);
  for (let i = 0; i < 240; i++) r.step(STEP);
  assert.equal(s.spill.filter(q => q.on).length, 0, 'the rest poof');
  /* with the pool full, a new spill overwrites the oldest slots (fixed pool: no allocation) */
  const o1 = course.obs[1];
  s.treats = 8;
  while (o1.x + T.EDGE - (s.dist + PR_OFF) > 4) r.step(STEP);
  s.spill.forEach(q => Object.assign(q, { on: true, landed: true, landT: 0, age: 0.5, x: -9999, y: T.GROUND - T.SPILL_Y }));
  const next = s.spillNext;
  while (!o1.hit) r.step(STEP);
  assert.equal(s.spill.length, T.SPILL_POOL);
  const fresh = s.spill.map((q, i) => q.on && q.age < 0.05 ? i : -1).filter(i => i >= 0);
  assert.deepEqual(fresh, Array.from({ length: 8 }, (_, k) => (next + k) % T.SPILL_POOL).sort((a, b) => a - b), 'the 8 oldest slots were reused in ring order');
  assert.equal(s.spill.filter(q => q.on).length, T.SPILL_POOL, 'the other 3 are still out');
});

/* ================= events ================= */
test('runner: events are only pushed while wantEvents; the safe event stream for seed 3 is stable', () => {
  const quiet = play('course_meadow', { seed: 3 }, auto);
  assert.equal(quiet.r.events.length, 0, 'Node runs never accumulate events');
  const r = Course.newRound(api, 'course_meadow', { seed: 3, fan: false });
  r.wantEvents = true;
  const types = [];
  let t = 0;
  while (!r.done && t < 200) { r.autopilot(); r.step(STEP); t += STEP; for (const e of r.events) types.push(e.type); r.events.length = 0; }
  let h = 0x811c9dc5;
  const str = types.join(',');
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  const count = (ty) => types.filter(x => x === ty).length;
  assert.equal(count('door'), 5); assert.equal(count('finish'), 1); assert.equal(count('bump'), 0);
  assert.equal(count('takeoff') + count('slide'), 43, 'one move per obstacle');
  assert.equal(count('clear'), 43);
  assert.equal(count('fever'), 1, 'FEVER once, kept to the end');
  assert.ok(types.length / t <= 10, 'at most 10 events a second: ' + (types.length / t).toFixed(1));
  assert.equal(types.length + ':' + h.toString(16), EVENT_SNAPSHOT, 'event stream snapshot');
});
const EVENT_SNAPSHOT = '340:99da0bec';                 /* event count : FNV-1a of the type sequence */

/* ================= shell wiring (data only — the shell itself has no Node tests) ================= */
test('runner: def wiring — count-in, two verbs, 3D view src, tutorial key cards, Timing rings chip, PB medal line', () => {
  const d = Course.def;
  assert.equal(d.key, 'course'); assert.equal(d.title, 'Debut Run'); assert.equal(d.LW, 960); assert.equal(d.LH, 540);
  assert.deepEqual(d.countIn, { beats: 4, bpm: 128, labels: ['5', '6', '7', '8!'] });
  assert.equal(d.view3d.src, 'world/games/pet-course-3d.js');
  assert.deepEqual(d.music, { track: 'course' });
  assert.deepEqual(d.controls.map(c => c.id), ['slide', 'jump']);
  for (const k of [' ', 'ArrowUp', 'w', 'W', 'Enter']) assert.equal(d.keys[k], 'jump');
  for (const k of ['ArrowDown', 's', 'S']) assert.equal(d.keys[k], 'slide');
  assert.equal(d.tapAction, 'jump');
  assert.equal(d.tutorial.length, 4);
  assert.ok(!/⭐|🌟/.test(JSON.stringify(d.tutorial)));
  /* Timing rings (chip id 'fan', kept from V4.53): OFF by default — a very first run included —
     and a manual toggle sticks; ON, they still leave 3 hearts */
  const first = { tutSeen: false, profileKey: 'kidA' }, later = { tutSeen: true, profileKey: 'kidB' };
  assert.equal(d.menuOptions(first)[0].id, 'fan');
  assert.equal(d.menuOptions(first)[0].value, false);
  assert.equal(d.menuOptions(later)[0].value, false);
  d.setOption(later, 'fan', true);
  assert.equal(d.menuOptions(later)[0].value, true);
  assert.equal(Course.newRound(api, 'course_meadow', Object.assign({ seed: 1 }, later)).state.maxHearts, 3);
  d.setOption(later, 'fan', false);
  assert.equal(d.menuOptions(later)[0].value, false);
  /* two curtain calls in a row no longer switch anything on */
  const kidC = { tutSeen: true, profileKey: 'kidC' };
  for (let k = 0; k < 2; k++) {
    const r = Course.newRound(api, 'course_meadow', Object.assign({ seed: 5 }, kidC));
    while (!r.done) r.step(STEP);
    assert.equal(r.state.curtain, true);
    if (r.onFinish) r.onFinish();                           /* the shell calls it when present */
    assert.ok(!r.summaryBadges().some(b => /Fan support|Timing rings/.test(b.text)));
  }
  assert.equal(d.menuOptions(kidC)[0].value, false);
  assert.equal(Course.newRound(api, 'course_meadow', Object.assign({ seed: 5 }, kidC)).state.hearts, 3);
  assert.ok(d.pbText({ score: 2995, extra: Course.encodeExtra({ medal: 3, letters: 0, maxHype: 41, fan: false }) }).includes('score 2,995 · 🥇 Superstar'));
  assert.ok(d.pbText({ score: 120 }).startsWith('🏆 Your best: score 120'));
});

/* the v2 copy voice holds in the games too (plan-v2 'Ban list in island and game UI'):
   every displayed string literal in world/games/*.js — anything with a capital or a
   space, so event / sound ids like 'boing' stay code — is free of the banned words */
test('copy: no game shows a banned word (the cushion bounce reads BOUNCE!, never BOING!)', () => {
  const fs = require('node:fs'), path = require('node:path');
  const W = require('../world/world-copy.js');
  const dir = path.join(__dirname, '..', 'world', 'games');
  const hits = [];
  let n = 0;
  for (const f of fs.readdirSync(dir).filter((x) => /\.js$/.test(x))) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/mg, '');
    for (const lit of src.match(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g) || []) {
      const t = lit.slice(1, -1);
      if (!/[A-Z ]/.test(t)) continue;
      n++;
      const b = W.bannedIn(t);
      if (b.length) hits.push(f + ': ' + t.slice(0, 60) + ' → ' + b.join(', '));
    }
  }
  assert.ok(n > 200, 'the scan found the games\' strings (' + n + ')');
  assert.deepEqual(hits, []);
  /* the Debut Run's own lines: the bounce fx and the missed-letter hint */
  const src = fs.readFileSync(path.join(dir, 'pet-course.js'), 'utf8');
  assert.ok(src.includes("fx.text(px, feet - 40, 'BOUNCE!'"), 'the 2D cushion bounce matches the HUD pop');
});
