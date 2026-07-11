---
title: "Yomu Academy Cast Art Bible"
description: "Production direction, privacy gates, prompt system, and asset manifest rules for coherent Yomu Academy cast portraits, sprites, contact sheets, and scene art."
status: "initial cast production bible"
owner: "cast art"
asset_root: "public/academy/art/characters/cast"
date: "2026-07-11"
---

# Yomu Academy Cast Art Bible

## Production Position

Yomu Academy's cast art should feel like adult evening-class friends stepping out of the existing blue-hour key art: warm, stylish, a little heightened, and emotionally readable at visual-novel speed. The target is original high-detail raster art with restrained pixel grain, painterly anime realism, confident silhouettes, and a social spark that can support hundreds of coherent portraits without collapsing into generic avatar cards.

The current `src/academy/art.ts` SVG avatars remain the fallback and roster scaffolding. They are not the art-quality ceiling. Raster portraits under `public/academy/art/characters/cast/` are the production target for visual-novel presence, expression acting, and key scene continuity.

**Important audit note:** I found no consented class-photo path or photo-manifest reference in the academy worktree. The only explicit local visual anchors are:

- `public/academy/art/campus-blue-hour.webp`
- `public/academy/art/characters/rie-sensei.webp`

Therefore this bible defines the likeness pipeline but blocks final real-person-derived likeness work until a separate consent/photo manifest exists. Do not invent faces for real classmates and call them likenesses.

## Source Canon Studied

Primary implementation and story references:

- `src/academy/cast.ts`: named cast, hobbies, home locations, study-link hooks, SVG avatar hints.
- `src/academy/art.ts`: fallback avatar palette, hair/outfit/expression/prop vocabulary.
- `src/academy/vn.ts`: current scene portrait slot and expression usage.
- `docs/academy/story/STORY-BIBLE.md`: term structure, emotional arcs, chapter centres, special scenes.
- `docs/academy/story/SCRIPT-*.md`: introduction beats, chapter focus, scene-stage details.
- `docs/academy/WORLD-BIBLE.md`: fiction, people, asset, accessibility, and story-skip contracts.
- `docs/academy/USER-RESEARCH.md`: privacy boundary and F22 prohibition until explicit opt-in.
- `docs/academy/art/ENVIRONMENT-BIBLE.md`: environment palette, lighting states, no-logo/no-text rules.
- `docs/academy/research/08-image-gen-pipeline.md`: anchor-image workflow, file conversion, rights metadata.

Observed anchor style:

- Blue-hour campus: adult students, deep teal/indigo sky, warm amber windows, coral blossom, leaf green, wet-stone values, high-detail painterly anime with visible pixel grain.
- Rie-sensei portrait: adult teacher, warm smile, hair bun, cardigan and lanyard, green thermos, marked worksheets with red hana-maru, lamplit classroom, soft rim light, detailed hands and paper.

## North Star

The cast should read as a group you would remember from a real evening class: ordinary adults with enough style, posture, and hobby evidence that each silhouette is identifiable before the face resolves.

Use **Persona-like energy as structure**, not imitation: bold shape identity, expressive portrait acting, confident UI-friendly crops, and chapter-by-chapter emotional continuity. Use **Japanese visual-novel warmth as mood**, not a copy of any game, studio, or artist: blue-hour light, adult restraint, a quiet sense that everyone has a life outside class.

Hard style target:

- High-detail raster illustration, not flat vector.
- Adult human warmth, not idol-poster gloss.
- Subtle pixel/raster texture in edges and shadows, not retro 8-bit blocks.
- Strong silhouette language: hair mass, shoulder line, jacket/scarf/bag shape, signature prop.
- Clear expression acting: mouth, brow, eye shape, tilt, shoulders, hand pose.
- Cinematic but legible: dialogue panel can sit in front of the figure without hiding the acting.

Reject:

- Generic "AI anime classmate" faces, same-face syndrome, plastic skin, fantasy uniforms, schoolgirl/schoolboy tropes.
- Flat SVG-card look as final art.
- Direct imitation of Persona, Ghibli, Shinkai, any anime/game/franchise, or any named artist.
- Logos, crests, official UCL marks, real signage, brand labels, readable text, watermarks.
- Copyrighted mascot depictions: no Pokemon, Hello Kitty, Hatsune Miku, Frieren, Nintendo, or other protected characters as visible assets. Use original, generic hobby motifs instead.

## Privacy And Likeness Gate

The current repo contains contradictory pressure:

- `src/academy/cast.ts` and `STORY-BIBLE.md` define a class-gift named ensemble.
- `WORLD-BIBLE.md` and `USER-RESEARCH.md` prohibit real-person-derived characters, likenesses, photos, voice, and classroom material until a separate opt-in process exists.

