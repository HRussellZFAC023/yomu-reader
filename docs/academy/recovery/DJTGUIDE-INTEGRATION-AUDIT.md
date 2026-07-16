# DJT Guide integration audit

**Audit date:** 2026-07-14

**Reference origin:** <https://djtguide.neocities.org/>

**Primary reference:** <https://djtguide.neocities.org/kana/>

**Status:** reference analysis only; no production code or third-party asset adoption

## Executive judgment

DJT Guide's durable value is not its visual treatment or its aging list of links. It is the way a small set of pages moves a beginner from orientation, through a sequence with explicit forks, into a focused kana loop and then outward to self-directed practice. The useful pattern is:

1. show the whole learning map without pretending there is one mandatory method;
2. name the next sensible step;
3. let the learner narrow the current drill;
4. give immediate, local feedback;
5. bring a missed item back soon;
6. expose deeper reference material only when it becomes useful; and
7. hand agency back to the learner.

Yomu should adapt that structure in its own bilingual voice and existing living-paper system. It should not reproduce DJT Guide's prose, markup, JavaScript, CSS, images, audio, font renders, stroke-order animations, branding, or resource descriptions. The public pages are a historical reference corpus, not a content or asset license.

The highest-value implementation is a new, original `kana-recall` activity plugin inside a grounded Foundation lesson. It should reuse Yomu's activity, evidence, overview, and routing contracts; it should not become a separate microsite or top-level route.

## Archived corpus

The bounded archive lives at `references-academy/djtguide`. Its machine-readable records are:

- `manifest.json`: URL, fetch/response timestamps, `Last-Modified`, ETag, media type, byte size, SHA-256, failures, and exclusions for every attempted first-party resource;
- `navigation.json`: every `href`/`src` found in the archived HTML, its resolved URL, origin relation, robots status, and fetch disposition;
- `archive.mjs`: reproducible, same-origin-only `curl` crawl with a twelve-request concurrency ceiling and no redirect following.

### Scope

The HTML corpus contains the six public entry points needed for this analysis:

| Archived page | Role in the corpus |
| --- | --- |
| `site/index.html` | compact first-party navigation hub |
| `site/guide.html` | conceptual sequence and method trade-offs |
| `site/resource guide.html` | categorized resource map and recommendations |
| `site/anki.html` | task-specific, stepwise setup workflow |
| `site/reading list.html` | wider practice/resource inventory |
| `site/kana/index.html` | interactive kana drill and its explanation |

The archive also contains the allowed first-party CSS and kana JavaScript, plus the kana page's runtime-selectable pronunciation, stroke, and typeface resources. Exact validated counts are recorded in the final section of this report and in `manifest.json`.

### Robots and crawl boundary

`robots.txt` was fetched before any other resource. Its disallow rules include `/assets`, `/cor.html`, several library/list/archive paths, and `/new.txt`. The crawl never queued a URL matching those prefixes. Consequently, some archived guide pages do not render exactly offline because their shared `/assets/script.js` and page images are intentionally absent. That is the correct result: the HTML and allowed CSS are sufficient for structural analysis, while robots policy takes precedence over visual completeness.

The archiver conservatively applies every `Disallow` line it sees rather than selecting a user-agent group. This corpus has only `User-agent: *`, so the result is unchanged; on a differently grouped robots file that policy would over-block rather than crawl too much.

External links were inventoried but never fetched. No login area, external origin, Mega/MediaFire archive, repository ZIP, torrent-adjacent resource, or other large binary was crawled. Same-origin redirects were resolved only after verifying their extensionless destination; the crawler requests the final URLs directly and retains the linked `.html` forms as manifest aliases.

### Historical limits

The corpus is old. Representative server metadata places most kana resources and guide pages in 2016-2017. Its product names, browser instructions, download links, tool availability, pedagogical claims, and safety assumptions must therefore be treated as historical observations. Any external recommendation considered for Yomu requires a fresh availability, quality, privacy, security, rights, and accessibility review.

## The soul worth adapting

### 1. Information hierarchy

The site separates four jobs that many learning products blur together:

