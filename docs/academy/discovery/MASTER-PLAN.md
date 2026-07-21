# Yomu Academy: Canonical Day-by-Day Delivery Plan

## Objective

Deliver the complete Yomu game as 48 chronological, production-complete Academy days from first contact with Japanese through N1 graduation, followed by a persistent postgame. Each day is a vertical game release: story creates the need, lessons provide the language, practice proves it, the world responds, and SRS carries it forward.

This file replaces the former horizontal master plan. `docs/academy/BACKLOG.md` remains the requirements and proof-gate authority. This plan is the sole execution order.

## Delivery rules

1. One owner, one delivery tree, one active task.
2. Finish a real user journey before expanding volume.
3. Never count authored, generated, staged, or tested-in-isolation work as integrated.
4. Never close a day with missing required dialogue, silent required audio, placeholder cast, broken responsive states, unreachable lessons, or unpersisted outcomes.
5. A learner may stop at any clean boundary. A canonical day can span several real sessions without guilt, streak pressure, or lost state.
6. Required learning stays bounded and clear; optional depth can be large. The interface presents one dominant next action.
7. Story, curriculum, world, SRS, art, audio, games, wiki, Reader integrations, and account state use canonical registries rather than parallel progress systems.
8. Generated assets and audio receive a runtime home in the same task that creates them.
9. Every task ends with focused tests and a real phone and desktop journey. Every completed day is committed and released before the next day starts.
10. The 48-chapter ending remains finite. Infinite study, NG+, recurring events, and alumni stories begin after graduation without reopening the central plot.

## Progress ledger

Overall completion is derived from a 1,000-point ledger, never estimated from file counts.

| Programme | Points | Closure rule |
| --- | ---: | --- |
| Shared delivery core | 100 | Ten shared contracts below, each independently proven in production |
| Canonical Days 1-48 | 720 | 15 points per day, using the day closure contract |
| Persistent world and postgame | 80 | Eight 10-point systems, all reachable after their intended unlock |
| Global parity | 60 | Sources, curriculum, voice, art, games, music/SFX, integrations, and wiki reconcile exactly |
| Final release | 40 | Full build, device journeys, deployment, rollback, trailer, and showcase |
| **Total** | **1,000** | Overall percentage = closed points / 10 |

### Day closure contract: 15 points

| Gate | Points | Required evidence |
| --- | ---: | --- |
| Story and natural dialogue | 2.0 | Chapter is chronological, human, character-specific, visually staged, and causally changed by the learner's action |
| Curriculum and N+1 learning | 3.0 | All day units have purpose, prerequisites, input, guided attempt, independent production, transfer, repair, and stop points |
| Evidence and SRS | 1.0 | Outcomes, exact mistakes, due items, delayed recall, test-out, and return state use the canonical learner record |
| World, interaction, and game | 1.5 | Places, props, hotspots, NPC talk, and the day's game are meaningful, accessible, and stateful |
| Cast and relationship | 1.0 | Required people have correct identity, art, voice, dialogue, optional talk, and bond/continuity consequences |
| Art and animation | 1.5 | Every visible surface has accepted responsive art or an intentional treatment, plus motion and reduced-motion parity |
| Voice, music, and SFX | 1.5 | Every required speakable line is locked, rendered, encoded, bound, captioned, and playback-tested; music/SFX are intentional |
| UX, accessibility, and responsive layout | 1.0 | Mobile-first and excellent desktop layout, one primary action, no overlap, keyboard/touch/screen-reader parity |
| Persistence, offline, and performance | 1.0 | Resume, reload, disposal, cache failure, low-power mode, and long-session behavior pass |
| Wiki and player-facing records | 0.5 | People, places, concepts, chapter, media, and discovered lore update without spoilers |
| Browser journey and release proof | 1.0 | Real route passes on phone and desktop, focused suite is green, commit is released, live smoke matches |

## Shared delivery core: execute once, harden through every day

