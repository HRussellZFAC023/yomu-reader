<!-- Owner: multilingual-coordinator -->

# Yomu multilingual Slice 1 workspace

This workspace is the handover point for **32 learner languages → Japanese**. It freezes the language identities, establishes a typed locale-catalogue contract, allocates one file per language, and records proof honestly.

## Current state

- Frozen learner-language roster: **32/32 represented**
- English source catalogue: **1/32 source-approved**
- Per-language seed catalogues: **31/32 machine-draft**, **0/32 scaffold**
- Full Yomu UI extraction: not yet complete
- Native-reviewed catalogues: **0/32**
- End-to-end language journeys: **0/32**
- Full-product localization readiness: **0/32**

Every seed catalogue has key and ICU-placeholder parity. The 31 translated catalogues are deliberately marked `machine-draft`: they are not native-reviewed and do not mean the full Yomu interface is localized. The `0/32` product-closure count stays unchanged until the complete user journey is translated and verified.

The Reader Slice 1 runtime is narrower than full UI localization: it adds 32 learner/definition-language profiles for a fixed Japanese target, language-specific native-first dictionary recommendations, and default-off translation for non-native definitions. Its release gate is independently 32/32 across roster identity, profile persistence, recommendations, settings, lookup, provider fallback, accessibility, and end-to-end runtime proof. Passing that gate does not change the full-product localization count. Google Translate has no Ancient Greek target, so the `grc` profile retains its recommendations and original definitions without exposing an unavailable translation toggle. Academy is outside this slice.

## Workspace map

- `config/multilingual/languages.json` — frozen roster and source evidence.
- `config/multilingual/locale-ownership.json` — exclusive locale-file ownership.
- `src/reader/locales/` — runtime-neutral roster, catalogue interfaces, fallback source, validators, and catalogues.
- `config/dictionaries/published/v1/` — tracked snapshot of the exact catalogue and 32 recommendation manifests published to R2.
- `tests/reader/locales/` — 32/32, BCP-47, direction/script, ownership, key, and placeholder gates.
- `Decisions.md` — settled decisions.
- `roster-source.md` — roster derivation and uncertainty.
- `closure-ledger.md` — language-by-language release evidence.
- `subtask-plan.md` — delivery ownership and dependencies.

## Verification

Run:

```bash
npx vitest run tests/reader/locales
npm run typecheck
```

The existing `src/reader/app/i18n.ts` remains the live full-interface English/Japanese implementation. The seed catalogues currently localize only the new Slice 1 language-profile flow, and no file in this workspace claims that the full UI has already been translated.
