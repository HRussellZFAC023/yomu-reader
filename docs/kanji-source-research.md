# Kanji source research

This note records the source decisions behind the kanji origins pass. The product rule is: keep よむ useful, modular, and lightweight before adding more data.

| Source | Availability | License / terms found | Value added | Decision |
| --- | --- | --- | --- | --- |
| Existing JPDB kanji page | Live HTML lookup already implemented | User-initiated web lookup; JPDB content is not bundled | Frequency, readings, components, used-in words, mnemonic when present | Keep as a runtime source. Do not cache beyond the current session. |
| Existing RTK static pages | Live static lookup already implemented | Project-controlled static source; keep existing attribution in README | Keyword, frame, stories, component keywords | Keep as optional runtime source. |
| Existing local Yomitan/KANJIDIC dictionaries | User-imported IndexedDB data | User-provided/imported dictionary data, with source metadata from the dictionary package | Meanings, readings, tags, stats such as grade/JLPT/strokes when present | Use for compact study facts; do not bundle dictionary data. |
| KanjiVG | Existing runtime SVG fetch | KanjiVG is credited as Creative Commons Attribution-Share Alike 3.0 in its project and by The Kanji Map | Stroke path count and trace/practice ghost | Keep as optional runtime stroke source. Avoid exposing a raw “KanjiVG link” in UI. |
| Kanji Alive data/media | Public GitHub data and media repository; API via RapidAPI/MCP | Kanji Alive repository says data/media are CC BY 4.0, with exceptions for mnemonic hints, supported dictionary references, textbook lists, and some commercial font images | Clean grade/stroke/radical/examples data, radical historical animations | Good candidate for a later optional import or remote lookup. Do not bundle media. Avoid mnemonic hints and restricted items. |
| Kanji Alive MCP/API | Hosted MCP exists; local server needs RapidAPI key | MCP code is MIT; served data remains Kanji Alive CC BY 4.0 | Could provide structured search/detail data | Not used directly in the userscript now. A browser userscript should not depend on an MCP server or another API key for the default path. |
| The Kanji Map | Open source app and public site | Site states MIT for the app; credits underlying KanjiVG CC BY-SA, Kanji Alive CC 4.0, Jisho/open dictionaries, animCJK Arphic | 2D/3D graph UX model and source checklist for type/JLPT/frequency/strokes/radical | Use as UX inspiration only for now. Do not copy data pipeline into the bundle. |
| Wiktionary | MediaWiki pages/API | Wiktionary text is dual licensed CC BY-SA 4.0 and GFDL; entries can include third-party media with separate terms | Etymology text and historical notes for some kanji | Link or user-open source only unless attribution/share-alike handling is implemented. Do not bundle or silently scrape text. |
| Genetic Kanji | `query.asp` pages are publicly reachable | No clear public API or license found in the inspected material | Potential Outlier-like etymology inspiration | Treat as reference/inspiration only unless permission or license is clarified. |
| Okjiten | Public reference site | License/API not verified | Useful presentation reference for concise kanji detail | Treat as reference only. Do not scrape. |
| Outlier Dictionary | Commercial/reference dictionary | No free licensed API/data source identified | Strong UX/content inspiration for explaining form/function | Treat as design inspiration only. Do not copy proprietary explanations. |

## Implemented slice

- Added a toggleable `kanjiOriginsEnabled` setting.
- Added compact kanji facts extracted from existing JPDB, stroke-trace, RTK, and user-imported local dictionary data.
- Added a small 2D origins/component map using JPDB components, RTK component kanji, and RTK memory-cue keywords.
- Added regression tests for fact extraction and graph construction.

## Follow-up implementation path

1. If adding Kanji Alive data, prefer an optional import/download of the public CSV data or a small remote lookup with clear CC BY attribution. Do not bundle the full media set.
2. If adding Wiktionary etymology, implement a visible source link, attribution, and share-alike documentation first.
3. If adding any Genetic Kanji, Okjiten, or Outlier-like data, get license clarity first or keep them as UI references only.
4. Keep the graph 2D and compact inside the popup; avoid adding Three.js or force-graph dependencies to the userscript bundle for this feature.
