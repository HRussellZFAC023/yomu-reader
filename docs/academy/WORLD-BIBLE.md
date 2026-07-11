---
title: "Yomu Academy: The Noticeboard Term"
description: "Original campus-life visual-novel canon and implementation contract for a story-first Japanese learning experience."
---

# Yomu Academy: The Noticeboard Term

**Status:** product, content, accessibility, and implementation canon for the initial Academy narrative frame.

## Canon in One Line

**The Noticeboard Term** is an original campus-life visual novel set around UCL and Bloomsbury in which the learner helps a fictional community make a practical campus event understandable in Japanese. The campus is the primary Academy home and navigation model; story progression is always optional and never blocks placement, practice, review, accessibility, or completion.

## Product Contract

The Academy does not have a lesson dashboard with a story mode attached. Its ordinary home is a campus map, a term timetable, and a small narrative reason for the next practice task.

At the same time, the learner must be able to choose the next learning action with no narrative obligation:

- **Campus** is the default home after onboarding and after each completed task.
- **Continue learning** is persistently visible and opens the next unfinished core activity in one action.
- **Review** opens due practice directly, without a required scene.
- **Bag** holds optional original items, recap cards, and visual mementoes only.
- **Access** exposes captions, audio-off, reduced motion, text presentation, input, and privacy controls from every state.

| Surface | Story is present as | Direct learning behavior | Must never happen |
| --- | --- | --- | --- |
| Campus home | Map, time-of-day art, active notice, and compact scene context | **Continue learning** opens the next core task immediately. | A learner has to inspect locations to find required work. |
| Location scene | Up to six short authored beats around one practical purpose | Skip opens the linked core task; replay is optional. | A dialogue choice changes access to a grammar point or review. |
| Core activity | Location label and one-sentence practical reason | The activity is fully usable without reading preceding story. | Story completion is recorded as academic mastery. |
| Recap | One short written summary and optional visual card | Continue opens the next task; replay stays optional. | A recap withholds missed learning content. |
| Review | A compact campus framing label only | Review starts immediately and returns to the campus afterward. | Due review depends on currency, bonds, or a time-limited event. |
| Access and privacy | Current setting state in plain language | Settings apply in place and are saved locally. | A learner must re-enter onboarding or share personal data to change a setting. |

### Scene budget

- A standard scene is 2-6 beats, each no more than two dialogue lines before an interaction or clear continuation.
- Auto-advance is off by default.
- A core activity may be entered before, during, or after a scene; the system remembers the most recent beat separately from activity progress.
- Skipping a scene shows the linked task and makes a one-sentence recap available later.
- A learner can return to the campus at any time. There is no real-time deadline, streak loss, or penalty for leaving.

## Safety, Originality, and Real-World Boundaries

### Fiction boundary

The world is original. All characters, clubs, rooms, notices, events, dialogue, items, audio, visual compositions, and story arcs are fictional Yomu Academy material. The world does not adapt, quote, imitate, or continue any third-party game, anime, visual novel, coursebook, class, or franchise.

The setting may use UCL and Bloomsbury as geographic reference points, but this does not mean the Academy is endorsed by, affiliated with, or speaking for UCL. Do not use official logos, uniforms, maps, photography, interior plans, staff references, or claims about real services or events. Background art must be original and should label fictional events as fictional.

### People boundary

The learner may remain unnamed. The product asks for no real name, pronouns, biography, phone number, contact details, photo, voice sample, class details, or social account.

Supporting characters are invented for this story. They must not be based on or paired with real classmates. Real classmates remain pending-consent, first-name-only inspiration at most, and no name or attribute belongs in this world bible, the product, a prompt, or an asset until a separate consent process permits a narrowly defined use. Even then, one-to-one portrayal is not the default.

### Asset boundary

Every shippable narrative asset needs the existing Academy rights metadata:

- The origin field identifies original, licensed, open-license, or learner-contributed material.
- The status field is cleared before an asset ships.
- Rights holder, license, attribution, and permitted uses are complete.
- Audio has a matched transcript and caption file.
- Generated or commissioned art is stored with its source brief, rights record, and a statement that it does not imitate protected characters or artwork.

No pending, copied, or untraceable asset enters a dialogue scene.

## World Premise

At a fictional campus-adjacent help point called the **Open Door Desk**, a small group maintains a handwritten noticeboard for an upcoming **Open Rooms Afternoon**. The event itself is modest: a few quiet places to meet, a route card, a weather fallback, and beginner-friendly activity notices.

