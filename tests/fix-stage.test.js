/* node --test tests/   (Node 22+)
   Regression tests for the stage fixes (branch fix/stage):
   - #34 AdaptiveQuality (tier.js) must not step down on one-off long frames, and a
     lower tier is saved only on evidence from two page sessions (stage.js
     demotionVerdict), with a dated, expiring saved tier (savedTierFrom);
   - #9  routine (restored) WebGL context losses never end or remember 3D; only
     strikes do (stage.js ContextLossPolicy);
   - #15 a holder stacked under a game hears about a loss/restore it missed when it
     is handed the renderer back (stage.js contextDue);
   - #41 pagehide parks the shared renderer instead of disposing it (source guard);
   - device fallbacks (branch fix5/device), run in a fake browser below: a 2D record
     expires after REMEMBER_DAYS (stage, shell and photocards agree); a performance
     fallback above LOW saves LOW and ends 3D for the session only, and only the
     island's own loop at LOW remembers 2D (never a game's frames); forget() ("Try 3D
     again") clears the record, the pending demotion and the strikes so 3D boots again. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const T = require('../world/island3d/tier.js');
const S = require('../world/island3d/stage.js');

/* ---------------- #34 AdaptiveQuality ---------------- */
/* feed frames; interval/work may be functions of the frame index k; returns actions with times */
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
    if (a) out.push(Object.assign({ at: now, k }, a));
  }
  return { actions: out, now };
}
const F60 = 1000 / 60;

test('#34 one long frame anywhere early in a fresh window never steps quality down (60 fps and the 30 fps idle target)', () => {
  /* the reviewer's reproduction: one 640-999 ms interval at samples 1-30 fired 'pixelRatio' at ~2 s */
  for (const hitch of [300, 450, 640, 700, 860, 950, 999]) {
    for (const at of [0, 1, 2, 5, 10, 20, 29, 30, 31, 45, 60]) {
      const aq = T.AdaptiveQuality();
      const r = drive(aq, { ms: 12000, interval: k => (k === at ? hitch : F60), work: 4 });
      assert.equal(r.actions.length, 0, `hitch ${hitch} ms at sample ${at}`);
    }
  }
  for (const hitch of [550, 600, 900]) {
    for (const at of [0, 3, 15, 29]) {
      const aq = T.AdaptiveQuality();
      const r = drive(aq, { ms: 12000, interval: k => (k === at ? hitch : 1000 / 30), work: 4, target: 1000 / 30 });
      assert.equal(r.actions.length, 0, `idle 30 fps: hitch ${hitch} ms at sample ${at}`);
    }
  }
});

test('#34 two or three early hitches, and frames just under the hitch threshold, do not step either', () => {
  const two350 = T.AdaptiveQuality();
  assert.equal(drive(two350, { ms: 12000, interval: k => (k === 3 || k === 9 ? 350 : F60), work: 4 }).actions.length, 0, 'two 350 ms hitches');
  const three240 = T.AdaptiveQuality();
  assert.equal(drive(three240, { ms: 12000, interval: k => (k === 2 || k === 8 || k === 14 ? 240 : F60), work: 4 }).actions.length, 0,
    'three 240 ms frames (counted, but the average does not STAY slow for 2 s)');
  /* a shader compile: a huge work sample on a normal interval, then the long interval it causes */
  const compile = T.AdaptiveQuality();
  const r = drive(compile, { ms: 12000, interval: k => (k === 40 ? 716 : F60), work: k => (k === 39 ? 700 : 4) });
  assert.equal(r.actions.length, 0, 'a compile hitch (work then interval)');
  assert.ok(compile.stats().hitches >= 2, 'the stall was skipped as hitches');
  /* the lit-program recompile right after a step lands in the fresh window: it must not cause the next step */
  const after = T.AdaptiveQuality();
  const slow = drive(after, { ms: 8000, interval: 33.4, work: 28 });
  const first = slow.actions.filter(a => a.type === 'step');
  assert.ok(first.length >= 1, 'genuinely slow frames step');
  const before = after.level;
  const r2 = drive(after, { start: slow.now, ms: 12000, interval: k => (k === 1 ? 700 : F60), work: k => (k === 0 ? 650 : 4) });
  assert.equal(r2.actions.length, 0, 'a recompile hitch after a step, then healthy frames');
  assert.equal(after.level, before);
});

