# My Island — rewards world: findings, design and verification record

Branch: `rewards-world` (not deployed — live deploy needs James's separate go-ahead).
This file is the running record: findings → plan → economy → checklist → evidence → limitations.

## 1. Findings: how the existing app works (with code references)

| Area | What exists | Where |
|---|---|---|
| Stack | Single-file static PWA (inline HTML/CSS/JS), no build step, GitHub Pages hosting | `index.html`, `CLAUDE.md` |
| Profiles | `state = {activeUser, users:{name: u}}` in localStorage key `timesTableQuest_v1`; `currentUser()/ensureUser()/makeUser()` | `index.html` ~4654-4740 |
| Profile switch | Who's-playing modal sets `state.activeUser`, `saveState()`, then calls `updatePointsDisplay()` | `index.html` ~8320-8335 |
| Spendable points | `u.points` (integer). Shown in header pill `#pointsPill` as "⭐ N" | ~3017, ~4964 |
| Lifetime points | `u.pointsEarned` — only ever incremented; spending never touches it | `awardPoints()` ~4946 |
| Earning engine | `awardPoints(n)` (base) + wrapper chain (Daily 30 doubling, spelling rushes, family sprint) — all award through it; per-day `u.pointsByDay` | ~4946, wrappers ~32893-33727 |
| Spending | Real-prize Reward Shop: `shopRedeem()` checks `u.points >= cost`, `u.points -= cost`, pushes `u.shop.redeemed[]` {name, icon, cost, date, actioned} | ~17095 |
| Refunds | One-off migrations add `cost` back and rename the record "↩️ Cancelled:" | `migrateUser()` ~4860-4900 |
| Leaderboards | Family view ranks **questions answered today**, Lightning best, tricks — **not points** | `renderFamily()` ~5976 |
| Achievements | Trick/spelling mastery, 1% best rung, mysteries — none derived from `u.points` | various |
| Persistence | `saveState()` writes the whole state synchronously; cloud wrapper stamps `_localUpdatedAt` and marks dirty | ~4667, cloud wrapper ~32145 |
| Cloud sync | Firebase Auth + Firestore `users/{uid}` = whole pruned profile blob; push every 60s; login adopts cloud copy if newer (last-writer-wins) | `pushNow()/adoptCloudState()` ~31963-32060 |
| Firestore rules | Kids can read/write **their own whole doc**; `families/{code}` updatable only by the family owner (ownerUid immutable); admins by console | `firestore.rules` |
| Parent controls | (a) Control Centre "this device" gate = master password `JC` **hard-coded in client JS** (not a security boundary); (b) cloud family tools — owner signs in, writes `families/{code}` (protected by the owner-update rule); game reads it via `window.slFamilyCfg` (~33378) | `control.html` ~116, ~757-830 |
| Guest merge | Control Centre `mergeGuestIntoNamed()` takes **max** of points from both forks (now island-aware, see §4) | `control.html` ~557 |
| Audio | `getAudioCtx()`, warm bus `_sfxBus`, produced samples `slSample()`, per-profile mute `u.muted` | ~5001+, `slSample` |
| Popups | One-at-a-time via `[data-sl-modal]`; `window.slGameBusy` holds popups mid-game | ~33252, ~29088 |
| Tests | None (no package.json). Node 22 available for `node --test` | — |
| Service worker | Navigation network-first; same-origin GETs **cache-first** with background refresh | `sw.js` |

### Architectural limitations that matter here
1. **No server-side authority.** The app is static hosting; profile data is written by the client (localStorage, then the kid's own Firestore doc). There is no backend that can validate a purchase, and Firestore rules cannot recompute a ledger inside a profile blob. Cloud Functions need the paid Blaze plan. Purchase validation is therefore **client-side**: prices come only from the catalogue in code, never from the UI; debit + grant + ledger happen in one synchronous state mutation saved in one write. This is integrity against bugs, double-taps, retries and multiple tabs — **not security against a determined user editing their own browser storage**, exactly like today's points.
2. **Cross-device sync is last-writer-wins on the whole profile.** A purchase and its debit live in the same blob, so they always travel (or are lost) together — never "points gone, item missing". Two devices used in parallel can still fork; one fork wins (pre-existing behaviour for all progress).
3. **Parent protection only exists in cloud mode** (owner-authenticated, rule-enforced). Device-only profiles have no real parent authorisation (the `JC` gate is visible in source), so the arcade time limit is offered **only** through the cloud family tools.

## 2. Plan
- `world/world-core.js` — pure logic (catalogue, economy, purchases/ledger, starter grant, placement rules, normalisation, arcade-time accounting, personal bests, merge). UMD: browser global `SLWorldCore`, Node `require` for tests.
- `world/world-art.js` — original SVG art (house variants, plants, pets, attractions…).
- `world/rewards-world.js` — island UI, HUD, shop, edit mode, intro, celebrations, arcade gate.
- `world/games/shell.js` + `pet-course.js`, `penalty.js`, `kart.js` — lazy-loaded canvas games on a shared fixed-timestep shell.
- `index.html` — new 🏝️ My Island tab + lazy loader, cross-tab state sync, points-pill feedback, cloud pruning of world data.
- `control.html` — protected "Island game time" family setting; world-aware guest merge.
- `tests/*.test.js` — run `node --test tests/*.test.js` (the glob form; `node --test tests/` fails here).

## 3. Economy (provisional — no per-session telemetry exists)
Earning rules (unchanged): grid answer 1 (3 if newly mastered) · Lightning 1/answer · Trick Master 2 · daily drill 3 · flags 2 · spelling 2 first try / 1 retry / +3 mastery / boss +25 · 1% Challenge 2-15 per rung, Club win +25 · trick learned +10 · Daily 30 doubles 30 minutes and adds a bonus.

Observed totals (Control Centre): Joshua ≈3,497 pts in ≈13 h active (≈270/h); Mia balance 4,615 after 14 h 47 m active (≥312/h; balance is a lower bound on earned).

**Representative session = ~25 active minutes ≈ 120 points** (≈ 4.8 pts/min). A Daily-30 session pays roughly 2-2.5× that. Prices are centralised in `world/world-core.js` (`CATALOG`, `ECONOMY.sessionPts`) and can be retuned without code changes elsewhere.

| Tier | Target | Price band | ≈ sessions |
|---|---|---|---|
| Small | one session | 20-160 | ≤1.3 |
| Medium | several sessions | 200-650 | 2-5 |
| Major | 1-2 weeks of practice | 900-1,500 | 7.5-12.5 |

Existing balances are untouched. A child with a large balance (e.g. 4,615) can buy several major items at once; a child with ~0 starts with the free starter island and earns toward a goal. World spending shares the same ⭐ as the real-prize shop — parents should know points spent on the island are not available for real prizes.

### Full price list (81 items; all in `world/world-core.js` → `CATALOG`)
"Free (starter)" items are granted once, the first time a profile opens My Island. Items that need an attraction say so in the shop; free balls/stadiums/tracks/karts come **with** their attraction.

- **Attractions (unlock a game for keeps):** Pet Obstacle Course free (starter) · Penalty Pitch 1,200 (+ Classic ball, Sunny stadium) · Kart Garage 1,500 (+ Island Loop track, Red racer)
- **Land:** Meadow Hill 900 · Beach Cove 1,000
- **Pets:** Puppy free (starter) · Bunny 550 · Kitten 600 · Baby dragon 1,400
- **Accessories (any pet):** Party hat 100 · Big bow 100 · Cosy scarf 120 · Cool shades 140 · Golden crown 250 · Super cape 300
- **Home styles:** walls Pink/Mint/Sky-blue 120, Lilac 150 · roofs Blue slate 300, Thatched 350, Candy 450, Castle turrets 600 · doors Red/Green 80, Golden 150 · details Rooftop flag 100, Smoking chimney 120, Window boxes 150, Fairy lights 200
- **Decor (per copy):** Tulips 40 · Daisy patch 40 · Mossy rock 40 · Sunflowers 50 · Rose bush 70 · Party bunting 80 · Lantern post 90 · Glowing mushrooms 90 · Island flag 100 · Pine tree 110 · Garden bench 110 · Oak tree 120 · Sandcastle 120 · Beach umbrella 130 · Palm tree 140 · Apple tree 150 · Snowman 150 · Blossom tree 160 · Windmill 380 · Lighthouse 650
- **Paths (per copy):** Stone 20 · Wooden boardwalk 25 · Flower stepping stones 30
- **Interactive fun (one of each):** Bubble machine 300 · Tree swing 380 · Trampoline 450 · Fountain 500
- **Game extras:** courses Beach Run 350, Snowy Trail 400, Candy Land 500 · tracks Beach Hairpins 700, Volcano Ring 800 · balls Rainbow 200, Planet 250, Golden 300 · stadiums Beach/Snowy 400, Floodlit night 450 · karts Blue rocket/Lime lightning 300, Unicorn 450, Golden 500

Purchases of 300 ⭐ or more ask "Are you sure?" (`ECONOMY.confirmAt`); cheaper ones buy on one tap.

## 4. What was built (where)

| Requirement | Implementation |
|---|---|
| Existing points, no new currency | Prices are debited from `u.points` only by `SLWorldCore.purchase()`; `pointsEarned`, leaderboards and achievements are untouched. |
| Preserve balances; additive migration | `ensureWorld()/normalize()` add `u.world` lazily; profiles without it load unchanged; unknown future item ids stay in the data but aren't drawn; the starter grant runs once (`starterGrantedAt`). |
| Spending integrity | Price comes only from the catalogue; each purchase carries a tx id (format-checked); replaying a tx returns the original result and a different item under the same tx is refused; unknown / retired / not-for-sale / already-owned / locked / insufficient are refused; one write + read-back check, and if the save fails or doesn't read back, live memory is rolled back so nothing looks spent; `navigator.locks` (`sl-world-commit`) serialises tabs; the purchase re-reads saved state under the lock and refuses if the active profile changed. |
| Lost-response recovery | A failed or unverified save keeps the pending tx id, so "Try again" replays the same tx and can't charge twice (`buyFlow`). A double tap can't open two confirm boxes. |
| Island + starter | 16×10 grid: home island + two lockable lands; starter home, puppy, free obstacle course, trees, flowers, paths; skippable 3-slide intro. |
| HUD | Back to learning · ⭐ balance (bumps when points arrive) · savings-goal bar · Shop · Games · Edit · Pets · Sound · Help. |
| World building | Placement with valid/invalid ghost, one item per cell, entrances kept clear, keyboard (arrows/Enter/Esc) and touch, undo toast, store to tray and re-place, home walls/roof/door/details, pets (rename with word filter, active pet, accessories), land expansion, savings goal. Phones: island pans sideways with ~47 px squares. |
| World ↔ games | The active pet (with accessories) runs the obstacle course; the pitch unlocks the shootout with the owned ball/stadium; the garage shows the selected kart and unlocks the time trial. |
| Shop | Categories plus an "I can buy" filter; a locked item can't be the savings goal (its prerequisite becomes the goal); the confirm box, intro and shop say island ⭐ are the same ⭐ as the 🎁 Shop's real prizes; card states (owned / can buy / need N more / locked with reason / goal), detail sheet, game preview without unlocking, a celebration for each kind of item. |
| Three games | Shared shell: tutorial (automatic first time), countdown, pause/resume/restart/exit, results with personal best, sound toggle, pause on blur or hidden tab, letterboxing on resize, turn-sideways hint on portrait phones, touch pads + keyboard, reduced motion, full cleanup. Scores never award or spend points, and the results screen says so. |
| Parent game-time limit | Owner-only card in the Control Centre writes `families/{code}.arcade` (Firestore rule: only the family owner can update). Child side: 1-minute warning; a round can only start with time left and may finish (hard ceiling: limit + 2 min); then games wait until midnight in the parent's time zone; learning is never blocked. Counts active play seconds in a per-player counter shared by tabs, mirrored into the synced profile (max per day, never summed). The last family setting seen is remembered on the device and on the profile, so signing out, going offline or switching to another player on that device keeps the limit; only a newer owner setting changes it. Time comes from the HTTP `Date` header (or the clock at load) carried forward by the monotonic clock and re-measured when the tab returns, so changing the device clock while the app is open doesn't give a fresh day, and the day never moves backwards. The hard-stop ceiling is re-checked every second, so a setting that arrives mid-round still ends it. |
| Guest merge | `mergeGuestIntoNamed()` calls `SLWorldCore.mergeWorlds()` when either side has an island: union of purchase ledgers; owned = max (repeatables recounted from the ledger); best PBs from both; arcade minutes max per day; a one-off item bought on both forks is kept once and charged once (earliest purchase); points = larger pre-island balance − union of island spend. Won't run (retries later) if the world rules failed to load. |

## 5. Verification record

### Automated — `node --test tests/*.test.js`: 58 pass, 0 fail
- `tests/world-core.test.js` (36): catalogue sanity and price bands; starter once; purchases (sufficient / exact / insufficient / never negative / double tx / unique vs repeatable / manipulated ids and prices / prerequisites / attraction auto-place); commit protocol (stale memory, profile switch mid-purchase, write failure, silent write drop, lost-response retry); concurrency (no double spend; ledger total = balance change); placement; store/re-place; normalising corrupt data; retired items; goals; pet names; accessories; arcade limits incl. time zones; PB validation; merges (two forks, one-sided island, PBs and arcade minutes from both sides, the same one-off item bought on both forks); review regressions (silent save failure rolls memory back and the retry charges once; locked goals refused; curly apostrophes in pet names; live hard-stop ceiling).
- `tests/games-logic.test.js` (22): obstacle course finishable with zero bumps on 600 seeded layouts, 55–95 s rounds, never-jumping still finishes, double jump, identical results at 30 and 144 fps; penalty (top corners unsaveable, wide/over always miss, keeper never unbeatable, round pacing and score limits, reading the keeper wins); kart (each track: laps counted exactly once, in order, no wall touches, 45–95 s; backwards never counts; wiggling over the line never counts; infield jumps earn nothing; walls hold; never pinned on a wall; turning on the spot; wrong-way banner without false alarms; no lap before moving).

### Browser QA (local server, QA test profile only — no child's profile touched)
- Island renders on desktop and at 375 px (island pans; no sideways page scroll).
- Starter granted once; intro shown once.
- Obstacle course via keyboard: tutorial → countdown → run → results; PB saved; ⭐ unchanged.
- Esc and window blur pause; resume continues from the same spot; restart resets; exit returns to the island.
- 4 launch/exit cycles: no leftover overlay, 0 live window listeners after exit.
- `#play=penalty` while locked opens the pitch's shop page ("just 150 more to go"), not the game.
- Savings goal set from the shop; earning 200 ⭐ through the normal award path filled the bar ("You can buy Penalty Pitch!").
- Double/triple tap → one confirm; "Yes" clicked twice → one debit, one ledger row; pitch and garage auto-placed with ▶ PLAY; celebration offers "Play now".
- Penalty: 8 shots with Space (two taps per shot); PB saved; ⭐ unchanged.
- Kart: 3 laps with the arrow keys in 53.7 s, checkpoints in order; touch pads drive it; turning round and driving backwards shows the wrong-way banner and loses progress.
- Game-time limit (2-minute test limit set through the impose-only QA hook): warning at 1 minute left; limit hit mid-round → "finish it off", round completes; "Play again" disabled; relaunch shows the time's-up dialog whose button opens Maths; an idle race is force-ended at limit + 2 min; the next day (server-time offset) reopens; ⭐ unchanged throughout.
- Profile switch on the island: re-renders for the other profile; the QA profile's data unchanged.
- Two tabs buying at the same instant with 50 ⭐ (two 40 ⭐ items): one succeeded; the other was refused "not enough ⭐" because it re-read saved state under the lock; both tabs then showed 10 ⭐.
- After the review fixes: Enter on a focused game-menu button is no longer swallowed; holding GO through 3-2-1 drives at full speed straight away; Resume gives a 2-1 countdown; results buttons ignore taps for 0.65 s; leaving the island mid-placement for Maths frees the arrow and Enter keys (nothing placed, the item waits in storage); one Esc closes only the top dialog; a locked item set as a goal makes its prerequisite the goal; a remembered 30-minute family limit applied to the QA profile and the Guest profile while signed out; winding the clock back 5 days kept today's date.

### Not verified (needs a real device or account)
- A real Firebase family: the owner saving the Island game time card and a signed-in child picking it up (code reviewed; rules unchanged and already owner-only).
- Real phones/tablets: touch feel, audio, rotating mid-game (resize logic only exercised by viewport emulation).
- Real-time feel at 60 fps in a visible window (QA stepped the simulation because the preview pane was hidden).
- Offline install of the updated service worker.

## 6. Limitations
- **Browser storage is not secure account storage.** Points, purchases and the game-time counter live in the child's browser (and their own Firestore doc when signed in). Someone editing storage or using devtools can change them, exactly as with today's points. These protections stop bugs, double taps, retries and multi-tab races, not tampering.
- **Cross-device forks** are last-writer-wins on the whole profile (existing behaviour). Only the guest-merge path is island-aware.
- **The game-time limit reaches a device only once a child has been signed in to the family on it** after the parent saved it (that's the only place a parent setting is protected). From then on the device and the profile remember it — signed out, offline, or another player on that device. Gaps: a device never signed in to the family has no limit; each player on a device has their own allowance, so a brand-new player name starts with a full allowance; changing the device clock *between reloads while offline* can still reach a new day; two devices used on the same day count separately until they sync (the profile keeps the larger per-day value, never a sum).
- **Real-prize shop spending** still merges by "larger balance wins" in the guest merge (pre-existing, unchanged).
- The cloud copy keeps the last 1,000 ledger rows; balances stay right because `world.spent` keeps the total. A guest merge where *both* copies were trimmed and both spent after splitting can under-count spending (needs 1,000+ purchases; documented, not fixed).
- Purchases under 300 ⭐ buy on one tap with no undo (placement can be skipped and items put away, but ⭐ aren't refunded). A parent spend cap or an undo window would need a design decision.

## 7. Independent review (two reviewer agents, 2026-10-02) and what was done
**Points, purchases, permissions, persistence** — 4 major, 2 minor:
1. A save that silently failed left the purchase applied in memory (and could later sync) while telling the child "nothing was spent" → **fixed**: the store rolls memory back on any failed/unverified save; regression test with the real adapter shape.
2. Guest merge charged twice for a one-off item bought on both forks → **fixed** (kept and charged once; test).
3. The game-time limit could be escaped by signing out, going offline, switching player, or starting a round in the first seconds after load → **fixed** for all four (remembered setting on device + profile; live hard-stop ceiling). Remaining gaps are listed in §6.
4. Changing the device clock gave a fresh day → **fixed** while the app is open (monotonic anchor, re-measured on return; day never goes backwards). Offline-between-reloads remains (§6).
5. (minor) Both-sides-trimmed ledgers in a merge → documented (§6).
6. (minor) Doc said fun items were per-copy; they're one each → doc fixed.

**Usability, world, gameplay, visuals** — 0 blocking, 5 major, minors:
1. Enter/Space didn't press the focused button on game menus → **fixed**.
2. Holding GO through the countdown was ignored → **fixed** (keys and pads count from the countdown).
3. A locked item could become the goal and then claim "You can buy it!" → **fixed**.
4. Placement keys stayed active after leaving the island (Enter placed an item over Maths) → **fixed** (placement dropped on leaving; keys only act while the island is on screen and nothing covers it).
5. Nothing said island ⭐ are the same ⭐ as the real-prize Shop → **fixed** in the confirm box, intro, shop header and the parent card. (Spend cap / undo not built — §6.)
- Minors fixed: one Esc = one dialog, focus returns to the opener, dialogs labelled by their heading; Enter on a focused celebration button works; results say "Game scores don't earn or spend ⭐"; "(+600 score)" / "(+50 score each)" / "score 650" wording; active pet badge 🏅 instead of ⭐; owned games get ▶ Play in the detail sheet and their preview says "play it on your island"; penalty aim sweeps at an even speed and only just past the frame (random tapping scores ~52%, was ~40%) and the keeper's lean is 2.5× bigger; Resume has a 2-1 countdown; results buttons ignore taps for 0.65 s; pets stop when the island tab is hidden and stay still with reduced motion; higher-contrast disabled buttons and locked game cards; curly apostrophes in pet names; keyboard hint hidden on touch screens; "Not finished" instead of "DNF"; smaller, lighter kart minimap; more opaque results backdrop.
- Minors not changed: the app's existing tall sticky header on phones covers the island's top bar after scrolling (pre-existing app layout).

## 8. Free test mode (James, 2026-10-02 — on for the first release)
`window.SL_WORLD_TRIAL = true` in `index.html` makes every island item free so the children can try everything:
- `purchase(u, id, {tx, trial: true})` charges 0, never touches `u.points`, `pointsEarned` or `world.spent`, and writes a ledger row `{price: 0, trial: true, list: <catalogue price>}`. All other rules still apply (catalogue only, prerequisites, one-off items once, starter/included items not for sale).
- Per-copy items stop at 20 each while testing (`ECONOMY.trialMaxCopies`).
- UI: a green "Test mode — everything on the island is FREE. Your ⭐ are safe!" banner replaces the savings-goal bar; prices show struck through with FREE; buttons say "Get it free"; no "are you sure?" box, no "need N more", no 🎯 goals; the intro's third slide says it's free while testing.
- **Ending the test:** set `SL_WORLD_TRIAL = false` and deploy — real prices return on each device's next online reload (an open tab or an offline launch keeps the old page until then). To end it everywhere at a set moment without relying on reloads, also set `window.SL_WORLD_TRIAL_UNTIL = Date.parse('YYYY-MM-DDTHH:MM:SSZ')`, which is checked on every purchase. `window.SL_WORLD_TRIAL_FAMILIES = ['LION78']` limits free mode to listed family codes (signed-out devices then pay real prices). After the test, children who had free items see a one-time "Testing's over" note. Everything picked during testing stays owned unless we decide otherwise; because every free row is tagged `trial: true`, a one-off migration can later remove test items (or keep them) per child.
- Tests: 4 test-mode cases in `tests/world-core.test.js` (free + untouched balances, rules still enforced, the 20-copy cap with real purchases still charged, merges).

## 9. Deploying
1. Merge `rewards-world` into `master`.
2. Whenever any `world/` file changes, bump `window.SL_WORLD_VER` in `index.html` **and** the `?v=` entries in `sw.js` together; bump `CACHE_VERSION` in `sw.js`.
3. Bump the visible version label (`Live V4.xx`).
4. `git push origin master:main`, then mirror to the OneDrive copy.
5. Firestore rules: no change needed.
