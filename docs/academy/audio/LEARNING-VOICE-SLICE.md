# Academy learning voice slice

BASE-020 and AUD-008 close one native-band production slice, not the Academy voice corpus: four Yomu-authored Japanese voice units, five stable runtime bindings, and four 64 kbps mono Opus assets. The reachable surfaces are the Lesson 0 sound fork, two Cafe practices, and two Language Lab practices. No textbook or other third-party source audio is copied.

## Production contract

`learning-voice-production.json` is the reusable per-slice contract. It pins each immutable `voiceLineId` to speaker, intent, `ja-JP` locale, native band, source revision, runtime bindings, exact Aivis model payload, style, ACML-1.0 evidence, all seven query controls, optional mora-level pitch/timing controls, the Aivis query hash, and the Python-canonical deterministic cache key. Required and excluded triage closes only this four-line denominator.

The exact mapping in this slice is:

| Role | Model and style | Covered surface policy | Rendered here |
| --- | --- | --- | ---: |
| Academy narrator | `らせつん` / `標準` | UI, learning, lesson, minigame, and worksheet prompts | 1 |
| Miller | `阿井田 茂` / `Calm` | textbook dialogue and World practice | 1 |
| Mary | `まい` / `ノーマル` | textbook dialogue and World practice | 1 |
| Rie-sensei | `morioki` / `ノーマル` | Academy character, lesson/minigame dialogue, and World practice | 1 |

The minigame and worksheet rows above are an exact narrator mapping policy, not a claim that their remaining corpus has been rendered.

## Runtime contract

`src/academy/audio/learning-voice.ts` admits only owner-approved, objectively accepted entries. It resolves only an exact stable binding whose Japanese text and source hash still match the catalog, and reports `playing`, `miss`, or `superseded`; a superseded request never falls through to synthesis.

`WorkerTtsPronunciationService` owns one abort signal across catalog loading, director unlock, static media startup, worker fetch/media, and browser speech. A superseding request or `academy:dispose` aborts pending work before it may start audio or mutate a disposed screen; late static or worker media errors continue through the same ladder only while that request remains current.

The production catalog and assets live under `public/academy/audio/` and are allowlisted into `docs/public/academy/audio/` by `scripts/sync-academy.cjs`.

## Recovery boundary

A prior recovery audit supplied the four Opus takes, Aivis query hashes, cache keys, model/style selections, narrow runtime bindings, QA scripts, and production-manifest foundation reused here. No reproducible census artifact accompanied the earlier candidate/source totals, so this slice makes no claim about those totals. The runtime schema, request cancellation, owner-approval state, reusable contract, deterministic validator/staging renderer, lock format, and manifest accounting were rewritten or completed here.

The existing four-line story pilot from baseline commit `1234743fbaab59fdb99c61bb4ecdcfbeddda6a10` remains in its own manifest tranche. It was not duplicated into this learning slice.

## Acceptance evidence

- `learning-voice-model-evidence.json` archives identity and complete ACML-1.0 text extracted from each exact installed `.aivmx` payload, with payload, manifest, and licence hashes. Model weights, icons, and samples are not copied.
- `learning-voice-query-evidence.json` archives all four canonical Aivis query payloads plus the engine global-style to embedded model/local-style join. The default contract verifier recomputes query/cache hashes and validates text, options, models, mappings, catalog keys, and audio bytes without contacting Aivis.
- `learning-voice-acceptance.json` records contract identity, codec, sample rate, channels, duration, LUFS, true peak, silence, mirrors, hashes, provenance, and objective acoustic transcription.
- `learning-voice-browser-smoke.json` records five visible Listen interactions served from `docs/public/academy/`, with SHA-256 equality between a fresh production-mode candidate, `dist/academy/app.js`, and the hosted `docs/public/academy/app.js`; there is no `/src/` request or worker-TTS fallthrough.
- `learning-voice-locks.json` binds production identities, exact cast mappings, render inputs, assets, and every current evidence file.
- `learning-voice-model-reviews.json` remains archived because Whisper and Kaldi/Vosk reviews were genuinely completed for these four takes. It is historical evidence, not a future acceptance gate.

The owner-approved AivisSpeech + Style-Bert-VITS2 JP-Extra output quality is binding. Evidence says `ownerQualityApproved: true`, `ownerLineByLineReviewed: false`, and `humanReviewed: false`; human auditory acceptance remains outstanding and no human line-by-line audition is implied.

## Reproduce

The installed Aivis models and Whisper model are local QA dependencies and are not committed:

```bash
npm run academy:learning-voice:contract
WHISPER_MODEL=/path/to/ggml-base.bin npm run academy:learning-voice:qa
npm run build:academy
YOMU_SYNC_ACADEMY_FORCE=1 node scripts/sync-academy.cjs
npm run academy:learning-voice:smoke
npm run academy:learning-voice:lock
npm run academy:learning-voice:manifest
```

`npm run academy:learning-voice:contract` is read-only and network-free. `npm run academy:learning-voice:archive-queries` is the explicit loopback-engine command for replacing the archived query artifact. `npm run academy:learning-voice:render` is a separate live mode that writes new Aivis output to `qa-artifacts/academy-learning-voice/staging/`; neither live command replaces accepted production bytes. Full speakable-surface census, the remaining cast roster, corpus rendering, protected delivery, and parity remain tracked by AUD-001 through AUD-005.
