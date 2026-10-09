# Quiet default page annotation

Status: implemented locally, 7 October 2026 (release lead, under the owner's delegation).

## Context

On the ja.wikipedia 日本語 article, 2.0's defaults put a grey box behind every token, particles included, a thick four-colour pitch underline under most words, a bold link-blue reading at 0.58em over nearly every kanji word, readings on the [注釈 3] footnote marker, and annotated words that read as a second typeface beside the plain kana. The owner asked for the defaults to follow research and comparable tools.

What the evidence says, in short:

- No comparable reader boxes every word. LingQ and Lute tint only words not yet known; Migaku, the JPDB extensions and Hachidori leave known words plain. Visual input enhancement buys little noticing and costs comprehension (Lee & Huang 2008).
- No study shows that colouring pitch across running text helps. Training gains come from spatial notation with audio, which the popup has. Migaku makes page pitch colour opt-in; Yomitan and 10ten show pitch in the popup only. The four-hue convention leans on red, orange and green, the weakest axis for deuteranopes.
- Readings that follow what the learner knows are standard (Migaku "unknown", Satori, JPDB Reader, school textbooks). Ruby is about half the base size (JLREQ) and is text, so it needs 4.5:1.

## Decision

1. Nothing is painted behind a word at rest; hover and focus still tint the word under the pointer.
2. One colour channel at rest: the underline carries study state (`status`) on pages and subtitles. Known and ignored words carry none, a word in no deck carries none, and with no study source nothing is underlined. A learning word's line is dashed and a due word's dotted, so state is not told by hue alone (simulated protan and deutan vision merges the due teal with the New grey on light pages). A line still on its default colour is drawn in the ink-and-paper token for the page under it (`PAGE_STATE_UNDERLINE_COLOR_TOKENS`: slate New, ochre Learning, teal Due, brick Failed, and a lighter tint of each on a dark page), not in 2.0's white and yellow, which read loud on dark pages; a colour the learner chose is kept and held at 3:1. Highlight and text colour default to off; pitch colours stay one choice away, and pitch is always in the popup. Captions over video keep their bold reading.
3. Readings follow the learner (`known-status`). A word the study source knows or has due loses its reading; a word the learner just failed keeps it. With no source, every parsed word keeps one; that is open, see below. Readings take the same in-flow lane as under `all`.
4. A reading is half its word, regular weight, in the page's face, and one colour per paragraph: the prose ink eased toward the backdrop and held at 4.5:1. A detached reading, set in the line gap of a control, is 0.46 of its host text, capped at 10px: at half, WebKit's crowding solver pushed the edge readings of a crowded control row off their words. Annotated words inherit every font property from the host text. Root theme-class/style changes and operating-system colour-scheme changes resample the reading and underline contrast on the next animation frame, without waiting for a scroll. The observer is limited to the document roots and stops with the Reader.
5. Footnote and citation markers are not annotated.
6. Existing installs adopt these defaults. Every save writes the whole settings object, so a group of changed keys that still holds its 2.0 values, with no intent-ledger declaration, reads as the new default (`settings/retired-defaults.ts`). The groups are the reading mode, the mode the puck brings back, the hidden reading and colour groups, and each colour channel set (highlight, underline and text together), so a set the learner changed anywhere stays whole. Storage is not rewritten; the next save stores what was read. Restoring a backup, from a file or Google Drive, does the same at once (`witnessedSettingsRestoreCandidate`): with the backup's intent ledger an undeclared old default reads as today's, and a settings-only backup, which has no ledger, leaves that setting as it is rather than declaring a value nobody chose.
7. The 2.0 puck declared the reading mode it switched to, the then-default `all` included, and the mode to come back to after hiding, so a learner who only ever pressed the puck has `all` declared. That write declared the remembered mode right after the reading mode, one sequence number apart; since 2.1 the puck declares the remembered mode first (`PUCK_FURIGANA_INTENT_KEYS`). A retired mode in a write with the old order is dropped from the ledger as it is read, so it reads as today's default and the next save stores the ledger without it.

## Consequences

- The projection infers from values, which ADR-0012 warns against. It is bounded: four groups, only their exact 2.0 values, and only where the ledger holds no declaration. A learner who chose pitch underlines before the ledger existed (before 1.8.37), or through a surface that never declared, gets the new default once and can choose pitch again; that choice is then declared and kept.
- Smokes that set one of these keys get it declared by the harness (`ANNOTATION_DEFAULT_KEYS_SMOKES_DECLARE`), so they test what they set. `scripts/annotation-typography-smoke.mjs` checks the default look in Chromium and WebKit.
- The Balanced appearance preset is the default look, its hidden reading and colour groups included; Focus on new words is the default look with only new words underlined.
- A reading at least half a character wider than its kanji (あいだ over 間) overhangs the plain words beside it by half a ruby character (JLREQ), as Chromium and WebKit already do inside one run of text; Yomu's per-word spans end that run, which opened a gap on each side of the kanji. Each side is decided independently, including a plain digit wrapper beside a reading. The overhang is a negative margin on the reading, so the kanji never moves, and at a word edge it is drawn only where no reading sits on the other side: plain text, a word without one, or a word ending in kana there, looking out of a link the word starts or ends. Script decides which readings may (`dom/ruby-overhang.ts`), when words are painted and when a word gains or loses its reading, because an adjacent-sibling selector over page words made Chromium annotate a one-root page ten times slower; `tests/reader/styles.test.ts` keeps sibling selectors off page words. WebKit stops centring a reading whose margins make it narrower than its kanji, so readings are set in solid kana with the paragraph's own tracking. A wide reading beside another reading keeps its gap. So does one that starts or ends a line, where JLREQ aligns ruby to the line: an overhang there sticks out of the text column, and any box that clips cuts its first kana. Line breaks are layout, so `ruby-overhang.ts` reads them once a frame after each paint and on resize, all reads before any class write, and marks such a ruby `jpdb-reader-ruby-line-edge`; it costs nothing measurable on the ja-docs perf smoke at 2.5x.

## Open: readings with no study source

With no study source, `known-status` cannot tell what the reader knows, so every parsed word keeps its reading. That is what every new 2.1 install shows until a source is connected. On the ja.wikipedia 日本語 paragraph that is 39 readings on 39 kanji words, 32 of them distinct (にほんご and ほうれい three times each, にほん, こうようご and きてい twice), plus page chrome such as 目次 and 寄付. The readings are half-size and grey now, so the page is quieter than 2.0's, but it is not sparse. This is left to the owner, with two alternatives for evaluation:

- First-occurrence ruby per paragraph (初出ルビ), standard Japanese publishing practice: 32 of 39 here, so the gain on one paragraph is small; it grows with page length.
- No readings at rest and a reading on hover or tap: none at rest, at the cost of a beginner seeing a bare page. Research on meaning glosses (including Yanagisawa et al., 2020) is not direct evidence for phonetic ruby; applying that result to readings is an unverified analogy, not a settled benefit.

Whichever is chosen, a live-page assertion of readings per kanji word in the no-source state should hold it.

## Sources

- Lee & Huang (2008), visual input enhancement meta-analysis, *SSLA* 30: <https://www.cambridge.org/core/journals/studies-in-second-language-acquisition/article/abs/visual-input-enhancement-and-grammar-learning-a-metaanalytic-review/B9D0C50B09928C20C94548B37B29A042>
- Yanagisawa, Webb & Uchihara (2020), glossing meta-analysis, *SSLA*: <https://takumiuchihara.weebly.com/uploads/1/2/3/7/123756989/yanagisawa-webb-uchihara-2019-glossing_meta-analysis.pdf>
- Hirata et al. (2024), multimodal pitch-accent training, *Language and Cognition*: <https://www.cambridge.org/core/journals/language-and-cognition/article/multimodal-training-on-l2-japanese-pitch-accent-learning-outcomes-neural-correlates-and-subjective-assessments/AB2195C963F348823C8175220F9F9EA1>
- W3C, Requirements for Japanese Text Layout (ruby size): <https://www.w3.org/TR/jlreq/>
- WCAG 2.2, Use of Color (1.4.1) and Non-text Contrast (1.4.11): <https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html>, <https://www.w3.org/WAI/WCAG21/Understanding/non-text-contrast.html>
- Comparable tools' defaults, read from their source: jpd-breader `src/content/word.css`, Anki JPDB Reader `docs/custom-css.md`, JitenReader PR #21, Lute v3 `lute/static/css/styles.css`, Hachidori issue #520.
