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
    expect(body.banner.goalLabel).toContain("This month: £4 / £10");
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

  it("localizes the complete support banner for Japanese-only readers", async () => {
    const response = await SupportWorker.fetch(
      new Request("https://support.yomureader.com/status", {
        headers: { "accept-language": "ja-JP,ja;q=0.9" },
      }),
      { SUPPORT_DONATION_GOAL_MONTHLY_GBP: "10", SUPPORT_DONATIONS_THIS_MONTH_GBP: "0" },
      { waitUntil: vi.fn() },
    );
    const body = await response.json() as {
      banner: { message: string; costLabel: string; goalLabel: string; ctaLabel: string };
    };

    expect(body.banner.message).toContain("寄付で運営されています");
    expect(body.banner.costLabel).toBe("寄付目標：月£10");
    expect(body.banner.goalLabel).toBe("今月：£0 / £10");
    expect(body.banner.ctaLabel).toBe("寄付する");
    expect(JSON.stringify(body.banner)).not.toContain("Donation goal");
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

  it("rounds status amounts to whole units for display without changing the exact forecast", async () => {
    const response = await SupportWorker.fetch(
      new Request("https://support.yomureader.com/status"),
      { SUPPORT_DONATIONS_THIS_MONTH_GBP: "15" },
      { waitUntil: vi.fn() },
    );
    const body = await response.json() as {
      donationGoalGbp: number;
      forecastGbp: number;
      donationsThisMonthGbp: number;
      goalMet: boolean;
      display: { amountText: string; goalText: string };
    };

    expect(body.forecastGbp).toBe(10.2);
    expect(body.donationGoalGbp).toBe(10);
    expect(body.donationsThisMonthGbp).toBe(15);
    expect(body.goalMet).toBe(true);
    expect(body.display).toMatchObject({ amountText: "£15", goalText: "£10" });
  });

  it("aggregates month-to-date progress across unique provider events", async () => {
    const day = `${monthKey()}-01`;
    const db = mockSupportDb([
      providerDonationRow("kofi", "kofi-progress", day, 1200),
      providerDonationRow("patreon", "patreon-progress", day, 500),
    ]);
    const response = await SupportWorker.fetch(
      new Request("https://support.yomureader.com/progress"),
      { SUPPORT_DB: db },
      { waitUntil: vi.fn() },
    );

    expect(response.status).toBe(200);
    const body = await response.json() as {
      totalThisMonthGbp: number;
      providers: Array<{ provider: string; monthGbp: number; source: string }>;
    };
    expect(body.totalThisMonthGbp).toBe(17);
    expect(body.providers.find(p => p.provider === "stripe")?.monthGbp).toBe(0);
    expect(body.providers.find(p => p.provider === "kofi")?.monthGbp).toBe(12);
    expect(body.providers.find(p => p.provider === "patreon")?.monthGbp).toBe(5);
    expect(body.providers.find(p => p.provider === "bmac")?.monthGbp).toBe(0);
  });

  it("edge-caches public progress so repeat banner reads do not repeat D1 aggregates", async () => {
    const day = `${monthKey()}-01`;
    const db = mockSupportDb([
      providerDonationRow("kofi", "kofi-cache", day, 1200),
      providerDonationRow("patreon", "patreon-cache", day, 500),
    ]);
    const prepare = vi.spyOn(db, "prepare");
    const backend = mockEdgeCache({ storedCacheControl: "public, max-age=14400" });
    vi.stubGlobal("caches", { default: backend });
    const pending: Promise<unknown>[] = [];
    const request = new Request("https://support.yomureader.com/progress", {
      headers: { origin: "https://yomureader.com" },
    });

    const first = await SupportWorker.fetch(
      request,
      { SUPPORT_DB: db },
      { waitUntil: promise => pending.push(promise) },
    );
    await Promise.all(pending);
    const readsAfterMiss = prepare.mock.calls.length;
    const second = await SupportWorker.fetch(
      new Request(request.url, { headers: { origin: "https://reader.example" } }),
      { SUPPORT_DB: db },
      { waitUntil: vi.fn() },
    );

    expect(first.headers.get("x-yomu-edge-cache")).toBe("miss");
    expect(second.headers.get("x-yomu-edge-cache")).toBe("hit");
    expect(second.headers.get("cache-control")).toBe("public, max-age=300");
    expect(second.headers.get("access-control-allow-origin")).toBe("https://reader.example");
    expect(prepare).toHaveBeenCalledTimes(readsAfterMiss);
    await expect(second.json()).resolves.toMatchObject({ totalThisMonthGbp: 17 });
  });

  it("converts native Stripe totals to estimated GBP without rewriting the native ledger", async () => {
    const day = `${monthKey()}-01`;
    const db = mockSupportDb([
      stripeDonationRow("stripe-gbp", day, 500, "gbp"),
      stripeDonationRow("stripe-usd", day, 1400, "usd"),
      stripeDonationRow("stripe-jpy", day, 1000, "jpy"),
    ]);
    const kv = mockKv({
      "fx:GBP:latest": JSON.stringify({ base: "GBP", date: "2026-07-21", rates: { USD: 2, JPY: 200 } }),
    });

    const response = await SupportWorker.fetch(
      new Request("https://support.yomureader.com/progress"),
      { SUPPORT_DB: db, SUPPORT_KV: kv },
      { waitUntil: vi.fn() },
    );
    const body = await response.json() as {
      totalThisMonthGbp: number;
      providers: Array<{ provider: string; monthGbp: number }>;
    };

    expect(body.totalThisMonthGbp).toBe(17);
    expect(body.providers.find(provider => provider.provider === "stripe")?.monthGbp).toBe(17);
    expect(db.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "stripe-usd", amountMinor: 1400, currency: "usd" }),
      expect.objectContaining({ id: "stripe-jpy", amountMinor: 1000, currency: "jpy" }),
    ]));
  });

  it("quarantines historical test Checkout rows from donation progress", async () => {
    const day = `${monthKey()}-01`;
    const db = mockSupportDb([
      stripeDonationRow("live-gbp", day, 500, "gbp"),
      { ...stripeDonationRow("test-gbp", day, 1000, "gbp"), stripeSessionId: "cs_test_historical_probe" },
    ]);

    const response = await SupportWorker.fetch(
      new Request("https://support.yomureader.com/progress"),
      { SUPPORT_DB: db },
      { waitUntil: vi.fn() },
    );

    await expect(response.json()).resolves.toMatchObject({
      totalTodayGbp: 0,
      totalThisMonthGbp: 5,
    });
  });

  it("omits only foreign totals with no FX rate and never fetches FX for GBP-only progress", async () => {
    const day = `${monthKey()}-01`;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const gbpOnly = await SupportWorker.fetch(
      new Request("https://support.yomureader.com/progress"),
      { SUPPORT_DB: mockSupportDb([stripeDonationRow("gbp-only", day, 500, "gbp")]) },
      { waitUntil: vi.fn() },
    );
    await expect(gbpOnly.json()).resolves.toMatchObject({ totalThisMonthGbp: 5 });
    expect(fetchMock).not.toHaveBeenCalled();

    const partial = await SupportWorker.fetch(
      new Request("https://support.yomureader.com/progress"),
      {
        SUPPORT_DB: mockSupportDb([
          stripeDonationRow("gbp", day, 500, "gbp"),
          stripeDonationRow("usd", day, 1400, "usd"),
          stripeDonationRow("cad-no-rate", day, 1000, "cad"),
        ]),
        SUPPORT_KV: mockKv({
          "fx:GBP:latest": JSON.stringify({ base: "GBP", date: "2026-07-21", rates: { USD: 2 } }),
        }),
      },
      { waitUntil: vi.fn() },
    );
    await expect(partial.json()).resolves.toMatchObject({ totalThisMonthGbp: 12 });
    expect(fetchMock).not.toHaveBeenCalled();
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
    expect(body.display.goal).toBe(13);
    expect(body.display.amount).toBe(7);
    expect(body.display.goalText).toBe("$13");
    expect(body.banner.costLabel).toBe("Donation goal: $13/month");
    expect(body.banner.goalLabel).toContain("$7 / $13");
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

  it("keeps the donor-selected amount fail-closed when Checkout is not configured", async () => {
    const response = await SupportWorker.fetch(
      new Request("https://yomu-support.example.workers.dev/donate?amount_gbp=12.34"),
      {},
      { waitUntil: vi.fn() },
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("location")).toBeNull();
  });

  it("does not send production donation requests to Stripe test mode", async () => {
    const stripeFetch = vi.fn();
    vi.stubGlobal("fetch", stripeFetch);

    const response = await SupportWorker.fetch(
      new Request("https://support.yomureader.com/donate?amount_gbp=5"),
      {
        STRIPE_SECRET_KEY: "sk_test_secret",
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

  it("fails closed for an unrecognized production Stripe credential", async () => {
    const stripeFetch = vi.fn();
    vi.stubGlobal("fetch", stripeFetch);
    const env = { STRIPE_SECRET_KEY: "not-a-stripe-key" };
    const checkout = await SupportWorker.fetch(
      new Request("https://support.yomureader.com/donate?amount_gbp=5"),
      env,
      { waitUntil: vi.fn() },
    );
    const status = await SupportWorker.fetch(
      new Request("https://support.yomureader.com/status"),
      env,
      { waitUntil: vi.fn() },
    );
    expect(checkout.status).toBe(503);
    expect(stripeFetch).not.toHaveBeenCalled();
    await expect(status.json()).resolves.toMatchObject({ status: "stripe-unconfigured" });
  });

  it("does not loop through the support page when no Stripe donation path is available", async () => {
    const response = await SupportWorker.fetch(
      new Request("https://support.yomureader.com/donate?amount_gbp=5"),
      {},
      { waitUntil: vi.fn() },
    );

    expect(response.status).toBe(503);
    await expect(response.text()).resolves.toContain("Stripe donations are temporarily unavailable");
  });

  it("serves a secure donor-chosen amount form without contacting Stripe", async () => {
    const stripeFetch = vi.fn();
    vi.stubGlobal("fetch", stripeFetch);

    const response = await SupportWorker.fetch(
      new Request("https://support.yomureader.com/donate"),
      { STRIPE_SECRET_KEY: "sk_live_secret" },
      { waitUntil: vi.fn() },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-security-policy")).toContain("form-action 'self'");
    const body = await response.text();
    expect(body).toContain('name="currency"');
    expect(body).toContain('<option value="gbp" selected>');
    expect(body).toContain('<option value="jpy"');
    expect(body).toContain('name="amount"');
    expect(body).toContain('JPY ¥1,000–¥100,000');
    expect(stripeFetch).not.toHaveBeenCalled();
  });

  it.each(["", "0", "4.99", "500.01", "5.001", "1e2", "abc"])(
    "rejects invalid explicit donation amount %j without contacting Stripe",
    async amount => {
      const stripeFetch = vi.fn();
      vi.stubGlobal("fetch", stripeFetch);
      const response = await SupportWorker.fetch(
        new Request(`https://support.yomureader.com/donate?amount_gbp=${encodeURIComponent(amount)}`),
        { STRIPE_SECRET_KEY: "sk_live_secret" },
        { waitUntil: vi.fn() },
      );
      expect(response.status).toBe(400);
      await expect(response.text()).resolves.toContain("within the range shown for the selected currency");
      expect(stripeFetch).not.toHaveBeenCalled();
    },
  );

  it("creates Stripe Checkout sessions server-side and redirects to Stripe", async () => {
    let checkoutClaimHash = "";
    const stripeFetch = vi.fn(async (_url: string, init: RequestInit) => {
      expect(init.method).toBe("POST");
      expect(new Headers(init.headers).get("authorization")).toBe("Bearer sk_live_secret");
      expect(new Headers(init.headers).get("stripe-version")).toBe("2026-02-25.clover");
      const body = init.body as URLSearchParams;
      expect(body.get("mode")).toBe("payment");
      expect(body.get("submit_type")).toBe("donate");
      expect(body.get("line_items[0][price_data][currency]")).toBe("gbp");
      expect(body.get("line_items[0][price_data][unit_amount]")).toBe("750");
      expect(body.get("success_url")).toBe(
        "https://support.yomureader.com/claim?session_id={CHECKOUT_SESSION_ID}",
      );
      checkoutClaimHash = body.get("metadata[yomu_academy_claim_hash]") ?? "";
      expect(checkoutClaimHash).toMatch(/^[a-f0-9]{64}$/u);
      return Response.json({ id: "cs_live_currency123", livemode: true, url: "https://checkout.stripe.com/c/session" });
    });
    vi.stubGlobal("fetch", stripeFetch);

    const response = await SupportWorker.fetch(
      new Request("https://support.yomureader.com/donate?amount_gbp=7.5"),
      { STRIPE_SECRET_KEY: "sk_live_secret" },
      { waitUntil: vi.fn() },
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://checkout.stripe.com/c/session");
    expect(response.headers.get("set-cookie")).toMatch(
      /^__Host-yomu_support_claim=[A-Za-z0-9_-]{43}; Path=\/; Secure; HttpOnly; SameSite=Lax; Max-Age=86400$/u,
    );
    const claimToken = /__Host-yomu_support_claim=([A-Za-z0-9_-]{43})/u.exec(
      response.headers.get("set-cookie") ?? "",
    )?.[1] ?? "";
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(claimToken));
    expect(Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join(""))
      .toBe(checkoutClaimHash);
    expect(stripeFetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["gbp", "5", "500"], ["gbp", "500", "50000"],
    ["usd", "7", "700"], ["usd", "700", "70000"],
    ["eur", "6", "600"], ["eur", "600", "60000"],
    ["cad", "10", "1000"], ["cad", "1000", "100000"],
    ["aud", "11", "1100"], ["aud", "1100", "110000"],
    ["jpy", "1000", "1000"], ["jpy", "100000", "100000"],
  ])("creates a native %s Checkout amount", async (currency, amount, expectedMinor) => {
    const stripeFetch = vi.fn(async (_url: string, init: RequestInit) => {
      const body = init.body as URLSearchParams;
      expect(body.get("line_items[0][price_data][currency]")).toBe(currency);
      expect(body.get("line_items[0][price_data][unit_amount]")).toBe(expectedMinor);
      return Response.json({ id: "cs_live_currency123", livemode: true, url: "https://checkout.stripe.com/c/session" });
    });
    vi.stubGlobal("fetch", stripeFetch);

    const response = await SupportWorker.fetch(
      new Request(`https://support.yomureader.com/donate?currency=${currency}&amount=${amount}`),
      { STRIPE_SECRET_KEY: "sk_live_secret" },
      { waitUntil: vi.fn() },
    );

    expect(response.status).toBe(303);
    expect(stripeFetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["gbp", "4.99"], ["gbp", "500.01"],
    ["usd", "6.99"], ["usd", "700.01"],
    ["eur", "5.99"], ["eur", "600.01"],
    ["cad", "9.99"], ["cad", "1000.01"],
    ["aud", "10.99"], ["aud", "1100.01"],
    ["jpy", "999"], ["jpy", "100001"], ["jpy", "100000.1"],
    ["btc", "5"],
  ])("rejects out-of-range %s amount %s", async (currency, amount) => {
    const stripeFetch = vi.fn();
    vi.stubGlobal("fetch", stripeFetch);
    const response = await SupportWorker.fetch(
      new Request(`https://support.yomureader.com/donate?currency=${currency}&amount=${amount}`),
      { STRIPE_SECRET_KEY: "sk_live_secret" },
      { waitUntil: vi.fn() },
    );
    expect(response.status).toBe(400);
    expect(stripeFetch).not.toHaveBeenCalled();
  });

  it.each([
    "amount=7&amount=8&currency=usd",
    "amount_gbp=5&amount=7",
    "amount=7&currency=usd&currency=eur",
    "amount_gbp=5&currency=usd",
  ])("rejects duplicate or mixed donation parameters: %s", async query => {
    const stripeFetch = vi.fn();
    vi.stubGlobal("fetch", stripeFetch);
    const response = await SupportWorker.fetch(
      new Request(`https://support.yomureader.com/donate?${query}`),
      { STRIPE_SECRET_KEY: "sk_live_secret" },
      { waitUntil: vi.fn() },
    );
    expect(response.status).toBe(400);
    expect(stripeFetch).not.toHaveBeenCalled();
  });

  it("keeps amount_gbp backwards-compatible and GBP-only", async () => {
    const stripeFetch = vi.fn(async (_url: string, init: RequestInit) => {
      const body = init.body as URLSearchParams;
      expect(body.get("line_items[0][price_data][currency]")).toBe("gbp");
      expect(body.get("line_items[0][price_data][unit_amount]")).toBe("500");
      return Response.json({ id: "cs_live_legacy123", livemode: true, url: "https://checkout.stripe.com/c/session" });
    });
    vi.stubGlobal("fetch", stripeFetch);
    const response = await SupportWorker.fetch(
      new Request("https://support.yomureader.com/donate?amount_gbp=5&currency=GBP"),
      { STRIPE_SECRET_KEY: "sk_live_secret" },
      { waitUntil: vi.fn() },
    );
    expect(response.status).toBe(303);
  });

  it("self-claims a verified Stripe donation only with the HttpOnly browser secret", async () => {
    const claimToken = "a".repeat(43);
    const academy = mockAcademyIngress(request => {
      expect(new URL(request.url).pathname).toBe("/academy/internal/payment-claim");
      expect(request.headers.get("authorization")).toBe("Bearer ingress-secret");
      return Response.json({ status: "ready", code: "YOMU-PAID-CODE" });
    });
    const env = withAcademyIngress({}, academy);

    const missingCookie = await SupportWorker.fetch(
      new Request("https://support.yomureader.com/claim?session_id=cs_live_paid"),
      env,
      { waitUntil: vi.fn() },
    );
    expect(missingCookie.status).toBe(400);
    expect(academy.fetch).not.toHaveBeenCalled();

    const claimed = await SupportWorker.fetch(
      new Request("https://support.yomureader.com/claim?session_id=cs_live_paid", {
        headers: { cookie: `__Host-yomu_support_claim=${claimToken}` },
      }),
      env,
      { waitUntil: vi.fn() },
    );
    expect(claimed.status).toBe(200);
    const claimText = await claimed.text();
    expect(claimText).toContain("Your よむ Academy code is: YOMU-PAID-CODE");
    expect(claimText).toContain("Enter it within 30 days of payment.");
    expect(claimText).not.toContain("permanent");
    expect(claimed.headers.get("set-cookie")).toBeNull();
    await expect(academy.requests[0]!.json()).resolves.toEqual({
      provider: "stripe",
      transactionReference: "cs_live_paid",
      claimToken,
    });

    const head = await SupportWorker.fetch(
      new Request("https://support.yomureader.com/claim?session_id=cs_live_paid", {
        method: "HEAD",
        headers: { cookie: `__Host-yomu_support_claim=${claimToken}` },
      }),
      env,
      { waitUntil: vi.fn() },
    );
    expect(head.status).toBe(405);
    expect(head.headers.get("allow")).toBe("GET");
  });

  it("rejects test Checkout URLs returned to the production support host", async () => {
    const stripeFetch = vi.fn(async () => Response.json({
      id: "cs_test_123", livemode: false, url: "https://checkout.stripe.com/c/pay/cs_test_123",
    }));
    vi.stubGlobal("fetch", stripeFetch);

    const response = await SupportWorker.fetch(
      new Request("https://support.yomureader.com/donate?amount_gbp=5"),
      { STRIPE_SECRET_KEY: "sk_live_secret" },
      { waitUntil: vi.fn() },
    );

    expect(response.status).toBe(503);
    await expect(response.text()).resolves.toContain("Stripe donations are temporarily unavailable");
    expect(stripeFetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    { id: "cs_live_123", livemode: true, url: "https://evil.example/c/pay/cs_live_123" },
    { id: "cs_live_123", livemode: true, url: "https://checkout.stripe.com.evil.example/c/pay/cs_live_123" },
    { id: "cs_test_123", livemode: true, url: "https://checkout.stripe.com/c/pay/cs_test_123" },
    { id: "cs_live_123", livemode: false, url: "https://checkout.stripe.com/c/pay/cs_live_123" },
    { livemode: true, url: "https://checkout.stripe.com/c/pay/cs_live_123" },
  ])("rejects an untrusted production Checkout response %#", async checkout => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(checkout)));
    const response = await SupportWorker.fetch(
      new Request("https://support.yomureader.com/donate?amount_gbp=5"),
      { STRIPE_SECRET_KEY: "sk_live_secret" },
      { waitUntil: vi.fn() },
    );
    expect(response.status).toBe(503);
  });

  it("records signed Stripe Checkout donation webhooks once and reflects them in status", async () => {
    const db = mockSupportDb();
    const academy = mockAcademyIngress();
    const timestamp = Math.floor(Date.now() / 1000);
    const payload = JSON.stringify({
      id: "evt_donation_1",
      type: "checkout.session.completed",
      livemode: true,
      created: timestamp,
      data: {
        object: {
          id: "cs_live_donation_1",
          amount_total: 750,
          currency: "gbp",
          payment_status: "paid",
          metadata: { yomu_service: "support" },
        },
      },
    });
    const webhookRequest = new Request("https://support.yomureader.com/stripe/webhook", {
      method: "POST",
      headers: { "stripe-signature": await stripeSignatureHeader(payload, "whsec_test", timestamp) },
      body: payload,
    });
    const env = withAcademyIngress({ STRIPE_WEBHOOK_SECRET: "whsec_test", SUPPORT_DB: db }, academy);

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
    expect(academy.fetch).toHaveBeenCalledTimes(2);
    await expect(status.json()).resolves.toMatchObject({
      donationsSource: "d1",
      donationsTodayGbp: 7.5,
      donationsThisMonthGbp: 7.5,
      donationGoalGbp: 10,
      goalMet: false,
    });
  });

  it("emails a verified Stripe recipient exactly once across a duplicate webhook", async () => {
    const db = mockSupportDb();
    const academy = mockDeliverableAcademy();
    const email = mockEmailBinding();
    const timestamp = Math.floor(Date.now() / 1000);
    const payload = stripeCheckoutEventPayload({
      eventId: "evt_delivery_once",
      sessionId: "cs_live_delivery_once",
      timestamp,
      customerDetailsEmail: "donor@example.test",
    });
    const request = await signedSupportStripeWebhook(payload, "whsec_test", timestamp);
    const env = withAcademyIngress({
      STRIPE_WEBHOOK_SECRET: "whsec_test",
      SUPPORT_DB: db,
      ACADEMY_CODE_EMAIL: email,
    }, academy);

    expect((await SupportWorker.fetch(request.clone(), env, { waitUntil: vi.fn() })).status).toBe(200);
    expect((await SupportWorker.fetch(request.clone(), env, { waitUntil: vi.fn() })).status).toBe(200);

    expect(email.send).toHaveBeenCalledTimes(1);
    expect(email.messages[0]).toMatchObject({
      to: "donor@example.test",
      subject: "Your よむ Academy code / よむ Academy コード",
    });
    expect(email.messages[0]!.text).toContain(academy.code);
    expect(academy.state()).toBe("email_accepted");
    expect(academy.ingressRequests).toHaveLength(2);
    expect(db.rows).toHaveLength(1);
  });

  it("does not trust Stripe customer_email or a malformed customer-details address", async () => {
    const db = mockSupportDb();
    const academy = mockDeliverableAcademy();
    const email = mockEmailBinding();
    const timestamp = Math.floor(Date.now() / 1000);
    const payload = stripeCheckoutEventPayload({
      eventId: "evt_delivery_manual",
      sessionId: "cs_live_delivery_manual",
      timestamp,
      customerDetailsEmail: "Donor <donor@example.test>",
      customerEmail: "fallback@example.test",
    });
    const request = await signedSupportStripeWebhook(payload, "whsec_test", timestamp);
    const response = await SupportWorker.fetch(request, withAcademyIngress({
      STRIPE_WEBHOOK_SECRET: "whsec_test",
      SUPPORT_DB: db,
      ACADEMY_CODE_EMAIL: email,
      ACADEMY_DELIVERY_ALERT_EMAIL: "owner@example.test",
    }, academy), { waitUntil: vi.fn() });

    expect(response.status).toBe(200);
    expect(email.send).toHaveBeenCalledTimes(1);
    expect(email.messages[0]?.to).toBe("owner@example.test");
    expect(email.messages[0]?.to).not.toBe("fallback@example.test");
    expect(academy.state()).toBe("manual_required");
    expect(db.rows).toHaveLength(1);
  });

  it("returns 5xx for a transient email failure so Stripe can retry", async () => {
    const db = mockSupportDb();
    const academy = mockDeliverableAcademy();
    const email = mockEmailBinding(async () => {
      throw Object.assign(new Error("temporary"), { code: "E_INTERNAL_SERVER_ERROR" });
    });
    const timestamp = Math.floor(Date.now() / 1000);
    const payload = stripeCheckoutEventPayload({
      eventId: "evt_delivery_retry",
      sessionId: "cs_live_delivery_retry",
      timestamp,
      customerDetailsEmail: "donor@example.test",
    });
    const request = await signedSupportStripeWebhook(payload, "whsec_test", timestamp);
    const response = await SupportWorker.fetch(request, withAcademyIngress({
      STRIPE_WEBHOOK_SECRET: "whsec_test",
      SUPPORT_DB: db,
      ACADEMY_CODE_EMAIL: email,
    }, academy), { waitUntil: vi.fn() });

    expect(response.status).toBe(500);
    expect(email.send).toHaveBeenCalledTimes(1);
    expect(academy.state()).toBe("retry");
    expect(db.rows).toHaveLength(1);
  });

  it("rejects Stripe webhooks with invalid signatures before recording", async () => {
    const db = mockSupportDb();
    const academy = mockAcademyIngress();
    const response = await SupportWorker.fetch(
      new Request("https://support.yomureader.com/stripe/webhook", {
        method: "POST",
        headers: { "stripe-signature": "t=100,v1=bad" },
        body: JSON.stringify({ id: "evt_bad" }),
      }),
      {
        STRIPE_WEBHOOK_SECRET: "whsec_test",
        SUPPORT_DB: db,
        ACADEMY_PAYMENT_INGRESS: academy,
        PAYMENT_INGRESS_TOKEN: "ingress-secret",
      },
      { waitUntil: vi.fn() },
    );

    expect(response.status).toBe(400);
    expect(db.rows).toHaveLength(0);
    expect(academy.fetch).not.toHaveBeenCalled();
  });

  it("forwards only securely linked Stripe Academy purchases with stable provider IDs", async () => {
    const db = mockSupportDb();
    const academy = mockAcademyIngress();
    const timestamp = Math.floor(Date.now() / 1000);
    const purchaseId = "819f4c92-c7de-46a9-9054-0fed9bb579a6";
    const payload = JSON.stringify({
      id: "evt_academy_1",
      type: "checkout.session.completed",
      livemode: true,
      created: timestamp,
      data: {
        object: {
          id: "cs_live_academy_1",
          payment_intent: "pi_academy_1",
          amount_total: 750,
          currency: "gbp",
          payment_status: "paid",
          metadata: { yomu_service: "support", yomu_academy_purchase: purchaseId },
        },
      },
    });
    const request = await signedSupportStripeWebhook(payload, "whsec_test", timestamp);
    const env = withAcademyIngress({
      STRIPE_WEBHOOK_SECRET: "whsec_test",
      SUPPORT_DB: db,
    }, academy);

    expect((await SupportWorker.fetch(request.clone(), env, { waitUntil: vi.fn() })).status).toBe(200);
    expect((await SupportWorker.fetch(request.clone(), env, { waitUntil: vi.fn() })).status).toBe(200);

    expect(db.rows).toHaveLength(1);
    expect(academy.requests).toHaveLength(2);
    expect(academy.requests[0]!.headers.get("authorization")).toBe("Bearer ingress-secret");
    const first = await academy.requests[0]!.json();
    const duplicate = await academy.requests[1]!.json();
    expect(first).toEqual({
      schemaVersion: 1,
      provider: "stripe",
      eventId: "evt_academy_1",
      eventType: "charge.settled",
      occurredAt: timestamp * 1000,
      subject: { kind: "academy_purchase", reference: purchaseId },
      transaction: {
        reference: "cs_live_academy_1",
        sessionReference: "cs_live_academy_1",
        currency: "gbp",
        amountMinor: 750,
      },
      purchaseId,
    });
    expect(duplicate).toEqual(first);
  });

  it("forwards an ordinary verified Stripe support donation for permanent Academy access", async () => {
    const db = mockSupportDb();
    const academy = mockAcademyIngress();
    const timestamp = Math.floor(Date.now() / 1000);
    const response = await postStripeCheckoutEvent({
      eventId: "evt_support_only",
      sessionId: "cs_live_support",
      timestamp,
    }, db, academy);

    expectWebhookOutcome(response, db, academy, 200, 1);
    await expect(academy.requests[0]!.json()).resolves.toEqual({
      schemaVersion: 1,
      provider: "stripe",
      eventId: "evt_support_only",
      eventType: "charge.settled",
      occurredAt: timestamp * 1000,
      subject: { kind: "transaction", reference: "cs_live_support" },
      transaction: {
        reference: "cs_live_support",
        sessionReference: "cs_live_support",
        currency: "gbp",
        amountMinor: 500,
      },
    });
  });

  it("records and forwards a verified native-currency Stripe donation without consulting FX", async () => {
    const db = mockSupportDb();
    const academy = mockAcademyIngress();
    const timestamp = Math.floor(Date.now() / 1000);
    const response = await postStripeCheckoutEvent({
      eventId: "evt_support_usd",
      sessionId: "cs_live_support_usd",
      timestamp,
      amountMinor: 700,
      currency: "usd",
    }, db, academy);

    expectWebhookOutcome(response, db, academy, 200, 1);
    expect(db.rows[0]).toMatchObject({ amountMinor: 700, currency: "usd" });
    await expect(academy.requests[0]!.json()).resolves.toMatchObject({
      transaction: { currency: "usd", amountMinor: 700 },
    });
  });

  it("ignores unsupported or out-of-policy Stripe webhook amounts", async () => {
    for (const input of [
      { eventId: "evt_bad_currency", sessionId: "cs_live_bad_currency", currency: "btc", amountMinor: 500 },
      { eventId: "evt_low_usd", sessionId: "cs_live_low_usd", currency: "usd", amountMinor: 699 },
      { eventId: "evt_fractional", sessionId: "cs_live_fractional", currency: "jpy", amountMinor: 1000.5 },
    ]) {
      const db = mockSupportDb();
      const academy = mockAcademyIngress();
      const response = await postStripeCheckoutEvent({
        ...input,
        timestamp: Math.floor(Date.now() / 1000),
      }, db, academy);
      expect(response.status).toBe(200);
      expect(db.rows).toHaveLength(0);
      expect(academy.fetch).not.toHaveBeenCalled();
    }
  });

  it.each([
    { eventLivemode: false, sessionId: "cs_test_signed_probe" },
    { eventLivemode: true, sessionId: "cs_test_wrong_mode" },
  ])("never records a signed Stripe test-mode webhook %#", async ({ eventLivemode, sessionId }) => {
    const db = mockSupportDb();
    const academy = mockAcademyIngress();
    const response = await postStripeCheckoutEvent({
      eventId: `evt_${sessionId}`,
      sessionId,
      timestamp: Math.floor(Date.now() / 1000),
      eventLivemode,
    }, db, academy);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true, recorded: false });
    expect(db.rows).toHaveLength(0);
    expect(academy.fetch).not.toHaveBeenCalled();
  });

  it.each([null, "another-service"])(
    "ignores a signed live Checkout session without the Yomu support marker %#",
    async supportService => {
      const db = mockSupportDb();
      const academy = mockAcademyIngress();
      const response = await postStripeCheckoutEvent({
        eventId: `evt_unscoped_${supportService ?? "missing"}`,
        sessionId: `cs_live_unscoped_${supportService ?? "missing"}`,
        timestamp: Math.floor(Date.now() / 1000),
        supportService,
      }, db, academy);

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ received: true, recorded: false });
      expect(db.rows).toHaveLength(0);
      expect(academy.fetch).not.toHaveBeenCalled();
    },
  );

  it("returns 5xx but keeps support accounting when Academy ingestion fails", async () => {
    const db = mockSupportDb();
    const academy = mockAcademyIngress(() => new Response("unavailable", { status: 503 }));
    const timestamp = Math.floor(Date.now() / 1000);
    const response = await postStripeCheckoutEvent({
      eventId: "evt_retry_academy",
      sessionId: "cs_live_retry",
      timestamp,
      purchaseId: "purchase-retry",
    }, db, academy);

    expectWebhookOutcome(response, db, academy, 500, 1);
  });

  it("accepts a valid stale Academy result once and emits a distinct structured warning", async () => {
    const db = mockSupportDb();
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const academy = mockAcademyIngress(() => Response.json(
      { received: true, applied: false, reason: "stale" },
      { status: 202 },
    ));
    const timestamp = Math.floor(Date.now() / 1000);
    const response = await postStripeCheckoutEvent({
        eventId: "evt_stale_academy",
        sessionId: "cs_live_stale",
        timestamp,
        purchaseId: "purchase-stale",
    }, db, academy);

    expectWebhookOutcome(response, db, academy, 200, 1);
    expect(warning).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(warning.mock.calls[0]?.[0]))).toEqual({
      event: "yomu_support_academy_ingress_stale",
      provider: "stripe",
      status: 202,
      reason: "stale",
    });
    warning.mockRestore();
  });

  it("rejects an Academy ingress response that exposes a delivery code", async () => {
    const db = mockSupportDb();
    const academy = mockAcademyIngress(() => Response.json({
      received: true,
      applied: true,
      deliveryStatus: "pending",
      deliveryId: `paydel_${"b".repeat(40)}`,
      code: "ABCD-EFGH-IJKL-MNOP",
    }));
    const timestamp = Math.floor(Date.now() / 1000);
    const response = await postStripeCheckoutEvent({
        eventId: "evt_bad_academy_ack",
        sessionId: "cs_live_bad_ack",
        timestamp,
        purchaseId: "purchase-bad-ack",
    }, db, academy);

    expectWebhookOutcome(response, db, academy, 500, 1);
  });

  it("refuses to count an authenticated Ko-fi donation without stable payment identity", async () => {
    const db = mockSupportDb();
    const donationPayload = JSON.stringify({
      verification_token: "kofi_secret",
      type: "Donation",
      amount: "1.00",
      currency: "GBP",
    });
    const response = await fetchSupportWebhook(
      supportKofiWebhook(donationPayload),
      { KOFI_WEBHOOK_SECRET: "kofi_secret", SUPPORT_DB: db },
    );

    expect(response.status).toBe(422);
    expect(db.rows).toHaveLength(0);
  });

  it("rejects a Ko-fi webhook with the wrong verification token", async () => {
    const db = mockSupportDb();
    const academy = mockAcademyIngress();
    const payload = JSON.stringify({ verification_token: "wrong", amount: "6.00", currency: "GBP" });
    await expectProviderAuthRejected(
      supportKofiWebhook(payload),
      { KOFI_WEBHOOK_SECRET: "kofi_secret", SUPPORT_DB: db },
      db,
      academy,
    );
  });

  it("accepts Ko-fi's real webhook field shape and keeps its identities retry-stable", async () => {
    const db = mockSupportDb();
    const academy = mockAcademyIngress();
    const donationPayload = JSON.stringify({
      verification_token: "kofi_secret",
      message_id: "message-42",
      timestamp: "2026-07-20T01:02:03.000Z",
      type: "Donation",
      is_public: true,
      from_name: "Example Supporter",
      message: "Thank you",
      amount: "1.00",
      url: "https://ko-fi.com/yomureader",
      email: "supporter@example.test",
      currency: "GBP",
      is_subscription_payment: false,
      is_first_subscription_payment: false,
      kofi_transaction_id: "transaction-99",
      shop_items: null,
      tier_name: null,
      shipping: null,
    });
    const env = withAcademyIngress({
      KOFI_WEBHOOK_SECRET: "kofi_secret",
      SUPPORT_DB: db,
    }, academy);

    expect((await SupportWorker.fetch(supportKofiWebhook(donationPayload), env, { waitUntil: vi.fn() })).status).toBe(200);
    expect((await SupportWorker.fetch(supportKofiWebhook(donationPayload), env, { waitUntil: vi.fn() })).status).toBe(200);
    const first = await academy.requests[0]!.json();
    const retry = await academy.requests[1]!.json();
    expect(first).toEqual({
      schemaVersion: 1,
      provider: "kofi",
      eventId: "message-42",
      eventType: "charge.settled",
      occurredAt: Date.parse("2026-07-20T01:02:03.000Z"),
      subject: { kind: "transaction", reference: "transaction-99" },
      transaction: { reference: "transaction-99", currency: "gbp", amountMinor: 100 },
    });
    expect(retry).toEqual(first);
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0]).toMatchObject({
      provider: "kofi",
      id: "message-42",
      amountMinor: 100,
      currency: "gbp",
      baseCurrency: "gbp",
      baseAmountMinor: 100,
      needsRate: false,
    });
  });

  it("records a verified Ko-fi payment before rejecting incomplete Academy identity", async () => {
    const db = mockSupportDb();
    const donationPayload = JSON.stringify({
      verification_token: "kofi_secret",
      message_id: "message-accounting-first",
      timestamp: "2026-07-20T01:02:03.000Z",
      type: "Donation",
      amount: "10.00",
      currency: "GBP",
    });

    const response = await fetchSupportWebhook(
      supportKofiWebhook(donationPayload),
      { KOFI_WEBHOOK_SECRET: "kofi_secret", SUPPORT_DB: db },
    );

    expect(response.status).toBe(422);
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0]).toMatchObject({
      provider: "kofi",
      id: "message-accounting-first",
      amountMinor: 1000,
      baseAmountMinor: 1000,
    });
  });

  it("converts payer currency into configured reporting currency in the correct direction", async () => {
    const db = mockSupportDb();
    const payload = JSON.stringify({
      verification_token: "kofi_secret",
      message_id: "message-eur",
      timestamp: "2026-07-20T01:02:03.000Z",
      type: "Donation",
      amount: "12.00",
      currency: "EUR",
    });
    const kv = mockKv({
      "fx:GBP:latest": JSON.stringify({
        base: "GBP",
        date: "2026-07-20",
        rates: { EUR: 2, USD: 1.5 },
      }),
    });

    const response = await fetchSupportWebhook(supportKofiWebhook(payload), {
      KOFI_WEBHOOK_SECRET: "kofi_secret",
      SUPPORT_DB: db,
      SUPPORT_KV: kv,
      SUPPORT_BASE_CURRENCY: "USD",
    });

    expect(response.status).toBe(422);
    expect(db.rows[0]).toMatchObject({
      amountMinor: 1200,
      currency: "eur",
      baseCurrency: "usd",
      baseAmountMinor: 900,
      needsRate: false,
    });
  });

  it("records an unconvertible donation with needsRate instead of hiding it", async () => {
    const db = mockSupportDb();
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const payload = JSON.stringify({
      verification_token: "kofi_secret",
      message_id: "message-no-rate",
      timestamp: new Date().toISOString(),
      type: "Donation",
      amount: "8.00",
      currency: "CAD",
    });
    const kv = mockKv({
      "fx:GBP:latest": JSON.stringify({ base: "GBP", date: "2026-07-20", rates: { USD: 1.5 } }),
    });
    const env = {
      KOFI_WEBHOOK_SECRET: "kofi_secret",
      SUPPORT_DB: db,
      SUPPORT_KV: kv,
    };

    expect((await fetchSupportWebhook(supportKofiWebhook(payload), env)).status).toBe(422);
    expect(db.rows[0]).toMatchObject({
      amountMinor: 800,
      currency: "cad",
      baseCurrency: "gbp",
      baseAmountMinor: 0,
      needsRate: true,
    });
    const status = await SupportWorker.fetch(
      new Request("https://support.yomureader.com/status"),
      env,
      { waitUntil: vi.fn() },
    );
    await expect(status.json()).resolves.toMatchObject({
      donationsThisMonthGbp: 0,
      needsRate: 1,
    });
    expect(warning).toHaveBeenCalledOnce();
    warning.mockRestore();
  });

  it("uses only Ko-fi's verified top-level email for code delivery", async () => {
    const db = mockSupportDb();
    const academy = mockDeliverableAcademy();
    const email = mockEmailBinding();
    const donationPayload = JSON.stringify({
      verification_token: "kofi_secret",
      message_id: "message-email",
      kofi_transaction_id: "transaction-email",
      timestamp: "2026-07-20T01:02:03.000Z",
      type: "Donation",
      amount: "5.00",
      currency: "GBP",
      email: "kofi-donor@example.test",
      customer: { email: "nested@example.test" },
    });
    const response = await SupportWorker.fetch(
      supportKofiWebhook(donationPayload),
      withAcademyIngress({
        KOFI_WEBHOOK_SECRET: "kofi_secret",
        SUPPORT_DB: db,
        ACADEMY_CODE_EMAIL: email,
      }, academy),
      { waitUntil: vi.fn() },
    );

    expect(response.status).toBe(200);
    expect(email.send).toHaveBeenCalledTimes(1);
    expect(email.messages[0]?.to).toBe("kofi-donor@example.test");
  });

  it("acknowledges a signed Patreon test event without granting or recording it", async () => {
    const db = mockSupportDb();
    const academy = mockAcademyIngress();
    const payload = JSON.stringify({ data: { attributes: { amount_cents: 500 } } });
    const response = await postPatreonEvent(payload, "members:create", db, academy);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true, recorded: false });
    expect(db.rows).toHaveLength(0);
    expect(academy.fetch).not.toHaveBeenCalled();
  });

  it("ignores deprecated Patreon v1 pledge events", async () => {
    const db = mockSupportDb();
    const academy = mockAcademyIngress();
    const payload = patreonMemberPayload("legacy-member", "active_patron", "2026-07-20T01:00:00.000Z");
    const response = await postPatreonEvent(payload, "pledges:create", db, academy);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true, recorded: false });
    expect(db.rows).toHaveLength(0);
    expect(academy.fetch).not.toHaveBeenCalled();
  });

  it("rejects a Patreon webhook with an invalid signature", async () => {
    const db = mockSupportDb();
    const academy = mockAcademyIngress();
    const payload = JSON.stringify({ data: { attributes: { amount_cents: 500 } } });
    await expectProviderAuthRejected(
      supportPatreonWebhook(payload, "members:pledge:create", "00000000000000000000000000000000"),
      { PATREON_WEBHOOK_SECRET: "patreon_secret", SUPPORT_DB: db },
      db,
      academy,
    );
  });

  it("forwards Patreon membership state without inventing a cash transaction", async () => {
    const db = mockSupportDb();
    const academy = mockAcademyIngress();
    const payload = JSON.stringify({
      data: {
        id: "member-123",
        attributes: {
          patron_status: "active_patron",
          currently_entitled_amount_cents: 500,
          campaign_lifetime_support_cents: 500,
          last_charge_date: "2026-07-01T00:00:00.000Z",
          next_charge_date: "2026-08-01T00:00:00.000Z",
        },
      },
    });
    const env = withAcademyIngress({
      PATREON_WEBHOOK_SECRET: "patreon_secret",
      SUPPORT_DB: db,
    }, academy);

    expect((await SupportWorker.fetch(
      await signedSupportPatreonWebhook(payload, "members:pledge:update", "patreon_secret"),
      env,
      { waitUntil: vi.fn() },
    )).status).toBe(200);
    expect((await SupportWorker.fetch(
      await signedSupportPatreonWebhook(payload, "members:pledge:update", "patreon_secret"),
      env,
      { waitUntil: vi.fn() },
    )).status).toBe(200);
    const first = await academy.requests[0]!.json() as Record<string, unknown>;
    const retry = await academy.requests[1]!.json();
    expect(first).toMatchObject({
      schemaVersion: 1,
      provider: "patreon",
      eventType: "membership.active",
      occurredAt: Date.parse("2026-07-01T00:00:00.000Z"),
      subject: { kind: "member", reference: "member-123" },
      entitlement: {
        expiresAt: Date.parse("2026-08-01T00:00:00.000Z"),
        qualifyingAmountMinor: 500,
      },
    });
    expect(first.eventId).toMatch(/^patreon_[a-f0-9]{64}$/u);
    expect(first).not.toHaveProperty("transaction");
    expect(retry).toEqual(first);
    expect(db.rows).toHaveLength(0);
  });

  it("records a signed Patreon pledge receipt exactly once across retries", async () => {
    const db = mockSupportDb();
    const academy = mockAcademyIngress();
    const payload = JSON.stringify({
      data: {
        id: "member-pledge-receipt",
        attributes: {
          patron_status: "active_patron",
          amount_cents: 500,
          campaign_lifetime_support_cents: 500,
          last_charge_date: "2026-07-20T02:00:00.000Z",
          next_charge_date: "2026-08-20T02:00:00.000Z",
        },
      },
    });

    expect((await postPatreonEvent(payload, "members:pledge:create", db, academy)).status).toBe(200);
    expect((await postPatreonEvent(payload, "members:pledge:create", db, academy)).status).toBe(200);

    expect(db.rows).toHaveLength(1);
    expect(db.rows[0]).toMatchObject({ provider: "patreon", amountMinor: 500 });
    expect(academy.fetch).toHaveBeenCalledTimes(2);
  });

  it("records Patreon income even when the entitlement envelope is incomplete", async () => {
    const db = mockSupportDb();
    const academy = mockAcademyIngress();
    const payload = JSON.stringify({
      data: {
        id: "member-accounting-first",
        attributes: {
          patron_status: "active_patron",
          amount_cents: 500,
          campaign_lifetime_support_cents: 500,
          last_charge_date: "2026-07-20T02:00:00.000Z",
        },
      },
    });

    const response = await postPatreonEvent(payload, "members:pledge:create", db, academy);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true, recorded: true });
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0]).toMatchObject({ provider: "patreon", amountMinor: 500, baseAmountMinor: 500 });
    expect(academy.fetch).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: "free trial",
      attributes: {
        currently_entitled_amount_cents: 500,
        campaign_lifetime_support_cents: 500,
        is_free_trial: true,
      },
    },
    {
      label: "future pledge without paid history",
      attributes: {
        will_pay_amount_cents: 500,
        campaign_lifetime_support_cents: 0,
        is_free_trial: false,
      },
    },
  ])("does not grant Academy access for a Patreon $label", async ({ attributes }) => {
    const db = mockSupportDb();
    const academy = mockAcademyIngress();
    const payload = JSON.stringify({
      data: {
        id: `member-${attributes.is_free_trial ? "trial" : "future"}`,
        attributes: {
          patron_status: "active_patron",
          ...attributes,
          last_charge_date: "2026-07-20T02:00:00.000Z",
          next_charge_date: "2026-08-20T02:00:00.000Z",
        },
      },
    });

    const response = await postPatreonEvent(payload, "members:pledge:create", db, academy);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true, recorded: false });
    expect(academy.fetch).not.toHaveBeenCalled();
    expect(db.rows).toHaveLength(0);
  });

  it("uses only the signed Patreon member attribute email for code delivery", async () => {
    const db = mockSupportDb();
    const academy = mockDeliverableAcademy();
    const email = mockEmailBinding();
    const payload = JSON.stringify({
      data: {
        id: "member-email",
        attributes: {
          patron_status: "active_patron",
          email: "patron@example.test",
          amount_cents: 500,
          campaign_lifetime_support_cents: 500,
          last_charge_date: "2026-07-20T02:00:00.000Z",
          next_charge_date: "2026-08-20T02:00:00.000Z",
        },
      },
      included: [{ type: "user", attributes: { email: "included@example.test" } }],
    });
    const request = await signedSupportPatreonWebhook(payload, "members:pledge:create", "patreon_secret");
    const response = await SupportWorker.fetch(request, withAcademyIngress({
      PATREON_WEBHOOK_SECRET: "patreon_secret",
      SUPPORT_DB: db,
      ACADEMY_CODE_EMAIL: email,
    }, academy), { waitUntil: vi.fn() });

    expect(response.status).toBe(200);
    expect(email.send).toHaveBeenCalledTimes(1);
    expect(email.messages[0]?.to).toBe("patron@example.test");
    await expect(academy.ingressRequests[0]!.json()).resolves.toMatchObject({
      entitlement: {
        expiresAt: Date.parse("2026-08-20T02:00:00.000Z"),
        qualifyingAmountMinor: 500,
      },
    });
  });

  it("does not use an included Patreon user email as a delivery fallback", async () => {
    const db = mockSupportDb();
    const academy = mockDeliverableAcademy();
    const email = mockEmailBinding();
    const payload = JSON.stringify({
      data: {
        id: "member-no-verified-email",
        attributes: {
          patron_status: "active_patron",
          amount_cents: 500,
          campaign_lifetime_support_cents: 500,
          last_charge_date: "2026-07-20T02:00:00.000Z",
          next_charge_date: "2026-08-20T02:00:00.000Z",
        },
      },
      included: [{ type: "user", attributes: { email: "included@example.test" } }],
    });
    const request = await signedSupportPatreonWebhook(payload, "members:pledge:create", "patreon_secret");
    const response = await SupportWorker.fetch(request, withAcademyIngress({
      PATREON_WEBHOOK_SECRET: "patreon_secret",
      SUPPORT_DB: db,
      ACADEMY_CODE_EMAIL: email,
      ACADEMY_DELIVERY_ALERT_EMAIL: "owner@example.test",
    }, academy), { waitUntil: vi.fn() });

    expect(response.status).toBe(200);
    expect(email.send).toHaveBeenCalledTimes(1);
    expect(email.messages[0]?.to).toBe("owner@example.test");
    expect(email.messages[0]?.to).not.toBe("included@example.test");
    expect(academy.state()).toBe("manual_required");
  });

  it("runs the stale-delivery detector from the scheduled handler", async () => {
    const academy = mockDeliverableAcademy({ includePendingDelivery: true });
    const email = mockEmailBinding();
    const db = mockSupportDb();
    const pending: Promise<unknown>[] = [];
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await SupportWorker.scheduled(
      { scheduledTime: Date.now(), cron: "*/15 * * * *" },
      withAcademyIngress({
        ACADEMY_CODE_EMAIL: email,
        ACADEMY_DELIVERY_ALERT_EMAIL: "owner@example.test",
        SUPPORT_DB: db,
      }, academy),
      { waitUntil: promise => pending.push(promise) },
    );
    await Promise.all(pending);

    expect(email.messages.map(message => message.subject)).toEqual([
      "よむ Academy code needs manual delivery / コードの手動送信",
    ]);
    expect(email.messages.every(message => message.to === "owner@example.test")).toBe(true);
    expect(academy.state()).toBe("manual_required");
    expect(log).toHaveBeenCalledWith(expect.stringContaining(
      '"event":"yomu_support_academy_delivery_reconciliation"',
    ));
    expect(log).toHaveBeenCalledWith(expect.stringContaining('"stale":1'));
    expect(db.counters.size).toBe(0);
    log.mockRestore();
  });

  it("reports and counts stale-delivery alert configuration failures", async () => {
    const academy = mockDeliverableAcademy({ includePendingDelivery: true });
    const db = mockSupportDb();
    const pending: Promise<unknown>[] = [];
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const scheduledTime = Date.parse("2026-07-29T10:15:00.000Z");

    await SupportWorker.scheduled(
      { scheduledTime, cron: "*/15 * * * *" },
      withAcademyIngress({ SUPPORT_DB: db }, academy),
      { waitUntil: promise => pending.push(promise) },
    );
    await Promise.all(pending);

    expect(error).toHaveBeenCalledWith(expect.stringContaining(
      '"event":"yomu_support_academy_delivery_alert_unconfigured"',
    ));
    expect(error).toHaveBeenCalledWith(expect.stringContaining(
      '"ACADEMY_DELIVERY_ALERT_EMAIL"',
    ));
    expect(error).toHaveBeenCalledWith(expect.stringContaining('"ACADEMY_CODE_EMAIL"'));
    expect(log).toHaveBeenCalledWith(expect.stringContaining('"alertConfigured":false'));

    const status = await SupportWorker.fetch(
      new Request("https://support.yomureader.com/status"),
      { SUPPORT_DB: db },
      { waitUntil: vi.fn() },
    );
    await expect(status.json()).resolves.toMatchObject({
      academyDeliveryAlert: {
        configured: false,
        configurationFailures: 1,
        lastConfigurationFailureAt: "2026-07-29T10:15:00.000Z",
      },
    });

    error.mockRestore();
    log.mockRestore();
  });

  it("forwards Patreon revocation state even when there is no cash amount to count", async () => {
    const db = mockSupportDb();
    const academy = mockAcademyIngress();
    const payload = patreonMemberPayload("member-removed", "former_patron", "2026-07-20T03:00:00.000Z");
    const response = await postPatreonEvent(payload, "members:pledge:delete", db, academy);

    await expectPatreonRevocationResponse(response, db);
    const envelope = await academy.requests[0]!.json() as Record<string, unknown>;
    expect(envelope).toMatchObject({ provider: "patreon", eventType: "membership.revoked" });
    expect(envelope).not.toHaveProperty("transaction");
    expect(envelope).not.toHaveProperty("entitlement");
  });

  it("forwards Patreon declined-member updates as revocations without recording pledge income", async () => {
    const db = mockSupportDb();
    const academy = mockAcademyIngress();
    const payload = patreonMemberPayload("member-declined", "declined_patron", "2026-07-20T04:00:00.000Z");
    const response = await postPatreonEvent(payload, "members:update", db, academy);

    await expectPatreonRevocationResponse(response, db);
    await expect(academy.requests[0]!.json()).resolves.toMatchObject({
      provider: "patreon",
      eventType: "membership.revoked",
    });
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

function mockEdgeCache({ storedCacheControl }: { storedCacheControl?: string } = {}) {
  const store = new Map<string, Response>();
  return {
    match: vi.fn(async (request: Request) => store.get(request.url)?.clone()),
    put: vi.fn(async (request: Request, response: Response) => {
      const stored = response.clone();
      if (storedCacheControl) stored.headers.set("cache-control", storedCacheControl);
      store.set(request.url, stored);
    }),
  };
}

function mockEmailBinding(
  responder: (message: {
    to: string;
    from: { email: string; name: string };
    subject: string;
    text: string;
    html: string;
  }) => Promise<unknown> = async () => undefined,
) {
  const messages: Array<{
    to: string;
    from: { email: string; name: string };
    subject: string;
    text: string;
    html: string;
  }> = [];
  return {
    messages,
    send: vi.fn(async (message: typeof messages[number]) => {
      messages.push(message);
      return responder(message);
    }),
  };
}

function mockDeliverableAcademy(options: { includePendingDelivery?: boolean } = {}) {
  const deliveryId = `paydel_${"a".repeat(40)}`;
  const leaseToken = "l".repeat(43);
  const code = "ABCD-EFGH-IJKL-MNOP";
  const ingressRequests: Request[] = [];
  const deliveryRequests: Request[] = [];
  let deliveryState: "pending" | "leased" | "retry" | "email_accepted" | "manual_required" = "pending";
  let ingressCount = 0;
  const fetch = vi.fn(async (request: Request) => {
    const path = new URL(request.url).pathname;
    if (path === "/academy/internal/payment-ingress") {
      ingressRequests.push(request.clone());
      ingressCount += 1;
      return Response.json({
        received: true,
        ...(ingressCount === 1 ? { applied: true } : { duplicate: true }),
        deliveryStatus: deliveryState,
        deliveryId,
      });
    }

    deliveryRequests.push(request.clone());
    if (path === "/academy/internal/payment-delivery-claim") {
      if (deliveryState === "email_accepted" || deliveryState === "manual_required") {
        return Response.json({ status: deliveryState, deliveryId });
      }
      if (deliveryState === "leased") {
        return Response.json({ status: "leased", deliveryId }, { status: 202 });
      }
      deliveryState = "leased";
      return Response.json({ status: "claimed", deliveryId, leaseToken, code });
    }
    if (path === "/academy/internal/payment-delivery-complete") {
      const body = await request.json() as { outcome?: unknown };
      if (
        body.outcome !== "email_accepted"
        && body.outcome !== "manual_required"
        && body.outcome !== "retry"
      ) return Response.json({ error: "bad outcome" }, { status: 422 });
      deliveryState = body.outcome;
      return Response.json({ status: deliveryState, deliveryId });
    }
    if (path === "/academy/internal/payment-delivery-pending") {
      const now = Date.now();
      const deliveries = options.includePendingDelivery && deliveryState !== "email_accepted"
        ? [{
            deliveryId,
            provider: "stripe",
            status: deliveryState === "leased" ? "leased" : deliveryState,
            attemptCount: 0,
            availableAt: now - 60 * 60_000,
            updatedAt: now - 60 * 60_000,
          }]
        : [];
      const body = await request.json() as { staleBefore: number };
      return Response.json({ staleBefore: body.staleBefore, count: deliveries.length, deliveries });
    }
    return Response.json({ error: "unexpected path" }, { status: 404 });
  });
  return {
    fetch,
    ingressRequests,
    deliveryRequests,
    code,
    state: () => deliveryState,
  };
}

function mockAcademyIngress(
  responder: (request: Request) => Response = () => Response.json({
    received: true,
    applied: true,
    deliveryStatus: "redeemed",
  }),
) {
  const requests: Request[] = [];
  return {
    requests,
    fetch: vi.fn(async (request: Request) => {
      requests.push(request.clone());
      return responder(request);
    }),
  };
}

function withAcademyIngress<T extends object, A extends { fetch(request: Request): Promise<Response> }>(
  env: T,
  academy: A,
) {
  return {
    ...env,
    ACADEMY_PAYMENT_INGRESS: academy,
    PAYMENT_INGRESS_TOKEN: "ingress-secret",
  };
}

function fetchWithAcademyIngress<T extends object>(
  request: Request,
  env: T,
  academy: ReturnType<typeof mockAcademyIngress>,
): Promise<Response> {
  return SupportWorker.fetch(request, withAcademyIngress(env, academy), { waitUntil: vi.fn() });
}

async function postStripeCheckoutEvent(
  input: Parameters<typeof stripeCheckoutEventPayload>[0],
  db: ReturnType<typeof mockSupportDb>,
  academy: ReturnType<typeof mockAcademyIngress>,
): Promise<Response> {
  const payload = stripeCheckoutEventPayload(input);
  const request = await signedSupportStripeWebhook(payload, "whsec_test", input.timestamp);
  return fetchWithAcademyIngress(request, { STRIPE_WEBHOOK_SECRET: "whsec_test", SUPPORT_DB: db }, academy);
}

function expectWebhookOutcome(
  response: Response,
  db: ReturnType<typeof mockSupportDb>,
  academy: ReturnType<typeof mockAcademyIngress>,
  status: number,
  rowCount: number,
): void {
  expect(response.status).toBe(status);
  expect(db.rows).toHaveLength(rowCount);
  expect(academy.fetch).toHaveBeenCalledTimes(1);
}

async function expectPatreonRevocationResponse(
  response: Response,
  db: ReturnType<typeof mockSupportDb>,
): Promise<void> {
  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({ received: true, recorded: false });
  expect(db.rows).toHaveLength(0);
}

function fetchSupportWebhook<T extends object>(request: Request, env: T): Promise<Response> {
  return SupportWorker.fetch(request, env, { waitUntil: vi.fn() });
}

async function expectProviderAuthRejected<T extends object>(
  request: Request,
  env: T,
  db: ReturnType<typeof mockSupportDb>,
  academy: ReturnType<typeof mockAcademyIngress>,
): Promise<void> {
  const response = await fetchWithAcademyIngress(request, env, academy);
  expect(response.status).toBe(401);
  expect(db.rows).toHaveLength(0);
  expect(academy.fetch).not.toHaveBeenCalled();
}

function stripeCheckoutEventPayload(input: {
  eventId: string;
  sessionId: string;
  timestamp: number;
  purchaseId?: string;
  amountMinor?: number;
  currency?: string;
  eventLivemode?: boolean;
  supportService?: string | null;
  customerDetailsEmail?: string;
  customerEmail?: string;
}): string {
  const metadata = {
    ...(input.supportService === null ? {} : { yomu_service: input.supportService ?? "support" }),
    ...(input.purchaseId ? { yomu_academy_purchase: input.purchaseId } : {}),
  };
  return JSON.stringify({
    id: input.eventId,
    type: "checkout.session.completed",
    livemode: input.eventLivemode ?? true,
    created: input.timestamp,
    data: {
      object: {
        id: input.sessionId,
        amount_total: input.amountMinor ?? 500,
        currency: input.currency ?? "gbp",
        payment_status: "paid",
        ...(input.customerDetailsEmail === undefined
          ? {}
          : { customer_details: { email: input.customerDetailsEmail } }),
        ...(input.customerEmail === undefined ? {} : { customer_email: input.customerEmail }),
        ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
      },
    },
  });
}

async function signedSupportStripeWebhook(payload: string, secret: string, timestamp: number): Promise<Request> {
  return new Request("https://support.yomureader.com/stripe/webhook", {
    method: "POST",
    headers: { "stripe-signature": await stripeSignatureHeader(payload, secret, timestamp) },
    body: payload,
  });
}

function supportKofiWebhook(payload: string): Request {
  return new Request("https://support.yomureader.com/webhooks/kofi", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ data: payload }).toString(),
  });
}

