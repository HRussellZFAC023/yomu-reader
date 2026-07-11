# Yomu Academy — Content Release Gates

**Contract owner:** independent content audit (read-only).
**Runner:** `node scripts/academy-content-audit/release-gates.mjs` (exit 1 while any P0/P1 gate fails).
**Machine-readable verdict:** `public/academy/content/audit/release-gates.json`.

Each gate encodes one minimum-bar requirement from the audit checklist and reads only the deterministic ground truth in `public/academy/content/audit/*.json`. Gates are intentionally **RED where the content fails the bar** — they mirror the existing `tests/academy/foundation-quality.test.ts` philosophy: document a blocker loudly, go green when the owning content team fixes the *data*, not when the gate is weakened.

> These gates live in the auditor's owned `scripts/academy-content-audit/` tree. They do **not** modify any product code or existing test. Wire `node scripts/academy-content-audit/release-gates.mjs` into CI to enforce.

## Current verdict: 🔴 BLOCKED — 7 blocking failures (4 pass / 9 fail of 13)

One **P0** gate fails (the live answer-key leak); two P0 gates pass.

| Gate | Sev | Status | Checklist item | Actual |
| --- | --- | --- | --- | --- |
| `GATE-TEACHING-NO-ANSWER-KEY` | P0 | 🔴 **FAIL** | answers not disclosed before reveal (pre-attempt teaching) | 2 answer-key leaks in `activity-listen-weekend-plan` (F-P0-1) |
| `GATE-ORDERING-LEAK` | P0 | 🟢 PASS | answers not disclosed before reveal (ordering) | 0 ordering leaks (stale audit doc says otherwise — F-DOC-1) |
| `GATE-FOUNDATION-VALID` | P0 | 🟢 PASS | lesson quality contract holds | 0 validation errors |
| `GATE-COV-SECTION-ANCHOR` | P1 | 🔴 FAIL | source maps to ≥1 week or backlog | 1 section (2025/26 Rie level 2+) anchors 0 lessons |
| `GATE-COV-WEEK-GRANULARITY` | P1 | 🔴 FAIL | three years of weeks, not nine umbrellas | 1/69 weeks individually digitised (1.45%) |
| `GATE-AUDIO-PAIRING` | P1 | 🔴 FAIL | every audio has task + transcript status | 183/185 unpaired; 0/185 transcript status |
| `GATE-WORKSHEET-SURVIVAL` | P1 | 🔴 FAIL | every worksheet question survives | 0 worksheets with extracted questions; both pipelines empty |
| `GATE-CAST-WIRED` | P1 | 🔴 FAIL | cast get meaningful learning appearances | cast-learning.ts imported only by its own test |
| `GATE-SOLO-ADAPTATION` | P1 | 🔴 FAIL | group tasks have faithful solo adaptations | 17 pair/group tasks, no solo field |
| `GATE-CAST-LIVE-APPEARANCE` | P2 | 🔴 FAIL | all cast get meaningful learner-visible appearances | 15/21 reach a learner; 6 (angel/stasi/ruparna/pho/miller/tawapon) do not |
| `GATE-PITCH` | P2 | 🔴 FAIL | pitch complete or explicitly unresolved | 0% pitch, no deferral marker |
| `GATE-RESOURCE-LEDGER` | P2 | 🟢 PASS | every source has a ledger entry | 916/916 ledger entries |
| `GATE-FURIGANA` | P2 | 🟢 PASS | furigana complete or unresolved | 100% vocab reading coverage |

> These 13 gates are the deterministic floor. Several verified findings are **not** gate-backed because they are not cheaply machine-checkable from the extracted JSON (e.g. model-answer gating F-PED-1, rubric-level dropping F-PED-2, JLPT band-vocabulary disjointness F-FW-2). Treat [`FINDINGS.md`](FINDINGS.md) as the complete list; the gates are the automatable subset.

## Exit criteria (what "green" means)

A gate passes only when the *owning content team* changes the underlying data so the ground-truth JSON reflects the fixed state. To clear each blocker:

- **GATE-TEACHING-NO-ANSWER-KEY** (P0) — remove the answer-restating sentences from the listening focus-variant examples (`content.ts:416,424`), or stop rendering `concept.example` in the pre-attempt teaching block for retrieval activities (`app.ts` `renderActivityTeaching`). The detector (`teaching-answer-leak.json`) flags any variant example whose token overlap with a correct answer ≥ 0.6.
- **GATE-COV-WEEK-GRANULARITY** — expand per-week units, or publish `public/academy/content/audit/`-adjacent backlog enumerating every unmapped week with its source IDs. The gate's bar is ≥ ⅓ of upstream weeks individually represented; tune the bar in one place if the team agrees a lower target is acceptable for launch, but do not delete the gate.
- **GATE-COV-SECTION-ANCHOR** — anchor a curriculum lesson to `ucl-2025-rie-level-2-plus`.
- **GATE-AUDIO-PAIRING** — record a transcript status for every MP3 occurrence and pair each with a task (or explicit backlog).
- **GATE-WORKSHEET-SURVIVAL** — run the digitisation pipeline to completion and convert worksheet questions into gradeable items.
- **GATE-CAST-WIRED** — render cast-learning tasks in a learner surface, or delete the dead module and re-scope the claim.
- **GATE-SOLO-ADAPTATION** — add a solo-play path to every pair/group task.
- **GATE-CAST-LIVE-APPEARANCE** — give Angel/Stasi/Ruparna/Pho and the Miller/Tawapon cameos a live foundation-scene appearance, or reclassify cameos as narrative-only in the docs. (cast-learning task appearances are dead data and do not count toward this gate.)
- **GATE-PITCH** — author pitch data, or add an explicit `pitch: runtime-rendered / unresolved` marker so the gap is intentional.

## Rebuild

```sh
node scripts/academy-content-audit/run-audit.mjs   # extracts ground truth, builds matrices, runs gates
node scripts/academy-content-audit/release-gates.mjs   # gates only (reads existing JSON); exit 1 if blocked
```

All extraction is deterministic (sorted keys, no timestamps): a no-change rebuild is byte-stable.
