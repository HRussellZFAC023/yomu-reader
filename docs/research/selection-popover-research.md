# Text-selection lookup — simulated user research (2026-06-16)

Synthesised user research for the **selection popover** (highlight Japanese text →
"選択範囲" popover with parsed word rows, action pills, and the source sentence).
Personas are composites of immersion-learner workflows seen across Yomitan,
10ten, jpdb-breader/anki-jpdb.reader, asbplayer, and Migaku users; grounded in
the feature as built (`src/reader/main/token-list.ts`,
`src/reader/sources/word-pills.ts`, selection triggers in
`src/reader/app/main.ts`). Informs the 0.7.79 selection work.

## Personas

- **Reina — graded-reader / news reader (intermediate).** Reads NHK Easy and
  Satori on desktop. Selects a phrase she half-knows, wants the whole phrase
  segmented and each word's reading at a glance, then jumps one word to JPDB.
- **Marcus — manga + YouTube immersion (upper-beginner), iPad.** Touch-only.
  Selects with the iOS handles/loupe; hates when the popover fights his thumb or
  re-opens the wrong word.
- **Yuki — sentence miner (advanced).** Mines i+1 sentences into Anki/JPDB. The
  selection *sentence* is the unit she cares about; the individual tokens are how
  she picks the target word.

## What users like (keep / don't regress)

1. **Whole-selection segmentation in one shot** — selecting a phrase and getting
   every token (surface + reading) without N separate lookups. This is the headline value vs. single-word hover.
2. **Action pills route to the tool they already trust** — Jiten / JPDB / Jisho /
   Copy / Yomu. Users don't want Yomu to *be* every dictionary, just to hand off cleanly.
3. **"解析元" source line** confirms what was actually parsed (catches selection
   that grabbed an extra particle or clipped a word).
4. **Copy the exact selection** — for SRS sentence fields and quick paste into
   other tools.
5. **It works on arbitrary pages**, not just supported readers.

## Pain points & wants (ranked by impact ÷ effort)

| # | Want | Persona | Impact | Effort | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | Actions reachable without scrolling past a long token list | all | high | low | **Shipped 0.7.79** — pills moved to top |
| 2 | Tapping a token must not also trigger the word *under* the popover | Marcus | high | low | **Shipped 0.7.79** — click-through guard |
| 3 | Selection should reliably open after handle/loupe adjust (iPad) | Marcus | high | low | **Shipped 0.7.79** — debounced `selectionchange` |
| 4 | Per-token JPDB state colour in the row (known / due / new) | Reina, Yuki | high | med | Proposed — rows already have vid/sid; reuse card-state signal bus |
| 5 | One-tap "mine whole sentence" pill (Anki/JPDB) using 解析元 as the sentence | Yuki | high | med | Proposed — sentence already computed (`getSelectionSentence`) |
| 6 | Inline gloss on the token row (first meaning) without opening the card | Reina | high | med | Proposed — needs gloss in token payload or lazy fetch |
| 7 | Pin / keep-open so the popover survives losing the selection while reading | Reina | med | med | Proposed — add a pin toggle; suppress auto-close |
| 8 | Audio (TTS / pitch) pill for the selected word or sentence | Marcus | med | med | Proposed — reuse existing audio controller |
| 9 | Grammar / conjugation hint when selection is one inflected word | Reina | med | high | Proposed — deinflection already exists for lookups |
| 10 | Keyboard nav of token rows + Enter to open (arrow keys) | Reina | low | low | Proposed — rows are buttons; add roving tabindex |
| 11 | Remember last-used dictionary and reorder pills by recency | all | low | low | Proposed |
| 12 | De-duplicate repeated tokens / collapse particles toggle | Yuki | low | med | Proposed |

## Notes for implementation

- Items 1–3 are the 0.7.79 fixes; the rest form a backlog. Highest-leverage next
  step is **#4 per-token state colour** (cheap given rows carry `data-vid`/`data-sid`
  and the card-state signal bus already exists) and **#5 sentence mining** (the
  sentence is already derived for the lookup).
- Keep the popover a *router*, not a second dictionary — every added affordance
  should still hand off to JPDB/Anki/Yomitan rather than reimplement them.
- Touch is the constraint that matters most (Marcus): every new control must have
  a ≥40px target and must not overlap the page text the popover sits on.

Personas and rankings are simulated for prioritisation, not collected from real
users; validate #4–#6 against actual usage before committing UI surface.
