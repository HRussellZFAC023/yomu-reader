# Public lookups own outcomes and recovery

Status: implemented locally; rebuild acceptance in progress.

## Decision

JPDB vocabulary lookup returns `{ info, status }`; public search returns `{ cards, status }`. Status is `complete` or `partial`. A transport failure or active provider backoff without usable data rejects. A successful empty response is a complete result, not a failed request.

Completion describes the bounded acquisition requested by the caller. It does not mean every possible example or compound was retrieved. Deliberately skipped enrichment beyond a request budget is not a transport failure.

The client owns shared requests, bounded memory caches, retry timing and proxy identity. A request captures one proxy for its whole acquisition. Clearing results or changing proxy invalidates old completions; they cannot populate the current cache or write persistent entries. Clearing results does not bypass provider backoff.

Only complete, usable results enter persistent cache kinds `vocabulary-complete-v2` and `search-complete-v2`. Readers validate their concrete shapes and reject empty persisted results. Old unqualified vocabulary/search entries cannot establish completeness. The shared cache namespace and unrelated pitch entries are not cleared.

Partial results remain usable while the latest provider backoff is active, including extensions caused by concurrent failures. After that deadline they can be refreshed. Genuine empty responses have a short negative cache; other failures have a short retry delay. Presentation caches must preserve this distinction instead of retaining an empty fallback or partial response as a complete answer.

## Rejected alternative

Do not add a second `lookupResult` method while preserving the old ambiguous return values. Migrate current callers and test adapters to the explicit outcome. A missing companion reports unavailability rather than a successful empty lookup.

## Evidence

`tests/reader/jpdb-vocabulary-recovery.test.ts` exercises the real client and HTML parsers with mocked transport and persistence. It covers failure and empty-response recovery, incomplete supplements, qualified cache reads, malformed cached data, shared requests, staggered rate limits, and stale completions after clear/proxy changes. `tests/reader/jpdb-definitions-keyless.test.ts` covers partial-result expiry in both render-cache paths.

These tests do not establish deployed-provider or real-browser acceptance. No release or deployment is authorized by this decision.
