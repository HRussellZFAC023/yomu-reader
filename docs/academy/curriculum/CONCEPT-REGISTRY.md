# Concept registry

The registry is the spine of the curriculum mapping. Each teachable unit has one
stable id, and every other artifact — the framework crosswalk, the activity map,
the curriculum orders, the QA findings — refers to that id rather than copying
lesson content. Canonical data: `public/academy/content/mappings/concepts.json`.

## What a concept is

Six types, each with an id prefix:

- **grammar** (`grammar:`) — a grammar pattern taught as a unit, e.g. `grammar:nagara`.
- **kanji** (`kanji:`) — a single character with its reading and first appearance, e.g. `kanji:運`.
- **vocab-set** (`vocab:`) — a themed vocabulary cluster, not a single word. Words stay in the lessons; the set is the mappable unit.
- **function** (`function:`) — a communicative can-do, e.g. `function:make-share-plans`.
- **skill** (`skill:`) — a modality milestone at a level, e.g. `skill:listening-n4`.
- **phonology** (`phon:`) — a pronunciation/prosody concept, e.g. `phon:pitch-accent-awareness`.

## Coverage

The base course (kana on-ramp through Level 3+ Lesson 9, plus warm-layer Minna
II 28–30) encodes:

- 31 grammar concepts, from `grammar:te-kudasai` (pre-N5) to `grammar:you-ni` (N4).
- 65 kanji concepts: 58 across route lessons 0–9 and 7 new in the warm layer (歌, 失, 敗, 変, 元, 誕, 練).
- 12 vocabulary sets, one primary cluster per lesson.
- 11 communicative functions, from greeting/repair to making a shared plan.
- 9 modality skills across N5 and N4.
- 5 phonology concepts — mostly tracked as gaps (see the gap report).

The post-source syllabus adds 14 grammar, 4 function, and 1 skill concept for the
N4→N3 bridge; those live in `post-source-syllabus.json`.

## Fields

Each concept records `levelBand`, `jlpt`, `firstIntroduced` (the lesson that
first teaches it), `prerequisites` (other concept ids), `reviewedIn` (later
lessons that re-touch it), and `evidence` (source id + a pointer into the
canonical files). Level and JLPT bands are placement heuristics, not official
score conversions.

`firstIntroduced` is `null` only for phonology concepts that the course never
teaches; those are flagged in the gap report.

## Prerequisite graph

Prerequisites form an acyclic graph. Two properties are enforced:

1. No concept is introduced before one of its prerequisites (checked against
   route order).
2. The graph has no cycles.

Some dependencies are pedagogical rather than strictly linguistic. For example,
`grammar:nakereba-naranai` (obligation) depends on `grammar:past-polite`, not on
`grammar:potential-koto-ga-dekiru`, so that the Genki order — which teaches
obligation before potential — remains valid. The dependency backbone is what
makes multiple curriculum orders possible; see the curriculum-orders doc.

## Reading a concept

`grammar:intransitive-teiru-state` is a worked example:

- level N4, JLPT N4, first taught in `lesson-07-states-completion` and reviewed
  in `lesson-29`.
- prerequisites: `grammar:teiru-progressive-habit` and `grammar:transitivity-pairs`
  — you need both the progressive ています and the transitive/intransitive
  distinction before the resultant-state reading makes sense.
- evidence points at `foundationLessons[6].grammar[0]` and `LESSON_29.grammar[1]`.

That last dependency exposes a sequencing problem: the lesson introduces the
resultant state as its first grammar point but only teaches the transitivity pair
it depends on as its third. That is recorded in the gap report as an in-lesson
sequencing finding.

## Validation

`node scripts/academy-curriculum/validate-concepts.mjs` checks id uniqueness,
type/prefix agreement, band validity, prerequisite resolution, acyclicity,
introduce-order, and evidence completeness. It is part of `validate-all.mjs`.
