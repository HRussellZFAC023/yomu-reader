# Reference Code Harvest

These repositories are local research inputs, pinned to exact commits. Copy small, proven mechanisms behind Academy-owned interfaces. Do not adopt a framework's page structure or visual language wholesale.

## Pinned references

| Repository | Commit | Use |
| --- | --- | --- |
| ink | `35c63e52f1d36060930dc7ed3cfba38ea224b528` | narrative format and authoring concepts |
| inkjs | `1b17540a619021b551ecc4bc5bf873758e6b509b` | browser narrative runtime |
| Monogatari | `86659baf065178071f0956092f754e1d76be0072` | VN interaction and persistence patterns |
| howler.js | `1d3053576a860e9854645493ad6c4a72c6cc6e45` | resilient browser audio |
| Workbox | `62b9d8ba8eb3c1a2ab8aac9d84c90cda7865d6a3` | PWA caching and offline updates |
| ts-fsrs | `cdec8d2f8340f8e62ced596c1da02e20e70073f0` | spaced-repetition scheduling |

Root: `/Users/heru/Documents/Projects/yomu/references/academy-engine/`

## Narrative runtime: inkjs

Read first:

- `inkjs/src/engine/Story.ts`: `Continue`, `canContinue`, `currentChoices`, `ChooseChoiceIndex`, `variablesState`.
- `inkjs/src/engine/StoryState.ts`: `LoadJson`, state serialization, current-flow choices.
- `inkjs/src/engine/Choice.ts`: stable choice metadata.
- `inkjs/src/compiler/Compiler.ts`: compile authored Ink into runtime JSON during the build.
- `ink/Documentation/ink_JSON_runtime_format.md`: serialization contract.

Adapt behind an Academy `NarrativeEngine` interface:

```ts
interface NarrativeEngine {
  open(sceneId: SceneId, snapshot?: NarrativeSnapshot): SceneFrame;
  advance(): SceneFrame;
  choose(choiceId: ChoiceId): SceneFrame;
  snapshot(): NarrativeSnapshot;
}
```

Use Ink for branching dialogue, variables, visits, and choice persistence. Keep learning activities, SRS scheduling, character records, and world unlock rules in Academy domains. A scene emits typed commands such as `practice`, `unlockCharacter`, `setLocation`, and `awardBond`; it does not reach into the DOM.

## VN behaviour: Monogatari

Read first:

- `monogatari/src/actions/`: dialogue, choice, conditional, audio, image, scene, wait, vibration, and input action lifecycles.
- `monogatari/src/engine/persistence.ts`: state snapshots, save slots, schema upgrades, screenshots.
- `monogatari/src/engine/assets.ts`: preload and asset lookup boundaries.
- `monogatari/src/components/dialog-log/`: replayable dialogue log.
- `monogatari/src/components/quick-menu/`: auto, skip, log, save, load interaction ideas.
- `monogatari/src/lib/AudioPlayer.ts`: Web Audio lifecycle and effect-chain handling.

Adapt the reversible action idea: each stage command has `enter`, `update`, and `dispose`. This prevents the stale-listener bug found in the prototypes. Retain the dialogue log, auto advance, skip-read-only, rollback within a scene, save thumbnail, and preloading concepts. Rebuild their UI in Yomu's visual system.

## Audio: howler.js

Read first:

- `howler/src/howler.core.js`: first-gesture unlock, load queues, fade, HTML5 fallback, unload.
- `howler/examples/radio/radio.js`: streaming station lifecycle and explicit unload.
- `howler/examples/player/player.js`: HTML5 streaming for long files.
- `howler/examples/sprite/sprite.js`: compact SFX sprite playback.
- `howler/src/plugins/howler.spatial.js`: optional room-object panning.

Use one `AudioDirector` with music, ambience, lesson, and SFX buses. Long OST and listening files use HTML5 streaming; short cues use decoded buffers or one audio sprite. Crossfades are state transitions, not component side effects. A location requests a semantic theme slot. The director owns unlock, ducking, resume, visibility changes, and cleanup.

## SRS: ts-fsrs

Read first:

- `ts-fsrs/packages/fsrs/src/fsrs.ts`: scheduler facade.
- `ts-fsrs/packages/fsrs/src/models.ts`: card and review records.
- `ts-fsrs/packages/fsrs/src/constant.ts`: rating and state vocabulary.
- `ts-fsrs/packages/fsrs/src/reschedule.ts`: replaying review history.
- `ts-fsrs/packages/fsrs/__tests__/FSRS-6.test.ts`: expected `createEmptyCard`, `repeat`, and `next` usage.

The canonical Yomu study item remains the source of truth. Academy adds learning provenance (`week`, `worksheet`, `scene`, `character`, `errorType`) and forwards review outcomes through an adapter. The daily drill selects due items first, then recent errors, then a small amount of lesson preparation. Story rewards never alter FSRS intervals.

## Offline: Workbox

Read first:

- `workbox/packages/workbox-precaching/`: revisioned application shell.
- `workbox/packages/workbox-strategies/`: route-specific cache policy.
- `workbox/packages/workbox-expiration/`: bounded media caches.
- `workbox/packages/workbox-background-sync/`: deferred progress writes.

Precache shell, fonts, the current chapter manifest, and small core art. Cache lesson packs and audio only after an explicit offline download. Large source PDFs and OST files are not swept into the service worker cache. Store progress writes in an idempotent queue and show the real offline state.

## Adoption boundaries

- Do not use Monogatari's visual components or global engine state.
- Do not let Ink JSON become the curriculum database.
- Do not fork Yomu's study scheduler into an Academy-only deck.
- Do not precache the entire three-year corpus.
- Do not let audio elements outlive their location or scene owner.
