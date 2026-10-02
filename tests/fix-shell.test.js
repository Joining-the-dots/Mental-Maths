'use strict';
/* Game shell fixes (world/games/shell.js), run in Node through a tiny fake DOM and a
   virtual clock (no GPU, no browser):
     - sheets scroll from their top (results / tutorial / menu on short screens)
     - the top bar keeps 🔊 ⏸ 🏝️ Exit on screen (the HUD pill gives way)
     - games honour the stage's 2D verdict before opening a WebGL context
     - the shell's frame-rate watchdog (sustained < 20 fps → the same round in 2D)
     - results focus their main button after the tap guard and announce the result
     - the portrait "turn sideways" hint lives in the sheets, not over game HUDs
     - 3D draws capped at ~60 fps in play / ~30 fps on menus on fast screens
     - the menu/results 3D loop restarts when the page is visible again
     - no per-frame HUD string / node-list work when nothing changed */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');

const SRC = fs.readFileSync(path.join(__dirname, '../world/games/shell.js'), 'utf8');

/* the 3D view is a real ES module import (the shell imports def.view3d.src); it hands
   off to whatever the current test installs on globalThis */
const VIEW_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'slg-shell-'));
fs.writeFileSync(path.join(VIEW_DIR, 'fake-view.mjs'), 'export function create(mid, opts) { return globalThis.__slgFakeView(mid, opts); }\n');
const BASE = pathToFileURL(VIEW_DIR).href + '/';
test.after(() => { try { fs.rmSync(VIEW_DIR, { recursive: true, force: true }); } catch (e) { /* temp */ } delete globalThis.__slgFakeView; });

/* ================================================================
   a tiny DOM: elements, an HTML parser, simple selectors, events, focus
   ================================================================ */
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const dec = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, k) => {
  if (k[0] === '#') return String.fromCodePoint(k[1] === 'x' || k[1] === 'X' ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10));
  return k in ENT ? ENT[k] : m;
});
const VOID = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'source', 'wbr']);

