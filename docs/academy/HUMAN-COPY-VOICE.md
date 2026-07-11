# Human Copy Voice

## Job

Yomu Academy should sound like an alert teacher or classmate in an evening Japanese room. It should not sound like a narrator selling an experience. A line earns its place when it tells the learner what is happening, what to notice, or what to do next.

## What This Slice Is About

Lesson 9 is the 2025/26 Rie Level 3+ Lesson 9 slot. The UCL catalog gives chronology and activity patterns only; it does not provide UI wording. The original Yomu lesson supplies eight activities:

1. Listen to a Sunday plan.
2. Offer a rain alternative with `なら` and `ませんか`.
3. Ask about a vegetable dish with `ありませんか`.
4. Join purpose and action with `ように` or `ないように`.
5. Rehearse the plan in one voice.
6. Write the group message.
7. Meet Kanji 7 in useful words.
8. Pick the next practice.

The UCL anchor maps to Genki 22-23 and Minna II 35-36. It does not license copied worksheet language, examples, audio, or teacher phrasing.

## Voice Rules

- Start with the situation: rain, a cafe, food, a map, a message, or the next person reading it.
- Give one action per line. "Listen for the plan" beats "Build meaning from the situation."
- Name the missing detail without calling the learner wrong. Time, place, polite ending, then a repair.
- Use English as a short gloss or instruction. Japanese carries the classroom voice where it helps the learner hear the phrase.
- Keep Japanese natural for the taught level. Rie uses short settled sentences, then one connected N4 idea when the activity calls for it.
- Let humour come from an object or a practical mishap. A marker dying at `どこ` is enough; the learner is never the joke.
- Buttons name an action: `Listen`, `Write the message`, `Open transcript`. They do not narrate a feature.

## Rie

Rie is warm, observant, and practical. She begins with meaning, permits a short first attempt, and asks for one useful improvement. She is not a mascot, a therapist, or an inspirational monologue machine.

Good:

- `まず、何を決めているか聞きましょう。`
- "First, hear what they are deciding."
- `相手が次にできることを書きましょう。`

Avoid:

- Abstract weather-page lore.
- A lesson "journey", "transformation", or vague confidence claims.
- Legal-sounding reassurance about storage, access, or device settings.
- Decorative eyebrows that restate the heading.

## VN And Learning Product Pattern

The local VN research calls for two to six short beats, no more than two lines before a clear action, and a direct route to practice. The learning-tool research calls for independently controllable furigana, gloss, transcript, and sound support. Where a control exists, label it plainly; do not explain its policy in the middle of a lesson.

Privacy and accessibility are product behavior: a name is optional, recordings are opt-in and deletable, text can carry an audio task, and reduced motion changes the presentation without hiding information. Do not turn those guarantees into a paragraph of UI copy.

## Guardrails

`src/academy/copy.ts` is keyed to the actual activity IDs. `tests/academy/copy.test.ts` compares those IDs with the Lesson 9 placements in `content.ts`, keeps every surface string at 120 characters or fewer, and rejects the "Rain Page" wording, common AI filler, and visible policy disclaimers.
