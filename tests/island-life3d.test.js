'use strict';
/* My Island 3D — ambient life (world/island3d/life3d.js), Encore City v2 chunk B3. No THREE / WebGL in
   Node: create() is exercised in the browser lab; the paths, curves, counts and rates are tested here. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Life = require('../world/island3d/life3d.js');
const City = require('../world/island3d/city3d.js');
const G = require('../world/island3d/grid3d.js');
const L = require('../world/world-look.js');
const M = require('../world/island3d/motion.js');
const Tier = require('../world/island3d/tier.js');

const SRC = fs.readFileSync(path.join(__dirname, '../world/island3d/life3d.js'), 'utf8');
/* the organic coast may reach 0.85 + blur ≈ 1.05 u beyond any cell (islandV2 §1): paths keep 0.8 u more */
const COAST = 1.05, CLEAR = 0.8, BUOY_R = 0.4;
const ISLET = Life.LANTERN.islet;
function loopSamples(step) {
  const Lp = Life.taxiLoop(), out = [], o = {};
  for (let s = 0; s < Lp.length; s += step) { Life.loopAt(s, o); out.push({ x: o.x, z: o.z, hx: o.hx, hz: o.hz, s }); }
  return out;
}
function inBarge(x, z, pad, lay) {
  for (const b of lay.barges) {
    const c = Math.cos(b.yaw), s = Math.sin(b.yaw), dx = x - b.x, dz = z - b.z;
    const u = dx * c - dz * s, v = dx * s + dz * c;
    if (Math.abs(u) <= City.BARGE.hullW / 2 + pad && Math.abs(v) <= City.BARGE.hullD / 2 + pad) return true;
  }
  return false;
}

/* ---------------- module shape and counts ---------------- */
test('life: loads in Node without THREE, exposes create() and refuses to run without the kit', () => {
  assert.equal(typeof Life.create, 'function');
  assert.equal(Life.VERSION, 1);
  assert.throws(() => Life.create(null, null, {}), /kit/);
  assert.throws(() => Life.create({ THREE: {} }, null, {}), /kit/);
});

test('life: counts come from the tier budgets; the ladder\'s life step halves them; LOW has no catamarans (one boat mesh)', () => {
  for (const t of ['LOW', 'MID', 'HIGH']) {
    const b = Tier.BUDGETS[t], c = Life.counts(t, 1), h = Life.counts(t, 0.5);
    assert.deepEqual([c.boats, c.birds, c.lanterns], [b.boats, b.birds, b.lanterns], t);
    assert.equal(c.taxis + c.cats, c.boats);
    assert.deepEqual([h.boats, h.birds, h.lanterns], [Math.round(b.boats / 2), Math.round(b.birds / 2), Math.round(b.lanterns / 2)], t + ' halved');
    assert.ok(c.cats <= 2 && h.taxis >= 1);
  }
  assert.equal(Life.counts('LOW', 1).cats, 0);
  assert.deepEqual([Life.counts('MID', 1).taxis, Life.counts('MID', 1).cats], [2, 2]);
  assert.deepEqual(Life.counts('nope', 1), Life.counts('MID', 1));
});

/* ---------------- the water-taxi loop ---------------- */
test('life: the taxi loop keeps ≥ 0.8 u from the coast, the buoys and Lantern Islet, and never enters the island exclusion', () => {
  const lay = City.layout({ tier: 'MID' });
  let minCoast = Infinity, minBuoy = Infinity, minIslet = Infinity;
  for (const p of loopSamples(0.05)) {
    const d = City.cellDistance(p.x, p.z);
    minCoast = Math.min(minCoast, d);
    assert.ok(!City.inExclusion(p.x, p.z));
    for (const b of Life.BUOYS) minBuoy = Math.min(minBuoy, Math.hypot(p.x - b[0], p.z - b[1]) - BUOY_R);
    minIslet = Math.min(minIslet, Math.hypot(p.x - ISLET.x, p.z - ISLET.z) - ISLET.r);
    assert.ok(!inBarge(p.x, p.z, 0.2, lay), 'clear of the media barges at ' + p.x.toFixed(2) + ',' + p.z.toFixed(2));
    assert.ok(p.z > City.quayZ(p.x) + 0.25, 'in front of the quay wall');
  }
  assert.ok(minCoast >= COAST + CLEAR, 'coast ' + minCoast.toFixed(2));
  assert.ok(minBuoy >= CLEAR, 'buoys ' + minBuoy.toFixed(2));
  assert.ok(minIslet >= CLEAR, 'islet ' + minIslet.toFixed(2));
});

