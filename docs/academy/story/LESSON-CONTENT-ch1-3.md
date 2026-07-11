---
title: "Yomu Academy: Curriculum and Evidence Ledger - Noticeboard Term"
description: "Authoring ledger for the original N5-to-N4 Noticeboard Term, including planned early-course activity contracts and the current Level 3+ lesson mapping."
---

# Curriculum and Evidence Ledger - The Noticeboard Term

**Status:** source of truth for story-to-curriculum mapping in `docs/academy/story/`. The filename remains for continuity; this ledger now covers the Prologue through Chapter 6 because every script requires a clear evidence status.

**Purpose:** Keep the story authored around real communicative needs while distinguishing work that is planned from the one activity family that is already present in the current content graph. This document does not add or modify `src/academy/content.ts`.

## 1. Publishing Truth

| Prefix or ID           | Meaning                                                                                           | Allowed authoring state                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `activity-...`         | Exists in the current `academyContentGraph`.                                                      | May be runtime-linked after normal validation.                                                    |
| `planned:activity-...` | Required curriculum proposal, named consistently across scripts.                                  | Draft/preview only. Must not publish as a playable core link until modelled in the content graph. |
| `proposed:...`         | Proposed onboarding/support check, not a current graph placement and never a story-derived score. | May frame onboarding if it remains manual, no-stakes, and local-first.                            |

### Current runtime-backed lesson

Only one current **lesson** unit, `unit-level-3-plus-lesson-09`, is encoded for this story today. Its parent programme and three strands also exist in the graph. The lesson's original Yomu Academy activities are the Chapter 5 rehearsal contract:

| Activity                            | Response kinds in current model | Story purpose                                        |
| ----------------------------------- | ------------------------------- | ---------------------------------------------------- |
| `activity-listen-weekend-plan`      | none, select-one, select-many   | Identify a plan’s gist and useful details.           |
| `activity-nara-suggestion`          | short-text                      | Offer a rain or schedule alternative.                |
| `activity-polite-negative-question` | short-text                      | Check availability before promising an option.       |
| `activity-purpose-youni`            | matching                        | Connect support action to purpose/prevention.        |
| `activity-solo-dialogue-adaptation` | short-text, recording           | Turn a shared plan into one speaker’s useful lines.  |
| `activity-write-shared-plan`        | long-text                       | Write a plan another person can follow.              |
| `activity-kanji-7`                  | matching, ordering              | Read food, size, and quantity vocabulary in context. |
| `activity-lesson-reflection`        | self-assessment                 | Choose the next rehearsal route.                     |

**Known accessibility blocker:** The current solo-dialogue activity requires a recording response. The World Bible says text rehearsal and self-assessment must fully satisfy a speaking outcome, with local recording optional. Until the graph and activity renderer agree, Chapter 5 can be authored and previewed but its audio-off equivalence cannot be approved for publication. This ledger records the conflict; it does not edit implementation.

## 2. Source Discipline

The course order is informed by [04-corpus-inventory.md](../research/04-corpus-inventory.md): clean N5-to-N4 scope can be planned from structured resource metadata; the maker’s live materials are a separate upper-beginner/N4 reference; unfiltered frequency material is never surfaced. Every dialogue, explanation, model answer, and graded reading below is original Yomu Academy writing.

| Source                 | Authoring use                                                           | Do not do                                                  |
| ---------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------- |
| Curriculum inventory   | Check level, safe vocabulary, grammar sequence, and asset planning.     | Copy source examples, audio, dialogs, or textbook prose.   |
| World Bible            | Preserve non-gating, access-first, fictional-world rules.               | Invent real affiliations, classrooms, services, or people. |
| Learning-tool research | Design independent furigana, gloss, transcript, and text-first support. | Make sound, motion, or a recording necessary to learn.     |
| Current content graph  | Reuse exact current activity/outcome/asset IDs only where they exist.   | Make a `planned:` ID look live.                            |

## 3. Term-Wide Evidence Matrix

