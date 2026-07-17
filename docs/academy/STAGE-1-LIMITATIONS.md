# Stage 1 limitations

Stage 1 is an enrollment vertical slice, not an Academy release. The browser
evidence proves the architecture and first 20-minute loop on the local hosted
build. These boundaries remain explicit until their production stages close.

## Access and sync

- `<PRIVATE_CLASS_INVITE>` is accepted only by the localhost QA fallback today.
- A non-localhost build calls `/academy/api/session`; no production Worker route
  is deployed yet, so live invite access remains a Stage 7 gate.
- Learner Events and checkpoints persist locally and resume offline. Cross-device
  sync, expiry/revocation smoke, R2 authorization, and merge are not implemented.

## Assessment and learning media

- The three-item orientation mock demonstrates separate language, reading,
  listening, speaking-confidence, and writing-confidence evidence. Its UI says
  explicitly that it is not a calibrated JLPT score.
- Placement and Language Lab listening currently use the browser's Japanese
  speech voice through `AudioDirector`; they are not source listening recordings.
- `00:00–00:02` is a descriptive cue range for the synthetic line, not a media
  timecode synchronized to a source file.
- Shadowing is a replay-and-self-assessment event. Stage 1 does not record the
  microphone or provide listen-back, waveform, or pitch scoring.
- The release-safe audio catalogue is intentional silence. Cleared music,
  ambience, SFX, and paired course audio remain Stage 6 work.

## Content and art coverage

- Exactly one Moodle Source Question is audited and playable: Level 1 Lesson 1,
  page 2, printed item 9. The full document question count is not yet claimed.
- The five band-entry tasks, Aakash direction beat, Kanji desk, and shadowing are
  original vertical-slice activities, not Moodle coverage.
- Rie, four protagonist choices, six location plates, and the approved rainy
  directions CG have explicit runtime ledger entries and hashes. A standalone
  Aakash sprite is deliberately withheld until the neutral likeness gate passes.
- The remaining 35 unauthored Weeks, complete source/media census, N3–N1 banks,
  full cast, story, and art production remain open in Stages 2–5.
