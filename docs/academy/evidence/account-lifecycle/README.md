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
deletion-receipt pruning, permanent redemption tombstones, and learning-data
cascades. It then
applies the same migrations to isolated Wrangler/Miniflare storage and exercises
the real Worker entrypoint for health, recovery-session persistence, session
readback, and Google-start PKCE construction. No Cloudflare or Google credential
is read by the local smoke.

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
The two invite codes must both be valid for that account journey; they may be
two one-use codes or one reusable code. Do not put a Google password, OAuth
authorization code, cookie, pairing code, or Worker secret in any environment
variable or evidence file. Google sign-in is completed manually in two visible
Chrome windows.

Apply the D1 migrations, deploy the exact reviewed Worker commit, and publish
the Academy app bytes from that same commit first:

```bash
npx wrangler d1 migrations apply yomu-academy --remote --config wrangler.academy.jsonc
REVIEWED_COMMIT="$(git rev-parse HEAD)"
npx wrangler deploy --config wrangler.academy.jsonc \
  --var ACADEMY_ORIGIN:https://yomureader.com \
  --var ACADEMY_BUILD_COMMIT:"$REVIEWED_COMMIT"
```

The Worker `version_metadata` binding exposes its immutable executing version
id. `/academy/api/health` exposes that id, the injected commit, and API base;
none is secret. The proof refuses to open Chrome unless those values match the
100%-active Wrangler deployment, local clean HEAD, hosted `academy/app.js`
SHA-256, and the exact remote `d1_migrations` set.

Configure the runner locally. The browser profile paths must be distinct,
absolute directories reserved for this proof:

```bash
export ACADEMY_LIFECYCLE_PROOF_ORIGIN='https://yomureader.com'
export ACADEMY_LIFECYCLE_PROOF_INVITE_CODE_A='...'
export ACADEMY_LIFECYCLE_PROOF_INVITE_CODE_B='...'
export ACADEMY_LIFECYCLE_PROOF_DEVICE_A_DIR='/absolute/private/path/device-a'
export ACADEMY_LIFECYCLE_PROOF_DEVICE_B_DIR='/absolute/private/path/device-b'
export ACADEMY_LIFECYCLE_PROOF_GOOGLE_IDENTITY='dedicated-test-account@example.test'
export ACADEMY_LIFECYCLE_PROOF_REVIEWED_COMMIT="$(git rev-parse HEAD)"
export ACADEMY_LIFECYCLE_PROOF_EVIDENCE_HMAC_KEY='a separate local random secret of at least 32 bytes'
export CLOUDFLARE_API_TOKEN='...'
export ACADEMY_LIFECYCLE_PROOF_DELETE_ACK='DELETE_DEDICATED_TEST_ACCOUNT'
npm run academy:account-lifecycle:proof:live
```

The command accepts only empty directories or non-empty directories carrying a
runner marker bound to their canonical path. It rejects symlinks, canonical
ancestor overlap, `$HOME`, the repository, and known Chrome/Chromium/Firefox
profile roots. Marker-owned directories are reset before launch and removed
after browsers close. Existing personal browser profiles are never accepted.

Immediately before account deletion, the runner opens the visible Google
account page again. The operator must reconfirm that it is the configured
disposable identity and type a fresh acknowledgement bound to that identity,
the Academy account, reviewed commit, active Worker version, and random nonce.
The initial environment acknowledgement cannot satisfy this second gate.

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
10. After the late identity-bound acknowledgement, account deletion removes
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
reviewed git commit, active Worker deployment/version ids, hosted app SHA-256,
exact schema migration set, API base, timestamps, and redacted pass/fail
statements. Public ids, Google identity, invite/pairing codes, cookies, OAuth
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
