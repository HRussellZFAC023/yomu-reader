---
title: FAQ
description: What Yomu is, what it costs, how reviews work, which languages and apps it supports, and where your data lives, in plain answers.
---

# Frequently asked questions

Plain answers, grouped by what you came here to find out. If yours is missing, [ask on Discord](https://discord.gg/jD6NPURewD) — real questions are how this page grows.

## What is Yomu?

A reader that turns the Japanese you already read into study.

- **Press a word, anywhere.** Web pages, YouTube subtitles, manga pictures, PDFs — one press gives the meaning, reading, pitch accent and recorded audio, with furigana above the kanji.
- **Keep the words you meet.** One more press saves the word with its sentence, audio and picture, ready to review. Reviews are built in.
- **It runs on your phone.** Android installs from the Firefox store; iPhone and iPad run it in Safari. Most tools like this are desktop-only.
- **It joins your tools instead of replacing them.** Anki, jpdb, Bunpro, WaniKani and jiten all connect: Yomu shows their word statuses on every page and sends your grades back.
- **Hundreds of dictionaries.** Install what you want from the built-in catalogue; installed dictionaries answer on your device.
- **Free, no account.** Everything above works without signing up for anything.

### How Yomu compares with Migaku and Duolingo

Against Migaku: Yomu is free, and that includes Anki export and mobile. Install is one click from the Chrome or Firefox store, with no account before your first lookup. On a phone it runs in the browser you already have. Add any Yomitan dictionary, keep your RTK keywords, or study vocabulary only. Subtitles draw over the site's own player, and switching Yomu off hands the page back untouched. Migaku import is in development.

Against Duolingo: you pick the words, straight from the shows and manga you were already going to watch and read. Review sentences are the ones you found each word in, so practice comes from Japanese you chose to read rather than a course script. There is no path and no energy meter. Study when you want, as much as you want. Mark a word known once and it stops turning up.

## Getting started

### Do I need an account?

No. Install Yomu, open a Japanese page and press a word — that is the whole setup. Connecting Anki, jpdb, Bunpro or WaniKani is optional and only for people who already use them.

### Is Yomu free?

Yes — free and [open source](https://github.com/HRussellZFAC023/yomu-reader). There is no paid tier and nothing is locked.

### I'm not technical. What's the easiest way to install it?

On Chrome, Edge or Brave: press **Add よむ to Chrome** on the [homepage](/). On Firefox, including Firefox on Android, use the Firefox store. On iPhone, iPad and Safari it takes a couple of minutes with a free helper app. [Week one](/learn/week-one) walks through it.

### Does it work on my phone?

Yes. On Android, install Firefox and add Yomu from its store. On iPhone and iPad, Yomu runs inside Safari — lookup, furigana, pitch accent, reviews and manga reading all work by touch. [Study](/study/) installs to your home screen from your browser's menu. Once it is there it opens like any other app and works offline, so reviews still work on the train.

### Do I need to know kana or grammar first?

You can press words before you know kana because Yomu shows furigana. Learn hiragana first anyway. It takes a few days and makes every later lookup easier. [Week one](/learn/week-one) gives you the order.

### I'm a complete beginner. Can Yomu teach me Japanese from zero?

That is where Yomu is heading. Today Yomu makes real pages readable from day one, with furigana on everything and meanings on press. **Academy**, a structured course that teaches Japanese from zero in order, is in development. Until it opens, the [learning path](/learn/) gives you an approach for real content.

### I installed it and nothing happens on a page.

Check that Yomu is allowed on that site — in your browser's extensions menu, or in your userscript manager — then refresh the page. That covers almost every report we get.

### Can I turn よむ off on one website?

Not from inside よむ yet. The よむ menu's **Pause annotations** applies to every site and every open tab, not only the page you are on. To keep よむ off on one site, change it in your userscript manager or your browser, then reload the page:

- **Tampermonkey:** open the Tampermonkey menu, choose Dashboard and click よむ. On its Settings tab, add the site to **User excludes** and press Save. A pattern like `*://example.com/*` covers every page of example.com.
- **Violentmonkey:** on that site, open the Violentmonkey menu, press the three dots next to よむ, choose **Exclude...** and press the site's name.
- **Safari on a Mac:** with the site open, go to Safari → Settings → Extensions and select よむ, or Userscripts if you installed よむ through it (that stops every userscript on the site). Press **Edit Websites...** and set the site to Deny.
- **Chrome, Edge and Brave** work the other way round: you list the sites where よむ may run. Open `chrome://extensions`, press Details under よむ and choose **On specific sites** for its site access, then add the sites you want.
- **Firefox** also works the other way round. In `about:addons`, open よむ and turn off **Access your data for all websites** on its Permissions tab, then allow the sites you want from the Extensions button (the puzzle piece).

On iPhone and iPad there is no per-site switch yet, so pausing from the よむ menu is the closest option.

## Reading

### Which sites does it work on?

Any page with Japanese text. On top of that, YouTube gets its own subtitle reader with the video, image-based manga readers work through picture reading, and there is a [PDF reader](/pdf-reader/) and a [video player](/video-player/) for your own files.

### How does it read manga and pictures?

Press a picture — or use the Scan images command — and Yomu recognises the Japanese text in it, so every recognised word becomes a word you can press. Recognition uses Google Lens by default, with no key or account; you can switch to your own Google Cloud Vision key, or to a fully local service, in Settings.

### Can it read my PC games?

Yes. [Yomu Gaming](/learn/manga-and-games#read-a-game-frame) is a small desktop app that reads the text on your screen, so the same press-a-word lookup works in any game.

### What do the colours and lines under words mean?

Word colours show how well you know them when a review system is connected, so a page shows you at a glance what is new and what is due. Underline colours can also show pitch-accent patterns. All of it can be turned off in Settings.

### How do I change the order of the popup?

Open Settings → Sources. The Popup order list at the top of that tab sets the order of the popup's sections. Move a row with its arrows or drag it, then press Save. Kanji sections have their own list further down the same tab, and the link pills at the top of the popup are ordered under Lookup pills.

Straight to that tab: <a href="/study/#settings=dictionaries" target="_self">yomureader.com/study/#settings=dictionaries</a>

## Keeping and reviewing words

### How do reviews work?

You grade yourself on the same five-point scale jpdb users know:

| | Grade | Meaning |
|---|---|---|
| ✘ | Nothing | You didn't know it at all. |
| ✘ | Something | You knew something, but couldn't recall it. |
| ✔ | Hard | You knew it, with a struggle. |
| ✔ | Okay | You knew it. |
| ✔ | Easy | You knew it instantly. |

Failed words come back in ten minutes. Known words come back on a growing schedule.

### What spaced-repetition algorithm does Yomu use?

A proven ease-based scheduler from the SM-2 family — the same lineage as Anki. First intervals are one, two or four days depending on your grade; each card keeps its own ease that grows when a word is easy for you and shrinks when it is not. There is no daily cap: review as few or as many as you like, and a pile of overdue cards is fine — do what you can and the schedule adapts.

### What do the card states mean?

| State | Meaning |
|---|---|
| New | Saved, never reviewed. |
| Learning | Reviewed, on short intervals. |
| Known | Reviewed enough that its interval is three weeks or longer. |
| Due | Its interval has lapsed — ready to review. |

### Do I need Anki?

No — Yomu's reviews are built in and need no setup. If you want Anki, Yomu sends complete cards to it — word, sentence, audio and picture each to the field you choose — through AnkiConnect.

### I already review on jpdb, Bunpro or WaniKani.

Keep doing that. Connect the account in Settings and Yomu becomes their front end: your existing word statuses colour every page you read, and grading a word in Yomu records the review on your system, not beside it.

### Can I review on two devices?

Yes. A free Yomu account pairs devices so local cards can follow you. Cards are encrypted before they leave the device. Reviews sent to Anki, jpdb, Bunpro or WaniKani also follow the account rules of that service.

## Languages

### Is it only for Japanese?

Yes. Yomu reads and teaches Japanese only, and there is no language to choose. It annotates and looks up Japanese words, including Japanese mixed with Latin letters such as GIの中でも. Words in English and other languages are left as they are.

The recommended dictionaries give English definitions. JMdict and KANJIDIC in several other definition languages can be installed from the Japanese section of the dictionary catalogue, and you can import any Yomitan dictionary. The interface itself speaks English or 日本語.

### I studied another language with an earlier version.

Yomu switches you to Japanese. Nothing is deleted: your saved words, cards, dictionaries and backups stay in storage, but Study lists only Japanese cards.

## Your data

### Where do my words and progress live?

In your browser, on your device. Connecting Anki, jpdb, Bunpro or WaniKani sends your grades to that service and nowhere else.

### What gets sent when I look things up?

The word you pressed goes to the dictionary sources you have enabled — and any dictionary you install from the catalogue answers on your device. Pictures are read only when you ask: pressing a picture or running Scan images sends that picture to the recognition service you chose, and nothing is read just because it is on the page.

## The project

### Something is broken. Where do I ask?

[Discord](https://discord.gg/jD6NPURewD) for questions, [GitHub issues](https://github.com/HRussellZFAC023/yomu-reader/issues) for bugs. Both are read by the person who builds Yomu.

### Can I use the dictionary mirror or the code in my own project?

The code is open source on [GitHub](https://github.com/HRussellZFAC023/yomu-reader). The mirrored dictionaries keep their original licences and attributions — each entry shows its source and licence in Settings, so check the one you want to reuse.

### Will Yomu stay free?

Yes. It is a tool its maker uses every day, and the core will stay free and open source. If it helps you, the best support is telling another learner about it.