function supportPatreonWebhook(payload: string, trigger: string, signature: string): Request {
  return new Request("https://support.yomureader.com/webhooks/patreon", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-patreon-event": trigger,
      "x-patreon-signature": signature,
    },
    body: payload,
  });
}

async function signedSupportPatreonWebhook(payload: string, trigger: string, secret: string): Promise<Request> {
  return supportPatreonWebhook(payload, trigger, await patreonSignature(payload, secret));
}

async function postPatreonEvent(
  payload: string,
  trigger: string,
  db: ReturnType<typeof mockSupportDb>,
  academy: ReturnType<typeof mockAcademyIngress>,
): Promise<Response> {
  const request = await signedSupportPatreonWebhook(payload, trigger, "patreon_secret");
  return fetchWithAcademyIngress(request, { PATREON_WEBHOOK_SECRET: "patreon_secret", SUPPORT_DB: db }, academy);
}

function patreonMemberPayload(id: string, status: string, updatedAt: string): string {
  return JSON.stringify({
    data: {
      id,
      attributes: {
        patron_status: status,
        updated_at: updatedAt,
        currently_entitled_amount_cents: 500,
      },
    },
  });
}

type DonationRow = {
  provider: "stripe" | "kofi" | "patreon";
  id: string;
  day: string;
  amountMinor: number;
  currency: string;
  baseCurrency?: string;
  baseAmountMinor?: number;
  needsRate?: boolean;
  eventType: string;
  occurredAt?: number;
  stripeSessionId?: string;
  stripeCreatedAt?: number;
  receivedAt: string;
};

