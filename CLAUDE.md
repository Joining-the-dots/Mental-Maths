# Conway Family Learning Lab

A single-page PWA for kids — maths (times tables + tricks), Spellcraft spelling, flags, mysteries, People Skills (charisma/negotiation/debate), The 1% Challenge, and a real-prize points shop. Installable on iOS/Android home screens. Deployed via GitHub: https://github.com/Joining-the-dots/Mental-Maths

## Layout

- `index.html` — the entire app (~25k lines). HTML, inline CSS, inline JS. Currently V48.
- `control.html` — parent Control Centre: per-player usage stats (idle-aware telemetry) + un-actioned shop purchases. Master password gates it (same one as in-app).
- `parked.html` — Memory Madness / Story / Chess, parked out of the main nav until they're more developed.
- `RECORDING_SCRIPT.md` — everything the parent can record in their own voice; files go in `audio/tricks/` and `audio/words/` (game falls back to speech synthesis when a file is missing).
- `flags-data.js` — flag dataset for the flags game
- `sw.js` — service worker (offline support)
- `manifest.json` — PWA manifest
- `icons/` — app icons for various platforms (iOS, Android, favicons)
- `Mental_maths_V2.html`, `Mental_maths_V3.html`, `peg_preview.html`, `webgl_test.html` — experimental side variants, not the live app

## Multiplayer

Flags, Times Tables, Debate and The 1% Challenge all have PeerJS challenge modes (4-letter room codes, distinct peer-ID prefixes per game). The 1% Challenge uses show rules: out on a wrong answer, one Pass, one +50%-time lifeline each.

## Working on this

The main app is `index.html`. It's large but single-file by design (easy to host, easy to install as a PWA). When editing:

- Use Grep/search to navigate — don't read the whole file
- Preserve the inline structure (no build step, no bundler)
- If adding a new asset, also update `sw.js` cache list so it works offline
- If touching the manifest or icons, bump cache version in `sw.js`

## Versioning

Previously tracked by hand via dated copies in `backups/` (now gitignored). Use git instead: commit after each working change, tag releases (e.g. `v38`, `v39`).

## Source material

`transcripts/` holds reference material (videos, notes) used to generate game content. Gitignored — large and not part of the app.

## Test locally

Any static server, e.g.:

```
python3 -m http.server 8000
```

Then open http://localhost:8000. To test PWA install / service worker, use a real device or Chrome DevTools → Application tab.
