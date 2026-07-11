# Yomu Academy — Weekly Lesson Schema (`yomu-academy.week.v1`)

This is the **authoring contract** for every file under `public/academy/content/weeks/`.
One JSON file per class week, named `<order>-<id>.json` (e.g. `053-l3-2-l04.json`).
`scripts/academy-weeks/validate-weeks.mjs` enforces every rule below and **must pass**.

The corpus is a **new, self-contained data collection**. It aligns to the vocabulary of
`src/academy/*` (grading kinds, cast ids, source-reuse enums, expression enums) but is
authored and validated independently — no `src/**` edits.

## Non-negotiable principles

1. **Original Yomu content only.** You COVER a source worksheet's pedagogical function with
   new writing. You NEVER copy or paraphrase source bytes, wording, answer keys, or audio.
   Grammar points (て-form, 〜てしまう …) are public facts — authoring fresh practice for them
   is original work. If you cannot cover a worksheet without inventing what it *said*, mark it
   a **gap**, do not guess.
2. **Explanation before exercises.** Every component that grades the learner must come after
   the grammar explanation. The validator enforces `order`.
3. **Preserve everything.** `identity` and `sourceCoverage` are copied verbatim from the week
   plan (`scripts/academy-weeks/generated/week-plan.json`). Every source worksheet must appear
   in `sourceCoverage.coverageMap`, marked `covered` or `gap`.
4. **Universal wording.** Works for any learner, any evening. Never name "UCL" or a specific
   weekday/venue as if it were the only class. No AI-slop vocabulary (see validator list).
5. **Warm, human voice.** Rie-sensei could say it aloud. Meaning-first. The learner is never
   the joke. Button/label strings ≤ 24 chars; short UI strings ≤ 120 chars.

## Top-level shape

```jsonc
{
  "schema": "yomu-academy.week.v1",
  "id": "l3-2-l04",                 // must equal the week-plan id
  "order": 53,                       // must equal the week-plan order
  "weekKind": "lesson",              // from plan: orientation|term-kickoff|lesson|script-hiragana|
                                     //            script-katakana|kanji-set|self-study|pre-study|consolidation
  "title": { "en": "...", "ja": "..." },     // authored, warm, universal
  "estimatedMinutes": 90,

  "identity": { /* copied verbatim from plan.weeks[].identity */ },
  "sourceCoverage": {
    /* copied verbatim from plan.weeks[].sourceCoverage, PLUS: */
    "coverageMap": [
      { "payloadSha256": "…", "worksheetTitle": "Chapter 29-2 …",
        "coveredBy": ["grammar", "ex-teshimau-cloze"], "howCovered": "Original 〜てしまう practice set",
        "status": "covered" }
      // every member of sourceCoverage.members must appear once; status "covered" or "gap"
    ]
  },
  "mapping": { "ucl": "2025/26 · Level 3-2 · Lesson 4", "genki": "≈ L18", "minna": "II · L29",
               "jlpt": "N4", "customOrders": ["chronology", "minna", "jlpt"] },
  "provenance": {
    "authoringPolicy": "original-yomu",
    "sourceMappings": [                         // relation ∈ chronology|sequence|scope|placement|input-bank|practice-shape|continuation
      { "sourceId": "source-ucl-moodle-raw-manifest", "relation": "chronology",
        "reference": "module 8121268", "reuse": "metadata-only", "note": "…" }
      // reuse ∈ metadata-only|structure-only|sequence-only|scope-only|original-yomu|public-domain-retelling|rights-review-required
      // NEVER "direct-copy".
    ],
    "gaps": [ /* strings: unresolved items needing human review; [] if none */ ]
  },

  "learningObjectives": [ "…", "…", "…", "…" ],   // ≥ 4, learner-facing, concrete

  "scene": {                                       // DIALOGUE-LED opening
    "where": "Ramen counter before class",
    "sceneImage": "academy/art/scenes/…-wide.webp",
    "hook": "One warm line of setup.",
    "cast": ["rie", "shin", "mika"],               // painted ids only (rie + 18 classmates); cameos miller/tawapon allowed
    "transcriptToggle": true,                      // JA-only ↔ JA+EN
    "lines": [                                     // ≥ 4
      { "speakerId": "shin", "expression": "warm", "pose": "explain",
        "japanese": "…", "reading": "…", "english": "…", "note": "optional cue" }
      // expression ∈ neutral|warm|thinking|determined|surprised|relieved
    ]
  },

  "explanation": {                                 // TEACH FIRST — must precede graded components
    "order": 5,
    "recap": "What last week gave us (cumulative).",
    "intro": "Plain-language setup of today's idea.",
    "grammarPoints": [                             // ≥ 1
      { "pattern": "〜てしまう", "nameJa": "〜てしまいました", "meaning": "completion / regret",
        "explanation": "…", "watchFor": "…", "commonError": "…",
        "examples": [ { "ja": "…", "reading": "…", "en": "…", "note": "…" } ] }   // ≥ 2 examples
    ]
  },

  "components": [                                   // ordered; each order > explanation.order
    /* Required component types (each exactly once):
       authentic-input, vocabulary, grammar, listening, reading, speaking, writing, kanji, review */
  ],

  "mission": {                                     // the week's real-world task
    "title": "…", "framedBy": "shin",              // a classmate sets the task
    "prompt": "…",
    "successCriteria": [ "…", "…", "…", "…" ],      // ≥ 4
    "modelAnswer": { "revealAfterFirstAttempt": true, "ja": "…", "reading": "…", "en": "…" },
    "rubric": { "criteria": [ { "id": "…", "label": {"en":"…"}, "levels": [ {"score":2,"description":{"en":"…"}} ] } ] }
  },

  "srs": {                                         // extraction for the reader SRS
    "intervalDays": [1, 3, 7, 14, 30],
    "extracted": [                                 // ≥ 8 items
      { "kind": "vocabulary", "front": "…", "back": "…", "reading": "…", "tags": ["academy","academy:lesson:l3-2-l04"] }
      // kind ∈ vocabulary|grammar|kanji
    ]
  },

  "casting": { "sensei": "rie", "participants": ["rie","shin","mika"] }   // subset of painted ids
}
```

