# Yomu Academy production backlog

This is the ordered execution backlog for [`discovery/PRODUCTION-RUNBOOK.md`](discovery/PRODUCTION-RUNBOOK.md). A checkbox closes only with code, tests, browser evidence where applicable, and updated living files.

## Current delivery queue

This queue is the release scheduler. Work below it remains required, but these items are integrated first.

| Priority | Channel | Current deliverable | State |
| --- | --- | --- | --- |
| P0 | Release | Mandatory linked account in production; explicit localhost QA bypass | Shipped `735336f27`, `522452c10` |
| P0 | Golden path | Prove entry -> lesson -> repair/SRS -> story return -> journal/world continuation on desktop and phone | Green through a repaired `l1-l01` attempt, exact SRS card, Stasi memory, classroom return, and visible journal line |
| P0 | Motivation | Carry meaningful goals, competence feedback, narrative anticipation, relationship/world rewards, return cues, and clean endings across the whole loop | Daily route plus the first lesson-repair-memory slice shipped; cross-surface pass continues |
| P0 | Curriculum | Ground and expose the next source-faithful lesson slice | Integrated: exact Chapter 36 homework matches |
| P0 | Activities/audio | Add the next taught-first, hinted, gradable multimodal activity with evidence/SRS | Integrated: Lesson 0 vowel dictation |
| P0 | Story/world/cast | Make the next first-path encounter and journal unlock distinct and reachable | Integrated: library encounter continuity |
| P0 | Assets | Replace deprecated/missing art and connect unique world scenes | Integrated: Rie glasses family + 18 place pairs |
| P1 | Production proof | Google sign-in, refresh/resume, phone layout, online assets, and route return | Queued behind golden path |
| P1 | Expansion | Continue source integration, story, minigames, quizzes, flashcards, listening, and cast arcs through N1 | Continuous after each proven slice |

### Immediate release sequence

This is the short operational order inside the queue above. The detailed catalogue below remains the complete scope.

- [x] Recover the interrupted Claude story/voice/art sessions, preserve private transcript archives with hashes, and record their exact finished and unfinished outputs.
- [x] Recover, validate, compile, and list all 48 four-season story chapters; later chapters remain playable while unregistered practice is labelled honestly.
- [x] Restore the deterministic desktop/phone Browser gate through onboarding, world navigation, Lesson 0, Study, placement, the finite journal, Class, the `l1-l01` source sheet, and its teaching-first seam; self-confirm furigana persistence and remove the journal's duplicated Replay overflow.
- [x] Prove the real learner golden path in Browser: onboarding → `l1-l01` teaching → committed lapse → earned repair hint → canonical due SRS card → independent correction → inline story memory → classroom return → visible journal line on desktop and phone; the finite journal and furigana checks remain green.
- [x] Persist authored-week teaching/activity position so leaving after a saved attempt resumes at that activity instead of replaying all lesson notes.
- [x] Integrate Moodle Lesson 10 as canonical `l3plus-l10`, including its handouts, listening, homework, runtime route, source ledger, and focused reachability tests.
- [ ] Verify Lessons 1-10 source, handout, listening, homework, and runtime coverage against the Moodle inventory as one release audit.
- [ ] Finish N3-N1 lesson packages and bind every Season 3-4 practice hook to a real lesson, varied activity, deterministic evidence, and SRS consequence.
- [ ] Complete the voice roster for all Academy and textbook characters plus narrator/UI/worksheet/minigame lines; naturalness-lock each line before pitch-reviewed Aivis rendering and runtime binding.
- [ ] Reconcile every existing image with the forthcoming grader JSON, bind provisionally approved candidates, fill only verified scene gaps, and retain rejected/replaced candidates as review history.
- [x] Wire the deterministic daily learning route and warm return arc into the live Course route from the world; connect due SRS, grounded lessons, relationships, place discovery, visible diegetic payoffs, and one dominant next action without grind rewards.
- [x] Make Yomu's scheduler queue authoritative for due repair and advance Course/daily recommendations from the learner's selected-band floor and completed class-week evidence, including Lesson 10 → Kanji 7.
- [x] Complete the learner-motivation pass for the daily route: one clear start, competence cue, warm return without loss, the learner's own reason, relationship/world payoff, and a clean stopping point.
- [x] Ship the first cross-surface psychological slice: recognize a repaired answer as competence, retain both attempts, schedule the exact repair, turn it into one natural Stasi memory, make that memory visible after returning through the world, and stop repeating the full story header above every assessed question.
- [ ] Apply the psychological-elements pass across lesson, repair, SRS, story, world, and journal: meaningful learner goals, immediate competence feedback, open-loop narrative anticipation, earned relationship/world payoffs, memorable return cues, and satisfying stopping points. Use adapted IRAE as Intrigue → Rapport → Attraction to the story/learning → Empowerment, with escalating trust and anticipation resolving into learner competence and agency rather than dependency.
- [ ] Feed verified Reader/Watch evidence into that route and mirror its concise continuation prompt in the world and journal.
- [ ] Finish the line-by-line tone, chronological n+1, asset, and lesson-seam pass across all 48 chapters, then run full desktop/mobile real-user QA and release from the main checkout.

