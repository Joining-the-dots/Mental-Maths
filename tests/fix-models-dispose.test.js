/* node --test tests/   (Node 22+)
   Regression tests for the model fixes (branch fix2/models), runtime-1:
   SLIsland3D.dispose({keepKit: false}) (30 s after leaving the island) runs the kit's dispose:
   every kit material and both atlases go, and the next mount draws new atlases for the child
   then playing. The model factories never run again (stage.js runs each one once), so any
   material, atlas view or texture a model kept in its closure from the old kit would show the
   previous child's name / initial on the next child's island and sit outside the kit's
   dispose list. This mounts child Ava, disposes, mounts child Ben and checks every
   atlas-derived (and kit-derived) material the models hand the new mount.
   It runs the REAL kit.js (so its dispose semantics are the real ones) over a small THREE
   stand-in, with a canvas whose 2D context records the text drawn into it. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../world/world-look.js');
const KIT = require('../world/island3d/kit.js');
const CITY = require('../world/island3d/models-city.js');
const HOME = require('../world/island3d/models-home.js');
const STAGE = require('../world/island3d/models-stage.js');
const ATT = require('../world/island3d/models-attractions.js');

/* ---------------- a small THREE stand-in (only what the kit and these models touch) ---------------- */
class Dispatcher {
  addEventListener(type, fn) { (this._ls || (this._ls = {}))[type] = (this._ls[type] || []).concat(fn); }
  removeEventListener(type, fn) { if (this._ls && this._ls[type]) this._ls[type] = this._ls[type].filter((f) => f !== fn); }
  dispatchEvent(e) { ((this._ls && this._ls[e.type]) || []).slice().forEach((f) => f.call(this, Object.assign({ target: this }, e))); }
}
class Color {
  constructor(r, g, b) { this.isColor = true; this.r = 1; this.g = 1; this.b = 1; if (r !== undefined) this.set(r, g, b); }
  set(r, g, b) {
    if (r && r.isColor) return this.copy(r);
    if (typeof r === 'string') { const n = parseInt(r.replace('#', '').slice(0, 6), 16) || 0; return this.setHex(n); }
    if (typeof r === 'number' && g === undefined) return this.setHex(r);
    if (typeof r === 'number') { this.r = r; this.g = g; this.b = b; }
    return this;
  }
  setHex(n) { this.r = ((n >> 16) & 255) / 255; this.g = ((n >> 8) & 255) / 255; this.b = (n & 255) / 255; return this; }
  setRGB(r, g, b) { this.r = r; this.g = g; this.b = b; return this; }
  setScalar(s) { this.r = this.g = this.b = s; return this; }
  copy(c) { this.r = c.r; this.g = c.g; this.b = c.b; return this; }
  clone() { return new Color(this.r, this.g, this.b); }
  multiplyScalar(s) { this.r *= s; this.g *= s; this.b *= s; return this; }
  lerp(c, k) { this.r += (c.r - this.r) * k; this.g += (c.g - this.g) * k; this.b += (c.b - this.b) * k; return this; }
  getHex() { return (Math.round(this.r * 255) << 16) | (Math.round(this.g * 255) << 8) | Math.round(this.b * 255); }
  getHexString() { return this.getHex().toString(16).padStart(6, '0'); }
  getHSL(o) { o.h = 0; o.s = 0; o.l = (this.r + this.g + this.b) / 3; return o; }
  setHSL(h, s, l) { return this.setScalar(l); }
  toArray(a, o) { a[o || 0] = this.r; a[(o || 0) + 1] = this.g; a[(o || 0) + 2] = this.b; return a; }
}
class Vec { constructor(x, y, z, w) { this.x = x || 0; this.y = y || 0; this.z = z || 0; this.w = w || 0; } set(x, y, z, w) { this.x = x; this.y = y; this.z = z; this.w = w; return this; } copy(v) { return this.set(v.x, v.y, v.z, v.w); } clone() { return new this.constructor(this.x, this.y, this.z, this.w); } }
class Matrix4 { set() { return this; } identity() { return this; } compose() { return this; } copy() { return this; } }
class Texture extends Dispatcher {
  constructor(image) { super(); this.isTexture = true; this.source = { data: image || null }; this.repeat = new Vec(1, 1); this.offset = new Vec(0, 0); this.needsUpdate = false; }
  clone() {
    const t = new this.constructor();
    for (const k of Object.keys(this)) if (k !== '_ls' && k !== 'repeat' && k !== 'offset') t[k] = this[k];
    t.repeat = this.repeat.clone(); t.offset = this.offset.clone();
    return t;
  }
  dispose() { this.disposed = true; this.dispatchEvent({ type: 'dispose' }); }
}
class Material extends Dispatcher {
  constructor(p) { super(); this.isMaterial = true; this.color = new Color(1, 1, 1); this.map = null; this.userData = {}; this.opacity = 1; if (p) this.setValues(p); }
  setValues(p) { for (const k of Object.keys(p)) { if (k === 'color') this.color.set(p.color); else this[k] = p[k]; } }
  clone() {
    const m = new this.constructor();
    for (const k of Object.keys(this)) if (k !== '_ls' && k !== 'disposed') m[k] = this[k] && this[k].isColor ? this[k].clone() : k === 'userData' ? Object.assign({}, this[k]) : this[k];
    return m;
  }
  dispose() { this.disposed = true; this.dispatchEvent({ type: 'dispose' }); }
}
const BASE = {
  BufferGeometry: class {}, Matrix4, Quaternion: Vec, Euler: Vec, Vector2: Vec, Vector3: Vec, Vector4: Vec, Color,
  Texture, CanvasTexture: class extends Texture {}, DataTexture: class extends Texture { constructor(d, w, h) { super({ data: d, width: w, height: h }); } },
  MeshBasicMaterial: class extends Material {}, MeshToonMaterial: class extends Material {}, MeshMatcapMaterial: class extends Material {}, LineBasicMaterial: class extends Material {},
  SRGBColorSpace: 'srgb', LinearFilter: 1006, NearestFilter: 1003, RGBAFormat: 1023, RedFormat: 1028, BackSide: 1, AdditiveBlending: 2
};
/* anything else the kit may come to read answers with an inert stand-in, so this harness only
   breaks when the dispose contract does */
