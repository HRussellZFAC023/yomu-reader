# Entrance Direction

## Purpose

The Academy opens as a short visual-novel arrival, not an onboarding form. It asks for no name, goal, level, reason for studying, or other personal detail. The learner can open Lesson 9 at any time.

The implementation contract lives in [`src/academy/entrance.ts`](../../../src/academy/entrance.ts). It is pure state/data: the app owns DOM rendering, focus, timers, audio playback, and navigation.

## Full-motion Sequence

The default route reaches a choice in exactly **25 seconds**. `Continue` may move to the next scene immediately; the sequence is never a wait gate.

| Time | State | Visible scene | Full-motion direction | Reduced-motion equivalent | Cue |
| --- | --- | --- | --- | --- | --- |
| 0.0-4.0 s | `exterior` | Quad at blue hour | Still exterior composition | Same still | `ambient:campus` after user activation |
| 4.0-8.5 s | `approach` | Quad, framed toward the entrance | One restrained approach | Static closer composition | None |
| 8.5-12.0 s | `doors-opening` | The exterior seen through two doors | Two physical leaves swing from their outer hinges | Fully open still doors | `sfx:door` |
| 12.0-16.0 s | `classroom-reveal` | Warm classroom with blue-hour windows | Short scene change | Static classroom | `ambient:classroom` |
| 16.0-18.5 s | `rie-arrives` | Rie appears in the classroom | One portrait entrance | Static Rie portrait | None |
| 18.5-25.0 s | `rie-welcome` | Rie and her dialogue | Dialogue stays visible immediately | Same visible dialogue | `sfx:page` |
| 25.0 s onward | `route-choice` | Classroom, Rie, two route buttons | Wait for a choice | Wait for a choice | None |

Rie's one line is deliberately practical:

> こんばんは。ドアは開いていますよ。まず、今日のことばから始めましょう。
>
> Good evening. The door is open. Let's start with today's words.

There is no voice asset or text typewriter in this sequence. The Japanese and English are visible together, so audio-off and screen-reader routes carry the same meaning.

## Assets And Composition

Use the existing responsive raster pairs through `ACADEMY_ENTRANCE_ASSETS`:

| Scene | Wide | Mobile |
| --- | --- | --- |
| Exterior, approach, doors | `./art/environments/quad/blue-hour-wide.webp` | `./art/environments/quad/blue-hour-mobile.webp` |
| Classroom, Rie, choice | `./art/environments/classroom/evening-lamplit-wide.webp` | `./art/environments/classroom/evening-lamplit-mobile.webp` |
| Rie portrait | `./art/characters/rie-sensei.webp` | Same portrait |

The image is the scene, not background decoration. Render it full-frame with a `<picture>` source for mobile. The `doors-opening` frame provides `visual.door`: render two opaque, physical door leaves with outer-hinge transform origins. Its `openPercent` maps directly to the opening animation in full motion; reduced motion receives an already-open still frame.

Do not add particles, floating petals, gradient overlays, glass panels, or a card-based hero. Do not cover the environment with a large text panel. The only foreground UI is the compact dialogue/control area required to act.

## Routes, Skip, And Replay

`route-choice` offers two navigation-only choices:

1. `lesson-09` opens `unit-level-3-plus-lesson-09`.
2. `campus` opens the campus map.

Neither writes placement, mastery, a personality profile, or a relationship value. `Escape` and the visible **Start Lesson 9** control skip directly to the lesson from any timed stage. `Replay entrance` resets the state to `exterior` while retaining only the current motion and sound preferences; it stores no entrance history.

## Interaction And Semantics

Use ordinary buttons for every action. On the entrance container, and only when focus is not in another editable control:

| Input | Behavior |
| --- | --- |
| `Enter` or `Space` | Advances the current timed scene. Native route buttons retain these keys once `route-choice` appears. |
| `Escape` | Skips to Lesson 9. |
| `R` | Replays from the blue-hour exterior. |
| Touch | Tap visible Continue, Start Lesson 9, route, or Replay buttons. No swipe, hold, or timed target is required. |

Use one `role="status"`, `aria-live="polite"`, `aria-atomic="true"` region. Put `frame.accessibility.announcement.text` into it only when a reducer transition changes scene, completes/skips, or changes an access preference. Do not update it for render ticks or door progress. Keep the scene heading, image alt text, Rie speaker label, dialogue language (`lang="ja"`), English caption, and buttons in normal reading order.

## Host Wiring

```ts
import {
    createEntranceState,
    getEntranceFrame,
    getEntranceNextAutoAdvanceInMs,
    transitionEntrance,
    type EntranceAction,
} from './entrance';

let entrance = createEntranceState({
    motion: MotionGuard.reduced ? 'reduced' : 'full',
    sound: audio.getLevel() === 'off' ? 'off' : 'on',
});
let autoAdvanceTimer: number | null = null;

function renderEntrance() {
    if (autoAdvanceTimer !== null) window.clearTimeout(autoAdvanceTimer);
    const frame = getEntranceFrame(entrance);
    render(frame);
    const delay = getEntranceNextAutoAdvanceInMs(entrance);
    autoAdvanceTimer = delay === null
        ? null
        : window.setTimeout(() => dispatch({ type: 'advance-time', milliseconds: delay }), delay);
}

function dispatch(action: EntranceAction) {
    const transition = transitionEntrance(entrance, action);
    entrance = transition.state;
    runEntranceEffects(transition.effects); // announce, AcademyAudio, then navigate
    renderEntrance();
}
```

At first paint, announce the frame's initial status. Do not autoplay sound. On the first learner key or touch action, unlock `AcademyAudio` and apply the current frame's `soundCues`; after that, run `sound` effects normally. Map ambient cues to `audio.setScene(cue.name)` and SFX cues to `audio.play(cue.name)`. When sound is `off`, `soundCues` and sound effects are empty while captions and announcements remain unchanged.

For reduced motion, `getEntranceNextAutoAdvanceInMs()` is `null`. The host should show static frames and advance only through explicit controls; it must not substitute a rapid fade, pan, zoom, or automatic scene change.

## Verification

Focused coverage is in `tests/academy/entrance.test.ts`:

```bash
npx vitest run tests/academy/entrance.test.ts
npm run typecheck
```