| Episode  | Scene IDs  | Curriculum unit                   | Planned/current activity IDs                                                                                                                                                                                                                                                       | Demonstration evidence                                                         |
| -------- | ---------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Prologue | S0.1-S0.5  | `proposed:onboarding-route-check` | `planned:activity-n5-classroom-survival`, `planned:activity-n5-notice-scan-00`                                                                                                                                                                                                     | Recognise a useful next action; choose support/manual route without a score.   |
| Ch. 1    | S1.1-S1.6  | `planned:unit-academy-n5-ch1`     | `planned:activity-n5-notice-subject`, `planned:activity-n5-introduce-self`, `planned:activity-n5-point-and-name`, `planned:activity-n5-card-name-repair`, `planned:activity-n5-selfintro-note`                                                                                     | Name a place/helper/object and write one actionable Desk card.                 |
| Ch. 2    | S2.1-S2.7  | `planned:unit-academy-n5-ch2`     | `planned:activity-n5-place-where`, `planned:activity-n5-arimasu-imasu`, `planned:activity-n5-destination-and-action`, `planned:activity-n5-route-repair`, `planned:activity-n5-time-and-meeting`, `planned:activity-bridge-sequence-route`, `planned:activity-n5-write-route-card` | Ask/follow/give a route with a landmark and time.                              |
| Ch. 3    | S3.1-S3.6  | `planned:unit-academy-n5-ch3`     | `planned:activity-n5-invite-masenka`, `planned:activity-n5-preference-suki`, `planned:activity-n5-table-counters`, `planned:activity-n5-table-plan-listening`, `planned:activity-n5-invitation-message`, `planned:activity-n5-write-invitation`                                    | Invite with room to decline, offer options, and write a rain-aware table card. |
| Ch. 4    | S4.1-S4.6  | `planned:unit-academy-bridge-ch4` | `planned:activity-n5-quiet-room-description`, `planned:activity-n5-thought-and-reason`, `planned:activity-n5-experience-and-recommendation`, `planned:activity-n5-quiet-request`, `planned:activity-n5-write-quiet-card`                                                           | Describe a quiet option, explain its purpose, and ask for its use.             |
| Ch. 5    | S5.1-S5.10 | `unit-level-3-plus-lesson-09`     | Current IDs above                                                                                                                                                                                                                                                                  | Demonstrate N4 planning language in the current shared-plan sequence.          |
| Ch. 6    | S6.1-S6.6  | `planned:unit-academy-n4-ch6`     | `planned:activity-n4-guide-walkthrough`, `planned:activity-n4-summary-comparison`, `planned:activity-n4-read-handover-note`, `planned:activity-n4-open-rooms-guide`, `planned:activity-n4-final-reflection`                                                                        | Compare, test, revise, and write a guide for an imagined new arrival.          |

## 4. Chapter 1 Content Contract - One Notice, Three Routes

**Planned unit:** `planned:unit-academy-n5-ch1`
**Level:** Foundation N5
**Story object:** First Blue Door card - name the Desk, the helper, and the next action.
**Practical outcome:** A reader can identify who can help and what an object/notice refers to.

### Concepts and variants

| Planned concept ID                  | Variant                            | Form                                | Story use                                               |
| ----------------------------------- | ---------------------------------- | ----------------------------------- | ------------------------------------------------------- |
| `planned:concept-n5-topic-desu`     | `planned:variant-n5-topic-desu`    | `A は B です`                       | Name the Desk and a helper.                             |
| `planned:concept-n5-demonstratives` | `planned:variant-n5-kore-sore-are` | `これ/それ/あれ + は + noun + です` | Distinguish a card, folder, pencil, and distant object. |
| `planned:concept-n5-possession`     | `planned:variant-n5-no-possession` | `A の B`                            | Connect a folio/card to the Desk.                       |
| `planned:concept-n5-clarification`  | `planned:variant-n5-nan-dare`      | `何ですか / だれですか`             | Ask what an object is and who can help.                 |

### Rie explanation page

> **Practical question:** A card says “ask here.” What is “here,” and who is the person a new visitor can ask?
>
> `ここは オープン・ドア・デスクです。`
> _This is the Open Door Desk._
>
> `りえさんは ここに います。`
> _Rie is here._
>
> A short `は/です` sentence gives the reader a name and role. It is enough to begin. Add another detail only when it helps a person take the next step.

### Activity contracts

