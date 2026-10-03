'use strict';
/* My Island audio: world/music.js (Pocket Band, scheduling, beat-lock, manifest,
   settings, the engine against a fake AudioContext) and world/sound.js (the
   shell's named set, pet voices, pan, mute, ducking). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const M = require('../world/music.js');
const S = require('../world/sound.js');

const close = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= (eps == null ? 1e-9 : eps), (msg || '') + ` ${a} vs ${b}`);
const flush = async (n = 6) => { for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r)); };

/* ---------------- a small fake Web Audio implementation ---------------- */
class FakeParam {
  constructor(v) { this.value = v; this.ev = []; }
  setValueAtTime(v, t) { this.ev.push({ k: 'set', v, t }); return this; }
  linearRampToValueAtTime(v, t) { this.ev.push({ k: 'lin', v, t }); return this; }
  exponentialRampToValueAtTime(v, t) { if (!(v > 0)) throw new RangeError('exponential ramp to ' + v); this.ev.push({ k: 'exp', v, t }); return this; }
  setTargetAtTime(v, t) { this.ev.push({ k: 'set', v, t }); return this; }
  cancelScheduledValues(t) { this.ev = this.ev.filter(e => e.t < t); return this; }
  at(x) {                                   /* the automation value at time x */
    const evs = this.ev.slice().sort((a, b) => a.t - b.t);
    let v = this.value, lastT = -Infinity;
    for (const e of evs) {
      if (e.t <= x) { v = e.v; lastT = e.t; continue; }
      if (e.k === 'set') break;
      const k = lastT === -Infinity ? 1 : (x - lastT) / (e.t - lastT);
      return e.k === 'exp' && v > 0 ? v * Math.pow(e.v / v, k) : v + (e.v - v) * k;
    }
    return v;
  }
}
class FakeNode {
  constructor(ctx, kind) { this.ctx = ctx; this.kind = kind; this.outs = []; ctx.nodes.push(this); }
  connect(n) { this.outs.push(n); return n; }
  disconnect() { this.outs = []; }
}
class FakeCtx {
  constructor() {
    this.currentTime = 10; this.sampleRate = 44100; this.state = 'running';
    this.nodes = []; this.starts = []; this.destination = new FakeNode(this, 'destination');
  }
  createGain() { const n = new FakeNode(this, 'gain'); n.gain = new FakeParam(1); return n; }
  createBiquadFilter() { const n = new FakeNode(this, 'biquad'); n.type = 'lowpass'; n.frequency = new FakeParam(350); n.Q = new FakeParam(1); n.gain = new FakeParam(0); return n; }
  createOscillator() {
    const n = new FakeNode(this, 'osc'); n.type = 'sine'; n.frequency = new FakeParam(440); n.detune = new FakeParam(0);
    n.start = t => { this.starts.push({ node: n, t, kind: 'osc', f: n.frequency.ev.length ? n.frequency.ev[0].v : n.frequency.value }); };
    n.stop = () => {}; return n;
  }
  createBufferSource() {
    const n = new FakeNode(this, 'src'); n.loop = false; n.loopStart = 0; n.loopEnd = 0; n.buffer = null; n.stopped = null;
    n.start = (t, off) => { this.starts.push({ node: n, t, off, kind: 'src', buffer: n.buffer }); };
    n.stop = t => { n.stopped = t; }; return n;
  }
  createBuffer(ch, len, sr) { return { duration: len / sr, getChannelData: () => new Float32Array(len) }; }
  createDynamicsCompressor() { const n = new FakeNode(this, 'comp'); for (const k of ['threshold', 'knee', 'ratio', 'attack', 'release']) n[k] = new FakeParam(0); return n; }
  createDelay() { const n = new FakeNode(this, 'delay'); n.delayTime = new FakeParam(0); return n; }
  createStereoPanner() { const n = new FakeNode(this, 'pan'); n.pan = new FakeParam(0); return n; }
  decodeAudioData(ab, ok) { const buf = { duration: ab.duration, url: ab.url, getChannelData: () => new Float32Array(1) }; if (ok) ok(buf); return Promise.resolve(buf); }
  resume() { this.state = 'running'; return Promise.resolve(); }
}
function memStorage(throwing) {
  const m = new Map();
  return {
    getItem: k => { if (throwing) throw new Error('blocked'); return m.has(k) ? m.get(k) : null; },
    setItem: (k, v) => { if (throwing) throw new Error('blocked'); m.set(k, String(v)); },
    map: m
  };
}
/* an engine on a fake context; time moves only when the test says so */
function rig(o = {}) {
  const ctx = new FakeCtx();
  const st = { muted: false, activated: false, ctxCalls: 0, fetched: [] };
  const storage = o.storage || memStorage();
  const env = {
    g: o.g || {},
    ctx: () => { st.ctxCalls++; return ctx; },
    now: () => ctx.currentTime + 500,
    storage: () => storage,
    fetchJSON: url => { st.fetched.push(url); return o.manifest === undefined ? Promise.reject(new Error('404')) : Promise.resolve(o.manifest); },
    fetchBuf: url => { st.fetched.push(url); return Promise.resolve({ url, duration: (o.durations && o.durations[url]) || 40 }); },
    setInterval: () => 1, clearInterval: () => {}, setTimeout: () => 0,
    activated: () => st.activated,
    hidden: () => false,
    mutedDefault: () => st.muted
  };
  const eng = M.createEngine(env);
  const run = (sec, onTick) => {
    const n = Math.round(sec / 0.025);
    for (let i = 0; i < n; i++) { ctx.currentTime += 0.025; if (onTick) onTick(); eng._tick(); }
  };
  return { ctx, eng, st, storage, run };
}
/* kicks are sine oscillators whose pitch starts at 150 Hz */
const kicksOf = ctx => ctx.starts.filter(s => s.kind === 'osc' && s.f === 150 && s.node.type === 'sine').map(s => s.t);
/* the count-in stick is the local _tap: a sine ping at 0.62 x 2600 Hz */
const sticksOf = ctx => ctx.starts.filter(s => s.kind === 'osc' && Math.abs(s.f - 2600 * 0.62) < 0.01).map(s => s.t);
const oscCount = ctx => ctx.starts.filter(s => s.kind === 'osc').length;

/* ================================================================
   PURE: tracks, loops, harmony, patterns
   ================================================================ */
test('tracks match the art bible: BPM, key, mood, progression', () => {
  const want = {
    island_day: [100, 'F major', ['Bbmaj7', 'C7', 'Am7', 'Dm7']], island_showtime: [118, 'Bb major', ['Eb', 'F', 'Dm', 'Gm']],
    shop: [92, 'D major', ['Gmaj7', 'A', 'F#m7', 'Bm7']], course: [128, 'C major', ['F', 'G', 'Em', 'Am']],
    penalty: [112, 'G major', ['C', 'D', 'Bm', 'Em']], kart: [140, 'A minor', ['Am', 'F', 'C', 'G']]
  };
  assert.deepEqual(M.TRACK_IDS.slice().sort(), Object.keys(want).sort());
  for (const id in want) {
    const T = M.TRACKS[id];
    assert.equal(T.bpm, want[id][0], id);
    assert.equal(T.key, want[id][1], id);
    assert.deepEqual(T.chords, want[id][2], id);
    assert.ok(typeof T.mood === 'string' && T.mood.length > 8, id + ' has a mood');
  }
  assert.deepEqual(M.TRACKS.course.encoreChords, ['Eb', 'F', 'Dm', 'Gm']);
});

test('loop lengths: 16 bars at 100 = 38.4 s, 118 ~ 32.5, 92 ~ 41.7; 32 at 128 = 60, 16 at 112 ~ 34.3, 32 at 140 ~ 54.9', () => {
  close(M.loopSeconds(100, 16), 38.4, 1e-9);
  close(M.loopSeconds(118, 16), 32.5, 0.05);
  close(M.loopSeconds(92, 16), 41.7, 0.05);
  close(M.loopSeconds(128, 32), 60, 1e-9);
  close(M.loopSeconds(112, 16), 34.3, 0.05);
  close(M.loopSeconds(140, 32), 54.9, 0.05);
  for (const id of M.TRACK_IDS) close(M.loopSeconds(M.TRACKS[id].bpm, M.TRACKS[id].bars), M.TRACKS[id].bars * M.barDur(M.TRACKS[id].bpm), 1e-9);
});

