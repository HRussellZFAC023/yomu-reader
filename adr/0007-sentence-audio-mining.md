# 0007 — Sentence audio mining

Status: proposed (Phase 1 accepted and shipped in 1.8.24)

Internal engineering context. This lives in `adr/`, not `docs/`, because it names a
competitor: `scripts/check-public-docs.mjs` fails the docs build on `/Migaku/i`
anywhere under `docs/`, and ADRs are deliberately excluded from the published site.

Scoped against `origin/main` at 1.8.22, 2026-07-28. Every claim is grep/read-verified
against this tree or against the Migaku 1.30.8 artifact in `references/migaku`;
file:line references are load-bearing, not illustrative.

## Verdict

Yes. The *transport* already exists end to end (Immersion Kit clips reach Anki
today) and the *timing data* already exists on every batch-mining row. What is
missing is a capture core: the tree contains **zero** audio-capture primitives.

Migaku solves the same problem with `chrome.tabCapture` + a seek-and-record loop +
ffmpeg.wasm. We should copy the capture topology, reject the ffmpeg payload, and add
the storage tier Migaku charges for.

## 1. What already exists (measured)

| Piece | Where | Note |
|---|---|---|
| Corpus sentence audio, wired to Anki | `src/reader/immersion/kit.ts`, `src/reader/study/mining-context.ts:173`, `src/reader/anki/media-files.ts` | Immersion Kit / Nadeshiko clips flow `audioUrls` → `audioDataUrl` → an Anki media file of kind `context`. The pipe is built. |
| Exact cue timings on mining rows | `src/reader/subtitles/subtitle-batch-mining.ts:8-9`, `:19-21` | `SubtitleBatchMiningRow` and `…Candidate` both carry `start`/`end`. The expensive plumbing is done. |
| Video frame capture | `src/reader/anki/client.ts` `captureActiveVideoFrame()` | Largest ready `<video>` → canvas → JPEG. Structural precedent for an audio sibling. |
| Screenshot opt-in setting + i18n + call site | `src/reader/settings/index.ts`, `src/reader/app/i18n.ts`, `src/reader/app/main.ts` (`ankiCaptureScreenshot`) | Copy this shape for `ankiCaptureSentenceAudio`. |
| jiten **sentence** TTS endpoint | `src/reader/audio/jiten-tts.ts:27` | `jitenSentenceTtsUrl(sentenceId, voice)`, used at `src/reader/cards/action-controller.ts:796`. Keyed by corpus `sentenceId` — cannot voice arbitrary mined text. |
| Browser TTS (playback only) | `src/reader/audio/player.ts:1123-1150` | `speechSynthesis` speaks aloud; it cannot be written to a file directly. |
| Audio source resolver chain | `src/reader/audio/source-resolution.ts`, `candidates.ts` | Ordered sources → ordered candidates → first that works. Sentence audio should reuse this shape, not invent a second one. |
| **Separate word/sentence audio Anki fields** | `src/reader/anki/media-files.ts`, `field-mapping.ts` | **DONE** — see §Phase 1. |

## 2. What is missing

1. **No capture primitives.** `grep -rn "MediaRecorder\|captureStream\|createMediaElementSource\|decodeAudioData\|OfflineAudio" src/` → nothing. `AudioContext` appears only to synthesise the fallback chime.
2. **Yomu's own SRS has no audio.** `grep audio src/reader/srs/*.ts` → nothing. Sentence audio must land in the native deck, not only in Anki.
3. **No TTS-to-file path** for the surfaces with no source audio (ebooks, manga/OCR, VNs, PDFs, web) — the majority of Yomu use.
4. **No media store.** Mined clips currently only ever leave via AnkiConnect. Nothing owns bytes that belong to a Yomu card.

## 3. How Migaku does it (teardown, `references/migaku` = 1.30.8)

Read this before designing; it is a shipped answer to the identical problem.

**Capture topology** (`ext/assets/app-window-*.js`, class `TabRecorder`):

```js
// stream from chrome.tabCapture.getMediaStreamId({consumerTabId, targetTabId})
this.stream = this.audioContext.createMediaStreamSource(n)
this.stream.connect(this.audioContext.destination)   // tabCapture MUTES the tab; re-emit it
this.initMediaRecorder(n)
mute()   { this.stream?.disconnect() }
unmute() { this.stream?.connect(this.audioContext?.destination) }
```

Manifest permission is `tabCapture` (plus `tabs`, `activeTab`); images come from
`chrome.tabs.captureVisibleTab`.

**Segment loop** (`recordSegment({startTime, endTime, playerData})`): message the
content script to seek and play from `startTime`, record for
`getPlaybackRateAdjustedDuration(end - start, playerData.playbackRate)` — i.e.
`duration / rate` — then stop and take the blob. Seek success/failure is tracked as
an analytics event, which tells you how unreliable seeking is in practice.

