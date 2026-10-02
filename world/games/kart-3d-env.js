/* ================================================================
   Neon Grand Prix 3D — the environment (ES module; THREE comes in ctx).
   Sky dome (gradient), the turquoise sea with a foam ring round the
   grass island, the island slab + sand skirt, the ONLY lights (one
   hemisphere + one directional with a static shadow map on MID/HIGH),
   the Encore star field and the 5 additive spot cones (3 behind the
   stand, 2 on the gantry). Colours follow the light-arc preset the
   orchestrator passes to apply(); nothing here reads the race.

   buildEnv(ctx) → env
     ctx {THREE, kit, core, track, rect, tier, budget, quality, reduced}
     env.group, env.fog, env.hemi, env.sun
     env.apply(preset)                       colours, intensities, fog, star / cone strength
     env.update(dt, t, camera, cones)        sea clock, sky follows the camera, cone aims
       cones {encore, spot (0..1), snap (0..1), target: Vector3|null, standX, standZ, gantry}
     env.setConeMounts(stand[3], gantry[2]), env.setReduced(on), env.setQuality(q), env.hasShadows(), env.dispose()
   ================================================================ */

export function buildEnv(ctx) {
  const { THREE, kit, core, rect } = ctx;
  const low = ctx.tier === 'LOW';
  const group = new THREE.Group();
  group.name = 'k3d-env';
  const disposables = [];
  const keep = (x) => { disposables.push(x); return x; };
  let reduced = !!ctx.reduced, seaT = 0;

  /* ---------------- sky dome ---------------- */
  const skyU = { uTop: { value: new THREE.Color() }, uMid: { value: new THREE.Color() }, uHor: { value: new THREE.Color() } };
  const skyMat = keep(new THREE.ShaderMaterial({
    uniforms: skyU, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: [
      'uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uHor; varying vec3 vDir;',
      'void main(){ float h = vDir.y;',
      '  vec3 c = mix(uHor, uMid, smoothstep(0.0, 0.28, h)); c = mix(c, uTop, smoothstep(0.28, 0.85, h));',
      '  gl_FragColor = vec4(c, 1.0);', '  #include <tonemapping_fragment>', '  #include <colorspace_fragment>', '}'
    ].join('\n')
  }));
  const skyGeo = keep(new THREE.SphereGeometry(220, low ? 16 : 24, low ? 8 : 12));
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.name = 'sky'; sky.frustumCulled = false; sky.renderOrder = -10;
  group.add(sky);

  /* ---------------- stars (Encore) ---------------- */
  const nStars = (ctx.budget && ctx.budget.stars) || (low ? 120 : 250);
  const sp = new Float32Array(nStars * 3);
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < nStars; i++) {
    const a = rnd() * Math.PI * 2, el = 0.12 + Math.pow(rnd(), 0.7) * 1.3, r = 200;
    sp[i * 3] = Math.cos(a) * Math.cos(el) * r; sp[i * 3 + 1] = Math.sin(el) * r; sp[i * 3 + 2] = Math.sin(a) * Math.cos(el) * r;
  }
  const starGeo = keep(new THREE.BufferGeometry());
  starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const starMat = keep(new THREE.PointsMaterial({ color: 0xffffff, size: low ? 1.6 : 2, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false }));
  const stars = new THREE.Points(starGeo, starMat);
  stars.name = 'stars'; stars.frustumCulled = false; stars.renderOrder = -9; stars.visible = false;
  group.add(stars);

  /* ---------------- sea: shallow → deep from the island's distance field, a foam ring, wave lines ---------------- */
  const seaU = {
    uRect: { value: new THREE.Vector4(rect.cx, rect.cz, rect.hx, rect.hz) }, uR: { value: rect.r + 1.4 },
    uShallow: { value: new THREE.Color() }, uDeep: { value: new THREE.Color() }, uFoam: { value: new THREE.Color() },
    uTime: { value: 0 }, uFogColor: { value: new THREE.Color() }, uFogNear: { value: 50 }, uFogFar: { value: 140 }
  };
  const seaMat = keep(new THREE.ShaderMaterial({
    uniforms: seaU, fog: false,
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: [
      'uniform vec4 uRect; uniform float uR; uniform vec3 uShallow; uniform vec3 uDeep; uniform vec3 uFoam;',
      'uniform float uTime; uniform vec3 uFogColor; uniform float uFogNear; uniform float uFogFar; varying vec3 vW;',
      'void main(){',
      '  vec2 q = abs(vW.xz - uRect.xy) - (uRect.zw + 1.4 - uR);',
      '  float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uR;',
      '  float wob = 0.12 * sin(uTime * 1.1 + (vW.x + vW.z) * 0.7);',
      '  vec3 c = mix(uShallow, uDeep, smoothstep(0.4, 11.0, d));',
      '  float lines = smoothstep(0.9, 1.0, fract(d * 0.42 - uTime * 0.1)) * (1.0 - smoothstep(1.5, 12.0, d)) * 0.28;',
      '  c = mix(c, uFoam, lines);',
      '  float foam = 1.0 - smoothstep(0.25, 0.85, d + wob);',
      '  c = mix(c, uFoam, foam);',
      '  float f = smoothstep(uFogNear, uFogFar, distance(vW, cameraPosition));',
      '  gl_FragColor = vec4(mix(c, uFogColor, f), 1.0);',
      '  #include <tonemapping_fragment>', '  #include <colorspace_fragment>', '}'
    ].join('\n')
  }));
  const seaGeo = keep(new THREE.PlaneGeometry(460, 460).rotateX(-Math.PI / 2));
  const sea = new THREE.Mesh(seaGeo, seaMat);
  sea.name = 'sea'; sea.position.set(rect.cx, -0.32, rect.cz); sea.frustumCulled = false; sea.renderOrder = -5;
  group.add(sea);

  /* ---------------- the island: grass slab + sand skirt (one toon mesh) ---------------- */
  const look = core.trackLook(ctx.track.id);
  function roundedShape(hx, hz, r) {
    const s = new THREE.Shape(), x0 = -hx, x1 = hx, z0 = -hz, z1 = hz;
    s.moveTo(x0 + r, z0);
    s.lineTo(x1 - r, z0); s.absarc(x1 - r, z0 + r, r, -Math.PI / 2, 0, false);
    s.lineTo(x1, z1 - r); s.absarc(x1 - r, z1 - r, r, 0, Math.PI / 2, false);
    s.lineTo(x0 + r, z1); s.absarc(x0 + r, z1 - r, r, Math.PI / 2, Math.PI, false);
    s.lineTo(x0, z0 + r); s.absarc(x0 + r, z0 + r, r, Math.PI, Math.PI * 1.5, false);
    return s;
  }
  function slabFrom(hx, hz, r, depth, top, side) {
    const g = new THREE.ExtrudeGeometry(roundedShape(hx, hz, r), { depth, bevelEnabled: false, curveSegments: low ? 4 : 7, steps: 1 });
    g.rotateX(Math.PI / 2);                             /* shape y → world z; the slab hangs down from y 0 */
    const geo = kit.G.fin(g);
    kit.G.paintBy(geo, (x, y, z, nx, ny) => (ny > 0.5 ? top : side));
    return geo;
  }
  const islandGeo = kit.G.merge([
    kit.G.t(slabFrom(rect.hx, rect.hz, rect.r, 0.35, look.ground, look.side), { p: [rect.cx, 0, rect.cz] }),
    kit.G.t(slabFrom(rect.hx + 1.4, rect.hz + 1.4, rect.r + 1.4, 0.45, core.COL.sand, core.COL.wetSand), { p: [rect.cx, -0.12, rect.cz] })
  ]);
  keep(islandGeo);
  const island = new THREE.Mesh(islandGeo, kit.mat('toon'));
  island.name = 'island'; island.receiveShadow = true;
  group.add(island);

  /* ---------------- lights: hemisphere + one directional (static shadow map) ---------------- */
  const hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 1.9);
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(rect.cx - 21, 42, rect.cz + 27);
  sun.target.position.set(rect.cx, 0, rect.cz);
  group.add(hemi, sun, sun.target);
  const wantShadows = !!(ctx.quality ? ctx.quality.shadows : ctx.budget && ctx.budget.shadows);
  if (wantShadows && ctx.budget && ctx.budget.shadowMapSize) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(ctx.budget.shadowMapSize, ctx.budget.shadowMapSize);
    const c = sun.shadow.camera, ex = Math.max(rect.hx, rect.hz) + 3;
    c.left = -ex; c.right = ex; c.top = ex; c.bottom = -ex; c.near = 1; c.far = 120;
    c.updateProjectionMatrix();
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
  }
  const fog = new THREE.Fog(0xffffff, 55, 140);

  /* ---------------- spot cones: one instanced additive mesh (3 stand + 2 gantry) ---------------- */
  const CONES = 5;
  const coneGeo = (function () {
    const g = new THREE.ConeGeometry(1, 1, low ? 10 : 16, 1, true);
    g.translate(0, -0.5, 0);                            /* apex at the origin, opening down −y */
    const geo = kit.G.fin(g);
    kit.G.paintBy(geo, (x, y) => { const v = 0.5 + 0.38 * y; return new THREE.Color(v, v, v); });  /* bright apex → dim mouth */
    return keep(geo);
  }());
  const coneMat = kit.additive({ vertexColors: true, side: THREE.DoubleSide, opacity: 0.6, fog: false });
  const cones = new THREE.InstancedMesh(coneGeo, coneMat, CONES);
  cones.name = 'cones'; cones.frustumCulled = false; cones.renderOrder = 4; cones.visible = false;
  cones.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  cones.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CONES * 3), 3);
  const coneCol = [core.COL.neonPink, core.COL.neonCyan, core.COL.neonViolet, core.COL.neonPink, core.COL.neonCyan].map((h) => new THREE.Color(h));
  const coneApex = [], coneAim = [];
  for (let i = 0; i < CONES; i++) { coneApex.push(new THREE.Vector3()); coneAim.push(new THREE.Vector3()); }
  group.add(cones);
  keep(cones);
  let conesOn = ctx.quality ? ctx.quality.cones !== false : true, coneStrength = 0;
  /* cone mounts: set by the track (stand poles, gantry beam) */
  function setConeMounts(stand, gantry) {
    for (let i = 0; i < 3; i++) if (stand && stand[i]) coneApex[i].copy(stand[i]);
    for (let j = 0; j < 2; j++) if (gantry && gantry[j]) coneApex[3 + j].copy(gantry[j]);
  }

  const _v = new THREE.Vector3(), _d = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _m = new THREE.Matrix4(), DOWN = new THREE.Vector3(0, -1, 0), _c = new THREE.Color();
  const _home = new THREE.Vector3(rect.cx, 0, rect.cz);

  function apply(p) {
    skyU.uTop.value.set(p.skyTop); skyU.uMid.value.set(p.skyMid); skyU.uHor.value.set(p.skyHorizon);
    seaU.uShallow.value.set(p.seaShallow); seaU.uDeep.value.set(p.seaDeep); seaU.uFoam.value.set(p.foam);
    seaU.uFogColor.value.set(p.fogColor); seaU.uFogNear.value = p.fogNear; seaU.uFogFar.value = p.fogFar;
    hemi.color.set(p.hemiSky); hemi.groundColor.set(p.hemiGround); hemi.intensity = p.hemiIntensity;
    sun.color.set(p.sunColor); sun.intensity = p.sunIntensity;
    fog.color.set(p.fogColor); fog.near = p.fogNear; fog.far = p.fogFar;
    starMat.opacity = p.encore; stars.visible = p.encore > 0.01;
    coneStrength = p.k;
  }

  /* aims every cone: Encore sweeps ±25° at 0.12 Hz round its home aim; a Spotlight pulls the
     3 stand cones onto the kart (and a P1 snap pulls the first one) */
  function update(dt, t, camera, c) {
    if (!reduced) seaT += dt;
    seaU.uTime.value = seaT;
    if (camera) { sky.position.copy(camera.position); stars.position.copy(camera.position); }
    if (!c) return;
    const spot = c.spot || 0, snap = c.snap || 0, enc = c.encore || 0;
    const show = Math.max(enc, spot * (0.35 + 0.65 * coneStrength), snap * (0.4 + 0.6 * coneStrength));
    cones.visible = conesOn && show > 0.01;
    if (!cones.visible) return;
    const sweep = reduced ? 0 : 25 * core.DEG * Math.sin(core.TAU * 0.12 * t);
    for (let i = 0; i < CONES; i++) {
      const apex = coneApex[i];
      /* home aim: stand cones fan over the finish straight, gantry cones down the track */
      const aim = c.homes && c.homes[i] ? c.homes[i] : _home;
      _d.subVectors(aim, apex);
      const yawOff = sweep * (i % 2 ? -1 : 1) + (i - 1) * 0.05;
      _d.applyAxisAngle(_v.set(0, 1, 0), yawOff);
      coneAim[i].copy(apex).add(_d);
      let w = 0, strength = i < 3 ? enc : enc * 0.8;
      if (c.target && i < 3) w = Math.max(spot, i === 0 ? snap : 0);
      if (w > 0) { coneAim[i].lerp(c.target, w); strength = Math.max(strength, w * (0.35 + 0.65 * coneStrength)); }
      _d.subVectors(coneAim[i], apex);
      const len = Math.max(0.5, _d.length() + 0.6);
      _d.normalize();
      _q.setFromUnitVectors(DOWN, _d);
      const rad = i < 3 ? 1.3 : 0.9;
      _s.set(rad, len, rad);
      _m.compose(apex, _q, _s);
      _m.toArray(cones.instanceMatrix.array, i * 16);
      _c.copy(coneCol[i]).multiplyScalar(0.55 * strength);
      _c.toArray(cones.instanceColor.array, i * 3);
    }
    cones.instanceMatrix.needsUpdate = true; cones.instanceColor.needsUpdate = true;
  }

  return {
    group, fog, hemi, sun, sky, sea, stars, cones, island,
    apply, update, setConeMounts,
    setReduced(on) { reduced = !!on; },
    setQuality(q) {
      if (!q) return;
      if (q.shadows === false && sun.castShadow) sun.castShadow = false;
      if (q.cones === false) { conesOn = false; cones.visible = false; }
    },
    /* true when there is a static shadow map to re-render (the caller sets renderer.shadowMap.needsUpdate) */
    hasShadows() { return !!sun.castShadow; },
    dispose() {
      if (group.parent) group.parent.remove(group);
      if (sun.shadow && sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
      disposables.forEach((d) => { try { d.dispose(); } catch (e) { /* gone */ } });
      group.clear();
    }
  };
}
