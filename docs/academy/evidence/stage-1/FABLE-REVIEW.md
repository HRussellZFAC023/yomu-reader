# Stage 1 Fable review

- **Reviewer:** Claude Fable 5, read-only plan mode
- **Architecture session:** `4308dfa7-1730-450e-b96d-6a22239cd44e`
- **Final delta session:** `7e12dfb2-4dbc-4cd4-bb65-9af74ec64bab`
- **Initial verdict:** `BLOCK`
- **Follow-up verdict:** `PASS`
- **Date:** 2026-07-12

The initial adversarial review found release-blocking gaps in runtime-art
provenance, direct placement speech, failed-navigation caching, stale shell
revisions, event-batch atomicity/idempotence, duplicate review scheduling, and
keyboard-equivalent handwriting. It also identified scene/audio cancellation,
KanjiVG attribution/sanitisation, route size, touch-target, bilingual status,
and limitations-copy issues.

The follow-up re-read the current Academy diff and re-ran all 61 Academy tests.
It verified these closures:

- every shipped art delivery has an approved ledger verdict, byte hash, runtime
  home, and typed-manifest coverage; rejected families remain explicit;
- placement and Lab speech use the injected pronunciation service and
  `AudioDirector`, with overlapping duck tokens and disposal cancellation;
- navigation caches only successful responses and shell revisions are rendered
  from a SHA-256 of the allowlisted runtime and hosted Reader dependencies;
- IndexedDB event batches are atomic, deterministic milestone/review IDs are
  idempotent, and scheduled-review projection prevents duplicates;
- keyboard handwriting produces transparently distinct evidence while sharing
  the writing completion/review path;
- KanjiVG is rebuilt through a sanitising parser and ships its licence and
  attribution in the offline core;
- scene completion, route ownership, bilingual announcements, touch targets,
  and Stage 1 limitations now match the implementation.

Non-blocking later-stage follow-ups are to migrate remaining inline bilingual
content into canonical copy tables during volume authoring, remove the local
`<PRIVATE_CLASS_INVITE>` literal before Stage 7 live access, cross-link recording limitations
when Stage 6 begins, and optionally make the recognition `aria-live` setting
explicit.

The final delta review covered the subtitle-destroy guard, linked hosted-CSS
ownership, FAB opacity floor, docs contrast tokens, Learner Event validator
decomposition, and the two complexity-only QA-script refactors. It initially
returned `BLOCK` because the primary CTA's hover background still used resting
accent ink—a state axe does not exercise. The repaired implementation:

- derives brand hover ink from the actual hydrated hover background;
- falls back from near-black to pure black when neither near-black nor white
  reaches 4.5:1;
- applies the hover ink to the Reader mirror and any rendered Reader words;
- proves the mid-tone fallback with a behavioral unit test; and
- measures the injected visible mirror at 5.0978:1 in Browser.

Fable re-inspected those changes and returned final verdict `PASS`, finding the
delta release-safe.
