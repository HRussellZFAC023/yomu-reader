---
title: FAQ
description: What Yomu is, what it costs, how reviews work, which languages and apps it supports, and where your data lives, in plain answers.
---

# Frequently asked questions

Plain answers, grouped by what you came here to find out. If yours is missing, [ask on Discord](https://discord.gg/jD6NPURewD) — real questions are how this page grows.

## What is Yomu?

A reader that turns what you already read into language study.

- **Press a word, anywhere.** Web pages, YouTube subtitles, manga pictures, PDFs — one press gives the meaning and the target-appropriate reading or pronunciation. Japanese additionally provides furigana, pitch accent and recorded audio.
- **Keep the words you meet.** One more press saves the word with its sentence, audio and picture, ready to review. Reviews are built in.
- **It runs on your phone.** Android installs from the Firefox store; iPhone and iPad run it in Safari. Most tools like this are desktop-only.
- **It joins your tools instead of replacing them.** Anki, jpdb, Bunpro, WaniKani and jiten all connect: Yomu shows their word statuses on every page and sends your grades back.
- **Hundreds of dictionaries.** Install what you want from the built-in catalogue; installed dictionaries answer on your device.
- **Free, no account.** Everything above works without signing up for anything.

### How Yomu compares with Migaku and Duolingo

Against Migaku: Yomu is free, and that includes Anki export and mobile. Install is one click from the Chrome or Firefox store, with no account before your first lookup. On a phone it runs in the browser you already have. Add any Yomitan dictionary, keep your RTK keywords, or study vocabulary only. Subtitles draw over the site's own player, and switching Yomu off hands the page back untouched. Migaku import is in development.

Against Duolingo: you pick the words, straight from the shows and manga you were already going to watch and read. Review sentences are the ones you found each word in, so practice comes from the language you chose rather than a course script. There is no path and no energy meter. Study when you want, as much as you want. Mark a word known once and it stops turning up.

## Getting started

### Do I need an account?

No. Install Yomu, choose the language you are learning, open a page in that language, and press a word — that is the whole setup. Connecting Anki, jpdb, Bunpro or WaniKani is optional and only for people who already use them.

### Is Yomu free?

Yes — free and [open source](https://github.com/HRussellZFAC023/yomu-reader). There is no paid tier and nothing is locked.

### I'm not technical. What's the easiest way to install it?

On Chrome, Edge or Brave: press **Add よむ to Chrome** on the [homepage](/). On Firefox, including Firefox on Android, use the Firefox store. On iPhone, iPad and Safari it takes a couple of minutes with a free helper app. [Week one](/learn/week-one) walks through it.

### Does it work on my phone?

Yes. On Android, install Firefox and add Yomu from its store. On iPhone and iPad, Yomu runs inside Safari — lookup, reviews, and manga reading all work by touch; Japanese also gets furigana and pitch accent. [Study](/study/) installs to your home screen from your browser's menu. Once it is there it opens like any other app and works offline, so reviews still work on the train.

### Do I need to know kana or grammar first?

You can press words before you know kana because Yomu shows furigana. Learn hiragana first anyway. It takes a few days and makes every later lookup easier. [Week one](/learn/week-one) gives you the order.

### I'm a complete beginner. Can Yomu teach me Japanese from zero?

That is where Yomu is heading. Today Yomu makes real pages readable from day one, with furigana on everything and meanings on press. **Academy**, a structured course that teaches Japanese from zero in order, is in development. Until it opens, the [learning path](/learn/) gives you an approach for real content.

### I installed it and nothing happens on a page.

Check that Yomu is allowed on that site — in your browser's extensions menu, or in your userscript manager — then refresh the page. That covers almost every report we get.

## Reading

### Which sites does it work on?

Any page with text in your selected learning language. On top of that, YouTube gets its own subtitle reader with the video, image-based manga readers work through picture reading, and there is a [PDF reader](/pdf-reader/) and a [video player](/video-player/) for your own files.

### How does it read manga and pictures?

Press a picture — or use the Scan images command — and Yomu recognises text in your selected learning target, so every recognised word becomes a word you can press. Recognition uses Google Lens by default, with no key or account; you can switch to your own Google Cloud Vision key, or to a fully local service, in Settings.

### Can it read my PC games?

Yes. [Yomu Gaming](/learn/manga-and-games#read-a-game-frame) is a small desktop app that reads the text on your screen, so the same press-a-word lookup works in any game.

### What do the colours and lines under words mean?

Word colours show how well you know them when a review system is connected, so a page shows you at a glance what is new and what is due. For Japanese, underline colours can also show pitch-accent patterns. All of it can be turned off in Settings.

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

No — all 33 targets can be read, mined and reviewed. First-run setup requires you to choose one rather than assuming Japanese. You can look a word up, keep it with the sentence where you found it, and review it on a schedule in any target; the dictionary catalogue carries headwords across all of them.

Japanese is labelled **Full Yomu support** because it is the deepest, not because it is the only one that works: it adds mature deinflection, pitch accent, kanji cards, stroke feedback, recorded audio, and 307 grammar points. The other targets have much narrower target/data depth; only Arabic, German, Korean, Russian, and Spanish currently add bounded morphology beyond literal dictionary-form lookup. Your recommended starter follows the selected target and definition language; for English plus Spanish, that means Spanish terms with English definitions and Spanish IPA in the pronunciation row where Japanese shows pitch accent. The interface itself still speaks only English and 日本語.

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
