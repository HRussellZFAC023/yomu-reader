# Yomu Academy: Anti-AI Product Red Team

## Verdict

Do not ship this as a Japanese visual-novel learning app yet. The core lesson has real, bespoke art and a coherent practical goal, but the experience currently behaves like a course dashboard wearing VN wallpaper. It asks learners to wade through fake personalization, fake destinations, and English explanation before it gives them a reason to use Japanese. Worse, Activity 1 supplies the answers before asking the question.

This is not a request for more polish. It is a request to remove product theatre.

### Evidence reviewed

- Live build: `http://127.0.0.1:4178/academy/` on desktop (`1163 x 654`) and mobile (`354 x 767` CSS viewport).
- Live flows: prologue, all onboarding steps, campus, Lesson 9 Activity 1, correct-answer feedback, mobile lesson drawer.
- Source: `src/academy/app.ts`, `src/academy/content.ts`, `src/academy/styles.css`, and `src/academy/experience.css`.
- Mobile facts: the lesson header exposes six controls; `Open Door Desk · Chapter 5` truncates to `Open...`; the campus dialogue occupies about 351px of a 767px viewport; the lesson drawer leads with seven disabled `indexed` lessons.

## KEEP

1. **KEEP the concrete planning mission, not its abstract wrapping.**
   - Keep the lesson's actual situation: a Sunday plan, rain, a station cafe, food, and a fallback. `activity-listen-weekend-plan` has a useful communicative spine.
   - Keep the bespoke image assets in `.academy-context-band img` and the specific scene data in `activityScenes` (`app.ts:162-218`). They are more credible than generic stock imagery.

2. **KEEP the restrained answer-row interaction.**
   - Keep the lined, direct choice treatment in `.academy-choice` (`experience.css:437-480`), including the inset selected state. It reads as an exercise, not a marketplace of cards.
   - Do not reintroduce the older rounded-card version from `styles.css:1589-1596`.

3. **KEEP delayed support as a pedagogic principle, then make it true.**
   - `.academy-transcript` and the writing comparison can be valuable after retrieval. The current labels point in the right direction; the implementation and copy do not.

4. **KEEP Rie-sensei as a character with a job.**
   - A teacher who gives a short Japanese prompt, reacts to an answer, and sends the learner into a scene can work. A 48px thumbnail inside a generic dialogue card cannot carry that role.

## REMOVE

### P0: Remove the answer key disguised as teaching

- **Where:** `.academy-teaching` renders before `.academy-form` in `app.ts:563-577`; `renderActivityTeaching()` injects `concept.example` at `app.ts:590-607`.
- **Offending strings shown before the listening question:**
  - `Two friends are arranging a Sunday meal near a river.`
  - `They meet at ten, bring vegetable dishes, and move to a cafe if needed.`
- **Why it fails:** those two sentences directly answer the required gist and all three required detail choices in `content.ts:683-705`. The app congratulates a learner for recognizing an answer it printed above the audio. That is not scaffolding; it is a spoiler.
- **Remove:** the literal conclusion/examples from the pre-attempt teaching block for every retrieval task. Keep only attention prompts there.

### P0: Remove fake personalization screens

- **Where:** `.academy-focus-list` and `.academy-path-grid`; onboarding `app.ts:402-427`.
- **Offending strings:**
  - `Choose a focus for recommendations. It never closes a lesson or changes what you are allowed to study.`
  - `This changes which after-school invitations appear first. Every path still teaches the complete course.`
  - `Useful conversation and repair language come forward first.`
  - `Dialogue, shadowing, and listening clues lead your route.`
- **Why it fails:** this is personalization theatre. `profile.motivation` and `profile.affinity` are persisted, but the current app has no rendered recommendations or after-school invitations that use them. The learner is asked to make two identity choices whose promised outcome does not exist.
- **Remove:** both full onboarding steps until they make a visible, testable change to the next lesson. Do not retain their reassurance copy as an apology for a no-op.

### P0: Remove or wire the dead campus controls

- **Where:** the two `[data-campus]` buttons in the lesson top bar, `app.ts:338` and `app.ts:342`.
- **Observed behavior:** on mobile, clicking `Return to the Academy campus` did not leave the lesson.
- **Why it fails:** `bind()` at `app.ts:789-816` has no `[data-campus]` listener. The most prominent navigation control is dead.
- **Remove:** one of the duplicate campus affordances immediately. Do not leave both a brand button and `Open Door Desk · Chapter 5` pretending to be back navigation.

### P1: Remove prototype-navigation furniture

