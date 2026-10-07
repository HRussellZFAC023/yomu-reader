---
title: Start here
description: Install よむ, press your first Japanese word, and learn the small daily routine the rest of this guide builds on.
---

# Start here

よむ is a free pop-up dictionary for learning Japanese. Press a word on a web page, in a subtitle, in a manga panel or in a PDF to see its reading, meaning, pitch accent and sound. Press again to save it with the sentence where you found it.

Learn hiragana first, then katakana. Use any kana course you will finish.

## Install Yomu {#install-yomu}

**Chrome, Edge, Brave, Vivaldi or Opera:** [Add よむ from the Chrome Web Store](https://chromewebstore.google.com/detail/%E3%82%88%E3%82%80/bbaickgfdgnecdnkcplaoiopnfghlkna). Edge first asks you to allow extensions from other stores. Opera first needs its Install Chrome Extensions add-on.

**Firefox, including Firefox for Android:** [Add よむ from Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/yomu-reader/). Do not use the `.xpi` file on GitHub. It is unsigned, so Firefox will not install it.

**Safari, iPhone and iPad** use the free Userscripts app:

1. Install Userscripts from the App Store and open it once.
2. Open the Safari extension settings, turn Userscripts on and allow it on all websites.
3. Open the [よむ userscript](https://yomureader.com/yomu.user.js) in Safari.
4. Open Safari's page menu, choose Userscripts, then install the detected script.

**Any other browser** can use Tampermonkey or another userscript manager. If the link downloads a file instead of installing, open the manager and choose Install from URL with `https://yomureader.com/yomu.user.js`.

Where that option lives depends on the manager. Tampermonkey keeps it under Utilities → Install from URL. Violentmonkey uses + → Install from URL. ScriptCat uses Script list → Create → Install from URL, and will also accept the downloaded file dragged onto its tab.

## Press your first word {#press-your-first-word}

Open a Japanese page you want to read and press a word. Two good first pages:

- [NHK News Web Easy](https://www3.nhk.or.jp/news/easy/): short news in simple Japanese
- [Tadoku free books](https://tadoku.org/japanese/free-books-en/): graded readers for beginners

The popup shows the reading, meaning, pitch accent, frequency, audio and example sentences. Press a kanji in the headword when you want its readings or stroke order. Save the word only if you want to meet it again.

Install a dictionary under Settings → Sources for offline lookup.

<figure class="yomu-feature-shot">
  <img :src="'/screenshots/real-popup-lookup.png'" alt="A Yomu word panel open on a real Japanese article, showing the headword, reading, pitch, definition and grading buttons.">
  <figcaption>The word panel on a real Japanese article.</figcaption>
</figure>

## Leave furigana on {#leave-furigana-on}

Start with furigana above every word. A missing reading should never leave you wondering whether Yomu failed or expected you to know it. Later you can show readings only for uncommon kanji, hide them on known words or turn them off.

The coloured underlines show pitch accent. Word colours can show whether a word is new, learning, known or due. Notice them. Do not memorise the legend today.

The default settings are enough for your first weeks. Read one short thing, press a few words and come back tomorrow.

## If nothing happens

Allow よむ on the site from your browser's extension menu or your userscript manager, then reload the page. The [FAQ](/faq) covers the other common problems.

## How to learn with Yomu {#how-to-learn-with-yomu}

Read and watch things you nearly understand. Look up the word that blocks a sentence, then go back to the story. Save the words that keep coming back, and review a few of them each day.

Learn the most common words first, but start reading before you know them all. Japanese takes years, so a small habit you keep beats a big plan you drop.

## Try Yomu without installing {#try-yomu-without-installing}

These run on this site with nothing installed:

- [Study](/study/) reviews the words you saved and works offline after its first load.
- [Video Player](/video-player/) opens your own video and subtitle files.
- [PDF Reader](/pdf-reader/) opens a PDF from your computer, scanned pages included.
- [The live OCR panel](/#yomu-live-ocr) makes the words in a manga page pressable.

You do not need an account to read, look words up, keep a local deck or use Study. Yomu is free and open source.

Next: [Reading →](/learn/reading)
