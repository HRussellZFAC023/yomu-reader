# Yomu Academy — Weekly Lesson Authoring Brief

You are authoring ONE class week as original Yomu content. Read this, `WEEK-SCHEMA.md`
(the hard contract), and the worked exemplar `public/academy/content/weeks/053-l3-2-l04.json`
before you write. Your file must pass `node scripts/academy-weeks/validate-weeks.mjs`.

## The one rule that protects everything

**Cover the source function with original writing; never reproduce source content.**
Your plan entry lists the real worksheets in `sourceCoverage.members` (titles, roles, hashes).
Those tell you *what skill each worksheet trained* (a vocab sheet, a 〜てしまう grammar drill, a
listening track, a reading homework). You author FRESH material that trains the same skill for the
same chapter. You must NOT invent what a specific worksheet *said*, copy its wording, or fabricate
its answer key. Grammar points and chapter scope are public textbook facts — writing new practice
for them is original work. If a worksheet's function can't be covered without knowing its private
contents, mark it `status:"gap"` in `coverageMap` and add a line to `provenance.gaps`.

Every member in `sourceCoverage.members` must appear once in `coverageMap`, `covered` or `gap`.

## Cast (use exact ids; only these are paintable)

sensei: **rie** (Rie-sensei — warm, funny, meaning-first, never scolds).
classmates: **henry** (too many laptops, always a bit behind — the learner-insert), **aakash**
(stylish, city-pop), **alex** (quiet senpai, climbs mountains; later gets a Japan job offer),
**tom** (Pokémon, dog named Chestnut), **sam** (Saturday athlete, okonomiyaki), **francis** (gentle
dreamer, manga/Miku), **shin** (kanji wizard, ramen — explains kanji as stories), **jodi** (lived in
Tokyo years ago, the quiet heart), **christian** (gym, volunteering, a recorder that appears
unexplained; factual incident reports), **jenny** (cozy connector, knitting), **robert** (bon
vivant, organises the pub trip), **mika** (quiet polyglot, precise, shy), **sophie** (top of the
class, quietly anxious), **xingyu** (sunshine, sings Miku), **angel** (spreadsheets, everyone's
deadlines), **stasi** (art, indie music), **ruparna** (cinephile, perfect subtitle), **pho**
(carefree, quietly homesick). Textbook cameos (no art, use sparingly): **miller** (ミラーさん),
**tawapon** (ワンさん).

**Grammar picks the person.** Inviting/plans → sam, robert, angel. Kanji → shin. Feelings/likes →
francis, jodi, aakash. Dates/checklists/preparation → angel, jodi. Ability/uncertainty → mika,
sophie. Casual speech → pho, henry. Signs/reading → shin, ruparna. Accidents/incident reports →
christian, henry. Your plan entry's `casting.recommendedSpeakers` is a band-level seed; override it
when the week's grammar clearly belongs to someone else, and say so in `provenance.castingNote`.

**Scene line expression** ∈ `neutral | warm | thinking | determined | surprised | relieved`.
Optional `pose` ∈ welcome, explain, handoff, inspect, write, offer, map, point, photograph, plan,
decide, present, listen, rehearse, invite.

## Voice (Rie could say it out loud)

DO: warm, specific, one idea per line; start with the situation, end with the next small action;
let Japanese carry the classroom voice and English be the friend leaning over; kind, specific
feedback that names the one thing to fix; humour from an object or a mishap, never the learner;
small stakes, real heart.

DON'T: AI-slop words (journey, unlock, empower, seamless, delve, dive in, elevate, curated, "at
your own pace", "level up", "takes shape", supercharge, tapestry, transformative); uppercase
kickers; hollow disclaimers; naming a real institution/venue/weekday as if it were the only class
(no "UCL", no "Thursday-only" framing — this class could be any evening, anywhere). The learner is
never the joke; nobody is "behind" as a verdict.

## Japanese quality

- Correct, natural, level-appropriate Japanese. Furigana in `reading` for every JA string that has
  kanji. Beginner weeks (Level 1/1+) stay in kana + very limited kanji; N4 weeks use normal kanji.
- List every acceptable spelling in exercise `answer.alternatives` / blank alternatives — kana and
  kanji forms are NOT auto-equated by the grader.
- `wrongAnswerExplanations` must be specific and teaching-useful (name the actual slip and the fix),
  not generic ("try again").

## Depth bar

Deeper than a textbook page, but every claim grounded in the week's real chapter scope. A full
`lesson` week has all nine components (authentic-input, vocabulary, grammar, listening, reading,
speaking, writing, kanji, review) plus scene, explanation, mission, srs. Vocabulary ≥ 8 items,
grammar practice ≥ 3 exercises, listening ≥ 2, reading ≥ 2, review ≥ 2, srs ≥ 8, objectives ≥ 4,
scene lines ≥ 4, mission successCriteria ≥ 4.

## Per weekKind

- **lesson / self-study / pre-study / consolidation** — full nine components.
- **orientation / term-kickoff** — lighter (scene, explanation, vocabulary, kanji-as-kana or intro,
  review, mission; other components optional). srs ≥ 4. Universal, welcoming.
- **script-hiragana / script-katakana** — the `kanji` component holds the kana characters with
  `handwriting.required:true` + recognition; keep a short `explanation` of how the script works and
  a `mission`; grammar practice optional.
- **kanji-set** — `kanji` component with every character in the set (the plan's `derivedScope.kanji`
  lists them), handwriting required each, recognition + reading exercises; srs covers each character.

## Continuity

- Open with `recap` that names what the previous week gave (use `identity` + prerequisite id).
- Review component spirals in earlier chapters of the same term (`pedagogy.reviewTargetWeekIds`).
- If your plan entry `pedagogy.isCheckpoint` is true, set
  `review.cumulativeCheckpoint.isCheckpoint:true` with real `targetsWeekIds`.

## Output

Write exactly one file: `public/academy/content/weeks/<order3>-<id>.json` where `<order3>` is the
plan `order` zero-padded to 3 digits (e.g. `002-l1-l01.json`). Copy `identity` and the whole
`sourceCoverage` (members, externalUrlModules, corroboratingCohorts, gaps) VERBATIM from your plan
entry, then add `coverageMap`. Return a short JSON summary of what you covered and any gaps.
