# Lesson 0 speech-audio evidence

**Verdict:** no existing source-paired or human-recorded asset can be promoted for any of the four authored Lesson 0 input scripts. All four remain `NO-MATCH`.

This review pins the corrected authored source to `public/academy/content/lessons/lesson-zero.v1.json` SHA-256 `87de5e5a9730709f788351cf8c56eb8e66d52732f84ee08a5cee3901d129b68c`. A filename, nearby textbook track, dictionary pronunciation, browser TTS output, or semantically similar line was not treated as a match.

## Per-script result

| Input script | Required speakers and exact transcript | Result | Evidence |
| --- | --- | --- | --- |
| `input:lesson-zero-vowel-row` | Xingyu: `あ・い・う・え・お` | **NO-MATCH** | No asset path, bytes, duration, mora timecodes, speaker record, transcript verification, or rights record is bound to `audio:lesson-zero-vowel-row`. The separate script now matches the activity definition; it does not make a recording exist. |
| `input:lesson-zero-sound-hosts` | Xingyu: `はじめまして。Xingyuです。日本語を勉強しています。`<br>Mika: `Mikaです。わたしも日本語を勉強しています。よろしくお願いします。` | **NO-MATCH** | No asset path, bytes, duration, timecodes, speaker record, transcript verification, or rights record is bound to `audio:lesson-zero-sound-hosts`. No Moodle or shared-library transcript record contains this named two-speaker script. |
| `input:lesson-zero-text-hosts` | Sophie: `はじめまして。Sophieです。日本語を勉強しています。`<br>Ruparna: `Ruparnaです。わたしも日本語を勉強しています。` | **NO-MATCH** | No asset path, bytes, duration, timecodes, speaker record, transcript verification, or rights record is bound to `audio:lesson-zero-text-hosts`. No Moodle or shared-library transcript record contains this named two-speaker script. |
| `input:lesson-zero-speaking-hosts` | Aakash: `はじめまして。Aakashです。日本語を勉強しています。Samさん、これは教科書ですか。`<br>Sam: `いいえ、教科書じゃありません。プリントです。Samです。日本語を勉強しています。よろしくお願いします。`<br>Aakash: `では、あなたの番です。お名前は何ですか。`<br>Learner: microphone turn after the final Aakash cue, 12-second capture window | **NO-MATCH** | No asset path, bytes, duration, timecodes, speaker record, transcript verification, or rights record is bound to `audio:lesson-zero-speaking-hosts`. No Moodle or shared-library transcript record contains this named three-line exchange. The learner turn is now validated authored metadata, not a claim that recorded host audio or its runtime surface exists. |

`READY` therefore applies to **0/4** scripts. Nothing should be copied, renamed, spliced, uploaded, or exposed to learners as these assets yet.

## Evidence checked

- The canonical Moodle Lesson 1 archive is byte-pinned as archive `archive-000060`, SHA-256 `ac427f0012cd3a2d2f67d0f3d56c004890957fa0309984ad2dc9a803f08a9e12`, 7,158,324 bytes. Its ten members are all documents; it contains no audio. The classroom-phrases PDF is SHA-256 `1e58967eb11b2d98d9b48a2547f392db90805836d96c232f11ac487d25b687ba`, 637,319 bytes.
- The complete Moodle census contains 185 audio occurrences / 146 unique payloads. The listening-pairing artifact has only 15 machine candidates: all 15 have `transcriptStatus: none`, `rights: private-use-review-required`, and `reviewState: machine-candidate-review-required`. None is bound to a Lesson 0 input-script or audio-asset ID.
- The authorized Japanese-library ledger contains 3,801 audio occurrences / 3,785 unique audio payloads. Its media census proves bytes and technical probe data, not spoken content, speaker, transcript, or rights. A ledger-driven search across all 1,893 text, subtitle, web, and data entries found no occurrence of the unique Academy speaker names or named script pairs. Untranscribed audio was not promoted by guesswork.
- The closest Moodle Chapter 1 listening family is demonstrably different source material. Its co-located transcript/source describes a name, country, and occupation exercise with textbook names, not the six Academy classmates or the authored lines. Representative probed bytes are retained below only as rejected evidence:

