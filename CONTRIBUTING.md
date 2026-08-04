# Contributing to Yomu

## Closing an issue requires a regression test

On 2026-08-03 a census of the closed backlog found **9 of 16 closed issues were
not actually fixed**, and **8 CHANGELOG claims were contradicted by the code they
described**. Every one of those closures looked reasonable at the time. What they
had in common was that nothing mechanical could tell the difference between
"fixed" and "believed fixed".

So:

1. **An issue may be closed only with a regression test that fails on the
   pre-fix commit.** Not a test that passes after the fix — a test you have
   watched fail before it. Record the pre-fix commit SHA in the issue.
2. **The test must run in an engine that can express the bug.** A jsdom test
   cannot prove a layout, scroll, paint, cross-realm or cross-origin fix; those
   need a `scripts/*smoke*.mjs` guard in a real browser. If no existing engine
   can express it, say so in the issue and close it as *unverifiable*, not as
   *fixed*.
3. **Every CHANGELOG claim names its proof.** A user-visible claim carries the
   test or smoke that holds it, e.g. `(tests/reader/new-tab-actions.test.ts)` or
   `(smoke:layout-regressions)`. A claim with no named proof is a plan, not a
   change, and does not belong in the CHANGELOG.
4. **A new guard must be reachable from CI.** `npm run check:repository` fails on
   a smoke script that no package script runs, or that no workflow reaches.

## Verifying before you push

- `npm run check:release` is the gate. Capture it to a file and check the exit
  code directly; never pipe it through `tail` or `head`, which masks the code.
- Run the focused vitest files for what you touched, plus any smoke that covers
  the surface.
- Pure refactors should leave `dist/` byte-identical. Say so in the commit
  message when they do, and say why when they cannot.
