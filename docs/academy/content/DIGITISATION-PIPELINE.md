# Academy Digitisation Pipeline

`scripts/digitize-academy-resources.mjs` is the resumable local companion to the metadata-only digitisation index. It consumes `public/academy/content/digitisation-index.json` when present, otherwise builds an in-memory inventory from the existing index builder. It does not alter the catalog or attempt to recover private Moodle bytes.

```sh
node scripts/digitize-academy-resources.mjs
node scripts/digitize-academy-resources.mjs --max-stage-bytes 33554432 --max-total-stage-bytes 536870912 --render-pages 3
node scripts/digitize-academy-resources.mjs --dry-run
```

Output goes to `public/academy/content/digitized/` by default:

| Path | Contents |
| --- | --- |
| `manifest.json` | Deterministic summary and configured limits. |
| `records/<sha256(resource-id)>.json` | One record per occurrence: source/hash/lesson/type, staging, text/OCR-preparation, exercise status, derivatives, and failures. |
| `staging/sha256/<payload-hash>` | One unique local original per payload, subject to per-file and total byte limits. |
| `text/`, `pdf-visuals/`, `archive-manifests/` | Extracted normalized text, bounded PDF page renders, and archive member manifests. |

Text formats are parsed directly; JSON is parsed before deterministic serialization; Office files use `textutil`; PDFs use `pdftotext` and `pdftoppm`; audio metadata uses `ffprobe`; ZIP/APKG manifests use `yauzl` with member hashes, while other archives use `bsdtar` listings. Exercise status derives from extracted text, never just a filename.

The manifest also reports deterministic audio/PDF pair coverage. A pair is only asserted from a shared archive hash or from the indexer's same root/course/year/lesson inference; the record carries its paired resource IDs and basis. `--dry-run` performs no writes or extraction, while reporting source availability, staging eligibility, and pairing coverage for the complete inventory.

Files are written through `.partial` siblings then atomically renamed. A matching record is reused on rerun, so interruption resumes at incomplete work. Local sources are rehashed before use; a changed source becomes an explicit integrity failure. Pass `retryFailures: true` to the programmatic API after correcting a failed extractor or source.

Catalog-only Moodle occurrences remain metadata-only: their records say `source.available: false`, extraction is unavailable, and exercise conversion is blocked. No catalog member name, text, or original is reconstructed or staged.
