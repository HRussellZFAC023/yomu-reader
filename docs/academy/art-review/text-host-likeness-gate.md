# Text mission host likeness gate

**Reviewed:** 2026-07-13
**Characters:** Sophie, Ruparna
**Verdict:** generation blocked pending an owner-confirmed reference mapping

## Result

No Sophie or Ruparna sprite was generated. The preserved evidence describes both people, but does not identify either person by position in a class photo. Producing a face from the written description alone would create an invented likeness.

| Character | Likeness confidence | Decision |
| --- | --- | --- |
| Sophie | low | Blocked. Two different unassigned people fit the available lock: East-Asian woman, long dark hair, no glasses. |
| Ruparna | very low | Blocked. One distant person may fit the South-Asian/long-dark-hair lock, but the face is small and has no corroborating repeat. |

The evidence board is [text-host-likeness-gate.png](../evidence/direction-reset/text-host-likeness-gate.png). Faces are labelled as unassigned clusters, not character names.

## Evidence inspected

- `class-group-01.webp` through `class-group-06.webp` under the preserved donor reference directory.
- `public/academy/art/codex-production-v2/sprites/source-map.json` in the donor tree. This supplies written identity and wardrobe locks, but no photo coordinates or source-image mapping.
- `docs/academy/discovery/CHARACTER-ASSET-DOSSIER.md` and `NARRATIVE-AND-CAST.md`.
- Approved Rie and Aakash cutouts plus the campus/world anchors for scale and style calibration. They were not used to infer identity.

Rejected Flux/Python sprite families were not treated as likeness evidence.

## What would unblock generation

One of the following for each person:

1. an owner statement mapping the person to an unassigned cluster on the evidence board; or
2. one dedicated approved reference crop with the person's first name.

After that confirmation, generate exactly one neutral half-body candidate per person using the built-in OpenAI image tool, a removable flat chroma background, equal scale and lighting, and the locked warm pixel-painted anime realism. Expression production remains gated on owner review of those neutral candidates.

## Privacy boundary

No chat history, phone number, surname, employer, or other private record was used. The review used only the six preserved class photos and the already-approved discovery dossiers.