- the home page is a map;
- the main guide explains the learning sequence and trade-offs;
- the resource guide is a categorized reference shelf;
- focused pages and mini-apps perform one task.

That hierarchy lowers cognitive load. A learner can understand where they are without having every option present in the exercise itself. Yomu's equivalent should remain **Class -> lesson overview -> focused activity**, with Library as a reviewed reference shelf. The exercise screen should not become a resource directory.

### 2. Sequencing with honest forks

The guide gives hiragana an early-gate role, treats katakana as important but less blocking, then places grammar and vocabulary alongside optional approaches to kanji before a transition into native reading and learner-created mining. More importantly, it distinguishes prerequisites from preferences. It presents several kanji approaches, names their costs, and repeatedly says that persistence and fit matter more than a supposedly universal optimum.

The transferable principle is a **recommended spine with reversible choices**:

- make a next step visible;
- explain why it is next;
- distinguish required foundation from optional method;
- let learners change pace or practice scope without losing progress;
- transition from bounded instruction to authentic reading and collection.

The exact DJT sequence and claims should not be imported as Academy curriculum authority. Yomu's sequence must be grounded in its reviewed lesson contracts and evidence.

### 3. Kana interaction loop

The kana page's loop is unusually compact:

1. the learner selects rows, combinations, and optional typeface variants;
2. one kana appears;
3. the learner types a reading without clicking a submit button;
4. a complete correct response advances immediately;
5. an invalid prefix reveals a precise correction in place;
6. advancing after an error reinserts the missed kana near-term more than once;
7. the score remains visible;
8. pronunciation and stroke order are learner-invoked supports;
9. row/font choices persist locally.

The best part is not "grinding". It is the short perception-response-feedback-retry cycle and deliberate near-term return of a miss. Yomu should preserve that tempo while using its own grading, repair, evidence, accessibility, and review rules.

### 4. Feedback and repair

Feedback is adjacent to the prompt, not a modal or separate results page. A wrong response identifies the expected mapping and the same item returns soon. This aligns closely with Yomu's binding requirement that a lapse stay in the activity for an exact contrast, nearby example, retry, and return.

Yomu should improve on the reference:

- do not expose an answer merely on hover;
- do not count an accidental partial keystroke as a meaningful committed attempt;
- distinguish a typo, accepted romanization variant, confusion pair, and no-response skip;
- announce feedback accessibly;
- persist enough session state to resume truthfully;
- emit canonical evidence only after the declared commitment point.

### 5. Resource maps

The resource guide uses stable categories, short descriptions, and a small visual recommendation marker. It is useful because resources are organized by learner job: kana, grammar, reading, listening, dictionaries, lookup, typing, Anki, and media tools. The map complements the sequence rather than replacing it.

Yomu should adapt the **job-based taxonomy and reviewed recommendation state**, not the particular resources or descriptions. Every learner-facing resource should have a current owner, review date, readiness/rights state, level or prerequisite, purpose, and safe destination. "Recommended" must be explainable, not merely a star copied from a historical page.

### 6. Progressive disclosure

The guide pages start with anchored tables of contents and expand into detail. The Anki page separates mandatory setup from optional image steps. The kana app begins with row-level controls, places combinations later, and keeps its long explanation below the active tool.

Yomu's version should use its existing lesson overview and focused-activity split:

- overview: goals, ordered sections, materials, progress, and recommended resume point;
- activity: current scope, prompt, input, feedback, and support;
- optional reference tray: pronunciation, stroke, contrasts, and deeper explanation after the appropriate reveal condition;
- Library: reviewed resources for exploration beyond the lesson.

### 7. Learner agency

The reference repeatedly offers choices: study or skip isolated kanji, change new-card load, begin reading earlier if lookup tolerance is high, select kana rows, select fonts, and choose how much support to invoke. Its strongest stance is that a method must be sustainable for the learner.

Yomu can express this as:

- **Recommend**: one evidence-backed next activity;
- **Adjust**: rows, script, challenge mix, session length, and supports;
- **Explore**: reviewed alternatives in Library;
- **Return**: resume exactly where the learner left off.

Agency must not weaken grounding. Learners may choose among reviewed paths; an unauthored or rights-blocked path remains unavailable.

