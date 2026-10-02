/* ================================================================
   My Island 3D — the runtime stage (classic script, browser).
   Loaded by rewards-world (loadScript('world/island3d/stage.js?v=N')).
   Owns the loading of three + its 2 addons + the island3d scripts, the
   device tier, the ONE shared WebGLRenderer (leased to the island now and
   the 3D games later), frame pacing, pausing, context loss, adaptive
   quality and disposal. It never touches the island's rules or DOM.

   window.SLIsland3D
     .boot({ver, deadlineMs = 8000, t0, tier, force}) → Promise<boolean>   island use; mount() is island3d.js
     .ensure({deadlineMs, tier})        → Promise<SL3D|null>  memoised; loads everything WITHOUT mounting a scene
     .remembered(ver) → {off, why, ver}|null, .remember2D(why), .forget(), .failed() → reason|null
     .dispose({keepKit})                stop, drop the renderer (force-lost) and the kit caches

   window.SL3D (registry; usable before THREE arrives)
     .defineModels(category, factory(K, SL3D) → {id: {build, idle, act, show}})
     .defineApi(name, factory(K, SL3D) → value)        e.g. 'makeRig', 'makeAvatar', 'makeWand', 'makeFanBlob'
   …and once ready:
     .THREE, .addons {RoundedBoxGeometry, BufferGeometryUtils}, .tier, .budget, .quality, .models, .missing
     .kit(tier) → K                     (kit.js; one K per tier sharing materials and caches)
     .make(id, st, tier) → Object3D     one catalogue item / kart / ball (placeholder if its model is missing)
     .lease(owner, handlers) → Lease    the shared renderer + paced loop (see Lease below)
     .createRenderer(opts)              a SEPARATE renderer with the tier's settings (photocards)
     .onQuality(fn) → unsubscribe, .info(), .dispose()
   Model/character scripts register only their own SL3D keys; load order never
   affects correctness, and a missing file only means placeholders.
   ================================================================ */
