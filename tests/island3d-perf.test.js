/* ================================================================
   Encore City v2 perf fixes (branch fix2/perf): draw calls and shader programs.
   A small but faithful THREE stand-in (real matrix / quaternion maths, three's draw rules)
   lets the kit's ItemBatch + merged layer, the blob / face / Spark Stick programs and the
   city's LOW fallback run in Node:
     perf-2 / perf-4  the merged layer: one draw call per material group however many copies
                      and path pieces; it renders exactly what the batches would (positions,
                      colours, normals — a squash included); adds / removes / re-jitters are
                      incremental; merged parts warm no program
     perf-1           blob shadows and the avatar's emoji face share the instanced map program,
                      the Spark Stick draws with the instanced programs, kitten whiskers are tubes
     perf-7           the Spark Stick is built (hidden) with the avatar, so the mount compiles it
     perf-6 / runtime-4  every LOW city is the toon + 'state' fallback, decided by the tier alone
   (perf-5, the bottleneck-aware ladder, is in island-tier.test.js and island-scene.test.js.)
   ================================================================ */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const L = require('../world/world-look.js');
const Tier = require('../world/island3d/tier.js');
const KIT = require('../world/island3d/kit.js');
const City = require('../world/island3d/city3d.js');
const CH = require('../world/island3d/models-characters.js');
const KIT_SRC = fs.readFileSync(path.join(__dirname, '..', 'world', 'island3d', 'kit.js'), 'utf8');
const CH_SRC = fs.readFileSync(path.join(__dirname, '..', 'world', 'island3d', 'models-characters.js'), 'utf8');

/* ================================================================
   mini THREE
   ================================================================ */
