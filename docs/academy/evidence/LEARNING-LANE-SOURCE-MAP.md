# Academy learning-lane source map

Date: 2026-07-16

This note records the exact integration state for the narrative, listening, placement, adaptive-support, and replay lane. It does not create another source registry. Runtime identity continues to come from `listening-crosswalk.v1.json`, lesson identity from the lesson-content registry, learner policy from the learner-model registry, and replay eligibility from the story replay catalog.

## Completed vertical slice

The N5 placement mock now plays the two exact Soya recordings already present in the completed listening crosswalk:

| Placement item | Listening locator | SHA-256 | Packaged URL |
| --- | --- | --- | --- |
| `n5_mock1_l_04` | `academy/content/soya/audio/jlpt_n5/n5_mock1_l_04.mp3` | `da546db7dbceaf3eafbe21f69767f2c954d831817fe3f3307c7deb24be12c664` | `/academy/content/listening/media/academy-listening-da546db7dbceaf3ea.mp3` |
| `n5_mock1_l_11` | `academy/content/soya/audio/jlpt_n5/n5_mock1_l_11.mp3` | `32c6d0a7692f3d5aec633c615f2c1b727deda0859e5f492fd3f444b56f029ac8` | `/academy/content/listening/media/academy-listening-32c6d0a7692f3d5a.mp3` |

The placement bank supplies the authored locator and expected digest. The shared resolver must return the same digest before the view exposes a native, opt-in audio control. A missing or changed mapping fails validation; it never guesses from the public Soya URL and never silently substitutes text-to-speech. Navigation stops playback, playback uses the shared lesson duck, and answers remain lookup-inert before commitment.

Placement continues to recommend the lowest supported receptive start, including Lesson 0, while `curriculum-entry-chosen` remains separate from scene and encounter evidence. Midstream starts therefore use the existing arrival bridge without auto-completing plot, relationships, or replay memories.

## Existing real-audio coverage reused by the lane

The same crosswalk already packages these exact lesson recordings. They remain owned by their current lesson plugins and task bindings; this slice does not duplicate them.

| Family | Exact packaged mappings |
| --- | --- |
| Moodle | `l1-l19-a43`, `l1-l19-a44`, `l1-l20-a45`, `l1-l21-a46`, `l2-l03-b22`, `l2-l05-b25`, `l2-l12-track-78`, `l2-l12-track-79`, `l2-l13-a11` |
| Minna | `l2-l05-minna-069`, `l2-l06-minna-072`, `l2-l07-minna-074`, `l2-l09-minna-075`, `l2-l10-minna-077` |
| Soya | the two N5 placement recordings above, plus the separately bound N5 lesson assets recorded in the crosswalk |
| Genki | media is inventoried in `media-crosswalk.v1.json`, but no Genki recording yet has the question, transcript, answer, rights, and packaged-delivery binding required by the listening crosswalk |

Fair teaching-before-testing is already enforced for reachable authored weeks by `assertAuthoredWeekPedagogy`: teaching support precedes the question, a plausible lapse must have bounded repair, and answer-bearing support stays after attempt. The optional placement mock is the explicit diagnostic exception; it states its small-sample limit and does not teach or reveal answers before commitment.

Adaptive support continues through the existing `academy-adaptive-learner-v1` plugin and persisted support-use events. The current complete beginner reply slice is the constructed-response ladder (`task-meaning` → `vocabulary-reading` → `form-scaffold`), which fades only after independent evidence. It should be extended by feeding registered lesson candidates into that plugin, not by creating a second recommendation registry.

Replay continuity continues through `STORY_REPLAY_SCENES` and `projectDailyReplayPractice`. Placement can change the curriculum start, but only completed scene/encounter evidence can create replay memories, and replay tasks cannot write canon.

## N3 source-owned arrival slice

N3 manual and accepted-placement entries now stop at one bounded source task before entering the campus. The task is not copied into an entry registry: runtime calls `createLessonThirtyTwoMinna074ListeningBeat()` and retains the existing authored-week owner `l2-l07`.

| Entry identity | Exact mapping |
| --- | --- |
| Source task | Moodle module `6974653`, byte-identical Minna 074 recording-embedded Mondai 2, five original ○/× judgements |
| Audio locator | `academy/content/minna/audio/l2-l07-minna-074.mp3` |
| Audio SHA-256 | `2a287bcef237d1e3f12929dff00f29d7c345fbe622c7ef5bb2cff6caf6b218a0` |
| Packaged URL | `/academy/content/listening/media/academy-listening-2a287bcef237d1e3.mp3` |
| Activity owner | `authored-week:l2-l07` / `activity:l2-l07-sensei-minna-074-true-false` |
| Answer gate | transcript, canonical marks, and repair remain after the first attempt |

