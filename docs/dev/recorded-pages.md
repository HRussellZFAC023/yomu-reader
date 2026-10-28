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
| `product-traffic.har` | Optional: the product's own GM answers for the hosts a target allows (`api.jiten.moe` for the Wikipedia pages), merged from runs in Chromium, WebKit, Firefox and WebKit at iPad and iPhone sizes, so a replay answers them offline. |
| `redaction-hashes.json` | Redacted pages only: SHA-256 prefixes of every original text run. Never the text. |
| `host/` | YouTube only: the redacted player response, the json3 caption tracks (timings kept, words replaced) and a blank clip. |

Current set: ja.wikipedia 日本語 and 東京都, Aozora 『こころ』 and 『吾輩は猫である』,
two Wikimedia Commons photo pages (a street sign, and a sushi bar signboard
whose photo the OCR honesty gate also opens on its own), reader.ttsu.app paging 『こころ』 vertically and
horizontally, a YouTube watch page and YouTube search results, note.com,
asahi.com and the piccoma.com web store. The watch page's caption timings are
a Mechanism Fixture (see Follow-ups).
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
  attributes, every other attribute value that reads as copy (non-ASCII
  letters or several words), and the text stylesheets paint: string values of
  `content`, `quotes`, list markers, `text-overflow` and custom properties in
  `<style>` elements, `style` attributes and committed `.css` files, escapes
  decoded in names and strings, non-ASCII names such as `--見出し` read,
  `content: var(--name)` read as the strings that custom property holds in
  any of the recording's stylesheets, and `content: "東" "京"` read joined. One-word ASCII values such as
  `true`, an id or YouTube's `4K` badge are vocabulary and are not compared.
  A redacted recording's stylesheets must also paint no copy of their own
  through `content`, since the redactor replaces document text, not CSS;
  today's sites paint only icons and punctuation there. It also fails when `ATTRIBUTION.md` credits
  a recording that is not committed, and when a recorded document still holds
  `<script>`, `<noscript>` or an inline `on*` handler, since the text check
  does not read those.
- Hand-made files beside the recordings are Mechanism Fixtures, named
  `*-mechanism-fixture.*`. Today there are two. The first is
  `hosts/youtube-player-mechanism-fixture.js`. A frozen YouTube page has no
  player, so it plays a blank clip in the page's own `<video>`, exposes the
  `movie_player` methods the product calls, draws YouTube's own captions into
  `.ytp-caption-window-container` from the recording's json3 timings, and moves
  the progress bar at 4 Hz. The second is the `youtube-watch` caption tracks,
  `host/timedtext.*-mechanism-fixture.json3` (manifest
  `host.captionTimings: "mechanism-fixture"`), generated by
  `scripts/lib/youtube-caption-mechanism-fixture.mjs` in the shape of an
  auto-generated track because YouTube refused the recorder's caption
  requests. The Piccoma viewer, which no recording reaches, will get its own
  when its lane needs it.
- Two Mechanism Fixtures are built in memory, never on disk, from the
  `aozora-wagahai` recording by `scripts/lib/aozora-mechanism-fixtures.mjs`.
  `aozora-paragraphs-mechanism-fixture` makes each line of the novel a `<p>`
  inside an `<article>`, the Narou and Kakuyomu shape in which a word wraps a
  whole author `<ruby>` (on the Aozora page itself Yomu reads each text run
  alone). `clamp-cards-mechanism-fixture` sets the paragraphs as synopsis
  cards whose text is a 3-line `-webkit-line-clamp`. Both keep the recording's
  text and ruby; `page-ruby-metrics-smoke.mjs` and `clamp-row-heal-smoke.mjs`
  serve them in place of the recorded document.