test('life: taxis pass under the Lantern Bridge mid-span (both crossings in its middle third, with deck clearance)', () => {
  const lay = City.layout({ tier: 'MID' }), br = lay.bridge, pts = loopSamples(0.02);
  const third = (br.z0 - br.z1) / 3, crossings = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    if ((a.x - br.x) * (b.x - br.x) <= 0 && a.x !== b.x) crossings.push(a.z + (b.z - a.z) * (br.x - a.x) / (b.x - a.x));
  }
  assert.equal(crossings.length, 2, 'under the bridge and back');
  for (const z of crossings) {
    assert.ok(z < br.z0 - third && z > br.z1 + third, 'mid-span crossing at z ' + z.toFixed(2));
    assert.ok(City.deckY(z) - City.BRIDGE.deck - G.SEA_Y >= 0.75, 'deck clearance at z ' + z.toFixed(2));
  }
});

test('life: taxis cruise at 0.35 u/s, ease into 6 s stops at the NE jetty and the ferry-terminal berth, and are deterministic', () => {
  const Lp = Life.taxiLoop(), o = {}, q = {};
  Life.loopAt(Lp.stops[0], o);
  assert.ok(Math.hypot(o.x - 4.2, o.z + 5.8) < 0.4, 'the jetty stop sits at the NE jetty end');
  Life.loopAt(Lp.stops[1], o);
  const berth = City.layout({ tier: 'MID' }).terminal.berth;
  assert.ok(Math.hypot(o.x - berth.x, o.z - berth.z) < 0.1, 'the terminal stop is the city berth');
  let prev = null, still = 0, maxV = 0, maxDv = 0, prevV = 0;
  const dt = 0.02;
  for (let t = 0; t < Lp.lapSec; t += dt) {
    Life.taxiAt(0, 1, t, o);
    if (prev) {
      const v = Math.hypot(o.x - prev.x, o.z - prev.z) / dt;
      maxV = Math.max(maxV, v); maxDv = Math.max(maxDv, Math.abs(v - prevV)); prevV = v;
      if (v < 1e-6) still += dt;
    }
    prev = { x: o.x, z: o.z };
  }
  assert.ok(maxV <= Life.TAXI.speed + 0.01, 'cruise ≤ 0.35 u/s (' + maxV.toFixed(3) + ')');
  assert.ok(maxV >= Life.TAXI.speed - 0.01, 'reaches cruise');
  assert.ok(Math.abs(still - 2 * Life.TAXI.stopSec) < 0.2, 'two 6 s stops a lap (' + still.toFixed(2) + ' s)');
  assert.ok(maxDv < 0.02, 'eased: no speed jumps (' + maxDv.toFixed(4) + ')');
  for (const t of [0, 3.3, 41.7, 99.9]) { Life.taxiAt(1, 3, t, o); Life.taxiAt(1, 3, t, q); assert.deepEqual(o, q); }
  /* moorings under reduced motion: distinct, on the loop, still */
  const m = [0, 1, 2].map((i) => Life.taxiMoored(i, {}));
  for (let i = 0; i < 3; i++) { assert.ok(m[i].stopped && m[i].speed === 0); for (let j = 0; j < i; j++) assert.ok(Math.hypot(m[i].x - m[j].x, m[i].z - m[j].z) > 0.6); }
});

