# Codex sprite generation handoff — 2026-07-11 23:00 window

One codex thread per character. Each thread generates that character's missing
expression variants to the v2 sprite spec, keys the chroma background, verifies
alpha, and writes files + meta.json in the v2 naming convention.

## Output contract (per file)

- Path: `public/academy/art/codex-production-v2/sprites/<char>/<char>__sprite__<expression>__halfbody__v2.png`
- Real transparency (verified with `docs/academy/art/codex-production-v1/sprites/tools/verify-sprite-alpha.py`)
- Half-body, head to mid-thigh, centred, front three-quarter view, empty hands
- Target ≥1035×1600 delivered (upscale from native is fine; record in meta)
- meta.json alongside, matching the existing v2 meta shape (prompt, seed, key, native/delivered px)
- After a character set lands, add its expressions to `V2_EXPRESSIONS` in `src/academy/engine/assets.ts`

## Pipeline (proven, from the v2 batch)

1. `codex exec` with `-i <reference images>`; prompt demands a PERFECTLY FLAT
   `#00ff00` (or cyan) chroma background — see gold-template prompt below.
2. Key: `docs/academy/art/codex-production-v1/sprites/tools/key-cyan-sprite.py`
   (adapt key colour) or `process-sprite.sh`.
3. Verify: `verify-sprite-alpha.py`; inspect edges over white/black/grey.
   Green/magenta fringe = reject and regenerate, never CSS-fix.
4. Generate 2–3 seeds per expression, keep the best (v2 batch scored
   `keyed_frac`; visually judge likeness first).

## Gold-template prompt

Use the Rie v2 prompt as the structural template (identity block + wardrobe +
expression + chroma-background block + style block + constraints block). Full
text in `public/academy/art/codex-production-v2/sprites/rie/rie__sprite__happy__halfbody__v2.meta.json`.
Style anchor phrase: "warm hand-painted anime illustration, painterly
anime-film realism, clean confident lineart, soft cel shading with subtle
structured pixel grain in the shadows, believable adult human anatomy". Never
name artists/studios/franchises. Adults only, no school uniforms, no chibi.

## Expression set (full)

neutral, happy, laughing, thinking, surprised, concerned, determined,
embarrassed, speaking, listening. Face geometry, age, hair mass, wardrobe,
body scale, light direction IDENTICAL across the set (eyes/brows/mouth/tilt/
posture change only).

## Queue — one thread each

Likeness corrections (hard requirements): **Tom is blond and clean-shaven (no
beard, ever)**. **Aakash is not always wearing a hat** (bare-headed default).
Pho does not exist (removed). Suzu/Leo/Nori are non-canon — never generate.

| Character | Has (v2) | Needs | Best references |
|---|---|---|---|
| henry | 8 | neutral, listening | `codex-production-v2/sprites/henry/*.png` (identity lock from existing set) |
| alex | 8 | happy, laughing? (has laughing; needs happy, thinking) | existing v2 set + `characters/claude-production/refs/style-alex.png` |
| tom | 7 | concerned, surprised, thinking | existing v2 set (BLOND, CLEAN-SHAVEN) |
| aakash | 8 | happy, laughing | existing v2 set + `refs/style-aakash.png` (no hat) |
| rie | 8 | speaking, listening | existing v2 set + `refs/anime-ref-rie.webp` |
| sam | 8 | concerned, determined | existing v2 set |
| francis | 4 | the other 6 | existing v2 4 + `claude-production-v3/characters/francis/*.webp` |
| christian | 1 | the other 9 | v2 neutral + `claude-production-v3/characters/christian/*.webp` |
| sophie | 1 | the other 9 | v2 neutral + `characters/portraits/sophie.png` |
| shin | 0 | full set | `claude-production-v3/characters/shin/*.webp` + `characters/portraits/shin.png` |
| jodi | 0 | full set | `claude-production-v3/characters/jodi/*.webp` + portrait |
| jenny | 0 | full set | `claude-production-v3/characters/jenny/*.webp` + portrait |
| robert | 0 | full set | `characters/portraits/robert.png` + `characters/claude-production/sprites/robert__*.png` (style only — likeness weak, pick carefully) |
| mika | 0 | full set | `characters/portraits/mika.png` + `characters/production/mika/*source*` (magenta-backed; reference only) |
| xingyu | 0 | full set | `characters/portraits/xingyu.png` + claude-production sprites |
| angel | 0 | full set | `characters/portraits/angel.png` + claude-production sprites |
| stasi | 0 | full set | `characters/portraits/stasi.png` + claude-production sprites |
| ruparna | 0 | full set | `characters/portraits/ruparna.png` + claude-production sprites |
| miller | 0 | neutral, speaking, happy (guest tier) | none — design from Minna canon: American businessman, IMC, 28, suit |
| tawapon | 0 | neutral, speaking, happy (guest tier) | none — design from Minna canon: Thai student, friendly |

Weakest-reference characters (robert, mika, xingyu, angel, stasi, ruparna):
generate a NEUTRAL MASTER first, get it visually right against the portrait,
then lock identity for the rest of the set.

## After sprites: backgrounds + CGs queue (later waves)

Missing plates wanted by the world map: `konbini__day`, `gym__day`,
`street-market`, `student-room__day`, plus event CGs (surprise party, class
meal, kana first-write close-up). Follow the recipe in
`docs/academy/art/codex-image-prompt-recipe.txt` (composition reserves
lower-left negative space for dialogue UI; no baked text/logos).
