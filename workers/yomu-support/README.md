# Yomu Support Worker

Donation and public service-budget status endpoint for `support.yomureader.com`.

Routes:

- `/status` returns public monthly running-cost, donation-progress, and banner copy used by the hosted site and Study page.
- `/donate` creates a Stripe Checkout session and redirects the user there. If Checkout is unavailable, it can redirect to `SUPPORT_STRIPE_PAYMENT_LINK_URL`; without that fallback it returns a clear temporary-unavailable response rather than looping through the support page.
- `/stripe/webhook` accepts signed Stripe Checkout donation webhooks and records GBP donations in D1.

Secrets stay server-side:

```bash
npx wrangler secret put STRIPE_SECRET_KEY --config workers/yomu-support/wrangler.jsonc
npx wrangler secret put STRIPE_WEBHOOK_SECRET --config workers/yomu-support/wrangler.jsonc
```

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
