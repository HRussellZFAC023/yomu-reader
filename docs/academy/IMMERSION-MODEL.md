---
title: "Yomu Academy immersion model"
description: "A deterministic N5-to-N4 support policy that keeps Japanese primary and help close."
---

# Immersion Model

**Status:** implementation contract for Lesson 9. It is a support policy, not a proficiency test or an AI tutor.

## The Promise

Japanese gets the first turn. A learner can then ask for the next useful clue without losing the task:

1. **Japanese first:** one short line in the situation.
2. **Replay, gesture, or image:** make the intention visible before translating.
3. **Furigana:** make the reading available.
4. **Brief English:** name the practical meaning in one line.

The layers are cumulative. Showing furigana or English never hides the Japanese. A learner may request either layer at any time.

## Comprehensible Input Rules

`src/academy/immersion.ts` exports these rules as typed data so a renderer does not have to invent its own version:

- One short, meaningful Japanese turn comes before explanation.
- A replay, picture, gesture, or matching action is the next clue.
- Furigana is help, not a reward or a penalty.
- English stays short and never replaces the Japanese line.
- A repair phrase comes before an answer key.
- Support does not disappear after a correct answer.

This is deliberately more modest than a claim that one interface sequence will produce acquisition. It turns well-supported teaching conditions into visible product behavior that can be tested with learners.

## Deterministic Adaptation

The resolver accepts only an authored activity ID, a JLPT placement band, saved attempt counts, and explicit support preferences. It does not inspect free text, infer identity, or call an AI service.

| Evidence | Default view |
| --- | --- |
| No placement, pre-N5, N5 emerging, or N5 consolidating | Japanese plus the replay/image cue; UI labels are bilingual. |
| N5 secure or N4 emerging | Japanese first; English labels are available on request. |
| N4 secure | Japanese first; English labels remain available on request. |
| One lapse or an unsuccessful recorded attempt | Add furigana. |
| Two or more lapses | Add concise English too. |
| A recorded pass | Return to Japanese first; every layer remains requestable. |
| Learner selects always-show furigana or English | Respect that setting immediately. |

The policy is predictable by design. Placement changes a default, not a learner's entitlement. A manual support choice always wins over the default.

## Transcript And Audio-Off Route

The live Lesson 9 dialogue follows a listen-first order: its transcript becomes available after the first meaningful attempt. That timing protects an initial listening pass, not access to content.

- A learner who chooses the text-first route receives the transcript immediately as an equivalent route.
- The solo-dialogue transcript is available on request.
- No other Lesson 9 task pretends to have a transcript.
- The writing model stays after the learner's first draft, as authored in the content graph.
- Captions, transcript, visual speaker/context cues, and text rehearsal carry the same task meaning when sound is off.

Shadowing is optional, short, and has a text alternative. It never requires a microphone, an upload, or a pronunciation score.

## Repair And Feedback

The model keeps small repair phrases near each task, including:

- `もう一度お願いします。` - please say that again.
- `ゆっくりお願いします。` - please say it slowly.
- `〜ということですか。` - do you mean ...?
- `雨なら、〜にしませんか。` - if it rains, shall we ...?
- `〜ように、〜します。` - I will ... so that ...

Feedback is authored by route, not generated from a learner's writing. It is short Japanese first, with an optional English line. A self-reviewed draft is never described as automatically correct.

## Lesson 9 Map

All eight production Lesson 9 activities are mapped in `lesson9ImmersionPlans`.

| Activity | Japanese first | Context then support | Transcript / shadowing |
| --- | --- | --- | --- |
| `activity-listen-weekend-plan` | `日曜日の予定です。何を決めていますか。` | Picture and replay, then readings, then the Sunday lunch/rain-backup summary. | Transcript after first attempt; text-first bypass. Echo two useful lines. |
| `activity-nara-suggestion` | `雨なら、どうしますか。` | Rain/cafe image, furigana, then the café suggestion. | No transcript. Echo the condition and suggestion. |
| `activity-polite-negative-question` | `野菜の料理はありませんか。` | Menu context, furigana, then the availability question. | No transcript. Echo the polite question. |
| `activity-purpose-youni` | `みんなが場所を見つけられるように。` | Link photo/map to purpose, then furigana and a short explanation. | No transcript. Speak goal, then action. |
| `activity-solo-dialogue-adaptation` | `自分のことばで、計画を言います。` | Listen, echo, change one part; add readings and a concise plan checklist. | Transcript on request. Link two short lines or use text rehearsal. |
| `activity-write-shared-plan` | `みんなのために、計画を書きます。` | Use time/place/rain clues, then readings and a brief writing aim. | No transcript. Read one line before drafting; model after first draft. |
| `activity-kanji-7` | `肉・料・理・野・半・大・小` | Connect words to food/map clues, then readings and context. | No transcript. Read useful words or trace them to the picture. |
| `activity-lesson-reflection` | `次は、何を練習しますか。` | Choose one thing that worked, then readings and a concise next-step explanation. | No transcript or speaking demand. |

## App Contract

The main app can consume these pure helpers without changing the content graph:

```ts
resolveImmersionSupport({
  activityId: 'activity-listen-weekend-plan',
  placementBand: 'N5-emerging',
  progress: { attempts: 0, passedAttempts: 0, lapseCount: 0 },
  preferences: { inputMode: 'audio-first' },
});
```

The result contains the current visible reveal layers, later layers available on request, transcript access, shadowing/text alternative, route-appropriate repair phrases, and UI language mode. `resolveImmersionUiLabel()` and `feedbackForImmersion()` provide the small display decisions separately. `validateLesson9ImmersionPlans()` protects the eight-activity map and the staged-reveal/access rules.

## Research Basis And Limits

- [Nation's four-strands framework](https://openaccess.wgtn.ac.nz/articles/journal_contribution/The_four_strands/12552167) supports balancing meaning-focused input, output, focused language work, and fluency over a course. This model contributes support behavior; it does not claim that one Lesson 9 screen is a balanced course.
- [Tabata-Sandom's study of Japanese graded-reader aids](https://jalt-publications.org/content/index.php/jer/article/view/9) found that text modification and support can affect L2 Japanese reading, and argues for furigana tuned to learner level. Yomu therefore makes readings adjustable rather than permanent or punitive.
- [Kawashima's 2024 furigana study](https://cir.nii.ac.jp/crid/1390018440029713792) reports different effects for kanji- and non-kanji-background learners. Yomu does not infer that background; learners choose their reading support directly.
- [Hamada's shadowing review](https://doi.org/10.1177/0033688218771380) gives a cautious rationale for brief listening-focused shadowing while noting limits around speaking claims. Yomu uses it as optional rehearsal, never as pronunciation assessment or required recording.

These sources guide design constraints, not guarantees of individual outcomes. Validate the model with consent-based usability and learning research before scaling it beyond the current lesson.
