# Gap report

Concrete curriculum gaps with evidence and a remediation for each. Machine-readable
source: `public/academy/content/linguistic-qa/domain-reports/gap-analysis.json`.
Fourteen gaps: 5 high, 5 medium, 4 low. Where a fix belongs in `src/academy/`
content it is called out; this arm reports those, it does not edit source.

## High severity

**gap-01 — Plain/dictionary forms are never taught as a unit (missing prerequisite).**
From the first N4 lesson (week 6) the course uses dictionary form, ない-form, and
plain past た — potential (辞書形＋ことができます), ほうがいい (Vた/Vない), obligation
(ない-stem), し, なら, and ように all build on them — but there is no lesson that
teaches godan/ichidan classification or the plain/ない/た transformations. The
masu-form, て-form (week 5), and polite past are the only conjugations taught.
*Remediation:* insert an explicit short-form/dictionary-form lesson between week 5
(te-form) and week 6, mirroring how Genki lands short forms (L8) before ほうがいい
(L12). Add a `grammar:plain-forms` concept as a prerequisite of potential,
hou-ga-ii, nakereba, nakutemo, shi, nara, and you-ni. This is the single highest-
leverage fix in the course.

**gap-02 — Week 6 is a difficulty spike.**
`lesson-05-n4-bridge` introduces five grammar concepts in one 95-minute block, at
the exact N5→N4 boundary, debuting the potential conjugation and the ない-based
obligation/permission morphology at once. Every adjacent lesson carries three.
*Remediation:* split it into two blocks (ability + advice + reason; then
obligation + permission), and/or pull から — an N5 point by its own band — forward
into the N5 phase so the bridge carries a lighter, purely-N4 load.

**gap-04 — Obligation/permission gets no second pass.**
なければなりません / なくてもいい are taught once in week 6 and never re-touched in
the route or the warm layer (which mirrors weeks 6–8, not week 6's lesson-05).
*Remediation:* add the pair to a later lesson's review (week 9 preparation and week
10 planning both naturally recycle "must / don't have to"), or extend a warm-layer
lesson to mirror lesson-05.

**gap-05 — The capstone lesson is terminal.**
なら / ありませんか / ように are introduced in week 10 with no lesson after and no
warm-layer mirror, so each gets exactly one exposure and its +7/+14/+30-day reviews
fall after the course ends. *Remediation:* append a consolidation week after
lesson-09, or add a warm-layer lesson mirroring it.

**gap-09 — Listening is tracked and set as an objective but barely assessed.**
Across kana + lessons 1–9 there is exactly one listening-modality practice item
(`kana-1`); every other item is reading/grammar/writing/kanji/speaking. Lesson-06's
own objective asks learners to "listen for which reason carries the real decision"
with no listening item to exercise it. *Remediation:* add audio comprehension items
(dictation, choose-what-you-heard, natural-speed gist) to each lesson and tie
`skill:listening-n5`/`-n4` review to those items rather than to the reading text.

## Medium severity

**gap-03 — In-lesson sequencing in week 8.**
`lesson-07-states-completion` presents resultant-state 自動詞＋ています as grammar[0],
before the transitivity pairs (grammar[2]) it depends on. A learner cannot ground
why 窓が開いています (intransitive, が) contrasts with 窓を開けます (transitive, を)
until the が/を distinction is taught. The concept graph records this dependency
(`grammar:intransitive-teiru-state` requires `grammar:transitivity-pairs`).
*Remediation:* reorder the lesson-07 exposition to transitivity-pairs → resultant-
state ています → てしまう.

**gap-06 — Three N4 points spiral only in the optional warm layer.**
てしまう, てある, and the ている/てある/ておく contrast get their only second pass in
the warm layer (28–30). A learner who does not run it never spirals them.
*Remediation:* fold one review of each into the week 9/10 review lists so the core
route provides the second pass.

