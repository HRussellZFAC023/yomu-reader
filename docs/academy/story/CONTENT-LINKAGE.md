# Story and content linkage

## Current content truth

The public lesson directory contains Lesson 0, its classroom-expression support shard, and 60 numbered Level 1/2 packages (`002` through `061`). The executable registry currently treats:

- `lesson:foundation-00` as the complete trusted-source Lesson 0;
- 26 `l1-*` packages as authored weeks;
- 33 `l2-*` packages as authored weeks;
- `l2-l01` as a support shard owned by `lesson:l2-kickoff-planning`, not as an independently complete authored week.

The numbered packages end at N4. There are no registered N3, N2, or N1 lesson packages yet. Seasons 3 and 4 therefore have honest target hooks but cannot be release-ready until original, grounded higher-band content is registered.

## Linkage rule

A story chapter is not a lesson wrapper. It names a small set of language functions that can be satisfied by registered evidence from one or more packages. The chapter then uses those functions in an original changed-context transfer scene.

- Lesson completion is never inferred from story viewing.
- Equivalent learner evidence may satisfy a hook after placement or test-out.
- A package range below is an authoring reservoir, not a requirement to complete every package before seeing the chapter.
- Component hooks resolve to the actual `authentic-input`, `vocabulary`, `grammar`, `listening`, `reading`, `speaking`, `writing`, `kanji`, `review`, or original `transfer` component.
- Listening with held/unverified audio cannot gate a story scene as if audio evidence existed.

## Location truth and hooks

`src/academy/domain/world-locations.ts` is the executable place registry. Nine places currently carry grounded curriculum references: `courtyard`, `classroom`, `library`, `cafe`, `street`, `station`, `konbini`, `ramen`, and `home`. Every other registered place is `planned` until its activity has evidence, source, rights, and presentation coverage.

Story packages currently use a second prefixed location vocabulary such as `location:classroom` and `location:language-lab`. The target compiler must resolve those through one explicit alias table to `WorldPlaceId`; prose cannot treat a plausible location string as a registered hook.

| Season | Grounded homes available now | Planned story homes | Narrative use |
| --- | --- | --- | --- |
| 1 | courtyard, classroom, library, cafe, street, home | language lab | establish the room, first routes, after-class talk, journal return, and sound work; the lab cannot gate progress until grounded |
| 2 | all Season 1 homes plus station, konbini, ramen | bookshop, park, restaurant, museum | move rebuilt-map language into ordinary public use and prepare the first exhibition |
| 3 | reuse grounded campus and commute places | office, post office, museum venue | make editing, scheduling, correspondence, and permission visible as work rather than abstract debate |
| 4 | return to classroom, courtyard, library, cafe, station, and home | one approved public venue | let early places show changed roles, stage the public evening, close the atlas, and return to the journal after graduation |

A location hook is valid only when the place contributes all four of these:

1. a visible or audible language-bearing surface;
2. an action the learner can perform there;
3. a state change or return object after the action;
4. a later revisit whose meaning or difficulty changes.

No Japan-region place is required for the finite ending. Shrine, temple, ryokan, festival, shopping-street, and Tokyo-station content remains optional/planned and cannot make travel the prize for high performance.

## Seasons 1 and 2: registered reservoirs

| Story chapter | Registered package reservoir | Transfer function |
| --- | --- | --- |
| 1 | `lesson:foundation-00` and classroom-expression shard | greet, follow an instruction, and ask for repetition in the live room |
| 2 | `l1-l01`–`l1-l02` | introduce a person and label a useful object in kana |
| 3 | `l1-l03`–`l1-l04` | ask where someone or something is from and distinguish identity from location |
| 4 | `l1-l05`–`l1-l06` | identify whose item it is and request the right one |
| 5 | `l1-l07` | read/select an item without translation-first prompting |
| 6 | `l1-l08`–`l1-l09` | state time, opening, and a clear invitation |
| 7 | `l1-l10`–`l1-l11` | describe a day and a place using concrete present/past detail |
| 8 | `l1-l12` | express likes and preferences around a pictureless menu |
| 9 | `l1-l13`–`l1-l14` | state ability/understanding and give one reason |
| 10 | `l1-l15` | coordinate a small gathering through sequenced action |
| 11 | `l1-l16` | locate and reroute under changed conditions |
| 12 | `l1-l17`–`l1-l18` | describe what is present and ask how many are needed in a failed service plan |
| 13 | `l1-l19`–`l1-l20` | negotiate frequency/duration and compare options before accepting a changed plan |
| 14 | `l1-l21` | use a number notebook as evidence rather than an answer display |
| 15 | `l1-l22`–`l1-l26` | complete the katakana sequence and repair a sound/shape error in context |
| 16 | `l2-l01` support shard plus `l2-l02`–`l2-l04` | open the next notebook, compare then/now, and state an opinion; no completion gate on the support shard |
| 17 | `l2-l05`–`l2-l08` | invite, report what was said, seek agreement, and identify a person by a relative clause |
| 18 | `l2-l09`–`l2-l11` | describe a wanted program, button condition, and changed plan |
| 19 | `l2-l12`–`l2-l15` | coordinate simultaneous actions, layered reasons, environmental evidence, and a failed day |
| 20 | `l2-l16`–`l2-l18` | prepare in advance, sequence action, and say enough without narrating everything |
| 21 | `l2-l19`–`l2-l22` | build, carry, revise, and forecast an intention through questions and teach-back |
| 22 | `l2-l23`–`l2-l25` | use kanji in a useful message, reopen a conversation, and give advice with room to decline |
| 23 | `l2-l26`–`l2-l30` | pass on meaning, follow a model, express means/absence, and revise conditions |
| 24 | `l2-l31`–`l2-l34` | negotiate a conditional plan, health goal, conversational continuation, and menu reading in the exhibition finale |

