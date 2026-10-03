'use strict';
/* My Island 3D — the city across the bay (world/island3d/city3d.js), Encore City v2 chunk B2.
   No THREE / WebGL in Node: create() is exercised in the browser lab; the layout, the geometry
   arrays, the words, the flash rates and the framing are tested here. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const City = require('../world/island3d/city3d.js');
const C = require('../world/world-core.js');
const L = require('../world/world-look.js');
const G = require('../world/island3d/grid3d.js');
const M = require('../world/island3d/motion.js');
const Tier = require('../world/island3d/tier.js');
const Cam = require('../world/island3d/camera.js');
const KIT = require('../world/island3d/kit.js');

const TIERS = ['LOW', 'MID', 'HIGH'];
const SRC = fs.readFileSync(path.join(__dirname, '../world/island3d/city3d.js'), 'utf8');
/* per-tier triangle budget for the city (islandV2 §9 performance table) */
const CITY_TRIS = { LOW: 5000, MID: 11000, HIGH: 17000 };
const lays = {}, arrs = {};
for (const t of TIERS) { lays[t] = City.layout({ tier: t }); arrs[t] = City.buildArrays(lays[t]); }
const bySeq = (lay, row) => lay.rows[row].buildings.map((id) => lay.buildings.find((b) => b.id === id));

/* ---------------- module shape ---------------- */
test('city: loads in Node without THREE, exposes create() and refuses to run without the kit', () => {
  assert.equal(typeof City.create, 'function');
  assert.equal(City.VERSION, 1);
  assert.equal(City.SEED, 'sl-city-v1');
  assert.throws(() => City.create(null, null, {}), /kit/);
  assert.throws(() => City.create({}, null, {}), /kit/);
  assert.equal(City.SEA_Y, G.SEA_Y);
});

/* ---------------- determinism ---------------- */
test('city: the layout and every vertex are deterministic, and siblings share one city (seed sl-city-v1)', () => {
  for (const t of TIERS) {
    const again = City.layout({ tier: t });
    assert.deepEqual(again, lays[t], t + ' layout');
    const a2 = City.buildArrays(again);
    for (const k of ['position', 'normal', 'uv', 'aTint', 'aWin', 'aAnim', 'index']) assert.deepEqual(a2[k], arrs[t][k], t + ' ' + k);
    assert.equal(a2.tris, arrs[t].tris);
  }
  /* the layout takes no child input at all: a different seed is the only way to a different city */
  const other = City.layout({ tier: 'MID', seed: 'another-city' });
  assert.notDeepEqual(other.buildings.map((b) => b.h), lays.MID.buildings.map((b) => b.h));
  assert.equal(City.layout({ tier: 'MID', seed: City.SEED }).buildings.length, lays.MID.buildings.length);
});

/* ---------------- counts and budgets ---------------- */
test('city: building counts come from the tier budget (LOW 30, MID 60, HIGH 90) and the city stays inside its triangle budget', () => {
  for (const t of TIERS) {
    const want = Tier.BUDGETS[t].cityBuildings;
    assert.equal(lays[t].buildings.length, want, t + ' buildings');
    assert.equal(lays[t].tier, t);
    assert.ok(arrs[t].tris <= CITY_TRIS[t], t + ' tris ' + arrs[t].tris + ' ≤ ' + CITY_TRIS[t]);
    assert.ok(arrs[t].vertices < 65536, t + ' fits a 16-bit index');
    assert.ok(arrs[t].index instanceof Uint16Array);
    assert.equal(arrs[t].index.length, arrs[t].tris * 3);
    for (const i of arrs[t].index) assert.ok(i < arrs[t].vertices);
  }
  assert.ok(arrs.LOW.tris < arrs.MID.tris && arrs.MID.tris < arrs.HIGH.tris, 'more city on better tiers');
  assert.equal(City.layout({ tier: 'MID', count: 44 }).buildings.length, 44, 'an explicit budget count wins');
  for (const k of ['position', 'normal', 'uv', 'aTint', 'aWin', 'aAnim']) for (const v of arrs.HIGH[k]) assert.ok(Number.isFinite(v), k + ' finite');
});

