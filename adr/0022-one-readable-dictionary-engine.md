# One readable dictionary engine

Status: Accepted 5 October 2026 by the release lead under the owner's delegation; all gates measured at low load pass; import time/memory rows pass but were measured under load the benchmark itself raised, so absolute import figures are to be re-confirmed on another machine.
- The spike's engine, benchmarks and gate evidence (`docs/dev/dictionary-engine-spike.md`) stay on the branch `spike/hoshidicts-ts-engine`. Production code is written from them in later phases.
- Pass 4's quiet run (5 October, commit 7b9280356) passed every gate in every browser. M0, Node M1, M5, M6, M7, M8 and Chromium's Jitendex import were measured under load 12 and are final, as are M9 and M10, which do not depend on load.
- The fresh-profile JMdict imports (M1 and M3 in all three browsers) and two of Chromium's three engine set imports (M2 and M4) were not. So four of the gates the decision rule names, M1 Chromium, M2, M3 and M4, have only PROVISIONAL inputs. From each browser's first legacy import on, the 1-minute load read 10.7-22.6 through the JMdict imports, and Chromium's set imports read 11.3-23.0, on a Mac with an endpoint scanner checking the IndexedDB writes. A second M1/M3 run did the same.
- The provisional rows point to a pass, by wide margins: import memory 0.81-0.83x legacy in Chromium, 0.91-0.95x in WebKit and 0.30-0.31x in Firefox. These are the figures to re-confirm on another machine.
- Pass 3 left Chromium's import memory at parity with the row store (0.94-1.04x). Pass 4 brought it below (PROVISIONAL), by decoding bank text in JS.

## Context

The owner chose the hoshidicts storage design (Manhhao, branch `main-mit`, commit af99b55, MIT licence) to replace Yomu's local dictionary engine. Hachidori (bee-san) showed that design working in a browser. The current engine writes about 525,000 multi-index IndexedDB rows for JMdict (62.4 s in Chromium). It issues 460 transactions and 45,750 index requests to annotate one 945-character page.

Yomu ships the same source to several channels, each with its own rules:

| Channel | Constraint |
| --- | --- |
| Greasy Fork | Readable code, a 2 MB cap, and external code only through SRI `@require`/`@resource`, which the same readability rules cover |
| Chrome Web Store | No remote JS or Wasm |
| Firefox AMO | Self-contained; machine-generated code needs a reproducible build |
| Apple App Store | Guideline 2.5.2 |
| Hosted Study | |
| Userscripts app | The documented iPhone and iPad path |

Measured 4 October 2026:
- WebAssembly cannot be instantiated in a page world under a `script-src 'self'` or nonce-only policy in Chromium, Firefox or WebKit. Tampermonkey runs Yomu in that world.
- The Userscripts app cannot receive a binary resource.
- With storage cost removed, Yomu's own candidate generation and parsing set the floor for page annotation. A compiled engine cannot buy annotation speed at that seam.

## Decision

1. **One engine.** Yomu has one dictionary engine: a readable TypeScript port of the hoshidicts storage design in `src/reader/dictionaries/engine/`. Yomu stays MIT. The engine's design is adapted from hoshidicts main-mit (MIT) and credits hoshidicts and Hachidori. No GPL source is read, copied or ported.
   - Where each storage technique comes from:
     - The bloom filter and the page cache appear only in GPL forks. Yomu writes them independently, from the idea and textbook parameters.
     - Sorted key pages with a fence are original to this spike. No hoshidicts branch has them, the GPL fork included.
     - Committing last comes from hoshidicts main-mit (MIT), whose importer writes a `.hoshidicts_1` marker after every other file. Yomu's manifest-last commit and its import leases are written independently.
   - The engine ships inside files each channel already ships: the SRI runtime companion, the extension packages and Study's `app.js`.
   - Yomu never loads code at runtime. Dictionary archives are data.
