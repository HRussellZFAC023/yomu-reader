# Yomu Academy source-ledger coverage

Generated from `source-ledger.summary.json`. The ledger is the private source-of-truth inventory of every Japanese-learning asset discovered on this machine.

## Totals

| Measure | Value |
| --- | --- |
| Total records | 14311 |
| File assets (hashed) | 14310 |
| Unique payloads (sha256) | 14123 |
| Duplicate occurrences | 330 |
| Moodle-matched assets | 118 |
| Pairing links | 73 |
| Revision markers (New_) | 26 |
| Aggregate datasets | 1 |

## By curricular class

| Key | Count |
| --- | --- |
| yes | 12971 |
| no | 863 |
| derivative | 423 |
| tool | 53 |

> `yes` = real learning material · `tool` = dictionaries/userscripts/config · `no` = non-JP craft/art demo · `derivative` = already-digitised Yomu output.

## By source root

| Key | Count |
| --- | --- |
| japanese-library | 6911 |
| academy-references | 6908 |
| academy-public | 443 |
| soya-research | 32 |
| class-photos | 16 |

## By dataset group

| Key | Count |
| --- | --- |
| rtk-kanji-site | 6075 |
| language-learning-pack | 3539 |
| genki-study-site | 1849 |
| mega-pack | 1373 |
| ui-demos | 531 |
| yomu-production | 443 |
| japlan-travel | 296 |
| class-lessons | 118 |
| soya-listening-capture | 32 |
| art-reference | 16 |
| dictionaries-tools | 15 |
| immersion-subtitles | 14 |
| jp-userscripts | 6 |
| user-vocab | 2 |
| reference-textbooks | 1 |

## By asset kind

| Key | Count |
| --- | --- |
| document-web | 4035 |
| audio | 3908 |
| document | 3252 |
| image | 2104 |
| pdf | 510 |
| anki-deck | 137 |
| video | 102 |
| data | 96 |
| spreadsheet | 62 |
| ebook | 36 |
| archive | 20 |
| study-game-deck | 18 |
| subtitle | 14 |
| interactive | 9 |
| disc-image | 5 |
| dictionary-db | 2 |

## By worksheet family

| Key | Count |
| --- | --- |
| handout | 7611 |
| audio-track | 3908 |
| image | 2098 |
| anki-deck | 137 |
| video | 102 |
| dictionary-or-data | 96 |
| spreadsheet | 62 |
| grammar-exercise | 43 |
| textbook | 36 |
| answer-key | 30 |
| listening-worksheet | 25 |
| vocabulary-sheet | 24 |
| reading-worksheet | 21 |
| archive | 20 |
| vocab-game-deck | 18 |
| workbook | 17 |
| transcript | 15 |
| subtitle | 14 |
| interactive-lesson | 9 |
| speaking-exercise | 6 |
| grammar-homework | 5 |
| disc-image | 5 |
| reading-homework | 3 |
| info-gap | 2 |
| dictionary | 2 |
| word-card | 1 |

## By rights class

| Key | Count |
| --- | --- |
| open-source-kanji-reference | 6075 |
| third-party-redistributed-collection | 4912 |
| open-source-study-site | 1849 |
| internal-craft-reference | 827 |
| yomu-original-production | 423 |
| personal-class-material | 118 |
| third-party-scraped-web-reference | 32 |
| third-party-licensed-asset | 20 |
| internal-art-reference | 16 |
| third-party-dictionary-tool | 15 |
| third-party-subtitle-immersion | 14 |
| third-party-open-source-tool | 6 |
| personal-user-notes | 2 |
| third-party-textbook | 1 |

## By extraction status

| Key | Count |
| --- | --- |
| source-only | 6926 |
| reference-only | 6924 |
| already-digitised | 443 |
| catalogued | 17 |

## By curriculum confidence

| Key | Count |
| --- | --- |
| none | 8834 |
| low | 4423 |
| medium | 938 |
| high | 115 |

## By textbook

| Key | Count |
| --- | --- |
| (none) | 9751 |
| Genki | 2326 |
| Tobira | 2060 |
| Minna no Nihongo Shokyu II | 117 |
| Minna no Nihongo | 55 |
| Tae Kim | 1 |

## Moodle catalog reconciliation

| Measure | Value |
| --- | --- |
| Catalog payloads (unique) | 688 |
| Catalog payloads unrecovered on disk | 621 |
| Catalog archives | 96 |
| Disk payloads matching catalog | 67 |

> Reconciliation is by sha256 only; the metadata-only Moodle catalog withholds names/paths. Unrecovered payloads exist as classroom occurrences in the corpus but have no byte-identical file in the scanned roots.

## Scan provenance

Scanned 5 roots; 11840 non-content files skipped (code, icon libraries, fonts, compiler intermediates); 0 read errors.
