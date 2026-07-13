# Yomu Academy durable memory

Read this before resuming implementation, then follow [`STATUS.md`](STATUS.md), [`BACKLOG.md`](BACKLOG.md), and [`discovery/PRODUCTION-RUNBOOK.md`](discovery/PRODUCTION-RUNBOOK.md).

## Product truth

- Yomu Academy is a Foundation-to-N1 Japanese-learning world, not a dashboard skin and not a static visual novel.
- The opening is a warm, rain-lit London evening class led by Rie. Her first note briefly says the AI-created story is fictional and makes no claims about real people, then asks the learner's name and private reason.
- Four protagonist choices are `quality-2` through `quality-5`; `quality-1` is excluded. Portrait choice implies no gender, personality, or romance preference.
- Enrollment always offers Lesson 0, a manual N5–N1 provisional band, and an optional skill-specific JLPT-style mock recommendation. Recommendations never lock the learner.
- Story experience and curriculum mastery are separate. Midstream starts use playable arrival bridges and replayable chronological memories.
- Every source question survives with occurrence, document hash, locus, instructions, prompt, media, answer relation, and playable representation. Occurrence, payload, source question, activity, and concept are different denominators.
- Wrong answers produce precise explanation, a smaller repair, a nearby example, retry, and future review. Model answers unlock only after an honest attempt.
- Reader services enter through `yomu-bridge` interfaces. Academy does not fork annotation, dictionary, grammar, SRS, mining, immersion, pronunciation, KanjiVG, Doodle, OCR/PDF, subtitle, or localisation internals.
- One `AudioDirector` owns music, ambience, lesson/voice, and SFX; silence is valid and no electro drone fallback exists.
- The six-season story ends at graduation. Long-term life continues through NG+, alumni storylets, recurring mock seasons, source replay, SRS encounters, and Immersion Hall without undoing the ending.

## Direction-reset truth

- Read [`DIRECTION-RESET.md`](DIRECTION-RESET.md) before changing Academy product surfaces. Stage 1 engineering proof remains valid, but learner-experience acceptance is reopened.
- [`LESSON-EXPERIENCE-CONTRACT.md`](LESSON-EXPERIENCE-CONTRACT.md) is the binding route and lesson interface. Story and Course views are two hosts over one curriculum, activity runtime, event log, and Study collection; they never fork learning state.
- Class is a collapsed level spine. Only genuinely runtime-bound Weeks open a compact lesson overview; planning-only Weeks remain visibly unavailable and never route to generic placeholder content.
- Every lesson must pass the grounded-lesson seam. Provenance, curriculum resolution, relevant teaching, media, guided/independent/changed-context production, real grading, concealment, repair, canonical review keys, construct-preserving access, source fidelity, and honest blockers are mandatory. Art and story are outside that interface.
- Grounding is a build preflight, not optional author guidance. Every JSON in the public lesson directory must be registered as a complete lesson or an explicitly owned support shard; only complete lessons with zero proved blockers may contribute to playable-Week counts or routes.
- Learner writes resolve the complete lesson from shipped bytes. The registry pins the lesson ID, content revision, and SHA-256; the runtime hashes and audits those bytes before accepting an attempt or review event. A caller cannot supply a playable verdict.
- Review identity has one canonical normalizer shared by lesson validation, learner evidence, and scheduling. A lesson may emit only its audited review allow-list; one canonical card cannot silently represent different concepts across activities.
- Answer concealment is a resolvable surface audit, not a boolean promise. The audit record must match the claim; Lesson 0 remains blocked on `blocker:lesson-zero-answer-concealment-surface-audit` until real surfaces pass.
- Legacy ungrounded activity routes are classified centrally and removed from current state and Back history. Enrollment/session state never bypasses route normalization.
- Known pre-grounding Study cards retain genuine review history, but their Academy provenance is removed, retained cards carry `legacy-academy`, and their old schedule claims are superseded by append-only neutralization events. They cannot contribute an ungrounded Academy schedule or concept claim.
- The current delivery truth is 0/73 grounded-playable class Weeks: orientation is review-blocked and the other 72 are planning-only. The ledger is derived from lesson audits, never edited to promote a Week.
- Living paper has ten predictable types at most. `…`, position, reading-support placement, commit, in-place repair, Back, event emission, keyboard semantics, and reduced-motion behaviour remain stable across assessed types.
- The opening classroom-phrases PDF contains fourteen useful expressions; it is one survival-language activity inside a complete 60–90 minute Lesson 0, not the whole lesson.
- Lesson 0 also owns greetings, sound/script orientation, first sentence frames, useful vocabulary, real multi-speaker input, reading, matched writing/speaking, transfer, and a reversible close.
- Sound, Text, and Speaking change the first mission, cast/place, activity balance, story result, and adaptive evidence. They are not identical content reordered.
- Japanese learning outranks game systems; the world creates a reason to use language and then reacts to evidence.
- Full-bleed VN scenes, visible speaker sprites, and literal documents replace generic centred cards. Generated concept text is never canonical source data.
- The world uses room/corridor, campus/neighbourhood, and later travel-region scales. Japanese doors/signs, routes, a compact minimap, and discovered physical maps explain movement.
- The 42 GB corpus remains behind authored week bundles and lazy shards. Learners see one coherent class, not archives, filenames, extraction status, or provenance chatter.
- The top-left `…` menu is a universal safety route. Change lesson, revisit, and end day are never hidden by immersion.
- Ending a day records navigation only; it must never manufacture lesson, story, bond, or review completion.