## Stage 0 — clean base

- [x] Fast-forward `main` to current `origin/main` without losing active Reader work.
- [x] Copy all 18 discovery files to `docs/academy/discovery/`.
- [x] Create shallow local clones of the six pinned reference engines and verify exact commits.
- [x] Generate a lossless inventory for Donor A, Donor B, and 14 dormant worktrees.
- [x] Classify every donor/worktree payload in `SALVAGE-LEDGER.md`.
- [x] Run the full project check and record exact output.
- [x] Commit and push Stage 0 artifacts without including protected Reader work (`055bb4eca`).

Acceptance: `main` equals fetched upstream before Academy commits; donor trees are unchanged; discovery, pins, inventories, living files, and initial resource/asset ledgers are reproducible.

## Stage 1 — enrollment vertical slice

- [x] Add a separate Academy Vite entry and route without increasing the readable userscript bundle with curriculum/art payloads.
- [x] Establish deep interfaces for source library, activity runtime, scene runtime, learner event log, media runtime, and Yomu bridge.
- [x] Port an abortable scene lifecycle, map navigation model, journal/bonds read model, responsive contract, PWA shell, accessibility harness, SRS adapter, and two-way Doodle card in verified slices.
- [x] Implement invite-code entry and a local development session adapter; keep production access behind the Cloudflare interface.
- [x] Implement Rie's fiction note, name/reason capture, and the four approved protagonist choices.
- [x] Implement three starts: Lesson 0, manual N5–N1 band, or optional evidence-based mock recommendation.
- [x] Implement plot-preserving midstream bridges with separate curriculum and story state.
- [x] Implement campus, three lesson forks, one faithful source activity, precise repair, Yomu review event, Aakash unlock, journal replay, audio state, save/reload, and offline resume.
- [x] Add English and Japanese copy to the canonical translation surface and prove Japanese mode contains no `未翻訳`.
- [x] Run unit/conformance checks and real-app desktop/phone Browser acceptance after annotations inject.

Acceptance: the full [`discovery/VERTICAL-SLICE.md`](discovery/VERTICAL-SLICE.md) script works at 320px and desktop with one clear action, approved art, intentional audio, stable annotations, and persistent evidence.

Closure: source `371140513`, hosted assets `c5ef4629d`, release-candidate record `5f759ee5f`, Pages run `29203203144`, and live revision `s1-bbf9a61f26a3` are green. See [`evidence/stage-1/README.md`](evidence/stage-1/README.md).

## P0 direction correction — before further volume

The Stage 1 closure above remains valid engineering evidence, but user acceptance reopened the product slice. [`DIRECTION-RESET.md`](DIRECTION-RESET.md) is now binding.

