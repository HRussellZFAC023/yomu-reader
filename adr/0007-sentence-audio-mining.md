# Sentence audio belongs to the saved sentence

Reconsidered 18 September 2026. The former capture proposal is withdrawn. Separate word and sentence audio remains the decision; capture implementation is open.

Word pronunciation and sentence recordings must retain their identity when saved or exported. Anki note types with separate fields receive matching audio; a single audio field can receive both. Current evidence is in `src/reader/anki/media-files.ts`, `field-mapping.ts` and `tests/reader/anki-sentence-audio-field-role.test.ts`.

The local Yomu deck still has no sentence-media reference (`src/reader/srs/local-yomu-deck.ts`). Microphone recording in Study, subtitles and Academy does not establish capture of a video's original audio. Anki field support does not complete sentence-audio mining.

## Requirements for the replacement

- A clip identifies its sentence, source and timing. Generated speech is labelled as generated, never presented as the original recording.
- Local collection and playback work without an account. Failed optional sync cannot discard the only local copy.
- Capture is an explicit learner action. Cancellation or failure restores playback, releases capture resources and does not save silence as success.
- Chromium, Firefox, WebKit and userscript capabilities need separate proof. A Chrome design is not a cross-browser implementation.
- Unsupported or protected media fails clearly without bypassing protection or silently substituting speech synthesis.
- Native-deck playback, Anki export, reload, offline use, quota handling and deletion need end-to-end evidence.

## Decisions not carried forward

The historical competitor teardown remains in Git as research, not a specification or permission to copy code. Its payload measurements, capture topology, quotas and speed-up estimates do not establish Yomu's requirements or performance. Neither native encoding nor a proposed TTS provider is assumed to work everywhere. API choice, storage budget, timing and hosted-media delivery require measured prototypes.

Keep capture code and large media out of ordinary-page startup. This does not mandate the old companion layout or preserve obsolete compatibility paths.
