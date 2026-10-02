/* ================================================================
   Neon Grand Prix 3D — effects (ES module; THREE comes in ctx).
   Two pooled billboard particle meshes (additive sparkles / normal-blended
   confetti + dust; capacity from the tier, × the adaptive particle scale),
   24 additive speed lines riding with the camera, 40 fading skid marks
   (MID/HIGH) and the Neon Cyan WRONG WAY hologram chevrons.
   Kid-safe by construction: no fire, smoke, debris or full-screen flash;
   reduced motion cuts particles by 60%, turns confetti into a 0.4 s
   sparkle fade and drops speed lines.

   makeFx(ctx) → fx
     ctx {THREE, kit, core, tier, budget, quality, reduced, camera}
     fx.spark(x, y, z, n, hex, o)        sparkle cell: o {vx, vy, vz, spread, speed, life, size, cell, gravity}
     fx.dust(x, y, z, n, hex)            pastel puffs (≤ 24 alive)
     fx.confetti(pos, dir, n, sigHex)    hearts / stars / rectangles, 40% in the signature colour
     fx.firework(pos, hex)               a sparkle ring facing the camera
     fx.skid(x, z, yaw)                  one mark (MID/HIGH)
     fx.dizzy(on, x, y, z, t)            3 ✦ orbiting (used for the mini pet; rigs draw their own)
     fx.wrongWay(on, x, z, yaw, t)       the hologram chevrons 3 u ahead
     fx.speedLines(k)                    0..1 (boost); hidden under reduced motion
     fx.step(dt)  fx.clear()  fx.setReduced(on)  fx.setScale(s)  fx.dispose()
   ================================================================ */