**Post-processing**: `ffmpeg-core.wasm` (32 MB) + `MediaInfoModule.wasm` (2.4 MB) in
a **sandboxed iframe** (`ffmpeg.sandbox.html`). Note `new MediaRecorder(i, {mimetype: "audio/wav"})`
— lowercase `mimetype` is a typo, so the option is ignored and Chrome records its
default (webm/opus); the blob is then relabelled `audio/wav` and handed to ffmpeg to
sort out. The 34 MB payload is doing format conversion that WebCodecs now does natively.

**Storage**: sql.js SQLite persisted in IndexedDB as the local source of truth;
media synced through `file-sync-worker-api.migaku.com`; the DB itself uploaded via
presigned URLs (`srs-db-presigned-url-service-api.migaku.com/db-force-sync-upload-url`).
Per-source audio is fetched from separate Cloudflare Workers
(`azure-tts-audio-worker`, `googletts-audio-worker-api-data`, `forvo-audio-worker-api-data`).
Card creator limits: 5 MB per audio file, 10 audio files per card.

**Fields**: `cardCreator.form.sentenceAudio` and `…wordAudio` are separate, each with
its own auto-prefill toggles — sentence audio from "Video audio (if available)" or
"AI Text-to-Speech", word audio from "Migaku dictionary" or "Azure TTS". This is the
same lane model proposed below, and it independently validates Phase 1.

**Known failure mode**: `cardCreator.modals.blankRecording` — HDCP with GPU
acceleration enabled yields blank screenshots and silent audio, and their remedy is
to tell the user to disable graphics acceleration. Expect the same class of report.

### What to take and what to reject

| Migaku | Decision |
|---|---|
| `chrome.tabCapture` for audio | **Take.** It sidesteps every `<video>`-element hazard: no CORS taint, no cross-origin silence, no permanent element reroute, and it is delivery-agnostic (MSE, HLS, blob). |
| `createMediaStreamSource → destination`, disconnect to mute | **Take.** This is the mute-while-capturing mechanism, and on a tabCapture stream it is safe — the graph owns a capture stream, not the page's element. |
| Seek → play → record `duration / playbackRate` | **Take.** Matches the batch design below. |
| ffmpeg.wasm (34 MB) in a sandboxed iframe | **Reject.** Bundle headroom is ~140 KB. WebCodecs `AudioEncoder` (native Opus) plus `OfflineAudioContext` for trim/resample covers what ffmpeg was doing at zero bundle cost. |
| SQLite-in-IndexedDB collection | **Reject** as a whole; Yomu's SRS already has its own local store. Take only the "local is the source of truth, sync is additive" stance. |
| Presigned-URL media sync to their own workers | **Take the shape** — see §5; Yomu already has an R2 audio bucket and worker. |
| 5 MB / 10-file card limits | **Take** as sane guardrails. |

## 4. Architecture: four supply lanes behind one resolver

Model this exactly like the existing word-audio resolver — an ordered list of
sentence-audio sources, each asked until one yields bytes. Keeps the work in core
machinery instead of becoming per-site patches.

```
resolveSentenceAudio(target: SentenceAudioTarget, settings)
  → lane 1  corpus      exact-sentence match in Immersion Kit / Nadeshiko   [SHIPPED]
  → lane 2  live tap    record the playing tab between cue start/end        [NEW, marquee]
  → lane 3  decode      fetch bytes → decodeAudioData → slice exactly       [NEW, narrow]
  → lane 4  tts         render the sentence to a file                       [NEW, universal]
```

`SentenceAudioTarget = { text, start?, end?, playbackRate?, sourceUrl? }`. Lanes 2–3
need timings; lanes 1 and 4 need only text. That one type is what lets a YouTube cue,
a BookWalker OCR line and a web-novel selection share a code path.

### Lane 2 — live tap

**Extension build**: `chrome.tabCapture.getMediaStreamId({consumerTabId, targetTabId})`,
then `getUserMedia` with `chromeMediaSourceId` in an offscreen document, then the
Migaku graph above. This is the primary path and the reason the capture core lives in
the extension.

**Userscript build**: `tabCapture` does not exist. Options, in order: (a) the
`<video>` element graph (`createMediaElementSource` + gain), gated hard on
`currentSrc` being `blob:`/MediaSource/same-origin, because on cross-origin non-CORS
media it yields silence and **cannot be un-routed** — probe with `captureStream()` +
an `AnalyserNode` for non-zero samples before committing; (b) `getDisplayMedia({audio:true})`
with the user picking the tab — clunkier, one gesture, but no origin hazard.
Userscript users may simply get lanes 1/3/4 until the extension path proves out.