| Payload SHA-256 | Bytes | Duration | Rejection |
| --- | ---: | ---: | --- |
| `b601a7681c2ff12d68f4e8bf769319b855f0570dec6a5cfb14e3ee722bed7444` | 1,254,663 | 45.880 s | Different source task/transcript; no Academy speaker identity. |
| `4fac34dc313c88ab75c802462f98f80530831faa93f3a3d0736134f24060573c` | 1,673,594 | 75.453 s | Different source task/transcript; no Academy speaker identity. |
| `7f978b633012dce1348027f806e6581c30676c3d5a65b99f3b4f8e5129d7a6d3` | 2,504,575 | 93.000 s | Different source task/transcript; no Academy speaker identity. |
| `5534e1b822942b8b3806c6555fa2c2355457ed4db3c54442525b65c337644e7f` | 577,671 | 23.980 s | Minna no Nihongo track metadata; not the authored Academy dialogue. |

- The approved runtime audio manifest contains 13 music slots and 16 SFX cues, but no lesson-speech or voice entry. Persona music and Shinday SFX are authorized for their declared purposes; neither is evidence for dialogue.

Private evidence inputs are reproducibly pinned as follows:

| Artifact | SHA-256 |
| --- | --- |
| Moodle private ledger | `7c8e6298ffcbb3ce6f80d0f0c5b0468276f632c622bcf12ccebbfb2326e86533` |
| Moodle audio census | `a6d399a3c978eb483dac9c96b1513b8e09f981e977e32fb27ac853a8e9ba47cf` |
| Moodle listening pairings | `19dcb71eaaffb2028dcb61a32199152c5866b3831e02b87ba5db181bb36329e7` |
| Japanese-library private ledger | `dc1d9b9c3f346bd00b905634242ae0421d447b437578b38dfdc80edac42c4bfc` |
| Japanese-library media census | `f4f79bde117b5828196fd9cd2fef3f231824d5078c37125169d3aa99b7192277` |
| Approved runtime audio manifest | `6abee05e24bc0d40589f73081566eafcd465c5d8059f4564f95d405106bfb1c9` |

## Definition repairs completed

- `activity:lesson-zero-vowel-listen` now binds only to `input:lesson-zero-vowel-row`; that script contains the exact ordered human speech `あ・い・う・え・お` and owns a separate blocked asset.
- `activity:lesson-zero-speaking-input` now resolves an explicit learner turn after `line:lesson-zero-speaking-aakash-cue`. The definition specifies a 12-second microphone capture window and preserves reading, pitch, English meaning, transcript, and model-answer reveal gates; the renderer and recording remain separate release proofs.
- Stable line and learner-turn IDs are validated. Dangling cue IDs, absent turns, non-positive capture windows, early support, wrong vowel order, and dialogue speakers never named canonically all fail package validation.
- All four assets remain `release-blocked`, have no `runtimeUrl`, and forbid browser TTS and learner-visible placeholders.

## Exact recording work required

Record the eight performer lines above as four original sessions. Do not substitute textbook characters or approximate phrases. The speaking session ends on Aakash's learner cue; the runtime capture window is not twelve seconds of synthetic silence baked into the recording. For each final asset, deliver:

1. one lossless master and separate lossless line stems;
2. the exact final byte length and SHA-256;
3. measured duration plus millisecond `start`/`end` timecodes for every line;
4. `speakerId`, performer/consent record, recording date, source marked `original Academy recording`, and release scope;
5. a transcript diff that proves every spoken word matches the authored Japanese, including the Latin-script names;
6. human review for natural beginner-level pace, vowel/mora timing where applicable, pronunciation, clean turns, and no clipped lead-in/out;
7. a caption/transcript reveal record and a protected-media manifest entry.

Other speech-led Lesson 0 activities (Rie's greeting, classroom instructions, repair, and close) currently have no authored `inputScriptId`/speech-asset binding in this package. They require their own exact scripts and the same evidence contract; the four assets audited here do not close that wider gap.
