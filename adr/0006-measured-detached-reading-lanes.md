# ADR 0006: Measured authority for detached reading lanes

- Status: Accepted
- Date: 2026-07-18

## Context

Framework controls, fixed-height labels, ellipsis rows, and line clamps cannot safely receive in-flow ruby. Earlier attempts to reserve or grow ruby room changed card and control geometry, expanded clamped feed rows, and caused readings to cover neighbouring lines on iPad and other WebKit surfaces. Yomu therefore renders furigana for these surfaces as detached, out-of-flow readings while leaving the page-owned source DOM and line boxes intact.

A later blanket rest rule hid every detached reading inside a closed clip before geometry was measured. Safe compact labels consequently lost furigana even when their natural lane had enough room. Node-count tests did not catch this because the hidden reading elements still existed with zero-sized rectangles.

## Decision

Detached readings use one measured authority:

1. Render every reading as a temporary candidate in its natural lane immediately above its base.
2. Open an authored clip only when its compact, single-line base content still fits without changing layout.
3. Measure the connected candidate against clipping ancestors, page-owned text, annotated bases, neighbouring readings, and the viewport.
4. Keep a measured-safe candidate visible. Hide only the reading whose lane collides or cannot be measured; preserve its base text, pitch decoration, and lookup target.
5. Reconsider the collision surface after scan-settle and mirror reuse so safe-to-unsafe and unsafe-to-safe reflows are both supported. Reconciliation is batched per surface to include adjacent hosts.

The CSS closed-clip rule remains only a pre-measure flash guard. Synchronous measured inline state is the final visibility verdict.

## Rejected alternatives

- In-flow ruby or generic row growth: changes page geometry and previously expanded fixed or clamped rows.
- Upward lifting to find another lane: can cover a previous authored line and makes neighbouring readings interact unpredictably.
- Portalling readings outside the clipped subtree: requires scroll, transform, ownership, shadow-root, and teardown synchronization that is less reliable than preserving the source layout.
- A host-rectangle cache: collision safety also depends on arbitrary neighbouring page text, so an unchanged host rectangle cannot prove an unchanged lane.

## Consequences

- Furigana is present wherever current geometry proves it safe, including compact closed framework labels.
- Collision and unmeasured states fail closed without removing other annotation.
- Browser regression tests must assert painted reading rectangles and safety markers, not merely reading-node counts.
- Scan-settle performs bounded collision work per affected surface; performance must be checked on dense feeds when the detector changes.
