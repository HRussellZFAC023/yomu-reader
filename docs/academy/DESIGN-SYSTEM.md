# Yomu Academy Design System

**Status:** Proposed source of truth for product and visual design

**Owner:** Academy design

**Scope:** The learner-facing Academy experience. This document sets the interaction, visual, accessibility, and art-direction decisions that connect onboarding, campus, story, teaching, practice, and return. It does not replace the canonical constraints in [WORLD-BIBLE.md](WORLD-BIBLE.md) or the environment production requirements in [art/ENVIRONMENT-BIBLE.md](art/ENVIRONMENT-BIBLE.md).

## The decision

Yomu Academy is a quiet, original illustrated evening-study story in which each lesson helps a fictional community make one practical Open Rooms Afternoon noticeboard item clearer in Japanese. The canonical story baseline is the World Bible's **Noticeboard Term**, its fictional Open Door Desk, and its fictional cast. The story is always visible as context and consequence; it is never a gate in front of learning.

The primary experience is one continuous route:

1. A door opens onto the current term and its small unresolved noticeboard item.
2. A campus home shows one meaningful place, one active story object, and one clear next action.
3. A short dialogue puts the learner in the practical situation.
4. Teaching and practice keep that situation visible, but make the language task the focus.
5. Returning to campus changes the notice or the place in a modest, legible way.

This is not a social simulator, a collectible map, or a generic course dashboard with decorative story art placed behind it.

## What "ever-present story" means

The recurring story thread is **the noticeboard and its practical items**: a route card, rain note, meeting-point card, timetable, sign-up slip, or annotated draft related to the current chapter. It supplies the question a lesson answers and visibly changes after meaningful progress. The Environment Bible's red thread or unfinished notebook may appear as a quiet recurring prop, but it is not a competing chapter premise.

- It is a small persistent context cue in lessons, not a second task or a blocking modal.
- It appears in its actual setting: on a board, desk, phone, folder, or handout. It is not a floating magical badge.
- It changes through a few concrete states: unreadable, partly understood, clarified, shared, or resolved.
- A learner can always choose **Continue learning**, **Review**, or **Browse the chapter** without resolving a scene first.
- Completion earns comprehension and a changed world detail, not coins, relationship meters, shop stock, or fireworks.

## Current audit

This is an audit of the current worktree and local preview, not a list of hypothetical risks. The visual direction has promising ingredients, but the current composition makes the product feel assembled from several familiar AI-game patterns rather than designed as one Academy.

