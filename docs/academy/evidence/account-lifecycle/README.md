# PLAT-001 account lifecycle proof

This directory defines the evidence contract for the deployed account
lifecycle. No successful live result is checked in by this change. The runner
writes its redacted result under ignored `artifacts/` only after a real run.

## Deterministic proof

```bash
npm run academy:account-lifecycle:proof:local
```

This gate runs the production Worker router against SQLite with every D1
migration. It covers PKCE/state/nonce and redirect rejection, callback URL
scrubbing, local-to-account migration, rotation/resume, expiry, family logout,
unknown-subject recovery rejection, account/profile isolation, two-device key
pairing, encrypted retry and offline behavior, paid-code rollback on a reproduced
profile-conflict `409`, injected transaction failures, a 24,001-record export
with snapshot/tamper/replay/shared-NAT behavior, corrupt-profile reset, 90-day
scheduled deletion-receipt pruning with retry metrics, production-proof grant
races/replay, permanent redemption tombstones, and learning-data
cascades. It then applies the same migrations to isolated Wrangler/Miniflare
storage and exercises the real Worker entrypoint for health, recovery-session
persistence, session readback, Google-start PKCE construction, and the
scheduled prune handler. No Cloudflare or Google credential is read by the
local smoke.

The repository remains on Vite 5.4.21. Cloudflare's Vite integration relies on
the Vite Environment API introduced in Vite 6, so this proof deliberately
starts the Worker with `wrangler dev --local`. Passing it does not claim that
the newer Cloudflare Vite-plugin startup path is supported by this repository.

The redacted local runtime receipt is written to ignored
`artifacts/academy-account-lifecycle/local-miniflare-proof.json`. It records
runtime versions, migration count, and named checks only; it contains no
session id, cookie, OAuth state, provider subject, or invite code.

With an Academy Vite server running, the real-browser lifecycle surface can be
checked at phone and desktop sizes:

```bash
npm run dev:academy -- --host 127.0.0.1 --port 5205
ACADEMY_BASE_URL=http://127.0.0.1:5205 npm run academy:account-lifecycle:proof:browser
```

The browser smoke renders the production profile-sync component, checks both
deletion scopes as separate non-overlapping 44px controls, runs serious/critical
axe checks, and writes ignored screenshots under
`artifacts/academy-account-lifecycle/browser/`.

That is `T/Q/S/O` evidence plus local Miniflare/D1 corroboration. It is not the
deployed `D` gate.

The already-present payment, entitlement, class-board, leaderboard, answer
check, and canonical encrypted-event foundations can be rerun together with:

```bash
npm run academy:backend-lifecycle:proof:local
```

That broader command proves deterministic contracts such as Stripe webhook
idempotency and retry, Patreon active/revoked ordering, Ko-fi charge mapping,
permanent donation access, support-to-Academy ingress, account-bound
entitlements, class isolation and board opt-out, server-derived leaderboard
metrics, and offline SRS union/conflict behavior. It includes the support
Worker and both D1 migration sets. It is corroborating evidence only. It does
not provide a live Google callback, a real owner-approved payment/subscription,
a deployed class-code smoke, or permission to close dependency-ordered
`PLAT-002` through `PLAT-005` under `PLAT-001`.

## Live prerequisites

Use a dedicated disposable Google test account with no personal Academy data.
It must already have the exact Academy account public id the supervisor will
mark; the live runner is not allowed to create or choose its own deletion grant.
The two invite codes must both be valid for that account journey; they may be
two one-use codes or one reusable code. Do not put a Google password, OAuth
authorization code, cookie, pairing code, or Worker secret in any environment
variable or evidence file. Google sign-in is completed manually in two visible
Chrome windows.

Apply the D1 migrations, deploy the exact reviewed Worker commit, and publish
the Academy app bytes from that same commit first:

```bash
npx wrangler d1 migrations apply yomu-academy --remote --config wrangler.academy.jsonc
npx wrangler deploy --config wrangler.academy.jsonc
```

The Worker `version_metadata` binding exposes its immutable executing version
id. The runner reproduces the reviewed bundle with Wrangler `--dry-run`, hashes
its runtime module bytes, normalized version settings, exact config bytes, and
every migration. It retrieves the 100%-active immutable version's raw modules
and settings from Cloudflare's version API, retrieves Cloudflare's immutable
script ETag, and compares the reproducible hashes directly.
`/academy/api/health` supplies only the executing version id, API base, and
artifact-proof protocol; no mutable commit variable is trusted. A different
bundle with the same claimed commit fails before Chrome opens. Hosted
`academy/app.js`, clean local HEAD, active deployment id, and remote migrations
must also match.

Before launching the runner, the supervisor creates one random run nonce and
mints the account-bound grant through the admin endpoint. Keep the admin token
out of the runner environment and shell history where possible. The returned
proof token expires after one hour and is consumed by the deletion transaction:

```bash
export ACADEMY_LIFECYCLE_PROOF_RUN_NONCE="$(node -e 'console.log(require("node:crypto").randomBytes(32).toString("base64url"))')"
curl --fail-with-body https://yomureader.com/academy/api/admin/lifecycle-proof-grants \
  -H "Authorization: Bearer $ACADEMY_ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  --data "{\"accountId\":\"$DEDICATED_ACADEMY_ACCOUNT_ID\",\"runNonce\":\"$ACADEMY_LIFECYCLE_PROOF_RUN_NONCE\"}"
```

