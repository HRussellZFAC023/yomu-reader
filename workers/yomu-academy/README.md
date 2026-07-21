# Yomu Academy Worker

Cloudflare Worker + D1 boundary for Academy access, Google accounts, paid
entitlements, private media, device pairing, and local-first learner-event
sync.

## Payment mode

Checkout is deliberately **Stripe test mode only**. Configure an `sk_test_...`
key and the matching test-mode webhook signing secret; the Worker rejects
`sk_live_...`/`rk_live_...` keys, `cs_live_...` checkout sessions, and webhook
events with `livemode: true` at every origin. Do not add Stripe secrets to the
repository, client bundle, browser storage, or documentation examples.

An end-to-end test checkout requires separately configured Stripe test
credentials and a test webhook forwarder to `POST /academy/api/stripe/webhook`.
The unit suite covers Checkout creation, signed test webhook fulfilment,
deterministic code claim, and one-account redemption without those credentials.

### Canonical payment ingress

Migration `0010_payment_ingress.sql` adds separate, HMAC-identified tables for
provider events, actual settled charges, stable provider subjects, and the
current Academy entitlement projection. Patreon membership notifications never
enter the charge ledger. Projection writes and the event idempotency marker are
one D1 batch. Migration `0011_permanent_donation_access.sql` widens the old
GBP 2–500 storage check so every positive whole-minor-unit provider payment can
be represented without rounding or product-tier gates.

`POST /academy/internal/payment-ingress` is a private Worker-to-Worker contract.
It requires `Content-Type: application/json` plus `Authorization: Bearer
<PAYMENT_INGRESS_TOKEN>`; an absent secret fails closed. The v1 body contains
`provider`, `eventId`, `eventType`, `occurredAt`, and an opaque provider
`subject`. `charge.settled` adds a real `transaction`; Patreon instead sends
`membership.active` with provider-cycle evidence and a positive amount, or
`membership.revoked`. Academy stores accepted grants with no entitlement
expiry; later Patreon cancellation is an audited no-op and cannot create or
remove access. Exact TypeScript validation lives in
`src/payment-ingress.ts`.

The support Worker declares the private Service binding, and the independent
bearer secret must be installed on both Workers before provider webhooks are
enabled. No public provider route targets this internal path. Academy-owned
Stripe purchases require their exact pre-created purchase, Checkout session,
and amount. Ordinary support Stripe sessions use a transaction subject and are
accepted only after the support Worker has verified Stripe's raw-body HMAC.

Code delivery for Ko-fi and Patreon remains manual and admin-only at
`POST /academy/api/admin/payment-code`. It accepts an existing admin bearer plus
`{provider, referenceType, reference}` and re-derives the deterministic code;
provider subject data is never linked to a Google/email identity automatically.
Stripe support Checkout also has a donor self-claim: the support Worker commits
a random browser token hash into Checkout metadata, the signed webhook stores
that commitment, and private `POST /academy/internal/payment-claim` releases the
code only when the same HttpOnly-cookie token and settled session match. The raw
token is never stored, logged, or exposed as a client-controlled grant request.

## Identity ladder

1. `POST /academy/api/session` exchanges an invite for the existing HttpOnly
   session cookie and returns `accountRequired` (always `true`). No invite —
   seed, class, or paid — can access media or a server profile before account
   binding; the session only authorizes beginning Google OIDC.
2. `POST /academy/api/session/resume` rotates that cookie without spending an
   invite while its fixed 30-day offline-resume window remains valid. Active
   authorization is still renewed in eight-hour windows. Cookies carry a stable
   random family secret and a separate rotating token; D1 retains only their
   HMAC digests. Any cookie from that family can revoke the current row, while
   only the exact current token can authenticate or rotate it.
3. Every seed, paid, and recovery session requires Google before any media,
   profile, pairing, sync, or profile lifecycle route. There is no anonymous
   invite exception.
4. Google Authorization Code + PKCE supplies the durable identity. Only an
   HMAC of Google's stable subject is retained; names, email, photos, browser
   tokens, and Google access/refresh tokens are discarded. Google identifies
   the profile but does not escrow or recover its client-held sync key.