test('chords parse to the right pitch classes and voicings', () => {
  assert.equal(M.parseChord('Bb').root, 10);
  assert.deepEqual(M.parseChord('F#m7').iv, [0, 3, 7, 10]);
  assert.deepEqual(M.parseChord('Gmaj7').iv, [0, 4, 7, 11]);
  assert.equal(M.parseChord('Eb').root, 3);
  assert.equal(M.parseChord('H7'), null);
  const am = M.parseChord('Am');
  assert.equal(M.placeRoot(am.root, 40), 45);                        /* A2 */
  assert.deepEqual([0, 1, 2, 3, 4].map(i => M.chordTone(am, i, 60)), [69, 72, 76, 81, 84]);
  assert.deepEqual(M.padNotes(M.parseChord('Gmaj7'), 55), [59, 62, 66]); /* rootless 3-5-7 */
  close(M.midiHz(69), 440); close(M.midiHz(81), 880, 1e-9);
  for (const id of M.TRACK_IDS) {
    for (const c of M.TRACKS[id].chords.concat(M.TRACKS[id].encoreChords || [])) assert.ok(M.parseChord(c), id + ' ' + c);
  }
});

test('every pattern step is within 0-15, and every melody too', () => {
  for (const id in M.PATTERNS) {
    for (const [name, list] of Object.entries(M.PATTERNS[id])) {
      if (!Array.isArray(list)) continue;
      assert.ok(list.length > 0, `${id}.${name} not empty`);
      for (const s of list) assert.ok(Number.isInteger(s) && s >= 0 && s <= 15, `${id}.${name} step ${s}`);
    }
  }
  for (const id in M.MELODY) {
    for (const ph of [M.MELODY[id].A, M.MELODY[id].B]) {
      assert.equal(ph.s.length, ph.n.length, id);
      for (const s of ph.s) assert.ok(s >= 0 && s <= 15, id + ' melody step ' + s);
    }
  }
});

test('art-bible patterns: day/showtime/shop/course/penalty/kart drum and bass steps', () => {
  const P = M.PATTERNS;
  assert.deepEqual(P.island_day.kick, [0, 4, 8, 12]); assert.deepEqual(P.island_day.clap, [4, 12]);
  assert.deepEqual(P.island_day.hat, [2, 6, 10, 14]); assert.deepEqual(P.island_day.bass, [0, 3, 6, 8, 11, 14]);
  assert.deepEqual(P.island_day.bassUp, [6, 14]); assert.deepEqual(P.island_day.comp, [2, 10]);
  assert.deepEqual(P.island_day.pick, [11, 14]); assert.deepEqual(P.island_day.run, [12, 13, 14, 15]);
  assert.deepEqual(P.island_showtime.ohat, [2, 6, 10, 14]);
  assert.deepEqual(P.shop.kick, [0, 7, 10]); assert.deepEqual(P.shop.clap, [4, 12]); assert.deepEqual(P.shop.bass, [0, 8]);
  assert.deepEqual(P.shop.hat, [0, 2, 4, 6, 8, 10, 12, 14]);
  assert.deepEqual(P.course.hat, [1, 3, 5, 7, 9, 11, 13, 15]); assert.deepEqual(P.course.bass, [0, 2, 4, 6, 8, 10, 12, 14]);
  assert.deepEqual(P.course.kickHalf, [0, 8]);
  assert.deepEqual(P.penalty.tom, [0, 4, 6, 8, 12]);
  assert.deepEqual(P.kart.bass, [2, 6, 10, 14]); assert.equal(P.kart.hat.length, 16); assert.deepEqual(P.kart.roll, [12, 13, 14, 15]);
});

/* run a track's band for some bars at a given pending state */
function playBars(id, setup, bars, onStep) {
  const T = M.TRACKS[id], p = M.freshPending(id);
  if (setup) setup(p);
  let st = M.initState(T, p, 0);
  for (let s = 0; s < 16 * bars; s++) {
    st = M.latch(T, st, p, s);
    const evs = M.bandEvents(id, st, s);
    if (onStep) onStep(s, evs, st, p);
  }
}
const stepsOf = (id, setup, bars, inst) => {
  const out = [];
  playBars(id, setup, bars, (s, evs) => { if (evs.some(e => e.i === inst)) out.push(s); });
  return out;
};

test('one chord per bar: every pitched note in a bar belongs to that bar\'s chord (or the melody scale)', () => {
  const states = { island_day: [p => {}], island_showtime: [p => {}], shop: [p => {}],
    course: [p => { p.level = 3; }, p => { p.level = 3; p.fever = true; }, p => { p.section = 6; p.level = 2; }],
    penalty: [p => { p.level = 4; }], kart: [p => { p.layers.arp = true; }] };
  for (const id in states) {
    for (const setup of states[id]) {
      const T = M.TRACKS[id];
      playBars(id, setup, T.bars, (s, evs, st) => {
        const bar = Math.floor(s / 16), ch = M.chordAt(id, st, bar), tr = st.transpose | 0;
        const pcs = ch.iv.map(i => (ch.root + i + tr) % 12);
        for (const e of evs) {
          if (['bass', 'pad', 'keys', 'brass', 'pluck', 'epiano'].includes(e.i)) {
            for (const m of [].concat(e.m)) assert.ok(pcs.includes(((m % 12) + 12) % 12), `${id} bar ${bar} step ${s % 16} ${e.i} ${m} not in ${ch.name}`);
          }
          if (e.i === 'bass') assert.equal(((e.m % 12) + 12) % 12, (ch.root + tr) % 12, `${id} bass plays the chord root`);
        }
      });
    }
  }
});

test('pads change exactly once per bar (on the downbeat)', () => {
  for (const id of ['island_showtime', 'course']) {
    const pads = [];
    playBars(id, p => { p.level = 3; p.fever = true; }, 8, (s, evs) => { if (evs.some(e => e.i === 'pad')) pads.push(s); });
    assert.deepEqual(pads, [0, 16, 32, 48, 64, 80, 96, 112], id);
  }
});

test('golden hour (island_day): EP melody on bars 1-8, pluck arp in 8ths on bars 9-16, EP comping, plucked answers and a run into the loop', () => {
  const arp = new Set(), lead = new Set(), comp = new Set(), pick = new Set(), run = [], seen = new Set();
  playBars('island_day', null, 16, (s, evs) => {
    const bar = Math.floor(s / 16), k = s % 16;
    for (const e of evs) {
      seen.add(e.i);
      if (e.i === 'pluck' && e.d === 0.22) arp.add(bar);
      if (e.i === 'pluck' && e.d === 0.14) pick.add(bar);
      if (e.i === 'epiano' && e.d === 0.42) lead.add(bar);
      if (e.i === 'epiano' && Array.isArray(e.m)) { comp.add(bar); assert.ok([2, 10].includes(k), 'EP chords comp on the off-beats'); assert.equal(e.m.length, 3); }
      if (e.i === 'epiano' && e.d === 0.24) run.push([bar, k, e.m]);
    }
  });
  assert.deepEqual([...lead].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7], 'the electric-piano melody sings bars 1-8');
  assert.deepEqual([...arp].sort((a, b) => a - b), [8, 9, 10, 11, 12, 13, 14, 15], 'plucks arpeggiate bars 9-16');
  assert.equal(comp.size, 16, 'EP chords in every bar');
  assert.deepEqual([...pick].sort((a, b) => a - b), [1, 3, 5, 7], 'plucked answers on the odd melody bars');
  assert.deepEqual(run.map(r => [r[0], r[1]]), [[15, 12], [15, 13], [15, 14], [15, 15]], 'one EP run up into the loop');
  for (let i = 1; i < run.length; i++) assert.ok(run[i][2] > run[i - 1][2], 'the run climbs');
  /* the v1 marimba lead and steel-drum / chime bells are gone; showtime keeps its own band */
  assert.ok(!seen.has('bell') && !seen.has('lead'), 'no bells and no square lead at golden hour');
  assert.equal(M.MELODY.island_day.inst, 'epiano');
  assert.deepEqual(stepsOf('island_day', null, 1, 'kick'), [0, 4, 8, 12]);
  /* the bass bounces up an octave on the push steps */
  const bass = [];
  playBars('island_day', null, 1, (s, evs) => evs.filter(e => e.i === 'bass').forEach(e => bass.push([s, e.m])));
  assert.deepEqual(bass.map(b => b[0]), [0, 3, 6, 8, 11, 14]);
  assert.deepEqual(bass.map(b => b[1] - bass[0][1]), [0, 0, 12, 0, 0, 12]);
});