function stripeDonationRow(id: string, day: string, amountMinor: number, currency: string): DonationRow {
  return {
    provider: "stripe",
    id,
    day,
    amountMinor,
    currency,
    eventType: "checkout.session.completed",
    stripeSessionId: `cs_live_${id}`,
    stripeCreatedAt: Math.floor(Date.now() / 1000),
    receivedAt: new Date().toISOString(),
  };
}

function mockSupportDb(initialRows: DonationRow[] = []) {
  const rows = [...initialRows];
  const counters = new Map<string, { value: number; updatedAt: string }>();
  return {
    rows,
    counters,
    prepare(query: string) {
      let values: unknown[] = [];
      return {
        bind(...bound: unknown[]) {
          values = bound;
          return this;
        },
        async first<T>() {
          if (/FROM support_observability_counters/.test(query)) {
            const counter = counters.get(String(values[0] ?? ""));
            return (counter
              ? { value: counter.value, updated_at: counter.updatedAt }
              : null) as T | null;
          }
          if (/SUM\((?:amount_minor|base_amount_minor)\)/.test(query)) {
            const providerEvents = /FROM provider_donation_events/.test(query);
            const provider = providerEvents ? String(values[0] ?? "") : "stripe";
            const dayOffset = providerEvents ? 1 : 0;
            if (/day >= \? AND day < \?/.test(query)) {
              const start = String(values[dayOffset] ?? "");
              const end = String(values[dayOffset + 1] ?? "");
              const currency = String(values[dayOffset + 2] ?? "gbp");
              const matching = rows
                .filter(row => row.provider === provider && row.day >= start && row.day < end)
                .filter(row => providerEvents
                  ? (row.baseCurrency ?? row.currency) === currency
                  : row.currency === currency)
                .filter(row => providerEvents || !/stripe_session_id LIKE 'cs_live_%'/u.test(query) || row.stripeSessionId?.startsWith("cs_live_"))
              const total_minor = matching.reduce(
                (sum, row) => sum + (providerEvents ? (row.baseAmountMinor ?? row.amountMinor) : row.amountMinor),
                0,
              );
              const needs_rate = matching.filter(row => row.needsRate).length;
              return { total_minor, needs_rate, donation_count: matching.length } as T;
            }
            const day = String(values[dayOffset] ?? "");
            const currency = String(values[dayOffset + 1] ?? "gbp");
            const matching = rows
              .filter(row => row.provider === provider && row.day === day)
              .filter(row => providerEvents
                ? (row.baseCurrency ?? row.currency) === currency
                : row.currency === currency)
              .filter(row => providerEvents || !/stripe_session_id LIKE 'cs_live_%'/u.test(query) || row.stripeSessionId?.startsWith("cs_live_"))
            const total_minor = matching.reduce(
              (sum, row) => sum + (providerEvents ? (row.baseAmountMinor ?? row.amountMinor) : row.amountMinor),
              0,
            );
            return { total_minor, donation_count: matching.length } as T;
          }
          return null;
        },
        async run() {
          if (/INSERT INTO support_observability_counters/.test(query)) {
            const name = String(values[0] ?? "");
            const updatedAt = String(values[1] ?? "");
            counters.set(name, {
              value: (counters.get(name)?.value ?? 0) + 1,
              updatedAt,
            });
          }
          insertStripeDonationRow(query, values, rows);
          insertProviderDonationRow(query, values, rows);
          return { success: true };
        },
      };
    },
  };
}

