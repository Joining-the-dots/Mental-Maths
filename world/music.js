/* ================================================================
   My Island — music (window.SLMusic). Contract: docs/island3d/CONTRACTS.md §3.

   Six context loops (art bible audioAndMusic): island_day, island_showtime,
   shop, course, penalty, kart. A track listed in audio/music/manifest.json
   loops audio/music/<track>.mp3 from a decoded AudioBuffer (bar-exact when
   the manifest gives bpm + bars); anything else is played by the 'Pocket
   Band', an ORIGINAL WebAudio arrangement (drums, bass, chords, arps,
   melodies, risers) driven by a lookahead scheduler (25 ms tick, 0.12 s
   ahead, at most 12 voices).

   Mix: musicBus = GainNode 0.30 on window.getAudioCtx() (SFX keep _sfxBus).
   Music never starts before a user gesture, obeys the app's mute and its own
   🎵 setting (localStorage 'slMusic', default on), fades out over 200 ms when
   the page hides and back in over 300 ms. It only plays when My Island or a
   game asks (SLMusic.island / channel.play); the integration stops it on exit.

     SLMusic.channel(opts) -> { play(track, {countInSec, clock?, bpm?, state?}),
         menuMode(on), pause(ms), resume(ms), stop(ms), set(name, value),
         layer(name, on), key(semitones), drop(), sync(seconds),
         layers(n), lowpass(hz, sec), duck(level, ms), clock(), track() }
     SLMusic.island('island_day'|'island_showtime'|'shop'), SLMusic.stopAll(ms),
     SLMusic.duck(level, ms), SLMusic.enabled(), SLMusic.setEnabled(on),
     SLMusic.clock() -> {bpm, t0, beat, playing, track}, SLMusic.preload(track)

   BEAT-LOCK: play('course', {clock: () => round.state.t}) (or set('clock', fn)
   before the shell's play) schedules the band from the logic clock: beat k at
   logic t = k*60/bpm. Drift over 80 ms snaps, smaller drift is slewed away,
   and a stalled clock (pause / resume count-in) holds the band until the
   logic moves again, then rejoins on the next beat.

   Classic UMD: the pure pattern + scheduling maths are module.exports'd for
   Node tests; the engine is built by createEngine(env) so tests can inject
   a fake AudioContext, timers and storage.
   ================================================================ */