**Encrypted media** (`video.mediaKeys` set, or an `encrypted` event seen) → skip.
Netflix/Crunchyroll/Disney+ are out of scope by design; no DRM circumvention. They
are not current Yomu video targets anyway (`grep -i netflix src/reader` hits only
frequency-list and dictionary names). Those surfaces get lane 4.

**Batch speed.** MediaRecorder is realtime-only. Average anime cue ≈ 2.5 s → 25
candidates ≈ 62 s at 1×. Mitigation, same as Migaku's: `preservesPitch = false` and
`playbackRate = 4`, record `duration / rate`, then invert the resample in an
`OfflineAudioContext` (a `BufferSource` at `playbackRate 0.25` restores duration
*and* pitch, because with `preservesPitch = false` the speed-up is a pure resample
rather than a time-stretch). ≈ 16 s capture + ~5 s seek overhead for 25 cards.
Seek-and-grab beats one linear pass (a 24-min episode at 4× is still 6 min).

**Encoding.** MediaRecorder emits `audio/webm;codecs=opus` (Chromium) or
`audio/ogg;codecs=opus` (Firefox); both play in Anki/mpv and both extensions are
**already** handled by `ANKI_AUDIO_EXTENSION_ALIASES` in `src/reader/anki/media-files.ts`.
For lane 3's raw `AudioBuffer`, prefer WebCodecs `AudioEncoder` (Opus) with a ~30-line
mono 24 kHz 16-bit WAV writer as fallback.

### Lane 4 — TTS render (universal fallback)

`speechSynthesis` cannot be recorded directly. In preference order:

1. **jiten TTS for arbitrary text** — needs an endpoint taking text, not a `sentenceId`. `jitenSentenceTtsUrl` shows the route shape and the five voices already exist. Cheapest good outcome, but it is an upstream API dependency and may not be ours to add. Migaku's equivalent is `azure-tts-audio-worker.migaku.com`; Yomu could stand up the same thing on its existing Workers stack.
2. **System TTS via the desktop/gaming app** — `say -o` (macOS) / SAPI (Windows) writes a file directly. Best offline quality, desktop only.
3. **`speechSynthesis` into the lane-2 capture graph** — works everywhere, realtime, quality depends on installed voices.

## 5. Where mined audio lives

Requirement: mined audio must work **signed in (Yomu servers)** *or* **local-only (no
account)**. Local is the source of truth either way; sync is additive. Three tiers
behind one `SentenceAudioStore` interface so callers never branch on account state:

| Tier | Backing | When |
|---|---|---|
| `local` | **IndexedDB**, blob per clip, keyed by content hash | Always written first. Default with no account. Never `localStorage` — OCR already poisons tests through it, and Opus clips are orders of magnitude larger. |
| `hosted` | Yomu R2 via a Worker issuing presigned PUT URLs, same shape as Migaku's file-sync worker | Signed-in users, opt-in. Yomu already has an audio R2 bucket and a matching Worker; the blocker on record is an owner-created R2 Object Read & Write token (wrangler OAuth cannot mint one). |
| `export` | Bytes inlined into the AnkiConnect payload (`storeMediaFile`) | Every tier. Anki users never depend on either store — this is why the store can ship after Phase 2. |

Design rules:
- **Content-addressed** (`sha-256` of the encoded bytes) so the same clip mined twice costs one object, and so a local clip can be promoted to hosted without renaming.
- **Write local, then enqueue upload.** An offline or signed-out user is never blocked; the queue drains later. A failed upload must never lose the local blob.
- **Quota is real.** Adopt Migaku's guardrails (≈5 MB/clip, ≈10 clips/card) plus a store-level budget with LRU eviction of *hosted-backed* clips only — never evict a clip whose only copy is local.
- **Deletion is the user's.** A "clear mined audio" control must clear both tiers, and signing out must not silently delete local blobs.

## 6. Delivery phases

**Phase 0 — capture spike (~1 day, gates 2–4).** Prove and *measure*: `tabCapture` +
the gain graph in the extension build on real signed-in YouTube, Chromium **and**
Firefox; whether the userscript sandbox can construct `AudioContext`/`MediaRecorder`
against a page-realm `<video>` (a known Yomu bug class — bare `requestAnimationFrame()`
throws in the Firefox userscript sandbox and has silently killed re-projection);
4× `preservesPitch = false` round-trip fidelity; seek+capture latency per cue. Reuse
`scripts/yt-live-harness.mjs` and mask `navigator.webdriver`. If the sandbox realm
blocks it, the live-tap lane is extension-only — better to learn that on day 1.

**Phase 1 — split the audio field role. ✅ DONE (this change).** `sentenceAudio` is a
first-class `AnkiFieldRole`; sentence-audio field names moved out of
`ANKI_AUDIO_FIELD_NAMES`; `mergeAudioFilesForNote` routes by media kind and collapses
both ways for single-audio-field note types; saved mappings migrate once. This also
fixed a live defect — see the CHANGELOG entry.

