# Yomu Academy Designer Panel Specification

**Status:** Proposed creator-facing specification

**Owner:** Academy design

**Audience:** Narrative designers, visual designers, accessibility reviewers, audio reviewers, and release approvers. This is not a learner-facing feature.

**Related decisions:** [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md), [WORLD-BIBLE.md](WORLD-BIBLE.md), and [art/ENVIRONMENT-BIBLE.md](art/ENVIRONMENT-BIBLE.md).

## Purpose

The Designer Panel is a focused composition, accessibility-preview, and asset-approval workspace for Academy scenes. It lets a reviewer see the exact learner state before it is released: environment, character expression and pose, crop, dialogue, colour role, motion, audio, assistive text, and responsive layout.

It exists to prevent the current failure mode where a file is visually attractive in isolation but has no stable mobile crop, canonical status, scene-safe dialogue position, accessible equivalent, or rights record.

The panel must make a weak decision obvious. It must not become a second course builder, a generic asset gallery, or a collection of decorative property cards.

## Product principles

- **Preview the learner's real frame.** The panel shows the composed scene, not only an image thumbnail or a raw asset.
- **One decision at a time.** Scene composition is the main task. The inspector changes one coherent dimension at a time.
- **No invisible release path.** An unapproved or incomplete asset cannot quietly appear in a release preview.
- **Accessibility is a preview mode, not a checklist at the end.** Every composition can be inspected in reduced motion, audio off, keyboard focus, screen-reader reading order, enlarged text, and high contrast.
- **Canon and rights are visual requirements.** A beautiful image that conflicts with the World Bible, depicts a real person, uses protected references, or lacks provenance fails approval.
- **Controls match their data.** Tabs or segmented controls switch modes; menus choose an option set; sliders and steppers change numbers; swatches change colour roles; icon buttons invoke familiar tools and expose tooltips.
- **The panel does not silently mutate published content.** It creates a reviewable draft and an explicit approval record. A release owner applies approved changes through the normal content workflow.

## Scope and non-goals

### In scope

- Scene, beat, location, environmental variant, and dialogue-state preview.
- Character, expression, pose, side, scale, and crop preview.
- Wide, tablet, mobile, reduced-motion, audio-off, high-contrast, and keyboard-focus states.
- Dialogue safe zone, text overflow, contrast, and meaningful-prop checks.
- Audio cue, transcript, caption, and sound-off preview.
- Asset provenance, quality gate, review status, and approval history.

### Out of scope

- Drawing, image generation, prompt authoring, or automatic generation of new art.
- Editing a learner's progress, story copy, assessment answers, or personal data.
- A public gallery, social reaction system, shop, collectible system, or relationship meter.
- A way to bypass the World Bible, Environment Bible, accessibility requirements, or release review.

## Core objects

The panel displays these objects as linked records. It should never ask a designer to infer relationships from filenames alone.

| Object              | Required identity              | Required fields                                                                                  | Why it matters                                                                              |
| ------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Chapter             | Term, chapter ID, title        | Canonical status, learner route, chapter owner                                                   | Keeps a scene attached to a purposeful learning arc.                                        |
| Beat                | Beat ID and order              | Scene purpose, dialogue ID, related practice, return/payoff state                                | Lets the preview show a real transition rather than a static poster.                        |
| Scene               | Scene ID and location          | Environment ID, variant, time state, dialogue safe zone, meaningful props                        | Makes one place visibly distinct from a map label.                                          |
| Portrait placement  | Character and expression ID    | Side, scale, anchor, crop, pose, alternate description                                           | Prevents a face from being hidden by dialogue or changed arbitrarily.                       |
| Dialogue state      | Beat and speaker ID            | Existing VN text tokens, language metadata, translations, choices, backlog text, continue target | Supports the visual and semantic version of the same beat.                                  |
| Language annotation | Existing VN token source range | Base text, reading, gloss/translation, display preference, and assistive-text order              | Makes ruby/furigana and translation a real content contract rather than a visual inference. |
| Audio cue           | Cue ID                         | Type, duration, volume, transcript or caption, sound-off behaviour                               | Keeps optional atmosphere from becoming inaccessible information.                           |
| Asset record        | Asset ID and version           | Path, type, dimensions, provenance, rights, approval status, reviewer                            | Prevents unverified files from becoming canonical by accident.                              |

