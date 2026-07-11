---
title: "claude-production-v3 — runtime homes & usage"
status: "guidance for wiring (no runtime edits made by this delivery)"
date: "2026-07-11"
---

# Runtime homes & usage

Every v3 asset has a planned home in the shipped Academy runtime. This delivery
does **not** edit runtime or CSS — the mapping below is the wiring guidance a
follow-up runtime change would use. Paths are relative to `public/academy/art/`
(the app loads art from `./art/...`). v3 assets live under
`claude-production-v3/…`; today the runtime points at other paths (noted per row).

## Characters — busts (dialogue portraits, roster, study-link)

| v3 asset | Runtime consumer | Current source it upgrades |
| --- | --- | --- |
| `characters/<id>/<id>__bust__<expr>.webp` (1024×1536) | `src/academy/vn.ts` scene portrait (`[data-vn-portrait]`, currently `avatarSvg(...)` at `vn.ts:122`) | SVG avatar (`art.ts` `avatarSvg`) |
| `characters/rie/rie__bust__neutral.webp` | onboarding Rie portrait (`app.ts:444`, `.academy-rie-portrait`) | `art/characters/rie-sensei.webp` |
| `characters/<id>/<id>__bust__neutral.webp` | roster / study-link cards | SVG avatar chips |

Expression variants (`__bust__happy`, `__thinking`, … `__listening`) feed the VN
expression swap: a beat sets the speaker + expression, the stage shows the matching
bust. Preserves face geometry across expressions because all are composed from one
locked identity descriptor.

## Characters — half-body sprites (VN stage)

| v3 asset | Runtime consumer | Current source it upgrades |
| --- | --- | --- |
| `characters/<id>/<id>__sprite__neutral__halfbody.png` (transparent, h≈1600) | VN stage speaker (left/right) + campus speaker (`app.ts:561`, `.academy-campus-speaker`) | `art/characters/production/rie/rie__sprite__neutral-welcome__halfbody__v001.png` |
| `characters/rie/rie__sprite__<expr>__halfbody.png` | Rie stage expression beats | — |

Transparent PNG with clean alpha → composites over any environment plate. The
Visual Bible's "empty plate + one transparent sprite; one identity per frame" rule
is satisfied: use a `environments/` plate as the stage and one `__sprite__` on top.

## Environments (scene backgrounds)

| v3 asset | Runtime consumer | Current source it upgrades |
| --- | --- | --- |
| `environments/<loc>/<state>-wide.webp` (1600×900) | `app.ts` environment map (e.g. `app.ts:1364` `environments/classroom/evening-lamplit-wide.webp`) | `art/environments/<loc>/<state>-wide.webp` |
| `environments/<loc>/<state>-mobile.webp` (900×1125) | `app.ts` mobile companion (`toMobile()` swap, `app.ts:1398`) | `art/environments/<loc>/<state>-mobile.webp` |

`<loc>` ∈ classroom, quad, library, language-lab, kanji-garden, cafe, ramen, pub,
station, street, home, work, japan-street, japan-temple, japan-ryokan,
japan-shinkansen. `<state>` ∈ morning, afternoon, evening, rain, special. Wide and
mobile are separately authored (not crops), each keeping the focal landmark.

## Events / lesson CGs

| v3 asset | Runtime consumer | Current source it upgrades |
| --- | --- | --- |
| `events/<id>/<id>-wide.webp` (1600×900) + `-mobile.webp` | `app.ts` key-scene images (e.g. `app.ts:164` `art/key-scenes/lesson-09-planning-v1.jpg`) | `art/key-scenes/lesson-09-*.jpg` |

Story CGs are baked full scenes (the Visual Bible allows a character-bearing CG so
long as it is **not** combined with another portrait/sprite of the same character).
Use these for lesson intro beats and chapter set-pieces.

## Props / food / objects / kanji imagery

| v3 asset | Runtime consumer | Current source it upgrades |
| --- | --- | --- |
| `props/<id>.png` (transparent) | `src/academy/art.ts` `itemArtSvg` item art; study rewards; scene props; inline lesson imagery | SVG `itemArtSvg` |

Recurring story props (coral route card, moss thermos, cobalt door tag, pinned
blank card, yellow umbrella, red bookmark thread, hana-maru stamp) double as
continuity motifs across scenes.

## Protagonist

| v3 asset | Runtime consumer |
| --- | --- |
| `protagonist/protagonist-<a..d>__bust.webp` | onboarding player-character portrait **choice** — offer the four as selectable avatars in the intro; the chosen one becomes the learner's dialogue portrait. |

## Wiring order (suggested)

1. Environments first (drop-in path parity with `app.ts` env map → lowest risk).
2. Rie onboarding bust + campus/VN half-body sprite (removes the audited duplicate-Rie
   and framed-room-portrait findings).
3. Roster/dialogue busts to replace SVG avatars in `vn.ts`.
4. Event CGs for lesson intros (replace the two reused `lesson-09-*` JPGs).
5. Props for item art; protagonist portraits for onboarding.