**Phase 2 — single-cue live capture.** Shortcut while watching: capture the active
cue's audio alongside the frame and sentence Yomu already grabs. Extend the
`main.ts` mining call site with `sentenceAudioDataUrl`, behind
`ankiCaptureSentenceAudio` mirroring `ankiCaptureScreenshot`. Padding defaults −100 ms
lead / +300 ms trail, clamped so it never crosses an adjacent cue; optional "extend to
sentence end" when a cue breaks mid-sentence.

**Phase 3 — batch capture pass.** The mining panel already has `start`/`end` per
candidate and a selection model. Add an "include sentence audio" toggle; after
selection run one seek-and-grab pass over selected cues sorted by time, with progress
and cancel. Gain to 0 during the pass, restored after.

**Phase 4 — TTS lane.** Universal coverage. Choice depends on the jiten API answer.

**Phase 5 — `SentenceAudioStore`.** §5, local tier first, hosted tier behind the R2
token.

**Phase 6 — Yomu-native SRS audio.** Wire the store into the local deck
(`src/reader/srs/local-yomu-deck.ts`) so review plays the mined clip. This is the
point at which Anki becomes an export target rather than the source of record.

**Phase 7 — retro-fill.** "Add sentence audio to existing cards" over notes with a
sentence and an empty sentence-audio field, via lanes 1 and 4.

**Phase 8 — decode-and-slice (lane 3).** Sample-accurate and instant for direct-`src`
media. Last because it is the narrowest: YouTube's MSE bytes are not fetchable without
itag/signature extraction, which is fragile and not worth the maintenance.

## 7. Packaging

The capture core ships as a **companion**, not in the main userscript — bundle headroom
is ~140 KB and the WebCodecs/OfflineAudioContext code plus UI will exceed it. Two
consequences already bitten before: companion files are *new* files each build, so
release staging must not use `git add -u` (the userscript pins companions by hash and
`-u` ships 404ing `@require`s); and the companion is the natural home for the capture
graph if Phase 0 shows the Firefox sandbox realm cannot host it.

## 8. Risks, ranked

1. **Firefox userscript sandbox realm** blocks `AudioContext`/`MediaRecorder` against a page `<video>`. → Phase 0 gate; fallback is extension-only live tap, or `getDisplayMedia`.
2. **`createMediaElementSource` silences the user's audio** on cross-origin non-CORS media, unrecoverably — the single most dangerous line in the feature. → Only on the userscript path, behind the origin gate + probe. **The extension `tabCapture` path avoids it entirely**, which is the main reason to prefer it.
3. **HDCP / GPU acceleration → blank capture.** Migaku ships a modal telling users to disable graphics acceleration. → Detect all-silent output and say so plainly instead of writing a silent clip.
4. **Batch capture wall-clock** feels slow and users abandon it. → 4× resample trick, progress + cancel, never block the UI.
5. **Storage growth and quota**, especially local IndexedDB. → Content addressing, per-card caps, LRU over hosted-backed clips only.
6. **DRM sites** generate "why is it blank" reports. → State the limitation in settings copy and fall back to TTS rather than emitting silence.

## 9. Tests

- Unit: cue→clip window maths (padding, adjacent-cue clamping, sentence extension); the 4× resample round-trip; WAV writer header; store key derivation and eviction policy.
- Contract: audio routes by kind to distinct fields, and still collapses on single-audio-field note types (`tests/reader/anki-sentence-audio-field-role.test.ts` — shipped in Phase 1).
- Live: the YT harness pass from Phase 0, kept as a manual `smoke:*` (CI-only smoke scripts stay out of the release gate; `smoke:youtube` already fails headless).
- Guard: the settings dialog must not hit the network when opened — the Firefox-consent tests are the tripwire, and a sentence-audio settings panel is exactly the change that trips it.

## 10. Open questions for the owner

1. **jiten TTS for arbitrary text** — can a text-input endpoint be added alongside `/api/tts/sentence/{id}`? Decides whether Phase 4 is cheap and good or desktop-only. (Migaku pays for Azure TTS behind their own Worker; Yomu could do the same on its existing Workers stack.)
2. **R2 token** — the hosted tier needs the owner-created R2 Object Read & Write token that also blocks the existing audio bulk upload. Same blocker, worth unblocking once.
3. **Extension-first?** The live-tap lane is materially safer and simpler in the extension build (`tabCapture`). Is it acceptable for sentence audio from video to be an extension-only feature at first, with userscript users on lanes 1/3/4?
4. **Batch capture audibility** — is an audible fast scrub acceptable if it is faster, or is silent capture (gain 0) mandatory?