The existing `academy-adaptive-learner-v1` plugin chooses the arrival mode from canonical learner events. Manual entry with no listening evidence receives task-format teaching before commitment; an accepted N3 placement can take the independent test-out route; listening repair debt selects focused repair; one independent pass moves a revisit to independent consolidation. Supported guided passes do not masquerade as independent evidence. Each attempt records normal authored-week evidence plus one `learning-evidence-recorded` event using the exact source id. It never records a scene, encounter, bond, or replay memory, so changing level changes support without erasing or fabricating plot.

This slice claims exact Moodle/Minna audio only. It does not claim that a Genki recording owns this task, and it does not attach an unrelated Soya track. Soya remains exact where the completed placement mapping exists; Genki remains inventory-only until a task-level audio binding is reviewed and packaged.

## Remaining exact-source mappings

These are concrete gaps, not permission to infer a match:

| Lane | Exact remaining work |
| --- | --- |
| N4 placement audio | Bind `n4_mock1_l_07` (`27b602fbade55bf2c1713da903033945f02e8bacc3bebcc5cdca59c836e8240a`) and `n4_mock1_l_10` (`cc15af016afaa7a481b41f86d550f6e68cc220d58b96cbe43d7601a6cd676a52`) to reviewed crosswalk entries and packaged delivery. Until then, exact-text browser speech is labelled honestly. |
| N3 placement audio | Bind `mock1_l_05` (`75d494710c9fe11243553ce71a8f30fa7395c456a0b014636ef89054c42e11f6`) and `mock1_l_10` (`07a2a5a708f5a6ea42e435d8df261fbca7f00e7ffe3cab587a450b177583c4c3`). |
| N2 placement audio | Bind `n2_m1_listening_point_3_1` (`2cac29860f4894536fa855d2714c0a04e77ae96fc0a49977fc5f901e180062da`) and `n2_m1_listening_summary_3_1` (`1490d0b5f287864b014fed4ea26e5ad4c10ef702658e5c527943340976ee4d4b`). |
| N1 placement audio | Both current items are source-text-only. Find and review the exact recordings or keep them labelled browser speech; do not attach a merely similar JLPT track. |
| Genki audio | Select learner-facing Genki listening questions from the existing media inventory, then add exact question locus, transcript, answer, rights, byte digest, and delivery evidence before any runtime locator. Inventory membership alone is insufficient. |
| Moodle/Minna expansion | Continue one task binding at a time. Each must retain its worksheet/support before assessment, deterministic grading, post-attempt transcript/hints, and byte-identical recording. |
| Adaptive runtime | Extend the N3 arrival pattern to other bands only after each band has a real owned task. Project the owned task into `LearningCandidate`s, persist normal activity/learning/support evidence, and do not create a parallel adaptive-progress object. |
| Story runway | Add replay definitions only when each N5/N4/N3/N2/N1 scene has an authored completion scene, concept/activity evidence, and a higher-language replay layer. Current opening-arc and N3 entries do not prove a complete N1 runway. |
| Accessible story/audio events | For every later scene, bind semantic audio/captions to an authored event, keep the event reachable from chronological journal/replay after placement, and prove keyboard, touch, reduced-motion, mute, pause, and disposal behavior. |

## Acceptance evidence

- `tests/academy/placement.test.ts`: exact digest/URL resolution, source-recording controls, labelled browser-speech fallback, start recommendation, and story-preservation copy.
- `tests/academy/listening-crosswalk.test.ts`: packaged locator identity and source-byte metadata.
- `tests/academy/story-runtime.test.ts`, `story-runner.test.ts`, and `story-replay-projection.test.ts`: placement chronology and canon-neutral replay.
- `tests/academy/lesson-pedagogy-conformance.test.ts`, `constructed-response.test.ts`, and `adaptive-learner-model.test.ts`: teaching gate, bounded progressive hints, evidence-driven fading, and one registered learner-model plugin.
- Live Vite browser flow on 2026-07-16: selected N5, advanced with the visible placement controls, and verified both native source-audio controls at 1440×900 and 390×844. Both controls were keyboard-visible, opt-in (`autoplay=false`), labelled, within the viewport, and resolved to the packaged URLs and SHA-256 identities above. The flow produced no console errors and no Axe WCAG A/AA violations. N5 exposed no browser-speech control; the N4 flow retained the explicitly labelled browser-speech delivery.
- Live Vite N3 arrival flow on 2026-07-16: rendered the real guided arrival, completed all five visible Minna 074 ○/× judgements, and used the completion control at 1440×900 and 390×844. Both viewports verified the packaged URL and fetched-byte SHA-256, keyboard-focusable opt-in audio (`autoplay=false`, `preload=metadata`), no browser-speech control, hidden pre-attempt transcript, post-attempt support, clean audio lifecycle, no horizontal clipping, no console errors/warnings, and no Axe WCAG A/AA violations. Persistence tests separately prove that completion writes no scene or encounter evidence.
