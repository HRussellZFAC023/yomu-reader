---
title: Features
description: Everything よむ does — popup dictionary lookup and mining, Yomitan dictionaries, audio and example sentences, kanji drilldown with stroke order, manga and image OCR, video subtitle mining, a YouTube immersion filter, Anki export, and a study page.
---

# Features

よむ runs one loop: find Japanese in the wild, understand it quickly, and save the useful bits for study.

## Popup Lookup And Mining

Choose Japanese text to open the popup; desktop hover/click and mobile touch/select are supported. It shows the reading and meaning right away, plus whatever you've turned on: Jiten, Bunpro, JPDB, and WaniKani definitions, imported dictionary entries, pitch and frequency, audio, example sentences, and kanji details. Mining buttons sit at the bottom.

With a WaniKani personal access token, matching vocabulary and kanji can also show the account's level and SRS stage, meanings and readings, mnemonics and hints, components and visually similar subjects, context sentences, pronunciation, review accuracy, and your own synonyms and notes. The token is stored with your other local settings and sent only to the official WaniKani API; requests never use Yomu's proxy.

Pitch decoration follows the available evidence: an exact whole-word accent takes priority, while a compound with no exact accent can show separate sourced underlines for fully aligned components. Partial component data stays undecorated rather than being combined into a guessed whole-word contour.

The reader built into yomureader.com is only a no-install fallback. When the よむ userscript or extension is installed, that copy stays in control and keeps using its own language, Jiten/JPDB keys, settings, and progress.

To let the official jpdb reader, Jiten Reader, or Yomitan own popups, turn off **Reader -> Show Yomu lookup popup** in Settings. よむ keeps annotations, media tools, mining, and study features without opening a second popup.

Keyboard shortcuts can move lookup to the previous or next parsed word, and if you have selected a piece of text, navigation stays inside that selection. Popup Japanese font family and weight are configurable, and the default stack matches jpdb.io for kanji, readings, example sentences, grammar snippets, and dictionary terms.

API mining actions can add a word, mark it Never Forget, blacklist it, or send review grades, and can be turned off while keeping popup lookup. When Anki is enabled, よむ can create a compact note with the word, reading, meaning, source sentence, source link, local dictionary content, optional context images, and Immersion Kit audio. The word-first Anki front can hide the reading, sentence, or image if you want a stricter prompt.

Furigana and word colors are separate controls. You can show furigana only for harder kanji, show all parsed readings, hide furigana for known words, color words by Jiten, JPDB, or Anki state, color them by pitch accent, or turn highlight coloring off.

Pitch stays attached to the vocabulary it actually describes. A word with an exact accent gets one whole-word underline; an aligned compound with only component accents keeps one clickable lookup target but shows separate component-colour segments. On a wide tablet sheet, multiple pitch graphs use the upper-right header space instead of consuming a full row.

The popup also has optional study helpers for the current sentence. The translation tool generates a plain sentence translation when you open that section, and the grammar tool highlights likely grammar patterns with short explanations and guide links.

<figure class="yomu-feature-shot">
  <img :src="'/screenshots/real-popup-lookup.png'" alt="A よむ popup on a Japanese Wikipedia article, showing Jiten/JPDB state, pitch, definitions, translation, grammar, and mining controls.">
  <figcaption>Popup lookup with live study data and mining controls.</figcaption>
</figure>

## Yomitan Dictionaries

よむ can import Yomitan dictionary ZIP files, Yomitan settings exports, and dictionary backups. Imported dictionaries stay local in your browser. If you do not have an API source or Anki connected, よむ can still use public lookup and local dictionary words for the study page after you download JMdict or import a Yomitan ZIP in Settings.

This gives you native-language dictionaries, monolingual Japanese definitions, frequency, kanji, or pitch dictionaries without depending on a remote service for every lookup.

Parsing itself is local-first: with term dictionaries imported, よむ segments and annotates Japanese against your local dictionaries — deinflection, furigana, and pitch included — without contacting Jiten or JPDB. New installs get this by default (onboarding offers to download Jitendex and Kanjium pitch accents), and **Settings → Sources → Parsing** switches between **Local dictionaries (offline)** and the Jiten/JPDB APIs. Installs from before this option keep API-first parsing until you switch.

<figure class="yomu-feature-shot">
  <img :src="'/screenshots/real-dictionaries.png'" alt="The よむ Dictionaries settings panel showing imported dictionary controls and definition source ordering.">
  <figcaption>Dictionary import and source ordering controls.</figcaption>
</figure>

## Audio And Examples

The speaker button tries your configured audio sources in order. The default setup uses public Japanese audio sources, Jiten and optional JPDB word audio, and browser text-to-speech as fallbacks. If you already use a Yomitan-style audio source, you can add it as a custom URL.

