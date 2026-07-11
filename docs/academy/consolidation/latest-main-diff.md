# Academy integration report: `origin/main` at 2026-07-11

## Compared refs

| Ref | Commit | Meaning |
| --- | --- | --- |
| Academy worktree `HEAD` | `c2ed0722fda6dd16ba14520d1cd1b60155fab7c3` | Academy's committed tip: deterministic grading, cast art, and a cherry-pick of the pitch probe fix. |
| Common base | `66eaf472af3904558006a7cbbce7f8c551a6ac97` | Last common ancestor. |
| Fresh `origin/main` | `33e3632f1ce7273399582ba532eae03a53f678af` | Current main, fetched for this report. |

This worktree is deliberately left untouched except for this report. Before it was written, it had 411 dirty status entries: 6 tracked non-`docs/public` files, 261 `docs/public` entries, and 877 untracked paths. Do not clean, reset, restore, or stage it wholesale.

Committed Academy changes after the base are `1d08bcc10` (deterministic grading), `220e5e4f1` (cast portraits/CSS), and `c2ed0722f` (pitch probe). Main contains 84 changed paths since the base (9,634 insertions and 2,715 deletions), spanning releases 1.6.126 through 1.6.137.

## Must-integrate reader fixes

1. **Passive pitch and furigana must come from main's merged reader source.** `70ae31287` restores passive pitch annotation behavior and `8b4118069` prevents a stalled local-dictionary presence probe from blocking public pitch/furigana hydration. The Academy branch already has the latter patch as `c2ed0722f`: their stable patch IDs are identical (`7a4c2b701275a5998f14d6686de038fe376fd398`). Do not cherry-pick it again.

   Preserve the upstream `70ae31287` behavior, then use main's combined [pitch regression suite](../../../tests/reader/pitch-visibility.test.ts). This matters to Academy because [yomu-inject.ts](../../../src/academy/yomu-inject.ts) bootstraps the shared `yomu.user.js` after a Japanese surface appears, and [entrypoint.ts](../../../src/academy/entrypoint.ts:10) invokes it after mount.

2. **Integrate the reader source and rebuild its hosted assets.** Academy loads `yomu.css`, `yomu.user.js`, and optional Greasy Fork companions from the same host. Therefore `src/reader/app/main.ts`, `src/reader/app/main-helpers.ts`, DOM/lookup/settings updates, and the built `dist/yomu.*` / `docs/public/yomu.*` outputs must agree. Taking only the Academy inject code with an old reader bundle would leave the passive rendering path inconsistent.

3. **Keep main's OCR/BookWalker fixes.** Main has substantial updates to `src/reader/ocr/`, including `canvas-mirror.ts`, from 1.6.126--1.6.136. Academy has one dirty `canvas-mirror.ts` hunk around its current line 1020; its changed range does not overlap main's changed ranges (current lines 75--991), so apply it after the source merge with three-way application and run the OCR tests. Do not discard either side.

4. **Preserve the Study/SRS contract unchanged.** [study-bridge.ts](../../../src/academy/study-bridge.ts) imports only `src/reader/srs/types`; main has no changes under `src/reader/srs`. Academy's import projection keeps Academy scheduling separate and emits links under `/study`, so there is no contract migration to perform. Keep the Academy bridge and run its focused tests.

5. **Treat ruby styling as a real compatibility surface.** Academy's [styles.css](../../../src/academy/styles.css:526) applies global `ruby` and `rt` rules, while the injected reader supplies word wrappers, furigana, and pitch classes. Main's `src/reader/styles/kanji.css` and `src/reader/styles/reader-words-ocr.css` changes need to be present in the rebuilt reader stylesheet. Exercise both an Academy lesson line and the Foundation answer-label case, whose CSS deliberately targets `input + span` to avoid styling injected nested spans.

## Expected conflicts and resolutions

| Path | Status | Safe resolution |
| --- | --- | --- |
| `tests/reader/pitch-visibility.test.ts` | **Actual committed add/add conflict.** `git merge-tree` reports it. | Take `origin/main`'s stage-3 version. It includes the original passive-pitch tests and the Academy branch's identical stalled-probe tests; do not concatenate test files. |
| `package.json` | **Dirty-worktree conflict expected when Academy changes are reapplied.** Main sets version `1.6.137` and adds `smoke:bookwalker-live-firefox`; Academy adds Academy scripts plus `lucide` and `wrangler`. | Retain main's version and reader script; retain every Academy script/dependency. Regenerate `package-lock.json` from that resolved manifest. |
| `package-lock.json` | **Dirty-worktree conflict expected.** It has Academy dependency resolution while main contains release-version output. | Do not hand-merge it and do not apply its old patch. Run `npm install --package-lock-only` after resolving `package.json`, then review the lock diff. |
| `src/reader/ocr/canvas-mirror.ts` | **No line conflict found, but shared dirty runtime.** | Apply the Academy hunk with `git apply --3way`; retain main's snapshot/token/BookWalker changes and Academy's `createTrustedMirrorScript` change. Run the focused OCR tests. |
| `vite.config.ts` | No main overlap. | Keep Academy's test include for `tests/academy/**/*.test.ts`. |
| `src/academy/**`, `tests/academy/**`, `config/vite/academy.config.ts`, `workers/yomu-academy/**`, `wrangler.academy.jsonc` | No tracked-main overlap. | Restore them into the integration worktree only after the reader merge. They are Academy-owned source, tests, and deployment configuration. |