test('golden hour: the same bar length and clock (16 bars, 2.4 s a bar, 38.4 s a loop); the island context aliases', () => {
  assert.equal(M.TRACKS.island_day.bars, 16);
  close(M.barDur(M.TRACKS.island_day.bpm), 2.4, 1e-12);
  close(M.loopSeconds(M.TRACKS.island_day.bpm, M.TRACKS.island_day.bars), 38.4, 1e-9);
  assert.ok(/golden-hour city-pop/.test(M.TRACKS.island_day.mood));
  for (const c of ['golden', 'golden_hour', 'GoldenHour', 'dusk', 'day', 'island_day']) assert.equal(M.islandTrack(c), 'island_day', c);
  for (const c of ['showtime', 'night', 'island_showtime']) assert.equal(M.islandTrack(c), 'island_showtime', c);
  assert.equal(M.islandTrack('nope'), null);
  /* Showtime is untouched: its pattern, arrangement and harmony */
  assert.deepEqual(M.PATTERNS.island_showtime, { kick: [0, 4, 8, 12], clap: [4, 12], hat: [2, 6, 10, 14], ohat: [2, 6, 10, 14], bass: [0, 3, 8, 11], chime: [12, 13, 14, 15] });
  assert.deepEqual(M.parts('island_showtime', { level: 3, layers: {} }, 3), { kick: 1, clap: 1, ohat: 1, bass: 1, arp: 1, arpRate: 16, pad: 1, pump: 1, chime: true });
  assert.equal(M.MELODY.island_showtime, undefined);
});

test('engine: the golden-hour electric piano is an FM voice (1:1 modulator + 14:1 tine into the carrier) with clean envelopes', async () => {
  const r = rig(); r.eng._gesture();
  r.eng.island('golden'); await flush();
  assert.equal(r.eng.state().track, 'island_day');
  r.run(4);
  const oscs = r.ctx.starts.filter(s => s.kind === 'osc');
  /* a tine is an oscillator 14x a carrier, whose gain feeds that carrier's frequency */
  const tines = oscs.filter(s => oscs.some(o => o !== s && Math.abs(o.f * 14 - s.f) < 1e-6 && o.node.type === 'sine'));
  assert.ok(tines.length >= 4, 'EP notes played (' + tines.length + ')');
  const fmGains = r.ctx.nodes.filter(n => n.kind === 'gain' && n.outs.some(o => o && o.constructor && o.constructor.name === 'FakeParam'));
  assert.ok(fmGains.length >= 2 * tines.length, 'every EP note has a modulator and a tine into its carrier frequency');
  for (const t of tines) {
    const car = oscs.find(o => Math.abs(o.f * 14 - t.f) < 1e-6);
    assert.ok(car.f > 100 && car.f < 1200, 'EP notes sit in a warm register (' + car.f.toFixed(1) + ' Hz)');
  }
});

test('course layers follow hype: x1 kick/bass/clap, x2 + hats, x3 + 16th arp, FEVER + pad/open hats/bell lead and +2 semitones', () => {
  const insts = setup => { const set = new Set(); playBars('course', setup, 2, (s, evs) => evs.forEach(e => set.add(e.i))); return set; };
  const x1 = insts(p => { p.level = 0; });
  assert.ok(x1.has('kick') && x1.has('bass') && x1.has('clap'));
  assert.ok(!x1.has('hat') && !x1.has('pluck') && !x1.has('pad'));
  const x2 = insts(p => { p.level = 1; });
  assert.ok(x2.has('hat') && !x2.has('pluck'));
  const x3 = insts(p => { p.level = 2; });
  assert.ok(x3.has('pluck'));
  assert.equal(stepsOf('course', p => { p.level = 2; }, 1, 'pluck').length, 16, '16th-note arp');
  const fever = insts(p => { p.level = 2; p.fever = true; });
  for (const i of ['pad', 'ohat', 'bell']) assert.ok(fever.has(i), 'fever adds ' + i);
  let tr = null;
  playBars('course', p => { p.fever = true; }, 1, (s, evs, st) => { tr = st.transpose; });
  assert.equal(tr, 2);
  /* hype -> levels */
  assert.deepEqual([0, 0.2, 0.3, 0.6, 0.9, 1, 7].map(M.levelFromHype), [0, 0, 1, 2, 3, 3, 3]);
});

test('course sections: bridge is half-time kick + bell melody under 1.4 kHz; final chorus arp up an octave; encore uses Bb major', () => {
  assert.deepEqual(stepsOf('course', p => { p.section = 4; p.level = 3; }, 1, 'kick'), [0, 8]);
  assert.ok(stepsOf('course', p => { p.section = 4; p.level = 3; }, 1, 'bell').length > 0);
  assert.equal(stepsOf('course', p => { p.section = 4; p.level = 3; }, 1, 'pluck').length, 0);
  assert.equal(M.toneFor('course', { section: 4 }, 'synth'), 1400);
  let low = Infinity, high = -Infinity;
  playBars('course', p => { p.level = 2; }, 1, (s, evs) => evs.filter(e => e.i === 'pluck').forEach(e => { low = Math.min(low, e.m); }));
  playBars('course', p => { p.level = 2; p.section = 5; }, 1, (s, evs) => evs.filter(e => e.i === 'pluck').forEach(e => { high = Math.min(high === -Infinity ? Infinity : high, e.m); }));
  assert.equal(high - low, 12, 'final chorus arp an octave up');
  const ch = M.chordAt('course', { section: 6, level: 0, layers: {} }, 0);
  assert.equal(ch.name, 'Eb');
  /* themes */
  assert.ok(stepsOf('course', p => { p.theme = 'snow'; p.level = 1; }, 1, 'sleigh').length > 0, 'snow: sleigh hats');
  assert.ok(stepsOf('course', p => { p.theme = 'beach'; p.level = 1; }, 1, 'bell').length > 0, 'beach: steel accents');
  const candy = []; playBars('course', p => { p.theme = 'candy'; p.level = 2; }, 1, (s, evs) => evs.forEach(e => candy.push(e.i)));
  assert.ok(candy.includes('bell') && !candy.includes('pluck'), 'candy: music-box arp');
  assert.equal(M.themeOf('course_candy'), 'candy'); assert.equal(M.themeOf('course_meadow'), 'meadow'); assert.equal(M.themeOf(null), 'meadow');
});

test('a riser request lands on exactly the next bar: noise riser + clap roll', () => {
  const T = M.TRACKS.course, p = M.freshPending('course');
  let st = M.initState(T, p, 0);
  const risers = [], rolls = [];
  for (let s = 0; s < 64; s++) {
    if (s === 5) M.setValue(p, 'riser', true);
    st = M.latch(T, st, p, s);
    const evs = M.bandEvents('course', st, s);
    if (evs.some(e => e.i === 'riser')) risers.push(s);
    if (s >= 16 && s < 32 && s % 16 >= 8 && evs.some(e => e.i === 'clap')) rolls.push(s % 16);
  }
  assert.deepEqual(risers, [16]);
  assert.deepEqual(rolls, [8, 9, 10, 11, 12, 13, 14, 15]);
});

test('penalty layers 0-4: toms + claps, + hats, + bass, + arp, encore mode adds open hats, 16th arp, pumping pad and hey', () => {
  const insts = L => { const set = new Set(); playBars('penalty', p => { p.level = L; }, 4, (s, evs) => evs.forEach(e => set.add(e.i + (e.pump ? '+pump' : '')))); return set; };
  const l0 = insts(0);
  assert.ok(l0.has('tom') && l0.has('clap') && l0.has('swell') && !l0.has('hat') && !l0.has('bass'));
  assert.ok(insts(1).has('hat'));
  assert.ok(insts(2).has('bass') && insts(2).has('brass') && insts(2).has('hey'));
  assert.ok(insts(3).has('pluck'));
  const l4 = insts(4);
  for (const i of ['ohat', 'pad', 'hey', 'tom+pump']) assert.ok(l4.has(i), 'encore mode ' + i);
  assert.equal(stepsOf('penalty', p => { p.level = 4; }, 1, 'pluck').length, 16);
  assert.equal(stepsOf('penalty', p => { p.level = 3; }, 1, 'pluck').length, 8);
});

