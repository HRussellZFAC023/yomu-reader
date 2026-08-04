# Meta-workspace deletion plan — 2026-08-04

**Nothing here has been deleted.** This is a classified list for the owner to approve. Measured
2026-08-04 against `/Users/heru/Documents/Projects/yomu`, which is **not** a Git repository — the
repository is the nested `apps/yomu-reader`.

| | |
| --- | --- |
| Umbrella total | **209 GB** |
| Proposed reclaim | **≈ 88 GB** (≈ 92 GB including the second `artifacts/` tree) |
| Remaining after | **≈ 117–121 GB** |

Sizes are `du -sh`. Every worktree was classified with `git -C <dir> status --porcelain` (dirty) and
`git -C <dir> log HEAD --not --remotes --oneline` (unpushed). **Use the second form, not
`--branches --not --remotes`** — in a shared-worktree setup the latter resolves against the whole
repository's refs and reports the same repo-wide number (160) for every worktree.

## Read this before deleting anything

1. **Removing a worktree does not remove its branch.** Use `git worktree remove <path>`, then decide
   about the branch separately. **Branch `codex/academy-art-upgrade-20260717` must never be deleted** —
   it carries 533 MB of Academy art and has no remote. It has no worktree in the table below, so a
   worktree sweep will not touch it, but a branch sweep would.
2. **13 stashes live in `apps/yomu-reader/.git`.** They are visible from every worktree and survive
   worktree removal, but a later `git gc --prune` could reach dropped ones. Review them before any gc.
3. **`yomu-reader-extension-store-release-20260719` holds 3 stashes of its own.** Those are local to
   that clone and die with the directory.
4. **`artifacts/`, `qa-artifacts/`, and `worktree-cleanup-backups/` are gitignored**, so they are not
   in any history. Deleting them is irreversible.
5. `git worktree prune --dry-run -v` printed nothing: no worktree is broken or already prunable.
6. The main checkout `apps/yomu-reader` has **924 dirty files** and 0 unpushed commits. It is the
   dirtiest tree in the project. No cleanup should touch it.
7. Unrelated but adjacent: `~/.codex/sessions` (48 GB) is the other "System Data" hog and the owner
   has ruled it must be **kept**. It is outside this tree; do not fold it into a sweep.

## A. `release-worktrees/` — 74 directories, 155 GB

### A1. DELETE candidates — 41 worktrees, ≈ 84 GB

Clean on both axes (0 dirty, 0 unpushed) and not otherwise protected.

| worktree | size | note |
| --- | --- | --- |
| advance-push-annotations-v166 | 2.5G | branch `codex/fix-advance-push-annotations-v167` |
| codex-ml-lookup | 3.1G | |
| codex-w8-redo-20260730 | 1.1G | detached at `9ac0799e9`, no unique commits |
| cx-a11y-errors-20260730 | 1.5G | |
| cx-a38-settings-20260730 | 1.5G | |
| cx-a41-links-20260730 | 3.2G | |
| cx-academy-payload-20260730 | 1.5G | |
| cx-deploy-20260730 | 2.0G | |
| cx-onboarding-ocr-20260730 | 1.5G | |
| cx-typing-20260730 | 1.5G | |
| cx-w10-20260730 | 1.5G | |
| cx-w11-20260730 | 1.5G | |
| cx-w12-20260730 | 1.5G | |
| cx-w13-20260731 | 1.6G | |
| cx-w14-20260731 | 1.5G | |
| cx-w15-20260731 | 1.5G | |
| cx-w16-20260731 | 1.5G | |
| cx-w17-20260731 | 1.5G | |
| cx-w18-20260731 | 934M | 0-byte node_modules; weight is build output |
| cx-w19-20260731 | 1.7G | |
| cx-weight-20260730 | 1.5G | shipped as v1.8.46 |
| firefox-amo-lint-20260802 | 2.3G | |
| gaming-lifecycle-baseline-20260726 | 1.0G | detached at `8635424ec` |
| hp-restyle-20260730 | 3.1G | |
| i38-factory-reset-20260731 | 2.3G | |
| ipad-page-scroll-furigana-20260802 | 2.3G | |
| ipad-subtitle-font-size-20260730 | 1.9G | |
| ipad-youtube-subtitles-20260801 | 2.5G | |
| live-chat-scroll-20260801 | 2.3G | |
| ml-d43-20260730 | 3.2G | |
| ml-tiers-20260730 | 3.1G | |
| ml-u46-20260730 | 3.7G | largest single candidate |
| offline-setup-banner-20260731 | 2.3G | |
| storage-realm-20260801 | 2.5G | |
| subtitle-annotation-stability-20260730 | 2.3G | |
| twitter-subtitle-metadata-20260801 | 2.3G | |
| u46-hotlinks-20260730 | 3.2G | |
| w20-subtitles-20260731 | 941M | |
| w21-mining-20260801 | 2.5G | only worktree with a real `origin/` upstream for its branch |
| youtube-clipped-labels-20260801 | 2.3G | |
| youtube-controls-autohide-20260802 | 2.3G | |

