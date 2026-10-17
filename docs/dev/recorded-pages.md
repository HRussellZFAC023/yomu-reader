# Recorded Pages

Every bug learners reported in 2.1.x passed the tests of the day, because those
tests ran on pages written for the test and never looked at network traffic,
page geometry or main-thread cost. Recorded Pages are saved copies of real
pages. A gate replays one offline and runs the **built** product on it, the
way a userscript manager runs it: `dist/yomu.user.js`, its `@require`
companions and its `@resource` CSS.

## What is recorded

`scripts/fixtures/recorded/<slug>/`:

| File | What it is |
| --- | --- |
| `manifest.json` | URL, licence, attribution, viewport and platform, and the redaction fidelity numbers. |
| `page.html` | The DOM as the reader saw it, with the site's scripts, script preloads, inline handlers and iframe contents removed (inside `<template>` contents too). Open shadow roots are kept as declarative shadow DOM. Rules a CSS-in-JS library inserted through the CSSOM, and adopted stylesheets, are written out as `<style>`. |
| `network.har` + `resources/` | HAR 1.2 for every stylesheet, picture and font the frozen page asks for. Bodies are plain files (`content._file`), so `context.routeFromHAR` can replay them too. |
| `geometry.json` | The sample keys, the live page's Geometry Signature at record time, and each engine's replay signature. |
| `product-traffic.har` | Optional: the product's own GM answers for the hosts a target allows (`api.jiten.moe` for the Wikipedia pages), merged from several runs, so a replay answers them offline. |
| `redaction-hashes.json` | Redacted pages only: SHA-256 prefixes of every original text run. Never the text. |
| `host/` | YouTube only: the redacted player response, the json3 caption tracks (timings kept, words replaced) and a blank clip. |

Current set: ja.wikipedia 日本語 and 東京都, Aozora 『こころ』 and 『吾輩は猫である』,
a Wikimedia Commons photo page, reader.ttsu.app paging 『こころ』 vertically and
horizontally, YouTube search results, note.com, asahi.com and the piccoma.com
web store. The YouTube watch page is not recorded yet (see Follow-ups).
`ATTRIBUTION.md` lists sources and licences.

## Licence rule

- Public-domain and Creative Commons pages are committed as published, minus
  scripts, with an ATTRIBUTION.md entry.
- A copyrighted site's page is committed only as a structure-preserving
  redaction. The DOM, CSS and layout stay. Every visible text run (text nodes
  and the `alt`, `title`, `aria-label`, `placeholder`, `value` and `label`
  attributes) is replaced character by character with public-domain text: kanji
  by kanji from 『こころ』, kana by kana of the same script and size, and Latin
  by lorem-ipsum letters. Each replacement has the same advance width in that
  text's own font, measured in place (error diffusion, then a check of the
  rendered width), so lines break where they did. Web addresses, digits,
  punctuation and symbols stay. Every other attribute with a letter in it is
  redacted the same way (sites keep copy in `data-*`: headlines, campaign
  labels, consent text), except structural ones (`class`, `id`, `href`,
  `src`, `lang`, presentational attributes and the rest of
  `STRUCTURAL_ATTRIBUTES` in `recorded-redaction.mjs`), the keyword values of
  ARIA states (`aria-hidden="true"`, `aria-current="page"`;
  `ARIA_STATE_ATTRIBUTES`), because the product and page styles select on
  them, and values a stylesheet selects on, such as `[data-state="open"]`.
  Text inside `<template>` elements is redacted too. Pictures become blank PNGs of the same pixel
  size, inline SVG artwork is emptied, and only open-licensed Google Fonts
  families are kept.
- The recorder refuses to write a redacted page that still holds an original
  text run, or whose sampled block boxes moved more than 2 px from the live
  page in Chromium. `npm run check` re-runs the text check on every commit
  (`scripts/check-recorded-pages.mjs`). The check reads text nodes, the visible
  attributes and every other attribute value that reads as copy (non-ASCII
  letters or several words); one-word ASCII values such as `true` or an id are
  vocabulary and are not compared. It also fails when `ATTRIBUTION.md` credits
  a recording that is not committed, and when a recorded document still holds
  `<script>`, `<noscript>` or an inline `on*` handler, since the text check
  does not read those.
- Hand-made files beside the recordings are Mechanism Fixtures, named
  `*-mechanism-fixture.*`. Today there is one,
  `hosts/youtube-player-mechanism-fixture.js`. A frozen YouTube page has no
  player, so it plays a blank clip in the page's own `<video>`, exposes the
  `movie_player` methods the product calls, draws YouTube's own captions into
  `.ytp-caption-window-container` from the recorded json3 timings, and moves the
  progress bar at 4 Hz. The Piccoma viewer, which no recording reaches, will
  get its own when its lane needs it.

## Using it in a gate