export function makeFx(ctx) {
  const { THREE, kit, core } = ctx;
  const A = kit.ATLAS, C = core.COL, low = ctx.tier === 'LOW';
  let reduced = !!ctx.reduced, scale = ctx.quality && ctx.quality.particleScale ? ctx.quality.particleScale : 1;
  const group = new THREE.Group(); group.name = 'k3d-fx';
  const disposables = [], ownMats = [];
  const keep = (x) => { disposables.push(x); return x; };

  /* ---------------- particle pools ---------------- */
  function makeSystem(cap, additive) {
    const pool = kit.billboards({ capacity: cap, texture: 'sparkles', additive, renderOrder: additive ? 7 : 6 });
    group.add(pool.mesh);
    return {
      pool, cap, n: 0,
      bb: new Int16Array(cap).fill(-1), px: new Float32Array(cap), py: new Float32Array(cap), pz: new Float32Array(cap),
      vx: new Float32Array(cap), vy: new Float32Array(cap), vz: new Float32Array(cap), life: new Float32Array(cap), max: new Float32Array(cap),
      s0: new Float32Array(cap), s1: new Float32Array(cap), rot: new Float32Array(cap), vr: new Float32Array(cap), g: new Float32Array(cap),
      drag: new Float32Array(cap), cell: new Uint8Array(cap), a0: new Float32Array(cap), dust: new Uint8Array(cap)
    };
  }
  const capAdd = core.particleCap(ctx.tier, 1), capNorm = ((ctx.budget && ctx.budget.confetti) || 120) + 24;
  const SA = makeSystem(capAdd, true), SN = makeSystem(capNorm, false);
  let dustAlive = 0;
  function spawn(S, x, y, z, vx, vy, vz, life, s0, s1, cell, col, a0, g, drag, vr, isDust) {
    if (S.n >= S.cap) return -1;
    const bi = S.pool.alloc();
    if (bi < 0) return -1;
    const i = S.n++;
    S.bb[i] = bi; S.px[i] = x; S.py[i] = y; S.pz[i] = z; S.vx[i] = vx; S.vy[i] = vy; S.vz[i] = vz;
    S.life[i] = 0; S.max[i] = life; S.s0[i] = s0; S.s1[i] = s1; S.cell[i] = cell; S.a0[i] = a0; S.g[i] = g; S.drag[i] = drag;
    S.rot[i] = (i * 2.399) % 6.283; S.vr[i] = vr; S.dust[i] = isDust ? 1 : 0;
    if (isDust) dustAlive++;
    S.pool.set(bi, x, y, z, s0, kit.color(col), a0, cell, S.rot[i]);
    return i;
  }
  function kill(S, i) {
    S.pool.free(S.bb[i]);
    if (S.dust[i]) dustAlive--;
    const last = --S.n;
    if (i !== last) {
      S.bb[i] = S.bb[last]; S.px[i] = S.px[last]; S.py[i] = S.py[last]; S.pz[i] = S.pz[last];
      S.vx[i] = S.vx[last]; S.vy[i] = S.vy[last]; S.vz[i] = S.vz[last]; S.life[i] = S.life[last]; S.max[i] = S.max[last];
      S.s0[i] = S.s0[last]; S.s1[i] = S.s1[last]; S.rot[i] = S.rot[last]; S.vr[i] = S.vr[last]; S.g[i] = S.g[last];
      S.drag[i] = S.drag[last]; S.cell[i] = S.cell[last]; S.a0[i] = S.a0[last]; S.dust[i] = S.dust[last];
    }
  }
  function stepSystem(S, dt) {
    for (let i = S.n - 1; i >= 0; i--) {
      S.life[i] += dt;
      const u = S.life[i] / S.max[i];
      if (u >= 1) { kill(S, i); continue; }
      const dr = Math.exp(-S.drag[i] * dt);
      S.vx[i] *= dr; S.vz[i] *= dr; S.vy[i] = S.vy[i] * dr + S.g[i] * dt;
      S.px[i] += S.vx[i] * dt; S.py[i] += S.vy[i] * dt; S.pz[i] += S.vz[i] * dt;
      if (S.py[i] < 0.03 && S.g[i] < 0) { S.py[i] = 0.03; S.vy[i] = 0; S.vx[i] *= 0.6; S.vz[i] *= 0.6; S.vr[i] *= 0.5; }
      S.rot[i] += S.vr[i] * dt;
      const size = S.s0[i] + (S.s1[i] - S.s0[i]) * u, a = S.a0[i] * (u < 0.7 ? 1 : 1 - (u - 0.7) / 0.3);
      S.pool.set(S.bb[i], S.px[i], S.py[i], S.pz[i], size, null, a, S.cell[i], S.rot[i]);
    }
    S.pool.commit();
  }
  const rnd = (function () { let s = 1234567; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; }());
  function count(n) { return core.emitCount(n, reduced, scale); }

  /* sparkles (additive): drift sparks, boost glitter, note bursts, scrape sparks */
  function spark(x, y, z, n, hex, o) {
    o = o || {};
    const k = count(n), sp = o.speed == null ? 2 : o.speed, spread = o.spread == null ? 1 : o.spread;
    for (let j = 0; j < k; j++) {
      const vx = (o.vx || 0) + (rnd() - 0.5) * 2 * sp * spread, vy = (o.vy || 0) + rnd() * sp * 0.8, vz = (o.vz || 0) + (rnd() - 0.5) * 2 * sp * spread;
      spawn(SA, x, y, z, vx, vy, vz, (o.life || 0.4) * (0.8 + 0.4 * rnd()), o.size || 0.2, (o.size || 0.2) * 0.4, o.cell == null ? A.sparkle : o.cell,
        Array.isArray(hex) ? hex[j % hex.length] : hex, 1, o.gravity == null ? -2 : o.gravity, 2, (rnd() - 0.5) * 6, false);
    }
  }
  /* pastel dust puffs (normal blend), at most 24 alive */
  function dust(x, y, z, n, hex) {
    const k = count(n);
    for (let j = 0; j < k && dustAlive < 24; j++) {
      spawn(SN, x + (rnd() - 0.5) * 0.3, y, z + (rnd() - 0.5) * 0.3, (rnd() - 0.5) * 0.8, 0.3 + rnd() * 0.4, (rnd() - 0.5) * 0.8,
        0.5 + rnd() * 0.15, 0.25, 0.6, A.puff, hex || C.dust, 0.75, 0, 2.5, (rnd() - 0.5) * 2, true);
    }
  }
  /* confetti: hearts, stars, rectangles from a cannon mouth; reduced → a 0.4 s sparkle fade */
  const CELLS = [A.heart, A.star, A.rect];
  function confetti(pos, dir, n, sigHex) {
    if (reduced) { spark(pos.x, pos.y, pos.z, Math.max(3, Math.round(n * 0.4)), [sigHex || C.neonPink, C.holoLemon, C.holoBlue], { speed: 0.4, life: 0.4, gravity: 0, size: 0.24 }); return; }
    const k = count(n);
    for (let j = 0; j < k; j++) {
      const sp = 4 + rnd() * 3.5, jx = (rnd() - 0.5) * 0.7, jy = (rnd() - 0.5) * 0.5, jz = (rnd() - 0.5) * 0.7;
      const col = rnd() < 0.4 ? (sigHex || C.neonPink) : core.CONFETTI[j % core.CONFETTI.length];
      spawn(SN, pos.x, pos.y, pos.z, (dir.x + jx) * sp, (dir.y + jy) * sp, (dir.z + jz) * sp, 1.6 + rnd() * 0.8, 0.2, 0.17, CELLS[j % 3], col, 1, -4.2, 1.4, (rnd() - 0.5) * 10, false);
    }
  }
  /* a sparkle-ring firework in the camera's view plane */
  const _r = new THREE.Vector3(), _u = new THREE.Vector3();
  function firework(pos, hex) {
    const cam = ctx.camera;
    if (cam) { _r.setFromMatrixColumn(cam.matrixWorld, 0); _u.setFromMatrixColumn(cam.matrixWorld, 1); } else { _r.set(1, 0, 0); _u.set(0, 1, 0); }
    const k = reduced ? 7 : count(18), sp = reduced ? 0.6 : 3.2;
    for (let j = 0; j < k; j++) {
      const a = core.TAU * j / k, cx = Math.cos(a), sy = Math.sin(a);
      spawn(SA, pos.x, pos.y, pos.z, (_r.x * cx + _u.x * sy) * sp, (_r.y * cx + _u.y * sy) * sp, (_r.z * cx + _u.z * sy) * sp,
        reduced ? 0.4 : 1.1, 0.34, 0.12, A.sparkle, hex || C.neonPink, 1, -0.5, 1.8, 0, false);
    }
    spawn(SA, pos.x, pos.y, pos.z, 0, 0, 0, reduced ? 0.4 : 0.7, 0.5, 1.2, A.ring, hex || C.neonPink, 0.8, 0, 0, 0, false);
  }

  /* ---------------- dizzy ✦ (mini pet only) ---------------- */
  const diz = [-1, -1, -1];
  function dizzy(on, x, y, z, t) {
    for (let k = 0; k < 3; k++) {
      if (!on) { if (diz[k] >= 0) { SA.pool.free(diz[k]); diz[k] = -1; } continue; }
      if (diz[k] < 0) diz[k] = SA.pool.alloc();
      if (diz[k] < 0) continue;
      const a = (reduced ? 0.6 : t * Math.PI) + k * core.TAU / 3;
      SA.pool.set(diz[k], x + Math.cos(a) * 0.22, y + 0.05 * Math.sin(a * 2), z + Math.sin(a) * 0.22, 0.17, kit.color(C.starGold), 1, A.star, 0);
    }
  }

  /* ---------------- speed lines: 24 streaks riding with the camera ---------------- */
  const NL = 24;
  const lineGeo = (function () {
    const g = new THREE.PlaneGeometry(0.035, 1.8, 1, 4).rotateX(Math.PI / 2);
    const geo = kit.G.fin(g);
    kit.G.paintBy(geo, (x, y, z) => { const v = 1 - Math.abs(z) / 0.9; return new THREE.Color(v, v, v); });
    return keep(geo);
  }());
  const lineMat = kit.additive({ vertexColors: true, side: THREE.DoubleSide, opacity: 0, fog: false });
  ownMats.push(lineMat);
  const lines = new THREE.InstancedMesh(lineGeo, lineMat, NL);
  lines.name = 'speed-lines'; lines.frustumCulled = false; lines.visible = false; lines.renderOrder = 8;
  lines.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const lz = new Float32Array(NL), la = new Float32Array(NL), lr = new Float32Array(NL);
  for (let i = 0; i < NL; i++) { lz[i] = -2 - rnd() * 12; la[i] = core.TAU * i / NL + rnd() * 0.2; lr[i] = 2.2 + rnd() * 1.8; }
  let lineK = 0;
  if (ctx.camera) ctx.camera.add(lines);

  /* ---------------- skid marks (MID/HIGH) ---------------- */
  const NS = low ? 0 : 40;
  let skids = null;
  const skX = new Float32Array(NS), skZ = new Float32Array(NS), skY = new Float32Array(NS), skT = new Float32Array(NS).fill(9);
  let skHead = 0;
  if (NS) {
    const skMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#3B2F4A'), transparent: true, opacity: 0.22, depthWrite: false });
    ownMats.push(skMat);
    skids = new THREE.InstancedMesh(keep(new THREE.PlaneGeometry(0.09, 0.32).rotateX(-Math.PI / 2)), skMat, NS);
    skids.name = 'skid-marks'; skids.frustumCulled = false; skids.renderOrder = 1; skids.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < NS; i++) skids.setMatrixAt(i, zero);
    group.add(skids);
  }
  function skid(x, z, yaw) {
    if (!NS) return;
    skX[skHead] = x; skZ[skHead] = z; skY[skHead] = yaw; skT[skHead] = 0;
    skHead = (skHead + 1) % NS;
  }

  /* ---------------- WRONG WAY hologram ---------------- */
  const wwGeo = (function () {
    const list = [];
    for (let k = 0; k < 3; k++) {
      const sh = new THREE.Shape();
      [[-0.55, -0.1], [0, 0.35], [0.55, -0.1], [0.55, 0.12], [0, 0.57], [-0.55, 0.12]].forEach((p, i) => (i ? sh.lineTo(p[0], p[1]) : sh.moveTo(p[0], p[1])));
      sh.closePath();
      list.push(kit.G.t(kit.G.fin(new THREE.ShapeGeometry(sh)), { p: [0, k * 0.42, 0] }));
    }
    const g = kit.G.merge(list);
    kit.G.paint(g, kit.color('#FFFFFF'));
    return keep(g.rotateX(-Math.PI / 2 + 0.5));
  }());
  const wwMat = kit.additive({ vertexColors: true, color: C.neonCyan, side: THREE.DoubleSide, opacity: 0.8 });
  ownMats.push(wwMat);
  const ww = new THREE.Mesh(wwGeo, wwMat);
  ww.name = 'wrong-way'; ww.visible = false; ww.renderOrder = 8;
  group.add(ww);
  function wrongWay(on, x, z, yaw, t) {
    ww.visible = !!on;
    if (!on) return;
    ww.position.set(x + Math.sin(yaw) * 3, 1.0, z + Math.cos(yaw) * 3);
    ww.rotation.set(0, yaw, 0);
    wwMat.opacity = reduced ? 0.8 : 0.55 + 0.35 * (0.5 + 0.5 * Math.cos(core.TAU * 1.0 * t));
  }

  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  function step(dt) {
    stepSystem(SA, dt); stepSystem(SN, dt);
    /* speed lines stream past the camera */
    lines.visible = lineK > 0.02 && !reduced;
    if (lines.visible) {
      lineMat.opacity = 0.45 * lineK;
      for (let i = 0; i < NL; i++) {
        lz[i] += dt * 26;
        if (lz[i] > -1.5) lz[i] -= 12.5;
        _e.set(0, 0, la[i] - Math.PI / 2); _q.setFromEuler(_e); _s.set(1, 1, 1);
        _m.compose(_p.set(Math.cos(la[i]) * lr[i], Math.sin(la[i]) * lr[i] * 0.7, lz[i]), _q, _s);
        lines.setMatrixAt(i, _m);
      }
      lines.instanceMatrix.needsUpdate = true;
    }
    /* skid marks thin out over 2.5 s */
    if (skids) {
      for (let i = 0; i < NS; i++) {
        if (skT[i] > 2.5) continue;
        skT[i] += dt;
        const w = Math.max(0, 1 - skT[i] / 2.5);
        _q.setFromAxisAngle(up, skY[i]); _s.set(w, 1, 1);
        _m.compose(_p.set(skX[i], 0.03, skZ[i]), _q, w > 0 ? _s : _s.set(0, 0, 0));
        skids.setMatrixAt(i, _m);
      }
      skids.instanceMatrix.needsUpdate = true;
    }
  }
  function clear() {
    while (SA.n) kill(SA, SA.n - 1);
    while (SN.n) kill(SN, SN.n - 1);
    dizzy(false);
    SA.pool.commit(); SN.pool.commit();
    skT.fill(9);
    if (skids) { const zero = new THREE.Matrix4().makeScale(0, 0, 0); for (let i = 0; i < NS; i++) skids.setMatrixAt(i, zero); skids.instanceMatrix.needsUpdate = true; }
    ww.visible = false; lineK = 0;
  }

  return {
    group, spark, dust, confetti, firework, skid, dizzy, wrongWay, step, clear,
    speedLines(k) { lineK = k; },
    setReduced(on) { reduced = !!on; },
    setScale(s) { scale = s > 0 ? s : 1; },
    alive() { return SA.n + SN.n; },
    dispose() {
      if (group.parent) group.parent.remove(group);
      if (lines.parent) lines.parent.remove(lines);
      kit.release(SA.pool); kit.release(SN.pool);
      lines.dispose(); if (skids) skids.dispose();
      disposables.forEach((d) => { try { d.dispose(); } catch (e) { /* gone */ } });
      ownMats.forEach((m) => kit.release(m));
      group.clear();
    }
  };
}
