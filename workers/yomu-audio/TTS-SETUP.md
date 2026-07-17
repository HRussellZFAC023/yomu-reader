# yomu-audio: pitch-aware TTS + character voices

Architecture per [yomitan-ultimate-audio](https://github.com/friedrich-de/yomitan-ultimate-audio)
(CF Worker + R2 + D1 + Polly neural ja-JP, `x-amazon-pron-kana` pitch phonemes),
extended with a per-character VOICE_REGISTRY (src/tts.ts) and a Workers AI
MeloTTS fallback engine so audio works without AWS credentials.

## Endpoints
- `GET /audio/tts?term=&reading=&voice=Tomoko|Kazuha|Takumi` — word audio.
  Engine polly: D1 pitch → SSML phoneme → neural voice; headers
  `x-yomu-tts-engine`, `x-yomu-tts-pitch: accented|ruby|plain`.
  Engine melotts (no AWS creds): natural ja, no accent control.
  R2-cached `tts/<voice|melotts>/<sha256>.mp3` — synthesis billed once.
- `GET /voice/line?text=&speaker=rie|sophie|henry|…` — story dialogue in the
  speaker's voice (+ subtle prosody per character). `Bearer VOICE_ADMIN_TOKEN`.
  Cached `voice/<speaker|melotts>/<sha256>.mp3`.
- `/status` reports `"tts": "enabled"|"disabled"`.

## Data
- `migrations/0001_pitch_accents.sql` — schema (compatible with
  yomitan-ultimate-audio's `entry_and_pitch_db.sql`, so their full recordings
  DB imports directly later; recordings would then outrank TTS).
- `node ../../scripts/build-pitch-accents-sql.mjs` — Kanjium → pron-kana SQL
  (mora-aware; self-test with --self-test).

## Enabling Polly (the only owner-gated step)
The machine has no personal AWS credentials (only Zühlke work SSO profiles,
which must not be used for this). Create a personal IAM user scoped to
`polly:SynthesizeSpeech`, then:
```sh
npx wrangler secret put AWS_ACCESS_KEY_ID
npx wrangler secret put AWS_SECRET_ACCESS_KEY
# set AWS_POLLY_ENABLED to "true" in wrangler.jsonc vars
npx wrangler deploy
```
Costs: neural is $16/1M chars, billed only on R2 cache miss; the current
Academy dialogue corpus is cents. Until then MeloTTS serves everything.

## Story voicing
```sh
VOICE_ADMIN_TOKEN=... node scripts/generate-academy-voice-lines.mjs
# manifest → public/academy/audio/voice-lines.json
```

## Academy integration (next)
- Point the Academy pronunciation provider at `/audio/tts` (speaking
  character's voice) instead of browser speechSynthesis — fixes the
  zero-voices-in-quiet-environments QA failure and makes kana drills,
  placement listening, and 語学ラボ pitch-accurate.
- AudioDirector resolves beats via voice-lines.json and plays on the speech
  bus (ducking already handled).