test('kart: offbeat bass, 16th hats, clap roll every 8th bar; arp layer and +2 key lift with open hats', () => {
  assert.deepEqual(stepsOf('kart', null, 1, 'bass'), [2, 6, 10, 14]);
  assert.equal(stepsOf('kart', null, 1, 'hat').length, 16);
  const claps = []; playBars('kart', null, 8, (s, evs) => { if (Math.floor(s / 16) === 7 && evs.some(e => e.i === 'clap')) claps.push(s % 16); });
  assert.deepEqual(claps, [4, 12, 13, 14, 15]);
  assert.equal(stepsOf('kart', null, 1, 'pluck').length, 0);
  assert.equal(stepsOf('kart', p => { p.layers[M.layerName('arp')] = true; }, 1, 'pluck').length, 16);
  let tr = 0; const oh = [];
  playBars('kart', p => { M.setValue(p, 'key', 2); }, 1, (s, evs, st) => { tr = st.transpose; if (evs.some(e => e.i === 'ohat')) oh.push(s); });
  assert.equal(tr, 2); assert.deepEqual(oh, [2, 6, 10, 14]);
});

test('count-in: whole beats before the downbeat, sticks for the course, kick + hats for the kart', () => {
  assert.equal(M.countInBeats(1.875, 128), 4);
  assert.equal(M.countInBeats(3, 140), 7);
  assert.equal(M.countInBeats(3, 100), 5);
  assert.equal(M.countInBeats(0, 140), 0);
  const course = M.initState(M.TRACKS.course, M.freshPending('course'), -16);
  const c = []; for (let s = -20; s < 0; s++) M.bandEvents('course', course, s).forEach(e => c.push([s, e.i]));
  assert.deepEqual(c, [[-16, 'tap'], [-12, 'tap'], [-8, 'tap'], [-4, 'tap']]);
  const kart = M.initState(M.TRACKS.kart, M.freshPending('kart'), -28);
  const k = []; for (let s = -28; s < 0; s++) M.bandEvents('kart', kart, s).forEach(e => k.push(e.i));
  assert.equal(k.filter(i => i === 'kick').length, 7);
  assert.equal(k.filter(i => i === 'hat').length, 14);
});

test('at most 12 voices at once on every track and state, and drums/bass are never the ones dropped', () => {
  const cases = [['island_day', () => {}], ['island_showtime', () => {}], ['shop', () => {}],
    ['course', p => { p.level = 3; }], ['course', p => { p.level = 3; p.fever = true; }], ['course', p => { p.level = 3; p.fever = true; p.theme = 'beach'; p.riser = 1; }],
    ['penalty', p => { p.level = 4; }], ['kart', p => { p.layers.arp = true; p.key = 2; }]];
  for (const [id, setup] of cases) {
    const T = M.TRACKS[id], pool = [];
    let total = 0, dropped = 0;
    playBars(id, setup, T.bars, (s, evs) => {
      const t = M.stepTime(0, T.bpm, s, T.swing);
      const ok = M.admitVoices(pool, evs, t, 12);
      assert.ok(pool.length <= 12, id + ' over 12 voices');
      for (const e of evs) if (!ok.includes(e)) { dropped++; assert.ok(!['kick', 'tom', 'bass', 'clap'].includes(e.i), id + ' dropped ' + e.i); }
      total += evs.length;
    });
    assert.ok(dropped / total < 0.02, `${id}: ${dropped}/${total} dropped`);
  }
  /* priorities: a full pool keeps the kick */
  const pool = Array(11).fill(5);
  const ok = M.admitVoices(pool, [{ i: 'hat', p: 4, d: 0.03 }, { i: 'kick', p: 10, d: 0.25 }], 1);
  assert.deepEqual(ok.map(e => e.i), ['kick']);
});

/* ================================================================
   PURE: scheduling and beat-lock maths
   ================================================================ */
test('step / beat / bar maths and the lookahead window', () => {
  close(M.stepDur(120), 0.125); close(M.beatDur(120), 0.5); close(M.barDur(120), 2);
  close(M.stepTime(10, 120, 4), 10.5);
  close(M.stepTime(10, 120, -4), 9.5);
  close(M.stepTime(10, 120, 3, 0.16), 10 + 3 * 0.125 + 0.02, 1e-12, 'odd steps swing late');
  close(M.stepTime(10, 120, 2, 0.16), 10.25);
  assert.equal(M.stepAt(10, 120, 10.49), 3);
  close(M.nextDownbeat(10, 120, 10.01), 12);
  close(M.nextDownbeat(10, 120, 12), 12);
  assert.equal(M.nextBeatStep(5), 8); assert.equal(M.nextBeatStep(8), 8); assert.equal(M.nextBeatStep(-3), 0);
  /* 25 ms ticks scheduling 0.12 s ahead never skip or repeat a step */
  let next = 0, seen = [];
  for (let now = 0; now < 4; now += 0.025) {
    const w = M.scheduleWindow(0, 128, next, now, M.LOOKAHEAD, 0);
    for (const x of w.steps) { assert.ok(x.t < now + M.LOOKAHEAD + 1e-9); assert.ok(x.t >= now - 0.12, 'scheduled ahead, not late'); seen.push(x.s); }
    next = w.next;
  }
  assert.deepEqual(seen, seen.map((_, i) => i));
  assert.ok(seen.length >= Math.floor(3.9 / M.stepDur(128)));
  assert.equal(M.LOOKAHEAD, 0.12); assert.equal(M.TICK_MS, 25); assert.equal(M.MAX_VOICES, 12);
});

test('beat-lock: anchor from the logic clock, drift and the 80 ms resync rule', () => {
  close(M.lockAnchor(50, 12.5, 0), 37.5);
  close(M.lockAnchor(50, 12.5, 0.02), 37.48);
  close(M.clockDrift(37.5, 50.03, 12.5, 0), 0.03, 1e-9);
  assert.equal(M.needsResync(0.05), false);
  assert.equal(M.needsResync(0.08), false);
  assert.equal(M.needsResync(0.081), true);
  assert.equal(M.needsResync(-0.2), true);
  /* beat k sits at logic t = k*60/bpm, so its audio time is anchor + k*beat */
  const anchor = M.lockAnchor(100, 3.75, 0);
  close(M.stepTime(anchor, 128, 8 * 4), 100 + (8 * 60 / 128 - 3.75), 1e-9);
  /* file loops: play from t mod loop */
  const loop = { start: 0.05, len: 60 };
  close(M.loopPos(61.5, loop), 1.55, 1e-9); close(M.loopPos(-1, loop), 59.05, 1e-9);
});

test('latch: layers change on the next beat, sections/key on the next downbeat', () => {
  const T = M.TRACKS.course, p = M.freshPending('course');
  let st = M.initState(T, p, 0);
  M.setValue(p, 'hype', 0.9); M.setValue(p, 'section', 'chorus'); M.setValue(p, 'key', 2);
  st = M.latch(T, st, p, 1); assert.equal(st.level, 0);
  st = M.latch(T, st, p, 4); assert.equal(st.level, 3); assert.equal(st.section, 0); assert.equal(st.transpose, 0);
  st = M.latch(T, st, p, 16); assert.equal(st.section, 3); assert.equal(st.transpose, 2);
  M.setValue(p, 'fever', true);
  st = M.latch(T, st, p, 20); assert.equal(st.transpose, 4, 'fever lifts a further 2 on the next beat');
});

