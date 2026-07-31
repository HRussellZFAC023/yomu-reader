# Yomu Support Worker

Donation and public service-budget status endpoint for `support.yomureader.com`.

Routes:

The public `/goal`, `/progress`, `/status`, and `/healthz` GET responses use the
Workers Cache API for five minutes and expose `x-yomu-edge-cache: miss|hit`.
Status cache keys include language and country so localized text and converted
currency do not cross visitors. Cache hits reapply CORS and the canonical
five-minute browser policy.

- `/goal` returns the dynamic monthly donation goal. It reads
  `operating-forecast.json` (checked-in Cloudflare/R2/domain/API line items in
  GBP) and returns `{ floorGBP: 10, forecastGBP, monthlyGoalGBP, breakdown }`
  where `monthlyGoalGBP = max(sum(lineItems), floorGBP)`. The current forecast
  is exactly £10.20; the public bar displays the nearest whole unit, £10, while
  accounting and goal comparisons retain the exact GBP value.
  `cache-control` 5 min.
- `/progress` returns month-to-date received across providers:
  `{ month, totalThisMonthGbp, totalTodayGbp, needsRate, providers[] }`. After
  migration `0005_support_provider_roster.sql` and the Worker are deployed,
  Stripe, Ko-fi, Buy Me a Coffee, PayPal, and Patreon totals are derived from
  unique authenticated event rows in D1.
  `needsRate` counts current-month payments retained in their native currency
  while a reporting-currency conversion is unavailable.
- `/status` combines goal + progress + a **localized display**. It accepts
  `?currency=XXX` or derives the currency from `request.cf.country` and the
  request locale, converts GBP using a daily-cached FX rate, and returns
  `display: { amount, goal, currency, symbol, amountText, goalText, converted }`
  plus `providers[]` and banner copy used by the hosted homepage bar.
  `cache-control` 5 min.
- `/donate` first asks the donor for a currency and amount, then creates a
  Stripe Checkout session in that native currency and redirects the user there.
  Supported ranges are GBP £5–£500, USD $7–$700, EUR €6–€600,
  CAD C$10–C$1,000, AUD A$11–A$1,100, and JPY ¥1,000–¥100,000. There are no
  fixed Stripe donation tiers. It
  commits a random HttpOnly browser claim into Checkout as a SHA-256 hash; the
  same browser returns to `/claim` and receives its single-use Academy code only
  after the signed paid webhook reaches Academy. If Checkout is unavailable,
  the request fails closed so the selected amount and self-claim proof are never
  replaced by a static Payment Link.
  The browser keeps one HttpOnly claim token, so opening a second Checkout before
  completing the first replaces the first tab's claim proof; finish one card
  donation before starting another.
- `/stripe/webhook` accepts signed Stripe Checkout donation webhooks and records
  the exact native amount and currency in D1. Public goal progress converts
  supported native totals to an estimated GBP value using the cached daily FX
  feed; missing FX never blocks Academy entitlement delivery. The verified
  Checkout `customer_details.email` receives the code, while the existing
  same-browser `/claim` route remains a fallback.
- `/webhooks/kofi` accepts Ko-fi webhooks (shared verification token), recording
  each stable `message_id` exactly once before attempting Academy delivery. It
  uses Ko-fi's documented `kofi_transaction_id` for the entitlement and keeps
  the payer's native amount and currency in D1. The verified top-level `email`
  receives the code.
- `/webhooks/bmac` accepts Buy Me a Coffee `donation.created` webhooks. It
  verifies `X-Signature-Sha256` as HMAC-SHA256 over the exact raw request body,
  then records each successful, live, non-refunded payment once. These receipts
  contribute to support accounting only and do not create Academy codes.
- `/webhooks/paypal` accepts completed PayPal capture webhooks. It sends the
  transmission headers, configured webhook id, and exact raw event body to
  PayPal's production `verify-webhook-signature` endpoint before recording the
  capture once. These receipts contribute to support accounting only and do not
  create Academy codes.
- `/webhooks/patreon` accepts Patreon webhooks (HMAC-MD5 signature over the raw
  body). The first verified active-membership event with positive lifetime
  support, a current paid entitlement, and a future membership boundary grants
  permanent Academy access. Free trials and future pledge amounts do not grant
  access. Later decline/delete events are audited but never revoke that grant;
  only current `members:pledge:create` receipts create unique support-income
  rows in D1. Deprecated v1 `pledges:*` events are ignored. A verified member
  email receives the code when Patreon includes it; otherwise the payment
  enters owner-assisted delivery.