const FrontSide = 0, BackSide = 1, DoubleSide = 2, NoBlending = 0, NormalBlending = 1, AdditiveBlending = 2;
class Vector2 { constructor(x = 0, y = 0) { this.x = x; this.y = y; } set(x, y) { this.x = x; this.y = y; return this; } }
class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; this.isVector3 = true; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  setScalar(s) { return this.set(s, s, s); }
  copy(v) { return this.set(v.x, v.y, v.z); }
  clone() { return new Vector3(this.x, this.y, this.z); }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
  length() { return Math.hypot(this.x, this.y, this.z); }
  normalize() { return this.multiplyScalar(1 / (this.length() || 1)); }
  applyMatrix4(m) {
    const e = m.elements, x = this.x, y = this.y, z = this.z, w = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15]);
    return this.set((e[0] * x + e[4] * y + e[8] * z + e[12]) * w, (e[1] * x + e[5] * y + e[9] * z + e[13]) * w, (e[2] * x + e[6] * y + e[10] * z + e[14]) * w);
  }
  applyQuaternion(q) {
    const x = this.x, y = this.y, z = this.z, qx = q.x, qy = q.y, qz = q.z, qw = q.w;
    const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
    return this.set(x + qw * tx + qy * tz - qz * ty, y + qw * ty + qz * tx - qx * tz, z + qw * tz + qx * ty - qy * tx);
  }
}
class Euler { constructor(x = 0, y = 0, z = 0, o = 'XYZ') { this.x = x; this.y = y; this.z = z; this.order = o; } set(x, y, z, o) { this.x = x; this.y = y; this.z = z; if (o) this.order = o; return this; } }
class Quaternion {
  constructor(x = 0, y = 0, z = 0, w = 1) { this.x = x; this.y = y; this.z = z; this.w = w; }
  set(x, y, z, w) { this.x = x; this.y = y; this.z = z; this.w = w; return this; }
  copy(q) { return this.set(q.x, q.y, q.z, q.w); }
  setFromEuler(e) {                                           /* three's formulas */
    const c1 = Math.cos(e.x / 2), c2 = Math.cos(e.y / 2), c3 = Math.cos(e.z / 2), s1 = Math.sin(e.x / 2), s2 = Math.sin(e.y / 2), s3 = Math.sin(e.z / 2);
    switch (e.order) {
      case 'YXZ': return this.set(s1 * c2 * c3 + c1 * s2 * s3, c1 * s2 * c3 - s1 * c2 * s3, c1 * c2 * s3 - s1 * s2 * c3, c1 * c2 * c3 + s1 * s2 * s3);
      case 'ZXY': return this.set(s1 * c2 * c3 - c1 * s2 * s3, c1 * s2 * c3 + s1 * c2 * s3, c1 * c2 * s3 + s1 * s2 * c3, c1 * c2 * c3 - s1 * s2 * s3);
      default: return this.set(s1 * c2 * c3 + c1 * s2 * s3, c1 * s2 * c3 - s1 * c2 * s3, c1 * c2 * s3 + s1 * s2 * c3, c1 * c2 * c3 - s1 * s2 * s3);
    }
  }
}
class Matrix4 {
  constructor() { this.elements = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; this.isMatrix4 = true; }
  identity() { this.elements = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; return this; }
  set(n11, n12, n13, n14, n21, n22, n23, n24, n31, n32, n33, n34, n41, n42, n43, n44) {
    this.elements = [n11, n21, n31, n41, n12, n22, n32, n42, n13, n23, n33, n43, n14, n24, n34, n44]; return this;
  }
  copy(m) { this.elements = m.elements.slice(); return this; }
  clone() { return new Matrix4().copy(this); }
  fromArray(a, o = 0) { for (let i = 0; i < 16; i++) this.elements[i] = a[o + i]; return this; }
  toArray(a = [], o = 0) { for (let i = 0; i < 16; i++) a[o + i] = this.elements[i]; return a; }
  multiply(m) { return this.multiplyMatrices(this, m); }
  multiplyMatrices(a, b) {
    const ae = a.elements, be = b.elements, te = new Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      let s = 0; for (let k = 0; k < 4; k++) s += ae[k * 4 + r] * be[c * 4 + k];
      te[c * 4 + r] = s;
    }
    this.elements = te; return this;
  }
  makeTranslation(x, y, z) { return this.set(1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z, 0, 0, 0, 1); }
  compose(p, q, s) {
    const x = q.x, y = q.y, z = q.z, w = q.w, x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
    this.elements = [(1 - (yy + zz)) * s.x, (xy + wz) * s.x, (xz - wy) * s.x, 0, (xy - wz) * s.y, (1 - (xx + zz)) * s.y, (yz + wx) * s.y, 0,
      (xz + wy) * s.z, (yz - wx) * s.z, (1 - (xx + yy)) * s.z, 0, p.x, p.y, p.z, 1];
    return this;
  }
}
class Color {
  constructor(r, g, b) { this.isColor = true; this.r = 1; this.g = 1; this.b = 1; if (r !== undefined) { if (g === undefined) this.set(r); else this.setRGB(r, g, b); } }
  set(v) { if (v && v.isColor) return this.copy(v); if (typeof v === 'number') return this.setRGB(((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255); const n = parseInt(String(v).replace('#', ''), 16); return this.setRGB(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255); }
  setRGB(r, g, b) { this.r = r; this.g = g; this.b = b; return this; }
  setScalar(s) { return this.setRGB(s, s, s); }
  copy(c) { return this.setRGB(c.r, c.g, c.b); }
  clone() { return new Color(this.r, this.g, this.b); }
  lerp(c, k) { return this.setRGB(this.r + (c.r - this.r) * k, this.g + (c.g - this.g) * k, this.b + (c.b - this.b) * k); }
  multiplyScalar(s) { return this.setRGB(this.r * s, this.g * s, this.b * s); }
  equals(c) { return c.r === this.r && c.g === this.g && c.b === this.b; }
  toArray(a = [], o = 0) { a[o] = this.r; a[o + 1] = this.g; a[o + 2] = this.b; return a; }
  getHexString() { return [this.r, this.g, this.b].map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join(''); }
}
class Sphere { constructor(c = new Vector3(), r = -1) { this.center = c; this.radius = r; } }
class Box3 {
  constructor() { this.min = new Vector3(Infinity, Infinity, Infinity); this.max = new Vector3(-Infinity, -Infinity, -Infinity); }
  set(a, b) { this.min.copy(a); this.max.copy(b); return this; }
  isEmpty() { return this.max.x < this.min.x || this.max.y < this.min.y || this.max.z < this.min.z; }
  union(b) { this.min.set(Math.min(this.min.x, b.min.x), Math.min(this.min.y, b.min.y), Math.min(this.min.z, b.min.z)); this.max.set(Math.max(this.max.x, b.max.x), Math.max(this.max.y, b.max.y), Math.max(this.max.z, b.max.z)); return this; }
  getSize(v) { return v.set(this.max.x - this.min.x, this.max.y - this.min.y, this.max.z - this.min.z); }
  getCenter(v) { return v.set((this.max.x + this.min.x) / 2, (this.max.y + this.min.y) / 2, (this.max.z + this.min.z) / 2); }
}
class BufferAttribute {
  constructor(array, itemSize, normalized) { this.array = array; this.itemSize = itemSize; this.normalized = !!normalized; this.version = 0; this.updateRanges = []; this.usage = 35044; this.isBufferAttribute = true; }
  get count() { return this.array.length / this.itemSize; }
  set needsUpdate(v) { if (v) this.version++; }
  setUsage(u) { this.usage = u; return this; }
  addUpdateRange(start, count) { this.updateRanges.push({ start, count }); }
  clearUpdateRanges() { this.updateRanges.length = 0; }
  clone() { return new this.constructor(this.array.slice(), this.itemSize, this.normalized); }
  getX(i) { return this.array[i * this.itemSize]; } getY(i) { return this.array[i * this.itemSize + 1]; } getZ(i) { return this.array[i * this.itemSize + 2]; }
}
class InstancedBufferAttribute extends BufferAttribute {}
class BufferGeometry {
  constructor() { this.attributes = {}; this.index = null; this.drawRange = { start: 0, count: Infinity }; this.morphAttributes = {}; this.isBufferGeometry = true; this.boundingBox = null; this.boundingSphere = null; }
  setAttribute(n, a) { this.attributes[n] = a; return this; }
  getAttribute(n) { return this.attributes[n]; }
  deleteAttribute(n) { delete this.attributes[n]; return this; }
  setIndex(i) { this.index = Array.isArray(i) ? new BufferAttribute(new Uint32Array(i), 1) : i; return this; }
  setDrawRange(s, c) { this.drawRange.start = s; this.drawRange.count = c; }
  clearGroups() {}
  rotateX() { return this; }
  computeBoundingBox() {
    const p = this.attributes.position.array, b = new Box3();
    for (let i = 0; i < p.length; i += 3) b.union({ min: new Vector3(p[i], p[i + 1], p[i + 2]), max: new Vector3(p[i], p[i + 1], p[i + 2]) });
    this.boundingBox = b;
  }
  computeBoundingSphere() { if (!this.boundingBox) this.computeBoundingBox(); const s = new Vector3(); this.boundingBox.getSize(s); this.boundingSphere = new Sphere(this.boundingBox.getCenter(new Vector3()), s.length() / 2); }
  clone() { const g = new this.constructor(); for (const k in this.attributes) g.attributes[k] = this.attributes[k].clone(); return g; }
  dispose() { this.disposed = true; }
}
class PlaneGeometry extends BufferGeometry {
  constructor() {
    super();
    this.setAttribute('position', new BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]), 3));
    this.setAttribute('uv', new BufferAttribute(new Float32Array(12), 2));
  }
}
class Object3D {
  constructor() {
    this.position = new Vector3(); this.quaternion = new Quaternion(); this.scale = new Vector3(1, 1, 1);
    const q = this.quaternion; this.rotation = new Euler(); const r = this.rotation;
    r.set = function (x, y, z, o) { Euler.prototype.set.call(r, x, y, z, o); q.setFromEuler(r); return r; };
    this.children = []; this.parent = null; this.visible = true; this.name = ''; this.userData = {}; this.renderOrder = 0;
    this.matrix = new Matrix4(); this.matrixWorld = new Matrix4(); this.matrixAutoUpdate = true; this.castShadow = false; this.receiveShadow = false; this.frustumCulled = true;
  }
  add(...os) { for (const o of os) { if (!o) continue; if (o.parent) o.parent.remove(o); o.parent = this; this.children.push(o); } return this; }
  remove(o) { const i = this.children.indexOf(o); if (i >= 0) { this.children.splice(i, 1); o.parent = null; } return this; }
  clear() { for (const c of this.children.slice()) this.remove(c); return this; }
  traverse(fn) { fn(this); for (const c of this.children) c.traverse(fn); }
  updateMatrix() { this.matrix.compose(this.position, this.quaternion, this.scale); }
  updateMatrixWorld() {
    if (this.matrixAutoUpdate) this.updateMatrix();
    if (this.parent) this.matrixWorld.multiplyMatrices(this.parent.matrixWorld, this.matrix); else this.matrixWorld.copy(this.matrix);
    for (const c of this.children) c.updateMatrixWorld();
  }
}
class Group extends Object3D { constructor() { super(); this.isGroup = true; } }
class Bone extends Object3D { constructor() { super(); this.isBone = true; } }
class Mesh extends Object3D { constructor(g, m) { super(); this.geometry = g; this.material = m; this.isMesh = true; } }
class InstancedMesh extends Mesh {
  constructor(g, m, count) {
    super(g, m); this.isInstancedMesh = true; this.count = count; this.instanceColor = null;
    const a = new Float32Array(count * 16); for (let i = 0; i < count; i++) a[i * 16] = a[i * 16 + 5] = a[i * 16 + 10] = a[i * 16 + 15] = 1;
    this.instanceMatrix = new InstancedBufferAttribute(a, 16);
  }
  setMatrixAt(i, m) { m.toArray(this.instanceMatrix.array, i * 16); }
  getMatrixAt(i, m) { return m.fromArray(this.instanceMatrix.array, i * 16); }
  computeBoundingSphere() { this.boundingSphere = new Sphere(new Vector3(), 1); }
  dispose() { this.disposed = true; }
}
class SkinnedMesh extends Mesh { constructor(g, m) { super(g, m); this.isSkinnedMesh = true; this.bindMode = 'attached'; this.bindMatrix = new Matrix4(); } bind(sk, m) { this.skeleton = sk; this.bindMatrix.copy(m || new Matrix4()); } }
class Skeleton {
  constructor(bones) { this.bones = bones; this.boneMatrices = new Float32Array(bones.length * 16); this.boneTexture = null; }
  computeBoneTexture() { let s = Math.sqrt(this.bones.length * 4); s = Math.max(4, Math.ceil(s / 4) * 4); const bm = new Float32Array(s * s * 4); bm.set(this.boneMatrices); this.boneMatrices = bm; this.boneTexture = { needsUpdate: false, dispose() {} }; return this; }
  update() {}
  dispose() { this.disposed = true; }
}
const DEFAULTS = { side: FrontSide, blending: NormalBlending, transparent: false, opacity: 1, depthWrite: true, toneMapped: true, fog: true, vertexColors: false, alphaTest: 0, visible: true, map: null, alphaMap: null, name: '', wireframe: false, flatShading: false };
class Material {
  constructor(p) { Object.assign(this, DEFAULTS, { color: new Color(1, 1, 1) }, p || {}); this.isMaterial = true; this.uuid = 'm' + (Material.n = (Material.n || 0) + 1); if (p && p.color !== undefined && !(p.color && p.color.isColor)) this.color = new Color(p.color); }
  clone() {
    const m = new this.constructor();
    for (const k of Object.keys(this)) if (k !== 'uuid' && k !== 'onBeforeCompile' && k !== 'customProgramCacheKey') m[k] = this[k] && this[k].isColor ? this[k].clone() : this[k];
    return m;
  }
  dispose() { this.disposed = true; }
}
Material.prototype.onBeforeCompile = function () {};
Material.prototype.customProgramCacheKey = function () { return this.onBeforeCompile.toString(); };
class MeshBasicMaterial extends Material { constructor(p) { super(p); this.isMeshBasicMaterial = true; this.type = 'MeshBasicMaterial'; } }
class MeshToonMaterial extends Material { constructor(p) { super(p); this.isMeshToonMaterial = true; this.type = 'MeshToonMaterial'; } }
class MeshMatcapMaterial extends Material { constructor(p) { super(p); this.isMeshMatcapMaterial = true; this.type = 'MeshMatcapMaterial'; } }
class LineBasicMaterial extends Material { constructor(p) { super(p); this.isLineBasicMaterial = true; this.type = 'LineBasicMaterial'; } }
class ShaderMaterial extends Material { constructor(p) { super(p); this.isShaderMaterial = true; this.type = 'ShaderMaterial'; } }
class DataTexture { constructor(data, w, h) { this.image = { data, width: w, height: h }; this.isTexture = true; } set needsUpdate(v) { this.version = (this.version || 0) + 1; } dispose() {} clone() { return Object.assign(new DataTexture(), this); } }
const T = {
  Vector2, Vector3, Euler, Quaternion, Matrix4, Color, Sphere, Box3, BufferAttribute, InstancedBufferAttribute, BufferGeometry, PlaneGeometry,
  Object3D, Group, Scene: Group, Bone, Mesh, InstancedMesh, SkinnedMesh, Skeleton,
  Material, MeshBasicMaterial, MeshToonMaterial, MeshMatcapMaterial, LineBasicMaterial, ShaderMaterial, DataTexture, CanvasTexture: DataTexture,
  FrontSide, BackSide, DoubleSide, NoBlending, NormalBlending, AdditiveBlending, DynamicDrawUsage: 35048, StaticDrawUsage: 35044,
  RedFormat: 1028, RGBAFormat: 1023, FloatType: 1015, NearestFilter: 1003, LinearFilter: 1006, RepeatWrapping: 1000, ClampToEdgeWrapping: 1001,
  SRGBColorSpace: 'srgb', NoColorSpace: '', DetachedBindMode: 'detached', AttachedBindMode: 'attached'
};