(function (root, factory) {
  var hasDom = typeof window !== 'undefined' && typeof document !== 'undefined' && !!document.createElement;
  var api = factory(root, hasDom);
  if (typeof module === 'object' && module.exports) module.exports = api;   /* Node: the pure helpers, for tests */
}(typeof self !== 'undefined' ? self : typeof globalThis !== 'undefined' ? globalThis : this, function (root, HAS_DOM) {
  'use strict';

  var VERSION = 1;

  /* Every script boot injects (relative to this file), in execution order. A
     `global` entry is skipped when that global already exists (the app loaded
     it); `required` files must arrive or 3D is unavailable; the rest are
     tolerated when missing (they land in later build waves). */
  var FILES = [
    { path: '../world-look.js', global: 'SLIslandLook' },
    { path: 'tier.js', global: 'SLTier', required: true },
    { path: 'grid3d.js', global: 'SLGrid3D' },
    { path: 'motion.js', global: 'SLMotion' },
    { path: 'kit.js', global: 'SLKit', required: true },
    { path: 'env.js' },
    { path: 'models-garden.js' },
    { path: 'models-home.js' },
    { path: 'models-fun.js' },
    { path: 'models-attractions.js' },
    { path: 'models-characters.js' },
    { path: 'pets-brain.js', global: 'SLPetBrain' },
    { path: 'actors.js' },
    { path: 'fx3d.js' },
    { path: 'edit3d.js' },
    { path: 'camera.js' },
    { path: 'island3d.js' },
    { path: 'photocard.js', global: 'SLPhotocard' },
    { path: '../sound.js', global: 'SLSound' },
    { path: '../music.js', global: 'SLMusic' }
  ];
  var ADDONS = ['three/addons/geometries/RoundedBoxGeometry.js', 'three/addons/utils/BufferGeometryUtils.js'];
  /* kinds that need their own registered model (styles, variants, land, pets and
     accessories render through the house, attractions and character rigs) */
  var MODEL_KINDS = ['house', 'attraction', 'decor', 'path', 'fun', 'cosmetic'];
  var CORE_KEYS = ['__stage', 'version', 'THREE', 'addons', 'tier', 'budget', 'quality', 'facts', 'tierWhy', 'models', 'modelCategory',
    'missing', 'ready', 'qa', 'issues', 'loaded', 'kit', 'defineModels', 'defineApi', 'make', 'lease', 'createRenderer',
    'onQuality', 'info', 'dispose', 'log', 'FILES'];
  var REMEMBER_KEY = 'slIsland3D', TIER_KEY = 'slTier3d', LOST_KEY = 'slGlLost';

  /* ================================================================
     PURE HELPERS (exported for Node tests)
     ================================================================ */
  /* where the sibling scripts live, and the ?v= query to reuse */
  function baseFrom(src, baseURI, ver) {
    try {
      if (src) {
        var u = new URL(src, baseURI);
        var q = u.search;
        u.search = ''; u.hash = '';
        return { dir: u.href.replace(/[^\/]*$/, ''), query: q };
      }
    } catch (e) {}
    return { dir: new URL('world/island3d/', baseURI).href, query: '?v=' + (ver || '1') };
  }
  /* the injection list: [{path, url, skip, required}] */
  function scriptList(base, globals) {
    globals = globals || {};
    return FILES.map(function (f) {
      return {
        path: f.path, url: new URL(f.path, base.dir).href + (base.query || ''),
        skip: !!(f.global && globals[f.global]), required: !!f.required, global: f.global || null
      };
    });
  }
  /* the resolved style for an item: house {wall, roof, door, details}; att_course {course};
     att_pitch {ball, stadium}; att_kart {kart}; pets {acc}; otherwise st or {} */
  function resolveSt(id, st, defaults) {
    st = st || {}; defaults = defaults || {};
    function pick(k, dflt) { return st[k] || defaults[k] || dflt; }
    if (id === 'house_cottage') return { wall: pick('wall', 'wall_cream'), roof: pick('roof', 'roof_red'), door: pick('door', 'door_blue'), details: st.details || {} };
    if (id === 'att_course') return { course: pick('course', 'course_meadow') };
    if (id === 'att_pitch') return { ball: pick('ball', 'ball_classic'), stadium: pick('stadium', 'stadium_day') };
    if (id === 'att_kart') return { kart: pick('kart', 'kart_red') };
    if (/^pet_/.test(id)) return { acc: st.acc || {} };
    return st;
  }
  /* the remembered-2D record: {off, why, ver}; stale when SL_WORLD_VER changed or
     a parent opened ?3d=1. Returns {rec, clear} so the caller can tidy storage. */
  function rememberedFrom(raw, ver, search) {
    if (/[?&]3d=1(&|$)/.test(search || '')) return { rec: null, clear: true };
    var rec = null;
    try { rec = raw ? JSON.parse(raw) : null; } catch (e) { return { rec: null, clear: true }; }
    if (!rec || typeof rec !== 'object' || !rec.off) return { rec: null, clear: false };
    if (String(rec.ver) !== String(ver)) return { rec: null, clear: true };
    return { rec: rec, clear: false };
  }
  /* the measured tier to save: never raises an earlier saved tier */
  function tierToSave(saved, next, order) {
    order = order || ['LOW', 'MID', 'HIGH'];
    var a = order.indexOf(String(saved || '').toUpperCase()), b = order.indexOf(String(next || '').toUpperCase());
    if (b < 0) return null;
    if (a < 0 || b < a) return order[b];
    return null;
  }

  if (HAS_DOM) install();

  return {
    VERSION: VERSION, FILES: FILES, ADDONS: ADDONS, MODEL_KINDS: MODEL_KINDS,
    baseFrom: baseFrom, scriptList: scriptList, resolveSt: resolveSt,
    rememberedFrom: rememberedFrom, tierToSave: tierToSave
  };

  /* ================================================================
     BROWSER RUNTIME
     ================================================================ */
  function install() {
    var prev = root.SL3D;
    if (prev && prev.__stage) return;                         /* already installed */

    var me = (document.currentScript && document.currentScript.src) || '';
    var BASE = baseFrom(me, document.baseURI, root.SL_WORLD_VER);
    var perfNow = (root.performance && root.performance.now) ? function () { return root.performance.now(); } : Date.now;

    function ls(op, k, v) {
      try {
        if (op === 'get') return root.localStorage.getItem(k);
        if (op === 'set') root.localStorage.setItem(k, v);
        if (op === 'del') root.localStorage.removeItem(k);
      } catch (e) {}
      return null;
    }
    var QA = ls('get', 'slQaMode') === '1';

    /* ---------------- the SL3D registry ---------------- */
    var SL3D = {
      __stage: VERSION, version: VERSION, FILES: FILES,
      THREE: null, addons: null, tier: null, budget: null, quality: null, facts: null, tierWhy: '',
      models: {}, modelCategory: {}, missing: [], ready: false, qa: QA, issues: [], loaded: {}
    };
    if (prev && typeof prev === 'object') {
      Object.keys(prev).forEach(function (k) { if (CORE_KEYS.indexOf(k) < 0) SL3D[k] = prev[k]; });
    }
    root.SL3D = SL3D;
    function log(msg) { if (QA && root.console) root.console.info('[SL3D] ' + msg); }
    function issue(msg) { SL3D.issues.push(msg); if (QA && root.console) root.console.warn('[SL3D] ' + msg); }
    function errText(e) { return e && e.message ? e.message : String(e); }
    function safe(fn) {
      var args = Array.prototype.slice.call(arguments, 1);
      try { return fn.apply(null, args); } catch (e) { issue('handler threw: ' + errText(e)); return undefined; }
    }
    SL3D.log = log;

    var factories = [], apis = [], apiNames = {}, hub = null;
    SL3D.defineModels = function (category, factory) {
      if (typeof factory !== 'function') { issue('defineModels(' + category + '): factory is not a function'); return; }
      var e = { category: String(category || 'misc'), factory: factory, ran: false };
      factories.push(e);
      if (SL3D.ready) { runFactory(e); checkCoverage(); }
    };
    SL3D.defineApi = function (name, factory) {
      if (typeof name !== 'string' || !name || CORE_KEYS.indexOf(name) >= 0) { issue('defineApi: "' + name + '" is reserved or invalid'); return; }
      if (typeof factory !== 'function') { issue('defineApi(' + name + '): factory is not a function'); return; }
      var e = { name: name, factory: factory, ran: false };
      apis.push(e);
      if (SL3D.ready) runApi(e);
    };
    SL3D.kit = function () { return null; };                   /* real one once THREE is ready */
    SL3D.make = make;
    SL3D.lease = lease;
    SL3D.createRenderer = createRenderer;
    SL3D.info = info;
    SL3D.dispose = disposeAll;
    var qualityListeners = [];
    SL3D.onQuality = function (fn) {
      if (typeof fn !== 'function') return function () {};
      qualityListeners.push(fn);
      return function () { var i = qualityListeners.indexOf(fn); if (i >= 0) qualityListeners.splice(i, 1); };
    };

    function runFactory(e) {
      if (e.ran) return;
      e.ran = true;
      var out;
      try { out = e.factory(SL3D.kit(SL3D.tier), SL3D); } catch (err) { issue('models "' + e.category + '" factory threw: ' + errText(err)); return; }
      if (!out || typeof out !== 'object') { issue('models "' + e.category + '" factory returned nothing'); return; }
      Object.keys(out).forEach(function (id) {
        var h = out[id];
        if (!h || typeof h !== 'object') { issue('model ' + id + ' is not an object'); return; }
        if (typeof h.build !== 'function') issue('model ' + id + ' has no build() (placeholder)');
        if (SL3D.models[id]) { issue('model ' + id + ' registered by "' + SL3D.modelCategory[id] + '" and "' + e.category + '"; keeping the first'); return; }
        SL3D.models[id] = h;
        SL3D.modelCategory[id] = e.category;
      });
    }
    function runApi(e) {
      if (e.ran) return;
      e.ran = true;
      var v;
      try { v = e.factory(SL3D.kit(SL3D.tier), SL3D); } catch (err) { issue('api ' + e.name + ' factory threw: ' + errText(err)); return; }
      if (v == null) { issue('api ' + e.name + ' factory returned nothing'); return; }
      if (apiNames[e.name]) { issue('api ' + e.name + ' defined twice; keeping the first'); return; }
      apiNames[e.name] = true;
      SL3D[e.name] = v;
    }
    function checkCoverage() {
      var L = root.SLIslandLook, C = root.SLWorldCore, miss = [];
      var ids = L && L.LOOK ? Object.keys(L.LOOK) : (C && C.CATALOG ? C.CATALOG.map(function (i) { return i.id; }) : []);
      ids.forEach(function (id) {
        var it = null;
        try { it = C && typeof C.item === 'function' ? C.item(id) : null; } catch (e) { it = null; }
        var kind = (it && it.kind) || (L && L.LOOK && L.LOOK[id] && L.LOOK[id].kind) || '';
        if (MODEL_KINDS.indexOf(kind) < 0) return;
        if (!SL3D.models[id] || typeof SL3D.models[id].build !== 'function') miss.push(id);
      });
      SL3D.missing = miss;
      if (miss.length) log('no model yet for ' + miss.length + ' ids (placeholders): ' + miss.join(', '));
    }
    function catalogDefaults() {
      var C = root.SLWorldCore;
      return (C && C.DEFAULTS) || {};
    }

    /* ---------------- make(id, st, tier) → Object3D ---------------- */
    function make(id, st, tier) {
      if (!SL3D.ready) return null;
      var t = root.SLTier.parseTier(tier) || SL3D.tier;
      var K = SL3D.kit(t);
      var rs = resolveSt(id, st, catalogDefaults());
      var tpl = K.templates.get(id, K.stateKey(id, rs), t, rs);
      var obj = K.instantiate(tpl, { outlines: SL3D.quality.outlines });
      obj.userData.model = SL3D.models[id] || null;
      return obj;
    }

    /* ---------------- loading ---------------- */
    var loadP = null, permanent = null, sessionFail = null, injected = {};
    function setPermanent(why) { if (!permanent) { permanent = why; log('3D unavailable: ' + why); } }
    var dynImport = (function () {
      try { var f = new Function('u', 'return import(u)'); return function (u) { try { return f(u); } catch (e) { return Promise.reject(e); } }; }
      catch (e) { return function () { return Promise.reject(new Error('dynamic import unavailable')); }; }
    }());
    function probeGL() {
      var out = { webgl2: false, maxTex: 0, caveat: false };
      function tryCtx(attrs) {
        try {
          var c = document.createElement('canvas');
          var gl = c.getContext('webgl2', attrs);
          if (!gl) return false;
          out.maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) | 0;
          var ext = gl.getExtension('WEBGL_lose_context');
          if (ext) ext.loseContext();
          return true;
        } catch (e) { return false; }
      }
      if (tryCtx({ failIfMajorPerformanceCaveat: true })) out.webgl2 = true;
      else if (tryCtx({})) { out.webgl2 = true; out.caveat = true; }   /* software / blocklisted GPU: LOW */
      return out;
    }
    function loadScripts() {
      var list = scriptList(BASE, root);
      return Promise.all(list.map(function (f) {
        if (f.skip) { SL3D.loaded[f.path] = 'present'; return Promise.resolve(true); }
        if (injected[f.url]) return injected[f.url];
        return (injected[f.url] = new Promise(function (res) {
          var s = document.createElement('script');
          s.src = f.url;
          s.async = false;                                   /* parallel download, ordered execution */
          s.onload = function () { SL3D.loaded[f.path] = true; res(true); };
          s.onerror = function () { SL3D.loaded[f.path] = false; if (f.required) issue('required file missing: ' + f.path); else log('not built yet: ' + f.path); res(false); };
          document.head.appendChild(s);
        }));
      }));
    }
    function load(opts) {
      if (ls('get', 'slNo3D') === '1') { setPermanent('slNo3D'); return Promise.resolve(false); }
      if (typeof root.slLoad3D !== 'function') { setPermanent('no slLoad3D'); return Promise.resolve(false); }
      if (typeof root.WebGL2RenderingContext === 'undefined') { setPermanent('no WebGL2'); return Promise.resolve(false); }
      var gl = probeGL();
      if (!gl.webgl2) { setPermanent('no WebGL2 context'); return Promise.resolve(false); }
      var tP = Promise.resolve().then(function () { return root.slLoad3D(); }).catch(function () { return null; });
      var aP = Promise.all(ADDONS.map(dynImport)).then(function (m) {
        return { RoundedBoxGeometry: m[0] && m[0].RoundedBoxGeometry, BufferGeometryUtils: m[1] };
      }).catch(function (e) { log('addon import failed: ' + errText(e)); return null; });
      var sP = loadScripts();
      var all = Promise.all([tP, aP, sP]).then(function (r) {
        if (SL3D.ready) return true;
        var T = r[0], addons = r[1];
        if (!T || !T.WebGLRenderer) { setPermanent('three did not load'); return false; }
        if (!addons || !addons.RoundedBoxGeometry) { setPermanent('addons did not load'); return false; }
        if (!root.SLTier || !root.SLKit) { setPermanent('tier.js / kit.js missing'); return false; }
        try { init(T, addons, gl, opts); } catch (e) { issue('init failed: ' + errText(e)); setPermanent('init'); return false; }
        return true;
      });
      /* an outer guard: a stalled request frees the memo so a later open may retry
         (the work above still completes and readies SL3D if it arrives) */
      var guard = new Promise(function (res) { setTimeout(function () { res(false); }, opts.loadTimeoutMs || 20000); });
      return Promise.race([all, guard]);
    }
    function ensure(opts) {
      opts = opts || {};
      if (!HAS_DOM) return Promise.resolve(null);
      if (SL3D.ready) return Promise.resolve(SL3D);
      if (permanent) return Promise.resolve(null);
      if (!loadP) {
        loadP = load(opts).then(function (ok) {
          if (!ok) loadP = null;
          return ok || SL3D.ready ? SL3D : null;
        }, function (e) { issue('load: ' + errText(e)); loadP = null; return null; });
      }
      var p = loadP, ms = Number(opts.deadlineMs);
      if (ms > 0 && isFinite(ms)) {
        p = Promise.race([p, new Promise(function (res) { setTimeout(function () { res(SL3D.ready ? SL3D : null); }, ms); })]);
      }
      return p;
    }

    /* ---------------- tier + init ---------------- */
    var aq = null, pacer = null;
    function readSavedTier() { return root.SLTier.parseTier(ls('get', TIER_KEY)); }
    function saveTier(t) {
      var v = tierToSave(readSavedTier(), t, root.SLTier.TIERS);
      if (v) { ls('set', TIER_KEY, v); log('saved tier ' + v); }
    }
    function qaTier() {
      if (!QA) return null;
      try { var m = /[?&]tier=(low|mid|high)\b/i.exec(root.location.search); return m ? m[1].toUpperCase() : null; } catch (e) { return null; }
    }
    function init(T, addons, gl, opts) {
      if (SL3D.ready) return;
      var Tier = root.SLTier;
      var f = Tier.facts(root.navigator, { maxTex: gl.maxTex, caveat: gl.caveat, saved: readSavedTier() });
      var ex = Tier.explain(f);
      var tier = Tier.parseTier(opts.tier) || qaTier() || ex.tier;
      SL3D.THREE = T;
      SL3D.addons = addons;
      SL3D.facts = f;
      SL3D.tierWhy = tier === ex.tier ? ex.why : 'override (' + ex.why + ')';
      SL3D.tier = tier;
      SL3D.budget = Tier.budget(tier, root.devicePixelRatio || 1);
      SL3D.quality = {
        pixelRatio: SL3D.budget.pixelRatio, shadows: !!SL3D.budget.shadows, outlines: !!SL3D.budget.outlines,
        particleScale: 1, cones: true, steps: []
      };
      var skip = [];
      if (!SL3D.budget.shadows) skip.push('shadows');
      if (!SL3D.budget.outlines) skip.push('outlines');
      aq = Tier.AdaptiveQuality({ skip: skip });
      pacer = Tier.FramePacer({});
      hub = root.SLKit.create(T, {
        addons: addons, models: SL3D.models, qa: QA,
        look: function () { return root.SLIslandLook || null; }
      });
      SL3D.kit = function (t) { return hub.kit(Tier.parseTier(t) || SL3D.tier); };
      if (!SL3D.quality.outlines) hub.setOutlines(false);
      factories.forEach(runFactory);
      apis.forEach(runApi);
      checkCoverage();
      SL3D.ready = true;
      listen();
      log('ready: tier ' + tier + ' (' + SL3D.tierWhy + '), ' + Object.keys(SL3D.models).length + ' models');
    }

    /* ---------------- renderers ---------------- */
    function createRenderer(o) {
      o = o || {};
      var T = SL3D.THREE;
      if (!T) return null;
      try {
        var r = new T.WebGLRenderer({
          canvas: o.canvas, antialias: o.antialias != null ? !!o.antialias : !!SL3D.budget.antialias,
          alpha: !!o.alpha, stencil: false, depth: true, premultipliedAlpha: true,
          preserveDrawingBuffer: !!o.preserveDrawingBuffer, powerPreference: o.powerPreference || 'high-performance'
        });
        r.outputColorSpace = T.SRGBColorSpace;
        r.toneMapping = T.NeutralToneMapping != null ? T.NeutralToneMapping : T.ACESFilmicToneMapping;
        r.toneMappingExposure = 1.0;
        r.setPixelRatio(o.pixelRatio || SL3D.quality.pixelRatio);
        r.shadowMap.enabled = o.shadows != null ? !!o.shadows : SL3D.quality.shadows;
        r.shadowMap.type = T.PCFShadowMap;
        r.shadowMap.autoUpdate = false;                       /* the static map is re-rendered only on layout changes */
        if (o.width && o.height) r.setSize(o.width, o.height, false);
        r.domElement.style.display = 'block';
        return r;
      } catch (e) { issue('renderer: ' + errText(e)); return null; }
    }
    var renderer = null, lost = false, lostCount = 0, restoreTimer = 0, disposing = false;
    try { lostCount = parseInt(root.sessionStorage.getItem(LOST_KEY), 10) || 0; } catch (e) { lostCount = 0; }
    function shared() {
      if (renderer) return renderer;
      renderer = createRenderer({});
      if (!renderer) return null;
      renderer.domElement.addEventListener('webglcontextlost', onLost, false);
      renderer.domElement.addEventListener('webglcontextrestored', onRestored, false);
      return renderer;
    }
    function onLost(e) {
      if (e && e.preventDefault) e.preventDefault();          /* allow a restore */
      if (disposing) return;
      lost = true;
      lostCount++;
      try { root.sessionStorage.setItem(LOST_KEY, String(lostCount)); } catch (er) {}
      if (current) current._update();
      log('WebGL context lost (' + lostCount + ' this session)');
      if (lostCount >= 2) { remember2D('context'); failAll('context'); return; }
      if (current && current.h.onLost) safe(current.h.onLost, current);
      clearTimeout(restoreTimer);
      restoreTimer = setTimeout(function () { if (lost) failAll('context'); }, 6000);
    }
    function onRestored() {
      clearTimeout(restoreTimer);
      lost = false;
      log('WebGL context restored');
      if (!current) return;
      if (current.h.onRestored) safe(current.h.onRestored, current);   /* the island disposes + remounts here */
      if (pacer) pacer.invalidate();
      current._update();
    }
    function failAll(reason) {
      sessionFail = sessionFail || reason;
      var all = stack.concat(current ? [current] : []);
      all.forEach(function (L) { L._fail(reason); });
    }

    /* ---------------- adaptive quality ---------------- */
    function applyStep(step) {
      var q = SL3D.quality;
      if (!q || q.steps.indexOf(step) >= 0) return;
      q.steps.push(step);
      if (step === 'pixelRatio') {
        q.pixelRatio = Math.max(0.5, Math.round((q.pixelRatio - 0.25) * 100) / 100);
        if (renderer) renderer.setPixelRatio(q.pixelRatio);
      } else if (step === 'shadows') {
        q.shadows = false;
        if (renderer) renderer.shadowMap.enabled = false;     /* holders also set sun.castShadow = false */
      } else if (step === 'outlines') {
        q.outlines = false;
        if (hub) hub.setOutlines(false);
      } else if (step === 'particles') q.particleScale = 0.5;
      else if (step === 'cones') q.cones = false;
      log('quality step ' + q.steps.length + ': ' + step);
      if (q.steps.length === 2) saveTier(root.SLTier.lower(SL3D.tier));   /* next session starts cheaper */
      if (current && current.h.onQuality) safe(current.h.onQuality, q, step);
      qualityListeners.slice().forEach(function (fn) { safe(fn, q, step); });
    }
    function judge(act) {
      if (!act) return;
      if (act.type === 'step') applyStep(act.step);
      else if (act.type === 'fallback') {
        log('frames stay under 20 fps after every step: 2D for this device');
        remember2D('performance');
        saveTier('LOW');
        failAll('performance');
      }
    }

    /* ================================================================
       LEASE — the shared renderer for one holder at a time.
       handlers: {frame(dt, t, lease) → animating (false = idle; under reduced motion
                  the stage then renders only on demand), scene, camera (optional: the
                  stage renders them after frame), reduced, onResize(w, h), onQuality(q, step),
                  onLost(), onRestored() (dispose + remount), onFail(reason),
                  onRevoke(lease, 'lease'|'dispose') (another holder took the renderer, or the
                  stage was disposed and this lease is dead), onResume() (handed back:
                  re-parent lease.canvas, re-apply exposure and clear colour)}
       lease: {renderer, canvas, THREE, tier, budget, quality, scene, camera,
               start(), stop(), observe(el), resize(w, h), setCovered(on), setHidden(on),
               setReduced(on), input(), invalidate(), compile(scene, camera) → Promise,
               sample(workMs), info(), release(), active}
       Rendering pauses while: stopped, document hidden, setHidden (island tab
       closed), setCovered (a sheet/game), < 10% of the observed element in view,
       the context is lost, or another holder has the renderer.
       ================================================================ */
    var current = null, stack = [];
    function lease(owner, h) {
      if (!SL3D.ready || sessionFail) return null;
      var r = shared();
      if (!r) return null;
      var L = new Lease(String(owner || 'holder'), h || {}, r);
      if (current) { stack.push(current); current._revoke(); }
      current = L;
      L._grant(false);
      return L;
    }
    function Lease(owner, h, r) {
      this.owner = owner; this.h = h; this.renderer = r; this.canvas = r.domElement;
      this.THREE = SL3D.THREE; this.tier = SL3D.tier; this.budget = SL3D.budget; this.quality = SL3D.quality;
      this.scene = h.scene || null; this.camera = h.camera || null;
      this.t = 0;
      this._granted = false; this._running = false; this._released = false; this._failed = false;
      this._covered = false; this._hidden = false; this._offscreen = false; this._looping = false;
      this._reduced = !!h.reduced; this._anim = true; this._last = -1; this._lastSample = -1; this._target = 0;
      this._fps = 0; this._work = 0; this._w = 0; this._h = 0;
      this._el = null; this._io = null; this._ro = null;
      var self = this;
      this._tick = function () { self._frame(); };
    }
    Lease.prototype._update = function () {
      var want = this._granted && this._running && !this._released && !this._failed && !this._covered &&
        !this._hidden && !this._offscreen && !lost && !document.hidden && current === this;
      if (want === this._looping) return;
      this._looping = want;
      if (want) {
        this._last = -1;
        if (pacer) pacer.reset(perfNow());
        if (aq) aq.reset();
        this.renderer.setAnimationLoop(this._tick);
      } else this.renderer.setAnimationLoop(null);
    };
    Lease.prototype._frame = function () {
      var now = perfNow();
      /* an on-demand frame (reduced motion, nothing was animating) follows a gap that
         says nothing about speed, so it is not measured */
      var continuous = !pacer.reduced || this._anim;
      if (!pacer.tick(now, this._anim)) return;
      var interval = this._last < 0 ? 0 : now - this._last;
      var dt = this._last < 0 ? 1 / 60 : Math.min(0.1, interval / 1000);
      this._last = now;
      this.t += dt;
      var target = pacer.interval(now);
      if (target !== this._target) { this._target = target; aq.reset(); }   /* 60 ↔ 30 fps idle switch: fresh window */
      var t0 = perfNow();
      try {
        var res = this.h.frame ? this.h.frame(dt, this.t, this) : true;
        this._anim = res !== false;
        if (this.scene && this.camera) this.renderer.render(this.scene, this.camera);
      } catch (e) {
        issue(this.owner + ' frame threw: ' + errText(e));
        this._fail('frame');
        return;
      }
      var work = perfNow() - t0;
      this._work = this._work ? this._work * 0.9 + work * 0.1 : work;
      if (interval > 0 && continuous) {
        var fps = 1000 / interval;
        this._fps = this._fps ? this._fps * 0.9 + fps * 0.1 : fps;
        judge(aq.sample(work, interval, now, target));
      }
    };
    Lease.prototype._grant = function (resumed) {
      this._granted = true;
      var r = this.renderer, q = SL3D.quality;
      r.setPixelRatio(q.pixelRatio);
      r.shadowMap.enabled = q.shadows;
      if (this._w > 0 && this._h > 0) r.setSize(this._w, this._h, false);
      if (pacer) { pacer.setReduced(this._reduced); pacer.invalidate(); }
      if (resumed && this.h.onResume) safe(this.h.onResume, this);
      this._measure();
      this._update();
    };
    Lease.prototype._revoke = function () {
      this._granted = false;
      this._update();
      if (this.h.onRevoke) safe(this.h.onRevoke, this, 'lease');
    };
    Lease.prototype._fail = function (reason) {
      if (this._failed) return;
      this._failed = true;
      this._update();
      if (this.h.onFail) safe(this.h.onFail, reason, this);
    };
    Lease.prototype._measure = function () {
      var el = this._el;
      if (!el) return;
      var w = el.clientWidth | 0, h = el.clientHeight | 0;
      if (w > 0 && h > 0 && (w !== this._w || h !== this._h)) this.resize(w, h);
    };
    Lease.prototype._unobserve = function () {
      if (this._io) { this._io.disconnect(); this._io = null; }
      if (this._ro) { this._ro.disconnect(); this._ro = null; }
      this._offscreen = false;
    };
    Lease.prototype.start = function () { this._running = true; if (pacer && current === this) pacer.invalidate(); this._update(); return this; };
    Lease.prototype.stop = function () { this._running = false; this._update(); return this; };
    Lease.prototype.setCovered = function (on) { this._covered = !!on; if (!on && pacer) pacer.invalidate(); this._update(); return this; };
    Lease.prototype.setHidden = function (on) { this._hidden = !!on; if (!on && pacer) pacer.invalidate(); this._update(); return this; };
    Lease.prototype.setReduced = function (on) { this._reduced = !!on; if (pacer && current === this) pacer.setReduced(this._reduced); return this; };
    Lease.prototype.input = function () { if (pacer && current === this) pacer.input(perfNow()); return this; };
    Lease.prototype.invalidate = function () { if (pacer && current === this) pacer.invalidate(); return this; };
    Lease.prototype.observe = function (el) {
      this._unobserve();
      this._el = el || null;
      if (!el) return this;
      var self = this;
      if (typeof root.IntersectionObserver === 'function') {
        this._io = new root.IntersectionObserver(function (es) {
          var e = es[es.length - 1];
          self._offscreen = !e.isIntersecting || e.intersectionRatio < 0.1;
          self._update();
        }, { threshold: [0, 0.1, 0.25] });
        this._io.observe(el);
      }
      if (typeof root.ResizeObserver === 'function') {
        this._ro = new root.ResizeObserver(function () { self._measure(); });
        this._ro.observe(el);
      }
      this._measure();
      return this;
    };
    Lease.prototype.resize = function (w, h) {
      w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
      this._w = w; this._h = h;
      if (current === this) this.renderer.setSize(w, h, false);
      if (this.h.onResize) safe(this.h.onResize, w, h, this);
      this.invalidate();
      return this;
    };
    Lease.prototype.compile = function (scene, camera) {
      var r = this.renderer;
      try {
        if (typeof r.compileAsync === 'function') return r.compileAsync(scene || this.scene, camera || this.camera).catch(function () {});
        r.compile(scene || this.scene, camera || this.camera);
      } catch (e) { issue('compile: ' + errText(e)); }
      return Promise.resolve();
    };
    /* for holders that drive their own frames (e.g. a game view inside the shell's loop) */
    Lease.prototype.sample = function (workMs) {
      var now = perfNow();
      var interval = this._lastSample < 0 ? 0 : now - this._lastSample;
      this._lastSample = now;
      if (interval > 0 && aq && current === this && !this._failed) {
        this._fps = this._fps ? this._fps * 0.9 + (1000 / interval) * 0.1 : 1000 / interval;
        judge(aq.sample(workMs, interval, now, 1000 / 60));
      }
      return this;
    };
    Lease.prototype.info = function () {
      var ri = this.renderer.info;
      return {
        owner: this.owner, tier: this.tier, fps: Math.round(this._fps * 10) / 10, workMs: Math.round(this._work * 100) / 100,
        calls: ri.render.calls, tris: ri.render.triangles, programs: ri.programs ? ri.programs.length : 0,
        geometries: ri.memory.geometries, textures: ri.memory.textures,
        pixelRatio: this.renderer.getPixelRatio(), looping: this._looping, idle: pacer ? pacer.idle(perfNow()) : false,
        quality: SL3D.quality, aq: aq ? aq.stats() : null
      };
    };
    Lease.prototype.release = function () {
      if (this._released) return;
      this._released = true;
      this._running = false;
      this._update();
      this._unobserve();
      if (current === this) {
        current = null;
        var prev = stack.pop();
        while (prev && (prev._released || prev._failed)) prev = stack.pop();
        if (prev) { current = prev; prev._grant(true); }
      } else {
        var i = stack.indexOf(this);
        if (i >= 0) stack.splice(i, 1);
      }
    };
    Object.defineProperty(Lease.prototype, 'active', { get: function () { return current === this && this._granted && !this._failed && !this._released; } });

    /* ---------------- page-level listeners (installed once, at init) ---------------- */
    var listening = false;
    function listen() {
      if (listening) return;
      listening = true;
      document.addEventListener('visibilitychange', function () {
        if (!current) return;
        if (!document.hidden && pacer) pacer.invalidate();
        current._update();
      });
      var onInput = function () { if (pacer && current) pacer.input(perfNow()); };
      ['pointerdown', 'pointermove', 'wheel', 'keydown', 'touchstart'].forEach(function (t) {
        root.addEventListener(t, onInput, { passive: true, capture: true });
      });
      root.addEventListener('pagehide', function () { disposeAll(); });   /* free GPU memory; holders get onRevoke(lease, 'dispose') */
    }

    /* ---------------- remembered 2D ---------------- */
    function remembered(ver) {
      var search = '';
      try { search = root.location.search; } catch (e) {}
      var r = rememberedFrom(ls('get', REMEMBER_KEY), ver || root.SL_WORLD_VER || '1', search);
      if (r.clear) ls('del', REMEMBER_KEY);
      return r.rec;
    }
    function remember2D(why) {
      ls('set', REMEMBER_KEY, JSON.stringify({ off: true, why: String(why || 'unknown'), ver: String(root.SL_WORLD_VER || '1'), at: Date.now() }));
    }

    /* ---------------- dispose ---------------- */
    function disposeAll(o) {
      o = o || {};
      disposing = true;
      clearTimeout(restoreTimer);
      var all = stack.concat(current ? [current] : []);
      stack = []; current = null;
      all.forEach(function (L) {
        L._released = true; L._running = false; L._granted = false; L._looping = false;
        L._unobserve();
        if (L.h.onRevoke) safe(L.h.onRevoke, L, 'dispose');   /* the lease is gone: lease again to render */
      });
      if (renderer) {
        var r = renderer, c = r.domElement;
        renderer = null;
        try { r.setAnimationLoop(null); } catch (e) {}
        c.removeEventListener('webglcontextlost', onLost, false);
        c.removeEventListener('webglcontextrestored', onRestored, false);
        try { r.dispose(); } catch (e) {}
        try { r.forceContextLoss(); } catch (e) {}
        if (c.parentNode) c.parentNode.removeChild(c);
      }
      lost = false;
      if (hub && o.keepKit !== true) { try { hub.dispose(); } catch (e) { issue('kit dispose: ' + errText(e)); } }
      disposing = false;
    }

    /* ---------------- QA info ---------------- */
    function info() {
      var out = {
        version: VERSION, ready: SL3D.ready, tier: SL3D.tier, why: SL3D.tierWhy, budget: SL3D.budget,
        quality: SL3D.quality, permanent: permanent, failed: sessionFail, contextLosses: lostCount,
        loaded: SL3D.loaded, models: Object.keys(SL3D.models).length, missing: SL3D.missing.slice(),
        apis: Object.keys(apiNames), issues: SL3D.issues.slice(), owner: current ? current.owner : null,
        kit: hub ? hub.stats() : null, kitIssues: hub ? hub.issues.slice() : []
      };
      if (current) out.lease = current.info();
      return out;
    }

    /* ---------------- SLIsland3D ---------------- */
    var IS = root.SLIsland3D || {};
    root.SLIsland3D = IS;              /* island3d.js adds mount() to this same object */
    IS.ensure = ensure;
    IS.boot = function (opts) {
      opts = opts || {};
      if (!opts.force && (sessionFail || remembered(opts.ver))) return Promise.resolve(false);
      var dl = opts.deadlineMs != null ? Number(opts.deadlineMs) : 8000;
      var t0 = opts.t0 != null ? Number(opts.t0) : perfNow();
      var left = Math.max(1, dl - (perfNow() - t0));
      return ensure({ deadlineMs: left, tier: opts.tier }).then(function (s) { return !!s; }, function () { return false; });
    };
    IS.remembered = remembered;
    IS.remember2D = remember2D;
    IS.forget = function () { ls('del', REMEMBER_KEY); };
    IS.failed = function () { return sessionFail || permanent || null; };
    IS.dispose = disposeAll;
  }
}));
