# Academy Asset Ledger Report

Snapshot: 2026-07-15. This report is derived deterministically from `ASSET-CARRYOVER.json`.

## Scope and method

- Hash-deduplicated Academy media from the current repository and 0 release worktrees.
- Included current and historical `public/academy/**` plus generated docs mirrors; excluded evidence screenshots, third-party reference apps, Downloads, and external generated-image stores.
- Persona-like categories may inform the vocabulary for scene, character, prop, interaction, animation, SFX, ambience, and music slots. No Persona art or audio was copied or scanned.
- `public/academy/art/ASSET-USAGE.json` remains the separate runtime authorization ledger. Recovery records do not authorize runtime binding.

## Inventory

1203 unique payloads across 11682 physical occurrences (1043434389 unique bytes).

| File type | Payloads |
| --- | ---: |
| audio | 185 |
| raster | 1015 |
| vector | 3 |

| Quality verdict | Payloads |
| --- | ---: |
| approved-licensed-data | 3 |
| current-runtime-ledgered | 72 |
| rejected-production-derivative | 16 |
| rejected-wrong-style | 488 |
| review-likeness | 37 |
| review-required | 223 |
| rights-review-required | 185 |
| verified-manifest-reviewed | 104 |
| verified-quality-carryover | 75 |

| Orphan state | Payloads |
| --- | ---: |
| current-runtime | 105 |
| historical-runtime-only | 102 |
| never-runtime-referenced | 480 |
| recovered-archive-only | 48 |
| rejected-reference-only | 468 |

Format coverage explicitly includes GIF/APNG/frame animation and audio slots: GIF=0, APNG=0, MP3=177, OGG=3, WAV=0, FLAC=0, M4A=0, video MP4/WebM=0. Zero means no file was found in the bounded worktree scope.

Semantic slot coverage: frame/animation=0, UI SFX=3, lesson/listening audio=176, ambience=0, music=0.

## Recovery

Preserved 66 historical payloads (16567195 bytes) in `docs/academy/recovery/recovered-assets/`; 48 remain non-runtime-only and 18 now also exist in current delivery. Every archive copy matches its historical manifest SHA-256 and the archive path itself remains outside runtime delivery.

- Included: direct-OpenAI, manifest-reviewed responsive background derivatives and lesson illustrations absent from the current payload set.
- Excluded from byte recovery: source masters, contact sheets, cinematic likeness art, character sprites, audio, Pollinations/Python output, and unknown-rights material.
- Recovery destinations and source-manifest evidence are recorded per hash in the JSON ledger.

## Runtime and quality gates

- Current runtime use requires an explicit current ledger/reference; physical presence alone is not authorization.
- Historical-only and never-referenced payloads remain visible as orphan states rather than being silently promoted.
- Human likeness, geography, worksheet/source fidelity, responsive composition, rights, and accessibility gates survive recovery.
- Soya/source-course audio and historical UI sounds are inventoried but not copied because their release rights are not established here.

## Speculative gaps

- **high / character-sprite:** Owner-approved neutral anchors followed by happy, thinking, concerned, speaking, listening, seated, and action variants. Dialogue expression and pose changes; likeness approval precedes generation. Candidate homes: dialogue:*, journal:*-expression-gallery, scene:*.
- **medium / gif-or-frame-animation:** Optional blink, page-turn, radio-tune, and transition frame sequences in an approved Academy style. Subtle authored motion; static fallbacks remain valid. Candidate homes: dialogue:*, activity:listening-shadowing, scene:*.
- **medium / sfx-ambience-music:** Rights-cleared semantic UI SFX, room/rain ambience, and location/event theme slots. AudioDirector-style feedback and atmosphere; silence remains valid. Candidate homes: activity:*, location:*, scene:*.
- **high / prop-and-ui-art:** Original door, card, ticket, notebook, radio, camera, map-marker, and feedback-item states. Diegetic activity affordances without copying third-party game UI. Candidate homes: reward:*, activity:*, scene:*.
- **high / background:** Wide/mobile and authored time-weather companions for approved places that lack a complete responsive pair. Responsive scene continuity; not a runtime requirement until a scene owner binds it. Candidate homes: location:home, location:cafe, location:classroom.

## Validation and ownership

Run `node scripts/academy-asset-ledger.mjs validate`. It checks schema, canonical ordering, counts, unique hashes, current/recovered bytes, optional donor bytes when available, the recovery allowlist, and this report's exact derivation. It does not require old worktrees in CI.

Runtime promotion remains separate and explicit: `src/academy/assets.ts` names each authorized asset and runtime home, while `public/academy/art/ASSET-USAGE.json` authorizes exact delivery hashes. No archived file becomes runtime merely by appearing in this report.