- [x] Freeze concurrent implementation and the 42 GB census at resumable boundaries.
- [x] Reconstruct the product direction from all feedback, Donor A's stronger lesson structure, the real opening source, Yomu workflows, and the original runbook.
- [x] Generate and record concept boards for the complete first class, VN/source flow, expanded world map, and 42 GB content journey.
- [x] Receive two low-effort Fable architecture/usability reviews and bind the accepted one-route, Course-view, grounded-lesson, living-paper, and usability corrections.
- [x] Make learner writes resolve a complete lesson from shipped bytes: typed registry entry, pinned lesson ID/revision/SHA-256, full grounding audit, playable lesson/activity check, source scope, and canonical review allow-list.
- [x] Resolve grading, instruction, prerequisite, repair, review, and surface-audit references through one definition registry; reject dangling definitions, divergent review identities, and self-asserted answer-concealment claims.
- [x] Make concealment evidence executable and renderer-bound: exact renderer ID/revision/SHA/source, content-derived answer corpus, pure stored-DOM replay, stale/tamper/entity checks, and fail-closed opaque surfaces.
- [x] Derive all delivery states for the original 73-stop baseline from the lesson audit: orientation review-blocked, 72 planning-only, zero grounded-playable.
- [x] Make Source Question denominators obey the same current-route rule: 1 audited, 1 implemented, 0 learner-reachable grounded-playable.
- [x] Classify and sanitize every legacy ungrounded activity route from current navigation and Back history; remove known legacy provenance, retain reviewed cards with an audit tag, and append-only neutralize their former Academy schedules without deleting Study history.
- [x] Mount the canonical Reader Study surface inside Academy with living-paper tokens, a real 15-minute countdown, Pause, and route-history Back.
- [ ] Complete Slice 1: persisted Back history, equal Story/Course presentation hosts, one stable `…` menu, and no dead/duplicate navigation.
- [ ] Complete Slice 2: collapsed Class spine → Lesson 0 overview → focused activities → repair/return, with no pre-commit answer in the DOM.
- [ ] Complete Slice 3: one curated library shelf using the existing Yomu video/subtitle player plus one source-PDF view.
- [ ] Author the complete 60–90 minute Lesson 0: greetings, sound/script, the fourteen-expression survival handout, first sentence frame, useful vocabulary, real listening/reading, matched writing/speaking, transfer, and close.
- [ ] Make Sound, Text, and Speaking distinct first missions with different early cast/place, activity balance, story result, and adaptive evidence.
- [ ] Replace the current giveaway choice and unrelated `一` route with one production-quality ten-minute proof drawn from the complete lesson.
- [ ] Replace centred card pages with full-bleed VN scenes, visible speaker sprites, literal source objects, reactive expressions, and concise living-paper dialogue.
- [x] Implement reversible native navigation: Japanese signs/doors/paths, compact minimap, `…` safety menu, change lesson, revisit, and end day.
- [ ] Prove complete annotation/compound support, real paired audio, skill-matched production, repair/return, and no English answer leakage in the actual app at phone/tablet/desktop sizes.
- [x] Replace the Text route's giveaway card with the first full-bleed VN/source-paper/IME/repair slice and prove it at 390×844 and 1440×900 after Yomu injection.
- [x] Make Rie and Aakash break the journal paper edge as transparent sprites; keep preview likenesses release-blocked in the asset ledger.
- [x] Replace the following Aakash direction card with a sprite-led VN production exchange and remove its three-choice grading.
- [x] Enlarge the Rie journal cutout, use Aakash's transparent sprite instead of the event CG, and prove both in the current app.
- [x] Enforce canonical cast names, dossier-backed lesson specialties, and peer-rotation thresholds without inventing identities or unsafe likeness swaps.
- [x] Add Shaun and retain Peter as distinct first-term story/scrapbook characters; keep Shaun's new neutral sprite behind owner/cast-scale review and Peter behind a defensible likeness gate.
- [x] Pin the original planning-only 73-stop classmate appearance package to real donor topics: 67 source-backed assignments, six review-required gaps, all 19 documented classmates represented, no authored/playable inflation.
- [ ] Record and pair reviewed authored Lesson 0 speech; the canonical Moodle handout has no source audio and browser TTS is forbidden.
  - Evidence audit: 0/4 current speech inputs have a release-ready recording. The missing vowel row and learner-turn scripts are repaired; recording, transcript/timecode, consent, and exact binding remain. See `evidence/lesson-zero-audio/REPORT.md`.

### Attempt 3 acceptance findings

- [x] Reconcile the three external reviews against current source and binding product decisions; reject proposals that remove the required fiction note, optional placement route, Course view, or fidelity gate.
- [ ] Ship one complete grounded Lesson 0 route and one complete grounded class Week; zero-playable remains the release-blocking denominator until both are learner-reachable.
- [x] Connect a real grounded attempt through `LearnerEvidence.recordActivity` into canonical Yomu SRS, then prove lapse → earned hint → exact repair schedule/card → independent pass → story memory → world/journal return in the real app on desktop and phone.
- [x] Keep placement answer controls outside automatic lookup/annotation until commitment; native radio selection and the Reader-ignore contract now pass focused tests and fresh 390×844 Browser proof.
- [x] Ensure canonical Study contains no pre-reveal answer-bearing text or attributes while preserving reveal, grading, statistics, and Academy provenance. Opaque `study-card-N` / indexed Doodle identities preserve in-memory actions and stale guards; the full card key appears only after reveal.
- [x] Rebase the checkpoint on Yomu 1.6.149, regenerate canonical Study/Academy assets, clear dead-code and line-scoped changed-code maintainability gates, and repair the extension build's stale hosted redirect input.
- [ ] Extend the same concealment invariant to standalone Study URL hashes without breaking intentional shared-card deep links; Academy's embedded route is already clean.
- [ ] Make Story and Course presentation choices visibly change the current experience without creating a second curriculum or progress model.
- [ ] Remove duplicated Reader/Academy navigation and settings from the embedded Study host; retain only the contextual controls needed during a study session.
- [ ] Prove fresh-code profile isolation, corrupt-checkpoint recovery, live class-code access, menu tab order, focus/contrast, and phone/tablet/desktop layout in Browser.

Acceptance: a Japanese teacher can identify what the learner was taught, practised, produced, transferred, and retained; the learner can always orient or leave; the screen reads as a living class rather than a card dashboard.

## Stage 2 — source pipeline