test('#34 warm-up: the first 0.5 s after every reset is not measured', () => {
  const aq = T.AdaptiveQuality();
  drive(aq, { ms: 400, interval: F60, work: 4 });
  assert.equal(aq.stats().samples, 0, 'nothing counted inside the warm-up');
  drive(aq, { start: 400, ms: 400, interval: F60, work: 4 });
  assert.ok(aq.stats().samples > 0, 'counted after it');
  aq.reset();
  assert.equal(aq.stats().samples, 0);
  drive(aq, { start: 800, ms: 300, interval: F60, work: 4 });
  assert.equal(aq.stats().samples, 0, 'a reset starts a new warm-up');
  /* a monster first frame after a (re)start (uploads, a rebuild after a context restore) is inside it */
  const boot = T.AdaptiveQuality();
  assert.equal(drive(boot, { ms: 12000, interval: k => (k === 0 ? 990 : k === 1 ? 400 : F60), work: k => (k === 0 ? 900 : 4) }).actions.length, 0);
});

test('#34 sustained slowness still steps (no backdating: only after the average stayed slow for 2 s) and falls back', () => {
  const aq = T.AdaptiveQuality();
  const r = drive(aq, { ms: 30000, interval: 33.4, work: 28 });
  const steps = r.actions.filter(a => a.type === 'step');
  assert.deepEqual(steps.map(a => a.step), T.LADDER);
  assert.ok(steps[0].at >= 0.5 * 1000 + 2000, 'warm-up + a full 2 s hold before the first step (' + steps[0].at + ')');
  for (let i = 1; i < steps.length; i++) assert.ok(steps[i].at - steps[i - 1].at >= 2000);
  /* back-to-back stalls ARE the frame rate: a device at ~3 fps steps all the way and falls back */
  const crawl = T.AdaptiveQuality();
  const rc = drive(crawl, { ms: 90000, interval: 300, work: 280 });
  const types = rc.actions.map(a => a.type);
  assert.equal(types.filter(t => t === 'step').length, T.LADDER.length, 'every step');
  assert.equal(types[types.length - 1], 'fallback', 'then the 2D fallback');
  /* stalls separated by healthy frames are not sustained */
  const jank = T.AdaptiveQuality();
  assert.equal(drive(jank, { ms: 20000, interval: k => (k % 40 === 39 ? 400 : F60), work: 4 }).actions.length, 0, 'a 400 ms stall every 40 frames');
});

/* ---------------- #34 saved tier: two-session evidence and expiry ---------------- */
const DAY = 24 * 3600 * 1000;
test('#34 a lower tier is saved only when two different page sessions each needed 2 steps', () => {
  const now = 1.8e12;
  const first = S.demotionVerdict(null, 'MID', 'sA', now);
  assert.equal(first.save, null, 'one session is not enough');
  assert.equal(typeof first.pend, 'string');
  assert.deepEqual(JSON.parse(first.pend), { tier: 'MID', sid: 'sA', at: now });
  assert.deepEqual(S.demotionVerdict(first.pend, 'MID', 'sA', now + 5000), { save: null, pend: undefined }, 'the same session again: still pending');
  const second = S.demotionVerdict(first.pend, 'MID', 'sB', now + 3 * DAY);
  assert.deepEqual(second, { save: 'MID', pend: null }, 'a second session confirms');
  /* the two sessions agree on the higher of their tiers */
  assert.equal(S.demotionVerdict(JSON.stringify({ tier: 'LOW', sid: 'sA', at: now }), 'MID', 'sB', now + DAY).save, 'MID');
  assert.equal(S.demotionVerdict(JSON.stringify({ tier: 'MID', sid: 'sA', at: now }), 'LOW', 'sB', now + DAY).save, 'MID');
  /* stale, garbage or foreign records start a new vote */
  const stale = S.demotionVerdict(JSON.stringify({ tier: 'MID', sid: 'sA', at: now - 15 * DAY }), 'MID', 'sB', now);
  assert.equal(stale.save, null); assert.equal(JSON.parse(stale.pend).sid, 'sB');
  assert.equal(S.demotionVerdict('{nope', 'MID', 'sB', now).save, null);
  assert.equal(S.demotionVerdict(JSON.stringify({ tier: 'TURBO', sid: 'sA', at: now }), 'MID', 'sB', now).save, null);
  assert.equal(S.demotionVerdict(JSON.stringify({ tier: 'MID', sid: 'sA', at: now + 3 * DAY }), 'MID', 'sB', now).save, null, 'a record from the future');
  assert.deepEqual(S.demotionVerdict(null, 'bogus', 'sA', now), { save: null, pend: undefined });
  assert.equal(S.TIER_POLICY.pendMaxAgeMs, 14 * DAY);
});