| Priority | Observation                                                                                                                                                                                                                                    | Evidence                                                                                                                                                            | Consequence and design decision                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0       | The current cast source describes an ensemble inspired by a real class and includes recognisable hobby and franchise references.                                                                                                               | [src/academy/cast.ts](../../src/academy/cast.ts)                                                                                                                    | This conflicts with the World Bible's fictional-only default and is not an acceptable foundation for visual production. Only canonical fictional characters, or later explicitly approved fictional replacements, may receive portrait packs or relationship-facing UI. Do not render real-person likenesses, names, or private class details by default.                                                                             |
| P0       | The opening asks for a name and a personal reason to study, then uses a real-class name as its fallback identity.                                                                                                                              | [src/academy/app.ts](../../src/academy/app.ts) in `renderOnboardingStep` and profile defaults                                                                       | This contradicts the World Bible's no-real-name, useful-focus-first onboarding. Use an optional display name later in settings, default it to `Learner`, use non-personal learning-focus choices, and provide a direct route into the first lesson.                                                                                                                                                                                   |
| P0       | Academy already has `AssetRights`, but its asset kinds do not cover environments or portraits and its record has no visual-review, crop, or canonical-fit state.                                                                               | [src/academy/content.ts](../../src/academy/content.ts)                                                                                                              | Extend the existing rights metadata and content-graph validation. A raster scene or portrait must not become shippable merely because a file exists in `public/`, but the fix is not a parallel asset store.                                                                                                                                                                                                                          |
| P0       | The live cast, planning manifest, prompts, profile defaults, and Study Links retain real-class material while the World Bible requires fictional characters and no one-to-one portrayal.                                                       | [src/academy/cast.ts](../../src/academy/cast.ts); `public/academy/art/characters/cast/asset-manifest.json`; [src/academy/app.ts](../../src/academy/app.ts)          | Treat this as a release blocker, not a future style concern. Remove real-class names, likenesses, hobbies, prompt references, default names, and private details from shipped strings and assets unless a separate narrow consent process permits a documented use. The canonical fictional cast replaces it by default.                                                                                                              |
| P0       | Three competing story premises currently exist: the World Bible's Noticeboard Term, the app's missing-page/notebook framing, and real-class social material.                                                                                   | [WORLD-BIBLE.md](WORLD-BIBLE.md); [src/academy/app.ts](../../src/academy/app.ts); [src/academy/cast.ts](../../src/academy/cast.ts)                                  | Before more scenes or art are wired, select the Noticeboard Term as the canonical baseline. Retire or deliberately remap the missing-page/notebook language to a subordinate recurring prop, and resolve name collisions such as the fictional and real `Mika` entries.                                                                                                                                                               |
| P1       | The runtime asks one wide key image to represent the whole campus. Six location buttons sit over it, even though paired environment assets now exist elsewhere in the tree.                                                                    | [src/academy/app.ts](../../src/academy/app.ts) in `renderCampus`; `public/academy/art/environments/`                                                                | This is an integration failure, not evidence that no environment system exists. The environment set is unwired while `renderCampus` hardcodes `campus-blue-hour.webp`. Show one current location per home state, with at most two deliberate nearby destinations, and add a canonical environment manifest as a content-graph extension rather than a panel-only file.                                                                |
| P1       | The campus art collages a monumental Western university facade, Japanese garden motifs, cherry blossoms, lanterns, skyline, and a foreground group into one image.                                                                             | `public/academy/art/campus-blue-hour.webp`                                                                                                                          | It reads as generated prestige-academy tourism rather than a specific fictional evening study community. Japanese language should appear through practical objects, notices, and conversation, not an all-purpose decorative package of blossoms, bridges, and lanterns.                                                                                                                                                              |
| P1       | The legacy teacher key art is a full rectangular room illustration rather than the reusable portrait source the runtime needs. A cast-portrait pipeline exists, but it is planning material and has the same real-class boundary problem.      | `public/academy/art/characters/rie-sensei.webp`; `public/academy/art/characters/cast/asset-manifest.json`                                                           | Do not crop the legacy image aggressively behind dialogue. Reconcile the cast first, then build a fictional, approval-backed portrait system with expression, pose, alternate-description, and mobile-crop data.                                                                                                                                                                                                                      |
| P1       | Raster key art, painterly portrait art, simple parametric SVG busts, and emoji-like props use unrelated rendering grammars. An orphan CC0 map marker also signals weak asset hygiene, although it is not currently rendered by the learner UI. | [src/academy/art.ts](../../src/academy/art.ts); `public/academy/art/cc0-school-map-marker.png`                                                                      | The result feels like an asset sampler. The generated pseudo-pixel texture is not a deliberate pixel-art grammar. Choose one original 2D raster environment and portrait language; retain simple vector only for utility icons and diagrams. Record an explicit disposition for orphan legacy files rather than treating them as part of the shipped visual system.                                                                   |
| P1       | The opening begins with a large portrait card, dark overlay, falling petals, an oversized dialogue panel, and a second form step. The image gets less attention than the interface layered over it.                                            | [src/academy/app.ts](../../src/academy/app.ts) in `renderOnboarding`; [src/academy/styles.css](../../src/academy/styles.css) around the onboarding and petals rules | This is a familiar "cozy visual novel starter kit" composition: scenic image, dark glass, petals, rounded card, primary pill. It makes the setting interchangeable. One painted door, one line of chapter context, and one clearly placed action are stronger.                                                                                                                                                                        |
| P1       | Campus home carries a top bar, term label, currency, social links, shop, sound/settings/sign-out icons, six map pins, progress card, central dialogue card, cast chips, and particle effects at once.                                          | Local visual walkthrough; [src/academy/app.ts](../../src/academy/app.ts) in `renderCampus` and `renderCampusDialogue`                                               | The learner must parse product furniture before finding the story. The home screen gets one primary action, an optional compact chapter drawer, and a clearly labelled access menu. Currency, shop, bond pips, and roster systems do not belong in the primary route.                                                                                                                                                                 |
| P1       | The lesson switches from cinematic campus art to a generic dark course shell with dense chips and a header that uses UCL as a course/service identity.                                                                                         | Local visual walkthrough; [src/academy/app.ts](../../src/academy/app.ts) in `renderLesson`                                                                          | The world disappears exactly when learning begins, and the institutional course label undermines the fictional setting. Replace it with a restrained chapter-context band, a visible noticeboard-item excerpt, and a route back to the current place. Geographic UCL/Bloomsbury reference is permitted only as original fictional context; Academy must not claim institutional course, service, staff, event, or endorsement status. |
| P1       | Motion is abundant and unprioritised: door movement, petals, sparkles, pulse, typewriter cursor, parallax, roster lift, tap hearts, and multiple glow treatments coexist.                                                                      | [src/academy/styles.css](../../src/academy/styles.css) around `academy-petal`, `academy-sparkle`, `academy-campus-background`, and the narrative layer              | The accumulation is more distracting than expressive and makes reduced-motion parity difficult. Reserve movement for spatial change, an intentional advance, and a single completion confirmation. Remove decorative perpetual motion and particle weather from the default route.                                                                                                                                                    |
| P1       | The CSS has multiple late overrides for the same controls and layout surfaces, including button radius, icon button, top bar, main canvas, and panel rules.                                                                                    | [src/academy/styles.css](../../src/academy/styles.css), especially the late narrative and screen-layout layers                                                      | The visual system cannot settle while its primitives change under each screen. Consolidate around a small token set and one component grammar before adding new scenes. A 999px capsule button is not an Academy primitive.                                                                                                                                                                                                           |
| P1       | The current visual-novel overlay has a Skip scene control, but no visible backlog, replay, text-speed, or complete access rail in its primary surface.                                                                                         | [src/academy/vn.ts](../../src/academy/vn.ts)                                                                                                                        | Preserve Skip, then add the missing learner-control tools. Story controls are part of learner control, not settings debris. Do not make learners rewatch dialogue to recover a missed line.                                                                                                                                                                                                                                           |
| P2       | The isolated Academy preview displays a broken-looking brand mark because the runtime uses an absolute `/yomu-icon.svg` path that does not resolve under the Academy preview base.                                                             | Local static-preview walkthrough; [src/academy/app.ts](../../src/academy/app.ts)                                                                                    | Resolve the asset-base and packaging behaviour before visual approval. A polished scene with a failed identity asset still reads unfinished.                                                                                                                                                                                                                                                                                          |
| P2       | A content-graph course title still uses UCL as service/course identity.                                                                                                                                                                        | [src/academy/content.ts](../../src/academy/content.ts) lesson metadata                                                                                              | Align content metadata with the fictional Academy course label as well as the visible lesson header. Geographic reference does not justify a real-institution course label.                                                                                                                                                                                                                                                           |
| P2       | Most surfaces use oversized rounded rectangles, soft gradients, dark overlays, and small badge-like labels.                                                                                                                                    | [src/academy/styles.css](../../src/academy/styles.css)                                                                                                              | The result is generic product-game styling. Use squared 6px corners, clear edge hierarchy, opaque surfaces, and fewer labels. Let art, space, and typography establish warmth.                                                                                                                                                                                                                                                        |

