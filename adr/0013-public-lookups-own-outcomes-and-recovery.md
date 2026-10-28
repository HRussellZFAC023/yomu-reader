# Public lookups own outcomes and recovery

Status: implemented locally; rebuild acceptance in progress. Revised 2026-09-30 for the v2.0.0 release audit (F45, F48): usable partial results now keep their normal lifetime instead of expiring after one second.

## Decision

JPDB vocabulary lookup returns `{ info, status }`; public search returns `{ cards, status }`. Status is `complete` or `partial`. A transport failure or active provider backoff without usable data rejects. A successful empty response is a complete result, not a failed request.

Completion describes the bounded acquisition requested by the caller. It does not mean every possible example or compound was retrieved. Deliberately skipped enrichment beyond a request budget is not a transport failure. A combined Immersion Kit + Nadeshiko fast-first search is complete when its first non-empty source answers: the slower source's result is discarded by design, so retrying it could only change the example set.

The client owns shared requests, bounded memory caches, retry timing and proxy identity. A request captures one proxy for its whole acquisition. Clearing results or changing proxy invalidates old completions; they cannot populate the current cache or write persistent entries. Clearing results does not bypass provider backoff.

Only complete, usable results enter persistent cache kinds `vocabulary-complete-v2` and `search-complete-v2`. Readers validate their concrete shapes and reject empty persisted results. Old unqualified vocabulary/search entries cannot establish completeness. The shared cache namespace and unrelated pitch entries are not cleared.

A usable partial result has data, but an optional sub-request (a supplement page or a linked-audio page) failed. It keeps the same in-memory lifetime as a complete result (five minutes in the JPDB client), both in the client and in presentation caches, but it never enters persistent cache; it is refreshed when that lifetime ends. Partial results also stay usable past their lifetime while the latest provider backoff is active.

Short lifetimes are reserved for failures. A transport failure, or an empty answer that a failed sub-request may explain, is retried after about a second or when provider backoff ends. A genuine empty response has a 10 s negative cache. Presentation caches shorten their own lifetime only in these cases, never for usable partial data. That keeps the popover render cache at 30 s for a word whose linked audio timed out. Study keeps a card's usable examples for the session, as v1.9.3 did. The cache is bounded and is cleared on reset, context change or online recovery, so the example revealed on the back is always the one prepared for the front.

## Rejected alternatives

Do not add a second `lookupResult` method while preserving the old ambiguous return values. Migrate current callers and test adapters to the explicit outcome. A missing companion reports unavailability rather than a successful empty lookup.

Do not count supplement or linked-audio failures as complete, which is what v1.9.3 did. That persisted missing examples or compound audio buttons for 24 hours. Do not expire usable partial data after one second, which the rebuild did before this revision. Every reopen then refetched the vocabulary page, its supplements and up to eight audio pages, increased the chance of hitting provider rate limits, and let Study reveal a different example from the one on the front. Do not add a separate retry schedule for partial data: it would duplicate provider backoff and repeat the same full fetch, and the popover render cache would hide most upgrades anyway.

## Evidence

`tests/reader/jpdb-vocabulary-recovery.test.ts` exercises the real client and HTML parsers with mocked transport and persistence. It covers failure and empty-response recovery; incomplete supplements kept for the normal lifetime and refetched when it ends; a linked-audio timeout that no longer refetches the word; usable partial data served past its lifetime during provider backoff; qualified cache reads; malformed cached data; shared requests; staggered rate limits; and stale completions after clear or proxy changes. `tests/reader/jpdb-definitions-keyless.test.ts` shows both render-cache paths keep usable partial data for 30 s and still retry a failed lookup after one second. `tests/reader/study-examples-recovery.test.ts` and `tests/reader/study-examples-transport.test.ts` show that a combined fast-first winner is cached rather than requeried, and that Study reveals the example prepared on the front. `tests/reader/study-examples.test.ts` covers front-sentence and acquisition lifetimes for usable partial versus empty partial results.

These tests do not establish deployed-provider or real-browser acceptance. No release or deployment is authorized by this decision.