This bible resolves that tension with two lanes.

### Lane A: Canon Character Art Without Photo Likeness

Allowed now:

- First-name-only cast IDs already present in `src/academy/cast.ts`.
- Hobby, role, home location, study-link focus, and avatar-spec color/hair/outfit cues already in repo.
- Original visual designs that are affectionate caricatures of the written canon, not claims of likeness.
- Non-sensitive, non-identifying scene use.

Not allowed in Lane A:

- Claiming a generated face resembles a real classmate.
- Inferring age, ethnicity, body, employer, relationship, contact details, disability, background, or private life from names or hobbies.
- Using classroom photos, social media, messages, attendance, voice, or real stories.

### Lane B: Consented Photo-Likeness Art

Allowed only after all of these exist:

1. A separate consent record per person, with the exact permitted use: "Yomu Academy stylized cast portrait generation."
2. A revocation and deletion path.
3. A source-photo manifest outside public shipping paths or in an access-controlled local reference folder.
4. A minimal prompt-safe description approved by the person.
5. A quality review by someone who can compare the output to the consented photos.

Required manifest fields before any likeness prompt runs:

```json
{
  "castId": "aakash",
  "displayName": "Aakash",
  "consentStatus": "opted-in",
  "consentScope": ["stylized portrait", "expression variants", "noncommercial class-gift build"],
  "revocationContact": "recorded-outside-repo",
  "referencePhotoPaths": ["/absolute/local/path/to/consented-photo-01.jpg"],
  "approvedIdentityNotes": "short person-approved visual notes only",
  "disallowedTraits": ["anything the person asked us not to depict"],
  "reviewer": "recorded-outside-repo",
  "reviewDate": "YYYY-MM-DD"
}
```

If the manifest is absent, every prompt must say:

> Do not copy or imply any real person's likeness. This is an original fictionalized design based only on the written canon and approved non-sensitive hobby motifs.

## House Style Rules

### Line, Texture, And Render

- Paint with crisp-but-soft edges: visible brush texture and pixel-grain dithering in shadow gradients.
- Use fine line accents for hair strands, glasses, hand outlines, and clothing seams. Avoid heavy manga outlines.
- Skin should have warm bounce light and mild hue variation; avoid poreless plastic.
- Hands must be believable. Regenerate malformed hands rather than crop them away unless the crop spec intentionally excludes hands.
- Accessories should be specific but not branded. A prop should help silhouette; it should never become a trademark cameo.

### Palette

Shared anchors:

- Blue-hour shadow: indigo, teal, slate.
- Human warmth: amber practical light, peach bounce, cardigan neutrals.
- Attention accents: coral/rose hana-maru red, leaf green, muted lilac/mint.
- Avoid one-note palettes. No all-purple cast, no beige-only warmth, no neon idol palette.

Character accent colors should echo `src/academy/art.ts` but can be richer in raster:

| Accent | Use |
| --- | --- |
| Indigo/navy/slate | study seriousness, evening class, quiet arcs |
| Teal/sky/mint | language, music, open-hearted support |
| Forest/sage | food, gym, outdoors, steadiness |
| Plum/rose | tenderness, reading, memory, care |
| Charcoal/lilac | city-pop cool, adult style |
| Sand/cream | welcome, pub/cafe warmth, paper/notebook continuity |

### Body And Age

Every classmate is an adult evening-class learner. No school uniforms, child proportions, infantilized eyes, teen idol styling, or classroom-uniform tropes.

Adult styling cues:

- Real coats, cardigans, fleece, overshirts, knitwear, work bags, backpacks, glasses, lanyards, headphones, water bottles.
- Subtle tiredness and life texture: a creased sleeve, a late train face, a half-smile that took effort.
- Height/build diversity is welcome but never exaggerated into mockery.

## Technical Asset Contract

### Directory Layout

All cast raster production files live under:

```text
public/academy/art/characters/cast/
  asset-manifest.json
  prompts/
    character-neutral-pass.jsonl
    expression-pass-template.md
  contact-sheets/
    cast-silhouette-wardrobe-v0.png
  <cast-id>/
    <cast-id>__ref__neutral__bust__v001.webp
    <cast-id>__expr__happy__bust__v001.webp
    <cast-id>__expr__thinking__bust__v001.webp
    <cast-id>__sprite__neutral__halfbody__v001.webp
    <cast-id>__sheet__expressions__v001.webp
    <cast-id>__meta__v001.json
```

Lowercase IDs come from `src/academy/cast.ts`: `rie`, `henry`, `aakash`, `alex`, `tom`, `sam`, `francis`, `shin`, `jodi`, `christian`, `jenny`, `robert`, `mika`, `sophie`, `xingyu`, `miller`, `tawapon`.