- `page-ruby-lifecycle-smoke.mjs` uses `aozora-paragraphs-mechanism-fixture`
  with the recording's original text and ruby. It activates hide, pause and resume in
  Chromium and touch WebKit at iPad size, checking that every authored ruby
  keeps its base, reading and fallback punctuation after each transition, and
  that clearing a word never discards its authored ruby nodes.

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
  `'offline'` answers nothing but `onGmRequest`: no recorded, hosted or live
  answer, so every other GM request fails like a dropped connection.
  `'live'` still answers the page's own pictures from its HAR and
  `yomureader.com` from this build's `docs/public`, then goes to the network.
  `'record'` reaches the network only for the target's `productTrafficHosts`;
  every other GM request fails, so recording never uploads a page picture to
  an OCR service.
- `onGmRequest(request)`: answer first, for example with a 429, to model a
  failing service.
- `gmStoragePrefix`: the bridge keeps GM storage in the page origin's
  localStorage; a prefix keeps it apart from the page's own keys, as a real
  manager's storage is. A gate that reloads and expects private GM values to
  survive needs it, because the product deletes `yomu:private:*` keys from
  page storage.
- `pageNetwork`: `'offline'` (default) or `'live'`.
- `hostOptions`: for YouTube, `{ captions, autoplay, startSeconds }`.
- `contextOptions`: viewport, `isMobile`, `hasTouch`, user agent (iPad runs).

Chromium, WebKit and Firefox all replay every recording.

The OCR regression gate is `npm run smoke:ocr-honesty`. It runs the built
userscript graph on the recorded Commons photos in Chromium and iPad WebKit.
For a focused rerun, pass case names, for example
`npm run smoke:ocr-honesty -- provider aria`. The `provider` case finishes a
Lens request after switching to the local service and refreshing the controller;
the answer must remain under Lens. The `aria` case checks the OCR text region's
explicit accessible name in English and Japanese. These replay checks mock the
GM transport; they do not prove Safari Userscripts' binary request transport,
which needs a separate candidate-specific check in that manager.

For the native check, build the lane and run
`npm run manual:ocr-userscripts-ipad`. This loopback server stages the exact
core and companion with local dependency/CSS URLs, verifies dependency SRI,
and serves the attributed Commons sign recording. It never injects the
product or supplies a GM shim. A passive DOM observer logs trusted clicks,
OCR text and visible loading/failed/ready marks in the output directory;
`staging.json` records the source commit and built/staged hashes.

Hold the simulator and screen locks, back up the installed `yomu.user.js`,
and copy the staged file to the manager's same stable filename. The debug
Userscripts loader upgrades HTTP dependency downloads to HTTPS. For this
local check, back up its `Documents/require/yomu.user.js` directory and copy
the generated `manager-require/yomu.user.js` contents there. Rescan in the
manager and reload Safari. This tests native manager execution and binary
OCR transport; it does not test normal HTTPS dependency downloading.

Select manual OCR with the puck before opening a fresh run, then tap the
sign photo in DeviceHub. Each server start gives images a fresh URL so a
previous successful cache entry cannot substitute for this read. Keep the
observer's before/tap/result records and a simulator screenshot; script
presence alone is insufficient. A later `--run=<previous runId>` reuses that
image URL for a separate cache check. Restore the script, dependency cache
and prior OCR mode, close created tabs, stop the server and release locks.

The W1-10 native check passed on 2026-10-26 in portrait on simulator
`506D5F15-2F4F-4862-8A96-DE7D8F3A42B6`, using Safari and Userscripts-Debug.
The product source was `4511cf03583bf6d8575955ba2665cf5c7c0b250a`
(core SHA-256 `51c8e0960d08d423e1dc8a301d486dc20065165c60a54c8a46a6802cd519596c`,
runtime SHA-256 `18e598a4f2031c2becb9b080a6c45429425996bbe1ee783da2a6393a580f3b70`).
On a fresh recorded image URL, the observer recorded a trusted image tap
at 23:05:09.158 UTC, a visible loading mark, then a visible ready mark and
five OCR lines at 23:05:18.467 UTC. A screenshot records lookup opened from
the recognized text. Evidence is retained locally in
`artifacts/quality-programme-2026-10/W1-10-fix3-native-qa/` at the Yomu
workspace root, with the acceptance summary in `W1-10-fix3-evidence.json`
beside that directory. The earlier fix2 attempt did not load the candidate
and does not establish this result.