- [x] Rebuild the occurrence/payload ledger from all 96 Moodle archives and three direct Moodle resources; reconcile 96/916/688 exactly.
- [x] Rebuild a separate private ledger for all 13,123 regular files in the authorized 42 GB shared Japanese library; retain 15,790 filesystem-entry and 11,081 unique-payload denominators, with 68 overlap hashes recorded only on the library side.
- [x] Introduce versioned immutable source-item candidates adjacent to, but never conflated with, augmentation; retain the stricter reviewed `SourceQuestion` boundary.
- [x] Census every unique Moodle PDF page/text box/native image/positioned media/vector region and probe every Moodle audio payload with explicit failure states.
- [x] Publish and validate the separate shared-library mechanical census without copying source bytes into Git: 89 archive containers (84 censused / five explicit ZIP64 failures), 450 PDFs, and 5,090 media payloads. The cache-only publisher is structurally allowlisted and private-token clean; human source/media review remains open.
- [x] Migrate all 44 existing packs losslessly in resumable batches; preserve all 879 items and donor claims as review-required candidates.
- [x] Build the private teacher/editor source-vs-candidate comparison, overlay contact sheets, public privacy boundary, claim guard, and validators.

Acceptance: every payload has a status; every processed document has question/media counts; no image/audio task silently degrades to text.

## Stage 3 — all 74 class stops

- [x] Select the next grounding candidate without inflating delivery: [`l3-2-l04`](evidence/next-grounded-week/REPORT.md) is the smallest closed source surface and remains an explicit no-go pending source-question, locus, media, audio, answer, teaching, production, runtime, and browser proof.
- [ ] Author and expose every week while preserving all source occurrences/questions.
- [ ] Add original Minna 24/26 bridges.
- [ ] Add explanations, faithful solo adaptations, deterministic grading, model-answer gating, and cumulative review.
- [ ] Project one concept graph into Class, Genki, Minna, JLPT, and JF/CEFR views.
- [ ] Give every classmate meaningful learning appearances.

Acceptance: 74/74 class stops reachable and 100% audited Moodle source questions faithfully playable; manual-review reasons cannot substitute for activities.

## Stage 4 — Foundation to N1

- [ ] Map all 307 Yomu grammar rules to concept homes.
- [ ] Author cleared/original N3–N1 input, instruction, guided practice, production, checkpoint, and review.
- [ ] Audit Soya/official candidates item by item; preserve mechanics when wording/media cannot ship.
- [ ] Build one assessment model for placement, test-out, timed/untimed mocks, review, calibration, and exposure rotation.
- [ ] Validate the concept DAG, load, register, skill-specific recommendations, and midstream plot bridges.

Acceptance: every advertised level has four-skill evidence while JLPT receptive and JF/CEFR production claims remain distinct.

## Stage 5 — story and approved art

- [x] Author and validate the complete 48-chapter, four-season finite story through graduation, and compile every chapter into the runtime catalog.
- [ ] Build New Game Plus, the alumni calendar, and the recurring postgame learning loop on the same finite canon.
- [ ] Author ten meaningful relationship-journal chapters for every classmate, including recognition, friction, repair, reciprocity, support, shared memory, and an earned enduring bond.
- [ ] Generate one OpenAI neutral sprite per character, obtain likeness/style approval, then expand expressions/poses.
- [ ] Complete backgrounds, event CGs, props, worksheet media, unlocks, backlog, auto/read-skip, group chat, radio, transitions, and seasonal states.
- [ ] Build a resumable main-namespace inventory of the Megami Tensei wiki and convert its mechanic/lore/item patterns into original Academy design prompts without copying names, prose, characters, or lore.
- [ ] Replace dashboard navigation with fixed campus geography, diegetic doors/paths/journal/phone, spatial transitions, and a compact top-right minimap.
- [ ] Preserve cosy warm-night classes while adding colourful day/weather/season states; keep Velvet Hour as one discrete special place/event.
- [ ] Enforce asset home, provenance, mobile composition, and excluded-family validators.

Acceptance: every scene advances learning/relationship/mystery/world; every speaker has approved visible art; every shipped asset has a runtime home.

## Interaction and exploration catalogue

This is the single implementation backlog for varied learning. Every item must bind to a source item, concept, place, story beat, deterministic evidence, SRS consequence, keyboard/touch alternative, and reduced-motion behavior. A reskin alone is not a new activity.