2. **Storage.** Each imported dictionary is one immutable Generation, stored in the IndexedDB database `yomu-dictionary-engine` as chunked sections. A section holds one of these:
   - term records without glossaries, in deflated 4 KiB pages
   - an interned table of tag and rule strings
   - raw-deflate glossary blocks, inflated only when a selected result reads its glossary
   - meta and kanji records as positional JSON, in deflated 4 KiB pages
   - Key Indexes: keys sorted by UTF-16 code unit in 4 KiB pages, with a resident fence and a bloom filter (k = 7, at least 10 bits per key, double hashing)

   An import first leases its Generation in the catalog, and renews the lease as it writes, so an orphan sweep in another tab spares it. The manifest is committed last: one strict transaction checks that every chunk it lists is stored at its recorded length, then replaces the lease. The manifest records each chunk's length and the Adler-32 of each of its 4 KiB pages. Every read checks the length and the pages it returns, so a torn chunk raises an error instead of returning wrong rows. Writers hold the Web Lock `yomu:dictionary-engine-writer`. Readers never lock.
3. **Deviations from hoshidicts main-mit** exist only for browsers and for Yomu's features:
   - A sorted index replaces the XXH3 linear-probing hash table, because Study needs prefix and enumeration queries.
   - Deflate replaces zstd, because no browser compresses zstd. The engine writes raw deflate with its own encoder, about 150 lines. It emits one fixed-Huffman block per page, finds matches with hash chains, and allocates its buffers once per import. fflate's `deflateSync` allocates about 200 KB per call, and that garbage set Chromium's import peak. fflate inflates, as before.
   - Bank text is decoded to strings in JS, 64 KiB at a time. Chromium's `TextDecoder` returns Blink strings that V8 frees only when it next collects, and they kept Chromium's import at legacy's peak. Malformed UTF-8 falls back to `TextDecoder`, as the legacy importer decodes it.
   - Numbers JSON cannot carry (-0, ±Infinity, NaN) are stored losslessly behind a flag bit. Banks can contain them (`-0`, `1e999`, `-1e-400`), and the row store keeps them.
   - Keys are UTF-16, so key order equals IndexedDB order.
   - Rows go through Yomu's own normalizers. NFKC and the empty-reading fallback keep stored rows equal to legacy rows.
   - Sequence numbers, kanji_meta and full kanji rows are kept.
   - Interned strings replace u8 length fields, so tags longer than 255 bytes survive.
   - There is no media store. Images are inlined into glossaries as data URLs, as the legacy importer does.
4. **Morphology stays with the learning target** (ADR-0008). A later phase may port Japanese candidate generation from hoshidicts main-mit (`lookup.cpp`, `deconjugator/`). Its rules come from Jiten's deconjugator, Apache-2.0, so that attribution is kept. That phase needs reviewed span diffs and a parity re-record.
5. **Legacy database.** `jpdb-popup-reader-yomitan` becomes the Legacy Origin Dictionary Database.
   - Yomu opens it read-only and migrates it per dictionary, with verification and a ledger. It keeps serving lookups until each dictionary commits.
   - Only an explicit learner action, Clear, or Factory Reset deletes it.
   - It is never upgraded to a new version, because older code on the same origin would then fail with VersionError.
   - Unlike the owner-suffixed names removed on 30 September (ADR-0010), the new database never hides old data, because it is filled from the legacy one.
   - Both names stay registered for reset and for the all-sites purge.
   - The legacy reader is kept for at least 12 months after release N.
6. **Extension.** The extension background remains the one owner (ADR-0010). Content-side calls are batched per macrotask. Durable mutations stay single and epoch-fenced (ADR-0015).

## Rejected

- **Compiled hoshidicts Wasm.**
  - It is blocked on CSP-strict pages under Tampermonkey.
  - The Userscripts app cannot receive it.
  - It carries a Greasy Fork readability risk and an unproven AMO rebuild.
  - It needs an Emscripten toolchain and a C++ fork to maintain.
