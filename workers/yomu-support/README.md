# Yomu Support Worker

Donation and public service-budget status endpoint for `support.yomureader.com`.

Routes:

- `/status` returns public budget, donation-progress, and banner copy used by the hosted site.
- `/donate` creates a Stripe Checkout session and redirects the user there. If Stripe is not configured yet, it redirects to the fallback donation URL.

Secrets stay server-side:

```bash
npx wrangler secret put STRIPE_SECRET_KEY --config workers/yomu-support/wrangler.jsonc
```

Deploy:

```bash
npx wrangler deploy --config workers/yomu-support/wrangler.jsonc
```
