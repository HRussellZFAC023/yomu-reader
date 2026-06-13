# Furigana injection — engineering survey (2026-06-13)

How comparable open-source tools segment Japanese and inject ruby (researched per user ask; informs UT-79/UT-80).

| Project | Segmentation | Injection | SPA/dynamic | Layout safety |
| --- | --- | --- | --- | --- |
| FuriganaMaker | lindera-wasm (IPADIC) in SW, offline | Range deleteContents+insertNode, reverse order, kanji-only "smash" | MutationObserver incl. characterData, per-domain selectors | 30k-char page guard (reflow freeze) |
| jpd-breader / anki-jpdb.reader | jpdb API (keyed) | splitText + wrap in ruby/span; color classes; rt only where API gives positions | IntersectionObserver rootMargin 50% + added-node observer; reverseIndex vid→elements | `:where()` zero-specificity rt CSS; rt user-select/pointer-events none |
| Mirigana | kuromoji.js offline (Twitter only) | rebuild container children; kanji-only rt | tweet pool + 3.5s throttle | selectionchange rt-hide for clean copy |
| 10ten | JMdict idb + deinflection tables | NO inline mutation (popup only) | n/a | zero layout risk by design |
| Yomitan | dictionary deinflection (+optional native MeCab) | popup only; distributeFurigana aligns kanji-only ruby | n/a | n/a |
| asbplayer | n/a | own subtitle overlay; PRE-RENDERS upcoming cues for annotators | n/a | overlay |
| Migaku | MeCab-ish server/local | caption overlay; furigana modes None/All/Unknown/Hover; pitch coloring | own players | overlay |

## Ranked adoption ideas (impact ÷ effort)
1. IntersectionObserver-gated parsing (rootMargin 50%) — bound full-page cost. (jpd-breader)
2. `:where()` zero-specificity rt CSS + `rt { user-select: none; pointer-events: none }` — host-CSS immunity + clean copy. (+ Mirigana selectionchange trick)
3. Fragment/paragraph model over computed display — tokenize across inline boundaries (links/bold mid-word). Compare with our fragment scanners.
4. Kanji-only ruby smashing — ALREADY SHIPPED in Yomu (kanjiOnlyRubySegments) ✓.
5. Known-word-conditional furigana — ALREADY SHIPPED (furiganaHiddenStateGroups + presets) ✓; reverseIndex-style instant recolor exists via card-state signal bus ✓.
6. Reverse-order Range insertion hygiene.
7. Page-size guard / viewport-only fallback (superseded by 1).
8. YouTube captions: clone-don't-mutate sibling caption window driven by video.currentTime, copying the original's cssText — immune to per-frame re-renders. Strong candidate for UT-66/native-caption work.
9. Offline keyless parser tier: lindera-wasm IPADIC as a companion-loaded asset (~MBs, must ride a @require companion under the 2 MB core limit) — MeCab-grade segmentation when no API key. Big keyless win, high effort.
10. MutationObserver should observe characterData too — frameworks patch text in place without childList mutations.

Full agent report with sources in session transcript; sources: FuriganaMaker, jpd-breader, anki-jpdb.reader, mirigana, 10ten-ja-reader, Yomitan, asbplayer, Migaku manual.
