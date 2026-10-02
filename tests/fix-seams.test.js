'use strict';
/* My Island 3D — the seams between the scene controller (world/island3d/island3d.js) and its
   siblings, run in Node with no GPU:
     · the REAL actors.js / edit3d.js / fx3d.js / models-garden.js driven through island3d's own
       call shapes (actorState / editState / adaptSystem, the exact objects mount() sends);
     · a headless mount() — a fake DOM, a fake THREE with real camera maths (so canvas taps and
       drags pick real things), a fake kit / lease / env, mocked timers — for the pointer, timer,
       music and rebuild paths.
   Regression tests for the review findings: pets / avatar / picking / anchors / emits through the
   actors adapter, the edit grid + ghost through the edit adapter, cancelled drags never commit,
   encore timers stop on suspend, island music only while the island is on screen, lamps keep
   their lit state across a rebuild / remount, the fx seams (member colour, 'flight', the dust ring
   radius) and slow taps still being taps. */
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../world/world-core.js');
const L = require('../world/world-look.js');
const G = require('../world/island3d/grid3d.js');
const M = require('../world/island3d/motion.js');
const CH = require('../world/island3d/models-characters.js');
const B = require('../world/island3d/pets-brain.js');
const A = require('../world/island3d/actors.js');
const E = require('../world/island3d/edit3d.js');
const F = require('../world/island3d/fx3d.js');
const Cam = require('../world/island3d/camera.js');
const GARDEN = require('../world/island3d/models-garden.js');
const S = require('../world/island3d/island3d.js');

/* the browser globals the island modules read (node --test runs every file in its own process) */
Object.assign(globalThis, { SLWorldCore: C, SLIslandLook: L, SLGrid3D: G, SLMotion: M, SLPetBrain: B, SLIslandCamera: Cam });

const DEG = Math.PI / 180;
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

/* ================================================================
   A small fake THREE (real camera maths: lookAt, perspective, project / unproject)
   ================================================================ */
class V3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; this.isVector3 = true; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(v) { return this.set(v.x, v.y, v.z); }
  clone() { return new V3(this.x, this.y, this.z); }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
  lerp(v, k) { this.x += (v.x - this.x) * k; this.y += (v.y - this.y) * k; this.z += (v.z - this.z) * k; return this; }
  length() { return Math.hypot(this.x, this.y, this.z); }
  normalize() { const l = this.length() || 1; return this.multiplyScalar(1 / l); }
  equals(v) { return v.x === this.x && v.y === this.y && v.z === this.z; }
  setScalar(s) { return this.set(s, s, s); }
  setFromMatrixPosition(m) { const e = m.elements; return this.set(e[12], e[13], e[14]); }
  applyMatrix4(m) {
    const e = m.elements, x = this.x, y = this.y, z = this.z, w = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15]);
    return this.set((e[0] * x + e[4] * y + e[8] * z + e[12]) * w, (e[1] * x + e[5] * y + e[9] * z + e[13]) * w, (e[2] * x + e[6] * y + e[10] * z + e[14]) * w);
  }
  project(cam) { return this.applyMatrix4(cam.matrixWorldInverse).applyMatrix4(cam.projectionMatrix); }
  unproject(cam) { return this.applyMatrix4(cam.projectionMatrixInverse).applyMatrix4(cam.matrixWorld); }
}
class M4 {
  constructor() { this.elements = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; }
  identity() { this.elements = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; return this; }
  copy(m) { this.elements = m.elements.slice(); return this; }
  multiplyMatrices() { return this; }                 /* only the (always-true) fake frustum reads it */
  compose() { return this; }
  makeScale() { return this; }
  setPosition() { return this; }
  makeTranslation() { return this; }
}
class Quat { setFromEuler() { return this; } }
class Euler { set() { return this; } }
class Frustum { setFromProjectionMatrix() { return this; } intersectsSphere() { return true; } }
class Sphere { constructor() { this.center = new V3(); this.radius = 0; } }
class Color {
  constructor(r = 1, g = 1, b = 1) { this.r = r; this.g = g; this.b = b; this.isColor = true; }
  copy(c) { this.r = c.r; this.g = c.g; this.b = c.b; return this; }
  clone() { return new Color(this.r, this.g, this.b); }
  setRGB(r, g, b) { this.r = r; this.g = g; this.b = b; return this; }
  lerp(c, k) { this.r += (c.r - this.r) * k; this.g += (c.g - this.g) * k; this.b += (c.b - this.b) * k; return this; }
  multiply(c) { this.r *= c.r; this.g *= c.g; this.b *= c.b; return this; }
}
class Obj3 {
  constructor() {
    this.position = new V3(); this.rotation = new V3(); this.scale = new V3(1, 1, 1); this.up = new V3(0, 1, 0);
    this.children = []; this.parent = null; this.visible = true; this.name = ''; this.userData = {};
  }
  add(...os) { for (const o of os) { if (!o) continue; if (o.parent) o.parent.remove(o); o.parent = this; this.children.push(o); } return this; }
  remove(o) { const i = this.children.indexOf(o); if (i >= 0) { this.children.splice(i, 1); o.parent = null; } return this; }
  clear() { for (const c of this.children.slice()) this.remove(c); return this; }
  traverse(fn) { fn(this); for (const c of this.children) c.traverse(fn); }
  updateMatrixWorld() {}
  getWorldPosition(out) { return out.copy(this.position); }
}
class Mesh extends Obj3 { constructor(geometry, material) { super(); this.geometry = geometry || null; this.material = material || null; this.isMesh = true; } }
class PCam extends Obj3 {
  constructor(fov, aspect, near, far) {
    super();
    this.isCamera = true; this.isPerspectiveCamera = true;
    this.fov = fov; this.aspect = aspect; this.near = near; this.far = far;
    this.matrixWorld = new M4(); this.matrixWorldInverse = new M4(); this.projectionMatrix = new M4(); this.projectionMatrixInverse = new M4();
    this.basis = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    this.updateProjectionMatrix(); this.updateMatrixWorld();
    PCam.last = this;
  }
  updateProjectionMatrix() {
    const t = Math.tan(this.fov * DEG / 2), x = 1 / (this.aspect * t), y = 1 / t;
    const c = -(this.far + this.near) / (this.far - this.near), d = -2 * this.far * this.near / (this.far - this.near);
    const p = this.projectionMatrix.elements.fill(0), q = this.projectionMatrixInverse.elements.fill(0);
    p[0] = x; p[5] = y; p[10] = c; p[11] = -1; p[14] = d;
    q[0] = 1 / x; q[5] = 1 / y; q[11] = 1 / d; q[14] = -1; q[15] = c / d;
  }
  lookAt(tx, ty, tz) {
    const p = this.position, u = this.up;
    let zx = p.x - tx, zy = p.y - ty, zz = p.z - tz; const zl = Math.hypot(zx, zy, zz) || 1; zx /= zl; zy /= zl; zz /= zl;
    let xx = u.y * zz - u.z * zy, xy = u.z * zx - u.x * zz, xz = u.x * zy - u.y * zx; const xl = Math.hypot(xx, xy, xz) || 1; xx /= xl; xy /= xl; xz /= xl;
    this.basis = [xx, xy, xz, zy * xz - zz * xy, zz * xx - zx * xz, zx * xy - zy * xx, zx, zy, zz];
  }
  updateMatrixWorld() {
    const [xx, xy, xz, yx, yy, yz, zx, zy, zz] = this.basis, p = this.position, e = this.matrixWorld.elements, i = this.matrixWorldInverse.elements;
    e[0] = xx; e[1] = xy; e[2] = xz; e[3] = 0; e[4] = yx; e[5] = yy; e[6] = yz; e[7] = 0; e[8] = zx; e[9] = zy; e[10] = zz; e[11] = 0; e[12] = p.x; e[13] = p.y; e[14] = p.z; e[15] = 1;
    i[0] = xx; i[1] = yx; i[2] = zx; i[3] = 0; i[4] = xy; i[5] = yy; i[6] = zy; i[7] = 0; i[8] = xz; i[9] = yz; i[10] = zz; i[11] = 0;
    i[12] = -(xx * p.x + xy * p.y + xz * p.z); i[13] = -(yx * p.x + yy * p.y + yz * p.z); i[14] = -(zx * p.x + zy * p.y + zz * p.z); i[15] = 1;
  }
}
class Attr { constructor(array, size) { this.array = array; this.itemSize = size; this.needsUpdate = false; this.updateRanges = []; } setUsage() { return this; } }
class IGeo {
  constructor() { this.attributes = {}; this.index = null; this.instanceCount = 0; }
  setIndex(i) { this.index = i; } setAttribute(n, a) { this.attributes[n] = a; return this; }
  getAttribute(n) { return this.attributes[n]; } dispose() { this.disposed = true; }
}
class ShaderMat { constructor(o) { Object.assign(this, o || {}); } dispose() { this.disposed = true; } }
const T = {
  Vector3: V3, Matrix4: M4, Quaternion: Quat, Euler: Euler, Frustum: Frustum, Sphere: Sphere, Color: Color,
  Object3D: Obj3, Group: Obj3, Scene: Obj3, Mesh: Mesh, PerspectiveCamera: PCam,
  InstancedBufferGeometry: IGeo, BufferAttribute: Attr, InstancedBufferAttribute: Attr, ShaderMaterial: ShaderMat,
  UniformsUtils: { merge: (list) => Object.assign({}, ...list) }, UniformsLib: { fog: {} },
  CustomBlending: 5, AddEquation: 100, OneFactor: 201, OneMinusSrcAlphaFactor: 205, DynamicDrawUsage: 35048
};

