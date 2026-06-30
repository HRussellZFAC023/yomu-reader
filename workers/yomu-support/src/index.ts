const DEFAULT_DAILY_BUDGET_GBP = 10;
const DEFAULT_DONATION_GBP = 5;
const DEFAULT_MIN_DONATION_GBP = 1;
const DEFAULT_MAX_DONATION_GBP = 100;
const DEFAULT_SUPPORT_URL = "https://yomureader.com/support";
const DEFAULT_FALLBACK_DONATE_URL = "https://paypal.me/HenryRussell163";
const STRIPE_CHECKOUT_SESSIONS_URL = "https://api.stripe.com/v1/checkout/sessions";
const READ_METHODS = new Set(["GET", "HEAD"]);

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

interface Env {
  STRIPE_SECRET_KEY?: string;
  SUPPORT_BANNER_ENABLED?: string;
  SUPPORT_DAILY_BUDGET_GBP?: string;
  SUPPORT_DONATION_GOAL_GBP?: string;
  SUPPORT_DONATIONS_TODAY_GBP?: string;
  SUPPORT_ESTIMATED_DAILY_COST_GBP?: string;
  SUPPORT_FALLBACK_DONATE_URL?: string;
  SUPPORT_SUCCESS_URL?: string;
  SUPPORT_CANCEL_URL?: string;
}

interface SupportStatus {
  service: "yomu-support";
  status: "ok" | "stripe-unconfigured";
  currency: "GBP";
  dailyBudgetGbp: number;
  donationGoalGbp: number;
  donationsTodayGbp: number;
  estimatedDailyCostGbp: number;
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
  if (!READ_METHODS.has(request.method.trim().toUpperCase())) {
    return textResponse("Method not allowed.", 405, { allow: "GET, HEAD, OPTIONS" });
  }

  const url = new URL(request.url);
  if (url.pathname === "/status" || url.pathname === "/healthz") {
    return jsonResponse(request, supportStatus(request, env), 200, {
      "cache-control": "public, max-age=60",
    });
  }

  if (url.pathname === "/donate" || url.pathname === "/checkout") {
    return createDonationCheckout(request, env);
  }

  return Response.redirect(DEFAULT_SUPPORT_URL, 302);
}

function supportStatus(request: Request, env: Env): SupportStatus {
  const dailyBudgetGbp = positiveNumberEnv(env.SUPPORT_DAILY_BUDGET_GBP, DEFAULT_DAILY_BUDGET_GBP);
  const donationGoalGbp = positiveNumberEnv(env.SUPPORT_DONATION_GOAL_GBP, dailyBudgetGbp);
  const donationsTodayGbp = nonNegativeNumberEnv(env.SUPPORT_DONATIONS_TODAY_GBP, 0);
  const estimatedDailyCostGbp = nonNegativeNumberEnv(env.SUPPORT_ESTIMATED_DAILY_COST_GBP, 0);
  const goalMet = donationsTodayGbp >= donationGoalGbp;
  const donateUrl = donateUrlFor(request);
  const costLabel = `Running cost target: ${gbp(dailyBudgetGbp)}/day`;
  const goalLabel = `Donations today: ${gbp(donationsTodayGbp)} / ${gbp(donationGoalGbp)}`;
  return {
    service: "yomu-support",
    status: env.STRIPE_SECRET_KEY ? "ok" : "stripe-unconfigured",
    currency: "GBP",
    dailyBudgetGbp,
    donationGoalGbp,
    donationsTodayGbp,
    estimatedDailyCostGbp,
    goalMet,
    donateUrl,
    featuresAtRisk: [
      "shared recorded audio",
      "public CORS fallback",
      "edge-cached Jiten and JPDB public lookups",
    ],
    banner: {
      enabled: !falseyEnv(env.SUPPORT_BANNER_ENABLED),
      dismissVersion: "2026-06-29-v1",
      message: goalMet
        ? "Yomu shared services are funded for today."
        : "Yomu shared services are donation funded. If the daily goal is missed, shared audio and proxy caching may pause.",
      costLabel,
      goalLabel,
      ctaLabel: "Donate",
      donateUrl,
    },
  };
}

async function createDonationCheckout(request: Request, env: Env): Promise<Response> {
  if (!env.STRIPE_SECRET_KEY) {
    return Response.redirect(fallbackDonateUrl(env), 302);
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
    },
    body,
  });
  const payload = await response.json().catch(() => null);
  const checkoutUrl = checkoutSessionUrl(payload);
  if (!response.ok || !checkoutUrl) {
    console.error(JSON.stringify({
      event: "yomu_support_stripe_checkout_failed",
      status: response.status,
    }));
    return Response.redirect(fallbackDonateUrl(env), 302);
  }
  return Response.redirect(checkoutUrl, 303);
}

function donationAmountMinor(url: URL, env: Env): number {
  const raw = url.searchParams.get("amount_gbp") || url.searchParams.get("amount");
  const parsed = raw ? Number(raw) : DEFAULT_DONATION_GBP;
  const min = positiveNumberEnv(undefined, DEFAULT_MIN_DONATION_GBP);
  const max = positiveNumberEnv(undefined, DEFAULT_MAX_DONATION_GBP);
  const pounds = Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : DEFAULT_DONATION_GBP;
  const configuredGoal = positiveNumberEnv(env.SUPPORT_DONATION_GOAL_GBP, DEFAULT_DAILY_BUDGET_GBP);
  return Math.round(Math.min(Math.max(pounds, min), Math.max(max, configuredGoal)) * 100);
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

function fallbackDonateUrl(env: Env): string {
  const fallback = env.SUPPORT_FALLBACK_DONATE_URL?.trim() || DEFAULT_FALLBACK_DONATE_URL;
  try {
    const url = new URL(fallback);
    return url.protocol === "https:" ? url.href : DEFAULT_FALLBACK_DONATE_URL;
  } catch {
    return DEFAULT_FALLBACK_DONATE_URL;
  }
}

function positiveNumberEnv(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
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

function safePath(request: Request): string {
  try {
    return new URL(request.url).pathname;
  } catch {
    return "";
  }
}
