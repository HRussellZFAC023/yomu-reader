# Word grades go to the chosen grading service

Status: implemented locally, 1 October 2026 (product owner's Decision 2).

## Context

A learner can connect both JPDB and Jiten. Settings call the one they grade words into the "Preferred grading service" (`apiGradingProvider`). A word only carries the identity of the service that found it: Automatic parsing preferred Jiten, so with JPDB as the grading service most page words were Jiten-only, and their grades went to Jiten. Ordinary pages have no provider toggle, by design (ADR-0016 and the off-host privacy boundary), so the learner could neither see nor correct this. Subtitle batch grades went to JPDB the same way when Jiten was the grading service.

## Decision

1. With both keys set, Automatic parsing, and the default local parser when no term dictionary is installed, parses with the grading service first. An explicit Jiten or JPDB parser choice is kept.
2. Grade buttons act on the grading service. A word that lacks its identity is looked up on that service by exact spelling and reading before the grade is sent. A word that cannot be matched is not graded anywhere: the learner sees "Not graded: this word was not found in your preferred grading service." The message names no service, because ordinary pages can read it.
3. Exactly one review is sent, to one service. Resolution never falls back to the other connected service, and subtitle batch review never adds the unresolved word to JPDB before grading it. Study's queued and live review delivery (ADR-0018) is unchanged.
4. A per-word choice made with Study's ⇄ toggle, and Bunpro or WaniKani review obligations, keep their own destination. A word with neither identity keeps the existing Academy deck fallback.

## Consequences

- A grade on a word the grading service did not parse costs one extra lookup request. Automatic parsing avoids it on ordinary pages; JPDB-first subtitle and Study lookups, pinned parsers and Jiten fallback resolution still pay it.
- Adding to a deck and the Never forget and Blacklist actions still use the word's own service. This decision covers grades only.
