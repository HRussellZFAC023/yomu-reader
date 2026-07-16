# Academy listening crosswalk

`listening-crosswalk.v1.json` is the deterministic evidence ledger for authored Academy listening locators. The TypeScript resolver treats a locator as playable only when the manifest has a byte-verified source. It never substitutes a Moodle or Japanese-library track merely because its lesson number or duration looks similar.

## Integration

1. Call `resolveAcademyListeningLocator(authoredAudio.locator)` from the authored-week integration point.
2. For `status: "source-verified"`, pass `resolution.resource` to `createLibraryMediaRouter(...).route(...)`. The configured Worker resolver must map the opaque `resource.assetId` to the protected bytes and return an Academy-session or short-lived signed URL.
3. Before registering either Worker asset, ingest the manifest's `source.repositoryRelativePath` from the monorepo root and reject the upload unless its byte size and SHA-256 exactly match the manifest. Do not publish the source path as a browser URL.
4. For `status: "unavailable"`, render the existing unavailable state and do not invoke TTS, guess a filename, or fall back to a source-course track.

The verified Worker asset registrations are:

| Worker asset id | Source | SHA-256 |
| --- | --- | --- |
| `academy-listening-f1c2bbdb7c54893a` | `references/soya-research/audio-public/assets/audio/n5_listening_official_002.mp3` | `f1c2bbdb7c54893a6b7852082829ddb40c69c0fa543de0c74fb7a418383fdd65` |
| `academy-listening-da546db7dbceaf3ea` | `references/soya-research/audio-public/assets/audio/n5_mock1/n5_mock1_l_04.mp3` | `da546db7dbceaf3eafbe21f69767f2c954d831817fe3f3307c7deb24be12c664` |
| `academy-listening-ebaab3b679eaf07d` | `references/soya-research/audio-public/assets/audio/n5_listening_011.mp3` | `ebaab3b679eaf07d2fb1035cb7582d95e4985379235d24dea59bfa88a48db888` |
| `academy-listening-d35a4c49f74efa82` | `references/soya-research/audio-public/assets/audio/n5_listening_024.mp3` | `d35a4c49f74efa8295f0c11c077acb58e276007e3224d8f9e277fc96d63505ba` |
| `academy-listening-32c6d0a7692f3d5a` | `references/soya-research/audio-public/assets/audio/n5_mock1/n5_mock1_l_11.mp3` | `32c6d0a7692f3d5aec633c615f2c1b727deda0859e5f492fd3f444b56f029ac8` |
| `academy-listening-3cffc675cee2c613` | `references/soya-research/audio-public/assets/audio/n5_mock1/n5_mock1_l_21.mp3` | `3cffc675cee2c61361523cb028df25b4b4cf4969ac21cf87169ab12b7b133391` |
| `academy-listening-3be2ca818292e685` | `artifacts/yomu-academy/source-pipeline/payloads/3be2ca818292e685f08d8acf55b54b10b9c2853bcc5d9cb246b91abbdb158339` | `3be2ca818292e685f08d8acf55b54b10b9c2853bcc5d9cb246b91abbdb158339` |
| `academy-listening-1039d11bef7a0575` | `artifacts/yomu-academy/source-pipeline/payloads/1039d11bef7a0575c6f104f780d1b65c79e63eb50dc292ea8c39f05d241123d2` | `1039d11bef7a0575c6f104f780d1b65c79e63eb50dc292ea8c39f05d241123d2` |
| `academy-listening-612ff9f8f70e5ce4` | `artifacts/yomu-academy/source-pipeline/payloads/612ff9f8f70e5ce4ac79b3c6826e12e6b2a7c4d2ccccf5a017df7509f474c63e` | `612ff9f8f70e5ce4ac79b3c6826e12e6b2a7c4d2ccccf5a017df7509f474c63e` |

Rights and release authorization remain responsibilities of the Worker asset registry. This crosswalk proves identity and local availability; it does not grant redistribution rights.

## Stable slice contract

`l1-l18/ex-soya-n5_listening_official_002`, `l1-l18/ex-soya-n5_mock1_l_04`, `l1-l19/ex-soya-n5_mock1_l_21`, and the reviewed Moodle/Minna task families through `l2-l05` are packaged exact-task slices. Each binding records byte identity, exact source-question identity, hashes of the task/transcript and authored support, post-attempt transcript/hint gates, and deterministic grading. The public binding omits answers; lesson-owned activity models retain grading data behind the attempt gate.

The `l2-l05` B-25 slice binds only the three picture-diary items and five blanks printed on Chapter 20 listening page 1. The next separate slice binds Minna 069 to the five-question Chapter 20 conversation worksheet and its matching teacher script. B-26 and B-27 are unrelated drills and remain quarantined.

The 3A/Minna archive is the only external source marked harvest-eligible because the official publisher page labels the download free and no-registration. That access evidence does not claim redistribution permission. A filename, chapter, or lesson-number resemblance never makes a 3A track playable: it must be the exact missing track and pass the same worksheet, transcript, answer, and byte-identity checks.

`l2-l10` binds official-identical Minna 077 only to the five Mondai 2 dialogue/statement judgements spoken by the recording. Minna 076 has no Moodle/package task relationship and remains inventory-only. B-34, B-35, and the repeated Minna 075 package member require their own independent task claims.

`l2-l12` binds Track 78 only to worksheet Section II and Track 79 only to Section III part (2). The Track 79 worksheet explicitly says to skip audio section (1); the packaged activity therefore assesses only the three pictured beneficiary arrows and `〜てもらう` phrases. A-9 and A-10 remain quarantined folder-level repeats.
