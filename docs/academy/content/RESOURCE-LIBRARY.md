# Academy resource library

The resource library is the typed bridge between the private UCL Moodle corpus and publishable Yomu Academy content. It inventories every safe catalog occurrence, records duplicate payloads without collapsing their classroom occurrences, and attaches curriculum or digitisation claims only when a human audit supports them.

The implementation is `src/academy/resource-library.ts`. It deliberately does not import `public/academy/catalog.json`: callers pass a catalog to `createResourceLibrary`, so merely importing the module cannot add the catalog to an application bundle.

## Ubiquitous language

| Term | Meaning |
| --- | --- |
| **Resource record** | One Moodle member occurrence. Two records may share a payload hash when the same file appears in multiple archives. |
| **Payload** | Byte-identical source content identified by SHA-256. Payload identity supports deduplication; it does not erase classroom chronology. |
| **Catalog fact** | Metadata present in the publishable catalog: hashes, byte counts, format, archive occurrence, safe path shape, and capture provenance. |
| **Resource enrichment** | A sparse human-audited assertion about a record's pedagogical role, mappings, target links, and conversion state. |
| **Digitised target** | A rights-cleared Academy lesson, exercise, audio item, transcript, model answer, rubric, or reference from `academyContentGraph`. |
| **Target link** | A typed relationship from a source occurrence to a digitised target. It says either `scope-alignment`, `informed-by`, or, when rights explicitly allow it, `direct-conversion`. |
| **Original target** | New Yomu writing or media that covers a source function without copying source bytes or wording. |

This distinction matters: the catalog can prove that an occurrence is a PDF, but it cannot prove that the PDF is a worksheet, transcript, or answer key. Member names and paths were intentionally excluded. Those semantic roles belong only in audited enrichments.

## Current seed

The `2026-07-11` publishable catalog produces:

| Measure | Count |
| --- | ---: |
| Archive occurrences | 96 |
| Resource occurrences | 916 |
| Unique payloads | 688 |
| Duplicate payload occurrences | 228 |
| PDF occurrences | 716 |
| MP3 occurrences | 185 |
| Word document occurrences | 15 |

All 916 occurrences receive a resolved conversion state. The default is `catalogued` with a `metadata-only` strategy. No unaudited document receives a worksheet-like semantic role.

The current sparse enrichment seed covers the twelve members in the human-audited 2025/26 Level 3+ Lesson 9 archive. The archive is selected by hash; each member is pinned by central-directory position **and its own expected payload hash**, so the assertion does not depend on a private filename or source path and fails closed if archive ordering or content changes.

| Positions | Audited role | Available original Yomu targets |
| --- | --- | --- |
| 1-2 | Audio tracks | Lesson, listening exercise, original dialogue audio |
| 3 and 7 | Listening worksheets | Lesson and listening exercise |
| 4 and 10 | Vocabulary worksheets | Lesson |
| 5 and 8-9 | Grammar worksheets | Lesson and aligned grammar exercises |
| 6 | Transcript PDF | Lesson, listening exercise, original transcript |
| 11 | Grammar homework | Lesson, purpose/writing exercises, original model answer |
| 12 | Reading homework | Lesson and writing exercise |

These are `scope-alignment` or `informed-by` links. They are not derivative-conversion claims. The target transcript, model answer, audio, exercises, and lesson retain the original Yomu rights recorded by the content graph.

## Model shape

`ResourceLibrary` keeps repeated data normalized:

| Collection | Responsibility |
| --- | --- |
| `sources` | Catalog capture and manifest provenance. |
| `rightsStatements` | Shared source-content rights. Every Moodle record resolves to the same metadata-only statement. |
| `archives` | Safe archive hashes, byte counts, and declared occurrence counts. |
| `resources` | Thin exhaustive occurrence records. No titles, filenames, raw paths, URLs, or semantic guesses. |
| `enrichments` | Sparse semantic roles, mappings, target links, conversion state, and assertion provenance. |
| `targets` | Rights-cleared targets derived from the existing Academy content graph. |
| `defaultConversion` | The conversion state for every record without an enrichment. |

