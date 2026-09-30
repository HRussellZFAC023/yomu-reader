# Queued reviews are delivered once, or held visibly

A review the learner graded while offline, or while Anki was closed, must reach its Review Destination exactly once. The rebuild's first owner held every attempt after one failed flush, so undelivered reviews never synced and their cards could no longer be graded. v1.9.3 retried every target; that is the right default for anything that certainly was not delivered.

Decisions:

1. Claim a queued review only when it can be delivered: the browser is online and, for Anki, an AnkiConnect `version` probe answers.
2. Retry certainly-undelivered reviews, as 1.9.3 did. A provider call that landed but whose read-back failed (for example JPDB's `refreshCard`) is a delivered review, not a failure.
3. Hold only an Anki answer this tab dispatched whose reply was lost, or a claim older than five minutes whose tab is gone. Each owner claim carries `heldSince`, and a release names the claim it frees. "Held" never means "another tab is sending".
4. A held review blocks only its own card. Study shows "Answers not confirmed: N" with Check again (Anki's review log decides; if the answer is missing it is resent) and Discard.
5. Packaged Study adopts the 1.9.3 offline queue, and anything hosted Study writes through the storage bridge, under stable ids and only up to owner capacity. It retires from the old key only what an owner snapshot confirms; overflow waits in the key. One leftover entry never disables grading.
6. The shared userscript/hosted queue flushes inside `withGmStorageLease('newtab-grade-queue')`, so two tabs cannot send one review twice.

Known limitation: online grades still go directly to the provider, so two online tabs showing the same card can each grade it once. That matches 1.9.3; routing online grades through the owner is follow-up work.

This amends ADR-0016's delivery wording; review ownership stays with the destination.
