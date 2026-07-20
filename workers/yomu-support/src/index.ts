import operatingForecast from "../operating-forecast.json";
import {
  forwardAcademyPayment,
  stablePatreonEventId,
  type AcademyBridgeEnv,
  type AcademyPaymentEnvelope,
} from "./academy-bridge";

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
const STATUS_CACHE_SECONDS = 300;

// Free, key-less, ECB-backed daily FX rates. GBP base; response shape is
// { amount, base, date, rates: { USD: number, ... } }. Cached in KV for 24h.
const FX_RATES_URL = "https://api.frankfurter.dev/v1/latest?base=GBP";
const FX_CACHE_KEY = "fx:GBP:latest";
const FX_CACHE_TTL_SECONDS = 24 * 60 * 60;
const BASE_CURRENCY = "GBP";

// Manual-provider month-to-date totals (Ko-fi / Patreon webhooks) live under
// this KV prefix keyed by "manual:<provider>:<YYYY-MM>" holding integer minor
// units (pence-equivalent GBP). Webhook receivers normalise to GBP before store.
const MANUAL_PROVIDER_KV_PREFIX = "manual";
const MANUAL_PROVIDERS = ["kofi", "patreon", "bmac", "paypal"] as const;
type ManualProvider = (typeof MANUAL_PROVIDERS)[number];

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