test('city: one static build is quick (≤ 60 ms for the HIGH layout + geometry in Node)', () => {
  City.buildArrays(City.layout({ tier: 'HIGH', seed: 'warm-up' }));
  /* the best of three: the build's own cost, not a busy machine's (the suite runs its files in parallel) */
  let ms = Infinity;
  for (let i = 0; i < 3; i++) {
    const t0 = process.hrtime.bigint();
    City.buildArrays(City.layout({ tier: 'HIGH', seed: 'timing-' + i }));
    ms = Math.min(ms, Number(process.hrtime.bigint() - t0) / 1e6);
  }
  assert.ok(ms < 60, 'build took ' + ms.toFixed(1) + ' ms');
});

/* ---------------- towers: archetypes, heights, heroes, neighbours ---------------- */
test('city: neighbours differ in height by ≥ 12% and never share an archetype; heroes come about every 3rd, never adjacent', () => {
  for (const t of TIERS) {
    const lay = lays[t];
    let heroes = 0, regular = 0;
    lay.rows.forEach((row, ri) => {
      const seq = bySeq(lay, ri);
      seq.forEach((b, i) => {
        regular++;
        if (b.hero) heroes++;
        assert.ok(City.ARCH[b.layer].includes(b.arch), b.arch + ' is a ' + b.layer + ' archetype');
        if (!i) return;
        const p = seq[i - 1];
        assert.ok(Math.abs(b.h - p.h) / Math.max(b.h, p.h) >= City.NEIGHBOUR_DIFF - 1e-9, t + ' row ' + ri + ' heights ' + p.h.toFixed(2) + ' / ' + b.h.toFixed(2));
        assert.notEqual(b.arch, p.arch, t + ' row ' + ri + ' archetypes');
        assert.ok(!(b.hero && p.hero), t + ' row ' + ri + ' two heroes side by side');
        assert.notEqual(b.tone, p.tone, 'neighbouring façades differ in tone');
      });
    });
    const share = heroes / regular;
    assert.ok(share >= 0.2 && share <= 0.45, t + ' hero share ' + share.toFixed(2));
  }
  /* footprints never touch along a row (a twist's turning plates sweep its diagonal) */
  const reach = (b) => (b.arch === 'twist' ? Math.hypot(b.w, b.d) / 2 : b.w / 2);
  for (const t of TIERS) lays[t].rows.forEach((row, ri) => {
    const seq = bySeq(lays[t], ri);
    for (let i = 1; i < seq.length; i++) {
      const a = seq[i - 1], b = seq[i];
      assert.ok(Math.hypot(a.x - b.x, a.z - b.z) > reach(a) + reach(b), t + ' row ' + ri + ' buildings ' + a.id + '/' + b.id + ' overlap');
    }
    const ar = lays[t].arena;
    if (lays[t].rows[ri].layer === 'L2') for (const b of seq) assert.ok(Math.hypot(ar.x - b.x, ar.z - b.z) > City.ARENA.r + reach(b), 'clear of the Echo Dome');
  });
  const all = new Set(); TIERS.forEach((t) => lays[t].buildings.forEach((b) => all.add(b.arch)));
  for (const a of ['needle', 'twist', 'ringed', 'twin', 'stepped', 'arena', 'podium']) assert.ok(all.has(a), 'uses ' + a);
});

test('city: heights stay in their layer, peak at the back centre and taper to 55% at the flanks; the mast tops the tallest', () => {
  assert.equal(City.heightEnvelope(0), 1);
  assert.ok(Math.abs(City.heightEnvelope(19) - City.FLANK) < 1e-9 && Math.abs(City.heightEnvelope(-30) - 0.55) < 1e-9);
  for (const t of TIERS) {
    const lay = lays[t], regs = lay.buildings.filter((b) => b.kind === 'building');
    let tallest = regs[0];
    for (const b of regs) {
      const ly = City.LAYERS[b.layer];
      assert.ok(b.h <= ly.hi + 1e-9 && b.h >= ly.lo * City.FLANK * 0.9 - 1e-9, t + ' ' + b.layer + ' h ' + b.h.toFixed(2));
      if (!b.hero) assert.ok(b.h <= ly.hi / City.HERO_MUL * 1.2 + 1e-9, 'only heroes reach the top of the layer');
      assert.ok(City.TONES.includes(b.tone));
      assert.ok(b.toneK >= 0.94 && b.toneK <= 1.06, 'tone ±6%');
      if (b.h > tallest.h) tallest = b;
    }
    assert.ok(tallest.mast && lay.mast.building === tallest.id, t + ' the Signal Mast is on the tallest tower');
    assert.ok(Math.abs(tallest.x) < 8 && tallest.layer === 'L3', t + ' the tallest stands at the back centre (x ' + tallest.x.toFixed(1) + ')');
    const mean = (f) => { const s = regs.filter(f); return s.reduce((a, b) => a + b.h, 0) / s.length; };
    assert.ok(mean((b) => b.layer === 'L3' && Math.abs(b.x) < 6) > 1.25 * mean((b) => b.layer === 'L3' && Math.abs(b.x) > 13), t + ' centre over flanks');
    assert.ok(regs.filter((b) => b.mast).length === 1);
  }
});