The difficulty is practical rather than dramatic. Times are unclear, signs need rewriting, a rain plan has no obvious meeting point, and a welcome card is too vague for a newcomer to follow. The learner helps the group make each small instruction clear in Japanese. Every episode turns one real communicative need into a focused language task.

The stakes are warm, local, and human-scale:

- No danger, competition, romance route, countdown, or catastrophe.
- No punishment for choosing a different location, support level, or pace.
- Every contribution is framed as making the campus easier to understand for someone else.
- The story celebrates clarity, repair, and low-pressure connection rather than flawless performance.

## Tone and Visual Direction

**Tone:** observant, practical, gentle, and lightly funny. Characters notice ordinary details: a folded map, a late rain cloud, a crowded noticeboard, a quiet table, a carefully written time. Dialogue carries a language purpose before it carries a plot beat.

**Visual language**

- Use original, readable 2D environments with clear foreground, interaction states, and high text contrast.
- Establish a place with a useful, inspectable visual detail rather than an abstract mood screen.
- Keep typography and dialogue panels stable; background atmosphere must not reduce legibility.
- Treat time of day as a calm orientation cue, never as a deadline or missed-content mechanic.
- In reduced-motion mode, present static compositions with no parallax, camera pan, zoom, screen shake, flicker, or forced fade.

## Bloomsbury Location Grid

The locations below are narrative anchors. Real-world references locate the learner around Bloomsbury; every scene, club, object, and event attached to them is fictional.

| ID | Geographic anchor | Fictional story function | Primary language work | Art and rights guardrail |
| --- | --- | --- | --- | --- |
| L01 | Gower Street frontage near UCL | **Threshold Card:** the first place the learner sees the noticeboard route. | Greetings, place names, time, and simple invitations. | Exterior-inspired original composition only; no logos, official signage, or copied photographs. |
| L02 | UCL Main Quad exterior | **Quad Meeting Point:** a calm landmark for arranging where to meet. | Location questions, confirmation, and basic directions. | Do not depict a real class, office, or interior as if it participates in the fiction. |
| L03 | Malet Place | **Card Rack:** the group sorts partially useful notices into clear plans. | Reading short notices, kanji in context, and sequencing. | Use a fictional rack and notices, not a reconstruction of real signboards. |
| L04 | Gordon Square | **Rain Window:** the group compares an outdoor plan with a nearby fallback. | Preferences, invitations, conditions, and practical alternatives. | Original trees, paths, and benches; no person's likeness or copied image reference. |
| L05 | Tavistock Square | **Quiet Table:** a lower-stimulation place for drafting a clear message. | Short writing, politeness, reasons, and self-review. | Avoid claims about actual events or facilities. |
| L06 | The streets between Russell Square and the Brunswick Centre | **Errand Loop:** a route card needs a time, a destination, and a contingency. | Directions, quantities, plans, and repair language. | Keep storefronts and brands fictional or abstract. |
| L07 | The fictional Open Door Desk, placed near the Bloomsbury loop | **Campus Home:** the narrative hub, journal, bag, and recap point. | Reflection, review framing, and route selection. | This space does not represent a real UCL room, society, or service. |

### After-school activity repertoire

Each activity is an optional story wrapper around a core Academy activity. It may unlock flavour, but all linked learning remains available through **Continue learning** and Review.

| Activity | Location | Narrative reason | Core practice pattern |
| --- | --- | --- | --- |
| Notice Repair | L03 | A time, place, or request on a card is too vague. | Read, choose the clearest interpretation, then reorder or write a revision. |
| Two-Route Walk | L01, L02, L06 | Two people describe different routes to the same meeting point. | Listen or read an equivalent transcript, identify the route, and give one direction. |
| Rain Plan | L04 | An outdoor plan needs a kind, clear fallback. | Make a suggestion, ask about availability, and express a condition or reason. |
| Quiet Table Draft | L05 | A newcomer needs a message they can act on without extra questions. | Write a short plan with time, place, action, and fallback; self-review with a rubric. |
| Window Rehearsal | L07 | A character wants to practise a line before saying it out loud. | Rehearse through text, optional audio, or local-only recording; choose a retry or review. |
| Open Room Shift | L07 and unlocked locations | Several notes must agree before the afternoon begins. | Integrate listening, reading, speaking or text production, writing, and reflection. |

