# ADR 0001: Self-Contained Userscript

## Status

Accepted.

## Context

Yomu runs as a Tampermonkey/Greasemonkey userscript. Users should be able to install one script and get the default reader, lookup, subtitle, dictionary, and study behavior without a backend service or `@require` dependency.

## Decision

Keep default functionality self-contained in `dist/yomu.user.js`. Do not add a backend service or external runtime dependency for core behavior.

## Consequences

- Bundle size is an architectural constraint, not only a build concern.
- External Sources must be optional, user-configured, fixture-tested, or gracefully degraded.
- Shared code should remove duplication before adding abstractions that increase bundle weight.
- If a feature needs a remote service by default, it must come with a new ADR.
