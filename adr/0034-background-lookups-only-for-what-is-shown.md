# Background lookups only for what is shown

Status: implemented on lane/W1-50, 18 October 2026 (wave 1 of the 2.2.0 quality programme).

## Context

With no key and the default look, one ja.wikipedia article sent about 59 jpdb.io pitch-page fetches and 39 jpdb.io searches in its first 20 s, some for segmenter guesses that are not words (見まする, ありがつ), and the same search page once per reading. The default colours never paint pitch (ADR-0026), so none of it was shown. It sent the page's vocabulary to a third party unasked, spent the Jiten minute that readings need, queued the hovered word behind it, and held each keyless YouTube caption line back for up to 48 pitch lookups.

## Decision

1. A background pass fetches what a word needs to be shown: its reading and identity, for visible words. A jpdb.io pitch page is fetched in the background only while one of the colour channels of that surface (highlight, underline, text; page or subtitles) is set to pitch. The rules live in `app/enrichment-policy.ts`; `main.ts` asks it for each pass's options.
2. An opened word always gets its pitch, through the existing urgent popup path, whatever the colour channels say.
3. Captions and video pages ask jpdb.io nothing in the background unless a subtitle channel paints pitch; Jiten alone resolves a caption line before it renders.
4. jpdb.io is never asked about a segmented-fallback guess or a grammar word (する, です, ます…) for pitch. A fallback word's identity search sends the text the learner sees, which jpdb.io deinflects itself, never the segmenter's dictionary-form guesses; a result counts only when it is spelled as that text or as the form it inflects (a homophone sharing the reading does not). Without pitch shown, only a word with kanji is searched, since a kana word needs no reading.
5. The pitch client keeps one search page per query string for a minute, so two readings or two words that need the same page fetch it once, and stores an answered empty lookup for a day like a found one. A failed request is not an answer and is not stored.
6. Page readings get their own Jiten share (`reading`, 60 of the 120 requests a minute) ahead of the rest of enrichment (40), behind word boundaries (70) and the popup (105). Readings Jiten gave are kept per word id across the pages of a site for 30 days (Reading Memory), until hosted reading shards (W1-51) answer every id at once.

7. A cloud OCR provider (Google Lens, Cloud Vision) is never sent a page picture in the background either: a page `<img>` goes to it only after a trusted tap or click on it, never because it scrolled into view or a mouse passed over it. Automatic and hover reading of pictures stay with the learner's own OCR service; `ocr/ocr-upload-policy.ts` holds the rule. This extends owner decision 4 (2026-10-01) from reader canvases to page pictures; W1-11 carries it to reader canvases with Reading Sessions, Settings and the privacy pages.

## Consequences

- `scripts/background-network-smoke.mjs` (`npm run smoke:background-network`, nightly) holds this on the built product with recorded ja.wikipedia and YouTube pages: 0 jpdb.io pitch pages and at most 10 searches in 20 s idle (2.1.6: 37 and repeats), 0 jpdb.io requests during 40 s of captions (2.1.6: about 260), no cloud OCR request in 20 s idle or after scrolling to a picture and resting the mouse on it while a press on it does read it, the pitch lane still running with a pitch underline, and the hovered word's reading and first gloss rendered where a learner sees them within 1 s of the dwell at p90, a popover that never shows counting against it (2.1.6 fails: three of eight answerable words never showed in 5 s). The Network Ledger now records the call stack of each GM request, so the pitch lane and the identity search, which ask the same jpdb.io URL, are counted apart.
- A learner who turns a pitch colour on gets the old background behaviour for that surface, budgets unchanged.
- Words inside the popup (example sentences, related words) are nested background work and follow the page channels.
- Reading Memory writes up to 1,500 entries into each site's page storage. It goes when the shards land.

## Review correction, 19 October 2026

The deferred lane must retain the originating surface too. Enabling subtitle
pitch previously allowed deferred article words to fetch pitch, even though the
article did not paint it. Parsed subtitle tokens and tokens recovered from
rendered subtitle words now retain that provenance through reading hydration.
Deferred batches are split by surface and use that surface's current channels
when drained. An article with only subtitle pitch enabled gets no background
pitch fetches; captions with only page pitch enabled get none either.

The built-product `surfaces` smoke holds both cases for 75 seconds, beyond the
first paced minute. Its article replay removes pitch from recorded Jiten word
details to exercise unresolved pitch. `--browser=webkit` runs the gate at iPad
size with touch enabled. Local `blob:` and `data:` resources remain local during
offline replay, so WebKit can decode the recorded image before a trusted press
starts OCR. This routing exception permits no external network requests.

Product-traffic bodies are preloaded before a replay starts. Large page media
remain on demand. This keeps filesystem stalls out of the deliberately paced
service answers and the measured popup latency; neither the popup budget nor
the before-interaction privacy assertions are relaxed. The picture-press
positive check waits for image decoding and allows preprocessing time, since
that check asserts consent rather than OCR latency.

The timed gate also caches the current hosted runtime-file bytes before the
page starts. Lazy modules are still requested and evaluated by the product on
demand. Only the replay server's local disk reads move out of the measured
lookup; service delays, popup rendering, and the one-second budget stay intact.

The Wikipedia recording retains the 2.1.6 answers and adds actual public Jiten
responses from this review build at desktop and 820×1180 touch viewports, with
the existing JMdict attribution in the recordings directory. Both profiles
completed two consecutive fresh loads without a new request, dropped answer or
refusal before the refreshed recording was marked settled. The gate rejects a
load with any unanswered parse request, including a single failed parse that
the broader replay verdict previously tolerated. The timed hover pass uses the recorded desktop mouse viewport; tablet network
and image cases use 820×1180 touch, whose lookup gesture is verified by a tap.

An on-screen trusted press also exposed the inherited Lens website-upload
fallback. The owner decision retires it entirely, so both reader and desktop
providers now make only the protobuf request and preserve its failure. The
multipart website transports were removed. The recorded image-press gate now
rejects any `/v3/upload` request; the desktop HTTP-failure mechanism fixture
uses the same recorded image and a loopback 503 response to assert one request
and an explicit failure. It fails on the 2.1.6 desktop transport's second upload.