## Component shapes

Every component: `{ "type": <one of the 9>, "order": <int > explanation.order>, "title": {en,ja?}, "provenance": {reuse, note}, … }`.

- **authentic-input** — `reading: { title:{en,ja?}, lines:[{ja,reading,en,note?}] (≥3), gloss, glossToggle:true }`, `exercises:[Exercise] (≥1)`.
- **vocabulary** — `items:[{ja,reading,en,example:{ja,reading,en}, tags[]}] (≥8)`, `exercises:[Exercise] (≥1)`.
- **grammar** — `practiceFor:["〜てしまう"]`, `exercises:[Exercise] (≥3)`. (The teaching text lives in `explanation.grammarPoints`; this block is the graded practice.)
- **listening** — `audio:{ assetId, locator, durationSeconds, script, voiceNotes }`, `transcript:{ revealAfterFirstAttempt:true, body }`, `audioWorksheetPairing:{ pairedWith:"<payloadSha256 of a source audio/listening member>", note }`, `exercises:[Exercise] (≥2)`.
- **reading** — `passage:{ title, lines:[{ja,reading,en}] (≥3), gloss }`, `exercises:[Exercise] (≥2)`.
- **speaking** — `prompt, targets:[…], recording:{ minSeconds, maxSeconds }, modelAnswer:{ revealAfterFirstAttempt:true, ja, reading, en }, rubric:{criteria[]}`, `exercises:[]` optional. `autoGraded:false`.
- **writing** — `prompt, minChars, maxChars, reviewMode:"self-review"|"teacher-review", modelAnswer:{ revealAfterFirstAttempt:true, body }, rubric:{criteria[]}`. `autoGraded:false`.
- **kanji** — `items:[{ character, readings:{on:[…],kun:[…]}, meaning, exampleWord:{ja,reading,en}, recognition:{prompt, answer}, handwriting:{ required:true, strokeCount, mnemonic, tracePrompt } }]`, `exercises:[Exercise] (≥1)`. For `kanji-set`/`script-*` weeks this is the core; for kana weeks `items[].character` is a kana and `readings` may be `{}`.
- **review** — `reviewFrom:[weekId,…]`, `cumulativeCheckpoint:{ isCheckpoint:<bool>, targetsWeekIds:[…], srsIntervalDays:[1,3,7,14,30] }`, `exercises:[Exercise] (≥2 mixing prior chapters)`.

## Exercise shape (the graded unit)

```jsonc
{
  "id": "ex-teshimau-cloze",
  "kind": "cloze",     // exact|choice|multi-choice|order|cloze|match|open-writing|open-speaking
  "prompt": { "en": "…", "ja": "…" },
  "japanese": "…",     // optional stimulus
  "explanation": "Shown on BOTH correct and incorrect — the teaching note.",
  "reviewTag": "teshimau",
  "autoGraded": true,  // false for open-writing/open-speaking
  "wrongAnswerExplanations": [   // ≥1 for exact|choice|multi-choice|cloze; specific & useful
    { "trigger": "〜てしまった", "message": "That's the plain form — here we need the polite past 〜てしまいました." }
  ],
  // per-kind answer fields:
  "answer":        { "primary": "…", "alternatives": ["…"] },       // exact
  "options":       [ { "id":"a", "label":{"en":"…","ja":"…"}, "correct":true } ],  // choice(exactly 1 correct) / multi-choice(≥1)
  "correctOrder":  ["a","b","c"],                                    // order (permutation of option ids)
  "blanks":        [ { "id":"b1", "answer":{"primary":"…","alternatives":[]} } ],  // cloze
  "pairs":         [ { "id":"p1", "left":{"ja":"…"}, "right":{"en":"…"} } ]         // match
}
```

Grading semantics mirror `src/academy/grading.ts`: NFKC normalize; kana↔kanji equivalence is
**never** inferred — list every acceptable spelling in `alternatives`. `open-*` are never
auto-graded (`autoGraded:false`) and require `rubric` + a model answer revealed after the first attempt.

## Weekly variation by `weekKind`

- **orientation / term-kickoff** — lighter: `scene`, `explanation`, `learningObjectives`, a
  `vocabulary` + `kanji`(kana) + `review` + `mission`; other components optional but encouraged.
  Still needs `srs.extracted` (≥4) and a coverage map.
- **script-hiragana / script-katakana** — `kanji` component holds the kana with
  `handwriting.required:true`; recognition exercises; no grammar practice required, but keep
  `explanation` (how the script works) and a `mission`.
- **kanji-set** — `kanji` component with all set characters, handwriting required each;
  recognition + reading exercises; `srs.extracted` covers every character.
- **lesson / self-study / pre-study / consolidation** — full component set.

The validator relaxes required-component checks for `orientation`, `term-kickoff`,
`script-*`, and `kanji-set`; it never relaxes coverage-map, srs, voice, or provenance checks.