### File Naming

Pattern:

```text
<cast-id>__<asset-kind>__<state>__<crop>__v<nnn>.<ext>
```

Allowed asset kinds:

- `ref`: approved neutral identity/reference image.
- `expr`: expression variant.
- `sprite`: VN sprite with dialogue-safe alpha/chroma background.
- `sheet`: contact sheet or sprite sheet.
- `cg`: scene CG featuring this character, if stored per-character.
- `meta`: rights and prompt metadata.

Allowed crops:

- `head`: head and upper neck, square, roster/search chips.
- `bust`: head to mid-torso, portrait cards and dialogue.
- `halfbody`: head to thigh, VN sprite.
- `fullbody`: full design turnarounds only.
- `group`: multi-character scene.

### Master Sizes

| Asset | Master | Use |
| --- | ---: | --- |
| Bust portrait | `1024 x 1536` | VN dialogue, study-link panels, emotional closeups |
| Head crop | `1024 x 1024` | roster thumbnails, contact maps, compact UI |
| Half-body sprite | `1536 x 2048` | VN stage, left/right speaker positions |
| Full-body turnaround | `2048 x 2048` or `2048 x 3072` | wardrobe/silhouette QA |
| Expression sheet | `4096 x 4096` | 4 x 4 contact sheet, no shipping UI |
| Cast sheet | `4096 x 4096` | 16-cell or 18-cell production overview |
| Scene CG crop guide | `1600 x 900` wide + `900 x 1125` mobile | special scenes |

Export WebP for app consumption. Keep PNG masters in local production storage if available, but do not ship unreviewed masters into app code.

### Alpha And Backgrounds

Preferred final sprite: transparent WebP/PNG with clean hair edges.

If using the built-in image workflow without native transparency:

1. Generate the character on a flat chroma-key background (`#00ff00` unless the subject uses green; otherwise `#ff00ff`).
2. Require no cast shadow, no floor, no background texture.
3. Remove chroma locally and inspect alpha corners, hair edge, hand edge, and prop edge.
4. Reject if green/magenta fringing remains around hair, glasses, thermos, wool, or paper edges.

For initial reference portraits, a softly blurred blue-hour background is acceptable and often better for face/style continuity.

## Crop And Composition Rules

### Dialogue Bust

- Face centre at `x=50%`, eyes at `y=24-30%`.
- Shoulders occupy `60-78%` of width.
- Hands or prop can enter lower third only if not hidden by the dialogue box.
- Leave `8-12%` top padding for hair silhouettes.
- Avoid intense foreshortening. VN expression swaps need stable alignment.

### Half-Body Sprite

- Figure bottom may extend below canvas for stage grounding.
- Neutral front 3/4 angle: shoulders turned 10-20 degrees, face toward viewer.
- Expression variants must preserve: face geometry, hair mass, glasses, outfit, prop placement, height ratio.
- Left/right flipping is allowed only after reviewing asymmetrical details; do not flip text, pins, lanyards, or hair part if it becomes distinctive.

### Head Thumbnail

- Crop from approved bust/neutral where possible, not a separate generation.
- Must remain recognizable at `72 x 72` and `40 x 40`.
- Prop is optional; silhouette should still work without it.

## Expression System

Base expression set for every main cast member:

| Expression | Acting Direction | Notes |
| --- | --- | --- |
| `neutral` | relaxed class presence, slight life in eyes | identity/reference anchor |
| `happy` | open smile or laugh | warm connection scenes |
| `warm` | softer smile, listening | support/reassurance |
| `thinking` | eyes aside or down, brow active | grammar, hesitation, reflection |
| `surprised` | delighted or caught off guard | comedy beats, reveals |
| `determined` | focused, forward lean | practice challenge, decision |
| `tired` | gentle fatigue, not defeated | late class, Rie nine-jobs, study strain |
| `vulnerable` | quiet honesty, lowered shoulders | chapter 4-6 emotional beats |
| `proud` | restrained satisfaction | success, hana-maru, team moments |

Do not make expression swaps by merely changing the mouth. Brows, eye aperture, cheek tension, head tilt, shoulder line, and hand pose all carry the acting.

Per-expression drift guard:

- Same age.
- Same face proportions.
- Same hairline and hair mass.
- Same glasses and frame shape.
- Same outfit unless the prompt explicitly changes wardrobe.
- Same skin tone and lighting response.
- Same prop scale.

## Cast Design Matrix

The following designs are grounded in `src/academy/cast.ts` and story scripts. They are visual direction, not private biography.