test('life: catamarans drift on the flanks at 0.12 u/s, clear of the coast, the buoys and the quay; reduced = moored', () => {
  const o = {}, prev = {};
  for (let i = 0; i < Life.CATS.length; i++) {
    let maxV = 0;
    for (let t = 0; t < 120; t += 0.05) {
      Life.catAt(i, t, false, o);
      assert.ok(City.cellDistance(o.x, o.z) >= COAST + CLEAR);
      for (const b of Life.BUOYS) assert.ok(Math.hypot(o.x - b[0], o.z - b[1]) - BUOY_R >= CLEAR);
      assert.ok(Math.pow(Math.abs(o.x / 17), 4) + Math.pow(Math.abs((o.z + 0.6) / 7.6), 4) < 0.85, 'inside the quay');
      if (t > 0) maxV = Math.max(maxV, Math.hypot(o.x - prev.x, o.z - prev.z) / 0.05);
      prev.x = o.x; prev.z = o.z;
    }
    assert.ok(maxV <= Life.CAT.speed * 1.25 && maxV >= Life.CAT.speed * 0.75, 'cat speed ' + maxV.toFixed(3));
    const a = Life.catAt(i, 5, true, {}), b = Life.catAt(i, 50, true, {});
    assert.deepEqual([a.x, a.z], [b.x, b.z], 'moored under reduced motion');
  }
});

/* ---------------- swifts ---------------- */
test('life: swifts fly figure-8s at y 2.2–3.4 and stay ≥ 3.2 u up whenever they are over the island (edit mode too)', () => {
  const o = {}, n = 12;
  let over = 0;
  for (let i = 0; i < n; i++) for (let t = 0; t < 40; t += 0.04) for (const ek of [0, 0.5, 1]) {
    Life.birdFlight(i, t, ek, o);
    assert.ok(o.y >= Life.BIRD.yMin - 1e-9 && o.y <= Life.BIRD.yMax + 1e-9, 'height ' + o.y.toFixed(2));
    const overIsland = Math.abs(o.x) <= Life.OVER.x && o.z >= Life.OVER.z0 && o.z <= Life.OVER.z1;
    if (overIsland) { over++; assert.ok(o.y >= 3.2, 'over the island at ' + o.y.toFixed(2)); }
    if (City.cellDistance(o.x, o.z) < COAST) assert.ok(o.y >= 3.2);
  }
  assert.ok(over > 0, 'some loops do swing over the island');
  /* the island box covers every cell plus the widest coast */
  assert.ok(Life.OVER.x >= 8 + COAST - 1e-9 && Life.OVER.z0 <= -4 - COAST + 1e-9 && Life.OVER.z1 >= 4 + COAST - 1e-9);
  const a = Life.birdFlight(3, 7.7, 0, {}), b = Life.birdFlight(3, 7.7, 0, {});
  assert.deepEqual(a, b, 'deterministic');
  const e = Life.birdFlight(3, 7.7, 1, {});
  assert.ok(e.z < a.z || e.y >= 3.2, 'edit mode keeps them toward the city');
});

test('life: swifts flap at 1.6 Hz for 1.5 s, then glide 2.5 s; reduced motion holds the glide', () => {
  assert.equal(Life.BIRD.flapHz, 1.6);
  assert.equal(Life.BIRD.flapSec + Life.BIRD.glideSec, 4);
  const P = Life.birdParams(1)[0], cyc = 4;
  let flapping = 0, gliding = 0;
  for (let c = 0.001; c < cyc; c += 0.01) {
    const t = c - P.flapPh + 40 * cyc, a = Life.wingAngle(0, t, false);
    if (Math.abs(a - Life.BIRD.glideDeg) > 1e-6) flapping += 0.01; else gliding += 0.01;
  }
  assert.ok(flapping <= 1.5 + 0.02 && gliding >= 2.5 - 0.02, 'flap ' + flapping.toFixed(2) + ' s, glide ' + gliding.toFixed(2) + ' s');
  assert.equal(Life.wingAngle(0, 12.3, true), Life.BIRD.glideDeg);
  assert.ok(Life.BIRD.roostK >= 0.5 && Life.BIRD.roostK <= 0.7, 'they roost from k 0.65 (Showtime)');
  const r = Life.roosts();
  assert.deepEqual(r, City.roosts(), 'roosts come from the city (bridge pylon, cables, quay rail)');
  assert.ok(r.length >= Tier.BUDGETS.HIGH.birds, 'a perch for every swift');
});

