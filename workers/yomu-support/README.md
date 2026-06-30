# Yomu Support Worker

Donation and public service-budget status endpoint for `support.yomureader.com`.

Routes:

- `/status` returns public budget, donation-progress, and banner copy used by the hosted site.
- `/donate` creates a Stripe Checkout session and redirects the user there. If Stripe is not configured yet, it redirects to the fallback donation URL.
- `/stripe/webhook` accepts signed Stripe Checkout donation webhooks and records GBP donations in D1.

Secrets stay server-side:

```bash
npx wrangler secret put STRIPE_SECRET_KEY --config workers/yomu-support/wrangler.jsonc
npx wrangler secret put STRIPE_WEBHOOK_SECRET --config workers/yomu-support/wrangler.jsonc
```

Apply the D1 schema before turning on the webhook in Stripe:

```bash
npx wrangler d1 migrations apply yomu-support --config workers/yomu-support/wrangler.jsonc --remote
```

Deploy:

```bash
npx wrangler deploy --config workers/yomu-support/wrangler.jsonc
```