/* ---------------- placement: the island exclusion, the 16 × 10 grid, the layers ---------------- */
test('city: no vertex comes within 0.3 u of any island cell (locked land included), and only the bridge landing enters the 16 × 10 grid', () => {
  for (const t of TIERS) {
    const p = arrs[t].position;
    for (let i = 0; i < p.length; i += 3) {
      const x = p[i], z = p[i + 2];
      assert.ok(!City.inExclusion(x, z), t + ' vertex in the exclusion at ' + x.toFixed(2) + ',' + z.toFixed(2));
      if (x > -8 && x < 8 && z > -5 && z < 5) {
        assert.ok(Math.hypot(x - City.BRIDGE.x, z - City.BRIDGE.z0) < 0.8, t + ' only the bridge lands inside the grid: ' + x.toFixed(2) + ',' + z.toFixed(2));
        assert.ok(z < -4.3, 'north of every cell');
      }
    }
  }
  /* the exclusion helper itself: cell squares from SLWorldCore, dilated by 0.3 */
  assert.equal(City.cellDistance(C.REGION_CELLS.home[0].split(',').map(Number)[0] - 7.5, C.REGION_CELLS.home[0].split(',').map(Number)[1] - 4.5), 0);
  assert.ok(City.inExclusion(-3.2, -4.25) && !City.inExclusion(-3.2, -4.45));
});

test('city: the quay is the superellipse |x/17|^4 + |(z + 0.6)/7.6|^4 = 1 with its back at z -8.2; the layers sit behind it', () => {
  assert.ok(Math.abs(City.quayZ(0) + 8.2) < 1e-9);
  for (const x of [-16, -10, -3.2, 0, 6, 14.5]) {
    const z = City.quayZ(x), f = Math.pow(Math.abs(x / 17), 4) + Math.pow(Math.abs((z + 0.6) / 7.6), 4);
    assert.ok(Math.abs(f - 1) < 1e-9, 'on the superellipse at x ' + x);
  }
  assert.ok(Math.abs(City.quayZ(10) + 8.2) < 0.3, 'flat back across x ±10');
  const edge = City.quayCurve(0, 0.5);
  for (const p of edge) assert.ok(Math.abs(Math.pow(Math.abs(p.x / 17), 4) + Math.pow(Math.abs((p.z + 0.6) / 7.6), 4) - 1) < 2e-3);
  assert.ok(edge[0].x < -16.5 && edge[edge.length - 1].x > 16.5, 'it wraps the flanks');
  for (const t of TIERS) {
    for (const b of lays[t].buildings) {
      const back = City.quayZ(Math.max(-16.9, Math.min(16.9, b.x)));
      if (b.kind === 'podium') { assert.ok(b.z < back - 0.5 && b.z > back - 1.7, 'the hero podium is on the promenade'); continue; }
      /* centres in their band behind the quay (measured along z on the flat back) */
      if (Math.abs(b.x) < 12) {
        const band = b.layer === 'L2' ? [2.0, 4.5] : [4.5, 9.0];
        assert.ok(back - b.z >= band[0] - 0.05 && back - b.z <= band[1] + 0.05, t + ' ' + b.layer + ' at ' + (back - b.z).toFixed(2) + ' u behind the quay');
      }
      const s = Math.pow(Math.abs(b.x / 17), 4) + Math.pow(Math.abs((b.z + 0.6) / 7.6), 4);
      assert.ok(s > 1.2, 'outside the quay line (city side)');
    }
    const lamps = lays[t].lamps;
    assert.ok(lamps.length >= (t === 'LOW' ? 18 : 40), t + ' lamp dots along the quay');
  }
});

