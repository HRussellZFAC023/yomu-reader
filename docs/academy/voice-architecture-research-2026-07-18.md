# Memo: How to get 20+ super-realistic, pitch-correct character voices for Yomu Academy

## 1. How jiten / the "ASMR site" actually did it

Short answer: **not** with a magic realistic cloud TTS, and **not** the way the reference repo you pointed at works. Two different things got conflated, so let me separate them.

**(a) The repo you cited (friedrich-de/yomitan-ultimate-audio) is architecturally your stack — not custom voices.** It's a self-deployable Cloudflare Worker + R2 bucket + D1 pitch DB (`entry_and_pitch_db.sql`) with **AWS Polly as the pitch-accent-aware TTS fallback**, layered over a large corpus of *human-recorded* audio (~877,464 entries: NHK, Forvo, jpod101, etc.). It does no neural cloning at all. Its "custom voices" are collected human recordings; Polly only fills gaps. So it is literally the same Worker+R2+D1+Polly shape you already built — it is not the source of realistic character voices. (https://github.com/friedrich-de/yomitan-ultimate-audio ; https://animecards.site/yomitan_audio/)

**(b) The distinct/ASMR voices you saw are almost certainly per-character fine-tunes of an open, Japanese-native model — specifically Style-Bert-VITS2 JP-Extra (SBV2JE).** This is the community-standard recipe for a large distinct cast: train one small model per character on 10–15 min of that character's audio, render offline. Public proof this is exactly how "ASMR" voices get made: `RikkaBotan/style_bert_vits2_jp_extra_asmr_original` on HuggingFace is a JP-Extra ASMR fine-tune, CC-BY-SA-4.0, free for commercial use of the generated audio. (https://huggingface.co/RikkaBotan/style_bert_vits2_jp_extra_asmr_original)

**Confidence flag:** I could **not** verify jiten.moe's or jpdb's exact pipeline from any primary source — jiten publishes no voice-methodology page, jpdb publishes nothing, and Reddit/HN were blocked/rate-limited to the crawler. The "ASMR one" is most likely jpdb.io (its single soft close-mic voice is routinely called ASMR-like in the immersion community), but **treat both the jpdb attribution and the SBV2JE-for-jiten attribution as strong inference, not confirmed fact.** What *is* verified is the ecosystem pattern: distinctness comes from N separate fine-tuned models, never from prompting one stock cloud voice.

## 2. The honest state of what we built

Your skepticism about Azure is correct, and the research confirms it precisely:

