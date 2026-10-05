# Dictionary engine spike (Phase 1, ADR-0022)

Branch `spike/hoshidicts-ts-engine`, never merged as is. Written 4 October 2026; passes 2 and 3 the same evening, pass 4 overnight into 5 October, and pass 5 (review fixes) early on 5 October.

> **Copied for the record.** This report is copied unchanged, apart from this note, from the branch `spike/hoshidicts-ts-engine` at 967c5aad8. That branch is not published, so the spike's engine and the benchmark scripts this report names (`scripts/engine-spike/`, `src/reader/dictionaries/engine/`) are not in this repository.
>
> Its "Decision pending" verdict below is superseded. ADR-0022 (`adr/0022-one-readable-dictionary-engine.md`) was accepted later on 5 October 2026 by the release lead, under the owner's delegation. The load that left M1 Chromium, M2, M3 and M4 provisional came from the benchmark's own fresh-profile imports: a second run, started below load 10, rose the same way. Every provisional row passes by a wide margin. The absolute import time and memory figures are still to be re-confirmed on another machine.

## Verdict

**Decision pending.** Four of the gates the decision rule names, M1 Chromium, M2, M3 and M4, have only PROVISIONAL inputs, and the spec says not to draw the decision from provisional numbers. So no rule is applied yet, and ADR-0022 stays Proposed. Every gate measured under load 12 passes. Every provisional row passes too, by a wide margin, so the provisional rows point to rule 1, proceed with the TS engine.

- Pass 4 ran the whole "Rerun on a quiet machine" block at commit 7b9280356 (`quiet/`), starting at a 1-minute load of 6.9. Every gate passes in every browser it is set for.
- These are final:
  - M0, Node M1, M5, M6, M7, M8, and Chromium's Jitendex import (part of M2: 12.7 s against 25 s). Every 1-minute reading before and after their runs was under 12.
  - M9 and M10, which do not depend on load.
- These are PROVISIONAL, because at least one reading was 12 or more:
  - M1 and M3 in all three browsers, from the alternating fresh-profile JMdict imports
  - Chromium's M2 (JPDB and KANJIDIC) and M4, from the set imports. Two of the three engine set imports began or ended at 12 or more: 23.0 to 22.4, and 14.8 to 13.6.

  Each browser's first legacy import began at a load of 6.6-8.9. From then on, through its M1/M3 imports, the load read 11.3-20.0, and Chromium's set imports read up to 23.0. In the process samples taken then, Microsoft Defender's scanner used about two cores on the IndexedDB writes, and another session's app was busy too. A second M1/M3 run (`quiet-m3/`), each browser started only once the load was under 10, rose the same way, to 10.7-22.6. On this Mac the fresh-profile imports push the load past 12 themselves.
- **The decision rule.** Rule 1 reads "Proceed with the TS engine (ADR-0022 Accepted) when all of these pass: M1 Chromium, M2, M3, M4, M5, M6, M7, M8 (or its fallback), M9 and M10". Proceeding and Accepted are one outcome. M5 to M10 pass and are final. M1 Chromium, M2, M3 and M4 pass on provisional rows only, so neither rule 1 nor a named fallback or kill is applied until they are measured under load 12. Pass 4 (commit c2b7cb577) said the rule was met. Under the spec, that went too far.
- The provisional rows pass by wide margins, and none is near a fallback or kill condition (M3's kill is 2x legacy, M1 Chromium's is 25 s). The quiet run and a second M1/M3 run agree:

  | Gate | Quiet run (`quiet/`) | Second run (`quiet-m3/`) | Limit |
  | --- | --- | --- | --- |
  | M3 Chromium | 0.81x (193 against 237 MB) | 0.83x (193 against 233 MB) | 1.00x |
  | M3 WebKit | 0.95x (371 against 391 MB) | 0.91x (357 against 392 MB) | 1.00x |
  | M3 Firefox | 0.31x (294 against 961 MB) | 0.30x (296 against 982 MB) | 1.00x |
  | M1 Chromium / WebKit / Firefox | 5.08 / 5.37 / 7.66 s | 5.04 / 5.35 / 7.62 s | 12 / 18 / 18 s |
  | M2 Chromium: JPDB / KANJIDIC | 1.44 / 0.19 s | not run | 6 / 2 s |
  | M4 Chromium | 52 MB (52 / 52 / 52) | not run | 100 MB |

- Pass 4 brought Chromium's import memory below legacy's, from 0.94-1.04x in pass 3 (PROVISIONAL, as above; see "Pass 4"). It also resolved both thin Chromium M6 margins, which are final: warm 1.10x FLOOR against 1.25x, and cold FLOOR + 349 ms against + 500.

## Pass 5: review fixes

The review of pass 4 made two major findings. Both were verified before fixing, and neither was rejected. Pass 5 changes no engine code, so the engine is still 2,397 lines.

1. **The verdict drew the decision from provisional rows** (this document and ADR-0022).
   - **Verified.**
     - The spec's owner section says "do not draw the decision from provisional numbers". Rule 1 makes proceeding the same outcome as ADR-0022 being Accepted.
     - Pass 4's verdict still said the rule was met and that rule 1 said proceed, beside a Proposed status. Its commit subject (c2b7cb577) and ADR-0022's status said so too.
     - Every input pass 4 had for M1 Chromium, M2 (JPDB and KANJIDIC), M3 and M4 was provisional. ADR-0022's Consequences stated import time and import memory as settled, with no PROVISIONAL label.
   - **Fix.** The verdict is "Decision pending". ADR-0022 no longer says the rule is met, and its import time, import memory and storage figures are labelled PROVISIONAL.
2. **A summary row's `provisional` flag came from one reading** (`browser-bench.mjs`).
   - **Verified.** `record()` read `uptime` as it wrote a row, and set `provisional: load[0] >= 12` from that one reading. A summary row therefore judged only the load when it was written, after its last run:
     - In `quiet/`, Chromium's `M2.engine` and `M4.engine` rows carry load 11.26 and `provisional: false`. Yet runs 0 and 1 were written at 22.35 and 13.61, with `provisional: true`.
     - `M2.engine.jitendex` read the load once, after the third import: 8.83, when the 5-minute average was 12.2. Pass 4 reported this as "Jitendex 8.8".
     - `M3.summary` repeats its last run's reading. In `quiet/` Firefox, run 0 was written at 11.26 (legacy) and 11.84 (engine), which is not provisional. Only the later runs set the flag.
     - A single run was read only once it ended, so a run that began at 12 or more and ended below it counted as final.
   - **Fix.** The harness now reads the 1-minute load before each measurement starts, as well as when its row is written:
     - before every M1/M3 and M2/M4 import, and before and after each Jitendex import
     - before each M6 row's parses, M7's cold lookups and M8's import

     Every row records its readings as `loads`, the highest as `maxLoad`, and is `provisional` when `maxLoad` is 12 or more. A summary row (M1, M3, M2, M4, Jitendex, M6) carries every reading of its runs, so it is provisional whenever any run was. The threshold of 12 did not change.
   - **Evidence**, from two runs on the fixed harness, the same build as `quiet/`:
     - An engine-only Chromium import run (`p5-jitendex/`, 2 runs). The Jitendex row's readings were 13.3 and 12.1 around the first import, and 12.1 and 10.5 around the second. The row is provisional, although the reading as it was written was 10.5, which the old harness would have marked final. Its M1/M3 runs read 8.6 to 9.6 (final) and 12.3 to 12.6 (provisional), and `M1.summary` and `M3.summary` are provisional.
     - A KANJIDIC smoke run in Chromium and WebKit (`p5-smoke/`, load 5.5-6.9). Every row carries `loads`, `maxLoad` and `provisional`, and each summary carries all its runs' readings.
   - **The quiet run, re-read.** The harness writes an `M9.control` row as each page opens, and each import starts straight after it. So in `quiet/` and `quiet-m3/`, the reading before each import is the `load` of the last `M9.control` or `environment` row written before it. Re-read that way (`<scratch>/p5/loads.mjs`, not committed):
     - The provisional gates are the same: M1 and M3 in all three browsers, and Chromium's M2 (JPDB and KANJIDIC) and M4.
     - Chromium's Jitendex imports are final: the readings were 9.65, 9.17 and 8.98 before them and 8.83 after the third.
     - The first engine set import in WebKit and in Firefox began at 12.36 and 12.50, so those reported, non-gating M2 rows are provisional too.
     - The load ranges in "Gates" and "Environment" are now the readings before and after each run.

## Pass 4: Chromium import memory, review minors and M6

Pass 4 is commits 09e0f7adb, 08eb27eb3 and 7b9280356. The engine is 2,397 lines.

