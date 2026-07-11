# Academy Digitisation Coverage

`public/academy/content/digitisation-index.json` is a deterministic, metadata-only inventory of gathered Academy source material. It never copies source bytes. Each entry has a root-relative source path, SHA-256 content identifier, inferred year/week/course/lesson when the path supports one, digitisation state, intended Academy use, and retained upstream links where a local report associates them.

Build it from the repository root:

```sh
node scripts/build-academy-digitisation-index.mjs
```

## Source Roots

| Root | Scope | Academy handling |
| --- | --- | --- |
| `repository-references` | Local project reference images and documents | Curriculum/reference review only. |
| `academy-references` | Gathered Academy reference corpus and exports | Curriculum/reference review only. |
| `japanese-library` | The private Japanese library | Structured curriculum ingestion candidates are identified; rights review remains required. |
| `soya-research` | JLPT listening research assets and reports | Modality/reference only; recreate cleared original assets rather than copying. |
| `academy-public` | Existing Academy public assets | Already digitised production assets. |
| `academy-catalog` | Existing Moodle metadata-only catalog | Member hashes and classifications only; raw member names and paths remain deliberately withheld. |

## States And Missing Work

`already-digitised` means an asset already sits in the Academy public corpus. `source-only` means the material has been inventoried but must not be copied into Academy. `metadata-only` is used for the privacy-preserving Moodle catalog.

The generated `summary.missingConversions` object is the authoritative count of outstanding work. It distinguishes text/structure extraction, audio transcoding, original visual derivatives, archive inspection, and the Moodle catalog's rights/source-recovery requirement. Rebuild the index after any collection change; the file order and hashes make a no-change rebuild byte-for-byte stable.

## Current Generated Coverage

The current complete pass covers **725,754** records and **715,224** unique SHA-256 payloads. Root totals: `academy-catalog` 916, `academy-public` 251, `academy-references` 18,715, `japanese-library` 646,813, `repository-references` 16, and `soya-research` 59,043.

| Unresolved conversion | Count |
| --- | ---: |
| Archive inspection or extraction | 165 |
| Rights review and original visual derivative | 14,045 |
| Moodle rights review and source recovery | 916 |
| Rights review and text/structure extraction | 10,447 |
| Rights review and audio transcoding | 699,930 |

There are 251 already digitised Academy production assets. These counts intentionally exclude any copying or publication of the gathered source bytes.
