#!/usr/bin/env bash
# Sequential Tier-A production run (ONE process = one global rate-gate => no 429).
# Idempotent: generate.py skips assets whose output already exists.
set -u
cd "$(dirname "$0")/../../../../.."   # -> worktree root
export YOMU_GEN_INTERVAL="${YOMU_GEN_INTERVAL:-4.0}"
GEN="docs/academy/art/claude-production-v3/pipeline/generate.py"
SPECS="docs/academy/art/claude-production-v3/specs"
LOG="docs/academy/art/claude-production-v3/qa/gen-tierA.log"
mkdir -p "$(dirname "$LOG")"
echo "== Tier-A run start (interval=${YOMU_GEN_INTERVAL}s) ==" | tee "$LOG"
for spec in characters-core rie-expanded props protagonist events environments-a; do
  echo "" | tee -a "$LOG"
  echo "### $spec ###" | tee -a "$LOG"
  python3 "$GEN" --spec "$SPECS/$spec.json" --workers 2 2>&1 | tee -a "$LOG"
done
echo "== Tier-A run complete ==" | tee -a "$LOG"
