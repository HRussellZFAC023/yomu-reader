# Inspect a page with the built reader

Build first, then inspect a public page in an isolated Chromium context:

```sh
npm run inspect -- --url https://ja.wikipedia.org/wiki/日本語 --selector '#mw-content-text p' --limit 20
```

Open `artifacts/inspect/index.html`. The compact table shows the target word,
base-text hover outcome and observed popup text. JSON retains coordinates,
readings, build SHA-256, errors and runtime limitations; PNG and DOM snapshots
show the page. This is diagnostic evidence, not an automatic correctness verdict.
An opened popup may still contain the wrong word or be loading.

To record the page responses and anonymous reader requests for later comparison:

```sh
npm run inspect -- --url https://ja.wikipedia.org/wiki/日本語 --record artifacts/wiki-capture
npm run inspect -- --replay artifacts/wiki-capture --out artifacts/wiki-replay
```

Replay uses the recorded URL and blocks uncaptured browser and GM requests; a
missing request or sampled word that opens no popup makes the command fail. Recordings stay in ignored artifacts and
may contain page content and response headers. Review them before sharing. Captured
HTML is a diagnostic snapshot; the replay uses the HAR responses and GM cassette.
A dynamic website may need a fresh recording. No live-network fallback is used.

`--script /absolute/path/dist/yomu.user.js` compares another build against the same
capture (CSS comes from the adjacent `yomu.css`). `--selector` limits content and
`--limit` bounds the number of visible words sampled. The hover point is inside
the base text, excluding ruby readings. Offscreen, shadow-root, iframe and desktop
OCR hit areas are outside this tool's coverage. `--min-words 0` allows pages where
no Japanese is expected; otherwise zero annotation fails the command.

The runtime uses existing smoke-harness GM storage and request bridges with fresh
keyless settings. It does not install an extension or exercise a real userscript
manager, authenticated provider, existing dictionary collection, or personal
browser profile. Those channels still need their existing dedicated checks.

## Observed during takeover

On 7 October 2026, the 2.0.12 built userscript annotated 199 DOM words on the
Japanese Wikipedia 日本語 page. The first base-word popup opened during both live
recording and offline replay, with zero missing replay requests. A three-word run
recorded an intermittent hover miss; it is not a general hit-area acceptance pass.
Provider/CSP errors are retained in the reports. The tested build is the baseline,
not the integrated 2.1 source.

The pre-existing baseline reader suite finished with 9,445 of 9,446 tests passing;
only `tests/reader/storage-epoch.test.ts` failed. This does not establish the state
of the integrated branch.
