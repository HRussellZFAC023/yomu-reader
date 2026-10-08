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
2. One colour channel at rest: the underline carries study state (`status`) on pages and subtitles. Known and ignored words carry none, a word in no deck carries none, and with no study source nothing is underlined. A learning word's line is dashed and a due word's dotted, so state is not told by hue alone (simulated protan and deutan vision merges the due teal with the New grey on light pages). Highlight and text colour default to off; pitch colours stay one choice away, and pitch is always in the popup. Captions over video keep their bold reading.
3. Readings follow the learner (`known-status`). A word the study source knows loses its reading; with no source, every parsed word keeps one. Readings take the same in-flow lane as under `all`.
4. A reading is half its word, regular weight, in the page's face, and one colour per paragraph: the prose ink eased toward the backdrop and held at 4.5:1. Annotated words inherit every font property from the host text.
5. Footnote and citation markers are not annotated.
6. Existing installs adopt these defaults. Every save writes the whole settings object, so a group of changed keys that still holds its 2.0 values, with no intent-ledger declaration, reads as the new default (`settings/retired-defaults.ts`). The groups are the reading mode, the hidden colour groups, and each colour channel set (highlight, underline and text together), so a set the learner changed anywhere stays whole. Storage is not rewritten; the next save stores what was read.

## Consequences

- The projection infers from values, which ADR-0012 warns against. It is bounded: four groups, only their exact 2.0 values, and only where the ledger holds no declaration. A learner who chose pitch underlines before the ledger existed (before 1.8.37), or through a surface that never declared, gets the new default once and can choose pitch again; that choice is then declared and kept.
- Smokes that set one of these keys get it declared by the harness (`ANNOTATION_DEFAULT_KEYS_SMOKES_DECLARE`), so they test what they set. `scripts/annotation-typography-smoke.mjs` checks the default look in Chromium and WebKit.
- The Balanced appearance preset is the default look.
- A reading at least half a character wider than its kanji (あいだ over 間) overhangs the plain words beside it by half a ruby character (JLREQ), as Chromium and WebKit already do inside one run of text; Yomu's per-word spans end that run, which opened a gap on each side of the kanji. The overhang is a negative margin on the reading, so the kanji never moves, and it is drawn only where the neighbouring words carry no reading. Script decides which readings may (`dom/ruby-overhang.ts`), when words are painted and when a word gains or loses its reading, because an adjacent-sibling selector over page words made Chromium annotate a one-root page ten times slower; `tests/reader/styles.test.ts` keeps sibling selectors off page words. WebKit stops centring a reading whose margins make it narrower than its kanji, so readings are set in solid kana with the paragraph's own tracking. A wide reading beside another reading keeps its gap.

## Sources

- Lee & Huang (2008), visual input enhancement meta-analysis, *SSLA* 30: <https://www.cambridge.org/core/journals/studies-in-second-language-acquisition/article/abs/visual-input-enhancement-and-grammar-learning-a-metaanalytic-review/B9D0C50B09928C20C94548B37B29A042>
- Yanagisawa, Webb & Uchihara (2020), glossing meta-analysis, *SSLA*: <https://takumiuchihara.weebly.com/uploads/1/2/3/7/123756989/yanagisawa-webb-uchihara-2019-glossing_meta-analysis.pdf>
- Hirata et al. (2024), multimodal pitch-accent training, *Language and Cognition*: <https://www.cambridge.org/core/journals/language-and-cognition/article/multimodal-training-on-l2-japanese-pitch-accent-learning-outcomes-neural-correlates-and-subjective-assessments/AB2195C963F348823C8175220F9F9EA1>
- W3C, Requirements for Japanese Text Layout (ruby size): <https://www.w3.org/TR/jlreq/>
- WCAG 2.2, Use of Color (1.4.1) and Non-text Contrast (1.4.11): <https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html>, <https://www.w3.org/WAI/WCAG21/Understanding/non-text-contrast.html>
- Comparable tools' defaults, read from their source: jpd-breader `src/content/word.css`, Anki JPDB Reader `docs/custom-css.md`, JitenReader PR #21, Lute v3 `lute/static/css/styles.css`, Hachidori issue #520.
