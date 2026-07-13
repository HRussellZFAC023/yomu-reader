# Learning game system

## Design outcome

Academy learning games are deep Modules over one append-only learner record. The small Interfaces are:

- a versioned practice-mode data registry and validator;
- pure `start / answer / skip / time / save / resume / report` practice transitions;
- a pure recommendation planner, day closer, progress projections, and achievement projection;
- the existing typed shared Study Module seam plus a canonical vocabulary-collection Adapter;
- existing Yomu dictionary, pronunciation, examples, KanjiVG, review and mining Adapters.

No game owns points, mastery flags, an alternate SRS, a private word list, or page navigation. The
one state-transition owner is the practice engine; callers append the returned immutable evidence.
Plugins do not import other plugins.

### Answer-support seam

Every new assessed practice item uses `academy-assessed-v1`. In an English interface, assessed
Japanese answer options and all answer-bearing transcripts, translations, definitions, example
glosses, and model answers remain outside the pre-commit renderer model. Choices shown before commit
use neutral styling. A hint becomes available only through an explicit post-attempt policy; full
support appears after commitment. The practice engine accepts a typed `learner-commitment`, and only
that transition can emit progress evidence. Preselected/leaked answers, opening support, and animated
GIF/sprite reactions are presentation facts and cannot earn progress or achievements.
Using an earned hint or post-commit transcript/translation/definition/example/model answer appends a
neutral `support-used` fact (`activityId`, support kind, optional choice ID). It is neither a wrong
attempt nor positive progress and is excluded from achievements and the Class Board.

## Interface designed twice

### Version A — one wide game orchestrator (rejected)

The first design exposed `startQuiz`, `startConquest`, `startInferno`, `startShiritori`,
`startKanjiGame`, `openDictionary`, `openExamples`, `save`, `load`, `recommend`, `award`, and
`renderProgress` on one Academy object. Callers needed to know every mode, persistence rule, Yomu
tool and projection. Adding a mode enlarged the orchestrator and its tests. Deleting it merely
moved pass-through calls into screens; it had little Depth.

### Version B — data registry + transition Module + Adapters (chosen)

The selected Interface takes a `PracticePlan` and returns a serializable `PracticeSessionState` plus
at most one evidence event per learner action. Mode variance is data or a strategy inside that
Module. Dictionary/audio/Study/collection differences sit at existing seams. All progress views read
the same log. This version has greater Depth and Locality: mastery reinsertion, Inferno timeout,
ranges, deck weights, reports and resume invariants are exercised through a small transition
Interface, while source/content and presentation remain replaceable Adapters.

The shared Study Module is not recreated. Academy mounts the same canonical implementation through
`AcademyStudyModule`, on the living-paper surface, with a configurable countdown defaulting to
`15:00`. A separate encounter-source Adapter reports eligible vocabulary. The Academy journey Module
normalises a stable expression/reading key, checks the canonical collection, adds with provenance,
appends `vocabulary-collected`, and can remove and append `vocabulary-collection-undone` after a
reload. This keeps Study, SRS and the learner's collection on one code path.

## Evidence contract

`learning-evidence-recorded` states what happened, not what the learner *is*:

- `activityId`, `modeId`, skill and learner action;
- pass or lapse;
- Concept IDs and optional immutable source ID;
- whether the answer was independent;
- optional active duration and one practised kanji.

Raw responses remain in the resumable local practice snapshot/report input but are not included in
the canonical learning-evidence event, progress projections, achievement projection, or Class Board.

Collection, day closure and achievement-ceremony events are facts. Achievement earning is always
recomputed; ceremony-seen state never grants a medal. An encounter or lookup cannot claim mastery.
Kanji garden states deliberately use `encountered`, `practising`, `recalled`, `produced`, and
`reliable`; they never manufacture a `mastered` state.

## Adaptive daily loop

1. Opening preference contributes a small prior: audio ranks listening/video/shadowing; text ranks
   reading/reconstruction/writing; speaking ranks shadowing/production/mixed.
2. Main lesson and due work remain visible. Later lapse and missing-evidence signals can outweigh the
   opening prior. Every eligible activity remains discoverable.
3. The main lesson follows explanation, worked example, guided attempt, independent attempt and
   transfer. Its Study activity mounts the shared Module rather than linking to a visually unrelated
   page.
4. After the main lesson, the learner can close the day immediately or continue optional activities.
   Closing never removes content or damages a streak.
5. Optional combinations may emit authored `asset-unlocked` facts. They never award empty points and
   never punish stopping.

Inferno is opt-in, excluded from recommendations, and provides an untimed route. A timeout is a lapse
with corrective feedback. Conquest repeats a missed item behind other retrievals and requires later
independent successes. Save/resume preserves the queue and repair state without duplicating the
canonical evidence log.

## Progress semantics

All projections are pure views of the same events:

