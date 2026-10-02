/* ================================================================
   Encore Shootout 3D — pooled particles (ES module).
   Everything is preallocated on the kit's instanced billboard pools
   (K.billboards): one additive 'glow' pool (sparkles ✦, gold sparks,
   firework rings), one normal-blend pool (confetti, hearts, grass tufts,
   streamers), one additive halo pool (crowd wands, ball, gloves, pins) and,
   in the Snow stadium, a snowfall pool. Stepping never allocates.
   Reduced motion: confetti and fireworks become a 0.4 s sparkle fade.
   ================================================================ */
import * as THREE from 'three';

const TAU = Math.PI * 2;

function Sim(pool, cap) {
  this.pool = pool; this.cap = cap;
  this.alive = new Uint8Array(cap);
  const f = () => new Float32Array(cap);
  this.px = f(); this.py = f(); this.pz = f(); this.vx = f(); this.vy = f(); this.vz = f();
  this.age = f(); this.life = f(); this.size = f(); this.rot = f(); this.rv = f(); this.grav = f(); this.drag = f();
  this.cell = f(); this.grow = f(); this.col = new Array(cap).fill(null);
  this.live = 0;
}
Sim.prototype.spawn = function (x, y, z, vx, vy, vz, life, size, col, cell, grav, drag, rot, rv, grow) {
  const i = this.pool.alloc();
  if (i < 0 || i >= this.cap) { if (i >= 0) this.pool.free(i); return -1; }
  this.alive[i] = 1; this.live++;
  this.px[i] = x; this.py[i] = y; this.pz[i] = z; this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
  this.age[i] = 0; this.life[i] = life; this.size[i] = size; this.col[i] = col; this.cell[i] = cell;
  this.grav[i] = grav; this.drag[i] = drag; this.rot[i] = rot; this.rv[i] = rv; this.grow[i] = grow || 0;
  return i;
};
Sim.prototype.step = function (dt) {
  if (!this.live) return;
  const p = this.pool;
  for (let i = 0; i < this.cap; i++) {
    if (!this.alive[i]) continue;
    this.age[i] += dt;
    const a = this.age[i], L = this.life[i];
    if (a >= L) { this.alive[i] = 0; this.live--; this.col[i] = null; p.free(i); continue; }
    const dk = Math.exp(-this.drag[i] * dt);
    this.vy[i] -= this.grav[i] * dt;
    this.vx[i] *= dk; this.vy[i] *= dk; this.vz[i] *= dk;
    this.px[i] += this.vx[i] * dt; this.py[i] += this.vy[i] * dt; this.pz[i] += this.vz[i] * dt;
    this.rot[i] += this.rv[i] * dt;
    const u = a / L, alpha = Math.min(1, a / 0.06) * (u > 0.7 ? (1 - u) / 0.3 : 1);
    p.set(i, this.px[i], this.py[i], this.pz[i], this.size[i] * (1 + this.grow[i] * u), this.col[i], alpha, this.cell[i], this.rot[i]);
  }
};
Sim.prototype.clear = function () {
  for (let i = 0; i < this.cap; i++) if (this.alive[i]) { this.alive[i] = 0; this.col[i] = null; this.pool.free(i); }
  this.live = 0;
};