### 8. Tone

The useful tone is direct, candid, and low-ceremony. It acknowledges effort, uncertainty, personal preference, and the fact that real fluency comes from sustained exposure. It does not hide trade-offs behind promotional language.

Yomu should keep the candor and lose the dated forum voice: profanity, insults, absolutist judgments, unsafe download instructions, and community in-jokes do not belong in Academy. Original English and Japanese copy should sound calm, specific, encouraging, and willing to say "this is optional" or "this source is not ready."

## Integration proposals

### P0: Original kana-recall activity plugin

Build a new `kana-recall` plugin beside [`phrase-karuta`](../../../src/academy/minigames/phrase-karuta/index.ts), using [`ActivityPlugin`](../../../src/academy/domain/activity-runtime.ts) as the contract.

**Model:** stable activity ID; `kind: 'kana-recall'`; concept IDs per kana/mapping; selected script and groups; accepted input variants; confusion tags; pass policy; original bilingual feedback; licensed pronunciation/stroke asset IDs; and the existing assessed answer-support contract.

**Runtime:** validate -> render -> grade -> review seeds, exactly like the current plugin interface. Support keyboard and touch, reduced motion, screen-reader announcements, IME-safe composition events, and a visible committed/uncommitted state. Keep layout and evidence independent of Story/Course presentation.

**Loop:** choose a small scope, present one item, accept a committed response, repair locally, requeue a miss at bounded near-term positions, then return to the lesson overview with pass or `needs review`. Use an explicit reveal/support control; do not copy hover-to-answer behavior.

**Important current gap:** `createActivityRuntime()` accepts a plugin list, but each production screen currently constructs a one-plugin runtime. There is no central `(lessonId, activityId)` binding that resolves a model and plugin. The existing `phraseKarutaPlugin` is referenced by tests but not by a production host. Kana integration therefore needs that lesson-activity binding seam; adding a plugin file alone does not make it reachable.

### P0: Grounded Foundation content, not imported DJT content

Author original bilingual Foundation lesson content and register it through [`ACADEMY_LESSON_CONTENT_REGISTRY`](../../../src/academy/content/lesson-content-registry.ts). A proposed section sequence is:

1. hiragana vowels and high-frequency rows;
2. remaining basic hiragana;
3. voiced/semi-voiced forms and small-tsu behavior;
4. contracted sounds;
5. katakana foundation;
6. mixed-script and typeface transfer;
7. changed-context reading/typing transfer.

Each section needs teaching before assessment, reviewed mappings, deterministic accepted variants, precise repair definitions, canonical review identities, accessibility alternatives, and evidence proofs. The reference corpus can motivate the interaction design but cannot serve as the lesson's source authority or rights proof.

Use system or properly licensed Japanese fonts for typeface transfer. Use independently licensed/created pronunciation and stroke-order data with attribution. Do not derive or ship the archived PNG, MP3, or GIF corpus.

### P0: Bind through the existing lesson route

Do not add a `kana` top-level route. [`AcademyRouteContextState`](../../../src/academy/routing/route-history.ts) already persists `lessonId`, `sectionId`, and `activityId`, and the intended route tree already moves from `lesson-overview` to `source-activity` and back.

The required integration is to make [`LessonFlow`](../../../src/academy/routing/lesson-flow.ts) resolve a registered activity binding by `(lessonId, activityId)` instead of hardcoding Lesson 0 branches. The binding should provide the model, plugin kind, milestone/evidence policy, and completion destination. Back, pause, refresh, Story/Course switching, and repair must continue through the existing route-history transition seam.

The route table now classifies `source-activity` as a lesson activity. Resume normalization filters only routes still centrally classified as legacy, but [`normalizeResumeCheckpoint`](../../../src/academy/routing/contract.ts) currently rewrites a `source-activity` with a missing lesson/activity ID to `lesson:foundation-00`; its completed writing-practice branch is hardcoded to the same lesson. A generic activity binding must replace that fallback with a validated lesson-aware destination, or a non-Foundation lesson could resume into the wrong overview. A kana activity must not be declared reachable until its registered lesson, binding, and resume fallback pass the grounding gate.

