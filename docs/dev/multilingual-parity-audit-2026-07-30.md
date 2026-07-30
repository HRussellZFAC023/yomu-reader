<!-- Internal engineering note. docs/dev/**/*.md is in internalDocsExcludeGlobs, so this
     is never routed as a page and never enters sitemap.xml. -->

# Yomu multilingual support: the honest verdict

**Scope.** 33 registered learning targets (`ja`, `ko`, and 31 `*-roster-v1` generic modules), 18 declared capabilities, measured in `release-worktrees/lens-ocr-scope-20260728` on 2026-07-30. Rows marked **[CORRECTED]** are where an adversarial challenge overturned the original audit verdict. Rows marked **[verified here]** are ones I re-measured myself for this document because two challenges contradicted each other; the measurements are in §7.

---

## 1. The one-paragraph answer

**No. Full multilingual support does not exist, and the capability matrix that is supposed to describe it is read by almost nothing — so it neither documents reality nor protects the learner from it.** Exactly **three** of the 18 flags have any read site in production code (`morphology` at `src/reader/languages/morphology.ts:39`, which has zero callers; `ocr` at `src/reader/languages/resolve.ts:42`, which only scopes a settings migration; and `term-lookup` at `config/docs/product-claims.ts:34`, which is build-time and drives the public homepage). Sixteen flags change nothing a learner can see. What *does* exist, and is genuinely good, is a **target-neutral plumbing layer**: ICU segmentation for all 33, OCR for all 33, Tatoeba example sentences for all 32 non-Japanese targets with honest visible degradation, per-target lookup hotlinks for all 32, a language-agnostic SRS store and SM-2 scheduler, and — refuting the prior everyone was working from — **1,637 published dictionary entries covering all 32 roster languages** (34 headword languages; the "zero non-CJK entries" measurement is stale). What does **not** exist is the layer that turns that plumbing into learning: **no morphology for any target but Japanese**, so a Russian learner sees roughly 1 word in 7 annotated on ordinary prose; **no recommendation path to the non-Japanese dictionaries**, because `DICTIONARY_CATALOG_TARGET_LANGUAGE = 'ja'` is a type-level literal (`src/reader/dictionaries/catalog/types.ts:2`) and all 32 recommendation manifests are `<learner>-ja.json`; and **no target choice at install at all** (`src/reader/app/onboarding.ts:160` renders the target as a read-only `<output>` containing the literal `'日本語 — Japanese'`). Worse than any absence, three features are **on by default and actively hostile** to a non-Japanese learner: the YouTube immersion filter hides their target-language videos as `non-japanese`, `preferJapaneseSiteLanguage` spoofs navigator language, timezone and geolocation to Japan on every site, and text-to-speech overrides a correct `utterance.lang` with a Japanese voice whenever one is installed. **Actionable summary: Yomu today is a Japanese learning system plus a competent 32-language reading-and-lookup tool with a Japanese skin. That is a real, shippable product — but it is not what the homepage says, and the target picker offers 33 languages with no readiness signal while the interface-locale picker 20 lines below it disables 31 locales with a stated reason.**

---

## 2. Capability × support table

Declared counts measured against the live registry (33 modules). "Actually works for" is the strongest measured claim, not the flag.

