# Dictionary calls retain the caller's reset generation

The shared extension host outlives pages and can adopt a new Managed State Epoch after reset. A caller cannot: protocol v2 carries its realm's captured epoch on every operation, including cache invalidation. Missing or malformed epochs reject; `null` explicitly represents the initial generation. Recreating a proxy does not renew a realm's capture. There is no protocol-v1 fallback.

The host checks admission and queued execution, including asynchronous store acquisition and result/index completion. Host-only checks were insufficient: a page that missed reset notifications could import into the freshly reset database through the host's newer session.

The existing reset coordinator deletes before committing the epoch and once afterward to clear a concurrent recreation. Only that second `deleteDatabase` may carry a cleanup receipt: the caller must be exactly one generation behind, and the committed reset ID and live `prepare` signal must both match the receipt. The exception does not renew the caller or authorize other methods. It expires when the reset completes. Removing it breaks final cleanup; broadening it lets stale pages erase new dictionaries.

Compiled-host tests exercise real RPC and IndexedDB for stale callers, replacement proxies, delayed uploads, fresh-realm access and receipt rejection. The different-live-reset test loses newly imported records when only the signal-ID guard is removed. Installed-browser proof remains separate; no release is authorized.