/* ================================================================
   helpers
   ================================================================ */
/* a non-indexed part: n triangles, normals not axis-aligned, a painted colour */
function geo(n, ox, colour) {
  const P = [], N = [], C = [];
  for (let i = 0; i < n; i++) {
    const a = i * 0.7 + ox;
    const tri = [[Math.cos(a) * 0.3, 0.1 + i * 0.05, Math.sin(a) * 0.3], [Math.cos(a + 1) * 0.35, 0.3 + i * 0.04, Math.sin(a + 1) * 0.2], [0.05 * i, 0.5, -0.1]];
    for (const v of tri) { P.push(...v); const l = Math.hypot(v[0], v[1] + 0.2, v[2]) || 1; N.push(v[0] / l, (v[1] + 0.2) / l, v[2] / l); C.push(...colour); }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(P), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(N), 3));
  g.setAttribute('color', new BufferAttribute(new Float32Array(C), 3));
  return g;
}
function kitOf(tier) {
  const hub = KIT.create(T, { look: L, models: {}, qa: false });
  return hub.kit(tier || 'MID');
}
/* a path-like piece: a toon tile (no shadow cast) + a glow plate driven per copy by a state colour */
function tileTpl(K, piece) {
  const ctx = K.ctx('path_stone', {}, 'p:' + piece);
  return K.template(ctx)
    .part('tile', [geo(6 + piece, piece, [0.7, 0.68, 0.6])], 'toon', { castShadow: false, receiveShadow: true })
    .part('glow', [geo(2, piece + 0.3, [1, 1, 1])], 'glow:Neon Cyan', { castShadow: false, receiveShadow: false, stateColor: { key: 'runway', off: 'Stage Night', on: 'Pebble', initial: 1 } })
    .done();
}
/* a building-like copy: a casting shell, a neon sign, pivoted 'state' lights, a gold knob (a matcap: stays
   in its batch), a squash-and-stretch toon bellows on a pivot and a perCopy LED strip */