| # | Capability | Declared for | Actually works for | Verdict | What a learner of an "unsupported" target sees |
|---|---|---|---|---|---|
| 1 | **term-lookup** | all 33 | ja fully; 32 partially and unpredictably | **Declared-but-degraded.** Engine is genuinely target-neutral; outcome is decided by surface-form exactness, not by the flag | Words highlight and click, but definitions land only on surfaces the dictionary indexes character-for-character. Measured with correct lemmas installed: th 1/8, ru 1/7, ar 1/6, ko 3/7, de 4/7, es 4/9. Sentence-initial and capitalised words never resolve (`"Paella"`→0, `"paella"`→1); no case folding anywhere in the annotation path (`module.ts` `defaultNormalizeText`, `term-match.ts:76 IDBKeyRange.only`) |
| 2 | **character-lookup** | ja only | ja, zh, lzh; yue partially | **[CORRECTED] Works beyond declared, with Japanese content.** Gate is a codepoint range (`popup/pitch.ts:281-284`, U+3400–U+9FFF), never the flag | zh/yue learners get per-character chips they were never promised — opening a card whose keyword, component and stroke rows come from jpdb.io/kanji, api.jiten.moe, Heisig and KanjiVG, i.e. Japanese readings on a Chinese character. Cantonese Ext-B vernacular (𠮶, 𡃁) is unreachable even with Words.hk honzi installed. The other 29 correctly get nothing |
| 3 | **segmentation** | all 33 | all 33 mechanically; boundaries wrong for zh/yue, coarse for ko/vi | **Flag decorative; boundary *quality* is the real constraint** | ICU splits Thai/Lao/Khmer correctly. But `lookupStartsAtSegmentBoundary` defaults **true** for all 32 (`module.ts:116`), so only the whole ICU segment is ever queried. ICU over-merges Chinese into non-words (我去, 他是, 很好), so with a complete dictionary a Chinese learner gets **four confidently wrong glosses per sentence** while identical text under the ja target is perfect |
| 4 | **morphology** | ja only | ja only | **Honestly declared.** The single largest cause of the term-lookup collapse | `defaultLookupCandidates` returns the surface at depth 0 and nothing else (`module.ts` ~190). Spanish plurals/conjugations, German participles, Russian cases, Arabic al-prefixes and every Korean particle-bearing eojeol miss their own installed lemma |
| 5 | **reading-annotation** | ja only | **ja, zh, yue, ko-hanja** — any BMP-Han surface | **[CORRECTED] [verified here] Works beyond declared, unconfigurably.** Parser supplies explicit rubies for *any* target (`lookup/parser.ts` `localTokenFromMatch`); `sourceTokenRubies` returns them **before** its kana gate; `kanjiRubyParts` then emits a whole-base ruby for a non-kana reading over a Han base | zh/yue/ko learners get pinyin/jyutping/hangul ruby painted on the page — while the entire furigana control block is detached as `jp-only` (`settings/form.ts:1152`), so they cannot configure or switch it off. The 29 non-Han targets get nothing, and the popup drops the reading silently. **Also fails for Japanese** words spelled with non-BMP kanji (𠮟る, 𩸽) |
| 6 | **pronunciation** (pitch) | ja only | ja only | **Correctly declared, dishonestly surfaced** | Every non-Japanese popup ends with a Japanese pitch status row: `Exact pitch unavailable`. The toggle is detached as `jp-only`, so it can only be turned off by switching target to ja first. Meanwhile 470 non-ja IPA dictionaries ship and are filed under a UI heading reading **"Pitch dictionaries"** (`catalog-browse.ts:68` → `i18n.ts:636`), and **no code path consumes IPA** — `collectPitchPatterns` requires `entry.mode === 'pitch'` (`pitch-meta-pattern.ts:102`); `grep "'ipa'" src` is empty |
| 7 | **frequency** | ja only | ja (18 dicts), zh (9), yue (3) | **Declaration ≈ right for 30/32; a data gap** | 30 of 32 targets have zero frequency dictionaries (**[verified here]**: catalogue frequency by language = `ja:18, zh:9, yue:3`). No pill, no explanation — indistinguishable from a missing install. zh/yue *would* work but are never offered, since all 32 recommendation manifests target `ja`. The checkbox "Show site frequency in pills" is shown to everyone and is inert for 30 |
| 8 | **examples** | ja only | **all 32 non-Japanese** (Tatoeba); ja via ImmersionKit | **[CORRECTED] The clearest case of the matrix understating shipped work.** `capabilities.examples` has zero read sites; availability comes from `TATOEBA_COVERAGE` | This one genuinely lands, with honest degradation copy: *"This source has no Spanish sentences."*, *"These sentences came without openly licensed audio."*, *"Scene images are Japanese only for now."* Live-verified across all 32 codes. **Defect:** the only entry point is gated on `immersionKitEnabled` (`definition-stack.ts:105`, `main.ts:7143`), so unticking a Japanese anime service deletes Tatoeba for a Spanish learner |
| 9 | **grammar** | ja only | ja — **plus a leak into zh/yue** | **[CORRECTED] [verified here] Leaks wrong content into undeclared targets** | For Latin/Hangul/Thai/Arabic: the card shows "Finding grammar…" then silently removes itself, indistinguishable from "no grammar in this sentence" or "companion failed". For zh/yue it is worse — Han text passes `JAPANESE_TEXT_RE` and bare-Han rule literals fire, so a Chinese learner is served a Japanese N5 explanation with a **Japanese example sentence** (`一番` → "Superlative", example 寿司が一番好きです。) |
| 10 | **audio** (word/sentence) | ja only | ja only | **Correctly declared, dishonestly presented** | Every non-`custom` loader is Japanese by URL literal (`candidates.ts` — languagepod101, japanesepod101, Lingua Libre `incategory:"…-jpn"`, jpdb, jiten, jisho, Bunpro). The one default-enabled hosted source ignores language, gets JPod101's 52,288-byte placeholder, and the learner's first speaker press on a Korean word produces **"JapanesePod101 has no audio for this term."** followed by a sine chime |
| 11 | **text-to-speech** | all 33 | language yes, **voice no** | **[CORRECTED] Declared and actively wrong.** Not hollow — wrong output | `utterance.lang` is correct for all 33, then `textToSpeechJapaneseVoices` filters voices to `lang.startsWith('ja')` (**[verified here]**, `audio/player.ts` ~1281) and `utterance.voice` beats `.lang`. Measured: Russian, Thai, Arabic, Spanish, Cantonese all spoken by **Kyoko (ja-JP)** with the correct voice installed and ignored. Reachable on default settings via the study "read sentence" button. The correct voice is buried at option 156/185 (ru), 175/185 (yue). Separately, 10 of 33 target locales have no OS voice at all |
| 12 | **ocr** | ja + ko (2) | **all 33** | **[CORRECTED] Works beyond declared — the one media capability that genuinely serves a non-Japanese learner** | Correct accept-language, target-aware line survival, ICU-segmented clickable words, verified for th/km/lo/ar/fa/el/ru/vi/ko/es. The flag only decides which stored `ocrLanguage` the settings migration unpins (exactly `ja-JP` and `ko-KR`). Residual defects: `.slice(0,2)` truncates 3-letter subtags so **fil → `fi` (Finnish)**, `yue → yu`, `grc → gr`; no `dir` on the overlay; a purely geometric vertical-writing heuristic can stamp `vertical-rl` on Arabic |
| 13 | **subtitles** | all 33 | canonical 2-letter codes only | **Partially works, presented as Japanese** | A `th` track is detected; `tha`, `arb`, `spa`, `tl` (for `fil`), `zh-HK` (for `yue`) are not — `ko` is the only target with aliases, and its `'korean'` alias is dead code (rejected by the code-shape test first). Label inference is ja/en only *by construction*, and classifies `中文`/`粵語` as **ja**. Everything detected renders inside `lang="ja"` with no `dir`, behind a button reading **"Load Japanese subtitles"** |
| 14 | **mining** | ja only | card creation generic; sentence + Anki mapping Japanese | **Declaration ≈ right about the learner outcome** | The learner *can* press Add, but the mined sentence is a fragment: only `。！？!?` are hard boundaries and every inter-word space is a soft one above 48 chars, so es→`"La casa"`, fr→`"la maison"`, ru→`"в дом"`, ar→`"وقرأت كتابا"`. Anki auto-mapping scores expression/reading/sentence 0 without `hasJapanese`, so a generic deck maps the **sentence into the meaning field**. Defaults are deck `よむ`, note type `よむ Japanese` |
| 15 | **srs** | ja only | **all 33** | **[CORRECTED] Works beyond declared, with one integrity bug** | Identity, storage, tombstones, encrypted sync and SM-2 round-tripped 9 languages losslessly. Understated by the flag. Two real problems: the Study queue does **not** filter by active target, so one session mixes every language in the deck; and because `newTabCardReading` resolves `normalizeReading` against the **active** target, grading a non-Japanese card in a Japanese session can **fork** it into a duplicate and lose the review |
| 16 | **grading** | ja only | buttons + SM-2 for all 33; typed grading broken for 20 | **[CORRECTED] Understated for buttons; actively wrong for typed Latin** | Grade buttons and scheduling are language-blind and correct. Only Jiten and JPDB are offered as grading services. Typed answers are destroyed — see row 17 |
| 17 | **typing** | all 33 | ja; accidentally OK for non-Latin; **broken for 20 Latin targets**; **unusable for ko** | **[CORRECTED] Declared and actively wrong** | `input.value = convertRomajiToKana(input.value)` runs unconditionally (**[verified here]**, `newtab/controller.ts:6630`). A Spanish learner types `comiendo`, sees the box become `cおみえんど`, and is told Correct. `está` typed as `esta` is graded wrong (48 of 49 everyday accented Spanish words). 295 colliding buckets / ~591 words produce **false accepts** (`chile` accepts `tile`) and 11 words produce false negatives. Korean gets no IME substitute at all: `bap` → `ばp` → *"Not quite — try again"* |
| 18 | **handwriting** | ja only | ja, zh, yue (by codepoint) | **[CORRECTED] Leaks into 2 undeclared targets with fake grading** | The 29 non-Han targets see a permanently greyed-out **"Write"** button whose only explanation is *"This word has no kanji to handwrite"*. zh/yue get an **enabled** button whose stroke reference 404s on KanjiVG (说, 咗), and with no reference the grader is arithmetically forced to pass any scribble at 100. The Search "Draw" pad is unconditional for all 33 and posts `language: 'ja'` |