Local currency: FX rates come from the free, key-less, ECB-backed
`frankfurter.dev` endpoint (`GET /v1/latest?base=GBP`) and are cached in KV for
24h. GBP is the canonical forecast and accounting currency. Provider events
store the native payment and its converted GBP amount separately. If the
required rate is missing or stale, the event is stored with
`base_amount_minor = 0` and `needs_rate = 1` instead of being dropped. The next
`/progress` or `/status` read includes that native amount as soon as a fresh
rate is available, so a temporary FX outage cannot leave support permanently
under-counted. The homepage formats the chosen display currency with
`Intl.NumberFormat` and the visitor's locale.

The donation goal derives from `operating-forecast.json`. See that file and
`PROVIDER-SETUP.md` for the supervised account-setup checklist (Ko-fi / Patreon
/ BMAC / PayPal URLs and secrets, KV namespace creation).

Secrets stay server-side:

```bash
npx wrangler secret put STRIPE_SECRET_KEY --config workers/yomu-support/wrangler.jsonc
npx wrangler secret put STRIPE_WEBHOOK_SECRET --config workers/yomu-support/wrangler.jsonc
npx wrangler secret put KOFI_WEBHOOK_SECRET --config workers/yomu-support/wrangler.jsonc
npx wrangler secret put BMAC_WEBHOOK_SECRET --config workers/yomu-support/wrangler.jsonc
npx wrangler secret put PAYPAL_CLIENT_ID --config workers/yomu-support/wrangler.jsonc
npx wrangler secret put PAYPAL_CLIENT_SECRET --config workers/yomu-support/wrangler.jsonc
npx wrangler secret put PAYPAL_WEBHOOK_ID --config workers/yomu-support/wrangler.jsonc
npx wrangler secret put PATREON_WEBHOOK_SECRET --config workers/yomu-support/wrangler.jsonc
```

Use a live-mode Stripe secret (`sk_live_...` or scoped `rk_live_...`) for `support.yomureader.com`.
The Worker refuses known test-mode keys and test Payment Links on the production support host so donations do not redirect to Stripe sandbox Checkout.

External provider buttons are emitted only when `SUPPORT_DB` is bound, every
required secret for that provider is non-empty, and the configured page uses
HTTPS on the provider's exact hostname or its `www` form. Accepted hosts are
`ko-fi.com`, `buymeacoffee.com`, `paypal.me` or `paypal.com`, and
`patreon.com`. Stripe is exposed only when live Checkout is ready.

Apply the D1 schema before turning on the webhook in Stripe:

```bash
npx wrangler d1 migrations apply yomu-support --config workers/yomu-support/wrangler.jsonc --remote
```

Stripe webhook endpoint:

```text
https://support.yomureader.com/stripe/webhook
```

Listen for `checkout.session.completed` and `checkout.session.async_payment_succeeded`.

Deploy:

```bash
npx wrangler deploy --config workers/yomu-support/wrangler.jsonc
```

## Academy payment bridge

The support Worker declares a private `ACADEMY_PAYMENT_INGRESS` Service binding
to `yomu-academy`. Install the same independent `PAYMENT_INGRESS_TOKEN` secret
on both Workers before enabling provider webhooks. Signed payments fail with a
retryable server error if this bridge is unavailable. After provider
authentication, the support Worker commits the idempotent accounting event
first, then forwards a canonical Academy envelope when one can be built. A
retryable entitlement or delivery failure can still return 5xx, but the verified
support accounting remains committed. Entitlement identity or delivery can
never erase money that arrived.

Only native provider identifiers cross the payment binding. Academy HMACs those
identifiers before storing them. It does not compare a provider email with a
Google email. Only Stripe, Ko-fi, and Patreon currently grant Academy codes.
Every verified positive Stripe or Ko-fi payment in a supported Academy
transaction currency grants a permanent entitlement. Academy-owned Stripe
Checkout still has the stronger exact pending-purchase/session/amount match.
Patreon remains membership state rather than fictional cash receipts. Its
signed member state must show paid history, current entitlement, and a future
membership boundary before the same permanent entitlement is granted. Buy Me a
Coffee and PayPal receipts are accounting/support-only and never cross the
Academy payment binding. Provider cancellation, expiry, or refund notifications
do not revoke access.

Provider email stays in the verified webhook request and outbound message. It
does not enter Academy or D1. The deterministic code is leased to the support
Worker for the send and is not stored in plaintext. Academy keeps one opaque
delivery row per paid purchase, so webhook retries do not run concurrent sends.
A scheduled audit sends the owner a PII-free alert for pending, retry, stale, or
manual-required delivery. Missing or invalid provider email enters manual
recovery; the admin payment-code route can recover the code from a provider
reference, and the owner invite route can issue a separate code.

The code must be redeemed within 30 days. The resulting entitlement stays with
the Google account that redeemed it, regardless of the provider email. Stripe
retains its same-browser claim flow.

Delivery is at-least-once across the Email Sending and Academy services. A
failure after the email service accepts a message but before Academy records
that acceptance can send the same single-use code again after the five-minute
lease expires. This favors a duplicate message over silent non-delivery; one
successful redemption still consumes the code.
