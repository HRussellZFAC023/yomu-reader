---
title: "Yomu Academy: Prologue - The First Card"
description: "Original opening script for the Noticeboard Term: access-first arrival, a useful first choice, and the Blue Door Folio."
---

# Prologue - 「最初のカード」 The First Card

**Story position:** Arrival. The learner meets a fictional evening-class facilitator, sees one incomplete welcome card, chooses a useful first route, and can begin learning immediately.

**Runtime status:** authoring script. `proposed:onboarding-route-check` is a non-story, no-stakes route-check proposal, not a current graph placement; its final runtime mapping must be validated separately. No personal name, reason for studying, or microphone is requested.

**Scene contract:** Every scene below is skippable, has a recap, and points to a direct task. `planned:` IDs are curriculum proposals, not published runtime links.

## S0.1 - Threshold Card

**Location:** Threshold Card, fictional Gower Street frontage near UCL.
**Narrative job:** Let the learner arrive without having to perform an identity.
**Authentic language need:** Understand a very short welcome card and select the next useful action.
**Learning evidence:** `proposed:onboarding-route-check` - kana/word recognition and context-appropriate reply; no story choice is scored.
**Intent ID:** `arrival.choose-first-useful-action`
**Choice effect:** `practice-order`; all options retain the same core catalogue and manual route switch.

_Blue hour. The street is damp but calm. An original, handwritten sign sits in a small display case: `オープン・ルームズ - 今夜`. Under it is a card that has been revised so often its lower edge is soft._

**RIE:** `こんばんは。ここは、オープン・ドア・デスクです。`
_Good evening. This is the Open Door Desk._

**RIE:** `入る前に、一つだけ。今夜、何が いちばん 役に立ちますか。`
_Before you go in, one question: what would be most useful tonight?_

**Choice card:**

| Option        | Japanese label | Preview                                |
| ------------- | -------------- | -------------------------------------- |
| Greet someone | `あいさつから` | Start with a short introduction scene. |
| Find a place  | `場所から`     | Start with a route-card scene.         |
| Make a plan   | `計画から`     | Start with a small planning scene.     |
| Read a notice | `カードから`   | Start with a notice-reading scene.     |

**Variant spine - same intent:**

| N5                      | Bridge                      | N4                                                   |
| ----------------------- | --------------------------- | ---------------------------------------------------- |
| `今夜、何を しますか。` | `今夜、何から 始めますか。` | `今夜、いちばん役に立ちそうなことから始めませんか。` |

**Recap if skipped:** _You arrived at the fictional Open Door Desk and chose a useful first route. You can change it later._
**Handoff:** Access setup and `proposed:onboarding-route-check`; **Continue learning** bypasses this scene.

## S0.2 - The Room with the Spare Chair

**Location:** Open Door Desk, L07.
**Narrative job:** Establish adult evening-class warmth without asking why anyone is present.
**Authentic language need:** Identify a room, a desk, and the person to ask for help.
**Learning evidence:** `planned:activity-n5-classroom-survival` - select a context-appropriate help question.
**Intent ID:** `arrival.identify-help-point`

_Inside, there are ordinary signs of a class about to begin: chairs that have been pulled into a circle, a kettle that has not committed to boiling, and one spare chair with a dry coat hook beside it. Rie has three markers in one hand. One is visibly finished._

**RIE:** `これは デスクです。わからない ときは、ここで 聞いて ください。`
_This is the desk. If you are unsure, please ask here._

**RIE:** `あの いすは、空いています。どうぞ。`
_That chair is free. Please._

_She tries the green marker. It produces a single heroic line, then stops._

**RIE:** `今日の 緑は、短い 文が 好きみたいです。`
_It appears green has a preference for short sentences tonight._

**Variant spine - same intent:**

| N5                                            | Bridge                                                 | N4                                                 |
| --------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------- |
| `わからない ときは、ここで 聞いて ください。` | `わからない ことが あったら、ここで 聞いて ください。` | `分からないことがあれば、デスクで聞いてください。` |

**Practice prompt:** Choose the most useful response to a notice you cannot follow: `すみません。これは 何ですか。`
**Recap if skipped:** _Rie showed you the Desk and the spare chair. Asking for clarification is part of the route, not a disruption._
**Handoff:** `planned:activity-n5-classroom-survival`.

## S0.3 - The Blue Door Folio

