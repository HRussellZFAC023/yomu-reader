# Yomu Academy cast — house style

**Status:** authoritative. Every cast sprite — every character, every expression, every
pose angle — must render in this one style. Individuality comes from face anatomy, hair,
wardrobe, and a single cool accent, never from a different render.

**Grounding (no GPT/vision was used to write this).** This brief is derived only from:

- `docs/academy/VISUAL-SYSTEM.md` — the living-paper design language. Its colour tokens
  are the load-bearing source for every hex marked *(VISUAL-SYSTEM token)* below.
- `src/academy/domain/cast-registry.ts` — the canonical cast and its `visualBrief`
  identity notes.
- Deterministic pixel measurement of the three approved anchor sprites with `sips`
  (canvas size) and an alpha-channel bounding-box pass (framing percentages). No
  colour was eyeballed or model-sampled; palette families are *specified* by this
  brief to satisfy the living-paper warmth rules, not read off the pixels.

The quality bar is the three likeness-approved casts — **Rie**, **Sophie**, **Steve**
(`visualEvidence: 'approved'`, `eligibility.likenessRuntime: true` in the registry).
Use only the production family selected by `CAST-PRODUCTION-INVENTORY.json` as a
character identity reference. Retired or superseded versions remain historical evidence,
never generation anchors.

---

## 0. Style anchors (the three approved masters)

Every generation is a **style transfer over one of these** — the anchor is the identity +
composition source and MUST be passed as the final `-i`. Pick the clearest **front-facing**
master of each (measured below):

| Character | Anchor file (pass as final `-i`) | Canvas (`sips`) | Figure fills W | Top headroom | Bottom margin |
|---|---|---|---|---|---|
| **Rie** (teacher) | `public/academy/art/characters/rie/rie__neutral-glasses__front-near-front__halfbody__v001.png` | **1536 × 2048** | 69.6 % | 4.3 % | 0 % (bleeds off) |
| **Sophie** (classmate) | `public/academy/art/characters/sophie/sophie__encouraging-listening__front-near-front__halfbody__v003.png` | 941 × 1672 | 96.4 % | 5.6 % | 0 % (bleeds off) |
| **Steve** (classmate) | `public/academy/art/characters/steve/steve__neutral-silver-hair-glasses-family-message__front-near-front__halfbody__v002.png` | **1536 × 2048** | 76.1 % | 4.2 % | 0 % (bleeds off) |

Rie and Steve are the **canonical `1536 × 2048` (3:4)** masters — new generation targets
this canvas. Sophie's approved set is a narrower trimmed variant (`941 × 1672`, ≈9:16);
pass her file for *identity* when restyling Sophie, but still author to `1536 × 2048`.

Registry `visualBrief` notes for the anchors (identity guards, verbatim):

- **Rie** — teacher salutation `Rie-sensei` / `りえ先生`; no free-text brief. Identity comes
  from her anchor sprite: adult woman, shoulder-length dark hair, round glasses, cream
  cardigan over a teal blouse.
- **Sophie** — no free-text brief; `visualEvidence: 'approved'`. Identity comes from her
  anchor: adult woman, deep teal-navy coat, warm neutral fill. Her sprite carries the
  cool-accent-per-figure exemplar (the teal coat).
- **Steve** — `"Older man; married to a Japanese wife; learning to write naturally in
  family group chats with his bilingual children."` Reads as an older adult man; brown
  hair; warm, grounded wardrobe.

---

## 1. One-line identity

Warm, paper-painted **semi-realistic visual-novel anime** — adult proportions, soft 2-tone
cel shading with feathered (brushed) shadow terminators, warm charcoal colour-held
linework, restrained amber rim light, a muted paper-toned palette, on a **transparent**
canvas that the app composites over the living-paper cream world. Not flat TV-anime cel.
Not photoreal. Not chibi.

---

## 2. Rendering spec

- **Technique:** semi-realistic VN anime. Cel-like *construction* (clear local-colour
  shapes, ~2–3 shadow families per material) finished with painterly brush texture and
  gradient transitions. Read it as "soft 2-tone cel with feathered terminators."
- **Line weight:** present but **not a black cartoon outline**. Warm charcoal / dark-umber
  lines, **colour-held** to the local material (a warm brown line on skin; a cooler dark
  line in navy cloth). Weight is **variable** — heaviest in contact areas (under the chin,
  jaw, hair clumps, glasses rims, collars, fingers, major folds), lighter or dissolved on
  lit outer edges.
- **Edge treatment (silhouette):** crisp enough for sprite readability but **not
  vector-clean** — painterly anti-aliasing and small brush irregularities. On a lit
  silhouette edge the line can disappear entirely into paint. A thin AA rim is the *only*
  soft edge; there is **no glow band**.
