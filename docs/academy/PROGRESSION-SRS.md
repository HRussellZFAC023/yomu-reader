# Academy Progression & SRS Specification

Normative spec for `src/academy/progression-engine.ts`. This module is a pure,
deterministic domain engine — no `Date.now()`, no randomness, no I/O. It does
not replace `src/academy/progress.ts` (see [Integration boundary](#integration-boundary)).

## IDs are opaque

`unitId` and `activityId` are non-empty, trimmed strings. The engine never
parses, pattern-matches, or assumes structure (no `lesson-` prefixes, no
numeric ordinals). Any curriculum representation — `foundation-course.ts`'s
`lesson-01-hajimemashite` style IDs, `curriculum.ts`'s IDs, or an unrelated
scheme — works identically. Course order is defined solely by the order of
`units` and `activities` arrays passed to `defineCourse`.

## Course definition

`defineCourse(units)` validates and normalizes:
- At least one unit; each unit has at least one activity and at least one
  required activity so its completion gate is reachable.
- No duplicate `unitId` across the course; no duplicate `activityId` within a unit.
- Each activity has `required` (default `true`) and `isCheckpoint` (default `false`).
  Checkpoints are ordinary assessed activities for gating purposes — the only
  distinction is presentational (`isCheckpoint` flag surfaces in summaries).

## State shape

`ProgressionState` is serializable and stores activity state plus the first
completion timestamp for each unit and the course. Live mastery is always
derived by `summarizeUnit` / `summarizeCourse`; only historical completion
facts are stored so they survive later lapses.

Each `ActivityState` tracks: attempt count, first/last attempt timestamp, the
last `attemptId` seen (for idempotence), `wrongPending`, `masteredAt`, and an
optional SRS schedule (`intervalIndex`, `intervalDays`, `dueAt`).

## Activity state machine

An activity is one of:
- **not-started** — no recorded activity state.
- **in-progress** — has a recorded state but is not currently mastered
  (either never yet answered correctly, or `wrongPending` is set).
- **completed** — `masteredAt !== null && !wrongPending`. This is the
  "currently mastered" state, not "ever mastered" — see [Lapses](#lapses-and-completedat).

### Wrong-answer repair

A wrong (`correct: false`) attempt or review sets `wrongPending = true`. While
`wrongPending`, the activity cannot be `completed` regardless of any prior
`masteredAt`. It is surfaced via `selectWrongAnswerQueue` and must be repaired
with a correct answer before it re-enters the SRS ladder. A correct attempt
while `wrongPending`:
1. Clears `wrongPending`.
2. Sets `masteredAt` (if not already set).
3. **Restarts** the SRS ladder at interval index 0 (1 day) — a repair is
   always treated as "just learned," never resumes a stale ladder position.

### SRS ladder

Intervals: `SRS_INTERVAL_DAYS = [1, 3, 7, 14, 30]` days (matches `progress.ts`'s
`REVIEW_INTERVAL_DAYS`, duplicated intentionally — this module has no
dependency on `progress.ts`). The ladder only moves via `applyReview`, never
via plain attempts:

- A **successful due review** advances `intervalIndex` by one step, capped at
  the last index (30 days repeats thereafter).
- A **wrong due review** resets `intervalIndex` to 0 (1 day) **and** sets
  `wrongPending = true` — a lapsed review is treated exactly like a fresh
  wrong answer and returns to the wrong-answer repair queue, not just a normal
  SRS reset.
- `applyReview` rejects an activity while `wrongPending`; repair must be an
  explicit correct `applyAttempt` before scheduled reviews can resume.
- The first correct attempt on an activity that has never had an SRS entry
  starts the ladder at index 0 (1 day), identical to a repair.
- A plain correct **attempt** (not a review) on an activity that already has
  an active SRS schedule and is not `wrongPending` does **not** touch the
  schedule. Only `applyReview` — explicitly tied to a due item — advances or
  resets the ladder. This prevents incidental re-practice from silently
  perturbing the review calendar.

#### Early reviews

`applyReview` throws a `RangeError` if `reviewedAt < schedule.dueAt`. Reviews
must be submitted at or after their due time; there is no "review ahead of
schedule" behavior in this engine — a caller wanting early practice should use
`applyAttempt` on a different assessed activity, not `applyReview`.

### Lapses and `completedAt`

A unit's `completedAt` is captured the first time all required activities are
collectively mastered and is **never cleared**. Its completion `state` remains
`completed`: completion is a historical fact, not a claim of permanent
mastery. `currentlyMastered` is derived independently and becomes `false` if
a required activity lapses, then returns to `true` after repair. Course
completion follows the same rule. Per-activity `masteredAt` records first
mastery and is preserved across lapse and repair.

## Checkpoints

Checkpoints are explicit, required, assessed activities — not automatically
inferred, not tied to story/visual completion of any kind (Academy narrative
scenes must never write mastery; only `applyAttempt`/`applyReview` on a
defined activity ID does). A unit's gate is: every activity with
`required !== false` (this includes any checkpoint activities) must be
`completed`. Non-required activities never block unit completion.

## Unit and course completion

- **Unit**: `not-started` (no activity has any recorded state) →
  `in-progress` (some activity started but the completion gate has never been
  met) → `completed` (the gate was met at least once). `completedAt` is the
  transition time and remains fixed. `currentlyMastered` reports the live gate.
- **Course**: `not-started` → `in-progress` → `completed`, aggregated the same
  way across all units in `CourseDefinition.units`. Its fixed `completedAt` is
  the first transition time at which every unit has completed.

## Ordering guarantees

`selectWrongAnswerQueue` and `selectDueReviews` return **stable, deterministic**
order:
- Wrong-answer queue: earliest `lastAttemptedAt` first, ties broken by the
  activity's position in `CourseDefinition` (unit order, then activity order
  within the unit).
- Due-review queue: earliest `dueAt` first, same course-order tiebreak.
  Activities with `wrongPending` are excluded — they only ever appear in the
  wrong-answer queue, never simultaneously in both.

`summarizeCourse`/`summarizeUnit` iterate units/activities in course-declared
order, so their output order matches the course definition exactly.

## Same-timestamp and out-of-order submissions

- Two attempts submitted with the exact same `attemptedAt` are both accepted
  in call order; the later call's outcome wins (last-write, deterministic
  because caller ordering is deterministic — there is no internal
  reordering by timestamp for equal values).
- An attempt with `attemptedAt` strictly *before* the activity's currently
  recorded `lastAttemptedAt` is rejected with a `RangeError` — the engine
  never silently reorders or discards conflicting history.
- Immediately replaying the same event with the same `attemptId` is a no-op.
  Reusing that key for a different event kind, outcome, or timestamp throws
  `TypeError` while it remains the activity's latest event key. Attempts and
  reviews share this per-activity event-key namespace.
- All other invalid input (unknown unit/activity ID, non-boolean `correct`,
  non-finite timestamp, review with no scheduled SRS entry, early review)
  throws `TypeError`/`RangeError` rather than corrupting state.

## Immutability

Every exported function is pure: `applyAttempt`/`applyReview` return a new
`ProgressionState`; the input state and its `activities` array are never
mutated in place. Callers may safely hold onto a previous state reference
(e.g. for undo, diffing, or persistence snapshots).

## Integration boundary

This module is intentionally decoupled from `src/academy/progress.ts` and
`src/academy/app.ts`:
- `progress.ts` remains the persistence-facing repository (IndexedDB/
  localStorage-backed), keyed by `lessonId`/`taskId`, owning its own
  attempt/resume/review-queue storage model.
- `progression-engine.ts` has no persistence, no `lessonId`/`taskId` coupling,
  and no dependency on any specific curriculum module (`foundation-course.ts`,
  `curriculum.ts`). A caller wiring this engine into the app is expected to:
  1. Build a `CourseDefinition` once from whichever curriculum module is
     active, mapping its route/lesson IDs to opaque `unitId`/`activityId`
     values.
  2. Persist `ProgressionState` itself (it is plain JSON-serializable data),
     using `progress.ts`'s existing storage adapters or a new one — this
     module does not prescribe how.
  3. Call `applyAttempt` only from explicit assessed-activity submission
     paths, never from story/visual/scene-completion callbacks.
- No file outside this module's own three files (`progression-engine.ts`,
  its test file, this doc) is modified by this specification — `app.ts`
  wiring is a separate, later integration step.