interface Env extends AcademyBridgeEnv {
  SUPPORT_DB?: D1Database;
  SUPPORT_KV?: KVNamespace;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  KOFI_WEBHOOK_SECRET?: string;
  PATREON_WEBHOOK_SECRET?: string;
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
  SUPPORT_PROVIDER_KOFI_URL?: string;
  SUPPORT_PROVIDER_BMAC_URL?: string;
  SUPPORT_PROVIDER_PAYPAL_URL?: string;
  SUPPORT_PROVIDER_PATREON_URL?: string;
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

interface OperatingForecastLineItem {
  id: string;
  label: string;
  detail?: string;
  monthlyGBP: number;
  category?: string;
}

interface OperatingForecast {
  currency?: string;
  floorGBP?: number;
  notes?: string;
  lineItems: OperatingForecastLineItem[];
}

interface GoalBreakdownItem {
  id: string;
  label: string;
  detail?: string;
  monthlyGbp: number;
  category?: string;
}

interface GoalResponse {
  service: "yomu-support";
  currency: "GBP";
  floorGBP: number;
  forecastGBP: number;
  monthlyGoalGBP: number;
  breakdown: GoalBreakdownItem[];
}

interface ProviderProgress {
  provider: "stripe" | ManualProvider;
  monthGbp: number;
  source: "d1" | "kv" | "env" | "none";
}

interface ProgressResponse {
  service: "yomu-support";
  currency: "GBP";
  month: string;
  totalThisMonthGbp: number;
  totalTodayGbp: number;
  providers: ProviderProgress[];
  source: "d1" | "env";
}

interface CurrencyDisplay {
  currency: string;
  symbol: string;
  amount: number;
  goal: number;
  amountText: string;
  goalText: string;
  rate: number;
  rateDate: string;
  converted: boolean;
}

interface SupportProviderLink {
  id: "stripe" | ManualProvider;
  label: string;
  url: string;
  kind: "checkout" | "link";
  enabled: boolean;
}

interface SupportStatus {
  service: "yomu-support";
  status: "ok" | "stripe-test-mode" | "stripe-unconfigured";
  currency: "GBP";
  dailyBudgetGbp: number;
  donationGoalGbp: number;
  floorGbp: number;
  forecastGbp: number;
  donationsTodayGbp: number;
  donationsThisMonthGbp: number;
  donationsSource: "d1" | "env";
  estimatedDailyCostGbp: number;
  estimatedMonthlyCostGbp: number;
  goalMet: boolean;
  progressRatio: number;
  donateUrl: string;
  featuresAtRisk: string[];
  providers: SupportProviderLink[];
  breakdown: GoalBreakdownItem[];
  display: CurrencyDisplay;
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

const FORECAST = operatingForecast as OperatingForecast;

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

async function handleRequest(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (isCorsPreflight(request)) return preflight(request);
  const url = new URL(request.url);

  if (url.pathname === "/stripe/webhook" || url.pathname === "/webhook") {
    return handleStripeWebhook(request, env);
  }
  if (url.pathname === "/webhooks/kofi") {
    return handleKofiWebhook(request, env);
  }
  if (url.pathname === "/webhooks/patreon") {
    return handlePatreonWebhook(request, env);
  }

  if (!READ_METHODS.has(request.method.trim().toUpperCase())) {
    return textResponse("Method not allowed.", 405, { allow: "GET, HEAD, OPTIONS" });
  }

  if (url.pathname === "/goal") {
    return jsonResponse(request, buildGoal(env), 200, {
      "cache-control": `public, max-age=${STATUS_CACHE_SECONDS}`,
    });
  }

  if (url.pathname === "/progress") {
    return jsonResponse(request, await buildProgress(env), 200, {
      "cache-control": `public, max-age=${STATUS_CACHE_SECONDS}`,
    });
  }

  if (url.pathname === "/status" || url.pathname === "/healthz") {
    return jsonResponse(request, await supportStatus(request, env, ctx), 200, {
      "cache-control": `public, max-age=${STATUS_CACHE_SECONDS}`,
      "vary": "Origin, Accept-Language",
    });
  }

  if (url.pathname === "/donate" || url.pathname === "/checkout") {
    return createDonationCheckout(request, env);
  }

  return Response.redirect(DEFAULT_SUPPORT_URL, 302);
}

// --- Goal (dynamic, forecast-driven) -------------------------------------

function buildGoal(env: Env): GoalResponse {
  const floorGBP = forecastFloorGbp();
  const breakdown = forecastBreakdown();
  const forecastGBP = round2(breakdown.reduce((sum, item) => sum + item.monthlyGbp, 0));
  const pinnedGoal = positiveNumberEnv(
    env.SUPPORT_DONATION_GOAL_MONTHLY_GBP ?? env.SUPPORT_DONATION_GOAL_GBP,
    NaN,
  );
  const effectiveForecast = Number.isFinite(pinnedGoal) ? pinnedGoal : forecastGBP;
  const monthlyGoalGBP = round2(Math.max(floorGBP, effectiveForecast));
  return {
    service: "yomu-support",
    currency: "GBP",
    floorGBP,
    forecastGBP,
    monthlyGoalGBP,
    breakdown,
  };
}

function forecastBreakdown(): GoalBreakdownItem[] {
  const items = Array.isArray(FORECAST.lineItems) ? FORECAST.lineItems : [];
  return items
    .filter(item => item && typeof item.id === "string")
    .map(item => ({
      id: item.id,
      label: item.label,
      detail: item.detail,
      monthlyGbp: nonNegativeNumber(item.monthlyGBP, 0),
      category: item.category,
    }));
}

function forecastFloorGbp(): number {
  const raw = FORECAST.floorGBP;
  return typeof raw === "number" && Number.isFinite(raw) && raw > 0
    ? raw
    : DEFAULT_MONTHLY_DONATION_FLOOR_GBP;
}

// --- Progress (aggregated month-to-date across providers) -----------------

async function buildProgress(env: Env): Promise<ProgressResponse> {
  const stripe = await donationSnapshot(env);
  const manual = await manualProviderProgress(env);
  const providers: ProviderProgress[] = [
    { provider: "stripe", monthGbp: round2(stripe.donationsThisMonthGbp), source: stripe.source },
    ...manual.providers,
  ];
  const totalThisMonthGbp = round2(providers.reduce((sum, p) => sum + p.monthGbp, 0));
  return {
    service: "yomu-support",
    currency: "GBP",
    month: utcMonthKey(),
    totalThisMonthGbp,
    totalTodayGbp: round2(stripe.donationsTodayGbp),
    providers,
    source: stripe.source,
  };
}

async function manualProviderProgress(env: Env): Promise<{ providers: ProviderProgress[] }> {
  const month = utcMonthKey();
  const providers: ProviderProgress[] = [];
  for (const provider of MANUAL_PROVIDERS) {
    const minor = await readManualProviderMinor(env, provider, month);
    providers.push({
      provider,
      monthGbp: round2(minor / 100),
      source: env.SUPPORT_KV ? "kv" : "none",
    });
  }
  return { providers };
}

async function readManualProviderMinor(env: Env, provider: ManualProvider, month: string): Promise<number> {
  if (!env.SUPPORT_KV) return 0;
  try {
    const raw = await env.SUPPORT_KV.get(manualProviderKey(provider, month));
    const value = raw === null ? 0 : Number(raw);
    return Number.isFinite(value) && value >= 0 ? Math.round(value) : 0;
  } catch (error) {
    console.error(JSON.stringify({
      event: "yomu_support_manual_provider_read_failed",
      provider,
      message: error instanceof Error ? error.message : "unknown",
    }));
    return 0;
  }
}

async function addManualProviderMinor(
  env: Env,
  provider: ManualProvider,
  month: string,
  amountMinor: number,
): Promise<void> {
  if (!env.SUPPORT_KV || amountMinor <= 0) return;
  const key = manualProviderKey(provider, month);
  const current = await readManualProviderMinor(env, provider, month);
  await env.SUPPORT_KV.put(key, String(current + Math.round(amountMinor)));
}

function manualProviderKey(provider: ManualProvider, month: string): string {
  return `${MANUAL_PROVIDER_KV_PREFIX}:${provider}:${month}`;
}

// --- Status (goal + progress + localized display) -------------------------

async function supportStatus(request: Request, env: Env, ctx: ExecutionContext): Promise<SupportStatus> {
  const dailyBudgetGbp = positiveNumberEnv(env.SUPPORT_DAILY_BUDGET_GBP, DEFAULT_DAILY_BUDGET_GBP);
  const estimatedDailyCostGbp = nonNegativeNumberEnv(env.SUPPORT_ESTIMATED_DAILY_COST_GBP, 0);
  const goal = buildGoal(env);
  const donationGoalGbp = goal.monthlyGoalGBP;
  const estimatedMonthlyCostGbp = monthlyCostEstimate(env, estimatedDailyCostGbp);
  const progress = await buildProgress(env);
  const donationsTodayGbp = progress.totalTodayGbp;
  const donationsThisMonthGbp = progress.totalThisMonthGbp;
  const goalMet = donationsThisMonthGbp >= donationGoalGbp;
  const progressRatio = donationGoalGbp > 0 ? Math.min(1, round2(donationsThisMonthGbp / donationGoalGbp)) : 0;
  const donateUrl = donateUrlFor(request);
  const display = await currencyDisplay(request, env, ctx, donationsThisMonthGbp, donationGoalGbp);
  const costLabel = `Donation goal: ${display.goalText}/month`;
  const goalLabel = `This month: ${display.amountText} / ${display.goalText}`;
  return {
    service: "yomu-support",
    status: stripeStatusFor(request, env),
    currency: "GBP",
    dailyBudgetGbp,
    donationGoalGbp,
    floorGbp: goal.floorGBP,
    forecastGbp: goal.forecastGBP,
    donationsTodayGbp,
    donationsThisMonthGbp,
    donationsSource: progress.source,
    estimatedDailyCostGbp,
    estimatedMonthlyCostGbp,
    goalMet,
    progressRatio,
    donateUrl,
    featuresAtRisk: ["Ultimate Audio"],
    providers: providerLinks(request, env),
    breakdown: goal.breakdown,
    display,
    banner: {
      enabled: !falseyEnv(env.SUPPORT_BANNER_ENABLED),
      dismissVersion: SUPPORT_BANNER_DISMISS_VERSION,
      message: goalMet
        ? "Yomu's Ultimate Audio is funded for this month. Thank you."
        : "Yomu's Ultimate Audio is donation funded. If this month's goal is missed, fast real-audio playback for words and shadowing will switch off next month.",
      costLabel,
      goalLabel,
      ctaLabel: "Donate",
      donateUrl,
    },
  };
}

function providerLinks(request: Request, env: Env): SupportProviderLink[] {
  const stripe: SupportProviderLink = {
    id: "stripe",
    label: "Card (Stripe)",
    url: donateUrlFor(request),
    kind: "checkout",
    enabled: true,
  };
  const manual: Array<{ id: ManualProvider; label: string; raw: string | undefined }> = [
    { id: "kofi", label: "Ko-fi", raw: env.SUPPORT_PROVIDER_KOFI_URL },
    { id: "bmac", label: "Buy Me a Coffee", raw: env.SUPPORT_PROVIDER_BMAC_URL },
    { id: "paypal", label: "PayPal", raw: env.SUPPORT_PROVIDER_PAYPAL_URL },
    { id: "patreon", label: "Patreon", raw: env.SUPPORT_PROVIDER_PATREON_URL },
  ];
  const links: SupportProviderLink[] = [stripe];
  for (const entry of manual) {
    const url = safeHttpsUrl(entry.raw);
    links.push({
      id: entry.id,
      label: entry.label,
      url: url ?? "",
      kind: "link",
      enabled: Boolean(url),
    });
  }
  return links;
}

// --- Local-currency display -----------------------------------------------

async function currencyDisplay(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  amountGbp: number,
  goalGbp: number,
): Promise<CurrencyDisplay> {
  const currency = resolveCurrency(request);
  if (currency === BASE_CURRENCY) {
    return gbpDisplay(amountGbp, goalGbp);
  }
  const fx = await fxRateFor(env, ctx, currency);
  if (!fx) return gbpDisplay(amountGbp, goalGbp);
  const amount = round2(amountGbp * fx.rate);
  const goal = round2(goalGbp * fx.rate);
  return {
    currency,
    symbol: currencySymbol(currency),
    amount,
    goal,
    amountText: formatCurrency(amount, currency),
    goalText: formatCurrency(goal, currency),
    rate: fx.rate,
    rateDate: fx.date,
    converted: true,
  };
}

function gbpDisplay(amountGbp: number, goalGbp: number): CurrencyDisplay {
  return {
    currency: BASE_CURRENCY,
    symbol: "£",
    amount: round2(amountGbp),
    goal: round2(goalGbp),
    amountText: formatCurrency(amountGbp, BASE_CURRENCY),
    goalText: formatCurrency(goalGbp, BASE_CURRENCY),
    rate: 1,
    rateDate: "",
    converted: false,
  };
}

function resolveCurrency(request: Request): string {
  const url = new URL(request.url);
  const requested = normaliseCurrencyCode(url.searchParams.get("currency"));
  if (requested) return requested;
  const country = requestCountry(request);
  return country ? (COUNTRY_CURRENCY[country] ?? BASE_CURRENCY) : BASE_CURRENCY;
}

function requestCountry(request: Request): string | null {
  const cf = (request as Request & { cf?: { country?: unknown } }).cf;
  const country = cf && typeof cf.country === "string" ? cf.country : null;
  if (country && /^[A-Z]{2}$/i.test(country)) return country.toUpperCase();
  const header = request.headers.get("cf-ipcountry");
  return header && /^[A-Z]{2}$/i.test(header) ? header.toUpperCase() : null;
}

function normaliseCurrencyCode(value: string | null): string | null {
  const trimmed = value?.trim().toUpperCase() ?? "";
  return /^[A-Z]{3}$/.test(trimmed) && SUPPORTED_CURRENCIES.has(trimmed) ? trimmed : null;
}

async function fxRateFor(
  env: Env,
  ctx: ExecutionContext,
  currency: string,
): Promise<{ rate: number; date: string } | null> {
  const rates = await fxRates(env, ctx);
  if (!rates) return null;
  const rate = rates.rates[currency];
  return typeof rate === "number" && Number.isFinite(rate) && rate > 0
    ? { rate, date: rates.date }
    : null;
}

interface FxRatesPayload {
  base: string;
  date: string;
  rates: Record<string, number>;
}

async function fxRates(env: Env, ctx: ExecutionContext): Promise<FxRatesPayload | null> {
  const cached = await readFxCache(env);
  if (cached) return cached;
  const fetched = await fetchFxRates();
  if (fetched) {
    // Persist without blocking the response when a waitUntil sink exists.
    const write = writeFxCache(env, fetched);
    if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(write);
    else await write;
  }
  return fetched;
}

async function readFxCache(env: Env): Promise<FxRatesPayload | null> {
  if (!env.SUPPORT_KV) return null;
  try {
    const raw = await env.SUPPORT_KV.get(FX_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FxRatesPayload;
    return isFxPayload(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function writeFxCache(env: Env, payload: FxRatesPayload): Promise<void> {
  if (!env.SUPPORT_KV) return;
  try {
    await env.SUPPORT_KV.put(FX_CACHE_KEY, JSON.stringify(payload), {
      expirationTtl: FX_CACHE_TTL_SECONDS,
    });
  } catch (error) {
    console.error(JSON.stringify({
      event: "yomu_support_fx_cache_write_failed",
      message: error instanceof Error ? error.message : "unknown",
    }));
  }
}

async function fetchFxRates(): Promise<FxRatesPayload | null> {
  try {
    const response = await fetch(FX_RATES_URL, {
      headers: { accept: "application/json" },
    });
    if (!response.ok) return null;
    const payload = await response.json().catch(() => null);
    return isFxPayload(payload) ? payload : null;
  } catch (error) {
    console.error(JSON.stringify({
      event: "yomu_support_fx_fetch_failed",
      message: error instanceof Error ? error.message : "unknown",
    }));
    return null;
  }
}

function isFxPayload(value: unknown): value is FxRatesPayload {
  const record = objectRecord(value);
  if (!record) return false;
  const base = stringField(record, "base");
  const date = stringField(record, "date");
  const rates = objectRecord(record.rates);
  return base === BASE_CURRENCY && Boolean(date) && Boolean(rates);
}

// --- Existing status donation snapshot (Stripe, D1-backed) ----------------

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

  const amountMinor = donationAmountMinor(new URL(request.url));
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

// --- Stripe webhook (unchanged behaviour) ---------------------------------

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

  await forwardAcademyPayment(env, stripeAcademyEnvelope(event, donation));
  await recordDonationEvent(env.SUPPORT_DB, donation);
  return jsonResponse(request, { received: true, recorded: true }, 200);
}

// --- Ko-fi webhook (shared-secret verification token) ---------------------

async function handleKofiWebhook(request: Request, env: Env): Promise<Response> {
  if (request.method.trim().toUpperCase() !== "POST") {
    return textResponse("Method not allowed.", 405, { allow: "POST" });
  }
  if (!env.KOFI_WEBHOOK_SECRET || !env.SUPPORT_KV) {
    return textResponse("Ko-fi webhook is not configured.", 503);
  }

  // Ko-fi posts application/x-www-form-urlencoded with a single `data` field
  // whose JSON body includes a `verification_token` the account owner sets in
  // the Ko-fi webhooks page. We compare it in constant time.
  const data = await readKofiPayload(request);
  const record = objectRecord(parseJson(data));
  if (!record) return textResponse("Invalid Ko-fi payload.", 400);

  const token = stringField(record, "verification_token") ?? "";
  if (!timingSafeEqualString(token, env.KOFI_WEBHOOK_SECRET)) {
    logWebhookRejected("kofi");
    return textResponse("Invalid Ko-fi verification token.", 401);
  }

  const amountMinor = gbpMinorFromProviderAmount(record, "amount", "currency");
  if (amountMinor <= 0) return jsonResponse(request, { received: true, recorded: false }, 200);
  await forwardAcademyPayment(env, kofiAcademyEnvelope(record, amountMinor));
  await addManualProviderMinor(env, "kofi", utcMonthKey(), amountMinor);
  return jsonResponse(request, { received: true, recorded: true }, 200);
}

async function readKofiPayload(request: Request): Promise<string> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) return request.text();
  const form = new URLSearchParams(await request.text());
  return form.get("data") ?? "";
}

// --- Patreon webhook (HMAC-MD5 of raw body per Patreon spec) ---------------

async function handlePatreonWebhook(request: Request, env: Env): Promise<Response> {
  if (request.method.trim().toUpperCase() !== "POST") {
    return textResponse("Method not allowed.", 405, { allow: "POST" });
  }
  if (!env.PATREON_WEBHOOK_SECRET || !env.SUPPORT_KV) {
    return textResponse("Patreon webhook is not configured.", 503);
  }

  const raw = await request.text();
  if (!(await hasValidPatreonSignature(request, env.PATREON_WEBHOOK_SECRET, raw))) {
    logWebhookRejected("patreon");
    return textResponse("Invalid Patreon signature.", 401);
  }

  return handleVerifiedPatreonWebhook(request, env, raw);
}

async function handleVerifiedPatreonWebhook(request: Request, env: Env, raw: string): Promise<Response> {
  const trigger = request.headers.get("x-patreon-event") ?? "";
  if (!isPatreonMembershipTrigger(trigger)) {
    return jsonResponse(request, { received: true, recorded: false }, 200);
  }
  const parsed = parseJson(raw);
  await forwardAcademyPayment(env, await patreonAcademyEnvelope(trigger, raw, parsed));
  if (!isPatreonIncomeTrigger(trigger)) {
    return jsonResponse(request, { received: true, recorded: false }, 200);
  }
  const amountMinor = patreonPledgeMinor(parsed);
  if (amountMinor <= 0) return jsonResponse(request, { received: true, recorded: false }, 200);
  await addManualProviderMinor(env, "patreon", utcMonthKey(), amountMinor);
  return jsonResponse(request, { received: true, recorded: true }, 200);
}

async function hasValidPatreonSignature(request: Request, secret: string, raw: string): Promise<boolean> {
  const signature = request.headers.get("x-patreon-signature");
  if (!signature) return false;
  const expected = await hmacMd5Hex(secret, raw);
  return timingSafeEqualHex(signature.toLowerCase(), expected);
}

function patreonPledgeMinor(payload: unknown): number {
  const record = objectRecord(payload);
  const data = objectRecord(record?.data);
  const attributes = objectRecord(data?.attributes);
  // Patreon amounts are integer cents in the pledge/member currency. We treat
  // the value as GBP-equivalent; the owner keeps a single Patreon currency.
  const cents = numberField(attributes, "amount_cents")
    ?? numberField(attributes, "currently_entitled_amount_cents")
    ?? numberField(attributes, "will_pay_amount_cents");
  return typeof cents === "number" && cents > 0 ? Math.round(cents) : 0;
}

function stripeAcademyEnvelope(event: unknown, donation: StripeDonationEvent): AcademyPaymentEnvelope | null {
  const record = objectRecord(event);
  const data = objectRecord(record?.data);
  const session = objectRecord(data?.object);
  const metadata = objectRecord(session?.metadata);
  const purchaseId = providerReference(metadata?.yomu_academy_purchase);
  const eventId = providerReference(donation.id);
  const sessionId = providerReference(donation.stripeSessionId);
  const occurredAt = providerTimestamp(donation.stripeCreatedAt);
  const references = { purchaseId, eventId, sessionId };
  if (!hasStripeAcademyReferences(references)) return null;
  if (occurredAt === null || !isAcademyAmount(donation.amountMinor)) return null;
  return {
    schemaVersion: 1,
    provider: "stripe",
    eventId: references.eventId,
    eventType: "charge.settled",
    occurredAt,
    subject: { kind: "academy_purchase", reference: references.purchaseId },
    transaction: {
      reference: references.sessionId,
      sessionReference: references.sessionId,
      currency: "gbp",
      amountMinor: donation.amountMinor,
    },
    purchaseId: references.purchaseId,
  };
}

function hasStripeAcademyReferences(
  references: { purchaseId: string | null; eventId: string | null; sessionId: string | null },
): references is { purchaseId: string; eventId: string; sessionId: string } {
  return Object.values(references).every(value => value !== null);
}

function kofiAcademyEnvelope(record: Record<string, unknown>, amountMinor: number): AcademyPaymentEnvelope | null {
  if (!isAcademyAmount(amountMinor)) return null;
  const eventId = providerReference(record.message_id);
  const transactionId = providerReference(record.transaction_id);
  const occurredAt = providerTimestamp(record.timestamp);
  if (!eventId || !transactionId || occurredAt === null) return null;
  return {
    schemaVersion: 1,
    provider: "kofi",
    eventId,
    eventType: "charge.settled",
    occurredAt,
    subject: { kind: "transaction", reference: transactionId },
    transaction: { reference: transactionId, currency: "gbp", amountMinor },
  };
}

async function patreonAcademyEnvelope(
  trigger: string,
  rawBody: string,
  payload: unknown,
): Promise<AcademyPaymentEnvelope | null> {
  const context = patreonContext(payload);
  if (!context) return null;
  const eventId = await stablePatreonEventId(trigger, rawBody);
  if (isPatreonRevocation(trigger, context.status)) {
    return patreonRevocationEnvelope(eventId, context);
  }
  return patreonActiveEnvelope(eventId, context, payload);
}

interface PatreonContext {
  readonly attributes: Record<string, unknown>;
  readonly memberId: string;
  readonly occurredAt: number;
  readonly status: string;
}

function patreonContext(payload: unknown): PatreonContext | null {
  const record = objectRecord(payload);
  const data = childRecord(record, "data");
  const attributes = childRecord(data, "attributes");
  const memberId = providerReference(fieldValue(data, "id"));
  const occurredAt = firstProviderTimestamp([
    fieldValue(attributes, "updated_at"),
    fieldValue(attributes, "last_charge_date"),
  ]);
  if (!memberId || occurredAt === null) return null;
  return {
    attributes: attributesOrEmpty(attributes),
    memberId,
    occurredAt,
    status: lowerCaseStringField(attributes, "patron_status"),
  };
}

function childRecord(record: Record<string, unknown> | null, key: string): Record<string, unknown> | null {
  return objectRecord(fieldValue(record, key));
}

function fieldValue(record: Record<string, unknown> | null, key: string): unknown {
  if (!record) return undefined;
  return record[key];
}

function attributesOrEmpty(attributes: Record<string, unknown> | null): Record<string, unknown> {
  if (!attributes) return {};
  return attributes;
}

function lowerCaseStringField(record: Record<string, unknown> | null, key: string): string {
  const value = stringField(record, key);
  if (!value) return "";
  return value.toLowerCase();
}

function patreonRevocationEnvelope(eventId: string, context: PatreonContext): AcademyPaymentEnvelope {
  return {
    schemaVersion: 1,
    provider: "patreon",
    eventId,
    eventType: "membership.revoked",
    occurredAt: context.occurredAt,
    subject: { kind: "member", reference: context.memberId },
  };
}

function patreonActiveEnvelope(
  eventId: string,
  context: PatreonContext,
  payload: unknown,
): AcademyPaymentEnvelope | null {
  if (context.status !== "active_patron") return null;
  const qualifyingAmountMinor = patreonPledgeMinor(payload);
  const expiresAt = providerTimestamp(context.attributes.next_charge_date);
  if (!isAcademyAmount(qualifyingAmountMinor)) return null;
  if (expiresAt === null) return null;
  if (expiresAt <= context.occurredAt) return null;
  return {
    schemaVersion: 1,
    provider: "patreon",
    eventId,
    eventType: "membership.active",
    occurredAt: context.occurredAt,
    subject: { kind: "member", reference: context.memberId },
    entitlement: { expiresAt, qualifyingAmountMinor },
  };
}

function isPatreonRevocation(trigger: string, status: string): boolean {
  if (/(?:delete|decline)/i.test(trigger)) return true;
  return new Set(["former_patron", "declined_patron"]).has(status);
}

function firstProviderTimestamp(values: readonly unknown[]): number | null {
  for (const value of values) {
    const timestamp = providerTimestamp(value);
    if (timestamp !== null) return timestamp;
  }
  return null;
}

function isAcademyAmount(amountMinor: number): boolean {
  return amountMinor >= 200 && amountMinor <= 50_000;
}

function providerTimestamp(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const parsed = typeof value === "number" ? value : Date.parse(value);
  const milliseconds = parsed > 0 && parsed < 10_000_000_000 ? parsed * 1000 : parsed;
  return Number.isSafeInteger(milliseconds)
    && milliseconds >= 1_500_000_000_000
    && milliseconds <= 4_102_444_800_000
    ? milliseconds
    : null;
}

function providerReference(value: unknown): string | null {
  return typeof value === "string"
    && value.length >= 3
    && value.length <= 255
    && !/[\u0000-\u001f\u007f]/u.test(value)
    ? value
    : null;
}

function isPatreonMembershipTrigger(trigger: string): boolean {
  return /^(?:pledges?:|members:(?:pledge:)?(?:create|update|delete|decline))/i.test(trigger);
}

/** Membership state updates are not receipts. Count only pledge creation. */
function isPatreonIncomeTrigger(trigger: string): boolean {
  return /^(?:pledges?|members:pledge):create$/iu.test(trigger.trim());
}

function gbpMinorFromProviderAmount(
  record: Record<string, unknown>,
  amountKey: string,
  currencyKey: string,
): number {
  const currency = (stringField(record, currencyKey) ?? BASE_CURRENCY).toUpperCase();
  if (currency !== BASE_CURRENCY) return 0; // Only count native-GBP entries.
  const raw = record[amountKey];
  const value = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) : 0;
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

// Patreon signs webhooks with HMAC-MD5. WebCrypto omits MD5, so this is a
// dependency-free MD5-HMAC over the raw request body.
async function hmacMd5Hex(secret: string, value: string): Promise<string> {
  const encoder = new TextEncoder();
  let key: Uint8Array = encoder.encode(secret);
  if (key.length > 64) key = md5Bytes(key);
  const block = new Uint8Array(64);
  block.set(key);
  const ipad = new Uint8Array(64);
  const opad = new Uint8Array(64);
  for (let i = 0; i < 64; i += 1) {
    ipad[i] = block[i]! ^ 0x36;
    opad[i] = block[i]! ^ 0x5c;
  }
  const inner = md5Bytes(concatBytes(ipad, encoder.encode(value)));
  return bytesToHex(md5Bytes(concatBytes(opad, inner)));
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

function timingSafeEqualString(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a[index]! ^ b[index]!;
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

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
}

// Compact MD5 (RFC 1321) over bytes. Used only for Patreon HMAC-MD5.
function md5Bytes(input: Uint8Array): Uint8Array {
  const s = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ];
  const K = new Int32Array(64);
  for (let i = 0; i < 64; i += 1) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) | 0;

  const originalLengthBits = input.length * 8;
  const paddedLength = ((input.length + 8) >> 6 << 6) + 64;
  const bytes = new Uint8Array(paddedLength);
  bytes.set(input);
  bytes[input.length] = 0x80;
  const view = new DataView(bytes.buffer);
  view.setUint32(paddedLength - 8, originalLengthBits >>> 0, true);
  view.setUint32(paddedLength - 4, Math.floor(originalLengthBits / 4294967296) >>> 0, true);

  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  const rotl = (x: number, c: number) => (x << c) | (x >>> (32 - c));

  for (let offset = 0; offset < paddedLength; offset += 64) {
    const M = new Int32Array(16);
    for (let i = 0; i < 16; i += 1) M[i] = view.getUint32(offset + i * 4, true) | 0;
    let A = a0, B = b0, C = c0, D = d0;
    for (let i = 0; i < 64; i += 1) {
      let F: number;
      let g: number;
      if (i < 16) { F = (B & C) | (~B & D); g = i; }
      else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
      else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
      else { F = C ^ (B | ~D); g = (7 * i) % 16; }
      F = (F + A + K[i]! + M[g]!) | 0;
      A = D; D = C; C = B;
      B = (B + rotl(F, s[i]!)) | 0;
    }
    a0 = (a0 + A) | 0;
    b0 = (b0 + B) | 0;
    c0 = (c0 + C) | 0;
    d0 = (d0 + D) | 0;
  }

  const out = new Uint8Array(16);
  const outView = new DataView(out.buffer);
  outView.setUint32(0, a0 >>> 0, true);
  outView.setUint32(4, b0 >>> 0, true);
  outView.setUint32(8, c0 >>> 0, true);
  outView.setUint32(12, d0 >>> 0, true);
  return out;
}

function parseStripeWebhookPayload(payload: string): unknown {
  return parseJson(payload);
}

function parseJson(payload: string): unknown {
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

function donationAmountMinor(url: URL): number {
  const raw = url.searchParams.get("amount_gbp") || url.searchParams.get("amount");
  const parsed = raw ? Number(raw) : DEFAULT_DONATION_GBP;
  const min = positiveNumberEnv(undefined, DEFAULT_MIN_DONATION_GBP);
  const max = positiveNumberEnv(undefined, DEFAULT_MAX_DONATION_GBP);
  const pounds = Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : DEFAULT_DONATION_GBP;
  return Math.round(pounds * 100);
}

function monthlyCostEstimate(env: Env, estimatedDailyCostGbp: number): number {
  const configuredMonthly = nonNegativeNumberEnv(env.SUPPORT_ESTIMATED_MONTHLY_COST_GBP, NaN);
  if (Number.isFinite(configuredMonthly)) return configuredMonthly;
  if (estimatedDailyCostGbp > 0) return estimatedDailyCostGbp * daysInUtcMonth();
  // Fall back to the forecast total so the "estimated monthly cost" figure is
  // meaningful even when no per-day override is configured.
  return buildGoal(env).forecastGBP;
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

function safeHttpsUrl(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function logStripeTestModeBlocked(request: Request, reason: string): void {
  console.error(JSON.stringify({
    event: "yomu_support_stripe_test_mode_blocked",
    reason,
    host: safeHost(request),
  }));
}

function logWebhookRejected(provider: string): void {
  console.error(JSON.stringify({
    event: "yomu_support_webhook_rejected",
    provider,
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

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function formatCurrency(value: number, currency: string): string {
  const symbol = currencySymbol(currency);
  const body = ZERO_DECIMAL_CURRENCIES.has(currency)
    ? String(Math.round(value))
    : value.toFixed(value % 1 === 0 ? 0 : 2);
  return symbol ? `${symbol}${body}` : `${body} ${currency}`;
}

function currencySymbol(currency: string): string {
  return CURRENCY_SYMBOLS[currency] ?? "";
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

// --- Currency reference tables --------------------------------------------

// Minimal, widely-used display currencies. Frankfurter provides ECB rates for
// all of these against GBP. Anything not listed falls back to GBP.
const CURRENCY_SYMBOLS: Record<string, string> = {
  GBP: "£",
  USD: "$",
  EUR: "€",
  JPY: "¥",
  AUD: "A$",
  CAD: "C$",
  CHF: "CHF ",
  CNY: "¥",
  HKD: "HK$",
  NZD: "NZ$",
  SGD: "S$",
  SEK: "kr ",
  NOK: "kr ",
  DKK: "kr ",
  PLN: "zł ",
  CZK: "Kč ",
  BRL: "R$",
  MXN: "MX$",
  INR: "₹",
  KRW: "₩",
  ZAR: "R ",
  TRY: "₺",
  THB: "฿",
  IDR: "Rp ",
  PHP: "₱",
  MYR: "RM ",
};

const SUPPORTED_CURRENCIES = new Set(Object.keys(CURRENCY_SYMBOLS));

// Currencies conventionally shown without minor units.
const ZERO_DECIMAL_CURRENCIES = new Set(["JPY", "KRW", "IDR"]);

// Cloudflare request.cf.country -> preferred display currency. Only the most
// common visitor regions are mapped; unmapped countries fall back to GBP.
const COUNTRY_CURRENCY: Record<string, string> = {
  GB: "GBP",
  US: "USD",
  JP: "JPY",
  AU: "AUD",
  CA: "CAD",
  CH: "CHF",
  CN: "CNY",
  HK: "HKD",
  NZ: "NZD",
  SG: "SGD",
  SE: "SEK",
  NO: "NOK",
  DK: "DKK",
  PL: "PLN",
  CZ: "CZK",
  BR: "BRL",
  MX: "MXN",
  IN: "INR",
  KR: "KRW",
  ZA: "ZAR",
  TR: "TRY",
  TH: "THB",
  ID: "IDR",
  PH: "PHP",
  MY: "MYR",
  // Euro area
  AT: "EUR", BE: "EUR", CY: "EUR", DE: "EUR", EE: "EUR", ES: "EUR", FI: "EUR",
  FR: "EUR", GR: "EUR", IE: "EUR", IT: "EUR", LT: "EUR", LU: "EUR", LV: "EUR",
  MT: "EUR", NL: "EUR", PT: "EUR", SI: "EUR", SK: "EUR",
};
