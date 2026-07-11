# Corpus Inventory — Maker's Private Japanese Library

**Source root:** `/Users/heru/Documents/Japanese`
**Surveyed:** 2026-07-11 · read-only inventory (small text files read in full; large binaries sampled by name/structure only).
**Total footprint:** ~50 GB across 5 top-level areas.

---

## 0. Executive findings (read this first)

1. **The maker's *live* class is Minna no Nihongo II, not Genki.** The `Lessons/` folder is dated coursework (UCL-style weekly lessons) covering **Minna no Nihongo Shokyū II, chapters 28–30**. The grammar points are an exact Minna match: 〜ながら / 〜し (L28), 〜てしまいました + 〜ている states (L29), 〜てある / 〜ておく (L30). This is **upper-beginner / low-N4**, not N5. The "Genki chapter" label some agents might infer is wrong — Genki only has 23 lessons.
2. **`Genki Study Resources` is a complete, self-contained interactive N5→N4 corpus.** It ships per-lesson vocabulary as machine-readable `quizlet` objects (kana + English gloss) embedded in each `index.html`, plus 150 workbook audio MP3s. This is the **single best source of clean, classroom-safe, structured graded content** in the whole library and should be the backbone of Academy N5/N4 content.
3. **`Vocabulary/Vocab 2k.txt` is an adult-content immersion frequency list, NOT a graded deck.** It is a jpdb-style frequency dump mined from eroge / adult ASMR audio. It is sorted by frequency and *does* contain a large core of ordinary high-frequency words (私, 見る, 食べる, 学校…) intermixed with a large volume of explicit/NSFW vocabulary. **Do not surface it wholesale.** The N5 batch below is hand-curated to classroom-safe entries only, with readings sourced from Genki.
4. **Rich audio for listening tasks exists** at three tiers: Genki workbook MP3s (150), the maker's own Minna class listening tracks (39 MP3s), and slow narrated anime/game subtitles (Pepper & Carrot is ideal for N5).

---

## 1. Categorized inventory tree

```
/Users/heru/Documents/Japanese
│
├── KANJI LOOK AND LEARN … (Genki Plus).pdf        129 MB · 512-kanji mnemonic textbook (standalone)
│
├── Vocabulary/                                      24 KB
│   ├── Vocab 2k.txt      2,002 freq-ranked words (adult-immersion mined; kanji/kana surface only, NO gloss)
│   └── words.txt         10-line scratch list (subset of Vocab 2k)
│
├── Lessons/                                        215 MB · MAKER'S LIVE CLASS = Minna no Nihongo II, ch.28–30
│   ├── Lesson 1-20260310/   Ch.28 〜ながら, 〜ている(habitual)      [Handouts/ Homework/ audio materials/]
│   ├── Lesson 2-20260310/   Ch.28 〜し、〜し
│   ├── Lesson 3–4-20260310/ Ch.29 〜ている(states), 〜てしまいました
│   ├── Lesson 5-20260310/   Ch.30 〜てある (+ info-gap picture)
│   ├── Lesson 6-20260310/   Ch.30 〜ておく
│   ├── Lesson 2–6-20260217/20260304/  earlier weeks (Ch.28–29 cycle)
│   └── loose PDFs: Ch.29 reading わたしの失敗, Ch.30 reading 日本で一番, Genki II 3rd-ed WORKBOOK pdf
│        · Each lesson folder = Vocabulary Sheet PDF + grammar/speaking/listening exercise PDFs
│          + Homework PDFs + numbered class-audio MP3s (Track NN.mp3 / A-NN.mp3)
│
├── Subtitles/                                        2.5 MB · authentic listening/reading (see §4)
│   ├── ペッパーとキャロットEP03/EP04 …vtt      slow NARRATED readings — BEST for N5 listening
│   ├── 彼女と彼女の猫 (She & Her Cat) S01E01/E02 .srt + .ass + .sup   poetic, ~N4
│   ├── 日本語でゲーム Unpacking EP01–06 / Little Kitty EP14 .vtt      casual gaming let's-plays
│   └── 日本語の文字の歴史 (History of JP Writing) .vtt
│
├── Resource Packs/                                   27 GB
│   ├── genki-study-resources-master 2/  108 MB · ⭐ INTERACTIVE GENKI I+II (lessons 0–23) — see §3
│   │     lessons/lesson-0..23/{vocab-N, grammar-N, workbook-N, literacy, numbers…}/index.html
│   │     resources/audio/{2nd-edition(71) , 3rd-edition(79)} *.mp3
│   │     lessons/appendix/{dictionary, conjugation-chart, numbers-chart, map-of-japan}
│   ├── Japanese Language Learning Pack/   8.2 GB · CURATED textbook library (best-organized)
│   │     02 Kanji/{Kanji Look&Learn, KKLC, RTK}
│   │     03 Grammar and Vocabulary/{01 GENKI (I+II textbooks, workbooks, CDs, answer key),
│   │                                02 Minna no Nihongo Shokyū (I+II honsatsu, mondaishū,
│   │                                   renshūchō, kanji, conversation DVDs)}  ← matches live class
│   │     04 Reference/{Dict. of Basic/Intermediate/Advanced JP Grammar, Handbook of Verbs/Adj/Adv}
│   │     07 Japanese N3–N1/{Tobira, 新完全マスター, 日本語総まとめ}
│   └── Japanese Mega Learning Pack/       19 GB · vast raw archive (8 numbered categories)
│         01 Writing · 02 Audio Courses/Textbooks (Genki, Minna, Pimsleur, JFBP, Nakama…)
│         03 Grammar · 04 Vocabulary (VocabuLearn, Meguro LC) · 05 Children's Readers
│         06 Dictionaries · 07 Culture/History · 08 Misc (cheatsheets, songs, pronunciation)
│
└── Dictionaries and Tools/                           14 GB
    ├── yomitan-dictionaries-2026-01-11 / 2026-05-06 .json   2.5 GB each · full Yomitan term DBs
    ├── yomitan-settings-*.json                              Yomitan config
    ├── daijisen.zip 903 MB · shinmeikai8.zip 546 MB · nhk16.zip 1.2 GB (pitch-accent)
    ├── forvo_jp.zip 701 MB · forvo_zh.zip 1.2 GB · jpod.zip 1.7 GB   (audio pronunciation packs)
    ├── yomichan server/yomichan_audio_server-master/  Rust local audio server (entries.db + src)
    ├── genki-study-resources-master.zip  85 MB (zipped dupe of the unpacked pack above)
    ├── Kanji 6-…-20260310.zip   4 MB (lesson kanji set: 今来帰会社聞読書話)
    └── Build popup jpdb reader.md   29 MB  (large notes/scrape dump — not read)
```