Reference patterns: [KanaDojo](https://github.com/lingdojo/kanadojo) for four-way recognition/input drills (AGPL reference only), [DaKanji](https://github.com/CaptainDario/DaKanji) for drawing-led lookup, [MatchaNovel](https://github.com/HalfstarDev/matchanovel) for VN/minigame composition, [Phaser input examples](https://docs.phaser.io/phaser/concepts/input), [KAPLAY](https://kaplayjs.com/docs/guides/) for compact game plugins, and [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) for review scheduling. Candidate adoptions use [WanaKana](https://github.com/WaniKani/WanaKana) for MIT romaji/kana input and [Hanzi Writer](https://hanziwriter.org/) only after its MIT code and separate character-data licence are recorded; Tatoeba material requires per-item attribution/licence capture. Local DJT, Shinday, Moodle, Soya, Minna, Genki, and Japanese-library sources are the primary permitted content references.

### Kana and first literacy

- [ ] Kana sound gate: hear one mora and open the matching classroom door.
- [ ] Kana input sprint: type romaji or kana, normalize on submit, and repair confusable pairs.
- [ ] Kana stroke trace: draw the source stroke order with immediate directional feedback.
- [ ] Kana constellation: connect glyphs in gojuuon order without a visible chart.
- [ ] Confusable-pair spotlight: distinguish さ/き, ぬ/め, れ/ね, シ/ツ, and ソ/ン in context.
- [ ] Kana rhythm lane: adapt Shinday timing so mora land on beats rather than decorative notes.
- [ ] Kana listening bingo using the exact first-class sound order.
- [ ] Kana word builder: assemble already-taught glyphs into a pictured word.
- [ ] Katakana loanword shop: match packaging to its spoken loanword.
- [ ] Handwritten kana postbox: write a short label, then compare shape and stroke flow.
- [x] Kana mastery gate: combine source-faithful recognition, listening, typing, and writing; requeue every wrong or revealed item before Lesson 0 completion and seed the shared SRS.

### Source worksheet interactions

- [ ] Living worksheet reveal: preserve the source page and progressively activate one task region at a time.
- [ ] Image-label drag: reuse every source illustration with its original prompt and answer order.
- [ ] Source dialogue shadow: play each line, record the learner, compare timing and pitch, then retry.
- [ ] Source table completion: retain the original rows/columns and grade cells independently.
- [ ] Source map route: trace the exact route before producing its directions aloud.
- [ ] Source sequencing strip: reorder original panels or sentences, then explain the sequence.
- [ ] Source listening note sheet: retain the teacher's visual note-taking scaffold and audio pairing.
- [ ] Source error-correction pass: mark only the incorrect region before rewriting it.
- [ ] Source role cards: preserve the paired classroom roles and provide an AI-free solo counterpart.
- [ ] Source answer-key gate: reveal the teacher key only after attempt and diagnostic feedback.
- [ ] Worksheet-to-scene pipeline: no worksheet ships as a flat viewer; every source region keeps its item, concept, evidence, media, and answer-key bindings while becoming interactive.
- [ ] Moodle MP3 living layer: each permitted recording becomes listen, predict, confirm, shadow, and review with the original audio, transcript, captions, and source timing.

### Vocabulary-sheet practice

- [ ] Sensei vocabulary sheet: exact source order, spellings, readings, meanings, pictures, and audio.
- [ ] Cover-and-recall sheet: fold the meaning column, recall, then uncover one row at a time.
- [ ] Audio sweep: traverse the sheet in order and flag words that need replay.
- [ ] Image memory tray: study pictured objects, close the tray, and name what disappeared.
- [ ] Category sort: move source words into people, places, actions, time, and description groups.
- [ ] Collocation magnet board: connect words that naturally occur together.
- [ ] Odd-one-out with a spoken reason rather than a silent tap.
- [ ] Dictionary detective: choose the sense that fits the lesson sentence.
- [ ] Word-family tree: connect verb, noun, adjective, kanji, and polite variants.
- [ ] Vocabulary scavenger hunt across signs and props in the current place.

### Grammar and sentence building

- [ ] Particle plumbing: route は/が/を/に/で/へ through sentence pipes.
- [ ] Conjugation railway: switch a verb onto tense, polarity, politeness, and register tracks.
- [ ] Timeline drag: place clauses on before/while/after/already/not-yet axes.
- [ ] Sentence factory: assemble chunks, hear the result, then type or say it independently.
- [ ] Register wardrobe: dress one intention for friend, teacher, customer, colleague, and formal writing.
- [ ] Transformation chain: preserve meaning while moving through plain, polite, negative, past, and te-forms.
- [ ] Contrast courtroom: defend why one near-synonymous grammar form fits and another does not.
- [ ] Error clinic: diagnose particle, conjugation, register, and word-order mistakes separately.
- [ ] Chat reply picker: choose a socially natural response, then explain or record it.
- [ ] Caption repair: fix grammar in a scene caption before the story can continue.
- [ ] Constraint writing: produce one sentence using the exact target form and known vocabulary.
- [ ] Grammar maze: each correct transformation opens a semantically valid route.

### Listening

- [ ] Station announcement: identify platform, destination, time, delay, and transfer.
- [ ] Cafe order: hear modifications and prepare the correct tray.
- [ ] Konbini total: hear quantities/prices and select the correct coins or receipt.
- [ ] Weather forecast: mark place, time, probability, temperature, and advice.
- [ ] Phone-message reconstruction from partial notes.
- [ ] Minimal-pair focus with pitch and vowel-length contrasts.
- [ ] Layered dictation: mora, word boundary, phrase, then full sentence.
- [ ] Shadowing bar: compare onset, mora timing, pause, and pitch contour.
- [ ] Listening map courier: follow spoken directions without visible text.
- [ ] JLPT note-taking drill using exact permitted mock audio and timing.
- [ ] Radio drama unlock: replay a story scene audio-only, then answer inference questions.
- [ ] Miku Radio request hour: select a lesson track by understanding a short Japanese introduction.
- [ ] Embodied listening cues: tap mora timing, point, select, or mime before written recall so listening is not reduced to another text form.

### Speaking and pronunciation

- [ ] Pitch mirror: overlay learner and model contours without claiming phoneme-perfect grading.
- [ ] Mora timing check for long vowels, gemination, and ん.
- [ ] Say-to-select: speak the object or destination instead of tapping it.
- [ ] Rapid response: answer a predictable classroom question within a forgiving time window.
- [ ] Picture description with staged noun, particle, verb, and detail hints.
- [ ] Route-giving roleplay with the listener visibly following the instructions.
- [ ] Counter-service roleplay at the cafe, konbini, ramen shop, hotel, and post office.
- [ ] Register replay: record the same request for a friend and for Rie-sensei.
- [ ] Story retell: summarize a completed scene at the learner's current language ladder.
- [ ] Shadowing duet with alternating character lines.
- [ ] Read-aloud checkpoint from a source story with private playback and deletion.
- [ ] Self-introduction evolution from Lesson 0 through N1 professional contexts.

### Kanji

- [ ] Kanji Doodle production before recognition answers appear.
- [ ] Radical assembly: drag components into position and explain the mnemonic.
- [ ] Stroke-order relay with forgiving shape but strict sequence evidence.
- [ ] Sign hunt: find taught kanji in the current place's real signage.
- [ ] Component family: compare visually related kanji and their semantic signals.
- [ ] Reading web: connect on/kun readings to lesson vocabulary, not isolated trivia.
- [ ] Kanji garden: each retained character grows through recognition, reading, writing, and use.
- [ ] Calligraphy desk: slow deliberate writing with model overlay and pressure-agnostic input.
- [ ] Kanji boss: repair one recurring error across several contexts, never a health-bar reskin.
- [ ] Compound forge: combine familiar kanji and infer a new word before reveal.
- [ ] Kanji origin reveal: animate a verified pictographic/component path into the modern form as a memory cue, then require writing before reading.

### Reading and stories

- [ ] Short source story with paragraph-level reading, translation, audio, and vocabulary controls.
- [ ] Bilingual folktale ladder: replay the same story at N5, N4, N3, N2, and N1 support levels.
- [ ] Class group-chat episode with sender voice, register, emoji/stamp meaning, and reply choice.
- [ ] Menu reading at the ramen shop with ingredients, counters, allergens, and preferences.
- [ ] Timetable and transfer reading at the station.
- [ ] Form-reading tasks for hotel, clinic, post office, city hall, and airport.
- [ ] Manga-panel ordering with dialogue-balloon inference.
- [ ] News desk: headline, lead, detail, stance, and vocabulary mining.
- [ ] Literature room: longer permitted Japanese-folder stories with optional annotations.
- [ ] Mystery evidence board: compare witness wording, time expressions, and certainty.
- [ ] Subtitle scene study: watch, replay, mine, then retell without subtitles.
- [ ] Character journal chapter that unlocks only after the relevant real encounter.
- [ ] i+1 sentence stream: choose the next grounded sentence by known-word coverage and target grammar, preserving source attribution and learner control.

### Writing

- [ ] Name card and first self-introduction using the exact source template.
- [ ] Private diary entry tied to the day's story and grammar target.
- [ ] Postcard from a visited place with address and seasonal greeting.
- [ ] Email register lab: subject, greeting, request, thanks, and closing.
- [ ] Form completion with realistic Japanese field order and validation.
- [ ] Photo/event caption using time, place, people, and action.
- [ ] Group-chat response with casual contractions and repair feedback.
- [ ] Opinion paragraph with claim, reason, example, counterpoint, and conclusion.
- [ ] Story continuation constrained by canon and current vocabulary.
- [ ] Summary compression: rewrite a source paragraph in fewer Japanese words.
- [ ] Rie's red-pen pass: classify corrections before accepting a model answer.
- [ ] Portfolio revision: revisit an old response and improve it with newly learned language.

### Place-specific play

- [ ] Classroom command game using 見て・聞いて・書いて・読んでください.
- [ ] Library shelf challenge: choose an i+1 text from known-word coverage.
- [ ] Cafe tray assembly from a spoken order.
- [ ] Konbini shopping-bag drag for counters, prices, and quantities.
- [ ] Ramen customization with toppings, preferences, counters, and polite requests.
- [ ] Station transfer board with platform audio and time pressure only where source tasks use it.
- [ ] Train-home hands-free review with listening and speak-back.
- [ ] Bookshop recommendation dialogue based on level and interests.
- [ ] Park weather-description sketchbook across seasons.
- [ ] Pharmacy symptom matching and safe phrase rehearsal without medical diagnosis.
- [ ] Post-office parcel form and destination conversation.
- [ ] Office keigo quick-change with role hierarchy.
- [ ] Museum audio guide with inference and note-taking.
- [ ] Shrine/temple etiquette reading and omikuji language.
- [ ] Hotel/ryokan check-in, room explanation, and problem report.
- [ ] Airport arrival/departure, customs form, gate change, and lost-item dialogue.
- [ ] Festival plan: invitations, schedule, food stalls, navigation, and the JLPT mock story arc.
- [ ] Study-group table: simulate two or three classmates with private information gaps, clarification requests, register changes, and accountable turns.
- [ ] Travel interludes: transitions carry a short route, sign, announcement, or listening task with an equally complete reduced-motion path.

### Story, replay, and long-term retention

- [ ] Every first visit gets a short canonical character introduction and a reason to return.
- [ ] Every revisit rotates grounded occupants, dialogue, weather, source task, or reward deterministically.
- [ ] Bond scenes teach honorific/register evolution rather than only awarding points.
- [ ] Story backlog, auto, read-skip, log, reading, and translation controls share one VN contract.
- [ ] Error remix: recurring learner errors return naturally in later dialogue and activities.
- [ ] Source revisit: every completed worksheet remains browsable and replayable from its place.
- [ ] New Game Plus raises the language ladder while preserving the finite canon and choices.
- [ ] Alumni calendar continues rotating lessons, media, events, and review after story graduation.
- [ ] Daily procedural episodes draw only from grounded concepts, places, cast, and source activities.
- [ ] Weekly challenge mixes four skills around one source topic rather than four unrelated cards.
- [ ] JLPT mock events use permitted Soya/reference tests, recommend a starting band, and preserve plot continuity.
- [ ] Test-out checks remain per skill and concept; they never erase unseen story encounters.
- [ ] SRS due items become contextual tasks in the current place before falling back to cards.
- [ ] Mastery stamps require transfer evidence, not mere completion or streaks.
- [ ] No-guilt return scene gracefully summarizes elapsed story time and rebuilds a manageable queue.
- [ ] Campus puzzle atlas: original Professor-Layton-density language puzzles are discoverable in places and always bind to grounded concepts rather than generic riddles; the puzzles in the atlas are crossword- or word-search-type, etc.
- [ ] Case file, missing phone: a fictional loss sends the class through station staff, lost-property language, polite requests, and `〜てしまう`; no real classmate hardship is used.
- [ ] Case file, ninja night: an apparent ninja encounter teaches whisper register, counters, and on-readings before resolving as festival rehearsal.
- [ ] Case file, courtyard lights: an apparent alien signal becomes Xingyu's hologram project and teaches observed/reported/inferred language plus technical katakana.
- [ ] Written-line callbacks: later scenes quote or transform the learner's earlier safe journal lines so choices feel remembered without exposing private text publicly.
- [ ] Perspective replay: New Game Plus may replay completed episodes through another character's information and a higher language ladder without rewriting canon.
- [ ] Immersion Hall bridge: story graduation opens an endless i+1 loop of permitted media, source lessons, procedural place events, and real SRS review.
- [ ] The page you leave: the finite ending is a revisitable capstone, while the calendar, relationships, media, JLPT events, and mastery systems continue indefinitely.

### Daily loop, Reader quests, and humane incentives

- [x] Implement and test the deterministic domain projection for one quiet daily route: due repair, the next grounded lesson, and one optional `n+1` place/bond/immersion encounter, with one primary action and at most three actions total.
- [x] Present the projected route in Course from the live world, and route its actions into the existing evidence-backed review, lesson, and story flows.
- [ ] Mirror the route's concise continuation state in the world and journal without creating duplicate progress or navigation.
- [ ] Make review contextual first: a due word returns in a character exchange, sign, source object, subtitle, or place activity before the library card fallback.
- [x] Treat a missed day as recovery rather than failure in the daily projection and Course surface: preserve earned memories, retain one clear primary action, and never display a broken-streak or lost-reward message.
- [ ] Add the factual story-continuity recap and low-energy return queue to the world/journal re-entry scene.
- [x] Restrict projected incentives to meaningful diegetic outcomes: journal memory, reciprocal bond scene, place discovery, or source unlock; passive toggles, raw minutes, repeated easy items, and grinding do not verify rewards.
- [ ] Keep canonical story progression evidence-gated and authored; repeated reviews may deepen recall and relationships but cannot grind-open unseen plot.
- [ ] Add Yomu Reader quests for sustained comprehensible reading, returning to a spaced passage, mining an unknown word and later recalling it, reading with translation hidden, and completing a source-linked article response.
- [ ] Add Yomu Watch quests for attentive Japanese-subtitle viewing, replaying a difficult line, shadowing it, mining language, and later recalling it; time alone and leaving Japanese-only or immersion-filter toggles enabled do not count.
- [ ] Let Japanese-only and immersion-filter modes suggest a voluntary challenge with a visible exit; verify learning through a short recall, retell, or transfer response instead of rewarding the setting itself.
- [ ] Rotate daily routes deterministically by due evidence, learner energy, skill imbalance, known-word coverage, story state, place, and recent repetition so novelty serves learning rather than variable-ratio compulsion.
- [x] Give the daily Course route one dominant action, stable reading order, restrained motion, and gaze-efficient action/payoff grouping with no competing points, streaks, counters, or badges.
- [ ] Apply the same visual-attention audit to every active lesson, review, story, and minigame surface at phone, tablet, and desktop sizes.
- [ ] Add a learner-controlled low-energy route (listen, recognize, one recall) and deep-focus route (lesson, production, transfer) without changing the underlying mastery standard.
- [ ] Add a transparent weekly reflection showing what became independently usable across reading, listening, speaking, and writing; avoid global/public leaderboards, public streaks, arbitrary XP, and compulsory comparative pressure. The separate opt-in class board may offer private class-relative aggregate views without rewards or loss framing.
- [x] Expose a privacy-safe JSON answer-check contract for optional LLM feedback: task context, learner response, allowed rubric/evidence, structured verdict, uncertainty, and suggested repair; never send answer keys, private journal text, credentials, or unrelated history. The authenticated Worker boundary rejects unknown/private fields, validates provider output, isolates rate budgets per keyed session, persists no response text, and returns an explicit provider-unavailable result instead of fabricated feedback.
- [ ] Configure an answer-check provider adapter and complete live privacy, failure, uncertainty, and response-quality acceptance before presenting LLM feedback in the learner UI.
- [ ] Add a reading-resilience mode that rotates through reviewed Japanese font families at controlled difficulty, records per-font confusion evidence, keeps furigana/zoom available, and never changes the underlying answer or surprise-switches fonts mid-item.
- [ ] Measure success by retained recall, transfer, returning voluntarily, and reduced support use; do not optimize session length, notification opens, or screen time.

Acceptance: every grounded lesson has at least one source-faithful interaction that is not plain multiple choice or typing; modality choice follows the learning target; vocabulary sheets match the teacher source; and reuse is a tested engine plus distinct content/story behavior, never palette-only variation.

## Stage 6 — audio and immersion

- [ ] Complete `AudioDirector` buses, gesture unlock, crossfade, ducking, visibility handling, cleanup, offline state, and semantic slots.
- [ ] Finish the owner-approved Persona OST and Shinday SFX semantic-slot map, protected delivery, offline-state reporting, and authored scene/location bindings.
- [ ] Pair every listening question with audio, transcript, timecodes, shadowing, replay, and captions.
- [ ] Add pronunciation, listen-back, pitch comparison, diegetic radio, and train-home audio mode.

Acceptance: one source per bus as authored, no overlap/drone/autoplay loop, and no critical uncaptioned audio.

## Stage 7 — Cloudflare access and sync

- [x] Load the Cloudflare, Workers best-practices, and Wrangler skills before commands or implementation.
- [x] Review/migrate the Worker into focused access, invite, progress, media, Stripe, rate-limit, and crypto modules.
- [x] Create/verify D1 migrations, R2 integrity manifests, protected range media, anonymous invite sessions, and HMAC-only privacy boundaries.
- [ ] Complete idempotent learner-event sync and offline merge against the live Worker.
- [x] Seed `<PRIVATE_CLASS_INVITE>` through the authenticated admin endpoint using available secrets; never store plaintext codes.
- [x] Verify authenticated/anonymous protected-media HEAD and range behavior; live Royal Days and Shinday playback pass.
- [x] Add the authenticated, class-isolated leaderboard backend over existing board consent, moderation hiding, Yomu progress snapshots, and synced study days: bounded metric/page queries, deterministic tie ranks, off-page self placement, optional shared avatars, explicit snapshot freshness, and no raw events, answers, failed items, word lists, Google identity, email, client-supplied score, global rank, or competitive reward.
- [ ] Verify live logout, expiry, revocation, offline merge, and cross-device link.
- [x] Activate the owner-authorized live Stripe Checkout path and create one uncharged £2 `cs_live_…` smoke session.
- [x] Implement signed/idempotent webhook and claim contracts plus the concise generated-code return UX with bounded polling, URL scrubbing, copy, and retry.
- [ ] Complete one owner-approved real paid webhook→code-claim acceptance transaction.

Acceptance: live anonymous access, authorization, sync, deletion, expiry, and offline recovery smoke pass.

## Stage 8 — release

- [ ] Run typecheck, full tests, Academy conformance, source/media/answer/curriculum/asset/privacy validators, docs build, complexity, bundle, and all browser journeys.
- [ ] Capture approved real-app desktop/tablet/phone evidence only after annotation injection.
- [ ] Complete keyboard, screen reader, touch, Apple Pencil, reduced-motion, captions, contrast, offline-upgrade, rollback, and performance acceptance.
- [ ] Retry mandatory Fable adversarial review; resolve every actionable release issue.
- [ ] Update README, docs, credits/licenses, changelog, deployment and rollback instructions together.
- [ ] Push, deploy, create a `v*` release with `yomu.user.js`, verify latest/non-draft, and smoke `<PRIVATE_CLASS_INVITE>` live.

Acceptance: every release gate in the runbook is green, with only the explicit owner likeness/opening wording/physical-device/Stripe decisions left for owner acceptance.