function shopTpl(K) {
  const ctx = K.ctx('bld_boba', {}, 'v:0');
  return K.template(ctx)
    .part('shell', [geo(10, 0, [0.9, 0.5, 0.6])], 'toon', { castShadow: true })
    .part('sign', [geo(3, 1, [0.2, 0.9, 0.3])], 'neon:Laser Lime', {})
    .part('lights', [geo(4, 2, [1, 1, 1])], 'state', { pivot: 'lights', stateColor: { key: 'lit', off: 'Stage Night', on: 'Lamp Warm', initial: 0 } })
    .part('knob', [geo(2, 3, [1, 1, 1])], 'gold', {})
    .part('bellows', [geo(5, 4, [0.4, 0.6, 0.9])], 'toon', { pivot: 'bellows' })
    .part('strip', [geo(3, 5, [1, 1, 1])], 'state', { perCopy: true })
    .pivot('lights', [0, 0.8, 0.2]).pivot('bellows', [0.2, 0.4, 0])
    .done();
}
/* three's draw rules: visible chain, a visible material, instances, a draw range */
function visibleChain(o) { for (let n = o; n; n = n.parent) if (!n.visible) return false; return true; }
function drawCalls(root) {
  let c = 0;
  root.traverse((o) => {
    if (!o.isMesh || !visibleChain(o) || !o.material.visible) return;
    if (o.isInstancedMesh && o.count === 0) return;
    const g = o.geometry, n = Math.min(g.attributes.position.count, g.drawRange.start + g.drawRange.count) - g.drawRange.start;
    if (n <= 0) return;
    c += o.material.transparent && o.material.side === DoubleSide ? 2 : 1;
  });
  return c;
}
/* every drawn triangle as it lands on screen: world positions, colour and the normal the GPU uses
   (skinning: the bone's linear part; instancing: the inverse transpose) */