| Order | Task | Backlog homes | Done when |
| ---: | --- | --- | --- |
| A01 | Consolidate all useful Academy branches and partial work into the E2E tree; archive superseded art; remove obsolete Academy worktrees | `GOV-002`, `OPS-001` | One clean tree contains every retained implementation and no nested or competing runtime |
| A02 | Generate the 1,000-point progress ledger and task status from this plan plus canonical runtime evidence | `GOV-001`, `MET-001` | Percentages are reproducible and stale claims fail CI |
| A03 | Freeze canonical IDs and deep interfaces for days, lessons, activities, scenes, learner events, media, cast, places, games, wiki, and release assets | `STO-002`, `OPS-002` | A feature cannot ship through an alternate registry or test-only route |
| A04 | Complete account, class access, payment, refresh/resume, sync, export/delete, offline merge, and privacy-safe class operations | `PLAT-001` to `PLAT-005` | Day 1 works anonymously by invite and through a durable linked account across devices |
| A05 | Reconcile the complete class-course and Japanese-library source tree and map it into the 224-unit curriculum without treating a planner count as completion | `CUR-004`, `CUR-005`, `CUR-013`, `CUR-014` | Every discovered unit has an intentional curriculum home or an explicit production task |
| A06 | Complete deterministic per-slice voice production: census, line lock, cast/model/style assignment, pitch/pause direction, render, QA, Opus, runtime, captions, cache, and stale invalidation | `AUD-001` to `AUD-008` | Any day can close its exact speakable denominator without waiting for a global batch |
| A07 | Complete deterministic art production: cast families, expressions, scenes, props, crops, animation hooks, grader, runtime binding, offline variants, and superseded archive | `ART-001` to `ART-007` | Any day can close its exact visual denominator with no unassigned production asset |
| A08 | Stabilise the world/VN/lesson shell around living paper and bold game composition: no dashboard-card layouts, theme accent tokens, responsive layers, focus and disposal | `VIS-001` to `VIS-003`, `WORLD-001` | The same route is coherent on phone, tablet, desktop, keyboard, touch, and reduced motion |
| A09 | Make the real browser harness cover empty profile, return profile, every activity boundary, visual overflow, accessibility, memory, CPU, offline, and deployment smoke | `QA-001` to `QA-006` | A completed day cannot regress silently |
| A10 | Make build, CI, docs, Worker/R2/D1, changelog, release, rollback, trailer capture, and Remotion data deterministic | `REL-001` to `REL-005`, `OPS-003` | A green local day can be released and verified without manual reconstruction |

## Standard task order for every canonical day

For Day `NN`, complete these tasks in order. Only one is active at a time.

1. `DNN-01 Contract`: freeze the chapter, time/place, learner purpose, N+1 assumptions, required units, cast, props, callbacks, and clean stopping points.
2. `DNN-02 Sources`: bind every required source/material/audio occurrence and identify original bridging content.
3. `DNN-03 Lessons`: author the day's four or five curriculum units and their explanations, examples, practice, production, transfer, and test-out.
4. `DNN-04 Story`: rewrite and stage the chapter around those actions using natural dialogue and visible behavior.
5. `DNN-05 Evidence`: bind grading, repair, SRS, delayed retrieval, progress, relationship, world, and return consequences.
6. `DNN-06 World`: build the arrival, travel, props, one-off interactions, NPC talk, day game, and changed revisit.
7. `DNN-07 Cast`: complete every required portrait/sprite/expression, voice card, line, optional talk, and bond/continuity beat.
8. `DNN-08 Art`: accept or create backgrounds, event CGs, props, worksheet reconstruction, responsive crops, and animation states; bind them immediately.
9. `DNN-09 Audio`: census and lock every required line, render voices, bind source listening, music, ambience, SFX, captions, replay, and shadow controls.
10. `DNN-10 UX`: compose the day as a game, not a dashboard; finish living-paper learning surfaces, accent tokens, mobile controls, desktop framing, accessibility, and reduced motion.
11. `DNN-11 Wiki`: publish spoiler-aware people, place, concept, object, media, and chapter entries discovered that day.
12. `DNN-12 Verify and release`: play from the prior day's save through the next day's save on phone and desktop, run focused and release checks, commit, push, deploy, and record ledger points.

## Day 1 detailed queue: Welcome, First Sound, First Evening

Day 1 is the current active vertical release. It closes the welcome, onboarding, first class, first story chapter, and evening return as one journey.

