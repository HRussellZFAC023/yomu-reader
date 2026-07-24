<!-- Owner: multilingual-coordinator -->

# Multilingual subtask plan

Every locale owner starts from the shared facts and English source keys, edits only the named file, and returns evidence to the coordinator.

| Subtask                                            | Owner                    | Output                                                              | Depends on                                |
| -------------------------------------------------- | ------------------------ | ------------------------------------------------------------------- | ----------------------------------------- |
| Roster, source keys, validators, decisions, ledger | multilingual-coordinator | `src/reader/locales/`, `config/multilingual/`, `docs/multilingual/` | Accepted Slice 1 plan                     |
| Albanian locale                                    | locale-sq                | `src/reader/locales/catalogs/sq.ts`                                 | Shared source keys                        |
| Ancient Greek locale                               | locale-grc               | `src/reader/locales/catalogs/grc.ts`                                | Shared source keys; specialist review     |
| Arabic locale                                      | locale-ar                | `src/reader/locales/catalogs/ar.ts`                                 | Shared source keys; RTL QA                |
| Cantonese locale                                   | locale-yue               | `src/reader/locales/catalogs/yue.ts`                                | Shared source keys; Hant QA               |
| Chinese locale                                     | locale-zh                | `src/reader/locales/catalogs/zh.ts`                                 | Shared source keys; Hans default          |
| Danish locale                                      | locale-da                | `src/reader/locales/catalogs/da.ts`                                 | Shared source keys                        |
| Dutch locale                                       | locale-nl                | `src/reader/locales/catalogs/nl.ts`                                 | Shared source keys                        |
| English source locale                              | locale-en                | `src/reader/locales/catalogs/en.ts`                                 | Product copy approval                     |
| Finnish locale                                     | locale-fi                | `src/reader/locales/catalogs/fi.ts`                                 | Shared source keys                        |
| French locale                                      | locale-fr                | `src/reader/locales/catalogs/fr.ts`                                 | Shared source keys                        |
| German locale                                      | locale-de                | `src/reader/locales/catalogs/de.ts`                                 | Shared source keys                        |
| Greek locale                                       | locale-el                | `src/reader/locales/catalogs/el.ts`                                 | Shared source keys                        |
| Hungarian locale                                   | locale-hu                | `src/reader/locales/catalogs/hu.ts`                                 | Shared source keys                        |
| Indonesian locale                                  | locale-id                | `src/reader/locales/catalogs/id.ts`                                 | Shared source keys                        |
| Italian locale                                     | locale-it                | `src/reader/locales/catalogs/it.ts`                                 | Shared source keys                        |
| Khmer locale                                       | locale-km                | `src/reader/locales/catalogs/km.ts`                                 | Shared source keys; script QA             |
| Korean locale                                      | locale-ko                | `src/reader/locales/catalogs/ko.ts`                                 | Shared source keys; founding-user journey |
| Lao locale                                         | locale-lo                | `src/reader/locales/catalogs/lo.ts`                                 | Shared source keys; script QA             |
| Latin locale                                       | locale-la                | `src/reader/locales/catalogs/la.ts`                                 | Shared source keys; specialist review     |
| Mongolian locale                                   | locale-mn                | `src/reader/locales/catalogs/mn.ts`                                 | Shared source keys; Cyrl default          |
| Persian locale                                     | locale-fa                | `src/reader/locales/catalogs/fa.ts`                                 | Shared source keys; RTL QA                |
| Polish locale                                      | locale-pl                | `src/reader/locales/catalogs/pl.ts`                                 | Shared source keys                        |
| Portuguese locale                                  | locale-pt                | `src/reader/locales/catalogs/pt.ts`                                 | Shared source keys                        |
| Romanian locale                                    | locale-ro                | `src/reader/locales/catalogs/ro.ts`                                 | Shared source keys                        |
| Russian locale                                     | locale-ru                | `src/reader/locales/catalogs/ru.ts`                                 | Shared source keys                        |
| Serbo-Croatian locale                              | locale-sh                | `src/reader/locales/catalogs/sh.ts`                                 | Shared source keys; alias/script review   |
| Spanish locale                                     | locale-es                | `src/reader/locales/catalogs/es.ts`                                 | Shared source keys                        |
| Swedish locale                                     | locale-sv                | `src/reader/locales/catalogs/sv.ts`                                 | Shared source keys                        |
| Tagalog locale                                     | locale-tl                | `src/reader/locales/catalogs/tl.ts`                                 | Shared source keys; alias review          |
| Thai locale                                        | locale-th                | `src/reader/locales/catalogs/th.ts`                                 | Shared source keys; script QA             |
| Turkish locale                                     | locale-tr                | `src/reader/locales/catalogs/tr.ts`                                 | Shared source keys                        |
| Vietnamese locale                                  | locale-vi                | `src/reader/locales/catalogs/vi.ts`                                 | Shared source keys                        |
| Shared integration                                 | multilingual-coordinator | Existing app/settings/docs surfaces                                 | All keys extracted; catalogues reviewed   |
| Cross-locale adversarial review                    | multilingual-reviewer    | Findings by locale and corrected owner files                        | Integrated test build                     |
| 32/32 release proof                                | release-coordinator      | Completed closure ledger and live evidence                          | All gates green                           |