function inv3T(e) {
  const a = e[0], b = e[4], c = e[8], d = e[1], f = e[5], g = e[9], h = e[2], i = e[6], j = e[10];
  const A = f * j - g * i, B = -(d * j - g * h), Cc = d * i - f * h, det = a * A + b * B + c * Cc;
  /* the inverse transpose = the cofactor matrix / det, row-major [m00 m01 m02; …] */
  return [A / det, B / det, Cc / det, -(b * j - c * i) / det, (a * j - c * h) / det, -(a * i - b * h) / det, (b * g - c * f) / det, -(a * g - c * d) / det, (a * f - b * d) / det];
}
function soup(root) {
  const out = [];
  root.updateMatrixWorld();
  root.traverse((o) => {
    if (!o.isMesh || !visibleChain(o) || !o.material.visible) return;
    const g = o.geometry, P = g.attributes.position.array, Nn = g.attributes.normal.array, Cl = g.attributes.color ? g.attributes.color.array : null;
    const m = o.material, base = String(m.name).replace(/#merged$/, ''), vcol = m.vertexColors && Cl;
    const end = Math.min(P.length / 3, g.drawRange.start + g.drawRange.count);
    const insts = o.isInstancedMesh ? o.count : 1;
    for (let k = 0; k < insts; k++) {
      for (let t = g.drawRange.start; t + 2 < end; t += 3) {
        const pts = [], cs = [0, 0, 0];
        let nrm = null;
        for (let q = 0; q < 3; q++) {
          const v = t + q;
          let W;
          if (o.isSkinnedMesh) W = new Matrix4().fromArray(o.skeleton.boneMatrices, g.attributes.skinIndex.array[v * 4] * 16);
          else if (o.isInstancedMesh) W = new Matrix4().multiplyMatrices(o.matrixWorld, o.getMatrixAt(k, new Matrix4()));
          else W = o.matrixWorld;
          const e = W.elements, x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
          pts.push([e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]]);
          if (q === 0) {
            const nx = Nn[v * 3], ny = Nn[v * 3 + 1], nz = Nn[v * 3 + 2];
            let r;
            if (o.isSkinnedMesh) r = [e[0] * nx + e[4] * ny + e[8] * nz, e[1] * nx + e[5] * ny + e[9] * nz, e[2] * nx + e[6] * ny + e[10] * nz];
            else { const M = inv3T(e); r = [M[0] * nx + M[1] * ny + M[2] * nz, M[3] * nx + M[4] * ny + M[5] * nz, M[6] * nx + M[7] * ny + M[8] * nz]; }
            const l = Math.hypot(r[0], r[1], r[2]) || 1; nrm = r.map((u) => u / l);
          }
          const ic = o.isInstancedMesh && o.instanceColor ? [o.instanceColor.array[k * 3], o.instanceColor.array[k * 3 + 1], o.instanceColor.array[k * 3 + 2]] : [1, 1, 1];
          const vc = vcol ? [Cl[v * 3], Cl[v * 3 + 1], Cl[v * 3 + 2]] : [1, 1, 1];
          for (let z2 = 0; z2 < 3; z2++) cs[z2] += vc[z2] * ic[z2] * [m.color.r, m.color.g, m.color.b][z2] / 3;
        }
        const u = [pts[1][0] - pts[0][0], pts[1][1] - pts[0][1], pts[1][2] - pts[0][2]], w = [pts[2][0] - pts[0][0], pts[2][1] - pts[0][1], pts[2][2] - pts[0][2]];
        const area = Math.hypot(u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]);
        if (!(area > 1e-9)) continue;                         /* collapsed: hidden or removed */
        out.push({ v: [].concat(pts[0], pts[1], pts[2], cs), tag: base + '|' + (o.castShadow ? 'C' : '') + (o.receiveShadow ? 'R' : ''), n: nrm });
      }
    }
  });
  out.sort((a, b) => a.v[0] - b.v[0]);
  return out;
}
/* match two soups triangle for triangle (positions and colours within float32 noise) → the worst
   normal angle between matched triangles, in degrees */
function sameSoup(a, b, tag) {
  assert.equal(a.length, b.length, tag + ': triangle count');
  const used = new Uint8Array(b.length);
  let worst = 0;
  for (const t of a) {
    let hit = -1;
    for (let j = 0; j < b.length && hit < 0; j++) {
      if (used[j] || b[j].tag !== t.tag || Math.abs(b[j].v[0] - t.v[0]) > 1e-4) continue;
      let ok = true;
      for (let k = 0; k < t.v.length && ok; k++) ok = Math.abs(b[j].v[k] - t.v[k]) <= 1e-4;
      if (ok) hit = j;
    }
    assert.ok(hit >= 0, tag + ': a ' + t.tag + ' triangle at ' + t.v.slice(0, 3).map((x) => x.toFixed(3)) + ' has no twin');
    used[hit] = 1;
    const d = t.n[0] * b[hit].n[0] + t.n[1] * b[hit].n[1] + t.n[2] * b[hit].n[2];
    worst = Math.max(worst, Math.acos(Math.min(1, d)) * 180 / Math.PI);
  }
  return worst;
}
/* the same island twice — merged and as plain batches — driven through the same calls */
function twin(tier, fill) {
  const K = kitOf(tier);
  const sides = [{ merge: K.merger() }, { merge: null }].map((s) => {
    s.scene = new Group(); s.batches = {};
    if (s.merge) s.scene.add(s.merge.group);
    s.batch = (key, tpl) => s.batches[key] || (s.batches[key] = (() => { const b = K.batch(tpl, { merge: s.merge || undefined }); s.scene.add(b.group); return b; })());
    s.commit = () => { for (const k in s.batches) s.batches[k].commit(); if (s.merge) s.merge.commit(); };
    return s;
  });
  fill(K, sides);
  return { K, merged: sides[0], plain: sides[1] };
}

/* ================================================================
   perf-2 / perf-4: the merged layer
   ================================================================ */