### P0: Evidence and adaptive return

Send each committed result through [`LearnerEvidence.recordActivity`](../../../src/academy/evidence/learner-evidence.ts), including stable concept IDs, response kind, outcome, score, error tags, and only grounded review seeds. Pronunciation, answer reveal, stroke reference, or other construct-changing support should use `recordSupportUse` rather than masquerading as independent success. The current [`SupportKind`](../../../src/academy/domain/learner-record.ts) union is `hint | transcript | translation | definition | example-gloss | model-answer`; pronunciation and stroke reference need explicit reviewed kinds or a separate support event contract.

The learner event model already names `kana` as a `LearningSkill` and supports recognise, recall, produce, listen, write, repair, and transfer actions. There are currently two evidence paths: lesson `ActivityPlugin` evaluations reach `recordActivity()` and emit `attempt-recorded`, while the [`mode registry`](../../../src/academy/domain/mode-registry.ts) declares `learning-evidence-recorded` and practice-session/classroom-expression engines construct that skill-level event directly. [`recommendActivities`](../../../src/academy/domain/adaptive-recommendations.ts) consumes only the latter.

Resolve that split explicitly. The registered lesson-activity binding should declare a validated mode, journey, skill, action, and independence policy. One canonical lesson-evidence adapter should then persist the grounded `ActivityEvaluation` and its corresponding `learning-evidence-recorded` event together, reusing the same event construction/validation rules as practice sessions. Do not bolt an underspecified second event into `recordActivity()` or let each kana screen invent mode metadata. Without this adapter, kana repair debt cannot drive recommendations reliably.

Recommendation should be gentle and explainable: resume the current row, revisit a confusion set, or expand scope after stable performance. Learners retain manual control over scope and session length.

### P1: Lesson-local resource map

Use [`LessonOverviewDefinition.overview.materials`](../../../src/academy/domain/lesson-overview.ts) for the small, current-lesson map: kana chart/reference, pronunciation source, stroke reference, and transfer reading, each honestly marked `ready` or `release-blocked`. The overview already computes section status, next activity, and resume state; no second progress model is needed.

Keep long descriptions and browsing out of the activity. A compact reference tray may resolve ready lesson materials after the relevant reveal condition.

### P1: Reviewed Library shelf

The broader job-based map belongs in Library. The current world flow sends the Library location directly to canonical Study/review, even though [`SourceLibrary`](../../../src/academy/domain/source-library.ts) and [`LibraryMediaRouter`](../../../src/academy/media/library-media-types.ts) already model reviewed documents/media and safe destinations. Do not overload Study with a link directory.

A future Library shelf should be a distinct reviewed route/screen backed by privacy-safe resource metadata:

- learner job and skill;
- level/prerequisites;
- short original bilingual description;
- recommendation reason;
- owner and review date;
- rights/readiness state;
- destination resolved through the existing media router or an allowlisted external-web policy.

This route should be implemented only when at least one useful shelf is reviewed and ready; otherwise the current honest route is preferable to a decorative empty library.

### P1: Progressive disclosure and workflow affordances

Reuse the existing lesson overview, authored-screen progress treatment, focused activity anatomy, and route history rather than copying the reference page's long single-document layout.

Recommended controls inside kana recall:

- segmented script mode: hiragana, katakana, mixed;
- row/group checkboxes with a clear selected count;
- session-size stepper or bounded option menu;
- explicit sound and stroke-reference icon buttons with tooltips;
- challenge toggle for typeface variation;
- pause/back through the standard shell;
- visible score plus a clearer mastery/repair summary at return.

Avoid a settings wall. Start with the lesson's recommended small scope and disclose advanced combinations, mixed script, and typeface transfer as sections become available. Persist learner choices separately from evidence.

## Rights and provenance boundary

### Adaptable patterns

These are abstract interaction or information-architecture ideas that Yomu can implement independently:

- map -> guide -> resource shelf -> focused tool hierarchy;
- recommended sequence with optional forks;
- row/group-scoped kana practice;
- immediate in-place correction;
- bounded near-term reappearance of missed items;
- learner-invoked sound/stroke support;
- persistent practice preferences;
- categorized, job-based resource maps;
- optional steps and anchored progressive disclosure;
- candid explanation of trade-offs and learner choice.