| ID | Visual Hook | Silhouette | Wardrobe | Signature Props | Acting Range |
| --- | --- | --- | --- | --- | --- |
| `rie` | Tired-radiant mentor | loose bun, cardigan, papers, thermos verticals | cream cardigan over dark blouse, lanyard, practical belt | green thermos, marked worksheets, tea, hana-maru red | warm, proud, tired, thoughtful, surprised, gently evasive |
| `henry` | AI tinkerer dodging homework | messy hair, laptop rectangle, slouched overshirt | indigo overshirt/hoodie, sky accent, backpack strap | laptop with original abstract stickers, cable, notebook | sheepish, excited, panicked, determined, sleepy |
| `aakash` | stylish city-pop driver | undercut, sharp jacket shoulder, car-key/cassette | charcoal jacket, lilac accent, clean sneakers, subtle jewelry | classic car key fob, retro cassette, original cat charm (not Hello Kitty) | charming, amused, moved, secretly nervous, DJ confidence |
| `alex` | quiet Fuji senpai | compact hiking posture, rucksack, clean profile | slate fleece or field jacket, sky scarf/strap, hiking watch | rucksack, mountain patch without text/logo, folded route map | neutral, warm, determined, farewell-vulnerable, one-nod comedy |
| `tom` | creature-game enthusiast | tousled sand hair, bright roundness, hoodie | forest hoodie, mint lining, casual trainers | handheld console, original capsule-game pin, paw charm for Chestnut | delighted, surprised, proud, childlike enthusiasm without childish design |
| `sam` | Saturday athlete and okonomiyaki evangelist | tennis shoulders, relaxed stance, rolled sleeves | forest/sage track jacket or casual polo, wristband | tennis racquet handle, okonomiyaki plate, water bottle | hungry-happy, competitive, inviting, embarrassed by sincerity |
| `francis` | gentle manga/music dreamer | wavy hair, thin glasses, soft cardigan shape | plum cardigan, lilac scarf or headphones, layered tee | tea cup, music charm, blank manga-sized notebook | sleepy, moved, vulnerable, softly happy, trying-not-to-cry |
| `shin` | kanji wizard ramen guide | round glasses, tidy navy, bowl/steam curve | navy overshirt, sky accent, simple apron in ramen scenes | ramen bowl, chopsticks, radical notebook with no readable text | warm, dryly amused, teaching-focus, proud-of-a-good-radical |
| `jodi` | quiet heart chasing memory | silver bob, book held close, red bookmark thread | plum coat/cardigan, rose scarf, comfortable shoes | old notebook, red bookmark, tea | warm, wistful, unreadable, quietly moved, protective |
| `christian` | disciplined oddball | buzz cut, gym bag geometry, unexpected recorder | slate athletic top, sage towel, practical trainers | dumbbell, desk fan, recorder | cheerful, earnest, random deadpan, focused, oblivious-comic |
| `jenny` | cozy connector | long auburn hair, knit scarf mass, soft hands | rose knitwear, mint headband, handmade scarf/cardigan | knitting needles/yarn, tea, wrapped parcel | warm, concerned, delighted, firm-kind, noticing-someone |
| `robert` | bon vivant organiser | sidepart, square glasses, blazer/menu pose | navy blazer/cardigan, sand scarf, neat shirt | blank menu card, reservation notebook, pub glass with no label | welcoming, wry, celebratory, "no one sits alone" seriousness |
| `mika` | quiet polyglot | long dark hair, folded-in posture opening over time | sky cardigan, soft blouse, simple pendant | globe pin, language tabs with no text, phone screen blank | shy, thinking, gathering courage, fluent-focus, surprised by herself |
| `sophie` | top of class learning to breathe | long black hair, round glasses, perfect notebook line | indigo cardigan/blazer, mint accent, precise collar | star sticker, capped pen, color-tabbed notebook with no readable text | bright, anxious, determined, overwhelmed, relieved-proud |
| `xingyu` | sunshine by choice | round glasses, undercut, bouncing posture | teal cardigan/jacket, lilac accent, earbuds | music charm, blank lyric notebook, small rhythm tap gesture | radiant, mischievous, thoughtful, vulnerable-then-bright, encouraging |
| `miller` | textbook ghost | crisp flat business silhouette | navy/sand salaryman-ish suit, too-clean outline | briefcase, model-sentence card with no readable text | neutral-perfect, uncanny polite, vanishing gag |
| `tawapon` | textbook ghost | diligent student silhouette, frozen model-answer pose | forest/mint sweater vest or cardigan, neat satchel | textbook, blank notebook | happy-perfect, encouraging, coursebook-stiff |

## Wardrobe Continuity

### Base Wardrobe

