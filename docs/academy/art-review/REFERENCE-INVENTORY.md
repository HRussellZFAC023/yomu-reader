# Yomu Academy — Cast Reference Inventory

Reference-mining pass for the cast art-standardization (house-style restyle) work.
Produced by the reference miner. Purpose: give the owner one place to see, per
character, (a) the current main sprites, (b) the good legacy candidate art staged
for side-by-side review, (c) the approved original design references and where they
live, and (d) a count of the real photographs that must never touch generation.

- Repo root: this repository checkout
- Main sprites: `public/academy/art/characters/<id>/`
- Recovered approved source: archived Academy rebuild, `public/academy/art/characters/`
- Legacy staged into: `public/academy/art/_incoming/characters/_legacy/<id>/` (additive copy, originals untouched)
- Consent source of truth: `src/academy/domain/cast-registry.ts` + `docs/academy/story/CAST-AND-CONSENT.md`
- Provenance/keeper rules: `docs/academy/discovery/ART-AND-AUDIO-LEDGER.md`

---

## Consent guardrails (read before generating anything)

These are the non-negotiable rules from `CAST-AND-CONSENT.md` rule 4 and `cast-registry.ts`,
mapped to the current 8 main-cast ids. The registry-derived generation bucket for each id:

| id | firstName | visualEvidence | likenessRuntime | visualBrief | Generation bucket |
| --- | --- | --- | --- | --- | --- |
| rie | Rie (teacher) | approved | **true** | — | Harmonize existing **approved** design into house style |
| sophie | Sophie | approved | **true** | — | Harmonize existing **approved** design into house style |
| steve | Steve | approved | **true** | yes (older man; married to a Japanese wife; family group-chat writing) | Harmonize approved design + text brief |
| felix | Felix | candidate-needs-owner | false | yes ("White; glasses; longer curly dark-blond to light-brown hair; likes cats.") | **Original** fictional design from the TEXT brief; do NOT sharpen toward any real person |
| tom2 | Tom | reference-confirmed-neutral-pending | false | yes ("Tall; average build; dark-brown hair; reserved and a little mysterious.") | **Original** fictional design from the TEXT brief; do NOT sharpen toward any real person |
| aakash | Aakash | candidate-needs-owner | false | — | **Restyle the character's OWN current main sprite** (preserve fictional identity/face/pose); change only rendering toward house style |
| peter | Peter | candidate-needs-owner | false | — | **Restyle own current main sprite** |
| shaun | Shaun | reference-confirmed-neutral-pending | false | — | **Restyle own current main sprite**. NOTE: `eligibility.lessons: false` — story-only |

**How to use the staged legacy art safely.** The staged `_legacy/**` files are
**owner-review material only** — a human comparing previously-approved fictional art
against new gens. They are NOT automatic prompt inputs. Per the guardrail, the only
sanctioned style/content anchors for generation are the **current main repo sprites**
(`public/academy/art/characters/<id>/*.png`, which are fictional art). This matters most
for `felix`/`tom2` (generate from the text brief, not from a look-alike) and for the
photo-derived legacy renders (see note below): do not feed them into a prompt in a way
that would re-sharpen a real person's likeness.

**Legacy renders are photo-derived.** `portraits/manifest.json` records the legacy
portraits were generated "from references/class-photos". The legacy `sprites/` and
`portraits/` renders are therefore fictional AI output *traceable to* real class photos.
Safe for a human to look at; do NOT reintroduce them as generation references for the
non-likeness-cleared members.

---

## DO-NOT-USE-IN-GENERATION (real photographs — counts only)

None of the following were opened, described, copied, or staged. They must never be a
codex `-i` input, and no prompt description may be derived from them.

Primary evidence photo cache — `artifacts/yomu-academy/cast-evidence-20260712/`:

- `likeness-references/` — **211** real photos (188 `majime-*`, 23 `himitsu-*`; `.jpg`/`.webp`)
- `contact-sheets/` — **9** photo contact sheets (8 `majime-*.jpg`, 1 `himitsu-*.jpg`)
- `LIKENESS-REFERENCE-LEDGER.private.json` — private ledger (not surfaced)
- `IMAGEGEN-BRIEF.private.md` — private brief (not surfaced)

