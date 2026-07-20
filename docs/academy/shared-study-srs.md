# Shared Study / Academy contract

Study and Academy use the same vocabulary collection, review providers, and learner evidence. Academy mounts Study through `src/academy/integration/study-module.ts`; it does not create a second deck.

- `/study/` is the canonical hosted route. `/newtab/` remains compatible with existing browser and extension links.
- `yomu-local` remains the stored provider id so existing data keeps working. The learner-facing source is **Academy**.
- Committed lesson targets, source vocabulary, repairs, and authored scene encounters may enter the collection. Page loads do not. Adds use the canonical `expression + reading` key, carry provenance, deduplicate, and can be undone.
- Local Study stays available without an account. Server profiles, pairing, and sync require a Google account; the HMAC-matched `<PRIVATE_CLASS_INVITE>` session is the explicit zero-friction anonymous exception. The Class Board still requires an account and explicit visibility opt-in.
- The Worker owns Google Authorization Code + PKCE, account linking, and secure cookies. It stores a keyed hash of the Google subject, never the Google name, photo, email, browser token, or raw subject.
- Stripe Checkout first creates a pending purchase. A paid code remains retryable and binds atomically with account/profile attachment only after verified Google sign-in, with one code per account and one account per code. Account deletion retains a permanent minimal redemption tombstone and verified payment-audit rows so codes cannot become transferable and payment/fraud disputes remain auditable.
- Cross-device state is the union of append-only, client-encrypted learner-event envelopes. D1 never receives event plaintext or provider credentials; clients pull by cursor and re-derive SRS, grammar-known, and Academy projections locally.
- Profile and account exports are cursor-paginated. Profile deletion removes events, devices, and paired sessions; account deletion also removes identity, memberships, and aggregates.
- Class identity is the learner's chosen name plus a six-digit discriminator. The Class Board is off by default and returns only opted-in aggregate progress. Words, sentences, answers, failures, and raw learner events never enter its response.
- Study returns to Academy with `/study/?return=academy&context=<short id>`; the mounted session owns card identity instead of serializing it. Standalone Study uses only a controller-local opaque token before reveal and produces the portable `card`/word/reading link only after an intentional reveal.
- Academy Study sessions use the shared module with a living-paper surface and a configurable 15-minute countdown.

The Reader-facing contracts live in `src/reader/srs/shared.ts` and `src/reader/srs/account-contract.ts`. The authoritative API, encryption, lifecycle, and rate-limit contract is `workers/yomu-academy/README.md`; implementations live in `workers/yomu-academy/src/` and `src/academy/domain/class-board.ts`.

## Jiten reference

The read-only reference is `references/jiten` at commit `02e625520927670590780e7b0f7ccb48987102e0`, cloned from `https://github.com/obfusk/jiten`. It is AGPL-3.0-or-later, so Yomu copies no code or assets. The audit used its local-first history and offline patterns only; Jiten remains a dictionary/provider adapter.