**Score.** Overstating flags (declared true, does not work): **text-to-speech, typing**, and partially **term-lookup** and **subtitles**. Understating flags (declared false, ships anyway): **examples (32), srs (32), ocr (31), grading-buttons (32), reading-annotation (3), character-lookup (2), frequency (2), handwriting (2), grammar (2, wrongly)**. Roughly honest: **morphology, pronunciation, audio, mining**. The matrix is wrong in **both** directions and is enforced nowhere.

---

## 3. The gap list, ordered by learner harm

### (a) Declaration bugs — cheap, hours to days

Ordered by harm, but note that fixing a flag changes **nothing** on screen today, since nothing reads them. These are worth doing only as prerequisites to (b), or to stop the docs gate licensing false claims.

| # | Gap | Where |
|---|---|---|
| a1 | `text-to-speech: true` on all 33 is the only flag that **overstates in a way a gate could catch** — but enforcing `false` would be the *wrong* repair, since 22 of 33 target locales do have a correct OS voice. The defect is the voice filter, not the flag | `roster-targets.ts:20` vs `audio/player.ts` ~1281 |
| a2 | `examples: false` on 32 targets that demonstrably work; `srs: false` on 32; `ocr: false` on 31; `reading-annotation: false` on zh/yue/ko which paint ruby today. If the matrix is ever wired up as a gate it will **switch off working features** | `roster-targets.ts:17-23` |
| a3 | `pronunciation: 'none'` and `phoneticScripts: []` hardcoded for all 31 generic targets while 470 IPA dictionaries ship | `roster-targets.ts:27-28` |
| a4 | `LearningTargetModule.direction`, `typography.direction`, `typography.readingAnnotationMode`, `typography.supportsVerticalWriting` and `featureSemantics.*` have **zero production readers** — declared metadata that documents nothing | `module.ts`, `roster-targets.ts:16-17` |
| a5 | The docs gate licenses "a complete system" on **one** capability out of eighteen, and its expectation is computed with the same expression it tests, so it is tautological on the flag | `config/docs/product-claims.ts:34`; `tests/reader/docs-published-pages.test.ts:186-206` |
| a6 | The three non-`jp-only` language families (`jpzhyue-only`, `jpzhyueko-only`, `not-jpzhyueko`) are declared and styled but no markup carries them | `settings/language-gating.ts:5-7`; `styles/base.css:351-357` |

### (b) Japanese-only code paths — real engineering

Ordered strictly by how badly they break a learner.

