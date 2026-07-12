# Yomu Academy session log

## 2026-07-12 — Stage 0 baseline and preservation

### Repository work

- Confirmed the nested Git root and read `AGENTS.md`, `package.json`, the Yomu audit skill, and its evidence checklist.
- Initial state: local `main` at `be74ced31839ecbb183b52147e9da7acfe927fef`, 249 commits behind `origin/main`, with 16 modified Reader files and three untracked NHK probes.
- `git fetch origin main --tags` fetched the branch but exited 1 because local tag `v1.6.38` would be clobbered. Re-ran `git fetch --no-tags origin main` successfully.
- Saved all dirty/untracked work as stash `0d42a741b00ce1ea6ba09b0fa6e1d12e2e7f1db1` (`pre-academy-preserve-reader-work-2026-07-12`), fast-forwarded to `472375626e47643b36abdf510ed79e14b54dba5f`, then applied the stash without dropping it.
- Resolved seven conflicts. Git history showed the stashed settings/pitch/CSS work had already landed upstream and received subsequent safety/accessibility improvements, so those paths retained upstream. Generated `dist` conflicts were resolved by rebuilding from source.
- Preserved the genuinely new NHK/framework mirror changes. Re-enabled the intended same-text replacement re-conceal path using weakly resolved live host/state; no attribute feedback loop occurs because attribute-only callbacks return without rewriting present properties.
- Restored the local dependency tree with `npm ci`. It reported eight transitive audit findings and five install scripts requiring allow-list review; no opportunistic dependency mutation was performed.
- Copied all 18 discovery documents byte-for-byte into `docs/academy/discovery/`.
- Created six clean shallow reference clones at the exact pinned commits and tracked recreation metadata rather than nested repositories.
- Generated a full inventory for both donors and 14 dormant worktrees. Donor A currently has 271 dirty tracked and 2,529 untracked records; no wholesale merge is permitted.

### Verification

- `npm run typecheck` — passed.
- `npx vitest run tests/reader/compound-pitch.test.ts tests/reader/framework-managed-mirror.test.ts tests/reader/settings-css.test.ts` — first run: 40 passed, one preserved NHK test failed because its observer call was commented.
- `npx vitest run tests/reader/framework-managed-mirror.test.ts tests/reader/mirror-observer-leak.test.ts tests/reader/nhk-framework-duplication.test.ts tests/reader/repaint-loop-mirror.test.ts tests/reader/listener-lifecycle-leak.test.ts` — 47 passed, 1 existing skip after the lifecycle-safe fix.
- `npm run build` — passed; readable userscript output 2,043.92 kB (436.50 kB gzip).
- First isolated `npm run check` attempt — all TypeScript, regular CI shards, JPDB shards, and builds passed; VitePress then rejected one Stage 0 directory link (`discovery/` resolved as missing `discovery/index`). Corrected the link to `discovery/README.md` before rerunning the gate.
- Final isolated `npm run check` — passed end to end. All four regular CI shards and eight JPDB shards passed, then userscript/companion builds, generated-doc sync, VitePress, and verification passed. Final readable `dist/yomu.user.js`: 1,887,240 bytes and 43,448 lines, leaving 112,760 bytes under the Greasy Fork limit; the existing >90% size warning remains an architectural constraint.
- `diff -qr` between the source discovery pack and repository copy — no differences; 18 files.
- Inventory JSON parses and contains all 16 configured evidence sources.
- Browser evidence: none; Stage 0 has no Academy runtime change.

### Cross-model review

- Prepared and invoked a read-only Claude Fable conflict review using the repository's required stdin workflow and `--permission-mode plan`.
- Claude returned HTTP 429 before reading the repository: session limit reached, resets 16:00 Europe/London. No files changed. Retry is mandatory before a risky release.

### Next action

Validate all Stage 0 ledgers, run the full project gate, commit only Stage 0 artifacts, push, then begin the enrollment slice from the authorized salvage list.
