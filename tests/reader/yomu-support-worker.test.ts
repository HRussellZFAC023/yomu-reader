import { afterEach, describe, expect, it, vi } from "vitest";
import SupportWorker from "../../workers/yomu-support/src/index";
import operatingForecast from "../../workers/yomu-support/operating-forecast.json";

const FORECAST_TOTAL_GBP = round2(
  operatingForecast.lineItems.reduce((sum, item) => sum + item.monthlyGBP, 0),
);
const FORECAST_FLOOR_GBP = operatingForecast.floorGBP;
const EFFECTIVE_GOAL_GBP = Math.max(FORECAST_FLOOR_GBP, FORECAST_TOTAL_GBP);

describe("Yomu support Worker", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("serves public donation and budget status without secrets", async () => {
    const response = await SupportWorker.fetch(
      new Request("https://support.yomureader.com/status", {
        headers: { origin: "https://yomureader.com" },
      }),
      {
        SUPPORT_DAILY_BUDGET_GBP: "10",
        SUPPORT_DONATION_GOAL_MONTHLY_GBP: "10",
        SUPPORT_DONATIONS_THIS_MONTH_GBP: "3.5",
      },
      { waitUntil: vi.fn() },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://yomureader.com");
    expect(response.headers.get("cache-control")).toBe("public, max-age=300");
    const body = await response.json() as {
      status: string;
      dailyBudgetGbp: number;
      donationsTodayGbp: number;
      donationsThisMonthGbp: number;
      donationsSource: string;
      donationGoalGbp: number;
      floorGbp: number;
      estimatedMonthlyCostGbp: number;
      donateUrl: string;
      featuresAtRisk: string[];
      progressRatio: number;
      providers: Array<{ id: string; enabled: boolean; url: string; kind: string }>;
      display: { currency: string; symbol: string; goalText: string; amountText: string; converted: boolean };
      banner: { enabled: boolean; dismissVersion: string; message: string; costLabel: string; goalLabel: string };
      STRIPE_SECRET_KEY?: string;
    };
    expect(body.status).toBe("stripe-unconfigured");
    expect(body.dailyBudgetGbp).toBe(10);
    expect(body.donationsTodayGbp).toBe(0);
    expect(body.donationsThisMonthGbp).toBe(3.5);
    expect(body.donationsSource).toBe("env");
    expect(body.donationGoalGbp).toBe(10);
    expect(body.floorGbp).toBe(FORECAST_FLOOR_GBP);
    expect(body.donateUrl).toBe("https://support.yomureader.com/donate");
    expect(body.progressRatio).toBe(0.35);
    expect(body.banner.enabled).toBe(true);
    expect(body.banner.dismissVersion).toBe("ultimate-audio-v1");
    expect(body.featuresAtRisk).toEqual(["Ultimate Audio"]);
    // GBP default (no CF country / currency): display stays in pounds.
    expect(body.display.currency).toBe("GBP");
    expect(body.display.symbol).toBe("£");
    expect(body.display.converted).toBe(false);
    expect(body.banner.costLabel).toBe("Donation goal: £10/month");
    expect(body.banner.goalLabel).toContain("This month: £3.50 / £10");
    expect(body.banner.message).toContain("Ultimate Audio");
    // Stripe is always present; manual providers hidden until their URL is set.
    const stripe = body.providers.find(p => p.id === "stripe");
    expect(stripe?.enabled).toBe(true);
    expect(stripe?.url).toBe("https://support.yomureader.com/donate");
    expect(body.providers.find(p => p.id === "kofi")?.enabled).toBe(false);
    expect(body.providers.find(p => p.id === "patreon")?.enabled).toBe(false);
    expect(body.STRIPE_SECRET_KEY).toBeUndefined();
  });

  it("derives a dynamic monthly goal from the checked-in operating forecast", async () => {
    const response = await SupportWorker.fetch(
      new Request("https://support.yomureader.com/goal"),
      {},
      { waitUntil: vi.fn() },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=300");
    const body = await response.json() as {
      floorGBP: number;
      forecastGBP: number;
      monthlyGoalGBP: number;
      breakdown: Array<{ id: string; label: string; monthlyGbp: number }>;
    };
    expect(body.floorGBP).toBe(10);
    expect(body.forecastGBP).toBe(FORECAST_TOTAL_GBP);
    expect(body.monthlyGoalGBP).toBe(EFFECTIVE_GOAL_GBP);
    // Goal is max(forecast, floor).
    expect(body.monthlyGoalGBP).toBe(Math.max(10, FORECAST_TOTAL_GBP));
    expect(body.breakdown.length).toBe(operatingForecast.lineItems.length);
    expect(body.breakdown.map(item => item.id)).toEqual(
      operatingForecast.lineItems.map(item => item.id),
    );
  });

  it("keeps the £10 floor as the effective goal when the forecast is lower", async () => {
    const response = await SupportWorker.fetch(
      new Request("https://support.yomureader.com/goal"),
      { SUPPORT_DONATION_GOAL_MONTHLY_GBP: "4" },
      { waitUntil: vi.fn() },
    );
    const body = await response.json() as { monthlyGoalGBP: number; floorGBP: number };
    // A pinned goal below the floor is still floored at £10.
    expect(body.monthlyGoalGBP).toBe(10);
    expect(body.floorGBP).toBe(10);
  });

  it("aggregates month-to-date progress across Stripe and manual providers", async () => {
    const kv = mockKv({
      [`manual:kofi:${monthKey()}`]: "1200",
      [`manual:patreon:${monthKey()}`]: "500",
    });
    const response = await SupportWorker.fetch(
      new Request("https://support.yomureader.com/progress"),
      { SUPPORT_DONATIONS_THIS_MONTH_GBP: "3", SUPPORT_KV: kv },
      { waitUntil: vi.fn() },
    );

    expect(response.status).toBe(200);
    const body = await response.json() as {
      totalThisMonthGbp: number;
      providers: Array<{ provider: string; monthGbp: number; source: string }>;
    };
    // 3 (stripe env) + 12 (kofi) + 5 (patreon) = 20
    expect(body.totalThisMonthGbp).toBe(20);
    expect(body.providers.find(p => p.provider === "stripe")?.monthGbp).toBe(3);
    expect(body.providers.find(p => p.provider === "kofi")?.monthGbp).toBe(12);
    expect(body.providers.find(p => p.provider === "patreon")?.monthGbp).toBe(5);
    expect(body.providers.find(p => p.provider === "bmac")?.monthGbp).toBe(0);
  });

  it("localizes the goal into the visitor currency using a cached FX rate", async () => {
    const kv = mockKv();
    const fetchMock = vi.fn(async () => Response.json({
      amount: 1,
      base: "GBP",
      date: "2026-07-02",
      rates: { USD: 1.3306, EUR: 1.1673, JPY: 215.01 },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const first = await SupportWorker.fetch(
      new Request("https://support.yomureader.com/status?currency=USD", {
        headers: { origin: "https://yomureader.com" },
      }),
      { SUPPORT_DONATION_GOAL_MONTHLY_GBP: "10", SUPPORT_DONATIONS_THIS_MONTH_GBP: "5", SUPPORT_KV: kv },
      { waitUntil: vi.fn() },
    );
    const body = await first.json() as {
      display: { currency: string; symbol: string; goal: number; amount: number; goalText: string; converted: boolean; rate: number };
      banner: { costLabel: string; goalLabel: string };
    };
    expect(body.display.currency).toBe("USD");
    expect(body.display.symbol).toBe("$");
    expect(body.display.converted).toBe(true);
    expect(body.display.rate).toBe(1.3306);
    expect(body.display.goal).toBe(13.31); // 10 * 1.3306
    expect(body.display.amount).toBe(6.65); // 5 * 1.3306
    expect(body.display.goalText).toBe("$13.31");
    expect(body.banner.costLabel).toBe("Donation goal: $13.31/month");
    expect(body.banner.goalLabel).toContain("$6.65 / $13.31");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // A second request within the cache window must not re-fetch the rate.
    const second = await SupportWorker.fetch(
      new Request("https://support.yomureader.com/status?currency=EUR"),
      { SUPPORT_KV: kv },
      { waitUntil: vi.fn() },
    );
    const secondBody = await second.json() as { display: { currency: string; rate: number } };
    expect(secondBody.display.currency).toBe("EUR");
    expect(secondBody.display.rate).toBe(1.1673);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("derives the visitor currency from the Cloudflare request country", async () => {
    const kv = mockKv({ "fx:GBP:latest": JSON.stringify({ base: "GBP", date: "2026-07-02", rates: { JPY: 215.01 } }) });
    const request = new Request("https://support.yomureader.com/status");
    Object.defineProperty(request, "cf", { value: { country: "JP" }, configurable: true });
    const response = await SupportWorker.fetch(
      request,
      { SUPPORT_DONATION_GOAL_MONTHLY_GBP: "10", SUPPORT_KV: kv },
      { waitUntil: vi.fn() },
    );
    const body = await response.json() as { display: { currency: string; symbol: string; goalText: string } };
    expect(body.display.currency).toBe("JPY");
    expect(body.display.symbol).toBe("¥");
    // 10 GBP * 215.01 = 2150.1; JPY is a zero-decimal currency -> ¥2150
    expect(body.display.goalText).toBe("¥2150");
  });

  it("falls back to GBP display when the FX source is unavailable", async () => {
    const fetchMock = vi.fn(async () => new Response("nope", { status: 502 }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await SupportWorker.fetch(
      new Request("https://support.yomureader.com/status?currency=USD"),
      { SUPPORT_DONATION_GOAL_MONTHLY_GBP: "10", SUPPORT_KV: mockKv() },
      { waitUntil: vi.fn() },
    );
    const body = await response.json() as { display: { currency: string; converted: boolean; goalText: string } };
    expect(body.display.currency).toBe("GBP");
    expect(body.display.converted).toBe(false);
    expect(body.display.goalText).toBe("£10");
  });

  it("ignores unknown or unsupported currency codes and keeps GBP", async () => {
    const response = await SupportWorker.fetch(
      new Request("https://support.yomureader.com/status?currency=ZZZ"),
      { SUPPORT_DONATION_GOAL_MONTHLY_GBP: "10", SUPPORT_KV: mockKv() },
      { waitUntil: vi.fn() },
    );
    const body = await response.json() as { display: { currency: string; converted: boolean } };
    expect(body.display.currency).toBe("GBP");
    expect(body.display.converted).toBe(false);
  });

  it("exposes configured manual provider links and hides unset ones", async () => {
    const response = await SupportWorker.fetch(
      new Request("https://support.yomureader.com/status"),
      {
        SUPPORT_PROVIDER_KOFI_URL: "https://ko-fi.com/yomu",
        SUPPORT_PROVIDER_PAYPAL_URL: "http://insecure.example/pay",
      },
      { waitUntil: vi.fn() },
    );
    const body = await response.json() as { providers: Array<{ id: string; enabled: boolean; url: string }> };
    const kofi = body.providers.find(p => p.id === "kofi");
    expect(kofi?.enabled).toBe(true);
    expect(kofi?.url).toBe("https://ko-fi.com/yomu");
    // Non-https provider URLs are rejected and stay hidden.
    const paypal = body.providers.find(p => p.id === "paypal");
    expect(paypal?.enabled).toBe(false);
    expect(paypal?.url).toBe("");
  });

  it("redirects donation requests to a Stripe Payment Link fallback when Checkout is not configured", async () => {
    const response = await SupportWorker.fetch(
      new Request("https://yomu-support.example.workers.dev/donate"),
      { SUPPORT_STRIPE_PAYMENT_LINK_URL: "https://buy.stripe.com/test_yomu" },
      { waitUntil: vi.fn() },
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://buy.stripe.com/test_yomu");
  });

  it("does not send production donation requests to Stripe test mode", async () => {
    const stripeFetch = vi.fn();
    vi.stubGlobal("fetch", stripeFetch);

    const response = await SupportWorker.fetch(
      new Request("https://support.yomureader.com/donate"),
      {
        STRIPE_SECRET_KEY: "sk_test_secret",
        SUPPORT_STRIPE_PAYMENT_LINK_URL: "https://buy.stripe.com/test_yomu",
      },
      { waitUntil: vi.fn() },
    );
    const status = await SupportWorker.fetch(
      new Request("https://support.yomureader.com/status"),
      { STRIPE_SECRET_KEY: "sk_test_secret" },
      { waitUntil: vi.fn() },
    );

    expect(response.status).toBe(503);
    await expect(response.text()).resolves.toContain("Stripe donations are temporarily unavailable");
    expect(stripeFetch).not.toHaveBeenCalled();
    await expect(status.json()).resolves.toMatchObject({ status: "stripe-test-mode" });
  });

  it("does not loop through the support page when no Stripe donation path is available", async () => {
    const response = await SupportWorker.fetch(
      new Request("https://support.yomureader.com/donate"),
      {},
      { waitUntil: vi.fn() },
    );

    expect(response.status).toBe(503);
    await expect(response.text()).resolves.toContain("Stripe donations are temporarily unavailable");
  });

  it("creates Stripe Checkout sessions server-side and redirects to Stripe", async () => {
    const stripeFetch = vi.fn(async (_url: string, init: RequestInit) => {
      expect(init.method).toBe("POST");
      expect(new Headers(init.headers).get("authorization")).toBe("Bearer sk_live_secret");
      expect(new Headers(init.headers).get("stripe-version")).toBe("2026-02-25.clover");
      const body = init.body as URLSearchParams;
      expect(body.get("mode")).toBe("payment");
      expect(body.get("submit_type")).toBe("donate");
      expect(body.get("line_items[0][price_data][unit_amount]")).toBe("750");
      return Response.json({ url: "https://checkout.stripe.com/c/session" });
    });
    vi.stubGlobal("fetch", stripeFetch);

    const response = await SupportWorker.fetch(
      new Request("https://support.yomureader.com/donate?amount_gbp=7.5"),
      { STRIPE_SECRET_KEY: "sk_live_secret" },
      { waitUntil: vi.fn() },
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://checkout.stripe.com/c/session");
    expect(stripeFetch).toHaveBeenCalledTimes(1);
  });

  it("rejects test Checkout URLs returned to the production support host", async () => {
    const stripeFetch = vi.fn(async () => Response.json({ url: "https://checkout.stripe.com/c/pay/cs_test_123" }));
    vi.stubGlobal("fetch", stripeFetch);

    const response = await SupportWorker.fetch(
      new Request("https://support.yomureader.com/donate"),
      { STRIPE_SECRET_KEY: "sk_live_secret" },
      { waitUntil: vi.fn() },
    );

    expect(response.status).toBe(503);
    await expect(response.text()).resolves.toContain("Stripe donations are temporarily unavailable");
    expect(stripeFetch).toHaveBeenCalledTimes(1);
  });

  it("records signed Stripe Checkout donation webhooks once and reflects them in status", async () => {
    const db = mockSupportDb();
    const timestamp = Math.floor(Date.now() / 1000);
    const payload = JSON.stringify({
      id: "evt_donation_1",
      type: "checkout.session.completed",
      created: timestamp,
      data: {
        object: {
          id: "cs_test_1",
          amount_total: 750,
          currency: "gbp",
          payment_status: "paid",
        },
      },
    });
    const webhookRequest = new Request("https://support.yomureader.com/stripe/webhook", {
      method: "POST",
      headers: { "stripe-signature": await stripeSignatureHeader(payload, "whsec_test", timestamp) },
      body: payload,
    });
    const env = { STRIPE_WEBHOOK_SECRET: "whsec_test", SUPPORT_DB: db };

    const first = await SupportWorker.fetch(webhookRequest.clone(), env, { waitUntil: vi.fn() });
    const duplicate = await SupportWorker.fetch(webhookRequest.clone(), env, { waitUntil: vi.fn() });
    const status = await SupportWorker.fetch(
      new Request("https://support.yomureader.com/status"),
      { ...env, SUPPORT_DONATION_GOAL_GBP: "10" },
      { waitUntil: vi.fn() },
    );

    expect(first.status).toBe(200);
    await expect(first.json()).resolves.toEqual({ received: true, recorded: true });
    expect(duplicate.status).toBe(200);
    expect(db.rows).toHaveLength(1);
    await expect(status.json()).resolves.toMatchObject({
      donationsSource: "d1",
      donationsTodayGbp: 7.5,
      donationsThisMonthGbp: 7.5,
      donationGoalGbp: 10,
      goalMet: false,
    });
  });

  it("rejects Stripe webhooks with invalid signatures before recording", async () => {
    const db = mockSupportDb();
    const response = await SupportWorker.fetch(
      new Request("https://support.yomureader.com/stripe/webhook", {
        method: "POST",
        headers: { "stripe-signature": "t=100,v1=bad" },
        body: JSON.stringify({ id: "evt_bad" }),
      }),
      { STRIPE_WEBHOOK_SECRET: "whsec_test", SUPPORT_DB: db },
      { waitUntil: vi.fn() },
    );

    expect(response.status).toBe(400);
    expect(db.rows).toHaveLength(0);
  });

  it("records a Ko-fi webhook with a valid verification token into KV", async () => {
    const kv = mockKv();
    const donationPayload = JSON.stringify({
      verification_token: "kofi_secret",
      type: "Donation",
      amount: "6.00",
      currency: "GBP",
    });
    const body = new URLSearchParams({ data: donationPayload }).toString();
    const response = await SupportWorker.fetch(
      new Request("https://support.yomureader.com/webhooks/kofi", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body,
      }),
      { KOFI_WEBHOOK_SECRET: "kofi_secret", SUPPORT_KV: kv },
      { waitUntil: vi.fn() },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true, recorded: true });
    expect(kv.store[`manual:kofi:${monthKey()}`]).toBe("600");
  });

  it("rejects a Ko-fi webhook with the wrong verification token", async () => {
    const kv = mockKv();
    const body = new URLSearchParams({
      data: JSON.stringify({ verification_token: "wrong", amount: "6.00", currency: "GBP" }),
    }).toString();
    const response = await SupportWorker.fetch(
      new Request("https://support.yomureader.com/webhooks/kofi", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body,
      }),
      { KOFI_WEBHOOK_SECRET: "kofi_secret", SUPPORT_KV: kv },
      { waitUntil: vi.fn() },
    );

    expect(response.status).toBe(401);
    expect(Object.keys(kv.store)).toHaveLength(0);
  });

  it("records a Patreon webhook with a valid HMAC-MD5 signature into KV", async () => {
    const kv = mockKv();
    const payload = JSON.stringify({ data: { attributes: { amount_cents: 500 } } });
    const signature = await patreonSignature(payload, "patreon_secret");
    const response = await SupportWorker.fetch(
      new Request("https://support.yomureader.com/webhooks/patreon", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-patreon-event": "members:pledge:create",
          "x-patreon-signature": signature,
        },
        body: payload,
      }),
      { PATREON_WEBHOOK_SECRET: "patreon_secret", SUPPORT_KV: kv },
      { waitUntil: vi.fn() },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true, recorded: true });
    expect(kv.store[`manual:patreon:${monthKey()}`]).toBe("500");
  });

  it("rejects a Patreon webhook with an invalid signature", async () => {
    const kv = mockKv();
    const payload = JSON.stringify({ data: { attributes: { amount_cents: 500 } } });
    const response = await SupportWorker.fetch(
      new Request("https://support.yomureader.com/webhooks/patreon", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-patreon-event": "members:pledge:create",
          "x-patreon-signature": "00000000000000000000000000000000",
        },
        body: payload,
      }),
      { PATREON_WEBHOOK_SECRET: "patreon_secret", SUPPORT_KV: kv },
      { waitUntil: vi.fn() },
    );

    expect(response.status).toBe(401);
    expect(Object.keys(kv.store)).toHaveLength(0);
  });
});

function monthKey(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function mockKv(initial: Record<string, string> = {}) {
  const store: Record<string, string> = { ...initial };
  return {
    store,
    async get(key: string) {
      return key in store ? store[key]! : null;
    },
    async put(key: string, value: string) {
      store[key] = value;
    },
  };
}

type DonationRow = {
  id: string;
  day: string;
  amountMinor: number;
  currency: string;
  eventType: string;
  stripeSessionId: string;
  stripeCreatedAt: number;
  receivedAt: string;
};

function mockSupportDb(initialRows: DonationRow[] = []) {
  const rows = [...initialRows];
  return {
    rows,
    prepare(query: string) {
      let values: unknown[] = [];
      return {
        bind(...bound: unknown[]) {
          values = bound;
          return this;
        },
        async first<T>() {
          if (/SELECT COALESCE\(SUM\(amount_minor\), 0\)/.test(query)) {
            if (/day >= \? AND day < \?/.test(query)) {
              const start = String(values[0] ?? "");
              const end = String(values[1] ?? "");
              const total_minor = rows
                .filter(row => row.day >= start && row.day < end && row.currency === "gbp")
                .reduce((sum, row) => sum + row.amountMinor, 0);
              return { total_minor } as T;
            }
            const day = String(values[0] ?? "");
            const total_minor = rows
              .filter(row => row.day === day && row.currency === "gbp")
              .reduce((sum, row) => sum + row.amountMinor, 0);
            return { total_minor } as T;
          }
          return null;
        },
        async run() {
          if (/INSERT OR IGNORE INTO donation_events/.test(query)) {
            const id = String(values[0] ?? "");
            if (!rows.some(row => row.id === id)) {
              rows.push({
                id,
                day: String(values[1] ?? ""),
                amountMinor: Number(values[2] ?? 0),
                currency: String(values[3] ?? ""),
                eventType: String(values[4] ?? ""),
                stripeSessionId: String(values[5] ?? ""),
                stripeCreatedAt: Number(values[6] ?? 0),
                receivedAt: String(values[7] ?? ""),
              });
            }
          }
          return { success: true };
        },
      };
    },
  };
}

async function stripeSignatureHeader(payload: string, secret: string, timestamp: number): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${payload}`));
  return `t=${timestamp},v1=${Array.from(new Uint8Array(signature), byte => byte.toString(16).padStart(2, "0")).join("")}`;
}

// Independent HMAC-MD5 implementation for the Patreon signature test, so the
// test does not depend on the Worker's internal helpers.
async function patreonSignature(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  let key: Uint8Array = encoder.encode(secret);
  if (key.length > 64) key = md5(key);
  const block = new Uint8Array(64);
  block.set(key);
  const ipad = new Uint8Array(64);
  const opad = new Uint8Array(64);
  for (let i = 0; i < 64; i += 1) {
    ipad[i] = block[i]! ^ 0x36;
    opad[i] = block[i]! ^ 0x5c;
  }
  const inner = md5(concat(ipad, encoder.encode(payload)));
  return hex(md5(concat(opad, inner)));
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

function md5(input: Uint8Array): Uint8Array {
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
