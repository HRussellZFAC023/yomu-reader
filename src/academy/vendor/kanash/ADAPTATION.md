# Kanash kana mastery adaptation

- Upstream repository: https://github.com/benoitlx/kanash
- Pinned commit: `ee8669635d33661bd92deef97e0f73fe03043984`
- Upstream license: MIT, copied verbatim in `LICENSE`
- Upstream files directly adapted:
  - `kanash-components/src/kana.rs`
  - `kanash-components/src/helper/ja.rs`
- Yomu engine: `kana-mastery-engine.ts`
- Yomu wrapper: `../../../ui/lesson-zero-kana-mastery.ts`

## Reused behavior

The Yomu engine ports Kanash's small model/update loop: one current kana, typed
romaji, shown/correct counters, a reveal-answer state, mode-specific kana
selection, and clearing the input before advancing to another kana. Kana items
remain data supplied by the lesson, matching Kanash's separation between the
trainer state and its kana pool.

## Yomu changes

- Rust/Ratatui rendering is replaced by a dependency-free TypeScript engine and
  semantic DOM wrapper.
- Lesson 0 supplies only the five hiragana explicitly taught by its pinned
  Moodle source (`あいうえお`); later lessons can supply larger pools.
- Random selection becomes a shuffled mastery queue so every taught kana must
  receive one clean response.
- A wrong or revealed item is requeued and cannot count as mastered until a
  later clean response. There is no timer or sudden-death path.
- Answer reveal is disabled until a learner attempt, preserving Academy's
  assessed-answer contract.
- Completion is emitted only after the full queue is mastered and the learner
  activates the explicit Lesson 0 completion control.