### Keep, but redirect

- The current chapter/lesson sequence has a useful narrative aspiration. Preserve short beats and the direct lesson route.
- The existing motion preference, audio preference, and semantic labelling work are useful foundations, but the experience must make their controls visible where they matter.
- The Environment Bible establishes valuable production constraints: original art, no named-style imitation, scene-safe zones, distinct wide and mobile deliverables, and people-free backgrounds.
- Paired environment plates, lesson raster art, the Environment Bible's documented scene inventory, and the cast asset manifest already exist. The environment inventory is not yet machine-readable; add its canonical manifest as a content-graph extension rather than copying data into a design-only inventory.
- The existing course content can remain structured around listening, grammar, reading, writing, and review. Its visual container needs to become part of the same world.

### Canonical reconciliation and decommission gate

Before visual production proceeds beyond the first vertical slice:

1. Make **Noticeboard Term**, the Open Door Desk, and the fictional cast in the World Bible the declared runtime canon.
2. Remove or remap the app's missing-page/notebook premise so it functions only as an approved recurring prop, never as a parallel chapter arc.
3. Remove live real-class material from shipped routes, strings, prompts, manifests, profile defaults, portraits, Study Links, and asset selections. No consent process is implied by a first name or a planning note.
4. Preserve existing environment and rights assets only through the canonical manifest path. Legacy files get an explicit `approved`, `prototype`, `retired`, or `blocked` disposition.
5. Do not add more cast, social, shop, bond, or collectible UI until the fiction, privacy boundary, and direct-learning path are coherent.

