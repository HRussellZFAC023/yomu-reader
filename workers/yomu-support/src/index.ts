import operatingForecast from "../operating-forecast.json";
import {
  DONATION_CURRENCIES,
  DONATION_CURRENCY_CODES,
  isDonationCurrency,
  validDonationMinor,
  type DonationCurrency,
} from "../../shared/donation-currencies";
import {
  claimAcademyPayment,
  forwardAcademyPayment,
  stablePatreonEventId,
  type AcademyBridgeEnv,
  type AcademyPaymentEnvelope,
} from "./academy-bridge";

const DEFAULT_DAILY_BUDGET_GBP = 10;
const DEFAULT_MONTHLY_DONATION_FLOOR_GBP = 10;
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
const PATREON_MEMBERSHIP_EVENT_TYPES = new Set([
  "members:create",
  "members:update",
  "members:delete",
  "members:pledge:create",
  "members:pledge:update",
  "members:pledge:delete",
]);
const STATUS_CACHE_SECONDS = 300;
const SUPPORT_CLAIM_COOKIE = "__Host-yomu_support_claim";
const SUPPORT_CLAIM_MAX_AGE_SECONDS = 24 * 60 * 60;

// Free, key-less, ECB-backed daily FX rates. GBP base; response shape is
// { amount, base, date, rates: { USD: number, ... } }. Cached in KV for 24h.
const FX_RATES_URL = "https://api.frankfurter.dev/v1/latest?base=GBP";
const FX_CACHE_KEY = "fx:GBP:latest";
const FX_CACHE_TTL_SECONDS = 24 * 60 * 60;
const BASE_CURRENCY = "GBP";


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
  currency: DonationCurrency;
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
  const writeResponse = handleWriteRoute(url.pathname, request, env);
  if (writeResponse) return writeResponse;

  if (!READ_METHODS.has(request.method.trim().toUpperCase())) {
    return textResponse("Method not allowed.", 405, { allow: "GET, HEAD, OPTIONS" });
  }

  return handleReadRoute(url.pathname, request, env, ctx);
}

function handleWriteRoute(pathname: string, request: Request, env: Env): Promise<Response> | null {
  if (pathname === "/stripe/webhook" || pathname === "/webhook") return handleStripeWebhook(request, env);
  if (pathname === "/webhooks/kofi") return handleKofiWebhook(request, env);
  if (pathname === "/webhooks/patreon") return handlePatreonWebhook(request, env);
  if (pathname === "/claim") return handleDonationClaim(request, env);
  return null;
}

async function handleReadRoute(
  pathname: string,
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const cacheHeaders = { "cache-control": `public, max-age=${STATUS_CACHE_SECONDS}` };
  if (pathname === "/goal") return jsonResponse(request, buildGoal(env), 200, cacheHeaders);
  if (pathname === "/progress") return jsonResponse(request, await buildProgress(env, ctx), 200, cacheHeaders);
  if (pathname === "/status" || pathname === "/healthz") {
    return jsonResponse(request, await supportStatus(request, env, ctx), 200, {
      ...cacheHeaders,
      "vary": "Origin, Accept-Language",
    });
  }
  if (pathname === "/donate" || pathname === "/checkout") return createDonationCheckout(request, env);
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

async function buildProgress(env: Env, ctx: ExecutionContext): Promise<ProgressResponse> {
  const stripe = await donationSnapshot(env, ctx);
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
    totalTodayGbp: round2(stripe.donationsTodayGbp + manual.todayMinor / 100),
    providers,
    source: stripe.source,
  };
}

async function manualProviderProgress(env: Env): Promise<{ providers: ProviderProgress[]; todayMinor: number }> {
  const month = utcMonthKey();
  const providers: ProviderProgress[] = [];
  let todayMinor = 0;
  for (const provider of MANUAL_PROVIDERS) {
    const progress = await providerDonationProgress(env, provider, month);
    todayMinor += progress.todayMinor;
    providers.push({
      provider,
      monthGbp: round2(progress.monthMinor / 100),
      source: progress.source,
    });
  }
  return { providers, todayMinor };
}

