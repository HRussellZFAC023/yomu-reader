# Dictionary reads share one Port per macrotask

Status: implemented locally, 5 October 2026 (dictionary engine Phase 4).

## Context

In the extension every store call was a separate runtime Port with its own admission, queue slot and epoch reads (ADR-0010, ADR-0015). Annotating a 945-character page made 475 Port requests. ReaderParser also allowed only 12 enrichment reads in flight, so even a coalescing transport could not carry more than 12 reads in one round trip. The client was a reflection `Proxy`, and the host dispatched any method name that matched a pattern through `Reflect.apply`.

## Decision

1. The client is built from a typed method table, `DICTIONARY_STORE_METHODS`. It classifies every public store method as a read, a call or a notification. `satisfies Record<keyof LocalDictionaryStore, …>` makes a new public method a typecheck failure until it is classified. The host accepts only names in the table.
2. Reads issued in one macrotask form a **Read Batch**: one Port message (`readBatch`, a list of `[method, args]` pairs), one admission, one host queue slot, two epoch reads and one adopted learning target. A change of caller epoch or learning target starts another batch. Each read gets its own result or error, so one failed read does not fail the others. A stale epoch after the batch fails every read in it, as it would have failed each separate call. The host runs a batch's reads 12 at a time.
3. Calls keep their own Port, epoch checks and order. Calls are mutations, uploads, operations with progress callbacks, binary results and search-index work. If a Read Batch contains a call, the host returns an error for that entry and does not run it.
4. ReaderParser does not limit enrichment reads for a store that marks itself `coalescesReads`, because the host limits IndexedDB fan-out where the database is. A store that runs in the parser's own realm keeps the 12-read limit.
5. The client sends a batch with `setTimeout(0)`. Chrome may delay timers in hidden tabs by up to a second, but the page scanner does not scan hidden documents, so visible parses are not delayed.
6. Only the extension build includes the client. The userscript build returns its origin store even if it can see another extension's runtime (the no-runtime case in ADR-0014). Leaving the client out shrinks the size-limited core by 17,753 bytes.

## Consequences

- Measured in Chromium with the built extension (JMdict, KANJIDIC and JPDB kana frequency imported; 945-character corpus; network blocked): Port messages fell from 475 to 86–90 over two runs, and the messages carrying the parse's own reads fell from 168 to 5. Both builds made the same 475 store calls, and the annotated DOM was byte-identical.
- Most remaining messages come from background pitch enrichment in `main.ts`. It paces reads on purpose: an 8-wide local lane, a 4-wide public lane that waits for idle time, and one deconjugation lookup after another. A Read Batch only merges reads issued in the same macrotask, so these lanes still send about one message per step. Widening the local lane for coalescing stores, or skipping local pitch reads when no pitch dictionary is installed, would need separate decisions.
- A read waits up to one macrotask before it is sent.
