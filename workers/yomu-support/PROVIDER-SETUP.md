# Donation provider setup (supervised session)

This checklist is for the **owner-supervised session** where real accounts are
created and real secrets are set. Nothing here needs a code change — the Worker
and homepage already read these values. Until a provider's URL/secret is filled
in, that provider stays hidden in the homepage bar and reports £0 in `/progress`.

All commands assume you run them from the repo root with the config flag:

```bash
--config workers/yomu-support/wrangler.jsonc
```

The Academy bridge is fail-closed. Before enabling provider webhooks, apply the
Academy payment-ingress migrations, generate one high-entropy token,
and install it as the `PAYMENT_INGRESS_TOKEN` Wrangler secret on both
`yomu-support` and `yomu-academy`. Never put the token in this file or
`wrangler.jsonc`. The checked-in `ACADEMY_PAYMENT_INGRESS` Service binding is
private Worker-to-Worker transport; the bearer token is a second guard against
an accidental public route.

Payment delivery also needs Cloudflare Email Sending for
`notifications.yomureader.com`. The checked-in `ACADEMY_CODE_EMAIL` binding
allows only `academy@notifications.yomureader.com` as the sender. Enable the
domain in the owner-supervised Cloudflare account, then confirm it appears:

```bash
npx wrangler email sending enable notifications.yomureader.com
npx wrangler email sending list
```

Install the owner's alert destination as a secret. This address receives
manual-delivery and stale-delivery notices:

```bash
npx wrangler secret put ACADEMY_DELIVERY_ALERT_EMAIL --config workers/yomu-support/wrangler.jsonc
```

Apply the Academy delivery schema before deploying either Worker:

```bash
npx wrangler d1 migrations apply yomu-academy --config wrangler.academy.jsonc --remote
```

The Academy delivery table contains opaque ids, status, and attempt timestamps.
Recipient addresses and redeemable codes stay in the verified webhook request
and outbound email.

## 0. Prerequisites (once)

The `SUPPORT_KV` namespace that stores the FX-rate cache was created on
2026-07-20 and its id is committed in
`wrangler.jsonc`. To recreate it in a different Cloudflare account, run:

```bash
npx wrangler kv namespace create SUPPORT_KV --config workers/yomu-support/wrangler.jsonc
```

Apply the D1 schema (already required for Stripe donations):

```bash
npx wrangler d1 migrations apply yomu-support --config workers/yomu-support/wrangler.jsonc --remote
```

## 1. Stripe (already live — card payments)

Stripe stays server-side; nothing to add to the public config. Confirm the live
secret and webhook secret are set:

```bash
npx wrangler secret put STRIPE_SECRET_KEY        --config workers/yomu-support/wrangler.jsonc   # sk_live_... or rk_live_...
npx wrangler secret put STRIPE_WEBHOOK_SECRET    --config workers/yomu-support/wrangler.jsonc   # whsec_...
```

Stripe webhook endpoint (Dashboard -> Developers -> Webhooks):

```text
https://support.yomureader.com/stripe/webhook
```

Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`.

## 2. Ko-fi (donations page + webhook)

1. Create/confirm a Ko-fi account and note your public page URL, e.g.
   `https://ko-fi.com/<yourname>`.
2. Ko-fi -> **Settings -> API/Webhooks**. Copy the **Verification Token** shown
   there (this is the shared secret).
3. Set the webhook URL to:

   ```text
   https://support.yomureader.com/webhooks/kofi
   ```

4. Store the verification token as a Worker secret:

   ```bash
   npx wrangler secret put KOFI_WEBHOOK_SECRET --config workers/yomu-support/wrangler.jsonc
   # paste the Ko-fi Verification Token when prompted
   ```

5. Publish the public page URL so the homepage button appears. Edit
   `wrangler.jsonc` -> `vars.SUPPORT_PROVIDER_KOFI_URL` to your `https://ko-fi.com/...`
   page, then `npx wrangler deploy --config workers/yomu-support/wrangler.jsonc`.

Notes: Ko-fi posts `application/x-www-form-urlencoded` with a single `data`
field (JSON). Every verified positive **GBP** donation with stable message and
transaction IDs grants permanent Academy access. The code is sent to the
top-level `email`. Other currencies are ignored and still return `200`.

## 3. Buy Me a Coffee (link only)

BMAC has no simple signed webhook, so it is a **link-only** provider — the button
sends supporters to your page, but its total is not auto-aggregated.

1. Create/confirm a BMAC account; note `https://www.buymeacoffee.com/<yourname>`
   (or `https://buymeacoffee.com/<yourname>`).
2. Edit `wrangler.jsonc` -> `vars.SUPPORT_PROVIDER_BMAC_URL` to that URL, then
   deploy.

(If BMAC totals should count later, add a webhook receiver mirroring the Ko-fi
one; not required for launch.)

## 4. PayPal (link only)

1. Create a PayPal.me link, e.g. `https://paypal.me/<yourname>` (or a hosted
   PayPal donate-button URL).
2. Edit `wrangler.jsonc` -> `vars.SUPPORT_PROVIDER_PAYPAL_URL` to that URL, then
   deploy. Only `https://` URLs are accepted; anything else stays hidden.

