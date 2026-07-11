# Yomu Academy — Worksheet Packs

Lossless digitisation of the real class worksheets behind Yomu Academy. Each **pack** is the
faithful, machine-readable conversion of **one unique source worksheet payload** — every
original instruction and question preserved, answers only where the source (or a defensible
model answer) supplies them, and explicit manual-review flags everywhere content would
otherwise have to be invented.

This is source conversion, not a lesson summary. Nothing here paraphrases a nine-lesson
overview; each pack maps 1:1 to a file the class actually handed out.

## Layout

| Path | Contents |
| --- | --- |
| `public/academy/content/worksheet-packs/_inventory.json` | Deterministic source inventory: every worksheet payload deduped by SHA-256, curriculum coordinates, staging paths, paired audio. Generated. |
| `public/academy/content/worksheet-packs/packs/<slug>.json` | One pack per unique worksheet. The digitised deliverable. |
| `public/academy/content/worksheet-packs/_coverage.json` | Machine coverage report (validator output). Generated. |
| `docs/academy/worksheet-packs/coverage-report.md` | Human coverage report. Generated. |
| `scripts/academy-worksheet-packs/build-inventory.mjs` | Enumerate + hash + extract + render sources into the inventory + staging. |
| `scripts/academy-worksheet-packs/pack-schema.mjs` | The pack schema contract + strict validator. |
| `scripts/academy-worksheet-packs/validate-packs.mjs` | Validate all packs + prove coverage; exits non-zero on any gap. |

## Rights & tiers (conservative by design)

The inventory tags every source with a **tier** and never blurs the line:

- **`digitise` — user-owned coursework.** The class's own teacher-made handouts, homework,
  listening tasks, vocabulary/grammar/kanji/reading sheets, speaking + info-gap exercises.
  These are fully extracted and become published packs.
- **`reference` — third-party material.** The full third-party copy of the *Genki II* workbook,
  community open study-resource packs, and the scraped Soya listening site. These are recorded
  with identity + curriculum metadata and **queued**. Their bytes are **never** extracted into
  packs and **never** reproduced wholesale; they serve only as answer-key / structure
  cross-references.

## Regenerating

```sh
# 1. Build the deterministic inventory + staged text/page-renders (needs poppler + ffprobe).
node scripts/academy-worksheet-packs/build-inventory.mjs

# 2. (Digitisation workers write packs/<slug>.json from the staged renders + text.)

# 3. Validate every pack against the schema and prove coverage.
node scripts/academy-worksheet-packs/validate-packs.mjs
```

`build-inventory.mjs` is deterministic and idempotent: identical worksheets handed out to both
class cohorts collapse to a single pack whose `occurrences[]` records every path, week and term
it appeared in. Source files are re-hashed on every run, so a changed source is a visible
identity change, never a silent drift.

## What every pack carries

Stable source id · path(s) · SHA-256 · course / textbook / chapter / section / week / term ·
page + timecode anchors · verbatim instructions and questions · image + paired audio/video
references · listening transcripts where recoverable · accepted answers + variants · model
answers, hint ladders, explanations, rubrics and scoring rules · manual-review flags in place
of invented content · furigana + pitch-accent fields (`null` when unknown, never guessed) ·
grammar / vocabulary / kanji / listening / reading / writing / speaking / culture tags · kanji
recognition **and** handwriting-production activities · the original group task **and** a
faithful solo adaptation · SRS items, prerequisites, review links and common-error metadata ·
class / Genki / Minna no Nihongo / JLPT / JF Can-do mappings · and character / expression /
pose / location / scene suggestions as VN-authoring metadata.

Free-writing prompts are preserved verbatim and paired with structural checks and a rubric —
never collapsed into a single "correct" answer.

See `scripts/academy-worksheet-packs/pack-schema.mjs` for the enforced contract.