| Activity ID                            | Kind/response                            | Prompt and evidence                                                                                  | Story handoff |
| -------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------- |
| `planned:activity-n5-notice-subject`   | grammar-practice / select-one            | Identify what `ここ` must name on a useful card.                                                     | S1.1          |
| `planned:activity-n5-introduce-self`   | grammar-practice / ordering + short-text | Build `わたしは ___ です` and name a neutral fictional role.                                         | S1.2          |
| `planned:activity-n5-point-and-name`   | grammar-practice / matching + select-one | Match `これ/それ/あれ` to shared physical context; choose a useful noun for a card.                  | S1.3          |
| `planned:activity-n5-card-name-repair` | writing / short-text                     | Name the place and helper; show the full request as recognition-only survival support after attempt. | S1.4/S1.5     |
| `planned:activity-n5-selfintro-note`   | writing / long-text self-review          | Write a short fictional Desk introduction or neutral self-introduction.                              | S1.6          |

### Writing model and rubric

**Model, reveal after first attempt:**

```text
ここは オープン・ドア・デスクです。
りえさんは ここに います。
わからない ときは、りえさんに 聞いて ください。
```

The third line is a recognition-only survival phrase in Chapter 1. It is not part of the auto-graded or self-review grammar target until the later request unit.

| Criterion        | 0                     | 1                 | 2                                          |
| ---------------- | --------------------- | ----------------- | ------------------------------------------ |
| Place and helper | Neither is clear      | One is clear      | Both are clear                             |
| N5 frame         | Form obscures meaning | One correct frame | `は/です` and a concrete noun work clearly |

### Vocabulary and kanji scope

`これ`, `それ`, `あれ`, `ここ`, `だれ`, `なに`, `デスク`, `カード`, `名前`, `先生`, `人`, `聞く`, `分かる`.
Kanji support is optional and image-led: `人`, `名`, `先`, `生`. Do not invent mnemonic etymology as fact; present illustration briefs as memory images, not linguistic claims.

## 5. Chapter 2 Content Contract - The Route That Holds

**Planned unit:** `planned:unit-academy-n5-ch2`
**Level:** N5 with optional bridge sequencing
**Story object:** Second Blue Door card - route, landmark, time, and meeting point.
**Practical outcome:** A reader can ask where something is, follow a short route, and write a route another person can test.

### Concepts and variants

| Planned concept ID                      | Variant                            | Form                                       | Story use                                 |
| --------------------------------------- | ---------------------------------- | ------------------------------------------ | ----------------------------------------- |
| `planned:concept-n5-place-question`     | `planned:variant-n5-doko`          | `X は どこですか`                          | Ask where the Desk or Square is.          |
| `planned:concept-n5-existence`          | `planned:variant-n5-arimasu-imasu` | `place に thing/person が あります/います` | Locate card, helper, and desk.            |
| `planned:concept-n5-destination-action` | `planned:variant-n5-ni-de-e`       | destination `に/へ`; action place `で`     | Separate going from meeting.              |
| `planned:concept-n5-direction-time`     | `planned:variant-n5-route-time`    | `まっすぐ`, `右/左`, `〜時に`              | Give landmark and time.                   |
| `planned:concept-bridge-sequence`       | `planned:variant-bridge-te-kara`   | `Vてから`                                  | Offer a controlled route-order expansion. |

### Rie explanation page

> **Practical question:** “Meet in the square” is not a route. What would a first-time person need before they can leave the Desk?
>
> `ゴードン・スクエアは どこですか。`
> `デスクを 出て、まっすぐ 行きます。青い ベンチの 前で 右です。`
>
> `に` locates a thing or goal; `で` names where the action happens; `へ` points toward a destination. A route begins where the reader is, not where its author began drawing.

### Activity contracts

| Activity ID                                  | Kind/response                            | Prompt and evidence                                  | Story handoff |
| -------------------------------------------- | ---------------------------------------- | ---------------------------------------------------- | ------------- |
| `planned:activity-n5-place-where`            | grammar-practice / select-one            | Ask where the Desk/Square is.                        | S2.1          |
| `planned:activity-n5-arimasu-imasu`          | grammar-practice / select-one + matching | Locate objects and people using `あります/います`.   | S2.2          |
| `planned:activity-n5-destination-and-action` | grammar-practice / matching + ordering   | Sort `に/へ/で` by reader action.                    | S2.3          |
| `planned:activity-n5-route-repair`           | grammar-practice / ordering + short-text | Add a first landmark and direction to a vague route. | S2.4/S2.6     |
| `planned:activity-n5-time-and-meeting`       | grammar-practice / ordering + short-text | Confirm a time/place in one usable line.             | S2.5          |
| `planned:activity-bridge-sequence-route`     | grammar-practice / ordering              | Add `てから` as optional route sequence.             | S2.6          |
| `planned:activity-n5-write-route-card`       | writing / long-text self-review          | Write a three- or four-sentence route card.          | S2.7          |