## Fictional Supporting Cast

These are story roles, not learner personas, real people, or avatars of classmates.

| Character | Role in the story | Language function | Support-conversation rule |
| --- | --- | --- | --- |
| Suzu Arai | Keeps the Open Door Desk's notices precise and usable. | Clarifying time, place, requests, and next steps. | Offers a short repair rehearsal; never asks the learner for personal information. |
| Leo Ward | Draws route cards and notices when directions are unclear. | Directions, confirmation, quantities, and visual-to-text matching. | Lets the learner choose a route-card phrasing or skip to the practice task. |
| Mika Chen | Plans gentle weather and schedule fallbacks for the Open Rooms Afternoon. | Invitations, preferences, conditions, reasons, and alternatives. | Frames a practical plan question; a choice changes only optional scene wording. |
| Nori Vale | Coordinates small, low-pressure activities and keeps the group welcoming. | Polite invitations, supportive replies, and recap language. | Offers an optional confidence rehearsal with no grading, bond penalty, or forced microphone. |

Character writing rules:

1. Each character has a practical relationship to the noticeboard problem, not a hidden personal mystery the learner must solve.
2. No support conversation depends on vulnerability, relationship disclosure, romance, or choosing a socially correct answer.
3. The learner can skip every conversation and receive the same practice, placement, and completion state.
4. Characters never claim to be real UCL staff, students, classmates, or representatives.

## Plot Arcs and Learning Scope

| Arc | Title | Campus movement | Language progression | Optional unlock | Never gated |
| --- | --- | --- | --- | --- | --- |
| 0 | The First Card | L01 to L07 | Placement probes and first N5 support settings. | A starter route card in the bag. | Route change, support controls, or first core task. |
| 1 | One Notice, Three Routes | L01, L02, L03 | N5 greetings, time, place, basic directions, and simple confirmation. | L02 and L03 pins plus a short Suzu recap. | Reading, listening, and kana practice from the core catalog. |
| 2 | The Rain Page | L04 and L05 | N5 invitations, likes and dislikes, plans, and simple fallback language. | A Rain Note and Mika's optional scene. | Writing and planning activities. |
| 3 | Quiet Room, Clear Request | L05 and L07 | High N5 into bridge: requests, permission, reasons, and clearer message structure. | A Quiet Table visual variation and Nori's rehearsal card. | Speaking alternatives, text rehearsal, or review. |
| 4 | Open Rooms Afternoon | L02, L04, L06, L07 | N4 conditions, purpose, repair, polite availability questions, and practical coordination. | L06 pin, Folded Route Map, and optional group recap. | The N4 task sequence, manual level choice, or accessibility modes. |
| 5 | A Map Others Can Use | Full loop | N4 summary, comparison, revisions, and a useful final plan for an imagined newcomer. | End-of-term campus panorama and journal collection. | Review queue, retakes, or direct activity navigation. |

The story has an ending for learners who want one, but learning does not end there. Finished arcs return the learner to the same campus home, with Reviews and new core content available without a narrative reset.

## Onboarding: Motivation and Placement

Onboarding is an arrival sequence, not a personality quiz. It should feel like receiving a first small notice, then choosing a workable starting route.

| Step | Campus presentation | Learning and access behavior | Local state only |
| --- | --- | --- | --- |
| 1. Arrive | L01 shows a single unpinned notice and the Open Door Desk route. | The learner may remain unnamed and proceed immediately. | Onboarding seen only. |
| 2. Choose a first reason | The notice asks what would be useful today: greet someone, find a place, make a plan, or read a notice. | This orders the first two scene wrappers; it does not infer identity, skill, or social goal. A learner can change it later. | Initial purpose as a local content preference. |
| 3. Set access before challenge | A compact Access card offers captions, audio off, reduced motion, text size, furigana, translation, keyboard, and touch settings. | Every setting remains individually adjustable; no diagnosis or explanation is requested. | Access profile. |
| 4. Receive a route card | A no-stakes adaptive placement begins from a short, clear prompt. | No timer, no microphone, and no audio-only question. The learner can stop, skip to foundation N5, or change the suggested route later. | Placement route, confidence bands, and completed probe IDs. |
| 5. Start or explore | The Desk posts one first task with its practical reason. | **Continue learning** opens the task; Campus opens the first optional scene. | Resume position and activity progress. |

