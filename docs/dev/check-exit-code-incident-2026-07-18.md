# Check exit-code incident (2026-07-18)

## Conclusion

The reported green `npm run check` was an observation artifact, with high
confidence. No fail-open path exists in the checked-in Vitest → `run-ci-tests`
→ `run-ci-suite` → npm → `run-check` chain. The observed combination is
reproduced exactly by piping the command to `tail` in zsh: Vitest prints a
failed summary and npm exits 1, but the pipeline reports `tail`'s zero status.

The exact historical command line was not retained, so the old invocation
cannot be proven byte-for-byte. The mechanism is nevertheless confirmed, and
all plausible in-repo alternatives were inspected or reproduced.

## Incident shape

The original log contained:

```text
Test Files  2 failed
```

The failed files were:

- `tests/reader/new-tab-review/07-card-fronts-pitch-audio.test.ts`
- `tests/reader/new-tab-browse.test.ts`

The overall command was then reported as exit 0. Commit `f1d34f38f` added a
defensive test-log scan before the underlying cause was known.

## Process-chain audit

| Boundary | Failure behaviour | Result |
| --- | --- | --- |
| Vitest 1.6.1 | The runner leaves a test in final `fail` state after its configured retries. `runFiles` calls the same `hasFailed(files)` predicate used for the failed task tree and sets `process.exitCode = 1` before reporters finish. API mode only starts the Vite/API server; it does not replace result handling. | Fail-closed |
| `run-ci-tests.mjs` | Spawn errors map to 1, timeout to 124, signals to 1, and normal completion to `status ?? 1`. | Fail-closed |
| `run-ci-suite.mjs` | Both synchronous paths treat null/nonzero status as failure. The legacy parallel path maps a signalled child (`code === null`) to 1 and stops the other shards. | Fail-closed |
| `run-check.mjs` | A stage resolves only for `code === 0 && signal == null`; rejected lanes are collected and the orchestrator exits 1. The `close` event drains logs before the defensive scan. | Fail-closed |
| npm and `sh -c` | npm returns its script's status; `sh -c` returns its final command's status. A `spawnSync` signal produces null status plus a signal, which every runner maps to failure. | Fail-closed |
| Calling zsh pipeline | Without `pipefail`, a pipeline returns its last command's status. `tail` commonly exits 0 after consuming a failed command's output. | Masks failure outside the gate |

`exit` versus `close` was not the cause. The earlier `exit` handler received the
same process code; switching to `close` in `f1d34f38f` ensures only that all
stdio is available before the log is written and scanned.

## Reproduction

A temporary Vitest 1.6.1 probe failed on all three configured attempts
(`retry: 2`). Direct npm execution, an API-enabled run, and a `sh -c` wrapper
each printed a failed summary and exited 1.

The same failing npm command piped to `tail` under stock zsh produced:

```text
Tests  1 failed (1)
observed_status=0 components=1 0
```

Here zsh's `pipestatus` array proves that npm exited 1 and `tail` exited 0.
With `set -o pipefail`, the same pipeline produced:

```text
observed_status=1 components=1 0
```

A separate signal probe returned `{ status: null, signal: "SIGTERM" }`; the
runner mapping converted that result to 1. No retry, API, signal, `spawnSync`,
or shell-wrapper variant produced a false zero.

## Operational rule

Never pipe `check` or test commands to `tail`. Run the gate directly, then
inspect the stage log:

```bash
npm run check
tail -n 80 artifacts/check-logs/test:ci.log
```

If live filtering is genuinely necessary, enable pipeline failure propagation
before starting it:

```bash
set -o pipefail
npm run check 2>&1 | tee /tmp/yomu-check.log
```

The log-summary guard from `f1d34f38f` remains deliberately. It is harmless
defence in depth for any future tool regression, but it cannot repair an exit
code masked by the caller's shell after `run-check` has already exited 1.