The current content model already has `AssetRights` and content-graph validation. The visual path extends that existing record with visual asset kinds, canonical-fit, crop/safe-zone, reviewer, and approval-state data. The Environment Bible documents the scene inventory and paired files, but has no machine-readable environment manifest yet; author that canonical manifest as a content-graph extension. `public/academy/art/characters/cast/asset-manifest.json` is an input to reconcile, not a source to copy into a parallel store. A bare public path never counts as approval.

The panel reads the existing visual-novel text-token contract for base text, reading, and gloss. It may expose a `Language annotation` view for review, but it must not create a second standalone annotation database or infer a reading from raster pixels.

### Existing-asset reconciliation

Before a new asset is authored, the panel imports a read-only view of the Environment Bible's documented environment variants and paired files, lesson raster assets, rights metadata, and cast manifest. During the first slice, the content-graph environment manifest becomes the source of truth for that view. For each record it shows one explicit disposition:

- **Approved for a documented beat:** all current evidence passes.
- **Prototype:** useful exploration, but unavailable to release preview.
- **Blocked:** missing rights, fictional-canon, consent, crop, or accessibility evidence.
- **Retired:** not selectable for new work; existing references require migration.

The current real-class cast manifest is blocked for learner-facing use unless it is replaced with canonical fictional characters or has a separate narrow consent decision that satisfies the World Bible's people boundary. The panel must never treat a first-name-only reference, a contact sheet, or a prompt as consent.

### Delivery sequence

The full panel follows the World Bible's vertical-slice order; it is not a prerequisite for the first learner route.

1. **Slice support:** extend the existing manifest and rights validation enough to select one approved environment, story prop, and fictional portrait state for the L01/L07 route. Review the direct-learning and accessibility path first.
2. **Composition review:** add the stage, crop/safe-zone, contrast, reduced-motion, sound-off, keyboard, and semantic-reading previews for that route.
3. **Full approval workspace:** add comparative history, asset reconciliation, all mode controls, and multi-chapter release review once the learner slice is stable.

No phase creates a second record store or lets the panel approve an asset that the content graph still marks pending, restricted, blocked, or unreferenced.

## Workspace layout

### Desktop, 1200px and wider

The default workspace is a two-pane framed tool:

- **Preview stage:** Flexible main area, minimum 720px wide. It shows one fully composed learner scene at its selected viewport size, with an optional light checkerboard only behind transparent portrait assets. It is not surrounded by nested cards.
- **Inspector:** Fixed 376px right dock. It has a clear title, review status, and one selected mode. It scrolls independently from the preview.
- **Stage strip:** A thin bottom strip lists the current chapter's beats in sequence with textual state labels. It is a route strip, not a thumbnail carousel.
- **Top tool row:** Back to chapter, viewport selector, preview-state selector, undo/redo, compare approved version, and close. Tool buttons use familiar icons plus tooltips and accessible names.

The stage remains the visual priority. The inspector never overlays the art unless the reviewer explicitly opens a comparison or warning drawer.

### Tablet, 768px to 1199px

- The stage occupies the top 60% of the workspace.
- The inspector becomes a persistent lower panel with the same mode tabs and no loss of controls.
- The beat strip is horizontally scrollable with text labels and a current-beat announcement.
- Wide and mobile preview can be switched; side-by-side comparison is replaced with a toggle and retained crop warnings.

### Mobile, 767px and below

- The panel is a review surface, not a precision authoring surface. It opens as a full-height screen with a stable preview at the top and an inspector sheet below.
- Scene, crop, palette, motion, audio, accessibility, and approval remain available. Fine positioning uses numeric steppers and named anchors rather than drag-only editing.
- The inspector uses a single visible mode at a time. It never hides the current approval warning behind a tab badge.
- A mobile reviewer can approve only when all required checks are already passing; they cannot waive a missing provenance, crop, or accessibility record.

## Modes and controls