test('perf-2 / perf-4: merged batches draw one call per material group, however many copies or path pieces', () => {
  const { K, merged, plain } = twin('MID', (K, sides) => {
    const tiles = [0, 1, 2, 3, 4, 5].map((p) => tileTpl(K, p)), shop = shopTpl(K);
    for (const s of sides) {
      for (let i = 0; i < 20; i++) s.batch('t' + (i % 6), tiles[i % 6]).add('p' + i, { pos: [i % 5, 0, (i / 5) | 0], fp: [1, 1] });
      for (let i = 0; i < 3; i++) s.batch('shop', shop).add('s' + i, { pos: [8 + i * 2, 0, 0], fp: [2, 2] });
      s.commit();
    }
  });
  K.setShow(1);                                          /* Showtime: the glow plates draw too */
  for (const s of [merged, plain]) s.commit();
  /* plain: 6 piece batches × (tile + glow) + the shop's 6 parts (its strip once per copy) = 12 + 5 + 3 */
  assert.equal(drawCalls(plain.scene), 20);
  /* merged: tile toon, shell toon (casts), bellows toon (no cast), the glow twin, the neon twin, 'state'
     (lights + strips) — and the gold knob, a matcap, stays in its batch */
  const info = merged.merge.info();
  assert.equal(drawCalls(merged.scene), info.calls + 1);
  assert.ok(drawCalls(merged.scene) <= 7, 'merged: ' + drawCalls(merged.scene) + ' calls');
  /* 20 more path pieces (the network branches) and 3 more shops cost no draw call */
  const before = drawCalls(merged.scene);
  const tiles = [0, 1, 2, 3, 4, 5].map((p) => tileTpl(K, p));
  for (let i = 20; i < 40; i++) merged.batch('t' + (i % 6), tiles[i % 6]).add('p' + i, { pos: [i % 5, 0, (i / 5) | 0], fp: [1, 1] });
  for (let i = 3; i < 6; i++) merged.batch('shop', shopTpl(K)).add('s' + i, { pos: [8 + i * 2, 0, 0], fp: [2, 2] });
  merged.commit();
  assert.equal(drawCalls(merged.scene), before, 'the count does not grow with the island');
  /* golden hour: the glow twin hides with its material */
  K.setShow(0); merged.commit();
  assert.equal(drawCalls(merged.scene), before - 1);
});

test('perf-2: merged parts warm no program — their hidden batch meshes stay out of the scene graph', () => {
  const { merged, plain } = twin('MID', (K, sides) => {
    const shop = shopTpl(K);
    for (const s of sides) { s.batch('shop', shop).add('s0', { pos: [0, 0, 0], fp: [2, 2] }); s.commit(); }
  });
  /* compile() walks hidden objects too: the merged batch may only hold what it still draws */
  const inBatch = [];
  merged.batches.shop.group.traverse((o) => { if (o.isMesh) inBatch.push(o.material.name); });
  assert.deepEqual(inBatch, ['gold'], 'only the unmerged matcap knob (hulls would join it on a selection)');
  const plainMeshes = [];
  plain.batches.shop.group.traverse((o) => { if (o.isMesh) plainMeshes.push(o.material.name); });
  assert.equal(plainMeshes.length, 6);
});

test('perf-2: the merged layer renders exactly what the batches would — moves, jitter, pivots, a squash, state colours, hides and removals', () => {
  const ops = [];
  const { merged, plain } = twin('MID', (K, sides) => {
    const tiles = [0, 1, 2].map((p) => tileTpl(K, p)), shop = shopTpl(K);
    const jit = { yaw: 37, sx: 1.08, sy: 0.9, sz: 1.08, lean: 2, leanAxis: 40, tint: { l: 0.95, h: 4 } };
    for (const s of sides) {
      for (let i = 0; i < 6; i++) s.batch('t' + (i % 3), tiles[i % 3]).add('p' + i, { pos: [i, 0, 1], fp: [1, 1], yaw: (i % 4) * 90 }, i === 2 ? { jitter: jit } : undefined);
      for (let i = 0; i < 3; i++) s.batch('shop', shop).add('s' + i, { pos: [2 * i, 0, -3], fp: [2, 2] }, i === 1 ? { jitter: jit } : undefined);
      s.commit();
    }
    ops.push((s) => {
      const b = s.batches.shop;
      b.setPivot('s0', 'lights', [0, 35, 0], [0, 0.1, 0], 1);
      b.setPivot('s1', 'bellows', [10, 0, 0], [0, 0, 0], [1.3, 0.55, 1.1]);     /* a squash: the normals bend */
      b.setPivot('s2', 'root', [0, 0, 0], [0, 0, 0], [1.12, 0.8, 1.12]);         /* a tap squish */
      b.setState('s1', 'lit', 1);
      s.batches.t1.setState('p4', 'runway', 0.3);
      s.batches.t0.move('p3', 6, 4, { fp: [1, 1], yaw: 180 });
      s.batches.t2.move('p2', 7, 2, { fp: [1, 1], jitter: { yaw: 5, sx: 0.92, sy: 1.1, sz: 0.92 } });   /* re-jittered */
      s.batches.t1.hide('p1');
      s.batches.shop.remove('s0');
      s.batches.t0.add('p9', { pos: [9, 0, 9], fp: [1, 1] });
      const g = s.batches.shop.copyGeometry('s1', 'strip');                  /* a perCopy LED chase */
      g.getAttribute('color').array.fill(0.25, 0, 9); g.getAttribute('color').needsUpdate = true;
      s.commit();
    });
  });
  const same = (tag) => {
    const a = soup(merged.scene), b = soup(plain.scene);
    const worst = sameSoup(a, b, tag);
    /* exact up to float32; the 1.5% rigid tolerance only applies to near-rigid bones */
    assert.ok(worst < 0.05, tag + ': normals within ' + worst.toFixed(3) + '°');
    return a.length;
  };
  const n0 = same('placed');
  for (const op of ops) { op(merged); op(plain); }
  const n1 = same('after acts, a squash, colours, a move, a re-jitter, a hide, a removal and an add');
  assert.ok(n1 > 0 && n0 > 0);
});

