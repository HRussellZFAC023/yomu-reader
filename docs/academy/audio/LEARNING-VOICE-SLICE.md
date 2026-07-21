# Academy learning voice repair

This recovered pilot reviews four Yomu-authored Japanese candidates. It accepts one voice unit with one reachable binding and rejects three takes. It does not close BASE-020 or AUD-008, and it makes no deployment claim.

## Disposition

- `miller-cafe-price` is accepted by Codex with `humanReviewed: false`. Whisper and Vosk independently recover the critical price `三百円` after numeric normalization.
- `rie-lesson-zero-repeat` is rejected. Whisper recovers the full phrase, but Vosk recovers `もう一度は願いします`; the particle insertion and polite-morpheme mismatch are a hard failure for this short pedagogical phrase.
- `lesson-textbook-pair-prompt` is rejected. Independent waveform review recovered `コページ` and `後ページ` instead of the critical numeral `五ページ`.
- `mary-cafe-order` is rejected. One independent waveform review recovered `お狙いします` instead of the critical polite morpheme `お願いします`.

Rejected bytes are absent from `public/academy/audio/` and from the runtime catalog. Their query, model, review, and former output fingerprints remain in non-public evidence so the rejection is auditable. Runtime misses continue through the worker/browser fallback ladder.

## Provenance

`learning-voice-production.json` is the candidate contract. It binds every line to source text and revision, runtime bindings, exact model distribution filename/byte length/SHA-256, model and style IDs, ACML-1.0, engine version-response hash, complete query controls, canonical query hash, and deterministic cache key.

`learning-voice-model-evidence.json` is generated from the exact installed `.aivmx` bytes and embedded manifests/licence. Hub URLs are discovery records only, never byte authority. `learning-voice-query-evidence.json` retains all four canonical query payloads and separates accepted assets from rejected fingerprints. A fresh staging render reports byte equality for accepted output or fails with drift; it never replaces accepted bytes.

`learning-voice-acceptance.json`, `learning-voice-local-expected.json`, and `learning-voice-locks.json` are immutable expected evidence. Their normal commands verify without writing. Intentional refresh requires the explicit `:write` command after source changes and a deterministic Academy build.

## Proof Order

From a clean checkout, install first, build once, then run read-only proof:

```text
npm ci
YOMU_SYNC_ACADEMY_FORCE=1 npm run build:academy
npm run academy:learning-voice:verify-built
npm run docs:build
```

The local browser proof serves `docs/public/academy/`, compares response content hashes and built bundle bytes to committed expectations, exercises every accepted binding, and writes observed output only under `qa-artifacts/academy-learning-voice/`.

`npm run academy:learning-voice:production-proof -- --dry-check` validates the pending production capability contract without network access or mutation. A later integration lane must deploy and then run live proof with `--base-url https://...`; that mode verifies response hashes, decode and natural playback completion, cancellation, service-worker control, cache/offline replay, Chromium desktop, mobile WebKit, and serious/critical axe findings. Until that release and live run happen, `learning-voice-production-proof.json` remains `pending` and BASE-020/AUD-008 remain unchecked.