1. **Chromium import memory (M3) is now below legacy**, PROVISIONALLY (`builder.ts`, `deflate.ts`).
   - **Cause**, as pass 2 found: Chromium's `TextDecoder` returns each decoded 64 KiB bank slice as a Blink string. V8 frees it only when it next collects, and the freed memory stays in the renderer. Pass 3's engine peaked at 233-247 MB in Chromium, about legacy's level.
   - **Fix.** `decodeUtf8()` decodes a slice into UTF-16 code units in a reused buffer, then into a string with `String.fromCharCode`, all in JS. Input that is not well-formed returns `undefined`, and `TextDecoder` then decodes it, substituting U+FFFD exactly as the legacy importer's `TextDecoder` does. Slices stay 64 KiB.
   - **Variants measured.** JMdict imports in fresh profiles, engine only, the variants alternating (`p4-x-*`, `p4-y-*`, `p4-z-*`), except the chosen row's, which alternated with legacy (`p4-m3-a/`). The 1-minute load read 6.2-22.6 before and after these runs, so the table is PROVISIONAL, except its last row, whose readings were all under 12 (6.2-11.99). Peak RSS delta and import time, median (range):

     | Variant | Runs | Chromium | WebKit | Firefox |
     | --- | ---: | --- | --- | --- |
     | Pass 3: `TextDecoder` per 64 KiB slice | 10 | 235 MB (233-247), 4.54 s | 349 MB (309-363), 5.19 s | 292 MB (281-303), 6.95 s |
     | JS decoder per 64 KiB slice | 10-13 | 192 MB (191-193), 5.20 s | 353 MB (327-364), 5.40 s | 285 MB (258-314), 7.59 s |
     | JS decoder, matches over 16 bytes not indexed | 4 | 195 MB (193-196), 4.96 s | 356 MB (326-386), 5.26 s | 281 MB (258-314), 7.27 s |
     | JS decoder, and chain 16 too (**chosen**) | 3 | 193 MB (193-194), 5.06 s | 366 MB (346-368), 5.35 s | 259 MB (258-293), 7.61 s |
     | `TextDecoder` once per bank, each slice parsed from a fresh copy | 6 | 174 MB (173-179), 4.51 s | 613 MB (591-646), 5.19 s | |

     - The JS decoder takes about 43 MB off Chromium's peak and leaves WebKit and Firefox within their run-to-run spread.
     - Decoding each bank once is better still in Chromium, but WebKit then holds about 260 MB more, as pass 2 found. It does so even when every slice is parsed from a fresh copy of its text, so substrings sharing the bank's text are not the cause. WebKit appears to keep the multi-megabyte bank strings themselves for longer.
     - So Chromium wants few or no strings from Blink, and WebKit wants small strings. Only decoding in JS gives both.
   - **The decoder's cost, and how the encoder wins most of it back.**
     - Decoding in JS costs about 0.65 s per JMdict import in Chromium, 0.2 s in WebKit and 0.65 s in Firefox (medians above). In Node it is 0.7 s: 4.7 s against 4.0 s.
     - The encoder now leaves positions inside a match longer than 16 bytes out of its hash chains, as zlib's fast levels do, and stops each chain search after 16 candidates (was 32).
     - On every record page and glossary block of a JMdict import (116.2 MB of input, Node): 910 ms and 22.50 MB before, 693 ms and 23.13 MB now. That is 24% less time for 2.8% more bytes.

       | Encoder setting | Time | Output |
       | --- | ---: | ---: |
       | chain 32, every position indexed (pass 3) | 910 ms | 22.50 MB |
       | chain 32, matches over 16 bytes not indexed | 736 ms | 23.01 MB |
       | chain 16, matches over 16 bytes not indexed (**chosen**) | 693 ms | 23.13 MB |
       | chain 16, matches over 8 bytes not indexed | 659 ms | 23.48 MB |
       | chain 8, every position indexed | 797 ms | 23.16 MB |
       | chain 2, every position indexed | 713 ms | 24.67 MB |

     - The net cost of pass 4 is about 0.4-0.5 s per JMdict import in Chromium, 0.1-0.2 s in WebKit and 0.3-0.6 s in Firefox, against M1 limits of 12, 18 and 18 s.
   - **Alternating M3**, legacy and engine in fresh profiles, medians of 3 (`p4-m3-a/`, engine at 08eb27eb3, load 6.5-21.5, PROVISIONAL): Chromium 193 against 236 MB (**0.82x**), WebKit 366 against 394 MB (**0.93x**), Firefox 259 against 923 MB (**0.28x**). The quiet run's numbers are in "Gates".
   - **Tests.** `decodeUtf8` returns `TextDecoder`'s string for well-formed text, including a 100,000-character slice, and `undefined` for 17 malformed sequences (stray continuation bytes, overlong forms, surrogates, code points past U+10FFFF, truncated sequences). A bank with a malformed byte parses with U+FFFD, as legacy's does.
2. **The pass-2 review's two minor findings**, both verified on the old code by the new tests before the fix (`byte-store-idb.ts`, `byte-store-memory.ts`).
   - **(a) A timed-out delete left later opens hanging.**
     - `deleteDatabase()` gave up waiting after its timeout but left the delete queued. A later `IdbByteStore.open()` in the same tab then waited behind it with no timeout, and the database was deleted after all, although the caller had been told to "try again".
     - Now the store remembers its pending deletes by name. The timeout rejects with "Dictionary storage is still open in another tab; it will be cleared when that tab closes or reloads." A second call joins the pending delete instead of queueing another, and `open()` rejects at once with the same message while the delete is pending.
     - Test: with a connection that ignores `versionchange`, the delete times out, an open fails in under 200 ms, and once that connection closes the joined delete completes and a reopened store is empty. On the old code the test fails on the message, and the open would hang.
   - **(b) A swept import brought its lease back and kept writing.**
     - After another tab's `collectOrphans()` swept a lapsed lease and its chunks, the importing tab's next renewal put the lease row back, and the import wrote on to the end. Commit refused it only through the missing-chunk check ("Missing dictionary chunk ..."), and the new lease and chunks waited for the next sweep.
     - Now every chunk write of a leased generation reads the lease row in its own transaction. When the row is gone, the write aborts with "This dictionary import was cleaned up before it finished; import it again." `commit()` uses the same check. A sweep in the importing tab's own connection keeps the lease entry, so its next write fails the same way. The memory store refuses writes to a generation its own sweep removed.
     - Test: two connections and the clock 11 minutes on, as in the review's probe R1. The importer's `finish()` stops after 3 of the 68 chunk writes it makes when nothing interferes, raises "cleaned up before it finished", brings no lease back and leaves no chunk. On the old code it fails with "Missing dictionary chunk glossary.blocks#0".
3. **M6** (`reader.ts`, `byte-store-idb.ts`). Both Chromium margins were thin in pass 3: warm 1.23x FLOOR against 1.25x, and cold FLOOR + 458 ms against + 500.
   - **Warm.** A warm parse still made 4 store calls, reading 1,939 pieces (4.7 MB): the glossary blocks of rows whose glossary the parse never reads. Only inflated blocks were cached, so every batch fetched those again. The reader now caches a block's stored bytes too. A warm parse makes no store calls.
   - **Cold.** The IndexedDB store read a Blob chunk whole when one batch touched it 4 or more times, and sliced it otherwise. Two touches now suffice. A single piece, such as a hover's key page, is still sliced, so M7 does not change. A cold parse makes 86 chunk gets instead of 194, and reads 3,618 pieces (8.1 MB) instead of 5,593 (13.0 MB).
   - Engine-only, two alternating runs per variant (`p4-m6-*`, load 8.2-14.5). The first Chromium run of "Before" (1.11x, + 384 ms) and of "Stored blocks cached" (1.09x, + 415 ms) read 12 or more, so those values are PROVISIONAL. The rest are final:

     | | Chromium warm | Chromium cold | WebKit warm | WebKit cold | First lookup |
     | --- | --- | --- | --- | --- | --- |
     | Before (08eb27eb3) | 1.11x, 1.13x | FLOOR + 384, + 395 ms | 1.04x, 1.00x | FLOOR + 633, + 631 ms | 17-18 ms Chromium, 23-24 ms WebKit |
     | Stored blocks cached | 1.09x, 1.08x | + 415, + 412 ms | 1.00x, 1.04x | + 628, + 631 ms | |
     | Also whole chunks from two touches (**chosen**) | 1.10x, 1.07x | + 328, + 328 ms | 1.00x, 1.01x | + 482, + 486 ms | 17 ms Chromium, 23-32 ms WebKit |

   - The thin pass-3 warm margin came mostly from load. At load 10.4-14.5 the unchanged engine read 1.11-1.13x, and 1.13x in the run whose readings were all under 12.
   - In the quiet run: Chromium warm 1.10x FLOOR and cold FLOOR + 349 ms, WebKit warm 1.03x and cold FLOOR + 498 ms (load 8.4-11.3).
4. **M10.** The new code is paid for by cuts, and the engine is 2,397 lines:
   - The IndexedDB store's whole-chunk LRU was a second copy of `PageCache`; it is a `PageCache` now, which gained `forget(prefix)`.
   - `readUtf16` absorbs `readLength` and `decodeUnits`, which only it called.
   - The archive has one `bytes(name, reuse)` instead of `bytes` and `borrow`.
   - `KeyIndexReader` drops `prefix()` and `keys()`, thin wrappers over `entries(from)`. The tests keep them as helpers.
   - `DictionaryReader` exposes `indexes` instead of an `index()` getter and drops its `title` getter. Callers read `manifest.title`.
   - `MemoryByteStore.storedBytes()` moved into the Node bench, and the store's `exactBuffer()` went, so the `arraybuffer` fallback copies each chunk it writes.
   - The little-endian guard went: every browser platform is little-endian, as `readUtf16`'s comment now says.

## Pass 3: review fixes

The review of pass 2 made two findings. Both were verified before fixing, and neither was rejected.

