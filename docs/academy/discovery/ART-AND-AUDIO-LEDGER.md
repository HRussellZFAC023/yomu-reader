# Art and Audio Ledger

## Provenance rule

Only two generated-art families are eligible before visual review:

1. direct OpenAI image-generation outputs;
2. existing images with explicit provenance showing OpenAI built-in image generation.

Pollinations Flux, Python generator batches, parametric SVG avatars, and unknown automated character sheets are excluded from runtime manifests.

## Approved anchors and strong keeper candidates

## Locked visual language

All new Academy art uses warm pixel-painted anime realism: expressive adult faces, believable anatomy and fabric, confident drawn edges, restrained cel shading, small hand-placed pixel texture, deep blue evening light, and warm practical lamps. The pixel treatment is textural rather than low-resolution or blocky. It must remain readable on a phone and rich on a wide display.

The campus ensemble, rainy directions scene, classroom tutoring scene, and approved Rie art are the calibration set. Character sprites, event CGs, maps, props, worksheet reconstructions, and protagonist portraits share one proportion guide, facial construction system, palette, edge treatment, light direction, and texture scale. A new image is rejected when it looks polished in isolation but belongs to a different game.

### Visual anchors

- Campus ensemble / desired world style: `/Users/heru/.codex/generated_images/019f3220-a107-7262-95f1-b8f7573a667f/exec-c8b9e0f2-65b8-4821-8ade-1eb74ad31241.png`
- Rainy directions scene with Rie and Aakash: `/Users/heru/.codex/generated_images/019f3220-a107-7262-95f1-b8f7573a667f/exec-ecc50561-7602-42aa-bd70-7699ea67805d.png`
- Classroom tutoring scene: `/Users/heru/.codex/generated_images/019f3220-a107-7262-95f1-b8f7573a667f/exec-47673506-16a5-4045-9dfa-13c590ddf674.png`
- Rie classroom portrait scene: `/Users/heru/.codex/generated_images/019f3220-a107-7262-95f1-b8f7573a667f/exec-76d267a1-01fb-4224-a61a-3514006abc38.png`
- Campus mockup source referenced in the founding thread: `/var/folders/pw/w51pz2xd16z4x521kb7m7x3r0000gq/T/codex-clipboard-0d98e662-f05c-433d-b529-39e02225ede7.png`

### Protagonist picker

The four starting portraits are approved player-character choices:

- `.../refs/quality-2.webp` - dark-haired man with camera;
- `.../refs/quality-3.webp` - dark-haired woman with planner;
- `.../refs/quality-4.webp` - short-haired androgynous woman with cards.
- `.../refs/quality-5.webp` - short-haired woman with pencil and notebook.

Full root: `/Users/heru/Documents/Projects/yomu/release-worktrees/yomu-academy-initial-20260711/public/academy/art/characters/claude-production/refs/`

They are player options, not classmate references. Preserve their identity and wardrobe language. Produce picker thumbnails, transparent dialogue busts, and a small neutral/speaking/surprised/determined expression set in the locked warm pixel-painted style. `quality-2` through `quality-5` need clean alpha extraction or OpenAI regeneration from the approved images rather than chroma-key fringes. `quality-1.jpg` is not an approved player asset.

### Rie sprite anchor

- `/Users/heru/Documents/Projects/yomu/release-worktrees/yomu-academy-initial-20260711/public/academy/art/codex-production-v1/sprites/people/rie/rie__neutral__halfbody__v001.png`
- Provenance: direct OpenAI built-in generation; transparent half-body; visually reviewed.
- Use: default Rie runtime sprite and style/lighting/proportion anchor for regenerated cast.

### Environment collection

- Root: `/Users/heru/Documents/Projects/yomu/release-worktrees/yomu-academy-initial-20260711/public/academy/art/codex-production-v1/backgrounds/`
- Provenance manifest: `backgrounds/manifest.json`
- Scope: 26 OpenAI-generated location-state plates with wide/mobile deliveries and safe-zone metadata.
- Strong keepers include Bloomsbury rain, campus entrance, classroom lamplit, library rain, cafe night, pub, ramen, station, konbini, gym, tennis, student room, restaurant, Japan classroom, Tokyo street, temple approach, shinkansen, office, and airport.
- Review task: remove any plate that reads as generic stock, has weak geography, or conflicts with the final map. Do not reject the family because one plate is weak.

### Cinematic event collection

- Root: `/Users/heru/Documents/Projects/yomu/release-worktrees/yomu-academy-initial-20260711/public/academy/art/codex-production-v1/cinematic-events/`
- Provenance manifest: `cinematic-events/manifest.json`
- Eight OpenAI-generated CGs: spare chair, first class, rainy directions, library study, ramen, pub support, kanji practice, first Japan arrival.
- Status: composition and mood keepers; character likeness must be checked against final dossiers before runtime use.

### Lesson art

- Root: `/Users/heru/Documents/Projects/yomu/release-worktrees/yomu-academy-initial-20260711/public/academy/art/codex-production-v1/lesson-assets/`
- Provenance manifest: `lesson-assets/manifest.json`
- 26 direct OpenAI assets with explicit lesson homes.
- Use only after source-question fidelity review; lesson illustration may not alter a worksheet's answer cues.

## Excluded families

