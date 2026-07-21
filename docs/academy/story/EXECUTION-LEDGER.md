# Narrative execution ledger

This is a non-checkbox execution ledger. [`../BACKLOG.md`](../BACKLOG.md) is the only Academy completion board; every row below links to its canonical item IDs. Status words describe sequencing, not completion.

## Canonical narrative program

| Workstream | Canonical IDs | Execution state | Next proof |
| --- | --- | --- | --- |
| Recovered 48-chapter draft | [`BASE-006`](../BACKLOG.md#base-006), [`BASE-007`](../BACKLOG.md#base-007) | Verified bounded slice | Preserve 48/48 reachability while later edits land. |
| Runtime schema and migration | [`STO-002`](../BACKLOG.md#sto-002) | Ready | Freeze parser/events/migrations before parallel content binding. |
| Tone, Japanese, psychology and N+1 chronology | [`STO-001`](../BACKLOG.md#sto-001), [`PED-001`](../BACKLOG.md#ped-001), [`PED-002`](../BACKLOG.md#ped-002), [`PED-007`](../BACKLOG.md#ped-007), [`N1P-001`](../BACKLOG.md#n1p-001) | Active dependency | Line-by-line verdicts, production-gate fields, runtime observations and new voice locks for 48 chapters. |
| Grounded lesson seams | [`STO-003`](../BACKLOG.md#sto-003), [`CUR-003`](../BACKLOG.md#cur-003), [`CUR-014`](../BACKLOG.md#cur-014) | Blocked by first grounded Week and 200+ curriculum map | No `lesson:pending:*`; real evidence/repair/return per chapter. |
| Cast and textbook guests | [`CAST-001`](../BACKLOG.md#cast-001), [`CAST-002`](../BACKLOG.md#cast-002) | Roster reconciliation | Per-person learning/story/voice/art denominator. |
| Relationships and appointments | [`STO-004`](../BACKLOG.md#sto-004) | Planned | Consent-cleared relationship manifest and first complete route. |
| Callbacks, messages and voice cards | [`STO-005`](../BACKLOG.md#sto-005) | Planned | Validator-backed seed/echo/transform/payoff and safe thread. |
| Scene signatures | [`STO-006`](../BACKLOG.md#sto-006) | Schema first | Bind U001-U105, then real-app phone/desktop/reduced-motion QA. |
| Subplots and story-world texture | [`STO-007`](../BACKLOG.md#sto-007) | Reservoir only | Ground one original subplot in curriculum, consent and world state. |
| New Game Plus and postgame | [`STO-008`](../BACKLOG.md#sto-008) | Downstream | Graduation-gated storylet and finite-canon replay proof. |
| Editorial, consent and release review | [`STO-009`](../BACKLOG.md#sto-009) | Release gate | Independent copyright, Japanese, pedagogy and continuity verdicts. |
| Story performance art and voice | [`ART-003`](../BACKLOG.md#art-003) to [`ART-006`](../BACKLOG.md#art-006), [`AUD-001`](../BACKLOG.md#aud-001) to [`AUD-005`](../BACKLOG.md#aud-005) | Grader/editorial dependent | Story and bond lines enter the deterministic full-game voice census; approved portrait/scene/audio bindings use exact hashes, and the 1,787-row tranche is not completion. |
| Universe publication | [`DOC-002`](../BACKLOG.md#doc-002) | Seeded, not complete | Expand/check reachable wiki against canonical registries. |

## Ordered integration

| Rank | Canonical IDs | Work | Dependency |
| ---: | --- | --- | --- |
| 1 | `STO-002` | Freeze story package, event, migration, relationship, location and class-thread contracts. | `BASE-006`, `GOV-001` |
| 2 | `STO-001`, `PED-001`, `PED-002`, `PED-007` | Edit 48 chapters line by line; lock natural Japanese, distinct voices, learner purpose, bounded load, autonomy, competence feedback, curiosity, rapport, meaningful payoff, return cue and stopping point. | Rank 1 |
| 3 | `STO-003`, `CUR-003` | Replace pending hooks with source-grounded learning loops and exact return seams. | Ranks 1-2; first grounded Week |
| 4 | `CAST-001`, `CAST-002`, `STO-004`, `STO-005` | Bind cast/textbook roles, relationships, appointments, callbacks and threads. | Ranks 1-3 |
| 5 | `STO-006`, `ART-002..006`, `AUD-001..007` | Bind 105 scene signatures and approved audiovisual performance. | Schema, grader JSON, voice locks |
| 6 | `STO-007`, `STO-008` | Integrate original subplots, NG+ and postgame on finite canon. | Ranks 1-5; N1 curriculum |
| 7 | `STO-009`, `REL-001`, `REL-002` | Run route, editorial, consent, copyright, accessibility and release review. | Integrated runtime |

## Frozen file ownership for scene-signature work

| Owner | Scope | Canonical owner |
| --- | --- | --- |
| `O-RUNTIME` | Story signature schema/runtime, runner, learner events and focused tests | `STO-002`, `STO-006` |
| `O-UI` | Story screen, VN stage, performance engine, prop/hotspot/talk host and styles | `STO-006`, `VIS-001` |
| `O-CONTENT-1` | U001-U033, Chapters 1-12 | `STO-001`, `STO-003`, `STO-006` |
| `O-CONTENT-2` | U034-U057, Chapters 13-24 | `STO-001`, `STO-003`, `STO-006` |
| `O-CONTENT-3` | U058-U081, Chapters 25-36 | `STO-001`, `STO-003`, `STO-006` |
| `O-CONTENT-4` | U082-U105, Chapters 37-48 | `STO-001`, `STO-003`, `STO-006` |
| `O-ART` | Owner grader JSON, exact approved assets and runtime registries | `ART-001` to `ART-005` |
| `O-AUDIO` | Voice locks, semantic SFX/music and runtime manifests | `AUD-001` to `AUD-007` |
| `O-VERIFY` | Matrix, catalog, real-route Browser evidence and adversarial review | `STO-009`, `QA-001`, `REL-001` |

The four content ranges remain file-disjoint after `STO-002` freezes the schema. Art and audio may use explicit fallback/silence while awaiting approval, but no approval-dependent item may be reported complete.

## Preserved historical facts

The original checklist recorded 49 decisions: 14 completed design/recovery decisions and 35 open runtime/editorial/release tasks. Those states have been consolidated into the canonical IDs above. Important facts retained from that board are:

- The four-season finite canon and 48-package draft are recovered; authored draft is not the same as grounded or release-ready.
- Chapters 25-48 require N3-N1 package families and real activity hooks even though story JSON exists.
- Episode 24 must close the first exhibition without implying graduation; the Atlas review belongs after Chapter 48.
- Shaun remains story-bounded until evidence changes; Mary and Takeshi remain sparse source-grounded textbook cameos until voice review.
- Portrait eligibility, consent withdrawal, source safety and copyright similarity are hard runtime/release gates.
- Placement bridges may change curriculum support but never auto-complete canon, relationships or graduation.
- Replay and practice may append learning evidence but never canon, relationship, unlock or graduation events.
- The scene matrix authority remains 48 packages, 105 scenes, 290 stage nodes, 81 Keep and 24 Refine decisions; authored signatures are not runtime binding.
- Optional talk requires dossier provenance and a no-talk route; callbacks must resolve to the finite ledger and remain within budget.
- Physical sounds never borrow generic UI cues; silence is the valid fallback.

## Stop conditions

- No story completion claim without current code, route, tests, real-app QA and all named canonical proof gates.
- No new dialogue after line lock without invalidating its voice asset.
- No unapproved portrait, likeness or generated scene at runtime.
- No copied game/anime prose, character, lore, UI or distinctive plot; research yields original mechanics only.
- No chapter, bond or scene advances because the learner watched dialogue, spent time or repeated easy work.