### A2. REVIEW before deleting — 1 worktree, 2.3 GB

| worktree | size | why |
| --- | --- | --- |
| dictionary-storage-hotfix-20260803 | 2.3G | clean, but touched 2026-08-04 15:04 and named like a hotfix in the current release train. Confirm it has landed before removing. |

### A3. KEEP — 32 worktrees, ≈ 69 GB

| worktree | size | dirty | unpushed | reason |
| --- | --- | --- | --- | --- |
| parser-unification-20260803 | 1.9G | 3 | **11** | active chip + highest unpushed risk of the live set |
| deslop-docs-20260803 | 1.4G | 2 | — | active chip (this one) |
| deslop-code-20260803 | 1.8G | 0 | 0 | active chip |
| settings-integrity-20260803 | 938M | 0 | 0 | active chip |
| popup-lifecycle-hotfix-20260803 | 1.4G | 3 | 0 | active chip |
| dictionary-single-copy-20260804 | 1.7G | 4 | **5** | active chip; branch has **no upstream**, so those 5 are local-only |
| homepage-restore-20260802 | 1.5G | 0 | 0 | memory-flagged |
| lens-ocr-scope-20260728 | 1.6G | **24** | 1 | memory-flagged; checked out on `homepage-deploy-20260728` — **do not identify it by folder name** |
| youtube-inflected-pitch-20260802 | 2.3G | 0 | 1 | memory-flagged |
| remove-guide-legacy-dictionaries-20260801 | 1.6G | 0 | 4 | memory-flagged |
| integrate-20260727 | 2.8G | 0 | **20** | most unpushed work anywhere |
| homepage-mobile-roadmap-20260727 | 1.8G | 1 | 5 | branch has **no upstream** |
| store-install-cta-20260727 | 2.2G | 0 | 3 | branch has **no upstream** |
| verify-onenav-20260728 | 3.5G | 0 | 2 | branch has **no upstream** |
| release-1.8.19 | 1.3G | 2 | 4 | dirty entries are two `dist/` deletions, so not a faithful release snapshot |
| bunpro-examples-20260711 | 138M | 5 | 3 | **standalone clone, not a worktree.** Its remote points at `release-worktrees/release-1.6.123`, which no longer exists, so its 3 commits exist nowhere else and cannot be pushed as configured. Dirty files are throwaway `*.log`. |
| bunpro-consistency-20260718 | 635M | 0 | 2 | detached at `fe206c459`; commits reachable only by SHA |
| native-subtitle-concealment-20260801 | 2.5G | **50** | 2 | |
| a35-perf-20260730 | 3.2G | 37 | 0 | |
| advance-push-annotations-20260801 | 2.5G | 36 | 1 | |
| a35-onboarding-copy-20260730 | 3.2G | 18 | 1 | |
| homepage-reimagine-20260728 | 2.9G | 14 | 1 | |
| docs-copy-20260728 | 2.9G | 1 | 1 | |
| a35-a11y-errors-20260730 | 3.8G | 0 | 1 | |
| a35-ops-seo-20260730 | 2.8G | 0 | 1 | |
| a35-repo-weight-20260730 | 3.3G | 0 | 1 | |
| a53-parity-baseline-20260801 | 1.9G | 0 | 1 | |
| backlog-reconcile-20260727 | 1.3G | 0 | 2 | |
| docs-lens-autoupload-20260727 | 2.5G | 0 | 1 | |
| firefox-dictionary-xray-20260801 | 2.5G | 0 | 2 | |
| homeA-20260727 | 2.1G | 0 | 2 | |
| homepage-finish-20260727 | 2.1G | 0 | 1 | |

### A4. Worktrees registered outside this tree — no action, informational

The repository registers **92** worktrees. 18 live outside the umbrella: 4 under `~/.codex/worktrees/`,
10 under `/private/var/folders/.../fallow-audit-base-cache-*`, one in `/private/tmp/yomu-extension-repro.*`,
and one in an agent scratchpad. The `/private/var` and `/private/tmp` ones sit in OS temp space; if a
reboot removes them they become prunable, and `git worktree prune` is then the right cleanup, not `rm`.