function insertStripeDonationRow(query: string, values: unknown[], rows: DonationRow[]): void {
  if (!/INSERT OR IGNORE INTO donation_events/.test(query)) return;
  const id = stringValue(values, 0);
  if (rows.some(row => row.provider === "stripe" && row.id === id)) return;
  rows.push({
    provider: "stripe",
    id,
    day: stringValue(values, 1),
    amountMinor: numberValue(values, 2),
    currency: stringValue(values, 3),
    eventType: stringValue(values, 4),
    stripeSessionId: stringValue(values, 5),
    stripeCreatedAt: numberValue(values, 6),
    receivedAt: stringValue(values, 7),
  });
}

function insertProviderDonationRow(query: string, values: unknown[], rows: DonationRow[]): void {
  if (!/INSERT OR IGNORE INTO provider_donation_events/.test(query)) return;
  const provider = stringValue(values, 0) as "kofi" | "patreon";
  const id = stringValue(values, 1);
  if (rows.some(row => row.provider === provider && row.id === id)) return;
  rows.push(providerDonationRow(provider, id, stringValue(values, 2), numberValue(values, 3), {
    currency: stringValue(values, 4),
    baseCurrency: stringValue(values, 5),
    baseAmountMinor: numberValue(values, 6),
    needsRate: numberValue(values, 7) === 1,
    eventType: stringValue(values, 8),
    occurredAt: numberValue(values, 9),
    receivedAt: stringValue(values, 10),
  }));
}

function stringValue(values: unknown[], index: number): string {
  return String(values[index] ?? "");
}

function numberValue(values: unknown[], index: number): number {
  return Number(values[index] ?? 0);
}

function providerDonationRow(
  provider: "kofi" | "patreon",
  id: string,
  day: string,
  amountMinor: number,
  overrides: Partial<DonationRow> = {},
): DonationRow {
  return {
    provider,
    id,
    day,
    amountMinor,
    currency: "gbp",
    baseCurrency: "gbp",
    baseAmountMinor: amountMinor,
    needsRate: false,
    eventType: "donation",
    receivedAt: new Date().toISOString(),
    ...overrides,
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