Every main cast member gets one base outfit used for neutral and early expression sets. It must be distinctive enough to identify the character in a silhouette sheet.

Base outfit metadata belongs in `<cast-id>__meta__v001.json`:

```json
{
  "baseOutfit": {
    "garments": ["plum cardigan", "lilac scarf", "thin glasses"],
    "accentColors": ["plum", "lilac"],
    "propPolicy": "tea cup and music charm, no branded character art"
  }
}
```

### Chapter Wardrobe Variants

Do not generate chapter variants until the neutral identity/reference pass is locked.

| Variant | Characters | Use |
| --- | --- | --- |
| `class-night` | everyone | default classroom, study links, roster |
| `rain-evening` | Rie, Alex, Robert, Mika, Sophie | route, pub, planning, station |
| `food-night` | Sam, Shin, Rie, Robert | okonomiyaki, ramen, pub scenes |
| `chapter-4-soft` | Francis, Jodi, Rie | vulnerable emotional scenes, library/garden |
| `planning-table` | Sophie, Mika, Jenny, Aakash | cafe planning and surprise party |
| `farewell` | Alex, everyone | chapter 6 airport/finale, restrained bittersweet |
| `textbook-ghost` | Miller, Tawapon | deliberately flatter/cleaner, slightly uncanny but still same house palette |

## Scene Usage By Chapter

| Chapter | Cast Priority | Required Visual Beats |
| --- | --- | --- |
| Prologue | Rie | Rie warm/tired anchor, notebook discovery, teacher desk presence |
| Ch. 1 `hajimemashite` | Xingyu, Henry, Jenny, Tom, Aakash, Alex, Sophie, Mika, Miller, Tawapon | name-circle silhouettes, Xingyu sunshine, Henry laptop reluctance, textbook ghosts |
| Ch. 2 `machi` | Alex, Robert | route clarity, quiet mountain confidence, pub invitation |
| Ch. 3 `taberu` | Sam, Shin, Rie | food invitation, ramen/okonomiyaki, kanji-as-picture teaching |
| Ch. 4 `kimochi` | Francis, Jodi | tender two-hander, quiet reading, emotional honesty without melodrama |
| Ch. 5 `keikaku` | Sophie, Mika, Aakash, Rie, Jenny, Shin | surprise planning, perfectionism, Mika phone courage, Rie unaware/tired |
| Ch. 6 `atarashii hanashi` | Alex, everyone, Rie, Jodi | farewell card, airport glass, blank last page, unresolved notebook/Rie thread |

Use portrait acting to preserve emotional continuity:

- Rie starts radiant but visibly tired; by Ch. 6 her tired smile has more history.
- Sophie moves from perfect posture to carried-by-the-team relief.
- Mika's shoulders open across the term.
- Francis's vulnerability must remain gentle, not theatrical.
- Alex's farewell is restrained; one nod can be a whole speech.
- Xingyu's sunshine occasionally reveals effort, then returns by choice.

## Contact Sheet Specs

### Cast Silhouette Wardrobe Sheet

Purpose: lock group readability before face likeness.

- Size: `4096 x 4096`.
- Grid: 4 x 4 for the 15 classmates + Rie; cameos get a second sheet.
- Each cell: half-body silhouette/wardrobe, neutral expression, prop held or attached.
- Face detail can be softened if no consent/photo manifest exists.
- Background: muted blue-hour gradient, no text baked into the image.
- Labels are recorded in the manifest, not generated into the image.
- Review at 25%, 12.5%, and 72 px thumbnail.

### Per-Character Expression Sheet

Purpose: lock acting range and identity consistency.

- Size: `4096 x 4096`.
- Grid: 4 columns x 3 or 4 rows.
- Row 1: neutral, happy, warm, thinking.
- Row 2: surprised, determined, tired, proud.
- Row 3: vulnerable plus two story-specific expressions and one prop/hand study.
- Same crop, same camera, same outfit, same lighting.
- No text, borders, UI, name labels, watermarks.

### Sprite Sheet

Purpose: game-ready VN stage.

- Size: one transparent/chroma half-body per file preferred.
- If sheeted: `4096 x 4096`, 4 columns x 3 rows, transparent or flat chroma-key.
- Each sprite must have the same foot/waist baseline and eye-line.
- Preserve at least `64 px` gutter between cells for clean slicing.

## Prompt System

### Master Style Prompt

Use when seeding a generation thread with `campus-blue-hour.webp` and `rie-sensei.webp`:

