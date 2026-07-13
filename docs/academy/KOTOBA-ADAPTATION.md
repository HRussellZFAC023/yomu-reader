# Kotoba adaptation audit

## Scope and provenance

This audit covers the learner-facing mechanics in `mistval/kotoba` at pinned commit
`08064bc387d6b56647f1fea89e8cfbfe3c94ec9a`. Kotoba code is MIT-licensed
(`references/kotoba-upstream/LICENSE`). Its bundled decks, dictionary responses, user uploads,
audio, images, and other third-party content are not automatically covered by that licence.
Academy reuses mechanisms and interaction ideas only. It does not copy Kotoba decks, media,
reports, user data, Discord identities, or live services. Academy activities may bind only to
Yomu-cleared source-ledger content.

Runtime mappings are declared in
`public/academy/content/practice-modes.v1.json`; its validator refuses an incomplete set. Every
entry is currently `engine-only`: its state transition or Adapter contract is executable and
tested, but this slice does not claim that a UI or authored content makes it playable.

All mapped assessed modes share `academy-assessed-v1`: English UI does not reveal assessed Japanese
answers, transcripts, translations, definitions, example glosses, or model answers before learner
commitment. Pre-answer controls are neutral. Support is post-commit unless an explicit post-attempt
hint has been earned. Animated/GIF character reactions are presentation evidence only and never
learning or achievement evidence.

## Exhaustive learner-mechanic mapping

