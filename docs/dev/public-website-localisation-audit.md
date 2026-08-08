<!-- Internal engineering note. docs/dev/**/*.md is excluded from VitePress routes and sitemap.xml. -->

# Public website localisation audit — measured 2026-08-08

## Decision

D43 now includes the public website. The current site does not satisfy it and
must not be described as a complete multilingual rewrite or as 1.9.0-ready.
Reader-interface readiness and website readiness are separate measurements:

- Reader interface: 2 of 33 selectable (`en`, `ja`), 31 blocked by the review
  ledger; Arabic and Farsi also remain blocked by the RTL gate.
- Public website: English is the only fully authored locale. Japanese is a
  client-side exact-string overlay with checked copy for 16 of the 21 active
  Markdown routes. The other 31 have no website copy or locale routes.
- Locale route architecture: 0 of 33. VitePress has no `locales` configuration,
  no locale-prefixed routes, and no per-locale nav/sidebar configuration.

The Japanese overlay is useful, but it is not a generated locale site. It
changes text nodes after hydration on the same canonical English URL. Search
engines and no-JavaScript visitors receive the English document, there are no
`hreflang` alternates, and the static structured data still declares English
and Japanese rather than a route-specific locale.

## Measured public coverage

The active Markdown route roster is pinned by
`tests/reader/docs-published-pages.test.ts`. It contains 21 routes. The Japanese
copy gate in `tests/reader/i18n.test.ts` covers these 16:

- `/`
- the 11 `/learn/` routes
- `/support`
- `/faq`
- `/membership`
- `/reference/grammar`

Five active routes are not under the full Japanese page-copy gate:
`/api/`, `/changelog`, `/local-audio`, `/privacy/`, and
`/reference/settings`. The latest changelog release has a narrower Japanese
copy check; that is not whole-route localisation.

| Surface required by D43 | English | Japanese | Other 31 |
|---|---|---|---|
| Locale route | Single source route | Same English route, client overlay | None |
| Navigation | Authored | Hand-maintained labels | None |
| Homepage hero | Authored | Hand-maintained template | None |
| Install guidance | Authored | Exact-string overlay on checked learning pages | None |
| Capability/reference copy | Authored | Grammar/reference pages checked; route set incomplete | None |
| SEO (`lang`, canonical, `hreflang`, JSON-LD) | Static English baseline | Client mutation only; no alternate route | None |
| Rendered-page gate | Normal docs build | No all-route locale-render matrix | None |
| RTL route/layout proof | Not applicable | Not applicable | Arabic/Farsi: none |

The standalone Study, PDF Reader, Video Player, and Academy shells share some
English/Japanese navigation labels, but they are separate renderers. They need
their own locale content and rendered gates; shared labels are not proof that a
shell is localized.

## Capability truth carried into public copy

The 33 × 18 behavior audit passes 594 executable rows, but “pass” does not mean
the same support depth. The release claim must preserve these three groups:

1. Universal target-aware behavior: segmentation, target-locale speech
   synthesis requests, target-locale OCR requests, subtitle language selection,
   mining, local SRS identity, local grading, and target-appropriate typing.
   Device voice availability, OCR recognition quality, and subtitle translation
   supply remain external constraints even though the Adapter behavior executes.
2. Universal entry points with target/data-dependent depth: term lookup,
   character lookup (term fallback outside Japanese), reading annotations,
   pronunciation, frequency (named context-occurrence fallback when no rank
   dictionary answers), examples, grammar, audio, and handwriting (self-check
   fallback outside Japanese stroke data).
3. Non-universal morphology: actual rewrite/deinflection behavior exists only
   for `ja`, `ar`, `de`, `ko`, `ru`, and `es`. The other 27 rows are explicitly
   unavailable and prove literal dictionary-form lookup rather than inventing
   morphology.

Japanese remains the only `full` target. The other 32 are `reading-only` even
where a narrow data-backed feature exists.

## Implementation and release decomposition

### 1. Locale contract and route generator

- Extract public copy from the 4,403-entry English-to-Japanese exact-string map
  into stable message IDs shared with the existing locale registry.
- Add VitePress locale routes and per-locale nav/sidebar configuration while
  retaining one canonical source-page topology.
- Define fallback explicitly (`requested locale -> reviewed parent -> en`) and
  render a visible build diagnostic for every fallback; never silently present
  fallback English as translated copy.
- Generate `lang`, `dir`, canonical, `hreflang`, Open Graph locale, and JSON-LD
  from the same locale row.

### 2. Migrate the two proven locales without changing copy

- Move English source and the reviewed Japanese catalogue to stable IDs.
- Generate and render all 21 Markdown routes plus the hosted shells in both
  locales.
- Delete the post-hydration text-node replacement path only after route parity,
  saved interface choice, and reader-annotation teardown tests pass.

### 3. Translation production with a human-review ledger

- Seed drafts for the other 31 locales, but keep them unavailable.
- Native-review the human-critical tier first: onboarding/install, privacy and
  account recovery, destructive actions, errors, accessibility labels, target
  vs definition/output vs interface language, and capability limitations.
- Promote a locale only when every required message ID and every public route is
  reviewed. Machine drafts are pipeline input, never release evidence.

This native review is irreducible. Grammar constructions and capability claims
also require checked source data; they must not be translated into stronger
claims than the English source.

### 4. RTL completion before Arabic or Farsi activation

- Finish bidi isolation and the logical-property audit.
- Verify popover/overlay collision, drag/resize, subtitles, menus, forms, target
  terms, definitions, URLs, codes, and keyboard shortcuts with `dir=auto` where
  appropriate.
- Run the 320/768/1440 px × 100/200% zoom matrix, keyboard-only and reduced
  motion, using real rendered routes and app surfaces.
- Capture approved real-app evidence and obtain owner acceptance. Six of the
  eight existing RTL gate items remain unfinished.

### 5. Rendered 33-locale release gate

For every locale, render the homepage, one install route, one capability route,
navigation at desktop/mobile widths, and each hosted shell. Assert:

- route exists and has the expected `lang`/`dir`;
- nav and links have topology parity with English;
- hero and install actions contain reviewed local copy or an explicit fallback;
- capability limitations retain their evidence strength;
- no missing-message token, `未翻訳`, or silent English substitution appears;
- canonical/`hreflang` links are reciprocal;
- axe, overflow, zoom, and RTL geometry gates pass.

### 6. Claim and semver promotion

Only after the 33-locale rendered gate passes may the website/store/userscript
metadata say “complete multilingual rewrite” and the release become 1.9.0.
Until then, capability and target/UI corrections may ship as an honest 1.8.x
parity step, with D43 and its human-review/RTL residuals named as blockers.

The rotating homepage headline is deliberately limited to “Read <target> with
Yomu.” for the 33 reading-ready targets. “A complete system” remains static and
Japanese-only until another target reaches `full` readiness.