The supervisor passes only `proofToken` from that response to the runner. Do
not proceed unless the response names the exact account, `production`
environment, `account-lifecycle-production-test` scope, same run nonce, and a
future expiry. Unset `ACADEMY_ADMIN_TOKEN` before starting the runner; it must
not be able to mint or retarget its own grant.

Configure the runner locally. The browser profile paths must be distinct,
absolute directories reserved for this proof:

```bash
export ACADEMY_LIFECYCLE_PROOF_ORIGIN='https://yomureader.com'
export ACADEMY_LIFECYCLE_PROOF_INVITE_CODE_A='...'
export ACADEMY_LIFECYCLE_PROOF_INVITE_CODE_B='...'
export ACADEMY_LIFECYCLE_PROOF_DEVICE_A_DIR='/absolute/private/path/device-a'
export ACADEMY_LIFECYCLE_PROOF_DEVICE_B_DIR='/absolute/private/path/device-b'
export ACADEMY_LIFECYCLE_PROOF_PROOF_TOKEN='the single-use proofToken returned above'
export ACADEMY_LIFECYCLE_PROOF_RUN_NONCE='the exact nonce used to mint the grant'
export ACADEMY_LIFECYCLE_PROOF_REVIEWED_COMMIT="$(git rev-parse HEAD)"
export ACADEMY_LIFECYCLE_PROOF_EVIDENCE_HMAC_KEY='a separate local random secret of at least 32 bytes'
export CLOUDFLARE_ACCOUNT_ID='...'
export CLOUDFLARE_API_TOKEN='...'
npm run academy:account-lifecycle:proof:live
```

The command accepts only empty directories or non-empty directories carrying a
runner marker bound to their canonical path. It rejects symlinks, canonical
ancestor overlap, `$HOME`, the repository, and known Chrome/Chromium/Firefox
profile roots. Marker-owned directories are reset before launch and removed
after browsers close. Existing personal browser profiles are never accepted.

After the first real login, the runner verifies the server-side grant belongs
to the authenticated account, production environment, and run nonce. It repeats
that verification immediately before deletion, then calls only the dedicated
proof deletion route. That route atomically consumes the grant and gates every
destructive statement. Operator labels, visible profile text, and local browser
directory ownership are never deletion authority.

## Observed live journey

The operator signs the same dedicated Google account into device A and device
B. The runner then requires all of these observations before returning zero:

1. The deployed Worker and remote D1 are reachable at the configured origin.
2. Both real Google callbacks are observed with only `account=linked`; no code
   or state reaches the Academy URL, and the shipped client removes the outcome
   marker without help from the proof runner.
3. Local synthetic progress is encrypted after account link, inserted once, and
   an identical retry is accepted as a duplicate without another row.
4. Device B joins the same isolated profile through a one-time wrapped-key
   pairing and decrypts the record locally.
5. The hosted Academy app's actual export button follows the deployed signed
   export-session protocol and downloads the complete synced record. The proof
   runner has no private paginator.
6. A D1-expired session is rejected, then resumes with cookie rotation inside
   its fixed offline window.
7. Logout revokes device B; a fresh real Google recovery restores the owned
   account/profile.
8. Profile deletion removes encrypted profile data, devices, imported
   progress/snapshots, study days, and profile-bound sessions, keeps the
   account, and creates a minimized 90-day D1 receipt.
9. Real Google recovery creates a fresh profile/key and the retained synthetic
   local record can be re-encrypted, synced, decrypted, and exported.
10. After the server-side proof grant is reverified and atomically consumed,
    account deletion removes
    Academy identity, sessions, profiles, imports, study days, and synced
    records. Remote D1 retains the 90-day minimized receipt and any permanent
    minimal redemption/payment audit records required for code-reuse and
    fraud/payment review.
11. A final real Google recovery returns `account=failed` and does not recreate
    the deleted identity.

The run is intentionally destructive. On interruption, treat the result as
failed, inspect the dedicated test account manually, and use a fresh account if
the previous profile key state is uncertain.

## Evidence boundary

`artifacts/academy-account-lifecycle/live-proof-results.json` contains the
reviewed git commit, active Worker deployment/version ids, reviewed artifact,
Cloudflare script ETag, runtime-module, version-settings, config, migration-set
and hosted app SHA-256 values, exact schema migration set, API base, timestamps,
and redacted pass/fail statements. Public ids, proof/run tokens,
invite/pairing codes, cookies, OAuth
parameters, and Cloudflare/evidence keys are redacted or never recorded. The
payload carries a SHA-256 plus HMAC-SHA-256 signature under the separate local
evidence key and is verified after write. A missing result, invalid signature,
nonzero command, failed step, or revision mismatch leaves `D` open.

PLAT-001 remains open in this commit. It may close only after a supervised live
command passes against the exact reviewed deployment and its signed proof
artifact is independently reconciled with that revision.
The deterministic suite remains the ownership-bypass and second-account
isolation proof; the live runner deliberately does not ask for a second human
Google identity.