test('city: the landmarks sit where the plan puts them (Halo Wheel, Lantern Bridge, barges, terminal)', () => {
  const lay = lays.MID;
  assert.deepEqual([lay.wheel.x, lay.wheel.z, lay.wheel.r * 2], [14.5, -6.2, 3.2]);
  assert.ok(Math.abs(Math.hypot(lay.wheel.axis[0], lay.wheel.axis[2]) - 1) < 1e-9);
  assert.ok(lay.wheel.axis[0] * -14.5 + lay.wheel.axis[2] * 6.2 > 0, 'the ring faces the island');
  const br = lay.bridge;
  assert.deepEqual([br.x, br.z0, br.width], [-3.2, -4.45, 0.42]);
  assert.ok(Math.abs(br.z1 - City.quayZ(-3.2)) < 1e-9 && Math.abs(br.z1 + 8.2) < 0.05, 'lands on the quay');
  const mid = (br.z0 + br.z1) / 2, lin = (City.BRIDGE.y0 + City.GROUND) / 2;
  assert.ok(Math.abs(City.deckY(mid) - lin - City.BRIDGE.rise) < 1e-9, 'arch rise 0.55 at mid-span');
  assert.ok(Math.abs(City.deckY(br.z0) - City.BRIDGE.y0) < 1e-9 && Math.abs(City.deckY(br.z1) - City.GROUND) < 1e-9);
  const pb = br.pylon.base, pt = br.pylon.top;
  assert.ok(Math.abs(Math.hypot(pt[0] - pb[0], pt[1] - pb[1], pt[2] - pb[2]) - 2.1) < 1e-9, 'one 2.1 u pylon');
  assert.ok(pt[2] < pb[2], 'it leans over the span, away from the island');
  assert.equal(br.cables.length, 10, '5 cable pairs');
  assert.deepEqual(lay.barges.map((b) => [b.x, b.z]), [[-5.5, -6.9], [0.5, -6.9], [6.0, -6.9]]);
  for (const b of lay.barges) assert.ok(Math.sin(b.yaw) * -b.x + Math.cos(b.yaw) * -b.z > 0.9 * Math.hypot(b.x, b.z), 'barge screens face the island');
  assert.ok(Math.abs(lay.terminal.x - 6) < 0.05 && Math.abs(lay.terminal.z + 8) < 0.25, 'ferry terminal at (6, -8)');
  assert.ok(lay.kiosks.length >= 5 && lay.kiosks.every((k) => k.h >= 0.4 && k.h <= 1.4), 'kiosks and pavilions 0.4–1.4 u');
  assert.deepEqual([...new Set(lay.kiosks.map((k) => k.type))].sort(), ['hall', 'kiosk', 'pavilion']);
});

test('city: the LED screens are 1.5 × 0.65 at y 0.15–0.8 and sit on animated (bobbing) barges; the wheel parts spin about the hub', () => {
  for (const t of TIERS) {
    const a = arrs[t], n = a.vertices;
    let bargeLed = 0, wheel = 0;
    for (let i = 0; i < n; i++) {
      const kind = a.aWin[i * 4 + 3], mode = a.aAnim[i * 4 + 3];
      if (mode === City.MODE.barge && kind === City.KIND.led) {
        bargeLed++;
        const y = a.position[i * 3 + 1];
        assert.ok(y > 0.15 - 1e-6 && y < 0.8 + 1e-6, 'screen y ' + y);
      }
      if (mode === City.MODE.wheel) {
        wheel++;
        assert.ok(Math.abs(a.aAnim[i * 4] - lays[t].wheel.x) < 1e-5 && Math.abs(a.aAnim[i * 4 + 2] - lays[t].wheel.z) < 1e-5, 'pivot = the hub');
        const r = Math.hypot(a.position[i * 3] - lays[t].wheel.x, a.position[i * 3 + 1] - lays[t].wheel.y, a.position[i * 3 + 2] - lays[t].wheel.z);
        assert.ok(r <= lays[t].wheel.r + 0.1, 'spinning parts stay on the ring');
      }
    }
    assert.equal(bargeLed, 3 * 4, t + ' three screens');
    assert.ok(wheel > 100, t + ' the ring, spokes and dots spin');
  }
});