test('set() names, musicState polling and ms arguments', () => {
  const p = M.freshPending('course');
  assert.equal(M.setValue(p, 'mult', 4), true); assert.equal(p.level, 3);
  M.setValue(p, 'mult', 1); assert.equal(p.level, 0);
  M.setValue(p, 'layers', 9); assert.equal(p.level, 4);
  M.setValue(p, 'section', 'Final Chorus'); assert.equal(p.section, 5);
  M.setValue(p, 'section', 'bounce-bridge'); assert.equal(p.section, 4);
  M.setValue(p, 'spotlight', true); assert.equal(p.layers.arp, true);
  M.setValue(p, 'key', 40); assert.equal(p.key, 12);
  assert.equal(M.setValue(p, 'nonsense', 1), false);
  M.applyMusicState(p, { section: 3, mult: 3, fever: true, lastHeart: true, phase: 'run', curtain: false });
  assert.deepEqual([p.section, p.level, p.fever, p.lastHeart, p.curtain], [3, 2, true, true, false]);
  M.applyMusicState(p, { phase: 'encore' }); assert.equal(p.section, 6);
  M.applyMusicState(p, { phase: 'curtain' }); assert.equal(p.curtain, true);
  assert.equal(M.layerName('Hats'), 'hat'); assert.equal(M.layerName('openHats'), 'ohat'); assert.equal(M.layerName('horns'), 'stab');
  assert.equal(M.normMs(undefined, 200), 200); assert.equal(M.normMs(350, 200), 350);
  assert.equal(M.normMs(0.35, 200), 350, 'seconds read as seconds');
  assert.equal(M.normMs(0, 200), 0); assert.equal(M.normMs(-5, 200), 200); assert.equal(M.normMs(9000, 200, 1500), 1500);
  assert.equal(M.islandTrack('showtime'), 'island_showtime'); assert.equal(M.islandTrack('shop'), 'shop'); assert.equal(M.islandTrack('kart'), null);
});

/* ================================================================
   PURE: manifest, loop points, file choice, tone, settings
   ================================================================ */
test('manifest parsing: a list of names, objects with bpm/bars, maps; junk is ignored', () => {
  assert.deepEqual(M.parseManifest(['island_day', 'course.mp3']), {
    island_day: { name: 'island_day', file: 'audio/music/island_day.mp3' },
    course: { name: 'course', file: 'audio/music/course.mp3' }
  });
  const m = M.parseManifest({ tracks: [{ name: 'kart', bpm: 140, bars: 32, offset: 0.02, gain: 0.8 }, { name: '../evil' }, 'Bad Name', 42, null] });
  assert.deepEqual(Object.keys(m), ['kart']);
  assert.deepEqual(m.kart, { name: 'kart', file: 'audio/music/kart.mp3', bpm: 140, bars: 32, offset: 0.02, gain: 0.8 });
  const map = M.parseManifest({ shop: true, penalty: { bpm: 112, bars: 16 }, course_fever: 1, junk: false });
  assert.deepEqual(Object.keys(map).sort(), ['course_fever', 'penalty', 'shop']);
  assert.equal(map.penalty.bars, 16);
  assert.equal(M.parseManifest({ tracks: [{ name: 'kart', bpm: 9999 }] }).kart.bpm, undefined, 'out-of-range bpm dropped');
  assert.deepEqual(M.parseManifest(null), {}); assert.deepEqual(M.parseManifest('x'), {}); assert.deepEqual(M.parseManifest([]), {});
});

test('loop points are bar-exact when the manifest gives bpm + bars', () => {
  const a = M.loopPoints({ bpm: 100, bars: 16 }, 38.46, 100);
  assert.deepEqual([a.start, a.len, a.exact], [0, 38.4, true]);
  const b = M.loopPoints({}, 38.46, 100);
  assert.deepEqual([b.start, b.len, b.exact, b.bpm], [0, 38.46, false, 100]);
  const c = M.loopPoints({ bpm: 128, bars: 32, offset: 0.03 }, 60.05, 128);
  close(c.start, 0.03); close(c.len, 60); assert.equal(c.exact, true);
  const d = M.loopPoints({ bpm: 128, bars: 32 }, 50, 128);
  assert.equal(d.exact, false, 'a file shorter than its claimed bars loops whole'); close(d.len, 50);
});

test('file choice: fever / encore alternates when listed, else the base, else the band', () => {
  const has = n => ['course', 'course_fever', 'kart_encore'].includes(n);
  assert.equal(M.fileFor('course', { fever: false }, has), 'course');
  assert.equal(M.fileFor('course', { fever: true }, has), 'course_fever');
  assert.equal(M.fileFor('kart', { key: 2 }, has), 'kart_encore');
  assert.equal(M.fileFor('kart', { key: 0 }, has), null);
  assert.equal(M.fileFor('shop', {}, has), null);
  /* with a file, hype opens a lowpass instead of adding layers */
  assert.deepEqual([0, 1, 2, 3].map(l => M.toneFor('course', { level: l }, 'file')), [2500, 6000, 0, 0]);
  assert.deepEqual([0, 1, 2, 3, 4].map(l => M.toneFor('penalty', { level: l }, 'file')), [1400, 2500, 5000, 10000, 0]);
  assert.equal(M.toneFor('course', { level: 0, fever: true }, 'file'), 0);
  assert.equal(M.toneFor('kart', { level: 0 }, 'file'), 0);
});

test('the 🎵 setting: localStorage slMusic, default on, survives blocked storage', () => {
  assert.equal(M.STORE_KEY, 'slMusic');
  const s = memStorage();
  assert.equal(M.readEnabled(s), true, 'default on');
  assert.equal(M.writeEnabled(s, false), true); assert.equal(s.map.get('slMusic'), '0'); assert.equal(M.readEnabled(s), false);
  M.writeEnabled(s, true); assert.equal(M.readEnabled(s), true);
  const bad = memStorage(true);
  assert.equal(M.readEnabled(bad), true); assert.equal(M.writeEnabled(bad, false), false);
  assert.equal(M.readEnabled(null), true);
});

/* ================================================================
   ENGINE on a fake AudioContext
   ================================================================ */
test('engine: nothing starts before a user gesture; the first tap starts the island loop', async () => {
  const r = rig();
  r.eng.island('island_day');
  await flush();
  assert.equal(r.st.ctxCalls, 0, 'no AudioContext before a gesture');
  assert.equal(r.ctx.starts.length, 0);
  r.eng._gesture();
  await flush();
  assert.equal(r.eng.state().track, 'island_day');
  assert.equal(r.eng.state().mode, 'synth', 'no manifest: the Pocket Band plays');
  r.run(2);
  assert.ok(kicksOf(r.ctx).length >= 3, 'kicks scheduled');
  /* navigator.userActivation also counts as a gesture */
  const r2 = rig(); r2.st.activated = true;
  r2.eng.island('shop'); await flush();
  assert.equal(r2.eng.state().track, 'shop');
});

test('engine: musicBus is a 0.30 gain into the destination; voices never exceed 12', async () => {
  const r = rig();
  r.eng._gesture();
  const ch = r.eng.channel({ muted: () => false });
  ch.play('course');
  ch.set('fever', true); ch.set('hype', 1);
  let maxV = 0;
  for (let i = 0; i < 1200; i++) { r.ctx.currentTime += 0.025; r.eng._tick(); maxV = Math.max(maxV, r.eng.state().voices); }
  assert.ok(maxV > 4 && maxV <= 12, 'voices ' + maxV);
  const N = r.eng._nodes();
  assert.equal(N.bus.gain.value, 0.3);
  assert.ok(N.bus.outs.includes(r.ctx.destination));
  assert.equal(r.eng.state().transpose, 2);
});

test('engine: course count-in lands the downbeat on GO, then the band locks to the logic clock', async () => {
  const r = rig(); r.eng._gesture();
  const ch = r.eng.channel({ muted: () => false });
  let logicT = 0;
  ch.set('clock', () => logicT);
  ch.menuMode(true);
  const t0 = r.ctx.currentTime;
  ch.play('course', { countInSec: 1.875 });
  assert.equal(r.eng.state().stage, 'count');
  const N = r.eng._nodes();
  close(N.stage.gain.at(t0 + 0.4), 0.4, 1e-6, 'count-in ducks to 40%');
  close(N.fxLP.frequency.at(t0 + 0.2), 800, 1e-6, 'count-in behind 800 Hz');
  r.run(1.875);
  const sticks = sticksOf(r.ctx), beat = 60 / 128, go = t0 + 1.875;
  assert.equal(sticks.length, 4, 'stick clicks on 5-6-7-8');
  sticks.forEach((t, i) => close(t, go - (4 - i) * beat, 1e-6, 'stick ' + i));
  /* GO */
  const tGo = r.ctx.currentTime;
  close(tGo, go, 1e-9);
  ch.menuMode(false);
  assert.equal(r.eng.state().stage, 'play');
  close(N.fxLP.frequency.at(tGo + 0.001), 800, 5, 'the drop starts at 800 Hz');
  assert.ok(N.fxLP.frequency.at(tGo + 0.5) > 17000, 'and opens to 18 kHz in 0.5 s');
  close(N.stage.gain.at(tGo + 0.06), 1, 1e-6, 'GO releases the 40% duck');
  r.run(3, () => { logicT += 0.025; });
  const kicks = kicksOf(r.ctx).filter(t => t >= tGo - 1e-9);
  assert.ok(kicks.length >= 6);
  close(kicks[0], tGo, 1e-6, 'the downbeat lands on GO');
  /* audio time of beat k = (audio - logic offset) + k * beat */
  const anchor = r.ctx.currentTime - logicT;
  for (const t of kicks) { const k = Math.round((t - anchor) / beat); close(t, anchor + k * beat, 0.005, 'kick on the logic beat'); }
});

