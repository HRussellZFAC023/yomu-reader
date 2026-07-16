# Character and Reference Dossier

This is the casting source of truth for writing and art production. It contains first names and creative traits only. It excludes phone numbers, contact screenshots, employers, addresses, and unverified identities.

## Reference sets

The preserved class-photo references are in:

`/Users/heru/Documents/Projects/yomu/release-worktrees/yomu-academy-initial-20260711/public/academy/art/characters/claude-production/refs/`

Use these files as the contact sheet for real-class likeness:

- `class-group-01.webp` through `class-group-06.webp`
- `konbini-aakash-tom.png`
- `style-aakash.png`, `style-alex.png`, `style-rie.webp`
- `quality-2.webp` through `quality-5.webp` are the four approved protagonist choices
- `quality-1.jpg` is excluded; `quality-6.jpg` remains a rendering reference only
- `anime-ref-campus-ensemble.webp`, `anime-ref-rie.webp`, `style-campus.webp` for world consistency

The rejected v2 sprite source map remains useful as a written identity index:

`/Users/heru/Documents/Projects/yomu/release-worktrees/yomu-academy-initial-20260711/public/academy/art/codex-production-v2/sprites/source-map.json`

Its generated sprite files are not approved.

## Real-class ensemble

| Character | Visual lock | Interests and voice | Story and learning home | Reference confidence |
| --- | --- | --- | --- | --- |
| Rie | Japanese woman, soft dark bun, warm tired-bright eyes, cream cardigan/navy blouse | tea, natto, cup noodles; practical warmth; many-job running joke | guide, register, repair language, feedback | strong: dedicated Rie refs and approved OpenAI sprite |
| Henry | messy short brown hair, slightly sleepless, casual indigo layers | AI, too many laptops, avoiding homework by building tools | learner proxy, independent study, explaining technology | strong in group photos |
| Aakash | South Asian man, neat black hair, hat-free default; keep beard only if the selected photo supports it | classic cars, city pop, Hello Kitty, anime fashion | directions, city talk, listening during conflict | strong: `konbini-aakash-tom.png`, `style-aakash.png`, several group photos |
| Alex | White man, short brown hair, ordinary understated clothes | Fuji, accumulated travel experience | experience, sequencing, fictional Japan opportunity | strong: `style-alex.png` plus group photos |
| Tom | White man, clearly blond, fuller friendly face, clean-shaven | Nintendo, Pokemon, Chestnut | katakana, counters, kanji battle | strong: `konbini-aakash-tom.png` and group photos; reject dark-haired/bearded outputs |
| Sam | relaxed athletic White man, short chestnut hair | okonomiyaki, Saturday tennis | invitations, routines, noticing quiet classmates | medium; verify exact group-photo match before generation |
| Francis | gentle White man, soft sand-brown hair, no glasses | tea, Frieren, manga, Miku | opinion, feeling, media discussion | medium; no-glasses lock is confirmed |
| Shin | East Asian man, short black hair, round glasses | ramen, Totoro, Nintendo Museum, kanji | radicals, menus, nuance | strong in meal/group photos |
| Jodi | older White woman, silver-streaked bob | lived in Japan, memory and change | past narration, comparison | medium; age must remain visible and kind |
| Christian | Black man with tied-back ponytail, athletic presence | gym, volunteering, desk fan, recorder | routines, instructions, physical comedy | medium; identity lock confirmed |
| Jenny | woman with long hair and a warm, composed presence | knitting, notices the room | offers, description, fictional high-stakes departure/return | medium; do not import real job details |
| Robert | White man, side-parted brown hair, square glasses | restaurants, fine dining, pub plans | ordering, invitations, hosting/listening | medium |
| Mika | blond White/European man, thin glasses, shy expression | many languages | clarification, pronunciation, speaking confidence | medium; male and blond are fixed |
| Sophie | Chinese/Hong Kong woman, long dark hair, no glasses | rigorous, prepared, very smart | grammar, evidence, productive uncertainty | medium; avoid earlier face drift |
| Xingyu | East Asian woman, short hair/undercut, round glasses, joyful energy | Miku and singing | rhythm, listening, vulnerable performance | strong personality lock; verify exact likeness |
| Angel | East/Southeast Asian woman, long straight dark hair | organised, generous, technology/planning | writing, project coordination, learning to trust others | medium |
| Stasi | woman with red/auburn wavy hair and round glasses | art, style, independent recommendations | expressive Japanese and visual interpretation | strong visual lock |
| Ruparna | South Asian woman, long dark hair, thoughtful presence | film, subtitles, interpretation | inference and ambiguity | medium |
| Rose | woman with brown hair | farm work and previously living in Japan | nature, practical language, memory; paper/ink clue | identity not tied to an unknown number; generate only after reference match |
| Peter | quieter peripheral classmate | observation | review and the decisive simple question | low; needs reference confirmation before likeness art |

## Named extended ensemble

| Character | Visual lock | Interests and voice | Story and learning home | Reference confidence |
| --- | --- | --- | --- | --- |
| Nanako | private contextual group-photo candidate; do not publish the source or expand expressions before owner confirmation | concise bilingual warmth, natural social Japanese, considerate timing, gentle corrections and humour | pragmatic messages, social repair, invitations, returning-friend scenes | candidate likeness pair recorded by hash in the ignored private ledger; owner confirmation required |
| Mira | fair-skinned adult woman; shoulder-length warm-blond hair, black cap, oversized blue hoodie, cream wide-leg trousers, clear umbrella | friendly, direct and playful; language meetups, game-based learning, a modest daily study habit, practical plans | beginner conversation, habit design, game-vocabulary limits, personal-corpus review, return-after-absence scenes | owner-confirmed private reference (`SHA-256 69cdbe8bf0ff2ab74e87b83e5495cd658a82b70b391245256f8538bfc875febe`); neutral sample not generated; release-blocked pending likeness and equal-stage cast approval |

## Unresolved people

Nanako and Mira are named independently and do not resolve either unknown contact. Two phone-number-only contacts may correspond to Rose and another Chinese classmate. They remain outside the named cast and art queue until a photo and name match is established. No placeholder identity is invented.

## Textbook legends

Miller, Tawapon, Mary, Takeshi, and selected Genki/Minna characters are original Yomu interpretations informed by the local books. Their journal label is `A legend from the textbook`. They may recur as comic continuity, tutors, rivals, or examples, but their art is newly generated rather than copied from textbook illustrations.

## Protagonist choices

The opening offers four visual identities from `quality-2` through `quality-5`. The player chooses a portrait, enters a name and reason for learning Japanese, and may change the portrait later from their journal. The story does not infer gender, personality, or romance preference from the image. All four receive the same warm pixel-painted rendering pass and a compact expression set so the protagonist can appear in journal moments and selected event scenes.

## Art acceptance per character

1. Assemble all matching reference crops from the six group photos and any dedicated image.
2. Generate one neutral half-body sprite with OpenAI image generation.
3. Compare face shape, hair, age, body proportions, and ordinary wardrobe against references.
4. Reject identity drift before producing expressions.
5. Produce expressions from the accepted neutral reference: happy, laughing, thinking, surprised, concerned, determined, embarrassed, speaking, listening.
6. Add only story-backed costumes and poses. Aakash is not always in a hat; Tom is never given dark hair or a beard.
7. Record prompt, source images, output path, review decision, and planned scenes in the art manifest.
8. Review the full cast and all four protagonists together on one neutral stage before approving production. Individual quality does not excuse cross-character style drift.
