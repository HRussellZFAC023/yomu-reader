const DEFAULT_DAILY_BUDGET_GBP = 10;
const DEFAULT_MONTHLY_DONATION_FLOOR_GBP = 10;
const DEFAULT_DONATION_GBP = 5;
const DEFAULT_MIN_DONATION_GBP = 1;
const DEFAULT_MAX_DONATION_GBP = 100;
const DEFAULT_SUPPORT_URL = "https://yomureader.com/support";
const PRODUCTION_SUPPORT_HOSTS = new Set(["support.yomureader.com"]);
const STRIPE_API_VERSION = "2026-02-25.clover";
const STRIPE_CHECKOUT_SESSIONS_URL = "https://api.stripe.com/v1/checkout/sessions";
const STRIPE_WEBHOOK_TOLERANCE_SECONDS = 300;
const SUPPORT_BANNER_DISMISS_VERSION = "ultimate-audio-v1";
const READ_METHODS = new Set(["GET", "HEAD"]);
const STRIPE_DONATION_EVENT_TYPES = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
]);

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

interface Env {
  SUPPORT_DB?: D1Database;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  SUPPORT_BANNER_ENABLED?: string;
  SUPPORT_DAILY_BUDGET_GBP?: string;
  SUPPORT_DONATION_GOAL_GBP?: string;
  SUPPORT_DONATION_GOAL_MONTHLY_GBP?: string;
  SUPPORT_DONATIONS_TODAY_GBP?: string;
  SUPPORT_DONATIONS_THIS_MONTH_GBP?: string;
  SUPPORT_ESTIMATED_DAILY_COST_GBP?: string;
  SUPPORT_ESTIMATED_MONTHLY_COST_GBP?: string;
  SUPPORT_STRIPE_PAYMENT_LINK_URL?: string;
  SUPPORT_SUCCESS_URL?: string;
  SUPPORT_CANCEL_URL?: string;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(): Promise<T | null>;
  run<T = unknown>(): Promise<D1Result<T>>;
}

interface D1Result<T = unknown> {
  results?: T[];
  success?: boolean;
  meta?: { changes?: number };
}

interface SupportStatus {
  service: "yomu-support";
  status: "ok" | "stripe-test-mode" | "stripe-unconfigured";
  currency: "GBP";
  dailyBudgetGbp: number;
  donationGoalGbp: number;
  donationsTodayGbp: number;
  donationsThisMonthGbp: number;
  donationsSource: "d1" | "env";
  estimatedDailyCostGbp: number;
  estimatedMonthlyCostGbp: number;
  goalMet: boolean;
  donateUrl: string;
  featuresAtRisk: string[];
  banner: {
    enabled: boolean;
    dismissVersion: string;
    message: string;
    costLabel: string;
    goalLabel: string;
    ctaLabel: string;
    donateUrl: string;
  };
}

interface DonationSnapshot {
  donationsTodayGbp: number;
  donationsThisMonthGbp: number;
  source: "d1" | "env";
}

interface StripeSignatureVerification {
  timestamp: number;
}

interface StripeDonationEvent {
  id: string;
  eventType: string;
  day: string;
  amountMinor: number;
  currency: "gbp";
  stripeSessionId: string;
  stripeCreatedAt: number;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      return await handleRequest(request, env, ctx);
    } catch (error) {
      console.error(JSON.stringify({
        event: "yomu_support_error",
        message: error instanceof Error ? error.message : "unknown",
        path: safePath(request),
      }));
      return textResponse("Support service unavailable.", 500);
    }
  },
};

async function handleRequest(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
  if (isCorsPreflight(request)) return preflight(request);
  const url = new URL(request.url);

  if (url.pathname === "/stripe/webhook" || url.pathname === "/webhook") {
    return handleStripeWebhook(request, env);
  }

  if (!READ_METHODS.has(request.method.trim().toUpperCase())) {
    return textResponse("Method not allowed.", 405, { allow: "GET, HEAD, OPTIONS" });
  }

  if (url.pathname === "/status" || url.pathname === "/healthz") {
    return jsonResponse(request, await supportStatus(request, env), 200, {
      "cache-control": "public, max-age=60",
    });
  }

  if (url.pathname === "/donate" || url.pathname === "/checkout") {
    return createDonationCheckout(request, env);
  }

  return Response.redirect(DEFAULT_SUPPORT_URL, 302);
}