test('engine: beat-lock holds within a few ms when the logic clock only moves in 60 fps frames', async () => {
  const r = rig(); r.eng._gesture();
  const ch = r.eng.channel({});
  let logicT = 0, real = 0;
  ch.play('course', { countInSec: 1.875, clock: () => logicT });
  r.run(1.875);
  ch.menuMode(false);
  const tGo = r.ctx.currentTime, beat = 60 / 128;
  r.run(10, () => { real += 0.025; logicT = Math.floor(real * 60) / 60; });
  const kicks = kicksOf(r.ctx).filter(t => t >= tGo - 1e-9);
  assert.ok(kicks.length >= 20);
  const worst = Math.max(...kicks.map(t => Math.abs(t - (tGo + Math.round((t - tGo) / beat) * beat))));
  assert.ok(worst < 0.01, 'worst ' + (worst * 1000).toFixed(1) + ' ms');
});

test('engine: drift over 80 ms snaps to the clock; small drift is slewed; a stalled clock holds then rejoins on a beat', async () => {
  const r = rig(); r.eng._gesture();
  const ch = r.eng.channel({});
  let logicT = 0;
  ch.play('course', { clock: () => logicT });
  ch.menuMode(false);
  const beat = 60 / 128;
  r.run(2, () => { logicT += 0.025; });
  /* the logic loses 150 ms (a long frame) */
  logicT -= 0.15;
  const before = r.ctx.starts.length;
  r.run(2, () => { logicT += 0.025; });
  const anchor = r.ctx.currentTime - logicT;
  const late = r.ctx.starts.slice(before).filter(s => s.kind === 'osc' && s.f === 150 && s.node.type === 'sine').map(s => s.t);
  assert.ok(late.length >= 3);
  for (const t of late.slice(1)) close(t, anchor + Math.round((t - anchor) / beat) * beat, 0.01, 'kicks follow the new clock');
  /* 40 ms of drift: no snap, but it converges */
  logicT -= 0.04;
  r.run(3, () => { logicT += 0.025; });
  const a2 = r.ctx.currentTime - logicT;
  const k2 = kicksOf(r.ctx).slice(-2);
  for (const t of k2) close(t, a2 + Math.round((t - a2) / beat) * beat, 0.022, 'slewed onto the beat');
  /* the logic stops (a countdown after resume): the band holds */
  const held = oscCount(r.ctx);
  r.run(1);
  const afterHold = oscCount(r.ctx);
  assert.ok(afterHold - held < 12, 'at most the lookahead plays after a stall');
  r.run(1);
  assert.equal(oscCount(r.ctx), afterHold, 'silent while the clock is stalled');
  assert.equal(r.eng.state().waiting, true);
  r.run(1, () => { logicT += 0.025; });
  assert.equal(r.eng.state().waiting, false);
  const a3 = r.ctx.currentTime - logicT, k3 = kicksOf(r.ctx).filter(t => t > r.ctx.currentTime - 1);
  assert.ok(k3.length >= 1, 'rejoined');
  for (const t of k3) close(t, a3 + Math.round((t - a3) / beat) * beat, 0.01, 'rejoins on a logic beat');
});

test('engine: the shell\'s pause -> resume -> count-in -> GO keeps a beat-locked band silent, then rejoins on the next logic beat', async () => {
  const r = rig(); r.eng._gesture();
  const ch = r.eng.channel({});
  let logicT = 0;
  ch.set('clock', () => logicT);
  ch.play('course', { countInSec: 1.875 });
  r.run(1.875); ch.menuMode(false);
  r.run(2.3, () => { logicT += 0.025; });
  ch.pause(200);                                   /* shell: blur / pause button */
  r.run(3);
  const n = oscCount(r.ctx);
  ch.resume(300);                                  /* shell: Resume -> count-in again, logic frozen */
  r.run(1.875);
  assert.equal(oscCount(r.ctx), n, 'silent through the resume count-in');
  ch.menuMode(false);                              /* shell: GO */
  r.run(0.1);
  assert.equal(oscCount(r.ctx), n, 'still waiting for the logic to move');
  const tMove = r.ctx.currentTime, beat = 60 / 128;
  r.run(2, () => { logicT += 0.025; });
  const anchor = r.ctx.currentTime - logicT;
  const after = r.ctx.starts.filter(s => s.t >= tMove && s.kind === 'osc');
  assert.ok(after.length > 0, 'the band is back');
  const first = Math.min(...after.map(s => s.t));
  const k = (first - anchor) / beat;
  close(k, Math.round(k), 1e-6, 'first note after the resume is on a logic beat');
});

test('engine: a beat-locked band with no count-in (penalty) keeps its downbeat when the logic starts', async () => {
  const r = rig(); r.eng._gesture();
  const ch = r.eng.channel({});
  let logicT = 0;
  const t0 = r.ctx.currentTime;
  ch.play('penalty', { clock: () => logicT });
  ch.menuMode(false);
  r.run(1.5, () => { logicT += 0.025; });
  const toms = r.ctx.starts.filter(s => s.kind === 'osc' && s.f === 96).map(s => s.t);
  assert.ok(toms.length >= 3);
  assert.ok(toms[0] - t0 < 0.06, 'step 0 plays at the start: ' + (toms[0] - t0));
});

test('engine: channel.sync corrects drift over 80 ms only', async () => {
  const r = rig(); r.eng._gesture();
  const ch = r.eng.channel({});
  ch.play('kart');
  r.run(1);
  const pos = () => (r.eng.clock().beat * 60 / 140);
  const p0 = pos();
  ch.sync(p0 + 0.05);
  close(pos(), p0, 1e-6, 'within 80 ms: left alone');
  ch.sync(p0 + 0.5);
  close(pos(), p0 + 0.5, 1e-6, 'over 80 ms: re-anchored');
});

test('engine: menu mode is 60% behind a 1.2 kHz lowpass; a game menu muffles the island loop; stop brings the island back', async () => {
  const r = rig(); r.eng._gesture();
  r.eng.island('island_day'); await flush();
  const N = r.eng._nodes(), ch = r.eng.channel({});
  ch.menuMode(true);
  const t = r.ctx.currentTime;
  close(N.stage.gain.at(t + 0.31), 0.6, 1e-6); close(N.menuLP.frequency.at(t + 0.31), 1200, 1e-3);
  assert.equal(r.eng.state().track, 'island_day');
  ch.play('penalty');
  assert.equal(r.eng.state().track, 'penalty');
  close(N.stage.gain.at(r.ctx.currentTime + 0.31), 1, 1e-6);
  ch.layers(3); ch.lowpass(800, 0.3);
  close(N.fxLP.frequency.at(r.ctx.currentTime + 0.3), 800, 1e-3);
  r.run(1);
  assert.equal(r.eng.state().level, 3);
  ch.menuMode(true);
  close(N.stage.gain.at(r.ctx.currentTime + 0.31), 0.6, 1e-6);
  ch.stop(200);
  await flush();
  assert.equal(r.eng.state().track, 'island_day', 'island loop returns');
  assert.equal(r.eng.state().stage, 'play');
  assert.ok(N.fxLP.frequency.at(r.ctx.currentTime + 0.3) > 17000, 'game lowpass cleared');
});