const INERT = new Proxy(function () {}, {
  get: (t, k) => (k === Symbol.toPrimitive ? () => 0 : k === 'prototype' ? t.prototype : INERT),
  apply: () => INERT, construct: () => INERT
});
const THREE = new Proxy(BASE, { get: (t, k) => (k in t ? t[k] : INERT) });

/* a canvas whose 2D context records every text drawn into it */
function canvas() {
  const c = { width: 300, height: 150, texts: [] };
  const ctx = new Proxy({ canvas: c }, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'measureText') return (s) => ({ width: String(s).length * 10 });
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (k === 'getImageData' || k === 'createImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray((w || 1) * (h || 1) * 4).fill(255) });
      if (k === 'fillText' || k === 'strokeText') return (s) => { c.texts.push(String(s)); };
      return () => {};
    },
    set(t, k, v) { t[k] = v; return true; }
  });
  c.getContext = () => ctx;
  return c;
}
/* the last name ('AVA' / 'BEN') and the last initial ('A' / 'B') drawn on a texture's canvas */
const NAMES = new Set(['AVA', 'BEN']), INITIALS = new Set(['A', 'B']);
function lastDrawn(tex, set) { const c = tex && tex.source && tex.source.data; return c && c.texts ? c.texts.filter((s) => set.has(s)).pop() : undefined; }