async function providerDonationProgress(
  env: Env,
  provider: ManualProvider,
  month: string,
): Promise<{ monthMinor: number; todayMinor: number; source: "d1" | "none" }> {
  if (!env.SUPPORT_DB || (provider !== "kofi" && provider !== "patreon")) {
    return { monthMinor: 0, todayMinor: 0, source: "none" };
  }
  try {
    const [monthRow, todayRow] = await Promise.all([
      env.SUPPORT_DB.prepare(`
        SELECT COALESCE(SUM(amount_minor), 0) AS total_minor FROM provider_donation_events
        WHERE provider = ? AND day >= ? AND day < ? AND currency = 'gbp'
      `).bind(provider, month, nextUtcMonthKey()).first<{ total_minor?: number | null }>(),
      env.SUPPORT_DB.prepare(`
        SELECT COALESCE(SUM(amount_minor), 0) AS total_minor FROM provider_donation_events
        WHERE provider = ? AND day = ? AND currency = 'gbp'
      `).bind(provider, utcDayKey()).first<{ total_minor?: number | null }>(),
    ]);
    return {
      monthMinor: nonNegativeNumber(monthRow?.total_minor, 0),
      todayMinor: nonNegativeNumber(todayRow?.total_minor, 0),
      source: "d1",
    };
  } catch (error) {
    console.error(JSON.stringify({
      event: "yomu_support_manual_provider_read_failed",
      provider,
      message: error instanceof Error ? error.message : "unknown",
    }));
    return { monthMinor: 0, todayMinor: 0, source: "none" };
  }
}

// --- Status (goal + progress + localized display) -------------------------

async function supportStatus(request: Request, env: Env, ctx: ExecutionContext): Promise<SupportStatus> {
  const dailyBudgetGbp = positiveNumberEnv(env.SUPPORT_DAILY_BUDGET_GBP, DEFAULT_DAILY_BUDGET_GBP);
  const estimatedDailyCostGbp = nonNegativeNumberEnv(env.SUPPORT_ESTIMATED_DAILY_COST_GBP, 0);
  const goal = buildGoal(env);
  const donationGoalGbp = goal.monthlyGoalGBP;
  const estimatedMonthlyCostGbp = monthlyCostEstimate(env, estimatedDailyCostGbp);
  const progress = await buildProgress(env, ctx);
  const donationsTodayGbp = progress.totalTodayGbp;
  const donationsThisMonthGbp = progress.totalThisMonthGbp;
  const goalMet = donationsThisMonthGbp >= donationGoalGbp;
  const progressRatio = donationGoalGbp > 0 ? Math.min(1, round2(donationsThisMonthGbp / donationGoalGbp)) : 0;
  const donateUrl = donateUrlFor(request);
  const display = await currencyDisplay(request, env, ctx, donationsThisMonthGbp, donationGoalGbp);
  const bannerCopy = supportBannerCopy(request, goalMet, display);
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
      message: bannerCopy.message,
      costLabel: bannerCopy.costLabel,
      goalLabel: bannerCopy.goalLabel,
      ctaLabel: bannerCopy.ctaLabel,
      donateUrl,
    },
  };
}