The current episode JSON's free-text `curriculumHooks` should migrate to registered structured references. Existing hooks remain descriptive until the validator can resolve package and component IDs.

## Seasons 3 and 4: required higher-band hooks

These are content contracts, not claims that packages exist.

| Chapters | Required new content family | Four-skill proof before story unlock |
| --- | --- | --- |
| 25–27 | N3 reported speech, implication, paraphrase, and register-preserving edit | infer intent from audio; compare two written paraphrases; explain what changed; produce a bounded rewrite |
| 28–30 | N3 conditions, refusal, role negotiation, and conflicting plans | hear a softened condition; read two schedules; decline or renegotiate orally; write a clarified plan |
| 31–33 | N2 quotation, translation choice, evidentiality, and hedging | annotate an audio/text source; justify a subtitle choice; distinguish observation/hearsay/inference; write calibrated claims |
| 34–36 | N2 formal event language, source comparison, and permission scope | negotiate roles; compare provenance records; present a reasoned conclusion; write the permission page |
| 37–39 | N2/N1 correspondence, omission, concession, and formal refusal | interpret a selective reply; identify what remains unsaid; compose audience-aware correspondence and a polite no |
| 40–42 | N1 perspective, compatible accounts, counterfactuals, and argument framing | synthesize three accounts; defend uncertainty; challenge a false premise without flattening the speaker |
| 43–45 | N1 plans under uncertainty, editing rationale, and mastery-aware production | compare non-equivalent futures; revise for public use; perform an extended spontaneous response |
| 46–48 | integrated N1 public inquiry, mediation, synthesis, and graduation composition | listen and repair live; explain sources; mediate a disagreement; produce the final bounded contribution |

Each family needs registered package IDs, grounded source/revision hashes, complete component coverage, answer concealment where graded, reviewed Japanese, and audio rights before its story chapters can move from `planned` to `playable`.

## Story-to-lesson beat pattern

Every linked chapter uses this order:

1. **Need:** a cast member's immediate goal makes the language useful.
2. **Input:** the learner sees or hears the target in a person, place, or object.
3. **Lesson:** the registered activity teaches and checks the function.
4. **Repair:** the same scene reacts to the learner's evidence.
5. **Transfer:** the source surface disappears and the function solves a changed situation.
6. **Consequence:** plot, relationship, callback, or world state changes.
7. **Return:** relevant items enter Study silently through the shared event/evidence path.

The story cannot skip step 3 for a required new function, and the lesson cannot use step 6 as decoration unrelated to the learner's action.

## Class-thread hooks

Class-thread scenes use the same evidence boundary as live scenes. They are short transfer or coordination surfaces, never lesson-completion shortcuts.

| Season | Safe thread jobs | Required language grounding |
| --- | --- | --- |
| 1 | clarify class time/place, request repetition, welcome a return, compare one study preference | Foundation-N5 greetings, time, place, preference, invitation, and repair |
| 2 | pass on a changed plan, identify an item/person, compare two accounts, reopen a paused conversation | N4 report, condition, relative clause, reason, advice, and continuation functions |
| 3 | state audience/scope, separate edit from publication, decline a role, summarize what may be said | registered N3-N2 condition, refusal, quotation, evidentiality, and permission content |
| 4 | acknowledge a bounded reply, coordinate public repair, confirm a future plan without demanding certainty | registered N2-N1 correspondence, concession, mediation, calibrated certainty, and omission content |

A thread may present a target before assessment and may host changed-context transfer after assessment. If the learner has not met required evidence, the thread offers a lesson/repair route or a simpler authored variant; it does not mark the function understood because a message was opened.

## Placement bridges

| Entry band | Playable bridge | Earlier canon |
| --- | --- | --- |
| Foundation/N5 | Chapter 1 opening and selected Lesson 0 route | played normally |
| N4 | Rie opens the rebuilt-map work, introduces the present leads, and lets the learner repair one missing route | Seasons 1 memories are available chronologically and remain unseen until played |
| N3 | public-evening invitation arrives while the learner verifies one attributed caption | Seasons 1–2 remain replayable; no continuity or appointment progress is auto-earned |
| N2 | permission dispute begins with two defensible edits | prior plot is summarized only as needed for the live choice |
| N1 | final inquiry begins with three accounts and a bounded reply | all earlier memories are available at selected language layers |

The bridge writes `story.arrivedAtBand`, not completion for skipped chapters. Future canonical chapters use fallback variants when a prior optional appointment has not been played.