When Bunpro is connected, its definitions use the same compact example rows as Jiten and JPDB. よむ removes Bunpro's inline full-width kana brackets before display, then applies its own furigana and pitch annotations to the Japanese text. Bunpro's General, Anime, Novels, Netflix, and Dictionary ranks remain separately labelled because they describe different corpora. Bunpro pronunciation is also available in the audio-source list, disabled by default. Its recordings are fetched at runtime from Bunpro's public CDN; hosted/browser playback may use よむ's narrow public proxy.

Example sentences can come from Jiten/JPDB public example rows, Immersion Kit without an API key, or Nadeshiko when you add your own Nadeshiko key. You can also use Immersion Kit + Nadeshiko together; よむ blends the results in a stable order so the same word does not reshuffle every time you open it.

Every Immersion example card also links to public searches on Immersion Kit and Nadeshiko. These links work without API keys in popup lookup, Study, and enhanced jpdb/Jiten pages; Nadeshiko is also available as an opt-in lookup pill in Settings.

The same Immersion Kit section can live directly inside jpdb, Jiten, and Bunpro. On Bunpro it follows vocabulary and grammar details, the lesson carousel, and the lesson-quiz or review SRS loop. Question prompts stay untouched; the section mounts only with revealed answer information and updates for the next item.

Examples can show Japanese, translations, thumbnails, audio, and source filters. Settings let you choose categories, length limits, image visibility, translation visibility, playback speed, and one-time hover audio on desktop. To practice without seeing English immediately, turn on blurred example translations and reveal them only when you choose the translation.

<figure class="yomu-feature-shot">
  <img :src="'/screenshots/real-immersion-popover.png'" alt="A よむ popup scrolled to the Immersion Kit section after a live Japanese lookup.">
  <figcaption>Examples, translations, and audio stay inside the normal popup.</figcaption>
</figure>

## Kanji Drilldown

Click a kanji inside the popup headword to open a focused kanji panel. Depending on your settings and imported data, it can show Jiten and optional JPDB facts, WaniKani level/readings/mnemonics/components, stroke count, grade, JLPT level, RTK data, related words, Uchisen mnemonic illustrations and component groups, KanjiVG stroke tracing, and a small drawing pad.

At the top, keyword pills compare the primary Jiten or JPDB keyword with RTK, imported dictionaries, and an official Kanji Alive gloss. Matching text merges into one sourced pill; genuinely different glosses remain separate.

Kanji origin sources are modular and license-aware. You can turn off optional public sources independently.

<figure class="yomu-feature-shot">
  <img :src="'/screenshots/real-kanji-drilldown.png'" alt="A よむ kanji drilldown panel showing Jiten, JPDB, and RTK facts with a rendered KanjiVG stroke diagram.">
  <figcaption>Kanji drilldown with live KanjiVG stroke data.</figcaption>
</figure>

## Image And Manga OCR

OCR lets you look up Japanese text inside images. よむ can use embedded OCR metadata when a site provides it, or a local OCR app/server for MangaOCR, PaddleOCR, Apple Vision-style results, and compatible local JSON responses.

Recognized text stays lightweight: lookup targets sit over the image without covering it until you choose or hover a word.

Use this for manga panels, screenshots, and image-heavy pages where normal text selection does not work. The image is not sent anywhere unless you enable a local OCR endpoint, and that endpoint is the one you configure in settings.

For PC games, use the first-party [Yomu Gaming](/tools/yomu-gaming) app and download the release file from GitHub Releases.

<figure class="yomu-feature-shot">
  <img :src="'/media/manga-ocr-sample.png'" alt="A Japanese manga page with text regions detected for よむ OCR lookup.">
  <figcaption>OCR turns image text into lookup-ready reading targets.</figcaption>
</figure>

## Video Subtitle Mining

よむ can add an ASB-style subtitle overlay for video pages. Japanese subtitles can be parsed into lookup-ready words, native-language subtitle tracks can be shown as a secondary line, and the subtitle drawer can sit left, right, or below the video with tabs for transcript rows, shadowing practice, and track selection.

The transcript works like the overlay: visible Japanese lines are parsed for lookup, so you can skim, jump to a line, and open the popup from the transcript. The Shadow tab focuses on the current subtitle line with replay, loop, and hide/reveal controls for speaking practice while keeping parsed Japanese and the optional secondary line available.

The Batch Mine tab scans the loaded transcript against your current study states, ranks i+1 lines first, deduplicates repeated words, and preselects useful not-in-deck candidates. Review the list at the end of the episode, add the selected words to Jiten, JPDB, or Anki, grade words directly in the sidebar, batch-assign a review grade to the current selection, or copy the batch as TSV if you want to curate it elsewhere.

