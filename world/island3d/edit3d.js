/* ================================================================
   My Island 3D — the edit / placement overlay (island chunk 11;
   classic script, THREE comes from the kit K).
   window.SLEdit3D in the browser (also SL3D.makeEdit(opts) once the
   stage is ready); require() in Node returns the same object, whose
   PURE helpers (cell states and styles, pulses, the ghost pose, the
   dash pattern, screen → NDC, the flight curve) run without THREE.
   Rules never live here: which cells are land, valid or an entrance
   comes from the view (SLWorldCore.canPlace via rewards-world).

   var edit = SLEdit3D.create(K, SL3D, {scene, reduced, camera?, canvas?, fx?, items?, sfx?, jitter?})
     (scene given → scene.add(edit.group) is done for you)
     edit.show(cells, state)          the cell overlay: ONE instanced mesh of rounded (dashed) squares, the
                                      ONLY grid on the organic island (play mode has none). The squares sit
                                      at pad height + 0.012 (terrain pads are exactly SLGrid3D.surfaceY, so
                                      they lie flush); the overlay fades in over 0.2 s when it appears (a cut
                                      under reduced motion) and hides at once
        cells  the land to outline: a land set {'c,r': 1} | ['c,r', …] | [{c, r}] | a world |
               region names ['home', 'cove'] | null (keep the last land)
        state  null | 'edit' | 'grid'                → every land cell white dashed (0.55) over a faint
                                                       Cloud White 0.07 wash (GRID_WASH): the buildable
                                                       zone reads as a lighter quilt over the island
               the placement {id, uid, x, y, ok, reason, cells, entrance} (view.placing merged with
               C.canPlace) → footprint valid (Success 0.45, Neon Cyan edge) or invalid (Error 0.42,
               pulsing at 1.5 Hz), entrance cells Star Gold 0.25 (dashed), the rest white dashed
               'valid' | 'invalid' | 'entrance' | 'select' | 'none' → every given cell in that state
               {'c,r': state} | [{c, r, state}]         → explicit per-cell states
     edit.ghost(id, st, x, y, valid)  the item's own template as a ghost: lifted 0.25 u, wobbling ±4° at
                                      3 Hz (still under reduced motion), 0.85 opacity with a gold rim glow
                                      (0.5 and a grey tint when invalid), a blob shadow at 70 % of the
                                      usual 0.22; it glides between cells (also over the sea, where its
                                      cells read invalid). ghost(null) removes it. The controller hides the
                                      real copy of an item being moved (ItemBatch.hide) as before.
     edit.select(uid | null)          the selected copy's selection hull turns Star Gold and pulses 0.02 ↔
                                      0.03 u at 1.5 Hz (MID/HIGH, via the batch + K.setSelPulse; architecture
                                      has no other hull), plus a gold footprint ring on every tier (LOW has
                                      no hulls)
     edit.drop(uid[, target])         after a confirmed placement: the copy falls 1.2 u (0.22 s inQuad),
                                      squashes (y 0.8 / xz 1.12, 0.08 s), rebounds outBack (0.25 s) and
                                      kicks up a 6-puff dust ring (SLMotion 'dropIn'); reduced: a sparkle.
                                      The batch copy is hidden while a borrowed copy animates, then shown
                                      again (so idles / acts writing its root never fight the drop). A uid
                                      the sync has not added yet is retried for 0.3 s, then gets dust only.
     edit.store(uid, toScreenPos[, target])   the copy shrinks into a sparkle that flies to the tray
                                      (SLMotion 'store'); reduced: a sparkle at the item. The batch copy is
                                      hidden for 0.75 s and re-shown if the sync has not removed it.
     edit.hide()                      overlay, ghost and selection off (running drops / stores finish)
     edit.update(dt, t?, camera?) → animating   call once per frame; without it the overlay ticks
                                      itself from its own meshes' onBeforeRender (one frame late)
     edit.bind({items, fx, camera, canvas, sfx}) · edit.ghostPos(outV3) → Vector3 | null ·
     edit.setReduced(on) · edit.info() · edit.dispose()
   items   how a placed copy is found (the controller's batch lookup):
           function (uid) → ItemBatch | {batch} | null, or an object with batchOf(uid) / get(uid)
   target  drop / store without items: {batch} | {pos: [x, y, z], id, fp}
   toScreenPos  Element | {x, y} canvas CSS px | {clientX, clientY} | {ndcX, ndcY} |
           Vector3 / [x, y, z] (a world point) | function () → one of these | null (bottom centre)
   fx      an SLFx3D instance for dust / sparkles / the flight sparkle (else a private one is made)
   sfx     (name, vol, step) → plays the drop's 'chip' + 'pop' and the store's 'whoosh' (else silent)
   jitter  (uid, id) → the copy's placement jitter ({yaw, sx, sy, sz, lean, leanAxis}), so a borrowed
           drop / store copy stands exactly like the batch copy (the controller knows the neighbours);
           default SLIslandLook.jitter2(uid, id)

   COST: the overlay is one draw call (custom ShaderMaterial: rounded-square SDF, dashes along each
   side, the grid wash, the 1.5 Hz pulse and the fade from uniforms — no per-frame buffer writes) and
   no program of its own: it draws through fx3d's sprite program (SLFx3D.overlayProgram, uPass 1), which
   play mode has compiled already, so entering edit mode compiles nothing for it; the ghost is the template's parts
   with transparent K.variant materials (+ one blob); drops / stores borrow a K.instantiate copy for
   0.55 / 0.75 s. Nothing allocates per frame.
   ================================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root, require('./grid3d.js'), require('./motion.js'), require('../world-look.js'), require('../world-core.js'),
      function () { return require('./fx3d.js'); });
  } else {
    root.SLEdit3D = factory(root, null, null, null, null, null);
  }
}(typeof self !== 'undefined' ? self : typeof globalThis !== 'undefined' ? globalThis : this, function (root, G0, M0, L0, C0, F0) {
  'use strict';

  var VERSION = 1;
  var PI = Math.PI, TAU = PI * 2, DEG = PI / 180;
  var MAX_FLASH_HZ = 2;

  /* lazy lookups, so script order never matters in the browser */
  function grid() { return G0 || root.SLGrid3D || null; }
  function motion() { return M0 || root.SLMotion || null; }
  function look() { return L0 || root.SLIslandLook || null; }
  function core() { return C0 || root.SLWorldCore || null; }
  function fxModule() { try { return (F0 && F0()) || root.SLFx3D || null; } catch (e) { return root.SLFx3D || null; } }
  /* the cell overlay draws through fx3d's sprite program (SLFx3D.overlayProgram joins CELL_VERT / CELL_FRAG
     with the fx sprite shader, uPass 1 = a cell): no program of its own; null without fx3d */
  function cellProgram() {
    var F = fxModule();
    return F && typeof F.overlayProgram === 'function' ? F.overlayProgram(CELL_VERT, CELL_FRAG) : null;
  }

  /* world-look EDIT (fallback copy for a standalone kit) */
  var EDIT_FALLBACK = {
    grid: { token: 'Cloud White', opacity: 0.55 },
    valid: { token: 'Success', opacity: 0.45, edge: 'Neon Cyan' },
    invalid: { token: 'Error', opacity: 0.42, hz: 1.5 },
    entrance: { token: 'Star Gold', opacity: 0.25 },
    selected: { token: 'Star Gold', hz: 1.5 },
    ghost: { opacity: 0.85, invalidOpacity: 0.5, lift: 0.25, wobbleDeg: 4, wobbleRate: 3, shadow: 0.7 },
    tiltDeg: 62
  };
  function editConst() { var L = look(); return (L && L.EDIT) || EDIT_FALLBACK; }

  /* overlay geometry (u): a cell outline is 0.9 square (a 0.1 gap between neighbours) */
  var CELL = { half: 0.45, radius: 0.14, width: 0.045, lift: 0.012, ringInset: 0.04, ringRadius: 0.2, ringWidth: 0.06,
    dashPerU: 3, duty: 0.5, margin: 0.06 };
  /* v2: the faint wash inside every plain grid square (the only grid on the organic island) and
     the overlay's fade-in when it appears */
  var GRID_WASH = { token: 'Cloud White', opacity: 0.07 };
  var FADE_SEC = 0.2;
  var SEA_Y = -0.32;
  var GREY = [0.62, 0.62, 0.66];        /* the invalid ghost's tint */
  var GHOST_RIM = { strength: 0.85, pulse: 0.35, power: 1.8 };

  /* ---------------- maths ---------------- */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function safeHz(hz) { return hz > MAX_FLASH_HZ ? MAX_FLASH_HZ : hz < 0 ? 0 : hz; }
  function inQuad(t) { return t * t; }
  function outBack(t) { var c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }
  function inBack(t) { var c1 = 1.70158, c3 = c1 + 1; return c3 * t * t * t - c1 * t * t; }

  /* ================================================================
     CELL STATES (pure)
     ================================================================ */
  var STATE_NAMES = ['grid', 'valid', 'invalid', 'entrance', 'select'];
  var STATE_ALIAS = { edit: 'grid', white: 'grid', free: 'grid', land: 'grid', dashed: 'grid', ok: 'valid', good: 'valid',
    bad: 'invalid', blocked: 'invalid', error: 'invalid', door: 'entrance', entry: 'entrance', selected: 'select', ring: 'select' };
  /* → a state name, null (= remove the cell) or undefined (= unknown, ignored) */
  function normState(s) {
    if (s === null || s === false || s === 'none' || s === 'off' || s === 'hidden') return null;
    if (s === true) return 'grid';
    if (typeof s !== 'string') return undefined;
    var k = STATE_ALIAS[s] || s;
    return STATE_NAMES.indexOf(k) >= 0 ? k : undefined;
  }
  /* the look of each state (tokens + opacities from SLIslandLook.EDIT) */
  function stateStyle(s) {
    var E = editConst(), Eg = E.grid || EDIT_FALLBACK.grid, Ev = E.valid || EDIT_FALLBACK.valid,
      Ei = E.invalid || EDIT_FALLBACK.invalid, Ee = E.entrance || EDIT_FALLBACK.entrance, Es = E.selected || EDIT_FALLBACK.selected;
    switch (normState(s)) {
      case 'valid': return { fill: Ev.token, fillA: Ev.opacity, edge: Ev.edge || 'Neon Cyan', edgeA: 0.95, dashed: 0, pulse: 0, width: 0.055, hz: 0 };
      case 'invalid': return { fill: Ei.token, fillA: Ei.opacity, edge: Ei.token, edgeA: 0.85, dashed: 0, pulse: 1, width: 0.055, hz: safeHz(Ei.hz || 1.5) };
      case 'entrance': return { fill: Ee.token, fillA: Ee.opacity, edge: Ee.token, edgeA: 0.8, dashed: 1, pulse: 0, width: 0.045, hz: 0 };
      case 'select': return { fill: Es.token, fillA: 0.12, edge: Es.token, edgeA: 0.95, dashed: 0, pulse: 1, width: CELL.ringWidth, hz: safeHz(Es.hz || 1.5) };
      /* the grid square has no fill of its own: the shader lays the shared GRID_WASH inside it */
      default: return { fill: null, fillA: 0, edge: Eg.token, edgeA: Eg.opacity, dashed: 1, pulse: 0, width: CELL.width, hz: 0,
        wash: GRID_WASH.token, washA: GRID_WASH.opacity };
    }
  }
  /* the overlay's opacity t s after it appeared: 0 → 1 over FADE_SEC (reduced motion: already 1) */
  function overlayFade(t, reduced) { return reduced ? 1 : clamp01(t / FADE_SEC); }
  var KEY_RE = /^-?\d+,-?\d+$/;
  function keyOf(e) {
    if (typeof e === 'string') return KEY_RE.test(e) ? e : null;
    if (!e || typeof e !== 'object') return null;
    if (typeof e.key === 'string' && KEY_RE.test(e.key)) return e.key;
    var c = e.c != null ? e.c : e.x, r = e.r != null ? e.r : e.y;
    return typeof c === 'number' && typeof r === 'number' && isFinite(c) && isFinite(r) ? Math.round(c) + ',' + Math.round(r) : null;
  }
  /* any accepted 'cells' form → {key: 1}; null when nothing usable was given */
  function landKeys(cells) {
    if (cells == null) return null;
    var out = {}, C = core(), i, k;
    if (Array.isArray(cells)) {
      for (i = 0; i < cells.length; i++) {
        var e = cells[i];
        if (typeof e === 'string' && C && C.REGION_CELLS && C.REGION_CELLS[e]) { C.REGION_CELLS[e].forEach(function (rk) { out[rk] = 1; }); continue; }
        k = keyOf(e);
        if (k) out[k] = 1;
      }
      return out;
    }
    if (typeof cells === 'object') {
      if (cells.owned && Array.isArray(cells.placed) && C && typeof C.landSet === 'function') return C.landSet(cells);
      for (k in cells) if (Object.prototype.hasOwnProperty.call(cells, k) && cells[k] && KEY_RE.test(k)) out[k] = 1;
      return out;
    }
    return null;
  }
  function isPlacement(s) {
    return !!s && typeof s === 'object' && !Array.isArray(s) &&
      ('ok' in s || Array.isArray(s.cells) || (typeof s.id === 'string' && typeof s.x === 'number' && typeof s.y === 'number'));
  }
  function fpOfDefault(id) {
    var C = core(), it = null;
    try { it = C && typeof C.item === 'function' ? C.item(id) : null; } catch (e) { it = null; }
    return it && Array.isArray(it.fp) ? it.fp : [1, 1];
  }
  function fpKeys(id, x, y, fpOf) {
    var fp = (fpOf || fpOfDefault)(id) || [1, 1], out = [];
    for (var dy = 0; dy < fp[1]; dy++) for (var dx = 0; dx < fp[0]; dx++) out.push((x + dx) + ',' + (y + dy));
    return out;
  }
  /* cells + state → [{key, c, r, s, land}] sorted by row, then column (deterministic draw order).
     o: {land: {key: 1} (default: landKeys(cells)), fpOf(id) → [w, h]} */
  function cellStates(cells, state, o) {
    o = o || {};
    var land = o.land || landKeys(cells) || {}, out = {}, keys = Object.keys(land), i, k, s;
    for (i = 0; i < keys.length; i++) out[keys[i]] = 'grid';
    if (typeof state === 'string' || typeof state === 'boolean') {
      s = normState(state);
      if (s === null) out = {};
      else if (s) for (i = 0; i < keys.length; i++) out[keys[i]] = s;
    } else if (Array.isArray(state)) {
      for (i = 0; i < state.length; i++) {
        k = keyOf(state[i]);
        if (!k) continue;
        s = normState(state[i].s != null ? state[i].s : state[i].state);
        if (s === null) delete out[k]; else if (s) out[k] = s;
      }
    } else if (isPlacement(state)) {
      var fp = Array.isArray(state.cells) && state.cells.length ? state.cells.map(String).filter(function (q) { return KEY_RE.test(q); })
        : fpKeys(state.id, state.x | 0, state.y | 0, o.fpOf);
      var bad = state.ok === false || (state.ok == null && !!state.reason);
      for (i = 0; i < fp.length; i++) out[fp[i]] = bad ? 'invalid' : 'valid';
      if (!bad && Array.isArray(state.entrance)) {
        for (i = 0; i < state.entrance.length; i++) {
          k = String(state.entrance[i]);
          if (KEY_RE.test(k) && out[k] !== 'valid') out[k] = 'entrance';
        }
      }
    } else if (state && typeof state === 'object') {
      for (k in state) {
        if (!Object.prototype.hasOwnProperty.call(state, k) || !KEY_RE.test(k)) continue;
        s = normState(state[k]);
        if (s === null) delete out[k]; else if (s) out[k] = s;
      }
    }
    return Object.keys(out).map(function (q) {
      var p = q.split(',');
      return { key: q, c: +p[0], r: +p[1], s: out[q], land: !!land[q] };
    }).sort(function (a, b) { return a.r - b.r || a.c - b.c; });
  }
  /* the overlay's alpha pulse for pulsing states (invalid, selected): 1 → 0.6 → 1 at hz (≤ 2) */
  function cellPulse(t, hz, reduced) {
    if (reduced) return 1;
    return 1 - 0.4 * (0.5 - 0.5 * Math.cos(TAU * safeHz(hz == null ? 1.5 : hz) * t));
  }
  /* K.setSelPulse value: 0..1 at hz (the hull grows 0.018 → 0.03 u); reduced = a still middle */
  function selPulse(t, hz, reduced) {
    if (reduced) return 0.5;
    return 0.5 - 0.5 * Math.cos(TAU * safeHz(hz == null ? 1.5 : hz) * t);
  }
  /* the dashed outline, as the shader draws it: s = distance along a side of length len from a
     corner; dashes are centred on both corners (a solid L there) and spaced evenly between */
  function dashOn(s, len, perU, duty) {
    var n = Math.max(2, Math.round(len * (perU || CELL.dashPerU)));
    var x = s / len * n + 0.5, k = Math.abs(x - Math.floor(x) - 0.5);
    return k <= (duty == null ? CELL.duty : duty) * 0.5;
  }
  /* the ghost: lift, wobble (deg) and look; reduced → still */
  function ghostPose(t, valid, reduced, out) {
    out = out || {};
    var G = editConst().ghost || EDIT_FALLBACK.ghost;
    out.lift = G.lift != null ? G.lift : 0.25;
    out.opacity = valid === false ? (G.invalidOpacity != null ? G.invalidOpacity : 0.5) : (G.opacity != null ? G.opacity : 0.85);
    out.grey = valid === false ? 1 : 0;
    if (reduced) { out.rx = 0; out.rz = 0; out.dy = 0; return out; }
    var deg = G.wobbleDeg != null ? G.wobbleDeg : 4, w = TAU * (G.wobbleRate || 3) * t;
    out.rz = deg * Math.sin(w);
    out.rx = deg * 0.35 * Math.sin(w * 0.5 + 1.1);
    out.dy = 0.025 * Math.sin(TAU * t);
    return out;
  }
  /* the gold rim strength on the ghost: a gentle 1.5 Hz breath */
  function rimPulse(t, reduced) {
    return reduced ? GHOST_RIM.strength : GHOST_RIM.strength - GHOST_RIM.pulse * (0.5 - 0.5 * Math.cos(TAU * 1.5 * t));
  }
  /* an item's footprint centre on the grid: (x + w/2 − 8, y + h/2 − 5) */
  function footCenter(fp, x, y, out) {
    out = out || {};
    out.x = x + fp[0] / 2 - 8; out.z = y + fp[1] / 2 - 5;
    return out;
  }
  /* the ground under a footprint: the highest cell top (terraces on land, the sea elsewhere) */
  function groundOf(fp, x, y, land) {
    var Gr = grid(), top = -Infinity;
    for (var dy = 0; dy < fp[1]; dy++) {
      for (var dx = 0; dx < fp[0]; dx++) {
        var c = x + dx, r = y + dy, h;
        if (land && !land[c + ',' + r]) h = SEA_Y;
        else h = Gr && typeof Gr.surfaceY === 'function' ? Gr.surfaceY(c, r) : 0;
        if (h > top) top = h;
      }
    }
    return top === -Infinity ? 0 : top;
  }
  function cellTopOf(c, r, onLand) {
    if (!onLand) return SEA_Y;
    var Gr = grid();
    return Gr && typeof Gr.surfaceY === 'function' ? Gr.surfaceY(c, r) : 0;
  }
  /* toScreenPos → NDC {x, y} (or {world: true, wx, wy, wz} for a world point); rect = the canvas'
     getBoundingClientRect(). The tray may sit below the stage, so NDC is clamped to ±1.4, not ±1. */
  function toNdc(spec, rect, out) {
    out = out || {};
    out.world = false; out.x = 0; out.y = -1.15;
    if (typeof spec === 'function') { try { spec = spec(); } catch (e) { spec = null; } }
    if (spec == null) return out;
    var cx = null, cy = null, local = false;
    if (typeof spec.ndcX === 'number') { out.x = clamp(spec.ndcX, -1.4, 1.4); out.y = clamp(+spec.ndcY || 0, -1.4, 1.4); return out; }
    if (spec.isVector3 || (Array.isArray(spec) && spec.length >= 3) || (typeof spec.z === 'number' && typeof spec.x === 'number')) {
      out.world = true;
      out.wx = Array.isArray(spec) ? +spec[0] : spec.x; out.wy = Array.isArray(spec) ? +spec[1] : spec.y; out.wz = Array.isArray(spec) ? +spec[2] : spec.z;
      return out;
    }
    if (typeof spec.getBoundingClientRect === 'function') {
      var b = spec.getBoundingClientRect();
      cx = b.left + b.width / 2; cy = b.top + b.height / 2;
    } else if (typeof spec.clientX === 'number') { cx = spec.clientX; cy = +spec.clientY || 0; }
    else if (typeof spec.x === 'number' && typeof spec.y === 'number') { cx = spec.x; cy = spec.y; local = true; }
    if (cx === null || !rect || !(rect.width > 0) || !(rect.height > 0)) return out;
    var lx = local ? cx : cx - rect.left, ly = local ? cy : cy - rect.top;
    out.x = clamp(lx / rect.width * 2 - 1, -1.4, 1.4);
    out.y = clamp(1 - ly / rect.height * 2, -1.4, 1.4);
    return out;
  }
  /* the store sparkle's path: a quadratic arc from `from` to `to`, raised by `arc` at the middle */
  function flightPoint(u, from, to, arc, out) {
    out = out || {};
    var v = 1 - u, mx = (from[0] + to[0]) / 2, my = (from[1] + to[1]) / 2 + arc, mz = (from[2] + to[2]) / 2;
    out.x = v * v * from[0] + 2 * v * u * mx + u * u * to[0];
    out.y = v * v * from[1] + 2 * v * u * my + u * u * to[1];
    out.z = v * v * from[2] + 2 * v * u * mz + u * u * to[2];
    return out;
  }
  /* SLMotion's 'dropIn' and 'store' with a local copy of the same curves when motion.js is absent */
  function dropPose(t, reduced, out) {
    var M = motion();
    if (M && M.ACTS && M.ACTS.dropIn) return M.sample('dropIn', t, out, { reduced: !!reduced });
    out = out || {};
    out.dy = 0; out.sy = 1; out.sxz = 1; out.a = 1;
    if (reduced) { out.a = clamp01(t / 0.15); return out; }
    if (t < 0.22) out.dy = 1.2 * (1 - inQuad(clamp01(t / 0.22)));
    else if (t < 0.30) { out.sy = 0.8; out.sxz = 1.12; }
    else if (t < 0.55) { var e = outBack((t - 0.30) / 0.25); out.sy = 0.8 + 0.2 * e; out.sxz = 1.12 - 0.12 * e; }
    return out;
  }
  function storePose(t, reduced, out) {
    var M = motion();
    if (M && M.ACTS && M.ACTS.store) return M.sample('store', t, out, { reduced: !!reduced });
    out = out || {};
    if (reduced) { var r = clamp01(t / 0.3); out.s = 1 - r; out.flight = r; out.a = 1 - r; return out; }
    out.s = t < 0.25 ? 1 - inBack(clamp01(t / 0.25)) : 0;
    var f = clamp01((t - 0.25) / 0.5);
    out.flight = t < 0.25 ? 0 : 1 - (1 - f) * (1 - f);
    out.a = t < 0.25 ? 1 : 1 - f;
    return out;
  }
  function durOf(name, reduced) {
    var M = motion();
    if (M && typeof M.durOf === 'function' && M.ACTS && M.ACTS[name]) return M.durOf(name, { reduced: !!reduced });
    return name === 'dropIn' ? (reduced ? 0.15 : 0.55) : (reduced ? 0.3 : 0.75);
  }

  /* ================================================================
     SHADER — the cell overlay (rounded-square SDF, dashed sides, a uniform pulse)
       iPos   xyz centre on the cell top, w = corner radius (u)
       iShape half x, half z (u), stroke width (u), flags (1 dashed + 2 pulsing)
       iFill  rgb (linear) + alpha    iEdge  rgb + alpha
       uWash  the faint fill of a dashed square with no fill of its own (the grid state)
       uFade  the whole overlay's opacity (the 0.2 s fade-in)
     ================================================================ */
  var CELL_VERT = [
    '#include <common>',
    '#include <fog_pars_vertex>',
    'attribute vec4 iPos;',
    'attribute vec4 iShape;',
    'attribute vec4 iFill;',
    'attribute vec4 iEdge;',
    'uniform float uMargin;',
    'varying vec2 vP;',
    'varying vec4 vShape;',
    'varying vec4 vFill;',
    'varying vec4 vEdge;',
    'varying float vR;',
    'void main() {',
    '  vec2 p = position.xy * 2.0 * (iShape.xy + uMargin);',
    '  vP = p; vShape = iShape; vFill = iFill; vEdge = iEdge; vR = iPos.w;',
    '  vec4 mvPosition = modelViewMatrix * vec4(iPos.x + p.x, iPos.y, iPos.z - p.y, 1.0);',
    '  gl_Position = projectionMatrix * mvPosition;',
    '  #include <fog_vertex>',
    '}'
  ].join('\n');
  var CELL_FRAG = [
    '#include <common>',
    '#include <fog_pars_fragment>',
    'uniform float uTime;',
    'uniform float uPulse;',
    'uniform float uHz;',
    'uniform float uDashPerU;',
    'uniform float uDuty;',
    'uniform float uWash;',
    'uniform float uFade;',
    'varying vec2 vP;',
    'varying vec4 vShape;',
    'varying vec4 vFill;',
    'varying vec4 vEdge;',
    'varying float vR;',
    'float sdRound(vec2 p, vec2 b, float r) {',
    '  vec2 q = abs(p) - b + r;',
    '  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;',
    '}',
    'void main() {',
    '  vec2 b = vShape.xy;',
    '  float w = vShape.z;',
    '  float dashed = mod(vShape.w, 2.0);',
    '  float pulsing = step(1.5, vShape.w);',
    '  float d = sdRound(vP, b, vR);',
    '  float aa = max(fwidth(d), 1e-4);',
    '  float inside = 1.0 - smoothstep(-aa, aa, d);',
    '  float band = 1.0 - smoothstep(w * 0.5 - aa, w * 0.5 + aa, abs(d + w * 0.5));',
    '  if (dashed > 0.5) {',
    /* the side nearest this pixel; s runs 0 → len between its corners; dashes centre on corners */
    '    vec2 ap = abs(vP);',
    '    bool vert = (ap.x - b.x) > (ap.y - b.y);',
    '    float len = vert ? 2.0 * b.y : 2.0 * b.x;',
    '    float s = (vert ? vP.y : vP.x) + 0.5 * len;',
    '    float n = max(2.0, floor(len * uDashPerU + 0.5));',
    '    float x = s / len * n;',
    '    float k = abs(fract(x + 0.5) - 0.5);',
    '    float kw = max(fwidth(x), 1e-4);',
    '    band *= 1.0 - smoothstep(uDuty * 0.5 - kw, uDuty * 0.5 + kw, k);',
    '  }',
    '  float pulse = 1.0 - pulsing * uPulse * 0.4 * (0.5 - 0.5 * cos(6.28318530718 * uHz * uTime));',
    '  float own = vFill.a > 0.0 ? vFill.a : uWash * dashed;',
    '  float ea = vEdge.a * band * pulse;',
    '  float fa = own * inside * pulse;',
    '  float a = ea + fa * (1.0 - ea);',
    '  if (a * uFade < 0.003) discard;',
    '  vec3 col = (vEdge.rgb * ea + vFill.rgb * fa * (1.0 - ea)) / a;',
    '  #ifdef USE_FOG',
    '    #ifdef FOG_EXP2',
    '      float fogF = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);',
    '    #else',
    '      float fogF = smoothstep(fogNear, fogFar, vFogDepth);',
    '    #endif',
    '    col = mix(col, fogColor, fogF);',
    '  #endif',
    '  gl_FragColor = vec4(col, a * uFade);',
    '  #include <colorspace_fragment>',
    '}'
  ].join('\n');

  /* ================================================================
     create(K, SL3D, opts) → edit   (browser; THREE comes from K.THREE)
     ================================================================ */
  var CAP_CELLS = 200;          /* 16 × 10 grid + off-land footprints + entrances + the ring */
  var MAX_TRANS = 6;            /* concurrent drops / stores */

  function create(K, SL3D, opts) {
    if (!K || !K.THREE || typeof K.col !== 'function') throw new Error('SLEdit3D.create needs the kit K');
    opts = opts || {};
    var T = K.THREE;
    var perfNow = root.performance && typeof root.performance.now === 'function' ? function () { return root.performance.now(); } : Date.now;
    var state = {
      reduced: !!opts.reduced, t: 0, disposed: false,
      camera: opts.camera && opts.camera.isCamera ? opts.camera : null, canvas: opts.canvas || null,
      items: opts.items || null, fx: opts.fx || null, sfx: typeof opts.sfx === 'function' ? opts.sfx : null,
      jitter: typeof opts.jitter === 'function' ? opts.jitter : null,
      extAt: -1e9, selfAt: 0, pulseOn: false, fadeT: FADE_SEC
    };
    var privFx = null;

    /* scratch (nothing below allocates per frame) */
    var _v = new T.Vector3(), _v2 = new T.Vector3(), _gp = {}, _fp = {};
    var WHITE = new T.Color(1, 1, 1), GREY_C = new T.Color(GREY[0], GREY[1], GREY[2]);

    var group = new T.Group();
    group.name = 'edit3d';

    function note(where, e) {
      if (SL3D && SL3D.issues && typeof SL3D.issues.push === 'function') SL3D.issues.push('edit3d ' + where + ': ' + (e && e.message ? e.message : e));
    }
    var colCache = new Map();
    function colorOf(tok) {
      var c = colCache.get(tok);
      if (!c) { c = K.col(tok); colCache.set(tok, c); }
      return c;
    }
    var STYLE = {};
    STATE_NAMES.forEach(function (s) { STYLE[s] = stateStyle(s); });

    /* self-ticking: every mesh edit3d owns calls this from onBeforeRender (deduplicated per frame) */
    function hook(renderer, scene, camera) {
      if (state.disposed) return;
      if (renderer && renderer.domElement && !state.canvas) state.canvas = renderer.domElement;
      if (camera && camera.isCamera && !state.camera) state.camera = camera;
      var now = perfNow();
      if (now - state.extAt < 250) return;                    /* update() is driving us */
      if (state.selfAt && now - state.selfAt < 4) return;      /* already ticked this frame */
      var dt = state.selfAt ? Math.min(0.1, (now - state.selfAt) / 1000) : 1 / 60;
      state.selfAt = now;
      try { tick(dt, camera && camera.isCamera ? camera : state.camera, true); } catch (e) { note('tick', e); }
    }
    function hookAll(obj) {
      obj.traverse(function (o) { if (o.isMesh) o.onBeforeRender = hook; });
    }

    /* ================================================================
       THE OVERLAY — one instanced mesh
       ================================================================ */
    var cg = new T.InstancedBufferGeometry();
    cg.setIndex([0, 1, 2, 2, 1, 3]);
    cg.setAttribute('position', new T.BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 0]), 3));
    var aPos = new T.InstancedBufferAttribute(new Float32Array(CAP_CELLS * 4), 4);
    var aShape = new T.InstancedBufferAttribute(new Float32Array(CAP_CELLS * 4), 4);
    var aFill = new T.InstancedBufferAttribute(new Float32Array(CAP_CELLS * 4), 4);
    var aEdge = new T.InstancedBufferAttribute(new Float32Array(CAP_CELLS * 4), 4);
    cg.setAttribute('iPos', aPos); cg.setAttribute('iShape', aShape); cg.setAttribute('iFill', aFill); cg.setAttribute('iEdge', aEdge);
    cg.instanceCount = 0;
    var cu = T.UniformsUtils.merge([T.UniformsLib.fog, {
      uTime: { value: 0 }, uPulse: { value: state.reduced ? 0 : 1 }, uHz: { value: STYLE.invalid.hz || 1.5 },
      uMargin: { value: CELL.margin }, uDashPerU: { value: CELL.dashPerU }, uDuty: { value: CELL.duty },
      uWash: { value: GRID_WASH.opacity }, uFade: { value: 1 }
    }]);
    /* fx3d's sprite program (see cellProgram): uPass picks the cell pass, and uMap binds the sprite
       sampler to a real texture (this pass never samples it) */
    var CP = cellProgram();
    if (CP) {
      cu.uPass = { value: CP.pass.cell };
      try { cu.uMap = { value: K.tex && typeof K.tex.sparkles === 'function' ? K.tex.sparkles() : null }; } catch (e) { cu.uMap = { value: null }; }
    }
    var cm = new T.ShaderMaterial({
      name: 'edit3d:cells', uniforms: cu, vertexShader: CP ? CP.vert : CELL_VERT, fragmentShader: CP ? CP.frag : CELL_FRAG,
      transparent: true, depthWrite: false, depthTest: true, fog: true, toneMapped: false,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4
    });
    var cellsMesh = new T.Mesh(cg, cm);
    cellsMesh.name = 'edit3d:cells'; cellsMesh.frustumCulled = false; cellsMesh.renderOrder = 1; cellsMesh.visible = false;
    cellsMesh.onBeforeRender = hook;
    group.add(cellsMesh);

    var ov = { list: [], land: null, sig: '', ring: null, n: 0 };
    function writeInst(k, x, y, z, hx, hz, radius, st) {
      var o = k * 4, f = st.fill ? colorOf(st.fill) : st.wash ? colorOf(st.wash) : WHITE, e = colorOf(st.edge);
      aPos.array[o] = x; aPos.array[o + 1] = y; aPos.array[o + 2] = z; aPos.array[o + 3] = radius;
      aShape.array[o] = hx; aShape.array[o + 1] = hz; aShape.array[o + 2] = st.width; aShape.array[o + 3] = (st.dashed ? 1 : 0) + (st.pulse ? 2 : 0);
      aFill.array[o] = f.r; aFill.array[o + 1] = f.g; aFill.array[o + 2] = f.b; aFill.array[o + 3] = st.fill ? st.fillA : 0;
      aEdge.array[o] = e.r; aEdge.array[o + 1] = e.g; aEdge.array[o + 2] = e.b; aEdge.array[o + 3] = st.edgeA;
    }
    function rebuildOverlay() {
      var n = 0, L = ov.list, was = ov.n;
      for (var i = 0; i < L.length && n < CAP_CELLS - 1; i++) {
        var q = L[i];
        writeInst(n++, q.c - 7.5, cellTopOf(q.c, q.r, q.land) + CELL.lift, q.r - 4.5, CELL.half, CELL.half, CELL.radius, STYLE[q.s] || STYLE.grid);
      }
      var R = ov.ring;
      if (R) writeInst(n++, R.x, R.y + CELL.lift * 1.5, R.z, R.hx, R.hz, CELL.ringRadius, STYLE.select);
      /* the grid appearing fades in (tick advances it); reduced motion shows it at once */
      if (!was && n) { state.fadeT = 0; cu.uFade.value = overlayFade(0, state.reduced); }
      ov.n = n;
      cg.instanceCount = n;
      cellsMesh.visible = n > 0;
      aPos.needsUpdate = true; aShape.needsUpdate = true; aFill.needsUpdate = true; aEdge.needsUpdate = true;
    }

    function show(cells, st) {
      if (state.disposed) return;
      var land = landKeys(cells);
      if (land) ov.land = land;
      if (!ov.land) { var Gr = grid(); ov.land = Gr && typeof Gr.landFrom === 'function' ? safeLand(Gr) : {}; }
      var list;
      try { list = cellStates(null, st == null ? 'grid' : st, { land: ov.land }); } catch (e) { note('show', e); list = []; }
      /* a cheap signature: sync() calls this every time, the buffers change only when the states do */
      var sig = '';
      for (var i = 0; i < list.length; i++) sig += list[i].key + list[i].s.charAt(0) + (list[i].land ? '' : '~') + ';';
      ov.list = list;
      if (sig !== ov.sig) { ov.sig = sig; rebuildOverlay(); }
      else if (!cellsMesh.visible && ov.n > 0) cellsMesh.visible = true;
      state.pulseOn = hasPulse();
    }
    function safeLand(Gr) { try { return Gr.landFrom(); } catch (e) { return {}; } }
    function hasPulse() {
      if (ov.ring) return true;
      for (var i = 0; i < ov.list.length; i++) if (STYLE[ov.list[i].s] && STYLE[ov.list[i].s].pulse) return true;
      return false;
    }
    function hideOverlay() {
      ov.list = []; ov.sig = '';
      rebuildOverlay();
    }

    /* ================================================================
       ITEMS — finding a placed copy's batch
       ================================================================ */
    function batchOf(uid, target) {
      if (target && target.batch && typeof target.batch.has === 'function') return target.batch;
      if (target && typeof target.has === 'function' && typeof target.worldPos === 'function') return target;
      var it = state.items, b = null;
      try {
        if (typeof it === 'function') b = it(uid);
        else if (it && typeof it.batchOf === 'function') b = it.batchOf(uid);
        else if (it && typeof it.get === 'function') b = it.get(uid);
      } catch (e) { b = null; }
      if (b && b.batch) b = b.batch;
      return b && typeof b.has === 'function' && b.has(uid) ? b : null;
    }
    function modelMaterial(id) {
      var m = SL3D && SL3D.models ? SL3D.models[id] : null;
      return m && typeof m.material === 'function' ? m.material : null;
    }
    /* the copy's placement jitter in degrees and per-axis scale (the host's, else jitter2 without
       neighbours, else the v1 grid jitter) → {yaw, sx, sy, sz, lean, leanAxis} */
    var _jt = { yaw: 0, sx: 1, sy: 1, sz: 1, lean: 0, leanAxis: 0 };
    function jitterOf(uid, id) {
      var j = null, L = look(), Gr = grid();
      try {
        if (state.jitter) j = state.jitter(uid, id);
        if (!j && L && typeof L.jitter2 === 'function') j = L.jitter2(uid, id, null);
        if (!j && Gr && typeof Gr.jitter === 'function') { var g = Gr.jitter(uid, id); j = { yaw: g.yawDeg, sx: g.scale, sy: g.scale, sz: g.scale }; }
      } catch (e) { j = null; }
      function num(v, d) { return typeof v === 'number' && isFinite(v) ? v : d; }
      _jt.yaw = num(j && j.yaw, 0); _jt.lean = num(j && j.lean, 0); _jt.leanAxis = num(j && j.leanAxis, 0);
      var s = num(j && j.scale, 1);
      _jt.sx = num(j && j.sx, s); _jt.sy = num(j && j.sy, s); _jt.sz = num(j && j.sz, s);
      return _jt;
    }
    function fxNow() {
      if (state.fx) return state.fx;
      if (!privFx && root.SLFx3D && typeof root.SLFx3D.create === 'function') {
        try { privFx = root.SLFx3D.create(K, SL3D, { scene: group, camera: state.camera, reduced: state.reduced }); } catch (e) { note('fx', e); privFx = null; }
      }
      return privFx;
    }
    function emit(kind, x, y, z, n, o) {
      var f = fxNow();
      if (!f) return;
      _v2.set(x, y, z);
      try { f.emit(kind, _v2, n, o); } catch (e) { note('emit', e); }
    }
    function sfx(name, vol) { if (state.sfx) { try { state.sfx(name, vol == null ? 1 : vol); } catch (e) {} } }

    /* ================================================================
       THE GHOST
       ================================================================ */
    var ghostU = { uGhostRim: { value: K.col('Star Gold') }, uGhostRimK: { value: GHOST_RIM.strength } };
    function ghostToonPatch(shader) {
      var base = K.mat('toon');
      if (base && typeof base.onBeforeCompile === 'function') base.onBeforeCompile(shader);    /* the shared rim */
      shader.uniforms.uGhostRim = ghostU.uGhostRim;
      shader.uniforms.uGhostRimK = ghostU.uGhostRimK;
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uGhostRim;\nuniform float uGhostRimK;')
        .replace('#include <opaque_fragment>',
          'outgoingLight += uGhostRim * pow(1.0 - clamp(dot(normal, geometryViewDir), 0.0, 1.0), ' + GHOST_RIM.power.toFixed(2) +
          ') * uGhostRimK;\n#include <opaque_fragment>');
    }
    function ghostToonKey() { return 'encore-toon-ghost'; }
    var ghostMats = new Map();       /* variant → {opacity, color} at rest */
    function ghostMat(mk) {
      mk = mk || 'toon';
      if (/^(glow|line|outline)(:|$)/.test(mk) || mk === 'blob') return K.mat(mk);
      var base = K.mat(mk), bo = base && base.opacity != null ? base.opacity : 1;
      var patch = { transparent: true, depthWrite: true, opacity: bo * 0.85 };
      if (mk === 'toon') { patch.onBeforeCompile = ghostToonPatch; patch.customProgramCacheKey = ghostToonKey; }
      var v = K.variant(mk, 'edit3d-ghost', patch);
      if (!ghostMats.has(v)) ghostMats.set(v, { opacity: bo, color: v.color ? v.color.clone() : null });
      return v;
    }
    function ghostLook(valid) {
      var G = editConst().ghost || EDIT_FALLBACK.ghost, k = valid ? (G.opacity || 0.85) : (G.invalidOpacity || 0.5);
      ghostMats.forEach(function (rest, v) {
        v.opacity = rest.opacity * k;
        if (rest.color && v.color) { v.color.copy(rest.color); if (!valid) v.color.multiply(GREY_C); }
      });
    }

    var GH = { obj: null, key: '', id: null, fp: [1, 1], x: 0, y: 0, valid: true, pos: new T.Vector3(), to: new T.Vector3(),
      ground: 0, toGround: 0, fresh: true, blob: null,
      last: { on: false, x: 0, y: 0, z: 0 } };     /* where the last ghost stood (a drop's fallback dust) */
    function resolveSt(id, st) {
      var L = look();
      try { if (L && typeof L.resolveStyle === 'function' && L.LOOK && L.LOOK[id]) return L.resolveStyle(id, st || {}); } catch (e) {}
      return st || {};
    }
    function removeGhost() {
      if (GH.obj) {
        try { GH.obj.userData.dispose(); } catch (e) {}
        if (GH.obj.parent) GH.obj.parent.remove(GH.obj);
        GH.obj = null;
      }
      GH.key = ''; GH.id = null;
      if (GH.blob) GH.blob.mesh.visible = false;
    }
    function ghost(id, st, x, y, valid) {
      if (state.disposed) return;
      if (!id) { removeGhost(); refreshPulse(); return; }
      var rs = resolveSt(id, st), key;
      try { key = id + '#' + K.stateKey(id, rs); } catch (e) { key = id + '#'; }
      if (key !== GH.key || !GH.obj) {
        removeGhost();
        try {
          var tpl = K.templates.get(id, K.stateKey(id, rs), K.tier, rs);
          var mm = modelMaterial(id);
          var obj = K.instantiate(tpl, {
            outlines: false, castShadow: false,
            material: function (mk, part) { var m = mm ? mm(mk, part) : null; return m || ghostMat(mk); }
          });
          obj.name = 'edit3d:ghost';
          obj.traverse(function (o) { if (o.isMesh) { o.renderOrder = 3; o.castShadow = false; o.receiveShadow = false; } });
          hookAll(obj);
          group.add(obj);
          GH.obj = obj; GH.key = key; GH.id = id; GH.fresh = true;
        } catch (e) { note('ghost', e); removeGhost(); return; }
      }
      GH.x = x | 0; GH.y = y | 0;
      GH.fp = fpOfDefault(id);
      footCenter(GH.fp, GH.x, GH.y, _fp);
      GH.toGround = groundOf(GH.fp, GH.x, GH.y, ov.land);
      GH.to.set(_fp.x, GH.toGround, _fp.z);
      GH.last.on = true; GH.last.x = _fp.x; GH.last.y = GH.toGround; GH.last.z = _fp.z;
      if (GH.fresh || state.reduced) { GH.pos.copy(GH.to); GH.ground = GH.toGround; GH.fresh = false; }
      GH.valid = valid !== false;
      ghostLook(GH.valid);
      placeGhost(0);
      refreshPulse();
    }
    function ensureBlob() {
      if (GH.blob || typeof K.blobs !== 'function') return GH.blob;
      try {
        GH.blob = K.blobs(1);
        var G = editConst().ghost || EDIT_FALLBACK.ghost;
        GH.blob.mesh.material = K.variant('blob', 'edit3d-ghost', { opacity: 0.22 * (G.shadow != null ? G.shadow : 0.7) });
        GH.blob.mesh.renderOrder = 2; GH.blob.mesh.name = 'edit3d:ghost-blob';
        GH.blob.mesh.onBeforeRender = hook;
        group.add(GH.blob.mesh);
        GH.blob.alloc();
      } catch (e) { note('blob', e); GH.blob = null; }
      return GH.blob;
    }
    /* position the ghost for this frame (glide toward its cell, lift, wobble) */
    function placeGhost(dt) {
      if (!GH.obj) return;
      if (dt > 0) {
        var k = state.reduced ? 1 : 1 - Math.exp(-18 * dt);
        GH.pos.lerp(GH.to, k);
        GH.ground += (GH.toGround - GH.ground) * k;
      }
      ghostPose(state.t, GH.valid, state.reduced, _gp);
      GH.obj.position.set(GH.pos.x, GH.ground + _gp.lift + _gp.dy, GH.pos.z);
      GH.obj.rotation.set(_gp.rx * DEG, 0, _gp.rz * DEG);
      var b = ensureBlob();
      if (b) {
        b.mesh.visible = true;
        b.set(0, GH.pos.x, GH.ground, GH.pos.z, GH.fp[0] * 0.9 * 0.9, GH.fp[1] * 0.9 * 0.9);
        b.commit();
      }
      ghostU.uGhostRimK.value = rimPulse(state.t, state.reduced);
    }

    /* ================================================================
       SELECTION — the batch hull (MID/HIGH) + a gold footprint ring (every tier)
       ================================================================ */
    var SEL = { uid: null, batch: null };
    function select(uid) {
      if (state.disposed) return;
      uid = uid == null || uid === '' ? null : uid;
      if (SEL.batch && SEL.uid != null && SEL.batch.has(SEL.uid)) { try { SEL.batch.setHighlight(SEL.uid, 0); } catch (e) {} }
      SEL.uid = uid; SEL.batch = uid != null ? batchOf(uid) : null;
      if (SEL.batch) { try { SEL.batch.setHighlight(uid, 2); } catch (e) {} }
      updateRing(true);
      refreshPulse();
    }
    /* the ring follows the selected copy (it may move or be rebuilt on a restyle); compared by
       value so the per-frame check allocates nothing */
    var RING = { x: 0, y: 0, z: 0, hx: 0, hz: 0 };
    function updateRing(force) {
      var found = false, hx = 0, hz = 0;
      if (SEL.uid != null) {
        if (!SEL.batch || !SEL.batch.has(SEL.uid)) {
          SEL.batch = batchOf(SEL.uid);
          if (SEL.batch) { try { SEL.batch.setHighlight(SEL.uid, 2); } catch (e) {} }
        }
        if (SEL.batch) {
          SEL.batch.worldPos(SEL.uid, _v);
          var fp = SEL.batch.fp || [1, 1];
          hx = fp[0] / 2 - CELL.ringInset; hz = fp[1] / 2 - CELL.ringInset;
          found = true;
        }
      }
      var same = found ? (ov.ring === RING && RING.x === _v.x && RING.y === _v.y && RING.z === _v.z && RING.hx === hx && RING.hz === hz) : !ov.ring;
      if (same && !force) return;
      if (found) { RING.x = _v.x; RING.y = _v.y; RING.z = _v.z; RING.hx = hx; RING.hz = hz; ov.ring = RING; }
      else ov.ring = null;
      rebuildOverlay();
      state.pulseOn = hasPulse();
    }
    /* the shared hull pulse (K.setSelPulse) breathes only while something is selected or placed */
    var pulseSet = false, canPulse = typeof K.setSelPulse === 'function';
    function refreshPulse() {
      if (!canPulse) return;
      var on = !!(SEL.batch || GH.obj);
      if (on) { K.setSelPulse(selPulse(state.t, STYLE.select.hz, state.reduced)); pulseSet = true; }
      else if (pulseSet) { K.setSelPulse(0); pulseSet = false; }
    }

    /* ================================================================
       TRANSITIONS — drop-in and store (borrowed K.instantiate copies)
       ================================================================ */
    var TR = [];
    for (var ti = 0; ti < MAX_TRANS; ti++) {
      TR.push({ on: false, type: '', uid: null, batch: null, copy: null, t: 0, dur: 0, cue: false, wait: 0,
        base: new T.Vector3(), top: new T.Vector3(), yaw: 0, sx: 1, sy: 1, sz: 1, fp: [1, 1], ndc: { x: 0, y: -1.15, world: false },
        from: [0, 0, 0], to: [0, 0, 0], trail: 0, key: 'edit3d:flight:' + ti, ghostPos: null });
    }
    var _out = {}, _fl = {}, _flightOpt = { cell: 'sparkle', token: 'Star Gold', size: 0.4, alpha: 1, glow: true };
    var _dustOpt = { radius: 0.5 };
    function slot() {
      for (var i = 0; i < TR.length; i++) if (!TR[i].on) return TR[i];
      finish(TR[0]);                                     /* all busy: complete the oldest at once */
      return TR[0];
    }
    function busyWith(uid) { for (var i = 0; i < TR.length; i++) if (TR[i].on && TR[i].uid === uid) finish(TR[i]); }
    /* a standalone copy of the batch's template where the placed copy stands, turned, leaned and
       scaled exactly like it (the kit's jitter quaternion) */
    var _jq = [0, 0, 0, 1];
    function borrow(tr, b, uid) {
      var tpl = b.template, mm = modelMaterial(tpl.id);
      var obj = K.instantiate(tpl, { castShadow: false, material: mm ? function (mk, part) { return mm(mk, part); } : undefined });
      obj.name = 'edit3d:' + tr.type;
      b.worldPos(uid, tr.base);
      var j = jitterOf(uid, tpl.id), KitApi = root.SLKit;
      tr.yaw = j.yaw * DEG; tr.sx = j.sx; tr.sy = j.sy; tr.sz = j.sz;
      tr.fp = b.fp || [1, 1];
      b.anchorWorld(uid, 'top', tr.top);
      obj.position.copy(tr.base);
      if (KitApi && typeof KitApi.jitterQuat === 'function' && obj.quaternion) {
        KitApi.jitterQuat(j.yaw, j.lean, j.leanAxis, _jq);
        obj.quaternion.set(_jq[0], _jq[1], _jq[2], _jq[3]);
      } else obj.rotation.set(0, tr.yaw, 0);
      obj.scale.set(tr.sx, tr.sy, tr.sz);
      hookAll(obj);
      group.add(obj);
      tr.copy = obj;
      return obj;
    }
    function giveBack(tr) {
      if (tr.copy) {
        try { tr.copy.userData.dispose(); } catch (e) {}
        if (tr.copy.parent) tr.copy.parent.remove(tr.copy);
        tr.copy = null;
      }
      if (tr.batch && tr.uid != null && tr.batch.has(tr.uid)) {
        try { tr.batch.show(tr.uid); tr.batch.commit(); } catch (e) {}
      }
    }
    function finish(tr) {
      if (!tr.on) return;
      if (tr.type === 'store') flightMark(tr, false);
      giveBack(tr);
      tr.on = false; tr.batch = null; tr.uid = null;
    }

    function drop(uid, target) {
      if (state.disposed || uid == null) return false;
      busyWith(uid);
      var tr = slot();
      tr.on = true; tr.type = 'drop'; tr.uid = uid; tr.t = 0; tr.cue = false; tr.wait = 0; tr.copy = null;
      tr.batch = batchOf(uid, target);
      tr.ghostPos = target && target.pos ? target.pos : null;
      tr.dur = durOf('dropIn', state.reduced);
      if (tr.batch) startDrop(tr);
      return true;
    }
    function startDrop(tr) {
      var b = tr.batch;
      if (state.reduced) {
        /* reduced: the item is simply there; a few still sparkles mark it */
        b.anchorWorld(tr.uid, 'top', tr.top);
        emit('sparkle', tr.top.x, tr.top.y, tr.top.z, 4, null);
        sfx('chip'); sfx('pop');
        tr.on = false; tr.batch = null;
        return;
      }
      try {
        borrow(tr, b, tr.uid);
        b.hide(tr.uid); b.commit();
      } catch (e) { note('drop', e); giveBack(tr); tr.on = false; }
    }
    /* no batch yet (the sync may land a frame later): retry briefly, then dust where the ghost was */
    function dropWithout(tr, dt) {
      tr.wait += dt;
      var b = batchOf(tr.uid, null);
      if (b) { tr.batch = b; startDrop(tr); return; }
      if (tr.wait < 0.3) return;
      var p = tr.ghostPos;
      if (p) { _v.set(+p[0] || 0, +p[1] || 0, +p[2] || 0); }
      else if (GH.last.on) _v.set(GH.last.x, GH.last.y, GH.last.z);
      else { tr.on = false; return; }
      emit(state.reduced ? 'sparkle' : 'dust', _v.x, _v.y + 0.04, _v.z, state.reduced ? 4 : 6, state.reduced ? null : _dustOpt);
      tr.on = false;
    }
    function stepDrop(tr, dt) {
      if (!tr.batch) { dropWithout(tr, dt); return; }
      if (!tr.copy) { tr.on = false; return; }
      tr.t += dt;
      dropPose(Math.min(tr.t, tr.dur), false, _out);
      tr.copy.position.set(tr.base.x, tr.base.y + _out.dy, tr.base.z);
      tr.copy.scale.set(tr.sx * _out.sxz, tr.sy * _out.sy, tr.sz * _out.sxz);
      if (!tr.cue && tr.t >= 0.22) {
        tr.cue = true;
        _dustOpt.radius = Math.max(tr.fp[0], tr.fp[1]) * 0.5;
        emit('dust', tr.base.x, tr.base.y + 0.04, tr.base.z, 6, _dustOpt);
        sfx('chip'); sfx('pop');
      }
      if (tr.t >= tr.dur) finish(tr);
    }

    function store(uid, toScreenPos, target) {
      if (state.disposed || uid == null) return false;
      busyWith(uid);
      var b = batchOf(uid, target);
      if (!b) {
        /* nothing to shrink: a sparkle where we were told it stood */
        if (target && target.pos) emit('sparkle', +target.pos[0] || 0, (+target.pos[1] || 0) + 0.5, +target.pos[2] || 0, 6, null);
        return false;
      }
      var tr = slot();
      tr.on = true; tr.type = 'store'; tr.uid = uid; tr.batch = b; tr.t = 0; tr.cue = false; tr.trail = 0; tr.copy = null;
      tr.dur = durOf('store', state.reduced);
      var rect = null, cv = canvasEl();
      try { rect = cv && typeof cv.getBoundingClientRect === 'function' ? cv.getBoundingClientRect() : null; } catch (e) { rect = null; }
      toNdc(toScreenPos, rect, tr.ndc);
      if (state.reduced) {
        b.anchorWorld(uid, 'top', tr.top);
        emit('sparkle', tr.top.x, tr.top.y, tr.top.z, 6, null);
        sfx('whoosh', 0.6);
        tr.on = false; tr.batch = null;
        return true;
      }
      try {
        borrow(tr, b, uid);
        b.hide(uid); b.commit();
      } catch (e) { note('store', e); giveBack(tr); tr.on = false; return false; }
      tr.from[0] = tr.top.x; tr.from[1] = tr.top.y; tr.from[2] = tr.top.z;
      sfx('whoosh', 0.6);
      return true;
    }
    function canvasEl() {
      if (state.canvas) return state.canvas;
      try { return root.document ? root.document.querySelector('canvas.slw-3dcanvas') : null; } catch (e) { return null; }
    }
    /* where the flight ends this frame: the tray's screen point, 45 % of the way to the camera */
    function flightTarget(tr, camera) {
      if (tr.ndc.world) { tr.to[0] = tr.ndc.wx; tr.to[1] = tr.ndc.wy; tr.to[2] = tr.ndc.wz; return; }
      if (!camera) { tr.to[0] = tr.from[0]; tr.to[1] = tr.from[1] + 2.5; tr.to[2] = tr.from[2] + 1.5; return; }
      camera.updateMatrixWorld();
      _v.set(tr.ndc.x, tr.ndc.y, 0.5).unproject(camera);
      _v2.setFromMatrixPosition(camera.matrixWorld);
      _v.sub(_v2).normalize();
      var dist = Math.sqrt((tr.from[0] - _v2.x) * (tr.from[0] - _v2.x) + (tr.from[1] - _v2.y) * (tr.from[1] - _v2.y) +
        (tr.from[2] - _v2.z) * (tr.from[2] - _v2.z)) * 0.45;
      tr.to[0] = _v2.x + _v.x * dist; tr.to[1] = _v2.y + _v.y * dist; tr.to[2] = _v2.z + _v.z * dist;
    }
    function flightMark(tr, on, x, y, z, size, alpha) {
      var f = fxNow();
      if (!f || typeof f.mark !== 'function') return;
      if (!on) { f.mark(tr.key, false); return; }
      _flightOpt.size = size; _flightOpt.alpha = alpha;
      _v2.set(x, y, z);
      f.mark(tr.key, true, _v2, _flightOpt);
    }
    function stepStore(tr, dt, camera) {
      tr.t += dt;
      storePose(Math.min(tr.t, tr.dur), false, _out);
      if (tr.copy) {
        var s = Math.max(0.001, _out.s);
        tr.copy.scale.set(s * tr.sx, s * tr.sy, s * tr.sz);
        if (_out.s <= 0.001 && tr.t >= 0.25) { tr.copy.userData.dispose(); if (tr.copy.parent) tr.copy.parent.remove(tr.copy); tr.copy = null; }
      }
      if (!tr.cue && tr.t >= 0.25) {
        tr.cue = true;
        emit('sparkle', tr.from[0], tr.from[1], tr.from[2], 6, null);
      }
      if (_out.flight > 0 && tr.t < tr.dur) {
        flightTarget(tr, camera);
        flightPoint(_out.flight, tr.from, tr.to, 0.8, _fl);
        flightMark(tr, true, _fl.x, _fl.y, _fl.z, 0.42 - 0.22 * _out.flight, clamp01(_out.a + 0.15));
        tr.trail += dt;
        if (tr.trail >= 0.035) { tr.trail = 0; emit('trail', _fl.x, _fl.y, _fl.z, 1, null); }
      }
      if (tr.t >= tr.dur) finish(tr);
    }

    /* ================================================================
       THE FRAME
       ================================================================ */
    function tick(dt, camera, inRender) {
      if (state.disposed) return false;
      state.t += dt;
      if (camera && camera.isCamera) state.camera = camera;
      cu.uTime.value = state.t;
      var anim = false;
      if (state.fadeT < FADE_SEC) {                     /* the grid's 0.2 s fade-in */
        state.fadeT = state.reduced ? FADE_SEC : state.fadeT + dt;
        cu.uFade.value = overlayFade(state.fadeT, state.reduced);
        if (state.fadeT < FADE_SEC) anim = true;
      }
      if (GH.obj) {
        placeGhost(dt);
        if (inRender) GH.obj.updateMatrixWorld(true);
        anim = !state.reduced;
      }
      if (SEL.uid != null) updateRing(false);
      refreshPulse();
      var busy = false;
      for (var i = 0; i < TR.length; i++) {
        var tr = TR[i];
        if (!tr.on) continue;
        if (tr.type === 'drop') stepDrop(tr, dt); else stepStore(tr, dt, camera || state.camera);
        if (tr.copy && inRender) tr.copy.updateMatrixWorld(true);
        busy = true;
      }
      if (privFx && privFx.update(dt, camera || state.camera)) busy = true;
      /* while something is in flight the (possibly empty) overlay stays in the render list, so a
         self-ticking overlay keeps ticking (an empty instanced draw issues no GL draw call) */
      cellsMesh.visible = ov.n > 0 || busy;
      if (busy) anim = true;
      if (state.pulseOn && !state.reduced && ov.n > 0) anim = true;
      if ((SEL.batch || GH.obj) && !state.reduced) anim = true;
      return anim;
    }
    function update(dt, t, camera) {
      if (state.disposed) return false;
      if (t && t.isCamera) { camera = t; t = null; }
      state.extAt = perfNow();
      dt = dt > 0 ? Math.min(dt, 0.1) : 0;
      try { return tick(dt, camera, false); } catch (e) { note('update', e); return false; }
    }

    /* ================================================================
       public API
       ================================================================ */
    function hide() {
      if (state.disposed) return;
      select(null);
      removeGhost();
      hideOverlay();
      refreshPulse();
    }
    function bind(o) {
      if (!o) return;
      if (o.items !== undefined) state.items = o.items;
      if (o.fx !== undefined) state.fx = o.fx;
      if (o.camera && o.camera.isCamera) state.camera = o.camera;
      if (o.canvas) state.canvas = o.canvas;
      if (o.sfx !== undefined) state.sfx = typeof o.sfx === 'function' ? o.sfx : null;
      if (o.jitter !== undefined) state.jitter = typeof o.jitter === 'function' ? o.jitter : null;
      if (SEL.uid != null && !SEL.batch) select(SEL.uid);
    }
    function setReduced(on) {
      state.reduced = !!on;
      cu.uPulse.value = state.reduced ? 0 : 1;
      if (state.reduced) { state.fadeT = FADE_SEC; cu.uFade.value = 1; }
      if (privFx) privFx.setReduced(state.reduced);
      if (GH.obj) { GH.pos.copy(GH.to); GH.ground = GH.toGround; placeGhost(0); }
      if (state.reduced) for (var i = 0; i < TR.length; i++) finish(TR[i]);
      refreshPulse();
    }
    function ghostPos(out) {
      if (!GH.obj) return null;
      out = out || new T.Vector3();
      return out.copy(GH.obj.position);
    }
    function info() {
      var busy = 0;
      for (var i = 0; i < TR.length; i++) if (TR[i].on) busy++;
      return {
        cells: ov.list.length, instances: ov.n, ring: !!ov.ring, ghost: GH.id, ghostValid: GH.valid, selected: SEL.uid,
        selectedFound: !!SEL.batch, transitions: busy, reduced: state.reduced, driven: perfNow() - state.extAt < 250,
        privateFx: !!privFx, fade: Math.round(cu.uFade.value * 1000) / 1000
      };
    }
    function dispose() {
      if (state.disposed) return;
      for (var i = 0; i < TR.length; i++) finish(TR[i]);
      if (SEL.batch && SEL.uid != null && SEL.batch.has(SEL.uid)) { try { SEL.batch.setHighlight(SEL.uid, 0); } catch (e) {} }
      SEL.uid = null; SEL.batch = null;
      removeGhost();
      if (pulseSet) { K.setSelPulse(0); pulseSet = false; }
      state.disposed = true;
      if (GH.blob) { GH.blob.dispose(); GH.blob = null; }
      if (privFx) { privFx.dispose(); privFx = null; }
      cg.dispose(); cm.dispose();
      if (group.parent) group.parent.remove(group);
      colCache.clear(); ghostMats.clear();
      state.items = null; state.fx = null; state.camera = null; state.canvas = null;
    }

    if (opts.scene && typeof opts.scene.add === 'function') opts.scene.add(group);

    return {
      group: group,
      show: show, ghost: ghost, select: select, drop: drop, store: store, hide: hide,
      update: update, bind: bind, setReduced: setReduced, ghostPos: ghostPos, info: info, dispose: dispose,
      get reduced() { return state.reduced; }
    };
  }

  var api = {
    VERSION: VERSION, MAX_FLASH_HZ: MAX_FLASH_HZ, create: create,
    /* data (read-only use) */
    CELL: CELL, STATE_NAMES: STATE_NAMES, EDIT_FALLBACK: EDIT_FALLBACK, GHOST_RIM: GHOST_RIM, CAP_CELLS: CAP_CELLS,
    GRID_WASH: GRID_WASH, FADE_SEC: FADE_SEC,
    /* pure helpers */
    normState: normState, stateStyle: stateStyle, overlayFade: overlayFade, landKeys: landKeys, cellStates: cellStates, isPlacement: isPlacement,
    cellPulse: cellPulse, selPulse: selPulse, rimPulse: rimPulse, dashOn: dashOn, ghostPose: ghostPose,
    footCenter: footCenter, groundOf: groundOf, toNdc: toNdc, flightPoint: flightPoint, dropPose: dropPose, storePose: storePose,
    SHADERS: { CELL_VERT: CELL_VERT, CELL_FRAG: CELL_FRAG }
  };

  /* the stage registry: SL3D.makeEdit(opts) → create(K, SL3D, opts) once the stage is ready */
  if (root && root.SL3D && typeof root.SL3D.defineApi === 'function') {
    try {
      root.SL3D.defineApi('makeEdit', function (K, S) { return function (o) { o = o || {}; return create(o.K || K, S, o); }; });
    } catch (e) { /* the stage logs its own issues */ }
  }
  return api;
}));