### Writing model and rubric

**Model, reveal after first attempt:**

```text
オープン・ドア・デスクを 出て、まっすぐ 行きます。
青い ベンチの 前で 右です。
六時に、ゴードン・スクエアで 会いましょう。
```

| Criterion      | 0              | 1                      | 2                                   |
| -------------- | -------------- | ---------------------- | ----------------------------------- |
| Starting point | Missing        | Place is named         | Starts where reader stands          |
| Route          | Not actionable | One direction/landmark | Direction and landmark are testable |
| Meeting detail | Missing        | Time or action place   | Time and meeting place are clear    |

### Vocabulary and kanji scope

`場所`, `どこ`, `デスク`, `広場`, `駅`, `右`, `左`, `前`, `近く`, `行く`, `会う`, `時`, `半`, `目印`.
Kanji support: `上`, `下`, `中`, `右`, `左`, `行`, `時`, `半`. Images must be original and responsive to the route card, not copied from mnemonic books.

## 6. Chapter 3 Content Contract - The Rain Page

**Planned unit:** `planned:unit-academy-n5-ch3`
**Level:** N5
**Story object:** Third Blue Door card - invitation, choice, table quantities, rain alternative.
**Practical outcome:** A reader can make and answer a gentle invitation, state a preference, and write a small shared-plan message.

### Concepts and variants

| Planned concept ID               | Variant                             | Form                    | Story use                                                       |
| -------------------------------- | ----------------------------------- | ----------------------- | --------------------------------------------------------------- |
| `planned:concept-n5-invitation`  | `planned:variant-n5-masenka-mashou` | `Vませんか / Vましょう` | Invite a visitor to the table with room to decline.             |
| `planned:concept-n5-preference`  | `planned:variant-n5-ga-suki`        | `noun が 好きです`      | Ask and offer ordinary choices.                                 |
| `planned:concept-n5-counters`    | `planned:variant-n5-tsu-nin-hai`    | `〜つ/〜人/〜杯`        | Count items, people, and drinks.                                |
| `planned:concept-n5-rain-option` | `planned:variant-n5-ame-no-toki`    | `雨の ときは ...`       | State an N5 fallback; preview later conditions only as support. |

### Rie explanation page

> **Practical question:** A sign can say “tea is available.” How does it tell a visitor they are welcome to take part?
>
> `お茶を 飲みませんか。`
> `いっしょに 休みましょう。`
>
> `〜ませんか` gives an invitation without forcing yes. `〜ましょう` begins a shared action after agreement. The goal is not a perfect social performance; it is a card another person can act on.

### Activity contracts

| Activity ID                                | Kind/response                                          | Prompt and evidence                                                               | Story handoff |
| ------------------------------------------ | ------------------------------------------------------ | --------------------------------------------------------------------------------- | ------------- |
| `planned:activity-n5-invite-masenka`       | grammar-practice / ordering + select-one               | Build/recognise a gentle invitation and `ましょう` response.                      | S3.1          |
| `planned:activity-n5-preference-suki`      | grammar-practice / select-one + short-text             | Use `が` with `好き`; offer a neutral choice.                                     | S3.2          |
| `planned:activity-n5-table-counters`       | grammar-practice / matching + ordering                 | Count drinks, people, and ordinary items.                                         | S3.3          |
| `planned:activity-n5-table-plan-listening` | listening / select-one + select-many                   | Identify table time/place and a rain alternative via transcript-equivalent route. | S3.4          |
| `planned:activity-n5-invitation-message`   | speaking/text rehearsal / short-text + self-assessment | Rehearse an invitation in text; optional recording never required.                | S3.5          |
| `planned:activity-n5-write-invitation`     | writing / long-text self-review                        | Write an invitation with option, time/place, and fallback.                        | S3.6          |

### Writing model and rubric

**Model, reveal after first attempt:**

```text
六時に、広場で お茶を 飲みませんか。
お茶と 水が あります。
雨の ときは、カフェです。
わからない ときは、デスクに 聞いて ください。
```

| Criterion     | 0       | 1                           | 2                                    |
| ------------- | ------- | --------------------------- | ------------------------------------ |
| Invitation    | Missing | Invitation or shared action | Invitation is clear and low-pressure |
| Reader choice | Missing | One option is named         | Options and help route are clear     |
| Plan          | Missing | Some detail                 | Time/place and rain alternative work |