(function (root, factory) {
  var M = factory();
  if (typeof module === 'object' && module.exports) module.exports = M;
  if (typeof window !== 'undefined' && typeof document !== 'undefined' && !window.SLMusic) {
    try { window.SLMusic = M.createEngine(M.browserEnv(window)); } catch (e) {}
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------------- constants ---------------- */
  var LOOKAHEAD = 0.12, TICK_MS = 25, MAX_VOICES = 12, LATE = 0.05;
  var RESYNC = 0.08, SLEW = 0.01, STALL = 0.25, BUS_GAIN = 0.3, OPEN = 18000;
  var MENU_GAIN = 0.6, MENU_LP = 1200, COUNT_GAIN = 0.4, COUNT_LP = 800, DROP_SEC = 0.5;
  var HIDE_FADE = 0.2, SHOW_FADE = 0.3, CUT_FADE = 0.25, MUTE_FADE = 0.15;
  var STORE_KEY = 'slMusic', MANIFEST_URL = 'audio/music/manifest.json';
  var MAX_BUFS = 3, READY_WAIT_MS = 1200;

  function mod(a, n) { return ((a % n) + n) % n; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  /* ---------------- tracks (art bible: BPM / key / mood / progression) ---------------- */
  var TRACKS = {
    island_day: { bpm: 100, key: 'F major', bars: 16, chords: ['Bb', 'C', 'Am', 'Dm'], level: 3, island: true,
      mood: 'sunny bubblegum synth-pop with a tropical lilt, calm enough to build to' },
    island_showtime: { bpm: 118, key: 'Bb major', bars: 16, chords: ['Eb', 'F', 'Dm', 'Gm'], level: 3, island: true,
      mood: 'dreamy evening synth-pop with plucky arpeggios, airy pumping pads and a soft-punchy kick' },
    shop: { bpm: 92, key: 'D major', bars: 16, chords: ['Gmaj7', 'A', 'F#m7', 'Bm7'], level: 3, island: true, swing: 0.16, bassDur: 0.3,
      mood: 'cosy lo-fi pop' },
    course: { bpm: 128, key: 'C major', bars: 32, chords: ['F', 'G', 'Em', 'Am'], encoreChords: ['Eb', 'F', 'Dm', 'Gm'], level: 0,
      feverLift: 2, countIn: 'sticks', fileTone: [2500, 6000, 0, 0], mood: 'bouncy cartoon dance-pop' },
    penalty: { bpm: 112, key: 'G major', bars: 16, chords: ['C', 'D', 'Bm', 'Em'], level: 0, countIn: 'sticks',
      fileTone: [1400, 2500, 5000, 10000, 0], stabDur: 0.28, mood: 'stadium pop with toms, claps and wordless crowd shouts of hey' },
    kart: { bpm: 140, key: 'A minor', bars: 32, chords: ['Am', 'F', 'C', 'G'], level: 3, countIn: 'kickhats', liftOpenHats: true,
      mood: 'bright driving electro-pop and future-bass, not aggressive' }
  };
  var TRACK_IDS = Object.keys(TRACKS);
  var ISLAND_ALIAS = { day: 'island_day', island: 'island_day', island_day: 'island_day', showtime: 'island_showtime',
    island_showtime: 'island_showtime', night: 'island_showtime', shop: 'shop' };

  /* ---------------- patterns (16 steps per bar; every list is steps 0-15) ---------------- */
  var FOUR = [0, 4, 8, 12], OFF8 = [2, 6, 10, 14], EVEN = [0, 2, 4, 6, 8, 10, 12, 14], ODD = [1, 3, 5, 7, 9, 11, 13, 15];
  var ALL16 = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
  var PATTERNS = {
    island_day: { kick: FOUR, clap: [4, 12], hat: OFF8, bass: [0, 3, 8, 11], steel: [7], chime: [12, 13, 14, 15] },
    island_showtime: { kick: FOUR, clap: [4, 12], hat: OFF8, ohat: OFF8, bass: [0, 3, 8, 11], chime: [12, 13, 14, 15] },
    shop: { kick: [0, 7, 10], clap: [4, 12], hat: EVEN, bass: [0, 8], keys: [0, 10] },
    course: { kick: FOUR, kickHalf: [0, 8], clap: [4, 12], clapHalf: [8], hat: ODD, ohat: OFF8, bass: EVEN, bassOct: true,
      steel: OFF8, stab: [14], fill: [12], roll: [8, 9, 10, 11, 12, 13, 14, 15] },
    penalty: { tom: [0, 4, 6, 8, 12], clap: [4, 12], hat: OFF8, ohat: OFF8, bass: [0, 3, 8, 11], stab: [0], hey: [14], crowd: [12] },
    kart: { kick: FOUR, clap: [4, 12], hat: ALL16, ohat: OFF8, bass: OFF8, stab: [0, 3, 6, 10], roll: [12, 13, 14, 15] }
  };
  /* original melodies as rhythm (steps) + chord-tone indices (0 root, 1 third,
     2 fifth, 3 root+8ve ...), alternating A/B by bar so they follow the chords */
  var MELODY = {
    island_day: { inst: 'pluck', lo: 53, d: 0.32, A: { s: [0, 3, 6, 10, 12], n: [4, 3, 4, 5, 4] }, B: { s: [0, 3, 6, 8], n: [3, 2, 1, 2] } },
    shop: { inst: 'bell', lo: 62, d: 0.9, A: { s: [0, 8], n: [4, 3] }, B: { s: [0, 8], n: [5, 4] } },
    course: { inst: 'bell', lo: 60, d: 0.32, A: { s: [0, 2, 4, 7, 10, 12], n: [3, 4, 5, 4, 3, 2] }, B: { s: [0, 3, 6, 8, 12], n: [5, 4, 3, 4, 3] } },
    kart: { inst: 'lead', lo: 57, d: 0.16, A: { s: [0, 3, 6, 8, 11, 14], n: [3, 5, 4, 3, 4, 2] }, B: { s: [0, 3, 6, 10, 12], n: [5, 4, 3, 2, 3] } }
  };
  var REG = { bass: 40, pad: 55, keys: 57, arp: 60, steel: 55, chime: 55, stab: 60, horn: 55, fill: 60 };
  var MIX = { kick: 0.9, tom: 0.5, clap: 0.35, hat: 0.12, ohat: 0.12, bass: 0.24, pad: 0.06, keys: 0.05, arp: 0.07, lead: 0.07,
    steel: 0.05, chime: 0.05, brass: 0.05, slide: 0.05, riser: 0.06, swell: 0.08, hey: 0.3, crackle: 0.012, tap: 0.3 };
  var MIX_TRACK = {
    island_day: { kick: 0.75, clap: 0.28, hat: 0.1, lead: 0.085 },
    island_showtime: { kick: 0.85, clap: 0.3, ohat: 0.1, arp: 0.06 },
    shop: { kick: 0.55, clap: 0.16, hat: 0.08, bass: 0.2 },
    course: { lead: 0.06 },
    penalty: { hat: 0.1 },
    kart: { hat: 0.08, clap: 0.28, lead: 0.05, brass: 0.045, arp: 0.06 }
  };
  var mixCache = {};
  function mixOf(id) {
    if (mixCache[id]) return mixCache[id];
    var m = {}, k, o = MIX_TRACK[id] || {};
    for (k in MIX) m[k] = MIX[k];
    for (k in o) m[k] = o[k];
    return (mixCache[id] = m);
  }
  /* priority under the voice cap: drums and bass are never the ones dropped */
  var PRI = { kick: 10, tom: 10, count: 10, bass: 9, clap: 8, roll: 7, lead: 7, pad: 6, stab: 6, arp: 5, accent: 5,
    hat: 4, hey: 4, fx: 3, crackle: 1 };
  var TAIL = { brass: 0.16, swell: 0.1, bell: 0.05, pluck: 0.02, keys: 0.02, lead: 0.08, slide: 0.08, pad: 0.15, riser: 0.05 };

  /* ---------------- harmony ---------------- */
  var PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  var QUAL = { '': [0, 4, 7], m: [0, 3, 7], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], '7': [0, 4, 7, 10] };
  var chordCache = {};
  function parseChord(name) {
    name = String(name || '');
    if (chordCache[name]) return chordCache[name];
    var m = /^([A-G])([#b]?)(maj7|m7|m|7)?$/.exec(name);
    if (!m) return null;
    var root = mod(PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0), 12);
    return (chordCache[name] = { name: name, root: root, iv: QUAL[m[3] || ''] });
  }
  function placeRoot(pc, lo) { return lo + mod(pc - lo, 12); }
  function chordTone(ch, idx, lo) {
    var n = ch.iv.length, i = Math.max(0, idx | 0);
    return placeRoot(ch.root, lo) + ch.iv[i % n] + 12 * Math.floor(i / n);
  }
  /* close voicing above lo; 7th chords drop the root (3rd-5th-7th) */
  function padNotes(ch, lo) {
    var r = placeRoot(ch.root, lo), iv = ch.iv.length > 3 ? ch.iv.slice(1) : ch.iv;
    return iv.map(function (i) { return r + i; });
  }
  function midiHz(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function chordAt(id, st, bar) {
    var T = TRACKS[id]; if (!T) return null;
    var p = parts(id, st, bar), prog = (p.encore && T.encoreChords) || T.chords;
    return parseChord(prog[mod(mod(bar, T.bars), prog.length)]);
  }

  /* ---------------- time maths ---------------- */
  function stepDur(bpm) { return 15 / bpm; }
  function beatDur(bpm) { return 60 / bpm; }
  function barDur(bpm) { return 240 / bpm; }
  function loopSeconds(bpm, bars) { return bars * 240 / bpm; }
  /* audio time of global step s (s < 0 = count-in); odd 16ths swing late */
  function stepTime(anchor, bpm, s, swing) {
    var d = 15 / bpm;
    return anchor + s * d + (swing && mod(s, 2) === 1 ? swing * d : 0);
  }
  function stepAt(anchor, bpm, t) { return Math.floor((t - anchor) / (15 / bpm) + 1e-9); }
  function nextDownbeat(anchor, bpm, t) {
    var b = 240 / bpm;
    return anchor + Math.ceil((t - anchor) / b - 1e-9) * b;
  }
  function nextBeatStep(s) { return (Math.ceil(s / 4) * 4) || 0; }
  /* whole beats of count-in that fit before the downbeat */
  function countInBeats(sec, bpm) { return sec > 0 && bpm > 0 ? Math.floor(sec * bpm / 60 + 1e-6) : 0; }
  /* the steps due in [.., now + ahead), starting at `next` (lookahead window) */
  function scheduleWindow(anchor, bpm, next, now, ahead, swing, max) {
    var out = [], s = next, lim = max || 96;
    while (out.length < lim) {
      var t = stepTime(anchor, bpm, s, swing);
      if (t >= now + ahead) break;
      out.push({ s: s, t: t });
      s++;
    }
    return { steps: out, next: s };
  }
  /* beat-lock: the anchor (audio time of logic t = 0) implied by a clock reading */
  function lockAnchor(audioNow, clockSec, comp) { return audioNow - clockSec - (comp || 0); }
  function clockDrift(anchor, audioNow, clockSec, comp) { return lockAnchor(audioNow, clockSec, comp) - anchor; }
  function needsResync(drift, thr) { return Math.abs(drift) > (thr == null ? RESYNC : thr); }
  /* position inside a looping file */
  function loopPos(pos, loop) { return loop.start + mod(pos, loop.len); }

  /* ---------------- musical state (what set()/layer()/key() change) ---------------- */
  var SECTION_NAMES = ['rehearsal', 'verse', 'prechorus', 'chorus', 'bridge', 'final', 'encore'];
  var SECTION_ALIAS = { bouncebridge: 4, finalchorus: 5, intro: 0 };
  function sectionOf(v) {
    if (typeof v === 'number' && isFinite(v)) return clamp(Math.round(v), 0, 6);
    var s = String(v == null ? '' : v).toLowerCase().replace(/[^a-z]/g, ''), i = SECTION_NAMES.indexOf(s);
    return i >= 0 ? i : (SECTION_ALIAS[s] != null ? SECTION_ALIAS[s] : 0);
  }
  function themeOf(v) {
    var s = String(v || '').toLowerCase();
    return /beach/.test(s) ? 'beach' : /snow/.test(s) ? 'snow' : /candy/.test(s) ? 'candy' : 'meadow';
  }
  function levelFromHype(h) {
    h = +h; if (!isFinite(h)) return 0;
    h = clamp(h, 0, 1);
    return h >= 0.75 ? 3 : h >= 0.5 ? 2 : h >= 0.25 ? 1 : 0;
  }
  var LAYER_ALIAS = { hats: 'hat', hihat: 'hat', hihats: 'hat', openhat: 'ohat', openhats: 'ohat', open_hats: 'ohat',
    melody: 'lead', horns: 'stab', horn: 'stab', brass: 'stab', stabs: 'stab', arps: 'arp', sparkle: 'arp', crowd_swell: 'crowd' };
  function layerName(n) { n = String(n || '').toLowerCase(); return LAYER_ALIAS[n] || n; }
  function freshPending(id) {
    var T = TRACKS[id];
    return { level: T ? T.level : 3, fever: false, section: 0, theme: 'meadow', key: 0, encore: false, curtain: false,
      riser: 0, lastHeart: false, layers: {} };
  }
  /* channel.set(name, value) on the pending state; false if the name is unknown */
  function setValue(p, name, v) {
    switch (String(name)) {
      case 'hype': p.level = levelFromHype(v); return true;
      case 'mult': p.level = clamp(Math.round(+v || 1) - 1, 0, 3); return true;
      case 'level': case 'layers': p.level = clamp(Math.round(+v || 0), 0, 4); return true;
      case 'fever': p.fever = !!v; return true;
      case 'section': p.section = sectionOf(v); return true;
      case 'theme': case 'variant': p.theme = themeOf(v); return true;
      case 'encore': p.encore = !!v; return true;
      case 'curtain': p.curtain = !!v; return true;
      case 'riser': if (v) p.riser++; return true;
      case 'key': p.key = clamp(Math.round(+v || 0), -12, 12); return true;
      case 'spotlight': p.layers.arp = !!v; return true;
      case 'lastHeart': p.lastHeart = !!v; return true;
    }
    return false;
  }
  /* the runner's round.musicState() -> pending (polled every tick when given) */
  function applyMusicState(p, ms) {
    if (!ms || typeof ms !== 'object') return p;
    if (ms.section != null) p.section = sectionOf(ms.section);
    if (ms.mult != null) setValue(p, 'mult', ms.mult);
    else if (ms.hype != null) setValue(p, 'hype', ms.hype);
    if (ms.fever != null) p.fever = !!ms.fever;
    if (ms.phase === 'encore') p.section = 6;
    p.curtain = !!(ms.curtain || ms.phase === 'curtain');
    if (ms.lastHeart != null) p.lastHeart = !!ms.lastHeart;
    return p;
  }
  function copyLayers(l) { var o = {}; for (var k in l) if (l[k] != null) o[k] = !!l[k]; return o; }
  /* arrangement changes land musically: layers/hype/fever on the next beat,
     section/key/theme/encore and risers on the next downbeat */
  function latch(T, st, p, s) {
    var beat = mod(s, 4) === 0, bar = mod(s, 16) === 0;
    if (!beat && !bar) return st;
    var n = {}, k;
    for (k in st) n[k] = st[k];
    if (beat) { n.level = p.level; n.fever = p.fever; n.curtain = p.curtain; n.layers = copyLayers(p.layers); }
    if (bar) {
      n.section = p.section; n.theme = p.theme; n.key = p.key; n.encore = p.encore;
      n.riserBar = p.riser !== st.riserAck; n.riserAck = p.riser;
    }
    n.transpose = (n.key | 0) + (n.fever && T.feverLift ? T.feverLift : 0);
    return n;
  }
  function initState(T, p, countFirst) {
    var st = latch(T, { riserAck: p.riser }, p, 0);
    st.riserBar = false;
    st.countFirst = countFirst | 0;
    return st;
  }

  /* ---------------- arrangement: which parts play in this bar ---------------- */
  function parts(id, st, bar) {
    var T = TRACKS[id], L = st.level | 0, lb = mod(bar, T ? T.bars : 16), p;
    switch (id) {
      case 'island_day':
        p = { kick: 1, clap: 1, hat: 1, bass: 1, lead: lb < 8, arp: lb >= 8, arpRate: 8, steel: lb % 2 === 1, chime: lb === T.bars - 1 };
        break;
      case 'island_showtime':
        p = { kick: 1, clap: 1, ohat: 1, bass: 1, arp: 1, arpRate: 16, pad: 1, pump: 1, chime: lb % 4 === 3 };
        break;
      case 'shop':
        p = { kick: 1, clap: 1, hat: 1, bass: 1, lead: 1, keys: 1, crackle: 1 };
        break;
      case 'course':
        if (st.curtain) { p = { pad: 1, lead: 1 }; break; }            /* a kind curtain call: just pad and bells */
        p = { kick: 1, clap: 1, bass: 1, hat: L >= 1, arp: L >= 2, arpRate: 16, stab: L >= 3 && lb % 2 === 1, fill: L >= 1 && lb % 8 === 7 };
        if (st.fever) { p.pad = 1; p.pump = 1; p.ohat = 1; p.hat = 1; p.arp = 1; p.lead = 1; p.stab = 0; }
        if (st.section === 4) { p.half = 1; p.lead = 1; p.arp = 0; p.stab = 0; }   /* Bounce Bridge */
        if (st.section === 5) p.arpOct = 12;                                      /* Final Chorus */
        if (st.section === 6 || st.encore) p.encore = 1;                          /* Encore: Bb major */
        if (st.theme === 'beach') p.steel = L >= 1;
        if (st.theme === 'candy') p.arpBell = 1;
        p.riser = p.roll = !!st.riserBar;
        break;
      case 'penalty':
        p = { tom: 1, clap: 1, crowd: lb % 4 === 3, hat: L >= 1, bass: L >= 2, stab: L >= 2 && lb % 2 === 0,
          hey: L >= 2 && lb % 4 === 3, arp: L >= 3, arpRate: 8 };
        if (L >= 4 || st.encore) { p.ohat = 1; p.hat = 0; p.pad = 1; p.pump = 1; p.hey = 1; p.arp = 1; p.arpRate = 16; }
        break;
      case 'kart':
        p = { kick: 1, clap: 1, bass: 1, hat: 1, stab: L >= 2, lead: L >= 3 && lb % 16 >= 8, roll: lb % 8 === 7, riser: lb % 8 === 7,
          arp: 0, arpRate: 16, ohat: (st.transpose | 0) > 0 || !!st.encore };
        break;
      default: p = {};
    }
    var l = st.layers;
    if (l) {
      for (var k in l) {
        if (l[k] == null) continue;
        if (k === 'drums') { p.kick = p.clap = p.tom = l[k]; } else p[k] = l[k];
      }
    }
    return p;
  }

  /* ---------------- the Pocket Band: events for one 16th step ---------------- */
  function ev(i, m, v, d, pri) { return { i: i, m: m, v: v, d: d, p: pri }; }
  function crackleAt(s) { var h = Math.imul(s + 7919, 2654435761) >>> 0; return (h >>> 7) % 5 === 0; }
  function countInEvents(T, s, out) {
    if (T.countIn === 'kickhats') {
      if (mod(s, 4) === 0) out.push(ev('kick', 0, MIX.kick, 0.25, PRI.count));
      if (mod(s, 2) === 0) out.push(ev('hat', 0, 0.1, 0.035, PRI.hat));
    } else if (mod(s, 4) === 0) {
      var e = ev('tap', 0, MIX.tap, 0.07, PRI.count); e.f = 2600; out.push(e);
    }
  }
  /* pure: the voice events for global step s of track id in state st */
  function bandEvents(id, st, s, bpm) {
    var T = TRACKS[id], out = [];
    if (!T) return out;
    bpm = bpm || T.bpm;
    if (s < 0) { if (s >= (st.countFirst | 0)) countInEvents(T, s, out); return out; }
    var bar = Math.floor(s / 16), k = s - bar * 16, lb = mod(bar, T.bars);
    var P = PATTERNS[id], V = mixOf(id), p = parts(id, st, bar);
    var prog = (p.encore && T.encoreChords) || T.chords;
    var ch = parseChord(prog[mod(lb, prog.length)]), tr = st.transpose | 0, sd = 15 / bpm;
    function on(list) { return !!list && list.indexOf(k) >= 0; }
    function up(list) { return list.map(function (m) { return m + tr; }); }
    var e;
    /* drums */
    if (p.kick && on(p.half ? P.kickHalf : P.kick)) { e = ev('kick', 0, V.kick, 0.25, PRI.kick); if (p.pump) e.pump = 1; out.push(e); }
    if (p.tom && on(P.tom)) { e = ev('tom', 0, V.tom, 0.2, PRI.tom); if (p.pump) e.pump = 1; out.push(e); }
    var clapped = false;
    if (p.clap && on(p.half ? P.clapHalf : P.clap)) { out.push(ev('clap', 0, V.clap, 0.14, PRI.clap)); clapped = true; }
    if (p.roll && !clapped && on(P.roll)) {
      var r = (P.roll.indexOf(k) + 1) / P.roll.length;
      out.push(ev('clap', 0, V.clap * (0.4 + 0.6 * r), 0.12, PRI.roll));
    }
    if (p.ohat && on(P.ohat)) out.push(ev('ohat', 0, V.ohat, 0.18, PRI.hat));
    else if (p.hat && on(P.hat)) {
      if (id === 'course' && st.theme === 'snow') out.push(ev('sleigh', 0, V.hat, 0.1, PRI.hat));
      else out.push(ev('hat', 0, V.hat, 0.035, PRI.hat));
    }
    /* bass: one root per chord; course bounces root/octave on the even steps */
    if (p.bass && on(P.bass)) {
      var bm = placeRoot(ch.root, REG.bass) + tr;
      if (P.bassOct && P.bass.indexOf(k) % 2 === 1) bm += 12;
      out.push(ev('bass', bm, V.bass, T.bassDur || 0.2, PRI.bass));
    }
    /* chords: one per bar */
    if (p.pad && k === 0) out.push(ev('pad', up(padNotes(ch, REG.pad)), V.pad, 240 / bpm * 0.98, PRI.pad));
    if (p.keys && on(P.keys)) out.push(ev('keys', up(padNotes(ch, REG.keys)), V.keys, 0.8, PRI.pad));
    if (p.stab && on(P.stab)) {
      var lo = id === 'penalty' ? REG.horn : REG.stab;
      out.push(ev('brass', up([chordTone(ch, 0, lo), chordTone(ch, 1, lo), chordTone(ch, 2, lo)]), V.brass, T.stabDur || 0.12, PRI.stab));
    }
    /* up-the-chord arpeggio: 8ths or 16ths */
    if (p.arp) {
      var rate = p.arpRate || 8;
      if (rate === 16 || k % 2 === 0) {
        var ai = (rate === 16 ? k : k / 2) % 4, am = chordTone(ch, ai, REG.arp + (p.arpOct || 0)) + tr;
        if (p.arpBell) out.push(ev('bell', am + 12, V.arp, 0.3, PRI.arp));          /* candy: music box */
        else out.push(ev('pluck', am, V.arp, rate === 16 ? 0.16 : 0.22, PRI.arp));
      }
    }
    /* melody */
    if (p.lead && MELODY[id]) {
      var M = MELODY[id], ph = mod(bar, 2) ? M.B : M.A, j = ph.s.indexOf(k);
      if (j >= 0) out.push(ev(M.inst, chordTone(ch, ph.n[j], M.lo) + tr, V.lead, M.d, PRI.lead));
    }
    /* accents and ear candy */
    if (p.steel && on(P.steel)) out.push(ev('bell', chordTone(ch, 4, REG.steel) + tr, V.steel, 0.22, PRI.accent));
    if (p.chime && on(P.chime)) out.push(ev('bell', chordTone(ch, 3 + P.chime.indexOf(k), REG.chime) + tr, V.chime, 0.45, PRI.accent));
    if (p.fill && on(P.fill)) out.push(ev('slide', [chordTone(ch, 0, REG.fill) + tr, chordTone(ch, 3, REG.fill) + tr + 7], V.slide, 0.3, PRI.fx));
    if (p.riser && k === 0) out.push(ev('riser', 0, V.riser, 240 / bpm, PRI.fx));
    if (p.crowd && on(P.crowd)) out.push(ev('swell', 0, V.swell, 4 * sd, PRI.fx));
    if (p.hey && on(P.hey)) out.push(ev('hey', 0, V.hey, 0.2, PRI.hey));
    if (p.crackle && crackleAt(s)) out.push(ev('crackle', 0, V.crackle, 0.01, PRI.crackle));
    return out;
  }
  function voicesOf(e) { return Array.isArray(e.m) && e.i !== 'slide' ? e.m.length : 1; }
  function voiceLen(e) { return (e.d || 0) + (TAIL[e.i] || 0); }
  /* the 12-voice cap: drop the lowest-priority events when the pool is full.
     pool = array of voice end times (mutated). */
  function admitVoices(pool, evs, t, max) {
    max = max || MAX_VOICES;
    for (var i = pool.length - 1; i >= 0; i--) if (pool[i] <= t) pool.splice(i, 1);
    var sorted = evs.slice().sort(function (a, b) { return b.p - a.p; }), out = [];
    for (var j = 0; j < sorted.length; j++) {
      var e = sorted[j], n = voicesOf(e);
      if (pool.length + n > max) continue;
      for (var q = 0; q < n; q++) pool.push(t + voiceLen(e));
      out.push(e);
    }
    return out;
  }

  /* ---------------- files, tone, settings ---------------- */
  function parseManifest(json) {
    var out = {};
    if (!json || typeof json !== 'object') return out;
    function num(v, lo, hi) { v = +v; return isFinite(v) && v >= lo && v <= hi ? v : null; }
    function add(e, key) {
      var name = typeof e === 'string' ? e : (e && (e.name || e.track)) || key;
      if (typeof name !== 'string') return;
      name = name.replace(/\.mp3$/i, '');
      if (!/^[a-z0-9_]{1,40}$/.test(name)) return;
      var ent = { name: name, file: 'audio/music/' + name + '.mp3' };
      if (e && typeof e === 'object') {
        var bpm = num(e.bpm, 30, 300), bars = num(e.bars, 1, 512), off = num(e.offset, 0, 10), gain = num(e.gain, 0, 2);
        if (bpm) ent.bpm = bpm;
        if (bars) ent.bars = Math.round(bars);
        if (off != null) ent.offset = off;
        if (gain != null) ent.gain = gain;
      }
      out[name] = ent;
    }
    var list = Array.isArray(json) ? json : (Array.isArray(json.tracks) ? json.tracks : null);
    if (list) list.forEach(function (e) { add(e); });
    else Object.keys(json).forEach(function (k) { var v = json[k]; if (v === true || v === 1) add(k); else if (v && typeof v === 'object') add(v, k); });
    return out;
  }
  /* loop region of a decoded file: bar-exact when the manifest gives bpm + bars */
  function loopPoints(ent, duration, bpm) {
    ent = ent || {};
    var dur = +duration || 0, start = clamp(+ent.offset || 0, 0, Math.max(0, dur - 0.05)), len = dur - start, exact = false;
    if (ent.bpm > 0 && ent.bars > 0) {
      var want = ent.bars * 240 / ent.bpm;
      if (want <= len + 0.05) { len = want; exact = true; }
    }
    return { start: start, len: Math.max(0.05, len), bpm: ent.bpm || bpm || 0, exact: exact };
  }
  /* which file this deck wants now (fever / encore alternates when listed) */
  function fileFor(id, st, has) {
    if (typeof has !== 'function') return null;
    if (st.fever && has(id + '_fever')) return id + '_fever';
    if ((st.encore || (st.key | 0) !== 0) && has(id + '_encore')) return id + '_encore';
    return has(id) ? id : null;
  }
  /* the mix lowpass for this state (0 = open). Files can't drop layers, so hype opens a filter instead. */
  function toneFor(id, st, mode) {
    var T = TRACKS[id]; if (!T) return 0;
    if (mode === 'file') {
      if (st.fever || st.encore || !T.fileTone) return 0;
      return T.fileTone[clamp(st.level | 0, 0, T.fileTone.length - 1)] || 0;
    }
    if (st.curtain) return 2200;
    if (id === 'course' && st.section === 4) return 1400;
    return 0;
  }
  function readEnabled(storage) {
    try { var v = storage && storage.getItem(STORE_KEY); return !(v === '0' || v === 'off' || v === 'false'); } catch (e) { return true; }
  }
  function writeEnabled(storage, on) {
    try { if (!storage) return false; storage.setItem(STORE_KEY, on ? '1' : '0'); return true; } catch (e) { return false; }
  }
  /* ms argument: default when missing; values under 10 are read as seconds
     (some specs write duck(0.4, 0.35)); capped */
  function normMs(v, def, max) {
    v = +v;
    if (!isFinite(v) || v < 0) return def;
    if (v > 0 && v < 10) v *= 1000;
    return Math.min(v, max || 10000);
  }
  function islandTrack(c) { return ISLAND_ALIAS[String(c || '').toLowerCase()] || null; }

  /* ================================================================
     ENGINE
     ================================================================ */
  /* minimal copies of the app's synth rack (index.html), used only when the
     page has none (e.g. a lab harness). Same recipes; they route via ctx._slBus. */
  function lbus(ctx) {
    if (ctx._slBus) return ctx._slBus;
    if (!ctx._slMusicDry) { var z = ctx.createGain(); z.gain.value = 0; z.connect(ctx.destination); ctx._slMusicDry = { input: ctx.destination, echo: z }; }
    return ctx._slMusicDry;
  }
  function localNoise(ctx) {
    if (ctx._slNoise) return ctx._slNoise;
    var len = ctx.sampleRate | 0, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return (ctx._slNoise = buf);
  }
  function both(node, bus) { node.connect(bus.input); if (bus.echo) node.connect(bus.echo); }
  var LOCAL = {
    _beep: function (ctx, freq, t, durMs, o) {
      o = o || {};
      var wave = o.wave || 'sine', vol = o.vol == null ? 0.18 : o.vol, attack = o.attack == null ? 10 : o.attack, release = o.release == null ? 60 : o.release;
      var bus = lbus(ctx), gn = ctx.createGain(), lp = ctx.createBiquadFilter(), end = t + durMs / 1000;
      lp.type = 'lowpass'; lp.Q.value = 0.6;
      lp.frequency.setValueAtTime(Math.min(9000, Math.max(1100, freq * (wave === 'square' || wave === 'sawtooth' ? 2.2 : 3.5))), t);
      gn.gain.setValueAtTime(0, t);
      gn.gain.linearRampToValueAtTime(vol, t + Math.max(4, attack) / 1000);
      gn.gain.exponentialRampToValueAtTime(Math.max(0.0004, vol * 0.004), end);
      gn.gain.linearRampToValueAtTime(0, end + release / 1000);
      [-4, 4].forEach(function (cents, i) {
        var osc = ctx.createOscillator(), trim = ctx.createGain();
        osc.type = wave; osc.frequency.setValueAtTime(freq, t);
        if (osc.detune) osc.detune.setValueAtTime(cents, t);
        trim.gain.value = i === 0 ? 0.62 : 0.5;
        osc.connect(trim); trim.connect(lp);
        osc.start(t); osc.stop(end + release / 1000 + 0.02);
      });
      lp.connect(gn); both(gn, bus);
    },
    _slide: function (ctx, f0, f1, t, durMs, o) {
      o = o || {};
      var vol = o.vol == null ? 0.15 : o.vol, bus = lbus(ctx), osc = ctx.createOscillator(), gn = ctx.createGain(), lp = ctx.createBiquadFilter(), end = t + durMs / 1000;
      lp.type = 'lowpass'; lp.Q.value = 0.7;
      lp.frequency.setValueAtTime(Math.min(9000, Math.max(1100, Math.max(f0, f1) * 2.2)), t);
      osc.type = o.wave || 'sawtooth';
      osc.frequency.setValueAtTime(f0, t); osc.frequency.linearRampToValueAtTime(f1, end);
      gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(vol, t + 0.008);
      gn.gain.exponentialRampToValueAtTime(Math.max(0.0004, vol * 0.004), end); gn.gain.linearRampToValueAtTime(0, end + 0.04);
      osc.connect(lp); lp.connect(gn); both(gn, bus);
      osc.start(t); osc.stop(end + 0.08);
    },
    _pluck: function (ctx, freq, t, o) {
      o = o || {};
      var vol = o.vol == null ? 0.2 : o.vol, dur = o.dur == null ? 0.5 : o.dur, bus = lbus(ctx);
      [[1, 1, dur], [3.9, 0.22, dur * 0.28]].forEach(function (pt) {
        var osc = ctx.createOscillator(), gn = ctx.createGain();
        osc.type = 'sine'; osc.frequency.setValueAtTime(freq * pt[0], t);
        gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(vol * pt[1], t + 0.004);
        gn.gain.exponentialRampToValueAtTime(0.0004, t + pt[2]);
        osc.connect(gn); both(gn, bus); osc.start(t); osc.stop(t + pt[2] + 0.02);
      });
    },
    _bell: function (ctx, freq, t, o) {
      o = o || {};
      var vol = o.vol == null ? 0.14 : o.vol, dur = o.dur == null ? 0.9 : o.dur, bus = lbus(ctx);
      [[1, 1], [2.76, 0.35], [5.4, 0.12]].forEach(function (pt) {
        var osc = ctx.createOscillator(), gn = ctx.createGain();
        osc.type = 'sine'; osc.frequency.setValueAtTime(freq * pt[0], t);
        gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(vol * pt[1], t + 0.006);
        gn.gain.exponentialRampToValueAtTime(0.0004, t + dur * (pt[0] > 2 ? 0.4 : 1));
        osc.connect(gn); both(gn, bus); osc.start(t); osc.stop(t + dur + 0.05);
      });
    },
    _brass: function (ctx, freq, t, dur, o) {
      o = o || {};
      var vol = o.vol == null ? 0.14 : o.vol, bus = lbus(ctx), lp = ctx.createBiquadFilter(), gn = ctx.createGain();
      lp.type = 'lowpass'; lp.Q.value = 1.1;
      lp.frequency.setValueAtTime(freq * 1.4, t); lp.frequency.linearRampToValueAtTime(freq * 5.5, t + 0.06); lp.frequency.linearRampToValueAtTime(freq * 2.2, t + dur);
      gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(vol, t + 0.02);
      gn.gain.setValueAtTime(vol, t + Math.max(0.02, dur - 0.09)); gn.gain.exponentialRampToValueAtTime(0.0004, t + dur + 0.12);
      [-6, 5].forEach(function (cents) {
        var osc = ctx.createOscillator(), trim = ctx.createGain();
        osc.type = 'sawtooth'; osc.frequency.setValueAtTime(freq, t);
        if (osc.detune) osc.detune.setValueAtTime(cents, t);
        trim.gain.value = 0.5; osc.connect(trim); trim.connect(lp);
        osc.start(t); osc.stop(t + dur + 0.16);
      });
      lp.connect(gn); both(gn, bus);
    },
    _thump: function (ctx, t, o) {
      o = o || {};
      var f = o.f == null ? 95 : o.f, vol = o.vol == null ? 0.3 : o.vol, bus = lbus(ctx), osc = ctx.createOscillator(), gn = ctx.createGain();
      osc.type = 'sine'; osc.frequency.setValueAtTime(f, t); osc.frequency.exponentialRampToValueAtTime(Math.max(30, f * 0.5), t + 0.1);
      gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(vol, t + 0.006); gn.gain.exponentialRampToValueAtTime(0.0004, t + 0.24);
      osc.connect(gn); gn.connect(bus.input); osc.start(t); osc.stop(t + 0.3);
    },
    _tap: function (ctx, t, o) {
      o = o || {};
      var vol = o.vol == null ? 0.16 : o.vol, f = o.f == null ? 1700 : o.f, bus = lbus(ctx);
      var src = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), gn = ctx.createGain();
      src.buffer = localNoise(ctx); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 7;
      gn.gain.setValueAtTime(vol, t); gn.gain.exponentialRampToValueAtTime(0.0004, t + 0.055);
      src.connect(bp); bp.connect(gn); gn.connect(bus.input); src.start(t); src.stop(t + 0.07);
      var osc = ctx.createOscillator(), g2 = ctx.createGain();
      osc.type = 'sine'; osc.frequency.setValueAtTime(f * 0.62, t);
      g2.gain.setValueAtTime(vol * 0.5, t); g2.gain.exponentialRampToValueAtTime(0.0004, t + 0.045);
      osc.connect(g2); g2.connect(bus.input); osc.start(t); osc.stop(t + 0.06);
    },
    _swell: function (ctx, t, dur, o) {
      o = o || {};
      var vol = o.vol == null ? 0.1 : o.vol, bus = lbus(ctx), src = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), gn = ctx.createGain();
      src.buffer = localNoise(ctx); src.loop = true;
      bp.type = 'bandpass'; bp.Q.value = 1.4;
      bp.frequency.setValueAtTime(260, t); bp.frequency.exponentialRampToValueAtTime(1500, t + dur);
      gn.gain.setValueAtTime(0.0004, t); gn.gain.exponentialRampToValueAtTime(vol, t + dur); gn.gain.linearRampToValueAtTime(0, t + dur + 0.06);
      src.connect(bp); bp.connect(gn); both(gn, bus); src.start(t); src.stop(t + dur + 0.1);
    }
  };

  /* the band's own instruments (art bible recipes), into an explicit output */
  function makeInst(noiseBuf) {
    function noise(c, t, dur) {
      var s = c.createBufferSource();
      s.buffer = noiseBuf(c); s.loop = true;
      s.start(t, Math.random() * 0.5); s.stop(t + dur);
      return s;
    }
    function env(gp, t, v, dur) {
      gp.setValueAtTime(Math.max(v, 1e-4), t);
      gp.exponentialRampToValueAtTime(Math.max(v * 0.003, 1e-4), t + dur);
      gp.linearRampToValueAtTime(0, t + dur + 0.01);
    }
    return {
      /* sine 150->45 Hz over 0.12 s, gain v->0 over 0.25 s, plus a tiny beater click for small speakers */
      kick: function (c, out, t, v) {
        var o = c.createOscillator(), g = c.createGain();
        o.type = 'sine'; o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
        g.gain.setValueAtTime(Math.max(v, 1e-4), t); g.gain.exponentialRampToValueAtTime(Math.max(v * 0.02, 1e-4), t + 0.22); g.gain.linearRampToValueAtTime(0, t + 0.25);
        o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.27);
        var k = c.createOscillator(), kg = c.createGain();
        k.type = 'triangle'; k.frequency.setValueAtTime(1100, t);
        env(kg.gain, t, v * 0.08, 0.012);
        k.connect(kg); kg.connect(out); k.start(t); k.stop(t + 0.03);
      },
      /* penalty floor tom: sine ~90 Hz, 0.2 s */
      tom: function (c, out, t, v) {
        var o = c.createOscillator(), g = c.createGain();
        o.type = 'sine'; o.frequency.setValueAtTime(96, t); o.frequency.exponentialRampToValueAtTime(78, t + 0.2);
        env(g.gain, t, v, 0.2);
        o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.22);
      },
      /* 3 noise bursts 10 ms apart through a 1.8 kHz bandpass (Q 1.2), 0.12 s decay */
      clap: function (c, out, t, v) {
        var s = noise(c, t, 0.17), bp = c.createBiquadFilter(), g = c.createGain();
        bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 1.2;
        for (var i = 0; i < 2; i++) { g.gain.setValueAtTime(v, t + i * 0.01); g.gain.exponentialRampToValueAtTime(Math.max(v * 0.25, 1e-4), t + i * 0.01 + 0.009); }
        env(g.gain, t + 0.02, v, 0.12);
        s.connect(bp); bp.connect(g); g.connect(out);
      },
      /* noise through a 7 kHz highpass: 35 ms closed, 0.18 s open */
      hat: function (c, out, t, v, dur) {
        var s = noise(c, t, dur + 0.02), hp = c.createBiquadFilter(), g = c.createGain();
        hp.type = 'highpass'; hp.frequency.value = 7000;
        env(g.gain, t, v, dur);
        s.connect(hp); hp.connect(g); g.connect(out);
      },
      /* snow course: sleigh-bell hats, 4 rapid taps through a 7 kHz bandpass */
      sleigh: function (c, out, t, v) {
        var s = noise(c, t, 0.12), bp = c.createBiquadFilter(), g = c.createGain();
        bp.type = 'bandpass'; bp.frequency.value = 7000; bp.Q.value = 3;
        for (var i = 0; i < 4; i++) { g.gain.setValueAtTime(v * (1 - i * 0.18), t + i * 0.022); g.gain.exponentialRampToValueAtTime(1e-4, t + i * 0.022 + 0.018); }
        s.connect(bp); bp.connect(g); g.connect(out);
      },
      /* triangle + square at -12 dB through a 600 Hz lowpass */
      bass: function (c, out, t, f, dur, v) {
        var lp = c.createBiquadFilter(), g = c.createGain(), o1 = c.createOscillator(), o2 = c.createOscillator(), sq = c.createGain();
        lp.type = 'lowpass'; lp.frequency.value = 600; lp.Q.value = 0.8;
        o1.type = 'triangle'; o2.type = 'square';
        o1.frequency.setValueAtTime(f, t); o2.frequency.setValueAtTime(f, t);
        sq.gain.value = 0.25;
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.006); g.gain.setValueAtTime(v, t + dur * 0.6);
        g.gain.exponentialRampToValueAtTime(Math.max(v * 0.004, 1e-4), t + dur); g.gain.linearRampToValueAtTime(0, t + dur + 0.02);
        o1.connect(lp); o2.connect(sq); sq.connect(lp); lp.connect(g); g.connect(out);
        o1.start(t); o2.start(t); o1.stop(t + dur + 0.04); o2.stop(t + dur + 0.04);
      },
      /* 2 saws per note detuned +-7 cents through a 1.2 kHz lowpass, 0.3 s attack */
      pad: function (c, out, t, freqs, dur, v) {
        var lp = c.createBiquadFilter(), g = c.createGain(), att = Math.min(0.3, dur * 0.4);
        lp.type = 'lowpass'; lp.frequency.value = 1200; lp.Q.value = 0.5;
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + att);
        g.gain.setValueAtTime(v, t + Math.max(att, dur - 0.05)); g.gain.linearRampToValueAtTime(0, t + dur + 0.15);
        freqs.forEach(function (f) {
          [-7, 7].forEach(function (cents) {
            var o = c.createOscillator();
            o.type = 'sawtooth'; o.frequency.setValueAtTime(f, t);
            if (o.detune) o.detune.setValueAtTime(cents, t);
            o.connect(lp); o.start(t); o.stop(t + dur + 0.2);
          });
        });
        lp.connect(g); g.connect(out);
      },
      /* a wordless crowd 'hey': three rough voices through two vowel formants */
      hey: function (c, out, t, v) {
        var f1 = c.createBiquadFilter(), f2 = c.createBiquadFilter(), g = c.createGain();
        f1.type = 'bandpass'; f1.frequency.value = 720; f1.Q.value = 4;
        f2.type = 'bandpass'; f2.frequency.value = 1150; f2.Q.value = 5;
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.012);
        g.gain.exponentialRampToValueAtTime(Math.max(v * 0.003, 1e-4), t + 0.18); g.gain.linearRampToValueAtTime(0, t + 0.2);
        [196, 233, 262].forEach(function (f, i) {
          var o = c.createOscillator();
          o.type = 'sawtooth'; o.frequency.setValueAtTime(f * 1.06, t + i * 0.006); o.frequency.exponentialRampToValueAtTime(f, t + 0.15);
          o.connect(f1); o.connect(f2); o.start(t + i * 0.006); o.stop(t + 0.22);
        });
        noise(c, t, 0.2).connect(f2);
        f1.connect(g); f2.connect(g); g.connect(out);
      },
      /* noise riser: highpass 400 Hz -> 8 kHz across the bar */
      riser: function (c, out, t, dur, v) {
        var s = noise(c, t, dur + 0.05), hp = c.createBiquadFilter(), g = c.createGain();
        hp.type = 'highpass'; hp.frequency.setValueAtTime(400, t); hp.frequency.exponentialRampToValueAtTime(8000, t + dur);
        g.gain.setValueAtTime(1e-4, t); g.gain.exponentialRampToValueAtTime(Math.max(v, 1e-4), t + dur); g.gain.linearRampToValueAtTime(0, t + dur + 0.04);
        s.connect(hp); hp.connect(g); g.connect(out);
      },
      /* faint vinyl tick for the lo-fi shop */
      crackle: function (c, out, t, v) {
        var s = noise(c, t, 0.02), hp = c.createBiquadFilter(), g = c.createGain();
        hp.type = 'highpass'; hp.frequency.value = 2500;
        env(g.gain, t, v, 0.006);
        s.connect(hp); hp.connect(g); g.connect(out);
      }
    };
  }

  function createEngine(env) {
    env = env || {};
    var g = env.g || {};
    var ISLAND = { id: 0, island: true, stage: 'play', muted: null, gen: 0, pending: freshPending('island_day') };
    var E = {
      ctx: null, N: null, noAudio: false, decks: [], cur: null, owner: null, island: null, menuBy: null,
      gestured: false, hidden: !!(env.hidden && env.hidden()), enabled: null, timer: null, pool: [],
      manifest: null, manP: null, bufs: {}, loads: {}, bad: {}, lru: [], wantLoad: {}, memory: {},
      duckEnd: 0, duckLevel: 1, seq: 0, deckSeq: 0, tok: 0, waitingFor: null,
      fadeOn: false, fadeOffAt: 0, silent: false, stageApplied: null, t0: perf()
    };
    var INST = makeInst(noiseBuf);

    function perf() { try { return env.now ? +env.now() : Date.now() / 1000; } catch (e) { return Date.now() / 1000; } }
    function store() { try { return env.storage ? env.storage() : null; } catch (e) { return null; } }
    function isEnabled() { if (E.enabled == null) E.enabled = readEnabled(store()); return E.enabled; }
    function H(name) { return typeof g[name] === 'function' ? g[name] : LOCAL[name]; }
    function noiseBuf(c) {
      if (typeof g._noiseBuf === 'function') { try { var b = g._noiseBuf(c); if (b) return b; } catch (e) {} }
      return localNoise(c);
    }
    function mutedNow() {
      var f = E.owner && E.owner.muted;
      try { if (typeof f === 'function') return !!f(); } catch (e) {}
      try { return env.mutedDefault ? !!env.mutedDefault() : false; } catch (e) { return false; }
    }
    function gestured() {
      if (E.gestured) return true;
      var a = null;
      try { a = env.activated ? env.activated() : null; } catch (e) {}
      if (a === true) E.gestured = true;
      return E.gestured;
    }
    function openHz() { return Math.min(OPEN, (E.ctx && E.ctx.sampleRate ? E.ctx.sampleRate / 2 : 44100) - 100); }
    /* audio heard at T + outputLatency, a frame is shown ~16 ms after its rAF */
    function comp() { var L = E.ctx && E.ctx.outputLatency; return typeof L === 'number' && isFinite(L) ? clamp(L - 0.016, 0, 0.1) : 0; }
    /* param automation that knows where it is: each param remembers its last
       segment (p._sl) so a new ramp starts from the true value at `at` (portable
       stand-in for cancelAndHoldAtTime, which Firefox lacks) */
    function valAt(p, x) {
      var a = p._sl;
      if (!a) return p.value;
      if (x >= a.t1) return a.v1;
      if (x <= a.t0) return a.v0;
      var k = (x - a.t0) / (a.t1 - a.t0);
      return a.exp && a.v0 > 0 && a.v1 > 0 ? a.v0 * Math.pow(a.v1 / a.v0, k) : a.v0 + (a.v1 - a.v0) * k;
    }
    function rampFrom(p, v0, v, at, dur, exp) {
      try {
        p.cancelScheduledValues(at);
        p.setValueAtTime(v0, at);
        if (!(dur > 0.001)) { p.setValueAtTime(v, at); dur = 0; }
        else if (exp) p.exponentialRampToValueAtTime(Math.max(1e-4, v), at + dur);
        else p.linearRampToValueAtTime(v, at + dur);
        p._sl = { v0: v0, t0: at, v1: v, t1: at + dur, exp: !!exp };
      } catch (e) { try { p.value = v; } catch (e2) {} }
    }
    function rampAt(p, v, at, dur, exp) { rampFrom(p, exp ? Math.max(1e-4, valAt(p, at)) : valAt(p, at), v, at, dur, exp); }
    /* the app's helpers find their bus via _sfxBus(ctx) -> ctx._slBus; point it at
       a deck for one synchronous call so they play into the music graph */
    function route(c, bus, fn) {
      var had = Object.prototype.hasOwnProperty.call(c, '_slBus'), prev = c._slBus;
      c._slBus = bus;
      try { fn(); } finally { if (had) c._slBus = prev; else delete c._slBus; }
    }

    /* ---------- audio context + graph (only after a user gesture) ---------- */
    function ensureCtx() {
      if (E.ctx) return E.ctx;
      if (E.noAudio || !gestured() || !env.ctx) return null;
      var c = null;
      try { c = env.ctx(); } catch (e) { c = null; }
      if (!c || typeof c.createGain !== 'function') { E.noAudio = !c; return null; }
      try { buildGraph(c); } catch (e) { E.noAudio = true; return null; }
      E.ctx = c;
      if (c.state === 'suspended' && c.resume) { try { c.resume().catch(function () {}); } catch (e) {} }
      var want = Object.keys(E.wantLoad);
      E.wantLoad = {};
      loadManifest().then(function () { want.forEach(loadBuf); });
      return c;
    }
    function lowpass(c, hz) { var f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = hz; f.Q.value = 0.7; return f; }
    function buildGraph(c) {
      var N = {}, open = Math.min(OPEN, (c.sampleRate || 44100) / 2 - 100);
      N.pre = c.createGain();
      N.menuLP = lowpass(c, open); N.fxLP = lowpass(c, open); N.toneLP = lowpass(c, open);
      N.stage = c.createGain(); N.duck = c.createGain();
      N.fade = c.createGain(); N.fade.gain.value = 0;
      N.comp = c.createDynamicsCompressor();
      try { N.comp.threshold.value = -14; N.comp.knee.value = 12; N.comp.ratio.value = 3; N.comp.attack.value = 0.006; N.comp.release.value = 0.25; } catch (e) {}
      N.bus = c.createGain(); N.bus.gain.value = BUS_GAIN;                 /* the musicBus */
      N.pre.connect(N.menuLP); N.menuLP.connect(N.fxLP); N.fxLP.connect(N.toneLP); N.toneLP.connect(N.stage);
      N.stage.connect(N.duck); N.duck.connect(N.fade); N.fade.connect(N.comp); N.comp.connect(N.bus); N.bus.connect(c.destination);
      /* a darkened tempo echo for the helpers' echo send */
      N.echoIn = c.createGain();
      N.delay = c.createDelay(1); N.delay.delayTime.value = 0.35;
      N.dark = lowpass(c, 1600); N.fb = c.createGain(); N.fb.gain.value = 0.22; N.wet = c.createGain(); N.wet.gain.value = 0.1;
      N.echoIn.connect(N.delay); N.delay.connect(N.dark); N.dark.connect(N.fb); N.fb.connect(N.delay); N.dark.connect(N.wet); N.wet.connect(N.pre);
      E.N = N;
    }

    /* ---------- manifest + decoded files ---------- */
    function loadManifest() {
      if (E.manP) return E.manP;
      var p;
      try { p = env.fetchJSON ? Promise.resolve(env.fetchJSON(MANIFEST_URL)) : Promise.resolve(null); } catch (e) { p = Promise.resolve(null); }
      E.manP = p.then(function (j) { E.manifest = parseManifest(j); return E.manifest; }, function () { E.manifest = {}; return E.manifest; });
      return E.manP;
    }
    function listed(name) { return !!(E.manifest && E.manifest[name] && !E.bad[name]); }
    function decode(c, ab) {
      return new Promise(function (res, rej) {
        try { var r = c.decodeAudioData(ab, res, rej); if (r && typeof r.then === 'function') r.then(res, rej); } catch (e) { rej(e); }
      });
    }
    function touch(name) { var i = E.lru.indexOf(name); if (i >= 0) E.lru.splice(i, 1); E.lru.push(name); }
    function inUse(name) { return E.decks.some(function (d) { return d.fileName === name || d.slots.some(function (s) { return s.name === name; }); }); }
    function evict() {
      for (var i = 0; E.lru.length > MAX_BUFS && i < E.lru.length; i++) {
        var n = E.lru[i];
        if (!inUse(n)) { delete E.bufs[n]; E.lru.splice(i, 1); i--; }
      }
    }
    /* resolves to the decoded entry or null — never rejects */
    function loadBuf(name) {
      if (E.bufs[name]) { touch(name); return Promise.resolve(E.bufs[name]); }
      if (E.loads[name]) return E.loads[name];
      if (!E.ctx) { E.wantLoad[name] = 1; return Promise.resolve(null); }
      if (!listed(name) || !env.fetchBuf) return Promise.resolve(null);
      var ent = E.manifest[name], c = E.ctx;
      var p = Promise.resolve().then(function () { return env.fetchBuf(ent.file); })
        .then(function (ab) { return decode(c, ab); })
        .then(function (buf) {
          var base = TRACKS[name] || TRACKS[name.replace(/_(fever|encore)$/, '')];
          E.bufs[name] = { buf: buf, loop: loopPoints(ent, buf.duration, base && base.bpm), gain: ent.gain == null ? 1 : ent.gain };
          touch(name); evict();
          return E.bufs[name];
        }, function () { E.bad[name] = true; return null; })
        .then(function (r) { delete E.loads[name]; return r; });
      E.loads[name] = p;
      return p;
    }
    /* call cb once the track's file is decoded (or known absent), at most `ms` later */
    function whenReady(track, ms, cb) {
      if (E.manifest && (!listed(track) || E.bufs[track])) return cb();
      var done = false;
      function go() { if (!done) { done = true; cb(); } }
      loadManifest().then(function () { if (!listed(track)) return go(); return loadBuf(track).then(go); }, go);
      if (env.setTimeout) env.setTimeout(go, ms); else go();
    }
    function bpmOk(d, name) {
      var ent = E.manifest && E.manifest[name];
      return !(ent && ent.bpm && Math.abs(ent.bpm - d.bpm) / d.bpm > 0.005);
    }

    /* ---------- decks (one playing track; a retiring one may overlap a crossfade) ---------- */
    function stageOf(d) { return d.owner === ISLAND ? 'play' : d.owner.stage; }
    function isFrozen(d) { return !!(d.holds.paused || d.holds.hidden); }
    function readClock(d) { try { var c = +d.clock(); return isFinite(c) ? c : NaN; } catch (e) { return NaN; } }
    function newDeck(owner, tr) {
      var c = E.ctx, T = TRACKS[tr], ent = E.manifest && E.manifest[tr];
      var bpm = (owner !== ISLAND && owner.bpm) || (ent && ent.bpm) || T.bpm;
      var out = c.createGain(), synthOut = c.createGain(), pad = c.createGain();
      out.gain.value = 0;
      pad.connect(synthOut); synthOut.connect(out); out.connect(E.N.pre);
      return {
        id: ++E.deckSeq, owner: owner, gen: owner.gen, track: tr, T: T, bpm: bpm,
        out: out, synthOut: synthOut, padGain: pad, bus: { input: synthOut, echo: E.N.echoIn },
        mode: 'synth', fileName: null, slots: [], synthUntil: Infinity, endAt: Infinity, retired: false,
        holds: {}, anchor: 0, nextStep: 0, startStep: 0, frozenStep: 0, frozenPos: 0,
        st: initState(T, owner.pending, 0), pending: owner.pending,
        clock: owner === ISLAND ? null : owner.clock, lastC: NaN, lastMoveAt: 0, waiting: false, err: 0, toneHz: -1
      };
    }
    function startDeck(owner, tr, how) {
      var c = E.ctx, now = c.currentTime, old = E.cur, d = newDeck(owner, tr), sd = stepDur(d.bpm);
      if (owner === ISLAND) d.startStep = (E.memory[tr] || 0) * 16;
      d.nextStep = d.startStep;
      var fresh = owner !== ISLAND && perf() - owner.playAt < 0.3;
      if (owner !== ISLAND && !fresh && owner.stage === 'count') owner.stage = 'play';
      if (how === 'xfade' && old && !isFrozen(old) && !old.waiting && old.anchor <= now) {
        /* crossfade over one bar, starting on the playing track's next downbeat */
        var at = nextDownbeat(old.anchor, old.bpm, now + LOOKAHEAD + 0.02);
        d.anchor = at - d.startStep * sd;
        rampAt(d.out.gain, 1, at, barDur(d.bpm));
        retire(old, at, barDur(d.bpm));
      } else {
        if (old) retire(old, now, old.owner === owner ? 0.08 : CUT_FADE);
        var cin = fresh ? owner.countInSec : 0, beats = countInBeats(cin, d.bpm);
        if (cin > 0) {
          d.st.countFirst = -beats * 4; d.nextStep = d.st.countFirst;
          d.anchor = now + cin - comp();                                        /* downbeat lands on GO */
        } else d.anchor = now + 0.06 - d.startStep * sd;
        rampAt(d.out.gain, 1, now, owner === ISLAND ? SHOW_FADE : 0.02);
      }
      if (d.clock) { d.lastC = readClock(d); d.lastMoveAt = now; d.waiting = stageOf(d) === 'play'; }
      E.cur = d; E.decks.push(d);
      if (E.N.delay) { try { E.N.delay.delayTime.setTargetAtTime(Math.min(0.6, 0.75 * beatDur(d.bpm)), now, 0.05); } catch (e) {} }
      loadManifest().then(function () { if (listed(tr)) loadBuf(tr); });    /* decoded in time for GO, or swapped in on a later bar */
      updateFade(false);
      applyStage(0.3);
      applyTone(d, now);
      ensureTimer();
      service(d, now);
      return d;
    }
    function retire(d, at, dur) {
      if (E.cur === d) E.cur = null;
      if (d.retired) { d.endAt = Math.min(d.endAt, at + dur + 0.05); return; }
      d.retired = true;
      if (d.owner === ISLAND) {
        var pos = isFrozen(d) ? d.frozenPos : at - d.anchor;
        E.memory[d.track] = mod(Math.ceil(pos / barDur(d.bpm) - 1e-6), d.T.bars);
      }
      if (isFrozen(d) || !E.ctx) { d.endAt = E.ctx ? E.ctx.currentTime : 0; return; }
      rampAt(d.out.gain, 0, at, dur);
      stopSlots(d, at, dur);
      d.endAt = at + dur + 0.05;
    }
    function dispose(d) {
      stopSlots(d, E.ctx ? E.ctx.currentTime : 0, 0);
      try { d.out.disconnect(); } catch (e) {}
      var i = E.decks.indexOf(d); if (i >= 0) E.decks.splice(i, 1);
      if (E.cur === d) E.cur = null;
    }
    function freeze(d, why, fade) {
      var was = isFrozen(d); d.holds[why] = true;
      if (was || !E.ctx) return;
      var now = E.ctx.currentTime;
      d.frozenStep = d.nextStep; d.frozenPos = now - d.anchor;
      rampAt(d.out.gain, 0, now, fade);
      stopSlots(d, now, fade);
    }
    function thaw(d, why, fade) {
      if (!d.holds[why]) return;
      d.holds[why] = false;
      if (isFrozen(d) || !E.ctx) return;
      var now = E.ctx.currentTime, sd = stepDur(d.bpm);
      if (d.clock && stageOf(d) === 'play') { d.waiting = true; d.lastC = readClock(d); d.lastMoveAt = now; }
      else if (d.mode === 'file' && d.frozenPos >= 0) {
        d.anchor = now + 0.05 - d.frozenPos;
        d.nextStep = Math.ceil(d.frozenPos / sd - 1e-9);
        if (d.fileName) startSlot(d, d.fileName, now + 0.05, 0.02);
      } else { d.anchor = now + 0.05 - stepTime(0, d.bpm, d.frozenStep, 0); d.nextStep = d.frozenStep; }
      rampAt(d.out.gain, 1, now, fade);
    }

    /* ---------- file slots ---------- */
    function startSlot(d, name, at, xfade) {
      var b = E.bufs[name], c = E.ctx;
      if (!b || !c) return false;
      var when = Math.max(at, c.currentTime), src = c.createBufferSource(), gn = c.createGain(), base = b.gain;
      src.buffer = b.buf; src.loop = true; src.loopStart = b.loop.start; src.loopEnd = b.loop.start + b.loop.len;
      gn.gain.setValueAtTime(xfade > 0 ? 0 : base, when);
      if (xfade > 0) gn.gain.linearRampToValueAtTime(base, when + xfade);
      gn.gain._sl = { v0: xfade > 0 ? 0 : base, t0: when, v1: base, t1: when + Math.max(0, xfade), exp: false };
      src.connect(gn); gn.connect(d.out);
      try { src.start(when, loopPos(when - d.anchor, b.loop)); } catch (e) { return false; }
      stopSlots(d, when, xfade > 0 ? xfade : 0.02);
      d.slots = [{ name: name, src: src, gain: gn }];
      d.fileName = name; touch(name);
      return true;
    }
    function stopSlots(d, at, dur) {
      d.slots.forEach(function (s) {
        rampAt(s.gain.gain, 0, at, dur);
        try { s.src.stop(at + dur + 0.02); } catch (e) {}
      });
      d.slots = [];
    }

    /* ---------- the stage: menu 60% behind 1.2 kHz, count-in 40% behind 800 Hz, GO = drop ---------- */
    function graphStage() {
      var d = E.cur;
      if (d && d.owner !== ISLAND) {
        var s = d.owner.stage;
        return s === 'paused' ? (E.stageApplied || 'play') : (s === 'menu' || s === 'count' ? s : 'play');
      }
      return E.menuBy ? 'menu' : 'play';
    }
    function dropSweep(now) {
      if (E.N) rampFrom(E.N.fxLP.frequency, COUNT_LP, openHz(), now, DROP_SEC, true);   /* 800 Hz -> open over 0.5 s */
    }
    function applyStage(fade) {
      if (!E.N) return;
      var now = E.ctx.currentTime, st = graphStage(), prev = E.stageApplied;
      if (st === prev) return;
      E.stageApplied = st;
      var gainT = st === 'menu' ? MENU_GAIN : st === 'count' ? COUNT_GAIN : 1;
      var quick = prev === 'count' && st === 'play';
      rampAt(E.N.stage.gain, gainT, now, quick ? 0.05 : fade);
      rampAt(E.N.menuLP.frequency, st === 'menu' ? MENU_LP : openHz(), now, fade, true);
      if (st === 'count') rampAt(E.N.fxLP.frequency, COUNT_LP, now, 0.05, true);
      else if (quick) dropSweep(now);
      else if (prev === 'count') rampAt(E.N.fxLP.frequency, openHz(), now, fade, true);
    }
    function applyTone(d, t) {
      if (d !== E.cur || !E.N) return;
      var hz = toneFor(d.track, d.st, d.mode) || openHz();
      if (hz === d.toneHz) return;
      d.toneHz = hz;
      rampAt(E.N.toneLP.frequency, hz, Math.max(t, E.ctx.currentTime), 0.25, true);
    }
    function goPlay(d, now) {
      if (!d.clock) return;
      d.waiting = false; d.lastC = readClock(d); d.lastMoveAt = now;
    }
    function audibleTarget() { return isEnabled() && !mutedNow() && !E.hidden; }
    function updateFade(force) {
      if (!E.N) return;
      var on = audibleTarget(), now = E.ctx.currentTime;
      if (on === E.fadeOn && !force) return;
      E.fadeOn = on;
      var f = on ? SHOW_FADE : (E.hidden ? HIDE_FADE : MUTE_FADE);
      rampAt(E.N.fade.gain, on ? 1 : 0, now, f);
      if (!on) E.fadeOffAt = now + f;
    }

    /* ---------- beat-lock ---------- */
    function snap(d, anchor, now) {
      d.anchor = anchor; d.err = 0;
      var first = Math.ceil((now + 0.005 - anchor) / stepDur(d.bpm));
      if (d.nextStep < first) d.nextStep = first;       /* never repeat a step; skip what is now past */
      if (d.mode === 'file' && d.fileName) startSlot(d, d.fileName, now + 0.03, 0.03);
    }
    function rejoin(d, anchor, now) {
      d.waiting = false; d.anchor = anchor; d.err = 0;
      /* on the next logic beat (one that is under 40 ms old still counts, so a fresh start keeps its downbeat) */
      d.nextStep = Math.max(d.st.countFirst | 0, nextBeatStep(Math.ceil((now - 0.04 - anchor) / stepDur(d.bpm))));
      if (d.mode === 'file' && d.fileName) startSlot(d, d.fileName, stepTime(anchor, d.bpm, d.nextStep, 0), 0.03);
    }
    function lockClock(d, now) {
      var c = readClock(d);
      if (!isFinite(c)) return true;                     /* a broken clock just free-runs */
      if (c !== d.lastC) {
        d.lastC = c; d.lastMoveAt = now;
        if (d.waiting) { rejoin(d, lockAnchor(now, c, comp()), now); return true; }
      } else if (now - d.lastMoveAt > STALL) {
        if (!d.waiting) { d.waiting = true; stopSlots(d, now, 0.05); }
        return false;
      }
      if (d.waiting) return false;
      var target = lockAnchor(now, c, comp()), drift = target - d.anchor;
      if (needsResync(drift)) { snap(d, target, now); return true; }
      if (d.mode !== 'file') {                           /* slew small drift away (smoothed), at most 2 ms a tick */
        d.err = d.err * 0.9 + drift * 0.1;
        if (Math.abs(d.err) > SLEW) { var n = clamp(d.err, -0.002, 0.002); d.anchor += n; d.err -= n; }
      }
      return true;
    }

    /* ---------- the scheduler ---------- */
    function barBoundary(d, s, t) {
      if (!E.manifest) return;
      var want = fileFor(d.track, d.st, listed);
      if (want && !bpmOk(d, want)) want = bpmOk(d, d.track) && listed(d.track) ? d.track : null;
      if (want === d.fileName) return;
      if (want) {
        if (!E.bufs[want]) { loadBuf(want); return; }  /* keep what plays until it decodes */
        var xf = s === d.startStep ? 0 : d.mode === 'file' ? beatDur(d.bpm) : barDur(d.bpm);
        if (!startSlot(d, want, t, xf)) return;
        if (d.mode !== 'file') { d.mode = 'file'; d.synthUntil = t + xf; rampAt(d.synthOut.gain, 0, t, xf); }
      } else if (d.mode === 'file') {
        var bt = beatDur(d.bpm);
        stopSlots(d, t, bt); d.fileName = null; d.mode = 'synth'; d.synthUntil = Infinity;
        rampAt(d.synthOut.gain, 1, t, bt);
      }
    }
    function pump(d, t) {
      var p = d.padGain.gain;                             /* pad dips to 40% for 120 ms on each kick */
      p.setValueAtTime(1, t); p.linearRampToValueAtTime(0.4, t + 0.008); p.linearRampToValueAtTime(1, t + 0.12);
    }
    function playEvent(d, e, t) {
      var c = E.ctx, out = d.synthOut;
      switch (e.i) {
        case 'kick': INST.kick(c, out, t, e.v); if (e.pump) pump(d, t); return;
        case 'tom': INST.tom(c, out, t, e.v); if (e.pump) pump(d, t); return;
        case 'clap': INST.clap(c, out, t, e.v); return;
        case 'hat': case 'ohat': INST.hat(c, out, t, e.v, e.d); return;
        case 'sleigh': INST.sleigh(c, out, t, e.v); return;
        case 'bass': INST.bass(c, out, t, midiHz(e.m), e.d, e.v); return;
        case 'pad': INST.pad(c, d.padGain, t, e.m.map(midiHz), e.d, e.v); return;
        case 'hey': INST.hey(c, out, t, e.v); return;
        case 'riser': INST.riser(c, out, t, e.d, e.v); return;
        case 'crackle': INST.crackle(c, out, t, e.v); return;
      }
      route(c, d.bus, function () {
        switch (e.i) {
          case 'pluck': H('_pluck')(c, midiHz(e.m), t, { vol: e.v, dur: e.d }); break;
          case 'bell': H('_bell')(c, midiHz(e.m), t, { vol: e.v, dur: e.d }); break;
          case 'keys': e.m.forEach(function (m) { H('_pluck')(c, midiHz(m), t, { vol: e.v, dur: e.d }); }); break;
          case 'brass': e.m.forEach(function (m) { H('_brass')(c, midiHz(m), t, e.d, { vol: e.v }); }); break;
          case 'lead': H('_beep')(c, midiHz(e.m), t, e.d * 1000, { wave: 'square', vol: e.v }); break;
          case 'slide': H('_slide')(c, midiHz(e.m[0]), midiHz(e.m[1]), t, e.d * 1000, { wave: 'sine', vol: e.v }); break;
          case 'swell': H('_swell')(c, t, e.d, { vol: e.v }); break;
          case 'tap': H('_tap')(c, t, { vol: e.v, f: e.f || 2600 }); break;
        }
      });
    }
    function scheduleStep(d, s, t, now) {
      d.st = latch(d.T, d.st, d.pending, s);
      if (s >= 0 && mod(s, 16) === 0) barBoundary(d, s, t);
      if (mod(s, 4) === 0) applyTone(d, t);
      if (t < now - LATE || t >= d.endAt || E.silent) return;
      if (s >= 0 && d.mode === 'file' && t >= d.synthUntil) return;
      var evs = bandEvents(d.track, d.st, s, d.bpm);
      if (!evs.length) return;
      var ok = admitVoices(E.pool, evs, t, MAX_VOICES), at = Math.max(t, now);
      for (var i = 0; i < ok.length; i++) { try { playEvent(d, ok[i], at); } catch (e) {} }
    }
    function service(d, now) {
      if (isFrozen(d)) return;
      if (d === E.cur && d.clock) {
        if (stageOf(d) === 'count') {                     /* the logic started without a menuMode(false): implicit GO */
          var c0 = readClock(d);
          if (isFinite(c0) && c0 > 0 && c0 !== d.lastC) { d.owner.stage = 'play'; goPlay(d, now); applyStage(0.05); }
        }
        if (stageOf(d) === 'play' && !lockClock(d, now)) return;
      }
      /* after a long stall don't grind through stale steps */
      if (now - stepTime(d.anchor, d.bpm, d.nextStep, 0) > 0.5) d.nextStep = Math.max(d.nextStep, stepAt(d.anchor, d.bpm, now));
      var w = scheduleWindow(d.anchor, d.bpm, d.nextStep, now, LOOKAHEAD, d.T.swing, 64);
      for (var i = 0; i < w.steps.length; i++) {
        d.nextStep = w.steps[i].s + 1;
        scheduleStep(d, w.steps[i].s, w.steps[i].t, now);
      }
    }
    function pollOwner() {
      var o = E.owner, d = E.cur;
      if (!o || o === ISLAND || !o.stateFn || !d || d.owner !== o) return;
      try { applyMusicState(o.pending, o.stateFn()); } catch (e) {}
    }
    function tick() {
      if (!E.ctx) return;
      var now = E.ctx.currentTime;
      updateFade(false);
      E.silent = !E.fadeOn && now > E.fadeOffAt + 0.05;
      pollOwner();
      E.decks.slice().forEach(function (d) {
        if (now >= d.endAt) { dispose(d); return; }
        try { service(d, now); } catch (e) {}
      });
      for (var i = E.pool.length - 1; i >= 0; i--) if (E.pool[i] <= now) E.pool.splice(i, 1);
      if (!E.decks.length) stopTimer();
    }
    function ensureTimer() { if (!E.timer && env.setInterval) E.timer = env.setInterval(tick, TICK_MS); }
    function stopTimer() { if (E.timer && env.clearInterval) env.clearInterval(E.timer); E.timer = null; }

    /* ---------- who plays what ---------- */
    function apply() {
      var o = E.owner;
      if (!o || !isEnabled() || E.hidden) return;
      var tr = o === ISLAND ? E.island : o.track;
      if (!tr || !TRACKS[tr] || (o !== ISLAND && o.stage === 'paused')) return;
      if (E.cur && E.cur.owner === o && E.cur.track === tr && (o === ISLAND || E.cur.gen === o.gen)) return;
      if (!ensureCtx()) return;
      if (o === ISLAND) {
        if (E.waitingFor === tr) return;
        E.waitingFor = tr;
        var tok = ++E.tok;
        whenReady(tr, READY_WAIT_MS, function () {
          if (tok !== E.tok) return;
          E.waitingFor = null;
          if (E.owner !== ISLAND || E.island !== tr || !isEnabled() || E.hidden || !E.ctx) return;
          if (E.cur && E.cur.owner === ISLAND && E.cur.track === tr) return;
          startDeck(ISLAND, tr, 'xfade');
        });
      } else {
        E.tok++; E.waitingFor = null;
        startDeck(o, tr, 'cut');
      }
    }
    function onGesture() {
      E.gestured = true;
      if (E.ctx && E.ctx.state === 'suspended' && E.decks.length) { try { E.ctx.resume().catch(function () {}); } catch (e) {} }
      apply();
    }
    function onVisibility(hidden) {
      E.hidden = !!hidden;
      if (!E.ctx) { if (!hidden) apply(); return; }
      if (hidden) {
        E.decks.slice().forEach(function (d) { if (d !== E.cur) dispose(d); });
        if (E.cur) freeze(E.cur, 'hidden', HIDE_FADE);
      } else if (E.cur) thaw(E.cur, 'hidden', SHOW_FADE);
      updateFade(true);
      if (!hidden) { apply(); if (E.decks.length) ensureTimer(); }
    }

    /* ---------- public: global controls ---------- */
    function island(context, opts) {
      var tr = islandTrack(context);
      if (!tr) return false;
      E.island = tr;
      if (opts && typeof opts.muted === 'function') ISLAND.muted = opts.muted;
      if (E.owner && E.owner !== ISLAND && E.owner.track) return true;   /* a game has the music: resume on its stop */
      E.owner = ISLAND;
      apply();
      return true;
    }
    function stopAll(ms) {
      var f = normMs(ms, 200, 1500) / 1000;
      E.island = null; E.owner = null; E.menuBy = null; E.tok++; E.waitingFor = null;
      if (!E.ctx) return;
      var now = E.ctx.currentTime;
      E.decks.slice().forEach(function (d) { retire(d, now, f); });
      E.cur = null;
      rampAt(E.N.fxLP.frequency, openHz(), now, 0.2, true);
      applyStage(0.2);
    }
    function duck(level, ms) {
      if (!E.N) return;
      var lv = +level; if (!isFinite(lv)) lv = 0.4;
      lv = clamp(lv, 0, 1);
      var now = E.ctx.currentTime, hold = normMs(ms, 350, 3000) / 1000;
      if (now < E.duckEnd) lv = Math.min(lv, E.duckLevel);             /* ducks never stack */
      var end = Math.max(E.duckEnd, now + hold), p = E.N.duck.gain;
      rampAt(p, lv, now, 0.03);
      try { p.setValueAtTime(lv, end); p.linearRampToValueAtTime(1, end + 0.25); } catch (e) {}
      p._sl = { v0: lv, t0: end, v1: 1, t1: end + 0.25, exp: false };   /* held, then released */
      E.duckEnd = end; E.duckLevel = lv;
    }
    function setEnabled(on) {
      on = !!on;
      E.enabled = on;
      writeEnabled(store(), on);
      if (!E.ctx) { if (on) apply(); return on; }
      var now = E.ctx.currentTime;
      if (!on) { E.decks.slice().forEach(function (d) { retire(d, now, HIDE_FADE); }); E.cur = null; E.tok++; E.waitingFor = null; }
      updateFade(false);
      if (on) apply();
      return on;
    }
    /* the beat clock the island scene reads: beat = (performance.now()/1000 - t0) * bpm / 60.
       playing = a loop is running (it keeps time while muted; audible says if it is heard).
       With no music it is an internal clock at the context's tempo (100 day / 118 Showtime). */
    function clock() {
      var p = perf(), d = E.cur;
      if (d && E.ctx && !isFrozen(d) && !d.waiting) {
        var lat = E.ctx.outputLatency, t0 = p - (E.ctx.currentTime - d.anchor) + (typeof lat === 'number' && isFinite(lat) ? lat : 0);
        return { bpm: d.bpm, t0: t0, beat: (p - t0) * d.bpm / 60, playing: true, audible: !!E.fadeOn, track: d.track };
      }
      var bpm = E.island ? TRACKS[E.island].bpm : TRACKS.island_day.bpm;
      return { bpm: bpm, t0: E.t0, beat: (p - E.t0) * bpm / 60, playing: false, audible: false, track: null };
    }
    function preload(track) {
      var tr = String(track || '');
      return loadManifest().then(function () {
        var names = [tr, tr + '_fever', tr + '_encore'].filter(listed);
        if (!names.length) return false;
        if (!E.ctx) { names.forEach(function (n) { E.wantLoad[n] = 1; }); return true; }
        return loadBuf(tr).then(function (b) { return !!b; });
      });
    }
    function debugState() {
      var d = E.cur;
      return {
        enabled: isEnabled(), gestured: E.gestured, hidden: E.hidden, muted: mutedNow(), audible: E.fadeOn,
        owner: E.owner === ISLAND ? 'island' : E.owner ? 'channel:' + E.owner.name : null,
        island: E.island, track: d ? d.track : null, mode: d ? d.mode : null, file: d ? d.fileName : null,
        stage: E.stageApplied, bpm: d ? d.bpm : null, step: d ? d.nextStep : null,
        bar: d ? Math.floor(d.nextStep / 16) : null, level: d ? d.st.level : null, fever: d ? !!d.st.fever : null,
        transpose: d ? d.st.transpose : null, waiting: d ? d.waiting : null, voices: E.pool.length, decks: E.decks.length,
        files: E.manifest ? Object.keys(E.manifest) : null, decoded: Object.keys(E.bufs)
      };
    }

    /* ---------- public: a channel (one per game session) ---------- */
    function safe(fn) { return function () { try { return fn.apply(null, arguments); } catch (e) { return undefined; } }; }
    function channel(opts) {
      if (!opts || typeof opts !== 'object') opts = { name: opts == null ? 'game' : String(opts) };
      var ch = {
        id: ++E.seq, name: String(opts.name || 'game'), island: false,
        muted: typeof opts.muted === 'function' ? opts.muted : null,
        resumeIsland: opts.resumeIsland !== false,
        clock: typeof opts.clock === 'function' ? opts.clock : null,
        stateFn: typeof opts.state === 'function' ? opts.state : null,
        track: null, gen: 0, stage: 'idle', prevStage: 'play', countInSec: 0, bpm: 0, playAt: -1e9,
        pending: freshPending(null)
      };
      function owned() { return E.cur && E.cur.owner === ch ? E.cur : null; }
      function nowT() { return E.ctx ? E.ctx.currentTime : 0; }
      var api = {
        play: safe(function (track, o) {
          if (typeof o === 'number') o = { countInSec: o };
          if (!o || typeof o !== 'object') o = {};
          var tr = String(track || '');
          if (!TRACKS[tr]) return false;
          var theme = ch.pending.theme;
          ch.pending = freshPending(tr);
          ch.pending.theme = (o.theme || o.variant) ? themeOf(o.theme || o.variant) : theme;
          if (o.level != null) setValue(ch.pending, 'level', o.level);
          else if (o.hype != null) setValue(ch.pending, 'hype', o.hype);
          if ('clock' in o) ch.clock = typeof o.clock === 'function' ? o.clock : null;
          if ('state' in o) ch.stateFn = typeof o.state === 'function' ? o.state : null;
          ch.bpm = +o.bpm > 0 ? clamp(+o.bpm, 30, 300) : 0;
          ch.countInSec = clamp(+o.countInSec || 0, 0, 16);
          ch.track = tr; ch.gen++; ch.playAt = perf();
          ch.stage = ch.countInSec > 0 ? 'count' : 'play';
          if (E.menuBy === ch) E.menuBy = null;
          E.owner = ch;
          apply();
          return true;
        }),
        menuMode: safe(function (on) {
          on = !!on;
          var mine = E.owner === ch && ch.track;
          if (on) {
            if (mine) { if (ch.stage === 'paused') ch.prevStage = 'menu'; else ch.stage = 'menu'; }
            else E.menuBy = ch;                          /* a game menu over the island music: muffle it */
          } else if (mine) {
            if (ch.stage === 'paused') ch.prevStage = 'play';
            else {
              /* GO after the count-in: lock from here. (GO after a resume leaves a
                 beat-locked band waiting, so it rejoins on the next logic beat.) */
              var wasCount = ch.stage === 'count', d = owned();
              ch.stage = 'play';
              if (d && wasCount) goPlay(d, nowT());
            }
          } else if (E.menuBy === ch) E.menuBy = null;
          applyStage(0.3);
        }),
        pause: safe(function (ms) {
          if (ch.stage === 'paused' || ch.stage === 'idle') return;
          ch.prevStage = ch.stage; ch.stage = 'paused';
          var d = owned(); if (d) freeze(d, 'paused', normMs(ms, 200, 1500) / 1000);
        }),
        resume: safe(function (ms) {
          if (ch.stage !== 'paused') return;
          ch.stage = ch.prevStage || 'play';
          var d = owned();
          if (d) thaw(d, 'paused', normMs(ms, 300, 1500) / 1000);
          else if (E.owner === ch) apply();
          applyStage(0.05);
        }),
        stop: safe(function (ms) {
          var f = normMs(ms, 200, 1500) / 1000, mine = E.owner === ch;
          if (E.menuBy === ch) E.menuBy = null;
          ch.track = null; ch.stage = 'idle';
          if (!mine) { if (E.N) applyStage(0.3); return; }
          var d = owned();
          if (d) retire(d, nowT(), f);
          E.owner = ch.resumeIsland && E.island ? ISLAND : null;
          if (E.N) { rampAt(E.N.fxLP.frequency, openHz(), nowT(), 0.2, true); applyStage(0.3); }
          if (E.owner) apply();                         /* the island loop returns, fading in */
        }),
        set: safe(function (name, value) {
          name = String(name);
          if (name === 'clock') {
            ch.clock = typeof value === 'function' ? value : null;
            var d = owned();
            if (d) { d.clock = ch.clock; if (d.clock) { d.lastC = readClock(d); d.lastMoveAt = nowT(); d.waiting = stageOf(d) === 'play'; } else d.waiting = false; }
            return true;
          }
          if (name === 'state') { ch.stateFn = typeof value === 'function' ? value : null; return true; }
          if (name === 'lowpass') { api.lowpass(value, 0.3); return true; }
          return setValue(ch.pending, name, value);
        }),
        layer: safe(function (name, on) {
          var n = layerName(name);
          if (!n) return;
          if (on === null) delete ch.pending.layers[n];
          else ch.pending.layers[n] = on === undefined ? true : !!on;
        }),
        /* absolute transposition from the home key (key(+2) = up a tone), from the next bar */
        key: safe(function (semitones) { setValue(ch.pending, 'key', semitones); }),
        drop: safe(function () { if (owned() && E.N) dropSweep(nowT()); }),
        /* tell the band where the logic clock is; corrects drift over 80 ms */
        sync: safe(function (seconds) {
          var d = owned(), s = +seconds;
          if (!d || !E.ctx || !isFinite(s)) return;
          var now = nowT(), target = lockAnchor(now, s, comp());
          if (d.waiting) rejoin(d, target, now);
          else if (needsResync(target - d.anchor)) snap(d, target, now);
        }),
        /* penalty-style helpers */
        layers: safe(function (n) { setValue(ch.pending, 'level', n); }),
        lowpass: safe(function (hz, sec) {
          if (!E.N || !owned()) return;
          var f = +hz; if (!isFinite(f) || f <= 0) return;
          f = f >= OPEN ? openHz() : clamp(f, 60, openHz());
          rampAt(E.N.fxLP.frequency, f, nowT(), Math.max(0, +sec || 0), true);
        }),
        duck: safe(function (level, ms) { duck(level, ms); }),
        clock: safe(function () { return clock(); }),
        track: function () { return ch.track; }
      };
      return api;
    }

    if (env.listen) { try { env.listen(onGesture, onVisibility); } catch (e) {} }

    return {
      channel: channel, island: island, stopAll: stopAll, duck: duck,
      enabled: function () { return isEnabled(); }, setEnabled: setEnabled,
      toggle: function () { return setEnabled(!isEnabled()); },
      clock: clock, preload: preload, state: debugState,
      TRACKS: TRACKS,
      /* test / QA hooks */
      _tick: tick, _gesture: onGesture, _visibility: onVisibility, _nodes: function () { return E.N; }
    };
  }

  /* the real browser environment */
  function browserEnv(w) {
    var own = null;
    return {
      g: w,
      ctx: function () {
        if (typeof w.getAudioCtx === 'function') return w.getAudioCtx();
        if (!own) { var AC = w.AudioContext || w.webkitAudioContext; own = AC ? new AC() : null; }
        return own;
      },
      now: function () { return (w.performance && w.performance.now ? w.performance.now() : Date.now()) / 1000; },
      storage: function () { return w.localStorage; },
      fetchJSON: function (u) { return w.fetch(u).then(function (r) { if (!r.ok) throw new Error('missing'); return r.json(); }); },
      fetchBuf: function (u) { return w.fetch(u).then(function (r) { if (!r.ok) throw new Error('missing'); return r.arrayBuffer(); }); },
      setInterval: function (f, ms) { return w.setInterval(f, ms); },
      clearInterval: function (id) { w.clearInterval(id); },
      setTimeout: function (f, ms) { return w.setTimeout(f, ms); },
      activated: function () { var ua = w.navigator && w.navigator.userActivation; return ua ? !!ua.hasBeenActive : null; },
      hidden: function () { return !!(w.document && w.document.hidden); },
      mutedDefault: function () {
        var u = typeof w.currentUser === 'function' ? w.currentUser() : (typeof w.ensureUser === 'function' ? w.ensureUser() : null);
        return !!(u && u.muted);
      },
      listen: function (onGesture, onVisibility) {
        var opt = { capture: true, passive: true };
        ['pointerdown', 'touchend', 'keydown', 'mousedown'].forEach(function (n) { w.addEventListener(n, onGesture, opt); });
        w.document.addEventListener('visibilitychange', function () { onVisibility(w.document.hidden); });
      }
    };
  }

  return {
    /* data */
    TRACKS: TRACKS, TRACK_IDS: TRACK_IDS, PATTERNS: PATTERNS, MELODY: MELODY, PRI: PRI, STORE_KEY: STORE_KEY, MANIFEST_URL: MANIFEST_URL,
    LOOKAHEAD: LOOKAHEAD, TICK_MS: TICK_MS, MAX_VOICES: MAX_VOICES, RESYNC: RESYNC, BUS_GAIN: BUS_GAIN,
    /* harmony */
    parseChord: parseChord, chordTone: chordTone, padNotes: padNotes, placeRoot: placeRoot, midiHz: midiHz, chordAt: chordAt,
    /* time */
    stepDur: stepDur, beatDur: beatDur, barDur: barDur, loopSeconds: loopSeconds, stepTime: stepTime, stepAt: stepAt,
    nextDownbeat: nextDownbeat, nextBeatStep: nextBeatStep, countInBeats: countInBeats, scheduleWindow: scheduleWindow,
    lockAnchor: lockAnchor, clockDrift: clockDrift, needsResync: needsResync, loopPos: loopPos,
    /* state + arrangement */
    freshPending: freshPending, setValue: setValue, applyMusicState: applyMusicState, latch: latch, initState: initState,
    levelFromHype: levelFromHype, sectionOf: sectionOf, themeOf: themeOf, layerName: layerName,
    parts: parts, bandEvents: bandEvents, admitVoices: admitVoices, voicesOf: voicesOf,
    /* files, tone, settings */
    parseManifest: parseManifest, loopPoints: loopPoints, fileFor: fileFor, toneFor: toneFor,
    readEnabled: readEnabled, writeEnabled: writeEnabled, normMs: normMs, islandTrack: islandTrack,
    /* engine */
    createEngine: createEngine, browserEnv: browserEnv
  };
}));