### Level mapping of the two "mega" packs (quick reference)
- **Language Learning Pack** — clean, deduped, JLPT-organized. Contains the **Minna no Nihongo Shokyū I & II** set (honsatsu, standard problem book, writing renshūchō, kanji book, Kaiwa DVDs) that directly backs the maker's live class, plus full **Genki I & II** textbooks/workbooks/CDs/answer key.
- **Mega Learning Pack** — huge unfiltered dragnet (50+ course series). Useful as a deep bench for audio courses and readers; not curated.

---

## 2. Material → lesson-slot mapping

| Academy slot | Best material in library | Real path (root = `/Users/heru/Documents/Japanese`) |
|---|---|---|
| **Kana (pre-N5)** | Genki L0 interactive hiragana/katakana | `Resource Packs/genki-study-resources-master 2/lessons/lesson-0/` |
| **N5 vocab (structured)** | Genki L1–L12 `vocab-*` quizlets (kana+gloss) | `…/genki-study-resources-master 2/lessons/lesson-1..12/vocab-*/index.html` |
| **N5 grammar drills** | Genki L1–L12 `grammar-*` (auto-graded) | `…/lesson-1..12/grammar-*/index.html` |
| **N5 listening** | Genki workbook MP3s + Pepper & Carrot narration | `…/genki-study-resources-master 2/resources/audio/2nd-edition/*.mp3`; `Subtitles/ペッパーとキャロット*.vtt` |
| **N4 grammar/vocab** | Genki L13–L23 interactive | `…/lesson-13..23/` |
| **Maker's live N4 track (Minna II L28–30)** | Class vocab sheets, grammar/speaking/listening PDFs, class audio | `Lessons/Lesson *-20260310/{Handouts,Homework,audio materials}/` |
| **Minna no Nihongo backing textbooks** | Honsatsu, mondaishū, renshūchō, kanji, Kaiwa DVD | `Resource Packs/Japanese Language Learning Pack…/03 Grammar and Vocabulary/02 Minna no Nihongo Shokyu/` |
| **Genki reference textbooks (PDF)** | Genki I/II textbook+workbook+answer key | `…/03 Grammar and Vocabulary/01 GENKI/` |
| **Kanji (visual/mnemonic)** | Kanji Look & Learn (512) | root `KANJI LOOK AND LEARN … .pdf`; lesson kanji set `Dictionaries and Tools/Kanji 6-…zip` |
| **Grammar reference (all levels)** | Dict. of Basic/Intermediate/Advanced JP Grammar | `…/04 Reference (Grammar and Vocabulary)/A Dictionary of Basic-Advanced Japanese Grammar/` |
| **Dictionary / pitch / audio enrichment** | Yomitan DBs, NHK16 pitch, Forvo/JPod audio | `Dictionaries and Tools/` (yomitan JSON, nhk16.zip, forvo_jp.zip, jpod.zip) |
| **N3–N1 (future)** | Tobira, 新完全マスター, 総まとめ | `…/07 Japanese N3-N1/` |

