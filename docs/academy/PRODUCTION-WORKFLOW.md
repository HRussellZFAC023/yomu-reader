# Academy production workflow

The Academy backlog is now an executable dependency graph. [`BACKLOG.md`](BACKLOG.md) remains the sole completion authority; this workflow schedules it without creating a second product truth.

## Commands

```bash
node scripts/academy-production-workflow.mjs validate
node scripts/academy-production-workflow.mjs status
node scripts/academy-production-workflow.mjs ledger
node scripts/academy-production-workflow.mjs plan
node scripts/academy-production-workflow.mjs index-unreachable
node scripts/academy-production-workflow.mjs index-transcripts
node scripts/academy-production-workflow.mjs prune-state
node scripts/academy-production-workflow.mjs salvage GOV-001
node scripts/academy-production-workflow.mjs claim GOV-001 --owner codex-main --paths config/academy-production-workflow.json,scripts/academy-production-workflow.mjs
node scripts/academy-production-workflow.mjs attach-evidence GOV-001 C artifacts/evidence/canonical.json
node scripts/academy-production-workflow.mjs run-proof GOV-001 T -- node node_modules/vitest/vitest.mjs run tests/academy/example.test.ts
node scripts/academy-production-workflow.mjs attest-reuse GOV-001 @workflow-state/reuse/GOV-001.json
node scripts/academy-production-workflow.mjs run-review GOV-001 --provider claude-fable --prompt artifacts/reviews/GOV-001-prompt.md
node scripts/academy-production-workflow.mjs seal-proof GOV-001 --summary "One verified governance slice"
node scripts/academy-production-workflow.mjs verify-proof GOV-001
node scripts/academy-production-workflow.mjs promote GOV-001 --apply
node scripts/academy-production-workflow.mjs reopen GOV-001 --token CLAIM_TOKEN
node scripts/academy-production-workflow.mjs checkpoint --message "chore(academy): promote GOV-001"
node scripts/academy-production-workflow.mjs record-release --tag vX.Y.Z
```

`ledger` generates `@workflow-state/production-ledger.json`. It is the sole machine-readable delivery view: one row per canonical task records audit, implementation, learner reachability, QA and deployment evidence, while its progress percentages are derived from those same rows. Route counters are generated from named source registries and carry an explicit claim type so an authored file count cannot be presented as learner reachability. `status` reads this generated ledger rather than calculating a second percentage.

`plan` compiles the canonical checkboxes, dependencies, proof gates, priorities, active claims, lane capacity, and downstream unlock count. It writes resumable work orders, claims, locks, reuse indexes and proof templates beneath the repository's shared Git common directory. Every worktree therefore sees one scheduler state. `YOMU_ACADEMY_WORKFLOW_STATE` can override that location for a controlled CI or recovery run.

## Operating rules

1. Work begins only when every canonical dependency is complete.
2. Before authoring, run the slower `index-unreachable` and `index-transcripts` audits, then `salvage TASK`. The task scan inventories every configured recovery document, path-bearing reachable and unreachable commit, branch, surviving worktree (including tracked and untracked changes), stash, reflog entry, and transcript file from the explicit Claude/Codex roots. Transcript discovery is exhaustive by file; its searchable text is a bounded first/last lexical sample so the index stays small. Every ranked candidate receives a stable ID and must be reused or rejected with a reason. Regenerated reports carry forward dispositions only when that stable candidate and its evidence hash still match. A claim pins the content-addressed source snapshot and current recovery-index hashes, rather than livelocking on unrelated worktree edits or an actively growing transcript.
3. Code work uses a clean dedicated worktree starting exactly at current `origin/main`. A claim has a random token, fixed worktree, base commit, expiry, renewal and cancellation path. It must reserve its exact planned files up front; changed files outside that reservation cannot pass proof. Every work order carries the lane boundary and the external Japanese/Soya roots when relevant.
4. Parallelism is bounded globally and per lane. Shared state and PID-aware locks live in the Git common directory, while exact file reservations prevent parallel lanes from touching the same file. Integration remains single-filed.
5. An agent response never closes work. Gate evidence must be a `yomu-academy.gate-attestation/v1` JSON document naming the task, gate, exact HEAD, passing verdict, task owner or allowlisted workflow/CI producer, summary, and hash-bound assertion artifacts. Test commands must be executed by `run-proof`, which records their exit code, transcript and exact Git HEAD. Independent review runs through `run-review`; the workflow invokes an allowlisted external provider, captures its native session response, binds the prompt, response, provider/model/session identity, task definition and HEAD into an immutable session record, and only then attaches a `ship` attestation with no unresolved P0/P1 finding. User-authored reviewer labels, an opaque file, or a review that says `BLOCK` cannot be attested as passing.
6. `seal-proof` only operates on a committed, clean slice. It binds the proof to the current task definition, so another task's checkbox may advance without invalidating parallel work. `verify-proof` fetches `origin/main`, checks claim token/worktree/base/HEAD, verifies the exact committed diff against lane ownership, resolves every evidence path physically (rejecting symlink escapes), opens and hashes every evidence file and nested assertion artifact, and rejects stale or fabricated proof. The reuse attestation must be the exact report pinned when the claim was created.
7. `promote --apply` is the only command that checks a canonical item. Dynamic release scope is resolved to concrete tasks; it no longer leaves `REL-001` permanently unschedulable.
8. The integration lock permits exactly one promoted slice per checkpoint. Promotion pins the verified proof hash, a deterministic manifest of every nested review/gate/transcript/assertion/approval artifact, and the byte-exact backlog produced by changing that task's one checkbox. `checkpoint` re-hashes all three before gates, after gates, in a prepared retry commit, and before push, so no extra checkbox, mutated proof, or changed nested evidence can ride along. It refuses an advanced `origin/main` instead of rebasing certified commits, runs the configured gates before creating the promotion commit, pushes, and confirms `origin/main`. If the base advances or a gate fails, `reopen` restores the task checkbox and cancels the stale-base claim. The owner then rebases, refreshes salvage, claims the task again, and reruns gates/review before resealing. User-visible slices remain open until `record-release` verifies the latest non-draft GitHub release, the exact `yomu.user.js` bytes from the tag, the matching changelog entry, and a successful Pages deployment for that tag commit. The stability/release lane owns the root version, changelog and built userscript files needed to create that release tree.
9. Failed or interrupted work keeps its local claim/proof state and can resume without redoing completed evidence. Expired claims are excluded from status and return to the scheduler after twelve hours; an expired owner cannot renew over a replacement claim. Command evidence has a bounded output size, and `plan`/`prune-state` remove source snapshots no longer referenced by selected or active work, preventing recovery scans from quietly consuming the disk.

## Why this shape

The critical path is not “generate more files.” It is: establish authoritative denominators and shared contracts, implement dependency-ready vertical slices, verify them in the real product, integrate one slice at a time, and release continuously. The scheduler therefore rewards P0 work, current focus, and tasks that unblock the most descendants while preventing several agents from editing the same lane at once.

The workflow deliberately does not launch a model from Node. Codex, Claude, and future harnesses can all consume the same generated work order; deterministic scheduling and proof remain independent of whichever model is available.
