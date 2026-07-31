# ADR 0009: Factory reset is a managed-state epoch boundary

- Status: Accepted
- Date: 2026-07-31

## Context

Factory reset previously deleted whichever keys one realm could enumerate and
used same-origin notifications plus an in-memory guard to discourage writes.
That was not an authoritative inventory: a Firefox/Tampermonkey ambient-only
`GM_listValues` binding was missed, prefix families had no owner enumeration,
and dictionary archives were not registered. A tab or companion bundle that
retained old state could write it back after deletion; a surviving archive then
re-imported its dictionary.

The userscript core and runtime companion are independently bundled IIFEs in one
JavaScript realm. Yomu also runs on many origins, each with separate IndexedDB,
localStorage, and sessionStorage. Reset therefore cannot rely on module scope,
same-origin delivery, or one best-effort key sweep.

## Decision

Factory reset has two authorities:

1. The managed-state registry declares every exact key, prefix family, browser
   database, cache, and service worker. A prefix owner supplies an enumerator
   when global GM enumeration is unavailable. An incomplete inventory or an
   unverifiable deletion fails closed.
2. `yomu:state-epoch` is a monotonic shared register. Generation zero preserves
   the legacy on-disk format. Reset deletes the declared inventory first and
   commits the next epoch last, serialized against concurrent reset commits. A
   page-local epoch is only a cache and never outranks shared GM or extension
   storage. Once the authoritative write may have landed, the initiating realm
   reloads even if final verification or signal cleanup fails.

Each JavaScript realm captures one epoch and never advances it. The capture is
stored on a realm-global symbol so independently bundled Yomu IIFEs share it.
A stale realm may not write, promote a local mirror, acquire a storage lease, or
accept a newer database marker; it must reload.

Post-reset GM values use generation-specific physical slots and epoch envelopes.
Deletion uses a current-generation tombstone, so delayed old writes and deletes
target disjoint slots. Backups project current logical values only. Slot keys
are decoded before bridge privacy checks so a physical private value never
becomes page-readable.

Every normal Yomitan and Anki IndexedDB mutation reads the database epoch marker
inside the same read/write transaction that performs the mutation. Missing,
malformed, stale, newer, or conflicting markers abort before data changes.
Upgrade transactions and reset-owned `deleteDatabase` operations are the only
exceptions.

Yomu-owned localStorage and sessionStorage caches have independent per-area
epoch certificates and generation slots. Reader, Study, and document-start
features cross the web-storage barrier before hydrating cache state. Host-owned
keys are never included in the purge.

## Consequences

- A completed reset remains authoritative even when another origin never
  received its prepare signal.
- Delayed old physical bytes can remain after an already-running operation, but
  no current reader can observe them; a later authoritative sweep removes them.
- Every new persistent store must register its inventory and use the relevant
  GM, IndexedDB, or web-storage epoch fence.
- Malformed or conflicting epoch evidence blocks mutation instead of guessing.
- Factory reset remains local-first and requires no backend service.
- Tests must include ambient-only GM bindings, unavailable enumeration, stale
  interleavings, independent bundles in one realm, and a real reboot that proves
  archives cannot re-import dictionaries.
