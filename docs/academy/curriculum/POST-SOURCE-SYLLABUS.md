# Post-source syllabus (N4→N3 bridge)

The evening class archive ends at Level 3+ Lesson 9 — route week 10, N4+. This
syllabus continues past it with original Yomu material over N4-secure → N3-on-ramp
scope. It reuses no private class content. Canonical data:
`public/academy/content/mappings/post-source-syllabus.json`.

## What it adds

Eight weeks (11–18), anchored to the two `yomu-continuation` graph lessons rather
than to UCL sections:

1. **Intentions and soft reasons** — ので, plain volitional + と思う, つもり.
2. **The four conditionals** — たら, と, ば, taught against the already-known なら.
3. **Pitch and prosody lab** — the explicit pitch strand (see below).
4. **Passive perspective** — 受身, building on the transitivity pairs from week 8.
5. **Causative and causative-passive** — させる, させられる (the ceiling of the N4 voice cluster).
6. **Evidentials** — そうだ (hearsay), ようだ/みたい, らしい.
7. **Keigo for real settings** — 尊敬語 and 謙譲語.
8. **Portfolio project** — a learner-chosen authentic source and a recorded
   presentation, pulling the strand together at an N3 on-ramp.

Each new concept follows the same registry pattern: a stable id, prerequisites
onto existing concept ids, a framework crosswalk cell, and evidence. Because the
class provides no source here, evidence cites framework scope (JLPT N3/N4, JF
Can-do, textbook lesson estimates) and marks the reuse as original Yomu.

## Two deliberate gap remediations

This syllabus is where the two biggest coverage gaps get fixed:

- **Pitch/prosody.** `phon:pitch-accent-awareness` is uncovered in the base
  course. Week 13 is a dedicated pitch lab, and `skill:pitch-controlled-speech`
  makes controlled prosody an assessed outcome. Pitch data used in that lab must
  be OJAD/NHK-verified before publication — see the linguistic-QA report.
- **Register.** The base course never opens keigo. Week 17 teaches 尊敬語 and
  謙譲語 and `function:register-switch` makes formal-register switching an
  outcome, which matters for the "job offer in Japan" thread the warm-layer
  lessons plant.

## Ordering

Two valid orders are provided. The default runs intention → conditionals → pitch
→ voice (passive/causative) → evidentials → register. A `register-first`
alternative pulls passive and keigo forward for learners who need formal Japanese
for work soon; it stays prerequisite-valid because keigo is taught immediately
after passive, which it depends on. Both are checked by `validate-orders.mjs`
against the combined base + post-source concept set, treating the base concepts
(weeks 1–10) as already taught.

## Input and rights

Weeks 11–18 use rights-reviewed authentic input or original replacement dialogue,
consistent with the continuation policy in `docs/academy/CURRICULUM-COVERAGE.md`.
Authentic subtitle or article input must clear rights review or be replaced with
original text before release.