| Kotoba mechanic | Exact upstream locus | Academy mapping | Usefulness decision |
| --- | --- | --- | --- |
| Normal quiz | `api/quiz/common/normal_mode.js:1-31`; `api/quiz/common/session.js:1-296` | `normal-challenge` | Adapt. One honest retrieval before feedback; no detached score race. |
| Conquest/mastery repetition | `api/quiz/common/mastery_mode.js:6-66`; `kotobaweb/src/bot/manual_sections.jsx:52-55` | `mastery-conquest` | Adapt. A lapse is spaced behind other items until two later independent passes; threshold language never claims mastery. |
| Inferno shrinking timer | `api/quiz/common/conquest_mode.js:6-82` (the serialization identifier is `CONQUEST`, while the visible title says Inferno) | `inferno-pressure` | Adapt cautiously. Explicit opt-in, never recommended, visible timing, untimed escape, timeout becomes repair evidence. |
| Review/review-me | `api/quiz/common/review_mode.js:1-20`; `kotobaweb/src/bot/manual_sections.jsx:32-35` | `repair-review` | Adapt. Preserve the lapse, add contrastive feedback, and record later repair separately. |
| Deck mixing and percentages | `kotobaweb/src/bot/manual_sections.jsx:37-44`; `api/quiz/common/deck_collection.js:119-141` | `mixed-range` | Adapt as weighted, deterministic interleaving with injected randomness. |
| Question ranges | `kotobaweb/src/bot/manual_sections.jsx:97-100`; `api/quiz/common/deck_collection.js:12-25` | deck selection in `mixed-range` | Adapt. A range is visible and bounded; source completion reports only the selected range. |
| Shuffle/no-shuffle | `kotobaweb/src/bot/manual_sections.jsx:107-110`; `api/quiz/util/shuffle_array.js:1-10` | injected random planner | Adapt. Tests can reproduce order; ordered study remains available. |
| Save/load and restore | `kotobaweb/src/bot/manual_sections.jsx:47-50`; `api/quiz/common/pause_manager.js:7-141`; `api/quiz/common/deck_collection.js:56-70,275-284` | versioned `PracticeSessionState` snapshots | Adapt. Save contains queue, attempts, repair state, mode and timer; it does not duplicate learner evidence. |
| Skip | `kotobaweb/src/bot/manual_sections.jsx:57-60`; `bot/src/discord_commands/quiz.js` skip handling | `skipPracticeItem` | Adapt. Skip is a lapse and opens feedback; it is not shame or a lost life. |
| Discard in conquest | `kotobaweb/src/bot/manual_sections.jsx:57-60` | deliberately omitted from mastery | Reject as a default learning action because silently removing a difficulty can hide repair. Learners can edit a personal deck or close the session. |
| Pacing presets and answer timer | `kotobaweb/src/bot/manual_sections.jsx:62-90`; `common/quiz_time_modifier_presets.js:1-31` | learner-controlled normal pacing; optional Inferno | Adapt the control, not the Discord delays. Explanations wait for the learner. |
| Score/question/missed limits | `kotobaweb/src/bot/manual_sections.jsx:27-30,87-90`; `common/quiz_limits.js`; `common/quiz_defaults.js` | day goal, selected item cap, optional close | Replace points and failure cut-offs with a transparent learning scope. |
| Multiple choice | `kotobaweb/src/bot/manual_sections.jsx:112-115`; `api/quiz/common/deck_collection.js:232-270` | activity response kind | Retain when discrimination is the intended outcome; require production when production is the outcome. Distractors come from cleared authored content. |
| Hardcore/one chance | `kotobaweb/src/bot/manual_sections.jsx:117-120` | one submitted attempt per reveal | Adapt without the label or punishment. A learner can still request a hint before submitting. |
| No-race/spoiler answers | `kotobaweb/src/bot/manual_sections.jsx:122-130` | self-paced private responses | Keep the pedagogical property. Competition and Discord syntax are unnecessary. |
| Quiz command builder and aliases | `kotobaweb/src/bot/quiz_builder.jsx`; `bot/src/common/quiz/arg_parser.js:1-69`; tests at `arg_parser_tests.js:1-123` | structured practice-plan/deck controls and saved snapshots | Adapt as direct controls; do not make learners author command strings. |
| Learner-built decks | `common/deck_validation.js:75-147,150-236,248-329`; `kotobaweb/src/dashboard/custom_deck/index.jsx` | `learner-deck` using canonical encountered vocabulary and source-ledger items | Adapt. Validate bounds/provenance, dedupe, support undo, and never publish by default. No upstream uploads are imported. |
| Session reports and copy-to-deck | `bot/src/common/quiz/session_report_manager.js:31-191`; `kotobaweb/src/dashboard/reports/index.jsx:340-420` | `buildPracticeReport` plus canonical collection Adapter | Adapt. Report attempts/lapses/repairs by item; do not collapse learning into points. |
| Listening decks/no-race listening | `api/quiz/common/deck_collection.js:73-75,168-224`; `kotobaweb/src/bot/manual_sections.jsx:122-125` | `listening` and shared Study listening steps | Adapt. Audio-first prompt, learner replay, captions/transcript after attempt, and repair audio. |
| Shiritori | `kotobaweb/src/shiritori/game.jsx:23-39,194-238,255-270`; `node-common/shiritori/japanese_game_strategy.js:16-96,130-210`; long-vowel/dakuten tables in `node-common/hiragana_lengtheners.js` and `node-common/dakuten_variants.js` | `playShiritoriTurn` | Adapt. It checks known word, repeated reading, noun status, required mora and final ん; small kana, long-vowel and optional dakuten variants match the mechanism; rejection explains the language rule. Multiplayer transport is not copied. |
| Kanji image game | `kotobaweb/src/kanjigame/game.jsx:193-200,236-250`; deck labels in `kotobaweb/src/kanjigame/decks.js:1-52` | `kanji-stroke-play` | Adapt with Yomu KanjiVG/Doodle. Recognition and handwriting emit different evidence. No Kotoba deck/image data is copied. |
| Stroke-order lookup | `kotobaweb/src/strokeorder/strokeorder.jsx:1-108`; `bot/src/discord_commands/strokeorder.js:7-55` | `kanji-stroke-play` and `KanjiWritingService` | Adapt as a reference plus production attempt, not a passive achievement. Existing KanjiVG attribution remains authoritative. |
| Word dictionary lookup | `bot/src/discord_commands/jisho_word_search.js:7-75` | `dictionary-discovery` and Yomu `DictionaryService` | Adapt. Return to original context; lookup alone is exploration, never competence. |
| Kanji lookup | `bot/src/discord_commands/jisho_kanji_search.js:7-56` | `kanji-discovery` | Adapt. One reading/meaning retrieval or stroke action follows inspection. |
| Example search | `bot/src/discord_commands/jisho_examples.js:7-44`; `bot/src/discord/create_example_search_pages.js` | `example-discovery` and `ImmersionExampleService` | Adapt. Prefer source-local example, then one contrastive cleared immersion example. |
| Pronunciation and audio sources | `bot/src/discord_commands/pronounce.js:145-228,252-303` | `pronunciation` and Yomu pronunciation/pitch/audio Interfaces | Adapt. Listen, shadow, record and self-compare. Do not infer speaking mastery from microphone activity. Upstream Forvo links/audio are not copied. |
| Random word by JLPT/Kanken | `bot/src/discord_commands/random.js:4-94` | `random-discovery` | Adapt as level-bounded curiosity. Skip is free; only later retrieval affects competence projections. |
| Quick dictionary/example/kanji reactions after a quiz | `bot/src/bot_settings.js:169-173`; quiz result interaction in `bot/src/discord_commands/quiz.js` | feedback-to-dictionary/example/kanji bridge | Adapt behind the existing Yomu bridge, placed beside the relevant feedback rather than as global reaction buttons. |
| Furigana | `bot/src/discord_commands/furigana.js`; Kotoba manual command surfaces | Yomu annotation Adapter | Retain as support, not a separate Academy mode or evidence event. |
| Translation/thesaurus/deconjugation/anime search | command inventory in `kotobaweb/src/bot/commands.js` and `bot/src/discord_commands/` | Yomu dictionary/grammar/immersion support | Supporting tools only. They become a learning activity only when authored with an action, feedback and evidence. |
| Multiplayer rooms, usernames, chat, leaderboards | `kotobaweb/src/game_common/`; socket flows in `api/quiz/start.js` and `api/shiritori/socket_server.js` | optional future class activity through privacy-safe contracts | Do not port transport, Discord identity, public point races, avatars or chat. Class Board publishes only opted-in aggregates under Academy display name plus six-digit discriminator. |

## Non-learner surfaces explicitly excluded

Discord installation/help, server settings, moderation, blacklist/ban, broadcast, eval, shutdown,
reload, server statistics, permissions, OAuth, admin deck moderation, scheduled bot maintenance,
API operations, benchmarks, backup/restore operations, and internal error reporting are not Academy
learner modes. Font/color drawing is a settings preview, not learning evidence. Jukebox is ambience,
not a lesson. Kotoba's score/leaderboard persistence is not reused.

## Content and asset controls

- Cleared Soya-derived content may bind to lesson retrieval, listening, repair, checkpoint,
  transfer, and exam-season journeys. A candidate must be `cleared` and must not have
  `secure-assessment` exposure. Published practice/checkpoint forms may be used; secure full-mock
  forms remain inside assessment delivery and cannot leak into mode planning.
- No Soya volume is ingested by this slice. A subsequent content integration must map source-ledger
  IDs to the registry's journey/exposure contract and validate each item's rights and answer-key
  exposure.
- The CC0 Buch/OpenGameArt medal pack is recorded only as a possible visual reference. It is not a
  shipped dependency. This slice emits semantic medal IDs and bronze/silver/gold/platinum tokens;
  original living-paper medals are a later visual-system task.