- **Where:** `.academy-outline`, `.academy-outline-tools`, `.academy-lesson-list`, and `.academy-step-list` (`app.ts:518-545`).
- **Offending strings/behaviors:** `Level`, `Find a lesson`, `Search the course`, and disabled `Lesson 1` through `Lesson 8` rows labelled `indexed`.
- **Why it fails:** a shipped learner sees a course navigator full of disabled content. The implementation even admits the truth in a title attribute: `Source material indexed; interactive conversion is in progress`. That belongs in an internal tracker, not a learner drawer.
- **Remove:** the level selector, search field, and all disabled course rows until those lessons are real. Keep only the eight live activity steps for Lesson 9.

### P1: Remove the fake campus map and destination drawer

- **Where:** `.academy-chapter-panel` / `.academy-chapter-route`, `app.ts:469-505`.
- **Offending string:** `Every place returns to the same eight lesson activities. Choose the kind of work that helps now.`
- **Why it fails:** this tells the learner that seven locations are a map, then admits they all feed the same activity list. The locations swap dialogue, ambient sound, and a button target, but provide no distinct work. It is a menu dressed as a world.
- **Remove:** `Explore chapter`, its seven-location drawer, and the `Academy campus map` claim until each place has a distinctive scene, task, or consequence.

### P1: Remove the honour-system gates and pre-draft model answer

- **Where:** `renderActivityAssets()` (`app.ts:1108-1110`), the optional `I have listened twice` checkbox (`content.ts:676-681`), and `renderWritingSupport()` (`app.ts:1114-1119`).
- **Offending strings:** `Open transcript after your first listen`, `I have listened twice`, and `Model answer`.
- **Why it fails:** the transcript opens immediately; the checkbox is not required; the full writing model is available before a draft. These are disclaimers pretending to be product behavior.
- **Remove:** the unearned transcript disclosure and pre-draft `Model answer` disclosure. A learner should not have to role-play compliance with a checkbox.

### P1: Remove the static VN costume unless the VN actually runs

- **Where:** `src/academy/vn.ts:53-156` defines `playScene()`, but no current Academy flow invokes it. `app.ts` imports only `setVnIconRenderer` at `app.ts:57` and calls that setup at `app.ts:315`.
- **Why it fails:** doors, a blue-hour campus, a teacher thumbnail, `after-school invitations`, and `routes` imply a visual novel, while the shipped path is static hero -> questionnaire -> dashboard -> worksheet. The actual scene player and authored scenes are not in the release flow.
- **Remove:** the pseudo-VN promises from the opening and campus until a short playable Japanese scene is invoked before Lesson 9. A dashboard is allowed to be a dashboard; it cannot borrow a genre's emotional promise without delivering its interaction.

### P2: Remove the competing visual systems before they breed more UI debris

- **Where:** `experience.css:1` calls itself the `Canonical learner-facing layer` that overrides a `legacy prototype skin`, while `styles.css:1-52` and `experience.css:3-43` both redefine the same token palette. `styles.css:1220-1629` then redeclares buttons, panels, cards, pills, and screen layout again.
- **Why it fails:** this is generator residue: a generic academy dashboard, a VN/motion layer, and a later corrective skin fighting for the same selectors. It creates future regressions and is why the source still contains pill/button/card rules such as `border-radius: 999px` at `styles.css:1565-1569`.
- **Remove:** duplicate declarations after separating the actually used VN scene-player styles from the current lesson surface. One token file, one lesson layout file, one scene-player file.

## REWRITE

### Make the opening concrete, Japanese-first, and immediately useful

- **Replace in:** `.academy-onboarding[data-step="0"]`, `app.ts:397-400`.
- **Remove:**
  - `One notice is still unfinished.`
  - `At the Open Door Desk near Bloomsbury, a welcome guide stops halfway through its last useful sentence. This term, every lesson helps make the next arrival's route a little clearer.`
- **Rewrite to:**
  - Japanese lead: `雨なら、駅の中のカフェに変えませんか。`
  - Heading: `Make the rain plan work.`
  - Support: `Listen to two friends plan Sunday. Catch what changes when it rains.`
  - Primary CTA: `Start listening`
- **Reason:** the first screen should establish the language problem the learner will solve, not ask them to decipher a metaphor about an unfinished notice.

### Turn pre-task teaching into attention, not answers

- **Replace in:** `.academy-teaching` for `activity-listen-weekend-plan`.
- **Remove:** the two result sentences quoted in the P0 finding above.
- **Rewrite to:**
  - Label: `First listen`
  - Prompt 1: `Who is making the plan?`
  - Prompt 2: `Listen for one time, one food word, and what changes with 雨.`
  - After the first submitted attempt: reveal the current explanatory text as a review note, not as a pre-answer lecture.
- **Reason:** it preserves the useful listening strategy while leaving something for the learner to hear.

### Replace the route/metaphor loop with direct task language

- **Replace exact strings:**
  - `What should feel more possible?`
  - `Choose your first instinct.`
  - `Confidence is a route choice, not a final score.`
  - `The Rain Page needs one clear fallback.`