function supportBannerCopy(
  request: Request,
  goalMet: boolean,
  display: CurrencyDisplay,
): { message: string; costLabel: string; goalLabel: string; ctaLabel: string } {
  if (prefersJapanese(request)) {
    return {
      message: goalMet
        ? "今月のよむ Ultimate Audio の運営費が集まりました。ご支援ありがとうございます。"
        : "よむ Ultimate Audio は寄付で運営されています。今月の目標に届かない場合、単語とシャドーイング向けの高速な実音声再生は来月停止します。",
      costLabel: `寄付目標：月${display.goalText}`,
      goalLabel: `今月：${display.amountText} / ${display.goalText}`,
      ctaLabel: "寄付する",
    };
  }
  return {
    message: goalMet
      ? "Yomu's Ultimate Audio is funded for this month. Thank you."
      : "Yomu's Ultimate Audio is donation funded. If this month's goal is missed, fast real-audio playback for words and shadowing will switch off next month.",
    costLabel: `Donation goal: ${display.goalText}/month`,
    goalLabel: `This month: ${display.amountText} / ${display.goalText}`,
    ctaLabel: "Donate",
  };
}

function prefersJapanese(request: Request): boolean {
  const firstLanguage = request.headers.get("accept-language")?.split(",", 1)[0]?.trim().toLowerCase() ?? "";
  return firstLanguage === "ja" || firstLanguage.startsWith("ja-") || firstLanguage.startsWith("ja;");
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

function donationMinorToGbp(
  amountMinor: number,
  currency: DonationCurrency,
  rates: FxRatesPayload | null,
): number {
  if (amountMinor <= 0) return 0;
  const amount = amountMinor / (10 ** DONATION_CURRENCIES[currency].minorDigits);
  if (currency === "gbp") return amount;
  const rate = rates?.rates[currency.toUpperCase()];
  return typeof rate === "number" && Number.isFinite(rate) && rate > 0 ? amount / rate : 0;
}

// --- Existing status donation snapshot (Stripe, D1-backed) ----------------

async function donationSnapshot(env: Env, ctx: ExecutionContext): Promise<DonationSnapshot> {
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
    const totals = await Promise.all(DONATION_CURRENCY_CODES.map(async currency => {
      const [today, month] = await Promise.all([
        env.SUPPORT_DB!.prepare(`
        SELECT COALESCE(SUM(amount_minor), 0) AS total_minor
        FROM donation_events
        WHERE day = ? AND currency = ? AND stripe_session_id LIKE 'cs_live_%'
        `).bind(utcDayKey(), currency).first<{ total_minor?: number | null }>(),
        env.SUPPORT_DB!.prepare(`
        SELECT COALESCE(SUM(amount_minor), 0) AS total_minor
        FROM donation_events
        WHERE day >= ? AND day < ? AND currency = ? AND stripe_session_id LIKE 'cs_live_%'
        `).bind(utcMonthKey(), nextUtcMonthKey(), currency).first<{ total_minor?: number | null }>(),
      ]);
      return {
        currency,
        todayMinor: nonNegativeNumber(today?.total_minor, 0),
        monthMinor: nonNegativeNumber(month?.total_minor, 0),
      };
    }));
    const needsFx = totals.some(total => total.currency !== "gbp" && (total.todayMinor > 0 || total.monthMinor > 0));
    const rates = needsFx ? await fxRates(env, ctx) : null;
    return {
      donationsTodayGbp: round2(totals.reduce(
        (sum, total) => sum + donationMinorToGbp(total.todayMinor, total.currency, rates), 0,
      )),
      donationsThisMonthGbp: round2(totals.reduce(
        (sum, total) => sum + donationMinorToGbp(total.monthMinor, total.currency, rates), 0,
      )),
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
  const amount = donationAmountMinor(new URL(request.url));
  if (amount.kind === "missing") return donationAmountForm(request);
  if (amount.kind === "invalid") {
    return donationAmountForm(request, "Enter an amount within the range shown for the selected currency.", 400);
  }
  const requireLiveStripe = requiresLiveStripe(request);
  if (requireLiveStripe && stripeKeyMode(env.STRIPE_SECRET_KEY) !== "live") {
    logStripeTestModeBlocked(request, "secret_key");
    return donationUnavailableResponse();
  }
  if (!env.STRIPE_SECRET_KEY) return donationUnavailableResponse();

  const claimToken = randomSupportClaimToken();
  const claimHash = await sha256Hex(claimToken);
  const response = await requestStripeCheckout(request, env, amount.currency, amount.amountMinor, claimHash);
  const payload = await response.json().catch(() => null);
  const checkoutUrl = checkoutSessionUrl(payload, requireLiveStripe);
  if (!checkoutUrl && requireLiveStripe) logStripeTestModeBlocked(request, "checkout_response");
  if (!response.ok || !checkoutUrl) return failedStripeCheckout(response.status);
  return completedStripeCheckout(checkoutUrl, claimToken);
}

async function requestStripeCheckout(
  request: Request,
  env: Env,
  currency: DonationCurrency,
  amountMinor: number,
  claimHash: string,
): Promise<Response> {
  const body = new URLSearchParams();
  body.set("mode", "payment");
  body.set("submit_type", "donate");
  const supportOrigin = new URL(request.url).origin;
  body.set("success_url", `${supportOrigin}/claim?session_id={CHECKOUT_SESSION_ID}`);
  body.set("cancel_url", env.SUPPORT_CANCEL_URL || `${DEFAULT_SUPPORT_URL}?donation=cancelled`);
  body.set("line_items[0][quantity]", "1");
  body.set("line_items[0][price_data][currency]", currency);
  body.set("line_items[0][price_data][unit_amount]", String(amountMinor));
  body.set("line_items[0][price_data][product_data][name]", "Yomu shared service donation");
  body.set("metadata[yomu_service]", "support");
  body.set("metadata[yomu_academy_claim_hash]", claimHash);

  return fetch(STRIPE_CHECKOUT_SESSIONS_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "content-type": "application/x-www-form-urlencoded",
      "stripe-version": STRIPE_API_VERSION,
    },
    body,
  });
}

