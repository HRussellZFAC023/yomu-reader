# Verified Discovery Baseline

## Repository topology

As of 2026-07-12:

- Canonical Reader repo: `/Users/heru/Documents/Projects/yomu/apps/yomu-reader`
- Current `origin/main`: `5df8328a0221a2b73544b1bf4a482e8b25563e25`; it contains no Academy paths.
- The local `main` checkout contains active Reader pitch/hover work and is the Academy implementation target. Preserve those unrelated changes while integrating current upstream work.
- Donor A: `/Users/heru/Documents/Projects/yomu/release-worktrees/yomu-academy-initial-20260711`, branch `yomu-academy-initial`, 128 Academy content files plus a large dirty/generated state.
- Donor B: `/Users/heru/Documents/Projects/yomu/release-worktrees/yomu-academy-rebuild-20260711`, branch `academy-rebuild-20260711`, commit `666b339b6`, 57 `src/academy` files and 1,318 public Academy files. It is dirty with unfinished `app.ts`, CSS, week-rail, content-index, and sprite-output work; review those files as patches.
- Shared post-rebuild base: commit `1528bfb6c` in the Codex worktrees. It includes the rebuilt Academy shell and should be compared against current `origin/main`, not treated as current production.

## Dormant Codex workstreams worth salvaging

Each path is an isolated patch source. Review diff, tests, and runtime behavior before porting.

| Worktree | State | Useful payload |
| --- | --- | --- |
| `~/.codex/worktrees/0cdc/yomu-reader` | dirty | dynamic map areas, navigation, map tests |
| `~/.codex/worktrees/2f33/yomu-reader` | untracked | responsive CSS contract and test |
| `~/.codex/worktrees/3df8/yomu-reader` | untracked | accessibility/E2E QA scaffolding |
| `~/.codex/worktrees/4794/yomu-reader` | untracked report | Cloudflare access implementation prompt/result |
| `~/.codex/worktrees/47ad/yomu-reader` | untracked | integrated Academy SRS module |
| `~/.codex/worktrees/6e4a/yomu-reader` | untracked | evidence-backed zero-to-N1 expansion |
| `~/.codex/worktrees/9eef/yomu-reader` | untracked | worksheet-pack v2 scripts |
| `~/.codex/worktrees/c067/yomu-reader` | dirty | PWA implementation and tests |
| `~/.codex/worktrees/c091/yomu-reader` | dirty/untracked | two-way KanjiVG/Doodle practice card |
| `~/.codex/worktrees/c6ab/yomu-reader` | dirty | cast registry and journal tests |
| `~/.codex/worktrees/d543/yomu-reader` | untracked | onboarding and protagonist profile |
| `~/.codex/worktrees/dd1c/yomu-reader` | dirty/untracked | audio controller and tests |
| `~/.codex/worktrees/e008/yomu-reader` | committed `1a580caf2` | source coverage audit and 13k-line media backlog |
| `~/.codex/worktrees/ec63/yomu-reader` | dirty/untracked | first-term story catalogue and metadata |

The abandoned branch names all initially pointed at the same `1528bfb6c` base; their value is mostly uncommitted worktree content. A branch merge will miss it.

## Content baseline

Verified donor records establish:

- 3 Moodle courses, 10 sections, 148 modules.
- 96 downloaded folder archives.
- 916 archive-member occurrences, 688 unique payloads, and about 1.47 GB uncompressed.
- 716 PDF occurrences, 527 unique PDF payloads.
- 185 MP3 occurrences, 146 unique audio payloads.
- 73 indexed class-week records; 38 currently authored in the strongest curriculum audit.
- 44 digitised document packs and 879 items in the earlier pass.
- Genki local study resources: 24 lessons, 959 HTML exercises, 150 audio files.
- The wider Japanese folder contains 501 PDFs, 3,736 MP3s, 601 PNGs, 565 JPGs, 72 Anki packages, 49 MP4s, and additional dictionary/tool corpora.

These are distinct denominators:

1. **Source occurrence:** where a file appeared in a course/week.
2. **Unique payload:** a deduplicated PDF/audio/document.
3. **Source question:** a numbered or semantically distinct prompt inside a payload.
4. **Playable activity:** an Academy rendering of a source question or augmentation.
5. **Concept coverage:** the knowledge/skill taught or assessed.

Coverage reports must not substitute one denominator for another.

## Known content gaps

- 35 indexed class weeks still lack authored week payloads.
- Minna 24 and 26 are absent from the harvested spine and need original bridge units.
- Most unique Moodle PDFs have not reached lossless source-question records.
- Image-dependent questions are not yet reliably tracked as media requirements.
- Audio occurrence, transcript status, question pairing, and rights status are not unified in one record.
- N3-N1 has a credible outcomes map but no release-ready input bank, placement bank, or moderated production rubrics.
- Soya is useful for interaction shapes, scope, and gap detection; its generated question wording and media are not the canonical content source.

## Source audits already worth keeping

- `~/.codex/worktrees/e008/yomu-reader/docs/academy/content-audit/`
- `~/.codex/worktrees/e008/yomu-reader/public/academy/content/audit/`
- `~/.codex/worktrees/6e4a/yomu-reader/docs/academy/curriculum/ZERO-TO-N1-EXPANSION.md`
- Donor A `public/academy/content/source-ledger/`, `worksheet-packs/`, `weeks/`, `mappings/`
- Donor A `docs/academy/research/`, `PROGRESSION-SRS.md`, `IMMERSION-MODEL.md`, `USER-RESEARCH.md`

## Pinned reference engines

Already cloned under `references/academy-engine/`:

- ink `35c63e52f1d36060930dc7ed3cfba38ea224b528`
- inkjs `1b17540a619021b551ecc4bc5bf873758e6b509b`
- Monogatari `86659baf065178071f0956092f754e1d76be0072`
- howler.js `1d3053576a860e9854645493ad6c4a72c6cc6e45`
- Workbox `62b9d8ba8eb3c1a2ab8aac9d84c90cda7865d6a3`
- ts-fsrs `cdec8d2f8340f8e62ced596c1da02e20e70073f0`

Exact adaptation points are in `REFERENCE-CODE-HARVEST.md`.

## Transcript sources

- Newer Claude parent session: `/Users/heru/.claude/projects/-Users-heru-Documents-Projects-yomu/ba544dcb-e7b2-420b-96b4-2b3d26dfe6b9.jsonl`
- Codex session archive: `/Users/heru/.codex/sessions/2026/07/11/` and `/Users/heru/.codex/sessions/2026/07/12/`
- Founding Codex thread: `019f3220-a107-7262-95f1-b8f7573a667f`
- Generated-image store: `/Users/heru/.codex/generated_images/`

The transcript-mining output should be a compact decision ledger containing request, rationale, accepted implementation, superseding feedback, and evidence path. Raw transcript volume should not enter the implementation prompt.
