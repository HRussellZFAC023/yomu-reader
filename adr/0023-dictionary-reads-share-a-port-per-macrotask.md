# Dictionary reads share one Port per macrotask

Status: implemented locally, 5 October 2026 (dictionary engine Phase 4).

## Context

In the extension every store call was a separate runtime Port with its own admission, queue slot and epoch reads (ADR-0010, ADR-0015). Annotating a 945-character page made 475 Port requests. ReaderParser allowed only 12 enrichment reads in flight and background pitch enrichment only 8, so even a coalescing transport could not carry more than that in one round trip. The client was a reflection `Proxy`, and the host dispatched any method name that matched a pattern through `Reflect.apply`.

## Decision

1. The client is built from a typed method table, `DICTIONARY_STORE_METHODS`. It classifies every public store method as a read, a call or a notification. `satisfies Record<keyof LocalDictionaryStore, …>` makes a new public method a typecheck failure until it is classified. The host accepts only names in the table.
2. Reads issued in one macrotask form a **Read Batch**: one Port message (`readBatch`, a list of `[method, args]` pairs), one admission, one host queue slot, two epoch reads and one adopted learning target. A change of learning target starts another batch; the caller epoch cannot change, because the client keeps the epoch its capability probe returned. Each read gets its own result or error, so one failed read does not fail the others. A stale epoch after the batch fails every read in it, as it would have failed each separate call. The host runs a batch's reads 12 at a time.
3. Calls keep their own Port and epoch checks. Calls are mutations, uploads, operations with progress callbacks, binary results and search-index work. A call first sends the pending Read Batch, so the host receives reads and calls in the order the page made them. If a Read Batch contains a call, the host returns an error for that entry and does not run it.
4. ReaderParser's enrichment gate and ReaderApp's local pitch lanes do not limit reads for a store that marks itself `coalescesReads`, because the host limits IndexedDB fan-out where the database is. `dictionaryReadConcurrency` is the one place that reads the mark. A store in the page's own realm, as in the userscript, keeps the 12-read and 8-read limits.
5. The client sends a batch with `setTimeout(0)`. Chrome may delay timers in hidden tabs by up to a second, but the page scanner does not scan hidden documents, so visible parses are not delayed.
6. Only the extension build includes the client. The userscript build returns its origin store even if it can see another extension's runtime (the no-runtime case in ADR-0014). Leaving the client out shrinks the size-limited core by 17,554 bytes (1,998,392 to 1,980,838 on top of ADR-0022's changes).

## Consequences

- Measured in Chromium with the built extension (JMdict, KANJIDIC and JPDB kana frequency imported; 945-character corpus; network blocked): Port messages fell from 475 to 66–68 over two runs, and the messages carrying the parse's own reads fell from 168 to 5. Both builds made the same 475 store calls, and the annotated DOM was byte-identical. With Jitendex, KANJIDIC, Kanjium pitch and JPDB kana and the corpus repeated five times, messages fell from 424 to 47 and every word kept the same attributes.
- The Phase 4 target of at most eight messages per page holds for the parse, not for the whole page. The rest is pitch enrichment paced on purpose: the 4-wide public pitch lane, where each word's local reads, network lookup and component reads run one after another, and, with a pitch dictionary installed, local-only pitch in 12-word chunks that wait for idle time. Changing either pacing would need a separate decision. So would skipping local pitch reads when no pitch dictionary is installed: `hasPitchMetaDictionaries` samples 40 rows per dictionary, so a wrong "none" would lose pitch.
- A read is sent from a zero-delay timer after its macrotask, or sooner when the page makes a call.