function completedStripeCheckout(checkoutUrl: string, claimToken: string): Response {
  return new Response(null, {
    status: 303,
    headers: {
      location: checkoutUrl,
      "set-cookie": supportClaimCookie(claimToken),
      "cache-control": "no-store",
    },
  });
}

function failedStripeCheckout(status: number): Response {
  console.error(JSON.stringify({ event: "yomu_support_stripe_checkout_failed", status }));
  return donationUnavailableResponse();
}

async function handleDonationClaim(request: Request, env: Env): Promise<Response> {
  if (request.method.trim().toUpperCase() !== "GET") {
    return textResponse("Method not allowed.", 405, { allow: "GET" });
  }
  const sessionId = new URL(request.url).searchParams.get("session_id") ?? "";
  const claimToken = cookieValue(request, SUPPORT_CLAIM_COOKIE);
  if (!/^cs_[A-Za-z0-9_-]{3,255}$/u.test(sessionId) || !claimToken) {
    return textResponse("This donation claim link is incomplete.", 400, { "cache-control": "no-store" });
  }
  const response = await claimAcademyPayment(env, {
    provider: "stripe",
    transactionReference: sessionId,
    claimToken,
  });
  const payload = await response.json().catch(() => null);
  return renderDonationClaim(response.status, payload);
}

