# ADR 0001: Self-Contained Userscript

## Status

Amended 2026-06-04.

## Context

Yomu runs as a Tampermonkey/Greasemonkey userscript. Users should be able to install one script and get the default reader, lookup, subtitle, dictionary, and study behavior without a backend service. Greasy Fork also requires readable source, so size pressure must not be solved with minification, packing, or obfuscation.

## Decision

Keep default functionality self-contained in `dist/yomu.user.js` and the userscript metadata assets it declares. Do not use `@require`, CDN-hosted helper scripts, or other remote executed code for core behavior. Small helper libraries such as `fflate` are bundled locally. Non-executed styling may be declared as a userscript `@resource` so userscript managers cache it separately, while optional content sources may still fetch user-requested data or media at runtime.

## Consequences

- Bundle size is an architectural constraint, not only a build concern.
- External data and media sources must be optional, pinned/audited, user-configured, fixture-tested, or gracefully degraded.
- Shared code should remove duplication before adding abstractions that increase bundle weight.
- If a feature needs a remote service by default, it must come with a new ADR.
