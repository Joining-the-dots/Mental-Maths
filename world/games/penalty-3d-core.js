/* ================================================================
   Encore Shootout 3D — the pure director (classic UMD; no DOM, no THREE).
   window.SLPenalty3DCore in the browser (the 3D view imports this file for
   its side effect), module.exports in Node tests.

   Everything the view shows that can be worked out from round.state is
   worked out HERE, as plain functions of numbers, so it can be tested and
   so the 3D scene always agrees with the rules in penalty.js:
     cameraShot(v, out)       the camera for any moment (kicker, intro orbit, flight
                              follow, slow-mo push-in, goal punch, replay, results crane,
                              menu orbit) — the view only blends between shot keys
     keeperPose(inp, out)     the goalie-blob: tells, the REACH-true dive, the save glove
                              on the ball, belly-flop, dizzy, wave, the ready pop-up
     ballPose(v, out)         the ball: drop-in, flight (exact endpoint), net, hug,
                              post/bar rebound, the lob to a catching fan
     netBulge(...)            the net's ripple at the hit point (6 Hz spring, 0.6 s)
     crowdLayout(n, seed)     fan blobs in the stands, wand colours and lit order
     presetMix(...)           day → Showtime light/sky/fog mix per stadium
     petStage / avatarStage   which clip the kicker pet / touchline avatar plays
     keeperDance, ledPips, coneAim, menuTell, tweens, easings, colour maths
   World units: goal plane z = 0, +z toward the camera, posts at x ±3,
   bar at y 2.478 (penalty.js MAP). Angles in radians unless named *Deg.
   Spec: docs/island3d/spec-penalty.json → threeDScene / juiceAndAudio.
   ================================================================ */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SLPenalty3DCore = api;
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = 1;
  var PI = Math.PI, TAU = PI * 2, DEG = PI / 180;

  /* ---------------- easing + small maths ---------------- */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function frac(v) { return v - Math.floor(v); }
  function smooth(a, b, x) { var u = clamp01((x - a) / (b - a)); return u * u * (3 - 2 * u); }
  function inOutSine(u) { u = clamp01(u); return -(Math.cos(PI * u) - 1) / 2; }
  function outQuad(u) { u = clamp01(u); return 1 - (1 - u) * (1 - u); }
  function inQuad(u) { u = clamp01(u); return u * u; }
  function outBack(u) { u = clamp01(u); var c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2); }
  function outElastic(u) {
    u = clamp01(u);
    if (u === 0 || u === 1) return u;
    return Math.pow(2, -10 * u) * Math.sin((u * 10 - 0.75) * (TAU / 3)) + 1;
  }
  function arc(u) { u = clamp01(u); return 4 * u * (1 - u); }
  function sign(v) { return v < 0 ? -1 : v > 0 ? 1 : 0; }
  function num(v, d) { return typeof v === 'number' && isFinite(v) ? v : d; }

  /* ---------------- shared numbers (mirrors penalty.js; a test keeps them equal) ---------------- */
  var T = {
    READY: 0.9, INTRO: 2.0, INTRO_SKIP: 0.6, GUARD: 0.15, NUDGE: 4.0, AUTOLOCK: 6.0,
    WINDUP: 0.25, HITSTOP: 0.07, FLIGHT: 0.62, DIVE: 0.5, SLOW_F0: 0.60, SLOW_F1: 0.88, SLOW: 0.3,
    RESULT: 2.0, RESULT_REPLAY: 2.4, SKIP_AFTER: 0.8, LEAN_RATE: 1.2, BEAT: 60 / 112
  };
  var U = 230 / 3, MID = 480, LINE = 340;
  function lx2u(x) { return (x - MID) / U; }
  function ly2u(y) { return (LINE - y) / U; }
  var REACH_U = {
    stay: { x0: lx2u(MID - 88), x1: lx2u(MID + 88), y1: ly2u(172) },
    left: { x0: lx2u(268), x1: lx2u(MID - 40), y1: ly2u(206) },
    right: { x0: lx2u(MID + 40), x1: lx2u(692), y1: ly2u(206) }
  };
  var GEO = {
    POST: 3.0, BAR: ly2u(150), POST_R: 0.07, BALL_R: 0.11,
    NET_DEPTH: 1.2, NET_TOP: 2.2, KEEPER_Z: 0.35,
    SPOT: [0, 0.11, 7.5], KICKER: [-0.55, 0, 8.1], STEPBACK: [-0.55, 0, 8.4], RUNUP: [-0.2, 0, 7.75],
    AVATAR: [-3.9, 0, 4.2], AVATAR_YAW: 30 * DEG, PET_SCALE: 1.5, AVATAR_SCALE: 1.5,
    TOWERS: [[-7, 5.5, -5], [7, 5.5, -5], [0, 6.5, -8]],
    LED: [0, 3.6, -6.5]
  };
  /* the goalie-blob: one bean (r 0.42, 1.46 tall) on stubby legs; puff gloves r 0.2 */
  var KEEPER = {
    R: 0.42, HALF: 0.31, HALF_H: 0.73, FOOT: 0.12, CY: 0.85, GLOVE_R: 0.2, ARM_R: 0.08, ARM_LEN: 0.35,
    SHOULDER: [0.34, 0.2, 0.06], GLOVE_REST: [0.62, 0.10, 0.15], LEG_X: 0.16,
    DIVE_ROLL_DEG: 75, DIVE_CX: 1.65, DIVE_CY: 1.2, STAY_GLOVE_Y: 2.0, GAP: 0.33
  };
  var CAM = {
    KICK_POS: [0, 2.6, 16], KICK_LOOK: [0, 1.0, 0], FOV: 26, SLOW_FOV: 21, PUNCH: -1.5, PUNCH_SEC: 0.15,
    FLIGHT_Z: 14.5, FOLLOW: 0.4, EASE_BACK: 0.6, SLOW_BACK: 0.4,
    INTRO_POS: [1.4, 1.3, 3.4], INTRO_LOOK: [0, 1.0, 0.35], INTRO_FOV: 30, INTRO_ORBIT_DEG: 6, INTRO_BLEND: 0.6,
    REPLAY_AT: 0.45, REPLAY_RATE: 0.6, REPLAY_FOV: 38,
    RESULTS_POS: [0, 1.9, 9.5], RESULTS_LOOK: [0, 0.9, 2.5], RESULTS_OFFSET: 0.22,
    MENU_LOOK: [0, 0.95, 0.35], MENU_OFFSET: [0, 0.85, 7.4], MENU_YAW_DEG: 14, MENU_HZ: 0.035,
    PORTRAIT_HALF_W: 3.7, PORTRAIT_DIST: 16
  };
  CAM.REPLAY_DUR = T.FLIGHT / CAM.REPLAY_RATE;
  /* presentation rates — every periodic light change stays at or under 2 Hz */
  var RATES = { TWINKLE_HZ: 0.5, WAND_PULSE_HZ: 1, LED_FLASH_HZ: 1, CONE_SWEEP_HZ: 0.12, POST_WOBBLE_HZ: 10, NET_HZ: 6, MAX_FLASH_HZ: 2 };
  var DANCE_BPM = 118;

  /* the marker sweep (same triangle wave as penalty.js) — used only to interpolate between logic steps */
  function tri(ph) { var f = ((ph / TAU) % 1 + 1) % 1; return f < 0.5 ? f * 4 - 1 : 3 - f * 4; }
  function markerX(sweep) { return (222 + 738) / 2 + tri(sweep) * (738 - 222) / 2; }
  function markerY(sweep) { return (126 + 332) / 2 + tri(sweep + PI / 2) * (332 - 126) / 2; }

  /* ================================================================
     CAMERA — cameraShot(v, out)
     v: {mode: 'play'|'menu'|'results'|'demo', lp, shot, intro, phaseT, flight, close,
         resT, replay, res, ex, ey, prevEx, aspect, reduced, t, offY}
     out: {px,py,pz, lx,ly,lz, fov, key, blend, offY, replayF}
     Shot keys: the view blends (blend s) when the key changes, and cuts into and
     out of 'replay'. Inside one key the shot is continuous by construction.
     ================================================================ */
  function portraitFov(aspect) {
    var a = aspect > 0 ? aspect : 16 / 9;
    return Math.max(CAM.FOV, 2 * Math.atan((CAM.PORTRAIT_HALF_W / a) / CAM.PORTRAIT_DIST) / DEG);
  }
  function setShot(out, p, l, fov, key, blend) {
    out.px = p[0]; out.py = p[1]; out.pz = p[2];
    out.lx = l[0]; out.ly = l[1]; out.lz = l[2];
    out.fov = fov; out.key = key; out.blend = blend; out.offY = 0; out.replayF = -1;
    return out;
  }
  function ballX(f, ex) { f = clamp01(f); return ex * f + Math.sin(f * PI) * 0.25 * sign(ex); }
  function replayProgress(resT) { return (resT - CAM.REPLAY_AT) / CAM.REPLAY_DUR; }
  function cameraShot(v, out) {
    out = out || {};
    var base = portraitFov(v.aspect), red = !!v.reduced;
    if (v.mode === 'menu') {
      var a = (red ? 0 : CAM.MENU_YAW_DEG * Math.sin(TAU * CAM.MENU_HZ * num(v.t, 0))) * DEG + 10 * DEG;
      var o = CAM.MENU_OFFSET, L0 = CAM.MENU_LOOK;
      setShot(out, CAM.KICK_POS, L0, base + 4, 'menu', 0.8);
      out.px = L0[0] + o[0] * Math.cos(a) + o[2] * Math.sin(a);
      out.py = L0[1] + o[1];
      out.pz = L0[2] - o[0] * Math.sin(a) + o[2] * Math.cos(a);
      return out;
    }
    if (v.mode === 'results') {
      setShot(out, CAM.RESULTS_POS, CAM.RESULTS_LOOK, base, 'results', 1.2);
      out.offY = num(v.offY, CAM.RESULTS_OFFSET);
      return out;
    }
    setShot(out, CAM.KICK_POS, CAM.KICK_LOOK, base, 'play', 0.35);
    if (v.mode === 'demo') return out;
    var lp = v.lp, pt = num(v.phaseT, 0);
    /* the rival intro: close on the keeper, a slow 6° orbit, then ease into the kicker cam */
    if (lp === 'ready' && v.intro) {
      var k = red ? (pt >= T.INTRO - CAM.INTRO_BLEND ? 1 : 0) : inOutSine((pt - (T.INTRO - CAM.INTRO_BLEND)) / CAM.INTRO_BLEND);
      var ang = red ? 0 : -CAM.INTRO_ORBIT_DEG * DEG * clamp01(pt / T.INTRO);
      var IL = CAM.INTRO_LOOK, ox = CAM.INTRO_POS[0] - IL[0], oy = CAM.INTRO_POS[1] - IL[1], oz = CAM.INTRO_POS[2] - IL[2];
      var ipx = IL[0] + ox * Math.cos(ang) + oz * Math.sin(ang), ipz = IL[2] - ox * Math.sin(ang) + oz * Math.cos(ang);
      out.px = lerp(ipx, out.px, k); out.py = lerp(IL[1] + oy, out.py, k); out.pz = lerp(ipz, out.pz, k);
      out.lx = lerp(IL[0], out.lx, k); out.ly = lerp(IL[1], out.ly, k); out.lz = lerp(IL[2], out.lz, k);
      out.fov = lerp(Math.max(CAM.INTRO_FOV, base), base, k);
      out.key = 'intro'; out.blend = 0;
      return out;
    }
    if (red) return out;                                   /* reduced motion: one still camera */
    var ex = num(v.ex, 0), resT = num(v.resT, 0);
    /* the replay from beside the post on the ball's side (first top corner / final-kick goal) */
    if (lp === 'result' && v.replay && v.res === 'goal') {
      var rp = replayProgress(resT);
      if (rp >= 0 && rp <= 1) {
        var sg = ex < 0 ? -1 : 1;
        out.px = sg * 4.6; out.py = 1.3; out.pz = 2.6;
        out.lx = sg * 1.0; out.ly = 1.2; out.lz = 0.2;
        out.fov = Math.max(CAM.REPLAY_FOV, base);
        out.key = 'replay'; out.blend = 0; out.replayF = clamp01(rp);
        return out;
      }
    }
    var fx = 0, fz = CAM.KICK_POS[2];
    if (lp === 'flight') {
      var f = num(v.flight, 0);
      fx = CAM.FOLLOW * ballX(f, ex); fz = lerp(CAM.KICK_POS[2], CAM.FLIGHT_Z, inOutSine(f));
    } else if (lp === 'result') {
      fx = CAM.FOLLOW * ex; fz = CAM.FLIGHT_Z;
    } else if (lp === 'ready' && v.shot > 0) {
      var kb = inOutSine(pt / CAM.EASE_BACK);
      fx = lerp(CAM.FOLLOW * num(v.prevEx, 0), 0, kb); fz = lerp(CAM.FLIGHT_Z, CAM.KICK_POS[2], kb);
    }
    out.px = fx; out.lx = fx; out.pz = fz;
    /* slow-mo push-in on 'close' kicks, back over 0.4 s; a −1.5° punch on a goal */
    var w = 0;
    if (v.close) {
      if (lp === 'flight') w = smooth(T.SLOW_F0, T.SLOW_F0 + 0.06, num(v.flight, 0));
      else if (lp === 'result') w = 1 - inOutSine(resT / CAM.SLOW_BACK);
    }
    out.fov = base - base * ((CAM.FOV - CAM.SLOW_FOV) / CAM.FOV) * w;
    if (lp === 'result' && v.res === 'goal' && resT < CAM.PUNCH_SEC) out.fov += CAM.PUNCH * Math.sin(PI * clamp01(resT / CAM.PUNCH_SEC));
    return out;
  }

  /* ================================================================
     KEEPER — keeperPose(inp, out)
     inp: {lp ('ready'|'aimX'|'aimY'|'windup'|'strike'|'flight'|'result'|'menu'), tellType,
           tell {lean, crouch, step, hop, gloveL, gloveR, mirror}, dive, clock, phaseT,
           keeperT, resT, res, ex, ey, worried, reduced, bop, intro, shot,
           hasPrev, prevDive, prevRes, prevEx, prevEy}
     out (world units; the view converts gloves into the rig): cx cy cz (body centre),
       roll (+ = top toward −x), bx by (body scale: xz, y), qx qy (squash about the ground),
       gLx gLy gLz gRx gRy gRz (glove centres), gLs gRs (glove scale), legs (rad),
       face 0 calm | 1 confident | 2 worried | 3 dizzy, eye −1..1, glowL glowR 0..1,
       dizzy 0..1, hugX hugY hugZ, visor 0..1, chip (bool), lead 'L'|'R'|'', landed (bool), wave 0..1
     ================================================================ */
  var KZ = GEO.KEEPER_Z;
  var ZERO_TELL = { lean: 0, crouch: 0, step: 0, hop: 0, gloveL: 0, gloveR: 0, mirror: false };
  function resetPose(o) {
    o.cx = 0; o.cy = KEEPER.CY; o.cz = KZ; o.roll = 0; o.bx = 1; o.by = 1; o.qx = 1; o.qy = 1;
    o.gLx = -KEEPER.GLOVE_REST[0]; o.gLy = KEEPER.CY + KEEPER.GLOVE_REST[1]; o.gLz = KZ + KEEPER.GLOVE_REST[2];
    o.gRx = KEEPER.GLOVE_REST[0]; o.gRy = o.gLy; o.gRz = o.gLz; o.gLs = 1; o.gRs = 1;
    o.legs = 0; o.face = 0; o.eye = 0; o.glowL = 0; o.glowR = 0; o.dizzy = 0;
    o.hugX = 0; o.hugY = KEEPER.CY; o.hugZ = KZ + 0.45; o.visor = 0; o.chip = false; o.lead = ''; o.landed = false; o.wave = 0;
    return o;
  }
  /* body-local (relative to the centre, before roll and scale) → world */
  function toWorldX(o, lx, ly) { var c = Math.cos(o.roll), sn = Math.sin(o.roll); return o.cx + (lx * o.bx) * c - (ly * o.by) * sn; }
  function toWorldY(o, lx, ly) { var c = Math.cos(o.roll), sn = Math.sin(o.roll); return o.cy + (lx * o.bx) * sn + (ly * o.by) * c; }
  /* the standing pose with the rival's tell (aim phases, ready, menu) */
  function standing(inp, o) {
    resetPose(o);
    var t = inp.tell || ZERO_TELL, red = !!inp.reduced, clock = num(inp.clock, 0);
    var lean = clamp(num(t.lean, 0), -1, 1), cr = clamp01(num(t.crouch, 0));
    var beatF = frac(clock / T.BEAT);
    var hopY = num(t.hop, 0) * 0.12 * Math.abs(Math.sin(PI * beatF));
    var bounce = (inp.lp === 'ready' && !inp.intro && !red) ? 0.04 * Math.abs(Math.sin(TAU * clock)) : 0;
    var bop = inp.bop && !red ? 0.035 * (1 - beatF) * (1 - beatF) : 0;     /* Bop bops to the 112 BPM beat */
    o.by = (1 - 0.1 * cr) * (1 - bop); o.bx = 1 + 0.08 * cr + bop * 0.5;
    o.cx = num(t.step, 0) + 0.12 * lean;
    o.cy = KEEPER.FOOT + KEEPER.HALF_H * o.by + hopY + bounce;
    o.roll = -lean * 15 * DEG;
    var gl0 = -KEEPER.GLOVE_REST[0], gr0 = KEEPER.GLOVE_REST[0], gy = KEEPER.GLOVE_REST[1], gz = KEEPER.GLOVE_REST[2];
    var lx = gl0, ly = gy, lz = gz, rx = gr0, ry = gy, rz = gz;
    if (lean) {                                            /* the arm on the lean side lifts (~60°) */
      var a = Math.abs(lean);
      if (lean < 0) { lx = -lerp(0.62, 0.66, a); ly = lerp(gy, 0.52, a); } else { rx = lerp(0.62, 0.66, a); ry = lerp(gy, 0.52, a); }
    }
    if (cr) {                                              /* crouch: both gloves forward */
      lx = -lerp(Math.abs(lx), 0.44, cr); rx = lerp(rx, 0.44, cr);
      ly = lerp(ly, -0.08, cr); ry = lerp(ry, -0.08, cr); lz = lerp(lz, 0.42, cr); rz = lerp(rz, 0.42, cr);
    }
    ly += 0.3 * num(t.gloveL, 0); ry += 0.3 * num(t.gloveR, 0);
    o.gLx = toWorldX(o, lx, ly); o.gLy = toWorldY(o, lx, ly); o.gLz = KZ + lz * o.bx;
    o.gRx = toWorldX(o, rx, ry); o.gRy = toWorldY(o, rx, ry); o.gRz = KZ + rz * o.bx;
    o.glowL = clamp01(num(t.gloveL, 0)); o.glowR = clamp01(num(t.gloveR, 0));
    o.gLs = 1 + 0.1 * o.glowL; o.gRs = 1 + 0.1 * o.glowR;
    o.eye = lean;
    o.face = inp.worried ? 2 : 0;
    o.chip = inp.tellType === 'mirror';
    o.hugX = o.cx; o.hugY = o.cy + 0.05; o.hugZ = KZ + 0.45;
    return o;
  }
  /* push glove (gx, gy) at least KEEPER.GAP from the ball so a goal visibly passes out of reach */
  var _gap = { x: 0, y: 0 };
  function keepGap(gx, gy, bx, by, towardX, towardY) {
    var dx = gx - bx, dy = gy - by, d = Math.sqrt(dx * dx + dy * dy);
    if (d >= KEEPER.GAP) { _gap.x = gx; _gap.y = gy; return _gap; }
    if (d < 1e-6) { dx = towardX; dy = towardY; d = Math.sqrt(dx * dx + dy * dy) || 1; }
    _gap.x = bx + dx / d * KEEPER.GAP; _gap.y = by + dy / d * KEEPER.GAP;
    return _gap;
  }
  /* the dive's end pose (keeperT = 1), built from REACH: what you see is what counts */
  function diveEnd(dive, res, ex, ey, o) {
    resetPose(o);
    var dir = dive === 'left' ? -1 : dive === 'right' ? 1 : 0, has = isFinite(ex) && isFinite(ey);
    o.legs = dir ? 0.5 : 0.35;
    if (dir) {
      var box = REACH_U[dive], lead = dir < 0 ? 'L' : 'R';
      var roll = -dir * KEEPER.DIVE_ROLL_DEG * DEG, cx = dir * KEEPER.DIVE_CX, cy = KEEPER.DIVE_CY;
      var lgx = dir * 2.57, lgy = 1.55, lgz = KZ + 0.1, ogx = dir * 2.42, ogy = 1.27, ogz = KZ + 0.05;
      var rx = null, ry = 0;
      var inner = dir < 0 ? box.x1 : box.x0, outer = dir < 0 ? box.x0 : box.x1;
      if (has && res === 'save') { rx = ex; ry = ey; }
      else if (has && res === 'goal' && dir * ex >= Math.abs(inner)) {
        /* the ball beat him on his side (over or beyond his reach): stop at the REACH extreme, never touching it */
        rx = clamp(ex, Math.min(outer - dir * 0.08, inner), Math.max(outer - dir * 0.08, inner));
        ry = Math.min(ey, box.y1 - 0.06);
        var g = keepGap(rx, ry, ex, ey, -dir, -1);
        rx = g.x; ry = g.y;
      }
      if (rx !== null) {
        var mag = lerp(95, 72, clamp01((ry - 0.1) / 1.6)) * DEG;
        roll = -dir * mag;
        var upx = -Math.sin(roll), upy = Math.cos(roll);
        cx = rx - upx * 0.98; cy = Math.max(0.46, ry - upy * 0.98);
        lgx = rx; lgy = ry; lgz = KZ;
        ogx = rx - upx * 0.12; ogy = Math.max(0.22, ry - 0.24); ogz = KZ + 0.06;
      }
      o.cx = cx; o.cy = cy; o.roll = roll; o.lead = lead;
      if (lead === 'L') { o.gLx = lgx; o.gLy = lgy; o.gLz = lgz; o.gRx = ogx; o.gRy = ogy; o.gRz = ogz; }
      else { o.gRx = lgx; o.gRy = lgy; o.gRz = lgz; o.gLx = ogx; o.gLy = ogy; o.gLz = ogz; }
    } else {
      o.cx = 0; o.cy = KEEPER.DIVE_CY; o.roll = 0;
      o.gLx = -0.75; o.gLy = KEEPER.STAY_GLOVE_Y; o.gLz = KZ + 0.1;
      o.gRx = 0.75; o.gRy = KEEPER.STAY_GLOVE_Y; o.gRz = KZ + 0.1;
      var sb = REACH_U.stay;
      if (has && res === 'save') {
        var sg = ex < 0 ? -1 : 1;
        o.lead = sg < 0 ? 'L' : 'R';
        o.cx = clamp(ex * 0.45, -0.5, 0.5); o.cy = clamp(ey - 0.75, KEEPER.CY, 1.25);
        var oX = o.cx - sg * 0.5, oY = clamp(ey + 0.05, 0.5, 2.0);
        if (sg < 0) { o.gLx = ex; o.gLy = ey; o.gLz = KZ; o.gRx = oX; o.gRy = oY; o.gRz = KZ + 0.05; }
        else { o.gRx = ex; o.gRy = ey; o.gRz = KZ; o.gLx = oX; o.gLy = oY; o.gLz = KZ + 0.05; }
      } else if (has && res === 'goal' && Math.abs(ex) <= sb.x1 + 0.25 && ey > sb.y1) {
        /* over his head: fingertips stretch up but stay short of it */
        var sg2 = ex < 0 ? -1 : 1, gx = clamp(ex, sb.x0, sb.x1), gy = Math.min(KEEPER.STAY_GLOVE_Y, ey - KEEPER.GAP - 0.01);
        var g2 = keepGap(gx, gy, ex, ey, 0, -1);
        o.lead = sg2 < 0 ? 'L' : 'R';
        if (sg2 < 0) { o.gLx = g2.x; o.gLy = g2.y; } else { o.gRx = g2.x; o.gRy = g2.y; }
      }
    }
    return o;
  }
  /* glove → body-local (undo the centre and roll) and back with another body pose */
  function rigidGlove(fromO, gx, gy, toO, axis) {
    var dx = gx - fromO.cx, dy = gy - fromO.cy, c = Math.cos(-fromO.roll), sn = Math.sin(-fromO.roll);
    var lx = dx * c - dy * sn, ly = dx * sn + dy * c, c2 = Math.cos(toO.roll), s2 = Math.sin(toO.roll);
    return axis === 'x' ? toO.cx + lx * c2 - ly * s2 : toO.cy + lx * s2 + ly * c2;
  }
  var _end = resetPose({}), _prev = resetPose({}), _tmp = resetPose({}), _prevInp = {};
  function copyPose(src, o) {
    for (var k in src) if (Object.prototype.hasOwnProperty.call(src, k)) o[k] = src[k];
    return o;
  }
  function mixPoses(a, b, k, o) {
    o.cx = lerp(a.cx, b.cx, k); o.cy = lerp(a.cy, b.cy, k); o.roll = lerp(a.roll, b.roll, k);
    o.bx = lerp(a.bx, b.bx, k); o.by = lerp(a.by, b.by, k); o.qx = lerp(a.qx, b.qx, k); o.qy = lerp(a.qy, b.qy, k);
    o.gLx = lerp(a.gLx, b.gLx, k); o.gLy = lerp(a.gLy, b.gLy, k); o.gLz = lerp(a.gLz, b.gLz, k);
    o.gRx = lerp(a.gRx, b.gRx, k); o.gRy = lerp(a.gRy, b.gRy, k); o.gRz = lerp(a.gRz, b.gRz, k);
    o.gLs = lerp(a.gLs, b.gLs, k); o.gRs = lerp(a.gRs, b.gRs, k); o.legs = lerp(a.legs, b.legs, k);
    return o;
  }
  /* after RESULT starts: the belly-flop (side dives) or the landing (stay), dizzy, the wave */
  function afterDive(inp, E, o) {
    var dir = inp.dive === 'left' ? -1 : inp.dive === 'right' ? 1 : 0, red = !!inp.reduced, save = inp.res === 'save';
    var t = Math.max(0, num(inp.resT, 0) - (save ? 0.1 : 0));          /* the 0.10 s glove-snap freeze */
    copyPose(E, o);
    var fallDur = dir ? 0.35 : 0.3, u = clamp01(t / fallDur), e = inQuad(u);
    if (dir) {
      /* lying on his belly: the bean's radius rests on the grass */
      var lieRoll = -dir * 90 * DEG, lieCx = E.cx + dir * 0.15, lieCy = KEEPER.R;
      o.cx = lerp(E.cx, lieCx, e); o.cy = lerp(E.cy, lieCy, e); o.roll = lerp(E.roll, lieRoll, e);
      /* gloves ride with the body but never sink into the grass (nor lift off a ball they already hold low) */
      o.gLx = rigidGlove(E, E.gLx, E.gLy, o, 'x'); o.gLy = Math.max(Math.min(0.17, E.gLy), rigidGlove(E, E.gLx, E.gLy, o, 'y'));
      o.gRx = rigidGlove(E, E.gRx, E.gRy, o, 'x'); o.gRy = Math.max(Math.min(0.17, E.gRy), rigidGlove(E, E.gRx, E.gRy, o, 'y'));
      o.legs = lerp(E.legs, 0.3, e);
      o.hugX = o.cx; o.hugY = o.cy + 0.28; o.hugZ = KZ + 0.42;
    } else {
      o.cx = lerp(E.cx, E.cx * 0.6, e); o.cy = lerp(E.cy, KEEPER.CY, e);
      var restLx = o.cx - KEEPER.GLOVE_REST[0], restRx = o.cx + KEEPER.GLOVE_REST[0], restY = o.cy + KEEPER.GLOVE_REST[1];
      if (!save) {
        o.gLx = lerp(E.gLx, restLx, e); o.gLy = lerp(E.gLy, restY, e); o.gLz = lerp(E.gLz, KZ + 0.15, e);
        o.gRx = lerp(E.gRx, restRx, e); o.gRy = lerp(E.gRy, restY, e); o.gRz = lerp(E.gRz, KZ + 0.15, e);
      }
      o.legs = lerp(E.legs, 0, e);
      o.hugX = o.cx; o.hugY = o.cy + 0.05; o.hugZ = KZ + 0.45;
    }
    /* landing: squash 1.25 / 0.7, then bounces of 0.18 and 0.06 u (0.08 for a stay landing) */
    var t2 = t - fallDur;
    if (t2 >= 0) {
      o.landed = true;
      var sq = 1 - outQuad(t2 / 0.15);
      o.qx = 1 + 0.25 * sq; o.qy = 1 - 0.3 * sq;
      if (!red) {
        var h1 = dir ? 0.18 : 0.08, d1 = 2 * Math.sqrt(2 * h1 / 9.8), h2 = dir ? 0.06 : 0, d2 = h2 ? 2 * Math.sqrt(2 * h2 / 9.8) : 0;
        var b = 0;
        if (t2 < d1) b = h1 * arc(t2 / d1);
        else if (t2 < d1 + d2) b = h2 * arc((t2 - d1) / d2);
        o.cy += b; o.hugY += b;
        o.gLy += b; o.gRy += b;
      }
    }
    if (save) {
      /* both gloves hug the ball once it pops up off the glove */
      var hk = smooth(0.3, 0.55, t), leadL = o.lead === 'L' || (!o.lead && inp.ex < 0);
      var side = dir || (leadL ? -1 : 1);
      if (leadL) { o.gLx = lerp(o.gLx, o.hugX + side * 0.17, hk); o.gLy = lerp(o.gLy, o.hugY, hk); o.gLz = lerp(o.gLz, o.hugZ - 0.05, hk); }
      else { o.gRx = lerp(o.gRx, o.hugX + side * 0.17, hk); o.gRy = lerp(o.gRy, o.hugY, hk); o.gRz = lerp(o.gRz, o.hugZ - 0.05, hk); }
      if (!dir) {
        if (leadL) { o.gRx = lerp(o.gRx, o.hugX + 0.17, hk); o.gRy = lerp(o.gRy, o.hugY, hk); o.gRz = lerp(o.gRz, o.hugZ - 0.05, hk); }
        else { o.gLx = lerp(o.gLx, o.hugX - 0.17, hk); o.gLy = lerp(o.gLy, o.hugY, hk); o.gLz = lerp(o.gLz, o.hugZ - 0.05, hk); }
      }
      var snap = 1 - smooth(0.1, 0.35, num(inp.resT, 0));       /* gloves at 1.4× as they snap on */
      if (leadL) o.gLs = 1 + 0.4 * snap; else o.gRs = 1 + 0.4 * snap;
      o.face = 1;
      if (dir && t > 0.85 && t < 1.65) { o.face = 3; o.dizzy = red ? 1 : smooth(0.85, 1.0, t) * (1 - smooth(1.5, 1.65, t)); }
      if (t > 1.5) {
        /* a friendly glove-wave with the free glove (never a taunt) */
        var wk = smooth(1.5, 1.7, t);
        o.wave = wk;
        var wx = red ? 0 : 0.12 * Math.sin(TAU * 1.3 * (t - 1.5));
        if (leadL) { o.gRy = lerp(o.gRy, Math.max(o.gRy, o.cy + 0.6), wk); o.gRx += wx * wk; }
        else { o.gLy = lerp(o.gLy, Math.max(o.gLy, o.cy + 0.6), wk); o.gLx += wx * wk; }
      }
      if (inp.tellType === 'mirror') o.visor = Math.sin(PI * clamp01((t - 0.8) / 0.5));
    } else {
      o.face = inp.res === 'goal' && t < 1.2 ? 2 : 0;
    }
    return o;
  }
  function keeperPose(inp, o) {
    o = o || {};
    var lp = inp.lp;
    standing(inp, o);
    if (lp === 'flight' || lp === 'result') {
      var A = copyPose(o, _tmp);
      diveEnd(inp.dive, inp.res, num(inp.ex, NaN), num(inp.ey, NaN), _end);
      if (lp === 'result') { afterDive(inp, _end, o); o.chip = false; return o; }
      var k = outQuad(num(inp.keeperT, 0)), dir = inp.dive === 'stay' ? 0 : 1;
      mixPoses(A, _end, k, o);
      o.cy += (dir ? 0.18 : 0.1) * Math.sin(PI * k);
      o.gLy += (dir ? 0.18 : 0.1) * Math.sin(PI * k); o.gRy += (dir ? 0.18 : 0.1) * Math.sin(PI * k);
      o.lead = _end.lead; o.legs = _end.legs * k;
      o.eye = 0; o.glowL = A.glowL * (1 - k); o.glowR = A.glowR * (1 - k); o.chip = false;
      o.face = inp.res === 'save' && k > 0.6 ? 1 : 0;
      if (inp.res === 'save') {
        var near = smooth(0.85, 1, num(inp.flight, 0));
        if (_end.lead === 'L') o.gLs = 1 + 0.4 * near; else if (_end.lead === 'R') o.gRs = 1 + 0.4 * near;
      }
      o.hugX = o.cx; o.hugY = o.cy + 0.2; o.hugZ = KZ + 0.45;
      return o;
    }
    /* the next READY: pop up from the last kick's landing pose */
    if (lp === 'ready' && inp.hasPrev && num(inp.shot, 0) > 0 && !inp.reduced && num(inp.phaseT, 0) < 0.35) {
      _prevInp.lp = 'result'; _prevInp.dive = inp.prevDive; _prevInp.res = inp.prevRes; _prevInp.ex = inp.prevEx; _prevInp.ey = inp.prevEy;
      _prevInp.resT = T.RESULT; _prevInp.reduced = false; _prevInp.tell = ZERO_TELL; _prevInp.tellType = inp.tellType; _prevInp.clock = 0;
      diveEnd(inp.prevDive || 'stay', inp.prevRes, num(inp.prevEx, NaN), num(inp.prevEy, NaN), _end);
      afterDive(_prevInp, _end, _prev);
      var kk = inOutSine(num(inp.phaseT, 0) / 0.35);
      var A2 = copyPose(o, _tmp);
      mixPoses(_prev, A2, kk, o);
      o.cy += 0.12 * Math.sin(PI * kk);
    }
    return o;
  }

  /* ================================================================
     KEEPER DANCE (results, ≥ 5 goals): an original 8-count at 118 BPM.
     1–2 side-steps with a 10° lean · 3–4 two hops · 5–6 glove-claps ·
     7 face the camera · 8 group pose (gloves up in a heart). Reduced: the pose.
     ================================================================ */
  function danceCount(t, bpm) {
    var beat = 60 / (bpm || DANCE_BPM), cyc = (((t / beat) % 8) + 8) % 8, c = Math.floor(cyc);
    return { c: c, f: cyc - c, cyc: cyc, beat: beat };
  }
  function keeperDance(t, reduced, baseX, baseZ, o) {
    o = resetPose(o || {});
    var d = danceCount(t, DANCE_BPM), c = reduced ? 7 : d.c, f = reduced ? 0.5 : d.f;
    o.cx = baseX; o.cz = baseZ; o.cy = KEEPER.CY; o.face = 1;
    var lx = -0.62, ly = 0.1, rx = 0.62, ry = 0.1, lz = 0.15, rz = 0.15;
    if (c < 2) {
      var sn = Math.sin(PI * d.cyc);
      o.cx += 0.1 * sn; o.roll = -10 * DEG * sn;
      ly = 0.1 + 0.35 * Math.max(0, -sn); ry = 0.1 + 0.35 * Math.max(0, sn);
    } else if (c < 4) {
      o.cy += 0.14 * arc(f); ly = ry = 0.55 * Math.sin(PI * f) + 0.1; lx = -0.6; rx = 0.6;
      o.legs = 0.35 * Math.sin(PI * f);
    } else if (c < 6) {
      var clap = 0.5 + 0.5 * Math.cos(TAU * 2 * (d.cyc - 4));
      lx = -lerp(0.13, 0.55, clap); rx = lerp(0.13, 0.55, clap); ly = ry = 0.28; lz = rz = 0.4;
    } else if (c === 6) {
      o.cy += 0.03 * arc(f);
    } else {
      lx = -0.21; rx = 0.21; ly = ry = 0.98; lz = rz = 0.2; o.face = 1;
    }
    o.gLx = toWorldX(o, lx, ly); o.gLy = toWorldY(o, lx, ly); o.gLz = baseZ + lz;
    o.gRx = toWorldX(o, rx, ry); o.gRy = toWorldY(o, rx, ry); o.gRz = baseZ + rz;
    o.hugX = o.cx; o.hugY = o.cy; o.hugZ = baseZ + 0.45;
    return o;
  }

  /* ================================================================
     BALL — ballPose(v, out)
     v: {lp, phaseT, flight, resT, res, kind, top, ex, ey, catchX/Y/Z, hugX/Y/Z, reduced}
     out: {x, y, z, spin (rad/s), stretch (0..1 along velocity), inNet, hit (net hit time
           for goals, s into RESULT), contactX, contactY}
     ================================================================ */
  var G = 9.8;
  function endZFor(res) { return res === 'save' ? KZ : 0; }
  /* where the ball meets the frame on a post / bar ping (the ball never sinks into a post) */
  function contactPoint(kind, ex, ey, out) {
    out = out || {};
    var sg = ex < 0 ? -1 : 1, r = GEO.POST_R + GEO.BALL_R;
    out.x = ex; out.y = ey;
    if (kind === 'post') out.x = sg * (Math.abs(ex) <= GEO.POST ? GEO.POST - r : GEO.POST + r);
    else if (kind === 'bar') out.y = ey >= GEO.BAR ? GEO.BAR + r : GEO.BAR - r;
    return out;
  }
  var _cp = {};
  function flightAt(f, ex, ey, res, kind, out) {
    f = clamp01(f);
    var tx = ex, ty = ey;
    if (kind === 'post' || kind === 'bar') { contactPoint(kind, ex, ey, _cp); tx = _cp.x; ty = _cp.y; }
    var sp = Math.sin(f * PI);
    out.x = tx * f + sp * 0.25 * sign(tx);
    out.y = GEO.SPOT[1] + (ty - GEO.SPOT[1]) * f + 0.5 * sp;
    out.z = GEO.SPOT[2] * (1 - f) + endZFor(res) * f;
    return out;
  }
  /* bouncing ballistic arc with drag on x/z (closed form, no state) */
  function ballistic(t, px, py, pz, vx, vy, vz, rest, drag, out) {
    var y0 = py, v = vy, tt = Math.max(0, t), y = py, gy = GEO.BALL_R;
    for (var i = 0; i < 8; i++) {
      var disc = v * v + 2 * G * (y0 - gy), tau = (v + Math.sqrt(Math.max(0, disc))) / G;
      if (tt < tau) { y = y0 + v * tt - 0.5 * G * tt * tt; break; }
      tt -= tau; y0 = gy; v = -(v - G * tau) * rest;
      if (v < 0.35) { y = gy; break; }
      y = gy;
    }
    var k = drag > 0 ? (1 - Math.exp(-drag * t)) / drag : t;
    out.x = px + vx * k; out.y = Math.max(gy, y); out.z = pz + vz * k;
    return out;
  }
  /* the goal: through the mouth, into the back net (bulge), back out with it, drop with 0.3 / 0.1 bounces */
  var NET_HIT = 0.1;
  function goalBall(t, ex, ey, top, out) {
    var D = top ? 0.5 : 0.35, hx = clamp(ex, -2.75, 2.75), hy = clamp(ey - 0.12, 0.2, GEO.NET_TOP - 0.15), back = -GEO.NET_DEPTH;
    out.inNet = true;
    if (t < NET_HIT) { var u = t / NET_HIT; out.x = lerp(ex, hx, u); out.y = lerp(ey, hy, u); out.z = lerp(0, back, u); return out; }
    if (t < 0.22) { out.x = hx; out.y = hy; out.z = back - D * outQuad((t - NET_HIT) / 0.12); return out; }
    if (t < 0.34) { out.x = hx; out.y = hy; out.z = lerp(back - D, back + 0.15, inOutSine((t - 0.22) / 0.12)); return out; }
    var td = t - 0.34, tf = Math.sqrt(2 * Math.max(0, hy - GEO.BALL_R) / G), d1 = 2 * Math.sqrt(2 * 0.3 / G), d2 = 2 * Math.sqrt(2 * 0.1 / G);
    var y;
    if (td < tf) y = hy - 0.5 * G * td * td;
    else if (td < tf + d1) y = GEO.BALL_R + 0.3 * arc((td - tf) / d1);
    else if (td < tf + d1 + d2) y = GEO.BALL_R + 0.1 * arc((td - tf - d1) / d2);
    else y = GEO.BALL_R;
    out.x = hx; out.y = Math.max(GEO.BALL_R, y); out.z = back + 0.15 + 0.3 * (1 - Math.exp(-1.4 * td));
    return out;
  }
  function ballPose(v, out) {
    out = out || {};
    out.spin = 0; out.stretch = 0; out.inNet = false; out.hit = -1; out.contactX = 0; out.contactY = 0;
    var lp = v.lp, ex = num(v.ex, 0), ey = num(v.ey, 0), red = !!v.reduced;
    out.x = GEO.SPOT[0]; out.y = GEO.SPOT[1]; out.z = GEO.SPOT[2];
    if (lp === 'ready') {
      /* the pet sets the ball down on the spot */
      var pt = num(v.phaseT, 0);
      if (!red && pt < 0.45) {
        var u = pt / 0.45;
        out.x = lerp(-0.35, 0, u); out.z = lerp(7.85, GEO.SPOT[2], u);
        out.y = lerp(0.5, GEO.BALL_R, inQuad(Math.min(1, u / 0.7))) + (u > 0.7 ? 0.07 * arc((u - 0.7) / 0.3) : 0);
      }
      return out;
    }
    if (lp === 'flight') {
      flightAt(num(v.flight, 0), ex, ey, v.res, v.kind, out);
      out.spin = 16; out.stretch = 1;
      return out;
    }
    if (lp !== 'result') return out;
    var t = Math.max(0, num(v.resT, 0)), kind = v.kind, res = v.res;
    if (res === 'goal') { goalBall(t, ex, ey, !!v.top, out); out.hit = NET_HIT; out.spin = t < 0.34 ? 6 : 3 * Math.exp(-t); return out; }
    if (res === 'save') {
      var ts = Math.max(0, t - 0.1), u1 = clamp01(ts / 0.3);
      var gx = ex, gy = ey, gz = KZ;
      if (ts < 0.3) { out.x = gx; out.y = gy + 0.3 * arc(u1); out.z = gz + 0.05 * u1; }
      else {
        var k2 = inOutSine((ts - 0.3) / 0.2);
        out.x = lerp(gx, num(v.hugX, gx), k2); out.y = lerp(gy, num(v.hugY, gy), k2); out.z = lerp(gz + 0.05, num(v.hugZ, gz), k2);
      }
      out.y = Math.max(Math.min(GEO.BALL_R, gy), out.y);     /* a ball saved on the line stays where it was caught */
      out.spin = ts < 0.3 ? 4 : 0;
      return out;
    }
    if (kind === 'post' || kind === 'bar') {
      contactPoint(kind, ex, ey, _cp);
      out.contactX = _cp.x; out.contactY = _cp.y;
      var sg = ex < 0 ? -1 : 1, vx, vy;
      if (kind === 'post') { vx = sg * 1.1; vy = 1.3; } else { vx = sg * 0.35; vy = ey >= GEO.BAR ? 2.0 : -0.4; }
      ballistic(t, _cp.x, _cp.y, 0, vx, vy, 3.0, 0.55, 0.9, out);
      out.spin = 9 * Math.exp(-t);
      return out;
    }
    /* wide / over: the ball floats into the stand and a fan blob catches it overhead */
    var cx = num(v.catchX, ex * 1.9), cy = num(v.catchY, 1.6) + 0.62, cz = num(v.catchZ, -6.2), uu = clamp01(t / 0.75);
    if (uu < 1) {
      out.x = lerp(ex, cx, uu); out.z = lerp(0, cz, uu);
      out.y = lerp(ey, cy, uu) + 1.2 * arc(uu);
      out.spin = 6;
    } else {
      out.x = cx; out.z = cz; out.y = cy + (red ? 0 : 0.04 * Math.sin(TAU * 1.5 * (t - 0.75)));
    }
    return out;
  }

  /* ================================================================
     NET — the back net's ripple: −depth at the hit point (−0.5 for a top
     corner), a 6 Hz spring decaying to rest by 0.6 s, pinned at the frame.
     u, v: the vertex's 0..1 position on the back net; x, y its world position.
     ================================================================ */
  var NET_SIGMA = 0.55;
  function netSpring(t) {
    if (t <= 0 || t >= 0.65) return 0;
    if (t < 0.08) return t / 0.08;
    var d = t - 0.08;
    return Math.exp(-d / 0.17) * Math.cos(TAU * RATES.NET_HZ * d);
  }
  function netEdge(u, v) { return smooth(0, 0.08, u) * smooth(0, 0.08, 1 - u) * smooth(0, 0.1, v) * smooth(0, 0.1, 1 - v); }
  function netBulge(x, y, u, v, hx, hy, t, depth) {
    var sp = netSpring(t);
    if (!sp) return 0;
    var dx = x - hx, dy = y - hy;
    return -depth * sp * Math.exp(-(dx * dx + dy * dy) / (NET_SIGMA * NET_SIGMA)) * netEdge(u, v);
  }

  /* ================================================================
     CROWD — fan blobs in 3 back tiers (z −5.45, −6.35, −7.25) and 2 side
     stands (x ±8.6+). 120 on MID/HIGH, 72 on LOW. 40% of the wands in the
     child's signature colour; `h` orders which wands light first (exact
     fractions); even indices first, so drawing the first half is a uniform half.
     ================================================================ */
  var FAN_BODY = ['#FFB3E6', '#B3E5FF', '#C9FFE5', '#FFF3B3', '#FF8FC8'];
  var WAND_COLS = ['#FF8FC8', '#4FC3F7', '#FFD23F', '#7BD88F', '#C38BFF'];
  function mix01(seed, n) {
    var h = (seed ^ Math.imul(n | 0, 0x9E3779B1)) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x85EBCA6B) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function shuffled(n, seed) {
    var a = [];
    for (var i = 0; i < n; i++) a.push(i);
    for (var j = n - 1; j > 0; j--) { var k = Math.floor(mix01(seed, j) * (j + 1)), t = a[j]; a[j] = a[k]; a[k] = t; }
    return a;
  }
  function crowdLayout(n, seed) {
    n = n === 72 ? 72 : 120;
    seed = (seed >>> 0) || 7;
    var list = [], backPer = n === 72 ? 18 : 28, sideRows = n === 72 ? 1 : 2, sidePer = 9, r, i;
    for (r = 0; r < 3; r++) {
      for (i = 0; i < backPer; i++) {
        var fx = -6.6 + 13.2 * (i + 0.5) / backPer + (mix01(seed, r * 97 + i) - 0.5) * 0.18;
        list.push({ x: fx, y: 0.6 + 0.7 * r, z: -5.45 - 0.9 * r, side: 0, row: r });
      }
    }
    for (var sd = -1; sd <= 1; sd += 2) {
      for (r = 0; r < sideRows; r++) {
        for (i = 0; i < sidePer; i++) {
          list.push({ x: sd * (8.6 + 0.8 * r), y: 0.45 + 0.6 * r, z: -3.6 + 7.2 * (i + 0.5) / sidePer + (mix01(seed, 900 + r * 31 + i + (sd > 0 ? 400 : 0)) - 0.5) * 0.2, side: sd, row: r });
        }
      }
    }
    /* even indices first: halving the draw count keeps an even spread */
    var ordered = [];
    for (i = 0; i < list.length; i += 2) ordered.push(list[i]);
    for (i = 1; i < list.length; i += 2) ordered.push(list[i]);
    var sigCount = Math.round(0.4 * n), sigPick = shuffled(n, seed ^ 0x51ab), litOrder = shuffled(n, seed ^ 0x2c6f), isSig = [];
    for (i = 0; i < sigCount; i++) isSig[sigPick[i]] = true;
    var xmin = Infinity, xmax = -Infinity;
    for (i = 0; i < n; i++) { xmin = Math.min(xmin, ordered[i].x); xmax = Math.max(xmax, ordered[i].x); }
    for (i = 0; i < n; i++) {
      var f = ordered[i];
      f.i = i;
      f.s = 1.55 * (0.92 + 0.16 * mix01(seed, 2000 + i));
      f.body = Math.min(4, Math.floor(mix01(seed, 3000 + i) * 5));
      f.wand = isSig[i] ? -1 : Math.min(4, Math.floor(mix01(seed, 4000 + i) * 5));
      f.h = (litOrder[i] + 0.5) / n;
      f.ph = mix01(seed, 5000 + i);
      f.u = (f.x - xmin) / ((xmax - xmin) || 1);
      f.hand = mix01(seed, 6000 + i) < 0.5 ? 1 : -1;
    }
    return ordered;
  }
  /* the crowd wave on a goal: left → right in 0.8 s, each blob hops 0.15 u */
  function crowdWave(u, t) {
    if (t < 0 || t > 1.2) return 0;
    return 0.15 * arc((t - u * 0.8) / 0.35);
  }
  function nearestFan(list, x, y, z) {
    var best = -1, bd = Infinity;
    for (var i = 0; i < list.length; i++) {
      var f = list[i], dx = f.x - x, dy = f.y - y, dz = f.z - z, d = dx * dx + dy * dy + dz * dz;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  /* where a wide / over ball heads (the nearest fan there catches it) */
  function catchTarget(kind, ex, out) {
    out = out || {};
    var sg = ex < 0 ? -1 : 1;
    if (kind === 'over') { out.x = clamp(ex * 1.15, -6, 6); out.y = 1.9; out.z = -6.4; }
    else { out.x = sg * clamp(Math.abs(ex) * 1.9, 4.2, 6.4); out.y = 1.3; out.z = -5.8; }
    return out;
  }
  /* wands lit by hype (25 / 50 / 75 / 100 / 100 %; night stadia at least half) */
  var WANDS_LIT = [0.25, 0.5, 0.75, 1, 1], SHOW_LEVEL = [0, 0.2, 0.4, 0.6, 1.0], CONES_LIT = [0, 0, 1, 2, 3];
  function wandsLit(hype, night) { var f = WANDS_LIT[clamp(hype | 0, 0, 4)]; return night ? Math.max(0.5, f) : f; }
  function showLevel(hype) { return SHOW_LEVEL[clamp(hype | 0, 0, 4)]; }
  function conesLit(hype, tier) { var n = CONES_LIT[clamp(hype | 0, 0, 4)]; return tier === 'LOW' ? Math.min(2, n) : n; }

  /* ---------------- tweens (the Showtime blend: 1.6 s up, 0.8 s down, 0.25 s reduced) ---------------- */
  function tween(v) { return { from: v, to: v, t: 0, dur: 0, v: v }; }
  function tweenTo(tw, target, up, down) {
    if (target === tw.to) return tw;
    tw.from = tw.v; tw.to = target; tw.t = 0; tw.dur = target > tw.v ? up : down;
    return tw;
  }
  function tweenStep(tw, dt) {
    if (tw.v === tw.to) return tw.v;
    tw.t += dt;
    tw.v = tw.dur > 0 && tw.t < tw.dur ? lerp(tw.from, tw.to, inOutSine(tw.t / tw.dur)) : tw.to;
    return tw.v;
  }

  /* ================================================================
     COLOUR + PRESETS — DAY (per stadium) → SHOWTIME, in sRGB 0..1
     ================================================================ */
  function hexRgb(h) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(h || '').trim());
    var n = m ? parseInt(m[1], 16) : 0xCFC8DC;
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }
  function rgbHex(c) {
    function p(v) { var s = Math.round(clamp01(v) * 255).toString(16).toUpperCase(); return s.length < 2 ? '0' + s : s; }
    return '#' + p(c[0]) + p(c[1]) + p(c[2]);
  }
  function mixRgb(a, b, k, out) { out = out || [0, 0, 0]; out[0] = lerp(a[0], b[0], k); out[1] = lerp(a[1], b[1], k); out[2] = lerp(a[2], b[2], k); return out; }
  function mixHex(a, b, k) { return rgbHex(mixRgb(hexRgb(a), hexRgb(b), clamp01(k))); }
  function normHex(h) {
    if (typeof h !== 'string') return null;
    var s = h.trim();
    if (/^#[0-9a-f]{3}$/i.test(s)) s = '#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
    return /^#[0-9a-f]{6}$/i.test(s) ? s.toUpperCase() : null;
  }
  var STADIUM_LOOK = {
    stadium_day: { sky: '#7ECBFF', grass: '#6AC46A', verge: '#5DB35D', top: '#7ECBFF', mid: '#CDEBFF', hor: '#FFE3F1', fog: '#FFE3F1', seat: ['#C7B8FF', '#FFB3E6', '#B3E5FF'] },
    stadium_night: { sky: '#2B2A5E', grass: '#3F9A4A', verge: '#357F3F', top: '#14143A', mid: '#2B2A5E', hor: '#5A4A9A', fog: '#2B2A5E', night: true, flood: true, seat: ['#6B5BD6', '#A66BFF', '#4F6BD6'] },
    stadium_beach: { sky: '#FFE0A0', grass: '#7FD0A0', verge: '#F3DC9A', top: '#8FD3FF', mid: '#CDEBFF', hor: '#FFE0A0', fog: '#FFE8C2', palms: true, sea: true, seat: ['#FFE27A', '#7FE3F0', '#FFB3E6'] },
    stadium_snow: { sky: '#DFEEFF', grass: '#BFE6C8', verge: '#F2F7FF', top: '#B8DCFF', mid: '#DFEEFF', hor: '#F6FAFF', fog: '#EEF5FF', snow: true, seat: ['#B3E5FF', '#FFFFFF', '#C7B8FF'] }
  };
  function stadiumLook(id) { return STADIUM_LOOK[id] || STADIUM_LOOK.stadium_day; }
  var DAY_LIGHT = { hemiSky: '#DDF1FF', hemiGround: '#FFE0EC', hemiI: 1.9, sun: '#FFF3E0', sunI: 2.4, fogNear: 30, fogFar: 70, exposure: 1.0, rim: '#FFFFFF', rimS: 0.28 };
  var NIGHT_LIGHT = { hemiSky: '#8C88E0', hemiGround: '#2A2450', hemiI: 1.35, sun: '#C9D2FF', sunI: 1.5, fogNear: 26, fogFar: 64, exposure: 1.0, rim: '#C7B8FF', rimS: 0.38 };
  var SHOW_LIGHT = { hemiSky: '#6B5BD6', hemiGround: '#2A1840', hemiI: 0.85, sun: '#B9C6FF', sunI: 0.9, fog: '#3B1E6E', fogNear: 24, fogFar: 60, exposure: 1.08,
    rim: '#FF7AD9', rimMember: 0.4, rimS: 0.55, top: '#1A1240', mid: '#3B1E6E', hor: '#FF7AC8' };
  var COLOR_KEYS = ['hemiSky', 'hemiGround', 'sun', 'fog', 'rim', 'top', 'mid', 'hor'];
  function makePreset() {
    var o = { hemiI: 0, sunI: 0, fogNear: 0, fogFar: 0, exposure: 1, rimS: 0, stars: 0 };
    COLOR_KEYS.forEach(function (k) { o[k] = [0, 0, 0]; });
    return o;
  }
  var presetCache = {}, lastStadium = null, lastSig = null, lastEnds = null;
  function presetEnds(stadium, sig) {
    if (stadium === lastStadium && sig === lastSig && lastEnds) return lastEnds;     /* per-frame calls: no key strings */
    lastStadium = stadium; lastSig = sig;
    lastEnds = presetEndsFor(stadium, sig);
    return lastEnds;
  }
  function presetEndsFor(stadium, sig) {
    var key = stadium + '|' + (normHex(sig) || '');
    if (presetCache[key]) return presetCache[key];
    var L = stadiumLook(stadium), base = L.night ? NIGHT_LIGHT : DAY_LIGHT;
    var a = { hemiSky: base.hemiSky, hemiGround: base.hemiGround, sun: base.sun, fog: L.fog, rim: base.rim, top: L.top, mid: L.mid, hor: L.hor };
    var showRim = normHex(sig) ? mixHex(SHOW_LIGHT.rim, normHex(sig), SHOW_LIGHT.rimMember) : SHOW_LIGHT.rim;
    var b = { hemiSky: SHOW_LIGHT.hemiSky, hemiGround: SHOW_LIGHT.hemiGround, sun: SHOW_LIGHT.sun, fog: SHOW_LIGHT.fog, rim: showRim, top: SHOW_LIGHT.top, mid: SHOW_LIGHT.mid, hor: SHOW_LIGHT.hor };
    var ends = { a: {}, b: {}, base: base, night: !!L.night };
    COLOR_KEYS.forEach(function (k) { ends.a[k] = hexRgb(a[k]); ends.b[k] = hexRgb(b[k]); });
    presetCache[key] = ends;
    return ends;
  }
  /* the mix for show level L (0 = this stadium by day, 1 = Showtime) into a preallocated `out` */
  function presetMix(stadium, L, sig, out) {
    out = out || makePreset();
    var e = presetEnds(stadium, sig), k = clamp01(L), base = e.base;
    for (var i = 0; i < COLOR_KEYS.length; i++) { var key = COLOR_KEYS[i]; mixRgb(e.a[key], e.b[key], k, out[key]); }
    out.hemiI = lerp(base.hemiI, SHOW_LIGHT.hemiI, k); out.sunI = lerp(base.sunI, SHOW_LIGHT.sunI, k);
    out.fogNear = lerp(base.fogNear, SHOW_LIGHT.fogNear, k); out.fogFar = lerp(base.fogFar, SHOW_LIGHT.fogFar, k);
    out.exposure = lerp(base.exposure, SHOW_LIGHT.exposure, k); out.rimS = lerp(base.rimS, SHOW_LIGHT.rimS, k);
    out.stars = e.night ? 1 : clamp01((k - 0.5) * 2);
    return out;
  }
  var BALL_LOOK = {
    ball_classic: { trail: ['#FFFFFF'], body: '#FFFFFF', patch: '#3B2F4A' },
    ball_rainbow: { trail: ['#FF6B6B', '#FFA94D', '#FFD23F', '#7BD88F', '#4FC3F7', '#C38BFF'], bands: ['#FF6B6B', '#FFA94D', '#FFD23F', '#7BD88F', '#4FC3F7', '#C38BFF'] },
    ball_planet: { trail: ['#FFD23F'], body: '#C38BFF', ring: '#FFD23F' },
    ball_gold: { trail: ['#FFE89A'], sparkles: true }
  };
  function ballLook(id) { return BALL_LOOK[id] || BALL_LOOK.ball_classic; }
  var HOLO = ['#FFB3E6', '#B3E5FF', '#C9FFE5', '#FFF3B3'];
  var NEON = { cyan: '#3DF2FF', pink: '#FF4FB8', violet: '#A66BFF', gold: '#FFD23F', glove: '#FF5FA2', ink: '#3B2F4A' };

  /* ================================================================
     SPOT CONES — three fake spotlights on truss towers. Sweep ±25° at 0.12 Hz
     over the crowd and sky (never across the goal mouth); snap to the goal
     point on a goal and to the ball for the final kick.
     ================================================================ */
  var CONE_BASE = [[-3.5, 3.4, -10], [3.5, 3.4, -10], [0, 4.6, -12]];
  function coneAim(i, mode, t, reduced, ex, ey, out) {
    out = out || {};
    var tw = GEO.TOWERS[i] || GEO.TOWERS[0], tx, ty, tz;
    if (mode === 'goal') { tx = ex; ty = ey; tz = 0; }
    else if (mode === 'ball') { tx = GEO.SPOT[0]; ty = GEO.SPOT[1]; tz = GEO.SPOT[2]; }
    else {
      var b = CONE_BASE[i] || CONE_BASE[0], dx = b[0] - tw[0], dz = b[2] - tw[2];
      var a = reduced ? 0 : 25 * DEG * Math.sin(TAU * RATES.CONE_SWEEP_HZ * t + i * TAU / 3);
      tx = tw[0] + dx * Math.cos(a) - dz * Math.sin(a); tz = tw[2] + dx * Math.sin(a) + dz * Math.cos(a); ty = b[1];
    }
    var vx = tx - tw[0], vy = ty - tw[1], vz = tz - tw[2], d = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1;
    out.x = tw[0]; out.y = tw[1]; out.z = tw[2];
    out.dx = vx / d; out.dy = vy / d; out.dz = vz / d;
    out.len = mode === 'sweep' || !mode ? 10 : d + 1.2;
    return out;
  }

  /* ================================================================
     KICKER PET + TOUCHLINE AVATAR staging (positions, facing and clip)
     petStage(v, out): v {lp, phaseT, shot, flight, resT, res, idleT, reduced}
       out {x, z, yaw (π = facing the goal, 0 = facing the camera), clip, ct, speed, sy, tap}
     ================================================================ */
  function petStage(v, out) {
    out = out || {};
    var K0 = GEO.KICKER, SB = GEO.STEPBACK, R = GEO.RUNUP, lp = v.lp, pt = num(v.phaseT, 0), red = !!v.reduced;
    out.x = K0[0]; out.z = K0[2]; out.yaw = PI; out.clip = 'idle'; out.ct = pt; out.speed = 0; out.sy = 1; out.tap = 0;
    var tapOn = num(v.idleT, 0) >= T.NUDGE;
    if (lp === 'ready') {
      if (num(v.shot, 0) > 0 && pt < 0.6 && !red) {
        var k = inOutSine(pt / 0.6);
        out.x = lerp(R[0], K0[0], k); out.z = lerp(R[2], K0[2], k);
        out.yaw = lerp(0, PI, smooth(0, 0.3, pt)) ; out.clip = 'walk'; out.speed = 0.9;
      }
    } else if (lp === 'aimX') {
      out.tap = tapOn ? 1 : 0;
    } else if (lp === 'aimY') {
      var kb = red ? 1 : outQuad(pt / 0.15);
      out.x = lerp(K0[0], SB[0], kb); out.z = lerp(K0[2], SB[2], kb); out.tap = tapOn ? 1 : 0;
    } else if (lp === 'windup') {
      var kr = inOutSine(pt / T.WINDUP);
      out.x = lerp(SB[0], R[0], kr); out.z = lerp(SB[2], R[2], kr);
      out.clip = 'kick'; out.ct = 0.07 + pt; out.speed = 2.2;
      out.sy = red ? 1 : 1 - 0.15 * smooth(T.WINDUP - 0.1, T.WINDUP, pt);
    } else if (lp === 'strike') {
      out.x = R[0]; out.z = R[2]; out.clip = 'kick'; out.ct = 0.32; out.sy = red ? 1 : 1.15;
    } else if (lp === 'flight') {
      var fs = num(v.flight, 0) * T.FLIGHT;
      out.x = R[0]; out.z = R[2]; out.clip = 'kick'; out.ct = 0.32 + Math.min(fs, 0.45);
      out.sy = red ? 1 : lerp(1.15, 1, outQuad(fs / 0.15));
    } else if (lp === 'result') {
      var rt = num(v.resT, 0), beat = 60 / DANCE_BPM;
      out.x = R[0]; out.z = R[2];
      out.yaw = red ? 0 : lerp(PI, 0, inOutSine(rt / 0.3));
      if (v.res === 'goal') {
        if (rt < 0.3) { out.clip = 'idle'; out.ct = rt; }
        else if (rt < 1.3) { out.clip = 'dance'; out.ct = 4 * beat + (rt - 0.3) * 2 * beat; }   /* counts 5–6: the signature move */
        else { out.clip = 'cheer'; out.ct = rt - 1.3; }
      } else {
        out.clip = rt < 1.3 && rt > 0.25 ? 'sad' : 'idle'; out.ct = rt;
      }
    }
    return out;
  }
  /* the avatar: cheers (wand wave) on goals, claps on saves, both arms up in ENCORE MODE */
  function avatarClip(lp, res, resT, encore) {
    if (lp === 'result' && res === 'goal' && resT < 1.8) return 'wave';
    if (lp === 'result' && res === 'save' && resT > 0.3 && resT < 1.6) return 'clap';
    if (encore) return 'cheer';
    return 'idle';
  }

  /* ================================================================
     LED + MENU + COPY helpers
     ================================================================ */
  /* 8 kick pips: 0 to come · 1 this kick · 2 goal · 3 goal with a gold ring (top corner / Star Strike) · 4 no goal */
  function ledPips(log, shot, out) {
    out = out || [0, 0, 0, 0, 0, 0, 0, 0];
    for (var i = 0; i < 8; i++) {
      var e = log && log[i];
      if (e) out[i] = e.res === 'goal' ? ((e.top || e.star) ? 3 : 2) : 4;
      else out[i] = i === shot ? 1 : 0;
    }
    return out;
  }
  function ledText(kind, data) {
    data = data || {};
    if (kind === 'start') return 'GO ' + String(data.pet || 'PET').toUpperCase().slice(0, 12) + '!';
    if (kind === 'hype') return 'HYPE ×' + clamp(data.hype | 0, 1, 4);
    if (kind === 'encore') return 'ENCORE!';
    if (kind === 'final') return 'FINAL KICK';
    if (kind === 'show') return 'WHAT A SHOW!';
    return 'ENCORE SHOOTOUT';
  }
  /* the menu attract loop: fake dives alternating left / right every 2.5 s */
  function menuTell(t, out) {
    out = out || {};
    var seg = Math.floor(Math.max(0, t) / 2.5);
    out.dive = seg % 2 ? 'right' : 'left';
    out.aimT = Math.max(0, t) - seg * 2.5;
    out.clock = t;
    return out;
  }
  function promptFor(lp) {
    if (lp === 'aimX') return 'Tap to pick the SIDE';
    if (lp === 'aimY') return 'Tap to pick the HEIGHT';
    return '';
  }
  var COPY = {
    nudge: 'Tap to shoot!', replay: 'REPLAY', tapStart: 'Tap to start', encore: 'ENCORE MODE!', encoreSub: 'Every goal = 150!',
    boost: 'The crowd’s got your back!', boostSub: 'Slower aim + glove zone', final: 'FINAL KICK!', finalSub: 'Make it count!',
    boostChip: '📣 Cheer boost!'
  };
  /* the banner for an event (result banners use penalty.js resultLabel so 2D and 3D agree) */
  function bannerFor(e, entry, resultLabel) {
    if (!e) return null;
    if (e.t === 'result') {
      var lab = typeof resultLabel === 'function' ? resultLabel(entry || e) : { title: '', sub: '', say: '' };
      var kind = e.res === 'goal' ? (e.top ? 'top' : e.star ? 'star' : 'goal') : e.res === 'save' ? 'save' : 'close';
      return { title: lab.title, sub: lab.sub, say: lab.say || lab.title, kind: kind, life: 1.8, slot: 'main' };
    }
    if (e.t === 'encore' && e.on) return { title: COPY.encore, sub: COPY.encoreSub, say: 'Encore mode! Every goal is worth 150.', kind: 'encore', life: 1.9, slot: 'low' };
    if (e.t === 'boost') return { title: COPY.boost, sub: COPY.boostSub, say: 'The crowd has your back. Slower aim and the glove zone.', kind: 'boost', life: 2.0, slot: 'low' };
    if (e.t === 'kick' && e.final) return { title: COPY.final, sub: COPY.finalSub, say: 'Final kick!', kind: 'final', life: 1.6, slot: 'low' };
    return null;
  }

  return {
    VERSION: VERSION, T: T, U: U, GEO: GEO, KEEPER: KEEPER, CAM: CAM, RATES: RATES, REACH_U: REACH_U, DANCE_BPM: DANCE_BPM,
    FAN_BODY: FAN_BODY, WAND_COLS: WAND_COLS, WANDS_LIT: WANDS_LIT, SHOW_LEVEL: SHOW_LEVEL, CONES_LIT: CONES_LIT,
    STADIUM_LOOK: STADIUM_LOOK, BALL_LOOK: BALL_LOOK, HOLO: HOLO, NEON: NEON, COPY: COPY, NET_HIT: NET_HIT,
    /* maths */
    clamp: clamp, clamp01: clamp01, lerp: lerp, frac: frac, smooth: smooth, inOutSine: inOutSine, outQuad: outQuad,
    inQuad: inQuad, outBack: outBack, outElastic: outElastic, arc: arc, sign: sign, lx2u: lx2u, ly2u: ly2u,
    tri: tri, markerX: markerX, markerY: markerY, mix01: mix01,
    /* camera */
    portraitFov: portraitFov, cameraShot: cameraShot, replayProgress: replayProgress, ballX: ballX,
    /* keeper */
    keeperPose: keeperPose, diveEnd: diveEnd, keeperDance: keeperDance, danceCount: danceCount, resetPose: resetPose,
    /* ball + net */
    ballPose: ballPose, flightAt: flightAt, contactPoint: contactPoint, goalBall: goalBall, ballistic: ballistic,
    netSpring: netSpring, netBulge: netBulge, netEdge: netEdge,
    /* crowd + show */
    crowdLayout: crowdLayout, crowdWave: crowdWave, nearestFan: nearestFan, catchTarget: catchTarget,
    wandsLit: wandsLit, showLevel: showLevel, conesLit: conesLit, tween: tween, tweenTo: tweenTo, tweenStep: tweenStep,
    hexRgb: hexRgb, rgbHex: rgbHex, mixRgb: mixRgb, mixHex: mixHex, normHex: normHex,
    stadiumLook: stadiumLook, presetMix: presetMix, makePreset: makePreset, ballLook: ballLook, coneAim: coneAim,
    /* staging + copy */
    petStage: petStage, avatarClip: avatarClip, ledPips: ledPips, ledText: ledText, menuTell: menuTell,
    promptFor: promptFor, bannerFor: bannerFor
  };
}));