This check used the real manager and live Lens endpoint, with no GM shim or
provider mock. The runtime was copied byte-for-byte to the manager's
dependency cache as described above. It proves native binary OCR transport
on that simulator; normal HTTPS dependency downloading, physical-device
acceptance and native request counts were not measured. Exact request
counts remain covered by the Chromium/WebKit replay gate.

`run.productTraffic()` says how the product's requests to the recorded
product-traffic hosts were answered: `{ hosts, served, dropped }`. When the
recorded build drops more than 2 answers, `run.close()`
warns: the load took a scan order the recording does not hold, and what it
painted is an outage, not the product. A gate that judges what the product
painted opens the page with
`openAnsweredRecordedPage(options, { settleMs, attempts, onOpen })` instead,
which waits `settleMs`, discards such a load and loads again (up to `attempts`,
default 4), and resolves to `{ run, discarded }` with `run` null when no load
was answered. The reproduce smoke uses it.

### Network Ledger (`scripts/lib/network-ledger.mjs`)

`run.ledger.requests({ host, method, channel, path, beforeInteraction, noInteractionWithinMs })`
returns entries with host, method, body bytes, time since start, the channel
(`gm` or `page`), how the request was answered, whether a Trusted
Interaction came first, and the latest one before it (`lastInteraction`:
type, time and target, such as `img.thumbimage`). GM requests, and page
`fetch` and XHR calls, carry the flag from the page itself, at the moment they
were sent. Other page requests (`<img>`, `<audio>`, stylesheets) are timed
when Playwright routes them, a few milliseconds after they leave, so one sent
just before a tap can count as after it.

`beforeInteraction: true` finds requests before the first Trusted
Interaction. After any key press (Shift for the popup included), every later
request counts as after one, so a background upload a minute later passes
that check. `noInteractionWithinMs: 3000` finds requests with no Trusted
Interaction in the 3 s before them; a "no cloud OCR without a tap" gate
asserts both are empty and can check `lastInteraction.target` for the tap.
`assertLedgerCount` and `assertNoRequestsBeforeInteraction` throw with the
offending requests listed.

Page-channel requests the recording answered (the page's own document,
stylesheets and pictures) are left out unless `includeRecording` is set. A
recorded page runs no site script, so a `fetch` or XHR the page stamped is the
product's and always counts, even when the page's HAR answered it (a picture
fetched for OCR). GM requests always count, whoever answered them:
`recorded-product` for this page's recorded product traffic, `recording` for
the page's own HAR, `hosted`, `override`, `live`, `offline`, or `failed` when
an answerer threw (a test's `onGmRequest` that rejects, a live fetch that could
not connect; a page request is marked the same way). Each GM request
carries a ledger id to the bridge (the `x-yomu-ledger-id` header, removed
before any answerer sees it), so concurrent identical requests are paired with
their own answers.

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

- `kanjiReadingCoverage(page, { root })`: of the kanji runs in the viewport
  in the page's own text, how many sit wholly in product words with a reading
  a learner sees. A reading counts in two steps. First the style rule: a box
  at least a pixel each way in the viewport, `checkVisibility` (display,
  visibility and opacity, ancestors included), a fill colour that is not
  transparent, and no ancestor clipping or filtering it away (`clip-path` to
  nothing, `clip`, `filter: opacity(0)`). Then the screen: a viewport
  screenshot is compared with one taken while an adopted stylesheet makes
  every reading's glyphs transparent (`-webkit-text-fill-color`, so a
  background drawn in `currentColor` stays; no DOM change), and a reading is
  seen only if its own pixels change. A mask, a partial clip, or text the
  colour of the page or of its own background therefore does not count
  either. `styledReadings` and `seenReadings` report
  both steps. `npm run smoke:recorded-pages:probes` checks this in each
  engine and in WebKit at both iPad sizes.
  Runs are read from each block's text with the readings taken out, so the
  denominator is the same however a build splits or wraps the words. The product's kanji words, the painted ones and those with only
  `data-reading` are reported beside it.
