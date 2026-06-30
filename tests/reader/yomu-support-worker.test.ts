import { afterEach, describe, expect, it, vi } from "vitest";
import SupportWorker from "../../workers/yomu-support/src/index";

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
        SUPPORT_DONATION_GOAL_GBP: "10",
        SUPPORT_DONATIONS_TODAY_GBP: "3.5",
      },
      { waitUntil: vi.fn() },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://yomureader.com");
    const body = await response.json() as {
      status: string;
      dailyBudgetGbp: number;
      donationsTodayGbp: number;
      donationsSource: string;
      donationGoalGbp: number;
      donateUrl: string;
      banner: { enabled: boolean; message: string; goalLabel: string };
      STRIPE_SECRET_KEY?: string;
    };
    expect(body.status).toBe("stripe-unconfigured");
    expect(body.dailyBudgetGbp).toBe(10);
    expect(body.donationsTodayGbp).toBe(3.5);
    expect(body.donationsSource).toBe("env");
    expect(body.donationGoalGbp).toBe(10);
    expect(body.donateUrl).toBe("https://support.yomureader.com/donate");
    expect(body.banner.enabled).toBe(true);
    expect(body.banner.goalLabel).toContain("£3.50 / £10");
    expect(body.banner.message).toContain("donation funded");
    expect(body.STRIPE_SECRET_KEY).toBeUndefined();
  });

  it("redirects donation requests to fallback when Stripe is not configured", async () => {
    const response = await SupportWorker.fetch(
      new Request("https://support.yomureader.com/donate"),
      { SUPPORT_FALLBACK_DONATE_URL: "https://paypal.me/HenryRussell163" },
      { waitUntil: vi.fn() },
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://paypal.me/HenryRussell163");
  });

  it("creates Stripe Checkout sessions server-side and redirects to Stripe", async () => {
    const stripeFetch = vi.fn(async (_url: string, init: RequestInit) => {
      expect(init.method).toBe("POST");
      expect(new Headers(init.headers).get("authorization")).toBe("Bearer sk_test_secret");
      const body = init.body as URLSearchParams;
      expect(body.get("mode")).toBe("payment");
      expect(body.get("submit_type")).toBe("donate");
      expect(body.get("line_items[0][price_data][unit_amount]")).toBe("750");
      return Response.json({ url: "https://checkout.stripe.com/c/session" });
    });
    vi.stubGlobal("fetch", stripeFetch);

    const response = await SupportWorker.fetch(
      new Request("https://support.yomureader.com/donate?amount_gbp=7.5"),
      { STRIPE_SECRET_KEY: "sk_test_secret" },
      { waitUntil: vi.fn() },
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://checkout.stripe.com/c/session");
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
});

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