## Cast and safety truth

- Real classmates supply wholesome chemistry; high-risk real events become fictional but emotionally equivalent.
- Rose is canon. Nanako and Mira are named extended cast members, not identities for the two phone-number-only contacts, which remain outside the cast. Pho is not canon.
- Owner-supplied chat evidence informs concise first-name-only voice and wholesome chemistry, never copied dialogue or private facts. Nanako has a private candidate likeness pair, and Mira now has an owner-confirmed private portrait; each still requires a neutral OpenAI likeness review before runtime use.
- Every classmate needs meaningful learning appearances, three bond steps, a journal profile, replay, expressions, and bond stars.
- Authored lesson casts resolve through the canonical cast registry. Visible names must be exact, hosts must fit documented learning specialties, and a small peer pair cannot dominate the chronology. Rie is excluded from peer-rotation concentration because teacher recurrence is expected.
- Aakash defaults to hat-free normal hair. Tom is blond and clean-shaven. Character likeness expands to expressions only after a neutral sample passes review.
- Pop-culture references arise naturally and create a language task; Academy never copies protected game/anime UI or characters into its own assets.

## Engineering truth

- Canonical repo: `/Users/heru/Documents/Projects/yomu/apps/yomu-reader`, branch `main`.
- Donors/worktrees are read-only and inventoried in `evidence/stage-0/inventory.json`; use `SALVAGE-LEDGER.md` before porting.
- Public content is versioned, validated, sharded, and lazy-loaded. Large/private archives stay out of the userscript and public bundle.
- Core orchestrators target 300 lines. Content is data. Plugins do not import plugins. CSS is layered and never uses broad descendant `span` rules around annotated Japanese.
- User-visible copy needs English and Japanese entries; Japanese QA must show no `未翻訳`.
- Generated `dist/yomu.user.js` remains readable and under the Greasy Fork 2 MB limit; bundle size is architectural.
- Browser visual evidence uses the real app, not fixture screenshots, and waits for Japanese annotations before layout assertions.
- The current Text proof is the first accepted composition reference: full-bleed library, Rie sprite, literal handout, learner-controlled Yomu annotations, IME production, response-specific repair, retry focus, flower mark, and one compact resolution. Evidence is under `docs/academy/evidence/direction-reset/08` through `10`.
- Rie happy/encouraging/repair plus the standalone Aakash and Xingyu sprites are explicit release-blocked previews, not approved likenesses. Mika, Sophie, and Ruparna remain withheld where the preserved photos do not support a defensible name-to-face match.
- The canonical classroom-expression Moodle ZIP contains the verified PDF but no audio. No local full-phrase recording passed pairing/provenance review; Lesson 0 must use reviewed authored recordings rather than browser TTS or spliced dictionary clips.
- `UCL2026` is now a real Cloudflare/D1 session path. The approved Persona and Shinday files stream only through authenticated R2 routes; anonymous media is 401 and the service worker never caches protected media.
- Stripe Checkout is live and owner-authorized. The browser receives only a validated `checkout.stripe.com` URL; payment return proof is scrubbed from history before bounded claim polling; a generated code is never put in URLs, storage, logs, source, or D1 plaintext.
- The 73-week classmate plan is planning data, not authorship. Sixty-seven assignments are backed by donor topic metadata and six are review-required; runtime weeks must still be faithfully authored and source-bound before any appearance is claimed delivered.
- Academy mounts the canonical Reader Study implementation rather than recreating it. Its living-paper host supplies a 15-minute countdown and route-history return; Reader retains cards, grading, Doodle, queues, and stats.
- Completed work is pushed and relevant deployment triggered. User-facing releases require a non-draft latest GitHub Release with built `yomu.user.js`.

