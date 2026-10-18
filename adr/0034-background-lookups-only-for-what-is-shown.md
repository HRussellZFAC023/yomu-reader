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

## Consequences

- `scripts/background-network-smoke.mjs` (`npm run smoke:background-network`, nightly) holds this on the built product with recorded ja.wikipedia and YouTube pages: 0 jpdb.io pitch pages and at most 10 searches in 20 s idle (2.1.6: 37 and repeats), 0 jpdb.io requests during 40 s of captions (2.1.6: about 260), the pitch lane still running with a pitch underline, and the hovered word's reading and first gloss within 1 s of the dwell at p90 (2.1.6: about 1.4 s). The Network Ledger now records the call stack of each GM request, so the pitch lane and the identity search, which ask the same jpdb.io URL, are counted apart.
- A learner who turns a pitch colour on gets the old background behaviour for that surface, budgets unchanged.
- Words inside the popup (example sentences, related words) are nested background work and follow the page channels.
- Reading Memory writes up to 1,500 entries into each site's page storage. It goes when the shards land.
