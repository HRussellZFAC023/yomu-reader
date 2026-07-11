---
title: "Yomu Academy: Visual-Novel Craft & Player Spec"
description: "A craft and implementation contract for the Academy dialogue player — dialogue-box UX, scene/choice flow, learning integration, accessibility, and a compatible data schema plus scene state machine."
---

# Yomu Academy: Visual-Novel Craft & Player Spec

**Status:** implementation-ready craft contract for the Academy scene player. Extends `WORLD-BIBLE.md` (product/content canon) and `USER-RESEARCH.md` (needs). This document is the reference for the runtime that plays a `StoryBeat` sequence and hands off to a core activity. It proposes concrete types that are backward-compatible with `src/academy/world.ts`.

## 1. Design North Star

Two influences, held in tension deliberately.

**Persona-style confidant structure — borrow the shape, refuse the pressure.** Persona's Social Links / Confidants work because each supporting character has a legible arc, a clear "you spent time and it mattered" payoff, and short self-contained scenes that always end somewhere useful. We adopt: named cast with one practical relationship each, a visible familiarity ladder (`Study Connections`, three steps), short scene budgets, and a satisfying "one more clear thing exists now" beat. We **reject** the mechanics that create obligation: no calendar pressure, no rank-locked content, no wrong-choice affinity loss, no romance routes, no "you have limited time slots" scarcity, no reversal where neglecting a character costs progress. In Yomu Academy the confidant structure is a *surfacing* device for optional support conversations and recaps — never a gate, a currency sink, or an emotional debt.

**Ghibli emotional restraint — small stakes, honest warmth, silence that carries weight.** Ghibli earns feeling through the specific and the mundane (a meal, a walk, a clear morning) rather than through spectacle or manipulation. We adopt: human-scale stakes (a noticeboard that needs to be clearer), unhurried pacing that tolerates a pause, warmth without saccharine copy, and the willingness to let a beat be quiet. We **reject** melodrama, jump-scares, guilt copy, artificial urgency, and any "the character is sad because you left" framing. Emotional restraint is also an accessibility posture: no shaking, no strobing, no autoplay stings, no emotional pressure to keep going.

| Persona gives us | Ghibli gives us | We explicitly refuse |
| --- | --- | --- |
| Legible per-character arcs, short scenes, "it mattered" payoff | Human-scale stakes, unhurried pacing, warmth without spectacle | Time pressure, rank gates, affinity loss, romance routes, guilt copy, melodrama, autoplay stings |

**Non-negotiable inherited from the bible:** the visual novel is presentation only. Skipping any scene yields the *exact same* linked activity, review scheduling, placement, and completion state. A choice is cosmetic or practice-order — never assessment, never entitlement.

## 2. Dialogue-Box UX

### 2.1 Anatomy of the box

A single dialogue frame at rest contains, in reading order (this is also the DOM/screen-reader order):

1. **Speaker nameplate** — text label (e.g. `Suzu`, `Leo`, `You`), never colour-only. Optional small role subtitle on first appearance ("Open Door Desk").
2. **Portrait + expression** — a static character portrait keyed to the beat's expression. Decorative for sighted users; **never carries information not also in text**. Marked `aria-hidden` unless the expression itself is meaningful, in which case a short `alt` states it plainly ("Suzu, thinking").
3. **Japanese line** — `lang="ja"`, primary content, furigana density and romaji per Access profile.
4. **Reading support** — English translation and/or grammar note, layered (collapsible), never dumped inline mid-sentence.
5. **Advance affordance** — a visible "continue" indicator (▸) that is a real focusable control, not just a blinking glyph.
6. **Persistent control rail** — Backlog, Auto, Skip, Speed, Access, and Skip-to-practice. Always present, always reachable, never auto-hiding on a timer (auto-hide chrome fails keyboard and screen-reader users and violates "captions do not disappear before the learner advances").

The box is one ARIA live region for the *current* line only (`aria-live="polite"`, `aria-atomic="true"`). History lives in the Backlog, not in an ever-growing live region (announcing the whole log on every advance is a screen-reader anti-pattern).

### 2.2 Typewriter reveal