```js
import { chromium } from 'playwright';
import { openRecordedPage, releaseProduct } from './lib/recorded-page.mjs';
import { assertNoRequestsBeforeInteraction } from './lib/network-ledger.mjs';
import { kanjiReadingCoverage } from './lib/recorded-page-probes.mjs';

const browser = await chromium.launch();
const run = await openRecordedPage({ browser, slug: 'ja-wikipedia-tokyo' }); // this worktree's build, fresh install
await run.page.waitForTimeout(15_000);
assertNoRequestsBeforeInteraction(run.ledger, 'googleapis.com');
console.log(await kanjiReadingCoverage(run.page, { root: '#mw-content-text' }));
await run.close();
```

`openRecordedPage` options:

- `product`: `worktreeProduct()` (default), `releaseProduct('v2.1.6')` (read
  out of git, so a gate can show it fails on the old release), or `null` for
  the bare page.
- `settings`: stored settings, or `null` for a fresh install that saved nothing.
- `gmNetwork`: `'replay'` (default) answers from `product-traffic.har`, then
  from the page's own HAR, then from this build's `docs/public` for
  `yomureader.com`; anything else fails like a dropped connection.
  `'offline'`, `'live'` (canaries) and `'record'` are the alternatives.
  `'record'` reaches the network only for the target's `productTrafficHosts`;
  every other GM request fails, so recording never uploads a page picture to
  an OCR service.
- `onGmRequest(request)`: answer first, for example with a 429, to model a
  failing service.
- `pageNetwork`: `'offline'` (default) or `'live'`.
- `hostOptions`: for YouTube, `{ captions, autoplay, startSeconds }`.
- `contextOptions`: viewport, `isMobile`, `hasTouch`, user agent (iPad runs).

Chromium, WebKit and Firefox all replay every recording.

### Network Ledger (`scripts/lib/network-ledger.mjs`)

`run.ledger.requests({ host, method, channel, path, beforeInteraction })`
returns entries with host, method, body bytes, time since start, the channel
(`gm` or `page`), how the request was answered, and whether a Trusted
Interaction came first. GM requests, and page `fetch` and XHR calls, carry
that flag from the page itself, at the moment they were sent. Other page
requests (`<img>`, `<audio>`, stylesheets) are timed when Playwright routes
them, a few milliseconds after they leave, so one sent just before a tap can
count as after it. `assertLedgerCount` and
`assertNoRequestsBeforeInteraction` throw with the offending requests listed.
Page-channel requests the recording answered (the page's own document,
stylesheets and pictures) are left out unless `includeRecording` is set. GM
requests always count, whoever answered them: `recorded-product` for this
page's recorded product traffic, `recording` for the page's own HAR,
`hosted`, `override`, `live` or `offline`.

### Geometry Signature (`scripts/lib/geometry-signature.mjs`)

`selectGeometryKeys(page)` picks up to 40 text-bearing blocks spread through
the document. Their selector paths avoid inline elements, so wrapping words
does not change a path. `captureGeometrySignature(page, { keys })` records
scroll extents, those blocks' border boxes, each one's line boxes from
`getClientRects` over its own text (readings excluded), and the column and page
counts of every multi-column container. `compareGeometrySignatures(a, b,
{ tolerancePx })` lists what moved. Gates that need "annotation must not move
the page" take a signature before the product runs and one after.

### Main-thread sampler (`scripts/lib/main-thread-sampler.mjs`)

`startMainThreadSampler(page, { engine })` → `stop()` returns:

- a MessageChannel spin sampler, in every engine: main-thread ms/s used by
  anything but the sampler, and gaps over 50 ms. WebKit cannot report long
  tasks itself.
- CDP `Performance.getMetrics` deltas, in Chromium: task, script, style recalc
  and layout ms/s and counts.

### Probes (`scripts/lib/recorded-page-probes.mjs`)

- `kanjiReadingCoverage(page, { root })`: of the visible kanji runs in the
  page's own text, how many sit wholly in product words that paint a reading.
  Runs are read from each block's text with the readings taken out, so the
  denominator is the same however a build splits or wraps the words. The product's kanji words, the painted ones and those with only
  `data-reading` are reported beside it.
- `startCaptionFrameLog` / `readCaptionFrames` / `captionFlashFrames`: a
  per-frame log of the subtitle lines and of whether YouTube's own caption is
  painted.

## Harness self-test

`npm run smoke:recorded-pages` (nightly) runs two checks:

- `replay`: every recording, in all three engines, lays out as it did at record
  time (2 px), and each redacted page's block boxes are within 2 px of the live
  page. This is skipped when the recording came from another platform, because
  fonts differ.
