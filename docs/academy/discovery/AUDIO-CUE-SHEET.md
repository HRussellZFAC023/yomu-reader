# Audio Cue Sheet

## Prototype music slots

Source: `/Users/heru/Downloads/Persona 5 The Royal Soundtrack/`

| Slot | Prototype source | Entry and exit |
| --- | --- | --- |
| `opening.invitation` | `CD1/02 Royal Days.flac` | starts after first gesture; fades into campus |
| `campus.evening` | `CD1/02 Royal Days.flac` | map default; 1.2s crossfade |
| `cafe.social` | `CD1/06 Kichijoji 199X.flac` | enters at cafe threshold |
| `bond.quiet` | `CD1/04 No More What Ifs -instrumental version-.flac` | starts after dialogue pause, not on screen open |
| `mystery.page` | `CD1/05 Ideal and the Real.flac` | low-volume story cue; no loop across activities |
| `challenge.kanji` | `CD1/13 Prison Labor.flac` | short challenge segment with explicit stop |
| `challenge.major` | `CD1/03 Take Over.flac` | reserved for late, active challenge beats |
| `unlock.world` | `CD2/05 So Happy World.flac` | earned world/season reveal |
| `support.kindness` | `CD2/07 Out of Kindness.flac` | character support scene |
| `resolve.late` | `CD2/08 I believe.flac` | late-story resolve only |
| `ending.reflective` | `CD2/12 Ideal and the Real -end version-.flac` | credits/reflection |

These are semantic slots in the code. The private prototype manifest points to local/R2 media; a cleared soundtrack can replace it without editing scenes.

## Shinday SFX shortlist

Source: `/Users/heru/Documents/Projects/shinday/assets/SFX/`

| Event | Candidate |
| --- | --- |
| focus move | `menu sounds/menu cursor move.wav` |
| confirm | `menu sounds/menu option select.wav` |
| panel close | `menu sounds/pop-up close.wav` |
| location/module change | `menu sounds/module change 1.wav`, `module change 2.wav` |
| unavailable | `menu sounds/unavailable.wav` |
| correct | `menu sounds/result (clear).wav` |
| repair needed | `menu sounds/result (not clear).wav` |
| tally | `menu sounds/score tally.wav` |
| camera/memory | `other sounds/camera.wav` |
| applause/event | `other sounds/clap.wav` |
| footsteps | selected `footstep sounds/se_ev_*.wav` by surface |
| radio tune | `other sounds/sonar beeps 1.wav`, edited only after listening QA |

Voice clips are not generic UI feedback. Use them only as a diegetic Shinday radio cameo with a clear speaker/source context.

## Mixing contract

- Music targets a consistent loudness and sits below dialogue/listening audio.
- Lesson audio ducks music by an authored amount and restores it with a short release.
- SFX are rate-limited so rapid keyboard navigation never becomes harsh.
- Changing location cancels the previous fade before starting the next.
- Reduced-motion does not disable sound; sound preferences are independent.
- Captions/transcripts exist for meaningful speech and class audio.
- Offline downloads report music, lesson audio, and transcript availability separately.

## First implementation test

On one gesture, unlock audio. Move campus -> cafe -> listening exercise -> cafe -> campus. Assert one music source, no overlap, expected theme slot, music duck during the exercise, exact resume position or authored restart, and complete cleanup after logout.