test('perf-2: adds, removals and re-jitters are incremental — only the copy’s ranges are uploaded', () => {
  const K = kitOf('LOW'), mg = K.merger(), scene = new Group();
  scene.add(mg.group);
  const tpl = tileTpl(K, 0), b = K.batch(tpl, { merge: mg });
  scene.add(b.group);
  for (let i = 0; i < 12; i++) b.add('p' + i, { pos: [i, 0, 0], fp: [1, 1] });
  b.commit(); mg.commit();
  const tileMesh = mg.group.children.find((m) => /toon/.test(m.name)), glowMesh = mg.group.children.find((m) => /glow/.test(m.name));
  const geo0 = tileMesh.geometry, used0 = geo0.drawRange.count, per = used0 / 12, glowPer = glowMesh.geometry.drawRange.count / 12;
  /* a copy added within the spare capacity: appended, the geometry is the same object */
  b.add('p12', { pos: [12, 0, 0], fp: [1, 1] }); b.commit(); mg.commit();
  assert.equal(tileMesh.geometry, geo0, 'no rebuild');
  assert.equal(geo0.drawRange.count, used0 + per);
  assert.ok(geo0.getAttribute('position').updateRanges.some((r) => r.start === used0 * 3 && r.count === per * 3), 'only its range uploads');
  /* a removed copy: its vertices ride the zero bone 0 (a hole), still no rebuild */
  geo0.getAttribute('skinIndex').clearUpdateRanges();
  b.remove('p3'); b.commit(); mg.commit();
  assert.equal(tileMesh.geometry, geo0);
  const si = geo0.getAttribute('skinIndex');
  assert.deepEqual(si.updateRanges.map((r) => r.count), [per * 4]);
  for (let v = si.updateRanges[0].start / 4; v < si.updateRanges[0].start / 4 + per; v++) assert.equal(si.array[v * 4], 0);
  assert.ok(mg.skel.boneMatrices.slice(0, 16).every((x) => x === 0), 'bone 0 collapses');
  assert.equal(mg.info().holes, per + glowPer, 'its tile and its glow plate');
  /* a re-jitter re-bakes in place */
  b.move('p5', 5, 0, { fp: [1, 1], jitter: { yaw: 0, sx: 1.1, sy: 0.9, sz: 1.1 } }); b.commit(); mg.commit();
  assert.equal(tileMesh.geometry, geo0);
  /* holes past a quarter of the group compact it at the next commit */
  for (let i = 0; i < 4; i++) b.remove('p' + (6 + i));
  b.commit(); mg.commit();
  assert.notEqual(tileMesh.geometry, geo0, 'compacted');
  assert.equal(mg.info().holes, 0);
  assert.equal(tileMesh.geometry.drawRange.count, per * 8);
});

/* ================================================================
   perf-1: programs
   ================================================================ */
/* what decides three's program for a basic material on a mesh */
function programSig(mesh) {
  const m = mesh.material;
  return [m.type, !!m.map, !!m.vertexColors, !!m.transparent, m.alphaTest > 0, m.toneMapped !== false, m.fog !== false,
    !!mesh.isInstancedMesh, !!(mesh.isInstancedMesh && mesh.instanceColor), !!mesh.isSkinnedMesh, m.side,
    m.customProgramCacheKey === Material.prototype.customProgramCacheKey && m.onBeforeCompile === Material.prototype.onBeforeCompile].join('|');
}
test('perf-1: blob shadows share the LED / sign program — instance colour, alphaTest, a pre-tone-mapped colour', () => {
  /* three's NeutralToneMapping: below 0.08 the offset x − 6.25x², then 0.04; compression above 0.76 */
  assert.deepEqual(KIT.neutralTone([0.5, 0.5, 0.5], 1).map((x) => +x.toFixed(6)), [0.46, 0.46, 0.46]);
  assert.deepEqual(KIT.neutralTone([0.03, 0.02, 0.05], 1).map((x) => +x.toFixed(6)), [0.0125, 0.0025, 0.0325]);
  const hot = KIT.neutralTone([2, 1, 0.5], 1);
  assert.ok(hot[0] < 1 && hot[0] > hot[1] && hot[1] > hot[2], 'highlights compress, keep their order');
  const K = kitOf('LOW'), blobs = K.blobs(4), led = new InstancedMesh(new PlaneGeometry(), K.mat('led'), 1);
  led.instanceColor = new InstancedBufferAttribute(new Float32Array(3).fill(1), 3);
  assert.ok(blobs.mesh.instanceColor, 'blob instances carry a (white) colour');
  assert.equal(programSig(blobs.mesh), programSig(led), 'one program for blobs, LED screens and signs');
  const want = KIT.neutralTone([new Color(K.hex('Blob Shadow')).r, new Color(K.hex('Blob Shadow')).g, new Color(K.hex('Blob Shadow')).b], 1.05);
  const got = K.mat('blob').color;
  assert.ok(Math.abs(got.r - want[0]) < 1e-9 && Math.abs(got.g - want[1]) < 1e-9 && Math.abs(got.b - want[2]) < 1e-9, 'the colour reads as before');
  assert.equal(KIT.programFamily('blob'), KIT.programFamily('led'));
});