The typewriter is a *presentation flourish*, not a gate on comprehension. Rules:

- **Adjustable speed.** A `textSpeed` setting with discrete steps: `Instant · Fast · Normal · Slow`. Persisted in the Access/story profile. Expressed as characters-per-second, but the setting label is plain-language, not a number.
- **Instant is a first-class equivalent.** At `Instant`, the full line renders in one frame with no animation — the same content, same layout, same advance model. Reduced-motion **forces Instant** (a per-character reveal is animation) unless the learner has explicitly overridden speed; the reveal is motion by definition, so `prefers-reduced-motion` and the in-app reduced-motion toggle both pin it to Instant.
- **Click / key to complete (two-stage advance).** The primary action is context-sensitive: if the line is still typing, the action *completes it instantly*; if the line is fully shown, the same action *advances to the next beat*. This is the universal VN convention and must be honoured for pointer (click anywhere in the box), keyboard (Enter/Space and Down/→), and touch (tap the box). One control, two meanings by state — never punish a fast tapper by skipping a whole line.
- **No CPS floor traps.** Speed is measured in glyphs, but grapheme clusters (kana + combining, emoji) reveal atomically; never split a character mid-cluster.
- **Furigana reveals with its base.** Ruby appears when its base kanji appears, not letter-by-letter over the reading.
- **Sound coupling is optional and gated.** If a typewriter "blip" sound exists, it obeys the sound preference (`full`/`quiet`/`off`) and never plays at `off`. Audio is never required to know the line is done — the completed state is visual (advance glyph appears) and programmatic (control state changes).

### 2.3 Backlog / history

- **Backlog** (a.k.a. log/history) is always one action away (control-rail button + keyboard shortcut, conventionally `L` or `H` or `Backspace`/`↑`).
- Shows prior beats in order: speaker, Japanese, and whatever support layers were active, plus any choice the learner made ("You chose: ask, then check").
- **Scrollable, re-readable, and screen-reader navigable** as a normal document region (`role="log"` or a labelled list), *not* a live region — the learner reads it on demand.
- **Replay-audio per line** where a voiced asset exists (optional; obeys sound pref).
- Backlog is capped to the current scene by default (bounded memory), with the option to include prior scenes of the same episode. It stores only seen beat IDs + resolved text; it is not analytics.
- Closing the backlog returns focus to the exact control it was opened from (focus restoration).

### 2.4 Skip

Two distinct behaviours, both non-punitive:

