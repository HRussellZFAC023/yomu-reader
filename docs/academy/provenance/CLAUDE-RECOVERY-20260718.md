# Claude recovery handoff

This record preserves the useful output from the interrupted Claude sessions without committing private raw transcripts. The compressed transcripts remain beside the project under the ignored `docs/academy/provenance/private/` directory.

## Source sessions

| Session | Local archive | SHA-256 |
| --- | --- | --- |
| Story, character, loader, and voice | `private/claude-story-voice-72aa7dba.jsonl.gz` | `265361a38257bb795b9c94a0983cf8c77717659ccab097c88a8af9102b5d2dee` |
| Spirit integration and art recovery | `private/claude-spirit-art-ba544dcb.jsonl.gz` | `a97faf76cab1aef3f57318c0b3c5078c62595582a635c7b6d2bcbb39d095be30` |

The original Claude session IDs are `72aa7dba-555d-4b0b-8566-d78752df2f7f` and `ba544dcb-e7b2-420b-96b4-2b3d26dfe6b9`. The archives are provenance, not runtime inputs.

## Recovered and integrated

- All 24 Season 3 and Season 4 `story-package.v2` files were recovered from Claude scratch output, passed `scripts/validate-story-package.mjs` with zero warnings, and now live in `src/academy/content/story-sources/`.
- The generic story compiler and catalog now expose the complete 48-chapter canon. Chapters with unfinished lesson packages remain playable as story and show an honest practice-pending state instead of a broken action.
- The 24 character dossiers, `CHARACTER-INTEGRATION.md`, four-season canon corrections, and tone/humanize contract already landed through the recorded main-branch commits.
- Four AivisSpeech/Style-Bert-VITS2 pilot lines were recovered as Opus assets in `public/academy/audio/story-pilot/`; their exact source text is hash-locked in `docs/academy/audio/voice-line-locks.json`.
- The recovered cast mapping, sourcing results, renderer, and deterministic production manifest are in `docs/academy/audio/` and `scripts/academy-voice/`. The current manifest covers 1,464 story variants and 323 UI/system lines.
- Claude's presentation and asset-binding drafts were recovered into `PRESENTATION-BINDING.json` and `ASSET-INTEGRATION-MAP.json`. Existing images are provisionally usable until the owner's grader JSON supplies per-file verdicts; no candidate is deleted during reconciliation.

## Verified current truth

- Story catalog and story-screen tests: 20/20 passing.
- Opening-story tests: 12/12 passing.
- Daily learning-loop tests: 19/19 passing.
- Voice locks: 4 current, 0 stale, 4 pilot-rendered.
- Voice-model gaps: 7 existing cast mappings plus the textbook-character and dedicated UI/narrator roster still need assignment and listening review.

## Interrupted work still to complete

- `wf_874a1fc6-6d8`: the E2E-seams workflow produced evidence but no final `E2E-SEAMS-SPEC.md`; lesson-to-story launch and return must be proved in the live app.
- `wf_814a9162-bc3`: presentation and asset maps survived, but the chronological n+1 audit and Chapter 25-48 asset binding were incomplete.
- `wf_53b20e42-aa8`: the direction-steer screenshots survived, but no final synthesis memo was produced.
- Seasons 1-3 still need the promised line-by-line tone/naturalness acceptance pass before large-scale voice rendering. Season 4 was authored against the tone checklist but still receives the same final listening gate.
- Full voice production needs model completion, textbook/UI voice casting, per-line pitch and pause review, cache-safe rendering, and runtime binding.

## Preservation rule

Recover additively. Keep the original candidate art, story packages, pilot audio, source hashes, and grader history. A rejected runtime binding is not permission to delete the underlying work.
