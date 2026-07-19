# Recovered Academy Character Art — Inventory

Recovery sweep run **2026-07-18** to gather every Academy character-art asset codex had already
produced that is **not on `main`**, so nothing is regenerated needlessly. All files are staged
**additively** (nothing moved or deleted) for manual review/pick.

- **Staging root:** `public/academy/art/_incoming/characters/_recovered/<id>/`
- **Sources:** (1) git history incl. reverted commits & stashes; (2) codex `~/.codex/generated_images/` thread dirs, attributed via each image's `image_generation_end` `revised_prompt`.
- **Dedup:** every file deduped by content md5. Anything byte-identical to a current `main` sprite was skipped; identical bytes are never staged twice.

## Totals

- **Total recovered & staged:** 752 files
  - from git history: **207**
  - from codex generated_images: **545**
- **Distinct characters/buckets:** 31
- **Skipped (identical to `main`):** 0 &nbsp;·&nbsp; **Skipped (dup content within staging):** 0
- **md5-verified on write:** 752/752

### Per-character summary

| Character / bucket | Total | From git | From codex |
|---|--:|--:|--:|
| `aakash` | 69 | 22 | 47 |
| `alex` | 44 | 13 | 31 |
| `angel` | 3 | 0 | 3 |
| `christian` | 15 | 9 | 6 |
| `felix` | 9 | 0 | 9 |
| `francis` | 53 | 14 | 39 |
| `henry` | 31 | 17 | 14 |
| `jenny` | 10 | 10 | 0 |
| `jodi` | 10 | 10 | 0 |
| `mika` | 10 | 10 | 0 |
| `miller` | 7 | 0 | 7 |
| `nanako` | 4 | 0 | 4 |
| `onke` | 11 | 10 | 1 |
| `peter` | 4 | 1 | 3 |
| `portraits` | 1 | 1 | 0 |
| `rie` | 54 | 8 | 46 |
| `robert` | 13 | 10 | 3 |
| `rose` | 39 | 10 | 29 |
| `ruparna` | 10 | 10 | 0 |
| `sam` | 34 | 11 | 23 |
| `shaun` | 5 | 3 | 2 |
| `shin` | 19 | 13 | 6 |
| `sophie` | 24 | 0 | 24 |
| `stasi` | 21 | 10 | 11 |
| `steve` | 16 | 4 | 12 |
| `tawapon` | 4 | 0 | 4 |
| `tom` | 19 | 9 | 10 |
| `tom2` | 6 | 0 | 6 |
| `xingyu` | 1 | 1 | 0 |
| `_misc` | 1 | 1 | 0 |
| `_unattributed` | 205 | 0 | 205 |
| **TOTAL** | **752** | **207** | **545** |

### Git provenance (commits/refs the blobs came from)

| Provenance | Files | Note |
|---|--:|---|
| `c1d61c993` | 103 | chore(academy): recover extended v2 expression arc |
| `ce23e6bc8` | 36 | chore(academy): recover v2 character review families |
| `git-stash` | 29 | recovered from git stash trees (refs/stash) — off-branch work |
| `34ae1d0c2` | 10 | chore(academy): recover full v2 Aakash expression set |
| `b5f3e6798` | 6 | feat(academy): add Aakash no-hat sprite trio |
| `56cb7fef3` | 5 | academy: rebuild the learning world foundation |
| `929724fa1` | 3 | feat(academy): class-ready playable experience (REVERTED by e9ce552d1) |
| `5ccaf54e2` | 3 | feat(academy-art): add Sam v3 VN sprites |
| `fb28e2714` | 3 | feat(academy): regenerate Shin sprite v3 set |
| `86ad60ab2` | 3 | feat(academy-art): refine Henry likeness sprites |
| `d87d57a08` | 3 | chore(academy): recover v1-v2 art for review |
| `da563e8a4` | 1 | academy: deliver enrollment vertical slice |
| `5c493bc45` | 1 | academy: fresh rebuild — VN engine |
| `220e5e4f1` | 1 | feat(academy): generate and add new cast portraits |

### Codex provenance

- 545 raw generations pulled from **281** distinct codex threads under `~/.codex/generated_images/`.
- Each was matched to its generating prompt via the `image_generation_end` event `call_id` (= filename) → `revised_prompt`, giving character + expression/pose.
- Non-character generations (environment plates, story CG, lesson thumbnails, UI screens) were **excluded** from this character-art recovery.
- Sprites whose prompt described appearance but named no cast member are bucketed under **`_unattributed/`** (205 files); the physical description is encoded in each filename and listed below.

### Filename convention

- git: `<id>__<desc>__from-<commit-or-ref>.png` (`REJECTED-` prefix on desc = came from a `review-recovered/rejected/` set)
- codex: `<id>__<expr-pose>__from-codex-<thread8>-<call8>.png`

---

## Per-character detail

### `aakash` — 69 file(s)  (22 git · 47 codex)

**From git history:**

| File | Provenance | Original path | Rejected? |
|---|---|---|:--:|
| `aakash__bust-happy-v3-review__from-d87d57a08.webp` | `d87d57a08` | `public/academy/art/review-recovered/characters/aakash/aakash__bust__happy__v3-review.webp` |  |
| `aakash__bust-thinking-v3-review__from-d87d57a08.webp` | `d87d57a08` | `public/academy/art/review-recovered/characters/aakash/aakash__bust__thinking__v3-review.webp` |  |
| `aakash__determined-left-three-quarter-halfbody-v__from-git-stash.png` | `git-stash` | `docs/public/academy/art/characters/aakash/aakash__determined__left-three-quarter__halfbody__v001.png` |  |
| `aakash__happy-right-three-quarter-halfbody-v001__from-git-stash.png` | `git-stash` | `docs/public/academy/art/characters/aakash/aakash__happy__right-three-quarter__halfbody__v001.png` |  |
| `aakash__neutral-halfbody-v001__from-56cb7fef3.png` | `56cb7fef3` | `docs/public/academy/art/characters/aakash/aakash__neutral__halfbody__v001.png` |  |
| `aakash__neutral-left-three-quarter-halfbody-v3-r__from-d87d57a08.png` | `d87d57a08` | `public/academy/art/review-recovered/characters/aakash/aakash__neutral__left-three-quarter__halfbody__v3-review.png` |  |
| `aakash__rejected-sprite-happy-left-three-quarter__from-git-stash.png` | `git-stash` | `docs/public/academy/art/review-recovered/rejected/aakash-v3-style-mismatch-20260717/aakash__sprite__happy__left-three-quarter__v003.png` | yes |
| `aakash__rejected-sprite-listening-right-three-qu__from-git-stash.png` | `git-stash` | `docs/public/academy/art/review-recovered/rejected/aakash-v3-style-mismatch-20260717/aakash__sprite__listening__right-three-quarter__v003.png` | yes |
| `aakash__rejected-sprite-neutral-front-near-front__from-git-stash.png` | `git-stash` | `docs/public/academy/art/review-recovered/rejected/aakash-v3-style-mismatch-20260717/aakash__sprite__neutral__front-near-front__v003.png` | yes |
| `aakash__sprite-concerned-halfbody-v2__from-34ae1d0c2.png` | `34ae1d0c2` | `docs/public/academy/art/characters/aakash/aakash__sprite__concerned__halfbody__v2.png` |  |
| `aakash__sprite-determined-halfbody-v2__from-34ae1d0c2.png` | `34ae1d0c2` | `docs/public/academy/art/characters/aakash/aakash__sprite__determined__halfbody__v2.png` |  |
| `aakash__sprite-determined-left-three-quarter-v00__from-b5f3e6798.png` | `b5f3e6798` | `docs/public/academy/art/characters/aakash/aakash__sprite__determined__left-three-quarter__v004.png` |  |
| `aakash__sprite-embarrassed-halfbody-v2__from-34ae1d0c2.png` | `34ae1d0c2` | `docs/public/academy/art/characters/aakash/aakash__sprite__embarrassed__halfbody__v2.png` |  |
| `aakash__sprite-happy-halfbody-v2__from-34ae1d0c2.png` | `34ae1d0c2` | `docs/public/academy/art/characters/aakash/aakash__sprite__happy__halfbody__v2.png` |  |
| `aakash__sprite-laughing-halfbody-v2__from-34ae1d0c2.png` | `34ae1d0c2` | `docs/public/academy/art/characters/aakash/aakash__sprite__laughing__halfbody__v2.png` |  |
| `aakash__sprite-listening-halfbody-v2__from-34ae1d0c2.png` | `34ae1d0c2` | `docs/public/academy/art/characters/aakash/aakash__sprite__listening__halfbody__v2.png` |  |
| `aakash__sprite-listening-right-three-quarter-v00__from-b5f3e6798.png` | `b5f3e6798` | `docs/public/academy/art/characters/aakash/aakash__sprite__listening__right-three-quarter__v004.png` |  |
| `aakash__sprite-neutral-front-near-front-v004__from-b5f3e6798.png` | `b5f3e6798` | `docs/public/academy/art/characters/aakash/aakash__sprite__neutral__front-near-front__v004.png` |  |
| `aakash__sprite-neutral-halfbody-v2__from-34ae1d0c2.png` | `34ae1d0c2` | `docs/public/academy/art/characters/aakash/aakash__sprite__neutral__halfbody__v2.png` |  |
| `aakash__sprite-speaking-halfbody-v2__from-34ae1d0c2.png` | `34ae1d0c2` | `docs/public/academy/art/characters/aakash/aakash__sprite__speaking__halfbody__v2.png` |  |
| `aakash__sprite-surprised-halfbody-v2__from-34ae1d0c2.png` | `34ae1d0c2` | `docs/public/academy/art/characters/aakash/aakash__sprite__surprised__halfbody__v2.png` |  |
| `aakash__sprite-thinking-halfbody-v2__from-34ae1d0c2.png` | `34ae1d0c2` | `docs/public/academy/art/characters/aakash/aakash__sprite__thinking__halfbody__v2.png` |  |

**From codex generated_images:**

| File | Thread | Prompt (head) |
|---|---|---|
| `aakash__comedic-right-three-quarter-no-hat__from-codex-019f725c-b8eaadf2.png` | `019f725c-0566` | Aakash comedic expression, right three-quarter angle, bright playful grin and raised eyebrow, holding a tiny a |
| `aakash__concerned-left-three-quarter__from-codex-019f725d-686a8371.png` | `019f725d-e71e` | Create one high-resolution VN sprite candidate based on the attached Aakash anch |
| `aakash__concerned-no-hat__from-codex-019f718c-57b091f9.png` | `019f718c-c8af` | isolated half-body dialogue sprite for Yomu Academy. Generate one original adult male Aakash, reimagined liken |
| `aakash__concerned__from-codex-019f718c-cac1f193.png` | `019f718c-c8af` | isolated half-body dialogue sprite for Yomu Academy. Generate an original adult/student male character named A |
| `aakash__determined-left-three-quarter-glasses-no-hat__from-codex-019f738f-510e475a.png` | `019f738f-3131` | Aakash determined, left three-quarter, kind focused expression, shoulders squared, one hand holding a closed b |
| `aakash__determined-left-three-quarter-no-hat__from-codex-019f725a-8292e18d.png` | `019f725a-ef0f` | transparent half-body visual-novel character sprite for Yomu Academy. Input images: private class photo is lik |
| `aakash__determined-no-hat__from-codex-019f718c-5406ad57.png` | `019f718c-c8af` | isolated half-body dialogue sprite for Yomu Academy. Generate one original adult male Aakash, reimagined liken |
| `aakash__determined__from-codex-019f718c-f55870c1.png` | `019f718c-c8af` | isolated half-body dialogue sprite for Yomu Academy. Generate an original adult/student male character named A |
| `aakash__embarrassed-no-hat__from-codex-019f718c-8c572a20.png` | `019f718c-c8af` | isolated half-body dialogue sprite for Yomu Academy. Generate one original adult male Aakash, reimagined liken |
| `aakash__embarrassed__from-codex-019f718c-2f14976f.png` | `019f718c-c8af` | isolated half-body dialogue sprite for Yomu Academy. Generate an original adult/student male character named A |
| `aakash__happy-left-three-quarter__from-codex-019f7034-4a7201eb.png` | `019f7034-38d3` | Aakash happy left-three-quarter half-body sprite, head to mid-thigh. Same locked character design: olive ribbe |
| `aakash__happy-no-hat__from-codex-019f718c-100e1697.png` | `019f718c-c8af` | isolated half-body dialogue sprite for Yomu Academy. Generate one original adult male Aakash, reimagined liken |
| `aakash__happy-right-three-quarter-glasses-no-hat__from-codex-019f738f-24bd7417.png` | `019f738f-3131` | Aakash happy, right three-quarter, bright genuine smile with one hand making a small welcoming gesture. Wardro |
| `aakash__happy-right-three-quarter-no-hat__from-codex-019f725a-7c89f03a.png` | `019f725a-ef0f` | transparent half-body visual-novel character sprite for Yomu Academy. Input images: private class photo is lik |
| `aakash__laughing-no-hat__from-codex-019f718c-7675e023.png` | `019f718c-c8af` | isolated half-body dialogue sprite for Yomu Academy. Generate one original adult male Aakash, reimagined liken |
| `aakash__laughing__from-codex-019f718c-ed10c15f.png` | `019f718c-c8af` | isolated half-body dialogue sprite for Yomu Academy. Generate an original adult/student male character named A |
| `aakash__listening-left-three-quarter-glasses-no-hat__from-codex-019f738f-622d01d4.png` | `019f738f-3131` | Aakash listening, left three-quarter, slight nod and attentive eyes, hands loosely clasped near the torso. War |
| `aakash__listening-left-three-quarter-no-hat__from-codex-019f725c-8859cb27.png` | `019f725c-0566` | Aakash encouraging-listening expression, left three-quarter angle, attentive eyes and a small supportive smile |
| `aakash__listening-right-three-quarter-no-hat__from-codex-019f725a-5b27c0e3.png` | `019f725a-ef0f` | transparent half-body visual-novel character sprite for Yomu Academy. Input images: private class photo is lik |
| `aakash__listening-right-three-quarter__from-codex-019f7034-fa060233.png` | `019f7034-38d3` | Aakash listening right-three-quarter half-body sprite, head to mid-thigh. Same locked character design: olive  |
| `aakash__listening__from-codex-019f718c-94315a84.png` | `019f718c-c8af` | isolated half-body dialogue sprite for Yomu Academy. Generate an original adult/student male character named A |
| `aakash__neutral-front-glasses-no-hat__from-codex-019f738f-bf3f88f5.png` | `019f738f-3131` | Aakash neutral, front-near-front, calm attentive expression and open relaxed hands. Wardrobe: deep teal oversh |
| `aakash__neutral-front-no-hat__from-codex-019f725a-c0b5ff78.png` | `019f725a-ef0f` | transparent half-body visual-novel character sprite for Yomu Academy. Input images: private class photo is lik |
| `aakash__neutral-front__from-codex-019f7034-6df84718.png` | `019f7034-38d3` | Aakash neutral front-near-front half-body sprite, head to mid-thigh. Reimagined likeness of a stylish South As |
| `aakash__neutral-glasses-no-hat__from-codex-019f588c-74fe9f7e.png` | `019f588c-1181` | Create a single neutral half-body sprite of Aakash using the repeated South Asian adult man in the supplied re |
| `aakash__neutral-left-three-quarter-no-hat__from-codex-019f725a-b9517b6d.png` | `019f725a-ef0f` | transparent half-body VN sprite. Private class photo is likeness reference only and must never ship. Identity: |
| `aakash__neutral-left-three-quarter__from-codex-019f7034-f3c2d242.png` | `019f7034-38d3` | Create Aakash in a determined expression and left-three-quarter pose for the Yomu Academy living-paper VN set. |
| `aakash__neutral-left-three-quarter__from-codex-019f719b-b05cea7e.png` | `019f719b-4ae1` | Create the third sprite in a cohesive three-image character family. Use the prev |
| `aakash__neutral-right-three-quarter-no-hat__from-codex-019f725a-c70810fa.png` | `019f725a-ef0f` | transparent half-body VN sprite. Private class photo is likeness reference only and must never ship. Identity: |
| `aakash__neutral-right-three-quarter__from-codex-019f7034-6f997dbd.png` | `019f7034-38d3` | Create Aakash with a genuinely happy expression in a right-three-quarter pose for the same Yomu Academy living |
| `aakash__neutral-right-three-quarter__from-codex-019f719b-f605528c.png` | `019f719b-4ae1` | Create the second sprite in a cohesive three-image character family. Use the pre |
| `aakash__neutral__from-codex-019f586b-e22e1345.png` | `019f586b-935f` | Create THREE CONNECTED FULL-BLEED FRAMES that read left-to-right as one learner journey: encounter -> practice |
| `aakash__neutral__from-codex-019f718c-0402fd77.png` | `019f718c-c8af` | isolated half-body dialogue sprite for Yomu Academy. Generate one original adult male character, Aakash, in a  |
| `aakash__neutral__from-codex-019f718c-ebff6997.png` | `019f718c-c8af` | isolated half-body dialogue sprite for Yomu Academy. Generate an original adult/student male character named A |
| `aakash__neutral__from-codex-019f719b-eee8340a.png` | `019f719b-4ae1` | Create one cohesive high-quality fictionalized adult male character sprite, Aakash, neutral front pose. Reimag |
| `aakash__sad-vulnerable-front-no-hat__from-codex-019f725c-02e1b247.png` | `019f725c-0566` | Aakash sad-vulnerable but quietly hopeful expression, front-near-front angle, softened brows and downcast eyes |
| `aakash__speaking-no-hat__from-codex-019f718c-814beefc.png` | `019f718c-c8af` | isolated half-body dialogue sprite for Yomu Academy. Generate one original adult male Aakash, reimagined liken |
| `aakash__speaking__from-codex-019f718c-48e4dee7.png` | `019f718c-c8af` | isolated half-body dialogue sprite for Yomu Academy. Generate an original adult/student male character named A |
| `aakash__surprised-no-hat__from-codex-019f718c-e3024bc2.png` | `019f718c-c8af` | isolated half-body dialogue sprite for Yomu Academy. Generate one original adult male Aakash, reimagined liken |
| `aakash__surprised-right-three-quarter__from-codex-019f725d-a7289778.png` | `019f725d-e71e` | Create one high-resolution VN sprite candidate based on the attached Aakash anch |
| `aakash__surprised__from-codex-019f718c-11c4a3f1.png` | `019f718c-c8af` | isolated half-body dialogue sprite for Yomu Academy. Generate an original adult/student male character named A |
| `aakash__thoughtful-front-glasses-no-hat__from-codex-019f738f-91055e48.png` | `019f738f-3131` | Aakash thoughtful, front-near-front with gaze lowered slightly and one hand resting at his chin, reflective bu |
| `aakash__thoughtful-front-no-hat__from-codex-019f725a-acc809d8.png` | `019f725a-ef0f` | transparent half-body visual-novel character sprite for Yomu Academy. Input images: private class photo is lik |
| `aakash__thoughtful-no-hat__from-codex-019f718c-e984cdd3.png` | `019f718c-c8af` | isolated half-body dialogue sprite for Yomu Academy. Generate one original adult male Aakash, reimagined liken |
| `aakash__thoughtful__from-codex-019f718c-99b25c08.png` | `019f718c-c8af` | isolated half-body dialogue sprite for Yomu Academy. Generate an original adult/student male character named A |
| `aakash__warm-front__from-codex-019f725d-d1416539.png` | `019f725d-e71e` | Create one high-resolution VN sprite candidate based on the attached Aakash anch |
| `aakash__warm-left-three-quarter__from-codex-019f725d-2f6cecb4.png` | `019f725d-e71e` | Create one high-resolution VN sprite candidate based on the attached Aakash anch |