- **Azure ships ~11–15 stock ja-JP voices** (7 standard neural: Nanami/Keita/Aoi/Daichi/Mayu/Naoki/Shiori, plus Masaru multilingual and DragonHD variants). Reusing those across 24 named speakers makes most of the cast sound identical. Azure Custom Neural Voice *can* train a bespoke voice, but it's registration-gated Limited Access, requires documented voice-talent consent, and is enterprise-priced — so it doesn't rescue the plan. (https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support ; https://learn.microsoft.com/en-us/azure/ai-services/speech-service/custom-neural-voice) **Stock cloud TTS cannot field 20+ distinct realistic characters. You were right.**

- **The part you got genuinely right is the pitch-correct drill path** — but with one correction to the stack note. `x-amazon-pron-kana` is an **Amazon Polly** feature, not Azure. Azure's ja-JP `<phoneme>` set is katakana-only with **no documented downstep/accent-nucleus notation** (unlike zh/vi/th, which document tone markers). So on your "Azure→Polly→MeloTTS" ladder, **only the Polly rung can actually force 箸=ハ'シ vs 橋=はし'.** Polly's mechanism is real and verified: apostrophe = pitch fall, no apostrophe = heiban, max one accent per prosodic word, e.g. `マイニチシ'ンブン` for 毎日新聞 — drivable straight from a Kanjium accent number. (https://aws.amazon.com/blogs/machine-learning/optimizing-japanese-text-to-speech-with-amazon-polly/ ; https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-ssml-phonetic-sets)

Net: mid realism, prosody-only distinctness, **but the pitch correctness for imitation audio is sound as long as it routes through Polly, not Azure.**

## 3. The key reframe (this dissolves the tension)

**Your 323 story lines are fixed, pre-scripted text. Real-time synthesis is only needed for arbitrary user vocab lookups. These two jobs have opposite requirements and should use different engines.**

Once you accept that, the "gorgeous vs. correct vs. expensive" trilemma mostly evaporates:

- **323 lines is a trivial offline batch** — single-digit minutes of GPU, well under ~$2 of rented A100/4090 time (or free locally; a 4090 at ~$0.14–0.39/hr on Vast.ai is ample). (https://www.runpod.io/pricing ; https://vast.ai/pricing) You can spend a heavy, slow, per-character model here that would be far too expensive on a hot path, render once, pitch-QA it, encode Opus, and serve static files from R2.
- **Only unbounded live vocab lookups need real-time synthesis**, and those are exactly the case where you can't hand-tune — so they stay on the cheap, cacheable, deterministic Polly path.

The distinct-realistic-voices goal and the pitch-correctness goal stop competing because they land on different engines for different content.

## 4. The recommendation — a split architecture

### (a) Distinct, realistic STORY voices (the 323 fixed lines)
**Primary pick: Style-Bert-VITS2 JP-Extra (SBV2JE), one fine-tune per character, rendered offline.**
- Japanese-native, near-human: MOS **4.37±0.74 vs 4.38±0.77 human ground truth** (p≈0.91, no significant difference), from ~10–15 min of per-character audio; the paper explicitly names **language learning** as a target use. (https://arxiv.org/html/2505.17320v1)
- Crucially it is **not** a black-box clone: pitch accent is fed as a separate per-phoneme 0/1 "tones" tensor with manual pitch-accent adjustment — so you can hand-correct the load-bearing words. This is the one engine that gives you realism *and* accent control. (https://github.com/litagin02/Style-Bert-VITS2/blob/master/docs/Style-Bert-VITS2_en.md)

**Easier variant / recommended on-ramp: AivisSpeech** — a VOICEVOX-style editor that wraps SBV2 / JP-Extra models, self-hostable, with mora-level pitch editing in a GUI/API. Its default model license **ACML-1.0** (and CC0 models) permits commercial use with credit optional. (https://github.com/Aivis-Project/AivisSpeech ; https://github.com/Aivis-Project/ACML/blob/master/ACML-1.0.md) *Caveat: ACML-1.0 still forbids impersonation/passing audio off as official — not unconditional.*

**The legally clean path to voice data — this is the load-bearing constraint, not the engine license.** The real liability is *whose voice you clone*, and Japan is actively litigating this: the Nippairen-led voice-actor coalition's Nov-2024 demands, the NOMORE無断生成AI coalition (Oct 2024), and Kenjiro Tsuda's Nov-2025 Tokyo District Court suit (Japan's first major AI-voice-cloning case) all point one way. (https://www.nippairen.com/jaunews/post-30487.html ; https://nomore-mudan.com/ ; https://www.japantimes.co.jp/news/2026/05/26/japan/crime-legal/ai-voice-use-lawsuit-tokyo/) So, in priority order:
1. **License-clean stock SBV2/AivisSpeech models (ACML-1.0 / CC0)** for minor/background cast — zero recording cost, ship today.
2. **Commission a handful of voice actors** for your hero cast, with a written synthesis/cloning buyout in the contract, then fine-tune SBV2JE per character → fully owned, distinct, realistic.
3. For extra *original synthetic* personas tied to no real person: **MOSS-VoiceGenerator** (Apache-2.0, designs voices from a text prompt, no source speaker to clear — the cleanest license in the set) or **ElevenLabs Voice Design** (paid plans grant output ownership; but multilingual/non-native and no pitch control, so accent-gate every line). (https://github.com/OpenMOSS/MOSS-TTS ; https://elevenlabs.io/vla)

**Do NOT** clone anime/seiyuu or any real identifiable voice for a shipped product. That is the one move that turns this into a lawsuit. **Avoid GPT-SoVITS for story content too** — its Japanese g2p runs *without accent marks*, so it hallucinates pitch (unfit for anything a learner imitates), and its cloning power is precisely the legal hazard. (https://medium.com/axinc-ai/gpt-sovits-a-zero-shot-speech-synthesis-model-with-customizable-fine-tuning-e4c72cd75d87)

**AGPL note:** SBV2 is AGPL-3.0. An **offline batch job that emits static audio files does not distribute the engine**, so the copyleft stays contained — keep it a build-time renderer, not a linked network service, and you're fine.

**Verification gate (mandatory for a learning app):** because no neural model *guarantees* accent, run each of the 323 rendered lines through an accent check before caching — either PASQA (LY Corp's open pitch-accent quality scorer, github.com/lycorp-jp/PASQA) or, cheaper, compute expected accent via `pyopenjtalk_prosody` and compare the f0 contour; hand-fix only the flagged minimal-pair words (箸/橋, 雨/飴). (https://arxiv.org/pdf/2606.20137)

### (b) Pitch-correct learner-imitation audio (live vocab lookups)
**Keep your existing pipeline — but relabel it: AWS Polly (`x-amazon-pron-kana`) + Kanjium D1, cached to R2.** This is the only path that is pitch-accent-correct *by construction*, and it's exactly what the reference repo does. It's cheap ($16/1M chars neural, cents for real volume once R2-cached) and the accent comes from *your* data, not the model's guess. Demote Azure to a realism/uptime fallback rung; it is **not** the accent rung. (https://aws.amazon.com/polly/pricing/)

### Rough cost + effort
- **Story voices:** GPU ~$0–2 one-time. Main cost is a few VA commissions (only for hero characters) + fine-tune/QA labor. Minor cast can be $0 via CC0/ACML models. Effort: 1–2 weeks to a full voiced story once the pipeline exists.
- **Drill audio:** essentially already built; near-zero marginal cost with R2 caching.

### Rejected, for the record
ElevenLabs v3 / MiniMax / Google Chirp3-HD (realistic but no mora accent control, and Chirp3-HD SSML support is partial), Fish/OpenAudio & F5-TTS & XTTS (non-commercial weights — XTTS is a dead end since Coqui shut down), Kokoro (only 5 fixed JA voices), VOICEVOX as the cast (per-character license audit: Zundamon needs credit or ¥400k/character). (https://docs.cloud.google.com/text-to-speech/docs/chirp3-hd ; https://minbdevice.com/voicevox-license/)

## 5. Concrete next steps (say yes and I'll start here, in order)

1. **Fix the stack labeling + verify routing.** Confirm live vocab lookups actually hit the **Polly** `x-amazon-pron-kana` rung (not Azure) for accent, and correct the memory/stack note that conflates the two. Low-risk, high-value, do first.
2. **Split the cast list** into hero characters (bespoke fine-tune worth commissioning) vs. minor/background (use license-clean ACML-1.0/CC0 SBV2 models). You tell me the split; I draft the mapping.
3. **Stand up a 3-voice pilot.** Install AivisSpeech / SBV2JE locally, render ~10 story lines across 3 distinct voices, and run the pitch-QA gate on the minimal pairs so you can *hear* realism + verify accent before committing to the whole cast.
4. **Build the offline batch renderer:** SBV2JE → PASQA/f0 accent check → `ffmpeg` libopus → R2, keyed by `lineId × speaker`. Re-runnable, static output, AGPL-contained.
5. **Prepare the legal clean-room:** draft the VA commission clause (synthesis/cloning buyout) for hero voices, and a per-character license ledger for any stock models used, so shipping is documented.

**Still uncertain (flagged honestly):** jiten's/jpdb's exact engine is unverified inference; the "800h JP pretraining" and exact tone-bit encoding for SBV2JE weren't confirmable from the paper abstract (the MOS numbers and accent-control claim *are*); and each stock SBV2/AivisSpeech model's individual license must be checked at build time before it goes in the product.