5. Paid codes create auth-only sessions and remain retryable. A paid purchase
   becomes usable only when a verified Google account atomically redeems it.
   Each account can own one paid code and each code can belong to one account.
6. `POST /academy/api/auth/google/recovery` issues an auth-only session for an
   existing account. Before OIDC completes it cannot access server data, and
   an unknown Google subject cannot use recovery to bypass an Academy code.

Local-only Study remains accountless. Server profiles and cross-device sync
always require Google.

## API contract

All JSON responses are `Cache-Control: no-store`. Mutations require the exact
configured `Origin` and same-origin Fetch Metadata. Authentication uses only
the `__Host-academy_session` cookie.

| Method | Route | Contract |
|---|---|---|
| `POST` | `/academy/api/session` | Invite exchange; `accountRequired` is always `true` |
| `POST` | `/academy/api/session/resume` | Rotate a resumable session cookie |
| `POST` | `/academy/api/auth/google/recovery` | Create an auth-only recovery session from `{}` |
| `GET` | `/academy/api/auth/google/start` | Start state + nonce + S256 PKCE OIDC for the current session |
| `GET` | `/academy/api/auth/google/callback` | Verify one-time state and signed Google ID token, then link; every success or failure returns to an allowlisted, code-free Academy URL |
| `GET` | `/academy/api/profile` | Authorized profile id, device id, key version |
| `POST` | `/academy/api/profile/key` | Atomically pin `{ "keyCommitment": "..." }` for first-device initialization |
| `POST` | `/academy/api/pairings` | Create a 100-bit, ten-minute, one-time ticket |
| `PUT` | `/academy/api/pairings/:pairingId` | Attach the encrypted profile-key envelope |
| `POST` | `/academy/api/pairings/claim` | Consume the ticket from a fresh or same-profile device |
| `POST` | `/academy/api/srs/push` | Append up to 50 encrypted event envelopes |
| `GET` | `/academy/api/srs/pull?cursor=0&limit=200` | Pull ordered envelopes; limit max 200 |
| `POST` | `/academy/api/profile/export` | Start with `{}` or continue with `{ "cursor": "..." }` under same-origin mutation protection |
| `DELETE` | `/academy/api/profile` | Delete sync/profile data with `{"confirmation":"delete-profile"}` and return a minimized deletion receipt |
| `POST` | `/academy/api/account/export` | Start with `{}` or continue with `{ "cursor": "..." }` under same-origin mutation protection |
| `DELETE` | `/academy/api/account` | Delete learner identity/profile data with `{"confirmation":"delete-account"}`; retain the declared audit records below |
| `POST` | `/academy/api/admin/lifecycle-proof-grants` | Supervisor-only mint for one account/run-bound production-test grant |
| `POST` | `/academy/api/account/lifecycle-proof/verify` | Verify the authenticated account's grant without consuming it |
| `DELETE` | `/academy/api/account/lifecycle-proof` | Atomically consume the grant and perform the ordinary transactional account deletion |
| `GET` | `/academy/api/entitlement` | Current Google account's safe paid-entitlement projection |
| `POST` | `/academy/api/entitlement/redeem` | Atomically bind `{ "code": "..." }` to the signed-in account |

Existing account, class-board, checkout, media, and
`POST /academy/api/progress/sync` routes remain compatible. The progress route
is an opted-in aggregate projection for the Class Board; it is not the
authoritative event log.

Reader-facing response types and strict projections live in
`src/reader/srs/account-contract.ts`.

All public ids are UUIDs and all times are epoch milliseconds. The new wire
shapes are:

```text
GET  profile        -> { profileId, deviceId, accountId, keyVersion, createdAt }
POST profile/key    <- { keyCommitment: "base64url-sha256" }
                    -> { initialized: true }
GET  entitlement    -> { entitlement: "none" }
                    or { entitlement: "academy", status: "active", redeemedAt }
POST pairings       -> { pairingId, code, expiresAt }
PUT  pairings/:id   <- { keyVersion, salt, nonce, ciphertext }
                     -> { pairingId, ready: true }
POST pairings/claim <- { code }
                     -> { pairingId, profileId, deviceId, keyEnvelope }
POST srs/push       <- { events: EncryptedEvent[] }
                     -> { accepted, inserted, duplicates, conflicts: UUID[] }
GET  srs/pull       -> { events: StoredEncryptedEvent[], nextCursor, hasMore }
```