- `public/academy/art/claude-production-v3/**` - Pollinations Flux plus Python post-processing.
- `public/academy/art/codex-production-v2/sprites/**` - Python-driven generator using the v3 pipeline; includes known weak Aakash/Tom likenesses.
- `public/academy/art/characters/claude-production/sprites/**` - generic, inconsistent, and duplicate expressions.
- `public/academy/art/characters/portraits/aakash.png` - polished but hat/beard-heavy and not a default Aakash likeness; retain only as historical reference.
- `/Users/heru/.codex/generated_images/019f3220-a107-7262-95f1-b8f7573a667f/exec-886a2fdf-6452-497c-8072-1af65575bae4.png` - attractive door composition but photoreal rendering breaks the approved painterly world style.
- SVG/parametric learner-facing avatars.

## Missing art production

### Character matrix

For each real classmate, Rie, protagonist options, Miller, and Tawapon:

- neutral, happy, laughing, thinking, surprised, concerned, determined, embarrassed, speaking, listening;
- half-body transparent sprite;
- full-body neutral and action pose;
- profile bust for journal and dialogue backlog;
- seated variant for classroom/cafe/pub;
- rain layer or umbrella pose where relevant.

Generate one neutral sample per character first. Human likeness approval precedes expression expansion. Aakash defaults to hat-free normal hair. Tom is blond, clean-shaven, and recognisable from the supplied photos.

### Consistency gate

Before expression production, place every accepted neutral sprite on the same classroom plate at identical scale. The art director checks eye line, head-to-body ratio, shoulder scale, outline weight, pixel texture, skin rendering, key light, shadow colour, and crop. Only a coherent cast contact sheet unlocks batch generation. Expression variants use the accepted neutral as the image reference; they do not restart from text prompts alone.

### Event and location matrix

- Each major story beat gets a cinematic CG only when the event cannot be expressed well with sprites over a location plate.
- Every location needs wide/mobile, day/evening/rain, plus named event states.
- Maps are authored as navigable spaces rather than flat menus: consistent geography, paths, lighting, hover/focus affordances, and clear return route.
- Worksheet imagery receives its own media pipeline; it is not forced into the cinematic style.

### Pop-culture art

Generated scenes may contain recognisable pop-culture context when it makes the world believable: a classmate discussing Persona, comparing Final Fantasy stories, showing a Switch 2, talking about Zelda or Pokémon, sharing a Miku playlist, reading Frieren or manga, or recommending films and music. The scene should show the social action and learner language, not reproduce a game's UI or turn branded objects into the composition's only point. Original Yomu interpretations, posters, handheld props, shelves, outfits, and conversation staging keep the visual world cohesive.

## Audio sources

### Persona 5 Royal prototype soundtrack

Path: `/Users/heru/Downloads/Persona 5 The Royal Soundtrack/`

Available FLACs include `Royal Days`, `Kichijoji 199X`, `No More What Ifs`, `Ideal and the Real`, `Take Over`, `Prison Labor`, `So Happy World`, `Out of Kindness`, `I believe`, and related event tracks.

Private prototype mapping:

| Space/event | Track candidate | Intent |
| --- | --- | --- |
| Campus map / ordinary evening | `Royal Days` | confident daily loop |
| Cafe / social study | `Kichijoji 199X` | relaxed place identity |
| Quiet bond scene | `No More What Ifs -instrumental version-` | intimate conversation |
| Reflective story beat | `Ideal and the Real` | ambiguity and memory |
| Kanji battle / challenge | `Prison Labor` or `Take Over` | playful intensity |
| Happy world unlock | `So Happy World` | earned delight |
| Support scene | `Out of Kindness` | warmth without sentimentality |
| Major resolve | `I believe` | late-story momentum |

The audio director consumes theme slots, not filenames. A release build can swap the slot map for cleared music without changing scenes.

### Shinday SFX

Path: `/Users/heru/Documents/Projects/shinday/assets/SFX/`

There are about 100 WAV assets: menu movement/select, pop-up close, result cues, module changes, unavailable, footsteps, camera, clap, environmental cues, and voice clips. Use the interaction design and local prototype sounds as references. The release manifest records provenance and rights status per file.

Recommended semantic map:

- `menu.move`, `menu.confirm`, `menu.cancel`, `action.unavailable`
- `scene.advance`, `page.turn`, `door.open`, `footstep.indoor`, `footstep.wet`
- `feedback.correct`, `feedback.repair`, `feedback.hanamaru`
- `bond.unlock`, `bond.rank`, `chapter.complete`
- `doodle.stroke`, `doodle.check`
- `radio.tune`, `camera.capture`

## Audio architecture

`AudioDirector` owns four buses:

1. music;
2. ambience;
3. lesson/voice audio;
4. SFX.

It handles first-gesture unlock, crossfade, ducking, loop points, pause/resume, visibility changes, offline availability, and user volume. Location transitions request a `ThemeSlot`; they never start tracks directly. Lesson audio ducks music rather than stopping it. Silence is a valid authored state.

The electro drone is removed. No fallback synthesiser plays continuously. If music is unavailable, the room uses ambience or silence.

## Diegetic radio

The Shinday/Miku radio idea becomes a physical radio in the Cafe or Language Lab. It is manually started, remembers volume, pauses the room theme, shows reliable play state, and can host cleared streams, local playlists, or unlocked radio-drama episodes. It is a discoverable world object rather than persistent navigation chrome.