### Must not ship verbatim

- page prose, explanations, recommendations, labels arranged as expressive copy, or resource descriptions;
- HTML structure as copied markup, CSS styling, or JavaScript implementation;
- DJT names, headings, logos, or distinctive site presentation;
- kana font PNGs, play/shortcut images, pronunciation MP3s, or stroke-order GIFs;
- archived screenshots or derived visual replicas;
- third-party download links or setup instructions without a current independent review;
- historical factual/pedagogical claims presented as current Academy authority.

The archive remains internal research evidence. Any future implementation should carry its own source records, licenses, authorship, review dates, and hashes through Yomu's existing grounding and resource-ledger gates.

## Proposed delivery order

1. Define a grounded Foundation-kana lesson contract and independently sourced/licensed mapping, audio, and stroke references.
2. Add a generic registered lesson-activity binding so an `ActivityPlugin` can be resolved by `(lessonId, activityId)` without a hardcoded route branch.
3. Implement and test the original `kana-recall` plugin: IME behavior, accepted variants, confusion tags, requeue bounds, concealment, support evidence, keyboard/touch, screen reader, and reduced motion.
4. Bind lesson overview sections, progress, pause/return, and canonical review seeds.
5. Wire skill-level kana evidence into explainable recommendations.
6. Add a lesson-local materials map.
7. Create a broader Library shelf only after reviewed resources and a safe external-web/media destination policy exist.

## Acceptance gates for any implementation

- No archived DJT asset, prose, code, or distinctive presentation enters shipped output.
- Every content and media item has an independent license/provenance record and current review.
- The activity passes the complete grounded-lesson gate, including teaching, concealment, repair, evidence, fidelity, and access.
- Wrong answers stay in context and return soon; retry ordering is deterministic under a seeded test.
- IME composition cannot submit partial text or inflate attempt counts.
- Alternate romanizations are explicit reviewed data, not ad hoc string replacement.
- Sound/stroke/answer reveal is recorded as support when it changes the construct.
- Story and Course mount the same model/plugin and emit identical evidence.
- Back, pause, refresh, and offline resume preserve truthful state.
- Phone, tablet, desktop, keyboard-only, touch, screen-reader, and reduced-motion flows pass.
- Resource recommendations show owner, review date, reason, rights/readiness, and safe destination.
- Existing Academy grounding, asset-ledger, route-history, activity-runtime, and accessibility suites remain green.

## Archive validation

The final archive was created at `2026-07-14T15:20:43.890Z` and reconciled independently against `manifest.json`:

| Measure | Exact result |
| --- | ---: |
| Successfully fetched resources | 3,850 |
| Failed transfers | 0 |
| Unique manifest exclusion records | 37 |
| HTML `href`/`src` references inventoried | 421 |
| Archived payload bytes | 14,400,397 |
| Files under `references-academy/djtguide/site` | 3,850 |
| Total files under `references-academy/djtguide` | 3,853 |
| Missing manifest resources | 0 |
| Unmanifested files under `site/` | 0 |
| SHA-256 or byte-size mismatches | 0 |
| Allowed same-origin references left unfetched | 0 |

The 3,850 payloads are exactly:

- 6 HTML documents;
- 5 CSS files;
- 1 JavaScript file;
- 1 `robots.txt` plain-text file;
- 1 favicon;
- 3,640 PNG files;
- 92 GIF files; and
- 104 MP3 files.

`navigation.json` contains 102 same-origin, 41 fragment, and 278 external references. Forty-five HTML reference occurrences were not fetched because they resolve under a robots-disallowed prefix; deduplication by URL/reference set yields the 37 manifest exclusion records. All 278 external references are marked `external_origin` and were not fetched.

The three non-payload files in the reference directory are `archive.mjs`, `manifest.json`, and `navigation.json`. Together with this report, the task created exactly 3,854 files across the two user-authorized locations. The exact path, URL, timestamp, byte count, and SHA-256 of every fetched payload is listed in `manifest.json`; failures and exclusions remain explicit rather than being retried through a disallowed or external path.
