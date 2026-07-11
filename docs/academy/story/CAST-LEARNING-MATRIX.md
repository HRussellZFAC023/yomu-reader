# Cast Learning Matrix

This matrix makes one promise testable: nobody is present only as a portrait or roster entry. Every character speaks in at least two core communicative tasks at different route stages and has one concrete extension hook.

The runtime source of truth is `src/academy/cast-learning.ts`. The focused contract is `tests/academy/cast-learning.test.ts`.

## Identity and originality boundary

- Known classmates and Rie-sensei are represented by first name only.
- Profiles contain a curriculum role, not a personal biography. Do not add surnames, employers, addresses, phone numbers, email addresses, social handles, or other identifying details.
- `Noa` and `Remi` are neutral, invented first names for fictional pair-work roles. They do not stand in for, identify, or invite guesses about any real unnamed classmate.
- `Ena`, `Leo`, `Sora`, and `Nico` are original Yomu Academy textbook counterparts. They borrow only broad pedagogic functions: the Genki-style pair moves a campus exchange from model to personal follow-up; the Minna-style pair rehearses concise practical exchanges. Their names, lines, examples, and situations are original and must stay that way.
- A learner may answer every personal-looking prompt with a fictional detail or the neutral label "learner". No task requires disclosure.

## Level contract

| Route | Working level | Dialogue boundary |
|---|---|---|
| Foundation 0 | pre-N5 | Greetings, pointing, confirmation, and memorised classroom repair chunks. |
| Lessons 1-4 | N5 | Introductions, location and price, invitations, polite past, and short て-form sequences. |
| Lessons 5-8 | N4 | Ability and advice, reasons with し, ながら, result states, completion, and preparation. |
| Lesson 9 | N4+ | A shared plan with なら, a considerate negative question, and ように support action. |

An extension unlocks only after the route stage whose level it uses. It may deepen a character's thread, but it is never a mastery gate.

## Core task index

| Route | Task | Communicative job |
|---|---|---|
| Foundation 0 | `f0-classroom-repair` | Miss a line, ask for it again, and stay in the exchange. |
| Foundation 0 | `f0-kana-check` | Point to one kana, check it, and confirm it. |
| Lesson 1 | `l1-likes-circle` | Give a short introduction with one easy follow-up topic. |
| Lesson 1 | `l1-introduction-handoff` | Listen, echo one detail, and introduce yourself without private information. |
| Lesson 2 | `l2-find-the-cafe` | Ask where a place is, follow a landmark, and check a price. |
| Lesson 2 | `l2-landmark-relay` | Relay a destination precisely enough for a partner to act. |
| Lesson 3 | `l3-food-invitation` | Invite, respond naturally, and settle a time. |
| Lesson 3 | `l3-drink-choice` | Accept company without requiring everybody to choose the same thing. |
| Lesson 4 | `l4-weekend-recall` | Report and connect two past actions. |
| Lesson 4 | `l4-weekend-contrast` | Compare different past accounts and ask a follow-up. |
| Lesson 5 | `l5-gentle-study-advice` | Name a difficulty and offer bounded, softened advice. |
| Lesson 5 | `l5-small-plan-clinic` | Turn a vague study problem into one possible next step. |
| Lesson 6 | `l6-cafe-reasons` | Recommend a place with two reasons and a simultaneous activity. |
| Lesson 6 | `l6-library-choice` | Negotiate a place by sharing a plan, reasons, and a habit. |
| Lesson 7 | `l7-classroom-incident` | Report visible states, an unfortunate result, and a next action. |
| Lesson 7 | `l7-card-table-report` | Separate what is visibly true from what somebody does next. |
| Lesson 8 | `l8-trip-preparation` | Sort what is ready from what still needs doing. |
| Lesson 8 | `l8-rain-checklist` | Add a precaution that makes a plan easier for somebody else. |
| Lesson 9 | `l9-inclusive-restaurant-plan` | Seek constraints and make a conditional alternative usable. |
| Lesson 9 | `l9-rain-plan-readback` | Repeat a fallback with condition, time, place, and support action. |

## Character coverage

The "source" column is an identity boundary, not a story rank. Known first names, fictional placeholders, and Academy-original textbook counterparts must not be merged implicitly.