**Minna II ↔ live-lesson grammar (verified from handout filenames):** L28 = 〜ながら, 〜ている(habitual), 〜し・〜し · L29 = 〜ている(states/intransitive), 〜てしまいました · L30 = 〜てあります, 〜ておきます.

---

## 3. `genki-study-resources` data format (for content ingestion)

Each exercise is a standalone `index.html` whose payload is an inline `Genki.generateQuiz({…})` call. Vocabulary lessons carry a **`quizlet` object** of `'kana' : 'english'` pairs; grammar lessons carry a **`quizlet` array** of `{question, answers:['A<correct>', <distractors>]}` (the correct answer is prefixed with a literal `A`). Kanji-tagged items use `'漢字|かな'` on the key side. This is trivially parseable with a regex and is the recommended pipeline for seeding Academy decks. Exercise→textbook-page index lives at `resources/javascript/exercises/2nd-ed.js` and `3rd-ed.js` (e.g. `lesson-1/vocab-1|Vocabulary: School|p.38`).

---

## 4. FIRST BATCH — ready-to-use content

### 4a. N5 core vocabulary (45 items)

Curated to **classroom-safe, genuinely N5** entries. Every headword is confirmed present in `Vocabulary/Vocab 2k.txt` (line number cited); readings/glosses cross-checked against the Genki `vocab-*` quizlets where they overlap. Explicit entries from Vocab 2k were excluded.

| # | Word | Reading | Gloss | Vocab2k line |
|---|---|---|---|---|
| 1 | 私 | わたし | I; me | 1 |
| 2 | 言う | いう | to say | 3 |
| 3 | 中 | なか | inside; middle | 4 |
| 4 | 見る | みる | to see; to look | 7 |
| 5 | 何 | なに／なん | what | 9 |
| 6 | 今 | いま | now | 15 |
| 7 | 良い | いい／よい | good | 16 |
| 8 | 顔 | かお | face | 18 |
| 9 | 好き | すき | to like | 19 |
| 10 | 手 | て | hand | 20 |
| 11 | 体 | からだ | body | 23 |
| 12 | 事 | こと | thing; matter | 32 |
| 13 | 今日 | きょう | today | 35 |
| 14 | 人 | ひと | person | 36 |
| 15 | 目 | め | eye | 38 |
| 16 | 自分 | じぶん | oneself | 39 |
| 17 | 可愛い | かわいい | cute | 40 |
| 18 | 大丈夫 | だいじょうぶ | okay; all right | 45 |
| 19 | 少し | すこし | a little | 50 |
| 20 | 来る | くる | to come | 53 |
| 21 | 耳 | みみ | ear | 54 |
| 22 | 音 | おと | sound | 58 |
| 23 | 聞く | きく | to listen; to ask | 65 |
| 24 | 男 | おとこ | man | 74 |
| 25 | 口 | くち | mouth | 75 |
| 26 | 女の子 | おんなのこ | girl | 76 |
| 27 | 足 | あし | foot; leg | 86 |
| 28 | 大きい | おおきい | big | 90 |
| 29 | 先生 | せんせい | teacher | 94 |
| 30 | 上 | うえ | up; above | 100 |
| 31 | 妹 | いもうと | younger sister | 106 |
| 32 | 考える | かんがえる | to think | 108 |
| 33 | 知る | しる | to know | 112 |
| 34 | 行く | いく | to go | 115 |
| 35 | 兄 | あに | older brother | 127 |
| 36 | 使う | つかう | to use | 150 |
| 37 | 時間 | じかん | time; hour | 151 |
| 38 | 痛い | いたい | painful | 153 |
| 39 | 言葉 | ことば | word; language | 154 |
| 40 | 食べる | たべる | to eat | 158 |
| 41 | 女 | おんな | woman | 159 |
| 42 | 左 | ひだり | left | 161 |
| 43 | 寝る | ねる | to sleep | 162 |
| 44 | 美味しい | おいしい | delicious | 168 |
| 45 | 待つ | まつ | to wait | 181 |

