# Yomu Support Worker

Donation and public service-budget status endpoint for `support.yomureader.com`.

Routes:

- `/goal` returns the dynamic monthly donation goal. It reads
  `operating-forecast.json` (checked-in Cloudflare/R2/domain/API line items in
  GBP) and returns `{ floorGBP: 10, forecastGBP, monthlyGoalGBP, breakdown }`
  where `monthlyGoalGBP = max(sum(lineItems), floorGBP)`. `cache-control` 5 min.
- `/progress` returns month-to-date received across providers:
  `{ month, totalThisMonthGbp, totalTodayGbp, providers[] }`. Stripe comes from
  the D1 ledger; Ko-fi/Patreon totals come from KV (written by their webhooks).
- `/status` combines goal + progress + a **localized display**. It accepts
  `?currency=XXX` or derives the currency from `request.cf.country`, converts
  GBP using a daily-cached FX rate, and returns `display: { amount, goal,
  currency, symbol, amountText, goalText, converted }` plus `providers[]` and
  banner copy used by the hosted homepage bar. `cache-control` 5 min.
- `/donate` creates a Stripe Checkout session and redirects the user there. If Checkout is unavailable, it can redirect to `SUPPORT_STRIPE_PAYMENT_LINK_URL`; without that fallback it returns a clear temporary-unavailable response rather than looping through the support page.
- `/stripe/webhook` accepts signed Stripe Checkout donation webhooks and records GBP donations in D1.
- `/webhooks/kofi` accepts Ko-fi webhooks (shared verification token, GBP only),
  storing the running month total in KV.
- `/webhooks/patreon` accepts Patreon webhooks (HMAC-MD5 signature over the raw
  body), storing the running month total in KV.

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

Optional Stripe-hosted Payment Link fallback:

```bash
npx wrangler secret put SUPPORT_STRIPE_PAYMENT_LINK_URL --config workers/yomu-support/wrangler.jsonc
```

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