function setup() {
  const prevDoc = globalThis.document;
  globalThis.document = { createElement: () => canvas() };
  const models = {};
  const hub = KIT.create(THREE, { look: () => L, models, qa: false });
  const K = hub.kit('MID');
  const S = { ready: true, tier: 'MID', kit: () => K, models };
  Object.assign(models, CITY.factory(K), HOME.factory(K, S), STAGE.factory(K), ATT.models(K, S));
  /* watch every material the models hand out: did the kit (or a model) dispose it? */
  const gone = new Set();
  const watch = (m) => { if (m && m.addEventListener && !m.__watched) { m.__watched = true; m.addEventListener('dispose', () => gone.add(m)); } return m; };
  return { K, hub, models, gone, watch, restore() { if (prevDoc === undefined) delete globalThis.document; else globalThis.document = prevDoc; } };
}
const part = (name, mat) => ({ name, mat });
const TOWER_HOME = L.resolveStyle('house_cottage', { shape: 'shape_tower' });
/* the tower home's perCopy 'sign' geometry as the batch hands it (userData from the template) */
function signGeo() {
  const pos = { array: new Float32Array(18), needsUpdate: false };
  return { userData: { slHome: { sign: { x0: -0.2, x1: 0.2, y0: 1.6, y1: 1.9, z: 0.6 } } }, getAttribute: (n) => (n === 'position' ? pos : null) };
}
function handle(uid, id, user, o = {}) {
  const geos = o.geos || {};
  return {
    uid, id, t: o.t || 1, dt: 1 / 60, phase: 0.2, reduced: false, show: 1, beat: 0.3, bar: 2, bpm: 100,
    stateKey: o.stateKey, template: null, batch: { id: 'batch' }, member: user.color, user: { name: user.name, color: user.color, avatar: '🦊' },
    copyGeometry: (p) => geos[p] || null, pivot: () => ({ set() {} }), state() {}, halo() {}, decal() {}, emit() {}, sfx() {}
  };
}
/* what island3d does on mount: the child into both atlases and the stage buildings, then a batch per
   building (the material hook per part), then show / idle on each copy */
function mount(E, user) {
  const { K, models, watch } = E;
  K.ledAtlas().setUser({ name: user.name, color: user.color });
  K.signAtlas().setUser({ name: user.name, color: user.color });
  models.bld_stage.setUser({ name: user.name, color: user.color });
  const m = {
    screen: models.bld_ledtower.material('led', part('screen', 'led')),
    screen2: models.bld_ledtower.material('led', part('screen2', 'led')),
    photo: models.bld_photobooth.material('sign', part('sign', 'sign')),
    strip: models.bld_photobooth.material('sign', part('strip', 'sign')),
    onair: models.bld_recording.material('sign', part('sign', 'sign')),
    initial: models.house_cottage.material('sign', part('sign', 'sign')),
    beams: models.bld_stage.material('state', part('beams', 'state')),
    course: models.att_course.material('toon', part('text', 'toon'))
  };
  Object.values(m).forEach(watch);
  /* per frame: the tower scrolls its tiles (re-pointing their maps), the studio dims ON AIR, the
     tower home tints its initial */
  const tower = handle('tower#1', 'bld_ledtower', user), studio = handle('studio#1', 'bld_recording', user);
  const home = handle('home#1', 'house_cottage', user, { stateKey: K.stateKey('house_cottage', TOWER_HOME), geos: { sign: signGeo() } });
  for (const t of [1, 1.5]) {
    tower.t = studio.t = home.t = t;
    models.bld_ledtower.show(tower, 1); models.bld_ledtower.idle(tower);
    models.bld_recording.idle(studio);
    models.house_cottage.show(home, 1); models.house_cottage.idle(home);
  }
  return m;
}

