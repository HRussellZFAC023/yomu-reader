# ADR 0001: Self-Contained Userscript

## Status

Amended 2026-06-06.

## Context

Yomu runs as a Tampermonkey/Greasemonkey userscript. Installing one script must give the default reader, lookup, subtitle, dictionary, and study behavior without a backend service. Greasy Fork requires readable source, so size pressure must not be solved with minification, packing, or obfuscation.

## Decision

Keep default functionality reviewable in Greasy Fork-posted code and the userscript metadata assets it declares. Do not use CDN-hosted helper scripts, unreviewed `@require` URLs, dynamically injected scripts, or other remote executable loaders for core behavior. First-party Greasy Fork library scripts are allowed only when they are readable, separately posted as Greasy Fork libraries, explicitly allowlisted in release config, and used to preserve the 2 MB readable-size limit without turning the main script into a loader. Small helper libraries such as `fflate` stay bundled locally until a reviewed Greasy Fork-library split provides meaningful savings. Non-executed styling may be declared as a userscript `@resource` so userscript managers cache it separately, while optional content sources may still fetch user-requested data or media at runtime.

## Consequences

- Bundle size is an architectural constraint, not only a build concern.
- External data and media sources must be optional, pinned/audited, user-configured, fixture-tested, or gracefully degraded.
- Shared code should remove duplication before adding abstractions that increase bundle weight.
- Any first-party Greasy Fork library split must keep extension builds packaged locally and must be covered by a release verifier allowlist.