| # | Gap | Harm | Where |
|---|---|---|---|
| **b1** | **No target choice at install.** The onboarding target is a read-only `<output>` containing `'日本語 — Japanese'`. Every default — dictionaries, audio, YouTube, study steps — is locked to Japanese before the learner can express a preference | Precedes everything else. A beginner cannot pick their own language | `app/onboarding.ts:160` **[verified here]** |
| **b2** | **The recommended-dictionary shelf cannot reach non-Japanese supply.** `DICTIONARY_CATALOG_TARGET_LANGUAGE = 'ja'` is a `as const` literal validated by the schema; the shelf filter is `headwordLanguages.includes(catalog.targetLanguage)`; all 32 manifests are `<learner>-ja.json`. The one shelf that *could* annotate a Spanish page is captioned, in Spanish, *"Estos diccionarios no sirven para leer japonés."* | 2.07 GB of shipped non-Japanese dictionary data is unreachable on the happy path. A Spanish learner is offered JMdict-es and KANJIDIC | `catalog/types.ts:2`, `catalog/runtime.ts:123`, `recommendation-shelf.ts:68`, `catalog-browse-copy.ts:116/268` |
| **b3** | **No morphology for any target but Japanese**, and `lookupStartsAtSegmentBoundary` defaults true, so nothing widens or sweeps | The dominant cause of "the page looks unannotated". ru 1/7, ar 1/6 with correct lemmas installed | `module.ts` `defaultLookupCandidates`, `:116` |
| **b4** | **Han targets get confidently wrong answers.** ICU over- and under-merges Chinese; only the whole segment is queried; no sweep. Same text + same dictionary under the ja target is perfect | This is not degradation, it is misinformation. A Chinese learner is strictly better off setting their target to Japanese | `dictionaries/yomitan/index.ts` ~513-527 |
| **b5** | **NFKC destroys Thai and Lao lookups.** `defaultNormalizeText` calls `.normalize('NFKC')`, which decomposes THAI SARA AM U+0E33 → U+0E4D U+0E32 and LAO U+0EB3 → U+0ECD U+0EB2, while the importer stores headwords verbatim. Every ำ/ຳ word is queried in a spelling no dictionary contains | Removes a huge share of Thai/Lao vocabulary (ทำ, คำ, น้ำ, จำ, สำคัญ, ทำงาน) regardless of correct segmentation | `module.ts` `defaultNormalizeText`; `zip-normalize.ts` `normalizeZipTermRow` **[verified here]** |
| **b6** | **YouTube immersion filter + `preferJapaneseSiteLanguage`, both default true for every target.** Target-language videos hidden as `non-japanese` (auto-reveal only on `/results` when nothing survives); ~140 hardcoded Japanese JLPT channels offered; navigator language/languages, Intl locale, timezone `Asia/Tokyo`, Date offset and geolocation spoofed to Tokyo on **every** URL; Google, Reddit and Wikipedia redirected to their Japanese versions | Actively hostile. The learner is worse off than if the feature did not exist | `subtitles/youtube-filter-scan.ts:61-114`, `youtube.ts:930-933`, `app/preferred-site-language-impl.ts:628-637/816-843` |
| **b7** | **TTS voice override.** `utterance.lang` is right, then a Japanese voice is forced whenever one is installed, including as the missing-saved-voice fallback | Cyrillic and Han read aloud by Kyoko on the default path | `audio/player.ts` ~1170/1174/1281 **[verified here]** |
| **b8** | **Typed grading destroys Latin-script answers** and offers Korean no IME substitute | Correct answers rewritten to kana in front of the learner; false accepts and false negatives | `newtab/controller.ts:6335/6630`, `newtab/japanese-input.ts:55-60` **[verified here]** |
| **b9** | **The recall-cloze step is deleted for 30 of 33 targets, permanently.** `pinnedStudyPlanInputs` pins `hasRecallCloze` at first presentation; at that moment `recallSentenceFromCard` → `normalizePromptContextSentence` → `queryHasJapanese` returns `''` for non-Japanese. Async enrichment is explicitly forbidden from reshaping the plan (pitch is the sole exception). The Type step's *prompt* does gain a cloze one frame later — stamped `lang="ja"` and run through the Japanese parser | Half the study loop silently missing, with no empty state | `newtab/controller.ts:4585-4592, 7106-7109, 6377, 10694` **[verified here]** |
| **b10** | **Study surface serves Japanese content by default.** With no dictionary installed the queue is 12 hardcoded Japanese words labelled "Starter words", first card plan `kanji-doodle(連) > kanji-doodle(絡) > …` | The first thing a Spanish learner sees after picking Spanish is a Japanese kanji drill | `newtab/kanji-helpers.ts:18-27` via `controller.ts:3654-3667` |
| **b11** | **Mined sentence truncation.** Only `。！？!?` are hard boundaries; every inter-word space is soft above 48 chars | Every mined card for a space-separated target carries a 1–2 word fragment instead of its sentence | `dom/reader-word.ts:291, 345-357, 403-409` |
| **b12** | **No case folding in the annotation or click path**, and the search-box "escape hatch" does not exist (the glossary index lowercases glossary *text*, not headwords) | Sentence-initial words, proper nouns and capitalised German nouns are unreachable | `module.ts` `defaultNormalizeText`; `term-match.ts:76`; `yomitan/index.ts` ~1437/2179 |
| **b13** | **Anki auto-mapping is `hasJapanese`-gated**, so a pre-existing generic deck maps the sentence into the meaning field | Silent data corruption in the learner's own deck | `anki/field-mapping.ts:349-368` |
| **b14** | **RTL is absent for content.** `direction` is never read; four subtitle surfaces hardcode `lang="ja"`; zero `dir=` in `src/reader/subtitles/`; zero RTL rules in any `src/reader/styles/*.css`; `base.css:252` pins `direction: ltr` on the reader root — which **overrides** the `dir="rtl"` that `locales/direction.ts:66` stamps on those same roots, defeating the one `rtlGate` item marked done | Arabic and Persian content laid out LTR in a box declared Japanese, with no bidi isolation. The only `dir="auto"` in the whole reader is the U46 example renderer | `styles/base.css:247-252`; `locales/direction.ts:66` |
| **b15** | **`immersionKitEnabled` kills Tatoeba for all 32.** The check runs before the target check | Unticking a Japanese anime source deletes a Spanish learner's only example source | `sources/definition-stack.ts:105`; `app/main.ts:7143` |
| **b16** | **Grammar and Translation cards silently self-remove** for non-Japanese, and grammar leaks Japanese hints into zh/yue | For a learner with no dictionary those two cards were the whole popup | `study/sources.ts:97/107/143`; `study/tools-impl.ts:86-87/288` **[verified here]** |
| **b17** | **Multi-language SRS deck can fork cards.** `newTabCardReading` resolves `normalizeReading` against the active target, and Japanese's implementation discards a non-Japanese reading | Grading a Spanish card during a Japanese session duplicates it and loses the review | `newtab/study-queue.ts:12-14`; `srs/local-yomu.ts:215-234` |
| **b18** | **Subtitle detection under-includes and over-includes.** No aliases except `ko` (half dead); label inference is ja/en only and reads `中文`/`粵語` as ja; script-blind matching lets `zh-Hant` count for a `zh-Hans` target | Real target-language tracks not adopted; wrong ones adopted | `subtitles/subtitle-sources.ts:326-339`; `subtitle-track-metadata.ts:41-95` |
| **b19** | **OCR 3-letter subtag truncation** — `fil → fi` (Finnish), `yue → yu`, `grc → gr` | 3 targets get OCR weighted toward the wrong or a nonexistent language, with no UI to correct it | `languages/resolve.ts:23-26` |
| **b20** | **~24 English UI strings hardcode "Japanese"**, including the master switch for the whole product ("Japanese text on webpages", "Scan Japanese automatically"), the empty state, "Popup Japanese font", "Load Japanese subtitles", "Text-to-speech (Kana reading)" | After `syncLanguageFamilyDom(root,'ru')` the dialog still contains 283 Japanese-specific strings | `app/i18n.ts:250/252/40/149/158/347/762` |