- `startCaptionFrameLog` / `readCaptionFrames` / `captionFlashFrames`: a
  per-frame log of the subtitle lines and of whether YouTube's own caption is
  painted, by the style rule alone (a screenshot per frame is too slow; a
  product line kept but hidden is a gap, unless only a mask hides it).

## Harness self-test

`scripts/recorded-pages-smoke.mjs` (nightly: `npm run smoke:recorded-pages`,
`smoke:recorded-pages:reproduce` and `smoke:recorded-pages:probes`) runs three checks:

- `replay`: every recording, in all three engines, lays out as it did at record
  time (2 px), and each redacted page's block boxes are within 2 px of the live
  page. This is skipped when the recording came from another platform, because
  fonts differ.
- `reproduce`: on the built 2.1.6 product read out of git, the harness sees the
  failures that release shipped with. It sees at least one Google Lens upload
  before any interaction and fewer than 20% of visible kanji runs under a
  painted reading after 15 s on ja.wikipedia 日本語 (the median of three
  loads, since the coverage depends on the scan order), and YouTube's own caption
  painted in an inter-cue gap after the first commit. 2.1.6 never changes, so
  these stay true. It also checks that a real key press turns later page and
  GM requests into requests after a Trusted Interaction. The sparse-readings
  case first checks that the recorded jiten traffic answered the product (at
  most 2 jiten requests dropped, and at least 20 asked, so the scan had
  started; a load short of either is loaded again), so a replay that answered
  nothing cannot pass as sparse readings. In some scan orders 2.1.6 paints no
  reading in the article at all. Run with
  `--product=worktree` to print the same numbers for your build. The caption
  case runs on `youtube-watch`, whose caption timings are a Mechanism Fixture
  in the shape of a YouTube auto-generated track (two-row roll-up, pauses);
  2.1.6 hands YouTube's caption back in those gaps.

- `probes`: on the readings 2.1.6 paints on ja-wikipedia-nihongo (the whole
  page, since in some scan orders it paints readings only in the page's
  navigation; a load with none is loaded again), in each
  engine and in WebKit at 1024×1366 with touch and at 820×1180 with touch and
  the mobile viewport, hiding every reading in place
  (`visibility: hidden`, `opacity: 0`, `display: none`, `font-size: 0`,
  `color: transparent`, `clip-path: inset(100%)`, `clip-path: circle(0)`,
  `clip-path: polygon(0 0, 0 0, 0 0)`, `filter: opacity(0)`, `mask-image`,
  `background-color: currentColor`, text the colour of the background behind
  it) takes covered runs and painted words to zero, and the per-frame style
  rule passes none of them but the last four. `transform: scale(0)` is left
  out: Chromium and Firefox do not transform an `rt`, so the reading stays
  on screen and the screenshot check rightly counts it.

Geometry baselines are per platform. Every recording was made on macOS, so on
the Linux nightly the replay case only checks that each recording loads and
its sampled blocks exist; the 2 px comparisons run on macOS. A Linux baseline
would need a recording run on Linux.

### Limits of a replay

- jpdb.io is never recorded. 2.1.6 sends about 49 `GET jpdb.io/search` GM
  requests on a Wikipedia replay, and every one is answered `offline`. A
  difference in behaviour that depends on jpdb.io is the replay, not a product
  change.
- Product traffic is what one build asked for. The `ja-wikipedia-*` answers
  were recorded from 2.1.6's requests, so a build that asks jiten for other
  URLs gets dropped connections there, and a 2.1.6 against worktree comparison
  is not like for like on reading coverage. When most of another build's
  requests to the recorded hosts drop, `run.productTraffic().verdict` is
  `'other-build-outage'` and `run.close()` warns; a gate that judges that
  build's readings must check the verdict, record product traffic for the
  build, or run on the live network.