test('#34 the saved measured tier is dated and expires (a false save is never permanent)', () => {
  const now = 1.8e12, max = S.TIER_POLICY.savedMaxAgeMs;
  assert.equal(max, 30 * DAY);
  assert.deepEqual(S.savedTierFrom(null, now, max), { tier: null, at: null, expired: false, legacy: false });
  assert.deepEqual(S.savedTierFrom('LOW', now, max), { tier: 'LOW', at: null, expired: false, legacy: true }, 'a bare value from before: kept, re-dated by the stage');
  assert.deepEqual(S.savedTierFrom(' mid ', now, max).tier, 'MID');
  const raw = S.savedTierRaw('LOW', now);
  assert.deepEqual(JSON.parse(raw), { tier: 'LOW', at: now });
  assert.deepEqual(S.savedTierFrom(raw, now + 10 * DAY, max), { tier: 'LOW', at: now, expired: false, legacy: false });
  assert.deepEqual(S.savedTierFrom(raw, now + 31 * DAY, max), { tier: null, at: now, expired: true, legacy: false }, 're-measured after 30 days');
  assert.equal(S.savedTierFrom('{"tier":"MID"}', now, max).legacy, true);
  assert.equal(S.savedTierFrom('garbage', now, max).expired, true, 'garbage is cleared');
  assert.equal(S.savedTierFrom('{"tier":"TURBO","at":1}', now, max).expired, true);
  /* tierToSave still never raises a saved tier */
  assert.equal(S.tierToSave('LOW', 'MID'), null);
  assert.equal(S.tierToSave(null, 'MID'), 'MID');
});

/* ---------------- #9 context-loss policy ---------------- */
const P = S.CONTEXT_POLICY;
test('#9 routine losses that are restored never end 3D, however many there are', () => {
  let now = 1e12;
  const c = S.ContextLossPolicy({ now });
  for (let i = 0; i < 50; i++) {
    /* the app is backgrounded (iOS drops the context), then comes back and restores it */
    c.visible(true, now += 60000);
    assert.deepEqual(c.lost(now += 1000), { act: 'wait', armMs: 0 }, 'no restore clock while hidden');
    assert.deepEqual(c.visible(false, now += 3600000), { armMs: P.restoreMs }, 'the clock starts on return');
    assert.deepEqual(c.restored(now += 300), { act: 'resume' });
  }
  /* restored losses while visible, far apart */
  for (let i = 0; i < 5; i++) {
    assert.equal(c.lost(now += 5 * 60000).act, 'wait');
    assert.equal(c.restored(now += 800).act, 'resume');
  }
  const s = c.stats();
  assert.equal(s.strikes, 0); assert.equal(s.losses, 55); assert.equal(s.restores, 55); assert.equal(s.lost, false);
});

test('#9 the restore clock runs on visible time only, and a frozen timer is re-armed, not trusted', () => {
  let now = 1e12;
  const c = S.ContextLossPolicy({ now });
  assert.deepEqual(c.lost(now), { act: 'wait', armMs: 6000 });
  assert.deepEqual(c.visible(true, now += 2000), { armMs: 0 }, 'hidden: the runtime clears its timer');
  assert.deepEqual(c.timeout(now += 9000), { act: 'ignore' }, 'a timer that still fires while hidden does nothing');
  assert.deepEqual(c.visible(false, now += 600000), { armMs: 6000 }, 'back: a fresh 6 s');
  assert.deepEqual(c.timeout(now + 1000), { act: 'ignore' }, 'a stale early timer is ignored');
  /* the page froze without a visibilitychange: the timer fires a minute late */
  const late = c.timeout(now += 60000);
  assert.deepEqual(late, { act: 'rearm', armMs: 6000 });
  assert.equal(c.restored(now += 1500).act, 'resume', 'the restore that arrives after the thaw');
  assert.equal(c.stats().strikes, 0);
});