test('engine: pause freezes the song position, resume continues it; island crossfades on the downbeat', async () => {
  const r = rig(); r.eng._gesture();
  const ch = r.eng.channel({});
  ch.play('kart');
  r.run(1.5);
  const step = r.eng.state().step;
  ch.pause(200);
  const n = oscCount(r.ctx);
  r.run(2);
  assert.equal(oscCount(r.ctx), n, 'nothing new while paused');
  ch.resume(300);
  assert.equal(r.eng.state().step, step);
  r.run(0.5);
  assert.ok(oscCount(r.ctx) > n);
  /* island: day -> showtime crossfades on the next downbeat */
  const r2 = rig(); r2.eng._gesture();
  r2.eng.island('island_day'); await flush();
  r2.run(0.7);
  r2.eng.island('showtime'); await flush();
  assert.equal(r2.eng.state().track, 'island_showtime');
  assert.equal(r2.eng.state().decks, 2, 'old loop still fading out');
  assert.equal(r2.eng.clock().bpm, 118);
  /* the new loop starts exactly on the old loop's next downbeat (bar = 2.4 s at 100 BPM) */
  const firstKick = kicksOf(r2.ctx).filter(t => t > r2.ctx.currentTime);
  r2.run(5);
  const showKicks = kicksOf(r2.ctx).filter(t => t > 12.4 - 1e-6);
  assert.ok(firstKick.length === 0 || firstKick[0] >= r2.ctx.currentTime - 5);
  close(showKicks[0], 12.4 + 0.06, 1e-6, 'showtime enters on the next day downbeat');
  assert.equal(r2.eng.state().decks, 1);
});

test('engine: mute and the 🎵 setting silence the band; hidden pages fade out and freeze', async () => {
  const r = rig(); r.eng._gesture();
  r.eng.island('island_day'); await flush();
  r.run(1);
  const N = r.eng._nodes();
  close(N.fade.gain.at(r.ctx.currentTime), 1, 1e-6);
  r.st.muted = true;
  r.run(0.5);
  close(N.fade.gain.at(r.ctx.currentTime), 0, 1e-6, 'muted');
  const n = oscCount(r.ctx);
  r.run(2);
  assert.equal(oscCount(r.ctx), n, 'no voices are built while muted');
  r.st.muted = false;
  r.run(1);
  assert.ok(oscCount(r.ctx) > n, 'back on unmute');
  /* hidden: 200 ms fade, frozen; visible: 300 ms fade back */
  r.eng._visibility(true);
  const th = r.ctx.currentTime;
  close(N.fade.gain.at(th + 0.2), 0, 1e-6);
  const m = oscCount(r.ctx);
  r.run(2);
  assert.equal(oscCount(r.ctx), m);
  r.eng._visibility(false);
  close(N.fade.gain.at(r.ctx.currentTime + 0.3), 1, 1e-6);
  r.run(1);
  assert.ok(oscCount(r.ctx) > m);
  /* 🎵 off: stored, everything stops; on: back */
  assert.equal(r.eng.setEnabled(false), false);
  assert.equal(r.storage.map.get('slMusic'), '0');
  assert.equal(r.eng.enabled(), false);
  r.run(1);
  assert.equal(r.eng.state().decks, 0);
  r.eng.setEnabled(true); await flush();
  assert.equal(r.eng.state().track, 'island_day');
  /* a fresh engine reads the stored setting and stays quiet */
  const s = memStorage(); s.setItem('slMusic', '0');
  const r3 = rig({ storage: s }); r3.eng._gesture(); r3.eng.island('island_day'); await flush();
  assert.equal(r3.eng.state().track, null);
  const r4 = rig({ storage: memStorage(true) });
  assert.equal(r4.eng.enabled(), true); assert.doesNotThrow(() => r4.eng.setEnabled(false));
});

test('engine: duck(0.4, 350) dips and recovers, and ducks never stack', async () => {
  const r = rig(); r.eng._gesture();
  r.eng.island('island_day'); await flush();
  const p = r.eng._nodes().duck.gain, t = r.ctx.currentTime;
  r.eng.duck(0.4, 350);
  close(p.at(t + 0.1), 0.4, 1e-6);
  r.ctx.currentTime += 0.1;
  r.eng.duck(0.4, 350);
  close(p.at(r.ctx.currentTime + 0.1), 0.4, 1e-6, 'a second duck does not go to 0.16');
  close(p.at(r.ctx.currentTime + 0.35 + 0.26), 1, 1e-6, 'released');
  r.eng.channel({}).duck(0.4, 0.35);       /* seconds also accepted */
  close(p.at(r.ctx.currentTime + 0.2), 0.4, 1e-6);
});

test('engine: manifest tracks loop decoded files on exact bars; missing files fall back to the band', async () => {
  const r = rig({ manifest: [{ name: 'island_day', bpm: 100, bars: 16 }, 'course'], durations: { 'audio/music/island_day.mp3': 38.45 } });
  r.eng._gesture();
  r.eng.island('island_day');
  await flush(10);
  assert.ok(r.st.fetched.includes('audio/music/manifest.json'));
  assert.ok(r.st.fetched.includes('audio/music/island_day.mp3'));
  r.run(0.2);
  const st = r.eng.state();
  assert.equal(st.mode, 'file'); assert.equal(st.file, 'island_day');
  const src = r.ctx.starts.filter(s => s.kind === 'src' && s.buffer && s.buffer.url === 'audio/music/island_day.mp3');
  assert.equal(src.length, 1);
  assert.equal(src[0].node.loop, true);
  close(src[0].node.loopEnd - src[0].node.loopStart, 38.4, 1e-9, 'bar-exact loop');
  /* shop is not listed: the band plays */
  r.eng.island('shop'); await flush(); r.run(3);
  assert.equal(r.eng.state().track, 'shop'); assert.equal(r.eng.state().mode, 'synth');
  /* no manifest at all (404) is fine */
  const r2 = rig(); r2.eng._gesture(); r2.eng.island('island_day'); await flush(); r2.run(0.5);
  assert.equal(r2.eng.state().mode, 'synth');
});

test('engine: every channel method is safe in any state', () => {
  const r = rig();
  const ch = r.eng.channel('game');
  assert.doesNotThrow(() => {
    ch.menuMode(true); ch.pause(); ch.resume(); ch.set('hype', 0.5); ch.layer('arp', true); ch.key(2); ch.drop(); ch.sync(3);
    ch.layers(2); ch.lowpass(800, 0.3); ch.duck(0.4, 350); ch.stop(); ch.play('nope'); ch.play('kart', 3); ch.stop(200);
    r.eng.duck(0.4, 350); r.eng.stopAll(); r.eng.clock(); r.eng.state();
  });
  assert.equal(ch.track(), null);
  const c = r.eng.clock();
  assert.equal(c.playing, false); assert.equal(c.bpm, 100);
});

test('browser bootstrap: loaded as a classic script, window.SLMusic / SLSound wire up to the page', async () => {
  const vm = require('node:vm');
  const ctx = new FakeCtx(), on = {}, fetched = [];
  const box = {
    document: { hidden: false, addEventListener: (n, f) => { on['doc:' + n] = f; } },
    navigator: { userActivation: { hasBeenActive: false } },
    performance: { now: () => ctx.currentTime * 1000 },
    localStorage: memStorage(),
    fetch: u => { fetched.push(u); return Promise.resolve({ ok: false }); },
    setInterval: () => 1, clearInterval: () => {}, setTimeout: () => 0,
    addEventListener: (n, f) => { on[n] = f; },
    getAudioCtx: () => ctx,
    currentUser: () => ({ muted: false })
  };
  box.window = box; box.self = box;
  vm.createContext(box);
  for (const f of ['sound.js', 'music.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'world', f), 'utf8'), box, { filename: f });
  const SL = box.SLMusic;
  assert.equal(typeof SL.channel, 'function');
  assert.equal(typeof box.SLSound.make, 'function');
  for (const n of ['pointerdown', 'touchend', 'keydown']) assert.equal(typeof on[n], 'function', 'gesture listener ' + n);
  assert.equal(typeof on['doc:visibilitychange'], 'function');
  SL.island('island_day');
  await flush();
  assert.equal(ctx.starts.length, 0, 'silent until a tap');
  assert.equal(fetched.length, 0, 'nothing fetched before a tap');
  on.pointerdown();
  await flush();
  assert.equal(SL.state().track, 'island_day');
  assert.deepEqual(fetched, ['audio/music/manifest.json']);
  /* the page hides: 200 ms fade, frozen */
  box.document.hidden = true; on['doc:visibilitychange']();
  assert.equal(SL.state().hidden, true);
  assert.equal(SL.setEnabled(false), false);
  assert.equal(box.localStorage.map.get('slMusic'), '0');
  /* loading the script twice keeps the first engine */
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'world', 'music.js'), 'utf8'), box);
  assert.equal(box.SLMusic, SL);
});