## Current protected local state

The main checkout also contains pre-Academy Reader/NHK work. Do not include it in Academy commits accidentally. See `STATUS.md` for paths and stash `0d42a741b00ce1ea6ba09b0fa6e1d12e2e7f1db1` for the pre-fast-forward safety copy.

## Implemented Stage 1 truth

- Academy is a separate hosted Vite application at `/academy/`; its readable bundle, art, and content shards do not increase the userscript bundle.
- `AcademyApp` owns lifetime/shell only. `EnrollmentFlow` owns access/profile/placement/bridges; `WorldFlow` owns campus/review/journal/Lab; `LearnerEvidence` owns append-only learning mutations.
- IndexedDB appends event batches atomically. Deterministic IDs make milestone and review scheduling idempotent across retries/reloads.
- The faithful slice source is Moodle Level 1 Lesson 1 page 2 item 9, document SHA-256 `1e58967eb11b2d98d9b48a2547f392db90805836d96c232f11ac487d25b687ba`.
- Rie and Aakash both unlock at the first of ten relationship chapters; the journal preserves and replays both scenes. Aakash currently uses an explicit release-blocked standalone sprite preview in the journal rather than repeating the rainy-directions CG.
- The isolated one-character keyboard/choice writing proof is rejected product direction. Lesson kanji must run as the lesson's real set through the shared Study/Doodle flow; equivalent accessible evidence must not turn handwriting into a fake keyboard tracing task.
- The service-worker revision is generated from runtime content, not maintained by hand. The isolated rebuild of committed Stage 1 source is live at `s1-bbf9a61f26a3`; the earlier accepted Browser capture used `s1-15dd1d7d700f` before protected local Reader work was excluded from deploy artifacts.
- Browser evidence at 320, 390, 1024, and 1440 px plus annotated offline resume lives in `docs/academy/evidence/stage-1/`.
- Definitive `npm run qa` is green: Reader/JPDB/Academy tests, builds, verify, P0 smokes, deterministic QA 13/13, docs a11y 66/66, and complexity 29/30. Final Fable delta review is `PASS`.

## Resume point

Stage 1 is closed: source `371140513`, hosted assets `c5ef4629d`, branch record `5f759ee5f`, Pages run `29203203144`, and live revision `s1-bbf9a61f26a3` are green.

The Stage 2 Moodle mechanical census is green: 96 archives, 916 member occurrences, 688 unique member payloads, 3 direct resources, 527 unique PDFs / 1,087 pages, and 146 unique audio payloads all have explicit states with zero census failures. All 44 donor packs and 879 items survived as review-required candidates; only the one Stage 1 Source Question is still claimed verified/playable. The private teacher surface and public privacy/claim validators are executable evidence.

Stage 2 remains active. The authorized shared-library mechanical census and privacy-safe public status account for 15,790 filesystem entries / 13,123 regular files / 11,081 unique payloads in the 42 GB tree, including 68 Moodle-overlap hashes, 89 archive containers, 450 PDFs, and 5,090 media payloads. The five ZIP64 archive failures remain explicit. These are separate denominators and contribute no Moodle or verified-question coverage; all source-question review, rights decisions, transcripts, and media-to-activity pairing remain open.

The hard grounding/write gate and route quarantine are implemented. Current-app Browser proof reaches the honest blocked Lesson 0 overview, the correct manual-N3 Class group, and canonical Study with a live 15-minute countdown and Back to Class. The equal Course host and curated Library video/PDF shelf remain open.

No class Week is playable yet. Lesson 0 can move only by closing its named proofs, with its surface-concealment audit still explicit. [`evidence/next-grounded-week/REPORT.md`](evidence/next-grounded-week/REPORT.md) selects `l3-2-l04` for the next source-review slice, but it remains no-go until its question census, loci, media/audio, answers, teaching, production, runtime, accessibility, and Browser evidence pass. Preserve the protected Reader files while integrating these slices.