- **Shadow edges:** mostly soft, broken, or dry-brushed. **No hard theatrical cel steps
  and no harsh halos.** Large shadow masses are deliberately designed, but their boundaries
  are brushed, not vector.
- **Texture is load-bearing:** a subtle paper-grain / dry-brush pass runs across the
  **entire** figure — skin included, not just cloth. This is what separates the house style
  from a clean digital render. It echoes the living-paper world's imperfect, hand-made
  surface grammar (see VISUAL-SYSTEM "Component grammar").
- **Hair:** painted in chunky locks — dark mass first, then warm amber strand highlights
  and charcoal interior strokes. Never hair built only from thin line filaments.
- **Cloth folds:** painterly block shadows + short hatch strokes, never clean vector
  creases.
- **Props** (glasses, books, lanyards, phones, badges, bowls, cards): simplified into the
  same paint treatment; any text/detail on them is softened and **low-contrast** — never
  crisp, readable micro-type.

---

## 3. Palette family

Overall: **warm, muted, paper-toned** — rich but never electric. Medium-to-dark overall
value with warm, bright focal areas on face and hands. Every dark is warm charcoal (never
pure black); every light is cream/amber (never cold white). This is a direct extension of
the living-paper token rule: *"World ink — warm charcoal `#181b18`, never cold navy or
pure black."*

**Load-bearing tokens** *(VISUAL-SYSTEM tokens — use these exact values)*:

| Role | Hex | Source |
|---|---|---|
| Deepest dark / ink (hair cores, glasses, dark cloth) | `#181b18` | world ink *(VISUAL-SYSTEM token)* |
| Paper cream — composite/QA background (never painted in) | `#f1ead9` | paper *(VISUAL-SYSTEM token)* |
| Folded paper | `#ddd0b7` | folded paper *(VISUAL-SYSTEM token)* |
| Paper ink | `#29271f` | paper ink *(VISUAL-SYSTEM token)* |
| Pencil copy | `#655f51` | pencil copy *(VISUAL-SYSTEM token)* |
| Accent (green fallback) | `#5ea780` | `--academy-accent` fallback *(VISUAL-SYSTEM token)* |

**Skin family (specified — warm peach → honey → ochre → terracotta).** Treat as family
centres, not exact fills; each character shifts within the family under its lighting:

| Role | Target | Notes |
|---|---|---|
| Lit / highlight | `#e3a06a` | warm peach-honey; ivory-cream specular, **never white** |
| Base / mid | `#c67d4a` | honey-ochre |
| Shadow | `#9a5e39` | warm terracotta — **brown/orange, not gray/purple/black** |
| Deep contact shadow | `#714428` | umber, never `#000` |

Cheeks/nose/lips: soft rose-orange, **not pink-magenta**.

**Hair.** Dark hair sits at the ink family `#181b18`–`#21211c` (never flat blue-black);
brown hair (Steve) mids ≈ `#453621`/`#523e23`/`#6c4b2b`. Amber strand highlights
`#9f5e32`–`#be7943`. Even black hair carries warm reflected light.

**Clothing (muted; exactly one cool accent per figure is welcome).** Sophie's teal-navy
coat (≈ `#12262e`) is the accent exemplar. General wardrobe: muted navy, charcoal-blue,
teal, olive, rust, beige, tan, warm gray. **Dark clothes sit near charcoal/navy, never
pure black.** Cream/cardigan/parchment on-figure: warm beige, oatmeal, ochre; highlight is
ivory-cream, never white.

**The living-paper cream (`#f1ead9`) is the surface the sprite is composited *over*, never
painted into the PNG.** QA every sprite over cream, not over black.

---

## 4. Lighting

- **Key light:** warm and soft, from the **upper viewer-left** (soft upper-left key), the
  living-paper world's default gentle light. Face is front-lit enough to stay friendly and
  readable.
- **Occlusion:** soft shadows under hair, chin, collar, nose, hands, and fold overlaps.
- **Fill:** the opposite side is cool-dark — charcoal/navy in hair and cloth.
- **Rim / back light:** restrained **amber** on upper hair, shoulder edges, sleeves, the
  occasional outer contour. It must be **discontinuous painted strokes** — **never a
  continuous glow, halo, hard outline, or neon edge.**
- **No cast shadow inside the sprite. No ground shadow, no drop shadow, no keyline.** Keep
  the figure a clean transparent VN sprite.

---

## 5. Framing / crop

- **Canvas:** tall transparent PNG. **Canonical target `1536 × 2048` (3:4 portrait)** —
  matches the Rie and Steve masters (`sips`-verified). Sophie's approved set is a trimmed
  `941 × 1672` variant; author new work at `1536 × 2048` and trim only if a downstream slot
  requires it.