The inspector has eight modes. The active mode uses a segmented control on wide screens and a labelled menu on compact screens. Mode state persists per reviewer without changing the published scene.

### 1. Scene

**Purpose:** Select the concrete story moment and make its environmental meaning clear.

| Control              | Type                        | Behaviour                                                                                                                                                 |
| -------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chapter and beat     | Searchable menu             | Shows chapter title, beat order, practice link, and return/payoff relationship. Changing it updates the full composed frame.                              |
| Location and variant | Menu                        | Chooses an approved environment and a meaningful state such as before/after notice clarification. A colour filter cannot stand in for a missing location. |
| Time and weather     | Menu                        | Available only when separately approved in the asset record. It cannot fabricate a time-of-day state.                                                     |
| Story object         | Menu plus read-only preview | Selects the notice, message, sign-up sheet, or other documented object. It displays its semantic text and status.                                         |
| Layer visibility     | Checkboxes                  | Temporarily reveals environment, prop, portrait, dialogue, and control layers for diagnosis. It cannot hide required layers from release approval.        |
| Safe-zone overlay    | Toggle                      | Shows dialogue, portrait, title, system-control, and meaningful-prop exclusion zones for the selected viewport.                                           |

The Scene mode presents one sentence of intent: "What should the learner understand about this place before acting?" The field is required for a draft and visible during review.

### 2. Character and pose

**Purpose:** Place one original fictional character with a readable, non-decorative expression.

| Control                 | Type                           | Behaviour                                                                                                                                                    |
| ----------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Character               | Menu                           | Lists only fictional canonical characters with approved portrait packs. A missing or retired character cannot be selected.                                   |
| Expression              | Swatch grid with text labels   | Neutral, speaking, listening, thinking, warm, and resolved are the baseline expression set. A visual swatch has a text label and alternate description.      |
| Pose                    | Menu                           | Chooses an approved action-relevant pose. It should change only at a real beat or speaker change, not every line.                                            |
| Side and anchor         | Segmented control and menu     | Uses named safe anchors such as left lower, left middle, right lower, right middle, or absent. It does not permit free placement over dialogue or key props. |
| Scale                   | Stepper and slider             | Uses a documented range appropriate to the asset. The stage reports the resulting face size and flags a face that becomes too small to read.                 |
| Facing and mirror state | Toggle                         | Available only where the asset approval allows it. Mirroring cannot reverse readable clothing, props, or cultural text.                                      |
| Alternate description   | Text area with character count | Describes meaningful expression, action, and relation to the notice, not physical appearance in exhaustive detail.                                           |

The panel always exposes a **No portrait** state. An environment may carry a beat more clearly than adding another face.

### 3. Crop and safe zones

**Purpose:** Prove that the same narrative moment works at every required viewport without cropping away its meaning.

| Control                     | Type                                | Behaviour                                                                                                                                                      |
| --------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Viewport                    | Segmented control                   | Desktop 1440 x 900, tablet 1024 x 768, mobile 390 x 844, and narrow mobile 320 x 568. The selected viewport uses real layout rules, not a scaled screenshot.   |
| Crop source                 | Read-only asset data                | Shows approved wide and mobile asset IDs, native dimensions, focal point, and variant. It warns when one asset is being stretched to serve an unapproved crop. |
| Focal anchor                | Named anchor menu plus X/Y steppers | Sets an approved focal area with explicit values. It is never drag-only.                                                                                       |
| Dialogue and portrait masks | Toggle                              | Shows all protected zones at once. A red warning appears if face, speaker name, choice, notice, or action is covered or clipped.                               |
| Text overflow scan          | Action                              | Renders longest approved label, Japanese line, translation, and choice. It reports wrapping, clipping, and touch-target failures.                              |
| Compare crops               | Toggle                              | Alternates wide and mobile composition without changing the scene state.                                                                                       |

Approval fails if a location is only legible in one crop, if the learner loses the notice in mobile, or if dialogue must become so opaque that the environment no longer matters.

### 4. Palette and contrast

**Purpose:** Keep the shared Academy palette coherent while allowing a real scene to have its own light.