export function makeFx(A, o) {
  o = o || {};
  const K = A.K, AT = K.ATLAS || {}, budget = A.budget || {}, low = A.low;
  const total = Math.max(96, (budget.particles | 0) || (low ? 128 : 256));
  const glowCap = Math.round(total * 0.45), confCap = Math.round(total * 0.55);
  const glowPool = K.billboards({ capacity: glowCap, texture: 'sparkles', additive: true, name: 'fxGlow', renderOrder: 7 });
  const confPool = K.billboards({ capacity: confCap, texture: 'sparkles', additive: false, name: 'fxConfetti', renderOrder: 6 });
  const halos = K.billboards({ capacity: (o.halos | 0) || 140, texture: 'halo', additive: true, name: 'halos', renderOrder: 5 });
  const glow = new Sim(glowPool, glowCap), conf = new Sim(confPool, confCap);
  const group = new THREE.Group(); group.name = 'fx';
  group.add(glowPool.mesh, confPool.mesh, halos.mesh);
  const sig = A.col(o.sig || '#6C5CE7');
  const pastel = (o.pastel || ['#FF8FC8', '#4FC3F7', '#FFD23F', '#7BD88F', '#C38BFF']).map((h) => A.col(h));
  const gold = A.col('#FFD23F'), goldLight = A.col('#FFF3B3'), white = A.col('#FFFFFF'), pink = A.col('#FF8FC8'), heartPink = A.col('#FF5FA2');
  const holo = ['#FFB3E6', '#B3E5FF', '#C9FFE5', '#FFF3B3'].map((h) => A.col(h));
  let seed = (o.seed >>> 0) || 7, reduced = !!o.reduced, scale = 1;
  function rnd() { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed / 4294967296; }
  function count(n) { return Math.max(1, Math.round(n * scale * (A.quality && A.quality.particleScale ? A.quality.particleScale : 1))); }
  function confettiCol() { return rnd() < 0.4 ? sig : pastel[(rnd() * pastel.length) | 0]; }
  /* a reduced-motion stand-in for any big burst: sparkles that simply fade in place */
  function fadeSparkles(x, y, z, n, col, spread) {
    for (let i = 0; i < count(n); i++) {
      glow.spawn(x + (rnd() - 0.5) * spread, y + (rnd() - 0.5) * spread, z + (rnd() - 0.5) * 0.2, 0, 0, 0, 0.4, 0.14, col || (i % 2 ? gold : white), AT.sparkle | 0, 0, 0, 0, 0, 0.3);
    }
  }
  const fx = {
    group, halos, glowPool, confPool,
    setReduced(on) { reduced = !!on; },
    setScale(k) { scale = Math.max(0.25, Math.min(1, k)); },
    reserve(pool, n) {
      const out = new Int32Array(n).fill(-1), p = pool === 'glow' ? glowPool : pool === 'conf' ? confPool : halos;
      for (let i = 0; i < n; i++) out[i] = p.alloc();
      return out;
    },
    /* confetti cannon: n pieces (hearts, stars, rectangles; 40 % in the signature colour) */
    confetti(x, y, z, n, dx, dy, dz, spread) {
      if (reduced) { fadeSparkles(x, y + 0.6, z, Math.min(10, n), null, 1.2); return; }
      const cells = [AT.rect | 0, AT.heart | 0, AT.star | 0, AT.rect | 0];
      for (let i = 0; i < count(n); i++) {
        const sp = 4 + rnd() * 2.5;
        const vx = (dx + (rnd() - 0.5) * spread) * sp, vy = (dy + (rnd() - 0.5) * spread * 0.6) * sp, vz = (dz + (rnd() - 0.5) * spread) * sp;
        conf.spawn(x, y, z, vx, vy, vz, 1.6 + rnd() * 0.7, 0.12 + rnd() * 0.06, confettiCol(), cells[i % cells.length], 4, 1.2, rnd() * TAU, (rnd() - 0.5) * 9);
      }
    },
    /* ✦ burst: n sparkles flying out at `speed` */
    sparkles(x, y, z, n, speed, col, life, size) {
      for (let i = 0; i < count(n); i++) {
        const a = rnd() * TAU, b = (rnd() - 0.5) * Math.PI, s = speed * (0.5 + rnd() * 0.6);
        glow.spawn(x, y, z, Math.cos(a) * Math.cos(b) * s, Math.sin(b) * s + 0.4, Math.sin(a) * Math.cos(b) * s * 0.5, (life || 0.6) * (0.8 + rnd() * 0.4), size || 0.14,
          col || (i % 3 ? gold : white), AT.sparkle | 0, 0, 2.2, 0, 0, 0.2);
      }
    },
    /* a ring of n ✦ in the plane facing the camera (the first top corner, fireworks, the dance finale) */
    ring(x, y, z, n, radiusSpeed, col, life) {
      if (reduced) { fadeSparkles(x, y, z, Math.min(10, n), col, 0.6); return; }
      for (let i = 0; i < count(n); i++) {
        const a = i / n * TAU;
        glow.spawn(x, y, z, Math.cos(a) * radiusSpeed, Math.sin(a) * radiusSpeed, 0, life || 0.9, 0.16, col || (i % 2 ? gold : goldLight), AT.sparkle | 0, 0.4, 1.4, 0, 0, 0.1);
      }
    },
    /* gold sparks off the woodwork */
    sparks(x, y, z, n) {
      for (let i = 0; i < count(n); i++) {
        const a = rnd() * TAU, s = 2 + rnd() * 2.2;
        glow.spawn(x, y, z, Math.cos(a) * s, Math.abs(Math.sin(a)) * s * 0.8 + 0.6, 0.8 + rnd() * 1.2, 0.5 + rnd() * 0.2, 0.12, i % 2 ? gold : goldLight, AT.sparkle | 0, 4, 1.5, 0, 0);
      }
    },
    /* grass tufts at the strike */
    dust(x, y, z, n, col) {
      for (let i = 0; i < count(n); i++) {
        const a = rnd() * TAU, s = 0.7 + rnd() * 0.8;
        conf.spawn(x, y, z, Math.cos(a) * s, 0.9 + rnd() * 0.8, Math.sin(a) * s * 0.6, 0.5 + rnd() * 0.15, 0.09, col, AT.puff | 0, 5, 2, rnd() * TAU, 0);
      }
    },
    /* hearts floating up (the fan who catches a wide ball, finger hearts at the dance finale) */
    hearts(x, y, z, n, col) {
      for (let i = 0; i < count(n); i++) {
        conf.spawn(x + (rnd() - 0.5) * 0.5, y + rnd() * 0.15, z + (rnd() - 0.5) * 0.2, (rnd() - 0.5) * 0.3, 0.6 + rnd() * 0.3, 0, 0.9 + rnd() * 0.3, 0.16, col || (i % 2 ? heartPink : pink), AT.heart | 0, -0.1, 0.5, 0, 0);
      }
    },
    /* curly streamers falling from the stand roof */
    streamers(n) {
      if (reduced) { fadeSparkles(0, 3.0, -6.0, 10, null, 6); return; }
      for (let i = 0; i < count(n); i++) {
        const x = -7 + 14 * (i + 0.5) / n;
        conf.spawn(x, 3.1, -5.8, (rnd() - 0.5) * 0.6, 1.2 + rnd() * 0.8, 1.2 + rnd() * 1.4, 2.4 + rnd() * 0.6, 0.3, i % 3 === 0 ? sig : holo[i % holo.length], AT.curl | 0, 1.3, 1.4, rnd() * TAU, (rnd() - 0.5) * 3);
      }
    },
    /* a star-strike ribbon puff, gold → pink */
    starTrail(x, y, z) { glow.spawn(x, y, z, 0, 0, 0, 0.35, 0.18, rnd() < 0.5 ? gold : heartPink, AT.star | 0, 0, 0, rnd() * TAU, 2, 0.2); },
    step(dt) {
      if (dt > 0) { glow.step(dt); conf.step(dt); }
      glowPool.commit(); confPool.commit(); halos.commit();
    },
    clear() { glow.clear(); conf.clear(); glowPool.commit(); confPool.commit(); },
    dispose() { glow.clear(); conf.clear(); glowPool.dispose(); confPool.dispose(); halos.dispose(); }
  };
  return fx;
}