### Placement design

The initial placement has at most eight required prompts and up to four confirmation prompts when evidence conflicts. It samples only actionable language skills:

1. Kana and word recognition with optional reading support.
2. Meaning selection for familiar practical vocabulary.
3. Choosing a context-appropriate reply.
4. Reading a short notice or equivalent captioned dialogue.
5. Ordering or producing a short practical sentence.

It recommends one of three routes: **foundation N5**, **N5 bridge**, or **N4 starting route**. The route label describes current material, not ability or identity. The learner can move routes at any time, retain completed practice, and set line-level support independently of the route.

Placement must not:

- Ask why the learner studies Japanese, where they are from, who they know, or what class they attend.
- Require sound, speech, a camera, a microphone, or personal data.
- Use story choices as hidden placement evidence.
- Hide the manual route switch behind a low result.
- Store raw responses remotely or use them to build a behavioural profile.

## N5 to N4 Adaptive Dialogue System

Every story dialogue is authored in semantic beats. A beat has one communicative intent, one practical situation, and level-specific variants. Variants must preserve the underlying intent and linked learning activity; they are not loose paraphrases and are never generated live from a third-party source.

### Variant rules

| Variant | Language rule | Support rule | Use |
| --- | --- | --- | --- |
| N5 | Familiar vocabulary, short clauses, one clear action, and only introduced grammar. | Furigana and translations may be independently enabled; optional romaji is an initial-route aid, never a replacement for kana. | Foundation route and first exposure. |
| Bridge | Preserves the N5 intent while introducing one tagged expansion for rehearsal. | The expansion can be isolated, replayed, or collapsed. | Learners moving from N5 toward N4. |
| N4 | More natural connected speech, a reason, condition, repair, or polite request, with all target forms explicitly tagged. | Meaning, transcript, and grammar notes remain layered rather than dumped into the scene. | N4 starting route and controlled challenge. |

### Example: one original intent, two level variants

**Intent:** confirm a meeting, ask to join, and learn what to bring.

| N5 | N4 |
| --- | --- |
| Suzu: きょう、ことばの会は ありますか。<br><br>Leo: はい。ごご 六じに、ゴードン・スクエアの ちかくで あります。<br><br>Suzu: わたしも いっても いいですか。<br><br>Leo: もちろんです。ペンを もって きて ください。 | Suzu: きょうのことばの会は、予定どおりありますか。<br><br>Leo: はい。六時からゴードン・スクエアの近くで、短い自己紹介をすることになっています。<br><br>Suzu: 参加したいのですが、何か持っていくものはありますか。<br><br>Leo: 筆記用具だけで大丈夫です。初めての人もいるので、ゆっくり話します。 |

The N4 version adds connected planning language while preserving the same task. It must not imply a different story consequence, character relationship, answer, or access level.

### Authoring checks

For each beat:

1. Assign a stable intent ID, location, speaker set, and linked core activity.
2. Give every language form a curriculum tag and a maximum supported level.
3. Write N5 first, then bridge and N4 versions from the same intent map.
4. Include a plain-language practice purpose before the first response.
5. Provide a caption and transcript representation before recording audio.
6. Review Japanese for naturalness, target-form accuracy, reading load, and original authorship.
7. Verify that hiding a support does not delete necessary task information.

## Original Items, Currency, Bonds, and Unlocks

### Currency: Margin Marks

**Margin Marks** are the only currency. A learner earns at most one per completed core activity or self-review checkpoint. They cannot be purchased, traded, lost, multiplied by a streak, or used to buy correct answers, hints, time, accessibility, grammar, level access, or review attempts.

Margin Marks unlock only optional visual or recap material. A learner who never uses them has the same learning path as a learner who collects every one.

### Bag items

| Item | Earned from | Narrative meaning | Learning effect |
| --- | --- | --- | --- |
| Folded Route Map | Completing a directions or sequencing task | A route became clear enough for another person to follow. | Optional recap of direction language. |
| Rain Note | Completing a fallback-plan task | A plan includes a kind alternative when the weather changes. | Optional sentence bank, never a required answer source. |
| Six-O'Clock Card | Confirming a time and place | A meeting point is now unambiguous. | Optional time-and-place recap. |
| Quiet Table Slip | Completing a writing self-review | A message can stand on its own. | Optional rubric reminder. |
| Blue Door Tag | Completing an arc's final reflection | The Open Door Desk has one more useful card. | Cosmetic campus-map pin only. |