| Control                  | Type              | Behaviour                                                                                                                                                                                                           |
| ------------------------ | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Surface role             | Swatch set        | Applies only approved roles from the design system: deep ink, field green, wayfinding blue, noticeboard coral, practical amber, reading paper, or quiet divider. It does not expose an unrestricted rainbow picker. |
| Scene tone               | Menu              | Chooses an approved grade for the asset variant. It cannot apply a generic cinematic gradient or glow layer.                                                                                                        |
| Contrast target          | Toggle            | Shows normal, enhanced, and high-contrast reading states.                                                                                                                                                           |
| Contrast report          | Read-only results | Reports foreground/background pairs for dialogue, controls, focus ring, inactive text, and notice annotation. It flags anything below the agreed threshold.                                                         |
| Decorative-effects guard | Read-only result  | Flags blur glass, gradient overlays, bokeh, glow objects, excessive badges, or a dominant single-hue screen.                                                                                                        |

The panel samples the final composited pixels behind text. Token contrast alone does not pass a scene that has a bright window behind the dialogue.

### 5. Motion

**Purpose:** Review movement as a meaningful transition, not an atmosphere generator.

| Control                   | Type                       | Behaviour                                                                                                                           |
| ------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Transition                | Menu                       | Cut, opacity change, door-state dissolve, or portrait settle. No particle, bounce, pulse, parallax, or sparkle presets are offered. |
| Duration                  | Slider and numeric stepper | Constrained to the design-system budget for the selected transition.                                                                |
| Trigger                   | Menu                       | Entry, learner advance, correct answer, or explicit return. Automatic looping is not an option.                                     |
| Reduced-motion preview    | Toggle                     | Replays the exact complete alternative: cut or immediate state change, not a blank stage.                                           |
| Focus target after motion | Menu                       | Identifies the next keyboard focus target and preview-announcement behaviour.                                                       |
| Motion reason             | Required text field        | States what spatial or instructional change the motion communicates. "Feels lively" is not sufficient.                              |

The stage has a replay button. Motion never restarts continuously while the inspector is open.

### 6. Audio

**Purpose:** Review optional sound without making sound a requirement for understanding.

| Control                 | Type                                  | Behaviour                                                                                                             |
| ----------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Cue                     | Menu                                  | Selects an approved confirm, transition, ambience, or narration asset.                                                |
| Playback                | Familiar play/pause/stop icon buttons | Uses explicit tooltips, accessible names, current time, and a volume control. Playback is always manual in the panel. |
| Gain                    | Slider and numeric stepper            | Constrained to the cue type's approved range.                                                                         |
| Start and stop          | Steppers                              | Shows cue timing relative to the beat. Ambience cannot overlap or obscure narration.                                  |
| Loop                    | Checkbox                              | Available only to approved ambience, never for confirmation or reward cues.                                           |
| Transcript and captions | Linked read-only preview              | Displays the exact semantic text, speaker, language metadata, and sound-off equivalent.                               |
| Sound-off preview       | Toggle                                | Mutes playback and verifies that all necessary information remains visible.                                           |

Approval fails if a cue starts automatically when sound is off, has no transcript where one is needed, repeats as a reward loop, or conveys a required answer state through sound alone.

### 7. Accessibility

**Purpose:** Inspect the actual learner interaction model, not a visual approximation of accessibility.

| Control                                      | Type                   | Behaviour                                                                                                                                                                                       |
| -------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reading order                                | Ordered list           | Shows the semantic order for skip link, context, controls, dialogue, choices, feedback, and optional route navigation.                                                                          |
| Screen-reader preview                        | Playable text sequence | Reads the scene's supplied names, descriptions, status messages, language labels, and choice states in order. It does not infer text from raster pixels.                                        |
| Keyboard preview                             | Toggle                 | Makes focus visible and lets the reviewer use the real Tab, Shift+Tab, Enter, Space, arrow, and Escape behaviour.                                                                               |
| Text-size preview                            | Segmented control      | Shows default, 125%, and 200% text-size layouts without clipping or overlap.                                                                                                                    |
| Language support                             | Toggle set             | Shows original text, translation, romaji where supplied, and ruby/furigana presentation from linked language-annotation records. The panel flags an inferred, raster-only, or unlinked reading. |
| Reduced-motion, sound-off, and high-contrast | Toggles                | Can be combined so reviewers see the hard case, not each preference in isolation.                                                                                                               |
| Non-colour signal check                      | Read-only result       | Lists completion, correctness, availability, and warning indicators with their text and shape counterparts.                                                                                     |