| Projection | Meaning | Does not claim |
| --- | --- | --- |
| Today | active minutes, completed evidence items, goal ratios, main-lesson/day closure | that time alone is learning |
| Skill dimensions | attempts, independent passes, lapses, bounded evidence label | psychometric level or mastery |
| Curriculum/week | Concepts with at least one independent successful demonstration | durable mastery |
| Source completion | attempts, passed activities, explicit `source-complete` evidence | completion inferred from opening a source |
| Review health | scheduled/due counts, rating aggregates, repair demand | that an easy rating is permanent knowledge |
| Kanji garden/heat map | repeated recall/production across practice days | known/mastered from a lookup |
| Achievements | threshold progress from immutable evidence | points detached from a learning action |
| Streak | qualifying local days under an explicit timezone and boundary | obligation, loss, shame, or content access |

The default streak policy explicitly lists which of `learning-evidence-recorded`, `review-rated`, and
`academy-day-closed` count. Projection returns current, longest, last qualifying local day, timezone,
day boundary and `punitive: false`.

## Achievements

`achievements.v1.json` contains exactly 100 definitions and 400 tier thresholds. Every definition is
English/Japanese, versioned, grouped, criterion-backed, and has a semantic medal ID. Groups are kana,
kanji, vocabulary, grammar, reading, listening, speaking, writing, repair, review, source work,
exploration, character/bond, and transfer. Thresholds are positive and ascending. The validator
rejects missing groups, duplicate IDs, invalid evidence/measure pairs, and any count other than 100.

Character/relationship achievements use meaningful `relationship-chapter-unlocked` facts only.
Each character journal has ten chapters; recognition, friction, and support are the three major
authored turns within that journal. Raw legacy bond points never advance journal progress or
achievements, and journal rank makes no assumption about romance.

Achievement criteria refer to learning actions and authored Concept prefixes. Authors must bind the
matching prefix only to the described evidence; visual clicks, opening a page, payment, and absence
streaks never qualify. Bronze, silver, gold and platinum are derived independently from the event log.

## Class Board and privacy

Class Board is a semantic top-left overflow destination beside Settings and Achievements. It is not
implemented in Worker or UI by this slice. An account is required, and each metric requires separate
opt-in. Public identity is the learner-selected editable Academy `displayName` plus an opaque stable
six-digit discriminator such as `Aakash#419213`; Google name, email and photo are never used.

Allowed aggregates are known-word count (three independent passes over two local days), review
activity count, completed main lessons, and current non-punitive streak. A projection cannot return
raw events, answers, failed items or word lists. The backend must enforce discriminator uniqueness
and the same per-metric consent contract.

## Soya content eligibility

The mode registry accepts audited, high-quality Soya-derived material across lesson, listening,
repair, checkpoint, transfer, and exam-season journeys. Content must be cleared in the source ledger.
`secure-assessment` exposure is always excluded from practice; a secure full mock cannot become a
deck or leak through discovery. This slice defines and tests the Adapter/eligibility contract but does
not ingest Soya content. The next integration slice must bind immutable source IDs and preserve
answer-key/exposure controls.

## Learning-science gates

These are design constraints, not marketing claims:

- Retrieval activities require an honest attempt and corrective feedback. Repeated testing with
  feedback has shown retention benefits over rereading, while feedback design still needs care:
  [Wiklund-Hörnqvist et al. (2014)](https://doi.org/10.1111/sjop.12093) and
  [Marsh et al. (2022)](https://doi.org/10.1037/xlm0001138).
- Learner pacing is useful when it helps processing, but broad learner control has mixed effects;
  controls remain bounded and legible:
  [Mayer & Chandler (2001)](https://doi.org/10.1037/0022-0663.93.2.390) and
  [Karich et al. (2014)](https://doi.org/10.3102/0034654314526064).
- When the outcome is production, a selection-only response is insufficient. Academy records recall,
  speaking and writing separately and does not infer them from recognition. The production effect is
  evidence that overt production can alter memory, not a warrant to force production everywhere:
  [Fawcett & Ozubko (2016)](https://doi.org/10.1037/cep0000089).
- Images, text and audio must be complementary, spatially/temporally aligned, and removable where
  redundant; more media is not automatically better:
  [Mayer & Johnson (2008)](https://doi.org/10.1037/0022-0663.100.2.380).
- Game elements must support autonomy, relatedness, and demonstrable competence. The specific design
  element matters, so Academy changes the learning action and feedback rather than adding generic
  points:
  [Sailer et al. (2017)](https://doi.org/10.1016/j.chb.2016.12.033).

## Navigation and visual assets

Settings, Achievements and Class Board are secondary destinations in the existing top-left overflow
menu. There is no Academy settings puck and no large header/footer. This domain slice ships no medal
bitmap. It only emits semantic IDs and tier tokens; cohesive original living-paper medals are owned by
the visual-system slice. The CC0 Buch/OpenGameArt pack remains a reference candidate only.