`StoredEncryptedEvent` adds `cursor`, `sourceDeviceId`, and `receivedAt` to
the event envelope below. Push bodies are limited to 256 KiB, 50 events, and
16 KiB of decoded ciphertext per event. Pairing envelope/claim, event, and
deletion payloads reject unknown fields.

The first profile export response returns `{ schemaVersion, exportedAt,
snapshotSemantics, profile, devices, eventPage }`. Account export adds the safe
account view, aggregate progress, UTC study days, and `paidEntitlement` with
amount/status/timestamps only. It never exports Stripe session ids, purchase
ids, claim hashes, or invite hashes. The Worker freezes the profile's highest
event sequence at export start. Each 200-row page returns a signed,
single-use `exportCursor` tied to the authenticated session, profile, scope,
and a 15-minute server-side traversal. Replays, tampering, expiry, and use by
another session fail closed. Events written after export start are deliberately
excluded from that snapshot. The shipped Academy client follows the protocol
until `hasMore` is false, so traversal size is not capped by the request-rate
budget and exports beyond 24,000 records terminate without gaps or duplicates.
Where the File System Access API is available, each page is serialized directly
to the selected writable file without retaining prior pages. Other browsers use
a chunked Blob fallback capped at 32 MiB and fail explicitly above that bound.

Profile and account deletion return `{ deleted, scope, deletionReceipt }`.
The receipt contains only a random deletion id, scope, timestamp, 90-day
retention deadline, and counts of removed profiles, devices, and synced
records. It retains no account, profile, provider, session, device, or event
identifier and is pruned after 90 days. A profile receipt allows a corrupt
client-held key/profile to be reset while retaining the Google account. An
account receipt confirms removal of the Academy identity, encrypted profile,
imported progress/snapshots, study days, and profile-bound sessions. Permanent
minimal paid-redemption and payment-audit records remain so one-time codes
cannot become transferable and payment/fraud disputes remain auditable.
The daily `17 3 * * *` scheduled handler enforces receipt expiry with three
observable attempts and structured removed-row metrics. Session creation keeps
opportunistic pruning only as a backup.

The deployed proof never authorizes deletion from an operator-entered identity
label. A supervisor mints one HMAC-only grant for the exact existing account,
literal `production` environment, fixed `account-lifecycle-production-test`
scope, and 32-byte run nonce. The runner verifies it after login. The proof
deletion route then consumes and rechecks it in the same D1 batch that gates
the receipt, payment cleanup, session removal, and account cascade. Missing,
expired, consumed, wrong-account, wrong-run, and wrong-environment grants make
every destructive statement a no-op.

## Paid entitlement protocol

1. Checkout inserts a `pending` purchase before calling Stripe. Every origin
   accepts only a test secret key and test Checkout session; live mode fails
   closed until it is separately reviewed and activated. Checkout creation is
   idempotent and uses hosted Stripe Checkout. Payment fulfillment never trusts
   the success redirect.
2. A signed `checkout.session.completed` or
   `checkout.session.async_payment_succeeded` webhook must match mode,
   metadata, session id, GBP amount, and `payment_status=paid`. Delivery is
   idempotent and mints one deterministic HMAC-backed paid code; plaintext code
   is never stored.
3. `GET /academy/api/claim?session_id=cs_...` requires both the initiating
   browser's HttpOnly claim cookie and matching Checkout session id. Pending
   payment returns `202`; fulfilled payment returns the same code on retries.
   Reading the claim and creating paid auth sessions do not consume it.
4. Redemption happens only after verified Google OIDC, or through the explicit
   redeem route from an already signed-in session. OIDC account creation,
   redemption, encrypted-profile attachment, session/membership binding, and
   recovery binding share one D1 transaction with a must-succeed final
   invariant. A profile conflict or injected later failure rolls the entire
   transaction back. A partial unique index remains the concurrency backstop.
   Same-account retries are idempotent.
5. Account deletion revokes the paid invite, clears the Checkout session link,
   nulls the account foreign key, and retains `redeemed_at` as a non-identifying
   tombstone. The code cannot be recovered, transferred, or redeemed again.