async function supportStatus(request: Request, env: Env): Promise<SupportStatus> {
  const dailyBudgetGbp = positiveNumberEnv(env.SUPPORT_DAILY_BUDGET_GBP, DEFAULT_DAILY_BUDGET_GBP);
  const estimatedDailyCostGbp = nonNegativeNumberEnv(env.SUPPORT_ESTIMATED_DAILY_COST_GBP, 0);
  const estimatedMonthlyCostGbp = monthlyCostEstimate(env, estimatedDailyCostGbp);
  const donationGoalGbp = monthlyDonationGoal(env, estimatedMonthlyCostGbp);
  const donations = await donationSnapshot(env);
  const donationsTodayGbp = donations.donationsTodayGbp;
  const donationsThisMonthGbp = donations.donationsThisMonthGbp;
  const goalMet = donationsThisMonthGbp >= donationGoalGbp;
  const donateUrl = donateUrlFor(request);
  const costLabel = `Donation goal: ${gbp(donationGoalGbp)}/month`;
  const goalLabel = `This month: ${gbp(donationsThisMonthGbp)} / ${gbp(donationGoalGbp)}`;
  return {
    service: "yomu-support",
    status: stripeStatusFor(request, env),
    currency: "GBP",
    dailyBudgetGbp,
    donationGoalGbp,
    donationsTodayGbp,
    donationsThisMonthGbp,
    donationsSource: donations.source,
    estimatedDailyCostGbp,
    estimatedMonthlyCostGbp,
    goalMet,
    donateUrl,
    featuresAtRisk: ["Ultimate Audio"],
    banner: {
      enabled: !falseyEnv(env.SUPPORT_BANNER_ENABLED),
      dismissVersion: SUPPORT_BANNER_DISMISS_VERSION,
      message: goalMet
        ? "Yomu's Ultimate Audio is funded for this month."
        : "Yomu's Ultimate Audio is donation funded. If this month's goal is missed, fast real-audio playback for words and shadowing will switch off next month.",
      costLabel,
      goalLabel,
      ctaLabel: "Donate",
      donateUrl,
    },
  };
}

async function donationSnapshot(env: Env): Promise<DonationSnapshot> {
  const fallback: DonationSnapshot = {
    donationsTodayGbp: nonNegativeNumberEnv(env.SUPPORT_DONATIONS_TODAY_GBP, 0),
    donationsThisMonthGbp: nonNegativeNumberEnv(
      env.SUPPORT_DONATIONS_THIS_MONTH_GBP,
      nonNegativeNumberEnv(env.SUPPORT_DONATIONS_TODAY_GBP, 0),
    ),
    source: "env",
  };
  if (!env.SUPPORT_DB) return fallback;
  try {
    const [today, month] = await Promise.all([
      env.SUPPORT_DB.prepare(`
      SELECT COALESCE(SUM(amount_minor), 0) AS total_minor
      FROM donation_events
      WHERE day = ? AND currency = 'gbp'
      `).bind(utcDayKey()).first<{ total_minor?: number | null }>(),
      env.SUPPORT_DB.prepare(`
      SELECT COALESCE(SUM(amount_minor), 0) AS total_minor
      FROM donation_events
      WHERE day >= ? AND day < ? AND currency = 'gbp'
      `).bind(utcMonthKey(), nextUtcMonthKey()).first<{ total_minor?: number | null }>(),
    ]);
    return {
      donationsTodayGbp: nonNegativeNumber(today?.total_minor, 0) / 100,
      donationsThisMonthGbp: nonNegativeNumber(month?.total_minor, 0) / 100,
      source: "d1",
    };
  } catch (error) {
    console.error(JSON.stringify({
      event: "yomu_support_donation_status_failed",
      message: error instanceof Error ? error.message : "unknown",
    }));
    return fallback;
  }
}