test('#9 strikes: unrestored, thrash and repeat; each ends 3D for the session but only 3 in 30 min remember 2D', () => {
  let now = 1e12;
  const a = S.ContextLossPolicy({ now });
  a.lost(now);
  const un = a.timeout(now += 6000);
  assert.equal(un.act, 'fail'); assert.equal(un.why, 'unrestored'); assert.equal(un.remember, false);
  assert.deepEqual(un.strikes, [now]);

  /* thrash: lost again within 10 s of a restore while the page stayed visible */
  const b = S.ContextLossPolicy({ now });
  b.lost(now); b.restored(now += 900);
  const th = b.lost(now += 1500);
  assert.equal(th.act, 'fail'); assert.equal(th.why, 'thrash'); assert.equal(th.remember, false);
  /* …but not when the page was hidden in between (the time away explains it) */
  const b2 = S.ContextLossPolicy({ now });
  b2.lost(now); b2.restored(now += 900); b2.visible(true, now += 500); b2.visible(false, now += 500);
  assert.equal(b2.lost(now += 500).act, 'wait');

  /* repeat: three visible-since-restore losses within 2 minutes, each restored after more than 10 s */
  const r = S.ContextLossPolicy({ now });
  r.lost(now); r.restored(now += 1000);
  assert.equal(r.lost(now += 15000).act, 'wait'); r.restored(now += 1000);
  assert.equal(r.lost(now += 15000).act, 'wait'); r.restored(now += 1000);
  const rep = r.lost(now += 15000);
  assert.equal(rep.act, 'fail'); assert.equal(rep.why, 'repeat');

  /* persistence: strikes survive reloads in sessionStorage; the third within 30 min remembers 2D */
  const stored = JSON.stringify([now - 20 * 60000, now - 5 * 60000]);
  const c = S.ContextLossPolicy({ now, strikes: stored });
  assert.equal(c.stats().strikes, 2);
  c.lost(now);
  const third = c.timeout(now += 6000);
  assert.equal(third.remember, true);
  assert.equal(third.strikes.length, 3);
  const old = S.ContextLossPolicy({ now, strikes: JSON.stringify([now - 40 * 60000, now - 31 * 60000]) });
  old.lost(now);
  assert.equal(old.timeout(now + 6000).remember, false, 'strikes older than 30 min do not count');
  assert.equal(P.strikesToRemember, 3);
});

test('#9 the old stored loss count is not a strike; duplicates and stray restores are ignored', () => {
  const now = 1e12;
  assert.deepEqual(S.parseStrikes('1', now), []);
  assert.deepEqual(S.parseStrikes('2', now), [], 'two restored losses from before the fix');
  assert.deepEqual(S.parseStrikes(null, now), []);
  assert.deepEqual(S.parseStrikes('{nope', now), []);
  assert.deepEqual(S.parseStrikes(JSON.stringify([now - 1000, 'x', now + 5000, now - 3 * 3600000]), now), [now - 1000]);
  const c = S.ContextLossPolicy({ now, strikes: '2' });
  assert.equal(c.stats().strikes, 0);
  assert.deepEqual(c.restored(now), { act: 'ignore' });
  c.lost(now);
  assert.deepEqual(c.lost(now + 10), { act: 'ignore' }, 'one loss, two events');
  c.drop();
  assert.equal(c.isLost, false, 'a dropped renderer is not lost any more');
  assert.deepEqual(c.timeout(now + 6000), { act: 'ignore' });
});

/* ---------------- #15 a stacked holder hears what it missed ---------------- */
test('#15 a loss + restore while a game holds the renderer reaches the island when it is handed back', () => {
  const island = { _ctxLost: false, _ctxMissed: false }, game = { _ctxLost: false, _ctxMissed: false };
  /* the game is current; the island is stacked. Loss: the game hears it now, the island is marked */
  assert.equal(S.contextDue(game, true), 'lost');
  island._ctxMissed = true;
  assert.equal(S.contextDue(game, true), null, 'told once');
  assert.equal(S.contextDue(game, false), 'restored');
  assert.equal(S.contextDue(game, false), null);
  /* the game releases: the island's onResume sees {restored: true} (peek), then onRestored runs */
  assert.equal(S.contextDue(island, false, true), 'restored');
  assert.equal(island._ctxMissed, true, 'peek does not consume');
  assert.equal(S.contextDue(island, false), 'restored');
  assert.deepEqual(island, { _ctxLost: false, _ctxMissed: false });
  assert.equal(S.contextDue(island, false), null);
});

test('#15 handed back while still lost: onLost now, onRestored later; fresh and untouched holders hear nothing extra', () => {
  const island = { _ctxLost: false, _ctxMissed: true };
  assert.equal(S.contextDue(island, true), 'lost', 'still lost when the game leaves');
  assert.equal(S.contextDue(island, true), null);
  assert.equal(S.contextDue(island, false), 'restored', 'the restore reaches it as the current holder');
  /* told lost before it was stacked, restored while stacked */
  const told = { _ctxLost: true, _ctxMissed: true };
  assert.equal(S.contextDue(told, true), null, 'no second onLost');
  assert.equal(S.contextDue(told, false), 'restored');
  /* a new lease granted while lost hears it at once; one granted on a healthy context hears nothing */
  assert.equal(S.contextDue({ _ctxLost: false, _ctxMissed: false }, true), 'lost');
  assert.equal(S.contextDue({ _ctxLost: false, _ctxMissed: false }, false), null);
});