/* ================================================================
   SNOWFALL (Snow stadium): 60 / 100 / 150 flakes by tier, drifting down
   through a box over the pitch; still under reduced motion
   ================================================================ */
export function makeSnow(A, n) {
  const K = A.K, AT = K.ATLAS || {};
  const pool = K.billboards({ capacity: n, texture: 'sparkles', additive: false, name: 'snow', renderOrder: 6 });
  const x = new Float32Array(n), y = new Float32Array(n), z = new Float32Array(n), ph = new Float32Array(n), col = A.col('#FFFFFF');
  let s = 12345;
  const r = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  for (let i = 0; i < n; i++) {
    pool.alloc();
    x[i] = -12 + 24 * r(); y[i] = 9 * r(); z[i] = -7 + 21 * r(); ph[i] = r() * TAU;
  }
  return {
    mesh: pool.mesh,
    update(dt, t, reduced) {
      for (let i = 0; i < n; i++) {
        if (!reduced) {
          y[i] -= (0.5 + 0.25 * Math.sin(ph[i])) * dt;
          if (y[i] < 0) { y[i] += 9; x[i] = -12 + 24 * r(); }
        }
        const sx = reduced ? 0 : 0.25 * Math.sin(t * 0.8 + ph[i]);
        pool.set(i, x[i] + sx, y[i], z[i], 0.09, col, 0.85, AT.snow | 0, ph[i]);
      }
      pool.commit();
    },
    dispose() { pool.dispose(); }
  };
}
