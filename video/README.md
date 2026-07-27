# Yomu feature clips (Remotion)

Programmatic video for Yomu feature announcements. Every frame is React rendered
by [Remotion](https://remotion.dev) — no screen recording, no editor timeline,
no GIF. Retiming a beat is a number change, re-rendering is one command, and the
same project produces the next clip.

The first composition, `GamingLoop`, is the Yomu Gaming loop end to end: a
Japanese game screen, one keypress, the overlay reads the frame, you point at a
word, the card opens with pitch accent, senses and audio, and the card is kept.

## Render it

```sh
cd video
npm install          # once
npm run frames       # stage the demo footage (see "Footage" below)
npm run render       # -> ../artifacts/video/yomu-gaming-loop.mp4
```

`npm run render` writes an H.264 MP4 at 1920x1080, 30fps, 990 frames — 33.0
seconds, about 14 MB, roughly 100 seconds to render on an M-series Mac. It
carries a silent audio track (`--enforce-audio-track`) because some social
uploaders reject a file with no audio stream at all.

`artifacts/` is gitignored, so the render is a build output rather than a
tracked binary.

Other commands:

| Command | What it does |
| --- | --- |
| `npm run studio` | Remotion Studio — scrub the timeline, edit, hot reload |
| `npm run render:still` | Poster frame (frame 400 — the card, open) |
| `npm run frames` | Stage the demo footage into `public/frames/` |
| `npm run fonts` | Re-vendor the Japanese webfont subset |
| `npm run typecheck` | `tsc --noEmit` |

To render a single frame while iterating:

```sh
npx remotion still src/index.ts GamingLoop /tmp/f400.png --frame=400
```

## Footage

`npm run frames` converts the reference captures into `public/frames/`. It looks
for `references/style-persona/` at the repository root and walks up from there,
so it works from a git worktree too; `YOMU_VIDEO_FRAMES_DIR` overrides the
search.

Those captures are copyrighted game screenshots. They are demo footage for a
video *about* Yomu and they are deliberately **not** committed —
`references/` is gitignored and `scripts/check-repository-hygiene.mjs` fails the
build if anything under it is tracked. None of this art goes into the product.

If the captures are missing, `npm run frames` writes flat-colour stand-ins and
warns, so the project still builds and the motion design is still reviewable.

## Fonts

`public/fonts/noto-sans-jp-variable-subset.woff2` is a subset of Noto Sans JP
(SIL Open Font License 1.1) containing exactly the glyphs this project renders.
`npm run fonts` regenerates it by scanning `src/` for characters and asking the
Google Fonts API for that subset — so after changing any Japanese copy, re-run
it and commit the result. `src/fonts.ts` blocks the render until the face has
loaded, which is what stops the opening frames coming out as tofu.

`⌘` and `⇧` are drawn as SVG in `src/components/chrome.tsx` rather than typed,
because they are not in the subset and system fallbacks differ per machine.

## Shape of the project

```
src/
  index.ts          registerRoot
  Root.tsx          <Composition> registrations
  GamingLoop.tsx    act sequencing + the one transition
  theme.ts          palette, type, tilt angles, act boundaries
  content.ts        every word the clip says, in one file
  geometry.ts       measured positions inside the reference frames
  fonts.ts          webfont loading, gated on delayRender
  components/       plate, card, chrome, saved note, end card, primitives
  scenes/           ActOne (the loop), ActTwo (it generalises)
```

`GamingLoop` runs in three acts (`acts` in `theme.ts`): the loop end to end over
one game frame, the same loop compressed over a different scene so it does not
read as a set-piece, and the end card. Cuts between acts are hard; the one
transition in the clip is spent on the moment it stops demonstrating and starts
telling you where to get it.

Two conventions worth keeping:

- **Beats live in one `BEAT` object per act, act-relative.** The act is a chain
  of "this happens a beat after that", so a retimed capture has to drag the
  parse along with it; scattered magic numbers make that impossible.
- **The palette is the product's palette.** SRS state colours and pitch-pattern
  colours are copied from `src/reader/styles/base.css` and the accent from
  `src/reader/core/hosted-accent-css.ts`, and the pitch graph uses the same
  geometry as `renderPitchGraphSvg` in `src/reader/popup/pitch.ts`. Nobody
  should learn a colour or a shape here that they will not see in the app.

## Design notes

The look is lifted from the reference frames themselves: full-bleed composition
with the UI sitting on the scene, nothing axis-aligned, hard black keylines with
offset shadows, a saturated limited palette, a calm corner control legend, and
an oversized mark bleeding off a corner.

One decision worth writing down: the overlay's text is rendered on its own plate
above the dialogue rather than annotated onto the game's pixels in place. The
dialogue lines in the footage are 45px apart with 40px glyphs, which leaves no
room for furigana above a line or a status tint below it without landing on the
neighbouring line. The OCR region boxes still sit on the source text, so the
clip shows both where the words came from and what Yomu made of them.