Legacy worktree `.../rebuild-20260711/.../characters/claude-production/refs/`:

- `konbini-aakash-tom.png` — **1** (4032×3024, phone photo)
- `class-group-01.webp` … `class-group-06.webp` — **6** (1500×2000 / 2000×1500 class photos)
- `quality-1.jpg`, `quality-6.jpg` — **2** SUSPECTED real photos (dossier: `quality-1` excluded, `quality-6` "rendering reference only"; the approved protagonist choices are `quality-2..5.webp`, which are anime art). Treated as do-not-use pending owner confirmation.

**Real-photo total flagged: 229 image files** (+2 private text files). All left in place, untouched.

---

## Current main sprites (the authoritative fictional identity + generation anchor)

`public/academy/art/characters/<id>/` — all PNG, half-body, chroma-clean.

| id | count | version | expressions / poses |
| --- | --- | --- | --- |
| aakash | 9 | v005 | neutral, happy, laughing, listening, thoughtful, concerned, determined, embarrassed, surprised (mix of front / left- & right-three-quarter; some full, some `halfbody`) |
| felix | 3 | v001 | neutral, happy (left-3q), surprised (right-3q) |
| peter | 3 | v001/v002 | neutral (v002), encouraging (right-3q), thoughtful (left-3q) |
| rie | 7 | v001 | neutral-glasses, happy-glasses, encouraging-glasses, determined-glasses, comedic-glasses, sad-vulnerable-glasses, thinking |
| shaun | 1 | v001 | neutral only |
| sophie | 3 | v003 | bookshop-neutral, determined, encouraging-listening |
| steve | 3 | v001 | neutral, happy, determined |
| tom2 | 3 | v001 | neutral, encouraging-listening, surprised-shocked |

Full filenames are in `public/academy/art/characters/<id>/`. `aakash` (v005) and `rie`
(7 expressions) are the most fully-realized; `shaun` has only a neutral.

---

## Approved ORIGINAL design references (source 3/4 — do NOT stage; pull directly)

These are OpenAI/codex-generated fictional design anchors, recorded as approved in
`ART-AND-AUDIO-LEDGER.md`. They are the house-style calibration set. They live outside
source 2 (mostly in the `yomu-academy-initial-20260711` worktree and the codex image
cache), so they are documented here rather than copied.

World / style calibration (private generated-image archive for task `019f3220-a107-7262-95f1-b8f7573a667f`):

- `exec-c8b9e0f2-...png` — campus ensemble / desired world style (1672×941)
- `exec-ecc50561-...png` — rainy directions scene, Rie + Aakash (1536×1024)
- `exec-47673506-...png` — classroom tutoring scene (1672×941)
- `exec-76d267a1-...png` — Rie classroom portrait scene (1122×1402)

Rie sprite anchor (the single approved OpenAI-gen sprite; best Rie identity/lighting/proportion anchor):

- `.../yomu-academy-initial-20260711/public/academy/art/codex-production-v1/sprites/people/rie/rie__neutral__halfbody__v001.png`
  (only `rie` exists under `codex-production-v1/sprites/people/`; other cast were never approved there)

Locked visual language (from the ledger): "warm pixel-painted anime realism — expressive
adult faces, believable anatomy and fabric, confident drawn edges, restrained cel shading,
small hand-placed pixel texture, deep blue evening light, warm practical lamps." Textural
pixel grain, not blocky. Must read on a phone and stay rich on a wide display.

Additional adjacent OpenAI-gen collections in the same `codex-production-v1/` tree (design
context, not per-character sprites): `backgrounds/` (26 location plates), `cinematic-events/`
(8 CGs), `lesson-assets/` (26). Provenance manifests sit beside each.

Related design notes reviewed: `docs/academy/discovery/CHARACTER-ASSET-DOSSIER.md` (visual
locks per character), `docs/academy/art-review/*.json` (per-character review candidates:
`aakash`, `shaun`, `xingyu`, `rie-expression-review-candidates`, plus `mika`/`mira` gates).

---

## Per-character legacy candidates (staged for review)

