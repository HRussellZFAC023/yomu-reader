# ADR 0001: Self-Contained Userscript

## Status

Amended 2026-06-03.

## Context

Yomu runs as a Tampermonkey/Greasemonkey userscript. Users should be able to install one script and get the default reader, lookup, subtitle, dictionary, and study behavior without a backend service. Greasy Fork also requires readable source, so size pressure must not be solved with minification, packing, or obfuscation.

## Decision

Keep default functionality self-contained in `dist/yomu.user.js` except for explicitly documented, pinned `@require` libraries that are small, audited, and keep the userscript readable. The current approved exception is `fflate` for ZIP dictionary import support. Do not add a backend service or an unpinned external runtime dependency for core behavior.

## Consequences

- Bundle size is an architectural constraint, not only a build concern.
- External Sources must be optional, pinned/audited, user-configured, fixture-tested, or gracefully degraded.
- Shared code should remove duplication before adding abstractions that increase bundle weight.
- If a feature needs a remote service by default, it must come with a new ADR.