### Bonds and support conversations

The relationship system is called **Study Connections**. It has a hidden-by-default, optional three-step familiarity state with each fictional cast member. It exists to surface optional support conversations and recaps, not to simulate intimacy.

- A conversation is a pre-authored practical exchange with a language purpose and a visible **Skip to practice** action.
- Choices are cosmetic or practice-order only. They cannot affect academic score, route level, currency amount, availability of content, or a character's approval.
- No conversation asks for a personal secret, relationship history, real-world name, contact information, image, recording, or social action.
- There are no romance routes, daily obligation messages, loss of bond, or guilt copy.
- Learners may hide Study Connections completely and still receive all core tasks and recap information.

### Unlock policy

| Unlock type | Trigger | What opens | What never changes |
| --- | --- | --- | --- |
| Location pin | First completion of an associated core activity | Optional campus art, one scene entry point, and a recap card. | Direct access to any linked activity or review. |
| Support note | Optional support conversation or its linked task | Short character-specific practice reminder. | Placement, score, bond obligation, or language support. |
| Bag item | One completion or reflection | Optional recall card or visual detail. | Learning attempts, answer checking, access settings, or task order. |
| Arc panorama | Arc reflection or direct completion of its core activities | Optional end-of-arc visual recap. | Future curriculum, review queue, or learner route. |

## Accessibility and Control Contract

Accessibility settings are available before placement and remain reachable from every scene and activity. They can be changed without losing progress and are stored locally.

| Need or preference | Required behavior |
| --- | --- |
| Captions | Every voiced line has accurate captions with speaker identification and meaningful non-speech cues. Captions do not disappear before the learner advances. |
| Audio off | No audio fetch, autoplay, playback requirement, or microphone prompt occurs. A text-first transcript and visual timing cue provide the complete learning equivalent. |
| Reduced motion | Disable parallax, pan, zoom, shake, particles, blinking, animated transitions, and auto-advance. Use static scene changes with clear text state. |
| Skip and recap | Every scene has **Skip scene** and **Recap** controls. Skip gives a concise written summary and opens the linked practice without penalty. |
| Reading presentation | Text size, line height, contrast, furigana density, Japanese and English support, and optional initial-route romaji are independent controls. |
| Screen reader | Use semantic headings, speaker labels, live-region restraint, labelled controls, reading-order parity, and a text route for map and location choices. |
| Keyboard and touch | Every action has visible keyboard focus, conventional keys, touch targets, and a non-drag alternative. |
| Time and interruption | No timed decision is required. Pause, leave, and resume preserve the current beat and draft where supported. |
| Speaking practice | Text rehearsal and self-assessment fully satisfy the learning outcome. Microphone recording is optional, local-only, and deletable. |
| Colour and visual state | Do not encode a task state, bond state, correction, or location solely by colour, movement, sound, or decoration. |

## Content and State Model

The story layer should extend the existing structured Academy content model rather than create a parallel unvalidated content store. It may introduce a separate story graph, but it must reference existing curriculum, activity, asset, and rights identifiers.

    type StoryLevel = 'n5' | 'bridge' | 'n4';
    type StoryChoiceEffect = 'cosmetic' | 'practice-order';

    interface StoryBeat {
        id: string;
        episodeId: string;
        locationId: string;
        intentId: string;
        linkedActivityId?: string;
        variants: readonly DialogueVariant[];
        recap: AcademyCopy;
        canSkip: true;
        rights: AssetRights;
    }

    interface DialogueVariant {
        level: StoryLevel;
        lines: readonly StoryLine[];
        grammarTags: readonly string[];
        supportAssetIds: readonly string[];
    }

    interface StoryChoice {
        id: string;
        beatId: string;
        effect: StoryChoiceEffect;
        learningPurpose: AcademyCopy;
        consequencePreview: AcademyCopy;
    }

The exact TypeScript names can change, but these invariants cannot:

1. A linked activity, when present, resolves to a valid core Academy activity.
2. All variants for one beat share its intent and practical task.
3. N5 variants do not contain grammar above their declared support level.
4. An audio line has a transcript and captions; every transcript can stand in for audio when Audio off is active.
5. Every beat is skippable and has a recap.
6. Every story choice declares a non-academic effect and may not write to mastery, placement, or entitlement state.
7. Every asset is rights-cleared before it appears in the graph.
8. No content field accepts real-person details as a narrative input.