- **Wasm in extensions with TypeScript in userscripts**, because that is two engines.
- **Fetching engine code at runtime**, which every channel forbids.
- **Porting from GPL forks** (bee-san's hoshidicts fork, Hachidori), because it would force a relicence.

## Consequences

- **Import.** JMdict imports in 4.6 s in Node, 5.1 s in Chromium, 5.4 s in WebKit and 7.7 s in Firefox. The row store takes 43-63 s in the browsers. These are medians of 3 from the pass-4 quiet run. The Node figure is final (load 6.8-7.4). The browser figures are PROVISIONAL: in each browser, at least two of the three engine imports and two of the three legacy imports began or ended at load 12 or more (up to 20.0).
  - Measured the judge's way, the TypeScript import takes 5.1x native hoshidicts main-mit's wall time: 4.55 s against 0.89 s with `low_ram`.
  - By CPU time it takes 2.8x: 4.62 s against 1.66 s.
  - Both were measured under load 9.
  - Decoding bank text in JS (Decision 3) costs about 0.65 s per import in Chromium, and a faster encoder setting wins back most of it.
- **Import memory** (PROVISIONAL). Below the row store's in every browser in both runs, by process RSS, which the owner made the binding gauge. These are JMdict imports on fresh profiles, legacy alternating, medians of 3, in the pass-4 quiet run and a second run, sampled every 13-17 ms and once after the import. Each browser's first import began under load 10, and every reading after it was 10.7-22.6, so these figures are PROVISIONAL:

  | Browser | Peak against legacy |
  | --- | --- |
  | Firefox | 0.31x and 0.30x (294 against 961 MB, 296 against 982) |
  | WebKit | 0.95x and 0.91x (371 against 391 MB, 357 against 392) |
  | Chromium, process RSS | 0.81x and 0.83x (193 against 237 MB, 193 against 233) |
  | Chromium, V8 heap plus ArrayBuffers | 0.79x and 0.75x |

  - Pass 1 read 1.27-1.44x in Chromium. Two things set that peak: fflate's per-call deflate work arrays, and Blink copies of the JSON strings handed to TextEncoder. The engine's own encoder and a JS UTF-8 writer remove both.
  - Pass 3 still read 0.94-1.04x in Chromium. `TextDecoder`'s Blink strings for the bank slices held the rest, and decoding the slices in JS took about 43 MB off. Decoding each bank once would suit Chromium too, but WebKit then holds about 260 MB more.
- **Storage.** It shrinks about 3.4x: 52 MB against 175 MB in Chromium for JMdict, JPDB and KANJIDIC. Size does not depend on load, but two of the three engine set imports read 12 or more, so this M4 figure is PROVISIONAL too. The engine's encoder writes about 10% more than fflate would (52.3 against 47.6 MB in Node).
- **Exact lookups.** The engine returns the same rows in the same order as the row store. The spike checks this exhaustively against the rows Yomu's real importer stores, comparing own keys and every leaf with `Object.is`. It also checks byte-identical parser output.
- **Robustness.** An orphan sweep in another tab never deletes an import in progress, and an import whose lapsed lease was swept stops at its next chunk write. A commit never publishes a generation with a missing or short chunk. A torn chunk raises an error on any read that touches a torn page (pass 3; in pass 2 only whole-chunk reads were checked). Deleting the database cannot hang on an open connection; a delete that another tab blocks stays pending, says so, and makes the store's opens in this tab fail at once until it completes.
- **Read memory.** A reader keeps a 32 MiB page cache (which also holds stored glossary blocks), a 32 MiB chunk cache that fills from any chunk a batch touches twice, and memoized records. That is more read-time memory than the row store. Phase 5 should revisit these budgets on iOS.
- **Codec.** fflate stays the inflate codec, synchronous and readable on every supported Safari. The engine writes raw deflate with its own encoder, about 150 readable lines. It searches hash chains of up to 16 candidates and does not index positions inside matches longer than 16 bytes, as zlib's fast levels do. Its output is ordinary deflate, so fflate and DecompressionStream read it.
- **Page parse.** A warm parse of the 945-character page takes 1.10x the zero-I/O floor in Chromium and 1.03x in WebKit, and makes no store calls. A cold one, opening the engine, takes the floor plus 349 ms in Chromium and plus 498 ms in WebKit. The row store takes 5.6x and 15.9x as long warm. Measured in the quiet run, with every reading under 12 (8.4-11.3).
- **Credits.** Phase 2 adds credits and notices only. The hoshidicts MIT notice goes in `public/THIRD_PARTY_NOTICES.txt`, and Hachidori is credited for the browser approach. There is no relicensing.
