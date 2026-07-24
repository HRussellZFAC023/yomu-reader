<!-- Owner: multilingual-coordinator -->

# Multilingual delivery rules

## Context

Slice 1 serves speakers of exactly 32 learner languages who are learning Japanese. The golden thread is equal care: every language must pass the same runtime-profile, dictionary-recommendation, settings, lookup, fallback, accessibility, and end-to-end gates before the narrow **32 input languages → Japanese** runtime slice ships. That runtime gate is 32/32, never “most languages”.

Full-interface localization is a separate, later closure programme. Its UI, native-review, docs, Study, visual, accessibility, and end-to-end ledger remains 0/32 until those broader journeys are genuinely complete. Shipping the narrow runtime slice must never be described as completing full-product localization.

Japanese is the sole learning target in this slice. Academy is not part of this workspace or its completion count.

## Read first

1. Read `Decisions.md` and `roster-source.md`.
2. Confirm your locale and exclusive file in `../../config/multilingual/locale-ownership.json`.
3. Read the English source catalogue and terminology context before editing.
4. Change only your owned locale file. Propose shared key changes to the multilingual coordinator.

## Ownership

- The multilingual coordinator owns shared types, English source keys, validators, roster metadata, decisions, and the ledger.
- A language thread owns exactly one `src/reader/locales/catalogs/<id>.ts` file and its eventual locale-specific docs and fixtures.
- Line 1 of every owned locale file identifies its owner.
- Never edit another language’s catalogue to resolve a conflict.

## Workflow

Every locale moves through:

`scaffold → machine draft → adversarial language review → native review → browser proof`

Run key and placeholder parity tests after every edit. A machine draft is never presented as native-reviewed. Update the closure ledger only when evidence exists.

## Guardrails

- Keep message placeholders unchanged, including case.
- Use the native script and punctuation conventions recorded in the roster.
- Test long strings, combining marks, and right-to-left layout where applicable.
- Never translate Japanese learning material, dictionary headwords, readings, source sentences, product name `よむ`, provider names, or credentials.
- Do not add Academy messages, routes, fixtures, or completion claims here.
- Dictionary availability and redistribution rights are separate release gates; language presence in the roster does not grant redistribution rights.
- Additive changes are safe. Do not overwrite a human-reviewed translation with an automated draft.
