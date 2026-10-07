# Yomu multilingual workspace (retired)

This workspace documented the 32-learner-language Slice 1 and the 33-target
Reader behavior. [ADR-0024](../../adr/0024-yomu-reads-japanese-only.md)
retired both on 7 October 2026: Yomu reads and teaches Japanese only. The
roster notes, decisions, closure ledger, locale prompt and delivery plan that
lived here were removed with that decision; Git keeps them.

One check from this workspace still runs: the lookup parity ratchet.

## Lookup parity ratchet

The ratchet now covers the Japanese target only, with the same corpus row and
JMdict English pin. It keeps its `multilingual` name for now. The fast release
check replays compact evidence without downloading the published dictionaries:

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
versions.

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

The second recorder command reuses the completed Japanese row, writes both
authoritative documents together, and self-verifies them against freshly read
contract inputs. Application release-version fields are deliberately neutral:
a version-only bump does not change lookup behavior. Scripts, dependencies,
lockfile resolutions and integrity values, and nested package versions remain
part of the contract, while package/lockfile version agreement is checked
separately.
