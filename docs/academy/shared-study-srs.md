# Shared Study / Academy contract

Study and Academy use the same vocabulary collection, review providers, and learner evidence. Academy mounts Study through `src/academy/integration/study-module.ts`; it does not create a second deck.

- `/study/` is the canonical hosted route. `/newtab/` remains compatible with existing browser and extension links.
- `yomu-local` remains the stored provider id so existing data keeps working. The learner-facing source is **Academy**.
- Committed lesson targets, source vocabulary, repairs, and authored scene encounters may enter the collection. Page loads do not. Adds use the canonical `expression + reading` key, carry provenance, deduplicate, and can be undone.
- Local Study stays available without an account. Academy sync and the Class Board require the existing enrolled account flow.
- The Worker owns Google Authorization Code + PKCE, account linking, and secure cookies. It stores a keyed hash of the Google subject, never the Google name, photo, email, browser token, or raw subject.
- Class identity is the learner's chosen name plus a six-digit discriminator. The Class Board is off by default and returns only opted-in aggregate progress. Words, sentences, answers, failures, and raw learner events never enter its response.
- Study returns to Academy with `/study/?return=academy&context=<short id>`; the mounted session owns card identity instead of serializing it. Standalone Study uses only a controller-local opaque token before reveal and produces the portable `card`/word/reading link only after an intentional reveal.
- Academy Study sessions use the shared module with a living-paper surface and a configurable 15-minute countdown.

The Reader-facing contracts live in `src/reader/srs/shared.ts` and `src/reader/srs/account-contract.ts`. The authoritative account, privacy, and aggregate-sync implementations live in `workers/yomu-academy/src/` and `src/academy/domain/class-board.ts`.

## Jiten reference

The read-only reference is `references/jiten` at commit `02e625520927670590780e7b0f7ccb48987102e0`, cloned from `https://github.com/obfusk/jiten`. It is AGPL-3.0-or-later, so Yomu copies no code or assets. The audit used its local-first history and offline patterns only; Jiten remains a dictionary/provider adapter.