function renderDonationClaim(status: number, payload: unknown): Response {
  if (status === 202 && objectRecord(payload)?.status === "pending") {
    return textResponse("Your payment is still being confirmed. Refresh this page in a moment.", 202, {
      "cache-control": "no-store",
      "retry-after": "2",
    });
  }
  const code = stringField(objectRecord(payload), "code");
  if (status !== 200 || !/^[A-Z0-9-]{7,64}$/u.test(code ?? "")) {
    return textResponse("This donation claim could not be verified.", status === 401 ? 401 : 409, {
      "cache-control": "no-store",
    });
  }
  return new Response(`Your permanent Yomu Academy code is: ${code}`, {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
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

  const academyEnvelope = stripeAcademyEnvelope(event, donation);
  if (!academyEnvelope) return textResponse("Stripe donation identity is incomplete.", 422);
  await forwardAcademyPayment(env, academyEnvelope);
  await recordDonationEvent(env.SUPPORT_DB, donation);
  return jsonResponse(request, { received: true, recorded: true }, 200);
}

// --- Ko-fi webhook (shared-secret verification token) ---------------------

async function handleKofiWebhook(request: Request, env: Env): Promise<Response> {
  if (request.method.trim().toUpperCase() !== "POST") {
    return textResponse("Method not allowed.", 405, { allow: "POST" });
  }
  const secret = env.KOFI_WEBHOOK_SECRET;
  const db = env.SUPPORT_DB;
  if (!secret || !db) {
    return textResponse("Ko-fi webhook is not configured.", 503);
  }

  // Ko-fi posts application/x-www-form-urlencoded with a single `data` field
  // whose JSON body includes a `verification_token` the account owner sets in
  // the Ko-fi webhooks page. We compare it in constant time.
  const verified = await verifiedKofiPayload(request, secret);
  if (verified instanceof Response) return verified;
  return handleVerifiedKofiWebhook(request, env, db, verified);
}

async function handleVerifiedKofiWebhook(
  request: Request,
  env: Env,
  db: D1Database,
  verified: Record<string, unknown>,
): Promise<Response> {
  const paymentType = (stringField(verified, "type") ?? "").toLowerCase();
  if (paymentType !== "donation" && paymentType !== "subscription") {
    return jsonResponse(request, { received: true, recorded: false }, 200);
  }

  const amountMinor = gbpMinorFromProviderAmount(verified, "amount", "currency");
  if (amountMinor <= 0) return jsonResponse(request, { received: true, recorded: false }, 200);
  const academyEnvelope = kofiAcademyEnvelope(verified, amountMinor);
  if (!academyEnvelope) return textResponse("Ko-fi donation identity is incomplete.", 422);
  await forwardAcademyPayment(env, academyEnvelope);
  await recordProviderDonationEvent(db, {
    provider: "kofi",
    eventId: academyEnvelope.eventId,
    day: utcDayKey(new Date(academyEnvelope.occurredAt)),
    amountMinor,
    eventType: paymentType,
    occurredAt: academyEnvelope.occurredAt,
  });
  return jsonResponse(request, { received: true, recorded: true }, 200);
}

async function verifiedKofiPayload(request: Request, secret: string): Promise<Record<string, unknown> | Response> {
  const record = objectRecord(parseJson(await readKofiPayload(request)));
  if (!record) return textResponse("Invalid Ko-fi payload.", 400);
  const token = stringField(record, "verification_token") ?? "";
  if (timingSafeEqualString(token, secret)) return record;
  logWebhookRejected("kofi");
  return textResponse("Invalid Ko-fi verification token.", 401);
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
  const secret = env.PATREON_WEBHOOK_SECRET;
  const db = env.SUPPORT_DB;
  if (!secret || !db) {
    return textResponse("Patreon webhook is not configured.", 503);
  }

  const raw = await request.text();
  if (!(await hasValidPatreonSignature(request, secret, raw))) {
    logWebhookRejected("patreon");
    return textResponse("Invalid Patreon signature.", 401);
  }

  return handleVerifiedPatreonWebhook(request, env, db, raw);
}

async function handleVerifiedPatreonWebhook(request: Request, env: Env, db: D1Database, raw: string): Promise<Response> {
  const trigger = request.headers.get("x-patreon-event") ?? "";
  if (!isPatreonMembershipTrigger(trigger)) {
    return jsonResponse(request, { received: true, recorded: false }, 200);
  }
  const parsed = parseJson(raw);
  const academyEnvelope = await patreonAcademyEnvelope(trigger, raw, parsed);
  // Patreon's signed webhook tester intentionally sends a skeletal resource.
  // A real event without enough verified membership data cannot grant access,
  // but retrying the same immutable payload cannot make it complete either.
  if (!academyEnvelope) return jsonResponse(request, { received: true, recorded: false }, 200);
  await forwardAcademyPayment(env, academyEnvelope);
  if (!isPatreonIncomeTrigger(trigger)) {
    return jsonResponse(request, { received: true, recorded: false }, 200);
  }
  const amountMinor = patreonPledgeMinor(parsed);
  if (amountMinor <= 0) return jsonResponse(request, { received: true, recorded: false }, 200);
  await recordProviderDonationEvent(db, {
    provider: "patreon",
    eventId: academyEnvelope.eventId,
    day: utcDayKey(new Date(academyEnvelope.occurredAt)),
    amountMinor,
    eventType: trigger,
    occurredAt: academyEnvelope.occurredAt,
  });
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
  const session = stripeSessionRecord(event);
  const metadata = objectRecord(session?.metadata);
  const purchaseId = providerReference(metadata?.yomu_academy_purchase);
  const claimHash = providerClaimHash(metadata?.yomu_academy_claim_hash);
  const eventId = providerReference(donation.id);
  const sessionId = providerReference(donation.stripeSessionId);
  const occurredAt = providerTimestamp(donation.stripeCreatedAt);
  if (!eventId || !sessionId || occurredAt === null || !isAcademyAmount(donation.amountMinor)) return null;
  const common = {
    schemaVersion: 1,
    provider: "stripe",
    eventId,
    eventType: "charge.settled",
    occurredAt,
    transaction: stripeAcademyTransaction(sessionId, donation.currency, donation.amountMinor, claimHash),
  } as const;
  if (purchaseId) {
    return { ...common, subject: { kind: "academy_purchase", reference: purchaseId }, purchaseId };
  }
  return { ...common, subject: { kind: "transaction", reference: sessionId } };
}

function stripeAcademyTransaction(
  sessionId: string,
  currency: DonationCurrency,
  amountMinor: number,
  claimHash: string | null,
) {
  const transaction = { reference: sessionId, sessionReference: sessionId, currency, amountMinor } as const;
  return claimHash ? { ...transaction, claimHash } : transaction;
}

function stripeSessionRecord(event: unknown): Record<string, unknown> | null {
  const record = objectRecord(event);
  return objectRecord(objectRecord(record?.data)?.object);
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
  if (trigger.trim().toLowerCase().endsWith(":delete")) return true;
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
  return Number.isSafeInteger(amountMinor) && amountMinor > 0;
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

function providerClaimHash(value: unknown): string | null {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value) ? value : null;
}

function isPatreonMembershipTrigger(trigger: string): boolean {
  return PATREON_MEMBERSHIP_EVENT_TYPES.has(trigger.trim().toLowerCase());
}

/** Membership state updates are not receipts. Count only pledge creation. */
function isPatreonIncomeTrigger(trigger: string): boolean {
  return trigger.trim().toLowerCase() === "members:pledge:create";
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

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}

async function recordProviderDonationEvent(
  db: D1Database,
  event: {
  provider: "kofi" | "patreon",
  eventId: string,
  day: string,
  amountMinor: number,
  eventType: string,
  occurredAt: number,
  },
): Promise<void> {
  await db.prepare(`
    INSERT OR IGNORE INTO provider_donation_events (
      provider, event_id, day, amount_minor, currency, event_type, occurred_at, received_at
    ) VALUES (?, ?, ?, ?, 'gbp', ?, ?, ?)
  `).bind(
    event.provider,
    event.eventId,
    event.day,
    Math.round(event.amountMinor),
    event.eventType,
    event.occurredAt,
    new Date().toISOString(),
  ).run();
}

function randomSupportClaimToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function supportClaimCookie(token: string): string {
  return `${SUPPORT_CLAIM_COOKIE}=${token}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${SUPPORT_CLAIM_MAX_AGE_SECONDS}`;
}

function cookieValue(request: Request, name: string): string | null {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    const value = part.slice(separator + 1).trim();
    return /^[A-Za-z0-9_-]{43}$/u.test(value) ? value : null;
  }
  return null;
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
  if (!record || record.livemode !== true || !eventType || !STRIPE_DONATION_EVENT_TYPES.has(eventType)) return null;
  const fields = validStripeDonationFields(record);
  if (!fields) return null;
  const stripeCreatedAt = numberField(record, "created") ?? receivedTimestamp;
  return {
    id: fields.id,
    eventType,
    day: utcDayKey(new Date(stripeCreatedAt * 1000)),
    amountMinor: Math.round(fields.amountMinor),
    currency: fields.currency,
    stripeSessionId: fields.sessionId,
    stripeCreatedAt,
  };
}

function validStripeDonationFields(
  event: Record<string, unknown>,
): { id: string; sessionId: string; amountMinor: number; currency: DonationCurrency } | null {
  const session = stripeSessionRecord(event);
  const id = stringField(event, "id");
  const sessionId = stringField(session, "id");
  const amountMinor = numberField(session, "amount_total");
  const currency = stringField(session, "currency")?.toLowerCase();
  const paymentStatus = stringField(session, "payment_status");
  if (!id || !sessionId || !amountMinor || amountMinor <= 0 || paymentStatus !== "paid") return null;
  if (!/^cs_live_[A-Za-z0-9_-]{3,250}$/u.test(sessionId)) return null;
  if (!isDonationCurrency(currency) || !validDonationMinor(amountMinor, currency)) return null;
  return { id, sessionId, amountMinor, currency };
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

type DonationAmount =
  | { kind: "missing" }
  | { kind: "invalid" }
  | { kind: "valid"; currency: DonationCurrency; amountMinor: number };

function donationAmountMinor(url: URL): DonationAmount {
  const gbpValues = url.searchParams.getAll("amount_gbp");
  const amountValues = url.searchParams.getAll("amount");
  if (gbpValues.length === 0 && amountValues.length === 0) return { kind: "missing" };
  if (gbpValues.length + amountValues.length !== 1) return { kind: "invalid" };
  const currencyValues = url.searchParams.getAll("currency");
  if (currencyValues.length > 1) return { kind: "invalid" };
  const requestedCurrency = currencyValues[0]?.trim().toLowerCase();
  const currency = gbpValues.length === 1 ? "gbp" : (requestedCurrency || "gbp");
  if (!isDonationCurrency(currency) || (gbpValues.length === 1 && requestedCurrency && requestedCurrency !== "gbp")) {
    return { kind: "invalid" };
  }
  const raw = (gbpValues[0] ?? amountValues[0] ?? "").trim();
  const config = DONATION_CURRENCIES[currency];
  const pattern = config.minorDigits === 0 ? /^\d+$/u : /^\d+(?:\.\d{1,2})?$/u;
  if (!pattern.test(raw)) return { kind: "invalid" };
  const [whole, fraction = ""] = raw.split(".");
  const scale = 10 ** config.minorDigits;
  const amountMinor = Number(whole) * scale + Number(fraction.padEnd(config.minorDigits, "0"));
  if (!validDonationMinor(amountMinor, currency)) {
    return { kind: "invalid" };
  }
  return { kind: "valid", currency, amountMinor };
}

function preferredDonationCurrency(request: Request): DonationCurrency {
  const preferred = resolveCurrency(request).toLowerCase();
  return isDonationCurrency(preferred) ? preferred : "gbp";
}

function donationAmountForm(request: Request, error = "", status = 200): Response {
  const requested = new URL(request.url).searchParams.get("currency")?.trim().toLowerCase();
  const currency = isDonationCurrency(requested) ? requested : preferredDonationCurrency(request);
  const options = DONATION_CURRENCY_CODES.map(code => {
    const config = DONATION_CURRENCIES[code];
    return `<option value="${code}"${code === currency ? " selected" : ""}>${config.label}</option>`;
  }).join("");
  const errorMarkup = error ? `<p id="amount-error" role="alert">${error}</p>` : "";
  const describedBy = error ? ' aria-describedby="amount-help amount-error"' : ' aria-describedby="amount-help"';
  const body = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Support Yomu</title>
  <style>
    :root { color-scheme: light dark; font-family: ui-rounded, system-ui, sans-serif; }
    body { min-height: 100vh; margin: 0; display: grid; place-items: center; background: #11131a; color: #f7f4ec; }
    main { width: min(28rem, calc(100% - 2rem)); padding: 2rem; border: 1px solid #3a4050; border-radius: 1rem; background: #1a1e28; box-sizing: border-box; }
    h1 { margin-top: 0; font-size: 1.8rem; }
    p { color: #c8cbd4; line-height: 1.5; }
    label { display: block; margin: 1.5rem 0 .5rem; font-weight: 700; }
    .amount { display: flex; align-items: center; gap: .6rem; font-size: 1.25rem; }
    input, select { width: 100%; padding: .8rem; border: 1px solid #697084; border-radius: .6rem; font: inherit; }
    button { width: 100%; margin-top: 1.25rem; padding: .85rem 1rem; border: 0; border-radius: .7rem; background: #ff7a5c; color: #16100e; font: inherit; font-weight: 800; cursor: pointer; }
    #amount-error { color: #ffb4a4; }
  </style>
</head>
<body>
  <main>
    <h1>Support Yomu</h1>
    <p>Choose your currency and amount. Every verified donation includes permanent Yomu Academy access.</p>
    <form method="get" action="/donate">
      <label for="currency">Currency</label>
      <select id="currency" name="currency">${options}</select>
      <label for="amount">Donation amount</label>
      <div class="amount"><input id="amount" name="amount" type="text" inputmode="decimal" placeholder="Your amount" required${describedBy}></div>
      <p id="amount-help">GBP £5–£500; USD $7–$700; EUR €6–€600; CAD C$10–C$1,000; AUD A$11–A$1,100; JPY ¥1,000–¥100,000. One-time donation.</p>
      ${errorMarkup}
      <button type="submit">Continue to secure checkout</button>
    </form>
  </main>
</body>
</html>`;
  const headers = new Headers({
    "cache-control": "no-store",
    "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    "content-type": "text/html; charset=utf-8",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
  });
  return new Response(request.method === "HEAD" ? null : body, { status, headers });
}

function monthlyCostEstimate(env: Env, estimatedDailyCostGbp: number): number {
  const configuredMonthly = nonNegativeNumberEnv(env.SUPPORT_ESTIMATED_MONTHLY_COST_GBP, NaN);
  if (Number.isFinite(configuredMonthly)) return configuredMonthly;
  if (estimatedDailyCostGbp > 0) return estimatedDailyCostGbp * daysInUtcMonth();
  // Fall back to the forecast total so the "estimated monthly cost" figure is
  // meaningful even when no per-day override is configured.
  return buildGoal(env).forecastGBP;
}

function checkoutSessionUrl(payload: unknown, requireLive: boolean): string | null {
  if (!payload || typeof payload !== "object") return null;
  const session = payload as { id?: unknown; livemode?: unknown; url?: unknown };
  const value = session.url;
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "checkout.stripe.com") return null;
    if (requireLive && (
      session.livemode !== true
      || typeof session.id !== "string"
      || !/^cs_live_[A-Za-z0-9_-]{3,250}$/u.test(session.id)
    )) return null;
    return url.href;
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
  if (!requiresLiveStripe(request)) return "ok";
  const mode = stripeKeyMode(env.STRIPE_SECRET_KEY);
  if (mode === "test") return "stripe-test-mode";
  return mode === "live" ? "ok" : "stripe-unconfigured";
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