/* ================================================================
   A fake DOM element (enough for island3d's container, labels, keyboard list and canvas)
   ================================================================ */
class FakeEl {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase(); this.children = []; this.parentNode = null; this.attrs = {}; this.listeners = {};
    this.style = {}; this.className = ''; this._text = ''; this.nodeType = 1; this.disabled = false; this._w = 0; this._h = 0;
    const self = this;
    this.classList = {
      add(c) { const s = new Set(self.className.split(/\s+/).filter(Boolean)); s.add(c); self.className = [...s].join(' '); },
      remove(c) { self.className = self.className.split(/\s+/).filter((x) => x && x !== c).join(' '); },
      contains(c) { return self.className.split(/\s+/).includes(c); }
    };
  }
  get firstChild() { return this.children[0] || null; }
  set textContent(v) { this._text = String(v); this.children = []; }
  get textContent() { return this._text; }
  get clientWidth() { return this._w; }
  get clientHeight() { return this._h; }
  get isConnected() { for (let n = this; n; n = n.parentNode) if (n._root) return true; return false; }
  appendChild(c) { if (c.parentNode) c.parentNode.removeChild(c); this.children.push(c); c.parentNode = this; return c; }
  insertBefore(c, ref) {
    if (c.parentNode) c.parentNode.removeChild(c);
    const i = ref ? this.children.indexOf(ref) : -1;
    if (i < 0) this.children.push(c); else this.children.splice(i, 0, c);
    c.parentNode = this; return c;
  }
  removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parentNode = null; return c; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; }
  addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); }
  removeEventListener(t, f) { const a = this.listeners[t] || []; const i = a.indexOf(f); if (i >= 0) a.splice(i, 1); }
  dispatch(t, e) { const ev = Object.assign({ type: t, target: this, cancelable: true, preventDefault() {} }, e); (this.listeners[t] || []).slice().forEach((f) => f(ev)); return ev; }
  contains(n) { for (; n; n = n.parentNode) if (n === this) return true; return false; }
  matches(sel) {
    let m = /^\[([\w-]+)(?:="([^"]*)")?\]$/.exec(sel);
    if (m) return m[2] == null ? this.getAttribute(m[1]) != null : this.getAttribute(m[1]) === m[2];
    m = /^\.([\w-]+)$/.exec(sel);
    return !!m && this.classList.contains(m[1]);
  }
  closest(sel) { for (let n = this; n; n = n.parentNode) if (n.matches && n.matches(sel)) return n; return null; }
  querySelector(sel) { for (const c of this.children) { if (c.matches(sel)) return c; const f = c.querySelector(sel); if (f) return f; } return null; }
  querySelectorAll(sel) { const out = []; const walk = (n) => { for (const c of n.children) { if (c.matches(sel)) out.push(c); walk(c); } }; walk(this); return out; }
  getBoundingClientRect() { const r = this.rect || { left: 0, top: 0, width: this._w, height: this._h }; return { left: r.left, top: r.top, width: r.width, height: r.height, right: r.left + r.width, bottom: r.top + r.height }; }
  focus() { globalThis.document.activeElement = this; }
  setPointerCapture(id) { if (!this.isConnected) throw new Error('InvalidStateError'); this._cap = id; }
  hasPointerCapture(id) { return this._cap === id; }
  releasePointerCapture(id) { if (this._cap === id) this._cap = null; }
}

/* ================================================================
   Fake kit pieces: billboard / blob pools, ItemBatch, the kit, rigs
   ================================================================ */