**gap-07 — Back-half N4 material cannot complete the SRS ladder.**
With review intervals [1,3,7,14,30] and a ~70-day course, only concepts introduced
by about week 6 can traverse the full ladder in-window; weeks 8–10 grammar has its
14- and 30-day reviews land after the course closes. *Remediation:* front-load the
heaviest N4 grammar to weeks 6–8 and reserve 9–10 for recombination, or add explicit
review weeks 11–12. (The post-source syllabus does the latter.)

**gap-10 — Pitch and pronunciation are effectively uncovered.**
Pitch-accent awareness and vowel devoicing are `uncovered`; long vowels, geminate っ,
and request intonation are `incidental`. The one prosody note in the whole route is a
"calm falling tone" aside in the kana on-ramp. *Remediation:* add minimal-pair
pitch/long-vowel/geminate awareness from the kana on-ramp, reinforced on high-frequency
devoiced words (です, ました). The app already has pitch tooling; the post-source
syllabus adds an explicit pitch lab (week 13) and `skill:pitch-controlled-speech`.

**gap-11 — Register and keigo are untaught.**
The route is entirely です/ます; plain forms are used but never framed as a casual
register, and the giving-receiving politeness in the course's own dialogue
(送ってもらえますか in lesson-09) is never explained. *Remediation:* add a plain-vs-
polite explainer alongside the plain-form lesson (gap-01) and a light あげる/もらう/
くれる + honorific-request introduction before the week-10 group-planning task, which
pragmatically needs it. The post-source syllabus adds keigo (week 17) and
`function:register-switch`.

## Low severity

**gap-08 — Some core N5 grammar is single-exposure.**
Place demonstratives, location statements, price questions (week 3) and the
i-adjective past (week 5) are taught once and never spiralled — about a third of the
N5 backbone, despite being high-frequency survival language. *Remediation:* recycle
location/price/directions and い-adjective past into the week-10 planning task's
review list.

**gap-12 — Katakana and handwriting are assumed, not taught.**
`skill:kana-literacy` is scoped to core hiragana, yet katakana vocabulary (ラーメン,
カフェ, ホテル, テニス) is used throughout with no katakana strand, and kanji practice
is recognition-only. *Remediation:* add a katakana recognition strand and at least
recognition-to-production kanji items, using the app's kanji-doodle capability.

**gap-13 — Early kanji load is steep.**
Week 1 introduces 4 kanji during initial kana learning; weeks 2–3 add 6 each.
*Remediation:* cap new kanji per early lesson while kana is bedding in, and present
N3-band kanji (確認, 誕, 敗) as read-only vocabulary rather than taught characters.
*Note:* the analyst's evidence cited lesson-08 as introducing 10 kanji; that count
included 別/部/屋, which the reconciliation below moved to lesson-07, so lesson-08 now
introduces 7. The early-weeks observation stands.

## gap-14 — Resolved

The analyst found that `concepts.json` disagreed with the source on which lesson
first introduces 忘 (source: lesson-05; mapping had lesson-06) and 別/部/屋 (source:
lesson-07; mapping had lesson-08), which would have mis-timed those kanji's SRS
reviews by about a week. This has been reconciled: `firstIntroduced` and the activity
map's `introduces` lists now match the source kanji arrays exactly (忘→lesson-05,
近/静→lesson-06, 別/部/屋→lesson-07), and `validate-all.mjs` now parses the source
kanji cards and fails if any `firstIntroduced` drifts from the lesson that first
presents the character.

## Priority order for the content team

1. gap-01 (plain-forms lesson) — unblocks the entire N4 half and gap-11.
2. gap-09 (listening items) — a tracked skill with almost no assessment surface.
3. gap-02 (split week 6) — the difficulty spike sits right at the band boundary.
4. gap-05 + gap-04 (review the capstone and the obligation pair) — largest SRS holes.
5. gap-10 + gap-11 (pitch, register) — or defer to the post-source syllabus, which
   already schedules both.