```text
Use case: illustration-story
Asset type: Yomu Academy cast art style seed
Input images: Image 1 is the campus blue-hour anchor; Image 2 is the Rie-sensei mentor anchor. Use them for palette, lighting, texture, adult visual-novel polish, and continuity only.
Primary request: Establish original Yomu Academy cast art direction for adult evening Japanese-class characters.
Style/medium: high-detail raster visual-novel illustration with painterly anime realism, warm human acting, subtle structured pixel grain in shadows and edges, crisp silhouette design.
Lighting/mood: blue-hour indigo/teal shadows, warm amber practical light, coral/rose accents, leaf-green life, gentle rim light.
Constraints: original characters and locations; adult learners only; no school uniforms; no logos, no crests, no brand labels, no readable text, no UI, no watermarks; do not imitate any specific game, anime, studio, franchise, artist, or real person.
Avoid: flat SVG/card style, plastic AI faces, generic same-face anime, childish proportions, copyrighted mascots, official UCL marks, real signage.
```

### Neutral Reference Portrait Prompt

Use for Pass 1 for every character. If consented photos are absent, include the non-likeness line.

```text
Use case: illustration-story
Asset type: Yomu Academy character neutral reference portrait
Input images: campus-blue-hour.webp and rie-sensei.webp as house-style references only. If a consent manifest exists for this cast ID, attach only the approved reference photos listed there as identity references; otherwise attach no real-person photo.
Primary request: Create the neutral reference bust portrait for <CAST_NAME> (<CAST_ID>), an adult evening Japanese-class character.
Character canon: <ROLE>. Hobby motif: <HOBBY>. Personality beat: <BIO_SUMMARY>.
Wardrobe and silhouette: <BASE_WARDROBE_AND_SILHOUETTE>.
Props: <ORIGINAL_NON_BRANDED_PROPS>.
Expression: neutral class presence, relaxed faint smile, emotionally alive eyes, front-facing 3/4 bust.
Composition/framing: 1024x1536 portrait, head to mid-torso, eyes in upper third, soft blue-hour classroom/campus blur, dialogue-safe lower crop.
Lighting/mood: warm amber rim light against cool indigo/teal shadows; subtle coral/leaf accent.
Privacy: If no consented reference photos are attached, do not copy or imply any real person's likeness; design from written canon only.
Constraints: adult proportions; no school uniform; no readable text; no logos; no watermarks; no protected mascot or franchise imagery; no official UCL marks.
Avoid: same-face anime, glamour poster, cosplay, flat SVG, generic app-avatar card.
```

### Consented Likeness Prompt Addendum

Append only when a valid consent manifest exists and approved photos are attached:

```text
Identity preservation: Use the attached approved reference photos only to preserve this consenting adult's face shape, hairline, skin tone, glasses if present, and natural expression tendencies. Keep the person recognizably themselves after stylization. Do not beautify, age-change, slim, exaggerate, change ethnicity, change skin tone, or infer private traits. Replace the original photo setting and clothing with the approved Yomu Academy wardrobe below. Preserve dignity and warmth.
```

### Expression Variant Prompt

Use after a neutral reference portrait is approved.

```text
Use case: identity-preserve
Asset type: Yomu Academy expression variant
Input images: approved <CAST_ID> neutral reference portrait as the identity anchor; optional house-style anchors if needed.
Primary request: Same character, same age, same face, same hair, same glasses, same body proportions, same base outfit and prop scale. Change only expression and small acting pose.
Expression target: <EXPRESSION> - <ACTING_DIRECTION>.
Composition/framing: same 1024x1536 bust crop and eye-line as neutral; no camera drift.
Constraints: no text, no logo, no watermark, no background detail that competes with the face; preserve identity and wardrobe exactly.
Avoid: new person, changed hair part, changed glasses, changed outfit, different skin tone, overacting.
```

### Sprite Prompt

```text
Use case: illustration-story
Asset type: VN half-body sprite
Input images: approved neutral reference portrait and approved expression reference for <CAST_ID>.
Primary request: Create a half-body VN sprite of the same character, same outfit and expression, facing 3/4 toward viewer, hands/prop visible only if cleanly drawn.
Composition/framing: 1536x2048, character centred, head to mid-thigh, consistent eye-line, generous transparent/chroma padding.
Background: perfectly flat #00ff00 chroma-key background for local removal, no shadow, no floor, no texture. Do not use #00ff00 in the subject.
Constraints: crisp hair and glasses edges, no text/logos/watermarks, adult proportions, no copyrighted mascot props.
```

### Group CG Prompt Addendum

```text
Use approved per-character references for identity and wardrobe. In group scenes, prioritize emotional staging over face-count density: every visible character needs a readable silhouette, but not every classmate needs a close face. Keep phones, boards, cards, menus, notebooks, and signs blank or unreadable. No official UCL, train, restaurant, game, or mascot marks.
```

