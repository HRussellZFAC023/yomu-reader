# Yomu Support Worker

Donation and public service-budget status endpoint for `support.yomureader.com`.

Routes:

- `/goal` returns the dynamic monthly donation goal. It reads
  `operating-forecast.json` (checked-in Cloudflare/R2/domain/API line items in
  GBP) and returns `{ floorGBP: 10, forecastGBP, monthlyGoalGBP, breakdown }`
  where `monthlyGoalGBP = max(sum(lineItems), floorGBP)`. `cache-control` 5 min.
- `/progress` returns month-to-date received across providers:
  `{ month, totalThisMonthGbp, totalTodayGbp, providers[] }`. Stripe, Ko-fi, and
  Patreon totals are derived from unique verified-event rows in D1.
- `/status` combines goal + progress + a **localized display**. It accepts
  `?currency=XXX` or derives the currency from `request.cf.country`, converts
  GBP using a daily-cached FX rate, and returns `display: { amount, goal,
  currency, symbol, amountText, goalText, converted }` plus `providers[]` and
  banner copy used by the hosted homepage bar. `cache-control` 5 min.
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
  feed; missing FX never blocks Academy entitlement delivery.
- `/webhooks/kofi` accepts Ko-fi webhooks (shared verification token, GBP only),
  recording each stable provider event exactly once in D1.
- `/webhooks/patreon` accepts Patreon webhooks (HMAC-MD5 signature over the raw
  body). The first verified positive active-membership event grants permanent
  Academy access. Later decline/delete events are audited but never revoke that
  grant; only current `members:pledge:create` receipts create unique
  support-income rows in D1. Deprecated v1 `pledges:*` events are ignored.

Local currency: FX rates come from the free, key-less, ECB-backed
`frankfurter.dev` endpoint (`GET /v1/latest?base=GBP`) and are cached in KV for
24h. Unmapped or unsupported currencies fall back to GBP; the homepage also
falls back to `Intl.NumberFormat` with the visitor's locale.

The donation goal derives from `operating-forecast.json`. See that file and
`PROVIDER-SETUP.md` for the supervised account-setup checklist (Ko-fi / Patreon
/ BMAC / PayPal URLs and secrets, KV namespace creation).

Secrets stay server-side:

```bash
npx wrangler secret put STRIPE_SECRET_KEY --config workers/yomu-support/wrangler.jsonc
npx wrangler secret put STRIPE_WEBHOOK_SECRET --config workers/yomu-support/wrangler.jsonc
```

Use a live-mode Stripe secret (`sk_live_...` or scoped `rk_live_...`) for `support.yomureader.com`.
The Worker refuses known test-mode keys and test Payment Links on the production support host so donations do not redirect to Stripe sandbox Checkout.

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
retryable server error if this bridge is unavailable; support accounting cannot
silently succeed without the matching Academy grant. When active, the
support Worker forwards a canonical event only after verifying the provider's
webhook authentication. Academy ingestion runs before support accounting so a
failure returns 5xx and asks the provider to retry without double-counting the
support ledger on that attempt.

Only native provider identifiers cross the binding. Every verified positive GBP
Stripe support or Ko-fi donation grants a permanent entitlement; Academy-owned
Stripe Checkout still has the stronger exact pending-purchase/session/amount
match. Patreon remains membership state rather than fictional cash receipts,
but its first positive active event grants the same permanent entitlement.
Provider cancellation, expiry, or refund notifications never revoke access.
No payer names, email addresses, bank data, or invite codes are forwarded.

Ko-fi and Patreon do not provide the support site with a same-origin browser
return secret, so code delivery for those providers remains admin-mediated.
Their transaction/member identifiers are deliberately not accepted as public
bearer credentials. PayPal.me is link-only: automatic Academy access requires a
PayPal REST-app Checkout webhook with cryptographic verification; a browser
success callback or PayPal.me reference is not sufficient proof.