| Order | Task | Output |
| ---: | --- | --- |
| D01-01 | Freeze the complete Day 1 route from invite/account entry to the evening save | One route graph with no dead ends, duplicate onboarding, or unexplained teleport |
| D01-02 | Map Lesson 0, classroom expressions, all matching handouts/audio, and the exact zero-Japanese assumptions | Day 1 source and original-content map |
| D01-03 | Complete invite, sign-in/link, refresh, profile isolation, name, private motivation, protagonist choice, and resume | Durable identity and no forced account wall before the promised path |
| D01-04 | Rebuild the rainy blue-hour arrival with correct location art, Rie entrance, subtle motion, music, ambience, door interaction, and one clear action | Final-quality opening minute |
| D01-05 | Humanise onboarding as dialogue with Rie; explain why sound and kana matter without lecture prose | Natural introduction, immediate trust, learner agency |
| D01-06 | Complete the first-sound route: five vowels/mora, script relationship, recognition, listening, handwriting, speaking, name transfer, and confusable repair | Zero-to-first-use mini-course with no hidden romaji dependency |
| D01-07 | Complete the fourteen classroom expressions as useful actions inside the room | Learner can follow, ask for repetition, check understanding, and continue |
| D01-08 | Complete Chapter 1, `The Blank Atlas`, around the learner's first repaired contribution | Need -> input -> lesson -> repair -> transfer -> consequence -> return |
| D01-09 | Put the Day 1 ensemble visibly in class with correct portraits, expressions, introductions, optional one-off talk, and first relationship evidence | No silhouettes or name-only placeholders for required Day 1 cast |
| D01-10 | Complete courtyard, entrance, classroom, library threshold, journal, and train/home transition with purposeful travel and revisit changes | A small coherent world, not disconnected screens |
| D01-11 | Ship the Day 1 games: sound gate, vowel listening bingo, first kana trace, name card, classroom-command response, and living worksheet | Six distinct mechanics with repair and SRS consequences |
| D01-12 | Seed the canonical SRS from real attempts and show a humane first review plus a clean stopping point | Exact due items, no grind, no false mastery |
| D01-13 | Finish every Day 1 visual asset and animation: cast, backgrounds, notebook, blackboard, paperclip, bell, props, transitions, portraits, crops, and reduced motion | Zero broken, ugly, missing, uncanny, or overlapping Day 1 imagery |
| D01-14 | Finish every Day 1 audio surface: cast lines, narrator only where needed, UI instructions, worksheet/game prompts, source listening, pronunciation models, music, ambience, and SFX | Exact Day 1 audio census at 100 percent bound and playback-tested |
| D01-15 | Replace remaining card/dashboard composition with living-paper and full-scene game layouts using the learner's accent within the palette | Cohesive mobile and desktop visual language |
| D01-16 | Build Day 1 wiki entries for Rie, learner identity, classmates met, Academy, courtyard, classroom, Blank Atlas, kana, mora, pitch, and classroom phrases | Discoveries unlock in context without spoilers |
| D01-17 | Build the evening close: recap by dialogue and imagery, first bond invitation, first no-guilt review choice, Day 2 hook, and Twilight Hour foreshadowing | Satisfying stop with an earned open loop |
| D01-18 | Verify annotations, pitch lines, furigana, ImmersionKit examples, kanji graph entry points, Doodle, Reader return, audio replay, captions, and offline behavior | Yomu integrations feel native rather than bolted on |
| D01-19 | Profile and fix phone/tablet/desktop layout, CPU, memory, media disposal, loading, cache, touch targets, keyboard, screen reader, and reduced motion | Day 1 remains cool, responsive, legible, and stable |
| D01-20 | Run the complete Day 1 journey from clean storage and returning saves, commit, push, deploy, smoke live, and award its 15 ledger points | Day 1 production complete |

## Canonical day map and feature rollout

The target curriculum contains at least 224 small, validated lesson units: 40 Foundation/N5 units in Days 1-8, 64 N4 units in Days 9-24, 30 N3 units in Days 25-30, 45 N2 units in Days 31-39, and 45 N1 units in Days 40-48. A day presents one core thread and optional depth; it never forces a long sitting.

