# Stage 1 executable evidence

This evidence was captured from the real hosted Academy at
`http://127.0.0.1:4178/academy/` after the Reader annotation runtime injected.
It is not a fixture page. The captured Browser build revision is
`s1-15dd1d7d700f`. The isolated rebuild of the committed Stage 1 source removed
protected local Reader work and produced deploy candidate `s1-bbf9a61f26a3`.

## Automated gates

- `npm run typecheck` — passed.
- `npm run test:academy -- --run` — 20 files, 61 tests passed.
- Definitive `npm run qa` — passed: regular Reader shards, JPDB shards,
  Academy tests, builds, verify, P0 smokes, deterministic browser QA 13/13,
  docs a11y 66/66, and complexity maximum 29/30.
- Content-hash/offline, art-ledger/hash, source/augmentation, persistence,
  activity, Scene, AudioDirector, routing, placement, Yomu bridge, KanjiVG,
  Doodle, review, access, and localisation contracts are covered.

The mandatory Claude Fable reviews returned `PASS` after reading the current
diff, checking the final hosted-contrast delta, and inspecting real composed
mirror evidence. Their compact finding ledger is
[`FABLE-REVIEW.md`](FABLE-REVIEW.md).

## Browser journeys

### Fresh Lesson 0 enrollment

Query namespace: `qa-run=final-stage1-acceptance`.

1. Entered `UCL2026` and created learner `Stage One` with a private reason and
   the second approved protagonist portrait.
2. Saw Rie's fiction note and replayable `Bond ★☆☆` unlock.
3. Chose Lesson 0 and the Sound fork.
4. Answered the exact Moodle page-2 item-9 activity incorrectly with
   `わかりました`; received error-specific contrast, smaller repair, and a
   nearby example; retried with `もう一度お願いします` and passed.
5. Answered Aakash's direction incorrectly with `左`, received right/left
   repair, retried with `右`, and unlocked Aakash at `Bond ★☆☆`.
6. Recognised `一`, completed the keyboard-equivalent left-to-right production
   path, and opened the campus.
7. Rated the canonical local Yomu review `Good`; Language Lab and Cafe unlocked.
8. Verified Rie and Aakash in the class journal, reloaded, and recovered the
   same journal/profile/bond state. Console log list: empty.
9. Started Language Lab speech and returned immediately; speech was cancelled,
   the campus restored, and the console remained empty.

### Placement routes

- Manual N3: bridge -> authored N3 transfer task -> precise repair -> pass ->
  campus; reload resumed the campus without marking earlier story scenes seen.
- Mock: separate language/reading/listening evidence produced an N3
  recommendation; both an N2 learner override and an accepted N4 route reached
  their matching authored transfer activities.

### Offline and responsive contracts

- The captured active cache preceded the isolated committed-source rebuild. Its
  deploy candidate is `yomu-academy-shell-s1-bbf9a61f26a3`; the capture itself
  exercised `yomu-academy-shell-s1-15dd1d7d700f`.
- With CDP network conditions set offline, the annotated N4 transfer state
  reloaded from the service worker. The DOM retained Reader-injected
  `jpdb-reader-word`/pitch markup, the settings companion, the exact hashed app
  URL, and visible `Offline · progress will sync later` state.
- At 320×780 after annotation injection: `scrollWidth=320`; all three answer
  controls stayed between x=26 and x=294; duplicate native radio count was 0.
- At 390×844 the approved Aakash/Rie event image was an in-flow 332×186.75 px
  mobile crop and the page had no horizontal overflow.
- Tablet 1024×768 and desktop 1440×900 both matched viewport width exactly with
  no horizontal overflow.

## Screenshots

- [`annotated-n4-phone-320x780.png`](annotated-n4-phone-320x780.png)
- [`aakash-rainy-directions-phone-390x844.png`](aakash-rainy-directions-phone-390x844.png)
- [`aakash-rainy-directions-tablet-1024x768.png`](aakash-rainy-directions-tablet-1024x768.png)
- [`aakash-rainy-directions-desktop-1440x900.png`](aakash-rainy-directions-desktop-1440x900.png)
- [`offline-resume-annotated-n4.png`](offline-resume-annotated-n4.png)
- [`offline-resume-campus.png`](offline-resume-campus.png)

Current non-claims and later-stage boundaries are explicit in
[`../../STAGE-1-LIMITATIONS.md`](../../STAGE-1-LIMITATIONS.md).