- **Skip scene** (the bible's contract): abandons the remaining beats, shows the one-sentence recap, and opens the linked practice — identical downstream state. This is the accessibility-critical skip and is always visible.
- **Skip-read / fast-forward** (the Persona-style hold-to-skip): rapidly advances *already-seen* beats. Default is **skip-seen-only** to protect first-time content and choices; an explicit "skip unseen too" toggle exists for re-players. Fast-forward halts at any unseen beat, at any choice, and at the scene end. It is a convenience, not the accessibility skip — the accessibility skip is "Skip scene".
- Neither skip ever changes reward, unlock, recap availability, or review scheduling. First-play vs replay is tracked (see `CampusScenePlaythrough` in `world.ts`) but skip state does not.

### 2.5 Auto

- **Auto-advance** plays lines and advances after a dwell time computed from line length (a readable words-per-minute baseline) plus a fixed floor, optionally + voice duration when a voiced asset is playing.
- **Off by default** (bible mandate) and **disabled entirely under reduced motion / when `prefers-reduced-motion` is set** — auto-advance is a timed motion behaviour and a WCAG timing concern.
- Any input (tap, key, pointer move onto a control) **pauses Auto immediately**; it never fights the learner.
- Auto never skips a choice, never auto-selects, and never advances past the scene end into the activity — the activity handoff is always a deliberate act.
- Dwell time is generous and adjustable (couples to `textSpeed`), and Auto exposes a plain "Auto is on — tap to pause" state, not a silent countdown.

### 2.6 Name insertion (learner addressing)

- The learner may stay **unnamed** (bible: no real name is requested). The default address term is a neutral placeholder that reads naturally in both languages — English "you" and a soft Japanese address that does not presume gender, status, or relationship.
- If the learner *optionally* provides a display name (local-only, never uploaded, freely editable/erasable), it is inserted via a token in authored lines, e.g. `{learner}` / `{learner:ja}`, with a **guaranteed grammatical fallback** so a line reads correctly whether or not a name is present. Authors must write the line to be correct in the no-name case first.
- Name tokens are the *only* templated field in a line; no other personal data is ever interpolated. Insertion is a pure string substitution at resolve time, escaped for HTML, and applied equally to the caption/transcript so audio-off parity holds.
- The nameplate for the learner's own lines uses the same token; "You" is the safe default.

### 2.7 Control affordance matrix

| Action | Pointer | Keyboard | Touch | Notes |
| --- | --- | --- | --- | --- |
| Complete line / Advance | Click box | `Enter` / `Space` / `→` / `↓` | Tap box | Two-stage by line state |
| Back one beat | Click ◂ | `←` / `↑` / `Backspace` | Tap ◂ | Re-reads; never re-fires effects |
| Open Backlog | Click Log | `L` (or `H`) | Tap Log | Focus-trapped panel, `Esc` closes, focus restored |
| Auto toggle | Click Auto | `A` | Tap Auto | Disabled under reduced motion |
| Fast-forward (skip-seen) | Hold Skip | Hold `Ctrl` / `Tab`-to-button + hold | Long-press Skip | Halts at unseen/choice |
| Skip scene | Click Skip scene | Focusable button + `Enter` | Tap Skip scene | Opens recap + linked activity |
| Choose option | Click option | `Tab` to option + `Enter`; number keys `1..n` | Tap option | Roving focus, visible focus ring |
| Speed / Access | Click gear | `Tab` + `Enter` | Tap gear | Applies in place, saved locally |
| Skip to practice | Click button | Focusable + `Enter` | Tap button | Always present per bible |

Every control has a visible focus ring, a ≥44px touch target, a non-drag alternative, and a text label or `aria-label` — never icon-only-by-colour.

## 3. Scene & Choice Flow

### 3.1 Scene as a beat sequence

A scene is an ordered list of **beats** (2–6, bible budget), each a `StoryBeat` with one communicative intent. A beat resolves to one `DialogueVariant` chosen by the learner's active level (N5 / bridge / N4). Beats are linear by default; branching exists only for cosmetic/practice-order choices that **rejoin** a common continuation.

Scene lifecycle: `enter → (play beats, with optional choices) → scene-complete → recap available → linked-activity handoff`. The activity may be entered before, during, or after the scene; the player remembers the last beat separately from activity progress (bible §Scene budget).

### 3.2 Choices — cosmetic or practice-order only

Per `StoryChoiceEffect = 'cosmetic' | 'practice-order'` (bible) and the runtime `CampusSceneChoiceDefinition` (which today carries only `label` + `reflection`):

- **Cosmetic** — flavour/phrasing; changes a following line's wording or a recap sentence. Records the choice for backlog + reflection copy. Writes nothing to mastery, placement, currency, unlock, or bond.
- **Practice-order** — reorders or re-frames the *upcoming practice items* (e.g. "start with the reason" vs "start with the sequence" seeds the linked activity's first prompt). Still touches only presentation order of practice the learner would do anyway; the item set, grading, and outcome are identical.
- A choice may present a **consequence preview** (bible `consequencePreview`) so the learner makes an informed, low-stakes pick — reinforcing that nothing is hidden or punitive.
- Choice branches must **rejoin**: after N beats they converge so no path withholds content, a recap, or a linked activity. There is no dead-end or lock-out branch.
- Re-selecting a choice on replay is always allowed; the reducer overwrites the prior `CampusChoiceRecord` for that scene (already the behaviour in `applyAcademyWorldAction` → `select-scene-choice`).

### 3.3 Confidant structure without gating

Study Connections (bible §Bonds) map the Persona shape onto non-gating rails:

- Each cast member has a 3-step familiarity ladder (`MAXIMUM_BOND_LEVEL = 3`) that **only surfaces optional support conversations and recaps**.
- A support conversation is a short authored exchange with a language purpose and a visible **Skip to practice**; completing it may raise the bond, which unlocks *more optional* conversations/recaps — never core content.
- Bonds never decay, never gate, never guilt. A learner who hides Study Connections entirely receives every core task and recap.

## 4. Keeping Learning Integral (Not Bolted On)

The story must make the *language* the thing the learner leans into, not a wrapper around it.

- **The beat's intent is a communicative task.** Every beat is authored intent-first (confirm a meeting; ask what to bring; give a route). The scene exists to give that task a reason and a place, then hand to a linked activity that assesses it properly.
- **Level variants keep the same task, not the same difficulty.** N5 → bridge → N4 preserve intent and linked activity; bridge introduces exactly one tagged expansion that can be isolated, replayed, or collapsed. Manual level switching is always available and never re-locks content.
- **In-line study affordances.** Every Japanese line supports tap/hover lookup (Yomu's core competence), per-word furigana/pitch, and a collapsible grammar note — so reading the scene *is* studying, at the learner's chosen support depth.
- **The linked activity is the assessment, the scene is not.** Only a `record-academy-demonstration` from a real activity moves a competency gate. Reading, choosing, replaying, and bonding record nothing as mastery (world.ts docstring + bible invariant 6).
- **Recap as consolidation, not withholding.** The recap restates the beat's language purpose in one sentence and links the practice. Skipping never withholds learning content; the recap is the same whether reached by finishing or skipping.
- **No comprehension paywall.** Support layers (translation, furigana, romaji, grammar) are independent toggles; hiding one never deletes information required to do the task (bible authoring check 7).

## 5. Accessibility (First-Class, Not a Mode)

The scene player must be fully usable with audio off, motion reduced, keyboard only, touch only, and a screen reader — each of these is a *complete* path, not a degraded one. This section is a hard gate, aligned to the bible's Accessibility & Control Contract.

### 5.1 Audio-off equivalence

- With Audio off: **no audio fetch, no autoplay, no playback requirement, no microphone prompt.** The text-first transcript + a visual timing cue provide the *complete* learning equivalent.
- Every voiced line has a matched transcript/caption authored *before* audio (bible authoring check 5). The transcript can always stand in for audio.
- Speaking practice outcomes are fully satisfiable by text rehearsal + self-assessment; microphone is optional, local-only, deletable.
- Typewriter and Auto have no audio dependency; completion/advance state is visual + programmatic.

### 5.2 Captions

- Every voiced line shows accurate captions with **speaker identification** and meaningful non-speech cues.
- Captions **do not disappear before the learner advances** — no timed vanish. The current line persists until the learner acts.
- Captions are the same text as the transcript/backlog entry (single source), so there is no drift between modes.

### 5.3 Reduced motion

- Honour both the OS `prefers-reduced-motion` and the in-app `motion: 'reduced'` toggle (world.ts `getWorldPresentation` already collapses these into `animateTransitions`).
- Under reduced motion: **disable parallax, pan, zoom, shake, particles, blinking, animated transitions, and auto-advance; force typewriter to Instant.** Scene changes are static cuts with a clear text state ("Scene: Gordon Square").
- Portraits swap without cross-fade; the advance glyph is static (no blink) or respects the reduced-motion cut.

### 5.4 Keyboard

- Every action is keyboard-reachable with a **visible focus ring** and conventional keys (advance, back, log, auto, skip, choose 1..n, Access).
- A logical tab order matches reading order; the box's primary advance is on `Enter`/`Space` without requiring focus hunting.
- Modal panels (Backlog, Access, choice menus that trap) trap focus, close on `Esc`, and **restore focus** to the opener.
- No keyboard trap anywhere; no action is pointer-only or drag-only.

### 5.5 Screen reader

- Semantic headings, **speaker labels announced with each line**, labelled controls, and reading-order parity between DOM and visual layout.
- **Live-region restraint:** only the current line is a polite live region (`aria-atomic`); the backlog is an on-demand `log`/list, not a live region. Portraits are `aria-hidden` unless the expression is load-bearing (then a plain `alt`).
- The map/location/choice selection has a **text route** (a labelled list), never a purely spatial/canvas interaction.
- Typewriter does not spam the live region per character — announce the completed line once (render the full text to the accessibility tree even while the visual reveal is mid-animation; screen-reader users effectively get Instant).
- State changes ("Auto on", "Scene skipped", "Practice ready") are announced concisely.

### 5.6 Skippability & interruption

- Every scene has **Skip scene** and **Recap** controls, always visible.
- **No timed decision.** Pause, leave, and resume preserve the current beat and any draft. There is no streak loss, deadline, or penalty for leaving (bible §Scene budget + Time and interruption).
- Auto and fast-forward are conveniences layered *on top of* a fully manual, untimed baseline — never the only way through.

### 5.7 Colour & visual state

- Never encode task state, bond state, correction, speaker, or location by **colour, motion, sound, or decoration alone** — always pair with text/shape/label.

## 6. Concrete Data Schema (Compatible with `world.ts`)

The runtime today (`src/academy/world.ts`) models a scene as `CampusSceneDefinition` with `AdaptiveDialogueLine[]` where each line has `speaker` + `n5`/`n4` `DialogueText`. The bible declares an aspirational `StoryBeat`/`DialogueVariant`/`StoryChoice` graph with a **three-tier** `n5|bridge|n4` model, portraits/expressions, linked activities, and rights. The schema below **bridges the two**: it is additive to the runtime types (existing content keeps working; new fields are optional) and satisfies the bible's invariants.

### 6.1 Compatibility strategy

| Bible / desired | Runtime today (`world.ts`) | Proposed compatible move |
| --- | --- | --- |
| `StoryBeat` | `AdaptiveDialogueLine` (one line) | Rename-free: a beat = one `AdaptiveDialogueLine` extended with optional `id`, `intentId`, `expression`, `bridge`, `linkedActivityId`, `recap`, `rights`. Existing 2-line scenes remain valid. |
| `DialogueVariant.level ∈ n5\|bridge\|n4` | `n5` + `n4` only | Add optional `bridge?: DialogueText`; resolver falls back `bridge ?? n4` then `?? n5`. `AcademyLanguageLevel` gains optional `'bridge'` at the *resolver* layer without breaking the stored `'N5'|'N4'` union. |
| Portrait + expression | none | Add optional `portraitId` on speaker + `expression` on the line/beat, keyed to a rights-cleared asset registry. Purely presentational. |
| `StoryChoiceEffect` | `CampusSceneChoiceDefinition` (label+reflection) | Add optional `effect: 'cosmetic'\|'practice-order'` (default `'cosmetic'`) + optional `consequencePreview`. Choice remains non-academic. |
| Linked activity | scene `reward` only | Add optional `linkedActivityId` on scene and/or beat, resolving to a real core activity. |
| Recap | `getWorldRecap` (chapter-level) | Add optional per-scene `recap: DialogueText`; falls back to the generated chapter recap. |
| Rights | none in world.ts | Add optional `rights: AssetRights` on any beat carrying a voiced/visual asset; required before an asset ships (validated in tests). |

All new fields are **optional**, so `as const satisfies readonly CampusSceneDefinition[]` content compiles unchanged; the player degrades gracefully when a field is absent.

### 6.2 Proposed types

```ts
// --- additive to world.ts; nothing below removes or narrows an existing field ---

export type StoryLevel = 'n5' | 'bridge' | 'n4';
export type StoryChoiceEffect = 'cosmetic' | 'practice-order';
export type SpeakerExpression =
  | 'neutral' | 'warm' | 'thinking' | 'encouraging' | 'surprised' | 'relieved';

/** Rights provenance — mirrors the existing Academy asset metadata; required before an asset ships. */
export interface AssetRights {
  readonly origin: 'original' | 'licensed' | 'open-license' | 'learner-contributed';
  readonly status: 'draft' | 'cleared';
  readonly rightsHolder: string;
  readonly license: string;
  readonly attribution: string | null;
  readonly permittedUses: readonly string[];
}

/** A speaker's presentational identity. Portraits are decorative unless expression is load-bearing. */
export interface SpeakerPresentation {
  readonly speaker: AdaptiveDialogueLine['speaker']; // 'campus-guide' | 'learner' | 'classmate'
  readonly nameplate: DialogueText;                  // e.g. { ja: 'すず', en: 'Suzu' }; learner uses {learner} token
  readonly portraitId: string | null;                // key into a rights-cleared portrait registry
  readonly roleSubtitle: DialogueText | null;         // shown on first appearance only
}

/** One language variant of a beat. Preserves the beat's intent + linked activity. */
export interface DialogueVariant {
  readonly level: StoryLevel;
  readonly text: DialogueText;                 // ja + en; en is the caption/translation source
  readonly grammarTags: readonly string[];     // curriculum tags; each ≤ this variant's support level
  readonly supportAssetIds: readonly string[]; // optional grammar-note / audio asset refs
  readonly audioAssetId: string | null;        // if present, must have a transcript == text.ja
}

/**
 * A single beat. Backward-compatible superset of AdaptiveDialogueLine:
 * `speaker`, `n5`, `n4` still satisfy the existing shape; everything else is optional.
 */
export interface StoryBeat extends AdaptiveDialogueLine {
  readonly id?: string;                        // stable beat id for backlog / seen-state
  readonly intentId?: string;                  // communicative intent (authored first)
  readonly bridge?: DialogueText;              // the third tier the bible mandates
  readonly expression?: SpeakerExpression;     // presentational; text always carries the meaning
  readonly portraitId?: string | null;
  readonly linkedActivityId?: string;          // resolves to a real core activity, if any
  readonly recap?: DialogueText;               // one-sentence consolidation
  readonly rights?: AssetRights;               // required iff the beat carries a shippable asset
  readonly variants?: readonly DialogueVariant[]; // canonical multi-tier form; overrides n5/bridge/n4 if present
}

/** Choice — cosmetic or practice-order only; never academic. Superset of CampusSceneChoiceDefinition. */
export interface StoryChoice extends CampusSceneChoiceDefinition { // id, label, reflection
  readonly effect?: StoryChoiceEffect;         // default 'cosmetic'
  readonly consequencePreview?: DialogueText;  // "You'll start with the reason."
  readonly rejoinBeatId?: string;              // branch converges here; guarantees no lock-out
  readonly practiceOrderSeed?: readonly string[]; // for 'practice-order': first practice prompt ordering
}
```

The scene container stays `CampusSceneDefinition`; `dialogue: readonly AdaptiveDialogueLine[]` is *assignable from* `StoryBeat[]` because `StoryBeat extends AdaptiveDialogueLine`. Optionally widen the field to `readonly (AdaptiveDialogueLine | StoryBeat)[]` for clarity, plus optional scene-level `linkedActivityId` and `recap`.

### 6.3 Level resolution (extends `getSceneDialogue`)

```ts
export interface ResolvedBeat {
  readonly beatId: string | null;
  readonly speaker: AdaptiveDialogueLine['speaker'];
  readonly level: StoryLevel;
  readonly japanese: string;      // caption / transcript source (single source of truth)
  readonly english: string;
  readonly grammarTags: readonly string[];
  readonly expression: SpeakerExpression;
  readonly portraitId: string | null;
  readonly audioAssetId: string | null;
  readonly recap: string | null;
  readonly hasLinkedActivity: boolean;
}

/** Deterministic tier fallback so no learner ever hits an empty line. */
function resolveVariant(beat: StoryBeat, level: StoryLevel): DialogueVariant {
  if (beat.variants?.length) {
    return beat.variants.find(v => v.level === level)
        ?? beat.variants.find(v => v.level === 'bridge')
        ?? beat.variants.find(v => v.level === 'n4')
        ?? beat.variants[0]!;
  }
  // legacy AdaptiveDialogueLine path: n5 / bridge? / n4
  const text = level === 'n5' ? beat.n5
             : level === 'bridge' ? (beat.bridge ?? beat.n4)
             : beat.n4;
  return { level, text, grammarTags: [], supportAssetIds: [], audioAssetId: null };
}
```

`getAcademyLanguageLevel` still returns the stored `'N5' | 'N4'`; the player maps it to `StoryLevel` and lets the learner *manually* select `'bridge'` for the current scene without mutating stored demonstrations (a presentation-only override, per bible "manual N5/bridge/N4 route switching").

### 6.4 Invariants enforced in tests (from bible §Content and State Model)

1. `linkedActivityId`, when present, resolves to a valid core activity.
2. All variants of a beat share `intentId` and linked activity.
3. No variant's `grammarTags` exceed its declared level.
4. Every `audioAssetId` has a transcript equal to the variant `ja`; the transcript alone satisfies Audio off.
5. Every beat is skippable and has a resolvable recap (own or chapter fallback).
6. Every choice `effect` is `'cosmetic'|'practice-order'` and writes to none of mastery/placement/currency/entitlement.
7. Every shippable asset has `rights.status === 'cleared'`.
8. No content field accepts real-person details.

## 7. Scene Player State Machine

A small, deterministic state machine plays one scene. It is **presentation state only** — it holds no mastery, never writes competency gates, and derives everything replayable from the immutable `CampusSceneDefinition` + persisted `AcademyWorldState`. Side-effectful transitions (choice recorded, scene completed) are delegated to the existing `applyAcademyWorldAction` reducer so world state stays the single source of truth.

### 7.1 States

```
idle
 └▶ entering            (static cut or animated transition per reducedMotion)
     └▶ beat.revealing  (typewriter running; Instant collapses this to 0 frames)
         ├▶ beat.shown  (full line visible; advance glyph active)
         │   ├▶ (advance) ─▶ next beat.revealing | choosing | recap
         │   └▶ (back)    ─▶ prior beat.shown  (re-read; no effects re-fire)
         └▶ (complete)   ─▶ beat.shown         (click/key completes the reveal)
 choosing                (choice menu; roving focus; Auto paused)
     └▶ (select) ─▶ record choice ─▶ rejoinBeatId | next beat
 backlog                 (overlay; focus-trapped; Esc restores focus)
 recap                   (one-sentence consolidation; Skip lands here too)
     └▶ handoff ─▶ linked activity (deliberate; Auto never auto-enters)
 skipped                 (Skip scene → recap → handoff; identical downstream state)
```

Cross-cutting substates run in parallel and are pure UI: `auto ∈ {off,on}` (off + disabled under reduced motion), `fastForward ∈ {idle,seen-only,all}` (halts at unseen/choice), `backlogOpen ∈ {closed,open}`.

### 7.2 Events

`ENTER · REVEAL_TICK · COMPLETE_LINE · ADVANCE · BACK · OPEN_BACKLOG · CLOSE_BACKLOG · SELECT_CHOICE(id) · TOGGLE_AUTO · AUTO_TICK · START_FF · STOP_FF · SKIP_SCENE · SET_SPEED · SET_LEVEL · REACH_RECAP · HANDOFF_ACTIVITY · PAUSE · RESUME`

### 7.3 Reducer sketch

```ts
type PlayerPhase = 'entering' | 'revealing' | 'shown' | 'choosing' | 'recap' | 'skipped';

interface ScenePlayerState {
  readonly sceneId: CampusSceneId;
  readonly beats: readonly ResolvedBeat[];   // resolved for the active level
  readonly index: number;                    // current beat
  readonly phase: PlayerPhase;
  readonly revealedGraphemes: number;        // for the typewriter; == full length when 'shown'
  readonly level: StoryLevel;
  readonly auto: boolean;
  readonly fastForward: 'idle' | 'seen-only' | 'all';
  readonly backlogOpen: boolean;
  readonly seenBeatIds: ReadonlySet<string>; // drives skip-seen-only + backlog
  readonly pendingChoice: string | null;     // beat that gates a choice menu
}

function reduce(s: ScenePlayerState, e: PlayerEvent, ctx: PlayerContext): ScenePlayerState {
  switch (e.type) {
    case 'COMPLETE_LINE':                     // stage 1 of two-stage advance
      return s.phase === 'revealing'
        ? { ...s, phase: 'shown', revealedGraphemes: fullLen(s) }
        : s;
    case 'ADVANCE': {                         // stage 2
      if (s.phase === 'revealing') return reduce(s, { type: 'COMPLETE_LINE' }, ctx);
      if (beatHasChoice(s)) return { ...s, phase: 'choosing', pendingChoice: currentBeatId(s) };
      const next = s.index + 1;
      if (next >= s.beats.length) return { ...s, phase: 'recap' };
      return enterBeat({ ...s, index: next }, ctx); // Instant/reducedMotion ⇒ phase 'shown' immediately
    }
    case 'BACK':
      return s.index > 0 ? enterBeat({ ...s, index: s.index - 1 }, ctx, /*replay*/true) : s;
    case 'SELECT_CHOICE': {
      // delegate the record to the world reducer; player only advances presentation
      ctx.dispatchWorld({ type: 'select-scene-choice', sceneId: s.sceneId, choiceId: e.id, selectedAt: ctx.now() });
      const target = rejoinTargetFor(s, e.id);   // guaranteed to exist (rejoin invariant)
      return enterBeat({ ...s, index: target, pendingChoice: null, phase: 'entering' }, ctx);
    }
    case 'AUTO_TICK':
      return ctx.reducedMotion || !s.auto ? s
           : s.phase === 'shown' ? reduce(s, { type: 'ADVANCE' }, ctx) : s;
    case 'SKIP_SCENE':
      return { ...s, phase: 'recap' };          // recap identical to finish path
    case 'REACH_RECAP':
    case 'HANDOFF_ACTIVITY':
      // completion + reward + unlocks are the world reducer's job, not the player's:
      ctx.dispatchWorld({ type: 'complete-active-scene', completedAt: ctx.now() });
      return s;
    // OPEN/CLOSE_BACKLOG, TOGGLE_AUTO (guarded off under reducedMotion), SET_SPEED,
    // SET_LEVEL (re-resolves beats), PAUSE/RESUME (stops timers, keeps index) ...
  }
}

/** Entering a beat: Instant speed OR reduced motion ⇒ skip the reveal animation entirely. */
function enterBeat(s: ScenePlayerState, ctx: PlayerContext, replay = false): ScenePlayerState {
  const instant = ctx.textSpeed === 'instant' || ctx.reducedMotion;
  const seen = withSeen(s, currentBeatId(s), replay);
  return instant
    ? { ...seen, phase: 'shown', revealedGraphemes: fullLen(seen) }
    : { ...seen, phase: 'revealing', revealedGraphemes: 0 };
}
```

### 7.4 Key design guarantees

- **The player never owns learning state.** Rewards, unlocks, completion, and choice records all flow through `applyAcademyWorldAction`; the player is a view + input controller. This preserves the world.ts invariant that visits/choices/replays are not learning evidence.
- **Instant ≡ reduced motion ≡ screen-reader path.** All three collapse `revealing → shown` in zero frames, so the accessibility path is the *same code path*, not a fork that can rot.
- **Two-stage advance is one event (`ADVANCE`) that self-dispatches `COMPLETE_LINE`** when mid-reveal — impossible to skip an unread line by fast tapping.
- **Auto and fast-forward are guarded, interruptible, and never enter the activity** — the handoff is always a deliberate `HANDOFF_ACTIVITY`.
- **Back re-reads without side effects** — it never re-fires a choice or reward; effects are idempotent by construction because they live in the world reducer keyed by scene/first-play.
- **Recap is reached identically from finish and skip** — one `phase: 'recap'`, satisfying "skip gives the same downstream state."

## 8. Definition of Done (Player Slice)

A learner can, for one authored scene:

1. Play it fully with pointer, keyboard-only, and touch-only — each complete.
2. Complete it with **audio off** using transcript + visual cue as the full equivalent.
3. Complete it under **reduced motion** (Instant text, static cuts, Auto disabled).
4. Navigate it with a **screen reader** (speaker labels, current-line live region, on-demand backlog, text choice list).
5. Use **adjustable/instant speed, click-to-complete, backlog, skip-seen fast-forward, Auto (off by default, disabled under reduced motion), and optional local name insertion**.
6. **Skip the scene** and receive the *exact same* recap, linked activity, reward, unlock, and review scheduling as finishing it.
7. Make a **cosmetic or practice-order choice** that writes nothing to mastery, placement, currency, or entitlement.
8. Have every voiced/visual asset carry `rights.status === 'cleared'`, validated in tests, with no real-person data anywhere in the graph.
