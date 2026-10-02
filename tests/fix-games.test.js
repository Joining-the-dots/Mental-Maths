'use strict';
/* Regression tests for the games fixes (review3d findings 7, 8, 13, 19, 23, 27, 29, 30, 31, 32,
   33, 39, 43). Everything runs in Node without a GPU: the HTML HUDs mount into a tiny fake DOM,
   the 3D views import a universal stub for 'three' (every class / call / property is a no-op
   proxy) so their real build and teardown code runs, and the phone layouts are checked by
   projecting the real course through the real camera maths onto the real HUD rectangles. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { register } = require('node:module');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const esm = (f) => import(pathToFileURL(path.join(ROOT, f)).href);

/* ================================================================
   a tiny DOM: enough for the HUDs and the views' canvases
   ================================================================ */
const HTML_NS = 'http://www.w3.org/1999/xhtml', SVG_NS = 'http://www.w3.org/2000/svg';
const VOID = { br: 1, img: 1, input: 1, hr: 1, meta: 1, link: 1 };
class FNode extends EventTarget {
  constructor() { super(); this.childNodes = []; this.parentNode = null; }
  get children() { return this.childNodes.filter((n) => n instanceof FEl); }
  get firstChild() { return this.childNodes[0] || null; }
  appendChild(n) { if (n.parentNode) n.parentNode.removeChild(n); n.parentNode = this; this.childNodes.push(n); return n; }
  append(...ns) { ns.forEach((n) => this.appendChild(typeof n === 'string' ? new FText(n) : n)); }
  insertBefore(n, ref) {
    if (!ref) return this.appendChild(n);
    if (n.parentNode) n.parentNode.removeChild(n);
    const i = this.childNodes.indexOf(ref);
    n.parentNode = this; this.childNodes.splice(i < 0 ? this.childNodes.length : i, 0, n);
    return n;
  }
  removeChild(n) { const i = this.childNodes.indexOf(n); if (i >= 0) this.childNodes.splice(i, 1); n.parentNode = null; return n; }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  contains(n) { for (let p = n; p; p = p.parentNode) if (p === this) return true; return false; }
  get isConnected() { let p = this; while (p.parentNode) p = p.parentNode; return p === globalThis.document; }
  get textContent() { return this.childNodes.map((n) => n.textContent).join(''); }
  set textContent(v) { this.childNodes.forEach((n) => { n.parentNode = null; }); this.childNodes = []; if (v != null && v !== '') this.appendChild(new FText(String(v))); }
  descendants() { const out = []; const walk = (n) => n.children.forEach((c) => { out.push(c); walk(c); }); walk(this); return out; }
  querySelectorAll(sel) { const parts = sel.trim().split(/\s+/); return this.descendants().filter((e) => matchChain(e, parts, this)); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
}
class FText extends FNode {
  constructor(t) { super(); this.data = t; }
  get textContent() { return this.data; }
  set textContent(v) { this.data = String(v); }
}
function classListOf(el) {
  const get = () => (el.getAttribute('class') || '').split(/\s+/).filter(Boolean);
  const put = (l) => el.setAttribute('class', l.join(' '));
  return {
    add(...c) { const l = get(); c.forEach((x) => { if (!l.includes(x)) l.push(x); }); put(l); },
    remove(...c) { put(get().filter((x) => !c.includes(x))); },
    toggle(c, force) { const has = get().includes(c), on = force === undefined ? !has : !!force; if (on && !has) this.add(c); if (!on && has) this.remove(c); return on; },
    contains(c) { return get().includes(c); }
  };
}
class FEl extends FNode {
  constructor(tag, ns) {
    super();
    this.ns = ns || HTML_NS; this.localName = tag; this.tagName = this.ns === SVG_NS ? tag : tag.toUpperCase();
    this.attrs = new Map(); this.hidden = false; this.classList = classListOf(this);
    const style = { cssText: '' };
    style.setProperty = (k, v) => { style[k] = v; };
    style.removeProperty = (k) => { delete style[k]; };
    this.style = style;
  }
  get className() { return this.attrs.get('class') || ''; }
  set className(v) {
    /* like a browser: an SVG element's className is a read-only SVGAnimatedString */
    if (this.ns === SVG_NS) throw new TypeError('Cannot set property className of SVGElement which has only a getter');
    this.attrs.set('class', String(v));
  }
  get id() { return this.attrs.get('id') || ''; }
  set id(v) { this.attrs.set('id', String(v)); }
  setAttribute(k, v) { this.attrs.set(k, String(v)); }
  getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
  hasAttribute(k) { return this.attrs.has(k); }
  removeAttribute(k) { this.attrs.delete(k); }
  get offsetWidth() { return 0; }
  focus() {} blur() {}
  getContext() { return null; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 812, height: 315, right: 812, bottom: 315 }; }
  set innerHTML(html) { this.textContent = ''; parseInto(this, String(html)); }
  get innerHTML() { return ''; }
  insertAdjacentHTML(pos, html) {
    const tmp = new FEl('div'); parseInto(tmp, html);
    const kids = tmp.childNodes.slice();
    if (pos === 'afterbegin') { const first = this.firstChild; kids.forEach((k) => this.insertBefore(k, first)); } else kids.forEach((k) => this.appendChild(k));
  }
}
function matchOne(e, simple) {
  const m = simple.match(/^([a-zA-Z][\w-]*)?((?:[#.][\w-]+|\[[^\]]+\])*)$/);
  if (!m) return false;
  if (m[1] && e.localName.toLowerCase() !== m[1].toLowerCase()) return false;
  const rest = m[2] || '';
  for (const t of rest.match(/[#.][\w-]+|\[[^\]]+\]/g) || []) {
    if (t[0] === '#' && e.id !== t.slice(1)) return false;
    if (t[0] === '.' && !e.classList.contains(t.slice(1))) return false;
    if (t[0] === '[') { const a = t.slice(1, -1).split('='); if (!e.hasAttribute(a[0])) return false; if (a.length > 1 && e.getAttribute(a[0]) !== a[1].replace(/^["']|["']$/g, '')) return false; }
  }
  return true;
}
function matchChain(e, parts, scope) {
  if (!matchOne(e, parts[parts.length - 1])) return false;
  let i = parts.length - 2, p = e.parentNode;
  while (i >= 0 && p && p !== scope.parentNode) { if (p instanceof FEl && matchOne(p, parts[i])) i--; p = p.parentNode; }
  return i < 0;
}
function parseInto(host, html) {
  const stack = [host], re = /<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:\s+[\w:-]+(?:="[^"]*")?)*)\s*(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(html))) {
    const top = stack[stack.length - 1];
    if (m[1]) { stack.pop(); continue; }
    if (m[2]) {
      const ns = m[2] === 'svg' || top.ns === SVG_NS ? SVG_NS : HTML_NS, el = new FEl(m[2], ns);
      for (const a of (m[3] || '').matchAll(/([\w:-]+)(?:="([^"]*)")?/g)) el.setAttribute(a[1], a[2] == null ? '' : a[2]);
      top.appendChild(el);
      if (!m[4] && !VOID[m[2]]) stack.push(el);
      continue;
    }
    top.appendChild(new FText(m[5].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')));
  }
}
function makeDocument() {
  const d = new FNode();
  d.createElement = (t) => new FEl(t);
  d.createElementNS = (ns, t) => new FEl(t, ns);
  d.getElementById = (id) => d.descendants().find((e) => e.id === id) || null;
  d.head = d.appendChild(new FEl('head'));
  d.body = d.appendChild(new FEl('body'));
  d.hidden = false;
  d.fonts = { load: () => Promise.resolve() };
  d.baseURI = 'http://localhost/';
  return d;
}
/* the browser globals (before any world/ script loads, so they all see a window) */
globalThis.window = globalThis;
globalThis.document = makeDocument();
globalThis.matchMedia = (q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} });
const winListeners = { n: 0 };
{
  const add = globalThis.addEventListener, rem = globalThis.removeEventListener;
  const et = new EventTarget();
  globalThis.addEventListener = function (type, fn, o) {
    if (typeof add === 'function' && type !== 'keydown') return add.call(this, type, fn, o);
    winListeners.n++;
    if (o && o.signal) o.signal.addEventListener('abort', () => { winListeners.n--; }, { once: true });
    return et.addEventListener(type, fn, o);
  };
  globalThis.removeEventListener = function (type, fn, o) { if (typeof rem === 'function' && type !== 'keydown') return rem.call(this, type, fn, o); return et.removeEventListener(type, fn, o); };
  globalThis.dispatchEvent = (e) => et.dispatchEvent(e);
}
function memStorage() {
  const m = new Map();
  return { map: m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); } };
}
function withGlobals(vals, fn) {
  const before = {};
  for (const k of Object.keys(vals)) { before[k] = Object.getOwnPropertyDescriptor(globalThis, k); Object.defineProperty(globalThis, k, { value: vals[k], configurable: true, writable: true }); }
  const done = () => { for (const k of Object.keys(vals)) { if (before[k]) Object.defineProperty(globalThis, k, before[k]); else delete globalThis[k]; } };
  let r;
  try { r = fn(); } catch (e) { done(); throw e; }
  if (r && typeof r.then === 'function') return r.finally(done);
  done(); return r;
}

/* ================================================================
   'three' → a universal stub for the 3D view tests
   ================================================================ */
function threeNames() {
  const names = new Set();
  for (const f of fs.readdirSync(path.join(ROOT, 'world/games')).filter((n) => /^(kart-3d.*|pet-course-3d|course-3d-scene)\.js$/.test(n))) {
    for (const m of read('world/games/' + f).matchAll(/\bTHREE(?:_NS)?\.([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  }
  return [...names].filter((n) => n !== 'default');
}
const FAKE_THREE = 'data:text/javascript,' + encodeURIComponent(
  'const any = new Proxy(function () {}, {\n' +
  '  get(t, k) { if (k === Symbol.toPrimitive) return () => 0; if (k === Symbol.iterator) return function* () {}; if (k === "then") return undefined; return any; },\n' +
  '  apply() { return any; }, construct() { return any; }, set() { return true; }, deleteProperty() { return true; }\n' +
  '});\n' +
  'export default any;\n' +
  threeNames().map((n) => 'export const ' + n + ' = any;').join('\n'));
register('data:text/javascript,' + encodeURIComponent(
  'export async function resolve(s, c, next) { if (s === "three" || s.startsWith("three/")) return { url: ' + JSON.stringify(FAKE_THREE) + ', shortCircuit: true }; return next(s, c); }'));

/* the views' long fallback timers must not hold the test process open */
{
  const st = globalThis.setTimeout;
  globalThis.setTimeout = function (fn, ms, ...a) { const t = st(fn, ms, ...a); if (ms >= 1000 && t && t.unref) t.unref(); return t; };
}

/* the modules under test (classic scripts load after the globals above) */
const Music = require('../world/music.js');
const KL = require('../world/games/kart-logic.js');
globalThis.SLKartLogic = KL;
const Kart = require('../world/games/kart.js');
const Course = require('../world/games/pet-course.js');
const CM = require('../world/games/course-3d-math.js');
const KCore = require('../world/games/kart-3d-core.js');
const Pen = require('../world/games/penalty.js');
const CourseHUD = require('../world/games/course-hud.js');

/* ================================================================
   #8  Easy Drive stays on until the child turns it off
   ================================================================ */
test('#8 kart: Easy Drive is saved on first read, so the first race (a new PB) never switches it off', () => {
  const store = memStorage();
  withGlobals({ localStorage: store }, () => {
    const launch1 = { profileKey: 'mia', pb: {} };
    assert.equal(Kart.loadOpts(launch1).easy, true, 'a new profile starts on Easy Drive');
    assert.deepEqual(JSON.parse(store.getItem('slKart:v1:mia')), { mode: 'race', cls: 0, easy: true, cam: 'chase' }, 'the default is saved the first time it is read');
    /* race 1 finishes: world-core records a kart PB; the next launch builds a fresh cfg */
    const launch2 = { profileKey: 'mia', pb: { 'kart:track_loop': { ms: 71000 } } };
    assert.equal(Kart.loadOpts(launch2).easy, true, 'still on after the first PB');
    assert.deepEqual(Kart.controlsFor(launch2).map((c) => c.id), ['left', 'right', 'down', 'drift'], 'no GO pad: the kart still drives itself');
    /* only the child's own choice turns it off — and that choice sticks */
    Kart.setOption(launch2, 'easy', false);
    assert.equal(Kart.loadOpts({ profileKey: 'mia', pb: launch2.pb }).easy, false);
    Kart.setOption({ profileKey: 'mia', pb: launch2.pb }, 'easy', true);
    assert.equal(Kart.loadOpts({ profileKey: 'mia', pb: launch2.pb }).easy, true);
    /* a racer who already had kart times before this version keeps manual driving (and it is saved) */
    assert.equal(Kart.loadOpts({ profileKey: 'old', pb: { 'kart:track_beach': { ms: 60000 } } }).easy, false);
    assert.equal(JSON.parse(store.getItem('slKart:v1:old')).easy, false);
    /* a stored partial record without an Easy Drive choice gets the default filled in and saved */
    store.setItem('slKart:v1:half', JSON.stringify({ mode: 'solo' }));
    const half = Kart.loadOpts({ profileKey: 'half', pb: {} });
    assert.equal(half.mode, 'solo'); assert.equal(half.easy, true);
    assert.equal(JSON.parse(store.getItem('slKart:v1:half')).easy, true);
  });
  /* storage blocked (private mode): the page session still remembers the choice */
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  withGlobals({ localStorage: blocked }, () => {
    assert.equal(Kart.loadOpts({ profileKey: 'zed', pb: {} }).easy, true);
    assert.equal(Kart.loadOpts({ profileKey: 'zed', pb: { 'kart:track_loop': { ms: 70000 } } }).easy, true, 'remembered for the session');
  });
});

/* ================================================================
   #30  the Camera row is there the first time the menu opens
   ================================================================ */
test('#30 kart: the Camera row shows on the FIRST menu when 3D will run (before the view has mounted)', () => {
  const ids = (cfg) => Kart.menuOptions(Object.assign({ variant: 'track_loop', pb: {}, kartOpts: { mode: 'race', cls: 0, easy: true, cam: 'chase' } }, cfg)).map((o) => o.id);
  const ss = memStorage(), ls = memStorage();
  withGlobals({ WebGL2RenderingContext: function () {}, slLoad3D: () => Promise.resolve(null), localStorage: ls, sessionStorage: ss }, () => {
    assert.equal(document.querySelector('.slg .slg-gl'), null, 'the shell has not mounted the 3D canvas yet');
    assert.deepEqual(ids({}), ['mode', 'cls', 'easy', 'cam'], 'the menu is built before mount3d: the row is already there');
    assert.ok(!ids({ demo: true }).includes('cam'), 'shop previews never run 3D');
    /* the view says what really happened: kart-3d.js sets cfg.view3d */
    assert.ok(ids({ view3d: true }).includes('cam'));
    assert.ok(!ids({ view3d: false }).includes('cam'), 'a view that failed or was disposed drops the row');
    /* 3D switched off for the device, or for the session after a failure */
    ls.setItem('slNo3D', '1'); assert.ok(!ids({}).includes('cam')); ls.removeItem('slNo3D');
    ss.setItem('slNo3dGame', '1'); assert.ok(!ids({}).includes('cam')); ss.removeItem('slNo3dGame');
  });
  assert.ok(!ids({}).includes('cam'), 'no WebGL2 / no 3D loader: no Camera row');
});

/* ================================================================
   #27  the tutorial matches Fan support
   ================================================================ */
test('#27 runner: the How-to-play cards count the hearts this run really has and explain Fan support', () => {
  const d = Course.def;
  const first = { tutSeen: false, profileKey: 'fix27a' }, later = { tutSeen: true, profileKey: 'fix27b' };
  const api = { sound() {} };
  /* the shell always shows the menu (def.menuOptions(cfg)) before the cards */
  d.menuOptions(first);
  const cards = d.tutorial, hearts = Course.newRound(api, 'course_meadow', Object.assign({ seed: 3 }, first)).state.maxHearts;
  assert.equal(hearts, 5, 'a very first run has Fan support: 5 hearts');
  assert.ok(cards.some((c) => c[1].includes('Lose all ' + hearts + ' and the show ends')), 'the hearts card says 5');
  assert.ok(!cards.some((c) => /all 3\b/.test(c[1])));
  const fanCard = cards.find((c) => c[0] === '🎟️');
  assert.ok(fanCard && /Fan support is ON/.test(fanCard[1]) && /shield/.test(fanCard[1]) && /menu/.test(fanCard[1]), 'Fan support is explained');
  d.menuOptions(later);
  const cards2 = d.tutorial;
  assert.equal(cards2.length, 4);
  assert.ok(cards2.some((c) => c[1].includes('Lose all 3 and the show ends')));
  assert.equal(Course.newRound(api, 'course_meadow', Object.assign({ seed: 3 }, later)).state.maxHearts, 3);
  /* the child turns it on: the cards follow */
  d.setOption(later, 'fan', true); d.menuOptions(later);
  assert.ok(d.tutorial.some((c) => c[1].includes('Lose all 5')));
  assert.deepEqual(d.tutorialFor(later), d.tutorial, 'tutorialFor(cfg) is the same list');
  /* the menu chip itself says what Fan support does */
  const chip = d.menuOptions(first).find((o) => o.id === 'fan');
  assert.match(chip.label, /5 hearts/); assert.match(chip.label, /shield/);
  for (const c of [cards, cards2]) assert.ok(!/⭐|🌟/.test(JSON.stringify(c)));
});

/* ================================================================
   #31  Debut Run has its beat even when the island music is off
   ================================================================ */
function audioRig(storage) {
  /* a fake AudioContext: just enough nodes and params for the engine to schedule into */
  const ctx = { currentTime: 0, sampleRate: 48000, state: 'running', destination: {}, starts: 0, outputLatency: 0 };
  const param = (v) => ({ value: v, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {}, cancelAndHoldAtTime() {} });
  const node = () => ({ connect() {}, disconnect() {}, gain: param(1), frequency: param(0), Q: param(1), detune: param(0), delayTime: param(0), threshold: param(0), knee: param(0), ratio: param(0), attack: param(0), release: param(0), playbackRate: param(1), pan: param(0) });
  ctx.createGain = node; ctx.createBiquadFilter = node; ctx.createDynamicsCompressor = node; ctx.createDelay = node; ctx.createStereoPanner = node;
  ctx.createOscillator = () => Object.assign(node(), { type: 'sine', start() { ctx.starts++; }, stop() {}, setPeriodicWave() {} });
  ctx.createBufferSource = () => Object.assign(node(), { buffer: null, loop: false, start() { ctx.starts++; }, stop() {} });
  ctx.createBuffer = (ch, len) => ({ getChannelData: () => new Float32Array(len), duration: len / 48000, length: len });
  ctx.resume = () => Promise.resolve();
  const timers = [];
  const eng = Music.createEngine({
    ctx: () => ctx, now: () => ctx.currentTime, storage: () => storage, activated: () => true, hidden: () => false,
    fetchJSON: () => Promise.reject(new Error('no manifest')), fetchBuf: () => Promise.reject(new Error('no file')),
    setInterval: (f) => { timers.push(f); return timers.length; }, clearInterval() {}, setTimeout: (f) => setImmediate(f)
  });
  eng._gesture();
  const run = (sec) => { for (let t = 0; t < sec; t += 0.025) { ctx.currentTime += 0.025; timers.forEach((f) => f()); } };
  return { eng, ctx, run };
}
const flush = () => new Promise((r) => setImmediate(r));

test('#31 music: the beat game has its own 🎵 (default ON) — island music off never silences Debut Run', async () => {
  const s = memStorage(); s.setItem('slMusic', '0');                 /* the child turned the island music off */
  const r = audioRig(s);
  assert.equal(r.eng.enabled(), false);
  r.eng.island('island_day'); await flush();
  assert.equal(r.eng.state().track, null, 'the island stays quiet');
  assert.equal(r.eng.gameEnabled('course'), true, 'Debut Run defaults ON');
  const ch = r.eng.channel({});
  ch.play('course', { countInSec: 1.875 });
  r.run(1);
  assert.equal(r.eng.state().track, 'course', 'the beat plays');
  assert.equal(r.eng.state().audible, true);
  assert.ok(r.ctx.starts > 0);
  /* the game's own toggle (its menu chip) turns it off, and that is remembered per device */
  assert.equal(r.eng.setGameEnabled('course', false), false);
  assert.equal(s.getItem('slMusic:course'), '0');
  r.run(0.5);
  assert.equal(r.eng.state().decks, 0); assert.equal(r.eng.state().audible, false);
  r.eng.setGameEnabled('course', true); r.run(0.2);
  assert.equal(r.eng.state().track, 'course', 'and back on');
  ch.stop(200); r.run(0.5);
  assert.equal(r.eng.state().decks, 0, 'leaving the game: the island 🎵 (off) rules again');
  /* the other games still follow the island 🎵 */
  const k = r.eng.channel({}); k.play('kart'); r.run(0.5);
  assert.equal(r.eng.state().decks, 0, 'kart is quiet with the island music off');
  assert.equal(r.eng.gameEnabled('kart'), false);
  assert.equal(r.eng.setGameEnabled('kart', true), false, 'no separate setting for non-beat games');
  /* a fresh engine reads the stored game setting */
  r.eng.setGameEnabled('course', false);
  const r2 = audioRig(s);
  assert.equal(r2.eng.gameEnabled('course'), false);
  assert.equal(Music.readGameEnabled(memStorage(), 'course'), true);
});

test('#31 music: with the island on and Debut Run\'s 🎵 off, the game is quiet (the island loop does not leak in)', async () => {
  const s = memStorage(); s.setItem('slMusic:course', '0');
  const r = audioRig(s);
  r.eng.island('island_day'); await flush(); r.run(0.3);
  assert.equal(r.eng.state().track, 'island_day');
  const ch = r.eng.channel({});
  ch.menuMode(true);
  ch.play('course', { countInSec: 1.875 }); r.run(0.6);
  assert.equal(r.eng.state().audible, false, 'silent');
  assert.equal(r.eng.state().track, null, 'the island loop the menu was muffling is stopped');
  /* turning the island 🎵 off while a beat game with its own 🎵 ON plays keeps the beat */
  const r3 = audioRig(memStorage());
  const c3 = r3.eng.channel({}); c3.play('course'); r3.run(0.3);
  r3.eng.setEnabled(false); r3.run(0.3);
  assert.equal(r3.eng.state().track, 'course');
});

test('#31 runner: the Debut Run menu has a 🎵 Music chip wired to SLMusic.setGameEnabled', () => {
  const calls = [];
  const fake = { gameEnabled: (t) => { calls.push(['get', t]); return true; }, setGameEnabled: (t, on) => { calls.push(['set', t, on]); return on; } };
  withGlobals({ SLMusic: fake }, () => {
    const opts = Course.def.menuOptions({ tutSeen: true, profileKey: 'fix31' });
    const chip = opts.find((o) => o.id === 'music');
    assert.ok(chip, 'the chip is in the menu');
    assert.equal(chip.value, true);
    assert.deepEqual(chip.options.map((o) => o.value), [true, false]);
    assert.equal(opts[0].id, 'fan', 'Fan support stays first');
    Course.def.setOption({ profileKey: 'fix31' }, 'music', false);
    assert.deepEqual(calls.filter((c) => c[0] === 'set'), [['set', 'course', false]]);
  });
  withGlobals({ SLMusic: undefined }, () => {
    assert.ok(!Course.def.menuOptions({ tutSeen: true, profileKey: 'fix31b' }).some((o) => o.id === 'music'), 'no SLMusic, no chip');
  });
});

/* ================================================================
   #33  one name: Encore Shootout
   ================================================================ */
test('#33 penalty: the game is called Encore Shootout in the shell (title, menu) and on the island', () => {
  assert.equal(Pen.def.title, 'Encore Shootout');
  const rw = read('world/rewards-world.js');
  const m = rw.match(/penalty:\s*\{\s*name:\s*'([^']+)'/);
  assert.ok(m, 'the island Games sheet entry');
  assert.equal(m[1], Pen.def.title, 'the Games sheet and the game agree');
  assert.ok(!/Penalty Shootout/.test(read('world/games/penalty.js')), 'no old name left in the game');
  assert.ok(/Penalty Pitch/.test(read('world/world-core.js')), 'the catalogue item keeps its own name');
});

/* ================================================================
   #29  the photocard's portrait rule is a real top-level rule
   ================================================================ */
function topLevelRules(css) {
  /* split a stylesheet into top-level blocks; report any at-rule found INSIDE a declaration block */
  const out = [], nestedAt = [];
  let depth = 0, start = 0, inAt = [];
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (ch === '{') {
      const head = css.slice(start, i).trim();
      if (depth > 0 && !inAt[depth - 1] && /@/.test(head.split(';').pop())) nestedAt.push(head);
      inAt[depth] = head.startsWith('@');
      depth++; start = i + 1;
      if (depth === 1) out.push({ head, at: i });
    } else if (ch === '}') { depth--; start = i + 1; } else if (ch === ';' && depth > 0) start = i + 1;
  }
  return { rules: out, nestedAt, balanced: depth === 0 };
}
test('#29 penalty 3D HUD: the portrait photocard layout is a top-level @media after the base card rule', async () => {
  const { CSS } = await esm('world/games/penalty-3d-hud.js');
  const css = String(CSS);
  const t = topLevelRules(css);
  assert.ok(t.balanced);
  assert.deepEqual(t.nestedAt, [], 'no at-rule spliced into a declaration block');
  const base = t.rules.findIndex((r) => r.head === '.p3d-card'), media = t.rules.findIndex((r) => r.head === '@media (orientation: portrait)');
  assert.ok(base >= 0 && media > base, 'the portrait rule comes after the base rule, so it wins');
  const block = css.slice(t.rules[media].at);
  assert.match(block, /^\{\.p3d-card\{left:50%;top:70%;width:min\(44vmin,200px\);\}\}/);
  /* the base rule keeps its background and shadow */
  assert.match(css.slice(t.rules[base].at, t.rules[base + 1].at), /background:conic-gradient[^;]+;box-shadow:/);
});

/* ================================================================
   #32 / #43 / #23  the kart HUD
   ================================================================ */
function hasHiddenAncestor(n, root) { for (let p = n; p && p !== root.parentNode; p = p.parentNode) if (p.getAttribute && p.getAttribute('aria-hidden') === 'true') return true; return false; }
test('#32 #43 kart HUD: the 🎥 button is not inside aria-hidden; the Hype Wand bulb is a ✦ sparkle, not the ⭐ reward glyph', async () => {
  const H = await esm('world/games/kart-3d-hud.js');
  const mid = document.body.appendChild(new FEl('div'));
  mid.appendChild(new FEl('div')).id = 'slgTouch';
  let cams = 0;
  const hud = H.makeHud(mid, { core: KCore, sigHex: '#22AAFF', reduced: false, onCam: () => { cams++; } });
  const root = hud.root, cam = root.querySelector('button');
  assert.ok(cam && cam.getAttribute('aria-label') === 'Change camera');
  assert.equal(hasHiddenAncestor(cam, root), false, 'the focusable button is in the accessibility tree');
  for (const sel of ['.k3d-tl', '.k3d-tc', '.k3d-map', '.k3d-wand', '.k3d-wrong']) assert.equal(root.querySelector(sel).getAttribute('aria-hidden'), 'true', sel + ' is decorative');
  cam.dispatchEvent(new Event('click')); assert.equal(cams, 1);
  /* the bulb */
  assert.ok(!/⭐|🌟/.test(root.textContent), 'no reward-star glyph anywhere in the HUD');
  const bulb = root.querySelector('.k3d-bulb');
  assert.equal(bulb.ns, SVG_NS); assert.equal(bulb.firstChild.getAttribute('d'), H.SPARKLE);
  assert.equal(bulb.style.color, '#22AAFF', 'it lights in the signature colour');
  hud.setTrack(KL.buildTrack('track_loop'), 3);
  const v = { place: 2, total: 6, gapVal: 0.4, splits: [], lap: 0, laps: 3, wandPips: 3, full: false, spot: false, dots: [], night: false, wrong: false };
  hud.update(v);
  assert.equal(bulb.classList.contains('full'), false);
  hud.update(Object.assign({}, v, { wandPips: 8, full: true }));      /* an SVG className is read-only: classList only */
  assert.equal(bulb.classList.contains('full'), true);
  hud.update(Object.assign({}, v, { wandPips: 0, full: false, spot: false }));
  assert.equal(bulb.classList.contains('full'), false);
  hud.setSig('#FF00AA'); assert.equal(bulb.style.color, '#FF00AA');
  hud.word('pass', 1);
  for (const w of root.querySelectorAll('.k3d-word')) assert.equal(w.getAttribute('aria-hidden'), 'true', 'pop words are decorative');
  hud.dispose();
  assert.equal(mid.querySelector('.k3d-hud'), null);
  /* and the kart 3D sources never draw the reward star */
  for (const f of fs.readdirSync(path.join(ROOT, 'world/games')).filter((n) => /^kart-3d.*\.js$/.test(n))) assert.ok(!/⭐|🌟/.test(code(read('world/games/' + f))), f);
});

/* the HUD's own numbers, as laid out by its CSS (border-box) */
function kartHudBoxes(vw, vh, laps, mm) {
  const H = vh - 61;                                           /* the shell's top bar: 8 + 44 + 8 + 1 */
  const vmin = Math.min(vw, vh), clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const svgW = vh <= 420 ? 96 : clamp(0.17 * vmin, 96, 150);
  const mapW = svgW + 10, mapH = svgW * (mm.h + 12) / (mm.w + 12) + 10;
  const camW = 118, camH = 44;                                 /* '🎥 Chase' at 15 px + padding + border (generous) */
  const tr = { x0: vw - 10 - Math.max(mapW, camW), x1: vw - 10, y0: 10, y1: 10 + mapH + 6 + camH };
  const pipsW = 20 + laps * 15 + (laps - 1) * 8;
  const pips = { x0: vw / 2 - pipsW / 2, x1: vw / 2 + pipsW / 2, y0: 10, y1: 35 };
  /* place chip + gap chip (Baloo 2 800 ≈ 0.6 em a character, plus padding) */
  const chipF = clamp(0.024 * vmin, 14, 19), placeF = clamp(0.042 * vmin, 20, 34);
  const gapW = KCore.gapText(9.9, 3).length * 0.6 * chipF + 28, placeW = KCore.placeText(6, 6).length * 0.62 * placeF + 32;
  const tl = { x0: 10, x1: 10 + Math.max(gapW, placeW), y0: 10, y1: 10 + placeF * 1.1 + 4 + 6 + chipF * 1.5 + 6 };
  const P = clamp(0.13 * vmin, 64, 104), padTop = H - 10 - P;
  const padsR = { x0: vw - 10 - (P + 10 + 2 * P + 10 + clamp(0.22 * vmin, 110, 170)), x1: vw - 10, y0: padTop, y1: H - 10 };
  const padsL = { x0: 10, x1: 10 + 2 * P + 10, y0: padTop, y1: H - 10 };
  let wand;
  if (vh <= 600 && vw <= 560) {                                /* flat and slim (no handle), under the chips */
    const w = 6 + 6 + 8 * 10 + 8 * 2 + 18, h = 5 + 5 + 18;
    wand = { x0: vw / 2 - w / 2, x1: vw / 2 + w / 2, y0: 80, y1: 80 + h };
  } else if (vh <= 600) {                                      /* lying flat under the lap pips */
    const w = 6 + 8 + 24 + 8 * 13 + 9 * 3 + 22, h = 5 + 5 + 22;
    wand = { x0: vw / 2 - w / 2, x1: vw / 2 + w / 2, y0: 42, y1: 42 + h };
  } else {                                                     /* standing at the right edge */
    const w = 6 + 6 + 26, h = 8 + 6 + 26 + 8 * 13 + 28 + 9 * 3;
    wand = { x0: vw - 14 - w, x1: vw - 14, y0: 0.46 * H - h / 2, y1: 0.46 * H + h / 2 };
  }
  return { H, tr, pips, tl, padsR, padsL, wand };
}
const hit = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
test('#23 kart HUD: the Hype Wand never covers the minimap, the 🎥 button, the lap pips or the pads', async () => {
  const H = await esm('world/games/kart-3d-hud.js');
  const css = String(H.CSS);
  assert.ok(css.includes('@media (max-height:' + H.WAND_ROW_MAX_H + 'px){'), 'a short-screen layout');
  const short = css.slice(css.indexOf('@media (max-height:' + H.WAND_ROW_MAX_H + 'px){'));
  assert.match(short, /\.k3d-wand\{top:42px;right:auto;left:50%;transform:translateX\(-50%\);flex-direction:row-reverse;/, 'flat, centred under the lap pips');
  assert.match(css, /\.k3d-spot\{position:absolute;/, 'the hidden SPOTLIGHT tag takes no room');
  const sizes = [[568, 320], [640, 360], [667, 375], [740, 360], [800, 360], [812, 375], [844, 390], [896, 414], [915, 412], [932, 430],
    [400, 280], [1280, 560], [1280, 600], [1024, 640], [1024, 768], [1180, 820], [1366, 768], [1920, 1080], [375, 812], [390, 844], [768, 1024]];
  for (const id of ['track_loop', 'track_beach']) {
    const mm = KCore.minimap(KL.buildTrack(id), 150);
    for (const [vw, vh] of sizes) {
      const b = kartHudBoxes(vw, vh, 3, mm), tag = id + ' ' + vw + 'x' + vh;
      assert.ok(!hit(b.wand, b.tr), tag + ': wand vs minimap + 🎥 button');
      assert.ok(!hit(b.wand, b.pips), tag + ': wand vs lap pips');
      assert.ok(!hit(b.wand, b.padsR) && !hit(b.wand, b.padsL), tag + ': wand vs the pads');
      if (vh <= 600) assert.ok(!hit(b.wand, b.tl), tag + ': wand vs the place chips');
    }
  }
  /* the reviewer's phone (812x375) had the old wand at y 57-232 over the button at y 83-127 */
  const b = kartHudBoxes(812, 375, 3, KCore.minimap(KL.buildTrack('track_loop'), 150));
  assert.ok(b.wand.y1 < b.tr.y1 && b.wand.x1 < b.tr.x0, 'now beside it, not on it');
});

/* ================================================================
   #7 / #19  Debut Run HUD on phones held sideways
   ================================================================ */
const DEG = Math.PI / 180;
function project(cam, tgt, fov, W, H, P) {
  let f = [tgt[0] - cam[0], tgt[1] - cam[1], tgt[2] - cam[2]]; const fl = Math.hypot(...f); f = f.map((v) => v / fl);
  let r = [-f[2], 0, f[0]]; const rl = Math.hypot(...r); r = r.map((v) => v / rl);
  const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  const v = [P[0] - cam[0], P[1] - cam[1], P[2] - cam[2]];
  const d = v[0] * f[0] + v[1] * f[1] + v[2] * f[2], xc = v[0] * r[0] + v[1] * r[1] + v[2] * r[2], yc = v[0] * u[0] + v[1] * u[1] + v[2] * u[2];
  const t = Math.tan(fov * DEG / 2);
  return { x: (xc / d / (t * W / H) + 1) / 2 * W, y: (1 - yc / d / t) / 2 * H, ppu: H / (2 * t * d) };
}
function compactRects(vw, vh) {
  const C = CourseHUD.COMPACT, w = (n) => 16 + 3 + n;            /* padding + border + content */
  const H = vh - 61, pad = Math.max(64, Math.min(104, 0.13 * Math.min(vw, vh)));
  const maxW = vw <= 600 ? C.narrow.w : C.w;                      /* the counter's and the tip's max-width */
  return {
    H,
    hearts: { x0: C.x, x1: C.x + w(5 * 18 + 4 * 2), y0: C.hearts.top, y1: C.hearts.top + C.hearts.h },
    mid: { x0: C.x, x1: C.x + w(6 * 16 + 5 * 2), y0: C.mid.top, y1: C.mid.top + C.mid.h },
    cnt: { x0: C.x, x1: C.x + maxW, y0: C.cnt.top, y1: C.cnt.top + C.cnt.h },
    tip: { x0: C.x, x1: C.x + maxW, y0: C.tip.top, y1: C.tip.top + 36 },
    prog: { x0: vw / 2 - Math.min(420, vw - 2 * C.prog.side) / 2 - 13, x1: vw / 2 + Math.min(420, vw - 2 * C.prog.side) / 2 + 16, y0: H - C.prog.bottom - 26, y1: H - C.prog.bottom },
    padL: { x0: 10, x1: 10 + pad, y0: H - 10 - pad, y1: H - 10 },
    padR: { x0: vw - 10 - Math.max(110, Math.min(170, 0.22 * Math.min(vw, vh))), x1: vw - 10, y0: H - 10 - pad, y1: H - 10 }
  };
}
const PHONES = [[568, 320], [640, 360], [667, 375], [740, 360], [812, 375], [844, 390], [896, 414], [915, 412], [932, 430]];
test('#7 runner HUD: on phones held sideways no HUD panel covers an ENCORE letter, a glow star or the pet at a jump apex', () => {
  const css = CourseHUD.compactCss();
  assert.ok(css.startsWith('@media ' + CourseHUD.COMPACT.mq + '{'));
  assert.match(css, /\.slc-mid\{left:8px;top:42px;height:56px;transform:none;/, 'HYPE + letters leave the top centre');
  assert.match(css, /\.slc-cnt\{left:8px;right:auto;/, 'the counter leaves the top right');
  assert.match(read('world/games/course-hud.js'), /compactCss\(\)\s+\/\* last/, 'the compact block is the last rule (it wins)');
  const C = CM.CAM, STEP = 1 / 120;
  /* every high pickup in real courses: letters, stars (their logic heights), the pet's path to them */
  const items = [];
  for (const seed of [1, 7, 2026, 31337]) {
    const course = Course.buildCourse(seed);
    for (const it of course.items) if (it.kind !== 'snack') items.push({ y: CM.worldY(it.y), kind: it.kind });
  }
  assert.ok(items.filter((i) => i.kind === 'letter').length >= 24);
  const top = Math.max(...items.map((i) => i.y));
  for (const [vw, vh] of PHONES) {
    const R = compactRects(vw, vh), W = vw, H = R.H, fov = CM.fovFor(W / H);
    const panels = [R.hearts, R.mid, R.cnt, R.tip];
    for (const kind of ['dj', 'boing', 'boingdj', 'jump']) {
      const P = Course.PATH[kind], Hs = P.H.map((h) => h / 100);
      for (const v of [2.9, 3.3, 3.8]) {
        let hSm = 0;
        /* 1.2 s on the ground, then the jump; the camera follows with the spec smoothing */
        for (let n = -144; n < Hs.length; n++) {
          const h = n < 0 ? 0 : Hs[n];
          hSm = CM.approach(hSm, h, STEP, C.smooth);
          const px = n * STEP * v, cam = [px + C.dx, C.y + C.ky * hSm, C.z], tgt = [px + C.dx, C.lookY + C.ky * hSm, 0];
          /* the pet: the rig with ears, tail and accessories (0.8 u wide, 0.8 u tall) */
          const a = project(cam, tgt, fov, W, H, [px - 0.4, h + 0.8, 0]), b = project(cam, tgt, fov, W, H, [px + 0.4, h, 0]);
          const pet = { x0: a.x, x1: b.x, y0: a.y, y1: b.y };
          for (const p of panels) assert.ok(!hit(p, pet), vw + 'x' + vh + ' ' + kind + ': the pet stays clear of the HUD column');
          /* every pickup ahead of the pet, anywhere from the right edge to the pet's paws */
          for (const ahead of [0, 1, 2.5, 4, 6, 8]) {
            for (const y of [3.22, 3.52, top, 2.09]) {
              const q = project(cam, tgt, fov, W, H, [px + ahead, y, 0]), rr = 0.3 * q.ppu;
              if (q.x - rr > W || q.y + rr < 0) continue;              /* not on screen yet */
              const box = { x0: q.x - rr, x1: q.x + rr, y0: q.y - rr, y1: q.y + rr };
              for (const p of panels) assert.ok(!hit(p, box), vw + 'x' + vh + ' ' + kind + ' pickup ' + ahead + ' u ahead at ' + y + ' u');
            }
          }
        }
      }
    }
    /* the 2D fallback (letterboxed 960x540, the render's own vertical follow): the pet sprite box
       (132x110 around PET_CX) on every frame of every jump, and every pickup ahead of it */
    const T = Course.TUNING, s = Math.min(W / 960, H / 540), ox = (W - 960 * s) / 2, oy = (H - 540 * s) / 2;
    const cx = T.PET_X + T.HB_X + T.PET_W / 2;
    const scr = (lx, ly, camY) => ({ x: ox + lx * s, y: oy + (ly + camY) * s });
    for (const kind of ['dj', 'boing', 'boingdj', 'jump']) {
      let camY = 0;
      for (const hpx of [0].concat(Course.PATH[kind].H)) {
        camY += (Math.max(0, hpx - 250) * 0.8 - camY) * (1 / 60 * 10);
        const feet = T.GROUND - hpx, a = scr(cx - 66, feet - 101, camY), b = scr(cx + 66, feet + 9, camY);
        const pet2d = { x0: a.x, x1: b.x, y0: a.y, y1: b.y };
        for (const p of panels) assert.ok(!hit(p, pet2d), vw + 'x' + vh + ' 2D ' + kind + ': the pet sprite stays clear of the HUD column');
        for (const ahead of [40, 150, 300, 500]) {
          const q = scr(cx + ahead, feet - 40, camY), rr = 24 * s;
          for (const p of panels) assert.ok(!hit(p, { x0: q.x - rr, x1: q.x + rr, y0: q.y - rr, y1: q.y + rr }), vw + 'x' + vh + ' 2D pickup');
        }
      }
    }
    /* the mini runway sits between the pads, below the playfield */
    assert.ok(!hit(R.prog, R.padL) && !hit(R.prog, R.padR), vw + 'x' + vh + ': runway bar vs pads');
    assert.ok(R.prog.y0 > project([C.dx, C.y, C.z], [C.dx, C.lookY, 0], fov, W, H, [0, 0, 0]).y, 'below the pet\'s paws in 3D');
    assert.ok(R.prog.y0 >= oy + T.GROUND * s, 'below the 2D ground line');
  }
});

test('#19 runner HUD: on phones the TAP to jump! / SLIDE! tip sits behind the pet, never over the prop it teaches', () => {
  const C = CM.CAM, sizes = CM.kindSizes(Course.KINDS);
  for (const [vw, vh] of PHONES) {
    const R = compactRects(vw, vh), W = vw, H = R.H, fov = CM.fovFor(W / H);
    const cam = [C.dx, C.y, C.z], tgt = [C.dx, C.lookY, 0];
    /* the rehearsal props (hurdle crossbar, LED gate board) while they are 0.5-6 u ahead */
    for (const ahead of [0.5, 1, 2, 3.5, 6]) {
      for (const [x0, x1, y0, y1] of [[ahead, ahead + sizes.low.w, 0.44, sizes.low.h], [ahead, ahead + sizes.bar.w, sizes.bar.under, sizes.bar.under + sizes.bar.board]]) {
        const a = project(cam, tgt, fov, W, H, [x0, y1, 0]), b = project(cam, tgt, fov, W, H, [x1, y0, 0]);
        const prop = { x0: a.x, x1: b.x, y0: a.y, y1: b.y };
        assert.ok(!hit(R.tip, prop), vw + 'x' + vh + ': tip vs a prop ' + ahead + ' u ahead');
      }
    }
    /* the pet on the ground */
    const a = project(cam, tgt, fov, W, H, [-0.31, 0.6, 0]), b = project(cam, tgt, fov, W, H, [0.31, 0, 0]);
    assert.ok(!hit(R.tip, { x0: a.x, x1: b.x, y0: a.y, y1: b.y }), vw + 'x' + vh + ': tip vs the pet');
    /* a one-line tip never reaches the ⬇ SLIDE pad */
    if (H >= 286) assert.ok(R.tip.y1 <= R.padL.y0, vw + 'x' + vh + ': tip vs the SLIDE pad');
  }
  const css = CourseHUD.compactCss();
  assert.match(css, new RegExp('\\.slc-tip\\{left:8px;transform:none;bottom:auto;top:150px;max-width:' + CourseHUD.COMPACT.w + 'px;'));
});

test('#7 #19 runner HUD: mounted, the compact rules are the LAST in the stylesheet and the letters tip is short on phones', () => {
  const mid = document.body.appendChild(new FEl('div'));
  const pet = Course.newRound({ sound() {} }, 'course_meadow', { seed: 9, tutSeen: true });
  pet.wantEvents = true; pet.events = [];
  let small = false;
  return withGlobals({ matchMedia: (q) => ({ matches: small && q === CourseHUD.COMPACT.mq }) }, () => {
    const h = CourseHUD.mount(mid, { user: { color: '#22AAFF' } });
    const st = document.getElementById('slcHudCss').textContent;
    assert.ok(st.trimEnd().endsWith(CourseHUD.compactCss()), 'the compact block comes after the narrow-portrait rules');
    small = true;
    pet.events.push({ type: 'letter', li: 0 }); pet.state.lettersMask = 1;
    h.update(pet, 'playing');
    assert.equal(mid.querySelector('.slc-tip').textContent, 'All 6 letters = ENCORE!');
    h.dispose();
  });
});

/* ================================================================
   #13 / #39 / #30  the 3D views' build: lease hand-back, avatar warm-up, cfg.view3d
   ================================================================ */
function fakeStage(log) {
  const canvas = new FEl('canvas');
  const island = document.body.appendChild(new FEl('div'));
  island.appendChild(canvas);
  canvas.style.cssText = 'island-css'; canvas.className = 'island-canvas';
  const anyR = new Proxy(function () {}, { get(t, k) { if (k === 'domElement') return canvas; if (k === Symbol.toPrimitive) return () => 0; if (k === 'then') return undefined; return anyR; }, apply() { return anyR; }, set() { return true; } });
  const lease = {
    renderer: anyR, canvas, active: true,
    resize() {}, sample() {}, start() { log.push('start'); },
    compile() { log.push('compile'); },
    release() { log.push('release'); lease.released = (lease.released || 0) + 1; }
  };
  const stub = new Proxy(function () {}, { get(t, k) { if (k === Symbol.toPrimitive) return () => 0; if (k === 'then') return undefined; return stub; }, apply() { return stub; }, construct() { return stub; }, set() { return true; } });
  const SL3D = {
    ready: true, tier: 'LOW', quality: { pixelRatio: 1, shadows: false, outlines: false, particleScale: 1, cones: true, steps: [] },
    budget: { tier: 'LOW', pixelRatio: 1, antialias: false, particles: 64, gameDrawCalls: 60, shadows: false },
    lease(kind, handlers) { log.push('lease:' + kind); lease.handlers = handlers; return lease; },
    kit() { return stub; },
    make() { return stub; },
    makeRig() { log.push('rig'); return { root: stub, bones: {}, sockets: {}, setPose() {}, setShow() {}, play() { return null; }, dispose() {} }; },
    makeAvatar() { log.push('avatar'); return { root: { visible: true, position: stub, rotation: stub }, setWand() {}, setShow() {}, play() {}, dispose() { log.push('avatar.dispose'); } }; },
    makeWand() { return stub; }, makeFanBlob() { return stub; }
  };
  return { SL3D, lease, canvas, island };
}

test('#13 kart 3D: a build that throws after taking the lease hands it back and leaves nothing behind', { timeout: 60000 }, async () => {
  const log = [], st = fakeStage(log);
  globalThis.SLIsland3D = { ensure: async () => st.SL3D };
  const mid = document.body.appendChild(new FEl('div'));
  mid.appendChild(new FEl('canvas')).id = 'slgCanvas';
  const listeners0 = winListeners.n;
  const cfg = { variant: 'track_loop', user: { color: '#22AAFF' }, kartOpts: { mode: 'race', cls: 0, easy: true, cam: 'chase' } };
  let hudBuilt = false;
  Object.defineProperty(cfg, 'kart', { get() { hudBuilt = !!mid.querySelector('.k3d-hud'); throw new Error('boom: a model builder failed'); } });
  const fails = [];
  const view = await esm('world/games/kart-3d.js');
  await assert.rejects(view.create(mid, { cfg, def: Kart.def, reduced: true, onFail: (r) => fails.push(r) }), /boom/);
  assert.ok(hudBuilt, 'the throw came late in the build (after the HUD), not at the start');
  assert.deepEqual(log.filter((l) => l === 'lease:game' || l === 'release'), ['lease:game', 'release'], 'the lease is handed back exactly once');
  assert.equal(mid.querySelector('.k3d-hud'), null, 'the half-built HUD is removed');
  assert.equal(winListeners.n, listeners0, 'the C-key listener is removed');
  assert.equal(st.canvas.style.cssText, 'island-css'); assert.equal(st.canvas.className, 'island-canvas');
  assert.equal(st.canvas.parentNode, st.island, 'the island keeps its canvas');
  assert.equal(cfg.view3d, false, 'kart.js: no Camera row for a view that failed');
  assert.deepEqual(fails, []);
});

test('#13 #30 kart 3D: a good build sets cfg.view3d (the menu\'s Camera row) and dispose hands the lease back', { timeout: 60000 }, async () => {
  const log = [], st = fakeStage(log);
  globalThis.SLIsland3D = { ensure: async () => st.SL3D };
  const mid = document.body.appendChild(new FEl('div'));
  mid.appendChild(new FEl('canvas')).id = 'slgCanvas';
  const listeners0 = winListeners.n;
  const cfg = { variant: 'track_loop', user: { color: '#22AAFF' }, kartOpts: { mode: 'race', cls: 0, easy: true, cam: 'chase' } };
  const view = await esm('world/games/kart-3d.js');
  const v = await view.create(mid, { cfg, def: Kart.def, reduced: true, onFail() {} });
  assert.ok(v && v.canvas === st.canvas, 'the view renders on the leased canvas');
  assert.equal(cfg.view3d, true);
  assert.ok(Kart.menuOptions(cfg).some((o) => o.id === 'cam'), 'the Camera row');
  assert.ok(winListeners.n > listeners0);
  v.dispose();
  assert.equal(st.lease.released, 1);
  assert.equal(cfg.view3d, false);
  assert.equal(winListeners.n, listeners0);
  assert.equal(mid.querySelector('.k3d-hud'), null);
  v.dispose();
  assert.equal(st.lease.released, 1, 'dispose is idempotent');
});

async function courseView(cfg, st) {
  globalThis.SLIsland3D = { ensure: () => Promise.resolve(st.SL3D) };
  globalThis.SLCourse = Course;
  globalThis.SLCourse3DMath = CM;                       /* the browser global its UMD sets (Node gets module.exports) */
  const mid = document.body.appendChild(new FEl('div'));
  mid.appendChild(new FEl('canvas')).id = 'slgCanvas';
  const fails = [];
  const view = await esm('world/games/pet-course-3d.js');
  const v = await view.create(mid, { cfg, reduced: true, onFail: (r) => fails.push(r) });
  return { v, mid, fails };
}
test('#13 runner 3D: a build that throws after taking the lease hands it back and falls back to 2D', { timeout: 60000 }, async () => {
  const log = [], st = fakeStage(log);
  const cfg = { pet: { id: 'pet_puppy', name: 'Bo', acc: {} }, user: { color: '#22AAFF', avatar: '🙂' } };
  let n = 0;
  Object.defineProperty(cfg, 'variant', { get() { n++; throw new Error('boom: the look table failed'); } });
  const r = await courseView(cfg, st);
  assert.equal(r.v, null, 'no view');
  assert.ok(n > 0, 'the throw happened after the lease');
  assert.deepEqual(r.fails, ['build'], 'the shell is told, and carries on in 2D');
  assert.deepEqual(log.filter((l) => l === 'lease:game' || l === 'release'), ['lease:game', 'release'], 'the lease is handed back');
  assert.equal(st.canvas.style.cssText, 'island-css'); assert.equal(st.canvas.className, 'island-canvas');
  assert.equal(st.canvas.getAttribute('aria-hidden'), null);
});

test('#39 #13 runner 3D: the avatar is built before the warm-up compile; dispose hands the lease back', { timeout: 60000 }, async () => {
  const log = [], st = fakeStage(log);
  const cfg = { variant: 'course_meadow', pet: { id: 'pet_puppy', name: 'Bo', acc: {} }, user: { color: '#22AAFF', avatar: '🙂' } };
  const r = await courseView(cfg, st);
  assert.ok(r.v && r.v.canvas === st.canvas, 'the view is up');
  assert.deepEqual(r.fails, []);
  const ia = log.indexOf('avatar'), ic = log.indexOf('compile');
  assert.ok(ia >= 0, 'the avatar is built with the view, not at the finish');
  assert.ok(ic > ia, 'and BEFORE the warm-up compile, so its shaders are ready: ' + log.join(' '));
  assert.equal(log.filter((l) => l === 'avatar').length, 1);
  r.v.frame(null, 1 / 60, 0, 'menu', 0);
  assert.equal(log.filter((l) => l === 'avatar').length, 1, 'never rebuilt');
  r.v.dispose();
  assert.equal(st.lease.released, 1);
  assert.ok(log.includes('avatar.dispose'));
});
