---
title: Your own setup
description: Connect dictionaries, audio, Anki, Jiten, Bunpro, JPDB and WaniKani, sync devices, and see which planned integrations are still in development.
---

# Your own setup

Keep the study system you already open.

Yomu works with a starter dictionary and a local deck. Everything after that is a choice. Add one service when it removes friction. Remove it when it adds ceremony.

## Bring your dictionaries

Install a dictionary from the catalogue or import any compatible Yomitan ZIP. The starter uses both choices in your language profile: an English-speaking learner reading Spanish gets Spanish-headword terms with English definitions and Spanish IPA in the popup's pronunciation row. Japanese uses that same row for pitch accent. Japanese terms, kanji and pitch remain the starter only when Japanese is the selected target. Dictionary files, search indexes and local lookup results stay in the browser. Reorder sources so the answer you trust appears first.

Yomu ships definitions in 32 languages.

Choose the language you are reading separately from the language used for definitions. Japanese is labelled **Full Yomu support**. The other 32 are labelled **Read, mine and review** — the whole loop works in every one of them. Japanese is the deepest rather than the only one: it adds pitch accent, kanji cards and far more grammar.

## Bring your audio

For Japanese, Yomu Hosted Audio provides the default recorded pronunciation. Other targets use speech synthesis in the selected language by default. Where available, you can enable source audio from Jiten, Bunpro and other connected providers, import custom JSON sources, or run Ultimate Yomitan Audio on your computer.

The [Local Audio guide](/local-audio) covers the server, audio folders and phone access. Each source can be enabled and ordered separately.

## Keep one review home

Jiten supplies dictionary entries, word state, audio, kanji facts and review actions. JPDB supplies Japanese decks, frequency, word state and its five-grade reviews. Bunpro supplies grammar and vocabulary context plus its live review queue. WaniKani supplies level, readings, meanings, mnemonics, components and SRS state. Anki gives you your own note types, templates and schedule.

Connect only the accounts you use. Tokens stay on your device and talk directly to the service. Bunpro and WaniKani tokens can change review state, so treat them like passwords.

Migaku import is in development. Until it ships, use a supported dictionary export or keep Migaku alongside Yomu without claiming that its deck has been imported.

RTK learners can keep RTK keywords and frame data. Vocab-only learners can hide kanji steps. Kanji sources such as KanjiVG, Kanji Alive, WaniKani, Jiten, JPDB and imported dictionaries can be enabled and reordered independently. Uchisen remains available only as an optional outbound lookup link; よむ does not download or display its content.

## Use desktop Anki from a phone, iPad, or Android

Keep Anki open on your computer and let the phone talk to AnkiConnect. Tailscale is the simplest route away from home because it gives your devices a private address without opening a router port.

Below, replace every `100.x.y.z` with your computer's Tailscale address. It usually starts with `100.`.

1. Install Anki and the AnkiConnect add-on on the computer.
2. Install Tailscale on the computer and phone, then sign into the same account.
3. Copy the computer's Tailscale address.
4. In AnkiConnect config, bind to that address and keep port `8765`.
5. If there is an allowed-origins list, keep what is there and add `https://yomureader.com`.
6. Restart Anki and leave it open.
7. Open `http://100.x.y.z:8765` on the phone. An AnkiConnect message proves the route works.
8. Put the same URL in Yomu Settings under Mining, then run Check AnkiConnect.

Keep AnkiConnect on Tailscale or your home network. Do not forward port `8765` to the public internet.

If you do not want to run desktop Anki, Yomu can hand a new card to AnkiMobile or AnkiDroid. Mobile Anki handoff is one-way: it starts a new card and stops there. It cannot scan existing decks, tell you what is already in them, update an old card or give you review queues. Those jobs need desktop AnkiConnect.

## Sync Yomu between devices

A free Yomu account can pair devices so local cards follow you. Cards are encrypted before they leave the device. Profile and sync can list paired devices, revoke one, export your data or delete the account.

Settings can also be exported as JSON from the Dictionaries screen. Keep that file with your other backups.

## Know what is still being built

Sentence-audio mining, deeper study tools for the reading-and-lookup targets, and Migaku import are in development. Academy is a story-driven Japanese course from first sounds to N1; it is in development and invitation-only while it is built.

Planned does not mean installed. The [changelog](/changelog) is the record of what has shipped.

Next: [Reference: find the switch for anything →](/learn/reference)