## B. Umbrella directories

| path | size | class | note |
| --- | --- | --- | --- |
| `artifacts/` | 433M | **DELETE** | 117 entries, mostly `a3-qa-*.png`. Gitignored and umbrella-level, so not in any history. |
| `apps/yomu-reader/artifacts/` | **3.5G** | **DELETE** (not in the brief — flagging it) | 135 entries. A *second*, larger untracked artifacts tree inside the repo, ignored by `.gitignore:37`. This is where `npm run check` writes `check-logs/`, so expect it to reappear. |
| `qa-artifacts/` | 205M | **DELETE** | gitignored, umbrella-level |
| `worktree-cleanup-backups/` | 608M | **DELETE** | exactly one snapshot, `2026-07-19T1255Z` |
| `tmp/` | 1.5M | **DELETE** | gitignored |
| `.playwright-mcp/` | 496K | **DELETE** (not in the brief) | browser-tool state, gitignored |
| `scratchpad-wpacks/` | 39M | **REVIEW** (not in the brief) | 47 entries; unclear provenance |
| `yomu-reader-extension-store-release-20260719/` | **3.0G** | **DELETE, with one check** | A full independent clone (`.git` alone is 804M), not a worktree. Remote is the real GitHub origin. Branch `codex/browser-extension-stores-1.6.231-v2` at `f6a595fa`, package.json **1.6.241**, 0 dirty, 0 unpushed. **It holds 3 stashes that die with it** — check those first. Its `0 0` divergence is against the `origin/main` it knew on 2026-07-19, not today's. |
| `references/` | 7.9G | **KEEP** | research corpora |
| `references-academy/` | 9.5G | **KEEP** | research corpora |
| `services/` | 5.1G | **KEEP** | |
| `resources/` | 1.3G | **KEEP** | `moodle-raw` is hard-coded in tooling and immovable |
| `tools/` | 555M | **KEEP** | `scripts/build-extension.mjs` requires `tools/UserScript-Compiler` |
| `apps/` | 26G | **KEEP** | the repository. `apps/yomu-reader/.git` alone is **6.1G**. |

### C. Loose root files — 6.8 MB total, all DELETE

| file | bytes |
| --- | --- |
| `state1.png` / `state2.png` / `state3.png` | 1,338,656 / 1,338,672 / 1,338,839 — within 200 bytes of each other, i.e. duplicate captures |
| `seam-s1e13-activity-node.png` | 1,103,255 |
| `seam-story-episode-list.png` | 953,276 |
| `live-mobile-band.png` | 353,216 |
| `bw-trial-viewer.jpeg` | 177,085 |
| `yomu-api-vitepress-desktop.png` | 149,587 |
| `yomu-api-desktop.png` | 89,150 |
| `.DS_Store` | 14,340 |
| `codex-fable-plan.txt` | 2,211 |
| `yomu-academy-review-prompt.txt` | 1,398 |
| `yomu_l10_prompt.txt` | 1,218 |
| `.codex-world-review-prompt.txt` | 786 |
| `check2.log` | 474 |

`README.md` (2,674 bytes) — **KEEP**, it explains the umbrella layout.

### D. `backlog.md` at the umbrella root — 200,922 bytes — DELETE, but read this first

This is the **stale trap**, and it is not a copy of anything.

- Umbrella `backlog.md`: 200,922 bytes, modified 2026-07-26, titled "Yomu Backlog — Quality-Squad
  Working Document", `Last updated: 2026-07-03`. Line 4 names `git show origin/main:CHANGELOG.md` as its
  truth source and declares itself **authoritative through 1.6.14**, while noting its own CHANGELOG lags
  at 1.6.6. The body still tracks 1.6.14-era items.
- Nested `apps/yomu-reader/backlog.md`: **3,044 bytes**, modified 2026-07-17, "Verified against 1.6.168",
  scoped to product-level open work and explicitly delegating the engineering backlog elsewhere.

So the umbrella file is 66× larger, two weeks older, and pinned to a version far behind the nested doc
(1.6.168), the store-release clone (1.6.241), and shipping work (1.8.78). It is a stale superset, not a
duplicate: it contains prose the 3 KB file does not. **Do not silently delete it** — move it somewhere
outside the tree, or fold anything still live into the repository's own `backlog.md` first. Its danger is
that its size and title make it look authoritative to anyone who opens the umbrella folder.
