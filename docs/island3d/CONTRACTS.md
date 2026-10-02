# My Island 3D — build contracts (read this before writing any code)

Source designs in this folder: `art-bible.json` (look + audio), `island-architecture.json` (3D island, its 16 chunks), `spec-runner.json` (Debut Run), `spec-penalty.json` (Encore Shootout), `spec-kart.json` (Neon Grand Prix). Where a game spec and the art bible disagree about game MECHANICS, the game spec wins (the art bible's "leave game logic alone / don't draw boost pads" lines are superseded for the games). Where a game spec's *shell integration* differs from §2 below, §2 wins — it is what `world/games/shell.js` actually implements.

## 0. Rules for every builder
- **Do not deploy, push, merge or mirror anything.** Work only in your own git worktree, on a new branch named in your task (`i3d/<name>`). Commit there and report the branch name and commit hash.
- **Only create/edit the files your task owns.** If you need something from a file you don't own, code against the contract below and note the dependency in your report. Never edit `world/world-core.js` (rules, CATALOG, GAME_RULES), `index.html`, `sw.js`, `world/rewards-world.js` or `world/games/shell.js` unless your task explicitly owns it.
- **Three.js r170** comes only from the import map: ES modules use `import * as THREE from 'three'` (and `three/addons/...`); classic scripts receive THREE from the runtime (`SL3D.THREE`). **Never use `window.THREE`** — `index.html` also loads an old global r128 for a parked feature. WebGL2 only.
- **No downloaded or embedded assets.** Models are built from primitives; textures are drawn on canvases at runtime. Fonts: Bagel Fat One, Baloo 2, Fredoka (Google Fonts) only. Sounds: the shell/SLSound names; music via SLMusic.
- **Original content only.** K-pop *inspired* staging/colour/energy — never real idols, groups, songs, lyrics, logos, fandom colours, real light-stick shapes or recognisable choreography. Kid-safe: cartoon tumbles, no injury/fire/explosions/scary faces; never flash faster than 2 Hz; honour reduced motion.
- **Pure logic stays pure.** Logic modules are classic UMD scripts (`window.X` in the browser, `module.exports` in Node) with no DOM and no THREE, and must pass Node 22 tests: run `"/c/Users/jamco/.local/node/node.exe" --test tests/*.test.js` from the repo root (the glob form is required). Put your tests in your own new test file(s). All existing tests must still pass unless your task explicitly replaces one.
- **Games never award or spend reward points.** Results go through `round.result()` and are validated by `GAME_RULES` (unchanged).
- Performance targets (art bible `performanceBudget`): 2019 iPad / mid Android at 60 fps, never under 30; capped pixel ratio; instancing; no PointLights/SpotLights; static shadow maps only on MID/HIGH.
- Syntax-check every JS file you write with `node --check` (ES modules: `node --check` works on `.mjs`; for `.js` ES modules use `node --input-type=module --check < file` or a dynamic import smoke test).

## 1. Shared 3D runtime (island chunks 1, 2, 8 provide it; games consume it)
Classic scripts under `world/island3d/`, loaded by `stage.js`.
- `window.SLIsland3D.boot(opts)` — island use (mount happens in the integration chunk).
- **`window.SLIsland3D.ensure()` → `Promise<SL3D|null>`** — loads three (via `window.slLoad3D()`), the kit and model/character scripts, runs the registered model factories, and resolves the shared `SL3D` object WITHOUT mounting an island scene. Safe to call many times (memoised). Resolves `null` if 3D is unavailable. Games' 3D views call this.
- `SL3D.THREE`, `SL3D.tier` ('LOW'|'MID'|'HIGH'), `SL3D.budget` (per-tier numbers from tier.js).
- `SL3D.kit(tier)` → `K` (geometry kit `K.G`, `K.template(ctx)`, `K.batch`, materials by key, `K.col(token)`), exactly as in `island-architecture.json` → `modelFactoryApi`.
- `SL3D.defineModels(category, factory(K))` — model registration (island chunks 4–8).
- `SL3D.make(id, st, tier)` → `THREE.Object3D` (a ready-to-add group for one catalogue item / kart; used by games and photocards).
- **`SL3D.makeRig(petId, acc, tier)` → `PetRig`** `{root, bones, sockets, setPose(pose), setShow(k), play(clip, t, opts), dispose()}`. Chunk 8 must ship built-in clips usable by games without actors.js: `'idle','walk','run','hop','jump','fall','slide','tumble','dizzy','dance','cheer','sad','sit','kick','drive'` (each a pure function of time; `opts.speed`, `opts.intensity`). Pet ids: `pet_puppy, pet_kitten, pet_bunny, pet_dragon`; `acc` = `{hat, neck, face, back}` → accessory ids from CATALOG (`acc_*`).
- `SL3D.makeAvatar({color, emoji}, tier)`, `SL3D.makeWand(colorHex, tier)`, `SL3D.makeFanBlob(seed, tier)` (crowd), `SL3D.make('kart_<x>', {}, tier)` (karts in LOCKED colours).
- **Games must still work if `SLIsland3D` / `makeRig` is missing** (load order, a failed chunk): fall back to a simple pet built from their own primitives in the same locked PETCOL colours.

## 2. Game shell hooks (implemented in `world/games/shell.js`; all optional)
`def` fields:
- `view3d: { src: 'world/games/<game>-3d.js' }` — an ES module exporting `create(mid, opts)` → view (or a Promise of one). `opts = { THREE, cfg, api, def, reduced, onFail(reason) }`. View: `{ canvas, frame(round|null, dt, alpha, phase, countT), resize(cssW, cssH), dispose(), setRound?(round|null, variant) }`.
  - The shell imports the module (after `window.slLoad3D()` resolves THREE) with an 8 s budget, creates the view when ready, inserts `view.canvas` UNDER the 2D canvas (which stays on top, transparent, as the tap target), and calls `frame()` every draw. In menu/tutorial/results/time-up it calls `frame(round|null, dt, 0, phase, 0)` at ~30 fps. Any throw or `onFail()` disposes the view and the SAME round continues in 2D. `alpha` = fixed-step interpolation fraction. `phase` ∈ menu | tutorial | countdown | playing | paused | results | timeup.
  - The view reads `round.state` (and any read-only getters the logic offers) and drains `round.events` (see below). It must never change logic state.
- `hud: { mount(mid, cfg, api) → { update(round, phase), dispose() } }` — optional HTML HUD layer (mounted once, updated every draw).
- `countIn: { beats, bpm, labels[] }` — beat count-in used for start AND resume (instead of `countdown` seconds).
- `controlsFor(cfg)` → pad list (instead of `controls`).
- `menuVariants(cfg)` → `[{id, name, icon, tip, locked, lockText, medal, best}]`, `menuVariantsTitle`, `menuVariantsLabel` — a game-owned variant list (e.g. penalty rivals). Selection is remembered in `localStorage 'slgVar:'+key` and does NOT call `cfg.onSelectVariant`.
- `menuOptions(cfg)` → `[{id, label, value, options:[{value, label, locked, note}]}]` + `setOption(cfg, id, value)` — chips on the menu (modes, toggles like Fan support / Easy Drive).
- `pbText(rec, variant, cfg)` → string for the menu's best line.
- `music: { track }` — with `window.SLMusic`: shell calls `play(track, {countInSec})` at round start, `menuMode(true/false)`, `pause(200)`, `resume(300)`, `stop(200)`; big-moment sounds duck the music.
- `resultsGlass: true` — results sheet becomes a glass panel over the 3D scene.

`round` fields:
- `events` / `wantEvents`: the shell sets `round.wantEvents = true` and `round.events = []` after `newRound`; the logic pushes plain objects (`{type:'bump', ...}`) **only while `wantEvents` is true** (so Node tests never accumulate); the shell empties `events` after every draw (views and the HUD read them during that draw).
- `countdown(countT, held, isStart)` each countdown step; `pauseReset()` on pause; `padState(id)` → `'' | 's1' | 's2' | 's3' | 'grey' | 'ready'` (pad glow); `summaryBadges()` → `[{text, kind: 'bronze'|'silver'|'gold'|'crown'|'ribbon'|'hint'}]`; `onFinish()` at the start of results.
- Unchanged: `step(dt, held)`, `input(id, down)`, `pointer?`, `done`, `hud()`, `result()`, `summaryTitle/Big/Text()`, `forceEnd()`, `autopilot()`, `autoHeld`, `render(ctx)` (the 2D fallback renderer — keep one), `dispose?`.
- Keys/pads held through the countdown are delivered as fresh `input(id, true)` presses at GO.

`cfg` fields passed by `rewards-world.js` launch: `variant, ownedVariants[{id,name}], pet {id, name, acc}, ball, stadium, kart, pb, tutSeen, reduced, muted(), toggleMute(), arcade{...}, onTutorialSeen, onSelectVariant, onResult(variant, res), onExit, user {name, color, avatar}, profileKey, day` (family-time-zone day key — use it for daily seeds). `GAMES[game].deps` = extra `world/games/*.js` classic scripts loaded after `shell.js` + `fx.js` and before the game file; `GAMES[game].tutKey` = the tutSeen key (bump it when a game's tutorial changes).

## 3. Audio
- `window.SLSound` (`world/sound.js`, island chunk 13): `make(cfg)` → `sound(name, vol, step)` with the same names/recipes as the shell's `makeSound` plus pet voices (`yip, mew, thump, trill`) and stereo pan; respects mute.
- `window.SLMusic` (`world/music.js`, island chunk 13):
  - `channel(opts)` → `{ play(track, {countInSec, clock?, bpm?}), menuMode(on), pause(ms), resume(ms), stop(ms), set(name, value), layer(name, on), key(semitones), drop(), sync(seconds) }` — every method safe to call in any state.
  - `SLMusic.duck(level, ms)`, `SLMusic.enabled()`, `SLMusic.setEnabled(on)` (🎵 toggle, `localStorage 'slMusic'`, try/catch), `SLMusic.island(context)` for `'island_day' | 'island_showtime' | 'shop'`, `SLMusic.stopAll(ms)`.
  - Tracks: `island_day, island_showtime, shop, course, penalty, kart`. If `audio/music/<track>.mp3` exists it loops it (bar-exact); otherwise the WebAudio "Pocket Band" synth plays an original pattern for that track. `course` with `{clock}` is BEAT-LOCKED: the band schedules from the given logic clock (seconds) so obstacles stay on the beat; `set('hype', 0..1)`, `set('fever', bool)`, `key(+n)`, `drop()` change layers. Music starts only after a user gesture, obeys mute, plays only on My Island and in its games.

## 4. Ownership map
| Wave | Branch | Owns |
|---|---|---|
| A | `i3d/look-grid-motion` | `world/world-look.js`, `world/island3d/grid3d.js`, `world/island3d/motion.js`, `tests/island-look.test.js`, `tests/island-grid3d.test.js`, `tests/island-motion.test.js` |
| A | `i3d/runtime` | `world/island3d/tier.js`, `world/island3d/stage.js`, `world/island3d/kit.js`, `tests/island-tier.test.js` |
| A | `i3d/audio` | `world/sound.js`, `world/music.js`, `tests/music.test.js` |
| A | `i3d/css` | `world/island-encore.css` |
| A | `i3d/runner-logic` | `world/games/pet-course.js` (+ new pure helper files it names), `tests/game-runner.test.js`; may update the course tests in `tests/games-logic.test.js` |
| A | `i3d/penalty-logic` | `world/games/penalty.js`, `tests/game-penalty.test.js`; may update penalty tests in `tests/games-logic.test.js` |
| A | `i3d/kart-logic` | `world/games/kart-logic.js`, `world/games/kart.js`, `tests/game-kart.test.js`; may update kart tests in `tests/games-logic.test.js` |
| B | island env/models/characters | `world/island3d/env.js`, `models-garden.js`, `models-home.js`, `models-fun.js`, `models-attractions.js`, `models-characters.js` |
| C | island scene/actors/edit/photocards + game 3D views | `world/island3d/{pets-brain,actors,island3d,camera,edit3d,fx3d,photocard}.js`, `world/games/<game>-3d*.js` |
| D | integration (lead) | `world/rewards-world.js`, `index.html`, `sw.js`, `docs/*`, `island3d_lab.html` |