**Location:** Open Door Desk noticeboard.
**Narrative job:** Introduce the central practical mystery.
**Authentic language need:** Read a short, incomplete notice and ask what is missing.
**Learning evidence:** `planned:activity-n5-notice-scan-00` - identify a named object and a missing detail.
**Intent ID:** `folio.identify-incomplete-card`

_Rie moves an old poster to make space for a new card. A folded folio slips out from behind it. Its cover bears a small blue half-door in pencil. There is no name, only a title: `はじめて 来る 人へ`._

**RIE:** `あれ。これは、だれの カードでしょう。`
_Oh. Whose card might this be?_

**SUZU:** `名前は ありません。でも、「初めて 来る 人へ」は 書いてあります。`
_There is no name. But it does say, “For a first-time visitor.”_

_The first card says: `入る前に、まず ______。` The blank has been left blank on purpose or by accident; no one knows yet._

**RIE:** `いいですね。今夜の 最初の 問いは、これです。だれに 聞きますか。`
_Good. This is tonight’s first question: who do you ask?_

**Variant spine - same intent:**

| N5                  | Bridge                          | N4                                           |
| ------------------- | ------------------------------- | -------------------------------------------- |
| `これは 何ですか。` | `これは、だれの カードですか。` | `このカードには、何が足りないと思いますか。` |

**Choice:** `カードを 先に 読む` / `だれに 聞くかを 先に 練習する` (`practice-order`; both rejoin at the same notice scan).
**Recap if skipped:** _The Blue Door Folio contains unfinished welcome cards. The first asks who a new visitor can ask for help._
**Handoff:** `planned:activity-n5-notice-scan-00`.

## S0.4 - Access Before Challenge

**Location:** Open Door Desk, Access card.
**Narrative job:** Make support an ordinary, dignified route choice.
**Authentic language need:** None beyond placement prompts; this is access configuration, not a scene test.
**Learning evidence:** `proposed:onboarding-route-check`; manual route selection remains visible.
**Intent ID:** `arrival.set-access-without-disclosure`

_Rie turns over the Access card. It is deliberately plain: Reading, Meaning, Sound, Motion, Input. Each has a visible control and no question mark asking for a reason._

**RIE:** `ここは、あなたのために 変えて いいところです。`
_This is a part you are allowed to change for yourself._

**RIE:** `音が なくても、読む道は あります。急がなくても、大丈夫です。`
_There is a reading route even without sound. There is no need to hurry._

**System choices:** captions; audio off; reduced motion; text size; furigana; translation; keyboard/touch route; Foundation N5 / N5 bridge / N4 starting route; **Continue learning**.

**Recap if skipped:** _Support settings can be changed at any time. The initial route is a suggestion, not a label._
**Handoff:** `proposed:onboarding-route-check` or direct Foundation N5 activity.

## S0.5 - The First Margin Question

**Location:** Open Door Desk, end of arrival.
**Narrative job:** Close on contribution rather than mystery theatre.
**Authentic language need:** Turn one understood question into a next action.
**Learning evidence:** `planned:activity-n5-card-name-repair` - select or write the missing help phrase.
**Intent ID:** `folio.turn-question-into-next-step`

_Suzu places a small blank card beside the folio. Leo turns it so the blue half-door faces up. It is a small thing, but it makes the work feel shared._

**LEO:** `カードは、まだ 半分です。`
_The card is still only half done._

**RIE:** `半分で いいですよ。次の人が、一つ 書けますから。`
_Half is fine. It leaves the next person one thing to write._

**System:** _The Blue Door Folio is available in the Bag as a recap object. Its first margin question is now visible: `だれに 聞きますか。`_

**Recap:** _A welcome card needs a person, a place, and a next action. Chapter 1 begins with the first of those: naming the Desk._
**Handoff:** Campus home; `planned:activity-n5-card-name-repair`; **Continue learning** remains persistent.

## Prologue author notes

- The prose must never imply that an unnamed learner is withholding something. Unnamed is the normal path.
- The no-stakes route check samples actionable language only and never derives confidence, identity, or narrative worth from a choice.
- The folio is a physical recap object. It is not a collectible that gates lessons, and it has no supernatural behaviour.
- Audio-off uses the exact text above. Reduced motion renders the same locations as static cuts with no door animation, drifting object, or auto-advance.