For local files, open the [Yomu video player](/video-player/index.html), drop in a browser-supported video, and use the Subtitles button to add Japanese or native subtitle files. The page creates normal browser video and text tracks, so the same overlay and transcript tools work without a desktop bridge.

You can use shortcuts for previous subtitle, next subtitle, copy subtitle, and mining. The left-aligned subtitle rail can be moved if it covers a player control and pinned open or left to collapse; playback stays in the video's own controls. Transparent space around the text is click-through, so native mobile controls such as fullscreen remain tappable while individual parsed words still open lookup. The transcript panel is off by default, opens from the subtitle controls, and can also be set to open only while the video is paused. On phones it becomes a bottom panel so the video stays usable. Auto-follow pauses only after you directly scroll it, and **Locate** always returns to the active line.

<figure class="yomu-feature-shot">
  <img :src="'/screenshots/store-02-youtube-subtitles.png'" alt="The よむ subtitle overlay and transcript panel open on a live Comprehensible Japanese YouTube video.">
  <figcaption>Subtitle overlay and transcript controls on a live Comprehensible Japanese video.</figcaption>
</figure>

## YouTube Immersion Filter

The YouTube filter is on by default so recommendations stay focused on Japanese. When a video id is available, よむ checks the original title via oEmbed, keeps Japanese-learning and comprehensible-input titles even when written in English, and hides non-Japanese-looking cards across recommendations, search results, and sidebars. Playback, subtitles, and よむ controls keep working.

YouTube page text uses the same generic scanner and open web-component boundaries as Reddit and other dynamic sites, including nested components that start empty, hydrate later, upgrade after page load, or attach an open root in a later task. Late comments, menus, navigation labels, and controls wake the same bounded annotation path; Subscribe, Join, tabs, filter chips, and disclosure buttons stay lookupable and keep their native centring and height. Detached furigana remains visible wherever its measured lane is unclipped and clear of nearby text; if a reading would overlap or escape a page-owned clip, only that reading is hidden while the word, pitch, and vocabulary-status annotation remain. Kana-only labels keep pitch and status paint without adding a duplicate reading.

On Reddit in iPad Safari, Yomu-owned popovers, sheets, settings, notices, and the puck menu compensate Safari's per-site full-page view scale. Their text, touch targets, anchors, and screen-edge placement stay at the intended physical size without resizing Reddit content. Inline readings, subtitles, and OCR remain in the page's coordinate space so they stay aligned; normal-scale Reddit, other browsers, and other sites are left unchanged.

On yomureader.com itself, translated navigation and documentation copy are interface text rather than reading material. よむ annotates only the site's declared demos and reading surfaces, avoiding a whole-site scan when Japanese interface mode is active.

The temporary notice shows how many cards were hidden and disappears after a few seconds. Use **Show hidden videos** to reveal them, **Hide hidden videos** to filter them again, **Hide notice** to stop showing that notice while keeping the filter enabled, or the YouTube filter shortcut (`Shift+Y` by default, configurable in Settings → Shortcuts) to toggle the filter itself.

The separate **Prefer Japanese site language and location** setting asks multilingual pages for their Japanese version by combining browser-language hints, Japan locale/location hints, Japanese preference cookies, `hreflang` alternates, existing locale query hints such as `locale=en-US`, and common URL patterns such as `en.example.com` or `/en`. The よむ puck includes the same toggle so you can turn that request on or off from the page; when よむ knows the original English/default URL, turning it off returns there.

On the YouTube home feed, when よむ hides enough English-heavy recommendations, it can also offer a dismissible starter guide of Japanese YouTube channels. Use **Later** to hide it for the current page, **Never show** to turn it off, or **Show all** to browse the full 100-channel list with direct subscribe links.

<figure class="yomu-feature-shot">
  <img :src="'/screenshots/real-youtube-search-results.png'" alt="A real YouTube results page where よむ keeps beginner Japanese comprehensible-input videos and Shorts visible.">
  <figcaption>Search results stay usable for beginner Japanese comprehensible input, including English-titled videos and Shorts.</figcaption>
</figure>

<figure class="yomu-feature-shot">
  <img :src="'/screenshots/real-youtube-filter.png'" alt="A real YouTube page with よむ hiding non-Japanese-looking recommendation cards and showing the filter notice.">
  <figcaption>Filtered YouTube recommendations with temporary reveal and notice controls visible.</figcaption>
</figure>

## Anki And Mobile Handoff