## Pairing protocol

The server creates and returns a code formatted as five groups of four
Crockford-style characters. It stores only
`HMAC(ACADEMY_INVITE_HMAC_KEY, "device-pairing:" + compactCode)`.

Before sync or pairing, the first keyed client atomically pins a SHA-256
commitment of its random profile key. D1 never receives the key. An exact
commitment retry is idempotent; a different commitment returns `409` and the
device must pair. This prevents two empty account devices from independently
creating incompatible first keys before either has uploaded an event.

The source device then creates the key envelope sent to the ticket's `PUT`
route:

- profile sync key: 32 random bytes, stored only by clients;
- salt: 16 random bytes;
- wrapping nonce: 12 random bytes;
- wrapping key: HKDF-SHA-256 over UTF-8 compact pairing code, with the supplied
  salt and info `yomu-academy-device-pairing-v1`;
- AES-256-GCM additional data: `pairing:<pairingId>:v<keyVersion>`;
- plaintext: the 32-byte profile sync key;
- resulting `ciphertext`: exactly 48 bytes including the GCM tag.

The target submits the code, receives this envelope after its session is bound
to the source profile, and decrypts locally. A cross-profile claim is accepted
only from a fresh provisional profile with one device, no account, and no
server events. A device already attached to the source profile through account
login may also claim the envelope; this is a key-only transfer and does not
change profile ownership. Unsynced local events are unaffected and can be
decrypted with the provisional key, re-encrypted with the claimed profile key,
and pushed after pairing. Tickets are single-use and expire after ten minutes.

When a learner logs into an existing account, the Worker moves only an empty,
single-device provisional profile onto the account profile. The learner then
pairs with an already keyed device before syncing from the new device. If the
provisional profile already has server events or paired devices, account
linking returns `409` instead of combining encryption domains. Pair into the
account profile before uploading events, or export and delete the independent
profile first. Account login alone can never decrypt or replace a profile sync
key.

## Event-log sync

