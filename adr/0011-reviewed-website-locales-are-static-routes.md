# ADR 0011: Reviewed Website Locales Are Static Routes

**Status:** Accepted

**Date:** 2026-08-08

## Context

The public site used one English VitePress route tree and changed its prose in
the browser from a 3,600-entry English-to-Japanese object in the theme. The
document arrived as English, then a MutationObserver rewrote text, attributes,
title metadata, and `lang`. VitePress page-data chunks still contained English,
so hydration and client navigation could disagree with the mutated DOM. The
same A/あ control also changed the Reader Interface Language setting, making a
site route and reader chrome look like one state when they are separate axes.

D43 requires website localisation for all 33 supported interface locales. It
also requires honest publication: a machine draft is evidence for review, not
a public locale.

## Decision

1. A **Website Locale** is a reviewed public route tree, independent of the
   Learning Target, Definition Language, and Reader Interface Language.
2. VitePress's locale router owns Website Locale selection. English keeps the
   existing root URLs; reviewed Japanese lives at the equivalent `/ja/` URLs.
3. Each reviewed Japanese route has a checked Markdown wrapper. Included
   English source passes through the reviewed prose catalogue in a Markdown-it
   core rule before SSR or page-data chunks are generated. Page title and
   description use semantic route IDs in the same pre-render pipeline.
4. VitePress locale configuration owns `lang`, `dir`, navigation, sidebar,
   footer, search and theme labels. Per-page head output owns canonical URL,
   `hreflang`, Open Graph locale, description, and structured data.
5. The shared 33-locale interface manifest supplies identities, direction and
   font evidence. A website-specific publication ledger may only narrow that
   set. A locale directory or catalogue draft cannot make a locale available.
6. The rendered-route gate requires every English route, exactly the reviewed
   Japanese route set, no unreviewed Japanese route, and no unavailable locale
   directory. A JavaScript smoke requires Japanese in the initial response, no
   wrong-language painted frame during hydration, route-correct metadata and
   locale links, and correct EN-to-JA-to-EN SPA navigation.

## Human-review boundary

English source and the existing Japanese public-site catalogue are the only
approved website copy in this slice. Seventeen Japanese bodies pass the
existing completeness gate. API Reference, Local Audio, Privacy, and the
generated Settings Reference remain unpublished under `/ja/`: their body copy
has no complete reviewed Japanese source. The remaining 31 locale rows are
`unavailable`, even where machine-draft reader catalogues exist.

Publishing another locale requires all of the following:

- native review of every route title, description, body message, navigation,
  footer, search label, accessible name and error state;
- placeholder, URL, product-name and claim review against the English source;
- a complete generated route tree with rendered canonical and `hreflang`
  parity;
- RTL layout and first-frame browser evidence when the shared manifest says
  `rtl`;
- maintainer acceptance recorded in the website publication ledger.

Until those checks pass, previews and drafts stay outside `docs/` public route
directories. This architecture slice is not D43 completion and is not evidence
for a 1.9.0 claim.

## Consequences

- Japanese is present in server HTML and the matching Vue page chunk; no client
  copy mutation is needed to avoid a flash.
- Site-locale navigation no longer changes the reader's saved interface
  preference.
- Root English URLs remain stable. Reviewed Japanese pages have deterministic
  counterparts; content links to the four unreviewed bodies remain on the
  English URL, while the locale picker falls back to the reviewed Japanese home
  instead of advertising a missing corresponding route.
- The large legacy prose catalogue is isolated behind a small build-time
  interface. Page prose can migrate from source-hash compatibility IDs to
  semantic IDs route by route without returning translation logic to the theme.
- D43 remains open for four Japanese body reviews, 31 additional native-review
  ledgers, and their rendered/browser evidence.

## Rejected Alternatives

- **Rewrite final HTML only:** page-data chunks remain English, so hydration or
  SPA navigation can revert the DOM.
- **Keep the MutationObserver localiser:** makes first paint depend on client
  timing and cross-wires Website Locale with Reader Interface Language.
- **Publish machine drafts with English fallback:** advertises review coverage
  that does not exist and hides missing human-critical copy.
- **Copy 31 conditional route configs:** duplicates routing logic while
  bypassing the review gate.