/* ---------------- framing: the default pose sees the barges and the quay lip ---------------- */
test('city: in the default 16:9 home-only pose the 3 media barges and the quay LED lip are in frame (elev 48 and 52)', () => {
  const b = Cam.boundsOf(['home']);
  for (const elev of [48, 52]) {
    const d = Cam.fitDist(b, 0, elev, 16 / 9), B = Cam.basisInto(0, elev, {});
    const pose = { px: b.cx + B.Dx * d, py: Cam.TARGET_Y + B.Dy * d, pz: b.cz + B.Dz * d, yaw: 0, elev: elev, fov: Cam.LIMITS.fov, aspect: 16 / 9 };
    const inFrame = (x, y, z) => { const p = Cam.projectPose({ x, y, z }, pose, {}); return p.depth > 0 && Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1; };
    for (const bg of lays.MID.barges) {
      const c = Math.cos(bg.yaw), s = Math.sin(bg.yaw);
      for (const lx of [-0.75, 0.75]) for (const y of [0.15, 0.8]) {
        assert.ok(inFrame(bg.x + lx * c, y, bg.z - lx * s), 'elev ' + elev + ' barge ' + bg.x + ' screen corner');
      }
    }
    for (let x = -8; x <= 8; x += 1) assert.ok(inFrame(x, City.GROUND - 0.04, City.quayZ(x)), 'elev ' + elev + ' quay lip at x ' + x);
  }
});