/* ================================================================
   world/sound.js
   ================================================================ */
function soundRig(opts = {}) {
  const ctx = new FakeCtx(), calls = [], real = { input: { id: 'comp' }, echo: { id: 'echo' } };
  const rec = name => (...a) => { calls.push({ name, args: a.slice(1), bus: ctx._slBus }); };
  const g = {
    getAudioCtx: () => ctx,
    _sfxBus: c => c._slBus || (c._slBus = real),
    _beep: rec('_beep'), _slide: rec('_slide'), _pluck: rec('_pluck'), _bell: rec('_bell'), _brass: rec('_brass'),
    _thump: rec('_thump'), _tap: rec('_tap'), _swell: rec('_swell'),
    playSfx: n => calls.push({ name: 'playSfx', args: [n] }),
    slSample: (n, v) => { calls.push({ name: 'slSample', args: [n, v] }); return !!opts.samples; },
    SLMusic: { duck: (l, ms) => calls.push({ name: 'duck', args: [l, ms] }) },
    currentUser: () => ({ muted: !!opts.muted })
  };
  return { ctx, calls, real, g, S: S.create(g) };
}

test('sound: the shell recipes are copied faithfully (pop, combo, tada, jump)', () => {
  const r = soundRig(), sound = r.S.make({ muted: () => false });
  sound('pop', 0.5);
  assert.deepEqual(r.calls.map(c => [c.name, c.args[0], c.args[2].vol]), [['_pluck', 1320, 0.065], ['_pluck', 1760, 0.05]]);
  close(r.calls[1].args[1] - r.calls[0].args[1], 0.045);
  r.calls.length = 0;
  sound('combo', 1, 3);
  assert.deepEqual(r.calls.map(c => c.args[0]), [784, 784 * 1.5]);
  r.calls.length = 0;
  sound('tada');
  assert.deepEqual(r.calls.filter(c => c.name === '_bell').map(c => c.args[0]), [784, 988, 1175, 1568]);
  assert.ok(r.calls.some(c => c.name === 'duck'), 'tada ducks the music');
  r.calls.length = 0;
  sound('jump', 9);
  assert.deepEqual(r.calls.map(c => [c.name, c.args[0], c.args[2], c.args[3].vol]), [['_beep', 520, 90, 0.12]]);
});

test('sound: every name the shell knows is handled, plus the pet voices', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'world', 'games', 'shell.js'), 'utf8');
  const body = src.slice(src.indexOf('function makeSound'), src.indexOf('OPTIONAL HOOKS'));
  const names = new Set([...body.matchAll(/name === '([a-z]+)'/g)].map(m => m[1]));
  for (const n of Object.keys(S.SAMPLE_FILES)) names.add(n);
  assert.ok(names.size >= 30);
  for (const n of names) assert.ok(S.NAMES.includes(n), 'missing ' + n);
  for (const n of ['yip', 'mew', 'thump', 'trill']) assert.ok(S.NAMES.includes(n));
  const r = soundRig(), sound = r.S.make({});
  for (const n of S.NAMES) {
    r.calls.length = 0; r.ctx.starts.length = 0;
    sound(n, 1, 2);
    assert.ok(r.calls.length > 0 || r.ctx.starts.length > 0, n + ' makes a sound');
  }
});

test('sound: pet voices follow the art bible recipes', () => {
  const r = soundRig(), sound = r.S.make({});
  sound('yip');
  const yips = r.calls.filter(c => c.name === '_slide');
  assert.deepEqual(yips.map(c => [c.args[0], c.args[1], c.args[3], c.args[4].wave]), [[600, 900, 80, 'triangle'], [600, 900, 80, 'triangle']]);
  close(yips[1].args[2] - yips[0].args[2], 0.14, 1e-9, '80 ms + 60 ms gap');
  r.calls.length = 0;
  sound('thump');
  const th = r.calls.filter(c => c.name === '_thump');
  assert.deepEqual(th.map(c => c.args[1].f), [160, 160]); close(th[1].args[0] - th[0].args[0], 0.09);
  assert.equal(r.calls.filter(c => c.name === '_pluck').length, 2, 'then a pop');
  r.calls.length = 0;
  sound('trill');
  assert.deepEqual(r.calls.map(c => c.name), ['_slide', '_swell', '_bell', '_bell']);
  assert.deepEqual([r.calls[0].args[0], r.calls[0].args[1], r.calls[0].args[3], r.calls[0].args[4].wave], [400, 1200, 150, 'sine']);
  close(r.calls[1].args[1], 0.2);
  r.calls.length = 0;
  sound('mew');
  const oscs = r.ctx.starts.filter(s => s.kind === 'osc');
  assert.deepEqual(oscs.map(o => o.f).sort((a, b) => a - b), [6, 900], 'a 900 Hz voice with a 6 Hz vibrato');
  const voice = oscs.find(o => o.f === 900).node;
  assert.equal(voice.frequency.ev[1].v, 650);
  assert.equal(S.petVoice('pet_kitten'), 'mew'); assert.equal(S.petVoice('pet_dragon'), 'trill'); assert.equal(S.petVoice('pet_bunny'), 'thump');
  r.calls.length = 0;
  sound.pet('pet_puppy');
  assert.equal(r.calls.filter(c => c.name === '_slide').length, 2);
  r.calls.length = 0;
  sound('voice', 1, 3);
  assert.equal(r.calls[0].args[1], 1200, "'voice' step 3 is the dragon");
});

test('sound: respects mute (cfg.muted, else the app user) and samples come first', () => {
  const r = soundRig();
  r.S.make({ muted: () => true })('pop');
  assert.equal(r.calls.length, 0);
  const m = soundRig({ muted: true });
  m.S.make({})('star'); m.S.play('star');
  assert.equal(m.calls.length, 0, 'falls back to the app user mute');
  const s = soundRig({ samples: true }), sound = s.S.make({});
  sound('cheer');
  assert.deepEqual(s.calls.map(c => c.name), ['duck', 'slSample']);
  assert.deepEqual(s.calls[1].args, ['applause', 0.8]);
  assert.deepEqual(s.calls[0].args, [0.4, 350]);
  s.calls.length = 0;
  sound('fanfare');
  assert.deepEqual(s.calls.map(c => c.name), ['duck', 'playSfx'], 'fanfare ducks the music too');
  /* a sample that has not decoded yet gets a quiet synth stand-in instead of silence */
  const n = soundRig({ samples: false });
  n.S.make({})('chip');
  assert.deepEqual(n.calls.map(c => c.name), ['slSample', '_tap', '_pluck']);
});

test('sound: stereo pan by island x through a StereoPanner, restored afterwards', () => {
  assert.equal(S.panFor(0, 1600), -0.3); assert.equal(S.panFor(1600, 1600), 0.3); assert.equal(S.panFor(800, 1600), 0);
  assert.equal(S.panFor(400, 1600), -0.15); assert.equal(S.panFor(-50, 1600), -0.3); assert.equal(S.panFor(10, 0), 0);
  const r = soundRig(), sound = r.S.make({});
  sound.at(1200, 1600)('pop');
  assert.equal(r.calls.length, 2);
  const bus = r.calls[0].bus;
  assert.equal(bus.input.kind, 'pan');
  close(bus.input.pan.value, 0.15, 1e-9);
  assert.ok(bus.input.outs.includes(r.real.input), 'panner feeds the real SFX bus');
  assert.equal(bus.echo, r.real.echo);
  assert.equal(r.ctx._slBus, r.real, 'bus restored after the call');
  r.calls.length = 0;
  sound('pop', 1, 0, 0.15);
  assert.equal(r.calls[0].bus.input, bus.input, 'panners are reused');
  r.calls.length = 0;
  sound('pop');
  assert.equal(r.calls[0].bus, r.real, 'no pan: helpers find the real bus');
});