### (c) Data-supply gaps — some solvable, some not

| # | Gap | Reality |
|---|---|---|
| c1 | **Frequency data: 30 of 32 targets have zero** | **[verified here]** catalogue frequency = `ja:18, zh:9, yue:3`. Genuine supply gap. Solvable per-language via corpus work; not solvable by code |
| c2 | **Word/sentence audio** | 12 of 32 have zero Tatoeba sentence-audio rows (`sq grc da el km ko lo mn fa sh tl vi`). Term audio has no non-Japanese source at all — every loader is a Japanese service |
| c3 | **Pronunciation is a format gap, not a data gap** | 470 non-ja IPA dictionaries ship. Nothing in `src` can read IPA (`grep "'ipa'" src` empty). This is (b) work disguised as (c) |
| c4 | **Grammar** | 8 grammar dictionaries, all `ja`. The 307-rule engine is a Japanese kana/kanji regex table. No generic-grammar path exists and none is cheap |
| c5 | **Character dictionaries** | 32 kanji-category entries: `ja:25, zh:4, yue:1, lzh:2`. Correct for the roster — only Han targets need them |
| c6 | **TTS voices** | 10 of 33 target locales have no OS voice at any specificity (`sq grc yue km lo la mn fa sr-RS fil`). Two are self-inflicted (`yue-HK` vs the OS's `zh-HK` Sinji; `sr-RS` vs `hr-HR`); `grc-GR` and `la-VA` no engine implements. Unsolvable in-repo |
| c7 | **Burmese** | Not a gap — a deliberate ruling. `my` is absent from the 32-language roster (**[verified here]**), the catalogue, and lookup-links, pinned by `docs-published-pages.test.ts` and recorded twice in `backlog.md` (A37.4) with off-repo measurements: Tatoeba `mya` = 1 sentence, Forvo Burmese = 488 words / 0 recordings |
| c8 | **Term dictionaries — NOT a gap** | The "zero non-CJK entries" prior is **refuted**. **[verified here]**: 1,637 entries, 34 headword languages, all 32 roster covered (`terms:1075`, `pronunciation:478`), revision `2026-07-23.574961e8.wty-95a9151c1beb`. Supply is solved; **reachability** (b2) and **matching** (b3/b5/b12) are not |

---

## 4. Promises that are currently false

The site tells the truth everywhere except the headline — which is the first thing every visitor reads.

### FALSE — the load-bearing one

> **`docs/index.md:14`** — `<h1 class="yomu-fold-h1" id="yomu-home-title">A complete system for learning <YomuLanguageRotator /></h1>`

Shipped, not decorative. `docs/.vitepress/dist/index.html` carries `aria-label="Japanese, Albanian, Ancient Greek, Arabic, Cantonese, Chinese, Danish, Dutch, English, Finnish, French, German, Greek, Hungarian, Indonesian, Italian, Khmer, Korean, Lao, Latin, Mongolian, Persian, Polish, Portuguese, Romanian, Russian, Serbo-Croatian, Spanish, Swedish, Tagalog, Thai, Turkish, Vietnamese"`. So the shipped headline reads **"A complete system for learning Shqip."** and **"…learning ខ្មែរ."**. The Japanese translation is equally strong (`docs/.vitepress/theme/index.ts:622`: `'A complete system for learning': '学ぶためのすべてがそろう'`). **There is no hedge on the page** — `grep -oE "deepest|in development|still being built|not ready|greyed out" dist/index.html` returns nothing. The gate that licenses it checks one capability out of eighteen (`config/docs/product-claims.ts:34`).

### FALSE — homepage feature claims that inherit that h1

> **`docs/index.md:95`** — *"The word returns with the sentence where you found it. A saved show line can carry its audio and picture too. Review by reading, writing, listening and speaking, then choose the grade yourself."*

Mining, SRS and grading all execute, but "the sentence where you found it" is `"La casa"` for Spanish (b11), "writing" is the kana-mangling Type step (b8), and the picture/audio are Japanese-only.

> **`docs/index.md:74`** — *"Press a word in the subtitle, hear it, save the sentence and carry on."*

"hear it" is false (b7/c2 — a Japanese voice or a chime); "save the sentence" saves a fragment.

> **`docs/index.md:109`** — *"Or keep the words in Yomu. Its deck schedules on SM-2 and carries the sentence, the audio and the picture with each word."*

The SM-2 half is true and understated. The sentence is truncated; the audio and picture are Japanese-only.

> **`docs/index.md:106-107`** — *"It fits the deck you already review in"* / *"Anki, jpdb, jiten, Bunpro."*

Structurally Japanese (jpdb/jiten/Bunpro are Japanese-only services), reads as universal, and the Anki path mis-maps non-Japanese fields (b13).

### CONTRADICTS the declared matrix, but the CHANGELOG is right and the matrix is wrong

> **`CHANGELOG.md:25`** (1.8.41) — *"Example sentences now work in the language you are studying, not only Japanese. Pick Spanish, Korean, Arabic, Greek, Lao or any other study language and the popup fetches real sentences from Tatoeba…"*

**TRUE.** Live-verified across all 32 codes. `capabilities.examples` is stale, not this claim. **Caveat worth a line of copy:** it is switched off by the "Show Immersion Kit examples" checkbox (b15).

### TRUE but selectively worded

> **`CHANGELOG.md:8`** (1.8.43) — *"Ancient Greek has no pronunciation site; among these new rows, Chinese is the only target with a verified image source."*

Both halves check out, but 23 of 32 targets have no pronunciation site, not just Ancient Greek. Singling out `grc` reads as the exception when it is the majority case.

### TRUE — and each one contradicts the homepage

> **`docs/faq.md:120`** — *"Japanese is the deepest today… Full study-target reader behavior for all 32 remains in development. The interface itself speaks English and 日本語."* **[verified here]**

> **`docs/learn/your-own-setup.md:18`** — *"The planned product treats all 32 roster languages as full study targets. That target selection and complete dictionary supply are in development."*

> **`CHANGELOG.md:19`** (1.8.42) — *"…all 33 languages it is built for instead of two. The 31 that are not ready yet are shown greyed out with the reason next to them…so a language you were promised can never be chosen and then silently answered in English."* **[verified here: 33 locales / 2 available]** — accurate, and the pattern to copy for the target picker.

> **`CHANGELOG.md:7`** (1.8.43) — *"Every study language now has its own row of lookup sites"* **[verified here: 32 targets]**

> **`docs/features.md:10`**, **`your-own-setup.md:16`** — *"Yomu ships definitions in 9 languages."* Verified.

> **`README.md:49`** — *"choose one of 32 learner languages while keeping Japanese as the Slice 1 learning target"* — correct axis, not falsified.

### Numeric inconsistency

The roster is **33** targets; published docs say "all **32** planned study languages" and "**32** roster languages" (32 = roster minus Japanese) while the rotator promises 33. Separately, `docs/multilingual/README.md:5`, `AGENTS.md:7` and `Decisions.md:7` still describe Slice 1 as "32 learner languages → Japanese" with Japanese as the **fixed** target, contradicting the 33-target picker shipped in 1.8.40. Those three are **not public** (`config/docs/published-pages.ts:31` excludes `multilingual/**`), so this is internal drift only.

---

## 5. The 1.9.0 decision input

### What must be true before a minor can honestly claim multilingual support

A hard gate. All six, or the claim stays scoped.

1. **The learner can choose their target during onboarding**, and the choice is honoured by the dictionary installer. Fixes b1. Without this, nothing else is reachable.
2. **Target-keyed dictionary recommendation.** `DICTIONARY_CATALOG_TARGET_LANGUAGE` stops being a `'ja' as const` literal; a `<learner>-<target>.json` manifest exists for every target Yomu claims; the browse panel stops captioning the learner's own shelf *"not for reading Japanese"*. Fixes b2.
3. **Lookup reaches ordinary running text in the claimed language.** Concretely: case folding on the query path, no NFKC destruction of Thai/Lao, a minimal deinflector or particle-stripper per target family, and either `lookupStartsAtSegmentBoundary: false` plus a bounded sub-segment sweep for Han targets or a real segmenter for them. Fixes b3, b4, b5, b12. **Suggested acceptance bar: ≥60% of content words annotated on a natural 10-sentence paragraph, per claimed target, measured against the actual published dictionary for that language** — not a fixture.
4. **Nothing default-on is Japanese-specific.** The YouTube immersion filter, `preferJapaneseSiteLanguage`, the Japanese TTS voice filter, the unconditional romaji→kana rewrite, the `よむ Japanese` Anki defaults and the Jiten/JPDB-only grading dropdown all become target-gated using the `language-gating.ts` mechanism that already exists and is already used for exactly six controls. Fixes b6, b7, b8, plus most of b20.
5. **The study loop is the same shape for a claimed target as for Japanese** — or the difference is stated. Today the recall-cloze step is silently deleted for 30 targets (b9) and the default queue is Japanese words (b10).
6. **A gate with teeth replaces the term-lookup filter.** The current homepage gate cannot fail, because `term-lookup` is declared for all 33 and read nowhere. Replace it with an explicit, hand-maintained readiness field (e.g. `studyTargetReadiness: 'full' | 'reading-only' | 'planned'`) that the docs build, the target picker and the tests all read from one place — so the flag and the claim cannot drift apart again.

### What can ship in 1.9.0 with honestly-worded degradation

Everything below already works and is worth shipping now, provided the wording is scoped.

- **Reading and lookup for all 32** — segmentation, OCR, clickable words, dictionary browse-and-install, per-target lookup hotlinks.
- **Tatoeba example sentences for all 32**, which already carry the best degradation copy in the product.
- **The 33-locale interface picker**, which already names and disables what it cannot speak.
- **The SRS store and SM-2 scheduler**, which are genuinely language-agnostic (fix b17 first, or filter the queue by target).

### Concrete wording changes

| Where | Now | Change to |
|---|---|---|
| `docs/index.md:14` | `A complete system for learning <YomuLanguageRotator />` | Split the claim from the rotator. E.g. **`A complete system for learning 日本語. A reading and lookup tool for <YomuLanguageRotator />.`** — or keep one line and drop "complete": **`Read, look up and save words in <YomuLanguageRotator />`**, with the Japanese depth claim as the sub-line. The rotator itself is a genuine asset; only "a complete system" is false |
| `docs/index.md:74` | *"Press a word in the subtitle, hear it, save the sentence and carry on."* | Drop "hear it" or scope it: *"Press a word in the subtitle, save it with its line, and carry on. Word audio is Japanese today."* |
| `docs/index.md:95` | *"Review by reading, writing, listening and speaking, then choose the grade yourself."* | Scope the modes: *"Review and grade every word yourself. Writing, listening and speaking drills are Japanese today."* |
| `docs/index.md:106-109` | *"It fits the deck you already review in — Anki, jpdb, jiten, Bunpro."* | Name the axis: *"Anki for any language; jpdb, jiten and Bunpro for Japanese."* |
| `CHANGELOG.md:8` | *"Ancient Greek has no pronunciation site"* | *"Nine of the 32 have a pronunciation site; Ancient Greek has none, and Chinese is the only target with a verified image source."* |
| `settings/form.ts:255-261` (target picker) | 33 plain `<option>`s, no readiness signal | Use the **same** `disabled aria-disabled` + reason pattern the interface-locale picker uses 20 lines below (`form.ts:204-208`). Its own docblock already states the rule: a locale Yomu is not ready to speak *"is shown, named, and DISABLED with the reason. It is never selectable and then silently answered in English."* Apply that rule to targets, or ship the readiness that makes them real |
| `app/i18n.ts:250/252` | *"Japanese text on webpages"* / *"Scan Japanese automatically"* | The master switch for the product must name the active target, not Japanese. Same for `:40`, `:762`, `:149`, `:158`, `:347` |
| `catalog-browse-copy.ts:116/268` | *"These dictionaries are not for reading Japanese."* | Invert against the active target. As shipped, a Spanish learner is told in Spanish that Spanish dictionaries are not for them |
| `i18n.ts:636` | *"Pitch dictionaries"* | *"Pronunciation dictionaries"* — 470 of the 478 are IPA, not pitch, and none is consumable today. Either stop offering them or say what they are for |
| `docs/faq.md:120`, `your-own-setup.md:18` | *"all 32 planned study languages"* | Reconcile with the 33-target picker, and align `docs/multilingual/README.md:5`, `AGENTS.md:7`, `Decisions.md:7`, which still say Japanese is the fixed target |

**One inexpensive, high-value option if 1.9.0 must slip the engineering:** ship the wording changes plus the disabled target picker plus one honest degradation string on target selection — the pattern the product already uses successfully three times (interface locales, `targetDictionaryUnavailable`, the U46 example refusals). That converts the current silent failure into a stated limitation, which is the difference between a bug report and a roadmap.

---

## 6. Where the audits and challenges disagree, and the measurement that would settle it

### Settled here (§7 has the measurements)

| Disagreement | Resolution |
|---|---|
| Does ruby paint for zh/yue/ko? | **Yes.** `sourceTokenRubies` returns explicit `token.rubies` **before** its kana gate; the parser supplies them for any target; `kanjiRubyParts` emits a whole-base ruby for a non-kana reading over a BMP-Han base. The "blocked by one kana regex / no producer supplies rubies" account is wrong |
| Does NFKC break Thai/Lao? | **Yes.** U+0E33 → U+0E4D U+0E32 and U+0EB3 → U+0ECD U+0EB2 confirmed; `defaultNormalizeText` uses NFKC; `module.ts:125` wires it into `lookupCandidates`; the importer stores headwords verbatim. The "Thai really does annotate 8/10" claim is wrong |
| Does grammar leak into zh/yue? | **Yes.** Han text passes `JAPANESE_TEXT_RE`, and bare-Han rule literals (`一番`, `場合`, `間`) fire on natural Chinese and Cantonese. "Works-for-declared-only" is wrong |
| Is the recall-cloze step deleted for 30 targets, or does it arrive after an async upgrade? | **Both, and the distinction matters.** `pinnedStudyPlanInputs` pins `hasRecallCloze` at first presentation and its own comment forbids async reshaping (pitch is the sole exception) — so the **step** is genuinely absent for 30/33. The Type step's **prompt** does become a cloze one frame later, from the card's own sentence, stamped `lang="ja"`. Also: tier-1 dictionary sentences are script-filtered to kana/Han, so a non-Japanese target can never receive an N+1 dictionary sentence |
| Does the capability matrix have runtime reads? | **Three total in production, one of which is a write.** `morphology.ts:39` (no callers), `resolve.ts:42` (`ocr`, settings migration only), `product-claims.ts:34` (build-time). The `sources/examples/*` hits are a different type (`ExampleSourceCapabilities`) |
| Is the dictionary catalogue non-CJK-empty? | **No.** 1,637 entries, 34 headword languages, all 32 roster covered. Every audit and challenge that tested this refuted the prior |
| Does YouTube search leave the learner's videos hidden? | **Home yes, search no.** `youtube.ts:930-933` auto-reveals on `/results` when nothing survives and ≥8 were filtered — satisfied by an all-Thai search. The home feed has no such escape |

### Genuinely unresolved — and the one measurement each needs

1. **Do the real WTY dictionary zips contain inflected "form-of" entries?** This is the single most important open question in the whole audit, because it decides whether term-lookup for the 20 Latin-script targets is hollow (b3 is a blocker) or merely imperfect (b3 is a nice-to-have). One challenge reproduced es 4/9 with a lemma-only dictionary and 9/9 with Wiktionary-style form-of entries added — and **neither** side measured the real archive. *Settling measurement:* download `[ES-EN] Wiktionary (terms)` from `dictionaries.yomureader.com`, count the fraction of `term_bank` rows whose glossary is a form-of pointer versus a lemma definition, then run the real annotation path over a natural 10-sentence Spanish paragraph and report the annotated-word share. Repeat for `[RU-EN]` and `[KO-EN]`. Nothing else in this document changes as much on the answer.
2. **Are the 478 IPA "pronunciation" dictionaries `term_meta` banks with `mode: 'ipa'`, or `terms` banks whose glossary is the IPA string?** Decides whether c3 is a one-mode reader (cheap) or a schema problem. No audit opened an archive. *Settling measurement:* download one `(IPA)` zip and print the first row of each bank file plus `index.json`.
3. **Whether the declared non-Japanese dictionaries actually install, index and return definitions in the running reader.** Every measurement so far used hand-built or probe-imported stores. *Settling measurement:* in a real browser, install `[ES-EN] Wiktionary` from the browse shelf under target `es` and confirm a definition renders on a live Spanish page.
4. **Does Google Translate actually serve `yue`, `lo`, `km`, `mn`, `fil`?** `translation/google.ts:59-84` returns `supported: false` for `grc` only and is optimistic for everything else, with no whitelist. *Settling measurement:* one live request per code with the shipped `tl=` parameter.
5. **Live OCR recognition quality per language against the real Lens endpoint.** All measurements were of the request and the response-filter path, never of accuracy. *Settling measurement:* one real screenshot per script family through the shipped provider.

---

## 7. What remains unverified

Read this document as incomplete in exactly these places.

**Verified by me for this document** (so you know what is first-hand): NFKC decomposition of U+0E33/U+0EB3 and its wiring through `defaultNormalizeText` → `module.ts:125` `lookupCandidates`; the verbatim headword storage in `normalizeZipTermRow`; the full ruby chain (`localTokenFromMatch` → `sourceTokenRubies` → `kanjiOnlyRubySegments` → `kanjiRubyParts`) and `KANJI = '㐀-鿿'` with `KANJI_RE` tested against 9 surfaces; the grammar-rule Han matches against 4 natural Chinese/Cantonese sentences plus `JAPANESE_TEXT_RE`; the exhaustive `.capabilities` production sweep; catalogue totals, categories, 34 headword languages and frequency-by-language; interface locales 33/2, lookup-links 32, `LEARNER_LANGUAGES` 32 with no `my`; the `pinnedStudyPlanInputs` pin and its comment; `recallSentenceFromCard`'s override-first order; `studySentenceTiers` and the kana/Han filter on the dictionary tier; the repo's own `vi.waitFor` cloze test; `onboarding.ts:160`'s hardcoded `'日本語 — Japanese'`; `textToSpeechJapaneseVoices`; the unconditional `convertRomajiToKana` at `controller.ts:6630`; the six `jp-only` sites in `settings/form.ts` and `languageFamilyIncludes`; the target picker's absence of a disabled state; `docs/index.md:14`; `docs/faq.md:120`.

**Not verified anywhere, by anyone:**

- **Real dictionary archive contents** — see §6.1 and §6.2. Every coverage number in §2 was taken against a dictionary the auditor constructed. The *engine* behaviour is solid; the *learner outcome* for the 20 Latin-script targets is not established.
- **End-to-end install → annotate in a real browser.** All of this is jsdom, `vite-node` and `fake-indexeddb`. No measurement in this document was taken in Chrome or Firefox with the shipped userscript.
- **Visual bidi layout for `ar`/`fa`.** jsdom does not lay out bidirectional text. The RTL finding is the *absence* of `dir` plus `direction: ltr` in the reset — a strong inference, not a rendered box.
- **Live OCR accuracy per language**, and whether Google Lens honours the (correct) protobuf locale over the (truncated) accept-language header for `fil`/`yue`/`grc`.
- **Google Translate coverage** for `yue`, `lo`, `km`, `mn`, `fil`.
- **TTS voice availability beyond one macOS install** (184 voices / 51 locales, Darwin 25.5.0). Windows, Linux, Android and Chrome's network "Google …" voices are unmeasured, so the 22/1/10 split is one data point, not a distribution.
- **Store-facing copy.** No Chrome Web Store or AMO listing body exists in the tree; only `docs/store-review-notes.md` (*"Yomu is a Japanese reading assistant."*). Per memory, the stores serve 1.8.2, so multilingual promises there are probably absent — but the live listings were not fetched.
- **Whether `syncLanguageFamilyDom` removes anything outside the settings form.** Statically only `settings/form.ts` markup carries `jp-only`; the reader root was not rendered under jsdom to confirm nothing picks the class up dynamically.
- **Reachability of two conditional bugs:** the grade-queue cross-language `cardKey` collision (needs a `vid=0/sid=0` card in two languages; no production producer found) and the `ocrLanguage` pin the OCR migration would miss (no shipped path writes a resolved tag).
- **Line-number drift.** This worktree is shared with six concurrently-editing codex sessions; `catalog.json` and `runtime-catalog.json` were both modified today. Every path is correct as of my reads, but re-verify a line number before acting on it.