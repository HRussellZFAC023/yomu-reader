# Lessons 32-34 asset and presentation audit

Date: 2026-07-15
Scope: `l2-l07` through `l2-l09` (curriculum Lessons 32-34)
Excluded: `l2-l10` / Lesson 35 and later

## Runtime decisions

| Lesson | Package | Source-backed class cast | Story origin | Approved plate | Cast presentation |
|---|---|---|---|---|---|
| 32 | `l2-l07` | Francis, Xingyu | ramen | `location.ramen` | name-only |
| 33 | `l2-l08` | Jenny, Stasi | park | `location.park` | name-only |
| 34 | `l2-l09` | Francis, Sophie | lab | `location.language-lab` | name-only |

The ramen plate is the closest approved kitchen-facing scene for Lesson 32's existing practice-kitchen display. The park plate provides the approved plant-rich framing for Lesson 33's fictional glasshouse word walk without inventing a new place image. The language-lab plate is the approved console-based framing for Lesson 34's media room.

No class host or activity character has an approved lesson-runtime likeness. Felix's current cutouts remain journal-only review previews, and no likeness is shown for Francis, Xingyu, Jenny, Stasi, Sophie, Shin, or Ruparna. All approved item art is bound to an earned world reward, so no unrelated prop is reused as activity decoration.

## Source visuals and answers

| Package | Exact runtime page | SHA-256 |
|---|---|---|
| `l2-l07` | `moodle-chapter-21-deshou-teaching-task-page-1.png` | `68cdcf841810f4738474a813fd60eafbfdd5e384da0d0e10fcaf987f552c05a9` |
| `l2-l08` | `moodle-chapter-22-1-clause-rail-page-1.png` | `36a073904a47724326460931351b7a5e9c66c60a502e085fd26fb2f64e29c642` |
| `l2-l09` | `moodle-chapter-22-2-particle-mixer-page-1.png` | `5257d4151ac5111057e4ffe7a227e208adc5bd0b8ca4c5532687266b0a8df406` |
| `l2-l09` | `moodle-chapter-22-2-particle-mixer-page-3.png` | `3084a14e5136c6ee654d0d984ed11697f7bf757833f99354aa2f7f03159efea6` |

The four delivered pages were visually inspected. They contain Sensei's teaching, examples, and uncompleted target prompts; no target answer key is printed on them. Each page is now a keyboard-reachable responsive thumbnail with a viewport-bounded inspector. The full-size modal image is created only after the learner opens it.

Yomu-derived confirmations, completed clauses, and particle choices remain absent from the visible answer section until an attempt. Earned hints still appear only for missed rows.

## Offline and ledgers

All four exact page renders and all six wide/mobile location deliveries are present in both service-worker cache manifests. The public and hosted `ASSET-USAGE.json` ledgers now record the three lesson homes while retaining each plate's existing world and activity homes. Source-package and worksheet provenance remains in `RESOURCE-LEDGER.json` and `ART-AND-AUDIO-LEDGER.md`.

Focused test: `tests/academy/lesson-32-34-asset-presentation.test.ts`

## Verification

- `npm run typecheck`: pass.
- Focused presentation and neighboring activity/runtime suite: 25/25 tests pass.
- Real Academy route at `1280x900`: Lesson 32 selected the wide ramen plate with no overflow, unsupported likeness, or prop art.
- Real Academy routes at emulated `390x844`: Lessons 32-34 selected their mobile ramen, park, and language-lab plates; all images loaded at `900x1125`; local location labels and name-only cast remained visible with no horizontal overflow.
- Real activity modules at `390x844`: all four exact source pages loaded at their original pixel dimensions, the inspector dialogs measured `378x832` inside the viewport, and opening one inspector created only its own full-size image. Answer sections remained hidden and no character or item art appeared.
- Browser console: no warnings or errors.
- Cross-model review: unavailable because the local Claude account reported its weekly limit, resetting 2026-07-19 at 05:00 Europe/London.