PayPal.me is not connected to a REST-app webhook and therefore cannot produce a
cryptographically verified Academy grant. Do not treat its return URL, receipt
number, payer email, or a client-submitted transaction ID as proof. Automatic
access requires a future PayPal REST-app Checkout integration subscribed to
`PAYMENT.CAPTURE.COMPLETED`, with PayPal's webhook signature verified before the
canonical private ingress is called.

## 5. Patreon (join link + webhook)

1. Create/confirm a Patreon page; note the public join URL,
   e.g. `https://www.patreon.com/<yourname>`.
2. Patreon -> **Developers -> Webhooks** (or the Creator webhooks page). Add a
   webhook pointing at:

   ```text
   https://support.yomureader.com/webhooks/patreon
   ```

   Subscribe to the current member triggers (`members:create`,
   `members:update`, `members:delete`, `members:pledge:create`,
   `members:pledge:update`, and `members:pledge:delete`). Do not enable the
   deprecated v1 `pledges:*` triggers. Patreon shows a **secret** for the
   webhook.
3. Store the secret:

   ```bash
   npx wrangler secret put PATREON_WEBHOOK_SECRET --config workers/yomu-support/wrangler.jsonc
   # paste the Patreon webhook secret when prompted
   ```

4. Edit `wrangler.jsonc` -> `vars.SUPPORT_PROVIDER_PATREON_URL` to your join URL,
   then deploy.

Notes: Patreon signs the raw body with **HMAC-MD5** in the `X-Patreon-Signature`
header; the Worker verifies it in constant time. Academy access requires a
positive current entitlement, positive lifetime support, a future
`next_charge_date`, and no free-trial flag. A future
`will_pay_amount_cents` value is not paid evidence. Declines and deletes are
audited but never revoke access already granted. Only pledge-create webhooks
increment the support income total; other membership updates are not counted
as new receipts. A signed skeletal event from Patreon's webhook tester is
acknowledged without granting access or recording income. Pledge amounts are
read from `data.attributes.amount_cents`, falling back to
`currently_entitled_amount_cents`, and treated as GBP-equivalent minor units.
Keep the Patreon page currency in GBP.

The Worker sends the code to the email in the verified member payload. Patreon
may omit that field. The payment still grants permanent access. A missing or
invalid email records `manual_required` only after the owner notice is accepted.
Recover the code through the admin-only payment-code route and send it through
Patreon's member message channel.

## 6. Where each value goes (summary)

| Value | Kind | Where it goes |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | secret | `wrangler secret put` |
| `STRIPE_WEBHOOK_SECRET` | secret | `wrangler secret put` |
| `KOFI_WEBHOOK_SECRET` | secret | `wrangler secret put` (Ko-fi verification token) |
| `PATREON_WEBHOOK_SECRET` | secret | `wrangler secret put` (Patreon webhook secret) |
| `ACADEMY_DELIVERY_ALERT_EMAIL` | secret | `wrangler secret put` (owner alert destination) |
| `SUPPORT_PROVIDER_KOFI_URL` | public var | `wrangler.jsonc` `vars` |
| `SUPPORT_PROVIDER_BMAC_URL` | public var | `wrangler.jsonc` `vars` |
| `SUPPORT_PROVIDER_PAYPAL_URL` | public var | `wrangler.jsonc` `vars` |
| `SUPPORT_PROVIDER_PATREON_URL` | public var | `wrangler.jsonc` `vars` |
| `SUPPORT_KV` id | binding | `wrangler.jsonc` `kv_namespaces[0].id` |
| `ACADEMY_CODE_EMAIL` | Email Sending binding | `wrangler.jsonc` `send_email` |

Public `vars` are safe to commit. Secrets are **never** committed — they live
only in Cloudflare via `wrangler secret put`.

## 7. Deploy and verify

```bash
npx wrangler deploy --config workers/yomu-support/wrangler.jsonc

# Goal derives from operating-forecast.json (max(forecast, £10 floor)):
curl -s https://support.yomureader.com/goal | jq

# Aggregated month-to-date across providers:
curl -s https://support.yomureader.com/progress | jq

# Combined status with localized display (?currency=USD, or geo-derived):
curl -s "https://support.yomureader.com/status?currency=USD" | jq '.display, .providers'
```

The homepage bar at https://yomureader.com updates automatically from `/status`
— provider buttons appear once their URL var is set and deployed.

After a supervised provider test, inspect Workers logs for delivery errors and
stale-delivery alerts. These events contain opaque delivery state, not recipient
addresses or codes. A successful first payment should leave one
`email_accepted` delivery row. The code must be redeemed within 30 days. Use
the admin payment-code endpoint or an owner-issued invite when the provider
cannot supply a recipient.

## 8. Adjusting the goal

The monthly goal follows `workers/yomu-support/operating-forecast.json`
(`max(sum of lineItems.monthlyGBP, floorGBP)`; floor is £10). Update the line
items when infrastructure cost changes and redeploy — no code change needed.
To pin the goal to a fixed value for a test, set
`vars.SUPPORT_DONATION_GOAL_MONTHLY_GBP` (still floored at £10).