Staged root: `public/academy/art/_incoming/characters/_legacy/<id>/`.
Every entry below is fictional AI art. `chroma-sprite__*` = top-level chroma-keyed sprite;
`portrait__*` = antigravity portrait (photo-derived — review-only); `*__sprite__neutral-*` =
review-ready "neutral master" from the rebuild `production/` set. **42 files, ~45 MB.**

### Current 8 main cast

- **aakash** — staged: `chroma-sprite__aakash.png`, `portrait__aakash.png`.
  Note: the portrait is flagged in the ledger as "polished but hat/beard-heavy, not a
  default Aakash likeness — historical reference only." Bucket: restyle own current sprite.
- **felix** — **no legacy art** (owner-named newer character). Generate from text brief.
- **peter** — **no good legacy staged.** Only legacy is `claude-production/sprites/peter*`
  (ledger-EXCLUDED as generic/duplicate) and it was an *invented-name placeholder*, not the
  current real Peter — identity mismatch. Use the current main sprite. Bucket: restyle own.
- **rie** — staged: `chroma-sprite__rie.png`, `rie-sensei.webp` (approved Rie anchor),
  `rie__sprite__neutral-welcome__halfbody__v001.png` (production review-ready master).
  Best single anchor is the codex-production-v1 sprite listed above. Bucket: harmonize approved.
- **shaun** — **no legacy art** (owner-named, `lessons:false`, story-only). Restyle own neutral.
- **sophie** — staged: `chroma-sprite__sophie.png`, `portrait__sophie.png`. Likeness-approved;
  harmonize approved design. (Watch "earlier face drift" per dossier.)
- **steve** — **no legacy art** (owner-named older man). Harmonize approved + brief.
- **tom2** — staged (from legacy `tom`): `chroma-sprite__tom2.png`, `portrait__tom2.png`.
  Bucket is generate-from-brief; these are **review-only** and trace to `konbini-aakash-tom`
  (real photo) — do not use as a prompt input. Dossier lock: Tom is blond, clean-shaven.

### Other legacy cast staged (not in current 8; available for a future "whole class" pass)

Registry classmates with staged `chroma-sprite__` + `portrait__`: `alex`, `angel`
(registry preferredName "Onke"), `christian`, `francis`, `henry`, `jenny`, `jodi`, `mika`,
`robert`, `ruparna`, `sam`, `shin`, `stasi`, `xingyu`.

Rebuild `production/` review-ready neutral masters (original fictional designs, not yet in
current cast): `leo/` (Leo Ward), `nori/` (Nori Vale), `suzu/` (Suzu Arai), plus `mika/`
(also has the neutral-plan master).

`_shared/cast-silhouette-wardrobe-v0.png` — whole-cast silhouette / wardrobe / palette sheet
(design reference).

---

## Legacy files inventoried but deliberately NOT staged

From `.../rebuild-20260711/.../characters/`:

- `claude-production/sprites/**` — **~66 PNGs**, 26 ids × {neutral,happy,thinking,+surprised}.
  Ledger verdict: EXCLUDED ("generic, inconsistent, and duplicate expressions"). Not staged to
  avoid burying the good candidates; ids covered: aakash, alex, angel, christian, francis,
  henry, jenny, jodi, mika, miller, noa, peter, remi, rie, robert, ruparna, sam, sato, shin,
  sophie, stasi, tawapon, tom, xingyu, yamada.
- `claude-production/refs/**` — style refs (`anime-ref-*`, `style-aakash/alex/rie/campus`,
  `quality-2..5.webp` = approved protagonist anime art) AND real photos (see DO-NOT-USE).
  Style refs are generation-calibration inputs, not per-character identity art.
- `production/*/source/*-chroma.png` — **5** pre-key chroma masters (superseded by the staged
  finished versions).
- `sprites/temp/{sam_temp,sophie_temp}.png` — working temp files.
- Manifests / non-art: `cast/asset-manifest.json`, `cast/prompts/*`, `claude-production/manifest.json`,
  `claude-production/{BRIEF.txt,INVENTORY.md,build-manifest.mjs,keying.py}`, `portraits/{manifest.json,gallery.html}`,
  `production-manifest.json`.

Note on the `production/` masters: `production-manifest.json` status is
`review-ready-neutral-masters`, `releaseGate.shipped: false` — human art-direction approval
still required before any of these ship.
