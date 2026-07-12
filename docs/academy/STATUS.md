# Yomu Academy status

**Updated:** 2026-07-12 13:45 Europe/London
**Current stage:** Stage 0 — gate green; commit and push pending
**Canonical branch:** `main` at `472375626e47643b36abdf510ed79e14b54dba5f` (`origin/main` aligned)

## Gate board

| Gate | State | Evidence |
| --- | --- | --- |
| Current upstream integrated | Green | Fast-forwarded `be74ced31` to `472375626`; `origin/main` now matches `HEAD`. |
| Unrelated Reader work preserved | Green | Safety stash `0d42a741b00ce1ea6ba09b0fa6e1d12e2e7f1db1` retained; restored work remains unstaged. Focused mirror tests: 47 passed, 1 existing skip. |
| Discovery pack copied | Green | Exact copy at [`discovery/README.md`](discovery/README.md); `diff -qr` returned no differences across 18 files. |
| Reference engines pinned | Green | Six shallow, clean clones verified against [`references/academy-engine/pins.json`](../../references/academy-engine/pins.json). |
| Donor/worktree inventory | Green | 16 read-only sources recorded in [`evidence/stage-0/inventory.json`](evidence/stage-0/inventory.json). |
| Salvage decisions complete | Green | [`SALVAGE-LEDGER.md`](SALVAGE-LEDGER.md) assigns `KEEP`, `ADAPT`, or `REJECT` before runtime ports. |
| Stage 0 project checks | Green | `npm run check` passed after correcting one dead documentation link: typecheck, all CI shards, builds, docs, and userscript verification. |
| Browser evidence | Not applicable | Stage 0 changes no Academy runtime. Real-app Browser evidence begins in Stage 1. |

## Protected local work

These paths predate Academy and remain out of Academy commits unless explicitly completed as their own verified slice:

- `dist/yomu.user.js`
- `src/reader/dom/index.ts`
- `tests/reader/framework-managed-mirror.test.ts`
- `scripts/nhk-diag.mjs`
- `scripts/nhk-mirror-overlap-smoke.mjs`
- `scripts/nhk-probe2.mjs`

The restored NHK mirror test now passes, but the three probe scripts remain exploratory and untracked.

## Known defects and blockers

- Fable cross-model review could not run because the local Claude account returned HTTP 429 until 16:00 Europe/London. Retry before any risky release.
- Donor A has 2,529 untracked records and broad generated/deleted state; it cannot be merged or copied wholesale.
- The source baseline still has 35 unauthored class weeks and no demonstrated 100% source-question coverage.
- No Academy runtime exists on current `main` yet. Stage 1 must begin from reviewed modules only.
- `npm ci` reports eight transitive vulnerabilities; do not run an unreviewed `npm audit fix`. Triage separately without changing the lockfile opportunistically.

## Next three actions

1. Commit and push only the green Stage 0 artifacts while excluding protected Reader work.
2. Port the typed shell/scene/activity/learner-event interfaces and the `AudioDirector` boundary in the first Stage 1 vertical slice.
3. Bind the approved entrance/Rie/protagonist assets and implement the three-route enrollment flow with conformance tests before adding broader content.