class Target {
  constructor() { this.listeners = []; }
  addEventListener(type, fn, opt) {
    const signal = opt && typeof opt === 'object' ? opt.signal : null;
    if (signal && signal.aborted) return;
    this.listeners.push({ type, fn, signal });
  }
  removeEventListener(type, fn) { this.listeners = this.listeners.filter((l) => !(l.type === type && l.fn === fn)); }
  fire(type, props) {
    const ev = Object.assign({ type, target: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {} }, props);
    this.listeners.filter((l) => l.type === type && !(l.signal && l.signal.aborted)).forEach((l) => l.fn.call(this, ev));
    return ev;
  }
}
class Text {
  constructor(t) { this.nodeType = 3; this.data = t; this.parentNode = null; }
  get textContent() { return this.data; }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
}
class El extends Target {
  constructor(doc, tag) {
    super();
    this.ownerDocument = doc; this.nodeType = 1;
    this.localName = String(tag).toLowerCase(); this.tagName = this.localName.toUpperCase();
    this.attrs = new Map(); this.childNodes = []; this.parentNode = null; this.style = {};
    this.textWrites = 0; this.offsetTop = 0; this.offsetWidth = 0;
  }
  get children() { return this.childNodes.filter((n) => n.nodeType === 1); }
  get firstChild() { return this.childNodes[0] || null; }
  setAttribute(k, v) { this.attrs.set(String(k).toLowerCase(), String(v)); }
  getAttribute(k) { k = String(k).toLowerCase(); return this.attrs.has(k) ? this.attrs.get(k) : null; }
  hasAttribute(k) { return this.attrs.has(String(k).toLowerCase()); }
  removeAttribute(k) { this.attrs.delete(String(k).toLowerCase()); }
  get id() { return this.getAttribute('id') || ''; }
  set id(v) { this.setAttribute('id', v); }
  get className() { return this.getAttribute('class') || ''; }
  set className(v) { this.setAttribute('class', v); }
  get classList() {
    const e = this, list = () => e.className.split(/\s+/).filter(Boolean);
    const api = {
      contains: (c) => list().includes(c),
      add: (...cs) => { const l = list(); cs.forEach((c) => { if (!l.includes(c)) l.push(c); }); e.className = l.join(' '); },
      remove: (...cs) => { e.className = list().filter((c) => !cs.includes(c)).join(' '); },
      toggle: (c, on) => { const want = on === undefined ? !list().includes(c) : !!on; if (want) api.add(c); else api.remove(c); return want; }
    };
    return api;
  }
  get dataset() {
    const e = this, attr = (k) => 'data-' + String(k).replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
    return new Proxy({}, {
      get: (t, k) => (typeof k === 'string' && e.hasAttribute(attr(k)) ? e.getAttribute(attr(k)) : undefined),
      set: (t, k, v) => { e.setAttribute(attr(k), String(v)); return true; },
      has: (t, k) => e.hasAttribute(attr(k)),
      deleteProperty: (t, k) => { e.removeAttribute(attr(k)); return true; }
    });
  }
  get disabled() { return this.hasAttribute('disabled'); }
  set disabled(v) { if (v) this.setAttribute('disabled', ''); else this.removeAttribute('disabled'); }
  get hidden() { return this.hasAttribute('hidden'); }
  set hidden(v) { if (v) this.setAttribute('hidden', ''); else this.removeAttribute('hidden'); }
  get textContent() { return this.childNodes.map((n) => n.textContent).join(''); }
  set textContent(v) { this.textWrites++; this._clear(); if (v != null && v !== '') this._add(new Text(String(v))); }
  set innerHTML(html) { this._clear(); parseInto(this, String(html)); }
  _clear() { this.childNodes.forEach((n) => { n.parentNode = null; }); this.childNodes = []; }
  _add(n) { n.parentNode = this; this.childNodes.push(n); }
  appendChild(n) { if (n.parentNode) n.parentNode.removeChild(n); this._add(n); return n; }
  append(...ns) { ns.forEach((n) => this.appendChild(typeof n === 'string' ? new Text(n) : n)); }
  insertBefore(n, ref) {
    if (!ref) return this.appendChild(n);
    if (n.parentNode) n.parentNode.removeChild(n);
    const i = this.childNodes.indexOf(ref);
    n.parentNode = this; this.childNodes.splice(i < 0 ? this.childNodes.length : i, 0, n);
    return n;
  }
  removeChild(n) { const i = this.childNodes.indexOf(n); if (i >= 0) this.childNodes.splice(i, 1); n.parentNode = null; return n; }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  contains(n) { for (; n; n = n.parentNode) if (n === this) return true; return false; }
  get isConnected() { return this.ownerDocument.documentElement.contains(this); }
  _find(sel, first) {
    const m = compile(sel), out = [];
    (function walk(p) { for (const c of p.childNodes) { if (c.nodeType !== 1) continue; if (m(c)) { out.push(c); if (first) return true; } if (walk(c) && first) return true; } return false; })(this);
    return out;
  }
  querySelectorAll(sel) { this.ownerDocument.stats.qsa++; return this._find(sel, false); }
  querySelector(sel) { this.ownerDocument.stats.qs++; return this._find(sel, true)[0] || null; }
  click() { if (!this.disabled) this.fire('click', { detail: 1 }); }
  focus(opts) { if (this.disabled) return; this.ownerDocument._active = this; this.ownerDocument.focusLog.push({ el: this, opts: opts || null }); }
  blur() { if (this.ownerDocument._active === this) this.ownerDocument._active = null; }
  getBoundingClientRect() { const r = this.ownerDocument.rect; return { left: 0, top: 0, right: r.width, bottom: r.height, width: r.width, height: r.height }; }
  getContext() { return new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } }); }
  setPointerCapture() {}
}
class Doc extends Target {
  constructor() {
    super();
    this.stats = { qs: 0, qsa: 0 }; this.focusLog = []; this.hidden = false; this.baseURI = BASE; this._active = null;
    this.rect = { width: 812, height: 314 };
    this.documentElement = new El(this, 'html'); this.head = new El(this, 'head'); this.body = new El(this, 'body');
    this.documentElement.appendChild(this.head); this.documentElement.appendChild(this.body);
  }
  get activeElement() { return this._active && this._active.isConnected ? this._active : this.body; }
  get visibilityState() { return this.hidden ? 'hidden' : 'visible'; }
  createElement(t) { return new El(this, t); }
  createElementNS(ns, t) { return new El(this, t); }
  getElementById(id) { return this.documentElement._find('#' + id, true)[0] || null; }
  querySelector(s) { return this.documentElement.querySelector(s); }
  querySelectorAll(s) { return this.documentElement.querySelectorAll(s); }
}
function parseInto(parent, html) {
  const doc = parent.ownerDocument, stack = [parent];
  const re = /<!--[\s\S]*?-->|<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:\s+[^\s"'>\/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*(\/?)>|([^<]+)|(<)/g;
  let m;
  while ((m = re.exec(html))) {
    const top = stack[stack.length - 1];
    if (m[1]) { const t = m[1].toLowerCase(); for (let i = stack.length - 1; i > 0; i--) if (stack[i].localName === t) { stack.length = i; break; } }
    else if (m[2]) {
      const e = doc.createElement(m[2]), ar = /([^\s"'>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
      let a;
      while ((a = ar.exec(m[3] || ''))) e.setAttribute(a[1], dec(a[2] != null ? a[2] : a[3] != null ? a[3] : a[4] != null ? a[4] : ''));
      top.appendChild(e);
      if (!m[4] && !VOID.has(e.localName)) stack.push(e);
    } else if (m[5]) top.appendChild(new Text(dec(m[5])));
    else if (m[6]) top.appendChild(new Text('<'));
  }
}
/* selectors: compounds of tag / #id / .class / [attr] / [attr="v"], descendant combinator, commas */
function compound(s) {
  const c = { tag: null, id: null, cls: [], attrs: [] }, re = /^([a-zA-Z][\w-]*|\*)|#([\w-]+)|\.([\w-]+)|\[([\w-]+)(?:="?([^"\]]*)"?)?\]/g;
  let x, pos = 0;
  while (pos < s.length && (x = re.exec(s))) {
    if (x.index !== pos) break;
    pos = re.lastIndex;
    if (x[1]) c.tag = x[1] === '*' ? null : x[1].toLowerCase();
    else if (x[2]) c.id = x[2];
    else if (x[3]) c.cls.push(x[3]);
    else c.attrs.push([x[4].toLowerCase(), x[5]]);
  }
  if (pos !== s.length) throw new Error('fake DOM: unsupported selector ' + s);
  return c;
}
function matchOne(n, c) {
  if (!n || n.nodeType !== 1) return false;
  if (c.tag && n.localName !== c.tag) return false;
  if (c.id && n.id !== c.id) return false;
  for (const k of c.cls) if (!n.classList.contains(k)) return false;
  for (const [k, v] of c.attrs) { if (!n.hasAttribute(k)) return false; if (v !== undefined && n.getAttribute(k) !== v) return false; }
  return true;
}
function compile(sel) {
  const alts = sel.split(',').map((s) => s.trim()).filter(Boolean).map((s) => s.split(/\s+/).map(compound));
  return (n) => alts.some((chain) => {
    if (!matchOne(n, chain[chain.length - 1])) return false;
    let i = chain.length - 2;
    for (let p = n.parentNode; i >= 0 && p; p = p.parentNode) if (matchOne(p, chain[i])) i--;
    return i < 0;
  });
}

/* ================================================================
   a virtual clock: setTimeout + requestAnimationFrame + performance.now
   ================================================================ */
function makeClock() {
  const c = { now: 1000, timers: [], rafs: [], seq: 0 };
  c.setTimeout = (fn, ms) => { const id = ++c.seq; c.timers.push({ id, at: c.now + Math.max(0, Number(ms) || 0), fn }); return id; };
  c.clearTimeout = (id) => { c.timers = c.timers.filter((t) => t.id !== id); };
  c.raf = (fn) => { const id = ++c.seq; c.rafs.push({ id, fn }); return id; };
  c.caf = (id) => { c.rafs = c.rafs.filter((r) => r.id !== id); };
  function runTimers(until) {
    for (;;) {
      const due = c.timers.filter((t) => t.at <= until).sort((a, b) => a.at - b.at || a.id - b.id)[0];
      if (!due) break;
      c.timers = c.timers.filter((t) => t !== due);
      if (due.at > c.now) c.now = due.at;
      due.fn();
    }
  }
  /* timers only (no display frames) */
  c.advance = (ms) => { const end = c.now + ms; runTimers(end); c.now = Math.max(c.now, end); };
  /* one display refresh `ms` after the last: due timers, then the rAF callbacks */
  c.frame = (ms) => { const end = c.now + ms; runTimers(end); c.now = Math.max(c.now, end); const list = c.rafs; c.rafs = []; list.forEach((r) => r.fn(c.now)); };
  c.frames = (n, ms) => { for (let i = 0; i < n; i++) c.frame(ms); };
  c.seconds = (sec, hz) => c.frames(Math.round(sec * hz), 1000 / hz);
  return c;
}
function storage(init) {
  const m = new Map(Object.entries(init || {}));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); }, _m: m };
}
const tick = () => new Promise((r) => setImmediate(r));
async function until(cond, what) {
  for (let i = 0; i < 500; i++) { if (cond()) return; await tick(); }
  throw new Error('timed out waiting for ' + what);
}

