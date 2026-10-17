# Recorded Pages: sources and licences

These folders are saved copies of real web pages, replayed by
`scripts/lib/recorded-page.mjs` so tests can run the built よむ product on them
offline. `scripts/record-pages.mjs` made them; `docs/dev/recorded-pages.md`
explains the format and the rules. `npm run check` runs
`scripts/check-recorded-pages.mjs`, which fails if a recording is not listed
here or if a redacted one still holds text from its original page.

## Committed as published (public domain or Creative Commons)

| Recording | Source | Licence and credit |
| --- | --- | --- |
| `ja-wikipedia-nihongo` | <https://ja.wikipedia.org/wiki/日本語> | Text: Wikipedia contributors, 「日本語」, ウィキペディア日本語版, [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Each image is under the licence shown on its Wikimedia Commons file page (the file name is in the image URL). Stylesheets, icons and logos: see [Wikimedia site files](#wikimedia-site-files). Unchanged except that the site's scripts were removed. |
| `ja-wikipedia-tokyo` | <https://ja.wikipedia.org/wiki/東京都> | Text: Wikipedia contributors, 「東京都」, ウィキペディア日本語版, [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Images as above. The location map (`maps.wikimedia.org/img/osm-intl`) is map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/), rendered by Wikimedia Maps. Stylesheets, icons and logos: see [Wikimedia site files](#wikimedia-site-files). Scripts removed. |
| `commons-sign-photo` | <https://commons.wikimedia.org/wiki/File:ちかん注意、大崎警察署の看板.jpg> | Photo: released under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) by its author (see the file page). Page text and the `MediaWiki:` gadget stylesheet: Wikimedia Commons contributors, CC BY-SA 4.0. The map tile and marker (`maps.wikimedia.org`) are map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/), rendered by Wikimedia Maps; the map's `icons.svg` sprite comes from [mapbox.js](https://github.com/mapbox/mapbox.js/blob/publisher-production/LICENSE.md) (© Mapbox, BSD-3-Clause). Icons shown as Commons thumbnails are under the licences on their file pages. Stylesheets, icons and logos: see [Wikimedia site files](#wikimedia-site-files). Scripts removed. |
| `commons-sushi-photo` | <https://commons.wikimedia.org/wiki/File:Tachiguisushi-Uogashi-Yamaharu---2025-08-15_017.jpg> | Photo: RuinDig/Yuki Uchida, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) (see the file page). Page text: Wikimedia Commons contributors, CC BY-SA 4.0. Icons shown as Commons thumbnails are under the licences on their file pages. Stylesheets, icons and logos: see [Wikimedia site files](#wikimedia-site-files). Scripts removed. |
| `aozora-kokoro` | <https://www.aozora.gr.jp/cards/000148/files/773_14560.html> | 夏目漱石『こころ』. The work is in the public domain. Electronic text by 青空文庫 (Aozora Bunko); its credit lines are kept in the page footer. |
| `ttsu-kokoro-vertical`, `ttsu-kokoro-horizontal` | <https://reader.ttsu.app/> | ッツ Ebook Reader's page and stylesheets: Copyright (c) 2024, ッツ Reader Authors, [BSD-3-Clause](https://github.com/ttu-ttu/ebook-reader/blob/main/LICENSE) (full licence below). The book shown is 『こころ』 from `aozora-kokoro` (public domain), added as a text file; one recording keeps the app's default vertical paged view, the other has Writing Mode set to Horizontal. Scripts removed. |
| `aozora-wagahai` | <https://www.aozora.gr.jp/cards/000148/files/789_14547.html> | 夏目漱石『吾輩は猫である』. Public domain. Electronic text by 青空文庫; credit lines kept in the page footer. |