test('runtime-1: after a kit dispose every atlas material on the next mount samples the live atlas, drawn for the next child', () => {
  const E = setup();
  try {
    const { K, hub, models, gone } = E;
    const m1 = mount(E, { name: 'Ava', color: '#FF5AA5' });
    const led1 = K.ledAtlas().texture, sign1 = K.signAtlas().texture;
    assert.equal(m1.screen.map.source, led1.source, 'mount 1: the tower screen is on the LED atlas');
    assert.equal(lastDrawn(m1.screen.map, NAMES), 'AVA');
    assert.equal(lastDrawn(m1.initial.map, INITIALS), 'A');
    /* a tap on the booth draws the strip for this child */
    models.bld_photobooth.act(handle('booth#1', 'bld_photobooth', { name: 'Ava', color: '#FF5AA5' }), 'snap');
    assert.notEqual(models.bld_photobooth._strip.key, '', 'the strip holds the first child\'s pet and emoji');

    /* SLIsland3D.dispose({keepKit: false}): island3d forgets its copies, then the kit goes */
    for (const id of ['bld_ledtower', 'bld_photobooth', 'bld_recording', 'bld_stage', 'house_cottage']) {
      for (const uid of ['tower#1', 'booth#1', 'home#1']) if (models[id].forget) models[id].forget(uid);
    }
    hub.dispose();
    for (const k of ['screen', 'screen2', 'photo', 'onair', 'initial', 'beams']) assert.ok(gone.has(m1[k]), 'the kit disposed mount 1\'s ' + k);

    const m2 = mount(E, { name: 'Ben', color: '#2EC4B6' });
    const led2 = K.ledAtlas().texture, sign2 = K.signAtlas().texture;
    assert.notEqual(led2.source, led1.source, 'the kit drew a new LED atlas');
    assert.notEqual(sign2.source, sign1.source, 'the kit drew a new sign atlas');
    /* every atlas face of the new mount samples the live atlas, and that canvas shows Ben */
    for (const [k, live, set, want] of [
      ['screen', led2, NAMES, 'BEN'], ['screen2', led2, NAMES, 'BEN'], ['photo', sign2, INITIALS, 'B'],
      ['onair', sign2, INITIALS, 'B'], ['initial', sign2, INITIALS, 'B']
    ]) {
      const mt = m2[k];
      assert.ok(mt && mt.map, k + ' has a map');
      assert.equal(mt.map.source, live.source, k + ' samples the live atlas (not the one drawn for the previous child)');
      assert.equal(lastDrawn(mt.map, set), want, k + ' shows the new child');
      assert.ok(!gone.has(mt), k + ' is not a disposed material');
    }
    assert.equal(lastDrawn(m2.screen.map, NAMES), 'BEN', 'the LED tower name marquee shows Ben');
    /* the PET COURSE sign (fix3): a sibling of the kit's sign material over the attractions file's own
       small canvas (no name on it) — a new canvas for the new kit, live, and the previous one freed */
    assert.ok(m2.course && m2.course.map && m2.course.map !== m1.course.map, 'course: a new sign texture for the new kit');
    assert.ok(m1.course.map.disposed, 'the previous child\'s sign texture is freed');
    assert.ok(!m2.course.map.disposed && !gone.has(m2.course), 'course is live');
    assert.ok(m2.course.map.source.data.texts.includes('PET COURSE'), 'course draws PET COURSE');
    assert.ok(!m2.course.map.source.data.texts.some((s) => NAMES.has(s) || INITIALS.has(s)), 'and no name');
    for (const k of ['strip', 'beams']) { assert.ok(m2[k], k); assert.ok(!gone.has(m2[k]), k + ' is a live material'); assert.notEqual(m2[k], m1[k], k + ' rebuilt on the new kit'); }
    assert.equal(models.bld_photobooth._strip.key, '', 'the strip is blank again (no previous child\'s pet or emoji)');
    /* the per-frame paths drive the materials the new batches hold */
    assert.ok(Math.abs(m2.onair.color.r - 0.42) < 1e-6, 'the rebuilt ON AIR sibling is dimmed (off)');
    assert.ok(m2.initial.color.r !== 1 || m2.initial.color.g !== 1 || m2.initial.color.b !== 1, 'the live initial carries the member tint');
    assert.equal(models.bld_ledtower.material('led', part('screen', 'led')), m2.screen, 'cached again while the kit lives');

    /* every kit-derived material of mount 2 is on the live kit's dispose list (a second dispose frees it) */
    hub.dispose();
    for (const k of ['screen', 'screen2', 'photo', 'onair', 'initial', 'beams', 'strip']) assert.ok(gone.has(m2[k]), 'the next kit dispose frees mount 2\'s ' + k);
    /* the PET COURSE sign: the kit frees its sign sibling, the attractions file its own canvas texture */
    const m3 = mount(E, { name: 'Ava', color: '#FF5AA5' });
    assert.ok(gone.has(m2.course) && !gone.has(m3.course), 'the old course sign material is freed, the new one is live');
    assert.ok(m2.course.map.disposed && !m3.course.map.disposed, 'the old course sign texture is freed, the new one is live');
  } finally { E.restore(); }
});

test('runtime-1: a copy whose per-uid state outlives the kit still dims the rebuilt ON AIR sibling', () => {
  const E = setup();
  try {
    const { hub, models } = E;
    const ben = { name: 'Ben', color: '#2EC4B6' };
    mount(E, ben);
    hub.dispose();                                    /* no forget: the studio's per-uid state survives */
    const on = models.bld_recording.material('sign', part('sign', 'sign'));
    assert.equal(on.color.r, 1, 'a fresh sibling starts at full');
    models.bld_recording.idle(handle('studio#1', 'bld_recording', ben, { t: 2 }));
    assert.ok(Math.abs(on.color.r - 0.42) < 1e-6, 'and is dimmed on the next frame (got ' + on.color.r + ')');
  } finally { E.restore(); }
});
