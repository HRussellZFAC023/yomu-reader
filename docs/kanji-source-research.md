# Kanji source research

This note records the source decisions behind the kanji origins pass. The product rule is: keep よむ useful, modular, and lightweight before adding more data.

| Source | Availability | License / terms found | Value added | Decision |
| --- | --- | --- | --- | --- |
| Existing JPDB kanji page | Live HTML lookup already implemented | User-initiated web lookup; JPDB content is not bundled | Frequency, readings, components, used-in words, mnemonic when present | Keep as a runtime source. Do not cache beyond the current session. |
| Existing RTK static pages / [hanhpp/rtk](https://github.com/hanhpp/rtk) | Live static lookup already implemented | Original RTK search repo does not provide a clean redistributable data license and notes copyright concerns; keep attribution in README | Keyword, frame, stories, component keywords | Keep as optional attributed runtime source. Do not bundle additional RTK/Heisig data. |
| Existing local Yomitan/KANJIDIC dictionaries | User-imported IndexedDB data | User-provided/imported dictionary data, with source metadata from the dictionary package | Meanings, readings, tags, stats such as grade/JLPT/strokes when present | Use for compact study facts; do not bundle dictionary data. |
| KanjiVG | Existing runtime SVG fetch | KanjiVG is credited as Creative Commons Attribution-Share Alike 3.0 in its project and by The Kanji Map | Stroke path count and trace/practice ghost | Keep as optional runtime stroke source. Avoid exposing a raw “KanjiVG link” in UI. |
| Kanji Alive data/media | Public GitHub data and media repository; API via RapidAPI/MCP | Kanji Alive repository says data/media are CC BY 4.0, with exceptions for mnemonic hints, supported dictionary references, textbook lists, and some commercial font images | Clean grade/stroke/radical/examples data, radical historical images | Use through optional remote lookup. Do not bundle media. Avoid mnemonic hints and restricted items. |
| Kanji Alive MCP/API | Hosted MCP exists; local server needs RapidAPI key | MCP code is MIT; served data remains Kanji Alive CC BY 4.0 | Could provide structured search/detail data | Not used directly in the userscript now. A browser userscript should not depend on an MCP server or another API key for the default path. |
| [The Kanji Map](https://thekanjimap.com/) / [source](https://github.com/gabor-kovacs/the-kanji-map) | Open source app and public site | About page states MIT for the app; credits underlying KanjiVG CC BY-SA, Kanji Alive CC 4.0, Jisho/open dictionaries, and animCJK Arphic | 2D/3D graph UX model and source checklist for type/JLPT/frequency/strokes/radical | Query the per-kanji JSON at runtime when enabled. Keep the UI 2D and compact; do not bundle the full dataset. |
| [Genetic Kanji](http://www.genetickanji.com/query.asp?id=c22235), [Okjiten](https://okjiten.jp/index.html), [Outlier Dictionary](https://www.outlier-linguistics.com/products/outlier-dictionary-of-chinese-characters) | Public/commercial reference material | No clear public redistributable license/API found for Genetic Kanji or Okjiten; Outlier is commercial/reference content | Presentation and explanation inspiration for concise kanji detail | Reference/inspiration only unless the user supplies licensed data or a permissioned API. Do not scrape or copy proprietary explanations. |

## Implemented slice

- Added toggleable source settings for the kanji origin panel, Kanji Alive / Kanji Map facts, the component graph, and radical images.
- Added compact kanji facts extracted from JPDB, KanjiVG, RTK, imported local dictionaries, and optional Kanji Alive / Jisho data via The Kanji Map.
- Added a small 2D origins/component map using Kanji Map/Jisho parts, JPDB components, RTK component kanji, and RTK memory-cue keywords.
- Added optional radical cards with source links.
- Added regression tests for fact extraction, Kanji Map normalization, and graph construction.

## Follow-up implementation path

1. Add a user-facing cache reset if remote kanji-source content changes often enough to matter.
2. If adding any Genetic Kanji, Okjiten, or Outlier-like data, get license clarity first or keep them as UI references only.
3. Keep the graph 2D and compact inside the popup; avoid adding Three.js or force-graph dependencies to the userscript bundle for this feature.