The `ja-wikipedia-*` folders also hold `product-traffic.har`: answers
`api.jiten.moe` gave the product for those pages. They are JMdict-derived
dictionary data: JMdict is © the Electronic Dictionary Research and
Development Group, used under [CC BY-SA 4.0](https://www.edrdg.org/edrdg/licence.html),
served by [Jiten](https://jiten.moe).

### Wikimedia site files

The `ja-wikipedia-*` and `commons-*` recordings keep the stylesheets
and interface images the sites served alongside the article:

- Stylesheets from `load.php` and the skin paths are MediaWiki core, the Vector
  skin and MediaWiki extensions,
  [GPL-2.0-or-later](https://www.gnu.org/licenses/old-licenses/gpl-2.0.html)
  (© MediaWiki contributors; source at <https://gerrit.wikimedia.org>). The
  `site.styles` and gadget modules are wiki pages in the `MediaWiki:`
  namespace, CC BY-SA 4.0 (© their wiki's contributors).
- Interface icons (`skins.vector.icons`, `*.svg` under `/w/skins/` and
  `/w/resources/`) are from the Vector skin and OOUI,
  [MIT](https://github.com/wikimedia/oojs-ui/blob/master/LICENSE-MIT) or
  GPL-2.0-or-later as their projects state.
- Logos and wordmarks (`wikipedia-wordmark-ja.svg`, `wikipedia-tagline-ja.svg`,
  `wikipedia.png`, `commonswiki-wordmark.svg`, `commonswiki.svg`,
  `wikimedia-button.svg`, `poweredby_mediawiki.svg`) are trademarks of the
  Wikimedia Foundation, kept only as the pages showed them and used under its
  [trademark policy](https://foundation.wikimedia.org/wiki/Policy:Trademark_policy);
  they imply no endorsement.

## Structure only (copyrighted sites, redacted)

These keep a page's real DOM, stylesheets and layout so tests meet the shapes
learners meet. The site's stylesheets are kept as it served them, because they
are what makes the layout; they remain the site's own. Nothing else of the
site's is included. Every text run, in text and in attributes (`data-*`
included), was replaced with characters from the public-domain 『こころ』 above
(kanji by kanji, kana by kana of the same width) and Latin letters from
Cicero's *lorem ipsum*. Pictures are blank images of the same size, inline SVG
artwork is emptied, brand web fonts are dropped (only open-licensed Google
Fonts families — Roboto, Open Sans, Noto — are kept), and scripts are removed.
Link targets stay as they were. Each folder's `redaction-hashes.json` holds
one-way hashes of the original text runs (never the text), and the check above
fails if any committed file matches one.

| Recording | Structure of |
| --- | --- |
| `youtube-watch` | A YouTube watch page (video `TAorfFcb8_g`) with its player response's caption track list. The video is a blank clip; the caption timings are hand-made (below). |
| `youtube-search` | YouTube search results for 「日本語 勉強」. |
| `note-top` | The note.com top page. |
| `asahi-top` | The asahi.com top page. |
| `piccoma-web` | The piccoma.com web store top page. |

All trademarks belong to their owners; the recordings exist only to test
that よむ behaves on these page structures.

## Recorded Google Lens answers

`scripts/fixtures/ocr/<slug>.lens-crupload.pb` are the answers Google Lens
(`lensfrontend-pa.googleapis.com/v1/crupload`) gave for the photo in the
`commons-sign-photo` and `commons-sushi-photo` recordings, captured with
`node scripts/ocr-honesty-smoke.mjs --capture-lens=sign|sushi`. They are
machine-read text and boxes of those photos (CC0 and CC BY 4.0, credited
above); `scripts/ocr-honesty-smoke.mjs` replays them offline.

## Hand-made, not recorded

| File | Why it exists |
| --- | --- |
| `hosts/youtube-player-mechanism-fixture.js` | A frozen page has no site scripts, so this puts back what YouTube's player observably does that よむ depends on: playing the video, the `movie_player` methods, drawing YouTube's own captions from the recording's json3 timings, and the 4 Hz progress updates. Written for this repository; no YouTube code. |
| `youtube-watch/host/timedtext.ja-mechanism-fixture.json3` | YouTube refused the recording machine's caption requests (429), so this json3 track is generated by `scripts/lib/youtube-caption-mechanism-fixture.mjs` in the shape of an auto-generated track: words rolling in, a two-row roll-up and pauses. Filler words, then redacted like the rest. No YouTube caption data. |
| `youtube-watch/host/timedtext.ja.tlang-en-mechanism-fixture.json3` | Its English translation track, one whole-line event per Japanese line, generated the same way. |

## ッツ Ebook Reader licence

Applies to the page and stylesheets in the `ttsu-kokoro-*` recordings.

```text
BSD 3-Clause License

Copyright (c) 2024, ッツ Reader Authors
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its
   contributors may be used to endorse or promote products derived from
   this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```
