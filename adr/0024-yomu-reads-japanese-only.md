# Yomu reads Japanese only

Status: implemented locally, 7 October 2026 (product owner's decision). Supersedes the multi-target parts of ADR-0008.

## Context

Since the multilingual roster shipped, Yomu offered 33 learning targets, asked every fresh install to choose one, and kept Reader work inert until it was chosen. The owner's decision of 7 October 2026: "Remove all the studiable languages to just Japanese"; learners "don't need so much customisation".

The bugs that prompted it all came from the target choice:

- A learner whose stored target was Spanish got popups for English words on a Microsoft sign-in page.
- Learners on a work laptop and on iPhone Safari saw "Finish setup in Study" on every page, and Yomu never worked for them. Closing the prompt saved nothing, and setup did not persist through the hosted Study bridge.

## Decision

1. Japanese is the one learning target, in the userscript, the extension, hosted and packaged Study, and Yomu Gaming. No surface offers a learning-target choice: there is no picker in Settings, Study or Gaming, no Language profile section and no readiness labels.
2. Nothing gates Reader work on setup. There is no welcome or onboarding dialog and no "Finish setup in Study" prompt; a fresh install works on any page with Japanese defaults, Study opens straight to Study and Gaming captures straight away. Settings are optional.
3. Only Japanese text is parsed, painted and looked up. The page scanner, hover, tap and click lookup, OCR, subtitles and popups never annotate or open a lookup for Latin, Cyrillic, Hangul, Arabic or digit runs. Japanese that mixes in Latin (GIの中でも, ＪＲＡの馬) keeps its Japanese words; full-width Latin and numbers inside Japanese stay unlooked-up, as before.
4. The definition-language choice and automatic definition translation are removed. Recommendations are the English-definition Japanese set, such as JMdict English. JMdict and KANJIDIC in other definition languages stay installable from the catalogue's Japanese section, any Yomitan dictionary can still be imported, and the in-app catalogue lists only Japanese-headword dictionaries. The published catalogue file is unchanged. The interface language stays Automatic, English or 日本語.
5. Stored data is never rewritten. A learner whose stored target was another language is switched to Japanese on load, but stored profile targets are kept verbatim. Saved words, SRS cards, dictionaries and backups stay in storage; Study lists Japanese cards only, and non-Japanese cards stay stored but unlisted.
6. Removed with the other targets: the 32 roster targets other than Japanese, Korean lookup, the other targets' grammars (CEFR, HSK and Foundation rules), the IPA pronunciation row (Japanese keeps pitch accent), Han maximal matching, per-target dictionary recommendations and offline starter bundles, the 33-target capability audit (`quality:multilingual-capabilities`) and the multilingual onboarding catalogues.

## Consequences

- The `LearningTargetModule` seam remains with one implementation, the Japanese Adapter. It can be inlined later; until then the dictionary protocol still carries a target, always Japanese.
- The Website-only Store adoption rule (ADR-0017 §4) changes: an installed Reader adopts it only while it holds no learner choice, meaning no settings, no recorded settings intent, or the explicit `learningTargetChosen: false` that builds before 2.1 wrote. The rest of the rule is unchanged. The installed Reader's HTTP responder no longer waits for a target (ADR-0017 §2).
- 2.1 no longer writes the `learningTargetChosen` flag. Downgrading to 2.0.x reads stored settings without it as an already-set-up install.
- ADR-0008's grammar seam stays for Japanese: the Japanese Adapter owns its JLPT scale, 307-rule inventory and detector. Its multi-target parts (CEFR and Foundation levels, per-target rule inventories) are superseded.
- The multilingual lookup parity ratchet (`npm run quality:multilingual-parity`) covers the Japanese target only, with the same corpus row and JMdict English pin. It keeps its name for now.
- Learners of other languages lose Yomu's support for them. Their data stays in storage.
