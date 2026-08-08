# ADR 0008: Grammar is owned by the learning target

## Status

Accepted.

## Context

The Reader's grammar registry, JLPT level union, detector cache, and knowledge
validation were Japanese globals. A non-Japanese target could therefore either
inherit Japanese assumptions or claim grammar without owning any rules.

## Decision

`LearningTargetModule` carries one Grammar Adapter. Its Interface exposes the
target's level scale, checked rule metadata, optional reference URL, and one
`detect` operation. Detection normalization, patterns, ranking, exclusions,
and caching stay inside the Adapter.

`capabilities.grammar` is derived from a non-empty rule inventory. A reference
URL does not turn that capability on. Grammar knowledge is stored per target;
the Japanese store keeps its existing key so Reader, Academy, and older builds
continue to share the same facts.

JLPT remains the Japanese scale. Other targets may declare CEFR or another
published target-owned scale. Shared code treats every level name as opaque.
When a checked source defines a construction but no proficiency level, its
Adapter uses a target-specific `Foundation` catalogue level. `Foundation`
means only that target's first reviewed local inventory; it does not imply a
cross-language proficiency equivalence.

## Consequences

- Adding a target's grammar does not add a language check to Study code.
- A target can degrade to a checked external reference without pretending it
  has local detection.
- Rule ids may repeat across targets without sharing learner knowledge.
- Every fixed-roster target has at least one source-checked rule. Coverage grows
  through reviewed positive and adversarial near-negative examples; generated,
  unverified patterns are rejected because a false match teaches false grammar.
- The Learning Target Module Interface advances from revision 7 to revision 8.
- Japanese detection hooks and its 307-rule output remain regression-locked.