async function createDonationCheckout(request: Request, env: Env): Promise<Response> {
  const requireLiveStripe = requiresLiveStripe(request);
  const fallbackUrl = fallbackDonateUrl(env, { requireLiveStripe });
  if (requireLiveStripe && stripeKeyMode(env.STRIPE_SECRET_KEY) === "test") {
    logStripeTestModeBlocked(request, "secret_key");
    return fallbackUrl ? Response.redirect(fallbackUrl, 302) : donationUnavailableResponse();
  }

  if (!env.STRIPE_SECRET_KEY) {
    return fallbackUrl ? Response.redirect(fallbackUrl, 302) : donationUnavailableResponse();
  }

  const amountMinor = donationAmountMinor(new URL(request.url), env);
  const body = new URLSearchParams();
  body.set("mode", "payment");
  body.set("submit_type", "donate");
  body.set("success_url", env.SUPPORT_SUCCESS_URL || `${DEFAULT_SUPPORT_URL}?donation=success`);
  body.set("cancel_url", env.SUPPORT_CANCEL_URL || `${DEFAULT_SUPPORT_URL}?donation=cancelled`);
  body.set("line_items[0][quantity]", "1");
  body.set("line_items[0][price_data][currency]", "gbp");
  body.set("line_items[0][price_data][unit_amount]", String(amountMinor));
  body.set("line_items[0][price_data][product_data][name]", "Yomu shared service donation");
  body.set("metadata[yomu_service]", "support");

  const response = await fetch(STRIPE_CHECKOUT_SESSIONS_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "content-type": "application/x-www-form-urlencoded",
      "stripe-version": STRIPE_API_VERSION,
    },
    body,
  });
  const payload = await response.json().catch(() => null);
  const checkoutUrl = checkoutSessionUrl(payload);
  if (checkoutUrl && requireLiveStripe && isStripeTestCheckoutUrl(checkoutUrl)) {
    logStripeTestModeBlocked(request, "checkout_url");
    return fallbackUrl ? Response.redirect(fallbackUrl, 302) : donationUnavailableResponse();
  }
  if (!response.ok || !checkoutUrl) {
    console.error(JSON.stringify({
      event: "yomu_support_stripe_checkout_failed",
      status: response.status,
    }));
    return fallbackUrl ? Response.redirect(fallbackUrl, 302) : donationUnavailableResponse();
  }
  return Response.redirect(checkoutUrl, 303);
}

function donationUnavailableResponse(): Response {
  return textResponse("Stripe donations are temporarily unavailable. Please try again later.", 503, {
    "cache-control": "no-store",
  });
}

async function handleStripeWebhook(request: Request, env: Env): Promise<Response> {
  if (request.method.trim().toUpperCase() !== "POST") {
    return textResponse("Method not allowed.", 405, { allow: "POST" });
  }
  if (!env.STRIPE_WEBHOOK_SECRET || !env.SUPPORT_DB) {
    return textResponse("Stripe webhook is not configured.", 503);
  }

  const payload = await request.text();
  const verification = await verifyStripeSignature(payload, request.headers.get("stripe-signature"), env.STRIPE_WEBHOOK_SECRET);
  if (!verification) return textResponse("Invalid Stripe signature.", 400);

  const event = parseStripeWebhookPayload(payload);
  const donation = stripeDonationFromEvent(event, verification.timestamp);
  if (!donation) return jsonResponse(request, { received: true, recorded: false }, 200);

  await recordDonationEvent(env.SUPPORT_DB, donation);
  return jsonResponse(request, { received: true, recorded: true }, 200);
}

async function verifyStripeSignature(
  payload: string,
  signatureHeader: string | null,
  secret: string,
  nowMs = Date.now(),
): Promise<StripeSignatureVerification | null> {
  const parsed = parseStripeSignatureHeader(signatureHeader);
  if (!parsed || Math.abs(nowMs / 1000 - parsed.timestamp) > STRIPE_WEBHOOK_TOLERANCE_SECONDS) return null;
  const expected = await hmacSha256Hex(secret, `${parsed.timestamp}.${payload}`);
  return parsed.signatures.some(signature => timingSafeEqualHex(signature, expected))
    ? { timestamp: parsed.timestamp }
    : null;
}

function parseStripeSignatureHeader(header: string | null): { timestamp: number; signatures: string[] } | null {
  if (!header) return null;
  const signatures: string[] = [];
  let timestamp = 0;
  for (const part of header.split(",")) {
    const separator = part.indexOf("=");
    if (separator <= 0) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (key === "t") timestamp = Number(value);
    else if (key === "v1" && /^[a-f0-9]{64}$/i.test(value)) signatures.push(value.toLowerCase());
  }
  return Number.isFinite(timestamp) && timestamp > 0 && signatures.length ? { timestamp, signatures } : null;
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
  return bytesToHex(new Uint8Array(signature));
}