Anki support is optional. With [AnkiConnect](https://ankiweb.net/shared/info/2055492159) reachable, よむ can create cards from popup lookups, subtitles, and OCR; detect existing cards; update matching notes; adapt to existing decks and note types; and power Anki-backed review/status features on the Study page.

On a phone or tablet, the full Anki setup still uses desktop AnkiConnect: the phone does the reading, the computer does the Anki work. See the step-by-step phone, iPad, or Android setup in [Getting Started](/getting-started#use-desktop-anki-from-a-phone-ipad-or-android).

Mobile handoff is deliberately narrower. On iPhone, iPad, and Android, よむ can open AnkiMobile or AnkiDroid when AnkiConnect is not available, but that path creates new-note drafts only. Existing-card status, note updates, automatic deck scans, media writes, full field mappings, and review queues still need desktop AnkiConnect.

If you already use RTK, Core, anime-card, or other nonstandard Japanese decks, keep desktop AnkiConnect reachable. よむ inspects existing Anki shapes automatically, suggests field mappings for expression, reading, meaning, sentence, audio, and image fields, and mines into that shape when it can infer a fit. If matching is not enough, the cleanest route is to use the よむ note type or adjust mappings before mining.

If you do not use Anki, leave it off. Jiten or JPDB mining and local dictionary lookup still work without it.

## Study Page

Open the [Study page](/study/) whenever you want a focused Japanese review session. The browser extension leaves your new tabs alone and puts **Open Study** in its toolbar menu; the hosted page can also be bookmarked, added to a Home Screen, or deliberately chosen as a home page. Study pulls words from whatever you've connected — Anki, Jiten, Bunpro, JPDB, WaniKani, or the local dictionary words already in your browser — so it works even with no account. A fresh standalone session begins at **Word**, then follows the rest of your configured steps. Bunpro's regular reveal reviews use Hard/Good and its FSRS reviews use Again/Hard/Good/Easy; Jiten and JPDB retain the five-point scale. WaniKani cards come only from assignments currently due on the account: Okay, Good, and Easy submit a clean answer, while anything below Okay records one incorrect meaning attempt and, except for radicals, one incorrect reading attempt. WaniKani writes are live-only and are never replayed later from the offline queue. The old `/newtab/` URL remains a compatibility route.

Each card walks through a short set of steps, and you only grade once at the end:

- **Draw the kanji** from memory on a small tracing pad, one character at a time.
- **Read the word** in a real example sentence.
- **Fill the blank** — the sentence appears with the word removed, and you type the Japanese back in. Stuck? Tap **Hint** for a nudge (a starting kana, the length, the meaning) without giving the answer away.
- **Hear the pitch** — よむ plays the word and you pick its pitch shape from labelled contour buttons.
- **Say it aloud** — record yourself and よむ scores your pitch against the model, right on your device.
- **Check and grade** — the full answer and details appear, then you rate how it went.

Steps only show up when they fit the card, so a kana-only word skips the kanji drawing and a word with no classifiable pitch skips the listen and speak steps. Exact pitch can resolve from local dictionaries, Jiten, or public JPDB — including one-mora entries such as 自（じ） — and adds those steps automatically. The pitch practice keeps its own lightweight review schedule that grows from the words already feeding the page.

On the hosted page, the installed よむ userscript can bridge local AnkiConnect requests on the same computer. For phone and tablet setup, follow the Tailscale steps in [Getting Started](/getting-started#use-desktop-anki-from-a-phone-ipad-or-android) instead of pointing mobile よむ at `localhost`.

On iPhone, iPad, and Android, the study page works well for quick daily review. Full Anki status on mobile still needs desktop AnkiConnect reachable over LAN or Tailscale; the [setup guide](/getting-started#use-desktop-anki-from-a-phone-ipad-or-android) covers the steps.

<figure class="yomu-feature-shot">
  <img :src="'/screenshots/real-newtab.png'" alt="The よむ study page on the Recall step, with an example sentence and the target word blanked out for you to type back in.">
  <figcaption>Every card is one short run of steps — here, filling the blank in a real sentence.</figcaption>
</figure>

<figure class="yomu-feature-shot">
  <img :src="'/screenshots/study-pitch-select.png'" alt="The よむ study page on the Listen step, asking which pitch shape you heard with labelled contour buttons.">
  <figcaption>Pitch practice: hear the word, then pick its shape.</figcaption>
</figure>

## Help And Support In Settings

The Help tab includes quick links to the hosted tools and docs, GitHub issues, Discord, donation support, and a Factory Reset action that clears よむ settings, API keys, cached data, and imported dictionaries back to defaults.

<figure class="yomu-feature-shot">
  <img :src="'/screenshots/real-help-settings.png'" alt="The よむ Help settings tab with donation, issue reporting, GitHub, Discord, docs, video player, and Study links.">
  <figcaption>Support links live inside settings.</figcaption>
</figure>
