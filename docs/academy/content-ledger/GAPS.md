# Yomu Academy source-ledger gaps report

Honest record of what is missing, ambiguous, or deliberately un-itemised. Nothing is deleted; every gap is a follow-up, not a loss.

## Locations searched and found clean

| Location | Method | JA-learning assets |
| --- | --- | --- |
| /Users/heru/Downloads | name heuristics (japanese|nihongo|genki|minna|kanji|jlpt|hiragana|katakana|tobir | 0 |
| /Users/heru/Library/CloudStorage/OneDrive-ZühlkeEngineeringAG | name heuristics (nihongo|japanese|genki|kanji|jlpt|日本), maxdepth 3 | 0 |
| /Users/heru/Library/CloudStorage/OneDrive-SharedLibraries-ZühlkeEngineeringAG | name heuristics, maxdepth 3 | 0 |

## Moodle corpus not recovered on disk

621 of 688 unique Moodle payloads have no byte-identical file in the scanned roots. These payloads exist only as classroom occurrences in the metadata-only Moodle corpus; no byte-identical file was found in the scanned roots. Recovery would require re-harvesting the Moodle folder archives.

## Un-captured curriculum (structural bridge weeks)

The class continued its own chapter counter past Genki's lesson 23 into Minna no Nihongo Shokyū II. Chapters 24–27 were not captured on disk; they appear in the week ledger as empty, **low-confidence** placeholders so the chronology is not silently collapsed:

| Week | Label | Confidence |
| --- | --- | --- |
| 24 | Structural bridge - class Chapter 24 (NOT captured) | low |
| 25 | Structural bridge - class Chapter 25 (NOT captured) | low |
| 26 | Structural bridge - class Chapter 26 (NOT captured) | low |
| 27 | Structural bridge - class Chapter 27 (NOT captured) | low |

## Revisions without an on-disk predecessor

26 worksheets carry the `New_` revision marker but their plain predecessor is not on disk. Worksheets marked with the New_ revision prefix whose plain predecessor is not present on disk (replaced in place, or survives only in the Moodle corpus). Recorded as revisions; no supersession link possible.

## Aggregated datasets (not itemised per file)

| Dataset | Files | Note |
| --- | --- | --- |
| soya-research/audio-public | 58920 | Catalogued as one aggregate record; individual files not hashed. |
| academy-references/rtk | — | RTK kanji-reference website (KanjiVG stroke SVGs excluded from hashing as an icon/vector l |
| japanese-library/Dictionaries and Tools/*.zip | — | Packaged dictionaries catalogued opaque; members are third-party dictionary data, not clas |

## Missing pairings

2 class worksheets have no paired audio track in their lesson folder (some worksheets are text-only; flagged for review).

## Curriculum-map gaps surfaced by the mapping pass

- Answer keys are almost entirely absent: across the class archive the only answer-filled artifact is the Chapter 30 ~te aru information-gap _completed PDF; grammar/reading/listening sheets have no solutions.
- Textbook mapping for the class term is inferred, not stated in any file: Chapters 28-30 + the grammar sequence match Minna no Nihongo Shokyu II lessons 28-30 exactly (Genki numbering ends at 23), so the class 'Chapter' labels are Minna lessons / a class counter continued past Genki, NOT Genki lessons. The stray Genki II 3rd-ed workbook at top level muddies which homework (if any) draws from it vs. the Minna workbook.
- The class 'Chapter 24-27' bridge is entirely un-captured: absent from every cluster, so those weeks have no recoverable contents and were left as low-confidence placeholders (never invented).
- Genki backbone has NO calendar dates/scheduling anywhere - order derives purely from the embedded lesson number; any week/term calendar mapping is an external decision. Class date tokens (20260217/0304/0310) are download/batch dates, not confirmed class dates.
- Homework 'Track NN' audio numbers are non-contiguous (7,8,9,15,27,28,54,55,78,79) and the source CD is unnamed - cannot confirm Minna vs Genki workbook CD from filenames.
- Lesson/kanji-series coverage is partial: class sessions only cover chapters 28-30 (<=27 and >=31 absent); the numbered Kanji homework series has only 'Kanji 6' present (lessons 1-5, 7+ missing); the Kanji-6 zip name says 20260310 but inner files are 2025-09-10 (ambiguous provenance), and its Japanese worksheet names are mojibake in the zip index.
- Pre-revision originals of 'New_' files are not retained, so the exact nature of each revision cannot be observed.
- Genki local copy is 2nd Edition only (lessons/); the 3rd Edition (lessons-3rd/) is absent (only resources/audio has a 3rd-edition subfolder). Per-lesson vocabulary and single-kanji character inventories were not enumerated; exercise counts are folder-child counts, not strictly gradable-quiz counts.
- Mega/Language packs are unlicensed redistributions of copyrighted commercial materials - legal review required before any use beyond internal cataloguing; downstream must substitute licensed/public-domain equivalents. Deep per-file manifests (audio track lists, page counts, complete-vs-partial volumes) were not captured; duplicate/overlapping works within and across the two packs need de-duplication and canonical-copy selection; author/publisher/edition attributions are inferred from names, not verified by opening files.
- Non-document assets a pure worksheet pipeline may not handle: proprietary software installers ([prog], Rosetta Stone, .ipa/.exe), a study game (Knuckles .clv decks), Anki decks, and saved website snapshots (incl. a 'Paysites' folder). Folktale reader set is incomplete (06,07,08,14 absent). Curator provenance is pseudonymous (hong_hua); redistribution terms unknown. The RECOMMENDED LEARNING ORDER GUIDE.pdf and About .txt files were not parsed (mojibake in the About files).
- Subtitles cluster has NO paired video/audio - captions only (external mkv/WEBRip/Blu-ray sources not present); the .sup is a binary PGS bitmap needing OCR; episode runs are incomplete (Little Kitty only EP14; Pepper & Carrot only EP03/04); 'She and Her Cat' has three distinct productions (OVA .ass, Everything Flows .srt, Blu-ray .sup) that are easily confused as duplicates but are different timings - not supersession. No manifest/level tagging; grouping and difficulty inferred from names/samples only.
- Vocabulary/dictionaries cluster is fundamentally tools/reference with no continuous chronology (only the orphan Kanji-6 unit slots in). Personal vocab lists (Vocab 2k.txt, words.txt) have no headers/glosses/dates/source - provenance is adult/ASMR-mined and unconfirmed, and ungraded. The two 2.53GB yomitan-dictionaries exports were sampled at header only (17 dictionaries, 27,260 kanji) - the exact bundled-dictionary list and licenses were not enumerated. forvo_zh.zip is a Chinese corpus inside a Japanese folder (purpose unconfirmed). Redistribution rights on the packaged commercial dictionaries/audio are restrictive and undocumented. The 29MB jpdb-reader build doc was only head-read (may contain further links/credentials/spec).
- Soya provenance is unresolved: no named-textbook match for the listening text/audio, 0/339 records matched JLPT-official 2012/2018 scripts, strings unindexed across search engines; in-source Gemini/Google-TTS attribution is Soya's own, not independently confirmed. The 58,920-file/781MB audio-public mirror is aggregate-only (not individually catalogued); the screenshots/ dir is empty; listening-map localAudioPath values are stale (/Documents/yomu/... vs actual /Documents/Projects/yomu/...); 60 N3 quick-custom items return HTML not MP3 and 4/5 Pixabay ambient URLs are AccessDenied; best next provenance leads are manual/offline.
- Academy redacted catalog: the private source manifest (sha256 2400b43e...) at resources/yomu-academy/moodle-raw/manifest.json is absent from disk - reconcilable only by fingerprint, never re-derivable here. All 688 unique payloads (916 occurrences) have no recovered filenames; semantic role is unprovable for 904 of 916 occurrences (only the 12 audited Lesson-9 members carry roles); curricular chronology (course years, section/lesson titles, dates, external URLs) lives only in the separate source-ledger.json, which itself points back to the private manifest; duplicate-vs-revision is ambiguous without names/timestamps; 52 of 148 modules (44 url + 3 resource + 5 other) were not archived and have no payload records.
- references-academy is craft/art/tooling reference with ~no curriculum - Japanese-learning-ADJACENT material exists (rtk RTK/Heisig dataset, JPDB/Uchisen userscripts, shinday's Language Dojo mini-game) but none is a taught course; rtk's 2200 ordered kanji pages are a book-index reference, not a curriculum. The brief named 4 sub-apps but 7 are present (confirm the extra 3 are in scope). Licensing is heterogeneous and partly flagged (rtk Heisig-copyright warning, Miku/Vocaloid fan-art). class-photos are privacy-sensitive personal likenesses; requested per-first-name portrait files are not yet present; each sub-app retains its own nested .git (confirm de-vendoring).

## Skipped (non-content) file audit

The scanner skips files whose extension is not on the learning-content allowlist. This is the full per-extension breakdown so every exclusion is auditable — no genuine curricular file hides in an opaque count. Extensions below are code, icon/vector libraries, fonts, and compiler/build intermediates.

| Ext | Skipped | Sample path |
| --- | --- | --- |
| .svg | 11378 | Resource Packs/genki-study-resources-master 2/resources/fonts/fontawes |
| (none) | 194 | .DS_Store |
| .js | 97 | Resource Packs/genki-study-resources-master 2/resources/javascript/all |
| .dll | 25 | Resource Packs/Japanese Mega Learning Pack/06.Dictionaries, Phrasebook |
| .css | 17 | Resource Packs/genki-study-resources-master 2/resources/css/stylesheet |
| .ani | 17 | shinday/assets/ani file-animation WxS/Alternate.ani |
| .exe | 15 | Resource Packs/Japanese Language Learning Pack - Learn Japanese!/07 Ja |
| .py | 13 | Resource Packs/genki-study-resources-master 2/resources/tools/anki_dec |
| .rs | 8 | Dictionaries and Tools/yomichan server/yomichan_audio_server-master/bu |
| .yml | 8 | Resource Packs/genki-study-resources-master 2/.github/FUNDING.yml |
| .mjs | 7 | scripts/audio-audit.mjs |
| .r | 6 | rtk/_code/data-full-simple-list.R |
| .ico | 5 | Dictionaries and Tools/yomichan server/yomichan_audio_server-master/ap |
| .db | 4 | Dictionaries and Tools/yomichan server/yomichan_audio_server-master/en |
| .bat | 4 | Dictionaries and Tools/yomichan server/yomichan_audio_server-master/st |
| .ocx | 4 | Resource Packs/Japanese Mega Learning Pack/06.Dictionaries, Phrasebook |
| .rds | 4 | rtk/_code/koohii.rds |
| .ttf | 3 | Resource Packs/Japanese Mega Learning Pack/06.Dictionaries, Phrasebook |
| .webmanifest | 3 | care-a-lot-celebration/public/assets/site.webmanifest |
| .toml | 2 | Dictionaries and Tools/yomichan server/yomichan_audio_server-master/Ca |
| .m3u | 2 | Resource Packs/Japanese Language Learning Pack - Learn Japanese!/07 Ja |
| .bin | 2 | Resource Packs/Japanese Mega Learning Pack/02.Audio Courses, Textbooks |
| .cue | 2 | Resource Packs/Japanese Mega Learning Pack/02.Audio Courses, Textbooks |
| .ini | 2 | Resource Packs/Japanese Mega Learning Pack/06.Dictionaries, Phrasebook |
| .lock | 1 | Dictionaries and Tools/yomichan server/yomichan_audio_server-master/Ca |
| .rc | 1 | Dictionaries and Tools/yomichan server/yomichan_audio_server-master/tr |
| .ipa | 1 | Resource Packs/Japanese Language Learning Pack - Learn Japanese!/07 Ja |
| .nfo | 1 | Resource Packs/Japanese Mega Learning Pack/04.Vocabulary, Expressions, |
| .hlp | 1 | Resource Packs/Japanese Mega Learning Pack/06.Dictionaries, Phrasebook |
| .lst | 1 | Resource Packs/Japanese Mega Learning Pack/06.Dictionaries, Phrasebook |
