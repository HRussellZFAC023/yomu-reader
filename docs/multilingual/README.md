<!-- Owner: multilingual-coordinator -->

# Yomu multilingual Slice 1 workspace

This workspace is the handover point for **32 learner languages → Japanese**. It freezes the language identities, establishes a typed locale-catalogue contract, allocates one file per language, and records proof honestly.

## Current state

- Frozen learner-language roster: **32/32 represented**
- Mirrored target-language dictionary supply: **32/32 represented**
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

The fast release ratchet replays compact evidence without downloading the
published dictionaries:

```bash
npm run quality:multilingual-parity
```

When a lookup-significant source, dependency, script, runtime, corpus, or
published dictionary changes, re-record from the repository root on a clean,
committed tree using the Node version in `.nvmrc`. Keep the cache and checkpoint
outside the repository. The checkpoint is resumable only while the commit,
worktree status, Node/ICU/default-locale runtime, measurement contract, and
corpus stay the same.

The contract includes the Vite and TypeScript configuration that transforms
the recorder, importer, and matcher. Checkpoint provenance also records the
resolved default `Intl` locale because locale-sensitive ordering and
lowercasing can differ under `LANG`/`LC_ALL` even with the same Node and ICU
versions. The current Vite-only environment branches do not reach the measured
module graph; release-script identity is already covered by `package.json`.

```bash
source "$NVM_DIR/nvm.sh"
nvm use --silent
PARITY_CACHE=/private/tmp/yomu-multilingual-parity-cache
PARITY_CHECKPOINT="/private/tmp/yomu-multilingual-parity-$(git rev-parse --short=12 HEAD).json"
npm run manual:multilingual-parity -- \
  --cache-dir "$PARITY_CACHE" \
  --checkpoint "$PARITY_CHECKPOINT"
npm run manual:multilingual-parity -- \
  --cache-dir "$PARITY_CACHE" \
  --checkpoint "$PARITY_CHECKPOINT" \
  --write-baseline config/quality/multilingual-lookup-baseline.json \
  --write-evidence config/quality/multilingual-lookup-evidence.json
npm run quality:multilingual-parity
```

The second recorder command reuses all completed target rows, writes both
authoritative documents together, and self-verifies them against freshly read
contract inputs. Application release-version fields are deliberately neutral:
a version-only bump does not change lookup behavior. Scripts, dependencies,
lockfile resolutions and integrity values, and nested package versions remain
part of the contract, while package/lockfile version agreement is checked
separately.

The existing `src/reader/app/i18n.ts` remains the live full-interface English/Japanese implementation. The seed catalogues currently localize only the new Slice 1 language-profile flow, and no file in this workspace claims that the full UI has already been translated.