## Generated output: do not manually integrate

- The Academy worktree currently records **260 tracked deletions** under `docs/public` (255,197 deleted lines) and contains an untracked `docs/public/academy/` tree (649 paths). These are build/deployment output, not a deletion intended for main. Never stage those deletions or copy the old generated tree into the integration branch.
- Main's changed `docs/public/yomu.*`, Greasy Fork bundles, and `docs/public/newtab/*` are release-generated artifacts. Take them through the main merge or regenerate them from merged source; do not resolve their contents against Academy's deletion state.
- Likewise, `dist/yomu.*` is generated reader output. Rebuild it from merged reader source. `scripts/sync-academy.cjs` then produces `docs/public/academy/app.js`, `styles.css`, and `index.html` from the Academy build plus static Academy inputs.
- Keep `public/academy/**` as Academy build input (art, media, content, PWA files), not as disposable output. `docs/academy/**` is Academy documentation; this report is the only file changed by this task.

## Exact safe integration sequence

Perform this in a new disposable worktree. The dirty Academy worktree remains open and unchanged throughout.

1. **Snapshot, do not stash or clean, the dirty worktree.** From the Academy worktree, create an external backup directory and save: (a) `git diff --binary HEAD` as a full tracked patch, (b) `git status --porcelain=v1`, and (c) a tar archive produced from `git ls-files --others --exclude-standard -z`. Also create a second archive restricted to `src/academy`, `tests/academy`, `config/vite`, `workers/yomu-academy`, `public/academy`, `docs/academy`, and Academy scripts. The restricted archive is the only untracked archive to unpack during integration. This preserves every dirty file without altering the worktree.

2. **Create an isolated merge worktree at `c2ed0722f`.** Use `git worktree add --detach <temporary-path> c2ed0722f`, enter it, and run `git merge --no-ff --no-commit origin/main`. Resolve only `tests/reader/pitch-visibility.test.ts` by taking `--theirs`; then finish the merge. This avoids any operation against the dirty Academy files.

3. **Reapply Academy changes selectively.** Apply the backup's tracked patch for `src/academy/**`, `vite.config.ts`, and the dirty `src/reader/ocr/canvas-mirror.ts` with `git apply --3way`. Unpack only the restricted Academy archive. Do not apply or unpack any `docs/public` deletion/output state.

4. **Resolve manifest state deliberately.** Reintroduce Academy's `build:academy`, `dev:academy`, `test:academy`, archive/catalog/migration/type/deploy scripts and its `lucide`/`wrangler` dependencies into main's `package.json`; keep main's `1.6.137` version and `smoke:bookwalker-live-firefox` script. Run `npm install --package-lock-only`; do not apply the saved `package-lock.json` patch.

5. **Verify source contracts before generated output.** Run:

   ```sh
   npm ci
   npm run typecheck
   npx vitest run tests/reader/pitch-visibility.test.ts \
     tests/academy/pitch-visibility-injection.test.ts \
     tests/academy/study-bridge.test.ts \
     tests/academy/foundation-player.test.ts
   npx vitest run tests/reader/canvas-mirror.test.ts \
     tests/reader/canvas-mirror-token-contract.test.ts \
     tests/reader/ocr-reader-raster-surfaces.test.ts
   npm run test:academy
   ```

6. **Build in dependency order, then inspect the result.** Run `npm run build`, `node scripts/sync-docs-userscript.cjs`, and `npm run build:academy`. Confirm the generated hosted reader bundle is current, then open the Academy app and check a passive Japanese lesson line: visible ruby, pitch decoration without selecting text, and no nested-span breakage in Foundation response labels. Finish with `npm run check` if its full reader suite is acceptable for the integration window.

7. **Only after all checks pass, commit from the integration worktree.** Review that `docs/public` contains regenerated assets rather than the 260 local deletions, and that no scratch logs, screenshots, archives, or broad generated asset directories were accidentally staged. The original Academy worktree remains the recovery source until the committed integration has been independently reviewed.

## Decision summary

Merge current `origin/main`; retain main's reader source and generated reader assets; retain Academy source/configuration; resolve the one pitch test conflict in favor of main; regenerate package lock and all build output. The only materially risky dirty runtime overlap is `canvas-mirror.ts`, and its hunk is non-overlapping but requires the dedicated OCR regression run. Study/SRS has no upstream type migration. Ruby/pitch needs runtime and visual verification because Academy intentionally applies global ruby styling over the injected reader markup.
