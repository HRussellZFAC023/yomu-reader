# ADR 0010: The Extension Background Owns Imported Dictionaries

**Status:** Accepted

**Date:** 2026-08-05

## Context

Browser content scripts execute against many page origins. A Yomitan store
opened there inherits the page's IndexedDB boundary, so importing a dictionary
on one site does not make it available on another. Replicating source archives
through extension settings still leaves several database copies, consumes much
more storage, and makes reset and upgrade ordering harder to prove.

The browser extension already has one generated background realm. The external
UserScript-Compiler owns that file, so Yomu cannot replace its entry point. MV3
may also suspend a service worker while a large dictionary import is still
running. The userscript distribution has no extension runtime and must retain
its existing direct-store behavior.

## Decision

In extension builds, the generated background is the **Shared Dictionary Host**:

1. A self-contained esbuild IIFE is appended by the existing extension runtime
   hardening step. Build-time aliases replace document/userscript storage,
   logging, settings, and archive-cache dependencies with worker adapters.
2. The host opens `YomitanDictionaryStore` in the extension origin. It reads the
   compiler-prefixed current managed-state epoch and settings slot directly
   from `chrome.storage.local` or `browser.storage.local`; it never re-enters a
   GM/content storage facade.
3. Content scripts receive an ES Proxy over
   `Pick<YomitanDictionaryStore, keyof YomitanDictionaryStore>`. Property access
   discovers methods from the direct fallback object, so adding a public store
   method cannot require updating a remote-method list.
4. A short versioned capability probe selects the host. No runtime or no timely
   response returns the existing direct store. A remote method failure is not a
   fallback signal because retrying a mutation could duplicate or split work.
5. `runtime.sendMessage` is only the short capability probe. Every store method
   uses a named `runtime.Port`, so a future method cannot silently miss
   keepalive or ordering merely because its name looks like a read. The client
   sends actual keepalive messages while the operation is pending and transfers
   files/blobs in bounded base64 chunks. A default term search can return its
   cursor fallback immediately while retaining that Port and queue slot until
   its lazily started search-index build completes.
6. Each request carries the active learning-target identity. The host validates
   and adopts that target, then orders all store operations across sites. This
   prevents ambient-target changes, lazy index writes, resets, or deletions from
   racing an active import.
7. The build hardens the compiler listener to ignore foreign channels
   synchronously. Artifact checks require one host marker, one compiler-channel
   guard, no unresolved storage-prefix placeholder, and no content-side GM
   storage identifier in the host bundle.

The extension-origin database is authoritative for extension content scripts.
Archive replication is inert in this host because the database itself is
already shared. Factory-reset epoch fences still surround reads and mutations;
after reset quiesces the host and commits a new epoch, the long-lived worker
starts a fresh epoch session for newly loaded content realms.

## Consequences

- One import serves lookups on every site in the installed extension.
- MV3 imports remain attached to a live Port instead of a one-shot message.
- Content scripts no longer open a dictionary database during the healthy
  extension path; their direct store exists only as the compatibility fallback.
- The userscript build keeps its original origin-local persistence and returns
  the exact direct store when no extension runtime exists.
- Extension package generation now depends on the background IIFE bundle and
  exact compiler storage-prefix extraction. Compiler shape drift fails the
  build rather than silently shipping defaults or a catch-all listener.
- Custom learning-target overrides must also exist in the background bundle;
  an identity the host cannot resolve is rejected explicitly.

## Rejected Alternatives

- **One IndexedDB per visited site:** this is the defect being removed.
- **Replicate dictionary ZIPs through `storage.local`:** duplicates large
  archives and still requires per-origin databases and coordinated migrations.
- **Hand-written RPC method inventory:** drifts when the store grows and fails
  only on the first missed hot-path call.
- **One `sendMessage` for imports:** does not supply the long-lived, active
  traffic needed by multi-minute MV3 work.
- **Fallback after a remote operation error:** can replay a partly committed
  import or mutation into a different database.