## Character Prompt Notes

Use these notes in `character-neutral-pass.jsonl`.

| ID | Prompt Kernel |
| --- | --- |
| `rie` | adult teacher, loose bun, cream cardigan, dark blouse, lanyard, green thermos, marked worksheets, tired radiant warmth |
| `henry` | adult AI tinkerer, messy brown hair, indigo overshirt, laptop, cable, sheepish homework-dodging energy |
| `aakash` | stylish adult, black undercut, neat beard if approved by canon/consent, charcoal jacket, lilac accent, retro city-pop/cassette/car-key motifs, no brand cat |
| `alex` | quiet adult mountain climber, short brown hair, slate fleece, compact rucksack, subtle mountain patch, restrained kindness |
| `tom` | enthusiastic adult gamer, tousled sand hair, forest hoodie, handheld console, generic creature-game capsule pin, paw charm |
| `sam` | easygoing adult athlete, short chestnut hair, forest/sage sports layer, tennis wristband, okonomiyaki plate |
| `francis` | gentle adult reader/music fan, wavy sand hair, thin glasses, plum cardigan, tea, blank manga notebook, teal music charm |
| `shin` | warm adult kanji/ramen guide, short black hair, round glasses, navy overshirt, ramen bowl, blank radical notebook |
| `jodi` | older adult quiet heart, silver bob, plum cardigan/coat, rose scarf, book with red bookmark, wistful warmth |
| `christian` | adult gym/volunteer oddball, buzz brown hair, slate athletic top, sage towel, gym bag, desk fan or recorder |
| `jenny` | cozy adult connector, long auburn hair, rose knitwear, mint headband, yarn/knitting needles, tea |
| `robert` | adult pub organiser, sidepart brown hair, square glasses, navy blazer, sand scarf, blank reservation notebook/menu |
| `mika` | quiet adult polyglot, long soft-black hair, sky cardigan, globe pin, blank language tabs, shy precise expression |
| `sophie` | brilliant anxious adult, long black hair, round glasses, indigo cardigan/blazer, mint accent, perfect blank notebook, star motif |
| `xingyu` | adult sunshine music fan, black undercut, round glasses, teal jacket/cardigan, lilac accent, earbuds, rhythm-tapping warmth |
| `miller` | textbook ghost, crisp too-clean adult business silhouette, navy suit, briefcase, uncanny neutral politeness |
| `tawapon` | textbook ghost, diligent adult student silhouette, forest/mint sweater, satchel, model-answer cheer |

## Priority Tiers

### P0 - Safety And Style Lock

1. Confirm consent/photo manifest status.
2. Generate or assemble `cast-silhouette-wardrobe-v0` without likeness claims.
3. Approve master palette, line, texture, and crop.
4. Approve file naming and metadata templates.

P0 is complete only when the team can tell every main cast member apart at thumbnail size without facial detail.

### P1 - First Playable VN Cast

Required assets:

- Rie: neutral, warm, tired, proud, thoughtful, surprised; bust and half-body.
- Chapter 1 centre: Xingyu neutral/happy/thinking/vulnerable; Henry neutral/sheepish/happy/panic.
- Chapter 2-3 centres: Alex, Robert, Sam, Shin neutral/happy/thinking/determined.
- Contact sheets for those characters.

### P2 - Full Main Class

Required assets:

- All classmates: neutral, happy, warm, thinking, surprised, determined, tired, vulnerable, proud.
- Bust + half-body for each.
- Chapter wardrobe variants only after base identity locks.

### P3 - Cameos And Special Scenes

Required assets:

- Miller and Tawapon ghost set.
- Pub night, okonomiyaki/ramen night, surprise party, chapter 4 tender two-hander, airport/farewell, Japan finale.
- Scene CGs generated from approved character refs, not from text-only memory.

### P4 - Hundreds-Asset Expansion

The scalable matrix:

```text
17 cast IDs
x 9 expressions
x 3 crops (head, bust, halfbody)
x 2 wardrobe states
= 918 potential character files before CGs
```

Do not generate this in one undifferentiated batch. Lock identity, then expression, then crop, then wardrobe, then scene.

## Quality Gates

### Gate 1 - Privacy And Rights

Reject if:

- Any output claims likeness without a consent manifest.
- Any real photo, class material, social profile, or voice was used without explicit manifest entry.
- A copyrighted mascot, logo, crest, official sign, brand, readable label, or third-party character appears.
- The image implies a private trait not present in written canon and consent.

### Gate 2 - House Style

Pass if:

- It sits beside `campus-blue-hour.webp` and `rie-sensei.webp` without looking pasted from another project.
- Blue-hour cool/warm contrast is present.
- Pixel grain is subtle and structured.
- Edges are crisp enough for VN stage use.
- Human expression feels warm and adult.