- One build does not always ask for the same URLs. 2.1.6 batches its parse
  requests in the order its scan met the page, and that order changes from
  load to load (in one order the first batch starts with 「コンテンツに…」, in
  another with 「日本語。この項目では…」) and with the engine and viewport. A
  recording of one Chromium run answered the other order with nothing: every
  jiten request dropped and no reading painted, in about half of all replays,
  and WebKit, at the recorded size or at iPad size, dropped all of them. The
  recorder therefore runs the product again and again in fresh contexts,
  taking Chromium, WebKit and Firefox at the recorded viewport, WebKit at
  1024×1366 with touch (iPad), WebKit at 820×1180 with touch and the mobile
  viewport (iPad Air, the size the repository's other iPad smokes use) and
  WebKit at 390×844 with touch and the mobile viewport (iPhone) in turn,
  merging new requests, until two whole cycles
  add nothing (`--product-runs`, `--product-settled-cycles`;
  `manifest.productTraffic` records the runs, the profiles and whether it
  settled, and `npm run check` fails product traffic that did not settle; a
  run whose page did not load in time on a busy machine is not counted).
  After the first run it answers the requests it already holds from the HAR,
  as a replay does, so it also meets the requests that only a replay's timing
  makes (a word's `info` lookup that depends on where a batch was cut). A
  settled recording can still miss a rare order, and other viewports may take
  one it does not hold; `run.productTraffic().verdict` (`'scan-order-gap'`)
  and the warning from `run.close()` say so, and `openAnsweredRecordedPage`
  loads again.
- jiten rate-limits (429) a machine that records two pages at once. The
  recorder keeps no 429 or 5xx answer, does not count a rate-limited run
  towards settling, and waits a minute before the next run; `npm run check`
  fails a product-traffic HAR that holds one. Record one page at a time.
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
node scripts/record-pages.mjs youtube-watch --caption-timings=mechanism-fixture  # YouTube refuses this network's caption requests
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
takes several minutes: 25 s a run, at least ten runs, up to 60.

Fidelity is gated in Chromium, where the live page was rendered and the widths
were matched. Width matching is best effort: now and then a replaced title
wraps onto one more line and the recorder refuses the page. Record it again;
the next load usually fits. WebKit and Firefox shape the same replacement text a little
differently. Their numbers are written to `manifest.json` (`fidelity`) but do
not block a recording. A verbatim page is not gated on its distance from the
live page either, since nothing in it was replaced: `aozora-wagahai` replays
up to 6 px from its live boxes in Chromium (7 blocks over 2 px), which the
replay case does not judge. Sites change: re-record when a nightly live canary says
the real page has moved on.

## Follow-ups

- `youtube-watch` was recorded with `--caption-timings=mechanism-fixture`.
  YouTube answered every caption request from the recording machine with 429
  ("automated queries") on 2026-10-17, and again late that day (a plain
  timedtext GET and the watch page's own player request in Chromium): the player's own signed requests (with
  a proof-of-origin token), in all three Playwright engines, in installed
  Chrome without automation flags, and in an ordinary browser on the same
  network, and the transcript panel's `get_transcript` failed too. The page,
  stylesheets and caption track list are recorded; only the json3 timings
  are hand-made. On 2026-10-18 the 429s had stopped, but the player's own
  caption request came back 200 with an empty body (the recorder now says so
  rather than failing to parse it) and `yt-dlp` 2025.10.14 could not read the
  watch page either. From a network YouTube answers, run
  `node scripts/record-pages.mjs youtube-watch` (or pass `--captions-from`
  with the player's two json3 responses) to replace them with recorded
  timings, then drop the two fixture rows from `ATTRIBUTION.md`.
- Weight: the 13 recordings take about 46 MB in a checkout but about 6 MB
  in git, which stores a file shared by two recordings once and compresses
  the rest. Move recordings to Git LFS, or share site stylesheets between
  them, before the checkout passes about 100 MB.
- Width matching runs in Chromium only. A WebKit-aware redaction would measure
  glyph pairs in each engine.