- **Aspect / background:** transparent RGBA. **No baked backdrop, no studio colour, no
  cream wash, no white outline, no drop shadow.**
- **Half-body, bleeds off the bottom.** These are **half-body-to-thigh** sprites — not bust
  portraits, not full-body standing figures. The crop cuts through **upper thigh / lower
  hip**; **bottom margin is 0** in every approved master (measured). Never leave empty space
  below the figure.
- **Figure width:** the visible box fills **~65–76 %** of canvas width for normal front
  poses (measured: Rie 69.6 %, Steve 76.1 %; Sophie's trimmed variant runs wider at
  96.4 % because its canvas is narrower). Go wider only when a gesture/prop demands it.
- **Top headroom:** small but comfortable — **~4–5 %** of canvas height above the hair
  (measured: Rie 4.3 %, Steve 4.2 %, Sophie 5.6 %).
- **Landmarks:** eyes in the **upper quarter** of the canvas; shoulders around the **upper
  third**.
- **Head scale:** adult VN scale — expressive but **not chibi**; no oversized childlike
  head.
- **Pose conventions:** calm classroom / bookshop presentation poses. **Front / near-front**
  (the neutral establishing shot) or **mild three-quarter** turn only; shoulders angle
  gently; no extreme perspective or foreshortening. Neutral/establishing expressions favour
  **front / near-front**; active/directed beats (determined, encouraging, sad) read well in
  a **mild three-quarter**.
- **The face — not the silhouette midpoint — anchors the composition.** Allow asymmetric
  side margin when a gesture reaches outward; do not centre by bounding box alone.
- **Naming convention (existing):** `{name}__{expression}__{poseAngle}__halfbody__v###.png`,
  e.g. `steve__determined__left-three-quarter__halfbody__v001.png`. Pose-angle tokens in
  use: `front-near-front`, `left-three-quarter`, `right-three-quarter`.

---

## 6. Negative list (hard bans)

Reject any sprite that shows:

- ❌ **Photoreal skin** — or rounder/younger "generic anime render" faces. Faces are
  semi-real adult planes (defined nose bridge, cheek structure, eyelids, understated mouth).
- ❌ **Any text, logo, watermark, UI, border, or readable micro-type** anywhere in the
  image (prop text must be softened and illegible).
- ❌ **Full-body** figures or **bust-only** crops; **chibi / oversized-head** proportions.
- ❌ **Busy background** or environment props filling negative space; **any baked
  background** — studio colour, gradient, vignette, cream wash, black, white, or gray —
  painted into the sprite file.
- ❌ **Hard outline halos** — a yellow-green / neon / bright graphic rim reading as a
  continuous outline glow around hair or silhouette. Rim light is amber, subtle, and
  broken.
- ❌ **Hard cutout edges** with no painterly AA; over-clean vector silhouette.
- ❌ **Clean uniform anime-ink outline** (thin, even, black). Lines must be warm,
  variable-weight, colour-held, partly absorbed into paint.
- ❌ **Hard theatrical cel steps / harsh shadow halos.** Shadow terminators are feathered.
- ❌ **Pure black shadows**, **pure white** highlights, cold gray or purple skin shadows.
- ❌ **Vivid cobalt / lime / saturated yellow hair / pure-red markings / crisp graphic cloth
  patterns** unless heavily warmed and desaturated.
- ❌ **Drop shadow / ground shadow / white keyline** on the figure.

---

## 7. Consistency across the cast

- Same rendering finish, same palette families, same crop scale, same soft upper-left
  lighting rig for **every** character. Individuality = face anatomy + hair + wardrobe +
  one cool accent.
- **Expression variants of one character:** change **brows, eyelids, mouth, head angle,
  hand pose** only. Preserve the same face anatomy, palette, crop scale, and finish across
  the set.
- Accessories (glasses, lanyards, books, phones, badges, bowls) support identity but stay
  subordinate to face and hands.

---

## 8. Luna prompt template (per-pose style-transfer restyle)

**Every generation restyles an EXISTING approved-likeness anchor via `-i` (image-to-image
style transfer). The anchor is the identity + composition source; the text below is only
the *style*. Never generate identity from text or from a photo alone.**

**MUST:** pass the character's **Rie / Sophie / Steve anchor from §0 as the final `-i`** so
the style stays consistent across the whole cast. For any character *other* than the three
approved masters, pass that character's own best likeness sprite as an earlier `-i` for
identity **and** append the nearest approved anchor (Rie for women/teacher poses, Steve for
older/male poses, Sophie for the cool-accent wardrobe reference) as the **final** `-i` style
lock.