/* a kit stand-in for the character builders: cached part geometry, kit materials */
function charKit() {
  const K = kitOf('MID'), cache = {};
  const g = () => geo(4, 0, [1, 1, 1]);
  const skin = () => { const s = g(); s.setAttribute('skinIndex', new BufferAttribute(new Uint16Array(48), 4)); s.setAttribute('skinWeight', new BufferAttribute(new Float32Array(48), 4)); return s; };
  K.parts = {
    get: (key) => cache[key] || (cache[key] = /^char:avatar/.test(key) ? { skin: skin(), face: g(), tris: 100 }
      : /^char:wand/.test(key) ? { handle: g(), bulb: g(), halo: g(), tip: [0, 0.2, 0] } : null)
  };
  K.tex.emojiFace = () => new DataTexture(new Uint8Array(4), 1, 1);
  const SL3D = { kit: () => K, quality: { outlines: false }, onQuality: () => () => {} };
  return { K, SL3D };
}
test('perf-1 / perf-7: the emoji face and the Spark Stick draw with instanced programs; the stick is built (hidden) with the avatar', () => {
  const { SL3D } = charKit();
  const av = CH.build.makeAvatar(SL3D, { color: '#4FC3F7', emoji: '🦄' }, 'MID');
  const face = av.meshes.face;
  assert.ok(face.isInstancedMesh && face.instanceColor, 'the face is an InstancedMesh(1) with an instance colour');
  const led = new InstancedMesh(new PlaneGeometry(), SL3D.kit().mat('led'), 1);
  led.instanceColor = new InstancedBufferAttribute(new Float32Array(3).fill(1), 3);
  assert.equal(programSig(face), programSig(led), 'the LED / sign program');
  /* built before any Showtime, hidden: the mount's compile() walks hidden objects, so it warms it */
  let wand = null;
  av.root.traverse((o) => { if (o.name === 'wand') wand = o; });
  assert.ok(wand, 'the Spark Stick exists from the start');
  assert.equal(wand.visible, false);
  assert.deepEqual(wand.children.map((c) => c.name), ['handle', 'bulb', 'halo']);
  for (const c of wand.children) assert.ok(c.isInstancedMesh && c.instanceColor && c.count === 1, c.name + ' is an InstancedMesh(1)');
  assert.ok(wand.children[0].material.isMeshToonMaterial && wand.children[1].material.name === 'state');
  /* setWand only shows it: nothing new is built (or compiled) mid-transition */
  const before = [];
  av.root.traverse((o) => before.push(o));
  av.setWand(true);
  const after = [];
  av.root.traverse((o) => after.push(o));
  assert.equal(after.length, before.length);
  assert.equal(wand.visible, true);
  av.setWand(false);
  assert.equal(wand.visible, false);
  /* a crowd's or a game's makeWand: the same instanced parts */
  const w2 = CH.build.makeWand(SL3D, '#FF2E9A', 'MID');
  assert.ok(w2.children.every((c) => c.isInstancedMesh && c.instanceColor));
});

test('perf-1: the kitten’s whiskers are toon tubes on the rig too — no LineSegments, no line program', () => {
  const tubes = (rig) => CH.petParts('pet_kitten', CH.accState({}), rig).filter((d) => d.g === 'tube' && d.bone === 'head' && d.c === CH.petTokens('pet_kitten').whisker);
  assert.equal(tubes(true).length, 6, 'the rig draws 6 whisker tubes');
  assert.equal(tubes(false).length, 6, 'as the photocard does');
  assert.ok(!/new T\.LineSegments|K\.mat\('line:/.test(CH_SRC), 'no line mesh, no line material');
  assert.ok(CH.petTris('pet_kitten', CH.accState({}), true) <= CH.BUDGET.pet, 'the kitten rig stays inside its budget');
});

/* ================================================================
   perf-6 / runtime-4: the city's LOW fallback
   ================================================================ */
function cityKit(tier) {
  const K = kitOf(tier);
  K.ledAtlas = () => ({ texture: new DataTexture(new Uint8Array(4), 1, 1) });
  K.tex.fontReady = () => Promise.resolve(false);
  return K;
}
test('perf-6 / runtime-4: every LOW city is the toon + state fallback — decided by the tier, not by the renderer at create time', () => {
  assert.equal(City.fallbackFor('LOW'), true);
  assert.equal(City.fallbackFor('MID'), false);
  assert.equal(City.fallbackFor('HIGH'), false);
  assert.equal(City.fallbackFor('MID', true), true, 'forced');
  assert.equal(City.fallbackFor('LOW', false), false, 'forbidden (QA)');
  /* a mount's renderer is fresh: info().lease.programs is 0 when env creates the city */
  const SL3D = (tier) => ({ budget: Tier.budget(tier, 1), quality: { reflections: true }, info: () => ({ lease: { programs: 0 } }) });
  const low = City.create(cityKit('LOW'), SL3D('LOW'), { tier: 'LOW', name: 'Mina' });
  assert.equal(low.info().fallback, true, 'LOW: the fallback on the very first open');
  let shader = 0, inst = 0;
  low.group.traverse((o) => { if (o.material && o.material.isShaderMaterial) shader++; if (o.isInstancedMesh) inst++; });
  assert.equal(shader, 0, 'no city program on LOW');
  assert.equal(inst, 2, 'toon + state strips');
  const mid = City.create(cityKit('MID'), SL3D('MID'), { tier: 'MID', name: 'Mina' });
  assert.equal(mid.info().fallback, false);
  assert.equal(City.create(cityKit('LOW'), SL3D('LOW'), { tier: 'LOW', fallback: false }).info().fallback, false);
  low.dispose(); mid.dispose();
});

test('perf: the kit documents the merged layer and K.merger', () => {
  assert.match(KIT_SRC, /K\.merger\(\{name, additive = true\}\)/);
  assert.match(KIT_SRC, /K\.batch\(tpl, \{merge: merger\}\) joins it/);
});