1. **A torn chunk read from a Blob returned wrong rows instead of an error** (`byte-store-idb.ts`).
   - **Verified.** With `value: 'blob'`, the spike's choice, `readPieces` checked a chunk's Adler-32 only when one batch touched it 4 or more times with the chunk cache on. Every other Blob read checked only the length. That included every resident section read at open and every hover key-page read.
   - Two checks reproduced it on the pass-2 code:
     - The new default-settings tests failed in all 18 Blob cases: a zero-filled section returned rows, or nothing, without an error.
     - In real browsers, with `kanji.keys`, `kanji.fence` or `kanji.bloom` zero-filled at its length, `lookup('食')` returned `[]`: in Chromium here (`p3-torn-browsers-p2-control.jsonl`), and, for `kanji.keys`, in WebKit and Firefox in the review's own probe.
   - So ADR-0022, this document and the store header claimed more than the code did.
   - **Fix.** The manifest records the Adler-32 of each 4 KiB page of a chunk instead of one per chunk, and every read checks the pages it returns (see "Byte store hardening", (b)). A sparse Blob read fetches the whole pages its range touches. A key page is one such page, so a hover reads no extra bytes. The engine stays at 2,400 lines: `chunkKey` moved into `byte-store.ts`, shared by both stores.
   - **Evidence.**
     - In real browsers, on the CSP fixture with the engine IIFE, zero-filling `kanji.keys`, `kanji.fence`, `kanji.bloom`, `kanji.records` or `kanji.records.pages` now raises "checksum mismatch" in Chromium, WebKit 2336 and Firefox, with Blob and with ArrayBuffer values: 30 of 30 cases (`p3-torn-browsers.jsonl`).
     - Parsing shows no cost. Cold parse is 715 ms in Chromium (716 in pass 2) and 918 ms in WebKit (919).
     - Opening costs a few milliseconds, because the resident sections are now summed: 12.5-24.7 ms in Chromium against 9.2-9.4 in pass 2. The first lookup, open included, stays well under 50 ms: medians 19.5 ms in Chromium, 24 in WebKit and 29 in Firefox.
     - M8's slice reads, now checked like the reader's, are unchanged: p50 1 ms, p90 2 ms.
2. **Chromium's M3 sampler under-sampled the engine** (`browser-bench.mjs`).
   - **Verified.** Process RSS and the CDP heap gauge were read in one 100 ms tick, behind one `busy` flag, with `ps` run through `execSync`. A renderer busy importing answered `Runtime.getHeapUsage` late, so RSS ticks were skipped. No sample was taken after the import.
   - Pass-2 Chromium engine rows took 17-31 samples over 4.4-5.0 s imports, 149-291 ms per sample. Legacy rows took 106-204 ms per sample, and WebKit and Firefox about 100 ms.
   - **Fix.** Each gauge now runs on its own loop and clock, and nothing blocks the event loop:
     - RSS comes from two staggered readers, each every 25 ms, through async `ps -o pid=,rss= -p` on the browser's known pids. The whole process table is re-read once a second, to find new processes.
     - Chromium's heap is read every 100 ms over CDP.
     - Each gauge reads once more after the import.
     - Every `M1/M3` row records `samples`, `medianGapMs`, `maxGapMs`, `tailGapMs` and `peakFrom`.
     - `M3.summary` judges RSS in every browser, reports the heap as `heapRatio`/`heapPass`, and leaves `pass` null when any run's median gap is over 50 ms.
     - A later fix leaves the sampler's exiting `ps` processes out of the tree. In `p3-final` they added up to 2 MB to WebKit's legacy rows.
   - **Evidence.**
     - Median RSS gaps are now 13-27 ms for the engine and 15-43 ms for legacy, in every browser. An engine import gets 149-455 samples.
     - Chromium engine peaks rose to 211-243 MB, from 205-231 in pass 2.
     - The engine's RSS is highest when its import ends, and legacy's is not:
       - In all 12 Chromium and WebKit engine runs, the reading after the import was at least the in-import peak, and in 5 it was higher. In Chromium run 2 of `p3-m3-chromium-2`, for example, the in-import peak was 230 MB and the reading after it 239 MB.
       - In all 15 legacy runs, the reading after the import was lower than the peak.
     - The series show what pass 2 missed. Over the last 150 ms of the import, 8 of 9 Chromium engine runs still rose, by 2-13 MB: up to 9 MB in the browser process and up to 4 in the renderer. A sampler at 150-290 ms, with no reading after the import, misses most of that.

## Pass 2: what changed

1. **Import memory (M3).** The engine writes raw deflate with its own encoder, `engine/deflate.ts`, which allocates its work arrays once per import. It writes JSON as UTF-8 in JS. Each change removes garbage whose lifetime was set by V8's collector rather than by the import. Details and the options measured are under "Import memory (M3)".
2. **Byte store hardening** (review 1). An import leases its generation, so an orphan sweep spares it. `commit()` checks every chunk's recorded length before it writes the manifest. The manifest records each chunk's length and Adler-32, and reads check them, though in pass 2 only when they read a chunk whole (pass 3 checks every read). The IndexedDB store lets go on `versionchange`, and deleting it cannot hang. Numbers JSON cannot carry are stored losslessly. See "Byte store hardening".
3. **Parity independence** (reviews 1 and 2). M5a now compares the engine with the rows `YomitanDictionaryStore.importFile` stores under fake-indexeddb, keyed from that database's own indexes. Own-key order and every leaf are compared with `Object.is`. The floor adapter is only the timing floor now.
4. **Corrections** (review 2): the provenance wording, the M0 ratio method, the `builder.ts` header, and true medians of 3 for M2, M4 and M6 warm.

## Licence and provenance

Yomu stays MIT, and every engine file carries:

```
/*! SPDX-License-Identifier: MIT — storage design adapted from hoshidicts main-mit af99b55 (Copyright (c) 2026 Manhhao, MIT); inspired by Hachidori (bee-san). */
```

What was used, and where it came from:
- **Read and ported, from hoshidicts main-mit only** (local clone at commit af99b554cd4ab289aa65e16fd2a4eea0d3870d3b, MIT): `src/importer.cpp`, `src/query.cpp`, `src/hash/`, `src/memory/`, `src/zip/`. The port is a design adaptation, not a line-by-line translation:
  - term records kept apart from their glossaries
  - glossaries compressed and deduplicated
  - a posting list per key
  - three dictionary kinds (term, meta, kanji)
  - committing last: main-mit's importer writes a `.hoshidicts_1` marker after every other file (`importer.cpp:596`), and the engine's manifest plays that role
- **Original to this spike:** sorted 4 KiB key pages with a fence. No hoshidicts branch has them, the GPL fork included.
- **Written independently, from the idea and textbook parameters:**
  - the bloom filter: m = 2^ceil(log2(10·n)), k = 7, MurmurHash3-style 32-bit hashing over UTF-16 units with seeds 1 and 2, double hashing
  - the page cache
  - chunked sections, import leases and the manifest's chunk checks
  - the fixed-Huffman deflate encoder (RFC 1951 §3.2.6)
  - the IndexedDB-shaped adapter

  The bloom filter and the page cache appear only in GPL forks; Yomu's are written from the idea. main-mit has none of the items in this list.
- **Not read, copied or run:** bee-san's GPL hoshidicts fork, Hachidori's source, and the scratch `hdbuild/` and `portbench/` trees, which earlier sessions wrote against the fork. They were left unread to keep provenance clean. The judge's `zz-judge-floor.ts`, which reads Yomu's own code, was the only harness reused.
- **The deconjugator is not used.** The Jiten deconjugator rules in main-mit (Apache-2.0) were not touched. If a later phase ports `lookup.cpp` or `deconjugator/`, the Apache-2.0 attribution goes into the notices.

## What was built

| Path | Lines | Role |
| --- | ---: | --- |
| `src/reader/dictionaries/engine/format.ts` | 169 | Sections, record layouts, UTF-16 helpers, lossless stored JSON |
| `src/reader/dictionaries/engine/key-index.ts` | 516 | Bloom; key index builder (packed UTF-16, typed arrays, permutation sort, 4 KiB pages, fence); reader with `mayContain`, `get` and `entries(from)`, which serves enumeration and prefix queries |
| `src/reader/dictionaries/engine/builder.ts` | 549 | Bank-at-a-time import through the legacy normalizers, bank slicing, UTF-8 decoding and encoding in JS, intern table, glossary blocks, deflated record pages, lease and commit |
| `src/reader/dictionaries/engine/deflate.ts` | 150 | Raw-deflate encoder: one fixed-Huffman block per page, hash chains, buffers reused across an import |
| `src/reader/dictionaries/engine/yomitan-archive.ts` | 105 | Zip central directory from a Blob, one entry at a time, fflate `inflateSync` into exactly sized or reused buffers |
| `src/reader/dictionaries/engine/byte-store.ts` | 185 | ByteStore interface (leases, checked commit), chunk and page checks, Adler-32 per 4 KiB page, chunk-spilling `SectionWriter` |
| `src/reader/dictionaries/engine/byte-store-memory.ts` | 73 | In-memory store |
| `src/reader/dictionaries/engine/byte-store-idb.ts` | 260 | IndexedDB store (`yomu-engine-spike`, stores `chunks` and `catalog`), `blob` or `arraybuffer` values, page-checked Blob slices, whole-chunk cache, leases checked on every write, versionchange, pending deletes |
| `src/reader/dictionaries/engine/page-cache.ts` | 48 | Byte-budget LRU (32 MiB default), shared by the reader and the IndexedDB store's chunk cache |
| `src/reader/dictionaries/engine/reader.ts` | 342 | Resident sections, record batches, lazy synchronous glossary getter, checked reads |
| `scripts/engine-spike/idb-shim.ts`, `idb-adapter.ts`, `floor-adapter.ts` | | The IDBDatabase subset that YomitanDictionaryStore's read paths use, answered by the engine or (timing floor only) by in-memory Maps |
| `scripts/engine-spike/node-bench.ts` | | M1 (Node), M5a-d against the real legacy importer, informational M6/M7 |
| `scripts/engine-spike/browser-bench.mjs`, `browser-entry.ts`, `vite.config.ts`, `tsconfig.json` | | Playwright gates M1-M4 and M6-M9 on a CSP-enforcing page; `tsconfig.json` typechecks the spike scripts |
| `tests/reader/dictionary-engine/*.test.ts` | | 127 vitest cases (124 in pass 3, 66 in pass 2) |