| Day | Chapter | Learning reservoir or new family | First-class world/game/system work |
| ---: | --- | --- | --- |
| 1 | The Blank Atlas | Foundation 00 and classroom expressions | Welcome, first sound, onboarding, SRS, journal, wiki |
| 2 | Map in the Margins | `l1-l01` to `l1-l02` | Identity, useful objects, kana labels, margin-map interaction |
| 3 | Route Zero | `l1-l03` to `l1-l04` | Origin versus location, campus map, route-giving |
| 4 | The Welcome Frequency | `l1-l05` to `l1-l06` | Possession, requests, classroom object hunt, class board |
| 5 | Final Boss: One Small Card | `l1-l07` | Translation-off recognition, kana game suite, handwritten postbox |
| 6 | The Invitation Chain | `l1-l08` to `l1-l09` | Time, opening, invitation, calendar and message chain |
| 7 | No Spoilers Beyond This Curtain | `l1-l10` to `l1-l11` | Day/place description, journal replay, spoiler-safe wiki |
| 8 | The Menu Without Pictures | `l1-l12` | Likes, preferences, cafe tray, menu listening and ordering |
| 9 | The Story in Two Tenses | `l1-l13` to `l1-l14` | Ability, understanding, reasons, first speaking lab |
| 10 | Instructions for a Cloud | `l1-l15` | Sequencing, gathering plan, living worksheet conversion |
| 11 | The Storm Route Variant | `l1-l16` | Location and rerouting, weather, station listening-map courier |
| 12 | The Vanishing Course | `l1-l17` to `l1-l18` | Existence/counting, service failure, Tartarus memory-palace prologue |
| 13 | Dinner by If | `l1-l19` to `l1-l20` | Frequency/duration/comparison, Twilight Hour calibration unlock |
| 14 | Two Answers, One Context | `l1-l21` | Particle/context courtroom and evidence notebook |
| 15 | The Chorus With a Hole | `l1-l22` to `l1-l26` | Katakana mastery, rhythm lane, shop and sound/shape repair |
| 16 | The Night the Map Went Dark | `l2-l01` to `l2-l04` | Then/now/opinion, Velvet Hour social teach-back unlock |
| 17 | The Catwalk Clue | `l2-l05` to `l2-l08` | Invitation, reported speech, agreement, relative-clause NPC search |
| 18 | The Memory Card Museum | `l2-l09` to `l2-l11` | Wanted programme, button condition, museum memory objects |
| 19 | Seventy Percent Is a Door | `l2-l12` to `l2-l15` | Simultaneous action, layered reasons, environmental evidence |
| 20 | A Map Made From Memory | `l2-l16` to `l2-l18` | Preparation, sequence, ellipsis, planning-board game |
| 21 | Questions in the Dark | `l2-l19` to `l2-l22` | Intention, forecast, teach-back, first full bond appointment |
| 22 | The Blank Space on the Board | `l2-l23` to `l2-l25` | Kanji message, advice with refusal, Doodle and kanji graph |
| 23 | The Farewell Rehearsal | `l2-l26` to `l2-l30` | Message handoff, models, means/absence, conditional revision |
| 24 | When the Lanterns Return | `l2-l31` to `l2-l34` | Exhibition, health/menu/plan synthesis, three signature systems converge |
| 25 | After the Applause | N3 reported speech and implication | Subtitle desk, source listening, bounded retell |
| 26 | A Caption Without an Owner | N3 paraphrase | Caption repair, permission-sensitive class chat |
| 27 | The Helpful Rewrite | N3 register-preserving edit | Register wardrobe, rewrite rationale, transfer writing |
| 28 | Terms of Invitation | N3 softened conditions and refusal | Event invitation negotiation, speak-now encounter |
| 29 | The Chair Is Not Reserved | N3 role negotiation | Populated Velvet Hour, optional NPC roles, boundary language |
| 30 | Two Schedules, One Promise | N3 conflicting plans | Schedule comparison, phone reconstruction, calendar repair |
| 31 | Under the Subtitle | N2 quotation and translation choice | Translation Mirror, source annotation, subtitle study |
| 32 | The Right Screen, the Wrong Draft | N2 evidentiality | Observation/hearsay/inference game, version-control prop |
| 33 | What We Can Say | N2 hedging and calibrated claims | Evidence map, claim-strength listening, wiki source notes |
| 34 | The Empty Microphone | N2 formal event language | Microphone rehearsal, role cards, live speaking repair |
| 35 | Names in the Margin | N2 source comparison | Mystery evidence room, attribution graph, bounded summary |
| 36 | The Permission Page | N2 permission scope | Permission writing, consent-aware world state, season resolution |
| 37 | The Return Address | N2/N1 correspondence | Post office, audience-aware email, omission detection |
| 38 | A Map of Claims | N2/N1 source certainty | Three-row evidence-map production and delayed transfer |
| 39 | The Polite No | N2/N1 formal refusal | Office keigo, refusal ladder, role-sensitive voice performance |
| 40 | Three True Versions | N1 compatible perspectives | Account synthesis, contrast and inference, multi-voice listening |
| 41 | What Was Left Unsaid | N1 omission and implication | Anticipation Booth, silence as evidence, no-overclaim writing |
| 42 | The Open Question | N1 counterfactual and argument framing | False-premise challenge, public-question rehearsal |
| 43 | The Journey Not Everyone Takes | N1 non-equivalent futures | Future-plan comparison, alumni map, spontaneous response |
| 44 | The Last Revision | N1 editing rationale | Scriptorium, portfolio revision, public-use justification |
| 45 | Rehearsal for Leaving | N1 extended production | Shadow duet, speech rehearsal, relationship futures |
| 46 | The Public Japanese Evening | Integrated N1 inquiry | Live listening repair, mediation, audience questions |
| 47 | The Atlas Closes | Integrated N1 synthesis | Source explanation, disagreement mediation, finite closure |
| 48 | The Next Page | N1 graduation composition | Final contribution, graduation, NG+ and alumni-world unlock |