### `alex` — 44 file(s)  (13 git · 31 codex)

**From git history:**

| File | Provenance | Original path | Rejected? |
|---|---|---|:--:|
| `alex__rejected-sprite-determined-left-three-qu__from-git-stash.png` | `git-stash` | `docs/public/academy/art/review-recovered/rejected/alex-v3-style-mismatch-20260717/alex__sprite__determined__left-three-quarter__v003.png` | yes |
| `alex__rejected-sprite-happy-front-near-front-v__from-git-stash.png` | `git-stash` | `docs/public/academy/art/review-recovered/rejected/alex-v3-style-mismatch-20260717/alex__sprite__happy__front-near-front__v003.png` | yes |
| `alex__rejected-sprite-listening-right-three-qu__from-git-stash.png` | `git-stash` | `docs/public/academy/art/review-recovered/rejected/alex-v3-style-mismatch-20260717/alex__sprite__listening__right-three-quarter__v003.png` | yes |
| `alex__rejected-sprite-neutral-front-near-front__from-git-stash.png` | `git-stash` | `docs/public/academy/art/review-recovered/rejected/alex-v3-style-mismatch-20260717/alex__sprite__neutral__front-near-front__v003.png` | yes |
| `alex__sprite-concerned-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/alex/alex__sprite__concerned__halfbody__v2.png` |  |
| `alex__sprite-determined-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/alex/alex__sprite__determined__halfbody__v2.png` |  |
| `alex__sprite-happy-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/alex/alex__sprite__happy__halfbody__v2.png` |  |
| `alex__sprite-laughing-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `public/academy/art/review-recovered/characters/alex/alex__sprite__laughing__halfbody__v2.png` |  |
| `alex__sprite-laughing-halfbody-v2__from-git-stash.png` | `git-stash` | `docs/public/academy/art/characters/alex/alex__sprite__laughing__halfbody__v2.png` |  |
| `alex__sprite-listening-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/alex/alex__sprite__listening__halfbody__v2.png` |  |
| `alex__sprite-speaking-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/alex/alex__sprite__speaking__halfbody__v2.png` |  |
| `alex__sprite-surprised-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/alex/alex__sprite__surprised__halfbody__v2.png` |  |
| `alex__sprite-thinking-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/alex/alex__sprite__thinking__halfbody__v2.png` |  |

**From codex generated_images:**

| File | Thread | Prompt (head) |
|---|---|---|
| `alex__comedic-right-three-quarter__from-codex-019f73b6-0cf5d7c3.png` | `019f73b6-19a0` | Alex relaxed/comedic expression, easy sideways grin and playful slouch, right three-quarter angle, one hand in |
| `alex__concerned-right-three-quarter__from-codex-019f73b6-9853854e.png` | `019f73b6-19a0` | Alex concerned expression, right three-quarter turn, softened brows and careful half-smile, hands loosely clas |
| `alex__determined-left-three-quarter-glasses__from-codex-019f725d-46119e50.png` | `019f725d-28be` | an original reimagined likeness for Alex, a friendly young white British learner in his early twenties with sh |
| `alex__determined-left-three-quarter-glasses__from-codex-019f725d-b30c20a9.png` | `019f725d-8836` | Create one Alex determined VN sprite, preserving the reimagined Alex identity, s |
| `alex__determined-left-three-quarter__from-codex-019f725b-728bf06c.png` | `019f725b-709e` | Create one full-height half-body VN sprite, determined left three-quarter pose f |
| `alex__determined-left-three-quarter__from-codex-019f726c-50e871f7.png` | `019f726c-4cba` | Yomu Academy transparent half-body VN sprite. Same Alex identity/style/palette. Pose: determined left three-qu |
| `alex__determined-left-three-quarter__from-codex-019f73b6-60c62a9c.png` | `019f73b6-19a0` | Alex determined expression, left three-quarter turn, steady focused gaze and lightly clenched fist near chest. |
| `alex__happy-right-three-quarter-glasses__from-codex-019f725d-70797b64.png` | `019f725d-28be` | an original reimagined likeness for Alex, a friendly young white British learner in his early twenties with sh |
| `alex__happy-right-three-quarter__from-codex-019f725b-53d2f68c.png` | `019f725b-709e` | Create one full-height half-body VN sprite, happy right three-quarter pose for A |
| `alex__happy-right-three-quarter__from-codex-019f726c-2e7eaa97.png` | `019f726c-4cba` | Yomu Academy transparent half-body VN sprite. Same Alex identity and exact house style/palette as the referenc |
| `alex__happy-right-three-quarter__from-codex-019f73b6-e585e44f.png` | `019f73b6-19a0` | Alex happy expression with a genuine bright smile, right three-quarter turn, one hand lifted in a small friend |
| `alex__listening-glasses__from-codex-019f725d-efa65cfa.png` | `019f725d-28be` | an original reimagined likeness for Alex, a friendly young white British learner in his early twenties with sh |
| `alex__listening-left-three-quarter__from-codex-019f725b-e4ef07c9.png` | `019f725b-709e` | Create one full-height half-body VN sprite, attentive listening left three-quart |
| `alex__listening-left-three-quarter__from-codex-019f726c-58400664.png` | `019f726c-4cba` | Yomu Academy transparent half-body VN sprite. Same Alex identity/style/palette. Pose: listening left three-qua |
| `alex__listening-left-three-quarter__from-codex-019f73b6-da61f8ae.png` | `019f73b6-19a0` | Alex listening expression, slight left three-quarter turn, thoughtful eyes and one hand lightly touching his o |
| `alex__listening-right-three-quarter-glasses__from-codex-019f725d-4ba2462c.png` | `019f725d-8836` | Create one Alex listening VN sprite, preserving the reimagined Alex identity, sh |
| `alex__listening-right-three-quarter__from-codex-019f719d-88fdcbfe.png` | `019f719d-2ec4` | Create one high-quality Academy VN character sprite of the same adult Alex desig |
| `alex__neutral-front-glasses__from-codex-019f738f-f1d03043.png` | `019f738f-3131` | Create an original Alex character sprite, neutral front-facing expression, relaxed open posture, waist-up/half |
| `alex__neutral-front__from-codex-019f719d-0e88d49e.png` | `019f719d-2ec4` | Create one high-quality Academy VN character sprite of Alex, adult Japanese visu |
| `alex__neutral-front__from-codex-019f725b-3a1ebd91.png` | `019f725b-709e` | Create one full-height half-body VN sprite, neutral front-facing expression for |
| `alex__neutral-front__from-codex-019f73b6-200ab59a.png` | `019f73b6-19a0` | Alex neutral attentive expression, facing front, relaxed symmetrical shoulders and open hands just below frame |
| `alex__neutral-front__from-codex-019f73b6-6499d0c6.png` | `019f73b6-19a0` | Create one polished Alex character sprite, neutral attentive expression, facing front, relaxed symmetrical hal |
| `alex__neutral-glasses__from-codex-019f725d-b758d500.png` | `019f725d-28be` | an original reimagined likeness for Alex, a friendly young white British learner in his early twenties with sh |
| `alex__neutral__from-codex-019f718c-1dabfdf3.png` | `019f718c-d1c7` | Create a production-ready 2x2 sprite sheet of the same reimagined character, a c |
| `alex__neutral__from-codex-019f718c-f3218790.png` | `019f718c-d1c7` | Create a 2x2 sprite sheet of a single consistent reimagined adult White man, Ale |
| `alex__neutral__from-codex-019f726c-3b639402.png` | `019f726c-4cba` | Yomu Academy transparent half-body VN sprite. Input images: Alex existing sprite is likeness/outfit cue; Felix |
| `alex__surprised-front-glasses__from-codex-019f725b-61b511ed.png` | `019f725b-709e` | Create one full-height half-body VN sprite, surprised-thinking front-near-front |
| `alex__surprised-left-three-quarter-glasses__from-codex-019f725d-b0dc30c7.png` | `019f725d-8836` | Create one Alex surprised VN sprite, preserving the reimagined Alex identity, sh |
| `alex__surprised-left-three-quarter__from-codex-019f719d-4c8fb00e.png` | `019f719d-2ec4` | Create one high-quality Academy VN character sprite of the same adult Alex desig |
| `alex__surprised-left-three-quarter__from-codex-019f73b6-e3f1178f.png` | `019f73b6-19a0` | Alex surprised expression, left three-quarter turn, raised brows and slightly parted lips, shoulders subtly li |
| `alex__thinking-front__from-codex-019f73b6-25a01b93.png` | `019f73b6-19a0` | Alex thinking expression, front-near-front angle with gaze up and to the side, one finger near chin. Hold one  |

### `angel` — 3 file(s)  (0 git · 3 codex)

**From codex generated_images:**

| File | Thread | Prompt (head) |
|---|---|---|
| `angel__neutral-front__from-codex-019f719d-16ecf2d9.png` | `019f719d-2ec2` | visual-novel half-body character sprite. Input image: the visible Onke neutral sprite is a style/character ref |
| `angel__neutral-left-three-quarter__from-codex-019f719d-c2a1b13f.png` | `019f719d-2ec2` | visual-novel half-body character sprite. Input image: the visible Onke neutral sprite is a style/character ref |
| `angel__neutral-right-three-quarter__from-codex-019f719d-807e2565.png` | `019f719d-2ec2` | visual-novel half-body character sprite. Input image: the visible Onke neutral sprite is a style/character ref |

### `christian` — 15 file(s)  (9 git · 6 codex)

**From git history:**

| File | Provenance | Original path | Rejected? |
|---|---|---|:--:|
| `christian__sprite-concerned-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/christian/christian__sprite__concerned__halfbody__v2.png` |  |
| `christian__sprite-determined-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/christian/christian__sprite__determined__halfbody__v2.png` |  |
| `christian__sprite-embarrassed-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/christian/christian__sprite__embarrassed__halfbody__v2.png` |  |
| `christian__sprite-happy-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/christian/christian__sprite__happy__halfbody__v2.png` |  |
| `christian__sprite-laughing-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/christian/christian__sprite__laughing__halfbody__v2.png` |  |
| `christian__sprite-listening-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/christian/christian__sprite__listening__halfbody__v2.png` |  |
| `christian__sprite-speaking-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/christian/christian__sprite__speaking__halfbody__v2.png` |  |
| `christian__sprite-surprised-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/christian/christian__sprite__surprised__halfbody__v2.png` |  |
| `christian__sprite-thinking-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/christian/christian__sprite__thinking__halfbody__v2.png` |  |

**From codex generated_images:**

| File | Thread | Prompt (head) |
|---|---|---|
| `christian__encouraging-left-three-quarter__from-codex-019f7034-9431dcf5.png` | `019f7034-38d3` | Create one premium Yomu Academy visual-novel half-body sprite variant of CHRISTI |
| `christian__encouraging__from-codex-019f718d-2dd90571.png` | `019f718d-21ee` | Create a clean isolated character art asset on a perfectly flat solid chroma gre |
| `christian__encouraging__from-codex-019f718d-4782c872.png` | `019f718d-21ee` | Isolated full-body character asset on a perfectly flat solid #00ff00 chroma gree |
| `christian__listening-right-three-quarter__from-codex-019f726c-fdd83704.png` | `019f726c-4cba` | Create one transparent VN character cutout for Christian, matching the same reim |
| `christian__neutral-front-glasses__from-codex-019f7034-1d839d19.png` | `019f7034-38d3` | Create one premium AAA-quality visual-novel half-body sprite of CHRISTIAN from t |
| `christian__neutral-front__from-codex-019f726c-61b51ff3.png` | `019f726c-4cba` | Create one transparent VN character cutout for Christian, a reimagined adult cla |

### `felix` — 9 file(s)  (0 git · 9 codex)

**From codex generated_images:**

| File | Thread | Prompt (head) |
|---|---|---|
| `felix__determined-left-three-quarter-glasses__from-codex-019f738f-a9fad032.png` | `019f738f-3131` | Create an original Alex character sprite, determined but kind expression, left three-quarter turn, shoulders s |
| `felix__happy-left-three-quarter-glasses__from-codex-019f632f-1af208f4.png` | `019f632f-8dc5` | create a left three-quarter half-body sprite of Felix: White, round glasses, longer curly dark-blond to light- |
| `felix__happy-right-three-quarter-glasses__from-codex-019f738f-e71d18a1.png` | `019f738f-3131` | Create an original Alex character sprite, happy expression with a bright natural smile and slight right three- |
| `felix__listening-glasses__from-codex-019f738f-ad1cb410.png` | `019f738f-3131` | Create an original Alex character sprite, attentive listening expression with a soft nod and body angled sligh |
| `felix__neutral-front-glasses-no-hat__from-codex-019f725d-24c98a54.png` | `019f725d-8836` | Use case: style-transfer. Create ONE Yomu Academy visual-novel half-body sprite |
| `felix__surprised-right-three-quarter-glasses__from-codex-019f738f-bfcd85a0.png` | `019f738f-3131` | Create an original Alex character sprite, pleasantly surprised expression with raised brows and small open smi |
| `felix__thoughtful-glasses__from-codex-019f3220-c0e7b1b2.png` | `019f3220-a107` | Create Felix, a fictional adult Japanese-class learner, matching the exact warm hand-painted pixel-illustratio |
| `felix__warm-right-three-quarter-glasses__from-codex-019f632f-3d878cc4.png` | `019f632f-8dc5` | create a distinct right three-quarter half-body sprite of Felix. He is looking over his shoulder toward the ri |
| `felix__warm__from-codex-019f3220-4640771b.png` | `019f3220-a107` | Correct Peter's approved candidate design so he clearly reads as about 26 years old, with a younger face and l |

### `francis` — 53 file(s)  (14 git · 39 codex)

**From git history:**

| File | Provenance | Original path | Rejected? |
|---|---|---|:--:|
| `francis__determined-left-three-quarter-halfbody-v__from-git-stash.png` | `git-stash` | `docs/public/academy/art/characters/francis/francis__determined__left-three-quarter__halfbody__v001.png` |  |
| `francis__happy-right-three-quarter-halfbody-v001__from-git-stash.png` | `git-stash` | `docs/public/academy/art/characters/francis/francis__happy__right-three-quarter__halfbody__v001.png` |  |
| `francis__neutral-front-near-front-halfbody-v001__from-git-stash.png` | `git-stash` | `docs/public/academy/art/characters/francis/francis__neutral__front-near-front__halfbody__v001.png` |  |
| `francis__rejected-sprite-determined-glasses-left-__from-git-stash.png` | `git-stash` | `docs/public/academy/art/review-recovered/rejected/francis-v3-style-mismatch-20260717/francis__sprite__determined-glasses__left-three-quarter__v003.png` | yes |
| `francis__rejected-sprite-happy-front-near-front-v__from-git-stash.png` | `git-stash` | `docs/public/academy/art/review-recovered/rejected/francis-v3-style-mismatch-20260717/francis__sprite__happy__front-near-front__v003.png` | yes |
| `francis__rejected-sprite-listening-glasses-right-__from-git-stash.png` | `git-stash` | `docs/public/academy/art/review-recovered/rejected/francis-v3-style-mismatch-20260717/francis__sprite__listening-glasses__right-three-quarter__v003.png` | yes |
| `francis__rejected-sprite-neutral-glasses-front-ne__from-git-stash.png` | `git-stash` | `docs/public/academy/art/review-recovered/rejected/francis-v3-style-mismatch-20260717/francis__sprite__neutral-glasses__front-near-front__v003.png` | yes |
| `francis__sprite-concerned-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/francis/francis__sprite__concerned__halfbody__v2.png` |  |
| `francis__sprite-determined-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/francis/francis__sprite__determined__halfbody__v2.png` |  |
| `francis__sprite-embarrassed-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/francis/francis__sprite__embarrassed__halfbody__v2.png` |  |
| `francis__sprite-happy-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/francis/francis__sprite__happy__halfbody__v2.png` |  |
| `francis__sprite-laughing-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/francis/francis__sprite__laughing__halfbody__v2.png` |  |
| `francis__sprite-listening-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/francis/francis__sprite__listening__halfbody__v2.png` |  |
| `francis__sprite-speaking-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/francis/francis__sprite__speaking__halfbody__v2.png` |  |

**From codex generated_images:**

| File | Thread | Prompt (head) |
|---|---|---|
| `francis__comedic-front-glasses__from-codex-019f725d-6f8030ca.png` | `019f725d-28be` | Yomu Academy VN sprite, transparent cutout via a perfectly flat #00ff00 chroma b |
| `francis__concerned-front-glasses__from-codex-019f725d-c8f10afc.png` | `019f725d-28be` | Yomu Academy VN sprite, transparent cutout via a perfectly flat #00ff00 chroma b |
| `francis__determined-front-glasses-no-hat__from-codex-019f7034-8c48f5cf.png` | `019f7034-38d3` | Francis determined front-near-front, focused but kind expression, no glasses, one hand resting on a plain note |
| `francis__determined-left-three-quarter-glasses__from-codex-019f7034-e52bd37d.png` | `019f7034-38d3` | Create one transparent-background VN sprite for Francis in the same slightly pix |
| `francis__determined-left-three-quarter-glasses__from-codex-019f725b-2e37bd2b.png` | `019f725b-709e` | Yomu Academy transparent half-body VN sprite. |
| `francis__determined-left-three-quarter-glasses__from-codex-019f725b-5f853ce6.png` | `019f725b-709e` | Yomu Academy transparent half-body visual-novel sprite |
| `francis__determined-left-three-quarter-glasses__from-codex-019f725c-585c79cd.png` | `019f725c-85a1` | transparent Yomu Academy living-paper VN character sprite. |
| `francis__determined-left-three-quarter-glasses__from-codex-019f725c-8994829f.png` | `019f725c-0566` | transparent Yomu Academy VN sprite. Same Francis identity and palette as the existing v2 family: 21, shorter m |
| `francis__determined-left-three-quarter-glasses__from-codex-019f725d-169b9ba7.png` | `019f725d-8836` | Yomu Academy transparent half-body VN character sprite |
| `francis__determined-left-three-quarter-glasses__from-codex-019f725d-b4074abf.png` | `019f725d-28be` | Yomu Academy transparent half-body VN sprite. Generate Francis determined left-three-quarter, age 21, same ide |
| `francis__happy-front-glasses__from-codex-019f7034-c82f9cd4.png` | `019f7034-38d3` | Create one transparent-background VN character sprite for Francis in the same so |
| `francis__happy-right-three-quarter-glasses-no-hat__from-codex-019f7034-c0864d2a.png` | `019f7034-38d3` | Francis happy right-three-quarter, bright genuine laugh with eyes narrowing naturally, thin round glasses, one |
| `francis__happy-right-three-quarter-glasses__from-codex-019f725b-c63bca83.png` | `019f725b-709e` | Yomu Academy transparent half-body visual-novel sprite |
| `francis__happy-right-three-quarter-glasses__from-codex-019f725b-cf16e977.png` | `019f725b-709e` | Yomu Academy transparent half-body VN sprite. |
| `francis__happy-right-three-quarter-glasses__from-codex-019f725c-8a424c2a.png` | `019f725c-85a1` | transparent Yomu Academy living-paper VN character sprite. |
| `francis__happy-right-three-quarter-glasses__from-codex-019f725c-e7fdbea9.png` | `019f725c-0566` | transparent Yomu Academy VN sprite. Match the supplied existing Francis/Felix/Rie family exactly. Create the s |
| `francis__happy-right-three-quarter-glasses__from-codex-019f725d-1633fa9d.png` | `019f725d-8836` | Yomu Academy transparent half-body VN character sprite |
| `francis__happy-right-three-quarter-glasses__from-codex-019f725d-189e9c2d.png` | `019f725d-28be` | Yomu Academy transparent half-body VN sprite. Generate Francis happy right-three-quarter, same 21-year-old ide |
| `francis__listening-front-glasses__from-codex-019f725c-1a85224c.png` | `019f725c-85a1` | transparent Yomu Academy living-paper VN character sprite. |
| `francis__listening-front-glasses__from-codex-019f725d-4ab979dd.png` | `019f725d-28be` | Yomu Academy transparent half-body VN sprite. Generate Francis listening front-near-front, same identity/outfi |
| `francis__listening-glasses__from-codex-019f725b-9726d9d0.png` | `019f725b-709e` | Yomu Academy transparent half-body visual-novel sprite |
| `francis__listening-glasses__from-codex-019f725b-faeb0425.png` | `019f725b-709e` | Yomu Academy transparent half-body VN sprite. |
| `francis__listening-left-three-quarter-glasses-no-hat__from-codex-019f7034-398fe2b7.png` | `019f7034-38d3` | Francis listening left-three-quarter, attentive expression and slight head tilt, thin round glasses, holding a |
| `francis__listening-left-three-quarter-glasses__from-codex-019f725c-f5ac78b3.png` | `019f725c-0566` | transparent Yomu Academy VN sprite. Match the existing Francis v2 silhouette and quality, but refine the youth |
| `francis__listening-right-three-quarter-glasses__from-codex-019f7034-727e174f.png` | `019f7034-38d3` | Create one transparent-background VN sprite for Francis in Yomu's softer hand-pa |
| `francis__listening-right-three-quarter-glasses__from-codex-019f725d-8ccd00f4.png` | `019f725d-8836` | Yomu Academy transparent half-body VN character sprite |
| `francis__neutral-front-glasses-no-hat__from-codex-019f7034-3da07861.png` | `019f7034-38d3` | Francis neutral front-facing, relaxed shoulders and small thoughtful smile, no glasses, holding a simple ceram |
| `francis__neutral-front-glasses__from-codex-019f7034-138d1868.png` | `019f7034-38d3` | Create one transparent-background VN character sprite for Francis in Yomu Academ |
| `francis__neutral-front-glasses__from-codex-019f725b-d4680c30.png` | `019f725b-709e` | Yomu Academy transparent half-body visual-novel sprite |
| `francis__neutral-front-glasses__from-codex-019f725b-e47ae6c8.png` | `019f725b-709e` | Yomu Academy transparent half-body VN sprite. |
| `francis__neutral-front-glasses__from-codex-019f725c-c091907f.png` | `019f725c-85a1` | transparent Yomu Academy living-paper VN character sprite. |
| `francis__neutral-front-glasses__from-codex-019f725c-d5b4cd3d.png` | `019f725c-0566` | transparent Yomu Academy VN sprite. Input images are style/identity anchors only: existing Francis family, Fel |
| `francis__neutral-front-glasses__from-codex-019f725d-575935b0.png` | `019f725d-8836` | Yomu Academy transparent half-body VN character sprite |
| `francis__neutral-front__from-codex-019f7034-fc6836b1.png` | `019f7034-38d3` | Create Francis's neutral front-near-front half-body sprite for Yomu Academy. |
| `francis__neutral-glasses__from-codex-019f725d-0b6441cb.png` | `019f725d-28be` | Yomu Academy transparent half-body VN sprite. Generate a fresh Francis neutral front sprite. Subject: Francis, |
| `francis__neutral-left-three-quarter__from-codex-019f7034-a07f53d1.png` | `019f7034-38d3` | Francis determined left-three-quarter performance sprite. |
| `francis__neutral-right-three-quarter__from-codex-019f7034-f78818e1.png` | `019f7034-38d3` | Francis happy right-three-quarter performance sprite. |
| `francis__surprised-right-three-quarter-glasses__from-codex-019f725d-def52c08.png` | `019f725d-28be` | Yomu Academy VN sprite, transparent cutout via a perfectly flat #00ff00 chroma b |
| `francis__thoughtful-left-three-quarter-glasses__from-codex-019f725d-df7c029d.png` | `019f725d-28be` | Yomu Academy VN sprite, transparent cutout via a perfectly flat #00ff00 chroma b |

### `henry` — 31 file(s)  (17 git · 14 codex)

**From git history:**

| File | Provenance | Original path | Rejected? |
|---|---|---|:--:|
| `henry__determined-left-three-quarter-halfbody-v__from-git-stash.png` | `git-stash` | `docs/public/academy/art/characters/henry/henry__determined__left-three-quarter__halfbody__v001.png` |  |
| `henry__happy-right-three-quarter-halfbody-v001__from-git-stash.png` | `git-stash` | `docs/public/academy/art/characters/henry/henry__happy__right-three-quarter__halfbody__v001.png` |  |
| `henry__neutral-front-near-front-halfbody-v001__from-git-stash.png` | `git-stash` | `docs/public/academy/art/characters/henry/henry__neutral__front-near-front__halfbody__v001.png` |  |
| `henry__sprite-concerned-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/henry/henry__sprite__concerned__halfbody__v2.png` |  |
| `henry__sprite-determined-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/henry/henry__sprite__determined__halfbody__v2.png` |  |
| `henry__sprite-determined-left-three-quarter-hal__from-86ad60ab2.png` | `86ad60ab2` | `docs/public/academy/art/characters/henry/henry__sprite__determined__left-three-quarter__halfbody__v3.png` |  |
| `henry__sprite-determined-left-three-quarter-hal__from-b5f3e6798.png` | `b5f3e6798` | `docs/public/academy/art/characters/henry/henry__sprite__determined__left-three-quarter__halfbody__v3.png` |  |
| `henry__sprite-embarrassed-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/henry/henry__sprite__embarrassed__halfbody__v2.png` |  |
| `henry__sprite-happy-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/henry/henry__sprite__happy__halfbody__v2.png` |  |
| `henry__sprite-laughing-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/henry/henry__sprite__laughing__halfbody__v2.png` |  |
| `henry__sprite-listening-right-three-quarter-hal__from-86ad60ab2.png` | `86ad60ab2` | `docs/public/academy/art/characters/henry/henry__sprite__listening__right-three-quarter__halfbody__v3.png` |  |
| `henry__sprite-listening-right-three-quarter-hal__from-b5f3e6798.png` | `b5f3e6798` | `docs/public/academy/art/characters/henry/henry__sprite__listening__right-three-quarter__halfbody__v3.png` |  |
| `henry__sprite-neutral-halfbody-v3__from-86ad60ab2.png` | `86ad60ab2` | `docs/public/academy/art/characters/henry/henry__sprite__neutral__halfbody__v3.png` |  |
| `henry__sprite-neutral-halfbody-v3__from-b5f3e6798.png` | `b5f3e6798` | `docs/public/academy/art/characters/henry/henry__sprite__neutral__halfbody__v3.png` |  |
| `henry__sprite-speaking-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/henry/henry__sprite__speaking__halfbody__v2.png` |  |
| `henry__sprite-surprised-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/henry/henry__sprite__surprised__halfbody__v2.png` |  |
| `henry__sprite-thinking-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/henry/henry__sprite__thinking__halfbody__v2.png` |  |

**From codex generated_images:**

| File | Thread | Prompt (head) |
|---|---|---|
| `henry__determined-left-three-quarter__from-codex-019f718b-22e6e8f0.png` | `019f718b-2235` | Create a premium transparent-background visual-novel character sprite for an ori |
| `henry__determined__from-codex-019f718c-4d5cf784.png` | `019f718c-c0c0` | Create a single character sprite on a perfectly flat solid #00ff00 chroma-key ba |
| `henry__happy__from-codex-019f718c-aaf81f29.png` | `019f718c-c0c0` | Create a single character sprite on a perfectly flat solid #00ff00 chroma-key ba |
| `henry__listening-right-three-quarter__from-codex-019f718b-c222fa0f.png` | `019f718b-2235` | Create a premium transparent-background visual-novel character sprite for an ori |
| `henry__neutral-front__from-codex-019f7034-856515d0.png` | `019f7034-38d3` | Create Henry's neutral front-near-front half-body sprite for Yomu Academy. |
| `henry__neutral-front__from-codex-019f7034-9fbd74a5.png` | `019f7034-38d3` | Regenerate Henry neutral front-near-front in the established Yomu likeness style, deliberately removing uncann |
| `henry__neutral-left-three-quarter__from-codex-019f7034-9ae9d9cb.png` | `019f7034-38d3` | Create Henry's determined left-three-quarter performance sprite. |
| `henry__neutral-right-three-quarter__from-codex-019f7034-2f971c65.png` | `019f7034-38d3` | Create Henry's happy right-three-quarter performance sprite. |
| `henry__neutral__from-codex-019f718b-473dacf5.png` | `019f718b-2235` | Create exactly one original fictionalized adult classmate sprite for Henry, the AI tinkerer who dodges homewor |
| `henry__neutral__from-codex-019f718c-4e105e22.png` | `019f718c-c0c0` | Create a single character sprite on a perfectly flat solid #00ff00 chroma-key ba |
| `henry__surprised-left-three-quarter__from-codex-019f725d-e49145e9.png` | `019f725d-e71e` | Create one high-resolution VN sprite candidate based on the attached Henry ancho |
| `henry__thoughtful-front__from-codex-019f725d-3658f45f.png` | `019f725d-e71e` | Create one high-resolution VN sprite candidate based on the attached Henry ancho |
| `henry__warm-left-three-quarter__from-codex-019f725d-4c22509b.png` | `019f725d-e71e` | Create one high-resolution VN sprite candidate based on the attached Henry ancho |
| `henry__warm-right-three-quarter__from-codex-019f725d-9d9eb669.png` | `019f725d-e71e` | Create one high-resolution VN sprite candidate based on the attached Henry ancho |

### `jenny` — 10 file(s)  (10 git · 0 codex)

**From git history:**

| File | Provenance | Original path | Rejected? |
|---|---|---|:--:|
| `jenny__sprite-concerned-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/jenny/jenny__sprite__concerned__halfbody__v2.png` |  |
| `jenny__sprite-determined-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/jenny/jenny__sprite__determined__halfbody__v2.png` |  |
| `jenny__sprite-embarrassed-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/jenny/jenny__sprite__embarrassed__halfbody__v2.png` |  |
| `jenny__sprite-happy-halfbody-v2__from-ce23e6bc8.png` | `ce23e6bc8` | `docs/public/academy/art/characters/jenny/jenny__sprite__happy__halfbody__v2.png` |  |
| `jenny__sprite-laughing-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/jenny/jenny__sprite__laughing__halfbody__v2.png` |  |
| `jenny__sprite-listening-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/jenny/jenny__sprite__listening__halfbody__v2.png` |  |
| `jenny__sprite-neutral-halfbody-v2__from-ce23e6bc8.png` | `ce23e6bc8` | `docs/public/academy/art/characters/jenny/jenny__sprite__neutral__halfbody__v2.png` |  |
| `jenny__sprite-speaking-halfbody-v2__from-ce23e6bc8.png` | `ce23e6bc8` | `docs/public/academy/art/characters/jenny/jenny__sprite__speaking__halfbody__v2.png` |  |
| `jenny__sprite-surprised-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/jenny/jenny__sprite__surprised__halfbody__v2.png` |  |
| `jenny__sprite-thinking-halfbody-v2__from-ce23e6bc8.png` | `ce23e6bc8` | `docs/public/academy/art/characters/jenny/jenny__sprite__thinking__halfbody__v2.png` |  |

### `jodi` — 10 file(s)  (10 git · 0 codex)

**From git history:**

| File | Provenance | Original path | Rejected? |
|---|---|---|:--:|
| `jodi__sprite-concerned-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/jodi/jodi__sprite__concerned__halfbody__v2.png` |  |
| `jodi__sprite-determined-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/jodi/jodi__sprite__determined__halfbody__v2.png` |  |
| `jodi__sprite-embarrassed-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/jodi/jodi__sprite__embarrassed__halfbody__v2.png` |  |
| `jodi__sprite-happy-halfbody-v2__from-ce23e6bc8.png` | `ce23e6bc8` | `docs/public/academy/art/characters/jodi/jodi__sprite__happy__halfbody__v2.png` |  |
| `jodi__sprite-laughing-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/jodi/jodi__sprite__laughing__halfbody__v2.png` |  |
| `jodi__sprite-listening-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/jodi/jodi__sprite__listening__halfbody__v2.png` |  |
| `jodi__sprite-neutral-halfbody-v2__from-ce23e6bc8.png` | `ce23e6bc8` | `docs/public/academy/art/characters/jodi/jodi__sprite__neutral__halfbody__v2.png` |  |
| `jodi__sprite-speaking-halfbody-v2__from-ce23e6bc8.png` | `ce23e6bc8` | `docs/public/academy/art/characters/jodi/jodi__sprite__speaking__halfbody__v2.png` |  |
| `jodi__sprite-surprised-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/jodi/jodi__sprite__surprised__halfbody__v2.png` |  |
| `jodi__sprite-thinking-halfbody-v2__from-ce23e6bc8.png` | `ce23e6bc8` | `docs/public/academy/art/characters/jodi/jodi__sprite__thinking__halfbody__v2.png` |  |

### `mika` — 10 file(s)  (10 git · 0 codex)

**From git history:**

| File | Provenance | Original path | Rejected? |
|---|---|---|:--:|
| `mika__sprite-concerned-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/mika/mika__sprite__concerned__halfbody__v2.png` |  |
| `mika__sprite-determined-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/mika/mika__sprite__determined__halfbody__v2.png` |  |
| `mika__sprite-embarrassed-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/mika/mika__sprite__embarrassed__halfbody__v2.png` |  |
| `mika__sprite-happy-halfbody-v2__from-ce23e6bc8.png` | `ce23e6bc8` | `docs/public/academy/art/characters/mika/mika__sprite__happy__halfbody__v2.png` |  |
| `mika__sprite-laughing-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/mika/mika__sprite__laughing__halfbody__v2.png` |  |
| `mika__sprite-listening-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/mika/mika__sprite__listening__halfbody__v2.png` |  |
| `mika__sprite-neutral-halfbody-v2__from-ce23e6bc8.png` | `ce23e6bc8` | `docs/public/academy/art/characters/mika/mika__sprite__neutral__halfbody__v2.png` |  |
| `mika__sprite-speaking-halfbody-v2__from-ce23e6bc8.png` | `ce23e6bc8` | `docs/public/academy/art/characters/mika/mika__sprite__speaking__halfbody__v2.png` |  |
| `mika__sprite-surprised-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/mika/mika__sprite__surprised__halfbody__v2.png` |  |
| `mika__sprite-thinking-halfbody-v2__from-ce23e6bc8.png` | `ce23e6bc8` | `docs/public/academy/art/characters/mika/mika__sprite__thinking__halfbody__v2.png` |  |

### `miller` — 7 file(s)  (0 git · 7 codex)

**From codex generated_images:**

| File | Thread | Prompt (head) |
|---|---|---|
| `miller__concerned-right-three-quarter__from-codex-019f7471-ee7c94f7.png` | `019f7471-dd5b` | Miller, a polished young adult American businessman/student, calm observant and considerate, rendered as a dis |
| `miller__determined-left-three-quarter__from-codex-019f7471-5f8e5f27.png` | `019f7471-dd5b` | Miller, a polished young adult American businessman/student, calm observant and considerate, rendered as a dis |
| `miller__happy-right-three-quarter__from-codex-019f7471-3da661ff.png` | `019f7471-dd5b` | Miller, a polished young adult American businessman/student, calm observant and considerate, rendered as a dis |
| `miller__listening-left-three-quarter__from-codex-019f7471-59291c55.png` | `019f7471-dd5b` | Miller, a polished young adult American businessman/student, calm observant and considerate, rendered as a dis |
| `miller__neutral-front__from-codex-019f7471-4d89705e.png` | `019f7471-dd5b` | Miller, a polished young adult American businessman/student, calm observant and considerate, rendered as a dis |
| `miller__surprised-right-three-quarter__from-codex-019f7471-f0e5074c.png` | `019f7471-dd5b` | Miller, a polished young adult American businessman/student, calm observant and considerate, rendered as a dis |
| `miller__thinking__from-codex-019f7471-999f0155.png` | `019f7471-dd5b` | Miller, a polished young adult American businessman/student, calm observant and considerate, rendered as a dis |

### `nanako` — 4 file(s)  (0 git · 4 codex)

**From codex generated_images:**

| File | Thread | Prompt (head) |
|---|---|---|
| `nanako__determined-left-three-quarter-glasses__from-codex-019f742a-fd92b7b9.png` | `019f742a-2699` | Create a single full half-body sprite of Nanako, a Japanese woman in her early-to-mid 20s, reimagined likeness |
| `nanako__happy-right-three-quarter-glasses__from-codex-019f742a-6df4797b.png` | `019f742a-2699` | Create a single full half-body sprite of Nanako, a Japanese woman in her early-to-mid 20s, reimagined likeness |
| `nanako__listening-left-three-quarter-glasses__from-codex-019f742a-1c7fcb50.png` | `019f742a-2699` | Create a single full half-body sprite of Nanako, a Japanese woman in her early-to-mid 20s, reimagined likeness |
| `nanako__neutral-front-glasses__from-codex-019f742a-1e54dbb4.png` | `019f742a-2699` | Create a single full half-body sprite of Nanako, a Japanese woman in her early-to-mid 20s, reimagined likeness |

### `onke` — 11 file(s)  (10 git · 1 codex)

**From git history:**

| File | Provenance | Original path | Rejected? |
|---|---|---|:--:|
| `onke__sprite-concerned-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/onke/onke__sprite__concerned__halfbody__v2.png` |  |
| `onke__sprite-determined-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/onke/onke__sprite__determined__halfbody__v2.png` |  |
| `onke__sprite-embarrassed-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/onke/onke__sprite__embarrassed__halfbody__v2.png` |  |
| `onke__sprite-happy-halfbody-v2__from-ce23e6bc8.png` | `ce23e6bc8` | `docs/public/academy/art/characters/onke/onke__sprite__happy__halfbody__v2.png` |  |
| `onke__sprite-laughing-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/onke/onke__sprite__laughing__halfbody__v2.png` |  |
| `onke__sprite-listening-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/onke/onke__sprite__listening__halfbody__v2.png` |  |
| `onke__sprite-neutral-halfbody-v2__from-ce23e6bc8.png` | `ce23e6bc8` | `docs/public/academy/art/characters/onke/onke__sprite__neutral__halfbody__v2.png` |  |
| `onke__sprite-speaking-halfbody-v2__from-ce23e6bc8.png` | `ce23e6bc8` | `docs/public/academy/art/characters/onke/onke__sprite__speaking__halfbody__v2.png` |  |
| `onke__sprite-surprised-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/onke/onke__sprite__surprised__halfbody__v2.png` |  |
| `onke__sprite-thinking-halfbody-v2__from-ce23e6bc8.png` | `ce23e6bc8` | `docs/public/academy/art/characters/onke/onke__sprite__thinking__halfbody__v2.png` |  |

**From codex generated_images:**

| File | Thread | Prompt (head) |
|---|---|---|
| `onke__neutral__from-codex-019f718d-0f05f628.png` | `019f718d-2def` | Create a single 4-panel sprite sheet of the same fictional adult woman character |

### `peter` — 4 file(s)  (1 git · 3 codex)

**From git history:**

| File | Provenance | Original path | Rejected? |
|---|---|---|:--:|
| `peter__neutral-halfbody-v001__from-git-stash.png` | `git-stash` | `docs/public/academy/art/characters/peter/peter__neutral__halfbody__v001.png` |  |

**From codex generated_images:**

| File | Thread | Prompt (head) |
|---|---|---|
| `peter__encouraging-right-three-quarter__from-codex-019f632f-49ce316c.png` | `019f632f-8dc5` | create a right three-quarter half-body sprite of Peter, age about 26, with visibly lighter remaining hair. Sam |
| `peter__thoughtful-left-three-quarter__from-codex-019f632f-3942d014.png` | `019f632f-8dc5` | create a left three-quarter half-body sprite of Peter, age about 26, with visibly lighter remaining hair. He w |
| `peter__warm__from-codex-019f3220-005e7d78.png` | `019f3220-a107` | Create Peter, an adult evening-class Japanese learner, as a consistent visual-novel sprite. He is a white man, |

### `portraits` — 1 file(s)  (1 git · 0 codex)

**From git history:**

| File | Provenance | Original path | Rejected? |
|---|---|---|:--:|
| `portraits__pho__from-220e5e4f1.png` | `220e5e4f1` | `public/academy/art/characters/portraits/pho.png` |  |

### `rie` — 54 file(s)  (8 git · 46 codex)

**From git history:**

| File | Provenance | Original path | Rejected? |
|---|---|---|:--:|
| `rie__comedic-right-three-quarter-halfbody-v00__from-929724fa1.png` | `929724fa1` | `docs/public/academy/art/characters/rie/rie__comedic__right-three-quarter__halfbody__v001.png` |  |
| `rie__determined-left-three-quarter-halfbody-v__from-929724fa1.png` | `929724fa1` | `docs/public/academy/art/characters/rie/rie__determined__left-three-quarter__halfbody__v001.png` |  |
| `rie__encouraging-halfbody-v001__from-56cb7fef3.png` | `56cb7fef3` | `docs/public/academy/art/characters/rie/rie__encouraging__halfbody__v001.png` |  |
| `rie__happy-halfbody-v001__from-56cb7fef3.png` | `56cb7fef3` | `docs/public/academy/art/characters/rie/rie__happy__halfbody__v001.png` |  |
| `rie__neutral-halfbody-v001__from-da563e8a4.png` | `da563e8a4` | `docs/public/academy/art/characters/rie/rie__neutral__halfbody__v001.png` |  |
| `rie__repair-halfbody-v001__from-56cb7fef3.png` | `56cb7fef3` | `docs/public/academy/art/characters/rie/rie__repair__halfbody__v001.png` |  |
| `rie__sad-vulnerable-front-near-front-halfbody__from-929724fa1.png` | `929724fa1` | `docs/public/academy/art/characters/rie/rie__sad-vulnerable__front-near-front__halfbody__v001.png` |  |
| `rie__sprite-thinking-glasses-left-three-quart__from-git-stash.png` | `git-stash` | `docs/public/academy/art/characters/rie/rie__sprite__thinking-glasses__left-three-quarter__v002.png` |  |

**From codex generated_images:**

| File | Thread | Prompt (head) |
|---|---|---|
| `rie__comedic-right-three-quarter__from-codex-019f6361-9ff13712.png` | `019f6361-4a5d` | Create Rie's right-three-quarter comedic performance variant as an identity-preserving edit of Image 1. Images |
| `rie__concerned-left-three-quarter-glasses__from-codex-019f725d-f42cff58.png` | `019f725d-e71e` | Create one high-resolution VN sprite candidate based on the attached Rie style a |
| `rie__determined-left-three-quarter__from-codex-019f6361-fe0015da.png` | `019f6361-4a5d` | Create Rie's left-three-quarter determined performance variant as an identity-preserving edit of Image 1. Imag |
| `rie__encouraging-front-glasses__from-codex-019f725d-29a05127.png` | `019f725d-e71e` | Create one high-resolution VN sprite candidate based on the attached Rie style a |
| `rie__happy__from-codex-019f58ec-802cb03f.png` | `019f58ec-080a` | Edit the woman in Image 1 into Rie's HAPPY expression after a learner succeeds on a retry. Give her a warm, ge |
| `rie__listening-left-three-quarter-glasses__from-codex-019f725d-0652cf06.png` | `019f725d-e71e` | Create one high-resolution VN sprite candidate based on the attached Rie style a |
| `rie__listening__from-codex-019f58ec-7a1c29c6.png` | `019f58ec-080a` | Edit the woman in Image 1 into Rie's ENCOURAGING expression while a learner is making an honest attempt. Give  |
| `rie__neutral-front-glasses__from-codex-019f718b-ab10cd56.png` | `019f718b-af0d` | Yomu Academy VN half-body sprite, Tom1 v003 neutral. Image 1 is an older Tom identity cue only (hair color and |
| `rie__neutral-front-glasses__from-codex-019f7237-20b1b72d.png` | `019f7237-d9be` | Create a new expression/pose variant of the provided approved Rie neutral-glasses sprite. |
| `rie__neutral-front-no-hat__from-codex-019f718b-808a2c3d.png` | `019f718b-af0d` | final Yomu Academy VN half-body sprite, Aakash v004 neutral. Image 1 is a rough no-hat Aakash identity draft;  |
| `rie__neutral-front-no-hat__from-codex-019f718b-bda6095e.png` | `019f718b-af0d` | Yomu Academy VN half-body sprite, Aakash v004 neutral. Input images 1–3 are the existing Aakash v003 identity  |
| `rie__neutral-glasses__from-codex-019f5959-29b4cc39.png` | `019f5959-0743` | Create one neutral half-body sprite of the same adult classmate shown at the center of reference 1 and third f |
| `rie__neutral-glasses__from-codex-019f718b-802b22fd.png` | `019f718b-af0d` | final Yomu Academy VN half-body sprite. Image 1 is the newly locked soft Shin identity/style anchor; Image 2 i |
| `rie__neutral-glasses__from-codex-019f718b-a4fe84e2.png` | `019f718b-af0d` | final Yomu Academy VN half-body sprite. Image 1 is the current Shin design identity anchor; Image 2 is an olde |
| `rie__neutral-glasses__from-codex-019f718b-ebb29d26.png` | `019f718b-af0d` | create one original Shin neutral front-ish half-body sprite, centered and dialogue-safe, adult evening Japanes |
| `rie__neutral-left-three-quarter-glasses__from-codex-019f7034-d34be164.png` | `019f7034-38d3` | Create a Rie-sensei determined glasses variant for the pottery and museum story scenes. |
| `rie__neutral-left-three-quarter-glasses__from-codex-019f718b-7660411f.png` | `019f718b-af0d` | final Yomu Academy VN half-body sprite. Image 1 is Shin's locked no-glasses neutral identity anchor; Image 2 i |
| `rie__neutral-left-three-quarter-glasses__from-codex-019f7237-2af63a05.png` | `019f7237-d9be` | Create a new expression/pose variant of the provided approved Rie neutral-glasses sprite. |
| `rie__neutral-left-three-quarter-no-hat__from-codex-019f718b-c7110659.png` | `019f718b-af0d` | final Yomu Academy VN half-body sprite, Aakash v004 determined city-key pose. Image 1 is the locked no-hat, no |
| `rie__neutral-left-three-quarter-no-hat__from-codex-019f718b-f1bd2d31.png` | `019f718b-af0d` | Yomu Academy VN half-body sprite, Aakash v004 determined city-pop pose. Image 1 is the new no-hat Aakash neutr |
| `rie__neutral-right-three-quarter-glasses__from-codex-019f7034-00093501.png` | `019f7034-38d3` | Create a new Rie-sensei neutral glasses variant from the approved Rie sprite. |
| `rie__neutral-right-three-quarter-glasses__from-codex-019f7034-31fabc7b.png` | `019f7034-38d3` | Create the neutral identity anchor for the second Tom, a distinct new Academy classmate. |
| `rie__neutral-right-three-quarter-glasses__from-codex-019f7034-f7af56ad.png` | `019f7034-38d3` | Create a Rie-sensei encouraging-listening glasses variant for museum and restaurant story scenes. |
| `rie__neutral-right-three-quarter-glasses__from-codex-019f718b-19411fc9.png` | `019f718b-af0d` | Yomu Academy VN half-body sprite, Tom1 v003 happy. Image 1 is Tom's locked soft neutral identity anchor; image |
| `rie__neutral-right-three-quarter-glasses__from-codex-019f718b-fa0adc65.png` | `019f718b-af0d` | final Yomu Academy VN half-body sprite. Image 1 is the newly locked soft Shin identity/style anchor; Image 2 i |
| `rie__neutral-right-three-quarter-glasses__from-codex-019f7237-5756d3cb.png` | `019f7237-d9be` | Create a new expression/pose variant of the provided approved Rie neutral-glasses sprite. |
| `rie__neutral-right-three-quarter-no-hat__from-codex-019f718b-21782427.png` | `019f718b-af0d` | Yomu Academy VN half-body sprite, Aakash v004 camera-hobby pose. Image 1 is the new no-hat Aakash neutral iden |
| `rie__neutral-right-three-quarter-no-hat__from-codex-019f718b-28f16e2f.png` | `019f718b-af0d` | final Yomu Academy VN half-body sprite, Aakash v004 camera/listening. Image 1 is the locked no-hat, no-earring |
| `rie__neutral__from-codex-019f50cb-0e47a7e6.png` | `019f50cb-9d1e` | Create Suzu Arai, an original fictional adult notice editor. She has a precise chin-length dark auburn bob tuc |
| `rie__neutral__from-codex-019f50cb-45371af2.png` | `019f50cb-9d1e` | Create Leo Ward, an original fictional adult route-card maker. He has warm medium-brown skin, short loose dark |
| `rie__neutral__from-codex-019f50cb-ba7392a3.png` | `019f50cb-9d1e` | Create Nori Vale, an original fictional nonbinary adult low-pressure rehearsal host. They have warm olive skin |
| `rie__neutral__from-codex-019f50cb-d2aeb9c0.png` | `019f50cb-9d1e` | Create Rie-sensei in a neutral-warm welcome pose, standing at a gentle front 3/4 angle, one hand holding her t |
| `rie__neutral__from-codex-019f50cb-fa214aa7.png` | `019f50cb-9d1e` | Create Mika Chen, an original fictional adult fallback planner. She has an East Asian appearance as a fictiona |
| `rie__neutral__from-codex-019f516f-3fbdb276.png` | `019f516f-be6b` | Create Rie-sensei's speaking expression, in the middle of a gentle explanation: natural open mouth forming one |
| `rie__neutral__from-codex-019f516f-4b79bcb5.png` | `019f516f-be6b` | Create the happy expression for Rie-sensei. |
| `rie__neutral__from-codex-019f516f-4fd7ba21.png` | `019f516f-be6b` | Create the laughing expression for Rie-sensei. |
| `rie__neutral__from-codex-019f516f-5c04d912.png` | `019f516f-be6b` | Create Rie-sensei in a neutral, attentive listening pose, preserving the adult teacher's recognizable face sha |
| `rie__neutral__from-codex-019f516f-9e72c4d4.png` | `019f516f-be6b` | Create the thinking expression for Rie-sensei. |
| `rie__neutral__from-codex-019f516f-cfa34e8a.png` | `019f516f-be6b` | Create Rie-sensei's happy expression: a gentle genuine adult smile, softened cheeks, bright attentive eyes, re |
| `rie__neutral__from-codex-019f5592-8298ccdf.png` | `019f5592-69f2` | Generate a new expression variant of the same adult Japanese woman teacher, Rie. Preserve the same face, facia |
| `rie__neutral__from-codex-019f5880-559872f8.png` | `019f5880-f5a6` | Create one polished widescreen concept board showing the SAME full-bleed Japanese evening-class beat across fo |
| `rie__sad-vulnerable-front__from-codex-019f6361-df8133cf.png` | `019f6361-4a5d` | Create Rie's front-near-front sad-vulnerable performance variant as an identity-preserving edit of Image 1. Im |
| `rie__sad__from-codex-019f58ec-6532d571.png` | `019f58ec-080a` | Edit the woman in Image 1 into Rie's REPAIR expression after a learner makes an understandable mistake. Give h |
| `rie__surprised-right-three-quarter-glasses__from-codex-019f725d-5aa7b5d8.png` | `019f725d-e71e` | Create one high-resolution VN sprite candidate based on the attached Rie style a |
| `rie__thoughtful-left-three-quarter-glasses__from-codex-019f74c6-7107c710.png` | `019f74c6-f415` | transparent visual-novel character sprite, 1536x2048 portrait PNG. |
| `rie__warm__from-codex-019f3220-76d267a1.png` | `019f3220-a107` | Create Rie-sensei, a charming slightly older Japanese evening-language teacher, smiling with a knowing, gently |

### `robert` — 13 file(s)  (10 git · 3 codex)

**From git history:**

| File | Provenance | Original path | Rejected? |
|---|---|---|:--:|
| `robert__sprite-concerned-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/robert/robert__sprite__concerned__halfbody__v2.png` |  |
| `robert__sprite-determined-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/robert/robert__sprite__determined__halfbody__v2.png` |  |
| `robert__sprite-embarrassed-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/robert/robert__sprite__embarrassed__halfbody__v2.png` |  |
| `robert__sprite-happy-halfbody-v2__from-ce23e6bc8.png` | `ce23e6bc8` | `docs/public/academy/art/characters/robert/robert__sprite__happy__halfbody__v2.png` |  |
| `robert__sprite-laughing-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/robert/robert__sprite__laughing__halfbody__v2.png` |  |
| `robert__sprite-listening-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/robert/robert__sprite__listening__halfbody__v2.png` |  |
| `robert__sprite-neutral-halfbody-v2__from-ce23e6bc8.png` | `ce23e6bc8` | `docs/public/academy/art/characters/robert/robert__sprite__neutral__halfbody__v2.png` |  |
| `robert__sprite-speaking-halfbody-v2__from-ce23e6bc8.png` | `ce23e6bc8` | `docs/public/academy/art/characters/robert/robert__sprite__speaking__halfbody__v2.png` |  |
| `robert__sprite-surprised-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/robert/robert__sprite__surprised__halfbody__v2.png` |  |
| `robert__sprite-thinking-halfbody-v2__from-ce23e6bc8.png` | `ce23e6bc8` | `docs/public/academy/art/characters/robert/robert__sprite__thinking__halfbody__v2.png` |  |

**From codex generated_images:**

| File | Thread | Prompt (head) |
|---|---|---|
| `robert__neutral-left-three-quarter__from-codex-019f718b-0f8c5456.png` | `019f718b-2235` | Create exactly one original fictionalized adult classmate sprite for Sam, matching the provided neutral Sam de |
| `robert__neutral-right-three-quarter__from-codex-019f718b-7f0c7e18.png` | `019f718b-2235` | Create exactly one original fictionalized adult classmate sprite for Sam, matching the provided neutral Sam de |
| `robert__neutral__from-codex-019f718b-49c4fe6c.png` | `019f718b-2235` | Create exactly one original fictionalized adult classmate sprite for Sam, the easygoing Saturday athlete and o |

### `rose` — 39 file(s)  (10 git · 29 codex)

**From git history:**

| File | Provenance | Original path | Rejected? |
|---|---|---|:--:|
| `rose__sprite-concerned-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/rose/rose__sprite__concerned__halfbody__v2.png` |  |
| `rose__sprite-determined-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/rose/rose__sprite__determined__halfbody__v2.png` |  |
| `rose__sprite-embarrassed-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/rose/rose__sprite__embarrassed__halfbody__v2.png` |  |
| `rose__sprite-happy-halfbody-v2__from-ce23e6bc8.png` | `ce23e6bc8` | `docs/public/academy/art/characters/rose/rose__sprite__happy__halfbody__v2.png` |  |
| `rose__sprite-laughing-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/rose/rose__sprite__laughing__halfbody__v2.png` |  |
| `rose__sprite-listening-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/rose/rose__sprite__listening__halfbody__v2.png` |  |
| `rose__sprite-neutral-halfbody-v2__from-ce23e6bc8.png` | `ce23e6bc8` | `docs/public/academy/art/characters/rose/rose__sprite__neutral__halfbody__v2.png` |  |
| `rose__sprite-speaking-halfbody-v2__from-ce23e6bc8.png` | `ce23e6bc8` | `docs/public/academy/art/characters/rose/rose__sprite__speaking__halfbody__v2.png` |  |
| `rose__sprite-surprised-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/rose/rose__sprite__surprised__halfbody__v2.png` |  |
| `rose__sprite-thinking-halfbody-v2__from-ce23e6bc8.png` | `ce23e6bc8` | `docs/public/academy/art/characters/rose/rose__sprite__thinking__halfbody__v2.png` |  |

**From codex generated_images:**

| File | Thread | Prompt (head) |
|---|---|---|
| `rose__encouraging-glasses__from-codex-019f74c5-7e06f415.png` | `019f74c5-9d81` | Restyle this same older man into the Yomu Academy house style and create one new sprite. Change only the expre |
| `rose__happy-glasses__from-codex-019f74cd-3b45b658.png` | `019f74cd-3b87` | Re-render the woman into the Yomu Academy house style. Change only rendering, pose/expression, crop, and backg |
| `rose__happy-left-three-quarter-glasses__from-codex-019f74cd-0768d327.png` | `019f74cd-24cd` | Restyle IMAGE 1 into the warm Yomu Academy house style using IMAGE 2 only as the rendering-style reference. IM |
| `rose__neutral-glasses__from-codex-019f74c6-1d0556a0.png` | `019f74c6-4608` | Re-render the woman as a single polished Yomu Academy sprite in a warm, paper-painted semi-realistic visual-no |
| `rose__neutral-glasses__from-codex-019f74cb-d8e84b47.png` | `019f74cb-67cd` | Use case: style-transfer / identity-preserve. Create one finished tall 3:4 portr |
| `rose__neutral-left-three-quarter-glasses__from-codex-019f7034-6f7f568d.png` | `019f7034-38d3` | Rie thinking left-three-quarter half-body sprite, head to mid-thigh. Reimagined adult Japanese teacher with wa |
| `rose__neutral__from-codex-019f5338-ac5c378d.png` | `019f5338-3c8d` | Half-body visual-novel stage sprite of warm older adult White woman in her late |
| `rose__neutral__from-codex-019f533a-023ace9b.png` | `019f533a-35b0` | Half-body visual-novel stage sprite of a warm adult woman in her mid-20s; long w |
| `rose__neutral__from-codex-019f533e-047107cb.png` | `019f533e-24b9` | Half-body visual-novel stage sprite of a warm adult woman in her mid-20s; long w |
| `rose__neutral__from-codex-019f533e-1c416b56.png` | `019f533e-2b3a` | Half-body visual-novel stage sprite of a warm adult woman in her mid-20s; long w |
| `rose__neutral__from-codex-019f533e-2c4460ef.png` | `019f533e-2b3b` | Half-body visual-novel stage sprite of a warm adult woman in her mid-20s; long w |
| `rose__neutral__from-codex-019f533e-2de0ffe6.png` | `019f533e-2b3a` | Half-body visual-novel stage sprite of a warm adult woman in her mid-20s; long w |
| `rose__neutral__from-codex-019f533e-4d1ad458.png` | `019f533e-254f` | Half-body visual-novel stage sprite of a warm adult woman in her mid-20s; long w |
| `rose__neutral__from-codex-019f533e-6d7fad30.png` | `019f533e-254f` | Half-body visual-novel stage sprite of a warm adult woman in her mid-20s; long w |
| `rose__neutral__from-codex-019f533e-cd9dfb92.png` | `019f533e-2b3b` | Half-body visual-novel stage sprite of a warm adult woman in her mid-20s; long w |
| `rose__neutral__from-codex-019f533e-e4569842.png` | `019f533e-24b9` | Half-body visual-novel stage sprite of a warm adult woman in her mid-20s; long w |
| `rose__neutral__from-codex-019f533e-f595ae71.png` | `019f533e-2b3a` | Half-body visual-novel stage sprite of a warm adult woman in her mid-20s; long w |
| `rose__neutral__from-codex-019f5357-ece551de.png` | `019f5357-52ae` | Half-body visual-novel stage sprite of warm older adult White woman in her late |
| `rose__neutral__from-codex-019f5359-1e5b188b.png` | `019f5359-7e6f` | Half-body visual-novel stage sprite of warm older adult White woman in her late |
| `rose__neutral__from-codex-019f535b-1f399c4d.png` | `019f535b-5621` | Half-body visual-novel stage sprite of warm older adult White woman in her late |
| `rose__neutral__from-codex-019f535c-309eaca2.png` | `019f535c-95d5` | Half-body visual-novel stage sprite of warm older adult White woman in her late |
| `rose__neutral__from-codex-019f535d-4cd027bf.png` | `019f535d-8c69` | Half-body visual-novel stage sprite of warm older adult White woman in her late |
| `rose__neutral__from-codex-019f535e-bd31b681.png` | `019f535e-8b08` | Half-body visual-novel stage sprite of warm older adult White woman in her late |
| `rose__neutral__from-codex-019f535f-c4845dd1.png` | `019f535f-bc71` | Half-body visual-novel stage sprite of warm older adult White woman in her late |
| `rose__neutral__from-codex-019f5361-49172528.png` | `019f5361-a612` | Half-body visual-novel stage sprite of warm older adult White woman in her late |
| `rose__neutral__from-codex-019f5363-fd47cb65.png` | `019f5363-c243` | Half-body visual-novel stage sprite of warm older adult White woman in her late |
| `rose__sad-glasses__from-codex-019f74d2-77d4daa0.png` | `019f74d2-8ff7` | Restyle the first provided image into the Yomu Academy house style. Preserve the SAME adult woman identity, fa |
| `rose__thoughtful-glasses__from-codex-019f74cc-1b8ac14f.png` | `019f74cc-aca8` | Use case: identity-preserve + style-transfer. Edit the two supplied reference sp |
| `rose__warm__from-codex-019f74c5-7f751db9.png` | `019f74c5-3b91` | Yomu Academy visual-novel character sprite. |

### `ruparna` — 10 file(s)  (10 git · 0 codex)

**From git history:**

| File | Provenance | Original path | Rejected? |
|---|---|---|:--:|
| `ruparna__sprite-concerned-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/ruparna/ruparna__sprite__concerned__halfbody__v2.png` |  |
| `ruparna__sprite-determined-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/ruparna/ruparna__sprite__determined__halfbody__v2.png` |  |
| `ruparna__sprite-embarrassed-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/ruparna/ruparna__sprite__embarrassed__halfbody__v2.png` |  |
| `ruparna__sprite-happy-halfbody-v2__from-ce23e6bc8.png` | `ce23e6bc8` | `docs/public/academy/art/characters/ruparna/ruparna__sprite__happy__halfbody__v2.png` |  |
| `ruparna__sprite-laughing-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/ruparna/ruparna__sprite__laughing__halfbody__v2.png` |  |
| `ruparna__sprite-listening-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/ruparna/ruparna__sprite__listening__halfbody__v2.png` |  |
| `ruparna__sprite-neutral-halfbody-v2__from-ce23e6bc8.png` | `ce23e6bc8` | `docs/public/academy/art/characters/ruparna/ruparna__sprite__neutral__halfbody__v2.png` |  |
| `ruparna__sprite-speaking-halfbody-v2__from-ce23e6bc8.png` | `ce23e6bc8` | `docs/public/academy/art/characters/ruparna/ruparna__sprite__speaking__halfbody__v2.png` |  |
| `ruparna__sprite-surprised-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/ruparna/ruparna__sprite__surprised__halfbody__v2.png` |  |
| `ruparna__sprite-thinking-halfbody-v2__from-ce23e6bc8.png` | `ce23e6bc8` | `docs/public/academy/art/characters/ruparna/ruparna__sprite__thinking__halfbody__v2.png` |  |

### `sam` — 34 file(s)  (11 git · 23 codex)

**From git history:**

| File | Provenance | Original path | Rejected? |
|---|---|---|:--:|
| `sam__sprite-concerned-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/sam/sam__sprite__concerned__halfbody__v2.png` |  |
| `sam__sprite-determined-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/sam/sam__sprite__determined__halfbody__v2.png` |  |
| `sam__sprite-happy-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/sam/sam__sprite__happy__halfbody__v2.png` |  |
| `sam__sprite-happy-halfbody-v3__from-5ccaf54e2.png` | `5ccaf54e2` | `docs/public/academy/art/characters/sam/sam__sprite__happy__halfbody__v3.png` |  |
| `sam__sprite-laughing-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/sam/sam__sprite__laughing__halfbody__v2.png` |  |
| `sam__sprite-listening-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/sam/sam__sprite__listening__halfbody__v2.png` |  |
| `sam__sprite-listening-halfbody-v3__from-5ccaf54e2.png` | `5ccaf54e2` | `docs/public/academy/art/characters/sam/sam__sprite__listening__halfbody__v3.png` |  |
| `sam__sprite-neutral-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/sam/sam__sprite__neutral__halfbody__v2.png` |  |
| `sam__sprite-neutral-halfbody-v3__from-5ccaf54e2.png` | `5ccaf54e2` | `docs/public/academy/art/characters/sam/sam__sprite__neutral__halfbody__v3.png` |  |
| `sam__sprite-speaking-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/sam/sam__sprite__speaking__halfbody__v2.png` |  |
| `sam__sprite-thinking-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/sam/sam__sprite__thinking__halfbody__v2.png` |  |

**From codex generated_images:**

| File | Thread | Prompt (head) |
|---|---|---|
| `sam__comedic-right-three-quarter__from-codex-019f725d-30bc8ca4.png` | `019f725d-8836` | Create one half-body VN sprite for Sam, using the private class photo only for b |
| `sam__concerned-right-three-quarter__from-codex-019f725d-c0ad3d7d.png` | `019f725d-8836` | Create one half-body VN sprite for Sam, using the private class photo only for b |
| `sam__determined-left-three-quarter__from-codex-019f725d-0fe9f11b.png` | `019f725d-8836` | Create one transparent-background half-body VN character sprite for Sam, matchin |
| `sam__determined-left-three-quarter__from-codex-019f725d-5666b271.png` | `019f725d-8836` | Create one half-body VN sprite for Sam, a calm young adult classmate seated by t |
| `sam__determined-left-three-quarter__from-codex-019f725d-5815d053.png` | `019f725d-28be` | Yomu Academy VN character sprite, transparent cutout on a perfectly flat #00ff00 |
| `sam__determined-left-three-quarter__from-codex-019f744f-01bef961.png` | `019f744f-772a` | transparent-background visual novel half-body character sprite. |
| `sam__happy-right-three-quarter__from-codex-019f718c-4eb2ee18.png` | `019f718c-9e14` | Generate Sam, an adult classmate from an evening class, as a half-body VN sprite. This is a reimagined likenes |
| `sam__happy-right-three-quarter__from-codex-019f725d-6d258d47.png` | `019f725d-28be` | Yomu Academy VN character sprite, transparent cutout on a perfectly flat #00ff00 |
| `sam__happy-right-three-quarter__from-codex-019f744f-b2cdda94.png` | `019f744f-772a` | transparent-background visual novel half-body character sprite. |
| `sam__listening-left-three-quarter-glasses__from-codex-019f725d-7d0727f8.png` | `019f725d-28be` | Yomu Academy VN character sprite, transparent cutout on a perfectly flat #00ff00 |
| `sam__listening-left-three-quarter-glasses__from-codex-019f744f-747f612f.png` | `019f744f-772a` | transparent-background visual novel half-body character sprite. |
| `sam__listening-left-three-quarter__from-codex-019f718c-0fa06d89.png` | `019f718c-9e14` | Generate Sam, an adult classmate from an evening class, as a half-body VN sprite. This is a reimagined likenes |
| `sam__neutral-front__from-codex-019f718c-5c023f48.png` | `019f718c-9e14` | Generate Sam, an adult classmate from an evening class, as a half-body VN sprite. This is a reimagined likenes |
| `sam__neutral-front__from-codex-019f725d-4936f1ee.png` | `019f725d-28be` | Yomu Academy VN character sprite, transparent cutout on a perfectly flat #00ff00 |
| `sam__neutral-front__from-codex-019f744f-0c853eb4.png` | `019f744f-772a` | transparent-background visual novel half-body character sprite. |
| `sam__sad-vulnerable-front-glasses-no-hat__from-codex-019f7470-bab5ad9e.png` | `019f7470-5d88` | transparent visual-novel character sprite. Create Sam, the friendly classmate who sits at the back by the clas |
| `sam__speaking-front-glasses__from-codex-019f747d-0715a39d.png` | `019f747d-6536` | Create a new Sam sprite, speaking expression, front-near-front angle, in the exact established Sam design from |
| `sam__surprised-left-three-quarter__from-codex-019f725d-20d4c9c9.png` | `019f725d-8836` | Create one transparent-background half-body VN character sprite for Sam, the cla |
| `sam__surprised-right-three-quarter-glasses__from-codex-019f747d-d3e38fda.png` | `019f747d-6536` | Create a new Sam sprite, surprised expression, right three-quarter angle, in the exact established Sam design  |
| `sam__surprised-right-three-quarter__from-codex-019f744f-7971acb3.png` | `019f744f-772a` | transparent-background visual novel half-body character sprite. |
| `sam__thoughtful-front__from-codex-019f744f-7f6c59b9.png` | `019f744f-772a` | transparent-background visual novel half-body character sprite. |
| `sam__thoughtful-left-three-quarter-glasses__from-codex-019f747d-5d468f43.png` | `019f747d-6536` | Create a new Sam character sprite, concerned expression, left three-quarter angle, in the exact established Sa |
| `sam__thoughtful-left-three-quarter__from-codex-019f744f-b964baa9.png` | `019f744f-772a` | transparent-background visual novel half-body character sprite. |

### `shaun` — 5 file(s)  (3 git · 2 codex)

**From git history:**

| File | Provenance | Original path | Rejected? |
|---|---|---|:--:|
| `shaun__sprite-determined-left-three-quarter-v00__from-git-stash.png` | `git-stash` | `docs/public/academy/art/characters/shaun/shaun__sprite__determined__left-three-quarter__v003.png` |  |
| `shaun__sprite-happy-right-three-quarter-v003__from-git-stash.png` | `git-stash` | `docs/public/academy/art/characters/shaun/shaun__sprite__happy__right-three-quarter__v003.png` |  |
| `shaun__sprite-listening-front-near-front-v003__from-git-stash.png` | `git-stash` | `docs/public/academy/art/characters/shaun/shaun__sprite__listening__front-near-front__v003.png` |  |

**From codex generated_images:**

| File | Thread | Prompt (head) |
|---|---|---|
| `shaun__neutral-glasses-no-hat__from-codex-019f5d0b-ad0db31f.png` | `019f5d0b-9ef8` | Create one neutral half-body sprite of Shaun, preserving the person’s recognizable likeness from Image 1. |
| `shaun__neutral__from-codex-019f718c-0b2cfa92.png` | `019f718c-fc5e` | Create a single production-ready character sprite sheet containing THREE separat |

### `shin` — 19 file(s)  (13 git · 6 codex)

**From git history:**

| File | Provenance | Original path | Rejected? |
|---|---|---|:--:|
| `shin__sprite-concerned-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/shin/shin__sprite__concerned__halfbody__v2.png` |  |
| `shin__sprite-determined-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/shin/shin__sprite__determined__halfbody__v2.png` |  |
| `shin__sprite-determined-left-three-quarter-hal__from-fb28e2714.png` | `fb28e2714` | `docs/public/academy/art/characters/shin/shin__sprite__determined__left-three-quarter__halfbody__v003.png` |  |
| `shin__sprite-embarrassed-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/shin/shin__sprite__embarrassed__halfbody__v2.png` |  |
| `shin__sprite-happy-halfbody-v2__from-ce23e6bc8.png` | `ce23e6bc8` | `docs/public/academy/art/characters/shin/shin__sprite__happy__halfbody__v2.png` |  |
| `shin__sprite-laughing-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/shin/shin__sprite__laughing__halfbody__v2.png` |  |
| `shin__sprite-listening-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/shin/shin__sprite__listening__halfbody__v2.png` |  |
| `shin__sprite-listening-right-three-quarter-hal__from-fb28e2714.png` | `fb28e2714` | `docs/public/academy/art/characters/shin/shin__sprite__listening__right-three-quarter__halfbody__v003.png` |  |
| `shin__sprite-neutral-front-near-front-halfbody__from-fb28e2714.png` | `fb28e2714` | `docs/public/academy/art/characters/shin/shin__sprite__neutral__front-near-front__halfbody__v003.png` |  |
| `shin__sprite-neutral-halfbody-v2__from-ce23e6bc8.png` | `ce23e6bc8` | `docs/public/academy/art/characters/shin/shin__sprite__neutral__halfbody__v2.png` |  |
| `shin__sprite-speaking-halfbody-v2__from-ce23e6bc8.png` | `ce23e6bc8` | `docs/public/academy/art/characters/shin/shin__sprite__speaking__halfbody__v2.png` |  |
| `shin__sprite-surprised-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/shin/shin__sprite__surprised__halfbody__v2.png` |  |
| `shin__sprite-thinking-halfbody-v2__from-ce23e6bc8.png` | `ce23e6bc8` | `docs/public/academy/art/characters/shin/shin__sprite__thinking__halfbody__v2.png` |  |

**From codex generated_images:**

| File | Thread | Prompt (head) |
|---|---|---|
| `shin__concerned-left-three-quarter-glasses-no-hat__from-codex-019f7470-317785c1.png` | `019f7470-5d88` | transparent visual-novel character sprite. Create Shin, an original reimagined Japanese classmate in the exact |
| `shin__determined-left-three-quarter-glasses__from-codex-019f718c-615e0182.png` | `019f718c-a60d` | Create a single full-body character sprite on a completely flat pure chroma gree |
| `shin__listening-glasses-no-hat__from-codex-019f7470-bc549b68.png` | `019f7470-5d88` | transparent visual-novel character sprite. Create Shin, an original reimagined Japanese classmate in the exact |
| `shin__listening-right-three-quarter-glasses__from-codex-019f718c-4a605265.png` | `019f718c-a60d` | Create a single full-body character sprite on a completely flat pure chroma gree |
| `shin__neutral-front-glasses__from-codex-019f718c-b91dc1a0.png` | `019f718c-a60d` | Create a single full-body character sprite on a completely flat pure chroma gree |
| `shin__surprised-left-three-quarter-glasses-no-hat__from-codex-019f7470-c50df5a6.png` | `019f7470-5d88` | transparent visual-novel character sprite. Create Shin, an original reimagined Japanese classmate in the exact |

### `sophie` — 24 file(s)  (0 git · 24 codex)

**From codex generated_images:**

| File | Thread | Prompt (head) |
|---|---|---|
| `sophie__comedic-glasses-no-hat__from-codex-019f73b4-0c9148c9.png` | `019f73b4-02fd` | Generate one coherent comedic Sophie sprite: playful over-the-shoulder half-turn with a gentle wink and an exa |
| `sophie__concerned-glasses__from-codex-019f718d-8a6500fc.png` | `019f718d-12d0` | transparent visual-novel half-body sprite. Create an original fictionalized adult character named Sophie, not  |
| `sophie__determined-glasses__from-codex-019f718d-525979f8.png` | `019f718d-12d0` | transparent visual-novel half-body sprite. Create an original fictionalized adult character named Sophie, not  |
| `sophie__encouraging-glasses__from-codex-019f74cf-725d05ac.png` | `019f74cf-2827` | Use case: style-transfer / identity-preserve. Re-render the provided Sophie char |
| `sophie__encouraging-right-three-quarter__from-codex-019f6809-d2a30f91.png` | `019f6809-715b` | Create Sophie-san as the same exact character and hand-painted visual-novel art style as the reference, in a c |
| `sophie__happy-glasses__from-codex-019f718d-07e27f0b.png` | `019f718d-12d0` | transparent visual-novel half-body sprite. Create an original fictionalized adult character named Sophie, not  |
| `sophie__happy-right-three-quarter-glasses-no-hat__from-codex-019f73b4-12db4e68.png` | `019f73b4-02fd` | Generate Sophie in a happy, welcoming right-three-quarter pose, smiling with bright eyes and one hand raised i |
| `sophie__happy-right-three-quarter__from-codex-019f7390-63ea4291.png` | `019f7390-c49e` | Create a happy right-three-quarter half-body Sophie sprite, bright genuine smile with softly closed eyes, one  |
| `sophie__listening-glasses__from-codex-019f718d-1c741d54.png` | `019f718d-12d0` | transparent visual-novel half-body sprite. Create an original fictionalized adult character named Sophie, not  |
| `sophie__neutral-front__from-codex-019f718b-39f1baa3.png` | `019f718b-af0d` | Create one premium transparent-background visual-novel character sprite in the e |
| `sophie__neutral-front__from-codex-019f7390-2e6868a0.png` | `019f7390-c49e` | Create a neutral front-near-front half-body Sophie sprite, calm attentive expression, shoulders relaxed, hands |
| `sophie__neutral-right-three-quarter-glasses-no-hat__from-codex-019f73b4-3bfae23b.png` | `019f73b4-02fd` | Generate Sophie in a relaxed neutral right-three-quarter alternate pose, one hand resting in a cardigan pocket |
| `sophie__surprised-front-glasses-no-hat__from-codex-019f73b4-d6e596cd.png` | `019f73b4-02fd` | Generate Sophie in a surprised front-near-front pose, eyes widened and brows lifted, shoulders gently raised,  |
| `sophie__surprised-glasses__from-codex-019f718d-9e682e23.png` | `019f718d-12d0` | transparent visual-novel half-body sprite. Create an original fictionalized adult character named Sophie, not  |
| `sophie__surprised-left-three-quarter__from-codex-019f726c-14e5b74e.png` | `019f726c-4cba` | Create one transparent VN character cutout for Sophie, preserving the approved r |
| `sophie__surprised-left-three-quarter__from-codex-019f7390-10384764.png` | `019f7390-c49e` | Create a surprised left-three-quarter half-body Sophie sprite, eyebrows raised and eyes widened naturally, one |
| `sophie__thoughtful-front-glasses-no-hat__from-codex-019f73b4-461f483a.png` | `019f73b4-02fd` | Generate Sophie in a thoughtful front-near-front pose, chin resting lightly on one hand while the other holds  |
| `sophie__thoughtful-glasses__from-codex-019f7390-320b5955.png` | `019f7390-c49e` | Create a thoughtful front-three-quarter half-body Sophie sprite, gaze angled down toward a closed plum sketchb |
| `sophie__thoughtful-left-three-quarter-glasses-no-hat__from-codex-019f73b4-ec2ff4e2.png` | `019f73b4-02fd` | Generate Sophie in a concerned left-three-quarter pose, brows knit softly and mouth thoughtful, hands clasping |
| `sophie__thoughtful-left-three-quarter__from-codex-019f6809-f9825ee1.png` | `019f6809-715b` | Create Sophie-san as the same exact character and painted visual-novel art style as the reference, in a clearl |
| `sophie__thoughtful-left-three-quarter__from-codex-019f7390-80f04987.png` | `019f7390-c49e` | Create a speaking left-three-quarter half-body Sophie sprite, friendly animated explanation with one open palm |
| `sophie__thoughtful-right-three-quarter__from-codex-019f7390-db944f54.png` | `019f7390-c49e` | Create a concerned right-three-quarter half-body Sophie sprite, brows gently knit and lips parted as if checki |
| `sophie__warm__from-codex-019f6708-76e261b8.png` | `019f6708-9dfc` | Create a distinct Japanese bookshop in rainy evening Bloomsbury, London, matching the hand-painted visual-nove |
| `sophie__warm__from-codex-019f6708-9a3c454b.png` | `019f6708-9dfc` | Create a new high-quality half-body Sophie sprite. She is a fellow adult Japanese learner in a small Japanese  |

### `stasi` — 21 file(s)  (10 git · 11 codex)

**From git history:**

| File | Provenance | Original path | Rejected? |
|---|---|---|:--:|
| `stasi__sprite-concerned-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/stasi/stasi__sprite__concerned__halfbody__v2.png` |  |
| `stasi__sprite-determined-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/stasi/stasi__sprite__determined__halfbody__v2.png` |  |
| `stasi__sprite-embarrassed-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/stasi/stasi__sprite__embarrassed__halfbody__v2.png` |  |
| `stasi__sprite-happy-halfbody-v2__from-ce23e6bc8.png` | `ce23e6bc8` | `docs/public/academy/art/characters/stasi/stasi__sprite__happy__halfbody__v2.png` |  |
| `stasi__sprite-laughing-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/stasi/stasi__sprite__laughing__halfbody__v2.png` |  |
| `stasi__sprite-listening-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/stasi/stasi__sprite__listening__halfbody__v2.png` |  |
| `stasi__sprite-neutral-halfbody-v2__from-ce23e6bc8.png` | `ce23e6bc8` | `docs/public/academy/art/characters/stasi/stasi__sprite__neutral__halfbody__v2.png` |  |
| `stasi__sprite-speaking-halfbody-v2__from-ce23e6bc8.png` | `ce23e6bc8` | `docs/public/academy/art/characters/stasi/stasi__sprite__speaking__halfbody__v2.png` |  |
| `stasi__sprite-surprised-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/stasi/stasi__sprite__surprised__halfbody__v2.png` |  |
| `stasi__sprite-thinking-halfbody-v2__from-ce23e6bc8.png` | `ce23e6bc8` | `docs/public/academy/art/characters/stasi/stasi__sprite__thinking__halfbody__v2.png` |  |

**From codex generated_images:**

| File | Thread | Prompt (head) |
|---|---|---|
| `stasi__concerned-left-three-quarter-glasses__from-codex-019f725d-acba2b0d.png` | `019f725d-e71e` | Create one high-resolution VN character sprite candidate based on the attached S |
| `stasi__determined-glasses__from-codex-019f718c-25696df2.png` | `019f718c-e278` | Create a single character sprite on a perfectly flat solid chroma key background |
| `stasi__embarrassed-left-three-quarter-glasses__from-codex-019f725d-892a0141.png` | `019f725d-e71e` | Generate one high-resolution VN sprite candidate from the attached Stasi anchor. |
| `stasi__listening-front-glasses__from-codex-019f725d-90719c49.png` | `019f725d-e71e` | Create one high-resolution VN character sprite candidate based on the attached S |
| `stasi__neutral-glasses__from-codex-019f725d-9c80f0a0.png` | `019f725d-e71e` | Create one transparent-background VN character sprite candidate based on the att |
| `stasi__neutral-right-three-quarter-glasses__from-codex-019f726c-64c8069f.png` | `019f726c-4cba` | Create one transparent VN character cutout for Stasi, preserving her approved re |
| `stasi__surprised-glasses__from-codex-019f718c-6431a9a5.png` | `019f718c-e278` | Create a single character sprite on a perfectly flat solid chroma key background |
| `stasi__thoughtful-glasses__from-codex-019f725d-baf0ef05.png` | `019f725d-e71e` | Generate one high-resolution VN sprite candidate from the attached Stasi anchor. |
| `stasi__warm-front-glasses__from-codex-019f725d-d1576723.png` | `019f725d-e71e` | Generate one high-resolution VN sprite candidate from the attached Stasi anchor. |
| `stasi__warm-right-three-quarter-glasses__from-codex-019f725d-ac536aa2.png` | `019f725d-e71e` | Create one high-resolution VN character sprite candidate based on the attached S |
| `stasi__warm-right-three-quarter-glasses__from-codex-019f725d-f15d7264.png` | `019f725d-e71e` | Generate one high-resolution VN sprite candidate from the attached Stasi anchor. |

### `steve` — 16 file(s)  (4 git · 12 codex)

**From git history:**

| File | Provenance | Original path | Rejected? |
|---|---|---|:--:|
| `steve__sprite-determined-left-three-quarter-v00__from-git-stash.png` | `git-stash` | `docs/public/academy/art/characters/steve/steve__sprite__determined__left-three-quarter__v003.png` |  |
| `steve__sprite-happy-right-three-quarter-v003__from-git-stash.png` | `git-stash` | `docs/public/academy/art/characters/steve/steve__sprite__happy__right-three-quarter__v003.png` |  |
| `steve__sprite-listening-front-near-front-v003__from-git-stash.png` | `git-stash` | `docs/public/academy/art/characters/steve/steve__sprite__listening__front-near-front__v003.png` |  |
| `steve__sprite-neutral-front-near-front-v003__from-git-stash.png` | `git-stash` | `docs/public/academy/art/characters/steve/steve__sprite__neutral__front-near-front__v003.png` |  |

**From codex generated_images:**

| File | Thread | Prompt (head) |
|---|---|---|
| `steve__concerned-glasses__from-codex-019f747f-a6217a39.png` | `019f747f-0917` | Steve concerned in a near-front angle, eyebrows gently knit and mouth softly tense, shoulders slightly drawn i |
| `steve__encouraging-right-three-quarter-glasses__from-codex-019f719d-a2f93699.png` | `019f719d-2ec3` | Academy visual-novel half-body character sprite. Create an original fictionalized adult character named Steve, |
| `steve__listening-right-three-quarter-glasses__from-codex-019f747f-6c8dbf97.png` | `019f747f-0917` | Steve listening attentively in a natural right-three-quarter angle, head slightly inclined toward someone off- |
| `steve__neutral-front-glasses__from-codex-019f7237-7e38174e.png` | `019f7237-d9be` | Create an expression/pose variant of the provided approved Steve character sprite. |
| `steve__neutral-glasses__from-codex-019f7034-231084dc.png` | `019f7034-38d3` | Create the neutral identity anchor for Steve-san, a new older Academy classmate. |
| `steve__neutral-glasses__from-codex-019f719d-7492d0ef.png` | `019f719d-2ec3` | Academy visual-novel half-body character sprite. Create an original fictionalized adult character named Steve, |
| `steve__neutral-glasses__from-codex-019f74c6-c2e6cf1d.png` | `019f74c6-408c` | Use case: identity-preserve + style-transfer. Restyle Image 1 (Felix) into the Y |
| `steve__neutral-left-three-quarter-glasses__from-codex-019f7034-40aff601.png` | `019f7034-38d3` | Create a determined expression variant for Steve-san from his generated neutral identity anchor. |
| `steve__neutral-right-three-quarter-glasses__from-codex-019f7034-0f10924b.png` | `019f7034-38d3` | Create a happy expression variant for Steve-san from his generated neutral identity anchor. |
| `steve__neutral-right-three-quarter-glasses__from-codex-019f7237-dd0607c9.png` | `019f7237-d9be` | Create an expression/pose variant of the provided approved Steve character sprite. |
| `steve__neutral__from-codex-019f718c-339b1afb.png` | `019f718c-ebb7` | Create a single flat #00ff00 chroma-key production sheet containing exactly four |
| `steve__thoughtful-left-three-quarter-glasses__from-codex-019f719d-c52c0de1.png` | `019f719d-2ec3` | Academy visual-novel half-body character sprite. Create an original fictionalized adult character named Steve, |

### `tawapon` — 4 file(s)  (0 git · 4 codex)

**From codex generated_images:**

| File | Thread | Prompt (head) |
|---|---|---|
| `tawapon__determined-left-three-quarter-no-hat__from-codex-019f7474-488623fe.png` | `019f7474-5740` | Tawapon, a friendly young Thai student, abstract likeness only. Create one distinct pose/expression for a cohe |
| `tawapon__happy-right-three-quarter-no-hat__from-codex-019f7474-86d216c6.png` | `019f7474-5740` | Tawapon, a friendly young Thai student, abstract likeness only. Create one distinct pose/expression for a cohe |
| `tawapon__neutral-front-no-hat__from-codex-019f7474-7d9c3f60.png` | `019f7474-5740` | Tawapon, a friendly young Thai student, abstract likeness only. Create one distinct pose/expression for a cohe |
| `tawapon__neutral__from-codex-019f558f-37c8aef7.png` | `019f558f-e9d2` | visual-novel character stage sprite |

### `tom` — 19 file(s)  (9 git · 10 codex)

**From git history:**

| File | Provenance | Original path | Rejected? |
|---|---|---|:--:|
| `tom__sprite-concerned-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/tom/tom__sprite__concerned__halfbody__v2.png` |  |
| `tom__sprite-determined-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/tom/tom__sprite__determined__halfbody__v2.png` |  |
| `tom__sprite-embarrassed-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/tom/tom__sprite__embarrassed__halfbody__v2.png` |  |
| `tom__sprite-happy-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/tom/tom__sprite__happy__halfbody__v2.png` |  |
| `tom__sprite-laughing-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/tom/tom__sprite__laughing__halfbody__v2.png` |  |
| `tom__sprite-listening-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/tom/tom__sprite__listening__halfbody__v2.png` |  |
| `tom__sprite-neutral-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/tom/tom__sprite__neutral__halfbody__v2.png` |  |
| `tom__sprite-surprised-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/tom/tom__sprite__surprised__halfbody__v2.png` |  |
| `tom__sprite-thinking-halfbody-v2__from-c1d61c993.png` | `c1d61c993` | `docs/public/academy/art/characters/tom/tom__sprite__thinking__halfbody__v2.png` |  |

**From codex generated_images:**

| File | Thread | Prompt (head) |
|---|---|---|
| `tom__determined-left-three-quarter-glasses__from-codex-019f718b-351533c2.png` | `019f718b-af0d` | Create one premium transparent-background visual-novel character sprite in the e |
| `tom__encouraging-front__from-codex-019f718c-810c8fe9.png` | `019f718c-b883` | Reimagined fictional adult evening-class character Tom, tall average build, dark-brown hair, reserved and myst |
| `tom__listening-front-glasses__from-codex-019f718b-f33a2336.png` | `019f718b-af0d` | Create one premium transparent-background visual-novel character sprite in the e |
| `tom__neutral-glasses__from-codex-019f7034-671124be.png` | `019f7034-38d3` | Create an encouraging-listening expression variant for second Tom from his generated neutral identity anchor. |
| `tom__neutral-left-three-quarter__from-codex-019f7034-775e239e.png` | `019f7034-38d3` | Create a surprised-shocked expression variant for second Tom from his generated neutral identity anchor. |
| `tom__neutral-right-three-quarter__from-codex-019f718c-abb9e5bc.png` | `019f718c-b883` | Reimagined fictional adult evening-class character Tom, tall average build, dark-brown hair, reserved and myst |
| `tom__neutral__from-codex-019f718c-4f26a0aa.png` | `019f718c-ade6` | Original character sprite, Tom, cheerful blond clean-shaven adult man with a ful |
| `tom__surprised-left-three-quarter__from-codex-019f718c-8b29fec5.png` | `019f718c-b883` | Reimagined fictional adult evening-class character Tom, tall average build, dark-brown hair, reserved and myst |
| `tom__surprised__from-codex-019f718c-b781be6d.png` | `019f718c-ade6` | Original character sprite, Tom, cheerful blond clean-shaven adult man with a ful |
| `tom__thoughtful__from-codex-019f718c-1d854a40.png` | `019f718c-ade6` | Original character sprite, Tom, cheerful blond clean-shaven adult man with a ful |

### `tom2` — 6 file(s)  (0 git · 6 codex)

**From codex generated_images:**

| File | Thread | Prompt (head) |
|---|---|---|
| `tom2__listening-front__from-codex-019f718b-e373e468.png` | `019f718b-af0d` | Create one premium transparent-background visual-novel character sprite in the e |
| `tom2__neutral-front__from-codex-019f719d-37d3e73f.png` | `019f719d-32d6` | Create one original fictionalized adult male character sprite named Tom2, reimagined for a Japanese evening-cl |
| `tom2__neutral-left-three-quarter__from-codex-019f718b-de6fe050.png` | `019f718b-af0d` | Create one premium transparent-background visual-novel character sprite in the e |
| `tom2__neutral-right-three-quarter__from-codex-019f718b-1ceb6532.png` | `019f718b-af0d` | Create one premium transparent-background visual-novel character sprite in the e |
| `tom2__surprised-left-three-quarter__from-codex-019f719d-03c6ccce.png` | `019f719d-32d6` | Create one original fictionalized adult male character sprite named Tom2, reimagined for a Japanese evening-cl |
| `tom2__thoughtful-right-three-quarter__from-codex-019f719d-b7a6a1e4.png` | `019f719d-32d6` | Create one original fictionalized adult male character sprite named Tom2, reimagined for a Japanese evening-cl |

### `xingyu` — 1 file(s)  (1 git · 0 codex)

**From git history:**

| File | Provenance | Original path | Rejected? |
|---|---|---|:--:|
| `xingyu__neutral-halfbody-v001__from-56cb7fef3.png` | `56cb7fef3` | `docs/public/academy/art/characters/xingyu/xingyu__neutral__halfbody__v001.png` |  |

### `_misc` — 1 file(s)  (1 git · 0 codex)

**From git history:**

| File | Provenance | Original path | Rejected? |
|---|---|---|:--:|
| `_misc__contact-sheet__from-5c493bc45.png` | `5c493bc45` | `docs/academy/art/codex-production-v2/sprites/CONTACT-SHEET.png` |  |

### `_unattributed` — 205 file(s)  (0 git · 205 codex)

**From codex generated_images:**

| File | Thread | Prompt (head) |
|---|---|---|
| `_unattributed__adult-american-businessman-in-his-late-2__concerned__from-codex-019f53da-8cb9f9f5.png` | `019f53da-a410` | Half-body visual-novel stage sprite of adult American businessman in his late 20 |
| `_unattributed__adult-american-businessman-in-his-late-2__laughing__from-codex-019f53d4-32245824.png` | `019f53d4-bc10` | Half-body visual-novel stage sprite of adult American businessman in his late 20 |
| `_unattributed__adult-american-businessman-in-his-late-2__neutral__from-codex-019f5334-3e39d1b0.png` | `019f5334-e6d6` | Half-body visual-novel stage sprite of an adult American businessman in his late |
| `_unattributed__adult-american-businessman-in-his-late-2__neutral__from-codex-019f5334-4d352698.png` | `019f5334-da73` | Half-body visual-novel stage sprite of an adult American businessman in his late |
| `_unattributed__adult-american-businessman-in-his-late-2__neutral__from-codex-019f5334-c8235742.png` | `019f5334-eb2d` | Half-body visual-novel stage sprite of an adult American businessman in his late |
| `_unattributed__adult-american-businessman-in-his-late-2__neutral__from-codex-019f5588-820bfde3.png` | `019f5588-363e` | Half-body visual-novel stage sprite of an adult American businessman in his late |
| `_unattributed__adult-american-businessman-in-his-late-2__neutral__from-codex-019f558a-f34fc5c1.png` | `019f558a-cc94` | Half-body visual-novel stage sprite of an adult American businessman in his late |
| `_unattributed__adult-american-businessman-in-his-late-2__neutral__from-codex-019f558d-8ad9e1a6.png` | `019f558d-572c` | Half-body visual-novel stage sprite of an adult American businessman in his late |
| `_unattributed__adult-american-businessman-in-his-late-2__neutral__from-codex-019f5597-6b0c239f.png` | `019f5597-083b` | Create a half-body visual-novel stage sprite of an adult American businessman in his late 20s working at IMC.  |
| `_unattributed__adult-american-businessman-in-his-late-2__surprised__from-codex-019f53d9-2d357fe7.png` | `019f53d9-60aa` | Half-body visual-novel stage sprite of adult American businessman in his late 20 |
| `_unattributed__adult-american-businessman-in-his-late-2__thinking__from-codex-019f53d7-afa3412a.png` | `019f53d7-d600` | Half-body visual-novel stage sprite of adult American businessman in his late 20 |
| `_unattributed__adult-japanese-woman-teacher-in-her-earl__neutral__from-codex-019f53e5-fe487865.png` | `019f53e5-88cf` | Half-body visual-novel stage sprite of adult Japanese woman teacher in her early |
| `_unattributed__adult-japanese-woman-teacher-in-her-late__neutral__from-codex-019f5334-03b9253f.png` | `019f5334-5db4` | Half-body visual-novel stage sprite of adult Japanese woman teacher in her late |
| `_unattributed__adult-japanese-woman-teacher-in-her-late__neutral__from-codex-019f533b-6509c554.png` | `019f533b-4b3b` | Half-body visual-novel stage sprite of adult Japanese woman teacher in her late |
| `_unattributed__adult-japanese-woman-teacher-in-her-late__neutral__from-codex-019f5589-2e2adbf3.png` | `019f5589-877f` | Generate a single centered half-body visual-novel stage sprite of an adult Japanese woman teacher in her late  |
| `_unattributed__adult-thai-university-student-man-in-his__neutral__from-codex-019f5334-225c64a6.png` | `019f5334-eb2f` | Half-body visual-novel stage sprite of an adult Thai university student man in h |
| `_unattributed__adult-thai-university-student-man-in-his__neutral__from-codex-019f533a-12805409.png` | `019f533a-333c` | Half-body visual-novel stage sprite of an adult Thai university student man in h |
| `_unattributed__adult-thai-university-student-man-in-his__neutral__from-codex-019f533a-7f734cb9.png` | `019f533a-2255` | Half-body visual-novel stage sprite of an adult Thai university student man in h |
| `_unattributed__bright-adult-east-asian-woman-of-chinese__neutral__from-codex-019f5339-7397c1d7.png` | `019f5339-82be` | Half-body visual-novel stage sprite of bright adult East-Asian woman of Chinese/ |
| `_unattributed__bright-adult-east-asian-woman-of-chinese__neutral__from-codex-019f533b-e4bcd47f.png` | `019f533b-b03d` | Half-body visual-novel stage sprite of bright adult East-Asian woman of Chinese/ |
| `_unattributed__bright-adult-east-asian-woman-of-chinese__neutral__from-codex-019f533e-15dc061f.png` | `019f533e-3c9b` | Half-body visual-novel stage sprite of bright adult East-Asian woman of Chinese/ |
| `_unattributed__bright-adult-east-asian-woman-of-chinese__neutral__from-codex-019f5340-0f188dd4.png` | `019f5340-801a` | Half-body visual-novel stage sprite of bright adult East-Asian woman of Chinese/ |
| `_unattributed__bright-adult-east-asian-woman-of-chinese__neutral__from-codex-019f5344-f9723d0e.png` | `019f5344-762b` | Half-body visual-novel stage sprite of bright adult East-Asian woman of Chinese/ |
| `_unattributed__bright-adult-east-asian-woman-of-chinese__neutral__from-codex-019f5347-bdec5e47.png` | `019f5347-615c` | Half-body visual-novel stage sprite of bright adult East-Asian woman of Chinese/ |
| `_unattributed__bright-adult-east-asian-woman-of-chinese__neutral__from-codex-019f5349-6bdfc5c3.png` | `019f5349-f343` | Half-body visual-novel stage sprite of bright adult East-Asian woman of Chinese/ |
| `_unattributed__bright-adult-east-asian-woman-of-chinese__neutral__from-codex-019f534b-87669ea3.png` | `019f534b-7249` | Half-body visual-novel stage sprite of bright adult East-Asian woman of Chinese/ |
| `_unattributed__bright-adult-east-asian-woman-of-chinese__neutral__from-codex-019f534c-c2f856d9.png` | `019f534c-faf7` | Half-body visual-novel stage sprite of bright adult East-Asian woman of Chinese/ |
| `_unattributed__calm-ordinary-adult-white-man-in-his-lat__neutral__from-codex-019f5334-a53628cd.png` | `019f5334-da74` | Half-body visual-novel stage sprite of calm ordinary adult White man in his late |
| `_unattributed__calm-ordinary-adult-white-man-in-his-lat__neutral__from-codex-019f5338-d08c2440.png` | `019f5338-3c8e` | Half-body visual-novel stage sprite of calm ordinary adult White man in his late |
| `_unattributed__cheerful-adult-white-man-in-his-mid-20s__neutral__from-codex-019f5335-8570b39c.png` | `019f5335-98fa` | Half-body visual-novel stage sprite of cheerful adult White man in his mid-20s; |
| `_unattributed__cheerful-adult-white-man-in-his-mid-20s__neutral__from-codex-019f533b-692f9525.png` | `019f533b-27ed` | Half-body visual-novel stage sprite of cheerful adult White man in his mid-20s; |
| `_unattributed__cheerful-adult-white-man-in-his-mid-20s__neutral__from-codex-019f533e-8c9144a9.png` | `019f533e-fae1` | Half-body visual-novel stage sprite of cheerful adult White man in his mid-20s; |
| `_unattributed__cheerful-adult-white-man-in-his-mid-20s__neutral__from-codex-019f5343-bf545855.png` | `019f5343-b969` | Half-body visual-novel stage sprite of cheerful adult White man in his mid-20s; |
| `_unattributed__clever-warm-adult-east-asian-man-in-his-__neutral__from-codex-019f5338-3550260d.png` | `019f5338-3bae` | Half-body visual-novel stage sprite of clever warm adult East-Asian man in his l |
| `_unattributed__clever-warm-adult-east-asian-man-in-his-__neutral__from-codex-019f5357-c819035b.png` | `019f5357-4995` | Half-body visual-novel stage sprite of clever warm adult East-Asian man in his l |
| `_unattributed__clever-warm-adult-east-asian-man-in-his-__neutral__from-codex-019f5359-4b085f32.png` | `019f5359-0f27` | Half-body visual-novel stage sprite of clever warm adult East-Asian man in his l |
| `_unattributed__clever-warm-adult-east-asian-man-in-his-__neutral__from-codex-019f535a-a1c6ffdd.png` | `019f535a-97d9` | Half-body visual-novel stage sprite of clever warm adult East-Asian man in his l |
| `_unattributed__clever-warm-adult-east-asian-man-in-his-__neutral__from-codex-019f535b-20cc620f.png` | `019f535b-e1da` | Half-body visual-novel stage sprite of clever warm adult East-Asian man in his l |
| `_unattributed__clever-warm-adult-east-asian-man-in-his-__neutral__from-codex-019f535d-6e628d53.png` | `019f535d-25df` | Half-body visual-novel stage sprite of clever warm adult East-Asian man in his l |
| `_unattributed__clever-warm-adult-east-asian-man-in-his-__neutral__from-codex-019f535e-31e3c154.png` | `019f535e-f944` | Half-body visual-novel stage sprite of clever warm adult East-Asian man in his l |
| `_unattributed__clever-warm-adult-east-asian-man-in-his-__neutral__from-codex-019f5360-ae964584.png` | `019f5360-2475` | Half-body visual-novel stage sprite of clever warm adult East-Asian man in his l |
| `_unattributed__clever-warm-adult-east-asian-man-in-his-__neutral__from-codex-019f5362-2a082b2a.png` | `019f5362-b129` | Half-body visual-novel stage sprite of clever warm adult East-Asian man in his l |
| `_unattributed__clever-warm-adult-east-asian-man-in-his-__neutral__from-codex-019f5364-648e87ea.png` | `019f5364-426d` | Half-body visual-novel stage sprite of clever warm adult East-Asian man in his l |
| `_unattributed__earnest-fit-adult-black-man-in-his-late-__neutral__from-codex-019f5336-0d5aad95.png` | `019f5336-5127` | Half-body visual-novel stage sprite of earnest fit adult Black man in his late 2 |
| `_unattributed__earnest-fit-adult-black-man-in-his-late-__neutral__from-codex-019f5339-ae6371c6.png` | `019f5339-6ead` | Half-body visual-novel stage sprite of earnest fit adult Black man in his late 2 |
| `_unattributed__earnest-fit-adult-black-man-in-his-late-__neutral__from-codex-019f533b-970e92f4.png` | `019f533b-c2f2` | Half-body visual-novel stage sprite of earnest fit adult Black man in his late 2 |
| `_unattributed__earnest-fit-adult-black-man-in-his-late-__neutral__from-codex-019f533e-f39bf314.png` | `019f533e-2b3b` | Half-body visual-novel stage sprite of earnest fit adult Black man in his late 2 |
| `_unattributed__earnest-fit-adult-black-man-in-his-late-__neutral__from-codex-019f5340-b118dd10.png` | `019f5340-bde2` | Half-body visual-novel stage sprite of earnest fit adult Black man in his late 2 |
| `_unattributed__earnest-fit-adult-black-man-in-his-late-__neutral__from-codex-019f5343-3b800932.png` | `019f5343-bb2e` | Half-body visual-novel stage sprite of earnest fit adult Black man in his late 2 |
| `_unattributed__earnest-fit-adult-black-man-in-his-late-__neutral__from-codex-019f5345-9b47f4cf.png` | `019f5345-f267` | Half-body visual-novel stage sprite of earnest fit adult Black man in his late 2 |
| `_unattributed__earnest-fit-adult-black-man-in-his-late-__neutral__from-codex-019f5348-81ca071e.png` | `019f5348-7a85` | Half-body visual-novel stage sprite of earnest fit adult Black man in his late 2 |
| `_unattributed__earnest-fit-adult-black-man-in-his-late-__neutral__from-codex-019f534a-21227f04.png` | `019f534a-40ce` | Half-body visual-novel stage sprite of earnest fit adult Black man in his late 2 |
| `_unattributed__friendly-adult-white-man-in-his-late-20s__neutral__from-codex-019f5329-d2d495bb.png` | `019f5329-3f1e` | Half-body visual-novel stage sprite of friendly adult White man in his late 20s; |
| `_unattributed__friendly-adult-white-man-in-his-late-20s__neutral__from-codex-019f5335-f57b558d.png` | `019f5335-5f7a` | Half-body visual-novel stage sprite of friendly adult White man in his late 20s; |
| `_unattributed__gentle-adult-white-man-in-his-late-20s__neutral__from-codex-019f5338-1a6da418.png` | `019f5338-3bb1` | Half-body visual-novel stage sprite of gentle adult White man in his late 20s; s |
| `_unattributed__gentle-adult-white-man-in-his-late-20s__neutral__from-codex-019f533b-e768bac7.png` | `019f533b-3cfc` | Half-body visual-novel stage sprite of gentle adult White man in his late 20s; s |
| `_unattributed__gentle-adult-white-man-in-his-late-20s__neutral__from-codex-019f533d-a1277b71.png` | `019f533d-0224` | Half-body visual-novel stage sprite of gentle adult White man in his late 20s; s |
| `_unattributed__gentle-adult-white-man-in-his-late-20s__neutral__from-codex-019f533f-49af7ea2.png` | `019f533f-4199` | Half-body visual-novel stage sprite of gentle adult White man in his late 20s; s |
| `_unattributed__gentle-adult-white-man-in-his-late-20s__neutral__from-codex-019f5341-15564990.png` | `019f5341-ea53` | Half-body visual-novel stage sprite of gentle adult White man in his late 20s; s |
| `_unattributed__gentle-adult-white-man-in-his-late-20s__neutral__from-codex-019f5344-8e0e0b09.png` | `019f5344-2674` | Half-body visual-novel stage sprite of gentle adult White man in his late 20s; s |
| `_unattributed__gentle-adult-white-man-in-his-late-20s__neutral__from-codex-019f5359-c8c6209f.png` | `019f5359-f31d` | Half-body visual-novel stage sprite of gentle adult White man in his late 20s; s |
| `_unattributed__gentle-adult-white-man-in-his-late-20s__neutral__from-codex-019f535b-5ca19aab.png` | `019f535b-a7f1` | Half-body visual-novel stage sprite of gentle adult White man in his late 20s; s |
| `_unattributed__japanese-man-in-his-mid-50s__neutral__from-codex-019f5404-b5e2dcb0.png` | `019f5404-858e` | Half-body visual-novel stage sprite of Japanese man in his mid-50s, gentle heavy |
| `_unattributed__japanese-man-in-his-mid-50s__neutral__from-codex-019f5407-2e2d5f4c.png` | `019f5407-867a` | Half-body visual-novel stage sprite of Japanese man in his mid-50s, noticeably h |
| `_unattributed__japanese-man-in-his-mid-50s__neutral__from-codex-019f540b-cdc4beba.png` | `019f540b-4f30` | Half-body visual-novel stage sprite of Japanese man in his mid-50s, noticeably h |
| `_unattributed__japanese-man-in-his-mid-50s__neutral__from-codex-019f540d-8bff55c7.png` | `019f540d-62ac` | Half-body visual-novel stage sprite of Japanese man in his mid-50s, noticeably h |
| `_unattributed__japanese-man-in-his-mid-50s__neutral__from-codex-019f540f-6d533830.png` | `019f540f-7317` | Half-body visual-novel stage sprite of Japanese man in his mid-50s, noticeably h |
| `_unattributed__japanese-man-in-his-mid-50s__neutral__from-codex-019f5411-802b2860.png` | `019f5411-79a7` | Half-body visual-novel stage sprite of Japanese man in his mid-50s, noticeably h |
| `_unattributed__japanese-man-in-his-mid-50s__neutral__from-codex-019f5413-1506c515.png` | `019f5413-8263` | Half-body visual-novel stage sprite of Japanese man in his mid-50s, noticeably h |
| `_unattributed__japanese-man-in-his-mid-50s__neutral__from-codex-019f5415-fbbc021f.png` | `019f5415-538e` | Half-body visual-novel stage sprite of Japanese man in his mid-50s, noticeably h |
| `_unattributed__japanese-man-in-his-mid-50s__neutral__from-codex-019f5417-e39b874f.png` | `019f5417-5b11` | Half-body visual-novel stage sprite of Japanese man in his mid-50s, noticeably h |
| `_unattributed__japanese-man-in-his-mid-50s__neutral__from-codex-019f5419-235cd51d.png` | `019f5419-39c5` | Half-body visual-novel stage sprite of Japanese man in his mid-50s, noticeably h |
| `_unattributed__japanese-man-in-his-mid-50s__neutral__from-codex-019f541b-712b3bb4.png` | `019f541b-3554` | Half-body visual-novel stage sprite of Japanese man in his mid-50s, noticeably h |
| `_unattributed__quiet-adult-man-in-his-early-20s__neutral__from-codex-019f533c-21be9064.png` | `019f533c-126e` | Half-body visual-novel stage sprite of a quiet adult man in his early 20s; short |
| `_unattributed__quiet-adult-man-in-his-early-20s__neutral__from-codex-019f5340-02149ef5.png` | `019f5340-9d00` | Half-body visual-novel stage sprite of a quiet adult man in his early 20s; short |
| `_unattributed__quiet-adult-man-in-his-early-20s__neutral__from-codex-019f5340-2df612a6.png` | `019f5340-9fc0` | Half-body visual-novel stage sprite of a quiet adult man in his early 20s; short |
| `_unattributed__quiet-adult-man-in-his-early-20s__neutral__from-codex-019f5340-43306a5f.png` | `019f5340-a04c` | Half-body visual-novel stage sprite of a quiet adult man in his early 20s; short |
| `_unattributed__quiet-adult-man-in-his-early-20s__neutral__from-codex-019f5340-45971445.png` | `019f5340-a065` | Half-body visual-novel stage sprite of a quiet adult man in his early 20s; short |
| `_unattributed__quiet-adult-man-in-his-early-20s__neutral__from-codex-019f5340-767e683c.png` | `019f5340-9cc8` | Half-body visual-novel stage sprite of a quiet adult man in his early 20s; short |
| `_unattributed__quiet-adult-man-in-his-early-20s__neutral__from-codex-019f5340-81f33f27.png` | `019f5340-9ff3` | Half-body visual-novel stage sprite of a quiet adult man in his early 20s; short |
| `_unattributed__quiet-adult-man-in-his-early-20s__neutral__from-codex-019f5340-a9a762d8.png` | `019f5340-9e04` | Half-body visual-novel stage sprite of a quiet adult man in his early 20s; short |
| `_unattributed__quiet-adult-man-in-his-early-20s__neutral__from-codex-019f5340-c9972734.png` | `019f5340-9f31` | Half-body visual-novel stage sprite of a quiet adult man in his early 20s; short |
| `_unattributed__quiet-adult-man-in-his-early-20s__neutral__from-codex-019f5340-e7e9fa30.png` | `019f5340-9dd3` | Half-body visual-novel stage sprite of a quiet adult man in his early 20s; short |
| `_unattributed__same-adult-japanese-woman-teacher-shown-__neutral__from-codex-019f558e-56db68a9.png` | `019f558e-ef4f` | visual-novel character stage sprite. |
| `_unattributed__same-adult-japanese-woman-teacher-shown-__neutral__from-codex-019f5590-9d984c83.png` | `019f5590-3216` | Generate a half-body visual-novel stage sprite of the same adult Japanese woman teacher shown in the two refer |
| `_unattributed__sporty-adult-white-man-in-his-mid-20s__neutral__from-codex-019f5334-fc4e43d9.png` | `019f5334-da74` | Half-body visual-novel stage sprite of sporty adult White man in his mid-20s; sh |
| `_unattributed__sporty-adult-white-man-in-his-mid-20s__neutral__from-codex-019f5338-e178ad61.png` | `019f5338-65fa` | Half-body visual-novel stage sprite of sporty adult White man in his mid-20s; sh |
| `_unattributed__sprite__concerned__from-codex-019f74da-67782332.png` | `019f74da-a6bc` | Re-render Image 1 into Image 2's painted finish. Change only the rendering style, material treatment, palette  |
| `_unattributed__sprite__determined__from-codex-019f5593-15344be0.png` | `019f5593-d1cb` | flat cel-shaded visual-novel character stage sprite. |
| `_unattributed__sprite__determined__from-codex-019f725d-c567278a.png` | `019f725d-28be` | Yomu Academy visual-novel character sprite, isolated transparent cutout via a pe |
| `_unattributed__sprite__determined__from-codex-019f725d-dba086f1.png` | `019f725d-28be` | Create a transparent Yomu Academy VN sprite on a perfectly flat #00ff00 chroma b |
| `_unattributed__sprite__determined__from-codex-019f74dc-ef7a6e9e.png` | `019f74dc-6479` | Use case: identity-preserve + style-transfer + background-extraction. Image 1 is |
| `_unattributed__sprite__embarrassed__from-codex-019f5595-b423d931.png` | `019f5595-8f0f` | half-body visual-novel stage sprite. |
| `_unattributed__sprite__happy__from-codex-019f725d-675d3cec.png` | `019f725d-28be` | Create a transparent Yomu Academy VN sprite on a perfectly flat #00ff00 chroma b |
| `_unattributed__sprite__happy__from-codex-019f725d-afa26975.png` | `019f725d-28be` | Yomu Academy visual-novel character sprite, isolated transparent cutout via a pe |
| `_unattributed__sprite__laughing__from-codex-019f74d2-911feb9a.png` | `019f74d2-e3da` | Use case: identity-preserve + style-transfer. Edit Image 1, the bearded South As |
| `_unattributed__sprite__listening__from-codex-019f5174-4af62db6.png` | `019f5174-67db` | Original wide 16:9 over-the-shoulder scene at a rain-window classroom table. Two adult learners sit on opposit |
| `_unattributed__sprite__listening__from-codex-019f725d-44872828.png` | `019f725d-28be` | Create a transparent Yomu Academy VN sprite on a perfectly flat #00ff00 chroma b |
| `_unattributed__sprite__listening__from-codex-019f725d-b99aff8a.png` | `019f725d-28be` | Yomu Academy visual-novel character sprite, isolated transparent cutout via a pe |
| `_unattributed__sprite__listening__from-codex-019f74d5-4b3cf697.png` | `019f74d5-2059` | Use case: style-transfer + background-extraction. Edit Image 1 (the bearded Sout |
| `_unattributed__sprite__neutral__from-codex-019f5588-d78a6a25.png` | `019f5588-43a5` | Create a new expression variant of this same adult Thai university student man in his early 20s. He is gently  |
| `_unattributed__sprite__neutral__from-codex-019f558a-a27d6897.png` | `019f558a-cec3` | Create a new expression variant of the same character: quietly determined, focused steady eyes, firm mouth, na |
| `_unattributed__sprite__neutral__from-codex-019f558c-35244e77.png` | `019f558c-98d3` | Generate a new expression variant of the attached character, matching the identity, hairstyle, facial structur |
| `_unattributed__sprite__neutral__from-codex-019f558c-464c3fe5.png` | `019f558c-57a8` | Create a new expression variant of the same adult Thai university student man in his early 20s. He has short b |
| `_unattributed__sprite__neutral__from-codex-019f558e-f7074d14.png` | `019f558e-5105` | laughing warmly with eyes crinkled and head tilted slightly back. Natural relaxed posture, empty hands, center |
| `_unattributed__sprite__neutral__from-codex-019f558f-ee0125a9.png` | `019f558f-0d4e` | visual-novel stage sprite |
| `_unattributed__sprite__neutral__from-codex-019f5593-1820d51f.png` | `019f5593-c8b5` | visual-novel half-body stage sprite. |
| `_unattributed__sprite__neutral__from-codex-019f5595-fe03e70b.png` | `019f5595-004b` | Generate a new worried/concerned expression variant of this same adult Japanese woman teacher, matching the es |
| `_unattributed__sprite__neutral__from-codex-019f725d-f36c7bae.png` | `019f725d-28be` | Yomu Academy visual-novel character sprite, isolated transparent cutout via a pe |
| `_unattributed__sprite__neutral__from-codex-019f74cd-a00209bd.png` | `019f74cd-a8dc` | Restyle Image 1 into the painted Yomu Academy house style of Image 2. Preserve the same adult South Asian bear |
| `_unattributed__sprite__surprised__from-codex-019f74d5-301a28f6.png` | `019f74d5-caba` | Use case: style-transfer / identity-preserve / background-extraction. Edit Image |
| `_unattributed__sprite__surprised__from-codex-019f74d5-64562b8c.png` | `019f74d5-caba` | Edit Image 1 and preserve its identity, pose, wardrobe, props, surprised express |
| `_unattributed__sprite__surprised__from-codex-019f74e4-734cc947.png` | `019f74e4-debc` | Restyle the bearded South Asian adult man from Image 1 into the warm, paper-painted semi-realistic visual-nove |
| `_unattributed__sprite__thoughtful__from-codex-019f74d7-e1581573.png` | `019f74d7-0ede` | Yomu Academy character sprite, transparent PNG cutout. |
| `_unattributed__sprite__warm__from-codex-019f5174-0dd5579a.png` | `019f5174-67db` | Original portrait 4:5 close composition of a travel-ready tote on a wooden bench beside a rain-window. A simpl |
| `_unattributed__sprite__warm__from-codex-019f5174-e199cfdc.png` | `019f5174-67db` | An original portrait 4:5 view of the same fictional rain-wet central London route world: stand at a broad corn |
| `_unattributed__sprite__warm__from-codex-019f74d0-71298fa1.png` | `019f74d0-60e3` | Use case: style-transfer / identity-preserve. Edit Image 1 (the bearded South As |
| `_unattributed__sprite__warm__from-codex-019f74df-b14d57d1.png` | `019f74df-4f68` | Strictly edit Image 1, using Image 2 only as style reference. Preserve the beard |
| `_unattributed__sprite__warm__from-codex-019f74df-c5109d6d.png` | `019f74df-4f68` | Restyle Image 1 into Image 2's warm, paper-painted semi-realistic visual-novel anime house style. This is a st |
| `_unattributed__stylish-adult-south-asian-man-in-his-lat__neutral__from-codex-019f5334-0ae84d87.png` | `019f5334-e70e` | Half-body visual-novel stage sprite of stylish adult South-Asian man in his late |
| `_unattributed__stylish-adult-south-asian-man-in-his-lat__neutral__from-codex-019f5338-93546bb2.png` | `019f5338-64bc` | Half-body visual-novel stage sprite of stylish adult South-Asian man in his late |
| `_unattributed__warm-adult-man-in-his-early-40s__neutral__from-codex-019f533c-59e83fb0.png` | `019f533c-125d` | Half-body visual-novel stage sprite of a warm adult man in his early 40s; brown |
| `_unattributed__warm-adult-man-in-his-early-40s__neutral__from-codex-019f5340-4391f942.png` | `019f5340-9e20` | Half-body visual-novel stage sprite of a warm adult man in his early 40s; brown |
| `_unattributed__warm-adult-man-in-his-early-40s__neutral__from-codex-019f5340-5c387397.png` | `019f5340-a039` | Half-body visual-novel stage sprite of a warm adult man in his early 40s; brown |
| `_unattributed__warm-adult-man-in-his-early-40s__neutral__from-codex-019f5340-6c650ffa.png` | `019f5340-9da5` | Half-body visual-novel stage sprite of a warm adult man in his early 40s; brown |
| `_unattributed__warm-adult-man-in-his-early-40s__neutral__from-codex-019f5340-a8f18e2a.png` | `019f5340-9f88` | Half-body visual-novel stage sprite of a warm adult man in his early 40s; brown |
| `_unattributed__warm-adult-man-in-his-early-40s__neutral__from-codex-019f5340-b4944dba.png` | `019f5340-9bd2` | Half-body visual-novel stage sprite of a warm adult man in his early 40s; brown |
| `_unattributed__warm-adult-man-in-his-early-40s__neutral__from-codex-019f5340-b72f40b7.png` | `019f5340-9cbb` | Half-body visual-novel stage sprite of a warm adult man in his early 40s; brown |
| `_unattributed__warm-adult-man-in-his-early-40s__neutral__from-codex-019f5340-b9ba1cf9.png` | `019f5340-9cd1` | Half-body visual-novel stage sprite of a warm adult man in his early 40s; brown |
| `_unattributed__warm-adult-man-in-his-early-40s__neutral__from-codex-019f5340-cba1830b.png` | `019f5340-9e1c` | Half-body visual-novel stage sprite of a warm adult man in his early 40s; brown |
| `_unattributed__warm-adult-man-in-his-early-40s__neutral__from-codex-019f5340-fb086877.png` | `019f5340-9f1a` | Half-body visual-novel stage sprite of a warm adult man in his early 40s; brown |
| `_unattributed__white-british-woman-in-her-mid-to-late-2__concerned__from-codex-019f53e9-9e73ce12.png` | `019f53e9-ef32` | Half-body visual-novel stage sprite of a White British woman in her mid-to-late |
| `_unattributed__white-british-woman-in-her-mid-to-late-2__determined__from-codex-019f53eb-7d7af518.png` | `019f53eb-c857` | Half-body visual-novel stage sprite of a White British woman in her mid-to-late |
| `_unattributed__white-british-woman-in-her-mid-to-late-2__happy__from-codex-019f53df-067d672b.png` | `019f53df-f072` | Half-body visual-novel stage sprite of a White British woman in her mid-to-late |
| `_unattributed__white-british-woman-in-her-mid-to-late-2__laughing__from-codex-019f53e2-e7e4a3bb.png` | `019f53e2-7389` | Half-body visual-novel stage sprite of a White British woman in her mid-to-late |
| `_unattributed__white-british-woman-in-her-mid-to-late-2__listening__from-codex-019f53f9-3f2daf2e.png` | `019f53f9-d144` | Half-body visual-novel stage sprite of a White British woman in her mid-to-late |
| `_unattributed__white-british-woman-in-her-mid-to-late-2__neutral__from-codex-019f53d8-a3e25d4e.png` | `019f53d8-8cc9` | Half-body visual-novel stage sprite of a White British woman in her mid-to-late |
| `_unattributed__white-british-woman-in-her-mid-to-late-2__speaking__from-codex-019f53f3-b38ad0ec.png` | `019f53f3-6c3c` | Half-body visual-novel stage sprite of a White British woman in her mid-to-late |
| `_unattributed__white-british-woman-in-her-mid-to-late-2__surprised__from-codex-019f53e8-d94e4342.png` | `019f53e8-2925` | Half-body visual-novel stage sprite of a White British woman in her mid-to-late |
| `_unattributed__white-british-woman-in-her-mid-to-late-2__thinking__from-codex-019f53e5-eb9fa9c7.png` | `019f53e5-7169` | Half-body visual-novel stage sprite of a White British woman in her mid-to-late |
| `_unattributed__white-british-woman-in-her-mid-to-late-2__warm__from-codex-019f53ee-b07d51cf.png` | `019f53ee-ace3` | Half-body visual-novel stage sprite of a White British woman in her mid-to-late |
| `_unattributed__young-adult-east-asian-woman-in-her-earl__neutral__from-codex-019f5338-c0e05e03.png` | `019f5338-3def` | Half-body visual-novel stage sprite of a young adult East Asian woman in her ear |
| `_unattributed__young-adult-east-asian-woman-in-her-earl__neutral__from-codex-019f5358-8b0e09c2.png` | `019f5358-e0bc` | Half-body visual-novel stage sprite of a young adult East Asian woman in her ear |
| `_unattributed__young-adult-east-asian-woman-in-her-earl__neutral__from-codex-019f535b-08cea72f.png` | `019f535b-3744` | Half-body visual-novel stage sprite of a young adult East Asian woman in her ear |
| `_unattributed__young-adult-east-asian-woman-in-her-earl__neutral__from-codex-019f535d-c694ea42.png` | `019f535d-a853` | Half-body visual-novel stage sprite of a young adult East Asian woman in her ear |
| `_unattributed__young-adult-east-asian-woman-in-her-earl__neutral__from-codex-019f535f-7fd9b1a5.png` | `019f535f-3768` | Half-body visual-novel stage sprite of a young adult East Asian woman in her ear |
| `_unattributed__young-adult-east-asian-woman-in-her-earl__neutral__from-codex-019f5361-f8511759.png` | `019f5361-c953` | Half-body visual-novel stage sprite of a young adult East Asian woman in her ear |
| `_unattributed__young-adult-east-asian-woman-in-her-earl__neutral__from-codex-019f5364-ae7d6cf8.png` | `019f5364-16dc` | Half-body visual-novel stage sprite of a young adult East Asian woman in her ear |
| `_unattributed__young-adult-east-asian-woman-in-her-earl__neutral__from-codex-019f5365-378db3a9.png` | `019f5365-c805` | Half-body visual-novel stage sprite of a young adult East Asian woman in her ear |
| `_unattributed__young-adult-east-asian-woman-in-her-earl__neutral__from-codex-019f5367-eeef1bab.png` | `019f5367-7a39` | Half-body visual-novel stage sprite of a young adult East Asian woman in her ear |
| `_unattributed__young-adult-east-asian-woman-in-her-earl__neutral__from-codex-019f536a-96f95f79.png` | `019f536a-54ac` | Half-body visual-novel stage sprite of a young adult East Asian woman in her ear |
| `_unattributed__young-adult-japanese-man-in-his-early-20__neutral__from-codex-019f53ed-a6d725de.png` | `019f53ed-30cd` | Half-body visual-novel stage sprite of young adult Japanese man in his early 20s |
| `_unattributed__young-adult-japanese-man-in-his-early-20__neutral__from-codex-019f53f0-8e8ec496.png` | `019f53f0-9eca` | Half-body visual-novel stage sprite of young adult Japanese man in his early 20s |
| `_unattributed__young-adult-japanese-man-in-his-early-20__neutral__from-codex-019f53f2-159cbf1f.png` | `019f53f2-959e` | Half-body visual-novel stage sprite of young adult Japanese man in his early 20s |
| `_unattributed__young-adult-japanese-man-in-his-early-20__neutral__from-codex-019f53f4-6dcf9464.png` | `019f53f4-a188` | Half-body visual-novel stage sprite of young adult Japanese man in his early 20s |
| `_unattributed__young-adult-japanese-man-in-his-early-20__neutral__from-codex-019f53f6-25ebe22b.png` | `019f53f6-8213` | Half-body visual-novel stage sprite of young adult Japanese man in his early 20s |
| `_unattributed__young-adult-japanese-man-in-his-early-20__neutral__from-codex-019f53f9-03b08c78.png` | `019f53f9-01be` | Half-body visual-novel stage sprite of young adult Japanese man in his early 20s |
| `_unattributed__young-adult-japanese-man-in-his-early-20__neutral__from-codex-019f53fb-a4ac7426.png` | `019f53fb-e26a` | Half-body visual-novel stage sprite of young adult Japanese man in his early 20s |
| `_unattributed__young-adult-japanese-man-in-his-early-20__neutral__from-codex-019f53fe-c9b38f0d.png` | `019f53fe-3069` | Half-body visual-novel stage sprite of young adult Japanese man in his early 20s |
| `_unattributed__young-adult-japanese-man-in-his-early-20__neutral__from-codex-019f5400-5e90b7e1.png` | `019f5400-27bf` | Half-body visual-novel stage sprite of young adult Japanese man in his early 20s |
| `_unattributed__young-adult-japanese-man-in-his-early-20__neutral__from-codex-019f5401-843cfcc9.png` | `019f5401-eee8` | Half-body visual-novel stage sprite of young adult Japanese man in his early 20s |
| `_unattributed__young-adult-man-of-white-british-appeara__neutral__from-codex-019f53d4-eda6c582.png` | `019f53d4-c1cf` | Half-body visual-novel stage sprite of young adult man of White/British appearan |
| `_unattributed__young-adult-man-of-white-british-appeara__neutral__from-codex-019f53d7-e217e89b.png` | `019f53d7-b095` | Half-body visual-novel stage sprite of young adult man of White/British appearan |
| `_unattributed__young-adult-man-of-white-british-appeara__neutral__from-codex-019f53d9-d0ee52c0.png` | `019f53d9-7ad4` | Half-body visual-novel stage sprite of young adult man of White/British appearan |
| `_unattributed__young-adult-man-of-white-british-appeara__neutral__from-codex-019f53dc-0fb98bc6.png` | `019f53dc-407a` | Half-body visual-novel stage sprite of young adult man of White/British appearan |
| `_unattributed__young-adult-man-of-white-british-appeara__neutral__from-codex-019f53df-494da2c6.png` | `019f53df-283b` | Half-body visual-novel stage sprite of young adult man of White/British appearan |
| `_unattributed__young-adult-man-of-white-british-appeara__neutral__from-codex-019f53e1-489f9857.png` | `019f53e1-6e7a` | Half-body visual-novel stage sprite of young adult man of White/British appearan |
| `_unattributed__young-adult-man-of-white-british-appeara__neutral__from-codex-019f53e3-edd39bca.png` | `019f53e3-2fbf` | Half-body visual-novel stage sprite of young adult man of White/British appearan |
| `_unattributed__young-adult-man-of-white-british-appeara__neutral__from-codex-019f53e5-c0e9cd18.png` | `019f53e5-0741` | Half-body visual-novel stage sprite of young adult man of White/British appearan |
| `_unattributed__young-adult-man-of-white-british-appeara__neutral__from-codex-019f53e6-de35cbe5.png` | `019f53e6-d6be` | Half-body visual-novel stage sprite of young adult man of White/British appearan |
| `_unattributed__young-adult-man-of-white-british-appeara__neutral__from-codex-019f53e8-e236e14a.png` | `019f53e8-82cf` | Half-body visual-novel stage sprite of young adult man of White/British appearan |
| `_unattributed__young-adult-man-of-white-british-appeara__neutral__from-codex-019f53ea-ac4da716.png` | `019f53ea-f951` | Half-body visual-novel stage sprite of young adult man of White/British appearan |
| `_unattributed__young-adult-woman-of-white-caucasian-app__neutral__from-codex-019f5338-cc973eef.png` | `019f5338-3a8e` | Half-body visual-novel stage sprite of young adult woman of White/Caucasian appe |
| `_unattributed__young-adult-woman-of-white-caucasian-app__neutral__from-codex-019f533e-39c4ef8b.png` | `019f533e-24b9` | Half-body visual-novel stage sprite of young adult woman of White/Caucasian appe |
| `_unattributed__young-adult-woman-of-white-caucasian-app__neutral__from-codex-019f5343-430cf440.png` | `019f5343-5954` | Half-body visual-novel stage sprite of young adult woman of White/Caucasian appe |
| `_unattributed__young-adult-woman-of-white-caucasian-app__neutral__from-codex-019f5347-1487f8a2.png` | `019f5347-3832` | Half-body visual-novel stage sprite of young adult woman of White/Caucasian appe |
| `_unattributed__young-adult-woman-of-white-caucasian-app__neutral__from-codex-019f534a-76e00e49.png` | `019f534a-c0d4` | Half-body visual-novel stage sprite of young adult woman of White/Caucasian appe |
| `_unattributed__young-adult-woman-of-white-caucasian-app__neutral__from-codex-019f534d-e63613b3.png` | `019f534d-3ecf` | Half-body visual-novel stage sprite of young adult woman of White/Caucasian appe |
| `_unattributed__young-adult-woman-of-white-caucasian-app__neutral__from-codex-019f534f-b641a555.png` | `019f534f-a592` | Half-body visual-novel stage sprite of young adult woman of White/Caucasian appe |
| `_unattributed__young-adult-woman-of-white-caucasian-app__neutral__from-codex-019f5353-c2f007ac.png` | `019f5353-d6d8` | Half-body visual-novel stage sprite of young adult woman of White/Caucasian appe |
| `_unattributed__young-adult-woman-of-white-caucasian-app__neutral__from-codex-019f5356-66d450f8.png` | `019f5356-e6c0` | Half-body visual-novel stage sprite of young adult woman of White/Caucasian appe |
| `_unattributed__young-adult-woman-of-white-caucasian-app__neutral__from-codex-019f535a-2a1bf877.png` | `019f535a-66b6` | Half-body visual-novel stage sprite of young adult woman of White/Caucasian appe |
| `_unattributed__young-east-asian-woman-in-her-early-twen__neutral__from-codex-019f5337-75abc07c.png` | `019f5337-9ed9` | Half-body visual-novel stage sprite of a young East Asian woman in her early twe |
| `_unattributed__young-east-asian-woman-in-her-early-twen__neutral__from-codex-019f533c-fbafc220.png` | `019f533c-0b1f` | Half-body visual-novel stage sprite of a young East Asian woman in her early twe |
| `_unattributed__young-east-asian-woman-in-her-early-twen__neutral__from-codex-019f533f-5f7836ee.png` | `019f533f-cc3d` | Half-body visual-novel stage sprite of a young East Asian woman in her early twe |
| `_unattributed__young-east-asian-woman-in-her-early-twen__neutral__from-codex-019f5344-847923d4.png` | `019f5344-2350` | Half-body visual-novel stage sprite of a young East Asian woman in her early twe |
| `_unattributed__young-east-asian-woman-in-her-early-twen__neutral__from-codex-019f5348-8947dfb3.png` | `019f5348-2f91` | Half-body visual-novel stage sprite of a young East Asian woman in her early twe |
| `_unattributed__young-east-asian-woman-in-her-early-twen__neutral__from-codex-019f534b-1b15149d.png` | `019f534b-1a85` | Half-body visual-novel stage sprite of a young East Asian woman in her early twe |
| `_unattributed__young-east-asian-woman-in-her-early-twen__neutral__from-codex-019f534d-cbd82b0c.png` | `019f534d-da39` | Half-body visual-novel stage sprite of a young East Asian woman in her early twe |
| `_unattributed__young-east-asian-woman-in-her-early-twen__neutral__from-codex-019f5350-1a26c78b.png` | `019f5350-a38f` | Half-body visual-novel stage sprite of a young East Asian woman in her early twe |
| `_unattributed__young-east-asian-woman-in-her-early-twen__neutral__from-codex-019f5356-83da102d.png` | `019f5356-0db8` | Half-body visual-novel stage sprite of a young East Asian woman in her early twe |
| `_unattributed__young-east-asian-woman-in-her-early-twen__neutral__from-codex-019f5359-e6968502.png` | `019f5359-fdf1` | Half-body visual-novel stage sprite of a young East Asian woman in her early twe |
| `_unattributed__young-east-asian-woman-in-her-early-twen__neutral__from-codex-019f535d-48f0cad4.png` | `019f535d-611b` | Half-body visual-novel stage sprite of a young East Asian woman in her early twe |
| `_unattributed__young-east-asian-woman-in-her-early-twen__neutral__from-codex-019f5360-8e1540ab.png` | `019f5360-fd35` | Half-body visual-novel stage sprite of a young East Asian woman in her early twe |
| `_unattributed__young-south-asian-woman-in-her-early-to-__neutral__from-codex-019f5338-21165031.png` | `019f5338-9a83` | Half-body visual-novel stage sprite of a young South Asian woman in her early-to |
| `_unattributed__young-south-asian-woman-in-her-early-to-__neutral__from-codex-019f5358-d2f38369.png` | `019f5358-f725` | Half-body visual-novel stage sprite of a young South Asian woman in her early-to |
| `_unattributed__young-south-asian-woman-in-her-early-to-__neutral__from-codex-019f535d-28ae6293.png` | `019f535d-68a6` | Half-body visual-novel stage sprite of a young South Asian woman in her early-to |
| `_unattributed__young-south-asian-woman-in-her-early-to-__neutral__from-codex-019f535e-a040fe60.png` | `019f535e-e0b4` | Half-body visual-novel stage sprite of a young South Asian woman in her early-to |
| `_unattributed__young-south-asian-woman-in-her-early-to-__neutral__from-codex-019f5360-df198262.png` | `019f5360-d91e` | Half-body visual-novel stage sprite of a young South Asian woman in her early-to |
| `_unattributed__young-south-asian-woman-in-her-early-to-__neutral__from-codex-019f5363-f0754885.png` | `019f5363-a14a` | Half-body visual-novel stage sprite of a young South Asian woman in her early-to |
| `_unattributed__young-south-asian-woman-in-her-early-to-__neutral__from-codex-019f5365-a5a969f4.png` | `019f5365-63f7` | Half-body visual-novel stage sprite of a young South Asian woman in her early-to |
| `_unattributed__young-south-asian-woman-in-her-early-to-__neutral__from-codex-019f5367-f9f2c0ba.png` | `019f5367-11dc` | Half-body visual-novel stage sprite of a young South Asian woman in her early-to |
| `_unattributed__young-south-asian-woman-in-her-early-to-__neutral__from-codex-019f536a-f8022a09.png` | `019f536a-2be8` | Half-body visual-novel stage sprite of a young South Asian woman in her early-to |
| `_unattributed__young-south-asian-woman-in-her-early-to-__neutral__from-codex-019f536b-ce59968b.png` | `019f536b-ec18` | Half-body visual-novel stage sprite of a young South Asian woman in her early-to |
| `_unattributed__young-south-asian-woman-in-her-early-to-__neutral__from-codex-019f536e-18e21a21.png` | `019f536e-50d5` | Half-body visual-novel stage sprite of a young South Asian woman in her early-to |
