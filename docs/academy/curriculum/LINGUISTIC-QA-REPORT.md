# Linguistic QA report

Japanese-accuracy review of the encoded course. Two native-level reviewers read every
Japanese string in `src/academy/foundation-course.ts` and
`src/academy/lessons-content.ts` — dialogue, vocabulary, grammar examples, practice
items and answers, model answers, and comprehensible-input lines — covering particles,
conjugation, naturalness, register, counters, kanji readings, and furigana
segmentation. A separate specialist produced pitch-accent data. Findings rated medium
or above were re-checked by an adversarial verifier. Machine-readable source:
`public/academy/content/linguistic-qa/`.

## Headline

The Japanese is high quality. Across ten route lessons and three warm-layer lessons the
complete defect list is six items: one medium, four low, one informational. None is a
grammar or conjugation error; all concern reading cards, orthography consistency, an
ambiguous numeral, a particle-consistency choice, and one English gloss. All six are in
`src/academy/` content, which this arm reports on but does not edit.

## Findings

Full detail in `linguistic-qa/qa-findings.json`.

**F-KANJI-01 (medium, verified).** In lesson-07 the 部 kanji card pairs reading ぶ with
the word 部屋, but 部屋 is read へや (a jukujikun); 部 is not ぶ there. The adjacent 屋=や
card is correct, so a learner assembles 部(ぶ)+屋(や)=ぶや and nothing supplies へや to
correct it. An adversarial verifier upheld this: 部屋 is in the 常用漢字表 付表 of special
readings, and the card breaks the list's own convention (every other card ties the
reading to its example word). *Fix:* annotate 部屋 as a special へや reading, or use 全部
/部長 where 部 is genuinely ぶ.

**F-KANJI-02 (low).** The lesson-04 今 card lists いま／こん with the word 今日, but 今日 is
read きょう (jukujikun). Both readings are valid for 今 in general; only the word pairing
is off. The vocabulary entry 今日→きょう is itself correct. *Fix:* pair 今 with 今週, or
mark 今日 as special.

**F-ORTHO-01 (low).** 毎日十分勉強します is glossed "ten minutes", but 十分 before a verb
reads most naturally as じゅうぶん ("enough"), and Yomu's live furigana is likely to inject
that. *Fix:* write 毎日10分 or 毎日じゅっぷん, or reword.

**F-ORTHO-02 (low).** The teacher's name is spelled りえ先生 (hiragana) in one file and
リエ先生 (katakana) in the other. *Fix:* standardise on リエ先生 to match the other stylised
cast names.

**F-PARTICLE-01 (low).** A lesson-08 vocab example marks the prepared object with を
(ホテルを予約してあります) while the lesson drills the が pattern and every other 〜てあり
ます instance uses が or は. The を form is grammatical, but as the lone outlier it
undercuts the pattern being taught. *Fix:* use ホテルが/は予約してあります.

**F-GLOSS-01 (info).** 教室は二階です is correct; the gloss "second floor" is American,
while the course uses British spelling throughout — in British English 二階 is the
"first floor". *Fix:* gloss as "first floor" or accept the Americanism deliberately.

## What was confirmed correct

The reviewers explicitly cleared the areas most likely to hide errors (full list in the
`confirmations` block of `qa-findings.json`):

- **Particles** across all dialogue, examples, and practice answers — topic は, subject
  が, object を, action-place で vs time/goal に, direction へ, and clause particles.
- **Conjugation** — te-form (including irregular 行って), polite past/negative, potential,
  い-adjective past (with the 楽しいでした distractor correctly marked wrong), てしまいました,
  intransitive-state ています, てあります/ておきます, ながら, plain+し, なければなりません/
  なくてもいい, まだ〜ていません.
- **Transitivity pairs** — 開ける/開く, 閉める/閉まる, 壊す/壊れる with correct が/を framing.
- **Counters** — 六時半, 五百円, 十枚, 三人/二人.
- **Readings** — every foundation and warm-layer reading field is valid, and every
  comprehensible-input and example-line reading matches its kanji text, apart from the two
  per-kanji card mismatches above.
- **Register** — polite です/ます is consistent; the only casual shifts are intentional
  (Rie-sensei's playful lines, plain-form inputs before し/なら/ながら).

## Furigana segmentation

`linguistic-qa/furigana-segmentation.json` records the words most likely to be
mis-segmented by an automatic furigana pass: jukujikun (今日=きょう, 明日=あした, 部屋=へや,
一人=ひとり, 二人=ふたり), rendaku (誕生日, 日→び), gemination (失敗=しっぱい), and
intransitive okurigana (開きます=あきます, 閉まります=しまります). All are transcribed
correctly in prose; the only issues are the two per-kanji cards flagged above.

## Pitch accent

`linguistic-qa/pitch-accent.json` gives standard Tokyo (NHK) pitch data for 53
high-frequency headwords: 48 with an accent number, 5 marked `null` (source
`null-uncertain`) where the standard pattern is not known with confidence —
こんばんは, すみません, ありがとうございます, 忙しい, 会社員. Nothing is invented. Every
entry carries `reviewFlag: true`: these values must be re-checked against OJAD or the
NHK accent dictionary before any pitch overlay is shown to learners. Verbs are given in
the masu-form as used in the lessons, with the differing dictionary-form accent noted
(e.g. 飲みます [3] vs 飲む [1]). Anchor examples: 音楽 [1] atamadaka, 運転 [0] heiban,
先生 [3] nakadaka, 好き [2] odaka.

The registry marks pitch as an uncovered skill (`phon:pitch-accent-awareness`); see the
gap report. The post-source syllabus turns this data into an explicit pitch lab.

## Crosswalk verification

An independent textbook expert checked the Genki/Minna cells in the framework crosswalk
(`linguistic-qa/domain-reports/crosswalk-verification.json`): 33 cells checked, 22
correct, 6 wrong, 5 with no clean anchor. The six errors have been corrected in
`framework-crosswalk.json` (each row's evidence note records the change). The most
important: nagara is Genki L18 (not L21), nara is Genki L13 (not L17/L22), ほうがいい is
Genki I L12 (not II L14), and Genki splits obligation (I L12) from permission-to-omit
(II L17). The `approximate` confidence tags flagged exactly the cells that turned out
wrong, and the verified-correct cells were promoted to `high`.
