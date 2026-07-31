# Donation provider setup (supervised session)

This checklist is for the **owner-supervised session** where real accounts are
created and real secrets are set. Nothing here needs a code change — the Worker
and homepage already read these values. A provider appears in the homepage bar
only when its public URL uses HTTPS on the exact provider hostname (or its
`www` form), `SUPPORT_DB` is bound, and every required secret is present.
Unready providers stay hidden and report £0 in `/progress`.

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
field (JSON). The stable event key is `message_id`; the payment transaction key
is `kofi_transaction_id`. Every verified positive donation is recorded in its
native currency before Academy delivery is attempted. Supported Academy
transaction currencies grant permanent access, and the code is sent to the
top-level `email`. A missing FX rate leaves the native payment visible through
`needsRate` instead of discarding it; progress includes the payment once a
fresh rate becomes available.

## 3. Buy Me a Coffee (donations page + webhook)

1. Create/confirm a Buy Me a Coffee account and note its public page URL:
   `https://buymeacoffee.com/<yourname>` or
   `https://www.buymeacoffee.com/<yourname>`.
2. In Buy Me a Coffee's webhook settings, register:

   ```text
   https://support.yomureader.com/webhooks/bmac
   ```

   Enable `donation.created`.
3. Store the webhook signing secret:

   ```bash
   npx wrangler secret put BMAC_WEBHOOK_SECRET --config workers/yomu-support/wrangler.jsonc
   ```

4. Set `vars.SUPPORT_PROVIDER_BMAC_URL` to the public page and deploy.

The Worker verifies `X-Signature-Sha256` as HMAC-SHA256 over the exact raw
request body. Do not parse and reserialize the body before verification. A
verified live, successful, non-refunded donation is recorded once in the
support ledger. Buy Me a Coffee is accounting/support-only and does not create
an Academy code.

## 4. PayPal (support page + verified webhook)

1. Create/confirm the public PayPal support URL on `paypal.me` or `paypal.com`.
2. In the supervised PayPal developer session, create or select the production
   REST app and register:

   ```text
   https://support.yomureader.com/webhooks/paypal
   ```

   Subscribe to `PAYMENT.CAPTURE.COMPLETED`.
3. Store the production app credentials and the id of that webhook:

   ```bash
   npx wrangler secret put PAYPAL_CLIENT_ID --config workers/yomu-support/wrangler.jsonc
   npx wrangler secret put PAYPAL_CLIENT_SECRET --config workers/yomu-support/wrangler.jsonc
   npx wrangler secret put PAYPAL_WEBHOOK_ID --config workers/yomu-support/wrangler.jsonc
   ```

4. Set `vars.SUPPORT_PROVIDER_PAYPAL_URL` to the public support URL and deploy.

The Worker obtains a production PayPal access token and posts the transmission
headers, configured webhook id, and exact raw `webhook_event` to PayPal's
`/v1/notifications/verify-webhook-signature` endpoint. Only a `SUCCESS`
verification followed by a completed capture enters the support ledger. PayPal
is accounting/support-only and does not create an Academy code.

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
| `BMAC_WEBHOOK_SECRET` | secret | `wrangler secret put` (Buy Me a Coffee signing secret) |
| `PAYPAL_CLIENT_ID` | secret | `wrangler secret put` (production REST app client id) |
| `PAYPAL_CLIENT_SECRET` | secret | `wrangler secret put` (production REST app client secret) |
| `PAYPAL_WEBHOOK_ID` | secret | `wrangler secret put` (registered webhook id) |
| `PATREON_WEBHOOK_SECRET` | secret | `wrangler secret put` (Patreon webhook secret) |
| `ACADEMY_DELIVERY_ALERT_EMAIL` | secret | `wrangler secret put` (owner alert destination) |
| `SUPPORT_BASE_CURRENCY` | public var | `wrangler.jsonc` `vars` (canonical forecast/accounting currency; keep as GBP) |
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
# Migration 0005 expands the provider ledger to all four external providers:
npx wrangler d1 migrations apply yomu-support --config workers/yomu-support/wrangler.jsonc --remote

npx wrangler deploy --config workers/yomu-support/wrangler.jsonc

# Goal derives from operating-forecast.json (£10.20 exact; public display £10):
curl -s https://support.yomureader.com/goal | jq

# Aggregated month-to-date across Stripe, Ko-fi, BMAC, PayPal, and Patreon:
curl -s https://support.yomureader.com/progress | jq

# Combined status with localized display (?currency=USD, or geo-derived):
curl -s "https://support.yomureader.com/status?currency=USD" | jq '.display, .providers'
```

The homepage bar at https://yomureader.com updates automatically from `/status`
. Each external provider button requires its official HTTPS hostname, the D1
binding, and all of that provider's required secrets. Stripe requires live
Checkout readiness. This keeps unfinished or mistyped destinations out of the
public bar.

After a supervised provider test, inspect Workers logs for delivery errors and
stale-delivery alerts. These events contain opaque delivery state, not recipient
addresses or codes. A successful Stripe, Ko-fi, or qualifying Patreon payment
should leave one `email_accepted` delivery row. The code must be redeemed within
30 days. Buy Me a Coffee and PayPal receipts remain in support accounting and
do not create delivery rows. Use the admin payment-code endpoint or an
owner-issued invite when a code-granting provider cannot supply a recipient.

## 8. Adjusting the goal

The monthly goal follows `workers/yomu-support/operating-forecast.json`
(`max(sum of lineItems.monthlyGBP, floorGBP)`; floor is £10). The checked-in
line items currently total exactly £10.20. Accounting and comparisons retain
£10.20, while the public status bar displays the nearest whole unit, £10.
Update the line items when infrastructure cost changes and redeploy; no code
change is needed. Legacy fixed-goal environment variables are ignored so an
old deployment setting cannot silently override the forecast.
