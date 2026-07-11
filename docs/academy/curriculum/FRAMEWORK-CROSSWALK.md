# Framework crosswalk

Maps each concept to Genki I/II, Minna no Nihongo I/II, JLPT, and the JF Standard
Can-do statements. Canonical data:
`public/academy/content/mappings/framework-crosswalk.json`.

## How the mapping is structured

Grammar, function, and skill concepts get a per-concept row. Kanji, vocabulary
sets, and phonology are mapped by band-level rules, because Genki and Minna
introduce kanji and vocabulary in their own order that does not line up
character-for-character with this course; a per-character textbook citation would
be invented precision. The band rules say, honestly, "N5-band kanji correspond to
the Genki I / Minna I kanji companions" and stop there.

## Confidence tags

Every textbook cell carries a confidence tag:

- **high** — the course itself anchors the concept (most clearly the Minna II
  28–30 mappings, which the maker's live class fixes), or the placement is
  unambiguous (は/です at Genki I L1).
- **approximate** — the exact textbook lesson number is a best-effort scope
  estimate. These were flagged for specialist verification; see the linguistic-QA
  report and `domain-reports/crosswalk-verification.json`.
- **scope** — used only in band rules, where the match is deliberately
  band-level, not lesson-level.

Treat an `approximate` Genki/Minna number as "around here", not as a citation.
The JLPT band and the Minna II 28–30 anchors are the load-bearing mappings.

## JLPT

Bands are placement heuristics. The base course runs pre-N5 → N5 → N4, ending at
N4-secure / N3-on-ramp. N3 is a target of the post-source syllabus, not a band
the class materials cover. A few kanji (確, 認, 敗, 誕) sit above their lesson's
band because a task word pulled them in early; those are marked N3 in the concept
registry and noted in the band rules.

## JF Can-do

Each grammar/function/skill row carries a `jfCanDo` cell with a CEFR level and a
paraphrased descriptor (A1 ≈ N5, A2 ≈ N4/N5, B1 ≈ N3/N4). Descriptors are
paraphrased, not reproduced verbatim. The functions in the registry are written
as can-do statements precisely so this mapping is direct: `function:invite-suggest`
→ JF A2 "invite someone and arrange to meet."

## Worked rows

- `grammar:nagara` → Genki II L18 (high), Minna II L28 (high), JLPT N4,
  JF A2 "describe doing two things at the same time." Both anchors are firm: the
  live class teaches nagara in Minna chapter 28, and verification confirmed nagara
  sits in the Genki L18 transitivity/te-shimau cluster. (This cell shipped as an
  `approximate` L21 estimate; the crosswalk-verification pass corrected it to L18.)
- `grammar:te-form-sequence` → Genki I L6/L11 (high), Minna I L16 (high), JLPT
  N5, JF A2 "describe a sequence of actions." This is the productive te-form that
  the pre-N5 `grammar:te-kudasai` chunk was standing in for.

## Rights

Genki, Minna, JLPT, and JF references are sequence/scope citations. No textbook
wording, audio, or artwork is reproduced. This matches the rights posture of
`src/academy/curriculum.ts` and the source audit in
`docs/academy/CURRICULUM-COVERAGE.md`.

## Validation

`node scripts/academy-curriculum/validate-crosswalk.mjs` checks that every
grammar/function/skill concept has exactly one row, every kanji/vocab/phonology
concept is covered by a band rule, confidence tags are valid, and no row points
at an unknown concept.
