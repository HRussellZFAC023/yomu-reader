# Academy infrastructure and protected audio

Scope: the `yomu-academy` Cloudflare Worker (invite sessions, donation
checkout, protected media), the client audio manifest/SFX modules, and the
audio verification/upload script. App wiring is intentionally out of scope.

## Worker (`workers/yomu-academy/`, `wrangler.academy.jsonc`)

Routes are narrow — `yomureader.com/academy/api/*` and
`yomureader.com/academy/media/*` — so the public Academy app shell keeps
loading before login.

| Route | Purpose |
| --- | --- |
| `POST /academy/api/session` | Exchange `{code}` for a session. Exact same-origin only, rate-limited per HMACed client subject, invite consumed atomically (`UPDATE … RETURNING`). Sets `__Host-academy_session` (Secure/HttpOnly/SameSite=Lax) and returns the client contract `{sessionId, expiresAt, offlineResumeUntil}` in epoch ms. |
| `GET /academy/api/session` | Report the live session bound to the cookie. |
| `GET /academy/api/session/status` | Read a state-only shell projection without changing D1, cookies, or rate limits. Signed-out, malformed, unknown, revoked, and elapsed cookies all return `200 {"state":"signed-out"}`. |
| `POST /academy/api/logout` | Revoke the session, clear the cookie. |
| `POST /academy/api/admin/invites` | Bearer-authenticated (timing-safe) invite creation. Send `{code}` to seed a known code (e.g. `<PRIVATE_CLASS_INVITE>`) — only its HMAC persists; omit `code` to have a random one generated and returned exactly once. |
| `POST /academy/api/checkout` | Donation Checkout: a donor-chosen whole-pence amount (`{amountGbp}`, £5–£500), `submit_type=donate`, pinned `Stripe-Version: 2026-02-25.clover`, idempotency key, success/cancel URLs under `ACADEMY_ORIGIN` (success carries `session_id={CHECKOUT_SESSION_ID}`). Returns only a validated `https://checkout.stripe.com/…` URL after linking the returned `cs_…` id to the purchase, and sets the `__Host-academy_claim` cookie. No publishable key anywhere. |
| `POST /academy/api/stripe/webhook` | Bounded raw-body `Stripe-Signature` HMAC with 5-minute tolerance. Handles `checkout.session.completed` and `checkout.session.async_payment_succeeded`; fulfilment is idempotent and retry-safe end-to-end (event-id record, conditional pending→paid update matching the linked `cs_…` id and charged GBP amount, deterministic invite id + `INSERT OR IGNORE`), so a delivery that crashes mid-way is recovered by Stripe's retry. Mints one deterministic single-use paid invite (re-derived, never stored). |
| `GET /academy/api/claim?session_id=cs_…` | The initiating browser retrieves its paid invite with two independent proofs: the HttpOnly claim cookie and the Checkout `session_id` from the success URL, both matching the same purchase; 202 while pending. |
| `GET|HEAD /academy/media/audio/{key}` | Session-authenticated delivery from private R2, exact-match allowlist from `media-manifest.json` (no traversal), single byte ranges, manifest-hash ETag/If-None-Match, `Cache-Control: private`, `Vary: Cookie`. |

Privacy: D1 stores only HMAC digests — invite code hashes, session token
hashes, claim hashes, rate-limit subjects. No plaintext codes/tokens, raw
IPs, or Stripe payloads are stored or logged.

### Deploy (manual, not done by CI)

1. Create the D1 database and paste its id into `wrangler.academy.jsonc`;
   apply `workers/yomu-academy/migrations/` with
   `npx wrangler d1 migrations apply yomu-academy --remote --config wrangler.academy.jsonc`.
2. Create or verify the private R2 bucket `yomu-academy-archive`.
3. Set every secret listed under `secrets.required` with
   `npx wrangler secret put NAME --config wrangler.academy.jsonc`.
4. Deploy, then seed `<PRIVATE_CLASS_INVITE>` through the admin endpoint (bearer
   `ACADEMY_ADMIN_TOKEN`) so the code never appears in source, config, or D1.

## Client audio (`src/academy/audio/`)

`AudioDirector` remains the single audio state machine. New pieces:

- `manifest.ts` + `manifest.json` — the checked-in authorized catalog.
  Entries carry a reviewed rights block and a protected media key;
  `catalogFromManifest`/`sfxSourcesFromManifest` re-check every entry through
  the existing `trackCanPlay` rights gate (release scope enforced in release
  mode). The current catalog maps 13 theme slots and 16 semantic SFX cues to
  allowlisted Persona/Shinday objects whose sizes and SHA-256 values are pinned
  in the Worker manifest.
- `browser-sfx.ts` — `BrowserSfxPlayback`, real `HTMLAudioElement` SFX with a
  small overlap pool and credentialed requests. Unknown or unauthorized cues
  are silent; there is deliberately no oscillator/synth/drone fallback
  anywhere in the stack (test-enforced). Pools are created lazily so the
  enrollment gesture cannot flood protected media before its session exists.

Local Vite acceptance proxies the live API/media boundary. Its development-only
cookie bridge renames Secure `__Host-academy_*` cookies on the HTTP 127.0.0.1
leg, restores the names upstream, and presents mutations as same-origin. The
production Worker and its cookie attributes are unchanged. The access route is
silent; `opening.invitation` begins on the first authenticated Rie screen.

## Audio verification and upload (`scripts/academy-audio-media.mjs`)

Deterministic local verify (default) plus opt-in `--upload`. Local roots come
only from `ACADEMY_PERSONA_AUDIO_ROOT` (keys under `persona/`) and
`ACADEMY_SHINDAY_SFX_ROOT` (keys under `shinday/`); the owner-attested source
files never enter Git. Every file must match the manifest's size and SHA-256
before any upload; uploads go per-file through
`npx wrangler r2 object put … --remote --file … --content-type … --cache-control …`
via an argument vector (no shell interpolation).

## Tests

`tests/academy/academy-worker-{session,stripe,media}.test.ts` and
`tests/academy/audio-manifest-sfx.test.ts`, backed by the in-memory D1/R2
doubles in `tests/academy/helpers/fake-academy-env.ts`. Run with
`npm run test:academy`.

## Live smoke — 2026-07-13

- `POST /academy/api/session` with `<PRIVATE_CLASS_INVITE>`: `200`; one HttpOnly session cookie.
- One owner-authorized minimum donation Checkout was created without payment: `POST /academy/api/checkout` with `{"amountGbp":2}` completed as `200`; the linked D1 purchase is `pending`, the returned Checkout id is live (`cs_live_…`), and the Worker accepted only the validated `checkout.stripe.com` URL before linking it. The claim cookie contract is `__Host-academy_claim; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=86400` with no `Domain`. Wrangler lists `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` by name, and the deployed Worker route includes `POST /academy/api/stripe/webhook`. No payment or claim was attempted.
- Persona `royal-days.flac`: authenticated `HEAD 200`, `Content-Length: 29615879`,
  `Accept-Ranges: bytes`; `bytes=0-1023` returns `206` and exactly 1,024 bytes.
- Shinday `menu-option-select.wav`: authenticated `HEAD 200`,
  `Content-Length: 41240`; `bytes=0-1023` returns `206` and exactly 1,024 bytes.
- Anonymous Persona `HEAD`: `401`.
- Real browser via the local proxy: checkpoint source `cloudflare`; Persona and
  Shinday elements both reached `readyState=4`, played with no media error, and
  the Persona bus reported state `playing`.
