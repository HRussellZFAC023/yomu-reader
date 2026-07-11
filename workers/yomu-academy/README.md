# Yomu Academy Worker

This Worker is the access boundary for `/academy`. It serves the Academy app only
after an invite-backed session is present, and it reads course files through the
private `ARCHIVE` R2 binding only. It does not use public R2 URLs.

## Bindings and Secrets

`wrangler.academy.jsonc` is the deployment contract and must generate the
`WorkersEnv` binding type containing:

- `DB`: D1 database.
- `ARCHIVE`: private R2 bucket. Do not attach an R2 public/custom domain to this
  bucket.
- `ASSETS`: the static-assets binding.
- `INVITE_CODE_SECRET`: HMAC key for invite, session, and Checkout claim hashes.
- `ADMIN_TOKEN`: bearer token for class-code creation and revocation.
- Optional Stripe trio: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and
  `STRIPE_PRICE_ID`.

The static-assets configuration must run the Worker before assets are served
(`run_worker_first`) and must map `/academy/...` to the Worker. Otherwise static
assets can bypass this authorization boundary. The Worker rewrites authorized
`/academy/...` requests to the asset directory root internally.

The Worker uses a narrow local binding shape matching `WorkersEnv`, so the
handler remains type-safe if Wrangler emits its global declaration under a
different name. Generate the binding declaration after the Wrangler
configuration is complete:

```bash
npx wrangler types workers/yomu-academy/worker-configuration.d.ts \
  --config wrangler.academy.jsonc --env-interface WorkersEnv
```

Set secrets through Wrangler, never in `wrangler.academy.jsonc`:

```bash
npx wrangler secret put INVITE_CODE_SECRET --config wrangler.academy.jsonc
npx wrangler secret put ADMIN_TOKEN --config wrangler.academy.jsonc
npx wrangler secret put STRIPE_SECRET_KEY --config wrangler.academy.jsonc
npx wrangler secret put STRIPE_WEBHOOK_SECRET --config wrangler.academy.jsonc
npx wrangler secret put STRIPE_PRICE_ID --config wrangler.academy.jsonc
```

`STRIPE_PRICE_ID` is the only price source. The Worker has no hard-coded Stripe
price or amount. If any Stripe secret/price is absent, payment routes return
`503 stripe_unavailable`; class invites and login remain available.

## Database

Apply `migrations/0001_auth.sql` before deployment. When the Wrangler config is
at the repository root, point the D1 binding's `migrations_dir` at
`workers/yomu-academy/migrations`.

```bash
npx wrangler d1 migrations apply yomu-academy --config wrangler.academy.jsonc --remote
```

The schema stores only keyed HMAC hashes of invite codes, session tokens,
Checkout claim tokens, and public-route rate-limit subjects. It indexes active
invite/session lookups, rate-limit cleanup, and Stripe event/session
idempotency keys.

## Routes

Public routes:

- `GET /academy/login` serves a compact invite-code form and a secondary
  **Buy an invite** action. The action posts same-origin JSON to
  `/academy/api/checkout`, announces loading/errors through an ARIA live
  region, and redirects only after client-side validation of an HTTPS
  `checkout.stripe.com` URL.
- `POST /academy/api/login` accepts either form data (`invite`) or JSON
  (`{ "invite": "..." }`) and sets a `__Host-` HttpOnly, Secure,
  SameSite=Lax session cookie.
- `POST /academy/api/checkout` starts a Stripe Checkout session.
- `GET /academy/checkout/success?session_id=...` verifies payment in the same
  browser and displays the one-use paid invite.
- `POST /academy/api/stripe/webhook` accepts signed Stripe Checkout events.

`POST /academy/api/checkout` accepts an empty same-origin JSON object and, on
success, returns `201 { "checkoutUrl": "https://checkout.stripe.com/..." }`.
The login page validates that exact HTTPS host before navigating. Checkout
success and cancel URLs are pinned to `https://yomureader.com`; loopback origins
are accepted only for local development, and any other host gets
`400 invalid_checkout_origin`. A missing Stripe secret or price returns
`503 { error: { code: "stripe_unavailable", ... } }` and is announced in the
page's live status region; no price or secret is sent to the browser.

The login, checkout-creation, and checkout-verification endpoints use keyed,
D1-backed client rate limits: 30 requests per five minutes, 5 per hour, and 12
per five minutes respectively. Throttled requests return `429 rate_limited`
with `Retry-After`; raw client addresses are never stored or logged.

Authenticated routes:

- `GET /academy/api/session`
- `POST /academy/api/logout`
- Every `/academy/...` application asset.
- `GET` and `HEAD /academy/archive/<key>`.

Archive responses validate object keys, keep cache responses private, deny
framing, pass R2 HTTP metadata, expose quoted ETags, support `If-*` and
`If-Range`, single byte ranges, `206`, `416`, and `HEAD`. The Worker fetches R2
objects with the ETag observed by `head()` so a concurrent object replacement is
never streamed under the wrong metadata. Protected application assets receive
the same framing protection.

Administrative routes require `Authorization: Bearer <ADMIN_TOKEN>` and are
timing-safe verified:

- `POST /academy/api/admin/invites`
- `POST /academy/api/admin/invites/<id>/revoke`
- `POST /academy/api/admin/sessions/<id>/revoke`

Example class code creation:

```json
{
  "label": "Tuesday A2",
  "maxUses": 24,
  "expiresInDays": 120
}
```

`expiresAt` can be supplied instead as an ISO timestamp up to ten years away.
Class codes are generated from Web Crypto by default, are returned once in the
admin response, and are stored only as HMAC hashes. To provision a known,
reusable class code instead, include an optional `code` string:

```json
{
  "code": "CLASS-2026",
  "label": "Tuesday A2",
  "maxUses": 100,
  "expiresInDays": 120
}
```

The supplied code follows the same normalization as login: Unicode is
normalized, spaces and hyphens are removed, and the resulting 7-64 uppercase
alphanumeric characters are HMAC-stored only. A duplicate (including a revoked
or expired historical code) returns `409 invite_code_conflict` without exposing
the stored hash or any existing invite data. Omit `code` to retain random code
generation. Login consumes uses atomically; revoking an invite also invalidates
its existing sessions on the next request.

Browser mutations require an exact same-origin `Origin` check. Admin automation
without browser headers is permitted only with the bearer token. The Stripe
webhook is exempt from origin checks because it authenticates the raw request
body using Stripe's signed timestamp/HMAC header.

Configure Stripe to send `checkout.session.completed` and
`checkout.session.async_payment_succeeded` to:

```text
https://<academy-host>/academy/api/stripe/webhook
```

The webhook verifies Stripe's signed raw body, records the payment, and
idempotently creates its single-use paid invite. The success-page endpoint also
retrieves the Checkout Session from Stripe and confirms its completed paid
state, metadata, and browser-bound claim before revealing that invite. This
session-verification path is idempotent as well, so it covers delayed webhooks
without issuing a second code.
