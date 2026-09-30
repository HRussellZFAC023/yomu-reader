# Dictionary probe failure does not change ownership

Status: implemented locally; verification in progress.

Supersedes the timeout fallback in ADR-0010, decision 4. The rebuild's clean-break direction does not preserve older extension compatibility by creating another data owner.

## Decision

When no extension runtime is present, return the existing direct dictionary store. Once a usable extension runtime is detected, all dictionary operations belong to its Shared Dictionary Host.

A missing, incompatible or timed-out capability response rejects the operation. It cannot open or mutate the page-local dictionary store. Concurrent callers share one probe. A failed probe has a one-second cooldown measured with a monotonic clock; a later operation may probe the same owner again. This retries discovery, not the failed dictionary operation. Remote mutation failures are never replayed automatically.

Recognized host errors, including reset/epoch errors, retain their identity and metadata. Capability/connect failures carry localized retry/reload guidance. A lost operation connection warns that the operation may already have completed. Failed Port writes settle the request even if no disconnect event arrives, and stop further file transmission. Synchronous cache invalidation remains a best-effort request to the host; it does not invalidate the unused local store.

## Consequences

Cold background startup can cause a visible, recoverable failure, but cannot silently create a second dictionary database. An incompatible extension needs updating instead of a per-site fallback.

This change does not delete old page databases, and their bytes must not be purged merely because the canonical host is unavailable. Page databases keep their v1.9.3 name (ADR-0010), so a userscript or hosted Study still reads the dictionaries an origin imported before 2.0. This decision does not solve userscript-manager cross-site storage, which has no native extension runtime.

## Verification

`dictionary-background-store.test.ts` covers timeout rejection for reads/imports, concurrent probes and cooldown, recovery through the same proxy, incompatible responses, preserved host errors, both runtime messaging styles and no remote mutation replay. Its compiled-worker case also proves timeout → explicit retry → real RPC import → IndexedDB lookup without using the direct fallback store.

Installed-browser verification and release approval are separate gates. No release is authorized.