- Nothing under `src/reader/dictionaries/yomitan/` or `src/reader/lookup/deinflect.ts` changed, so the multilingual parity ratchet's inputs are untouched. Nor did `package*.json`, `vite.config.ts` or `tsconfig.json`.
- No consumer is wired. The adapters install themselves on an unchanged `YomitanDictionaryStore` through its private `db()`.

## Environment

- **Machine:** Apple M1 Pro, 10 cores, 32 GB, macOS 26.7.1 (25G241).
- **Runtimes:** Node 24.16.0, Playwright 1.56.1.
- **Browsers:**
  - Chromium 141.0.7390.37 (headless shell)
  - Firefox 142.0.1
  - WebKit 26.0
- **WebKit build:** the WebKit build is Playwright's 2336, passed through `executablePath`. Build 2215, which ships with 1.56.1, exits with "Browser started with no default context" on every persistent context on macOS 26.
- **Load:** every browser row records `load`, the three load averages as the row was written, and a `provisional` flag. Node rows record `load` only.
  - Since pass 5, browser rows also record `loads`, the 1-minute readings before and after what they measured (for a summary, every reading of its runs), and `maxLoad`, and `provisional` covers them all (see "Reading the load").
  - For pass 4's runs, the reading before an import is the `M9.control` or `environment` row written just before it (see "Pass 5"). Their ranges below are the readings before and after each run. Earlier passes give the readings as rows were written.

  Load averages:
  - pass-4 quiet run (`quiet/`, 4 October 23:49 to 5 October 00:22):
    - 6.9 at the start; Node steps 5.9-8.1; M0 8.1-8.5
    - each browser's first fresh-profile JMdict import began at 6.6 (Chromium), 8.8 (WebKit) and 8.9 (Firefox). Every reading after it, through the M1/M3 imports, was 11.3-20.0.
    - the set imports read 8.4-23.0, and 12 or more before or after five of Chromium's six, two of WebKit's and three of Firefox's
    - the parse, hover, durability and Jitendex rows: 7.8-11.3
  - the second M1/M3 run (`quiet-m3/`): 6.5-10.0 before each browser's first import, and 10.7-22.6 after it
  - pass-4 explorations (`p4-*`): 6.2-22.6
  - pass-5 harness checks: `p5-smoke/` 5.5-6.9, `p5-jitendex/` 8.6-14.0
  - pass-3 gate run (`p3-final/`): 8-37; the two extra Chromium M3 runs: 11-21; Node parity: 14-28
  - pass-2 gate run (`p2-final3/`): 8 and 29
  - Node bench (`p2-node-*`): 9-35
  - M0 native and Node imports (pass 2): 9.5-10.5
  - pass 1, for reference: 9.7-55; research baseline 87-170

Archives were stored outside the repository, in `<scratch>/engine-archives`. All are the catalog's content-addressed objects except Kanjium, which the catalog lists only by URL.

| Archive | sha256 | Bytes | Rows |
| --- | --- | ---: | ---: |
| JMdict (en) 2026-07-23 | 5a413fc1bb5cd9250088dd27180df436bd518c6541cd82a597a62e2f1bd4bbe9 | 15,509,389 | 525,069 terms |
| JPDB v2.2 kana frequency | 4fa06c784155ea0ea0953740b99d421296c775ee0d035cfe1ff65a40d7d3e685 | 5,996,363 | 338,814 termMeta |
| KANJIDIC (en) 2026-203 | 7379e560713628e9d7bc65e695ae716871dee67f00655f0fdd30e122ec60c031 | 721,025 | 10,384 kanji |
| Jitendex 2026-07-09 | 807d911114af9d2154d270702972aafb2b6a6c2dc2400afa98db870d035c1a0b | 38,545,572 | 433,885 terms |
| Kanjium pitch (FooSoft URL) | 90d05ad6efc6f44a495bcc01db6b9d3a0f2f1c42ba38adcbefda0ddfaec8b8c2 | 1,072,708 | 124,137 termMeta (parity only) |

The corpus is `scripts/engine-spike/corpus-ja.txt`, copied from the research session: 19 paragraphs, 945 characters.

## Chosen parameters

- **CHUNK = 1 MiB**, with `value: 'blob'`. WebKit kept Blob values intact (M8), so the `arraybuffer` fallback was not needed.
- **Codec:** raw deflate written by `engine/deflate.ts`, read by fflate. The encoder writes one fixed-Huffman block per page, searches hash chains of up to 16 candidates, and leaves positions inside a match longer than 16 bytes unindexed (pass 4; chain 32 with every position indexed before). Record pages are 4 KiB; glossary blocks are 16 KiB.
- **Bank slices:** 64 KiB of UTF-8, decoded one slice at a time, in JS (pass 4).
- **Read memory:** a 32 MiB page cache (inflated pages and blocks, decoded key pages, and since pass 4 stored glossary blocks), a 32 MiB IndexedDB chunk cache, memoized decoded records (up to 100,000 per kind per dictionary) and memoized exact-key answers (up to 200,000 per index).
- **Readahead:** a batch that touches a Blob chunk twice or more reads it whole into the chunk cache (pass 4; four times before).

## Gates

Thresholds are the spec's. Every median is the middle of 3 runs.

The Load column gives the 1-minute readings before and after the runs a row uses. M1, M2 and M4 give the engine's runs, and M3 and M6 every run they compare. In the browsers, the reading before each run is the `M9.control` or `environment` row written just before it (see "Pass 5"); in Node, the row written before it. "P" marks a provisional number: at least one of those readings was 12 or more.

- M1 and M3 compare 3 legacy and 3 engine JMdict imports, alternating, each in a freshly launched browser on a freshly wiped profile.
- M2 and M4 import the whole set 3 times, each time on a freshly wiped profile, legacy first in its own origin.
- M6 warm takes the median of the 3 parses after the first, cold one. M6 cold and M7 cold are medians of 3 page reloads.

All rows come from the pass-4 quiet run (`quiet/`), against commit 7b9280356, except the second M1/M3 run (`quiet-m3/`, the same build). M0 and Node M1 ran in the same block, as did Node M5.

