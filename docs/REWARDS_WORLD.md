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
| Guest merge | Control Centre `mergeGuestIntoNamed()` takes **max** of points from both forks | `control.html` ~557 |
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
- `control.html` — protected "Arcade time" family setting; world-aware guest merge.
- `tests/*.test.js` — `node --test tests/`.

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