Use `resourceEntries(library)` or `resourceEntryById(library, id)` to resolve a thin record with its enrichment or the default conversion. `resolvedTargetLinksForResource` joins links to their target records. `resourcesForMappingFramework` queries UCL, class, Genki, Minna, or JLPT mappings.

## Curriculum mappings

Mappings reuse the curriculum graph's `SourceMappingRelation` and `SourceReusePolicy` vocabulary. A mapping records:

- one typed framework: `ucl`, `class`, `genki`, `minna`, or `jlpt`;
- the existing curriculum source ID;
- relation, reference, and reuse policy;
- assertion confidence: `verified`, `inferred`, or `heuristic`;
- a public-safe note.

The Lesson 9 seed carries all five views. UCL and class placement are human-audited chronology assertions, Genki 22-23 and Minna II 35-36 are sequence/scope references, and JLPT is a placement heuristic rather than an official score conversion.

## Rights and provenance

The Moodle rights statement is intentionally strict:

- `publicationMode: metadata-only`;
- `directReuse: not-authorized`;
- no permitted source-content uses;
- metadata use only for inventory, deduplication, curriculum mapping, and conversion planning;
- the catalog's excluded-field list retained as restrictions.

An enrichment records its basis, confidence, date, and safe evidence. Validation rejects private filesystem paths, Moodle download endpoints, email addresses, unknown references, direct-conversion claims without explicit source rights, and an original-target status that points at anything other than cleared original Yomu content.

## Conversion states

`ResourceConversion` separates status from strategy:

| Status | Meaning |
| --- | --- |
| `catalogued` | Safe metadata exists; semantic role and content reuse are not asserted. |
| `mapped` / `planned` / `in-progress` | Conversion planning has progressively more evidence or active work. |
| `original-target-available` | A cleared original Yomu target covers the function without direct source reuse. |
| `converted` | A direct conversion exists. Validation requires an available `direct-conversion` link and source rights that allow reuse. |
| `blocked` | Work cannot proceed under the current rights, provenance, or production constraints. |

Completed and pending work use the curriculum graph's existing `DigitizationWorkKind` values. The rights gate also reuses the curriculum queue contract.

## Loading and validation

Build the canonical in-memory library at a data-loading seam rather than importing the JSON into general application code:

```ts
import catalog from '../../../public/academy/catalog.json';
import {
    createResourceLibrary,
    type PublishableMoodleCatalog,
} from '../../../src/academy/resource-library';

const library = createResourceLibrary(catalog as unknown as PublishableMoodleCatalog);
```

For a browser route, fetch the already-published catalog and pass the parsed value through the same adapter. `createResourceLibrary` validates the catalog before adapting it and asserts the resulting library before returning.

The focused test protects these invariants:

1. 916 occurrences, 688 unique payloads, and all format totals remain represented.
2. Duplicate payloads do not collapse source occurrences.
3. Only the twelve audited records carry semantic roles and mappings.
4. Every UCL/class/Genki/Minna/JLPT mapping and target link resolves.
5. Moodle rights stay metadata-only while digitised targets stay cleared and original.
6. Private provenance and unauthorized derivative claims fail validation.

## Extending the library

Regenerate the publishable catalog first. A new catalog automatically gains thin records through the adapter. Add an enrichment only after matching a stable archive hash and member position against a local audit, then record public-safe evidence, mappings, conversion work, and links. If direct reuse is contemplated, establish and record explicit rights before using `direct-conversion`; otherwise author an original target and use `scope-alignment` or `informed-by`.

The Lesson 9 enrichment intentionally depends on the canonical curriculum lesson/source IDs and Academy target IDs. Renaming those records is a coordinated schema change: update the enrichment seed and rerun the focused resource-library test in the same change.