function pool(cap) {
  const used = new Set(), sets = new Map();
  const p = {
    mesh: new Mesh(), capacity: cap, sets, disposed: false,
    alloc() { for (let i = 0; i < cap; i++) if (!used.has(i)) { used.add(i); return i; } return -1; },
    free(i) { used.delete(i); sets.delete(i); }, set(i, ...a) { sets.set(i, a); },
    commit() {}, clear() { used.clear(); }, dispose() { p.disposed = true; },
    get live() { return used.size; }
  };
  return p;
}
const PIVOT_MAT = { identity() { return this; }, compose() { return this; } };
class FakeBatch {
  constructor(tpl) { this.template = tpl; this.group = new Obj3(); this.copies = new Map(); this.hidden = new Set(); this.log = []; this.disposed = false; this.fp = [1, 1]; }
  add(uid, p) { this.copies.set(uid, { x: p.x, y: p.y, fp: p.fp, state: {} }); this.fp = p.fp || [1, 1]; }
  has(uid) { return this.copies.has(uid); }
  remove(uid) { this.copies.delete(uid); this.hidden.delete(uid); }
  move(uid, x, y) { const c = this.copies.get(uid); if (c) { c.x = x; c.y = y; } }
  worldPos(uid, out) { const c = this.copies.get(uid), p = c ? G.pivot(this.template.id, c.x, c.y) : { x: 0, y: 0, z: 0 }; out.x = p.x; out.y = p.y; out.z = p.z; return out; }
  anchorWorld(uid, name, out) { this.worldPos(uid, out); out.y += 1; return out; }
  hide(uid) { this.hidden.add(uid); }
  show(uid) { this.hidden.delete(uid); }
  setState(uid, k, v) { const c = this.copies.get(uid); if (c) c.state[k] = v; this.log.push(['state', uid, k, v]); }
  stateOf(uid, k) { const c = this.copies.get(uid); return c ? c.state[k] : undefined; }
  setPivot() {}
  pivot() { return PIVOT_MAT; }
  setHighlight(uid, lv) { this.log.push(['hl', uid, lv]); }
  copyGeometry() { return null; }
  basePositions() { return null; }
  commit() {}
  dispose() { this.disposed = true; }
}
function hashCol(s) { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return [(h & 255) / 255, ((h >>> 8) & 255) / 255, ((h >>> 16) & 255) / 255]; }
function fromHex(hex) { const n = parseInt(String(hex).slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; }
function fakeKit() {
  const K = {
    THREE: T, tier: 'MID', batches: [], pools: [], selPulse: 0,
    templates: { get: (id, sk) => ({ id, sk, anchors: { top: [0, 1, 0] }, pivots: {}, parts: [] }) },
    stateKey: (id, st) => L.stateKey(id, st || {}),
    batch(tpl) { const b = new FakeBatch(tpl); K.batches.push(b); return b; },
    setSelPulse(v) { K.selPulse = v; },
    billboards(o) { const p = pool(o.capacity); K.pools.push(p); return p; },
    blobs(n) { const p = pool(n); p.mesh.material = {}; K.pools.push(p); return p; },
    tex: { sparkles: () => ({}), halo: () => ({}) },
    col: (tok) => Object.assign(new Color(...hashCol(tok)), { tok }),
    rgb: (hex) => Object.assign(new Color(...fromHex(hex)), { tok: hex }),
    mat: () => ({ opacity: 1 }),
    variant: (mk, tag, patch) => Object.assign({ color: new Color(), key: mk }, patch),
    instantiate() { const o = new Obj3(); o.userData.dispose = () => { o.gone = true; }; o.add(new Mesh()); return o; }
  };
  return K;
}
function fakeRigs(SL) {
  SL.made = [];
  function rig(kind, id) {
    const r = { kind, id, root: new Obj3(), poses: 0, last: null, show: 0, wand: false, disposed: false, tris: 100, meshes: { toon: {} },
      setPose(p) { r.poses++; r.last = Object.assign({}, p); return r; }, setShow(k) { r.show = k; return r; },
      setWand(on) { r.wand = on; return r; }, play() { return r.last; }, dispose() { r.disposed = true; if (r.root.parent) r.root.parent.remove(r.root); } };
    SL.made.push(r);
    return r;
  }
  SL.makeRig = (id, acc) => Object.assign(rig('pet', id), { acc });
  SL.makeAvatar = (o) => Object.assign(rig('avatar', 'me'), { opts: o });
}
/* an fx sibling that speaks the island protocol and records everything */
function recFx(h) {
  const fx = {
    host: h, member: h.member, members: [], emits: [], halos: [], decals: [], disposed: false,
    emit(kind, pos, n, o) { fx.emits.push({ kind, pos: { x: pos.x, y: pos.y, z: pos.z }, n, o }); },
    halo(key, on) { fx.halos.push([key, !!on]); }, decal(key, on) { fx.decals.push([key, !!on]); },
    setMember(c) { fx.members.push(c); }, update() { return false; }, setReduced() {}, setQuality() {}, clear() {},
    info() { return { rec: true }; }, dispose() { fx.disposed = true; }
  };
  return fx;
}
function fakeEnv(o, calls) {
  const env = {
    group: new Obj3(), show: 0, opts: o,
    update() { return false; }, setLand() {}, attach() {}, aim() {}, setReduced() {}, setShow(k) { env.show = k; },
    showtime(on, opt) { env.show = on ? 1 : 0; calls.push(['showtime', !!on, !!(opt && opt.reduced)]); },
    invalidateShadows() { calls.push(['shadows']); }, setMember(c) { calls.push(['member', c]); },
    riseRegion() { return null; }, lockedAt() { return null; }, dispose() { calls.push(['dispose']); }, info() { return {}; }
  };
  return env;
}

/* ================================================================
   Worlds and island views (the shape rewards-world.islandView() builds)
   ================================================================ */
function makeWorld(o = {}) {
  const u = { points: 0 };
  C.grantStarter(u, Date.UTC(2026, 0, 1));
  let n = 0;
  const buy = (id) => { const r = C.purchase(u, id, { tx: 'txseam' + (n++) + 'abcdefgh', trial: true }); assert.ok(r && r.ok, 'buy ' + id); return r; };
  (o.pets || []).forEach(buy);
  let lantern = null;
  if (o.lantern) {
    buy('lantern');
    /* the free land cell nearest the default camera (the front row), so nothing stands in front of it */
    const land = C.landSet(u.world), cells = Object.keys(land).map((k) => k.split(',').map(Number)).sort((a, b) => b[1] - a[1] || Math.abs(a[0] - 7) - Math.abs(b[0] - 7));
    for (const [c, r] of cells) { if (C.canPlace(u.world, 'lantern', c, r).ok) { const res = C.place(u, 'lantern', c, r); lantern = { uid: res.uid, x: c, y: r }; break; } }
    assert.ok(lantern, 'a lantern on the island');
  }
  return { u, w: u.world, buy, lantern };
}
function styleOf(w) { return { wall: C.selected(w, 'wall'), roof: C.selected(w, 'roof'), door: C.selected(w, 'door'), details: w.details }; }
function viewOf(w, extra) {
  return Object.assign({
    world: w, placed: w.placed.filter((p) => !!C.item(p.id)), style: styleOf(w), unlocked: C.unlockedRegions(w),
    pets: w.pets.filter((p) => C.owns(w, p.id)).map((p) => ({ id: p.id, name: p.name, acc: p.acc || {}, active: w.activePet === p.id })),
    avatar: { color: '#4FC3F7', emoji: '🦊', name: 'Kid' }, mode: 'play', selectedUid: null, placing: null, lit: {}, anim: {}
  }, extra || {});
}

/* ================================================================
   The headless mount harness
   ================================================================ */
const PERF = Object.getOwnPropertyDescriptor(globalThis, 'performance');
function harness(t, cfg = {}) {
  const clock = { now: 1000 };
  Object.defineProperty(globalThis, 'performance', { value: { now: () => clock.now }, configurable: true, writable: true });
  t.after(() => { if (PERF) Object.defineProperty(globalThis, 'performance', PERF); });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const K = cfg.K || fakeKit();
  const music = [], sounds = [], envCalls = [], calls = [];
  globalThis.SLMusic = { island: (ctx) => music.push(ctx), clock: () => null };
  globalThis.SLSound = { make: () => { const s = (name) => sounds.push(name); s.pet = (id) => sounds.push('pet:' + id); return s; }, panFor: () => 0 };
  globalThis.SLIslandEnv = { create: (K2, S2, o) => fakeEnv(o, envCalls) };
  globalThis.document = { createElement: (tag) => new FakeEl(tag), activeElement: null };
  const leases = [], made = { fx: [], actors: [], edit: [] };
  const SL = {
    ready: true, THREE: T, tier: 'MID', budget: { particles: 256 }, quality: { particleScale: 1 }, issues: [],
    models: cfg.models || {}, petPose: CH, onQuality: null,
    kit: () => K,
    lease(name, h) {
      const canvas = new FakeEl('canvas');
      canvas.rect = { left: 0, top: 0, width: 800, height: 450 };
      const l = { name, h, canvas, renderer: { domElement: canvas }, running: false, released: false,
        start() { l.running = true; }, stop() { l.running = false; }, invalidate() {}, observe() {}, compile() { return null; },
        resize(w, hh) { if (h.onResize) h.onResize(w, hh); }, setCovered() {}, setHidden() {}, setReduced() {}, input() {},
        release() { l.released = true; }, info() { return {}; } };
      leases.push(l);
      return l;
    },
    defineApi(name, f) { SL[name] = f(K, SL); }
  };
  fakeRigs(SL);
  if (cfg.fx !== 'none') SL.makeFx = (h) => { const fx = recFx(h); made.fx.push(fx); return fx; };
  if (cfg.actors !== 'none') {
    A.register(SL);                                     /* exactly what actors.js does at load */
    const mk = SL.makeActors;
    SL.makeActors = (h) => { const a = mk(h); made.actors.push(a); return a; };
  }
  if (cfg.edit !== 'none') {
    SL.makeEdit = typeof cfg.edit === 'function'
      ? (h) => { const e = cfg.edit(h); made.edit.push(e); return e; }
      : (h) => { const e = E.create(h.K || K, SL, h); made.edit.push(e); return e; };   /* = SL3D.makeEdit(o) */
  }
  globalThis.SL3D = SL;
  const on = {};
  ['tapItem', 'tapPet', 'tapAvatar', 'tapLand', 'tapCell', 'dragStart', 'dragCell', 'dragEnd', 'ready', 'fail'].forEach((k) => {
    on[k] = (...a) => { calls.push([k, ...a]); if (cfg.on && cfg.on[k]) cfg.on[k](...a); };
  });
  if (cfg.on && cfg.on.dragCancel) on.dragCancel = (...a) => { calls.push(['dragCancel', ...a]); cfg.on.dragCancel(...a); };
  const stage = S.mount({ reduced: !!cfg.reduced, user: { name: 'Kid', color: '#4FC3F7', avatar: '🦊' }, on });
  const cam = PCam.last, lease = leases[leases.length - 1];
  const host = new FakeEl('div'); host._root = true;
  stage.element._w = 800; stage.element._h = 450;
  stage.attach(host);
  const H = {
    stage, on, calls, music, sounds, envCalls, made, K, SL, cam, lease, host, clock,
    canvas: lease.canvas,
    step(n = 1, dt = 1 / 60) { for (let i = 0; i < n; i++) { clock.now += dt * 1000; lease.h.frame(dt, clock.now / 1000); } },
    advance(ms) { clock.now += ms; t.mock.timers.tick(ms); },
    screen(p) { const v = new V3(p.x, p.y, p.z).project(cam); return { x: (v.x + 1) / 2 * 800, y: (1 - v.y) / 2 * 450, z: v.z }; },
    ptr(type, x, y, id = 1) { return lease.canvas.dispatch(type, { pointerId: id, pointerType: 'touch', button: 0, clientX: x, clientY: y }); },
    called(k) { return calls.filter((c) => c[0] === k); },
    batchOf(uid) { return K.batches.filter((b) => !b.disposed && b.has(uid)).pop() || null; }
  };
  t.after(() => { try { stage.dispose(); } catch (e) { /* already gone */ } });
  return H;
}
function boxCentre(id, x, y) { const hb = G.hitBox(id, x, y); return { x: (hb.min[0] + hb.max[0]) / 2, y: (hb.min[1] + hb.max[1]) / 2, z: (hb.min[2] + hb.max[2]) / 2 }; }

/* ================================================================
   1. Pure seams: protocol shapes, ray maths, positions and fx options
   ================================================================ */
test('seams: the fake camera maths round-trips (project ∘ unproject)', () => {
  const c = new PCam(30, 16 / 9, 0.5, 200);
  c.position.set(3, 9, 14); c.lookAt(0, 0.3, 0); c.updateMatrixWorld();
  const p = new V3(1.2, 0.8, -2.5), s = p.clone().project(c);
  assert.ok(Math.abs(s.x) < 1 && Math.abs(s.y) < 1 && s.z > -1 && s.z < 1);
  const back = s.clone().unproject(c);
  assert.ok(near(back.x, p.x, 1e-6) && near(back.y, p.y, 1e-6) && near(back.z, p.z, 1e-6));
  const centre = new V3(0, 0.3, 0).project(c);
  assert.ok(near(centre.x, 0, 1e-9) && near(centre.y, 0, 1e-9), 'the look-at point is the centre of the view');
});

test('seams: adaptSystem keeps island-protocol siblings, wraps actors.js / edit3d.js, drops unknown shapes', () => {
  const native = { sync() {}, pick() {}, anchor() {} };
  assert.equal(S.adaptSystem('actors', native, {}), native);
  const ed = { setState() {} };
  assert.equal(S.adaptSystem('edit', ed, {}), ed);
  const fx = { emit() {} };
  assert.equal(S.adaptSystem('fx', fx, {}), fx);
  assert.equal(S.adaptSystem('actors', { sync() {} }, {}), null, 'no pick / hits: the built-in takes over');
  assert.equal(S.adaptSystem('edit', { show() {} }, {}), null);
  assert.equal(S.adaptSystem('fx', {}, {}), null);
  assert.equal(S.adaptSystem('actors', null, {}), null);
  assert.equal(S.adaptSystem('actors', { sync() {}, hits() {}, anchorOf() {} }, {}).adapted, 'actors.js');
  assert.equal(S.adaptSystem('edit', { show() {}, ghost() {} }, {}).adapted, 'edit3d.js');
});

test('seams: positions from siblings ([x, y, z] arrays) and their emit options reach fx in fx names', () => {
  assert.deepEqual(S.toPoint([1, 2, 3]), { x: 1, y: 2, z: 3 }, 'actors.js passes arrays');
  assert.deepEqual(S.toPoint(new Float32Array([4, 5, 6])), { x: 4, y: 5, z: 6 });
  assert.deepEqual(S.toPoint({ x: 1, y: 2, z: 3 }), { x: 1, y: 2, z: 3 });
  assert.deepEqual(S.toPoint(new V3(7, 8, 9)), { x: 7, y: 8, z: 9 });
  assert.equal(S.toPoint(null), null);
  const src = { colors: ['Neon Pink', 'Star Gold'], reduced: true };
  const o = S.fxOpts(src);
  assert.deepEqual(o.tokens, ['Neon Pink', 'Star Gold']);
  assert.equal(o.colors, undefined); assert.equal(o.reduced, true);
  assert.notEqual(o.tokens, src.colors, 'copied, never kept');
  assert.equal(S.fxOpts({ colors: 'Star Gold' }).token, 'Star Gold');
  assert.equal(S.fxOpts({ colors: 'Star Gold', token: 'Neon Cyan' }).token, 'Neon Cyan');
  const r = S.fxOpts({ r: 1.35 });
  assert.equal(r.radius, 1.35); assert.equal(r.r, undefined, "fx3d reads 'radius'");
  assert.deepEqual(S.fxOpts({ to: [1, 2, 3], dur: 0.5 }).to, { x: 1, y: 2, z: 3 });
  assert.equal(S.fxOpts(null), undefined);
  /* the dust ring under a big item now spreads with its footprint (fx3d spawn reads opts.radius) */
  const rnd = () => 0.5;
  const wide = F.spawn(F.KINDS.dust, 0, 6, rnd, S.fxOpts({ r: 1.35 })), small = F.spawn(F.KINDS.dust, 0, 6, rnd, { r: 1.35 });
  assert.ok(Math.hypot(wide.x, wide.z) > 0.5 && Math.hypot(small.x, small.z) < 0.1, Math.hypot(wide.x, wide.z) + ' vs ' + Math.hypot(small.x, small.z));
  assert.ok(Math.hypot(wide.vx, wide.vz) > Math.hypot(small.vx, small.vz));
});

test('seams: ray / sphere picking over actors.js hit spheres', () => {
  const o = { x: 0, y: 5, z: 10 }, d = new V3(0, -5, -10).normalize();
  assert.ok(near(S.raySphere(o, d, 0, 0, 0, 0.4), Math.hypot(5, 10) - 0.4, 1e-9));
  assert.equal(S.raySphere(o, d, 3, 0, 0, 0.4), -1);
  assert.equal(S.raySphere({ x: 0, y: 0, z: 0 }, d, 0, 0, 0, 1), 0, 'inside');
  const hits = [
    { kind: 'pet', id: 'pet_puppy', x: 0, y: 0, z: 0, r: 0.4, pickable: true },
    { kind: 'me', id: 'me', x: 0, y: 1, z: 2, r: 0.4, pickable: true },
    { kind: 'pet', id: 'pet_kitten', x: 0, y: 2, z: 4, r: 0.4, pickable: false }
  ];
  assert.deepEqual(S.pickHits(o, d, hits).target, 'me', 'the nearest pickable sphere');
  hits[1].pickable = false;
  assert.equal(S.pickHits(o, d, hits).target, 'pet:pet_puppy');
  assert.equal(S.pickHits(o, new V3(1, 0, 0), hits), null);
});

/* ================================================================
   2. The REAL actors.js through island3d's call shapes (finding: no pets / avatar, no picking)
   ================================================================ */
function actorsSeam(opts = {}) {
  const { w } = makeWorld({ pets: ['pet_dragon'] });
  const K = fakeKit(), SL = { tier: 'MID', petPose: CH, defineApi(n, f) { SL[n] = f(K, SL); } };
  fakeRigs(SL);
  A.register(SL);
  const scene = new Obj3(), emits = [], sounds = [];
  const user = S.normUser({ name: 'Kid', color: '#4FC3F7', avatar: '🦊' });
  const snd = (name) => sounds.push(name); snd.pet = (id) => sounds.push('pet:' + id);
  /* island3d's hostFor('actors'): the host IS actors.js' create() opts */
  const host = { kind: 'actors', K, SL3D: SL, THREE: T, tier: 'MID', scene, group: new Obj3(), camera: null, reduced: false, user,
    member: user.color, voice: false, sound: snd, core: C, grid: G,
    emit: (k, pos, n, o) => { const p = S.toPoint(pos, {}); if (p) emits.push({ k, p, n, o: S.fxOpts(o) }); } };
  const raw = SL.makeActors(host);
  const act = S.adaptSystem('actors', raw, host);
  const view = viewOf(w);
  const unlocked = C.unlockedRegions(w), placed = view.placed;
  const state = S.actorState(view, { user, placed, unlocked, land: G.landFrom(unlocked), mode: opts.mode || 'play', reduced: false });
  return { w, K, SL, scene, emits, sounds, host, raw, act, view, state, unlocked, placed, user };
}
const FCTX = { show: 0, beat: 0, beatPos: 4.5, bar: 1, bpm: 100, reduced: false, mode: 'play', camera: null, music: null, dt: 1 / 30 };

test('actors seam: island3d\'s sync object gives actors.js its pets and the avatar', () => {
  const s = actorsSeam();
  assert.equal(s.act.adapted, 'actors.js');
  assert.deepEqual(Object.keys(s.state).sort(), ['avatar', 'land', 'mode', 'pets', 'placed', 'reduced', 'unlocked', 'user', 'world']);
  s.act.sync(s.state);
  const info = s.act.info();
  assert.equal(info.pets, 2, 'the starter puppy and the dragon');
  assert.equal(info.avatar, true, 'the avatar stands at the house');
  assert.equal(s.SL.made.filter((r) => r.kind === 'pet').length, 2);
  const av = s.SL.made.find((r) => r.kind === 'avatar');
  assert.deepEqual(av.opts, { color: '#4FC3F7', emoji: '🦊' });
  for (let i = 0; i < 60; i++) assert.equal(typeof s.act.update(1 / 30, i / 30, FCTX), 'boolean');
  for (const r of s.SL.made) assert.ok(r.poses >= 60, r.id + ' posed every frame');
  /* view.avatar === false → no avatar; a sync without pets drops the rigs */
  s.act.sync(S.actorState(Object.assign({}, s.view, { avatar: false }), { user: s.user, placed: s.placed, unlocked: s.unlocked, mode: 'play' }));
  assert.equal(s.act.info().avatar, false);
  s.act.sync(S.actorState(Object.assign({}, s.view, { pets: [] }), { user: s.user, placed: s.placed, unlocked: s.unlocked, mode: 'play' }));
  assert.equal(s.act.info().pets, 0);
  s.act.dispose();
  assert.equal(s.raw.group.parent, null);
});

test('actors seam: pick(origin, dir) hits pets and the avatar; anchor(target, out) places labels', () => {
  const s = actorsSeam();
  s.act.sync(s.state);
  for (let i = 0; i < 30; i++) s.act.update(1 / 30, i / 30, FCTX);
  const hits = s.raw.hits([]);
  assert.equal(hits.length, 3);
  const cam = { x: 0, y: 9, z: 16 };
  for (const h of hits) {
    const d = new V3(h.x - cam.x, h.y - cam.y, h.z - cam.z).normalize();
    const p = s.act.pick(cam, d);
    assert.ok(p && p.t > 0, 'a ray at ' + h.id + ' hits something');
    if (p.target === (h.kind === 'me' ? 'me' : 'pet:' + h.id)) continue;
    /* another actor in front on the same ray is a fair hit too, as long as it is nearer */
    assert.ok(p.t <= Math.hypot(h.x - cam.x, h.y - cam.y, h.z - cam.z), 'nearest first');
  }
  assert.equal(s.act.pick(cam, new V3(0, 1, 0)), null, 'the sky');
  const out = new V3(NaN, NaN, NaN);
  const an = s.act.anchor('pet:pet_dragon', out);
  assert.equal(an, out);
  assert.ok(Number.isFinite(an.x) && an.y > 0.4);
  assert.ok(s.act.anchor('me', new V3()).y > 0.9, 'the avatar label sits above its head');
  assert.equal(s.act.anchor('pet:nobody', new V3()), null);
  /* edit / place mode: pets sit still and cannot be picked */
  s.act.setMode('edit');
  for (let i = 0; i < 3; i++) s.act.update(1 / 30, 1, FCTX);
  const h0 = s.raw.hits([])[0];
  assert.equal(s.act.pick(cam, new V3(h0.x - cam.x, h0.y - cam.y, h0.z - cam.z).normalize()), null);
});

test('actors seam: sparkles reach fx at the actor (array positions converted), perform / dance / tap protocol', () => {
  const s = actorsSeam();
  s.act.sync(s.state);
  for (let i = 0; i < 10; i++) s.act.update(1 / 30, i / 30, FCTX);
  s.emits.length = 0;
  assert.equal(s.act.emote('pet:pet_dragon', 'rainbow'), true);
  assert.ok(s.emits.length >= 1, 'rainbow sparkles go to the fx sibling');
  const p = s.raw.brain.pet('pet_dragon'), e = s.emits[0];
  assert.equal(e.k, 'sparkle');
  assert.ok(near(e.p.x, p.x) && near(e.p.y, p.y + 0.55) && near(e.p.z, p.z), 'at the dragon, not the world origin');
  assert.ok(Array.isArray(e.o.tokens) && e.o.tokens.length >= 3, 'the rainbow colours as fx tokens');
  assert.equal(s.act.perform('trampoline', 'nope'), 0, 'no pet → 0 (never -1)');
  /* a tap: the actors' own reaction, never the pet voice (rewards-world plays it on tapPet) */
  assert.equal(s.act.tap('pet:pet_puppy'), true);
  assert.equal(s.raw.brain.pet('pet_puppy').tapT, s.raw.brain.now);
  assert.ok(!s.sounds.some((n) => n.startsWith('pet:')), 'host.voice = false');
  assert.equal(s.act.tap('me'), true);
  const av = s.SL.made.find((r) => r.kind === 'avatar');
  let waved = false;
  for (let i = 0; i < 60; i++) { s.act.update(1 / 30, 3 + i / 30, FCTX); if (av.last.armR > 100) waved = true; }
  assert.ok(waved, 'the avatar waves');
  assert.ok(s.sounds.includes('pop'), "then the finger-heart 'pop' through the island's sound");
  assert.equal(s.act.active(), 'pet_puppy');
  assert.ok(s.act.dance({ bpm: 118, counts: 8, reduced: false }) > 0, 'the dance break length in seconds');
  ['setShow', 'setShowtime', 'setUser', 'setQuality', 'setReduced'].forEach((k) => assert.doesNotThrow(() => s.act[k](k === 'setShow' ? 0.5 : true)));
});

/* ================================================================
   3. The REAL edit3d.js through island3d's call shapes (finding: no grid, no ghost)
   ================================================================ */
function editSeam() {
  const { w, lantern } = makeWorld({ lantern: true });
  const K = fakeKit(), SL = { tier: 'MID', issues: [] };
  const host = { kind: 'edit', K, SL3D: SL, THREE: T, tier: 'MID', scene: new Obj3(), group: new Obj3(), camera: null, reduced: false, core: C, grid: G, look: L };
  const raw = E.create(K, SL, host);
  const ed = S.adaptSystem('edit', raw, host);
  const unlocked = C.unlockedRegions(w), land = G.landFrom(unlocked);
  return { w, lantern, K, SL, raw, ed, unlocked, land };
}
function overlay(raw) {
  const mesh = raw.group.children.find((m) => m.name === 'edit3d:cells');
  const g = mesh.geometry, n = g.instanceCount, fill = g.attributes.iFill.array, shape = g.attributes.iShape.array, out = [];
  for (let i = 0; i < n; i++) out.push({ fillA: fill[i * 4 + 3], flags: shape[i * 4 + 3] });
  return { visible: mesh.visible, n, cells: out };
}

test('edit seam: ✏️ Edit outlines every land cell; play hides it again', () => {
  const s = editSeam();
  assert.equal(s.ed.adapted, 'edit3d.js');
  s.ed.setState(S.editState('edit', s.land, s.unlocked, null, null, null));
  const ov = overlay(s.raw), nLand = Object.keys(s.land).length;
  assert.equal(s.raw.info().cells, nLand);
  assert.equal(ov.n, nLand); assert.equal(ov.visible, true);
  assert.ok(ov.cells.every((c) => c.fillA === 0 && (c.flags & 1)), 'white dashed outlines');
  assert.equal(s.raw.info().ghost, null);
  assert.equal(s.ed.ghostShown(), false);
  s.ed.setState(S.editState('play', s.land, s.unlocked, null, null, null));
  assert.equal(s.raw.info().cells, 0);
  assert.equal(overlay(s.raw).visible, false);
});

test('edit seam: placement shows the ghost and a valid (green) or invalid (pulsing red) footprint', () => {
  const s = editSeam();
  const st = styleOf(s.w);
  const ghostOf = (id) => ({ id, st: L.resolveStyle(id, st), stateKey: L.stateKey(id, L.resolveStyle(id, st)), template: {}, material: null });
  /* moving the lantern to a free cell: valid */
  const free = C.findSpot(s.w, 'lantern');
  let placing = { id: 'lantern', uid: s.lantern.uid, x: free.x, y: free.y, ok: true, st };
  s.ed.setState(S.editState('place', s.land, s.unlocked, placing, ghostOf('lantern'), null));
  let info = s.raw.info();
  assert.equal(info.ghost, 'lantern'); assert.equal(info.ghostValid, true);
  assert.equal(s.ed.ghostShown(), true);
  let ov = overlay(s.raw);
  assert.ok(ov.cells.some((c) => near(c.fillA, E.stateStyle('valid').fillA)), 'the footprint is valid');
  assert.ok(!ov.cells.some((c) => c.flags & 2), 'nothing pulses');
  assert.equal(info.cells, Object.keys(s.land).length, 'the rest of the land stays outlined');
  /* onto the house: invalid */
  const house = s.w.placed.find((p) => p.id === 'house_cottage');
  placing = Object.assign({}, placing, { x: house.x, y: house.y, ok: false });
  s.ed.setState(S.editState('place', s.land, s.unlocked, placing, ghostOf('lantern'), null));
  info = s.raw.info();
  assert.equal(info.ghost, 'lantern'); assert.equal(info.ghostValid, false);
  ov = overlay(s.raw);
  assert.ok(ov.cells.some((c) => near(c.fillA, E.stateStyle('invalid').fillA) && (c.flags & 2)), 'the footprint pulses red');
  assert.equal(s.ed.update(1 / 60, 1, { camera: null }), true, 'the ghost wobbles: keep rendering');
  /* a new house placement shows its gold entrance */
  const hp = S.placementCells({ id: 'house_cottage', x: 5, y: 3, ok: true }, C);
  assert.deepEqual(hp.entrance, C.entranceCells(C.item('house_cottage'), 5, 3));
  /* done: back to play */
  s.ed.setState(S.editState('play', s.land, s.unlocked, null, null, null));
  assert.equal(s.raw.info().ghost, null); assert.equal(s.ed.ghostShown(), false);
  assert.equal(s.raw.info().cells, 0);
  s.ed.dispose();
});

/* ================================================================
   4. mount(): actors in the real controller (taps, labels, emits)
   ================================================================ */
test('mount: pets and the avatar appear, can be tapped on the canvas and carry labels', (t) => {
  const { w } = makeWorld({ pets: ['pet_dragon'] });
  let H = null;
  H = harness(t, { on: { tapPet: (id) => H.stage.emote('pet:' + id, 'heart'), tapAvatar: () => H.stage.emote('me', 'wave') } });
  H.stage.sync(viewOf(w));
  H.step(90);
  const info = H.stage.info();
  assert.match(info.systems.actors, /actors\.js adapter/);
  assert.match(info.systems.edit, /edit3d\.js adapter/);
  assert.equal(info.actors.pets, 2); assert.equal(info.actors.avatar, true);
  assert.ok(H.called('ready').length === 1, 'ready');
  /* tap each actor where it stands until one is a pet (items may stand in front of some) */
  const raw = H.made.actors[0];
  const fxPool = H.K.pools.find((p) => p.capacity === A.FX_CAP);
  let tapped = null;
  for (const h of raw.hits([]).filter((x) => x.kind === 'pet')) {
    const p = H.screen({ x: h.x, y: h.y, z: h.z });
    H.ptr('pointerdown', p.x, p.y); H.advance(80); H.ptr('pointerup', p.x, p.y);
    const tp = H.called('tapPet');
    if (tp.length) { tapped = tp[0][1]; break; }
  }
  assert.ok(tapped, 'a canvas tap hits a pet');
  assert.equal(raw.brain.pet(tapped).tapT, raw.brain.now, 'the pet does its happy hop');
  if (tapped !== 'pet_dragon') assert.equal(fxPool.live, 1, "one emote: rewards-world's emote of the same pet right after is deduped");
  assert.ok(!H.sounds.some((n) => n.startsWith('pet:')), 'the actors never play the voice (rewards-world does)');
  /* the keyboard list: 'That's you!' → the avatar waves, then the finger-heart 'pop' */
  const me = H.stage.element.querySelector('[data-k="me"]');
  assert.ok(me, 'the avatar is in the keyboard list');
  H.stage.element.querySelector('.slw-sr-list').dispatch('click', { target: me });
  assert.equal(H.called('tapAvatar').length, 1);
  const av = H.SL.made.find((r) => r.kind === 'avatar' && !r.disposed);
  let waved = false;
  const pops = H.sounds.filter((n) => n === 'pop').length;
  for (let i = 0; i < 70; i++) { H.step(1, 1 / 30); if (av.last && av.last.armR > 100) waved = true; }
  assert.ok(waved, 'the avatar waves');
  assert.ok(H.sounds.filter((n) => n === 'pop').length > pops, "the finger-heart 'pop'");
  /* labels anchored to a pet and to 'me' are placed on screen */
  const petTag = new FakeEl('div'), meTag = new FakeEl('div');
  petTag.classList.add('slw-tag3d'); meTag.classList.add('slw-tag3d');
  H.stage.setAnchors([{ el: petTag, pet: 'pet_puppy' }, { el: meTag, me: true }]);
  H.step(2);
  assert.equal(petTag.style.visibility, '', 'the pet label is shown');
  assert.match(petTag.style.transform || '', /translate3d\(/);
  assert.equal(meTag.style.visibility, '');
  /* actor sparkles land at the actor, in fx names */
  const fx = H.made.fx[H.made.fx.length - 1];
  fx.emits.length = 0;
  H.stage.emote('pet:pet_dragon', 'rainbow');
  const sp = fx.emits.find((e) => e.kind === 'sparkle');
  const dp = raw.brain.pet('pet_dragon');
  assert.ok(sp && near(sp.pos.x, dp.x) && near(sp.pos.z, dp.z) && sp.pos.y > 0.3, 'at the dragon, not the world origin');
  assert.ok(Array.isArray(sp.o.tokens));
});

/* ================================================================
   5. mount(): the edit grid, the ghost and the hidden copy
   ================================================================ */
test('mount: ✏️ Edit shows the grid; moving an item shows its ghost and hides the real copy only behind a ghost', (t) => {
  const { w, lantern } = makeWorld({ lantern: true });
  const H = harness(t);
  H.stage.sync(viewOf(w, { mode: 'edit' }));
  H.step(5);
  const ed = H.made.edit[0], land = G.landFrom(C.unlockedRegions(w));
  assert.equal(ed.info().cells, Object.keys(land).length, 'the dashed land grid');
  const free = C.findSpot(w, 'lantern');
  H.stage.sync(viewOf(w, { mode: 'place', placing: { id: 'lantern', uid: lantern.uid, x: free.x, y: free.y, ok: true, st: styleOf(w) } }));
  H.step(5);
  assert.equal(ed.info().ghost, 'lantern'); assert.equal(ed.info().ghostValid, true);
  assert.ok(H.batchOf(lantern.uid).hidden.has(lantern.uid), 'the real copy hides behind its ghost');
  H.stage.sync(viewOf(w, { mode: 'place', placing: { id: 'lantern', uid: lantern.uid, x: lantern.x, y: lantern.y, ok: false, st: styleOf(w) } }));
  assert.equal(ed.info().ghostValid, false);
  H.stage.sync(viewOf(w, { mode: 'edit' }));
  assert.equal(ed.info().ghost, null);
  assert.ok(!H.batchOf(lantern.uid).hidden.has(lantern.uid), 'shown again when placement ends');
  H.stage.sync(viewOf(w, { mode: 'play' }));
  assert.equal(ed.info().cells, 0, 'no grid in play mode');
});

test('mount: an edit sibling that cannot show a ghost never makes the moved item vanish', (t) => {
  const { w, lantern } = makeWorld({ lantern: true });
  const states = [];
  const H = harness(t, { edit: () => ({ setState(s) { states.push(s); }, ghostShown: () => false, update: () => false, setReduced() {}, dispose() {} }) });
  const free = C.findSpot(w, 'lantern');
  H.stage.sync(viewOf(w, { mode: 'place', placing: { id: 'lantern', uid: lantern.uid, x: free.x, y: free.y, ok: true } }));
  assert.ok(!H.batchOf(lantern.uid).hidden.has(lantern.uid));
  const last = states[states.length - 1];
  assert.equal(last.mode, 'place'); assert.equal(last.placing.id, 'lantern');
  assert.equal(last.ghost.id, 'lantern'); assert.ok(last.land && typeof last.land === 'object');
});

/* ================================================================
   6. mount(): drags — a cancel is never a release
   ================================================================ */
function dragHarness(t, extraOn) {
  const { w, lantern } = makeWorld({ lantern: true });
  let H = null, placing = null;
  const view = () => viewOf(w, placing ? { mode: 'place', placing: Object.assign({ ok: C.canPlace(w, 'lantern', placing.x, placing.y, lantern.uid).ok }, placing) } : { mode: 'edit' });
  H = harness(t, { on: Object.assign({
    /* what rewards-world does: startPlacement → a full draw() that rebuilds the page around the stage */
    dragStart: (uid) => {
      placing = { id: 'lantern', uid, x: lantern.x, y: lantern.y };
      H.stage.sync(view());
      const page = new FakeEl('div'); page._root = true;
      H.stage.attach(page);
      H.canvas._cap = null;                    /* the browser dropped the capture with the old DOM */
    },
    dragCell: (x, y) => { if (placing) { placing.x = x; placing.y = y; H.stage.sync(view()); } }
  }, extraOn || {}) });
  H.stage.sync(view());
  H.step(60);                                  /* the edit tilt settles */
  const p = H.screen(boxCentre('lantern', lantern.x, lantern.y));
  return { H, w, lantern, p, getPlacing: () => placing };
}

test('mount: an edit-mode drag survives the page rebuild (capture re-taken) and confirms only on release', (t) => {
  const { H, lantern, p } = dragHarness(t);
  H.ptr('pointerdown', p.x, p.y);
  H.ptr('pointermove', p.x, p.y - 30);
  assert.deepEqual(H.called('dragStart'), [['dragStart', lantern.uid]], 'the press claimed the lantern');
  H.canvas.dispatch('lostpointercapture', { pointerId: 1 });
  assert.equal(H.canvas._cap, 1, 'capture taken back');
  assert.equal(H.called('dragEnd').length, 0, 'not a release');
  H.ptr('pointermove', p.x, p.y - 80);
  H.ptr('pointerup', p.x, p.y - 80);
  assert.equal(H.called('dragEnd').length, 1, 'the release confirms');
  assert.ok(H.called('dragCell').length >= 1, 'the ghost followed the finger');
});

test('mount: a cancelled drag never confirms — the ghost goes back to its start cell', (t) => {
  const { H, lantern, p } = dragHarness(t);
  H.ptr('pointerdown', p.x, p.y);
  H.ptr('pointermove', p.x, p.y - 30);
  H.ptr('pointermove', p.x, p.y - 90);
  const moved = H.called('dragCell');
  assert.ok(moved.length >= 1 && (moved[moved.length - 1][1] !== lantern.x || moved[moved.length - 1][2] !== lantern.y), 'dragged off its cell');
  H.ptr('pointercancel', p.x, p.y - 90);           /* an iPad edge swipe / palm */
  assert.equal(H.called('dragEnd').length, 0, 'no confirm');
  const last = H.called('dragCell').pop();
  assert.deepEqual(last.slice(1), [lantern.x, lantern.y], 'back where it started');
});

test('mount: the optional on.dragCancel hook gets a cancelled drag (and a sheet covering the island cancels)', (t) => {
  const cancels = [];
  const { H, p } = dragHarness(t, { dragCancel: () => cancels.push(1) });
  H.ptr('pointerdown', p.x, p.y);
  H.ptr('pointermove', p.x, p.y - 30);
  H.ptr('pointermove', p.x, p.y - 90);
  const before = H.called('dragCell').length;
  H.stage.setCovered(true);                          /* a sheet opens mid-drag */
  assert.equal(cancels.length, 1);
  assert.equal(H.called('dragEnd').length, 0);
  assert.equal(H.called('dragCell').length, before, 'the host decides what a cancel does');
  H.ptr('pointerup', p.x, p.y - 90);
  assert.equal(H.called('dragEnd').length, 0, 'the late release is ignored');
});

test('mount: a capture lost for good (the canvas left the page) cancels instead of confirming', (t) => {
  const { H, p } = dragHarness(t);
  H.ptr('pointerdown', p.x, p.y);
  H.ptr('pointermove', p.x, p.y - 30);
  H.stage.element.parentNode.removeChild(H.stage.element);
  H.canvas.dispatch('lostpointercapture', { pointerId: 1 });
  assert.equal(H.called('dragEnd').length, 0);
});

/* ================================================================
   7. mount(): encore timers and the island music (suspend / cover / dispose)
   ================================================================ */
function readyHarness(t, cfg) {
  const { w, lantern } = makeWorld({ lantern: true });
  const H = harness(t, cfg);
  H.stage.sync(viewOf(w));
  H.step(5);
  assert.equal(H.called('ready').length, 1);
  return { H, w, lantern };
}

test('mount: an encore cut short by a game / leaving the island never plays music or the chip afterwards', (t) => {
  const { H } = readyHarness(t);
  assert.deepEqual(H.music, ['island_day'], 'the day loop on ready');
  H.stage.showtime(true, { encoreMs: 8000 });
  assert.deepEqual(H.music, ['island_day', 'island_showtime']);
  assert.equal(H.stage.info().encore, true);
  H.stage.suspend();                                 /* '▶ Play now' / '📚 Back to learning' */
  assert.equal(H.stage.info().encore, false, 'the encore ends with the island');
  assert.deepEqual(H.envCalls.filter((c) => c[0] === 'showtime').pop(), ['showtime', false, true], 'back to day at once, quietly');
  const sounds = H.sounds.length;
  H.advance(12000);
  assert.deepEqual(H.music, ['island_day', 'island_showtime'], 'no island music while the island is off screen');
  assert.equal(H.sounds.length, sounds, "no stray 'chip'");
  assert.equal(H.stage.info().dancing, false, 'no dance break on a hidden island');
  H.stage.showtime(true);                            /* even a direct call while hidden stays silent */
  assert.equal(H.music.length, 2);
  H.stage.resume();
  assert.equal(H.music.length, 2, 'rewards-world sets the context again when the island is back');
});

test('mount: the encore still runs on screen; under a sheet its music waits for the sheet to close', (t) => {
  const { H } = readyHarness(t);
  H.stage.setCovered(true);
  H.stage.showtime(true, { encoreMs: 8000 });
  assert.deepEqual(H.music, ['island_day'], 'nothing switches under the sheet');
  H.stage.setCovered(false);
  assert.deepEqual(H.music, ['island_day', 'island_showtime'], 'applied when the sheet closes');
  H.step(10);
  H.advance(2000);
  H.step(5);
  assert.equal(H.stage.info().dancing, true, 'the encore dance break');
  H.advance(6500);
  assert.equal(H.music[H.music.length - 1], 'island_day', 'back to day after the encore');
  assert.ok(H.sounds.includes('chip'));
  assert.equal(H.stage.info().encore, false);
});

test('mount: dispose stops every encore timer', (t) => {
  const { H } = readyHarness(t);
  H.stage.showtime(true, { encoreMs: 8000 });
  H.stage.dispose();
  const n = H.music.length;
  H.advance(20000);
  assert.equal(H.music.length, n);
});

/* ================================================================
   8. mount(): lamps keep their lit state across a rebuild and a remount
   ================================================================ */
test('mount: a lit lamp is lit again after a context-restore rebuild and after a remount', (t) => {
  const models = GARDEN.factory({});                 /* once per page, as in the browser */
  const { w, lantern } = makeWorld({ lantern: true });
  const H = harness(t, { models });
  const view = viewOf(w, { lit: { [lantern.uid]: true } });
  H.stage.sync(view);
  H.step(3);
  const b1 = H.batchOf(lantern.uid);
  assert.equal(b1.stateOf(lantern.uid, 'lit'), 1, 'lit on the first mount');
  const fx1 = H.made.fx[H.made.fx.length - 1];
  assert.deepEqual(fx1.halos.filter((h) => h[0] === lantern.uid + ':glow').pop(), [lantern.uid + ':glow', true]);
  /* the WebGL context is lost and restored: everything is rebuilt from the view */
  H.lease.h.onLost();
  H.lease.h.onRestored();
  H.step(3);
  const b2 = H.batchOf(lantern.uid), fx2 = H.made.fx[H.made.fx.length - 1];
  assert.notEqual(b2, b1, 'a new batch'); assert.notEqual(fx2, fx1, 'a new fx');
  assert.equal(b2.stateOf(lantern.uid, 'lit'), 1, 'still lit after the rebuild');
  assert.deepEqual(fx2.halos.filter((h) => h[0] === lantern.uid + ':glow').pop(), [lantern.uid + ':glow', true], 'with its halo');
  /* the island is left for > 30 s (disposed) and opened again */
  H.stage.dispose();
  const stage2 = S.mount({ reduced: false, user: { name: 'Kid', color: '#4FC3F7' }, on: {} });
  t.after(() => stage2.dispose());
  stage2.sync(view);
  const b3 = H.K.batches.filter((b) => !b.disposed && b.has(lantern.uid)).pop();
  assert.equal(b3.stateOf(lantern.uid, 'lit'), 1, 'lit after a remount');
});

test('models-garden: per-copy lamp memory follows the copy (a new batch or forget(uid) starts over)', () => {
  const models = GARDEN.factory({});
  const lamp = models.lantern;
  assert.equal(typeof lamp.forget, 'function');
  const log = [];
  const handle = (batch, lit) => ({ uid: 'p14', id: 'lantern', t: 0, dt: 0, reduced: false, show: 0, lit, music: false, beat: 0, batch,
    pivot: () => ({ set() {} }), state: (k, v) => log.push(['state', k, v]), halo: (n, on) => log.push(['halo', on]), decal: (on) => log.push(['decal', on]) });
  const b1 = {}, a1 = handle(b1, 0);
  lamp.show(a1); a1.lit = 1; lamp.lit(a1, true); lamp.idle(a1);
  assert.deepEqual(log.filter((x) => x[0] === 'state').pop(), ['state', 'lit', 1]);
  /* a rebuild: the same uid on a NEW batch, the lit memory already says on */
  log.length = 0;
  const a2 = handle({}, 1);
  lamp.show(a2); lamp.lit(a2, true); lamp.idle(a2);
  assert.deepEqual(log.filter((x) => x[0] === 'state'), [['state', 'lit', 1]], 'the new copy is told it is lit');
  assert.deepEqual(log.filter((x) => x[0] === 'halo'), [['halo', true]], 'and gets its halo');
  /* the same copy again: nothing new to send */
  log.length = 0;
  lamp.idle(a2); lamp.show(a2);
  assert.equal(log.length, 0, 'idles only send changes');
  /* the controller removed the copy (forget) and the uid comes back on the same batch */
  lamp.forget('p14');
  lamp.show(a2);
  assert.deepEqual(log.filter((x) => x[0] === 'state'), [['state', 'lit', 1]]);
  /* handles without a batch / object (photocards, tests) keep plain per-uid memory */
  log.length = 0;
  const bare = Object.assign(handle(undefined, 1), { uid: 'pc:bare' });
  lamp.show(bare); lamp.show(Object.assign({}, bare));
  assert.equal(log.filter((x) => x[0] === 'state').length, 1);
});

/* ================================================================
   9. mount(): the fx seams — member colour, the flight to the tray, the drop ring
   ================================================================ */
test('mount: fx gets the member colour as #hex (and the next one on setUser) and a real flight to the tray', (t) => {
  const { H, lantern } = readyHarness(t);
  const fx = H.made.fx[H.made.fx.length - 1];
  assert.equal(fx.host.member, '#4FC3F7', 'fx3d / env read a #hex string');
  H.stage.setUser({ name: 'Sis', color: '#FF7043', avatar: '🐼' });
  assert.deepEqual(fx.members, ['#FF7043']);
  assert.ok(H.envCalls.some((c) => c[0] === 'member' && c[1] === '#FF7043'));
  /* put away: a sparkle flies to the tray */
  const tray = new FakeEl('div'); tray.rect = { left: 380, top: 430, width: 40, height: 40 };
  H.stage.storeFx(lantern.uid, tray);
  const fl = fx.emits.find((e) => e.kind === 'flight');
  assert.ok(fl, "storeFx emits 'flight'");
  assert.ok(fl.o && fl.o.to && Number.isFinite(fl.o.to.x) && fl.o.dur > 0);
});

test('mount: a confirmed placement drops in with a dust ring sized by its footprint', (t) => {
  const { H, w, lantern } = readyHarness(t);
  const fx = H.made.fx[H.made.fx.length - 1];
  H.stage.sync(viewOf(w, { anim: { dropUid: lantern.uid } }));
  H.step(40);
  const dust = fx.emits.find((e) => e.kind === 'dust');
  assert.ok(dust && dust.o.radius > 0 && dust.o.r === undefined, "the ring size travels as 'radius'");
});

test('fx3d: a flight sparkle waits, then flies along an arc to its target; member colours come from a #hex', () => {
  const from = [0, 1, 0], to = [3, 2, -4], o = {};
  F.flightAt(0.1, 0.25, 0.75, from, 0, to, 0, o);
  assert.deepEqual([o.x, o.y, o.z, o.f], [0, 1, 0, 0], 'still during its delay');
  F.flightAt(0.75, 0.25, 0.75, from, 0, to, 0, o);
  assert.ok(near(o.x, 3) && near(o.y, 2) && near(o.z, -4) && o.f === 1, 'arrives at the end of its life');
  F.flightAt(0.5, 0.25, 0.75, from, 0, to, 0, o);
  assert.ok(o.y > 1 + (2 - 1) * 0.75, 'raised above the straight line mid-flight');
  assert.equal(F.kindOf('flight'), 'flight', 'no longer an anonymous sparkle');
  /* the real fx3d: one particle that travels */
  const K = fakeKit(), fx = F.create(K, { quality: { particleScale: 1 } }, { seed: 7, member: '#4FC3F7', tier: 'MID' });
  assert.equal(fx.emit('flight', { x: 0, y: 1, z: 0 }, 1, { to: { x: 3, y: 2, z: -4 }, dur: 0.5, delay: 0.25 }), 1);
  const mesh = fx.group.children.find((m) => m.name === 'fx3d:particles'), pos = mesh.geometry.attributes.iPos.array;
  const col = mesh.geometry.attributes.iCol.array;
  assert.equal(col[3], 0, 'hidden while it waits');
  let landed = false;
  for (let i = 0; i < 50; i++) {
    fx.update(1 / 60);
    if (near(pos[0], 3, 0.05) && near(pos[2], -4, 0.05)) landed = true;
  }
  assert.ok(landed || fx.info().alive === 0, 'it reaches the tray point');
  assert.ok(pos[0] > 1, 'it moved toward the target (' + pos[0] + ')');
  /* reduced motion: a still sparkle at the item */
  const red = F.create(fakeKit(), {}, { seed: 1, reduced: true });
  assert.equal(red.emit('flight', [0, 1, 0], 1, { to: [3, 2, -4] }), 1);
  /* confetti takes the member colour from the #hex string the island host now passes */
  const fc = F.create(fakeKit(), {}, { seed: 3, member: '#4FC3F7' });
  fc.emit('confetti', [0, 0, 0], 40);
  const cm = fc.group.children.find((m) => m.name === 'fx3d:particles').geometry.attributes.iCol.array;
  const want = fromHex('#4FC3F7');
  let members = 0;
  for (let i = 0; i < 40; i++) if (near(cm[i * 4], want[0]) && near(cm[i * 4 + 1], want[1]) && near(cm[i * 4 + 2], want[2])) members++;
  assert.ok(members >= 10, members + ' of 40 in the member colour');
});

/* ================================================================
   10. Slow taps (camera.js gesture + the controller's long-press / hold)
   ================================================================ */
function settle(H) {
  /* let the reveal / any camera move finish */
  for (let i = 0; i < 600; i++) { const at = H.cam.position.clone(); H.step(1); if (H.cam.position.equals(at)) return; }
  assert.fail('the camera never settled');
}

test('mount: a slow press on an item shows its name without moving the camera and still acts on release', (t) => {
  const { H, lantern } = readyHarness(t);
  settle(H);
  const p = H.screen(boxCentre('lantern', lantern.x, lantern.y));
  const camAt = H.cam.position.clone();
  H.ptr('pointerdown', p.x, p.y);
  H.advance(470);                                    /* the 450 ms long-press */
  assert.ok(H.stage.element.querySelector('.slw-bubble3d'), 'the name bubble');
  H.advance(130);
  H.ptr('pointerup', p.x, p.y);                      /* released at 600 ms */
  assert.deepEqual(H.called('tapItem'), [['tapItem', lantern.uid]], 'a slow tap is still a tap');
  H.step(30);
  assert.ok(H.cam.position.equals(camAt), 'the camera did not move under the finger');
  /* held still for a full second: the camera frames it and the release is no tap */
  H.ptr('pointerdown', p.x, p.y);
  H.advance(470); H.advance(570);
  H.step(40);
  assert.ok(!H.cam.position.equals(camAt), 'a deliberate hold frames the item');
  H.ptr('pointerup', p.x, p.y);
  assert.equal(H.called('tapItem').length, 1, 'no tap after a hold');
});

test('mount: in place mode a slow press on a square still moves the ghost there', (t) => {
  const { H, w } = readyHarness(t);
  const spot = C.findSpot(w, 'lantern');
  H.stage.sync(viewOf(w, { mode: 'place', placing: { id: 'lantern', uid: null, x: spot.x, y: spot.y, ok: true } }));
  H.step(60);
  /* a free land square away from the ghost */
  const land = C.landSet(w), occ = C.occupancy(w).occ;
  const cell = Object.keys(land).map((k) => k.split(',').map(Number))
    .filter(([c, r]) => !occ[c + ',' + r] && Math.abs(c - spot.x) + Math.abs(r - spot.y) >= 3)
    .sort((a, b) => b[1] - a[1])[0];
  assert.ok(cell, 'a free square');
  const ctr = G.cellCenter(cell[0], cell[1]);
  const p = H.screen({ x: ctr.x, y: G.surfaceY(cell[0], cell[1]), z: ctr.z });
  H.ptr('pointerdown', p.x, p.y);
  H.advance(650);
  H.ptr('pointerup', p.x, p.y);
  assert.deepEqual(H.called('tapCell'), [['tapCell', cell[0], cell[1]]]);
});

test('camera Controls: a lost capture with the finger down is re-taken; only an impossible one cancels', (t) => {
  const clock = { now: 0 };
  Object.defineProperty(globalThis, 'performance', { value: { now: () => clock.now }, configurable: true, writable: true });
  t.after(() => { if (PERF) Object.defineProperty(globalThis, 'performance', PERF); });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const root = new FakeEl('div'); root._root = true;
  const el = root.appendChild(new FakeEl('canvas'));
  el.rect = { left: 0, top: 0, width: 800, height: 450 };
  const log = [];
  const rig = { canOrbit: () => true, zoomedIn: () => false, orbitBy() {}, panBy() {}, zoomBy() { return false; }, groundAt: () => ({}), fling() {} };
  const ctl = Cam.Controls(el, rig, {
    press: () => 'item', tap: (...a) => log.push(['tap', ...a]), longPress: () => log.push(['long']), hold: () => log.push(['hold']),
    dragStart: () => log.push(['start']), drag: () => {}, dragEnd: (x, y, c) => log.push(['end', c])
  });
  const fire = (type, x, y) => el.dispatch(type, { pointerId: 1, pointerType: 'touch', button: 0, clientX: x, clientY: y });
  fire('pointerdown', 100, 100); fire('pointermove', 130, 100);
  el._cap = null; el.dispatch('lostpointercapture', { pointerId: 1 });
  assert.equal(el._cap, 1);
  fire('pointermove', 160, 100); fire('pointerup', 160, 100);
  el.dispatch('lostpointercapture', { pointerId: 1 });        /* the one after pointerup: ignored */
  assert.deepEqual(log, [['start'], ['end', false]]);
  log.length = 0;
  fire('pointerdown', 100, 100); fire('pointermove', 130, 100);
  root.removeChild(el); el.dispatch('lostpointercapture', { pointerId: 1 });
  assert.deepEqual(log, [['start'], ['end', true]], 'off the page: cancelled');
  root.appendChild(el);
  log.length = 0;
  fire('pointerdown', 100, 100); fire('pointermove', 130, 100); fire('pointercancel', 130, 100);
  assert.deepEqual(log, [['start'], ['end', true]]);
  /* the long-press then the hold, from Controls' own timer */
  log.length = 0;
  fire('pointerdown', 100, 100);
  clock.now += 470; t.mock.timers.tick(470);
  assert.deepEqual(log, [['long']]);
  clock.now += 150; fire('pointerup', 100, 100);
  assert.deepEqual(log[1].slice(0, 5), ['tap', 100, 100, 1, true], 'a slow tap, flagged long');
  log.length = 0;
  fire('pointerdown', 100, 100);
  clock.now += 470; t.mock.timers.tick(470);
  clock.now += 560; t.mock.timers.tick(560);
  assert.deepEqual(log, [['long'], ['hold']]);
  clock.now += 100; fire('pointerup', 100, 100);
  assert.deepEqual(log, [['long'], ['hold']], 'no tap after a hold');
  ctl.dispose();
});