### Vocabulary and kanji scope

`飲む`, `食べる`, `お茶`, `水`, `料理`, `野菜`, `好き`, `一緒`, `雨`, `カフェ`, `一つ`, `一人`, `一杯`.
Kanji support: `食`, `飲`, `肉`, `料`, `理`, `野`, with `半/大/小` held in continuity for the current Chapter 5 Kanji 7 set. Every image is an original memory aid, never an asserted etymology.

## 7. Chapter 4 and Chapter 6 Proposal Contracts

These chapters are not expanded into separate packs yet, but their script IDs must have a contract before an author panel can validate them.

| Planned activity                                    | Outcome statement                                                         | Response kind                           | Required model/rubric                         |
| --------------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------- | --------------------------------------------- |
| `planned:activity-n5-quiet-room-description`        | I can describe what a room is like and what it is for.                    | matching, select-one                    | no model                                      |
| `planned:activity-n5-thought-and-reason`            | I can offer a practical opinion and one reason.                           | matching, short-text                    | example bank after attempt                    |
| `planned:activity-n5-experience-and-recommendation` | I can use a small past experience to recommend a route.                   | select-one, short-text                  | neutral/fictitious scenarios                  |
| `planned:activity-n5-quiet-request`                 | I can ask permission or clarification in a quiet space.                   | select-one, short-text, self-assessment | text rehearsal; recording optional only       |
| `planned:activity-n5-write-quiet-card`              | I can write a card that describes a quiet option and support route.       | long-text self-review                   | reader-care rubric                            |
| `planned:activity-n4-guide-walkthrough`             | I can sequence a guide for a first arrival and identify a missing detail. | ordering, matching                      | checklist after attempt                       |
| `planned:activity-n4-summary-comparison`            | I can compare a first draft and revision with a reason.                   | matching, short-text                    | comparison bank                               |
| `planned:activity-n4-read-handover-note`            | I can identify gist and actionable request in a short handover note.      | select-one, select-many                 | original transcript with support layers       |
| `planned:activity-n4-open-rooms-guide`              | I can write a guide with action, support, choice, and fallback.           | long-text self-review                   | model after first attempt; reader-care rubric |
| `planned:activity-n4-final-reflection`              | I can choose my next rehearsal with honest support needs.                 | self-assessment                         | no score or narrative gate                    |

## 8. Chapter 5 Current-Model Alignment

The story must use the current lesson's actual concepts rather than rename them into a parallel curriculum:

| Current concept/variant                                                                            | Chapter 5 narrative use                                              |
| -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `concept-listening-gist-detail`                                                                    | Listen to a small rehearsal plan before reading its transcript.      |
| `concept-nara-suggestions` / `variant-nara-suggestion`                                             | Mika chooses a rain alternative from shared context.                 |
| `concept-polite-negative-question` / `variant-arimasenka-polite-question`                          | Suzu checks a vegetable option before publishing it.                 |
| `concept-purpose-youni` / `variant-youni-enabling-purpose`, `variant-nai-youni-preventing-purpose` | Leo explains route-photo and map support.                            |
| `concept-solo-dialogue-adaptation`                                                                 | Nori adapts a plan to one speaker, subject to the recording blocker. |
| `concept-extended-writing`                                                                         | The Desk drafts a reader-centred shared plan.                        |
| `concept-kanji-set-7`                                                                              | Menu/route support uses 肉, 料, 理, 野, 半, 大, 小 in context.       |

## 9. Authoring and Asset Checklist

Before any planned activity is promoted to the content graph, require:

1. A valid `AcademyConcept`, `ConceptVariant`, `LearningOutcome`, `AcademyActivity`, and `CurriculumPlacement`.
2. An original title, instructions, prompt, accepted-answer policy, and feedback/recovery behaviour.
3. A model answer after first attempt for every long-text task, plus a reader-care rubric with no score-based story consequence.
4. Caption/transcript parity for every audio asset; text and self-assessment must complete every speaking outcome.
5. Original, cleared rights metadata for every model, transcript, image, audio, and kanji reference.
6. N5, bridge, and N4 variants that preserve intent, activity, and story state.
7. Direct task access, skip recap, and no choice/bond/currency gate.

The detailed panel workflow, validation rules, and publishing statuses live in [AUTHOR-PANEL-SPEC.md](../AUTHOR-PANEL-SPEC.md).
