# Yomu Academy — Reference Map (coded photos → cast)

Purpose: map the coded likeness-reference photos in the private evidence dossier to
named Academy cast members, so an approved person's real references can be fed into
generation. Owner has authorized likeness-reference use for all cast.

**Headline finding — read first.** The dossier does **not** contain a general
code → person mapping. Its 211 coded photos are deliberately de-identified, and the
private brief + ledger explicitly forbid inferring identity from photo content,
proximity to a name, nationality, or resemblance to an existing sprite. Only **two**
cast members are named as research targets anywhere in the dossier (Nanako and
Karen/Mira), and of those only **Nanako** has candidate reference photos physically
present in the folder. Every other cast member is **no-ref** within this dossier —
their art derives from fictional design references / text briefs, not from these
photos (see `REFERENCE-INVENTORY.md`).

## Privacy / provenance

- This file references **gitignored private artifacts** under
  `artifacts/yomu-academy/cast-evidence-20260712/` (dossier root, `.gitignore`d).
  Paths below use the **coded, de-identified** filenames the ledger assigns
  (archive-label + index + truncated digest) — never original attachment names.
- Do not open, describe, copy, or feed a source photo into generation until the
  depicted person is unambiguous **and** the owner confirms the identity, per
  `IMAGEGEN-BRIEF.private.md` and `CAST-AND-CONSENT.md` §"Private-source rules".
- Sources read for this map: the private ledger
  `LIKENESS-REFERENCE-LEDGER.private.json` (211 image entries), `IMAGEGEN-BRIEF.private.md`,
  `docs/academy/CAST-AND-STORY-EVIDENCE.md`, `docs/academy/story/CAST-AND-CONSENT.md`,
  `src/academy/domain/cast-registry.ts`, and `docs/academy/art-review/REFERENCE-INVENTORY.md`.

Dossier root (gitignored):
`artifacts/yomu-academy/cast-evidence-20260712/likeness-references/`

## What the ledger actually attributes (the ONLY determinable identity links)

Across all 211 coded images, the identity-bearing fields resolve to just two named
targets:

| ledger signal | count | photos |
| --- | --- | --- |
| `candidate-nanako-reference-owner-confirmation-required` | 2 | `himitsu-0000-c1a0544657eb0815.jpg`, `himitsu-0001-e9ed1132e407ae68.jpg` |
| `nearbyTargets: [Nanako]`, verdict `unreviewed` (weak context only) | 1 | `majime-0019-c17cb8d693f142a8.jpg` |
| `not-a-likeness-reference`, `sharedBy: Karen` (travel/environment) | 3 | `himitsu-0015-01bdb555aa964d11.jpg`, `himitsu-0016-b453db5ac1f30861.jpg`, `himitsu-0017-dbd4c963c63edd06.jpg` |
| `nearbyTargets: [Karen]`, verdict `unreviewed` | 1 | `himitsu-0011-e6c020c554dbae68.webp` |
| `unreviewed-non-target-or-unverified`, no identity | 205 | (not attributable — do not guess) |

`Karen` is the **private** name used inside the dossier; `Mira` is the release-safe
registry name. The private brief names "Nanako and Karen"; the public docs and
`cast-registry.ts` name exactly two extended members, "Nanako and Mira". Nanako maps
directly, so **Karen (private) ↔ Mira (public)** is a well-supported name inference
(the ledger itself writes "Karen").

## Reference map — cast id → firstName → reference file paths

Paths are relative to the gitignored dossier root above.