## Research patterns, not visual references

The following sources inform interaction principles only. Academy must not copy their art, character design, logos, interface layout, story, language mechanics, or wording.

| Source                                                                                                                        | Transferable pattern                                                                                                                        | Academy application                                                                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Ren'Py self-voicing documentation](https://www.renpy.org/doc/html/self_voicing.html)                                         | Narrative text needs a first-class spoken and alternate-text path.                                                                          | Every line, speaker, scene change, choice, and non-textual story cue has semantic text available to assistive technology. Visual atmosphere never carries required language information by itself. |
| [Ren'Py save, load, and rollback documentation](https://www.renpy.org/doc/html/save_load_rollback.html)                       | Preventing a person from recovering a line or choice is hostile to player control.                                                          | Give Academy a readable backlog and replayable scene beats. A learner may reopen an explanation or choose direct practice without losing progress.                                                 |
| [Ink and its writing guidance](https://github.com/inkle/ink/blob/master/Documentation/WritingWithInk.md)                      | Branches should recombine cleanly so choices change texture without causing unmaintainable fragmentation.                                   | Offer low-stakes choice of tone, order, or helpful response; converge on the same language target and practice. Do not use branching to gate curriculum or produce inaccessible content islands.   |
| [Heaven's Vault](https://www.inklestudios.com/heavensvault/)                                                                  | Language discovery is satisfying when a story remembers what the learner has understood and makes the growing knowledge visible in context. | The current noticeboard item is progressively annotated with confirmed meaning. A practice result updates a concrete object, not an abstract XP meter.                                             |
| [Chants of Sennaar language-design discussion](https://news.xbox.com/en-us/2023/09/05/chants-of-sennaar-languages/?ver=3.7.1) | Communication can be the dramatic centre when visual cues and language cues form one coherent system.                                       | Use practical signs, layouts, and repeated objects as context for Japanese. Do not bury the language task in a generic HUD or turn culture into ornamental scenery.                                |

## Primary experience

### 1. Onboarding doors

**Purpose:** Establish the term, the learner's agency, and the fiction without asking for real-world personal information.

- The first frame is a single painted Open Door Desk or entrance-door scene, with the current notice just visible on a board or desk.
- The term label, chapter title, and one sentence of situation sit in the lower safe zone. The art remains legible above it.
- Primary action: **Enter the term**. Secondary text action: **Go straight to lesson**. Both routes lead to learning; neither requires a profile form.
- A learning-focus choice may be offered after entry as three plain-language options such as listening, reading, or practical messages. It changes examples and recommendations, not access.
- Do not offer a free-text motivation field or echo unstructured learner input into story dialogue. A display name is optional, defaults to "Learner", and lives in settings. Never require a real name or personal motivation to begin.
- If an optional display-name field is present, omitting it never produces an error. Any real validation error is named beside the field, announced once, and receives focus only after a failed submitted action; it does not interrupt the door or direct-lesson route.
- Door motion is a short transition between two genuine scene states. A static cut is equally valid, and it is the reduced-motion default.

### 2. Campus home

**Purpose:** Orient, invite continuation, and make the chapter's next practical question immediately visible.

The home is a scene, not a dashboard or map.

1. Show the current approved environment at full bleed with no more than one active-place marker and two contextual objects.
2. Place a compact chapter marker at the top edge: term, chapter, and current location. It is text, not a stack of pills.
3. Anchor the current notice and a single line of status in the scene's safe zone.
4. Offer one primary action: **Continue lesson** or **Continue scene**.
5. Put optional chapter navigation, review, accessibility, and settings behind a labelled menu or a slim edge rail. Keep the route visible but quiet.

Do not show coins, shop, social bonds, roster portraits, a six-pin map, or simultaneous location destinations on first view. A learner who chooses **Explore chapter** can see a modest route list with availability stated in text.

### 3. Dialogue

**Purpose:** Explain why the language matters before asking the learner to act.

- A scene is two to six short beats. Show no more than two dialogue lines before an intentional learner action, choice, or transition.
- The scene has one focal portrait at a time. A listening counterpart may be visible only when the composition remains clear at mobile size.
- Each choice represents a tone, order, or helpful response. It never tests hidden story knowledge and never denies the curriculum.
- The dialogue rail always exposes Backlog, Replay beat, Text settings, Audio, Accessibility, and Exit to lesson. Desktop may show labelled icon buttons; compact layouts retain explicit accessible names and tooltips.
- Continue uses a stable button or the documented advance key. It does not pulse indefinitely or use an animated cursor to manufacture urgency.

### 4. Teaching and practice

**Purpose:** Turn the story situation into one comprehensible language action.

Every activity uses this rhythm:

1. **Context:** a small line identifies the notice fragment, speaker goal, or practical consequence.
2. **Teach:** one language insight, with transcription, translation, and a concise example available on demand.
3. **Try:** one answer, ordering, listening, or writing action directly connected to that insight.
4. **See:** feedback explains what changed in meaning or tone.
5. **Carry:** a visible mark, annotation, or completed fragment returns to the notice.

The lesson shell keeps a narrow scene-context band at the top of the content area. It contains the location name, a small approved environment crop, and the active notice excerpt. It is not an opaque hero card, a fake browser tab, or an eight-chip progress wall. The lesson's primary work remains the largest, quietest surface.

Use a single route line for progress. Completed steps are text and a check state, not a row of unrelated capsules. A learner can open transcript, vocabulary, grammar support, or accessibility settings without losing their answer.

### 5. Return and payoff

**Purpose:** Make progress feel consequential without turning it into a reward economy.

- Return to the same place or a deliberately changed approved variant.
- Update one visible story object: a line gains an annotation, a time is clarified, a sign-up list becomes usable, or a message receives an answer.
- Let a character acknowledge useful help in one line. Avoid exaggerated praise, romance language, relationship scores, or celebratory particle effects.
- Show a compact completion summary with **Continue chapter**, **Review this language**, and **Return to campus**. The next action is explicit.
- A missed or incorrect answer returns useful feedback and another path; it never removes the story payoff or locks the learner out of the next lesson.

## Visual grammar

### Art direction

**World:** a fictional, contemporary evening-study community. It should feel lived in through noticeboards, timetables, desks, library shelves, cups, bags, raincoats, bus-stop light, and practical signage. It must not look like a collage of a British landmark and decorative "Japan" signifiers.

**Image language:** original 2D raster scenes with restrained pigment texture and subtle, deliberate grain. The image can be warm and observant without imitating a named studio, artist, franchise, or model-specific aesthetic. "Ghibli-like", "Makoto Shinkai-like", "Persona-like", and similar prompt language are prohibited in art briefs and review notes.

**Character language:** original fictional characters only, shown through a consistent portrait system. Portraits are not full-room AI images; utility SVG is not a substitute for a story portrait. Do not mix a highly rendered face, a flat circle avatar, and an emoji prop in the same focal scene.

**Scene discipline:** one environment gives each beat its spatial meaning. A background never contains unnamed foreground people that compete with controllable portraits. A scene cannot claim a location it does not visually depict.

### Raster scene and portrait requirements

Follow the Environment Bible's delivery sizes and quality gates. The following adds learner-facing use rules.

| Asset               | Required delivery                                                              | Academy rule                                                                                                                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Environment         | 1600 x 900 wide and 900 x 1125 mobile approved variants                        | Compose separate crops, not a responsive crop of one busy wide illustration. Reserve documented dialogue and portrait safe zones. Do not bake critical text into raster art.                                        |
| Environment variant | Distinct approved state when story meaning changes                             | A changed notice, evening light, open door, or rearranged desk can show progress. Do not simulate a new location with a colour filter on the same art.                                                              |
| Portrait            | Transparent, consistent head-and-torso source with a documented face-safe crop | Each approved fictional character gets neutral, speaking, listening, thinking, warm, and resolved expressions before a dialogue-heavy chapter ships. Pose changes must communicate action, not decorate every line. |
| Story prop          | Transparent or scene-integrated object with a text equivalent                  | Notices, phones, and handwritten material must have selectable or separately available text. No lesson instruction may exist only inside an image.                                                                  |
| Utility icon        | Simple vector from the established icon set                                    | Use icons for familiar tools only. Never use decorative icons as a second visual art style or as a replacement for a labelled control.                                                                              |

The legacy `campus-blue-hour.webp`, `rie-sensei.webp`, and `cc0-school-map-marker.png` files are not an approved scene kit. They lack the state, crop, provenance, or grammar needed for release. They may remain private visual prototypes while a reviewer records an explicit disposition; they must not set the canonical visual standard by default.

### Colour roles

Use one token source across Academy UI and raster art. The environment anchors and the existing `--academy-*` variables are the starting system; do not introduce a parallel palette in a scene spec. Exact theme values can vary for light and dark modes, but role names and contrast obligations remain stable.

| Design role       | Existing UI token                            | Environment anchor    | Use                                                            |
| ----------------- | -------------------------------------------- | --------------------- | -------------------------------------------------------------- |
| Deep ink          | `--academy-ink`                              | Indigo `#293e62`      | Main text, top-edge controls, evening depth                    |
| Field green       | `--academy-green`                            | Leaf `#2f7654`        | Primary completion and continue actions                        |
| Wayfinding blue   | `--academy-blue`                             | Campus blue `#3e6f94` | Navigation, links, active route state                          |
| Noticeboard coral | `--academy-rose`                             | Coral `#b96b78`       | Route card, active unresolved item, small moments of attention |
| Practical amber   | `--academy-gold`                             | Amber `#d79a4b`       | Physical light or one earned mark; never currency language     |
| Reading paper     | `--academy-paper` and `--academy-paper-soft` | Paper `#e8dfcf`       | Reading and answer surfaces, balanced by ink and scene colour  |
| Quiet divider     | `--academy-line`                             | Rain stone `#626a74`  | Dividers, inactive states, and quiet structure                 |

- `--academy-green` is the only default primary-action fill.
- Coral marks an unresolved noticeboard item, not an error and not every badge.
- Amber is a one-per-screen accent, never a reward economy.
- Warm paper is a reading surface, not the dominant page theme. Balance it with indigo, green, blue, and real scene colour rather than drifting into an all-beige interface.
- Do not use gradients, glass blur, glow clouds, bokeh, or ornamental light leaks as a substitute for composition.
- Text must meet WCAG AA contrast against its final sampled background, not only a token swatch.

### Typography

Use one readable sans-serif family with competent Japanese support. The default stack is `Inter`, `Noto Sans JP`, `Hiragino Sans`, `Yu Gothic`, and system sans-serif fallbacks. Do not introduce a novelty display face until its Latin and Japanese pairing, licensing, loading, and accessibility have been reviewed.

| Use                    | Desktop              | Tablet           | Mobile           | Notes                                                  |
| ---------------------- | -------------------- | ---------------- | ---------------- | ------------------------------------------------------ |
| Chapter title          | 28px / 36px, 650     | 26px / 34px, 650 | 24px / 32px, 650 | Two lines maximum in the designated title area         |
| Lesson title           | 30px / 38px, 650     | 28px / 36px, 650 | 24px / 32px, 650 | Not a hero headline inside the course surface          |
| Dialogue               | 20px / 30px, 500     | 19px / 29px, 500 | 18px / 28px, 500 | Japanese can use a 2px larger line height where needed |
| Body and teaching copy | 16px / 24px, 400-500 | 16px / 24px      | 16px / 24px      | Never make the default study text smaller than 16px    |
| Labels and metadata    | 12px / 16px, 600     | 12px / 16px      | 12px / 16px      | Use only when it adds orientation                      |

Letter spacing is `0`. Type does not scale with viewport width. Use the stated breakpoints, wrapping rules, and stable containers instead. Japanese, romaji, translations, and furigana are separate semantic layers, never a raster treatment.

### Spacing, edges, and surfaces

- Base spacing unit: 4px. Standard gaps: 8, 12, 16, 24, 32, 48, and 64px.
- Content measure: 640px for a standard lesson reading column; 760px only for structured answer work; never stretch prose across the entire desktop canvas.
- Fixed control heights: 44px minimum for pointer controls, 48px for the primary mobile action, 32px minimum for compact desktop icon controls.
- Corner radius: 6px for buttons, input fields, and framed tools; 2px for small tags; 0px for scene edges. Avoid pills except an intentionally compact status token.
- Use opaque or near-opaque reading surfaces. A scene may be darkened behind dialogue only enough to preserve 4.5:1 text contrast; do not place a giant black slab at the visual centre by default.
- Do not nest cards. A lesson section is a full-width band or an unframed reading column. A framed surface is reserved for an answer activity, a repeated item, or a true modal.

### Controls

| Control          | Rule                                                                                                                                                                                                                  |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Primary action   | One per view. Label it with a concrete verb such as `Continue lesson`, `Open noticeboard item`, or `Check answer`. Use the `--academy-green` fill, 6px radius, and a familiar arrow only when it clarifies direction. |
| Secondary action | Quiet outline or text action. It must not compete with the continuation path.                                                                                                                                         |
| Tool action      | Familiar icon button with tooltip and accessible name. Backlog, sound, settings, text options, and close are tools.                                                                                                   |
| Choice           | Text-first list with stable line height and explicit selected state. Do not present every choice as a floating rounded card.                                                                                          |
| Progress         | A single route line or numbered list. Do not use a row of oversized capsule chips.                                                                                                                                    |
| Status           | Plain text where possible. A colour marker must never be the only sign of completion, availability, or error.                                                                                                         |

## Layout rules

### Scene and dialogue

| Viewport                  | Scene composition                                                                                                                                                                                                                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Desktop, 1200px and wider | Full-bleed environment below a 64px top edge. One portrait can occupy the left or right safe zone. Dialogue is anchored to the opposite lower edge, 560-680px wide, and never covers the main face or the notice. The control rail sits in a predictable edge position.                                 |
| Tablet, 768-1199px        | Environment remains the dominant field. One portrait uses a constrained side crop. Dialogue spans the lower content width with 24px side margins. Chapter navigation becomes a labelled drawer, not a field of map pins.                                                                                |
| Mobile, 767px and below   | Preserve at least the upper 45% of the scene as visible context. Dialogue is a stable lower sheet with 16px margins and a 48px action target. One portrait may appear above or beside the sheet only if the face remains visible and text does not overlap it. Navigation becomes a short ordered list. |

The scene's interaction order is always: skip link, term/chapter context, scene controls, dialogue or activity, choices, then optional navigation. Background hotspots cannot be the sole way to enter a lesson or find an essential location.

### Lesson

- The lesson shell uses the same top-edge identity and the same colour roles as a scene, but it is a calm work surface, not a fullscreen game overlay.
- A 72-96px context band carries a small approved environment crop, location name, chapter, and the active notice fragment. It stays visually subordinate to the lesson title and task.
- The active exercise gets the largest readable area. Supporting transcript, glossary, and notes open in a dedicated region, never as layers on top of the answer field.
- On desktop, navigation may live in a 220px route rail. On tablet and mobile, it becomes a labelled collapsible section placed before or after the content according to reading order.
- The exact course label is fictional Academy language. UCL or Bloomsbury may appear only as a permitted geographic reference in an original fictional setting; never use either as Academy's course, service, staff, event, affiliation, or endorsement identity.

## Motion and sound

### Motion budget

Motion explains a change; it does not provide atmosphere by itself.

| Moment                           | Default motion                                     | Duration  | Reduced motion        |
| -------------------------------- | -------------------------------------------------- | --------- | --------------------- |
| Door entry                       | Simple opacity change or short door-state dissolve | 320-420ms | Immediate cut         |
| Scene change                     | Opacity transition with stable focus target        | 180-240ms | Immediate cut         |
| Portrait entrance or pose change | 8px vertical settle and opacity                    | 160-200ms | Immediate swap        |
| Dialogue advance                 | Content replacement with no cursor chase           | 120-160ms | Immediate replacement |
| Correct completion               | One ink-mark or notice annotation reveal           | 180-240ms | Immediate reveal      |

No falling petals, perpetual parallax, pulse loops, sparkle showers, bouncing advance indicators, floating hearts, or ambient glow objects appear in the default route. Typewriter text is optional and off by default; its setting applies consistently and never delays the accessibility tree.

### Sound budget

- Sound is opt-in, visibly stateful, and controllable in the scene rail and lesson context band.
- Do not autoplay music or preload optional ambient audio when sound is off.
- Use at most three functional cues: quiet confirm, muted transition, and optional scene ambience. No character-like type blips for every glyph.
- Voice or narrated dialogue is optional. It requires a transcript, speaker identification, controls, and an audio-off equivalent.
- A completion cue may play once on a successful action, never as a gamified reward loop.

## Accessibility and learner control

### Non-negotiable behaviour

- The full dialogue, choices, notice text, feedback, and lesson instructions exist as semantic HTML. Images provide supplementary context and concise descriptions.
- Speaker, language, transcript, translation, and ruby/furigana information remain available to assistive technology and keyboard users.
- Use a visible focus indicator with at least a 3:1 contrast relationship to adjacent colours. Do not remove focus rings from scene controls or choices.
- All core routes work with keyboard: `Tab` and `Shift+Tab` move through controls, `Enter` and `Space` activate focused controls, arrow keys move within an explicitly grouped choice set, and `Escape` closes a non-destructive panel. Advance shortcuts do nothing while a text field, audio control, or choice needs that key.
- The backlog is keyboard reachable, contains speaker and line order, and lets a learner replay a beat without losing the lesson state.
- No auto-advance is enabled by default. Timed transitions pause when focus enters an interactive control and offer a manual equivalent.
- Reduced motion removes all non-essential translation, typewriter effect, particles, parallax, and animated emphasis. The resulting screen is a complete designed state, not an empty degraded mode.
- Audio-off, high-contrast, text-size, and simplified-scene settings must persist across onboarding, scene, and lesson routes.
- Colour alone never indicates a correct answer, open route, or resolved notice. Use text, shape, and position together.

### Screen-reader scene model

1. Announce the chapter and location once on entry.
2. Read the current speaker and dialogue as ordinary content, not a continuously updating live region.
3. Announce a concise status only when a choice result, saved progress, or scene transition completes.
4. Expose a short environment description and a separate list of meaningful props. Do not try to narrate every decorative detail.
5. Keep the keyboard focus on the action that follows the new information. Never jump focus into a background image or hidden panel.

## Definition of done for a learner-facing screen

A scene, campus state, or lesson screen is not ready for visual approval until it satisfies all of the following:

- It communicates one clear current story situation without relying on decorative culture markers.
- It has one obvious next action and no more than two optional actions in the first visual scan.
- Its scene, portrait, crop, and story prop have approved provenance and responsive variants.
- Its desktop, tablet, mobile, reduced-motion, sound-off, keyboard, and screen-reader states are reviewed together.
- It can be entered directly from learning and exited without loss of progress.
- Its copy, character, and setting follow the World Bible's fictional, consent-safe, non-gating rules.
- It contains no real institutional branding, unapproved real-person reference, named-style art prompt, protected franchise reference, generic AI motif layer, or unlabelled decorative control.

## Handoff boundaries

- [WORLD-BIBLE.md](WORLD-BIBLE.md) owns fictional canon, narrative safety, learner agency, and story-beat policy.
- [art/ENVIRONMENT-BIBLE.md](art/ENVIRONMENT-BIBLE.md) owns environment art-production constraints and visual quality gates.
- [DESIGNER-PANEL-SPEC.md](DESIGNER-PANEL-SPEC.md) owns the creator-facing panel used to preview scene composition and approve assets.
- This document owns the learner-facing visual grammar and interaction decisions. When a conflict arises, the more protective canon, rights, or accessibility rule wins.
