# Account/payment live proof

> **Screenshots are no longer tracked.** The PNGs named on this page were untracked on
> 2026-08-04 (39 MB of tracked captures across `docs/academy/evidence/`, against a README
> that has always said screenshots are local-only). The SHA-256 values below still identify
> them, and the bytes are in git history: `git show 75644853b:<path>`. New captures under
> `docs/academy/evidence/` are gitignored.


This directory contains evidence produced by the deployed Yomu Academy account/payment proof runner. Existing JSON and screenshots describe the run that created them; editing the harness does not make those artifacts current.

## Run

```bash
npm run academy:account-payment:proof
```

The command targets `https://yomureader.com` by default. Override it only for an equivalent deployed Worker:

```bash
ACADEMY_PROOF_ORIGIN=https://example.test npm run academy:account-payment:proof
```

The runner makes one GBP 2 Stripe **test-mode** payment. No real money moves. It requires Playwright Chromium, Wrangler authentication for the production D1 database, and the deployed Worker secrets to be configured. It refuses any Checkout URL that is not `checkout.stripe.com` with a `cs_test_` session.

To prove a disposable one-use class invitation through the real admin APIs, supply the admin token at runtime. The token and generated code are held only in memory and are fully redacted from evidence:

```bash
ACADEMY_PROOF_ADMIN_TOKEN='...' npm run academy:account-payment:proof
```

## Evidence rules

- `pass` means the live run observed the behavior.
- `fail` means an observed live assertion failed.
- `blocked` means the harness could not perform a required external action honestly. A blocked gate makes the command exit nonzero.
- `info` records disposition without claiming a gate passed.

The browser app is the only webhook-claim poller. The harness paces its requests, honors `Retry-After`, and performs one additional request only after success to prove claim idempotency. Cleanup runs from `finally`: browser sessions are logged out, proof contexts are cleared and closed, temporary class fixtures are removed, and the browser process is closed. Stripe test purchases and their minted invites remain in the Worker's audit tables because no supported deletion endpoint exists; the result reports that fact without writing their identifiers.

The runner never forges Google identity tokens. OIDC start, account-gated UI, recovery-session creation, and session resume can be proven automatically. A real Google callback, account-bound entitlement, known-account recovery, and unknown-subject rejection remain `blocked` unless a future provider-assisted harness completes those real provider actions. Local Worker tests are useful corroboration but are not relabelled as live provider proof.

Screenshots assert the account/recovery state at exactly `1440x900` and `390x844`. `live-proof-results.json` contains only redacted details and a pass/fail/blocked summary.

## Current proof truth

The checked-in 2026-07-19 run records 17 passes, 0 failures, 5 blocked steps,
and `complete: false`. It is valid evidence for a deployed Stripe test checkout,
signed webhook fulfillment, claim retry, URL scrubbing, account gating, and
session resume on that deployed revision. It is not proof of a live Google
callback, a duplicate provider redelivery, a deployed admin-created class code,
or an owner-approved production payment.

Patreon membership ordering/revocation and Ko-fi charge-to-entitlement mapping
currently have deterministic Worker/D1 proof only:

```bash
npm run academy:backend-lifecycle:proof:local
```

No live Patreon or Ko-fi account/subscription has been connected, and no local
fixture may be relabelled as subscription proof. The supervised real-Google,
two-device, export, recovery, and deletion journey is documented in the
[PLAT-001 lifecycle proof](../account-lifecycle/README.md); it also remains open
until its credential-gated live command succeeds against the reviewed deployed
revision.