| ID | Display | Source | Recurring learning thread | Core speaking tasks | Extension hook |
|---|---|---|---|---|---|
| `rie` | Rie-sensei | known first name | Meaning-first repair, kind correction, and considerate classroom framing. | `f0-classroom-repair`, `l1-likes-circle`, `l2-find-the-cafe`, `l3-food-invitation`, `l4-weekend-recall`, `l5-gentle-study-advice`, `l6-cafe-reasons`, `l7-classroom-incident`, `l8-trip-preparation`, `l9-inclusive-restaurant-plan` | `ext-rie-office-hour` |
| `henry` | Henry | known first name | Repair first, then make an overlarge study plan achievable. | `f0-classroom-repair`, `l5-small-plan-clinic` | `ext-henry-ten-minutes` |
| `aakash` | Aakash | known first name | Support taste with useful description and more than one reason. | `f0-classroom-repair`, `l6-cafe-reasons` | `ext-aakash-two-reasons` |
| `alex` | Alex | known first name | Check carefully, sequence calmly, and make a deliberate choice. | `f0-kana-check`, `l6-library-choice` | `ext-alex-route-memory` |
| `tom` | Tom | known first name | Turn visible symbols and objects into checkable language. | `f0-kana-check`, `l7-card-table-report` | `ext-tom-card-count` |
| `sam` | Sam | known first name | Move from a short confirmation to practical group preparation. | `f0-kana-check`, `l8-rain-checklist` | `ext-sam-grill-invitation` |
| `francis` | Francis | known first name | Offer one sincere preference, then help voice a shared fallback. | `l1-likes-circle`, `l9-rain-plan-readback` | `ext-francis-quiet-recommendation` |
| `shin` | Shin | known first name | Use a familiar interest first, then make written clues useful to others. | `l1-likes-circle`, `l9-rain-plan-readback` | `ext-shin-menu-clue` |
| `jodi` | Jodi | known first name | Start with a safe introduction and later connect memory to preparation. | `l1-introduction-handoff`, `l8-trip-preparation` | `ext-jodi-small-memory` |
| `christian` | Christian | known first name | Move from routine language to factual incident reporting. | `l1-introduction-handoff`, `l7-classroom-incident` | `ext-christian-incident-desk` |
| `jenny` | Jenny | known first name | Listen to the room, then pair a problem with a useful offer. | `l1-introduction-handoff`, `l7-classroom-incident` | `ext-jenny-offer-help` |
| `robert` | Robert | known first name | Locate a meeting place, then host a plan that leaves room for needs. | `l2-find-the-cafe`, `l9-inclusive-restaurant-plan` | `ext-robert-table-plan` |
| `mika` | Mika | known first name | Ask the practical question, name uncertainty, and keep speaking. | `l2-find-the-cafe`, `l5-gentle-study-advice` | `ext-mika-repair-strategy` |
| `sophie` | Sophie | known first name | Give precise directions and precise advice without making either sharp. | `l2-landmark-relay`, `l5-gentle-study-advice` | `ext-sophie-soften-advice` |
| `xingyu` | Xingyu | known first name | Confirm warmly, then use sound and rhythm for simultaneous practice. | `l2-landmark-relay`, `l6-cafe-reasons` | `ext-xingyu-rhythm-loop` |
| `angel` | Angel | known first name | Relay a location, compare what happened, and own the prepared-state checklist. | `l2-landmark-relay`, `l4-weekend-contrast`, `l8-trip-preparation` | `ext-angel-ready-list` |
| `stasi` | Stasi | known first name | Make an inviting suggestion, then justify a visual choice. | `l3-food-invitation`, `l6-library-choice` | `ext-stasi-visual-reasons` |
| `ruparna` | Ruparna | known first name | Close a practical invitation and notice exactly what changed in a line. | `l3-food-invitation`, `l7-card-table-report` | `ext-ruparna-subtitle-change` |
| `pho` | Pho | known first name | Keep a choice relaxed at N5 and a fallback complete at N4+. | `l3-drink-choice`, `l9-inclusive-restaurant-plan` | `ext-pho-easy-fallback` |
| `noa` | Noa | invented placeholder | Check a partner's preference before giving gentle, bounded advice. | `l3-drink-choice`, `l5-small-plan-clinic` | `ext-noa-advice-check` |
| `remi` | Remi | invented placeholder | Confirm an individual choice, prepare the group, and read the final plan back. | `l3-drink-choice`, `l8-rain-checklist`, `l9-rain-plan-readback` | `ext-remi-plan-readback` |
| `ena` | Ena | Academy original, Genki-inspired function | Adapt a campus model from a past answer into an achievable personal plan. | `l4-weekend-recall`, `l5-small-plan-clinic` | `ext-ena-model-remix` |
| `leo` | Leo | Academy original, Genki-inspired function | Move from giving a model answer to asking a real follow-up. | `l4-weekend-recall`, `l6-library-choice` | `ext-leo-follow-up` |
| `sora` | Sora | Academy original, Minna-inspired function | Practise concise practical turns: state, evidence, next action. | `l4-weekend-contrast`, `l7-card-table-report` | `ext-sora-state-next-step` |
| `nico` | Nico | Academy original, Minna-inspired function | Practise concise practical turns: confirm, prepare, hand over. | `l4-weekend-contrast`, `l8-rain-checklist` | `ext-nico-preparation-check` |

## Authoring checks

Before adding or revising a cast task:

1. Give the learner something to do with the line: answer, relay, choose, repair, negotiate, or publish.
2. Keep every named participant in the actual exchange. A silent participant is not coverage.
3. Respect the route level. Foundation repair phrases are usable chunks; Lesson 9 can coordinate conditions, constraints, and support actions.
4. Let personality shape the situation, not the grammar accuracy. Nobody becomes a joke for making an error.
5. Keep fictional answers normal. Do not reward disclosure of real biography or identifying details.
6. For textbook counterparts, write from the communicative goal afresh. Never transplant a named character, sample sentence, dialogue beat, or story situation from a coursebook.
7. Run `npx vitest run tests/academy/cast-learning.test.ts` after changing the roster, a core task, an extension hook, or this matrix.
