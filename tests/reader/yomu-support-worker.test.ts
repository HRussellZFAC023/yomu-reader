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
      donationGoalGbp: number;
      donateUrl: string;
      banner: { enabled: boolean; message: string; goalLabel: string };
      STRIPE_SECRET_KEY?: string;
    };
    expect(body.status).toBe("stripe-unconfigured");
    expect(body.dailyBudgetGbp).toBe(10);
    expect(body.donationsTodayGbp).toBe(3.5);
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
});