/* ---------------- #41 + runtime wiring (source guards: the runtime needs a browser + GPU) ---------------- */
function listenerBody(src, event) {
  const i = src.indexOf("addEventListener('" + event + "'");
  if (i < 0) return null;
  let depth = 0, start = src.indexOf('{', i);
  for (let j = start; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && --depth === 0) return src.slice(start, j + 1);
  }
  return null;
}
test('#41 pagehide parks the shared renderer (no dispose, no revoke) and pageshow resumes it', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'world', 'island3d', 'stage.js'), 'utf8');
  const hide = listenerBody(src, 'pagehide'), show = listenerBody(src, 'pageshow');
  assert.ok(hide, 'a pagehide listener'); assert.ok(show, 'a pageshow listener');
  assert.doesNotMatch(hide, /disposeAll|onRevoke|_fail|failAll|release\(/, 'pagehide must not dispose, revoke or fail a lease');
  assert.match(hide, /parked\s*=\s*true/);
  assert.match(show, /parked\s*=\s*false/);
  assert.match(show, /_update\(\)/, 'pageshow restarts the current holder');
  assert.match(src, /!lost && !parked && !document\.hidden/, 'a parked page renders nothing');
  /* the old rule is gone: no remember2D on a second loss */
  assert.doesNotMatch(src, /lostCount\s*>=\s*2/);
  /* steps from a game's own frames are not evidence for the island's saved tier */
  assert.match(src, /judge\(aq\.sample\(work, interval, now, target\), 'loop'\)/);
  assert.match(src, /judge\(aq\.sample\(workMs, interval, now, 1000 \/ 60\), 'held'\)/);
  assert.match(src, /src === 'loop' && \+\+loopSteps === 2/);
});

test('#9 photocards: a context lost after the page was hidden does not count toward switching them off', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'world', 'island3d', 'photocard.js'), 'utf8');
  assert.match(src, /var routine = g\.away \|\| !!document\.hidden;\s*\n\s*if \(!routine\) lostCount\+\+;/);
  assert.match(src, /if \(document\.hidden && gpu\) gpu\.away = true;/);
});

/* ================================================================
   device fallbacks: the stage runtime in a fake browser (no GPU)
   One page session = stage.js run against a fake window, THREE, GL context and one
   virtual clock that Date, performance.now and the timers all read.
   ================================================================ */