/* ---------------- lanterns ---------------- */
test('life: floating lanterns gather round Lantern Islet on open water, 30% in the member colour, drifting ≈ 0.05 u/s', () => {
  const n = Tier.BUDGETS.HIGH.lanterns, A = Life.lanternAnchors(n), o = {}, q = {};
  assert.equal(A.length, n);
  assert.equal(new Set(A.map((a) => a.x.toFixed(4) + ',' + a.z.toFixed(4))).size, n, 'one anchor each');
  assert.deepEqual(Life.lanternAnchors(n), A, 'deterministic');
  const loop = loopSamples(0.1);
  for (let i = 0; i < n; i++) {
    let maxV = 0, px = null, pz = null;
    for (let t = 0; t < 60; t += 0.1) {
      Life.lanternAt(i, t, false, o);
      const dI = Math.hypot(o.x - ISLET.x, o.z - ISLET.z);
      assert.ok(dI >= ISLET.r + 0.2 && dI <= 2.6, 'round the islet (' + dI.toFixed(2) + ')');
      assert.ok(City.cellDistance(o.x, o.z) >= COAST + 0.3, 'on open water, off the coast');
      for (const p of loop) assert.ok(Math.hypot(p.x - o.x, p.z - o.z) >= 0.25, 'clear of the taxi loop');
      assert.ok(Math.abs(o.y - (G.SEA_Y + 0.05)) <= Life.LANTERN.bob + 1e-9, 'floating');
      if (px !== null) maxV = Math.max(maxV, Math.hypot(o.x - px, o.z - pz) / 0.1);
      px = o.x; pz = o.z;
    }
    assert.ok(maxV <= Life.LANTERN.drift * 1.3, 'drift ' + maxV.toFixed(3) + ' u/s');
    Life.lanternAt(i, 10, true, o); Life.lanternAt(i, 30, true, q);
    assert.deepEqual(o, q, 'still under reduced motion');
  }
  const members = Array.from({ length: n }, (_, i) => Life.lanternToken(i)).filter((t) => t === '@member').length;
  assert.ok(Math.abs(members / n - 0.3) <= 0.05, 'member share ' + (members / n).toFixed(2));
  for (const t of Life.LANTERN.tokens) assert.ok(L.isToken(t), t);
  assert.equal(Life.LANTERN.from, 0.5, 'lanterns from k 0.5');
});

/* ---------------- rates, hooks, safety ---------------- */
test('life: every rate is ≤ 2 Hz (wings 1.6 Hz, bob 0.3 Hz, lantern bob 0.25 Hz)', () => {
  for (const [k, hz] of Object.entries(Life.FREQS)) assert.ok(hz > 0 && hz <= M.MAX_FLASH_HZ, k + ' ' + hz);
  assert.equal(Life.FREQS.birdFlap, 1.6);
  assert.equal(Life.FREQS.boatBob, 0.3);
  assert.equal(Life.FREQS.lanternBob, 0.25);
  assert.ok(1 / Life.taxiLoop().lapSec <= Life.FREQS.taxiLap);
});

test('life: the runtime keeps to the contract (instanced, no picking, env halo layer, wakes, edit, reduced, quality)', () => {
  for (const hook of ['update:', 'setEdit:', 'setReduced:', 'setMember:', 'setQuality:', 'boats:', 'info:', 'dispose:']) assert.ok(SRC.includes(hook), hook);
  assert.match(SRC, /new T\.InstancedMesh/);
  assert.ok(!/new T\.Mesh\(/.test(SRC), 'everything is instanced');
  assert.match(SRC, /raycast = noPick/);
  assert.match(SRC, /opts\.haloLayer/);
  assert.match(SRC, /new Float32Array\(16\)/, 'uBoat[4] data');
  assert.match(SRC, /SL3D\.onQuality/);
  assert.ok(!/negative scale|scale\(-|set\(-1, 1, 1\)/.test(SRC), 'never mirrored with a negative scale');
  assert.ok(!/k-?pop|idol/i.test(SRC));
  assert.ok(!/points|award|spend/i.test(SRC.replace(/\/\*[\s\S]*?\*\//g, '')), 'no reward points anywhere in the code');
});
