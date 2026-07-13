# Academy source pipeline

The Stage 2 pipeline inventories the private Moodle capture without publishing source filenames, paths, titles, prompts, or bytes. It preserves three denominators separately:

- 96 archive occurrences;
- 916 member occurrences;
- 688 unique archive-member payloads.

Three direct Moodle resources are tracked separately because they are not ZIP members. The private payload store therefore contains 689 unique hashes in the current capture.

## Commands

Run from the `yomu-reader` repository:

```bash
npm run academy:source:pipeline
npm run academy:source:validate
```

The first command requires the private capture at `resources/yomu-academy/moodle-raw` and the reviewed donor packs. It is resumable by payload hash. Successful archive scans, PDF census records, rendered pages, native image extraction, layout regions, and audio probes are reused.

Failed external-tool records are also reused so one corrupt payload cannot repeatedly block the corpus. Retry them explicitly after fixing the cause:

```bash
ACADEMY_SOURCE_RETRY_FAILURES=1 npm run academy:source:pipeline
```

Poppler and ffprobe calls have hard timeouts. A timeout becomes an explicit `failed:*` state rather than a skipped source.

The authorized shared Japanese library is a separate denominator universe:

```bash
npm run academy:library:scan
npm run academy:library:census
node scripts/academy-library-pipeline.mjs publish
npm run academy:library:validate
```

`publish` reads only completed private caches and fails if a ledger or census denominator is missing; it never reopens source archives. Its public artifact contains aggregate allowlisted fields only. The current mechanical baseline is 15,790 filesystem entries, 13,123 regular files, 11,081 unique payloads, and 68 hashes overlapping Moodle. Archive census is 84/89, with five `failed:zip64-unsupported` containers recorded by reason; PDF census is 450/450 and media probe census is 5,090/5,090. These counts do not imply reviewed questions, cleared rights, transcripts, pairings, or playable activities.

## Private outputs

Ignored artifacts live under `artifacts/yomu-academy/source-pipeline/`:

- the occurrence/payload ledger and one deduplicated byte file per SHA-256;
- 200-DPI render, text-box, image-object, native-image, media-region, and vector-review census for every unique PDF;
- audio probe records and listening-pairing candidates;
- immutable source-item candidates adjacent to, but separate from, augmentation records;
- a teacher comparison index with real source pages and positioned review overlays.

The private teacher surface contains Moodle-derived text and must never be copied into `public/` or `docs/public/`.

## Public outputs

Only privacy-allowlisted metadata is committed:

- `public/academy/content/source-pipeline/catalog.v2.json`;
- `public/academy/content/source-pipeline/corpus-status.v1.json`;
- `public/academy/content/source-pipeline/pack-migration.v1.json`;
- `public/academy/content/source-pipeline/library-status.v1.json` (separate shared-library aggregates only);
- the updated `public/academy/content/RESOURCE-LEDGER.json`.

The validator pins the 96/916/688 baseline, reconciles every count, checks explicit payload states, rejects private keys/non-ASCII source strings, scans for tokens from the actual private corpus, and prevents machine candidates from being reported as verified or playable questions.

## Review contract

The 879 migrated donor items are source-item candidates, not audited source questions. Donor page numbers, answers, media descriptions, and duration matches remain review-required until a reviewer confirms the exact source locus and relationship. The single Stage 1 question remains the only verified/playable Moodle claim until that work is completed.

Every PDF page is reviewable even when it has no text layer. Blue overlay boxes mark text-layer regions; orange boxes mark positioned raster/vector candidates. Native images are extracted separately, and image-bearing pages can never silently become text-only activities.