The accessibility mode reports a blocking error for missing image descriptions, inaccessible controls, focus loss, text overflow, colour-only states, hidden dialogue controls, or a missing manual equivalent for timed behaviour.

### 8. Approval

**Purpose:** Turn review into an accountable release decision.

The approval view is deliberately plain. It has one status header, a required checklist, a version timeline, reviewer identity, and a concise decision note. It does not use celebratory animations or reward language.

#### Status model

1. **Draft:** Editable composition; never available to release previews.
2. **Ready for review:** Required scene data is present but not yet approved.
3. **Changes requested:** A reviewer has identified blocking work. The reason is visible beside the affected field.
4. **Approved:** Specific asset version and composition are allowed for the documented chapter and beat.
5. **Retired:** No longer selectable for new work. Existing released use needs an explicit migration decision.

There is no generic "looks good" state. Approval is versioned and scoped to the stated asset, scene, crop, and content use.

#### Rights and lifecycle mapping

The panel keeps rights clearance and design lifecycle distinct, but maps them explicitly to the existing `AssetRights.status` value:

| `AssetRights.status` | Permitted panel lifecycle                                         | Release meaning                                                                                                                                                |
| -------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pending`            | Draft, Ready for review, Changes requested, Prototype, or Blocked | Never selectable for a release preview. Missing evidence stays attached to the source record.                                                                  |
| `cleared`            | Ready for review, Approved, or Retired                            | Approval may occur only after every composition, canon, accessibility, and audio check passes. Retired remains rights-cleared but is unavailable for new work. |
| `restricted`         | Blocked or Retired                                                | Never selectable. A migration decision is required wherever it is already referenced.                                                                          |

`Approved` is therefore a scoped design decision on a cleared asset version, not a replacement for rights clearance. `Blocked`, `Prototype`, and `Retired` are panel dispositions; they do not overwrite the rights record.

#### Required approval evidence

| Area                   | Required evidence                                                                                                                                                                                                                                                    |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity               | Asset ID, immutable version, file path, type, dimensions, chapter/beat use, and owner                                                                                                                                                                                |
| Provenance and rights  | Creation source, rights holder, date, approved use, tool/process disclosure where relevant, source references, and confirmation that no unapproved real-person likeness, personal data, logo, trademark, franchise, named artist, or named studio reference was used |
| Canon                  | Fictional setting and character fit, World Bible check, no learner-name requirement, no institutional branding claim, no story gating                                                                                                                                |
| Art quality            | Environment Bible checklist, coherent rendering grammar, no accidental text, no impossible anatomy or object continuity, no background people competing with portrait control, no generic motif clutter                                                              |
| Responsive composition | Wide, tablet, mobile, and narrow-mobile crop checks; dialogue, portrait, title, and notice safe zones pass                                                                                                                                                           |
| Accessibility          | Semantic description, reading order, keyboard, focus, reduced motion, sound-off, contrast, text-size, language-support, and non-colour checks pass                                                                                                                   |
| Audio                  | Cue type, timing, gain, transcript/caption, sound-off equivalent, and autoplay behaviour pass                                                                                                                                                                        |
| Review                 | Named reviewer, date, decision note, requested-change links, and approved version comparison                                                                                                                                                                         |

The **Approve** control remains unavailable until every required evidence item has a passing result. It has a confirmation dialog that names the exact asset version and beats being approved. A later asset edit automatically returns the affected record to **Ready for review**.

## Preview sequence

Reviewing a single static frame is insufficient. The panel must provide a short sequence preview:

1. Door or campus entry state.
2. Current scene with the first dialogue line.
3. Choice or language prompt state.
4. Teaching/practice handoff with the scene-context band.
5. Return/payoff state with the changed notice or environment detail.

The reviewer can step through it manually, replay an individual beat, and compare the approved version. The sequence uses the same data and layout contract as the learner-facing runtime. It must not rely on a separate perfect mockup.

## Warnings and failure states

Warnings are specific, located near the decision that causes them, and remain visible in the approval summary.

| Warning                                                                                                                        | Blocking result                                                             |
| ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| Portrait face intersects dialogue mask on mobile                                                                               | Cannot request review until a different anchor, crop, or asset is selected. |
| Notice text is only baked into a raster image                                                                                  | Cannot approve until semantic text and alternate description are linked.    |
| Scene uses a raw file path with no provenance                                                                                  | Cannot select for release preview.                                          |
| Character has no fictional-canon approval                                                                                      | Cannot select a portrait pack.                                              |
| Scene looks like a new location but reuses an unchanged image with a colour overlay                                            | Requires a distinct approved state or a corrected story claim.              |
| Colour contrast passes tokens but fails composited pixels                                                                      | Cannot approve until surface or composition changes.                        |
| Motion has no instructional/spatial reason or no reduced-motion equivalent                                                     | Cannot approve.                                                             |
| Audio conveys required feedback with no visual or text equivalent                                                              | Cannot approve.                                                             |
| A real institution, named style, protected franchise, or unapproved real-person reference appears in the brief or asset record | Requires removal and a new review.                                          |
| Text, focus indicator, or touch target clips at the narrow mobile state                                                        | Cannot approve.                                                             |

The panel never quietly replaces a missing asset with a generic SVG avatar, placeholder image, emoji, gradient, or stock-like graphic in the release preview. It shows an explicit missing-state warning instead.

## Keyboard and screen-reader contract for the panel

- All inspector fields have visible labels, descriptions, current values, and error messages.
- Tabs announce their selected state; compact mode menus announce the active mode.
- Sliders have keyboard increments and a numeric stepper alternative. Dragging is optional, never required.
- Swatches expose role name, hex value, selected state, and contrast outcome.
- The preview stage has an accessible text summary that updates when the selected beat changes. Its visual canvas is never the only source of information.
- Focus remains in a predictable sequence. Opening a warning details panel moves focus to its heading; closing returns focus to its trigger.
- The only global keyboard shortcuts are documented in the top tool row and disabled while text input is active. `Escape` closes a non-destructive panel; it never discards a draft.
- Errors are announced once when introduced and remain discoverable in the approval summary. They do not repeatedly interrupt editing through aggressive live regions.

## Review roles

| Role                   | Can do                                                                                  | Cannot do                                                         |
| ---------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Narrative designer     | Select chapter, beat, dialogue state, story object, and route intent; prepare a draft   | Approve their own rights or accessibility evidence alone          |
| Visual designer        | Compose approved scene and portrait assets; set crop, colour role, and motion rationale | Introduce unapproved asset provenance or waive a failed crop      |
| Accessibility reviewer | Validate semantic, keyboard, text, motion, contrast, and sound-off states               | Override canon or rights blockers                                 |
| Audio reviewer         | Validate cues, timing, transcripts, and sound-off behaviour                             | Make audio required for comprehension                             |
| Release approver       | Record an approval decision after all evidence passes                                   | Bypass a blocking warning or silently alter a later asset version |

For small teams, one person may hold multiple roles, but the approval record must still distinguish self-checks from the final release decision.

## Acceptance criteria

The Designer Panel is ready to support Academy content only when a reviewer can:

1. Open a real chapter beat and see its composed learner frame at desktop, tablet, mobile, and narrow-mobile sizes.
2. Change scene, pose, crop, palette role, motion, audio, and accessibility mode with controls appropriate to each value type.
3. Preview the entry, dialogue, practice handoff, and return/payoff sequence without leaving the workspace.
4. Identify an unsafe crop, missing semantic text, contrast failure, missing reduced-motion path, or audio-only cue before approval.
5. Inspect a specific asset's provenance, canonical fit, rights record, and revision history without searching source files.
6. Approve only a passing, versioned, scoped composition and see an unapproved edit automatically require review again.
7. Operate the panel by keyboard and understand its preview through screen-reader-oriented text summaries.

Until those conditions are true, the panel is a mockup. It must not be treated as proof that a scene is release-ready.