## Persistent world and postgame: 80 points

| Order | Task | Unlock |
| ---: | --- | --- |
| P01 | Complete Tartarus as the deterministic 3D/2D memory palace, with stable loci, classmates, retrieval, repair, transfer, mobile controls, and performance limits | Prologue Day 12, full tower after Day 48 |
| P02 | Complete Velvet Hour as rare altered-world social consolidation with teach-back, classmate contrast, exact feedback, bonds, and next-day consequences | Day 16, expanded Days 29 and 45 |
| P03 | Complete Twilight Hour as quiet calibration with predictions, committed answers, error mechanisms, repair choice, and delayed calibration | Day 13, recurring thereafter |
| P04 | Complete NG+ with higher language layers, reduced supports, alternate production demands, perspective replay, and no new canon facts | Graduation |
| P05 | Complete Immersion Hall and Tadoku shelves with i+1 coverage, audio where available, Reader/Watch handoff, mining, and SRS return | Progressive, permanent after graduation |
| P06 | Complete recurring JLPT seasons, full mocks, score history, targeted repair, and speaking/writing production companions | Checkpoints across all bands |
| P07 | Complete alumni calendar, seasonal world states, bounded storylets, birthdays, trips, group updates, and no-guilt returns | Graduation |
| P08 | Complete endless evidence-driven daily routes from due SRS, weak skills, learner energy, immersion, writing, shadowing, and world encounters | Graduation |

## Global parity: 60 points

1. `G01 Sources`: every class-course and library unit is reconciled and mapped; no stale `73` count represents completion.
2. `G02 Curriculum`: all 224+ units are registered, reachable, N+1 ordered, four-skill balanced, and extend through N1 and post-N1 domains.
3. `G03 Voice`: every required speakable surface across days, bonds, textbook cast, UI, games, worksheets, SRS, NPCs, and accessibility is rendered and bound with zero missing or stale rows.
4. `G04 Art`: every required character, expression, place, prop, event CG, worksheet, map, game, crop, and offline state is accepted and bound; superseded art is archived outside runtime.
5. `G05 Games`: all named mechanics in `GAM-001` to `GAM-012` are genuinely distinct, integrated, accessible, and evidence-producing.
6. `G06 Integrations`: Yomu Reader, Watch, ImmersionKit, kanji graphs, pitch, furigana, Doodle, mining, OCR, subtitles, dictionaries, SRS, wiki, music, and Shinday-style SFX are extended and coherent.

## Final release: 40 points

1. `R01`: run typecheck, all tests, validators, builds, dead-code/complexity, visual journeys, accessibility, performance, offline, long-session, and security checks.
2. `R02`: fix every release blocker and repeat the complete matrix from a clean checkout.
3. `R03`: deploy Worker, R2, D1, Pages, Academy, Reader, and extension assets; verify account, invite, payment, sync, audio range, offline, and rollback live.
4. `R04`: produce the Steam-style gameplay trailer and separate deterministic Remotion showcase from real shipped journeys, then publish the final release and wiki.

## Current execution pointer

1. Finish and verify the in-progress story/audio consolidation merge under `A01`.
2. Import the retained N3, platform, workflow, cast-art, scene-art, and grader work into the same tree.
3. Remove obsolete Academy worktrees after their retained commits are present here.
4. Implement `A02`, then execute `D01-01` through `D01-20` without opening Day 2 work.