/* ---------------- flash safety ---------------- */
test('city: every rate is ≤ 2 Hz (wheel 0.02 rev/s, sweep 0.05 Hz, beacon 0.5 Hz, barge 0.2 Hz) and scrolling boards stay ≤ 1.5 Hz a pixel', () => {
  assert.equal(City.FREQS.wheel, 0.02);
  assert.equal(City.FREQS.sweep, 0.05);
  assert.equal(City.FREQS.beacon, 0.5);
  assert.equal(City.FREQS.barge, 0.2);
  for (const [k, hz] of Object.entries(City.FREQS)) assert.ok(hz > 0 && hz <= M.MAX_FLASH_HZ, k + ' ' + hz);
  for (const k of ['ledPixel', 'marquee', 'heroPixel', 'wheelDots']) assert.ok(City.FREQS[k] <= L.LED_CHASE_HZ, k + ' ≤ LED_CHASE_HZ');
  /* windows switch once per ramp, each fading over 1.2 s; lit fraction 0.3 → 0.7 */
  assert.equal(City.LIT.fadeSec, 1.2);
  assert.deepEqual([City.LIT.dusk, City.LIT.show], [0.3, 0.7]);
  /* the beacon is a soft sine (never on / off) and the wake ripple fades every light in */
  assert.match(City.SHADERS.CITY_FRAG, /0\.55 \+ 0\.45 \* \(0\.5 \+ 0\.5 \* sin\(/);
  assert.ok(City.WAKE.fade >= 0.3, 'each light fades in over ≥ 0.3 s');
  assert.match(City.SHADERS.CITY_VERT, /uK >= uWakeFrom \? mix\(uWakeFrom, uK, wake\) : uK/, 'the ripple starts from the current level (no pop)');
});

/* ---------------- colour: LED mixes, accents, tokens ---------------- */
test('city: every LED set mixes ≥ 4 hues and no hue covers more than 35% (boards, screens and neon accents)', () => {
  for (const t of TIERS) {
    const tally = {};
    let total = 0;
    for (const led of lays[t].leds) {
      assert.ok(new Set(led.hues).size >= 4, t + ' ' + led.prog + ' mixes ≥ 4 hues');
      for (const h of led.hues) { tally[h] = (tally[h] || 0) + 1 / led.hues.length; }
      total++;
    }
    for (const [h, n] of Object.entries(tally)) assert.ok(n / total <= 0.35, t + ' LED hue ' + h + ' ' + (n / total).toFixed(2));
    const acc = {};
    lays[t].accents.forEach((a) => { acc[a] = (acc[a] || 0) + 1; });
    assert.ok(Object.keys(acc).length >= 4, t + ' ≥ 4 accent hues');
    for (const [h, n] of Object.entries(acc)) assert.ok(n / lays[t].accents.length <= 0.35, t + ' accent ' + h);
  }
  for (const tok of City.ACCENTS.concat(City.TONES, ['Quay Stone', 'Night Asphalt', 'Window Warm', 'Holo Blue'])) {
    assert.ok(tok === '@member' || L.isToken(tok), tok + ' resolves');
  }
  for (const id of Object.keys(City.LED_PROG)) assert.ok(City.LED_HUES[id], id + ' has a hue set');
  /* the atlas programs the city samples are the kit's abstract ones (no words, no name) */
  for (const p of ['eq', 'wave', 'spark', 'gradient']) assert.equal(KIT.LED_PROGRAMS[City.LED_PROG[p]], p);
});

/* ---------------- words ---------------- */
test("city: the hero board reads <NAME>'S ISLAND ✦ SHOWTIME — only SIGN_WORDS and the child's own first name", () => {
  const ok = (w, name) => L.SIGN_WORDS.includes(w) || (KIT.signName(name) && w === KIT.signName(name) + "'S");
  for (const name of ['James', 'zoë-anne', 'Christopher Robin', '', null, '민준', 'Ana-María', 'X Æ', 'DJ!!', '  max  ']) {
    const words = City.heroWords(name);
    assert.ok(words.includes('ISLAND') && words.includes('SHOWTIME'));
    for (const w of words) assert.ok(ok(w, name), JSON.stringify(name) + ' → ' + w);
    assert.ok(words.every((w) => !/[ᄀ-ᇿ㄰-㆏가-힯]/.test(w)), 'no Hangul');
  }
  assert.deepEqual(City.heroWords('James'), ["JAMES'S", 'ISLAND', 'SHOWTIME']);
  assert.deepEqual(City.heroWords(''), ['ISLAND', 'SHOWTIME']);
  /* the only text drawn anywhere in the module is the hero board's word list */
  assert.equal((SRC.match(/fillText\(/g) || []).length, 1);
  assert.match(SRC, /var words = heroWords\(name\)/);
  assert.ok(!/k-?pop|idol/i.test(SRC), 'no K-pop / idol wording');
  assert.ok(!/[ᄀ-ᇿ㄰-㆏가-힯]/.test(SRC), 'no Hangul');
});

/* ---------------- runtime contract (source checks; create() runs in the lab) ---------------- */
test('city: every shader uniform is wired in create(), nothing is pickable and the hooks env calls exist', () => {
  const uniforms = new Set();
  for (const s of [City.SHADERS.CITY_VERT, City.SHADERS.CITY_FRAG]) for (const m of s.matchAll(/uniform \w+ (u\w+);/g)) uniforms.add(m[1]);
  for (const u of uniforms) assert.match(SRC, new RegExp('\\b' + u + ': \\{ value'), u + ' is set up');
  assert.ok(uniforms.has('uLed') && uniforms.has('uHero'), 'the LED atlas and the hero board are sampled');
  for (const hook of ['update:', 'setShow:', 'setMember:', 'setUser:', 'setReduced:', 'reflections:', 'info:', 'dispose:']) assert.ok(SRC.includes(hook), hook);
  assert.match(SRC, /raycast = noPick/);
  assert.match(SRC, /userData\.pickable = false/);
  assert.match(SRC, /fog: false/);
  assert.match(City.SHADERS.CITY_FRAG, /#include <colorspace_fragment>/);
});

test('city: reflection sources (≤ the tier budget), roosts and fallback window strips are well formed', () => {
  for (const t of TIERS) {
    const lay = lays[t];
    assert.deepEqual(lay.reflectors.slice(0, 4).map((r) => r.src), ['barge', 'barge', 'barge', 'wheel'], 'barges and the wheel first');
    assert.ok(lay.reflectors.length >= Tier.BUDGETS[t].reflections, t + ' enough sources for the budget');
    for (const r of lay.reflectors) {
      assert.ok(r.z > City.quayZ(Math.max(-16.9, Math.min(16.9, r.x))) - 1e-6, 'pillars start on the water');
      assert.ok(r.z < -4.4, 'behind the island (the sea shader skips z > -4.4)');
      assert.ok(r.w > 0 && r.base > 0 && r.base <= 1);
    }
    const strips = City.windowStrips(lay);
    assert.deepEqual(strips, City.windowStrips(lay));
    assert.ok(strips.length > lay.buildings.length / 2);
  }
  const roosts = City.roosts(lays.MID);
  assert.ok(roosts.length >= 10);
  for (const r of roosts) {
    assert.ok(!City.inExclusion(r.x, r.z), 'roosts stay off the island');
    assert.ok(r.y > G.SEA_Y + 0.4 && Number.isFinite(r.yaw));
    assert.ok(['pylon', 'cable', 'rail'].includes(r.at));
  }
});
