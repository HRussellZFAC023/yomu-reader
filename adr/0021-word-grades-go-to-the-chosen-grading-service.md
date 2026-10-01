# Word grades go to the chosen grading service

Status: implemented locally, 1 October 2026 (product owner's Decision 2).

## Context

A learner can connect both JPDB and Jiten. Settings call the one they grade words into the "Preferred grading service" (`apiGradingProvider`). A word only carries the identity of the service that found it: Automatic parsing preferred Jiten, so with JPDB as the grading service most page words were Jiten-only, and their grades went to Jiten. Ordinary pages have no provider toggle, by design (ADR-0016 and the off-host privacy boundary), so the learner could neither see nor correct this. Subtitle batch grades went to JPDB the same way when Jiten was the grading service.

## Decision

1. With both keys set, Automatic parsing, and the default local parser when no term dictionary is installed, parses with the grading service first. An explicit Jiten or JPDB parser choice is kept.
2. Grade buttons on words act on the grading service. A word that lacks its identity is looked up on that service by exact spelling and reading before the grade is sent; a word whose reading is unknown is never matched by spelling alone. A word that cannot be matched is not graded anywhere: the learner sees "Not graded: this word was not found in your preferred grading service." The message names no service, because ordinary pages can read it.
3. Exactly one review is sent, to one service. Resolution never falls back to the other connected service, and subtitle batch review never adds the unresolved word to JPDB before grading it. A subtitle batch finds all its unidentified words on the grading service in one request; a word the service lacks is skipped, named in the result, loses its grade buttons with the same note and leaves the selection, while the other words are still graded. Study's queued and live review delivery (ADR-0018) is unchanged.
4. A review obligation keeps its owner (ADR-0016). Study's main grade bar and review sessions grade the queue the card came from, and when Study opens its current review card in the lookup popover, that popover grades the same queue: a JPDB or Jiten review card that only one of them holds, as well as Bunpro and WaniKani obligations, never moves to the preferred grading service. In the popover, a card both services hold follows the preference.
5. Study's ⇄ toggle switches one word only. The stored preference decides Automatic parsing and every page grade, which never name a service, so only Settings changes it. A word with neither identity keeps the existing Academy deck fallback.

## Consequences

- A grade on a word the grading service did not parse costs one extra lookup request (one per subtitle batch). Automatic parsing avoids it on ordinary pages; JPDB-first subtitle and Study lookups, popover example parses, pinned parsers and Jiten fallback resolution still pay it. Making those flows follow the grading service would change the subtitle parse source for most dual-key learners and is a separate decision.
- After a resolved grade, words on the page keep the colour of the service that parsed them; the grade changes the other service's record.
- Adding to a deck and the Never forget and Blacklist actions still use the word's own service. This decision covers grades only.
