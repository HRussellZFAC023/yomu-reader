export interface ExternalDonation {
  provider: "bmac" | "paypal";
  eventId: string;
  eventType: string;
  occurredAt: number;
  amount: string | number;
  currency: string;
}

export interface PayPalWebhookEnv {
  PAYPAL_CLIENT_ID?: string;
  PAYPAL_CLIENT_SECRET?: string;
  PAYPAL_WEBHOOK_ID?: string;
}

const PAYPAL_API_ORIGIN = "https://api-m.paypal.com";

export function bmacDonationFromPayload(payload: unknown): ExternalDonation | null {
  const event = objectRecord(payload);
  const data = objectRecord(event?.data);
  if (
    !event
    || !data
    || event.type !== "donation.created"
    || event.live_mode !== true
    || !positiveInteger(event.event_id)
    || !positiveInteger(event.created)
    || !positiveInteger(event.attempt)
    || data.object !== "payment"
    || data.status !== "succeeded"
    || data.refunded !== "false"
  ) {
    return null;
  }
  const eventId = boundedReference(data.transaction_id);
  const occurredAt = unixTimestamp(data.created_at);
  const amount = positiveAmount(data.total_amount_charged);
  const currency = currencyCode(data.currency);
  if (!eventId || occurredAt === null || amount === null || !currency) return null;
  return {
    provider: "bmac",
    eventId,
    eventType: "donation.created",
    occurredAt,
    amount,
    currency,
  };
}

export function paypalDonationFromPayload(payload: unknown): ExternalDonation | null {
  const event = objectRecord(payload);
  const resource = objectRecord(event?.resource);
  const amount = objectRecord(resource?.amount);
  if (
    !event
    || !resource
    || !amount
    || event.event_type !== "PAYMENT.CAPTURE.COMPLETED"
    || event.resource_type !== "capture"
    || resource.status !== "COMPLETED"
  ) {
    return null;
  }
  const eventId = boundedReference(resource.id);
  const occurredAt = isoTimestamp(resource.create_time ?? event.create_time);
  const value = positiveAmount(amount.value);
  const currency = currencyCode(amount.currency_code);
  if (!eventId || occurredAt === null || value === null || !currency) return null;
  return {
    provider: "paypal",
    eventId,
    eventType: "PAYMENT.CAPTURE.COMPLETED",
    occurredAt,
    amount: value,
    currency,
  };
}

export async function hasValidBmacSignature(
  rawBody: string,
  signature: string | null,
  secret: string,
): Promise<boolean> {
  if (!/^[a-f0-9]{64}$/iu.test(signature ?? "")) return false;
  const expected = await hmacSha256Hex(secret, rawBody);
  return timingSafeEqualHex(signature!.toLowerCase(), expected);
}

export function paypalWebhookConfigured(env: PayPalWebhookEnv): boolean {
  return Boolean(
    isWebhookCredentialFormat(env.PAYPAL_CLIENT_ID)
    && isWebhookCredentialFormat(env.PAYPAL_CLIENT_SECRET)
    && isProviderReferenceFormat(env.PAYPAL_WEBHOOK_ID),
  );
}

export function isWebhookCredentialFormat(value: unknown): value is string {
  return typeof value === "string" && Boolean(value.trim()) && boundedCredential(value) !== null;
}

export function isProviderReferenceFormat(value: unknown): value is string {
  return typeof value === "string" && Boolean(value.trim()) && boundedReference(value) !== null;
}

export function isNumericProviderReferenceFormat(value: unknown): value is string {
  return isProviderReferenceFormat(value) && /^[1-9]\d*$/u.test(value);
}

export function isThreeLetterCurrencyCode(value: unknown): value is string {
  return typeof value === "string" && /^[A-Z]{3}$/iu.test(value.trim());
}

export async function hasValidPaypalSignature(
  request: Request,
  rawBody: string,
  env: PayPalWebhookEnv,
): Promise<boolean> {
  const clientId = boundedCredential(env.PAYPAL_CLIENT_ID);
  const clientSecret = boundedCredential(env.PAYPAL_CLIENT_SECRET);
  const webhookId = boundedReference(env.PAYPAL_WEBHOOK_ID);
  const transmissionId = boundedHeader(request.headers.get("paypal-transmission-id"));
  const transmissionTime = boundedHeader(request.headers.get("paypal-transmission-time"));
  const certUrl = boundedHeader(request.headers.get("paypal-cert-url"));
  const authAlgo = boundedHeader(request.headers.get("paypal-auth-algo"));
  const transmissionSig = boundedHeader(request.headers.get("paypal-transmission-sig"));
  if (
    !clientId
    || !clientSecret
    || !webhookId
    || !transmissionId
    || !transmissionTime
    || !certUrl
    || !authAlgo
    || !transmissionSig
  ) {
    return false;
  }

  const tokenResponse = await fetch(`${PAYPAL_API_ORIGIN}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      accept: "application/json",
      authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!tokenResponse.ok) return false;
  const accessToken = boundedCredential(
    stringField(objectRecord(await tokenResponse.json().catch(() => null)), "access_token"),
  );
  if (!accessToken) return false;

  // Keep the original event bytes inside the postback body. PayPal's verifier
  // rejects a webhook event that was parsed and then serialized differently.
  const verificationBody = [
    "{",
    `"auth_algo":${JSON.stringify(authAlgo)},`,
    `"cert_url":${JSON.stringify(certUrl)},`,
    `"transmission_id":${JSON.stringify(transmissionId)},`,
    `"transmission_sig":${JSON.stringify(transmissionSig)},`,
    `"transmission_time":${JSON.stringify(transmissionTime)},`,
    `"webhook_id":${JSON.stringify(webhookId)},`,
    `"webhook_event":${rawBody}`,
    "}",
  ].join("");
  const verificationResponse = await fetch(
    `${PAYPAL_API_ORIGIN}/v1/notifications/verify-webhook-signature`,
    {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: verificationBody,
    },
  );
  if (!verificationResponse.ok) return false;
  const result = objectRecord(await verificationResponse.json().catch(() => null));
  return stringField(result, "verification_status") === "SUCCESS";
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringField(record: Record<string, unknown> | null, key: string): string | null {
  const value = record?.[key];
  return typeof value === "string" ? value : null;
}

function boundedReference(value: unknown): string | null {
  return typeof value === "string"
    && value.length >= 3
    && value.length <= 255
    && !/[\u0000-\u001f\u007f]/u.test(value)
    ? value
    : null;
}

function boundedCredential(value: unknown): string | null {
  return typeof value === "string" && value.length >= 3 && value.length <= 2048
    ? value
    : null;
}

function boundedHeader(value: string | null): string | null {
  return value && value.length <= 4096 && !/[\u0000-\u001f\u007f]/u.test(value)
    ? value
    : null;
}

function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function positiveAmount(value: unknown): string | number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value : null;
  }
  return typeof value === "string" && /^\d+(?:\.\d+)?$/u.test(value) && Number(value) > 0
    ? value
    : null;
}

function currencyCode(value: unknown): string | null {
  return isThreeLetterCurrencyCode(value) && value.trim() === value.trim().toUpperCase()
    ? value.trim()
    : null;
}

function unixTimestamp(value: unknown): number | null {
  return positiveInteger(value) ? value * 1000 : null;
}

function isoTimestamp(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

async function hmacSha256Hex(secret: string, value: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return Array.from(new Uint8Array(signature), byte => byte.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqualHex(left: string, right: string): boolean {
  if (left.length !== right.length || !/^[a-f0-9]+$/iu.test(left) || !/^[a-f0-9]+$/iu.test(right)) {
    return false;
  }
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}