| cast id | firstName | reference file path(s) | status |
| --- | --- | --- | --- |
| **nanako** | Nanako | `himitsu-0000-c1a0544657eb0815.jpg`, `himitsu-0001-e9ed1132e407ae68.jpg` | **usable — owner-confirmation-pending.** Two alternate frames of the same four-person restaurant moment; subject hint "single seated woman"; confidence contextual-medium-high. NOT yet owner-approved: show only an owner-safe derived neutral sample and confirm before any expression expansion. Weak secondary context (NOT usable): `majime-0019-c17cb8d693f142a8.jpg` (nearbyTarget Nanako, `unreviewed`). |
| **mira** | Mira | no-ref *(in this dossier)* | Owner-**confirmed** private reference exists but is stored **outside the repo** (`sha256 69cdbe8b…`, `sourceStoredInRepository:false`) — it is not one of the 211 coded photos here. The 3 Karen-shared dossier photos (`himitsu-0015/0016/0017`) are `not-a-likeness-reference` (travel/environment); `himitsu-0011` (nearbyTarget Karen) is `unreviewed`. Non-sensitive visual locks recorded in `mira__neutral__halfbody__reference-confirmed.json`. Sprite runtime blocked. |
| rie | Rie | no-ref | Not in dossier. Likeness `approved` via fictional design refs (see REFERENCE-INVENTORY). |
| sophie | Sophie | no-ref | Not in dossier. Likeness `approved` via fictional design refs. |
| steve | Steve | no-ref | Not in dossier. `approved` design + text brief. |
| felix | Felix | no-ref | Not in dossier. Original fictional design from TEXT brief; do not sharpen toward a real person. |
| tom2 | Tom | no-ref | Not in dossier. Original fictional design from TEXT brief. |
| shaun | Shaun | no-ref | Not in dossier. Owner-named; `reference-confirmed-neutral-pending` but no coded photo here. |
| aakash | Aakash | no-ref | Not in dossier. Restyle own current fictional sprite. |
| peter | Peter | no-ref | Not in dossier. Restyle own current fictional sprite. |
| henry | Henry | no-ref | Not attributed in dossier. |
| alex | Alex | no-ref | Not attributed in dossier. |
| tom | Tom | no-ref | Not attributed in dossier. |
| sam | Sam | no-ref | Not attributed in dossier. |
| francis | Francis | no-ref | Not attributed in dossier. |
| shin | Shin | no-ref | Not attributed in dossier. |
| jodi | Jodi | no-ref | Not attributed in dossier. |
| christian | Christian | no-ref | Not attributed in dossier. |
| jenny | Jenny | no-ref | Not attributed in dossier. |
| robert | Robert | no-ref | Not attributed in dossier. |
| mika | Mika | no-ref | Not attributed in dossier. (Runtime identity-blocked; see `mika__…__identity-blocked.json`.) |
| xingyu | Xingyu | no-ref | Not attributed in dossier. |
| angel | Onke (Angel) | no-ref | Not attributed in dossier. |
| stasi | Stasi | no-ref | Not attributed in dossier. |
| ruparna | Ruparna | no-ref | Not attributed in dossier. |
| rose | Rose | no-ref | Not attributed in dossier. |
| miller | Miller | no-ref | Textbook-legend; `visualEvidence: missing`. |
| tawapon | Tawapon | no-ref | Textbook-legend; `visualEvidence: missing`. |
| mary | Mary | no-ref | Textbook-legend; `visualEvidence: missing`. |
| takeshi | Takeshi | no-ref | Textbook-legend; `visualEvidence: missing`. |

Cast roster is the 30 members in `src/academy/domain/cast-registry.ts`
(1 teacher + 19 real class members + 4 owner-named classmates + 2 extended members
+ 4 textbook legends).

## The 205 unattributed photos — determinable facts only

For the remaining 205 coded photos the ledger records **no identity** (`likenessVerdict:
unreviewed-non-target-or-unverified`, `identityConfidence: null`, empty `nearbyTargets`).
What *is* determinable without guessing a person:

- **Archive of origin (folder/name hint):** two source archives — `himitsu` (23 images)
  and `majime` (188 images) — encoded in each filename prefix. This is an archive label,
  not a person.
- **`sharedBy` (who posted it in chat):** 207 `classmate`, 3 `Karen`, 1 `unknown`.
  "Shared by" is not "depicts" — the ledger warns against equating them.
- Per-file objective metadata only (dimensions, digest, media type). No subject identity.

Per the evidence boundary, these must **not** be attributed to any cast member from
photo content, and must never become a generation `-i` input for a non-likeness-cleared
member.

## Counts

- **Cast members: 30.**
- **With a usable reference located in this coded dossier: 1** — `nanako`
  (2 candidate photos, owner-confirmation-pending; not yet approved for generation).
- **No locatable usable reference in this dossier: 29.** Of these, `mira` has an
  owner-**confirmed** reference stored **outside the repo** (hash-only here), and the
  other 28 have no identity link in the dossier at all (their art comes from fictional
  design refs / text briefs, per `REFERENCE-INVENTORY.md`).

If "usable" is read strictly as *owner-approved and ready to feed into generation*,
the count from this dossier is **0** — Nanako's pair is still owner-confirmation-pending
and Mira's confirmed source lives outside the repo.
