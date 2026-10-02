/* ================================================================
   My Island 3D — the camera rig (island chunk 10; classic script).
   window.SLIslandCamera in the browser, module.exports in Node. The rig
   and the gesture recognizer are PURE (no DOM, no THREE): numbers in,
   numbers out, so they run in Node tests. Controls() is the only DOM
   part; it turns pointer / wheel / key events into rig calls and hands
   taps, long-presses and item drags back to the scene (island3d.js).

   STATE  {tx, tz, yaw, elev, zoom}: target (x, 0.3, z) on the land, yaw
   (deg, ±35), elevation (deg, 40–67), zoom (0.75–1.6; 2.2 on portrait
   phones). dist = fitDist(land, yaw, elev, aspect) / zoom, so the whole
   unlocked land (2.9 u tall items included) is framed at zoom 1 from any
   angle (the same maths as SLGrid3D.fitCamera, allocation-free). Input
   moves a GOAL; the shown state eases toward it (damping 0.12 per 60 Hz
   frame) and flicks carry inertia. Under reduced motion every change is
   a static cut and there is no inertia, orbit or shake.

   API (pure)
     LIMITS, TARGET_Y, DEG_PER_PX
     damp(dt, rate) · clamp · lerp · wrapDeg
     boundsOf(land) → {minX, maxX, minZ, maxZ, cx, cz, maxY, top, bottom}
     fitDist(b, yawDeg, elevDeg, aspect, fov?, margin?, near?) → dist
     basisInto(yawDeg, elevDeg, out) → out {Dx..Dz, Rx..Rz, Ux..Uz}
     panDelta(dxPx, dyPx, viewH, dist, fov, yawDeg, elevDeg, out) → {x, z}
     panLimit(b, zoom, slack) → {x, z} · zoomMaxFor(touch, aspect) · isPhone(touch, aspect)
     projectPose(p, pose, out) → {x, y, depth} (NDC) · groundAt(pose, nx, ny, y, out) → point | null
   Rig(o) → rig            o {grid, motion, reduced, touch, aspect, land}
     rig.setLand(land, {smooth}) · rig.resize(w, h) · rig.setTouch(on) · rig.setReduced(on)
     rig.setMode('play' | 'edit' | 'place', {keepZoom}?)   edit/place ease to yaw 0 / elev 62 in
                                             ~0.4 s (place on phones also zooms to ≥ 1.4× unless
                                             keepZoom: a drag carried the item); leaving restores the view
     rig.orbitBy(dYaw, dElev) · rig.panBy(dxPx, dyPx) · rig.zoomBy(f, focus?) → changed
     rig.fling(vx, vy, mode) · rig.command('left'|'right'|'up'|'down'|'in'|'out'|'reset')
     rig.reset(instant) · rig.focusOn(point, {zoom, instant}) · rig.keepInView(point, frac)
     rig.reveal() · rig.crane(point) → Promise · rig.pushIn(point, {zoom}) → Promise
     rig.dance(point, sec) · rig.releaseMove(kind?) · rig.showOrbit(on) · rig.shake(amp, dur)
     rig.update(dt) → changed     (once per frame; zero allocation)
     rig.pose {px, py, pz, tx, ty, tz, yaw, elev, zoom, dist, fov, aspect, near, far}
     rig.version (bumps whenever the pose changes) · rig.moving · rig.apply(camera)
     rig.project(p, out) · rig.groundAt(nx, ny, y, out) · rig.zoomedIn() · rig.canOrbit() · rig.info()
   Gesture(o) → pure pointer recognizer (tap 8 px / up to 1 s — a slow press released in place is
     still a tap, also after the long-press —, long-press 450 ms, hold 1 s (no tap after it),
     claimed item drag 10 px, double tap 320 ms / 24 px, pinch + twist)
     down(id, x, y, tMs, {claim, cam}) / move / up / cancel(id) / tick(tMs) → events[] · nextTick(tMs)
     events: press · tap {count, long} · longpress · hold · dragstart · drag · dragend {cancelled} ·
             orbit | orbitX | pan {dx, dy} · pinch {scale, rotate, dx, dy, cx, cy} · release {vx, vy, mode}
   Controls(el, rig, hooks) → {key(e) → handled, setEnabled(on), cancel(), dispose()}   (browser only)
     hooks {press(x, y, e) → 'item' | 'ghost' | null, tap(x, y, count, long), longPress(x, y, claim),
            hold(x, y, claim), dragStart(x, y, x0, y0), drag(x, y), dragEnd(x, y, cancelled), camera(), input()}
     dragEnd(…, cancelled = true) is a cancel, never a release: pointercancel, a second finger,
     cancel() / setEnabled(false), or a lost pointer capture that cannot be taken back (a capture lost
     while the finger is down — the element was re-parented — is re-taken and the gesture goes on).
     Mouse: left-drag orbits (play mode), right/shift-drag pans, wheel zooms toward the cursor.
     Touch: one finger orbits (yaw) — or pans once zoomed in —, two fingers pinch-zoom,
     twist-rotate and pan. Keys (while the camera buttons have focus): [ ] rotate,
     + − zoom, 0 reset, ←→ rotate, ↑↓ tilt, Shift+arrows pan.
   ================================================================ */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SLIslandCamera = api;
}(typeof self !== 'undefined' ? self : typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var VERSION = 1;
  var DEG = Math.PI / 180;
  var TARGET_Y = 0.3;

  var LIMITS = {
    fov: 30, near: 0.5, far: 200, margin: 0.06,
    yaw: 35, elevMin: 40, elevMax: 67, elevDefault: 52, editElev: 62,
    zoomMin: 0.75, zoomMax: 1.6, zoomPhone: 2.2, placeZoomPhone: 1.4,
    damping: 0.12,            /* per 60 Hz frame (the bible's inertia damping) */
    snapDamping: 0.2,         /* mode tilts / resets / framing: settle within ~0.4 s */
    snapSec: 0.45,
    flingKeep: 0.03,          /* velocity left after 1 s of coasting */
    panSlack: 0.35,           /* u the target may leave the framed centre at zoom ≤ 1 */
    keyYaw: 15, keyElev: 5, keyZoom: 1.25, keyPanPx: 48
  };
  var DEG_PER_PX = { yaw: 0.25, elev: 0.2 };
  var STEP_EPS = 1e-4;

  /* ---------------- maths ---------------- */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function lerp(a, b, k) { return a + (b - a) * k; }
  function wrapDeg(d) { d = ((d + 180) % 360 + 360) % 360 - 180; return d; }
  /* frame-rate independent smoothing: the fraction to close this frame */
  function damp(dt, rate) { return dt <= 0 ? 0 : 1 - Math.pow(1 - clamp(rate, 0, 0.999999), dt * 60); }
  function inOutSine(t) { return -(Math.cos(Math.PI * t) - 1) / 2; }

  function grid() {
    var g = root && root.SLGrid3D;
    if (!g && typeof require === 'function') { try { g = require('./grid3d.js'); } catch (e) { g = null; } }
    return g || null;
  }
  function motion() {
    var m = root && root.SLMotion;
    if (!m && typeof require === 'function') { try { m = require('./motion.js'); } catch (e) { m = null; } }
    return m || null;
  }

  /* D = from target toward the camera, R = screen right, U = screen up (never rolls).
     Same vectors as SLGrid3D.basis, written into `out` without allocating. */
  function basisInto(yawDeg, elevDeg, out) {
    var y = yawDeg * DEG, e = elevDeg * DEG, sy = Math.sin(y), cy = Math.cos(y), se = Math.sin(e), ce = Math.cos(e);
    out.Dx = sy * ce; out.Dy = se; out.Dz = cy * ce;
    out.Rx = cy; out.Ry = 0; out.Rz = -sy;
    out.Ux = -sy * se; out.Uy = ce; out.Uz = -cy * se;
    return out;
  }

  /* land bounds for framing: the land squares + the sand skirt, items up to ITEM_MAX_H */
  function boundsOf(land) {
    var G = grid();
    if (!G) return { minX: -8.25, maxX: 8.25, minZ: -5.25, maxZ: 5.25, cx: 0, cz: 0, maxY: 0.45, top: 3.35, bottom: -0.12 };
    var b = G.landBounds(land == null ? ['home'] : land, G.SAND_REACH);
    return {
      minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ, cx: b.cx, cz: b.cz, maxY: b.maxY,
      top: G.ITEM_MAX_H + b.maxY, bottom: G.SAND_Y
    };
  }
  /* the distance that keeps every bounds corner inside NDC ±(1 - margin) looking at the land
     centre (target y 0.3) — the scalar twin of SLGrid3D.fitCamera, zero allocation */
  var _fb = {};
  function fitDist(b, yawDeg, elevDeg, aspect, fov, margin, near) {
    fov = fov || LIMITS.fov; aspect = aspect > 0 ? aspect : 16 / 9;
    margin = margin == null ? LIMITS.margin : margin; near = near || LIMITS.near;
    var B = basisInto(yawDeg, elevDeg, _fb), m = 1 - margin, tanH = Math.tan(fov * DEG / 2);
    var Fx = -B.Dx, Fy = -B.Dy, Fz = -B.Dz, dist = near;
    for (var i = 0; i < 8; i++) {
      var qx = (i & 1 ? b.maxX : b.minX) - b.cx, qy = (i & 2 ? b.top : b.bottom) - TARGET_Y, qz = (i & 4 ? b.maxZ : b.minZ) - b.cz;
      var f = qx * Fx + qy * Fy + qz * Fz;
      var r = Math.abs(qx * B.Rx + qy * B.Ry + qz * B.Rz) / (m * tanH * aspect) - f;
      var u = Math.abs(qx * B.Ux + qy * B.Uy + qz * B.Uz) / (m * tanH) - f;
      if (r > dist) dist = r;
      if (u > dist) dist = u;
      if (near * 2 - f > dist) dist = near * 2 - f;
    }
    return dist;
  }
  /* world-space target change for a screen drag of (dx, dy) px: the content follows the finger */
  var _pb = {};
  function panDelta(dxPx, dyPx, viewH, dist, fov, yawDeg, elevDeg, out) {
    out = out || {};
    var k = 2 * dist * Math.tan((fov || LIMITS.fov) * DEG / 2) / Math.max(1, viewH || 1);
    var y = yawDeg * DEG, se = Math.max(0.35, Math.sin(elevDeg * DEG));
    var rx = Math.cos(y), rz = -Math.sin(y);           /* screen right on the ground */
    var fx = -Math.sin(y), fz = -Math.cos(y);          /* away from the camera on the ground */
    out.x = -rx * dxPx * k + fx * dyPx * k / se;
    out.z = -rz * dxPx * k + fz * dyPx * k / se;
    return out;
  }
  /* how far the target may leave the land centre: none beyond a little slack at zoom 1,
     the uncovered half-extent once zoomed in */
  function panLimit(b, zoom, slack, out) {
    out = out || {};
    var f = Math.max(0, 1 - 1 / Math.max(zoom, 1e-3)), s = slack == null ? LIMITS.panSlack : slack;
    out.x = (b.maxX - b.minX) / 2 * f + s;
    out.z = (b.maxZ - b.minZ) / 2 * f + s;
    return out;
  }
  function isPhone(touch, aspect) { return !!touch && aspect > 0 && aspect < 1; }
  function zoomMaxFor(touch, aspect) { return isPhone(touch, aspect) ? LIMITS.zoomPhone : LIMITS.zoomMax; }

  /* NDC of a world point for a pose {px, py, pz, yaw, elev, fov, aspect} (= THREE lookAt) */
  var _pj = {};
  function projectPose(p, pose, out) {
    out = out || {};
    var B = basisInto(pose.yaw, pose.elev, _pj), tanH = Math.tan(pose.fov * DEG / 2);
    var vx = p.x - pose.px, vy = p.y - pose.py, vz = p.z - pose.pz;
    var depth = -(vx * B.Dx + vy * B.Dy + vz * B.Dz);
    out.depth = depth;
    out.x = (vx * B.Rx + vy * B.Ry + vz * B.Rz) / (depth * tanH * pose.aspect);
    out.y = (vx * B.Ux + vy * B.Uy + vz * B.Uz) / (depth * tanH);
    return out;
  }
  /* where the ray through NDC (nx, ny) meets the plane at height y (null above the horizon) */
  var _gb = {};
  function groundAt(pose, nx, ny, y, out) {
    var B = basisInto(pose.yaw, pose.elev, _gb), tanH = Math.tan(pose.fov * DEG / 2);
    var dx = -B.Dx + B.Rx * nx * tanH * pose.aspect + B.Ux * ny * tanH;
    var dy = -B.Dy + B.Ry * nx * tanH * pose.aspect + B.Uy * ny * tanH;
    var dz = -B.Dz + B.Rz * nx * tanH * pose.aspect + B.Uz * ny * tanH;
    if (dy > -1e-6) return null;
    var t = ((y || 0) - pose.py) / dy;
    if (!(t > 0)) return null;
    out = out || {};
    out.x = pose.px + dx * t; out.y = y || 0; out.z = pose.pz + dz * t;
    return out;
  }

  /* ================================================================
     RIG
     ================================================================ */
  function editing(m) { return m === 'edit' || m === 'place'; }
  function view() { return { tx: 0, tz: 0, yaw: 0, elev: LIMITS.elevDefault, zoom: 1 }; }
  function copyView(a, b) { a.tx = b.tx; a.tz = b.tz; a.yaw = b.yaw; a.elev = b.elev; a.zoom = b.zoom; return a; }
  function P() { return typeof Promise === 'function' ? Promise : null; }

  function Rig(o) {
    o = o || {};
    this.G = o.grid || grid();
    this.M = o.motion || motion();
    this.lim = {};
    for (var k in LIMITS) this.lim[k] = LIMITS[k];
    this.reduced = !!o.reduced;
    this.touch = !!o.touch;
    this.aspect = o.aspect > 0 ? o.aspect : 16 / 9;
    this.viewW = o.width || 0; this.viewH = o.height || 0;
    this.mode = 'play';
    this.b = null;
    this.cur = view(); this.goal = view(); this.home = view(); this.saved = null;
    this.vel = { yaw: 0, elev: 0, tx: 0, tz: 0 };
    this.move = null;
    this.orbitOn = false; this.orbitT = 0; this.orbitYaw = 0;
    this.shakeAmp = 0; this.shakeDur = 0; this.shakeT = 0;
    this.t = 0;
    this.pose = { px: 0, py: 0, pz: 0, tx: 0, ty: TARGET_Y, tz: 0, yaw: 0, elev: LIMITS.elevDefault, zoom: 1, dist: 10,
      fov: LIMITS.fov, aspect: this.aspect, near: LIMITS.near, far: LIMITS.far };
    this.version = 0;
    this.moving = false;
    this._last = { px: NaN, py: 0, pz: 0, tx: 0, tz: 0, fov: 0, aspect: 0 };
    this._camAspect = 0; this._camFov = 0;
    this._pd = {}; this._mk = {}; this._kv = {}; this._snapT = 0;
    this.setLand(o.land == null ? ['home'] : o.land, { instant: true });
  }
  var R = Rig.prototype;

  R.zoomMax = function () { return zoomMaxFor(this.touch, this.aspect); };
  R.phone = function () { return isPhone(this.touch, this.aspect); };
  R.zoomedIn = function () { return this.goal.zoom > 1.05; };
  R.canOrbit = function () { return !editing(this.mode); };

  /* the framing everything is relative to */
  R.setLand = function (land, o) {
    o = o || {};
    var b = boundsOf(land), G = this.G;
    var fit = G && typeof G.fitCamera === 'function' ? G.fitCamera({ land: land, aspect: this.aspect, fov: this.lim.fov, yaw: 0, elev: this.lim.elevDefault }) : null;
    this.b = b;
    this.home.tx = fit ? fit.target.x : b.cx; this.home.tz = fit ? fit.target.z : b.cz;
    this.home.yaw = 0; this.home.elev = this.lim.elevDefault; this.home.zoom = 1;
    if (o.instant || !this._landSet) {
      if (!this._landSet) { copyView(this.goal, this.home); copyView(this.cur, this.home); }
      else { this.goal.tx = this.home.tx; this.goal.tz = this.home.tz; this.cur.tx = this.goal.tx; this.cur.tz = this.goal.tz; }
    } else {
      /* a smooth reframe onto the bigger island (land unlock) */
      this.goal.tx = this.home.tx; this.goal.tz = this.home.tz;
    }
    this._landSet = true;
    this.clampGoal();
    return this;
  };
  R.resize = function (w, h) {
    if (!(w > 0 && h > 0)) return this;
    this.viewW = w; this.viewH = h;
    this.aspect = w / h;
    this.clampGoal();
    return this;
  };
  R.setTouch = function (on) { this.touch = !!on; this.clampGoal(); return this; };
  R.setReduced = function (on) {
    this.reduced = !!on;
    if (this.reduced) {
      this.vel.yaw = this.vel.elev = this.vel.tx = this.vel.tz = 0;
      this.shakeAmp = 0; this.orbitYaw = 0;
      copyView(this.cur, this.goal);
    }
    return this;
  };

  R.clampGoal = function () {
    var g = this.goal, l = this.lim, b = this.b;
    if (editing(this.mode)) g.yaw = 0;
    else g.yaw = clamp(g.yaw, -l.yaw, l.yaw);
    g.elev = clamp(g.elev, l.elevMin, l.elevMax);
    g.zoom = clamp(g.zoom, l.zoomMin, this.zoomMax());
    if (b) {
      var pl = panLimit(b, g.zoom, l.panSlack, this._pd);
      g.tx = clamp(g.tx, this.home.tx - pl.x, this.home.tx + pl.x);
      g.tz = clamp(g.tz, this.home.tz - pl.z, this.home.tz + pl.z);
    }
    if (this.reduced) copyView(this.cur, g);
    return this;
  };
  R._stopFling = function () { var v = this.vel; v.yaw = v.elev = v.tx = v.tz = 0; };

  /* ---------------- user input ---------------- */
  R.orbitBy = function (dYaw, dElev) {
    if (!this.canOrbit()) return this;
    this._stopFling();
    this.goal.yaw += dYaw || 0; this.goal.elev += dElev || 0;
    return this.clampGoal();
  };
  R.panBy = function (dxPx, dyPx) {
    this._stopFling();
    var d = panDelta(dxPx, dyPx, this.viewH || 600, this.pose.dist, this.lim.fov, this.pose.yaw, this.pose.elev, this._pd);
    this.goal.tx += d.x; this.goal.tz += d.z;
    return this.clampGoal();
  };
  /* zoom by a factor; with a focus point (under the cursor / pinch centre, at the target height
     y 0.3) the target slides toward it so that point stays put on screen (exact while the pan
     clamp allows). → true when anything changed */
  R.zoomBy = function (f, focus) {
    var g = this.goal, z0 = g.zoom, z1 = clamp(z0 * (f > 0 ? f : 1), this.lim.zoomMin, this.zoomMax());
    if (Math.abs(z1 - z0) < 1e-6) return false;
    if (focus && isFinite(focus.x) && isFinite(focus.z)) {
      g.tx = focus.x + (g.tx - focus.x) * (z0 / z1);
      g.tz = focus.z + (g.tz - focus.z) * (z0 / z1);
    }
    g.zoom = z1;
    this.clampGoal();
    return true;
  };
  /* inertia after a flick (px/s on screen) */
  R.fling = function (vx, vy, mode) {
    if (this.reduced) return this;
    var v = this.vel;
    if (mode === 'orbit' || mode === 'orbitX') {
      if (!this.canOrbit()) return this;
      v.yaw = clamp(vx * DEG_PER_PX.yaw, -120, 120);
      v.elev = mode === 'orbit' ? clamp(vy * DEG_PER_PX.elev, -60, 60) : 0;
    } else if (mode === 'pan') {
      var d = panDelta(vx, vy, this.viewH || 600, this.pose.dist, this.lim.fov, this.pose.yaw, this.pose.elev, this._pd);
      v.tx = clamp(d.x, -12, 12); v.tz = clamp(d.z, -12, 12);
    }
    return this;
  };
  R.command = function (cmd) {
    var l = this.lim;
    switch (cmd) {
      case 'left': this.orbitBy(-l.keyYaw, 0); break;
      case 'right': this.orbitBy(l.keyYaw, 0); break;
      case 'up': this.orbitBy(0, l.keyElev); break;
      case 'down': this.orbitBy(0, -l.keyElev); break;
      case 'in': this.zoomBy(l.keyZoom); break;
      case 'out': this.zoomBy(1 / l.keyZoom); break;
      case 'panL': this.panBy(l.keyPanPx, 0); break;
      case 'panR': this.panBy(-l.keyPanPx, 0); break;
      case 'panU': this.panBy(0, l.keyPanPx); break;
      case 'panD': this.panBy(0, -l.keyPanPx); break;
      case 'reset': this.reset(false); break;
      default: return false;
    }
    return true;
  };
  R.reset = function (instant) {
    this._stopFling();
    this._snapT = this.lim.snapSec;
    copyView(this.goal, this.home);
    if (editing(this.mode)) { this.goal.yaw = 0; this.goal.elev = this.lim.editElev; }
    this.clampGoal();
    if (instant) copyView(this.cur, this.goal);
    return this;
  };
  /* frame a point (long-press on an item, double-tap dolly on the ground) */
  R.focusOn = function (p, o) {
    if (!p) return this;
    o = o || {};
    this._stopFling();
    this._snapT = Math.max(this._snapT, 0.6);       /* the 0.6 s dolly */
    this.goal.tx = p.x; this.goal.tz = p.z;
    if (o.zoom != null) this.goal.zoom = o.zoom;
    this.clampGoal();
    if (o.instant) copyView(this.cur, this.goal);
    return this;
  };
  /* place mode on phones: pan so a point (the ghost) stays inside the central `frac` of the view */
  R.keepInView = function (p, frac) {
    if (!p) return this;
    frac = frac || 0.6;
    var n = projectPose(p, this.pose, this._kv);
    if (n.depth > 0 && Math.abs(n.x) <= frac && Math.abs(n.y) <= frac) return this;
    this.goal.tx += (p.x - this.goal.tx) * 0.6;
    this.goal.tz += (p.z - this.goal.tz) * 0.6;
    return this.clampGoal();
  };

  /* edit / place tilt: yaw 0, elevation 62° (arrow keys match grid directions); leaving restores */
  R.setMode = function (mode, o) {
    mode = mode === 'edit' || mode === 'place' ? mode : 'play';
    if (mode === this.mode) return this;
    var g = this.goal;
    this._stopFling();
    if (editing(mode) && !editing(this.mode)) this.saved = { yaw: g.yaw, elev: g.elev, zoom: g.zoom };
    if (editing(mode) !== editing(this.mode)) this._snapT = this.lim.snapSec;      /* the 0.4 s tilt */
    this.mode = mode;
    if (editing(mode)) {
      g.yaw = 0; g.elev = this.lim.editElev;
      /* place mode on phones zooms in, except when a drag is carrying the item there */
      if (mode === 'place' && this.phone() && !(o && o.keepZoom)) g.zoom = Math.max(g.zoom, this.lim.placeZoomPhone);
    } else if (this.saved) {
      g.yaw = this.saved.yaw; g.elev = this.saved.elev; g.zoom = this.saved.zoom;
      this.saved = null;
    }
    return this.clampGoal();
  };

  /* ---------------- stage-cam moves ----------------
     One at a time: {kind, t, dur, kAt(t) → 0..1, tx, tz, elev, zoom, dyaw, hold, relT, resolve}.
     The shown pose = lerp(user view, move pose, k); a new move ends the old one. */
  R._startMove = function (m) {
    this._endMove(false);
    m.t = 0; m.relT = -1;
    var Pr = P(), self = this;
    m.promise = Pr ? new Pr(function (res) { m.resolve = res; }) : null;
    m.k = m.kAt(0, self.reduced);
    this.move = m;
    return m.promise;
  };
  R._endMove = function (ok) {
    var m = this.move;
    if (!m) return;
    this.move = null;
    if (m.resolve) m.resolve(ok !== false);
  };
  /* mount: a short crane down from high and wide onto the default view */
  R.reveal = function () {
    if (this.reduced) return P() ? P().resolve(true) : null;
    var c = this.cur;
    return this._startMove({
      kind: 'reveal', dur: 1.6, tx: c.tx, tz: c.tz, elev: 66, zoom: 0.82, dyaw: -12,
      kAt: function (t) { return 1 - inOutSine(clamp01(t / 1.6)); }
    });
  };
  /* land unlock: crane 52° → 40° toward the region over 1.4 s, hold 1.5 s, back over 1.0 s */
  R.crane = function (p) {
    var M = this.M, c = this.cur, scratch = {}, red = this.reduced;
    var C = (M && M.CRANE) || { out: 1.4, hold: 1.5, back: 1.0, to: 40 };
    var dur = (C.out + C.hold + C.back) || 3.9;
    return this._startMove({
      kind: 'crane', dur: dur,
      tx: p ? lerp(c.tx, p.x, 0.6) : c.tx, tz: p ? lerp(c.tz, p.z, 0.6) : c.tz,
      elev: C.to || 40, zoom: Math.max(c.zoom, 1.15), dyaw: 0,
      kAt: function (t, reduced) {
        if (M && typeof M.crane === 'function') return M.crane(t, reduced != null ? reduced : red, scratch).k;
        if (reduced) return t < C.out + C.hold ? 1 : 0;
        return t < C.out ? inOutSine(t / C.out) : t < C.out + C.hold ? 1 : 1 - inOutSine(clamp01((t - C.out - C.hold) / C.back));
      }
    });
  };
  /* game launch: push in toward the attraction over 0.7 s and hold until releaseMove();
     the promise resolves when the push-in arrives */
  R.pushIn = function (p, o) {
    o = o || {};
    var M = this.M, c = this.cur;
    var m = {
      kind: 'push', dur: 0.7, hold: true,
      tx: p ? p.x : c.tx, tz: p ? p.z : c.tz, elev: Math.max(this.lim.elevMin, c.elev - 6),
      zoom: o.zoom || clamp(Math.max(c.zoom * 1.6, 1.8), 1, LIMITS.zoomPhone), dyaw: 0,
      kAt: function (t, reduced) { return M && typeof M.pushIn === 'function' ? M.pushIn(t, reduced) : (reduced ? 1 : inOutSine(clamp01(t / 0.7))); }
    };
    m.arrive = true;            /* resolve on arrival, not on release */
    return this._startMove(m);
  };
  /* dance break: a gentle push-in on the house area for the 8 counts */
  R.dance = function (p, sec) {
    if (this.reduced) return P() ? P().resolve(true) : null;
    var c = this.cur, hold = Math.max(0, sec || 4.07);
    return this._startMove({
      kind: 'dance', dur: 0.8 + hold + 0.8,
      tx: p ? lerp(c.tx, p.x, 0.5) : c.tx, tz: p ? lerp(c.tz, p.z, 0.5) : c.tz,
      elev: c.elev, zoom: c.zoom * 1.15, dyaw: 0,
      kAt: function (t) {
        if (t < 0.8) return inOutSine(t / 0.8);
        if (t < 0.8 + hold) return 1;
        return 1 - inOutSine(clamp01((t - 0.8 - hold) / 0.8));
      }
    });
  };
  /* let a held move (the launch push-in) go: eases back over 0.5 s (a cut under reduced motion) */
  R.releaseMove = function (kind) {
    var m = this.move;
    if (!m || (kind && m.kind !== kind)) return this;
    if (this.reduced) { this._endMove(true); return this; }
    if (m.relT < 0) { m.relT = m.t; m.relK = m.k; }
    return this;
  };
  /* Showtime: a slow 8° orbit over 8 s and back, alternating sides */
  R.showOrbit = function (on) { this.orbitOn = !!on; if (on) this.orbitT = 0; return this; };
  R.shake = function (amp, dur) {
    if (this.reduced) return this;
    this.shakeAmp = Math.max(this.shakeAmp * Math.max(0, 1 - this.shakeT / (this.shakeDur || 1)), amp || 0.06);
    this.shakeDur = dur || 0.18; this.shakeT = 0;
    return this;
  };

  /* ---------------- per frame (zero allocation) ---------------- */
  R.update = function (dt) {
    dt = dt > 0 ? Math.min(dt, 0.1) : 0;
    this.t += dt;
    var g = this.goal, c = this.cur, v = this.vel, red = this.reduced;
    /* inertia */
    if (!red && (v.yaw || v.elev || v.tx || v.tz)) {
      g.yaw += v.yaw * dt; g.elev += v.elev * dt; g.tx += v.tx * dt; g.tz += v.tz * dt;
      var keep = Math.pow(this.lim.flingKeep, dt);
      v.yaw *= keep; v.elev *= keep; v.tx *= keep; v.tz *= keep;
      if (Math.abs(v.yaw) < 0.5 && Math.abs(v.elev) < 0.5 && Math.abs(v.tx) < 0.01 && Math.abs(v.tz) < 0.01) this._stopFling();
      this.clampGoal();
    }
    /* ease the shown view toward the goal */
    if (red) copyView(c, g);
    else {
      if (this._snapT > 0) this._snapT -= dt;
      var a = damp(dt, this._snapT > 0 ? this.lim.snapDamping : this.lim.damping);
      c.tx += (g.tx - c.tx) * a; c.tz += (g.tz - c.tz) * a; c.yaw += (g.yaw - c.yaw) * a;
      c.elev += (g.elev - c.elev) * a; c.zoom += (g.zoom - c.zoom) * a;
      if (Math.abs(g.tx - c.tx) < STEP_EPS) c.tx = g.tx;
      if (Math.abs(g.tz - c.tz) < STEP_EPS) c.tz = g.tz;
      if (Math.abs(g.yaw - c.yaw) < STEP_EPS) c.yaw = g.yaw;
      if (Math.abs(g.elev - c.elev) < STEP_EPS) c.elev = g.elev;
      if (Math.abs(g.zoom - c.zoom) < STEP_EPS) c.zoom = g.zoom;
    }
    /* the stage-cam move */
    var m = this.move, k = 0;
    if (m) {
      m.t += dt;
      if (m.relT >= 0) {
        var u = clamp01((m.t - m.relT) / 0.5);
        k = m.relK * (1 - inOutSine(u));
        if (u >= 1) { this._endMove(true); m = null; k = 0; }
      } else {
        k = m.kAt(m.t, red);
        if (m.arrive && m.resolve && m.t >= (red ? 0 : m.dur)) { var res = m.resolve; m.resolve = null; res(true); }
        if (!m.hold && m.t >= m.dur) { this._endMove(true); m = null; k = 0; }
      }
      if (m) m.k = k;
    }
    /* Showtime orbit */
    var M = this.M;
    if (this.orbitOn && !red && !editing(this.mode)) {       /* edit keeps yaw 0 for the arrow keys */
      this.orbitT += dt;
      var cyc = Math.floor(this.orbitT / 8), ct = this.orbitT - cyc * 8, sign = cyc % 2 ? -1 : 1;
      var o = M && typeof M.orbit === 'function' ? M.orbit(ct, false) : 8 * Math.sin(Math.PI * ct / 8);
      this.orbitYaw = sign * o;
    } else if (this.orbitYaw) {
      this.orbitYaw += (0 - this.orbitYaw) * (red ? 1 : damp(dt, editing(this.mode) ? this.lim.snapDamping : 0.05));
      if (Math.abs(this.orbitYaw) < 1e-3) this.orbitYaw = 0;
    }
    /* compose */
    var yaw = c.yaw + this.orbitYaw, elev = c.elev, zoom = c.zoom, tx = c.tx, tz = c.tz;
    if (m && k > 0) {
      tx = lerp(tx, m.tx, k); tz = lerp(tz, m.tz, k);
      if (m.elev != null) elev = lerp(elev, m.elev, k);
      if (m.zoom != null) zoom = lerp(zoom, m.zoom, k);
      if (m.dyaw) yaw += m.dyaw * k;
    }
    if (this.shakeAmp > 0) {
      this.shakeT += dt;
      var sk = 1 - this.shakeT / this.shakeDur;
      if (sk <= 0 || red) this.shakeAmp = 0;
      else { tx += this.shakeAmp * sk * Math.sin(this.shakeT * 91); tz += this.shakeAmp * sk * Math.cos(this.shakeT * 77); }
    }
    var p = this.pose, B = basisInto(yaw, elev, this._mk);
    var dist = fitDist(this.b, yaw, elev, this.aspect, this.lim.fov, this.lim.margin, this.lim.near) / Math.max(0.1, zoom);
    p.tx = tx; p.ty = TARGET_Y; p.tz = tz; p.yaw = yaw; p.elev = elev; p.zoom = zoom; p.dist = dist;
    p.px = tx + B.Dx * dist; p.py = TARGET_Y + B.Dy * dist; p.pz = tz + B.Dz * dist;
    p.fov = this.lim.fov; p.aspect = this.aspect;
    var L = this._last, changed = !(Math.abs(L.px - p.px) < 1e-5 && Math.abs(L.py - p.py) < 1e-5 && Math.abs(L.pz - p.pz) < 1e-5 &&
      Math.abs(L.tx - p.tx) < 1e-5 && Math.abs(L.tz - p.tz) < 1e-5 && L.fov === p.fov && L.aspect === p.aspect);
    if (changed) {
      L.px = p.px; L.py = p.py; L.pz = p.pz; L.tx = p.tx; L.tz = p.tz; L.fov = p.fov; L.aspect = p.aspect;
      this.version++;
    }
    this.moving = changed;
    return changed;
  };
  /* write the pose into a THREE.PerspectiveCamera (duck-typed: no THREE import here) */
  R.apply = function (cam) {
    if (!cam) return this;
    var p = this.pose;
    if (this._camAspect !== p.aspect || this._camFov !== p.fov || cam.near !== p.near || cam.far !== p.far) {
      cam.fov = p.fov; cam.aspect = p.aspect; cam.near = p.near; cam.far = p.far;
      if (typeof cam.updateProjectionMatrix === 'function') cam.updateProjectionMatrix();
      this._camAspect = p.aspect; this._camFov = p.fov;
    }
    cam.position.set(p.px, p.py, p.pz);
    if (cam.up && cam.up.set) cam.up.set(0, 1, 0);
    if (typeof cam.lookAt === 'function') cam.lookAt(p.tx, p.ty, p.tz);
    if (typeof cam.updateMatrixWorld === 'function') cam.updateMatrixWorld();
    return this;
  };
  R.project = function (p, out) { return projectPose(p, this.pose, out); };
  R.groundAt = function (nx, ny, y, out) { return groundAt(this.pose, nx, ny, y, out); };
  R.info = function () {
    var p = this.pose;
    return {
      mode: this.mode, yaw: Math.round(p.yaw * 10) / 10, elev: Math.round(p.elev * 10) / 10, zoom: Math.round(p.zoom * 100) / 100,
      dist: Math.round(p.dist * 100) / 100, target: [p.tx, p.ty, p.tz], move: this.move ? this.move.kind : null,
      orbit: this.orbitOn, aspect: Math.round(this.aspect * 1000) / 1000, zoomMax: this.zoomMax(), reduced: this.reduced
    };
  };
  R.dispose = function () { this._endMove(false); };

  /* ================================================================
     GESTURE — a pure pointer recognizer (times in ms, positions in CSS px)
     ================================================================ */
  /* young children press and hold: a press released within the slop counts as a tap for up to
     tapMs (1 s), even after the 450 ms long-press fired (that tap carries long: true and never
     forms a double tap). Held still until holdMs (= tapMs) it becomes a deliberate 'hold' (once),
     and the release is no tap. */
  function Gesture(o) {
    o = o || {};
    this.slop = o.slop || 8; this.dragPx = o.dragPx || 10;
    this.tapMs = o.tapMs || 1000; this.longMs = o.longMs || 450;
    this.holdMs = Math.max(this.longMs, o.holdMs || this.tapMs);
    this.doubleMs = o.doubleMs || 320; this.doublePx = o.doublePx || 24;
    this.flingMs = o.flingMs || 80;
    this.ptrs = [];
    this.lastTap = null;
    this._reset();
  }
  var GP = Gesture.prototype;
  GP._reset = function () {
    this.state = 'idle'; this.claim = null; this.cam = 'none'; this.long = false; this.held = false;
    this.vx = 0; this.vy = 0; this.lt = 0;
    this.pd = 0; this.pa = 0; this.pcx = 0; this.pcy = 0;
  };
  GP._find = function (id) { for (var i = 0; i < this.ptrs.length; i++) if (this.ptrs[i].id === id) return this.ptrs[i]; return null; };
  GP.has = function (id) { return !!this._find(id); };
  GP.active = function () { return this.ptrs.length > 0; };
  GP._pinchInit = function () {
    var a = this.ptrs[0], b = this.ptrs[1];
    this.pd = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
    this.pa = Math.atan2(b.y - a.y, b.x - a.x);
    this.pcx = (a.x + b.x) / 2; this.pcy = (a.y + b.y) / 2;
  };
  GP.down = function (id, x, y, t, info) {
    info = info || {};
    if (this._find(id)) return [];
    var n = this.ptrs.length;
    if (n === 0) {
      this._reset();
      this.ptrs.push({ id: id, x: x, y: y, x0: x, y0: y, t0: t });
      this.state = 'press'; this.claim = info.claim || null; this.cam = info.cam || 'none'; this.lt = t;
      return [{ type: 'press', x: x, y: y, claim: this.claim }];
    }
    if (n === 1) {
      var out = [];
      if (this.state === 'drag') out.push({ type: 'dragend', x: this.ptrs[0].x, y: this.ptrs[0].y, cancelled: true });
      this.ptrs.push({ id: id, x: x, y: y, x0: x, y0: y, t0: t });
      this.state = 'multi';
      this._pinchInit();
      return out;
    }
    this.ptrs.push({ id: id, x: x, y: y, x0: x, y0: y, t0: t, extra: true });
    return [];
  };
  GP.move = function (id, x, y, t) {
    var p = this._find(id);
    if (!p || p.extra) return [];
    var dx = x - p.x, dy = y - p.y;
    p.x = x; p.y = y;
    var st = this.state;
    if (st === 'press') {
      var dist = Math.hypot(x - p.x0, y - p.y0);
      if (this.claim) {
        if (dist <= this.dragPx) return [];
        this.state = 'drag';
        return [{ type: 'dragstart', x: x, y: y, x0: p.x0, y0: p.y0, claim: this.claim }, { type: 'drag', x: x, y: y }];
      }
      if (dist <= this.slop) return [];
      if (this.cam === 'none') { this.state = 'ignore'; return []; }
      this.state = 'camera'; this.lt = t; this.vx = this.vy = 0;
      return [{ type: this.cam, dx: x - p.x0, dy: this.cam === 'orbitX' ? 0 : y - p.y0 }];
    }
    if (st === 'camera') {
      var gap = t - this.lt;
      if (gap > 0) {
        this.vx = this.vx * 0.4 + (dx / gap * 1000) * 0.6;
        this.vy = this.vy * 0.4 + (dy / gap * 1000) * 0.6;
        this.lt = t;
      }
      return [{ type: this.cam, dx: dx, dy: this.cam === 'orbitX' ? 0 : dy }];
    }
    if (st === 'drag') return [{ type: 'drag', x: x, y: y }];
    if (st === 'multi' && this.ptrs.length >= 2) {
      var a = this.ptrs[0], b = this.ptrs[1];
      var d = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)), ang = Math.atan2(b.y - a.y, b.x - a.x);
      var cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      var ev = { type: 'pinch', scale: d / this.pd, rotate: wrapDeg((ang - this.pa) / DEG), dx: cx - this.pcx, dy: cy - this.pcy, cx: cx, cy: cy };
      this.pd = d; this.pa = ang; this.pcx = cx; this.pcy = cy;
      return [ev];
    }
    return [];
  };
  GP._remove = function (id) {
    for (var i = 0; i < this.ptrs.length; i++) if (this.ptrs[i].id === id) { var p = this.ptrs[i]; this.ptrs.splice(i, 1); return p; }
    return null;
  };
  GP.up = function (id, x, y, t) {
    var p = this._find(id);
    if (!p) return [];
    if (x != null) { p.x = x; p.y = y; }
    var st = this.state, out = [];
    this._remove(id);
    if (p.extra) return out;
    if (st === 'press' && !this.ptrs.length) {
      var dist = Math.hypot(p.x - p.x0, p.y - p.y0);
      if (!this.held && t - p.t0 <= this.tapMs && dist <= this.slop) {
        var lt = this.lastTap, count = 1, slow = this.long;
        if (!slow && lt && t - lt.t <= this.doubleMs && Math.hypot(p.x - lt.x, p.y - lt.y) <= this.doublePx) count = 2;
        this.lastTap = count === 2 || slow ? null : { x: p.x, y: p.y, t: t };
        out.push({ type: 'tap', x: p.x, y: p.y, count: count, claim: this.claim, long: slow });
      }
    } else if (st === 'drag') {
      out.push({ type: 'dragend', x: p.x, y: p.y, cancelled: false });
    } else if (st === 'camera') {
      var fresh = t - this.lt <= this.flingMs;
      out.push({ type: 'release', vx: fresh ? this.vx : 0, vy: fresh ? (this.cam === 'orbitX' ? 0 : this.vy) : 0, mode: this.cam });
    } else if (st === 'multi') {
      /* the remaining finger must not start an orbit or a tap */
      if (this.ptrs.length) { this.state = 'wait'; return out; }
    }
    if (!this.ptrs.length) this._reset();
    else if (st !== 'multi' && st !== 'wait') this.state = 'wait';
    return out;
  };
  GP.cancel = function (id) {
    var p = this._find(id);
    if (!p) return [];
    var st = this.state, out = [];
    this._remove(id);
    if (!p.extra && st === 'drag') out.push({ type: 'dragend', x: p.x, y: p.y, cancelled: true });
    if (!this.ptrs.length) this._reset();
    else if (!p.extra) this.state = 'wait';
    return out;
  };
  GP.cancelAll = function () {
    var out = [];
    if (this.state === 'drag' && this.ptrs.length) out.push({ type: 'dragend', x: this.ptrs[0].x, y: this.ptrs[0].y, cancelled: true });
    this.ptrs.length = 0;
    this._reset();
    return out;
  };
  /* long-press / hold check (call from a timer): single pointer, still within the slop;
     'longpress' fires once at longMs, then 'hold' once at holdMs */
  GP.tick = function (t) {
    if (this.state !== 'press' || this.held || this.ptrs.length !== 1) return [];
    var p = this.ptrs[0];
    if (Math.hypot(p.x - p.x0, p.y - p.y0) > this.slop) return [];
    var out = [];
    if (!this.long) {
      if (t - p.t0 < this.longMs) return out;
      this.long = true;
      out.push({ type: 'longpress', x: p.x, y: p.y, claim: this.claim });
    }
    if (t - p.t0 >= this.holdMs) {
      this.held = true;
      out.push({ type: 'hold', x: p.x, y: p.y, claim: this.claim });
    }
    return out;
  };
  /* ms until the next tick() can fire for the current press (-1 = nothing pending) */
  GP.nextTick = function (t) {
    if (this.state !== 'press' || this.held || this.ptrs.length !== 1) return -1;
    var p = this.ptrs[0];
    return Math.max(0, p.t0 + (this.long ? this.holdMs : this.longMs) - t);
  };

  /* ================================================================
     CONTROLS — DOM events → Gesture → rig / scene hooks (browser only)
     ================================================================ */
  function Controls(el, rig, hooks, o) {
    o = o || {};
    hooks = hooks || {};
    var g = new Gesture(o.gesture);
    var enabled = true, lpTimer = 0, disposed = false, kinds = {};
    var nowMs = (root.performance && root.performance.now) ? function () { return root.performance.now(); } : Date.now;
    function call(name) {
      var f = hooks[name];
      if (typeof f !== 'function') return undefined;
      try { return f.apply(null, Array.prototype.slice.call(arguments, 1)); } catch (e) { if (hooks.error) hooks.error(e); return undefined; }
    }
    function local(e) {
      var r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width || 1, h: r.height || 1 };
    }
    function ndcOf(x, y) { var r = el.getBoundingClientRect(); return { x: (x / (r.width || 1)) * 2 - 1, y: -((y / (r.height || 1)) * 2 - 1) }; }
    function camMode(e) {
      if (e.pointerType === 'mouse') {
        if (e.button === 2 || e.button === 1 || e.shiftKey) return 'pan';
        return rig.canOrbit() ? 'orbit' : 'pan';
      }
      if (rig.zoomedIn()) return 'pan';
      return rig.canOrbit() ? 'orbitX' : 'none';
    }
    function dispatch(evs) {
      for (var i = 0; i < evs.length; i++) {
        var ev = evs[i];
        switch (ev.type) {
          case 'tap': call('tap', ev.x, ev.y, ev.count, !!ev.long); break;
          case 'longpress': call('longPress', ev.x, ev.y, ev.claim); break;
          case 'hold': call('hold', ev.x, ev.y, ev.claim); break;
          case 'dragstart': call('dragStart', ev.x, ev.y, ev.x0, ev.y0, ev.claim); break;
          case 'drag': call('drag', ev.x, ev.y); break;
          case 'dragend': call('dragEnd', ev.x, ev.y, ev.cancelled); break;
          case 'orbit': rig.orbitBy(ev.dx * DEG_PER_PX.yaw, ev.dy * DEG_PER_PX.elev); call('camera'); break;
          case 'orbitX': rig.orbitBy(ev.dx * DEG_PER_PX.yaw, 0); call('camera'); break;
          case 'pan': rig.panBy(ev.dx, ev.dy); call('camera'); break;
          case 'pinch': {
            var n = ndcOf(ev.cx, ev.cy), f = rig.groundAt(n.x, n.y, TARGET_Y, {});
            rig.zoomBy(ev.scale, f);
            if (rig.canOrbit() && Math.abs(ev.rotate) > 0.05) rig.orbitBy(-ev.rotate, 0);
            if (ev.dx || ev.dy) rig.panBy(ev.dx, ev.dy);
            call('camera');
            break;
          }
          case 'release': rig.fling(ev.vx, ev.vy, ev.mode); break;
        }
      }
    }
    /* the long-press, then the hold: one timer at a time, re-armed after each tick */
    function armLong() {
      clearTimeout(lpTimer);
      var wait = g.nextTick(nowMs());
      if (wait < 0) return;
      lpTimer = setTimeout(function () {
        if (disposed) return;
        dispatch(g.tick(nowMs()));
        armLong();
      }, wait + 10);
    }
    function onDown(e) {
      if (!enabled || disposed) return;
      if (e.pointerType === 'mouse' && e.button > 2) return;
      call('input');
      var p = local(e);
      var claim = g.active() ? null : (call('press', p.x, p.y, e) || null);
      kinds[e.pointerId] = e.pointerType;
      var evs = g.down(e.pointerId, p.x, p.y, nowMs(), { claim: claim, cam: camMode(e) });
      try { el.setPointerCapture(e.pointerId); } catch (er) {}
      if (g.ptrs.length === 1) armLong(); else clearTimeout(lpTimer);
      dispatch(evs);
      if (e.pointerType === 'mouse') e.preventDefault();       /* no text selection / drag ghost */
    }
    function onMove(e) {
      if (disposed || !g.has(e.pointerId)) return;
      var p = local(e), before = g.state;
      var evs = g.move(e.pointerId, p.x, p.y, nowMs());
      if (g.state !== 'press') clearTimeout(lpTimer);
      dispatch(evs);
      if (g.state === 'camera' || g.state === 'drag' || g.state === 'multi' || before === 'multi') { if (e.cancelable) e.preventDefault(); }
    }
    function onUp(e) {
      if (disposed || !g.has(e.pointerId)) return;
      var p = local(e);
      clearTimeout(lpTimer);
      dispatch(g.up(e.pointerId, p.x, p.y, nowMs()));
      try { el.releasePointerCapture(e.pointerId); } catch (er) {}
      delete kinds[e.pointerId];
    }
    function onCancel(e) {
      if (disposed || !g.has(e.pointerId)) return;
      clearTimeout(lpTimer);
      dispatch(g.cancel(e.pointerId));
      delete kinds[e.pointerId];
    }
    /* capture lost while the finger is still down: the canvas was re-parented (the host redrew its
       page around the persistent stage) — take the capture back and carry on; only when that is
       impossible (the element left the page, the pointer is gone) is the gesture cancelled */
    function onLost(e) {
      if (disposed || !g.has(e.pointerId)) return;      /* after pointerup / pointercancel: nothing to do */
      if (el.isConnected !== false && typeof el.setPointerCapture === 'function') {
        try { el.setPointerCapture(e.pointerId); } catch (er) {}
        var kept = false;
        try { kept = typeof el.hasPointerCapture === 'function' ? !!el.hasPointerCapture(e.pointerId) : false; } catch (er2) { kept = false; }
        if (kept) return;
      }
      onCancel(e);
    }
    function onWheel(e) {
      if (!enabled || disposed) return;
      call('input');
      var dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1);
      if (!dy) return;
      var p = local(e), n = ndcOf(p.x, p.y), f = rig.groundAt(n.x, n.y, TARGET_Y, {});   /* target height: the point stays put */
      var changed = rig.zoomBy(Math.exp(-clamp(dy, -240, 240) * 0.0015), f);
      if (changed) { e.preventDefault(); call('camera'); }     /* at a zoom limit the page scrolls on */
    }
    function onContext(e) { e.preventDefault(); }
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onCancel);
    el.addEventListener('lostpointercapture', onLost);
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('contextmenu', onContext);

    var KEYMAP = { '[': 'left', ']': 'right', '+': 'in', '=': 'in', '-': 'out', '_': 'out', '0': 'reset', Home: 'reset' };
    return {
      gesture: g,
      /* keyboard (call from a keydown listener on the camera buttons) → true when handled */
      key: function (e) {
        if (!enabled || disposed || e.altKey || e.ctrlKey || e.metaKey) return false;
        var cmd = KEYMAP[e.key] || null;
        if (!cmd) {
          if (e.key === 'ArrowLeft') cmd = e.shiftKey ? 'panL' : 'left';
          else if (e.key === 'ArrowRight') cmd = e.shiftKey ? 'panR' : 'right';
          else if (e.key === 'ArrowUp') cmd = e.shiftKey ? 'panU' : 'up';
          else if (e.key === 'ArrowDown') cmd = e.shiftKey ? 'panD' : 'down';
        }
        if (!cmd) return false;
        rig.command(cmd);
        call('input'); call('camera');
        return true;
      },
      setEnabled: function (on) { enabled = !!on; if (!enabled) { clearTimeout(lpTimer); dispatch(g.cancelAll()); } },
      cancel: function () { clearTimeout(lpTimer); dispatch(g.cancelAll()); },
      busy: function () { return g.active(); },
      dispose: function () {
        if (disposed) return;
        disposed = true;
        clearTimeout(lpTimer);
        el.removeEventListener('pointerdown', onDown);
        el.removeEventListener('pointermove', onMove);
        el.removeEventListener('pointerup', onUp);
        el.removeEventListener('pointercancel', onCancel);
        el.removeEventListener('lostpointercapture', onLost);
        el.removeEventListener('wheel', onWheel, { passive: false });
        el.removeEventListener('contextmenu', onContext);
      }
    };
  }

  return {
    VERSION: VERSION, LIMITS: LIMITS, TARGET_Y: TARGET_Y, DEG_PER_PX: DEG_PER_PX,
    clamp: clamp, lerp: lerp, damp: damp, wrapDeg: wrapDeg,
    boundsOf: boundsOf, fitDist: fitDist, basisInto: basisInto, panDelta: panDelta, panLimit: panLimit,
    isPhone: isPhone, zoomMaxFor: zoomMaxFor, projectPose: projectPose, groundAt: groundAt,
    Rig: Rig, Gesture: Gesture, Controls: Controls,
    create: function (o) { return new Rig(o); }
  };
}));