> Additional confirmed N5 headwords available in Vocab 2k for later batches (line #): 右 みぎ(143), 胸 むね(144), 一番 いちばん(164), 下 した(188), 綺麗 きれい(191), 持つ もつ(196), 部屋 へや(269), 帰る かえる(297), 死ぬ しぬ(331), 泣く なく(332), 買う かう(563), 学校 がっこう(664), 昨日 きのう(632), 電車 でんしゃ(1151), 新しい あたらしい(893), 読む よむ(902), 書く かく(706), 話す はなす(687), 高い たかい(861).

### 4b. Example sentences (20) — all N5, classroom-safe

Extracted from Genki `grammar-*` and L2 classroom-expression quizlets (source path per group).

**XはYです / questions** — `…/genki-study-resources-master 2/lessons/lesson-1/grammar-2,4,5/`
1. メアリーさんはアメリカじんです。 — Mary is American.
2. たけしさんはにほんじんです。 — Takeshi is Japanese.
3. おとうさんはかいしゃいんです。 — (My) father is an office worker.
4. おかあさんはしゅふです。 — (My) mother is a housewife.
5. おとうさんはなんさいですか。 — How old is your father?
6. おとうさんはよんじゅうはっさいです。 — (My) father is 48 years old.
7. はい、そうです。 — Yes, that's right.
8. いいえ、しゅふです。 — No, she's a housewife.

**Demonstratives / prices / location** — `…/lesson-2/grammar-2,3,4,5/`
9. このえんぴつはろくじゅうえんです。 — This pencil is 60 yen.
10. そのペンはにひゃくきゅうじゅうえんです。 — That pen is 290 yen.
11. すみません。ぎんこうはどこですか。 — Excuse me, where is the bank?
12. トイレはどこですか。 — Where is the restroom?
13. あそこです。 — It's over there.
14. おとうさんはにほんじんです。おかあさんもにほんじんです。 — Father is Japanese. Mother is also Japanese.

**Verbs / particles / invitations** — `…/lesson-3/grammar-3,6/`
15. 郵便局に行きます。 — (I) go to the post office.
16. 学校に来ます。 — (I) come to school.
17. うちに帰ります。 — (I) return home.
18. コーヒーを飲みませんか。 — Won't you drink coffee (with me)?
19. 映画を見ませんか。 — Won't you see a movie?
20. 晩ご飯を食べませんか。 — Won't you eat dinner?

**Classroom expressions** (bonus, full sentences) — `…/lesson-2/vocab-8/index.html`: わかりました。("I understand.") · もういちどいってください。("Please say it again.") · 10ページをみてください。("Please look at page 10.")

### 4c. Audio / subtitle paths for listening tasks

**Genki workbook audio (150 MP3s, graded by lesson)** — `…/genki-study-resources-master 2/resources/audio/2nd-edition/` (71 files, e.g. `W01-A.mp3`) and `…/3rd-edition/` (79 files). Filenames encode lesson+section (`W03-B.mp3` = workbook L3 part B).

**Maker's own Minna II class audio (39 MP3s)** — e.g. `Lessons/Lesson 1-20260310/Homework/78 Track 78.mp3`, `…/audio materials/9-A-9.mp3`, `Lessons/Lesson 5-20260310/audio materials/18 A-18.mp3`. These are the listening tracks tied to the class handouts (N4 level).

**Subtitle transcripts (authentic listening + reading):**
- **N5-friendly, slow narrated** (top pick): `Subtitles/ペッパーとキャロットEP03 Pepper & Carrot EP03.vtt` and `…EP04….vtt` — deliberate reading pace, simple 〜です／〜ています sentences with timestamps.
- **~N4, poetic:** `Subtitles/彼女と彼女の猫 Everything Flows.S01E01.…ja[cc].srt` and `…S01E02.…srt` (also `.ass` + `.sup` variants).
- **Casual/gaming:** `Subtitles/日本語でゲーム Unpacking EP01–06 ….vtt`, `…Little Kitty, Big City EP14….vtt`.
- **Topic/culture:** `Subtitles/日本語の文字の歴史 History of Japanese Writing System.vtt`.

---

## 5. Caveats & recommendations

- **Vocab 2k must be filtered, not imported.** It is adult-immersion-mined and majority-NSFW below the high-frequency head. Use only as a *frequency signal* to rank already-vetted N5/N4 word lists; never surface raw.
- **Ingest Genki quizlets programmatically** (regex over `lessons/*/vocab-*/index.html`) for the fastest path to a full, clean N5→N4 deck with glosses.
- **Two-track curriculum reality:** the maker is *actively studying Minna no Nihongo II (N4)* while the richest interactive assets are *Genki (N5→N4)*. Academy content should bridge both — lead new learners through Genki-order N5, but keep a Minna-aligned N4 track (L28–30 grammar) that mirrors the maker's real coursework.
- Large binaries (yomitan JSON 2.5 GB, forvo/jpod/nhk zips, `Build popup jpdb reader.md` 29 MB) were **not opened**; they are enrichment DBs, not lesson content.