/* ================================================================
   the harness: load shell.js into the fake browser and start a fake game
   ================================================================ */
function fakeRound(o) {
  o = o || {};
  const r = {
    t: 0, steps: 0, done: false, hudCalls: 0, state: {},
    step(dt) { r.t += dt; r.steps++; if (o.endAt != null && r.t >= o.endAt) r.done = true; },
    render() {}, input() {},
    hud() { r.hudCalls++; return '⚽ 3/4 · ✦ Hype 2 · kick ' + Math.floor(r.t); },
    padState() { return r.t > 0.5 ? 's1' : ''; },
    result() { return { score: 2345 }; },
    summaryTitle() { return 'SHOW COMPLETE!'; }, summaryBig() { return '2,345'; }, summaryText() { return 'What a show'; },
    summaryBadges() { return [{ text: '🥇 Gold', kind: 'gold' }]; },
    forceEnd() { r.done = true; }
  };
  return r;
}
async function boot(o) {
  o = o || {};
  const doc = new Doc(), clock = makeClock();
  if (o.rect) doc.rect = o.rect;
  const ls = storage(Object.assign({ slQaMode: '1' }, o.local)), ss = storage(o.session);
  const win = new Target();
  const env = { doc, clock, win, ls, ss, views: [], rounds: [], loads: 0, qualityFns: [] };
  Object.assign(win, {
    devicePixelRatio: 1, location: { search: o.search || '' }, localStorage: ls, sessionStorage: ss, SL_WORLD_VER: '1',
    slLoad3D: () => { env.loads++; return Promise.resolve({ fakeTHREE: true }); }
  });
  if (o.island) win.SLIsland3D = o.island;
  if (o.quality) win.SL3D = { onQuality(fn) { env.qualityFns.push(fn); return () => { env.qualityFns = env.qualityFns.filter((f) => f !== fn); }; } };
  globalThis.__slgFakeView = (mid, opts) => {
    const v = {
      canvas: doc.createElement('canvas'), frames: [], disposed: false, opts,
      frame(round, dt, alpha, phase) { v.frames.push({ at: clock.now, dt, phase }); if (o.workMs) clock.now += o.workMs; },
      resize(w, h) { v.size = [w, h]; }, dispose() { v.disposed = true; }, setRound() {}
    };
    env.views.push(v);
    return v;
  };
  const names = ['window', 'document', 'localStorage', 'sessionStorage', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout', 'ResizeObserver', 'WebGL2RenderingContext'];
  const vals = [win, doc, ls, ss, { now: () => clock.now }, clock.raf, clock.caf, clock.setTimeout, clock.clearTimeout, undefined, o.noWebGL ? undefined : function WebGL2RenderingContext() {}];
  new Function(...names, SRC)(...vals);
  env.shell = win.SLGameShell;
  const def = Object.assign({
    key: 'fake', title: 'Fake Show', emoji: '🎤', LW: 800, LH: 450,
    tutorial: [['👆', 'Tap to jump'], ['⭐', 'Catch the stars'], ['💖', 'Keep your hearts'], ['🎤', 'Finish the show']],
    controls: [{ id: 'left', label: '⬅', side: 'left' }, { id: 'jump', label: 'JUMP', side: 'right', wide: true }],
    keys: { ' ': 'jump' }, countdown: 0,
    newRound: () => { const r = fakeRound(o.round); env.rounds.push(r); return r; }
  }, o.def3d === false ? {} : { view3d: { src: 'fake-view.mjs' }, resultsGlass: true }, o.def);
  env.cfg = Object.assign({
    variant: 'v1', ownedVariants: [{ id: 'v1', name: 'One' }], pb: {}, tutSeen: true, reduced: false,
    muted: () => true, toggleMute() {}, onExit() { env.exited = true; }
  }, o.cfg);
  env.game = env.shell.define(def);
  env.handle = env.game.start(env.cfg);
  env.$ = (s) => doc.querySelector(s);
  env.qa = win._slGame;
  env.css = () => doc.getElementById('slgCss').textContent;
  env.view = () => env.views[env.views.length - 1] || null;
  env.mounted = () => !!(env.view() && env.view().canvas.parentNode);
  env.playFrames = () => (env.view() ? env.view().frames.filter((f) => f.phase === 'playing').length : 0);
  /* menu up (and, when 3D is allowed, the view mounted under it) */
  await until(() => doc.getElementById('slgPlay') && (o.expect3d === false || env.mounted()), 'the menu' + (o.expect3d === false ? '' : ' in 3D'));
  await tick();
  return env;
}
function play(env) { env.doc.getElementById('slgPlay').click(); assert.equal(env.qa.phase(), 'playing'); }
/* the declaration block of the first rule whose selector is exactly `sel` */
function rule(css, sel) {
  const i = css.indexOf(sel + '{');
  assert.ok(i >= 0, 'no CSS rule for ' + sel);
  return css.slice(i + sel.length + 1, css.indexOf('}', i));
}

/* just the shell's exports (loading it builds no DOM) */
function pureShell() { const win = {}; new Function('window', 'document', SRC)(win, new Doc()); return win.SLGameShell; }

/* ================================================================
   pure helpers
   ================================================================ */
test('makePacer: ~60 draws a second on 60/90/120/144 Hz screens, ~30 for the idle pacer', () => {
  const S = pureShell();
  function rate(fps, hz, secs) {
    const p = S.makePacer(fps); let n = 0;
    for (let i = 0; i < hz * secs; i++) if (p.tick(1000 + i * 1000 / hz)) n++;
    return n / secs;
  }
  for (const hz of [60, 90, 120, 144]) {
    const r = rate(60, hz, 10);
    assert.ok(r >= 57 && r <= 61, hz + ' Hz → ' + r + ' draws/s');
    const idle = rate(30, hz, 10);
    assert.ok(idle >= 28.5 && idle <= 30.5, 'idle ' + hz + ' Hz → ' + idle + ' draws/s');
  }
  assert.equal(rate(60, 30, 10), 30, 'a slow display draws every frame');
  /* a hitch never makes it burst to catch up */
  const p = S.makePacer(60);
  assert.equal(p.tick(0), true);
  assert.equal(p.tick(500), true, 'after a 500 ms hitch');
  assert.equal(p.tick(508.3), false, 'and then back to every other 120 Hz frame, no burst');
  assert.equal(p.tick(516.7), true);
});

test('makeFrameWatch: sustained < 20 fps for the hold fires once; 25-30 fps, spikes, pauses and quality steps do not', () => {
  const S = pureShell();
  function run(w, iv, secs, work, t0) {
    let t = t0 || 0, fired = 0, at = -1;
    for (let i = 0; i < secs * 1000 / iv; i++) { t += iv; if (w.sample(iv, work == null ? 3 : work, t)) { fired++; if (at < 0) at = t; } }
    return { fired, at, t };
  }
  let r = run(S.makeFrameWatch(), 70, 12);
  assert.equal(r.fired, 1, 'fires exactly once');
  assert.ok(r.at >= 6000 && r.at <= 7500, '14 fps: fires after ~6 s, at ' + r.at);
  assert.equal(run(S.makeFrameWatch(), 40, 30).fired, 0, '25 fps is not "under 20"');
  assert.equal(run(S.makeFrameWatch(), 33.4, 30).fired, 0, 'a 30 fps low-power cadence is fine');
  assert.equal(run(S.makeFrameWatch(), 16.7, 10, 60).fired, 1, 'cheap cadence but 60 ms of work per frame is slow too');
  /* a 400 ms hitch every second at 60 fps never adds up */
  const w = S.makeFrameWatch(); let t = 0, f = 0;
  for (let s = 0; s < 20; s++) { for (let i = 0; i < 50; i++) { t += 16.7; f += w.sample(16.7, 3, t) ? 1 : 0; } t += 400; f += w.sample(400, 3, t) ? 1 : 0; }
  assert.equal(f, 0, 'isolated hitches');
  /* a pause (> 1 s gap) restarts the clock */
  const w2 = S.makeFrameWatch();
  r = run(w2, 70, 5);
  assert.equal(r.fired, 0);
  assert.equal(w2.sample(5000, 0, r.t + 5000), false);
  assert.equal(run(w2, 70, 5, 3, r.t + 5000).fired, 0, 'the clock starts again after the pause');
  /* a quality step every 2 s (the stage stepping its ladder) keeps restarting it */
  const w3 = S.makeFrameWatch(); t = 0; f = 0;
  for (let i = 0; i < 12000 / 70; i++) { t += 70; if (i % 29 === 28) w3.reset(); f += w3.sample(70, 3, t) ? 1 : 0; }
  assert.equal(f, 0, 'stage quality steps first');
  assert.equal(run(w3, 70, 8, 3, t).fired, 1, 'and it still catches a device that stays slow after the last step');
});

test('verdict2d: the stage verdict (failed / remembered) and its stored record when stage.js is absent', () => {
  const V = pureShell().verdict2d;
  assert.equal(V({ SLIsland3D: { failed: () => 'performance', remembered: () => null } }), 'failed:performance');
  assert.equal(V({ SLIsland3D: { failed: () => null, remembered: (ver) => (ver === '7' ? { off: true, why: 'context', ver: '7' } : null) }, SL_WORLD_VER: '7' }), 'remembered:context');
  assert.equal(V({ SLIsland3D: { failed: () => null, remembered: () => null } }), null);
  assert.equal(V({ SLIsland3D: { failed() { throw new Error('x'); }, remembered() { throw new Error('y'); } } }), null, 'a broken stage never blocks');
  assert.equal(V({ SLIsland3D: {} }), null, 'an old stage without the API');
  const rec = (v) => storage({ slIsland3D: JSON.stringify({ off: true, why: 'performance', ver: v }) });
  assert.equal(V({ localStorage: rec('1'), SL_WORLD_VER: '1', location: { search: '' } }), 'remembered:performance');
  assert.equal(V({ localStorage: rec('1'), SL_WORLD_VER: '2', location: { search: '' } }), null, 'stale after a version bump');
  assert.equal(V({ localStorage: rec('1'), SL_WORLD_VER: '1', location: { search: '?x=1&3d=1' } }), null, '?3d=1 lets a parent retry');
  assert.equal(V({ localStorage: storage({ slIsland3D: '{bad' }), location: { search: '' } }), null);
  assert.equal(V(null), null);
});

/* ================================================================
   #10: the stage's 2D verdict + the shell's frame-rate watchdog
   ================================================================ */
test('a game honours the stage 2D verdict: no 3D load, no view, no second WebGL context', async () => {
  const cases = [
    ['failed this session', { island: { failed: () => 'performance', remembered: () => null } }],
    ['remembered 2D', { island: { failed: () => null, remembered: () => ({ off: true, why: 'context', ver: '1' }) } }],
    ['remembered, stage.js absent', { local: { slIsland3D: JSON.stringify({ off: true, why: 'performance', ver: '1' }) } }]
  ];
  for (const [name, o] of cases) {
    const env = await boot(Object.assign({ expect3d: false }, o));
    for (let i = 0; i < 20; i++) await tick();
    assert.equal(env.loads, 0, name + ': slLoad3D never called');
    assert.equal(env.views.length, 0, name + ': no 3D view created');
    play(env);
    env.clock.seconds(1, 60);
    assert.equal(env.qa.view(), '2d', name);
    assert.ok(env.rounds[0].steps > 100, name + ': the round runs in 2D');
    assert.notEqual(env.$('#slgCanvas').style.opacity, '0', name + ': the 2D canvas shows');
    env.handle.exit();
  }
  /* no verdict → the view mounts as before */
  const ok = await boot({ island: { failed: () => null, remembered: () => null } });
  assert.equal(ok.loads, 1);
  assert.equal(ok.qa.view(), '3d');
  assert.equal(ok.$('#slgCanvas').style.opacity, '0');
  ok.handle.exit();
  /* ?3d=1 beats a stored record */
  const retry = await boot({ search: '?3d=1', local: { slIsland3D: JSON.stringify({ off: true, why: 'performance', ver: '1' }) } });
  assert.equal(retry.qa.view(), '3d');
  retry.handle.exit();
});

test('a verdict that lands after the 3D module loaded still stops the view mounting', async () => {
  let calls = 0;
  const island = { failed: () => (++calls > 1 ? 'context' : null), remembered: () => null };
  const env = await boot({ island, expect3d: false });
  for (let i = 0; i < 30; i++) await tick();
  assert.equal(env.loads, 1, 'the module was loaded while 3D was still allowed');
  assert.equal(env.views.length, 0, 'but no view (and so no WebGL context) is created');
  play(env);
  env.clock.seconds(0.5, 60);
  assert.equal(env.qa.view(), '2d');
  env.handle.exit();
});

test('watchdog: a 3D view stuck under 20 fps falls back to 2D mid-round (same round, session flag)', async () => {
  const env = await boot();
  play(env);
  const round = env.qa.round(), v = env.view();
  env.clock.frames(80, 70);                                  /* ~14 fps for 5.6 s */
  assert.equal(env.qa.view(), '3d', 'not yet: the stage gets its chance first');
  env.clock.frames(40, 70);                                  /* 8.4 s in all */
  assert.equal(env.qa.view(), '2d', 'sustained < 20 fps → 2D');
  assert.equal(v.disposed, true);
  assert.equal(v.canvas.parentNode, null);
  assert.equal(env.ss.getItem('slNo3dGame'), '1', 'later games this session start in 2D');
  assert.equal(env.$('#slgCanvas').style.opacity, '');
  const steps = round.steps;
  env.clock.seconds(1, 60);
  assert.equal(env.qa.round(), round, 'the SAME round continues');
  assert.equal(env.qa.phase(), 'playing');
  assert.ok(round.steps > steps + 100, 'and keeps stepping in 2D');
  env.handle.exit();
});

test('watchdog: slow work per frame counts, healthy and 30 fps play never trips it', async () => {
  const slow = await boot({ workMs: 60 });
  play(slow);
  slow.clock.frames(150, 16.7);                             /* rAF at 60 Hz but every draw takes 60 ms */
  assert.equal(slow.qa.view(), '2d');
  slow.handle.exit();
  for (const hz of [30, 60, 120]) {
    const env = await boot();
    play(env);
    env.clock.seconds(20, hz);
    assert.equal(env.qa.view(), '3d', hz + ' Hz keeps 3D');
    assert.equal(env.ss.getItem('slNo3dGame'), null);
    env.handle.exit();
  }
});

test('watchdog: stage quality steps restart it, so the stage judges a leased view first', async () => {
  const env = await boot({ quality: true });
  assert.equal(env.qualityFns.length, 1, 'the shell listens to SL3D.onQuality while a view is mounted');
  play(env);
  for (let s = 0; s < 6; s++) { env.clock.frames(29, 70); env.qualityFns.forEach((f) => f({}, 'step' + s)); }
  assert.equal(env.qa.view(), '3d', '12 s of slow frames, but the stage kept stepping quality');
  env.clock.frames(110, 70);
  assert.equal(env.qa.view(), '2d', 'slow after the last step → 2D');
  assert.equal(env.qualityFns.length, 0, 'unsubscribed on fallback');
  env.handle.exit();
});

/* ================================================================
   #35: ~60 fps 3D draws on fast screens, ~30 fps menus/results
   ================================================================ */
test('3D play draws ~60 fps on a 120 Hz screen while the logic steps every frame', async () => {
  const env = await boot();
  play(env);
  const round = env.qa.round();
  env.clock.seconds(2, 120);
  const draws = env.playFrames(), steps = round.steps;
  assert.ok(draws >= 118 && draws <= 122, '120 Hz → ' + draws + ' draws in 2 s');
  assert.ok(steps >= 238 && steps <= 242, 'logic still at 120 steps/s: ' + steps);
  const dts = env.view().frames.filter((f) => f.phase === 'playing').slice(2).map((f) => f.dt);
  assert.ok(dts.every((dt) => Math.abs(dt - 1 / 60) < 0.002), 'each draw gets the time since ITS last draw');
  env.handle.exit();
  /* 60 Hz is unchanged: every frame draws */
  const e60 = await boot();
  play(e60);
  e60.clock.seconds(2, 60);
  assert.ok(e60.playFrames() >= 119 && e60.playFrames() <= 121, '60 Hz → ' + e60.playFrames());
  e60.handle.exit();
});

test('menus and results draw the 3D scene at ~30 fps on 60 and 120 Hz screens', async () => {
  for (const hz of [60, 120]) {
    const env = await boot();
    const n0 = env.view().frames.length;
    env.clock.seconds(2, hz);
    const n = env.view().frames.length - n0;
    assert.ok(n >= 58 && n <= 62, hz + ' Hz menu → ' + n + ' frames in 2 s');
    assert.ok(env.view().frames.slice(-10).every((f) => f.phase === 'menu'));
    env.handle.exit();
  }
});

/* ================================================================
   #38: the idle 3D loop restarts when the page is visible again
   ================================================================ */
test('menu/results 3D loop wakes up again after the page was hidden', async () => {
  const env = await boot({ round: { endAt: 0.3 } });
  const v = env.view();
  env.clock.seconds(0.5, 60);
  env.doc.hidden = true; env.doc.fire('visibilitychange');
  env.clock.seconds(0.5, 60);                                /* a browser that still runs rAF while hidden */
  const frozen = v.frames.length;
  env.clock.seconds(1, 60);
  assert.equal(v.frames.length, frozen, 'hidden: the loop stopped');
  env.doc.hidden = false; env.doc.fire('visibilitychange');
  env.clock.seconds(1, 60);
  assert.ok(v.frames.length >= frozen + 25, 'visible again: the menu scene animates');
  /* the same on the results sheet */
  play(env);
  env.clock.seconds(1, 60);
  assert.equal(env.qa.phase(), 'results');
  env.doc.hidden = true; env.doc.fire('visibilitychange');
  env.clock.seconds(0.5, 60);
  const atResults = v.frames.length;
  env.clock.seconds(1, 60);
  assert.equal(v.frames.length, atResults);
  env.doc.hidden = false; env.doc.fire('visibilitychange');
  env.clock.seconds(1, 60);
  assert.ok(v.frames.length >= atResults + 25);
  assert.equal(v.frames[v.frames.length - 1].phase, 'results');
  /* waking twice never runs two loops */
  env.doc.fire('visibilitychange'); env.doc.fire('visibilitychange');
  const a = v.frames.length;
  env.clock.seconds(1, 60);
  assert.ok(v.frames.length - a <= 31, 'one loop at ~30 fps');
  env.handle.exit();
});

/* ================================================================
   #26: results focus their main button after the guard and announce the result
   ================================================================ */
test('results: the main button takes focus when the tap guard lifts, and the result is announced', async () => {
  let resolvePB;
  const env = await boot({ round: { endAt: 0.3 }, cfg: { onResult: () => new Promise((r) => { resolvePB = r; }) } });
  play(env);
  env.clock.seconds(0.5, 60);
  assert.equal(env.qa.phase(), 'results');
  const again = env.doc.getElementById('slgAgain'), home = env.doc.getElementById('slgHome');
  assert.equal(again.disabled, true, 'guarded for a moment');
  env.clock.advance(100);
  assert.notEqual(env.doc.activeElement, again);
  env.clock.advance(600);
  assert.equal(again.disabled, false);
  assert.equal(home.disabled, false);
  assert.equal(env.doc.activeElement, again, 'Play again is focused: Enter / Space work');
  assert.deepEqual(env.doc.focusLog[env.doc.focusLog.length - 1].opts, { preventScroll: true }, 'without scrolling the title away');
  const live = env.$('#slgLive');
  assert.equal(live.getAttribute('aria-live'), 'polite');
  assert.equal(live.getAttribute('role'), 'status');
  assert.equal(live.textContent, 'SHOW COMPLETE! 2,345. What a show. 🥇 Gold.');
  resolvePB({ isPB: true });
  await tick(); await tick();
  env.clock.advance(100);
  assert.equal(live.textContent, 'New personal best!', 'a new PB is announced too');
  assert.ok(env.$('.slg-pb'), 'and shown');
  env.handle.exit();
});

test('results: out of game time → focus goes to Back to my island', async () => {
  const arcade = { gate: () => ({ allowed: true, hardStopAtUsed: Infinity }), status: () => ({ limited: true, exhausted: true }), tick: () => ({}), flush() {} };
  const env = await boot({ round: { endAt: 0.3 }, cfg: { arcade } });
  play(env);
  env.clock.seconds(0.5, 60);
  env.clock.advance(700);
  const again = env.doc.getElementById('slgAgain');
  assert.equal(again.disabled, true, 'Play again stays off');
  assert.equal(env.doc.activeElement, env.doc.getElementById('slgHome'));
  env.handle.exit();
});

test('menu, tutorial and pause sheets still focus their main button', async () => {
  const env = await boot();
  env.clock.advance(50);
  assert.equal(env.doc.activeElement, env.doc.getElementById('slgPlay'));
  env.doc.getElementById('slgHow').click();
  env.clock.advance(50);
  assert.equal(env.doc.activeElement, env.doc.getElementById('slgGotIt'));
  env.doc.getElementById('slgGotIt').click();
  env.clock.seconds(0.2, 60);
  env.doc.getElementById('slgPause').click();
  env.clock.advance(50);
  assert.equal(env.qa.phase(), 'paused');
  assert.equal(env.doc.activeElement, env.doc.getElementById('slgResume'));
  env.handle.exit();
});

/* ================================================================
   #5: sheets scroll from the top; #6: the top bar keeps ⏸ / Exit
   ================================================================ */
test('sheets: content is wrapped and top-anchored when it overflows (no centring past the scroll origin)', async () => {
  const env = await boot({ round: { endAt: 0.3 } });
  const css = env.css();
  const scr = rule(css, '.slg-scr');
  assert.match(scr, /overflow:auto/);
  assert.match(scr, /justify-content:flex-start/);
  assert.doesNotMatch(scr, /justify-content:center/, 'centring a taller-than-sheet column hides its top');
  const inner = rule(css, '.slg-in');
  assert.match(inner, /margin:auto 0/, 'auto margins centre only when there is room');
  assert.match(inner, /flex:0 0 auto/, 'never squashed: it overflows downward instead');
  assert.match(inner, /gap:inherit/);
  for (const [name, open] of [['menu', () => {}], ['tutorial', () => env.doc.getElementById('slgHow').click()]]) {
    open();
    const sc = env.$('.slg-scr');
    assert.equal(sc.children.length, 1, name + ': one wrapper child');
    assert.ok(sc.children[0].classList.contains('slg-in'));
    assert.ok(sc.querySelector('.slg-in h2'), name + ': the title is inside the wrapper');
  }
  env.doc.getElementById('slgBack').click();
  play(env);
  env.clock.seconds(0.5, 60);
  const res = env.$('.slg-scr');
  assert.ok(res.classList.contains('glass'));
  assert.ok(res.querySelector('.slg-in h2') && res.querySelector('.slg-in .slg-big'));
  const glass = rule(css, '.slg-scr.glass');
  assert.match(glass, /height:auto/);
  assert.match(glass, /min-height:58%/);
  assert.match(glass, /max-height:100%/, 'the glass grows to fit, then scrolls');
  /* short screens: compact sizes with a vh term (they must out-rank island-encore.css there) */
  const short = css.slice(css.indexOf('@media (max-height: 520px){'));
  assert.ok(short.length > 30, 'a short-screen block exists');
  assert.match(short, /html body \.slg \.slg-scr h2\{font-size:clamp\(22px,min\(6vw,8\.5vh\),50px\);\}/);
  assert.match(short, /html body \.slg \.slg-big\{font-size:clamp\(32px,min\(10vw,13vh\),88px\);\}/);
  assert.doesNotMatch(SRC, /style="font-size:54px;"/, 'no inline sizes the short-screen rules could not reach');
  env.handle.exit();
});

test('top bar: the HUD pill shrinks (ellipsis) and the buttons never do', async () => {
  const env = await boot({ def3d: false, expect3d: false });
  const css = env.css();
  const hud = rule(css, '.slg-top .hud');
  assert.match(hud, /min-width:0/, 'can shrink below its text width');
  assert.match(hud, /overflow:hidden/);
  assert.match(hud, /text-overflow:ellipsis/);
  assert.match(hud, /flex:0 1 auto/);
  assert.match(rule(css, '.slg-top .slg-b'), /flex:0 0 auto/, '🔊 ⏸ 🏝️ Exit keep their size');
  assert.match(rule(css, '.slg-top .ttl'), /min-width:0/);
  const top = env.$('.slg-top');
  assert.deepEqual(top.children.map((c) => c.id || c.className), ['ttl', 'slgHud', 'slgSound', 'slgPause', 'slgExit']);
  env.handle.exit();
});

/* ================================================================
   #28: the "turn sideways" hint is in the sheets, never over a game's HUD
   ================================================================ */
test('rotate hint: shown inside menu / tutorial / pause sheets, absent during play', async () => {
  const env = await boot();
  const inSheet = () => env.doc.querySelectorAll('.slg-rot').every((n) => { for (let p = n.parentNode; p; p = p.parentNode) if (p.classList && p.classList.contains('slg-scr')) return true; return false; });
  assert.equal(env.doc.querySelectorAll('.slg-rot').length, 1, 'menu');
  assert.ok(inSheet());
  assert.equal(env.doc.querySelector('.slg-rot').getAttribute('aria-hidden'), 'true');
  env.doc.getElementById('slgHow').click();
  assert.equal(env.doc.querySelectorAll('.slg-rot').length, 1, 'tutorial');
  env.doc.getElementById('slgGotIt').click();
  env.clock.seconds(0.5, 60);
  assert.equal(env.doc.querySelectorAll('.slg-rot').length, 0, 'nothing over the HUD band while playing');
  assert.equal(env.$('#slgMid').querySelectorAll('.slg-rot').length, 0);
  env.doc.getElementById('slgPause').click();
  assert.equal(env.doc.querySelectorAll('.slg-rot').length, 1, 'pause');
  assert.ok(inSheet());
  const css = env.css();
  const rot = rule(css, '.slg-rot');
  assert.doesNotMatch(rot, /position:absolute|top:/, 'in the sheet flow, not pinned over the stage');
  assert.match(css, /@media \(orientation: portrait\) and \(max-width: 760px\)\{\.slg-rot\{display:block;\}\}/, 'portrait phones only');
  env.handle.exit();
});

/* ================================================================
   #40: no per-frame HUD string / DOM queries when nothing changed
   ================================================================ */
test('an HTML HUD replaces the text pill: round.hud() is not built every frame', async () => {
  let updates = 0;
  const env = await boot({ def: { hud: { mount: () => ({ update() { updates++; }, dispose() {} }) } } });
  play(env);
  env.clock.seconds(1, 60);
  assert.equal(env.qa.round().hudCalls, 0, 'no hidden HUD string per frame');
  assert.ok(updates >= 55, 'the HTML HUD still updates every draw');
  assert.equal(env.$('#slgHud').style.display, 'none');
  env.handle.exit();
});

test('the text HUD, pad glow and count-down touch the DOM only on a change; no per-frame queries', async () => {
  for (const mode of ['2d', '3d']) {
    const env = await boot(mode === '2d' ? { def3d: false, expect3d: false, def: { countdown: 1 } } : { def: { countdown: 1 } });
    env.doc.getElementById('slgPlay').click();
    assert.equal(env.qa.phase(), 'countdown');
    env.clock.seconds(0.3, 60);
    const count = env.$('.slg-count'), hud = env.$('#slgHud'), pad = env.$('[data-ctl="jump"]');
    assert.equal(count.textContent, '1');
    const q0 = env.doc.stats.qs, qa0 = env.doc.stats.qsa, cw0 = count.textWrites, hw0 = hud.textWrites;
    env.clock.seconds(0.5, 60);
    assert.equal(count.textWrites, cw0, mode + ': the count label is written only when it changes');
    env.clock.seconds(3, 60);                                 /* GO, then ~3 s of play */
    assert.equal(env.qa.phase(), 'playing');
    assert.equal(count.parentNode, null, mode + ': the count is gone after GO');
    assert.equal(env.doc.stats.qs - q0, 0, mode + ': no querySelector per frame');
    assert.equal(env.doc.stats.qsa - qa0, 0, mode + ': no querySelectorAll per frame');
    assert.ok(hud.textWrites - hw0 <= 5, mode + ': HUD text written per change (' + (hud.textWrites - hw0) + '), not per frame');
    assert.equal(hud.textContent, env.qa.round().hud());
    assert.equal(pad.getAttribute('data-st'), 's1', mode + ': the pad glow still follows padState');
    env.handle.exit();
  }
});