The event body is encrypted on the client with the 32-byte profile sync key.
D1 receives this fixed envelope only:

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "occurredAt": 1784030400000,
  "keyVersion": 1,
  "nonce": "base64url-12-bytes",
  "ciphertext": "base64url-aes-gcm-ciphertext"
}
```

`id` is a random UUIDv4 created once for the sync envelope. Encrypt the
serialized append-only learner event with AES-256-GCM, a fresh 12-byte nonce,
and additional data `event:<id>:<occurredAt>:v<keyVersion>`. Preserve the same
envelope bytes for retries.

Push is a set union by `(profile_id, event_id)`:

- a new id is inserted;
- the same id and bytes are an idempotent duplicate;
- the same id with different bytes returns HTTP `409` and is never overwritten;
- unrelated events in that request may still have merged and are reported in
  `inserted`, `duplicates`, and `conflicts`.

Pull uses the opaque D1 `sequence` as a cursor. Clients union by event id, sort
or project using the decrypted event timestamps, and re-derive local SRS,
grammar-known, and Academy progress. No last-write-wins mutable snapshot is
used for this sync path. Cursors are profile-scoped: when `profileId` changes
after pairing or account linking, reset the pull cursor to zero.

## Privacy and credentials

- D1 stores encrypted learner-event bytes, opaque ids, timestamps, account
  preferences, and optional aggregate Class Board counters.
- Class Board responses still contain only explicitly opted-in aggregates.
- Pairing codes, invite codes, session tokens, claim tokens, raw IPs, Google
  subjects, and provider credentials have no plaintext D1 column.
- JPDB, Bunpro, Jiten, Anki, and other provider credentials are not learner
  events and must never be sent to these routes. The strict event envelope
  rejects extra plaintext fields. Any future server-side provider bridge needs
  a separately reviewed AES-GCM secret-envelope design backed by a Worker
  secret; plaintext D1 storage is forbidden.
- Exported event pages are bounded and use signed single-use traversal cursors.
  Exports never include token hashes, OAuth-flow state, pairing rows, or
  internal D1 ids.
- Profile deletion removes every profile-bound session (and cascading OAuth
  flow/export traversal), device, encrypted event, pairing, imported progress
  snapshot, and study day, but retains the Academy identity, entitlement, and
  class membership. Account deletion also removes identity and memberships.
  A non-identifying deletion receipt remains for 90 days; permanent minimal
  paid-redemption and payment-audit records remain for code-reuse prevention
  and payment/fraud audit.

## Rate limits

D1 fixed-window counters never retain raw IPs or cookie secrets. Human and
invalid-traffic buckets use an HMAC of the Cloudflare client IP. A resume is
validated before its HMACed session-family budget is charged, so learners
behind a shared school or workplace NAT keep independent limits.

| Bucket | Limit |
|---|---:|
| Session/invite exchange (per client IP) | 10 per 10 minutes |
| Valid session resume (per session family) | 30 per 10 minutes |
| Invalid resume traffic (coarse client-IP protection) | 30 per 10 minutes |
| Google OAuth/recovery | 20 per 10 minutes |
| Checkout | 5 per 10 minutes |
| Payment claim | 30 per 10 minutes |
| Entitlement redemption | 10 per 10 minutes |
| Pairing create | 5 per 10 minutes |
| Pairing claim | 10 per 10 minutes |
| Event push | 120 per 10 minutes |
| Event pull | 300 per 10 minutes |
| Export starts (per authenticated session) | 120 per hour |

Signed continuation pages spend the server-owned traversal established by one
export start and do not consume the export-start counter. This keeps a large
export finite while learners sharing a school/workplace NAT remain isolated.
| Profile/account deletion attempts | 5 per hour |

## D1 migrations

- `0001_access.sql`: invites, sessions, rate limits, checkout claims.
- `0002_accounts.sql`: Google accounts, classes, aggregate board progress.
- `0003_profile_sync.sql`: profiles, devices, one-time pairings, encrypted
  append-only events, and nullable links for legacy sessions.
- `0004_account_entitlements.sql`: atomic account-bound paid redemption,
  one-code constraints, and deletion tombstones.
- `0005_profile_key_commitment.sql`: one atomic client-key commitment per
  profile without server-side key escrow.
- `0006_account_recovery_binding.sql`: completed-link marker that rejects bare
  orphan rows while retaining recovery after deliberate profile deletion.
- `0007_invite_account_requirement.sql`: private invite access metadata and a
  database guard allowing only one account-free invite.
- `0008_all_invites_require_account.sql`: withdraws the account-free exception;
  every invite requires an authenticated account.
- `0009_session_rotation.sql`: indexes the HMACed family prefix used for
  race-safe rotation and family-wide logout; legacy cookies upgrade on resume.
- `0010_payment_ingress.sql`: idempotent verified-provider event, charge,
  subject, and entitlement-projection tables for the private ingress.
- `0011_permanent_donation_access.sql`: normalized donation totals, immutable
  provider events, and durable permanent-access projections.
- `0012_deletion_receipts.sql`: non-identifying profile/account deletion
  receipts with only scope, time, and aggregate removed-row counts.
- `0013_export_traversals_and_retention.sql`: session-bound snapshot export
  cursors plus the 90-day deletion-receipt pruning deadline.
- `0014_lifecycle_proof_grants.sql`: HMAC-only, single-use production proof
  authorization bound to one account, environment, and run nonce.

## Account lifecycle proof

The deterministic proof uses the real Worker router, Web Crypto, and an
in-memory SQLite D1 adapter which automatically applies every migration. It
then reapplies all migrations in isolated Wrangler/Miniflare storage and
smokes recovery-session persistence plus Google-start PKCE through the bundled
Worker entrypoint:

```bash
npm run academy:account-lifecycle:proof:local
```

The credential-gated deployed proof is documented in
`docs/academy/evidence/account-lifecycle/README.md`. It uses two visible Chrome
profiles and real Google callbacks, queries remote D1 through Wrangler, and
uses Cloudflare's immutable active-version module content plus reviewed local
Wrangler output to bind the deployment to source before deleting a dedicated
test account. It exits nonzero when configuration is
missing, a callback is blocked, remote migration state is stale, or any live
assertion is unobserved. Local proof must never be relabelled as deployment
proof.