- `reproduce`: on the built 2.1.6 product read out of git, the harness sees the
  failures that release shipped with. It sees at least one Google Lens upload
  before any interaction and fewer than 20% of visible kanji runs under a
  painted reading after 15 s on ja.wikipedia 日本語, and YouTube's own caption
  painted in an inter-cue gap after the first commit. 2.1.6 never changes, so
  these stay true. It also checks that a real key press turns later page and
  GM requests into requests after a Trusted Interaction. The sparse-readings
  case first checks that the recorded jiten traffic answered the product (at
  most 2 jiten requests dropped, at least one kanji word painted), so a replay
  that answered nothing cannot pass as sparse readings. Run with
  `--product=worktree` to print the same numbers for your build. Until
  `youtube-watch` is recorded the caption case warns, and from 2026-11-01 it
  fails.

Geometry baselines are per platform. Every recording was made on macOS, so on
the Linux nightly the replay case only checks that each recording loads and
its sampled blocks exist; the 2 px comparisons run on macOS. A Linux baseline
would need a recording run on Linux.

### Limits of a replay

- Product traffic is what one build asked for. The `ja-wikipedia-*` answers
  were recorded from 2.1.6's requests, so a build that asks jiten for other
  URLs gets dropped connections there, and a 2.1.6 against worktree comparison
  is not like for like on reading coverage.
- One build does not always ask for the same URLs. 2.1.6 batches its parse
  requests in the order its scan met the page, and that order changes from
  load to load (in one order the first batch starts with 「コンテンツに…」, in
  another with 「日本語。この項目では…」). A recording of one run answered the
  other order with nothing: every jiten request dropped and no reading painted,
  in about half of all replays. The recorder therefore runs the product again
  and again in fresh contexts, merging new requests, until four runs in a row
  add nothing (`--product-runs`, `--product-settled-runs`;
  `manifest.productTraffic` records the runs and whether it settled). After
  the first run it answers the requests it already holds from the HAR, as a
  replay does, so it also meets the requests that only a replay's timing makes
  (a word's `info` lookup that depends on where a batch was cut).
- `yomureader.com` is answered from `docs/public` of the build being run.
  `releaseProduct()` extracts only the release's Greasy Fork companions, so
  the 2.1.6 product's other `yomureader.com` requests go offline while a
  worktree build's are answered.
- Redacted pages keep their link targets. A URL is an address, not copy, and
  stylesheets select on `href`; YouTube channel handles and note.com tag and
  creator paths therefore stay in `href` values.

## Recording

```bash
node scripts/record-pages.mjs                      # everything (network + ffmpeg)
node scripts/record-pages.mjs note-top asahi-top   # some
node scripts/record-pages.mjs ja-wikipedia-nihongo --product-traffic-only --product-traffic=v2.1.6
node scripts/record-pages.mjs piccoma-web --keep-staging   # keep the staging copies to debug a refusal
node scripts/record-pages.mjs youtube-watch --captions-from=<dir>  # ja.json3 + ja.tlang-en.json3 saved elsewhere
```

The recorder is split by job: `record-live-page.mjs` loads, prepares, measures,
freezes and redacts the live page; `recording-writer.mjs` writes the folder;
`recording-fidelity.mjs` replays it in each engine and refuses an unsafe or
unfaithful copy. `text-redactor.mjs` replaces text and `recorded-redaction.mjs`
checks that none of the original is left.

Targets live in `scripts/lib/recording-targets.mjs`. A target with
`webFonts: false` leaves its web fonts out (the ttsu reader's 8 MB of Noto
Serif JP), so replays use the system's Japanese font. Recording rejects consent
walls (the privacy-preserving answer), scrolls the page once so lazy content
loads, and records at 1280×900 with `ja-JP` and Asia/Tokyo. Re-recording a
page drops its product traffic, so record that again after it. Product traffic
takes a few minutes: 25 s a run, up to 20 runs.

Fidelity is gated in Chromium, where the live page was rendered and the widths
were matched. Width matching is best effort: now and then a replaced title
wraps onto one more line and the recorder refuses the page. Record it again;
the next load usually fits. WebKit and Firefox shape the same replacement text a little
differently. Their numbers are written to `manifest.json` (`fidelity`) but do
not block a recording. Sites change: re-record when a nightly live canary says
the real page has moved on.

## Follow-ups

- `youtube-watch` needs YouTube's caption tracks, which YouTube refused with
  429 ("automated queries") on 2026-10-17 from the recording machine, in all
  three engines. Run `node scripts/record-pages.mjs youtube-watch` from
  another network. Alternatively, save the video's two json3 tracks (the
  player's own `/api/timedtext` responses, Japanese and `tlang=en`) and pass
  `--captions-from`. The words are redacted either way. Add its row back to
  `ATTRIBUTION.md` with the recording (the check fails on a credit for a
  recording that is not committed). The replay, the
  mechanism fixture and the caption-flash probe are ready for it.
- Width matching runs in Chromium only. A WebKit-aware redaction would measure
  glyph pairs in each engine.