function timingSafeEqualHex(left: string, right: string): boolean {
  const leftBytes = hexToBytes(left);
  const rightBytes = hexToBytes(right);
  if (!leftBytes || !rightBytes || leftBytes.length !== rightBytes.length) return false;
  let diff = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    diff |= leftBytes[index]! ^ rightBytes[index]!;
  }
  return diff === 0;
}

function hexToBytes(hex: string): Uint8Array | null {
  if (!/^(?:[a-f0-9]{2})+$/i.test(hex)) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

function parseStripeWebhookPayload(payload: string): unknown {
  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

function stripeDonationFromEvent(event: unknown, receivedTimestamp: number): StripeDonationEvent | null {
  const record = objectRecord(event);
  const eventType = stringField(record, "type");
  if (!record || !eventType || !STRIPE_DONATION_EVENT_TYPES.has(eventType)) return null;
  const id = stringField(record, "id");
  const data = objectRecord(record.data);
  const session = objectRecord(data?.object);
  const amountMinor = numberField(session, "amount_total");
  const currency = stringField(session, "currency")?.toLowerCase();
  const stripeSessionId = stringField(session, "id");
  const paymentStatus = stringField(session, "payment_status");
  if (!id || !stripeSessionId || !amountMinor || amountMinor <= 0 || currency !== "gbp") return null;
  if (paymentStatus && paymentStatus !== "paid" && paymentStatus !== "no_payment_required") return null;
  const stripeCreatedAt = numberField(record, "created") ?? receivedTimestamp;
  return {
    id,
    eventType,
    day: utcDayKey(new Date(stripeCreatedAt * 1000)),
    amountMinor: Math.round(amountMinor),
    currency: "gbp",
    stripeSessionId,
    stripeCreatedAt,
  };
}

async function recordDonationEvent(db: D1Database, donation: StripeDonationEvent): Promise<void> {
  await db.prepare(`
    INSERT OR IGNORE INTO donation_events (
      id,
      day,
      amount_minor,
      currency,
      event_type,
      stripe_session_id,
      stripe_created_at,
      received_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    donation.id,
    donation.day,
    donation.amountMinor,
    donation.currency,
    donation.eventType,
    donation.stripeSessionId,
    donation.stripeCreatedAt,
    new Date().toISOString(),
  ).run();
}

function donationAmountMinor(url: URL, env: Env): number {
  const raw = url.searchParams.get("amount_gbp") || url.searchParams.get("amount");
  const parsed = raw ? Number(raw) : DEFAULT_DONATION_GBP;
  const min = positiveNumberEnv(undefined, DEFAULT_MIN_DONATION_GBP);
  const max = positiveNumberEnv(undefined, DEFAULT_MAX_DONATION_GBP);
  const pounds = Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : DEFAULT_DONATION_GBP;
  const configuredGoal = monthlyDonationGoal(env, monthlyCostEstimate(env, nonNegativeNumberEnv(env.SUPPORT_ESTIMATED_DAILY_COST_GBP, 0)));
  return Math.round(Math.min(Math.max(pounds, min), Math.max(max, configuredGoal)) * 100);
}

function monthlyCostEstimate(env: Env, estimatedDailyCostGbp: number): number {
  const configuredMonthly = nonNegativeNumberEnv(env.SUPPORT_ESTIMATED_MONTHLY_COST_GBP, NaN);
  if (Number.isFinite(configuredMonthly)) return configuredMonthly;
  return estimatedDailyCostGbp * daysInUtcMonth();
}

function monthlyDonationGoal(env: Env, estimatedMonthlyCostGbp: number): number {
  const configuredGoal = positiveNumberEnv(
    env.SUPPORT_DONATION_GOAL_MONTHLY_GBP ?? env.SUPPORT_DONATION_GOAL_GBP,
    estimatedMonthlyCostGbp,
  );
  return Math.max(DEFAULT_MONTHLY_DONATION_FLOOR_GBP, configuredGoal);
}

function checkoutSessionUrl(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const value = (payload as { url?: unknown }).url;
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function donateUrlFor(request: Request): string {
  const url = new URL(request.url);
  url.pathname = "/donate";
  url.search = "";
  url.hash = "";
  return url.href;
}

function stripeStatusFor(request: Request, env: Env): SupportStatus["status"] {
  if (!env.STRIPE_SECRET_KEY) return "stripe-unconfigured";
  return requiresLiveStripe(request) && stripeKeyMode(env.STRIPE_SECRET_KEY) === "test"
    ? "stripe-test-mode"
    : "ok";
}

function requiresLiveStripe(request: Request): boolean {
  try {
    return PRODUCTION_SUPPORT_HOSTS.has(new URL(request.url).hostname.toLowerCase());
  } catch {
    return false;
  }
}

function stripeKeyMode(value: string | undefined): "live" | "test" | "" {
  const trimmed = value?.trim() ?? "";
  if (/^(?:sk|rk)_live_/u.test(trimmed)) return "live";
  if (/^(?:sk|rk)_test_/u.test(trimmed)) return "test";
  return "";
}

function fallbackDonateUrl(env: Env, options: { requireLiveStripe?: boolean } = {}): string {
  const fallback = env.SUPPORT_STRIPE_PAYMENT_LINK_URL?.trim() || "";
  try {
    const url = new URL(fallback);
    if (url.protocol !== "https:") return "";
    if (url.hostname === "yomureader.com" && url.pathname.replace(/\/$/u, "") === "/support") return "";
    if (options.requireLiveStripe && isStripeTestPaymentLinkUrl(url)) return "";
    return url.href;
  } catch {
    return "";
  }
}

function isStripeTestCheckoutUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return isStripeHostedUrl(url) && /^\/c\/pay\/cs_test_/iu.test(url.pathname);
  } catch {
    return false;
  }
}

function isStripeTestPaymentLinkUrl(url: URL): boolean {
  return isStripeHostedUrl(url)
    && url.hostname.toLowerCase() === "buy.stripe.com"
    && url.pathname.split("/").some(segment => /^test(?:_|$)/iu.test(segment));
}

function isStripeHostedUrl(url: URL): boolean {
  return url.hostname.toLowerCase() === "stripe.com" || url.hostname.toLowerCase().endsWith(".stripe.com");
}

function logStripeTestModeBlocked(request: Request, reason: string): void {
  console.error(JSON.stringify({
    event: "yomu_support_stripe_test_mode_blocked",
    reason,
    host: safeHost(request),
  }));
}

function utcMonthKey(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function nextUtcMonthKey(date = new Date()): string {
  const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  return utcMonthKey(next);
}

function daysInUtcMonth(date = new Date()): number {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
}

function positiveNumberEnv(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function nonNegativeNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function nonNegativeNumberEnv(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function gbp(value: number): string {
  return `£${value.toFixed(value % 1 === 0 ? 0 : 2)}`;
}

function isCorsPreflight(request: Request): boolean {
  return request.method === "OPTIONS" && request.headers.has("access-control-request-method");
}

function preflight(request: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

function jsonResponse(
  request: Request,
  body: unknown,
  status: number,
  extraHeaders: Record<string, string> = {},
): Response {
  const headers = corsHeaders(request);
  headers.set("content-type", "application/json; charset=utf-8");
  Object.entries(extraHeaders).forEach(([key, value]) => headers.set(key, value));
  return new Response(request.method === "HEAD" ? null : JSON.stringify(body), { status, headers });
}

function textResponse(text: string, status: number, extraHeaders: Record<string, string> = {}): Response {
  const headers = new Headers({ "content-type": "text/plain; charset=utf-8" });
  Object.entries(extraHeaders).forEach(([key, value]) => headers.set(key, value));
  return new Response(text, { status, headers });
}

function corsHeaders(request: Request): Headers {
  const headers = new Headers();
  headers.set("access-control-allow-origin", request.headers.get("origin") || "*");
  headers.set("access-control-allow-methods", "GET, HEAD, OPTIONS");
  headers.set("access-control-allow-headers", "content-type");
  headers.set("access-control-max-age", "86400");
  headers.set("vary", "Origin");
  return headers;
}

function falseyEnv(value: string | undefined): boolean {
  return /^(?:0|false|no|off)$/i.test(value?.trim() ?? "");
}

function utcDayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

function stringField(record: Record<string, unknown> | null, key: string): string | null {
  const value = record?.[key];
  return typeof value === "string" ? value : null;
}

function numberField(record: Record<string, unknown> | null, key: string): number | null {
  const value = record?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function safePath(request: Request): string {
  try {
    return new URL(request.url).pathname;
  } catch {
    return "";
  }
}

function safeHost(request: Request): string {
  try {
    return new URL(request.url).hostname;
  } catch {
    return "";
  }
}
