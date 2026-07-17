# Academy exercise modality audit

**Audit date:** 2026-07-17

**Scope:** current Academy learner runtime, the registered authored-week adapter boundary, and local Yomu SRS grading

**Machine contract:** `src/academy/domain/exercise-modality-registry.ts` and `tests/academy/exercise-modality-conformance.test.ts`

## Executive judgment

The shared Academy activity runtime has genuine, separately graded implementations for JP -> EN recall, EN -> JP recall, single-answer multiple choice, typed free response, listening, Doodle drawing, ordering, matching, cloze, extended reading, and four-grade local SRS review. Those claims are backed by distinct model/response contracts and focused conformance tests; labels alone do not satisfy the audit.

Speaking is not conformant as an assessed runtime modality. The world language lab provides speak-aloud rehearsal and an acknowledgement control, class simulation provides typed/choice conversation turns, and Lesson 0 authors a microphone-capture contract. No mounted `MediaRecorder` or speech-evaluation path currently turns a learner utterance into graded speaking evidence. The machine registry therefore marks speaking `guided-only`.

The registered authored-week path now preserves modern source `cloze`, `matching`, and `ordering` as distinct answer-safe learner models. Multi-blank cloze commits every field together, matching commits a complete one-to-one relation, and ordering commits movable item sequences. Legacy `match`, `order`, and `multi-choice` remain omitted until their differing source contracts receive equally explicit adapters.

## Runtime matrix

| Modality | Status | Conformant runtime contract | What the test proves |
| --- | --- | --- | --- |
| JP -> EN | Native | `academy-source-vocabulary-sheet` / `source-vocabulary-recall` | An odd source row presents Japanese; English passes and the Japanese word does not. |
| EN -> JP | Native | `academy-source-vocabulary-sheet` / `source-vocabulary-recall` | An even source row presents English; the Japanese word/reading passes and English does not. |
| Multiple choice | Native | `choice` / `choice` | A stable option ID is committed and graded against one authored key. |
| Free response | Native | `academy-typed-response` / `kana-input`, `written-description` | Unrevealed Japanese text is graded; the mounted control is a text input or textarea. |
| Listening | Native | `academy-moodle-listening-choice` / `moodle-audio-a-or-b-choice` | Source-bound audio elements render and all track answers are graded. |
| Speaking | Guided only | World language-lab rehearsal | No microphone-backed or speech-evaluated attempt exists; typed class simulation does not count. |
| Drawing | Native | `kanji-writing` / `doodle-then-reading` | A Doodle assessment produces handwriting evidence; keyboard-shaped handwriting is rejected by the underlying plugin test. |
| Ordering | Native | `academy-sequence` / `ordered-items` | Ordered item IDs are graded and the mounted view has per-item movement controls. |
| Matching | Native | `academy-drag-sort` / `drag-or-keyboard-sort` | Every item-to-zone placement is graded and keyboard movement controls render beside draggable items. |
| Cloze | Native | `academy-bank-listening-cloze` / `moodle-track-78-bank-cloze` | Eight source-bound blanks plus the source choice are graded; audio and blank inputs both render. |
| Reading | Native | `academy-story-reader` / `extended-reading-checkpoint` | A multi-section Japanese article renders before separately graded comprehension checkpoints. |
| SRS grading | Native | `yomu-local` / `again`, `hard`, `good`, `easy` | First-review schedules remain distinct: 10 minutes, 1 day, 2 days, and 4 days respectively. |

## Collapse rules

The following are conformance failures even when learner-facing copy uses the requested modality name:

- A listening claim without an audio-bearing response path.
- A speaking claim satisfied by a typed answer, ordinary choice, or self-reported completion.
- Drawing satisfied by keyboard text rather than Doodle canvas evidence.
- Ordering satisfied by typing the final sentence rather than manipulating an order.
- Matching satisfied by independent single-answer choices rather than a complete item-to-target relation.
- Cloze satisfied by a generic standalone text prompt that no longer preserves blank identity and context.
- Reading satisfied by a question whose passage is absent from the pre-commit runtime.
- JP -> EN and EN -> JP satisfied by one cue direction with different labels.
- SRS grading satisfied by four buttons that produce the same schedule.

`exercise-modality-conformance.test.ts` enforces distinct specialized runtime kinds for listening, drawing, ordering, matching, cloze, and reading. The only intentional shared runtime kind is source-vocabulary recall, where the test proves cue and answer behavior in both directions.

## Authored-week delivery census

The census covers all 59 `kind: 'authored-week'` registrations. It reads each registered JSON package, runs the current registration validator, and links source exercises to learner activities by stable package/exercise identity. A new source kind, changed count, or changed delivery kind fails until this registry and audit are updated deliberately.

| Source exercise kind | Raw | Linked | Runtime activities | Current delivery |
| --- | ---: | ---: | ---: | --- |
| `choice` | 370 | 361 | 361 `choice` | Mixed preserved; nine donor-shaped choices do not adapt. |
| `match` | 45 | 0 | 0 | Omitted legacy matching. |
| `cloze` | 81 | 81 | 81 `academy-authored-cloze` | Preserved multi-field cloze with one structured submission per source exercise. |
| `order` | 4 | 0 | 0 | Omitted legacy ordering. |
| `multi-choice` | 6 | 0 | 0 | Omitted multi-select. |
| `exact` | 78 | 71 | 71 `text` | Mixed preserved free response. |
| `writing` | 2 | 0 | 0 | Authored as ungraded production and omitted. |
| `quarantined-listening-choice` | 16 | 9 | 9 `choice` | Mixed delivery; seven remain omitted. |
| `drag-sort` | 2 | 0 | 0 | Omitted at this adapter boundary. |
| `ordering` | 8 | 7 | 7 `academy-authored-ordering` | Mixed preserved; seven graded sources render movable sequences and one source remains ungraded. |
| `class-simulation` | 11 | 0 | 0 | Authored as ungraded speaking/pair work and omitted. |
| `image-fill-blank` | 1 | 0 | 0 | Authored as ungraded and omitted. |
| `matching` | 1 | 1 | 1 `academy-authored-matching` | Preserved complete one-to-one matching with keyboard/mobile-native controls. |
| `character-doodle` | 2 | 0 | 0 | Authored as ungraded drawing and omitted. |

The same adapted packages currently add 124 source-vocabulary rows, which use the native bidirectional recall plugin. Structured authored activities retain stable package/exercise identity and keep answer keys inside private grading closures rather than learner-facing payloads.

## Remaining adapter work

The modern `cloze`, `matching`, and `ordering` contracts are native. The remaining source gaps require their own honest behavior rather than aliases:

1. Legacy `match` needs a source-specific complete placement response.
2. Legacy `order` needs an explicit sequence model compatible with its older payload shape.
3. `multi-choice` needs a set-valued response and an authored partial-credit policy.
4. Speaking and character Doodle need mounted capture/rendering and evidence policies.
5. Ungraded image-fill and writing tasks need media/capture treatment before they can count as assessed delivery.

## Verification

Focused command:

```sh
npx vitest run --config config/vite/academy.config.ts tests/academy/exercise-modality-conformance.test.ts
```

No generated Academy or userscript bundles are required by this audit.