Reject if:

- Plastic airbrushed skin.
- Same-face syndrome.
- Flat SVG/card look.
- Over-neon, over-gloss, or one-color palette.
- Childlike or school-uniform styling.

### Gate 3 - Character Continuity

Pass if:

- The silhouette is identifiable without props.
- Expression variants preserve identity.
- Wardrobe and hair stay stable.
- Prop is original, non-branded, and story-relevant.

Reject if:

- Aakash loses city-pop/stylish silhouette.
- Alex becomes generic hiking stock art.
- Tom's prop becomes a literal Pokeball or Nintendo device.
- Francis becomes a protected anime/music character fan poster.
- Xingyu becomes a Miku clone.
- Rie loses teacher/thermos/paper continuity.

### Gate 4 - Technical

Pass if:

- Correct dimensions and crop.
- No text/logos/watermarks.
- Hands, glasses, hair, props are anatomically plausible.
- Mobile/thumbnail crop works.
- Alpha/chroma removal is clean where required.
- Metadata exists with prompt, references, date, rights, reviewer, and acceptance notes.

### Gate 5 - Accessibility And Scene Use

Pass if:

- The portrait does not carry required information unavailable in text.
- Expression alt text can be stated simply if load-bearing.
- Dialogue panel does not hide the face/acting.
- Color is not the only character or state cue.
- Reduced-motion scenes can swap portraits statically.

## Metadata Template

Each approved version gets a sibling metadata file:

```json
{
  "assetId": "aakash__expr__happy__bust__v001",
  "castId": "aakash",
  "assetKind": "expr",
  "state": "happy",
  "crop": "bust",
  "file": "public/academy/art/characters/cast/aakash/aakash__expr__happy__bust__v001.webp",
  "origin": "generated",
  "tool": "OpenAI image generation",
  "generationDate": "YYYY-MM-DD",
  "inputReferences": [
    {
      "path": "public/academy/art/campus-blue-hour.webp",
      "role": "house-style reference"
    },
    {
      "path": "public/academy/art/characters/cast/aakash/aakash__ref__neutral__bust__v001.webp",
      "role": "identity anchor"
    }
  ],
  "consent": {
    "requiredForLikeness": true,
    "status": "not-used-no-photo-likeness"
  },
  "prompt": "stored exact prompt",
  "rights": {
    "status": "draft",
    "rightsHolder": "Yomu Academy project",
    "license": "internal project asset pending clearance",
    "permittedUses": ["Yomu Academy development review"]
  },
  "qa": {
    "privacy": "pass",
    "style": "pass",
    "characterContinuity": "pass",
    "technical": "pass",
    "reviewer": "name/date"
  }
}
```

## Production Workflow

1. **Canon lock:** confirm cast IDs, written traits, wardrobe notes, disallowed props.
2. **Consent audit:** locate or create the consent/photo manifest. If absent, run Lane A only.
3. **Silhouette sheet:** generate wardrobe/silhouette contact sheet without likeness claim.
4. **Neutral references:** generate one neutral bust per cast ID. Review style, silhouette, privacy, and story fit.
5. **Character lock:** use each approved neutral portrait as the identity anchor for expression variants.
6. **Expression sheet:** generate 8-9 expressions per character in a short, controlled run.
7. **Sprite extraction:** generate half-body sprites from approved expression portraits. Remove chroma/alpha and inspect.
8. **Crop derivation:** derive head thumbnails from approved busts rather than regenerating.
9. **Scene CGs:** compose from approved character refs plus approved environment refs. Never text-only for major group scenes.
10. **Metadata and review:** no image is shippable without prompt/reference/rights/QA metadata.

## Red Lines

- Do not put unconsented class photos in prompts.
- Do not use hidden local photos merely because they exist on disk.
- Do not turn named classmates into one-to-one public likenesses without opt-in.
- Do not use protected mascot art as a shortcut for hobbies.
- Do not ship generated faces with no provenance.
- Do not let the existing SVG avatar specs become a ceiling for final art quality.

## Current Action Items

1. Create or locate the missing consent/photo manifest before any likeness work.
2. Use `public/academy/art/characters/cast/asset-manifest.json` as the initial production matrix.
3. Use `public/academy/art/characters/cast/prompts/character-neutral-pass.jsonl` for the first text-only neutral pass.
4. Generate `contact-sheets/cast-silhouette-wardrobe-v0.png` as a style/wardrobe board only, not a likeness deliverable.
5. After consent references exist, rerun the neutral pass with the Consented Likeness Prompt Addendum and person-approved notes.
