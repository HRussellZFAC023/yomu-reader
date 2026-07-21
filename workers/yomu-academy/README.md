# Yomu Academy Worker

Cloudflare Worker + D1 boundary for Academy access, Google accounts, paid
entitlements, private media, device pairing, and local-first learner-event
sync.

## Payment mode

Academy does not own a public checkout, Stripe webhook, or browser claim route.
The access screen opens `https://support.yomureader.com/donate` in a separate
tab; the support Worker owns live Checkout and provider verification. It sends
only verified payment envelopes over a private Service binding, while Academy
keeps code redemption and account binding. Stripe credentials therefore belong
to the support Worker and are not Academy bindings.

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
`subject`. `charge.settled` adds a real `transaction` in GBP, USD, EUR, CAD,
AUD, or JPY; Patreon instead sends
`membership.active` with provider-cycle evidence and a positive amount, or
`membership.revoked`. Academy stores accepted grants with no entitlement
expiry; later Patreon cancellation is an audited no-op and cannot create or
remove access. Exact TypeScript validation lives in
`src/payment-ingress.ts`.

The support Worker declares the private Service binding, and the independent
bearer secret must be installed on both Workers before provider webhooks are
enabled. No public provider route targets this internal path. Historical
Academy-owned purchase envelopes still require their exact pre-created purchase,
Checkout session, and amount. Support Stripe sessions use a transaction subject and are
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
| `GET` | `/academy/api/auth/google/callback` | Verify one-time state and signed Google ID token, then link |
| `GET` | `/academy/api/profile` | Authorized profile id, device id, key version |
| `POST` | `/academy/api/profile/key` | Atomically pin `{ "keyCommitment": "..." }` for first-device initialization |
| `POST` | `/academy/api/pairings` | Create a 100-bit, ten-minute, one-time ticket |
| `PUT` | `/academy/api/pairings/:pairingId` | Attach the encrypted profile-key envelope |
| `POST` | `/academy/api/pairings/claim` | Consume the ticket from a fresh or same-profile device |
| `POST` | `/academy/api/srs/push` | Append up to 50 encrypted event envelopes |
| `GET` | `/academy/api/srs/pull?cursor=0&limit=200` | Pull ordered envelopes; limit max 200 |
| `GET` | `/academy/api/profile/export` | Profile metadata plus paginated encrypted events |
| `DELETE` | `/academy/api/profile` | Delete sync/profile data with `{"confirmation":"delete-profile"}` |
| `GET` | `/academy/api/account/export` | Account, aggregate, devices, and event page |
| `DELETE` | `/academy/api/account` | Delete account and all data with `{"confirmation":"delete-account"}` |
| `GET` | `/academy/api/entitlement` | Current Google account's safe paid-entitlement projection |
| `POST` | `/academy/api/entitlement/redeem` | Atomically bind `{ "code": "..." }` to the signed-in account |

Existing account, class-board, media, and
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

Profile export returns `{ schemaVersion, exportedAt, profile, devices,
eventPage }`. Account export adds the safe account view, aggregate progress,
UTC study days, and `paidEntitlement` with amount/status/timestamps only. It
never exports Stripe session ids, purchase ids, claim hashes, or invite
hashes. Encrypted events use the event page's `cursor`, `nextCursor`, and
`hasMore` contract.

## Paid entitlement protocol

1. The support Worker creates hosted live Checkout and never trusts its success
   redirect as payment evidence.
2. After provider verification, support sends an idempotent private payment
   envelope containing the transaction currency, positive whole minor-unit
   amount, and a browser claim commitment. Academy accepts only GBP, USD, EUR,
   CAD, AUD, or JPY and mints one deterministic HMAC-backed paid code; plaintext
   code is never stored.
3. The support return page combines its HttpOnly browser token with the settled
   transaction reference through private `POST /academy/internal/payment-claim`.
   Pending payment returns `202`; fulfilled payment returns the same code on
   retries. Reading the claim and creating paid auth sessions do not consume it.
4. Redemption happens only after verified Google OIDC, or through the explicit
   redeem route from an already signed-in session. One conditional D1 update
   sets `redeemed_by_account_id` and `redeemed_at`; a partial unique index is
   the concurrency backstop. Same-account retries are idempotent. Conflicts and
   interrupted/failed OIDC leave an unredeemed purchase untouched.
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
- Exported event pages are bounded and cursor-paginated. Exports never include
  token hashes, OAuth-flow state, pairing rows, or internal D1 ids.
- Profile deletion removes every paired session (and cascading OAuth flow),
  devices, encrypted events, pairings, and account aggregate learning data,
  but retains account identity, entitlement, and class membership. Account
  deletion removes identity and dependent learning data while retaining only
  the non-identifying paid-redemption tombstone.

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
| Entitlement redemption | 10 per 10 minutes |
| Pairing create | 5 per 10 minutes |
| Pairing claim | 10 per 10 minutes |
| Event push | 120 per 10 minutes |
| Event pull | 300 per 10 minutes |
| Export pages | 120 per hour |
| Profile/account deletion attempts | 5 per hour |

## D1 migrations

- `0001_access.sql`: invites, sessions, rate limits, and legacy purchase claims.
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
