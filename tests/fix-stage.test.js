/* node --test tests/   (Node 22+)
   Regression tests for the stage fixes (branch fix/stage):
   - #34 AdaptiveQuality (tier.js) must not step down on one-off long frames, and a
     lower tier is saved only on evidence from two page sessions (stage.js
     demotionVerdict), with a dated, expiring saved tier (savedTierFrom);
   - #9  routine (restored) WebGL context losses never end or remember 3D; only
     strikes do (stage.js ContextLossPolicy);
   - #15 a holder stacked under a game hears about a loss/restore it missed when it
     is handed the renderer back (stage.js contextDue);
   - #41 pagehide parks the shared renderer instead of disposing it (source guard). */
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