| Gate | Threshold | Measured (median of 3; runs in brackets) | Load (1-min) | Verdict |
| --- | --- | --- | --- | --- |
| **M0** native hoshidicts main-mit, JMdict (informational) | none | Native `low_ram` (two bank workers): 0.89 s wall (1.37 / 0.88 / 0.89 s; 895 / 869 / 864 ms internal; the first run read a cold file cache), 1.66 s CPU. Native, all cores: 0.34 s. TS in Node, same block: 4.55 s wall, 4.62 s CPU. **Wall ratio 5.1x** (`low_ram`, the judge's metric; the judge measured 4.0-4.4x at load 87-170); **CPU ratio 2.8x** | 6.8-7.4 (Node), 8.1-8.5 (native) | informational, under 12 |
| **M1** JMdict import, Node, memory ByteStore | ≤ 8 s | 4.55 s (4.62 / 4.55 / 4.55), 4.62 s CPU | 6.8-7.4 | **PASS** |
| M1 Chromium | ≤ 12 s, kill > 25 s | 5.08 s (5.08 / 5.11 / 5.05). Legacy 52.0 s (52.0 / 51.6 / 54.2). Second run 5.04 s | 12.6-20.0; second run 10.7-20.6 | P pass |
| M1 Firefox | ≤ 18 s | 7.66 s (7.81 / 7.66 / 7.50). Legacy 62.6 s (62.3 / 64.1 / 62.6). Second run 7.62 s | 11.3-14.1; 13.2-16.5 | P pass |
| M1 WebKit | ≤ 18 s | 5.37 s (5.37 / 5.40 / 5.31). Legacy 43.2 s (43.0 / 43.2 / 43.4). Second run 5.35 s | 14.2-19.2; 13.6-18.8 | P pass |
| **M2** Chromium: JPDB v2 kana / KANJIDIC / Jitendex | ≤ 6 s / ≤ 2 s / ≤ 25 s | 1.44 s / 0.19 s / 12.7 s (JPDB 1.40 / 1.46 / 1.44; KANJIDIC 0.17 / 0.19 / 0.20; Jitendex 12.96 / 12.69 / 12.58). Legacy 27.3 s / 0.88 s | Set imports 23.0 to 22.4, 14.8 to 13.6, and 11.5 to 11.3. Jitendex 9.7, 9.2 and 9.0 before its three imports and 8.8 after the third (the Jitendex row itself read only after the third) | P pass (Jitendex final) |
| M2 WebKit and Firefox (reported) | | WebKit 1.57 s / 0.18 s, Firefox 2.61 s / 0.21 s (JPDB / KANJIDIC). Legacy 16.9 / 0.57 s and 19.3 / 0.61 s | WebKit 8.4-12.4, Firefox 8.6-12.5: each browser's first engine set import began at 12.4 or 12.5 | reported, P |
| **M3** Chromium, JMdict, process RSS (binding) | ≤ legacy, kill > 2x | **193 MB (193 / 194 / 193) against 237 MB (280 / 237 / 230): 0.81x.** Second run: **193 (193 / 193 / 193) against 233 (248 / 233 / 231): 0.83x.** Median RSS gaps 13-14 ms (engine) and 16-17 ms (legacy) | 6.6-20.0; 6.5-20.6 | P pass |
| M3 Chromium, V8 heap plus ArrayBuffer backing stores (reported, not binding) | (≤ 160 MB and ≤ legacy) | 100 MB (100 / 102 / 99) against 126 MB (144 / 86 / 126): 0.79x. Second run 0.75x | as above | reported, passes |
| M3 WebKit, process RSS (runner's processes plus WebKit's XPC services) | ≤ legacy | **371 MB (371 / 385 / 352) against 391 MB (376 / 391 / 431): 0.95x.** Second run: **357 (357 / 352 / 358) against 392 (369 / 392 / 446): 0.91x** | 8.8-19.2; 10.0-22.6 | P pass |
| M3 Firefox, process RSS | ≤ legacy | **294 MB (321 / 294 / 260) against 961 MB (961 / 983 / 924): 0.31x.** Second run: **296 against 982 MB: 0.30x** | 8.9-14.7; 8.9-16.5 | P pass |
| **M4** `storage.estimate().usage` after JMdict, JPDB and KANJIDIC, Chromium | ≤ 100 MB | 52 MB (52 / 52 / 52). Legacy 175 MB (177 / 173 / 175) | As M2's set imports: 11.3-23.0 | P pass (the size does not depend on load) |
| **M5a** exhaustive, Node, against the real legacy importer | 0 diffs | 0 / 840,369 keys, 1,399,336 rows, and 1,370,850 rows at `count = 9`; store counts equal. Jitendex and Kanjium: 0 / 860,538 keys, 991,907 and 989,078 rows | 5.9-8.1 | **PASS** |
| M5b seeded sample | 0 diffs | 0 / 20,000 keys (33,486 rows; 22,983 for Jitendex and Kanjium) | 6.4-7.3 | **PASS** |
| M5c parse | byte-identical | 423 = 423 = 423 tokens (Node, both sets). Identical to each browser's legacy store in Chromium (423), WebKit (423) and Firefox (424) | 6.6-11.3 | **PASS** |
| M5d findTermMatches(paragraph, 256) | identical | 391 matches, 19/19 paragraphs identical (Node, both sets, and all three browsers) | 6.2-11.3 | **PASS** |
| **M6** Chromium warm | ≤ 1.25 × FLOOR, and ≥ 3x faster than legacy | FLOOR 255 ms (264 / 255 / 248), engine 280 ms (291 / 274 / 280): **1.10x**. Legacy 1,560 ms (1,715 / 1,559 / 1,560): **5.6x** | 9.7-11.3 | **PASS** |
| M6 Chromium cold (reload, includes open) | ≤ FLOOR + 500 ms | 604 ms (605 / 595 / 604): **FLOOR + 349** | 9.7-10.5 | **PASS** |
| M6 WebKit warm | ≤ 1.5 × FLOOR, and ≥ 3x faster than legacy | FLOOR 269 ms (273 / 261 / 269), engine 277 ms (292 / 276 / 277): **1.03x**. Legacy 4,412 ms: **15.9x** | 8.4-9.0 | **PASS** |
| M6 WebKit cold | ≤ FLOOR + 800 ms | 767 ms (816 / 767 / 745): **FLOOR + 498** | 8.5-9.0 | **PASS** |
| M6 Firefox (reported) | | Warm 1.11x (FLOOR 777, engine 862 ms), cold FLOOR + 447 ms; 8x faster than legacy | 7.8-9.2 | reported |
| **M7** Chromium hover, warm `lookup` | p50 ≤ 2 ms, p90 ≤ 5 ms | p50 0.0 ms, p90 0.1 ms | 10.5 | **PASS** |
| M7 first lookup after reload, including open | ≤ 50 ms | Chromium 17.7 ms (19.9 / 16.9 / 17.7), WebKit 26 ms (25 / 36 / 26), Firefox 20 ms (25 / 18 / 20) | 8.0-10.2 | **PASS** |
| M7 `lookupTermMeta` / `lookupKanji`, warm | p50 ≤ 1 ms | 0.0 / 0.0 ms (Chromium). WebKit and Firefox clamp timers to 1 ms and show 0 | 10.5 | **PASS** |
| **M8** WebKit Blob durability, JMdict, `blob`, relaunched | every SHA-256 equal; slice p50 ≤ 2 ms | **40/40 chunks equal** after the persistent context was closed and relaunched. 1,000 random 4 KiB slices, page-checked like the reader's: p50 1 ms, p90 2 ms | 8.9-9.4 | **PASS** |
| **M9** CSP | the Wasm control must reject on every page, and no engine failure | All 77 navigations of the quiet run, and every navigation of the second run, saw the 41-byte module reject, in all three browsers. Import, reads, parse and hover ran on `default-src 'none'; script-src 'nonce-…'; connect-src 'self'`. The only CSP reports were the Wasm control and Firefox's favicon request | n/a | **PASS** |
| **M10** size | ≤ 2,400 lines total, ≤ 600 per file, IIFE ≤ 120 KB | 2,397 lines including `deflate.ts` (2,247 for the files the spec lists). Largest file: `builder.ts`, 549. Unminified IIFE: 98,314 B including fflate's inflate, 89,863 B without | n/a | **PASS** |

**Pass 3's gate run** (`p3-final/`, load 8-37) is kept for reference; pass 4 changed the import (the decoder and the encoder) and two read paths, so its numbers no longer describe the engine. **Pass 2's two full runs** (`p2-final3/`, `p2-final4/`) are kept for reference. Their Chromium M3 rows were sampled every 149-291 ms during the engine's import and not after it, so they do not decide Chromium M3 (see "Pass 3"). Their other rows agree with pass 3: WebKit M3 0.86x and 0.84x, Firefox M3 0.34x and 0.30x, Chromium M6 warm 1.11x and 1.02x FLOOR, WebKit M6 cold FLOOR + 650 and + 651 ms, and M8 39/39.

The raw jsonl, one row per measurement with `uptime`, is in `<scratch>/engine-spike-results/`:

| Run | Contents |
| --- | --- |
| `p5-jitendex/`, `p5-smoke/` | The pass-5 harness checks: an engine-only Chromium import run with Jitendex, and a KANJIDIC smoke run in Chromium and WebKit, both with `loads` and `maxLoad` on every row |
| `quiet/` | The pass-4 quiet run: the whole block at 7b9280356 (Node, all three browsers, M0, M10), with `steps.log` giving the load before and after each step |
| `quiet-m3/` | A second alternating M1/M3 run per browser, same build, each browser started once the load was under 10 |
| `p4-m3-a/` | Alternating M1/M3 at 08eb27eb3, the decoder and encoder alone |
| `p4-x-*`, `p4-y-*`, `p4-z-*` | Engine-only decoder and encoder variants (the table in "Pass 4") |
| `p4-m6-*` | Engine-only M6 variants, Chromium and WebKit |
| `p3-final/` | The pass-3 gate run, all three browsers, every gate, with `--series` |
| `p3-m3-chromium-2/`, `p3-m3-chromium-3/` | Two more alternating Chromium M3 runs with the fixed sampler, with `--series` |
| `p3-node/` | Node M5a-d on the pass-3 code (both archive sets) |
| `p3-torn-browsers.jsonl`, `p3-torn-browsers-p2-control.jsonl` | Torn-chunk lookups in real browsers, on the pass-3 engine and (Chromium) on pass 2's |
| `p2-final3/` | The pass-2 gate run, all three browsers, every gate |
| `p2-final4/` | The second full run of the same code |
| `p2-node/` | Node M1, M5a-d (both archive sets) and Node M6/M7 |
| `p2-explore-*`, `p2-fixed-*`, `p2-reuse-*`, `p2-x*`, `p2-ab*`, `p2-utf8-*`, `p2-bank*`, `p2-s256-*`, `p2-s1024-*`, `p2-wk-*`, `p2-wholeparse-*` | Engine-only M3 explorations (the import-memory table below) |
| `p2-gate1-chromium/`, `p2-c1-*` | The encoder alone, before the hardening and the UTF-8 writer. M3 with legacy alternating: Chromium 233 against 249 MB, WebKit 356 against 420, Firefox 259 against 875. WebKit M6 cold FLOOR + 632 ms, Chromium M4 52 MB |
| `p2-final/` | Interrupted full run with the hardening but without the UTF-8 writer: Chromium M3 286 against 240 MB (1.19x), the run that showed the encoder alone was not enough |
| `p2-final2/` | Interrupted full run with each bank decoded once: Chromium M3 144 against 247 MB, WebKit 617 against 379 |
| `p2-deflate-ratio.jsonl` | The encoder's size and speed against fflate, every page and block of the five archives |
| `final/`, `m3fix-*`, `import-*`, `m6*`, `node-*.jsonl` | Pass 1 |

## Import memory (M3)

The binding gauge is the summed RSS of the browser's process tree, in all three browsers. Chromium's V8 heap plus ArrayBuffer backing stores is reported alongside and does not decide.

**Before and after**, JMdict, fresh profiles, legacy alternating, medians of 3 (all PROVISIONAL: the imports themselves push the load past 12, see "Verdict"). Chromium's pass-1 and pass-2 RSS rows were under-sampled (see "Pass 3").

| Browser | Pass 1 engine / legacy | Pass 2 engine / legacy | Pass 3 engine / legacy | Pass 4 quiet run, engine / legacy | Pass 4 second run |
| --- | --- | --- | --- | --- | --- |
| Chromium, RSS (binding) | 301, 293 / 230, 230 MB | 223 / 229 MB: 0.97x | 222 / 235, 239 / 230, 238 / 232 MB: **0.94x, 1.04x, 1.03x** | 193 (193 / 194 / 193) / 237 (280 / 237 / 230) MB: **0.81x** | 193 / 233 MB: **0.83x** |
| Chromium, heap + ArrayBuffers | 115, 108 / 107, 142 MB | 90 / 142 MB: 0.63x | 1.07x, 0.77x, 0.88x | 100 / 126 MB: 0.79x | 0.75x |
| WebKit, RSS | 455 / 468 MB | 341 / 395 MB: 0.86x | 344 / 398 MB: 0.86x | 371 (371 / 385 / 352) / 391 (376 / 391 / 431) MB: **0.95x** | 357 / 392 MB: **0.91x** |
| Firefox, RSS | 629 / 850 MB | 288 / 841 MB: 0.34x | 317 / 956 MB: 0.33x | 294 (321 / 294 / 260) / 961 (961 / 983 / 924) MB: **0.31x** | 296 / 982 MB: **0.30x** |

- **Chromium is below legacy since pass 4.** In all nine pass-4 alternating Chromium runs (`p4-m3-a/`, `quiet/`, `quiet-m3/`) the engine peaked at 193-194 MB, and legacy at 230-280. Decoding bank text in JS took about 43 MB off the renderer: it is 157-158 MB above baseline now, against 183-215 in pass 3 and legacy's 177-232. See "Pass 4".
- WebKit is the closest of the three: 0.91-0.95x in pass 4, 0.86x in pass 3. Its engine peaks were 346-385 MB in pass 4 (340-355 in pass 3, about the spread of the engine-only runs, 309-386), and legacy's 355-446.

**Where the memory went.** A Chromium memory-infra dump of the renderer during an engine import (`zz-memdump.mjs`, kept in the session scratchpad, not committed) split the excess over legacy into three parts:
- **fflate's per-call deflate work arrays.** These are a 64 KiB chain table, a hash table and a 100 KB symbol buffer, allocated on each of about 13,000 calls per JMdict import. They kept the ArrayBuffer partition at 86 MB against legacy's 48.
- **Blink copies of strings.** `TextEncoder.encodeInto` made Chromium hold a Blink copy of every glossary and record JSON string until V8 collected the string. V8's committed heap sat at 70-90 MB.
- **The key-index sort at `finish()`.** It is about 30 MB of typed arrays, inherent to building a sorted index in memory.

**Options measured** in pass 2. Chromium engine RSS, engine-only imports, fresh profiles, medians of 3, load 13-34. These used pass 2's sampler, which missed the end of Chromium's engine peaks (the chosen variant read 205-230 MB then and 211-243 with pass 3's sampler), so compare the variants with each other, not with legacy:

| Variant | Chromium | WebKit | Note |
| --- | ---: | ---: | --- |
| Pass 1: fflate, 4 KiB record pages | 303 | 442-481 | |
| 16 KiB record pages (4x fewer calls) | 276 | | |
| 16 KiB record pages and 64 KiB glossary blocks | 267 | | also slows WebKit cold parse |
| `codec: 'none'` | 229 | 338 | 128.7 MB stored for JMdict alone, which fails M4 |
| Reusable encoder (`deflate.ts`) | 231-286 | 341-356 | Chromium varied by 55 MB between runs |
| Encoder and JS UTF-8 (chosen in pass 2; pass 4 adds JS decoding) | 223 | 347 | 205-230 in the gate run |
| Also decode each bank once and slice the string | 142 | 617 | WebKit's WebContent process doubles |
| Encoder, JS UTF-8 and 1 MiB slices | 200 | 390 | |
| Encoder, JS UTF-8 and 256 KiB slices | 266 | 356 | |
| Encoder, JS UTF-8 and one `JSON.parse` per bank | 206 | 417 | |

- **The smallest change that works.** Bigger record pages cut calls 4x but left the RSS at 1.2x legacy. Batching pages under one deflate call is the same trade. A streaming fflate `Deflate` keeps its chain and hash tables but still allocates the symbol buffer on every call. `codec: 'none'` reaches legacy's level but fails M4.
- **The encoder costs little.** It costs about 150 lines, is about 2x faster than fflate, and wrote 3-13% more bytes in pass 2. Pass 4's faster settings add 2.8% on JMdict; JMdict, JPDB and KANJIDIC now store 52.3 MB in Node against fflate's 47.6, and M4 stays at 52 MB in Chromium. Pass 2's measurement on every page and block of the five archives (`p2-deflate-ratio.jsonl`):

  | Section | Size against fflate |
  | --- | --- |
  | JMdict records, at level 1 | 1.03x |
  | JMdict glossary blocks, at level 6 | 1.13x |
  | JPDB meta | 1.06x |
  | KANJIDIC | 1.09x |
  | Jitendex records / glossary blocks | 1.02x / 1.11x |

  All 47,061 pieces round-trip through fflate. M4 rises from 49 to 52 MB.
- **Chromium and WebKit pull in opposite directions** on how much bank text to decode at once.
  - Decoding each bank once took Chromium to 0.58x legacy (144 against 247 MB in an alternating run), but doubled WebKit's WebContent process to 1.6x legacy.
  - Pass 2 chose 64 KiB slices, which passed both with Chromium's margin thin. Pass 4 keeps them and decodes them in JS, which takes TextDecoder's Blink strings out of Chromium without giving WebKit large strings (see "Pass 4").
- **Smaller allocations removed on the way:**
  - archive entries inflate into a buffer sized from the central directory
  - banks borrow one reused buffer
  - `SectionWriter` lends one reused chunk buffer to the store
  - bank slices are decoded with their brackets swapped in place, so `JSON.parse` copies nothing more

  In Node, with chunks discarded, these and the encoder took the import's peak RSS delta from 303-312 MB to 116-117 MB.

## Byte store hardening

Each finding of review 1, with the test that covers it, and (pass 4) the two minor findings of the pass-2 correctness review. The tests are in `tests/reader/dictionary-engine/hardening.test.ts`, run on the memory store and on fake-indexeddb with ArrayBuffer and Blob values.

- **(a) An orphan sweep never deletes an import in progress.**
  - `ByteStore.begin()` leases a generation in the catalog before its first chunk, and chunk writes renew the lease every minute.
  - Every chunk write of a leased generation reads the lease row in its own transaction, and aborts with "cleaned up before it finished" when a sweep has removed it (pass 4). So a swept import stops at its next write, instead of putting its lease back and writing a doomed generation to the end.
  - `collectOrphans(now)` spares leases younger than 10 minutes, in one readwrite transaction.
  - `commit()` runs one strict transaction: it checks that the lease is still there and that every chunk the manifest lists is stored at its recorded length, then replaces the lease with the manifest. It refuses a swept generation or a missing or short chunk, and writes nothing.
  - `EngineBackend.open` opens each generation on its own and lists the ones that fail, so one bad dictionary no longer hides the others.
  - Tests: a sweep during an import spares it and the import commits; a lapsed lease is swept and the late `finish()` refuses at its first write, while earlier dictionaries stay readable; with two connections and the clock 11 minutes on, another tab's sweep stops the import after 3 of its 68 writes, with no lease brought back and no chunk left (pass 4); a chunk deleted or truncated before commit is refused; one broken dictionary leaves the others open.
- **(b) A truncated or torn chunk read throws** (pass 3; in pass 2 this held only for whole-chunk reads, see "Pass 3").
  - The manifest records each chunk's length and the Adler-32 of each of its 4 KiB pages (`SectionInfo.lengths`, `sums`). JMdict's manifest carries about 8,600 of them, one per 4 KiB of its 35 MB.
  - Every read checks the stored length, as `MemoryByteStore` always did.
  - Every read checks the sums of the pages it returns:
    - A sparse Blob read fetches the whole 4 KiB pages its range touches and checks each. A key page is one such page, so a hover's key-page read fetches nothing extra. A record page or glossary block fetches at most two pages.
    - A whole-chunk read (every resident section at open), a dense read (2 or more pieces in one chunk since pass 4, 4 before) and every ArrayBuffer chunk check every page, before the chunk enters the chunk cache.
    - The memory store checks each chunk whole, once.
  - Chunks are still written with relaxed durability, and the store header says what that leaves: after a power loss a committed manifest can sit over a torn chunk, which a read reports instead of returning wrong rows.
  - Tests:
    - A 100-byte chunk recorded as 256 throws "100 bytes stored, 256 expected".
    - A zero-filled chunk of the right length throws "checksum mismatch", read in one small piece or in four.
    - With the default settings (1 MiB chunks, the 32 MiB chunk cache), each of the 18 sections a lookup reads, zero-filled at its recorded length, makes the lookups or the open raise "checksum mismatch" on the memory, ArrayBuffer and Blob stores. Before the fix, all 18 Blob cases returned rows or nothing, without an error.
    - A torn page fails only the reads that touch it.
- **(c) Clear and Factory Reset cannot hang.**
  - `IdbByteStore` closes its connection on `versionchange` and then says why.
  - `deleteDatabase()` rejects after 12 s when a connection that ignores `versionchange` keeps it blocked. The harness's `clearAll` uses it.
  - Since pass 4 that rejection says the delete is still pending and will finish when the other tab closes or reloads. The store remembers the pending delete: a second call joins it, and `open()` in the same tab rejects at once instead of waiting behind it.
  - Tests: a delete with the store open resolves, and the store then throws "another tab is deleting or upgrading it"; a stubborn connection makes the delete reject instead of hanging; while that delete is pending, an open fails in under 200 ms, and once the stubborn connection closes the joined delete completes and the store reopens empty (pass 4).
- **(d) Numbers JSON cannot carry are stored losslessly.**
  - JSON banks do produce them: `-0`, `1e999` (Infinity), `-1e999` and `-1e-400` (-0). The row store keeps them, and `JSON.stringify` turned them into 0 and null. `JSON.parse` cannot produce NaN, but the encoding covers it.
  - `storedJson()` walks a value and, only when it holds such a number, tags it as `"\u0000<number>"` and escapes strings that already start with `\u0000`.
  - `EXOTIC_JSON`, the high bit of the stored length, tells the reader to revive them. The walk costs about 0.1-0.25 s per JMdict import.
  - The parity canonicaliser now spells such numbers out. The new `rowDifference()` compares own keys in order and every leaf with `Object.is`.
  - Test: an archive with all four literals in glossaries, meta data and kanji stats is imported by the real legacy importer and by the engine, and every row compares equal under `Object.is`.

## Parity (M5), in detail

**M5a, exhaustive, Node, against the real legacy importer.** Re-run in the pass-4 quiet run (`quiet/`, load 6-8) on the pass-4 code, with the same result as pass 3.
- The archives are imported with `YomitanDictionaryStore.importFile` under fake-indexeddb.
- The key universe is every distinct key of `terms.expression`, `terms.reading`, `termMeta.expression` and `kanji.character`, read from that database's own indexes (`openKeyCursor`, `nextunique`).
- Each key is read with `getAll(only(key))`, with count = all and count = 9 (the overflow probe `term-match.ts` uses), from the legacy database and through the engine adapter.
- Rows are compared by `rowDifference`: same rows, same order, the same own keys in the same order (IndexedDB's `id` aside), and `Object.is` on every leaf. Store row counts are compared too.

| Set | Counts (terms / termMeta / kanji / kanjiMeta) | Keys | Rows, count = all | Rows, count = 9 | Diffs |
| --- | --- | ---: | ---: | ---: | ---: |
| JMdict, JPDB, KANJIDIC | 525,069 / 338,814 / 10,384 / 0, equal | 840,369 | 1,399,336 | 1,370,850 | **0** |
| Jitendex, Kanjium | 433,885 / 124,137 / 0 / 0, equal | 860,538 | 991,907 | 989,078 | **0** |

Jitendex's inlined SVG images are inside those rows. A bug in the engine's zip reading, bank slicing or image inlining would now show up as diffs, where the floor adapter used the same code on both sides.

**M5b, sampled.** 20,000 keys of the same universe, mulberry32 seed 22: 0 diffs (33,486 rows; 22,983 for Jitendex and Kanjium).

**M5c, parse.** `ReaderParser.parse` with `parserProvider: 'local'` and pitch on, over the 19 paragraphs. Engine, floor and legacy token arrays are byte-identical, 423 tokens each, in Node for both sets, and in Chromium, WebKit and Firefox against each browser's own legacy store (Firefox segments one span differently from the other browsers, identically in both stores, so it shows 424).

**M5d, findTermMatches.** `findTermMatches(paragraph, 256)` per paragraph: 391 matches, identical in all 19 paragraphs, in Node for both sets and in all three browsers.

**Unit tests (127; 124 in pass 3, 66 in pass 2).** Pass-1's cases, plus:
- the legacy-anchored comparison on the synthetic archive, at count all, 1 and 9
- the encoder against fflate and DecompressionStream, including inputs over the 32 KiB window and a wrapped position counter
- exact and wrong declared zip sizes
- reused chunk and bank buffers
- the UTF-8 writer against TextEncoder, and (pass 4) the UTF-8 decoder against TextDecoder, with 17 malformed sequences it must refuse
- the hardening cases above, including (pass 3) a torn chunk in each of the 18 sections a lookup reads, with the default settings, on all three stores, and (pass 4) the two-connection sweep and the pending delete

## Design deviations from the brief, with reasons

1. **Licence header.** MIT, by the owner's decision, replacing the brief's GPL header.
2. **Term record sequence.** Stored as `f64`, with NaN meaning absent, not as `i32` with -1 for absent. Legacy keeps any JSON number, and an `i32` cannot carry -1 or 0.5 (tested). This costs 2 MB of raw records on JMdict, before compression.
3. **Meta and kanji records.**
   - They are positional JSON (`[expression, mode, data?]` and `[character, onyomi, kunyomi, tags, meanings, stats?]`), with the dictionary implied, in UTF-8 rather than UTF-16.
   - `JSON.stringify` never emits a lone surrogate, so UTF-8 is lossless here.
   - Array length encodes an absent field, so `data: undefined` and `stats: undefined` round-trip exactly.
4. **Record sections are paged and compressed.**
   - They are stored as independently raw-deflated 4 KiB pages, with a `<section>.pages` table.
   - With the engine's encoder, compression is 3.2x for term records, 3.4x for meta and 2.4x for kanji (pass 2: 3.2x, 3.5x and 2.5x).
   - JMdict, JPDB and KANJIDIC store 52.3 MB in all (51.5 MB with pass 2's encoder settings, 47.6 MB with fflate). M4's limit is 100 MB, and IndexedDB adds overhead on top of the raw bytes.
   - Key pages stay raw, because they are the probe path.
5. **Glossary blocks are 16 KiB, not 64 KiB.**
   - WebKit cold parse, at load 16: +867 ms with 64 KiB blocks, +618 ms with 16 KiB.
   - Chromium: +436 against +379 ms.
   - Recent-window deduplication (the last 8 glossaries, exact string match) shares bytes between adjacent duplicate glossaries.
6. **An extra section, `kanjiMeta.records`.** Without it, `summary()` and the counts would disagree with legacy.
7. **M6 named fallback, applied before the gate run.** Batch the reads, then prefetch up to the cache budget:
   - the reader memoizes decoded records and exact-key answers
   - the IndexedDB store keeps whole chunks in a 32 MiB LRU when a batch touches a chunk densely (2 or more pieces since pass 4; 4 before)
   - the reader caches glossary blocks' stored bytes as well as inflated ones (pass 4)
   - single pieces stay as 4 KiB Blob slices, which keeps M7 and M8 cheap

   A cold parse makes 403 batched read calls and 86 chunk gets (pass 3: 405 and 191); a warm one makes no store calls (pass 3: 4 calls of 1,939 pieces).
8. **M3 named fallback: each bank's JSON is released before the next.** Banks are parsed from their UTF-8 bytes in ~64 KiB slices cut at `],[`, so neither a bank's text nor all of its rows ever exist at once. `JSON.parse` of `[slice]` rejects any cut inside a nested array or a string; after 8 consecutive misses the rest of the bank is parsed in one go. Since pass 4 the slices are decoded in JS, not by `TextDecoder` (see "Pass 4").
9. **The engine writes its own deflate** (pass 2). The brief named fflate's `deflateSync`, whose per-call allocations set the import's memory peak; see "Import memory (M3)". fflate still inflates. Pass 4 made the encoder a quarter faster for 2.8% more bytes (chains of 16, long matches not indexed), to pay for decoding bank text in JS.
10. **Import leases, chunk lengths and sums, and lossless numbers** (pass 2). See "Byte store hardening".
11. **The key index builder holds every key** (as packed typed arrays) until `finish()`, because sorting needs them all. Every section, key pages included, is still written chunk by chunk.
12. **Harness differences.**
    - WebKit build 2336, as above.
    - One page per context, navigated between steps rather than closed: build 2336 never resolves `page.close()`.
    - RSS is summed over the runner's descendant processes, so another session's Playwright browsers never count. WebKit's GPU, WebContent and Networking processes are XPC services whose parent is launchd, so they are added by executable path under the WebKit 2336 install directory. Any that were already running when the browser launched are left out.
    - Every measured M1/M3 JMdict import, and every M2/M4 set import, runs in a freshly launched browser on a freshly wiped profile. A relaunch alone was not enough: in a reused Chromium profile, legacy runs 1 and 2 took 108 s and 113 s against 59 s for run 0 (`m3fix-1m-reused-profile/`).

## Rerun on a quiet machine

Check `uptime` first: the 1-minute load average must be below 12, and other sessions must be idle. Run from a checkout of `spike/hoshidicts-ts-engine` with its own node_modules (`npm ci`), not a symlink to another worktree's.

```bash
export PATH=$HOME/.nvm/versions/node/v24.16.0/bin:$PATH
SP=<scratch>                  # holds engine-archives/, hd-mit/ and hd-mit-build/
A=$SP/engine-archives
R=$SP/engine-spike-results/quiet

# Typecheck (the spike scripts have their own tsconfig) and unit tests
npx tsc --noEmit -p tsconfig.json --incremental false
npx tsc --noEmit -p scripts/engine-spike/tsconfig.json
npx vitest run tests/reader/dictionary-engine

# M1 (Node) and M5a-d against the real legacy importer, plus Node M6/M7 (informational)
ARCHIVES=$A/jmdict-en.zip,$A/jpdb-v2.2-kana.zip,$A/kanjidic-en.zip RESULTS=$R \
  node --expose-gc --max-old-space-size=12288 node_modules/vite-node/vite-node.mjs --mode production \
  scripts/engine-spike/node-bench.ts --runs 3
ARCHIVES=$A/jitendex.zip,$A/kanjium-pitch.zip RESULTS=$R \
  node --expose-gc --max-old-space-size=12288 node_modules/vite-node/vite-node.mjs --mode production \
  scripts/engine-spike/node-bench.ts --parity-only

# M1-M4 and M6-M9 in three browsers: every median is of 3 fresh-profile runs (about 35 minutes;
# legacy imports dominate). M3 binds on process RSS in every browser. One browser per run, so the
# load can be checked between them.
ENGINE_SPIKE_OUT=$SP/engine-spike-dist npx vite build --config scripts/engine-spike/vite.config.ts
for b in chromium webkit firefox; do
  uptime
  node scripts/engine-spike/browser-bench.mjs --browsers $b --runs 3 --series \
    --archives $A --dist $SP/engine-spike-dist --results $R
done

# M0: native hoshidicts main-mit (git -C $SP/hd-mit submodule update --init first), 3 runs each
$SP/hd-mit-build/build.sh $SP/hd-mit $SP/hd-mit-build
for run in 1 2 3; do /usr/bin/time -l $SP/hd-mit-build/import-low-ram $A/jmdict-en.zip $SP/hd-out; done
$SP/hd-mit-build/benchmark-import $A/jmdict-en.zip 3

# M10 (the second build leaves fflate out)
ENGINE_SPIKE_OUT=$SP/engine-spike-dist ENGINE_SPIKE_ENTRY=engine npx vite build --config scripts/engine-spike/vite.config.ts
ENGINE_SPIKE_OUT=$SP/engine-spike-dist ENGINE_SPIKE_ENTRY=engine ENGINE_SPIKE_EXTERNAL_FFLATE=1 npx vite build --config scripts/engine-spike/vite.config.ts
wc -c $SP/engine-spike-dist/engine.js $SP/engine-spike-dist/engine-no-fflate.js && wc -l src/reader/dictionaries/engine/*.ts
```

Pass 4 ran this block as one script (`<scratch>/p4/quiet-run.sh`, not committed), which writes `uptime` before and after every step to `steps.log` beside the results.

- **Reading the load.** Judge a gate by its summary row's `provisional` (pass 5 onwards).
  - Each row's `loads` lists the 1-minute readings it stands on: the one taken as the row is written, straight after what it measured, and, for an M1/M3 or M2/M4 import, an M6 row, M7 cold or M8, the one taken before it started. The Jitendex row reads before and after each of its imports. A summary row (`M1.summary`, `M3.summary`, `M2.*`, `M4.*`, `M2.engine.jitendex`, `M6.summary`) lists every reading of its runs.
  - `maxLoad` is the highest reading, and `provisional` is true when it is 12 or more.
  - Rows written before pass 5 (`quiet/`, `quiet-m3/`, `p4-*` and earlier) have only `load` and `provisional`, from one reading as the row was written. There, a summary shows only the load after its last run. Read its runs' rows instead, and take the `M9.control` row just before each run as the reading before it.
- **Reading M3.** Read it from each browser's `M3.summary` row (pass 3 onwards; in `p2-*` rows Chromium's `pass` was the heap rule and `rssPass` the RSS rule). Its `provisional` covers every run since pass 5; see "Reading the load".
  - It holds the median of 3 fresh-profile imports per role, and `ratio` and `pass` for process RSS, which binds in every browser. In Chromium, `heapRatio` and `heapPass` report the V8 heap plus backing stores, which does not bind.
  - `pass` is null, and M3 is not resolved by that run, when `sampled` is false: some run's median RSS gap was over 50 ms (`widestMedianGapMs`).
  - Each `M1/M3.*` row records its sampling: `samples`, `medianGapMs`, `maxGapMs`, `tailGapMs` (last sample to the end of the import), and `peakFrom`, which says whether the peak was a sample taken during the import or the reading taken once it ended. `duringPeakDeltaMB` and `finalDeltaMB` give both.
  - `peakDeltaByPartMB` shows where the peak came from: the delta per process kind. In Chromium it also shows the heap gauge's latest reading at the RSS peak (`atPeak.*`).
  - `--only-m3` stops after these imports, and `--series` writes every sample of each gauge to `series-*.jsonl`.
- **Reading M0.** Compare like with like:
  - the wall ratio, TS wall over native `low_ram` wall, against the judge's 4.0-4.4x (also wall-clock, `low_ram`)
  - the CPU ratio, TS CPU over native CPU

  Native `low_ram` uses two bank workers, so its CPU exceeds its wall time.
- `build.sh` is in this session's scratchpad. It compiles zstd and libdeflate with `clang -O2` and the hoshidicts sources with `clang++ -std=c++23 -O2`, then links upstream `benchmark/import.cpp` and a three-line `low_ram = true` driver.

## Notices draft (for Phase 2, not shipped)

```
hoshidicts (https://github.com/Manhhao/hoshidicts, branch main-mit) — the
dictionary storage design adapted in src/reader/dictionaries/engine/.

MIT License

Copyright (c) 2026 Manhhao

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

Hachidori (https://github.com/bee-san/hachidori) — credited for showing the
hoshidicts approach working in a browser extension. No Hachidori code is used.

fflate (MIT) — already a Yomu dependency; the engine's inflate. The engine
writes raw deflate with its own encoder.
```

If a later phase ports hoshidicts' deconjugator rules, add Jiten (https://github.com/Sirush/Jiten, Apache-2.0) with its NOTICE.

## Open issues

1. **The import gates cannot be measured under load 12 on this Mac.**
   - M1 and M3 pass in all three browsers in two runs each (`quiet/` and `quiet-m3/`), and Chromium's M2 (JPDB and KANJIDIC) and M4 in the quiet run. All their rows are PROVISIONAL.
   - Each browser's first legacy import began under 10. From then on, through the M1/M3 imports, the 1-minute load read 10.7-22.6, and Chromium's set imports read 11.3-23.0, with Microsoft Defender scanning the IndexedDB writes. Starting each browser below load 10 did not prevent it.
   - Until they are measured under load 12, the decision is pending (see "Verdict"). If they then pass, every gate rule 1 names passes, and ADR-0022 becomes Accepted. The owner chooses the machine.
   - Only the import runs need repeating, about 25 minutes, with the pass-5 harness, whose summary rows are provisional when any run was: `--only-import` in Chromium (M1-M4 and Jitendex) and `--only-m3` in WebKit and Firefox. The rest of the block is final.
2. **Import time paid for import memory.**
   - Decoding bank text in JS costs about 0.65 s per JMdict import in Chromium and Firefox and 0.2 s in WebKit. The encoder's faster settings win most of it back: net, and PROVISIONALLY, JMdict imports in 5.1 s in Chromium (4.5-4.7 s in pass 3), 5.4 s in WebKit and 7.6 s in Firefox.
   - Jitendex, with 541 MB of bank text, imports in 12.7 s in Chromium (final) against 10.4 s in pass 3 (limit 25 s).
   - A faster decoder, for example one that copies runs of ASCII four bytes at a time, could take back some of it, at more lines.
3. **WebKit M6 cold** now passes at FLOOR + 498 ms (limit + 800). It was + 631-650 ms before pass 4 made a cold parse read chunks whole from two touches. A cold parse makes 403 batched read calls and 86 chunk gets.
4. **M4 is measured in Chromium only, as specified.**
   - WebKit's `navigator.storage.estimate()` reports 0 MB for the engine's origin, apparently not counting IndexedDB Blob files.
   - Firefox reports usage for the whole 127.0.0.1 group, so the legacy and engine origins cannot be told apart.
5. **Read-time memory for Phase 5 on iOS.** A reader may hold more than the legacy row store does:
   - a 32 MiB page cache, which since pass 4 also holds the stored bytes of every glossary block a batch fetched (4.7 MB for the corpus page)
   - a 32 MiB chunk cache, which since pass 4 fills from any chunk a batch touches twice
   - memoized records, at about 150 B each, capped at 100,000 per kind per dictionary
   - memoized exact-key answers, capped at 200,000 per index
6. **Torn chunks** are caught on every read since pass 3, by per-page sums (see "Byte store hardening"). What remains is recovery: a torn chunk makes its dictionary fail to open or a lookup throw, and the learner has to import it again. Strict-durability chunk writes would prevent the tear, at an fsync per chunk.
7. **Harness caveats.**
   - Playwright 1.56.1's WebKit 2215 cannot open persistent contexts on macOS 26, so the bench uses build 2336 through `executablePath` and never closes pages.
   - WebKit RSS counts XPC services by install path, because launchd is their parent. Another WebKit 2336 browser started during a measurement would be counted.
   - Firefox's floor parse varied from 1.5 to 4.0 s under load, so Firefox M6 numbers are not meaningful. M6 gates only Chromium and WebKit.
   - The M10 count is 2,397 lines including `deflate.ts`; the spec's own file list, without it, is 2,247. Three lines are left under the limit.
8. **Shared cache.** Pass 1 ran in this worktree with node_modules symlinked to the release worktree's, and a plain `tsc` rewrote that worktree's `node_modules/.cache/tsconfig.tsbuildinfo`. Pass 2 replaced the symlink with an APFS clone (`cp -cR`), so nothing it ran wrote into the release worktree.
9. **Not built in the spike (Phase 5):**
   - `searchTerms`
   - the random and kanji listings, which work through store scans but are not optimized
   - exports
   - the Dexie and reader-JSON imports
   - the catalog, Web Lock and epoch fence
   - legacy migration
10. **Pending deletes in other tabs.** The IndexedDB store fails its opens fast only behind its own tab's pending delete. An open queued behind another tab's pending delete still waits until that delete finishes, as IndexedDB orders them. Phase 5's catalog should carry a "clearing" flag that other tabs check before they open.
