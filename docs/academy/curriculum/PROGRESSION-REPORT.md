# Progression report

How well concepts are spaced and re-encountered across the route. Review intervals
are `CURRICULUM_REVIEW_INTERVAL_DAYS = [1, 3, 7, 14, 30]` days. The delivery route is
10 weeks (kana on-ramp → Level 3+ Lesson 9), roughly a 70-day span, plus the optional
warm layer (Minna II 28–30) mirroring weeks 6–8. Machine-readable source:
`public/academy/content/linguistic-qa/domain-reports/gap-analysis.json`
(`progression` array). This complements the SRS design in
[../PROGRESSION-SRS.md](../PROGRESSION-SRS.md).

## The core problem: the 30-day interval versus a 70-day course

The interval ladder tops out at 30 days. Only concepts introduced by about week 6 can
traverse the full ladder before the course ends. Everything introduced in weeks 8–10
has its 14- and 30-day consolidation reviews land after week 10 — so the newest and
hardest material (the N4 state/preparation cluster and the whole capstone lesson) gets
the least spaced practice. This is structural, not an authoring slip: the schedule and
the interval set are in tension.

## N5 core (weeks 1–5: kana on-ramp → lesson-04) — thin

The grammatical backbone spirals well. は/です, the question か, を, で/に, and the
polite past each recur across two or three later lessons, and because they are
introduced early the [1,3,7,14,30] ladder completes comfortably in-window.

The weakness is holes, not the backbone. The week-3 transactional cluster (place
demonstratives, location statements, price questions) and the week-5 i-adjective past
have empty `reviewedIn` and never reappear, leaving about a third of N5 grammar
single-exposure despite being core survival language (see gap-08). Early kanji load is
also steep relative to kana consolidation (gap-13).

## N4 cluster (weeks 6–10: lesson-05 → lesson-09) — thin

Some threads spiral acceptably — the te-form, から, and ています feed lessons 6–9, and
the warm layer rescues lessons 6–8. But the phase's newest and hardest material is
under-reviewed:

- The obligation/permission pair (week 6) gets zero spaced review anywhere (gap-04).
- The entire capstone lesson (week 10: なら / ありませんか / ように) gets one exposure
  and no in-window spaced review (gap-05).
- てしまう, てある, and the three-way ている/てある/ておく contrast spiral only in the
  optional warm layer (gap-06).

Compounded by the unmarked plain-form prerequisite (gap-01) and the week-6 density
spike (gap-02), review provision here is effectively absent for the concepts that most
need it.

## Warm layer (Minna II 28–30, mirrors lessons 6–8) — adequate

As spacing, the warm layer is well designed: it re-teaches nagara / し / てしまう /
resultant-state / transitivity / てある / ておく about a lesson-week after first
exposure, which sits neatly on the [1,3,7,14,30] curve and is the only second pass
several of those points get.

Its limitation is coverage, not timing: it mirrors only lessons 6–8, so the two
single-pass lessons most in need of review — the N4 bridge (week 6: potential /
obligation / permission) and the capstone (week 10) — fall outside it. Extending the
same mirror pattern to lessons 5 and 9 would close the largest review holes in the
course.

## Recommendations

1. **Add review weeks 11–12** (or the post-source syllabus, which already does this)
   so weeks 8–10 grammar can complete its 30-day interval in-window. This is the single
   change that most improves back-half retention.
2. **Extend the warm-layer mirror to lessons 5 and 9**, giving the obligation pair and
   the capstone grammar a spaced second pass.
3. **Populate `reviewedIn` for the single-exposure N5 grammar** by recycling
   location/price/directions and the い-adjective past into the week-10 planning task.
4. **Front-load the heaviest N4 grammar to weeks 6–8** and reserve 9–10 for
   recombination, so difficulty and review provision both peak earlier.

## How the mapping supports SRS

Each concept's `reviewedIn` in `concepts.json` records which later lessons re-touch it;
an SRS scheduler can key spaced reviews off `firstIntroduced` plus `reviewedIn`. The
source-drift guard in `validate-all.mjs` now enforces that `firstIntroduced` matches the
lesson that actually first presents each kanji, so review timing anchors to real content
(this closed gap-14).