const STAGE_SRC = fs.readFileSync(path.join(__dirname, '..', 'world', 'island3d', 'stage.js'), 'utf8');
const PHOTO_SRC = fs.readFileSync(path.join(__dirname, '..', 'world', 'island3d', 'photocard.js'), 'utf8');
const SHELL_SRC = fs.readFileSync(path.join(__dirname, '..', 'world', 'games', 'shell.js'), 'utf8');
const T0 = Date.UTC(2026, 9, 3, 12);
function memStore(init) {
  const m = new Map(Object.entries(init || {}));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); }, _m: m };
}
function events() {
  const map = {};
  return {
    on: (t, fn) => { (map[t] = map[t] || []).push(fn); },
    off: (t, fn) => { map[t] = (map[t] || []).filter((f) => f !== fn); },
    fire: (t, e) => (map[t] || []).slice().forEach((fn) => fn(e))
  };
}
function pageSession(o) {
  o = o || {};
  const clock = { now: o.now != null ? o.now : T0, timers: [], seq: 0 };
  const local = o.local || memStore(o.localInit), session = o.session || memStore(o.sessionInit);
  const GL = { MAX_TEXTURE_SIZE: 0x0D33, getParameter: () => 16384, getExtension: () => null };
  function canvas() { const ev = events(); return { style: {}, parentNode: null, addEventListener: ev.on, removeEventListener: ev.off, fire: ev.fire, getContext: () => GL }; }
  const renderers = [];
  function WebGLRenderer() {
    this.domElement = canvas(); this.shadowMap = {}; this.loop = null; this.pr = 1; this.disposed = false;
    this.info = { render: { calls: 0, triangles: 0 }, memory: { geometries: 0, textures: 0 }, programs: [] };
    renderers.push(this);
  }
  Object.assign(WebGLRenderer.prototype, {
    setPixelRatio(v) { this.pr = v; }, getPixelRatio() { return this.pr; }, setSize() {}, render() {}, setClearColor() {},
    setAnimationLoop(fn) { this.loop = fn; }, dispose() { this.disposed = true; }, forceContextLoss() {}
  });
  const THREE = { WebGLRenderer, SRGBColorSpace: 'srgb', NeutralToneMapping: 7, PCFShadowMap: 1 };
  const doc = {
    hidden: false, baseURI: 'https://x.test/', currentScript: { src: 'https://x.test/world/island3d/stage.js?v=1' },
    head: { appendChild(s) { Promise.resolve().then(() => s.onerror()); } },   /* the optional island3d files: "not built yet" */
    createElement: (tag) => (tag === 'canvas' ? canvas() : { style: {} }), addEventListener() {}
  };
  const win = {
    document: doc, localStorage: local, sessionStorage: session, location: { search: o.search || '' }, SL_WORLD_VER: '1',
    navigator: o.navigator || { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', platform: 'Win32', maxTouchPoints: 0, hardwareConcurrency: 8 },
    performance: { now: () => clock.now }, devicePixelRatio: 1,
    WebGL2RenderingContext: function WebGL2RenderingContext() {}, slLoad3D: () => Promise.resolve(THREE),
    SLTier: T, SLKit: { create: () => ({ kit: () => ({}), setOutlines() {}, dispose() {}, stats: () => ({}), issues: [] }) },
    addEventListener() {}
  };
  const setT = (fn, ms) => { const id = ++clock.seq; clock.timers.push({ id, at: clock.now + (Number(ms) || 0), fn }); return id; };
  const clearT = (id) => { clock.timers = clock.timers.filter((t) => t.id !== id); };
  class FakeDate extends Date { static now() { return clock.now; } }
  /* stage.js imports its two addons through new Function('u', 'return import(u)') */
  function FakeFunction() { return (u) => Promise.resolve(/RoundedBox/.test(u) ? { RoundedBoxGeometry: function () {} } : {}); }
  new Function('self', 'window', 'document', 'setTimeout', 'clearTimeout', 'Date', 'Function', STAGE_SRC)(win, win, doc, setT, clearT, FakeDate, FakeFunction);
  return {
    clock, local, session, win, doc, renderers, IS: win.SLIsland3D, SL3D: win.SL3D,
    /* run the timers due within ms of virtual time */
    advance(ms) {
      const end = clock.now + ms;
      for (;;) {
        const due = clock.timers.filter((t) => t.at <= end).sort((a, b) => a.at - b.at || a.id - b.id)[0];
        if (!due) break;
        clock.timers = clock.timers.filter((t) => t !== due);
        clock.now = Math.max(clock.now, due.at);
        due.fn();
      }
      clock.now = Math.max(clock.now, end);
    },
    /* the next page session on this device: same storage, later clock */
    next(p) { return pageSession(Object.assign({ local, now: clock.now + 3600e3 }, p)); }
  };
}
const boot3d = (s) => s.IS.boot({ ver: '1', deadlineMs: 8000 });
/* a game drawing its own frames (Lease.sample, 'held') at ~3 fps until the stage gives up */
function crawlHeld(s, L) { for (let i = 0; i < 1000 && !s.IS.failed(); i++) { s.clock.now += 300; L.sample(280); } }
/* the island's own paced loop ('loop') at ~3 fps: 280 ms of frame work every 300 ms */
function islandLease(s, fails) {
  const L = s.SL3D.lease('island', { frame: () => { s.clock.now += 280; return true; }, onFail: (r) => fails.push('island:' + r) });
  L.start();
  return L;
}
function crawlLoop(s, L) { for (let i = 0; i < 1000 && !s.IS.failed(); i++) { s.clock.now += 20; L.renderer.loop(); } }
const saved = (s) => { const r = s.local.getItem('slTier3d'); return r ? JSON.parse(r).tier : null; };
const record = (s) => { const r = s.local.getItem('slIsland3D'); return r ? JSON.parse(r) : null; };

test('device-2: a HIGH device too slow in a game saves LOW and is 2D for this session only; the next session is 3D at LOW', async () => {
  const s1 = pageSession();
  assert.equal(await boot3d(s1), true);
  assert.equal(s1.SL3D.tier, 'HIGH');
  const fails = [];
  s1.SL3D.lease('island', { onFail: (r) => fails.push('island:' + r) });
  const game = s1.SL3D.lease('kart', { onFail: (r) => fails.push('kart:' + r) });
  crawlHeld(s1, game);
  assert.equal(s1.IS.failed(), 'performance', 'every step taken, still < 20 fps');
  assert.deepEqual(fails, ['island:performance', 'kart:performance'], 'the game and the island under it go 2D now');
  assert.deepEqual(s1.SL3D.quality.steps.slice().sort(), T.LADDER.slice().sort());
  assert.equal(record(s1), null, 'a game never remembers 2D');
  assert.equal(saved(s1), 'LOW');
  assert.ok(Number.isFinite(JSON.parse(s1.local.getItem('slTier3d')).at), 'a dated save: it expires like any other');
  /* rewards-world disable3D asks to remember the island's 'performance' failure: the stage's verdict stands */
  s1.IS.remember2D('performance');
  assert.equal(record(s1), null);
  assert.equal(s1.IS.remembered('1'), null);
  /* another cause is still remembered as before */
  s1.IS.remember2D('lost-twice');
  assert.equal(record(s1).why, 'lost-twice');
  s1.local.removeItem('slIsland3D');

  const s2 = s1.next();
  assert.equal(await boot3d(s2), true, 'the next session tries 3D again');
  assert.equal(s2.SL3D.tier, 'LOW');
  assert.match(s2.SL3D.tierWhy, /saved LOW/);
});

test('device-2: the island\'s own loop above LOW is a session-only fallback too; at LOW it remembers 2D', async () => {
  const s1 = pageSession({ navigator: { userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 5, hardwareConcurrency: 8 } });
  assert.equal(await boot3d(s1), true);
  assert.equal(s1.SL3D.tier, 'MID', 'an iPad');
  const fails = [];
  crawlLoop(s1, islandLease(s1, fails));
  assert.deepEqual(fails, ['island:performance']);
  assert.equal(record(s1), null, 'MID: not remembered');
  assert.equal(saved(s1), 'LOW');
  s1.IS.remember2D('performance');                         /* rewards-world, as above */
  assert.equal(record(s1), null);

  const s2 = s1.next();
  assert.equal(await boot3d(s2), true);
  assert.equal(s2.SL3D.tier, 'LOW');
  assert.deepEqual(s2.SL3D.quality.steps, [], 'a fresh ladder at LOW');
  const f2 = [];
  crawlLoop(s2, islandLease(s2, f2));
  assert.deepEqual(f2, ['island:performance']);
  const rec = record(s2);
  assert.equal(rec.why, 'performance', 'slow even at LOW: 2D for this device');
  assert.equal(rec.at, s2.clock.now);
  s2.IS.remember2D('performance');
  assert.equal(record(s2).at, rec.at, 'the adapter\'s echo changes nothing');

  const s3 = s2.next();
  assert.ok(s3.IS.remembered('1'));
  assert.equal(await boot3d(s3), false, 'remembered: no 3D next session');
  /* …until it is a week old */
  const s4 = s2.next({ now: s2.clock.now + 8 * 24 * 3600e3 });
  assert.equal(s4.IS.remembered('1'), null);
  assert.equal(record(s4), null, 'the stale record is cleared');
  assert.equal(await boot3d(s4), true);
});

test('device-2: a game at LOW never remembers 2D for the island', async () => {
  const s1 = pageSession({ localInit: { slTier3d: S.savedTierRaw('LOW', T0 - 3600e3) } });
  assert.equal(await boot3d(s1), true);
  assert.equal(s1.SL3D.tier, 'LOW');
  const fails = [];
  islandLease(s1, fails);
  const game = s1.SL3D.lease('penalty', { onFail: (r) => fails.push('penalty:' + r) });
  crawlHeld(s1, game);
  assert.deepEqual(fails, ['island:performance', 'penalty:performance']);
  s1.IS.remember2D('performance');
  assert.equal(record(s1), null, 'held frames: this session only');
  assert.equal(await boot3d(s1.next()), true);
});

test('forget() ("Try 3D again"): clears the record, the pending demotion and the strikes, so the next boot is 3D', async () => {
  /* remembered in an earlier session (as an installed app sees it on launch) */
  const rec = JSON.stringify({ off: true, why: 'performance', ver: '1', at: T0 - 3600e3 });
  const pend = JSON.stringify({ tier: 'MID', sid: 'old', at: T0 - 3600e3 });
  const s1 = pageSession({ localInit: { slIsland3D: rec, slTier3dPend: pend, slTier3d: S.savedTierRaw('LOW', T0 - 3600e3) }, sessionInit: { slGlLost: JSON.stringify([T0 - 60000, T0 - 30000]) } });
  assert.equal(await boot3d(s1), false, 'remembered');
  s1.IS.forget();
  assert.equal(s1.local.getItem('slIsland3D'), null);
  assert.equal(s1.local.getItem('slTier3dPend'), null);
  assert.equal(s1.session.getItem('slGlLost'), null);
  assert.equal(saved(s1), 'LOW', 'the measured tier stays: the retry runs at LOW');
  assert.equal(await boot3d(s1), true, 'maybeBoot3D boots 3D');
  assert.equal(s1.SL3D.tier, 'LOW');

  /* failed earlier in THIS page session: the session verdict is lifted with a fresh judge */
  const s2 = pageSession();
  await boot3d(s2);
  const game = s2.SL3D.lease('kart', {});
  crawlHeld(s2, game);
  assert.equal(s2.IS.failed(), 'performance');
  game.release();
  assert.equal(await boot3d(s2), false);
  s2.IS.forget();
  assert.equal(s2.IS.failed(), null);
  assert.equal(await boot3d(s2), true);
  const fails = [];
  const L = islandLease(s2, fails);
  assert.ok(L && L.active, 'a lease again');
  const t = s2.clock.now;
  crawlLoop(s2, L);
  assert.deepEqual(fails, ['island:performance'], 'still slow: 2D again, judged afresh');
  assert.ok(s2.clock.now - t < 15000, 'every step was already taken: only the fallback hold is left');
  assert.equal(record(s2), null, 'HIGH: still this session only');
});

test('forget() waits while a holder still sits on a lost context, then lifts the context verdict', async () => {
  const s = pageSession();
  await boot3d(s);
  const fails = [];
  const L = islandLease(s, fails);
  const canvas = s.renderers[0].domElement;
  canvas.fire('webglcontextlost', { preventDefault() {} });
  s.advance(6000);                                          /* not restored within 6 s of visible time: a strike */
  assert.equal(s.IS.failed(), 'context');
  assert.deepEqual(fails, ['island:context']);
  assert.equal(JSON.parse(s.session.getItem('slGlLost')).length, 1);
  s.IS.forget();
  assert.equal(s.session.getItem('slGlLost'), null, 'the strikes go');
  assert.equal(s.IS.failed(), 'context', 'the lost renderer is still held: the verdict stays');
  L.release();                                              /* rewards-world disposes the 3D island */
  assert.equal(s.renderers[0].disposed, true, 'nobody holds the lost renderer: dropped');
  s.IS.forget();
  assert.equal(s.IS.failed(), null);
  assert.equal(await boot3d(s), true);
  const L2 = s.SL3D.lease('island', {});
  assert.ok(L2 && L2.active);
  assert.equal(s.renderers.length, 2, 'a fresh renderer (and context)');
});

test('device-1: the remembered record expires the same way for the stage, the games and the photocards', () => {
  const DAY = 24 * 3600e3;
  const shell = (() => { const w = {}; new Function('window', 'document', SHELL_SRC)(w, { createElement: () => ({ style: {} }) }); return w.SLGameShell; })();
  const cases = [
    ['an hour old', -3600e3, '', true],
    ['six days old', -6 * DAY, '', true],
    ['eight days old', -8 * DAY, '', false],
    ['a month old', -30 * DAY, '', false],
    ['undated', null, '', false],
    ['two days ahead', 2 * DAY, '', false],
    ['?3d=1', -3600e3, '?3d=1', false]
  ];
  for (const [name, age, search, twoD] of cases) {
    const now = Date.now();                                 /* the shell reads the real clock */
    const r = { off: true, why: 'performance', ver: '1' };
    if (age != null) r.at = now + age;
    const s = pageSession({ now, search, localInit: { slIsland3D: JSON.stringify(r) } });
    /* the games before stage.js loads (the stored record), then with it */
    const stored = shell.verdict2d({ localStorage: s.local, SL_WORLD_VER: '1', location: { search } });
    assert.equal(stored != null, twoD, name + ': games without stage.js');
    new Function('self', 'window', 'document', PHOTO_SRC)(s.win, s.win, s.doc);
    assert.equal(s.win.SLPhotocard.info().blocked === 'remembered 2D', twoD, name + ': photocards');
    assert.equal(!!s.IS.remembered('1'), twoD, name + ': the island');
    assert.equal(shell.verdict2d(s.win) != null, twoD, name + ': games with stage.js');
  }
});