- **Rewrite to:**
  - `Choose your course order.` (only if the choice changes the order)
  - `Rain plan: where will they meet if it rains?`
  - `Practise this again tomorrow` (for the reflection)
- **Reason:** `route`, `path`, `first`, `support`, and `fallback` recur as product metaphors until the copy stops carrying meaning. A learning app needs verbs and situations, not a branded thesaurus.

### Make feedback diagnostic and specific

- **Replace in:** `app.ts:831-835`.
- **Remove:** `Complete` and `Your answers match the authored answer set.`
- **Rewrite correct feedback for Activity 1 to:**
  - Title: `You caught the plan and the rain change.`
  - Body: `You identified the meeting time, the food, and the cafe fallback. Replay once and say each decision before opening the transcript.`
- **Rewrite a wrong-detail prompt to:** `Replay the line around 雨. What do they decide to do?`
- **Reason:** generic praise rewards form submission. Task-specific feedback gives the learner a next listening action.

### Make the support gate a real interaction

- **Replace:** the visible, always-openable `details.academy-transcript` and the optional checkbox.
- **Rewrite behavior:** show `Show transcript` only after either one completed audio play or a submitted first attempt. For writing, change `Model answer` to `Compare with a model` and reveal it only after the learner saves a draft.
- **Reason:** a real gate protects retrieval without shaming or lecturing the learner about it.

### Collapse lesson navigation to one job per control

- **Replace in:** `.academy-topbar` and mobile styles at `experience.css:806-895`.
- **Keep:** one wired back-to-campus control, plus one current-lesson outline control.
- **Move out of the mobile header:** `Open lesson reference`, `Academy settings`, and `Sign out`. The reference duplicates inline teaching; settings and sign-out do not deserve permanent 42px slots in a 354px learning header.
- **Rewrite the drawer heading:** `This lesson` instead of `Academy route`; list the eight actual activities only.
- **Reason:** the mobile header must help a learner continue the sentence, not operate a dashboard.

### Let the art be scene evidence rather than a decorative crop

- **Replace in:** `.academy-context-band` (`experience.css:290-337`) and `.academy-campus-dialogue` (`experience.css:716-728`).
- **Remove:** the 96px desktop/120px mobile image strip with a navy overlay covering 52%/64% of the image, and the 68px/48px Rie portrait thumbnail.
- **Rewrite:** use one larger, uncrowded scene frame with a single learner-facing question. On the campus, show either a real scene with a playable Rie exchange or a compact functional lesson hub; do not put a 351px dialogue card over a mostly hidden illustration on mobile.
- **Reason:** the images are specific enough to carry attention. The current crop turns them into banner decoration and the portrait into a contact-avatar.

## Prioritized 2-Hour Remediation

1. **0-35 min - Protect retrieval (P0).**
   - Remove Activity 1's literal answer examples from pre-attempt `.academy-teaching`.
   - Gate transcript and writing model after a first attempt/observed audio play.
   - Manually verify: fresh learner cannot read a correct gist, detail, or model before responding.

2. **35-50 min - Stop lying with controls (P0).**
   - Wire one `[data-campus]` control or remove both.
   - Delete the motivation/affinity screens and any claim that they alter recommendations or invitations.
   - Manually verify: every remaining visible control has a distinct, working result.

3. **50-75 min - Remove the prototype dashboard (P1).**
   - Replace `.academy-outline` with `This lesson` and the eight live steps.
   - Remove `Level`, search, disabled `indexed` lessons, reference-panel duplication, and the seven-location chapter drawer.
   - Manually verify the mobile header at 354px has one back control, one outline control, and no truncated pseudo-navigation.

4. **75-100 min - Recut the entry into the lesson (P1).**
   - Replace the prologue copy with the concrete rain-plan prompt above.
   - Start the first Japanese listening scene directly after the course-order choice; do not ask for identity preferences first.
   - Remove `One notice is still unfinished.`, `route`, `path`, and `comes forward first` copy from this flow.

5. **100-115 min - Give the art one honest job (P1).**
   - Make the first scene large enough to inspect; remove its caption overlay and thumbnail portrait.
   - Either invoke `playScene()` for a short Japanese exchange or stop presenting the campus as a VN world in this release.

6. **115-120 min - Release smoke test.**
   - Recheck prologue, first answer, transcript/model gating, and working back navigation at desktop and 354px mobile.
   - Do not spend this window tuning token colors, sparkles, petals, or rounded corners. The release risk is instructional dishonesty and dead navigation, not insufficient decoration.

## Release Gate

The Academy becomes credible for release when a new learner can enter one concrete Japanese situation, attempt it without seeing the answer, receive specific feedback, and move through only controls that actually do what they say. Until then, call it an internal lesson prototype, not a shipped VN learning experience.