The only per-shot edits are the two slots `{expr}` and `{poseAngle}`.

- `{expr}` — one emotion token: `neutral`, `happy`, `encouraging`, `determined`,
  `thinking`, `sad-vulnerable`, `surprised`, `comedic`.
- `{poseAngle}` — one of `front / near-front`, `mild left three-quarter`,
  `mild right three-quarter`.

```
Restyle the provided reference sprite into the Yomu Academy house style. Keep the SAME character identity, face, hair, glasses, wardrobe, and body from the reference image — only re-render the art. Do not invent a new person and do not change the outfit.

Style: warm, paper-painted semi-realistic visual-novel anime — adult proportions, NOT chibi, NOT photoreal, NOT flat TV-anime cel. Soft 2-tone cel shading with feathered, dry-brushed shadow terminators over designed shadow masses. Warm charcoal / dark-umber linework, colour-held to each material, with variable weight — heaviest under chin, jaw, hair clumps, glasses, collars, and fingers; dissolving on lit edges. A subtle paper-grain and dry-brush paint texture across the entire figure, skin included. Hair painted in chunky locks with warm amber strand highlights.

Palette: warm, muted, paper-toned; rich but never electric. Skin warm peach-to-terracotta (highlight ~#e3a06a, mid ~#c67d4a, shadow ~#9a5e39), warm rose-orange cheeks. All darkest darks are warm charcoal ~#181b18, never pure black. Dark clothing sits near charcoal/navy; one muted cool accent (teal/navy/olive) allowed. Cream/parchment objects highlight to ivory, never white.

Lighting: soft warm key from the upper LEFT; friendly front-lit face; cool-dark charcoal fill on the opposite side. Restrained AMBER rim light as short, broken painted strokes on upper hair and shoulders only — NEVER a continuous glow, halo, hard outline, or neon edge. No cast shadow, no drop shadow, no keyline.

Expression: {expr}. Pose: {poseAngle}, calm classroom/bookshop presentation pose, shoulders angled gently, no extreme perspective.

Framing: 1536x2048 tall portrait, fully TRANSPARENT background (transparent PNG / alpha cutout). Half-body-to-thigh crop — the figure bleeds off the bottom edge and is cut at the upper thigh/lower hip; small headroom (~4%) above the hair; eyes in the upper quarter; figure fills ~65-76% of width. The face anchors the composition.

Negative — do NOT include: any background, studio backdrop, cream wash, gradient, or vignette baked into the image; drop shadow, ground shadow, or white keyline; yellow-green / neon / bright graphic rim halo or continuous outline glow; clean thin uniform black anime outline; hard theatrical cel steps or harsh shadow halos; pure black shadows or pure white highlights; cold gray or purple skin shadows; saturated cobalt, lime, neon, or pure-red accents; crisp graphic cloth patterns; photoreal skin; rounded childlike/chibi proportions or oversized head; full-body or bust-only crop; any text, logo, watermark, UI, or readable micro-type; busy background or environment props.
```

**Invocation shape (which anchor as final `-i`):**

- Restyling **Rie** → `… -i <rie current best sprite> -i public/academy/art/characters/rie/rie__neutral-glasses__front-near-front__halfbody__v001.png`
- Restyling **Sophie** → `… -i <sophie current best sprite> -i public/academy/art/characters/sophie/sophie__encouraging-listening__front-near-front__halfbody__v003.png`
- Restyling **Steve** → `… -i <steve current best sprite> -i public/academy/art/characters/steve/steve__neutral-silver-hair-glasses-family-message__front-near-front__halfbody__v002.png`
- Restyling **any other cast member** → their own likeness sprite as identity `-i`, then the
  nearest approved master above as the **final** `-i` style lock.

---

## 9. Quick QA checklist (per generated sprite)

1. Transparent background — nothing baked behind the figure? (Composite over `#f1ead9` to
   check; **QA against cream, never black.**)
2. All darks warm charcoal, no `#000`; no cold-white highlights?
3. Rim light amber, broken, subtle — **no continuous / neon / hard-outline halo**?
4. Shadow edges feathered, not hard cel steps; paper texture present across skin *and* cloth?
5. Lineart warm, variable-weight, colour-held — not thin uniform black?
6. Crop = half-body-to-thigh, figure bleeds off the bottom, ~4 % top headroom, eyes in the
   upper quarter?
7. Adult semi-real face — not chibi, not photoreal, not clean generic-anime?
8. Canvas `1536 × 2048` (or a deliberate trimmed variant); figure ~65–76 % of width?
9. No text / logo / UI / busy background anywhere?
10. Identity unchanged from the `-i` anchor (same face, hair, glasses, wardrobe)?