### Local state and data lifecycle

| State | Keep locally | Retention and controls | Never collect for this feature |
| --- | --- | --- | --- |
| Placement | Suggested route, manually selected route, completed probe IDs, and non-sensitive confidence bands. | Clear or restart from Access; do not upload raw answers. | Identity, biography, class membership, contact details, or inferred traits. |
| Access profile | Chosen support toggles. | Editable at any time; clear with local Academy data. | Diagnosis, reason for a setting, or accessibility explanation. |
| Story progress | Seen beat IDs, skip state, recap availability, optional cosmetic choices, and unlocked item IDs. | Local only; deleting data removes it. | Personality profile, emotional inference, or social graph. |
| Activity progress | Existing local progress and review schedule. | Follow current local persistence and deletion behavior. | Story-derived mastery or peer comparison. |
| Optional recording | Local file reference only after explicit action. | Show delete control beside the recording; no upload by default. | Voiceprint, transcription service data, or required recording. |

## Implementation Sequence

### Now: one end-to-end vertical slice

1. Add a local access profile, route selection, story-progress shape, and deletion path before visual work.
2. Render the Campus home, persistent **Continue learning** control, Review route, Access panel, and a direct core-activity route.
3. Implement arrival motivation, no-stakes placement, manual N5/bridge/N4 route switching, and resume state.
4. Author L01 and L07, one skippable scene, one N5/bridge/N4 semantic-beat dialogue, and one linked original core activity.
5. Implement captions, audio-off, reduced motion, pause/resume, recap, keyboard/touch parity, and text-first location selection before adding optional collectibles.
6. Validate rights metadata and content-graph references in tests, then run an accessibility review of the story path and direct-learning path.

### Next: make the campus feel inhabited

1. Add L02-L06 with one purpose-built activity family each.
2. Author arcs 1-5 with their N5-to-N4 variants and controlled support assets.
3. Add Margin Marks, bag items, optional Study Connections, and visual unlocks only after they are proven non-gating.
4. Add local-only optional recording with a full text alternative and explicit deletion.

### Later: do not create pressure or privacy debt

Synchronous peer rooms, social messaging, shared progress, real-person likenesses, and cloud voice features are outside the initial Academy design. They require a separate product decision, safety review, data model, consent process, moderation plan, and accessibility plan. They must not be smuggled in through story, bonds, or a collection mechanic.

## Definition of Done for the First Campus Slice

1. A learner can complete placement and the first core activity using keyboard only, touch only, audio off, and reduced motion.
2. Every campus, scene, recap, access, and review state exposes **Continue learning** and returns the learner to an unfinished task in one action.
3. Skipping the first scene gives the learner the exact same linked activity, outcome, review scheduling, and access to later core material.
4. The N5 and N4 dialogue variants map to the same intent and task; an authoring test rejects a mismatched or unsupported variant.
5. Captions and a text-first route carry every detail required by the audio dialogue task.
6. Reduced-motion mode creates no automatic visual movement and does not hide information in a transition.
7. No core task requires a microphone, a personal name, a story choice, a bond, currency, a social action, or a timed event.
8. All story content, art, audio, and items are original or rights-cleared, with provenance present in the content graph.
9. Progress, access settings, story choices, and any optional recording remain local by default and have a clear deletion path.
10. Tests cover direct navigation, skip and recap, audio-off, reduced motion, keyboard route, level variant selection, data deletion, and rights/reference validation.

## Success Signals and Guardrails

Evaluate the slice with consent-based research, not covert engagement surveillance. Useful signals are:

- Can learners name the practical reason for the task and the language form they practised?
- Can they reach direct practice without reading the scene?
- Can an audio-off or reduced-motion route complete the same learning outcome without workaround?
- Do route switches and supports feel dignified and reversible?
- Does a learner return to campus understanding what to do next?

Do not optimise for scene completion, time spent, currency accumulation, number of choices made, or bond growth. Those are not learning outcomes and can create pressure that contradicts the world's purpose.

## Relationship to the Research Workshop

This world bible implements the Now decisions in [USER-RESEARCH.md](./USER-RESEARCH.md): the campus is the primary frame, direct learning remains one action away, accessibility is complete rather than deferred, privacy is local-first, and the story is fully original. Any future narrative expansion must be added to that feature matrix and re-evaluated before it is treated as roadmap work.
